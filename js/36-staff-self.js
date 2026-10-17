// ═════════════════════════════════════════════════════════════════════════════════════════════
// Staff self-service on the outlet phone (Attendance → 📲 Staff phone screen) and advance recovery:
//   • Leave requests — staff ask for leave on the phone; the manager approves in Attendance and the
//     days are marked (paid leave from the balance when chosen).            Controls → leaveRequests
//   • My incentive — a stylist sees this month's sales, target and expected incentive (PIN = last
//     4 digits of their mobile).                                            Controls → staffIncentiveView
//   • Advance recovery plan — outstanding, monthly recovery, payoff month per employee, and a warning
//     when the deduction leaves too little net pay.     Controls → advanceRecoveryPlan / advanceNetFloor
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ── Leave requests ──
function leaveReqKey(sid){return outletKey('salonos_leave_requests',sid);}
function loadLeaveRequests(sid){try{const v=JSON.parse(cachedLocalGet(leaveReqKey(sid))||'[]');return Array.isArray(v)?v:[];}catch(e){return[];}}
function saveLeaveRequests(sid,list){safeLocalSet(leaveReqKey(sid),JSON.stringify((list||[]).slice(-600)));}
function leaveDates(from,to){const out=[];const a=new Date(from+'T00:00:00'),b=new Date((to||from)+'T00:00:00');if(isNaN(a)||isNaN(b)||b<a)return out;
  for(let d=new Date(a);d<=b&&out.length<62;d.setDate(d.getDate()+1))out.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));return out;}
function addLeaveRequest(sid,req){const list=loadLeaveRequests(sid);const r={id:'LR'+Date.now()+Math.random().toString(36).slice(2,5),status:'pending',at:new Date().toISOString(),...req,days:leaveDates(req.from,req.to).length};
  saveLeaveRequests(sid,[...list,r]);try{logAuditEvent(sid,{entity:'Leave',entityId:r.id,action:'Requested',summary:r.name+' — '+r.from+(r.to&&r.to!==r.from?' to '+r.to:'')+' ('+r.kind+')'});}catch(e){}return r;}

// Attendance: pending requests — approve marks the days (absent; paid leave from the balance when asked for).
function LeaveRequestsPanel({salon,locked,setAttStore,monthKey}){
  const h=React.createElement;const sid=salon&&salon.id;const [open,setOpen]=useState(false);const [,setT]=useState(0);
  if(sid==null||!controlOn('leaveRequests',sid))return null;
  const list=loadLeaveRequests(sid);const pend=list.filter(r=>r.status==='pending');const recent=list.filter(r=>r.status!=='pending').slice(-8).reverse();
  const u=currentSessionUser();const canDecide=u&&(u.role==='Super Admin'||typeof userCanEditSheet!=='function'||userCanEditSheet(u,sid,'attendance'));
  const decide=(r,ok)=>{
    let note='';if(!ok){note=window.prompt('Reason for rejecting (shown on the phone screen):','');if(note==null)return;}
    else{if(locked){window.alert('This month is locked — unlock it before approving leave.');return;}
      const dates=leaveDates(r.from,r.to);const byMonth={};dates.forEach(iso=>{const y=+iso.slice(0,4),m=+iso.slice(5,7)-1,d=+iso.slice(8,10);(byMonth[y+'|'+m]=byMonth[y+'|'+m]||{y,m,days:[]}).days.push(d);});
      setAttStore(prev=>{const next={...prev};Object.values(byMonth).forEach(g=>{const e=(getEmployeesForMonth(g.y,g.m,sid)||[]).find(z=>String(z.id)===String(r.empId));if(!e)return;
        const k=monthKey(e.id,g.y,g.m);const cur=next[k]||{days:genAttDay(e,g.y,g.m),adjustment:0};const days=[...cur.days];let marked=0;
        g.days.forEach(d=>{if(days[d-1]==='off'||days[d-1]==='holiday')return;days[d-1]='absent';marked++;});
        let paid=Number(cur.paidLeave)||0;if(r.kind==='Paid leave'&&controlOn('paidLeave',sid)&&typeof leaveBalanceFor==='function'){const bal=leaveBalanceFor(sid,e,g.y,g.m);paid=Math.min(paid+marked,paid+Math.max(0,bal.available-paid));}
        next[k]={...cur,days,paidLeave:paid};});return next;});}
    saveLeaveRequests(sid,loadLeaveRequests(sid).map(z=>z.id===r.id?{...z,status:ok?'approved':'rejected',decidedBy:(u&&u.name)||'',decidedAt:new Date().toISOString(),note}:z));
    try{logAuditEvent(sid,{entity:'Leave',entityId:r.id,action:ok?'Approved':'Rejected',summary:r.name+' — '+r.from+(r.to&&r.to!==r.from?' to '+r.to:'')+(note?' — '+note:'')});}catch(e){}
    setT(t=>t+1);};
  const fmt=iso=>iso?iso.split('-').reverse().join('/'):'';
  return h('div',{style:{marginBottom:12}},
    h('button',{className:'btn btn-sm '+(pend.length?'btn-primary':'btn-ghost'),onClick:()=>setOpen(o=>!o)},'📝 Leave requests'+(pend.length?' ('+pend.length+' waiting)':'')),
    open&&h('div',{className:'card',style:{marginTop:8}},
      !pend.length?h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No leave requests waiting. Staff ask for leave on the 📲 Staff phone screen.')
      :pend.map(r=>h('div',{key:r.id,style:{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',padding:'8px 0',borderBottom:'1px solid var(--border)'}},
        h('div',{style:{flex:1,minWidth:200,fontSize:13}},h('b',null,r.name),' — ',fmt(r.from),r.to&&r.to!==r.from?' to '+fmt(r.to):'',' · ',r.days+' day'+(r.days===1?'':'s'),' · ',h('span',{style:{color:r.kind==='Paid leave'?'var(--green)':'var(--text2)'}},r.kind),
          r.reason&&h('div',{style:{fontSize:12,color:'var(--text3)'}},'“'+r.reason+'”')),
        canDecide&&h('button',{className:'btn btn-primary btn-sm',onClick:()=>decide(r,true)},'Approve'),
        canDecide&&h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>decide(r,false)},'Reject'))),
      recent.length>0&&h('div',{style:{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',margin:'10px 0 4px'}},'Decided recently'),
      recent.map(r=>h('div',{key:r.id,style:{fontSize:12,color:'var(--text2)',padding:'2px 0'}},r.name+' · '+fmt(r.from)+(r.to&&r.to!==r.from?'–'+fmt(r.to):'')+' · '+(r.status==='approved'?'✓ approved':'✗ rejected'+(r.note?' ('+r.note+')':''))+' by '+(r.decidedBy||'—'))),
      h('div',{style:{fontSize:11,color:'var(--text3)',marginTop:8}},'Approving marks the days Absent (week-offs and holidays stay); a “Paid leave” request also fills the Paid leave column from the employee’s balance.')));
}

// ── My incentive (this month, live) ──
function staffIncentiveFor(sid,empId,year,month){
  const rows=typeof incWorkingsFor==='function'?incWorkingsFor(sid,year,month)||[]:[];const r=rows.find(z=>String(z.id)===String(empId));if(!r)return null;
  const inc=(Number(r.svcIncAmt)||0)+(Number(r.prodIncAmt)||0)+(Number(r.memIncAmt)||0)+(Number(r.mgrIncAmt)||0);
  const today=new Date();const dim=new Date(year,month+1,0).getDate();const elapsed=today.getFullYear()===year&&today.getMonth()===month?today.getDate():dim;
  const act=Number(r.totalActual)||0,tgt=Number(r.totalTarget)||0;
  return{name:r.name,svc:Number(r.svcActual)||0,prod:Number(r.prodActual)||0,mem:Number(r.memActual)||0,total:act,target:tgt,pct:tgt>0?Math.round(act/tgt*100):null,
    incentive:Math.round(inc),perDayNeeded:tgt>act&&elapsed<dim?Math.round((tgt-act)/(dim-elapsed)):0,daysLeft:dim-elapsed};
}

// The outlet phone screen: leave request + my incentive (shown under the check-in when those controls are on).
function StaffSelfService({salon}){
  const h=React.createElement;const {toast}=useToast();const sid=salon&&salon.id;
  const lrOn=controlOn('leaveRequests',sid),siOn=controlOn('staffIncentiveView',sid);
  const today=new Date();const emps=(getEmployeesForMonth(today.getFullYear(),today.getMonth(),sid)||[]).filter(e=>e.status!=='Inactive');
  const iso=today.toISOString().slice(0,10);
  const [who,setWho]=useState('');const [mode,setMode]=useState('');const [lr,setLr]=useState({from:iso,to:iso,kind:'Paid leave',reason:''});const [pin,setPin]=useState('');const [shown,setShown]=useState(null);const [,setT]=useState(0);
  const arOn=controlOn('advPhoneRequest',sid);
  if(!lrOn&&!siOn&&!arOn)return null;
  const e=emps.find(z=>String(z.id)===String(who));const m=n=>'₹'+Math.round(n).toLocaleString('en-IN');
  const mine=e?loadLeaveRequests(sid).filter(r=>String(r.empId)===String(e.id)).slice(-4).reverse():[];
  const send=()=>{if(!e){toast('Choose your name first','error');return;}if(!lr.from){toast('Choose the first day','error');return;}if(lr.to&&lr.to<lr.from){toast('The last day is before the first day','error');return;}
    addLeaveRequest(sid,{empId:e.id,name:e.name,from:lr.from,to:lr.to||lr.from,kind:lr.kind,reason:lr.reason.trim()});toast('Leave request sent to the manager','success');setLr({from:iso,to:iso,kind:'Paid leave',reason:''});setMode('');setT(t=>t+1);};
  const showInc=()=>{if(!e){toast('Choose your name first','error');return;}const mob=String(e.mobile||e.phone||'').replace(/\D/g,'');
    if(mob.length>=4&&pin!==mob.slice(-4)){toast('Wrong PIN — it is the last 4 digits of your mobile number','error');return;}
    setShown(staffIncentiveFor(sid,e.id,today.getFullYear(),today.getMonth()));setPin('');};
  return h('div',{className:'card',style:{maxWidth:460,marginTop:14}},
    h('div',{style:{fontWeight:700,marginBottom:8}},'👤 For staff'),
    h('select',{className:'form-control',style:{fontSize:16,padding:10,marginBottom:10},value:who,onChange:ev=>{setWho(ev.target.value);setShown(null);setMode('');}},h('option',{value:''},'— Choose your name —'),emps.map(z=>h('option',{key:z.id,value:z.id},z.name))),
    h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
      lrOn&&h('button',{className:'btn '+(mode==='leave'?'btn-primary':'btn-ghost'),style:{flex:1,justifyContent:'center'},onClick:()=>{setMode(mode==='leave'?'':'leave');setShown(null);}},'📝 Ask for leave'),
      siOn&&h('button',{className:'btn '+(mode==='inc'?'btn-primary':'btn-ghost'),style:{flex:1,justifyContent:'center'},onClick:()=>{setMode(mode==='inc'?'':'inc');setShown(null);}},'💰 My incentive')),
    arOn&&e&&typeof AdvPhoneRequest==='function'&&h(AdvPhoneRequest,{sid,emp:e}),
    mode==='leave'&&h('div',{style:{marginTop:10,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}},
      h('label',{style:{fontSize:12,color:'var(--text3)'}},'From',h('input',{type:'date',className:'form-control',value:lr.from,onChange:ev=>setLr({...lr,from:ev.target.value})})),
      h('label',{style:{fontSize:12,color:'var(--text3)'}},'To',h('input',{type:'date',className:'form-control',value:lr.to,onChange:ev=>setLr({...lr,to:ev.target.value})})),
      h('label',{style:{fontSize:12,color:'var(--text3)',gridColumn:'1 / -1'}},'Type',h('select',{className:'form-control',value:lr.kind,onChange:ev=>setLr({...lr,kind:ev.target.value})},['Paid leave','Unpaid leave'].map(k=>h('option',{key:k},k)))),
      h('label',{style:{fontSize:12,color:'var(--text3)',gridColumn:'1 / -1'}},'Reason (optional)',h('input',{className:'form-control',value:lr.reason,onChange:ev=>setLr({...lr,reason:ev.target.value})})),
      h('button',{className:'btn btn-primary',style:{gridColumn:'1 / -1',justifyContent:'center'},onClick:send},'Send to the manager')),
    mode==='leave'&&mine.length>0&&h('div',{style:{marginTop:8,fontSize:12,color:'var(--text2)'}},mine.map(r=>h('div',{key:r.id},r.from.split('-').reverse().join('/')+(r.to!==r.from?'–'+r.to.split('-').reverse().join('/'):'')+' · '+(r.status==='pending'?'⏳ waiting':r.status==='approved'?'✓ approved':'✗ not approved'+(r.note?' — '+r.note:''))))),
    mode==='inc'&&!shown&&h('div',{style:{marginTop:10,display:'flex',gap:8}},h('input',{type:'password',inputMode:'numeric',maxLength:4,className:'form-control',placeholder:'PIN — last 4 digits of your mobile',value:pin,onChange:ev=>setPin(ev.target.value.replace(/\D/g,''))}),
      h('button',{className:'btn btn-primary',onClick:showInc},'Show')),
    mode==='inc'&&shown&&h('div',{style:{marginTop:10}},
      h('div',{style:{fontSize:13,marginBottom:6}},h('b',null,shown.name),' — '+RPT_MONTHS[today.getMonth()]+' so far'),
      h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,fontSize:13}},
        h('div',null,'Services'),h('b',{style:{textAlign:'right'}},m(shown.svc)),h('div',null,'Products'),h('b',{style:{textAlign:'right'}},m(shown.prod)),
        shown.mem>0&&h('div',null,'Memberships'),shown.mem>0&&h('b',{style:{textAlign:'right'}},m(shown.mem)),
        h('div',null,'Total / target'),h('b',{style:{textAlign:'right'}},m(shown.total)+(shown.target?' / '+m(shown.target):'')),
        h('div',null,'Expected incentive'),h('b',{style:{textAlign:'right',color:'var(--green)',fontSize:16}},m(shown.incentive))),
      shown.pct!=null&&h('div',{style:{height:8,borderRadius:6,background:'var(--bg3)',overflow:'hidden',margin:'8px 0'}},h('div',{style:{height:'100%',width:Math.min(100,shown.pct)+'%',background:shown.pct>=100?'var(--green)':'#2f5fe0'}})),
      shown.perDayNeeded>0&&h('div',{style:{fontSize:12,color:'var(--text2)'}},'To reach the target: about '+m(shown.perDayNeeded)+' a day for the '+shown.daysLeft+' day(s) left.'),
      h('div',{style:{fontSize:11,color:'var(--text3)',marginTop:6}},'Estimate from the sales entered so far; the final amount is in Incentive Working at month end.'),
      typeof IncPlanForMe==='function'&&e&&h(IncPlanForMe,{sid,emp:e,y:today.getFullYear(),m:today.getMonth()}),
      h('button',{className:'btn btn-ghost btn-sm',style:{marginTop:6},onClick:()=>{setShown(null);setWho('');setMode('');}},'Done')));
}

// ── Advance recovery plan ──
function advancePlanFor(sid,year,month){
  const adv=(loadAdvances(sid)||[]).filter(a=>a&&a.status==='Active'&&(Number(a.outstanding)||0)>0);const by={};
  adv.forEach(a=>{const e=by[a.emp]=by[a.emp]||{name:a.emp,outstanding:0,advances:[]};e.outstanding+=Number(a.outstanding)||0;e.advances.push(a);});
  return Object.values(by).map(e=>{const left=e.advances.map(a=>({a,o:Number(a.outstanding)||0}));let payoff=null,thisMonth=0,noPlan=false;
    for(let k=0;k<48;k++){const d=new Date(year,month+k,1);const y=d.getFullYear(),m=d.getMonth();let got=0;
      left.forEach(z=>{if(z.o<=0)return;const sc=typeof scheduledAmountFor==='function'?scheduledAmountFor(z.a,y,m):null;const planned=sc!==null?sc:(Number(z.a.repayment)||0);const ded=Math.min(planned,z.o);z.o-=ded;got+=ded;});
      if(k===0)thisMonth=got;if(left.every(z=>z.o<=0.5)){payoff={y,m};break;}if(k===0&&got===0&&e.advances.every(a=>!(Number(a.repayment)>0)&&!(Array.isArray(a.schedule)&&a.schedule.length)))noPlan=true;}
    const leftAfter=Math.round(left.reduce((t,z)=>t+Math.max(0,z.o),0));const schedEnds=!payoff&&leftAfter>0&&left.filter(z=>z.o>0.5).every(z=>Array.isArray(z.a.schedule)&&z.a.schedule.length);
    return{...e,outstanding:Math.round(e.outstanding),thisMonth:Math.round(thisMonth),payoff,noPlan,schedEnds,leftAfter};}).sort((a,b)=>b.outstanding-a.outstanding);
}
function AdvanceRecoveryPlan({salon,year,month}){
  const h=React.createElement;const sid=salon&&salon.id;const [open,setOpen]=useState(false);
  if(sid==null||!controlOn('advanceRecoveryPlan',sid))return null;
  const plan=advancePlanFor(sid,year,month);if(!plan.length)return null;const m=n=>'₹'+Math.round(n).toLocaleString('en-IN');
  const floorOn=controlOn('advanceNetFloor',sid);const floor=controlLimit('advanceNetFloor',sid)||40;
  let sw=[];if(floorOn){try{sw=swWorkingsFor(sid,year,month)||[];}catch(e){sw=[];}}
  const warnOf=p=>{if(!floorOn)return'';const w=sw.find(z=>z.name===p.name);if(!w)return'';const gross=(Number(w.grossAfterLop)||0)+(Number(w.totalIncSW)||0);if(!(gross>0))return'';
    const pct=Math.round((Number(w.net)||0)/gross*100);return pct<floor?'Net pay only '+pct+'% of earnings (floor '+floor+'%) — reduce this month’s recovery':'';};
  const warns=plan.filter(p=>warnOf(p)).length;const tot=plan.reduce((t,p)=>t+p.outstanding,0);
  return h('div',{className:'card',style:{marginBottom:14}},
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap',cursor:'pointer'},onClick:()=>setOpen(o=>!o)},
      h('div',null,h('b',null,'📅 Advance recovery plan'),h('span',{style:{fontSize:12.5,color:'var(--text3)',marginLeft:8}},plan.length+' employee(s) · '+m(tot)+' outstanding'+(warns?' · ':'')),warns>0&&h('span',{style:{fontSize:12.5,color:'var(--red)',fontWeight:600}},warns+' net-pay warning(s)')),
      h('span',{style:{fontSize:12,color:'var(--text3)'}},open?'▴ Hide':'▾ Show')),
    open&&h('div',{className:'table-wrap',style:{marginTop:8}},h('table',null,
      h('thead',null,h('tr',null,['Employee','Outstanding','Recovery in '+RPT_MONTHS[month].slice(0,3),'Paid off by',''].map((t,i)=>h('th',{key:i,style:i&&i<3?{textAlign:'right'}:null},t)))),
      h('tbody',null,plan.map(p=>{const w=warnOf(p);return h('tr',{key:p.name},h('td',{style:{fontWeight:600}},p.name),h('td',{style:{textAlign:'right'}},m(p.outstanding)),h('td',{style:{textAlign:'right'}},p.thisMonth?m(p.thisMonth):'—'),
        h('td',null,p.noPlan?h('span',{style:{color:'var(--orange)'}},'No recovery set'):p.schedEnds?h('span',{style:{color:'var(--orange)'}},'Schedule ends with '+m(p.leftAfter)+' still due — extend it'):p.payoff?RPT_MONTHS[p.payoff.m]+' '+p.payoff.y:h('span',{style:{color:'var(--red)'}},'Over 4 years at this rate')),
        h('td',{style:{fontSize:12,color:'var(--red)'}},w));})))),
    open&&h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'From each Active advance’s monthly schedule (or its flat repayment). '+(floorOn?'Net-pay warning: net pay below '+floor+'% of salary + incentive this month.':'Turn on the net-pay floor in Master Settings → 🎛 Controls to be warned when a recovery leaves too little pay.')));
}
