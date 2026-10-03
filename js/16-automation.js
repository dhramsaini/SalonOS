// ── Automation & controls ────────────────────────────────────────────────────────────────────
// 1. Collection difference rule (per outlet, Master Sheet → Controls): a day where Collection
//    Reco (CRADLE) and Daily Sales & Exp differ by more than the outlet's limit is "flagged"; with
//    "block" on, Daily Sales Month Final and P&L Final can't be set until each flagged day has a
//    reason in P&L (Monthly) → Collection Comparison.
// 2. Month-End Close checklist — every step of closing a month, ticked automatically from the
//    data itself, for one outlet (P&L (Monthly) → Month-End Close) or all outlets (Master
//    Dashboard → Month-End Close).

function collectionDiffSettings(sid){
  const s=outletSettings(sid);
  const raw=s.collDiffLimit;
  const limit=raw===''||raw==null||isNaN(Number(raw))?100:Math.max(0,Number(raw));
  return{limit,block:!!s.collDiffBlock};
}
function loadCollectionDiffReasons(sid){try{return JSON.parse(cachedLocalGet(outletKey('salonos_collection_cmp_reasons',sid))||'{}')||{};}catch(e){return{};}}
// A day is over the limit when Cash, Card, UPI (+Luzo) or the Total differs by more than it.
function collectionDayOverLimit(r,limit){
  const lim=Math.max(0.5,Number(limit)||0);
  return Math.abs(r.ct-r.et)>lim||Math.abs(r.c.cash-r.e.cash)>lim||Math.abs(r.c.card-r.e.card)>lim||Math.abs(r.c.upi-r.e.upi)>lim;
}
function collectionDiffStatusFor(sid,year,month){
  if(isRestaurantOutlet(sid))return{applicable:false,hasCradle:false,flagged:[],unexplained:[],limit:0,block:false};
  const {limit,block}=collectionDiffSettings(sid);
  const rows=collectionComparisonRowsFor(sid,year,month);
  const hasCradle=rows.some(r=>r.hasC);
  const reasons=loadCollectionDiffReasons(sid);
  // Without any CRADLE import for the month there is nothing to compare against yet.
  const flagged=hasCradle?rows.filter(r=>(r.hasC||r.hasD)&&collectionDayOverLimit(r,limit)):[];
  const unexplained=flagged.filter(r=>!String(reasons[r.iso]||'').trim());
  return{applicable:true,hasCradle,flagged,unexplained,limit,block};
}
// Returns an error message when finalising this month must wait for collection reasons, else ''.
function collectionFinalBlockMessage(sid,year,month){
  const st=collectionDiffStatusFor(sid,year,month);
  if(!st.applicable||!st.block||!st.unexplained.length)return'';
  const ds=st.unexplained.slice(0,6).map(r=>r.iso.split('-').reverse().slice(0,2).join('/')).join(', ')+(st.unexplained.length>6?'…':'');
  return st.unexplained.length+' day'+(st.unexplained.length===1?'':'s')+' where CRADLE and Daily Sales differ by more than ₹'+st.limit.toLocaleString('en-IN')+' have no reason yet ('+ds+'). Add the reasons in P&L (Monthly) → Collection Comparison first.';
}

// ── Month-End Close ──
function bankRowsInMonth(sid,year,month){
  let rows=[];try{rows=JSON.parse(cachedLocalGet(outletKey('salonos_bank_statement_rows',sid))||'[]')||[];}catch(e){}
  const pre=year+'-'+String(month+1).padStart(2,'0');
  return rows.filter(r=>{const iso=toISO(r&&(r.transactionDate||r.date));return iso&&iso.startsWith(pre);}).length;
}
function dseDaysMissingFor(sid,year,month){
  let ds={};try{ds=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',sid))||'{}')||{};}catch(e){}
  const today=new Date();
  const last=(year===today.getFullYear()&&month===today.getMonth())?today.getDate()-1:new Date(year,month+1,0).getDate();
  if(year>today.getFullYear()||(year===today.getFullYear()&&month>today.getMonth()))return[];
  const out=[];
  for(let d=1;d<=last;d++){
    const iso=year+'-'+String(month+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const day=ds[iso]||{};
    if(!Object.values(day).some(v=>Number(v)))out.push(iso);
  }
  return out;
}
function monthCloseStepsFor(sid,year,month){
  const rest=isRestaurantOutlet(sid);
  const {fy,mi}=calToFYMI(year,month);
  const missing=dseDaysMissingFor(sid,year,month);
  const emps=getEmployeesForMonth(year,month,sid)||[];
  const swMeta=loadSWMeta(sid);
  const approved=emps.filter(e=>(swMeta[attMonthKey(e.id,year,month)]||{}).status==='Approved').length;
  const salaryDone=isMonthLockedFor(sid,year,month)||(emps.length>0&&approved===emps.length);
  const coll=collectionDiffStatusFor(sid,year,month);
  const bankN=bankRowsInMonth(sid,year,month);
  const steps=[
    {key:'sales',label:'Daily Sales entered every day',tab:'daily-sales',done:missing.length===0,
      detail:missing.length?missing.length+' day'+(missing.length===1?'':'s')+' with no sales ('+missing.slice(0,5).map(x=>Number(x.slice(8))).join(', ')+(missing.length>5?', …':'')+')':'All days entered'},
    {key:'dse-final',label:'Daily Sales marked Month Final',tab:'daily-sales',done:isManagerFinalMonth(sid,'dse',year,month)||isPnlFinal(sid,fy,mi),detail:''},
    {key:'att-final',label:'Attendance marked Month Final',tab:'attendance',done:salaryAttendanceReady(sid,year,month),detail:''},
    {key:'salary',label:'Salary Working approved',tab:'salary-working',done:salaryDone,detail:emps.length?approved+' of '+emps.length+' approved':'No employees'},
    ...(rest?[]:[{key:'incentive',label:'Incentive Working approved',tab:'incentive-working',done:isIWEffectiveLockedFor(sid,year,month),detail:''}]),
    ...(rest?[]:[{key:'cradle',label:'CRADLE collection imported',tab:'collection-sheet',done:coll.hasCradle,detail:coll.hasCradle?'':'No Collection Reco import for this month'}]),
    ...(rest?[]:[{key:'coll-diff',label:'Collection differences explained',tab:'outlet-pnl',done:coll.hasCradle&&coll.unexplained.length===0,
      detail:!coll.hasCradle?'Waiting for CRADLE import':coll.unexplained.length?coll.unexplained.length+' of '+coll.flagged.length+' flagged day(s) need a reason':(coll.flagged.length?coll.flagged.length+' flagged, all explained':'No differences over ₹'+coll.limit)}]),
    {key:'bank',label:'Bank statement imported',tab:'bank-statement',done:bankN>0,detail:bankN?bankN+' entries':'Nothing imported for this month'},
    {key:'pnl',label:'P&L marked Final',tab:'outlet-pnl',done:isPnlFinal(sid,fy,mi),detail:''},
  ];
  return steps;
}
const MC_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
function prevMonthCal(){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);return{year:d.getFullYear(),month:d.getMonth()};}
function MonthPicker({cal,setCal}){
  const h=React.createElement;
  const shift=k=>{const d=new Date(cal.year,cal.month+k,1);setCal({year:d.getFullYear(),month:d.getMonth()});};
  return h('div',{className:'fd-date'},h('button',{onClick:()=>shift(-1)},'‹'),h('span',{className:'lbl'},MC_MONTHS[cal.month].slice(0,3)+' '+cal.year),h('button',{onClick:()=>shift(1)},'›'));
}
function MonthCloseChecklist({salon,period,onNavTab}={}){
  const h=React.createElement;
  const init=periodToCalendar(period);
  const [cal,setCal]=useState(init||prevMonthCal());
  useEffect(()=>{const c=periodToCalendar(period);if(c)setCal(c);
    // eslint-disable-next-line
  },[period&&period.mi,period&&period.fy]);
  const sid=salon?.id;
  const steps=monthCloseStepsFor(sid,cal.year,cal.month);
  const done=steps.filter(s=>s.done).length;
  const pct=Math.round(done/steps.length*100);
  return h('div',null,
    h('div',{className:'section-header'},
      h('div',null,h('div',{className:'page-title'},'Month-End Close'),
        h('div',{className:'page-sub'},'Each step ticks itself from the data — work top to bottom; the P&L is marked Final last')),
      h('div',{style:{display:'flex',gap:8,alignItems:'center'}},h(MonthPicker,{cal,setCal}),
        h('button',{className:'btn btn-ghost btn-sm',onClick:async e=>{const b=e.currentTarget;b.disabled=true;const t=b.textContent;b.textContent='Building…';try{await buildAuditPack(salon,cal.year,cal.month);}catch(err){window.alert('Could not build the audit pack: '+(err.message||err));}b.disabled=false;b.textContent=t;}},'📦 Audit pack (ZIP)'),
        h('button',{className:'btn btn-ghost btn-sm',onClick:async e=>{const b=e.currentTarget;b.disabled=true;const t=b.textContent;b.textContent='Building…';try{await buildYearEndPack(salon,calToFYMI(cal.year,cal.month).fy);}catch(err){window.alert('Could not build the year-end pack: '+(err.message||err));}b.disabled=false;b.textContent=t;}},'📦 Year-end pack (FY)'))),
    h('div',{className:'card',style:{marginBottom:14}},
      h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:6}},h('b',null,MC_MONTHS[cal.month]+' '+cal.year),h('span',null,done+' of '+steps.length+' done')),
      h('div',{style:{height:8,background:'var(--bg3)',borderRadius:6,overflow:'hidden'}},h('div',{style:{width:pct+'%',height:'100%',background:pct===100?'var(--green)':'var(--accent)'}}))),
    h('div',{className:'card',style:{padding:0}},
      steps.map((s,i)=>h('div',{key:s.key,style:{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',borderBottom:i<steps.length-1?'1px solid var(--border)':'none'}},
        h('div',{style:{width:26,height:26,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,flexShrink:0,
          background:s.done?'rgba(76,175,125,0.15)':'var(--bg3)',color:s.done?'var(--green)':'var(--text3)'}},s.done?'✓':String(i+1)),
        h('div',{style:{flex:1}},h('div',{style:{fontSize:13.5,fontWeight:600,color:s.done?'var(--text)':'var(--text)'}},s.label),
          s.detail&&h('div',{style:{fontSize:11.5,color:s.done?'var(--text3)':'var(--orange)'}},s.detail)),
        !s.done&&onNavTab&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>onNavTab(s.tab)},'Open →')))),
    h(FullCloseChecklist,{sid,cal,steps,onNavTab}));
}
function MonthCloseBoard({accessibleSalons,onOpenOutletTab}){
  const h=React.createElement;
  const [cal,setCal]=useState(prevMonthCal());
  const outlets=(accessibleSalons||[]).filter(s=>s&&s.id!=null);
  const data=outlets.map(s=>({s,steps:monthCloseStepsFor(s.id,cal.year,cal.month)}));
  const keys=[];const labels={};
  data.forEach(d=>d.steps.forEach(st=>{if(!labels[st.key]){keys.push(st.key);labels[st.key]=st.label;}}));
  const short={'sales':'Daily Sales','dse-final':'DSR Final','att-final':'Attendance Final','salary':'Salary','incentive':'Incentive','cradle':'CRADLE','coll-diff':'Coll. diffs','bank':'Bank','pnl':'P&L Final'};
  return h('div',null,
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}},
      h('div',null,h('div',{className:'page-title'},'Month-End Close'),h('div',{className:'page-sub'},'Where every outlet stands on closing the month — click a red step to open it')),
      h(MonthPicker,{cal,setCal})),
    h('div',{className:'card',style:{padding:0}},h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,h('th',null,'Outlet'),...keys.map(k=>h('th',{key:k,style:{textAlign:'center',whiteSpace:'nowrap'}},short[k]||labels[k])),h('th',{style:{textAlign:'right'}},'Done'))),
      h('tbody',null,data.length===0?h('tr',null,h('td',{colSpan:keys.length+2,style:{textAlign:'center',padding:24,color:'var(--text3)'}},'No outlets')):
        data.map(({s,steps})=>{const done=steps.filter(x=>x.done).length;
          return h('tr',{key:s.id},h('td',{style:{whiteSpace:'nowrap',fontWeight:600}},(isRestaurantOutlet(s.id)?'🍽 ':'')+s.name),
            ...keys.map(k=>{const st=steps.find(x=>x.key===k);
              return h('td',{key:k,style:{textAlign:'center'}},!st?h('span',{style:{color:'var(--text3)'}},'—'):
                h('button',{type:'button',title:st.label+(st.detail?' — '+st.detail:''),disabled:st.done||!onOpenOutletTab,
                  onClick:()=>onOpenOutletTab&&onOpenOutletTab(s,st.tab),
                  style:{border:'none',background:st.done?'rgba(76,175,125,0.15)':'rgba(224,82,82,0.12)',color:st.done?'var(--green)':'var(--red)',
                    borderRadius:12,padding:'2px 10px',fontWeight:700,cursor:st.done?'default':'pointer'}},st.done?'✓':'✗'));}),
            h('td',{style:{textAlign:'right',fontWeight:700,color:done===steps.length?'var(--green)':'var(--text2)'}},done+'/'+steps.length));}))))));
}

// ── Advance limit (per outlet, Master Sheet → Controls) — an employee's advances outstanding,
// plus the new one, shouldn't exceed X% of their monthly gross salary. "Block" stops the entry;
// otherwise the person is warned and can go ahead. Blank % = no limit. ──
function advanceLimitMessage(sid,empName,newAmount,excludeId){
  const s=outletSettings(sid);
  const pct=Number(s.advMaxPct);
  if(!s.advMaxPct||!(pct>0))return'';
  const now=new Date();
  const emp=(getEmployeesForMonth(now.getFullYear(),now.getMonth(),sid)||[]).find(e=>e.name===empName);
  const gross=emp?Number(emp.gross)||0:0;
  if(!gross)return'';
  let list=[];try{list=JSON.parse(cachedLocalGet(outletKey('salonos_advances',sid))||'[]')||[];}catch(e){}
  const out=list.filter(a=>a&&a.emp===empName&&a.id!==excludeId&&(a.status==='Active'||a.status==='Pending Approval')).reduce((t,a)=>t+(Number(a.outstanding)||0),0);
  const cap=Math.round(gross*pct/100),total=out+(Number(newAmount)||0);
  if(total<=cap)return'';
  const r=n=>'₹'+Math.round(n).toLocaleString('en-IN');
  return empName+': advances would total '+r(total)+' ('+r(out)+' already outstanding + '+r(newAmount)+' new) — above the outlet limit of '+pct+'% of monthly gross ('+r(cap)+').';
}
// true = go ahead. Blocks (alert) or warns (confirm) per the outlet's setting.
function advanceLimitGate(sid,empName,newAmount,excludeId){
  const msg=advanceLimitMessage(sid,empName,newAmount,excludeId);
  if(!msg)return true;
  if(outletSettings(sid).advBlock){window.alert(msg+'\n\nThis outlet blocks advances above the limit.');return false;}
  return window.confirm(msg+'\n\nGo ahead anyway?');
}

// ── Due snapshot for the nightly reminders — the unpaid statutory / salary / incentive / licence
// dues of each outlet (vendor bills are checked by the server itself), saved when an owner or admin
// opens the app, so the 9 PM check can remind by email / WhatsApp. Written only when it changed
// (or once a day, so the server knows it's current). ──
function writeDueSnapshots(salons){
  (salons||[]).forEach(s=>{
    try{
      const sid=s.id;
      const items=allDueItemsFor(sid).filter(d=>d&&!d.paid&&d.status!=='done'&&d.due&&!/vendor/i.test(String(d.type||'')))
        .map(d=>({id:String(d.id),type:d.type,desc:d.desc||'',due:d.due,amount:Math.round(Number(d.amount)||0)}));
      const key=outletKey('salonos_due_snapshot',sid);
      let prev=null;try{prev=JSON.parse(cachedLocalGet(key)||'null');}catch(e){}
      const today=localIsoOf(new Date());
      if(prev&&JSON.stringify(prev.items)===JSON.stringify(items)&&String(prev.at||'').slice(0,10)===today)return;
      safeLocalSet(key,JSON.stringify({at:new Date().toISOString(),items}));
    }catch(e){}
  });
}

// ── Bank statement learning — a narration's "signature" (lower-case words, digits / reference
// numbers dropped), so a new bank line with no matching rule gets the Nature you gave earlier
// lines with the same signature. Only used when every earlier line with that signature has the
// same Nature, and only for the same side (credit / debit). ──
function bankNarrationSig(desc){
  return String(desc||'').toLowerCase().replace(/[0-9]+/g,' ').replace(/[^a-z]+/g,' ').trim().split(/\s+/).filter(w=>w.length>2).slice(0,5).join(' ');
}
function bankLearnedNatures(rows){
  const seen={};
  (rows||[]).forEach(r=>{
    if(!r||!r.nature)return;
    const sig=bankNarrationSig(r.description);if(sig.length<6)return;
    const k=(Number(r.credit)>0?'C|':'D|')+sig;
    if(seen[k]===undefined)seen[k]=r.nature;else if(seen[k]!==r.nature)seen[k]=null; // conflicting → don't guess
  });
  return seen;
}
function bankLearnedNatureFor(learned,r){
  const sig=bankNarrationSig(r&&r.description);if(sig.length<6)return null;
  return learned[(Number(r.credit)>0?'C|':'D|')+sig]||null;
}

// ── Full month-end checklist (the nine phases of the Month-End Closing Checklist document) ──
// Items the app can verify tick themselves from monthCloseStepsFor (auto:'<step key>'); the rest
// are ticked by hand, each recording who ticked it and when (kv salonos_close_checklist_outlet_<id>:
// {'YYYY-MM': {itemId: {by, at}}}). Read-only once the month's P&L is Final.
const CLOSE_CHECKLIST=[
  {phase:'1 · Daily discipline',items:[
    {id:'d-sales',text:'Daily Sales & Exp filled for every day of the month',auto:'sales',tab:'daily-sales'},
    {id:'d-cashcount',text:'Physical Cash Count entered daily; differences over the limit explained',tab:'daily-sales'},
    {id:'d-deposits',text:'Cash Packet, Cash Handover and Bank Deposit entered the day they happened',tab:'daily-sales'},
    {id:'d-att',text:'Attendance marked every day for every employee',tab:'attendance'},
    {id:'d-adv',text:'Cash advances, commissions, tips and overtime entered',tab:'daily-sales'},
    {id:'d-bills',text:'Vendor bills booked in the week received',tab:'vendors'},
    {id:'d-alerts',text:'Bell alerts for the month cleared'}]},
  {phase:'2 · Sales and collection close',items:[
    {id:'s-cradle',text:'CRADLE collection report imported for the full month',auto:'cradle',tab:'collection-sheet'},
    {id:'s-settle',text:'Card and UPI settlements matched to the bank in Collection Reco',tab:'collection-sheet'},
    {id:'s-diff',text:'Collection Comparison: every flagged day has a reason',auto:'coll-diff',tab:'outlet-pnl'},
    {id:'s-outst',text:'Outstanding Sale / Recovery agree with the customer list',tab:'daily-sales'},
    {id:'s-source',text:'Revenue source for the month chosen (Collection Reco or Daily Sales)',tab:'outlet-pnl'},
    {id:'s-apps',text:'Restaurant: Swiggy / Zomato / EazyDiner payouts entered and checked',tab:'aggregators'},
    {id:'s-final',text:'Daily Sales & Exp marked Month Final',auto:'dse-final',tab:'daily-sales'}]},
  {phase:'3 · Bank and cash reconciliation',items:[
    {id:'b-import',text:'Bank statement imported for the full month',auto:'bank',tab:'bank-statement'},
    {id:'b-nature',text:'Every bank line has a Nature',tab:'bank-statement'},
    {id:'b-reco1',text:'Bank Reco: lines not recorded in SalonOS cleared',tab:'outlet-pnl'},
    {id:'b-reco2',text:'Bank Reco: payments not found in the bank explained',tab:'outlet-pnl'},
    {id:'b-deposit',text:'Bank deposits in Daily Sales match the bank credits',tab:'daily-sales'},
    {id:'b-cash',text:'Month-end cash counted = book Closing Cash Balance (or explained)',tab:'daily-sales'},
    {id:'b-charges',text:'Bank charges and interest booked',tab:'bank-statement'}]},
  {phase:'4 · Payables and expenses',items:[
    {id:'p-bills',text:'All vendor bills of the month booked with GST split',tab:'vendors'},
    {id:'p-approve',text:'Bills above the approval limit approved',tab:'vendors'},
    {id:'p-recurring',text:'Rent and fixed costs billed or estimated, not both',tab:'recurring-expenses'},
    {id:'p-variable',text:'Electricity / water and other variable bills booked',tab:'recurring-expenses'},
    {id:'p-stock',text:'Purchases booked and stock counted (restaurants: closing value in Food Cost)',tab:'inventory'},
    {id:'p-payments',text:'Vendor payments recorded with mode and reference; no duplicates',tab:'vendors'},
    {id:'p-tds',text:'TDS deducted on rent, professional and contract bills',tab:'vendors'},
    {id:'p-assets',text:'New fixed assets added to the Fixed Asset Register',tab:'fixed-assets'}]},
  {phase:'5 · Payroll close',items:[
    {id:'y-att',text:'Attendance marked Month Final',auto:'att-final',tab:'attendance'},
    {id:'y-plan',text:'Monthly Incentive Plan approved by Owner / ASM',plan:true,tab:'incentive-working'},
    {id:'y-salary',text:'Salary Working checked and all rows approved',auto:'salary',tab:'salary-working'},
    {id:'y-reviews',text:'Salary and incentive summaries reviewed by Manager, Owner and ASM',tab:'salary-working'},
    {id:'y-staffrep',text:'CRADLE Staff Work report imported for incentive',tab:'incentive-working'},
    {id:'y-inc',text:'Incentive Working approved',auto:'incentive',tab:'incentive-working'},
    {id:'y-pay',text:'Salary and incentive paid (bank file / cash entries) by the due day',tab:'bank-payment'},
    {id:'y-slips',text:'Payslips sent',tab:'salary-working'},
    {id:'y-exit',text:'Exit checklist complete for staff who left',tab:'master-salary'}]},
  {phase:'6 · Statutory and tax',items:[
    {id:'t-tds',text:'TDS paid by the 7th',tab:'due-dates'},
    {id:'t-gstr1',text:'GSTR-1 filed by the 11th',tab:'outlet-pnl'},
    {id:'t-pf',text:'PF ECR uploaded and challan paid by the 15th',tab:'salary-working'},
    {id:'t-esic',text:'ESIC contribution uploaded and paid by the 15th',tab:'salary-working'},
    {id:'t-gstr3b',text:'GSTR-3B filed and GST paid by the 20th',tab:'outlet-pnl'},
    {id:'t-pt',text:'Professional Tax paid by the state due day',tab:'due-dates'},
    {id:'t-marked',text:'Each challan marked paid in Due Dates with reference',tab:'due-dates'}]},
  {phase:'7 · Monthly P&L review',items:[
    {id:'l-revenue',text:'Revenue lines tie to Collection Reco / Daily Sales (÷ 1.05)',tab:'outlet-pnl'},
    {id:'l-other',text:'Other Income entered with a note',tab:'outlet-pnl'},
    {id:'l-direct',text:'Direct cost agrees with Vendors and Daily Sales',tab:'outlet-pnl'},
    {id:'l-emp',text:'Employee cost matches Salary and Incentive Working',tab:'outlet-pnl'},
    {id:'l-opex',text:'Each operating expense annexure reviewed; nothing counted twice',tab:'outlet-pnl'},
    {id:'l-dep',text:'Depreciation and interest entered',tab:'outlet-pnl'},
    {id:'l-variance',text:'Movements over 10% vs last month and budget explained',tab:'outlet-pnl'}]},
  {phase:'8 · Cash flow',items:[
    {id:'c-statement',text:'Cash Flow reviewed: PBT, depreciation, payables, receivables, advances',tab:'outlet-pnl'},
    {id:'c-investing',text:'Investing and financing (assets, owner money, loans) entered',tab:'outlet-pnl'},
    {id:'c-closing',text:'Closing cash + bank agrees with cash count and bank statement',tab:'outlet-pnl'},
    {id:'c-forecast',text:'30-day forecast reviewed; any shortfall planned for',tab:'outlet-pnl'}]},
  {phase:'9 · Sign-off and reporting',items:[
    {id:'f-pnl',text:'P&L marked Final (locks the month)',auto:'pnl',tab:'outlet-pnl'},
    {id:'f-tally',text:'Vouchers synced to Tally; rejections fixed',tab:'tally-export'},
    {id:'f-pack',text:'Audit pack downloaded and filed'},
    {id:'f-email',text:'Final P&L sent to the owner'},
    {id:'f-next',text:'Next month set up: incentive plan, sales target, budget',tab:'incentive-working'},
    {id:'f-backup',text:'Backup file downloaded and kept outside SalonOS'}]}];
function loadCloseTicks(sid){try{return JSON.parse(cachedLocalGet(outletKey('salonos_close_checklist',sid))||'{}')||{};}catch(e){return{};}}
function closeChecklistStatus(sid,year,month,steps){
  const ym=year+'-'+String(month+1).padStart(2,'0');const ticks=loadCloseTicks(sid)[ym]||{};
  const rest=isRestaurantOutlet(sid);
  const byKey={};(steps||monthCloseStepsFor(sid,year,month)).forEach(s=>{byKey[s.key]=s;});
  const plan=typeof approvedIncPlanFor==='function'?approvedIncPlanFor(sid,year,month):null;
  const skip=it=>(it.id==='s-apps'&&!rest)||(rest&&['s-cradle','s-diff','y-inc','y-staffrep','y-plan'].includes(it.id));
  return CLOSE_CHECKLIST.map(P=>({phase:P.phase,items:P.items.filter(it=>!skip(it)).map(it=>{
    const st=it.auto?byKey[it.auto]:null;
    const isAuto=!!(it.auto||it.plan);
    const t=ticks[it.id];
    return{...it,isAuto,done:isAuto?(it.plan?!!plan:!!(st&&st.done)):!!t,by:t&&t.by,at:t&&t.at,detail:st&&st.detail};
  })}));
}
function FullCloseChecklist({sid,cal,steps,onNavTab}){
  const h=React.createElement;
  const [tick,setTick]=useState(0);
  const {fy,mi}=calToFYMI(cal.year,cal.month);
  const locked=isPnlFinal(sid,fy,mi);
  const ym=cal.year+'-'+String(cal.month+1).padStart(2,'0');
  const phases=closeChecklistStatus(sid,cal.year,cal.month,steps);
  const all=phases.flatMap(p=>p.items),done=all.filter(i=>i.done).length;
  const toggle=(it,v)=>{
    if(locked||it.isAuto)return;
    const m=loadCloseTicks(sid);const cur={...(m[ym]||{})};
    if(v){const u=currentSessionUser();cur[it.id]={by:(u&&u.name)||'',at:new Date().toISOString()};}else delete cur[it.id];
    m[ym]=cur;safeLocalSet(outletKey('salonos_close_checklist',sid),JSON.stringify(m));setTick(x=>x+1);
  };
  const exportX=async()=>{try{await afDownloadXlsx('Month-end checklist',[['Phase','Item','Done','Ticked by','When','How checked'],...phases.flatMap(p=>p.items.map(i=>[p.phase,i.text,i.done?'Yes':'No',i.by||'',i.at?new Date(i.at).toLocaleString('en-IN'):'',i.isAuto?'Automatic':'Manual']))],'Month_End_Checklist_'+String(outletSettings(sid).name||'Outlet').split('—')[0].trim().replace(/[^A-Za-z0-9]+/g,'_')+'_'+ym+'.xlsx');}catch(e){window.alert(e.message||String(e));}};
  return h('div',{className:'card',style:{marginTop:16,padding:0}},
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 16px',borderBottom:'1px solid var(--border)',flexWrap:'wrap',gap:8}},
      h('div',null,h('div',{className:'card-title',style:{margin:0}},'Full month-end checklist'),
        h('div',{style:{fontSize:12,color:'var(--text3)'}},done+' of '+all.length+' done · ⚙ = ticks itself from the data'+(locked?' · P&L is Final — read-only':''))),
      h('button',{className:'btn btn-ghost btn-sm',onClick:exportX},'⬇ Excel')),
    phases.map(p=>{const pd=p.items.filter(i=>i.done).length;
      return h('details',{key:p.phase,open:pd<p.items.length,style:{borderBottom:'1px solid var(--border)'}},
        h('summary',{style:{cursor:'pointer',padding:'10px 16px',fontWeight:600,fontSize:13}},
          p.phase,h('span',{style:{float:'right',fontWeight:500,color:pd===p.items.length?'var(--green)':'var(--text3)'}},pd+'/'+p.items.length)),
        p.items.map(it=>h('div',{key:it.id,style:{display:'flex',alignItems:'center',gap:10,padding:'6px 16px 6px 28px',fontSize:12.5}},
          h('input',{type:'checkbox',checked:!!it.done,disabled:locked||it.isAuto,title:it.isAuto?'Ticks itself from the data':'',onChange:e=>toggle(it,e.target.checked)}),
          h('span',{style:{flex:1,color:it.done?'var(--text3)':'var(--text)'}},(it.isAuto?'⚙ ':'')+it.text,
            it.detail&&!it.done?h('span',{style:{color:'var(--orange)',marginLeft:6}},'— '+it.detail):null),
          it.by?h('span',{style:{fontSize:11,color:'var(--text3)',whiteSpace:'nowrap'}},it.by+' · '+new Date(it.at).toLocaleDateString('en-IN')):null,
          !it.done&&it.tab&&onNavTab?h('button',{className:'btn btn-ghost btn-sm',style:{padding:'2px 8px'},onClick:()=>onNavTab(it.tab)},'Open →'):null)));}));
}
