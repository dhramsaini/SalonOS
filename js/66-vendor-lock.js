// ════════════════════════════════════════════════════════════════════════════════════════════════
// Vendors' own month lock (Controls → Entry checks → Vendor bills → vendorMonthLock).
// Vendors → "🔒 Months": tick a month to lock Vendors for it — bills booked in it and payments dated
// in it can't be added, changed or removed. Unlocking needs a Super Admin and a reason (Audit Log).
// Independent of the Salary Working / Incentive Working / Master Sheet month locks; a Final P&L
// still blocks Vendors for that month (isVendorMonthLockedFor in js/02).
// Store: salonos_vendor_month_locks_outlet_<id> = {'YYYY-MM': {locked, by, at}}.
// ════════════════════════════════════════════════════════════════════════════════════════════════
function vlOn(sid){return typeof controlOn==='function'&&controlOn('vendorMonthLock',sid);}
function vlLocks(sid){try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_vendor_month_locks',sid))||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}}
function vlRec(sid,year,month){const r=vlLocks(sid)[monthLockCode(year,month)];return r&&r.locked?r:null;}
function vlSet(sid,year,month,locked){
  const map=vlLocks(sid),k=monthLockCode(year,month);const by=(typeof currentSessionUser==='function'&&(currentSessionUser()||{}).name)||'';
  if(locked)map[k]={locked:true,by,at:new Date().toISOString()};else delete map[k];
  safeLocalSet(outletKey('salonos_vendor_month_locks',sid),JSON.stringify(map));
  try{logAuditEvent(sid,{entity:'Lock',entityId:'Vendors '+k,action:locked?'Locked':'Unlocked',summary:'Vendors '+k+(locked?' locked':' unlocked')});}catch(e){}
}
const VL_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
// The message shown when a Vendors entry is refused because of a month lock.
function vendorLockedMessage(sid,dateStr){
  const p=String(dateStr||'').split(/[-/]/);let y=null,m=null;
  if(p.length===3&&p[0].length===4){y=Number(p[0]);m=Number(p[1])-1;}else if(p.length===3){y=Number(p[2]);m=Number(p[1])-1;}
  const r=y!=null&&vlOn(sid)?vlRec(sid,y,m):null;
  if(r)return'Vendors for '+VL_MONTHS[m]+' '+y+' is locked (Vendors → 🔒 Months'+(r.by?', by '+r.by:'')+(r.at?' on '+String(r.at).slice(0,10).split('-').reverse().join('/'):'')+'). Bills and payments dated in it can’t be added, changed or removed. A Super Admin can unlock it there, with a reason.';
  return typeof monthLockedMessage==='function'?monthLockedMessage(sid,dateStr):'That month is locked.';
}
function vlLockedCount(sid){return Object.values(vlLocks(sid)).filter(r=>r&&r.locked).length;}

function VendorMonthLocks({sid,onClose}){
  const h=React.createElement;const [,t]=useState(0);
  const today=new Date();const curFy=today.getMonth()>=3?today.getFullYear():today.getFullYear()-1;
  const [fyStart,setFyStart]=useState(curFy);
  const months=Array.from({length:12},(_,i)=>{const mi=(i+3)%12;return{year:mi>=3?fyStart:fyStart+1,mi};});
  const pnl=(y,m)=>{const r=typeof loadMonthLocks==='function'?loadMonthLocks(sid)[monthLockCode(y,m)]:null;return !!(r&&r.locked&&r.source==='pnl-final');};
  const toggle=(y,m)=>{
    const on=!!vlRec(sid,y,m);const label='Vendors for '+VL_MONTHS[m]+' '+y;
    if(on){if(!requestUnlock(sid,label))return;vlSet(sid,y,m,false);}
    else{if(!window.confirm('Lock '+label+'? Bills booked in it and payments dated in it can’t be added, changed or removed until a Super Admin unlocks it.'))return;vlSet(sid,y,m,true);}
    t(x=>x+1);
  };
  return h('div',{className:'modal-overlay',onClick:onClose},
    h('div',{className:'modal',style:{maxWidth:560},onClick:e=>e.stopPropagation()},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}},
        h('div',{className:'modal-title',style:{marginBottom:0,paddingBottom:0,border:'none'}},'🔒 Vendors — Lock Months'),
        h('button',{className:'btn btn-ghost btn-sm',onClick:onClose},'✕ Close')),
      h('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:12,lineHeight:1.5}},'Tick a month to lock Vendors for it: bills booked in that month and payments dated in it can’t be added, changed or removed. This lock is only for Vendors — Salary Working, Incentive Working and the Master Sheet month lock don’t lock Vendors. A month whose P&L is Final stays locked here too. Unlocking needs a Super Admin and a reason.'),
      h('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:12}},
        h('label',{htmlFor:'vl-fy',style:{fontSize:11,color:'var(--text3)'}},'Financial Year'),
        h('select',{id:'vl-fy',className:'form-control',style:{width:'auto'},value:fyStart,onChange:e=>setFyStart(Number(e.target.value))},
          Array.from({length:6},(_,i)=>curFy-4+i).map(y=>h('option',{key:y,value:y},'FY '+y+'-'+String(y+1).slice(2))))),
      h('div',{style:{display:'flex',flexDirection:'column',gap:6}},months.map(({year,mi})=>{
        const r=vlRec(sid,year,mi),pf=pnl(year,mi);
        return h('label',{key:year+'-'+mi,style:{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'var(--bg3)',borderRadius:'var(--r)',border:'1px solid '+(r?'rgba(240,160,40,0.5)':'var(--border)'),cursor:'pointer'}},
          h('input',{type:'checkbox',checked:!!r,onChange:()=>toggle(year,mi)}),
          h('span',{style:{fontSize:12.5,fontWeight:500,minWidth:120}},VL_MONTHS[mi]+' '+year),
          r&&h('span',{className:'badge badge-amber',style:{fontSize:10}},'🔒 Locked'+(r.by?' by '+r.by:'')+(r.at?' · '+String(r.at).slice(0,10).split('-').reverse().join('/'):'')),
          pf&&h('span',{className:'badge badge-blue',style:{fontSize:10}},'P&L Final — locked'),
          !r&&!pf&&h('span',{style:{fontSize:11,color:'var(--text3)'}},'Open'));
      }))));
}

if(typeof HELP_TOPICS!=='undefined'&&Array.isArray(HELP_TOPICS)&&!HELP_TOPICS.some(t=>t.title==='Locking Vendors month by month'))HELP_TOPICS.push({title:'Locking Vendors month by month',body:[
  '<b>Where</b>: Vendors → “🔒 Months”. Tick a month to lock it; bills booked in it and payments dated in it can’t be added, changed or removed.',
  '<b>Separate</b>: Salary Working, Incentive Working and the Master Sheet month lock don’t lock Vendors. Only this lock and a Final P&L do.',
  '<b>Unlock</b>: untick the month — a Super Admin, with a reason kept in the Audit Log.',
  '<b>Switch</b>: Master Settings → Controls → Entry checks → Vendor bills → Lock Vendors month by month.'
]});
