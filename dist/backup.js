(() => {
  'use strict';

  const maxFileSize = 10 * 1024 * 1024;
  const maxBalance = 99999999999.99;
  const maxItems = 5000;
  const maxSnapshots = 36600;
  const types = new Set(['现金存款', '投资资产', '固定资产', '其他资产', '负债']);
  const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });

  function check(condition, message) {
    if (!condition) throw new Error(message);
  }

  function record(value) {
    check(value !== null && typeof value === 'object' && !Array.isArray(value), '备份记录结构有误。');
    return value;
  }

  function shortText(value, allowEmpty = false) {
    check(typeof value === 'string' && value.length <= 64 && (allowEmpty || value.trim().length > 0), '备份包含无效名称。');
    return value;
  }

  function amount(value, { min = 0, max = maxBalance } = {}) {
    check(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max, '备份包含无效金额。');
    const cents = Math.round(value * 100);
    check(Number.isSafeInteger(cents) &&
      Math.abs(value - cents / 100) <= Math.max(.000001, Math.abs(value) * Number.EPSILON),
      '备份包含无效金额。');
    return cents / 100;
  }

  function calendarDate(value) {
    check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      new Date(value + 'T00:00:00.000Z').toJSON()?.slice(0, 10) === value, '备份包含无效日期。');
    return value;
  }

  function timestamp(value) {
    check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value),
      '备份包含无效时间。');
    calendarDate(value.slice(0, 10));
    return new Date(value).toISOString();
  }

  function itemId(value) {
    check(typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value), '备份包含无效记录编号。');
    return value;
  }

  function list(values, normalize, key, max = maxItems) {
    check(Array.isArray(values) && values.length <= max, '备份列表有误或记录过多。');
    const seen = new Set();
    return values.map(value => {
      const item = normalize(record(value));
      check(!seen.has(item[key]), '备份包含重复记录。');
      seen.add(item[key]);
      return item;
    });
  }

  function position(value) {
    check(types.has(value.type), '备份包含未知账户类型。');
    return { id: itemId(value.id), name: shortText(value.name), type: value.type, balance: amount(value.balance) };
  }

  function account(value) {
    const item = { ...position(value), bank: shortText(value.bank ?? '', true) };
    if (value.updatedAt != null) item.updatedAt = timestamp(value.updatedAt);
    return item;
  }

  function goal(value) {
    return {
      id: itemId(value.id), name: shortText(value.name),
      target: amount(value.target, { min: .01 }), saved: amount(value.saved)
    };
  }

  function positionSnapshot(value) {
    const maxNet = maxItems * maxBalance;
    const entry = { net: amount(value.net, { min: -maxNet, max: maxNet }) };
    if (value.accounts !== undefined) {
      entry.accounts = list(value.accounts, position, 'id');
      const balance = entry.accounts.reduce((sum, item) => {
        const cents = Math.round(item.balance * 100);
        return sum + (item.type === '负债' ? -cents : cents);
      }, 0);
      check(balance === Math.round(entry.net * 100), '备份内的历史余额和净资产总额不一致。');
    }
    return entry;
  }

  function snapshot(value) {
    const entry = { date: calendarDate(value.date), ...positionSnapshot(value) };
    if (value.opening !== undefined) {
      entry.opening = positionSnapshot(record(value.opening));
      check(Array.isArray(entry.opening.accounts), '备份缺少期初账户明细。');
    }
    return entry;
  }

  function readBackup(source) {
    let value;
    try { value = JSON.parse(source); }
    catch { throw new Error('此文件无法读取，请选择 MONO 导出的 JSON 备份。'); }
    const backup = record(value);
    check(backup.format === 'mono-backup', '请选择 MONO 导出的备份文件。');
    check(backup.version === 1, '当前版本无法读取此备份格式。');
    const { accounts, goals, hidden, edited, personal, snapshots } = record(backup.data);
    check([hidden, edited, personal].every(flag => typeof flag === 'boolean'), '备份缺少有效的空间设置。');
    return {
      exportedAt: timestamp(backup.exportedAt),
      data: {
        accounts: list(accounts, account, 'id'),
        goals: list(goals, goal, 'id'),
        hidden, edited, personal,
        snapshots: list(snapshots, snapshot, 'date', maxSnapshots).sort((a, b) => a.date.localeCompare(b.date))
      }
    };
  }

  function element(tag, className, label) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (label) node.textContent = label;
    return node;
  }

  function button(label, className, action) {
    const node = element('button', className, label);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }

  function showDialog(title, description) {
    const profile = document.getElementById('profileBtn');
    const dialog = element('dialog', 'mp-dialog mono-backup-dialog');
    const heading = element('h2', '', title);
    heading.id = 'mono-backup-title';
    dialog.setAttribute('aria-labelledby', heading.id);
    const explanation = element('p', 'mono-backup-description', description);
    explanation.id = 'mono-backup-description';
    dialog.setAttribute('aria-describedby', explanation.id);
    const close = button('×', 'mp-close', () => dialog.close());
    close.setAttribute('aria-label', '关闭');
    close.autofocus = true;
    const header = element('div', 'mp-dialog-head');
    header.append(heading, close);
    const body = element('div', 'mono-backup-body');
    const feedback = element('p', 'mp-feedback');
    feedback.setAttribute('role', 'alert');
    const actions = element('div', 'mp-actions');
    dialog.append(header, explanation, body, feedback, actions);
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (profile?.isConnected) profile.focus();
    }, { once: true });
    if (profile?.getAttribute('aria-expanded') === 'true') profile.click();
    document.body.append(dialog);
    return { dialog, heading, explanation, body, feedback, actions };
  }

  function downloadFile(file) {
    const url = URL.createObjectURL(file);
    const link = element('a');
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    try { link.click(); }
    finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  }

  function exportBackup() {
    if (document.querySelector('dialog[open]')) return;
    const { dialog, feedback, actions } = showDialog('导出备份', '备份文件包含资产金额，请妥善保管。');
    try {
      const backup = window.mono.exportBackup();
      const slug = backup.exportedAt.slice(0, 19).replace(/:/g, '-').replace('T', '_');
      const file = new File([JSON.stringify(backup)], 'MONO-' + slug + '.json', { type: 'application/json' });
      check(file.size <= maxFileSize, '备份大于可恢复的文件大小。');
      const download = () => {
        try {
          downloadFile(file);
          dialog.close();
        } catch {
          feedback.textContent = '暂时无法下载，请重试。';
        }
      };
      let canShareFile = false;
      try { canShareFile = typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] }); }
      catch {}
      if (canShareFile) {
        actions.append(button('下载文件', 'mp-secondary', download));
        let sharing = false;
        actions.append(button('分享或存储', 'mp-primary', async () => {
          if (sharing) return;
          sharing = true;
          feedback.textContent = '';
          try {
            await navigator.share({ files: [file] });
            if (dialog.open) dialog.close();
          } catch (error) {
            if (error.name !== 'AbortError') feedback.textContent = '无法打开共享菜单。请使用「下载文件」。';
          } finally {
            sharing = false;
          }
        }));
      } else {
        actions.append(button('下载备份', 'mp-primary', download));
      }
    } catch (error) {
      feedback.textContent = error.message || '暂时无法导出备份。';
    }
    dialog.showModal();
  }

  function showPreview(container, backup) {
    const details = element('dl', 'mono-backup-summary');
    const rows = [
      ['备份时间', dateFormat.format(new Date(backup.exportedAt))],
      ['空间', backup.data.personal ? '个人资产' : '示例数据'],
      ['资产账户', String(backup.data.accounts.length)],
      ['财富目标', String(backup.data.goals.length)]
    ];
    for (const [label, value] of rows) {
      details.append(element('dt', '', label), element('dd', '', value));
    }
    container.replaceChildren(details, element('p', 'mono-backup-description', '确认后，备份将替换当前浏览器中的资产记录和财富目标。'));
  }

  function restoreBackup() {
    if (document.querySelector('dialog[open]')) return;
    const { dialog, heading, explanation, body, feedback, actions } = showDialog('恢复备份', '选择 MONO 导出的 JSON 备份文件。');
    const picker = element('label', 'mp-secondary mono-backup-picker', '选择备份文件');
    const input = element('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    picker.append(input);
    const preview = element('div', 'mono-backup-preview');
    preview.setAttribute('aria-live', 'polite');
    body.append(picker, preview);
    let selection = 0;
    let pending;
    const confirm = button('确认替换并恢复', 'mp-primary', () => {
      if (!pending) return;
      const result = window.mono.restoreBackup(pending.data);
      if (!result.ok) {
        feedback.textContent = result.message || '备份恢复失败，请重试。';
        return;
      }
      pending = null;
      selection++;
      heading.textContent = '恢复完成';
      explanation.textContent = '备份已恢复到当前浏览器。';
      feedback.textContent = '';
      body.replaceChildren();
      const done = button('完成', 'mp-primary', () => dialog.close());
      actions.replaceChildren(done);
      done.focus();
    });
    confirm.hidden = true;
    actions.append(button('取消', 'mp-secondary', () => dialog.close()), confirm);
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const request = ++selection;
      input.value = '';
      pending = null;
      preview.replaceChildren();
      feedback.textContent = '';
      confirm.hidden = true;
      try {
        check(file.size <= maxFileSize, '备份文件过大，请选择 10 MB 以内的 JSON 文件。');
        const backup = readBackup(await file.text());
        if (request !== selection || !dialog.open) return;
        showPreview(preview, backup);
        pending = backup;
        confirm.hidden = false;
      } catch (error) {
        if (request === selection && dialog.open) feedback.textContent = error.message || '读取备份失败。';
      }
    });
    dialog.showModal();
  }

  document.getElementById('exportBackup')?.addEventListener('click', exportBackup);
  document.getElementById('restoreBackup')?.addEventListener('click', restoreBackup);
})();
