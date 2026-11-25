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
  if(i>0){let n=parts[i-1];if(/\d{5,}/.test(n)&&i>1)n=parts[i-2];if(n&&!/\d{5,}/.test(n)&&/[a-z]{2,}/i.test(n))
    return{name:n.replace(/\s+/g,' ').split(' ').map(w=>w.length<=2||/^(PVT|LTD|LLP|OPC|HUF)$/i.test(w)?w.toUpperCase():w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' '),ifsc:parts[i].toUpperCase(),purpose:parts.slice(i+1).join(' ')};}
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
  items.forEach(it=>{
    const x=it.x;const d=x.description;const alts=[];it.alts=alts;
    const bs=base[x.id];
    if(x.side==='Credit'){it.s=bs?{...bs,score:bs.conf==='high'?0.95:bs.conf==='mid'?0.75:0.5,reasons:[bs.why]}:null;return;}
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
      const ep=rcBestPayee(emps,d,true)||(()=>{const t=typeof payeeByToken==='function'?payeeByToken('emp',d,emps):null;return t?{rec:t,score:0.6,reasons:['paid to this account before']}:null;})();
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
      const vp=ov?{rec:ov,score:0.9,reasons:['vendor chosen']}:rcBestPayee(vendors,d,false)||(()=>{const f=findVendorMatch(d,vendors)||(typeof payeeByToken==='function'?payeeByToken('vendor',d,vendors):null);return f?{rec:f,score:0.55,reasons:['name']}:null;})();
      if(vp){const plan=rcBillPlan(vp.rec,amt,inv,left);const v=vp.rec;
        if(plan&&plan.allocations){const sure=plan.how==='exact'||plan.how==='combo';const sc=sure?Math.min(0.98,0.6+vp.score*0.4):0.66;
          alts.push({score:sc,conf:sc>=0.9?'high':'mid',label:(plan.allocations.length>1?'Pays '+plan.allocations.length+' bills of ':'Pays bill '+plan.allocations[0].invoiceNo+' · ')+v.name,
            why:plan.allocations.map(a=>a.invoiceNo+' '+M(a.amount)).join(' + '),reasons:[...vp.reasons,plan.how==='exact'?'= open bill':plan.how==='combo'?'= '+plan.allocations.length+' open bills':'oldest bills first (part)'],
            apply:{type:'link',plan:{vendor:v,allocations:plan.allocations}}});}
        else alts.push({score:Math.min(0.8,0.4+vp.score*0.4),conf:'mid',label:'Vendor Payment · '+v.name+(plan&&plan.how==='short'?' (bills only '+M(plan.total)+')':' (no open bill)'),why:plan&&plan.how==='short'?'Add the missing bill on Vendor Sheet, then link':'No unpaid bill of '+v.name+' — mapped as a payment to them',
          reasons:vp.reasons,apply:{type:'patch',patch:{nature:'Vendor Payment',vendorOverride:v.name}}});}
    }
    // 4 · the existing engine's suggestion
    if(bs)alts.push({...bs,score:bs.conf==='high'?0.93:bs.conf==='mid'?0.72:0.45,reasons:[bs.why]});
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
  });
  items.forEach(it=>{const s=it.s;it.bucket=s?(s.score>=0.9?'sure':'check'):(it.newPayee?'new':'unknown');});
  // card / UPI settlements of the month, grouped by sale day
  const st={};done.forEach(r=>{if(Number(r.credit)>0&&/Settlement$/.test(String(r.nature||''))){const k=(r.cradleeDate||r.transactionDate)+'|'+r.nature;const g=st[k]||(st[k]={day:r.cradleeDate||r.transactionDate,nature:r.nature,total:0,n:0});g.total+=Number(r.credit)||0;g.n++;}});
  return{items,done,settlements:Object.values(st).sort((a,b)=>String(toISO(b.day)).localeCompare(String(toISO(a.day)))),all:inMonth};
}

// Applies one suggestion; '' when done, else the reason. Remembers what was accepted.
function rcApply(sid,it,s){
  const rows=bankRowsFor(sid);const row=rows.find(r=>r.id===it.x.id)||it.row;let err='';
  try{
    if(s.apply.type==='link'){err=linkBankLineToBills(sid,row,s.apply.plan.vendor,s.apply.plan.allocations.map(a=>({id:a.id,amount:a.amount,tds:a.tds})));if(!err)journalBankMapping(sid,row,'Reconcile: linked to '+s.apply.plan.allocations.map(a=>a.invoiceNo).join(', '));}
    else if(s.apply.type==='pay'&&s.apply.plan.lines){const p=s.apply.plan;err=settleBankLineToEmployees(sid,row,p.year,p.month,p.lines);if(!err)journalBankMapping(sid,row,'Reconcile: '+p.lines.map(l=>l.employeeName).join(', ')+' '+RPT_MONTHS[p.month]);}
    else err=applyBankSuggestion(sid,it.x,s,null,rows,'Reconcile: ');
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
const RC_DEBIT_CHOICES=[['Loan Principal','Loan repaid'],['Drawings','Owner drawing'],['Rent','Rent'],['Transfer','Transfer'],['Other','Other']];
function BankReconcileSheet({salon,period,onNavTab}){
  const h=React.createElement;const sid=salon&&salon.id;const {toast,error:toastErr}=useToast();
  const cal=typeof periodToCalendar==='function'?periodToCalendar(period):null;
  const [ym,setYm]=useState(()=>cal?cal.year+'-'+String(cal.month+1).padStart(2,'0'):localIsoOf(new Date()).slice(0,7));
  const [tick,setTick]=useState(0);const [filter,setFilter]=useState('todo');const [q,setQ]=useState('');const [sel,setSel]=useState(0);const [open,setOpen]=useState(null);
  const [rule,setRule]=useState(null);const [busy,setBusy]=useState(false);const [showSet,setShowSet]=useState(false);const searchRef=useRef(null);const listRef=useRef(null);
  const data=useMemo(()=>sid==null?null:rcBuild(sid,ym),[sid,ym,tick,storeVersion()]);
  const months=useMemo(()=>{const s=new Set();bankRowsFor(sid).forEach(r=>{const k=rcMonthKey(r&&r.transactionDate);if(k)s.add(k);});s.add(ym);return[...s].sort().reverse();},[sid,tick]);
  useEffect(()=>{const el=listRef.current&&listRef.current.querySelector('[data-rc-sel="1"]');if(el&&el.scrollIntoView)el.scrollIntoView({block:'nearest'});},[sel,filter]);
  if(!data)return null;
  const M=n=>rupee0(n);
  const count=b=>data.items.filter(i=>i.bucket===b).length;
  const total=data.all.length,doneN=data.done.length,pct=total?Math.round(doneN/total*100):100;
  const qq=q.trim().toLowerCase();
  const shown=data.items.filter(i=>(filter==='todo'||i.bucket===filter)&&(!qq||(i.x.description+' '+(i.s?i.s.label:'')+' '+(i.x.debit||i.x.credit)).toLowerCase().includes(qq)));
  const cur=shown[Math.min(sel,shown.length-1)];
  const bal=rcBalanceCheck(data.all);const acc=rcAccuracy(sid);
  const refresh=()=>setTick(t=>t+1);
  const ok=(it,s)=>{if(!s)return;const e=rcApply(sid,it,s);if(e){toastErr(e);return false;}const r=rcRuleFor(sid,it,s);if(r)setRule(r);toast('Reconciled · '+s.label,'success');setOpen(null);refresh();return true;};
  const okAll=()=>{const L=data.items.filter(i=>i.bucket==='sure'&&i.s);if(!L.length)return;if(!window.confirm('Apply the '+L.length+' “Sure” matches?'))return;setBusy(true);
    let n=0;const errs=[];L.forEach(it=>{const e=rcApply(sid,it,it.s);if(e)errs.push((it.x.date||'')+' '+M(it.x.debit||it.x.credit)+': '+e);else n++;});setBusy(false);refresh();
    toast(n+' line'+(n===1?'':'s')+' reconciled'+(errs.length?' · '+errs.length+' skipped':''),errs.length?'warning':'success');if(errs.length)window.alert('Not applied:\n\n'+errs.slice(0,12).join('\n'));};
  const mapAs=(it,nature,extra)=>{const row=bankRowsFor(sid).find(r=>r.id===it.x.id);if(!row)return;journalBankMapping(sid,row,'Reconcile: '+nature);saveBankLineMapping(sid,row.id,{nature,aiTagged:false,...(extra||{})});
    if(it.s)try{noteBankFeedback(sid,it.x,typeof suggestionNature==='function'?(suggestionNature(it.s)||it.s.label):it.s.label,false);}catch(e){}toast('Mapped as '+nature,'success');setOpen(null);refresh();};
  const newVendor=it=>{const name=window.prompt('New vendor name',it.newPayee||rcPayeeName(it.x.description)||'');if(!name||!name.trim())return;const v=addVendorFromNarration(sid,name.trim(),it.x.description);
    mapAs(it,'Vendor Payment',{vendorOverride:v.name});toast('Vendor '+v.name+' added'+(v.ifsc?' with IFSC '+v.ifsc:'')+' — future payments to them match by themselves','success');};
  const onKey=e=>{if(e.target&&['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)){if(e.key==='Escape'){e.target.blur();}return;}
    if(e.key==='ArrowDown'){e.preventDefault();setSel(s=>Math.min(shown.length-1,s+1));}
    else if(e.key==='ArrowUp'){e.preventDefault();setSel(s=>Math.max(0,s-1));}
    else if(e.key==='Enter'&&cur){e.preventDefault();if(cur.s&&cur.bucket==='sure')ok(cur,cur.s);else setOpen(o=>o===cur.x.id?null:cur.x.id);}
    else if(e.key==='/'){e.preventDefault();searchRef.current&&searchRef.current.focus();}
    else if(e.key==='Escape')setOpen(null);};
  const pill=(b)=>({sure:['Sure','var(--green)','rgba(46,160,90,0.12)'],check:['Check','#b26a00','rgba(224,165,48,0.15)'],new:['New payee','var(--accent)','rgba(47,95,224,0.1)'],unknown:['Unknown','var(--text3)','var(--bg3)']})[b];
  const chip=t=>h('span',{key:t,style:{display:'inline-block',fontSize:11,padding:'1px 8px',borderRadius:999,margin:'4px 4px 0 0',background:'var(--bg3)',color:'var(--text2)'}},t);
  const F=[['todo','To review',data.items.length],['sure','Sure',count('sure')],['check','Check',count('check')],['new','New payee',count('new')],['unknown','Unknown',count('unknown')]];
  return h('div',{className:'fade-in',onKeyDown:onKey,tabIndex:-1,style:{outline:'none'}},
    h('div',{className:'section-header'},
      h('div',null,h('div',{className:'page-title'},'Bank Reconcile'),h('div',{className:'page-sub'},'Each bank line with its best match — bills, salary, incentive, Bank Payment files, recurring payees. OK applies it the same way Bank Statement does (and can be undone there).')),
      h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}},
        h('select',{className:'form-control',style:{width:'auto'},value:ym,onChange:e=>{setYm(e.target.value);setSel(0);setOpen(null);}},months.map(k=>h('option',{key:k,value:k},(RPT_MONTHS[Number(k.slice(5,7))-1]||'')+' '+k.slice(0,4)))),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>onNavTab&&onNavTab('bank-statement')},'🏦 Bank Statement'),
        h('button',{className:'btn btn-primary btn-sm',disabled:busy||!count('sure'),onClick:okAll,title:'Applies every “Sure” match'},'✓ OK all Sure ('+count('sure')+')'))),
    // progress
    h('div',{className:'card',style:{padding:'12px 16px',marginBottom:12}},
      h('div',{style:{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}},
        h('div',{style:{flex:1,minWidth:180,height:10,background:'var(--bg3)',borderRadius:999,overflow:'hidden'}},h('div',{style:{width:pct+'%',height:'100%',background:'var(--green)',transition:'width .4s'}})),
        h('b',null,pct+'% reconciled'),h('span',{style:{fontSize:12.5,color:'var(--text2)'}},doneN+' of '+total+' lines · '+data.items.length+' to review'),
        bal&&h('span',{title:'Each line’s closing balance should equal the one before plus credit / minus debit',style:{fontSize:12,color:bal.gaps?'var(--red)':'var(--green)'}},bal.gaps?'⚠ Balance breaks in '+bal.gaps+' place'+(bal.gaps===1?'':'s')+' — lines may be missing from the statement':'✓ Statement balance runs through'),
        acc&&h('span',{style:{fontSize:12,color:'var(--text3)'},title:'Suggestions accepted vs changed this month'},'Suggestions right '+acc.pct+'% ('+acc.n+')')),
      h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginTop:10}},F.map(([k,l,n])=>h('button',{key:k,type:'button',className:'tab-group-chip'+(filter===k?' on':''),onClick:()=>{setFilter(k);setSel(0);}},l+' '+n)),
        h('button',{type:'button',className:'tab-group-chip'+(showSet?' on':''),onClick:()=>setShowSet(v=>!v)},'Card / UPI settled '+data.settlements.reduce((t,g)=>t+g.n,0)),
        h('input',{ref:searchRef,className:'form-control',style:{width:200,marginLeft:'auto',padding:'4px 10px'},placeholder:'Search ( / )',value:q,onChange:e=>{setQ(e.target.value);setSel(0);}}))),
    rule&&h('div',{className:'notice-line',style:{background:'rgba(47,95,224,0.08)',border:'1px solid rgba(47,95,224,0.3)',borderRadius:'var(--r)',padding:'6px 10px',marginBottom:10,fontSize:12.5,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
      h('span',{style:{flex:1}},'🔁 Always map payments to ',h('b',null,rule.payee),' as ',h('b',null,rule.nature+(rule.vendorOverride?' · '+rule.vendorOverride:'')),'?'),
      h('button',{className:'btn btn-primary btn-sm',onClick:()=>{addBankRule(sid,{side:'Debit',sig:'',contains:rule.payee,nature:rule.nature,vendorOverride:rule.vendorOverride||'',dateMode:'setdt'});setRule(null);toast('Rule added — new lines map by themselves on import','success');}},'Add rule'),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setRule(null)},'Not now')),
    showSet&&h('div',{className:'card',style:{padding:'10px 14px',marginBottom:12}},
      h('div',{style:{fontWeight:600,fontSize:13,marginBottom:6}},'Card / UPI settlements by sale day'),
      data.settlements.length?h('table',{style:{width:'100%'}},h('tbody',null,data.settlements.map(g=>h('tr',{key:g.day+g.nature},h('td',{style:{padding:'3px 6px',fontSize:12.5}},g.day),h('td',{style:{padding:'3px 6px',fontSize:12.5}},g.nature),
        h('td',{style:{padding:'3px 6px',fontSize:12.5,color:'var(--text3)'}},g.n+' line'+(g.n===1?'':'s')),h('td',{style:{padding:'3px 6px',fontSize:12.5,textAlign:'right',fontWeight:600}},M(g.total)))))):h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'None this month.'),
      h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'These are matched to the day’s card / UPI sales in Collection Reco.')),
    // the lines
    h('div',{className:'card',ref:listRef,style:{padding:0,overflow:'hidden'}},
      !shown.length&&h('div',{style:{padding:'28px 16px',textAlign:'center',color:'var(--text3)',fontSize:13}},data.items.length?'Nothing in this filter.':'✓ Every bank line of this month is reconciled.'),
      shown.map((it,i)=>{const x=it.x;const s=it.s;const p=pill(it.bucket);const isSel=cur===it;const isOpen=open===x.id;const cr=x.side==='Credit';
        return h('div',{key:x.id,'data-rc-sel':isSel?'1':'0',onClick:()=>setSel(i),style:{borderTop:i?'1px solid var(--border)':'none',background:isSel?'rgba(47,95,224,0.05)':undefined}},
          h('div',{className:'rc-row'},
            h('div',{style:{minWidth:0}},h('div',{style:{fontSize:11.5,color:'var(--text3)'}},x.date+(it.task==='bill'?' · Vendor Payment, no bill linked':it.task==='pay'?' · '+x.nature+', no employee linked':x.problem?' · '+x.problem:'')),
              h('div',{style:{fontWeight:600,fontSize:14,color:cr?'var(--green)':'var(--red)'}},(cr?'+ ':'− ')+M(x.credit||x.debit)),
              h('div',{style:{fontSize:12,color:'var(--text2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},title:x.description},rcPayeeName(x.description)||x.description)),
            h('div',{style:{fontSize:18,color:'var(--text3)',textAlign:'center'}},s&&s.apply&&s.apply.plan&&s.apply.plan.lines&&s.apply.plan.lines.length>1?'⑂':s?'⇄':'?'),
            h('div',{style:{minWidth:0}},
              h('span',{style:{fontSize:11,padding:'1px 8px',borderRadius:999,background:p[2],color:p[1],fontWeight:600}},p[0]+(s?' '+Math.round(s.score*100)+'%':'')),
              s?h(React.Fragment,null,h('div',{style:{fontSize:13,marginTop:3,fontWeight:500}},s.label),s.why&&h('div',{style:{fontSize:11.5,color:'var(--text3)'}},s.why),h('div',null,(s.reasons||[]).slice(0,3).map(chip)))
               :h('div',{style:{fontSize:12.5,color:'var(--text2)',marginTop:3}},it.newPayee?it.newPayee+' isn’t a vendor or employee yet':'No match found')),
            h('div',{style:{textAlign:'right'}},
              s&&it.bucket==='sure'?h('button',{className:'btn btn-primary btn-sm',onClick:e=>{e.stopPropagation();ok(it,s);}},'OK')
                :h('button',{className:'btn btn-ghost btn-sm',onClick:e=>{e.stopPropagation();setSel(i);setOpen(isOpen?null:x.id);}},isOpen?'Close':s?'Review':'Choose'))),
          isOpen&&h('div',{style:{padding:'4px 14px 12px 14px',background:'var(--bg3)'}},
            (it.alts||[]).length>0&&h('div',{style:{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',margin:'6px 0 4px'}},'Matches'),
            (it.alts&&it.alts.length?it.alts:(s?[s]:[])).slice(0,4).map((a,k)=>h('div',{key:k,style:{display:'flex',gap:8,alignItems:'center',padding:'4px 0',borderBottom:'1px dashed var(--border)'}},
              h('span',{style:{fontSize:11,minWidth:38,color:a.score>=0.9?'var(--green)':'#b26a00',fontWeight:600}},Math.round(a.score*100)+'%'),
              h('div',{style:{flex:1,minWidth:0}},h('div',{style:{fontSize:12.5}},a.label),h('div',{style:{fontSize:11.5,color:'var(--text3)'}},[a.why,...(a.reasons||[])].filter(Boolean).join(' · '))),
              h('button',{className:'btn btn-primary btn-sm',onClick:()=>{if(a!==s&&s)try{noteBankFeedback(sid,x,typeof suggestionNature==='function'?(suggestionNature(s)||s.label):s.label,false);}catch(e){}ok(it,a);}},'Use this'))),
            h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginTop:8,alignItems:'center'}},
              !cr&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>newVendor(it)},'＋ New vendor'),
              !cr&&RC_DEBIT_CHOICES.map(([n,l])=>h('button',{key:n,className:'btn btn-ghost btn-sm',onClick:()=>mapAs(it,n)},l)),
              h('select',{className:'form-control',style:{width:'auto',padding:'3px 8px',fontSize:12},value:'',onChange:e=>{if(e.target.value)mapAs(it,e.target.value);}},
                h('option',{value:''},'Other nature…'),(typeof BANK_MAP_NATURES!=='undefined'?BANK_MAP_NATURES:[]).filter(n=>cr?BANK_CREDIT_NATURES.has(n):!BANK_CREDIT_NATURES.has(n)||n==='Transfer'||n==='Other'||n==='Refund').map(n=>h('option',{key:n,value:n},n))),
              h('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:'auto'},onClick:()=>onNavTab&&onNavTab('bank-statement')},'Split / link by hand in Bank Statement →'))));})),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:8}},'Keys: ↑ ↓ move · Enter OK (Sure) or open · / search · Esc close. Every change shows in Bank Statement → Undo.'));
}
