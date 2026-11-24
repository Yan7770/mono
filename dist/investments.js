(() => {
  'use strict';

  const iconSvg = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.35-5.65L20 8.7M20 4v4.7h-4.7"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    chart: '<path d="M4 19h16M6 15l4-4 3 2.5 5-6.5"/><path d="M15 7h3v3"/>',
    check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.9 5"/><path d="M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 0 0 7.07 7.07L13.1 19"/>'
  };

  let syncing = false;
  let lastAutoSyncMs = 0;
  let syncNotice = '';
  let syncError = '';
  let liveTimer = null;

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

  const formatMoney = (value) => {
    const formatted = String(window.mono.money(value));
    return window.mono.hidden || /^[¥￥]/.test(formatted) ? formatted : '¥' + formatted;
  };

  const formatSignedMoney = (value) => {
    if (window.mono.hidden) return '••••••';
    const rounded = Math.round(Number(value || 0) * 100) / 100;
    const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
    return sign + '¥' + window.mono.money(Math.abs(rounded));
  };

  const formatPct = (value) => {
    if (window.mono.hidden) return '•••';
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return '0.00%';
    const sign = num > 0 ? '+' : num < 0 ? '−' : '';
    return sign + Math.abs(num).toFixed(2) + '%';
  };

  const formatPrice = (value, market = '') => {
    if (window.mono.hidden) return '•••';
    const num = Number(value || 0);
    if (!Number.isFinite(num) || num <= 0) return '—';
    if (market === 'jj') return num.toFixed(4);
    // ETFs frequently quote to 3 decimal places
    const decimals = Math.abs(num * 100 - Math.round(num * 100)) > 0.001 ? 3 : 2;
    return num.toFixed(decimals);
  };

  const formatShares = (value) => {
    if (window.mono.hidden) return '•••';
    const num = Number(value || 0);
    return Number.isInteger(num) ? num.toLocaleString('zh-CN') : num.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
  };

  const trendClass = (value) => {
    const num = Number(value || 0);
    if (num > 0.0001) return 'is-up';
    if (num < -0.0001) return 'is-down';
    return 'is-flat';
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

  function getInvestments() {
    return window.mono.investments || {
      accountId: null,
      holdings: [],
      holdingsTimeline: [],
      lastSettledDate: null,
      lastSyncAt: null,
      settlements: []
    };
  }

  function upsertTimeline(timeline, date, holdings) {
    const positions = holdings.map(h => ({
      symbol: h.market + h.code,
      code: h.code,
      market: h.market,
      shares: h.shares
    }));
    const filtered = (Array.isArray(timeline) ? timeline : []).filter(e => e.date !== date);
    filtered.push({ date, positions });
    return filtered.sort((a, b) => a.date.localeCompare(b.date)).slice(-90);
  }

  function computeSummary(holdings) {
    let marketValue = 0;
    let prevValue = 0;
    let totalCost = 0;
    let costValue = 0;
    let hasCost = false;

    for (const h of holdings) {
      const price = Number(h.lastPrice) > 0 ? Number(h.lastPrice) : (Number(h.prevClose) || 0);
      const prev = Number(h.prevClose) > 0 ? Number(h.prevClose) : price;
      const shares = Number(h.shares) || 0;
      const mv = price * shares;
      marketValue += mv;
      prevValue += prev * shares;
      if (Number.isFinite(Number(h.costPrice)) && Number(h.costPrice) > 0) {
        hasCost = true;
        totalCost += Number(h.costPrice) * shares;
        costValue += mv;
      }
    }

    marketValue = Math.round(marketValue * 100) / 100;
    prevValue = Math.round(prevValue * 100) / 100;
    const dayPnl = Math.round((marketValue - prevValue) * 100) / 100;
    const dayPnlPct = prevValue > 0 ? Math.round((dayPnl / prevValue) * 10000) / 100 : 0;
    const totalPnl = hasCost ? Math.round((costValue - totalCost) * 100) / 100 : null;
    const totalPnlPct = hasCost && totalCost > 0 ? Math.round((totalPnl / totalCost) * 10000) / 100 : null;
    return { marketValue, prevValue, dayPnl, dayPnlPct, hasCost, totalCost, totalPnl, totalPnlPct };
  }

  function buildHistoricalSnapshot(date, linkedAccountId, marketValue, existingSnapshots, currentAccounts) {
    // Pick the nearest snapshot <= date as baseline for all OTHER accounts so historical net worth is consistent.
    const sorted = (existingSnapshots || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    let baseAccounts = null;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].date <= date && Array.isArray(sorted[i].accounts) && sorted[i].accounts.length) {
        baseAccounts = sorted[i].accounts.map(a => ({ ...a }));
        break;
      }
    }
    if (!baseAccounts) {
      baseAccounts = currentAccounts.map(({ id, name, type, balance }) => ({ id, name, type, balance }));
    }

    const found = baseAccounts.find(a => String(a.id) === String(linkedAccountId));
    if (found) {
      found.balance = Math.round(marketValue * 100) / 100;
    } else if (linkedAccountId) {
      const linked = currentAccounts.find(a => String(a.id) === String(linkedAccountId));
      if (linked) {
        baseAccounts.push({
          id: linked.id,
          name: linked.name,
          type: linked.type,
          balance: Math.round(marketValue * 100) / 100
        });
      }
    }

    const netCents = baseAccounts.reduce((total, a) => {
      const c = Math.round(a.balance * 100);
      return total + (a.type === '负债' ? -c : c);
    }, 0);

    return {
      date,
      net: netCents / 100,
      accounts: baseAccounts
    };
  }

  async function computeMissedSettlements(inv, quoteMap, latestQuoteDate) {
    const lastSettled = inv.lastSettledDate;
    const nowIso = new Date().toISOString();
    const timeline = Array.isArray(inv.holdingsTimeline) && inv.holdingsTimeline.length
      ? inv.holdingsTimeline
      : upsertTimeline([], latestQuoteDate, inv.holdings);

    const newSettlements = [];
    const backfilledSnapshots = [];

    // First-time settlement or exact same-day closing settlement
    if (!lastSettled) {
      const summary = computeSummary(inv.holdings);
      newSettlements.push({
        date: latestQuoteDate,
        marketValue: summary.marketValue,
        dayPnl: summary.dayPnl,
        dayPnlPct: summary.dayPnlPct,
        settledAt: nowIso,
        backfilled: false
      });
      return { newSettlements, backfilledSnapshots };
    }

    const msPerDay = 86400000;
    const gapDays = Math.max(1, Math.round((Date.parse(latestQuoteDate) - Date.parse(lastSettled)) / msPerDay));

    // If only 1-3 calendar days (e.g. next trading day or Monday after weekend), settle latestQuoteDate directly unless multi-day gap
    const symbolsSet = new Set(inv.holdings.map(h => h.market + h.code));
    for (const entry of timeline) {
      for (const pos of entry.positions || []) {
        if (pos.symbol) symbolsSet.add(pos.symbol);
      }
    }
    const allSymbols = Array.from(symbolsSet);
    const fetchDays = Math.min(65, Math.max(10, gapDays + 8));

    const klineMap = new Map();
    const tradingDatesSet = new Set();

    try {
      const results = await Promise.all(
        allSymbols.map(sym => window.MonoServices.fetchKline(sym, fetchDays).catch(() => ({ symbol: sym, bars: [] })))
      );
      for (const res of results) {
        if (!res?.symbol) continue;
        const bars = (res.bars || []).slice().sort((a, b) => a.date.localeCompare(b.date));
        klineMap.set(res.symbol, bars);
        for (const bar of bars) {
          if (bar.date > lastSettled && bar.date <= latestQuoteDate) {
            tradingDatesSet.add(bar.date);
          }
        }
      }
    } catch {
      // If kline fetch fails, fall back cleanly to settling latestQuoteDate only
    }

    tradingDatesSet.add(latestQuoteDate);
    const targetDates = Array.from(tradingDatesSet).sort((a, b) => a.localeCompare(b));

    const findClose = (symbol, date) => {
      if (date === latestQuoteDate && quoteMap.has(symbol)) {
        const q = quoteMap.get(symbol);
        if (Number(q.price) > 0) return Number(q.price);
      }
      const bars = klineMap.get(symbol) || [];
      for (let i = bars.length - 1; i >= 0; i--) {
        if (bars[i].date <= date) return bars[i].close;
      }
      const q = quoteMap.get(symbol);
      return Number(q?.prevClose || q?.price || 0);
    };

    const findPrevClose = (symbol, date) => {
      if (date === latestQuoteDate && quoteMap.has(symbol)) {
        const q = quoteMap.get(symbol);
        if (Number(q.prevClose) > 0) return Number(q.prevClose);
      }
      const bars = klineMap.get(symbol) || [];
      for (let i = bars.length - 1; i >= 0; i--) {
        if (bars[i].date < date) return bars[i].close;
      }
      return findClose(symbol, date);
    };

    for (const date of targetDates) {
      // Position-change safety: only use the holding snapshot valid on or before `date`
      let effectiveEntry = null;
      for (let i = timeline.length - 1; i >= 0; i--) {
        if (timeline[i].date <= date) {
          effectiveEntry = timeline[i];
          break;
        }
      }
      if (!effectiveEntry || !effectiveEntry.positions?.length) continue;

      let mv = 0;
      let prevMv = 0;
      for (const pos of effectiveEntry.positions) {
        const close = findClose(pos.symbol, date);
        const prev = findPrevClose(pos.symbol, date);
        mv += close * pos.shares;
        prevMv += prev * pos.shares;
      }
      mv = Math.round(mv * 100) / 100;
      prevMv = Math.round(prevMv * 100) / 100;
      const dayPnl = Math.round((mv - prevMv) * 100) / 100;
      const dayPnlPct = prevMv > 0 ? Math.round((dayPnl / prevMv) * 10000) / 100 : 0;

      newSettlements.push({
        date,
        marketValue: mv,
        dayPnl,
        dayPnlPct,
        settledAt: nowIso,
        backfilled: date < latestQuoteDate
      });

      if (date < latestQuoteDate && inv.accountId) {
        backfilledSnapshots.push(
          buildHistoricalSnapshot(date, inv.accountId, mv, [...window.mono.snapshots, ...backfilledSnapshots], window.mono.accounts)
        );
      }
    }

    return { newSettlements, backfilledSnapshots };
  }

  async function syncQuotes({ manual = false } = {}) {
    const inv = getInvestments();
    if (!inv.holdings.length) return { ok: true, skipped: true };
    if (syncing) return { ok: false, skipped: true };
    if (!manual && Date.now() - lastAutoSyncMs < 45000) return { ok: true, skipped: true };

    syncing = true;
    syncError = '';
    if (manual) {
      syncNotice = '正在获取最新行情…';
      if (location.hash.slice(1) === 'investments') render();
    }

    try {
      const symbols = inv.holdings.map(h => h.market + h.code);
      const res = await window.MonoServices.fetchQuotes(symbols);
      const quoteMap = new Map((res.quotes || []).map(q => [q.symbol, q]));
      if (!quoteMap.size) {
        throw new Error('未获取到有效行情数据，请检查网络或股票代码。');
      }

      const nowIso = new Date().toISOString();
      let latestQuoteDate = '';
      const updatedHoldings = inv.holdings.map(h => {
        const sym = h.market + h.code;
        const q = quoteMap.get(sym);
        if (!q) return h;
        if (q.quoteDate && q.quoteDate > latestQuoteDate) latestQuoteDate = q.quoteDate;
        return {
          ...h,
          name: q.name || h.name,
          lastPrice: q.price,
          prevClose: q.prevClose,
          change: q.change,
          changePct: q.changePct,
          quoteDate: q.quoteDate || h.quoteDate,
          quoteTime: q.quoteTime || h.quoteTime,
          updatedAt: nowIso
        };
      });

      const nextInv = {
        ...inv,
        holdings: updatedHoldings,
        lastSyncAt: nowIso
      };
      if (!nextInv.holdingsTimeline?.length && latestQuoteDate) {
        nextInv.holdingsTimeline = upsertTimeline([], latestQuoteDate, updatedHoldings);
      }

      const bjNow = window.MonoServices.beijingNow();
      let backfilledSnapshots = [];
      let settledCount = 0;

      if (latestQuoteDate &&
          window.MonoServices.isDateSettledNow(latestQuoteDate, bjNow) &&
          nextInv.lastSettledDate !== latestQuoteDate) {
        const { newSettlements, backfilledSnapshots: snaps } = await computeMissedSettlements(nextInv, quoteMap, latestQuoteDate);
        backfilledSnapshots = snaps;
        if (newSettlements.length) {
          const existingMap = new Map((nextInv.settlements || []).map(s => [s.date, s]));
          for (const s of newSettlements) existingMap.set(s.date, s);
          nextInv.settlements = Array.from(existingMap.values())
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 60);
          nextInv.lastSettledDate = latestQuoteDate;
          settledCount = newSettlements.length;
        }
      }

      const summary = computeSummary(updatedHoldings);
      lastAutoSyncMs = Date.now();
      syncNotice = settledCount > 1
        ? `已完成 ${latestQuoteDate} 收盘结算，并自动补齐 ${settledCount - 1} 个交易日快照`
        : settledCount === 1
          ? `已完成 ${latestQuoteDate} 每日自动结算`
          : manual ? '实时行情已更新并同步至净资产' : '';

      window.mono.syncInvestmentState({
        investments: nextInv,
        syncedBalance: summary.marketValue,
        createAccountIfMissing: true,
        backfilledSnapshots,
        snapshotDate: window.mono.personal ? (latestQuoteDate || bjNow.date) : undefined
      });
      scheduleLivePolling();
      return { ok: true, settledCount };
    } catch (err) {
      syncError = err?.message || '行情刷新失败，请稍后重试。';
      syncNotice = '';
      if (location.hash.slice(1) === 'investments') render();
      return { ok: false, message: syncError };
    } finally {
      syncing = false;
      if (location.hash.slice(1) === 'investments') render();
    }
  }

  function scheduleLivePolling() {
    clearInterval(liveTimer);
    liveTimer = null;
    const inv = getInvestments();
    if (!inv.holdings.length) return;
    liveTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const bj = window.MonoServices.beijingNow();
      if (bj.phase === 'trading' || (bj.afterSettlementTime && getInvestments().lastSettledDate !== bj.date)) {
        syncQuotes({ manual: false });
      }
    }, 60000);
  }

  function editHolding(id) {
    if (document.querySelector('dialog[open]')) return;
    const inv = getInvestments();
    const existing = id == null ? null : inv.holdings.find(h => String(h.id) === String(id));
    if (id != null && !existing) return;

    const dialog = el('dialog', 'mp-dialog mp-holding-dialog');
    dialog.setAttribute('aria-labelledby', 'mp-holding-title');

    const head = el('div', 'mp-dialog-head');
    const title = el('h2', '', existing ? '编辑持仓' : '添加 A 股持仓');
    title.id = 'mp-holding-title';
    const close = el('button', 'mp-close');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭');
    close.append(icon('close'));
    close.addEventListener('click', () => closeSheet(dialog));
    head.append(title, close);

    const form = el('form', 'mp-form');
    const fields = el('div', 'mp-fields');

    const codeWrap = el('label', 'mp-field');
    codeWrap.append(el('span', '', '股票 / ETF / 基金代码'));
    const codeInput = el('input');
    codeInput.type = 'text';
    codeInput.inputMode = 'numeric';
    codeInput.maxLength = 10;
    codeInput.placeholder = '输入 6 位代码，如 600519 / 510300 / 008163';
    codeInput.value = existing ? existing.code : '';
    codeInput.disabled = Boolean(existing);
    codeWrap.append(codeInput);

    const quotePill = el('div', 'inv-lookup-pill');
    const candidateBar = el('div', 'inv-candidates');
    candidateBar.hidden = true;
    let lookupCandidates = [];
    let lookedUp = existing ? {
      symbol: existing.market + existing.code,
      market: existing.market,
      code: existing.code,
      name: existing.name,
      price: existing.lastPrice,
      prevClose: existing.prevClose,
      change: existing.change,
      changePct: existing.changePct,
      quoteDate: existing.quoteDate,
      quoteTime: existing.quoteTime
    } : null;

    const sharesWrap = el('label', 'mp-field');
    const sharesLabel = el('span', '', existing?.market === 'jj' ? '持有份额' : '持仓股数');
    sharesWrap.append(sharesLabel);
    const sharesInput = el('input');
    sharesInput.type = 'number';
    sharesInput.inputMode = 'decimal';
    sharesInput.min = '0.0001';
    sharesInput.step = 'any';
    sharesInput.placeholder = existing?.market === 'jj' ? '例如 1000.00' : '例如 100';
    sharesInput.value = existing ? String(existing.shares) : '';
    sharesWrap.append(sharesInput);

    const costWrap = el('label', 'mp-field');
    const costLabel = el('span', '', existing?.market === 'jj' ? '持仓成本净值（元，选填）' : '持仓成本价（元，选填）');
    costWrap.append(costLabel);
    const costInput = el('input');
    costInput.type = 'number';
    costInput.inputMode = 'decimal';
    costInput.min = '0';
    costInput.step = '0.0001';
    costInput.placeholder = '用于计算累计盈亏，可留空';
    costInput.value = existing?.costPrice != null ? String(existing.costPrice) : '';
    costWrap.append(costInput);

    const estPreview = el('div', 'mp-batch-preview');
    const estValue = el('output', 'mp-batch-total', '—');
    estPreview.append(el('span', '', '预计持仓市值'), estValue);

    const feedback = el('p', 'mp-feedback');
    feedback.setAttribute('role', 'alert');

    fields.append(codeWrap, quotePill, candidateBar, sharesWrap, costWrap, estPreview);

    const footer = el('div', 'mp-actions');
    if (existing) {
      const delBtn = el('button', 'mp-danger', '删除持仓');
      delBtn.type = 'button';
      delBtn.addEventListener('click', () => {
        const nextHoldings = inv.holdings.filter(h => String(h.id) !== String(existing.id));
        const bjToday = window.MonoServices.beijingNow().date;
        const nextInv = {
          ...inv,
          holdings: nextHoldings,
          holdingsTimeline: upsertTimeline(inv.holdingsTimeline, bjToday, nextHoldings)
        };
        const summary = computeSummary(nextHoldings);
        closeSheet(dialog);
        window.mono.syncInvestmentState({
          investments: nextInv,
          syncedBalance: summary.marketValue
        });
      });
      footer.append(delBtn);
    }

    const cancelBtn = el('button', 'mp-secondary', '取消');
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', () => closeSheet(dialog));
    const submitBtn = el('button', 'mp-primary', existing ? '保存持仓' : '添加持仓');
    submitBtn.type = 'submit';
    footer.append(cancelBtn, submitBtn);

    form.append(fields, feedback, footer);
    dialog.append(head, form);

    let lookupSeq = 0;
    let lookupTimer = null;

    function refreshEstimate() {
      const shares = Number(sharesInput.value);
      const price = Number(lookedUp?.price || 0);
      if (Number.isFinite(shares) && shares > 0 && price > 0) {
        estValue.textContent = '¥' + window.mono.money(Math.round(shares * price * 100) / 100);
      } else {
        estValue.textContent = '—';
      }
    }

    function syncFieldLabels() {
      const isFund = lookedUp?.market === 'jj';
      sharesLabel.textContent = isFund ? '持有份额' : '持仓股数';
      sharesInput.placeholder = isFund ? '例如 1000.00' : '例如 100';
      costLabel.textContent = isFund ? '持仓成本净值（元，选填）' : '持仓成本价（元，选填）';
    }

    function renderCandidates() {
      candidateBar.replaceChildren();
      if (lookupCandidates.length <= 1) {
        candidateBar.hidden = true;
        return;
      }
      candidateBar.hidden = false;
      lookupCandidates.forEach(item => {
        const mkt = window.MonoServices.marketLabel(item.market, item.code);
        const btn = el('button', 'inv-candidate-chip' + (lookedUp?.symbol === item.symbol ? ' is-selected' : ''),
          `${mkt} · ${item.name}`);
        btn.type = 'button';
        btn.addEventListener('click', () => {
          lookedUp = item;
          renderCandidates();
          renderLookupPill('');
        });
        candidateBar.append(btn);
      });
    }

    function renderLookupPill(stateText, isError = false) {
      quotePill.replaceChildren();
      quotePill.className = 'inv-lookup-pill' + (isError ? ' is-error' : lookedUp ? ' is-ready' : '');
      if (lookedUp && !stateText) {
        const mkt = window.MonoServices.marketLabel(lookedUp.market, lookedUp.code);
        const pricePrefix = lookedUp.market === 'jj' ? '净值 ' : '¥';
        const left = el('span', 'inv-lookup-name', `${lookedUp.name} (${mkt} ${lookedUp.code})`);
        const right = el('strong', 'inv-lookup-price ' + trendClass(lookedUp.changePct),
          `${pricePrefix}${formatPrice(lookedUp.price, lookedUp.market)} (${formatPct(lookedUp.changePct)})`);
        quotePill.append(left, right);
      } else {
        quotePill.textContent = stateText || '输入 6 位代码后自动识别 A 股、ETF 或场外基金';
      }
      syncFieldLabels();
      refreshEstimate();
    }

    async function doLookup() {
      const candidates = window.MonoServices.candidateSymbols(codeInput.value);
      if (!candidates.length) {
        lookedUp = null;
        lookupCandidates = [];
        renderCandidates();
        renderLookupPill(codeInput.value.trim() ? '请输入有效的 6 位股票、ETF 或基金代码' : '');
        return;
      }
      const seq = ++lookupSeq;
      lookupCandidates = [];
      renderCandidates();
      renderLookupPill(`正在查询 ${codeInput.value.trim().toUpperCase()} 最新行情…`);
      try {
        const res = await window.MonoServices.lookupCode(codeInput.value);
        if (seq !== lookupSeq) return;
        const foundList = res.quotes || [];
        if (!foundList.length) {
          lookedUp = null;
          renderLookupPill(`未查到 ${codeInput.value.trim().toUpperCase()}，请核对 6 位代码是否正确`, true);
          return;
        }
        lookupCandidates = foundList;
        lookedUp = foundList[0];
        renderCandidates();
        renderLookupPill('');
      } catch {
        if (seq !== lookupSeq) return;
        lookedUp = null;
        lookupCandidates = [];
        renderCandidates();
        renderLookupPill('行情查询失败，请检查网络连接', true);
      }
    }

    codeInput.addEventListener('input', () => {
      feedback.textContent = '';
      clearTimeout(lookupTimer);
      const digits = codeInput.value.replace(/\D/g, '');
      if (digits.length >= 6) {
        lookupTimer = setTimeout(doLookup, 260);
      } else {
        lookedUp = null;
        lookupCandidates = [];
        renderCandidates();
        renderLookupPill('');
      }
    });

    sharesInput.addEventListener('input', () => {
      feedback.textContent = '';
      refreshEstimate();
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      feedback.textContent = '';

      if (!existing && !lookedUp) {
        await doLookup();
        if (!lookedUp) {
          feedback.textContent = '请先输入有效的 6 位股票、ETF 或基金代码并等待查询成功。';
          codeInput.focus();
          return;
        }
      }

      const shares = Number(sharesInput.value);
      if (!Number.isFinite(shares) || shares <= 0 || shares > 999999999) {
        feedback.textContent = '请输入有效的持仓股数（需大于 0）。';
        sharesInput.focus();
        return;
      }

      const rawCost = costInput.value.trim();
      let costPrice = null;
      if (rawCost !== '') {
        const parsedCost = Number(rawCost);
        if (!Number.isFinite(parsedCost) || parsedCost < 0 || parsedCost > 999999) {
          feedback.textContent = '成本价格式无效。';
          costInput.focus();
          return;
        }
        costPrice = Math.round(parsedCost * 10000) / 10000;
      }

      const nowIso = new Date().toISOString();
      const bjToday = window.MonoServices.beijingNow().date;
      let nextHoldings;

      if (existing) {
        nextHoldings = inv.holdings.map(h => String(h.id) === String(existing.id) ? {
          ...h,
          shares: Math.round(shares * 10000) / 10000,
          costPrice,
          updatedAt: nowIso
        } : h);
      } else {
        const dup = inv.holdings.find(h => h.market === lookedUp.market && h.code === lookedUp.code);
        if (dup) {
          // Merge or update existing holding cleanly
          nextHoldings = inv.holdings.map(h => h === dup ? {
            ...h,
            name: lookedUp.name,
            shares: Math.round((h.shares + shares) * 10000) / 10000,
            costPrice: costPrice != null ? costPrice : h.costPrice,
            lastPrice: lookedUp.price,
            prevClose: lookedUp.prevClose,
            change: lookedUp.change,
            changePct: lookedUp.changePct,
            quoteDate: lookedUp.quoteDate,
            quoteTime: lookedUp.quoteTime,
            updatedAt: nowIso
          } : h);
        } else {
          nextHoldings = [
            ...inv.holdings,
            {
              id: globalThis.crypto?.randomUUID?.() || ('stk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
              code: lookedUp.code,
              market: lookedUp.market,
              name: lookedUp.name,
              shares: Math.round(shares * 10000) / 10000,
              costPrice,
              lastPrice: lookedUp.price,
              prevClose: lookedUp.prevClose,
              change: lookedUp.change,
              changePct: lookedUp.changePct,
              quoteDate: lookedUp.quoteDate,
              quoteTime: lookedUp.quoteTime,
              updatedAt: nowIso
            }
          ];
        }
      }

      const nextInv = {
        ...inv,
        holdings: nextHoldings,
        holdingsTimeline: upsertTimeline(inv.holdingsTimeline, bjToday, nextHoldings),
        lastSyncAt: nowIso
      };
      const summary = computeSummary(nextHoldings);
      closeSheet(dialog);
      window.mono.syncInvestmentState({
        investments: nextInv,
        syncedBalance: summary.marketValue,
        createAccountIfMissing: true
      });
      scheduleLivePolling();
    });

    renderLookupPill('');
    openSheet(dialog);
    if (!window.matchMedia('(max-width: 700px), (pointer: coarse)').matches) {
      (existing ? sharesInput : codeInput).focus();
    }
  }

  function getMarketBadge(inv) {
    const bj = window.MonoServices.beijingNow();
    if (syncing) return { text: '同步行情中…', cls: '' };
    if (!inv.holdings.length) return { text: '未添加持仓', cls: '' };
    if (bj.phase === 'trading') return { text: '盘中实时联动', cls: 'is-live' };
    if (bj.phase === 'noon') return { text: '午间休市', cls: '' };
    if (inv.lastSettledDate === bj.date) return { text: '今日已自动结算', cls: 'is-settled' };
    if (bj.isWeekend) return { text: inv.lastSettledDate ? `已结算至 ${inv.lastSettledDate}` : '周末休市', cls: 'is-settled' };
    if (bj.phase === 'pre') return { text: '盘前 · 开盘自动更新', cls: '' };
    return { text: inv.lastSettledDate ? `已结算至 ${inv.lastSettledDate}` : '待收盘自动结算', cls: '' };
  }

  function render() {
    const root = document.getElementById('secondary');
    if (!root) return;
    const inv = getInvestments();
    const holdings = inv.holdings || [];
    const summary = computeSummary(holdings);

    const wrap = el('div', 'mp-page inv-page');

    // Page heading
    const heading = el('header', 'mp-heading');
    const headingText = el('div', 'inv-head-title');
    headingText.append(el('h1', '', 'A 股投资'));
    const badgeInfo = getMarketBadge(inv);
    headingText.append(el('span', 'inv-status-pill ' + badgeInfo.cls, badgeInfo.text));

    const controls = el('div', 'mp-heading-actions');
    if (holdings.length) {
      const refreshBtn = el('button', 'mp-secondary inv-refresh-btn');
      refreshBtn.type = 'button';
      refreshBtn.disabled = syncing;
      refreshBtn.append(icon('refresh'), document.createTextNode(syncing ? '刷新中' : '刷新行情'));
      refreshBtn.addEventListener('click', () => syncQuotes({ manual: true }));
      controls.append(refreshBtn);
    }
    const addBtn = el('button', 'mp-primary mp-page-add');
    addBtn.type = 'button';
    addBtn.append(icon('plus'), document.createTextNode('添加持仓'));
    addBtn.addEventListener('click', () => editHolding());
    controls.append(addBtn);
    heading.append(headingText, controls);
    wrap.append(heading);

    // Metrics hero card (Red-Up / Green-Down)
    const metrics = el('section', 'mp-metrics inv-metrics');
    metrics.setAttribute('aria-label', 'A 股持仓汇总');

    const mvBlock = el('div', 'mp-metric mp-emphasis');
    mvBlock.append(el('div', 'mp-meta', '持仓总市值'));
    const mvNode = el('div', 'mp-value inv-val', formatMoney(summary.marketValue));
    mvNode.dataset.amountKey = 'inv-mv';
    mvBlock.append(mvNode);

    const dayBlock = el('div', 'mp-metric');
    dayBlock.append(el('div', 'mp-meta', '今日盈亏'));
    const dayNode = el('div', 'mp-value inv-pnl ' + trendClass(summary.dayPnl),
      holdings.length ? formatSignedMoney(summary.dayPnl) : '—');
    dayNode.dataset.amountKey = 'inv-day-pnl';
    const dayPctNode = el('div', 'inv-sub-pct ' + trendClass(summary.dayPnl),
      holdings.length ? formatPct(summary.dayPnlPct) : '');
    dayBlock.append(dayNode, dayPctNode);

    const thirdBlock = el('div', 'mp-metric');
    if (summary.hasCost) {
      thirdBlock.append(el('div', 'mp-meta', '累计盈亏'));
      const totalNode = el('div', 'mp-value inv-pnl ' + trendClass(summary.totalPnl), formatSignedMoney(summary.totalPnl));
      totalNode.dataset.amountKey = 'inv-total-pnl';
      const totalPctNode = el('div', 'inv-sub-pct ' + trendClass(summary.totalPnl), formatPct(summary.totalPnlPct));
      thirdBlock.append(totalNode, totalPctNode);
    } else {
      thirdBlock.append(el('div', 'mp-meta', '持仓标的'));
      const cntNode = el('div', 'mp-value', `${holdings.length} 只`);
      const hintNode = el('div', 'mp-meta', inv.lastSettledDate ? `上次结算 ${inv.lastSettledDate}` : '15:05 自动结算');
      thirdBlock.append(cntNode, hintNode);
    }

    metrics.append(mvBlock, dayBlock, thirdBlock);
    wrap.append(metrics);

    // Sync notice or error banner
    if (syncError || syncNotice) {
      const banner = el('div', 'inv-banner' + (syncError ? ' is-error' : ''));
      banner.setAttribute('role', 'status');
      banner.textContent = syncError || syncNotice;
      wrap.append(banner);
    }

    // Linked account sync strip
    const investAccounts = window.mono.accounts.filter(a => a.type === '投资资产');
    if (holdings.length) {
      const strip = el('div', 'inv-link-strip');
      const left = el('div', 'inv-link-left');
      left.append(icon('link'), el('span', '', '市值自动同步至'));
      const select = el('select', 'mp-filter inv-link-select');
      select.setAttribute('aria-label', '选择自动同步的投资账户');
      if (!investAccounts.length) {
        select.add(new Option('A股持仓（将自动创建）', ''));
      } else {
        investAccounts.forEach(acc => select.add(new Option(acc.name, String(acc.id))));
        if (inv.accountId && investAccounts.some(a => String(a.id) === String(inv.accountId))) {
          select.value = String(inv.accountId);
        }
      }
      select.addEventListener('change', () => {
        const nextInv = { ...inv, accountId: select.value || null };
        window.mono.syncInvestmentState({
          investments: nextInv,
          syncedBalance: summary.marketValue
        });
      });

      const mobileRefresh = el('button', 'mp-secondary inv-mobile-refresh');
      mobileRefresh.type = 'button';
      mobileRefresh.disabled = syncing;
      mobileRefresh.append(icon('refresh'), document.createTextNode(syncing ? '同步中' : '刷新'));
      mobileRefresh.addEventListener('click', () => syncQuotes({ manual: true }));

      strip.append(left, select, mobileRefresh);
      wrap.append(strip);
    }

    // Holdings list box
    const box = el('section', 'mp-box');
    const bar = el('div', 'mp-box-head');
    bar.append(el('h2', '', '持仓明细'));
    if (inv.lastSyncAt) {
      const syncDate = new Date(inv.lastSyncAt);
      const hh = String(syncDate.getHours()).padStart(2, '0');
      const mm = String(syncDate.getMinutes()).padStart(2, '0');
      bar.append(el('span', 'mp-meta', `更新于 ${hh}:${mm}`));
    }

    const list = el('div', 'inv-list');
    if (!holdings.length) {
      const emptyWrap = el('div', 'inv-empty-state');
      emptyWrap.append(
        el('p', 'mp-empty', '输入 6 位 A 股或场内 ETF 代码与持仓股数，盘中实时联动总净资产，每日收盘后自动结算并记录走势快照。')
      );
      const startBtn = el('button', 'mp-primary');
      startBtn.type = 'button';
      startBtn.append(icon('plus'), document.createTextNode('添加第一只 A 股持仓'));
      startBtn.addEventListener('click', () => editHolding());
      emptyWrap.append(startBtn);
      list.append(emptyWrap);
    } else {
      holdings.forEach(h => {
        const price = Number(h.lastPrice) > 0 ? Number(h.lastPrice) : Number(h.prevClose || 0);
        const prev = Number(h.prevClose) > 0 ? Number(h.prevClose) : price;
        const mv = Math.round(price * h.shares * 100) / 100;
        const dayPnl = Math.round((price - prev) * h.shares * 100) / 100;
        const hasItemCost = Number.isFinite(Number(h.costPrice)) && Number(h.costPrice) > 0;
        const cumPnl = hasItemCost ? Math.round((price - Number(h.costPrice)) * h.shares * 100) / 100 : null;
        const mkt = window.MonoServices.marketLabel(h.market, h.code);

        const row = el('button', 'inv-row');
        row.type = 'button';

        const left = el('div', 'inv-row-left');
        const nameLine = el('div', 'inv-name-line');
        nameLine.append(
          el('strong', '', h.name || h.code),
          el('span', 'inv-code-tag', `${mkt} ${h.code}`)
        );
        const priceLine = el('div', 'mp-meta inv-price-line');
        const pctTag = el('span', 'inv-inline-pct ' + trendClass(h.changePct), formatPct(h.changePct));
        const unitLabel = h.market === 'jj' ? '份' : '股';
        const priceLabel = h.market === 'jj' ? '净值' : '现价 ¥';
        priceLine.append(
          document.createTextNode(`${formatShares(h.shares)} ${unitLabel} · ${priceLabel}${formatPrice(price, h.market)} `),
          pctTag
        );
        left.append(nameLine, priceLine);

        const right = el('div', 'inv-row-right');
        const mvEl = el('strong', 'inv-row-mv inv-val', formatMoney(mv));
        mvEl.dataset.amountKey = 'holding-mv-' + h.id;
        const pnlEl = el('span', 'inv-row-pnl inv-pnl ' + trendClass(dayPnl), `日 ${formatSignedMoney(dayPnl)}`);
        pnlEl.dataset.amountKey = 'holding-pnl-' + h.id;
        right.append(mvEl, pnlEl);
        if (hasItemCost) {
          const cumEl = el('span', 'inv-row-cum ' + trendClass(cumPnl), `总 ${formatSignedMoney(cumPnl)}`);
          right.append(cumEl);
        }

        row.append(left, right);
        row.addEventListener('click', () => editHolding(h.id));
        list.append(row);
      });
    }

    box.append(bar, list);
    wrap.append(box);

    // Recent Daily Settlement History
    const settlements = Array.isArray(inv.settlements) ? inv.settlements : [];
    if (settlements.length) {
      const logBox = el('section', 'mp-box inv-log-box');
      const logHead = el('div', 'mp-box-head');
      logHead.append(el('h2', '', '每日自动结算记录'), el('span', 'mp-meta', `最近 ${Math.min(10, settlements.length)} 个交易日`));
      const logList = el('div', 'inv-log-list');
      settlements.slice(0, 10).forEach(entry => {
        const row = el('div', 'inv-log-row');
        const left = el('div', 'inv-log-left');
        left.append(el('strong', '', entry.date));
        if (entry.backfilled) left.append(el('span', 'inv-code-tag', 'K线补齐'));
        const right = el('div', 'inv-log-right');
        right.append(
          el('span', 'inv-val', formatMoney(entry.marketValue)),
          el('span', 'inv-log-pnl ' + trendClass(entry.dayPnl),
            `${formatSignedMoney(entry.dayPnl)} (${formatPct(entry.dayPnlPct)})`)
        );
        row.append(left, right);
        logList.append(row);
      });
      logBox.append(logHead, logList);
      wrap.append(logBox);
    }

    root.replaceChildren(wrap);
  }

  window.MonoInvestments = {
    render,
    editHolding,
    syncQuotes,
    autoSync: () => syncQuotes({ manual: false })
  };
})();
