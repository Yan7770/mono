(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const icons = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.3"/><rect x="14" y="3" width="7" height="7" rx="1.3"/><rect x="3" y="14" width="7" height="7" rx="1.3"/><rect x="14" y="14" width="7" height="7" rx="1.3"/>',
    wallet:'<path d="M4 7.5 16.5 4a2 2 0 0 1 2.5 1.8V8"/><rect x="3" y="7.8" width="18" height="12.2" rx="2.3"/><path d="M21 12h-5a2 2 0 0 0 0 4h5"/><circle cx="16.3" cy="14" r=".55"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    calendar:'<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7 3v4m10-4v4M4 10h16"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    chevron:'<path d="m6 9 6 6 6-6"/>',right:'<path d="m9 6 6 6-6 6"/>',
    eye:'<path d="M2 12s3.6-6.4 10-6.4S22 12 22 12s-3.6 6.4-10 6.4S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
    closed:'<path d="m3 3 18 18M10.4 5.8a12.2 12.2 0 0 1 1.6-.2c6.4 0 10 6.4 10 6.4a19 19 0 0 1-3.3 4M6.3 7.8A19 19 0 0 0 2 12s3.6 6.4 10 6.4c2.2 0 4.1-.7 5.6-1.7"/>',
    pulse:'<path d="M3 3v17h18M6 14l5-5 4 3 6-7"/>',
    pie:'<path d="M10.5 3.5A8.6 8.6 0 1 0 20.5 13H10.5Z"/><path d="M14 2.5v7h7a8.3 8.3 0 0 0-7-7Z"/>',
    up:'<path d="m4 16 6-6 4 3 6-8m-6 0h6v6"/>',
    down:'<path d="m4 8 6 6 4-3 6 8m-6 0h6v-6"/>',
    bank:'<path d="m3 8 9-5 9 5-1 .7H4ZM4 20h16M6 11v6m6-6v6m6-6v6M3 22h18"/>',
    bars:'<path d="M4 20V11h3v9zm7 0V7h3v13zm7 0V3h3v17z"/>',
    house:'<path d="m2 11 10-8 10 8M5 9v12h5v-7h4v7h5V9"/>',
    gem:'<path d="m3 9 4-5h10l4 5-9 12Zm0 0h18M9 4 7.5 9 12 21l4.5-12L15 4"/>'
  };
  const symbol = key => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">' + icons[key] + '</svg>';
  const tag = key => '<i data-icon="' + key + '">' + symbol(key) + '</i>';
  document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = symbol(el.dataset.icon));
  const types = {
    '投资资产':{color:'#c9b184',icon:'bars'}, '固定资产':{color:'#8d9f9a',icon:'house'},
    '现金存款':{color:'#8393a6',icon:'bank'}, '其他资产':{color:'#9d8c81',icon:'gem'},
    '负债':{color:'#a3938b',icon:'wallet'}
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
  function readState() {
    try {
      const stored = JSON.parse(localStorage.getItem(key));
      if (Array.isArray(stored?.accounts) && Array.isArray(stored?.goals)) return stored;
    } catch {}
    return seed;
  }
  const state = readState();
  const today = () => {
    const d = new Date();
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  };
  const format = new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
  let writeFailed = false;
  let period = '1Y';
  const mono = window.mono = {
    accounts:state.accounts, goals:state.goals, hidden:!!state.hidden, edited:!!state.edited,
    personal:!!state.personal,snapshots:state.snapshots||[],
    money(value) {return this.hidden ? '••••••' : format.format(value)},
    save() {
      this.edited = true;
      if(this.personal && (this.accounts.length || this.snapshots.length)){
        const date=today();
        const net=this.accounts.reduce((sum,a)=>sum+(a.type==='负债'?-1:1)*Math.round(a.balance*100),0)/100;
        const previous=this.snapshots.find(s=>s.date===date);
        if(previous) previous.net=net; else this.snapshots.push({date,net});
      }
      persist(); render();
    }
  };
  function persist() {
    const {accounts,goals,hidden,edited,personal,snapshots} = mono;
    try {localStorage.setItem(key,JSON.stringify({accounts,goals,hidden,edited,personal,snapshots})); writeFailed=false}
    catch {writeFailed=true}
  }
  function route() {
    const page = location.hash.slice(1);
    return ['goals','accounts'].includes(page) ? page : 'overview';
  }
  function allocation(sums, gross) {
    const items = Object.entries(types).filter(([type]) => type !== '负债' && sums[type]>0)
      .sort(([a],[b]) => sums[b]-sums[a]);
    byId('classCount').textContent=items.length;
    const ring = byId('allocationDonut');
    ring.innerHTML = '<circle cx="90" cy="90" r="66" fill="none" stroke="#303132" stroke-width="19"/><circle cx="90" cy="90" r="51" fill="none" stroke="#383936" stroke-width=".7"/>';
    const circumference = Math.PI*132;
    let offset = 0;
    const legend = byId('allocationLegend');
    legend.replaceChildren();
    for (const [name,{color}] of items) {
      const share = sums[name] / gross;
      const arc = circumference*share;
      const segment = document.createElementNS('http://www.w3.org/2000/svg','circle');
      const gap = items.length>1 ? Math.min(3.8,arc*.3) : 0;
      for(const [k,v] of Object.entries({cx:90,cy:90,r:66,fill:'none',stroke:color,'stroke-width':19,'stroke-dasharray':(arc-gap)+' '+(circumference-arc+gap),'stroke-dashoffset':-offset,transform:'rotate(-90 90 90)'})) segment.setAttribute(k,v);
      ring.append(segment);
      offset+=arc;
      const row=document.createElement('div');
      row.className='legend-row';
      row.innerHTML='<b style="background:'+color+'"></b><span>'+name+'</span><span class="rule"></span><strong>'+(share*100).toFixed(1)+'%</strong>';
      legend.append(row);
    }
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
      row.querySelector('.amount').textContent=(mono.hidden?'':'¥ ')+mono.money(account.balance);
      row.querySelector('.share-track span').style.width=share+'%';
      row.querySelector('.share-value').textContent=account.type==='负债'?'—':share.toFixed(1)+'%';
      row.querySelector('.row-open').setAttribute('aria-label','编辑'+account.name);
      row.querySelectorAll('button').forEach(b=>b.onclick=()=>window.MonoPanels.editAccount(account.id));
    });
    if (!mono.accounts.length) {
      const cell=tbody.insertRow().insertCell();
      cell.colSpan=5;cell.textContent='暂无账户，点击「添加资产」开始。';
    }
  }
  function overview() {
    const sums=Object.fromEntries(Object.keys(types).map(t=>[t,0]));
    for (const a of mono.accounts) sums[a.type]+=Math.round(a.balance*100);
    const gross=Object.entries(sums).reduce((s,[t,v])=>t==='负债'?s:s+v,0)/100;
    const debt=sums['负债']/100;
    const net=gross-debt;
    const [whole,decimal]=mono.money(net).split('.');
    byId('netValue').innerHTML='<span class="unit">¥</span><span>'+whole+'</span>'+(decimal?'<span class="decimals">.'+decimal+'</span>':'');
    byId('grossValue').textContent='¥ '+mono.money(gross);
    byId('debtValue').textContent='¥ '+mono.money(debt);
    const date=mono.personal?today():'2026-11-21';
    const snapshots=mono.personal?mono.snapshots:undefined;
    const dateEl=document.querySelector('.date time');
    dateEl.dateTime=date;
    const [year,month,day]=date.split('-');
    dateEl.textContent=year+'年'+Number(month)+'月'+Number(day)+'日';
    const change=window.trendChange(period,net,snapshots,date);
    const start=net-change;
    const pct=start ? (Math.abs(change/start)*100).toFixed(2)+'%' : '—';
    byId('changeValue').textContent=mono.hidden?'••••••':(change>=0?'+':'−')+mono.money(Math.abs(change));
    byId('changePct').innerHTML=tag(change>=0?'up':'down')+(mono.hidden?'•••':pct);
    const names={'1M':'近一个月','3M':'近三个月','6M':'近六个月','1Y':'近一年',ALL:'全部期间'};
    byId('periodCaption').textContent=names[period]+(change>=0?'净资产增长':'净资产减少');
    document.querySelectorAll('[data-range]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.range===period)));
    if(mono.personal && mono.snapshots.length<2) byId('periodCaption').textContent=mono.snapshots.length?'首日净资产记录':'暂无净资产记录';
    window.renderTrend({period,net,hidden:mono.hidden,date,snapshots});
    for (const t of Object.keys(sums)) sums[t]/=100;
    allocation(sums,gross);
    accountRows(gross);
  }
  function render() {
    const page=route();
    const action=mono.hidden?'显示金额':'隐藏金额';
    byId('togglePrivacy').innerHTML=tag(mono.hidden?'closed':'eye');
    byId('togglePrivacy').title=action;
    byId('togglePrivacy').setAttribute('aria-label',action);
    byId('togglePrivacy').setAttribute('aria-pressed',String(mono.hidden));
    byId('menuPrivacy').innerHTML=tag(mono.hidden?'closed':'eye')+'<span>'+action+'</span>';
    byId('overview').hidden=page!=='overview';
    byId('secondary').hidden=page==='overview';
    document.querySelectorAll('[data-page]').forEach(link=>{
      if(link.dataset.page===page) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
    if(page==='overview') overview(); else window.MonoPanels.render(page);
    byId('startPersonal').hidden=mono.personal;
    byId('dataNote').textContent=writeFailed?'浏览器存储不可用 · 更改仅在本次访问有效':mono.personal?'个人数据 · 本地保存':mono.edited?'历史走势含示例数据 · 本地保存':'示例数据 · 本地保存';
  }
  function closeMenu(){byId('profileMenu').hidden=true;byId('profileBtn').setAttribute('aria-expanded','false')}
  function privacy(){mono.hidden=!mono.hidden;persist();closeMenu();render()}
  byId('togglePrivacy').onclick=privacy;
  byId('menuPrivacy').onclick=privacy;
  byId('profileBtn').onclick=()=>{
    const menu=byId('profileMenu');
    menu.hidden=!menu.hidden;byId('profileBtn').setAttribute('aria-expanded',String(!menu.hidden));
  };
  document.addEventListener('click',e=>{if(!e.target.closest('.profile-wrap')) closeMenu()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!byId('profileMenu').hidden){closeMenu();byId('profileBtn').focus()}});
  byId('addAsset').onclick=()=>window.MonoPanels.editAccount();
  byId('startPersonal').onclick=()=>{closeMenu();byId('startDialog').showModal()};
  byId('cancelStart').onclick=()=>byId('startDialog').close();
  byId('confirmStart').onclick=()=>{
    Object.assign(mono,{accounts:[],goals:[],snapshots:[],personal:true,edited:false});
    byId('startDialog').close();persist();location.hash='overview';render();
  };
  document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{period=b.dataset.range;overview()});
  window.addEventListener('hashchange',()=>{closeMenu();render();window.scrollTo(0,0)});
  window.addEventListener('storage',e=>{
    if(e.key!==key)return;
    const fresh=readState();
    Object.assign(mono,{accounts:fresh.accounts,goals:fresh.goals,hidden:!!fresh.hidden,edited:!!fresh.edited,personal:!!fresh.personal,snapshots:fresh.snapshots||[]});
    document.querySelector('dialog[open]')?.close();
    render();
  });
  render();
})();
