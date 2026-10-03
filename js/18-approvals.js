// ── Monthly Incentive Plan + approvals ──────────────────────────────────────────────────────────
// 1. Monthly Incentive Plan (Incentive Working → Monthly Plan): the Salon Owner or ASM prepares the
//    month's plan — Service / Membership / Product / Manager Target incentive rules and targets, set
//    under ⚙ Incentive Rules & Settings (optionally copied from the previous month's approved plan)
//    — and submits it; the Owner or ASM (not the one who prepared it; Super Admin may approve any)
//    approves it. The approved plan is a snapshot of those settings for that month only: Incentive
//    Working for the month is worked out from it automatically, later changes to the settings don't
//    alter it, and the Salon Manager sees it (read-only) next to the Incentive Summary.
// 2. Salary / Incentive summaries sent for approval carry a separate review — status, remarks, by,
//    when — from each of Manager, Owner and ASM, listed in the Review Centre for all of them and the
//    Super Admin.

// Every per-outlet setting the monthly incentive calculation reads (group variants are
// '<key>__grp_<group>'). Per-employee actuals, rates, manual amounts and entries are not part of
// the plan — those are the month's working itself.
const INC_PLAN_BASES=['salonos_incentive_applicability','salonos_incentive_calc_mode','salonos_incentive_target_multipliers',
  'salonos_incentive_split_by_designation','salonos_incentive_plan_overrides','salonos_incentive_custom_plans',
  'salonos_service_incentive_slabs','salonos_manager_incentive_tiers','salonos_manager_incentive_inputs',
  'salonos_manager_incentive_collection_items','salonos_mgr_incentive_rule_type','salonos_mgr_incentive_rule_b',
  'salonos_mem_incentive_rule_type','salonos_mem_rule_a_settings','salonos_mem_rule_a_rows','salonos_mem_rule_b_settings',
  'salonos_mem_rule_b_rows','salonos_mem_rule_c_settings','salonos_mem_rule_c_rows','salonos_product_incentive_rule',
  'salonos_product_incentive_rule_type','salonos_product_incentive_flat_rule'];
const INC_PLAN_MAKERS=['Super Admin','Salon Owner','Owner','ASM'];
function incPlanKeyMatch(sid,key){
  if(typeof key!=='string')return false;
  const tail='_outlet_'+sid;
  for(const b of INC_PLAN_BASES){const k=b+tail;if(key===k||key.startsWith(k+'__grp_'))return true;}
  return false;
}
function lsAllKeys(){
  const out=new Set(Object.keys(_lsReadCache));
  try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k)out.add(k);}}catch(e){}
  return[...out];
}
function captureIncPlanSettings(sid){
  const s={};
  lsAllKeys().forEach(k=>{if(incPlanKeyMatch(sid,k)){const v=cachedLocalGet(k);if(v!=null)s[k]=v;}});
  return s;
}
// Puts a plan's settings back into ⚙ Incentive Rules & Settings (copy from previous month / revise).
function applyIncPlanToLive(sid,settings){
  lsAllKeys().forEach(k=>{if(incPlanKeyMatch(sid,k)&&!(k in settings)&&cachedLocalGet(k)!=null&&cachedLocalGet(k)!=='null')safeLocalSet(k,'null');});
  Object.entries(settings||{}).forEach(([k,v])=>{if(incPlanKeyMatch(sid,k))safeLocalSet(k,v);});
}
const incPlanYm=(y,m)=>y+'-'+String(m+1).padStart(2,'0');
function loadIncPlans(sid){try{return JSON.parse(cachedLocalGet(outletKey('salonos_incentive_monthly_plans',sid))||'{}')||{};}catch(e){return{};}}
function saveIncPlans(sid,map){safeLocalSet(outletKey('salonos_incentive_monthly_plans',sid),JSON.stringify(map));}
function incPlanFor(sid,y,m){return loadIncPlans(sid)[incPlanYm(y,m)]||null;}
function approvedIncPlanFor(sid,y,m){const p=incPlanFor(sid,y,m);return p&&p.status==='Approved'?p:null;}
// Runs fn with the given settings standing in for the live ones (reads only).
function withIncSettings(sid,settings,fn){
  const prev=_lsOverlay;
  _lsOverlay={match:k=>incPlanKeyMatch(sid,k),get:k=>Object.prototype.hasOwnProperty.call(settings,k)?settings[k]:null};
  try{return fn();}finally{_lsOverlay=prev;}
}
function withIncPlan(sid,y,m,fn){
  const p=approvedIncPlanFor(sid,y,m);
  return p?withIncSettings(sid,p.settings||{},fn):fn();
}
function roleTag(role){return role==='Salon Manager'?'Manager':(role==='Salon Owner'||role==='Owner')?'Owner':role||'';}
function submitIncPlan(sid,y,m,user,copiedFrom){
  const map=loadIncPlans(sid),k=incPlanYm(y,m);
  map[k]={status:'Pending',settings:captureIncPlanSettings(sid),preparedBy:user?.name||'',preparedRole:roleTag(user?.role),preparedAt:new Date().toISOString(),
    copiedFrom:copiedFrom||(map[k]&&map[k].copiedFrom)||'',approvedBy:'',approvedRole:'',approvedAt:'',remarks:''};
  saveIncPlans(sid,map);
  try{logAuditEvent(sid,{entity:'Incentive Plan',entityId:k,action:'Submitted',summary:'Incentive plan for '+k+' submitted for approval'});}catch(e){}
  return map[k];
}
function canApproveIncPlan(user,plan){
  if(!user||!plan||plan.status!=='Pending')return false;
  if(user.role==='Super Admin')return true;
  if(!['Salon Owner','Owner','ASM'].includes(user.role))return false;
  return plan.preparedBy!==user.name; // the other of Owner / ASM approves
}
function decideIncPlan(sid,y,m,decision,user,remarks){
  const map=loadIncPlans(sid),k=incPlanYm(y,m);const p=map[k];if(!p)return null;
  map[k]={...p,status:decision,approvedBy:decision==='Approved'?(user?.name||''):'',approvedRole:decision==='Approved'?roleTag(user?.role):'',
    approvedAt:decision==='Approved'?new Date().toISOString():'',remarks:remarks||'',decidedBy:user?.name||'',decidedRole:roleTag(user?.role),decidedAt:new Date().toISOString()};
  saveIncPlans(sid,map);
  try{logAuditEvent(sid,{entity:'Incentive Plan',entityId:k,action:decision,summary:'Incentive plan for '+k+' '+decision.toLowerCase()+(remarks?' — '+remarks:'')});}catch(e){}
  return map[k];
}
// Plain-words summary of a plan's settings, read through the same loaders the calculation uses.
function incPlanSummary(sid,y,m,settings){
  return withIncSettings(sid,settings||{},()=>{
    const pct=v=>(Math.round(Number(v)*100)/100)+'%';
    const tm=loadTargetMultipliers(sid);
    const split=loadIncentiveSplitMode(sid)||{};
    const slabs=loadServiceSlabs(sid);
    const svc=slabs.map((t,i)=>i===0?'below '+(slabs[1]&&slabs[1].threshold)+'× → '+pct(t.rate):t.threshold+'× and above → '+pct(t.rate)).join(' · ');
    const memType=loadMemRuleType(sid);
    const memS=memType==='A'?loadMemRuleASettings(sid):memType==='B'?loadMemRuleBSettings(sid):loadMemRuleCSettings(sid);
    const memTxt='Rule '+memType+' — '+Object.entries(memS).map(([k,v])=>k.replace(/([A-Z])/g,' $1').toLowerCase()+' '+v).join(', ');
    const prodType=loadProdRuleType(sid);
    const prodTxt=prodType==='B'?'Flat ₹'+(Number(loadProductFlatRule(sid).amount)||0).toLocaleString('en-IN')+' per employee':pct(loadProductIncentiveRule(sid).rate)+' of product sales';
    const mgrType=loadMgrRuleType(sid);
    const tiers=loadMgrIncentiveTiers(sid);
    let mgrIn={};try{mgrIn=(loadMgrIncentiveInputsAll(sid)||{})[y+'_'+m]||{};}catch(e){}
    const mgrTxt=(mgrType==='A'?'Rule A — achievement tiers: '+tiers.map(t=>t.threshold+'% → '+pct(t.rate)).join(', '):'Rule B')+
      (mgrIn.targetCollection?' · target collection ₹'+Number(mgrIn.targetCollection).toLocaleString('en-IN'):' · target collection not set');
    const sp=c=>split[c]?' (set per designation)':'';
    return[
      ['Targets (× monthly salary)','Service '+tm.svc+'× · Membership '+tm.mem+'× · Product '+tm.prod+'×'],
      ['Service Incentive'+sp('service'),svc],
      ['Membership Incentive'+sp('membership'),memTxt],
      ['Product Incentive'+sp('product'),prodTxt],
      ['Manager Target Incentive',mgrTxt]];
  });
}
function IncPlanSummaryCard({sid,y,m,plan,title}){
  const h=React.createElement;
  const rows=incPlanSummary(sid,y,m,plan.settings);
  const badge=plan.status==='Approved'?'badge-green':plan.status==='Returned'?'badge-red':plan.status==='Pending'?'badge-amber':'badge-blue';
  return h('div',{className:'card',style:{marginBottom:14}},
    h('div',{style:{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:10}},
      h('div',{className:'card-title',style:{margin:0}},title||'Incentive Plan'),
      h('span',{className:'badge '+badge},plan.status==='Pending'?'⏳ Waiting for approval':plan.status==='Approved'?'✓ Approved':plan.status==='Returned'?'↩ Returned':plan.status),
      h('span',{style:{fontSize:11.5,color:'var(--text3)'}},'Prepared by '+(plan.preparedBy||'—')+(plan.preparedRole?' ('+plan.preparedRole+')':'')+(plan.preparedAt?' on '+fmtDMY(plan.preparedAt.slice(0,10)):'')+(plan.copiedFrom?' · copied from '+plan.copiedFrom:'')),
      plan.status==='Approved'&&h('span',{style:{fontSize:11.5,color:'var(--text3)'}},'· Approved by '+(plan.approvedBy||'—')+(plan.approvedRole?' ('+plan.approvedRole+')':'')+(plan.approvedAt?' on '+fmtDMY(plan.approvedAt.slice(0,10)):''))),
    plan.remarks&&h('div',{style:{fontSize:12,color:plan.status==='Returned'?'var(--red)':'var(--text2)',marginBottom:8}},'Remarks: '+plan.remarks),
    h('table',null,h('tbody',null,rows.map(([k,v])=>h('tr',{key:k},h('td',{style:{fontWeight:600,whiteSpace:'nowrap',verticalAlign:'top',width:220}},k),h('td',{style:{fontSize:12.5}},v))))));
}
function MonthlyIncentivePlanSheet({salon,period,user,onOpenRules}={}){
  const h=React.createElement;
  const {success,error:toastErr}=useToast();
  const sid=salon?.id;
  const init=periodToCalendar(period);
  const [cal,setCal]=useState(init||{year:new Date().getFullYear(),month:new Date().getMonth()});
  useEffect(()=>{const c=periodToCalendar(period);if(c)setCal(c);
    // eslint-disable-next-line
  },[period&&period.mi,period&&period.fy]);
  const [tick,setTick]=useState(0);
  const [remarks,setRemarks]=useState('');
  const [copyPrev,setCopyPrev]=useState(false);
  const plan=incPlanFor(sid,cal.year,cal.month);
  const pd=new Date(cal.year,cal.month-1,1);const prevPlan=approvedIncPlanFor(sid,pd.getFullYear(),pd.getMonth());
  const label=['January','February','March','April','May','June','July','August','September','October','November','December'][cal.month]+' '+cal.year;
  const prevLabel=['January','February','March','April','May','June','July','August','September','October','November','December'][pd.getMonth()]+' '+pd.getFullYear();
  const maker=user&&INC_PLAN_MAKERS.includes(user.role);
  const locked=isIWEffectiveLockedFor(sid,cal.year,cal.month);
  const editable=maker&&!locked&&(!plan||plan.status==='Draft'||plan.status==='Returned');
  const shift=k=>{const d=new Date(cal.year,cal.month+k,1);setCal({year:d.getFullYear(),month:d.getMonth()});setCopyPrev(false);};
  const doCopy=(on)=>{
    setCopyPrev(on);
    if(on&&prevPlan){applyIncPlanToLive(sid,prevPlan.settings||{});success(prevLabel+'’s approved plan copied into ⚙ Incentive Rules & Settings — change anything needed there, then submit.');setTick(t=>t+1);}
  };
  const submit=()=>{
    if(!window.confirm('Submit the current ⚙ Incentive Rules & Settings as the '+label+' Incentive Plan for approval?'))return;
    submitIncPlan(sid,cal.year,cal.month,user,copyPrev&&prevPlan?prevLabel:'');setTick(t=>t+1);setCopyPrev(false);
    success(label+' plan sent for approval to the Owner / ASM');
  };
  const decide=d=>{
    if(d==='Returned'&&!remarks.trim()){toastErr('Add a remark saying what to change.');return;}
    decideIncPlan(sid,cal.year,cal.month,d,user,remarks.trim());setRemarks('');setTick(t=>t+1);
    success(d==='Approved'?label+' plan approved — Incentive Working for the month now uses it':label+' plan returned');
  };
  const revise=()=>{
    if(locked){toastErr(label+' Incentive Working is locked — unlock it first.');return;}
    if(!window.confirm('Revise the approved '+label+' plan? It goes back to Draft (Incentive Working uses the current settings until it is approved again) and its settings are loaded into ⚙ Incentive Rules & Settings.'))return;
    const map=loadIncPlans(sid);const k=incPlanYm(cal.year,cal.month);applyIncPlanToLive(sid,map[k].settings||{});
    map[k]={...map[k],status:'Draft'};saveIncPlans(sid,map);setTick(t=>t+1);
  };
  return h('div',null,
    h('div',{className:'section-header'},
      h('div',null,h('div',{className:'page-title'},'Monthly Incentive Plan'),
        h('div',{className:'page-sub'},'Service, Membership, Product and Manager Target incentive for '+label+' — prepared by the Owner or ASM, approved by the other; Incentive Working uses the approved plan')),
      h('div',{className:'fd-date'},h('button',{onClick:()=>shift(-1)},'‹'),h('span',{className:'lbl'},label),h('button',{onClick:()=>shift(1)},'›'))),
    !plan&&h('div',{className:'help-note',style:{marginBottom:12}},'No plan for '+label+' yet — Incentive Working uses the current ⚙ Incentive Rules & Settings until a plan is approved.'),
    plan&&h(IncPlanSummaryCard,{sid,y:cal.year,m:cal.month,plan,title:'Plan for '+label}),
    plan&&plan.status==='Pending'&&canApproveIncPlan(user,plan)&&h('div',{className:'card',style:{marginBottom:14}},
      h('div',{className:'form-group'},h('label',null,'Remarks'),h('textarea',{className:'form-control',rows:2,value:remarks,onChange:e=>setRemarks(e.target.value),placeholder:'Required when returning'})),
      h('div',{style:{display:'flex',gap:8}},h('button',{className:'btn btn-success',onClick:()=>decide('Approved')},'✓ Approve plan'),h('button',{className:'btn btn-danger',onClick:()=>decide('Returned')},'↩ Return'))),
    plan&&plan.status==='Pending'&&!canApproveIncPlan(user,plan)&&maker&&h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:12}},'Waiting for the '+(plan.preparedRole==='ASM'?'Owner':'ASM / Owner')+' to approve.'),
    editable&&h('div',{className:'card',style:{marginBottom:14}},
      h('div',{className:'card-title'},plan&&plan.status==='Returned'?'Correct and resubmit':'Prepare the plan'),
      h('label',{style:{display:'flex',gap:8,alignItems:'center',fontSize:13,marginBottom:10,cursor:prevPlan?'pointer':'not-allowed',opacity:prevPlan?1:0.55}},
        h('input',{type:'checkbox',checked:copyPrev,disabled:!prevPlan,onChange:e=>doCopy(e.target.checked)}),
        'Copy plan from previous month ('+prevLabel+')'+(prevPlan?'':' — no approved plan for that month')),
      h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:10}},'Set the rules and targets in ⚙ Incentive Rules & Settings (Service rate slabs, Membership rule, Product rule, Manager tiers and target collection), then submit. The plan is saved exactly as the settings stand when you submit.'),
      h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        onOpenRules&&h('button',{className:'btn btn-ghost',onClick:onOpenRules},'⚙ Open Incentive Rules & Settings'),
        h('button',{className:'btn btn-primary',onClick:submit},'📤 Submit '+label+' plan for approval'))),
    plan&&plan.status==='Approved'&&maker&&!locked&&h('button',{className:'btn btn-ghost btn-sm',onClick:revise},'✏ Revise approved plan'),
    !maker&&!plan&&h('div',{style:{fontSize:12,color:'var(--text3)'}},'The Owner / ASM hasn’t set this month’s plan yet.'));
}

// ── Per-role reviews on Salary / Incentive summaries ──
const SUMMARY_REVIEW_ROLES=['Manager','Owner','ASM'];
function SummaryReviewChips({rec}){
  const h=React.createElement;
  const rv=(rec&&rec.reviews)||{};
  return h('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},[...SUMMARY_REVIEW_ROLES,...(rv['Super Admin']?['Super Admin']:[])].map(r=>{
    const x=rv[r];const col=!x?'var(--text3)':x.status==='Approved'?'var(--green)':'var(--red)';
    return h('span',{key:r,title:x?(x.by+' · '+new Date(x.at).toLocaleString('en-IN')+(x.remarks?' · '+x.remarks:'')):'Not reviewed yet',
      style:{fontSize:11,padding:'2px 8px',borderRadius:12,border:'1px solid '+col,color:col,whiteSpace:'nowrap'}},
      r+': '+(!x?'pending':x.status==='Approved'?'✓ approved':'↩ returned'));}));
}
function SummaryApprovalsPanel({user,salons}){
  const h=React.createElement;
  const {success,error:toastErr}=useToast();
  const [tick,setTick]=useState(0);
  const [note,setNote]=useState({});
  const [open,setOpen]=useState(null);
  const myTag=roleTag(user&&user.role);
  const reviewer=['Manager','Owner','ASM'].includes(myTag);
  const MS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const list=[];const plans=[];
  (salons||[]).filter(s=>s&&userCanSeeOutlet(user,s.id)).forEach(s=>{
    ['salary','incentive'].forEach(sheet=>{
      const map=loadSummaryApprovals(s.id,sheet);
      Object.entries(map).forEach(([code,rec])=>{if(rec&&rec.sentAt)list.push({s,sheet,code,rec});});
    });
    Object.entries(loadIncPlans(s.id)).forEach(([ym,p])=>{if(p&&p.status==='Pending')plans.push({s,ym,p});});
  });
  list.sort((a,b)=>String(b.rec.sentAt).localeCompare(String(a.rec.sentAt)));
  const ymOf=code=>{const p=String(code).split('-');return{y:Number(p[0]),m:Number(p[1])-1};};
  const monthLabel=code=>{const {y,m}=ymOf(code);return MS[m]+' '+y;};
  const decide=(it,d)=>{
    const key=it.s.id+'|'+it.sheet+'|'+it.code;const r=(note[key]||'').trim();
    if(d==='Returned'&&!r){toastErr('Add a remark explaining why it is returned.');return;}
    const {y,m}=ymOf(it.code);
    decideSummaryApproval(it.s.id,it.sheet,y,m,d,user&&user.name,r,user&&user.role);
    setNote(n=>({...n,[key]:''}));setTick(t=>t+1);
    success((it.sheet==='salary'?'Salary':'Incentive')+' summary '+(d==='Approved'?'approved':'returned'));
  };
  if(!list.length&&!plans.length)return null;
  return h('div',{className:'card',style:{marginBottom:16}},
    h('div',{className:'card-title'},'Salary & Incentive approvals'),
    plans.length>0&&h('div',{style:{marginBottom:12}},plans.map(({s,ym,p})=>h('div',{key:s.id+ym,style:{fontSize:12.5,padding:'6px 0',borderBottom:'1px solid var(--border)'}},
      '📋 Incentive plan for '+monthLabel(ym)+' — '+String(s.name).split('—')[0].trim()+' — prepared by '+p.preparedBy+' ('+p.preparedRole+'), waiting for approval. Open the outlet → Incentive Working → Monthly Plan.'))),
    list.length>0&&h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,['Outlet','Month','Sheet','Total','Sent','Reviews (Manager / Owner / ASM)','Overall',''].map((t,i)=>h('th',{key:i},t)))),
      h('tbody',null,list.slice(0,60).map(it=>{
        const key=it.s.id+'|'+it.sheet+'|'+it.code;const rec=it.rec;const mine=reviewer&&rec.reviews&&rec.reviews[myTag];
        const canAct=reviewer&&!mine&&rec.status!=='Returned';
        return h(React.Fragment,{key},
          h('tr',null,
            h('td',{style:{fontWeight:600,whiteSpace:'nowrap'}},String(it.s.name).split('—')[0].trim()),
            h('td',{style:{whiteSpace:'nowrap'}},monthLabel(it.code)),
            h('td',null,it.sheet==='salary'?'Salary':'Incentive'),
            h('td',{style:{textAlign:'right'}},'₹'+Math.round(rec.total||0).toLocaleString('en-IN')),
            h('td',{style:{fontSize:11.5,whiteSpace:'nowrap'}},fmtDMY(String(rec.sentAt).slice(0,10))+' · '+(rec.sentBy||'—')),
            h('td',null,h(SummaryReviewChips,{rec}),
              Object.entries(rec.reviews||{}).filter(([,x])=>x&&x.remarks).map(([r,x])=>h('div',{key:r,style:{fontSize:11.5,color:x.status==='Returned'?'var(--red)':'var(--text2)',marginTop:3}},r+' ('+x.by+'): '+x.remarks))),
            h('td',null,h('span',{className:'badge '+(rec.status==='Approved'?'badge-green':rec.status==='Returned'?'badge-red':'badge-amber')},rec.status==='Sent'?'Pending':rec.status)),
            h('td',{style:{whiteSpace:'nowrap'}},h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setOpen(open===key?null:key)},open===key?'Hide':'View'))),
          open===key&&h('tr',null,h('td',{colSpan:8,style:{background:'var(--bg3)'}},
            h('div',{className:'table-wrap',style:{maxHeight:260,overflowY:'auto',marginBottom:canAct?10:0}},h('table',null,
              h('thead',null,h('tr',null,h('th',null,'Employee'),h('th',{style:{textAlign:'right'}},it.sheet==='salary'?'Net salary':'Total incentive'))),
              h('tbody',null,(rec.rows||[]).map((r,i)=>h('tr',{key:i},h('td',null,r.name,h('span',{style:{fontSize:10.5,color:'var(--text3)',marginLeft:6}},r.desig||'')),
                h('td',{style:{textAlign:'right'}},'₹'+Math.round(Number(it.sheet==='salary'?(r.net!=null?r.net:r.total):r.total)||0).toLocaleString('en-IN'))))))),
            canAct&&h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
              h('input',{className:'form-control',style:{flex:1,minWidth:220},placeholder:'Remarks ('+myTag+') — required to return',value:note[key]||'',onChange:e=>setNote(n=>({...n,[key]:e.target.value}))}),
              h('button',{className:'btn btn-success btn-sm',onClick:()=>decide(it,'Approved')},'✓ Approve'),
              h('button',{className:'btn btn-danger btn-sm',onClick:()=>decide(it,'Returned')},'↩ Return')),
            mine&&h('div',{style:{fontSize:12,color:'var(--text3)'}},'You ('+myTag+') '+(mine.status==='Approved'?'approved':'returned')+' this on '+new Date(mine.at).toLocaleString('en-IN')+'.'))));
      })))));
}
