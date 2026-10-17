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
function salPayOf(e){const o={};SAL_PAY_FIELDS.forEach(k=>{o[k]=Number(e[k])||0;});return o;}
function salPickEntry(hist,ym){let pick=null;(hist||[]).forEach(r=>{if(r&&(r.from==null||r.from<=ym)){if(!pick||String(r.from||'')>=String(pick.from||''))pick=r;}});return pick;}
// The employee as paid in that month (used by getEmployeesForMonth).
function salPayFor(e,y,m,sid){
  if(!e||!Array.isArray(e.payHistory)||!e.payHistory.length||!salRevOn(sid))return e;
  const r=salPickEntry(e.payHistory,salYm(y,m));if(!r)return e;
  const o={...e};SAL_PAY_FIELDS.forEach(k=>{if(r[k]!==undefined)o[k]=Number(r[k])||0;});o.payFrom=r.from;return o;
}
// Arrears paid in this month (Salary Working adds them to net pay).
function salArrearsFor(sid,e,y,m){if(!e||!Array.isArray(e.arrears)||!salArrOn(sid))return 0;const ym=salYm(y,m);return Math.round(e.arrears.filter(a=>a&&a.payYm===ym).reduce((s,a)=>s+(Number(a.amount)||0),0));}
function salArrearsLines(e,y,m){const ym=salYm(y,m);return(e&&Array.isArray(e.arrears)?e.arrears:[]).filter(a=>a&&a.payYm===ym);}
function salPayChanged(prev,emp){return!!prev&&SAL_PAY_FIELDS.some(k=>Math.round(Number(prev[k])||0)!==Math.round(Number(emp[k])||0));}
function salRevNeeded(sid,prev,emp){return salRevOn(sid)&&salPayChanged(prev,emp);}
function salLocked(sid,ym){const p=salYmParts(ym);return typeof isMonthLockedFor==='function'&&isMonthLockedFor(sid,p.y,p.m);}
// First month (from the joining month, at most 36 months back) that isn't locked.
function salFirstOpen(sid,e){const now=salNowYm();let ym=e&&e.doj?String(e.doj).slice(0,7):salYmAdd(now,-36);if(ym<salYmAdd(now,-36))ym=salYmAdd(now,-36);while(ym<now&&salLocked(sid,ym))ym=salYmAdd(ym,1);return ym;}
// What a change from `fromYm` does: which month it really starts, and the arrears for locked months.
function salPlan(sid,prev,emp,fromYm){
  let start=fromYm;const locked=[];while(salLocked(sid,start)){locked.push(start);start=salYmAdd(start,1);}
  const arrears=[];
  if(salArrOn(sid))locked.forEach(ym=>{const p=salYmParts(ym);const old=salPayFor(prev,p.y,p.m,sid);const dim=new Date(p.y,p.m+1,0).getDate();
    let days=dim;try{const w=(swWorkingsFor(sid,p.y,p.m)||[]).find(x=>String(x.id)===String(prev.id));if(w)days=Number(w.totalDays)||0;}catch(e){}
    const amt=Math.round(((Number(emp.gross)||0)-(Number(old.gross)||0))/dim*days);if(amt)arrears.push({forYm:ym,payYm:start,amount:amt,days,dim,oldGross:Number(old.gross)||0,newGross:Number(emp.gross)||0});});
  return{start,locked,arrears};
}
// The record to save: history + arrears added, and the master's own pay = this month's pay.
function salApplyChange(sid,prev,emp,fromYm,reason){
  const plan=salPlan(sid,prev,emp,fromYm);const who=(typeof currentSessionUser==='function'&&(currentSessionUser()||{}).name)||'';const at=new Date().toISOString();
  let hist=Array.isArray(prev.payHistory)&&prev.payHistory.length?prev.payHistory.slice():[{from:null,...salPayOf(prev),at:prev.createdAt||null,by:'',reason:'Pay before the first recorded change'}];
  hist=hist.filter(r=>r.from!==plan.start);hist.push({from:plan.start,...salPayOf(emp),at,by:who,reason:reason||''});hist.sort((a,b)=>String(a.from||'').localeCompare(String(b.from||'')));
  const arrears=[...(Array.isArray(prev.arrears)?prev.arrears.filter(a=>!plan.arrears.some(n=>n.forYm===a.forYm&&n.payYm===a.payYm)):[]),...plan.arrears.map(a=>({...a,at,by:who}))];
  const rec={...emp,payHistory:hist,arrears};const now=salNowYm();const cur=salPickEntry(hist,now);if(cur)SAL_PAY_FIELDS.forEach(k=>{rec[k]=Number(cur[k])||0;});
  return{rec,plan};
}
// Brings the master's own pay up to this month (a scheduled change whose month has come).
function salApplyDue(sid){
  try{if(!salRevOn(sid))return 0;const L=loadEmployees(sid)||[];const now=salNowYm();let n=0;
    const next=L.map(e=>{if(!Array.isArray(e.payHistory)||!e.payHistory.length)return e;const r=salPickEntry(e.payHistory,now);if(!r)return e;
      if(SAL_PAY_FIELDS.every(k=>Math.round(Number(e[k])||0)===Math.round(Number(r[k])||0)))return e;n++;const o={...e};SAL_PAY_FIELDS.forEach(k=>{o[k]=Number(r[k])||0;});return o;});
    if(n){saveEmployees(next,sid);try{logAuditEvent(sid,{entity:'Employee',entityId:'pay',action:'Scheduled pay change applied',summary:n+' employee(s) — from '+salYmLabel(now)});}catch(e){}}
    return n;}catch(e){return 0;}
}
setTimeout(()=>{try{(typeof SALONS!=='undefined'?SALONS:[]).forEach(s=>s&&s.id!=null&&salApplyDue(s.id));}catch(e){}},5000);

// ── “Takes effect from” window, shown when pay is changed in Master Salary ──
function SalRevModal({sid,prev,emp,onDone}){
  const h=React.createElement;const now=salNowYm();
  const [mode,setMode]=useState('from');const [from,setFrom]=useState(salYmAdd(now,1));const [reason,setReason]=useState('');
  const fromYm=mode==='fix'?salFirstOpen(sid,prev):(from||now);
  const plan=salPlan(sid,prev,emp,fromYm);const old=salPayOf(prev),nw=salPayOf(emp);const arrTot=plan.arrears.reduce((s,a)=>s+a.amount,0);
  const row=(l,a,b)=>h('tr',{key:l},h('td',{style:{fontSize:12.5,padding:'3px 8px'}},l),h('td',{style:{textAlign:'right',padding:'3px 8px'}},salM(a)),h('td',{style:{textAlign:'right',padding:'3px 8px',fontWeight:a!==b?700:400,color:a!==b?'var(--accent)':undefined}},salM(b)));
  const save=()=>{if(mode==='from'&&!/^\d{4}-\d{2}$/.test(from)){window.alert('Pick the month the new pay starts.');return;}onDone(salApplyChange(sid,prev,emp,fromYm,reason.trim()));};
  return h('div',{className:'modal-overlay',onClick:()=>onDone(null)},h('div',{className:'modal',style:{width:560,maxWidth:'96vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'Pay change — '+(emp.name||'')),
    h('table',{style:{width:'100%',marginBottom:10}},h('thead',null,h('tr',null,h('th',null,''),h('th',{style:{textAlign:'right'}},'Now'),h('th',{style:{textAlign:'right'}},'New'))),
      h('tbody',null,row('Basic',old.basic,nw.basic),row('HRA',old.hra,nw.hra),row('Conveyance',old.conv,nw.conv),row('Special',old.special,nw.special),row('Gross (monthly salary)',old.gross,nw.gross))),
    h('label',{style:{display:'flex',gap:8,alignItems:'center',fontSize:13,marginBottom:6}},h('input',{type:'radio',checked:mode==='from',onChange:()=>setMode('from')}),'New pay takes effect from',
      h('input',{type:'month',className:'form-control',style:{width:'auto',padding:'3px 6px'},value:from,disabled:mode!=='from',onChange:e=>setFrom(e.target.value)})),
    h('label',{style:{display:'flex',gap:8,alignItems:'center',fontSize:13,marginBottom:10}},h('input',{type:'radio',checked:mode==='fix',onChange:()=>setMode('fix')}),'It was a typing mistake — correct it for every month that isn’t locked'),
    h('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'8px 12px',fontSize:12.5,lineHeight:1.6,marginBottom:10}},
      fromYm>now?h('div',null,'📅 Scheduled — '+salM(old.gross)+' stays until '+salYmLabel(salYmAdd(fromYm,-1))+'; '+salM(nw.gross)+' from '+salYmLabel(fromYm)+'. It is applied by itself when that month comes.')
        :h('div',null,'New pay from '+salYmLabel(plan.start)+' onwards'+(plan.start<now?' (months not locked are worked out again with the new pay)':'')+'.'),
      plan.locked.length>0&&h('div',null,'🔒 Locked month'+(plan.locked.length>1?'s':'')+' '+plan.locked.map(salYmLabel).join(', ')+' keep'+(plan.locked.length>1?'':'s')+' the old pay.'),
      plan.locked.length>0&&(salArrOn(sid)
        ?h('div',null,plan.arrears.length?('💰 Arrears '+salM(arrTot)+' added to '+salYmLabel(plan.start)+' salary: '+plan.arrears.map(a=>salYmLabel(a.forYm)+' '+salM(a.amount)+' ('+a.days+'/'+a.dim+' days)').join(', ')):'No arrears (no payable days in those months).')
        :h('div',{style:{color:'var(--text3)'}},'Arrears are switched off (Controls → Arrears for back-dated pay changes) — pay the difference separately if due.'))),
    h('div',{className:'form-group'},h('label',null,'Reason (optional — goes to the pay history)'),h('input',{className:'form-control',value:reason,onChange:e=>setReason(e.target.value),placeholder:'e.g. Annual increment'})),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:()=>onDone(null)},'Cancel'),h('button',{className:'btn btn-primary',onClick:save},'Save pay change'))));
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
  const paidLocked=ym=>{const p=salYmParts(ym);return typeof isMonthLockedFor==='function'&&isMonthLockedFor(sid,p.y,p.m);};
  return h('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:14,marginTop:12}},
    h('div',{style:{fontSize:11,fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}},'Pay history'),
    hist.map((r,i)=>h('div',{key:i,style:{display:'flex',gap:8,alignItems:'center',fontSize:12.5,padding:'4px 0',borderTop:i?'1px solid var(--border)':'none'}},
      h('span',{style:{width:110,color:'var(--text2)'}},r.from?'From '+salYmLabel(r.from):'Earlier'),h('b',{style:{width:90,textAlign:'right'}},salM(r.gross)),
      h('span',{style:{flex:1,color:'var(--text3)',fontSize:11.5}},[r===cur?'current':r.from&&r.from>now?'scheduled':'',r.reason,r.by].filter(Boolean).join(' · ')),
      r.from&&r.from>now&&h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>removeRev(r)},'Remove'))),
    arr.length>0&&h('div',{style:{fontSize:11,fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',margin:'10px 0 4px'}},'Arrears'),
    arr.map((a,i)=>h('div',{key:'a'+i,style:{display:'flex',gap:8,alignItems:'center',fontSize:12.5,padding:'3px 0'}},
      h('span',{style:{flex:1}},'For '+salYmLabel(a.forYm)+' · paid in '+salYmLabel(a.payYm)+' salary'+(a.days?' · '+a.days+'/'+a.dim+' days':'')),h('b',null,salM(a.amount)),
      !paidLocked(a.payYm)&&h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>removeArr(a)},'Remove'))));
}
// Small line under the employee's name in Master Salary when a change is scheduled.
function salScheduledLabel(sid,e){if(!salRevOn(sid)||!e||!Array.isArray(e.payHistory))return'';const now=salNowYm();const f=e.payHistory.filter(r=>r.from&&r.from>now).sort((a,b)=>a.from.localeCompare(b.from))[0];return f?'📈 '+salM(f.gross)+' from '+salYmLabel(f.from):'';}
