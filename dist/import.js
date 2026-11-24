(() => {
  'use strict';

  const LAST_ACCOUNT_KEY = 'mono.import.lastAccount';
  const maxBalance = 99999999999.99;

  const BANK_ALIASES = [
    ['招行', '招商'], ['工行', '工商'], ['建行', '建设'], ['农行', '农业'],
    ['中行', '中国银行'], ['交行', '交通'], ['邮储', '邮政'], ['浦发', '浦东发展'],
    ['中信', '中信'], ['平安', '平安'], ['兴业', '兴业'], ['民生', '民生'],
    ['光大', '光大'], ['广发', '广发'], ['华夏', '华夏'],
    ['微信', '微信', '零钱', '财付通'], ['支付宝', '支付宝', '余额宝', '花呗'],
    ['信用卡', '信用卡', '贷记卡', '花呗', '白条']
  ];

  const iconSvg = {
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M4 16v2a2 2 0 0 0 2 2h2M16 20h2a2 2 0 0 0 2-2v-2"/><path d="M7 12h10"/>',
    camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.2-1.8A1.5 1.5 0 0 1 11 3.5h2a1.5 1.5 0 0 1 1.3.7L15.5 6h2A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5Z"/><circle cx="12" cy="13" r="3.4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.82-.33 1.7 1.7 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.51 1.7 1.7 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .33-1.82 1.7 1.7 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.51-1 1.7 1.7 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.82.33H9a1.7 1.7 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.51 1.7 1.7 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.33 1.82V9a1.7 1.7 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/>'
  };

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const icon = (name) => {
    const span = el('span', 'mp-icon');
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconSvg[name] || ''}</svg>`;
    return span;
  };

  const money = (value) => {
    const formatted = String(window.mono.money(value));
    return window.mono.hidden || /^[¥￥]/.test(formatted) ? formatted : '¥' + formatted;
  };

  function closeSheet(dialog) {
    if (window.MonoMotion?.closeDialog) window.MonoMotion.closeDialog(dialog);
    else dialog.close();
  }

  function openSheet(dialog) {
    const opener = document.activeElement;
    const viewport = window.visualViewport;
    function fitSheet() {
      dialog.style.setProperty('--mp-viewport-height', viewport.height + 'px');
      const bottom = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      dialog.style.setProperty('--mp-viewport-bottom', bottom + 'px');
    }
    window.MonoMotion?.bindDialogEscape(dialog);
    dialog.addEventListener('click', event => {
      if (event.target === dialog) closeSheet(dialog);
    });
    dialog.addEventListener('close', () => {
      viewport?.removeEventListener('resize', fitSheet);
      viewport?.removeEventListener('scroll', fitSheet);
      dialog.remove();
      if (opener?.isConnected && typeof opener.focus === 'function') opener.focus();
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
    if (viewport) {
      fitSheet();
      viewport.addEventListener('resize', fitSheet);
      viewport.addEventListener('scroll', fitSheet);
    }
  }

  function matchAccountId(hint, accounts) {
    if (!accounts.length) return '';
    const text = String(hint || '').trim().toLowerCase();
    if (text) {
      let best = null;
      let bestScore = 0;
      for (const acc of accounts) {
        const hay = `${acc.name || ''} ${acc.bank || ''} ${acc.type || ''}`.toLowerCase();
        let score = 0;
        if (acc.name && text.includes(acc.name.toLowerCase())) score += 8;
        if (acc.bank && text.includes(acc.bank.toLowerCase())) score += 6;
        if (acc.name && acc.name.toLowerCase().includes(text) && text.length >= 2) score += 5;
        for (const group of BANK_ALIASES) {
          const hintHit = group.some(k => text.includes(k));
          const accHit = group.some(k => hay.includes(k));
          if (hintHit && accHit) score += 5;
        }
        if (score > bestScore) {
          bestScore = score;
          best = acc;
        }
      }
      if (best && bestScore >= 5) return String(best.id);
    }
    const lastId = localStorage.getItem(LAST_ACCOUNT_KEY);
    if (lastId && accounts.some(a => String(a.id) === lastId)) return lastId;
    const cash = accounts.find(a => a.type === '现金存款') || accounts[0];
    return String(cash.id);
  }

  function isLikelyDuplicate(item, existingTxs) {
    if (!Array.isArray(existingTxs) || !existingTxs.length) return false;
    const itemTitle = String(item.title || '').trim().toLowerCase();
    const itemCents = Math.round(Number(item.amount) * 100);
    return existingTxs.some(tx => {
      if (tx.date !== item.date) return false;
      if (Math.round(Number(tx.amount) * 100) !== itemCents) return false;
      const txTitle = String(tx.title || '').trim().toLowerCase();
      if (!itemTitle || !txTitle) return true;
      return txTitle === itemTitle || txTitle.includes(itemTitle) || itemTitle.includes(txTitle);
    });
  }

  function openSettings(onSaved) {
    if (document.querySelector('dialog[open]')) return;
    const cfg = window.MonoServices.readConfig();
    const dialog = el('dialog', 'mp-dialog mp-settings-dialog');
    dialog.setAttribute('aria-labelledby', 'mp-settings-title');

    const head = el('div', 'mp-dialog-head');
    const title = el('h2', '', 'AI 与行情设置');
    title.id = 'mp-settings-title';
    const close = el('button', 'mp-close');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭');
    close.append(icon('close'));
    close.addEventListener('click', () => closeSheet(dialog));
    head.append(title, close);

    const intro = el('p', 'mp-batch-intro', '识图记收支通过视觉大模型提取账单；A 股行情优先走你的 Worker 代理，未配置时也自动支持实时直连。');

    let mode = cfg.aiMode;
    const modes = el('div', 'mp-batch-modes');
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', '接入方式');
    const workerTab = el('button', '', 'Worker 代理（推荐）');
    workerTab.type = 'button';
    const directTab = el('button', '', '直连视觉 API');
    directTab.type = 'button';
    modes.append(workerTab, directTab);

    const form = el('form', 'mp-form mp-settings-form');
    const workerSection = el('div', 'mp-fields');
    const directSection = el('div', 'mp-fields');

    const makeField = (labelText, inputEl, hintText) => {
      const wrap = el('label', 'mp-field');
      wrap.append(el('span', '', labelText), inputEl);
      if (hintText) wrap.append(el('small', 'mp-meta', hintText));
      return wrap;
    };

    const workerUrlInput = el('input');
    workerUrlInput.type = 'url';
    workerUrlInput.placeholder = 'https://mono-api.你的子域.workers.dev';
    workerUrlInput.value = cfg.workerUrl;
    workerUrlInput.autocomplete = 'off';

    const workerTokenInput = el('input');
    workerTokenInput.type = 'password';
    workerTokenInput.placeholder = '若 Worker 设置了 ACCESS_TOKEN 请填入（选填）';
    workerTokenInput.value = cfg.workerToken;
    workerTokenInput.autocomplete = 'off';

    workerSection.append(
      makeField('Cloudflare Worker 地址', workerUrlInput, '将仓库中的 mono/worker/worker.js 粘贴部署到 Cloudflare Workers 即可免费使用。'),
      makeField('访问口令（选填）', workerTokenInput, '仅保存在当前浏览器，不会写入本地备份文件。')
    );

    const presetSelect = el('select');
    window.MonoServices.AI_PRESETS.forEach(p => presetSelect.add(new Option(p.label, p.id)));
    presetSelect.add(new Option('自定义 OpenAI 兼容接口', 'custom'));
    const matchedPreset = window.MonoServices.AI_PRESETS.find(p => p.baseUrl === cfg.aiBaseUrl);
    presetSelect.value = matchedPreset ? matchedPreset.id : 'custom';

    const aiBaseInput = el('input');
    aiBaseInput.type = 'url';
    aiBaseInput.placeholder = 'https://api.deepseek.com';
    aiBaseInput.value = cfg.aiBaseUrl;
    aiBaseInput.autocomplete = 'off';

    const aiModelInput = el('input');
    aiModelInput.type = 'text';
    aiModelInput.placeholder = 'deepseek-flash';
    aiModelInput.value = cfg.aiModel;
    aiModelInput.autocomplete = 'off';

    const aiKeyInput = el('input');
    aiKeyInput.type = 'password';
    aiKeyInput.placeholder = 'sk-...';
    aiKeyInput.value = cfg.aiApiKey;
    aiKeyInput.autocomplete = 'off';

    presetSelect.addEventListener('change', () => {
      const found = window.MonoServices.AI_PRESETS.find(p => p.id === presetSelect.value);
      if (found) {
        aiBaseInput.value = found.baseUrl;
        aiModelInput.value = found.model;
      }
    });

    directSection.append(
      makeField('模型平台预设', presetSelect),
      makeField('接口地址（Base URL）', aiBaseInput),
      makeField('视觉模型名称', aiModelInput),
      makeField('API Key', aiKeyInput, '仅存当前浏览器，绝不进本地备份。若遇浏览器跨域限制请改用 Worker 模式。')
    );

    const feedback = el('p', 'mp-feedback');
    feedback.setAttribute('role', 'status');

    const testBtn = el('button', 'mp-secondary', '测试连接');
    testBtn.type = 'button';
    const saveBtn = el('button', 'mp-primary', '保存设置');
    saveBtn.type = 'submit';
    const actions = el('div', 'mp-actions');
    actions.append(testBtn, saveBtn);

    form.append(workerSection, directSection, feedback, actions);
    dialog.append(head, intro, modes, form);

    function switchMode(next) {
      mode = next;
      const isWorker = mode === 'worker';
      workerTab.setAttribute('aria-pressed', String(isWorker));
      directTab.setAttribute('aria-pressed', String(!isWorker));
      workerSection.hidden = !isWorker;
      directSection.hidden = isWorker;
      feedback.textContent = '';
      feedback.classList.remove('is-ok', 'is-error');
      window.MonoMotion?.syncSlider(modes, isWorker ? workerTab : directTab);
    }

    workerTab.addEventListener('click', () => switchMode('worker'));
    directTab.addEventListener('click', () => switchMode('direct'));

    function readFormDraft() {
      return {
        aiMode: mode,
        workerUrl: workerUrlInput.value.trim().replace(/\/+$/, ''),
        workerToken: workerTokenInput.value.trim(),
        aiBaseUrl: aiBaseInput.value.trim().replace(/\/+$/, ''),
        aiModel: aiModelInput.value.trim(),
        aiApiKey: aiKeyInput.value.trim()
      };
    }

    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.textContent = '测试中…';
      feedback.classList.remove('is-ok', 'is-error');
      feedback.textContent = '正在检测接口连通性…';
      const res = await window.MonoServices.testConnection(readFormDraft());
      testBtn.disabled = false;
      testBtn.textContent = '测试连接';
      feedback.textContent = res.message;
      feedback.classList.add(res.ok ? 'is-ok' : 'is-error');
    });

    form.addEventListener('submit', event => {
      event.preventDefault();
      window.MonoServices.saveConfig(readFormDraft());
      closeSheet(dialog);
      onSaved?.();
    });

    switchMode(mode);
    openSheet(dialog);
    requestAnimationFrame(() => window.MonoMotion?.syncSlider(modes, mode === 'worker' ? workerTab : directTab, { instant: true }));
  }

  function openImportDialog() {
    if (document.querySelector('dialog[open]')) return;
    if (!window.mono.accounts.length) {
      window.MonoPanels.editAccount();
      return;
    }

    const accounts = window.mono.accounts;
    const dialog = el('dialog', 'mp-dialog mp-batch-dialog mp-import-dialog');
    dialog.setAttribute('aria-labelledby', 'mp-import-title');

    const head = el('div', 'mp-dialog-head');
    const title = el('h2', '', '识图记收支');
    title.id = 'mp-import-title';
    const close = el('button', 'mp-close');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭');
    close.append(icon('close'));
    close.addEventListener('click', () => closeSheet(dialog));
    head.append(title, close);

    const body = el('div', 'mp-import-body');
    dialog.append(head, body);

    let aborted = false;
    let thumbs = [];
    let rows = [];
    let summaryNote = '';

    const currentNetCents = accounts.reduce((total, acc) => {
      const c = Math.round(acc.balance * 100);
      return total + (acc.type === '负债' ? -c : c);
    }, 0);

    function renderPickStep(errorMsg = '') {
      body.replaceChildren();
      const cfg = window.MonoServices.readConfig();
      const ready = window.MonoServices.hasVisionReady(cfg);

      const statusBar = el('div', 'mp-import-status');
      const statusText = el('span', '', ready
        ? (cfg.aiMode === 'worker' ? '已连接 Worker 识图服务' : `直连模型：${cfg.aiModel}`)
        : '尚未配置 AI 识图服务');
      const cfgBtn = el('button', 'mp-import-link', ready ? '更改设置' : '去配置');
      cfgBtn.type = 'button';
      cfgBtn.addEventListener('click', () => {
        closeSheet(dialog);
        setTimeout(() => openSettings(() => openImportDialog()), 230);
      });
      statusBar.append(statusText, cfgBtn);

      const dropLabel = el('label', 'mp-import-dropzone' + (ready ? '' : ' is-unconfigured'));
      const fileInput = el('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.multiple = true;
      fileInput.className = 'mp-sr-file';
      const iconWrap = el('span', 'mp-import-drop-icon');
      iconWrap.append(icon('camera'));
      dropLabel.append(
        fileInput,
        iconWrap,
        el('strong', '', '拍照或从相册选择账单截图'),
        el('span', 'mp-meta', '支持微信、支付宝、银行账单与小票，一次最多 4 张；也可直接粘贴截图')
      );

      const feedback = el('p', 'mp-feedback');
      feedback.setAttribute('role', 'alert');
      if (errorMsg) feedback.textContent = errorMsg;

      const footer = el('div', 'mp-actions');
      const manualBtn = el('button', 'mp-secondary', '改用手动记账');
      manualBtn.type = 'button';
      manualBtn.addEventListener('click', () => {
        closeSheet(dialog);
        setTimeout(() => window.MonoPanels.recordEntry(), 220);
      });
      footer.append(manualBtn);

      fileInput.addEventListener('change', () => {
        const files = Array.from(fileInput.files || []).slice(0, 4);
        if (files.length) handleFiles(files);
      });

      body.append(statusBar, dropLabel, feedback, footer);
    }

    async function handleFiles(files) {
      if (!window.MonoServices.hasVisionReady()) {
        renderPickStep('请先点击右上角「去配置」，填入 Cloudflare Worker 地址或视觉模型 API Key。');
        return;
      }
      aborted = false;
      body.replaceChildren();
      const progress = el('div', 'mp-import-loading');
      const thumbStrip = el('div', 'mp-import-thumbs');
      const pulse = el('div', 'mp-import-scanbar');
      const msg = el('p', 'mp-meta', `正在压缩 ${files.length} 张图片…`);
      const cancelBtn = el('button', 'mp-secondary', '取消识别');
      cancelBtn.type = 'button';
      cancelBtn.addEventListener('click', () => {
        aborted = true;
        renderPickStep('已取消识别。');
      });
      progress.append(thumbStrip, pulse, msg, cancelBtn);
      body.append(progress);

      try {
        const compressed = [];
        for (const file of files) {
          const dataUrl = await window.MonoServices.compressImage(file, { maxEdge: 1280, quality: 0.82 });
          if (aborted) return;
          compressed.push(dataUrl);
          const img = el('img', 'mp-import-thumb');
          img.src = dataUrl;
          img.alt = '待识别账单';
          thumbStrip.append(img);
        }
        thumbs = compressed;
        msg.textContent = 'AI 正在识别每笔支出与收入，并过滤转账与汇总项…';

        const today = window.MonoServices.beijingNow().date;
        const result = await window.MonoServices.recognizeReceipt(compressed, { accounts, today });
        if (aborted) return;

        summaryNote = result.summaryNote || `已从 ${compressed.length} 张图片识别完成`;
        const existingTxs = window.mono.transactions || [];
        rows = result.items.map((item, idx) => {
          const isTransfer = item.type === 'transfer';
          const duplicate = !isTransfer && isLikelyDuplicate(item, existingTxs);
          return {
            uid: 'row_' + idx + '_' + Date.now(),
            checked: !isTransfer && !duplicate,
            type: isTransfer ? 'expense' : item.type,
            flaggedTransfer: isTransfer,
            flaggedDuplicate: duplicate,
            amount: String(item.amount.toFixed(2)),
            title: item.title,
            date: item.date || today,
            accountId: matchAccountId(item.accountHint, accounts),
            note: item.note || (item.accountHint ? '' : '')
          };
        });
        renderReviewStep();
      } catch (err) {
        if (!aborted) {
          renderPickStep(err?.message || '识图失败，请检查网络或 AI 配置后重试。');
        }
      }
    }

    function renderReviewStep() {
      body.replaceChildren();
      const topMeta = el('div', 'mp-import-review-head');
      if (thumbs.length) {
        const strip = el('div', 'mp-import-thumbs is-compact');
        thumbs.forEach(src => {
          const img = el('img', 'mp-import-thumb');
          img.src = src;
          img.alt = '账单缩略图';
          strip.append(img);
        });
        topMeta.append(strip);
      }
      const noteWrap = el('div', 'mp-import-summary-copy');
      noteWrap.append(el('strong', '', summaryNote || '识别结果'));
      const statsEl = el('span', 'mp-meta', '');
      noteWrap.append(statsEl);
      topMeta.append(noteWrap);

      const listEl = el('div', 'mp-import-list');
      const feedback = el('p', 'mp-feedback');
      feedback.setAttribute('role', 'alert');

      const preview = el('div', 'mp-batch-preview');
      const netOut = el('output', 'mp-batch-total');
      preview.append(el('span', '', '更新后的净资产'), netOut);

      const repickBtn = el('button', 'mp-secondary', '重选图片');
      repickBtn.type = 'button';
      repickBtn.addEventListener('click', () => renderPickStep());

      const addRowBtn = el('button', 'mp-secondary', '补录一笔');
      addRowBtn.type = 'button';
      addRowBtn.addEventListener('click', () => {
        const today = window.MonoServices.beijingNow().date;
        rows.push({
          uid: 'manual_' + Date.now(),
          checked: true,
          type: 'expense',
          flaggedTransfer: false,
          flaggedDuplicate: false,
          amount: '',
          title: '',
          date: today,
          accountId: matchAccountId('', accounts),
          note: ''
        });
        paintRows();
        listEl.scrollTop = listEl.scrollHeight;
      });

      const confirmBtn = el('button', 'mp-primary', '确认入账');
      confirmBtn.type = 'button';

      const actions = el('div', 'mp-actions mp-import-actions');
      actions.append(repickBtn, addRowBtn, confirmBtn);

      const footer = el('div', 'mp-batch-footer');
      footer.append(preview, feedback, actions);

      function evaluate() {
        const checkedRows = rows.filter(r => r.checked);
        let expCents = 0;
        let incCents = 0;
        const deltaByAccount = new Map();
        let error = '';

        for (const r of checkedRows) {
          const raw = String(r.amount || '').normalize('NFKC').trim().replaceAll(',', '');
          const num = Number(raw);
          if (!raw || !/^\d+(?:\.\d{0,2})?$/.test(raw) || !Number.isFinite(num) || num <= 0 || num > maxBalance) {
            error = `请检查「${r.title || '未命名条目'}」的金额格式（须大于 0，最多两位小数）。`;
            break;
          }
          const c = Math.round(num * 100);
          if (r.type === 'income') incCents += c;
          else expCents += c;
          const signed = r.type === 'income' ? c : -c;
          deltaByAccount.set(r.accountId, (deltaByAccount.get(r.accountId) || 0) + signed);
        }

        const changes = [];
        let netCents = currentNetCents;
        if (!error) {
          for (const [accId, movement] of deltaByAccount.entries()) {
            const acc = accounts.find(a => String(a.id) === String(accId));
            if (!acc) {
              error = '有条目未选择有效账户。';
              break;
            }
            const isDebt = acc.type === '负债';
            const nextBal = Math.round(acc.balance * 100) + (isDebt ? -movement : movement);
            if (nextBal < 0) {
              error = `${acc.name}${isDebt ? '减少金额超过当前欠款' : '支出合计超过当前余额'}。`;
              break;
            }
            if (nextBal > Math.round(maxBalance * 100)) {
              error = `${acc.name}更新后超过可保存上限。`;
              break;
            }
            if (movement !== 0) {
              changes.push({ id: acc.id, balance: nextBal / 100 });
              netCents += movement;
            }
          }
        }

        statsEl.textContent = checkedRows.length
          ? `已勾选 ${checkedRows.length} 笔 · 支出 ¥${(expCents / 100).toFixed(2)} · 收入 ¥${(incCents / 100).toFixed(2)}`
          : '请至少勾选 1 笔有效收支';

        netOut.dataset.mode = incCents >= expCents ? 'income' : 'expense';
        netOut.textContent = error ? '—' : money(netCents / 100);
        feedback.textContent = error;
        confirmBtn.disabled = Boolean(error) || !checkedRows.length || !changes.length;
        confirmBtn.textContent = checkedRows.length ? `确认入账（${checkedRows.length} 笔）` : '确认入账';
        return { error, changes, checkedRows };
      }

      function paintRows() {
        listEl.replaceChildren();
        if (!rows.length) {
          listEl.append(el('p', 'mp-empty', '图片中未识别出明确的支出或收入记录，你可以点击下方「补录一笔」或「重选图片」。'));
          evaluate();
          return;
        }
        rows.forEach(row => {
          const card = el('div', 'mp-import-item' + (row.checked ? '' : ' is-unchecked'));

          const topLine = el('div', 'mp-import-item-top');
          const check = el('input');
          check.type = 'checkbox';
          check.className = 'mp-import-check';
          check.checked = row.checked;
          check.setAttribute('aria-label', '选择入账');
          check.addEventListener('change', () => {
            row.checked = check.checked;
            card.classList.toggle('is-unchecked', !row.checked);
            evaluate();
          });

          const titleInput = el('input', 'mp-import-title-input');
          titleInput.type = 'text';
          titleInput.maxLength = 48;
          titleInput.placeholder = '商户或摘要';
          titleInput.value = row.title;
          titleInput.addEventListener('input', () => { row.title = titleInput.value; });

          const typeBtn = el('button', 'mp-import-type ' + (row.type === 'income' ? 'is-income' : 'is-expense'),
            row.type === 'income' ? '收入' : '支出');
          typeBtn.type = 'button';
          typeBtn.addEventListener('click', () => {
            row.type = row.type === 'income' ? 'expense' : 'income';
            typeBtn.textContent = row.type === 'income' ? '收入' : '支出';
            typeBtn.className = 'mp-import-type ' + (row.type === 'income' ? 'is-income' : 'is-expense');
            evaluate();
          });

          const removeBtn = el('button', 'mp-tx-delete');
          removeBtn.type = 'button';
          removeBtn.setAttribute('aria-label', '移除此条');
          removeBtn.append(icon('trash'));
          removeBtn.addEventListener('click', () => {
            rows = rows.filter(r => r.uid !== row.uid);
            paintRows();
          });

          topLine.append(check, titleInput, typeBtn, removeBtn);
          card.append(topLine);

          if (row.flaggedTransfer || row.flaggedDuplicate || row.note) {
            const tags = el('div', 'mp-import-tags');
            if (row.flaggedTransfer) tags.append(el('span', 'mp-import-tag is-warn', '疑似转账/还款 · 已默认取消'));
            if (row.flaggedDuplicate) tags.append(el('span', 'mp-import-tag is-warn', '可能与已有流水重复'));
            if (row.note) tags.append(el('span', 'mp-import-tag', row.note));
            card.append(tags);
          }

          const bottomLine = el('div', 'mp-import-item-bottom');
          const amtInput = el('input', 'mp-import-amt-input');
          amtInput.type = 'text';
          amtInput.inputMode = 'decimal';
          amtInput.placeholder = '0.00';
          amtInput.value = row.amount;
          amtInput.addEventListener('input', () => {
            row.amount = amtInput.value;
            evaluate();
          });

          const accSelect = el('select', 'mp-import-acc-select');
          accounts.forEach(acc => accSelect.add(new Option(acc.name, String(acc.id))));
          accSelect.value = row.accountId;
          accSelect.addEventListener('change', () => {
            row.accountId = accSelect.value;
            evaluate();
          });

          const dateInput = el('input', 'mp-import-date-input');
          dateInput.type = 'date';
          dateInput.value = row.date;
          dateInput.addEventListener('change', () => {
            if (dateInput.value) row.date = dateInput.value;
          });

          bottomLine.append(amtInput, accSelect, dateInput);
          card.append(bottomLine);
          listEl.append(card);
        });
        evaluate();
      }

      confirmBtn.addEventListener('click', () => {
        const { error, changes, checkedRows } = evaluate();
        if (error || !changes.length || !checkedRows.length) return;
        const nowIso = new Date().toISOString();
        const today = window.MonoServices.beijingNow().date;
        const newTxs = checkedRows.map(r => {
          const acc = accounts.find(a => String(a.id) === String(r.accountId));
          return {
            id: globalThis.crypto?.randomUUID?.() || ('img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
            date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : today,
            type: r.type === 'income' ? 'income' : 'expense',
            amount: Math.round(Number(String(r.amount).replaceAll(',', '')) * 100) / 100,
            title: String(r.title || '').trim() || (r.type === 'income' ? '识图收入' : '识图支出'),
            accountId: String(r.accountId),
            accountName: acc?.name || '',
            source: 'image',
            note: r.note || '',
            createdAt: nowIso
          };
        });
        if (checkedRows[0]?.accountId) {
          try { localStorage.setItem(LAST_ACCOUNT_KEY, String(checkedRows[0].accountId)); } catch {}
        }
        const res = window.mono.updateBalances(changes, { transactions: newTxs });
        if (res.ok) closeSheet(dialog);
        else feedback.textContent = res.message || '保存失败，请重试。';
      });

      body.append(topMeta, listEl, footer);
      paintRows();
    }

    dialog.addEventListener('paste', event => {
      const items = Array.from(event.clipboardData?.items || []);
      const files = items
        .filter(item => item.type && item.type.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter(Boolean)
        .slice(0, 4);
      if (files.length) {
        event.preventDefault();
        handleFiles(files);
      }
    });

    renderPickStep();
    openSheet(dialog);
  }

  window.MonoImport = {
    open: openImportDialog,
    openSettings
  };
})();
