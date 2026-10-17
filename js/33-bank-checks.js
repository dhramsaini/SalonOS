// ═══ Bank mapping — checks and controls (review, exceptions, lock, balance, statutory, guards, month close) ═══
// Split out of js/32-bank-mapper.js; every function here is global and used at run time by the mapping pop-up,
// Bank Statement and the dashboard. Loaded after js/32.

// ── Second-person review (Controls → mapReview): {rowId:{by,at,sig}} — a tick lapses when the mapping changes ──
function bankReviewKey(sid){return outletKey('salonos_bank_map_review',sid);}

function loadBankReview(sid){try{const v=JSON.parse(cachedLocalGet(bankReviewKey(sid))||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}}

function bankReviewSig(r){const ids=a=>Array.isArray(a)?a.map(z=>String(z.employeeId||'')+':'+String(z.advanceId||'')).join(','):'';
  const s=JSON.stringify([r.nature||'',r.vendorOverride||'',r.cradleeDate||'',r.linkedInvoice||'',ids(r.linkedEmployeePay),ids(r.linkedAdvance),Array.isArray(r.splits)?r.splits.map(z=>[z.nature,Number(z.amount)||0,z.vendorOverride||'']):'']);
  let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return String(h);}

function bankReviewStatus(r,rv){const v=r&&rv[r.id];return v&&v.sig===bankReviewSig(r)?v:null;}

function bankLineMapper(sid,rowId,J){const e=(J||bankMapJournal(sid)).filter(z=>z.rowId===rowId&&!z.undone).pop();return e?(e.lastBy||e.by||''):'';}

function mappedBankLinesFor(sid,year,month,rows){
  const pre=year+'-'+String(month+1).padStart(2,'0');const vendors=loadVendors(sid)||[];
  return(rows||bankRowsFor(sid)).filter(r=>r&&String(toISO(r.transactionDate)||'').startsWith(pre)&&(Number(r.credit)>0||Number(r.debit)>0)&&!bankLineProblem(r,vendors));
}

function bankReviewProgress(sid,year,month,rows){
  const L=mappedBankLinesFor(sid,year,month,rows);const rv=loadBankReview(sid);const pending=L.filter(r=>!bankReviewStatus(r,rv));
  return{total:L.length,done:L.length-pending.length,pct:L.length?Math.round((L.length-pending.length)/L.length*100):100,pending};
}

// Marks rows checked (on) or not; with the control on, nobody checks a line they mapped themselves.
function setBankReviewed(sid,rows,on){
  const rv=loadBankReview(sid);const me=bmapUser();const J=bankMapJournal(sid);const strict=controlOn('mapReview',sid);let done=0,own=0;
  (rows||[]).forEach(r=>{if(!r)return;if(!on){if(rv[r.id]){delete rv[r.id];done++;}return;}
    if(strict&&bankLineMapper(sid,r.id,J)===me){own++;return;}
    rv[r.id]={by:me,at:Date.now(),sig:bankReviewSig(r)};done++;});
  const keys=Object.keys(rv);if(keys.length>4000)keys.sort((a,b)=>(rv[a].at||0)-(rv[b].at||0)).slice(0,keys.length-4000).forEach(k=>delete rv[k]);
  safeLocalSet(bankReviewKey(sid),JSON.stringify(rv));
  if(done)try{logAuditEvent(sid,{entity:'Bank Statement',entityId:'review',action:on?'Mapping checked':'Check removed',summary:done+' bank line(s)'});}catch(e){}
  return{done,own};
}

// ── Exceptions (Controls → bankExceptions): unusual mappings, each can be marked “it is right” ──
function bankExcOkKey(sid){return outletKey('salonos_bank_exc_ok',sid);}

function loadBankExcOk(sid){try{return JSON.parse(cachedLocalGet(bankExcOkKey(sid))||'{}')||{};}catch(e){return{};}}

function markBankExcOk(sid,key){const o=loadBankExcOk(sid);o[key]={by:bmapUser(),at:Date.now()};safeLocalSet(bankExcOkKey(sid),JSON.stringify(o));}

function bankLineVendorName(r,vendors){
  const ov=String(r.vendorOverride||'');if(ov&&ov!=='__none__'&&!ov.startsWith('EMP:'))return ov;
  if(r.linkedInvoice){const vid=String(r.linkedInvoice).split(',')[0].split('|')[0];const v=vendors.find(z=>String(z.id)===vid);if(v)return v.name;}
  if(ov==='__none__'||Number(r.credit)>0)return'';const v=findVendorMatch(r.description,vendors);return v?v.name:'';
}

function bankMappingExceptions(sid,year,month,rows){
  if(!controlOn('bankExceptions',sid))return[];
  const pre=year+'-'+String(month+1).padStart(2,'0');const vendors=loadVendors(sid)||[];const R=n=>'₹'+Math.round(Number(n)||0).toLocaleString('en-IN');
  const all=(rows||bankRowsFor(sid)).filter(r=>r&&Number(r.debit)>0);const inM=all.filter(r=>String(toISO(r.transactionDate)||'').startsWith(pre)&&!bankLineProblem(r,vendors));
  const ok=loadBankExcOk(sid);const out=[];const seen=new Set();
  const add=(r,kind,text)=>{const k=kind+'|'+r.id;if(ok[k]||seen.has(k))return;seen.add(k);out.push({key:k,rowId:r.id,date:r.transactionDate||'',amount:Number(r.debit)||Number(r.credit)||0,description:r.description||'',kind,text});};
  const vp=r=>r.nature==='Vendor Payment'||!!r.linkedInvoice;
  const byV={};inM.filter(vp).forEach(r=>{const n=bankLineVendorName(r,vendors);if(n)(byV[n]=byV[n]||[]).push(r);});
  Object.keys(byV).forEach(n=>{const L=byV[n];const byA={};L.forEach(r=>{const a=Math.round(Number(r.debit));(byA[a]=byA[a]||[]).push(r);});
    Object.values(byA).forEach(g=>{if(g.length>1)g.forEach(r=>add(r,'Paid twice',n+' was paid '+R(r.debit)+' '+g.length+' times this month ('+g.map(z=>z.transactionDate).join(', ')+').'));});
    const hist=all.filter(r=>vp(r)&&!String(toISO(r.transactionDate)||'').startsWith(pre)&&bankLineVendorName(r,vendors)===n).map(r=>Number(r.debit)).sort((a,b)=>a-b);
    if(hist.length>=3){const med=hist[Math.floor(hist.length/2)];L.forEach(r=>{if(Number(r.debit)>Math.max(med*2,med+5000))add(r,'Above usual',n+' is usually paid about '+R(med)+' (median of '+hist.length+' earlier payments) — this one is '+R(r.debit)+'.');});}});
  const pm=month===0?{y:year-1,m:11}:{y:year,m:month-1};
  const emps=[...(getEmployeesForMonth(year,month,sid)||[]),...(getEmployeesForMonth(pm.y,pm.m,sid)||[])].filter(Boolean);
  const active=emps.filter(e=>e.status!=='Inactive');
  inM.filter(r=>['Salary','Incentive','Daily Incentive','Advance Salary'].includes(r.nature)||(Array.isArray(r.linkedEmployeePay)&&r.linkedEmployeePay.length)||(Array.isArray(r.linkedAdvance)&&r.linkedAdvance.length)).forEach(r=>{
    const linked=[...(Array.isArray(r.linkedEmployeePay)?r.linkedEmployeePay:[]),...(Array.isArray(r.linkedAdvance)?r.linkedAdvance:[])];
    if(linked.length)linked.forEach(l=>{if(!active.some(e=>String(e.id)===String(l.employeeId)))add(r,'Not on rolls',(r.nature||'Salary')+' settled to '+(l.employeeName||'an employee')+', who is not active on the rolls for this or last month.');});
    else if(!/bulk|batch|payroll/i.test(r.description||'')&&!findEmployeeSmart(r.description,active))add(r,'Not on rolls',(r.nature||'Salary')+' paid, but no active employee matches the narration and nothing is settled against it (settle it with 👤 Pay, or mark it right).');});
  // first payment to a new payee
  if(controlOn('newPayeeAlert',sid)){const lim=controlLimit('newPayeeAlert',sid);const before=all.filter(r=>String(toISO(r.transactionDate)||'')<pre+'-01');
    const sigs=new Set(before.map(r=>bmapSig(r.description)).filter(z=>z&&z.length>=6));const toks=new Set(before.flatMap(r=>payeeTokensOf(r.description)));
    if(before.length)all.filter(r=>String(toISO(r.transactionDate)||'').startsWith(pre)&&Number(r.debit)>lim).forEach(r=>{const sg=bmapSig(r.description);const tk=payeeTokensOf(r.description);
      if((!sg||sg.length<6)&&!tk.length)return;if((sg&&sigs.has(sg))||tk.some(z=>toks.has(z)))return;add(r,'New payee','First payment to this payee ('+R(r.debit)+') — the narration pattern'+(tk.length?', account / UPI ID':'')+' never appeared before.');});}
  // round amounts and Sunday payments
  if(controlOn('roundOddFlags',sid)){const lim=controlLimit('roundOddFlags',sid)||20000;
    all.filter(r=>String(toISO(r.transactionDate)||'').startsWith(pre)).forEach(r=>{const a=Number(r.debit);
      if(a>=lim&&a%5000===0&&!r.linkedInvoice&&(['Other','Transfer','Advance Salary','Refund',''].includes(String(r.nature||''))))add(r,'Round amount','Round transfer of '+R(a)+' mapped as '+(r.nature||'nothing')+' — check who received it and why.');
      const iso=toISO(r.transactionDate);if(iso&&new Date(iso+'T00:00:00').getDay()===0&&!['Bank Charges','TDS','GST','Interest','Tax Payment'].includes(r.nature))add(r,'Sunday payment','Paid on a Sunday ('+r.transactionDate+') — the outlet’s bank work is usually on weekdays.');});}
  // card / UPI charges above the agreed rate
  if(controlOn('mdrCheck',sid)){const lim=controlLimit('mdrCheck',sid)||2;const T=cradleeDayTotals(sid);const grp={};
    (rows||bankRowsFor(sid)).filter(r=>r&&Number(r.credit)>0&&String(toISO(r.transactionDate)||'').startsWith(pre)&&(r.nature==='Card Settlement'||r.nature==='UPI Settlement')&&r.cradleeDate)
      .forEach(r=>{const k=(r.nature==='UPI Settlement'?'upi':'card')+'|'+r.cradleeDate;(grp[k]=grp[k]||[]).push(r);});
    Object.keys(grp).forEach(k=>{const [kind,d]=k.split('|');const tot=(T[d]||{})[kind]||0;if(!(tot>0))return;const got=grp[k].reduce((t,r)=>t+Number(r.credit),0);const fee=(tot-got)/tot*100;
      if(fee>lim&&got<tot)grp[k].forEach(r=>add(r,'High charges',kind.toUpperCase()+' sales of '+d+' were '+R(tot)+'; settled '+R(got)+' — charges '+fee.toFixed(2)+'% (agreed up to '+lim+'%).'));});}
  // GST bill paid, vendor GSTIN missing / invalid
  if(controlOn('bankGstinCheck',sid)){const inv=loadVendorInvoices(sid)||[];
    inM.filter(r=>r.linkedInvoice).forEach(r=>{String(r.linkedInvoice).split(',').filter(Boolean).forEach(k=>{const [vid,no]=k.split('|');const i=inv.find(z=>String(z.vendorId)===vid&&String(z.invoiceNo)===no);if(!i)return;
      const gst=(Number(i.cgst)||0)+(Number(i.sgst)||0)+(Number(i.igst)||0);if(!(gst>0))return;const v=vendors.find(z=>String(z.id)===vid);const g=String(v&&v.gst||'').trim();
      if(!g||(typeof isValidGSTINFormat==='function'&&!isValidGSTINFormat(g)))add(r,'GSTIN missing','Bill '+no+' of '+(v?v.name:'the vendor')+' has GST '+R(gst)+', but the vendor’s GSTIN is '+(g?'not valid ('+g+')':'missing')+' — input credit is at risk.');});});}
  return out.sort((a,b)=>String(toISO(a.date)).localeCompare(String(toISO(b.date))));
}

// ── Lock mapped lines once the month is Final (Controls → bankLockFinal) ──
const BANK_LOCK_OPEN={}; // sid|yyyy-mm → unlocked by a Super Admin for this session

function bankLineYM(r){return String(toISO(r&&(r.transactionDate||r.date))||'').slice(0,7);}

function bankLineLocked(sid,r){
  if(!r||!controlOn('bankLockFinal',sid))return false;const ym=bankLineYM(r);if(ym.length!==7||BANK_LOCK_OPEN[sid+'|'+ym])return false;
  return isMonthLockedFor(sid,Number(ym.slice(0,4)),Number(ym.slice(5,7))-1)&&!bankLineProblem(r,loadVendors(sid)||[]);
}

function bankLockOk(sid,r,what){
  if(!bankLineLocked(sid,r))return true;const ym=bankLineYM(r);
  if(!requestUnlock(sid,'the mapped bank lines of '+RPT_MONTHS[Number(ym.slice(5,7))-1]+' '+ym.slice(0,4)+' (month Final)'+(what?' — to '+what:'')))return false;
  BANK_LOCK_OPEN[sid+'|'+ym]=Date.now();return true;
}

// ── Who / what may change a line (Controls → vagueNatureReason, mapRoleLimits, tallyChangeGuard) ──
const BANK_VAGUE_NATURES=['Other','Transfer'];

const BANK_PAYROLL_NATURES=['Salary','Incentive','Daily Incentive','Advance Salary'];

const BANK_PAYROLL_ROLES=['Super Admin','Owner','Salon Owner','Accountant'];

function bankPayrollAllowed(sid){if(!controlOn('mapRoleLimits',sid))return true;const u=currentSessionUser();return !!u&&BANK_PAYROLL_ROLES.includes(u.role);}

function bankInTally(sid,r){return !!(r&&loadTallyPushed(sid).bank[r.id]);}

function bankVagueNeedsReason(sid,r,nature){return BANK_VAGUE_NATURES.includes(nature)&&controlOn('vagueNatureReason',sid)&&(Number(r.debit)||Number(r.credit)||0)>controlLimit('vagueNatureReason',sid);}

// Without prompts (bulk actions): '' when the line may be set to this Nature, else why not.
function bankEditBlocker(sid,r,nature){
  if(!r)return'';
  if(controlOn('tallyChangeGuard',sid)&&bankInTally(sid,r)&&!isSuperAdminUser(currentSessionUser()))return'already in Tally';
  if(!bankPayrollAllowed(sid)&&(BANK_PAYROLL_NATURES.includes(nature)||BANK_PAYROLL_NATURES.includes(r.nature)))return'salary lines need Super Admin / Owner / Accountant';
  if(nature&&bankVagueNeedsReason(sid,r,nature))return'needs a reason';
  return'';
}

// Interactive: null = stop; otherwise extra fields to save with the change (k: the field, or 'unlink' / 'undo').
function bankEditGuard(sid,r,k,v){
  if(!r)return{};const amt=Number(r.debit)||Number(r.credit)||0;
  if(controlOn('tallyChangeGuard',sid)&&bankInTally(sid,r)){
    if(!isSuperAdminUser(currentSessionUser())){window.alert('This bank line is already in Tally — only a Super Admin can change it (Master Settings → 🎛 Controls → Changes after Tally).');return null;}
    if(!window.confirm('This bank line is already in Tally. Change it anyway?\n\nIt will show “Changed since sent” — send it to Tally again (mapping pop-up → 📤 Send to Tally) and correct the old voucher there.'))return null;}
  if(k==='nature'&&!bankPayrollAllowed(sid)&&(BANK_PAYROLL_NATURES.includes(v)||BANK_PAYROLL_NATURES.includes(r.nature))){window.alert('Salary, incentive and advance lines can be mapped only by a Super Admin, Owner or Accountant (Master Settings → 🎛 Controls).');return null;}
  if(k==='nature'&&bankVagueNeedsReason(sid,r,v)){const n=window.prompt('“'+v+'” for ₹'+Math.round(amt).toLocaleString('en-IN')+' — what is this payment? (kept with the line)',r.mapNote||'');
    if(n==null)return null;if(!String(n).trim()){window.alert('A short reason is needed to map a line above ₹'+controlLimit('vagueNatureReason').toLocaleString('en-IN')+' as '+v+'.');return null;}return{mapNote:String(n).trim()};}
  return{};
}

// ── Running balance check: previous closing + credit − debit = closing ──
function bankBalanceBreaks(sid,rows){
  if(!controlOn('bankBalanceCheck',sid))return[];
  const L=(rows||bankRowsFor(sid)).map((r,i)=>({r,i,iso:toISO(r&&r.transactionDate)||''})).filter(o=>o.iso&&o.r&&o.r.closingBalance!=null&&o.r.closingBalance!==''&&!isNaN(Number(o.r.closingBalance))&&(Number(o.r.debit)||Number(o.r.credit)||Number(o.r.closingBalance)));
  if(L.length<2)return[];
  const run=dir=>{const S=L.slice().sort((a,b)=>a.iso.localeCompare(b.iso)||(a.i-b.i)*dir);const br=[];
    for(let k=1;k<S.length;k++){const p0=S[k-1].r,cu=S[k].r;const exp=Number(p0.closingBalance)+(Number(cu.credit)||0)-(Number(cu.debit)||0);const got=Number(cu.closingBalance);
      if(Math.abs(exp-got)>1)br.push({date:cu.transactionDate,rowId:cu.id,after:p0.transactionDate,expected:Math.round(exp*100)/100,got:Math.round(got*100)/100,diff:Math.round((got-exp)*100)/100,description:cu.description||''});}
    return br;};
  const a=run(1),z=run(-1);return a.length<=z.length?a:z;
}

function BankBalanceStrip({salonId,rows}){
  const h=React.createElement;if(salonId==null)return null;const br=bankBalanceBreaks(salonId,rows);const miss=controlOn('bankBalanceCheck',salonId)?bankMissingMonths(salonId,rows):[];if(!br.length&&!miss.length)return null;
  const R=n=>'₹'+Number(n).toLocaleString('en-IN',{maximumFractionDigits:2});
  return h('div',{style:{background:'rgba(224,82,82,0.08)',border:'1px solid rgba(224,82,82,0.35)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,fontSize:12.5}},
    miss.length>0&&h('div',null,'📅 ',h('b',null,'No statement for '+miss.slice(0,6).map(z=>RPT_MONTHS[Number(z.slice(5,7))-1].slice(0,3)+' '+z.slice(0,4)).join(', ')+(miss.length>6?' …':'')),' — import it so the opening balance carries forward from month to month.'),
    br.length>0&&h('span',null,'⚖ ',h('b',null,'Running balance breaks '+br.length+' time'+(br.length===1?'':'s')),' — a line is probably missing or imported twice. '),
    br.slice(0,3).map((b2,i)=>h('div',{key:i,style:{marginTop:3,color:'var(--text2)'}},b2.date+': expected '+R(b2.expected)+', statement shows '+R(b2.got)+' (difference '+R(b2.diff)+') — '+String(b2.description).slice(0,50))),
    br.length>3&&h('div',{style:{marginTop:3,color:'var(--text3)'}},'… and '+(br.length-3)+' more. Re-import the statement for those dates.'));
}

// ── PF / ESIC / PT / TDS of last month against the bank ──
const BANK_STAT_NATURE={'PF Challan':'PF Payment','ESIC Challan':'ESIC Payment','PT Payment':'PT Payment','TDS Payment':'TDS'};

function bankStatutoryCheck(sid,year,month,rows){
  if(!controlOn('statutoryBankCheck',sid)||typeof autoStatutoryDueItemsFor!=='function')return[];
  const pm=month===0?{y:year-1,m:11}:{y:year,m:month-1};const now=new Date();
  const back=Math.min(24,Math.max(1,(now.getFullYear()-pm.y)*12+now.getMonth()-pm.m+1));
  let items=[];try{items=autoStatutoryDueItemsFor(sid,back).filter(i=>i.year===pm.y&&i.month===pm.m&&BANK_STAT_NATURE[i.type]);}catch(e){return[];}
  const R=(rows||bankRowsFor(sid)).filter(r=>r&&Number(r.debit)>0);const today=new Date().toISOString().slice(0,10);
  const byType={};items.forEach(i=>{const k=i.type;const e=byType[k]=byType[k]||{type:k,due:i.due,amount:0};e.amount+=Number(i.amount)||0;if(i.due&&i.due<e.due)e.due=i.due;});
  return Object.values(byType).map(e=>{const nat=BANK_STAT_NATURE[e.type];const from=year+'-'+String(month+1).padStart(2,'0')+'-01';const lim=new Date(new Date(e.due+'T00:00:00').getTime()+45*864e5).toISOString().slice(0,10);
    const lines=R.filter(r=>{const i=toISO(r.transactionDate)||'';return r.nature===nat&&i>=from&&i<=lim;});const paid=lines.reduce((t,r)=>t+Number(r.debit),0);
    const first=lines.map(r=>toISO(r.transactionDate)).sort()[0]||'';const amt=Math.round(e.amount);
    let status,bad=false;
    if(!lines.length){if(today>e.due){status='Not paid (due '+e.due.split('-').reverse().join('/')+')';bad=true;}else status='Due by '+e.due.split('-').reverse().join('/');}
    else if(paid<amt-1){status='Short by ₹'+Math.round(amt-paid).toLocaleString('en-IN');bad=true;}
    else if(first>e.due){status='Paid late on '+first.split('-').reverse().join('/');bad=true;}
    else status='Paid ✓';
    return{type:e.type,nature:nat,forMonth:RPT_MONTHS[pm.m]+' '+pm.y,due:e.due,amount:amt,paid:Math.round(paid),status,bad,lines:lines.map(r=>r.id)};});
}

// ── Maker-checker: unchecked lines are held back from Tally ──
function bankTallyHeld(sid,r){if(!r||!controlOn('tallyNeedsReview',sid))return false;return !bankReviewStatus(r,loadBankReview(sid));}

// ── Owner alert: a checked / Final line above the limit was changed ──
function bankChangeAlertsKey(sid){return outletKey('salonos_bank_change_alerts',sid);}

function loadBankChangeAlerts(sid){try{const v=JSON.parse(cachedLocalGet(bankChangeAlertsKey(sid))||'[]');return Array.isArray(v)?v:[];}catch(e){return[];}}

function noteBankBigChange(sid,r,what){
  if(!r||!controlOn('bankBigChangeAlert',sid))return;const amt=Number(r.debit)||Number(r.credit)||0;if(amt<=controlLimit('bankBigChangeAlert',sid))return;
  const reviewed=!!loadBankReview(sid)[r.id];const ym=bankLineYM(r);const final=ym.length===7&&isMonthLockedFor(sid,Number(ym.slice(0,4)),Number(ym.slice(5,7))-1);if(!reviewed&&!final)return;
  const L=loadBankChangeAlerts(sid);L.push({id:'BA'+Date.now()+Math.random().toString(36).slice(2,5),at:Date.now(),by:bmapUser(),rowId:r.id,date:r.transactionDate||'',amount:amt,description:r.description||'',what,why:final?'Final month':'checked line',seen:false});
  safeLocalSet(bankChangeAlertsKey(sid),JSON.stringify(L.slice(-200)));
  try{logAuditEvent(sid,{entity:'Bank Statement',entityId:String(r.id),action:'Checked / Final line changed',summary:(r.transactionDate||'')+' ₹'+Math.round(amt).toLocaleString('en-IN')+' — '+what});}catch(e){}
}

function markBankChangeAlertsSeen(sid,ids){const L=loadBankChangeAlerts(sid).map(a=>(!ids||ids.includes(a.id))?{...a,seen:true,seenBy:bmapUser(),seenAt:Date.now()}:a);safeLocalSet(bankChangeAlertsKey(sid),JSON.stringify(L));}

// ── Month close: mark the month Final from the ✅ Close tab (same checks as P&L → Mark Final) ──
function bankCloseMarkFinal(sid,year,month,onNavTab){
  const u=currentSessionUser();if(!u||!(u.role==='Super Admin'||(typeof userCanEditSheet==='function'&&userCanEditSheet(u,sid,'outlet-pnl')))){window.alert('Only someone who can edit the P&L can mark the month Final.');return false;}
  const {fy,mi}=calToFYMI(year,month);const lbl=RPT_MONTHS[month]+' '+year;if(isPnlFinal(sid,fy,mi)){window.alert(lbl+' is already Final.');return false;}
  const cm=typeof collectionFinalBlockMessage==='function'?collectionFinalBlockMessage(sid,year,month):'';if(cm){window.alert(cm);return false;}
  if(!monthFinalMappingOk(sid,year,month,onNavTab))return false;
  if(!window.confirm('Mark '+lbl+' FINAL? The whole month locks: nobody — Super Admin included — can change Daily Sales, Vendors, Attendance, Salary, Incentive, Advances, Penalties or the P&L for it. Only a Super Admin can un-finalize it, with a reason.'))return false;
  setPnlFinal(sid,fy,mi,true);try{logAuditEvent(sid,{entity:'P&L',entityId:fy+'|'+mi,action:'Marked Final',summary:lbl+' marked Final from the bank mapping ✅ Close tab'});}catch(e){}
  return true;
}

// ── Someone else mapped it meanwhile (Controls → bankConflictWarn) ──
function bankConflictOk(sid,x){
  if(!x||!x.problem||!controlOn('bankConflictWarn',sid))return true;const fresh=bankRowsFor(sid).find(r=>r.id===x.id);if(!fresh||bankLineProblem(fresh,loadVendors(sid)||[]))return true;
  const e=bankMapJournal(sid).filter(z=>z.rowId===x.id&&!z.undone).pop();const who=e?(e.lastBy||e.by):'Someone';if(e&&who===bmapUser())return true;
  return window.confirm(who+(e?' ('+new Date(e.lastAt||e.at).toLocaleString('en-GB',DMY_DT)+')':'')+' has already mapped this line as '+(fresh.nature||'—')+(fresh.vendorOverride&&fresh.vendorOverride!=='__none__'?' · '+fresh.vendorOverride:'')+' on another device.\n\nReplace their mapping with yours?');
}

// ── Aggregator payouts against their reports (Controls → aggregatorPayoutCheck) ──
function aggregatorPayoutCheck(sid,year,month,rows){
  if(!controlOn('aggregatorPayoutCheck',sid)||typeof aggregatorMonthFor!=='function'||typeof AGG_PLATFORMS==='undefined')return[];
  const pre=year+'-'+String(month+1).padStart(2,'0');const R=(rows||bankRowsFor(sid)).filter(r=>r&&Number(r.credit)>0&&String(toISO(r.transactionDate)||'').startsWith(pre));
  return AGG_PLATFORMS.map(pf=>{let e;try{e=aggregatorMonthFor(sid,year,month,pf);}catch(err){return null;}if(!e||(!e.gross&&!e.net))return null;
    const got=Math.round(R.filter(r=>r.nature===pf+' Settlement').reduce((t,r)=>t+Number(r.credit),0));const diff=got-e.net;
    return{platform:pf,gross:e.gross,commission:e.commission,charges:e.charges,tds:e.tds,net:e.net,got,diff,ok:Math.abs(diff)<=Math.max(10,e.net*0.01)};}).filter(Boolean);
}

// ── Cash withdrawals against cash expenses (Controls → pettyCashCheck) ──
function bankCashWithdrawals(sid,year,month,rows){
  if(!controlOn('pettyCashCheck',sid))return null;const pre=year+'-'+String(month+1).padStart(2,'0');
  const lines=(rows||bankRowsFor(sid)).filter(r=>r&&Number(r.debit)>0&&String(toISO(r.transactionDate)||'').startsWith(pre)&&(r.nature==='Cash Withdrawal'||(!r.nature&&/\batm\b|cash wdl|cash withdrawal|cwdr|csh wdl|\bnwd\b|self chq|chq paid.*self/i.test(r.description||''))));
  const total=Math.round(lines.reduce((t,r)=>t+Number(r.debit),0));if(!total)return{lines:[],total:0,expenses:0,gap:0};
  let expenses=0;try{if(typeof EXPENSE_ROWS!=='undefined'&&typeof dailySalesGroupSumFor==='function')[...new Set(EXPENSE_ROWS.map(z=>z.group))].forEach(g=>{expenses+=Number(dailySalesGroupSumFor(sid,year,month,g))||0;});}catch(e){}
  expenses=Math.round(expenses);return{lines,total,expenses,gap:Math.max(0,total-expenses)};
}

// ── Who may only look (Reviewer / Owner / no Bank Statement edit access) ──
function bankMapReadOnly(sid){const u=currentSessionUser();if(!u||u.role==='Super Admin')return false;if(['Reviewer','Owner','Auditor'].includes(u.role))return true;
  return typeof userCanEditSheet==='function'&&!userCanEditSheet(u,sid,'bank-statement');}

// ── Missing statement months (carry-forward) ──
function bankMissingMonths(sid,rows){
  const ms=[...new Set((rows||bankRowsFor(sid)).map(r=>String(toISO(r&&r.transactionDate)||'').slice(0,7)).filter(z=>z.length===7))].sort();if(ms.length<2)return[];
  const out=[];let y=Number(ms[0].slice(0,4)),m=Number(ms[0].slice(5,7))-1;const last=ms[ms.length-1];const have=new Set(ms);
  for(let k=0;k<240;k++){const ym=y+'-'+String(m+1).padStart(2,'0');if(ym>last)break;if(!have.has(ym))out.push(ym);m++;if(m>11){m=0;y++;}}
  return out;
}

// ── Mapping time target (Controls → mappingSla) ──
function bankMappingSla(sid,year,month,rows){
  if(!controlOn('mappingSla',sid))return null;const days=controlLimit('mappingSla',sid)||3;const pre=year+'-'+String(month+1).padStart(2,'0');const vendors=loadVendors(sid)||[];
  const J=bankMapJournal(sid);const first={};J.forEach(e=>{if(e.undone)return;if(!first[e.rowId]||e.at<first[e.rowId])first[e.rowId]=e.at;});const now=Date.now();let on=0,late=0,pending=0;
  (rows||bankRowsFor(sid)).forEach(r=>{if(!r||!(Number(r.debit)||Number(r.credit)))return;const iso=toISO(r.transactionDate)||'';if(!iso.startsWith(pre))return;const t0=new Date(iso+'T00:00:00').getTime();const due=t0+(days+1)*864e5;
    if(!bankLineProblem(r,vendors)){const at=first[r.id];if(!at||at<=due)on++;else late++;}else if(now>due)late++;else pending++;});
  return{days,on,late,pending,pct:on+late?Math.round(on/(on+late)*100):100};
}
