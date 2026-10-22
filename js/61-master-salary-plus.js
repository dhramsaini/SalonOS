// ═════════════════════════════════════════════════════════════════════════════════════════════
// Master Salary — more tools (Controls → Salary & staff → Master Salary; each item switchable,
// for all outlets or outlet-wise):
//   msWage50 / msCodeWages  50% wages rule (Code on Social Security): flag, and optionally use the
//                           Code wage as the PF wage · msEpsFlag "Not in EPS" + age 58 · msEsicPeriod
//                           ESIC continues to the end of the contribution period · msMinWage minimum
//                           wage check · msDob date of birth / age · msTemplates salary structure
//                           template · msReverseCalc CTC / take-home → parts · msTakeHome net preview
//                           · msBulkEdit · msDocs document checklist · msProbation probation,
//                           confirmation, notice · msLetters appointment / CTC / salary certificate ·
//                           msSelfUpdate staff send their own details from the phone · msAnnualCtc ·
//                           msGratuityBonus · msDeptCost staff cost by department · msTransfer.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const MS_MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
function msOn(id,sid){return typeof controlOn==='function'&&controlOn(id,sid);}
function msLim(id,d,sid){const v=typeof controlLimit==='function'?Number(controlLimit(id,sid)):0;return v>0?v:d;}
function msM(n){return '₹'+Math.round(Number(n)||0).toLocaleString('en-IN');}
function msDmy(iso){return iso?String(iso).slice(0,10).split('-').reverse().join('/'):'—';}
function msParts(e){return['basic','hra','conv','special'].reduce((t,k)=>t+(Number(e&&e[k])||0),0);}
function msToday(){return typeof localIsoOf==='function'?localIsoOf(new Date()):new Date().toISOString().slice(0,10);}
function msSalon(sid){return typeof getSalonRecordById==='function'?(getSalonRecordById(sid)||{}):{};}

// ── 1 · 50% wages rule ──
// Code wage = Basic + Special allowance + the part of HRA + Conveyance above half of total pay.
function pfCodeWageOf(e){const b=Number(e&&e.basic)||0,sp=Number(e&&e.special)||0,ex=(Number(e&&e.hra)||0)+(Number(e&&e.conv)||0);const tot=b+sp+ex;return Math.round(b+sp+Math.max(0,ex-tot/2));}
// The PF wage Master Salary and Salary Working use: Basic, or the Code wage when msCodeWages is on.
function msPfWage(e,sid){return(sid!=null&&msOn('msCodeWages',sid))?pfCodeWageOf(e):(Number(e&&e.basic)||0);}
function msWage50List(sid,E){if(!msOn('msWage50',sid)||!msSalon(sid).pfApplicable)return[];
  return(E||[]).filter(e=>e.status!=='Inactive'&&e.pf&&msParts(e)>0).map(e=>{const cw=pfCodeWageOf(e),b=Number(e.basic)||0;const cap=w=>Math.min(w,25000);const diff=Math.round((cap(cw)-cap(b))*0.12);return{e,cw,b,diff};}).filter(x=>x.cw>x.b&&x.diff>0);}

// ── 2 · EPS: not a member, age 58 ──
function msAge(dob,atIso){if(!dob)return null;const d=new Date(String(dob).slice(0,10)+'T00:00:00'),t=new Date((atIso||msToday())+'T00:00:00');if(isNaN(d))return null;let a=t.getFullYear()-d.getFullYear();if(t.getMonth()<d.getMonth()||(t.getMonth()===d.getMonth()&&t.getDate()<d.getDate()))a--;return a;}
// EPS wage for the month (called by statutoryDeductionsFor with the usual capped wage).
function msEpsWage(e,y,m,sid,capped){
  if(sid==null)return capped;
  if(msOn('msDob',sid)&&e.dob){const a=msAge(e.dob,y+'-'+String(m+1).padStart(2,'0')+'-01');if(a!=null&&a>=58)return 0;}
  if(!msOn('msEpsFlag',sid)||!e.epsExcluded)return capped;
  const ym=y*12+m,b=Number(e.basic)||0,ch=2026*12+8;
  if(ym<ch||b>25000)return 0;                                        // outside EPS before 17 Sep 2026, or still above the ceiling
  if(ym===ch)return Math.round(Math.min(b,25000)*14/30);              // joins EPS from 17 Sep 2026 (EPFO FAQ: nil for 1–16 Sep)
  return capped;
}

// ── 4 · ESIC contribution period (Apr–Sep, Oct–Mar) ──
const MS_ESIC_MEMO={};
function msEsicCovered(e,y,m,sid){
  const g=Number(e&&e.gross)||0;if(g<=21000)return true;if(sid==null||!msOn('msEsicPeriod',sid))return false;
  const m0=m>=3&&m<=8?3:9,y0=m>=3?y:y-1;if(y0===y&&m0===m)return false;    // first month of the period decides
  const k=sid+'|'+y0+'|'+m0;let M=MS_ESIC_MEMO[k];if(!M||Date.now()-M.t>3000){const map={};try{(getEmployeesForMonth(y0,m0,sid)||[]).forEach(x=>{map[x.id]=typeof payGrossFor==='function'?payGrossFor(x,sid):Number(x.gross)||0;});}catch(x){}M=MS_ESIC_MEMO[k]={t:Date.now(),map};}
  const s=M.map[e.id];return s!=null&&s>0&&s<=21000;
}
function msEsicEndLabel(y,m){return m>=3&&m<=8?'30/09/'+y:'31/03/'+(m>=3?y+1:y);}

// ── 6/7/8 · salary structure template, reverse calculator, take-home ──
function msTplKey(sid){return outletKey('salonos_salary_template',sid);}
function msTpl(sid){try{const v=JSON.parse(cachedLocalGet(msTplKey(sid))||'null');if(v&&typeof v==='object')return{basicPct:50,hraPct:20,conv:1600,...v};}catch(e){}return{basicPct:50,hraPct:20,conv:1600};}
function msSplit(S,t){S=Math.max(0,Math.round(Number(S)||0));const basic=Math.round(S*(Number(t.basicPct)||0)/100),hra=Math.round(S*(Number(t.hraPct)||0)/100);const conv=Math.max(0,Math.min(Number(t.conv)||0,S-basic-hra));return{basic,hra,conv,special:Math.max(0,S-basic-hra-conv)};}
function msShares(sid,f,S){const rec=msSalon(sid);const parts={...f,...(f.__split||{})};
  const wage=msPfWage(parts,sid);const pf=(typeof epfEmployerContributionFor==='function')?epfEmployerContributionFor(wage,f.pfOnActualBasic,rec.pfApplicable,f.pf):0;
  const esicEr=(typeof esicEmployerContributionFor==='function')?esicEmployerContributionFor(S,rec.esicApplicable,f.esic,sid):0;
  const esicEmp=(rec.esicApplicable&&f.esic&&S<=21000)?Math.round(S*0.0075):0;
  let pt=0;try{if(rec.ptApplicable&&typeof ptAmountFor==='function')pt=ptAmountFor(sid,rec.state,S,new Date().getMonth())||0;}catch(x){}
  return{pf,esicEr,esicEmp,pt,ctc:S+pf+esicEr,net:S-pf-esicEmp-pt};}
function msSolve(sid,f,target,mode){const t=msTpl(sid);let S=Number(target)||0;
  for(let i=0;i<30;i++){const sp=msSplit(S,t);const sh=msShares(sid,{...f,...sp,__split:sp},S);const next=mode==='ctc'?Math.round(target-sh.pf-sh.esicEr):mode==='net'?Math.round(target+sh.pf+sh.esicEmp+sh.pt):S;if(Math.abs(next-S)<1){S=next;break;}S=next;}
  return msSplit(S,t);}
function SalaryBuilder({salon,form,setForm}){
  const h=React.createElement;const sid=salon&&salon.id;const [amt,setAmt]=useState('');const [mode,setMode]=useState('salary');const [edit,setEdit]=useState(false);const [,t]=useState(0);
  if(sid==null)return null;const tOn=msOn('msTemplates',sid),rOn=msOn('msReverseCalc',sid),nOn=msOn('msTakeHome',sid);if(!tOn&&!rOn&&!nOn)return null;
  const S=msParts(form);const sh=msShares(sid,form,S);const tpl=msTpl(sid);
  const apply=()=>{const v=Number(amt);if(!(v>0))return;const p=msSolve(sid,form,v,rOn?mode:'salary');setForm(f=>({...f,basic:p.basic,hra:p.hra,conv:p.conv,special:p.special}));};
  const saveTpl=k=>ev=>{const v={...tpl,[k]:Number(ev.target.value)||0};safeLocalSet(msTplKey(sid),JSON.stringify(v));t(x=>x+1);};
  return h('div',{style:{background:'var(--bg2)',border:'1px dashed var(--border)',borderRadius:'var(--r)',padding:'8px 10px',marginBottom:10,fontSize:12}},
    (tOn||rOn)&&h('div',{style:{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}},
      h('b',null,'Fill the parts from'),
      rOn?h('select',{className:'form-control',style:{width:'auto',fontSize:12,padding:'3px 6px'},value:mode,onChange:e=>setMode(e.target.value)},h('option',{value:'salary'},'Monthly salary'),h('option',{value:'ctc'},'Gross CTC'),h('option',{value:'net'},'Take-home pay')):h('span',null,'monthly salary'),
      h('input',{type:'number',className:'form-control',style:{width:110,fontSize:12,padding:'3px 6px'},placeholder:'₹ amount',value:amt,onChange:e=>setAmt(e.target.value),onKeyDown:e=>{if(e.key==='Enter'){e.preventDefault();apply();}}}),
      h('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:apply},'Fill'),
      h('span',{style:{color:'var(--text3)'}},'Basic '+tpl.basicPct+'% · HRA '+tpl.hraPct+'% · Conveyance '+msM(tpl.conv)+' · rest Special'),
      tOn&&h('button',{type:'button',className:'btn btn-ghost btn-sm',style:{padding:'1px 8px'},onClick:()=>setEdit(!edit)},edit?'Done':'Change template')),
    edit&&h('div',{style:{display:'flex',gap:8,marginTop:6,flexWrap:'wrap',alignItems:'center'}},
      ['basicPct','hraPct','conv'].map(k=>h('label',{key:k,style:{display:'inline-flex',gap:4,alignItems:'center'}},({basicPct:'Basic %',hraPct:'HRA %',conv:'Conveyance ₹'})[k],h('input',{type:'number',className:'form-control',style:{width:80,fontSize:12,padding:'3px 6px'},defaultValue:tpl[k],onBlur:saveTpl(k)}))),
      h('span',{style:{color:'var(--text3)'}},'Outlet-wide template.')),
    nOn&&S>0&&h('div',{style:{marginTop:6,color:'var(--text2)'}},'Take-home ≈ ',h('b',{style:{color:'var(--green)'}},msM(sh.net)),' = salary '+msM(S)+(sh.pf?' − PF '+msM(sh.pf):'')+(sh.esicEmp?' − ESIC '+msM(sh.esicEmp):'')+(sh.pt?' − PT '+msM(sh.pt):'')+' (before advances, penalties and days off) · Gross CTC '+msM(sh.ctc)));
}

// ── 5/11 · extra fields in the form ──
function MsFormExtras({salon,form,setForm,part}){
  const h=React.createElement;const sid=salon&&salon.id;if(sid==null)return null;const set=k=>ev=>{const v=ev.target.type==='checkbox'?ev.target.checked:ev.target.value;setForm(f=>({...f,[k]:v}));};
  if(part==='personal'){if(!msOn('msDob',sid))return null;const a=msAge(form.dob);
    return h('div',{className:'form-row cols3'},h('div',{className:'form-group'},h('label',{htmlFor:'ms-dob'},'Date of Birth'),h('input',{id:'ms-dob',type:'date',className:'form-control',value:form.dob||'',onChange:set('dob')}),
      a!=null&&h('div',{style:{fontSize:10.5,color:a<18?'var(--red)':'var(--text3)',marginTop:3}},'Age '+a+(a<18?' — under 18, cannot be employed':' · retires at 60 on '+msDmy((Number(String(form.dob).slice(0,4))+60)+String(form.dob).slice(4,10)))+(a>=58?' · EPS stops at 58':''))));}
  const pOn=msOn('msProbation',sid),eOn=msOn('msEpsFlag',sid)&&msSalon(sid).pfApplicable&&form.pf;if(!pOn&&!eOn)return null;
  const prob=form.probationMonths===''||form.probationMonths==null?msLim('msProbation',6,sid):Number(form.probationMonths);const due=form.doj?(()=>{const d=new Date(String(form.doj).slice(0,10)+'T00:00:00');d.setMonth(d.getMonth()+prob);return typeof localIsoOf==='function'?localIsoOf(d):d.toISOString().slice(0,10);})():'';
  return h('div',null,
    pOn&&h('div',{className:'form-row cols3'},
      h('div',{className:'form-group'},h('label',{htmlFor:'ms-prob'},'Probation (months)'),h('input',{id:'ms-prob',type:'number',min:0,className:'form-control',value:form.probationMonths==null?'':form.probationMonths,placeholder:String(msLim('msProbation',6,sid)),onChange:set('probationMonths')}),due&&h('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:3}},'Confirmation due '+msDmy(due))),
      h('div',{className:'form-group'},h('label',{htmlFor:'ms-conf'},'Confirmed on'),h('input',{id:'ms-conf',type:'date',className:'form-control',value:form.confirmDate||'',onChange:set('confirmDate')})),
      h('div',{className:'form-group'},h('label',{htmlFor:'ms-notice'},'Notice period (days)'),h('input',{id:'ms-notice',type:'number',min:0,className:'form-control',value:form.noticeDays==null?'':form.noticeDays,placeholder:'30',onChange:set('noticeDays')}))),
    eOn&&h('label',{style:{display:'flex',gap:6,alignItems:'center',fontSize:12,color:'var(--text2)',marginBottom:10,cursor:'pointer'}},h('input',{type:'checkbox',checked:!!form.epsExcluded,onChange:set('epsExcluded')}),
      'Not a member of EPS (joined after Sep 2014 above the old ₹15,000 ceiling) — the employer’s 12% goes wholly to EPF; joins EPS from 17 Sep 2026 if Basic is up to ₹25,000'));
}
// Save-time checks (Master Salary).
function msSaveOk(sid,emp){
  if(msOn('msDob',sid)&&emp.dob){const a=msAge(emp.dob,emp.doj||undefined);if(a!=null&&a<18){window.alert(emp.name+' would be '+a+' on the date of joining — someone under 18 can’t be employed. Check the Date of Birth.');if(typeof controlHit==='function')controlHit('msDob',sid,'b');return false;}}
  if(emp.ptExempt&&msOn('ptExemption',sid)){const st=msSalon(sid).state;const R=typeof ptExemptRulesFor==='function'?ptExemptRulesFor(st):null;
    if(R&&/senior/i.test(emp.ptExemptReason||'')){const a=msAge(emp.dob);if(a==null){if(!window.confirm(emp.name+' is marked exempt from Professional Tax as a senior citizen, but has no Date of Birth. Save anyway?'))return false;}
      else if(a<R.seniorAge){window.alert(emp.name+' is '+a+' — '+(st||'this state')+' exempts senior citizens from Professional Tax only from age '+R.seniorAge+'. Choose another reason or keep PT on.');return false;}}}
  const mw=msOn('msMinWage',sid)?Number(controlLimit('msMinWage',sid))||0:0;const pay=msParts(emp);
  if(mw>0&&pay>0&&pay<mw&&!window.confirm(emp.name+'’s salary '+msM(pay)+' is below the minimum wage set for this outlet ('+msM(mw)+' a month). Save anyway?'))return false;
  return true;
}

// ── 13 · staff update their own details from the phone ──
function msReqKey(sid){return outletKey('salonos_emp_update_requests',sid);}
function msReqs(sid){try{return JSON.parse(cachedLocalGet(msReqKey(sid))||'[]')||[];}catch(e){return[];}}
function msReqSave(sid,L){safeLocalSet(msReqKey(sid),JSON.stringify(L.slice(-500)));}
const MS_SELF_FIELDS=[['mobile','Mobile'],['email','Email'],['address','Address'],['bankName','Bank name'],['accountNo','Account number'],['ifsc','IFSC']];
function MsSelfUpdate({sid,emp}){
  const h=React.createElement;const [open,setOpen]=useState(false);const [pin,setPin]=useState('');const [ok,setOk]=useState(false);const [vals,setVals]=useState({});const [sent,setSent]=useState('');
  if(sid==null||!emp||!msOn('msSelfUpdate',sid))return null;
  const mob=String(emp.mobile||emp.phone||'').replace(/\D/g,'');
  const check=()=>{if(mob.length>=4&&pin!==mob.slice(-4)){setSent('Wrong PIN — it is the last 4 digits of your mobile number.');return;}setOk(true);setSent('');};
  const send=()=>{const ch={};MS_SELF_FIELDS.forEach(([k])=>{const v=String(vals[k]==null?'':vals[k]).trim();if(v&&v!==String(emp[k]||''))ch[k]={from:emp[k]||'',to:v};});
    if(!Object.keys(ch).length){setSent('Nothing changed.');return;}const L=msReqs(sid);L.push({id:'U'+Date.now(),empId:emp.id,name:emp.name,at:new Date().toISOString(),changes:ch,status:'pending'});msReqSave(sid,L);setSent('Sent — the manager will check and approve it.');setOk(false);setPin('');setVals({});};
  return h('div',{style:{marginTop:10}},
    h('button',{className:'btn '+(open?'btn-primary':'btn-ghost'),style:{width:'100%',justifyContent:'center'},onClick:()=>{setOpen(!open);setSent('');}},'🪪 Update my details'),
    open&&!ok&&h('div',{style:{marginTop:8,display:'flex',gap:8}},h('input',{type:'password',inputMode:'numeric',maxLength:4,className:'form-control',placeholder:'PIN — last 4 digits of your mobile',value:pin,onChange:e=>setPin(e.target.value.replace(/\D/g,''))}),h('button',{className:'btn btn-primary',onClick:check},'Next')),
    open&&ok&&h('div',{style:{marginTop:8,display:'grid',gap:6}},MS_SELF_FIELDS.map(([k,l])=>h('label',{key:k,style:{fontSize:12,color:'var(--text3)'}},l+(emp[k]?' (now: '+(k==='accountNo'?'••••'+String(emp[k]).slice(-4):emp[k])+')':''),
      h('input',{className:'form-control',value:vals[k]||'',onChange:e=>setVals({...vals,[k]:e.target.value}),placeholder:'Leave blank to keep'}))),h('button',{className:'btn btn-primary',onClick:send},'Send for approval')),
    sent&&h('div',{style:{fontSize:12,marginTop:6,color:'var(--text2)'}},sent));
}

// ── 10 · documents ──
function msDocItems(e,rec,sid){const has=v=>v!=null&&v!==''&&v!==false;const L=[['Aadhaar no',has(e.aadhar)],['Aadhaar copy',has(e.aadharFile)],['PAN no',has(e.pan)],['PAN copy',has(e.panFile)],['Bank account',has(e.accountNo)&&has(e.ifsc)],['Bank proof',has(e.bankProofFile)],['Mobile',has(e.mobile)]];
  L.push(['Photo',has(e.photo)]);if(msOn('msDob',sid))L.push(['Date of birth',has(e.dob)]);if(rec.pfApplicable&&e.pf)L.push(['UAN',has(e.pfNumber)]);if(rec.esicApplicable&&e.esic)L.push(['ESIC no',has(e.esicNumber)]);return L;}

// ── 17 · transfer to another outlet ──
function msTransfer(sid,emp,toSid,dateIso,employees,setEmployees){
  const to=(typeof SALONS!=='undefined'?SALONS:[]).find(s=>String(s.id)===String(toSid));if(!to)return false;
  const T=loadEmployees(toSid)||[];const nid=nextPrefixedId(T,'E',3);const d=new Date(dateIso+'T00:00:00');d.setDate(d.getDate()-1);const lastDay=typeof localIsoOf==='function'?localIsoOf(d):d.toISOString().slice(0,10);
  const from=(typeof SALONS!=='undefined'?SALONS:[]).find(s=>String(s.id)===String(sid))||{};
  T.push({...emp,id:nid,status:'Active',dol:'',transferredFrom:{sid,id:emp.id,outlet:from.name||'',date:dateIso},transferredOn:dateIso});saveEmployees(T,toSid);
  // Active advances move with the outstanding balance; the old outlet's copy is closed as transferred.
  let moved=0;try{const kF=outletKey('salonos_advances',sid),kT=outletKey('salonos_advances',toSid);const AF=JSON.parse(cachedLocalGet(kF)||'[]')||[];const AT=JSON.parse(cachedLocalGet(kT)||'[]')||[];let n=Math.max(0,...AT.map(a=>Number(String(a.id||'').replace(/\D/g,''))||0));
    const AF2=AF.map(a=>{const x=typeof advFixed==='function'?advFixed(a):a;const bal=typeof advTrueOutstanding==='function'?advTrueOutstanding(x):(Number(x.outstanding)||0);if(x.emp!==emp.name||x.status!=='Active'||!(bal>0))return a;n++;moved++;
      AT.push({...x,id:'A'+String(n).padStart(3,'0'),amount:bal,fee:0,settled:{},outstanding:bal,schedule:[],date:dateIso,reason:(x.reason||'Advance')+' — transferred from '+(from.name||'')+' ('+x.id+')',source:'transfer'});
      return{...a,status:'Transferred',transferredTo:to.name||toSid};});
    if(moved){safeLocalSet(kF,JSON.stringify(AF2));safeLocalSet(kT,JSON.stringify(AT));}}catch(x){}
  setEmployees(employees.map(e=>e.id===emp.id?{...e,status:'Inactive',dol:lastDay,transferredTo:{sid:toSid,id:nid,outlet:to.name||'',date:dateIso}}:e));
  try{logAuditEvent(sid,{entity:'Employee',entityId:emp.id,action:'Transferred',summary:emp.name+' transferred to '+(to.name||toSid)+' from '+msDmy(dateIso)+(moved?' with '+moved+' advance(s)':'')});logAuditEvent(toSid,{entity:'Employee',entityId:nid,action:'Joined by transfer',summary:emp.name+' from '+(from.name||sid)+' on '+msDmy(dateIso)});}catch(x){}
  return nid;
}

// ── 12 · letters ──
function msLetterHtml(kind,salon,e){
  const esc=t=>String(t==null?'':t).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));const rec=msSalon(salon.id);const S=msParts(e);
  const pf=typeof epfEmployerContributionFor==='function'?epfEmployerContributionFor(msPfWage(e,salon.id),e.pfOnActualBasic,rec.pfApplicable,e.pf):0;const es=typeof esicEmployerContributionFor==='function'?esicEmployerContributionFor(S,rec.esicApplicable,e.esic,salon.id):0;
  const rows=[['Basic',e.basic],['HRA',e.hra],['Conveyance',e.conv],['Special allowance',e.special],['Monthly salary',S],pf?['Employer PF',pf]:null,es?['Employer ESIC',es]:null,['Gross CTC (monthly)',S+pf+es],['Gross CTC (annual)',(S+pf+es)*12]].filter(Boolean);
  const tbl='<table>'+rows.map(r=>'<tr><td>'+esc(r[0])+'</td><td class="n">'+esc(msM(r[1]))+'</td></tr>').join('')+'</table>';const outlet=esc(String(salon.name||'').split('—')[0].trim());const today=msDmy(msToday());
  const prob=e.probationMonths==null||e.probationMonths===''?msLim('msProbation',6,salon.id):Number(e.probationMonths);
  if(kind==='appointment')return'<h2>Appointment letter</h2><p>Date: '+today+'</p><p>Dear '+esc(e.name)+',</p><p>We are pleased to appoint you as <b>'+esc(e.desig)+'</b> ('+esc(e.dept||'')+') at '+outlet+' from <b>'+msDmy(e.doj)+'</b>. Your weekly off is '+esc(e.weeklyOff||'Sunday')+'. You will be on probation for '+prob+' month(s); the notice period is '+(Number(e.noticeDays)||30)+' days.</p><p>Your monthly pay:</p>'+tbl+'<p>Statutory deductions (PF, ESIC, Professional Tax) apply as per law.</p><p style="margin-top:50px">For '+outlet+'<br><br>Authorised signatory</p><p style="margin-top:30px">Accepted: ____________________ ('+esc(e.name)+')</p>';
  if(kind==='ctc')return'<h2>CTC break-up</h2><p>Date: '+today+'</p><p>'+esc(e.name)+' · '+esc(e.desig)+' · '+outlet+'</p>'+tbl+'<p style="margin-top:50px">Authorised signatory</p>';
  return'<h2>Salary certificate</h2><p>Date: '+today+'</p><p>This is to certify that <b>'+esc(e.name)+'</b>'+(e.fatherName?', son/daughter of '+esc(e.fatherName)+',':'')+' has been working with '+outlet+' as '+esc(e.desig)+' since '+msDmy(e.doj)+'. The current monthly salary is '+msM(S)+' (Gross CTC '+msM(S+pf+es)+'), as below:</p>'+tbl+'<p>This certificate is issued on the employee’s request.</p><p style="margin-top:50px">For '+outlet+'<br><br>Authorised signatory</p>';
}
function msPrint(title,body){const w=window.open('','_blank');if(!w){window.alert('Allow pop-ups to print.');return;}
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+title+'</title><style>body{font:14px Georgia,serif;margin:50px;max-width:680px}table{border-collapse:collapse;width:70%}td{border-bottom:1px solid #ccc;padding:5px}td.n{text-align:right}h2{font-family:Arial}</style></head><body>'+body+'<script>setTimeout(()=>window.print(),300)<\/script></body></html>');w.document.close();}
function MsEmpActions({salon,emp,employees,setEmployees,onClose}){
  const h=React.createElement;const sid=salon&&salon.id;const [to,setTo]=useState('');const [dt,setDt]=useState(msToday());if(sid==null||!emp)return null;
  const lOn=msOn('msLetters',sid),tOn=msOn('msTransfer',sid);if(!lOn&&!tOn)return null;
  const others=(typeof salonsForCurrentUser==='function'?salonsForCurrentUser(SALONS):(typeof SALONS!=='undefined'?SALONS:[])).filter(s=>s&&String(s.id)!==String(sid));
  const wa=kind=>{const ph=typeof waNumber==='function'?waNumber(emp.mobile||''):'';const txt=msLetterHtml(kind,salon,emp).replace(/<tr><td>/g,'\n').replace(/<\/td><td class="n">/g,': ').replace(/<br>/g,'\n').replace(/<\/p>/g,'\n').replace(/<[^>]+>/g,'').replace(/\n{3,}/g,'\n\n');window.open('https://wa.me/'+(ph||'')+'?text='+encodeURIComponent(txt),'_blank','noopener');};
  const doT=()=>{if(!to){window.alert('Choose the outlet.');return;}const tn=(others.find(s=>String(s.id)===String(to))||{}).name||'';if(!window.confirm('Transfer '+emp.name+' to '+tn+' from '+msDmy(dt)+'?\n\nThey become a new employee there (pay, history and active advances move with them) and are marked Inactive here with last day '+msDmy(dt)+' − 1.'))return;
    const nid=msTransfer(sid,emp,to,dt,employees,setEmployees);if(nid){window.alert(emp.name+' is now '+nid+' at '+tn+'.');onClose&&onClose();}};
  return h('div',{style:{marginTop:12,background:'var(--bg3)',borderRadius:'var(--r)',padding:12,display:'flex',flexDirection:'column',gap:8}},
    lOn&&h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}},h('b',{style:{fontSize:12}},'Letters:'),
      [['appointment','Appointment letter'],['ctc','CTC break-up'],['salary','Salary certificate']].map(([k,l])=>h(React.Fragment,{key:k},h('button',{className:'btn btn-ghost btn-sm',onClick:()=>msPrint(l+' — '+emp.name,msLetterHtml(k,salon,emp))},'🖨 '+l),h('button',{className:'btn btn-ghost btn-sm',title:'Send on WhatsApp',onClick:()=>wa(k)},'📲')))),
    tOn&&others.length>0&&emp.status!=='Inactive'&&h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}},h('b',{style:{fontSize:12}},'Transfer to:'),
      h('select',{className:'form-control',style:{width:'auto',fontSize:12},value:to,onChange:e=>setTo(e.target.value)},h('option',{value:''},'— outlet —'),others.map(s=>h('option',{key:s.id,value:s.id},s.name))),
      h('span',{style:{fontSize:12}},'from'),h('input',{type:'date',className:'form-control',style:{width:'auto',fontSize:12},value:dt,onChange:e=>setDt(e.target.value)}),
      h('button',{className:'btn btn-ghost btn-sm',onClick:doT},'↪ Transfer')),
    emp.transferredFrom&&h('div',{style:{fontSize:11.5,color:'var(--text3)'}},'Joined by transfer from '+(emp.transferredFrom.outlet||'')+' on '+msDmy(emp.transferredFrom.date)),
    emp.transferredTo&&h('div',{style:{fontSize:11.5,color:'var(--text3)'}},'Transferred to '+(emp.transferredTo.outlet||'')+' as '+emp.transferredTo.id+' from '+msDmy(emp.transferredTo.date)));
}

// ── the tools strip and bar on Master Salary ──
function MsTools({salon,employees,setEmployees}){
  const h=React.createElement;const sid=salon&&salon.id;const [tab,setTab]=useState('');const [,t]=useState(0);if(sid==null)return null;const rec=msSalon(sid);
  const act=(employees||[]).filter(e=>e.status!=='Inactive');const now=new Date();const y=now.getFullYear(),m=now.getMonth();const today=msToday();
  const notes=[];
  const w50=msWage50List(sid,act);if(w50.length)notes.push(['⚖',h('span',null,h('b',null,'50% wages rule: '),w50.length+' employee(s) have allowances above half their pay, so PF should be on a higher wage — '+w50.slice(0,5).map(x=>x.e.name+' (PF wage '+msM(Math.min(x.b,25000))+' → '+msM(Math.min(x.cw,25000))+', +'+msM(x.diff)+' PF each side)').join(', ')+(msOn('msCodeWages',sid)?' — already used for PF.':'. Turn on “Use the Code wage for PF” in Controls to apply it.'))]);
  if(msOn('msEsicPeriod',sid)&&rec.esicApplicable){const L=act.filter(e=>e.esic&&msParts(e)>21000&&msEsicCovered({...e,gross:msParts(e)},y,m,sid));if(L.length)notes.push(['🩺',h('span',null,h('b',null,'ESIC continues: '),L.map(e=>e.name).join(', ')+' — salary is above ₹21,000 but ESIC continues to '+msEsicEndLabel(y,m)+' (end of the contribution period), then stops.')]);}
  const mw=msOn('msMinWage',sid)?Number(controlLimit('msMinWage',sid))||0:0;if(mw>0){const L=act.filter(e=>msParts(e)>0&&msParts(e)<mw);if(L.length)notes.push(['⚠',h('span',null,h('b',null,'Below minimum wage ('+msM(mw)+'): '),L.map(e=>e.name+' '+msM(msParts(e))).join(', '))]);}
  if(msOn('msProbation',sid)){const due=act.filter(e=>!e.confirmDate&&e.doj).map(e=>{const p=e.probationMonths==null||e.probationMonths===''?msLim('msProbation',6,sid):Number(e.probationMonths);const d=new Date(String(e.doj).slice(0,10)+'T00:00:00');d.setMonth(d.getMonth()+p);const iso=typeof localIsoOf==='function'?localIsoOf(d):d.toISOString().slice(0,10);return{e,iso};}).filter(x=>{const dd=(new Date(x.iso)-new Date(today))/864e5;return dd<=15&&dd>=-30;});
    if(due.length)notes.push(['📌',h('span',null,h('b',null,'Confirmation due: '),due.map(x=>x.e.name+' ('+msDmy(x.iso)+')').join(', ')+' — fill “Confirmed on” in Employment & Salary.')]);
    const leaving=(employees||[]).filter(e=>e.dol&&e.dol>=today&&(new Date(e.dol)-new Date(today))/864e5<=10);if(leaving.length)notes.push(['🚪',h('span',null,h('b',null,'Last working day soon: '),leaving.map(e=>e.name+' ('+msDmy(e.dol)+')').join(', '))]);}
  const reqs=msOn('msSelfUpdate',sid)?msReqs(sid).filter(r=>r.status==='pending'):[];
  const TABS=[['docs','📄 Documents','msDocs'],['annual','💰 Annual CTC & benefits','msAnnualCtc|msGratuityBonus'],['dept','🏢 Staff cost by department','msDeptCost'],['bulk','✏ Bulk edit','msBulkEdit'],['req','🪪 Update requests'+(reqs.length?' ('+reqs.length+')':''),'msSelfUpdate']].filter(x=>x[2].split('|').some(k=>msOn(k,sid)));
  if(!notes.length&&!TABS.length)return null;
  return h('div',{style:{marginBottom:12}},
    notes.map((n,i)=>h('div',{key:i,style:{background:'rgba(224,165,48,0.10)',border:'1px solid rgba(224,165,48,0.35)',borderRadius:'var(--r)',padding:'7px 12px',marginBottom:6,fontSize:12.5}},n[0]+' ',n[1])),
    TABS.length>0&&h('div',{className:'card',style:{padding:'10px 12px'}},
      h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}},h('b',{style:{marginRight:6}},'🧰 Master Salary tools'),TABS.map(([k,l])=>h('button',{key:k,className:'btn btn-sm '+(tab===k?'btn-primary':'btn-ghost'),onClick:()=>setTab(tab===k?'':k)},l))),
      tab==='docs'&&h(MsDocs,{salon,act}),
      tab==='annual'&&h(MsAnnual,{salon,act}),
      tab==='dept'&&h(MsDept,{salon,act}),
      tab==='bulk'&&h(MsBulk,{salon,employees,setEmployees,onDone:()=>setTab('')}),
      tab==='req'&&h(MsReqList,{salon,employees,setEmployees,bump:()=>t(x=>x+1)})));
}
const msTbl=(h,head,rows,foot)=>h('div',{className:'table-wrap',style:{marginTop:8}},h('table',null,h('thead',null,h('tr',null,head.map((x,i)=>h('th',{key:i,style:i?{textAlign:'right'}:null},x)))),h('tbody',null,rows.map((r,i)=>h('tr',{key:i},r.map((c,j)=>h('td',{key:j,style:j?{textAlign:'right'}:null},c)))),foot&&h('tr',null,foot.map((c,j)=>h('td',{key:j,style:{fontWeight:700,textAlign:j?'right':'left'}},c))))));
function MsDocs({salon,act}){
  const h=React.createElement;const rec=msSalon(salon.id);const R=act.map(e=>{const L=msDocItems(e,rec,salon.id);const ok=L.filter(x=>x[1]).length;return{e,pct:Math.round(ok/L.length*100),miss:L.filter(x=>!x[1]).map(x=>x[0])};}).sort((a,b)=>a.pct-b.pct);
  const avg=R.length?Math.round(R.reduce((s,x)=>s+x.pct,0)/R.length):100;
  return h('div',null,h('div',{style:{fontSize:13,marginTop:8}},'Outlet documents complete: ',h('b',{style:{color:avg>=90?'var(--green)':avg>=60?'#b26a00':'var(--red)'}},avg+'%')),
    msTbl(h,['Employee','Complete','Missing'],R.map(x=>[x.e.name,h('b',{style:{color:x.pct>=90?'var(--green)':x.pct>=60?'#b26a00':'var(--red)'}},x.pct+'%'),h('span',{style:{fontSize:11.5,color:'var(--text2)'}},x.miss.join(', ')||'✓')])));
}
function MsAnnual({salon,act}){
  const h=React.createElement;const sid=salon.id;const gOn=msOn('msGratuityBonus',sid);const today=new Date();
  const R=act.map(e=>{const ctc=Number(e.gross)||0;const pv=typeof payProvisionFor==='function'?payProvisionFor(sid,e):{bonus:0,gratuity:0};const d=e.doj?new Date(String(e.doj).slice(0,10)+'T00:00:00'):null;const yrs=d&&!isNaN(d)?(today-d)/(365.25*864e5):0;
    const fullY=Math.floor(yrs)+((yrs%1)>=0.5?1:0);const grat=Math.round((Number(e.basic)||0)*15/26*fullY);const pay=typeof payGrossFor==='function'?payGrossFor(e,sid):ctc;
    return{e,ctc,annual:ctc*12,bonus:pv.bonus*12,grat:pv.gratuity*12,yrs,gratDue:yrs>=5?grat:0,gratIn:yrs<5?Math.max(0,5-yrs):0,bonusOk:pay<=21000};});
  const T=k=>R.reduce((s,x)=>s+(x[k]||0),0);
  return h('div',null,msTbl(h,['Employee','Monthly CTC','Annual CTC','Bonus provision / yr','Gratuity provision / yr','Total annual cost'].concat(gOn?['Service','Gratuity','Bonus']:[]),
    R.map(x=>[x.e.name,msM(x.ctc),msM(x.annual),msM(x.bonus),msM(x.grat),h('b',null,msM(x.annual+x.bonus+x.grat))].concat(gOn?[(Math.round(x.yrs*10)/10)+' yrs',x.gratDue?h('span',{style:{color:'var(--green)'}},'Eligible · '+msM(x.gratDue)):'in '+(Math.round(x.gratIn*10)/10)+' yrs',x.bonusOk?'Eligible':'Above ₹21,000']:[])),
    ['Total',msM(T('ctc')),msM(T('annual')),msM(T('bonus')),msM(T('grat')),msM(T('annual')+T('bonus')+T('grat'))].concat(gOn?['','',''] :[])),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:4}},'Bonus provision: 8.33% of Basic (capped) for salary up to ₹21,000. Gratuity: 15/26 of a month’s Basic per completed year (6 months or more counts as a year), payable after 5 years.'));
}
function MsDept({salon,act}){
  const h=React.createElement;const sid=salon.id;const by={};act.forEach(e=>{const k=e.dept||'—';const o=by[k]=by[k]||{n:0,ctc:0};o.n++;o.ctc+=Number(e.gross)||0;});
  const d=new Date();d.setMonth(d.getMonth()-1);let rev=0,lbl=MS_MON[d.getMonth()]+' '+d.getFullYear();try{const p=calToFYMI(d.getFullYear(),d.getMonth());rev=Number((plBuild(sid,p.fy,p.mi)||{}).revenue)||0;}catch(x){}
  const tot=Object.values(by).reduce((s,o)=>s+o.ctc,0);
  return h('div',null,msTbl(h,['Department','Staff','Monthly CTC','Share of staff cost','% of '+lbl+' revenue'],Object.entries(by).sort((a,b)=>b[1].ctc-a[1].ctc).map(([k,o])=>[k,o.n,msM(o.ctc),Math.round(o.ctc/(tot||1)*100)+'%',rev?(Math.round(o.ctc/rev*1000)/10)+'%':'—']),
    ['Total',act.length,msM(tot),'100%',rev?(Math.round(tot/rev*1000)/10)+'%':'—']),h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:4}},rev?'Revenue '+msM(rev)+' ('+lbl+', P&L).':'No P&L revenue for '+lbl+' yet.'));
}
function MsBulk({salon,employees,setEmployees,onDone}){
  const h=React.createElement;const sid=salon.id;const [sel,setSel]=useState(()=>new Set());const [f,setF]=useState({dept:'',weeklyOff:'',pf:'',esic:'',inc:'',from:''});
  const act=(employees||[]).filter(e=>e.status!=='Inactive');const depts=[...new Set((employees||[]).map(e=>e.dept).filter(Boolean))];
  const nowYm=new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0');
  const apply=()=>{if(!sel.size){window.alert('Tick the employees first.');return;}const inc=Number(f.inc)||0;const from=f.from||nowYm;const rec=msSalon(sid);
    if(!window.confirm('Apply to '+sel.size+' employee(s)?'+(inc?'\n\nIncrement '+inc+'% on Basic, HRA, Conveyance and Special with effect from '+from+'.':'')))return;
    const next=employees.map(e=>{if(!sel.has(e.id))return e;let n={...e};if(f.dept)n.dept=f.dept;if(f.weeklyOff)n.weeklyOff=f.weeklyOff;if(f.pf)n.pf=f.pf==='on';if(f.esic)n.esic=f.esic==='on';
      if(inc){['basic','hra','conv','special'].forEach(k=>{n[k]=Math.round((Number(e[k])||0)*(1+inc/100));});}
      if(inc||f.pf||f.esic)n.gross=typeof ctcFor==='function'?ctcFor(n,rec):msParts(n);
      if(inc&&typeof salApplyChange==='function'&&typeof salRevOn==='function'&&salRevOn(sid)){try{const r=salApplyChange(sid,e,n,from,'Bulk increment '+inc+'%');if(r&&r.rec&&r.rec.id)n=r.rec;}catch(x){}}
      return n;});
    setEmployees(next);try{logAuditEvent(sid,{entity:'Employee',entityId:'bulk',action:'Bulk edit',summary:sel.size+' employee(s)'+(f.dept?' · dept '+f.dept:'')+(f.weeklyOff?' · weekly off '+f.weeklyOff:'')+(f.pf?' · PF '+f.pf:'')+(f.esic?' · ESIC '+f.esic:'')+(inc?' · +'+inc+'% from '+from:'')});}catch(x){}onDone&&onDone();};
  const sl=(k,opts)=>h('select',{className:'form-control',style:{width:'auto',fontSize:12},value:f[k],onChange:e=>setF({...f,[k]:e.target.value})},h('option',{value:''},'— keep —'),opts.map(o=>h('option',{key:o[0],value:o[0]},o[1])));
  return h('div',{style:{marginTop:8,display:'flex',flexDirection:'column',gap:8}},
    h('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setSel(new Set(act.map(e=>e.id)))},'Tick all'),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setSel(new Set())},'Clear'),
      act.map(e=>{const on=sel.has(e.id);return h('label',{key:e.id,style:{fontSize:12,padding:'2px 8px',borderRadius:12,border:'1px solid '+(on?'#2f5fe0':'var(--border)'),display:'inline-flex',gap:4,alignItems:'center',cursor:'pointer'}},h('input',{type:'checkbox',checked:on,onChange:()=>{const s=new Set(sel);on?s.delete(e.id):s.add(e.id);setSel(s);}}),e.name);})),
    h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',fontSize:12}},'Department',sl('dept',depts.map(d=>[d,d])),'Weekly off',sl('weeklyOff',['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(d=>[d,d])),'PF',sl('pf',[['on','On'],['off','Off']]),'ESIC',sl('esic',[['on','On'],['off','Off']]),
      'Increment %',h('input',{type:'number',className:'form-control',style:{width:80,fontSize:12},value:f.inc,onChange:e=>setF({...f,inc:e.target.value})}),'from',h('input',{type:'month','data-native':true,className:'form-control',style:{width:'auto',fontSize:12},value:f.from||nowYm,onChange:e=>setF({...f,from:e.target.value})}),
      h('button',{className:'btn btn-primary btn-sm',onClick:apply},'Apply to '+sel.size)),
    h('div',{style:{fontSize:11.5,color:'var(--text3)'}},'An increment is saved as a pay change with that “with effect from” month (arrears for months already locked, as usual). Gross CTC is recalculated.'));
}
function MsReqList({salon,employees,setEmployees,bump}){
  const h=React.createElement;const sid=salon.id;const L=msReqs(sid).filter(r=>r.status==='pending');
  const decide=(r,ok)=>{const A=msReqs(sid).map(x=>x.id===r.id?{...x,status:ok?'approved':'rejected',decidedAt:new Date().toISOString(),decidedBy:((typeof currentSessionUser==='function'&&currentSessionUser())||{}).name||''}:x);msReqSave(sid,A);
    if(ok){setEmployees(employees.map(e=>{if(String(e.id)!==String(r.empId))return e;const n={...e};Object.entries(r.changes||{}).forEach(([k,v])=>{n[k]=v.to;});return n;}));try{logAuditEvent(sid,{entity:'Employee',entityId:r.empId,action:'Details updated by staff',summary:r.name+': '+Object.keys(r.changes||{}).join(', ')});}catch(x){}}bump&&bump();};
  if(!L.length)return h('div',{style:{fontSize:12.5,color:'var(--text3)',marginTop:8}},'No requests waiting. Staff send them from the outlet phone screen (👤 For staff → 🪪 Update my details).');
  return h('div',{style:{marginTop:8,display:'flex',flexDirection:'column',gap:8}},L.map(r=>h('div',{key:r.id,style:{border:'1px solid var(--border)',borderRadius:'var(--r)',padding:8,fontSize:12.5}},
    h('b',null,r.name),' · '+new Date(r.at).toLocaleString('en-GB',DMY_DT),
    Object.entries(r.changes||{}).map(([k,v])=>h('div',{key:k},((MS_SELF_FIELDS.find(x=>x[0]===k)||[k,k])[1])+': ',h('span',{style:{color:'var(--text3)'}},v.from||'—'),' → ',h('b',null,v.to))),
    h('div',{style:{display:'flex',gap:6,marginTop:6}},h('button',{className:'btn btn-primary btn-sm',onClick:()=>decide(r,true)},'✓ Approve'),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>decide(r,false)},'✕ Reject')))));
}
