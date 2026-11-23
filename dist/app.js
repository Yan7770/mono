(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const icons = {
    grid:'<path d="M3.5 10.5 12 3.8l8.5 6.7v8a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7z"/><path d="M9.3 20.2v-5.8h5.4v5.8"/>',
    wallet:'<path d="M4 7.5 16.5 4a2 2 0 0 1 2.5 1.8V8"/><rect x="3" y="7.8" width="18" height="12.2" rx="2.3"/><path d="M21 12h-5a2 2 0 0 0 0 4h5"/><circle cx="16.3" cy="14" r=".55"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    entry:'<path d="M7 4v13m-4-4 4 4 4-4m6 7V7m-4 4 4-4 4 4"/>',
    archive:'<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v11h14V9m-10 4h6"/>',
    restore:'<path d="M3 5v5h5M3.8 9a8.5 8.5 0 1 1 .6 7M12 7v5l3 2"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
    moon:'<path d="M20.3 15.2a8.5 8.5 0 0 1-11.5-11.5A8.6 8.6 0 1 0 20.3 15.2Z"/>',
    chevron:'<path d="m6 9 6 6 6-6"/>',right:'<path d="m9 6 6 6-6 6"/>',
    eye:'<path d="M2 12s3.6-6.4 10-6.4S22 12 22 12s-3.6 6.4-10 6.4S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
    closed:'<path d="m3 3 18 18M10.4 5.8a12.2 12.2 0 0 1 1.6-.2c6.4 0 10 6.4 10 6.4a19 19 0 0 1-3.3 4M6.3 7.8A19 19 0 0 0 2 12s3.6 6.4 10 6.4c2.2 0 4.1-.7 5.6-1.7"/>',
    up:'<path d="m4 16 6-6 4 3 6-8m-6 0h6v6"/>',
    down:'<path d="m4 8 6 6 4-3 6 8m-6 0h6v-6"/>',
    flat:'<path d="M4 12h16m-5-5 5 5-5 5"/>',
    bank:'<path d="m3 8 9-5 9 5-1 .7H4ZM4 20h16M6 11v6m6-6v6m6-6v6M3 22h18"/>',
    bars:'<path d="M4 20V11h3v9zm7 0V7h3v13zm7 0V3h3v17z"/>',
    house:'<path d="m2 11 10-8 10 8M5 9v12h5v-7h4v7h5V9"/>',
    gem:'<path d="m3 9 4-5h10l4 5-9 12Zm0 0h18M9 4 7.5 9 12 21l4.5-12L15 4"/>'
  };
  const symbol = key => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">' + icons[key] + '</svg>';
  const tag = key => '<i data-icon="' + key + '">' + symbol(key) + '</i>';
  document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = symbol(el.dataset.icon));
  const types = {
    '投资资产':{color:'var(--allocation-1)',icon:'bars'}, '固定资产':{color:'var(--allocation-2)',icon:'house'},
    '现金存款':{color:'var(--allocation-3)',icon:'bank'}, '其他资产':{color:'var(--allocation-4)',icon:'gem'},
    '负债':{color:'var(--allocation-5)',icon:'wallet'}
  };
  const seed = {
    accounts:[
      {id:'deposit',name:'招行储蓄账户',bank:'招商银行',type:'现金存款',balance:1800000},
      {id:'investment',name:'长期投资组合',bank:'中信证券',type:'投资资产',balance:3850000},
      {id:'home',name:'自住房产',bank:'个人持有',type:'固定资产',balance:2500000},
      {id:'reserve',name:'流动储备金',bank:'工商银行',type:'现金存款',balance:326580},
      {id:'gold',name:'实物黄金',bank:'个人持有',type:'其他资产',balance:550000},
      {id:'mortgage',name:'住房贷款',bank:'建设银行',type:'负债',balance:600000}
    ],
    goals:[{id:'safety',name:'家庭应急储备',target:500000,saved:326580},{id:'travel',name:'环球旅行',target:200000,saved:96000},{id:'pension',name:'退休储备',target:10000000,saved:3850000}],
    hidden:false,edited:false
  };
  const key = 'mono.private-wealth.v1';
  const demoDate = '2026-11-21';
  const maxBalance = 99999999999.99;
  const copy = value => JSON.parse(JSON.stringify(value));
  let storedText = null;
  function readState() {
    try {
      storedText = localStorage.getItem(key);
      const stored = JSON.parse(storedText);
      if (Array.isArray(stored?.accounts) && Array.isArray(stored?.goals)) {
        return {
          accounts: stored.accounts, goals: stored.goals, hidden: !!stored.hidden,
          edited: !!stored.edited, personal: !!stored.personal,
          snapshots: Array.isArray(stored.snapshots) ? stored.snapshots : []
        };
      }
    } catch {}
    return {...copy(seed), personal:false, snapshots:[]};
  }
  const today = () => {
    const d = new Date();
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  };
  const cents = value => Math.round(value * 100);
  const positionValue = position => (position.type === '负债' ? -1 : 1) * cents(position.balance);
  const positions = accounts => accounts.map(({id,name,type,balance}) => ({id,name,type,balance}));
  const netOf = accounts => accounts.reduce((total, account) => total + positionValue(account), 0) / 100;
  const format = new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
  let storageMessage = '';
  let period = '1Y';
  let undoState;
  const state = readState();
  let committedAccounts = copy(state.accounts);
  const mono = window.mono = {
    ...state,
    money(value) {return this.hidden ? '••••••' : format.format(value)},
    save() {
      const candidate = withAccountHistory(this.accounts);
      const result = writeData(candidate);
      undoState = undefined;
      if (result.conflict) {
        acceptData(readState());
        storageMessage = result.message;
      } else {
        acceptData(candidate);
        storageMessage = result.ok ? '' : '浏览器存储不可用 · 更改仅在本次访问有效';
      }
      render();
    },
    updateBalances(changes) {
      const edits = new Map(changes.map(({id,balance}) => [String(id),balance]));
      const existing = new Set(this.accounts.map(account => String(account.id)));
      for (const [id,balance] of edits) {
        if (!existing.has(id) || !Number.isFinite(balance) || balance < 0 ||
            balance > maxBalance || Math.abs(balance - cents(balance) / 100) > 0.000001) {
          return {ok:false, message:'账户或余额已失效，请重新打开更新表单。'};
        }
      }
      const accounts = this.accounts.map(account => {
        const balance = edits.get(String(account.id));
        return balance === undefined || balance === account.balance ? account : {...account,balance};
      });
      if (accounts.every((account,index) => account === this.accounts[index])) {
        return {ok:false, message:'请填写至少一个有变化的余额。'};
      }
      const previous = {accounts:copy(this.accounts), snapshots:this.snapshots, edited:this.edited};
      const candidate = withAccountHistory(accounts);
      const result = writeData(candidate);
      if (result.ok) {
        acceptData(candidate);
        undoState = previous;
        render();
      }
      return result;
    },
    canUndoBalanceUpdate() { return Boolean(undoState); },
    undoBalanceUpdate() {
      if (!undoState) return {ok:false, message:'本次更新已无法撤销。'};
      const candidate = {...currentData(), ...undoState};
      const result = writeData(candidate);
      if (result.ok) {
        undoState = undefined;
        acceptData(candidate);
        render();
      }
      return result;
    },
    captureBackup() {
      return {version:1,createdAt:new Date().toISOString(),data:copy(currentData())};
    },
    restoreBackup(data) {
      const result = writeData(data);
      if (result.ok) {
        undoState = undefined;
        acceptData(data);
        render();
      }
      return result;
    }
  };
  function currentData() {
    const {accounts,goals,hidden,edited,personal,snapshots} = mono;
    return {accounts,goals,hidden,edited,personal,snapshots};
  }
  function emptyPersonalSpace(hidden = false) {
    return {accounts:[], goals:[], snapshots:[], personal:true, edited:false, hidden};
  }
  function acceptData(data) {
    Object.assign(mono,data);
    committedAccounts = copy(data.accounts);
  }
  function writeData(data) {
    try {
      if (localStorage.getItem(key) !== storedText) {
        return {ok:false, conflict:true, message:'另一标签页已更新数据，请刷新页面后重试。'};
      }
      const serialized = JSON.stringify(data);
      localStorage.setItem(key,serialized);
      storedText = serialized;
      storageMessage = '';
      return {ok:true};
    } catch {
      return {ok:false, message:'浏览器无法保存这次更改，请检查可用存储空间后重试。'};
    }
  }
  function withAccountHistory(accounts) {
    const data = {...currentData(), accounts, edited:true};
    const before = positions(committedAccounts);
    const after = positions(accounts);
    if (JSON.stringify(before) === JSON.stringify(after)) return data;

    const oldById = new Map(committedAccounts.map(account => [String(account.id),account]));
    const updatedAt = new Date().toISOString();
    data.accounts = accounts.map(account => {
      const previous = oldById.get(String(account.id));
      return previous?.balance === account.balance ? account : {...account,updatedAt};
    });
    const date = data.personal ? today() : demoDate;
    const previous = data.snapshots.find(snapshot => snapshot.date === date);
    const snapshot = {date,net:netOf(after),accounts:after};
    if (previous?.opening) snapshot.opening = previous.opening;
    else if (before.length) snapshot.opening = {net:netOf(before),accounts:before};
    data.snapshots = [...data.snapshots.filter(entry => entry.date !== date), snapshot]
      .sort((left,right) => left.date.localeCompare(right.date));
    return data;
  }
  function route() {
    const page = location.hash.slice(1);
    return ['goals','accounts'].includes(page) ? page : 'overview';
  }
  function allocation(sums, gross, animateIntro = false) {
    const items = Object.entries(types).filter(([type]) => type !== '负债' && sums[type]>0)
      .sort(([a],[b]) => sums[b]-sums[a]);
    byId('classCount').textContent=items.length;
    const ring = byId('allocationDonut');
    ring.removeAttribute('data-focus');
    ring.innerHTML = '<circle cx="90" cy="90" r="66" fill="none" stroke="var(--allocation-track)" stroke-width="15"/>';
    const circumference = Math.PI*132;
    let offset = 0;
    const legend = byId('allocationLegend');
    legend.removeAttribute('data-focus');
    legend.replaceChildren();
    const shouldAnimate = animateIntro && !window.MonoMotion?.isReduced();
    let activeIdx = null;
    const setFocus = idx => {
      activeIdx = idx;
      if (idx === null) {
        ring.removeAttribute('data-focus');
        legend.removeAttribute('data-focus');
      } else {
        ring.setAttribute('data-focus', String(idx));
        legend.setAttribute('data-focus', String(idx));
      }
      ring.querySelectorAll('circle[data-segment]').forEach(el => {
        el.dataset.active = String(Number(el.dataset.segment) === idx);
      });
      legend.querySelectorAll('.legend-row').forEach(el => {
        el.dataset.active = String(Number(el.dataset.segment) === idx);
      });
    };
    items.forEach(([name,{color}], idx) => {
      const share = sums[name] / gross;
      const arc = circumference*share;
      const segment = document.createElementNS('http://www.w3.org/2000/svg','circle');
      const gap = items.length>1 ? Math.min(4.2,arc*.3) : 0;
      const finalDash = (arc-gap)+' '+(circumference-arc+gap);
      for(const [k,v] of Object.entries({cx:90,cy:90,r:66,fill:'none',stroke:color,'stroke-width':15,'stroke-dasharray':finalDash,'stroke-dashoffset':-offset,transform:'rotate(-90 90 90)','data-segment':idx})) segment.setAttribute(k,v);
      if (shouldAnimate && typeof segment.animate === 'function') {
        segment.animate(
          [
            { strokeDasharray: '0 ' + circumference, strokeDashoffset: 0, opacity: 0.25 },
            { strokeDasharray: finalDash, strokeDashoffset: -offset, opacity: 1 }
          ],
          { duration: 620, delay: idx * 45, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' }
        );
      }
      segment.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') setFocus(idx); });
      segment.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') setFocus(null); });
      segment.addEventListener('click', () => setFocus(activeIdx === idx ? null : idx));
      ring.append(segment);
      offset+=arc;
      const row=document.createElement('div');
      row.className='legend-row';
      row.dataset.segment=String(idx);
      row.innerHTML='<b style="background:'+color+'"></b><span>'+name+'</span><span class="rule"></span><strong>'+(share*100).toFixed(1)+'%</strong>';
      row.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') setFocus(idx); });
      row.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') setFocus(null); });
      row.addEventListener('click', () => setFocus(activeIdx === idx ? null : idx));
      legend.append(row);
    });
    if (!items.length) legend.textContent='添加资产后可查看配置占比';
  }
  function accountRows(gross) {
    byId('accountCount').textContent = mono.accounts.length;
    const tbody=byId('accountRows');
    tbody.replaceChildren();
    mono.accounts.slice(0,3).forEach(account => {
      const def=types[account.type];
      const share = account.type!=='负债' && gross>0 ? account.balance/gross*100 : 0;
      const row=tbody.insertRow();
      row.style.setProperty('--badge',def.color);
      row.innerHTML='<td><button class="asset-name"><span class="asset-badge">'+tag(def.icon)+'</span><span class="asset-copy"><strong></strong><small></small></span></button></td><td><span class="asset-kind"></span></td><td class="align-right amount"></td><td><div class="share"><div class="share-track"><span></span></div><span class="share-value"></span></div></td><td><button class="row-open">'+tag('right')+'</button></td>';
      row.querySelector('strong').textContent=account.name;
      row.querySelector('small').textContent=account.bank;
      row.querySelector('.asset-kind').textContent=account.type;
      const value = row.querySelector('.amount');
      value.dataset.amountKey = 'account-' + account.id;
      value.textContent=(mono.hidden?'':'¥ ')+mono.money(account.balance);
      row.querySelector('.share-track span').style.width=share+'%';
      row.querySelector('.share-value').textContent=account.type==='负债'?'—':share.toFixed(1)+'%';
      row.querySelector('.row-open').setAttribute('aria-label','编辑'+account.name);
      row.querySelectorAll('button').forEach(b=>b.onclick=()=>window.MonoPanels.editAccount(account.id));
    });
    if (!mono.accounts.length) {
      const cell=tbody.insertRow().insertCell();
      cell.colSpan=5;cell.textContent='添加第一个账户后，即可开始记收支。';
    }
  }
  const periodNames = {'1M':'近一个月','3M':'近三个月','6M':'近六个月','1Y':'近一年',ALL:'全部期间'};
  const signedMoney = (value, currency = '') => {
    if (mono.hidden) return '••••••';
    const sign = value === 0 ? '' : value > 0 ? '+' : '−';
    return sign + currency + mono.money(Math.abs(value));
  };
  function renderChangeDetails(comparison, date) {
    const details = byId('changeDetails');
    details.replaceChildren();
    const inner = document.createElement('div');
    inner.className = 'change-details-inner';
    details.append(inner);
    const note = text => {
      const message = document.createElement('p');
      message.className = 'change-note';
      message.textContent = text;
      inner.append(message);
    };
    if (!comparison.startDate) {
      note('更新账户余额后，即可查看变动明细。');
      return;
    }
    let basis = comparison.baseline;
    const partial = !Array.isArray(basis?.accounts);
    if (partial) {
      const firstDetailed = mono.snapshots.find(entry => entry.date >= comparison.startDate &&
        entry.date <= date && Array.isArray(entry.accounts));
      if (!firstDetailed) {
        note('这段历史只记录了净资产总额。以后更新余额时会记录账户明细。');
        return;
      }
      basis = firstDetailed.opening || firstDetailed;
    }

    const before = new Map(basis.accounts.map(account => [String(account.id),account]));
    const after = new Map(mono.accounts.map(account => [String(account.id),account]));
    const changes = [];
    let attributed = 0;
    for (const id of new Set([...before.keys(),...after.keys()])) {
      const previous = before.get(id);
      const current = after.get(id);
      const delta = (current ? positionValue(current) : 0) - (previous ? positionValue(previous) : 0);
      if (!delta) continue;
      attributed += delta;
      const account = current || previous;
      const suffix = !previous ? ' · 新增' : !current ? ' · 已移除' : '';
      changes.push({id, name:account.name, type:account.type + suffix, delta});
    }
    changes.sort((left,right) => Math.abs(right.delta) - Math.abs(left.delta));
    const remainder = cents(comparison.change) - attributed;
    if (partial && remainder) changes.push({name:'早期净资产变动',type:'历史记录仅含总额',delta:remainder});
    if (changes.length === 0) {
      note('所选期间的账户余额没有变化。');
      return;
    }
    if (partial) note('账户明细从首次可比较的记录开始。');
    const list = document.createElement('dl');
    list.className = 'change-list';
    for (const {id,name,type,delta} of changes) {
      const row = document.createElement('div');
      const label = document.createElement('dt');
      label.textContent = name;
      const description = document.createElement('small');
      description.textContent = type;
      label.append(description);
      const value = document.createElement('dd');
      value.dataset.amountKey = id == null ? 'early-change' : 'change-' + id;
      value.textContent = signedMoney(delta / 100,'¥');
      row.append(label,value);
      list.append(row);
    }
    inner.append(list);
    note('按账户列出对净资产的影响。负债减少时，净资产增加。');
  }
  let lastOverviewNet;
  let lastOverviewGross;
  let lastOverviewDebt;
  let lastOverviewChange;
  let lastOverviewWeek;
  function overview({ isIntro = false, rangeChanged = false, canTween = false } = {}) {
    const sums=Object.fromEntries(Object.keys(types).map(t=>[t,0]));
    for (const a of mono.accounts) sums[a.type]+=Math.round(a.balance*100);
    const grossCents=Object.entries(sums).reduce((s,[t,v])=>t==='负债'?s:s+v,0);
    const gross=grossCents/100;
    const debt=sums['负债']/100;
    const net=(grossCents-sums['负债'])/100;
    const netNode = byId('netValue');
    if (canTween && !mono.hidden && Number.isFinite(lastOverviewNet) && lastOverviewNet !== net && window.MonoMotion) {
      window.MonoMotion.tweenNetHero(netNode, lastOverviewNet, net);
    } else {
      window.MonoMotion?.cancelTween(netNode);
      const [whole,decimal]=mono.money(net).split('.');
      netNode.classList.toggle('long-balance',whole.length>11);
      netNode.innerHTML='<span class="unit">¥</span><span class="balance-amount">'+whole+(decimal?'<span class="decimals">.'+decimal+'</span>':'')+'</span>';
    }
    lastOverviewNet = mono.hidden ? undefined : net;
    const grossNode = byId('grossValue');
    if (grossNode) {
      if (canTween && !mono.hidden && Number.isFinite(lastOverviewGross) && lastOverviewGross !== gross && window.MonoMotion) {
        window.MonoMotion.tweenCurrencyText(grossNode, lastOverviewGross, gross, { prefix: '¥ ', duration: 340 });
      } else {
        window.MonoMotion?.cancelTween(grossNode);
        grossNode.textContent = (mono.hidden ? '' : '¥ ') + mono.money(gross);
      }
      lastOverviewGross = mono.hidden ? undefined : gross;
    }
    const debtNode = byId('debtValue');
    if (debtNode) {
      if (canTween && !mono.hidden && Number.isFinite(lastOverviewDebt) && lastOverviewDebt !== debt && window.MonoMotion) {
        window.MonoMotion.tweenCurrencyText(debtNode, lastOverviewDebt, debt, { prefix: '¥ ', duration: 340 });
      } else {
        window.MonoMotion?.cancelTween(debtNode);
        debtNode.textContent = (mono.hidden ? '' : '¥ ') + mono.money(debt);
      }
      lastOverviewDebt = mono.hidden ? undefined : debt;
    }
    const date=mono.personal?today():demoDate;
    const snapshots=mono.personal?mono.snapshots:undefined;
    const weekly = window.trendComparison('7D', net, snapshots, date);
    const movement = byId('weekMovement');
    const arrow = movement.querySelector('i');
    const direction = Math.sign(weekly.change);
    const showArrow = !mono.hidden && Boolean(weekly.startDate);
    movement.dataset.direction = showArrow && direction ? (direction > 0 ? 'up' : 'down') : 'flat';
    arrow.hidden = !showArrow;
    arrow.dataset.icon = movement.dataset.direction;
    arrow.innerHTML = showArrow ? symbol(movement.dataset.direction) : '';
    const weekNode = byId('weekAmount');
    if (canTween && !mono.hidden && weekly.startDate && Number.isFinite(lastOverviewWeek) && lastOverviewWeek !== weekly.change && window.MonoMotion) {
      window.MonoMotion.tweenSignedText(weekNode, lastOverviewWeek, weekly.change, { currency: '¥', forceSign: true, duration: 320 });
    } else {
      window.MonoMotion?.cancelTween(weekNode);
      weekNode.textContent = mono.hidden ? '••••••' : weekly.startDate ? signedMoney(weekly.change, '¥') : '—';
    }
    lastOverviewWeek = mono.hidden || !weekly.startDate ? undefined : weekly.change;
    const dateEl=document.querySelector('.date time');
    dateEl.dateTime=date;
    const [year,month,day]=date.split('-');
    dateEl.textContent=year+'年'+Number(month)+'月'+Number(day)+'日';
    const comparison=window.trendComparison(period,net,snapshots,date);
    const {change,startValue:start}=comparison;
    const pct=start ? (Math.abs(change/start)*100).toFixed(2)+'%' : '—';
    const changeNode = byId('changeValue');
    if (canTween && !mono.hidden && Number.isFinite(lastOverviewChange) && lastOverviewChange !== change && window.MonoMotion) {
      window.MonoMotion.tweenSignedText(changeNode, lastOverviewChange, change, { currency: '', forceSign: true, duration: 340 });
    } else {
      window.MonoMotion?.cancelTween(changeNode);
      changeNode.textContent=signedMoney(change);
    }
    lastOverviewChange = mono.hidden ? undefined : change;
    byId('changePct').innerHTML=(change === 0 ? '' : tag(change>0?'up':'down'))+(mono.hidden?'•••':pct);
    byId('periodCaption').textContent=periodNames[period]+(change>0?'净资产增长':change<0?'净资产减少':'净资产未变');
    document.querySelectorAll('[data-range]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.range===period)));
    const rangeSwitch = document.querySelector('.range-switch');
    const activeRangeBtn = rangeSwitch?.querySelector('[data-range][aria-pressed="true"]');
    window.MonoMotion?.syncSlider(rangeSwitch, activeRangeBtn, { instant: !rangeChanged });
    if(mono.personal && mono.snapshots.length<2) {
      byId('periodCaption').textContent=mono.snapshots.length
        ? (comparison.baseline?.accounts && mono.snapshots[0].opening ? '首日净资产变化' : '首日净资产记录')
        : '暂无净资产记录';
    }
    window.renderTrend({period,net,hidden:mono.hidden,date,snapshots,reveal:isIntro?'intro':rangeChanged?'swap':''});
    renderChangeDetails(comparison,date);
    for (const t of Object.keys(sums)) sums[t]/=100;
    allocation(sums,gross,isIntro);
    accountRows(gross);
  }
  const pageOrder = { overview: 0, accounts: 1, goals: 2 };
  let renderedPage;
  let amountsWereHidden;
  let hasPlayedIntro = false;
  function render({ rangeChanged = false } = {}) {
    const page=route();
    const root = byId(page === 'overview' ? 'overview' : 'secondary');
    const samePage = renderedPage === page;
    const isIntro = page === 'overview' && !hasPlayedIntro;
    const compareAmounts = samePage && !mono.hidden && !amountsWereHidden &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const previousAmounts = compareAmounts ? new Map(Array.from(root.querySelectorAll('[data-amount-key]'),
      node => [node.dataset.amountKey, node.textContent])) : null;
    const action=mono.hidden?'显示金额':'隐藏金额';
    byId('togglePrivacy').innerHTML=tag(mono.hidden?'closed':'eye');
    byId('togglePrivacy').title=action;
    byId('togglePrivacy').setAttribute('aria-label',action);
    byId('togglePrivacy').setAttribute('aria-pressed',String(mono.hidden));
    byId('menuPrivacy').innerHTML=tag(mono.hidden?'closed':'eye')+'<span>'+action+'</span>';
    byId('overview').hidden=page!=='overview';
    byId('secondary').hidden=page==='overview';
    const hasAccounts = mono.accounts.length > 0;
    const addLabel = page === 'goals' ? '添加目标' : hasAccounts ? '记收支或添加账户' : '添加账户';
    byId('overviewEntry').hidden = !hasAccounts;
    byId('addAsset').className = hasAccounts ? 'mp-secondary' : 'mp-primary';
    byId('dockAdd').setAttribute('aria-label',addLabel);
    byId('dockAdd').title=addLabel;
    document.querySelectorAll('[data-page]').forEach(link=>{
      if(link.dataset.page===page) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
    const mainNav = document.querySelector('.mainnav');
    const activeNav = mainNav?.querySelector('[data-page][aria-current="page"]');
    window.MonoMotion?.syncSlider(mainNav, activeNav, { instant: !renderedPage });
    if(page==='overview') {
      overview({ isIntro, rangeChanged, canTween: compareAmounts });
      if (isIntro) {
        hasPlayedIntro = true;
        if (!window.MonoMotion?.isReduced()) {
          root.classList.add('mono-intro-stage');
          root.addEventListener('animationend', () => root.classList.remove('mono-intro-stage'), { once: true });
        }
      }
    } else {
      window.MonoPanels.render(page);
    }
    if (renderedPage && !samePage) {
      const content = page === 'overview' ? root : root.firstElementChild;
      const movingLeft = (pageOrder[page] ?? 0) < (pageOrder[renderedPage] ?? 0);
      content.classList.remove('page-enter', 'from-left');
      void content.offsetWidth;
      content.classList.add('page-enter');
      if (movingLeft) content.classList.add('from-left');
      content.addEventListener('animationend', () => content.classList.remove('page-enter', 'from-left'), { once: true });
    }
    if (previousAmounts) {
      for (const node of root.querySelectorAll('[data-amount-key]')) {
        window.MonoPanels.animateAmountChange(node, previousAmounts.get(node.dataset.amountKey));
      }
    }
    renderedPage = page;
    amountsWereHidden = mono.hidden;
    byId('startPersonal').hidden=mono.personal;
    byId('dataNote').textContent=storageMessage||(mono.personal?'':'体验空间');
  }
  function closeMenu(){
    window.MonoMotion?.hideMenuAnimated(byId('profileMenu'), byId('profileBtn'));
  }
  function privacy(){
    const candidate = {...currentData(),hidden:!mono.hidden};
    const result = writeData(candidate);
    if(result.conflict) {
      undoState = undefined;
      acceptData(readState());
    } else mono.hidden = candidate.hidden;
    if(!result.ok) storageMessage=result.message;
    closeMenu();
    const getVeilNodes = () => {
      const page = route();
      const root = byId(page === 'overview' ? 'overview' : 'secondary');
      return root.querySelectorAll('[data-amount-key], #changePct, .donut-center, .alloc-legend strong, .mp-percent');
    };
    if (window.MonoMotion?.playPrivacyVeil) {
      window.MonoMotion.playPrivacyVeil(getVeilNodes, () => render());
    } else {
      render();
    }
  }
  let detailsCloseTimer;
  byId('changeDetailsButton').onclick=()=>{
    const section = byId('changeDetails');
    const btn = byId('changeDetailsButton');
    const expanding = section.hidden || !section.classList.contains('is-open');
    clearTimeout(detailsCloseTimer);
    if (expanding) {
      section.hidden = false;
      void section.offsetHeight;
      section.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
    } else {
      btn.setAttribute('aria-expanded', 'false');
      section.classList.remove('is-open');
      if (window.MonoMotion?.isReduced()) {
        section.hidden = true;
      } else {
        detailsCloseTimer = setTimeout(() => {
          if (!section.classList.contains('is-open')) section.hidden = true;
        }, 350);
      }
    }
  };
  byId('togglePrivacy').onclick=privacy;
  byId('menuPrivacy').onclick=privacy;
  byId('profileBtn').onclick=()=>{
    const menu=byId('profileMenu');
    const opening = menu.hidden || menu.dataset.closing === '1';
    if (opening) window.MonoMotion?.showMenuAnimated(menu, byId('profileBtn'));
    else closeMenu();
  };
  document.addEventListener('click',e=>{if(!e.target.closest('.profile-wrap')) closeMenu()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!byId('profileMenu').hidden){closeMenu();byId('profileBtn').focus()}});
  byId('addAsset').onclick=()=>window.MonoPanels.editAccount();
  byId('overviewEntry').onclick=()=>window.MonoPanels.recordEntry();
  const quickActions = byId('quickActions');
  window.MonoMotion?.bindDialogEscape(quickActions, () => byId('dockAdd').classList.remove('is-open'));
  byId('dockAdd').onclick=()=>{
    byId('dockAdd').focus({preventScroll:true});
    if(route()==='goals') window.MonoPanels.editGoal();
    else if (!mono.accounts.length) window.MonoPanels.editAccount();
    else {
      quickActions.returnValue = '';
      byId('dockAdd').classList.add('is-open');
      quickActions.showModal();
    }
  };
  quickActions.querySelector('form').addEventListener('submit', event => {
    if (window.MonoMotion?.isReduced()) return;
    event.preventDefault();
    const actionValue = event.submitter?.value || 'cancel';
    byId('dockAdd').classList.remove('is-open');
    window.MonoMotion.closeDialog(quickActions, actionValue);
  });
  quickActions.addEventListener('click', event => {
    if (event.target === quickActions) {
      byId('dockAdd').classList.remove('is-open');
      window.MonoMotion?.closeDialog(quickActions, 'cancel');
    }
  });
  quickActions.addEventListener('close', () => {
    byId('dockAdd').classList.remove('is-open');
    byId('dockAdd').focus({preventScroll:true});
    if (quickActions.returnValue === 'entry') window.MonoPanels.recordEntry();
    if (quickActions.returnValue === 'account') window.MonoPanels.editAccount();
  });
  const startDialog = byId('startDialog');
  window.MonoMotion?.bindDialogEscape(startDialog);
  startDialog.addEventListener('click', event => {
    if (event.target === startDialog) window.MonoMotion?.closeDialog(startDialog);
  });
  byId('startPersonal').onclick=()=>{closeMenu();byId('startError').textContent='';startDialog.showModal()};
  byId('cancelStart').onclick=()=>window.MonoMotion?.closeDialog(startDialog);
  byId('confirmStart').onclick=()=>{
    const candidate = emptyPersonalSpace(mono.hidden);
    const result = writeData(candidate);
    if (!result.ok) {
      byId('startError').textContent = result.message;
      return;
    }
    undoState = undefined;
    acceptData(candidate);
    window.MonoMotion?.closeDialog(startDialog);location.hash='overview';render();
  };
  const resetDialog = byId('resetDialog');
  window.MonoMotion?.bindDialogEscape(resetDialog);
  resetDialog.addEventListener('click', event => {
    if (event.target === resetDialog) window.MonoMotion?.closeDialog(resetDialog);
  });
  const confirmReset = byId('confirmReset');
  let resetReadyAt = Infinity;
  let resetTimer;
  function updateResetCountdown() {
    const remaining = resetReadyAt - performance.now();
    const seconds = Math.max(0, Math.ceil(remaining / 1000));
    confirmReset.disabled = seconds > 0;
    confirmReset.textContent = seconds ? '确认重置（' + seconds + ' 秒）' : '确认重置';
    if (seconds) {
      resetTimer = setTimeout(updateResetCountdown, remaining - (seconds - 1) * 1000);
    }
  }
  byId('resetData').onclick = () => {
    closeMenu();
    byId('resetError').textContent = '';
    confirmReset.disabled = true;
    resetDialog.showModal();
    resetReadyAt = performance.now() + 5000;
    clearTimeout(resetTimer);
    updateResetCountdown();
  };
  byId('cancelReset').onclick = () => window.MonoMotion?.closeDialog(resetDialog);
  resetDialog.addEventListener('close', () => {
    if (resetDialog.open) return;
    clearTimeout(resetTimer);
    resetReadyAt = Infinity;
    confirmReset.disabled = true;
    byId('profileBtn').focus();
  });
  confirmReset.onclick = () => {
    if (!resetDialog.open || confirmReset.disabled || performance.now() < resetReadyAt) return;
    const candidate = emptyPersonalSpace();
    const result = writeData(candidate);
    if (!result.ok) {
      byId('resetError').textContent = result.message;
      return;
    }
    undoState = undefined;
    acceptData(candidate);
    try {
      window.resetMonoTheme();
    } catch {
      render();
      byId('resetError').textContent = '资产数据已清空，主题设置重置失败。请检查浏览器存储权限后重试。';
      return;
    }
    resetDialog.close();
    history.replaceState(null, '', '#overview');
    location.reload();
  };
  document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{
    if (period === b.dataset.range) return;
    period=b.dataset.range;
    render({ rangeChanged: true });
  });
  window.addEventListener('hashchange',()=>{
    if (quickActions.open) quickActions.close();
    closeMenu();render();window.scrollTo(0,0);
  });
  window.addEventListener('storage',e=>{
    if(e.key!==key || e.newValue===storedText)return;
    acceptData(readState());
    storageMessage = '';
    undoState = undefined;
    document.querySelector('dialog[open]')?.close();
    render();
  });
  render();
})();
