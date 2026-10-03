// ── Owner / compliance automation (batch 3) ────────────────────────────────────────────────────
// 13 Challan reminder to the accountant (Statutory Files → Send to accountant)
// 14 Licence & renewal tracker for every outlet (Master Sheet → Licences & renewals → Due Dates)
// 15 Audit pack — one ZIP per outlet-month (P&L → Month-End Close)
// 16 Outlet ranking (Master Dashboard → Outlet Ranking)
// 17 Budget vs actual (P&L → Budget; P&L Compare "Budget"; MTD P&L budget column + overrun alerts)
// 18 30-day cash forecast (P&L → 30-day Forecast)

// ── 13 ──
function accountantChallanText(sid,y,m){
  const lab=OPS_M[m]+' '+y;const nx=new Date(y,m+1,1);const nm=OPS_M[nx.getMonth()].slice(0,3)+' '+nx.getFullYear();
  const lines=['*'+opsShort(outletSettings(sid))+' — statutory payments for '+lab+'*'];
  if(salaryAttendanceReady(sid,y,m)){
    const rows=statutoryRowsFor(sid,y,m);const sum=f=>rows.reduce((t,e)=>t+(Number(e[f])||0),0);
    const pf=sum('pfEmp')+sum('pfEr'),esic=sum('esicEmp')+sum('esicEr'),pt=sum('ptAmt'),tds=sum('tdsAmt');
    if(pf)lines.push('PF (EE '+opsMoney(sum('pfEmp'))+' + ER '+opsMoney(sum('pfEr'))+'): '+opsMoney(pf)+' — due 15 '+nm);
    if(esic)lines.push('ESIC: '+opsMoney(esic)+' — due 15 '+nm);
    if(pt)lines.push('Professional Tax: '+opsMoney(pt)+' — due '+ptDueDayFor(outletSettings(sid).state)+' '+nm);
    if(tds)lines.push('TDS on salary: '+opsMoney(tds)+' — due 7 '+nm);
  }else lines.push('(Salary not final yet — PF / ESIC / PT / TDS follow once attendance is marked Month Final)');
  try{const g=gstSummaryFor(sid,y,m);if(outletSettings(sid).gstApplicable||g.gross)lines.push('GST (GSTR-3B): output '+opsMoney(g.cgst+g.sgst)+', input '+opsMoney(g.itcTotal)+', net payable '+opsMoney(g.net)+' — due 20 '+nm);}catch(e){}
  lines.push('Files: Salary Working → Statutory Files (PF ECR / ESIC / PT / TDS) and P&L → GST Summary.');
  return lines.join('\n');
}

// ── 14 · Licence & renewal list, for every outlet ──
const LICENCE_FIELDS=[['shop','Shop & establishment licence renewal','shopLicenceValidTill'],['trade','Health / trade licence renewal','tradeLicenceValidTill'],
  ['fire','Fire NOC renewal','fireNocValidTill'],['insurance','Shop insurance renewal','insuranceValidTill'],['pollution','Pollution / signage permit renewal','signageValidTill']];

// ── 15 · Audit pack ──
async function buildAuditPack(salon,y,m){
  const sid=salon.id;await loadScript(CDN.zip);const zip=new window.JSZip();
  const tag=y+'-'+String(m+1).padStart(2,'0');const {fy,mi}=calToFYMI(y,m);
  const add=async(name,title,rows)=>{zip.file(name,await exportReportExcelBlob(title,rows));};
  const p=plBuild(sid,fy,mi);const pr=[['Particulars','Amount']];
  p.sections.forEach(S=>{pr.push([S.sec,Math.round(S.tot)]);(S.lines||[]).forEach(l=>pr.push(['   '+l.name,Math.round(l.amt)]));});
  p.below.forEach(l=>pr.push([l.name,Math.round(l.amt)]));pr.push(['EBITDA',Math.round(p.ebitda)],['Profit before tax',Math.round(p.pbt)]);
  await add('01_PnL_'+tag+'.xlsx','P&L '+tag,pr);
  let ds={},ex={};try{ds=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',sid))||'{}')||{};ex=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_data',sid))||'{}')||{};}catch(e){}
  const dr=[['Date','Cash','Card','UPI','Luzo','Outstanding sale','Bank deposit','Cash counted','Expenses']];
  for(let d=1;d<=new Date(y,m+1,0).getDate();d++){const iso=tag+'-'+String(d).padStart(2,'0');const s=ds[iso]||{};const n=k=>Number(s[k])||0;
    dr.push([opsDMY(iso),n(0),n(1),n(2),n(3),n(4),n(11),s[17]!=null?n(17):'',Object.values(ex[iso]||{}).reduce((t,v)=>t+(Number(v)||0),0)]);}
  await add('02_Daily_Sales_'+tag+'.xlsx','Daily Sales & Exp '+tag,dr);
  const cc=collectionComparisonRowsFor(sid,y,m);const rs=loadCollectionDiffReasons(sid);
  await add('03_Collection_Comparison_'+tag+'.xlsx','Collection Comparison',[['Date','CRADLE total','Daily Sales total','Diff','Reason'],...cc.filter(r=>r.hasC||r.hasD).map(r=>[opsDMY(r.iso),r.ct,r.et,r.et-r.ct,rs[r.iso]||''])]);
  const br=bankRecoFor(sid,y,m);
  await add('04_Bank_Statement_'+tag+'.xlsx','Bank statement',[['Date','Description','Debit','Credit','Nature'],...br.rows.map(r=>[opsDMY(r.iso),r.description||'',Number(r.debit)||0,Number(r.credit)||0,r.nature||''])]);
  await add('05_Bank_Reco_'+tag+'.xlsx','Bank reconciliation',[['Type','Date','Detail','Amount'],...br.unrecorded.map(x=>['Not recorded in SalonOS',opsDMY(x.iso),x.description||'',(Number(x.debit)||0)-(Number(x.credit)||0)]),...br.notInBank.map(x=>['Not in bank',opsDMY(x.iso),x.vendor+' '+(x.inv.invoiceNo||''),x.amt])]);
  const vend=loadVendors(sid)||[];const vn=id=>(vend.find(v=>v.id===id)||{}).name||id;
  const vl=[['Vendor','Bill no.','Bill date','Amount','Taxable','CGST','SGST','IGST','Paid','Balance','Payments']];
  (loadVendorInvoices(sid)||[]).filter(i=>i&&invoiceBookMonthOf(i)===tag).forEach(i=>{const pd=(i.payments||[]).reduce((t,x)=>t+(Number(x.paidAmount)||0),0);
    vl.push([vn(i.vendorId),i.invoiceNo||'',i.invoiceDate||'',Number(i.amount)||0,Number(i.taxable)||0,Number(i.cgst)||0,Number(i.sgst)||0,Number(i.igst)||0,pd,(Number(i.amount)||0)-pd,(i.payments||[]).map(x=>x.paidDate+' '+x.mode+' '+x.paidAmount).join('; ')]);});
  await add('06_Vendor_Ledger_'+tag+'.xlsx','Vendor bills',vl);
  const g=gstSummaryFor(sid,y,m);
  await add('07_GST_Summary_'+tag+'.xlsx','GST summary',[['Particulars','Amount'],['Sales incl. GST',Math.round(g.gross)],['Taxable',Math.round(g.taxable)],['CGST',Math.round(g.cgst)],['SGST',Math.round(g.sgst)],['Input tax credit',Math.round(g.itcTotal)],['Net payable',Math.round(g.net)]]);
  if(salaryAttendanceReady(sid,y,m)){
    const sw=swWorkingsFor(sid,y,m);
    await add('08_Salary_'+tag+'.xlsx','Salary working',[['Employee','Days','Gross','PF','ESIC','PT','TDS','Advance','Net'],...sw.map(w=>[w.name,w.totalDays,Math.round(w.grossAfterLop),w.pfEmp,w.esicEmp,w.ptAmt,w.tdsAmt,w.advAdj,Math.round(w.net)])]);
    const ecr=pfEcrFor(sid,y,m);if(ecr.text)zip.file('09_PF_ECR_'+tag+'.txt',ecr.text);
  }
  await add('10_Month_End_Checklist_'+tag+'.xlsx','Month-end checklist',[['Step','Done','Detail'],...monthCloseStepsFor(sid,y,m).map(s=>[s.label,s.done?'Yes':'No',s.detail||''])]);
  const blob=await zip.generateAsync({type:'blob'});
  rDownloadBlob(blob,'Audit_Pack_'+opsShort(salon).replace(/[^A-Za-z0-9]+/g,'_')+'_'+tag+'.zip');
}

// ── 16 · Outlet ranking ──
function outletScoreRow(s,y,m){
  const r=mtdPnlFor(s.id,y,m);const rev=r.mtd.revenue;
  const pd=new Date(y,m-1,1);const pf=calToFYMI(pd.getFullYear(),pd.getMonth());const prev=plBuild(s.id,pf.fy,pf.mi);
  const prevPace=prev.revenue*r.f;
  const emp=(r.sections.find(x=>x.sec==='Employee cost')||{mtd:0}).mtd;
  const coll=collectionDiffStatusFor(s.id,y,m);
  const missing=dseDaysMissingFor(s.id,y,m).length;
  const tgt=salesTargetFor(s.id,y,m);
  return{s,rev,growth:prevPace?(rev-prevPace)/prevPace*100:null,ebitdaPct:rev?r.mtd.ebitda/rev*100:null,salPct:rev?emp/rev*100:null,
    diffs:coll.applicable?coll.unexplained.length:0,missing,tgtPct:tgt?rev*1.05/tgt*100:null,day:r.day};
}
function OutletRankingBoard({accessibleSalons}){
  const h=React.createElement;
  const [cal,setCal]=useState({year:new Date().getFullYear(),month:new Date().getMonth()});
  const rows=(accessibleSalons||[]).filter(s=>s&&s.id!=null&&s.status!=='Inactive').map(s=>outletScoreRow(s,cal.year,cal.month));
  // Rank on each measure (higher is better except salary %, differences and missing days), average the ranks.
  const metrics=[['growth',1],['ebitdaPct',1],['salPct',-1],['diffs',-1],['missing',-1],['tgtPct',1]];
  metrics.forEach(([k,dir])=>{const vals=rows.filter(r=>r[k]!=null).sort((a,b)=>dir*(b[k]-a[k]));vals.forEach((r,i)=>{r['rk_'+k]=i+1;});});
  rows.forEach(r=>{const rk=metrics.map(([k])=>r['rk_'+k]).filter(Boolean);r.score=rk.length?rk.reduce((a,b)=>a+b,0)/rk.length:99;});
  rows.sort((a,b)=>a.score-b.score);
  const f=(v,suf)=>v==null?'—':(Math.round(v*10)/10)+(suf||'');
  return h('div',null,
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}},
      h('div',null,h('div',{className:'page-title'},'Outlet Ranking'),h('div',{className:'page-sub'},'Month to date — revenue growth vs last month’s pace, EBITDA %, salary % of revenue, target achievement, collection differences and missing Daily Sales days; overall rank = average of the ranks')),
      afMonthPicker(cal,setCal)),
    h('div',{className:'card',style:{padding:0}},h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,['#','Outlet','Revenue MTD','Growth vs last month','EBITDA %','Salary % of rev','Target achieved','Unexplained coll. diffs','Days missing'].map((t,i)=>h('th',{key:i,style:i>1?{textAlign:'right'}:null},t)))),
      h('tbody',null,rows.map((r,i)=>h('tr',{key:r.s.id},
        h('td',{style:{fontWeight:700,color:i===0?'var(--green)':i===rows.length-1&&rows.length>1?'var(--red)':'var(--text2)'}},i+1),
        h('td',{style:{fontWeight:600,whiteSpace:'nowrap'}},opsShort(r.s)),
        h('td',{style:{textAlign:'right'}},opsMoney(r.rev)),
        h('td',{style:{textAlign:'right',color:r.growth==null?'':r.growth>=0?'var(--green)':'var(--red)'}},r.growth==null?'—':(r.growth>=0?'+':'')+f(r.growth,'%')),
        h('td',{style:{textAlign:'right'}},f(r.ebitdaPct,'%')),h('td',{style:{textAlign:'right'}},f(r.salPct,'%')),
        h('td',{style:{textAlign:'right'}},f(r.tgtPct,'%')),
        h('td',{style:{textAlign:'right',color:r.diffs?'var(--orange)':''}},r.diffs),h('td',{style:{textAlign:'right',color:r.missing?'var(--orange)':''}},r.missing))))))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'Growth compares revenue so far with last month’s revenue scaled to the same number of days. Set monthly sales targets in P&L → MTD P&L.'));
}

// ── 17 · Budget ──
function loadPlBudget(sid){try{return JSON.parse(cachedLocalGet(outletKey('salonos_pl_budget',sid))||'{}')||{};}catch(e){return{};}}
function savePlBudget(sid,b){safeLocalSet(outletKey('salonos_pl_budget',sid),JSON.stringify(b));}
function budgetLinesFor(sid,fy){return(loadPlBudget(sid)[fy]||{});}
// A plBuild-shaped object of the monthly budget (template = a real plBuild so every section/line exists).
function budgetPlFor(sid,fy,template){
  const b=budgetLinesFor(sid,fy);if(!Object.keys(b).length)return null;
  const sections=template.sections.map(S=>{const lines=S.lines.map(l=>({...l,amt:Number(b[l.name])||0}));return{...S,lines,tot:lines.reduce((t,l)=>t+l.amt,0)};});
  const below=template.below.map(l=>({...l,amt:Number(b[l.name])||0}));
  const sec=n=>(sections.find(s=>s.sec===n)||{tot:0}).tot;
  const revenue=sec('Revenue'),direct=sec('Direct cost of service'),opex=sec('Employee cost')+sec('Operating expenses');
  const belowTot=below.reduce((t,l)=>t+l.amt,0);
  return{sections,below,revenue,direct,gross:revenue-direct,opex,ebitda:revenue-direct-opex,belowTot,pbt:revenue-direct-opex-belowTot};
}
function BudgetSheet({salon,period}={}){
  const h=React.createElement;const {success,error:toastErr}=useToast();
  const sid=salon?.id;const fy=(period&&period.fy)||calToFYMI(new Date().getFullYear(),new Date().getMonth()).fy;
  const tmpl=plBuild(sid,fy,(period&&typeof period.mi==='number')?period.mi:0);
  const [draft,setDraft]=useState(()=>({...budgetLinesFor(sid,fy)}));
  const set=(k,v)=>setDraft(d=>({...d,[k]:v}));
  const fill=()=>{
    // Average of the last 3 months that have figures.
    const now=new Date();const acc={},cnt={};
    for(let i=1;i<=6&&Object.keys(cnt).length<999;i++){const d=new Date(now.getFullYear(),now.getMonth()-i,1);const fm=calToFYMI(d.getFullYear(),d.getMonth());const p=plBuild(sid,fm.fy,fm.mi);
      if(!p.revenue)continue;p.sections.forEach(S=>S.lines.forEach(l=>{acc[l.name]=(acc[l.name]||0)+l.amt;cnt[l.name]=(cnt[l.name]||0)+1;}));p.below.forEach(l=>{acc[l.name]=(acc[l.name]||0)+l.amt;cnt[l.name]=(cnt[l.name]||0)+1;});
      if(Object.values(cnt)[0]>=3)break;}
    if(!Object.keys(acc).length){toastErr('No earlier months with figures to average.');return;}
    const n={};Object.keys(acc).forEach(k=>{n[k]=String(Math.round(acc[k]/cnt[k]));});setDraft(n);success('Filled from the average of recent months — adjust and Save');
  };
  const save=()=>{const b=loadPlBudget(sid);const clean={};Object.entries(draft).forEach(([k,v])=>{if(v!==''&&!isNaN(Number(v)))clean[k]=Number(v);});b[fy]=clean;savePlBudget(sid,b);success('Budget for FY '+fy+' saved');};
  const total=names=>names.reduce((t,n)=>t+(Number(draft[n])||0),0);
  return h('div',null,
    h('div',{className:'section-header'},h('div',null,h('div',{className:'page-title'},'Budget — FY '+fy),
      h('div',{className:'page-sub'},'Monthly budget per P&L line. Used by P&L Compare → “Budget” and by MTD P&L (pro-rata budget, overrun alerts).')),
      h('div',{style:{display:'flex',gap:8}},h('button',{className:'btn btn-ghost btn-sm',onClick:fill},'Fill from recent average'),h('button',{className:'btn btn-primary btn-sm',onClick:save},'💾 Save budget'))),
    h('div',{className:'card',style:{padding:0}},h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,h('th',null,'P&L line'),h('th',{style:{textAlign:'right'}},'Monthly budget (₹)'),h('th',{style:{textAlign:'right'}},'Year (×12)'))),
      h('tbody',null,...tmpl.sections.flatMap(S=>[
        h('tr',{key:S.sec,style:{background:'var(--bg3)',fontWeight:700}},h('td',null,S.sec),h('td',{style:{textAlign:'right'}},opsMoney(total(S.lines.map(l=>l.name)))),h('td',{style:{textAlign:'right'}},opsMoney(total(S.lines.map(l=>l.name))*12))),
        ...S.lines.map(l=>h('tr',{key:S.sec+l.name},h('td',{style:{paddingLeft:24,fontSize:12.5}},l.name),
          h('td',{style:{textAlign:'right'}},h('input',{type:'number',className:'form-control',style:{width:130,display:'inline-block',textAlign:'right'},value:draft[l.name]??'',onChange:e=>set(l.name,e.target.value)})),
          h('td',{style:{textAlign:'right',fontSize:12,color:'var(--text3)'}},draft[l.name]?opsMoney(Number(draft[l.name])*12):'')))]),
        ...tmpl.below.map(l=>h('tr',{key:'b'+l.name},h('td',{style:{fontSize:12.5}},l.name),h('td',{style:{textAlign:'right'}},h('input',{type:'number',className:'form-control',style:{width:130,display:'inline-block',textAlign:'right'},value:draft[l.name]??'',onChange:e=>set(l.name,e.target.value)})),h('td',null))))))));
}
// MTD lines running more than 10% over their pro-rata budget (expenses) or behind it (revenue).
function budgetOverruns(sid,r,fy){
  const b=budgetLinesFor(sid,fy);if(!Object.keys(b).length)return[];
  const out=[];
  r.sections.forEach(S=>S.lines.forEach(l=>{const bud=Number(b[l.name])||0;if(!bud)return;const pace=bud*r.f;
    if(S.sec==='Revenue'){if(l.mtd<pace*0.9)out.push({name:l.name,mtd:l.mtd,pace,rev:true});}
    else if(l.mtd>pace*1.1)out.push({name:l.name,mtd:l.mtd,pace});}));
  return out;
}

// ── 18 · 30-day cash forecast ──
function cashForecastFor(sid,opening){
  const today=new Date();today.setHours(0,0,0,0);
  let ds={},ex={};try{ds=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',sid))||'{}')||{};ex=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_data',sid))||'{}')||{};}catch(e){}
  const skip=new Set(['Previous Month Salary','Previous Month Incentive']);
  const skipIdx=new Set(EXPENSE_ROWS.map((r,i)=>skip.has(r.name)?String(i):null).filter(Boolean));
  // Weekday averages over the last 8 weeks (receipts: cash + card + UPI + Luzo + apps; payments: Daily Sales expenses).
  const inW=[0,0,0,0,0,0,0],outW=[0,0,0,0,0,0,0],nW=[0,0,0,0,0,0,0];
  for(let i=1;i<=56;i++){const d=new Date(today.getTime()-i*864e5);const iso=opsIso(d);const s=ds[iso];if(!s)continue;const n=k=>Number(s[k])||0;
    const wd=d.getDay();inW[wd]+=n(0)+n(1)+n(2)+n(3)+n(5)+n(14)+n(15)+n(16);outW[wd]+=Object.entries(ex[iso]||{}).filter(([k])=>!skipIdx.has(k)).reduce((t,[,v])=>t+(Number(v)||0),0);nW[wd]++;}
  const avgIn=wd=>nW[wd]?inW[wd]/nW[wd]:0,avgOut=wd=>nW[wd]?outW[wd]/nW[wd]:0;
  const days=[];
  for(let i=0;i<30;i++){const d=new Date(today.getTime()+i*864e5);days.push({iso:opsIso(d),inflow:avgIn(d.getDay()),outflow:avgOut(d.getDay()),items:[]});}
  const last=days[29].iso;const put=(iso,amt,label)=>{const t=iso<days[0].iso?days[0]:days.find(x=>x.iso===iso);if(t&&amt>0){t.items.push({label,amt});}};
  // Scheduled payments: unpaid dues (salary, incentive, PF / ESIC / PT / TDS, vendor bills, licences).
  (allDueItemsFor(sid)||[]).forEach(d=>{if(!d||d.paid||d.status==='done'||!d.due)return;const iso=toISO(d.due)||d.due;if(iso>last)return;put(iso,Math.max(0,(Number(d.amount)||0)-(Number(d.paidAmount)||0)),(d.type||'Due')+(d.desc?' — '+String(d.desc).slice(0,40):''));});
  // This month's salary (not final yet, so not in the dues) on next month's salary due day.
  const s=outletSettings(sid);const dueDay=Number(s.salaryDueDay)||7;
  const sd=new Date(today.getFullYear(),today.getMonth()+1,dueDay);const sdIso=opsIso(sd);
  if(sdIso<=last&&!salaryAttendanceReady(sid,today.getFullYear(),today.getMonth())){
    const est=(getEmployeesForMonth(today.getFullYear(),today.getMonth(),sid)||[]).filter(e=>e.status==='Active').reduce((t,e)=>t+(Number(e.gross)||0),0);
    put(sdIso,est,'Salary for '+OPS_M[today.getMonth()]+' (estimate)');}
  // Fixed recurring commitments with a due day in the window, unless a bill for them is already in Vendors.
  (loadRecurringExpenses(sid)||[]).filter(it=>it.status==='Active'&&Number(it.dueDay)>0&&it.amountType!=='Variable').forEach(it=>{
    [0,1].forEach(k=>{const dd=new Date(today.getFullYear(),today.getMonth()+k,Number(it.dueDay));const iso=opsIso(dd);if(iso<days[0].iso||iso>last)return;
      const amt=recurringExpenseMonthlyAmt(it,dd.getFullYear(),dd.getMonth(),sid);if(!(amt>0))return;
      const billed=(loadVendorInvoices(sid)||[]).some(inv=>{const v=(loadVendors(sid)||[]).find(x=>x.id===inv.vendorId);return v&&it.payee&&v.name&&v.name.toLowerCase()===String(it.payee).toLowerCase()&&invoiceBookMonthOf(inv)===iso.slice(0,7);});
      if(!billed)put(iso,amt,(it.customName||it.expenseName||'Recurring')+' — '+(it.payee||''));});});
  let bal=Number(opening)||0,firstNeg=null,low={bal:Infinity,iso:''};
  days.forEach(d=>{d.scheduled=d.items.reduce((t,x)=>t+x.amt,0);bal+=d.inflow-d.outflow-d.scheduled;d.balance=bal;if(bal<0&&!firstNeg)firstNeg=d.iso;if(bal<low.bal)low={bal,iso:d.iso};});
  return{days,firstNeg,low,totals:{in:days.reduce((t,d)=>t+d.inflow,0),out:days.reduce((t,d)=>t+d.outflow+d.scheduled,0)}};
}
function CashForecastSheet({salon}={}){
  const h=React.createElement;const sid=salon?.id;
  const k=outletKey('salonos_cash_forecast_opening',sid);
  const lastBank=(()=>{const rows=(loadBankStatementRows(sid)||[]).filter(r=>r.closingBalance!=null&&r.closingBalance!=='').map(r=>({iso:toISO(r.transactionDate||r.date),b:Number(r.closingBalance)})).filter(x=>x.iso&&!isNaN(x.b)).sort((a,b)=>a.iso.localeCompare(b.iso));return rows.length?rows[rows.length-1]:null;})();
  const lastCount=(()=>{const c=loadCashCounts(sid);const ks=Object.keys(c).sort();return ks.length?{iso:ks[ks.length-1],amt:c[ks[ks.length-1]].count}:null;})();
  const [opening,setOpening]=useState(()=>cachedLocalGet(k)||String(Math.round((lastBank?lastBank.b:0)+(lastCount?lastCount.amt:0))));
  const [open,setOpen]=useState(null);
  const f=cashForecastFor(sid,opening);
  return h('div',null,
    h('div',{className:'section-header'},h('div',null,h('div',{className:'page-title'},'30-day Cash Forecast'),
      h('div',{className:'page-sub'},'Receipts and daily spends from each weekday’s average over the last 8 weeks, plus every scheduled payment (salary, statutory, vendor bills, rent and other commitments) on its due date')),
      h('div',{style:{display:'flex',gap:8,alignItems:'center'}},h('span',{style:{fontSize:12,color:'var(--text3)'}},'Cash + bank today ₹'),
        h('input',{type:'number',className:'form-control',style:{width:140},value:opening,onChange:e=>{setOpening(e.target.value);safeLocalSet(k,e.target.value);}}))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'Suggested: '+(lastBank?'bank '+opsMoney(lastBank.b)+' ('+opsDMY(lastBank.iso)+')':'no bank balance imported')+(lastCount?' + cash counted '+opsMoney(lastCount.amt)+' ('+opsDMY(lastCount.iso)+')':'')),
    f.firstNeg?h('div',{style:{background:'rgba(224,82,82,0.1)',border:'1px solid rgba(224,82,82,0.35)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:12,fontSize:13}},h('b',{style:{color:'var(--red)'}},'⚠ Cash runs short on '+opsDMY(f.firstNeg)),' — lowest point '+opsMoney(f.low.bal)+' on '+opsDMY(f.low.iso)+'. Arrange funds or move payments.')
      :h('div',{style:{fontSize:12.5,color:'var(--green)',marginBottom:12}},'✓ No shortfall expected in the next 30 days — lowest balance '+opsMoney(f.low.bal)+' on '+opsDMY(f.low.iso)+'.'),
    h('div',{className:'card',style:{padding:0}},h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,['Date','Expected receipts','Daily spends','Scheduled payments','Balance'].map((t,i)=>h('th',{key:i,style:i?{textAlign:'right'}:null},t)))),
      h('tbody',null,...f.days.flatMap(d=>[h('tr',{key:d.iso,style:{cursor:d.items.length?'pointer':'default',background:d.balance<0?'rgba(224,82,82,0.06)':undefined},onClick:()=>d.items.length&&setOpen(open===d.iso?null:d.iso)},
        h('td',{style:{whiteSpace:'nowrap'}},opsDMY(d.iso)+' '+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(d.iso+'T00:00:00').getDay()]),
        h('td',{style:{textAlign:'right'}},opsMoney(d.inflow)),h('td',{style:{textAlign:'right'}},opsMoney(d.outflow)),
        h('td',{style:{textAlign:'right',fontWeight:d.scheduled?600:400}},d.scheduled?opsMoney(d.scheduled)+' ▾':'—'),
        h('td',{style:{textAlign:'right',fontWeight:700,color:d.balance<0?'var(--red)':'var(--text)'}},opsMoney(d.balance))),
        ...(open===d.iso?d.items.map((x,i)=>h('tr',{key:d.iso+i},h('td',{colSpan:3,style:{paddingLeft:24,fontSize:12,color:'var(--text2)'}},x.label),h('td',{style:{textAlign:'right',fontSize:12}},opsMoney(x.amt)),h('td',null))):[])]))))));
}
