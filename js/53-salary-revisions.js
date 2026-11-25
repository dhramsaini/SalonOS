// ═════════════════════════════════════════════════════════════════════════════════════════════
// Pay changes with an "effective from" month (Controls → salaryRevisions) and arrears for
// back-dated changes (Controls → salaryArrears).
//   • employee.payHistory = [{from:'YYYY-MM'|null, basic, hra, conv, special, gross, at, by, reason}]
//     — from:null is the pay before the first recorded change. The pay for a month is the entry
//     with the latest `from` on or before that month (getEmployeesForMonth applies it).
//   • Locked months never change: a back-dated change starts at the first month that isn't locked,
//     and each locked month in between gets an arrears line paid in that first open month:
//     (new gross − old gross) ÷ days in that month × payable days of that month.
//   • employee.arrears = [{forYm, payYm, amount, at, by}] — Salary Working adds it to net pay.
//   • The master record's own pay always shows this month's pay; a scheduled change is applied to
//     it by itself when its month comes (salApplyDue on start-up).
// ═════════════════════════════════════════════════════════════════════════════════════════════
const SAL_PAY_FIELDS=['basic','hra','conv','special','gross'];
const SAL_MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
function salYm(y,m){return y+'-'+String(m+1).padStart(2,'0');}
function salYmParts(ym){const p=String(ym).split('-');return{y:Number(p[0]),m:Number(p[1])-1};}
function salYmLabel(ym){if(!ym)return'before';const p=salYmParts(ym);return SAL_MON[p.m].slice(0,3)+' '+p.y;}
function salYmAdd(ym,n){const p=salYmParts(ym);const d=new Date(p.y,p.m+n,1);return salYm(d.getFullYear(),d.getMonth());}
function salNowYm(){const d=new Date();return salYm(d.getFullYear(),d.getMonth());}
function salRevOn(sid){return typeof controlOn!=='function'||controlOn('salaryRevisions',sid);}
function salArrOn(sid){return typeof controlOn!=='function'||controlOn('salaryArrears',sid);}
function salM(n){return '₹'+Math.round(Number(n)||0).toLocaleString('en-IN');}
// Every Master Salary detail is kept month-wise, except identity details, documents, contact details and
// the joining / leaving dates and status — those are corrections that apply to every month.
const SAL_HIST_SKIP=new Set(['id','name','fatherName','mobile','email','address','pan','aadhar','panFile','aadharFile','bankProofFile','photo','doj','dol','status','pt','payHistory','arrears','payFrom','createdAt','updatedAt']);
const SAL_FIELD_LABEL={billingId:'Billing ID',desig:'Designation',dept:'Department',weeklyOff:'Weekly off',basic:'Basic',hra:'HRA',conv:'Conveyance',special:'Special allowance',gross:'Gross (monthly salary)',
  pf:'PF applies',pfOnActualBasic:'PF on actual basic',pfNumber:'UAN',esic:'ESIC applies',esicNumber:'ESIC number',tds:'TDS applies',bankName:'Bank',accountNo:'Account no.',ifsc:'IFSC',accountHolder:'Account holder'};
function salSnap(e){const o={};Object.keys(e||{}).forEach(k=>{if(!SAL_HIST_SKIP.has(k)&&typeof e[k]!=='function')o[k]=e[k];});return o;}
function salNormV(k,v){if(SAL_PAY_FIELDS.includes(k))return String(Math.round(Number(v)||0));if(typeof v==='boolean')return v?'1':'';return String(v==null?'':v).trim();}
function salChangedFields(prev,emp){if(!prev)return[];const keys=new Set([...Object.keys(salSnap(prev)),...Object.keys(salSnap(emp))]);return[...keys].filter(k=>salNormV(k,prev[k])!==salNormV(k,emp[k]));}
function salShowV(k,v){if(SAL_PAY_FIELDS.includes(k))return salM(v);if(typeof v==='boolean')return v?'Yes':'No';return v===''||v==null?'—':String(v);}
function salPayOf(e){const o={};SAL_PAY_FIELDS.forEach(k=>{o[k]=Number(e[k])||0;});return o;}
function salPickEntry(hist,ym){let pick=null;(hist||[]).forEach(r=>{if(r&&(r.from==null||r.from<=ym)){if(!pick||String(r.from||'')>=String(pick.from||''))pick=r;}});return pick;}
// The employee as paid in that month (used by getEmployeesForMonth).
function salPayFor(e,y,m,sid){
  if(!e||!Array.isArray(e.payHistory)||!e.payHistory.length||!salRevOn(sid))return e;
  const r=salPickEntry(e.payHistory,salYm(y,m));if(!r)return e;
  const o={...e};if(r.vals)Object.keys(r.vals).forEach(k=>{if(!SAL_HIST_SKIP.has(k))o[k]=r.vals[k];});SAL_PAY_FIELDS.forEach(k=>{if(r[k]!==undefined)o[k]=Number(r[k])||0;});o.payFrom=r.from;return o;
}
// Arrears paid in this month (Salary Working adds them to net pay).
function salArrearsFor(sid,e,y,m){if(!e||!Array.isArray(e.arrears)||!salArrOn(sid))return 0;const ym=salYm(y,m);return Math.round(e.arrears.filter(a=>a&&a.payYm===ym).reduce((s,a)=>s+(Number(a.amount)||0),0));}
function salArrearsLines(e,y,m){const ym=salYm(y,m);return(e&&Array.isArray(e.arrears)?e.arrears:[]).filter(a=>a&&a.payYm===ym);}
function salPayChanged(prev,emp){return!!prev&&SAL_PAY_FIELDS.some(k=>Math.round(Number(prev[k])||0)!==Math.round(Number(emp[k])||0));}
function salRevNeeded(sid,prev,emp){if(!salRevOn(sid))return false;const f=salChangedFields(prev,emp);
  // Only Gross CTC moved (an employer PF / ESIC share added or updated) while the salary paid is the same → not a pay change.
  if(f.length===1&&f[0]==='gross'&&typeof payGrossFor==='function'&&payGrossFor(prev,sid)===payGrossFor(emp,sid))return false;
  return f.length>0;}
function salLocked(sid,ym){const p=salYmParts(ym);return(typeof isMonthLockedFor==='function'&&isMonthLockedFor(sid,p.y,p.m))||!!(typeof ffBlock==='function'&&ffBlock(sid,ym,'pay'));}
// First month (from the joining month, at most 36 months back) that isn't locked.
function salFirstOpen(sid,e){const now=salNowYm();let ym=e&&e.doj?String(e.doj).slice(0,7):salYmAdd(now,-36);if(ym<salYmAdd(now,-36))ym=salYmAdd(now,-36);while(ym<now&&salLocked(sid,ym))ym=salYmAdd(ym,1);return ym;}
// What a change from `fromYm` does: which month it really starts, and the arrears for locked months.
function salPlan(sid,prev,emp,fromYm){
  let start=fromYm;const locked=[];while(salLocked(sid,start)){locked.push(start);start=salYmAdd(start,1);}
  const arrears=[];
  if(salArrOn(sid)&&salPayChanged(prev,emp))locked.forEach(ym=>{const p=salYmParts(ym);const old=salPayFor(prev,p.y,p.m,sid);const dim=new Date(p.y,p.m+1,0).getDate();
    let days=dim;try{const w=(swWorkingsFor(sid,p.y,p.m)||[]).find(x=>String(x.id)===String(prev.id));if(w)days=Number(w.totalDays)||0;}catch(e){}
    const ng=payGrossFor(emp,sid),og=payGrossFor(old,sid);const amt=Math.round((ng-og)/dim*days);if(amt)arrears.push({forYm:ym,payYm:start,amount:amt,days,dim,oldGross:og,newGross:ng});});
  return{start,locked,arrears};
}
// The record to save: history + arrears added, and the master's own pay = this month's pay.
function salApplyChange(sid,prev,emp,fromYm,reason){
  const plan=salPlan(sid,prev,emp,fromYm);const who=(typeof currentSessionUser==='function'&&(currentSessionUser()||{}).name)||'';const at=new Date().toISOString();
  // Entries recorded before details were kept month-wise get the details as they were before this change.
  let hist=Array.isArray(prev.payHistory)&&prev.payHistory.length?prev.payHistory.map(r=>r.vals?r:{...r,vals:salSnap(prev)}):[{from:null,...salPayOf(prev),vals:salSnap(prev),at:prev.createdAt||null,by:'',reason:'Before the first recorded change'}];
  const changed=salChangedFields(prev,emp);
  hist=hist.filter(r=>r.from!==plan.start);hist.push({from:plan.start,...salPayOf(emp),vals:salSnap(emp),changed,at,by:who,reason:reason||''});hist.sort((a,b)=>String(a.from||'').localeCompare(String(b.from||'')));
  const arrears=[...(Array.isArray(prev.arrears)?prev.arrears.filter(a=>!plan.arrears.some(n=>n.forYm===a.forYm&&n.payYm===a.payYm)):[]),...plan.arrears.map(a=>({...a,at,by:who}))];
  const rec={...emp,payHistory:hist,arrears};const now=salNowYm();const cur=salPickEntry(hist,now);
  if(cur){if(cur.vals)Object.keys(cur.vals).forEach(k=>{if(!SAL_HIST_SKIP.has(k))rec[k]=cur.vals[k];});SAL_PAY_FIELDS.forEach(k=>{rec[k]=Number(cur[k])||0;});}
  return{rec,plan};
}
// Brings the master's own pay up to this month (a scheduled change whose month has come).
function salApplyDue(sid){
  try{if(!salRevOn(sid))return 0;const L=loadEmployees(sid)||[];const now=salNowYm();let n=0;
    const next=L.map(e=>{if(!Array.isArray(e.payHistory)||!e.payHistory.length)return e;const r=salPickEntry(e.payHistory,now);if(!r)return e;
      const want={...e,...(r.vals||{}),...salPayOf(r)};if(!salChangedFields(e,want).length)return e;n++;const o={...e};if(r.vals)Object.keys(r.vals).forEach(k=>{if(!SAL_HIST_SKIP.has(k))o[k]=r.vals[k];});SAL_PAY_FIELDS.forEach(k=>{o[k]=Number(r[k])||0;});return o;});
    if(n){saveEmployees(next,sid);try{logAuditEvent(sid,{entity:'Employee',entityId:'pay',action:'Scheduled Master Salary change applied',summary:n+' employee(s) — from '+salYmLabel(now)});}catch(e){}}
    return n;}catch(e){return 0;}
}
setTimeout(()=>{try{(typeof SALONS!=='undefined'?SALONS:[]).forEach(s=>{if(!s||s.id==null)return;salApplyDue(s.id);if(typeof advRepairOutstanding==='function')advRepairOutstanding(s.id);if(typeof repairCollectionTotals==='function')repairCollectionTotals(s.id);});}catch(e){}},5000);

// ── “Takes effect from” window, shown when pay is changed in Master Salary ──
function SalRevModal({sid,prev,emp,onDone}){
  const h=React.createElement;const now=salNowYm();
  const [mode,setMode]=useState('from');const [from,setFrom]=useState(salYmAdd(now,1));const [reason,setReason]=useState('');
  const fromYm=mode==='fix'?salFirstOpen(sid,prev):(from||now);
  const plan=salPlan(sid,prev,emp,fromYm);const old=salPayOf(prev),nw=salPayOf(emp);const arrTot=plan.arrears.reduce((s,a)=>s+a.amount,0);
  const changed=salChangedFields(prev,emp);const payCh=salPayChanged(prev,emp);const what=payCh?'pay':'details';
  const row=(l,a,b)=>h('tr',{key:l},h('td',{style:{fontSize:12.5,padding:'3px 8px'}},l),h('td',{style:{textAlign:'right',padding:'3px 8px'}},salM(a)),h('td',{style:{textAlign:'right',padding:'3px 8px',fontWeight:a!==b?700:400,color:a!==b?'var(--accent)':undefined}},salM(b)));
  const save=()=>{if(mode==='from'&&!/^\d{4}-\d{2}$/.test(from)){window.alert('Pick the month the change takes effect from.');return;}onDone(salApplyChange(sid,prev,emp,fromYm,reason.trim()));};
  return h('div',{className:'modal-overlay',onClick:()=>onDone(null)},h('div',{className:'modal',style:{width:560,maxWidth:'96vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'Change in Master Salary — '+(emp.name||'')),
    h('table',{style:{width:'100%',marginBottom:10}},h('thead',null,h('tr',null,h('th',null,'Changed'),h('th',{style:{textAlign:'right'}},'Now'),h('th',{style:{textAlign:'right'}},'New'))),
      h('tbody',null,(payCh?[...SAL_PAY_FIELDS,...changed.filter(k=>!SAL_PAY_FIELDS.includes(k))]:changed).map(k=>h('tr',{key:k},h('td',{style:{fontSize:12.5,padding:'3px 8px'}},SAL_FIELD_LABEL[k]||k),
        h('td',{style:{textAlign:'right',padding:'3px 8px'}},salShowV(k,prev[k])),h('td',{style:{textAlign:'right',padding:'3px 8px',fontWeight:changed.includes(k)?700:400,color:changed.includes(k)?'var(--accent)':undefined}},salShowV(k,emp[k])))))),
    h('label',{style:{display:'flex',gap:8,alignItems:'center',fontSize:13,marginBottom:6,fontWeight:600}},h('input',{type:'radio',checked:mode==='from',onChange:()=>setMode('from')}),'With effect from',
      h('input',{type:'month',className:'form-control',style:{width:'auto',padding:'3px 6px'},value:from,disabled:mode!=='from',onChange:e=>setFrom(e.target.value)})),
    h('label',{style:{display:'flex',gap:8,alignItems:'center',fontSize:13,marginBottom:10}},h('input',{type:'radio',checked:mode==='fix',onChange:()=>setMode('fix')}),'It was a typing mistake — correct it for every month that isn’t locked'),
    h('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'8px 12px',fontSize:12.5,lineHeight:1.6,marginBottom:10}},
      fromYm>now?h('div',null,'📅 Scheduled — the present '+what+' stay'+(payCh?'s':'')+' until '+salYmLabel(salYmAdd(fromYm,-1))+'; the new '+what+' from '+salYmLabel(fromYm)+'. It is applied by itself when that month comes.')
        :h('div',null,'New '+what+' from '+salYmLabel(plan.start)+' onwards'+(plan.start<now?' (months not locked are worked out again)':'')+'.'),
      plan.locked.length>0&&h('div',null,'🔒 Locked month'+(plan.locked.length>1?'s':'')+' '+plan.locked.map(salYmLabel).join(', ')+' keep'+(plan.locked.length>1?'':'s')+' the old '+what+'.'),
      plan.locked.length>0&&payCh&&(salArrOn(sid)
        ?h('div',null,plan.arrears.length?('💰 Arrears '+salM(arrTot)+' added to '+salYmLabel(plan.start)+' salary: '+plan.arrears.map(a=>salYmLabel(a.forYm)+' '+salM(a.amount)+' ('+a.days+'/'+a.dim+' days)').join(', ')):'No arrears (no payable days in those months).')
        :h('div',{style:{color:'var(--text3)'}},'Arrears are switched off (Controls → Arrears for back-dated pay changes) — pay the difference separately if due.'))),
    h('div',{className:'form-group'},h('label',null,'Reason (optional — goes to the pay history)'),h('input',{className:'form-control',value:reason,onChange:e=>setReason(e.target.value),placeholder:'e.g. Annual increment'})),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:()=>onDone(null)},'Cancel'),h('button',{className:'btn btn-primary',onClick:save},'Save change'))));
}
function salRevAsk(sid,prev,emp){return new Promise(res=>{const el=document.createElement('div');document.body.appendChild(el);const root=ReactDOM.createRoot(el);
  root.render(React.createElement(SalRevModal,{sid,prev,emp,onDone:r=>{root.unmount();el.remove();res(r);}}));});}

// ── Pay history in the Master Salary view window ──
function SalPayHistory({sid,emp,onChange}){
  const h=React.createElement;const hist=(emp&&Array.isArray(emp.payHistory)?emp.payHistory:[]).slice().sort((a,b)=>String(b.from||'').localeCompare(String(a.from||'')));const arr=(emp&&Array.isArray(emp.arrears)?emp.arrears:[]).slice().reverse();
  if(!salRevOn(sid)||(!hist.length&&!arr.length))return null;const now=salNowYm();const cur=salPickEntry(hist,now);
  const removeRev=r=>{if(!window.confirm('Remove the scheduled pay change from '+salYmLabel(r.from)+' ('+salM(r.gross)+')?'))return;const H=emp.payHistory.filter(x=>x!==r);onChange({...emp,payHistory:H});
    try{logAuditEvent(sid,{entity:'Employee',entityId:emp.id,action:'Scheduled pay change removed',summary:emp.name+': '+salM(r.gross)+' from '+salYmLabel(r.from)});}catch(e){}};
  const removeArr=a=>{if(!window.confirm('Remove the arrears of '+salM(a.amount)+' for '+salYmLabel(a.forYm)+'?'))return;onChange({...emp,arrears:emp.arrears.filter(x=>x!==a)});
    try{logAuditEvent(sid,{entity:'Employee',entityId:emp.id,action:'Arrears removed',summary:emp.name+': '+salM(a.amount)+' for '+salYmLabel(a.forYm)});}catch(e){}};
  const paidLocked=ym=>{const p=salYmParts(ym);return(typeof isMonthLockedFor==='function'&&isMonthLockedFor(sid,p.y,p.m))||!!(typeof ffBlock==='function'&&ffBlock(sid,ym,'pay'));};
  return h('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:14,marginTop:12}},
    h('div',{style:{fontSize:11,fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}},'Master Salary history'),
    hist.map((r,i)=>h('div',{key:i,style:{display:'flex',gap:8,alignItems:'center',fontSize:12.5,padding:'4px 0',borderTop:i?'1px solid var(--border)':'none'}},
      h('span',{style:{width:110,color:'var(--text2)'}},r.from?'From '+salYmLabel(r.from):'Earlier'),h('b',{style:{width:90,textAlign:'right'}},salM(r.gross)),
      h('span',{style:{flex:1,color:'var(--text3)',fontSize:11.5}},[r===cur?'current':r.from&&r.from>now?'scheduled':'',Array.isArray(r.changed)&&r.changed.length?r.changed.map(k=>SAL_FIELD_LABEL[k]||k).join(', '):'',r.reason,r.by].filter(Boolean).join(' · ')),
      r.from&&r.from>now&&h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>removeRev(r)},'Remove'))),
    arr.length>0&&h('div',{style:{fontSize:11,fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',margin:'10px 0 4px'}},'Arrears'),
    arr.map((a,i)=>h('div',{key:'a'+i,style:{display:'flex',gap:8,alignItems:'center',fontSize:12.5,padding:'3px 0'}},
      h('span',{style:{flex:1}},'For '+salYmLabel(a.forYm)+' · paid in '+salYmLabel(a.payYm)+' salary'+(a.days?' · '+a.days+'/'+a.dim+' days':'')),h('b',null,salM(a.amount)),
      !paidLocked(a.payYm)&&h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>removeArr(a)},'Remove'))));
}
// Small line under the employee's name in Master Salary when a change is scheduled.
function salScheduledLabel(sid,e){if(!salRevOn(sid)||!e||!Array.isArray(e.payHistory))return'';const now=salNowYm();const f=e.payHistory.filter(r=>r.from&&r.from>now).sort((a,b)=>a.from.localeCompare(b.from))[0];return f?'📈 '+salM(f.gross)+' from '+salYmLabel(f.from):'';}

// ── EPF coverage from 17 Sep 2026 (Controls → pfCoverage25k) ──
// The PF wage ceiling rose to ₹25,000 (S.O. 5109(E), 17 Sep 2026), so in a PF-registered outlet
// every employee whose EPF wage (Basic) is up to ₹25,000 must be a member of EPF, EPS and EDLI from
// 17 Sep 2026 — enrolment is the employer's duty. Lists active employees with PF not ticked.
function pfCoverageGaps(sid,y,m){
  if(sid==null||!(typeof controlOn==='function'&&controlOn('pfCoverage25k',sid)))return[];
  const rec=typeof getSalonRecordById==='function'?getSalonRecordById(sid):null;if(!rec||!rec.pfApplicable)return[];
  if(y*12+m<2026*12+8)return[];
  let E=[];try{E=(getEmployeesForMonth(y,m,sid)||[]).filter(e=>e.status!=='Inactive');}catch(x){}
  const w=e=>typeof msPfWage==='function'?msPfWage(e,sid):(Number(e.basic)||0);return E.filter(e=>!e.pf&&w(e)>0&&w(e)<=25000);
}
function PfCoverageStrip({sid,y,m}){
  const h=React.createElement;if(y==null||m==null){const d=new Date();y=d.getFullYear();m=d.getMonth();}
  const L=pfCoverageGaps(sid,y,m);if(!L.length)return null;
  return h('div',{style:{background:'rgba(224,165,48,0.12)',border:'1px solid rgba(224,165,48,0.4)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,fontSize:12.5}},
    h('b',null,'⚠ PF must be on for '+L.length+' employee'+(L.length===1?'':'s')+': '),L.map(e=>e.name+' (Basic ₹'+Math.round(Number(e.basic)||0).toLocaleString('en-IN')+')').join(', '),
    h('div',{style:{fontSize:11.5,color:'var(--text2)',marginTop:3}},'From 17 Sep 2026 the PF wage ceiling is ₹25,000, so employees with EPF wages (Basic) up to ₹25,000 must be enrolled in EPF, EPS and EDLI. Tick PF for them in Master Salary (Employment & Salary → Statutory Applicability).'));
}

// ── Salary History (Master Salary → 📜 Salary History): every employee's pay changes in one list,
// each one editable (the month it takes effect, the pay parts and the reason) or removable. ──
// The pay history of an employee, starting with the pay before the first recorded change.
function salHistOf(e){
  if(Array.isArray(e&&e.payHistory)&&e.payHistory.length)return e.payHistory.slice().sort((a,b)=>String(a.from||'').localeCompare(String(b.from||'')));
  return[{from:null,...salPayOf(e||{}),vals:salSnap(e||{}),at:(e&&e.createdAt)||null,by:'',reason:'Pay as in Master Salary'}];
}
// Month an entry starts paying (the first entry covers everything from joining).
function salEntryStart(e,r){return r.from||(e&&e.doj?String(e.doj).slice(0,7):null);}
// An entry can be changed only while every month it pays (from its start up to the next change, or
// this month) is still open; once one of them is locked / final, add a new change from an open month.
function salEntryEditable(sid,e,r){
  const H=salHistOf(e);const i=H.indexOf(r);const now=salNowYm();
  let ym=salEntryStart(e,r)||salYmAdd(now,-36);if(ym<salYmAdd(now,-36))ym=salYmAdd(now,-36);
  const next=i>=0&&H[i+1]?H[i+1].from:null;const end=next&&next<=now?salYmAdd(next,-1):now;
  for(;ym<=end;ym=salYmAdd(ym,1))if(salLocked(sid,ym))return false;
  return true;
}
// Gross CTC for given pay parts, worked out the same way Master Salary does on save.
function salGrossFor(sid,e,parts){
  const x={...e,...parts};const rec=typeof outletSettings==='function'?outletSettings(sid):null;
  if(typeof ctcFor==='function')return ctcFor(x,rec);
  return['basic','hra','conv','special'].reduce((t,k)=>t+(Number(x[k])||0),0);
}
// The employee record with this history; its own pay = the entry that applies this month.
function salWithHistory(e,hist){
  const H=hist.slice().sort((a,b)=>String(a.from||'').localeCompare(String(b.from||'')));
  const rec={...e,payHistory:H};const cur=salPickEntry(H,salNowYm());
  if(cur){if(cur.vals)Object.keys(cur.vals).forEach(k=>{if(!SAL_HIST_SKIP.has(k)&&!SAL_PAY_FIELDS.includes(k))rec[k]=cur.vals[k];});SAL_PAY_FIELDS.forEach(k=>{rec[k]=Number(cur[k])||0;});}
  return rec;
}
function SalHistoryEditModal({sid,emp,entry,onClose,onSave}){
  const h=React.createElement;const isNew=!entry;const base=entry||salPickEntry(salHistOf(emp),salNowYm())||salPayOf(emp);
  const [f,setF]=useState({from:isNew?salYmAdd(salNowYm(),1):(entry.from||''),basic:String(Number(base.basic)||0),hra:String(Number(base.hra)||0),conv:String(Number(base.conv)||0),special:String(Number(base.special)||0),reason:isNew?'':(entry.reason||'')});
  const set=k=>ev=>{const v=ev.target.value;setF(p=>({...p,[k]:v}));};
  const parts={basic:Number(f.basic)||0,hra:Number(f.hra)||0,conv:Number(f.conv)||0,special:Number(f.special)||0};
  const gross=salGrossFor(sid,{...emp,...((entry&&entry.vals)||{})},parts);
  const isFirst=!isNew&&entry.from==null;
  const save=()=>{
    const from=isFirst?null:f.from;
    if(!isFirst&&!/^\d{4}-\d{2}$/.test(from||'')){window.alert('Pick the month this pay takes effect from.');return;}
    if(!isFirst&&salLocked(sid,from)){window.alert(salYmLabel(from)+' is locked (month closed / final), so pay for it can’t change here. Pick a later month. Arrears for locked months are added when you change pay through Edit employee.');return;}
    const hist=salHistOf(emp);
    if(!isFirst&&hist.some(r=>r!==entry&&r.from===from)){window.alert('There is already a pay change from '+salYmLabel(from)+'. Edit that one instead.');return;}
    if(!(parts.basic>0)){window.alert('Basic must be more than 0.');return;}
    const who=(typeof currentSessionUser==='function'&&(currentSessionUser()||{}).name)||'';
    const vals=(entry&&entry.vals)||salSnap(emp);
    const next={...(entry||{}),from,...parts,gross,vals:{...vals,...parts,gross},reason:f.reason.trim(),at:(entry&&entry.at)||new Date().toISOString(),by:(entry&&entry.by)||who,
      changed:(entry&&entry.changed)||SAL_PAY_FIELDS.filter(k=>Math.round(Number(base[k])||0)!==Math.round(Number(k==='gross'?gross:parts[k])||0)),editedAt:isNew?undefined:new Date().toISOString(),editedBy:isNew?undefined:who};
    const H=isNew?[...hist,next]:hist.map(r=>r===entry?next:r);
    onSave(salWithHistory(emp,H),(isNew?'Pay change added':'Pay change edited')+': '+emp.name+' — '+salM(gross)+(from?' from '+salYmLabel(from):' (pay from joining)'));
  };
  const num=(k,l)=>h('div',{className:'form-group'},h('label',null,l),h('input',{type:'number',className:'form-control',value:f[k],onChange:set(k)}));
  return h('div',{className:'modal-overlay',style:{zIndex:1100},onClick:onClose},h('div',{className:'modal',style:{width:520,maxWidth:'96vw'},onClick:ev=>ev.stopPropagation()},
    h('div',{className:'modal-title'},(isNew?'Add pay change — ':'Edit pay change — ')+(emp.name||'')),
    isFirst?h('div',{style:{fontSize:12.5,color:'var(--text2)',marginBottom:10}},'Pay before the first recorded change (from joining).')
      :h('div',{className:'form-group'},h('label',null,'With effect from'),h('input',{type:'month',className:'form-control',value:f.from,onChange:set('from')})),
    h('div',{className:'form-row cols2'},num('basic','Basic (₹)'),num('hra','HRA (₹)')),
    h('div',{className:'form-row cols2'},num('conv','Conveyance (₹)'),num('special','Special allowance (₹)')),
    h('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'8px 12px',fontSize:12.5,marginBottom:10}},'Gross CTC (incl. employer PF / ESIC): ',h('b',null,salM(gross))),
    h('div',{className:'form-group'},h('label',null,'Reason'),h('input',{className:'form-control',value:f.reason,onChange:set('reason'),placeholder:'e.g. Annual increment'})),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'Salary Working, payslips, P&L and every other screen use this pay for the months it covers. Arrears already worked out for locked months are not changed here; see the employee’s view window.'),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Cancel'),h('button',{className:'btn btn-primary',onClick:save},isNew?'Add':'Save'))));
}
// Under each employee's name in Master Salary: their pay changes, newest first (3 shown, the rest
// on "more"), each with the month, Gross CTC, the rise / cut and the reason; ✎ opens the editor.
function SalHistInline({sid,emp,onEdit}){
  const h=React.createElement;const [all,setAll]=useState(false);
  const H=salHistOf(emp);const now=salNowYm();const cur=salPickEntry(H,now);
  const stop=fn=>ev=>{ev.stopPropagation();fn();};
  const editBtn=h('button',{className:'btn btn-ghost btn-sm',style:{padding:'0 5px',fontSize:10.5,lineHeight:'16px',minHeight:0},title:'View / edit salary history',onClick:stop(()=>onEdit(emp))},'✎');
  if(H.length<2)return h('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:3,display:'flex',gap:4,alignItems:'center',whiteSpace:'nowrap'}},'📜 No pay change yet',editBtn);
  const rows=H.map((r,i)=>({r,prev:i?H[i-1]:null})).reverse();const shown=all?rows:rows.slice(0,3);
  return h('div',{style:{marginTop:4,borderLeft:'2px solid var(--border2)',paddingLeft:6}},
    h('div',{style:{fontSize:10,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.06em',display:'flex',gap:4,alignItems:'center'}},'📜 Salary history',editBtn),
    shown.map(({r,prev},i)=>{const g=Math.round(Number(r.gross)||0),pg=prev?Math.round(Number(prev.gross)||0):null;const d=pg==null?0:g-pg;
      return h('div',{key:i,style:{fontSize:10.5,whiteSpace:'nowrap',color:r===cur?'var(--text)':'var(--text2)',fontWeight:r===cur?600:400},title:[r.reason,r.by].filter(Boolean).join(' · ')},
        (r.from?salYmLabel(r.from):'Joining')+' · '+salM(g),
        d?h('span',{style:{color:d>0?'var(--green)':'var(--red)',marginLeft:4}},(d>0?'▲ ':'▼ ')+salM(Math.abs(d))):null,
        r===cur?h('span',{style:{color:'var(--green)',marginLeft:4,fontWeight:400}},'current'):r.from&&r.from>now?h('span',{style:{color:'var(--accent)',marginLeft:4}},'scheduled'):null);}),
    rows.length>3&&h('button',{className:'btn btn-ghost btn-sm',style:{padding:'0 4px',fontSize:10.5,minHeight:0},onClick:stop(()=>setAll(a=>!a))},all?'less':'+'+(rows.length-3)+' more'));
}
function SalHistoryAll({sid,employees,onChangeEmp,onClose,initialQ}){
  const h=React.createElement;const [q,setQ]=useState(initialQ||'');const [edit,setEdit]=useState(null);const [showAll,setShowAll]=useState(false);
  const now=salNowYm();
  const rows=[];(employees||[]).filter(e=>showAll||e.status!=='Inactive').forEach(e=>{const H=salHistOf(e);const cur=salPickEntry(H,now);
    H.forEach((r,i)=>rows.push({e,r,prev:i?H[i-1]:null,cur:r===cur,sched:!!(r.from&&r.from>now),first:i===0}));});
  const qq=q.trim().toLowerCase();
  const shown=rows.filter(x=>!qq||String(x.e.name||'').toLowerCase().includes(qq)||String(x.e.id||'').toLowerCase().includes(qq)||String(x.e.desig||'').toLowerCase().includes(qq));
  shown.sort((a,b)=>String(a.e.name||'').localeCompare(String(b.e.name||''))||String(b.r.from||'').localeCompare(String(a.r.from||'')));
  const save=(rec,summary)=>{onChangeEmp(rec);setEdit(null);try{logAuditEvent(sid,{entity:'Employee',entityId:rec.id,action:'Salary history',summary});}catch(x){}};
  const remove=x=>{if(!window.confirm('Remove the pay change from '+salYmLabel(x.r.from)+' ('+salM(x.r.gross)+') for '+x.e.name+'?\n\nThe months it covered go back to the pay before it.'))return;
    save(salWithHistory(x.e,salHistOf(x.e).filter(r=>r!==x.r)),'Pay change removed: '+x.e.name+' — '+salM(x.r.gross)+' from '+salYmLabel(x.r.from));};
  const td={padding:'6px 8px',fontSize:12.5,borderBottom:'1px solid var(--border)',verticalAlign:'top'};const th={...td,fontSize:11,fontWeight:700,color:'var(--text3)',textAlign:'left',position:'sticky',top:0,background:'var(--bg2)'};
  const diff=(x,k)=>{const v=Math.round(Number(x.r[k])||0);const p=x.prev?Math.round(Number(x.prev[k])||0):null;
    return h('td',{style:{...td,textAlign:'right',whiteSpace:'nowrap'}},salM(v),p!=null&&p!==v&&h('div',{style:{fontSize:10.5,color:v>p?'var(--green)':'var(--red)'}},(v>p?'+ ':'− ')+salM(Math.abs(v-p))));};
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:1100,maxWidth:'97vw',maxHeight:'92vh',display:'flex',flexDirection:'column'},onClick:ev=>ev.stopPropagation()},
    h('div',{style:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:10}},
      h('div',{className:'modal-title',style:{margin:0,padding:0,border:'none',flex:1}},'📜 Salary History'),
      h('input',{className:'form-control',style:{width:220},placeholder:'Search name, ID, designation',value:q,onChange:ev=>setQ(ev.target.value)}),
      h('label',{style:{fontSize:12,display:'flex',gap:6,alignItems:'center'}},h('input',{type:'checkbox',checked:showAll,onChange:ev=>setShowAll(ev.target.checked)}),'Include inactive'),
      h('button',{className:'btn btn-ghost btn-sm',onClick:onClose},'✕ Close')),
    !salRevOn(sid)&&h('div',{className:'help-note',style:{marginBottom:8}},'Month-wise pay changes are switched off for this outlet (Master Settings → Controls → Master Salary changes ask “with effect from”), so only the current pay is used for every month.'),
    h('div',{style:{overflow:'auto',flex:1}},h('table',{style:{width:'100%',borderCollapse:'collapse'}},
      h('thead',null,h('tr',null,['Employee','Effective from','Basic','HRA','Conv.','Special','Gross CTC','What changed · reason','Recorded',''].map((t,i)=>h('th',{key:i,style:{...th,textAlign:i>=2&&i<=6?'right':'left'}},t)))),
      h('tbody',null,shown.length?shown.map((x,i)=>{const ok=salEntryEditable(sid,x.e,x.r);
        return h('tr',{key:x.e.id+'|'+(x.r.from||'')+'|'+i,style:{background:x.cur?'rgba(76,175,125,0.07)':x.sched?'rgba(47,95,224,0.06)':undefined}},
          h('td',{style:td},h('b',null,x.e.name),h('div',{style:{fontSize:11,color:'var(--text3)'}},[x.e.id,x.e.desig,x.e.status&&x.e.status!=='Active'?x.e.status:''].filter(Boolean).join(' · '))),
          h('td',{style:{...td,whiteSpace:'nowrap'}},x.r.from?salYmLabel(x.r.from):'From joining',h('div',{style:{fontSize:10.5,color:x.cur?'var(--green)':x.sched?'var(--accent)':'var(--text3)'}},x.cur?'current':x.sched?'scheduled':'earlier')),
          diff(x,'basic'),diff(x,'hra'),diff(x,'conv'),diff(x,'special'),diff(x,'gross'),
          h('td',{style:{...td,fontSize:11.5,color:'var(--text2)',maxWidth:260}},[Array.isArray(x.r.changed)&&x.r.changed.length?x.r.changed.map(k=>SAL_FIELD_LABEL[k]||k).join(', '):'',x.r.reason].filter(Boolean).join(' · ')||'—'),
          h('td',{style:{...td,fontSize:11,color:'var(--text3)',whiteSpace:'nowrap'}},x.r.at?new Date(x.r.at).toLocaleDateString('en-GB'):'—',x.r.by?h('div',null,x.r.by):null,x.r.editedAt?h('div',null,'edited '+new Date(x.r.editedAt).toLocaleDateString('en-GB')):null),
          h('td',{style:{...td,whiteSpace:'nowrap',textAlign:'right'}},ok
            ?h(React.Fragment,null,h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setEdit({e:x.e,r:x.r})},'✎ Edit'),!x.first&&h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>remove(x)},'Remove'))
            :h('span',{title:'The month this pay starts in is locked / final',style:{fontSize:11.5,color:'var(--text3)'}},'🔒 locked'),
            x.first&&h('div',null,h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setEdit({e:x.e,r:null})},'+ New change'))));})
        :h('tr',null,h('td',{colSpan:10,style:{...td,textAlign:'center',color:'var(--text3)',padding:24}},'No employees match.'))))),
    edit&&h(SalHistoryEditModal,{sid,emp:edit.e,entry:edit.r,onClose:()=>setEdit(null),onSave:save})));
}

// ── Master Salary edits reach records that were saved with the employee's name or Billing ID ──
// Advances, penalties, Daily Sales & Exp salary/advance lines, daily incentives, bank statement
// links and imported staff work reports keep the employee's name (and the reports the Billing ID)
// as typed then, so a corrected name or Billing ID is carried into them here. Month-final
// snapshots and approvals keep the name they were signed off with.
const MS_NAME_FIELDS=['emp','empName','employeeName','Emp_Name'];
const MS_NAME_KEYS=['salonos_advances','salonos_penalties','salonos_daily_sales_empdata','salonos_daily_incentive_entries','salonos_bank_statement_rows','salonos_staff_work_reports'];
function msCascadeEmployeeChange(sid,before,after){
  if(!before||!after||sid==null)return 0;
  const oldName=before.name,newName=after.name;const nameCh=!!oldName&&oldName!==newName&&String(newName||'').trim()!=='';
  const oldBid=String(before.billingId||'').trim(),newBid=String(after.billingId||'').trim();const bidCh=!!oldBid&&oldBid!==newBid&&newBid!=='';
  if(!nameCh&&!bidCh)return 0;
  let total=0;
  MS_NAME_KEYS.forEach(base=>{
    const key=outletKey(base,sid);const raw=cachedLocalGet(key);if(!raw)return;let data;try{data=JSON.parse(raw);}catch(e){return;}
    let n=0;
    const walk=o=>{if(Array.isArray(o)){o.forEach(walk);return;}if(!o||typeof o!=='object')return;
      const otherEmp=o.empId!=null&&String(o.empId)!==String(before.id); // a record of someone else with the same name
      if(!otherEmp){
        if(nameCh)MS_NAME_FIELDS.forEach(k=>{if(o[k]===oldName){o[k]=newName;n++;}});
        if(bidCh&&base==='salonos_staff_work_reports'&&String(o.EmpId==null?'':o.EmpId).trim()===oldBid){o.EmpId=newBid;n++;}
      }
      Object.keys(o).forEach(k=>{const v=o[k];if(v&&typeof v==='object')walk(v);});};
    walk(data);
    if(n){safeLocalSet(key,JSON.stringify(data));total+=n;}
  });
  if(total){try{logAuditEvent(sid,{entity:'Employee',entityId:after.id,action:'Linked records updated',summary:after.name+': '+[nameCh?'name '+oldName+' → '+newName:'',bidCh?'Billing ID '+oldBid+' → '+newBid:''].filter(Boolean).join(', ')+' in '+total+' record(s)'});}catch(e){}}
  return total;
}
