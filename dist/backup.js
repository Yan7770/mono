(() => {
  'use strict';

  const maxBalance = 99999999999.99;
  const types = new Set(['现金存款', '投资资产', '固定资产', '其他资产', '负债']);
  const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long', timeStyle: 'medium' });
  const localTime = value => dateFormat.format(new Date(value));

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

  function list(values, normalize, key) {
    check(Array.isArray(values), '备份列表格式有误。');
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
    const maxNet = Number.MAX_SAFE_INTEGER / 100;
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

  function transaction(value) {
    const type = value.type === 'income' ? 'income' : 'expense';
    const source = value.source === 'image' ? 'image' : 'manual';
    const item = {
      id: itemId(value.id),
      date: calendarDate(value.date),
      type,
      amount: amount(value.amount, { min: .01 }),
      title: shortText(value.title),
      accountId: itemId(String(value.accountId)),
      accountName: shortText(value.accountName ?? '', true),
      source,
      createdAt: timestamp(value.createdAt)
    };
    if (value.note != null) item.note = shortText(String(value.note), true);
    return item;
  }

  function holding(value) {
    const market = ['sh', 'sz', 'bj'].includes(value.market) ? value.market : 'sh';
    check(typeof value.code === 'string' && /^\d{6}$/.test(value.code), '备份包含无效股票代码。');
    const shares = Number(value.shares);
    check(Number.isFinite(shares) && shares > 0 && shares <= 999999999, '备份包含无效持仓股数。');
    const item = {
      id: itemId(value.id),
      code: value.code,
      market,
      name: shortText(value.name),
      shares: Math.round(shares * 10000) / 10000,
      costPrice: value.costPrice == null || value.costPrice === '' ? null : Number(value.costPrice),
      lastPrice: Number.isFinite(Number(value.lastPrice)) && Number(value.lastPrice) >= 0 ? Number(value.lastPrice) : 0,
      prevClose: Number.isFinite(Number(value.prevClose)) && Number(value.prevClose) >= 0 ? Number(value.prevClose) : 0,
      change: Number.isFinite(Number(value.change)) ? Number(value.change) : 0,
      changePct: Number.isFinite(Number(value.changePct)) ? Number(value.changePct) : 0,
      quoteDate: typeof value.quoteDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.quoteDate) ? value.quoteDate : '',
      quoteTime: typeof value.quoteTime === 'string' ? value.quoteTime.slice(0, 16) : ''
    };
    if (value.updatedAt != null) item.updatedAt = timestamp(value.updatedAt);
    return item;
  }

  function normalizeInvestments(value) {
    if (!value || typeof value !== 'object') {
      return { accountId: null, holdings: [], holdingsTimeline: [], lastSettledDate: null, lastSyncAt: null, settlements: [] };
    }
    const holdings = Array.isArray(value.holdings) ? list(value.holdings, holding, 'id') : [];
    const holdingsTimeline = Array.isArray(value.holdingsTimeline)
      ? value.holdingsTimeline
        .filter(e => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && Array.isArray(e.positions))
        .map(e => ({
          date: e.date,
          positions: e.positions
            .filter(p => p && /^\d{6}$/.test(String(p.code || '')) && Number(p.shares) > 0)
            .map(p => ({
              symbol: String(p.symbol || ((p.market || 'sh') + p.code)),
              code: String(p.code),
              market: ['sh', 'sz', 'bj'].includes(p.market) ? p.market : 'sh',
              shares: Math.round(Number(p.shares) * 10000) / 10000
            }))
        }))
      : [];
    const settlements = Array.isArray(value.settlements)
      ? value.settlements
        .filter(s => s && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && Number.isFinite(Number(s.marketValue)))
        .slice(0, 90)
        .map(s => ({
          date: s.date,
          marketValue: Math.round(Number(s.marketValue) * 100) / 100,
          dayPnl: Number.isFinite(Number(s.dayPnl)) ? Math.round(Number(s.dayPnl) * 100) / 100 : 0,
          dayPnlPct: Number.isFinite(Number(s.dayPnlPct)) ? Math.round(Number(s.dayPnlPct) * 100) / 100 : 0,
          settledAt: typeof s.settledAt === 'string' ? s.settledAt : new Date().toISOString(),
          backfilled: Boolean(s.backfilled)
        }))
      : [];
    return {
      accountId: value.accountId ? itemId(String(value.accountId)) : null,
      holdings,
      holdingsTimeline,
      lastSettledDate: value.lastSettledDate ? calendarDate(value.lastSettledDate) : null,
      lastSyncAt: value.lastSyncAt ? timestamp(value.lastSyncAt) : null,
      settlements
    };
  }

  function readBackup(value) {
    const backup = record(value);
    check(backup.version === 1 || backup.version === 2, '当前版本无法读取此备份格式。');
    const { accounts, goals, hidden, edited, personal, snapshots, transactions, investments } = record(backup.data);
    check([hidden, edited, personal].every(flag => typeof flag === 'boolean'), '备份缺少有效的空间设置。');
    return {
      version: 2,
      createdAt: timestamp(backup.createdAt),
      data: {
        accounts: list(accounts, account, 'id'),
        goals: list(goals, goal, 'id'),
        hidden, edited, personal,
        snapshots: list(snapshots, snapshot, 'date').sort((a, b) => a.date.localeCompare(b.date)),
        transactions: Array.isArray(transactions) ? list(transactions, transaction, 'id') : [],
        investments: normalizeInvestments(investments)
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
    const closeSheet = () => {
      if (window.MonoMotion?.closeDialog) window.MonoMotion.closeDialog(dialog);
      else dialog.close();
    };
    const close = button('×', 'mp-close', closeSheet);
    close.setAttribute('aria-label', '关闭');
    close.autofocus = true;
    const header = element('div', 'mp-dialog-head');
    header.append(heading, close);
    const body = element('div', 'mono-backup-body');
    const feedback = element('p', 'mp-feedback');
    feedback.setAttribute('role', 'alert');
    const actions = element('div', 'mp-actions');
    dialog.append(header, explanation, body, feedback, actions);
    window.MonoMotion?.bindDialogEscape(dialog);
    dialog.addEventListener('click', event => {
      if (event.target === dialog) closeSheet();
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (profile?.isConnected) profile.focus();
    }, { once: true });
    if (profile?.getAttribute('aria-expanded') === 'true') profile.click();
    document.body.append(dialog);
    return { dialog, heading, explanation, body, feedback, actions, closeSheet };
  }

  function finish(view, title, description) {
    view.heading.textContent = title;
    view.explanation.textContent = description;
    view.body.replaceChildren();
    view.feedback.textContent = '';
    view.actions.replaceChildren(button('完成', 'mp-primary', () => view.closeSheet()));
    view.actions.firstChild.focus();
  }

  function storageError(error, fallback) {
    if (error.name === 'QuotaExceededError') return '本地存储空间不足，未能保存这次备份。';
    if (error.name === 'SecurityError') return '浏览器限制了本地存储，请检查网站的存储权限。';
    return error instanceof Error && error.name === 'Error' ? error.message : fallback;
  }

  async function createBackup() {
    if (document.querySelector('dialog[open]')) return;
    const view = showDialog('本地备份', '正在保存当前数据…');
    view.dialog.showModal();
    try {
      const backup = readBackup(window.mono.captureBackup());
      await window.MonoBackupStore.save(backup);
      if (view.dialog.open) finish(view, '备份完成', localTime(backup.createdAt) + ' 已保存。当前浏览器保留最近三份备份。');
    } catch (error) {
      if (!view.dialog.open) return;
      view.heading.textContent = '备份失败';
      view.explanation.textContent = storageError(error, '无法写入本地备份，请检查浏览器存储后重试。');
      view.actions.append(button('关闭', 'mp-secondary', () => view.closeSheet()));
    }
  }

  async function restoreBackup() {
    if (document.querySelector('dialog[open]')) return;
    const view = showDialog('恢复备份', '正在读取本地备份…');
    const { dialog, heading, explanation, body, feedback, actions } = view;
    dialog.showModal();

    function choose(entry) {
      heading.textContent = '恢复这份备份？';
      explanation.textContent = '恢复后，当前账户、财富目标、历史记录和金额显示设置将被替换。';
      const details = element('dl', 'mono-backup-summary');
      const rows = [
        ['备份时间', localTime(entry.createdAt)],
        ['备份记录', '第 ' + entry.id + ' 次'],
        ['资产空间', entry.personal ? '个人资产' : '体验空间'],
        ['资产账户', String(entry.accountCount)],
        ['A 股持仓', String(entry.holdingCount || 0)],
        ['收支流水', String(entry.txCount || 0)],
        ['财富目标', String(entry.goalCount)]
      ];
      for (const [label, value] of rows) details.append(element('dt', '', label), element('dd', '', value));
      body.replaceChildren(details);
      feedback.textContent = '';
      const back = button('返回列表', 'mp-secondary', showList);
      const confirm = button('确认恢复', 'mp-primary', async () => {
        back.disabled = confirm.disabled = true;
        feedback.textContent = '';
        try {
          const value = await window.MonoBackupStore.get(entry.id);
          if (!dialog.open) return;
          check(value, '这份备份已移出最近三份，请返回列表重新选择。');
          const backup = readBackup(value);
          const result = window.mono.restoreBackup(backup.data);
          check(result.ok, result.message || '恢复失败，请重试。');
          finish(view, '恢复完成', '已恢复 ' + localTime(backup.createdAt) + ' 的备份。');
        } catch (error) {
          if (dialog.open) feedback.textContent = storageError(error, '无法恢复这份本地备份，请重试。');
        } finally {
          back.disabled = confirm.disabled = false;
        }
      });
      actions.replaceChildren(back, confirm);
      back.focus();
    }

    async function showList() {
      heading.textContent = '恢复备份';
      explanation.textContent = '正在读取本地备份…';
      body.replaceChildren();
      feedback.textContent = '';
      actions.replaceChildren(button('取消', 'mp-secondary', () => view.closeSheet()));
      try {
        const entries = await window.MonoBackupStore.list();
        if (!dialog.open) return;
        explanation.textContent = entries.length
          ? '请选择要恢复的备份，最近的排在最前。'
          : '暂无本地备份。在「个人空间」点击「本地备份」即可保存第一份。';
        for (const entry of entries) {
          const row = button('', 'mono-backup-entry', () => choose(entry));
          const time = element('time', '', localTime(entry.createdAt));
          time.dateTime = entry.createdAt;
          const summary = '第 ' + entry.id + ' 次 · ' + entry.accountCount + ' 个账户 · ' + entry.goalCount + ' 个目标';
          row.append(time, element('small', '', summary));
          body.append(row);
        }
        (body.firstChild || actions.firstChild).focus();
      } catch (error) {
        if (dialog.open) explanation.textContent = storageError(error, '无法读取本地备份，请检查浏览器存储后重试。');
      }
    }

    await showList();
  }

  document.getElementById('localBackup').addEventListener('click', createBackup);
  document.getElementById('restoreBackup').addEventListener('click', restoreBackup);
})();
