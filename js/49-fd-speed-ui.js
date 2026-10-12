// ═════════════════════════════════════════════════════════════════════════════════════════════
// Front desk — speed and presentation.
//   Speed: client stats from a per-mobile index (was every bill × every client), one parsed copy of
//   the bill list until it changes, Excel library loaded after start-up, list paging.
//   Presentation (each with a switch in Controls): compact toolbars with "More ▾", today strip,
//   Ctrl+K search, undo bar, mini charts, calendar badges / now line / staff colours, bill print
//   layouts, phone layout helpers.
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ── 1 · client stats from an index of bills by mobile (built once per bill list) ──
const _fdBillIdx=new WeakMap();
function fdBillsByPhone(bills){let m=_fdBillIdx.get(bills);if(m)return m;m=new Map();(bills||[]).forEach(b=>{const p=fdP10(b&&b.phone);if(p.length!==10)return;let L=m.get(p);if(!L){L=[];m.set(p,L);}L.push(b);});_fdBillIdx.set(bills,m);return m;}
(function(){if(typeof fdClientStats!=='function')return;const base=fdClientStats;fdClientStats=function(c,bills){if(!Array.isArray(bills)||bills.length<50)return base(c,bills);const p=fdP10(c&&c.phone);return base(c,p.length===10?(fdBillsByPhone(bills).get(p)||[]):[]);};})();
// Clients → Follow-ups looked up each client's last visit by scanning every bill (js/37)
(function(){if(typeof foLastVisit!=='function')return;const base=foLastVisit;foLastVisit=function(sid,c,bills){const p=fdP10(c&&c.phone);if(p.length!==10||!Array.isArray(bills)||bills.length<50)return base(sid,c,bills);return base(sid,c,fdBillsByPhone(bills).get(p)||[]);};})();
// ── 7 · one parsed copy of the bill list until it changes (each caller gets its own array) ──
const _fdBillsCache={};
(function(){if(typeof fdBills!=='function')return;const base=fdBills;fdBills=function(sid){const k=outletKey('salonos_billing_invoices',sid);const raw=cachedLocalGet(k);const c=_fdBillsCache[k];
  if(c&&c.raw===raw)return c.val.slice();const v=base(sid);_fdBillsCache[k]={raw,val:v};return v.slice();};})();
// read-only shared copy (never change it) — lets per-card / per-row lookups reuse one index
function fdBillsRO(sid){fdBills(sid);const c=_fdBillsCache[outletKey('salonos_billing_invoices',sid)];return c?c.val:[];}
// the client list — same idea; and family members from an index built once per change
// (fdFamilyPhones scanned every client for every lookup: 1,500 clients × 1,500 = seconds in Clients)
const _fdClientsCache={};
(function(){if(typeof fdClients!=='function')return;const base=fdClients;fdClients=function(sid){const k=outletKey('salonos_clients',sid);const raw=cachedLocalGet(k);const c=_fdClientsCache[k];
  if(c&&c.raw===raw)return c.val.slice();const v=base(sid);_fdClientsCache[k]={raw,val:v};return v.slice();};})();
const _fdFamCache={};
(function(){if(typeof fdFamilyPhones!=='function')return;fdFamilyPhones=function(sid,phone){const p=fdP10(phone);if(!controlOn('familySharing',sid))return[p];const k=outletKey('salonos_clients',sid);const raw=cachedLocalGet(k);let c=_fdFamCache[k];
  if(!c||c.raw!==raw){const fam=new Map(),fid=new Map();fdClients(sid).forEach(x=>{const q=fdP10(x.phone);if(q.length!==10||!x.familyId||fid.has(q))return;fid.set(q,x.familyId);if(!fam.has(x.familyId))fam.set(x.familyId,[]);fam.get(x.familyId).push(q);});c=_fdFamCache[k]={raw,fam,fid};}
  const f=c.fid.get(p);return f?c.fam.get(f).slice():[p];};})();
// memberships are read once per client row in Clients — same idea
const _fdMemCache={};
(function(){if(typeof loadMemberships!=='function')return;const base=loadMemberships;loadMemberships=function(sid){let k='';try{k=outletKey('salonos_membership_register',sid);}catch(e){return base(sid);}const raw=cachedLocalGet(k);const c=_fdMemCache[k];
  if(c&&c.raw===raw)return c.val.map(m=>({...m,redemptions:(m.redemptions||[]).slice()}));const v=base(sid)||[];_fdMemCache[k]={raw,val:v};return v.map(m=>({...m,redemptions:(m.redemptions||[]).slice()}));};})();

// ── 3 · the Excel library loads after start-up (and at once on first use) ──
let _fdXlsxP=null;
function fdEnsureXLSX(){if(typeof XLSX!=='undefined')return Promise.resolve();if(_fdXlsxP)return _fdXlsxP;const tag=document.querySelector('script[data-lazy="xlsx"]');const url=tag&&tag.getAttribute('src');
  if(!url||typeof loadScript!=='function')return Promise.resolve();_fdXlsxP=loadScript(url).catch(e=>{_fdXlsxP=null;throw e;});return _fdXlsxP;}
(function(){if(typeof window==='undefined'||typeof document==='undefined')return;const go=()=>{fdEnsureXLSX().catch(()=>{});};
  const once=()=>{window.removeEventListener('pointerdown',once,true);window.removeEventListener('keydown',once,true);go();};window.addEventListener('pointerdown',once,true);window.addEventListener('keydown',once,true);
  if('requestIdleCallback' in window)requestIdleCallback(go,{timeout:4000});else setTimeout(go,2500);})();

// ── 8 · paging bar ──
function FdMoreBar({shown,total,onMore}){const h=React.createElement;if(!(total>shown))return null;return h('span',{style:{fontSize:12,color:'var(--text3)',display:'inline-flex',gap:6,alignItems:'center'}},'showing '+shown+' of '+total,h('button',{className:'btn btn-ghost btn-sm',onClick:onMore},'Show more'));}

// ── 10 · compact toolbar: daily buttons stay, the rest go into "More ▾" (Controls → compactToolbars) ──
const FD_MORE_GROUPS=[['Money',/Drawer|Petty|Compan|Coupon|Voucher|Dues|Running|Advance/],['Reports',/Register|GST|Insight|Day-end|Scorecard|Busy|Timing|Stylist day|Feedback|Messages/],['Setup',/Menu|Archive|Import|hours|Label|Booking link|kiosk|Similar|Merge|Stylist left/i]];
function fdBtnLabel(el){const c=el&&el.props&&el.props.children;const flat=x=>Array.isArray(x)?x.map(flat).join(''):(x==null||x===false?'':typeof x==='object'?'':String(x));return flat(c);}
function FdToolbar({sid,keep,children}){
  const h=React.createElement;const [open,setOpen]=useState(false);const ref=useRef(null);
  useEffect(()=>{if(!open)return;const f=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener('mousedown',f);document.addEventListener('touchstart',f);return()=>{document.removeEventListener('mousedown',f);document.removeEventListener('touchstart',f);};},[open]);
  const kids=React.Children.toArray(children).filter(Boolean);
  if(!controlOn('compactToolbars',sid))return h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},...kids);
  const main=[],more=[];kids.forEach(el=>{if(!el||el.type!=='button'){main.push(el);return;}const l=fdBtnLabel(el);if(String(el.props.className||'').includes('btn-primary')||(keep||[]).some(r=>r.test(l)))main.push(el);else more.push({el,l});});
  const grouped=FD_MORE_GROUPS.map(([g,re])=>[g,more.filter(x=>re.test(x.l))]);const rest=more.filter(x=>!FD_MORE_GROUPS.some(([,re])=>re.test(x.l)));if(rest.length)grouped.push(['Other',rest]);
  return h('div',{ref,style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',position:'relative'}},...main,
    more.length>0&&h('button',{className:'btn btn-ghost btn-sm','aria-haspopup':'menu','aria-expanded':open,onClick:()=>setOpen(o=>!o)},'More ▾'),
    open&&h('div',{role:'menu',style:{position:'absolute',right:0,top:'100%',marginTop:4,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,boxShadow:'0 10px 28px rgba(0,0,0,.18)',padding:6,zIndex:60,minWidth:230,maxHeight:'70vh',overflowY:'auto'}},
      grouped.filter(([,L])=>L.length).map(([g,L])=>h('div',{key:g},h('div',{style:{fontSize:10.5,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.06em',padding:'6px 8px 2px'}},g),
        L.map((x,i)=>h('button',{key:i,role:'menuitem',className:'btn btn-ghost btn-sm',style:{display:'block',width:'100%',textAlign:'left',marginBottom:1},title:x.el.props.title,onClick:e=>{setOpen(false);x.el.props.onClick&&x.el.props.onClick(e);}},x.l))))));
}

// ── 11 · today strip (Controls → todayStrip) ──
function FdTodayStrip({sid}){
  const h=React.createElement;if(!controlOn('todayStrip',sid))return null;const t=fdTodayIso();const ds=fdDaySummary(sid,t);const now=typeof fdNowMin==='function'?fdNowMin():0;
  const left=(fdLoadBook(sid)[sid+'|'+t]||[]).filter(a=>!a.block&&['Booked','Confirmed','Checked in'].includes(a.status)&&a.start+a.dur>=now).length;
  const dues=fdDues(sid).reduce((s,e)=>s+e.due,0);const low=fdStock(sid).filter(i=>i.active!==false&&Number(i.min)>0&&Number(i.qty)<=Number(i.min)).length;
  const chip=(icon,l,v,col)=>h('div',{style:{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,flex:'1 1 150px',minWidth:0}},h('span',{style:{fontSize:18}},icon),h('div',{style:{minWidth:0}},h('div',{style:{fontSize:11,color:'var(--text3)'}},l),h('div',{style:{fontWeight:700,fontSize:15,color:col||'var(--text)'}},v)));
  return h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}},chip('💰','Sales today',FD_M(ds.total)+' · '+ds.bills+' bill'+(ds.bills===1?'':'s')),chip('📅','Bookings still to come',String(left)),chip('💳','Client dues',FD_M(dues),dues?'var(--red)':''),chip('📦','Low stock',String(low),low?'var(--orange)':''));
}

// ── 12 · Ctrl + K search and keyboard shortcuts (Controls → keyboardShortcuts) ──
const FD_PAGES=[['dashboard','Dashboard'],['insights','Owner Insights'],['master-sheet','Master Sheet'],['reports','Reports Hub'],['pnl','P&L Statement'],['users','User Management'],['settings','Master Settings']];
function fdNav(){return window.__salonosNav||null;}
function fdGoTab(tab,open){const N=fdNav();if(!N)return;const s=N.selectedSalon||(N.salons||[])[0];if(!s)return;if(open){try{sessionStorage.setItem('fd_open_'+open.kind+'_'+s.id,open.id);}catch(e){}}
  if(N.activePage!=='salon'||!N.selectedSalon)N.setSelectedSalon(s);N.setActivePage('salon');N.setSalonTab(tab);if(open)setTimeout(()=>window.dispatchEvent(new CustomEvent('fd-open',{detail:{...open,sid:s.id}})),120);}
function fdTakeOpen(kind,sid){try{const k='fd_open_'+kind+'_'+sid;const v=sessionStorage.getItem(k);if(v)sessionStorage.removeItem(k);return v;}catch(e){return null;}}
function FdPalette(){
  const h=React.createElement;const [open,setOpen]=useState(false);const [q,setQ]=useState('');const [ix,setIx]=useState(0);const inp=useRef(null);
  useEffect(()=>{const f=e=>{const N=fdNav();const sid=N&&N.selectedSalon?N.selectedSalon.id:null;if(typeof controlOn==='function'&&!controlOn('keyboardShortcuts',sid))return;
      if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==='k'){e.preventDefault();setOpen(o=>!o);setQ('');setIx(0);}
      else if(e.altKey&&!e.ctrlKey&&['1','2','3','4'].includes(e.key)&&N&&N.activePage==='salon'){e.preventDefault();N.setSalonTab(['appointments','billing','clients','inventory'][Number(e.key)-1]);}
      else if(e.key==='Escape')setOpen(false);};
    window.addEventListener('keydown',f);return()=>window.removeEventListener('keydown',f);},[]);
  useEffect(()=>{if(open&&inp.current)inp.current.focus();},[open]);
  if(!open)return null;const N=fdNav();const s=N&&(N.selectedSalon||(N.salons||[])[0]);const ql=q.trim().toLowerCase();const res=[];
  const nav=document.querySelector('.sidebar,nav');const navText=nav?nav.innerText.toLowerCase():'';
  FD_PAGES.forEach(([id,l])=>{if((!ql||l.toLowerCase().includes(ql))&&(!navText||navText.includes(l.toLowerCase())))res.push({icon:'🧭',label:l,sub:'Go to',run:()=>{N&&N.setActivePage(id);}});});
  if(s&&typeof SALON_TABS!=='undefined')SALON_TABS.forEach(t=>{if(ql&&!t.label.toLowerCase().includes(ql))return;if(!ql&&!['appointments','billing','clients','inventory'].includes(t.id))return;res.push({icon:t.icon||'📄',label:t.label,sub:String(s.name||'').split('—')[0].trim(),run:()=>fdGoTab(t.id)});});
  if(s&&ql.length>=2){const digits=ql.replace(/\D/g,'');
    fdClients(s.id).filter(c=>!c.erased&&(String(c.name||'').toLowerCase().includes(ql)||(digits.length>=3&&fdP10(c.phone).includes(digits)))).slice(0,6).forEach(c=>res.push({icon:'👤',label:c.name,sub:(typeof fdShowPhone==='function'?fdShowPhone(s.id,c.phone):c.phone)||'client',run:()=>fdGoTab('clients',{kind:'client',id:c.id})}));
    fdBills(s.id).filter(b=>String(b.id).toLowerCase().includes(ql)||(digits.length>=4&&fdP10(b.phone).includes(digits))).slice(0,6).forEach(b=>res.push({icon:'🧾',label:b.id+' · '+(b.customer||''),sub:fdDmy(b.date)+' · '+FD_M(billCalc(b).total),run:()=>fdGoTab('billing',{kind:'bill',id:b.id})}));}
  const L=res.slice(0,14);const go=r=>{setOpen(false);r&&r.run();};
  return h('div',{className:'modal-overlay',style:{alignItems:'flex-start',paddingTop:'12vh'},onClick:()=>setOpen(false)},h('div',{className:'modal',style:{width:560,maxWidth:'94vw',padding:10},onClick:e=>e.stopPropagation()},
    h('input',{ref:inp,className:'form-control',style:{fontSize:15,padding:'10px 12px'},placeholder:'Search clients, bills, mobiles or screens…',value:q,onChange:e=>{setQ(e.target.value);setIx(0);},
      onKeyDown:e=>{if(e.key==='ArrowDown'){e.preventDefault();setIx(i=>Math.min(L.length-1,i+1));}else if(e.key==='ArrowUp'){e.preventDefault();setIx(i=>Math.max(0,i-1));}else if(e.key==='Enter'){e.preventDefault();go(L[ix]);}}}),
    h('div',{style:{maxHeight:'50vh',overflowY:'auto',marginTop:6}},!L.length?h('div',{style:{padding:12,color:'var(--text3)',fontSize:13}},'Nothing found'):L.map((r,i)=>h('div',{key:i,onMouseEnter:()=>setIx(i),onClick:()=>go(r),style:{display:'flex',gap:10,alignItems:'center',padding:'8px 10px',borderRadius:8,cursor:'pointer',background:i===ix?'var(--bg3)':'transparent'}},
      h('span',{style:{fontSize:16}},r.icon),h('span',{style:{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},r.label),h('span',{style:{fontSize:11.5,color:'var(--text3)'}},r.sub)))),
    h('div',{style:{fontSize:11,color:'var(--text3)',padding:'6px 4px 0'}},'↑ ↓ to move · Enter to open · Esc to close · Alt+1…4 switch Appointments / Billing / Clients / Inventory · in a bill: F2 add item, Ctrl+Enter save')));
}

// ── 19 · undo bar (Controls → undoActions) ──
function fdOfferUndo(sid,msg,undo){if(!controlOn('undoActions',sid)||typeof undo!=='function')return;window.dispatchEvent(new CustomEvent('fd-undo',{detail:{msg,undo,at:Date.now()}}));}
function FdUndoBar(){
  const h=React.createElement;const [u,setU]=useState(null);
  useEffect(()=>{let tm=null;const f=e=>{setU(e.detail);clearTimeout(tm);tm=setTimeout(()=>setU(x=>x&&x.at===e.detail.at?null:x),5000);};window.addEventListener('fd-undo',f);return()=>{window.removeEventListener('fd-undo',f);clearTimeout(tm);};},[]);
  if(!u)return null;
  return h('div',{role:'status',style:{position:'fixed',left:'50%',bottom:24,transform:'translateX(-50%)',background:'#1f2937',color:'#fff',borderRadius:10,padding:'10px 14px',display:'flex',gap:14,alignItems:'center',boxShadow:'0 10px 30px rgba(0,0,0,.3)',zIndex:2000,fontSize:13.5,maxWidth:'92vw'}},
    h('span',null,u.msg),h('button',{style:{background:'transparent',border:'1px solid rgba(255,255,255,.4)',color:'#fff',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontWeight:600},onClick:()=>{try{u.undo();}catch(e){}setU(null);}},'Undo'));
}
// palette + undo live outside the screens so they work everywhere
(function(){if(typeof document==='undefined'||typeof ReactDOM==='undefined')return;const mount=()=>{if(document.getElementById('fd-global'))return;const el=document.createElement('div');el.id='fd-global';document.body.appendChild(el);
  ReactDOM.createRoot(el).render(React.createElement(React.Fragment,null,React.createElement(FdPalette),React.createElement(FdUndoBar)));};if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount);})();

// ── 17 · mini charts (Controls → miniCharts) ──
function fdSpark(values,col){const h=React.createElement;const v=(values||[]).map(Number);if(v.length<2)return null;const w=90,hh=24,mx=Math.max(...v,1),mn=Math.min(...v,0);const pts=v.map((x,i)=>(i/(v.length-1)*w).toFixed(1)+','+(hh-((x-mn)/(mx-mn||1))*(hh-2)-1).toFixed(1)).join(' ');
  return h('svg',{width:w,height:hh,viewBox:'0 0 '+w+' '+hh,style:{display:'block',marginTop:4},'aria-hidden':true},h('polyline',{points:pts,fill:'none',stroke:col||'var(--accent)',strokeWidth:1.6,strokeLinejoin:'round',strokeLinecap:'round'}));}
function fdDailyTotals(sid,days){const L=fdBills(sid).filter(b=>b&&b.status!=='Cancelled'&&b.kind!=='credit-note');const by={};L.forEach(b=>{by[b.date]=(by[b.date]||0)+billCalc(b).total;});const t=fdTodayIso();const out=[];for(let i=days-1;i>=0;i--)out.push(Math.round(by[fdAddD(t,-i)]||0));return out;}
const FD_CHART_COLS=['#2563EB','#16a34a','#f59e0b','#8e44ad','#ef4444','#14b8a6','#64748b'];
function fdDonut(parts){const h=React.createElement;const P=(parts||[]).filter(p=>p[1]>0);const tot=P.reduce((s,p)=>s+p[1],0);if(!tot)return null;let a=0;const r=34,c=2*Math.PI*r;
  return h('div',{style:{display:'flex',gap:12,alignItems:'center',margin:'8px 0'}},h('svg',{width:84,height:84,viewBox:'0 0 84 84','aria-hidden':true},P.map((p,i)=>{const len=p[1]/tot*c;const el=h('circle',{key:i,cx:42,cy:42,r,fill:'none',stroke:FD_CHART_COLS[i%FD_CHART_COLS.length],strokeWidth:14,strokeDasharray:len+' '+(c-len),strokeDashoffset:-a,transform:'rotate(-90 42 42)'});a+=len;return el;})),
    h('div',{style:{fontSize:12}},P.map((p,i)=>h('div',{key:i,style:{display:'flex',gap:6,alignItems:'center'}},h('i',{style:{width:10,height:10,borderRadius:3,background:FD_CHART_COLS[i%FD_CHART_COLS.length],display:'inline-block'}}),p[0]+' '+FD_M(p[1])+' ('+Math.round(p[1]/tot*100)+'%)'))));}
function fdBar(v,max){const h=React.createElement;return h('span',{style:{display:'inline-block',verticalAlign:'middle',marginRight:6,width:50,height:6,background:'var(--bg3)',borderRadius:3,overflow:'hidden'}},h('span',{style:{display:'block',height:'100%',width:Math.max(2,Math.round((v/(max||1))*100))+'%',background:'var(--accent)'}}));}

// ── 15 · calendar badges, staff colours, now line (Controls → calendarPolish) ──
const FD_STAFF_COLS=['#2563EB','#db2777','#16a34a','#f59e0b','#8e44ad','#0891b2','#ea580c','#4f46e5','#65a30d','#be123c'];
function fdStaffCol(staff,s){const i=(staff||[]).findIndex(z=>z.id===s.id||z.name===s.name);return FD_STAFF_COLS[(i<0?0:i)%FD_STAFF_COLS.length];}
function fdNowRow(sid,date,m,slot){if(!controlOn('calendarPolish',sid)||date!==fdTodayIso())return false;const n=fdNowMin();return n>=m&&n<m+slot;}
function fdCardBadges(sid,a){if(!controlOn('calendarPolish',sid)||!a||a.block)return'';const p=fdP10(a.phone);if(p.length!==10)return'';const bills=fdBillsRO(sid);const mine=fdBillsByPhone(bills).get(p)||[];const live=mine.filter(b=>b.status!=='Cancelled');
  let out='';if(!live.length)out+=' 🆕';else{const st=fdClientStats({phone:p},bills);if(fdSegOf(st)==='VIP')out+=' ⭐';}if(live.some(b=>fdBillDue(b)>0))out+=' 💳';return out;}

// ── 16 · bill print layouts (Controls → billPrintDesign; size in ⚙ Menu & settings) ──
const FD_PRINT_OLD='@page{size:A5 portrait;margin:10mm}body{font-family:Arial,sans-serif;font-size:12px;color:#222}h1{font-size:18px;margin:0}.m{color:#777;font-size:10px}table{width:100%;border-collapse:collapse;margin:10px 0}td,th{border-bottom:1px solid #eee;padding:5px}th{text-align:left;font-size:10px;color:#666;text-transform:uppercase}.r{text-align:right}.tot td{border:0;padding:3px 5px}.big td{font-weight:700;font-size:14px;border-top:2px solid #2f5fe0}';
function fdPrintCss(sid){if(!controlOn('billPrintDesign',sid))return FD_PRINT_OLD;const sz=String(fdSettings(sid).raw.printSize||'A5');
  const base='body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0}h1{margin:2px 0 0;letter-spacing:.3px}.m{color:#666}table{width:100%;border-collapse:collapse}td,th{padding:4px 3px;vertical-align:top}th{text-align:left;color:#555;text-transform:uppercase}.r{text-align:right}.tot td{border:0}.big td{font-weight:800;border-top:2px solid #111}img{display:block;margin:0 auto 4px}body>h1,body>.m{text-align:center}p.m:last-of-type{text-align:center;font-size:1.05em;color:#111;margin-top:10px}';
  if(sz==='58mm'||sz==='80mm'){const w=sz==='58mm'?'48mm':'72mm';return'@page{size:'+sz+' auto;margin:3mm}'+base+'body{width:'+w+';font-size:'+(sz==='58mm'?'10px':'11px')+'}h1{font-size:14px}.m{font-size:9px}td,th{border-bottom:1px dashed #bbb}th{font-size:8.5px}table:first-of-type td:nth-child(1),table:first-of-type th:nth-child(1),table:first-of-type td:nth-child(5),table:first-of-type th:nth-child(5){display:none}.big td{font-size:13px}';}
  if(sz==='A4')return'@page{size:A4 portrait;margin:14mm}'+base+'body{font-size:12.5px}h1{font-size:22px}.m{font-size:10.5px}td,th{border-bottom:1px solid #e5e7eb;padding:6px 5px}th{font-size:10px;background:#f3f4f6}.big td{font-size:16px}';
  return'@page{size:A5 portrait;margin:9mm}'+base+'body{font-size:12px}h1{font-size:19px}.m{font-size:10px}td,th{border-bottom:1px solid #eee}th{font-size:9.5px}.big td{font-size:15px}';}

// ── 9 · storage meter (Master Settings) ──
function FdStorageMeter(){
  const h=React.createElement;const [s,setS]=useState(null);
  useEffect(()=>{let live=true;(async()=>{let ls=0;try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);ls+=(k?k.length:0)+((localStorage.getItem(k)||'').length);}}catch(e){}
    const big=typeof bigStoreBytes==='function'?bigStoreBytes():0;let quota=0,usage=0;try{if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();quota=e.quota||0;usage=e.usage||0;}}catch(e){}if(live)setS({ls:ls*2,big:big*2,quota,usage,on:typeof bigStoreOn==='function'&&bigStoreOn()});})();return()=>{live=false;};},[]);
  if(!s)return null;const mb=x=>(x/1048576).toFixed(1)+' MB';const pct=Math.min(100,Math.round(s.ls/(5*1048576)*100));
  return h('div',{className:'card',style:{marginBottom:16}},h('div',{className:'card-title'},'💾 Storage on this device'),
    h('div',{style:{fontSize:12.5,marginBottom:6}},'Small store (settings and lists): '+mb(s.ls)+' of about 5 MB'),h('div',{style:{height:8,background:'var(--bg3)',borderRadius:4,overflow:'hidden'}},h('div',{style:{height:'100%',width:pct+'%',background:pct>80?'var(--red)':pct>60?'var(--orange)':'var(--green)'}})),
    h('div',{style:{fontSize:12.5,marginTop:8}},s.on?'Large store (bills, stock log, bookings, audit log): '+mb(s.big)+(s.quota?' · browser allows about '+mb(s.quota):''):'Large store not in use on this browser (private window or blocked) — everything is in the small store.'),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:4}},'Everything is also kept in the cloud. Old bills can be moved to the cloud archive from Billing → 🗄 Archive.'));
}

// phone-layout CSS in index.html applies unless the switch is off
try{if(typeof controlOn==='function'&&!controlOn('mobileLayout')&&document.body)document.body.classList.add('no-fd-mobile');}catch(e){}
