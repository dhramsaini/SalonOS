// ═════════════════════════════════════════════════════════════════════════════════════════════
// Advances — more tools (each its own switch in Controls → Salary & staff → Advances):
//   Giving:     eligibility check (advEligibility), limit by service & salary (advServiceLimit),
//               one open advance at a time (advOneOpen), request from the staff phone
//               (advPhoneRequest), signed acknowledgement (advAck).
//   Recovering: skip a month (advSkipMonth), change the plan (advChangePlan), part-recovery when
//               pay is short (advPartRecovery), repaid by the employee (advRepaid), split between
//               salary and incentive (advSplit), full and final for leavers (advLeavers).
//   Seeing:     statement per employee (advStatement), register with ageing for all outlets
//               (advRegister), overdue recovery (advOverdue), month-end tie-out (advTieOut).
//   Accounts:   journal for Tally (advTally), fee / interest (advFee), write-off with approval
//               (advWriteOff).
// Every recovery is kept in a.settled {'YYYY-MM': salary, 'YYYY-MM-R': repaid, 'YYYY-MM-W':
// written off}, so the balance is always amount + fee − settled.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const ADV_MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
function advOn(id,sid){return typeof controlOn==='function'&&controlOn(id,sid);}
function advLim(id,d,sid){const v=typeof controlLimit==='function'?Number(controlLimit(id,sid)):0;return v>0?v:d;}
function advM(n){return '₹'+Math.round(Number(n)||0).toLocaleString('en-IN');}
function advYm(y,m){return y+'-'+String(m+1).padStart(2,'0');}
function advYmNow(){const d=new Date();return advYm(d.getFullYear(),d.getMonth());}
function advYmAdd(ym,n){const p=String(ym).split('-');const d=new Date(+p[0],+p[1]-1+n,1);return advYm(d.getFullYear(),d.getMonth());}
function advYmLabel(ym){const p=String(ym).split('-');return ADV_MON[+p[1]-1].slice(0,3)+' '+p[0];}
function advDmy(iso){const p=String(iso||'').slice(0,10).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:'';}
function advLoadAll(sid){try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_advances',sid))||'[]');return Array.isArray(v)?v.map(a=>typeof advFixed==='function'?advFixed(a):a):[];}catch(e){return[];}}
function advSaveAll(sid,list){safeLocalSet(outletKey('salonos_advances',sid),JSON.stringify(list));}
function advWho(){const u=typeof currentSessionUser==='function'?currentSessionUser():null;return u?(u.name||u.email||''):'';}
function advTotal(a){return(Number(a.amount)||0)+(Number(a.fee)||0);}
function advLog(a,what){return{...a,planLog:[...(Array.isArray(a.planLog)?a.planLog:[]),{at:new Date().toISOString(),by:advWho(),what}]};}
function advUpdate(sid,id,fn){const L=advLoadAll(sid);let out=null;const next=L.map(a=>{if(a.id!==id)return a;out=fn(a);return out||a;});if(out)advSaveAll(sid,next);return out;}
function advStartYm(a){if(a.deductionStart)return String(a.deductionStart).slice(0,7);if(Array.isArray(a.schedule)&&a.schedule.length)return a.schedule.map(s=>s.month).sort()[0];return a.date?advYmAdd(String(a.date).slice(0,7),1):advYmNow();}
function advPlanned(a,ym){if(Array.isArray(a.schedule)&&a.schedule.length){const r=a.schedule.find(s=>s.month===ym);return r?Number(r.amount)||0:0;}return ym>=advStartYm(a)?(Number(a.repayment)||0):0;}
function advSettledFor(a,ym){return Object.entries(a.settled||{}).reduce((s,[k,v])=>k.slice(0,7)===ym?s+(Number(v)||0):s,0);}
// Month-wise plan for what is still owed, from `fromYm` (keeps months before it as they are).
function advMaterialize(a,fromYm){
  const keep=(Array.isArray(a.schedule)?a.schedule:[]).filter(s=>s.month<fromYm);
  const unsettledBefore=keep.filter(s=>!(Number((a.settled||{})[s.month])>0)).reduce((t,s)=>t+(Number(s.amount)||0),0);
  let left=Math.max(0,(Number(a.outstanding)||0)-unsettledBefore);const out=[...keep];
  if(Array.isArray(a.schedule)&&a.schedule.length){a.schedule.filter(s=>s.month>=fromYm).forEach(s=>{const amt=Math.min(Number(s.amount)||0,left);if(amt>0){out.push({month:s.month,amount:amt});left-=amt;}});
    let ym=out.length?advYmAdd(out[out.length-1].month,1):fromYm;const step=Number(a.repayment)||(out.length?Number(out[out.length-1].amount):0)||left;
    while(left>0.5&&step>0){const amt=Math.min(step,left);out.push({month:ym,amount:amt});left-=amt;ym=advYmAdd(ym,1);}}
  else{const step=Number(a.repayment)||left;let ym=fromYm>advStartYm(a)?fromYm:advStartYm(a);while(left>0.5&&step>0){const amt=Math.min(step,left);out.push({month:ym,amount:Math.round(amt)});left-=amt;ym=advYmAdd(ym,1);}}
  return out;
}
function advSetMonth(sched,ym,amt){const s=sched.filter(x=>x.month!==ym);if(amt>0.5)s.push({month:ym,amount:Math.round(amt)});return s.sort((x,y)=>x.month.localeCompare(y.month));}
function advAddMonth(sched,ym,amt){const cur=(sched.find(x=>x.month===ym)||{}).amount||0;return advSetMonth(sched,ym,(Number(cur)||0)+amt);}

// ── 6 · skip / move a month ──
function advSkipMonth(sid,id,ym,reason){
  return advUpdate(sid,id,a=>{const sched=advMaterialize(a,advYmNow()<ym?advYmNow():ym);const amt=Number((sched.find(s=>s.month===ym)||{}).amount)||0;if(!amt)return null;
    let s2=advSetMonth(sched,ym,0);s2=advAddMonth(s2,advYmAdd(ym,1),amt);return advLog({...a,schedule:s2},'Skipped '+advYmLabel(ym)+' ('+advM(amt)+' moved to '+advYmLabel(advYmAdd(ym,1))+')'+(reason?' — '+reason:''));});
}
// ── 7 · change the plan from a month ──
function advChangePlan(sid,id,fromYm,monthly,reason){
  monthly=Math.round(Number(monthly)||0);if(!(monthly>0))return null;
  return advUpdate(sid,id,a=>{const keep=(Array.isArray(a.schedule)&&a.schedule.length?a.schedule:advMaterialize(a,advYmNow())).filter(s=>s.month<fromYm);
    const unsettled=keep.filter(s=>!(advSettledFor(a,s.month)>0)).reduce((t,s)=>t+(Number(s.amount)||0),0);let left=Math.max(0,(Number(a.outstanding)||0)-unsettled);const out=[...keep];let ym=fromYm;
    while(left>0.5){const amt=Math.min(monthly,left);out.push({month:ym,amount:Math.round(amt)});left-=amt;ym=advYmAdd(ym,1);}
    return advLog({...a,schedule:out,repayment:monthly,planHistory:[...(a.planHistory||[]),{at:new Date().toISOString(),by:advWho(),schedule:a.schedule||[],repayment:a.repayment}]},'Plan changed to '+advM(monthly)+'/month from '+advYmLabel(fromYm)+(reason?' — '+reason:''));});
}
// ── 8 · part-recovery: never take more than the month's pay can bear; the rest moves on ──
function advCapToPay(sid,advAdj,netBeforeAdv){if(!advOn('advPartRecovery',sid))return advAdj;return Math.max(0,Math.min(advAdj,Math.floor(Math.max(0,netBeforeAdv))));}
function advSettleCap(sid,empName,y,m){if(!advOn('advPartRecovery',sid))return Infinity;try{const w=(swWorkingsFor(sid,y,m)||[]).find(x=>x.name===empName);return w?Number(w.advAdj)||0:Infinity;}catch(e){return Infinity;}}
function advCarryShort(a,ym,short){const sched=advMaterialize(a,ym);const cur=Number((sched.find(s=>s.month===ym)||{}).amount)||0;let s2=advSetMonth(sched,ym,Math.max(0,cur-short));s2=advAddMonth(s2,advYmAdd(ym,1),short);
  return advLog({...a,schedule:s2},advM(short)+' not recovered in '+advYmLabel(ym)+' (pay too short) — moved to '+advYmLabel(advYmAdd(ym,1)));}
function advUndoCarry(a,ym,short){let s2=Array.isArray(a.schedule)?a.schedule.slice():[];const nx=advYmAdd(ym,1);const n=Number((s2.find(s=>s.month===nx)||{}).amount)||0;s2=advSetMonth(s2,nx,Math.max(0,n-short));s2=advAddMonth(s2,ym,short);return{...a,schedule:s2};}
// ── 9 · repaid by the employee (cash / UPI / bank) ──
function advRepaid(sid,id,amount,date,mode,ref){
  amount=Math.round(Number(amount)||0);if(!(amount>0))return null;const ym=String(date||'').slice(0,7)||advYmNow();
  return advUpdate(sid,id,a=>{const take=Math.min(amount,Number(a.outstanding)||0);if(!(take>0))return null;const out=Math.max(0,(Number(a.outstanding)||0)-take);
    let sched=Array.isArray(a.schedule)?a.schedule.slice():[];if(sched.length){let cut=take;sched=sched.slice().sort((x,y)=>y.month.localeCompare(x.month)).map(s=>{if(cut<=0||s.month<advYmNow()||advSettledFor(a,s.month)>0)return s;const c=Math.min(cut,Number(s.amount)||0);cut-=c;return{...s,amount:(Number(s.amount)||0)-c};}).filter(s=>Number(s.amount)>0).sort((x,y)=>x.month.localeCompare(y.month));}
    const k=ym+'-R';return advLog({...a,outstanding:out,status:out<=0?'Recovered':a.status,schedule:sched,settled:{...(a.settled||{}),[k]:(Number((a.settled||{})[k])||0)+take},
      repaid:[...(a.repaid||[]),{date,amount:take,mode,ref:ref||'',by:advWho(),at:new Date().toISOString()}]},'Repaid by employee '+advM(take)+' ('+mode+', '+advDmy(date)+')');});
}
// ── 10 · split between salary and incentive (two linked records) ──
function advSplit(sid,id,salMonthly,incMonthly){
  salMonthly=Math.round(Number(salMonthly)||0);incMonthly=Math.round(Number(incMonthly)||0);if(!(salMonthly>0&&incMonthly>0))return'Enter both monthly amounts';
  const L=advLoadAll(sid);const a=L.find(x=>x.id===id);if(!a)return'Not found';if(advSettledTotalSafe(a)>0)return'Something has already been recovered on this advance — change its plan instead';
  const total=advTotal(a);const salPart=Math.round(total*salMonthly/(salMonthly+incMonthly));const incPart=total-salPart;const start=advStartYm(a);const grp=a.groupId||('G'+Date.now());
  const mk=(amt,mon)=>{const s=[];let left=amt,ym=start;while(left>0.5){const x=Math.min(mon,left);s.push({month:ym,amount:Math.round(x)});left-=x;ym=advYmAdd(ym,1);}return s;};
  const A1=advLog({...a,amount:salPart,fee:0,outstanding:salPart,repayment:salMonthly,deductFrom:'Salary',schedule:mk(salPart,salMonthly),groupId:grp},'Split — '+advM(salPart)+' from salary at '+advM(salMonthly)+'/month');
  const A2=advLog({...a,id:nextPrefixedId(L,'A',3),amount:incPart,fee:0,outstanding:incPart,repayment:incMonthly,deductFrom:'Incentive',schedule:mk(incPart,incMonthly),groupId:grp,source:a.source==='dse'?'split':a.source,splitOf:a.id},'Split — '+advM(incPart)+' from incentive at '+advM(incMonthly)+'/month');
  advSaveAll(sid,[...L.map(x=>x.id===id?A1:x),A2]);return'';
}
function advSettledTotalSafe(a){return Object.values(a.settled||{}).reduce((s,v)=>s+(Number(v)||0),0);}
// ── 17 · fee / interest ──
function advAddFee(sid,id,kind,val){
  return advUpdate(sid,id,a=>{const fee=Math.round(kind==='pct'?(Number(a.outstanding)||0)*(Number(val)||0)/100:Number(val)||0);if(!(fee>0))return null;
    let sched=Array.isArray(a.schedule)&&a.schedule.length?a.schedule.slice():null;if(sched){let left=fee;let ym=advYmAdd(sched.map(s=>s.month).sort().pop(),1);const step=Number(a.repayment)||fee;while(left>0.5){const x=Math.min(step,left);sched.push({month:ym,amount:Math.round(x)});left-=x;ym=advYmAdd(ym,1);}}
    return advLog({...a,fee:(Number(a.fee)||0)+fee,outstanding:(Number(a.outstanding)||0)+fee,status:'Active',...(sched?{schedule:sched}:{})},'Fee / interest '+advM(fee)+' added');});
}
// ── 18 · write-off (needs Super Admin approval) ──
function advWriteOff(sid,id,reason){
  const a=advLoadAll(sid).find(x=>x.id===id);if(!a)return false;const out=Number(a.outstanding)||0;if(!(out>0)){window.alert('Nothing left to write off.');return false;}
  if(typeof requireApproval==='function'&&!requireApproval({control:'advWriteOff',sid,key:'wo|'+id+'|'+Math.round(out),summary:'Write off advance '+id+' of '+a.emp+': '+advM(out)+(reason?' — '+reason:'')}))return false;
  const ym=advYmNow();advUpdate(sid,id,x=>advLog({...x,outstanding:0,status:'Written off',writtenOff:{amount:out,at:new Date().toISOString(),by:advWho(),reason:reason||'',ym},settled:{...(x.settled||{}),[ym+'-W']:out}},'Written off '+advM(out)+(reason?' — '+reason:'')));
  try{logAuditEvent(sid,{entity:'Advance',entityId:id,action:'Written off',summary:a.emp+': '+advM(out)+(reason?' — '+reason:'')});}catch(e){}return true;
}
function advWrittenOffFor(sid,y,m){const ym=advYm(y,m);return advLoadAll(sid).reduce((s,a)=>s+(a.writtenOff&&a.writtenOff.ym===ym?Number(a.writtenOff.amount)||0:0),0);}

// ── 1, 2, 3 · checks when giving an advance ──
function advServiceMonths(e){const d=e&&e.doj?new Date(String(e.doj).slice(0,10)+'T00:00:00'):null;if(!d||isNaN(d))return null;const n=new Date();return(n.getFullYear()-d.getFullYear())*12+(n.getMonth()-d.getMonth());}
function advFacts(sid,empName,amount,monthly,excludeId){
  const n=new Date();const emp=(getEmployeesForMonth(n.getFullYear(),n.getMonth(),sid)||[]).find(e=>e.name===empName)||(loadEmployees(sid)||[]).find(e=>e.name===empName)||null;
  const open=advLoadAll(sid).filter(a=>a.emp===empName&&a.id!==excludeId&&(a.status==='Active'||a.status==='Pending Approval')&&(Number(a.outstanding)||0)>0);
  const owed=open.reduce((t,a)=>t+(Number(a.outstanding)||0),0);const otherMonthly=open.reduce((t,a)=>t+(advPlanned(a,advYmNow())||Number(a.repayment)||0),0);
  let net=null;try{const w=(swWorkingsFor(sid,n.getFullYear(),n.getMonth())||[]).find(x=>x.name===empName);if(w)net=(Number(w.net)||0)+(Number(w.advAdj)||0);}catch(e){}
  const gross=emp?Number(emp.gross)||0:0;const svc=advServiceMonths(emp);const total=owed+(Number(amount)||0);const perMonth=otherMonthly+(Number(monthly)||0);
  const months=perMonth>0?Math.ceil(total/perMonth):null;return{emp,open,owed,otherMonthly,net,gross,svc,total,perMonth,months};
}
function advChecks(sid,empName,amount,monthly,excludeId){
  const warns=[],blocks=[];if(!empName||!(Number(amount)>0))return{warns,blocks,f:null};const f=advFacts(sid,empName,amount,monthly,excludeId);
  if(advOn('advEligibility',sid)){const maxM=advLim('advEligibility',6,sid);if(f.months!=null&&f.months>maxM)warns.push('Recovery would take '+f.months+' months (more than '+maxM+')');if(!(Number(monthly)>0))warns.push('No monthly deduction set — nothing will be recovered');
if(f.emp&&f.emp.dol)warns.push('Employee has a leaving date ('+advDmy(f.emp.dol)+') — recover it before they go');
    if(f.net!=null&&f.perMonth>f.net)warns.push('Monthly recovery '+advM(f.perMonth)+' is more than this month’s net pay before advances '+advM(f.net));}
  if(advOn('advOneOpen',sid)&&f.open.length)warns.push(empName+' already has '+f.open.length+' open advance'+(f.open.length>1?'s':'')+' ('+advM(f.owed)+' still owed)');
  if(advOn('advServiceLimit',sid)&&f.gross>0&&f.svc!=null){const mult=advLim('advServiceLimit',1,sid);const cap=f.svc<3?0:f.svc<12?Math.round(f.gross*mult/2):Math.round(f.gross*mult);
    if(f.total>cap)blocks.push(f.svc<3?'No advance in the first 3 months of service ('+empName+' has '+f.svc+' month'+(f.svc===1?'':'s')+')':'Advances for '+f.svc+' months’ service are limited to '+advM(cap)+' ('+(f.svc<12?'half of ':'')+mult+'× gross) — this would make '+advM(f.total));}
  return{warns,blocks,f};
}
function advGate(sid,empName,amount,monthly,excludeId){
  const {warns,blocks}=advChecks(sid,empName,amount,monthly,excludeId);
  if(blocks.length){window.alert('Cannot save this advance:\n\n• '+blocks.join('\n• '));if(typeof controlHit==='function')controlHit('advServiceLimit',sid,'b');return false;}
  if(warns.length){const ok=window.confirm('Please check this advance:\n\n• '+warns.join('\n• ')+'\n\nSave anyway?');if(ok){try{logAuditEvent(sid,{entity:'Entry check',entityId:'advance',action:'Saved despite warning',summary:empName+': '+warns.join(' | ')});}catch(e){}}return ok;}
  return true;
}
function AdvEligibility({sid,empName,amount,monthly,excludeId}){
  const h=React.createElement;if(!empName||!advOn('advEligibility',sid))return null;const {warns,blocks,f}=advChecks(sid,empName,amount||0,monthly||0,excludeId);if(!f)return null;
  const cell=(l,v,c)=>h('div',null,h('div',{style:{fontSize:10.5,color:'var(--text3)',textTransform:'uppercase'}},l),h('div',{style:{fontWeight:700,color:c||'var(--text)'}},v));
  return h('div',{style:{border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,background:'var(--bg3)'}},
    h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:8}},cell('Net pay before advances',f.net==null?'—':advM(f.net)),cell('Already owed',f.owed?advM(f.owed):'—',f.owed?'var(--red)':undefined),
      cell('Monthly recovery',f.perMonth?advM(f.perMonth):'—'),cell('Paid off in',f.months==null?'—':f.months+' month'+(f.months===1?'':'s')),cell('Service',f.svc==null?'—':f.svc+' month'+(f.svc===1?'':'s'))),
    (warns.length||blocks.length)>0&&h('ul',{style:{margin:'6px 0 0 18px',padding:0,fontSize:12,color:blocks.length?'var(--red)':'var(--orange,#c27711)'}},[...blocks,...warns].map((t,i)=>h('li',{key:i},t))));
}

// ── 4 · request from the staff phone ──
function AdvPhoneRequest({sid,emp}){
  const h=React.createElement;const {toast}=useToast();const [open,setOpen]=useState(false);const [f,setF]=useState({amount:'',months:'3',reason:'',pin:''});const [,t]=useState(0);
  if(!emp||!advOn('advPhoneRequest',sid))return null;
  const mine=advLoadAll(sid).filter(a=>a.emp===emp.name&&a.source==='phone').slice(-3).reverse();
  const send=()=>{const amt=Math.round(Number(f.amount)||0);const mon=Math.max(1,Math.round(Number(f.months)||1));if(!(amt>0)){toast('Enter the amount','error');return;}
    const mob=String(emp.mobile||'').replace(/\D/g,'');if(mob.length>=4&&f.pin!==mob.slice(-4)){toast('Wrong PIN — the last 4 digits of your mobile number','error');return;}
    const L=advLoadAll(sid);const n=new Date();const start=advYmAdd(advYmNow(),1);
    const rec={id:nextPrefixedId(L,'A',3),emp:emp.name,date:localIsoOf(n),amount:amt,repayment:Math.ceil(amt/mon),reason:f.reason.trim()||'Requested on the staff phone',approvedBy:'',mode:'Bank Transfer',bankRef:'',deductFrom:'Salary',deductionStart:start,schedule:[],outstanding:amt,status:'Pending Approval',source:'phone',requestedAt:n.toISOString()};
    advSaveAll(sid,[...L,rec]);try{logAuditEvent(sid,{entity:'Advance',entityId:rec.id,action:'Requested on staff phone',summary:emp.name+': '+advM(amt)+' over '+mon+' month(s)'});}catch(e){}
    toast('Request sent — the manager will approve it','success');setF({amount:'',months:'3',reason:'',pin:''});setOpen(false);t(x=>x+1);};
  return h('div',{style:{marginTop:10}},
    h('button',{className:'btn '+(open?'btn-primary':'btn-ghost'),style:{width:'100%',justifyContent:'center'},onClick:()=>setOpen(!open)},'💵 Ask for an advance'),
    open&&h('div',{style:{marginTop:8,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}},
      h('input',{className:'form-control',type:'number',inputMode:'numeric',placeholder:'Amount ₹',value:f.amount,onChange:e=>setF({...f,amount:e.target.value})}),
      h('select',{className:'form-control',value:f.months,onChange:e=>setF({...f,months:e.target.value})},[1,2,3,4,5,6].map(n=>h('option',{key:n,value:n},'Repay in '+n+' month'+(n>1?'s':'')))),
      h('input',{className:'form-control',style:{gridColumn:'1 / -1'},placeholder:'Reason',value:f.reason,onChange:e=>setF({...f,reason:e.target.value})}),
      h('input',{className:'form-control',type:'password',inputMode:'numeric',maxLength:4,placeholder:'PIN — last 4 digits of your mobile',value:f.pin,onChange:e=>setF({...f,pin:e.target.value})}),
      h('button',{className:'btn btn-primary',style:{justifyContent:'center'},onClick:send},'Send')),
    mine.length>0&&h('div',{style:{marginTop:6,fontSize:12,color:'var(--text2)'}},mine.map(a=>h('div',{key:a.id},advDmy(a.date)+' · '+advM(a.amount)+' — '+(a.status==='Pending Approval'?'waiting for approval':a.status==='Rejected'?'not approved':'approved')))));
}
function advTellWhatsApp(sid,a){const e=(loadEmployees(sid)||[]).find(x=>x.name===a.emp);const ph=typeof waNumber==='function'?waNumber(e&&e.mobile):'';
  const txt=a.status==='Rejected'?'Dear '+a.emp+', your advance request of '+advM(a.amount)+' dated '+advDmy(a.date)+' has not been approved.'
    :'Dear '+a.emp+', your advance of '+advM(a.amount)+' dated '+advDmy(a.date)+' is approved. It will be recovered '+(Array.isArray(a.schedule)&&a.schedule.length?a.schedule.map(s=>advYmLabel(s.month)+' '+advM(s.amount)).join(', '):advM(a.repayment)+' a month from '+advYmLabel(advStartYm(a)))+' from your '+(a.deductFrom||'Salary').toLowerCase()+'.';
  window.open('https://wa.me/'+(ph||'')+'?text='+encodeURIComponent(txt),'_blank','noopener');}

// ── 5 · acknowledgement ──
function advPrintAck(sid,a){
  const salon=(typeof SALONS!=='undefined'?SALONS:[]).find(s=>String(s.id)===String(sid))||{};const esc=t=>String(t==null?'':t).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
  const plan=(Array.isArray(a.schedule)&&a.schedule.length?a.schedule:advMaterialize(a,advStartYm(a))).map(s=>'<tr><td>'+esc(advYmLabel(s.month))+'</td><td style="text-align:right">'+esc(advM(s.amount))+'</td></tr>').join('');
  const w=window.open('','_blank');if(!w){window.alert('Allow pop-ups to print.');return;}
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Advance acknowledgement</title><style>body{font:13px Arial;margin:32px;color:#222}h1{font-size:18px;margin:0 0 4px}table{border-collapse:collapse;width:60%;margin:8px 0}td,th{border:1px solid #bbb;padding:4px 8px}.sig{display:flex;justify-content:space-between;margin-top:60px}.sig div{border-top:1px solid #333;padding-top:4px;width:40%;text-align:center}</style></head><body>'
    +'<h1>'+esc(String(salon.name||'').split('—')[0])+'</h1><div>Advance against salary — acknowledgement</div><hr>'
    +'<p>I, <b>'+esc(a.emp)+'</b>, have received an advance of <b>'+esc(advM(a.amount))+'</b> on <b>'+esc(advDmy(a.date))+'</b> by '+esc(a.mode||'')+(a.bankRef?' (ref. '+esc(a.bankRef)+')':'')+'.'
    +(a.fee?' A fee / interest of '+esc(advM(a.fee))+' is added.':'')+' I agree that it will be recovered from my '+esc((a.deductFrom||'Salary').toLowerCase())+' as below, and that any balance on leaving will be recovered from my final dues.</p>'
    +'<table><tr><th>Month</th><th>Amount</th></tr>'+plan+'</table>'+(a.reason?'<p>Reason: '+esc(a.reason)+'</p>':'')
    +'<div class="sig"><div>Employee signature</div><div>For the salon</div></div><script>setTimeout(()=>window.print(),300)<\/script></body></html>');w.document.close();}

// ── 12 · statement ──
function advStatementRows(sid,empName){
  const L=advLoadAll(sid).filter(a=>a.emp===empName&&a.status!=='Pending Approval'&&a.status!=='Rejected');if(!L.length)return[];
  const first=L.map(a=>String(a.date||'').slice(0,7)).filter(Boolean).sort()[0]||advYmNow();const rows=[];let bal=0;
  for(let ym=first;ym<=advYmNow();ym=advYmAdd(ym,1)){const given=L.filter(a=>String(a.date||'').slice(0,7)===ym).reduce((t,a)=>t+advTotal(a),0);
    const rec={salary:0,repaid:0,writeoff:0};L.forEach(a=>Object.entries(a.settled||{}).forEach(([k,v])=>{if(k.slice(0,7)!==ym)return;if(k.endsWith('-R'))rec.repaid+=Number(v)||0;else if(k.endsWith('-W'))rec.writeoff+=Number(v)||0;else rec.salary+=Number(v)||0;}));
    const recovered=rec.salary+rec.repaid+rec.writeoff;const open=bal;bal=bal+given-recovered;if(given||recovered||bal>0.5)rows.push({ym,open,given,...rec,recovered,close:bal});}
  return rows;
}
function AdvStatement({sid,emp}){
  const h=React.createElement;const rows=advStatementRows(sid,emp);if(!rows.length)return h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No advances for '+emp+'.');
  const print=()=>{const esc=t=>String(t).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));const w=window.open('','_blank');if(!w)return;
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Advance statement</title><style>body{font:12.5px Arial;margin:28px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:4px 6px;text-align:right}td:first-child,th:first-child{text-align:left}</style></head><body><h2>Advance statement — '+esc(emp)+'</h2><table><tr><th>Month</th><th>Opening</th><th>Given</th><th>From pay</th><th>Repaid</th><th>Written off</th><th>Closing</th></tr>'
      +rows.map(r=>'<tr><td>'+esc(advYmLabel(r.ym))+'</td>'+[r.open,r.given,r.salary,r.repaid,r.writeoff,r.close].map(v=>'<td>'+esc(v?advM(v):'—')+'</td>').join('')+'</tr>').join('')+'</table><script>setTimeout(()=>window.print(),300)<\/script></body></html>');w.document.close();};
  const wa=()=>{const e=(loadEmployees(sid)||[]).find(x=>x.name===emp);const ph=typeof waNumber==='function'?waNumber(e&&e.mobile):'';const last=rows[rows.length-1];
    window.open('https://wa.me/'+(ph||'')+'?text='+encodeURIComponent('Dear '+emp+', your advance statement:\n'+rows.slice(-6).map(r=>advYmLabel(r.ym)+': given '+advM(r.given)+', recovered '+advM(r.recovered)+', balance '+advM(r.close)).join('\n')+'\nBalance now: '+advM(last.close)),'_blank','noopener');};
  return h('div',null,h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Month','Opening','Given','From pay','Repaid','Written off','Closing'].map((t,i)=>h('th',{key:i,style:i?{textAlign:'right'}:null},t)))),
    h('tbody',null,rows.map(r=>h('tr',{key:r.ym},h('td',null,advYmLabel(r.ym)),...[r.open,r.given,r.salary,r.repaid,r.writeoff,r.close].map((v,i)=>h('td',{key:i,style:{textAlign:'right',fontWeight:i===5?700:400}},v?advM(v):'—'))))))),
    h('div',{style:{display:'flex',gap:6,marginTop:6}},h('button',{className:'btn btn-ghost btn-sm',onClick:print},'🖨 PDF'),h('button',{className:'btn btn-ghost btn-sm',onClick:wa},'📲 WhatsApp to employee')));
}

// ── 14 · overdue ──
function advBehind(a){if(a.status!=='Active')return null;const start=advStartYm(a),last=advYmAdd(advYmNow(),-1);if(start>last)return null;let exp=0,got=0,missed=[];
  for(let ym=start;ym<=last;ym=advYmAdd(ym,1)){const p=advPlanned(a,ym);const s=advSettledFor(a,ym);exp+=p;got+=s;if(p>0&&s<p-0.5)missed.push(ym);}
  exp=Math.min(exp,advTotal(a));const behind=Math.round(exp-Math.min(got,exp));return behind>1?{behind,missed}:null;}
// ── 11 · leavers ──
function advLeavers(sid){const E=loadEmployees(sid)||[];const L=advLoadAll(sid).filter(a=>a.status==='Active'&&(Number(a.outstanding)||0)>0);
  return E.filter(e=>e.dol||(e.status&&e.status!=='Active')).map(e=>({e,adv:L.filter(a=>a.emp===e.name)})).filter(x=>x.adv.length).map(x=>({...x,due:x.adv.reduce((t,a)=>t+(Number(a.outstanding)||0),0)}));}
function advRecoverInFinal(sid,e){const ym=e.dol?String(e.dol).slice(0,7):advYmNow();const L=advLoadAll(sid);const next=L.map(a=>{if(a.emp!==e.name||a.status!=='Active'||!(Number(a.outstanding)>0))return a;
    const keep=(Array.isArray(a.schedule)?a.schedule:[]).filter(s=>s.month<ym&&advSettledFor(a,s.month)>0);
    return advLog({...a,schedule:[...keep,{month:ym,amount:Math.round(Number(a.outstanding)||0)}]},'Full and final — whole balance '+advM(a.outstanding)+' in '+advYmLabel(ym)+' '+(a.deductFrom||'Salary').toLowerCase());});
  advSaveAll(sid,next);try{logAuditEvent(sid,{entity:'Advance',entityId:e.name,action:'Full and final',summary:'Whole advance balance set for recovery in '+advYmLabel(ym)});}catch(x){}return ym;}

// ── 15 · tie-out for a month ──
function advTieOut(sid,y,m){
  const ym=advYm(y,m);const L=advLoadAll(sid).filter(a=>a.status!=='Pending Approval'&&a.status!=='Rejected');const out=[];
  const inMonth=a=>String(a.date||'').slice(0,7)===ym;
  const cashAdv=L.filter(a=>inMonth(a)&&a.mode==='Cash').reduce((t,a)=>t+(Number(a.amount)||0),0);const dse=typeof dailySalesRowSumFor==='function'?Math.round(dailySalesRowSumFor(sid,y,m,'Advance To Employees')||0):0;
  out.push({what:'Cash advances given',a:cashAdv,b:dse,bl:'Daily Sales “Advance To Employees”'});
  const bankAdv=L.filter(a=>inMonth(a)&&a.mode==='Bank Transfer');const unlinked=bankAdv.filter(a=>!a.bankRowId);
  out.push({what:'Bank advances given',a:bankAdv.reduce((t,a)=>t+(Number(a.amount)||0),0),b:bankAdv.filter(a=>a.bankRowId).reduce((t,a)=>t+(Number(a.amount)||0),0),bl:'linked to bank statement lines',note:unlinked.length?unlinked.length+' not linked: '+unlinked.map(a=>a.emp+' '+advM(a.amount)).join(', '):''});
  const recAdv=L.reduce((t,a)=>t+Object.entries(a.settled||{}).reduce((s,[k,v])=>k===ym?s+(Number(v)||0):s,0),0);
  let fromSheets=0;try{const sw=loadSWMeta(sid),iw=loadIWMeta(sid);[sw,iw].forEach(M=>Object.entries(M||{}).forEach(([k,v])=>{if(!v||!Array.isArray(v.advanceSettledBreakdown))return;v.advanceSettledBreakdown.forEach(b=>{if((b.ym||'')===ym||(!b.ym&&String(k).endsWith('_'+y+'_'+m)))fromSheets+=Number(b.amount)||0;});}));}catch(e){}
  out.push({what:'Recovered from pay',a:recAdv,b:Math.round(fromSheets),bl:'approved Salary / Incentive Working'});
  const balAt=(cut)=>L.reduce((t,a)=>{if(String(a.date||'').slice(0,7)>=cut)return t;const after=Object.entries(a.settled||{}).reduce((s,[k,v])=>k.slice(0,7)>=cut?s+(Number(v)||0):s,0);return t+Math.max(0,Math.min(advTotal(a),(Number(a.outstanding)||0)+after));},0);
  const open=balAt(ym),close=balAt(advYmAdd(ym,1));const given=L.filter(inMonth).reduce((t,a)=>t+advTotal(a),0);const recAll=L.reduce((t,a)=>t+advSettledFor(a,ym),0);
  out.push({what:'Balance roll-forward',a:Math.round(open+given-recAll),b:Math.round(close),bl:'closing balance',note:'Opening '+advM(open)+' + given '+advM(given)+' − recovered '+advM(recAll)});
  return out;
}
// ── 16 · journal for Tally (Excel) ──
async function advTallyJournal(sid,y,m){
  await loadExcelJS();const ym=advYm(y,m);const L=advLoadAll(sid).filter(a=>a.status!=='Pending Approval'&&a.status!=='Rejected');const rows=[];
  const led=a=>'Staff Advance - '+a.emp;const end=new Date(y,m+1,0);const endIso=localIsoOf(end);
  L.forEach(a=>{if(String(a.date||'').slice(0,7)===ym)rows.push([a.date,'Payment',led(a),a.mode==='Cash'?'Cash':'Bank',Number(a.amount)||0,'Advance given'+(a.bankRef?' — ref '+a.bankRef:'')]);
    if(a.fee&&String(a.date||'').slice(0,7)===ym)rows.push([a.date,'Journal',led(a),'Interest / Fee Received',Number(a.fee)||0,'Fee on advance']);
    Object.entries(a.settled||{}).forEach(([k,v])=>{if(k.slice(0,7)!==ym||!(Number(v)>0))return;
      if(k.endsWith('-R')){(a.repaid||[]).filter(r=>String(r.date||'').slice(0,7)===ym).forEach(r=>rows.push([r.date,'Receipt',r.mode==='Cash'?'Cash':'Bank',led(a),Number(r.amount)||0,'Advance repaid by employee']));}
      else if(k.endsWith('-W'))rows.push([endIso,'Journal','Advances Written Off',led(a),Number(v)||0,'Advance written off'+((a.writtenOff||{}).reason?' — '+a.writtenOff.reason:'')]);
      else rows.push([endIso,'Journal',(a.deductFrom||'Salary')==='Incentive'?'Incentive Payable':'Salary Payable',led(a),Number(v)||0,'Advance recovered from '+(a.deductFrom||'Salary').toLowerCase()+' — '+advYmLabel(ym)]);});});
  const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet('Advance journal');ws.addRow(['Date','Voucher type','Debit ledger','Credit ledger','Amount','Narration']);ws.getRow(1).font={bold:true};
  rows.sort((p,q)=>String(p[0]).localeCompare(String(q[0]))).forEach(r=>{const row=ws.addRow([r[0]?new Date(r[0]+'T00:00:00'):'',r[1],r[2],r[3],r[4],r[5]]);row.getCell(1).numFmt='dd/mm/yyyy';row.getCell(5).numFmt='#,##0';});
  [12,12,30,30,12,50].forEach((w,i)=>{ws.getColumn(i+1).width=w;});
  const buf=await wb.xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download='Advance journal '+ADV_MON[m]+' '+y+'.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  return rows.length;
}

// ── 13 · register with ageing (all outlets) ──
function advRegisterRows(salons){
  return(salons||[]).filter(s=>s&&s.id!=null&&s.status!=='Inactive'&&advOn('advRegister',s.id)).map(s=>{const L=advLoadAll(s.id).filter(a=>a.status==='Active'&&(Number(a.outstanding)||0)>0);const now=new Date();
    const age=a=>{const d=a.date?new Date(String(a.date).slice(0,10)+'T00:00:00'):now;return(now.getFullYear()-d.getFullYear())*12+(now.getMonth()-d.getMonth());};
    const b={a:0,b:0,c:0};L.forEach(a=>{const g=age(a);const o=Number(a.outstanding)||0;if(g<3)b.a+=o;else if(g<6)b.b+=o;else b.c+=o;});
    const per={};L.forEach(a=>{per[a.emp]=(per[a.emp]||0)+1;});const multi=Object.keys(per).filter(k=>per[k]>1);const lv=advLeavers(s.id);
    return{s,list:L,total:b.a+b.b+b.c,...b,multi,leavers:lv,overdue:L.map(a=>({a,o:advBehind(a)})).filter(x=>x.o)};});
}
function AdvRegister({salons}){
  const h=React.createElement;const [open,setOpen]=useState(null);const R=advRegisterRows(salons);if(!R.length)return h('div',{className:'card',style:{fontSize:12.5,color:'var(--text3)'}},'The advance register is switched off (Controls → Advances).');
  const tot=k=>R.reduce((t,r)=>t+(Array.isArray(r[k])?r[k].length:r[k]),0);
  return h('div',null,h('div',{className:'page-title'},'💰 Advances — all outlets'),h('div',{className:'page-sub'},'Outstanding by age of the advance, people with more than one open advance, people who have left with money due, and recoveries behind plan'),
    h('div',{className:'card',style:{padding:0,overflowX:'auto'}},h('table',null,
      h('thead',null,h('tr',null,['Outlet','Outstanding','0–3 months','3–6 months','Over 6 months','More than one open','Left with dues','Behind plan',''].map((t,i)=>h('th',{key:i,style:i&&i<8?{textAlign:'right'}:null},t)))),
      h('tbody',null,R.flatMap(r=>[h('tr',{key:r.s.id},h('td',null,String(r.s.name).split('—')[0].trim()),...[r.total,r.a,r.b,r.c].map((v,i)=>h('td',{key:i,style:{textAlign:'right',color:i===3&&v?'var(--red)':undefined,fontWeight:i===0?700:400}},v?advM(v):'—')),
          ...[r.multi.length,r.leavers.length,r.overdue.length].map((v,i)=>h('td',{key:'n'+i,style:{textAlign:'right',color:v?'var(--orange,#c27711)':'var(--text3)'}},v||'—')),
          h('td',null,r.list.length>0&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setOpen(open===r.s.id?null:r.s.id)},open===r.s.id?'Hide':'List'))),
        open===r.s.id&&h('tr',{key:r.s.id+'l'},h('td',{colSpan:9},h('table',null,h('tbody',null,r.list.map(a=>{const ov=advBehind(a);return h('tr',{key:a.id},h('td',null,a.emp),h('td',null,advDmy(a.date)),h('td',{style:{textAlign:'right'}},advM(a.amount)),h('td',{style:{textAlign:'right',fontWeight:700}},advM(a.outstanding)),h('td',{style:{fontSize:12,color:'var(--red)'}},ov?advM(ov.behind)+' behind plan':''),h('td',{style:{fontSize:12,color:'var(--orange,#c27711)'}},r.leavers.some(l=>l.e.name===a.emp)?'has left':''));})))))])),
      h('tfoot',null,h('tr',null,h('td',null,h('b',null,'Total')),...['total','a','b','c'].map(k=>h('td',{key:k,style:{textAlign:'right',fontWeight:700}},advM(R.reduce((t,r)=>t+r[k],0)))),h('td',{style:{textAlign:'right'}},tot('multi')),h('td',{style:{textAlign:'right'}},tot('leavers')),h('td',{style:{textAlign:'right'}},tot('overdue')),h('td',null))))));
}

// ── the panel on the Advances screen ──
function AdvPlusPanel({salon,year,month,advances,reload}){
  const h=React.createElement;const sid=salon&&salon.id;const {toast}=useToast();const [tab,setTab]=useState('');const [emp,setEmp]=useState('');const [,t]=useState(0);
  if(sid==null)return null;const L=advLoadAll(sid);
  const T=[['statement','📄 Statement','advStatement'],['overdue','⏰ Behind plan','advOverdue'],['leavers','🚪 Leavers','advLeavers'],['tie','🧮 Month-end tie-out','advTieOut'],['register','🏢 All outlets','advRegister'],['tally','📒 Tally journal','advTally']].filter(x=>advOn(x[2],sid));
  if(!T.length)return null;const emps=[...new Set(L.map(a=>a.emp))].sort();
  const behind=L.map(a=>({a,o:advBehind(a)})).filter(x=>x.o);const lv=advOn('advLeavers',sid)?advLeavers(sid):[];
  return h('div',{className:'card',style:{marginBottom:14}},
    h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}},h('b',{style:{marginRight:6}},'💰 Advance tools'),
      T.map(([k,l])=>h('button',{key:k,className:'btn btn-sm '+(tab===k?'btn-primary':'btn-ghost'),onClick:()=>setTab(tab===k?'':k)},l+(k==='overdue'&&behind.length?' ('+behind.length+')':k==='leavers'&&lv.length?' ('+lv.length+')':'')))),
    tab==='statement'&&h('div',{style:{marginTop:10}},h('select',{className:'form-control',style:{width:'auto',marginBottom:8},value:emp,onChange:e=>setEmp(e.target.value)},h('option',{value:''},'— Choose employee —'),emps.map(n=>h('option',{key:n,value:n},n))),emp&&h(AdvStatement,{sid,emp})),
    tab==='overdue'&&h('div',{style:{marginTop:10}},!behind.length?h('div',{style:{fontSize:12.5,color:'var(--green)'}},'✓ Every advance is on plan.'):
      h('table',null,h('thead',null,h('tr',null,['Employee','Advance','Behind by','Months not recovered'].map((x,i)=>h('th',{key:i},x)))),h('tbody',null,behind.map(({a,o})=>h('tr',{key:a.id},h('td',null,a.emp),h('td',null,a.id+' · '+advM(a.amount)),h('td',{style:{color:'var(--red)',fontWeight:700}},advM(o.behind)),h('td',{style:{fontSize:12}},o.missed.map(advYmLabel).join(', '))))))),
    tab==='leavers'&&h('div',{style:{marginTop:10}},!lv.length?h('div',{style:{fontSize:12.5,color:'var(--green)'}},'✓ Nobody who has left still owes an advance.'):
      lv.map(x=>h('div',{key:x.e.id,style:{display:'flex',gap:8,alignItems:'center',borderTop:'1px solid var(--border)',padding:'6px 0',flexWrap:'wrap'}},h('div',{style:{flex:'1 1 220px'}},h('b',null,x.e.name),h('div',{style:{fontSize:11.5,color:'var(--text3)'}},(x.e.dol?'Leaving '+advDmy(x.e.dol):x.e.status)+' · '+x.adv.length+' advance(s)')),h('b',{style:{color:'var(--red)'}},advM(x.due)),
        h('button',{className:'btn btn-primary btn-sm',onClick:()=>{if(!window.confirm('Recover the whole balance '+advM(x.due)+' of '+x.e.name+' in the final '+(x.e.dol?advYmLabel(String(x.e.dol).slice(0,7)):'this month')+' pay?'))return;advRecoverInFinal(sid,x.e);reload&&reload();toast('Set for recovery in the final pay — if the pay does not cover it, write off the rest (needs approval)','success');t(z=>z+1);}},'Recover in final pay'))),
      h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'Final salary and incentive are used; anything they can’t cover can be written off from ⋯ on the advance (needs Super Admin approval).')),
    tab==='tie'&&h('div',{style:{marginTop:10}},h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:6}},ADV_MON[month]+' '+year),h('table',null,h('thead',null,h('tr',null,['Check','Advances sheet','Compared with','',''].map((x,i)=>h('th',{key:i},x)))),
      h('tbody',null,advTieOut(sid,year,month).map((r,i)=>{const ok=Math.abs(r.a-r.b)<1;return h('tr',{key:i},h('td',null,r.what,r.note?h('div',{style:{fontSize:11,color:'var(--text3)'}},r.note):null),h('td',{style:{textAlign:'right'}},advM(r.a)),h('td',{style:{textAlign:'right'}},advM(r.b)),h('td',{style:{fontSize:11.5,color:'var(--text3)'}},r.bl),h('td',{style:{fontWeight:700,color:ok?'var(--green)':'var(--red)'}},ok?'✓':'Differs by '+advM(r.a-r.b)));})))),
    tab==='register'&&h('div',{style:{marginTop:10}},h(AdvRegister,{salons:typeof salonsForCurrentUser==='function'?salonsForCurrentUser():(typeof SALONS!=='undefined'?SALONS:[])})),
    tab==='tally'&&h('div',{style:{marginTop:10,fontSize:12.5}},'Advances given, recovered, repaid and written off in '+ADV_MON[month]+' '+year+' as Tally vouchers (debit / credit ledgers, one row each).',
      h('div',{style:{marginTop:6}},h('button',{className:'btn btn-primary btn-sm',onClick:()=>advTallyJournal(sid,year,month).then(n=>toast(n+' voucher row(s) exported','success')).catch(e=>toast('Could not export: '+(e.message||e),'error'))},'⬇ Advance journal (Excel)'))));
}

// ── ⋯ on each advance ──
function AdvMoreButton({sid,a,reload}){
  const h=React.createElement;const [open,setOpen]=useState(false);
  const any=['advSkipMonth','advChangePlan','advRepaid','advSplit','advAck','advFee','advWriteOff','advStatement','advPhoneRequest'].some(k=>advOn(k,sid));if(!any)return null;
  return h(React.Fragment,null,h('button',{className:'btn btn-ghost btn-sm',style:{padding:'4px 8px',fontSize:11},title:'More for this advance',onClick:()=>setOpen(true)},'⋯'),open&&h(AdvMoreModal,{sid,id:a.id,onClose:()=>{setOpen(false);reload&&reload();}}));
}
function AdvMoreModal({sid,id,onClose}){
  const h=React.createElement;const {toast}=useToast();const [,t]=useState(0);const a=advLoadAll(sid).find(x=>x.id===id);const [f,setF]=useState({skip:advYmNow(),from:advYmNow(),monthly:'',reason:'',ramt:'',rdate:localIsoOf(new Date()),rmode:'Cash',rref:'',sal:'',inc:'',feeKind:'pct',fee:'',wo:''});
  if(!a)return null;const act=a.status==='Active'&&(Number(a.outstanding)||0)>0;const done=(ok,msg)=>{if(ok){toast(msg,'success');t(x=>x+1);}};
  const sec=(title,ctl,...kids)=>advOn(ctl,sid)&&h('div',{style:{borderTop:'1px solid var(--border)',padding:'10px 0'}},h('div',{style:{fontWeight:600,fontSize:13,marginBottom:6}},title),...kids);
  const row=(...k)=>h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}},...k);const inp=(k,ph,type,w)=>h('input',{className:'form-control',type:type||'text',style:{width:w||130,padding:'4px 6px'},placeholder:ph,value:f[k],onChange:e=>setF({...f,[k]:e.target.value})});
  const plan=(Array.isArray(a.schedule)&&a.schedule.length?a.schedule:act?advMaterialize(a,advYmNow()):[]).filter(s=>s.month>=advYmAdd(advYmNow(),-1));
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:620,maxWidth:'96vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},a.emp+' — advance '+a.id),
    h('div',{style:{fontSize:12.5,color:'var(--text2)',marginBottom:6}},advM(a.amount)+(a.fee?' + fee '+advM(a.fee):'')+' given '+advDmy(a.date)+' · outstanding '+advM(a.outstanding)+' · '+a.status+' · from '+(a.deductFrom||'Salary')),
    plan.length>0&&h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:6}},'Plan: '+plan.map(s=>advYmLabel(s.month)+' '+advM(s.amount)).join(' · ')),
    act&&sec('⏸ Skip a month','advSkipMonth',row(h('input',{type:'month',className:'form-control',style:{width:'auto',padding:'4px 6px'},value:f.skip,onChange:e=>setF({...f,skip:e.target.value})}),inp('reason','Reason (illness, festival …)','text',220),
      h('button',{className:'btn btn-primary btn-sm',onClick:()=>{const r=advSkipMonth(sid,id,f.skip,f.reason.trim());if(!r){toast('Nothing planned in '+advYmLabel(f.skip),'error');return;}done(true,advYmLabel(f.skip)+' moved to '+advYmLabel(advYmAdd(f.skip,1)));}},'Move to next month'))),
    act&&sec('✏ Change the plan','advChangePlan',row('From',h('input',{type:'month',className:'form-control',style:{width:'auto',padding:'4px 6px'},value:f.from,onChange:e=>setF({...f,from:e.target.value})}),inp('monthly','₹ a month','number',110),inp('reason','Reason','text',180),
      h('button',{className:'btn btn-primary btn-sm',onClick:()=>{const r=advChangePlan(sid,id,f.from,f.monthly,f.reason.trim());if(!r){toast('Enter the monthly amount','error');return;}done(true,'Plan changed — the old plan is kept in the history');}},'Change'))),
    act&&sec('💵 Repaid by the employee','advRepaid',row(inp('ramt','₹','number',100),h('input',{type:'date',className:'form-control',style:{width:150,padding:'4px 6px'},value:f.rdate,onChange:e=>setF({...f,rdate:e.target.value})}),
      h('select',{className:'form-control',style:{width:'auto',padding:'4px 6px'},value:f.rmode,onChange:e=>setF({...f,rmode:e.target.value})},['Cash','UPI','Bank Transfer'].map(m=>h('option',{key:m},m))),inp('rref','Ref','text',110),
      h('button',{className:'btn btn-primary btn-sm',onClick:()=>{const r=advRepaid(sid,id,f.ramt,f.rdate,f.rmode,f.rref);if(!r){toast('Enter the amount','error');return;}done(true,'Recorded — the plan is shortened'+(f.rmode==='Cash'?'. Enter the cash in Daily Sales → Cash Received too':''));}},'Record')),
      h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:4}},'Cash taken at the counter: also enter it in Daily Sales & Exp → Cash Received so the cash balance matches.')),
    act&&!Object.keys(a.settled||{}).length&&sec('🔀 Split between salary and incentive','advSplit',row(inp('sal','₹/month from salary','number',150),inp('inc','₹/month from incentive','number',160),
      h('button',{className:'btn btn-primary btn-sm',onClick:()=>{const e=advSplit(sid,id,f.sal,f.inc);if(e){toast(e,'error');return;}done(true,'Split into two linked advances');onClose();}},'Split'))),
    sec('🧾 Acknowledgement','advAck',row(h('button',{className:'btn btn-ghost btn-sm',onClick:()=>advPrintAck(sid,a)},'🖨 Print to sign'),
      h('label',{className:'btn btn-ghost btn-sm',style:{cursor:'pointer'}},a.ackFile?'📎 Replace signed copy':'📎 Attach signed copy',h('input',{type:'file',accept:'image/*,.pdf',style:{display:'none'},onChange:e=>{const fl=e.target.files&&e.target.files[0];e.target.value='';if(!fl)return;
        readFileAsAttachment(fl,rec=>{advUpdate(sid,id,x=>advLog({...x,ackFile:rec},'Signed acknowledgement attached'));done(true,'Signed copy attached');},err=>toast(err==='size'?'File too large (max 4MB)':'Could not read the file','error'));}})),
      a.ackFile&&a.ackFile.dataUrl&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>downloadAttachment(a.ackFile,'Advance '+a.id)},'⬇ Signed copy'))),
    a.source==='phone'&&a.status!=='Pending Approval'&&sec('📲 Tell the employee','advPhoneRequest',row(h('button',{className:'btn btn-ghost btn-sm',onClick:()=>advTellWhatsApp(sid,a)},'WhatsApp the decision'))),
    act&&sec('➕ Fee / interest','advFee',row(h('select',{className:'form-control',style:{width:'auto',padding:'4px 6px'},value:f.feeKind,onChange:e=>setF({...f,feeKind:e.target.value})},h('option',{value:'pct'},'% of outstanding'),h('option',{value:'flat'},'Flat ₹')),inp('fee',f.feeKind==='pct'?'%':'₹','number',90),
      h('button',{className:'btn btn-primary btn-sm',onClick:()=>{const r=advAddFee(sid,id,f.feeKind,f.fee);if(!r){toast('Enter the fee','error');return;}done(true,'Fee added to the balance');}},'Add'))),
    act&&sec('🗑 Write off the balance','advWriteOff',row(inp('wo','Reason','text',260),h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>{if(!f.wo.trim()){toast('Give the reason','error');return;}if(!window.confirm('Write off '+advM(a.outstanding)+' of '+a.emp+'? It goes to “Advances written off” in the P&L.'))return;if(advWriteOff(sid,id,f.wo.trim()))done(true,'Written off');}},'Write off')),
      h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:4}},'Needs Super Admin approval (Controls → Approvals).')),
    sec('📄 Statement','advStatement',h(AdvStatement,{sid,emp:a.emp})),
    Array.isArray(a.planLog)&&a.planLog.length>0&&h('div',{style:{borderTop:'1px solid var(--border)',padding:'10px 0',fontSize:12}},h('div',{style:{fontWeight:600,marginBottom:4}},'History'),a.planLog.slice().reverse().map((x,i)=>h('div',{key:i,style:{color:'var(--text2)'}},new Date(x.at).toLocaleString('en-GB',DMY_DT)+' · '+x.what+(x.by?' · '+x.by:'')))),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-primary',onClick:onClose},'Close'))));
}

// ── "Adjust now" (Salary Working → Next Month Adv): confirm before an advance given next month is
// pulled into this month's salary (Controls → advPullConfirm), and mark the deduction as pulled
// forward (Controls → advPullNote). ──
const ADV_PULL_MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
function advPullDmy(iso){return iso?String(iso).slice(0,10).split('-').reverse().join('/'):'';}
function advPullYmLabel(ym){const p=String(ym||'').split('-');return p.length===2?ADV_PULL_MON[Number(p[1])-1]+' '+p[0]:String(ym||'');}
// The advances "Adjust now" would pull: given next month, on or before the cutoff, still due.
function advPullList(sid,empName,y,m,cutoff){
  let all=[];try{all=JSON.parse(cachedLocalGet(outletKey('salonos_advances',sid))||'[]')||[];}catch(e){}
  const n=new Date(y,m+1,1);const nk=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0');
  return all.map(a=>typeof advFixed==='function'?advFixed(a):a).filter(a=>a&&a.emp===empName&&a.status==='Active'&&(a.deductFrom||'Salary')==='Salary'&&String(a.date||'').slice(0,7)===nk&&(!cutoff||a.date<=cutoff)&&(Number(a.outstanding)||0)>0)
    .map(a=>({id:a.id,date:a.date,amount:Number(a.outstanding)||0,plan:(Array.isArray(a.schedule)?a.schedule:[]).filter(s=>Number(s.amount)>0).map(s=>advPullYmLabel(s.month)+' ₹'+(Number(s.amount)||0).toLocaleString('en-IN'))}));
}
function advPullConfirmOk(sid,empName,y,m,cutoff){
  if(!(typeof controlOn==='function'&&controlOn('advPullConfirm',sid)))return true;
  const L=advPullList(sid,empName,y,m,cutoff);if(!L.length)return true;const tot=L.reduce((s,a)=>s+a.amount,0);const nxt=ADV_PULL_MON[(m+1)%12];
  const ok=window.confirm('Take ₹'+tot.toLocaleString('en-IN')+' off '+empName+'’s '+ADV_PULL_MON[m]+' '+y+' salary?\n\n'+
    L.map(a=>'• ₹'+a.amount.toLocaleString('en-IN')+' given on '+advPullDmy(a.date)+(a.plan.length?' — planned: '+a.plan.join(', '):'')).join('\n')+
    '\n\nThis advance was given in '+nxt+'. It will be deducted from '+ADV_PULL_MON[m]+'’s salary instead of its planned month. To undo, untick “Adjust now” before '+ADV_PULL_MON[m]+'’s salary is approved.');
  if(!ok&&typeof controlHit==='function')controlHit('advPullConfirm',sid,'b');return ok;
}
// Shown inside the "Adjust now" box: what would be pulled.
function AdvPullPreview({sid,empName,y,m,cutoff}){
  const h=React.createElement;const L=advPullList(sid,empName,y,m,cutoff);
  if(!L.length)return h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:12}},'No '+ADV_PULL_MON[(m+1)%12]+' advance dated on or before this date.');
  const tot=L.reduce((s,a)=>s+a.amount,0);
  return h('div',{style:{fontSize:12,marginBottom:12,padding:'8px 10px',borderRadius:'var(--r)',background:'rgba(224,165,48,0.12)',border:'1px solid rgba(224,165,48,0.4)'}},
    h('div',{style:{fontWeight:600,marginBottom:4}},'₹'+tot.toLocaleString('en-IN')+' will come off '+empName+'’s '+ADV_PULL_MON[m]+' salary:'),
    L.map(a=>h('div',{key:a.id},'• ₹'+a.amount.toLocaleString('en-IN')+' given on '+advPullDmy(a.date)+(a.plan.length?' — planned for '+a.plan.join(', '):''))));
}
// Under the Adv Adj amount on Salary Working.
function advPullNote(sid,meta,nextMonthName){
  if(!meta||!meta.nextAdvPull||!(typeof controlOn==='function'&&controlOn('advPullNote',sid)))return null;
  const b=Array.isArray(meta.nextAdvPullBreakdown)?meta.nextAdvPullBreakdown:[];const amt=b.reduce((s,x)=>s+(Number(x.amount)||0),0);if(!amt)return null;
  return React.createElement('div',{title:'Pulled forward with “Adjust now” (advances dated up to '+advPullDmy(meta.nextAdvPullDate)+'). Untick “Adjust now” under Next Month Adv to deduct it in its own month instead.',
    style:{fontSize:9.5,color:'#b26a00',marginTop:2,whiteSpace:'nowrap'}},'incl. ₹'+amt.toLocaleString('en-IN')+' pulled forward from '+nextMonthName);
}
