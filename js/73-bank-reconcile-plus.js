// ═══════════════════════════════════════════════════════════════════════════════════════════
// Bank Reconcile — tools and side panels (js/72 is the matching and the main screen).
//   Why? explanation · Excel export · month certificate · exceptions to the owner · auto-apply
//   after import · all outlets · expected payments · unpaid bills · balance breaks · sales not
//   imported · cash deposits · loans · payee set-up · recent changes with Undo
// ═══════════════════════════════════════════════════════════════════════════════════════════

const RC_M=n=>rupee0(n);
function rcYmLabel(ym){const p=String(ym||'').split('-');return p.length===2?(RPT_MONTHS[Number(p[1])-1]||'')+' '+p[0]:String(ym||'');}
function rcYmParts(ym){const p=String(ym||'').split('-');return{year:Number(p[0]),month:Number(p[1])-1};}

// #29 · Why? — what the match is based on, or what is missing for one
function rcExplain(sid,it){
  const x=it.x,s=it.s,P=rcParse(x.description);const out=[];
  out.push('Payee read from the narration: '+(P.name||'— (none)')+(P.ifsc?' · IFSC '+P.ifsc:'')+(P.purpose?' · purpose “'+P.purpose+'”':''));
  if(s){out.push('Best match: '+s.label+' ('+Math.round(s.score*100)+'%).');if(s.why)out.push(s.why);if(s.reasons&&s.reasons.length)out.push('Based on: '+s.reasons.join(', ')+'.');}
  if(it.dup)out.push('⚠ Same amount and payee within 3 days: '+it.dup.map(r=>r.transactionDate+' '+RC_M(Number(r.debit)||Number(r.credit))).join(', ')+' — check it isn’t paid twice.');
  if(!s||s.score<0.9){
    if(x.side==='Debit'){const vendors=loadVendors(sid)||[];const v=rcBestPayee(vendors,x.description,false);const emps=(loadEmployees(sid)||[]).filter(e=>e&&e.status!=='Inactive');const e=rcBestPayee(emps,x.description,true);
      if(v){const open=(loadVendorInvoices(sid)||[]).filter(i=>String(i.vendorId)===String(v.rec.id)&&rcBal(i)>0.5);out.push('Vendor '+v.rec.name+': '+(open.length?open.length+' open bill'+(open.length===1?'':'s')+' totalling '+RC_M(open.reduce((t,i)=>t+rcBal(i),0))+' — none adds up to '+RC_M(x.debit):'no open bills — add the bill on Vendor Sheet, or map it as a payment.'));}
      if(e){const pm=rcPayMonth(x.date);if(pm){const du=rcDues(sid,e.rec,pm.year,pm.month);out.push(e.rec.name+' for '+rcYmLabel(pm.year+'-'+String(pm.month+1).padStart(2,'0'))+': salary still open '+RC_M(du.sal)+', incentive '+RC_M(du.inc)+'.');}}
      if(!v&&!e)out.push('No vendor or employee has this name, IFSC or account number — add them (＋ New vendor, or Master Salary), or choose what it is.');}
    else out.push('Money in: card / UPI settlements match a day’s sales less charges; loans, capital and customer payments are chosen below.');}
  return out;
}

// #14 · Excel of the month: each bank line, what it is mapped to, by whom and when
function rcExportMonth(sid,ym,salon){
  const rows=bankRowsFor(sid).filter(r=>r&&rcMonthKey(r.transactionDate)===ym);const vendors=loadVendors(sid)||[];
  const J=bankMapJournal(sid);const lastBy={};J.forEach(e=>{if(!e.undone)lastBy[e.rowId]=e;});
  const mapped=r=>{if(Array.isArray(r.linkedEmployeePay)&&r.linkedEmployeePay.length)return r.linkedEmployeePay.map(l=>l.employeeName+' '+(RPT_MONTHS[l.month]||'').slice(0,3)+(l.salary?' salary '+l.salary:'')+(l.incentive?' incentive '+l.incentive:'')).join('; ');
    if(r.linkedInvoice)return String(r.linkedInvoice).startsWith('due|')?'Due Date register: '+String(r.linkedInvoice).slice(4):'Bills: '+String(r.linkedInvoice).split(',').map(k=>k.split('|')[1]||k).join(', ');
    if(r.vendorOverride&&!String(r.vendorOverride).startsWith('EMP:'))return r.vendorOverride;if(r.transferOf)return'Transfer pair '+r.transferOf;if(r.cradleeDate)return'Sale date '+r.cradleeDate;return'';};
  const aoa=[['Bank reconciliation — '+((salon&&salon.name)||'')+' — '+rcYmLabel(ym)],[],['Date','Narration','Ref no.','Debit','Credit','Balance','Nature','Mapped to','Status','By','When']];
  rows.forEach(r=>{const p=bankLineProblem(r,vendors);const j=lastBy[r.id];
    aoa.push([r.transactionDate||'',r.description||'',r.refNo||'',Number(r.debit)||'',Number(r.credit)||'',r.closingBalance===''||r.closingBalance==null?'':Number(r.closingBalance),r.nature||'',mapped(r),p?'Open: '+p:'Reconciled',j?(j.lastBy||j.by||''):'',j?new Date(j.lastAt||j.at).toLocaleString('en-GB'):'']);});
  const ws=XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=[{wch:11},{wch:60},{wch:16},{wch:12},{wch:12},{wch:13},{wch:20},{wch:40},{wch:22},{wch:16},{wch:18}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Reconciliation');
  XLSX.writeFile(wb,'Bank_Reconciliation_'+String((salon&&salon.name)||'Outlet').replace(/[^A-Za-z0-9]+/g,'_')+'_'+ym+'.xlsx');
}

// Opening / closing balance of the month from the statement's running balance.
function rcMonthBalances(lines){
  const L=(lines||[]).filter(r=>r&&r.closingBalance!==''&&r.closingBalance!=null&&isFinite(Number(r.closingBalance)));if(!L.length)return null;
  const t=r=>String(toISO(r.transactionDate)||'');const S=L.slice().sort((a,b)=>t(a).localeCompare(t(b)));const f=S[0],l=S[S.length-1];
  return{opening:Number(f.closingBalance)-(Number(f.credit)||0)+(Number(f.debit)||0),closing:Number(l.closingBalance)};
}
// #26 · month-end certificate (printable)
function rcCertificate(sid,ym,data,salon){
  const esc=s=>String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const rec=data.all.reduce((t,r)=>t+(Number(r.credit)||0),0),pay=data.all.reduce((t,r)=>t+(Number(r.debit)||0),0);const b=rcMonthBalances(data.all);
  const books=b?b.opening+rec-pay:null;const so=rcSignedOff(sid,ym);const open=data.items;
  const tr=(a,v)=>'<tr><td>'+esc(a)+'</td><td class="r">'+esc(v)+'</td></tr>';
  const html='<!doctype html><html><head><meta charset="utf-8"><title>Bank reconciliation '+esc(ym)+'</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#111;font-size:13px}h1{font-size:18px;margin:0}h2{font-size:14px;margin:20px 0 6px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:5px 8px;text-align:left}.r{text-align:right}.sig{display:flex;justify-content:space-between;margin-top:56px}.sig div{border-top:1px solid #333;width:40%;padding-top:4px;text-align:center}</style></head><body>'
    +'<h1>Bank reconciliation certificate</h1><div>'+esc((salon&&salon.name)||'')+' · '+esc(rcYmLabel(ym))+'</div>'
    +'<h2>Summary</h2><table>'+tr('Opening balance (statement)',b?RC_M(b.opening):'—')+tr('Receipts',RC_M(rec))+tr('Payments',RC_M(pay))+tr('Closing balance as per books (opening + receipts − payments)',books!=null?RC_M(books):'—')+tr('Closing balance as per bank statement',b?RC_M(b.closing):'—')
    +tr('Difference',b?RC_M(b.closing-books):'—')+tr('Lines reconciled',data.done.length+' of '+data.all.length)+'</table>'
    +'<h2>Not reconciled ('+open.length+')</h2>'+(open.length?'<table><tr><th>Date</th><th>Narration</th><th class="r">Debit</th><th class="r">Credit</th><th>Status</th></tr>'+open.map(i=>'<tr><td>'+esc(i.x.date)+'</td><td>'+esc(i.x.description)+'</td><td class="r">'+(i.x.debit?RC_M(i.x.debit):'')+'</td><td class="r">'+(i.x.credit?RC_M(i.x.credit):'')+'</td><td>'+esc(i.x.problem||(i.task==='bill'?'No bill linked':i.task==='pay'?'No employee linked':''))+'</td></tr>').join('')+'</table>':'<p>None — every line is reconciled.</p>')
    +(so?'<p>Signed off in SalonOS by '+esc(so.by)+' on '+esc(new Date(so.at).toLocaleString('en-GB'))+'.</p>':'')
    +'<div class="sig"><div>Prepared by (Accountant)</div><div>Approved by</div></div><p style="color:#777;margin-top:24px">Generated '+esc(new Date().toLocaleString('en-GB'))+' from SalonOS.</p><script>window.onload=()=>window.print()<\/script></body></html>';
  const w=window.open('','_blank');if(!w){window.alert('Allow pop-ups to print the certificate.');return;}w.document.write(html);w.document.close();
}
// #27 · exceptions for the owner (WhatsApp)
function rcExceptionsText(sid,ym,data,salon){
  const L=[];const nm=String((salon&&salon.name)||'').split('—')[0].trim();
  const unk=data.items.filter(i=>i.bucket==='unknown'||i.bucket==='new');
  const bigCr=data.items.filter(i=>i.x.side==='Credit'&&i.x.credit>=50000);
  const dups=data.items.filter(i=>i.dup);const shortDays=data.settlements.filter(g=>g.status!=='ok');
  L.push('🏦 Bank reconciliation — '+nm+' — '+rcYmLabel(ym));
  L.push(Math.round(data.done.length/Math.max(1,data.all.length)*100)+'% reconciled ('+data.done.length+' of '+data.all.length+' lines), '+data.items.length+' to review.');
  if(unk.length)L.push('','Unknown / new payees ('+unk.length+'):',...unk.slice(0,8).map(i=>'• '+i.x.date+' '+(i.x.debit?'−':'+')+RC_M(i.x.debit||i.x.credit)+' '+(rcPayeeName(i.x.description)||i.x.description.slice(0,40))));
  if(bigCr.length)L.push('','Large money in to explain:',...bigCr.slice(0,6).map(i=>'• '+i.x.date+' +'+RC_M(i.x.credit)+' '+(rcPayeeName(i.x.description)||'')));
  if(dups.length)L.push('','Possible duplicate payments:',...dups.slice(0,6).map(i=>'• '+i.x.date+' '+RC_M(i.x.debit||i.x.credit)+' '+(rcPayeeName(i.x.description)||'')));
  if(shortDays.length)L.push('','Card / UPI days not matching sales: '+shortDays.length+' (e.g. '+shortDays.slice(0,3).map(g=>g.day+' '+g.status).join('; ')+')');
  return L.join('\n');
}
// #30 · Sure matches applied by themselves after an import (Controls → rcAutoApply)
function rcAutoApplySure(sid,ids){
  if(typeof controlOn!=='function'||!controlOn('rcAutoApply',sid))return{done:0};
  const set=ids?new Set([...ids].map(String)):null;const months=new Set();
  bankRowsFor(sid).forEach(r=>{if(r&&(!set||set.has(String(r.id))))months.add(rcMonthKey(r.transactionDate));});
  let done=0;months.forEach(ym=>{if(!ym||rcLocked(sid,ym))return;rcBuild(sid,ym).items.forEach(it=>{if(it.bucket!=='sure'||!it.s||it.dup||(set&&!set.has(String(it.x.id))))return;if(!rcApply(sid,it,it.s))done++;});});
  return{done};
}
// #10 · where the running balance breaks, and by how much
function rcBalanceBreaks(lines){
  const L=(lines||[]).filter(r=>r&&r.closingBalance!==''&&r.closingBalance!=null&&isFinite(Number(r.closingBalance)));if(L.length<2)return[];
  const run=dir=>{const out=[];for(let i=1;i<L.length;i++){const a=dir?L[i-1]:L[i],b=dir?L[i]:L[i-1];const exp=Number(a.closingBalance)+(Number(b.credit)||0)-(Number(b.debit)||0);const gap=Number(b.closingBalance)-exp;if(Math.abs(gap)>1)out.push({a,b,gap});}return out;};
  const f=run(true),r=run(false);return f.length<=r.length?f:r;
}

// ── Panels ──
function RcPanel({title,children,onClose}){const h=React.createElement;return h('div',{className:'card',style:{padding:'10px 14px',marginBottom:12}},
  h('div',{style:{display:'flex',alignItems:'center',marginBottom:6}},h('div',{style:{fontWeight:600,fontSize:13,flex:1}},title),onClose&&h('button',{className:'btn btn-ghost btn-sm',onClick:onClose},'✕')),children);}
function rcTable(head,rows,numCols){const h=React.createElement;numCols=numCols||[];
  return h('div',{className:'table-wrap',style:{margin:0}},h('table',{className:'rc-table'},h('thead',null,h('tr',null,head.map((t,i)=>h('th',{key:i,className:numCols.includes(i)?'num':''},t)))),
    h('tbody',null,rows.map((r,k)=>h('tr',{key:k},r.map((c,i)=>h('td',{key:i,className:numCols.includes(i)?'num':''},c)))))));}
// #7 · every outlet's month at a glance, with OK all Sure per outlet
function RcAllOutlets({ym,onDone}){
  const h=React.createElement;const [tick,setTick]=useState(0);const {toast}=useToast();
  const list=(typeof salonsForCurrentUser==='function'?salonsForCurrentUser(SALONS):SALONS)||[];
  const rows=useMemo(()=>list.filter(s=>s&&s.status!=='Inactive').map(s=>{const d=rcBuild(s.id,ym);return{s,d,pct:d.all.length?Math.round(d.done.length/d.all.length*100):100,sure:d.items.filter(i=>i.bucket==='sure').length};}),[ym,tick,storeVersion()]);
  const okAll=r=>{if(rcLocked(r.s.id,ym)){toast('Signed off — reopen it first','warning');return;}const L=r.d.items.filter(i=>i.bucket==='sure'&&i.s&&!i.dup);if(!L.length||!window.confirm('Apply '+L.length+' Sure match'+(L.length===1?'':'es')+' at '+r.s.name+'?'))return;
    let n=0;L.forEach(it=>{if(!rcApply(r.s.id,it,it.s))n++;});toast(n+' reconciled at '+String(r.s.name).split('—')[0].trim(),'success');setTick(t=>t+1);onDone&&onDone();};
  return rcTable(['Outlet','Lines','Reconciled','To review','Sure',''],rows.map(r=>[String(r.s.name).split('—')[0].trim(),r.d.all.length,
    h('span',{style:{color:r.pct>=95?'var(--green)':r.pct>=70?'#b26a00':'var(--red)',fontWeight:600}},r.pct+'%'),r.d.items.length,r.sure,
    r.sure?h('button',{className:'btn btn-primary btn-sm',onClick:()=>okAll(r)},'OK all Sure'):(rcSignedOff(r.s.id,ym)?'✔ signed off':'')]),[1,2,3,4]);
}
// #16 · expected this month: recurring payments and statutory / salary dues, paid or not
function RcExpected({sid,ym}){
  const h=React.createElement;const {year,month}=rcYmParts(ym);let rec=[];try{rec=bankRecurringExpected(sid,year,month)||[];}catch(e){}
  let dues=[];try{dues=(allDueItemsFor(sid)||[]).filter(d=>d&&((d.year===year&&d.month===month)||String(d.due||'').slice(0,7)===ym)&&d.type!=='Vendor Payment');}catch(e){}
  const rows=[...rec.map(r=>[r.nature+(r.who&&r.who!==r.nature?' · '+r.who:''),'~ '+r.day,RC_M(r.amount),h('span',{style:{color:r.late?'var(--red)':r.pendingId?'#b26a00':'var(--text2)'}},r.status)]),
    ...dues.map(d=>[d.type+' · '+(d.desc||'').slice(0,50),d.due?String(d.due).split('-').reverse().join('/'):'—',d.amount?RC_M(d.amount):'—',h('span',{style:{color:d.paid?'var(--green)':complianceStatusOf(d)==='Overdue'?'var(--red)':'var(--text2)'}},d.paid?'✓ Paid':complianceStatusOf(d))])];
  return rows.length?rcTable(['Payment','Due','Amount','Status'],rows,[2]):h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'Nothing expected this month'+(typeof controlOn==='function'&&!controlOn('bankRecurringWatch',sid)?' (turn on Controls → “Watch recurring payments” for rent, power …)':'')+'.');
}
// #11 · vendor bills past their due date with no bank payment against them
function RcUnpaidBills({sid,onNavTab}){
  const h=React.createElement;const vendors=loadVendors(sid)||[];const today=localIsoOf(new Date());
  const L=(loadVendorInvoices(sid)||[]).filter(i=>i&&i.docNature!=='Performa Invoice'&&rcBal(i)>0.5).map(i=>{const due=toISO(i.dueDate)||(()=>{const d=new Date((toISO(i.invoiceDate)||today)+'T00:00:00');d.setDate(d.getDate()+30);return localIsoOf(d);})();
    return{i,due,days:Math.round((new Date(today+'T00:00:00')-new Date(due+'T00:00:00'))/864e5)};}).filter(x=>x.days>0).sort((a,b)=>b.days-a.days);
  if(!L.length)return h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No overdue unpaid bills.');
  return h('div',null,rcTable(['Vendor','Bill','Bill date','Balance','Overdue'],L.slice(0,25).map(x=>[(vendors.find(v=>String(v.id)===String(x.i.vendorId))||{}).name||'—',x.i.invoiceNo||x.i.id,x.i.invoiceDate||'',RC_M(rcBal(x.i)),x.days+' days']),[3]),
    h('div',{style:{display:'flex',gap:8,alignItems:'center',marginTop:6,fontSize:11.5,color:'var(--text3)'}},(L.length>25?L.length+' bills in all · ':'')+'Paid in cash or not paid yet? Record it on Vendor Sheet.',onNavTab&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>onNavTab('vendors')},'Vendor Sheet →')));
}
// #10 · balance breaks
function RcBreaks({lines}){const h=React.createElement;const B=rcBalanceBreaks(lines);
  if(!B.length)return h('div',{style:{fontSize:12.5,color:'var(--green)'}},'✓ The running balance adds up line by line.');
  return h('div',null,rcTable(['Between','And','Missing'],B.slice(0,30).map(x=>[x.a.transactionDate+' '+RC_M(x.a.closingBalance),x.b.transactionDate+' '+RC_M(x.b.closingBalance),h('b',{style:{color:'var(--red)'}},(x.gap>0?'+':'−')+RC_M(Math.abs(x.gap)))]),[2]),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'A line of about this amount is missing between these two (or was imported twice). Re-import that part of the statement in Bank Statement.'));}
// #4 · days with card / UPI money in the bank but no Cradlee sales imported
function RcMissingSales({data,onNavTab}){const h=React.createElement;const L=data.settlements.filter(g=>g.day&&!(g.sales>0));
  if(!L.length)return h('div',{style:{fontSize:12.5,color:'var(--green)'}},'✓ Every card / UPI settlement day has sales imported.');
  return h('div',null,h('div',{style:{fontSize:12.5,marginBottom:6}},L.length+' sale day'+(L.length===1?'':'s')+' with bank credits but no Cradlee collection imported: ',h('b',null,[...new Set(L.map(g=>g.day))].slice(0,20).join(', '))),
    onNavTab&&h('button',{className:'btn btn-primary btn-sm',onClick:()=>onNavTab('collection')},'Import Collection Data →'));}
// #23 · cash deposits: Daily Sales & Exp Bank Deposit vs bank cash credits
function RcDeposits({sid,ym,lines}){const h=React.createElement;const dep=rcDseDeposits(sid);const days=Object.keys(dep).filter(d=>d.slice(0,7)===ym).sort();
  const bank=(lines||[]).filter(r=>Number(r.credit)>0&&(r.nature==='Cash Deposit'||/cash dep|by cash|csh dep|\bcdm\b/i.test(r.description||'')));
  const used=new Set();const rows=days.map(d=>{const t=new Date(d+'T00:00:00').getTime();const b=bank.find(r=>!used.has(r.id)&&Math.abs((Number(r.credit)||0)-dep[d])<=1&&(()=>{const i=toISO(r.transactionDate);const u=i?new Date(i+'T00:00:00').getTime():0;return u>=t&&u-t<=4*864e5;})());
    if(b)used.add(b.id);return[d.split('-').reverse().join('/'),RC_M(dep[d]),b?b.transactionDate:'—',b?RC_M(b.credit):'—',h('span',{style:{color:b?'var(--green)':'var(--red)'}},b?'✓':'not in bank yet')];});
  bank.filter(r=>!used.has(r.id)).forEach(r=>rows.push(['—','—',r.transactionDate,RC_M(r.credit),h('span',{style:{color:'#b26a00'}},'not in Daily Sales')]));
  return rows.length?rcTable(['Deposited (Daily Sales)','Amount','In bank','Amount',''],rows,[1,3]):h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No cash deposits this month.');}
// #20 · loans and what is outstanding
function RcLoans({sid,onNavTab}){const h=React.createElement;const L=typeof loadBankLoans==='function'?loadBankLoans(sid):[];
  if(!L.length)return h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No loans set up. Add them in the Bank Statement mapping pop-up (Loans) — EMIs then split into interest and principal by themselves.');
  return rcTable(['Loan','EMI','Rate','Outstanding'],L.map(l=>[l.name||'—',l.emi?RC_M(l.emi):'—',(Number(l.rate)||0)+'%',RC_M(loanOutstanding(sid,l))]),[1,3]);}
// #2 · payees paid more than once who are not vendors / staff yet → add as vendors in one go
function RcPayeeSetup({sid,onDone}){
  const h=React.createElement;const {toast}=useToast();const [pick,setPick]=useState({});
  const vendors=loadVendors(sid)||[];const emps=loadEmployees(sid)||[];const g={};
  bankRowsFor(sid).forEach(r=>{if(!r||!(Number(r.debit)>0))return;const P=rcParse(r.description);if(!P.name||P.name.length<3)return;
    if(rcBestPayee(vendors,r.description,false)||rcBestPayee(emps,r.description,true)||rcAliasHit(sid,r.description,'vendor',vendors)||rcAliasHit(sid,r.description,'emp',emps))return;
    const k=P.name.toLowerCase();const e=g[k]||(g[k]={name:P.name,ifsc:P.ifsc,n:0,total:0,desc:r.description});e.n++;e.total+=Number(r.debit)||0;});
  const L=Object.values(g).filter(e=>e.n>=2).sort((a,b)=>b.total-a.total);
  if(!L.length)return h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'Every regular payee is already a vendor or an employee.');
  const add=()=>{const ch=L.filter(e=>pick[e.name]);if(!ch.length)return;ch.forEach(e=>addVendorFromNarration(sid,e.name,e.desc));toast(ch.length+' vendor'+(ch.length===1?'':'s')+' added with their IFSC — their payments now match','success');setPick({});onDone&&onDone();};
  return h('div',null,rcTable(['','Payee','IFSC','Payments','Total'],L.slice(0,40).map(e=>[h('input',{type:'checkbox',checked:!!pick[e.name],onChange:ev=>setPick(p=>({...p,[e.name]:ev.target.checked}))}),e.name,e.ifsc||'—',e.n,RC_M(e.total)]),[3,4]),
    h('div',{style:{display:'flex',gap:8,marginTop:6,alignItems:'center'}},h('button',{className:'btn btn-primary btn-sm',onClick:add},'＋ Add ticked as vendors'),
      h('span',{style:{fontSize:11.5,color:'var(--text3)'}},'Staff? Add them in Master Salary with their bank details instead.')));
}
// #6 · recent changes made in Reconcile, with Undo
function RcRecent({sid,onDone}){
  const h=React.createElement;const {toast,error}=useToast();const [,bump]=useState(0);
  const J=bankMapJournal(sid).filter(e=>!e.undone&&(e.labels||[]).some(l=>/^Reconcile/.test(l))).sort((a,b)=>(b.lastAt||b.at)-(a.lastAt||a.at)).slice(0,25);
  if(!J.length)return h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'Nothing changed in Reconcile yet.');
  const undo=e=>{const cur=bankRowsFor(sid).find(r=>r.id===e.rowId);if(!cur){error('That bank line is gone.');return;}if(rcLocked(sid,rcMonthKey(cur.transactionDate))){error('Signed off — reopen the month first.');return;}
    if(!window.confirm('Undo: '+(e.labels||[]).join(', ')+'?'))return;try{undoBankMapping(sid,e,cur);toast('Undone','success');bump(x=>x+1);onDone&&onDone();}catch(x){error((x&&x.message)||'Could not undo');}};
  return rcTable(['When','Line','Change','By',''],J.map(e=>[new Date(e.lastAt||e.at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}),(e.date||'')+' '+RC_M(e.amount),(e.labels||[]).join(', ').replace(/Reconcile: /g,''),e.lastBy||e.by||'',
    h('button',{className:'btn btn-ghost btn-sm',onClick:()=>undo(e)},'↶ Undo')]));
}
