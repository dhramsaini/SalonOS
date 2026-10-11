// ═════════════════════════════════════════════════════════════════════════════════════════════
// Front desk — data safety, controls and GST (js/39–44 call these):
//   A · per-device bill / client number series; stock worked out from a movement ledger (ids on every
//       entry so two devices merge instead of overwriting); points / package balance as ledgers;
//       ids on package & voucher redemptions; old bills archived to the cloud only; photos as
//       attachments (moved to cloud file storage like vendor bills).
//   B · day close lock, bill edit history, cancel / refund reason + approval, rate below menu = discount,
//       stylist change rule, old dues alert.
//   C · new money vs package use, SAC/HSN, customer GSTIN (IGST when another state), round-off, GST summary.
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ── A1 · device code: each device numbers its own bills (INV-A-0012), so two devices never clash ──
function fdDeviceCode(){
  try{let c=localStorage.getItem('salonos_device_code');if(!c){const L='ABCDEFGHJKLMNPQRSTUVWXYZ';c=L[Math.floor(Math.random()*L.length)]+L[Math.floor(Math.random()*L.length)];localStorage.setItem('salonos_device_code',c);}return c;}catch(e){return'X';}
}
if(typeof DEVICE_ONLY_KEYS!=='undefined')DEVICE_ONLY_KEYS.add('salonos_device_code');
(function(){if(typeof fdNextBillNo!=='function')return;const base=fdNextBillNo;
  fdNextBillNo=function(sid,bills,dateIso){if(!controlOn('deviceBillSeries',sid))return base(sid,bills,dateIso);const dc=fdDeviceCode();
    if(controlOn('fyInvoiceSeries',sid)){const d=new Date((dateIso||fdTodayIso())+'T00:00:00');const fy=calToFYMI(d.getFullYear(),d.getMonth()).fy;const pre='INV/'+fy+'/'+dc+'-';
      const n=Math.max(0,...(bills||[]).filter(b=>String(b.id).startsWith(pre)).map(b=>Number(String(b.id).slice(pre.length))||0))+1;return pre+String(n).padStart(4,'0');}
    const pre='INV-'+dc+'-';const n=Math.max(0,...(bills||[]).filter(b=>String(b.id).startsWith(pre)).map(b=>Number(String(b.id).slice(pre.length))||0))+1;return pre+String(n).padStart(4,'0');};})();
(function(){if(typeof fdNextClientId!=='function')return;const base=fdNextClientId;fdNextClientId=function(list){const dc=fdDeviceCode();const pre='CL'+dc+'-';
  const n=Math.max(0,...(list||[]).filter(c=>String(c.id||'').startsWith(pre)).map(c=>Number(String(c.id).slice(pre.length))||0))+1;return pre+String(n).padStart(5,'0');};})();

// ── A2 · stock ledger ──
const FD_MOVE_SIGN={receive:1,'transfer-in':1,return:1,sale:-1,issue:-1,'transfer-out':-1,writeoff:-1};
// Gives old log entries a stable id (same on every device) so the log merges by id from now on.
function fdLedgerIds(sid){
  const k=outletKey('salonos_inventory_log',sid);const L=fdJ(k,[]);if(!Array.isArray(L)||L.every(x=>x&&x.id))return;
  safeLocalSet(k,JSON.stringify(L.map((x,i)=>x&&x.id?x:{...x,id:'L'+i+'_'+[x.itemId,x.date,x.type,x.qty].join('_')})));
}
// Starts the ledger for items that have none: an "opening" entry with today's quantity.
function fdEnsureLedger(sid){
  fdLedgerIds(sid);const items=fdStock(sid);const log=typeof loadInvLog==='function'?loadInvLog(sid):[];const has=new Set(log.filter(x=>x.type==='opening'&&x.at).map(x=>x.itemId));
  const add=items.filter(i=>!has.has(i.id));if(!add.length)return;const at=new Date().toISOString();
  safeLocalSet(outletKey('salonos_inventory_log',sid),JSON.stringify([...log,...add.map(i=>({id:'OPEN_'+i.id+'_'+at.slice(0,19),date:at.slice(0,10),at,itemId:i.id,name:i.name,type:'opening',qty:Number(i.qty)||0}))].slice(-6000)));
}
// Quantity = latest opening + every later movement (count entries carry the difference).
function fdLedgerQty(log,itemId){
  const mine=log.filter(x=>x&&x.itemId===itemId&&x.at);const op=mine.filter(x=>x.type==='opening').sort((a,b)=>String(b.at).localeCompare(String(a.at)))[0];if(!op)return null;
  let q=Number(op.qty)||0;const oi=mine.indexOf(op);mine.forEach((x,xi)=>{if(x===op||String(x.at)<String(op.at)||(String(x.at)===String(op.at)&&xi<oi))return;if(x.type==='count')q+=Number(x.qty)||0;else if(FD_MOVE_SIGN[x.type])q+=FD_MOVE_SIGN[x.type]*(Number(x.qty)||0);});
  return Math.round(q*100)/100;
}
function fdRecalcStock(sid){
  const log=typeof loadInvLog==='function'?loadInvLog(sid):[];const S=fdStock(sid);let ch=false;
  S.forEach(i=>{const q=fdLedgerQty(log,i.id);if(q!=null&&q!==Number(i.qty)){i.qty=q;ch=true;}});if(ch)fdSaveStock(sid,S);return ch;
}

// ── A2b · client points / package balance as ledgers (merge-safe) ──
function fdClientAdjust(sid,phone,field,delta,note){
  const p=fdP10(phone);const C=fdClients(sid);const i=C.findIndex(c=>fdP10(c.phone)===p);if(i<0||!delta)return null;
  const logF=field+'Log',baseF=field+'Base';const c={...C[i]};if(!Array.isArray(c[logF])){c[logF]=[];c[baseF]=Number(c[field])||0;}
  c[logF]=[...c[logF],{id:'A'+Date.now()+Math.random().toString(36).slice(2,6),at:new Date().toISOString(),delta:Math.round(Number(delta)*100)/100,note:note||'',by:(currentSessionUser()||{}).name||''}].slice(-300);
  c[field]=Math.round(((Number(c[baseF])||0)+c[logF].reduce((s,x)=>s+(Number(x.delta)||0),0))*100)/100;C[i]=c;fdSaveClients(sid,C);return c[field];
}
const fdRid=()=>'R'+Date.now()+Math.random().toString(36).slice(2,6);

// ── A3 · archive old bills to the cloud only (Controls → billArchive) ──
const FD_ARCHIVE_PREFIX='salonos_billarchive_';
function fdArchiveKey(sid,ym){return outletKey(FD_ARCHIVE_PREFIX+ym,sid);}
async function fdArchiveWrite(key,arr){
  const supa=await getSupabaseClient();const{data:{session}}=await supa.auth.getSession();if(!session)throw new Error('Sign in to the cloud first');
  const{data:row,error:e1}=await supa.from('kv_store').select('value,updated_at').eq('key',key).maybeSingle();if(e1)throw e1;
  let cur=[];try{cur=row&&row.value?JSON.parse(row.value):[];}catch(e){cur=[];}const ids=new Set(cur.map(b=>String(b.id)));const merged=[...cur,...arr.filter(b=>!ids.has(String(b.id)))];
  const now=new Date().toISOString();const val=JSON.stringify(merged);
  const res=row?await supa.from('kv_store').update({value:val,updated_at:now,updated_by:session.user.id}).eq('key',key).select('key'):await supa.from('kv_store').insert({key,value:val,updated_at:now,updated_by:session.user.id}).select('key');
  if(res.error)throw res.error;if(!res.data||!res.data.length)throw new Error('The cloud refused the archive (no access to this outlet?)');return merged.length;
}
async function fdArchiveRead(sid,ym){const supa=await getSupabaseClient();const{data,error}=await supa.from('kv_store').select('value').eq('key',fdArchiveKey(sid,ym)).maybeSingle();if(error)throw error;try{return data&&data.value?JSON.parse(data.value):[];}catch(e){return[];}}
async function fdArchiveMonths(sid){const supa=await getSupabaseClient();const{data,error}=await supa.from('kv_store').select('key').like('key',FD_ARCHIVE_PREFIX+'%_outlet_'+sid).not('value','is',null);if(error)throw error;
  return(data||[]).map(r=>String(r.key).slice(FD_ARCHIVE_PREFIX.length,FD_ARCHIVE_PREFIX.length+7)).sort().reverse();}
// Moves bills older than N months to the cloud (month by month), keeping each client's visits / spend.
async function fdArchiveOldBills(sid,months){
  if(typeof CLOUD_SYNC_ENABLED==='undefined'||!CLOUD_SYNC_ENABLED)throw new Error('Archiving needs the cloud — it is not connected on this copy.');
  const cut=new Date();cut.setDate(1);cut.setMonth(cut.getMonth()-(Number(months)||3));const cutIso=localIsoOf(cut);
  const L=fdBills(sid);const old=L.filter(b=>String(b.date)<cutIso&&fdBillDue(b)<=0);if(!old.length)return{moved:0,months:0};
  const by={};old.forEach(b=>{const ym=String(b.date).slice(0,7);(by[ym]=by[ym]||[]).push(b);});
  for(const ym of Object.keys(by))await fdArchiveWrite(fdArchiveKey(sid,ym),by[ym]);
  // client history kept as totals
  const C=fdClients(sid);old.forEach(b=>{if(b.status==='Cancelled')return;const p=fdP10(b.phone);if(p.length!==10)return;const c=C.find(x=>fdP10(x.phone)===p);if(!c)return;
    c.archVisits=(Number(c.archVisits)||0)+(b.kind==='credit-note'?0:1);c.archSpend=Math.round((Number(c.archSpend)||0)+billCalc(b).total);if(!c.firstVisit||String(b.date)<c.firstVisit)c.firstVisit=b.date;});fdSaveClients(sid,C);
  const ids=new Set(old.map(b=>b.id));safeLocalSet(outletKey('salonos_billing_invoices',sid),JSON.stringify(fdBills(sid).filter(b=>!ids.has(b.id))));
  try{logAuditEvent(sid,{entity:'Bill',entityId:'archive',action:'Bills archived',summary:old.length+' bill(s) before '+cutIso+' moved to the cloud archive'});}catch(e){}
  return{moved:old.length,months:Object.keys(by).length};
}
// archive totals count towards client stats
(function(){if(typeof fdClientStats!=='function')return;const base=fdClientStats;fdClientStats=function(c,bills){const st=base(c,bills);const v=Number(c&&c.archVisits)||0,s=Number(c&&c.archSpend)||0;
  if(!v&&!s)return st;return{...st,visits:st.visits+v,spend:st.spend+s};};})();
function FdArchiveModal({sid,onClose,onDone}){
  const h=React.createElement;const {toast}=useToast();const months=controlLimit('billArchive')||3;const [busy,setBusy]=useState(false);const [list,setList]=useState(null);const [view,setView]=useState(null);
  const cut=new Date();cut.setDate(1);cut.setMonth(cut.getMonth()-months);const cutIso=localIsoOf(cut);const L=fdBills(sid);const old=L.filter(b=>String(b.date)<cutIso&&fdBillDue(b)<=0);
  const size=Math.round(JSON.stringify(L).length/1024);const cloud=typeof CLOUD_SYNC_ENABLED!=='undefined'&&CLOUD_SYNC_ENABLED;
  useEffect(()=>{if(cloud)fdArchiveMonths(sid).then(setList).catch(()=>setList([]));},[]);
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:600,maxWidth:'96vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'🗄 Bill archive'),
    h('div',{style:{fontSize:12.5,marginBottom:8}},'This device holds '+L.length+' bill(s) (about '+size+' KB). Bills before '+cutIso.split('-').reverse().join('/')+' that are fully paid ('+old.length+') can move to the cloud archive — they stay safe and viewable, but no longer slow this device down or fill its storage. Client visits and spend are kept.'),
    !cloud?h('div',{style:{color:'var(--orange)'}},'The cloud is not connected on this copy, so nothing can be archived here.')
      :h('button',{className:'btn btn-primary btn-sm',disabled:busy||!old.length,onClick:async()=>{if(!window.confirm('Move '+old.length+' bill(s) dated before '+cutIso.split('-').reverse().join('/')+' to the cloud archive?\n\nThey are written to the cloud first and removed from this device only after that succeeds.'))return;
        setBusy(true);try{const r=await fdArchiveOldBills(sid,months);toast(r.moved+' bill(s) archived ('+r.months+' month(s))','success');onDone&&onDone();}catch(e){toast('Archive failed: '+(e.message||e)+' — nothing was removed','error');}setBusy(false);}},busy?'Archiving…':'Archive '+old.length+' bill(s)'),
    cloud&&h('div',{style:{marginTop:12}},h('b',{style:{fontSize:13}},'Archived months'),list==null?h('div',{style:{fontSize:12}},'Loading…'):!list.length?h('div',{style:{fontSize:12,color:'var(--text3)'}},'None yet.'):
      h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginTop:6}},list.map(ym=>h('button',{key:ym,className:'btn btn-ghost btn-sm',onClick:async()=>{try{setView({ym,bills:await fdArchiveRead(sid,ym)});}catch(e){toast(e.message||String(e),'error');}}},RPT_MONTHS[Number(ym.slice(5,7))-1]+' '+ym.slice(0,4))))),
    view&&h('div',{style:{marginTop:10}},h('b',null,RPT_MONTHS[Number(view.ym.slice(5,7))-1]+' '+view.ym.slice(0,4)+' — '+view.bills.length+' bill(s) · '+FD_M(view.bills.filter(b=>b.status!=='Cancelled').reduce((s,b)=>s+billCalc(b).total,0))),
      h('div',{style:{maxHeight:260,overflowY:'auto',marginTop:6}},view.bills.map(b=>h('div',{key:b.id,style:{display:'flex',gap:8,fontSize:12.5,padding:'3px 0',borderBottom:'1px solid var(--border)'}},h('span',{style:{width:130,fontFamily:'monospace'}},b.id),h('span',{style:{width:80}},String(b.date).split('-').reverse().join('/')),h('span',{style:{flex:1}},b.customer),h('b',null,FD_M(billCalc(b).total)),h('button',{className:'btn btn-ghost btn-sm',style:{padding:'0 6px'},onClick:()=>fdPrintBill(sid,b)},'🖨'))))),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-primary',onClick:onClose},'Close'))));
}

// ── A4 · photos as attachments ({dataUrl}) — moved to cloud file storage by the sync; shown via a signed link ──
function fdPhotoSrc(p){return p?(p.dataUrl||p.d||(typeof p==='string'?p:'')):'';}
function FdImg({src,style,alt,title,onClick}){
  const h=React.createElement;const [url,setUrl]=useState(()=>typeof isStoredFileRef==='function'&&isStoredFileRef(src)?'':src);
  useEffect(()=>{let ok=true;if(typeof isStoredFileRef==='function'&&isStoredFileRef(src)){signedFileUrl(src,'photo').then(u=>{if(ok)setUrl(u);}).catch(()=>{});}else setUrl(src);return()=>{ok=false;};},[src]);
  return url?h('img',{src:url,style,alt:alt||'',title,onClick}):h('div',{style:{...style,background:'var(--bg3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'var(--text3)'}},'…');
}

// ── B5 · day close ──
function fdClosedKey(sid){return outletKey('salonos_closed_days',sid);}
function fdClosedDays(sid){return fdJ(fdClosedKey(sid),{})||{};}
function fdCloseDay(sid,iso,summary){const o=fdClosedDays(sid);o[iso]={by:(currentSessionUser()||{}).name||'',at:new Date().toISOString(),summary};safeLocalSet(fdClosedKey(sid),JSON.stringify(o));try{logAuditEvent(sid,{entity:'Day close',entityId:iso,action:'Closed',summary:summary||''});}catch(e){}}
// true when the bill's day may still be changed (asks a Super Admin for a reason when it is closed)
function fdDayOpenFor(sid,iso,what){
  if(!controlOn('dayCloseLock',sid)||!fdClosedDays(sid)[iso])return true;
  return typeof requestUnlock==='function'?requestUnlock(sid,'the closed day '+String(iso).split('-').reverse().join('/')+(what?' — to '+what:'')):false;
}
// ── B5b · edit history ──
function fdBillDiff(a,b){
  const ch={};const ta=billCalc(a).total,tb=billCalc(b).total;if(ta!==tb)ch.total=[ta,tb];
  ['customer','phone','date','staff','paymentMode','status','discount'].forEach(k=>{if(String(a[k]==null?'':a[k])!==String(b[k]==null?'':b[k]))ch[k]=[a[k],b[k]];});
  const li=x=>(x.items||[]).map(it=>it.name+'×'+it.qty+'@'+it.rate+'/'+(it.staffName||'')).join('; ');if(li(a)!==li(b))ch.items=[li(a),li(b)];return ch;
}
// ── B6 · rate below menu = discount ──
function fdRateDiscount(sid,items){return Math.round((items||[]).reduce((s,it)=>{const m=fdMenuItem(sid,it.name);if(!m||!(Number(m.rate)>0)||it.type==='Voucher')return s;return s+Math.max(0,(Number(m.rate)-(Number(it.rate)||0))*(Number(it.qty)||0));},0));}
function fdListSubtotal(sid,items){return Math.round((items||[]).reduce((s,it)=>{const m=fdMenuItem(sid,it.name);const r=m&&Number(m.rate)>0?Math.max(Number(m.rate),Number(it.rate)||0):(Number(it.rate)||0);return s+r*(Number(it.qty)||0);},0));}
// ── B7 · cancel / refund reason and approval ──
function fdCancelOk(sid,bill,what){
  const reason=window.prompt((what==='refund'?'Refund':'Cancel')+' '+bill.id+' ('+FD_M(billCalc(bill).total)+') — reason:','');if(reason==null)return null;if(!String(reason).trim()){window.alert('A reason is required.');return null;}
  if(!fdDayOpenFor(sid,bill.date,what))return null;
  if(controlOn('cancelApproval',sid)&&billCalc(bill).total>(controlLimit('cancelApproval')||2000)&&!requireApproval({control:'cancelApproval',sid,key:sid+'|'+what+'|'+bill.id,summary:(what==='refund'?'Refund':'Cancel')+' bill '+bill.id+' of '+FD_M(billCalc(bill).total)+' ('+bill.customer+') — '+reason}))return null;
  return String(reason).trim();
}
// ── B9 · old dues ──
function fdOldDues(sid){if(!controlOn('oldDuesAlert',sid))return[];const days=controlLimit('oldDuesAlert')||60;return fdDues(sid).filter(e=>e.age>days);}

// ── C10 · new money ──
function fdNewMoney(b){return Math.max(0,billCalc(b).total-(Number(b.packagePaid)||0)-(Number(b.voucherPaid)||0));}
function fdMonthMoney(sid,ym){const L=fdBills(sid).filter(b=>b.status!=='Cancelled'&&String(b.date).startsWith(ym));const billed=L.reduce((s,b)=>s+billCalc(b).total,0);const pkg=L.reduce((s,b)=>s+(Number(b.packagePaid)||0)+(Number(b.voucherPaid)||0),0);
  const sold=L.reduce((s,b)=>s+(b.items||[]).filter(it=>it.type==='Package'||it.type==='Voucher'||it.type==='Membership').reduce((t,it)=>t+(Number(it.qty)||0)*(Number(it.rate)||0),0),0);return{billed:Math.round(billed),fromPackages:Math.round(pkg),newMoney:Math.round(billed-pkg),prepaidSold:Math.round(sold)};}

// ── C11 · GST ──
const FD_SAC_DEFAULT={Hair:'999721',Skin:'999722','Spa & massage':'999723',Nails:'999722',Makeup:'999722','Waxing & threading':'999722',Membership:'999729',Package:'999729',Other:'999729'};
function fdSacOf(sid,it){const m=fdMenuItem(sid,it.name)||{};return m.sac||(it.type==='Service'||it.type==='Membership'||it.type==='Package'?(FD_SAC_DEFAULT[m.category]||'999729'):'');}
function fdIsInterState(sid,bill){const g=String((getSalonRecordById(sid)||{}).gst||'').slice(0,2);const c=String(bill.custGstin||'').trim().slice(0,2);return !!(g&&c&&/^\d\d$/.test(c)&&g!==c);}
function fdGstSummary(sid,ym){
  const L=fdBills(sid).filter(b=>b.status!=='Cancelled'&&!b.noGst&&String(b.date).startsWith(ym));const b2b=[],rate={},hsn={};
  L.forEach(b=>{const t=billCalc(b);const k=t.subtotal?(t.subtotal-t.disc)/t.subtotal:0;const inter=fdIsInterState(sid,b);
    (b.items||[]).forEach(it=>{const g=it.gst==null?18:Number(it.gst)||0;const amt=(Number(it.qty)||0)*(Number(it.rate)||0)*k;const tx=b.inclusive?amt/(1+g/100):amt;const tax=tx*g/100;
      const r=rate[g]=rate[g]||{rate:g,taxable:0,tax:0,b2b:0};r.taxable+=tx;r.tax+=tax;if(b.custGstin)r.b2b+=tx;
      const code=fdSacOf(sid,it)||it.hsn||'—';const hh=hsn[code+'|'+g]=hsn[code+'|'+g]||{code,rate:g,taxable:0,tax:0,qty:0};hh.taxable+=tx;hh.tax+=tax;hh.qty+=Number(it.qty)||0;});
    if(b.custGstin)b2b.push({gstin:b.custGstin,name:b.customer,no:b.id,date:b.date,taxable:Math.round(t.taxable),igst:inter?t.gst:0,cgst:inter?0:Math.round(t.gst/2),sgst:inter?0:t.gst-Math.round(t.gst/2),total:t.total});});
  const R=x=>Math.round(x*100)/100;return{b2b,rates:Object.values(rate).map(r=>({...r,taxable:R(r.taxable),tax:R(r.tax),b2b:R(r.b2b)})),hsn:Object.values(hsn).map(x=>({...x,taxable:R(x.taxable),tax:R(x.tax)}))};
}
function fdGstExcel(sid,ym){
  const g=fdGstSummary(sid,ym);const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(g.b2b.map(x=>({'Customer GSTIN':x.gstin,'Name':x.name,'Invoice no':x.no,'Date':x.date,'Taxable':x.taxable,'IGST':x.igst,'CGST':x.cgst,'SGST':x.sgst,'Invoice value':x.total}))),'B2B');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(g.rates.map(r=>({'GST rate %':r.rate,'Taxable (all)':r.taxable,'Of which B2B':r.b2b,'B2C taxable':Math.round((r.taxable-r.b2b)*100)/100,'Tax':r.tax}))),'By rate');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(g.hsn.map(x=>({'SAC / HSN':x.code,'Rate %':x.rate,'Quantity':x.qty,'Taxable':x.taxable,'Tax':x.tax}))),'HSN-SAC');
  XLSX.writeFile(wb,'GST_summary_'+rptFile(rptShort(getSalonRecordById(sid)||{name:'Outlet'}))+'_'+ym+'.xlsx');
}
function FdGstModal({sid,onClose}){
  const h=React.createElement;const [ym,setYm]=useState(fdTodayIso().slice(0,7));const g=fdGstSummary(sid,ym);const M2=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:720,maxWidth:'97vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title',style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},'📑 GST summary',h('input',{type:'month',className:'form-control',style:{width:160},value:ym,onChange:e=>setYm(e.target.value)})),
    !fdSettings(sid).gst&&h('div',{className:'help-note'},'This outlet is set as not GST-registered.'),
    h('b',null,'By rate'),h('table',{style:{width:'100%',fontSize:12.5,margin:'4px 0 10px'}},h('tbody',null,g.rates.map(r=>h('tr',{key:r.rate},h('td',null,r.rate+'%'),h('td',{style:{textAlign:'right'}},'Taxable '+M2(r.taxable)),h('td',{style:{textAlign:'right'}},'B2B '+M2(r.b2b)),h('td',{style:{textAlign:'right'}},'Tax '+M2(r.tax)))))),
    h('b',null,'B2B invoices ('+g.b2b.length+')'),h('div',{style:{maxHeight:180,overflowY:'auto',fontSize:12.5,margin:'4px 0 10px'}},g.b2b.map(x=>h('div',{key:x.no},x.no+' · '+x.gstin+' · '+x.name+' · '+M2(x.total)+(x.igst?' (IGST)':'')))),
    h('b',null,'SAC / HSN'),h('table',{style:{width:'100%',fontSize:12.5,marginTop:4}},h('tbody',null,g.hsn.map(x=>h('tr',{key:x.code+x.rate},h('td',null,x.code),h('td',null,x.rate+'%'),h('td',{style:{textAlign:'right'}},M2(x.taxable)),h('td',{style:{textAlign:'right'}},M2(x.tax)))))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:8}},'For GSTR-1: B2B per invoice, B2C by rate, and the HSN/SAC summary. Credit notes are netted in. Check against your accountant’s working before filing.'),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:()=>fdGstExcel(sid,ym)},'⬇ Excel'),h('button',{className:'btn btn-primary',onClick:onClose},'Close'))));
}

// ── D17 · privacy ──
const FD_FULL_PHONE_ROLES=['Super Admin','Owner','Salon Owner','Salon Manager','Accountant','ASM'];
function fdShowPhone(sid,phone){const p=String(phone||'');if(!p||!controlOn('maskClientPhones',sid))return p;const u=currentSessionUser();if(u&&FD_FULL_PHONE_ROLES.includes(u.role))return p;const d=p.replace(/\D/g,'');return d.length>=10?d.slice(0,2)+'••••••'+d.slice(-2):'••••';}
function fdEraseClient(sid,clientId){
  const C=fdClients(sid);const c=C.find(x=>x.id===clientId);if(!c)return'Client not found';const p=fdP10(c.phone);
  fdSaveClients(sid,C.map(x=>x.id===clientId?{id:x.id,name:'Erased client',phone:'',erased:new Date().toISOString(),visits:0,spend:0,tier:'None'}:x));
  if(p.length===10){safeLocalSet(outletKey('salonos_billing_invoices',sid),JSON.stringify(fdBills(sid).map(b=>fdP10(b.phone)===p?{...b,customer:'Erased client',phone:''}:b)));
    const B=fdLoadBook(sid);Object.keys(B).forEach(k=>{B[k]=(B[k]||[]).map(a=>fdP10(a.phone)===p?{...a,client:'Erased client',phone:''}:a);});safeLocalSet(fdBookKey(sid),JSON.stringify(B));}
  try{logAuditEvent(sid,{entity:'Client',entityId:clientId,action:'Personal data erased',summary:'On request — bills kept without name / mobile'});}catch(e){}return'';
}
