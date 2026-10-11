// ═════════════════════════════════════════════════════════════════════════════════════════════
// Owner & platform additions (Master Settings → 🎛 Controls):
//   • Start page by role, or the user's own pinned start page.                    → roleHomeScreens
//   • Install SalonOS as a phone / desktop app (button when the browser offers it). → appInstallPrompt
//   • ＋ Quick add on phones: expense, attendance, bill, vendor bill, advance.       → phoneQuickAdd
//   • Outlet productivity: revenue per stylist / chair / sq ft, average bill, repeat clients (Dashboard → Outlet Ranking).
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ── Start page ──
function startPinKey(u){return 'salonos_home_'+String((u&&(u.email||u.name))||'').toLowerCase();}
function loadStartPin(u){try{return JSON.parse(localStorage.getItem(startPinKey(u))||'null');}catch(e){return null;}}
function saveStartPin(u,v){try{if(v)localStorage.setItem(startPinKey(u),JSON.stringify(v));else localStorage.removeItem(startPinKey(u));}catch(e){}}
const ROLE_START={'Salon Manager':{page:'salon',tab:'outlet-dashboard'},'ASM':{page:'salon',tab:'outlet-dashboard'},'Data Entry User':{page:'salon',tab:'daily-sales'},
  'Accountant':{page:'salon',tab:'bank-statement'},'Salon Owner':{page:'insights'},'Owner':{page:'insights'},'Reviewer':{page:'insights'}};
// {page, salonId?, tab?} or null (stay on the Dashboard)
function startPageFor(u,accessible){
  if(!u)return null;const pin=loadStartPin(u);
  if(pin&&pin.page){if(pin.page!=='salon'||(accessible||[]).some(s=>String(s.id)===String(pin.salonId)))return pin;}
  if(!controlOn('roleHomeScreens',null))return null;const r=ROLE_START[u.role];if(!r)return null;
  if(r.page==='salon'){const s=(accessible||[])[0];return s?{page:'salon',salonId:s.id,tab:r.tab}:null;}
  return r;
}
function StartPagePin({user,activePage,selectedSalon,salonTab}){
  const h=React.createElement;const [,setT]=useState(0);if(!user)return null;const pin=loadStartPin(user);
  const here={page:activePage,salonId:activePage==='salon'&&selectedSalon?selectedSalon.id:null,tab:activePage==='salon'?salonTab:null};
  const same=pin&&pin.page===here.page&&String(pin.salonId||'')===String(here.salonId||'')&&String(pin.tab||'')===String(here.tab||'');
  return h('div',{style:{display:'flex',gap:6,justifyContent:'center',marginTop:8,flexWrap:'wrap'}},
    h('button',{type:'button',className:'btn btn-ghost btn-sm',style:{fontSize:10.5,padding:'2px 8px'},title:'Open this screen first every time you sign in',disabled:same,onClick:()=>{saveStartPin(user,here);setT(t=>t+1);}},same?'📌 Start page':'📌 Start here'),
    pin&&h('button',{type:'button',className:'btn btn-ghost btn-sm',style:{fontSize:10.5,padding:'2px 8px'},title:'Go back to the default start page',onClick:()=>{saveStartPin(user,null);setT(t=>t+1);}},'Clear'));
}

// ── Install as an app ──
window.__sosInstall=window.__sosInstall||null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();window.__sosInstall=e;try{window.dispatchEvent(new Event('sos-install-ready'));}catch(err){}});
window.addEventListener('appinstalled',()=>{window.__sosInstall=null;try{window.dispatchEvent(new Event('sos-install-ready'));}catch(err){}});
function InstallAppButton(){
  const h=React.createElement;const [,setT]=useState(0);
  useEffect(()=>{const f=()=>setT(t=>t+1);window.addEventListener('sos-install-ready',f);return()=>window.removeEventListener('sos-install-ready',f);},[]);
  if(!controlOn('appInstallPrompt',null))return null;
  const standalone=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone;if(standalone)return null;
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent||'');
  if(window.__sosInstall)return h('button',{type:'button',className:'btn btn-primary btn-sm',style:{width:'100%',justifyContent:'center',marginTop:8,fontSize:11.5},
    onClick:async()=>{const e=window.__sosInstall;if(!e)return;e.prompt();try{await e.userChoice;}catch(err){}window.__sosInstall=null;setT(t=>t+1);}},'📲 Install SalonOS app');
  if(ios)return h('div',{style:{fontSize:10.5,color:'var(--text3)',textAlign:'center',marginTop:8}},'📲 iPhone: tap Share → “Add to Home Screen” to install SalonOS');
  return null;
}

// ── ＋ Quick add (phones) ──
const QUICK_ADD=[['daily-sales','💵','Add expense / sales'],['attendance','✅','Mark attendance'],['billing','🧾','New bill'],['vendors','🏢','Vendor bill'],['advance','💸','Record advance'],['bank-statement','🏦','Map bank lines']];
function QuickAddSheet({visibleTabs,onGo,onClose}){
  const h=React.createElement;const ids=new Set((visibleTabs||[]).map(t=>t.id));const items=QUICK_ADD.filter(([id])=>ids.has(id));
  return h('div',{className:'module-sheet',role:'dialog','aria-label':'Quick add'},
    h('div',{className:'module-sheet-head'},h('b',{style:{flex:1}},'＋ Quick add'),h('button',{type:'button',className:'btn btn-ghost',onClick:onClose},'Close')),
    h('div',{className:'module-grid'},items.length?items.map(([id,icon,label])=>h('button',{key:id,type:'button',onClick:()=>{onGo(id);onClose();}},h('span',{className:'mg-icon'},icon),label))
      :h('div',{style:{padding:16,color:'var(--text3)'}},'Nothing to add here with your access.')));
}

// ── Outlet productivity ──
function outletCapKey(sid){return outletKey('salonos_outlet_capacity',sid);}
function loadOutletCap(sid){try{return JSON.parse(cachedLocalGet(outletCapKey(sid))||'{}')||{};}catch(e){return{};}}
function outletProductivity(sid,year,month){
  const s=typeof collectionSalesSumFor==='function'?collectionSalesSumFor(sid,year,month):{cash:0,card:0,upi:0};const revenue=Math.round((s.cash||0)+(s.card||0)+(s.upi||0));
  let stylists=0;try{const inc=incWorkingsFor(sid,year,month)||[];stylists=inc.filter(r=>(Number(r.totalActual)||0)>0).length||inc.length;}catch(e){}
  const cap=loadOutletCap(sid);const chairs=Number(cap.chairs)||0,sqft=Number(cap.sqft)||0;
  let bills=[];try{bills=JSON.parse(cachedLocalGet(outletKey('salonos_billing_invoices',sid))||'[]')||[];}catch(e){}
  const pre=year+'-'+String(month+1).padStart(2,'0');const live=bills.filter(b=>b&&b.status!=='Cancelled');const inM=live.filter(b=>String(b.date).startsWith(pre));
  const tot=b=>typeof billCalc==='function'?Number(billCalc(b).total)||0:0;
  const firstSeen={};live.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).forEach(b=>{const p=String(b.phone||'').replace(/\D/g,'').slice(-10);if(p.length===10&&!firstSeen[p])firstSeen[p]=String(b.date);});
  const withPhone=inM.filter(b=>String(b.phone||'').replace(/\D/g,'').length>=10);const repeat=withPhone.filter(b=>firstSeen[String(b.phone).replace(/\D/g,'').slice(-10)]<String(b.date)).length;
  return{revenue,stylists,chairs,sqft,bills:inM.length,avgBill:inM.length?Math.round(inM.reduce((t,b)=>t+tot(b),0)/inM.length):null,repeatPct:withPhone.length?Math.round(repeat/withPhone.length*100):null,
    perStylist:stylists?Math.round(revenue/stylists):null,perChair:chairs?Math.round(revenue/chairs):null,perSqft:sqft?Math.round(revenue/sqft):null};
}
function OutletProductivityTable({accessibleSalons,cal}){
  const h=React.createElement;const [,setT]=useState(0);const outs=(accessibleSalons||[]).filter(s=>s&&s.id!=null&&s.status!=='Inactive');if(!outs.length)return null;
  const canEdit=isSuperAdminUser(currentSessionUser());const M=n=>n==null?'—':'₹'+Math.round(n).toLocaleString('en-IN');
  const rows=outs.map(s=>({s,p:outletProductivity(s.id,cal.year,cal.month)}));const best=k=>Math.max(...rows.map(r=>r.p[k]==null?-1:r.p[k]));
  const setCap=(sid,k,v)=>{const c=loadOutletCap(sid);c[k]=Number(v)||0;safeLocalSet(outletCapKey(sid),JSON.stringify(c));setT(t=>t+1);};
  const cell=(r,k,fmt)=>{const v=r.p[k];const top=rows.length>1&&v!=null&&v>0&&v===best(k);return h('td',{style:{textAlign:'right',fontWeight:top?700:400,color:top?'var(--green)':undefined}},fmt(v));};
  return h('div',{style:{marginTop:18}},
    h('div',{className:'page-title',style:{fontSize:18}},'Outlet productivity — '+RPT_MONTHS[cal.month]+' '+cal.year),
    h('div',{className:'page-sub',style:{marginBottom:8}},'Revenue (Cradlee cash + card + UPI) per stylist with sales, per chair and per sq ft; average bill and repeat clients from SalonOS Billing. Best in each column in green.'+(canEdit?' Enter chairs and area once per outlet.':'')),
    h('div',{className:'card',style:{padding:0}},h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,['Outlet','Revenue','Stylists','Per stylist','Chairs','Per chair','Area (sq ft)','Per sq ft','Avg bill','Repeat clients'].map((t,i)=>h('th',{key:i,style:i?{textAlign:'right'}:null},t)))),
      h('tbody',null,rows.map(r=>h('tr',{key:r.s.id},h('td',{style:{fontWeight:600}},rptShort(r.s)),h('td',{style:{textAlign:'right'}},M(r.p.revenue)),h('td',{style:{textAlign:'right'}},r.p.stylists||'—'),cell(r,'perStylist',M),
        h('td',{style:{textAlign:'right'}},canEdit?h('input',{type:'number',min:0,className:'form-control',style:{width:64,padding:'2px 4px',textAlign:'right',display:'inline-block'},value:r.p.chairs||'',onChange:e=>setCap(r.s.id,'chairs',e.target.value)}):(r.p.chairs||'—')),cell(r,'perChair',M),
        h('td',{style:{textAlign:'right'}},canEdit?h('input',{type:'number',min:0,className:'form-control',style:{width:80,padding:'2px 4px',textAlign:'right',display:'inline-block'},value:r.p.sqft||'',onChange:e=>setCap(r.s.id,'sqft',e.target.value)}):(r.p.sqft||'—')),cell(r,'perSqft',M),
        cell(r,'avgBill',M),cell(r,'repeatPct',v=>v==null?'—':v+'%'))))))));
}
