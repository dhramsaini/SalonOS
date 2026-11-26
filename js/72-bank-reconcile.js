// ═══════════════════════════════════════════════════════════════════════════════════════════
// Bank Reconcile (outlet tab "Reconcile") — every bank line of a month on one screen, each with the
// best match and why: bills of a vendor (one, or several adding up), an employee's salary /
// incentive (or several employees named in one transfer), a payout from a Bank Payment file, a
// recurring payee, or a new payee. One OK applies it through the same functions Bank Statement uses
// (linkBankLineToBills, settleBankLineToEmployees, applyBankSuggestion …), so Undo, the audit log,
// approvals, month locks and duplicate checks all work as before.
//   • Payees are recognised by IFSC, account number and name (not the name alone)
//   • Lines already given a Nature but not linked (Vendor Payment without a bill, Salary without an
//     employee) are offered for linking too
//   • Sure / Check / New payee / Unknown, "OK all Sure", keyboard (↑ ↓ Enter, / search, Esc)
//   • Card / UPI settlements grouped by day; balance check of the statement; suggestion accuracy
// ═══════════════════════════════════════════════════════════════════════════════════════════

// ── Payouts from Bank Payment files (js/08 generateFile) ──
const RC_PAYOUTS_KEY='salonos_bank_payouts';
function rcLoadPayouts(sid){try{const v=JSON.parse(cachedLocalGet(outletKey(RC_PAYOUTS_KEY,sid))||'[]');return Array.isArray(v)?v:[];}catch(e){return[];}}
function rcSavePayouts(sid,list){safeLocalSet(outletKey(RC_PAYOUTS_KEY,sid),JSON.stringify((list||[]).slice(-500)));}
function rcRecordPayouts(sid,list){
  const at=new Date().toISOString();const cur=rcLoadPayouts(sid);
  (list||[]).forEach((p,i)=>{if(!(Number(p.amount)>0))return;cur.push({id:'PO'+Date.now().toString(36)+i,at,matched:'',...p});});
  rcSavePayouts(sid,cur);
}
function rcMarkPayout(sid,id,rowId){if(!id)return;rcSavePayouts(sid,rcLoadPayouts(sid).map(p=>p.id===id?{...p,matched:String(rowId)}:p));}

// ── Names ──
const RC_STOP=new Set(['pvt','private','ltd','limited','llp','opc','india','the','and','co','company','enterprise','enterprises','new','traders','trading','ms','mrs','mr','shri','smt','salary','sal','incentive','payment','neft','rtgs','imps','upi','bank','branch']);
function rcTokens(s,min){return vendorMatchNorm(s).split(/\s+/).filter(t=>t.length>=(min||3)&&!RC_STOP.has(t)&&!/^\d+$/.test(t));}
// Share of the record's name words found in the narration (0–1).
function rcNameScore(recName,desc,min){const A=rcTokens(recName,min);if(!A.length)return 0;const B=new Set(rcTokens(desc,3));const hay=' '+vendorMatchNorm(desc)+' ';
  const hit=A.filter(t=>B.has(t)||(t.length>=5&&hay.includes(t))).length;return hit/A.length;}
function rcDigits(s){return String(s||'').replace(/[^0-9]/g,'');}
const RC_IFSC_RE=/^[A-Z]{4}0[A-Z0-9]{6}$/;
// Payee and purpose from a NEFT / RTGS / IMPS narration: the part just before the IFSC
// ("NEFT/IDFB…/Moksha Wellness Pvt Ltd/YESB0000757/Cosmetics", "YIB-NEFT-YESME…-S BHOOMA-HDFC0000354-Sep Rent").
function rcParse(desc){
  const D=String(desc||'');const parts=D.split(/\/|-(?=\S)/).map(t=>t.trim()).filter(Boolean);
  const i=parts.findIndex(t=>RC_IFSC_RE.test(t.toUpperCase()));
  // HDFC writes the IFSC first ("NEFT DR-SBIN0012407-REYMOND RAI-NETBANK…"); UPI puts the UPI ID
  // between name and IFSC ("UPI-B M SATISH BABU-98454…@IBL-ICIC0001008-…").
  const isKind=t=>/^(neft|rtgs|imps|upi|ift|ft)( (dr|cr))?$/i.test(t);
  const good=t=>t&&!/\d{5,}/.test(t)&&!t.includes('@')&&!isKind(t)&&!/^(netbank|mum|self)\b/i.test(t)&&/[a-z]{2,}/i.test(t);
  if(i>0){let n=parts[i-1];let after=false;
    if(n&&n.includes('@')&&i>1)n=parts[i-2];else if(/\d{5,}/.test(n)&&i>1)n=parts[i-2];
    if(!good(n)&&good(parts[i+1])){n=parts[i+1];after=true;}
    if(good(n))return{name:n.replace(/\s+/g,' ').split(' ').map(w=>w.length<=2||/^(PVT|LTD|LLP|OPC|HUF)$/i.test(w)?w.toUpperCase():w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' '),
      ifsc:parts[i].toUpperCase(),purpose:parts.slice(i+(after?2:1)).filter(t=>!/\d{5,}/.test(t)&&!/^(netbank|mum|upi)\b/i.test(t)).join(' ')};}
  const n=typeof bankPayeeName==='function'?bankPayeeName(D):'';return{name:n,ifsc:bankIfscOf(D),purpose:''};
}
function rcPayeeName(desc){return rcParse(desc).name;}
// How sure we are that a narration is a payment to this vendor / employee, and why. An IFSC is a
// bank branch, not a person: it counts fully only when no one else on the list banks there.
function rcPayeeScore(rec,desc,isEmp,ifscCount){
  const reasons=[];let s=0;const D=String(desc||'').toUpperCase();const P=rcParse(desc);const ifsc=P.ifsc;
  const ac=rcDigits(rec.accountNo);const acHit=ac.length>=6&&rcDigits(D).includes(ac.slice(-6));
  if(acHit){s+=0.6;reasons.push('account no.');}
  if(ifsc&&rec.ifsc&&String(rec.ifsc).toUpperCase().trim()===ifsc){const uniq=!ifscCount||(ifscCount[ifsc]||0)<=1;s+=uniq?0.5:0.15;reasons.push('IFSC '+ifsc+(uniq?'':' (shared)'));}
  const against=P.name||desc;
  const n=Math.max(rcNameScore(rec.name,against,isEmp?4:3),rec.accountHolder?rcNameScore(rec.accountHolder,against,isEmp?4:3):0);
  if(n>=0.5){s+=0.45*n;reasons.push(n>=0.99?'name':'name '+Math.round(n*100)+'%');}
  else if(P.name&&!acHit){s*=0.6;if(s>0)reasons.push('name differs ('+P.name+')');}
  return{score:Math.min(1,s),reasons};
}
// ── Payee aliases: "Raza" (narration) is Md. Khurshid Ansari, "Salman Salary" is Shahran … kept per
// outlet once someone confirms a match, so the next payment to that name / IFSC is Sure. ──
function rcAliasKey(desc){const P=rcParse(desc);const n=vendorMatchNorm(P.name||'').replace(/\s+/g,' ').trim();return n?n+'|'+(P.ifsc||''):'';}
function rcLoadAliases(sid){try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_bank_payee_aliases',sid))||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}}
function rcSaveAlias(sid,desc,kind,id){const k=rcAliasKey(desc);if(!k||id==null)return;const A=rcLoadAliases(sid);if(A[k]&&A[k].kind===kind&&String(A[k].id)===String(id))return;
  A[k]={kind,id:String(id),by:typeof bmapUser==='function'?bmapUser():'',at:new Date().toISOString()};safeLocalSet(outletKey('salonos_bank_payee_aliases',sid),JSON.stringify(A));}
function rcAliasHit(sid,desc,kind,list){const k=rcAliasKey(desc);if(!k)return null;const A=rcLoadAliases(sid);const a=A[k]||A[k.split('|')[0]+'|'];
  if(!a||a.kind!==kind)return null;const rec=(list||[]).find(r=>String(r.id)===String(a.id));return rec?{rec,score:0.97,reasons:['remembered payee ('+rcParse(desc).name+')']}:null;}
function rcIfscCount(list){const c={};(list||[]).forEach(r=>{const f=String(r&&r.ifsc||'').toUpperCase().trim();if(f)c[f]=(c[f]||0)+1;});return c;}
function rcBestPayee(list,desc,isEmp){const cnt=rcIfscCount(list);let best=null;(list||[]).forEach(r=>{if(!r||!r.name)return;const p=rcPayeeScore(r,desc,isEmp,cnt);if(p.score>=(isEmp?0.28:0.4)&&(!best||p.score>best.score))best={rec:r,...p};});return best;}

// ── Bills ──
function rcBal(i){return Math.round(((Number(i.amount)||0)-(i.payments||[]).reduce((t,q)=>t+(Number(q.paidAmount)||0),0))*100)/100;}
// Open bills of a vendor that this payment pays: one bill of the amount, else 2–4 bills adding up to it,
// else the oldest bills (a "check" — part payments). left = balances still free in this run.
function rcBillPlan(v,amt,inv,left){
  const open=inv.filter(i=>String(i.vendorId)===String(v.id)&&left[i.id]>0.5).sort((a,b)=>String(toISO(a.bookingDate||a.invoiceDate)||'').localeCompare(String(toISO(b.bookingDate||b.invoiceDate)||'')));
  if(!open.length)return null;
  const one=open.filter(i=>Math.abs(left[i.id]-amt)<=1);
  if(one.length===1)return{how:'exact',allocations:[{id:one[0].id,invoiceNo:one[0].invoiceNo||one[0].id,amount:Math.min(amt,left[one[0].id])}]};
  const B=open.slice(0,14);const sols=[];
  const dfs=(k,pick,sum)=>{if(sols.length>1)return;if(pick.length>=2&&Math.abs(sum-amt)<=1){sols.push(pick.slice());return;}if(pick.length>=4)return;
    for(let j=k;j<B.length;j++){const b=left[B[j].id];if(sum+b>amt+1)continue;pick.push(B[j]);dfs(j+1,pick,sum+b);pick.pop();}};
  dfs(0,[],0);
  if(sols.length===1)return{how:'combo',allocations:sols[0].map(i=>({id:i.id,invoiceNo:i.invoiceNo||i.id,amount:left[i.id]}))};
  const tot=open.reduce((t,i)=>t+left[i.id],0);if(tot+1<amt)return{how:'short',total:tot};
  let rem=amt;const al=[];open.forEach(i=>{if(rem<=0.005)return;const a=Math.round(Math.min(left[i.id],rem)*100)/100;if(a>0){al.push({id:i.id,invoiceNo:i.invoiceNo||i.id,amount:a});rem=Math.round((rem-a)*100)/100;}});
  return{how:'oldest',allocations:al};
}

// ── Pay ──
// Month a salary / incentive payment is for: paid by the 15th → the month before, else that month.
function rcPayMonth(dmy){const iso=toISO(dmy);if(!iso)return null;const d=new Date(iso+'T00:00:00');const p=d.getDate()<=15?new Date(d.getFullYear(),d.getMonth()-1,1):new Date(d.getFullYear(),d.getMonth(),1);return{year:p.getFullYear(),month:p.getMonth()};}
// What a bank line can still be linked to: the month's net pay / incentive in Salary / Incentive
// Working less what bank lines already settle — also when the month was marked Paid by hand
// (then linking only records the bank line; nothing is paid twice). Worked out once per month.
let _rcPayCache={},_rcPayVer=-1;
function rcPayInfo(sid,y,m,rows){
  if(_rcPayVer!==storeVersion()){_rcPayCache={};_rcPayVer=storeVersion();}
  const k=sid+'|'+y+'|'+m;if(_rcPayCache[k])return _rcPayCache[k];
  const sal={},inc={},ls={},li={};
  try{(swWorkingsFor(sid,y,m)||[]).forEach(w=>{sal[w.id]=Math.max(0,Number(w.net)||0);});}catch(e){}
  try{(incWorkingsFor(sid,y,m)||[]).forEach(w=>{inc[w.id]=Math.max(0,Number(w.totalInc)||0);});}catch(e){}
  (rows||[]).forEach(r=>(r&&Array.isArray(r.linkedEmployeePay)?r.linkedEmployeePay:[]).forEach(l=>{if(Number(l.year)!==y||Number(l.month)!==m)return;ls[l.employeeId]=(ls[l.employeeId]||0)+(Number(l.salary)||0);li[l.employeeId]=(li[l.employeeId]||0)+(Number(l.incentive)||0);}));
  const v={sal,inc,ls,li};_rcPayCache[k]=v;return v;
}
function rcDues(sid,e,y,m,rows){const R=n=>Math.round((Number(n)||0)*100)/100;const P=rcPayInfo(sid,y,m,rows||bankRowsFor(sid));
  const sal=R(Math.max(0,(P.sal[e.id]||0)-(P.ls[e.id]||0))),inc=R(Math.max(0,(P.inc[e.id]||0)-(P.li[e.id]||0)));
  return{sal,inc,salMarked:employeeSalaryOutstandingFor(sid,e.id,y,m)===0&&sal>0,incMarked:employeeIncentiveOutstandingFor(sid,e.id,y,m)===0&&inc>0};}
// Employees named in a narration (for one transfer paying several people).
function rcEmpsNamed(desc,emps){const B=new Set(rcTokens(desc,4));return(emps||[]).filter(e=>{const A=rcTokens(e.name,4);return A.length&&B.has(A[0]);});}

// ── Building the list ──
const RC_LINK_NATURES=new Set(['Vendor Payment','Salary','Incentive']);
function rcMonthKey(dmy){const iso=toISO(dmy);return iso?iso.slice(0,7):'';}
function rcItemFromRow(r,problem){const cr=Number(r.credit)>0;return{id:r.id,date:r.transactionDate,description:r.description||'',credit:cr?Number(r.credit)||0:0,debit:cr?0:Number(r.debit)||0,
  side:cr?'Credit':'Debit',nature:String(r.nature||'').trim(),cradleeDate:r.cradleeDate||'',vendorOverride:r.vendorOverride||'',problem};}
// {items:[{x,row,task,s:{conf,label,why,reasons,apply,score}|null,alts:[]}], done:[rows], settlements:[{day,nature,total,n}], all}
function rcBuild(sid,ym){
  const rows=bankRowsFor(sid);const vendors=loadVendors(sid)||[];
  const inMonth=rows.filter(r=>r&&(Number(r.credit)>0||Number(r.debit)>0)&&(!ym||rcMonthKey(r.transactionDate)===ym));
  const inv=(loadVendorInvoices(sid)||[]).filter(i=>i&&i.docNature!=='Performa Invoice');const left={};inv.forEach(i=>{left[i.id]=rcBal(i);});
  const payouts=rcLoadPayouts(sid).filter(p=>!p.matched);const usedPayout=new Set();
  const items=[],done=[];
  inMonth.forEach(r=>{const problem=bankLineProblem(r,vendors);const nat=String(r.nature||'').trim();const cr=Number(r.credit)>0;
    if(problem){items.push({x:rcItemFromRow(r,problem),row:r,task:'map'});return;}
    if(!cr&&nat==='Vendor Payment'&&!r.linkedInvoice){items.push({x:rcItemFromRow(r,''),row:r,task:'bill'});return;}
    if(!cr&&(nat==='Salary'||nat==='Incentive')&&!(Array.isArray(r.linkedEmployeePay)&&r.linkedEmployeePay.length)){items.push({x:rcItemFromRow(r,''),row:r,task:'pay'});return;}
    done.push(r);});
  // the existing engine for lines without a Nature (rules, narration, cradlee dates, refunds, loans …)
  let base={};try{base=bankSuggestionsFor(sid,items.filter(i=>i.task==='map').map(i=>i.x),rows)||{};}catch(e){}
  const empCache={};const empsFor=(y,m)=>empCache[y+'-'+m]||(empCache[y+'-'+m]=(getEmployeesForMonth(y,m,sid)||[]).filter(e=>e&&e.status!=='Inactive'));
  const allEmps=(loadEmployees(sid)||[]).filter(e=>e&&e.status!=='Inactive');
  const M=n=>rupee0(n);
  let dueOpen=[];try{dueOpen=(allDueItemsFor(sid)||[]).filter(d=>RC_DUE_KW[d.type]&&!d.paid&&Number(d.amount)>0);}catch(e){}
  const others=(typeof SALONS!=='undefined'?SALONS:[]).filter(s=>s&&String(s.id)!==String(sid)).map(s=>({sid:s.id,name:String(s.name||'').split('—')[0].trim(),rows:bankRowsFor(s.id)}));
  // day sales from Cradlee (card / UPI) and the sale days already claimed by mapped settlements
  const ctxCr={totals:typeof cradleeDayTotals==='function'?cradleeDayTotals(sid):{},claimed:{}};
  rows.forEach(r=>{if(r&&r.cradleeDate&&(r.nature==='Card Settlement'||r.nature==='UPI Settlement'))ctxCr.claimed[(r.nature==='UPI Settlement'?'upi':'card')+'|'+r.cradleeDate]=1;});
  items.forEach(it=>{
    const x=it.x;const d=x.description;const alts=[];it.alts=alts;
    const bs=base[x.id];
    if(x.side==='Credit'){rcCreditAlts(sid,it,bs,rows,ctxCr);return;}
    const amt=x.debit;
    // 1 · a payout from a Bank Payment file (same amount, payee and within a week)
    const iso=toISO(x.date);const tt=iso?new Date(iso+'T00:00:00').getTime():0;
    const po=payouts.find(p=>!usedPayout.has(p.id)&&Math.abs(Number(p.amount)-amt)<=1&&(!p.valueDate||Math.abs(new Date(p.valueDate+'T00:00:00').getTime()-tt)<=7*864e5)
      &&((p.ifsc&&bankIfscOf(d)===p.ifsc)||(p.acct&&p.acct.length>=6&&rcDigits(d).includes(p.acct.slice(-6)))||rcNameScore(p.name,d)>=0.5));
    if(po){usedPayout.add(po.id);
      if(po.kind==='vendor'){const v=vendors.find(z=>String(z.id)===String(po.vendorId));const ids=(po.invIds||[]).filter(id=>left[id]>0.5);
        if(v&&ids.length){const al=[];let rem=amt;ids.forEach(id=>{const a=Math.round(Math.min(left[id],rem)*100)/100;if(a>0){al.push({id,invoiceNo:(inv.find(i=>i.id===id)||{}).invoiceNo||id,amount:a});rem-=a;left[id]-=a;}});
          if(al.length){it.s={score:0.99,conf:'high',label:'Pays '+al.map(a=>a.invoiceNo).join(' + ')+' · '+v.name,why:'In the Bank Payment file of '+(po.valueDate||'').split('-').reverse().join('/'),reasons:['Bank Payment file','same amount and payee'],apply:{type:'link',plan:{vendor:v,allocations:al}},payout:po.id};return;}}}
      else{const e=allEmps.find(z=>String(z.id)===String(po.empId));if(e&&po.year!=null){const du=rcDues(sid,e,po.year,po.month,rows);const isInc=po.kind==='incentive';
        const la={employeeId:e.id,employeeName:e.name,salaryAmt:isInc?0:Math.min(amt,du.sal||amt),incentiveAmt:isInc?Math.min(amt,du.inc||amt):0};
        it.s={score:0.99,conf:'high',label:(isInc?'Incentive':'Salary')+' '+RPT_MONTHS[po.month].slice(0,3)+' · '+e.name,why:'In the Bank Payment file of '+(po.valueDate||'').split('-').reverse().join('/'),reasons:['Bank Payment file','same amount and payee'],
          apply:{type:'pay',plan:{year:po.year,month:po.month,lines:[la]}},payout:po.id};return;}}}
    // 2 · employees (salary / incentive, one or several people)
    const pm=rcPayMonth(x.date);
    if(pm&&(it.task==='pay'||it.task==='map')){
      const emps=empsFor(pm.year,pm.month);const named=rcEmpsNamed(d,emps);
      if(named.length>=2){const du=named.map(e=>({e,...rcDues(sid,e,pm.year,pm.month,rows)}));
        for(const k of ['sal','inc']){const tot=du.reduce((t,q)=>t+q[k],0);if(du.every(q=>q[k]>0)&&Math.abs(tot-amt)<=1){
          alts.push({score:0.84,conf:'mid',label:'Split: '+(k==='sal'?'salary':'incentive')+' '+RPT_MONTHS[pm.month].slice(0,3)+' of '+named.length+' people',why:du.map(q=>q.e.name+' '+M(q[k])).join(' · '),reasons:['names in narration','= '+(k==='sal'?'net pay':'incentive')+' total'],
            apply:{type:'pay',plan:{year:pm.year,month:pm.month,lines:du.map(q=>({employeeId:q.e.id,employeeName:q.e.name,salaryAmt:k==='sal'?q[k]:0,incentiveAmt:k==='inc'?q[k]:0}))}}});break;}}}
      const ep=rcAliasHit(sid,d,'emp',emps)||rcBestPayee(emps,d,true)||(()=>{const t=typeof payeeByToken==='function'?payeeByToken('emp',d,emps):null;return t?{rec:t,score:0.6,reasons:['paid to this account before']}:null;})();
      if(ep){const e=ep.rec;const tries=[pm,{year:pm.month===0?pm.year-1:pm.year,month:(pm.month+11)%12},{year:pm.month===11?pm.year+1:pm.year,month:(pm.month+1)%12}];
        const purpose=(rcParse(d).purpose+' '+x.nature).toLowerCase();const incFirst=/incent/.test(purpose)&&!/salary/.test(purpose);
        for(const t of tries){const du=rcDues(sid,e,t.year,t.month,rows);const near=v=>v>0&&Math.abs(v-amt)<=1;let what=null,la=null,marked=false;
          const trySal=()=>{if(near(du.sal)){what='Salary';la={salaryAmt:du.sal,incentiveAmt:0};marked=du.salMarked;return true;}return false;};
          const tryInc=()=>{if(near(du.inc)){what='Incentive';la={salaryAmt:0,incentiveAmt:du.inc};marked=du.incMarked;return true;}return false;};
          if(!(incFirst?tryInc()||trySal():trySal()||tryInc())&&du.sal>0&&du.inc>0&&near(du.sal+du.inc)){what='Salary + incentive';la={salaryAmt:du.sal,incentiveAmt:du.inc};marked=du.salMarked&&du.incMarked;}
          if(what){const sc=Math.min(0.98,0.55+ep.score*0.45)-(t===pm?0:0.08);
            alts.push({score:sc,conf:sc>=0.9?'high':'mid',label:what+' '+RPT_MONTHS[t.month].slice(0,3)+' '+t.year+' · '+e.name,why:marked?'Already marked Paid in '+(what==='Incentive'?'Incentive':'Salary')+' Working — this links the bank line to it':'Amount equals what is due',reasons:[...ep.reasons,'= '+what.toLowerCase()+' net'],
              apply:{type:'pay',plan:{year:t.year,month:t.month,lines:[{employeeId:e.id,employeeName:e.name,...la}]}}});break;}}
        if(!alts.length&&it.task==='pay'){const du=rcDues(sid,e,pm.year,pm.month,rows);const k=incFirst||x.nature==='Incentive'?'inc':'sal';
          if(du[k]>0)alts.push({score:0.62,conf:'mid',label:(k==='sal'?'Salary':'Incentive')+' '+RPT_MONTHS[pm.month].slice(0,3)+' · '+e.name+' (part)',why:M(amt)+' of '+M(du[k])+' due',reasons:[...ep.reasons,'part payment'],
            apply:{type:'pay',plan:{year:pm.year,month:pm.month,lines:[{employeeId:e.id,employeeName:e.name,salaryAmt:k==='sal'?Math.min(amt,du.sal):0,incentiveAmt:k==='inc'?Math.min(amt,du.inc):0}]}}});}}
    }
    // 3 · vendor bills (vendor from the line, else IFSC / account / name)
    if(it.task==='bill'||it.task==='map'){
      const ov=x.vendorOverride&&x.vendorOverride!=='__none__'&&!String(x.vendorOverride).startsWith('EMP:')?vendors.find(v=>v.name===x.vendorOverride):null;
      const vp=ov?{rec:ov,score:0.9,reasons:['vendor chosen']}:rcAliasHit(sid,d,'vendor',vendors)||rcBestPayee(vendors,d,false)||(()=>{const f=findVendorMatch(d,vendors)||(typeof payeeByToken==='function'?payeeByToken('vendor',d,vendors):null);return f?{rec:f,score:0.55,reasons:['name']}:null;})();
      if(vp){let plan=rcBillPlan(vp.rec,amt,inv,left);const v=vp.rec;
        // TDS: the bill less the vendor's TDS rate (else 1 / 2 / 10%) equals the payment → link with the TDS part
        if(!plan||plan.how==='oldest'||plan.how==='short'){const rates=[...new Set([Number(v.tdsRate)||0,1,2,10].filter(r=>r>0))];
          const open=inv.filter(i=>String(i.vendorId)===String(v.id)&&left[i.id]>0.5);let hit=null;
          for(const r of rates){const c=open.filter(i=>Math.abs(Math.round(left[i.id]*(1-r/100))-amt)<=1);if(c.length===1){hit={i:c[0],r};break;}}
          if(hit)plan={how:'tds',rate:hit.r,allocations:[{id:hit.i.id,invoiceNo:hit.i.invoiceNo||hit.i.id,amount:amt,tds:Math.round((left[hit.i.id]-amt)*100)/100}]};}
        if(plan&&plan.allocations){const sure=plan.how==='exact'||plan.how==='combo'||plan.how==='tds';const sc=sure?Math.min(0.98,0.6+vp.score*0.4)-(plan.how==='tds'?0.03:0):0.66;
          alts.push({score:sc,conf:sc>=0.9?'high':'mid',label:(plan.allocations.length>1?'Pays '+plan.allocations.length+' bills of ':'Pays bill '+plan.allocations[0].invoiceNo+' · ')+v.name,
            why:plan.allocations.map(a=>a.invoiceNo+' '+M(a.amount)+(a.tds?' + TDS '+M(a.tds):'')).join(' + '),reasons:[...vp.reasons,plan.how==='exact'?'= open bill':plan.how==='combo'?'= '+plan.allocations.length+' open bills':plan.how==='tds'?'= bill less '+plan.rate+'% TDS':'oldest bills first (part)'],
            apply:{type:'link',plan:{vendor:v,allocations:plan.allocations}}});}
        else alts.push({score:Math.min(0.8,0.4+vp.score*0.4),conf:'mid',label:'Vendor Payment · '+v.name+(plan&&plan.how==='short'?' (bills only '+M(plan.total)+')':' (no open bill)'),why:plan&&plan.how==='short'?'Add the missing bill on Vendor Sheet, then link':'No unpaid bill of '+v.name+' — mapped as a payment to them',
          reasons:vp.reasons,apply:{type:'patch',patch:{nature:'Vendor Payment',vendorOverride:v.name}}});}
    }
    // 3b · statutory challans in the Due Date register (PF / ESIC / PT / TDS) of the same amount
    if(it.task==='map'){const lo=d.toLowerCase();
      dueOpen.forEach(du=>{if(Math.abs((Number(du.amount)||0)-amt)>2)return;const kw=RC_DUE_KW[du.type];const named=kw&&kw.test(lo);
        alts.push({score:named?0.94:0.8,conf:named?'high':'mid',label:du.type+' · '+(RPT_MONTHS[du.month]||'')+' '+(du.year||''),why:du.desc||'',reasons:[named?'challan narration':'same amount','Due Date register'],apply:{type:'due',due:du}});});}
    // 3c · money moved to one of your other outlets (the same amount came in there within a day)
    if(it.task==='map'){const o=rcOtherOutletPair(sid,x,others);if(o)alts.push({score:0.9,conf:'high',label:'Transfer to '+o.name,why:'The same '+M(amt)+' came into '+o.name+' on '+o.r.transactionDate,reasons:['inter-outlet transfer'],apply:{type:'transfer',other:{sid:o.sid,id:o.r.id,name:o.name}}});}
    // 3d · advance: an employee is named but the amount is less than (or not) what is due
    if(pm&&it.task!=='bill'&&!alts.some(a=>a.apply&&a.apply.type==='pay'&&a.score>=0.8)){const emps=empsFor(pm.year,pm.month);const ep2=rcAliasHit(sid,d,'emp',emps)||rcBestPayee(emps,d,true);
      if(ep2&&ep2.score>=0.45){const nx=new Date((toISO(x.date)||localIsoOf(new Date()))+'T00:00:00');nx.setMonth(nx.getMonth()+1,1);
        alts.push({score:0.55,conf:'low',label:'Advance to '+ep2.rec.name,why:'Recorded on the Advances sheet, recovered from salary from '+RPT_MONTHS[nx.getMonth()].slice(0,3)+' '+nx.getFullYear(),reasons:[...ep2.reasons,'advance'],
          apply:{type:'advance',line:{employeeId:ep2.rec.id,employeeName:ep2.rec.name,amount:String(amt),deductFrom:'Salary',deductionStart:localIsoOf(nx).slice(0,7),reason:'Advance — Bank Reconcile'}}});
        it.payee={e:ep2.rec,pm};}}
    // 4 · the existing engine's suggestion
    if(bs)alts.push({...bs,score:bs.conf==='high'?0.93:bs.conf==='mid'?0.72:0.45,reasons:[bs.why]});
    // 4b · common bank lines the narration rules don't know: card MDR recovery, ATM withdrawals
    if(!alts.length){const lo=d.toLowerCase();
      if(/\bmdr\b|merchant discount/.test(lo))alts.push({score:0.88,conf:'mid',label:'Bank Charges',why:'MDR — the bank’s commission on card sales',reasons:['MDR in narration'],apply:{type:'patch',patch:{nature:'Bank Charges'}}});
      else if(/^atw[- ]|\batm\b|\bnwd\b|cash wdl|cash withdrawal/.test(lo))alts.push({score:0.9,conf:'high',label:'Cash Withdrawal',why:'ATM / cash withdrawal',reasons:['ATM in narration'],apply:{type:'patch',patch:{nature:'Cash Withdrawal'}}});}
    // 5 · recurring payee: lines to the same payee in other months mapped the same way
    if(!alts.length){const pn=rcPayeeName(d);const ifsc=bankIfscOf(d);
      if(pn||ifsc){const same=rows.filter(r=>r&&r.id!==x.id&&Number(r.debit)>0&&r.nature&&((pn&&rcPayeeName(r.description)===pn)||(ifsc&&bankIfscOf(r.description)===ifsc&&rcNameScore(pn||'',r.description)>=0.5)));
        const by={};same.forEach(r=>{const k=r.nature+'|'+(r.vendorOverride||'');(by[k]=by[k]||new Set()).add(rcMonthKey(r.transactionDate));});
        const top=Object.entries(by).sort((a,b)=>b[1].size-a[1].size)[0];
        if(top&&top[1].size>=2){const [nat,vo]=top[0].split('|');alts.push({score:top[1].size>=3?0.9:0.78,conf:top[1].size>=3?'high':'mid',label:nat+(vo&&!vo.startsWith('EMP:')?' · '+vo:''),why:'Paid to '+(pn||ifsc)+' the same way in '+top[1].size+' other months',
          reasons:['recurring payee',top[1].size+' months'],apply:{type:'patch',patch:vo&&!vo.startsWith('EMP:')?{nature:nat,vendorOverride:vo}:{nature:nat}},recurring:{payee:pn||ifsc,nature:nat,vendorOverride:vo&&!vo.startsWith('EMP:')?vo:''}});}}}
    alts.sort((a,b)=>b.score-a.score);
    it.s=alts[0]||null;
    // a bill proposed for this line isn't offered to the next one
    if(it.s&&it.s.apply&&it.s.apply.type==='link')it.s.apply.plan.allocations.forEach(a=>{left[a.id]=Math.round(((left[a.id]||0)-a.amount)*100)/100;});
    if(!it.s&&x.side==='Debit'&&rcPayeeName(d))it.newPayee=rcPayeeName(d);
    // pay of a locked month: the bank line is linked, nothing in the locked month changes (rcLinkPayLocked)
    if(it.s&&it.s.apply&&it.s.apply.type==='pay'&&it.s.apply.plan&&it.s.apply.plan.lines){const p=it.s.apply.plan;
      if((monthLockRecordFor(sid,p.year,p.month)||{}).locked)it.s={...it.s,why:RPT_MONTHS[p.month]+' '+p.year+' is locked — OK links the bank line only (Salary / Incentive Working stay as they are)',reasons:[...(it.s.reasons||[]),'month locked']};}
  });
  // #3 · two (or three) payments to one employee in a month that together make that month's net pay
  const byEmp={};items.forEach(it=>{if(it.payee&&it.x.side==='Debit'&&!(it.s&&it.s.apply&&it.s.apply.type==='pay'&&it.s.score>=0.8)){const k=it.payee.e.id+'|'+it.payee.pm.year+'|'+it.payee.pm.month;(byEmp[k]=byEmp[k]||[]).push(it);}});
  Object.values(byEmp).forEach(g=>{if(g.length<2)return;const {e,pm}=g[0].payee;const du=rcDues(sid,e,pm.year,pm.month,rows);
    for(const k of ['sal','inc']){const tot=g.reduce((t,i)=>t+i.x.debit,0);if(du[k]>0&&Math.abs(tot-du[k])<=1){
      g.forEach(it=>{const other=g.filter(o=>o!==it).map(o=>o.x.date+' '+M(o.x.debit)).join(', ');
        it.s={score:0.82,conf:'mid',label:(k==='sal'?'Salary ':'Incentive ')+RPT_MONTHS[pm.month].slice(0,3)+' '+pm.year+' · '+e.name+' (part)',why:'With '+other+' this makes the '+(k==='sal'?'net pay':'incentive')+' of '+M(du[k])+'. Mark it Paid in '+(k==='sal'?'Salary':'Incentive')+' Working once both are linked.',
          reasons:['payments add up to net','2+ transfers'],apply:{type:'pay',plan:{year:pm.year,month:pm.month,lines:[{employeeId:e.id,employeeName:e.name,salaryAmt:k==='sal'?it.x.debit:0,incentiveAmt:k==='inc'?it.x.debit:0}]}}};it.alts.unshift(it.s);});break;}}});
  // #9 · possible duplicates: same amount and payee within 3 days (also when Controls' duplicate warning is off)
  let dupMap={};try{dupMap=bankDuplicateMap(sid,rows)||{};}catch(e){}
  const tOf=r=>{const i=toISO(r.transactionDate||r.date);return i?new Date(i+'T00:00:00').getTime():0;};
  items.forEach(it=>{const x=it.x;let dl=dupMap[x.id];
    if(!dl){const amt=x.debit||x.credit;const pn=rcPayeeName(x.description);const t=tOf(x);
      dl=pn?inMonth.filter(r=>r.id!==x.id&&Math.abs((x.side==='Debit'?Number(r.debit):Number(r.credit))-amt)<=0.5&&rcPayeeName(r.description)===pn&&Math.abs(tOf(r)-t)<=3*864e5):[];}
    if(dl&&dl.length){it.dup=dl;if(it.s)it.s={...it.s,score:Math.min(it.s.score,0.7),reasons:[...(it.s.reasons||[]),'possible duplicate of '+dl[0].transactionDate+' '+M(Number(dl[0].debit)||Number(dl[0].credit))]};}});
  // #8 · "Sure" from the score set in Controls; vendor bill links can be kept to Check
  const sureAt=rcSureAt(sid);const vSure=typeof controlOn!=='function'||controlOn('rcVendorSure',sid);
  items.forEach(it=>{const s=it.s;let sc=s?s.score:0;if(s&&!vSure&&s.apply&&s.apply.type==='link')sc=Math.min(sc,sureAt-0.01);
    it.bucket=s?(sc>=sureAt?'sure':'check'):(it.newPayee?'new':'unknown');});
  // card / UPI settlements of the month, grouped by sale day
  return{items,done,settlements:rcSettlementCheck(sid,done),all:inMonth};
}

// Score at which a match is "Sure" (Controls → rcSureLimit, default 90%).
function rcSureAt(sid){try{if(typeof controlOn==='function'&&controlOn('rcSureLimit',sid)){const v=Number(controlLimit('rcSureLimit',sid))||90;return Math.min(0.99,Math.max(0.5,v/100));}}catch(e){}return 0.9;}
const RC_DUE_KW={'PF Challan':/epfo|\bpf\b|provident/,'ESIC Challan':/esic/,'PT Payment':/\bpt\b|prof(essional)? ?tax|ptax/,'TDS Payment':/\btds\b|cbdt|oltas|itns|income tax/};
const RC_DUE_NATURE={'PF Challan':'PF Payment','ESIC Challan':'ESIC Payment','PT Payment':'PT Payment','TDS Payment':'TDS'};
// The other side of an inter-outlet transfer: same amount, opposite side, within a day, not mapped yet.
function rcOtherOutletPair(sid,x,others){
  const iso=toISO(x.date);if(!iso)return null;const t=new Date(iso+'T00:00:00').getTime();const amt=x.debit||x.credit;
  for(const o of others||[]){const r=o.rows.find(r=>r&&!r.transferOf&&(!r.nature||r.nature==='Transfer')&&Math.abs((x.side==='Debit'?Number(r.credit):Number(r.debit))-amt)<=0.5&&(()=>{const i=toISO(r.transactionDate);return i&&Math.abs(new Date(i+'T00:00:00').getTime()-t)<=864e5;})());
    if(r)return{...o,r};}
  return null;
}
// Contributors of a statutory due item, as the Due Date register ticks them when it is paid.
function rcDueParties(sid,d){try{const W=swWorkingsFinalFor(sid,d.year,d.month)||[];
  if(d.type==='PF Challan')return W.filter(e=>e.pf&&((e.pfEmp||0)+(e.pfEr||0))>0).map(e=>e.id);
  if(d.type==='ESIC Challan')return W.filter(e=>e.esic&&e.gross<=21000&&((e.esicEmp||0)+(e.esicEr||0))>0).map(e=>e.id);
  if(d.type==='PT Payment')return W.filter(e=>(e.ptAmt||0)>0).map(e=>e.id);
  if(d.type==='TDS Payment'){const rec=loadRecurringExpenses(sid).filter(it=>it.status==='Active'&&it.tdsApplicable&&it.tdsSection);return tdsPartyDetailForMonth(sid,d.year,d.month,rec).map(p=>p.key);}}catch(e){}return[];}
// Links a bank debit to employees' salary / incentive of a LOCKED month. Only the bank line gets the
// settlement (who, which month, how much) — Salary / Incentive Working of the locked month are not
// touched, so nothing that was locked changes. Same checks as settleBankLineToEmployees otherwise.
function rcLinkPayLocked(sid,row,year,month,lines){
  const act=(lines||[]).filter(l=>(Number(l.salaryAmt)||0)+(Number(l.incentiveAmt)||0)>0);
  if(!act.length)return'Nothing to link.';
  const tot=act.reduce((t,l)=>t+(Number(l.salaryAmt)||0)+(Number(l.incentiveAmt)||0),0),deb=Number(row.debit)||0;
  if(tot>deb+1)return rupee0(tot)+' is more than this bank debit ('+rupee0(deb)+').';
  const sw=loadSWMeta(sid),iw=loadIWMeta(sid);
  const settlements=act.map(l=>{const k=attMonthKey(l.employeeId,year,month);const sa=Number(l.salaryAmt)||0,ia=Number(l.incentiveAmt)||0;
    return{employeeId:l.employeeId,employeeName:l.employeeName,year,month,salary:sa,incentive:ia,dailyIncentive:0,dailyIncentiveByCat:{},
      // never "settled by this line": Undo reverses settled pay, and a locked month must not change
      salarySettled:false,incentiveSettled:false,dailyIncentiveSettled:{},lockedMonth:true,
      alreadyPaid:(sa>0&&(sw[k]||{}).paymentStatus==='Paid')||(ia>0&&(iw[k]||{}).paymentStatus==='Paid')};});
  const has=k=>settlements.some(x=>x[k]>0);
  const patch={nature:has('salary')?'Salary':'Incentive',linkedEmployeePay:settlements};
  if(settlements.length===1)patch.vendorOverride='EMP:'+settlements[0].employeeId;
  saveBankLineMapping(sid,row.id,patch);
  try{logAuditEvent(sid,{entity:'Bank Statement',entityId:String(row.id),action:'Salary linked (locked month)',summary:rupee0(tot)+' of '+(row.transactionDate||'')+' — '+settlements.map(x=>x.employeeName).join(', ')+' ('+RPT_MONTHS[month]+' '+year+', month locked: bank line only)'});}catch(e){}
  try{if(settlements.length===1&&typeof learnPayeeTokens==='function')learnPayeeTokens(sid,'emp',settlements[0].employeeId,row.description);}catch(e){}
  return'';
}
// ── Credits ──
// Card / UPI payout from a card network or aggregator (Amex, Pine Labs, Razorpay …), not named "settlement".
const RC_PAYOUT_RE=/american express|\bamex\b|pine ?labs|mswipe|razorpay|\bpayu\b|cashfree|ezetap|worldline|innoviti|mosambee|getepay|bharatpe|phonepe|paytm|hdfc merchant|merchant settl|\bmid\b ?\d|\bcms\b/i;
function rcCreditAlts(sid,it,bs,rows,ctx){
  const x=it.x,d=x.description,lo=d.toLowerCase(),alts=it.alts;const M=n=>rupee0(n);
  if(bs)alts.push({...bs,score:bs.conf==='high'?0.95:bs.conf==='mid'?0.75:0.5,reasons:[bs.why]});
  if(!x.nature&&RC_PAYOUT_RE.test(d)){const upi=/upi|phonepe|paytm|bharatpe/i.test(lo)&&!/american express|amex/i.test(lo);const kind=upi?'upi':'card';const n=upi?'UPI Settlement':'Card Settlement';
    const bd=typeof cradleeDateByAmount==='function'?cradleeDateByAmount(sid,x,kind,ctx):null;
    if(bd){ctx.claimed[kind+'|'+bd.dmy]=1;alts.push({score:0.92,conf:'high',label:n+' · sales of '+bd.dmy,why:M(bd.tot)+' '+kind.toUpperCase()+' sales that day, less '+(bd.fee*100).toFixed(2)+'% charges',reasons:['payout from '+(rcParse(d).name||'card network'),'= day sales less charges'],apply:{type:'patch',patch:{nature:n,cradleeDate:bd.dmy}}});}
    else{const pd=bmapPrevDay(x.date);alts.push({score:0.74,conf:'mid',label:n+(pd?' · '+pd:''),why:'Payout from '+(rcParse(d).name||'a card network')+' — no day’s sales match the amount; sale date taken as the day before',reasons:['card network payout'],apply:{type:'patch',patch:{nature:n,cradleeDate:pd}}});}}
  if(!x.nature&&/chq dep|cheque dep|\bclg\b|clearing|chq\/|\/chq/.test(lo))alts.push({score:0.75,conf:'mid',label:'Collection (cheque)',why:'Cheque deposited'+(rcParse(d).name?' from '+rcParse(d).name:''),reasons:['cheque deposit'],apply:{type:'patch',patch:{nature:'Collection'}}});
  // #22 · delivery-app payouts (restaurants): Swiggy (Bundl Technologies), Zomato, EazyDiner
  if(!x.nature){const ag=/swiggy|bundl tech/.test(lo)?'Swiggy Settlement':/zomato/.test(lo)?'Zomato Settlement':/eazydiner|eazy diner/.test(lo)?'EazyDiner Settlement':'';
    if(ag)alts.push({score:0.93,conf:'high',label:ag,why:'Payout from '+ag.replace(' Settlement','')+' — checked against the app’s orders in Swiggy, Zomato & Other Apps',reasons:['delivery app payout'],apply:{type:'patch',patch:{nature:ag}}});}
  // #23 · cash deposit: the Bank Deposit entered in Daily Sales & Exp on the day (or up to 3 days before)
  if(!x.nature&&/cash dep|by cash|csh dep|\bcdm\b|cash deposit|cash-dep|bna/.test(lo)){const dep=rcDseDeposits(sid);const iso=toISO(x.date)||'';let hit=null;
    for(let k=0;k<=3&&!hit;k++){const d0=new Date(iso+'T00:00:00');d0.setDate(d0.getDate()-k);const di=localIsoOf(d0);if(dep[di]&&Math.abs(dep[di]-x.credit)<=1)hit=di;}
    alts.push(hit?{score:0.96,conf:'high',label:'Cash Deposit',why:'Equals the Bank Deposit of '+M(x.credit)+' in Daily Sales & Exp on '+hit.split('-').reverse().join('/'),reasons:['= Daily Sales deposit'],apply:{type:'patch',patch:{nature:'Cash Deposit'}}}
      :{score:0.78,conf:'mid',label:'Cash Deposit',why:'No Bank Deposit of this amount in Daily Sales & Exp in the 3 days before — check the cash register',reasons:['cash deposit narration','not in Daily Sales'],apply:{type:'patch',patch:{nature:'Cash Deposit'}}});}
  // #21 · a client paying their unpaid bills (name or mobile number in the narration)
  if(!x.nature){const c=rcClientDue(sid,d,x.credit);
    if(c)alts.push({score:c.exact?0.88:0.7,conf:'mid',label:'Customer payment · '+c.name,why:c.exact?'Equals '+(c.bills.length>1?c.bills.length+' unpaid bills':'unpaid bill')+' '+c.bills.map(b=>b.no).join(', ')+' — record the receipt in Billing':'Client has '+M(c.total)+' unpaid ('+c.bills.length+' bill'+(c.bills.length===1?'':'s')+')',
      reasons:[c.by,'unpaid bills'],apply:{type:'patch',patch:{nature:'Collection',mapNote:'Client '+c.name+': bills '+c.bills.map(b=>b.no).join(', ')}}});}
  // the same payer mapped the same way in other months (loans from a director, rent deposits …)
  if(!x.nature){const pn=rcPayeeName(d);if(pn){const by={};rows.forEach(r=>{if(r&&r.id!==x.id&&Number(r.credit)>0&&r.nature&&rcPayeeName(r.description)===pn)(by[r.nature]=by[r.nature]||new Set()).add(rcMonthKey(r.transactionDate));});
    const top=Object.entries(by).sort((a,b)=>b[1].size-a[1].size)[0];
    if(top)alts.push({score:top[1].size>=2?0.88:0.72,conf:'mid',label:top[0],why:'Money from '+pn+' was mapped as '+top[0]+' before ('+top[1].size+' month'+(top[1].size===1?'':'s')+')',reasons:['same payer before'],apply:{type:'patch',patch:{nature:top[0]}},recurringCr:true});
    else if(x.credit>=50000&&!RC_PAYOUT_RE.test(d))it.newPayee=pn;}}
  alts.sort((a,b)=>b.score-a.score);it.s=alts[0]||null;
}
// Bank Deposit (cash taken to the bank) per day from Daily Sales & Exp — row 11 of the sales rows.
function rcDseDeposits(sid){const out={};try{const D=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',sid))||'{}')||{};
  Object.keys(D).forEach(iso=>{const v=Number((D[iso]||{})[11])||0;if(v>0)out[iso]=v;});}catch(e){}return out;}
// A client named (or whose mobile is) in the narration, with unpaid Billing bills.
function rcClientDue(sid,desc,amt){
  if(typeof fdClients!=='function'||typeof fdBills!=='function'||typeof fdBillDue!=='function')return null;
  const D=String(desc||'');const digits=rcDigits(D);const pn=rcParse(D).name||D;let best=null;
  const bills=(typeof fdBillsRO==='function'?fdBillsRO(sid):fdBills(sid)).filter(b=>fdBillDue(b)>0.5);if(!bills.length)return null;
  const byPhone={};bills.forEach(b=>{const p=String(b.phone||'').replace(/\D/g,'').slice(-10);if(p.length===10)(byPhone[p]=byPhone[p]||[]).push(b);});
  fdClients(sid).forEach(c=>{if(!c||c.erased)return;const p=String(c.phone||'').replace(/\D/g,'').slice(-10);const L=byPhone[p];if(!L)return;
    const byNum=p.length===10&&digits.includes(p);const n=rcNameScore(c.name||'',pn,4);if(!byNum&&n<1)return;
    const total=L.reduce((t,b)=>t+fdBillDue(b),0);const one=L.find(b=>Math.abs(fdBillDue(b)-amt)<=1);const exact=!!one||Math.abs(total-amt)<=1;
    const cand={name:c.name||p,by:byNum?'mobile no. in narration':'client name',total,exact,bills:(one?[one]:L).map(b=>({no:b.invoiceNo||b.no||b.id,due:fdBillDue(b)}))};
    if(!best||(exact&&!best.exact))best=cand;});
  return best;
}
// Card / UPI settlements of the month by sale day, against that day's Cradlee sales.
function rcSettlementCheck(sid,lines){
  const tot=typeof cradleeDayTotals==='function'?cradleeDayTotals(sid):{};const g={};
  (lines||[]).forEach(r=>{if(!(Number(r.credit)>0)||!/^(Card|UPI) Settlement$/.test(String(r.nature||'')))return;const kind=r.nature==='UPI Settlement'?'upi':'card';const day=r.cradleeDate||'';
    const k=kind+'|'+day;const e=g[k]||(g[k]={day,kind,nature:r.nature,bank:0,n:0});e.bank+=Number(r.credit)||0;e.n++;});
  return Object.values(g).map(e=>{const sales=e.day?((tot[e.day]||{})[e.kind]||0):0;const diff=sales-e.bank;const pct=sales>0?diff/sales*100:null;
    // Up to 4.5% below sales is charges; up to 3% above is late / early transactions of the next day; ±₹300 is rounding.
    const status=!e.day?'no sale date':!(sales>0)?'no sales imported for that day':(Math.abs(diff)<=300||(pct>=-3&&pct<=4.5))?'ok':diff<0?'bank '+Math.abs(pct).toFixed(1)+'% more than sales':'short '+pct.toFixed(1)+'%';return{...e,sales,diff,pct,status};})
    .sort((a,b)=>String(toISO(b.day)||'').localeCompare(String(toISO(a.day)||''))||a.kind.localeCompare(b.kind));
}
// Applies one suggestion; '' when done, else the reason. Remembers what was accepted.
// ── Month sign-off (Controls → rcSignOff): {ym:{by,at}} per outlet ──
function rcLoadSignoffs(sid){try{return JSON.parse(cachedLocalGet(outletKey('salonos_bank_reco_signoff',sid))||'{}')||{};}catch(e){return{};}}
function rcSignedOff(sid,ym){return rcLoadSignoffs(sid)[ym]||null;}
function rcSetSignoff(sid,ym,rec){const S=rcLoadSignoffs(sid);if(rec)S[ym]=rec;else delete S[ym];safeLocalSet(outletKey('salonos_bank_reco_signoff',sid),JSON.stringify(S));
  try{logAuditEvent(sid,{entity:'Bank Reconcile',entityId:ym,action:rec?'Month signed off':'Month reopened',summary:ym+(rec?' signed off by '+rec.by:' reopened')});}catch(e){}}
function rcLocked(sid,ym){return !!(rcSignedOff(sid,ym)&&(typeof controlOn!=='function'||controlOn('rcSignOff',sid)));}
function rcApply(sid,it,s){
  if(rcLocked(sid,rcMonthKey(it.x.date)))return'This month is signed off in Reconcile — a Super Admin can reopen it.';
  // #24 · a second person above the limit (Controls → rcApproveAbove)
  const amt0=it.x.debit||it.x.credit;
  if(typeof controlOn==='function'&&controlOn('rcApproveAbove',sid)&&amt0>(Number(controlLimit('rcApproveAbove',sid))||100000)
    &&!requireApproval({control:'rcApproveAbove',sid,key:sid+'|rc|'+it.x.id+'|'+s.label,summary:'Reconcile '+(it.x.date||'')+' '+rupee0(amt0)+' as '+s.label}))return'Sent for approval — apply it again once a Super Admin approves.';
  const rows=bankRowsFor(sid);const row=rows.find(r=>r.id===it.x.id)||it.row;let err='';
  try{
    if(s.apply.type==='link'){err=linkBankLineToBills(sid,row,s.apply.plan.vendor,s.apply.plan.allocations.map(a=>({id:a.id,amount:a.amount,tds:a.tds})));if(!err)journalBankMapping(sid,row,'Reconcile: linked to '+s.apply.plan.allocations.map(a=>a.invoiceNo).join(', '));}
    else if(s.apply.type==='pay'&&s.apply.plan.lines){const p=s.apply.plan;const locked=!!(monthLockRecordFor(sid,p.year,p.month)||{}).locked;
      if(locked)journalBankMapping(sid,row,'Reconcile: '+p.lines.map(l=>l.employeeName).join(', ')+' '+RPT_MONTHS[p.month]+' (locked month — bank line only)');
      err=locked?rcLinkPayLocked(sid,row,p.year,p.month,p.lines):settleBankLineToEmployees(sid,row,p.year,p.month,p.lines);
      if(!err&&!locked)journalBankMapping(sid,row,'Reconcile: '+p.lines.map(l=>l.employeeName).join(', ')+' '+RPT_MONTHS[p.month]);}
    else if(s.apply.type==='due'){const du=s.apply.due;journalBankMapping(sid,row,'Reconcile: '+du.type+' '+(RPT_MONTHS[du.month]||''));
      saveDueAutoOverride(sid,du.id,{paidKeys:Object.fromEntries(rcDueParties(sid,du).map(k=>[k,true])),paidAmount:String(row.debit),paidDate:toISO(row.transactionDate),ref:row.refNo||'',bankRowId:row.id});
      saveBankLineMapping(sid,row.id,{nature:RC_DUE_NATURE[du.type]||'Other',linkedInvoice:'due|'+du.id,aiTagged:false});}
    else if(s.apply.type==='transfer'){const o=s.apply.other;const orow=bankRowsFor(o.sid).find(r=>r.id===o.id);if(!orow)err='The other outlet’s line is gone.';
      else{journalBankMapping(sid,row,'Reconcile: transfer to '+o.name);journalBankMapping(o.sid,orow,'Reconcile: transfer from another outlet');
        saveBankLineMapping(sid,row.id,{nature:'Transfer',transferOf:o.sid+'|'+o.id,aiTagged:false});saveBankLineMapping(o.sid,o.id,{nature:'Transfer',transferOf:sid+'|'+row.id,aiTagged:false});}}
    else if(s.apply.type==='advance'){journalBankMapping(sid,row,'Reconcile: advance '+s.apply.line.employeeName,{advBefore:loadAdvances(sid)||[]});err=recordBankLineAdvances(sid,row,[s.apply.line]);}
    else err=applyBankSuggestion(sid,it.x,s,null,rows,'Reconcile: ');
    // remember who this payee is, so the next payment to the same name / IFSC is Sure
    if(!err&&s.apply.type==='pay'&&s.apply.plan.lines&&s.apply.plan.lines.length===1)rcSaveAlias(sid,row.description,'emp',s.apply.plan.lines[0].employeeId);
    if(!err&&s.apply.type==='link'&&s.apply.plan.vendor)rcSaveAlias(sid,row.description,'vendor',s.apply.plan.vendor.id);
  }catch(e){err=(e&&e.message)||String(e);}
  if(!err){if(s.payout)rcMarkPayout(sid,s.payout,row.id);try{noteBankFeedback(sid,it.x,typeof suggestionNature==='function'?(suggestionNature(s)||s.label):s.label,true);}catch(e){}}
  return err;
}
// A rule for a recurring payee is offered once it has been paid the same way in 2+ months.
function rcRuleFor(sid,it,s){if(!s||!s.recurring)return null;const r=s.recurring;const rules=loadBankRules(sid);
  if(rules.some(z=>z.side==='Debit'&&z.contains&&String(z.contains).toLowerCase()===String(r.payee).toLowerCase()))return null;return r;}
// Statement balance check: each line's closing balance = the one before ± the line (either order).
function rcBalanceCheck(lines){
  const L=(lines||[]).filter(r=>r&&r.closingBalance!==''&&r.closingBalance!=null&&isFinite(Number(r.closingBalance)));if(L.length<2)return null;
  const gaps=dir=>{let g=0;for(let i=1;i<L.length;i++){const a=dir?L[i-1]:L[i],b=dir?L[i]:L[i-1];const exp=Number(a.closingBalance)+(Number(b.credit)||0)-(Number(b.debit)||0);if(Math.abs(exp-Number(b.closingBalance))>1)g++;}return g;};
  const g=Math.min(gaps(true),gaps(false));return{gaps:g,checked:L.length-1};
}
function rcAccuracy(sid){try{const U=JSON.parse(cachedLocalGet(outletKey('salonos_bank_sugg_users',sid))||'{}')||{};const mo=localIsoOf(new Date()).slice(0,7);let a=0,r=0;
  Object.entries(U).forEach(([k,v])=>{if(k.endsWith('|'+mo)){a+=Number(v.acc)||0;r+=Number(v.rej)||0;}});return a+r?{pct:Math.round(a/(a+r)*100),n:a+r}:null;}catch(e){return null;}}

// ── The screen ──
const RC_CREDIT_CHOICES=[['Unsecured Loan','Loan received'],['Capital Introduced','Capital introduced'],['Collection','Customer payment'],['Card Settlement','Card settlement'],['UPI Settlement','UPI settlement'],['Cash Deposit','Cash deposit'],['Refund','Refund'],['Transfer','Transfer']];
const RC_DEBIT_CHOICES=[['Loan Principal','Loan repaid'],['Drawings','Owner drawing'],['Rent','Rent'],['Transfer','Transfer'],['Other','Other']];
function BankReconcileSheet({salon,period,onNavTab}){
  const h=React.createElement;const sid=salon&&salon.id;const {toast,error:toastErr}=useToast();
  const cal=typeof periodToCalendar==='function'?periodToCalendar(period):null;
  const [ym,setYm]=useState(()=>cal?cal.year+'-'+String(cal.month+1).padStart(2,'0'):localIsoOf(new Date()).slice(0,7));
  const [tick,setTick]=useState(0);const [filter,setFilter]=useState('todo');const [q,setQ]=useState('');const [sel,setSel]=useState(0);const [open,setOpen]=useState(null);
  const [side,setSide]=useState('all'); // all / Debit / Credit
  const [view,setView]=useState(()=>{try{return localStorage.getItem('sos_rc_view')==='review'?'review':'classic';}catch(e){return'classic';}}); /* classic, or the For review layout (js/75) */
  const [typeF,setTypeF]=useState(null); // salary / vendor / settle / other
  const [panel,setPanel]=useState(null);const [checked,setChecked]=useState(()=>new Set());const [skipped,setSkipped]=useState(()=>new Set());
  const [rule,setRule]=useState(null);const [busy,setBusy]=useState(false);const [showSet,setShowSet]=useState(false);const searchRef=useRef(null);const listRef=useRef(null);const touch=useRef(null);
  const [phone,setPhone]=useState(()=>typeof matchMedia==='function'&&matchMedia('(max-width:640px)').matches);
  useEffect(()=>{if(typeof matchMedia!=='function')return;const mq=matchMedia('(max-width:640px)');const f=()=>setPhone(mq.matches);mq.addEventListener?mq.addEventListener('change',f):mq.addListener(f);return()=>{mq.removeEventListener?mq.removeEventListener('change',f):mq.removeListener(f);};},[]);
  const data=useMemo(()=>sid==null?null:rcBuild(sid,ym),[sid,ym,tick,storeVersion()]);
  const months=useMemo(()=>{const s=new Set();bankRowsFor(sid).forEach(r=>{const k=rcMonthKey(r&&r.transactionDate);if(k)s.add(k);});s.add(ym);return[...s].sort().reverse();},[sid,tick]);
  useEffect(()=>{const el=listRef.current&&listRef.current.querySelector('[data-rc-sel="1"]');if(el&&el.scrollIntoView)el.scrollIntoView({block:'nearest'});},[sel,filter]);
  useEffect(()=>{setChecked(new Set());setSkipped(new Set());},[ym,sid]);
  if(!data)return null;
  const M=n=>rupee0(n);
  const rv=view==='review'&&!phone&&typeof RcReviewTable==='function';
  const pickView=v=>{setView(v);setOpen(null);try{localStorage.setItem('sos_rc_view',v);}catch(e){}};
  const user=typeof currentSessionUser==='function'?currentSessionUser():null;const isSA=typeof isSuperAdminUser==='function'&&isSuperAdminUser(user);
  const so=rcSignedOff(sid,ym);const locked=rcLocked(sid,ym);
  // what a line is about, for the summary strip and its filter
  const typeOf=it=>{const t=it.s&&it.s.apply&&it.s.apply.type;const n=it.x.nature;
    if(it.task==='pay'||t==='pay'||t==='advance'||/^(Salary|Incentive|Advance Salary)$/.test(n))return'salary';
    if(it.task==='bill'||t==='link'||n==='Vendor Payment')return'vendor';
    if(it.x.side==='Credit'&&(/Settlement$/.test(n)||/Settlement/.test((it.s&&it.s.label)||'')))return'settle';return'other';};
  const rowType=r=>{const n=String(r.nature||'');if(/^(Salary|Incentive|Advance Salary|Daily Incentive)$/.test(n))return'salary';if(n==='Vendor Payment'||r.linkedInvoice&&!String(r.linkedInvoice).startsWith('due|'))return'vendor';if(Number(r.credit)>0&&/Settlement$/.test(n))return'settle';return'other';};
  const count=b=>data.items.filter(i=>i.bucket===b).length;
  const total=data.all.length,doneN=data.done.length,pct=total?Math.round(doneN/total*100):100;
  const qq=q.trim().toLowerCase();
  const RANK={sure:0,check:1,new:2,unknown:3};
  const shown=filter==='done'?[]:data.items.filter(i=>(filter==='todo'||i.bucket===filter)&&(side==='all'||i.x.side===side)&&(!typeF||typeOf(i)===typeF)&&!(phone&&skipped.has(i.x.id))&&(!qq||(i.x.description+' '+(i.s?i.s.label:'')+' '+(i.x.debit||i.x.credit)).toLowerCase().includes(qq)))
    .sort((a,b)=>RANK[a.bucket]-RANK[b.bucket]||String(toISO(a.x.date)||'').localeCompare(String(toISO(b.x.date)||''))); // Sure first, then by date
  const cur=shown[Math.min(sel,shown.length-1)];
  const bal=rcBalanceCheck(data.all);const acc=rcAccuracy(sid);
  const refresh=()=>setTick(t=>t+1);
  const ok=(it,s)=>{if(!s)return;const e=rcApply(sid,it,s);if(e){toastErr(e);return false;}const r=rcRuleFor(sid,it,s);if(r)setRule(r);toast('Reconciled · '+s.label,'success');setOpen(null);refresh();return true;};
  const applyMany=(L,what)=>{if(!L.length)return;if(locked){toastErr('This month is signed off — reopen it first.');return;}if(!window.confirm('Apply '+L.length+' '+what+'?'))return;setBusy(true);
    let n=0;const errs=[];L.forEach(it=>{const e=rcApply(sid,it,it.s);if(e)errs.push((it.x.date||'')+' '+M(it.x.debit||it.x.credit)+': '+e);else n++;});setBusy(false);setChecked(new Set());refresh();
    toast(n+' line'+(n===1?'':'s')+' reconciled'+(errs.length?' · '+errs.length+' skipped':''),errs.length?'warning':'success');if(errs.length)window.alert('Not applied:\n\n'+errs.slice(0,12).join('\n'));};
  const okAll=()=>applyMany(data.items.filter(i=>i.bucket==='sure'&&i.s&&!i.dup),'“Sure” matches');
  const mapAs=(it,nature,extra)=>{if(locked){toastErr('This month is signed off — reopen it first.');return;}const row=bankRowsFor(sid).find(r=>r.id===it.x.id);if(!row)return;journalBankMapping(sid,row,'Reconcile: '+nature);saveBankLineMapping(sid,row.id,{nature,aiTagged:false,...(extra||{})});
    if(it.s)try{noteBankFeedback(sid,it.x,typeof suggestionNature==='function'?(suggestionNature(it.s)||it.s.label):it.s.label,false);}catch(e){}toast('Mapped as '+nature,'success');setOpen(null);refresh();};
  const mapMany=nature=>{const L=data.items.filter(i=>checked.has(i.x.id));if(!L.length||locked)return;if(!window.confirm('Map '+L.length+' ticked line'+(L.length===1?'':'s')+' as '+nature+'?'))return;
    L.forEach(it=>{const row=bankRowsFor(sid).find(r=>r.id===it.x.id);if(!row)return;journalBankMapping(sid,row,'Reconcile: '+nature);saveBankLineMapping(sid,row.id,{nature,aiTagged:false,...(/Settlement$/.test(nature)?{cradleeDate:bmapPrevDay(row.transactionDate)}:{})});});
    toast(L.length+' line'+(L.length===1?'':'s')+' mapped as '+nature,'success');setChecked(new Set());refresh();};
  const newVendor=it=>{const name=window.prompt('New vendor name',it.newPayee||rcPayeeName(it.x.description)||'');if(!name||!name.trim())return;const v=addVendorFromNarration(sid,name.trim(),it.x.description);
    mapAs(it,'Vendor Payment',{vendorOverride:v.name});toast('Vendor '+v.name+' added'+(v.ifsc?' with IFSC '+v.ifsc:'')+' — future payments to them match by themselves','success');};
  const toggleCheck=id=>setChecked(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  const sendOwner=()=>{const t=rcExceptionsText(sid,ym,data,salon);const ph=(outletSettings(sid)||{}).ownerPhone;window.open(typeof waPhoneOk==='function'&&waPhoneOk(ph)?waLink(ph,t):'https://wa.me/?text='+encodeURIComponent(t),'_blank');};
  const openTally=()=>{const p=rcYmParts(ym);if(typeof showUnmappedLinesPopup!=='function'){toastErr('The mapping pop-up isn’t available here.');return;}
    showUnmappedLinesPopup(sid,()=>unmappedBankLinesFor(sid,p.year,p.month),'Map bank lines — '+rcYmLabel(ym),'Use “Pull from Tally” here to copy the ledgers already entered in Tally for this month.',onNavTab,{year:p.year,month:p.month});};
  const signOff=()=>{if(data.items.length&&!window.confirm(data.items.length+' line'+(data.items.length===1?' is':'s are')+' not reconciled yet. Sign off '+rcYmLabel(ym)+' anyway?'))return;
    rcSetSignoff(sid,ym,{by:(user&&(user.name||user.email))||'',at:new Date().toISOString(),open:data.items.length});toast(rcYmLabel(ym)+' signed off','success');refresh();};
  const reopen=()=>{if(!isSA){toastErr('Only a Super Admin can reopen a signed-off month.');return;}if(!window.confirm('Reopen '+rcYmLabel(ym)+' for changes?'))return;rcSetSignoff(sid,ym,null);refresh();};
  const onKey=e=>{if(e.target&&['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)){if(e.key==='Escape'){e.target.blur();}return;}
    if(e.key==='ArrowDown'){e.preventDefault();setSel(s=>Math.min(shown.length-1,s+1));}
    else if(e.key==='ArrowUp'){e.preventDefault();setSel(s=>Math.max(0,s-1));}
    else if(e.key==='Enter'&&cur){e.preventDefault();if(cur.s&&cur.bucket==='sure')ok(cur,cur.s);else setOpen(o=>o===cur.x.id?null:cur.x.id);}
    else if(e.key===' '&&cur){e.preventDefault();toggleCheck(cur.x.id);}
    else if(e.key==='/'){e.preventDefault();searchRef.current&&searchRef.current.focus();}
    else if(e.key==='Escape')setOpen(null);};
  const pill=(b)=>({sure:['Sure','var(--green)','rgba(46,160,90,0.12)'],check:['Check','#b26a00','rgba(224,165,48,0.15)'],new:['New payee','var(--accent)','rgba(47,95,224,0.1)'],unknown:['Unknown','var(--text3)','var(--bg3)']})[b];
  const EDGE={sure:'var(--green)',check:'#e0a530',new:'var(--accent)',unknown:'var(--border2)'};
  const chip=t=>h('span',{key:t,style:{display:'inline-block',fontSize:11,padding:'1px 8px',borderRadius:999,margin:'4px 4px 0 0',background:'var(--bg3)',color:'var(--text2)'}},t);
  const F=[['todo','To review',data.items.length],['sure','Sure',count('sure')],['check','Check',count('check')],['new','New payee',count('new')],['unknown','Unknown',count('unknown')],['done','Done',doneN]];
  // #12 · summary by type (linked / open amounts); a click filters the list
  const sumOf=k=>{const D=data.done.filter(r=>rowType(r)===k),O=data.items.filter(i=>typeOf(i)===k);const amt=r=>Number(r.debit)||Number(r.credit)||0;
    return{done:D.reduce((t,r)=>t+amt(r),0),open:O.reduce((t,i)=>t+(i.x.debit||i.x.credit),0),nOpen:O.length};};
  const ST=[['salary','👤 Salary & incentive'],['vendor','🏭 Vendors'],['settle','💳 Card / UPI'],['other','📄 Other']];
  const balB=typeof rcBalanceBreaks==='function'?rcBalanceBreaks(data.all).length:0;const noSales=data.settlements.filter(g=>g.day&&!(g.sales>0)).length;
  const P=[[ 'outlets','🏬 All outlets'],['expected','📅 Expected'],['bills','🧾 Unpaid bills'],['breaks','⚖ Balance breaks'+(balB?' '+balB:'')],['sales','📥 Sales not imported'+(noSales?' '+noSales:'')],['deposits','💵 Cash deposits'],['loans','🏦 Loans'],['payees','👥 Set up payees'],['recent','↶ Recent changes']];
  const panelBody={outlets:()=>h(RcAllOutlets,{ym,onDone:refresh}),expected:()=>h(RcExpected,{sid,ym}),bills:()=>h(RcUnpaidBills,{sid,onNavTab}),breaks:()=>h(RcBreaks,{lines:data.all}),
    sales:()=>h(RcMissingSales,{data,onNavTab}),deposits:()=>h(RcDeposits,{sid,ym,lines:data.all}),loans:()=>h(RcLoans,{sid,onNavTab}),payees:()=>h(RcPayeeSetup,{sid,onDone:refresh}),recent:()=>h(RcRecent,{sid,onDone:refresh})};
  // the review panel under a line (matches, why, other choices)
  const reviewBody=(it)=>{const x=it.x,s=it.s,cr=x.side==='Credit';return h(React.Fragment,null,
    h('div',{style:{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',margin:'6px 0 2px'}},'Why'),
    h('ul',{style:{margin:'0 0 6px 18px',padding:0,fontSize:12,color:'var(--text2)'}},rcExplain(sid,it).map((l,k)=>h('li',{key:k},l))),
    (it.alts||[]).length>0&&h('div',{style:{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',margin:'6px 0 4px'}},'Matches'),
    (it.alts&&it.alts.length?it.alts:(s?[s]:[])).slice(0,4).map((a,k)=>h('div',{key:k,style:{display:'flex',gap:8,alignItems:'center',padding:'4px 0',borderBottom:'1px dashed var(--border)'}},
      h('span',{style:{fontSize:11,minWidth:38,color:a.score>=0.9?'var(--green)':'#b26a00',fontWeight:600}},Math.round(a.score*100)+'%'),
      h('div',{style:{flex:1,minWidth:0}},h('div',{style:{fontSize:12.5}},a.label),h('div',{style:{fontSize:11.5,color:'var(--text3)'}},[a.why,...(a.reasons||[])].filter(Boolean).join(' · '))),
      h('button',{className:'btn btn-primary btn-sm',disabled:locked,onClick:()=>{if(a!==s&&s)try{noteBankFeedback(sid,x,typeof suggestionNature==='function'?(suggestionNature(s)||s.label):s.label,false);}catch(e){}ok(it,a);}},'Use this'))),
    h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginTop:8,alignItems:'center'}},
      !cr&&h('button',{className:'btn btn-ghost btn-sm',disabled:locked,onClick:()=>newVendor(it)},'＋ New vendor'),
      !cr&&RC_DEBIT_CHOICES.map(([n,l])=>h('button',{key:n,className:'btn btn-ghost btn-sm',disabled:locked,onClick:()=>mapAs(it,n)},l)),
      cr&&RC_CREDIT_CHOICES.map(([n,l])=>h('button',{key:n,className:'btn btn-ghost btn-sm',disabled:locked,onClick:()=>mapAs(it,n,/Settlement$/.test(n)?{cradleeDate:bmapPrevDay(x.date)}:undefined)},l)),
      h('select',{className:'form-control',style:{width:'auto',padding:'3px 8px',fontSize:12},value:'',disabled:locked,onChange:e=>{if(e.target.value)mapAs(it,e.target.value);}},
        h('option',{value:''},'Other nature…'),(typeof BANK_MAP_NATURES!=='undefined'?BANK_MAP_NATURES:[]).filter(n=>cr?BANK_CREDIT_NATURES.has(n):!BANK_CREDIT_NATURES.has(n)||n==='Transfer'||n==='Other'||n==='Refund').map(n=>h('option',{key:n,value:n},n))),
      h('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:'auto'},onClick:()=>onNavTab&&onNavTab('bank-statement')},'Split / link by hand in Bank Statement →')));};
  const natureList=(typeof BANK_MAP_NATURES!=='undefined'?BANK_MAP_NATURES:[]);
  // done lines (#25 reconciled-by stamp)
  const J=bankMapJournal(sid);const lastBy={};J.forEach(e=>{if(!e.undone)lastBy[e.rowId]=e;});
  const doneRows=filter==='done'?data.done.filter(r=>(side==='all'||(side==='Credit')===(Number(r.credit)>0))&&(!typeF||rowType(r)===typeF)&&(!qq||String(r.description||'').toLowerCase().includes(qq))):[];
  const mappedTo=r=>{if(Array.isArray(r.linkedEmployeePay)&&r.linkedEmployeePay.length)return r.linkedEmployeePay.map(l=>l.employeeName+' · '+(RPT_MONTHS[l.month]||'').slice(0,3)).join(', ');
    if(r.linkedInvoice)return String(r.linkedInvoice).startsWith('due|')?'Due Date register':String(r.linkedInvoice).split(',').map(k=>k.split('|')[1]||k).join(', ');
    if(r.vendorOverride&&!String(r.vendorOverride).startsWith('EMP:'))return r.vendorOverride;if(r.cradleeDate)return'Sale day '+r.cradleeDate;return'';};
  return h('div',{className:'fade-in',onKeyDown:onKey,tabIndex:-1,style:{outline:'none'}},
    h('div',{className:'section-header'},
      h('div',null,h('div',{className:'page-title'},'Bank Reconcile'),h('div',{className:'page-sub'},'Each bank line with its best match — bills, salary, incentive, challans, transfers, Bank Payment files, recurring payees. OK applies it the same way Bank Statement does (and can be undone).')),
      h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}},
        !phone&&typeof RcReviewTable==='function'&&h('div',{className:'pz-views',style:{margin:0}},h('span',null,'View:'),
          h('button',{type:'button',className:'btn btn-sm '+(view!=='review'?'btn-primary':'btn-ghost'),title:'Bank statement and mapping side by side',onClick:()=>pickView('classic')},'Classic'),
          h('button',{type:'button',className:'btn btn-sm '+(view==='review'?'btn-primary':'btn-ghost'),title:'One line per entry with Match / Add, matches open under the line',onClick:()=>pickView('review')},'For review')),
        h('select',{className:'form-control',style:{width:'auto'},value:ym,onChange:e=>{setYm(e.target.value);setSel(0);setOpen(null);}},months.map(k=>h('option',{key:k,value:k},(RPT_MONTHS[Number(k.slice(5,7))-1]||'')+' '+k.slice(0,4)))),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>onNavTab&&onNavTab('bank-statement')},'🏦 Bank Statement'),
        h(MenuButton,{label:'⋯ More',items:[
          {label:'⬇ Excel of the month',onClick:()=>rcExportMonth(sid,ym,salon)},
          {label:'🖨 Month-end certificate',onClick:()=>rcCertificate(sid,ym,data,salon)},
          {label:'📤 Exceptions to the owner (WhatsApp)',onClick:sendOwner},
          {label:'🔗 Map with Tally ledgers',onClick:openTally},
          so?(isSA&&{label:'🔓 Reopen the month',onClick:reopen}):{label:'✔ Sign off the month',onClick:signOff}]}),
        h('button',{className:'btn btn-primary btn-sm',disabled:busy||locked||!count('sure'),onClick:okAll,title:'Applies every “Sure” match (possible duplicates are left out)'},'✓ OK all Sure ('+count('sure')+')'))),
    so&&h('div',{className:'notice-line',style:{background:'rgba(46,160,90,0.08)',border:'1px solid rgba(46,160,90,0.35)',borderRadius:'var(--r)',padding:'6px 10px',marginBottom:10,fontSize:12.5,display:'flex',gap:8,alignItems:'center'}},
      h('span',{style:{flex:1}},'✔ '+rcYmLabel(ym)+' signed off by '+(so.by||'—')+' on '+new Date(so.at).toLocaleString('en-GB')+(locked?' — no changes in Reconcile until a Super Admin reopens it.':'')),
      isSA&&h('button',{className:'btn btn-ghost btn-sm',onClick:reopen},'Reopen')),
    // progress
    rv?h(RcReviewTop,{data,M,pct,doneN,total,count,filter,setFilter,setSel,side,setSide,typeF,setTypeF,q,setQ,searchRef,P,panel,setPanel,showSet,setShowSet,so,bal,acc}):
    h('div',{className:'card',style:{padding:'12px 16px',marginBottom:12}},
      h('div',{style:{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}},
        h('div',{style:{flex:1,minWidth:180,height:10,background:'var(--bg3)',borderRadius:999,overflow:'hidden'}},h('div',{style:{width:pct+'%',height:'100%',background:'var(--green)',transition:'width .4s'}})),
        h('b',null,pct+'% reconciled'),h('span',{style:{fontSize:12.5,color:'var(--text2)'}},doneN+' of '+total+' lines · '+data.items.length+' to review'),
        bal&&h('button',{type:'button',className:'btn btn-ghost btn-sm',title:'Each line’s closing balance should equal the one before plus credit / minus debit',onClick:()=>setPanel(p=>p==='breaks'?null:'breaks'),style:{fontSize:12,color:bal.gaps?'var(--red)':'var(--green)'}},bal.gaps?'⚠ Balance breaks in '+bal.gaps+' place'+(bal.gaps===1?'':'s')+' — see where':'✓ Statement balance runs through'),
        acc&&h('span',{style:{fontSize:12,color:'var(--text3)'},title:'Suggestions accepted vs changed this month'},'Suggestions right '+acc.pct+'% ('+acc.n+')')),
      // summary strip
      h('div',{className:'rc-summary'},ST.map(([k,l])=>{const v=sumOf(k);return h('button',{key:k,type:'button',className:'rc-sum'+(typeF===k?' on':''),onClick:()=>{setTypeF(t=>t===k?null:k);setSel(0);}},
        h('div',{style:{fontSize:11.5,color:'var(--text3)'}},l),h('div',{style:{fontWeight:700,fontSize:13.5}},M(v.done)),h('div',{style:{fontSize:11,color:v.nOpen?'#b26a00':'var(--green)'}},v.nOpen?v.nOpen+' open · '+M(v.open):'✓ all done'));})),
      h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginTop:10}},F.map(([k,l,n])=>h('button',{key:k,type:'button',className:'tab-group-chip'+(filter===k?' on':''),onClick:()=>{setFilter(k);setSel(0);}},l+' '+n)),
        h('span',{style:{width:1,background:'var(--border)',margin:'0 2px'}}),
        [['all','All'],['Debit','Debits'],['Credit','Credits']].map(([k,l])=>h('button',{key:k,type:'button',className:'tab-group-chip'+(side===k?' on':''),onClick:()=>{setSide(k);setSel(0);}},l+(k==='all'?'':' '+data.items.filter(i=>i.x.side===k).length))),
        h('button',{type:'button',className:'tab-group-chip'+(showSet?' on':''),onClick:()=>setShowSet(v=>!v),title:'Card / UPI credits checked against the day’s sales'},'Card / UPI settled '+data.settlements.reduce((t,g)=>t+g.n,0)+(data.settlements.some(g=>g.status!=='ok')?' · ⚠ '+data.settlements.filter(g=>g.status!=='ok').length:'')),
        h('input',{ref:searchRef,className:'form-control',style:{width:200,marginLeft:'auto',padding:'4px 10px'},placeholder:'Search ( / )',value:q,onChange:e=>{setQ(e.target.value);setSel(0);}})),
      // panels
      h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginTop:8}},P.map(([k,l])=>h('button',{key:k,type:'button',className:'tab-group-chip'+(panel===k?' on':''),onClick:()=>setPanel(p=>p===k?null:k)},l)))),
    panel&&panelBody[panel]&&h(RcPanel,{title:(P.find(p=>p[0]===panel)||['',''])[1],onClose:()=>setPanel(null)},panelBody[panel]()),
    rule&&h('div',{className:'notice-line',style:{background:'rgba(47,95,224,0.08)',border:'1px solid rgba(47,95,224,0.3)',borderRadius:'var(--r)',padding:'6px 10px',marginBottom:10,fontSize:12.5,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
      h('span',{style:{flex:1}},'🔁 Always map payments to ',h('b',null,rule.payee),' as ',h('b',null,rule.nature+(rule.vendorOverride?' · '+rule.vendorOverride:'')),'?'),
      h('button',{className:'btn btn-primary btn-sm',onClick:()=>{addBankRule(sid,{side:'Debit',sig:'',contains:rule.payee,nature:rule.nature,vendorOverride:rule.vendorOverride||'',dateMode:'setdt'});setRule(null);toast('Rule added — new lines map by themselves on import','success');}},'Add rule'),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setRule(null)},'Not now')),
    showSet&&h(RcPanel,{title:'Card / UPI settlements by sale day',onClose:()=>setShowSet(false)},
      (()=>{const S=data.settlements.reduce((t,g)=>t+g.sales,0),B=data.settlements.reduce((t,g)=>t+g.bank,0);if(!B)return null;const p=S>0?(S-B)/S*100:null;const okm=p!=null&&p>=-3&&p<=4.5;
        return h('div',{style:{fontSize:12.5,marginBottom:8,padding:'6px 10px',borderRadius:'var(--r)',background:okm?'rgba(46,160,90,0.08)':'rgba(224,165,48,0.12)'}},
          'Month: Cradlee card + UPI sales ',h('b',null,M(S)),' · bank credits ',h('b',null,M(B)),p!=null?' · difference '+M(S-B)+' ('+p.toFixed(1)+'%)':'',
          okm?' ✓':' — '+(S<B*0.9?'sales look incomplete: import the missing days’ Cradlee collection (Collection → Import Collection Data)':'check Collection Reco'));})(),
      data.settlements.length?rcTable(['Sale day','Type','Lines','Sales (Cradlee)','Bank credits','Charges / short','Check'],data.settlements.map(g=>[g.day||'—',g.nature,g.n,g.sales>0?M(g.sales):'—',h('b',null,M(g.bank)),
        h('span',{style:{color:g.diff<-1?'var(--red)':'var(--text2)'}},g.sales>0?M(g.diff)+(g.pct!=null?' ('+g.pct.toFixed(2)+'%)':''):'—'),h('span',{style:{color:g.status==='ok'?'var(--green)':'#b26a00',whiteSpace:'nowrap'}},g.status==='ok'?'✓ matches':'⚠ '+g.status)]),[3,4,5])
        :h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'None this month.'),
      h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'Each day’s card / UPI credits against that day’s sales in Cradlee: up to 4.5% short is the bank / gateway charges.')),
    // #5 · bulk actions on ticked lines
    checked.size>0&&h('div',{className:'notice-line',style:{background:'rgba(47,95,224,0.08)',border:'1px solid rgba(47,95,224,0.3)',borderRadius:'var(--r)',padding:'6px 10px',marginBottom:10,fontSize:12.5,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
      h('b',null,checked.size+' ticked'),
      h('button',{className:'btn btn-primary btn-sm',disabled:locked,onClick:()=>applyMany(data.items.filter(i=>checked.has(i.x.id)&&i.s),'ticked lines with their best match')},'✓ OK ticked'),
      h('select',{className:'form-control',style:{width:'auto',padding:'3px 8px',fontSize:12},value:'',disabled:locked,onChange:e=>{if(e.target.value)mapMany(e.target.value);}},h('option',{value:''},'Map ticked as…'),natureList.map(n=>h('option',{key:n,value:n},n))),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setChecked(new Set())},'Clear')),
    // the lines
    filter==='done'?h('div',{className:'card',style:{padding:0}},doneRows.length?h('div',{className:'table-wrap',style:{margin:0}},h('table',{className:'rc-table'},
        h('thead',null,h('tr',null,['Date','Narration','Debit','Credit','Nature','Mapped to','Reconciled by'].map((t,k)=>h('th',{key:k,className:k===2||k===3?'num':''},t)))),
        h('tbody',null,doneRows.map(r=>{const j=lastBy[r.id];return h('tr',{key:r.id},h('td',{style:{whiteSpace:'nowrap'}},r.transactionDate),h('td',{className:'rc-narr'},h('div',{style:{fontWeight:600}},rcPayeeName(r.description)||'—'),h('div',{className:'rc-desc'},r.description)),
          h('td',{className:'num',style:{color:'var(--red)'}},Number(r.debit)>0?M(r.debit):''),h('td',{className:'num',style:{color:'var(--green)'}},Number(r.credit)>0?M(r.credit):''),h('td',null,r.nature||'—'),h('td',null,mappedTo(r)||'—'),
          h('td',{style:{fontSize:11.5,color:'var(--text3)',whiteSpace:'nowrap'}},j?(j.lastBy||j.by||'')+' · '+new Date(j.lastAt||j.at).toLocaleDateString('en-GB'):'on import / Bank Statement'));}))))
      :h('div',{style:{padding:'28px 16px',textAlign:'center',color:'var(--text3)',fontSize:13}},'No reconciled lines in this filter.'))
    // #28 · phone: one card per line — swipe right = OK, left = skip
    :phone?h('div',{ref:listRef},!shown.length&&h('div',{className:'card',style:{padding:'24px 14px',textAlign:'center',color:'var(--text3)',fontSize:13}},data.items.length?'Nothing in this filter.':'✓ Every bank line of this month is reconciled.'),
      shown.map((it,i)=>{const x=it.x,s=it.s,p=pill(it.bucket),cr=x.side==='Credit',isOpen=open===x.id;
        return h('div',{key:x.id,className:'card rc-card',style:{borderLeft:'4px solid '+EDGE[it.bucket]},
          onTouchStart:e=>{touch.current={x:e.touches[0].clientX,id:x.id};},
          onTouchEnd:e=>{const t=touch.current;touch.current=null;if(!t||t.id!==x.id)return;const dx=e.changedTouches[0].clientX-t.x;
            if(dx>80&&s&&!locked)ok(it,s);else if(dx<-80)setSkipped(p=>new Set([...p,x.id]));}},
          h('div',{style:{display:'flex',justifyContent:'space-between',gap:8}},h('span',{style:{fontSize:11.5,color:'var(--text3)'}},x.date),h('span',{style:{fontWeight:700,color:cr?'var(--green)':'var(--red)'}},(cr?'+ ':'− ')+M(x.credit||x.debit))),
          h('div',{style:{fontWeight:600,marginTop:2}},rcPayeeName(x.description)||x.description.slice(0,40)),
          h('div',{style:{fontSize:12.5,marginTop:4}},h('span',{style:{fontSize:11,padding:'1px 8px',borderRadius:999,background:p[2],color:p[1],fontWeight:600,marginRight:6}},p[0]+(s?' '+Math.round(s.score*100)+'%':'')),s?s.label:(it.newPayee?it.newPayee+' — new payee':'No match')),
          h('div',{style:{display:'flex',gap:6,marginTop:8}},s&&h('button',{className:'btn btn-primary btn-sm',disabled:locked,onClick:()=>ok(it,s)},'OK'),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setOpen(isOpen?null:x.id)},isOpen?'Close':'Review'),
            h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setSkipped(p=>new Set([...p,x.id]))},'Skip')),
          isOpen&&h('div',{style:{marginTop:8,paddingTop:6,borderTop:'1px solid var(--border)'}},reviewBody(it)));}),
      skipped.size>0&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setSkipped(new Set())},'Show '+skipped.size+' skipped'),
      h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'Swipe a card right to OK it, left to skip it.'))
    // Statement first (date, narration, ref, debit, credit, balance), then the mapping columns.
    :rv?h(RcReviewTable,{sid,data,shown,cur,setSel,open,setOpen,checked,toggleCheck,setChecked,locked,ok,mapAs,newVendor,onNavTab,listRef,M})
    :h('div',{className:'card',ref:listRef,style:{padding:0}},
      !shown.length&&h('div',{style:{padding:'28px 16px',textAlign:'center',color:'var(--text3)',fontSize:13}},data.items.length?'Nothing in this filter.':'✓ Every bank line of this month is reconciled.'),
      shown.length>0&&h('div',{className:'table-wrap',style:{margin:0}},h('table',{className:'rc-table'},
        h('thead',null,
          h('tr',{className:'rc-band'},h('th',{colSpan:7},'Bank statement'),h('th',{colSpan:3,className:'rc-map'},'Mapping')),
          h('tr',null,h('th',{style:{width:28}},h('input',{type:'checkbox',checked:shown.length>0&&shown.every(i=>checked.has(i.x.id)),onChange:e=>setChecked(e.target.checked?new Set(shown.map(i=>i.x.id)):new Set())})),
            h('th',null,'Date'),h('th',null,'Narration'),h('th',null,'Ref no.'),h('th',{className:'num'},'Debit'),h('th',{className:'num'},'Credit'),h('th',{className:'num'},'Balance'),
            h('th',{className:'rc-map'},'Mapped to'),h('th',null,'Match'),h('th',null,''))),
        h('tbody',null,shown.map((it,i)=>{const x=it.x;const s=it.s;const p=pill(it.bucket);const isSel=cur===it;const isOpen=open===x.id;const cr=x.side==='Credit';const row=it.row||{};
          const status=it.task==='bill'?'Vendor Payment · no bill linked':it.task==='pay'?x.nature+' · no employee linked':x.problem||'';
          return h(React.Fragment,{key:x.id},
            h('tr',{'data-rc-sel':isSel?'1':'0',onClick:()=>setSel(i),className:isSel?'rc-sel':''},
              h('td',{style:{boxShadow:'inset 4px 0 0 '+EDGE[it.bucket]}},h('input',{type:'checkbox',checked:checked.has(x.id),onClick:e=>e.stopPropagation(),onChange:()=>toggleCheck(x.id)})),
              h('td',{style:{whiteSpace:'nowrap'}},x.date),
              h('td',{className:'rc-narr'},h('div',{style:{fontWeight:600,color:'var(--text)'}},rcPayeeName(x.description)||'—'),h('div',{className:'rc-desc',title:x.description},x.description),status&&h('div',{style:{fontSize:11,color:'#b26a00',marginTop:2}},status),
                it.dup&&h('div',{style:{fontSize:11,color:'var(--red)',marginTop:2}},'⚠ possible duplicate of '+it.dup[0].transactionDate)),
              h('td',{style:{fontSize:11.5,color:'var(--text3)',whiteSpace:'nowrap'}},row.refNo||'—'),
              h('td',{className:'num',style:{color:'var(--red)',fontWeight:600}},cr?'':M(x.debit)),
              h('td',{className:'num',style:{color:'var(--green)',fontWeight:600}},cr?M(x.credit):''),
              h('td',{className:'num',style:{color:'var(--text3)'}},row.closingBalance!==''&&row.closingBalance!=null&&isFinite(Number(row.closingBalance))?M(row.closingBalance):'—'),
              h('td',{className:'rc-map'},s?h(React.Fragment,null,h('div',{style:{fontWeight:600,color:'var(--text)'}},(s.apply&&s.apply.plan&&s.apply.plan.lines&&s.apply.plan.lines.length>1?'⑂ ':'')+s.label),
                  s.why&&h('div',{style:{fontSize:11.5,color:'var(--text3)'}},s.why),h('div',null,(s.reasons||[]).slice(0,3).map(chip)))
                :h('div',{style:{fontSize:12.5,color:'var(--text2)'}},it.newPayee?it.newPayee+' isn’t a vendor or employee yet':'No match found')),
              h('td',{style:{whiteSpace:'nowrap'}},h('span',{style:{fontSize:11,padding:'2px 8px',borderRadius:999,background:p[2],color:p[1],fontWeight:600}},p[0]+(s?' '+Math.round(s.score*100)+'%':''))),
              h('td',{style:{textAlign:'right',whiteSpace:'nowrap'}},
                s&&it.bucket==='sure'?h('button',{className:'btn btn-primary btn-sm',disabled:locked,onClick:e=>{e.stopPropagation();ok(it,s);}},'OK')
                  :h('button',{className:'btn btn-ghost btn-sm',onClick:e=>{e.stopPropagation();setSel(i);setOpen(isOpen?null:x.id);}},isOpen?'Close':s?'Review':'Choose'))),
          isOpen&&h('tr',null,h('td',{colSpan:10,style:{padding:'4px 14px 12px 14px',background:'var(--bg3)'}},reviewBody(it))));}))))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:8}},'Keys: ↑ ↓ move · Enter OK (Sure) or open · Space tick · / search · Esc close. Every change can be undone in ↶ Recent changes.'));
}
