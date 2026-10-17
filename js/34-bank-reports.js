// ═══ Bank mapping — reports (summary workbook, payees, productivity, health, certificate, cash flow, forecast,
// one-pager, quarterly review, year-end pack, Tally compare, Reports → Bank Mapping) ═══
// Split out of js/32-bank-mapper.js. Loaded after js/32.

// ── Reports: unmapped ageing, payee summaries, productivity ──
function bankUnmappedAgeing(sid,rows){
  const vendors=loadVendors(sid)||[];const today=new Date();today.setHours(0,0,0,0);const out={a:{n:0,amt:0},b:{n:0,amt:0},c:{n:0,amt:0},oldest:''};
  (rows||bankRowsFor(sid)).forEach(r=>{if(!r||!(Number(r.debit)>0||Number(r.credit)>0))return;const iso=toISO(r.transactionDate);if(!iso||!bankLineProblem(r,vendors))return;
    const d=Math.floor((today-new Date(iso+'T00:00:00'))/864e5);const k=d<=7?'a':d<=30?'b':'c';out[k].n++;out[k].amt+=Number(r.debit)||Number(r.credit)||0;if(!out.oldest||iso<out.oldest)out.oldest=iso;});
  return out;
}

function bankPayeeSummary(sid,year,month,rows){
  const pre=year+'-'+String(month+1).padStart(2,'0');const vendors=loadVendors(sid)||[];
  const L=(rows||bankRowsFor(sid)).filter(r=>r&&Number(r.debit)>0&&String(toISO(r.transactionDate)||'').startsWith(pre));
  const V={},E={};const R2=n=>Math.round((Number(n)||0)*100)/100;
  const ev=k=>E[k]=E[k]||{name:k,lines:0,salary:0,incentive:0,daily:0,advance:0,other:0,total:0};
  L.forEach(r=>{const amt=Number(r.debit)||0;const sp=bankRowSplits(r);
    if(Array.isArray(r.linkedEmployeePay)&&r.linkedEmployeePay.length){r.linkedEmployeePay.forEach(x=>{const e=ev(x.employeeName||'—');e.lines++;e.salary+=Number(x.salary)||0;e.incentive+=Number(x.incentive)||0;e.daily+=Number(x.dailyIncentive)||0;});return;}
    if(Array.isArray(r.linkedAdvance)&&r.linkedAdvance.length){r.linkedAdvance.forEach(x=>{const e=ev(x.employeeName||'—');e.lines++;e.advance+=Number(x.amount)||0;});return;}
    if(['Salary','Incentive','Daily Incentive','Advance Salary'].includes(r.nature)){const e=ev('(not settled to an employee)');e.lines++;e.other+=amt;return;}
    const parts=sp?sp.filter(z=>z.nature==='Vendor Payment').map(z=>({name:z.vendorOverride||'',amt:Number(z.amount)||0})):(r.nature==='Vendor Payment'||r.linkedInvoice)?[{name:bankLineVendorName(r,vendors),amt}]:[];
    parts.forEach(z=>{const k=z.name||'(vendor not identified)';const v=V[k]=V[k]||{name:k,lines:0,amount:0,bills:new Set()};v.lines++;v.amount+=z.amt;
      String(r.linkedInvoice||'').split(',').filter(Boolean).forEach(b=>v.bills.add(b.split('|').pop()));});});
  const vendorsOut=Object.values(V).map(v=>({...v,amount:R2(v.amount),bills:[...v.bills]})).sort((a,b)=>b.amount-a.amount);
  const empOut=Object.values(E).map(e=>({...e,total:R2(e.salary+e.incentive+e.daily+e.advance+e.other)})).sort((a,b)=>b.total-a.total);
  return{vendors:vendorsOut,employees:empOut};
}

// Per person: lines mapped (from the undo journal), of them taken from a suggestion / automatic, undone, suggestions changed, lines checked.
function bankMappingProductivity(sid,fromMs,toMs){
  const to=toMs||Date.now();const by={};const u=k=>by[k]=by[k]||{user:k,mapped:0,fromSugg:0,auto:0,undone:0,amount:0,changed:0,checked:0};
  bankMapJournal(sid).forEach(e=>{const t=e.at||0;if(t<fromMs||t>to)return;const o=u(e.by||'—');
    if((e.labels||[]).some(l=>/^Auto: /.test(l)))o.auto++;else if((e.labels||[]).some(l=>/^✨ /.test(l)))o.fromSugg++;
    if(e.undone)o.undone++;else{o.mapped++;o.amount+=Number(e.amount)||0;}});
  const rv=loadBankReview(sid);Object.values(rv).forEach(v=>{if(v&&v.at>=fromMs&&v.at<=to)u(v.by||'—').checked++;});
  try{const U=JSON.parse(cachedLocalGet(outletKey('salonos_bank_sugg_users',sid))||'{}')||{};const m0=new Date(fromMs).toISOString().slice(0,7),m1=new Date(to).toISOString().slice(0,7);
    Object.keys(U).forEach(k=>{const i=k.lastIndexOf('|');const mo=k.slice(i+1);if(mo>=m0&&mo<=m1)u(k.slice(0,i)).changed+=U[k].rej||0;});}catch(err){}
  return Object.values(by).filter(o=>o.user!=='—'||o.mapped||o.checked).sort((a,b)=>b.mapped-a.mapped);
}

// ── Month-end mapping certificate (printable) ──
function bankHealthScore(sid,year,month,rows){
  const rd=bankMonthReadiness(sid,year,month,rows),rv=bankReviewProgress(sid,year,month,rows),ag=bankUnmappedAgeing(sid,rows);const ex=controlOn('bankExceptions',sid)?bankMappingExceptions(sid,year,month,rows).length:0;
  const ageing=Math.max(0,100-ag.c.n*10-ag.b.n*3-ag.a.n);const excS=Math.max(0,100-ex*15);
  const score=Math.round(0.4*rd.pct+0.2*rv.pct+0.25*ageing+0.15*excS);
  return{score,mapped:rd.pct,reviewed:rv.pct,ageing,exceptions:ex,grade:score>=90?'Good':score>=70?'Fair':'Needs work'};
}

function buildBankCertificateHtml(sid,year,month,autoPrint){
  const salon=getSalonRecordById(sid)||(typeof SALONS!=='undefined'?SALONS.find(s=>s.id===sid):null)||{name:'Outlet'};const lbl=RPT_MONTHS[month]+' '+year;
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));const R=n=>'₹'+Math.round(Number(n)||0).toLocaleString('en-IN');
  const rows=bankRowsFor(sid);const pre=year+'-'+String(month+1).padStart(2,'0');const inM=rows.filter(r=>r&&String(toISO(r.transactionDate)||'').startsWith(pre)&&(Number(r.debit)||Number(r.credit)));
  const rd=bankMonthReadiness(sid,year,month,rows),rv=bankReviewProgress(sid,year,month,rows),hs=bankHealthScore(sid,year,month,rows);
  const exOpen=controlOn('bankExceptions',sid)?bankMappingExceptions(sid,year,month,rows):[];const okMap=loadBankExcOk(sid);const ids=new Set(inM.map(r=>String(r.id)));
  const cleared=Object.keys(okMap).filter(k=>ids.has(k.slice(k.indexOf('|')+1))).length;
  const pushed=loadTallyPushed(sid);const sent=inM.filter(r=>pushed.bank[r.id]).length;
  const from=new Date(year,month,1).getTime(),to=Date.now();const prod=bankMappingProductivity(sid,from,to);
  const dr=inM.reduce((t,r)=>t+(Number(r.debit)||0),0),cr=inM.reduce((t,r)=>t+(Number(r.credit)||0),0);
  const final=isMonthLockedFor(sid,year,month);
  const tr=(k,v)=>'<tr><td>'+esc(k)+'</td><td style="text-align:right"><b>'+esc(v)+'</b></td></tr>';
  const html='<!doctype html><html><head><meta charset="utf-8"><title>Bank mapping certificate — '+esc(rptShort(salon))+' '+esc(lbl)+'</title><style>body{font-family:Arial,sans-serif;color:#1d2433;margin:32px;font-size:13px}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:22px 0 6px;color:#2f5fe0}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d6dbe6;padding:6px 8px;font-size:12.5px}th{background:#f1f4fa;text-align:left}.muted{color:#6b7385}.sig{display:flex;gap:30px;margin-top:48px}.sig div{flex:1;border-top:1px solid #1d2433;padding-top:6px;font-size:12px}.badge{display:inline-block;padding:2px 10px;border-radius:12px;font-weight:700;background:'+(hs.score>=90?'#e3f4e6;color:#1f7a3a':hs.score>=70?'#fff2dc;color:#9a5b00':'#fbe4e2;color:#c0392b')+'}</style></head><body>'
    +'<h1>Bank mapping certificate</h1><div class="muted">'+esc(salon.name||rptShort(salon))+' · '+esc(lbl)+' · '+(final?'Month Final':'Month not Final yet')+' · printed '+esc(new Date().toLocaleString('en-GB',DMY_DT))+'</div>'
    +'<h2>Summary</h2><table>'+tr('Bank lines',inM.length)+tr('Debits / credits',R(dr)+' / '+R(cr))+tr('Mapped',rd.mapped+' of '+rd.total+' ('+rd.pct+'%)')+tr('Still unmapped',(rd.unDebit+rd.unCredit)?rd.unDebit+' debit ('+R(rd.unDebitAmt)+'), '+rd.unCredit+' credit ('+R(rd.unCreditAmt)+')':'None')
    +tr('Checked by a second person',rv.done+' of '+rv.total+' ('+rv.pct+'%)')+tr('Exceptions open / marked right',exOpen.length+' / '+cleared)+tr('Sent to Tally',sent+' of '+inM.length)+'</table>'
    +'<p>Health score: <span class="badge">'+hs.score+' / 100 — '+hs.grade+'</span> <span class="muted">(mapped 40%, checked 20%, ageing 25%, exceptions 15%)</span></p>'
    +(exOpen.length?'<h2>Open exceptions</h2><table><tr><th>Date</th><th>What</th><th>Amount</th><th>Why</th></tr>'+exOpen.map(e=>'<tr><td>'+esc(e.date)+'</td><td>'+esc(e.kind)+'</td><td style="text-align:right">'+R(e.amount)+'</td><td>'+esc(e.text)+'</td></tr>').join('')+'</table>':'')
    +(prod.length?'<h2>Who mapped</h2><table><tr><th>Person</th><th>Lines mapped</th><th>From a suggestion</th><th>Automatic</th><th>Lines checked</th></tr>'+prod.map(o=>'<tr><td>'+esc(o.user)+'</td><td>'+o.mapped+'</td><td>'+o.fromSugg+'</td><td>'+o.auto+'</td><td>'+o.checked+'</td></tr>').join('')+'</table>':'')
    +'<div class="sig"><div>Prepared by</div><div>Reviewed by</div><div>Approved by (Owner / CA)</div></div>'
    +(autoPrint?'<script>window.onload=()=>{window.print();}<\/script>':'')+'</body></html>';
  return html;
}

function printBankMappingCertificate(sid,year,month){
  const html=buildBankCertificateHtml(sid,year,month,true);const w=window.open('','_blank');if(!w){window.alert('Allow pop-ups for this site to print the certificate.');return false;}w.document.write(html);w.document.close();
  try{logAuditEvent(sid,{entity:'Bank Statement',entityId:year+'-'+String(month+1).padStart(2,'0'),action:'Mapping certificate printed',summary:RPT_MONTHS[month]+' '+year});}catch(e){}
  return true;
}

// ── Cash flow by Nature over months (dashboard) ──
function bankCashFlow(sids,year,month,n){
  const months=[];for(let k=(n||6)-1;k>=0;k--){const d=new Date(year,month-k,1);months.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));}
  const idx={};months.forEach((m0,i)=>idx[m0]=i);const by={};const add=(nat,i,inA,outA)=>{const e=by[nat]=by[nat]||{nature:nat,inn:months.map(()=>0),out:months.map(()=>0)};e.inn[i]+=inA;e.out[i]+=outA;};
  (sids||[]).forEach(sid=>{const vendors=loadVendors(sid)||[];bankRowsFor(sid).forEach(r=>{if(!r)return;const i=idx[String(toISO(r.transactionDate)||'').slice(0,7)];if(i==null)return;
    const inA=Number(r.credit)||0,outA=Number(r.debit)||0;if(!inA&&!outA)return;const sp=bankRowSplits(r);
    if(sp){sp.forEach(z=>add(z.nature,i,inA?Number(z.amount)||0:0,outA?Number(z.amount)||0:0));return;}
    add(bankLineProblem(r,vendors)==='No Nature'?'(not mapped)':(r.nature||'(not mapped)'),i,inA,outA);});});
  const rowsOut=Object.values(by).map(e=>({...e,net:e.inn.map((v,i)=>Math.round(v-e.out[i])),tot:e.inn.reduce((t,v)=>t+v,0)-e.out.reduce((t,v)=>t+v,0)})).sort((a,b)=>Math.abs(b.tot)-Math.abs(a.tot));
  const tin=months.map((_,i)=>Math.round(rowsOut.reduce((t,e)=>t+e.inn[i],0))),tout=months.map((_,i)=>Math.round(rowsOut.reduce((t,e)=>t+e.out[i],0)));
  return{months,rows:rowsOut,tin,tout,net:tin.map((v,i)=>v-tout[i])};
}

// ── Vendor payment pattern: days from bill date to payment, early / late against the due date ──
function vendorPaymentPattern(sid,monthsBack){
  const cut=new Date();cut.setMonth(cut.getMonth()-(monthsBack||12));const cutIso=cut.toISOString().slice(0,10);const vendors=loadVendors(sid)||[];const by={};
  (loadVendorInvoices(sid)||[]).forEach(i=>{if(!i||i.docNature==='Performa Invoice')return;const bi=toISO(i.invoiceDate);if(!bi)return;const di=toISO(i.dueDate);
    (i.payments||[]).forEach(q=>{const pi=toISO(q.paidDate);const a=Number(q.paidAmount)||0;if(!pi||pi<cutIso||!(a>0)||q.mode==='TDS')return;
      const v=vendors.find(z=>String(z.id)===String(i.vendorId));const k=v?v.name:'(unknown vendor)';const e=by[k]=by[k]||{name:k,payments:0,amount:0,wDays:0,late:0,early:0,onTime:0,noDue:0};
      const days=Math.round((new Date(pi+'T00:00:00')-new Date(bi+'T00:00:00'))/864e5);e.payments++;e.amount+=a;e.wDays+=days*a;
      if(!di)e.noDue++;else{const dd=Math.round((new Date(pi+'T00:00:00')-new Date(di+'T00:00:00'))/864e5);if(dd>0)e.late++;else if(dd<-7)e.early++;else e.onTime++;}});});
  return Object.values(by).map(e=>({...e,amount:Math.round(e.amount),avgDays:e.amount?Math.round(e.wDays/e.amount):0})).sort((a,b)=>b.amount-a.amount);
}

// ── Unmapped older than N days (WhatsApp nudge) ──
function bankUnmappedOlderThan(sid,days){
  const vendors=loadVendors(sid)||[];const today=new Date();today.setHours(0,0,0,0);let n=0,amt=0,oldest='';
  bankRowsFor(sid).forEach(r=>{if(!r||!(Number(r.debit)||Number(r.credit)))return;const iso=toISO(r.transactionDate);if(!iso||!bankLineProblem(r,vendors))return;
    if((today-new Date(iso+'T00:00:00'))/864e5<=days)return;n++;amt+=Number(r.debit)||Number(r.credit)||0;if(!oldest||iso<oldest)oldest=iso;});
  return{n,amt,oldest};
}

function bankNudgeUrl(salon,info,days){
  const ph=typeof waNumber==='function'?waNumber(salon&&salon.phone):String(salon&&salon.phone||'').replace(/\D/g,'');if(!ph)return'';
  const R=n=>'₹'+Math.round(n).toLocaleString('en-IN');const app=(typeof location!=='undefined'?location.origin+location.pathname:'');
  const msg='Hi'+(salon.manager?' '+salon.manager:'')+', '+rptShort(salon)+' has '+info.n+' bank line'+(info.n===1?'':'s')+' ('+R(info.amt)+') not mapped for more than '+days+' days'+(info.oldest?' — oldest '+info.oldest.split('-').reverse().join('/'):'')+'. Please open SalonOS → Bank Statement → 🧩 Unmapped bank lines and map them today. '+app;
  return'https://wa.me/'+ph+'?text='+encodeURIComponent(msg);
}

// ── Two-way check with Tally's bank ledger ──
function compareBankWithTally(sid,year,month,vouchers,rows){
  const pre=year+'-'+String(month+1).padStart(2,'0');const inM=(rows||bankRowsFor(sid)).filter(r=>r&&String(toISO(r.transactionDate)||'').startsWith(pre)&&(Number(r.debit)||Number(r.credit)));
  const t=d=>{const i=toISO(d);return i?new Date(i+'T00:00:00').getTime():0;};const used=new Set();const onlyTally=[];
  (vouchers||[]).forEach(v=>{const side=v.side;const c=inM.filter(r=>!used.has(r.id)&&(side==='Credit')===(Number(r.credit)>0)&&Math.abs((Number(r.debit)||Number(r.credit))-v.amount)<=0.5&&Math.abs(t(r.transactionDate)-t(v.date))<=3*864e5)
    .sort((a,b)=>Math.abs(t(a.transactionDate)-t(v.date))-Math.abs(t(b.transactionDate)-t(v.date)));if(c.length)used.add(c[0].id);else onlyTally.push(v);});
  const pushed=loadTallyPushed(sid);const onlyBank=inM.filter(r=>!used.has(r.id));
  const sum=(a,f)=>Math.round(a.reduce((s,z)=>s+f(z),0));
  return{tallyIn:sum((vouchers||[]).filter(v=>v.side==='Credit'),v=>v.amount),tallyOut:sum((vouchers||[]).filter(v=>v.side==='Debit'),v=>v.amount),bankIn:sum(inM,r=>Number(r.credit)||0),bankOut:sum(inM,r=>Number(r.debit)||0),
    onlyTally,onlyBank:onlyBank.map(r=>({...r,sent:!!pushed.bank[r.id]}))};
}

// ── 30-day bank balance forecast ──
function bankCashForecast(sid,days){
  days=days||30;const rows=bankRowsFor(sid).map((r,i)=>({r,i,iso:toISO(r&&r.transactionDate)||''})).filter(o=>o.iso&&o.r);if(!rows.length)return null;
  const withBal=rows.filter(o=>o.r.closingBalance!=null&&o.r.closingBalance!==''&&!isNaN(Number(o.r.closingBalance))&&Number(o.r.closingBalance)!==0).sort((a,b)=>a.iso.localeCompare(b.iso)||a.i-b.i);if(!withBal.length)return null;
  const last=withBal[withBal.length-1];const start=Number(last.r.closingBalance);const d0=new Date(last.iso+'T00:00:00');const vendors=loadVendors(sid)||[];
  const IN=new Set(['Card Settlement','UPI Settlement','Collection','Cash Deposit','Swiggy Settlement','Zomato Settlement','EazyDiner Settlement','Ownly Settlement','Eatby Minutes Settlement']);
  const fromIso=new Date(d0.getTime()-29*864e5).toISOString().slice(0,10);
  const inflowDay=rows.filter(o=>o.iso>=fromIso&&o.iso<=last.iso&&Number(o.r.credit)>0&&IN.has(o.r.nature)).reduce((t,o)=>t+Number(o.r.credit),0)/30;
  // regular payments of the last 4 months
  const mk=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');const prevs=[1,2,3,4].map(k=>mk(new Date(d0.getFullYear(),d0.getMonth()-k,1)));
  const g={};rows.forEach(o=>{const r=o.r;if(!(Number(r.debit)>0)||!r.nature||bankLineProblem(r,vendors))return;const vn=(r.nature==='Vendor Payment'||r.linkedInvoice)?bankLineVendorName(r,vendors):'';const k=r.nature+'|'+(vn||bmapSig(r.description));
    const ym=o.iso.slice(0,7);const e=g[k]=g[k]||{};(e[ym]=e[ym]||[]).push(o);});
  const outs=[];const recVendors=new Set();
  Object.keys(g).forEach(k=>{const byM=g[k];const hit=prevs.filter(pm=>byM[pm]);if(hit.length<3)return;const amts=hit.map(pm=>byM[pm].reduce((t,o)=>t+Number(o.r.debit),0)).sort((a,b)=>a-b);const med=amts[Math.floor(amts.length/2)];
    if(amts.some(a=>Math.abs(a-med)>med*0.25+1))return;const day=hit.map(pm=>Number(byM[pm][0].iso.slice(8,10))).sort((a,b)=>a-b)[Math.floor(hit.length/2)];
    const label=k.slice(0,k.indexOf('|'))+(k.slice(k.indexOf('|')+1)&&k.startsWith('Vendor Payment')?' · '+k.slice(k.indexOf('|')+1):'');if(k.startsWith('Vendor Payment|'))recVendors.add(k.slice(15));
    for(let mo=0;mo<=2;mo++){const dt=new Date(d0.getFullYear(),d0.getMonth()+mo,Math.min(day,new Date(d0.getFullYear(),d0.getMonth()+mo+1,0).getDate()));const off=Math.round((dt-d0)/864e5);
      if(off<1||off>days)continue;if(mo===0&&byM[mk(d0)])continue;outs.push({off,date:dt,label,amount:Math.round(med),kind:'regular'});}});
  // unpaid bills by due date (vendors not already counted as regular)
  (loadVendorInvoices(sid)||[]).forEach(i=>{if(!i||i.docNature==='Performa Invoice')return;const bal=(Number(i.amount)||0)-(i.payments||[]).reduce((t,q)=>t+(Number(q.paidAmount)||0),0);if(!(bal>1))return;
    const v=vendors.find(z=>String(z.id)===String(i.vendorId));if(v&&recVendors.has(v.name))return;const di=toISO(i.dueDate)||toISO(i.invoiceDate);if(!di)return;
    let off=Math.round((new Date(di+'T00:00:00')-d0)/864e5);if(off<1)off=1;if(off>days)return;outs.push({off,date:new Date(d0.getTime()+off*864e5),label:'Bill '+(i.invoiceNo||'')+(v?' · '+v.name:''),amount:Math.round(bal),kind:'bill'});});
  const series=[start];let bal=start,min=start,minOff=0;
  for(let d=1;d<=days;d++){bal+=inflowDay-outs.filter(o=>o.off===d).reduce((t,o)=>t+o.amount,0);series.push(Math.round(bal));if(bal<min){min=bal;minOff=d;}}
  return{start:Math.round(start),startDate:last.r.transactionDate,inflowDay:Math.round(inflowDay),outs:outs.sort((a,b)=>a.off-b.off),payments:Math.round(outs.reduce((t,o)=>t+o.amount,0)),series,min:Math.round(min),minDate:new Date(d0.getTime()+minOff*864e5),end:Math.round(bal)};
}

// ── Outlet comparison: costs from the bank as % of sales ──
function bankOutletRatios(sid,year,month){
  const s=typeof collectionSalesSumFor==='function'?collectionSalesSumFor(sid,year,month):{cash:0,card:0,upi:0};const sales=(s.cash||0)+(s.card||0)+(s.upi||0);
  const cf=bankCashFlow([sid],year,month,1);const out=n=>{const e=cf.rows.find(z=>z.nature===n);return e?e.out[0]:0;};
  const pre=year+'-'+String(month+1).padStart(2,'0');const T=cradleeDayTotals(sid);let sold=0;Object.keys(T).forEach(d=>{if(String(toISO(d)||'').startsWith(pre))sold+=(T[d].card||0)+(T[d].upi||0);});
  const settled=bankRowsFor(sid).filter(r=>r&&Number(r.credit)>0&&(r.nature==='Card Settlement'||r.nature==='UPI Settlement')&&String(toISO(r.cradleeDate)||'').startsWith(pre)).reduce((t,r)=>t+Number(r.credit),0);
  const vals={rent:out('Rent')+out('DG Rent'),power:out('Electricity Expenses'),bank:out('Bank Charges'),salary:out('Salary')+out('Incentive')+out('Daily Incentive'),fees:settled>0&&sold>settled?sold-settled:0};
  const pct=v=>sales>0?Math.round(v/sales*1000)/10:null;
  return{sales:Math.round(sales),vals,pct:{rent:pct(vals.rent),power:pct(vals.power),bank:pct(vals.bank),salary:pct(vals.salary),fees:pct(vals.fees)}};
}

// ── Monthly bank one-pager for the owner (printable) ──
function printBankOnePager(outs,year,month){
  const lbl=RPT_MONTHS[month]+' '+year;const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));const R=n=>(n<0?'-':'')+'₹'+Math.abs(Math.round(Number(n)||0)).toLocaleString('en-IN');
  const sec=outs.map(s=>{const cf=bankCashFlow([s.id],year,month,1);const ps=bankPayeeSummary(s.id,year,month);const hs=bankHealthScore(s.id,year,month);const rd=bankMonthReadiness(s.id,year,month);
    const ex=controlOn('bankExceptions',s.id)?bankMappingExceptions(s.id,year,month).length:0;
    return'<h2>'+esc(rptShort(s))+' <span class="muted">— health '+hs.score+'/100 · '+rd.pct+'% mapped · '+ex+' open exception(s)</span></h2>'
      +'<table><tr><th>Nature</th><th>In</th><th>Out</th><th>Net</th></tr>'+cf.rows.slice(0,10).map(e=>'<tr><td>'+esc(e.nature)+'</td><td>'+(e.inn[0]?R(e.inn[0]):'')+'</td><td>'+(e.out[0]?R(e.out[0]):'')+'</td><td>'+R(e.net[0])+'</td></tr>').join('')
      +'<tr class="tot"><td>Total</td><td>'+R(cf.tin[0])+'</td><td>'+R(cf.tout[0])+'</td><td>'+R(cf.net[0])+'</td></tr></table>'
      +(ps.vendors.length?'<p class="muted">Top vendors: '+ps.vendors.slice(0,5).map(v=>esc(v.name)+' '+R(v.amount)).join(' · ')+'</p>':'');}).join('');
  const html='<!doctype html><html><head><meta charset="utf-8"><title>Bank one-pager — '+esc(lbl)+'</title><style>body{font-family:Arial,sans-serif;color:#1d2433;margin:28px;font-size:12.5px}h1{font-size:19px;margin:0}h2{font-size:14px;margin:18px 0 6px;color:#2f5fe0}.muted{color:#6b7385;font-weight:400}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d6dbe6;padding:5px 8px;text-align:right}td:first-child,th:first-child{text-align:left}th{background:#f1f4fa}.tot td{font-weight:700;background:#f7f8fb}</style></head><body>'
    +'<h1>Bank summary — '+esc(lbl)+'</h1><div class="muted">'+outs.length+' outlet(s) · printed '+esc(new Date().toLocaleString('en-GB',DMY_DT))+'</div>'+sec+'<script>window.onload=()=>{window.print();}<\/script></body></html>';
  const w=window.open('','_blank');if(!w){window.alert('Allow pop-ups for this site to print the one-pager.');return false;}w.document.write(html);w.document.close();return true;
}

function bankOnePagerText(outs,year,month){
  const R=n=>(n<0?'-':'')+'₹'+Math.abs(Math.round(Number(n)||0)).toLocaleString('en-IN');
  return'Bank summary — '+RPT_MONTHS[month]+' '+year+'\n'+outs.map(s=>{const cf=bankCashFlow([s.id],year,month,1);const hs=bankHealthScore(s.id,year,month);
    return'• '+rptShort(s)+': in '+R(cf.tin[0])+', out '+R(cf.tout[0])+', net '+R(cf.net[0])+' · health '+hs.score+'/100';}).join('\n');
}

// ── Year-end pack: every month of the FY — mapping workbook, certificate, exceptions log — zipped ──
async function buildBankYearPack(sid,year,month){
  const {fy}=calToFYMI(year,month);const sy=Number(fy.slice(0,4));const salon=getSalonRecordById(sid)||(typeof SALONS!=='undefined'?SALONS.find(s=>s.id===sid):null)||{name:'Outlet'};
  await loadScript(CDN.zip);const zip=new window.JSZip();const now=new Date();let files=0;const log=[['Month','Date','Kind','Amount','Description','Why','Status','By','On']];
  const csv=v=>{const s=String(v==null?'':v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  for(let k=0;k<12;k++){const d=new Date(sy,3+k,1);if(d>now)break;const y=d.getFullYear(),m=d.getMonth();const ym=y+'-'+String(m+1).padStart(2,'0');
    const inM=bankRowsFor(sid).filter(r=>r&&String(toISO(r.transactionDate)||'').startsWith(ym));if(!inM.length)continue;
    const {wb}=await buildBankMappingSummaryWorkbook(sid,y,m);zip.file(ym+'/Bank_Mapping_'+ym+'.xlsx',await wb.xlsx.writeBuffer());files++;
    zip.file(ym+'/Certificate_'+ym+'.html',buildBankCertificateHtml(sid,y,m,false));files++;
    const lbl=RPT_MONTHS[m]+' '+y;
    (controlOn('bankExceptions',sid)?bankMappingExceptions(sid,y,m):[]).forEach(e=>log.push([lbl,e.date,e.kind,Math.round(e.amount),e.description,e.text,'Open','','']));
    const ok=loadBankExcOk(sid);const ids=new Set(inM.map(r=>String(r.id)));
    Object.keys(ok).forEach(key=>{const i=key.indexOf('|');const rid=key.slice(i+1);if(!ids.has(rid))return;const r=inM.find(z=>String(z.id)===rid)||{};log.push([lbl,r.transactionDate||'',key.slice(0,i),Math.round(Number(r.debit)||Number(r.credit)||0),r.description||'','','Marked right',ok[key].by||'',ok[key].at?new Date(ok[key].at).toLocaleString('en-GB',DMY_DT):'']);});}
  zip.file('Exceptions_log_FY'+fy+'.csv','\ufeff'+log.map(r=>r.map(csv).join(',')).join('\r\n'));files++;
  zip.file('README.txt','Bank mapping year-end pack — '+(salon.name||rptShort(salon))+' — FY '+fy+'\r\nEach month folder: the mapping workbook (lines, summary, by vendor, by employee) and the month certificate (open in a browser to print).\r\nExceptions_log: open and marked-right exceptions of every month.\r\nMade '+now.toLocaleString('en-IN')+'.');
  const blob=await zip.generateAsync({type:'blob'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Bank_YearEnd_'+rptFile(rptShort(salon))+'_FY'+fy+'.zip';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
  try{logAuditEvent(sid,{entity:'Bank Statement',entityId:'FY'+fy,action:'Year-end pack downloaded',summary:files+' file(s)'});}catch(e){}
  return{files};
}

// Reports → Bank Mapping: pick a month and open the pop-up (read-only for Reviewers / Owner).
function BankMappingReportPanel({salon}){
  const h=React.createElement;const sid=salon&&salon.id;const [ym,setYm]=useState(()=>{const d=new Date();d.setMonth(d.getMonth()-1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');});const [open,setOpen]=useState(null);
  if(sid==null)return null;const u=currentSessionUser();const ro=bankMapReadOnly(sid);
  if(ro&&u&&['Reviewer','Owner','Auditor'].includes(u.role)&&!controlOn('bankAuditorView',sid))return h('div',{className:'card',style:{fontSize:13,color:'var(--text3)'}},'The read-only bank mapping view is turned off for this outlet (Master Settings → 🎛 Controls).');
  const months=[...Array(15)].map((_,k)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-k);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');});
  const y=Number(ym.slice(0,4)),m=Number(ym.slice(5,7))-1;
  return h('div',{className:'card'},h('div',{style:{fontWeight:700,fontSize:15,marginBottom:4}},'🏦 Bank mapping'),
    h('div',{style:{fontSize:12.5,color:'var(--text3)',marginBottom:10}},ro?'Read-only: you can see every mapping, the review, exceptions, month close, payees and print the certificate — nothing can be changed.':'Opens the mapping pop-up for the month.'),
    h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},h('select',{className:'form-control',style:{width:'auto'},value:ym,onChange:e=>setYm(e.target.value)},months.map(v=>h('option',{key:v,value:v},RPT_MONTHS[Number(v.slice(5,7))-1]+' '+v.slice(0,4)))),
      [['review','🔍 Review'],['exc','⚠ Exceptions'],['close','✅ Month close'],['payees','📊 Payees']].map(([v,l])=>h('button',{key:v,className:'btn btn-ghost btn-sm',onClick:()=>setOpen(v)},l)),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>printBankMappingCertificate(sid,y,m)},'🧾 Certificate')),
    open&&h(UnmappedLinesPopup,{sid,getList:()=>unmappedBankLinesFor(sid,y,m),month:{year:y,month:m},startView:open,title:'Bank mapping — '+RPT_MONTHS[m]+' '+y,intro:ro?'Read-only view.':'',onClose:()=>setOpen(null),onNavTab:null}));
}

// ── Quarterly owner review (printable deck) ──
function printBankQuarterDeck(outs,year,month){
  const {fy,mi}=calToFYMI(year,month);const q=Math.floor(mi/3);const sy=Number(fy.slice(0,4));const months=[0,1,2].map(k=>{const d=new Date(sy,3+q*3+k,1);return{y:d.getFullYear(),m:d.getMonth()};});
  const lbl='Q'+(q+1)+' FY '+fy+' ('+RPT_MONTHS[months[0].m].slice(0,3)+'–'+RPT_MONTHS[months[2].m].slice(0,3)+' '+months[2].y+')';
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));const R=n=>(n<0?'-':'')+'₹'+Math.abs(Math.round(Number(n)||0)).toLocaleString('en-IN');
  const health=outs.map(s=>({s,h:months.map(mm=>bankHealthScore(s.id,mm.y,mm.m))}));
  const flows=outs.map(s=>({s,cf:bankCashFlow([s.id],months[2].y,months[2].m,3)}));
  const excK={};outs.forEach(s=>months.forEach(mm=>{(controlOn('bankExceptions',s.id)?bankMappingExceptions(s.id,mm.y,mm.m):[]).forEach(e=>{excK[e.kind]=(excK[e.kind]||0)+1;});}));
  const staffDays=s=>{let w=0,a=0;bankRowsFor(s.id).forEach(r=>{(Array.isArray(r.linkedEmployeePay)?r.linkedEmployeePay:[]).forEach(p=>{const iso=toISO(r.transactionDate);if(!iso||p.year==null)return;const end=new Date(p.year,p.month+1,0);const dd=Math.round((new Date(iso+'T00:00:00')-end)/864e5);const amt=(Number(p.salary)||0)+(Number(p.incentive)||0);
    if(months.some(mm=>mm.y===p.year&&mm.m===p.month)){w+=dd*amt;a+=amt;}});});return a?Math.round(w/a):null;};
  const slide=(t,body)=>'<section><h2>'+esc(t)+'</h2>'+body+'</section>';
  const html='<!doctype html><html><head><meta charset="utf-8"><title>Bank review — '+esc(lbl)+'</title><style>@page{size:A4 landscape;margin:14mm}body{font-family:Arial,sans-serif;color:#1d2433;margin:0}section{page-break-after:always;padding:18px 24px;min-height:170mm}section:last-child{page-break-after:auto}h1{font-size:30px;margin:60px 0 8px;color:#14335e}h2{font-size:20px;color:#2f5fe0;margin:0 0 14px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #d6dbe6;padding:7px 9px;text-align:right}td:first-child,th:first-child{text-align:left}th{background:#f1f4fa}.g{color:#1f7a3a;font-weight:700}.a{color:#9a5b00;font-weight:700}.r{color:#c0392b;font-weight:700}.muted{color:#6b7385}</style></head><body>'
    +'<section><h1>Bank review</h1><div style="font-size:18px">'+esc(lbl)+'</div><p class="muted">'+outs.length+' outlet(s) · prepared '+esc(new Date().toLocaleDateString('en-GB',DMY_D))+' from SalonOS bank mapping.</p></section>'
    +slide('Mapping health by outlet','<table><tr><th>Outlet</th>'+months.map(mm=>'<th>'+RPT_MONTHS[mm.m].slice(0,3)+'</th>').join('')+'</tr>'+health.map(x=>'<tr><td>'+esc(rptShort(x.s))+'</td>'+x.h.map(h2=>'<td class="'+(h2.score>=90?'g':h2.score>=70?'a':'r')+'">'+h2.score+' <span class="muted">('+h2.mapped+'% mapped)</span></td>').join('')+'</tr>').join('')+'</table>')
    +slide('Money in and out','<table><tr><th>Outlet</th>'+months.map(mm=>'<th>'+RPT_MONTHS[mm.m].slice(0,3)+' in / out / net</th>').join('')+'</tr>'+flows.map(x=>'<tr><td>'+esc(rptShort(x.s))+'</td>'+x.cf.months.map((_,i)=>'<td>'+R(x.cf.tin[i])+' / '+R(x.cf.tout[i])+' / <b>'+R(x.cf.net[i])+'</b></td>').join('')+'</tr>').join('')+'</table>')
    +slide('Exceptions this quarter',Object.keys(excK).length?'<table><tr><th>Kind</th><th>Open</th></tr>'+Object.entries(excK).sort((a,b)=>b[1]-a[1]).map(([k,n])=>'<tr><td>'+esc(k)+'</td><td>'+n+'</td></tr>').join('')+'</table>':'<p class="g">No open exceptions.</p>')
    +slide('How fast vendors and staff were paid','<table><tr><th>Outlet</th><th>Vendors — avg days after bill</th><th>Late vendor payments</th><th>Staff — avg days after month end</th></tr>'+outs.map(s=>{const vp=vendorPaymentPattern(s.id,4);const pay=vp.reduce((t,e)=>t+e.amount,0);const avg=pay?Math.round(vp.reduce((t,e)=>t+e.avgDays*e.amount,0)/pay):null;const sd=staffDays(s);
      return'<tr><td>'+esc(rptShort(s))+'</td><td>'+(avg==null?'—':avg+' days')+'</td><td>'+vp.reduce((t,e)=>t+e.late,0)+'</td><td>'+(sd==null?'—':sd+' days')+'</td></tr>';}).join('')+'</table>')
    +'<script>window.onload=()=>{window.print();}<\/script></body></html>';
  const w=window.open('','_blank');if(!w){window.alert('Allow pop-ups for this site to print the review.');return false;}w.document.write(html);w.document.close();return true;
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
    K.put(ws,r,10,pay);K.put(ws,r,11,x.cradleeDate||'');K.put(ws,r,12,je?je.lastBy||je.by:'');K.put(ws,r,13,je?new Date(je.lastAt||je.at).toLocaleString('en-GB',DMY_DT):'');K.put(ws,r,14,tally);
    K.style(ws,r,COLS);ws.getCell(r,2).alignment={wrapText:true,vertical:'top'};
    if(prob)ws.getCell(r,6).font={color:{argb:'FFC0392B'},bold:true,size:10};if(tally!=='Sent')ws.getCell(r,14).font={color:{argb:'FFD08A12'},size:10};r++;});
  if(r===st){K.put(ws,r,1,'No bank lines this month');K.style(ws,r,COLS);r++;}
  const end=r-1;K.put(ws,r,1,'Total');K.put(ws,r,4,{f:'SUM(D'+st+':D'+end+')',r:0},N2);K.put(ws,r,5,{f:'SUM(E'+st+':E'+end+')',r:0},N2);K.style(ws,r,COLS,'grand');
  ws.autoFilter={from:{row:4,column:1},to:{row:Math.max(4,end),column:COLS}};
  ws.columns=[{width:11},{width:42},{width:14},{width:12},{width:12},{width:24},{width:18},{width:20},{width:18},{width:24},{width:11},{width:14},{width:17},{width:14}];K.setup(ws,true,4);
  // Vendor-wise and employee-wise
  {const ps=bankPayeeSummary(sid,year,month,bankRowsFor(sid));
    const wv=K.sheet('By vendor','FF2F5FE0');K.banner(wv,'Vendor-wise bank payments — '+rptShort(salon)+' · '+lbl,'Debits mapped as Vendor Payment (or linked to bills), split parts included.',4);
    K.head(wv,4,['Vendor','Lines','Bills linked','Paid ₹'],4);let rv2=5;const sv=rv2;
    ps.vendors.forEach(v=>{K.put(wv,rv2,1,v.name);K.put(wv,rv2,2,v.lines);K.put(wv,rv2,3,v.bills.join(', '));K.put(wv,rv2,4,R2(v.amount),N2);K.style(wv,rv2,4);rv2++;});
    if(rv2===sv){K.put(wv,rv2,1,'No vendor payments');K.style(wv,rv2,4);rv2++;}
    K.put(wv,rv2,1,'Total');K.put(wv,rv2,2,{f:'SUM(B'+sv+':B'+(rv2-1)+')',r:0});K.put(wv,rv2,4,{f:'SUM(D'+sv+':D'+(rv2-1)+')',r:0},N2);K.style(wv,rv2,4,'grand');
    wv.columns=[{width:34},{width:8},{width:36},{width:14}];K.setup(wv,false,4);
    const we=K.sheet('By employee','FF6A1B9A');K.banner(we,'Employee-wise bank payments — '+rptShort(salon)+' · '+lbl,'Salary, incentive, daily incentive and advances paid from the bank and settled to each employee.',8);
    K.head(we,4,['Employee','Lines','Salary ₹','Incentive ₹','Daily inc. ₹','Advance ₹','Other ₹','Total ₹'],4);let re=5;const se=re;
    ps.employees.forEach(e=>{K.put(we,re,1,e.name);K.put(we,re,2,e.lines);['salary','incentive','daily','advance','other'].forEach((k,i)=>K.put(we,re,3+i,R2(e[k]),N2));K.put(we,re,8,{f:'SUM(C'+re+':G'+re+')',r:R2(e.total)},N2);K.style(we,re,8);re++;});
    if(re===se){K.put(we,re,1,'No employee payments');K.style(we,re,8);re++;}
    K.put(we,re,1,'Total');['B','C','D','E','F','G','H'].forEach((col,i)=>K.put(we,re,2+i,{f:'SUM('+col+se+':'+col+(re-1)+')',r:0},i?N2:undefined));K.style(we,re,8,'grand');
    we.columns=[{width:30},{width:8},{width:13},{width:13},{width:13},{width:13},{width:13},{width:14}];K.setup(we,false,4);}
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
