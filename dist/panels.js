(() => {
  'use strict';

  const types = ['现金存款', '投资资产', '固定资产', '其他资产', '负债'];
  const iconPaths = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    entry: '<path d="M7 4v13m-4-4 4 4 4-4m6 7V7m-4 4 4-4 4 4"/>',
    scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M4 16v2a2 2 0 0 0 2 2h2M16 20h2a2 2 0 0 0 2-2v-2"/><path d="M7 12h10"/>',
    edit: '<path d="m14.5 5.5 4 4M4 20l4.5-1 12-12a1.6 1.6 0 0 0 0-2.3l-1.2-1.2a1.6 1.6 0 0 0-2.3 0l-12 12Z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    swap: '<path d="M7 16V4m0 0-3.5 3.5M7 4l3.5 3.5M17 8v12m0 0-3.5-3.5M17 20l3.5-3.5"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.9 5"/><path d="M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 0 0 7.07 7.07L13.1 19"/>',
    goal: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.2"/>',
    '现金存款': '<path d="M3 8.5 12 4l9 4.5H3Zm2 11h14M6.5 11v5.5M12 11v5.5M17.5 11v5.5"/>',
    '投资资产': '<path d="M4 19.5h16M6 16v-4M10 16V8M14 16v-6M18 16V5"/>',
    '固定资产': '<path d="m3 11 9-7 9 7M5.5 10v10h13V10M10 20v-6h4v6"/>',
    '其他资产': '<path d="m12 3 8.5 5v8L12 21l-8.5-5V8Zm0 10v8M3.5 8 12 13l8.5-5"/>',
    '负债': '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10.5h18M6.5 15h4"/>'
  };
  let accountFilter = '';
  let txFilter = '';
  let txMonth = ''; // '' = auto latest/current month, 'ALL' = all months, or 'YYYY-MM'
  let txCategoryFilter = '';
  let txStatsMode = 'expense'; // 'expense' | 'income'
  let lastPage;
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const icon = (name) => {
    const node = el('span', 'mp-icon');
    node.setAttribute('aria-hidden', 'true');
    node.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">' + iconPaths[name] + '</svg>';
    return node;
  };
  const button = (label, cls, onClick, iconName) => {
    const node = el('button', cls);
    node.type = 'button';
    if (iconName) node.append(icon(iconName));
    node.append(document.createTextNode(label));
    node.addEventListener('click', onClick);
    return node;
  };
  const amount = (value) => {
    if (window.mono.hidden) return '••••••';
    const num = Number(value) || 0;
    const sign = num < 0 ? '−' : '';
    const formatted = String(window.mono.money(Math.abs(num)));
    return /^[¥￥]/.test(formatted) ? sign + formatted : sign + '¥' + formatted;
  };
  const sum = (items, field) => items.reduce((total, item) => total + Math.round(Number(item[field]) * 100), 0) / 100;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function animateAmountChange(node, previousText) {
    const current = node.textContent;
    if (window.mono.hidden || reducedMotion.matches || !previousText || previousText === current ||
        !/\d/.test(previousText) || !/\d/.test(current)) return;
    if (node.id === 'netValue' || node.id === 'changeValue' || node.id === 'weekAmount' ||
        node.id === 'grossValue' || node.id === 'debtValue') return;
    const motion = window.MonoMotion;
    if (motion) {
      const from = motion.parseNumeric(previousText);
      const to = motion.parseNumeric(current);
      if (from !== null && to !== null && !node.children.length) {
        const prefixMatch = current.match(/^[+−-]?(¥\s?|￥\s?)?/);
        const rawPrefix = prefixMatch ? prefixMatch[0] : '';
        const hasSign = /^[+−-]/.test(rawPrefix);
        const currency = rawPrefix.replace(/^[+−-]/, '');
        if (hasSign) {
          motion.tweenSignedText(node, from, to, { currency, forceSign: current.startsWith('+'), duration: 300 });
        } else {
          motion.tweenCurrencyText(node, from, to, { prefix: currency, duration: 300 });
        }
        return;
      }
    }
    for (const animation of node.getAnimations()) {
      if (animation.id === 'amount-change') animation.cancel();
    }
    node.animate([{opacity: .66}, {opacity: 1}], {id: 'amount-change', duration: 220, easing: 'ease-out'});
  }
  function amountLabel(tag, cls, text, key) {
    const node = el(tag, cls, text);
    node.dataset.amountKey = key;
    return node;
  }
  const metric = (name, number, emphasis) => {
    const block = el('div', 'mp-metric' + (emphasis ? ' mp-emphasis' : ''));
    block.append(el('div', 'mp-meta', name), amountLabel('div', 'mp-value', amount(number), name));
    return block;
  };
  const editButton = (name, cb) => {
    const node = button('', 'mp-edit', cb, 'edit');
    node.setAttribute('aria-label', '编辑' + name);
    node.title = '编辑' + name;
    return node;
  };
  const blank = (text) => el('p', 'mp-empty', text);

  function closeSheet(dialog) {
    if (window.MonoMotion?.closeDialog) window.MonoMotion.closeDialog(dialog);
    else dialog.close();
  }

  function openDialog(dialog, focusFallback) {
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
      else (focusFallback?.() || document.getElementById('dockAdd'))?.focus();
    }, {once: true});
    document.body.append(dialog);
    dialog.showModal();
    if (viewport) {
      fitSheet();
      viewport.addEventListener('resize', fitSheet);
      viewport.addEventListener('scroll', fitSheet);
    }
  }

  const balanceDate = new Intl.DateTimeFormat('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'});
  const maxBalance = 99999999999.99;

  function currentNetValue(accountsList = window.mono.accounts) {
    const cents = (accountsList || []).reduce((total, acc) => {
      const c = Math.round(Number(acc.balance || 0) * 100);
      return total + (acc.type === '负债' ? -c : c);
    }, 0);
    return cents / 100;
  }

  function resolveGoalLink(g, accountsList = window.mono.accounts) {
    const mode = g?.mode === 'net' || g?.mode === 'accounts' ? g.mode : 'manual';
    if (mode === 'net') {
      return {
        mode: 'net',
        saved: currentNetValue(accountsList),
        linkedAccounts: [],
        badge: '自动联动 · 总净资产'
      };
    }
    if (mode === 'accounts') {
      const idSet = new Set((Array.isArray(g.accountIds) ? g.accountIds : []).map(String));
      const matched = (accountsList || []).filter(a => idSet.has(String(a.id)));
      const savedCents = matched.reduce((total, a) => {
        const c = Math.round(Number(a.balance || 0) * 100);
        return total + (a.type === '负债' ? -c : c);
      }, 0);
      let badge = '关联账户已移除 · 请编辑';
      if (matched.length === 1) badge = '自动联动 · ' + matched[0].name;
      else if (matched.length === 2) badge = `自动联动 · ${matched[0].name}、${matched[1].name}`;
      else if (matched.length > 2) badge = `自动联动 · ${matched.length} 个账户`;
      return {
        mode: 'accounts',
        saved: savedCents / 100,
        linkedAccounts: matched,
        badge
      };
    }
    return {
      mode: 'manual',
      saved: Number(g?.saved) || 0,
      linkedAccounts: [],
      badge: ''
    };
  }

  function batchBalances(initialMode = 'expense') {
    if (document.querySelector('dialog[open]') || !window.mono.accounts.length) return;
    const dialog = el('dialog', 'mp-dialog mp-batch-dialog');
    dialog.setAttribute('aria-labelledby', 'mp-batch-title');
    dialog.setAttribute('aria-describedby', 'mp-batch-intro');
    const title = el('h2', '', '记收支 / 转账');
    title.id = 'mp-batch-title';
    const close = button('', 'mp-close', () => closeSheet(dialog), 'close');
    close.setAttribute('aria-label', '关闭');
    close.autofocus = true;
    const head = el('div', 'mp-dialog-head');
    head.append(title, close);
    const intro = el('p', 'mp-batch-intro', '选择分类并填写金额，留空的账户保持原余额。');
    intro.id = 'mp-batch-intro';

    let mode = ['expense', 'income', 'transfer'].includes(initialMode) ? initialMode : 'expense';
    let selectedCategory = '餐饮';
    const modes = el('div', 'mp-batch-modes is-three');
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', '记账类型');
    const expense = button('支出', '', () => selectMode('expense'));
    const income = button('收入', '', () => selectMode('income'));
    const transfer = button('转账', '', () => selectMode('transfer'));
    modes.append(expense, income, transfer);

    const accountsList = window.mono.accounts;
    const currentNetCents = Math.round(currentNetValue(accountsList) * 100);
    const todayStr = window.MonoServices?.beijingNow?.().date || new Date().toISOString().slice(0, 10);

    // Expense / Income extra metadata (Category chips + optional title/note + date)
    const entryMeta = el('div', 'mp-entry-meta');
    const catBar = el('div', 'mp-cat-chips');
    catBar.setAttribute('role', 'group');
    catBar.setAttribute('aria-label', '选择收支分类');
    const metaInputsRow = el('div', 'mp-entry-subrow');
    const noteInput = el('input', 'mp-entry-note');
    noteInput.type = 'text';
    noteInput.maxLength = 48;
    noteInput.placeholder = '摘要或商户（选填，如 午饭/打车）';
    noteInput.autocomplete = 'off';
    const dateInput = el('input', 'mp-entry-date');
    dateInput.type = 'date';
    dateInput.value = todayStr;
    dateInput.setAttribute('aria-label', '记账日期');
    metaInputsRow.append(noteInput, dateInput);
    entryMeta.append(catBar, metaInputsRow);

    const fields = el('div', 'mp-batch-fields');
    const rows = accountsList.map(account => {
      const row = el('label', 'mp-field mp-batch-row');
      const label = el('span', 'mp-batch-label');
      const meta = el('span', 'mp-meta');
      const date = Date.parse(account.updatedAt);
      meta.append(
        el('span', '', (account.type === '负债' ? '当前欠款 ' : '当前余额 ') + amount(account.balance)),
        el('span', '', Number.isFinite(date) ? '更新于 ' + balanceDate.format(date) : '更新时间未记录')
      );
      label.append(el('strong', '', account.name), meta);
      const input = el('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.autocomplete = 'off';
      input.maxLength = 20;
      meta.id = 'mp-batch-info-' + fields.children.length;
      input.setAttribute('aria-describedby', meta.id);
      row.append(label, input);
      fields.append(row);
      return {account, input};
    });

    // Transfer / Repayment pane
    const transferPane = el('div', 'mp-transfer-pane');
    transferPane.hidden = true;
    const fromSelect = el('select');
    const toSelect = el('select');
    const transferAmtInput = el('input');
    transferAmtInput.type = 'text';
    transferAmtInput.inputMode = 'decimal';
    transferAmtInput.autocomplete = 'off';
    transferAmtInput.maxLength = 20;
    transferAmtInput.placeholder = '0.00';
    const transferAmtLabel = el('span', '', '转账金额（元）');
    const transferNoteInput = el('input');
    transferNoteInput.type = 'text';
    transferNoteInput.maxLength = 48;
    transferNoteInput.placeholder = '备注（选填，如 还信用卡 / 银证转账）';
    transferNoteInput.autocomplete = 'off';
    const transferDateInput = el('input');
    transferDateInput.type = 'date';
    transferDateInput.value = todayStr;
    const transferDetailPreview = el('div', 'mp-transfer-preview');

    if (accountsList.length < 2) {
      const needMore = el('div', 'mp-transfer-empty');
      needMore.append(
        el('p', 'mp-meta', '至少需要 2 个账户才能记录账户互转或信用卡/贷款还款。'),
        button('去添加账户', 'mp-secondary', () => {
          closeSheet(dialog);
          setTimeout(() => editAccount(), 220);
        }, 'plus')
      );
      transferPane.append(needMore);
    } else {
      const optionLabel = acc => `${acc.name}${acc.type === '负债' ? '（欠款 ' : '（余额 '}${amount(acc.balance)}）`;
      accountsList.forEach(acc => {
        fromSelect.add(new Option(optionLabel(acc), String(acc.id)));
        toSelect.add(new Option(optionLabel(acc), String(acc.id)));
      });
      const defaultFrom = accountsList.find(a => a.type === '现金存款') || accountsList[0];
      const defaultTo = accountsList.find(a => String(a.id) !== String(defaultFrom.id) && a.type === '负债')
        || accountsList.find(a => String(a.id) !== String(defaultFrom.id))
        || accountsList[1];
      fromSelect.value = String(defaultFrom.id);
      toSelect.value = String(defaultTo.id);

      const fromField = el('label', 'mp-field');
      fromField.append(el('span', '', '转出账户'), fromSelect);

      const swapRow = el('div', 'mp-transfer-swap-row');
      const swapBtn = button('交换方向', 'mp-secondary mp-transfer-swap', () => {
        const tmp = fromSelect.value;
        fromSelect.value = toSelect.value;
        toSelect.value = tmp;
        refreshPreview();
      }, 'swap');
      swapRow.append(swapBtn);

      const toField = el('label', 'mp-field');
      const toLabel = el('span', '', '转入 / 还款账户');
      toField.append(toLabel, toSelect);

      const amtField = el('label', 'mp-field');
      amtField.append(transferAmtLabel, transferAmtInput);

      const extraRow = el('div', 'mp-entry-subrow');
      extraRow.append(transferNoteInput, transferDateInput);

      transferPane.append(fromField, swapRow, toField, amtField, extraRow, transferDetailPreview);
    }

    const preview = el('div', 'mp-batch-preview');
    const previewLabel = el('span', '', '更新后的资产');
    const net = el('output', 'mp-batch-total');
    net.setAttribute('aria-label', '更新后的资产');
    preview.append(previewLabel, net);
    const feedback = el('p', 'mp-feedback');
    feedback.setAttribute('role', 'alert');
    const submit = el('button', 'mp-primary', '保存更新');
    submit.type = 'submit';
    const actions = el('div', 'mp-actions');
    actions.append(button('取消', 'mp-secondary', () => closeSheet(dialog)), submit);
    const footer = el('div', 'mp-batch-footer');
    footer.append(preview, feedback, actions);
    const form = el('form', 'mp-batch-form');
    form.append(entryMeta, fields, transferPane, footer);
    dialog.append(head, intro, modes, form);

    function renderCatChips() {
      catBar.replaceChildren();
      const list = mode === 'income'
        ? (window.MonoServices?.INCOME_CATEGORIES || [{ name: '工资', color: '#6ec997' }, { name: '其他收入', color: '#9a9aa6' }])
        : (window.MonoServices?.EXPENSE_CATEGORIES || [{ name: '餐饮', color: '#e6a26c' }, { name: '其他支出', color: '#9a9aa6' }]);
      if (!list.some(c => c.name === selectedCategory)) {
        selectedCategory = list[0].name;
      }
      for (const cat of list) {
        const chip = el('button', 'mp-cat-chip' + (selectedCategory === cat.name ? ' is-active' : ''));
        chip.type = 'button';
        chip.setAttribute('aria-pressed', String(selectedCategory === cat.name));
        const dot = el('span', 'mp-cat-dot');
        dot.style.background = cat.color;
        chip.append(dot, document.createTextNode(cat.name));
        chip.addEventListener('click', () => {
          selectedCategory = cat.name;
          renderCatChips();
        });
        catBar.append(chip);
      }
    }

    function selectMode(next) {
      mode = next;
      const isExpense = mode === 'expense';
      const isIncome = mode === 'income';
      const isTransfer = mode === 'transfer';
      expense.setAttribute('aria-pressed', String(isExpense));
      income.setAttribute('aria-pressed', String(isIncome));
      transfer.setAttribute('aria-pressed', String(isTransfer));
      const activeBtn = isExpense ? expense : isIncome ? income : transfer;
      window.MonoMotion?.syncSlider(modes, activeBtn);

      entryMeta.hidden = isTransfer;
      fields.hidden = isTransfer;
      transferPane.hidden = !isTransfer;
      intro.textContent = isTransfer
        ? '在自己的账户间划转资金或还信用卡/贷款，不计入月度收支且总净资产不变。'
        : '选择分类并填写金额，留空的账户保持原余额。';

      if (!isTransfer) {
        renderCatChips();
        net.dataset.mode = mode;
        previewLabel.textContent = '更新后的资产';
        for (const {account, input} of rows) {
          let label = isExpense ? '支出金额' : '收入金额';
          if (account.type === '负债') label = isExpense ? '增加欠款' : '减少欠款';
          input.placeholder = label;
          input.setAttribute('aria-label', account.name + '的' + label + '（元）');
        }
      } else {
        net.dataset.mode = 'transfer';
        previewLabel.textContent = '总净资产（保持不变）';
      }
      refreshPreview();
    }

    function parseAmountText(rawValue) {
      const value = String(rawValue || '').normalize('NFKC').trim();
      if (!value) return { empty: true, cents: 0 };
      const plain = /^\d*\.?\d{0,2}$/.test(value);
      const grouped = /^\d{1,3}(?:,\d{3})+(?:\.\d{0,2})?$/.test(value);
      const entered = Number(value.replaceAll(',', ''));
      if ((!plain && !grouped) || !Number.isFinite(entered) || entered > maxBalance) {
        return { invalid: true, message: '请输入 0 至 99,999,999,999.99 元的金额，最多保留两位小数。' };
      }
      return { empty: false, cents: Math.round(entered * 100) };
    }

    function collectTransfer() {
      if (accountsList.length < 2) {
        return { changes: [], transactions: [], netCents: currentNetCents, detail: '' };
      }
      const fromAcc = accountsList.find(a => String(a.id) === String(fromSelect.value));
      const toAcc = accountsList.find(a => String(a.id) === String(toSelect.value));
      const isRepay = toAcc?.type === '负债';
      transferAmtLabel.textContent = isRepay ? '还款金额（元）' : '转账金额（元）';
      submit.textContent = isRepay ? '确认还款' : '确认转账';

      if (!fromAcc || !toAcc) return { invalid: fromSelect, message: '请选择有效的转出和转入账户。' };
      if (String(fromAcc.id) === String(toAcc.id)) {
        return { invalid: toSelect, message: '转出账户与转入账户不能相同。' };
      }

      const parsed = parseAmountText(transferAmtInput.value);
      if (parsed.invalid) return { invalid: transferAmtInput, message: parsed.message };
      if (parsed.empty || parsed.cents === 0) {
        return { changes: [], transactions: [], netCents: currentNetCents, detail: '' };
      }

      const c = parsed.cents;
      const fromIsDebt = fromAcc.type === '负债';
      const toIsDebt = toAcc.type === '负债';
      // Transfer out from asset decreases asset; from debt increases debt (e.g. cash advance).
      const nextFromCents = Math.round(fromAcc.balance * 100) + (fromIsDebt ? c : -c);
      // Transfer in to asset increases asset; to debt decreases debt (repayment).
      const nextToCents = Math.round(toAcc.balance * 100) + (toIsDebt ? -c : c);

      if (nextFromCents < 0) {
        return { invalid: transferAmtInput, message: `${fromAcc.name}余额不足。` };
      }
      if (nextToCents < 0) {
        return { invalid: transferAmtInput, message: `还款金额超过${toAcc.name}当前欠款。` };
      }
      if (nextFromCents > Math.round(maxBalance * 100) || nextToCents > Math.round(maxBalance * 100)) {
        return { invalid: transferAmtInput, message: '更新后的账户金额超过可保存上限。' };
      }

      const nowIso = new Date().toISOString();
      const txDate = /^\d{4}-\d{2}-\d{2}$/.test(transferDateInput.value) ? transferDateInput.value : todayStr;
      const rawNote = transferNoteInput.value.trim();
      const catName = isRepay ? '还款' : '转账';
      const txTitle = rawNote || `${catName} · ${fromAcc.name} → ${toAcc.name}`;
      const changes = [
        { id: fromAcc.id, balance: nextFromCents / 100 },
        { id: toAcc.id, balance: nextToCents / 100 }
      ];
      const tx = {
        id: globalThis.crypto?.randomUUID?.() || ('tr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
        date: txDate,
        type: 'transfer',
        category: catName,
        amount: c / 100,
        title: txTitle.slice(0, 48),
        accountId: String(fromAcc.id),
        accountName: fromAcc.name,
        targetAccountId: String(toAcc.id),
        targetAccountName: toAcc.name,
        source: 'manual',
        note: rawNote,
        createdAt: nowIso
      };
      const detail = `${fromAcc.name}${fromIsDebt ? '欠款' : '余额'} ${amount(fromAcc.balance)} → ${amount(nextFromCents / 100)}；${toAcc.name}${toIsDebt ? '欠款' : '余额'} ${amount(toAcc.balance)} → ${amount(nextToCents / 100)}`;
      return { changes, transactions: [tx], netCents: currentNetCents, detail };
    }

    function collect() {
      if (mode === 'transfer') return collectTransfer();
      submit.textContent = '保存更新';
      const changes = [];
      const transactions = [];
      let netCents = currentNetCents;
      const nowIso = new Date().toISOString();
      const txDate = /^\d{4}-\d{2}-\d{2}$/.test(dateInput.value) ? dateInput.value : todayStr;
      const rawNote = noteInput.value.trim();
      for (const {account, input} of rows) {
        const parsed = parseAmountText(input.value);
        if (parsed.invalid) return { invalid: input, message: parsed.message };
        if (parsed.empty || parsed.cents === 0) continue;
        const cents = parsed.cents;
        const movement = mode === 'income' ? cents : -cents;
        const isDebt = account.type === '负债';
        const nextBalance = Math.round(account.balance * 100) + (isDebt ? -movement : movement);
        if (nextBalance < 0) {
          return {invalid: input, message: account.name + (isDebt ? '的减少金额超过当前欠款。' : '的支出超过当前余额。')};
        }
        if (nextBalance > Math.round(maxBalance * 100)) {
          return {invalid: input, message: account.name + '更新后的余额超过可保存的上限。'};
        }
        changes.push({id: account.id, balance: nextBalance / 100});
        const fallbackTitle = selectedCategory || (mode === 'income' ? (isDebt ? '还款 / 减少欠款' : '手动收入') : (isDebt ? '新增欠款' : '手动支出'));
        transactions.push({
          id: globalThis.crypto?.randomUUID?.() || ('tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
          date: txDate,
          type: mode === 'income' ? 'income' : 'expense',
          category: selectedCategory,
          amount: cents / 100,
          title: (rawNote || fallbackTitle).slice(0, 48),
          accountId: String(account.id),
          accountName: account.name,
          source: 'manual',
          note: rawNote ? '' : '',
          createdAt: nowIso
        });
        netCents += movement;
      }
      return {changes, transactions, netCents};
    }

    function refreshPreview() {
      const result = collect();
      form.querySelector('[aria-invalid="true"]')?.removeAttribute('aria-invalid');
      result.invalid?.setAttribute('aria-invalid', 'true');
      const previous = net.textContent;
      net.textContent = result.invalid ? '—' : amount(result.netCents / 100);
      animateAmountChange(net, previous);
      if (mode === 'transfer') {
        transferDetailPreview.textContent = result.detail || '';
        transferDetailPreview.hidden = !result.detail;
      }
      feedback.textContent = result.message || '';
      submit.disabled = Boolean(result.invalid) || !result.changes.length;
    }

    form.addEventListener('input', refreshPreview);
    form.addEventListener('change', refreshPreview);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const {changes, transactions} = collect();
      if (!dialog.open || !changes?.length) return;
      const result = window.mono.updateBalances(changes, { transactions });
      if (result.ok) closeSheet(dialog);
      else feedback.textContent = result.message || '余额未保存，请重试。';
    });

    selectMode(mode);
    openDialog(dialog, () => document.querySelector('.mp-update-balances'));
    const initBtn = mode === 'income' ? income : mode === 'transfer' ? transfer : expense;
    requestAnimationFrame(() => window.MonoMotion?.syncSlider(modes, initBtn, {instant: true}));
  }

  function accounts(root) {
    const items = window.mono.accounts;
    const total = sum(items.filter(a => a.type !== '负债'), 'balance');
    const debt = sum(items.filter(a => a.type === '负债'), 'balance');
    const metrics = el('section', 'mp-metrics');
    metrics.setAttribute('aria-label', '账户汇总');
    metrics.append(metric('净资产', total - debt, true), metric('资产合计', total), metric('负债合计', debt));
    const panel = el('section', 'mp-box');
    const bar = el('div', 'mp-box-head');
    const title = el('h2', '', '账户明细');
    const filter = el('select', 'mp-filter');
    filter.setAttribute('aria-label', '按账户类型筛选');
    ['', ...types].forEach(value => filter.add(new Option(value || '全部类型', value)));
    filter.value = accountFilter;
    const list = el('div', 'mp-account-list');
    const paint = () => {
      list.replaceChildren();
      const entries = accountFilter ? items.filter(item => item.type === accountFilter) : items;
      if (!entries.length) {
        list.append(blank(accountFilter ? '该类型下暂无账户。' : '暂无账户。添加第一个账户，即可查看资产汇总。'));
        return;
      }
      entries.forEach(a => {
        const row = el('button', 'mp-account');
        row.type = 'button';
        const badge = el('span', 'mp-account-icon');
        badge.append(icon(types.includes(a.type) ? a.type : '其他资产'));
        const intro = el('span', 'mp-account-info');
        const detail = a.bank ? a.bank + ' · ' + a.type : a.type;
        const balance = amount(a.balance);
        intro.append(el('strong', '', a.name), el('span', 'mp-meta', detail));
        row.append(badge, intro, amountLabel('span', 'mp-account-value', balance, 'account-' + a.id), icon('edit'));
        row.setAttribute('aria-label', '编辑' + a.name + '，' + detail + '，余额 ' + balance);
        row.addEventListener('click', () => editAccount(a.id));
        list.append(row);
      });
    };
    filter.addEventListener('change', () => { accountFilter = filter.value; paint(); });
    paint();
    bar.append(title, filter);
    panel.append(bar, list);
    root.append(metrics);
    if (window.mono.canUndoBalanceUpdate()) {
      const notice = el('div', 'mp-batch-notice');
      const status = el('p', '', '余额已更新');
      status.setAttribute('role', 'status');
      notice.append(status, button('撤销更新', 'mp-secondary', () => {
        const result = window.mono.undoBalanceUpdate();
        if (result.ok) {
          document.querySelector('.mp-update-balances')?.focus();
          const restored = el('p', 'mp-batch-undo-message', '已撤销本次余额更新');
          restored.setAttribute('role', 'status');
          document.querySelector('#secondary .mp-metrics')?.after(restored);
        } else status.textContent = result.message || '撤销未完成，请重试。';
      }));
      root.append(notice);
    }
    root.append(panel);
    renderTransactionsSection(root);
  }

  function txCategoryOf(tx) {
    if (window.MonoServices?.normalizeCategory) {
      return window.MonoServices.normalizeCategory(tx.category, tx.type, tx.title, tx.note);
    }
    if (tx.type === 'transfer') return tx.category || '转账';
    return tx.category || (tx.type === 'income' ? '其他收入' : '其他支出');
  }

  function formatMonthLabel(ym) {
    if (ym === 'ALL') return '全部月份';
    const [y, m] = String(ym).split('-');
    return `${y}年${Number(m)}月`;
  }

  function shiftMonth(ym, delta) {
    const [y, m] = String(ym).split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  function editTransaction(tx) {
    if (document.querySelector('dialog[open]') || !tx) return;
    const dialog = el('dialog', 'mp-dialog');
    dialog.setAttribute('aria-labelledby', 'mp-tx-edit-title');

    const head = el('div', 'mp-dialog-head');
    const title = el('h2', '', tx.type === 'transfer' ? '编辑转账记录' : '编辑收支流水');
    title.id = 'mp-tx-edit-title';
    const close = button('', 'mp-close', () => closeSheet(dialog), 'close');
    close.setAttribute('aria-label', '关闭');
    head.append(title, close);

    const form = el('form', 'mp-form');
    const fields = el('div', 'mp-fields');

    const titleWrap = el('label', 'mp-field');
    titleWrap.append(el('span', '', '摘要 / 商户'));
    const titleInput = el('input');
    titleInput.type = 'text';
    titleInput.maxLength = 48;
    titleInput.value = tx.title || '';
    titleInput.required = true;
    titleWrap.append(titleInput);
    fields.append(titleWrap);

    let catSelect = null;
    if (tx.type !== 'transfer') {
      const catWrap = el('label', 'mp-field');
      catWrap.append(el('span', '', tx.type === 'income' ? '收入分类' : '消费分类'));
      catSelect = el('select');
      const list = tx.type === 'income'
        ? (window.MonoServices?.INCOME_CATEGORIES || [{ name: '其他收入' }])
        : (window.MonoServices?.EXPENSE_CATEGORIES || [{ name: '其他支出' }]);
      list.forEach(c => catSelect.add(new Option(c.name, c.name)));
      catSelect.value = txCategoryOf(tx);
      catWrap.append(catSelect);
      fields.append(catWrap);
    }

    const dateWrap = el('label', 'mp-field');
    dateWrap.append(el('span', '', '日期'));
    const dateInput = el('input');
    dateInput.type = 'date';
    dateInput.value = tx.date || '';
    dateWrap.append(dateInput);
    fields.append(dateWrap);

    const noteWrap = el('label', 'mp-field');
    noteWrap.append(el('span', '', '备注（选填）'));
    const noteInput = el('input');
    noteInput.type = 'text';
    noteInput.maxLength = 64;
    noteInput.value = tx.note || '';
    noteWrap.append(noteInput);
    fields.append(noteWrap);

    const hint = el('p', 'mp-meta', `金额 ${amount(tx.amount)} · 仅修改流水归类与说明，不影响账户当前余额。`);
    fields.append(hint);

    const feedback = el('p', 'mp-feedback');
    feedback.setAttribute('role', 'alert');

    const footer = el('div', 'mp-actions');
    footer.append(button('删除流水', 'mp-danger', () => {
      title.textContent = '删除这条流水？';
      form.hidden = true;
      const confirm = el('div', 'mp-confirm');
      confirm.append(el('p', '', `确认删除「${tx.title || '未命名收支'}」（${amount(tx.amount)}）？删除仅移除流水记录，不会改动当前账户余额。`));
      const choices = el('div', 'mp-actions');
      const back = button('返回', 'mp-secondary', () => {
        confirm.remove();
        form.hidden = false;
        title.textContent = tx.type === 'transfer' ? '编辑转账记录' : '编辑收支流水';
      });
      choices.append(back, button('确认删除', 'mp-destructive', () => {
        closeSheet(dialog);
        window.mono.deleteTransaction(tx.id);
      }));
      confirm.append(choices);
      dialog.append(confirm);
      back.focus();
    }));
    footer.append(button('取消', 'mp-secondary', () => closeSheet(dialog)));
    const submit = el('button', 'mp-primary', '保存修改');
    submit.type = 'submit';
    footer.append(submit);

    form.append(fields, feedback, footer);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const nextTitle = titleInput.value.trim();
      if (!nextTitle) {
        feedback.textContent = '请输入摘要或商户名称。';
        titleInput.focus();
        return;
      }
      const patch = {
        title: nextTitle,
        note: noteInput.value.trim(),
        date: dateInput.value || tx.date
      };
      if (catSelect) patch.category = catSelect.value;
      const res = window.mono.updateTransaction(tx.id, patch);
      if (res.ok) closeSheet(dialog);
      else feedback.textContent = res.message || '保存失败，请重试。';
    });

    dialog.append(head, form);
    openDialog(dialog);
  }

  function renderTransactionsSection(root) {
    const txs = Array.isArray(window.mono.transactions) ? window.mono.transactions : [];
    const todayYm = (window.MonoServices?.beijingNow?.().date || new Date().toISOString().slice(0, 10)).slice(0, 7);
    const availableMonths = [...new Set(txs.map(t => String(t.date || '').slice(0, 7)).filter(m => /^\d{4}-\d{2}$/.test(m)))]
      .sort((a, b) => b.localeCompare(a));

    if (!txMonth) {
      txMonth = availableMonths.includes(todayYm) ? todayYm : (availableMonths[0] || todayYm);
    }

    const box = el('section', 'mp-box mp-tx-box');
    const bar = el('div', 'mp-box-head mp-tx-head');
    const titleWrap = el('div', 'mp-tx-head-title');
    titleWrap.append(el('h2', '', '月度收支复盘'));
    const countBadge = el('span', 'mp-tx-count', String(txs.length));
    if (txs.length) titleWrap.append(countBadge);

    const monthNav = el('div', 'mp-month-nav');
    const prevBtn = button('', 'mp-month-btn', () => {
      if (txMonth === 'ALL') txMonth = availableMonths[0] || todayYm;
      else txMonth = shiftMonth(txMonth, -1);
      txCategoryFilter = '';
      paint();
    }, 'left');
    prevBtn.setAttribute('aria-label', '上个月');
    const monthLabelBtn = el('button', 'mp-month-label');
    monthLabelBtn.type = 'button';
    monthLabelBtn.title = '点击在按月与全部之间切换';
    monthLabelBtn.addEventListener('click', () => {
      txMonth = txMonth === 'ALL' ? (availableMonths[0] || todayYm) : 'ALL';
      txCategoryFilter = '';
      paint();
    });
    const nextBtn = button('', 'mp-month-btn', () => {
      if (txMonth === 'ALL') txMonth = todayYm;
      else txMonth = shiftMonth(txMonth, 1);
      txCategoryFilter = '';
      paint();
    }, 'right');
    nextBtn.setAttribute('aria-label', '下个月');
    monthNav.append(prevBtn, monthLabelBtn, nextBtn);

    const filter = el('select', 'mp-filter');
    filter.setAttribute('aria-label', '按收支类型筛选流水');
    [['', '全部类型'], ['expense', '仅看支出'], ['income', '仅看收入'], ['transfer', '转账/还款']].forEach(([val, label]) => {
      filter.add(new Option(label, val));
    });
    filter.value = txFilter;

    const headControls = el('div', 'mp-tx-controls');
    headControls.append(monthNav, filter);
    bar.append(titleWrap, headControls);

    const summaryStrip = el('div', 'mp-tx-summary');
    const breakdownBox = el('div', 'mp-cat-breakdown');
    const activeChipRow = el('div', 'mp-tx-active-filter');
    activeChipRow.hidden = true;
    const list = el('div', 'mp-tx-list');
    let visibleLimit = 30;

    const paint = () => {
      monthLabelBtn.textContent = formatMonthLabel(txMonth);
      nextBtn.disabled = txMonth !== 'ALL' && txMonth >= todayYm;

      const scoped = txMonth === 'ALL'
        ? txs
        : txs.filter(t => String(t.date || '').slice(0, 7) === txMonth);

      countBadge.textContent = String(scoped.length);
      countBadge.hidden = !scoped.length;

      // Monthly totals (strictly excluding transfers)
      let expCents = 0;
      let incCents = 0;
      const expCatMap = new Map();
      const incCatMap = new Map();

      for (const tx of scoped) {
        if (tx.type === 'transfer') continue;
        const c = Math.round(Number(tx.amount || 0) * 100);
        const cat = txCategoryOf(tx);
        if (tx.type === 'income') {
          incCents += c;
          const cur = incCatMap.get(cat) || { name: cat, cents: 0, count: 0 };
          cur.cents += c;
          cur.count += 1;
          incCatMap.set(cat, cur);
        } else {
          expCents += c;
          const cur = expCatMap.get(cat) || { name: cat, cents: 0, count: 0 };
          cur.cents += c;
          cur.count += 1;
          expCatMap.set(cat, cur);
        }
      }

      const netCents = incCents - expCents;
      const signedFmt = centsVal => {
        if (window.mono.hidden) return '••••••';
        const sign = centsVal > 0 ? '+' : centsVal < 0 ? '−' : '';
        return sign + '¥' + window.mono.money(Math.abs(centsVal) / 100);
      };

      summaryStrip.replaceChildren();
      const makeStat = (labelText, valueText, extraCls = '') => {
        const cell = el('div', 'mp-tx-stat');
        cell.append(el('span', 'mp-meta', labelText), el('strong', 'mp-tx-stat-val ' + extraCls, valueText));
        return cell;
      };
      summaryStrip.append(
        makeStat(txMonth === 'ALL' ? '累计支出' : '本月支出', amount(expCents / 100), 'is-expense'),
        makeStat(txMonth === 'ALL' ? '累计收入' : '本月收入', amount(incCents / 100), 'is-income'),
        makeStat(txMonth === 'ALL' ? '累计结余' : '月度结余', signedFmt(netCents), netCents > 0 ? 'is-income' : netCents < 0 ? 'is-expense' : '')
      );

      // Category breakdown
      breakdownBox.replaceChildren();
      if (txStatsMode === 'income' && !incCatMap.size && expCatMap.size) txStatsMode = 'expense';
      if (txStatsMode === 'expense' && !expCatMap.size && incCatMap.size) txStatsMode = 'income';

      const activeMap = txStatsMode === 'income' ? incCatMap : expCatMap;
      const totalForMode = txStatsMode === 'income' ? incCents : expCents;

      if (expCatMap.size || incCatMap.size) {
        breakdownBox.hidden = false;
        const bHead = el('div', 'mp-cat-head');
        bHead.append(el('span', 'mp-cat-heading', txStatsMode === 'income' ? '收入分类占比' : '消费分类占比'));
        const modeSwitch = el('div', 'mp-cat-mode-switch');
        const expTab = el('button', 'mp-cat-mode-btn' + (txStatsMode === 'expense' ? ' is-active' : ''), '支出');
        expTab.type = 'button';
        expTab.addEventListener('click', () => {
          txStatsMode = 'expense';
          txCategoryFilter = '';
          paint();
        });
        const incTab = el('button', 'mp-cat-mode-btn' + (txStatsMode === 'income' ? ' is-active' : ''), '收入');
        incTab.type = 'button';
        incTab.addEventListener('click', () => {
          txStatsMode = 'income';
          txCategoryFilter = '';
          paint();
        });
        modeSwitch.append(expTab, incTab);
        bHead.append(modeSwitch);
        breakdownBox.append(bHead);

        const ranked = Array.from(activeMap.values()).sort((a, b) => b.cents - a.cents);
        if (!ranked.length) {
          breakdownBox.append(el('p', 'mp-meta mp-cat-empty', txStatsMode === 'income' ? '该期间暂无收入记录' : '该期间暂无支出记录'));
        } else {
          const barsList = el('div', 'mp-cat-bars');
          ranked.forEach(item => {
            const share = totalForMode > 0 ? (item.cents / totalForMode * 100) : 0;
            const isSelected = txCategoryFilter === item.name;
            const rowBtn = el('button', 'mp-cat-row' + (isSelected ? ' is-selected' : ''));
            rowBtn.type = 'button';
            rowBtn.setAttribute('aria-pressed', String(isSelected));
            const color = window.MonoServices?.categoryColor?.(item.name) || '#9a9aa6';

            const top = el('div', 'mp-cat-row-top');
            const left = el('span', 'mp-cat-row-left');
            const dot = el('span', 'mp-cat-dot');
            dot.style.background = color;
            left.append(dot, el('strong', '', item.name), el('small', 'mp-meta', `${item.count} 笔`));

            const right = el('span', 'mp-cat-row-right');
            right.append(
              el('strong', '', amount(item.cents / 100)),
              el('small', 'mp-meta', window.mono.hidden ? '•••' : share.toFixed(1) + '%')
            );
            top.append(left, right);

            const track = el('div', 'mp-cat-track');
            const fill = el('div', 'mp-cat-fill');
            fill.style.width = (window.mono.hidden ? 0 : Math.max(2, share)) + '%';
            fill.style.background = color;
            track.append(fill);

            rowBtn.append(top, track);
            rowBtn.addEventListener('click', () => {
              txCategoryFilter = isSelected ? '' : item.name;
              paint();
            });
            barsList.append(rowBtn);
          });
          breakdownBox.append(barsList);
        }
      } else {
        breakdownBox.hidden = true;
      }

      // Active category filter pill
      activeChipRow.replaceChildren();
      if (txCategoryFilter) {
        activeChipRow.hidden = false;
        const clearBtn = el('button', 'mp-active-cat-pill', `当前分类：${txCategoryFilter} ×`);
        clearBtn.type = 'button';
        clearBtn.addEventListener('click', () => {
          txCategoryFilter = '';
          paint();
        });
        activeChipRow.append(clearBtn);
      } else {
        activeChipRow.hidden = true;
      }

      // Filtered transaction rows
      list.replaceChildren();
      let filtered = txFilter ? scoped.filter(t => t.type === txFilter) : scoped;
      if (txCategoryFilter) {
        filtered = filtered.filter(t => txCategoryOf(t) === txCategoryFilter);
      }
      if (!filtered.length) {
        list.append(blank(txs.length ? '该月份或筛选条件下暂无流水记录。点击月份可切换「全部月份」。' : '暂无收支流水。使用「识图记收支」或「记收支」后会自动保存每笔明细。'));
        return;
      }
      const shown = filtered.slice(0, visibleLimit);
      let currentDate = '';
      for (const tx of shown) {
        if (tx.date !== currentDate) {
          currentDate = tx.date;
          list.append(el('div', 'mp-tx-date-group', currentDate));
        }
        const row = el('button', 'mp-tx-row mp-tx-row-btn');
        row.type = 'button';
        const info = el('div', 'mp-tx-info');
        const titleRow = el('div', 'mp-tx-title-row');
        const cat = txCategoryOf(tx);
        const catBadge = el('span', 'mp-tx-cat-tag');
        const dot = el('span', 'mp-cat-dot');
        dot.style.background = window.MonoServices?.categoryColor?.(cat) || '#9a9aa6';
        catBadge.append(dot, document.createTextNode(cat));
        titleRow.append(el('strong', '', tx.title || cat));
        titleRow.append(catBadge);
        if (tx.source === 'image') {
          titleRow.append(el('span', 'mp-tx-source is-ai', '识图'));
        }
        const subParts = tx.type === 'transfer' && tx.targetAccountName
          ? [`${tx.accountName || '转出账户'} → ${tx.targetAccountName}`]
          : [tx.accountName || '未知账户'];
        if (tx.note && tx.note !== tx.title) subParts.push(tx.note);
        info.append(titleRow, el('span', 'mp-meta', subParts.join(' · ')));

        const right = el('div', 'mp-tx-right');
        const isTransfer = tx.type === 'transfer';
        const sign = isTransfer ? '' : tx.type === 'income' ? '+' : '−';
        const valText = window.mono.hidden ? '••••••' : sign + '¥' + window.mono.money(tx.amount);
        const valCls = isTransfer ? 'is-transfer' : tx.type === 'income' ? 'is-income' : 'is-expense';
        const valNode = amountLabel('span', 'mp-tx-amount ' + valCls, valText, 'tx-' + tx.id);
        right.append(valNode);
        row.append(info, right);
        row.addEventListener('click', () => editTransaction(tx));
        list.append(row);
      }
      if (filtered.length > visibleLimit) {
        const moreWrap = el('div', 'mp-tx-more');
        moreWrap.append(button(`展开更多（剩余 ${filtered.length - visibleLimit} 笔）`, 'mp-secondary', () => {
          visibleLimit += 30;
          paint();
        }));
        list.append(moreWrap);
      }
    };

    filter.addEventListener('change', () => { txFilter = filter.value; txCategoryFilter = ''; paint(); });
    paint();
    box.append(bar, summaryStrip, breakdownBox, activeChipRow, list);
    root.append(box);
  }

  function goals(root) {
    const items = window.mono.goals;
    const resolved = items.map(g => ({ goal: g, link: resolveGoalLink(g) }));
    const totalSaved = resolved.reduce((acc, r) => acc + Math.round(Math.max(0, r.link.saved) * 100), 0) / 100;
    const totalTarget = sum(items, 'target');
    const totalRemaining = resolved.reduce((acc, r) => acc + Math.round(Math.max(0, r.goal.target - r.link.saved) * 100), 0) / 100;

    const summary = el('section', 'mp-metrics');
    summary.setAttribute('aria-label', '目标汇总');
    summary.append(metric('累计已存', totalSaved, true), metric('目标总额', totalTarget), metric('待积累金额', totalRemaining));
    root.append(summary);
    const group = el('section', 'mp-goals');
    if (!items.length) group.append(blank('暂无财富目标。添加目标后可手动记录，或关联真实账户自动同步进度。'));
    resolved.forEach(({ goal: g, link }) => {
      const card = el('article', 'mp-goal');
      const header = el('div', 'mp-goal-head');
      const emblem = el('span', 'mp-account-icon');
      emblem.append(icon('goal'));
      header.append(emblem, el('h2', '', g.name), editButton(g.name, () => editGoal(g.id)));
      if (link.badge) {
        const linkRow = el('div', 'mp-goal-link-badge');
        linkRow.append(icon('link'), el('span', '', link.badge));
        card.append(header, linkRow);
      } else {
        card.append(header);
      }
      const figures = el('div', 'mp-goal-figures');
      figures.append(
        el('span', 'mp-meta', link.mode === 'manual' ? '已存金额' : '当前进度金额（自动同步）'),
        amountLabel('strong', 'mp-goal-value', amount(link.saved), 'saved-' + g.id)
      );
      const pct = g.target > 0 ? Math.min(100, Math.max(0, link.saved / g.target * 100)) : 0;
      const track = el('div', 'mp-track');
      const fill = el('div', 'mp-fill');
      const targetWidth = (window.mono.hidden ? 0 : pct) + '%';
      if (!reducedMotion.matches && !window.mono.hidden && pct > 0) {
        fill.style.width = '0%';
        requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = targetWidth; }));
      } else {
        fill.style.width = targetWidth;
      }
      track.append(fill);
      const label = el('div', 'mp-goal-progress');
      const pctLabel = window.mono.hidden ? '•••' : (pct > 99 && pct < 100 ? '99' : Math.round(pct)) + '%';
      label.append(amountLabel('span', '', '目标 ' + amount(g.target), 'target-' + g.id), el('span', 'mp-percent', pctLabel));
      card.append(figures, track, label);
      group.append(card);
    });
    root.append(group);
  }

  function render(page) {
    if (page !== 'accounts' && page !== 'goals') return;
    if (page !== lastPage) accountFilter = '';
    lastPage = page;
    const root = document.getElementById('secondary');
    const wrap = el('div', 'mp-page');
    const isAccount = page === 'accounts';
    const heading = el('header', 'mp-heading');
    const headingText = el('div', '');
    headingText.append(el('h1', '', isAccount ? '资产账户' : '财富目标'));
    const add = button(isAccount ? '添加账户' : '添加目标', 'mp-primary mp-page-add',
      () => isAccount ? editAccount() : editGoal(), 'plus');
    const controls = el('div', 'mp-heading-actions');
    if (isAccount && window.mono.accounts.length) {
      controls.append(button('识图记收支', 'mp-secondary mp-scan-trigger', () => window.MonoImport?.open(), 'scan'));
      controls.append(button('记收支 / 转账', 'mp-secondary mp-update-balances', () => batchBalances('expense'), 'entry'));
    }
    controls.append(add);
    heading.append(headingText, controls);
    wrap.append(heading);
    if (isAccount) accounts(wrap); else goals(wrap);
    root.replaceChildren(wrap);
  }

  function editor(kind, id) {
    const isAccount = kind === 'account';
    const label = isAccount ? '账户' : '目标';
    const items = isAccount ? window.mono.accounts : window.mono.goals;
    const existing = id == null ? null : items.find(item => String(item.id) === String(id));
    if (id != null && !existing) return;
    if (document.querySelector('dialog.mp-dialog[open]')) return;
    const source = existing || {};
    const dialog = el('dialog', 'mp-dialog');
    dialog.setAttribute('aria-labelledby', 'mp-dialog-title');
    dialog.lang = 'zh-CN';
    const head = el('div', 'mp-dialog-head');
    const title = el('h2', '', (existing ? '编辑' : '添加') + label);
    title.id = 'mp-dialog-title';
    const close = button('', 'mp-close', () => closeSheet(dialog), 'close');
    const touchLayout = window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
    close.setAttribute('aria-label', '关闭');
    close.autofocus = touchLayout;
    head.append(title, close);
    const form = el('form', 'mp-form');
    const fields = el('div', 'mp-fields');
    const feedback = el('p', 'mp-feedback');
    feedback.setAttribute('role', 'alert');
    const inputs = {};
    const fieldWrappers = {};
    const field = (key, text, type, options = {}) => {
      const wrapper = el('label', 'mp-field');
      wrapper.append(el('span', '', text));
      let input;
      if (type === 'select') {
        input = el('select');
        types.forEach(t => input.add(new Option(t, t)));
        input.value = source[key] || types[0];
      } else {
        input = el('input');
        input.type = type;
        input.value = source[key] ?? (key === 'saved' ? 0 : '');
        input.placeholder = options.placeholder || '';
        if (type === 'number') {
          input.min = key === 'target' ? '0.01' : '0';
          input.max = '99999999999.99';
          input.step = '0.01';
          input.inputMode = 'decimal';
        } else input.maxLength = 64;
      }
      input.required = key !== 'bank';
      input.name = key;
      wrapper.append(input);
      fields.append(wrapper);
      inputs[key] = input;
      fieldWrappers[key] = wrapper;
    };

    let goalMode = !isAccount && (source.mode === 'net' || source.mode === 'accounts') ? source.mode : 'manual';
    const selectedGoalAccounts = new Set((Array.isArray(source.accountIds) ? source.accountIds : []).map(String));
    let goalModeSwitch = null;
    let goalModeBtns = {};
    let goalAccountsPane = null;
    let goalNetPane = null;
    let goalLinkedTotal = null;

    field('name', label + '名称', 'text', {placeholder: isAccount ? '例如 工资卡' : '例如 旅行储备金'});
    if (isAccount) {
      field('type', '账户类型', 'select');
      field('bank', '所属机构（选填）', 'text', {placeholder: '银行或金融机构名称'});
      field('balance', '当前余额（元）', 'number', {placeholder: '0.00'});
    } else {
      field('target', '目标金额（元）', 'number', {placeholder: '0.00'});

      const modeField = el('div', 'mp-field');
      modeField.append(el('span', '', '已存金额来源'));
      goalModeSwitch = el('div', 'mp-batch-modes is-three mp-goal-modes');
      goalModeSwitch.setAttribute('role', 'group');
      goalModeSwitch.setAttribute('aria-label', '目标进度来源');
      const setGoalMode = next => {
        goalMode = next;
        for (const [k, btn] of Object.entries(goalModeBtns)) {
          btn.setAttribute('aria-pressed', String(k === goalMode));
        }
        window.MonoMotion?.syncSlider(goalModeSwitch, goalModeBtns[goalMode]);
        fieldWrappers.saved.hidden = goalMode !== 'manual';
        inputs.saved.required = goalMode === 'manual';
        goalAccountsPane.hidden = goalMode !== 'accounts';
        goalNetPane.hidden = goalMode !== 'net';
        feedback.textContent = '';
      };
      goalModeBtns = {
        manual: button('手动填写', '', () => setGoalMode('manual')),
        accounts: button('关联账户', '', () => setGoalMode('accounts')),
        net: button('总净资产', '', () => setGoalMode('net'))
      };
      goalModeSwitch.append(goalModeBtns.manual, goalModeBtns.accounts, goalModeBtns.net);
      modeField.append(goalModeSwitch);
      fields.append(modeField);

      field('saved', '已存金额（元）', 'number');

      goalAccountsPane = el('div', 'mp-goal-accounts-pane');
      const availAccounts = window.mono.accounts || [];
      if (!availAccounts.length) {
        goalAccountsPane.append(el('p', 'mp-meta', '当前还没有资产账户，请先添加账户或改用手动填写。'));
      } else {
        const listWrap = el('div', 'mp-goal-acc-list');
        const refreshLinkedSum = () => {
          const matched = availAccounts.filter(a => selectedGoalAccounts.has(String(a.id)));
          const sumCents = matched
            .reduce((t, a) => t + (a.type === '负债' ? -Math.round(a.balance * 100) : Math.round(a.balance * 100)), 0);
          goalLinkedTotal.textContent = matched.length
            ? `已选 ${matched.length} 个账户 · 实时同步 ${amount(sumCents / 100)}`
            : '请勾选至少 1 个要联动的账户';
        };
        availAccounts.forEach(acc => {
          const rowLabel = el('label', 'mp-goal-acc-item');
          const cb = el('input');
          cb.type = 'checkbox';
          cb.className = 'mp-import-check';
          cb.checked = selectedGoalAccounts.has(String(acc.id));
          cb.addEventListener('change', () => {
            if (cb.checked) selectedGoalAccounts.add(String(acc.id));
            else selectedGoalAccounts.delete(String(acc.id));
            feedback.textContent = '';
            refreshLinkedSum();
          });
          const info = el('span', 'mp-goal-acc-info');
          info.append(el('strong', '', acc.name), el('small', 'mp-meta', acc.type));
          const val = el('span', 'mp-goal-acc-val', (acc.type === '负债' ? '−' : '') + amount(acc.balance));
          rowLabel.append(cb, info, val);
          listWrap.append(rowLabel);
        });
        goalLinkedTotal = el('div', 'mp-batch-preview mp-goal-link-preview');
        refreshLinkedSum();
        goalAccountsPane.append(listWrap, goalLinkedTotal);
      }
      fields.append(goalAccountsPane);

      goalNetPane = el('div', 'mp-batch-preview mp-goal-link-preview');
      goalNetPane.append(
        el('span', '', '自动同步当前总净资产'),
        el('strong', '', amount(currentNetValue()))
      );
      fields.append(goalNetPane);

      // Initialize mode visibility
      requestAnimationFrame(() => {
        setGoalMode(goalMode);
        window.MonoMotion?.syncSlider(goalModeSwitch, goalModeBtns[goalMode], { instant: true });
      });
      fieldWrappers.saved.hidden = goalMode !== 'manual';
      inputs.saved.required = goalMode === 'manual';
      goalAccountsPane.hidden = goalMode !== 'accounts';
      goalNetPane.hidden = goalMode !== 'net';
    }

    form.noValidate = true;
    form.addEventListener('input', () => { feedback.textContent = ''; });
    const footer = el('div', 'mp-actions');
    if (existing) {
      footer.append(button('删除' + label, 'mp-danger', () => {
        title.textContent = '删除' + label;
        form.hidden = true;
        const confirm = el('div', 'mp-confirm');
        confirm.append(el('p', '', '确认删除「' + source.name + '」？删除后无法恢复。'));
        const choices = el('div', 'mp-actions');
        const back = button('返回', 'mp-secondary', () => {
          confirm.remove();
          form.hidden = false;
          title.textContent = '编辑' + label;
          inputs.name.focus();
        });
        choices.append(back, button('确认删除', 'mp-destructive', () => {
          const index = items.indexOf(existing);
          if (index >= 0) items.splice(index, 1);
          if (isAccount && window.mono.investments?.accountId && String(window.mono.investments.accountId) === String(existing.id)) {
            window.mono.investments.accountId = null;
          }
          closeSheet(dialog);
          window.mono.save();
        }));
        confirm.append(choices);
        dialog.append(confirm);
        back.focus();
      }));
    }
    footer.append(button('取消', 'mp-secondary', () => closeSheet(dialog)));
    const submit = el('button', 'mp-primary', existing ? '保存更改' : '添加' + label);
    submit.type = 'submit';
    footer.append(submit);
    form.append(fields, feedback, footer);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = {};
      for (const [key, input] of Object.entries(inputs)) {
        if (!isAccount && key === 'saved' && goalMode !== 'manual') {
          data.saved = Number(source.saved) || 0;
          continue;
        }
        const value = input.value.trim();
        if (!input.validity.valid || (input.required && !value)) {
          input.focus();
          feedback.textContent = key === 'name' ? '请输入' + label + '名称。'
            : key === 'target' ? '目标金额须为 0.01 至 99,999,999,999.99 元，最多保留两位小数。'
            : '请输入 0 至 99,999,999,999.99 元的有效金额，最多保留两位小数。';
          return;
        }
        data[key] = input.type === 'number' ? Math.round(Number(value) * 100) / 100 : value;
      }
      if (!isAccount) {
        data.mode = goalMode;
        if (goalMode === 'accounts') {
          const ids = Array.from(selectedGoalAccounts).filter(aid => window.mono.accounts.some(a => String(a.id) === aid));
          if (!ids.length) {
            feedback.textContent = '请至少勾选 1 个要联动的真实账户。';
            return;
          }
          data.accountIds = ids;
        } else {
          data.accountIds = [];
        }
      }
      if (existing) Object.assign(existing, data);
      else items.push({...data, id: globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2)});
      if (isAccount && accountFilter && accountFilter !== data.type) accountFilter = '';
      closeSheet(dialog);
      window.mono.save();
    });
    dialog.append(head, form);
    openDialog(dialog, () => {
      const add = document.querySelector('.mp-page-add');
      return add?.getClientRects().length ? add : null;
    });
    if (!touchLayout) inputs.name.focus();
  }
  const editAccount = id => editor('account', id);
  const editGoal = id => editor('goal', id);
  window.MonoPanels = {render, editAccount, editGoal, recordEntry: batchBalances, animateAmountChange};
})();
