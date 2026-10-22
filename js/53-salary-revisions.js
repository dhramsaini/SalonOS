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
setTimeout(()=>{try{(typeof SALONS!=='undefined'?SALONS:[]).forEach(s=>{if(!s||s.id==null)return;salApplyDue(s.id);if(typeof advRepairOutstanding==='function')advRepairOutstanding(s.id);});}catch(e){}},5000);

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
