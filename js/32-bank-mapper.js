// ═══════════════════════════════════════════════════════════════════════════════════════════
// Bank mapper — the "map unmapped bank lines" pop-up (Bank Statement strip, Mark Final block,
// Collection Reco). One screen to give every bank line its Nature, vendor, Cradlee date, bill link,
// salary / incentive settlement or advance — line by line or in bulk — with:
//   • suggestions per line (rules, narration, exact bill / salary matches, past mappings) with a
//     confidence dot, ✓ Accept and Accept all
//   • remembered rules ("always map lines like … as …"), also applied on import (Controls)
//   • keyboard control, search / filters, grouping of look-alike narrations
//   • duplicate warning (Controls), month readiness meter, approval above a limit (Controls)
//   • an undo journal kept with the outlet (who mapped what, when; undo any time)
//   • a mapping summary Excel and the Tally status of mapped lines
// Line operations (link bills, settle pay, advances, new bill) live in js/31-collection-xl.js.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const BMAP_DOT={high:'#2e7d32',mid:'#d08a12',low:'#c0392b'};
const BMAP_CONF_LABEL={high:'Sure',mid:'Likely',low:'Guess'};
function bmapSig(desc){return typeof bankNarrationSig==='function'?bankNarrationSig(desc):String(desc||'').toLowerCase().replace(/[0-9]+/g,' ').replace(/[^a-z]+/g,' ').trim().split(/\s+/).filter(w=>w.length>2).slice(0,5).join(' ');}
function bmapPrevDay(dmy){const iso=toISO(dmy);if(!iso)return'';const t=new Date(iso+'T00:00:00');t.setDate(t.getDate()-1);return String(t.getDate()).padStart(2,'0')+'/'+String(t.getMonth()+1).padStart(2,'0')+'/'+t.getFullYear();}
function bmapUser(){const u=currentSessionUser();return u?(u.name||u.email||'—'):'—';}

// ── Remembered rules: {id, sig, side, nature, vendorOverride, dateMode:'setdt'|'prev', by, at} ──
function bankRulesKey(sid){return outletKey('salonos_bank_rules',sid);}
function loadBankRules(sid){try{const v=JSON.parse(cachedLocalGet(bankRulesKey(sid))||'[]');return Array.isArray(v)?v:[];}catch(e){return[];}}
function saveBankRules(sid,list){safeLocalSet(bankRulesKey(sid),JSON.stringify((list||[]).slice(-300)));}
// A rule matches on its narration pattern (sig) and/or “narration contains”, and an optional amount range.
function matchBankRule(sid,row,rules){
  const side=Number(row&&row.credit)>0?'Credit':'Debit';const desc=String(row&&row.description||'');const sg=bmapSig(desc);const amt=Number(row&&(row.credit||row.debit))||0;
  const ok=r=>r.side===side&&(!r.sig||(sg.length>=6&&r.sig===sg))&&(!r.contains||desc.toLowerCase().includes(String(r.contains).toLowerCase()))&&(r.sig||r.contains)
    &&(r.minAmt===''||r.minAmt==null||amt>=Number(r.minAmt))&&(r.maxAmt===''||r.maxAmt==null||amt<=Number(r.maxAmt));
  const L=(rules||loadBankRules(sid)).filter(ok);
  return L.find(r=>r.contains||r.minAmt||r.maxAmt)||L[0]||null; // a rule with conditions wins over a plain pattern
}
function addBankRule(sid,rule){
  const list=loadBankRules(sid).filter(r=>!(rule.sig&&!rule.contains&&!rule.minAmt&&!rule.maxAmt&&r.side===rule.side&&r.sig===rule.sig&&!r.contains&&!r.minAmt&&!r.maxAmt));
  list.push({id:'BR'+Date.now()+Math.random().toString(36).slice(2,5),...rule,by:bmapUser(),at:new Date().toISOString()});saveBankRules(sid,list);
  try{logAuditEvent(sid,{entity:'Bank Statement',entityId:'rule',action:'Rule added',summary:rule.side+' lines '+(rule.contains?'containing “'+rule.contains+'”':'like “'+rule.sig+'”')+(rule.minAmt||rule.maxAmt?' ₹'+(rule.minAmt||0)+'–'+(rule.maxAmt||'any'):'')+' → '+rule.nature+(rule.vendorOverride?' · '+rule.vendorOverride:'')});}catch(e){}
}
function bankRulePatch(rule,row){
  const p={nature:rule.nature};if(rule.vendorOverride)p.vendorOverride=rule.vendorOverride;
  if(rule.nature==='Card Settlement'||rule.nature==='UPI Settlement'){const d=(rule.dateMode!=='prev'&&settlementDateFromNarration(row.description))||bmapPrevDay(row.transactionDate||row.date);if(d)p.cradleeDate=d;}
  return p;
}

// ── Undo journal kept with the outlet (synced like other data) ──
function bankJournalKey(sid){return outletKey('salonos_bank_map_journal',sid);}
function bankMapJournal(sid){try{const v=JSON.parse(cachedLocalGet(bankJournalKey(sid))||'[]');return Array.isArray(v)?v:[];}catch(e){return[];}}
function saveBankMapJournal(sid,list){
  const cut=Date.now()-75*864e5;
  safeLocalSet(bankJournalKey(sid),JSON.stringify((list||[]).filter(e=>!(e.undone&&e.at<cut)).slice(-400)));
}
function journalBankMapping(sid,row,label,extra){
  if(!row)return;const J=bankMapJournal(sid);let e=J.find(z=>z.rowId===row.id&&!z.undone);
  if(!e){const before={};BANK_MAP_FIELDS.forEach(f=>{before[f]=row[f]===undefined?undefined:JSON.parse(JSON.stringify(row[f]));});
    e={id:'BJ'+Date.now()+Math.random().toString(36).slice(2,5),rowId:row.id,date:row.transactionDate||'',description:row.description||'',amount:Number(row.debit)||Number(row.credit)||0,
      side:Number(row.credit)>0?'Credit':'Debit',labels:[],before,createdInvoices:[],advBefore:null,by:bmapUser(),at:Date.now()};J.push(e);}
  if(label&&!e.labels.includes(label))e.labels.push(label);
  if(extra&&extra.createdInvoices)e.createdInvoices.push(...extra.createdInvoices);
  if(extra&&extra.advBefore&&!e.advBefore)e.advBefore=extra.advBefore.filter(a=>a&&!a.bankRowId); // only advances that could have been linked
  e.lastBy=bmapUser();e.lastAt=Date.now();
  saveBankMapJournal(sid,J);
}
// Puts a bank line back as it was before the pop-up mapped it, reversing what the mapping did.
function undoBankMapping(sid,e,cur,onMap){
  cur=cur||{};const b=e.before||{};const linkId='bank-'+e.rowId;const created=e.createdInvoices||[];
  if(!b.linkedInvoice){const inv=loadVendorInvoices(sid)||[];
    if(inv.some(i=>(i.payments||[]).some(q=>q.linkId===linkId))||created.length){
      saveVendorInvoices(inv.map(i=>(i.payments||[]).some(q=>q.linkId===linkId)?{...i,payments:i.payments.filter(q=>q.linkId!==linkId)}:i)
        .filter(i=>!(created.includes(i.id)&&!(i.payments||[]).length)),sid);}}
  if(Array.isArray(cur.linkedEmployeePay)&&!b.linkedEmployeePay)cur.linkedEmployeePay.forEach(x=>{try{unsettleEmployeePayFor(sid,x.employeeId,x.year,x.month,{salary:x.salarySettled,incentive:x.incentiveSettled});}catch(err){}});
  if(Array.isArray(cur.linkedAdvance)&&!b.linkedAdvance){const made=new Set(cur.linkedAdvance.filter(a=>!a.wasExisting).map(a=>a.advanceId)),linked=new Set(cur.linkedAdvance.filter(a=>a.wasExisting).map(a=>a.advanceId));
    saveAdvances((loadAdvances(sid)||[]).filter(a=>!made.has(a.id)).map(a=>{if(!linked.has(a.id))return a;const old=(e.advBefore||[]).find(z=>z.id===a.id);if(old)return old;const n={...a};delete n.bankRowId;return n;}),sid);}
  const patch={};BANK_MAP_FIELDS.forEach(f=>{patch[f]=b[f]===undefined?(['nature','vendorOverride','cradleeDate','linkedInvoice'].includes(f)?'':undefined):b[f];});
  if(onMap)onMap(e.rowId,patch);else saveBankLineMapping(sid,e.rowId,patch);
  const J=bankMapJournal(sid);const t=J.find(z=>z.id===e.id||(z.rowId===e.rowId&&z.at===e.at));if(t){t.undone=true;t.undoneBy=bmapUser();t.undoneAt=Date.now();saveBankMapJournal(sid,J);}
  e.undone=true;
  try{logAuditEvent(sid,{entity:'Bank Statement',entityId:String(e.rowId),action:'Mapping undone',summary:(e.date||'')+' ₹'+Math.round(e.amount).toLocaleString('en-IN')+' — '+(e.labels||[]).join(', ')});}catch(err){}
}

// ── Approval above a limit (Controls → Mapping approval) ──
function mapApprovalNeeded(sid,x){
  if(!controlOn('mapApproval',sid))return false;if(isSuperAdminUser(currentSessionUser()))return false;
  return (Number(x.debit)||Number(x.credit)||0)>controlLimit('mapApproval');
}
function mapApprovalOk(sid,x,what){
  if(!mapApprovalNeeded(sid,x))return true;
  return requireApproval({control:'mapApproval',sid,key:sid+'|map|'+x.id+'|'+what,summary:'Map bank line of '+(x.date||'')+' for ₹'+Math.round(Number(x.debit)||Number(x.credit)||0).toLocaleString('en-IN')+' — '+what});
}

// ── Duplicates: same side and amount, same payee pattern or ref, within 3 days ──
function bankDuplicateMap(sid,rows){
  if(!controlOn('bankDupWarning',sid))return{};
  const L=(rows||[]).filter(r=>r&&(Number(r.debit)>0||Number(r.credit)>0)).map(r=>({r,amt:Number(r.debit)||Number(r.credit)||0,side:Number(r.credit)>0?'C':'D',t:(()=>{const i=toISO(r.transactionDate);return i?new Date(i+'T00:00:00').getTime():0;})(),sig:bmapSig(r.description),ref:String(r.refNo||'').trim()}));
  const by={};L.forEach(a=>{(by[a.side+'|'+Math.round(a.amt)]=by[a.side+'|'+Math.round(a.amt)]||[]).push(a);});
  const out={};
  Object.values(by).forEach(g=>{if(g.length<2)return;for(let i=0;i<g.length;i++)for(let j=i+1;j<g.length;j++){const a=g[i],b=g[j];
    if(Math.abs(a.amt-b.amt)>0.5||Math.abs(a.t-b.t)>3*864e5)continue;if(!((a.sig&&a.sig===b.sig)||(a.ref&&a.ref===b.ref)))continue;
    (out[a.r.id]=out[a.r.id]||[]).push(b.r);(out[b.r.id]=out[b.r.id]||[]).push(a.r);}});
  return out;
}

// ── Month readiness ──
function bankMonthReadiness(sid,year,month,rows){
  const pre=year+'-'+String(month+1).padStart(2,'0');
  const all=(rows||bankRowsFor(sid)).filter(r=>r&&String(toISO(r.transactionDate)||'').startsWith(pre)&&(Number(r.credit)>0||Number(r.debit)>0));
  const un=unmappedBankLinesFor(sid,year,month,rows);
  const ud=un.filter(x=>x.side==='Debit'),uc=un.filter(x=>x.side==='Credit');
  return{total:all.length,mapped:all.length-un.length,pct:all.length?Math.round((all.length-un.length)/all.length*100):100,
    unDebit:ud.length,unCredit:uc.length,unDebitAmt:ud.reduce((t,x)=>t+x.debit,0),unCreditAmt:uc.reduce((t,x)=>t+x.credit,0)};
}


// ── Learning from changed suggestions: {key:'side|sig|nature', rej, acc} ──
function bankFeedbackKey(sid){return outletKey('salonos_bank_sugg_feedback',sid);}
function loadBankFeedback(sid){try{return JSON.parse(cachedLocalGet(bankFeedbackKey(sid))||'{}')||{};}catch(e){return{};}}
function noteBankFeedback(sid,x,nature,accepted){
  if(!x||!nature)return;const k=x.side+'|'+bmapSig(x.description)+'|'+nature;const f=loadBankFeedback(sid);const e=f[k]||{rej:0,acc:0};
  if(accepted)e.acc++;else e.rej++;f[k]=e;const keys=Object.keys(f);if(keys.length>600)keys.slice(0,keys.length-600).forEach(z=>delete f[z]);
  safeLocalSet(bankFeedbackKey(sid),JSON.stringify(f));
}
function suggestionNature(s){return s&&(s.apply.type==='patch'?(s.apply.patch.nature||''):s.apply.type==='link'?'Vendor Payment':s.apply.type==='pay'?s.apply.plan.what:'');}

// ── Bill matching by bill number in the narration, and with TDS deducted ──
function planSmartBillLink(sid,x,ctx){
  const R=n=>Math.round((Number(n)||0)*100)/100;const desc=String(x.description||'');const compact=desc.toLowerCase().replace(/[^a-z0-9]/g,'');
  const nums=desc.replace(/[^0-9]/g,' ').split(/\s+/).filter(d=>d.length>=3);
  const vendors=ctx.vendors;const v0=x.vendorOverride&&x.vendorOverride!=='__none__'?vendors.find(v=>v.name===x.vendorOverride):findVendorMatch(desc,vendors);
  const open=ctx.inv.filter(i=>(ctx.left[i.id]||0)>0.5&&(!v0||String(i.vendorId)===String(v0.id)));
  const byNo=open.filter(i=>{const n=String(i.invoiceNo||'').toLowerCase().replace(/[^a-z0-9]/g,'');if(n.length<3)return false;if(compact.includes(n))return true;const d=String(i.invoiceNo||'').replace(/[^0-9]/g,'');return d.length>=4&&nums.includes(d);});
  const tdsOf=(i,v)=>{const r=Number(v&&v.tdsRate)||0;if(!(v&&v.tdsApplicable)||!r)return[];const base=[Number(i.taxable)||0,Number(i.amount)||0].filter(n=>n>0);return[...new Set(base.map(b=>Math.round(b*r/100)))];};
  const tryBill=(i,how)=>{const v=vendors.find(z=>String(z.id)===String(i.vendorId));const bal=ctx.left[i.id];
    if(Math.abs(x.debit-bal)<=1)return{vendor:v,how,allocations:[{id:i.id,invoiceNo:i.invoiceNo||i.id,amount:R(Math.min(x.debit,bal))}]};
    const gap=R(bal-x.debit);if(gap>0&&tdsOf(i,v).some(t=>Math.abs(t-gap)<=1))return{vendor:v,how:how+'+tds',allocations:[{id:i.id,invoiceNo:i.invoiceNo||i.id,amount:R(x.debit),tds:gap}]};
    if(how==='billno'&&x.debit<bal)return{vendor:v,how:'partial',allocations:[{id:i.id,invoiceNo:i.invoiceNo||i.id,amount:R(x.debit)}]};
    return null;};
  if(byNo.length===1){const r=tryBill(byNo[0],'billno');if(r)return r;}
  if(v0&&v0.tdsApplicable){const hits=open.map(i=>tryBill(i,'tds')).filter(r=>r&&r.how==='tds+tds');if(hits.length===1)return{...hits[0],how:'tds'};}
  return null;
}

// ── Card / UPI sale date by amount: the day whose Cradlee card (or UPI) sales match the credit less charges ──
function cradleeDayTotals(sid){
  let rows=[],inc={wallet:true,district:true,luzo:true,online:true};
  try{rows=JSON.parse(cachedLocalGet(outletKey('salonos_cradlee_collection_rows',sid))||'[]')||[];}catch(e){}
  try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_cs_card_include_cols',sid))||'null');if(v)inc=v;}catch(e){}
  const t={};rows.forEach(r=>{const d=r&&r.invoiceDate;if(!d)return;const e=t[d]||(t[d]={card:0,upi:0});
    e.card+=(Number(r.card)||0)+(inc.wallet!==false?Number(r.wallet)||0:0)+(inc.district!==false?Number(r.district)||0:0)+(inc.luzo!==false?Number(r.luzo)||0:0)+(inc.online!==false?Number(r.online)||0:0);e.upi+=Number(r.upi)||0;});
  return t;
}
function cradleeDateByAmount(sid,x,kind,ctx){
  const iso=toISO(x.date);if(!iso)return null;const base=new Date(iso+'T00:00:00');let best=null;
  for(let k=1;k<=5;k++){const d=new Date(base.getTime()-k*864e5);const dmy=String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
    const tot=(ctx.totals[dmy]||{})[kind]||0;if(!(tot>0))continue;if(ctx.claimed[kind+'|'+dmy])continue;
    const ratio=x.credit/tot;if(ratio<0.955||ratio>1.0005)continue;const fee=1-ratio;if(!best||fee<best.fee)best={dmy,fee,tot};}
  return best;
}

// Applies one suggestion; '' when done, else the reason. Used by ✓ Accept, Accept all and auto-map on import.
function applyBankSuggestion(sid,x,s,onMap,rowsNow,labelPrefix){
  const row=(rowsNow||bankRowsFor(sid)).find(r=>r.id===x.id)||{id:x.id,debit:x.debit,credit:x.credit,transactionDate:x.date,description:x.description};
  const pre=labelPrefix||'';
  if(s.apply.type==='patch'){const patch={...s.apply.patch,aiTagged:false};journalBankMapping(sid,row,pre+(patch.nature?'Nature: '+patch.nature:patch.vendorOverride?'Vendor: '+patch.vendorOverride:'Cradlee date '+patch.cradleeDate));
    if(onMap)onMap(x.id,patch);else saveBankLineMapping(sid,x.id,patch);return'';}
  if(s.apply.type==='link'){const p=s.apply.plan;const err=linkBankLineToBills(sid,row,p.vendor,p.allocations.map(a=>({id:a.id,amount:a.amount,tds:a.tds})),onMap);if(err)return err;
    journalBankMapping(sid,row,pre+'Linked to '+p.allocations.map(a=>a.invoiceNo+(a.tds?' (+TDS '+Math.round(a.tds)+')':'')).join(', '));return'';}
  if(s.apply.type==='pay'){const p=s.apply.plan;const err=settleBankLineToEmployees(sid,row,p.year,p.month,[{employeeId:p.emp.id,employeeName:p.emp.name,salaryAmt:p.salaryAmt,incentiveAmt:p.incentiveAmt,dailyIncentiveByCat:p.dailyIncentiveByCat}],onMap);
    if(err)return err;journalBankMapping(sid,row,pre+p.what+': '+p.emp.name);return'';}
  return'Nothing to apply';
}
// Auto-map on import: “sure” suggestions only, never possible duplicates or lines needing approval.
function autoMapBankLines(sid,idSet,onMap){
  const rows=bankRowsFor(sid);const vendors=loadVendors(sid)||[];
  const list=rows.filter(r=>r&&idSet.has(r.id)&&(Number(r.debit)>0||Number(r.credit)>0)).map(r=>{const problem=bankLineProblem(r,vendors);const cr=Number(r.credit)>0;
    return problem?{id:r.id,date:r.transactionDate,description:r.description||'',credit:cr?Number(r.credit)||0:0,debit:cr?0:Number(r.debit)||0,side:cr?'Credit':'Debit',nature:String(r.nature||'').trim(),cradleeDate:r.cradleeDate||'',vendorOverride:r.vendorOverride||'',problem}:null;}).filter(Boolean);
  if(!list.length)return{done:0,summary:''};
  const sugg=bankSuggestionsFor(sid,list,rows);const dups=bankDuplicateMap(sid,rows);const kinds={};let done=0;
  list.forEach(x=>{const s=sugg[x.id];if(!s||s.conf!=='high'||dups[x.id]||mapApprovalNeeded(sid,x))return;
    if(!applyBankSuggestion(sid,x,s,onMap,rows,'Auto: ')){done++;const k=suggestionNature(s)||'Cradlee date';kinds[k]=(kinds[k]||0)+1;}});
  return{done,summary:Object.entries(kinds).map(([k,n])=>n+' '+k).join(', ')};
}

// ── Suggestions ──
// {conf:'high'|'mid'|'low', label, why, apply:{type:'patch',patch}|{type:'link',plan}|{type:'pay',plan}}
function bankSuggestionsFor(sid,list,rows){
  const out={};if(!list||!list.length)return out;
  const rules=loadBankRules(sid);const learned=typeof bankLearnedNatures==='function'?bankLearnedNatures(rows||[]):{};
  const vendors=loadVendors(sid)||[];
  const debits=list.filter(x=>x.side==='Debit'&&(!x.nature||x.nature==='Vendor Payment'||x.problem==='No vendor'));
  let lpBy={},ppBy={};
  try{planBulkBillLinks(sid,debits,false).forEach(p=>{if(p.allocations)lpBy[p.x.id]=p;});}catch(e){}
  // bill number / TDS matches for debits without an exact-amount bill (balances reduced as bills are claimed)
  try{const inv=(loadVendorInvoices(sid)||[]).filter(i=>i&&i.docNature!=='Performa Invoice');const left={};
    inv.forEach(i=>{left[i.id]=Math.round(((Number(i.amount)||0)-(i.payments||[]).reduce((t,q)=>t+(Number(q.paidAmount)||0),0))*100)/100;});
    Object.values(lpBy).forEach(p=>p.allocations.forEach(a=>{left[a.id]=Math.round((left[a.id]-a.amount)*100)/100;}));
    const ctx={inv,left,vendors};
    debits.filter(x=>!lpBy[x.id]).forEach(x=>{const r=planSmartBillLink(sid,x,ctx);if(r){lpBy[x.id]={x,...r};r.allocations.forEach(a=>{left[a.id]=Math.round((left[a.id]-a.amount-(a.tds||0))*100)/100;});}});}catch(e){}
  const cTot=cradleeDayTotals(sid);const claimed={};(rows||[]).forEach(r=>{if(r&&r.cradleeDate&&(r.nature==='Card Settlement'||r.nature==='UPI Settlement'))claimed[(r.nature==='UPI Settlement'?'upi':'card')+'|'+r.cradleeDate]=1;});
  const fb=loadBankFeedback(sid);
  try{planBulkEmployeePay(sid,list.filter(x=>x.side==='Debit'&&!x.nature&&!lpBy[x.id]),null,rows||[]).forEach(p=>{if(p.what)ppBy[p.x.id]=p;});}catch(e){}
  const m=n=>'₹'+Math.round(n).toLocaleString('en-IN');
  list.forEach(x=>{
    const d=x.description||'',lo=d.toLowerCase(),setdt=settlementDateFromNarration(d),prev=bmapPrevDay(x.date);const cr=x.side==='Credit';
    const P=(conf,label,patch,why)=>{out[x.id]={conf,label,why,apply:{type:'patch',patch}};};
    if(x.problem==='No Date as per Cradlee'){if(setdt){P('high','Cradlee date '+setdt,{cradleeDate:setdt},'Sale date printed in the narration (SETDT)');return;}
      const kind=x.nature==='UPI Settlement'?'upi':'card';const bd=cradleeDateByAmount(sid,x,kind,{totals:cTot,claimed});
      if(bd){claimed[kind+'|'+bd.dmy]=1;P('mid','Cradlee date '+bd.dmy,{cradleeDate:bd.dmy},kind.toUpperCase()+' sales of '+bd.dmy+' were '+m(bd.tot)+' — this credit is that less '+(bd.fee*100).toFixed(2)+'% charges');return;}
      if(prev)P('low','Cradlee date '+prev,{cradleeDate:prev},'Day before the bank date');return;}
    if(x.problem==='No vendor'){if(lpBy[x.id]){const p=lpBy[x.id];out[x.id]={conf:'high',label:'Link '+p.allocations.map(a=>a.invoiceNo).join(', '),why:'Bill of '+p.vendor.name+' with exactly this balance',apply:{type:'link',plan:p}};return;}
      const v=findVendorMatch(d,vendors);if(v)P('mid','Vendor '+v.name,{vendorOverride:v.name},'Vendor named in the narration');return;}
    const rule=matchBankRule(sid,{description:d,credit:x.credit,transactionDate:x.date},rules);
    if(rule){const p=bankRulePatch(rule,{description:d,transactionDate:x.date});P('high',rule.nature+(rule.vendorOverride?' · '+rule.vendorOverride:'')+(p.cradleeDate?' · '+p.cradleeDate:''),p,'Your rule for lines like “'+rule.sig+'”');return;}
    if(cr&&setdt){const n=/upi/.test(lo)?'UPI Settlement':'Card Settlement';P('high',n+' · '+setdt,{nature:n,cradleeDate:setdt},'Settlement narration with the sale date (SETDT)');return;}
    if(cr&&/card|pos|settl|mid[- ]?\d|cms/.test(lo)&&!/upi/.test(lo)){const bd=cradleeDateByAmount(sid,x,'card',{totals:cTot,claimed});if(bd){claimed['card|'+bd.dmy]=1;P('mid','Card Settlement · '+bd.dmy,{nature:'Card Settlement',cradleeDate:bd.dmy},'Card sales of '+bd.dmy+' were '+m(bd.tot)+' — this credit is that less '+(bd.fee*100).toFixed(2)+'% charges');return;}}
    if(!cr&&lpBy[x.id]){const p=lpBy[x.id];const how=p.how||'exact';
      out[x.id]={conf:how==='partial'?'mid':'high',label:'Vendor Payment → '+p.vendor.name+' · '+p.allocations.map(a=>a.invoiceNo+(a.tds?' + TDS '+m(a.tds):'')).join(', ')+(how==='partial'?' (part)':''),
        why:how==='exact'?'Unpaid bill of '+p.vendor.name+' with exactly this amount':how==='billno'?'Bill number '+p.allocations[0].invoiceNo+' is in the narration':how==='billno+tds'?'Bill number in the narration; the difference is the vendor’s TDS':how==='tds'?'Bill balance less the vendor’s TDS rate equals this payment':'Bill number in the narration — part payment',apply:{type:'link',plan:p}};return;}
    if(!cr&&ppBy[x.id]){const p=ppBy[x.id];out[x.id]={conf:'high',label:p.what+' → '+p.emp.name+' ('+RPT_MONTHS[p.month].slice(0,3)+')',why:'Employee named in the narration; amount equals what is due',apply:{type:'pay',plan:p}};return;}
    const ln=typeof bankLearnedNatureFor==='function'?bankLearnedNatureFor(learned,{description:d,credit:x.credit}):null;
    if(ln&&(cr?BANK_CREDIT_NATURES.has(ln):!/Settlement$|^Collection$|^Interest$/.test(ln))){const p={nature:ln};if(ln==='Card Settlement'||ln==='UPI Settlement')p.cradleeDate=setdt||prev;
      P('mid',ln+(p.cradleeDate?' · '+p.cradleeDate:''),p,'Lines with this narration were mapped as '+ln+' before');return;}
    if(!cr){const v=findVendorMatch(d,vendors);if(v){P('mid','Vendor Payment → '+v.name,{nature:'Vendor Payment',vendorOverride:v.name},'Vendor named in the narration');return;}}
    if(cr){
      if(/cash dep|by cash|cash deposit|csh dep/.test(lo))return P('mid','Cash Deposit',{nature:'Cash Deposit'},'Cash deposit narration');
      if(/int\.?\s?pd|interest|int cr/.test(lo))return P('mid','Interest',{nature:'Interest'},'Interest narration');
      if(/upi/.test(lo))return P('low','UPI Settlement · '+prev,{nature:'UPI Settlement',cradleeDate:prev},'UPI credit — sale date taken as the day before');
      if(/refund|reversal|\brev\b|rvsl/.test(lo))return P('low','Refund',{nature:'Refund'},'Refund / reversal narration');
    }else{
      if(/chrg|charges|\bsms\b|\bamc\b|gst on|annual fee|card fee|min bal|service charge/.test(lo))return P('mid','Bank Charges',{nature:'Bank Charges'},'Bank charge narration');
      if(/\btds\b|dtax|cbdt|oltas/.test(lo))return P('mid','TDS',{nature:'TDS'},'Tax payment narration');
      if(/esic/.test(lo))return P('low','ESIC Payment',{nature:'ESIC Payment'},'ESIC narration');
      if(/epfo|\bpf\b|provident/.test(lo))return P('low','PF Payment',{nature:'PF Payment'},'PF narration');
      if(/\bgst\b|gstn|cgst|sgst/.test(lo))return P('low','GST',{nature:'GST'},'GST narration');
      if(/salary|\bsal\b/.test(lo))return P('low','Salary',{nature:'Salary'},'Salary narration — use 👤 Pay to settle it');
    }
  });
  // learn from changes: a suggestion changed by hand before (and not accepted since) is weakened, twice → dropped
  Object.keys(out).forEach(id=>{const x=list.find(z=>String(z.id)===String(id));const s=out[id];const n=suggestionNature(s);if(!x||!n)return;
    const f=fb[x.side+'|'+bmapSig(x.description)+'|'+n];if(!f||f.rej<=f.acc)return;
    if(f.rej-f.acc>=2){delete out[id];return;}s.conf=s.conf==='high'?'mid':'low';s.why+=' · you changed this suggestion before';});
  return out;
}

// ── Mapping summary Excel ──
async function buildBankMappingSummaryWorkbook(sid,year,month){
  await loadExcelJS();
  const wb=new ExcelJS.Workbook();wb.creator='SalonOS';wb.created=new Date();wb.calcProperties.fullCalcOnLoad=true;
  const lbl=RPT_MONTHS[month]+' '+year;const salon=getSalonRecordById(sid)||(typeof SALONS!=='undefined'?SALONS.find(s=>s.id===sid):null)||{name:'Outlet'};
  const K=makeXlKit(wb,rptShort(salon)+' — Bank mapping '+lbl);const R2=n=>Math.round((Number(n)||0)*100)/100;const N2='#,##0.00;[Red]-#,##0.00;"–"';
  const pre=year+'-'+String(month+1).padStart(2,'0');const rows=bankRowsFor(sid).filter(r=>r&&String(toISO(r.transactionDate)||'').startsWith(pre)&&(Number(r.credit)>0||Number(r.debit)>0))
    .sort((a,b)=>String(toISO(a.transactionDate)).localeCompare(String(toISO(b.transactionDate))));
  const vendors=loadVendors(sid)||[];const pushed=loadTallyPushed(sid);const J=bankMapJournal(sid);
  const ws=K.sheet('Bank lines','FF00838F'),wsS=K.sheet('Summary');const COLS=14;
  K.banner(ws,'Bank lines and their mapping — '+rptShort(salon)+' · '+lbl,'Every bank line of the month with what it is mapped to, who mapped it in the mapping pop-up, and whether it has been sent to Tally.',COLS);
  K.head(ws,4,['Date','Description','Ref','Debit ₹','Credit ₹','Status','Nature','Vendor / employee','Linked bills','Pay / advance','Cradlee date','Mapped by','Mapped on','Tally'],4);
  let r=5;const st=r;
  rows.forEach(x=>{const prob=bankLineProblem(x,vendors);const je=J.filter(e=>e.rowId===x.id&&!e.undone).pop();
    const ov=String(x.vendorOverride||'');const who=ov.startsWith('EMP:')?((x.linkedEmployeePay||x.linkedAdvance||[])[0]||{}).employeeName||ov.slice(4):ov&&ov!=='__none__'?ov:(Number(x.debit)>0&&x.nature==='Vendor Payment'?((findVendorMatch(x.description,vendors)||{}).name||''):'');
    const pay=Array.isArray(x.linkedEmployeePay)?x.linkedEmployeePay.map(e=>e.employeeName+' '+[e.salary?'salary':'',e.incentive?'incentive':'',e.dailyIncentive?'daily inc.':''].filter(Boolean).join('+')).join('; '):Array.isArray(x.linkedAdvance)?x.linkedAdvance.map(a=>'Advance '+a.advanceId+' '+a.employeeName).join('; '):'';
    const p=pushed.bank[x.id];const tally=!p?'Not sent':(p.sig&&p.sig!==tallyBankSig(x)?'Changed since sent':'Sent');
    K.put(ws,r,1,x.transactionDate||'');K.put(ws,r,2,x.description||'');K.put(ws,r,3,x.refNo||'');K.put(ws,r,4,R2(x.debit),N2);K.put(ws,r,5,R2(x.credit),N2);
    K.put(ws,r,6,prob?'Unmapped — '+prob:'Mapped');K.put(ws,r,7,x.nature||'');K.put(ws,r,8,who);K.put(ws,r,9,String(x.linkedInvoice||'').split(',').map(k=>k.split('|').pop()).filter(Boolean).join(', '));
    K.put(ws,r,10,pay);K.put(ws,r,11,x.cradleeDate||'');K.put(ws,r,12,je?je.lastBy||je.by:'');K.put(ws,r,13,je?new Date(je.lastAt||je.at).toLocaleString('en-IN'):'');K.put(ws,r,14,tally);
    K.style(ws,r,COLS);ws.getCell(r,2).alignment={wrapText:true,vertical:'top'};
    if(prob)ws.getCell(r,6).font={color:{argb:'FFC0392B'},bold:true,size:10};if(tally!=='Sent')ws.getCell(r,14).font={color:{argb:'FFD08A12'},size:10};r++;});
  if(r===st){K.put(ws,r,1,'No bank lines this month');K.style(ws,r,COLS);r++;}
  const end=r-1;K.put(ws,r,1,'Total');K.put(ws,r,4,{f:'SUM(D'+st+':D'+end+')',r:0},N2);K.put(ws,r,5,{f:'SUM(E'+st+':E'+end+')',r:0},N2);K.style(ws,r,COLS,'grand');
  ws.autoFilter={from:{row:4,column:1},to:{row:Math.max(4,end),column:COLS}};
  ws.columns=[{width:11},{width:42},{width:14},{width:12},{width:12},{width:24},{width:18},{width:20},{width:18},{width:24},{width:11},{width:14},{width:17},{width:14}];K.setup(ws,true,4);
  // Summary by nature
  const natures=[...new Set(rows.map(x=>x.nature||'(no Nature)'))].sort();const bl="'Bank lines'!";
  K.banner(wsS,'Bank mapping — '+rptShort(salon)+' · '+lbl,rows.length+' bank lines. Totals by Nature are SUMIF formulas on the Bank lines sheet.',6);
  K.head(wsS,4,['Nature','Lines','Debit ₹','Credit ₹','',''],2);let rr=5;
  natures.forEach(n=>{const key=n==='(no Nature)'?'':n;K.put(wsS,rr,1,n);K.put(wsS,rr,2,rows.filter(x=>(x.nature||'')===key).length,'0');
    K.put(wsS,rr,3,{f:'SUMIF('+bl+'G'+st+':G'+end+',"'+key+'",'+bl+'D'+st+':D'+end+')',r:0},N2);K.put(wsS,rr,4,{f:'SUMIF('+bl+'G'+st+':G'+end+',"'+key+'",'+bl+'E'+st+':E'+end+')',r:0},N2);
    K.style(wsS,rr,6);if(!key)wsS.getCell(rr,1).font={color:{argb:'FFC0392B'},bold:true};rr++;});
  K.put(wsS,rr,1,'Total');K.put(wsS,rr,2,{f:'SUM(B5:B'+(rr-1)+')',r:0},'0');K.put(wsS,rr,3,{f:'SUM(C5:C'+(rr-1)+')',r:0},N2);K.put(wsS,rr,4,{f:'SUM(D5:D'+(rr-1)+')',r:0},N2);K.style(wsS,rr,6,'grand');
  const rd=bankMonthReadiness(sid,year,month);rr+=2;K.note(wsS,rr,rd.mapped+' of '+rd.total+' lines mapped ('+rd.pct+'%).'+(rd.total-rd.mapped?' Still unmapped: '+rd.unDebit+' debit, '+rd.unCredit+' credit.':' The month is ready to be marked Final.'),6);
  wsS.columns=[{width:30},{width:8},{width:15},{width:15},{width:4},{width:4}];K.setup(wsS,false,0);
  return{wb,filename:'Bank_Mapping_'+rptFile(rptShort(salon))+'_'+pre+'.xlsx'};
}

// Sends the given mapped bank lines (and the vendor bills linked to them) to Tally through the
// Tally Connector — the same routine as Tally Export → Sync, limited to these lines.
async function sendBankLinesToTally(sid,rowIds){
  const cfg=loadTallyConnectorCfg();const rows=bankRowsFor(sid).filter(r=>rowIds.includes(r.id));
  const inv=loadVendorInvoices(sid)||[];const invIds=new Set();
  rows.forEach(r=>{String(r.linkedInvoice||'').split(',').filter(Boolean).forEach(k=>{const [vid,no]=k.split('|');const i=inv.find(z=>String(z.vendorId)===vid&&String(z.invoiceNo)===no);if(i)invIds.add(i.id);});
    inv.forEach(i=>{if((i.payments||[]).some(q=>q.linkId==='bank-'+r.id))invIds.add(i.id);});});
  const res=await tallySyncVouchers(sid,cfg,{company:cfg.company,only:{inv:invIds,bank:new Set(rows.map(r=>r.id))}});
  try{addTallyLog(sid,{action:'Send from mapping pop-up',sent:res.sent,created:res.ledgersCreated,errors:res.failed.length,detail:res.failed.slice(0,10)});}catch(e){}
  return res;
}

// ═══ The pop-up ═══
function UnmappedLinesPopup({sid,getList,getRows,title,intro,onClose,onNavTab,onMap,onMapped,onInvoicesChanged,month:monthCtx}){
  const h=React.createElement;const [,setTick]=useState(0);const [side,setSide]=useState('All');
  const [linkFor,setLinkFor]=useState(null);const [alloc,setAlloc]=useState({});const [linkErr,setLinkErr]=useState('');const [nb,setNb]=useState(null);
  const [payFor,setPayFor]=useState(null);const [payErr,setPayErr]=useState('');
  const [advFor,setAdvFor]=useState(null);const [advErr,setAdvErr]=useState('');
  const [ticked,setTicked]=useState(()=>new Set());const [linkPlan,setLinkPlan]=useState(null);const [payPlan,setPayPlan]=useState(null);const [advPlan,setAdvPlan]=useState(null);
  const [advDeduct,setAdvDeduct]=useState('Salary');const [advOver,setAdvOver]=useState(false);const [payYM,setPayYM]=useState('auto');const [splitOld,setSplitOld]=useState(false);
  const [bulk,setBulk]=useState({nature:'',vendor:'',dateMode:'setdt',date:''});const [msg,setMsg]=useState(null); // {text, kind:'ok'|'warn'}
  const [q,setQ]=useState('');const [minA,setMinA]=useState('');const [maxA,setMaxA]=useState('');const [missing,setMissing]=useState('All');
  const [grouped,setGrouped]=useState(false);const [openGroups,setOpenGroups]=useState(()=>new Set());
  const [cur,setCur]=useState(0);const [showKeys,setShowKeys]=useState(false);const [showRules,setShowRules]=useState(false);const [showJournal,setShowJournal]=useState(true);
  const [rulePrompt,setRulePrompt]=useState(null);const [newRule,setNewRule]=useState(null);const [inclMid,setInclMid]=useState(false);
  const [tallyBusy,setTallyBusy]=useState(false);
  const [narrow,setNarrow]=useState(()=>typeof window!=='undefined'&&window.innerWidth<760);
  const rootRef=useRef(null);
  useEffect(()=>{const f=()=>setNarrow(window.innerWidth<760);window.addEventListener('resize',f);if(rootRef.current)rootRef.current.focus();return()=>window.removeEventListener('resize',f);},[]);

  const rowsAll=getRows?getRows():bankRowsFor(sid);
  const list=getList();
  const vendors=(loadVendors(sid)||[]).filter(v=>v&&v.status!=='Inactive').sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const allVendors=loadVendors(sid)||[];
  const m=n=>n?'₹'+Number(n).toLocaleString('en-IN',{maximumFractionDigits:2}):'';
  const sugg=bankSuggestionsFor(sid,list,rowsAll);
  const dups=bankDuplicateMap(sid,rowsAll);
  const ready=monthCtx?bankMonthReadiness(sid,monthCtx.year,monthCtx.month,rowsAll):null;
  const dr=list.filter(x=>x.side==='Debit'),cr=list.filter(x=>x.side==='Credit');const sum=(a,k)=>a.reduce((t,x)=>t+x[k],0);
  const qn=q.trim().toLowerCase();
  const shown=list.filter(x=>(side==='All'||x.side===side)
    &&(!qn||(x.description||'').toLowerCase().includes(qn)||String(x.date).includes(qn)||String(Math.round(x.debit||x.credit)).includes(qn.replace(/[^0-9]/g,'')||'¤'))
    &&(minA===''||(x.debit||x.credit)>=Number(minA))&&(maxA===''||(x.debit||x.credit)<=Number(maxA))
    &&(missing==='All'||(missing==='Suggested'?!!sugg[x.id]:missing==='Duplicate'?!!dups[x.id]:x.problem===missing))).slice(0,400);
  const rowNow=id=>(getRows?getRows():bankRowsFor(sid)).find(r=>r.id===id);
  const sideOk=(x,n)=>x.side==='Credit'?BANK_CREDIT_NATURES.has(n):!/Settlement$|^Collection$|^Interest$/.test(n);
  const dmyOf=iso=>iso?iso.split('-').reverse().join('/'):'';
  const refresh=(inv)=>{setTick(t=>t+1);if(inv&&onInvoicesChanged)onInvoicesChanged();if(onMapped)onMapped();};
  const say=(text,kind)=>setMsg({text,kind:kind||'ok'});
  const dupOk=x=>!dups[x.id]||window.confirm('This line looks like a duplicate of '+dups[x.id].map(r=>r.transactionDate+' '+m(Number(r.debit)||Number(r.credit))).join(', ')+' (same amount and payee within 3 days).\n\nMap it anyway?');

  // ── single-line operations ──
  const map=(x,patch,opts)=>{
    if(patch.nature&&!(opts&&opts.noRulePrompt)){const s0=sugg[x.id];const n0=suggestionNature(s0);if(n0&&n0!==patch.nature)noteBankFeedback(sid,x,n0,false);}
    if(!mapApprovalOk(sid,x,patch.nature?'Nature '+patch.nature:patch.vendorOverride?'Vendor '+patch.vendorOverride:'Cradlee date'))return false;
    journalBankMapping(sid,rowNow(x.id),patch.nature!==undefined?'Nature: '+(patch.nature||'blank'):patch.vendorOverride?'Vendor: '+patch.vendorOverride:patch.cradleeDate?'Cradlee date '+patch.cradleeDate:'Changed');
    if(patch.nature&&(patch.nature==='Card Settlement'||patch.nature==='UPI Settlement')&&!x.cradleeDate&&!patch.cradleeDate){const sd=settlementDateFromNarration(x.description);if(sd)patch={...patch,cradleeDate:sd};}
    if(onMap)onMap(x.id,patch);else saveBankLineMapping(sid,x.id,patch);
    if(patch.nature&&!(opts&&opts.noRulePrompt)){const sg=bmapSig(x.description);if(sg.length>=6&&!matchBankRule(sid,{description:x.description,credit:x.credit}))setRulePrompt({sig:sg,side:x.side,nature:patch.nature,vendorOverride:patch.vendorOverride||'',example:x.description});}
    refresh();return true;
  };
  const billBal=inv=>Math.round(((Number(inv.amount)||0)-(inv.payments||[]).reduce((t,q2)=>t+(Number(q2.paidAmount)||0),0))*100)/100;
  const vendorOfLine=x=>x.vendorOverride&&x.vendorOverride!=='__none__'?allVendors.find(v=>v.name===x.vendorOverride)||null:(x.vendorOverride==='__none__'?null:findVendorMatch(x.description,allVendors));
  const openBillsOf=v=>(loadVendorInvoices(sid)||[]).filter(inv=>inv&&String(inv.vendorId)===String(v.id)&&inv.docNature!=='Performa Invoice'&&billBal(inv)>0.5).sort((a,b)=>String(toISO(a.invoiceDate)||'').localeCompare(String(toISO(b.invoiceDate)||'')));
  const closePanels=()=>{setLinkFor(null);setPayFor(null);setAdvFor(null);setNb(null);};
  const startLink=x=>{closePanels();const v=vendorOfLine(x);if(!v){setLinkErr('');setLinkFor({x,v:null});return;}
    const bills=openBillsOf(v);const a={};allocateOldestFirst(bills.map(b=>({id:b.id,balance:billBal(b)})),x.debit).forEach(r=>{if(r.alloc>0)a[r.id]=String(r.alloc);});
    setAlloc(a);setLinkErr('');setNb(bills.length?null:{invoiceNo:'',invoiceDate:toISO(x.date)||'',amount:String(x.debit),category:v.cat||defaultVendorCategoryFor(sid),gstRate:'0'});setLinkFor({x,v});};
  const doLink=()=>{const {x,v}=linkFor;if(!dupOk(x)||!mapApprovalOk(sid,x,'Link bills of '+v.name))return;const row=rowNow(x.id)||{id:x.id,debit:x.debit,transactionDate:x.date};
    const err=linkBankLineToBills(sid,row,v,Object.keys(alloc).map(id=>({id,amount:Number(alloc[id])||0})),onMap);if(err){setLinkErr(err);return;}
    journalBankMapping(sid,row,'Linked to bills of '+v.name);closePanels();say('Linked to bills of '+v.name+'.');refresh(true);};
  const createAndLink=()=>{const {x,v}=linkFor;const amt=Number(nb.amount)||0;const others=Object.values(alloc).reduce((t,a)=>t+(Number(a)||0),0);
    if(others+amt>x.debit+1){setLinkErr('Existing bills '+m(others)+' + new bill '+m(amt)+' is more than the bank debit '+m(x.debit)+'.');return;}
    if(!dupOk(x)||!mapApprovalOk(sid,x,'New bill and link'))return;
    const row=rowNow(x.id)||{id:x.id,debit:x.debit,transactionDate:x.date};
    const res=createBillForBankLine(sid,v,row,nb);if(res.error){setLinkErr(res.error);return;}
    const err=linkBankLineToBills(sid,row,v,[...Object.keys(alloc).map(id=>({id,amount:Number(alloc[id])||0})),{id:res.inv.id,amount:amt}],onMap);
    if(err){setLinkErr('Bill '+res.inv.invoiceNo+' was added, but not linked: '+err);refresh(true);return;}
    journalBankMapping(sid,row,'New bill '+res.inv.invoiceNo+' and linked',{createdInvoices:[res.inv.id]});closePanels();say('Bill '+res.inv.invoiceNo+' added and linked.');refresh(true);};
  const empLinesFor=(x,year,month)=>{
    const emps=(getEmployeesForMonth(year,month,sid)||[]).filter(e=>e&&e.status!=='Inactive');const hit=findEmployeeSmart(x.description,emps);const rn=getRows?getRows():bankRowsFor(sid);
    const lines=emps.map(e=>{const di={};DAILY_INCENTIVE_CATEGORIES_ALL.forEach(c=>{const os=Math.max(0,employeeDailyIncentiveCategoryOutstandingFor(sid,e.id,year,month,c)-dailyIncentiveSettledOnBank(sid,e.id,year,month,c,x.id,rn));if(os>0.5)di[c]={os:Math.round(os*100)/100,sel:false,amt:''};});
      return{employeeId:e.id,employeeName:e.name,salaryOS:employeeSalaryOutstandingFor(sid,e.id,year,month),incentiveOS:employeeIncentiveOutstandingFor(sid,e.id,year,month),di,sal:false,inc:false,salAmt:'',incAmt:'',hit:!!hit&&hit.id===e.id};})
      .filter(l=>l.salaryOS>0||l.incentiveOS>0||Object.keys(l.di).length||l.hit).sort((a,b)=>(b.hit?1:0)-(a.hit?1:0)||a.employeeName.localeCompare(b.employeeName));
    const h0=lines.find(l=>l.hit);
    if(h0){if(h0.salaryOS>0){h0.sal=true;h0.salAmt=String(Math.min(h0.salaryOS,x.debit));}else if(h0.incentiveOS>0){h0.inc=true;h0.incAmt=String(Math.min(h0.incentiveOS,x.debit));}
      else{let left=x.debit;Object.keys(h0.di).forEach(c=>{const a=Math.min(h0.di[c].os,left);if(a>0){h0.di[c]={...h0.di[c],sel:true,amt:String(a)};left-=a;}});}}
    return lines;};
  const startPay=x=>{closePanels();const iso=toISO(x.date)||'';const d=iso?new Date(iso+'T00:00:00'):new Date();const p=d.getDate()<=15?new Date(d.getFullYear(),d.getMonth()-1,1):new Date(d.getFullYear(),d.getMonth(),1);
    setPayErr('');setPayFor({x,year:p.getFullYear(),month:p.getMonth(),lines:empLinesFor(x,p.getFullYear(),p.getMonth())});};
  const setPayLine=(id,patch)=>setPayFor(pf=>({...pf,lines:pf.lines.map(l=>l.employeeId===id?{...l,...patch}:l)}));
  const setPayDi=(id,cat,patch)=>setPayFor(pf=>({...pf,lines:pf.lines.map(l=>l.employeeId===id?{...l,di:{...l.di,[cat]:{...l.di[cat],...patch}}}:l)}));
  const doPay=()=>{const {x,year,month,lines}=payFor;if(!dupOk(x)||!mapApprovalOk(sid,x,'Pay employees'))return;const row=rowNow(x.id)||{id:x.id,debit:x.debit,transactionDate:x.date};
    const err=settleBankLineToEmployees(sid,row,year,month,lines.map(l=>({employeeId:l.employeeId,employeeName:l.employeeName,salaryAmt:l.sal?l.salAmt:0,incentiveAmt:l.inc?l.incAmt:0,
      dailyIncentiveByCat:Object.fromEntries(Object.entries(l.di||{}).filter(([,d])=>d.sel).map(([c,d])=>[c,Number(d.amt)||0]))})),onMap);
    if(err){setPayErr(err);return;}
    journalBankMapping(sid,row,'Paid employees ('+RPT_MONTHS[month].slice(0,3)+' '+year+')');closePanels();say('Settled to employees for '+RPT_MONTHS[month]+' '+year+'.');refresh();};
  const advEmps=()=>{const t=new Date();return(getEmployeesForMonth(t.getFullYear(),t.getMonth(),sid)||[]).filter(e=>e&&e.status!=='Inactive').sort((a,b)=>String(a.name).localeCompare(String(b.name)));};
  const nextYM=()=>{const d=new Date();d.setMonth(d.getMonth()+1,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');};
  const advLine=(e,amt)=>{const c=advanceCandidatesForEmp(sid,e.name);return{employeeId:e.id,employeeName:e.name,amount:amt>0?String(Math.round(amt*100)/100):'',deductFrom:'Salary',deductionStart:nextYM(),reason:'',linkExistingId:c.length===1&&Math.abs((Number(c[0].outstanding!=null?c[0].outstanding:c[0].amount)||0)-amt)<1?c[0].id:''};};
  const startAdv=x=>{closePanels();const hit=findEmployeeSmart(x.description,advEmps());setAdvErr('');setAdvFor({x,lines:hit?[advLine(hit,x.debit)]:[]});};
  const setAdvLine=(id,patch)=>setAdvFor(a=>({...a,lines:a.lines.map(l=>l.employeeId===id?{...l,...patch}:l)}));
  const doAdv=()=>{const {x,lines}=advFor;if(!dupOk(x)||!mapApprovalOk(sid,x,'Advance'))return;const row=rowNow(x.id)||{id:x.id,debit:x.debit,transactionDate:x.date};
    const snap=JSON.parse(JSON.stringify(loadAdvances(sid)||[]));const err=recordBankLineAdvances(sid,row,lines,onMap);if(err){setAdvErr(err);return;}
    journalBankMapping(sid,row,'Advance recorded',{advBefore:snap});closePanels();say('Advance recorded.');refresh();};

  // ── suggestions ──
  const accept=(x,s,silent)=>{
    if(!s)return false;
    if(s.apply.type!=='patch'&&!silent&&!dupOk(x))return false;
    if(!mapApprovalOk(sid,x,s.label))return false;
    const err=applyBankSuggestion(sid,x,s,onMap,getRows?getRows():bankRowsFor(sid));if(err){say(err,'warn');return false;}
    noteBankFeedback(sid,x,suggestionNature(s),true);refresh(s.apply.type==='link');return true;
  };
  const acceptable=list.filter(x=>sugg[x.id]&&(sugg[x.id].conf==='high'||(inclMid&&sugg[x.id].conf==='mid')));
  const acceptAll=()=>{
    const go=acceptable.filter(x=>!dups[x.id]&&!mapApprovalNeeded(sid,x));const held=acceptable.length-go.length;
    if(!go.length){say('Nothing to accept'+(held?' — '+held+' line(s) are possible duplicates or need approval; accept those one by one.':'.'),'warn');return;}
    if(!window.confirm('Accept '+go.length+' suggestion'+(go.length===1?'':'s')+'?'+(held?'\n\n'+held+' possible duplicate(s) / approval line(s) are left for you to check one by one.':'')))return;
    let ok=0;go.forEach(x=>{if(accept(x,sugg[x.id],true))ok++;});
    say(ok+' suggestion'+(ok===1?'':'s')+' accepted'+(held?' · '+held+' left to check by hand':'')+'.');
  };

  // ── bulk ──
  const tickedList=list.filter(x=>ticked.has(x.id));const tickedDr=tickedList.filter(x=>x.side==='Debit');
  const toggleSel=id=>setTicked(p=>{const n=new Set(p);if(n.has(id))n.delete(id);else n.add(id);return n;});
  const selectSimilar=x=>{const sg=bmapSig(x.description);setTicked(p=>{const n=new Set(p);list.forEach(y=>{if(y.side===x.side&&bmapSig(y.description)===sg)n.add(y.id);});return n;});};
  const applyBulkTo=(picked,n,vendor,dateMode,date)=>{
    let done=0,skipped=0,noDate=0,needAppr=0;
    picked.forEach(x=>{
      if(!sideOk(x,n)){skipped++;return;}if(mapApprovalNeeded(sid,x)){needAppr++;return;}
      const patch={nature:n,aiTagged:false};if(n==='Vendor Payment'&&vendor)patch.vendorOverride=vendor;
      if(n==='Card Settlement'||n==='UPI Settlement'){let d=dateMode==='setdt'?settlementDateFromNarration(x.description):'';if(!d&&dateMode!=='pick')d=bmapPrevDay(x.date);if(dateMode==='pick')d=date?dmyOf(date):'';if(d)patch.cradleeDate=d;else noDate++;}
      journalBankMapping(sid,rowNow(x.id),'Nature: '+n+(patch.vendorOverride?' · '+patch.vendorOverride:''));if(onMap)onMap(x.id,patch);else saveBankLineMapping(sid,x.id,patch);done++;});
    try{logAuditEvent(sid,{entity:'Bank Statement',entityId:'bulk',action:'Mapped in bulk',summary:done+' line(s) set to '+n+(vendor?' — '+vendor:'')});}catch(e){}
    return{done,skipped,noDate,needAppr};
  };
  const applyBulk=()=>{const n=bulk.nature;if(!n){say('Choose the Nature to apply.','warn');return;}
    if(n==='Vendor Payment'&&!bulk.vendor&&!window.confirm('No vendor chosen — lines whose narration does not name a known vendor will stay unmapped. Continue?'))return;
    const r=applyBulkTo(tickedList,n,bulk.vendor,bulk.dateMode,bulk.date);setTicked(new Set());refresh();
    say(r.done+' line'+(r.done===1?'':'s')+' set to '+n+(r.skipped?' · '+r.skipped+' skipped (wrong side for this Nature)':'')+(r.needAppr?' · '+r.needAppr+' need approval — map them one by one':'')+(r.noDate?' · '+r.noDate+' still need a Date as per Cradlee':'')+'.',r.skipped||r.needAppr||r.noDate?'warn':'ok');};
  const makePlan=sp=>{setPayPlan(null);setAdvPlan(null);setLinkPlan(planBulkBillLinks(sid,tickedList,sp));};
  const makePayPlan=ym=>{setAdvPlan(null);setLinkPlan(null);const f=ym&&ym!=='auto'?{year:Number(ym.split('-')[0]),month:Number(ym.split('-')[1])}:null;setPayPlan(planBulkEmployeePay(sid,tickedList,f,rowsAll));};
  const makeAdvPlan=df=>{setLinkPlan(null);setPayPlan(null);setAdvOver(false);setAdvPlan(planBulkAdvances(sid,tickedList,df));};
  const runPlans=(items,fn,label)=>{const rn=getRows?getRows():bankRowsFor(sid);let ok=0;const fails=[];
    items.forEach(p=>{if(mapApprovalNeeded(sid,p.x)){fails.push((p.x.date||'')+': needs approval');return;}const row=rn.find(r=>r.id===p.x.id)||{id:p.x.id,debit:p.x.debit,transactionDate:p.x.date};const err=fn(p,row);if(err)fails.push((p.x.date||'')+': '+err);else ok++;});
    setTicked(new Set());say(ok+' '+label+(fails.length?' · not done: '+fails.join('; '):'')+'.',fails.length?'warn':'ok');};
  const runPlan=()=>{runPlans(linkPlan.filter(p=>p.allocations),(p,row)=>{const err=linkBankLineToBills(sid,row,p.vendor,p.allocations.map(a=>({id:a.id,amount:a.amount})),onMap);if(!err)journalBankMapping(sid,row,'Linked to '+p.allocations.map(a=>a.invoiceNo).join(', '));return err;},'payment(s) linked to bills');setLinkPlan(null);refresh(true);};
  const runPayPlan=()=>{runPlans(payPlan.filter(p=>p.what),(p,row)=>{const err=settleBankLineToEmployees(sid,row,p.year,p.month,[{employeeId:p.emp.id,employeeName:p.emp.name,salaryAmt:p.salaryAmt,incentiveAmt:p.incentiveAmt,dailyIncentiveByCat:p.dailyIncentiveByCat}],onMap);if(!err)journalBankMapping(sid,row,p.what+': '+p.emp.name);return err;},'payment(s) settled to employees');setPayPlan(null);refresh();};
  const runAdvPlan=()=>{runPlans(advPlan.filter(p=>p.line&&(!p.over||advOver)),(p,row)=>{const snap=JSON.parse(JSON.stringify(loadAdvances(sid)||[]));const err=recordBankLineAdvances(sid,row,[p.line],onMap,{limitReviewed:true});if(!err)journalBankMapping(sid,row,'Advance: '+p.emp.name,{advBefore:snap});return err;},'advance(s) recorded');setAdvPlan(null);refresh();};

  // ── journal ──
  const J=bankMapJournal(sid).filter(e=>!e.undone).slice(-80).reverse();
  const pushed=loadTallyPushed(sid);
  const tallyOf=e=>{const r=rowNow(e.rowId);const p=pushed.bank[e.rowId];return !p?'Not in Tally':(r&&p.sig&&p.sig!==tallyBankSig(r)?'Changed since sent':'In Tally');};
  const undoEntry=e=>{undoBankMapping(sid,e,rowNow(e.rowId),onMap);say('Undone: '+e.date+' '+m(e.amount)+'.');refresh(true);};
  const notInTally=J.filter(e=>tallyOf(e)!=='In Tally');
  const sendTally=async()=>{
    if(!notInTally.length){say('Every line mapped here is already in Tally.');return;}
    const map2=loadTallyLedgerMap(sid);if(!map2.bankLedger){say('Enter the Bank ledger name on Tally Export first (Ledgers tab).','warn');return;}
    if(!window.confirm('Send '+notInTally.length+' mapped bank line'+(notInTally.length===1?'':'s')+' (and the bills linked to them) to Tally now?\n\nTally and the SalonOS Tally Connector must be running on this computer. Missing ledgers are created first.'))return;
    setTallyBusy(true);
    try{const res=await sendBankLinesToTally(sid,notInTally.map(e=>e.rowId));
      say('Tally: '+res.sent+' voucher'+(res.sent===1?'':'s')+' sent'+(res.ledgersCreated?', '+res.ledgersCreated+' ledger(s) created':'')+(res.failed.length?' · '+res.failed.length+' rejected — see Tally Export → History':'')+'.',res.failed.length?'warn':'ok');}
    catch(err){say('Could not send to Tally: '+(err.message||err)+' — open Tally and start the SalonOS Tally Connector, then try again.','warn');}
    setTallyBusy(false);refresh();};
  const undoAll=()=>{if(!window.confirm('Undo all '+J.length+' mapping'+(J.length===1?'':'s')+'? Bill payments, salary “Paid” and advances made by them are reversed too.'))return;J.forEach(e=>undoBankMapping(sid,e,rowNow(e.rowId),onMap));say(J.length+' mapping(s) undone.');refresh(true);};

  // ── keyboard ──
  const curX=shown[Math.min(cur,shown.length-1)];
  const onKey=e=>{
    const tag=(e.target&&e.target.tagName)||'';const typing=/INPUT|SELECT|TEXTAREA/.test(tag);
    // Esc: leaves a field / closes the side panel or key list first (stopped here so the app does not close the pop-up); otherwise closes the pop-up as usual.
    if(e.key==='Escape'){if(typing){e.stopPropagation();e.target.blur();return;}if(linkFor||payFor||advFor){e.stopPropagation();closePanels();e.preventDefault();return;}if(showKeys||showRules){e.stopPropagation();setShowKeys(false);setShowRules(false);return;}return;}
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){if(ticked.size&&bulk.nature){e.preventDefault();applyBulk();}return;}
    if((e.ctrlKey||e.metaKey)&&(e.key==='z'||e.key==='Z')&&!typing){if(J[0]&&window.confirm('Undo the last mapping?\n\n'+J[0].date+' '+m(J[0].amount)+' — '+J[0].labels.join(', '))){e.preventDefault();undoEntry(J[0]);}return;}
    if(typing||e.ctrlKey||e.metaKey||e.altKey)return;
    const go=i=>{const n=Math.max(0,Math.min(shown.length-1,i));setCur(n);setTimeout(()=>{const el=rootRef.current&&rootRef.current.querySelector('[data-bm-row="'+(shown[n]&&shown[n].id)+'"]');if(el)el.scrollIntoView({block:'nearest'});},0);};
    if(e.key==='ArrowDown'||e.key==='j'){e.preventDefault();go(cur+1);}
    else if(e.key==='ArrowUp'||e.key==='k'){e.preventDefault();go(cur-1);}
    else if(e.key===' '&&curX){e.preventDefault();toggleSel(curX.id);}
    else if(e.key==='Enter'&&curX&&sugg[curX.id]){e.preventDefault();accept(curX,sugg[curX.id]);}
    else if((e.key==='n'||e.key==='N')&&curX){e.preventDefault();const el=rootRef.current.querySelector('[data-bm-row="'+curX.id+'"] select');if(el)el.focus();}
    else if((e.key==='l'||e.key==='L')&&curX&&curX.side==='Debit'){e.preventDefault();startLink(curX);}
    else if((e.key==='p'||e.key==='P')&&curX&&curX.side==='Debit'){e.preventDefault();startPay(curX);}
    else if((e.key==='a'||e.key==='A')&&curX&&curX.side==='Debit'){e.preventDefault();startAdv(curX);}
    else if(e.key==='s'&&curX){e.preventDefault();selectSimilar(curX);}
    else if(e.key==='?'){setShowKeys(v=>!v);}
  };

  // ── styles ──
  const C={chip:{display:'inline-flex',alignItems:'center',gap:5,padding:'2px 8px',borderRadius:999,fontSize:11,fontWeight:600,whiteSpace:'nowrap'},
    tag:(c,bg)=>({display:'inline-block',padding:'1px 6px',borderRadius:4,fontSize:10,fontWeight:700,letterSpacing:'.04em',color:c,background:bg}),
    amt:{fontVariantNumeric:'tabular-nums',fontFamily:'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',textAlign:'right',whiteSpace:'nowrap',fontWeight:600},
    sel:{padding:'4px 6px',fontSize:12,minWidth:150,height:30},
    th:{position:'sticky',top:0,zIndex:1,background:'var(--th-bg, var(--bg3))',fontSize:10.5,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text3)',padding:'8px 8px',textAlign:'left',borderBottom:'1px solid var(--border2)'},
    td:{padding:'7px 8px',borderBottom:'1px solid var(--border)',verticalAlign:'middle'},
    panel:{border:'1px solid var(--border2)',borderRadius:10,padding:12,marginBottom:10,background:'var(--bg3)'}};
  const sideTag=x=>x.side==='Debit'?h('span',{style:C.tag('#b35c00','rgba(224,138,18,0.14)')},'DR'):h('span',{style:C.tag('#1f7a3a','rgba(46,125,50,0.13)')},'CR');
  const natListFor=x=>BANK_MAP_NATURES.filter(n=>x.side==='Credit'?BANK_CREDIT_NATURES.has(n)||n===x.nature:!/Settlement$|^Collection$|^Interest$/.test(n)||n===x.nature);
  const suggChip=(x,compact)=>{const s=sugg[x.id];if(!s)return null;
    return h('div',{style:{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}},
      h('span',{title:BMAP_CONF_LABEL[s.conf]+' — '+s.why,style:{...C.chip,background:'var(--bg3)',border:'1px solid var(--border2)',color:'var(--text2)',maxWidth:compact?'100%':280,overflow:'hidden',textOverflow:'ellipsis'}},
        h('span',{style:{width:8,height:8,borderRadius:'50%',background:BMAP_DOT[s.conf],flexShrink:0}}),s.label),
      h('button',{className:'btn btn-primary btn-sm',style:{padding:'2px 9px',fontSize:11},title:'Accept (Enter)',onClick:()=>accept(x,s)},'✓ Accept'));};
  const actionBtns=x=>x.side!=='Debit'?null:h('div',{style:{display:'flex',gap:4}},
    (!x.nature||x.nature==='Vendor Payment')&&h('button',{className:'btn btn-ghost btn-sm',style:{padding:'2px 7px',fontSize:11},title:'Link bill (L)',onClick:()=>startLink(x)},'🔗 Bill'),
    (!x.nature||['Salary','Incentive','Daily Incentive'].includes(x.nature))&&h('button',{className:'btn btn-ghost btn-sm',style:{padding:'2px 7px',fontSize:11},title:'Pay employees (P)',onClick:()=>startPay(x)},'👤 Pay'),
    (!x.nature||x.nature==='Advance Salary')&&h('button',{className:'btn btn-ghost btn-sm',style:{padding:'2px 7px',fontSize:11},title:'Advance (A)',onClick:()=>startAdv(x)},'💵 Adv'));
  const mapCtl=x=>h('div',{style:{display:'flex',flexDirection:'column',gap:4}},
    h('select',{className:'form-control',style:C.sel,value:x.nature,onChange:e=>map(x,{nature:e.target.value,aiTagged:false})},h('option',{value:''},'Nature…'),natListFor(x).map(n=>h('option',{key:n,value:n},n))),
    x.side==='Debit'&&x.nature==='Vendor Payment'&&h('select',{className:'form-control',style:C.sel,value:x.vendorOverride&&x.vendorOverride!=='__none__'?x.vendorOverride:'',onChange:e=>e.target.value&&map(x,{vendorOverride:e.target.value})},h('option',{value:''},'Vendor…'),vendors.map(v=>h('option',{key:v.id,value:v.name},v.name))),
    x.side==='Credit'&&(x.nature==='Card Settlement'||x.nature==='UPI Settlement')&&h('input',{type:'date',className:'form-control',style:C.sel,value:toISO(x.cradleeDate)||'',title:'Date as per Cradlee',onChange:e=>e.target.value&&map(x,{cradleeDate:dmyOf(e.target.value)})}));
  const dupBadge=x=>dups[x.id]&&h('span',{title:'Possible duplicate of '+dups[x.id].map(r=>r.transactionDate+' '+m(Number(r.debit)||Number(r.credit))+' — '+r.description).join(' | '),style:{...C.tag('#c0392b','rgba(192,57,43,0.12)'),marginLeft:6}},'⚠ DUPLICATE?');
  const activeId=(linkFor||payFor||advFor||{}).x&&(linkFor||payFor||advFor).x.id;

  const rowEl=(x,i)=>h('tr',{key:x.id,'data-bm-row':x.id,onClick:()=>setCur(shown.indexOf(x)),style:{background:x.id===activeId?'rgba(47,95,224,0.10)':ticked.has(x.id)?'rgba(47,95,224,0.05)':(i%2?'var(--bg2)':undefined),outline:curX&&curX.id===x.id?'2px solid rgba(47,95,224,0.45)':'none',outlineOffset:-2}},
    h('td',{style:{...C.td,width:30}},h('input',{type:'checkbox',checked:ticked.has(x.id),onChange:()=>toggleSel(x.id)})),
    h('td',{style:{...C.td,whiteSpace:'nowrap',fontSize:12}},x.date,h('div',null,sideTag(x))),
    h('td',{style:{...C.td,maxWidth:360}},
      h('div',{title:x.description,style:{fontSize:12.5,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:360}},x.description),
      h('div',{style:{display:'flex',alignItems:'center',gap:6,marginTop:3,flexWrap:'wrap'}},
        h('span',{style:{fontSize:10.5,color:'var(--red)',fontWeight:600}},x.problem),dupBadge(x),
        h('button',{className:'btn btn-ghost btn-sm',title:'Tick look-alike lines (S)',style:{padding:'0 6px',fontSize:10.5},onClick:e=>{e.stopPropagation();selectSimilar(x);}},'≈ similar'))),
    h('td',{style:{...C.td,...C.amt}},m(x.debit||x.credit)),
    h('td',{style:{...C.td,minWidth:200}},suggChip(x)||h('span',{style:{fontSize:11,color:'var(--text3)'}},'—')),
    h('td',{style:C.td},h('div',{style:{display:'flex',gap:6,alignItems:'flex-start',flexWrap:'wrap'}},mapCtl(x),actionBtns(x))));
  const cardEl=x=>h('div',{key:x.id,'data-bm-row':x.id,style:{border:'1px solid var(--border2)',borderRadius:12,padding:12,marginBottom:10,background:x.id===activeId?'rgba(47,95,224,0.08)':'var(--bg2)'}},
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}},
      h('label',{style:{display:'flex',alignItems:'center',gap:8}},h('input',{type:'checkbox',checked:ticked.has(x.id),onChange:()=>toggleSel(x.id)}),h('span',{style:{fontSize:12,color:'var(--text3)'}},x.date),sideTag(x)),
      h('span',{style:{...C.amt,fontSize:16}},m(x.debit||x.credit))),
    h('div',{style:{fontSize:13,margin:'6px 0',wordBreak:'break-word'}},x.description),
    h('div',{style:{fontSize:11,color:'var(--red)',fontWeight:600,marginBottom:6}},x.problem,dupBadge(x)),
    suggChip(x,true),h('div',{style:{marginTop:8,display:'flex',gap:6,flexWrap:'wrap'}},mapCtl(x),actionBtns(x)));

  // groups of look-alike narrations
  const groups=(()=>{if(!grouped)return null;const g={};shown.forEach(x=>{const k=x.side+'|'+bmapSig(x.description);(g[k]=g[k]||{k,side:x.side,sig:bmapSig(x.description),items:[]}).items.push(x);});return Object.values(g).sort((a,b)=>b.items.length-a.items.length);})();
  const groupHead=g=>{const all=g.items.every(x=>ticked.has(x.id));const open=openGroups.has(g.k);const tot=g.items.reduce((t,x)=>t+(x.debit||x.credit),0);
    return h('tr',{key:'g'+g.k,style:{background:'var(--bg3)'}},
      h('td',{style:C.td},h('input',{type:'checkbox',checked:all,onChange:e=>setTicked(p=>{const n=new Set(p);g.items.forEach(x=>{if(e.target.checked)n.add(x.id);else n.delete(x.id);});return n;})})),
      h('td',{colSpan:2,style:{...C.td,cursor:'pointer'},onClick:()=>setOpenGroups(p=>{const n=new Set(p);if(n.has(g.k))n.delete(g.k);else n.add(g.k);return n;})},
        h('b',{style:{fontSize:12.5}},(open?'▾ ':'▸ ')+g.items.length+' × '),h('span',{style:{fontSize:12.5}},g.items[0].description.slice(0,60)+(g.items[0].description.length>60?'…':'')),' ',g.side==='Debit'?sideTag({side:'Debit'}):sideTag({side:'Credit'})),
      h('td',{style:{...C.td,...C.amt}},m(tot)),
      h('td',{style:C.td},(()=>{const ss=g.items.map(x=>sugg[x.id]).filter(Boolean);return ss.length?h('span',{style:{fontSize:11,color:'var(--text3)'}},ss.length+' suggestion'+(ss.length===1?'':'s')):null;})()),
      h('td',{style:C.td},h('select',{className:'form-control',style:C.sel,value:'',onChange:e=>{const n=e.target.value;if(!n)return;const r=applyBulkTo(g.items,n,'', 'setdt','');refresh();say(r.done+' line(s) of the group set to '+n+(r.needAppr?' · '+r.needAppr+' need approval':'')+'.',r.needAppr?'warn':'ok');}},
        h('option',{value:''},'Set Nature for all '+g.items.length+'…'),BANK_MAP_NATURES.filter(n=>sideOk(g.items[0],n)).map(n=>h('option',{key:n,value:n},n)))));};

  // ── drawer (link / pay / advance) ──
  const drawer=(()=>{
    if(linkFor){const lp=linkFor,x=lp.x;const bills=lp.v?openBillsOf(lp.v):[];const tot=Object.values(alloc).reduce((t,v)=>t+(Number(v)||0),0);
      return h('div',null,
        h('div',{style:{fontSize:15,fontWeight:700,marginBottom:2}},'🔗 Link vendor bill'),
        h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:10}},x.date+' · '+m(x.debit)+' · '+x.description),
        !lp.v?h('div',{style:{fontSize:12.5}},'Choose the vendor first: set Nature to Vendor Payment and pick the vendor on the line, then 🔗 Bill again.')
        :h(React.Fragment,null,
          h('div',{style:{fontSize:12.5,fontWeight:600,marginBottom:6}},lp.v.name+' — allocated '+(m(tot)||'₹0')+(Math.abs(tot-x.debit)>0.5?' · left '+m(Math.max(0,x.debit-tot)):' ✓')),
          !bills.length?h('div',{style:{fontSize:12,color:'var(--text3)'}},'No unpaid bills for this vendor — enter the bill below.')
          :h('table',{style:{width:'100%',fontSize:12}},h('thead',null,h('tr',null,['','Bill','Date','Balance','Pay'].map((t,i)=>h('th',{key:i,style:{textAlign:i>=3?'right':'left',fontSize:10.5,color:'var(--text3)'}},t)))),
            h('tbody',null,bills.map(b=>{const on=alloc[b.id]!=null;return h('tr',{key:b.id},
              h('td',null,h('input',{type:'checkbox',checked:on,onChange:e=>setAlloc(a=>{const n={...a};if(e.target.checked){const used=Object.values(n).reduce((t,v)=>t+(Number(v)||0),0);n[b.id]=String(Math.max(0,Math.min(billBal(b),Math.round((x.debit-used)*100)/100)));}else delete n[b.id];return n;})})),
              h('td',null,b.invoiceNo||'—'),h('td',null,toISO(b.invoiceDate)?dmyOf(toISO(b.invoiceDate)):(b.invoiceDate||'—')),h('td',{style:C.amt},m(billBal(b))),
              h('td',{style:{textAlign:'right'}},h('input',{type:'number',className:'form-control',disabled:!on,value:on?alloc[b.id]:'',onChange:e=>setAlloc(a=>({...a,[b.id]:e.target.value})),style:{width:96,padding:'3px 6px',fontSize:12,textAlign:'right',display:'inline-block'}})));}))),
          nb&&h('div',{style:{marginTop:10,padding:10,border:'1px dashed var(--border2)',borderRadius:8}},
            h('div',{style:{fontSize:12.5,fontWeight:600,marginBottom:6}},'New bill — added paid by this debit'),
            h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}},
              h('label',{style:{fontSize:11,color:'var(--text3)'}},'Bill no.',h('input',{className:'form-control',style:{padding:'4px 6px',fontSize:12},value:nb.invoiceNo,onChange:e=>setNb({...nb,invoiceNo:e.target.value})})),
              h('label',{style:{fontSize:11,color:'var(--text3)'}},'Bill date',h('input',{type:'date',className:'form-control',style:{padding:'4px 6px',fontSize:12},value:nb.invoiceDate,onChange:e=>setNb({...nb,invoiceDate:e.target.value})})),
              h('label',{style:{fontSize:11,color:'var(--text3)'}},'Amount incl. GST ₹',h('input',{type:'number',className:'form-control',style:{padding:'4px 6px',fontSize:12,textAlign:'right'},value:nb.amount,onChange:e=>setNb({...nb,amount:e.target.value})})),
              h('label',{style:{fontSize:11,color:'var(--text3)'}},'GST in it',h('select',{className:'form-control',style:{padding:'4px 6px',fontSize:12},value:nb.gstRate,onChange:e=>setNb({...nb,gstRate:e.target.value})},['0','5','12','18','28'].map(r=>h('option',{key:r,value:r},r==='0'?'None':r+'%')))),
              h('label',{style:{fontSize:11,color:'var(--text3)',gridColumn:'1 / -1'}},'Category',h('select',{className:'form-control',style:{padding:'4px 6px',fontSize:12},value:nb.category,onChange:e=>setNb({...nb,category:e.target.value})},
                h('option',{value:''},'Choose…'),withBizCategories(BANK_BILL_CATEGORIES.concat(isRestaurantOutlet(sid)?[defaultVendorCategoryFor(sid)]:[]),sid).filter((c,i,a)=>a.indexOf(c)===i).map(c=>h('option',{key:c,value:c},c))))),
            Number(nb.gstRate)>0&&h('div',{style:{fontSize:11,color:'var(--text3)',marginTop:4}},'Split as '+(gstSupplyTypeFor(sid,lp.v.gst)==='inter'?'IGST':'CGST + SGST')+' from the GSTINs.'),
            h('div',{style:{display:'flex',gap:8,marginTop:8}},h('button',{className:'btn btn-primary btn-sm',onClick:createAndLink},'Create & link'),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setNb(null)},'Cancel'))),
          linkErr&&h('div',{style:{color:'var(--red)',fontSize:12,marginTop:6}},linkErr),
          h('div',{style:{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}},
            bills.length>0&&!nb&&h('button',{className:'btn btn-primary btn-sm',onClick:doLink},'Link '+(m(tot)||'')),
            !nb&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setNb({invoiceNo:'',invoiceDate:toISO(x.date)||'',amount:String(Math.max(0,Math.round((x.debit-tot)*100)/100)||x.debit),category:lp.v.cat||defaultVendorCategoryFor(sid),gstRate:'0'})},'+ New bill'))));}
    if(payFor){const pp=payFor,x=pp.x;const tot=pp.lines.reduce((t,l)=>t+(l.sal?Number(l.salAmt)||0:0)+(l.inc?Number(l.incAmt)||0:0)+Object.values(l.di||{}).reduce((u,d)=>u+(d.sel?Number(d.amt)||0:0),0),0);
      const months=[0,1,2,3].map(k=>{const d=new Date(new Date().getFullYear(),new Date().getMonth()-k,1);return{y:d.getFullYear(),m:d.getMonth()};});
      const num=(v,dis,on)=>h('input',{type:'number',className:'form-control',disabled:dis,value:v,onChange:e=>on(e.target.value),style:{width:92,padding:'3px 6px',fontSize:12,textAlign:'right',display:'inline-block'}});
      return h('div',null,
        h('div',{style:{fontSize:15,fontWeight:700,marginBottom:2}},'👤 Pay employees'),
        h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:10}},x.date+' · '+m(x.debit)+' · '+x.description),
        h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:8}},h('span',{style:{fontSize:12.5,fontWeight:600}},'Pay for'),
          h('select',{className:'form-control',style:{width:150,padding:'4px 6px',fontSize:12},value:pp.year+'-'+pp.month,onChange:e=>{const [y,mo]=e.target.value.split('-').map(Number);setPayFor(pf=>({...pf,year:y,month:mo,lines:empLinesFor(pf.x,y,mo)}));}},months.map(o=>h('option',{key:o.y+'-'+o.m,value:o.y+'-'+o.m},RPT_MONTHS[o.m]+' '+o.y))),
          h('span',{style:{fontSize:12,color:'var(--text3)'}},'allocated '+(m(tot)||'₹0')+(x.debit-tot>0.5?' · left '+m(x.debit-tot):' ✓'))),
        !pp.lines.length?h('div',{style:{fontSize:12,color:'var(--text3)'}},'Nothing due for '+RPT_MONTHS[pp.month]+' '+pp.year+' (salary shows once attendance is final). Pick another month.')
        :pp.lines.map(l=>h('div',{key:l.employeeId,style:{padding:'8px 0',borderBottom:'1px solid var(--border)'}},
          h('div',{style:{fontWeight:600,fontSize:12.5}},l.employeeName,l.hit&&h('span',{style:{fontSize:10.5,color:'var(--green)',marginLeft:6}},'named in the narration')),
          h('div',{style:{display:'flex',gap:14,flexWrap:'wrap',marginTop:4,fontSize:12}},
            l.salaryOS>0&&h('label',{style:{display:'flex',gap:5,alignItems:'center'}},h('input',{type:'checkbox',checked:l.sal,onChange:e=>setPayLine(l.employeeId,{sal:e.target.checked,salAmt:e.target.checked?String(Math.min(l.salaryOS,Math.max(0,x.debit-tot))||l.salaryOS):''})}),'Salary '+m(l.salaryOS),num(l.sal?l.salAmt:'',!l.sal,v=>setPayLine(l.employeeId,{salAmt:v}))),
            l.incentiveOS>0&&h('label',{style:{display:'flex',gap:5,alignItems:'center'}},h('input',{type:'checkbox',checked:l.inc,onChange:e=>setPayLine(l.employeeId,{inc:e.target.checked,incAmt:e.target.checked?String(Math.min(l.incentiveOS,Math.max(0,x.debit-tot))||l.incentiveOS):''})}),'Incentive '+m(l.incentiveOS),num(l.inc?l.incAmt:'',!l.inc,v=>setPayLine(l.employeeId,{incAmt:v}))),
            Object.entries(l.di||{}).map(([c,d])=>h('label',{key:c,style:{display:'flex',gap:5,alignItems:'center'}},h('input',{type:'checkbox',checked:d.sel,onChange:e=>setPayDi(l.employeeId,c,{sel:e.target.checked,amt:e.target.checked?String(Math.min(d.os,Math.max(0,x.debit-tot))||d.os):''})}),c.replace(' Commission/Incentives','')+' '+m(d.os),num(d.sel?d.amt:'',!d.sel,v=>setPayDi(l.employeeId,c,{amt:v}))))))),
        payErr&&h('div',{style:{color:'var(--red)',fontSize:12,marginTop:6}},payErr),
        h('div',{style:{display:'flex',gap:8,marginTop:10}},pp.lines.length>0&&h('button',{className:'btn btn-primary btn-sm',onClick:doPay},'Record '+(m(tot)||''))));}
    if(advFor){const ap=advFor,x=ap.x;const adv=loadAdvances(sid)||[];const amtOf=l=>{if(l.linkExistingId){const a=adv.find(z=>z.id===l.linkExistingId);return a?Number(a.outstanding!=null?a.outstanding:a.amount)||0:0;}return Number(l.amount)||0;};
      const tot=ap.lines.reduce((t,l)=>t+amtOf(l),0);const emps=advEmps();const inp={padding:'3px 6px',fontSize:12};
      return h('div',null,
        h('div',{style:{fontSize:15,fontWeight:700,marginBottom:2}},'💵 Record advance'),
        h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:10}},x.date+' · '+m(x.debit)+' · '+x.description),
        h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:6}},'allocated '+(m(tot)||'₹0')+(x.debit-tot>0.5?' · left '+m(x.debit-tot):' ✓')),
        ap.lines.map(l=>{const cands=advanceCandidatesForEmp(sid,l.employeeName);return h('div',{key:l.employeeId,style:{padding:'8px 0',borderBottom:'1px solid var(--border)'}},
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},h('b',{style:{fontSize:12.5}},l.employeeName),h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)',padding:'0 6px'},onClick:()=>setAdvFor(a=>({...a,lines:a.lines.filter(z=>z.employeeId!==l.employeeId)}))},'Remove')),
          cands.length>0&&h('select',{className:'form-control',style:{...inp,marginTop:4},value:l.linkExistingId,onChange:e=>setAdvLine(l.employeeId,{linkExistingId:e.target.value})},h('option',{value:''},'New advance'),cands.map(a=>h('option',{key:a.id,value:a.id},'Link '+a.id+' — '+m(Number(a.outstanding!=null?a.outstanding:a.amount)||0)+(a.status==='Pending Approval'?' (approved, not paid)':'')))),
          !l.linkExistingId&&h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:6}},
            h('label',{style:{fontSize:11,color:'var(--text3)'}},'Amount ₹',h('input',{type:'number',className:'form-control',style:{...inp,textAlign:'right'},value:l.amount,onChange:e=>setAdvLine(l.employeeId,{amount:e.target.value})})),
            h('label',{style:{fontSize:11,color:'var(--text3)'}},'Recover from',h('select',{className:'form-control',style:inp,value:l.deductFrom,onChange:e=>setAdvLine(l.employeeId,{deductFrom:e.target.value})},['Salary','Incentive'].map(o=>h('option',{key:o,value:o},o)))),
            h('label',{style:{fontSize:11,color:'var(--text3)'}},'From month',h('input',{type:'month',className:'form-control',style:inp,value:l.deductionStart,onChange:e=>setAdvLine(l.employeeId,{deductionStart:e.target.value})})),
            h('label',{style:{fontSize:11,color:'var(--text3)'}},'Reason',h('input',{className:'form-control',style:inp,value:l.reason,placeholder:'optional',onChange:e=>setAdvLine(l.employeeId,{reason:e.target.value})}))));}),
        h('select',{className:'form-control',style:{...inp,marginTop:8},value:'',onChange:e=>{const em=emps.find(z=>String(z.id)===e.target.value);if(em&&!ap.lines.some(z=>z.employeeId===em.id))setAdvFor(a=>({...a,lines:[...a.lines,advLine(em,Math.max(0,x.debit-tot))]}));}},
          h('option',{value:''},ap.lines.length?'+ Add another employee':'Choose the employee'),emps.filter(em=>!ap.lines.some(z=>z.employeeId===em.id)).map(em=>h('option',{key:em.id,value:em.id},em.name))),
        advErr&&h('div',{style:{color:'var(--red)',fontSize:12,marginTop:6}},advErr),
        h('div',{style:{display:'flex',gap:8,marginTop:10}},ap.lines.length>0&&h('button',{className:'btn btn-primary btn-sm',onClick:doAdv},'Record advance '+(m(tot)||''))));}
    return null;})();

  // ── plans (bulk) ──
  const planBox=(titleTxt,extra,headers,rows,goBtn,onCancel)=>h('div',{style:C.panel},
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:6}},h('b',{style:{fontSize:13}},titleTxt),extra),
    h('div',{style:{maxHeight:260,overflowY:'auto'}},h('table',{style:{width:'100%',fontSize:12}},h('thead',null,h('tr',null,headers.map((t,i)=>h('th',{key:i,style:{textAlign:i===1?'right':'left',fontSize:10.5,color:'var(--text3)'}},t)))),h('tbody',null,rows))),
    h('div',{style:{display:'flex',gap:8,marginTop:8}},goBtn,h('button',{className:'btn btn-ghost btn-sm',onClick:onCancel},'Cancel')));
  const planCell=(ok,txt)=>h('td',{style:{color:ok?'var(--green)':'var(--orange)'}},txt);

  const monthLbl=monthCtx?RPT_MONTHS[monthCtx.month]+' '+monthCtx.year:'';
  const rules=loadBankRules(sid);
  const narrowDrawer=narrow&&drawer;
  return h('div',{className:'modal-overlay',style:{zIndex:3000},onClick:onClose},
    h('div',{ref:rootRef,tabIndex:-1,onKeyDown:onKey,className:'modal',style:{width:1240,maxWidth:'98vw',maxHeight:'94vh',display:'flex',flexDirection:'column',padding:0,overflow:'hidden',outline:'none',position:'relative'},onClick:e=>e.stopPropagation()},
      // header
      h('div',{style:{padding:'14px 18px 10px',borderBottom:'1px solid var(--border)'}},
        h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10,flexWrap:'wrap'}},
          h('div',{style:{minWidth:0}},h('div',{className:'modal-title',style:{margin:0}},title),h('div',{style:{fontSize:12.5,color:'var(--text3)',marginTop:3,lineHeight:1.5,maxWidth:760}},intro)),
          h('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},
            monthCtx&&h('button',{className:'btn btn-ghost btn-sm',title:'Every bank line of the month with its mapping',onClick:async()=>{try{const {wb,filename}=await buildBankMappingSummaryWorkbook(sid,monthCtx.year,monthCtx.month);await xlDownload(wb,filename);}catch(e){say(e.message||String(e),'warn');}}},'⬇ Summary'),
            h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setShowRules(v=>!v)},'⚙ Rules ('+rules.length+')'),
            h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setShowKeys(v=>!v)},'⌨ Keys'),
            h('button',{className:'btn btn-ghost btn-sm',onClick:onClose,title:'Close'},'✕'))),
        ready&&h('div',{style:{marginTop:10}},
          h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4,gap:8,flexWrap:'wrap'}},
            h('span',null,h('b',null,monthLbl+' — '+ready.mapped+' of '+ready.total+' lines mapped ('+ready.pct+'%)')),
            h('span',{style:{color:'var(--text3)'}},ready.total-ready.mapped?(ready.unDebit+' debit ('+(m(ready.unDebitAmt)||'₹0')+') · '+ready.unCredit+' credit ('+(m(ready.unCreditAmt)||'₹0')+') left'):'Ready to mark Final ✓')),
          h('div',{style:{height:8,borderRadius:6,background:'var(--bg4, rgba(0,0,0,0.08))',overflow:'hidden'}},h('div',{style:{height:'100%',width:ready.pct+'%',background:ready.pct===100?'var(--green)':ready.pct>=80?'#d08a12':'var(--red)',transition:'width .3s'}})))),
      // body
      h('div',{style:{flex:1,overflowY:'auto',padding:'10px 18px'}},
        showKeys&&h('div',{style:{...C.panel,fontSize:12,display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))',gap:'4px 16px'}},
          [['↑ ↓ or j k','Move between lines'],['Space','Tick / untick the line'],['Enter','Accept the suggestion'],['N','Choose Nature'],['L','Link bill (debits)'],['P','Pay employees'],['A','Advance'],['S','Tick look-alike lines'],['Ctrl+Enter','Apply bulk Nature'],['Ctrl+Z','Undo the last mapping'],['Esc','Close the side panel'],['?','Show / hide these keys']]
            .map(([k,d])=>h('div',{key:k},h('kbd',{style:{background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:4,padding:'0 5px',fontSize:11,marginRight:6}},k),d))),
        showRules&&h('div',{style:C.panel},
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}},h('b',{style:{fontSize:13}},'Remembered rules'),
            h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setNewRule(newRule?null:{side:'Debit',contains:'',minAmt:'',maxAmt:'',nature:'',vendorOverride:'',dateMode:'setdt'})},newRule?'Cancel new rule':'+ New rule')),
          newRule&&h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end',margin:'8px 0',padding:8,border:'1px dashed var(--border2)',borderRadius:8}},
            h('label',{style:{fontSize:11,color:'var(--text3)'}},'Side',h('select',{className:'form-control',style:{padding:'4px 6px',fontSize:12,width:90},value:newRule.side,onChange:e=>setNewRule({...newRule,side:e.target.value,nature:''})},['Debit','Credit'].map(o=>h('option',{key:o,value:o},o)))),
            h('label',{style:{fontSize:11,color:'var(--text3)'}},'Narration contains',h('input',{className:'form-control',style:{padding:'4px 6px',fontSize:12,width:170},value:newRule.contains,placeholder:'e.g. sms, swiggy',onChange:e=>setNewRule({...newRule,contains:e.target.value})})),
            h('label',{style:{fontSize:11,color:'var(--text3)'}},'Amount from ₹',h('input',{type:'number',className:'form-control',style:{padding:'4px 6px',fontSize:12,width:90},value:newRule.minAmt,onChange:e=>setNewRule({...newRule,minAmt:e.target.value})})),
            h('label',{style:{fontSize:11,color:'var(--text3)'}},'to ₹',h('input',{type:'number',className:'form-control',style:{padding:'4px 6px',fontSize:12,width:90},value:newRule.maxAmt,onChange:e=>setNewRule({...newRule,maxAmt:e.target.value})})),
            h('label',{style:{fontSize:11,color:'var(--text3)'}},'→ Nature',h('select',{className:'form-control',style:{padding:'4px 6px',fontSize:12,width:170},value:newRule.nature,onChange:e=>setNewRule({...newRule,nature:e.target.value})},h('option',{value:''},'Choose…'),BANK_MAP_NATURES.filter(n=>newRule.side==='Credit'?BANK_CREDIT_NATURES.has(n):!/Settlement$|^Collection$|^Interest$/.test(n)).map(n=>h('option',{key:n,value:n},n)))),
            newRule.nature==='Vendor Payment'&&h('label',{style:{fontSize:11,color:'var(--text3)'}},'Vendor',h('select',{className:'form-control',style:{padding:'4px 6px',fontSize:12,width:170},value:newRule.vendorOverride,onChange:e=>setNewRule({...newRule,vendorOverride:e.target.value})},h('option',{value:''},'From narration'),vendors.map(v=>h('option',{key:v.id,value:v.name},v.name)))),
            (newRule.nature==='Card Settlement'||newRule.nature==='UPI Settlement')&&h('label',{style:{fontSize:11,color:'var(--text3)'}},'Cradlee date',h('select',{className:'form-control',style:{padding:'4px 6px',fontSize:12,width:160},value:newRule.dateMode,onChange:e=>setNewRule({...newRule,dateMode:e.target.value})},h('option',{value:'setdt'},'From narration (SETDT)'),h('option',{value:'prev'},'Day before bank date'))),
            h('button',{className:'btn btn-primary btn-sm',onClick:()=>{if(!newRule.contains.trim()){say('Enter the text the narration contains.','warn');return;}if(!newRule.nature){say('Choose the Nature.','warn');return;}
              addBankRule(sid,{sig:'',side:newRule.side,contains:newRule.contains.trim(),minAmt:newRule.minAmt,maxAmt:newRule.maxAmt,nature:newRule.nature,vendorOverride:newRule.vendorOverride,dateMode:newRule.dateMode});setNewRule(null);say('Rule saved.');refresh();}},'Save rule')),h('span',{style:{fontSize:11.5,color:'var(--text3)',marginLeft:8}},controlOn('bankAutoRules',sid)?'Also applied to new bank statement imports.':'Used as suggestions only (auto-apply on import is off in Controls).'),
          !rules.length?h('div',{style:{fontSize:12,color:'var(--text3)',marginTop:6}},'No rules yet — after you set a Nature on a line, the app offers to remember it.')
          :h('table',{style:{width:'100%',fontSize:12,marginTop:6}},h('tbody',null,rules.slice().reverse().map(r=>h('tr',{key:r.id},
            h('td',null,r.side==='Debit'?sideTag({side:'Debit'}):sideTag({side:'Credit'})),h('td',null,r.contains?'contains “'+r.contains+'”':'like “'+r.sig+'”',(r.minAmt||r.maxAmt)?h('span',{style:{color:'var(--text3)'}},' · ₹'+(r.minAmt||0)+'–'+(r.maxAmt||'any')):null),h('td',null,'→ ',h('b',null,r.nature),r.vendorOverride?' · '+r.vendorOverride:''),
            h('td',{style:{color:'var(--text3)'}},(r.by||'')+' · '+(r.at?new Date(r.at).toLocaleDateString('en-IN'):'')),
            h('td',null,h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>{if(!window.confirm('Delete this rule?'))return;saveBankRules(sid,loadBankRules(sid).filter(z=>z.id!==r.id));refresh();}},'Delete'))))))),
        rulePrompt&&h('div',{style:{...C.panel,display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',background:'rgba(47,95,224,0.07)',borderColor:'rgba(47,95,224,0.3)'}},
          h('span',{style:{fontSize:12.5,flex:1,minWidth:240}},'💡 Always map ',rulePrompt.side.toLowerCase(),' lines like ',h('b',null,'“'+rulePrompt.sig+'”'),' as ',h('b',null,rulePrompt.nature),rulePrompt.vendorOverride?' · '+rulePrompt.vendorOverride:'','?'),
          h('button',{className:'btn btn-primary btn-sm',onClick:()=>{addBankRule(sid,{sig:rulePrompt.sig,side:rulePrompt.side,nature:rulePrompt.nature,vendorOverride:rulePrompt.vendorOverride,dateMode:'setdt'});
            const same=list.filter(y=>y.side===rulePrompt.side&&bmapSig(y.description)===rulePrompt.sig&&!y.nature);setRulePrompt(null);
            if(same.length&&window.confirm('Rule saved. Map the '+same.length+' other line(s) like it now?')){const r=applyBulkTo(same,rulePrompt.nature,rulePrompt.vendorOverride,'setdt','');refresh();say('Rule saved · '+r.done+' more line(s) mapped.');}else{say('Rule saved.');refresh();}}},'Remember'),
          h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setRulePrompt(null)},'Not now')),
        msg&&h('div',{style:{fontSize:12.5,marginBottom:8,padding:'6px 10px',borderRadius:8,background:msg.kind==='warn'?'rgba(224,138,18,0.1)':'rgba(46,125,50,0.1)',color:msg.kind==='warn'?'#9a5b00':'var(--green)',display:'flex',justifyContent:'space-between',gap:8}},
          h('span',null,(msg.kind==='warn'?'⚠ ':'✓ ')+msg.text),h('button',{className:'btn btn-ghost btn-sm',style:{padding:'0 6px'},onClick:()=>setMsg(null)},'✕')),
        !list.length?h('div',{style:{textAlign:'center',padding:'34px 10px'}},
          h('div',{style:{fontSize:44}},'🎉'),h('div',{style:{fontSize:18,fontWeight:700,marginTop:6}},'Every bank line is mapped'+(monthLbl?' for '+monthLbl:'')),
          h('div',{style:{fontSize:13,color:'var(--text3)',marginTop:4}},'You can mark the month Final and make its Collection Reco now.'),
          h('div',{style:{display:'flex',gap:8,justifyContent:'center',marginTop:14,flexWrap:'wrap'}},
            onNavTab&&h('button',{className:'btn btn-primary',onClick:()=>{onClose();onNavTab('collection-sheet');}},'Open Collection Reco'),
            onNavTab&&h('button',{className:'btn btn-ghost',onClick:()=>{onClose();onNavTab('outlet-pnl');}},'Go to P&L to mark Final'),
            h('button',{className:'btn btn-ghost',onClick:onClose},'Close')))
        :h(React.Fragment,null,
          // toolbar
          h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',marginBottom:8}},
            h('div',{style:{display:'inline-flex',border:'1px solid var(--border2)',borderRadius:8,overflow:'hidden'}},[['All',list.length],['Debit',dr.length],['Credit',cr.length]].map(([k,n])=>h('button',{key:k,onClick:()=>setSide(k),style:{border:'none',padding:'5px 12px',fontSize:12,cursor:'pointer',background:side===k?'var(--accent)':'transparent',color:side===k?'#fff':'var(--text2)',fontWeight:600}},k+' '+n))),
            h('input',{className:'form-control',placeholder:'Search narration, date or amount…',value:q,onChange:e=>setQ(e.target.value),style:{width:230,padding:'5px 8px',fontSize:12}}),
            h('input',{type:'number',className:'form-control',placeholder:'Min ₹',value:minA,onChange:e=>setMinA(e.target.value),style:{width:86,padding:'5px 8px',fontSize:12}}),
            h('input',{type:'number',className:'form-control',placeholder:'Max ₹',value:maxA,onChange:e=>setMaxA(e.target.value),style:{width:86,padding:'5px 8px',fontSize:12}}),
            h('select',{className:'form-control',value:missing,onChange:e=>setMissing(e.target.value),style:{width:190,padding:'5px 8px',fontSize:12}},
              [['All','All lines'],['Suggested','With a suggestion'],['No Nature','Missing: Nature'],['No vendor','Missing: vendor'],['No Date as per Cradlee','Missing: Cradlee date'],['Duplicate','Possible duplicates']].map(([v,l])=>h('option',{key:v,value:v},l))),
            h('label',{style:{fontSize:12,display:'flex',gap:5,alignItems:'center',marginLeft:4}},h('input',{type:'checkbox',checked:grouped,onChange:e=>setGrouped(e.target.checked)}),'Group look-alikes'),
            h('span',{style:{fontSize:11.5,color:'var(--text3)',marginLeft:'auto'}},'Debit '+(m(sum(dr,'debit'))||'₹0')+' · Credit '+(m(sum(cr,'credit'))||'₹0'))),
          // suggestions banner
          Object.keys(sugg).length>0&&h('div',{style:{...C.panel,display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',padding:'8px 12px'}},
            h('span',{style:{fontSize:12.5}},'✨ ',h('b',null,Object.keys(sugg).length),' suggestion'+(Object.keys(sugg).length===1?'':'s')+' — ',
              ['high','mid','low'].map(c=>{const n=Object.values(sugg).filter(s=>s.conf===c).length;return n?h('span',{key:c,style:{marginRight:10}},h('span',{style:{display:'inline-block',width:8,height:8,borderRadius:'50%',background:BMAP_DOT[c],marginRight:4}}),n+' '+BMAP_CONF_LABEL[c].toLowerCase()):null;})),
            h('label',{style:{fontSize:12,display:'flex',gap:5,alignItems:'center'}},h('input',{type:'checkbox',checked:inclMid,onChange:e=>setInclMid(e.target.checked)}),'include “likely”'),
            h('button',{className:'btn btn-primary btn-sm',disabled:!acceptable.length,onClick:acceptAll},'✓ Accept all '+(inclMid?'sure + likely':'sure')+' ('+acceptable.length+')')),
          // bulk bar
          ticked.size>0&&h('div',{style:{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',padding:'8px 10px',marginBottom:8,background:'rgba(47,95,224,0.08)',border:'1px solid rgba(47,95,224,0.3)',borderRadius:10,position:'sticky',top:0,zIndex:3}},
            h('b',{style:{fontSize:12.5}},ticked.size+' ticked'),
            h('select',{className:'form-control',style:{width:180,padding:'4px 6px',fontSize:12},value:bulk.nature,onChange:e=>setBulk({...bulk,nature:e.target.value})},h('option',{value:''},'Set Nature…'),BANK_MAP_NATURES.filter(n=>tickedList.some(x=>sideOk(x,n))).map(n=>h('option',{key:n,value:n},n))),
            bulk.nature==='Vendor Payment'&&h('select',{className:'form-control',style:{width:190,padding:'4px 6px',fontSize:12},value:bulk.vendor,onChange:e=>setBulk({...bulk,vendor:e.target.value})},h('option',{value:''},'Vendor from narration'),vendors.map(v=>h('option',{key:v.id,value:v.name},v.name))),
            (bulk.nature==='Card Settlement'||bulk.nature==='UPI Settlement')&&h('select',{className:'form-control',style:{width:200,padding:'4px 6px',fontSize:12},value:bulk.dateMode,onChange:e=>setBulk({...bulk,dateMode:e.target.value})},h('option',{value:'setdt'},'Cradlee date from narration'),h('option',{value:'prev'},'Day before bank date'),h('option',{value:'pick'},'Pick a date…')),
            (bulk.nature==='Card Settlement'||bulk.nature==='UPI Settlement')&&bulk.dateMode==='pick'&&h('input',{type:'date',className:'form-control',style:{width:140,padding:'4px 6px',fontSize:12},value:bulk.date,onChange:e=>setBulk({...bulk,date:e.target.value})}),
            h('button',{className:'btn btn-primary btn-sm',onClick:applyBulk},'Apply'),
            tickedDr.length>0&&h('span',{style:{width:1,height:20,background:'var(--border2)',margin:'0 4px'}}),
            tickedDr.length>0&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>makePlan(splitOld)},'🔗 Link bills ('+tickedDr.length+')'),
            tickedDr.length>0&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>makePayPlan(payYM)},'👤 Pay ('+tickedDr.length+')'),
            tickedDr.length>0&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>makeAdvPlan(advDeduct)},'💵 Advances ('+tickedDr.length+')'),
            h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setTicked(new Set())},'Clear')),
          linkPlan&&(()=>{const go=linkPlan.filter(p=>p.allocations);return planBox('Link bills — '+go.length+' ready'+(linkPlan.length-go.length?', '+(linkPlan.length-go.length)+' skipped':''),
            h('label',{style:{fontSize:12,display:'flex',gap:6,alignItems:'center'}},h('input',{type:'checkbox',checked:splitOld,onChange:e=>{setSplitOld(e.target.checked);makePlan(e.target.checked);}}),'Split across oldest bills when no single bill matches'),
            ['Date','Payment','Vendor','Linked to'],linkPlan.map(p=>h('tr',{key:p.x.id},h('td',null,p.x.date),h('td',{style:C.amt},m(p.x.debit)),h('td',null,p.vendor?p.vendor.name:'—'),planCell(!!p.allocations,p.allocations?p.allocations.map(a=>a.invoiceNo+' '+m(a.amount)).join(' + '):p.reason))),
            go.length>0&&h('button',{className:'btn btn-primary btn-sm',onClick:runPlan},'Link '+go.length),()=>setLinkPlan(null));})(),
          payPlan&&(()=>{const go=payPlan.filter(p=>p.what);const months=[0,1,2,3].map(k=>{const d=new Date(new Date().getFullYear(),new Date().getMonth()-k,1);return d.getFullYear()+'-'+d.getMonth();});
            return planBox('Pay employees — '+go.length+' ready'+(payPlan.length-go.length?', '+(payPlan.length-go.length)+' skipped':''),
              h('label',{style:{fontSize:12,display:'flex',gap:6,alignItems:'center'}},'Pay for',h('select',{className:'form-control',style:{width:200,padding:'3px 6px',fontSize:12},value:payYM,onChange:e=>{setPayYM(e.target.value);makePayPlan(e.target.value);}},h('option',{value:'auto'},'By payment date (≤15th → last month)'),months.map(k=>{const [yy,mm]=k.split('-').map(Number);return h('option',{key:k,value:k},RPT_MONTHS[mm]+' '+yy);}))),
              ['Date','Payment','Employee','Settles'],payPlan.map(p=>h('tr',{key:p.x.id},h('td',null,p.x.date),h('td',{style:C.amt},m(p.x.debit)),h('td',null,(p.emp?p.emp.name:'—')+(p.month!=null?' · '+RPT_MONTHS[p.month].slice(0,3):'')),planCell(!!p.what,p.what?p.what+' '+m(p.salaryAmt+p.incentiveAmt+Object.values(p.dailyIncentiveByCat||{}).reduce((t,v)=>t+v,0)):p.reason))),
              go.length>0&&h('button',{className:'btn btn-primary btn-sm',onClick:runPayPlan},'Settle '+go.length),()=>setPayPlan(null));})(),
          advPlan&&(()=>{const ready2=advPlan.filter(p=>p.line),over=ready2.filter(p=>p.over),go=ready2.filter(p=>!p.over||advOver);
            return planBox('Advances — '+go.length+' ready'+(advPlan.length-ready2.length?', '+(advPlan.length-ready2.length)+' skipped':'')+(over.length&&!advOver?', '+over.length+' over the limit':''),
              h('div',{style:{display:'flex',gap:10,flexWrap:'wrap'}},h('label',{style:{fontSize:12,display:'flex',gap:6,alignItems:'center'}},'Recover from',h('select',{className:'form-control',style:{width:110,padding:'3px 6px',fontSize:12},value:advDeduct,onChange:e=>{setAdvDeduct(e.target.value);makeAdvPlan(e.target.value);}},['Salary','Incentive'].map(o=>h('option',{key:o,value:o},o)))),
                over.length>0&&h('label',{style:{fontSize:12,display:'flex',gap:6,alignItems:'center',color:'var(--orange)'}},h('input',{type:'checkbox',checked:advOver,onChange:e=>setAdvOver(e.target.checked)}),'Include the '+over.length+' over the limit')),
              ['Date','Payment','Employee','Records'],advPlan.map(p=>h('tr',{key:p.x.id},h('td',null,p.x.date),h('td',{style:C.amt},m(p.x.debit)),h('td',null,p.emp?p.emp.name:'—'),planCell(!!p.line&&!p.over,!p.line?p.reason:p.linked?'Links '+p.linked+' already on the Advances sheet':'New advance from '+p.line.deductionStart+(p.over?' — ⚠ '+p.over:'')))),
              go.length>0&&h('button',{className:'btn btn-primary btn-sm',onClick:runAdvPlan},'Record '+go.length),()=>setAdvPlan(null));})(),
          // table + drawer
          h('div',{style:{display:'flex',gap:12,alignItems:'flex-start'}},
            h('div',{style:{flex:1,minWidth:0}},
              narrow?h('div',null,shown.map(cardEl))
              :h('div',{style:{border:'1px solid var(--border2)',borderRadius:10,overflow:'auto',maxHeight:'52vh'}},h('table',{style:{width:'100%',borderCollapse:'separate',borderSpacing:0,fontSize:12.5}},
                h('thead',null,h('tr',null,
                  h('th',{style:{...C.th,width:30}},h('input',{type:'checkbox',title:'Tick every line shown',checked:shown.length>0&&shown.every(x=>ticked.has(x.id)),onChange:e=>setTicked(p=>{const n=new Set(p);shown.forEach(x=>{if(e.target.checked)n.add(x.id);else n.delete(x.id);});return n;})})),
                  ['Date','Narration','Amount','Suggestion','Map it'].map((t,i)=>h('th',{key:i,style:{...C.th,textAlign:i===2?'right':'left'}},t)))),
                h('tbody',null,groups?groups.flatMap(g=>[groupHead(g),...(openGroups.has(g.k)?g.items.map((x,i)=>rowEl(x,i)):[])]):shown.map((x,i)=>rowEl(x,i))))),
              shown.length<list.length&&h('div',{style:{fontSize:12,color:'var(--text3)',marginTop:6}},'Showing '+shown.length+' of '+list.length+' — clear the search / filters to see the rest.')),
            drawer&&!narrow&&h('div',{style:{width:430,flexShrink:0,position:'sticky',top:0,border:'1px solid var(--border2)',borderRadius:12,padding:14,background:'var(--bg2)',boxShadow:'0 10px 30px rgba(0,0,0,0.12)',maxHeight:'60vh',overflowY:'auto'}},
              h('div',{style:{display:'flex',justifyContent:'flex-end'}},h('button',{className:'btn btn-ghost btn-sm',style:{padding:'0 6px'},title:'Close (Esc)',onClick:closePanels},'✕')),drawer))),
        // journal
        J.length>0&&h('div',{style:{marginTop:16,border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px'}},
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}},
            h('b',{style:{fontSize:13,cursor:'pointer'},onClick:()=>setShowJournal(v=>!v)},(showJournal?'▾ ':'▸ ')+'Mapped from this screen ('+J.length+')'),
            h('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},h('button',{className:'btn btn-primary btn-sm',disabled:tallyBusy||!notInTally.length,title:'Send these mapped lines to Tally through the Tally Connector',onClick:sendTally},tallyBusy?'Sending…':'📤 Send to Tally ('+notInTally.length+')'),onNavTab&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{onClose();onNavTab('tally');}},'Tally Export →'),h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:undoAll},'Undo all'))),
          showJournal&&h('div',{style:{maxHeight:220,overflowY:'auto',marginTop:6}},h('table',{style:{width:'100%',fontSize:12}},h('tbody',null,J.map(e=>{const t=tallyOf(e);return h('tr',{key:e.id||(e.rowId+'-'+e.at)},
            h('td',{style:{...C.td,whiteSpace:'nowrap'}},e.date),h('td',{style:C.td},e.side==='Debit'?sideTag({side:'Debit'}):sideTag({side:'Credit'})),
            h('td',{style:{...C.td,maxWidth:280}},h('div',{title:e.description,style:{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:280}},e.description)),
            h('td',{style:{...C.td,...C.amt}},m(e.amount)),h('td',{style:{...C.td,color:'var(--text2)'}},(e.labels||[]).join(' · ')),
            h('td',{style:{...C.td,color:'var(--text3)',whiteSpace:'nowrap'}},(e.lastBy||e.by||'')+' · '+new Date(e.lastAt||e.at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})),
            h('td',{style:C.td},h('span',{style:C.tag(t==='In Tally'?'#1f7a3a':t==='Changed since sent'?'#c0392b':'#7a7a7a',t==='In Tally'?'rgba(46,125,50,0.12)':t==='Changed since sent'?'rgba(192,57,43,0.12)':'rgba(0,0,0,0.06)')},t)),
            h('td',{style:C.td},h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{if(!window.confirm('Undo this mapping?\n\n'+e.date+' '+m(e.amount)+' — '+(e.labels||[]).join(', ')))return;undoEntry(e);}},'↶ Undo')));}))))),
        h('div',{style:{fontSize:11,color:'var(--text3)',marginTop:10,lineHeight:1.6}},'Changes save at once and mapped lines leave the list. ✓ Accept takes the suggestion (green dot = sure, amber = likely, red = guess). Tick lines or use ≈ similar / Group look-alikes to map many at once. Press ? for keyboard keys. Rules, the duplicate warning and approval above a limit are switched in Master Settings → 🎛 Controls.')),
      // footer
      h('div',{style:{padding:'10px 18px',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'flex-end',gap:8}},
        h('button',{className:'btn btn-ghost',onClick:onClose},list.length?'Close':'Done'),
        onNavTab&&h('button',{className:'btn btn-primary',onClick:()=>{onClose();onNavTab('bank-statement');}},'Go to Bank Statement →')),
      narrowDrawer&&h('div',{style:{position:'absolute',inset:0,background:'var(--bg2)',zIndex:10,padding:14,overflowY:'auto'}},
        h('div',{style:{display:'flex',justifyContent:'flex-end'}},h('button',{className:'btn btn-ghost btn-sm',onClick:closePanels},'✕ Close')),drawer)));
}
