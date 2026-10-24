// ═════════════════════════════════════════════════════════════════════════════════════════════
// Master Settings → 🎛 Controls page. Each extra below has its own switch in the “Controls page”
// area (ctl*): outlet view, comparison grid and health check, linked switches, “Show me”, last
// changed / undo, history, owner alerts, a second Super Admin to switch off safety rules, locked
// switches, ready-made and saved sets, copy from an outlet, outlet-wise limits, temporary and
// role-wise switches, how often each check fires, What’s new, and export / policy / backup.
// The rule engine (controlOn / controlLimit) is in js/26-controls-center.js.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const CTL_HISTORY_KEY='salonos_controls_history',CTL_PENDING_KEY='salonos_controls_pending',CTL_ALERTS_KEY='salonos_controls_alerts',CTL_SETS_KEY='salonos_controls_presets',CTL_HITS_KEY='salonos_controls_hits';
function ctlJ(k,d){try{const v=JSON.parse(cachedLocalGet(k)||'null');return v==null?d:v;}catch(e){return d;}}
function ctlPut(k,v){safeLocalSet(k,JSON.stringify(v));}
function ctlUserName(){const u=currentSessionUser();return u?(u.name||u.email||'—'):'—';}
function ctlToday(){return localIsoOf(new Date());}
function ctlDmy(iso){const p=String(iso||'').slice(0,10).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:'';}
function ctlWhen(ts){try{return new Date(ts).toLocaleString('en-GB',DMY_DT);}catch(e){return'';}}
function ctlOutletName(sid){const s=(typeof SALONS!=='undefined'?SALONS:[]).find(x=>String(x.id)===String(sid));return s?String(s.name).split('—')[0].trim():'Outlet '+sid;}

// ── switches that need another switch (Controls → ctlLinks) ──
const CONTROL_REQUIRES={
  payWbPools:['payWorkbooks'],payWbWhatIf:['payWorkbooks'],payWbPayslips:['payWorkbooks'],payWbBank:['payWorkbooks'],payWbStatutory:['payWorkbooks'],payWbCompare:['payWorkbooks'],
  payWbCtc:['payWorkbooks'],payWbExceptions:['payWorkbooks'],payWbReco:['payWorkbooks'],payWbTrail:['payWorkbooks'],payWbIntegrity:['payWorkbooks'],payWbChooser:['payWorkbooks'],
  payWbAllOutlets:['payWorkbooks'],payWorkbookEmail:['payWorkbooks'],payWbProtected:['payWorkbooks','payWbChooser'],
  bankUnmappedNudge:['bankAgeingBoard'],cashForecastAlert:['bankAgeingBoard'],bankOnePagerReminder:['bankAgeingBoard'],
  negativeStockBlock:['billReducesStock'],autoIssueStdUsage:['billReducesStock'],discountApproval:['discountReason'],
  salaryArrears:['salaryRevisions'],msReverseCalc:['msTemplates'],msGratuityBonus:['msAnnualCtc'],ipNotes:['ipDiff'],ipPeriod:['ipWords'],ctlHealth:['ctlCompare'],ctlLastChanged:['ctlHistory']};
// ── “Show me”: where each switch applies (per switch, else per section) ──
const CTL_WHERE_ID={dceReport:'page:reports',ptExemption:'master-salary',msWage50:'master-salary',msMinWage:'master-salary',msDob:'master-salary',msTemplates:'master-salary',msReverseCalc:'master-salary',msTakeHome:'master-salary',msBulkEdit:'master-salary',msDocs:'master-salary',msProbation:'master-salary',msLetters:'master-salary',msSelfUpdate:'master-salary',msAnnualCtc:'master-salary',msGratuityBonus:'master-salary',msDeptCost:'master-salary',msTransfer:'master-salary',msEsicPeriod:'salary-working',msCodeWages:'salary-working',msEpsFlag:'master-salary',ctcIncludesEsic:'master-salary',pfCoverage25k:'master-salary',payExcludesEmployerPf:'salary-working',finalFreeze:'salary-working',advPullConfirm:'salary-working',advPullNote:'salary-working',ipWords:'incentive-working',ipPeriod:'incentive-working',ipDiff:'incentive-working',ipGroups:'incentive-working',ipTimeline:'incentive-working',ipDrift:'incentive-working',ipInUse:'incentive-working',ipWizard:'incentive-working',ipCost:'incentive-working',ipChecklist:'incentive-working',ipNotes:'incentive-working',ipStaffSheet:'incentive-working',ipStaffPhone:'incentive-working',ipReminder:'incentive-working',incSimpleView:'incentive-working',incBreakdown:'incentive-working',incProgress:'incentive-working',incWhyZero:'incentive-working',incSourceLabel:'incentive-working',incDeltaLM:'incentive-working',incStatement:'incentive-working',incPools:'incentive-working',incTieOut:'incentive-working',incProRata:'incentive-working',incProgressive:'incentive-working',incCompWeight:'incentive-working',incRoundTotal:'incentive-working',incRulesGuide:'incentive-working',payHold:'salary-working',payOvertime:'salary-working',payLateEarly:'salary-working',payOneOffs:'salary-working',payProvisions:'salary-working',payFnF:'salary-working',payLeaveEncash:'salary-working',payChangePreview:'salary-working',paySplit:'salary-working',incTracker:'incentive-working',incSimulator:'incentive-working',incTeam:'incentive-working',incFeedback:'incentive-working',incClawback:'incentive-working',incCap:'incentive-working',incFloor:'incentive-working',incMixCheck:'incentive-working',payMakerChecker:'salary-working',payChangeLog:'salary-working',payCompare:'salary-working',payBudget:'salary-working',payYearly:'salary-working',advRegister:'page:dashboard',advPartRecovery:'salary-working',advEligibility:'advance',advServiceLimit:'advance',advOneOpen:'advance',advPhoneRequest:'advance',advAck:'advance',advSkipMonth:'advance',advChangePlan:'advance',advRepaid:'advance',advSplit:'advance',advLeavers:'advance',advStatement:'advance',advOverdue:'advance',advTieOut:'advance',advTally:'advance',advFee:'advance',advWriteOff:'advance',salaryRevisions:'master-salary',salaryArrears:'salary-working',aadhaarRequired:'master-salary',dupEmployee:'master-salary',sharedBankAccount:'master-salary',wageSenseCheck:'master-salary',salaryChangeReason:'master-salary',idChecks:'master-salary',
  dupVendor:'vendors',dupInvoice:'vendors',sameBillNewNumber:'vendors',gstMathCheck:'vendors',dateSenseCheck:'vendors',proofAboveLimit:'vendors',billNeedsPo:'vendors',gstLock:'vendors',doubleSaveGuard:'vendors',
  repeatExpense:'daily-sales',crossEntryExpense:'daily-sales',extraZeroCheck:'daily-sales',modeVsBilling:'daily-sales',dseVsBilling:'daily-sales',depositVsBank:'daily-sales',futureLock:'daily-sales',backdateLock:'daily-sales',
  dupAdvancePenalty:'advance',importSeen:'bank-statement',stockTwice:'inventory',negativeStockBlock:'inventory',attendanceSense:'attendance',dataQualityBoard:'page:dashboard',
  phoneCheckin:'attendance',paidLeave:'attendance',leaveRequests:'attendance',staffIncentiveView:'incentive-working',empStatement:'salary-working',advanceRecoveryPlan:'advance',advanceNetFloor:'advance',
  monthFinalRule:'attendance',monthFinalNeedsMapping:'bank-statement',collRecoNeedsMapping:'collection',payablesDueAlert:'page:dashboard',bankRecoAlert:'page:dashboard',budgetAlert:'page:dashboard',missingSalesBanner:'daily-sales',
  poApproval:'vendors',invoiceApproval:'vendors',bankFileApproval:'bank-payment',deleteApproval:'vendors',vendorBankApproval:'vendors',paymentRun:'bank-payment',
  bankAgeingBoard:'page:dashboard',mappingSla:'page:dashboard',bankUnmappedNudge:'page:dashboard',bankDailyDigest:'page:dashboard',bankOnePagerReminder:'page:dashboard',cashForecastAlert:'page:dashboard',payWbAllOutlets:'page:reports',geminiModelList:'page:settings'};
const CTL_WHERE_AREA={frontdesk:'billing',clients:'clients',stock:'inventory',checks:'daily-sales',bank:'bank-statement',staff:'salary-working',close:'page:dashboard',app:'page:dashboard',ctl:'page:settings'};
const CTL_WHERE_SECTION={'Appointments':'appointments','Messages & privacy':'clients','Full workings Excel':'salary-working','Employees':'master-salary','Advances':'advance'};
const CTL_TAB_LABEL={'billing':'Billing','appointments':'Appointments','clients':'Clients','inventory':'Inventory','daily-sales':'Daily Sales & Exp','attendance':'Attendance','salary-working':'Salary Working','incentive-working':'Incentive Working','master-salary':'Master Salary','vendors':'Vendors','advance':'Advances','bank-statement':'Bank Statement','bank-payment':'Bank Payment','collection':'Collection Reco','page:dashboard':'Dashboard','page:reports':'Reports Hub','page:settings':'Master Settings'};
const CTL_SAMPLE={dupEmployee:'“PAN ABCDE1234F is already on Priya Sharma (E1) — Save anyway?”',dupVendor:'“The name looks like existing vendor “L’Oréal India Pvt Ltd” (V1)”',
  sameBillNewNumber:'“A bill of ₹28,320 from this vendor is already entered as No. LOR/26/4471 dated 04/09/2026 — the same bill under a new number?”',
  repeatExpense:'“The same ₹1,500 is entered under “Pentry Expenses” on 11/10/2026”',extraZeroCheck:'“₹9,000 is 22.4× the usual “Pentry Expenses” of ₹402 — an extra zero?”',
  dupAdvancePenalty:'“An advance of ₹2,000 to Priya Sharma dated 10/10/2026 is already entered”',importSeen:'“This bank statement file looks like one already imported — “stmt.xlsx”, 16/10/2026 by Amit Kumar. Import it again anyway?”',
  stockTwice:'“3 pcs of Test Shampoo was already received 1 min ago”',gstMathCheck:'“CGST ₹90 and SGST ₹80 should be equal”',dateSenseCheck:'“The invoice date 17/10/2026 is in the future”',
  futureLock:'“Entries dated after today are blocked”',negativeStockBlock:'“Not enough stock — Test Shampoo: 5 on the bill, 2 in stock”',proofAboveLimit:'“Bills of ₹5,000 or more need the bill copy attached (📎)”',
  salaryChangeReason:'“Gross pay changes from ₹38,000 to ₹57,000 (+50%) — give the reason”',modeVsBilling:'“01/10/2026: Card ₹6,990 in Daily Sales, ₹7,670 billed”',attendanceSense:'“Anjali Gupta: worked on the weekly off (Monday) on day 26”'};
// ── when each switch was added (Controls → ctlWhatsNew) ──
const CONTROL_ADDED=(()=>{const m={};const add=(d,ids)=>ids.forEach(i=>m[i]=d);
  add('2026-10-16',['payWorkbooks','payWbPools','payWbWhatIf','payWbPayslips','payWbBank','payWbStatutory','payWbCompare','payWbCtc','payWbExceptions','payWbReco','payWbTrail','payWbIntegrity','payWbChooser','payWbAllOutlets','payWorkbookEmail','payWbProtected','backdateLock',
    'dupEmployee','sharedBankAccount','dupVendor','sameBillNewNumber','repeatExpense','crossEntryExpense','dupAdvancePenalty','importSeen','stockTwice','doubleSaveGuard','extraZeroCheck','modeVsBilling','dseVsBilling','depositVsBank','gstMathCheck','dateSenseCheck','futureLock','attendanceSense','salaryChangeReason','wageSenseCheck','negativeStockBlock','proofAboveLimit','dataQualityBoard',
    'ctlOutletView','ctlCompare','ctlHealth','ctlLinks','ctlShowMe','ctlLastChanged','ctlHistory','ctlOwnerAlert','ctlTwoPerson','ctlLocks','ctlSets','ctlCopyOutlet','ctlOutletLimits','ctlTemporary','ctlRoleRules','ctlHitStats','ctlWhatsNew','ctlExport','geminiModelList']);
  add('2026-10-17',['aadhaarRequired','dmyDates','salaryRevisions','salaryArrears','advEligibility','advServiceLimit','advOneOpen','advPhoneRequest','advAck','advSkipMonth','advChangePlan','advPartRecovery','advRepaid','advSplit','advLeavers','advStatement','advRegister','advOverdue','advTieOut','advTally','advFee','advWriteOff','payHold','payOvertime','payLateEarly','payOneOffs','payProvisions','payFnF','payLeaveEncash','payChangePreview','paySplit','incTracker','incSimulator','incTeam','incFeedback','incClawback','incCap','incFloor','incMixCheck','payMakerChecker','payChangeLog','payCompare','payBudget','payYearly','incRulesGuide','incSimpleView','incBreakdown','incProgress','incWhyZero','incSourceLabel','incDeltaLM','incStatement','incPools','incTieOut','incProRata','incProgressive','incCompWeight','incRoundTotal']);
  add('2026-10-17',['ipWords','ipPeriod','ipDiff','ipGroups','ipTimeline','ipDrift','ipInUse','ipWizard','ipCost','ipChecklist','ipNotes','ipStaffSheet','ipStaffPhone','ipReminder']);
  add('2026-10-22',['advPullConfirm','advPullNote','finalFreeze','payExcludesEmployerPf','pfCoverage25k','ctcIncludesEsic']);
  add('2026-10-22',['msWage50','msCodeWages','msEpsFlag','msEsicPeriod','msMinWage','msDob','msTemplates','msReverseCalc','msTakeHome','msBulkEdit','msDocs','msProbation','msLetters','msSelfUpdate','msAnnualCtc','msGratuityBonus','msDeptCost','msTransfer']);
  add('2026-10-22',['ptExemption']);
  add('2026-10-24',['dceReport']);
  return m;})();
// Checks that report how often they fire (others show “not counted”).
const CTL_COUNTED=new Set(['dupEmployee','sharedBankAccount','dupVendor','sameBillNewNumber','repeatExpense','crossEntryExpense','dupAdvancePenalty','stockTwice','extraZeroCheck','gstMathCheck','dateSenseCheck','wageSenseCheck','salaryChangeReason','negativeStockBlock','proofAboveLimit','dupInvoice','idChecks',
  'mapApproval','discountApproval','cancelApproval','poApproval','invoiceApproval','bankFileApproval','deleteApproval','vendorBankApproval']);

// ── how often each check fires ──
function controlHit(id,sid,kind){
  try{if(!controlRawOn('ctlHitStats'))return;const H=ctlJ(CTL_HITS_KEY,{})||{};if(!H._since)H._since=ctlToday();const t=ctlToday();const r=H[id]=H[id]||{};const d=r[t]=r[t]||{w:0,o:0,b:0};d[kind]=(d[kind]||0)+1;
    if(Math.random()<0.05){const cut=localIsoOf(new Date(Date.now()-62*864e5));Object.keys(H).forEach(k=>{if(k==='_since')return;Object.keys(H[k]).forEach(day=>{if(day<cut)delete H[k][day];});});}
    ctlPut(CTL_HITS_KEY,H);}catch(e){}
}
function controlHitStats(id,days){const H=ctlJ(CTL_HITS_KEY,{})||{};const cut=localIsoOf(new Date(Date.now()-(days||30)*864e5));const s={w:0,o:0,b:0};Object.entries(H[id]||{}).forEach(([d,v])=>{if(d>=cut){s.w+=v.w||0;s.o+=v.o||0;s.b+=v.b||0;}});s.since=H._since||null;return s;}

// ── pending changes, alerts, history ──
function ctlEffSnapshot(cfg,d){const c=cfg[d.id]||{};const all=typeof c.on==='boolean'?c.on:d.def;const outs=(typeof SALONS!=='undefined'?SALONS:[]).map(s=>{const o=(c.outlets||{})[String(s.id)];return typeof o==='boolean'?o:all;});
  const temps=(c.temp||[]).filter(x=>x&&x.on===false&&(!x.to||x.to>=ctlToday()));return{all,anyOff:!all||outs.some(v=>!v)||temps.length>0};}
function ctlDescribe(d,before,after){const b=before||{},a=after||{},parts=[];const onOf=x=>typeof x.on==='boolean'?x.on:d.def;
  if(onOf(b)!==onOf(a))parts.push('all outlets '+(onOf(a)?'ON':'OFF'));
  const ob=b.outlets||{},oa=a.outlets||{};new Set([...Object.keys(ob),...Object.keys(oa)]).forEach(k=>{if(ob[k]!==oa[k])parts.push(ctlOutletName(k)+' '+(oa[k]===undefined?'same as all':oa[k]?'ON':'OFF'));});
  if(String(b.limit??'')!==String(a.limit??''))parts.push('limit '+(a.limit??'default'));
  const lb=b.outletLimits||{},la=a.outletLimits||{};new Set([...Object.keys(lb),...Object.keys(la)]).forEach(k=>{if(String(lb[k]??'')!==String(la[k]??''))parts.push(ctlOutletName(k)+' limit '+(la[k]===undefined||la[k]===''?'same as all':la[k]));});
  if(JSON.stringify(b.temp||[])!==JSON.stringify(a.temp||[]))parts.push('temporary: '+((a.temp||[]).map(x=>(x.on?'on':'off')+(x.from?' from '+ctlDmy(x.from):'')+(x.to?' until '+ctlDmy(x.to):'')+(x.sid!=null?' ('+ctlOutletName(x.sid)+')':'')).join(', ')||'none'));
  if(JSON.stringify(b.roles||[])!==JSON.stringify(a.roles||[])||JSON.stringify(b.exempt||[])!==JSON.stringify(a.exempt||[]))parts.push('applies to: '+(((a.roles||[]).join(', ')||'everyone')+((a.exempt||[]).length?' except '+a.exempt.join(', '):'')));
  if(!!b.locked!==!!a.locked)parts.push(a.locked?'locked':'unlocked');
  return parts.join('; ')||'no change';}
// Authenticator code again (Controls → ctlLocks). Without an authenticator (or offline / demo), typing UNLOCK confirms.
async function ctlReauth(why){
  try{const supa=typeof getSupabaseClient==='function'?await getSupabaseClient():null;
    if(supa&&supa.auth&&supa.auth.mfa){const{data:f}=await supa.auth.mfa.listFactors();const factor=((f&&f.totp)||[]).find(x=>x.status==='verified');
      if(factor){const code=window.prompt(why+'\n\nEnter the current 6-digit code from your authenticator app:','');if(!code)return false;
        const{error}=await supa.auth.mfa.challengeAndVerify({factorId:factor.id,code:String(code).replace(/\s/g,'')});if(error){window.alert('That code isn’t right.');return false;}return true;}}}catch(e){}
  const t=window.prompt(why+'\n\nNo authenticator app is set up for this account (set one up in Master Settings for a stronger check). Type UNLOCK to confirm:','');
  return String(t||'').trim().toUpperCase()==='UNLOCK';
}
function ctlAlert(entries){
  if(!controlRawOn('ctlOwnerAlert')||!entries.length)return;const A=ctlJ(CTL_ALERTS_KEY,[])||[];const at=new Date().toISOString();const by=ctlUserName();
  entries.forEach(x=>A.push({id:'CA'+Date.now()+Math.random().toString(36).slice(2,6),at,by,ctl:x.id,label:x.label,summary:x.summary,seen:false}));ctlPut(CTL_ALERTS_KEY,A.slice(-200));
  if(typeof emailCall==='function'){const text=entries.map(x=>x.label+': '+x.summary).join('\n');emailCall('control_alert',{text,by}).catch(()=>{});}
}
// The one way Controls change from this page: history, locks, second Super Admin and owner alerts.
// changes: {id: newRecord}. Returns {applied:[ids], held:[ids]}.
async function ctlCommit(changes,note){
  const u=currentSessionUser();if(!isSuperAdminUser(u)){window.alert('Only a Super Admin can change controls.');return{applied:[],held:[]};}
  const cur=loadControls();const ids=Object.keys(changes).filter(id=>JSON.stringify(cur[id]||{})!==JSON.stringify(changes[id]||{}));if(!ids.length)return{applied:[],held:[]};
  if(controlRawOn('ctlLocks')){const locked=ids.filter(id=>(cur[id]||{}).locked);if(locked.length&&!(await ctlReauth('Locked switch'+(locked.length>1?'es':'')+': '+locked.map(id=>(controlDef(id)||{}).label||id).join(', '))))return{applied:[],held:[]};}
  const two=controlRawOn('ctlTwoPerson');const held=[],applied=[],alerts=[];
  ids.forEach(id=>{const d=controlDef(id);if(!d)return;const before=ctlEffSnapshot(cur,d),after=ctlEffSnapshot({...cur,[id]:changes[id]},d);
    const turnsOff=CONTROL_STOPS.has(id)&&!before.anyOff&&after.anyOff;
    if(two&&turnsOff&&!(note&&note.approvedBy)){held.push(id);return;}
    applied.push(id);if((CONTROL_STOPS.has(id)||CONTROL_APPROVAL.has(id))&&!before.anyOff&&after.anyOff)alerts.push({id,label:d.label,summary:ctlDescribe(d,cur[id],changes[id])+' — by '+ctlUserName()});});
  if(held.length){const P=ctlJ(CTL_PENDING_KEY,[])||[];held.forEach(id=>{const d=controlDef(id);P.push({id:'CP'+Date.now()+Math.random().toString(36).slice(2,6),ctl:id,label:d.label,before:cur[id]||{},after:changes[id],summary:ctlDescribe(d,cur[id],changes[id]),by:ctlUserName(),byEmail:(u&&u.email)||'',at:new Date().toISOString()});});
    ctlPut(CTL_PENDING_KEY,P);window.alert(held.length+' change'+(held.length>1?'s':'')+' to a safety rule ('+held.map(id=>controlDef(id).label).join(', ')+') now wait for a different Super Admin to approve (Controls → Approvals).');}
  if(applied.length){const n={...cur};applied.forEach(id=>{n[id]=changes[id];});saveControls(n);
    const H=ctlJ(CTL_HISTORY_KEY,[])||[];const at=new Date().toISOString();applied.forEach(id=>{const d=controlDef(id);H.push({id:'CH'+Date.now()+Math.random().toString(36).slice(2,6),at,by:ctlUserName(),ctl:id,before:cur[id]||{},after:changes[id]||{},summary:ctlDescribe(d,cur[id],changes[id]),note:(note&&note.text)||''});});
    ctlPut(CTL_HISTORY_KEY,H.slice(-1500));
    try{logAuditEvent(null,{entity:'Controls',entityId:applied.length===1?applied[0]:'several',action:(note&&note.text)||'Changed',summary:applied.map(id=>(controlDef(id)||{}).label+': '+ctlDescribe(controlDef(id),cur[id],changes[id])).join(' | ').slice(0,600)});}catch(e){}
    ctlAlert(alerts);}
  return{applied,held};
}
function ctlDecidePending(pid,ok){
  const u=currentSessionUser();const P=ctlJ(CTL_PENDING_KEY,[])||[];const x=P.find(p=>p.id===pid);if(!x)return'Not found';
  if(ok&&((u&&u.email&&u.email===x.byEmail)||ctlUserName()===x.by))return'A different Super Admin has to approve this.';
  ctlPut(CTL_PENDING_KEY,P.filter(p=>p.id!==pid));
  if(!ok){try{logAuditEvent(null,{entity:'Controls',entityId:x.ctl,action:'Change rejected',summary:x.label+': '+x.summary+' (asked by '+x.by+')'});}catch(e){}return'';}
  return ctlCommit({[x.ctl]:x.after},{text:'Approved change (asked by '+x.by+')',approvedBy:ctlUserName()}).then(()=>'');
}
// Every-page strip for Super Admins and owners: safety rules switched off, control changes waiting.
function CtlAlertStrip({onOpen}){
  const h=React.createElement;const [,t]=React.useState(0);const u=currentSessionUser();
  const A=(ctlJ(CTL_ALERTS_KEY,[])||[]).filter(a=>!a.seen&&controlRawOn('ctlOwnerAlert'));const P=isSuperAdminUser(u)?(ctlJ(CTL_PENDING_KEY,[])||[]):[];
  if(!A.length&&!P.length)return null;
  const seen=()=>{const L=ctlJ(CTL_ALERTS_KEY,[])||[];L.forEach(a=>a.seen=true);ctlPut(CTL_ALERTS_KEY,L);t(x=>x+1);};
  const wa=()=>{let ph=typeof waNumber==='function'?waNumber(((typeof SALONS!=='undefined'?SALONS:[]).find(s=>s.ownerPhone)||{}).ownerPhone||''):'';
    if(!ph){const typed=window.prompt('Owner’s WhatsApp number:','');ph=typeof waNumber==='function'?waNumber(typed):String(typed||'').replace(/\D/g,'');if(!ph)return;}
    window.open('https://wa.me/'+ph+'?text='+encodeURIComponent('⚠ SalonOS — safety rules switched off:\n'+A.map(a=>'• '+a.label+': '+a.summary+' ('+ctlWhen(a.at)+')').join('\n')),'_blank','noopener');};
  return h('div',{style:{background:'rgba(224,82,82,0.08)',border:'1px solid rgba(224,82,82,0.35)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,fontSize:12.5,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
    h('span',{style:{flex:'1 1 260px'}},A.length?h('span',null,'⚠ ',h('b',null,A.length+' safety rule'+(A.length===1?'':'s')+' switched off'),': '+A.slice(0,2).map(a=>a.label).join(', ')+(A.length>2?' …':'')):null,
      A.length&&P.length?' · ':'',P.length?h('span',null,'⏳ ',h('b',null,P.length),' control change'+(P.length===1?'':'s')+' waiting for a second Super Admin'):null),
    A.length>0&&h('button',{className:'btn btn-ghost btn-sm',onClick:wa},'📲 WhatsApp owner'),onOpen&&h('button',{className:'btn btn-ghost btn-sm',onClick:onOpen},'Open Controls'),
    A.length>0&&h('button',{className:'btn btn-ghost btn-sm',onClick:seen},'Mark seen'));
}

// ── sets (Controls → ctlSets) ──
function ctlBuiltinSets(){const all=CONTROL_DEFS;const stops=d=>CONTROL_STOPS.has(d.id)||CONTROL_APPROVAL.has(d.id);const checks=d=>['Entry checks','Bank mapping','Approvals','Month close'].includes(d.group);
  const mk=f=>Object.fromEntries(all.map(d=>[d.id,{on:f(d)}]));
  return[{name:'Balanced (recommended)',builtin:true,note:'Suggestions and flags on, rules that stop people off',states:mk(d=>d.def)},
    {name:'Strict',builtin:true,note:'Everything recommended, plus every check, approval and rule that stops an entry',states:mk(d=>d.def||stops(d)||checks(d))},
    {name:'Light',builtin:true,note:'Recommended, but no rule stops an entry and nothing needs approval',states:mk(d=>stops(d)?false:d.def)}];}
function ctlSavedSets(){return ctlJ(CTL_SETS_KEY,[])||[];}
function ctlCurrentAsSet(name){const c=loadControls();return{name,at:new Date().toISOString(),by:ctlUserName(),states:Object.fromEntries(CONTROL_DEFS.map(d=>{const x=c[d.id]||{};return[d.id,{on:typeof x.on==='boolean'?x.on:d.def,...(x.limit!=null&&x.limit!==''?{limit:x.limit}:{})}];}))};}
// target: 'all' or [sid,…]
function ctlSetChanges(set,target){const c=loadControls();const ch={};
  CONTROL_DEFS.forEach(d=>{const st=set.states[d.id];if(!st)return;const x={...(c[d.id]||{})};
    if(target==='all'){x.on=!!st.on;x.outlets={};if(st.limit!=null)x.limit=st.limit;}
    else{x.outlets={...(x.outlets||{})};target.forEach(sid=>{x.outlets[String(sid)]=!!st.on;if(st.limit!=null){x.outletLimits={...(x.outletLimits||{}),[String(sid)]:st.limit};}});}
    ch[d.id]=x;});return ch;}
function ctlCopyChanges(fromSid,toSids){const c=loadControls();const ch={};
  CONTROL_DEFS.forEach(d=>{const x={...(c[d.id]||{})};const all=typeof x.on==='boolean'?x.on:d.def;const o=(x.outlets||{})[String(fromSid)];const eff=typeof o==='boolean'?o:all;
    x.outlets={...(x.outlets||{})};const lim=(x.outletLimits||{})[String(fromSid)];toSids.forEach(s=>{x.outlets[String(s)]=eff;if(lim!=null&&lim!==''){x.outletLimits={...(x.outletLimits||{}),[String(s)]:lim};}});ch[d.id]=x;});return ch;}

// ── export (Controls → ctlExport) ──
function ctlRows(outlets){const L=controlLayout();const c=loadControls();const rows=[];
  L.forEach(a=>a.list.forEach(sec=>sec.defs.forEach(d=>{const x=c[d.id]||{};const all=typeof x.on==='boolean'?x.on:d.def;
    rows.push({area:a.title,section:sec.title,label:d.label,hint:d.hint||'',kind:CONTROL_STOPS.has(d.id)?'Stops an entry':CONTROL_APPROVAL.has(d.id)?'Needs approval':'',rec:d.def?'On':'Off',all:all?'On':'Off',
      limit:d.limit!=null?String(x.limit!=null&&x.limit!==''?x.limit:d.limit):'',outlets:outlets.map(s=>{const o=(x.outlets||{})[String(s.id)];const lim=(x.outletLimits||{})[String(s.id)];return((typeof o==='boolean'?o:all)?'On':'Off')+(lim!=null&&lim!==''?' ('+lim+')':'');}),
      extra:[x.locked?'Locked':'',(x.temp||[]).length?'Temporary: '+x.temp.map(t=>(t.on?'on':'off')+(t.to?' until '+ctlDmy(t.to):'')).join(', '):'',(x.roles||[]).length?'Only: '+x.roles.join(', '):'',(x.exempt||[]).length?'Not for: '+x.exempt.join(', '):''].filter(Boolean).join(' · ')});})));
  return rows;}
async function ctlExportExcel(outlets){await loadExcelJS();const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet('Controls');
  const head=['Area','Section','Switch','What it does','Type','Recommended','All outlets','Limit',...outlets.map(s=>String(s.name).split('—')[0].trim()),'Other'];ws.addRow(head);
  ws.getRow(1).eachCell(cl=>{cl.font={bold:true,color:{argb:'FFFFFFFF'}};cl.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF14335E'}};cl.alignment={wrapText:true,vertical:'middle'};});
  ctlRows(outlets).forEach(r=>ws.addRow([r.area,r.section,r.label,r.hint,r.kind,r.rec,r.all,r.limit,...r.outlets,r.extra]));
  [16,24,40,70,14,12,12,10,...outlets.map(()=>14),40].forEach((w,i)=>{ws.getColumn(i+1).width=w;});ws.getColumn(4).alignment={wrapText:true,vertical:'top'};ws.views=[{state:'frozen',xSplit:3,ySplit:1}];ws.autoFilter={from:'A1',to:{row:1,column:head.length}};
  const buf=await wb.xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download='SalonOS Controls '+ctlToday()+'.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function ctlPrintPolicy(outlets){const rows=ctlRows(outlets);const esc=t=>String(t||'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));let area='',html='';
  rows.forEach(r=>{if(r.area!==area){area=r.area;html+='<h2>'+esc(area)+'</h2><table><tr><th>Switch</th><th>What it does</th><th>Setting</th>'+outlets.map(s=>'<th>'+esc(String(s.name).split('—')[0].trim())+'</th>').join('')+'</tr>';}
    html+='<tr><td><b>'+esc(r.label)+'</b><br><small>'+esc(r.section)+(r.kind?' · '+esc(r.kind):'')+'</small></td><td>'+esc(r.hint)+(r.extra?'<br><small>'+esc(r.extra)+'</small>':'')+'</td><td>'+esc(r.all)+(r.limit?' · limit '+esc(r.limit):'')+'</td>'+r.outlets.map(o=>'<td>'+esc(o)+'</td>').join('')+'</tr>';
    const nx=rows[rows.indexOf(r)+1];if(!nx||nx.area!==area)html+='</table>';});
  const w=window.open('','_blank');if(!w){window.alert('Allow pop-ups to print the policy.');return;}
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>SalonOS controls policy</title><style>body{font:12px Arial;margin:24px;color:#222}h1{font-size:18px}h2{font-size:14px;margin:18px 0 6px;color:#14335e}table{width:100%;border-collapse:collapse;margin-bottom:6px}th,td{border:1px solid #ccd;padding:4px 6px;vertical-align:top;text-align:left}th{background:#eef3fa}small{color:#667}@media print{h2{page-break-after:avoid}tr{page-break-inside:avoid}}</style></head><body><h1>SalonOS — controls policy</h1><p>As on '+new Date().toLocaleString('en-GB',DMY_DT)+' · printed by '+esc(ctlUserName())+'. “Setting” is for all outlets; outlet columns show where an outlet differs.</p>'+html+'<script>setTimeout(()=>window.print(),300)<\/script></body></html>');w.document.close();}
function ctlBackup(){const blob=new Blob([JSON.stringify({app:'SalonOS',kind:'controls',at:new Date().toISOString(),by:ctlUserName(),controls:loadControls(),sets:ctlSavedSets()},null,1)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='SalonOS Controls backup '+ctlToday()+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}

// ═════════════════════════════ the page ═════════════════════════════
function ControlsCenterCard({salons}){
  const h=React.createElement;const {toast}=useToast();
  const u=currentSessionUser();const canEdit=isSuperAdminUser(u);
  const [c,setC]=useState(()=>loadControls());const [open,setOpen]=useState(null);const [panel,setPanel]=useState(null);const [tab,setTab]=useState('rules');const [,tick]=useState(0);
  const [cq,setCq]=useState('');const [flt,setFlt]=useState('all');const [viewSid,setViewSid]=useState('');
  const [area,setAreaRaw]=useState(()=>{try{return localStorage.getItem('salonos_ctl_area')||'checks';}catch(e){return'checks';}});const setArea=k=>{setAreaRaw(k);try{localStorage.setItem('salonos_ctl_area',k);}catch(e){}};
  const [wide,setWide]=useState(()=>window.innerWidth>=860);useEffect(()=>{const f=()=>setWide(window.innerWidth>=860);window.addEventListener('resize',f);return()=>window.removeEventListener('resize',f);},[]);
  const outlets=(salons||[]).filter(s=>s&&s.id!=null&&s.status!=='Inactive');const oname=s=>String(s.name).split('—')[0].trim();
  const F=id=>controlRawOn(id);const refresh=()=>{setC(loadControls());tick(x=>x+1);};
  const commit=async(changes,note,msg)=>{if(!canEdit){toast('Only a Super Admin can change controls','error');return;}const r=await ctlCommit(changes,note);refresh();if(r.applied.length&&msg)toast(msg,'success');return r;};
  const upd=(id,patch)=>commit({[id]:{...(c[id]||{}),...patch}});
  const allOn=d=>typeof (c[d.id]||{}).on==='boolean'?c[d.id].on:d.def;
  const outletState=(d,sid)=>{const o=(c[d.id]||{}).outlets||{};return typeof o[String(sid)]==='boolean'?(o[String(sid)]?'on':'off'):'same';};
  const effOn=(d,sid)=>{const st=outletState(d,sid);return st==='same'?allOn(d):st==='on';};
  const setOutlet=(d,sid,v)=>{const o={...((c[d.id]||{}).outlets||{})};if(v==='same')delete o[String(sid)];else o[String(sid)]=v==='on';upd(d.id,{outlets:o});};
  const setOutletLimit=(d,sid,v)=>{const o={...((c[d.id]||{}).outletLimits||{})};if(v===''||v==null)delete o[String(sid)];else o[String(sid)]=v;upd(d.id,{outletLimits:o});};
  const overN=d=>outlets.filter(s=>outletState(d,s.id)!=='same').length;
  const L=controlLayout();const cur=L.find(a=>a.key===area)||L[0];
  const secOf={};L.forEach(a=>a.list.forEach(x=>x.defs.forEach(d=>{secOf[d.id]={area:a,section:x.title};})));
  const isNew=d=>F('ctlWhatsNew')&&CONTROL_ADDED[d.id]&&(Date.now()-new Date(CONTROL_ADDED[d.id]+'T00:00:00'))<30*864e5;
  const stats=d=>CTL_COUNTED.has(d.id)?controlHitStats(d.id,30):null;const H=ctlJ(CTL_HITS_KEY,{})||{};const countingDays=H._since?Math.round((Date.now()-new Date(H._since+'T00:00:00'))/864e5):0;
  const noisy=d=>{const s=stats(d);return s&&s.w>=10&&s.o/s.w>=0.7;};const never=d=>{const s=stats(d);return s&&allOn(d)&&countingDays>=30&&!s.w&&!s.b;};
  const reqMissing=d=>F('ctlLinks')?(CONTROL_REQUIRES[d.id]||[]).filter(r=>controlDef(r)&&!controlRawOn(r)):[];
  const FILTERS=[['all','All'],['on','On'],['off','Off'],['outlet','Set outlet-wise'],['changed','Changed from recommended'],['stops','Stops an entry'],['appr','Needs approval'],
    ...(F('ctlTemporary')?[['temp','Temporary']]:[]),...(F('ctlRoleRules')?[['roles','Role-wise']]:[]),...(F('ctlLocks')?[['locked','Locked']]:[]),
    ...(F('ctlHitStats')?[['noisy','Noisy'],['never','Never fires']]:[]),...(F('ctlWhatsNew')?[['new','New']]:[])];
  const fltOk=d=>{const x=c[d.id]||{};switch(flt){case 'all':return true;case 'on':return allOn(d);case 'off':return !allOn(d);case 'outlet':return overN(d)>0;case 'changed':return allOn(d)!==d.def||overN(d)>0;
    case 'stops':return CONTROL_STOPS.has(d.id);case 'appr':return CONTROL_APPROVAL.has(d.id);case 'temp':return (x.temp||[]).length>0;case 'roles':return (x.roles||[]).length+(x.exempt||[]).length>0;case 'locked':return !!x.locked;
    case 'noisy':return noisy(d);case 'never':return never(d);case 'new':return !!isNew(d);default:return true;}};
  const qOk=d=>!cq.trim()||(d.label+' '+(d.hint||'')+' '+d.group).toLowerCase().includes(cq.trim().toLowerCase());
  const vis=d=>fltOk(d)&&qOk(d);const searching=!!cq.trim()||flt!=='all';
  const viewing=F('ctlOutletView')&&viewSid?outlets.find(s=>String(s.id)===String(viewSid)):null;
  const bulk=(defs,mode)=>{if(!canEdit){toast('Only a Super Admin can change controls','error');return;}
    const what=mode==='rec'?'the recommended setting':mode==='on'?'ON':'OFF';const scope=viewing?oname(viewing):'all outlets';
    if(!window.confirm('Set all '+defs.length+' switches in “'+cur.title+'” to '+what+' for '+scope+'?'+(mode==='rec'&&!viewing?'\n\nOutlet-wise choices are cleared; limits stay.':'')))return;
    const ch={};defs.forEach(d=>{const x={...(c[d.id]||{})};const v=mode==='rec'?d.def:mode==='on';if(viewing){x.outlets={...(x.outlets||{}),[String(viewing.id)]:v};}else{x.on=v;if(mode==='rec')x.outlets={};}ch[d.id]=x;});
    commit(ch,{text:'Bulk: '+cur.title+' → '+what+' ('+scope+')'},cur.title+': set to '+what);};
  const pill=(t,bg,fg,title)=>h('span',{title,style:{fontSize:10.5,fontWeight:600,padding:'1px 7px',borderRadius:10,background:bg,color:fg,whiteSpace:'nowrap'}},t);
  const sw=(on,onClick,dis)=>h('div',{className:'toggle-switch '+(on?'on':''),style:{flexShrink:0,opacity:dis?.5:1,cursor:dis?'not-allowed':'pointer'},onClick:dis?undefined:onClick,role:'switch','aria-checked':on});
  const hist=F('ctlLastChanged')?(ctlJ(CTL_HISTORY_KEY,[])||[]):[];const lastOf=id=>{for(let i=hist.length-1;i>=0;i--)if(hist[i].ctl===id)return hist[i];return null;};
  const undo=e=>{if(!window.confirm('Undo this change?\n\n'+(controlDef(e.ctl)||{}).label+': '+e.summary))return;commit({[e.ctl]:e.before||{}},{text:'Undo ('+e.summary+')'},'Undone');};
  const showMe=d=>{const s=secOf[d.id]||{};const w=CTL_WHERE_ID[d.id]||CTL_WHERE_SECTION[s.section]||CTL_WHERE_AREA[s.area&&s.area.key]||'page:dashboard';const nav=window.__salonosNav;if(!nav){toast('Open the app to use Show me','info');return;}
    if(w.startsWith('page:')){nav.setActivePage(w.slice(5));return;}const sn=(nav.selectedSalon)||(viewing)||(nav.accessibleSalons||nav.salons||[])[0];if(!sn){toast('No outlet to open','error');return;}
    if(typeof nav.openFromAlert==='function')nav.openFromAlert(sn,w);else{nav.setSelectedSalon(sn);nav.setActivePage('salon');nav.setSalonTab(w);}};
  const whereLabel=d=>{const s=secOf[d.id]||{};const w=CTL_WHERE_ID[d.id]||CTL_WHERE_SECTION[s.section]||CTL_WHERE_AREA[s.area&&s.area.key]||'page:dashboard';return CTL_TAB_LABEL[w]||w;};
  // panels under a row: outlet-wise, temporary, roles
  const rolesAll=['Super Admin','Salon Owner','Salon Manager','ASM','Data Entry User','Accountant','Reviewer'];const people=(typeof loadUserAccounts==='function'?loadUserAccounts():[])||[];
  const TempPanel=({d})=>{const x=c[d.id]||{};const [f,setF]=useState({on:!allOn(d),from:ctlToday(),to:'',sid:''});
    const add=()=>{if(!f.to&&!f.from){toast('Pick the dates','error');return;}if(f.to&&f.from&&f.to<f.from){toast('“Until” is before “From”','error');return;}
      const list=[...(x.temp||[]).filter(t=>!t.to||t.to>=ctlToday()),{on:!!f.on,from:f.from||null,to:f.to||null,sid:f.sid===''?null:Number(f.sid),by:ctlUserName(),at:new Date().toISOString()}];upd(d.id,{temp:list});};
    return h('div',{style:{marginTop:8,background:'var(--bg3)',borderRadius:'var(--r)',padding:'8px 10px',fontSize:12.5}},
      (x.temp||[]).map((t,i)=>h('div',{key:i,style:{display:'flex',gap:8,alignItems:'center',padding:'2px 0'}},h('span',{style:{flex:1}},(t.on?'On':'Off')+(t.from?' from '+ctlDmy(t.from):'')+(t.to?' until '+ctlDmy(t.to):'')+' · '+(t.sid!=null?ctlOutletName(t.sid):'all outlets')+(t.to&&t.to<ctlToday()?' (ended)':'')),
        canEdit&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>upd(d.id,{temp:(x.temp||[]).filter((_,j)=>j!==i)})},'Remove'))),
      canEdit&&h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',marginTop:4}},
        h('select',{className:'form-control',style:{width:'auto',padding:'3px 6px'},value:f.on?'on':'off',onChange:e=>setF({...f,on:e.target.value==='on'})},h('option',{value:'on'},'On'),h('option',{value:'off'},'Off')),
        'from',h('input',{type:'date',className:'form-control',style:{width:'auto',padding:'3px 6px'},value:f.from,onChange:e=>setF({...f,from:e.target.value})}),
        'until',h('input',{type:'date',className:'form-control',style:{width:'auto',padding:'3px 6px'},value:f.to,onChange:e=>setF({...f,to:e.target.value})}),
        h('select',{className:'form-control',style:{width:'auto',padding:'3px 6px'},value:f.sid,onChange:e=>setF({...f,sid:e.target.value})},h('option',{value:''},'All outlets'),outlets.map(s=>h('option',{key:s.id,value:s.id},oname(s)))),
        h('button',{className:'btn btn-primary btn-sm',onClick:add},'Add')),
      h('div',{style:{fontSize:11,color:'var(--text3)',marginTop:4}},'Goes back to the normal setting by itself after the “until” date.'));};
  const RolesPanel=({d})=>{const x=c[d.id]||{};const roles=x.roles||[],ex=x.exempt||[];
    const tog=(k,list,v)=>upd(d.id,{[k]:list.includes(v)?list.filter(y=>y!==v):[...list,v]});
    return h('div',{style:{marginTop:8,background:'var(--bg3)',borderRadius:'var(--r)',padding:'8px 10px',fontSize:12.5}},
      h('div',{style:{fontWeight:600,marginBottom:4}},'Applies only to these roles (none ticked = everyone):'),
      h('div',{style:{display:'flex',gap:10,flexWrap:'wrap'}},rolesAll.map(r=>h('label',{key:r,style:{display:'flex',gap:4,alignItems:'center'}},h('input',{type:'checkbox',disabled:!canEdit,checked:roles.includes(r),onChange:()=>tog('roles',roles,r)}),r))),
      h('div',{style:{fontWeight:600,margin:'8px 0 4px'}},'Not for these people:'),
      h('div',{style:{display:'flex',gap:10,flexWrap:'wrap'}},people.filter(p=>p&&(p.email||p.name)).map(p=>{const k=p.email||p.name;return h('label',{key:k,style:{display:'flex',gap:4,alignItems:'center'}},h('input',{type:'checkbox',disabled:!canEdit,checked:ex.includes(k),onChange:()=>tog('exempt',ex,k)}),(p.name||p.email)+(p.role?' · '+p.role:''));})),
      h('div',{style:{fontSize:11,color:'var(--text3)',marginTop:4}},'For anyone it does not apply to, the switch counts as off.'));};
  const ctlRow=d=>{const x=c[d.id]||{};const over=overN(d);const on=viewing?effOn(d,viewing.id):allOn(d);const nOn=outlets.filter(s=>effOn(d,s.id)).length;const miss=reqMissing(d);const st=F('ctlHitStats')?stats(d):null;const last=F('ctlLastChanged')?lastOf(d.id):null;
    const tmpNow=controlTempFor(x,viewing?viewing.id:null);const toggle=()=>{if(viewing){setOutlet(d,viewing.id,on?'off':'on');return;}
      if(!on&&miss.length&&window.confirm('“'+d.label+'” needs '+miss.map(r=>'“'+controlDef(r).label+'”').join(' and ')+', which '+(miss.length>1?'are':'is')+' off. Turn '+(miss.length>1?'them':'it')+' on too?')){const ch={[d.id]:{...x,on:true}};miss.forEach(r=>{ch[r]={...(c[r]||{}),on:true};});commit(ch,{text:'Turned on with what it needs'},'Turned on');return;}
      upd(d.id,{on:!on});};
    return h('div',{key:d.id,style:{borderTop:'1px solid var(--border)',padding:'10px 0',opacity:miss.length&&on?.65:1}},
      h('div',{style:{display:'flex',alignItems:'flex-start',gap:12,flexWrap:'wrap'}},
        h('div',{style:{flex:'1 1 260px',minWidth:0}},
          h('div',{style:{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}},h('span',{style:{fontSize:13,color:'var(--text)',fontWeight:600}},d.label),
            isNew(d)&&pill('New','rgba(46,160,90,0.14)','var(--green)'),
            CONTROL_STOPS.has(d.id)&&pill('Stops an entry','rgba(224,82,82,0.12)','var(--red)'),CONTROL_APPROVAL.has(d.id)&&pill('Needs approval','rgba(70,120,220,0.12)','var(--blue,#3b6fd8)'),
            allOn(d)!==d.def&&pill('Changed','rgba(224,138,18,0.14)','var(--orange,#c27711)'),
            F('ctlLocks')&&x.locked&&pill('🔒 Locked','rgba(100,100,120,0.15)','var(--text2)'),
            tmpNow&&pill('⏱ '+(tmpNow.on?'On':'Off')+(tmpNow.to?' until '+ctlDmy(tmpNow.to):''),'rgba(130,90,200,0.14)','#7a4fc4'),
            F('ctlRoleRules')&&((x.roles||[]).length>0)&&pill('👤 Only: '+x.roles.join(', '),'rgba(130,90,200,0.10)','#7a4fc4'),
            F('ctlRoleRules')&&((x.exempt||[]).length>0)&&pill('👤 Not for '+x.exempt.length,'rgba(130,90,200,0.10)','#7a4fc4'),
            miss.length>0&&pill('Needs: '+miss.map(r=>controlDef(r).label).join(', '),'rgba(224,82,82,0.10)','var(--red)','Switch this on too, or this switch cannot work')),
          h('div',{style:{fontSize:11.5,color:'var(--text3)',lineHeight:1.5,marginTop:2}},d.hint),
          F('ctlShowMe')&&CTL_SAMPLE[d.id]&&h('div',{style:{fontSize:11.5,color:'var(--text2)',fontStyle:'italic',marginTop:2}},'Staff see: '+CTL_SAMPLE[d.id]),
          (st||last)&&h('div',{style:{fontSize:11,color:'var(--text3)',marginTop:3,display:'flex',gap:10,flexWrap:'wrap'}},
            st&&h('span',null,'Last 30 days: '+st.w+' warning'+(st.w===1?'':'s')+' · '+st.o+' overridden · '+st.b+' blocked'+(noisy(d)?' — noisy':never(d)?' — never fired':'')),
            F('ctlHitStats')&&!st&&h('span',null,'Not counted'),
            last&&h('span',null,'Changed by '+last.by+' · '+ctlWhen(last.at)+' (',last.summary,') ',canEdit&&h('a',{href:'#',onClick:e=>{e.preventDefault();undo(last);}},'Undo')))),
        h('div',{style:{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginLeft:'auto'}},
          d.limit!=null&&h('label',{style:{fontSize:11.5,color:'var(--text3)',display:'flex',alignItems:'center',gap:4}},d.limitLabel||'Limit ₹',h('input',{type:'number',min:0,className:'form-control',style:{width:88,padding:'3px 6px'},disabled:!canEdit,defaultValue:x.limit!=null?x.limit:d.limit,onBlur:e=>{if(String(e.target.value)!==String(x.limit!=null?x.limit:d.limit))upd(d.id,{limit:e.target.value});}})),
          F('ctlShowMe')&&h('button',{className:'btn btn-ghost btn-sm',title:'Open '+whereLabel(d),onClick:()=>showMe(d)},'Show me'),
          F('ctlTemporary')&&h('button',{className:'btn btn-ghost btn-sm',title:'On or off for a date range',onClick:()=>setPanel(panel==='t'+d.id?null:'t'+d.id)},'⏱'),
          F('ctlRoleRules')&&h('button',{className:'btn btn-ghost btn-sm',title:'Only for some roles / not for some people',onClick:()=>setPanel(panel==='r'+d.id?null:'r'+d.id)},'👤'),
          F('ctlLocks')&&canEdit&&h('button',{className:'btn btn-ghost btn-sm',title:x.locked?'Unlock (needs your authenticator code)':'Lock this switch',onClick:()=>upd(d.id,{locked:!x.locked})},x.locked?'🔓':'🔒'),
          outlets.length>1&&!viewing&&h('button',{className:'btn btn-ghost btn-sm',style:{whiteSpace:'nowrap'},title:'Set a different choice for any outlet',onClick:()=>setOpen(open===d.id?null:d.id)},(over?'On in '+nOn+' of '+outlets.length+' outlets':'Outlet-wise')+(open===d.id?' ▴':' ▾')),
          viewing&&outletState(d,viewing.id)!=='same'&&h('a',{href:'#',style:{fontSize:11},onClick:e=>{e.preventDefault();setOutlet(d,viewing.id,'same');}},'same as all'),
          h('span',{style:{fontSize:11,fontWeight:600,color:on?'var(--green)':'var(--text3)',width:24,textAlign:'right'}},on?'On':'Off'),sw(on,toggle,!canEdit))),
      open===d.id&&!viewing&&h('div',{style:{marginTop:8,background:'var(--bg3)',borderRadius:'var(--r)',padding:'6px 10px'}},
        outlets.map(s=>{const so=outletState(d,s.id);const eff=effOn(d,s.id);const ol=((x.outletLimits||{})[String(s.id)]);
          return h('div',{key:s.id,style:{display:'flex',alignItems:'center',gap:8,padding:'4px 0',fontSize:12.5,flexWrap:'wrap'}},
            h('span',{style:{flex:'1 1 140px'}},oname(s)),
            d.limit!=null&&F('ctlOutletLimits')&&h('input',{type:'number',min:0,className:'form-control',style:{width:90,padding:'2px 6px'},disabled:!canEdit,placeholder:'same',title:'Limit for this outlet (blank = same as all)',defaultValue:ol??'',onBlur:e=>{if(String(e.target.value)!==String(ol??''))setOutletLimit(d,s.id,e.target.value);}}),
            h('span',{style:{fontSize:11,color:eff?'var(--green)':'var(--text3)',width:28}},eff?'On':'Off'),
            [['same','Same as all'],['on','On'],['off','Off']].map(([v,l])=>h('button',{key:v,disabled:!canEdit,className:'btn btn-sm '+(so===v?'btn-primary':'btn-ghost'),style:{padding:'2px 8px'},onClick:()=>setOutlet(d,s.id,v)},l)));})),
      panel==='t'+d.id&&h(TempPanel,{d}),panel==='r'+d.id&&h(RolesPanel,{d}));};
  const subCard=(title,defs,crumb)=>h('div',{key:(crumb||'')+title,style:{border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'8px 12px 2px',marginBottom:12,background:'var(--bg2)'}},
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8,marginBottom:4}},
      h('div',{style:{fontSize:12,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.05em'}},(crumb?crumb+' › ':'')+title),
      h('div',{style:{fontSize:11,color:'var(--text3)',whiteSpace:'nowrap'}},defs.filter(d=>viewing?effOn(d,viewing.id):allOn(d)).length+' of '+defs.length+' on')),
    defs.map(ctlRow));
  const navBtn=a=>{const onN=a.all.filter(d=>viewing?effOn(d,viewing.id):allOn(d)).length;const act=a.key===cur.key&&!searching;
    return h('button',{key:a.key,onClick:()=>{setArea(a.key);setCq('');setFlt('all');},className:'btn btn-sm '+(act?'btn-primary':'btn-ghost'),
      style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,width:wide?'100%':'auto',flexShrink:0,textAlign:'left',padding:'7px 10px',whiteSpace:'nowrap'}},
      h('span',null,a.icon+' '+a.title),h('span',{style:{fontSize:11,opacity:.8}},onN+'/'+a.all.length));};
  const rulesView=()=>{
    const hits=searching?L.map(a=>({a,list:a.list.map(x=>({title:x.title,defs:x.defs.filter(vis)})).filter(x=>x.defs.length)})).filter(x=>x.list.length):[];
    const nHits=hits.reduce((t,x)=>t+x.list.reduce((u2,y)=>u2+y.defs.length,0),0);
    return h('div',null,
      h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',margin:'0 0 8px'}},
        h('input',{className:'form-control',style:{flex:'1 1 240px'},placeholder:'🔍 Search all '+CONTROL_DEFS.length+' switches…',value:cq,onChange:e=>setCq(e.target.value)}),
        cq&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setCq('')},'Clear'),
        F('ctlOutletView')&&outlets.length>1&&h('select',{className:'form-control',style:{width:'auto'},value:viewSid,onChange:e=>setViewSid(e.target.value),title:'See and switch everything for one outlet'},
          h('option',{value:''},'Showing: all outlets'),outlets.map(s=>h('option',{key:s.id,value:s.id},'Showing: '+oname(s))))),
      viewing&&h('div',{style:{fontSize:12,color:'var(--text2)',background:'rgba(70,120,220,0.08)',borderRadius:'var(--r)',padding:'6px 10px',marginBottom:8}},'Showing '+oname(viewing)+' — switches here change this outlet only. “same as all” puts it back on the all-outlets setting.'),
      h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}},FILTERS.map(([k,l])=>h('button',{key:k,className:'btn btn-sm '+(flt===k?'btn-primary':'btn-ghost'),style:{padding:'3px 10px',borderRadius:14},onClick:()=>setFlt(k)},l))),
      F('ctlHitStats')&&(flt==='never')&&countingDays<30&&h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:8}},'Counting started '+(H._since?ctlDmy(H._since):'today')+' — “never fires” needs 30 days of counts.'),
      h('div',{style:{display:'flex',gap:16,alignItems:'flex-start',flexDirection:wide?'row':'column'}},
        h('div',{style:wide?{flex:'0 0 230px',display:'flex',flexDirection:'column',gap:4,position:'sticky',top:8}:{display:'flex',gap:6,overflowX:'auto',width:'100%',paddingBottom:4}},L.map(navBtn)),
        h('div',{style:{flex:'1 1 auto',minWidth:0,width:'100%'}},
          searching
            ?h('div',null,h('div',{style:{fontSize:12.5,color:'var(--text3)',marginBottom:8}},nHits?nHits+' switch'+(nHits===1?'':'es')+' found':'No switch matches.'),hits.flatMap(x=>x.list.map(y=>subCard(y.title,y.defs,x.a.icon+' '+x.a.title))))
            :h('div',null,
              h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:10}},
                h('div',null,h('div',{style:{fontSize:16,fontWeight:700,color:'var(--text)'}},cur.icon+' '+cur.title),
                  h('div',{style:{fontSize:12,color:'var(--text3)'}},cur.all.filter(d=>viewing?effOn(d,viewing.id):allOn(d)).length+' of '+cur.all.length+' switched on'+(viewing?' at '+oname(viewing):'')+' · '+cur.list.length+' section'+(cur.list.length===1?'':'s'))),
                canEdit&&h('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},
                  h('button',{className:'btn btn-ghost btn-sm',title:'Suggestions and flags on, rules that stop people off',onClick:()=>bulk(cur.all,'rec')},'↺ Recommended'),
                  h('button',{className:'btn btn-ghost btn-sm',onClick:()=>bulk(cur.all,'on')},'All on'),
                  h('button',{className:'btn btn-ghost btn-sm',onClick:()=>bulk(cur.all,'off')},'All off'))),
              cur.list.map(x=>subCard(x.title,x.defs))))));};

  // ── Check-up: comparison grid + health (ctlCompare / ctlHealth) ──
  const [cuArea,setCuArea]=useState('');
  const checkupView=()=>{const A=L.find(a=>a.key===(cuArea||cur.key))||L[0];const defs=A.all;
    const health=s=>Math.round(defs.filter(d=>effOn(d,s.id)===d.def).length/Math.max(1,defs.length)*100);
    const fix=s=>{const ch={};defs.forEach(d=>{if(effOn(d,s.id)!==d.def){const x={...(c[d.id]||{})};const o={...(x.outlets||{})};if(allOn(d)===d.def)delete o[String(s.id)];else o[String(s.id)]=d.def;x.outlets=o;ch[d.id]=x;}});
      if(!Object.keys(ch).length){toast(oname(s)+' already uses the recommended settings','info');return;}if(!window.confirm('Set '+Object.keys(ch).length+' switch(es) in “'+A.title+'” to the recommended setting at '+oname(s)+'?'))return;commit(ch,{text:'Fix: '+A.title+' at '+oname(s)},oname(s)+' fixed');};
    const useRecAll=()=>{if(!window.confirm('Set every switch in “'+A.title+'” to the recommended setting for all outlets (outlet-wise choices are cleared; limits stay)?'))return;const ch={};defs.forEach(d=>{ch[d.id]={...(c[d.id]||{}),on:d.def,outlets:{}};});commit(ch,{text:'Recommended: '+A.title},'Recommended settings applied');};
    const cycle=(d,s)=>{const st=outletState(d,s.id);setOutlet(d,s.id,st==='same'?(allOn(d)?'off':'on'):'same');};
    const off=defs.reduce((t,d)=>t+outlets.filter(s=>effOn(d,s.id)!==d.def).length,0);
    return h('div',null,
      h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:8}},
        h('select',{className:'form-control',style:{width:'auto'},value:A.key,onChange:e=>setCuArea(e.target.value)},L.map(a=>h('option',{key:a.key,value:a.key},a.icon+' '+a.title))),
        h('span',{style:{fontSize:12.5,color:off?'var(--orange)':'var(--green)',flex:1}},off?off+' outlet setting(s) differ from the recommended one (shaded).':'✓ Every outlet uses the recommended settings here.'),
        canEdit&&h('button',{className:'btn btn-primary btn-sm',onClick:useRecAll},'Use recommended for all outlets')),
      F('ctlHealth')&&h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}},outlets.map(s=>{const p=health(s);return h('div',{key:s.id,className:'card',style:{padding:'8px 12px',minWidth:150,margin:0}},
        h('div',{style:{fontSize:12,color:'var(--text3)'}},oname(s)),h('div',{style:{fontSize:20,fontWeight:700,color:p>=90?'var(--green)':p>=70?'var(--orange,#c27711)':'var(--red)'}},p+'%'),
        h('div',{style:{fontSize:11,color:'var(--text3)'}},'at the recommended setting'),canEdit&&p<100&&h('button',{className:'btn btn-ghost btn-sm',style:{marginTop:4},onClick:()=>fix(s)},'Fix'));})),
      F('ctlCompare')&&h('div',{className:'table-wrap'},h('table',null,
        h('thead',null,h('tr',null,h('th',null,'Switch'),h('th',null,'Recommended'),h('th',null,'All outlets'),outlets.map(s=>h('th',{key:s.id,style:{textAlign:'center'}},oname(s))))),
        h('tbody',null,A.list.flatMap(sec=>[h('tr',{key:'s'+sec.title},h('td',{colSpan:3+outlets.length,style:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase'}},sec.title)),
          ...sec.defs.map(d=>h('tr',{key:d.id},h('td',{style:{fontSize:12.5}},d.label),h('td',{style:{fontSize:12,color:'var(--text3)'}},d.def?'On':'Off'),h('td',{style:{fontSize:12}},allOn(d)?'On':'Off'),
            outlets.map(s=>{const v=effOn(d,s.id);const st=outletState(d,s.id);return h('td',{key:s.id,title:canEdit?'Click to change for '+oname(s)+(st==='same'?'':' (set outlet-wise)'):'',onClick:canEdit?()=>cycle(d,s):undefined,
              style:{textAlign:'center',fontSize:12,fontWeight:600,cursor:canEdit?'pointer':'default',color:v?'var(--green)':'var(--text3)',background:v!==d.def?'rgba(224,138,18,0.14)':undefined}},(v?'On':'Off')+(st!=='same'?' •':''));})))])))),
      h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'Shaded = differs from the recommended setting · • = set outlet-wise · click a cell to change that outlet.'));};

  // ── Sets, copy, export (ctlSets / ctlCopyOutlet / ctlExport) ──
  const [setTarget,setSetTarget]=useState('all');const [copyFrom,setCopyFrom]=useState('');const [copyTo,setCopyTo]=useState([]);const fileRef=React.useRef(null);
  const setsView=()=>{const saved=ctlSavedSets();const sets=[...ctlBuiltinSets(),...saved];
    const apply=set=>{const target=setTarget==='all'?'all':[Number(setTarget)];if(!window.confirm('Apply “'+set.name+'” to '+(target==='all'?'all outlets':ctlOutletName(target[0]))+'?'))return;commit(ctlSetChanges(set,target),{text:'Set applied: '+set.name},'“'+set.name+'” applied');};
    const save=()=>{const n=window.prompt('Name for this set (the current switches and limits):','');if(!n||!n.trim())return;const L2=ctlSavedSets().filter(x=>x.name!==n.trim());L2.push(ctlCurrentAsSet(n.trim()));ctlPut(CTL_SETS_KEY,L2);toast('Saved “'+n.trim()+'”','success');tick(x=>x+1);};
    const del=set=>{if(!window.confirm('Delete the set “'+set.name+'”?'))return;ctlPut(CTL_SETS_KEY,ctlSavedSets().filter(x=>x.name!==set.name));tick(x=>x+1);};
    const doCopy=()=>{if(!copyFrom||!copyTo.length){toast('Pick the outlet to copy from and the outlets to copy to','error');return;}const to=copyTo.filter(x=>String(x)!==String(copyFrom));
      if(!window.confirm('Give '+to.map(ctlOutletName).join(', ')+' the same switches'+(F('ctlOutletLimits')?' and limits':'')+' as '+ctlOutletName(copyFrom)+'?'))return;commit(ctlCopyChanges(copyFrom,to),{text:'Copied from '+ctlOutletName(copyFrom)},'Copied');};
    const restore=async e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;try{const j=JSON.parse(await f.text());if(!j||j.kind!=='controls'||!j.controls)throw new Error('Not a SalonOS controls backup');
      if(!window.confirm('Restore the controls saved on '+ctlWhen(j.at)+(j.by?' by '+j.by:'')+'? Every switch goes back to that state.'))return;
      const ch={};CONTROL_DEFS.forEach(d=>{ch[d.id]=j.controls[d.id]||{};});await commit(ch,{text:'Restored from backup of '+ctlWhen(j.at)},'Restored');if(Array.isArray(j.sets)&&j.sets.length)ctlPut(CTL_SETS_KEY,j.sets);}catch(err){toast('Could not restore: '+(err.message||err),'error');}};
    const box=(t,...k)=>h('div',{style:{border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 12px',marginBottom:12,background:'var(--bg2)'}},h('div',{style:{fontSize:12,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',marginBottom:6}},t),...k);
    return h('div',null,
      F('ctlSets')&&box('Sets',
        h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:8,fontSize:12.5}},'Apply to',h('select',{className:'form-control',style:{width:'auto'},value:setTarget,onChange:e=>setSetTarget(e.target.value)},h('option',{value:'all'},'All outlets'),outlets.map(s=>h('option',{key:s.id,value:s.id},oname(s)))),
          canEdit&&h('button',{className:'btn btn-ghost btn-sm',onClick:save},'💾 Save current as a set')),
        sets.map(set=>h('div',{key:set.name,style:{display:'flex',gap:8,alignItems:'center',borderTop:'1px solid var(--border)',padding:'7px 0',flexWrap:'wrap'}},
          h('div',{style:{flex:'1 1 240px'}},h('b',{style:{fontSize:13}},set.name),h('div',{style:{fontSize:11.5,color:'var(--text3)'}},set.note||('Saved '+ctlWhen(set.at)+(set.by?' by '+set.by:'')))),
          canEdit&&h('button',{className:'btn btn-primary btn-sm',onClick:()=>apply(set)},'Apply'),canEdit&&!set.builtin&&h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>del(set)},'Delete')))),
      F('ctlCopyOutlet')&&outlets.length>1&&box('Copy from another outlet',
        h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',fontSize:12.5}},'Copy from',h('select',{className:'form-control',style:{width:'auto'},value:copyFrom,onChange:e=>setCopyFrom(e.target.value)},h('option',{value:''},'— pick —'),outlets.map(s=>h('option',{key:s.id,value:s.id},oname(s)))),'to',
          outlets.filter(s=>String(s.id)!==String(copyFrom)).map(s=>h('label',{key:s.id,style:{display:'flex',gap:4,alignItems:'center'}},h('input',{type:'checkbox',checked:copyTo.includes(String(s.id)),onChange:()=>setCopyTo(t=>t.includes(String(s.id))?t.filter(x=>x!==String(s.id)):[...t,String(s.id)])}),oname(s))),
          canEdit&&h('button',{className:'btn btn-primary btn-sm',onClick:doCopy},'Copy'))),
      F('ctlExport')&&box('Export, print and backup',
        h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
          h('button',{className:'btn btn-ghost btn-sm',onClick:()=>ctlExportExcel(outlets).catch(e=>toast('Could not export: '+(e.message||e),'error'))},'⬇ Excel'),
          h('button',{className:'btn btn-ghost btn-sm',onClick:()=>ctlPrintPolicy(outlets)},'🖨 Controls policy (PDF)'),
          h('button',{className:'btn btn-ghost btn-sm',onClick:ctlBackup},'⬇ Backup file'),
          canEdit&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>fileRef.current&&fileRef.current.click()},'⬆ Restore from backup'),
          h('input',{ref:fileRef,type:'file',accept:'.json,application/json',style:{display:'none'},onChange:restore})),
        h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'The policy opens in a new window — choose “Save as PDF” in the print dialog.')),
      !F('ctlSets')&&!F('ctlCopyOutlet')&&!F('ctlExport')&&h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'Sets, copying and export are switched off (Controls page area).'));};

  // ── History (ctlHistory) ──
  const [hq,setHq]=useState({who:'',area:'',from:'',to:''});
  const historyView=()=>{const all=(ctlJ(CTL_HISTORY_KEY,[])||[]).slice().reverse();const who=[...new Set(all.map(e=>e.by))];
    const list=all.filter(e=>(!hq.who||e.by===hq.who)&&(!hq.area||(secOf[e.ctl]&&secOf[e.ctl].area.key===hq.area))&&(!hq.from||e.at.slice(0,10)>=hq.from)&&(!hq.to||e.at.slice(0,10)<=hq.to));
    return h('div',null,
      h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:10,fontSize:12.5}},
        h('select',{className:'form-control',style:{width:'auto'},value:hq.who,onChange:e=>setHq({...hq,who:e.target.value})},h('option',{value:''},'Everyone'),who.map(w=>h('option',{key:w,value:w},w))),
        h('select',{className:'form-control',style:{width:'auto'},value:hq.area,onChange:e=>setHq({...hq,area:e.target.value})},h('option',{value:''},'All areas'),L.map(a=>h('option',{key:a.key,value:a.key},a.icon+' '+a.title))),
        'from',h('input',{type:'date',className:'form-control',style:{width:'auto'},value:hq.from,onChange:e=>setHq({...hq,from:e.target.value})}),
        'to',h('input',{type:'date',className:'form-control',style:{width:'auto'},value:hq.to,onChange:e=>setHq({...hq,to:e.target.value})}),
        h('span',{style:{color:'var(--text3)'}},list.length+' change'+(list.length===1?'':'s'))),
      !list.length&&h('div',{style:{fontSize:12.5,color:'var(--text3)'}},all.length?'Nothing matches.':'No changes recorded yet — changes made from now on are listed here.'),
      list.slice(0,300).map(e=>h('div',{key:e.id,style:{display:'flex',gap:10,alignItems:'flex-start',borderTop:'1px solid var(--border)',padding:'7px 0',fontSize:12.5}},
        h('div',{style:{flex:1}},h('b',null,(controlDef(e.ctl)||{}).label||e.ctl),' — ',e.summary,e.note?h('span',{style:{color:'var(--text3)'}},' · '+e.note):null,
          h('div',{style:{fontSize:11,color:'var(--text3)'}},ctlWhen(e.at)+' · '+e.by+(secOf[e.ctl]?' · '+secOf[e.ctl].area.title+' › '+secOf[e.ctl].section:''))),
        canEdit&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{if(!window.confirm('Put “'+((controlDef(e.ctl)||{}).label||e.ctl)+'” back to how it was before this change?'))return;commit({[e.ctl]:e.before||{}},{text:'Reverted change of '+ctlWhen(e.at)},'Reverted');}},'Revert'))));};

  // ── What's new (ctlWhatsNew) ──
  const newView=()=>{const by={};Object.entries(CONTROL_ADDED).forEach(([id,d])=>{if(controlDef(id))(by[d]=by[d]||[]).push(controlDef(id));});
    return h('div',null,Object.keys(by).sort().reverse().map(d=>h('div',{key:d,style:{marginBottom:12}},h('div',{style:{fontSize:12,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',marginBottom:4}},'Added '+ctlDmy(d)+' · '+by[d].length+' switches'),
      by[d].map(x=>h('div',{key:x.id,style:{display:'flex',gap:8,alignItems:'center',borderTop:'1px solid var(--border)',padding:'6px 0',fontSize:12.5}},
        h('div',{style:{flex:1}},h('b',null,x.label),h('div',{style:{fontSize:11.5,color:'var(--text3)'}},(secOf[x.id]?secOf[x.id].area.title+' › '+secOf[x.id].section+' · ':'')+(x.def?'starts on':'starts off'))),
        h('span',{style:{fontSize:11,fontWeight:600,color:allOn(x)?'var(--green)':'var(--text3)'}},allOn(x)?'On':'Off'),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{setTab('rules');setCq(x.label);}},'Open'))))));};

  // ── Approvals (existing approvals + control changes waiting for a second Super Admin) ──
  const pend=loadApprovals().filter(a=>a.status==='pending');const recent=loadApprovals().filter(a=>a.status!=='pending').slice(-15).reverse();
  const cpend=ctlJ(CTL_PENDING_KEY,[])||[];
  const sname=sid=>{const s=(salons||[]).find(x=>String(x.id)===String(sid));return s?String(s.name).split('—')[0].trim():'All outlets';};
  const decide=(a,st)=>{let note='';if(st==='rejected'){note=window.prompt('Reason for rejecting (shown to the person who asked):','');if(note==null)return;}
    else if(!window.confirm('Approve?\n\n'+a.summary))return;
    if(decideApproval(a.id,st,note)){toast(st==='approved'?'Approved — they can now go ahead':'Rejected','success');tick(x=>x+1);}};
  const decideCtl=async(p,ok)=>{if(ok&&!window.confirm('Approve this change?\n\n'+p.label+': '+p.summary+'\n(asked by '+p.by+')'))return;if(!ok&&!window.confirm('Reject this change?'))return;
    const r=await ctlDecidePending(p.id,ok);if(r){toast(r,'error');return;}toast(ok?'Approved — the change is made':'Rejected','success');refresh();};
  const apprView=()=>h('div',null,
    cpend.length>0&&h('div',{style:{marginBottom:12}},h('div',{style:{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',margin:'4px 0'}},'Control changes waiting for a second Super Admin'),
      cpend.map(p=>h('div',{key:p.id,style:{display:'flex',gap:10,alignItems:'center',borderBottom:'1px solid var(--border)',padding:'8px 0'}},
        h('div',{style:{flex:1,fontSize:12.5}},h('b',null,p.label),' — ',p.summary,h('div',{style:{fontSize:11,color:'var(--text3)'}},'asked by '+p.by+' · '+ctlWhen(p.at))),
        canEdit&&h('button',{className:'btn btn-primary btn-sm',onClick:()=>decideCtl(p,true)},'Approve'),canEdit&&h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>decideCtl(p,false)},'Reject')))),
    !pend.length&&!cpend.length&&h('div',{style:{fontSize:12.5,color:'var(--text3)',padding:'6px 0'}},'Nothing waiting for approval.'),
    pend.map(a=>h('div',{key:a.id,style:{display:'flex',gap:10,alignItems:'center',borderBottom:'1px solid var(--border)',padding:'8px 0'}},
      h('div',{style:{flex:1,fontSize:12.5}},h('b',null,(controlDef(a.control)||{}).label||a.control),h('div',{style:{whiteSpace:'pre-wrap'}},a.summary),
        h('div',{style:{fontSize:11,color:'var(--text3)'}},sname(a.sid)+' · asked by '+a.by+' · '+new Date(a.at).toLocaleString('en-GB',DMY_DT))),
      canEdit&&h('button',{className:'btn btn-primary btn-sm',onClick:()=>decide(a,'approved')},'Approve'),
      canEdit&&h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>decide(a,'rejected')},'Reject'))),
    recent.length>0&&h('div',{style:{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',margin:'14px 0 4px'}},'Decided recently'),
    recent.map(a=>h('div',{key:a.id,style:{fontSize:12,color:'var(--text2)',padding:'3px 0'}},
      h('span',{style:{fontWeight:600,color:a.status==='rejected'?'var(--red)':'var(--green)'}},a.status==='rejected'?'Rejected':a.status==='used'?'Approved · used':'Approved'),' — ',a.summary.split('\n')[0],' · ',sname(a.sid),' · by ',a.decidedBy||'—')));

  const TABS=[['rules','Rules'],...(F('ctlCompare')||F('ctlHealth')?[['checkup','Check-up']]:[]),...(F('ctlSets')||F('ctlCopyOutlet')||F('ctlExport')?[['sets','Sets & export']]:[]),
    ...(F('ctlHistory')?[['hist','History']]:[]),...(F('ctlWhatsNew')?[['new','What’s new']]:[]),['appr','Approvals'+((pend.length+cpend.length)?' ('+(pend.length+cpend.length)+')':'')]];
  const t=TABS.some(x=>x[0]===tab)?tab:'rules';
  return h('div',{className:'card',style:{marginBottom:16}},
    h('div',{className:'card-title'},'🎛 Controls'),
    h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:10,lineHeight:1.6}},'Switch each check or approval rule on or off for all outlets, then open “Outlet-wise” to set a different choice for any outlet. '+(canEdit?'':'Only a Super Admin can change these.')),
    h('div',{className:'tab-bar',style:{marginBottom:10}},TABS.map(([k,l])=>h('button',{key:k,className:'tab-btn '+(t===k?'active':''),onClick:()=>setTab(k)},l))),
    t==='rules'&&rulesView(),t==='checkup'&&checkupView(),t==='sets'&&setsView(),t==='hist'&&historyView(),t==='new'&&newView(),t==='appr'&&apprView());
}
