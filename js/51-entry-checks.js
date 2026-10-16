// ═════════════════════════════════════════════════════════════════════════════════════════════
// Entry checks — duplicates and data entry errors (Master Settings → Controls → Entry checks).
// Every check has its own switch, for all outlets and outlet-wise. Warnings ask "Save anyway?"
// (and an override is written to the Audit Log); the blocking rules are off until switched on.
//   Duplicates: employee IDs, shared bank accounts, vendors, same bill under a new number, repeat
//   expenses, an expense entered in two places, advances / penalties, files imported twice,
//   stock received twice, double clicks.
//   Errors: extra zero, Daily Sales vs Billing (by mode and in total), cash deposits vs the bank,
//   GST arithmetic, dates, future dates (js/02 isBackdateBlocked), attendance, salary master,
//   negative stock, proof above a limit, and a weekly data-quality score per outlet.
// ═════════════════════════════════════════════════════════════════════════════════════════════
function ecOn(id,sid){return typeof controlOn==='function'&&controlOn(id,sid);}
function ecLim(id,d,sid){const v=typeof controlLimit==='function'?Number(controlLimit(id,sid)):0;return v>0?v:d;}
// warns.push / blocks.push that remembers which switch raised it (Controls → ctlHitStats)
function ecTag(id,arr){arr.ids=arr.map(()=>id);return arr;}
function ecPush(arr,id,msg){arr.push(msg);(arr.ids=arr.ids||[]).push(id);}
function ecM(n){return '₹'+Math.round(Number(n)||0).toLocaleString('en-IN');}
function ecToday(){return localIsoOf(new Date());}
function ecIso(v){const s=String(v==null?'':v).trim();let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[1]+'-'+m[2]+'-'+m[3];
  m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);if(m)return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');return'';}
function ecDmy(iso){const p=String(iso||'').split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:String(iso||'');}
function ecDays(a,b){return Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/864e5);}
function ecAddDays(iso,n){const d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+n);return localIsoOf(d);}
function ecNorm(v){return String(v==null?'':v).replace(/[\s\-.\/]/g,'').toUpperCase();}
function ecLoad(base,sid,def){try{const v=JSON.parse(cachedLocalGet(outletKey(base,sid))||'null');return v==null?def:v;}catch(e){return def;}}
function ecUser(){const u=typeof currentSessionUser==='function'?currentSessionUser():null;return u?(u.name||u.email||''):'';}
function ecShort(s){return String((s&&s.name)||'').split('—')[0].trim();}
function ecAgo(ts){const m=Math.max(1,Math.round((Date.now()-new Date(ts).getTime())/60000));return m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':Math.round(m/1440)+' day(s) ago';}
// Warnings → "Save anyway?" (an override goes to the Audit Log); blocks → can't save.
function ecHits(arr,sid,kind){if(typeof controlHit==='function')[...new Set((arr&&arr.ids)||[])].forEach(id=>controlHit(id,sid,kind));}
function ecConfirm(sid,what,warns,blocks){
  if(blocks&&blocks.length){ecHits(blocks,sid,'b');window.alert('Cannot save '+what+':\n\n• '+blocks.join('\n• '));return false;}
  if(!warns||!warns.length)return true;ecHits(warns,sid,'w');
  const ok=window.confirm('Please check '+what+':\n\n• '+warns.join('\n• ')+'\n\nSave anyway?');if(ok)ecHits(warns,sid,'o');
  if(ok){try{logAuditEvent(sid,{entity:'Entry check',entityId:String(what).slice(0,60),action:'Saved despite warning',summary:warns.join(' | ').slice(0,400)});}catch(e){}}
  return ok;
}
// 10 · Double click / double save — the same entry saved again within a few seconds is ignored.
const EC_ONCE={};
function ecOnce(sid,kind,payload){
  if(!ecOn('doubleSaveGuard',sid))return true;
  let k;try{k=sid+'|'+kind+'|'+JSON.stringify(payload);}catch(e){return true;}
  const now=Date.now();if(EC_ONCE[k]&&now-EC_ONCE[k]<3000)return false;EC_ONCE[k]=now;return true;
}
const EC_SKIP_ROWS=/Salary|Incentive|Advance|Penalt|Commission|Bank Deposit|Tip To|Cash Handover|Cash Packet/i;
function ecExpenseRows(){return typeof EXPENSE_ROWS!=='undefined'?EXPENSE_ROWS:[];}
function ecGatedRow(name){return typeof INVOICE_GATED_EXPENSE_ROWS!=='undefined'&&INVOICE_GATED_EXPENSE_ROWS.includes(name);}

// ── employees, vendors and bank accounts across outlets ──
function ecAllEmployees(sid,list){const out=[];(typeof SALONS!=='undefined'?SALONS:[]).forEach(s=>{const L=String(s.id)===String(sid)&&list?list:(loadEmployees(s.id)||[]);L.forEach(e=>e&&out.push({s,e}));});return out;}
function ecAllVendors(){const out=[];(typeof SALONS!=='undefined'?SALONS:[]).forEach(s=>{(loadVendors(s.id)||[]).forEach(v=>v&&out.push({s,v}));});return out;}
function ecNameKey(n){return String(n||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\bm\/s\b|\bms\.?\s/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\b(pvt|private|ltd|limited|llp|inc|co|company|the|india)\b/g,' ').replace(/\s+/g,'');}
function ecLev(a,b){if(Math.abs(a.length-b.length)>2)return 9;const d=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)d[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length];}
function ecAccountHolders(sid,acct,skip){
  const a=ecNorm(acct);if(a.length<6)return[];const out=[];
  ecAllEmployees(sid,skip&&skip.empList).forEach(({s,e})=>{if(skip&&skip.emp&&String(s.id)===String(sid)&&String(e.id)===String(skip.emp))return;if(ecNorm(e.accountNo)===a)out.push('employee '+e.name+' ('+e.id+(String(s.id)!==String(sid)?', '+ecShort(s):'')+')');});
  ecAllVendors().forEach(({s,v})=>{if(skip&&skip.vendor&&String(s.id)===String(sid)&&String(v.id)===String(skip.vendor))return;if(ecNorm(v.accountNo)===a)out.push('vendor '+v.name+' ('+v.id+(String(s.id)!==String(sid)?', '+ecShort(s):'')+')');});
  return out;
}
// 1, 2, 19 · Master Salary → employee save. `emp` carries the recomputed gross; `prev` is the saved record when editing.
function ecEmployeeOk(sid,emp,prev,list){
  const warns=[];const today=ecToday();
  if(ecOn('dupEmployee',sid)){const F=[['pan','PAN'],['aadhar','Aadhaar'],['pfNumber','UAN'],['esicNumber','ESIC number'],['mobile','Mobile']];
    ecAllEmployees(sid,list).forEach(({s,e})=>{if(String(s.id)===String(sid)&&String(e.id)===String(emp.id))return;
      F.forEach(([k,l])=>{const a=ecNorm(emp[k]);if(prev&&a===ecNorm(prev[k]))return;if(a.length>=6&&a===ecNorm(e[k]))ecPush(warns,'dupEmployee',l+' '+emp[k]+' is already on '+e.name+' ('+e.id+(String(s.id)!==String(sid)?', '+ecShort(s):'')+(e.status&&e.status!=='Active'?', '+e.status:'')+')');});});}
  if(ecOn('sharedBankAccount',sid)&&!(prev&&ecNorm(prev.accountNo)===ecNorm(emp.accountNo))){const h=ecAccountHolders(sid,emp.accountNo,{emp:emp.id,empList:list});if(h.length)ecPush(warns,'sharedBankAccount','Bank account '+emp.accountNo+' is also the account of '+h.join(', '));}
  if(ecOn('wageSenseCheck',sid)){const g=Number(emp.gross)||0,b=Number(emp.basic)||0,min=ecLim('wageSenseCheck',10000,sid);const doj=ecIso(emp.doj),dol=ecIso(emp.dol);
    if(g>0&&b<g*0.5)ecPush(warns,'wageSenseCheck','Basic '+ecM(b)+' is below half of gross '+ecM(g)+' — under the Labour Codes wages should be at least 50% of pay');
    if(g>0&&g<min)ecPush(warns,'wageSenseCheck','Gross '+ecM(g)+' is below '+ecM(min)+' (the minimum set in Controls)');
    if(emp.pf&&!(b>0))ecPush(warns,'wageSenseCheck','PF is ticked but Basic is 0');
    if(doj&&dol&&dol<doj)ecPush(warns,'wageSenseCheck','Date of leaving is before the date of joining');
    if(doj&&ecDays(today,doj)>30)ecPush(warns,'wageSenseCheck','Date of joining '+ecDmy(doj)+' is more than a month ahead');}
  if(!ecConfirm(sid,'the employee details',warns,[]))return false;
  if(prev&&ecOn('salaryChangeReason',sid)){const pg=Number(prev.gross)||0,ng=Number(emp.gross)||0,lim=ecLim('salaryChangeReason',20,sid);
    if(pg>0&&Math.abs(ng-pg)/pg*100>lim){const pct=Math.round((ng-pg)/pg*1000)/10;
      let r=null;try{r=window.prompt('Gross pay of '+emp.name+' changes from '+ecM(pg)+' to '+ecM(ng)+' ('+(pct>0?'+':'')+pct+'%) — more than '+lim+'%.\n\nGive the reason (it goes to the Audit Log):','');}catch(e){}
      if(r==null||!String(r).trim()){if(typeof controlHit==='function')controlHit('salaryChangeReason',sid,'b');window.alert('Not saved — a pay change above '+lim+'% needs a reason (Master Settings → Controls → Salary master changes).');return false;}
      try{logAuditEvent(sid,{entity:'Employee',entityId:String(emp.id),action:'Pay change reason',summary:emp.name+': '+ecM(pg)+' → '+ecM(ng)+' — '+String(r).trim()});}catch(e){}}}
  return ecOnce(sid,'emp',[emp.id,emp.name,emp.gross,emp.pan,emp.accountNo]);
}
// 2, 3 · vendor save (vendor form, quick-add from a bill)
function ecVendorOk(sid,v,editId,vendors){
  const warns=[];const list=(vendors||loadVendors(sid)||[]).filter(x=>x&&String(x.id)!==String(editId||''));
  if(ecOn('dupVendor',sid)){const g=ecNorm(v.gst);
    if(g.length>=12){const same=list.find(x=>ecNorm(x.gst)===g);
      if(same)ecPush(warns,'dupVendor','GSTIN '+g+' is already on vendor '+same.name+' ('+same.id+')');
      else{const pan=g.slice(2,12);const sp=list.find(x=>ecNorm(x.gst).length>=12&&ecNorm(x.gst).slice(2,12)===pan);if(sp)ecPush(warns,'dupVendor','Same PAN '+pan+' as vendor '+sp.name+' ('+sp.id+') — the same business in another state?');}}
    const nk=ecNameKey(v.name);if(nk.length>=4){const sim=list.find(x=>{const k=ecNameKey(x.name);return k===nk||(k.length>=6&&nk.length>=6&&ecLev(k,nk)<=2);});if(sim)ecPush(warns,'dupVendor','The name looks like existing vendor "'+sim.name+'" ('+sim.id+')');}}
  if(ecOn('sharedBankAccount',sid)&&v.accountNo){const h=ecAccountHolders(sid,v.accountNo,{vendor:editId});if(h.length)ecPush(warns,'sharedBankAccount','Bank account '+v.accountNo+' is also the account of '+h.join(', '));}
  return ecConfirm(sid,'the vendor details',warns,[])&&ecOnce(sid,'vendor',[v.name,v.gst,v.accountNo]);
}

// ── Daily Sales & Exp ──
function ecDseData(sid){return ecLoad('salonos_daily_sales_data',sid,{})||{};}
function ecDseDesc(sid){return ecLoad('salonos_daily_sales_descdata',sid,{})||{};}
function ecDseSales(sid){return ecLoad('salonos_daily_sales_collection_data',sid,{})||{};}
// An expense of about this amount entered in Daily Sales & Exp within ±days (not salary / advance / deposit rows).
function ecDseExpenseNear(sid,amt,iso,days){
  const D=ecDseData(sid),DS=ecDseDesc(sid);const R=ecExpenseRows();
  for(let k=-days;k<=days;k++){const d=ecAddDays(iso,k);const day=D[d]||{};const dd=DS[d]||{};
    for(const ri of Object.keys(day)){const name=(R[ri]||{}).name;if(!name||EC_SKIP_ROWS.test(name)||ecGatedRow(name))continue;
      const ents=Array.isArray(dd[ri])?dd[ri]:null;
      if(ents){const e=ents.find(x=>Math.abs((Number(x.amount)||0)-amt)<=1);if(e)return{iso:d,row:name+(e.description?' — '+e.description:'')};}
      else if(Math.abs((Number(day[ri])||0)-amt)<=1)return{iso:d,row:name};}}
  return null;
}
// A vendor bill of about this amount within ±days that wasn't paid in cash that day (a cash payment writes the expense itself).
function ecBillNear(sid,amt,iso,days){
  return(loadVendorInvoices(sid)||[]).find(b=>{if(Math.abs((Number(b.amount)||0)-amt)>1)return false;const bi=ecIso(b.invoiceDate);if(!bi||Math.abs(ecDays(bi,iso))>days)return false;
    return!(b.payments||[]).some(p=>String(p.mode||'')==='Cash'&&Math.abs(ecDays(ecIso(p.paidDate)||bi,iso))<=1);})||null;
}
function ecRowAverage(src,ri,iso,days){const vals=[];for(let k=1;k<=days;k++){const v=Number((src[ecAddDays(iso,-k)]||{})[ri])||0;if(v>0)vals.push(v);}return vals.length>=5?vals.reduce((s,v)=>s+v,0)/vals.length:0;}
// 5, 6, 11, 21 · an expense cell is left (after the petty-cash check)
function ecExpenseCommit(sid,iso,rowName,before,after,revert){
  const a=Number(after)||0;if(!(a>0)||String(before)===String(after))return;
  const R=ecExpenseRows();const ri=R.findIndex(r=>r&&r.name===rowName);if(ri<0)return;const D=ecDseData(sid);const warns=[];
  if(ecOn('repeatExpense',sid)&&a>=1000){const N=ecLim('repeatExpense',3,sid);for(let k=-N;k<=N;k++){if(!k)continue;const d=ecAddDays(iso,k);if(Number((D[d]||{})[ri])===a){ecPush(warns,'repeatExpense','The same '+ecM(a)+' is entered under "'+rowName+'" on '+ecDmy(d));break;}}}
  if(ecOn('extraZeroCheck',sid)){const avg=ecRowAverage(D,ri,iso,30),x=ecLim('extraZeroCheck',5,sid);if(avg>0&&a>avg*x)ecPush(warns,'extraZeroCheck',ecM(a)+' is '+(a/avg).toFixed(1)+'× the usual "'+rowName+'" of '+ecM(avg)+' — an extra zero?');}
  if(ecOn('crossEntryExpense',sid)&&!EC_SKIP_ROWS.test(rowName)&&!ecGatedRow(rowName)){const b=ecBillNear(sid,a,iso,3);
    if(b){const v=(loadVendors(sid)||[]).find(x=>String(x.id)===String(b.vendorId));ecPush(warns,'crossEntryExpense','A vendor bill of '+ecM(b.amount)+' from '+(v?v.name:'a vendor')+' (No. '+b.invoiceNo+', '+ecDmy(ecIso(b.invoiceDate))+') is already in Vendors — the same expense counted twice?');}}
  if(warns.length&&!ecConfirm(sid,rowName+' on '+ecDmy(iso),warns,[])){if(revert)revert(before);return;}
  if(ecOn('proofAboveLimit',sid)){const lim=ecLim('proofAboveLimit',5000,sid);if(a>=lim){const k=outletKey('salonos_dse_expense_notes',sid);const N=ecLoad('salonos_dse_expense_notes',sid,{})||{};const key=iso+'|'+rowName;
    if(!N[key]||Number(N[key].amount)!==a){let r=null;try{r=window.prompt(rowName+' '+ecM(a)+' on '+ecDmy(iso)+' — expenses of '+ecM(lim)+' or more need a narration.\n\nWhat was it for?',N[key]?N[key].note:'');}catch(e){}
      if(r==null||!String(r).trim()){if(typeof controlHit==='function')controlHit('proofAboveLimit',sid,'b');window.alert('Entry undone — an expense of '+ecM(lim)+' or more needs a narration (Controls → Proof above a limit).');if(revert)revert(before);return;}
      N[key]={amount:a,note:String(r).trim(),by:ecUser(),at:new Date().toISOString()};safeLocalSet(k,JSON.stringify(N));
      try{logAuditEvent(sid,{entity:'Daily Sales',entityId:iso,action:'Expense narration',summary:rowName+' '+ecM(a)+': '+String(r).trim()});}catch(e){}}}}
}
// 5, 11 · the description pop-up (Pentry, Repair & Maintenance …) is saved
function ecDescEntriesOk(sid,iso,rowName,entries){
  const R=ecExpenseRows();const ri=R.findIndex(r=>r&&r.name===rowName);if(ri<0)return true;const DS=ecDseDesc(sid);const warns=[];const key=e=>String(e.description||'').trim().toLowerCase().replace(/\s+/g,' ');
  if(ecOn('repeatExpense',sid)){const N=ecLim('repeatExpense',3,sid);const seen={};
    entries.forEach(e=>{const k=key(e)+'|'+Number(e.amount);if(seen[k])ecPush(warns,'repeatExpense','"'+e.description+'" '+ecM(e.amount)+' is entered twice on this day');seen[k]=1;
      for(let d=-N;d<=N;d++){if(!d)continue;const day=ecAddDays(iso,d);const L=(DS[day]||{})[ri];if(Array.isArray(L)&&L.some(x=>key(x)===key(e)&&Number(x.amount)===Number(e.amount))){ecPush(warns,'repeatExpense','"'+e.description+'" '+ecM(e.amount)+' is also entered on '+ecDmy(day));break;}}});}
  if(ecOn('extraZeroCheck',sid)){const vals=[];for(let k=1;k<=60;k++){const L=(DS[ecAddDays(iso,-k)]||{})[ri];if(Array.isArray(L))L.forEach(x=>{const v=Number(x.amount)||0;if(v>0)vals.push(v);});}
    if(vals.length>=5){const avg=vals.reduce((s,v)=>s+v,0)/vals.length,x=ecLim('extraZeroCheck',5,sid);entries.forEach(e=>{const a=Number(e.amount)||0;if(a>avg*x)ecPush(warns,'extraZeroCheck','"'+e.description+'" '+ecM(a)+' is '+(a/avg).toFixed(1)+'× the usual '+rowName+' entry of '+ecM(avg)+' — an extra zero?');});}}
  return ecConfirm(sid,rowName+' on '+ecDmy(iso),warns,[]);
}
// 11 · a sales cell is left
const EC_SALES_INPUT=new Set([0,1,2,3,4,5,9,10,11,12,14,15,16,19,20]);
function ecSalesCommit(sid,iso,rowName,sri,before,after,revert){
  const a=Number(after)||0;if(!(a>0)||String(before)===String(after)||!EC_SALES_INPUT.has(sri)||!ecOn('extraZeroCheck',sid))return;
  const avg=ecRowAverage(ecDseSales(sid),sri,iso,30),x=ecLim('extraZeroCheck',5,sid);
  if(avg>0&&a>avg*x&&!ecConfirm(sid,rowName+' on '+ecDmy(iso),ecTag('extraZeroCheck',[ecM(a)+' is '+(a/avg).toFixed(1)+'× the usual '+rowName+' of '+ecM(avg)+' — an extra zero?']),[])){if(revert)revert(before);}
}
// 12, 13, 14 · Daily Sales against Billing and against the bank statement, for the days on screen
function ecDseFindings(sid,isos,salesData){
  const out=[];const today=ecToday();const S=salesData||ecDseSales(sid);const lim=k=>ecLim(k,100);
  const useBills=typeof fdBills==='function'&&typeof fdDaySummary==='function'&&(ecOn('modeVsBilling',sid)||ecOn('dseVsBilling',sid));
  const billDays=useBills?new Set(fdBills(sid).filter(b=>b&&b.status!=='Cancelled').map(b=>b.date)):new Set();
  isos.filter(d=>d<=today).forEach(d=>{if(!billDays.has(d))return;const ds=fdDaySummary(sid,d);const v=S[d]||{};const n=i=>Number(v[i])||0;const md=ds.modes||{};
    if(ecOn('modeVsBilling',sid))[['Cash',0],['Card',1],['UPI',2]].forEach(([m,i])=>{const b=Math.round(md[m]||0);if(Math.abs(n(i)-b)>lim('modeVsBilling'))out.push({iso:d,kind:'mode',t:ecDmy(d)+': '+m+' '+ecM(n(i))+' in Daily Sales, '+ecM(b)+' billed'});});
    if(ecOn('dseVsBilling',sid)){const dse=n(0)+n(1)+n(2)+n(3)+n(4);const b=Math.round((ds.total||0)-(md.Package||0)-(md.Voucher||0));if(Math.abs(dse-b)>lim('dseVsBilling'))out.push({iso:d,kind:'total',t:ecDmy(d)+': Daily Sales total '+ecM(dse)+', Billing '+ecM(b)+' (difference '+ecM(dse-b)+')'});}});
  if(ecOn('depositVsBank',sid)&&typeof loadBankStatementRows==='function'){
    const rows=(loadBankStatementRows(sid)||[]).map(r=>({iso:ecIso(r.transactionDate),cr:Number(r.credit)||0,nat:String(r.nature||''),desc:String(r.description||'')})).filter(r=>r.iso);
    const last=rows.reduce((m,r)=>r.iso>m?r.iso:m,'');const dep=rows.filter(r=>r.cr>0&&(r.nat==='Cash Deposit'||/cash ?dep|by cash|cdm/i.test(r.desc)));const used=new Set();
    isos.forEach(d=>{const a=Number((S[d]||{})[11])||0;if(!(a>0)||!last||ecAddDays(d,4)>last)return;
      const i=dep.findIndex((r,j)=>!used.has(j)&&Math.abs(r.cr-a)<=1&&r.iso>=d&&ecDays(d,r.iso)<=4);
      if(i>=0)used.add(i);else out.push({iso:d,kind:'deposit',t:ecDmy(d)+': Bank Deposit '+ecM(a)+' in Daily Sales — no matching cash deposit in the bank statement within 4 days'});});
    const lo=isos[0],hi=isos[isos.length-1];dep.forEach((r,j)=>{if(used.has(j)||!lo||r.iso<lo||r.iso>hi)return;const near=isos.some(d=>Math.abs((Number((S[d]||{})[11])||0)-r.cr)<=1&&r.iso>=d&&ecDays(d,r.iso)<=4);
      if(!near)out.push({iso:r.iso,kind:'deposit',t:ecDmy(r.iso)+': cash deposit of '+ecM(r.cr)+' in the bank — not entered as Bank Deposit in Daily Sales'});});}
  return out.sort((a,b)=>a.iso.localeCompare(b.iso));
}
function EcDseChecks({sid,days,salesData}){
  const [open,setOpen]=React.useState(false);if(!sid||!days||!days.length)return null;
  if(!['modeVsBilling','dseVsBilling','depositVsBank'].some(k=>ecOn(k,sid)))return null;
  let F=[];try{F=ecDseFindings(sid,days.map(d=>d.iso||d),salesData);}catch(e){return null;}if(!F.length)return null;const h=React.createElement;const show=open?F:F.slice(0,3);
  return h('div',{style:{background:'rgba(240,160,40,0.09)',border:'1px solid rgba(240,160,40,0.4)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,fontSize:12.5,color:'var(--text2)'}},
    h('b',null,'⚠ '+F.length+' figure'+(F.length===1?'':'s')+' to check against Billing / the bank'),
    h('ul',{style:{margin:'4px 0 0 18px',padding:0}},show.map((f,i)=>h('li',{key:i},f.t))),
    F.length>3&&h('button',{className:'btn btn-ghost btn-sm',style:{marginTop:4},onClick:()=>setOpen(!open)},open?'Show less':'Show all '+F.length));
}

// ── vendor bills and payments ──
// 4, 6, 11, 15, 16, 21 · f: {invoiceNo, invoiceDate, dueDate, bookingDate, taxable, cgst, sgst, igst, amount, attachment, docNature}
function ecVendorBillOk(sid,f,vendorId,editId,invoices,opt){
  opt=opt||{};const warns=[],blocks=[];const L=(invoices||loadVendorInvoices(sid)||[]).filter(i=>i&&i.id!==editId);
  const amt=Number(f.amount)||0;const inv=ecIso(f.invoiceDate);const today=ecToday();const nn=typeof normInvoiceNo==='function'?normInvoiceNo:(x=>ecNorm(x));
  if(vendorId&&amt>0&&inv&&ecOn('sameBillNewNumber',sid)){const N=ecLim('sameBillNewNumber',3,sid);
    const hit=L.find(i=>String(i.vendorId)===String(vendorId)&&Math.abs((Number(i.amount)||0)-amt)<=1&&nn(i.invoiceNo)!==nn(f.invoiceNo)&&ecIso(i.invoiceDate)&&Math.abs(ecDays(ecIso(i.invoiceDate),inv))<=N);
    if(hit)ecPush(warns,'sameBillNewNumber','A bill of '+ecM(amt)+' from this vendor is already entered as No. '+hit.invoiceNo+' dated '+ecDmy(ecIso(hit.invoiceDate))+' — the same bill under a new number?');}
  if(!editId&&!opt.cashNow&&amt>0&&inv&&ecOn('crossEntryExpense',sid)){const x=ecDseExpenseNear(sid,amt,inv,3);if(x)ecPush(warns,'crossEntryExpense',ecM(amt)+' is already entered as "'+x.row+'" in Daily Sales & Exp on '+ecDmy(x.iso)+' — the same expense counted twice?');}
  if(vendorId&&amt>0&&ecOn('extraZeroCheck',sid)){const P=L.filter(i=>String(i.vendorId)===String(vendorId)&&Number(i.amount)>0).slice(-12);
    if(P.length>=3){const avg=P.reduce((s,i)=>s+Number(i.amount),0)/P.length,x=ecLim('extraZeroCheck',5,sid);if(amt>avg*x)ecPush(warns,'extraZeroCheck',ecM(amt)+' is '+(amt/avg).toFixed(1)+'× this vendor’s usual bill of '+ecM(avg)+' — an extra zero?');}}
  if(!opt.noGst&&ecOn('gstMathCheck',sid)){const tx=Number(f.taxable)||0,c=Number(f.cgst)||0,s=Number(f.sgst)||0,ig=Number(f.igst)||0,tax=c+s+ig;
    if(tx>0&&tax>0){if((c||s)&&Math.abs(c-s)>1)ecPush(warns,'gstMathCheck','CGST '+ecM(c)+' and SGST '+ecM(s)+' should be equal');
      const RATES=[0.1,0.25,1,1.5,3,5,6,12,18,28,40];const ok=RATES.some(r=>Math.abs(tax-tx*r/100)<=Math.max(1.5,tx*0.0005));
      if(!ok)ecPush(warns,'gstMathCheck','GST '+ecM(tax)+' is '+(tax/tx*100).toFixed(2)+'% of the taxable value '+ecM(tx)+' — not a GST rate (5%, 12%, 18%, 28% …). Check the figures (or it is a bill with mixed rates).');}}
  if(ecOn('dateSenseCheck',sid)){if(inv&&inv>today)ecPush(warns,'dateSenseCheck','The invoice date '+ecDmy(inv)+' is in the future');const due=ecIso(f.dueDate),bk=ecIso(f.bookingDate);
    if(due&&inv&&due<inv)ecPush(warns,'dateSenseCheck','The due date '+ecDmy(due)+' is before the invoice date');if(bk&&inv&&bk<inv)ecPush(warns,'dateSenseCheck','The booking date '+ecDmy(bk)+' is before the invoice date');
    if(inv&&ecDays(inv,today)>180)ecPush(warns,'dateSenseCheck','The invoice date '+ecDmy(inv)+' is more than 6 months old');}
  if(!opt.noProof&&ecOn('proofAboveLimit',sid)){const lim=ecLim('proofAboveLimit',5000,sid);if(amt>=lim&&!f.attachment)ecPush(blocks,'proofAboveLimit','Bills of '+ecM(lim)+' or more need the bill copy attached (📎) — Master Settings → Controls → Proof above a limit');}
  return ecConfirm(sid,'this bill',warns,blocks)&&ecOnce(sid,'bill',[vendorId,f.invoiceNo,amt,inv]);
}
// 16 · a payment against a bill
function ecPaymentOk(sid,inv,pay){
  if(!ecOn('dateSenseCheck',sid))return true;const warns=[];const pd=ecIso(pay.paidDate),bd=ecIso(inv.invoiceDate);
  if(pd&&bd&&pd<bd)ecPush(warns,'dateSenseCheck','The payment date '+ecDmy(pd)+' is before the bill date '+ecDmy(bd));if(pd&&pd>ecToday())ecPush(warns,'dateSenseCheck','The payment date '+ecDmy(pd)+' is in the future');
  return ecConfirm(sid,'this payment',warns,[]);
}

// ── 7 · advances and penalties ──
function ecAdvanceOk(sid,form,editId,list){
  const warns=[];const amt=Number(form.amount)||0;const d=ecIso(form.date);
  if(ecOn('dupAdvancePenalty',sid)&&d){const hit=(list||[]).find(a=>a&&a.id!==editId&&a.emp===form.emp&&Number(a.amount)===amt&&ecIso(a.date)&&Math.abs(ecDays(ecIso(a.date),d))<=3);
    if(hit)ecPush(warns,'dupAdvancePenalty','An advance of '+ecM(amt)+' to '+form.emp+' dated '+ecDmy(ecIso(hit.date))+' is already entered'+(hit.source==='dse'?' (from Daily Sales & Exp)':'')+(hit.bankRef?' — bank ref '+hit.bankRef:''));
    if(form.bankRef){const r=(list||[]).find(a=>a&&a.id!==editId&&a.bankRef&&ecNorm(a.bankRef)===ecNorm(form.bankRef));if(r)ecPush(warns,'dupAdvancePenalty','Bank reference '+form.bankRef+' is already used on the advance to '+r.emp+' ('+ecM(r.amount)+')');}}
  return ecConfirm(sid,'this advance',warns,[])&&ecOnce(sid,'adv',[form.emp,amt,d]);
}
function ecPenaltyOk(sid,form,editId,list){
  const warns=[];const amt=Number(form.amount)||0;const d=ecIso(form.date);const ty=form.type==='Other'?form.otherType:form.type;
  if(ecOn('dupAdvancePenalty',sid)&&d){const hit=(list||[]).find(p=>p&&p.id!==editId&&p.emp===form.emp&&ecIso(p.date)===d&&((p.type==='Other'?p.otherType:p.type)===ty||Number(p.amount)===amt));
    if(hit)ecPush(warns,'dupAdvancePenalty','A penalty for '+form.emp+' on '+ecDmy(d)+' is already entered ('+(hit.type==='Other'?hit.otherType:hit.type)+', '+ecM(hit.amount)+')');}
  return ecConfirm(sid,'this penalty',warns,[])&&ecOnce(sid,'pen',[form.emp,amt,d,ty]);
}

// ── 8 · a file imported again (bank statement, collection, staff report, attendance, bills …) ──
function ecImportOk(sid,kind,file){
  if(!file||!ecOn('importSeen',sid))return true;
  const k=outletKey('salonos_import_log',sid);const L=ecLoad('salonos_import_log',sid,{})||{};
  const f1=kind+'|'+file.size+'|'+(file.lastModified||0),f2=kind+'|'+file.name+'|'+file.size;const seen=L[f1]||L[f2];
  if(seen&&!window.confirm('This '+kind+' file looks like one already imported — "'+seen.name+'", '+new Date(seen.at).toLocaleString('en-IN')+(seen.by?' by '+seen.by:'')+'.\n\nImport it again anyway?'))return false;
  const rec={name:file.name,at:new Date().toISOString(),by:ecUser()};L[f1]=rec;L[f2]=rec;
  const keys=Object.keys(L);if(keys.length>600)keys.sort((a,b)=>String(L[a].at).localeCompare(String(L[b].at))).slice(0,keys.length-600).forEach(x=>delete L[x]);
  safeLocalSet(k,JSON.stringify(L));return true;
}

// ── 9, 20 · stock ──
function ecStockReceiveOk(sid,rec,n){
  if(!ecOn('stockTwice',sid))return true;const warns=[];const since=Date.now()-2*864e5;
  const r=(typeof loadInvLog==='function'?loadInvLog(sid):[]).filter(x=>x&&x.type==='receive'&&x.itemId===rec.id&&Math.abs((Number(x.qty)||0)-n)<1e-9&&new Date(x.at).getTime()>=since).pop();
  if(r)ecPush(warns,'stockTwice',n+' '+(rec.unit||'')+' of '+rec.name+' was already received '+ecAgo(r.at));
  if(rec.poId&&typeof loadPOs==='function'){const po=loadPOs(sid).find(p=>p.id===rec.poId);const l=po&&(po.lines||[]).find(x=>x.itemId===rec.id||String(x.name).toLowerCase()===String(rec.name).toLowerCase());
    if(l&&(Number(l.received)||0)>=Number(l.qty))ecPush(warns,'stockTwice','Purchase order '+po.no+' already has all '+l.qty+' received');}
  return ecConfirm(sid,'this stock receipt',warns,[]);
}
function ecPoReceiveOk(sid,po,qq){
  if(!ecOn('stockTwice',sid))return true;const norm=o=>JSON.stringify(Object.keys(o||{}).filter(k=>Number(o[k])>0).sort().map(k=>[k,Number(o[k])]));const key=norm(qq);
  const r=(po.receipts||[]).filter(x=>Date.now()-new Date(x.at).getTime()<864e5&&norm(x.qtys)===key).pop();
  return ecConfirm(sid,'this receipt',ecTag('stockTwice',r?['The same quantities were received against '+po.no+' '+ecAgo(r.at)+(r.by?' by '+r.by:'')]:[]),[]);
}
function ecNegStockBlocked(sid){return ecOn('negativeStockBlock',sid);}
function ecBillStockOk(sid,rec,editId){
  if(editId||!ecOn('negativeStockBlock',sid)||!ecOn('billReducesStock',sid)||typeof fdStock!=='function')return true;
  const S=fdStock(sid);const need={};
  (rec.items||[]).filter(it=>it.type==='Product').forEach(it=>{const m=(typeof fdMenuItem==='function'?fdMenuItem(sid,it.name):null)||{};const s=S.find(z=>(m.stockItemId&&z.id===m.stockItemId)||String(z.name).toLowerCase()===String(it.name).toLowerCase());
    if(s)need[s.id]=(need[s.id]||0)+(Number(it.qty)||1);});
  const short=Object.keys(need).map(id=>S.find(z=>z.id===id)).filter(s=>need[s.id]>(Number(s.qty)||0)).map(s=>s.name+': '+need[s.id]+' on the bill, '+(Number(s.qty)||0)+' in stock');
  return ecConfirm(sid,'this bill',[],ecTag('negativeStockBlock',short.length?['Not enough stock — '+short.join('; ')+'. Receive the stock (or correct it with a count) first.']:[]));
}

// ── 18 · attendance ──
const EC_WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function ecAttendanceIssues(sid,y,m){
  if(sid==null||!ecOn('attendanceSense',sid))return[];
  const att=loadAttendance(sid);const E=getEmployeesForMonth(y,m,sid);const today=ecToday();const pre=y+'-'+String(m+1).padStart(2,'0');const out=[];
  let ci=null;if(ecOn('phoneCheckin',sid)&&typeof loadCheckins==='function'){const L=loadCheckins(sid).filter(x=>x&&x.kind==='in'&&String(x.date).startsWith(pre));if(L.length)ci=new Set(L.map(x=>x.empId+'|'+Number(String(x.date).slice(8,10))));}
  const list=a=>a.length>6?a.slice(0,6).join(', ')+' …':a.join(', ');
  E.forEach(e=>{const r=att[attMonthKey(e.id,y,m)];const days=(r&&r.days)||[];const doj=ecIso(e.doj),dol=ecIso(e.dol);const b={pre:[],post:[],wo:[],ci:[],fut:[]};
    days.forEach((d,i)=>{if(!d)return;const iso=pre+'-'+String(i+1).padStart(2,'0');const worked=d==='present'||d==='half';if(!worked)return;
      if(doj&&iso<doj)b.pre.push(i+1);if(dol&&iso>dol)b.post.push(i+1);if(iso>today)b.fut.push(i+1);
      if(e.weeklyOff&&EC_WEEKDAYS[new Date(iso+'T00:00:00').getDay()]===e.weeklyOff)b.wo.push(i+1);
      if(ci&&d==='present'&&iso<=today&&!ci.has(e.id+'|'+(i+1)))b.ci.push(i+1);});
    if(b.pre.length)out.push(e.name+': present before joining ('+ecDmy(doj)+') on day '+list(b.pre));
    if(b.post.length)out.push(e.name+': present after leaving ('+ecDmy(dol)+') on day '+list(b.post));
    if(b.fut.length)out.push(e.name+': marked present for future day '+list(b.fut));
    if(b.wo.length)out.push(e.name+': worked on the weekly off ('+e.weeklyOff+') on day '+list(b.wo)+' — paid as extra days');
    if(b.ci.length)out.push(e.name+': present with no phone check-in on day '+list(b.ci));});
  return out;
}
function EcAttendanceBanner({sid,y,m,tick}){
  const [open,setOpen]=React.useState(false);let L=[];try{L=ecAttendanceIssues(sid,y,m);}catch(e){}if(!L.length)return null;const h=React.createElement;const show=open?L:L.slice(0,3);
  return h('div',{style:{background:'rgba(240,160,40,0.09)',border:'1px solid rgba(240,160,40,0.4)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,fontSize:12.5,color:'var(--text2)'}},
    h('b',null,'⚠ '+L.length+' attendance entr'+(L.length===1?'y':'ies')+' to check'),h('ul',{style:{margin:'4px 0 0 18px',padding:0}},show.map((t,i)=>h('li',{key:i},t))),
    L.length>3&&h('button',{className:'btn btn-ghost btn-sm',style:{marginTop:4},onClick:()=>setOpen(!open)},open?'Show less':'Show all '+L.length));
}

// ── 22 · data-quality score per outlet (last 7 days) ──
function ecDuplicateScan(sid){
  const out=[];const since=ecAddDays(ecToday(),-60);
  const B=(loadVendorInvoices(sid)||[]).filter(b=>ecIso(b.invoiceDate)>=since);const V={};(loadVendors(sid)||[]).forEach(v=>V[v.id]=v);const nn=typeof normInvoiceNo==='function'?normInvoiceNo:ecNorm;
  B.forEach((b,i)=>{for(let j=i+1;j<B.length;j++){const c=B[j];if(String(c.vendorId)===String(b.vendorId)&&Math.abs((Number(c.amount)||0)-(Number(b.amount)||0))<=1&&nn(c.invoiceNo)!==nn(b.invoiceNo)&&Math.abs(ecDays(ecIso(b.invoiceDate),ecIso(c.invoiceDate)))<=3){out.push('Bills '+b.invoiceNo+' and '+c.invoiceNo+' of '+((V[b.vendorId]||{}).name||'a vendor')+', both '+ecM(b.amount));break;}}});
  const A=ecLoad('salonos_advances',sid,[])||[];A.forEach((a,i)=>{const d=ecIso(a.date);if(!d||d<since)return;if(A.slice(i+1).some(x=>x.emp===a.emp&&Number(x.amount)===Number(a.amount)&&ecIso(x.date)&&Math.abs(ecDays(ecIso(x.date),d))<=3))out.push('Two advances of '+ecM(a.amount)+' to '+a.emp+' around '+ecDmy(d));});
  const P=ecLoad('salonos_penalties',sid,[])||[];P.forEach((p,i)=>{const d=ecIso(p.date);if(!d||d<since)return;if(P.slice(i+1).some(x=>x.emp===p.emp&&ecIso(x.date)===d&&(x.type===p.type||Number(x.amount)===Number(p.amount))))out.push('Two penalties for '+p.emp+' on '+ecDmy(d));});
  const E=loadEmployees(sid)||[];[['pan','PAN'],['aadhar','Aadhaar'],['pfNumber','UAN'],['accountNo','bank account']].forEach(([k,l])=>{const seen={};E.forEach(e=>{const a=ecNorm(e[k]);if(a.length<6)return;if(seen[a])out.push(e.name+' and '+seen[a]+' share the same '+l);else seen[a]=e.name;});});
  const VL=loadVendors(sid)||[];const g={};VL.forEach(v=>{const a=ecNorm(v.gst);if(a.length<12)return;if(g[a])out.push('Vendors '+g[a]+' and '+v.name+' share GSTIN '+a);else g[a]=v.name;});
  return out;
}
function ecQuality(sid){
  const since=new Date(Date.now()-7*864e5).toISOString();const A=(typeof loadAuditLog==='function'?loadAuditLog(sid):[]).filter(x=>x&&String(x.ts)>=since);
  const dups=ecDuplicateScan(sid);const corr=A.filter(x=>/Edited|Deleted|Undo|Restored|cancel/i.test(String(x.action||''))).length;const late=A.filter(x=>x.action==='Late edit').length;
  const over=A.filter(x=>x.action==='Saved despite warning').length;const lim=ecLim('proofAboveLimit',5000,sid);const from=ecAddDays(ecToday(),-30);
  const proof=(loadVendorInvoices(sid)||[]).filter(b=>ecIso(b.invoiceDate)>=from&&(Number(b.amount)||0)>=lim&&!b.attachment).length;
  const wk=ecAddDays(ecToday(),-7);let missing=0;if(typeof dseDaysMissingFor==='function'){const t=new Date(),p=new Date(Date.now()-7*864e5);const L=[...(dseDaysMissingFor(sid,t.getFullYear(),t.getMonth())||[])];if(p.getMonth()!==t.getMonth())L.push(...(dseDaysMissingFor(sid,p.getFullYear(),p.getMonth())||[]));missing=new Set(L.filter(d=>String(d)>=wk)).size;}
  const score=Math.max(0,Math.min(100,Math.round(100-dups.length*5-corr*1-late*2-over*3-proof*2-missing*3)));
  return{score,dups,corr,late,over,proof,missing,lim};
}
function ecQualityText(rows){
  return '🧹 Data quality — last 7 days\n'+rows.map(r=>'\n'+ecShort(r.s)+': '+r.q.score+'/100'+[r.q.dups.length?r.q.dups.length+' possible duplicate(s)':'',r.q.corr?r.q.corr+' correction(s)':'',r.q.late?r.q.late+' late edit(s)':'',r.q.over?r.q.over+' warning(s) overridden':'',r.q.proof?r.q.proof+' bill(s) without proof':'',r.q.missing?r.q.missing+' day(s) without Daily Sales':''].filter(Boolean).map(x=>'\n • '+x).join('')
    +(r.q.dups.length?'\n   e.g. '+r.q.dups.slice(0,2).join('; '):'')).join('\n');
}
function DataQualityBoard({accessibleSalons}){
  const h=React.createElement;const [openId,setOpenId]=React.useState(null);
  const outs=(accessibleSalons||[]).filter(s=>s&&s.id!=null&&s.status!=='Inactive'&&ecOn('dataQualityBoard',s.id));
  if(!outs.length)return h('div',{className:'card',style:{fontSize:13,color:'var(--text3)'}},'The data-quality score is switched off (Master Settings → Controls → Data-quality score).');
  const rows=outs.map(s=>({s,q:ecQuality(s.id)})).sort((a,b)=>a.q.score-b.q.score);const col=n=>n>=85?'var(--green)':n>=65?'var(--orange,#e69a1f)':'var(--red)';
  const share=()=>{let ph=typeof waNumber==='function'?waNumber((outletSettings(outs[0].id)||{}).ownerPhone||''):'';
    if(!ph){const typed=window.prompt('Owner’s WhatsApp number:','');ph=typeof waNumber==='function'?waNumber(typed):String(typed||'').replace(/\D/g,'');if(!ph)return;}
    window.open('https://wa.me/'+ph+'?text='+encodeURIComponent(ecQualityText(rows)),'_blank','noopener');};
  return h('div',null,
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,flexWrap:'wrap',marginBottom:10}},
      h('div',null,h('div',{className:'page-title'},'🧹 Data quality'),h('div',{className:'page-sub'},'Last 7 days per outlet — possible duplicates, corrections, late edits, warnings overridden, bills without proof and days without Daily Sales')),
      h('button',{className:'btn btn-primary btn-sm',onClick:share},'📲 WhatsApp summary to owner')),
    h('div',{className:'card',style:{padding:0,overflowX:'auto'}},h('table',null,
      h('thead',null,h('tr',null,['Outlet','Score','Possible duplicates','Corrections','Late edits','Warnings overridden','Bills without proof','Days without sales',''].map((t,i)=>h('th',{key:i,style:i>0&&i<8?{textAlign:'right'}:null},t)))),
      h('tbody',null,rows.flatMap(r=>[h('tr',{key:r.s.id},h('td',null,ecShort(r.s)),h('td',{style:{textAlign:'right',fontWeight:700,color:col(r.q.score)}},r.q.score),
        ...[r.q.dups.length,r.q.corr,r.q.late,r.q.over,r.q.proof,r.q.missing].map((n,i)=>h('td',{key:i,style:{textAlign:'right',color:n?'var(--text)':'var(--text3)'}},n||'—')),
        h('td',null,r.q.dups.length>0&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setOpenId(openId===r.s.id?null:r.s.id)},openId===r.s.id?'Hide':'Duplicates'))),
        openId===r.s.id&&h('tr',{key:r.s.id+'-d'},h('td',{colSpan:9,style:{fontSize:12.5,color:'var(--text2)'}},h('ul',{style:{margin:'4px 0 4px 18px',padding:0}},r.q.dups.slice(0,30).map((t,i)=>h('li',{key:i},t)))))])))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'Score = 100 less 5 per possible duplicate, 3 per warning overridden or day without Daily Sales, 2 per late edit or bill of '+ecM(rows[0].q.lim)+'+ without proof, 1 per correction.'));
}
