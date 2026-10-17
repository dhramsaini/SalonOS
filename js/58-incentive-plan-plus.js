// ═════════════════════════════════════════════════════════════════════════════════════════════
// Monthly Incentive Plan made easier to follow (Incentive Working → Monthly Plan). Nothing here
// changes how incentive is calculated; each item has its own switch in Controls → Salary & staff →
// Incentive Plan:
//   ipWords plain-words plan · ipPeriod dates it applies to · ipDiff changes from last month ·
//   ipGroups one card per plan / designation · ipTimeline status steps · ipDrift rules changed after
//   approval · ipInUse "plan in use" chip on Incentive Working · ipWizard step-by-step preparing ·
//   ipCost cost estimate on last month's sales · ipChecklist approver checklist + ready remarks ·
//   ipNotes a reason for each change · ipStaffSheet print / WhatsApp sheet per employee ·
//   ipStaffPhone plan on the staff phone screen · ipReminder plan not approved by the 25th.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const IP_MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
function ipOn(id,sid){return typeof controlOn==='function'&&controlOn(id,sid);}
function ipLim(id,d,sid){const v=typeof controlLimit==='function'?Number(controlLimit(id,sid)):0;return v>0?v:d;}
function ipM(n){return '₹'+Math.round(Number(n)||0).toLocaleString('en-IN');}
function ipP(v){return(Math.round((Number(v)||0)*100)/100)+'%';}
function ipX(v){return(Math.round((Number(v)||0)*100)/100)+'×';}
function ipYm(y,m){return y+'-'+String(m+1).padStart(2,'0');}
function ipLabel(y,m){return IP_MON[m]+' '+y;}
function ipPrev(y,m){const d=new Date(y,m-1,1);return{y:d.getFullYear(),m:d.getMonth()};}
function ipDmy(iso){return iso?String(iso).slice(0,10).split('-').reverse().join('/'):'';}
const IP_CAT={service:'Service',membership:'Membership',product:'Product',manager:'Manager'};
function ipEmps(sid,y,m){try{return(getEmployeesForMonth(y,m,sid)||[]).filter(e=>e.desig!=='Helper'&&e.desig!=='Housekeeper');}catch(e){return[];}}
// The settings the screen is about: the plan's saved copy once submitted, else today's ⚙ Rules.
function ipShownSettings(sid,plan){return plan&&(plan.status==='Pending'||plan.status==='Approved')?(plan.settings||{}):captureIncPlanSettings(sid);}
function ipWith(sid,settings,fn){return settings?withIncSettings(sid,settings,fn):fn();}

// ── words for each rule ──
function ipBands(slabs){const sl=slabs||[];const base=Number(sl[0]&&sl[0].rate)||0;
  const t=sl.slice(1).filter(x=>x&&x.threshold!==''&&x.threshold!=null&&!isNaN(Number(x.threshold))).map(x=>({th:Number(x.threshold),rate:Number(x.rate)||0})).sort((a,b)=>a.th-b.th);
  const out=[];const first=t.length?t[0].th:null;out.push({from:0,to:first,rate:base});t.forEach((x,i)=>out.push({from:x.th,to:i+1<t.length?t[i+1].th:null,rate:x.rate}));
  const merged=[];out.forEach(b=>{const p=merged[merged.length-1];if(p&&p.rate===b.rate){p.to=b.to;}else merged.push({...b});});return merged;}
function ipSlabTxt(slabs,salary){const B=ipBands(slabs);if(B.length===1)return ipP(B[0].rate)+' at every level';
  const v=x=>salary?ipM(x*salary)+' ('+ipX(x)+')':ipX(x)+' salary';
  return B.map((b,i)=>i===0?'below '+v(B[1].from)+': '+ipP(b.rate):'from '+v(b.from)+': '+ipP(b.rate)).join(' · ');}
function ipMemTxt(type,s,isMgr){s=s||{};
  if(type==='B')return ipM(s.incPerCard)+' per Elite card (card value '+ipM(s.valuePerCard)+' taken off first), then '+(isMgr==null?'staff '+ipP(s.staffRate)+' / managers '+ipP(s.mgrRate):isMgr?ipP(s.mgrRate):ipP(s.staffRate))+' of the rest of the membership sale'+(isMgr!==false?'; managers also share a pool of '+ipP(s.mgrShareRate)+' of staff membership sales':'');
  if(type==='C')return 'new membership '+ipP(s.newMemRate)+', wallet recharge '+ipP(s.walletRate)+(isMgr!==false?'; managers also share a pool of '+ipP(s.mgrRate)+' of staff new membership + wallet':'');
  return(isMgr==null?'staff '+ipP(s.staffRate)+' / managers '+ipP(s.mgrRate):isMgr?ipP(s.mgrRate):ipP(s.staffRate))+' of the membership sale'+(isMgr!==false?'; managers also share a pool of '+ipP(s.mgrShareRate)+' of staff membership sales':'');}
function ipMemSet(sid,type,g){return type==='B'?loadMemRuleBSettings(sid,g):type==='C'?loadMemRuleCSettings(sid,g):loadMemRuleASettings(sid,g);}
function ipProdTxt(sid,g){return loadProdRuleType(sid,g)==='B'?'flat '+ipM(loadProductFlatRule(sid,g).amount)+' to each employee, whatever they sell':ipP(loadProductIncentiveRule(sid,g).rate)+' of the product sale';}
function ipMgrTxt(sid,y,m){const type=loadMgrRuleType(sid);if(type==='B')return 'Rule B — quarterly worksheet entered by hand (not added to Total Incentive)';
  let rec={};try{rec=(loadMgrIncentiveInputsAll(sid)||{})[y+'_'+m]||{};}catch(e){}
  const tiers=loadMgrIncentiveTiers(sid).slice().sort((a,b)=>Number(a.threshold)-Number(b.threshold));
  return 'net collection (collection ÷ 1.05) against the target '+(Number(rec.targetCollection)?ipM(rec.targetCollection):'(not set yet)')+': '+tiers.map(t=>'from '+t.threshold+'% → '+ipP(t.rate)).join(', ')+' of net collection, shared by each manager’s Share %';}
function ipGroupsUsed(sid,y,m){const S=new Set();ipEmps(sid,y,m).forEach(e=>S.add(incentiveGroupFor(e,sid)));return[...S];}
function ipEmpName(sid,y,m,id){const e=ipEmps(sid,y,m).find(x=>String(x.id)===String(id));return e?e.name:String(id);}

// Every rule of a plan as one line each (key, label, text) — used by the words card, the diff and the drift check.
function ipDescribe(sid,y,m,settings){
  return ipWith(sid,settings,()=>{
    const L=[];const add=(key,label,text)=>L.push({key,label,text:String(text)});
    const appl=loadIncentiveApplicability(sid);const split=loadIncentiveSplitMode(sid)||{};const used=ipGroupsUsed(sid,y,m);
    const off=Object.keys(IP_CAT).filter(k=>!appl[k]);
    add('appl','Paid this month',off.length?Object.keys(IP_CAT).filter(k=>appl[k]).map(k=>IP_CAT[k]).join(', ')+' (not: '+off.map(k=>IP_CAT[k]).join(', ')+')':'Service, Membership, Product and Manager');
    const cm=loadIncentiveCalcMode(sid);const cmName={auto:'Automatic',manualRate:'Manual Rate %',manualAmt:'Manual Amount ₹'};
    add('calc','Rate & amount source','Service '+cmName[cm.svc]+' · Membership '+cmName[cm.mem]+' · Product '+cmName[cm.prod]);
    const tm=loadTargetMultipliers(sid);add('tm','Targets (× salary)','Service '+ipX(tm.svc)+' · Membership '+ipX(tm.mem)+' · Product '+ipX(tm.prod));
    if(split.service||split.membership||split.product)used.forEach(g=>{const t=loadTargetMultipliersForGroup(sid,g);const p=[];
      if(split.service)p.push('Service '+ipX(t.svc));if(split.membership)p.push('Membership '+ipX(t.mem));if(split.product)p.push('Product '+ipX(t.prod));add('tm:'+g,'Targets — '+g,p.join(' · '));});
    if(appl.service){if(split.service)used.forEach(g=>add('svc:'+g,'Service — '+g,ipSlabTxt(loadServiceSlabs(sid,g))));else add('svc','Service',ipSlabTxt(loadServiceSlabs(sid)));}
    if(appl.membership){const type=loadMemRuleType(sid);add('memType','Membership rule','Rule '+type);
      if(split.membership)used.forEach(g=>add('mem:'+g,'Membership — '+g,ipMemTxt(type,ipMemSet(sid,type,g))));else add('mem','Membership',ipMemTxt(type,ipMemSet(sid,type)));}
    if(appl.product){if(split.product)used.forEach(g=>add('prod:'+g,'Product — '+g,ipProdTxt(sid,g)));else add('prod','Product',ipProdTxt(sid));}
    if(appl.manager){add('mgr','Manager',ipMgrTxt(sid,y,m));
      let rec={};try{rec=(loadMgrIncentiveInputsAll(sid)||{})[y+'_'+m]||{};}catch(e){}
      const sh=Object.entries(rec.shares||{}).filter(([,v])=>Number(v));if(sh.length)add('mgrShares','Manager shares',sh.map(([id,v])=>ipEmpName(sid,y,m,id)+' '+ipP(v)).join(' · '));}
    const ov=loadIncentivePlanOverrides(sid)||{};const ovL=Object.entries(ov).filter(([,v])=>v);
    add('assign','Employees on another plan',ovL.length?ovL.map(([id,v])=>ipEmpName(sid,y,m,id)+' → '+v).join(' · '):'None');
    const cp=loadIncentiveCustomPlans(sid);if(cp.length)add('custom','Custom plans',cp.join(', '));
    const sp=Object.keys(IP_CAT).filter(k=>split[k]);add('split','Split by designation',sp.length?sp.map(k=>IP_CAT[k]).join(', '):'No — one plan for everyone');
    return L;});
}
function ipDiffLines(sid,y,m,cur,prev){const A={},B={};ipDescribe(sid,y,m,prev).forEach(l=>A[l.key]=l);ipDescribe(sid,y,m,cur).forEach(l=>B[l.key]=l);
  const keys=[...new Set([...Object.keys(A),...Object.keys(B)])];
  return keys.filter(k=>(A[k]&&A[k].text)!==(B[k]&&B[k].text)).map(k=>({key:k,label:(B[k]||A[k]).label,from:A[k]?A[k].text:'—',to:B[k]?B[k].text:'—'}));}

// ── reasons for changes (ipNotes) ──
function ipNotesKey(sid){return outletKey('salonos_inc_plan_notes',sid);}
function ipNotesAll(sid){try{return JSON.parse(cachedLocalGet(ipNotesKey(sid))||'{}')||{};}catch(e){return{};}}
function ipNotesGet(sid,y,m){return ipNotesAll(sid)[ipYm(y,m)]||{};}
function ipNoteSet(sid,y,m,key,text){const A=ipNotesAll(sid);const k=ipYm(y,m);A[k]={...(A[k]||{}),[key]:text};if(!text)delete A[k][key];safeLocalSet(ipNotesKey(sid),JSON.stringify(A));}

// ── history on the plan (ipTimeline) ──
function ipAddHistory(sid,y,m,old,what,user,remarks,extra){
  try{const map=loadIncPlans(sid);const k=ipYm(y,m);if(!map[k])return;
    map[k]={...map[k],...(extra||{}),history:[...((old&&old.history)||map[k].history||[]),{what,by:(user&&user.name)||'',role:typeof roleTag==='function'?roleTag(user&&user.role):'',at:new Date().toISOString(),remarks:remarks||''}]};
    saveIncPlans(sid,map);}catch(e){}
}
if(typeof submitIncPlan==='function'){const _ipSubmit=submitIncPlan;
  submitIncPlan=function(sid,y,m,user,copiedFrom){const old=incPlanFor(sid,y,m);const r=_ipSubmit.apply(this,arguments);
    const notes=ipOn('ipNotes',sid)?ipNotesGet(sid,y,m):null;ipAddHistory(sid,y,m,old,old&&old.status==='Returned'?'Resubmitted':'Submitted',user,'',notes&&Object.keys(notes).length?{notes}:null);return incPlanFor(sid,y,m)||r;};}
if(typeof decideIncPlan==='function'){const _ipDecide=decideIncPlan;
  decideIncPlan=function(sid,y,m,decision,user,remarks){const old=incPlanFor(sid,y,m);const r=_ipDecide.apply(this,arguments);if(r)ipAddHistory(sid,y,m,old,decision,user,remarks);return incPlanFor(sid,y,m)||r;};}

// ── gates (ipWizard on submit, ipChecklist on approve) ──
const IP_STEP={},IP_CHK={};
function ipStepState(sid,y,m){const k=sid+'|'+ipYm(y,m);return IP_STEP[k]||(IP_STEP[k]={});}
function ipChkState(sid,y,m){const k=sid+'|'+ipYm(y,m);return IP_CHK[k]||(IP_CHK[k]={});}
function ipSteps(sid,y,m){const appl=loadIncentiveApplicability(sid);const S=[['start','Start: copy last month’s plan, or keep the current rules']];
  Object.keys(IP_CAT).forEach(k=>{if(appl[k])S.push([k,'Check the '+IP_CAT[k]+' rules in ⚙ Incentive Rules & Settings']);});
  if(ipOn('ipCost',sid))S.push(['cost','Look at the cost estimate']);
  if(ipOn('ipNotes',sid)&&ipOn('ipDiff',sid))S.push(['notes','Give a reason for each change']);return S;}
function ipNotesDone(sid,y,m){const p=ipPrev(y,m);const prev=approvedIncPlanFor(sid,p.y,p.m);if(!prev)return true;const D=ipDiffLines(sid,y,m,captureIncPlanSettings(sid),prev.settings||{});const N=ipNotesGet(sid,y,m);return D.every(d=>String(N[d.key]||'').trim());}
function ipStepDone(sid,y,m,k){return k==='notes'?ipNotesDone(sid,y,m):!!ipStepState(sid,y,m)[k];}
function ipSubmitOk(sid,y,m){
  if(!ipOn('ipWizard',sid))return true;const left=ipSteps(sid,y,m).filter(([k])=>!ipStepDone(sid,y,m,k));if(!left.length)return true;
  window.alert('Finish these steps before submitting:\n\n• '+left.map(x=>x[1]).join('\n• '));if(typeof controlHit==='function')controlHit('ipWizard',sid,'b');return false;}
function ipApproveOk(sid,y,m,plan){
  if(!ipOn('ipChecklist',sid))return true;const c=ipChkState(sid,y,m);const need=[];
  if(!c.changes)need.push('Look at what changed from last month');if(ipOn('ipCost',sid)&&!c.cost)need.push('Look at the cost estimate');if(plan&&plan.notes&&Object.keys(plan.notes).length&&!c.notes)need.push('Read the reasons given for the changes');
  if(!need.length)return true;window.alert('Before approving, tick:\n\n• '+need.join('\n• '));if(typeof controlHit==='function')controlHit('ipChecklist',sid,'b');return false;}

// ── cost estimate on last month's sales (ipCost) ──
function ipRuleInc(w){return(Number(w.svcIncAmt)||0)+(Number(w.memIncAmt)||0)+(Number(w.prodIncAmt)||0)+(Number(w.mgrIncAmt)||0);}
function ipCostEstimate(sid,y,m,settings,prevSettings){const p=ipPrev(y,m);
  let N=[],O=[];try{N=withIncSettings(sid,settings||{},()=>incWorkingsForLive(sid,p.y,p.m))||[];}catch(e){}
  try{O=prevSettings?(withIncSettings(sid,prevSettings,()=>incWorkingsForLive(sid,p.y,p.m))||[]):(incWorkingsFor(sid,p.y,p.m)||[]);}catch(e){}
  const OM={};O.forEach(w=>OM[w.id]=w);const rows=N.map(w=>({id:w.id,name:w.name,sales:(w.svcActual||0)+(w.memActual||0)+(w.prodActual||0),now:Math.round(ipRuleInc(w)),before:OM[w.id]?Math.round(ipRuleInc(OM[w.id])):0}));
  const now=rows.reduce((s,r)=>s+r.now,0),before=rows.reduce((s,r)=>s+r.before,0);const pct=before?Math.round((now-before)/before*1000)/10:null;
  return{rows,now,before,pct,sales:rows.reduce((s,r)=>s+r.sales,0),flag:pct!=null&&pct>ipLim('ipCost',10,sid),py:p.y,pm:p.m};}

// ── per-employee plan (staff sheet + phone) ──
function ipEmpLines(sid,y,m,settings,e){
  return ipWith(sid,settings,()=>{const appl=loadIncentiveApplicability(sid);const split=loadIncentiveSplitMode(sid)||{};const g=incentiveGroupFor(e,sid);const sal=Number(e.gross)||0;
    const isMgr=typeof MANAGER_DESIGNATIONS!=='undefined'&&MANAGER_DESIGNATIONS.has(e.desig);const L=[['Your plan',(split.service||split.membership||split.product)?g:'Same plan for everyone at the outlet']];
    if(appl.service){const t=targetMultFor('svc',sid,e,split);L.push(['Service target',ipM(sal*t)+' ('+ipX(t)+' your salary)']);L.push(['Service incentive',ipSlabTxt(loadServiceSlabs(sid,split.service?g:undefined),sal)]);}
    if(appl.membership){const type=loadMemRuleType(sid);const t=targetMultFor('mem',sid,e,split);L.push(['Membership target',ipM(sal*t)]);L.push(['Membership incentive',ipMemTxt(type,ipMemSet(sid,type,split.membership?g:undefined),isMgr)]);}
    if(appl.product){const t=targetMultFor('prod',sid,e,split);L.push(['Product target',ipM(sal*t)]);L.push(['Product incentive',ipProdTxt(sid,split.product?g:undefined)]);}
    if(appl.manager&&isMgr)L.push(['Manager incentive',ipMgrTxt(sid,y,m)]);
    const ov=typeof incentiveManualOverrideFor==='function'?incentiveManualOverrideFor(sid,e.id):{};const mo=['svc','mem','prod','mgr'].filter(k=>ov[k]);
    if(mo.length)L.push(['Set by hand',mo.map(k=>({svc:'Service',mem:'Membership',prod:'Product',mgr:'Manager'})[k]).join(', ')+' — the amount is agreed with you each month']);
    return L;});
}
function ipNextSlab(sid,y,m,settings,e,svcActual){
  return ipWith(sid,settings,()=>{const split=loadIncentiveSplitMode(sid)||{};const g=split.service?incentiveGroupFor(e,sid):undefined;const sal=Number(e.gross)||0;if(!sal)return null;
    const B=ipBands(loadServiceSlabs(sid,g));const cur=svcActual/sal;const nx=B.find(b=>b.from>cur);if(!nx)return null;return{at:Math.round(nx.from*sal),gap:Math.round(nx.from*sal-svcActual),rate:nx.rate};});
}
function ipStaffText(sid,y,m,settings,e,plan){
  return '📋 Incentive plan — '+ipLabel(y,m)+'\n'+e.name+'\n\n'+ipEmpLines(sid,y,m,settings,e).map(([a,b])=>a+': '+b).join('\n')+
    (plan&&plan.status==='Approved'?'\n\nApproved by '+(plan.approvedBy||'')+(plan.approvedAt?' on '+ipDmy(plan.approvedAt):''):'\n\n(Not approved yet — may still change)');}
function ipPrintSheets(sid,y,m,settings,plan,emps){
  const esc=t=>String(t==null?'':t).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));const w=window.open('','_blank');if(!w){window.alert('Allow pop-ups to print.');return;}
  const outlet=String((outletSettings(sid)||{}).name||'');
  const pages=emps.map(e=>'<section><h2>Incentive plan — '+esc(ipLabel(y,m))+'</h2><div class="sub">'+esc(outlet)+' · '+esc(e.name)+' · '+esc(e.desig||'')+'</div><table>'+
    ipEmpLines(sid,y,m,settings,e).map(([a,b])=>'<tr><th>'+esc(a)+'</th><td>'+esc(b)+'</td></tr>').join('')+'</table><p class="sub">Applies '+esc('01/'+String(m+1).padStart(2,'0')+'/'+y+' – '+new Date(y,m+1,0).getDate()+'/'+String(m+1).padStart(2,'0')+'/'+y)+'. '+
    esc(plan&&plan.status==='Approved'?'Approved by '+(plan.approvedBy||'')+(plan.approvedAt?' on '+ipDmy(plan.approvedAt):'')+'.':'Not approved yet — may still change.')+'</p><p class="sign">Employee signature ____________________</p></section>').join('');
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Incentive plan '+esc(ipLabel(y,m))+'</title><style>body{font:13px Arial;margin:28px}section{page-break-after:always;max-width:640px}h2{margin:0 0 4px}.sub{color:#555;font-size:12px;margin-bottom:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eef3fa;width:34%}.sign{margin-top:40px}</style></head><body>'+pages+'<script>setTimeout(()=>window.print(),300)<\/script></body></html>');w.document.close();
}

// ═════════════ screen pieces ═════════════
const ipCard=(h,title,...kids)=>h('div',{className:'card',style:{marginBottom:14}},title&&h('div',{className:'card-title'},title),...kids);
const ipSmall=(h,t)=>h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},t);
function ipTable(h,head,rows){return h('div',{className:'table-wrap'},h('table',null,head&&h('thead',null,h('tr',null,head.map((x,i)=>h('th',{key:i},x)))),h('tbody',null,rows.map((r,i)=>h('tr',{key:i},r.map((c,j)=>h('td',{key:j,style:{fontSize:12.5,verticalAlign:'top',fontWeight:j===0?600:undefined,whiteSpace:j===0?'nowrap':undefined}},c)))))));}

// 4 · status steps
function IncPlanTimeline({plan}){
  const h=React.createElement;const st=plan?plan.status:'None';
  const steps=[['Draft','Prepare'],['Pending','Sent for approval'],['Approved','Approved']];const at=st==='Approved'?2:st==='Pending'?1:0;
  const H=(plan&&plan.history)||[];
  return h('div',{style:{marginBottom:14}},
    h('div',{style:{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}},steps.map(([k,l],i)=>h(React.Fragment,{key:k},
      i>0&&h('span',{style:{color:'var(--text3)'}},'→'),
      h('span',{style:{fontSize:12,fontWeight:600,padding:'4px 10px',borderRadius:14,border:'1px solid '+(i<at||st==='Approved'?'var(--green)':i===at?(st==='Returned'?'var(--red)':'#2f5fe0'):'var(--border)'),
        color:i<at||st==='Approved'?'var(--green)':i===at?(st==='Returned'?'var(--red)':'#2f5fe0'):'var(--text3)',background:i===at?'var(--bg3)':undefined}},(i<at||st==='Approved'?'✓ ':'')+(i===0&&st==='Returned'?'Returned — correct it':l)))),
      !plan&&h('span',{style:{fontSize:12,color:'var(--text3)',marginLeft:6}},'Nothing prepared yet')),
    H.length>0&&h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6,display:'flex',flexDirection:'column',gap:2}},H.slice(-6).map((x,i)=>h('div',{key:i},
      new Date(x.at).toLocaleString('en-GB',DMY_DT)+' · '+x.what+' by '+(x.by||'—')+(x.role?' ('+x.role+')':'')+(x.remarks?' — '+x.remarks:'')))));
}
// 1 + 11 · plain words, dates, staff sheets (12)
function IncPlanWords({sid,y,m,settings,plan,locked}){
  const h=React.createElement;const [open,setOpen]=useState(false);
  const data=ipWith(sid,settings,()=>{const appl=loadIncentiveApplicability(sid);const split=loadIncentiveSplitMode(sid)||{};const E=ipEmps(sid,y,m);const used=ipGroupsUsed(sid,y,m);
    const sal=g=>{const L=E.filter(e=>incentiveGroupFor(e,sid)===g).map(e=>Number(e.gross)||0).filter(Boolean).sort((a,b)=>a-b);const all=E.map(e=>Number(e.gross)||0).filter(Boolean).sort((a,b)=>a-b);const pick=L.length?L:all;return pick.length?Math.round(pick[Math.floor(pick.length/2)]/1000)*1000||pick[0]:20000;};
    const S=[];
    if(appl.service)(split.service?used:[null]).forEach(g=>{const slabs=loadServiceSlabs(sid,g||undefined);const s=sal(g);const B=ipBands(slabs);const ex=[B[1]?B[1].from:5,B[B.length-1].from||(B[1]?B[1].from:5)].filter((v,i,a)=>a.indexOf(v)===i);
      const eg=ex.map(t=>{const amt=s*t;const pg=typeof incProgressiveAmt==='function'?incProgressiveAmt(sid,amt,t,g||undefined):null;const inc=pg?pg.amount:Math.round(amt*serviceSlabRateFor(sid,t,g||undefined)/100);return ipM(amt)+' service ('+ipX(t)+') earns '+ipM(inc);});
      const tm=split.service&&g?loadTargetMultipliersForGroup(sid,g).svc:loadTargetMultipliers(sid).svc;
      S.push(['Service'+(g?' — '+g:''),'Target is '+ipX(tm)+' salary. Rate by how many times salary the stylist sells: '+ipSlabTxt(slabs)+'.'+(typeof ipOn==='function'&&ipOn('incProgressive',sid)?' Each rate applies only to the part of the sale inside its slab.':' The rate reached applies to the whole service sale.'),'e.g. salary '+ipM(s)+': '+eg.join('; ')]);});
    if(appl.membership){const type=loadMemRuleType(sid);(split.membership?used:[null]).forEach(g=>{const st=ipMemSet(sid,type,g||undefined);
      const eg=type==='C'?'₹10,000 new membership earns '+ipM(10000*(Number(st.newMemRate)||0)/100):type==='B'?'2 Elite cards earn '+ipM(2*(Number(st.incPerCard)||0)):'₹10,000 sold by a stylist earns '+ipM(10000*(Number(st.staffRate)||0)/100)+' (manager pool gets '+ipM(10000*(Number(st.mgrShareRate)||0)/100)+')';
      S.push(['Membership'+(g?' — '+g:'')+' (Rule '+type+')',ipMemTxt(type,st)+'.','e.g. '+eg]);});}
    if(appl.product)(split.product?used:[null]).forEach(g=>{const B=loadProdRuleType(sid,g||undefined)==='B';const r=Number(loadProductIncentiveRule(sid,g||undefined).rate)||0;
      S.push(['Product'+(g?' — '+g:''),ipProdTxt(sid,g||undefined)+'.',B?'':'e.g. ₹10,000 of product earns '+ipM(10000*r/100)]);});
    if(appl.manager){let rec={};try{rec=(loadMgrIncentiveInputsAll(sid)||{})[y+'_'+m]||{};}catch(e){}const tg=Number(rec.targetCollection)||0;const r100=typeof mgrIncentiveRateFor==='function'?mgrIncentiveRateFor(sid,100):0;
      S.push(['Manager',ipMgrTxt(sid,y,m)+'.',tg&&loadMgrRuleType(sid)!=='B'?'e.g. at 100% of target the pool is '+ipM(tg*r100/100):'']);}
    return{S,E};});
  const dim=new Date(y,m+1,0).getDate();const mm=String(m+1).padStart(2,'0');
  return ipCard(h,'📖 The plan in plain words',
    ipOn('ipPeriod',sid)&&h('div',{style:{fontSize:12.5,marginBottom:10,padding:'6px 10px',background:'var(--bg3)',borderRadius:'var(--r)'}},
      '📅 Applies to sales from ',h('b',null,'01/'+mm+'/'+y+' to '+dim+'/'+mm+'/'+y),'. ',
      plan&&plan.status==='Approved'?'Incentive Working for '+ipLabel(y,m)+' uses this plan. ':'Incentive Working uses it once approved; until then it uses the current rules. ',
      locked?h('b',{style:{color:'var(--red)'}},'🔒 Locked — the month’s incentive is approved.'):'It locks when the month’s incentive is approved.'),
    ipTable(h,null,data.S.map(([a,b,c])=>[a,h('div',null,b,c&&h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:2}},c))])),
    ipOn('ipStaffSheet',sid)&&h('div',{style:{marginTop:10}},
      h('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>ipPrintSheets(sid,y,m,settings,plan,data.E)},'🖨 Print a sheet for each employee'),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setOpen(!open)},open?'Hide WhatsApp list':'📲 Send on WhatsApp')),
      open&&h('div',{style:{marginTop:8,display:'flex',flexDirection:'column',gap:4}},data.E.map(e=>{const ph=typeof waNumber==='function'?waNumber(e.mobile||e.phone||''):'';
        return h('div',{key:e.id,style:{display:'flex',gap:8,alignItems:'center',fontSize:12.5}},h('span',{style:{flex:1}},e.name+' · '+incentiveGroupFor(e,sid)),
          h('button',{className:'btn btn-ghost btn-sm',disabled:!ph,title:ph?'':'No mobile number in Master Salary',onClick:()=>window.open('https://wa.me/'+ph+'?text='+encodeURIComponent(ipStaffText(sid,y,m,settings,e,plan)),'_blank','noopener')},ph?'📲 Send':'No mobile'));}))));
}
// 3 · one card per plan, with assignment warnings
function IncPlanGroups({sid,y,m,settings}){
  const h=React.createElement;
  const d=ipWith(sid,settings,()=>{const split=loadIncentiveSplitMode(sid)||{};const E=ipEmps(sid,y,m);const used=ipGroupsUsed(sid,y,m);const ov=loadIncentivePlanOverrides(sid)||{};const type=loadMemRuleType(sid);const appl=loadIncentiveApplicability(sid);
    const anySplit=split.service||split.membership||split.product;
    const cards=used.map(g=>{const who=E.filter(e=>incentiveGroupFor(e,sid)===g);const tm=loadTargetMultipliersForGroup(sid,g);const tmS=loadTargetMultipliers(sid);const R=[];
      if(appl.service)R.push(['Service',(split.service?'':'(shared) ')+'target '+ipX(split.service?tm.svc:tmS.svc)+' · '+ipSlabTxt(loadServiceSlabs(sid,split.service?g:undefined))]);
      if(appl.membership)R.push(['Membership',(split.membership?'':'(shared) ')+ipMemTxt(type,ipMemSet(sid,type,split.membership?g:undefined),g==='Manager')]);
      if(appl.product)R.push(['Product',(split.product?'':'(shared) ')+ipProdTxt(sid,split.product?g:undefined)]);
      return{g,who,R};});
    const warn=[];const assigned=Object.entries(ov).filter(([,v])=>v);
    if(assigned.length&&!anySplit)warn.push(assigned.map(([id,v])=>ipEmpName(sid,y,m,id)+' → '+v).join(', ')+': no category is split by designation yet, so these assignments have no effect. Turn on “Split by Designation” for the categories that should differ.');
    else if(assigned.length){const notSplit=['service','membership','product'].filter(k=>appl[k]&&!split[k]);if(notSplit.length)warn.push('Assigned plans apply only to '+['service','membership','product'].filter(k=>split[k]).map(k=>IP_CAT[k]).join(', ')+'. '+notSplit.map(k=>IP_CAT[k]).join(', ')+' stays one shared rule for everyone.');}
    return{cards,warn,many:anySplit};});
  if(!d.many&&!d.warn.length)return null;
  return ipCard(h,'👥 Who is on which plan',
    d.warn.map((w,i)=>h('div',{key:i,style:{fontSize:12.5,color:'#b26a00',background:'rgba(224,165,48,0.12)',border:'1px solid rgba(224,165,48,0.4)',borderRadius:'var(--r)',padding:'6px 10px',marginBottom:8}},'⚠ '+w)),
    h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:10}},d.cards.map(c=>h('div',{key:c.g,style:{border:'1px solid var(--border)',borderRadius:'var(--r)',padding:10,minWidth:0}},
      h('div',{style:{fontWeight:700,marginBottom:2}},c.g),h('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:6}},c.who.map(e=>e.name).join(', ')||'—'),
      c.R.map(([a,b])=>h('div',{key:a,style:{fontSize:12,marginBottom:3}},h('b',null,a+': '),b))))));
}
// 2 + 10 · changes from last month, with reasons
function IncPlanDiff({sid,y,m,cur,prev,prevLabel,plan,editable}){
  const h=React.createElement;const [,t]=useState(0);
  if(!prev)return ipCard(h,'🔁 Changes from '+prevLabel,h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No approved plan for '+prevLabel+' to compare with.'));
  const D=ipDiffLines(sid,y,m,cur,prev);const notesOn=ipOn('ipNotes',sid);const N=editable?ipNotesGet(sid,y,m):((plan&&plan.notes)||{});
  return ipCard(h,'🔁 Changes from '+prevLabel+(D.length?' ('+D.length+')':''),
    !D.length?h('div',{style:{fontSize:12.5,color:'var(--green)'}},'✓ Same as '+prevLabel+'’s approved plan.'):
    ipTable(h,['Rule',prevLabel,'Now'].concat(notesOn?['Reason']:[]),D.map(d=>[d.label,h('span',{style:{color:'var(--text3)'}},d.from),h('b',{style:{color:'#2f5fe0'}},d.to)].concat(notesOn?[
      editable?h('input',{className:'form-control',style:{fontSize:12,padding:'3px 6px',minWidth:160},defaultValue:N[d.key]||'',placeholder:'Why it changed',onBlur:e=>{ipNoteSet(sid,y,m,d.key,e.target.value.trim());t(x=>x+1);}})
        :(N[d.key]||h('span',{style:{color:'var(--text3)'}},'—'))]:[]))));
}
// 5 · rules changed after approval
function ipDriftLines(sid,y,m){const p=approvedIncPlanFor(sid,y,m);if(!p)return[];try{return ipDiffLines(sid,y,m,captureIncPlanSettings(sid),p.settings||{});}catch(e){return[];}}
function IncPlanDrift({sid,y,m}){
  const h=React.createElement;const D=ipDriftLines(sid,y,m);if(!D.length)return null;
  return h('div',{style:{fontSize:12.5,background:'rgba(224,165,48,0.12)',border:'1px solid rgba(224,165,48,0.4)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:14}},
    h('b',null,'⚠ ⚙ Incentive Rules & Settings changed after this plan was approved'),' — '+ipLabel(y,m)+' still uses the approved plan. To use the new rules, “Revise approved plan” and approve it again.',
    h('div',{style:{marginTop:4}},D.slice(0,8).map(d=>h('div',{key:d.key,style:{fontSize:12}},'• '+d.label+': '+d.from+' → '+d.to))));
}
// 8 · cost estimate
function IncPlanCost({sid,y,m,settings,prevSettings,prevLabel,onSeen}){
  const h=React.createElement;const [r,setR]=useState(null);const [all,setAll]=useState(false);
  const run=()=>{setR(ipCostEstimate(sid,y,m,settings,prevSettings));onSeen&&onSeen();};
  return ipCard(h,'🧮 What this plan would cost',
    !r?h('div',null,h('button',{className:'btn btn-ghost btn-sm',onClick:run},'Work out the estimate'),ipSmall(h,'Uses '+prevLabel+'’s actual sales with this plan, and compares with '+(prevSettings?prevLabel+'’s approved plan':'what was worked out for '+prevLabel)+' on the same sales.')):
    h('div',null,
      h('div',{style:{fontSize:13}},'On '+ipLabel(r.py,r.pm)+'’s sales of '+ipM(r.sales)+': ',h('b',null,ipM(r.now)),' under this plan, against ',h('b',null,ipM(r.before)),' '+(prevSettings?'under '+prevLabel+'’s plan':'as worked out for '+prevLabel),
        r.pct!=null&&h('span',{style:{fontWeight:700,color:r.flag?'var(--red)':r.now>=r.before?'var(--text2)':'var(--green)'}},' ('+(r.now-r.before>=0?'+':'−')+ipM(Math.abs(r.now-r.before))+', '+(r.pct>0?'+':'')+r.pct+'%)'),
        r.flag&&h('span',{style:{color:'var(--red)'}},' — more than '+ipLim('ipCost',10,sid)+'% higher')),
      h('button',{className:'btn btn-ghost btn-sm',style:{marginTop:6},onClick:()=>setAll(!all)},all?'Hide employees':'Show each employee'),
      all&&ipTable(h,['Employee','Sales','Under '+prevLabel+'’s plan','Under this plan','Change'],r.rows.map(x=>[x.name,ipM(x.sales),ipM(x.before),ipM(x.now),(x.now-x.before>=0?'+':'−')+ipM(Math.abs(x.now-x.before))])),
      ipSmall(h,'Service, Membership, Product and Manager incentive before overtime, penalty, advance recovery and adjustments.')));
}
// 7 · step-by-step preparing
function IncPlanSteps({sid,y,m,copyPrev,onOpenRules}){
  const h=React.createElement;const [,t]=useState(0);const st=ipStepState(sid,y,m);if(copyPrev&&!st.start)st.start=true;
  const S=ipSteps(sid,y,m);const done=S.filter(([k])=>ipStepDone(sid,y,m,k)).length;
  return ipCard(h,'🪜 Prepare the plan, step by step',
    h('div',{style:{height:6,borderRadius:4,background:'var(--bg3)',overflow:'hidden',marginBottom:8}},h('div',{style:{height:'100%',width:Math.round(done/S.length*100)+'%',background:done===S.length?'var(--green)':'#2f5fe0'}})),
    S.map(([k,l],i)=>{const d=ipStepDone(sid,y,m,k);return h('label',{key:k,style:{display:'flex',gap:8,alignItems:'center',fontSize:12.5,marginBottom:4,cursor:k==='notes'?'default':'pointer'}},
      h('input',{type:'checkbox',checked:d,disabled:k==='notes',onChange:e=>{st[k]=e.target.checked;t(x=>x+1);}}),h('span',{style:{color:d?'var(--green)':undefined}},(i+1)+'. '+l),
      Object.prototype.hasOwnProperty.call(IP_CAT,k)&&onOpenRules&&h('button',{className:'btn btn-ghost btn-sm',style:{padding:'1px 8px'},onClick:e=>{e.preventDefault();onOpenRules();}},'Open'));}),
    ipSmall(h,(ipOn('ipWizard',sid)?'Submitting needs every step ticked. ':'')+'Step '+(S.length+1)+': press “Submit plan for approval” below.'+(S.some(([k])=>k==='notes')?' The reasons step ticks itself when every change has a reason.':'')));
}
// 9 · approver checklist + ready-made remarks
function IncPlanApproverChecks({sid,y,m,plan,onPick}){
  const h=React.createElement;const [,t]=useState(0);if(!ipOn('ipChecklist',sid))return null;const c=ipChkState(sid,y,m);
  const items=[['changes','I have looked at what changed from last month']];if(ipOn('ipCost',sid))items.push(['cost','I have looked at the cost estimate']);if(plan&&plan.notes&&Object.keys(plan.notes).length)items.push(['notes','I have read the reasons for the changes']);
  const R=['Target too high','Target too low','Rate changed without a reason','Costs too much compared with last month','Please add reasons for the changes','Wrong employees on the custom plan'];
  return h('div',{style:{marginBottom:10}},
    items.map(([k,l])=>h('label',{key:k,style:{display:'flex',gap:8,alignItems:'center',fontSize:12.5,marginBottom:4,cursor:'pointer'}},h('input',{type:'checkbox',checked:!!c[k],onChange:e=>{c[k]=e.target.checked;t(x=>x+1);}}),l)),
    h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginTop:6}},h('span',{style:{fontSize:11.5,color:'var(--text3)'}},'Quick remarks:'),R.map(x=>h('button',{key:x,className:'btn btn-ghost btn-sm',style:{padding:'1px 8px',fontSize:11.5},onClick:()=>onPick&&onPick(x)},x))));
}
// The block on the Monthly Plan screen (js/18 renders it under the header).
function IncPlanPlus({sid,y,m,plan,prevPlan,prevLabel,user,editable,locked,copyPrev,onOpenRules,tick}){
  const h=React.createElement;if(sid==null)return null;
  const any=['ipWords','ipDiff','ipGroups','ipTimeline','ipDrift','ipWizard','ipCost','ipNotes','ipStaffSheet'].some(k=>ipOn(k,sid));if(!any)return null;
  let cur={};try{cur=ipShownSettings(sid,plan);}catch(e){}
  const prevS=prevPlan?(prevPlan.settings||{}):null;const showSteps=editable&&(ipOn('ipWizard',sid)||ipOn('ipNotes',sid));
  return h('div',{key:'ipp'+(tick||0)},
    ipOn('ipTimeline',sid)&&h(IncPlanTimeline,{plan}),
    ipOn('ipDrift',sid)&&plan&&plan.status==='Approved'&&h(IncPlanDrift,{sid,y,m}),
    showSteps&&ipOn('ipWizard',sid)&&h(IncPlanSteps,{sid,y,m,copyPrev,onOpenRules}),
    ipOn('ipWords',sid)&&h(IncPlanWords,{sid,y,m,settings:cur,plan,locked}),
    !ipOn('ipWords',sid)&&ipOn('ipStaffSheet',sid)&&h(IncPlanWords,{sid,y,m,settings:cur,plan,locked}),
    ipOn('ipGroups',sid)&&h(IncPlanGroups,{sid,y,m,settings:cur}),
    ipOn('ipDiff',sid)&&h(IncPlanDiff,{sid,y,m,cur,prev:prevS,prevLabel,plan,editable}),
    ipOn('ipCost',sid)&&h(IncPlanCost,{sid,y,m,settings:cur,prevSettings:prevS,prevLabel,onSeen:()=>{ipStepState(sid,y,m).cost=true;const c=ipChkState(sid,y,m);c.cost=true;}}));
}
// 6 · "plan in use" chip on Incentive Working
function IncPlanInUseChip({sid,y,m}){
  const h=React.createElement;if(sid==null||!ipOn('ipInUse',sid))return null;const p=incPlanFor(sid,y,m);const ok=p&&p.status==='Approved';
  const drift=ok&&ipOn('ipDrift',sid)?ipDriftLines(sid,y,m):[];
  const txt=ok?'📋 Using the approved plan for '+ipLabel(y,m)+(p.approvedBy?' (approved by '+p.approvedBy+(p.approvedAt?' on '+ipDmy(p.approvedAt):'')+')':''):
    p&&p.status==='Pending'?'⏳ The '+ipLabel(y,m)+' plan is waiting for approval — the current ⚙ Rules are used until then':
    p&&p.status==='Returned'?'↩ The '+ipLabel(y,m)+' plan was returned — the current ⚙ Rules are used until it is approved':'No approved plan for '+ipLabel(y,m)+' — the current ⚙ Incentive Rules & Settings are used';
  return h('div',{style:{fontSize:12,marginBottom:10,padding:'5px 10px',borderRadius:'var(--r)',display:'inline-block',border:'1px solid '+(ok?'rgba(46,160,90,0.4)':'var(--border)'),background:ok?'rgba(46,160,90,0.08)':'var(--bg3)',color:ok?'var(--green)':'var(--text2)'},
    title:drift.length?drift.map(d=>d.label+': '+d.from+' → '+d.to).join('\n'):'See the Monthly Plan tab'},txt,
    drift.length>0&&h('span',{style:{color:'#b26a00',marginLeft:6}},'· ⚠ '+drift.length+' rule(s) changed in ⚙ Rules since — not used for this month'));
}
// 13 · plan on the staff phone screen (js/36)
function IncPlanForMe({sid,emp,y,m}){
  const h=React.createElement;if(sid==null||!emp||!ipOn('ipStaffPhone',sid))return null;
  const p=incPlanFor(sid,y,m);const settings=p&&p.status==='Approved'?(p.settings||{}):null;
  let row=null;try{row=(incWorkingsFor(sid,y,m)||[]).find(w=>String(w.id)===String(emp.id));}catch(e){}
  const e=row||emp;let L=[],nx=null;try{L=ipEmpLines(sid,y,m,settings,e);nx=row?ipNextSlab(sid,y,m,settings,e,Number(row.svcActual)||0):null;}catch(x){}
  return h('div',{style:{marginTop:10,borderTop:'1px solid var(--border)',paddingTop:8}},
    h('div',{style:{fontWeight:600,fontSize:13,marginBottom:4}},'📋 My plan — '+ipLabel(y,m)+(settings?'':' (not approved yet)')),
    nx&&h('div',{style:{fontSize:12.5,color:'#2f5fe0',marginBottom:6}},ipM(nx.gap)+' more service takes you to the '+ipP(nx.rate)+' slab ('+ipM(nx.at)+').'),
    L.map(([a,b])=>h('div',{key:a,style:{fontSize:12,marginBottom:2}},h('b',null,a+': '),b)));
}
// 14 · reminder when next month's plan isn't approved
function IncPlanReminderStrip(){
  const h=React.createElement;const u=typeof currentSessionUser==='function'?currentSessionUser():null;
  if(!u||!(u.role==='Super Admin'||(typeof isSuperAdminUser==='function'&&isSuperAdminUser(u))||(typeof INC_PLAN_MAKERS!=='undefined'&&INC_PLAN_MAKERS.includes(u.role))))return null;
  const now=new Date();const nx=new Date(now.getFullYear(),now.getMonth()+1,1);const ny=nx.getFullYear(),nm=nx.getMonth();
  let list=[];try{list=(typeof salonsForCurrentUser==='function'?salonsForCurrentUser(SALONS):SALONS)||[];}catch(e){}
  const dayKey='salonos_ip_rem_hide_'+ipYm(ny,nm);try{if(sessionStorage.getItem(dayKey))return null;}catch(e){}
  const due=list.filter(s=>s&&ipOn('ipReminder',s.id)&&now.getDate()>=ipLim('ipReminder',25,s.id)&&!approvedIncPlanFor(s.id,ny,nm));if(!due.length)return null;
  const pend=due.filter(s=>{const p=incPlanFor(s.id,ny,nm);return p&&p.status==='Pending';});
  return h('div',{style:{background:'rgba(47,95,224,0.08)',border:'1px solid rgba(47,95,224,0.3)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,fontSize:12.5,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
    h('span',null,'📋 The ',h('b',null,ipLabel(ny,nm)),' incentive plan is not approved yet for: '+due.map(s=>String(s.name||s.id).split('—')[0].trim()+(pend.includes(s)?' (waiting for approval)':'')).join(', ')+'. Incentive Working → Monthly Plan.'),
    h('button',{className:'btn btn-ghost btn-sm',onClick:e=>{try{sessionStorage.setItem(dayKey,'1');}catch(x){}const el=e.target.closest('div');if(el)el.hidden=true;}},'Hide'));
}
if(typeof PendingApprovalsStrip==='function'){const _ipStrip=PendingApprovalsStrip;
  PendingApprovalsStrip=function(props){const h=React.createElement;const a=_ipStrip(props);const r=h(IncPlanReminderStrip,null);return a?h('div',null,r,a):r;};}

// ── Help & Guide topic ──
if(typeof HELP_TOPICS!=='undefined'&&Array.isArray(HELP_TOPICS)&&!HELP_TOPICS.some(t=>t.title==='Incentive Plan — same for everyone, or separate plans'))HELP_TOPICS.push({title:'Incentive Plan — same for everyone, or separate plans',body:[
  '<b>Same plan for everyone</b> (the default): one set of rules in ⚙ Incentive Rules & Settings applies to every employee. Each person’s incentive is their own sales × the outlet’s rates. Targets are salary × multiplier, so each person’s target still follows their own salary.',
  '<b>Separate plans</b>: in ⚙ Incentive Rules & Settings turn on <b>Advanced Settings</b>. Each employee then follows their designation’s plan (Hairdresser, Beautician, Pedicurist, Manager). If two people with the same designation need different rules, add a custom plan (for example “Hairdresser – Senior”) and choose it for them under <b>Employee Plan Assignment</b>.',
  '<b>Turn on “Split by Designation”</b> in each category that should differ (Service, Membership, Product) and fill in every plan’s tab. A category that isn’t split stays one shared rule for everyone, even for employees assigned to a custom plan.',
  '<b>What can differ per plan</b>: Service slabs and target ×; Membership rates (which rule, A, B or C, is one choice for the outlet); Product % or flat ₹; each manager’s Share %.',
  '<b>One-off deals</b>: <b>Manual Override by Employee</b> lets you type the ₹ amount for one person in the categories you tick. Everyone else stays automatic.',
  '<b>Example</b>: Asha (Senior plan, salary ₹25,000) sells ₹1,75,000 of service = 7× salary → 6% slab = ₹10,500. Ravi (Hairdresser plan, salary ₹20,000) sells ₹1,10,000 = 5.5× → 5% slab = ₹5,500. Same formula, different slabs.',
  '<b>Check it</b>: Incentive Working → Monthly Plan → “Who is on which plan” lists each plan with its employees and warns when an assignment has no effect. Submit the month’s plan for approval; the approved copy keeps every plan’s numbers for that month.'
]});
