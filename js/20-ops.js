// ── Operations automation (batch 3) ───────────────────────────────────────────────────────────
// Money & cash: physical cash count with reasons (Daily Sales & Exp rows "Physical Cash Count" /
// "Cash Difference"), bank reconciliation report, vendor WhatsApp messages, duplicate-payment guard
// (in saveVendorInvoices). Staff: absence watch, incentive target tracker, weekly-off planner, exit
// checklist. Sales & clients: owner daily summary, monthly sales target, membership-expiry,
// birthday and repeat-service reminders.

const OPS_M=['January','February','March','April','May','June','July','August','September','October','November','December'];
const opsMoney=n=>(Number(n)<0?'-':'')+'₹'+Math.round(Math.abs(Number(n)||0)).toLocaleString('en-IN');
const opsIso=d=>localIsoOf(d);
const opsDMY=iso=>String(iso||'').split('-').reverse().join('/');
function opsShort(s){return String(s&&s.name||'Outlet').split('—')[0].trim();}

// ── 1 · Physical cash count ──
function cashDiffLimitFor(sid){const v=outletSettings(sid).cashDiffLimit;return v===''||v==null||isNaN(Number(v))?100:Math.max(0,Number(v));}
function loadCashCounts(sid){try{return JSON.parse(cachedLocalGet(outletKey('salonos_cash_counts',sid))||'{}')||{};}catch(e){return{};}}
// Called by Daily Sales & Exp when the counted cash is entered: stores count vs book closing, and
// asks for a reason when they differ by more than the outlet's limit.
function recordCashCount(sid,iso,count,closing){
  const m=loadCashCounts(sid);
  if(count===''||count==null||isNaN(Number(count))){delete m[iso];safeLocalSet(outletKey('salonos_cash_counts',sid),JSON.stringify(m));return;}
  const diff=Math.round(Number(count)-Number(closing||0));
  const rec={count:Number(count),closing:Math.round(Number(closing)||0),diff,at:new Date().toISOString(),reason:(m[iso]&&m[iso].reason)||''};
  const lim=cashDiffLimitFor(sid);
  if(Math.abs(diff)>lim){
    let r=null;try{r=window.prompt('Cash counted '+opsMoney(count)+' vs book closing '+opsMoney(closing)+' — '+(diff<0?'short by ':'excess of ')+opsMoney(Math.abs(diff))+'.\n\nReason (required for differences over '+opsMoney(lim)+'):',rec.reason||'');}catch(e){}
    if(r!=null)rec.reason=String(r).trim();
  }
  m[iso]=rec;safeLocalSet(outletKey('salonos_cash_counts',sid),JSON.stringify(m));
}

// ── 2 · Bank reconciliation report ──
const BANK_PAY_MODES=['NEFT','RTGS','IMPS','UPI','Cheque','Bank Transfer','Card','Net Banking'];
function bankRecoFor(sid,year,month){
  const pre=year+'-'+String(month+1).padStart(2,'0');
  const rows=(loadBankStatementRows(sid)||[]).map(r=>({...r,iso:toISO(r.transactionDate||r.date)})).filter(r=>r.iso&&r.iso.startsWith(pre));
  const unrecorded=rows.filter(r=>(Number(r.debit)>0||Number(r.credit)>0)&&!r.nature&&!r.linkedInvoice);
  const vendors=loadVendors(sid)||[];const vName=id=>(vendors.find(v=>v.id===id)||{}).name||id||'—';
  const pays=[];
  (loadVendorInvoices(sid)||[]).forEach(inv=>(inv.payments||[]).forEach(p=>{const iso=toISO(p.paidDate);if(iso&&iso.startsWith(pre)&&BANK_PAY_MODES.includes(p.mode))pays.push({inv,p,iso,amt:Number(p.paidAmount)||0});}));
  const used=new Set();
  const dayN=iso=>Math.floor(new Date(iso+'T00:00:00').getTime()/864e5);
  const allDebits=(loadBankStatementRows(sid)||[]).map((r,i)=>({r,i,iso:toISO(r.transactionDate||r.date),amt:Number(r.debit)||0})).filter(x=>x.iso&&x.amt>0);
  const notInBank=pays.filter(x=>{
    const hit=allDebits.find(b=>!used.has(b.i)&&Math.abs(b.amt-x.amt)<1&&Math.abs(dayN(b.iso)-dayN(x.iso))<=5);
    if(hit){used.add(hit.i);return false;}return true;
  }).map(x=>({...x,vendor:vName(x.inv.vendorId)}));
  return{rows,unrecorded,notInBank};
}
function BankRecoSheet({salon,period}={}){
  const h=React.createElement;const {toast}=useToast();
  const [cal,setCal]=useAfCal(period);const sid=salon?.id;
  const r=bankRecoFor(sid,cal.year,cal.month);
  const label=OPS_M[cal.month]+' '+cal.year;
  const exp=async()=>{try{await afDownloadXlsx('Bank Reconciliation',[['Type','Date','Description / Vendor','Debit','Credit','Ref'],
    ...r.unrecorded.map(x=>['Bank line not recorded in SalonOS',opsDMY(x.iso),x.description||'',Number(x.debit)||0,Number(x.credit)||0,x.refNo||'']),
    ...r.notInBank.map(x=>['Paid in SalonOS, not found in bank',opsDMY(x.iso),x.vendor+' — '+(x.inv.invoiceNo||''),x.amt,0,x.p.ref||''])],'Bank_Reco_'+opsShort(salon).replace(/[^A-Za-z0-9]+/g,'_')+'_'+cal.year+'-'+String(cal.month+1).padStart(2,'0')+'.xlsx');}catch(e){toast(e.message,'error');}};
  const tbl=(cols,rows)=>h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,cols.map((c,i)=>h('th',{key:i},c)))),h('tbody',null,rows)));
  return h('div',null,
    h('div',{className:'section-header'},h('div',null,h('div',{className:'page-title'},'Bank Reconciliation'),
      h('div',{className:'page-sub'},label+' — bank lines with no entry in SalonOS, and bank payments recorded in SalonOS that don’t appear in the bank statement (matched by amount within 5 days)')),
      h('div',{style:{display:'flex',gap:8}},afMonthPicker(cal,setCal),h('button',{className:'btn btn-ghost btn-sm',onClick:exp},'⬇ Excel'))),
    h('div',{className:'grid4',style:{marginBottom:14}},
      h('div',{className:'metric-card'},h('div',{className:'metric-label'},'Bank lines this month'),h('div',{className:'metric-value',style:{fontSize:22}},String(r.rows.length))),
      h('div',{className:'metric-card'},h('div',{className:'metric-label'},'Not recorded in SalonOS'),h('div',{className:'metric-value',style:{fontSize:22,color:r.unrecorded.length?'var(--orange)':'var(--green)'}},String(r.unrecorded.length))),
      h('div',{className:'metric-card'},h('div',{className:'metric-label'},'Paid but not in bank'),h('div',{className:'metric-value',style:{fontSize:22,color:r.notInBank.length?'var(--red)':'var(--green)'}},String(r.notInBank.length)))),
    !r.rows.length&&h('div',{className:'help-note',style:{marginBottom:12}},'No bank statement imported for '+label+' yet.'),
    h('div',{className:'card',style:{marginBottom:14}},h('div',{className:'card-title'},'Bank lines not recorded in SalonOS ('+r.unrecorded.length+')'),
      h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:8}},'No Nature and not linked to a bill — classify them in Bank Statement, or enter the expense / income they belong to.'),
      r.unrecorded.length?tbl(['Date','Description','Debit','Credit'],r.unrecorded.map((x,i)=>h('tr',{key:i},h('td',null,opsDMY(x.iso)),h('td',{style:{fontSize:12}},x.description||''),h('td',{style:{textAlign:'right'}},x.debit?opsMoney(x.debit):''),h('td',{style:{textAlign:'right'}},x.credit?opsMoney(x.credit):''))))
        :h('div',{style:{fontSize:12,color:'var(--green)'}},'✓ Every bank line is accounted for.')),
    h('div',{className:'card'},h('div',{className:'card-title'},'Paid in SalonOS but not found in the bank ('+r.notInBank.length+')'),
      h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:8}},'Vendor payments recorded by NEFT / IMPS / UPI / cheque etc. with no bank debit of the same amount within 5 days — not cleared yet, wrong amount, or paid from another account.'),
      r.notInBank.length?tbl(['Date','Vendor / bill','Mode','Amount'],r.notInBank.map((x,i)=>h('tr',{key:i},h('td',null,opsDMY(x.iso)),h('td',null,x.vendor+' — '+(x.inv.invoiceNo||'')),h('td',null,x.p.mode+(x.p.ref?' · '+x.p.ref:'')),h('td',{style:{textAlign:'right'}},opsMoney(x.amt)))))
        :h('div',{style:{fontSize:12,color:'var(--green)'}},'✓ Every bank payment matches the statement.')));
}

// ── 3 · Vendor messages ──
function VendorMessagesPanel({salonId,salon}){
  const h=React.createElement;const [tick,setTick]=useState(0);
  const vendors=loadVendors(salonId)||[];const vOf=id=>vendors.find(v=>v.id===id)||{};
  const today=new Date();const t0=opsIso(today);const in7=opsIso(new Date(today.getTime()+7*864e5));const ago7=opsIso(new Date(today.getTime()-7*864e5));
  const sent=loadSentMarks(salonId,'vendor');const short=opsShort(salon||outletSettings(salonId));
  const due=[],paid=[];
  (loadVendorInvoices(salonId)||[]).forEach(inv=>{
    if(!inv||inv.docNature==='Performa Invoice')return;
    const pays=inv.payments||[];const bal=(Number(inv.amount)||0)-pays.reduce((t,p)=>t+(Number(p.paidAmount)||0),0);
    const dIso=toISO(inv.dueDate);
    if(bal>0.5&&dIso&&dIso<=in7)due.push({inv,bal,dIso});
    pays.forEach(p=>{const pIso=toISO(p.paidDate);if(pIso&&pIso>=ago7&&pIso<=t0)paid.push({inv,p,pIso});});
  });
  const row=(key,v,text,title,sub)=>h('div',{key,style:{display:'flex',gap:10,alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}},
    h('div',{style:{flex:1,minWidth:0}},h('div',{style:{fontWeight:600,fontSize:13}},title),h('div',{style:{fontSize:11.5,color:'var(--text3)'}},sub)),
    sent[key]&&h('span',{style:{fontSize:11,color:'var(--green)'}},'✓ sent'),
    h('button',{className:'btn btn-ghost btn-sm',disabled:!waPhoneOk(v.phone),title:waPhoneOk(v.phone)?'':'No mobile on the vendor',onClick:()=>{window.open(waLink(v.phone,text),'_blank');markSent(salonId,'vendor',key);setTick(x=>x+1);}},sent[key]?'Again':'📤 Send'));
  return h('div',null,
    h('div',{className:'help-note',style:{marginBottom:12}},'Each Send opens WhatsApp with the message ready for the vendor’s mobile (from Vendor Master) — you press send there.'),
    h('div',{className:'card',style:{marginBottom:14}},h('div',{className:'card-title'},'Bills due in the next 7 days or overdue ('+due.length+')'),
      due.length?due.sort((a,b)=>a.dIso.localeCompare(b.dIso)).map(({inv,bal,dIso})=>{const v=vOf(inv.vendorId);
        return row('due|'+inv.id+'|'+dIso,v,'Dear '+(v.contact||v.name||'Sir/Madam')+', your bill no. '+(inv.invoiceNo||'')+' dated '+String(inv.invoiceDate||'')+' for '+opsMoney(bal)+' is scheduled for payment on '+opsDMY(dIso<t0?t0:dIso)+'. — '+short,
          (v.name||'Vendor')+' — '+(inv.invoiceNo||''),'Balance '+opsMoney(bal)+' · due '+opsDMY(dIso)+(dIso<t0?' (overdue)':''));})
        :h('div',{style:{fontSize:12,color:'var(--text3)'}},'Nothing due this week.')),
    h('div',{className:'card'},h('div',{className:'card-title'},'Payments made in the last 7 days ('+paid.length+')'),
      paid.length?paid.map(({inv,p,pIso})=>{const v=vOf(inv.vendorId);
        return row('paid|'+inv.id+'|'+(p.id||pIso)+'|'+p.paidAmount,v,'Dear '+(v.contact||v.name||'Sir/Madam')+', we have paid '+opsMoney(p.paidAmount)+' on '+opsDMY(pIso)+' by '+(p.mode||'')+(p.ref?' (ref '+p.ref+')':'')+' against bill no. '+(inv.invoiceNo||'')+'. Please acknowledge. — '+short,
          (v.name||'Vendor')+' — '+opsMoney(p.paidAmount),opsDMY(pIso)+' · '+(p.mode||'')+(p.ref?' · '+p.ref:''));})
        :h('div',{style:{fontSize:12,color:'var(--text3)'}},'No payments in the last 7 days.')));
}

// ── 4 · Duplicate payment check (used by saveVendorInvoices) ──
// Returns a warning text when the new payments on this bill would pay it more than once.
function duplicatePaymentWarning(oldInv,newInv){
  if(!oldInv||!newInv)return'';
  const oldIds=new Set((oldInv.payments||[]).map(p=>p.id||JSON.stringify(p)));
  const added=(newInv.payments||[]).filter(p=>!oldIds.has(p.id||JSON.stringify(p)));
  if(!added.length)return'';
  const amt=Number(newInv.amount)||0;
  const paidBefore=(oldInv.payments||[]).reduce((t,p)=>t+(Number(p.paidAmount)||0),0);
  const paidNow=(newInv.payments||[]).reduce((t,p)=>t+(Number(p.paidAmount)||0),0);
  const lab='Bill '+(newInv.invoiceNo||newInv.id);
  if(amt>0&&paidBefore>=amt-0.5)return lab+' is already fully paid ('+opsMoney(paidBefore)+'). Record another payment of '+opsMoney(paidNow-paidBefore)+' anyway?';
  if(amt>0&&paidNow>amt+1)return lab+' would be paid '+opsMoney(paidNow)+' against a bill of '+opsMoney(amt)+' — more than once. Save anyway?';
  const dayN=d=>{const iso=toISO(d);return iso?Math.floor(new Date(iso+'T00:00:00').getTime()/864e5):null;};
  for(const a of added){const ad=dayN(a.paidDate);
    const twin=(oldInv.payments||[]).find(p=>Math.abs((Number(p.paidAmount)||0)-(Number(a.paidAmount)||0))<1&&ad!=null&&dayN(p.paidDate)!=null&&Math.abs(dayN(p.paidDate)-ad)<=7);
    if(twin)return lab+' already has a payment of '+opsMoney(twin.paidAmount)+' on '+String(twin.paidDate)+' ('+(twin.mode||'')+'). This looks like the same payment again — save anyway?';}
  return'';
}

// ── 5 · Absence watch ──
function absenceCountsFor(sid,year,month){
  const att=loadAttendance(sid)||{};
  return(getEmployeesForMonth(year,month,sid)||[]).map(e=>{
    const days=((att[e.id+'_'+year+'_'+month]||{}).days)||[];
    const a=days.filter(d=>d==='absent').length,hd=days.filter(d=>d==='half').length;
    return{e,absent:a,half:hd,score:a+hd/2};
  }).filter(x=>x.score>3).sort((a,b)=>b.score-a.score);
}
function AbsenceWatchBanner({sid,year,month}){
  const h=React.createElement;const list=absenceCountsFor(sid,year,month);
  if(!list.length)return null;
  return h('div',{style:{background:'rgba(240,160,60,0.1)',border:'1px solid rgba(240,160,60,0.35)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:12,fontSize:12.5}},
    h('b',{style:{color:'var(--orange)'}},'⚠ More than 3 absences in '+OPS_M[month]+': '),
    list.map(x=>x.e.name+' ('+x.absent+(x.half?' + '+x.half+' half':'')+')').join(' · '));
}

// ── 6 · Incentive target tracker ──
function IncentiveTargetTracker({salon,period}={}){
  const h=React.createElement;const [cal,setCal]=useAfCal(period);const [tick,setTick]=useState(0);
  const sid=salon?.id;const short=opsShort(salon);
  const rows=incWorkingsFor(sid,cal.year,cal.month)||[];
  const sent=loadSentMarks(sid,'target');
  const nextSlab=e=>withIncPlan(sid,cal.year,cal.month,()=>{
    const slabs=loadServiceSlabs(sid);const sal=Number(e.salary)||0;if(!sal)return null;
    const times=(Number(e.svcActual)||0)/sal;
    const nxt=slabs.slice(1).find(t=>Number(t.threshold)>times);
    return nxt?{need:Math.max(0,Number(nxt.threshold)*sal-(Number(e.svcActual)||0)),times:Number(nxt.threshold),rate:Number(nxt.rate)}:null;
  });
  const pct=(a,t)=>t?Math.round(a/t*100)+'%':'—';
  const msg=(e,n)=>'Hi '+String(e.name).split(' ')[0]+', your '+OPS_M[cal.month]+' progress at '+short+': Service '+opsMoney(e.svcActual)+' of '+opsMoney(e.svcTarget)+' target ('+pct(e.svcActual,e.svcTarget)+')'+
    (e.prodTarget?', Product '+opsMoney(e.prodActual)+' of '+opsMoney(e.prodTarget):'')+(e.memTarget?', Membership '+opsMoney(e.memActual)+' of '+opsMoney(e.memTarget):'')+'.'+
    (n?' Just '+opsMoney(n.need)+' more service sale takes you to the '+n.times+'× slab ('+n.rate+'% incentive). Keep going!':' Great going!');
  const key=e=>e.id+'|'+opsIso(new Date());
  return h('div',null,
    h('div',{className:'section-header'},h('div',null,h('div',{className:'page-title'},'Incentive Target Tracker'),
      h('div',{className:'page-sub'},'Each stylist’s achievement against target and how much more reaches the next service slab — Send opens WhatsApp with their progress message')),afMonthPicker(cal,setCal)),
    h('div',{className:'card',style:{padding:0}},h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,['Employee','Service','Product','Membership','Next slab','',''].map((t,i)=>h('th',{key:i},t)))),
      h('tbody',null,rows.length===0?h('tr',null,h('td',{colSpan:7,style:{textAlign:'center',padding:24,color:'var(--text3)'}},'No incentive working for this month')):
        rows.map(e=>{const n=nextSlab(e);const ph=e.mobile||e.phone;const s=sent[key(e)];
          return h('tr',{key:e.id},h('td',null,h('b',null,e.name),h('div',{style:{fontSize:11,color:'var(--text3)'}},e.desig||'')),
            h('td',null,opsMoney(e.svcActual)+' / '+opsMoney(e.svcTarget),h('div',{style:{fontSize:11,color:'var(--text3)'}},pct(e.svcActual,e.svcTarget))),
            h('td',null,e.prodTarget?opsMoney(e.prodActual)+' / '+opsMoney(e.prodTarget):'—'),
            h('td',null,e.memTarget?opsMoney(e.memActual)+' / '+opsMoney(e.memTarget):'—'),
            h('td',{style:{fontSize:12}},n?opsMoney(n.need)+' more → '+n.times+'× ('+n.rate+'%)':'top slab'),
            h('td',{style:{fontSize:11,color:'var(--green)'}},s?'✓ sent today':''),
            h('td',null,h('button',{className:'btn btn-ghost btn-sm',disabled:!waPhoneOk(ph),onClick:()=>{window.open(waLink(ph,msg(e,n)),'_blank');markSent(sid,'target',key(e));setTick(x=>x+1);}},'📤 Send')));}))))));
}

// ── 7 · Weekly-off planner ──
const OPS_DOW=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
function WeeklyOffPlanner({sid,year,month}){
  const h=React.createElement;
  const emps=(getEmployeesForMonth(year,month,sid)||[]).filter(e=>e.status==='Active');
  const by={};OPS_DOW.forEach(d=>by[d]=emps.filter(e=>e.weeklyOff===d));
  const desigs=[...new Set(emps.map(e=>e.desig).filter(Boolean))];
  let book={};try{book=JSON.parse(cachedLocalGet(outletKey('salonos_appointments_book',sid))||'{}')||{};}catch(e){}
  const appts={};OPS_DOW.forEach(d=>appts[d]=0);
  for(let i=0;i<28;i++){const dt=new Date();dt.setDate(dt.getDate()+i);const dn=OPS_DOW[(dt.getDay()+6)%7];appts[dn]+=((book[sid+'|'+fdDateStr(dt)]||[]).filter(a=>a&&a.status!=='Cancelled').length)/4;}
  const flags=[];
  OPS_DOW.forEach(d=>{
    desigs.forEach(g=>{const all=emps.filter(e=>e.desig===g).length,off=by[d].filter(e=>e.desig===g).length;
      if(off>=2&&off>=Math.ceil(all/2))flags.push(d+': '+off+' of '+all+' '+g+'s off the same day');});
    const work=emps.length-by[d].length;if(appts[d]>0&&work>0&&appts[d]/work>8)flags.push(d+': about '+Math.round(appts[d])+' bookings for '+work+' staff working');
  });
  return h('div',{className:'card'},
    h('div',{className:'card-title'},'Weekly-off planner'),
    flags.length?h('div',{style:{background:'rgba(240,160,60,0.1)',border:'1px solid rgba(240,160,60,0.35)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:10,fontSize:12.5}},flags.map((f,i)=>h('div',{key:i},'⚠ '+f)))
      :h('div',{style:{fontSize:12,color:'var(--green)',marginBottom:10}},'✓ Weekly offs are spread out — no clashes found.'),
    h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,['Day','Off','Working','Avg bookings (next 4 wks)','Who is off'].map((t,i)=>h('th',{key:i},t)))),
      h('tbody',null,OPS_DOW.map(d=>h('tr',{key:d},h('td',{style:{fontWeight:600}},d),h('td',null,by[d].length),h('td',null,emps.length-by[d].length),h('td',null,appts[d]?appts[d].toFixed(1):'—'),
        h('td',{style:{fontSize:12}},by[d].map(e=>e.name+(e.desig?' ('+e.desig+')':'')).join(', ')||'—')))))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'Weekly offs are set per employee in Master Salary.'));
}

// ── 8 · Exit checklist ──
function exitChecklistFor(sid,e){
  const dol=toISO(e.dol);if(!dol)return null;
  const y=Number(dol.slice(0,4)),m=Number(dol.slice(5,7))-1;
  const adv=(loadAdvances(sid)||[]).filter(a=>a.emp===e.name&&a.status==='Active').reduce((t,a)=>t+(Number(a.outstanding)||0),0);
  const sw=(swWorkingsFor(sid,y,m)||[]).find(w=>w.id===e.id);
  const swMeta=loadSWMeta(sid)[attMonthKey(e.id,y,m)]||{};
  let inc=null;try{inc=(incWorkingsFor(sid,y,m)||[]).find(w=>w.id===e.id);}catch(er){}
  const iwMeta=loadIWMeta(sid)[attMonthKey(e.id,y,m)]||{};
  const items=[
    {label:'Advance recovered',done:adv<=0.5,detail:adv>0.5?opsMoney(adv)+' still outstanding — recover from final salary or collect':'Nothing outstanding'},
    {label:'Attendance marked to the last day ('+opsDMY(dol)+')',done:salaryAttendanceReady(sid,y,m),detail:salaryAttendanceReady(sid,y,m)?'Month final':'Mark '+OPS_M[m]+' attendance Month Final'},
    {label:'Final salary paid',done:swMeta.paymentStatus==='Paid',detail:sw?'Net '+opsMoney(sw.net)+' for '+OPS_M[m]+(swMeta.paymentStatus==='Paid'?' — paid':' — not paid yet'):'—'},
    {label:'Incentive settled',done:!inc||!(inc.totalInc>0)||iwMeta.paymentStatus==='Paid',detail:inc&&inc.totalInc>0?opsMoney(inc.totalInc)+(iwMeta.paymentStatus==='Paid'?' — paid':' — not paid yet'):'No incentive due'},
    ...(e.pf?[{label:'PF: date of exit updated on EPFO',done:false,manual:true,detail:'UAN '+(e.pfNumber||'—')+' — update the date of exit on the EPFO employer portal'}]:[]),
    ...(e.esic?[{label:'ESIC: employee marked left',done:false,manual:true,detail:'IP '+(e.esicNumber||'—')+' — record the date of leaving on the ESIC portal'}]:[]),
  ];
  return{e,dol,items};
}
function ExitChecklistCard({sid}){
  const h=React.createElement;
  const [ticks,setTicks]=useState(()=>{try{return JSON.parse(cachedLocalGet(outletKey('salonos_exit_ticks',sid))||'{}')||{};}catch(e){return{};}});
  const now=Date.now();
  const list=(loadEmployees(sid)||[]).filter(e=>{const d=toISO(e.dol);if(!d)return false;const t=new Date(d+'T00:00:00').getTime();return t>=now-75*864e5&&t<=now+31*864e5;}).map(e=>exitChecklistFor(sid,e)).filter(Boolean);
  if(!list.length)return null;
  const tick=(k,v)=>{const n={...ticks,[k]:v};setTicks(n);safeLocalSet(outletKey('salonos_exit_ticks',sid),JSON.stringify(n));};
  return h('div',{className:'card',style:{marginBottom:16}},
    h('div',{className:'card-title'},'🚪 Exit checklist — leaving / recently left'),
    list.map(({e,dol,items})=>{
      const done=items.filter(it=>it.manual?ticks[e.id+'|'+it.label]:it.done).length;
      return h('div',{key:e.id,style:{padding:'8px 0',borderBottom:'1px solid var(--border)'}},
        h('div',{style:{fontWeight:600,fontSize:13,marginBottom:4}},e.name+' — leaving '+opsDMY(dol)+' · '+done+'/'+items.length+' done'),
        items.map(it=>{const ok=it.manual?!!ticks[e.id+'|'+it.label]:it.done;
          return h('div',{key:it.label,style:{display:'flex',gap:8,alignItems:'center',fontSize:12,padding:'2px 0'}},
            it.manual?h('input',{type:'checkbox',checked:ok,onChange:ev=>tick(e.id+'|'+it.label,ev.target.checked)}):h('span',{style:{width:16,color:ok?'var(--green)':'var(--red)'}},ok?'✓':'✗'),
            h('span',{style:{fontWeight:500}},it.label),h('span',{style:{color:'var(--text3)'}},'— '+it.detail));}));}));
}

// ── 9 / 10 · Owner daily summary and monthly sales target ──
function loadSalesTargets(sid){try{return JSON.parse(cachedLocalGet(outletKey('salonos_sales_targets',sid))||'{}')||{};}catch(e){return{};}}
function salesTargetFor(sid,y,m){return Number(loadSalesTargets(sid)[y+'-'+String(m+1).padStart(2,'0')])||0;}
function setSalesTarget(sid,y,m,v){const t=loadSalesTargets(sid);t[y+'-'+String(m+1).padStart(2,'0')]=Number(v)||0;safeLocalSet(outletKey('salonos_sales_targets',sid),JSON.stringify(t));}
function dayGrossSales(sid,iso){
  let ds={};try{ds=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',sid))||'{}')||{};}catch(e){}
  const d=ds[iso]||{};const n=k=>Number(d[k])||0;
  return{cash:n(0),card:n(1),upi:n(2)+n(3),apps:n(14)+n(15)+n(16),outstanding:n(4),total:n(0)+n(1)+n(2)+n(3)+n(4)+n(14)+n(15)+n(16),count:d[17]};
}
function dayExpenses(sid,iso){let dd={};try{dd=(JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_data',sid))||'{}')||{})[iso]||{};}catch(e){}return Object.values(dd).reduce((t,v)=>t+(Number(v)||0),0);}
function mtdGrossSales(sid,iso){const pre=iso.slice(0,8);let t=0;for(let d=1;d<=Number(iso.slice(8,10));d++)t+=dayGrossSales(sid,pre+String(d).padStart(2,'0')).total;return t;}
function ownerSummaryText(sid,iso){
  const s=dayGrossSales(sid,iso);const exp=dayExpenses(sid,iso);
  const wk=new Date(iso+'T00:00:00');wk.setDate(wk.getDate()-7);const lw=dayGrossSales(sid,opsIso(wk)).total;
  const y=Number(iso.slice(0,4)),m=Number(iso.slice(5,7))-1,dim=new Date(y,m+1,0).getDate(),day=Number(iso.slice(8,10));
  const mtd=mtdGrossSales(sid,iso),tgt=salesTargetFor(sid,y,m);
  const cc=loadCashCounts(sid)[iso];
  const lines=['*'+String(outletSettings(sid).name||'Outlet').split('—')[0].trim()+' — '+opsDMY(iso)+'*',
    'Sales: '+opsMoney(s.total)+' (Cash '+opsMoney(s.cash)+', Card '+opsMoney(s.card)+', UPI '+opsMoney(s.upi)+(s.apps?', Apps '+opsMoney(s.apps):'')+')',
    'vs last '+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(iso+'T00:00:00').getDay()]+': '+opsMoney(lw)+(lw?' ('+(s.total>=lw?'+':'')+Math.round((s.total-lw)/lw*100)+'%)':''),
    'Expenses: '+opsMoney(exp),
    ...(cc?['Cash counted: '+opsMoney(cc.count)+(cc.diff?' ('+(cc.diff<0?'short ':'excess ')+opsMoney(Math.abs(cc.diff))+')':' — matches book')]:[]),
    'MTD sales: '+opsMoney(mtd)+(tgt?' of '+opsMoney(tgt)+' target ('+Math.round(mtd/tgt*100)+'%) · need '+opsMoney(Math.max(0,(tgt-mtd)/Math.max(1,dim-day)))+'/day':'')];
  return lines.join('\n');
}
function DailyOwnerSummaryBoard({accessibleSalons}){
  const h=React.createElement;
  const [iso,setIso]=useState(()=>{const d=new Date();return opsIso(d);});
  const outlets=(accessibleSalons||[]).filter(s=>s&&s.id!=null&&s.status!=='Inactive');
  const all=outlets.map(s=>ownerSummaryText(s.id,iso)).join('\n\n');
  return h('div',null,
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}},
      h('div',null,h('div',{className:'page-title'},'Daily Summary'),h('div',{className:'page-sub'},'Each outlet’s day in one message — sales by mode, vs same day last week, expenses, cash counted, MTD vs target')),
      h('div',{style:{display:'flex',gap:8,alignItems:'center'}},h('input',{type:'date',className:'form-control',style:{width:'auto'},value:iso,max:opsIso(new Date()),onChange:e=>e.target.value&&setIso(e.target.value)}),
        h('button',{className:'btn btn-primary btn-sm',onClick:()=>window.open('https://wa.me/?text='+encodeURIComponent(all),'_blank')},'📤 Send all on WhatsApp'))),
    outlets.map(s=>{const t=ownerSummaryText(s.id,iso);const ph=outletSettings(s.id).ownerPhone;
      return h('div',{key:s.id,className:'card',style:{marginBottom:10}},
        h('pre',{style:{whiteSpace:'pre-wrap',fontFamily:'inherit',fontSize:12.5,margin:0}},t),
        h('div',{style:{display:'flex',gap:8,marginTop:8}},h('button',{className:'btn btn-ghost btn-sm',onClick:()=>window.open(waPhoneOk(ph)?waLink(ph,t):'https://wa.me/?text='+encodeURIComponent(t),'_blank')},'📤 Send'+(waPhoneOk(ph)?' to owner':''))));}));
}

// ── 11 / 12 · Client reminders: membership expiry, birthdays, repeat services ──
const REPEAT_SERVICE_RULES=[[/colou?r|highlight|root touch|global/i,'Hair colour',45],[/facial|clean.?up|d.?tan/i,'Facial / clean-up',30],[/hair ?cut|haircut|trim/i,'Haircut',35],[/keratin|smooth|botox|rebond/i,'Hair treatment',120],[/pedicure|manicure/i,'Mani / pedi',30],[/wax/i,'Waxing',25]];
function clientReminderLists(sid,clients){
  const today=new Date();today.setHours(0,0,0,0);const t=today.getTime();
  const dayDiff=iso=>Math.round((new Date(iso+'T00:00:00').getTime()-t)/864e5);
  const expiring=(clients||[]).filter(c=>c&&c.tier&&c.tier!=='None'&&c.tierValidTill&&waPhoneOk(c.phone)).map(c=>({c,left:dayDiff(c.tierValidTill)})).filter(x=>x.left>=0&&x.left<=15).sort((a,b)=>a.left-b.left);
  const MON={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  const bdays=(clients||[]).filter(c=>c&&c.birthday&&waPhoneOk(c.phone)).map(c=>{const m=String(c.birthday).match(/(\d{1,2})\s*([A-Za-z]{3})/);if(!m)return null;
    const d=new Date(today.getFullYear(),MON[m[2].toLowerCase()],Number(m[1]));if(d.getTime()<t)d.setFullYear(d.getFullYear()+1);return{c,left:Math.round((d.getTime()-t)/864e5)};}).filter(x=>x&&x.left<=7).sort((a,b)=>a.left-b.left);
  let bills=[];try{bills=JSON.parse(cachedLocalGet(outletKey('salonos_billing_invoices',sid))||'[]')||[];}catch(e){}
  const last={};
  bills.forEach(b=>{if(!b||!waPhoneOk(b.phone)||b.status==='Cancelled')return;const iso=toISO(b.date);if(!iso)return;
    (b.items||[]).forEach(it=>{const r=REPEAT_SERVICE_RULES.find(x=>x[0].test(String(it.name||it.service||'')));if(!r)return;const k=String(b.phone).replace(/\D/g,'').slice(-10)+'|'+r[1];
      if(!last[k]||last[k].iso<iso)last[k]={iso,name:b.customer,phone:b.phone,svc:r[1],every:r[2]};});});
  const repeat=Object.values(last).map(x=>({...x,since:-dayDiff(x.iso)})).filter(x=>x.since>=x.every&&x.since<=x.every+30).sort((a,b)=>b.since-a.since).slice(0,40);
  return{expiring,bdays,repeat};
}
