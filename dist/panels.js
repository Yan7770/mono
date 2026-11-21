(() => {
  'use strict';

  const types = ['现金存款', '投资资产', '固定资产', '其他资产', '负债'];
  const iconPaths = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    update: '<path d="M19.5 12A7.5 7.5 0 1 1 17 6.4l2.5 2.6M19.5 4.4V9h-4.6"/>',
    edit: '<path d="m14.5 5.5 4 4M4 20l4.5-1 12-12a1.6 1.6 0 0 0 0-2.3l-1.2-1.2a1.6 1.6 0 0 0-2.3 0l-12 12Z"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    goal: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.2"/>',
    '现金存款': '<path d="M3 8.5 12 4l9 4.5H3Zm2 11h14M6.5 11v5.5M12 11v5.5M17.5 11v5.5"/>',
    '投资资产': '<path d="M4 19.5h16M6 16v-4M10 16V8M14 16v-6M18 16V5"/>',
    '固定资产': '<path d="m3 11 9-7 9 7M5.5 10v10h13V10M10 20v-6h4v6"/>',
    '其他资产': '<path d="m12 3 8.5 5v8L12 21l-8.5-5V8Zm0 10v8M3.5 8 12 13l8.5-5"/>',
    '负债': '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10.5h18M6.5 15h4"/>'
  };
  let accountFilter = '';
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
    const formatted = String(window.mono.money(value));
    return window.mono.hidden || /^[¥￥]/.test(formatted) ? formatted : '¥' + formatted;
  };
  const sum = (items, field) => items.reduce((total, item) => total + Math.round(Number(item[field]) * 100), 0) / 100;
  const metric = (name, number, emphasis) => {
    const block = el('div', 'mp-metric' + (emphasis ? ' mp-emphasis' : ''));
    block.append(el('div', 'mp-meta', name), el('div', 'mp-value', amount(number)));
    return block;
  };
  const editButton = (name, cb) => {
    const node = button('', 'mp-edit', cb, 'edit');
    node.setAttribute('aria-label', '编辑' + name);
    node.title = '编辑' + name;
    return node;
  };
  const blank = (text) => el('p', 'mp-empty', text);

  function openDialog(dialog, focusFallback) {
    const opener = document.activeElement;
    const viewport = window.visualViewport;
    function fitSheet() {
      dialog.style.setProperty('--mp-viewport-height', viewport.height + 'px');
      const bottom = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      dialog.style.setProperty('--mp-viewport-bottom', bottom + 'px');
    }
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

  function batchBalances() {
    if (document.querySelector('dialog[open]') || !window.mono.accounts.length) return;
    const dialog = el('dialog', 'mp-dialog mp-batch-dialog');
    dialog.setAttribute('aria-labelledby', 'mp-batch-title');
    dialog.setAttribute('aria-describedby', 'mp-batch-intro');
    const title = el('h2', '', '更新余额');
    title.id = 'mp-batch-title';
    const close = button('', 'mp-close', () => dialog.close(), 'close');
    close.setAttribute('aria-label', '关闭');
    close.autofocus = true;
    const head = el('div', 'mp-dialog-head');
    head.append(title, close);
    const intro = el('p', 'mp-batch-intro', '填写本次收支金额，留空的账户保持原余额。');
    intro.id = 'mp-batch-intro';
    let mode = 'expense';
    const modes = el('div', 'mp-batch-modes');
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', '收支类型');
    const expense = button('支出', '', () => selectMode('expense'));
    const income = button('收入', '', () => selectMode('income'));
    modes.append(expense, income);
    const currentNetCents = window.mono.accounts.reduce((total, account) => {
      const cents = Math.round(account.balance * 100);
      return total + (account.type === '负债' ? -cents : cents);
    }, 0);
    const fields = el('div', 'mp-batch-fields');
    const rows = window.mono.accounts.map(account => {
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

    const preview = el('div', 'mp-batch-preview');
    const net = el('output', 'mp-batch-total');
    net.setAttribute('aria-label', '更新后的资产');
    preview.append(el('span', '', '更新后的资产'), net);
    const feedback = el('p', 'mp-feedback');
    feedback.setAttribute('role', 'alert');
    const submit = el('button', 'mp-primary', '保存更新');
    submit.type = 'submit';
    const actions = el('div', 'mp-actions');
    actions.append(button('取消', 'mp-secondary', () => dialog.close()), submit);
    const footer = el('div', 'mp-batch-footer');
    footer.append(preview, feedback, actions);
    const form = el('form', 'mp-batch-form');
    form.append(fields, footer);
    dialog.append(head, intro, modes, form);

    function selectMode(next) {
      mode = next;
      const spending = mode === 'expense';
      expense.setAttribute('aria-pressed', String(spending));
      income.setAttribute('aria-pressed', String(!spending));
      net.dataset.mode = mode;
      for (const {account, input} of rows) {
        let label = spending ? '支出金额' : '收入金额';
        if (account.type === '负债') label = spending ? '增加欠款' : '减少欠款';
        input.placeholder = label;
        input.setAttribute('aria-label', account.name + '的' + label + '（元）');
      }
      refreshPreview();
    }

    function collect() {
      const changes = [];
      let netCents = currentNetCents;
      for (const {account, input} of rows) {
        const value = input.value.normalize('NFKC').trim();
        if (!value) continue;
        const plain = /^\d*\.?\d{0,2}$/.test(value);
        const grouped = /^\d{1,3}(?:,\d{3})+(?:\.\d{0,2})?$/.test(value);
        const entered = Number(value.replaceAll(',', ''));
        if ((!plain && !grouped) || !Number.isFinite(entered) || entered > maxBalance) {
          return {invalid: input, message: '请输入 0 至 99,999,999,999.99 元的金额，最多保留两位小数。'};
        }
        const cents = Math.round(entered * 100);
        if (cents === 0) continue;
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
        netCents += movement;
      }
      return {changes, netCents};
    }

    function refreshPreview() {
      const result = collect();
      form.querySelector('[aria-invalid="true"]')?.removeAttribute('aria-invalid');
      result.invalid?.setAttribute('aria-invalid', 'true');
      net.textContent = result.invalid ? '—' : amount(result.netCents / 100);
      feedback.textContent = result.message || '';
      submit.disabled = Boolean(result.invalid) || !result.changes.length;
    }

    form.addEventListener('input', refreshPreview);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const {changes} = collect();
      if (!dialog.open || !changes?.length) return;
      const result = window.mono.updateBalances(changes);
      if (result.ok) dialog.close();
      else feedback.textContent = result.message || '余额未保存，请重试。';
    });

    selectMode('expense');
    openDialog(dialog, () => document.querySelector('.mp-update-balances'));
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
        row.append(badge, intro, el('span', 'mp-account-value', balance), icon('edit'));
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
  }

  function goals(root) {
    const items = window.mono.goals;
    const summary = el('section', 'mp-metrics');
    summary.setAttribute('aria-label', '目标汇总');
    summary.append(metric('累计已存', sum(items, 'saved'), true), metric('目标总额', sum(items, 'target')),
      metric('待积累金额', sum(items.map(g => ({remaining: Math.max(0, g.target - g.saved)})), 'remaining')));
    root.append(summary);
    const group = el('section', 'mp-goals');
    if (!items.length) group.append(blank('暂无财富目标。添加目标后可以记录已存金额，查看完成进度。'));
    items.forEach(g => {
      const card = el('article', 'mp-goal');
      const header = el('div', 'mp-goal-head');
      const emblem = el('span', 'mp-account-icon');
      emblem.append(icon('goal'));
      header.append(emblem, el('h2', '', g.name), editButton(g.name, () => editGoal(g.id)));
      const figures = el('div', 'mp-goal-figures');
      figures.append(el('span', 'mp-meta', '已存金额'), el('strong', 'mp-goal-value', amount(g.saved)));
      const pct = g.target > 0 ? Math.min(100, Math.max(0, g.saved / g.target * 100)) : 0;
      const track = el('div', 'mp-track');
      const fill = el('div', 'mp-fill');
      fill.style.width = (window.mono.hidden ? 0 : pct) + '%';
      track.append(fill);
      const label = el('div', 'mp-goal-progress');
      const pctLabel = window.mono.hidden ? '•••' : (pct > 99 && pct < 100 ? '99' : Math.round(pct)) + '%';
      label.append(el('span', '', '目标 ' + amount(g.target)), el('span', 'mp-percent', pctLabel));
      card.append(header, figures, track, label);
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
      controls.append(button('更新余额', 'mp-secondary mp-update-balances', batchBalances, 'update'));
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
    const close = button('', 'mp-close', () => dialog.close(), 'close');
    const touchLayout = window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
    close.setAttribute('aria-label', '关闭');
    close.autofocus = touchLayout;
    head.append(title, close);
    const form = el('form', 'mp-form');
    const fields = el('div', 'mp-fields');
    const inputs = {};
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
    };
    field('name', label + '名称', 'text', {placeholder: isAccount ? '例如 工资卡' : '例如 旅行储备金'});
    if (isAccount) {
      field('type', '账户类型', 'select');
      field('bank', '所属机构（选填）', 'text', {placeholder: '银行或金融机构名称'});
      field('balance', '当前余额（元）', 'number', {placeholder: '0.00'});
    } else {
      field('target', '目标金额（元）', 'number', {placeholder: '0.00'});
      field('saved', '已存金额（元）', 'number');
    }
    const feedback = el('p', 'mp-feedback');
    feedback.setAttribute('role', 'alert');
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
          dialog.close();
          window.mono.save();
        }));
        confirm.append(choices);
        dialog.append(confirm);
        back.focus();
      }));
    }
    footer.append(button('取消', 'mp-secondary', () => dialog.close()));
    const submit = el('button', 'mp-primary', existing ? '保存更改' : '添加' + label);
    submit.type = 'submit';
    footer.append(submit);
    form.append(fields, feedback, footer);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = {};
      for (const [key, input] of Object.entries(inputs)) {
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
      if (existing) Object.assign(existing, data);
      else items.push({...data, id: globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2)});
      if (isAccount && accountFilter && accountFilter !== data.type) accountFilter = '';
      dialog.close();
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
  window.MonoPanels = {render, editAccount, editGoal};
})();
