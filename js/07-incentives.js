

function IncentiveWorkingSheet({period,salon,user}={}){
  // ── Salon Manager / ASM never get the working sheet itself — see Send Summary for Approval
  // on the sheet below and isSummaryApproverRole for the full rationale. They land on a
  // dedicated read-only Approve/Return screen instead of any of this component's own sub-tabs
  // (Incentive Working, Incentive Payment, Comparative Sheet, Staff Work Report). ──
  if(summaryApprovalOnly(user,salon?.id,'incentive-working'))return React.createElement(IncentiveSummaryApproval,{salon,period,user});
  return React.createElement(IncentiveWorkingTabs,{period,salon,user}); // separate component: switching screens when access changes live never mixes hooks
}
function IncentiveWorkingTabs({period,salon,user}={}){
  const [subTab,setSubTab]=useState('incentive');
  const [rulesSignal,setRulesSignal]=useState(0);
  const approver=isSummaryApproverRole(user); // given Edit here — keeps Summary Approval as a tab
  const tabBar=React.createElement('div',{className:'tab-bar',style:{marginBottom:16}},
    [{id:'incentive',label:'Incentive Working'},{id:'plan',label:'Monthly Plan'},{id:'tracker',label:'Target Tracker'},{id:'productivity',label:'Productivity'},{id:'incentive-payment',label:'Incentive Payment'},{id:'comparative',label:'Comparative Sheet'},{id:'staff-report',label:'Staff Work Report'},...(approver?[{id:'summary',label:'Summary Approval'}]:[])].map(t=>
      React.createElement('button',{key:t.id,className:`tab-btn ${subTab===t.id?'active':''}`,onClick:()=>setSubTab(t.id)},t.label)
    )
  );
  // All screens stay mounted at all times — only visibility toggles — so switching between
  // them never unmounts/remounts any of them and never loses in-progress state (an uploaded-but-
  // not-yet-loaded CSV, row selections, which Staff Work Report inner tab was open, etc.).
  return React.createElement('div',{className:'fade-in'},
    tabBar,
    React.createElement('div',{style:{display:subTab==='incentive'?'block':'none'}},React.createElement(IncentiveWorkingCore,{period,salon,user,rulesSignal})),
    subTab==='tracker'&&React.createElement(IncentiveTargetTracker,{period,salon}),
    subTab==='productivity'&&React.createElement(StaffProductivitySheet,{period,salon}),
    subTab==='plan'&&React.createElement(MonthlyIncentivePlanSheet,{period,salon,user,onOpenRules:()=>{setSubTab('incentive');setRulesSignal(n=>n+1);}}),
    React.createElement('div',{style:{display:subTab==='incentive-payment'?'block':'none'}},React.createElement(IncentivePaymentSheet,{period,salon})),
    React.createElement('div',{style:{display:subTab==='comparative'?'block':'none'}},React.createElement(IncentiveComparativeSheet,{period,salon})),
    React.createElement('div',{style:{display:subTab==='staff-report'?'block':'none'}},React.createElement(StaffReportSheet,{period,salon})),
    approver&&React.createElement('div',{style:{display:subTab==='summary'?'block':'none'}},React.createElement(IncentiveSummaryApproval,{salon,period,user}))
  );
}
function IncentiveWorkingCore({period,salon,user,rulesSignal}={}){
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today=new Date();
  const initCal=periodToCalendar(period);
  const [selMonth,setSelMonth]=useState(initCal?initCal.month:today.getMonth());
  const [selYear,setSelYear]=useState(initCal?initCal.year:today.getFullYear());
  useEffect(()=>{
    const cal=periodToCalendar(period);
    if(cal){setSelMonth(cal.month);setSelYear(cal.year);}
    // eslint-disable-next-line
  },[period&&period.mi,period&&period.fy]);
  const {success,error:iwError}=useToast();
  // Month Lock — Incentive Working locks independently of Attendance/Salary Working: either a
  // manual lock from Master Sheet (which still overrides every sheet), or Incentive Working's own
  // auto-lock once every employee here is Approved. Salary Working's own approval/auto-lock does
  // NOT lock Incentive Working — each sheet is approved and locked on its own schedule.
  const iwMonthLockRec=iwEffectiveLockRecordFor(salon?.id,selYear,selMonth);
  const iwMonthLocked=isIWEffectiveLockedFor(salon?.id,selYear,selMonth);
  // Column applicability toggles — persisted per outlet (see loadIWCols/saveIWCols), since these
  // now gate the actual Total Incentive calculation, not just which columns are shown. Loaded
  // fresh whenever the outlet changes.
  const [cols,setCols]=useState(()=>loadIWCols(salon?.id));
  useEffect(()=>{saveIWCols(cols,salon?.id);},[cols,salon?.id]);
  const toggleCol=(k)=>setCols(p=>({...p,[k]:!p[k]}));
  // Refresh — incData is recomputed fresh from storage on every render already; this just forces
  // a re-render, so any change made elsewhere since the page opened (Staff Work Report uploaded,
  // an advance settled, a penalty entered) shows up immediately without navigating away and back.
  const [refreshTick,setRefreshTick]=useState(0);
  const doRefresh=()=>{setRefreshTick(t=>t+1);success('Refreshed — pulling the latest Staff Work Report, Advances, and rate data.');};

  // Row meta: Status / Payment Status / Mode — persisted per outlet, same pattern as Salary
  // Working's own meta, tracked independently here.
  useState(()=>reconcileAdvanceRecoveries(salon?.id));
  const [iwMeta,setIwMeta]=useState(()=>loadIWMeta(salon?.id));
  useEffect(()=>{saveIWMeta(iwMeta,salon?.id);},[iwMeta]);
  const iwMetaKey=attMonthKey;
  const iwMetaFor=(empId)=>iwMeta[iwMetaKey(empId,selYear,selMonth)]||{status:'Draft',paymentStatus:'Not Paid',mode:''};
  // ── Advance paydown on incentive approval — mirrors Salary Working's mechanism exactly
  // (settles each active Incentive-recovered advance for its own computed installment, not a
  // lump sum reallocated oldest-first), and only ever touches advances flagged "Recover Against:
  // Incentive" on the Advances sheet, so the same advance is never deducted from both Salary and
  // Incentive in the same month. ──
  const applyAdvanceSettlementIW=(empName,year,month)=>{
    const key=outletKey('salonos_advances',salon?.id);
    let all=[];
    try{const raw=JSON.parse(cachedLocalGet(key)||'[]');if(Array.isArray(raw))all=raw;}catch(e){}
    const breakdown=[];
    const next=all.map(a=>{
      if(a.emp!==empName||a.status!=='Active'||(a.deductFrom||'Salary')!=='Incentive')return a;
      const scheduled=scheduledAmountFor(a,year,month);
      const planned=scheduled!==null?scheduled:(Number(a.repayment)||0);
      const ym=year+'-'+String(month+1).padStart(2,'0');
      const done=Number((a.settled||{})[ym])||0; // already recovered for this month (e.g. when the month was locked)
      const take=Math.min(Math.max(0,planned-done),Math.max(0,Number(a.outstanding)||0));
      if(take<=0)return a;
      breakdown.push({id:a.id,amount:take,ym});
      const newOutstanding=Math.max(0,(Number(a.outstanding)||0)-take);
      return{...a,outstanding:newOutstanding,settled:{...(a.settled||{}),[ym]:done+take},status:newOutstanding<=0?'Recovered':a.status};
    });
    safeLocalSet(key,JSON.stringify(next));
    return breakdown;
  };
  const reverseAdvanceSettlementIW=(breakdown)=>{
    if(!breakdown||!breakdown.length)return;
    const key=outletKey('salonos_advances',salon?.id);
    let all=[];
    try{const raw=JSON.parse(cachedLocalGet(key)||'[]');if(Array.isArray(raw))all=raw;}catch(e){}
    const byId=Object.fromEntries(breakdown.map(b=>[b.id,b.amount]));
    const next=all.map(a=>{
      if(!(a.id in byId))return a;
      const restored=(Number(a.outstanding)||0)+byId[a.id];
      const bym=(breakdown.find(b=>b.id===a.id)||{}).ym;
      const settled={...(a.settled||{})};
      if(bym){settled[bym]=Math.max(0,(Number(settled[bym])||0)-byId[a.id]);if(!settled[bym])delete settled[bym];}
      return{...a,outstanding:restored,settled,status:restored>0?'Active':a.status};
    });
    safeLocalSet(key,JSON.stringify(next));
  };
  const setIwMetaField=(empId,field,value)=>{
    if(iwMonthLocked){iwError('This month is locked — unlock it above to make changes.');return;}
    let nextMap=null;
    setIwMeta(prev=>{
      const k=iwMetaKey(empId,selYear,selMonth);
      const cur=prev[k]||{status:'Draft',paymentStatus:'Not Paid',mode:''};
      const next={...cur,[field]:value};
      if(field==='paymentStatus'&&value==='Not Paid')next.mode='';
      if(field==='status'){
        const emp=incData.find(e=>e.id===empId);
        if(value==='Approved'&&!cur.advanceSettled&&emp){
          const breakdown=applyAdvanceSettlementIW(emp.name,selYear,selMonth);
          if(breakdown.length){next.advanceSettled=true;next.advanceSettledBreakdown=breakdown;}
        }else if(value!=='Approved'&&cur.advanceSettled){
          reverseAdvanceSettlementIW(cur.advanceSettledBreakdown);
          next.advanceSettled=false;next.advanceSettledBreakdown=undefined;
        }
      }
      nextMap={...prev,[k]:next};
      return nextMap;
    });
    // Incentive Working locks itself independently of Salary Working — only once every
    // employee on THIS sheet is Approved, not tied to Salary Working's own approval state.
    if(field==='status'&&value==='Approved'){
      setTimeout(()=>{
        const locked=autoLockIWIfAllApproved(salon?.id,selYear,selMonth,incData,nextMap);
        if(locked){success(MONTHS[selMonth]+' '+selYear+' Incentive Working auto-locked — every employee is now Approved');}
      },0);
    }
  };
  // Marks every employee on this month's Incentive Working sheet as Approved in one action —
  // same behaviour as Salary Working's "✓ Approve All", scoped to incData (already excludes
  // Helper & Housekeeper, matching who actually appears on this sheet).
  const approveAllIW=()=>{
    if(iwMonthLocked){iwError('This month is locked — unlock it above to make changes.');return;}
    let nextMap=null;
    setIwMeta(prev=>{
      const next={...prev};
      incData.forEach(e=>{
        const k=iwMetaKey(e.id,selYear,selMonth);
        const cur=next[k]||{status:'Draft',paymentStatus:'Not Paid',mode:''};
        const upd={...cur,status:'Approved'};
        if(!cur.advanceSettled){
          const breakdown=applyAdvanceSettlementIW(e.name,selYear,selMonth);
          if(breakdown.length){upd.advanceSettled=true;upd.advanceSettledBreakdown=breakdown;}
        }
        next[k]=upd;
      });
      nextMap=next;
      return next;
    });
    success('All employees marked Approved for '+MONTHS[selMonth]+' '+selYear);
    setTimeout(()=>{
      const locked=autoLockIWIfAllApproved(salon?.id,selYear,selMonth,incData,nextMap);
      if(locked){success(MONTHS[selMonth]+' '+selYear+' Incentive Working auto-locked — every employee is now Approved');}
    },0);
  };
  const unlockIWMonth=()=>{
    const isMasterLocked=iwMonthLockRec&&iwMonthLockRec.scope==='all';
    const msg=isMasterLocked
      ?'Unlock the ENTIRE month of '+MONTHS[selMonth]+' '+selYear+' for this outlet? Attendance, Salary Working and Incentive Working will all become editable again.'
      :'Unlock '+MONTHS[selMonth]+' '+selYear+' Incentive Working for this outlet? It will become editable again — Attendance and Salary Working are unaffected.';
    const lr=monthLockRecordFor(salon?.id,selYear,selMonth);
    if(lr&&lr.locked&&lr.source==='pnl-final'){window.alert('The P&L (Monthly) for '+MONTHS[selMonth]+' '+selYear+' is Final — un-finalize the P&L first.');return;}
    if(!requestUnlock(salon?.id,MONTHS[selMonth]+' '+selYear+' Incentive Working'))return;
    if(isMasterLocked)setMonthLockFor(salon?.id,selYear,selMonth,false);
    else setIWAutoLockFor(salon?.id,selYear,selMonth,false);
    success(MONTHS[selMonth]+' '+selYear+(isMasterLocked?' unlocked':' Incentive Working unlocked'));
    setRefreshTick(t=>t+1);
  };
  // Manual lock — an admin can lock Incentive Working directly, without waiting for every
  // employee to be marked Approved. Attendance and Salary Working are untouched.
  const lockIWMonth=()=>{
    if(!window.confirm('Lock '+MONTHS[selMonth]+' '+selYear+' Incentive Working for this outlet? It will become read-only — Attendance and Salary Working are unaffected. You can unlock it again anytime from here.'))return;
    setIWLockFor(salon?.id,selYear,selMonth,true,'manual');
    success(MONTHS[selMonth]+' '+selYear+' Incentive Working locked');
    setRefreshTick(t=>t+1);
  };
  // Lock Entire Month — same effect as the Master Sheet's own "🔒 Months" panel (source:'manual'),
  // offered here too so it doesn't require navigating away from Incentive Working to use it.
  const lockEntireMonthIW=()=>{
    if(!window.confirm('Lock the ENTIRE month of '+MONTHS[selMonth]+' '+selYear+' for this outlet? Attendance, Salary Working AND Incentive Working will all become read-only until unlocked — same as the Master Sheet \'🔒 Months\' panel.'))return;
    setMonthLockFor(salon?.id,selYear,selMonth,true,'manual');
    success('Entire month '+MONTHS[selMonth]+' '+selYear+' locked');
    setRefreshTick(t=>t+1);
  };

  // ── Incentive calculation — Models 2–5 removed; Model 1's Rate % of Achieved is the only
  // method now, so this is fixed rather than user-selectable. ──
  const activeModel=1;
  const [actualsTick,setActualsTick]=useState(0); // bumped after every edit to force incData to re-read localStorage

  // All the configuration (Applicability, Target Multipliers, Service/Membership/Product rules,
  // Manager Incentive, Column Groups, Times format) lives behind one "Incentive Rules & Settings"
  // button instead of sitting open on the page — keeps the main screen to just the summary and
  // the employee table, with setup tucked away until it's actually needed.
  const [showSettings,setShowSettings]=useState(false);
  useEffect(()=>{if(rulesSignal)setShowSettings(true);},[rulesSignal]);
  // Refs for the "🔗" column-header links (Svc/Mem/Prod/Mgr Inc) — clicking one opens the
  // settings modal and scrolls straight to that category's rule section inside it.
  const svcSectionRef=useRef(null);
  const memSectionRef=useRef(null);
  const prodSectionRef=useRef(null);
  const mgrSectionRef=useRef(null);
  const goToSection=(ref)=>{
    setShowSettings(true);
    setTimeout(()=>{ref.current&&ref.current.scrollIntoView({behavior:'smooth',block:'start'});},60);
  };

  // ── Applicability — master on/off checks for Service/Membership/Product/Manager Incentive. ──
  const [applicability,setApplicabilityState]=useState(()=>loadIncentiveApplicability(salon?.id));
  useEffect(()=>{setApplicabilityState(loadIncentiveApplicability(salon?.id));},[salon?.id]);
  const toggleApplicability=(k)=>{
    const next={...applicability,[k]:!applicability[k]};
    setApplicabilityState(next);saveIncentiveApplicability(salon?.id,next);setActualsTick(t=>t+1);
  };

  // ── Incentive Plans by Designation — per-category "Split by Designation" toggle. Membership
  // and Product manage their own group-tab state inside their own sub-components below (they're
  // rendered separately); this covers the toggle itself (shared everywhere) plus the group state
  // for Service Slabs and Manager Incentive, which render directly in this settings modal.
  const [splitMode,setSplitModeState]=useState(()=>loadIncentiveSplitMode(salon?.id));
  useEffect(()=>{setSplitModeState(loadIncentiveSplitMode(salon?.id));},[salon?.id]);
  const toggleSplitMode=(cat)=>{
    const next={...splitMode,[cat]:!splitMode[cat]};
    setSplitModeState(next);saveIncentiveSplitMode(salon?.id,next);setActualsTick(t=>t+1);
  };
  const [svcActiveGroup,setSvcActiveGroup]=useState(INCENTIVE_DESIGNATION_GROUPS[0]);
  const [mgrActiveLevel,setMgrActiveLevel]=useState(MANAGER_LEVEL_GROUPS[0]);

  // ── Incentive Plans — the 4 built-in designation groups plus any custom plans this outlet has
  // added (see allIncentivePlans). Recomputed fresh every render (not cached in state) so a
  // change made in the "Incentive Plans" manager below shows up everywhere a plan list is used —
  // Target Multipliers, Service/Membership/Product's own Split-by-Designation tabs — as soon as
  // this component next re-renders (every settings change already bumps actualsTick). ──
  const incentivePlans=allIncentivePlans(salon?.id);
  // ── Quick Setup / Advanced Settings — see the toggle rendered at the top of the settings
  // modal below. Off by default for every outlet; each category's own component (Membership,
  // Product) reads this same flag via a prop so their own Split-by-Designation controls hide
  // consistently with everything rendered directly in this component. ──
  const [showAdvanced,setShowAdvanced]=useState(false);
  const [newPlanName,setNewPlanName]=useState('');
  const addCustomPlan=()=>{
    const name=newPlanName.trim();
    if(!name)return;
    if(incentivePlans.some(p=>p.toLowerCase()===name.toLowerCase())){setNewPlanName('');return;}
    const next=[...loadIncentiveCustomPlans(salon?.id),name];
    saveIncentiveCustomPlans(salon?.id,next);
    setNewPlanName('');
    setActualsTick(t=>t+1);
  };
  const removeCustomPlan=(name)=>{
    const assignedCount=Object.values(loadIncentivePlanOverrides(salon?.id)).filter(p=>p===name).length;
    if(!confirm('Delete the "'+name+'" incentive plan'+(assignedCount?' — '+assignedCount+' employee'+(assignedCount===1?' is':'s are')+' currently assigned to it and will fall back to their own Designation\'s default plan':'')+'? Its slabs/rates will be lost.'))return;
    saveIncentiveCustomPlans(salon?.id,loadIncentiveCustomPlans(salon?.id).filter(p=>p!==name));
    // Any employee individually assigned to the plan being removed falls back to their own
    // Designation's default group again, rather than being left pointed at a plan that no longer
    // exists — incentiveGroupFor already ignores an override that isn't in allIncentivePlans, so
    // this is just cleaning the override store up to match, not a behavioural change on its own.
    const overrides=loadIncentivePlanOverrides(salon?.id);
    const nextOverrides={};
    Object.keys(overrides).forEach(id=>{if(overrides[id]!==name)nextOverrides[id]=overrides[id];});
    saveIncentivePlanOverrides(salon?.id,nextOverrides);
    setActualsTick(t=>t+1);
  };
  // ── Per-Employee Plan Override — assign a specific employee to a DIFFERENT plan than their
  // own Designation would map to (any existing group, built-in or custom). Covers two employees
  // sharing one Designation who genuinely need separate incentive plans. ──
  const [planOverrides,setPlanOverridesState]=useState(()=>loadIncentivePlanOverrides(salon?.id));
  useEffect(()=>{setPlanOverridesState(loadIncentivePlanOverrides(salon?.id));},[salon?.id]);
  const setEmployeePlanOverride=(empId,plan)=>{
    const next={...planOverrides};
    if(plan)next[empId]=plan;else delete next[empId];
    setPlanOverridesState(next);saveIncentivePlanOverrides(salon?.id,next);setActualsTick(t=>t+1);
  };
  // ── Per-Employee Manual Override — see incentiveManualOverrideFor for the full rationale.
  // Independent of Plan Assignment above: this doesn't change WHICH plan an employee follows,
  // it carves specific categories out of plan-based calculation entirely for that employee. ──
  const [manualOverrides,setManualOverridesState]=useState(()=>loadIncentiveManualOverrides(salon?.id));
  useEffect(()=>{setManualOverridesState(loadIncentiveManualOverrides(salon?.id));},[salon?.id]);
  const toggleEmployeeManualOverride=(empId,category)=>{
    const cur=manualOverrides[empId]||{svc:false,mem:false,prod:false,mgr:false};
    const nextFlags={...cur,[category]:!cur[category]};
    const next={...manualOverrides};
    if(Object.values(nextFlags).some(Boolean))next[empId]=nextFlags;else delete next[empId];
    setManualOverridesState(next);saveIncentiveManualOverrides(salon?.id,next);setActualsTick(t=>t+1);
  };

  // ── Target Multipliers — editable ×Times of Salary for each category's Target (was a fixed
  // 5×/3×/2×). Changing one recalculates Target, the header label, and the achievement bar. When
  // a category is split by Designation, each group gets its own multiplier instead of one shared
  // number — all four show at once here rather than a tab, since it's just one number each.
  const [targetMult,setTargetMultState]=useState(()=>loadTargetMultipliers(salon?.id));
  useEffect(()=>{setTargetMultState(loadTargetMultipliers(salon?.id));},[salon?.id]);
  const setTargetMultField=(field,value)=>{
    const next={...targetMult,[field]:value===''?0:Number(value)};
    setTargetMultState(next);saveTargetMultipliers(salon?.id,next);setActualsTick(t=>t+1);
  };
  const [targetMultByGroup,setTargetMultByGroupState]=useState(()=>{
    const m={};INCENTIVE_DESIGNATION_GROUPS.forEach(g=>{m[g]=loadTargetMultipliersForGroup(salon?.id,g);});return m;
  });
  useEffect(()=>{const m={};INCENTIVE_DESIGNATION_GROUPS.forEach(g=>{m[g]=loadTargetMultipliersForGroup(salon?.id,g);});setTargetMultByGroupState(m);},[salon?.id]);
  const setTargetMultGroupField=(group,field,value)=>{
    const cur=targetMultByGroup[group]||INCENTIVE_TARGET_MULT_DEFAULTS;
    const next={...cur,[field]:value===''?0:Number(value)};
    setTargetMultByGroupState(prev=>({...prev,[group]:next}));
    saveTargetMultipliersForGroup(salon?.id,group,next);setActualsTick(t=>t+1);
  };

  // ── Rate/Amount Source — per category, Automatic (linked to that category's rule/settings
  // below) vs Manual Rate % vs Manual Amount ₹, per outlet. ──
  const [calcMode,setCalcModeState]=useState(()=>loadIncentiveCalcMode(salon?.id));
  useEffect(()=>{setCalcModeState(loadIncentiveCalcMode(salon?.id));},[salon?.id]);
  const setCalcModeField=(field,value)=>{
    const next={...calcMode,[field]:value};
    setCalcModeState(next);saveIncentiveCalcMode(salon?.id,next);setActualsTick(t=>t+1);
  };

  // ── Model 1 — Service Incentive Rate Slabs — one shared table, or one per designation group
  // when Service is split (svcActiveGroup picks which group's table is showing/being edited). ──
  const svcSlabGroup=splitMode.service?svcActiveGroup:undefined;
  const [svcSlabs,setSvcSlabsState]=useState(()=>loadServiceSlabs(salon?.id,svcSlabGroup));
  useEffect(()=>{setSvcSlabsState(loadServiceSlabs(salon?.id,svcSlabGroup));},[salon?.id,splitMode.service,svcActiveGroup]);
  const setSvcSlabField=(idx,field,value)=>{
    const next=svcSlabs.map((t,i)=>i===idx?{...t,[field]:value===''?'':Number(value)}:t);
    setSvcSlabsState(next);saveServiceSlabs(salon?.id,next,svcSlabGroup);setActualsTick(t=>t+1);
  };

  // ── Model 1 — Manager Incentive ──

  // ── Model 1 — Manager Incentive — one shared Rule Type + Rule B worksheet, or one per manager
  // level (Salon Manager/Manager/Assist Manager) when "Split by Manager Level" is on. Rule A's
  // pool stays outlet-wide either way (it's a single salon-wide collection split by each
  // manager's own Share %, not a per-level rate). ──
  const mgrGroup=splitMode.manager?mgrActiveLevel:undefined;
  const [mgrRuleType,setMgrRuleTypeState]=useState(()=>loadMgrRuleType(salon?.id,mgrGroup));
  useEffect(()=>{setMgrRuleTypeState(loadMgrRuleType(salon?.id,mgrGroup));},[salon?.id,splitMode.manager,mgrActiveLevel]);
  const setMgrRuleType=(t)=>{setMgrRuleTypeState(t);saveMgrRuleType(salon?.id,t,mgrGroup);};
  const [mgrRuleBInputs,setMgrRuleBInputsState]=useState(()=>loadMgrRuleBInputs(salon?.id,selYear,selMonth,mgrGroup));
  useEffect(()=>{setMgrRuleBInputsState(loadMgrRuleBInputs(salon?.id,selYear,selMonth,mgrGroup));},[selYear,selMonth,salon?.id,splitMode.manager,mgrActiveLevel]);
  const setMgrRuleBField=(field,value)=>{
    const next={...mgrRuleBInputs,[field]:value};
    setMgrRuleBInputsState(next);saveMgrRuleBInputs(salon?.id,selYear,selMonth,next,mgrGroup);
  };
  // % of Achievement = Manager Target ÷ Total Salon Sale (for whatever months window is entered)
  // × 100, per the formula as given. Commission Payable = Commission Amount − whatever's already
  // been paid out to them. Both computed live — everything else on Rule B stays hand-entered.
  const rbMonths=mgrRuleBInputs.months;
  const rbTotalSale=Number(mgrRuleBInputs.totalSale3mo)||0;
  const rbTarget=Number(mgrRuleBInputs.mgrTarget)||0;
  const rbAchievementPct=rbTotalSale?(rbTarget/rbTotalSale*100):0;
  const rbCommissionAmt=Number(mgrRuleBInputs.commissionAmt)||0;
  const rbAlreadyPaid=Number(mgrRuleBInputs.alreadyPaid)||0;
  const rbCommissionPayable=rbCommissionAmt-rbAlreadyPaid;
  const [mgrTiers,setMgrTiersState]=useState(()=>loadMgrIncentiveTiers(salon?.id));
  const setMgrTierField=(idx,field,value)=>{
    const next=mgrTiers.map((t,i)=>i===idx?{...t,[field]:value===''?'':Number(value)}:t);
    setMgrTiersState(next);saveMgrIncentiveTiers(salon?.id,next);
  };
  const [mgrInputs,setMgrInputsState]=useState(()=>loadMgrIncentiveInputs(salon?.id,selYear,selMonth));
  useEffect(()=>{setMgrInputsState(loadMgrIncentiveInputs(salon?.id,selYear,selMonth));},[selYear,selMonth,salon?.id]);
  const setMgrInputField=(field,value)=>{
    const next={...mgrInputs,[field]:value};
    setMgrInputsState(next);saveMgrIncentiveInputs(salon?.id,selYear,selMonth,next);
  };
  const setMgrShare=(empId,value)=>{
    const next={...mgrInputs,shares:{...mgrInputs.shares,[empId]:value===''?'':Number(value)}};
    setMgrInputsState(next);saveMgrIncentiveInputs(salon?.id,selYear,selMonth,next);
  };
  const managerEmployees=getEmployeesForMonth(selYear,selMonth,salon?.id).filter(e=>MANAGER_DESIGNATIONS.has(e.desig));
  // Total Collection is linked from Collection Reco (Cash+Card+UPI+District+Luzo+Online, minus
  // whichever items are unchecked below) — no longer a manual entry. Net of GST = Total × 1.05.
  const [mgrCollItems,setMgrCollItemsState]=useState(()=>loadMgrCollectionItems(salon?.id));
  const toggleMgrCollItem=(key)=>{
    const next={...mgrCollItems,[key]:!mgrCollItems[key]};
    setMgrCollItemsState(next);saveMgrCollectionItems(salon?.id,next);
  };
  const mgrCollSum=mgrCollectionSumFor(salon?.id,selYear,selMonth);
  const mgrTotalCollection=MGR_COLLECTION_ITEMS.reduce((s,it)=>s+(mgrCollItems[it.key]?(mgrCollSum[it.key]||0):0),0);
  const mgrNetCollection=mgrTotalCollection/1.05;
  const mgrTargetCollection=Number(mgrInputs.targetCollection)||0;
  const mgrAchievementPct=mgrTargetCollection?(mgrNetCollection/mgrTargetCollection*100):0;
  const mgrApplicableRate=mgrIncentiveRateFor(salon?.id,mgrAchievementPct);
  const mgrIncentivePool=Math.round(mgrNetCollection*mgrApplicableRate/100);
  const mgrTotalSharePct=managerEmployees.reduce((s,e)=>s+(Number(mgrInputs.shares?.[e.id])||0),0);

  // Incentive data per employee — shared with Salary Working & P&L's Employee Cost
  const incData=incWorkingsFor(salon?.id,selYear,selMonth);
  // ── Send Summary for Approval — same separation as Salary Working's own version above (see
  // that comment for the full rationale): a read-only snapshot of each employee's final
  // incentive figures (Service/Membership/Product/Manager Incentive, Penalty, Total) goes
  // straight to Salon Manager/ASM for Approve/Return, without any access to this working sheet. ──
  const [iwSummaryTick,setIwSummaryTick]=useState(0);
  const incentiveSummaryRec=useMemo(()=>summaryApprovalFor(salon?.id,'incentive',selYear,selMonth),[salon?.id,selYear,selMonth,iwSummaryTick]);
  const sendIncentiveSummary=()=>{
    const rows=incData.map(w=>({empId:w.id,name:w.name,desig:w.desig,svcInc:w.svcIncAmt,memInc:w.memIncAmt,prodInc:w.prodIncAmt,mgrInc:w.mgrIncAmt,penalty:w.penaltyAmt,total:w.totalInc}));
    const total=rows.reduce((s,r)=>s+r.total,0);
    sendSummaryForApproval(salon?.id,'incentive',selYear,selMonth,rows,total,user?.name);
    setIwSummaryTick(t=>t+1);
    success('Incentive Summary sent to Salon Manager/ASM for approval');
  };
  // ── Selection — pick specific employees to export/share instead of always the whole list.
  // Empty selection = share everyone (unchanged default behaviour); any selection narrows every
  // export/share action below to just those rows. Independent of the column filters above —
  // filtering narrows what's shown, selection narrows what's exported. ──
  const [iwSelectedIds,setIwSelectedIds]=useState(new Set());
  useEffect(()=>{setIwSelectedIds(new Set());},[selMonth,selYear,salon?.id]);
  const iwToggleSelect=(id)=>setIwSelectedIds(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});
  const exportIncData=iwSelectedIds.size>0?incData.filter(e=>iwSelectedIds.has(e.id)):incData;
  const setActual=(empId,field,value)=>{
    if(iwMetaFor(empId).status==='Approved')return; // locked — must be unapproved first
    if(iwMonthLocked){iwError('This month is locked — unlock it above to make changes.');return;}
    const actuals=loadIncentiveActuals(salon?.id);
    const key=incActualKey(empId,selYear,selMonth);
    const n=value===''?0:Number(value);
    actuals[key]={...actuals[key],[field]:isNaN(n)?0:n};
    saveIncentiveActuals(actuals,salon?.id);
    setActualsTick(t=>t+1);
  };
  const actualInput=(empId,field,val,disabled)=>React.createElement('input',{
    type:'number',defaultValue:val||'',placeholder:'0',disabled:!!disabled,
    onBlur:e=>setActual(empId,field,e.target.value),
    onKeyDown:e=>{if(e.key==='Enter')e.target.blur();},
    style:{width:72,textAlign:'right',background:disabled?'var(--bg2)':'var(--bg3)',border:'1px solid var(--border)',borderRadius:4,color:disabled?'var(--text3)':'var(--text)',fontSize:11.5,padding:'4px 6px',cursor:disabled?'not-allowed':'text'}
  });
  const setRate=(empId,field,value)=>{
    if(iwMetaFor(empId).status==='Approved')return; // locked — must be unapproved first
    if(iwMonthLocked){iwError('This month is locked — unlock it above to make changes.');return;}
    const n=value===''?0:Number(value);
    saveIncentiveRate(salon?.id,empId,selYear,selMonth,field,isNaN(n)?0:n);
    setActualsTick(t=>t+1);
  };
  const rateInput=(empId,field,val,disabled)=>React.createElement('input',{
    type:'number',step:'0.1',defaultValue:val,placeholder:'0',disabled:!!disabled,
    onBlur:e=>setRate(empId,field,e.target.value),
    onKeyDown:e=>{if(e.key==='Enter')e.target.blur();},
    style:{width:56,textAlign:'right',background:disabled?'var(--bg2)':'var(--bg3)',border:'1px solid var(--border)',borderRadius:4,color:disabled?'var(--text3)':'var(--text)',fontSize:11.5,padding:'4px 6px',cursor:disabled?'not-allowed':'text'}
  });
  // Manual Amount ₹ override input — same store/pattern as rateInput (saveIncentiveRate is
  // generic per-field), used for the Svc/Mem/Prod Inc columns when that category's Rate & Amount
  // Source is set to "Manual Amount ₹".
  const amtInput=(empId,field,val,disabled)=>React.createElement('input',{
    type:'number',defaultValue:val||'',placeholder:'0',disabled:!!disabled,
    onBlur:e=>setRate(empId,field,e.target.value),
    onKeyDown:e=>{if(e.key==='Enter')e.target.blur();},
    style:{width:76,textAlign:'right',background:disabled?'var(--bg2)':'var(--bg3)',border:'1px solid var(--border)',borderRadius:4,color:disabled?'var(--text3)':'var(--text)',fontSize:11.5,padding:'4px 6px',cursor:disabled?'not-allowed':'text'}
  });
  // Achievement (times) display preference — decimal places and rounding direction, shared
  // across the whole sheet, persisted per outlet.
  const [timesFmt,setTimesFmtState]=useState(()=>loadIncTimesFormat(salon?.id));
  const setTimesFmt=(patch)=>{const next={...timesFmt,...patch};setTimesFmtState(next);saveIncTimesFormat(salon?.id,next);};

  const ColToggle=({k,label})=>React.createElement('label',{style:{display:'flex',alignItems:'center',gap:6,fontSize:11,color:cols[k]?'var(--text)':'var(--text3)',cursor:'pointer',padding:'4px 8px',background:cols[k]?'rgba(47,95,224,0.1)':'var(--bg3)',borderRadius:'var(--r)',border:'1px solid '+(cols[k]?'rgba(47,95,224,0.3)':'var(--border)')}},
    React.createElement('input',{type:'checkbox',checked:cols[k],onChange:()=>toggleCol(k)}),label
  );

  const pctBar=(pct)=>React.createElement('div',{style:{minWidth:80}},
    React.createElement('div',{style:{fontSize:11,marginBottom:2,color:pct>=100?'var(--green)':pct>=80?'var(--accent)':'var(--red)'}},(pct||0)+'%'),
    React.createElement('div',{className:'progress',style:{height:4}},
      React.createElement('div',{className:'progress-fill',style:{width:Math.min(100,pct||0)+'%',background:pct>=100?'var(--green)':pct>=80?'var(--accent)':'var(--red)'}})
    )
  );
  // Same look as pctBar, but the Achievement column now reads in ×times against the category's
  // target multiplier (5x Service / 3x Membership / 2x Product) instead of a percentage.
  const timesBar=(raw,targetTimes)=>{
    const pctOfTarget=targetTimes?(raw||0)/targetTimes*100:0;
    const color=pctOfTarget>=100?'var(--green)':pctOfTarget>=80?'var(--accent)':'var(--red)';
    return React.createElement('div',{style:{minWidth:80}},
      React.createElement('div',{style:{fontSize:11,marginBottom:2,color}},formatTimes(raw||0,timesFmt)),
      React.createElement('div',{className:'progress',style:{height:4}},
        React.createElement('div',{className:'progress-fill',style:{width:Math.min(100,pctOfTarget)+'%',background:color}})
      )
    );
  };

  const thG=(label,cols2,bg)=>React.createElement('th',{colSpan:cols2,style:{padding:'6px 8px',background:bg||'var(--bg3)',color:'var(--text2)',fontSize:10,fontWeight:700,textTransform:'uppercase',textAlign:'center',borderBottom:'1px solid var(--border2)',letterSpacing:'0.06em'}},label);
  const th2=(txt,onClick,bg)=>React.createElement('th',{onClick,title:onClick?'Go to '+txt+' working':undefined,style:{padding:'7px 8px',background:bg||'var(--bg3)',color:onClick?'var(--accent2)':'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',whiteSpace:'nowrap',borderBottom:'2px solid var(--accent)',textAlign:'right',minWidth:80,cursor:onClick?'pointer':'default',textDecoration:onClick?'underline':'none',textUnderlineOffset:'2px'}},txt+(onClick?' 🔗':''));
  const td2=(val,color,bold,bg)=>React.createElement('td',{style:{padding:'8px 8px',fontSize:11,textAlign:'right',color:color||'var(--text2)',fontWeight:bold?600:400,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',background:bg||undefined}},val);
  const fmt=(n)=>n?'₹'+Math.round(n).toLocaleString('en-IN'):'—';
  // Export/report display for the Prod % column — Rule 2 (flat ₹ amount) has no rate at all, so
  // exports show the flat amount instead of a stray "null%".
  const prodRateDisplay=(e)=>e.prodRuleType==='B'&&e.calcMode?.prod!=='manualRate'?'Flat ₹'+e.prodFlatAmount:e.prodRateUsed+'%';

  // ── Excel-style column filters (Name/Desig./Status/Payment Status) — uses the same shared
  // useExcelColumnFilter hook other tables in the app use, rather than a one-off dropdown, so the
  // checklist popover renders via a Portal straight to document.body. That matters here: this
  // table sits inside a horizontally-scrolling wrapper, and a plain position:absolute dropdown
  // gets clipped/cut off by that wrapper's own overflow — the Portal escapes that clipping
  // entirely, positioning itself with position:fixed off the header's own screen coordinates.
  const IW_FILTER_COLS=[
    {key:'name',label:'Name',get:e=>e.name},
    {key:'desig',label:'Desig.',get:e=>e.desig},
    {key:'status',label:'Status',get:e=>iwMetaFor(e.id).status},
    {key:'paymentStatus',label:'Payment Status',get:e=>iwMetaFor(e.id).paymentStatus}
  ];
  const {filteredRows:visibleIncData,TH:filterTH,Portal:FilterPortal,hasActiveFilters,clearAll:clearAllFilters}=useExcelColumnFilter(incData,IW_FILTER_COLS);
  // What the Total row sums — the filtered view, further narrowed to just the selected rows
  // when a selection is active, so the row label ("Total" vs "Total (selected)") always matches
  // what the numbers actually add up.
  const iwTotalRowData=iwSelectedIds.size>0?visibleIncData.filter(e=>iwSelectedIds.has(e.id)):visibleIncData;

  // Total row — sums every numeric column over exactly whichever employees are being exported
  // right now (exportIncData: the selection if one's active, otherwise everyone), matching the
  // same fields the on-screen Total row sums. Shared by the CSV export, PDF share, and Word
  // share below, so all three always agree with the on-screen Total row and each other.
  const iwExportTotalLabel='Total'+(iwSelectedIds.size>0?' (selected)':'');
  const iwSum=(f)=>exportIncData.reduce((s,e)=>s+(Number(e[f])||0),0);
  const exportExcel=async()=>{
    const filename='IncentiveWorking_'+MONTHS[selMonth]+'_'+selYear+(iwSelectedIds.size>0?'_selected':'')+'.xlsx';
    try{
      const blob=await buildIncentiveWorkingExcelBlob({title:iwReportTitle,incData:exportIncData,targetMult,includeBankDetails:cols.bankDetails,includeOT:cols.ot});
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
    }catch(err){iwError(err.message);}
  };

  // ── Share — PDF (static snapshot), Word, and Excel (live formulas — see
  // buildIncentiveWorkingExcelBlob) via the same reusable Share modal used across the app. ──
  const iwReportTitle='Incentive Working — '+MONTHS[selMonth]+' '+selYear+(salon?' — '+salon.name.split('—')[0].trim():'')+(iwSelectedIds.size>0?' (selected)':'');
  const iwTotalRaw=[iwExportTotalLabel,'',iwSum('salary'),iwSum('svcTarget'),iwSum('svcActual'),'',iwSum('memTarget'),iwSum('memActual'),'',iwSum('prodTarget'),iwSum('prodActual'),'',iwSum('totalTarget'),iwSum('totalActual'),'','','','',iwSum('penaltyAmt'),iwSum('advAdj'),iwSum('svcIncAmt'),iwSum('memIncAmt'),iwSum('prodIncAmt'),iwSum('mgrIncAmt'),iwSum('totalInc')];
  if(cols.bankDetails)iwTotalRaw.push('','','');
  if(cols.ot)iwTotalRaw.push(iwSum('otAmt'));
  const iwReportBodyHtml=()=>{
    const headers=['Employee','Designation','Salary','Svc Target','Svc Achieved','Svc Achv. (×)','Mem Target','Mem Achieved','Mem Achv. (×)','Prod Target','Prod Achieved','Prod Achv. (×)','Total Target','Total Achieved','Total Achv. (×)','Svc Rate %','Mem Rate %','Prod Rate %','Penalty','Advance Adj.','Svc Inc','Mem Inc','Prod Inc','Mgr Inc','Total Incentive'];
    if(cols.bankDetails)headers.push('Bank Name','Account No.','IFSC Code');
    if(cols.ot)headers.push('OT Inc');
    const headRow='<tr>'+headers.map((h,i)=>'<th'+(i<2?'':' class="num"')+'>'+h+'</th>').join('')+'</tr>';
    const bodyRows=exportIncData.map(e=>{
      const cells=[e.name,e.desig,fmt(e.salary),fmt(e.svcTarget),fmt(e.svcActual),formatTimes(e.svcTimesRaw,timesFmt),fmt(e.memTarget),fmt(e.memActual),formatTimes(e.memTimesRaw,timesFmt),fmt(e.prodTarget),fmt(e.prodActual),formatTimes(e.prodTimesRaw,timesFmt),fmt(e.totalTarget),fmt(e.totalActual),formatTimes(e.totalTimesRaw,timesFmt),e.svcRateUsed+'%',e.memRateUsed+'%',prodRateDisplay(e),fmt(e.penaltyAmt),fmt(e.advAdj),fmt(e.svcIncAmt),fmt(e.memIncAmt),fmt(e.prodIncAmt),fmt(e.mgrIncAmt),fmt(e.totalInc)];
      if(cols.bankDetails)cells.push(e.bankName||'—',e.accountNo||'—',e.ifsc||'—');
      if(cols.ot)cells.push(e.otAmt?fmt(e.otAmt):'—');
      return '<tr>'+cells.map((c,i)=>'<td'+(i<2?'':' class="num"')+'>'+c+'</td>').join('')+'</tr>';
    }).join('');
    const totalRow='<tr style="font-weight:700;background:#f4f4f4">'+iwTotalRaw.map((v,i)=>'<td'+(i<2?'':' class="num"')+'>'+(typeof v==='number'?fmt(v):v)+'</td>').join('')+'</tr>';
    return '<table><thead>'+headRow+'</thead><tbody>'+bodyRows+totalRow+'</tbody></table>';
  };
  const iwReportSheetRows=()=>{
    const header=['Employee','Designation','Salary','Svc Target','Svc Achieved','Svc Achievement (Times)','Mem Target','Mem Achieved','Mem Achievement (Times)','Prod Target','Prod Achieved','Prod Achievement (Times)','Total Target','Total Achieved','Total Achievement (Times)','Svc Rate %','Mem Rate %','Prod Rate %','Penalty','Advance Adj.','Svc Inc','Mem Inc','Prod Inc','Mgr Inc','Total Incentive'];
    if(cols.bankDetails)header.push('Bank Name','Account No.','IFSC Code');
    if(cols.ot)header.push('OT Inc');
    return[header,
      ...exportIncData.map(e=>{
        const row=[e.name,e.desig,e.salary,e.svcTarget,e.svcActual,formatTimes(e.svcTimesRaw,timesFmt),e.memTarget,e.memActual,formatTimes(e.memTimesRaw,timesFmt),e.prodTarget,e.prodActual,formatTimes(e.prodTimesRaw,timesFmt),e.totalTarget,e.totalActual,formatTimes(e.totalTimesRaw,timesFmt),e.svcRateUsed,e.memRateUsed,prodRateDisplay(e),e.penaltyAmt,e.advAdj,e.svcIncAmt,e.memIncAmt,e.prodIncAmt,e.mgrIncAmt,e.totalInc];
        if(cols.bankDetails)row.push(e.bankName||'',e.accountNo||'',e.ifsc||'');
        if(cols.ot)row.push(e.otAmt||0);
        return row;
      }),
      iwTotalRaw];
  };
  // ── 📤 Share Workings — all or selected employees, and any of the workings behind the incentive ──
  const [shareWk,setShareWk]=useState(null); // null | {who:'all'|'selected', parts:{…}}
  const WK_PARTS=[['summary','Incentive summary (main sheet)'],['service','Service incentive working'],['membership','Membership incentive working'],
    ['product','Product incentive working'],['manager','Manager incentive'],['ot','Overtime (OT) working'],['deductions','Deductions (penalty, advance)'],['statement','Employee-wise statement']];
  const wkPeople=()=>shareWk&&shareWk.who==='selected'&&iwSelectedIds.size?incData.filter(e=>iwSelectedIds.has(e.id)):incData;
  const wkSections=()=>{
    const P=(shareWk&&shareWk.parts)||{},list=wkPeople(),out=[];
    const n=v=>Math.round(Number(v)||0);
    const add=(title,head,rows,total)=>out.push({title,head,rows,total});
    if(P.summary)add('Incentive summary',['Employee','Designation','Salary','Svc Inc','Mem Inc','Prod Inc','Mgr Inc',...(cols.ot?['OT Inc']:[]),'Penalty','Advance Adj.','Total Incentive'],
      list.map(e=>[e.name,e.desig,n(e.salary),n(e.svcIncAmt),n(e.memIncAmt),n(e.prodIncAmt),n(e.mgrIncAmt),...(cols.ot?[n(e.otAmt)]:[]),n(e.penaltyAmt),n(e.advAdj),n(e.totalInc)]),
      ['Total','',...['salary','svcIncAmt','memIncAmt','prodIncAmt','mgrIncAmt',...(cols.ot?['otAmt']:[]),'penaltyAmt','advAdj','totalInc'].map(k=>list.reduce((x,e)=>x+n(e[k]),0))]);
    if(P.service)add('Service incentive working',['Employee','Salary','Service Target','Service Achieved','Achievement (× salary)','Rate %','Service Incentive'],
      list.map(e=>[e.name,n(e.salary),n(e.svcTarget),n(e.svcActual),formatTimes(e.svcTimesRaw,timesFmt),e.svcRateUsed!=null?e.svcRateUsed:'',n(e.svcIncAmt)]),
      ['Total','',list.reduce((x,e)=>x+n(e.svcTarget),0),list.reduce((x,e)=>x+n(e.svcActual),0),'','',list.reduce((x,e)=>x+n(e.svcIncAmt),0)]);
    if(P.membership&&cols.membership)add('Membership incentive working',['Employee','Membership Target','Membership Achieved','Achievement (× salary)','Rate %','Membership Incentive'],
      list.map(e=>[e.name,n(e.memTarget),n(e.memActual),formatTimes(e.memTimesRaw,timesFmt),e.memRateUsed!=null?e.memRateUsed:'',n(e.memIncAmt)]),
      ['Total',list.reduce((x,e)=>x+n(e.memTarget),0),list.reduce((x,e)=>x+n(e.memActual),0),'','',list.reduce((x,e)=>x+n(e.memIncAmt),0)]);
    if(P.product&&cols.product)add('Product incentive working',['Employee','Product Target','Product Achieved','Achievement (× salary)','Rate %','Product Incentive'],
      list.map(e=>[e.name,n(e.prodTarget),n(e.prodActual),formatTimes(e.prodTimesRaw,timesFmt),e.prodRateUsed!=null?e.prodRateUsed:'',n(e.prodIncAmt)]),
      ['Total',list.reduce((x,e)=>x+n(e.prodTarget),0),list.reduce((x,e)=>x+n(e.prodActual),0),'','',list.reduce((x,e)=>x+n(e.prodIncAmt),0)]);
    if(P.manager){const m=list.filter(e=>n(e.mgrIncAmt)>0);add('Manager incentive',['Employee','Designation','Manager Incentive'],m.map(e=>[e.name,e.desig,n(e.mgrIncAmt)]),['Total','',m.reduce((x,e)=>x+n(e.mgrIncAmt),0)]);}
    if(P.ot&&cols.ot){const o=list.filter(e=>e.otApplicable);add('Overtime (OT) working — Salary ÷ days ÷ normal hours × OT hours',['Employee','Salary','Days in Month','Normal Hrs/Day','OT Hrs','Working','OT Amount'],
      o.map(e=>[e.name,n(e.salary),e.otDays,e.otNormalHours||'',e.otHours||'',e.otAmt>0?n(e.salary)+' ÷ '+e.otDays+' ÷ '+e.otNormalHours+' × '+e.otHours:'',n(e.otAmt)]),
      ['Total','','','',o.reduce((x,e)=>x+(e.otAmt>0?Number(e.otHours)||0:0),0),'',o.reduce((x,e)=>x+n(e.otAmt),0)]);}
    if(P.deductions)add('Deductions',['Employee','Non-Performance Penalty','Advance Adjustment','Total Deducted'],
      list.map(e=>[e.name,n(e.penaltyAmt),n(e.advAdj),n(e.penaltyAmt)+n(e.advAdj)]),
      ['Total',list.reduce((x,e)=>x+n(e.penaltyAmt),0),list.reduce((x,e)=>x+n(e.advAdj),0),list.reduce((x,e)=>x+n(e.penaltyAmt)+n(e.advAdj),0)]);
    if(P.statement)list.forEach(e=>add('Statement — '+e.name+' ('+e.desig+')',['Component','Amount'],
      [['Salary',n(e.salary)],['Service Incentive',n(e.svcIncAmt)],...(cols.membership?[['Membership Incentive',n(e.memIncAmt)]]:[]),...(cols.product?[['Product Incentive',n(e.prodIncAmt)]]:[]),
       ...(n(e.mgrIncAmt)?[['Manager Incentive',n(e.mgrIncAmt)]]:[]),...(cols.ot&&n(e.otAmt)?[['Overtime ('+e.otHours+' hrs)',n(e.otAmt)]]:[]),
       ...(n(e.penaltyAmt)?[['Less: Non-Performance Penalty',-n(e.penaltyAmt)]]:[]),...(n(e.advAdj)?[['Less: Advance Adjustment',-n(e.advAdj)]]:[])],
      ['Net Incentive Payable',n(e.totalInc)]));
    return out;
  };
  const wkTitle=()=>'Incentive Workings — '+MONTHS[selMonth]+' '+selYear+(salon?' — '+salon.name.split('—')[0].trim():'')+(shareWk&&shareWk.who==='selected'&&iwSelectedIds.size?' ('+iwSelectedIds.size+' selected)':'');
  const wkBodyHtml=()=>wkSections().map(sec=>'<h3>'+sec.title+'</h3><table><thead><tr>'+sec.head.map((h,i)=>'<th'+(i?' class="num"':'')+'>'+h+'</th>').join('')+'</tr></thead><tbody>'
    +sec.rows.map(r=>'<tr>'+r.map((c,i)=>'<td'+(i?' class="num"':'')+'>'+(typeof c==='number'?rupee(c):c)+'</td>').join('')+'</tr>').join('')
    +(sec.total?'<tr class="total-row">'+sec.total.map((c,i)=>'<td'+(i?' class="num"':'')+'>'+(typeof c==='number'?rupee(c):c)+'</td>').join('')+'</tr>':'')+'</tbody></table>').join('');
  const wkSheetRows=()=>{const out=[];wkSections().forEach((sec,i)=>{if(i)out.push([]);out.push([sec.title]);out.push(sec.head);sec.rows.forEach(r=>out.push(r));if(sec.total)out.push(sec.total);});return out;};
  const iwBuildExcelBlob=()=>buildIncentiveWorkingExcelBlob({title:iwReportTitle,incData:exportIncData,targetMult,includeBankDetails:cols.bankDetails,includeOT:cols.ot});

  // ── Generate Incentive — same explicit-action pattern as Salary Working's "Generate Salary"
  // (see its comment): figures are always live-computed from incWorkingsFor() for whichever
  // month/year is selected, so this doesn't run a separate calculation the header dropdowns
  // wouldn't already trigger — it's a deliberate, one-click "generate this month" action instead
  // of only the plain selects, with a confirmation of how many employees it covers (Helper and
  // Housekeeper are excluded from Incentive Working itself, same as the rest of this sheet).
  const [showIwGenerate,setShowIwGenerate]=useState(false);
  const [iwGenMonth,setIwGenMonth]=useState(selMonth);
  const [iwGenYear,setIwGenYear]=useState(selYear);
  const openIwGenerate=()=>{setIwGenMonth(selMonth);setIwGenYear(selYear);setShowIwGenerate(true);};
  const runIwGenerate=()=>{
    setSelMonth(iwGenMonth);setSelYear(iwGenYear);setShowIwGenerate(false);
    const n=getEmployeesForMonth(iwGenYear,iwGenMonth,salon?.id).filter(e=>e.desig!=='Helper'&&e.desig!=='Housekeeper').length;
    success('Incentive generated for '+MONTHS[iwGenMonth]+' '+iwGenYear+' — '+n+' employee'+(n===1?'':'s'));
  };

  return React.createElement('div',{className:'fade-in',style:{position:'relative'}},
    React.createElement(WatermarkOverlay,{text:iwMonthLocked?'FINAL':'DRAFT',final:iwMonthLocked}),
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Incentive Working Sheet'),
        (()=>{const p=incPlanFor(salon?.id,selYear,selMonth);const ok=p&&p.status==='Approved';
          return React.createElement('div',{style:{fontSize:11.5,marginTop:4,color:ok?'var(--green)':'var(--orange)'}},ok?'✓ Worked out from the approved '+MONTHS[selMonth]+' Incentive Plan (approved by '+(p.approvedBy||'—')+')':p&&p.status==='Pending'?'⏳ '+MONTHS[selMonth]+' plan waiting for approval — using current settings':'⚠ No approved Incentive Plan for '+MONTHS[selMonth]+' — using current settings (Monthly Plan tab)');})(),
        React.createElement('div',{className:'page-sub'},MONTHS[selMonth]+' '+selYear+' — enter each employee\'s Achieved figures below; Target and everything else calculates automatically · Excludes Helper & Housekeeper')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selMonth,onChange:e=>setSelMonth(Number(e.target.value))},MONTHS.map((m,i)=>React.createElement('option',{key:m,value:i},m))),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selYear,onChange:e=>setSelYear(Number(e.target.value))},appYears().map(y=>React.createElement('option',{key:y},y))),
        React.createElement('button',{className:'btn btn-primary btn-sm',onClick:openIwGenerate},'🧮 Generate Incentive'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setShowSettings(true)},'⚙ Incentive Rules & Settings'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},onClick:exportExcel},iwSelectedIds.size>0?'⬇ Export Selected ('+iwSelectedIds.size+')':'⬇ Export Excel'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Share the incentive workings — all or selected employees, and any of the workings',
          onClick:()=>setShareWk({who:iwSelectedIds.size?'selected':'all',parts:{summary:true,service:true,membership:!!cols.membership,product:!!cols.product,manager:true,ot:!!cols.ot,deductions:true,statement:false}})},'📤 Share Workings'),
        React.createElement(ShareReportButton,{title:iwReportTitle,subtitle:'Incentive Working',getBodyHtml:iwReportBodyHtml,getSheetRows:iwReportSheetRows,buildExcelBlob:iwBuildExcelBlob,landscape:true,watermark:iwMonthLocked?'FINAL':'DRAFT'}),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:doRefresh},'⟳ Refresh'),
        !iwMonthLocked&&React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:lockIWMonth},'🔒 Lock Incentive Working'),
        !iwMonthLocked&&React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:lockEntireMonthIW},'🔒 Lock Entire Month'),
        !iwMonthLocked&&React.createElement('button',{className:'btn btn-success btn-sm',onClick:approveAllIW},'✓ Approve All'),
        // ── Send Summary for Approval — see comment above sendIncentiveSummary. Deliberately kept
        // separate from the Approve/Lock controls to its left: those govern this working sheet's
        // own row-level status, this sends a read-only snapshot to Salon Manager/ASM instead. ──
        React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(47,95,224,0.12)',border:'1px solid rgba(47,95,224,0.35)',color:'var(--accent)',padding:'6px 12px',borderRadius:'var(--r)',cursor:'pointer',fontWeight:600},
          title:'Sends a read-only summary of each employee\'s final incentive figures to Salon Manager/ASM for their own Approve/Return — without giving them any access to this working sheet.',
          onClick:sendIncentiveSummary},'📤 Send Summary for Approval'),
        incentiveSummaryRec&&React.createElement('span',{className:'badge '+(incentiveSummaryRec.status==='Approved'?'badge-green':incentiveSummaryRec.status==='Returned'?'badge-red':'badge-amber'),
          title:incentiveSummaryRec.status==='Approved'?'Approved by '+incentiveSummaryRec.approvedBy+' on '+fmtDMY(incentiveSummaryRec.approvedAt.slice(0,10)):incentiveSummaryRec.status==='Returned'?'Returned'+(incentiveSummaryRec.remarks?': '+incentiveSummaryRec.remarks:''):'Sent '+fmtDMY(incentiveSummaryRec.sentAt.slice(0,10))+' by '+incentiveSummaryRec.sentBy+' — awaiting review'},
          incentiveSummaryRec.status==='Approved'?'✓ Summary Approved':incentiveSummaryRec.status==='Returned'?'↩ Summary Returned':'⏳ Summary Sent')
      )
    ),

    showIwGenerate&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowIwGenerate(false)},
      React.createElement('div',{className:'modal',style:{width:380},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'🧮 Generate Incentive'),
        React.createElement('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:14,lineHeight:1.5}},'Pick the month to compute Incentive Working for — figures are calculated live from each employee\'s Achieved entries, same as this sheet always does.'),
        React.createElement('div',{className:'form-row cols2',style:{marginBottom:16}},
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Month'),
            React.createElement('select',{className:'form-control',value:iwGenMonth,onChange:e=>setIwGenMonth(Number(e.target.value))},MONTHS.map((m,i)=>React.createElement('option',{key:m,value:i},m)))),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Year'),
            React.createElement('select',{className:'form-control',value:iwGenYear,onChange:e=>setIwGenYear(Number(e.target.value))},appYears().map(y=>React.createElement('option',{key:y},y))))
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowIwGenerate(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:runIwGenerate},'Generate')
        )
      )
    ),

    iwMonthLocked&&React.createElement('div',{className:'success-card success-card-sm',style:{display:'flex',alignItems:'center',gap:10,color:'var(--text)',marginBottom:14}},
      React.createElement('span',{style:{fontSize:16}},'🔒'),
      React.createElement('span',null,MONTHS[selMonth]+' '+selYear+' Incentive Working is locked'+(
        (iwMonthLockRec&&iwMonthLockRec.scope==='all')
          ?' — locked from Master Sheet (Attendance, Salary Working and Incentive Working are all read-only this month).'
          :(iwMonthLockRec&&iwMonthLockRec.source==='manual')
            ?' — locked manually for Incentive Working. Attendance and Salary Working are unaffected.'
            :' — every employee was marked Approved on Incentive Working.'
      )),
      React.createElement('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:'auto',whiteSpace:'nowrap'},onClick:unlockIWMonth},'🔓 Unlock Incentive Working')
    ),

    shareWk&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShareWk(null)},
      React.createElement('div',{className:'modal',style:{width:520,maxWidth:'96vw'},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Share incentive workings — '+MONTHS[selMonth]+' '+selYear),
        React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}},'Employees'),
        React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:6,marginBottom:14}},
          React.createElement('label',{style:{display:'flex',gap:8,alignItems:'center',fontSize:13,cursor:'pointer'}},React.createElement('input',{type:'radio',name:'wkWho',checked:shareWk.who==='all',onChange:()=>setShareWk(w=>({...w,who:'all'}))}),'All employees ('+incData.length+')'),
          React.createElement('label',{style:{display:'flex',gap:8,alignItems:'center',fontSize:13,cursor:iwSelectedIds.size?'pointer':'not-allowed',color:iwSelectedIds.size?'var(--text)':'var(--text3)'}},
            React.createElement('input',{type:'radio',name:'wkWho',disabled:!iwSelectedIds.size,checked:shareWk.who==='selected',onChange:()=>setShareWk(w=>({...w,who:'selected'}))}),
            iwSelectedIds.size?'Selected employees ('+iwSelectedIds.size+')':'Selected employees — tick employees in the table first')),
        React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:6}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.05em'}},'Workings to include'),
          React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:10.5,padding:'1px 8px',marginLeft:'auto'},onClick:()=>setShareWk(w=>({...w,parts:Object.fromEntries(WK_PARTS.map(([k])=>[k,true]))}))},'All'),
          React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:10.5,padding:'1px 8px'},onClick:()=>setShareWk(w=>({...w,parts:{}}))},'None')),
        React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:16}},
          WK_PARTS.filter(([k])=>!((k==='membership'&&!cols.membership)||(k==='product'&&!cols.product)||(k==='ot'&&!cols.ot))).map(([k,l])=>React.createElement('label',{key:k,style:{display:'flex',gap:8,alignItems:'center',fontSize:12.5,cursor:'pointer'}},
            React.createElement('input',{type:'checkbox',checked:!!shareWk.parts[k],onChange:e=>setShareWk(w=>({...w,parts:{...w.parts,[k]:e.target.checked}}))}),l))),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShareWk(null)},'Cancel'),
          Object.values(shareWk.parts).some(Boolean)
            ?React.createElement(ShareReportButton,{title:wkTitle(),subtitle:'Incentive Workings',getBodyHtml:wkBodyHtml,getSheetRows:wkSheetRows,landscape:true,watermark:iwMonthLocked?'FINAL':'DRAFT'})
            :React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'Tick at least one working')))),
    showSettings&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowSettings(false)},
      React.createElement('div',{className:'modal',style:{width:900,maxWidth:'95vw'},onClick:e=>e.stopPropagation()},
        React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}},
          React.createElement('div',{className:'modal-title',style:{marginBottom:0,paddingBottom:0,border:'none'}},'Incentive Rules & Settings'),
          React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setShowSettings(false)},'\u2715 Close')
        ),
        React.createElement('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:16,paddingBottom:12,borderBottom:'1px solid var(--border)'}},'Applicability, Target Multipliers, category rules, Manager Incentive, and display preferences for '+MONTHS[selMonth]+' '+selYear+' \u2014 changes save immediately and apply live to the table behind this.'),

    // ── Quick Setup vs Advanced Settings — Applicability, Target Multipliers, and each
    // category's core rate/rule stay visible either way (that's the minimum every outlet needs
    // to touch once). Everything about running separate plans per designation or per employee —
    // Incentive Plans, Employee Plan Assignment, and every "Split by Designation" toggle — stays
    // out of sight until this is switched on, so a first-time setup isn't showing six extra
    // concepts nobody asked for yet. ──
    React.createElement('label',{style:{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:showAdvanced?'rgba(47,95,224,0.08)':'var(--bg3)',border:'1px solid '+(showAdvanced?'rgba(47,95,224,0.3)':'var(--border)'),borderRadius:'var(--r)',marginBottom:14,cursor:'pointer'}},
      React.createElement('div',{className:'toggle-switch'+(showAdvanced?' on':''),onClick:()=>setShowAdvanced(v=>!v)}),
      React.createElement('div',null,
        React.createElement('div',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},'Advanced Settings'),
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},'Different plans per Designation or per employee, custom plan names, split Manager levels. Off by default — most outlets never need this.')
      )
    ),

    // Applicability — master on/off checks for each incentive category
    React.createElement('div',{className:'card',style:{marginBottom:14}},
      React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}},'Applicability'),
      React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'Switch a category off to exclude it from this outlet\'s Incentive Working altogether — its amount goes to zero and its rule section below hides, without losing anything already entered in it.'),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        [['service','Service Incentive','var(--blue)','74,158,255'],['membership','Membership Incentive','var(--purple)','139,127,232'],['product','Product Incentive','var(--teal)','78,205,196'],['manager','Manager Incentive','var(--orange)','255,159,67']].map(([k,lbl,color,rgb])=>
          React.createElement('label',{key:k,style:{display:'flex',alignItems:'center',gap:6,fontSize:12,fontWeight:600,color:applicability[k]?color:'var(--text3)',cursor:'pointer',padding:'6px 10px',background:applicability[k]?'rgba('+rgb+',0.12)':'var(--bg3)',borderRadius:'var(--r)',border:'1px solid '+(applicability[k]?'rgba('+rgb+',0.4)':'var(--border)')}},
            React.createElement('input',{type:'checkbox',checked:applicability[k],onChange:()=>toggleApplicability(k)}),lbl
          )
        )
      )
    ),

    // ── Incentive Plans — the 4 built-in designation groups, plus any custom plans this outlet
    // has added for cases where two employees sharing a Designation need genuinely different
    // incentive rules. Each plan gets its own slabs/rates in every section below, same as the
    // built-in groups always have — just pick it from the Split-by-Designation tabs there once
    // it's added here. ──
    showAdvanced&&React.createElement('div',{className:'card',style:{marginBottom:14}},
      React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}},'Incentive Plans'),
      React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'Hairdresser / Beautician / Pedicurist / Manager are built in. Add a custom plan here for a case where two employees with the SAME Designation still need separate rules — assign specific employees to it under "Employee Plan Assignment" below.'),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}},
        incentivePlans.map(g=>{
          const isCustom=!INCENTIVE_DESIGNATION_GROUPS.includes(g);
          return React.createElement('span',{key:g,style:{display:'inline-flex',alignItems:'center',gap:6,fontSize:12,fontWeight:600,color:'var(--text2)',padding:'6px 10px',background:'var(--bg3)',borderRadius:'var(--r)',border:'1px solid var(--border)'}},
            g,
            isCustom&&React.createElement('span',{title:'Remove this custom plan — employees assigned to it fall back to their own Designation\'s default plan',style:{cursor:'pointer',color:'var(--red)',fontSize:13,lineHeight:1},onClick:()=>removeCustomPlan(g)},'✕')
          );
        })
      ),
      React.createElement('div',{style:{display:'flex',gap:8,alignItems:'center'}},
        React.createElement('input',{className:'form-control',style:{maxWidth:240,fontSize:12},placeholder:'e.g. Hairdresser - Senior',value:newPlanName,onChange:e=>setNewPlanName(e.target.value),onKeyDown:e=>{if(e.key==='Enter')addCustomPlan();}}),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:addCustomPlan},'+ Add Plan')
      )
    ),

    // ── Employee Plan Assignment — override which plan an individual employee follows, instead
    // of the plan their own Designation would otherwise map to. Blank = follow Designation. ──
    incData.length>0&&showAdvanced&&React.createElement('div',{className:'card',style:{marginBottom:14}},
      React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}},'Employee Plan Assignment'),
      React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'Every employee follows their own Designation\'s plan by default. Override one here only if they need to follow a different plan instead — e.g. one of two Unisex Hairdressers following a custom "Senior" plan.'),
      React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:6,maxHeight:260,overflowY:'auto'}},
        incData.map(e=>{
          const defaultGroup=INCENTIVE_DESIGNATION_GROUP_MAP[e.desig]||'Hairdresser';
          const current=planOverrides[e.id]||'';
          return React.createElement('div',{key:e.id,style:{display:'flex',alignItems:'center',gap:10,padding:'6px 10px',background:'var(--bg3)',borderRadius:'var(--r)',border:'1px solid var(--border)'}},
            React.createElement('div',{style:{flex:1,minWidth:0}},
              React.createElement('div',{style:{fontSize:12.5,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},e.name),
              React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)'}},e.desig+' · default: '+defaultGroup)
            ),
            React.createElement('select',{className:'form-control',style:{width:'auto',fontSize:11.5,padding:'4px 8px'},value:current,onChange:ev=>setEmployeePlanOverride(e.id,ev.target.value)},
              React.createElement('option',{value:''},'Follow Designation ('+defaultGroup+')'),
              incentivePlans.map(g=>React.createElement('option',{key:g,value:g},g))
            )
          );
        })
      )
    ),

    // ── Manual Override by Employee — pull one or two specific employees OUT of plan-based
    // calculation for just the categories that need it, without touching the outlet's plan (or
    // Rate & Amount Source above) for everyone else. Checked = that employee's ₹ amount for that
    // category is typed in directly on the Incentive Working sheet each month, same as the
    // outlet-wide "Manual Amount ₹" mode, just scoped to one person instead of everyone. Manager
    // Incentive has no outlet-wide manual mode at all (it's always Share %-of-pool) — this is the
    // only way to hand-type a Manager Incentive figure for one manager. ──
    incData.length>0&&showAdvanced&&React.createElement('div',{className:'card',style:{marginBottom:14}},
      React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}},'Manual Override by Employee'),
      React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'Every employee uses their plan\'s automatic calculation by default. Tick a box only for the one or two staff who need a hand-typed ₹ amount for that specific category instead — everyone else keeps calculating from the plan as normal.'),
      React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:6,maxHeight:280,overflowY:'auto'}},
        incData.map(e=>{
          const ov=manualOverrides[e.id]||{svc:false,mem:false,prod:false,mgr:false};
          const isManager=MANAGER_DESIGNATIONS.has(e.desig);
          const chip=(cat,label,color)=>React.createElement('label',{key:cat,style:{display:'flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,color:ov[cat]?color:'var(--text3)',cursor:'pointer',padding:'4px 8px',background:ov[cat]?'rgba(47,95,224,0.1)':'var(--bg2)',borderRadius:'var(--r)',border:'1px solid '+(ov[cat]?'rgba(47,95,224,0.3)':'var(--border)')}},
            React.createElement('input',{type:'checkbox',checked:ov[cat],onChange:()=>toggleEmployeeManualOverride(e.id,cat)}),label
          );
          return React.createElement('div',{key:e.id,style:{display:'flex',alignItems:'center',gap:10,padding:'6px 10px',background:'var(--bg3)',borderRadius:'var(--r)',border:'1px solid var(--border)',flexWrap:'wrap'}},
            React.createElement('div',{style:{flex:1,minWidth:120}},
              React.createElement('div',{style:{fontSize:12.5,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},e.name),
              React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)'}},e.desig)
            ),
            React.createElement('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},
              chip('svc','Svc','var(--blue)'),
              chip('mem','Mem','var(--purple)'),
              chip('prod','Prod','var(--teal)'),
              isManager&&chip('mgr','Mgr','var(--orange)')
            )
          );
        })
      )
    ),

    // Target Multipliers — editable ×Times of Salary for each category's Target
    React.createElement('div',{className:'card',style:{marginBottom:14}},
      React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}},'Target Multipliers'),
      React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'How many Times of Salary each category\'s Target is — edit any number and Target, the column header, and the achievement bar update automatically. A category shows one number per designation group once \u201cSplit by Designation\u201d is switched on for it below.'),
      React.createElement('div',{style:{display:'flex',gap:14,flexWrap:'wrap'}},
        [['Service','svc','service','var(--blue)','74,158,255'],['Membership','mem','membership','var(--purple)','139,127,232'],['Product','prod','product','var(--teal)','78,205,196']].map(([lbl,field,cat,color,rgb])=>
          React.createElement('div',{key:field,style:{padding:'8px 12px',borderRadius:'var(--r)',background:'rgba('+rgb+',0.08)',border:'1px solid rgba('+rgb+',0.3)'}},
            React.createElement('div',{style:{fontSize:11,color,fontWeight:700,marginBottom:4}},lbl),
            splitMode[cat]
              ?React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:4}},
                  incentivePlans.map(g=>React.createElement('div',{key:g,style:{display:'flex',alignItems:'center',gap:6}},
                    React.createElement('span',{style:{fontSize:11,color:'var(--text3)',minWidth:66}},g),
                    React.createElement('input',{type:'number',step:'0.1',className:'form-control',style:{width:58,fontSize:12},value:(targetMultByGroup[g]||INCENTIVE_TARGET_MULT_DEFAULTS)[field],onChange:e=>setTargetMultGroupField(g,field,e.target.value)})
                  ))
                )
              :React.createElement('div',{style:{display:'flex',alignItems:'center',gap:6}},
                  React.createElement('input',{type:'number',step:'0.1',className:'form-control',style:{width:70,fontSize:12.5},value:targetMult[field],onChange:e=>setTargetMultField(field,e.target.value)}),
                  React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'Times of Salary')
                )
          )
        )
      )
    ),

    // Rate & Amount Source — Automatic (linked) / Manual Rate % / Manual Amount ₹, per category
    React.createElement('div',{className:'card',style:{marginBottom:14}},
      React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}},'Rate & Amount Source'),
      React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'How each category\'s Incentive % and Incentive Amount are filled in on the Incentive Working sheet. Automatic links straight to that category\'s rule section below (Service Incentive Rate Slabs / Membership Incentive Rules / Product Incentive Rule\'s flat rate) — nothing to hand-enter, and the % shown on the sheet is read-only. Manual Rate % brings back a hand-entered % per employee, same as before. Manual Amount ₹ skips the rate altogether and lets the ₹ Incentive Amount itself be typed straight in per employee.'),
      React.createElement('div',{style:{display:'flex',gap:16,flexWrap:'wrap'}},
        [['Service','svc','var(--blue)','74,158,255'],['Membership','mem','var(--purple)','139,127,232'],['Product','prod','var(--teal)','78,205,196']].map(([lbl,field,color,rgb])=>
          React.createElement('div',{key:field,style:{padding:'8px 12px',borderRadius:'var(--r)',background:'rgba('+rgb+',0.08)',border:'1px solid rgba('+rgb+',0.3)',minWidth:180}},
            React.createElement('div',{style:{fontSize:11,color,fontWeight:700,marginBottom:6}},lbl),
            React.createElement('select',{className:'form-control',style:{fontSize:12,width:'100%'},value:calcMode[field],onChange:e=>setCalcModeField(field,e.target.value)},
              React.createElement('option',{value:'auto'},'Automatic (linked)'),
              React.createElement('option',{value:'manualRate'},'Manual Rate %'),
              React.createElement('option',{value:'manualAmt'},'Manual Amount ₹')
            )
          )
        )
      )
    ),

    // Model 1 — Service Incentive Rate Slabs
    applicability.service&&React.createElement('div',{ref:svcSectionRef,className:'card',style:{marginBottom:14,borderLeft:'4px solid var(--blue)'}},
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:7,fontSize:11,color:'var(--blue)',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:700}},
        React.createElement('span',{style:{display:'inline-block',width:9,height:9,borderRadius:'50%',background:'var(--blue)',flexShrink:0}}),
        'Service Incentive Rate Slabs'
      ),
      React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'Rate applied to Service Achieved depends on how many ×times of salary was achieved — edit the ×times figure and the % for any tier. Whichever tier\'s ×times the employee has reached (highest one that qualifies) sets their Service rate; this replaces the manual "Svc %" column for Service specifically.'),
      showAdvanced&&React.createElement(SplitByDesignationToggle,{checked:splitMode.service,color:'var(--blue)',label:'Split by Designation — different slabs for Hairdresser / Beautician / Pedicurist / Manager',onToggle:()=>toggleSplitMode('service')}),
      showAdvanced&&splitMode.service&&React.createElement(DesignationGroupTabs,{groups:incentivePlans,active:svcActiveGroup,onPick:setSvcActiveGroup}),
      React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:6}},
        svcSlabs.map((t,idx)=>React.createElement('div',{key:idx,style:{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',background:'var(--bg3)',borderRadius:'var(--r)',border:'1px solid var(--border)',flexWrap:'wrap'}},
          idx===0
            ?React.createElement('span',{style:{fontSize:12,color:'var(--text2)',minWidth:230}},'Less than '+(svcSlabs[1]?.threshold??'—')+' Times of Salary')
            :React.createElement(React.Fragment,null,
                React.createElement('span',{style:{fontSize:12,color:'var(--text2)'}},'Service Achieved'),
                React.createElement('input',{type:'number',className:'form-control',style:{width:70,fontSize:12,textAlign:'right'},value:t.threshold,onChange:e=>setSvcSlabField(idx,'threshold',e.target.value)}),
                React.createElement('span',{style:{fontSize:12,color:'var(--text2)'}},'Times of Salary')
              ),
          React.createElement('span',{style:{fontSize:12,color:'var(--text3)',marginLeft:'auto'}},'Rate'),
          React.createElement('input',{type:'number',step:'0.1',className:'form-control',style:{width:64,fontSize:12,textAlign:'right'},value:t.rate,onChange:e=>setSvcSlabField(idx,'rate',e.target.value)}),
          React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'%')
        ))
      )
    ),

    // Membership Incentive Rules (A/B/C)
    applicability.membership&&React.createElement('div',{ref:memSectionRef},React.createElement(MembershipIncentiveRules,{salon,selYear,selMonth,MONTHS,showAdvanced})),

    // Product Incentive Rule
    applicability.product&&React.createElement('div',{ref:prodSectionRef},React.createElement(ProductIncentiveRuleCard,{salonId:salon?.id,selYear,selMonth,showAdvanced})),

    // Manager Incentive (salon-wide collection vs target, split between Managers) — after Product Incentive
    applicability.manager&&React.createElement('div',{ref:mgrSectionRef,className:'card',style:{marginBottom:14,borderLeft:'4px solid var(--orange)'}},
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:7,fontSize:11,color:'var(--orange)',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:700}},
        React.createElement('span',{style:{display:'inline-block',width:9,height:9,borderRadius:'50%',background:'var(--orange)',flexShrink:0}}),
        'Manager Incentive'
      ),
      React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'Exactly one rule is active at a time — pick a rule to switch to it. Separate from the per-employee Service/Membership/Product table above.'),
      React.createElement('div',{style:{fontSize:11,color:'var(--accent2)',background:'rgba(255,159,67,0.08)',border:'1px solid rgba(255,159,67,0.25)',borderRadius:'var(--r)',padding:'8px 10px',marginBottom:10}},'⚠ Only Rule A\'s Collection vs Target pool actually feeds the "Mgr Inc" column below (and Salary Working / P&L). Rule B\'s Commission Payable is tracked here but isn\'t wired into a paid amount yet — ask if you\'d like that connected.'),
      showAdvanced&&React.createElement(SplitByDesignationToggle,{checked:splitMode.manager,color:'var(--orange)',label:'Split by Manager Level — different Rule B worksheet for Salon Manager / Manager / Assist Manager',onToggle:()=>toggleSplitMode('manager')}),
      splitMode.manager&&showAdvanced&&React.createElement(DesignationGroupTabs,{groups:MANAGER_LEVEL_GROUPS,active:mgrActiveLevel,onPick:setMgrActiveLevel}),
      React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:6,marginBottom:14}},
        [{id:'A',name:'Rule A — Collection vs Target',desc:'This month\'s collection (from Collection Reco) vs a target, tiered rate, split between Managers by Share %'},
         {id:'B',name:'Rule B — Multi-Month Sale vs Target',desc:'Hand-entered sale (over however many months you choose), target and commission — achievement % and payable commission calculate automatically'}
        ].map(r=>React.createElement('label',{key:r.id,style:{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:'var(--r)',background:mgrRuleType===r.id?'rgba(255,159,67,0.1)':'var(--bg3)',border:'1px solid '+(mgrRuleType===r.id?'rgba(255,159,67,0.35)':'var(--border)'),cursor:'pointer'}},
          React.createElement('input',{type:'checkbox',checked:mgrRuleType===r.id,onChange:()=>{if(mgrRuleType!==r.id)setMgrRuleType(r.id);}}),
          React.createElement('div',null,
            React.createElement('div',{style:{fontSize:12.5,fontWeight:mgrRuleType===r.id?600:400,color:mgrRuleType===r.id?'var(--text)':'var(--text2)'}},r.name),
            React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},r.desc)
          ),
          mgrRuleType===r.id&&React.createElement('span',{className:'badge badge-green',style:{fontSize:10,marginLeft:'auto'}},'ACTIVE')
        ))
      ),

      mgrRuleType==='A'&&React.createElement(React.Fragment,null,
        React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'Based on the whole salon\'s collection vs target for '+MONTHS[selMonth]+' '+selYear+'. Total Collection is linked automatically from Collection Reco — untick an item below to leave it out of the total.'),
        React.createElement('div',{style:{display:'flex',gap:14,flexWrap:'wrap',marginBottom:12}},
          MGR_COLLECTION_ITEMS.map(it=>React.createElement('label',{key:it.key,style:{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--text2)',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'5px 10px',cursor:'pointer'}},
            React.createElement('input',{type:'checkbox',checked:!!mgrCollItems[it.key],onChange:()=>toggleMgrCollItem(it.key)}),
            React.createElement('span',null,it.label),
            React.createElement('span',{style:{color:'var(--text3)'}},'₹'+(mgrCollSum[it.key]||0).toLocaleString('en-IN'))
          ))
        ),
        React.createElement('div',{style:{display:'flex',gap:20,flexWrap:'wrap',marginBottom:14}},
          React.createElement('div',null,
            React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:4}},'Total Collection'),
            React.createElement('div',{style:{fontSize:16,fontWeight:700,padding:'6px 0'}},rupee(mgrTotalCollection))
          ),
          React.createElement('div',null,
            React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:4}},'Total Collection (Net of GST)'),
            React.createElement('div',{style:{fontSize:16,fontWeight:700,padding:'6px 0'}},'₹'+Math.round(mgrNetCollection).toLocaleString('en-IN'))
          ),
          React.createElement('div',null,
            React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:4}},'Target Collection'),
            React.createElement('input',{type:'number',className:'form-control',style:{width:150,fontSize:12.5},value:mgrInputs.targetCollection,placeholder:'0',onChange:e=>setMgrInputField('targetCollection',e.target.value)})
          ),
          React.createElement('div',null,
            React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:4}},'% of Achievement'),
            React.createElement('div',{style:{fontSize:16,fontWeight:700,padding:'6px 0',color:mgrAchievementPct>=100?'var(--green)':mgrAchievementPct>=95?'var(--accent)':'var(--red)'}},mgrTargetCollection?mgrAchievementPct.toFixed(1)+'%':'—')
          )
        ),
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}},'Condition for Incentive'),
        React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:6,marginBottom:14}},
          mgrTiers.map((t,idx)=>React.createElement('div',{key:idx,style:{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',background:'var(--bg3)',borderRadius:'var(--r)',border:'1px solid var(--border)'}},
            React.createElement('input',{type:'number',className:'form-control',style:{width:70,fontSize:12,textAlign:'right'},value:t.threshold,onChange:e=>setMgrTierField(idx,'threshold',e.target.value)}),
            React.createElement('span',{style:{fontSize:12,color:'var(--text2)'}},'% or above → Rate of Incentive'),
            React.createElement('input',{type:'number',step:'0.01',className:'form-control',style:{width:70,fontSize:12,textAlign:'right',marginLeft:'auto'},value:t.rate,onChange:e=>setMgrTierField(idx,'rate',e.target.value)}),
            React.createElement('span',{style:{fontSize:12,color:'var(--text2)'}},'%')
          ))
        ),
        React.createElement('div',{className:'grid4',style:{marginBottom:14}},
          [{label:'Applicable Rate',val:mgrApplicableRate+'%',color:'blue'},
           {label:'Manager Incentive Pool',val:rupee(mgrIncentivePool),color:'green'}
          ].map(m=>React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},
            React.createElement('div',{className:'metric-label'},m.label),
            React.createElement('div',{className:'metric-value'},m.val)
          ))
        ),
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}},'Distribution of Incentive between Managers'),
        managerEmployees.length===0
          ?React.createElement('div',{style:{fontSize:12,color:'var(--text3)',padding:'10px 0'}},'No employees with a Manager-type designation (Salon Manager / Manager / Assist Manager) this month.')
          :React.createElement('div',{className:'table-wrap'},
              React.createElement('table',null,
                React.createElement('thead',null,React.createElement('tr',null,['Name of Manager','Share %','Share Amount'].map(h=>React.createElement('th',{key:h,style:{textAlign:h==='Name of Manager'?'left':'right'}},h)))),
                React.createElement('tbody',null,
                  managerEmployees.map(e=>{
                    const sharePct=Number(mgrInputs.shares?.[e.id])||0;
                    const shareAmt=Math.round(mgrIncentivePool*sharePct/100);
                    return React.createElement('tr',{key:e.id},
                      React.createElement('td',null,e.name+' — '+e.desig),
                      React.createElement('td',{style:{textAlign:'right'}},React.createElement('input',{type:'number',className:'form-control',style:{width:70,fontSize:12,textAlign:'right'},value:mgrInputs.shares?.[e.id]??'',placeholder:'0',onChange:ev=>setMgrShare(e.id,ev.target.value)}),' %'),
                      React.createElement('td',{style:{textAlign:'right',fontWeight:600,color:'var(--green)'}},rupee(shareAmt))
                    );
                  }),
                  React.createElement('tr',null,
                    React.createElement('td',{style:{fontWeight:700}},'Total'),
                    React.createElement('td',{style:{textAlign:'right',fontWeight:700,color:mgrTotalSharePct===100?'var(--green)':'var(--red)'}},mgrTotalSharePct+'%'),
                    React.createElement('td',{style:{textAlign:'right',fontWeight:700}},'₹'+Math.round(mgrIncentivePool*mgrTotalSharePct/100).toLocaleString('en-IN'))
                  )
                )
              )
            ),
        mgrTotalSharePct!==100&&managerEmployees.length>0&&React.createElement('div',{style:{fontSize:11,color:'var(--red)',marginTop:8}},'⚠ Share % across all managers should add up to 100% — currently '+mgrTotalSharePct+'%.')
      ),

      mgrRuleType==='B'&&React.createElement(React.Fragment,null,
        React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:14}},'Total Sale/Target/Commission % and Amount are entered by hand for '+MONTHS[selMonth]+' '+selYear+' — % of Achievement and Commission Payable are calculated automatically below.'),
        React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:10}},
          // Total Sale row — with an inline editable "months" box, so the window isn't fixed at 3.
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'var(--bg3)',borderRadius:'var(--r)',border:'1px solid var(--border)',flexWrap:'wrap'}},
            React.createElement('span',{style:{fontSize:12.5,color:'var(--text2)',display:'flex',alignItems:'center',gap:6,flex:1,flexWrap:'wrap'}},
              'Total Salon Sale for Last',
              React.createElement('input',{type:'number',min:1,className:'form-control',style:{width:52,fontSize:12.5,textAlign:'center',padding:'4px 6px'},value:rbMonths,onChange:e=>setMgrRuleBField('months',e.target.value)}),
              'Month'+(Number(rbMonths)===1?'':'s')
            ),
            React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'₹'),
            React.createElement('input',{type:'number',className:'form-control',style:{width:150,fontSize:12.5,textAlign:'right'},value:mgrRuleBInputs.totalSale3mo,placeholder:'0',onChange:e=>setMgrRuleBField('totalSale3mo',e.target.value)})
          ),
          // Manager Target — its own row now, so % of Achievement can sit directly beneath it.
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'var(--bg3)',borderRadius:'var(--r)',border:'1px solid var(--border)'}},
            React.createElement('span',{style:{fontSize:12.5,color:'var(--text2)',flex:1}},'Manager Target'),
            React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'₹'),
            React.createElement('input',{type:'number',className:'form-control',style:{width:150,fontSize:12.5,textAlign:'right'},value:mgrRuleBInputs.mgrTarget,placeholder:'0',onChange:e=>setMgrRuleBField('mgrTarget',e.target.value)})
          ),
          // % of Achievement — computed, read-only: Manager Target ÷ Total Sale × 100.
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'var(--bg3)',borderRadius:'var(--r)',border:'1px solid var(--border)'}},
            React.createElement('span',{style:{fontSize:12.5,color:'var(--text2)',flex:1}},'% of Achievement'),
            React.createElement('span',{style:{fontSize:9.5,color:'var(--text3)',marginRight:6}},'(Manager Target ÷ Total Sale)'),
            React.createElement('div',{className:'form-control',style:{width:150,fontSize:12.5,textAlign:'right',background:'var(--bg2)',color:'var(--text2)'}},rbAchievementPct.toFixed(1)),
            React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'%')
          ),
          [
            {field:'commissionPct',label:'% of Commission',suffix:'%'},
            {field:'commissionAmt',label:'Commission Amount',prefix:'₹'},
            {field:'alreadyPaid',label:'Less Manager Commission already given to them',prefix:'₹'},
          ].map(f=>React.createElement('div',{key:f.field,style:{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'var(--bg3)',borderRadius:'var(--r)',border:'1px solid var(--border)'}},
            React.createElement('span',{style:{fontSize:12.5,color:'var(--text2)',flex:1}},f.label),
            f.prefix&&React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},f.prefix),
            React.createElement('input',{type:'number',className:'form-control',style:{width:150,fontSize:12.5,textAlign:'right'},value:mgrRuleBInputs[f.field],placeholder:'0',onChange:e=>setMgrRuleBField(f.field,e.target.value)}),
            f.suffix&&React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},f.suffix)
          )),
          // Commission Payable — computed, read-only: Commission Amount − Already Given.
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'rgba(76,175,125,0.08)',borderRadius:'var(--r)',border:'1px solid rgba(76,175,125,0.3)'}},
            React.createElement('span',{style:{fontSize:12.5,color:'var(--green)',fontWeight:600,flex:1}},'Commission Payable'),
            React.createElement('span',{style:{fontSize:9.5,color:'var(--text3)',marginRight:6}},'(Commission Amount − Already Given)'),
            React.createElement('div',{className:'form-control',style:{width:150,fontSize:12.5,textAlign:'right',fontWeight:700,background:'var(--bg2)',color:'var(--green)'}},rbCommissionPayable.toLocaleString('en-IN')),
            React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'₹')
          )
        )
      )
    ),

    // Column group toggles
    React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14}},
      React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}},'Column Groups — toggle on/off'),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement(ColToggle,{k:'membership',label:'Membership Columns'}),
        React.createElement(ColToggle,{k:'product',label:'Product Columns'}),
        React.createElement(ColToggle,{k:'svcPct',label:'Svc %'}),
        React.createElement(ColToggle,{k:'memPct',label:'Mem %'}),
        React.createElement(ColToggle,{k:'prodPct',label:'Prod %'}),
        React.createElement(ColToggle,{k:'amounts',label:'Incentive Amounts'}),
        React.createElement(ColToggle,{k:'penalty',label:'Non-Performance Penalty'}),
        React.createElement(ColToggle,{k:'advAdj',label:'Advance Adjustment'}),
        React.createElement(ColToggle,{k:'bankDetails',label:'Bank Name, Account No, IFSC'}),
        React.createElement(ColToggle,{k:'ot',label:'Overtime (OT)'})
      )
    ),
    // ── Overtime (OT) Working — the hours behind the "OT Inc" column (only the amount shows on the
    // main sheet). OT = Total Monthly Salary ÷ days in the month ÷ normal working hours × OT hours. ──
    cols.ot&&React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14}},
      React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}},'Overtime (OT) Working — '+MONTHS[selMonth]+' '+selYear),
      React.createElement('div',{style:{fontSize:11.5,color:'var(--text2)',marginBottom:8,lineHeight:1.5}},'OT = Total Monthly Salary ÷ days in the month ('+new Date(selYear,selMonth+1,0).getDate()+') ÷ normal working hours per day × OT hours. Untick “Applicable” for staff without OT. Normal hours carry forward to next month. Only the OT amount shows on Incentive Working (“OT Inc”).'),
      React.createElement('div',{className:'table-wrap'},React.createElement('table',{style:{fontSize:12}},
        React.createElement('thead',null,React.createElement('tr',null,['Employee','Designation','Salary','Applicable','Normal Hrs/Day','OT Hrs','Working','OT Amount'].map(t=>React.createElement('th',{key:t},t)))),
        React.createElement('tbody',null,incData.map(e=>{
          const locked=iwMetaFor(e.id).status==='Approved'||iwMonthLocked;
          return React.createElement('tr',{key:e.id},
            React.createElement('td',{style:{fontWeight:600}},e.name),
            React.createElement('td',{style:{color:'var(--text3)'}},e.desig),
            React.createElement('td',{style:{textAlign:'right'}},fmt(e.salary)),
            React.createElement('td',{style:{textAlign:'center'}},React.createElement('input',{type:'checkbox',checked:e.otApplicable,disabled:locked,onChange:ev=>setActual(e.id,'otApplicable',ev.target.checked?1:0)})),
            React.createElement('td',{style:{textAlign:'right'}},e.otApplicable?actualInput(e.id,'otNormalHours',e.otNormalHours,locked):'—'),
            React.createElement('td',{style:{textAlign:'right'}},e.otApplicable?actualInput(e.id,'otHours',e.otHours,locked):'—'),
            React.createElement('td',{style:{fontSize:11,color:'var(--text3)'}},e.otApplicable&&e.otNormalHours&&e.otHours?'₹'+Math.round(e.salary).toLocaleString('en-IN')+' ÷ '+e.otDays+' ÷ '+e.otNormalHours+' × '+e.otHours:(e.otApplicable&&e.otHours&&!e.otNormalHours?'enter normal hours':'—')),
            React.createElement('td',{style:{textAlign:'right',fontWeight:700,color:e.otAmt>0?'var(--orange)':'var(--text3)'}},e.otAmt>0?fmt(e.otAmt):'—'));
        }),
        React.createElement('tr',{style:{fontWeight:700}},React.createElement('td',{colSpan:5},'Total'),
          React.createElement('td',{style:{textAlign:'right'}},String(incData.reduce((x,e)=>x+(e.otAmt>0?e.otHours:0),0))),
          React.createElement('td',null,''),
          React.createElement('td',{style:{textAlign:'right',color:'var(--orange)'}},fmt(incData.reduce((x,e)=>x+(e.otAmt||0),0)))))))),

    React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14}},
      React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}},'Achievement — times display format'),
      React.createElement('div',{style:{display:'flex',gap:20,flexWrap:'wrap',alignItems:'center'}},
        React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8}},
          React.createElement('span',{style:{fontSize:11.5,color:'var(--text2)'}},'Decimal:'),
          React.createElement('select',{className:'form-control',style:{width:'auto',padding:'4px 10px',fontSize:11.5},value:timesFmt.decimals,onChange:e=>setTimesFmt({decimals:Number(e.target.value)})},
            [{v:0,l:'Whole number'},{v:1,l:'.1 decimal'},{v:2,l:'.2 decimal'}].map(o=>React.createElement('option',{key:o.v,value:o.v},o.l))
          )
        ),
        React.createElement('div',{style:{display:'flex',alignItems:'center',gap:12}},
          React.createElement('span',{style:{fontSize:11.5,color:'var(--text2)'}},'Rounding:'),
          [{v:'round',l:'Normal Round'},{v:'up',l:'Round Up'},{v:'down',l:'Round Down'}].map(o=>
            React.createElement('label',{key:o.v,style:{display:'flex',alignItems:'center',gap:5,fontSize:11.5,color:timesFmt.mode===o.v?'var(--text)':'var(--text3)',cursor:'pointer'}},
              React.createElement('input',{type:'checkbox',checked:timesFmt.mode===o.v,onChange:()=>setTimesFmt({mode:o.v})}),o.l
            )
          )
        )
      )
    ),
      )
    ),


    // Summary
    React.createElement('div',{className:'grid4',style:{marginBottom:14}},
      [{label:'Total Service Inc.',val:'₹'+incData.reduce((s,e)=>s+e.svcIncAmt,0).toLocaleString('en-IN'),color:'blue'},
       {label:'Total Membership Inc.',val:'₹'+incData.reduce((s,e)=>s+e.memIncAmt,0).toLocaleString('en-IN'),color:'purple'},
       {label:'Total Product Inc.',val:'₹'+incData.reduce((s,e)=>s+e.prodIncAmt,0).toLocaleString('en-IN'),color:'teal'},
       {label:'Grand Total Incentive',val:'₹'+incData.reduce((s,e)=>s+e.totalInc,0).toLocaleString('en-IN'),color:'green'}
      ].map(m=>React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},
        React.createElement('div',{className:'metric-label'},m.label),
        React.createElement('div',{className:'metric-value'},m.val)
      ))
    ),

    hasActiveFilters&&React.createElement('div',{style:{padding:'6px 12px',fontSize:11,color:'var(--text3)',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',marginBottom:10}},
      'Showing '+visibleIncData.length+' of '+incData.length+' employees — ',
      React.createElement('span',{style:{color:'var(--accent2)',cursor:'pointer',textDecoration:'underline'},onClick:clearAllFilters},'clear all filters')
    ),
    iwSelectedIds.size>0&&React.createElement('div',{style:{fontSize:11.5,color:'var(--accent2)',background:'rgba(47,95,224,0.1)',border:'1px solid rgba(47,95,224,0.3)',borderRadius:'var(--r)',padding:'6px 12px',marginBottom:10}},
      iwSelectedIds.size+' of '+incData.length+' employees selected — tick the box in each row to choose who Export CSV and Share (above) include — ',
      React.createElement('span',{style:{color:'var(--accent2)',cursor:'pointer',textDecoration:'underline'},onClick:()=>setIwSelectedIds(new Set())},'clear selection')
    ),
    React.createElement('div',{className:'card',style:{padding:0}},
      React.createElement('div',{style:{overflowX:'auto'}},
        React.createElement('table',{style:{borderCollapse:'collapse',width:'100%',fontSize:12}},
          // Group header row
          React.createElement('thead',null,
React.createElement.apply(React,['tr',null].concat([
              thG('Employee',4,'var(--bg3)'),
              thG('Service ('+targetMult.svc+' Times Target)',3,'rgba(74,158,255,0.15)'),
              cols.membership&&thG('Membership ('+targetMult.mem+' Times Target)',3,'rgba(139,127,232,0.15)'),
              cols.product&&thG('Product ('+targetMult.prod+' Times Target)',3,'rgba(78,205,196,0.15)'),
              thG('Total Achievement',3,'rgba(47,95,224,0.12)'),
              (cols.svcPct||cols.memPct||cols.prodPct)&&thG('Incentive %',(cols.svcPct?1:0)+(cols.memPct?1:0)+(cols.prodPct?1:0),'rgba(255,159,67,0.1)'),
              (cols.amounts||cols.penalty||cols.ot)&&thG('Incentive Amounts',(cols.penalty?1:0)+(cols.amounts?5:0)+(cols.ot?1:0),'rgba(76,175,125,0.12)'),
              cols.bankDetails&&thG('Bank Details',3,'var(--bg3)'),
              thG('Payout Status',3,'var(--bg3)')
            ].filter(Boolean))),
            // Sub-header row — tinted to match its group section above, so the colour-coding
            // reads straight down the table, not just across the group row.
React.createElement.apply(React,['tr',null].concat([
              React.createElement('th',{style:{padding:'7px 8px',background:'var(--bg3)',borderBottom:'2px solid var(--accent)',width:32}},
                visibleIncData.length>0&&React.createElement('input',{type:'checkbox',checked:visibleIncData.length>0&&visibleIncData.every(e=>iwSelectedIds.has(e.id)),onChange:()=>setIwSelectedIds(visibleIncData.every(e=>iwSelectedIds.has(e.id))?new Set():new Set(visibleIncData.map(e=>e.id))),title:'Select all'})
              ),
              filterTH(IW_FILTER_COLS[0]),filterTH(IW_FILTER_COLS[1]),th2('Salary'),
              th2('Target',null,'rgba(74,158,255,0.15)'),th2('Achieved',null,'rgba(74,158,255,0.15)'),th2('Achievement',null,'rgba(74,158,255,0.15)'),
              cols.membership&&th2('Target',null,'rgba(139,127,232,0.15)'),cols.membership&&th2('Achieved',null,'rgba(139,127,232,0.15)'),cols.membership&&th2('Achiev.',null,'rgba(139,127,232,0.15)'),
              cols.product&&th2('Target',null,'rgba(78,205,196,0.15)'),cols.product&&th2('Achieved',null,'rgba(78,205,196,0.15)'),cols.product&&th2('Achiev.',null,'rgba(78,205,196,0.15)'),
              th2('Total Target',null,'rgba(47,95,224,0.12)'),th2('Total Achiev.',null,'rgba(47,95,224,0.12)'),th2('Achievement',null,'rgba(47,95,224,0.12)'),
              cols.svcPct&&th2('Svc %',null,'rgba(255,159,67,0.1)'),cols.memPct&&th2('Mem %',null,'rgba(255,159,67,0.1)'),cols.prodPct&&th2('Prod %',null,'rgba(255,159,67,0.1)'),
              cols.penalty&&th2('Non-Performance Penalty',null,'rgba(76,175,125,0.12)'),
              cols.advAdj&&th2('Advance Adj.',null,'rgba(76,175,125,0.12)'),
              cols.amounts&&th2('Svc Inc',()=>goToSection(svcSectionRef),'rgba(76,175,125,0.12)'),cols.amounts&&th2('Mem Inc',()=>goToSection(memSectionRef),'rgba(76,175,125,0.12)'),cols.amounts&&th2('Prod Inc',()=>goToSection(prodSectionRef),'rgba(76,175,125,0.12)'),cols.amounts&&th2('Mgr Inc',()=>goToSection(mgrSectionRef),'rgba(76,175,125,0.12)'),
              cols.ot&&th2('OT Inc',()=>setShowSettings(true),'rgba(76,175,125,0.12)'),cols.amounts&&th2('Total Inc',null,'rgba(76,175,125,0.12)'),
              cols.bankDetails&&th2('Bank Name'),cols.bankDetails&&th2('Account No.'),cols.bankDetails&&th2('IFSC Code'),
              filterTH(IW_FILTER_COLS[2]),
              filterTH(IW_FILTER_COLS[3]),
              React.createElement('th',{style:{padding:'7px 8px',background:'var(--bg3)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',borderBottom:'2px solid var(--accent)',minWidth:100,textAlign:'center'}},'Mode')
            ].filter(Boolean)))
          ),
          React.createElement('tbody',null,
            visibleIncData.map((e,iwRowIdx)=>{
              const m=iwMetaFor(e.id);
              const locked=m.status==='Approved'||iwMonthLocked;
              const iwRowBg=iwRowIdx%2===1?'rgba(120,130,150,0.05)':undefined;
              return React.createElement.apply(React,['tr',{key:e.id,style:{background:iwSelectedIds.has(e.id)?'rgba(47,95,224,0.06)':iwRowBg}},
              React.createElement('td',{style:{padding:'8px 8px',borderBottom:'1px solid var(--border)'}},
                React.createElement('input',{type:'checkbox',checked:iwSelectedIds.has(e.id),onChange:()=>iwToggleSelect(e.id)})
              ),
              React.createElement('td',{style:{padding:'8px 12px',fontWeight:500,color:'var(--text)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',fontSize:12}},e.name),
              td2(e.desig,'var(--text3)'),td2(fmt(e.salary)),
              td2(fmt(e.svcTarget),undefined,false,'rgba(74,158,255,0.08)'),React.createElement('td',{key:'svcA',style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right',background:'rgba(244,196,48,0.22)'}},
                e.fromReport?React.createElement('span',{title:'From Staff Work Report',style:{color:'var(--green)'}},fmt(e.svcActual)+' 🔗'):actualInput(e.id,'svcActual',e.svcActual,locked)),
              React.createElement('td',{style:{padding:'6px 8px',borderBottom:'1px solid var(--border)',background:'rgba(76,175,125,0.20)'}},timesBar(e.svcTimesRaw,targetMult.svc)),
              cols.membership&&td2(fmt(e.memTarget),undefined,false,'rgba(139,127,232,0.08)'),cols.membership&&React.createElement('td',{key:'memA',style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right',background:'rgba(244,196,48,0.22)'}},
                e.fromReport?React.createElement('span',{title:'From Staff Work Report',style:{color:'var(--green)'}},fmt(e.memActual)+' 🔗'):actualInput(e.id,'memActual',e.memActual,locked)),
              cols.membership&&React.createElement('td',{style:{padding:'6px 8px',borderBottom:'1px solid var(--border)',background:'rgba(76,175,125,0.20)'}},timesBar(e.memTimesRaw,targetMult.mem)),
              cols.product&&td2(fmt(e.prodTarget),undefined,false,'rgba(78,205,196,0.08)'),cols.product&&React.createElement('td',{key:'prodA',style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right',background:'rgba(244,196,48,0.22)'}},
                e.fromReport?React.createElement('span',{title:'From Staff Work Report',style:{color:'var(--green)'}},fmt(e.prodActual)+' 🔗'):actualInput(e.id,'prodActual',e.prodActual,locked)),
              cols.product&&React.createElement('td',{style:{padding:'6px 8px',borderBottom:'1px solid var(--border)',background:'rgba(76,175,125,0.20)'}},timesBar(e.prodTimesRaw,targetMult.prod)),
              td2(fmt(e.totalTarget),'var(--text)',true,'rgba(47,95,224,0.08)'),td2(fmt(e.totalActual),'var(--text)',true,'rgba(47,95,224,0.08)'),
              React.createElement('td',{style:{padding:'6px 8px',borderBottom:'1px solid var(--border)'}},timesBar(e.totalTimesRaw,targetMult.svc+targetMult.mem+targetMult.prod)),
              cols.svcPct&&React.createElement('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right'}},
                e.calcMode.svc==='manualAmt'
                  ?React.createElement('span',{title:e.manualOv?.svc?'Rate not used — this employee is individually set to Manual for Service Incentive':'Rate not used — Service is set to Manual Amount ₹ under Rate & Amount Source',style:{color:'var(--text3)',fontSize:11.5}},'—')
                  :e.calcMode.svc==='manualRate'
                    ?React.createElement(React.Fragment,null,rateInput(e.id,'svcRate',e.svcRate,locked),'%')
                    :React.createElement('span',{title:'Linked from the Service Incentive Rate Slabs above — change under Incentive Rules & Settings',style:{color:'var(--accent2)',fontSize:11.5}},e.svcRateUsed+'% 🔗')),
              cols.memPct&&React.createElement('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right'}},
                e.calcMode.mem==='manualAmt'
                  ?React.createElement('span',{title:e.manualOv?.mem?'Rate not used — this employee is individually set to Manual for Membership Incentive':'Rate not used — Membership is set to Manual Amount ₹ under Rate & Amount Source',style:{color:'var(--text3)',fontSize:11.5}},'—')
                  :e.calcMode.mem==='manualRate'
                    ?React.createElement(React.Fragment,null,rateInput(e.id,'memRate',e.memRate,locked),'%')
                    :React.createElement('span',{title:'Linked from the active Membership Incentive Rule (A/B/C) below — change under Incentive Rules & Settings',style:{color:'var(--accent2)',fontSize:11.5}},e.memRateUsed+'% 🔗')),
              cols.prodPct&&React.createElement('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right'}},
                e.calcMode.prod==='manualAmt'
                  ?React.createElement('span',{title:e.manualOv?.prod?'Rate not used — this employee is individually set to Manual for Product Incentive':'Rate not used — Product is set to Manual Amount ₹ under Rate & Amount Source',style:{color:'var(--text3)',fontSize:11.5}},'—')
                  :e.calcMode.prod==='manualRate'
                    ?React.createElement(React.Fragment,null,rateInput(e.id,'prodRate',e.prodRate,locked),'%')
                    :e.prodRuleType==='B'
                      ?React.createElement('span',{title:'Flat ₹ amount from the Product Incentive Rule\'s Rule 2 — same for every employee, change under Incentive Rules & Settings',style:{color:'var(--accent2)',fontSize:11.5}},'Flat ₹'+e.prodFlatAmount+' 🔗')
                      :React.createElement('span',{title:'Linked from the Product Incentive Rule below — change under Incentive Rules & Settings',style:{color:'var(--accent2)',fontSize:11.5}},e.prodRateUsed+'% 🔗')),
              cols.penalty&&React.createElement('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right'}},actualInput(e.id,'penaltyAmt',e.penaltyAmt,locked)),
              cols.advAdj&&React.createElement('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right'},title:'The installment amount for any advance recovered against Incentive is set on the Advances sheet, not editable here'},e.advAdj>0?React.createElement('span',{style:{color:'var(--red)'}},'−'+fmt(e.advAdj)):React.createElement('span',{style:{color:'var(--text3)'}},'—')),
              cols.amounts&&(e.calcMode.svc==='manualAmt'
                ?React.createElement('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right'}},amtInput(e.id,'svcAmt',e.svcManualAmt,locked))
                :td2(e.svcIncAmt>0?fmt(e.svcIncAmt):'—',e.svcIncAmt>0?'var(--green)':'var(--text3)')),
              cols.amounts&&(e.calcMode.mem==='manualAmt'
                ?React.createElement('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right'}},amtInput(e.id,'memAmt',e.memManualAmt,locked))
                :td2(e.memIncAmt>0?fmt(e.memIncAmt):'—',e.memIncAmt>0?'var(--purple)':'var(--text3)')),
              cols.amounts&&(e.calcMode.prod==='manualAmt'
                ?React.createElement('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right'}},amtInput(e.id,'prodAmt',e.prodManualAmt,locked))
                :td2(e.prodIncAmt>0?fmt(e.prodIncAmt):'—',e.prodIncAmt>0?'var(--teal)':'var(--text3)')),
              cols.amounts&&(e.manualOv?.mgr
                ?React.createElement('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right'},title:'This employee is individually set to Manual for Manager Incentive'},amtInput(e.id,'mgrAmt',e.mgrManualAmt,locked))
                :td2(e.mgrIncAmt>0?fmt(e.mgrIncAmt):'—',e.mgrIncAmt>0?'var(--orange)':'var(--text3)')),
              cols.ot&&React.createElement('td',{key:'otAmt',style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right',color:e.otAmt>0?'var(--orange)':'var(--text3)'},
                  title:e.otAmt>0?'Overtime: ₹'+Math.round(e.salary).toLocaleString('en-IN')+' ÷ '+e.otDays+' days ÷ '+e.otNormalHours+' hrs × '+e.otHours+' OT hrs — edit in Incentive Rules & Settings → Overtime (OT) Working':'Enter OT hours in Incentive Rules & Settings → Overtime (OT) Working'},
                e.otAmt>0?fmt(e.otAmt):'—'),
              cols.amounts&&td2(fmt(e.totalInc),'var(--accent)',true),
              cols.bankDetails&&td2(e.bankName||'—','var(--text2)'),
              cols.bankDetails&&td2(e.accountNo||'—','var(--text2)'),
              cols.bankDetails&&td2(e.ifsc||'—','var(--text2)'),
              React.createElement('td',{style:{padding:'6px 8px',textAlign:'center',borderBottom:'1px solid var(--border)'}},
                locked
                  ?React.createElement('span',{style:{display:'inline-flex',alignItems:'center',gap:5}},
                      React.createElement('span',{className:'badge badge-green',style:{fontSize:10.5,fontWeight:600,padding:'3px 6px'}},'🔒 Approved'),
                      !iwMonthLocked&&React.createElement('span',{title:'Unlock — reverts this row to Draft so it can be edited again',style:{cursor:'pointer',fontSize:11,color:'var(--text3)'},
                        onClick:()=>{if(window.confirm('Unlock '+e.name+' — '+MONTHS[selMonth]+' '+selYear+' Incentive Working row for editing? It will revert to Draft.'))setIwMetaField(e.id,'status','Draft');}},'🔓')
                    )
                  :React.createElement('select',{value:m.status,onChange:ev=>setIwMetaField(e.id,'status',ev.target.value),
                      className:'badge '+(m.status==='Approved'?'badge-green':'badge-amber'),
                      style:{border:'none',fontSize:10.5,fontWeight:600,cursor:'pointer',padding:'3px 6px'}},
                      ['Draft','Approved'].map(s=>React.createElement('option',{key:s,value:s},s)))
              ),
              React.createElement('td',{style:{padding:'6px 8px',textAlign:'center',borderBottom:'1px solid var(--border)'}},
                React.createElement('select',{value:m.paymentStatus,disabled:iwMonthLocked,onChange:ev=>setIwMetaField(e.id,'paymentStatus',ev.target.value),
                  className:'badge '+(m.paymentStatus==='Paid'?'badge-green':'badge-gray'),
                  style:{border:'none',fontSize:10.5,fontWeight:600,cursor:iwMonthLocked?'not-allowed':'pointer',padding:'3px 6px',opacity:iwMonthLocked?0.6:1}},
                  ['Not Paid','Paid'].map(s=>React.createElement('option',{key:s,value:s},s)))
              ),
              React.createElement('td',{style:{padding:'6px 8px',textAlign:'center',borderBottom:'1px solid var(--border)'}},
                m.paymentStatus==='Paid'
                  ?React.createElement('select',{value:m.mode||'',disabled:iwMonthLocked,'data-placeholder':!m.mode,onChange:ev=>setIwMetaField(e.id,'mode',ev.target.value),
                      style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:4,fontSize:10.5,color:m.mode?'var(--text)':'var(--text3)',cursor:'pointer',padding:'3px 6px'}},
                      [React.createElement('option',{key:'',value:''},'— Select —'),React.createElement('option',{key:'Cash',value:'Cash'},'Cash'),React.createElement('option',{key:'Bank',value:'Bank'},'Bank')])
                  :React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},'—')
              )
            ].filter(Boolean));
            }),
            // Total row — same columns as every employee row above, column-summed across
            // everyone currently visible (respects active filters). Achievement bars, % rate
            // columns, bank details, and status/payment columns are left blank rather than
            // adding numbers or badges that wouldn't mean anything totalled.
            visibleIncData.length>0&&React.createElement('tr',{key:'iw-total',style:{background:'var(--th-bg)'}},
              React.createElement('td',{style:{padding:'8px 8px',borderTop:'2px solid var(--accent)',borderBottom:'1px solid var(--border)'}},''),
              React.createElement('td',{style:{padding:'8px 12px',fontWeight:700,fontSize:12,color:'var(--accent2)',borderBottom:'1px solid var(--border)',borderTop:'2px solid var(--accent)',whiteSpace:'nowrap'}},iwSelectedIds.size>0?'Total (selected)':'Total'),
              React.createElement('td',{style:{padding:'8px 8px',borderTop:'2px solid var(--accent)',borderBottom:'1px solid var(--border)'}},''),
              td2(fmt(iwTotalRowData.reduce((s,e)=>s+(e.salary||0),0)),'var(--text)',true),
              td2(fmt(iwTotalRowData.reduce((s,e)=>s+(e.svcTarget||0),0)),'var(--text)',true),
              td2(fmt(iwTotalRowData.reduce((s,e)=>s+(e.svcActual||0),0)),'var(--text)',true),
              React.createElement('td',{style:{padding:'6px 8px',borderBottom:'1px solid var(--border)'}},''),
              cols.membership&&td2(fmt(iwTotalRowData.reduce((s,e)=>s+(e.memTarget||0),0)),'var(--text)',true),
              cols.membership&&td2(fmt(iwTotalRowData.reduce((s,e)=>s+(e.memActual||0),0)),'var(--text)',true),
              cols.membership&&React.createElement('td',{style:{padding:'6px 8px',borderBottom:'1px solid var(--border)'}},''),
              cols.product&&td2(fmt(iwTotalRowData.reduce((s,e)=>s+(e.prodTarget||0),0)),'var(--text)',true),
              cols.product&&td2(fmt(iwTotalRowData.reduce((s,e)=>s+(e.prodActual||0),0)),'var(--text)',true),
              cols.product&&React.createElement('td',{style:{padding:'6px 8px',borderBottom:'1px solid var(--border)'}},''),
              td2(fmt(iwTotalRowData.reduce((s,e)=>s+(e.totalTarget||0),0)),'var(--text)',true),
              td2(fmt(iwTotalRowData.reduce((s,e)=>s+(e.totalActual||0),0)),'var(--text)',true),
              React.createElement('td',{style:{padding:'6px 8px',borderBottom:'1px solid var(--border)'}},''),
              cols.svcPct&&React.createElement('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)'}},''),
              cols.memPct&&React.createElement('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)'}},''),
              cols.prodPct&&React.createElement('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)'}},''),
              cols.penalty&&td2(fmt(iwTotalRowData.reduce((s,e)=>s+(e.penaltyAmt||0),0)),'var(--red)',true),
              cols.advAdj&&td2(fmt(iwTotalRowData.reduce((s,e)=>s+(e.advAdj||0),0)),'var(--red)',true),
              cols.amounts&&td2(fmt(iwTotalRowData.reduce((s,e)=>s+(e.svcIncAmt||0),0)),'var(--green)',true),
              cols.amounts&&td2(fmt(iwTotalRowData.reduce((s,e)=>s+(e.memIncAmt||0),0)),'var(--purple)',true),
              cols.amounts&&td2(fmt(iwTotalRowData.reduce((s,e)=>s+(e.prodIncAmt||0),0)),'var(--teal)',true),
              cols.amounts&&td2(fmt(iwTotalRowData.reduce((s,e)=>s+(e.mgrIncAmt||0),0)),'var(--orange)',true),
              cols.ot&&td2(fmt(iwTotalRowData.reduce((s,e)=>s+(e.otAmt||0),0)),'var(--orange)',true),
              cols.amounts&&td2(fmt(iwTotalRowData.reduce((s,e)=>s+(e.totalInc||0),0)),'var(--accent)',true),
              cols.bankDetails&&React.createElement('td',{style:{padding:'8px 8px',borderBottom:'1px solid var(--border)'}},''),
              cols.bankDetails&&React.createElement('td',{style:{padding:'8px 8px',borderBottom:'1px solid var(--border)'}},''),
              cols.bankDetails&&React.createElement('td',{style:{padding:'8px 8px',borderBottom:'1px solid var(--border)'}},''),
              React.createElement('td',{style:{padding:'6px 8px',borderBottom:'1px solid var(--border)'}},''),
              React.createElement('td',{style:{padding:'6px 8px',borderBottom:'1px solid var(--border)'}},''),
              React.createElement('td',{style:{padding:'6px 8px',borderBottom:'1px solid var(--border)'}},'')
            )
          )
        )
      )
    ),
    FilterPortal()
  );
}

// ── Incentive Payment — a payout-focused view of Incentive Working: just who gets paid, how
// much, and where it goes. Pulls the same per-employee data (incWorkingsFor) Incentive Working
// itself uses, so Total Incentive here always matches the main sheet — nothing recomputed. ──
function IncentivePaymentSheet({period,salon}={}){
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today=new Date();
  const initCal=periodToCalendar(period);
  const [selMonth,setSelMonth]=useState(initCal?initCal.month:today.getMonth());
  const [selYear,setSelYear]=useState(initCal?initCal.year:today.getFullYear());
  useEffect(()=>{
    const cal=periodToCalendar(period);
    if(cal){setSelMonth(cal.month);setSelYear(cal.year);}
    // eslint-disable-next-line
  },[period&&period.mi,period&&period.fy]);
  const incData=incWorkingsFor(salon?.id,selYear,selMonth);
  const fmt=(n)=>n?'₹'+Math.round(n).toLocaleString('en-IN'):'—';
  const COLS=['Name of Employee','Designation','Total Incentive','Bank Name','Account No.','IFSC Code'];

  // ── Selection — pick specific employees to export/share instead of always the whole list.
  // Empty selection = share everyone (unchanged default behaviour); any selection narrows every
  // export/share action below to just those rows. ──
  const [selectedIds,setSelectedIds]=useState(new Set());
  useEffect(()=>{setSelectedIds(new Set());},[selMonth,selYear,salon?.id]);
  const toggleSelect=(id)=>setSelectedIds(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});
  const allSelected=incData.length>0&&incData.every(e=>selectedIds.has(e.id));
  const toggleSelectAll=()=>setSelectedIds(allSelected?new Set():new Set(incData.map(e=>e.id)));
  const exportRows=selectedIds.size>0?incData.filter(e=>selectedIds.has(e.id)):incData;
  const totalInc=exportRows.reduce((s,e)=>s+(e.totalInc||0),0);

  const exportExcel=async()=>{
    const filename='IncentivePayment_'+MONTHS[selMonth]+'_'+selYear+(selectedIds.size>0?'_selected':'')+'.xlsx';
    try{
      const blob=await exportReportExcelBlob(ipReportTitle,ipReportSheetRows());
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
    }catch(err){advError(err.message);}
  };

  // ── Share — PDF, Word, and Excel via the same reusable Share modal used across the app. No
  // custom buildExcelBlob here (unlike Incentive Working's live-formula export) — this is a flat
  // payout listing, not a working sheet, so the generic sheetRows-based exporter is enough. ──
  const ipReportTitle='Incentive Payment — '+MONTHS[selMonth]+' '+selYear+(salon?' — '+salon.name.split('—')[0].trim():'')+(selectedIds.size>0?' (selected)':'');
  const ipReportSheetRows=()=>[COLS,...exportRows.map(e=>[e.name,e.desig,e.totalInc,e.bankName||'',e.accountNo||'',e.ifsc||''])];
  // Same palette as Salary Payment — Total Incentive tinted green (matches Incentive Working's
  // own Incentive Amounts section), Bank Details tinted purple, plus row-wise zebra striping.
  const IP_BG_INC='rgba(76,175,125,0.12)';
  const IP_BG_BANK='rgba(139,127,232,0.09)';
  const ipReportBodyHtml=()=>'<table><thead><tr>'+COLS.map((h,i)=>'<th'+(i<2||i>2?'':' class="num"')+'>'+h+'</th>').join('')+'</tr></thead><tbody>'
    +exportRows.map(e=>'<tr><td>'+e.name+'</td><td>'+e.desig+'</td><td class="num" style="background:#eafaf1">'+fmt(e.totalInc)+'</td><td style="background:#f5f3ff">'+(e.bankName||'—')+'</td><td style="background:#f5f3ff">'+(e.accountNo||'—')+'</td><td style="background:#f5f3ff">'+(e.ifsc||'—')+'</td></tr>').join('')+'</tbody></table>';

  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Incentive Payment'),
        React.createElement('div',{className:'page-sub'},MONTHS[selMonth]+' '+selYear+' — payout details sourced from Incentive Working · Excludes Helper & Housekeeper')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selMonth,onChange:e=>setSelMonth(Number(e.target.value))},MONTHS.map((m,i)=>React.createElement('option',{key:m,value:i},m))),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selYear,onChange:e=>setSelYear(Number(e.target.value))},appYears().map(y=>React.createElement('option',{key:y},y))),
        React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},onClick:exportExcel},selectedIds.size>0?'⬇ Export Selected ('+selectedIds.size+')':'⬇ Export Excel'),
        React.createElement(ShareReportButton,{title:ipReportTitle,subtitle:'Incentive Payment',getBodyHtml:ipReportBodyHtml,getSheetRows:ipReportSheetRows})
      )
    ),
    selectedIds.size>0&&React.createElement('div',{style:{fontSize:11.5,color:'var(--accent2)',background:'rgba(47,95,224,0.1)',border:'1px solid rgba(47,95,224,0.3)',borderRadius:'var(--r)',padding:'6px 12px',marginBottom:10}},
      selectedIds.size+' of '+incData.length+' employees selected — Export and Share above will only include the selected rows — ',
      React.createElement('span',{style:{color:'var(--accent2)',cursor:'pointer',textDecoration:'underline'},onClick:()=>setSelectedIds(new Set())},'clear selection')
    ),
    React.createElement('div',{className:'card',style:{padding:0}},
      React.createElement('div',{style:{overflowX:'auto'}},
        React.createElement('table',{style:{borderCollapse:'collapse',width:'100%',fontSize:12}},
          React.createElement('thead',null,React.createElement('tr',null,
            React.createElement('th',{style:{padding:'8px 10px',background:'var(--th-bg)',borderBottom:'2px solid var(--accent)',width:32}},
              incData.length>0&&React.createElement('input',{type:'checkbox',checked:allSelected,onChange:toggleSelectAll,title:'Select all'})
            ),
            COLS.map(h=>React.createElement('th',{key:h,style:{padding:'8px 10px',background:h==='Total Incentive'?IP_BG_INC:(['Bank Name','Account No.','IFSC Code'].includes(h)?IP_BG_BANK:'var(--th-bg)'),color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em',whiteSpace:'nowrap',borderBottom:'2px solid var(--accent)',textAlign:h==='Total Incentive'?'right':'left'}},h))
          )),
          incData.length===0
            ?React.createElement('tbody',null,React.createElement('tr',null,React.createElement('td',{colSpan:COLS.length+1,style:{textAlign:'center',padding:32,color:'var(--text3)'}},'No employees for this month.')))
            :React.createElement('tbody',null,
              incData.map((e,ipRowIdx)=>{
                const ipRowBg=ipRowIdx%2===1?'rgba(120,130,150,0.05)':undefined;
                return React.createElement('tr',{key:e.id,style:{background:selectedIds.has(e.id)?'rgba(47,95,224,0.06)':ipRowBg}},
                React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)'}},
                  React.createElement('input',{type:'checkbox',checked:selectedIds.has(e.id),onChange:()=>toggleSelect(e.id)})
                ),
                React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',fontWeight:500,color:'var(--text)',whiteSpace:'nowrap'}},e.name),
                React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',color:'var(--text2)',whiteSpace:'nowrap'}},e.desig),
                React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',textAlign:'right',fontWeight:600,color:'var(--accent)',background:IP_BG_INC}},fmt(e.totalInc)),
                React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',color:'var(--text2)',background:IP_BG_BANK}},e.bankName||'—'),
                React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',color:'var(--text2)',fontFamily:'monospace',background:IP_BG_BANK}},e.accountNo||'—'),
                React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',color:'var(--text2)',fontFamily:'monospace',background:IP_BG_BANK}},e.ifsc||'—')
              );}),
              React.createElement('tr',{key:'ip-total',style:{background:'var(--th-bg)'}},
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)'}},''),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)',fontWeight:700,fontSize:12,color:'var(--accent2)'}},selectedIds.size>0?'Total (selected)':'Total'),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)'}},''),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)',textAlign:'right',fontWeight:700,color:'var(--accent)'}},fmt(totalInc)),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)'}},''),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)'}},''),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)'}},'')
              )
            )
        )
      )
    )
  );
}

// ── Incentive Comparative Sheet — a colour-coded, employee-wise trend report comparing each
// month's actual Service/Membership/Product/Total Achieved (both in ₹ and in ×times of that
// month's own Salary) against Incentive Paid, over the last 3, 6, or 12 months (the selected
// month counts as the first of those). Pulls straight off incWorkingsFor — the exact same figures
// Incentive Working and Incentive Payment already show — so this can never disagree with them; it
// just lines several months up side by side for each employee instead of one month at a time. A
// month before an employee's Date of Joining is skipped rather than shown as a misleading ₹0/0×
// row — getEmployeesForMonth (inside incWorkingsFor) only filters by current Status, not DOJ, so
// that check is done explicitly here (see isEmployedByMonth below). ──
function lastNCalMonths(anchorYear,anchorMonth,n){
  const arr=[];
  for(let i=0;i<n;i++){
    let m=anchorMonth-i,y=anchorYear;
    while(m<0){m+=12;y-=1;}
    arr.push({year:y,month:m});
  }
  return arr; // most recent (anchor) first
}
// True unless the employee's own Date of Joining falls strictly after the given calendar month —
// i.e. this month is before they'd even joined, so they shouldn't appear in a trend report for it.
// No DOJ on record is treated as "always employed" rather than excluded, since a blank DOJ is
// missing data, not evidence they weren't there yet.
function isEmployedByMonth(e,year,month){
  if(!e||!e.doj)return true;
  const iso=toISO(e.doj)||e.doj;
  const m=String(iso).match(/^(\d{4})-(\d{2})/);
  if(!m)return true;
  const dojY=Number(m[1]),dojM=Number(m[2])-1;
  return year>dojY||(year===dojY&&month>=dojM);
}
function IncentiveComparativeSheet({period,salon}={}){
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today=new Date();
  const initCal=periodToCalendar(period);
  const [selMonth,setSelMonth]=useState(initCal?initCal.month:today.getMonth());
  const [selYear,setSelYear]=useState(initCal?initCal.year:today.getFullYear());
  useEffect(()=>{
    const cal=periodToCalendar(period);
    if(cal){setSelMonth(cal.month);setSelYear(cal.year);}
    // eslint-disable-next-line
  },[period&&period.mi,period&&period.fy]);
  const [span,setSpan]=useState(3); // 3 / 6 / 12 months, including the month selected above
  const [empFilter,setEmpFilter]=useState('all');
  const salonId=salon?.id;

  const monthsRange=useMemo(()=>lastNCalMonths(selYear,selMonth,span),[selYear,selMonth,span]);

  // One incWorkingsFor call per month in range, grouped by employee. Employee display info
  // (name/designation) is taken from their most recent appearance in the range, in case either
  // changed partway through.
  const {employeeList,rowsByEmp}=useMemo(()=>{
    const seen={};const byEmp={};
    // Iterate oldest → newest so the "most recent" name/desig overwrite naturally lands last,
    // then each employee's own row list ends up oldest→newest too — reversed below for display.
    [...monthsRange].reverse().forEach(({year,month})=>{
      incWorkingsFor(salonId,year,month).forEach(e=>{
        if(!isEmployedByMonth(e,year,month))return; // this month is before their DOJ — skip entirely
        seen[e.id]={id:e.id,name:e.name,desig:e.desig};
        byEmp[e.id]=byEmp[e.id]||[];
        byEmp[e.id].push({year,month,...e});
      });
    });
    Object.values(byEmp).forEach(list=>list.reverse()); // newest month first, per employee
    return{employeeList:Object.values(seen).sort((a,b)=>a.name.localeCompare(b.name)),rowsByEmp:byEmp};
    // eslint-disable-next-line
  },[salonId,monthsRange]);

  const visibleEmployees=empFilter==='all'?employeeList:employeeList.filter(e=>e.id===empFilter);
  const flatRows=[];
  visibleEmployees.forEach(emp=>{(rowsByEmp[emp.id]||[]).forEach(r=>flatRows.push({emp,r}));});

  const pctOf=(actual,target)=>target?Math.min(999,Math.round((actual/target)*100)):null; // null = no target (category off)
  const timesFmt=(t)=>(Math.round((t||0)*100)/100).toFixed(2)+'×';
  const fmt=(n)=>n?'₹'+Math.round(n).toLocaleString('en-IN'):'—';
  const achvStyle=(pct)=>
    pct===null?{background:'var(--bg3)',color:'var(--text3)'}
    :pct>=100?{background:'rgba(76,175,125,0.16)',color:'var(--green)'}
    :pct>=75?{background:'rgba(255,159,67,0.16)',color:'var(--orange)'}
    :{background:'rgba(255,107,107,0.16)',color:'var(--red)'};
  const bgHex=(pct)=>pct===null?'#f4f4f6':pct>=100?'#eafaf1':pct>=75?'#fff4e6':'#fde8e8';

  const spanLabel='Last '+span+' Months';
  const rangeLabel=monthsRange.length?(MONTHS[monthsRange[monthsRange.length-1].month].slice(0,3)+' '+monthsRange[monthsRange.length-1].year+' – '+MONTHS[monthsRange[0].month].slice(0,3)+' '+monthsRange[0].year):'';
  const empLabel=empFilter!=='all'?(employeeList.find(e=>e.id===empFilter)||{}).name:'';
  const reportTitle='Incentive Comparative — '+spanLabel+' ('+rangeLabel+')'+(salon?' — '+salon.name.split('—')[0].trim():'')+(empLabel?' — '+empLabel:'');
  const COLS=['Employee','Designation','Month','Salary','Service Achv ₹','Service (×)','Membership Achv ₹','Membership (×)','Product Achv ₹','Product (×)','Total Achv ₹','Total (×)','Service Inc ₹','Membership Inc ₹','Product Inc ₹','Manager Inc ₹','Total Incentive ₹'];
  const reportSheetRows=()=>[COLS,...flatRows.map(({emp,r})=>[emp.name,emp.desig,MONTHS[r.month]+' '+r.year,r.salary,r.svcActual,Number((r.svcTimesRaw||0).toFixed(2)),r.memActual,Number((r.memTimesRaw||0).toFixed(2)),r.prodActual,Number((r.prodTimesRaw||0).toFixed(2)),r.totalActual,Number((r.totalTimesRaw||0).toFixed(2)),r.svcIncAmt||0,r.memIncAmt||0,r.prodIncAmt||0,r.mgrIncAmt||0,r.totalInc])];
  const reportBodyHtml=()=>'<table><thead><tr>'+COLS.map((h,i)=>'<th'+(i<3?'':' class="num"')+'>'+h+'</th>').join('')+'</tr></thead><tbody>'
    +flatRows.map(({emp,r})=>{
      const svcPct=pctOf(r.svcActual,r.svcTarget),memPct=pctOf(r.memActual,r.memTarget),prodPct=pctOf(r.prodActual,r.prodTarget),totPct=pctOf(r.totalActual,r.totalTarget);
      return '<tr><td>'+emp.name+'</td><td>'+emp.desig+'</td><td>'+MONTHS[r.month]+' '+r.year+'</td>'
        +'<td class="num">'+fmt(r.salary)+'</td>'
        +'<td class="num" style="background:'+bgHex(svcPct)+'">'+fmt(r.svcActual)+'</td>'
        +'<td class="num" style="background:'+bgHex(svcPct)+'">'+timesFmt(r.svcTimesRaw)+'</td>'
        +'<td class="num" style="background:'+bgHex(memPct)+'">'+fmt(r.memActual)+'</td>'
        +'<td class="num" style="background:'+bgHex(memPct)+'">'+timesFmt(r.memTimesRaw)+'</td>'
        +'<td class="num" style="background:'+bgHex(prodPct)+'">'+fmt(r.prodActual)+'</td>'
        +'<td class="num" style="background:'+bgHex(prodPct)+'">'+timesFmt(r.prodTimesRaw)+'</td>'
        +'<td class="num" style="background:'+bgHex(totPct)+'">'+fmt(r.totalActual)+'</td>'
        +'<td class="num" style="background:'+bgHex(totPct)+'">'+timesFmt(r.totalTimesRaw)+'</td>'
        +'<td class="num" style="background:#f5f3ff">'+fmt(r.svcIncAmt)+'</td>'
        +'<td class="num" style="background:#f5f3ff">'+fmt(r.memIncAmt)+'</td>'
        +'<td class="num" style="background:#f5f3ff">'+fmt(r.prodIncAmt)+'</td>'
        +'<td class="num" style="background:#f5f3ff">'+fmt(r.mgrIncAmt)+'</td>'
        +'<td class="num" style="background:#eafaf1">'+fmt(r.totalInc)+'</td></tr>';
    }).join('')+'</tbody></table>';
  const exportExcel=async()=>{
    const filename='Incentive_Comparative_'+span+'M_'+MONTHS[selMonth]+'_'+selYear+(empFilter!=='all'?'_'+empLabel.replace(/\s+/g,''):'')+'.xlsx';
    try{
      const blob=await exportReportExcelBlob(reportTitle,reportSheetRows());
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
    }catch(err){}
  };

  const STICKY_W=[0,120,220]; // left offsets for Employee/Designation/Month sticky columns

  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Incentive Comparative Sheet'),
        React.createElement('div',{className:'page-sub'},spanLabel+' · '+rangeLabel+' · Service / Membership / Product / Total Achieved vs Salary, alongside Incentive split by Service / Membership / Product / Manager / Total — colour-coded by achievement · Excludes Helper & Housekeeper')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selMonth,onChange:e=>setSelMonth(Number(e.target.value))},MONTHS.map((m,i)=>React.createElement('option',{key:m,value:i},m))),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selYear,onChange:e=>setSelYear(Number(e.target.value))},appYears().map(y=>React.createElement('option',{key:y},y))),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:empFilter,onChange:e=>setEmpFilter(e.target.value)},
          [React.createElement('option',{key:'all',value:'all'},'All Employees')].concat(employeeList.map(e=>React.createElement('option',{key:e.id,value:e.id},e.name)))),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:exportExcel},'⬇ Export Excel'),
        React.createElement(ShareReportButton,{title:reportTitle,subtitle:'Incentive Comparative',getBodyHtml:reportBodyHtml,getSheetRows:reportSheetRows,landscape:true})
      )
    ),
    React.createElement('div',{className:'tab-bar',style:{marginBottom:14}},
      [{v:3,l:'Last 3 Months'},{v:6,l:'Last 6 Months'},{v:12,l:'Last 12 Months'}].map(o=>
        React.createElement('button',{key:o.v,className:`tab-btn ${span===o.v?'active':''}`,onClick:()=>setSpan(o.v)},o.l))
    ),
    React.createElement('div',{style:{display:'flex',gap:14,flexWrap:'wrap',alignItems:'center',marginBottom:12,fontSize:11,color:'var(--text3)'}},
      React.createElement('span',{style:{fontWeight:600,color:'var(--text2)'}},'Achievement colour key:'),
      [['≥ 100% of Target','rgba(76,175,125,0.16)','var(--green)'],['75–99% of Target','rgba(255,159,67,0.16)','var(--orange)'],['Below 75% of Target','rgba(255,107,107,0.16)','var(--red)'],['No Target Set','var(--bg3)','var(--text3)']].map(([l,bg,fg])=>
        React.createElement('span',{key:l,style:{display:'inline-flex',alignItems:'center',gap:5}},
          React.createElement('span',{style:{width:10,height:10,borderRadius:3,background:bg,border:'1px solid '+fg,display:'inline-block'}}),l))
    ),
    React.createElement('div',{className:'card',style:{padding:0}},
      React.createElement('div',{style:{overflowX:'auto',maxHeight:620,overflowY:'auto'}},
        React.createElement('table',{style:{borderCollapse:'collapse',width:'100%',fontSize:11.5}},
          React.createElement('thead',null,React.createElement('tr',null,
            COLS.map((h,i)=>React.createElement('th',{key:h,style:{padding:'8px 9px',position:'sticky',top:0,left:i<3?STICKY_W[i]:undefined,zIndex:i<3?4:3,background:'var(--th-bg)',color:'var(--accent2)',fontSize:9.5,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.03em',whiteSpace:'nowrap',borderBottom:'2px solid var(--accent)',borderRight:i===2?'2px solid var(--border2)':undefined,textAlign:i<3?'left':'right'}},h))
          )),
          flatRows.length===0
            ?React.createElement('tbody',null,React.createElement('tr',null,React.createElement('td',{colSpan:COLS.length,style:{textAlign:'center',padding:32,color:'var(--text3)'}},'No Incentive Working data for this period.')))
            :React.createElement('tbody',null,
              flatRows.map(({emp,r},idx)=>{
                const svcPct=pctOf(r.svcActual,r.svcTarget),memPct=pctOf(r.memActual,r.memTarget),prodPct=pctOf(r.prodActual,r.prodTarget),totPct=pctOf(r.totalActual,r.totalTarget);
                const svcSt=achvStyle(svcPct),memSt=achvStyle(memPct),prodSt=achvStyle(prodPct),totSt=achvStyle(totPct);
                const isNewGroup=idx===0||flatRows[idx-1].emp.id!==emp.id;
                const stickyBg='var(--bg2)';
                return React.createElement('tr',{key:emp.id+'_'+r.year+'_'+r.month,style:{borderTop:isNewGroup&&idx>0?'2px solid var(--border2)':undefined}},
                  React.createElement('td',{style:{padding:'6px 9px',position:'sticky',left:STICKY_W[0],zIndex:2,background:stickyBg,borderRight:'1px solid var(--border)',borderBottom:'1px solid var(--border)',fontWeight:isNewGroup?600:400,color:'var(--text)',whiteSpace:'nowrap'}},isNewGroup?emp.name:''),
                  React.createElement('td',{style:{padding:'6px 9px',position:'sticky',left:STICKY_W[1],zIndex:2,background:stickyBg,borderRight:'1px solid var(--border)',borderBottom:'1px solid var(--border)',color:'var(--text2)',whiteSpace:'nowrap'}},isNewGroup?emp.desig:''),
                  React.createElement('td',{style:{padding:'6px 9px',position:'sticky',left:STICKY_W[2],zIndex:2,background:stickyBg,borderRight:'2px solid var(--border2)',borderBottom:'1px solid var(--border)',color:'var(--text2)',whiteSpace:'nowrap'}},MONTHS[r.month].slice(0,3)+' '+r.year),
                  React.createElement('td',{style:{padding:'6px 9px',borderBottom:'1px solid var(--border)',textAlign:'right',color:'var(--text2)',whiteSpace:'nowrap'}},fmt(r.salary)),
                  React.createElement('td',{style:{padding:'6px 9px',borderBottom:'1px solid var(--border)',textAlign:'right',fontWeight:600,whiteSpace:'nowrap',...svcSt}},fmt(r.svcActual)),
                  React.createElement('td',{style:{padding:'6px 9px',borderBottom:'1px solid var(--border)',textAlign:'right',whiteSpace:'nowrap',...svcSt}},timesFmt(r.svcTimesRaw)),
                  React.createElement('td',{style:{padding:'6px 9px',borderBottom:'1px solid var(--border)',textAlign:'right',fontWeight:600,whiteSpace:'nowrap',...memSt}},fmt(r.memActual)),
                  React.createElement('td',{style:{padding:'6px 9px',borderBottom:'1px solid var(--border)',textAlign:'right',whiteSpace:'nowrap',...memSt}},timesFmt(r.memTimesRaw)),
                  React.createElement('td',{style:{padding:'6px 9px',borderBottom:'1px solid var(--border)',textAlign:'right',fontWeight:600,whiteSpace:'nowrap',...prodSt}},fmt(r.prodActual)),
                  React.createElement('td',{style:{padding:'6px 9px',borderBottom:'1px solid var(--border)',textAlign:'right',whiteSpace:'nowrap',...prodSt}},timesFmt(r.prodTimesRaw)),
                  React.createElement('td',{style:{padding:'6px 9px',borderBottom:'1px solid var(--border)',textAlign:'right',fontWeight:700,whiteSpace:'nowrap',...totSt}},fmt(r.totalActual)),
                  React.createElement('td',{style:{padding:'6px 9px',borderBottom:'1px solid var(--border)',textAlign:'right',fontWeight:700,whiteSpace:'nowrap',...totSt}},timesFmt(r.totalTimesRaw)),
                  React.createElement('td',{style:{padding:'6px 9px',borderBottom:'1px solid var(--border)',textAlign:'right',color:'var(--purple)',background:'rgba(139,127,232,0.08)',whiteSpace:'nowrap'}},fmt(r.svcIncAmt)),
                  React.createElement('td',{style:{padding:'6px 9px',borderBottom:'1px solid var(--border)',textAlign:'right',color:'var(--purple)',background:'rgba(139,127,232,0.08)',whiteSpace:'nowrap'}},fmt(r.memIncAmt)),
                  React.createElement('td',{style:{padding:'6px 9px',borderBottom:'1px solid var(--border)',textAlign:'right',color:'var(--purple)',background:'rgba(139,127,232,0.08)',whiteSpace:'nowrap'}},fmt(r.prodIncAmt)),
                  React.createElement('td',{style:{padding:'6px 9px',borderBottom:'1px solid var(--border)',textAlign:'right',color:'var(--purple)',background:'rgba(139,127,232,0.08)',whiteSpace:'nowrap'}},fmt(r.mgrIncAmt)),
                  React.createElement('td',{style:{padding:'6px 9px',borderBottom:'1px solid var(--border)',textAlign:'right',fontWeight:600,color:'var(--accent)',background:'rgba(76,175,125,0.10)',whiteSpace:'nowrap'}},fmt(r.totalInc))
                );
              })
            )
        )
      )
    )
  );
}

// ── Model 1 — Membership Incentive Rules picker (A/B/C) — see storage functions near
// managerShareAmountFor for how each rule's settings/entries are persisted. ──
function MembershipIncentiveRules({salon,selYear,selMonth,MONTHS,showAdvanced}){
  const salonId=salon?.id;
  const [ruleType,setRuleTypeState]=useState(()=>loadMemRuleType(salonId));
  useEffect(()=>{setRuleTypeState(loadMemRuleType(salonId));},[salonId]);
  const setRuleType=(t)=>{setRuleTypeState(t);saveMemRuleType(salonId,t);};

  const EMPLOYEES=getEmployeesForMonth(selYear,selMonth,salonId).filter(e=>e.desig!=='Helper'&&e.desig!=='Housekeeper');

  // ── Split by Designation — Membership's own toggle + which group's rate settings are being
  // edited in the settings box below (the employee-wise table further down always computes each
  // row using THAT row's own designation group, regardless of which group's box is showing). ──
  const [splitMode,setSplitModeState]=useState(()=>loadIncentiveSplitMode(salonId));
  useEffect(()=>{setSplitModeState(loadIncentiveSplitMode(salonId));},[salonId]);
  const toggleSplit=()=>{
    const next={...splitMode,membership:!splitMode.membership};
    setSplitModeState(next);saveIncentiveSplitMode(salonId,next);
  };
  const [activeGroup,setActiveGroup]=useState(INCENTIVE_DESIGNATION_GROUPS[0]);
  const editGroup=splitMode.membership?activeGroup:undefined;
  const incentivePlans=allIncentivePlans(salonId);

  const RULE_OPTIONS=[
    {id:'A',name:'Rule A — Rate of Membership Incentive',desc:'Employee-wise table — Manager Sale @ 3% · Staff Sale @ 2% + Manager Share @ 1%'},
    {id:'B',name:'Rule B — Elite Card Incentive + Membership Incentive',desc:'Employee-wise table; Elite Card sales netted out of Total Membership first'},
    {id:'C',name:'Rule C — New Membership + Wallet Recharge',desc:'Employee-wise table, with CSV import from your billing software export'}
  ];

  return React.createElement(React.Fragment,null,
    React.createElement('div',{className:'card',style:{marginBottom:14,borderLeft:'4px solid var(--purple)'}},
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:7,fontSize:11,color:'var(--purple)',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:700}},
        React.createElement('span',{style:{display:'inline-block',width:9,height:9,borderRadius:'50%',background:'var(--purple)',flexShrink:0}}),
        'Membership Incentive Rules'
      ),
      React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'Exactly one rule is active at a time — check a rule to switch to it. This governs Membership Incentive for this outlet under Model 1, separate from the per-employee Service/Membership/Product table above.'),
      React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:6,marginBottom:10}},
        RULE_OPTIONS.map(r=>React.createElement('label',{key:r.id,style:{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:'var(--r)',background:ruleType===r.id?'rgba(139,127,232,0.1)':'var(--bg3)',border:'1px solid '+(ruleType===r.id?'rgba(139,127,232,0.35)':'var(--border)'),cursor:'pointer'}},
          React.createElement('input',{type:'checkbox',checked:ruleType===r.id,onChange:()=>{if(ruleType!==r.id)setRuleType(r.id);}}),
          React.createElement('div',null,
            React.createElement('div',{style:{fontSize:12.5,fontWeight:ruleType===r.id?600:400,color:ruleType===r.id?'var(--text)':'var(--text2)'}},r.name),
            React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},r.desc)
          ),
          ruleType===r.id&&React.createElement('span',{className:'badge badge-green',style:{fontSize:10,marginLeft:'auto'}},'ACTIVE')
        ))
      ),
      showAdvanced&&React.createElement(SplitByDesignationToggle,{checked:splitMode.membership,color:'var(--purple)',label:'Split by Designation — different rates for Hairdresser / Beautician / Pedicurist / Manager',onToggle:toggleSplit}),
      showAdvanced&&splitMode.membership&&React.createElement(DesignationGroupTabs,{groups:incentivePlans,active:activeGroup,onPick:setActiveGroup})
    ),
    ruleType==='A'&&React.createElement(MemRuleA,{salonId,selYear,selMonth,EMPLOYEES,splitMode,editGroup}),
    ruleType==='B'&&React.createElement(MemRuleB,{salonId,selYear,selMonth,EMPLOYEES,splitMode,editGroup}),
    ruleType==='C'&&React.createElement(MemRuleC,{salonId,selYear,selMonth,EMPLOYEES,MONTHS,splitMode,editGroup})
  );
}

// Rule A — employee-wise table: Manager Sale @ Manager Rate; Staff Sale @ Staff Rate + a Manager
// Share Rate on top that pools for Managers, then gets distributed between Managers by an
// editable Share % each (entered right in the "Manager Incentive (on Membership sold by staff)"
// column, on the Manager's own row). "Membership Sold" is entered by hand per employee; the rate
// columns are picked from the settings boxes above (not re-entered per row). When Membership is
// split by Designation, the settings box edits whichever group's tab is selected, but every row
// in the table still uses ITS OWN employee's group's rates — not necessarily the group showing.
function MemRuleA({salonId,selYear,selMonth,EMPLOYEES,splitMode,editGroup}){
  const split=!!(splitMode&&splitMode.membership);
  const [settings,setSettingsState]=useState(()=>loadMemRuleASettings(salonId,editGroup));
  useEffect(()=>{setSettingsState(loadMemRuleASettings(salonId,editGroup));},[salonId,editGroup]);
  const [rows,setRowsState]=useState(()=>loadMemRuleARows(salonId,selYear,selMonth));
  useEffect(()=>{setRowsState(loadMemRuleARows(salonId,selYear,selMonth));},[salonId,selYear,selMonth]);
  const setSettingField=(field,value)=>{
    const next={...settings,[field]:value===''?'':Number(value)};
    setSettingsState(next);saveMemRuleASettings(salonId,next,editGroup);
  };
  const setRowField=(empId,field,value)=>{
    const cur=rows[empId]||{};
    const next={...rows,[empId]:{...cur,[field]:value}};
    setRowsState(next);saveMemRuleARows(salonId,selYear,selMonth,next);
  };
  const mgrRate=Number(settings.mgrRate)||0;
  const staffRate=Number(settings.staffRate)||0;
  const mgrShareRate=Number(settings.mgrShareRate)||0;

  // Membership Sold is no longer a separate manual entry here — it's linked straight from the
  // main Incentive Working sheet's own Membership Achieved figure per employee (incWorkingsFor),
  // so the two sheets can never disagree about how much Membership an employee actually sold.
  const incData=incWorkingsFor(salonId,selYear,selMonth);
  const incByEmpId={};incData.forEach(w=>{incByEmpId[w.id]=w;});

  const inp=(val,onChange,w)=>React.createElement('input',{type:'number',className:'form-control',style:{width:w||100,fontSize:11.5,textAlign:'right'},placeholder:'0',value:val,onChange});
  const th=(txt)=>React.createElement('th',{style:{padding:'7px 8px',background:'var(--bg3)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',whiteSpace:'nowrap',borderBottom:'2px solid var(--accent)',textAlign:'right'}},txt);
  const td=(val,color,bold)=>React.createElement('td',{style:{padding:'6px 8px',fontSize:11.5,textAlign:'right',color:color||'var(--text2)',fontWeight:bold?600:400,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}},val);

  // Pass 1 — per-row figures and each Staff row's contribution to the Manager pool. Each
  // employee's OWN designation group's rates are used when split — not the settings box above,
  // which just shows/edits one group at a time.
  const pass1=EMPLOYEES.map(e=>{
    const r=rows[e.id]||{};
    const s=split?loadMemRuleASettings(salonId,incentiveGroupFor(e,salonId)):settings;
    const empMgrRate=Number(s.mgrRate)||0,empStaffRate=Number(s.staffRate)||0,empMgrShareRate=Number(s.mgrShareRate)||0;
    const membershipSold=Math.round(Number((incByEmpId[e.id]||{}).memActual)||0);
    const isManager=MANAGER_DESIGNATIONS.has(e.desig);
    const staffIncentive=isManager?0:Math.round(membershipSold*empStaffRate/100);
    const mgrIncOnOwnSold=isManager?Math.round(membershipSold*empMgrRate/100):0;
    const poolContribution=isManager?0:Math.round(membershipSold*empMgrShareRate/100);
    return{...e,membershipSold,isManager,staffIncentive,mgrIncOnOwnSold,poolContribution,mgrSharePct:r.mgrSharePct,empMgrRate,empStaffRate,empMgrShareRate};
  });
  const mgrSharePool=pass1.reduce((s,e)=>s+e.poolContribution,0);
  const managerRows=pass1.filter(e=>e.isManager);
  const totalSharePct=managerRows.reduce((s,e)=>s+(Number(e.mgrSharePct)||0),0);

  // Pass 2 — a Manager's share of the pool, from their own editable Share %.
  const computed=pass1.map(e=>{
    if(!e.isManager)return{...e,mgrShareAmt:0,membershipIncentive:e.staffIncentive};
    const sharePct=Number(e.mgrSharePct)||0;
    const mgrShareAmt=Math.round(mgrSharePool*sharePct/100);
    return{...e,mgrShareAmt,membershipIncentive:mgrShareAmt+e.mgrIncOnOwnSold};
  });

  return React.createElement('div',{className:'card',style:{marginBottom:14,borderLeft:'4px solid var(--purple)'}},
    React.createElement('div',{style:{fontSize:11,color:'var(--purple)',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:700}},'Rule A — Rate of Membership Incentive'+(split?' — editing: '+editGroup:'')),
    React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'Membership Sale by Managers → Manager Rate. Membership Sale by any Staff other than Managers → Staff Rate to the Staff, plus a Manager Share Rate on top that pools for Managers and is then split between Managers by their own Share % (entered on the Manager\'s row below). "Membership Sold" is linked automatically from each employee\'s Membership Achieved figure on the Incentive Working sheet above — the rate columns are picked from the boxes below.'+(split?' Each employee\'s row below uses their OWN designation group\'s rates, regardless of which group\'s box you\'re currently editing.':'')),
    React.createElement('div',{style:{display:'flex',gap:20,flexWrap:'wrap',marginBottom:14}},
      [['Rate of Incentive for Staff Other than Manager','staffRate'],['Rate of Manager Incentive on Membership sold by Staff','mgrShareRate'],['Rate of Incentive for Manager','mgrRate']].map(([lbl,field])=>
        React.createElement('div',{key:field},
          React.createElement('div',{style:{fontSize:11,color:'var(--purple)',fontWeight:600,marginBottom:4}},lbl),
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:6}},
            React.createElement('input',{type:'number',step:'0.1',className:'form-control',style:{width:70,fontSize:12.5},value:settings[field],onChange:e=>setSettingField(field,e.target.value)}),
            React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'%')
          )
        )
      )
    ),
    React.createElement('div',{className:'grid3',style:{marginBottom:14}},
      [{label:'Manager Incentive Pool (on Membership sold by Staff)',val:rupee(mgrSharePool),color:'orange'}
      ].map(m=>React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},
        React.createElement('div',{className:'metric-label'},m.label),
        React.createElement('div',{className:'metric-value'},m.val)
      ))
    ),
    React.createElement('div',{className:'table-wrap'},
      React.createElement('table',null,
        React.createElement('thead',null,React.createElement('tr',null,
          [th('Name of Employee'),th('Membership Sold'),th('Rate — Staff'),th('Rate — Manager Share'),th('Rate — Manager'),th('Staff Incentive'),th('Manager Incentive (on Membership sold by staff)'),th('Manager Incentive (on Membership sold by Manager)'),th('Membership Incentive')]
        )),
        React.createElement('tbody',null,
          computed.map(e=>React.createElement('tr',{key:e.id},
            React.createElement('td',{style:{padding:'6px 10px',fontSize:11.5,color:'var(--text)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}},e.name+(e.isManager?' — '+e.desig:'')),
            td(e.membershipSold?rupee(e.membershipSold):'—'),
            td(e.isManager?'—':e.empStaffRate+'%',e.isManager?'var(--text3)':'var(--purple)'),
            td(e.isManager?'—':e.empMgrShareRate+'%',e.isManager?'var(--text3)':'var(--orange)'),
            td(e.isManager?e.empMgrRate+'%':'—',e.isManager?'var(--blue)':'var(--text3)'),
            td(e.staffIncentive>0?rupee(e.staffIncentive):'—',e.staffIncentive>0?'var(--purple)':'var(--text3)'),
            e.isManager
              ?React.createElement('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right'}},
                  React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:6}},
                    inp(e.mgrSharePct??'',ev=>setRowField(e.id,'mgrSharePct',ev.target.value),56),
                    React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},'%'),
                    React.createElement('span',{style:{fontWeight:600,color:'var(--orange)'}},rupee(e.mgrShareAmt))
                  )
                )
              :td('—','var(--text3)'),
            td(e.mgrIncOnOwnSold>0?rupee(e.mgrIncOnOwnSold):'—',e.mgrIncOnOwnSold>0?'var(--blue)':'var(--text3)'),
            td(e.membershipIncentive>0?rupee(e.membershipIncentive):'—','var(--accent)',true)
          ))
        )
      )
    ),
    managerRows.length>0&&React.createElement('div',{style:{fontSize:11,color:totalSharePct===100?'var(--text3)':'var(--red)',marginTop:8}},
      totalSharePct===100?'Manager Share % adds up to 100%.':'⚠ Manager Share % across all managers should add up to 100% — currently '+totalSharePct+'%.')
  );
}

// Rule B — employee-wise table exactly per the requested column format. Same per-employee
// designation-group resolution as Rule A above when Membership is split.
function MemRuleB({salonId,selYear,selMonth,EMPLOYEES,splitMode,editGroup}){
  const split=!!(splitMode&&splitMode.membership);
  const [settings,setSettingsState]=useState(()=>loadMemRuleBSettings(salonId,editGroup));
  useEffect(()=>{setSettingsState(loadMemRuleBSettings(salonId,editGroup));},[salonId,editGroup]);
  const [rows,setRowsState]=useState(()=>loadMemRuleBRows(salonId,selYear,selMonth));
  useEffect(()=>{setRowsState(loadMemRuleBRows(salonId,selYear,selMonth));},[salonId,selYear,selMonth]);
  const setSettingField=(field,value)=>{
    const next={...settings,[field]:value===''?'':Number(value)};
    setSettingsState(next);saveMemRuleBSettings(salonId,next,editGroup);
  };
  const setRowField=(empId,field,value)=>{
    const cur=rows[empId]||{};
    const next={...rows,[empId]:{...cur,[field]:value}};
    setRowsState(next);saveMemRuleBRows(salonId,selYear,selMonth,next);
  };
  const staffRate=Number(settings.staffRate)||0;
  const mgrRate=Number(settings.mgrRate)||0;
  const mgrShareRate=Number(settings.mgrShareRate)||0;
  const valuePerCard=Number(settings.valuePerCard)||0;
  const incPerCard=Number(settings.incPerCard)||0;

  // Total Membership is linked straight from the main Incentive Working sheet's own Membership
  // Achieved figure per employee (incWorkingsFor) — same link as Rule A — instead of a separate
  // manual entry, so the two sheets can never disagree.
  const incData=incWorkingsFor(salonId,selYear,selMonth);
  const incByEmpId={};incData.forEach(w=>{incByEmpId[w.id]=w;});

  const inp=(val,onChange,w)=>React.createElement('input',{type:'number',className:'form-control',style:{width:w||70,fontSize:11.5,textAlign:'right'},placeholder:'0',value:val,onChange});

  // Pass 1 — per-row figures and each Staff row's contribution to the Manager pool. Each
  // employee's OWN designation group's rates are used when split.
  const pass1=EMPLOYEES.map(e=>{
    const r=rows[e.id]||{};
    const s=split?loadMemRuleBSettings(salonId,incentiveGroupFor(e,salonId)):settings;
    const empStaffRate=Number(s.staffRate)||0,empMgrRate=Number(s.mgrRate)||0,empMgrShareRate=Number(s.mgrShareRate)||0;
    const empValuePerCard=Number(s.valuePerCard)||0,empIncPerCard=Number(s.incPerCard)||0;
    const cards=Number(r.cards)||0;
    const totalMembership=Math.round(Number((incByEmpId[e.id]||{}).memActual)||0);
    const cardTotalValue=cards*empValuePerCard;
    const eliteCardIncentive=cards*empIncPerCard;
    const membershipAfterElite=Math.max(0,totalMembership-cardTotalValue);
    const isManager=MANAGER_DESIGNATIONS.has(e.desig);
    const staffIncentive=isManager?0:Math.round(membershipAfterElite*empStaffRate/100);
    const mgrIncentive=isManager?Math.round(membershipAfterElite*empMgrRate/100):0;
    const mgrShareOnStaff=isManager?0:Math.round(membershipAfterElite*empMgrShareRate/100);
    return{...e,cards,totalMembership,cardTotalValue,eliteCardIncentive,membershipAfterElite,isManager,staffIncentive,mgrIncentive,mgrShareOnStaff,mgrSharePct:r.mgrSharePct,empValuePerCard,empIncPerCard,empStaffRate,empMgrRate,empMgrShareRate};
  });
  const totalMgrSharePool=pass1.reduce((s,e)=>s+e.mgrShareOnStaff,0);
  const managerRows=pass1.filter(e=>e.isManager);
  const totalSharePct=managerRows.reduce((s,e)=>s+(Number(e.mgrSharePct)||0),0);

  // Pass 2 — a Manager's share of the pool, from their own editable Share %, same pattern as Rule A.
  const computed=pass1.map(e=>{
    if(!e.isManager)return{...e,mgrShareAmt:0,totalMembershipIncentive:e.eliteCardIncentive+e.staffIncentive};
    const sharePct=Number(e.mgrSharePct)||0;
    const mgrShareAmt=Math.round(totalMgrSharePool*sharePct/100);
    return{...e,mgrShareAmt,totalMembershipIncentive:e.eliteCardIncentive+e.mgrIncentive+mgrShareAmt};
  });

  const th=(txt)=>React.createElement('th',{style:{padding:'7px 8px',background:'var(--bg3)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',whiteSpace:'nowrap',borderBottom:'2px solid var(--accent)',textAlign:'right'}},txt);
  const td=(val,color,bold)=>React.createElement('td',{style:{padding:'6px 8px',fontSize:11.5,textAlign:'right',color:color||'var(--text2)',fontWeight:bold?600:400,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}},val);

  return React.createElement('div',{className:'card',style:{marginBottom:14,borderLeft:'4px solid var(--purple)'}},
    React.createElement('div',{style:{fontSize:11,color:'var(--purple)',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:700}},'Rule B — Elite Card Incentive + Membership Incentive'+(split?' — editing: '+editGroup:'')),
    React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},"Elite Card sales are netted out of Total Membership before Staff/Manager % apply, so the same rupee isn't incentivized twice. \"Value per Card\" and \"Incentive per Card\" are set once below and apply automatically to every employee's card count; \"Total Membership\" is linked automatically from the Incentive Working sheet above; only \"No of Card Sold\" is entered by hand per employee. Membership Sale by any Staff other than Managers also generates a Manager Share on top that pools for Managers and is then split between Managers by their own Share % (entered on the Manager's row below), same as Rule A."+(split?' Each employee\'s row below uses their OWN designation group\'s rates, regardless of which group\'s box you\'re currently editing.':'')),
    React.createElement('div',{style:{display:'flex',gap:20,flexWrap:'wrap',marginBottom:14}},
      [['Staff Incentive Rate','staffRate','%'],['Manager Incentive Rate','mgrRate','%'],['Manager Share on Staff Sale Rate','mgrShareRate','%'],['Value per Card','valuePerCard','₹'],['Incentive per Card','incPerCard','₹']].map(([lbl,field,unit])=>
        React.createElement('div',{key:field},
          React.createElement('div',{style:{fontSize:11,color:'var(--purple)',fontWeight:600,marginBottom:4}},lbl),
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:6}},
            unit==='₹'&&React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'₹'),
            React.createElement('input',{type:'number',step:'0.1',className:'form-control',style:{width:70,fontSize:12.5},value:settings[field],onChange:e=>setSettingField(field,e.target.value)}),
            unit==='%'&&React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'%')
          )
        )
      )
    ),
    React.createElement('div',{className:'grid3',style:{marginBottom:14}},
      [{label:'Manager Incentive Pool (on Membership sold by Staff)',val:rupee(totalMgrSharePool),color:'orange'}
      ].map(m=>React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},
        React.createElement('div',{className:'metric-label'},m.label),
        React.createElement('div',{className:'metric-value'},m.val)
      ))
    ),
    React.createElement('div',{className:'table-wrap'},
      React.createElement('table',null,
        React.createElement('thead',null,React.createElement('tr',null,
          [th('Name of Employee'),th('No of Card Sold'),th('Value per Card'),th('Card Total Value'),th('Incentive per Card'),th('Total Membership'),th('Membership after Elite Card'),th('Elite Card Incentive'),th('Staff Incentive'),th('Manger Incentive'),th('Manager Share on Membership sold by Staff'),th('Total Membership Incentive')]
        )),
        React.createElement('tbody',null,
          computed.map(e=>React.createElement('tr',{key:e.id},
            React.createElement('td',{style:{padding:'6px 10px',fontSize:11.5,color:'var(--text)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}},e.name+(e.isManager?' — '+e.desig:'')),
            React.createElement('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right'}},inp(e.cards||'',ev=>setRowField(e.id,'cards',ev.target.value))),
            td(e.empValuePerCard?rupee(e.empValuePerCard):'—'),
            td(rupee(e.cardTotalValue)),
            td(e.empIncPerCard?rupee(e.empIncPerCard):'—'),
            td(e.totalMembership?rupee(e.totalMembership):'—'),
            td(rupee(e.membershipAfterElite)),
            td(e.eliteCardIncentive>0?rupee(e.eliteCardIncentive):'—',e.eliteCardIncentive>0?'var(--teal)':'var(--text3)'),
            td(e.staffIncentive>0?rupee(e.staffIncentive)+' ('+e.empStaffRate+'%)':'—',e.staffIncentive>0?'var(--purple)':'var(--text3)'),
            td(e.mgrIncentive>0?rupee(e.mgrIncentive)+' ('+e.empMgrRate+'%)':'—',e.mgrIncentive>0?'var(--blue)':'var(--text3)'),
            e.isManager
              ?React.createElement('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right'}},
                  React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:6}},
                    inp(e.mgrSharePct??'',ev=>setRowField(e.id,'mgrSharePct',ev.target.value),56),
                    React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},'%'),
                    React.createElement('span',{style:{fontWeight:600,color:'var(--orange)'}},rupee(e.mgrShareAmt))
                  )
                )
              :td(e.mgrShareOnStaff>0?rupee(e.mgrShareOnStaff)+' ('+e.empMgrShareRate+'%)':'—',e.mgrShareOnStaff>0?'var(--orange)':'var(--text3)'),
            td(e.totalMembershipIncentive>0?rupee(e.totalMembershipIncentive):'—','var(--accent)',true)
          ))
        )
      )
    ),
    managerRows.length>0&&React.createElement('div',{style:{fontSize:11,color:totalSharePct===100?'var(--text3)':'var(--red)',marginTop:8}},
      totalSharePct===100?'Manager Share % adds up to 100%.':'⚠ Manager Share % across all managers should add up to 100% — currently '+totalSharePct+'%.')
  );
}

// Rule C — employee-wise table + optional CSV import from the billing software's own export
// format (CenterName, InvoiceNo, MemberShipName, InvoiceDate, Customer Name, Customer Source,
// Mobile, EmployeeCode, EmployeeName, Price, Discount(%), Wallet Credit, WalletOutStanding, Type,
// PaymentType, Remark). Rows are matched to an employee by Billing Software ID first, then by
// Name; "Type" decides whether a row's amount goes to New Membership or Wallet Recharge; rows
// outside the selected month/year (by Invoice Date) are ignored.
function MemRuleC({salonId,selYear,selMonth,EMPLOYEES,MONTHS,splitMode,editGroup}){
  const split=!!(splitMode&&splitMode.membership);
  const [settings,setSettingsState]=useState(()=>loadMemRuleCSettings(salonId,editGroup));
  useEffect(()=>{setSettingsState(loadMemRuleCSettings(salonId,editGroup));},[salonId,editGroup]);
  const [rows,setRowsState]=useState(()=>loadMemRuleCRows(salonId,selYear,selMonth));
  const [importMsg,setImportMsg]=useState('');
  // 'add' (default) accumulates onto whatever's already entered for the month — safe for the
  // common case of importing a partial-month export and topping it up later with the rest.
  // 'replace' zeroes out New Membership/Wallet Recharge first, but ONLY for the employees this
  // file actually matches — not the whole month's table — so re-uploading a corrected export
  // doesn't double-count against a previous import, while anyone entered by hand and absent from
  // this file is left untouched.
  const [importMode,setImportMode]=useState('add');
  useEffect(()=>{setRowsState(loadMemRuleCRows(salonId,selYear,selMonth));setImportMsg('');},[salonId,selYear,selMonth]);
  const setSettingField=(field,value)=>{
    const next={...settings,[field]:value===''?'':Number(value)};
    setSettingsState(next);saveMemRuleCSettings(salonId,next,editGroup);
  };
  const setRowField=(empId,field,value)=>{
    const cur=rows[empId]||{};
    const next={...rows,[empId]:{...cur,[field]:value}};
    setRowsState(next);saveMemRuleCRows(salonId,selYear,selMonth,next);
  };

  const inp=(val,onChange,w)=>React.createElement('input',{type:'number',className:'form-control',style:{width:w||90,fontSize:11.5,textAlign:'right'},placeholder:'0',value:val,onChange});
  const th=(txt)=>React.createElement('th',{style:{padding:'7px 8px',background:'var(--bg3)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',whiteSpace:'nowrap',borderBottom:'2px solid var(--accent)',textAlign:'right'}},txt);
  const td=(val,color,bold)=>React.createElement('td',{style:{padding:'6px 8px',fontSize:11.5,textAlign:'right',color:color||'var(--text2)',fontWeight:bold?600:400,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}},val);

  // Pass 1 — per-row figures and each Staff row's contribution to the Manager pool. Manager
  // Incentive is only ever earned from the pool of Staff-sold Membership/Wallet — a Manager's
  // own New Membership/Wallet Recharge sales do not themselves earn Manager Incentive. Each
  // employee's OWN designation group's rates are used when split.
  const pass1=EMPLOYEES.map(e=>{
    const r=rows[e.id]||{};
    const s=split?loadMemRuleCSettings(salonId,incentiveGroupFor(e,salonId)):settings;
    const empNewMemRate=Number(s.newMemRate)||0,empWalletRate=Number(s.walletRate)||0,empMgrRate=Number(s.mgrRate)||0;
    const newMembership=Number(r.newMembership)||0;
    const walletRecharge=Number(r.walletRecharge)||0;
    const incNewMem=Math.round(newMembership*empNewMemRate/100);
    const incWallet=Math.round(walletRecharge*empWalletRate/100);
    const isManager=MANAGER_DESIGNATIONS.has(e.desig);
    const poolContribution=isManager?0:Math.round((newMembership+walletRecharge)*empMgrRate/100);
    return{...e,newMembership,walletRecharge,incNewMem,incWallet,isManager,poolContribution,mgrSharePct:r.mgrSharePct,empNewMemRate,empWalletRate,empMgrRate};
  });
  const mgrSharePool=pass1.reduce((s,e)=>s+e.poolContribution,0);
  const managerRows=pass1.filter(e=>e.isManager);
  const totalSharePct=managerRows.reduce((s,e)=>s+(Number(e.mgrSharePct)||0),0);

  // Pass 2 — a Manager's share of the pool, from their own editable Share %, same pattern as
  // Rule A/B's Manager Incentive Pool distribution.
  const computed=pass1.map(e=>{
    if(!e.isManager)return{...e,mgrShareAmt:0,totalInc:e.incNewMem+e.incWallet};
    const sharePct=Number(e.mgrSharePct)||0;
    const mgrShareAmt=Math.round(mgrSharePool*sharePct/100);
    return{...e,mgrShareAmt,totalInc:e.incNewMem+e.incWallet+mgrShareAmt};
  });

  const downloadTemplate=()=>{
    const headers=['CenterName','InvoiceNo','MemberShipName','InvoiceDate','Customer Name','Customer Source','Mobile','EmployeeCode','EmployeeName','Price','Discount(%)','Wallet Credit','WalletOutStanding','Type','PaymentType','Remark'];
    const sample=['Gurugram Salon','INV1001','Gold Membership','01-07-2026','Anita Sharma','Walk-in','9876500000','E001','Ravi Kumar',5000,0,0,0,'New Membership','Cash',''];
    const csv=[headers,sample].map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='SalonOS_MembershipIncentive_RuleC_Import_Template.csv';a.click();URL.revokeObjectURL(url);
  };
  const parseImportDate=(s)=>{
    if(!s)return null;
    const t=String(s).trim();
    let m=t.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return{y:Number(m[1]),mo:Number(m[2])-1};
    m=t.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);if(m)return{y:Number(m[3]),mo:Number(m[2])-1};
    const d=new Date(t);if(!isNaN(d))return{y:d.getFullYear(),mo:d.getMonth()};
    return null;
  };
  const handleFile=(e)=>{
    const file=e.target.files[0];if(!file)return;
    setImportMsg('');
    const reader=new FileReader();
    reader.onload=(ev)=>{
      try{
        const text=ev.target.result;
        const lines=text.split('\n').filter(l=>l.trim());
        if(lines.length<2){setImportMsg('File is empty or has no data rows.');return;}
        const headers=lines[0].split(',').map(h=>h.replace(/"/g,'').trim());
        const idx=(h)=>headers.findIndex(x=>x.toLowerCase()===h.toLowerCase());
        const iCode=idx('EmployeeCode'),iName=idx('EmployeeName'),iPrice=idx('Price'),iWallet=idx('Wallet Credit'),iType=idx('Type'),iDate=idx('InvoiceDate');
        const parsedRows=lines.slice(1).map(line=>{
          const vals=line.split(',').map(v=>v.replace(/(^"|"$)/g,'').trim());
          return{code:vals[iCode]||'',name:vals[iName]||'',price:Number(vals[iPrice])||0,walletCredit:Number(vals[iWallet])||0,type:(vals[iType]||'').toLowerCase(),date:vals[iDate]||''};
        });
        const inMonth=parsedRows.filter(r=>{const d=parseImportDate(r.date);return d&&d.y===selYear&&d.mo===selMonth;});
        if(inMonth.length===0){setImportMsg('No rows matched '+MONTHS[selMonth]+' '+selYear+' — check the InvoiceDate column, or switch to the right month first.');return;}
        const next={...rows};
        let matched=0;
        // Replace mode: zero out New Membership/Wallet Recharge for exactly the employees this
        // file is about to touch, before the loop below adds anything — so the add logic ends up
        // building fresh totals from this file alone for those employees, instead of stacking on
        // top of whatever was already there from a previous import or manual entry.
        if(importMode==='replace'){
          const matchedEmpIds=new Set();
          inMonth.forEach(r=>{
            const emp=EMPLOYEES.find(x=>x.billingId&&r.code&&String(x.billingId).trim()===String(r.code).trim())
              ||EMPLOYEES.find(x=>x.name&&r.name&&x.name.trim().toLowerCase()===r.name.trim().toLowerCase());
            if(emp)matchedEmpIds.add(emp.id);
          });
          matchedEmpIds.forEach(id=>{next[id]={...(next[id]||{}),newMembership:0,walletRecharge:0};});
        }
        inMonth.forEach(r=>{
          const emp=EMPLOYEES.find(x=>x.billingId&&r.code&&String(x.billingId).trim()===String(r.code).trim())
            ||EMPLOYEES.find(x=>x.name&&r.name&&x.name.trim().toLowerCase()===r.name.trim().toLowerCase());
          if(!emp)return;
          matched++;
          const cur=next[emp.id]||{};
          const isWallet=r.type.includes('wallet')||r.type.includes('recharge');
          if(isWallet){
            const add=r.walletCredit||r.price;
            next[emp.id]={...cur,walletRecharge:(Number(cur.walletRecharge)||0)+add};
          }else{
            next[emp.id]={...cur,newMembership:(Number(cur.newMembership)||0)+r.price};
          }
        });
        setRowsState(next);saveMemRuleCRows(salonId,selYear,selMonth,next);
        setImportMsg('✓ '+(importMode==='replace'?'Replaced totals from ':'Imported ')+matched+' of '+inMonth.length+' row(s) matched to employees for '+MONTHS[selMonth]+' '+selYear+'.');
      }catch(err){setImportMsg('Could not parse file. Please use the provided CSV template.');}
    };
    reader.readAsText(file);
    e.target.value='';
  };

  return React.createElement('div',{className:'card',style:{marginBottom:14,borderLeft:'4px solid var(--purple)'}},
    React.createElement('div',{style:{fontSize:11,color:'var(--purple)',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:700}},'Rule C — New Membership + Wallet Recharge'+(split?' — editing: '+editGroup:'')),
    React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'Membership Incentive split between New Membership sold and Wallet Recharge, each at its own rate. Membership/Wallet sold by any Staff other than Managers also generates a Manager Incentive on top that pools for Managers and is then split between Managers by their own Share % (entered on the Manager\'s row below), same as Rule A/B. Enter figures by hand below, or import directly from a billing software export.'+(split?' Each employee\'s row below uses their OWN designation group\'s rates, regardless of which group\'s box you\'re currently editing.':'')),
    React.createElement('div',{style:{display:'flex',gap:20,flexWrap:'wrap',marginBottom:14}},
      [['Incentive on New Membership','newMemRate'],['Incentive on Wallet Recharge','walletRate'],['Manager Incentive','mgrRate']].map(([lbl,field])=>
        React.createElement('div',{key:field},
          React.createElement('div',{style:{fontSize:11,color:'var(--purple)',fontWeight:600,marginBottom:4}},lbl),
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:6}},
            React.createElement('input',{type:'number',step:'0.1',className:'form-control',style:{width:70,fontSize:12.5},value:settings[field],onChange:e=>setSettingField(field,e.target.value)}),
            React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'%')
          )
        )
      )
    ),
    React.createElement('div',{className:'grid3',style:{marginBottom:14}},
      [{label:'Manager Incentive Pool (on New Membership + Wallet Recharge sold by Staff)',val:rupee(mgrSharePool),color:'orange'}
      ].map(m=>React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},
        React.createElement('div',{className:'metric-label'},m.label),
        React.createElement('div',{className:'metric-value'},m.val)
      ))
    ),
    React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:14,padding:'10px 12px',background:'var(--bg3)',borderRadius:'var(--r)',border:'1px solid var(--border)'}},
      React.createElement('span',{style:{fontSize:11.5,color:'var(--text2)',maxWidth:520}},'Import from your billing software export — CenterName, InvoiceNo, MemberShipName, InvoiceDate, Customer Name, Customer Source, Mobile, EmployeeCode, EmployeeName, Price, Discount(%), Wallet Credit, WalletOutStanding, Type, PaymentType, Remark:'),
      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:downloadTemplate},'⬇ Download Template'),
      [{v:'add',label:'➕ Add to totals',desc:'Adds this file\u2019s figures onto whatever\u2019s already entered for these employees this month'},
       {v:'replace',label:'🔄 Replace totals',desc:'Zeroes out New Membership/Wallet Recharge for the employees in this file first, then sets fresh totals from it \u2014 employees not in this file are left untouched'}
      ].map(o=>React.createElement('label',{key:o.v,title:o.desc,
        style:{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',borderRadius:'var(--r)',cursor:'pointer',fontSize:11.5,fontWeight:600,
          border:'1px solid '+(importMode===o.v?'var(--accent)':'var(--border2)'),
          background:importMode===o.v?'rgba(47,95,224,0.12)':'var(--bg2)',color:importMode===o.v?'var(--accent2)':'var(--text2)'}},
        React.createElement('input',{type:'radio',name:'mrcImportMode',checked:importMode===o.v,onChange:()=>setImportMode(o.v),style:{margin:0}}),
        o.label
      )),
      React.createElement('label',{className:'btn btn-ghost btn-sm',style:{cursor:'pointer'}},'⬆ Upload CSV',React.createElement('input',{type:'file',accept:'.csv',style:{display:'none'},onChange:handleFile})),
      importMsg&&React.createElement('span',{style:{fontSize:11.5,color:importMsg.startsWith('✓')?'var(--green)':'var(--red)'}},importMsg)
    ),
    React.createElement('div',{className:'table-wrap'},
      React.createElement('table',null,
        React.createElement('thead',null,React.createElement('tr',null,
          [th('Name of Employee'),th('New Membership'),th('Wallet Recharge'),th('Incentive on New Membership'),th('Incentive on Wallet Recharge'),th('Manager Incentive'),th('Total Incentive')]
        )),
        React.createElement('tbody',null,
          computed.map(e=>React.createElement('tr',{key:e.id},
            React.createElement('td',{style:{padding:'6px 10px',fontSize:11.5,color:'var(--text)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}},e.name+(e.isManager?' — '+e.desig:'')),
            React.createElement('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right'}},inp(e.newMembership||'',ev=>setRowField(e.id,'newMembership',ev.target.value))),
            React.createElement('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right'}},inp(e.walletRecharge||'',ev=>setRowField(e.id,'walletRecharge',ev.target.value))),
            td(e.incNewMem>0?rupee(e.incNewMem)+' ('+e.empNewMemRate+'%)':'—',e.incNewMem>0?'var(--purple)':'var(--text3)'),
            td(e.incWallet>0?rupee(e.incWallet)+' ('+e.empWalletRate+'%)':'—',e.incWallet>0?'var(--teal)':'var(--text3)'),
            e.isManager
              ?React.createElement('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right'}},
                  React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:6}},
                    inp(e.mgrSharePct??'',ev=>setRowField(e.id,'mgrSharePct',ev.target.value),56),
                    React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},'%'),
                    React.createElement('span',{style:{fontWeight:600,color:'var(--orange)'}},rupee(e.mgrShareAmt))
                  )
                )
              :td(e.poolContribution>0?rupee(e.poolContribution)+' (pool)':'—',e.poolContribution>0?'var(--orange)':'var(--text3)'),
            td(e.totalInc>0?rupee(e.totalInc):'—','var(--accent)',true)
          ))
        )
      )
    ),
    managerRows.length>0&&React.createElement('div',{style:{fontSize:11,color:totalSharePct===100?'var(--text3)':'var(--red)',marginTop:8}},
      totalSharePct===100?'Manager Share % adds up to 100%.':'⚠ Manager Share % across all managers should add up to 100% — currently '+totalSharePct+'%.')
  );
}

// ── Model 1 — Product Incentive Rule — a single flat rate on Sale of Product for the month. ──
function ProductIncentiveRuleCard({salonId,selYear,selMonth,showAdvanced}){
  // ── Split by Designation — Product's own toggle + which group's rule/rate is being edited.
  // The "Sale of Product" figure below is just a local what-if preview (not fed into the real
  // per-employee calculation, which uses each employee's own Product Achieved), so it stays one
  // shared number regardless of split mode. ──
  const [splitMode,setSplitModeState]=useState(()=>loadIncentiveSplitMode(salonId));
  useEffect(()=>{setSplitModeState(loadIncentiveSplitMode(salonId));},[salonId]);
  const toggleSplit=()=>{
    const next={...splitMode,product:!splitMode.product};
    setSplitModeState(next);saveIncentiveSplitMode(salonId,next);
  };
  const [activeGroup,setActiveGroup]=useState(INCENTIVE_DESIGNATION_GROUPS[0]);
  const editGroup=splitMode.product?activeGroup:undefined;
  const incentivePlans=allIncentivePlans(salonId);

  const [settings,setSettingsState]=useState(()=>loadProductIncentiveRule(salonId,editGroup));
  useEffect(()=>{setSettingsState(loadProductIncentiveRule(salonId,editGroup));},[salonId,editGroup]);
  const [entry,setEntryState]=useState(()=>loadProductIncentiveEntry(salonId,selYear,selMonth));
  useEffect(()=>{setEntryState(loadProductIncentiveEntry(salonId,selYear,selMonth));},[salonId,selYear,selMonth]);
  const [ruleType,setRuleTypeState]=useState(()=>loadProdRuleType(salonId,editGroup));
  useEffect(()=>{setRuleTypeState(loadProdRuleType(salonId,editGroup));},[salonId,editGroup]);
  const setRuleType=(t)=>{setRuleTypeState(t);saveProdRuleType(salonId,t,editGroup);};
  const [flatRule,setFlatRuleState]=useState(()=>loadProductFlatRule(salonId,editGroup));
  useEffect(()=>{setFlatRuleState(loadProductFlatRule(salonId,editGroup));},[salonId,editGroup]);
  const setFlatAmount=(value)=>{
    const next={...flatRule,amount:value===''?'':Number(value)};
    setFlatRuleState(next);saveProductFlatRule(salonId,next,editGroup);
  };
  const setRate=(value)=>{
    const next={...settings,rate:value===''?'':Number(value)};
    setSettingsState(next);saveProductIncentiveRule(salonId,next,editGroup);
  };
  const setSaleAmt=(value)=>{
    const next={...entry,saleAmt:value};
    setEntryState(next);saveProductIncentiveEntry(salonId,selYear,selMonth,next);
  };
  const rate=Number(settings.rate)||0;
  const saleAmt=Number(entry.saleAmt)||0;
  const incentive=Math.round(saleAmt*rate/100);
  const flatAmount=Number(flatRule.amount)||0;

  return React.createElement('div',{className:'card',style:{marginBottom:14,borderLeft:'4px solid var(--teal)'}},
    React.createElement('div',{style:{display:'flex',alignItems:'center',gap:7,fontSize:11,color:'var(--teal)',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:700}},
      React.createElement('span',{style:{display:'inline-block',width:9,height:9,borderRadius:'50%',background:'var(--teal)',flexShrink:0}}),
      'Product Incentive Rule'+(splitMode.product?' — editing: '+editGroup:'')
    ),
    React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'Exactly one rule is active at a time — pick a rule to switch to it. Whichever is active is also what every employee\'s own "Prod %" uses on the sheet above whenever Product\'s Rate Source (under Rate & Amount Source, above) is set to Automatic.'+(splitMode.product?' Each employee\'s Product Incentive uses THEIR OWN designation group\'s rule and rate below, regardless of which group\'s tab you\'re currently editing.':'')),
    showAdvanced&&React.createElement(SplitByDesignationToggle,{checked:splitMode.product,color:'var(--teal)',label:'Split by Designation — different rule/rate for Hairdresser / Beautician / Pedicurist / Manager',onToggle:toggleSplit}),
    showAdvanced&&splitMode.product&&React.createElement(DesignationGroupTabs,{groups:incentivePlans,active:activeGroup,onPick:setActiveGroup}),
    React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:6,marginBottom:12}},
      [{id:'A',name:'Rule 1 — Flat Rate % on Sale of Product',desc:'A flat rate applied to Sale of Product for the month — both the sale figure and the rate are editable.'},
       {id:'B',name:'Rule 2 — Flat Amount, irrespective of Product Sale',desc:'A fixed ₹ amount, paid the same to every employee with Product Incentive switched on — regardless of how much product they actually sold.'}
      ].map(r=>React.createElement('label',{key:r.id,style:{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:'var(--r)',background:ruleType===r.id?'rgba(78,205,196,0.1)':'var(--bg3)',border:'1px solid '+(ruleType===r.id?'rgba(78,205,196,0.35)':'var(--border)'),cursor:'pointer'}},
        React.createElement('input',{type:'checkbox',checked:ruleType===r.id,onChange:()=>{if(ruleType!==r.id)setRuleType(r.id);}}),
        React.createElement('div',null,
          React.createElement('div',{style:{fontSize:12.5,fontWeight:ruleType===r.id?600:400,color:ruleType===r.id?'var(--text)':'var(--text2)'}},r.name),
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},r.desc)
        ),
        ruleType===r.id&&React.createElement('span',{className:'badge badge-green',style:{fontSize:10,marginLeft:'auto'}},'ACTIVE')
      ))
    ),

    ruleType==='A'&&React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'var(--bg3)',borderRadius:'var(--r)',border:'1px solid var(--border)',flexWrap:'wrap'}},
      React.createElement('span',{style:{fontSize:12,color:'var(--text2)',minWidth:130}},'Sale of Product'),
      React.createElement('input',{type:'number',className:'form-control',style:{width:150,fontSize:12.5},placeholder:'0',value:entry.saleAmt,onChange:e=>setSaleAmt(e.target.value)}),
      React.createElement('span',{style:{fontSize:11.5,color:'var(--text3)',marginLeft:8}},'Rate'),
      React.createElement('input',{type:'number',step:'0.1',className:'form-control',style:{width:64,fontSize:12,textAlign:'right'},value:settings.rate,onChange:e=>setRate(e.target.value)}),
      React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'%'),
      React.createElement('span',{style:{marginLeft:'auto',fontSize:12,color:'var(--text3)'}},'Product Incentive'),
      React.createElement('span',{style:{fontSize:14,fontWeight:700,color:'var(--teal)'}},rupee(incentive))
    ),

    ruleType==='B'&&React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'var(--bg3)',borderRadius:'var(--r)',border:'1px solid var(--border)',flexWrap:'wrap'}},
      React.createElement('span',{style:{fontSize:12,color:'var(--text2)',minWidth:220}},'Flat Incentive Amount (per employee)'),
      React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'₹'),
      React.createElement('input',{type:'number',className:'form-control',style:{width:150,fontSize:12.5},placeholder:'0',value:flatRule.amount,onChange:e=>setFlatAmount(e.target.value)}),
      React.createElement('span',{style:{marginLeft:'auto',fontSize:12,color:'var(--text3)'}},'Every employee\'s Product Incentive'),
      React.createElement('span',{style:{fontSize:14,fontWeight:700,color:'var(--teal)'}},rupee(flatAmount))
    )
  );
}