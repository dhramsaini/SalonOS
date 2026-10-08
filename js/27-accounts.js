// ═══════════════════════════════════════════════════════════════════════════════════════════
// Accounts — GST returns working (GSTR-1 + GSTR-3B), TDS returns working (26Q / 24Q) with annual
// salary statements (Form 16 Part B working), vendor balance confirmation, and the Tally balance
// check (SalonOS balances against Tally's, live through the Tally Connector or from a Trial Balance).
// ═══════════════════════════════════════════════════════════════════════════════════════════

// ═══ GST returns working ═══
async function buildGstReturnsWorkbook(sid,salon,year,month){
  await loadExcelJS();
  const wb=new ExcelJS.Workbook();wb.creator='SalonOS';wb.created=new Date();wb.calcProperties.fullCalcOnLoad=true;
  const lbl=RPT_MONTHS[month]+' '+year,outlet=rptShort(salon);
  const K=makeXlKit(wb,outlet+' — GST working '+lbl);const R2=n=>Math.round((Number(n)||0)*100)/100;
  const g=gstSummaryFor(sid,year,month);const o=outletSettings(sid)||{};
  const gstin=String(o.gst||'').toUpperCase(),pos=gstin?gstin.slice(0,2)+'-'+(gstStateNameFor(gstin)||''):'—';
  const rest=isRestaurantOutlet(sid),sac=rest?'996331':'999721',sacName=rest?'Restaurant services':'Hairdressing and beauty services';
  const ym=year+'-'+String(month+1).padStart(2,'0');
  const inv=(loadVendorInvoices(sid)||[]).filter(i=>i&&invoiceBookMonthOf(i)===ym&&(i.docNature||'Tax Invoice')==='Tax Invoice');
  const vendors=loadVendors(sid)||[];const vOf=id=>vendors.find(v=>String(v.id)===String(id))||{};
  const wsS=K.sheet('Summary'),w1=K.sheet('GSTR-1','FF2E7D32'),w2=K.sheet('ITC register','FF6A1B9A'),w3=K.sheet('GSTR-3B','FFEF6C00');
  // ── GSTR-1 ──
  {const ws=w1,COLS=7;
    K.banner(ws,'GSTR-1 working — '+outlet+' · '+lbl,'GSTIN '+(gstin||'not set in Master Sheet')+'. Outward supplies to customers (B2C), from '+(g.source==='dse'?'Daily Sales & Exp':'Collection Reco')+' cash + card + UPI sales, tax at 5% inside the price (same ÷ 1.05 as the P&L). Change the blue cell if the portal figure differs.',COLS);
    K.band(ws,4,'Sales for the month',COLS);
    K.put(ws,5,1,'Sales including GST');K.put(ws,5,3,R2(g.gross),K.NUM);ws.getCell(5,3).font={color:{argb:'FF1F5FBF'},bold:true};K.style(ws,5,COLS);
    K.put(ws,6,1,'GST rate');K.put(ws,6,3,0.05,'0%');K.style(ws,6,COLS);
    K.band(ws,8,'Table 7 — B2C (others), intra-state',COLS);
    K.head(ws,9,['Place of supply','Rate','Taxable value ₹','IGST ₹','CGST ₹','SGST ₹','Cess ₹'],2);
    K.put(ws,10,1,pos);K.put(ws,10,2,{f:'C6',r:0.05},'0%');K.put(ws,10,3,{f:'ROUND(C5/(1+C6),2)',r:R2(g.taxable)},'#,##0.00');K.put(ws,10,4,0,'#,##0.00');
    K.put(ws,10,5,{f:'ROUND(C10*C6/2,2)',r:R2(g.cgst)},'#,##0.00');K.put(ws,10,6,{f:'ROUND(C10*C6/2,2)',r:R2(g.sgst)},'#,##0.00');K.put(ws,10,7,0,'#,##0.00');K.style(ws,10,COLS,'total');
    K.band(ws,12,'Table 12 — HSN / SAC summary',COLS);
    K.head(ws,13,['SAC','Description','Total value ₹','Taxable value ₹','IGST ₹','CGST ₹','SGST ₹'],3);
    K.put(ws,14,1,sac);K.put(ws,14,2,sacName);K.put(ws,14,3,{f:'C5',r:R2(g.gross)},'#,##0.00');K.put(ws,14,4,{f:'C10',r:R2(g.taxable)},'#,##0.00');K.put(ws,14,5,0,'#,##0.00');K.put(ws,14,6,{f:'E10',r:R2(g.cgst)},'#,##0.00');K.put(ws,14,7,{f:'F10',r:R2(g.sgst)},'#,##0.00');K.style(ws,14,COLS);
    K.note(ws,16,'B2B sales (to a customer with a GSTIN) need invoice-wise reporting in Table 4 — bill them from SalonOS Billing with the customer’s GSTIN. Table 13 (documents issued) comes from the bill series in Billing.',COLS);
    ws.columns=[{width:24},{width:30},{width:16},{width:14},{width:14},{width:14},{width:12}];K.setup(ws,true,0);}
  // ── ITC register ──
  const IT={};
  {const ws=w2,COLS=11;
    K.banner(ws,'Input tax credit — vendor tax invoices booked in '+lbl,'Every Tax Invoice booked in Vendors this month (by booking month). Match it with GSTR-2B before claiming'+(g.blocked?' — input credit is BLOCKED for this outlet (Master Sheet), so it is reversed in GSTR-3B.':'.'),COLS);
    K.head(ws,4,['Invoice date','Vendor','Vendor GSTIN','Invoice no.','Category','Taxable ₹','IGST ₹','CGST ₹','SGST ₹','Total tax ₹','Invoice total ₹'],6);
    let r=5;const st=r;const n=v=>R2(v);
    inv.sort((a,b)=>String(vlIso(a.invoiceDate)).localeCompare(String(vlIso(b.invoiceDate)))).forEach(i=>{const v=vOf(i.vendorId);
      K.put(ws,r,1,i.invoiceDate||'—');K.put(ws,r,2,v.name||'—');K.put(ws,r,3,String(v.gst||'').toUpperCase()||'— (no GSTIN)');K.put(ws,r,4,i.invoiceNo||'—');K.put(ws,r,5,i.category||'');
      K.put(ws,r,6,n(i.taxable),'#,##0.00');K.put(ws,r,7,n(i.igst),'#,##0.00');K.put(ws,r,8,n(i.cgst),'#,##0.00');K.put(ws,r,9,n(i.sgst),'#,##0.00');
      K.put(ws,r,10,{f:'G'+r+'+H'+r+'+I'+r,r:n(i.igst)+n(i.cgst)+n(i.sgst)},'#,##0.00');K.put(ws,r,11,n(i.amount),'#,##0.00');K.style(ws,r,COLS);
      if(!v.gst)ws.getCell(r,3).font={color:{argb:'FFC0392B'},size:10};r++;});
    if(!inv.length){K.put(ws,r,1,'No tax invoices booked this month');K.style(ws,r,COLS);r++;}
    K.put(ws,r,1,'Total ('+inv.length+')');['F','G','H','I','J','K'].forEach(c=>K.put(ws,r,c.charCodeAt(0)-64,{f:'SUM('+c+st+':'+c+(r-1)+')',r:0},'#,##0.00'));K.style(ws,r,COLS,'grand');
    IT.row=r;r+=2;K.note(ws,r,'Red GSTIN = vendor has no GSTIN in Vendors; such a bill does not give input credit. A bill not shown in your GSTR-2B should be held back until the vendor files it.',COLS);
    ws.columns=[{width:12},{width:26},{width:18},{width:14},{width:20},{width:13},{width:11},{width:11},{width:11},{width:12},{width:14}];K.setup(ws,true,4);}
  // ── GSTR-3B ──
  const B={};
  {const ws=w3,COLS=6,I="'ITC register'!",G1="'GSTR-1'!";
    K.banner(ws,'GSTR-3B working — '+outlet+' · '+lbl,'Tax liability from GSTR-1, input credit from the ITC register, and how the credit is set off (IGST credit first, as the law requires). The cash column is what to pay by the 20th.',COLS);
    K.band(ws,4,'3.1 (a) Outward taxable supplies',COLS);K.head(ws,5,['Nature of supply','','Taxable value ₹','IGST ₹','CGST ₹','SGST ₹'],3);
    K.put(ws,6,1,'Outward taxable supplies (other than zero rated, nil, exempted)');ws.mergeCells(6,1,6,2);
    K.put(ws,6,3,{f:G1+'C10',r:R2(g.taxable)},'#,##0.00');K.put(ws,6,4,{f:G1+'D10',r:0},'#,##0.00');K.put(ws,6,5,{f:G1+'E10',r:R2(g.cgst)},'#,##0.00');K.put(ws,6,6,{f:G1+'F10',r:R2(g.sgst)},'#,##0.00');K.style(ws,6,COLS,'total');B.liab=6;
    K.band(ws,8,'4. Eligible input tax credit',COLS);K.head(ws,9,['Details','','','IGST ₹','CGST ₹','SGST ₹'],4);
    K.put(ws,10,1,'(A)(5) All other ITC — vendor tax invoices');ws.mergeCells(10,1,10,3);K.put(ws,10,4,{f:I+'G'+IT.row,r:R2(g.itc.igst)},'#,##0.00');K.put(ws,10,5,{f:I+'H'+IT.row,r:R2(g.itc.cgst)},'#,##0.00');K.put(ws,10,6,{f:I+'I'+IT.row,r:R2(g.itc.sgst)},'#,##0.00');K.style(ws,10,COLS);
    K.put(ws,11,1,'(B)(2) Reversed — input credit blocked for this outlet');ws.mergeCells(11,1,11,3);['D','E','F'].forEach((c,j)=>K.put(ws,11,4+j,g.blocked?{f:c+'10',r:0}:0,'#,##0.00'));K.style(ws,11,COLS);
    K.put(ws,12,1,'(C) Net ITC available');ws.mergeCells(12,1,12,3);['D','E','F'].forEach((c,j)=>K.put(ws,12,4+j,{f:c+'10-'+c+'11',r:0},'#,##0.00'));K.style(ws,12,COLS,'total');B.itc=12;
    K.band(ws,14,'6.1 Payment of tax — set-off',COLS);K.head(ws,15,['Step','','','IGST ₹','CGST ₹','SGST ₹'],4);
    const row=(r,label,d,e,f,kind)=>{K.put(ws,r,1,label);ws.mergeCells(r,1,r,3);K.put(ws,r,4,d,'#,##0.00');K.put(ws,r,5,e,'#,##0.00');K.put(ws,r,6,f,'#,##0.00');K.style(ws,r,COLS,kind);};
    row(16,'Tax payable',{f:'D6',r:0},{f:'E6',r:0},{f:'F6',r:0});
    row(17,'Paid from IGST credit',{f:'MIN(D12,D16)',r:0},{f:'MIN(D12-D17,E16)',r:0},{f:'MIN(D12-D17-E17,F16)',r:0});
    row(18,'Paid from CGST credit',0,{f:'MIN(E12,E16-E17)',r:0},0);
    row(19,'Paid from SGST credit',0,0,{f:'MIN(F12,F16-F17)',r:0});
    row(20,'Paid in cash',{f:'D16-D17-D18-D19',r:0},{f:'E16-E17-E18-E19',r:0},{f:'F16-F17-F18-F19',r:0},'grand');B.cash=20;
    row(21,'Credit carried to next month',{f:'D12-D17-E17-F17',r:0},{f:'E12-E18',r:0},{f:'F12-F19',r:0});
    K.note(ws,23,'Interest at 18% a year applies to cash paid after the 20th. Check the figures against the portal’s auto-filled GSTR-3B before you submit.',COLS);
    ws.columns=[{width:30},{width:10},{width:16},{width:14},{width:14},{width:14}];K.setup(ws,false,0);}
  // ── Summary ──
  {const W=wsS,COLS2=8,r3="'GSTR-3B'!";
    const out=R2(g.cgst+g.sgst);
    K.banner(W,'GST — '+outlet+' · '+lbl,'GSTIN '+(gstin||'—')+' · GSTR-1 due the 11th, GSTR-3B and payment due the 20th of next month. All figures link to the working sheets.',COLS2);
    K.cards(W,4,[{label:'OUTPUT TAX',f:r3+'E6+'+r3+'F6+'+r3+'D6',r:out,sub:'on sales of ₹'+Math.round(g.gross).toLocaleString('en-IN')},
      {label:'INPUT CREDIT (NET)',f:r3+'D12+'+r3+'E12+'+r3+'F12',r:R2(g.itcTotal),sub:inv.length+' tax invoice'+(inv.length===1?'':'s')+(g.blocked?' · blocked':'')},
      {label:'PAY IN CASH',f:r3+'D20+'+r3+'E20+'+r3+'F20',r:R2(g.net),sub:'by the 20th'},
      {label:'CREDIT CARRIED FORWARD',f:r3+'D21+'+r3+'E21+'+r3+'F21',r:R2(g.credit),sub:'to next month'}]);
    let rr=9;K.band(W,rr,'What is in this file',COLS2);rr++;
    [['GSTR-1','Table 7 B2C sales and Table 12 SAC summary'],['ITC register','Each vendor tax invoice with GSTIN and tax split'],['GSTR-3B','Tables 3.1, 4 and 6.1 with the credit set-off']].forEach(([nm,t])=>{W.mergeCells(rr,1,rr,2);W.mergeCells(rr,3,rr,COLS2);K.link(W,rr,1,nm,"'"+nm+"'!A1");K.put(W,rr,3,t);K.style(W,rr,COLS2);W.getCell(rr,1).font={color:{argb:K.C.link},underline:true,size:10};rr++;});
    W.columns=[{width:14},{width:12},{width:14},{width:12},{width:14},{width:12},{width:14},{width:12}];K.setup(W,false,0);}
  return{wb,filename:'GST_Working_'+rptFile(outlet)+'_'+ym+'.xlsx'};
}

// ═══ TDS returns working (26Q / 24Q) ═══
function tdsReturnRowsFor(sid,fy){
  const recurring=loadRecurringExpenses(sid).filter(it=>it.status==='Active'&&it.tdsApplicable&&it.tdsSection);
  const vendors=loadVendors(sid)||[];const panOf=name=>{const v=vendors.find(x=>String(x.name||'').trim().toLowerCase()===String(name||'').trim().toLowerCase());return v?String(v.pan||(v.gst?String(v.gst).slice(2,12):'')).toUpperCase():'';};
  const ov=loadDueAutoOverrides(sid);const q26=[],q24=[];
  for(let mi=0;mi<12;mi++){const c=periodToCalendar({fy,mi});if(!c||!isMonthUpToNow(c.year,c.month))continue;
    const ovr=ov['auto-tds-'+c.year+'-'+c.month]||{};const paidKeys=ovr.paidKeys||{};const month=RPT_MONTHS[c.month].slice(0,3)+' '+c.year,q='Q'+(Math.floor(mi/3)+1);
    recurring.forEach(it=>{const div=recurringDivisorOf(it);const tds=tdsAmountOf(it)/div;if(!(tds>0))return;
      q26.push({q,month,party:it.payee||'(no payee)',pan:panOf(it.payee),section:it.tdsSection,nature:(it.expenseName==='Other'&&it.customName?it.customName:it.expenseName),paid:(Number(it.amount)||0)/div,rate:Number(it.tdsRate)||0,tds,deposited:!!paidKeys['rec_'+it.id]||!!ovr.paid,ref:ovr.ref||''});});
    if(salaryAttendanceReady(sid,c.year,c.month))(statutoryRowsFor(sid,c.year,c.month)||[]).forEach(e=>{
      q24.push({q,month,id:e.id,name:e.name,pan:String(e.pan||'').toUpperCase(),gross:Number(e.grossAfterLop)||0,tea:Number(e.tea)||0,pf:Number(e.pfEmp)||0,esic:Number(e.esicEmp)||0,pt:Number(e.ptAmt)||0,tds:Number(e.tdsAmt)||0,deposited:!!paidKeys['emp_'+e.id]||!!ovr.paid});});
  }
  return{q26,q24};
}
async function buildTdsReturnsWorkbook(sid,salon,fy){
  await loadExcelJS();
  const wb=new ExcelJS.Workbook();wb.creator='SalonOS';wb.created=new Date();wb.calcProperties.fullCalcOnLoad=true;
  const outlet=rptShort(salon);const K=makeXlKit(wb,outlet+' — TDS working FY '+fy);const R2=n=>Math.round((Number(n)||0)*100)/100;
  const {q26,q24}=tdsReturnRowsFor(sid,fy);const tan=String((outletSettings(sid)||{}).tan||'').toUpperCase();
  const wsS=K.sheet('Summary'),w26=K.sheet('26Q (others)','FF2E7D32'),w24=K.sheet('24Q (salary)','FFEF6C00'),wA=K.sheet('Annual salary','FF6A1B9A');
  const ref={};
  {const ws=w26,COLS=11;
    K.banner(ws,'26Q working — TDS other than salary · FY '+fy,'Rent, professional fees and other payments set up with TDS in Recurring Expenses, month by month. PAN from the vendor of the same name (or from its GSTIN). Deposited = marked paid in Due Dates.',COLS);
    K.head(ws,4,['Quarter','Month','Deductee','PAN','Section','Nature','Amount paid ₹','Rate','TDS ₹','Deposited','Challan ref'],7);
    let r=5;const st=r;q26.forEach(x=>{K.put(ws,r,1,x.q);K.put(ws,r,2,x.month);K.put(ws,r,3,x.party);K.put(ws,r,4,x.pan||'— PAN missing');K.put(ws,r,5,x.section);K.put(ws,r,6,x.nature);
      K.put(ws,r,7,R2(x.paid),'#,##0.00');K.put(ws,r,8,x.rate/100,'0.0%');K.put(ws,r,9,R2(x.tds),'#,##0.00');K.put(ws,r,10,x.deposited?'Yes':'No');K.put(ws,r,11,x.ref);K.style(ws,r,COLS);
      if(!x.pan)ws.getCell(r,4).font={color:{argb:'FFC0392B'},size:10};if(!x.deposited)ws.getCell(r,10).font={color:{argb:'FFC0392B'},bold:true,size:10};r++;});
    if(!q26.length){K.put(ws,r,1,'No TDS on other payments this year');K.style(ws,r,COLS);r++;}
    K.put(ws,r,1,'Total');K.put(ws,r,7,{f:'SUM(G'+st+':G'+(r-1)+')',r:0},'#,##0.00');K.put(ws,r,9,{f:'SUM(I'+st+':I'+(r-1)+')',r:0},'#,##0.00');K.style(ws,r,COLS,'grand');ref.r26={st,end:r-1,tot:r};
    ws.columns=[{width:8},{width:10},{width:24},{width:14},{width:10},{width:20},{width:14},{width:7},{width:12},{width:10},{width:14}];K.setup(ws,true,4);}
  {const ws=w24,COLS=12;
    K.banner(ws,'24Q working — TDS on salary (Sec 192) · FY '+fy,'Each employee, each month the attendance was final: salary paid, deductions and TDS. Annexure II (the full-year salary detail) is due with Q4 — see the Annual salary sheet.',COLS);
    K.head(ws,4,['Quarter','Month','Employee','PAN','Gross salary ₹','Tea ₹','Total paid ₹','PF ₹','ESIC ₹','PT ₹','TDS ₹','Deposited'],5);
    let r=5;const st=r;q24.filter(x=>x.tds>0||x.gross>0).forEach(x=>{K.put(ws,r,1,x.q);K.put(ws,r,2,x.month);K.put(ws,r,3,x.name);K.put(ws,r,4,x.pan||'—');
      K.put(ws,r,5,R2(x.gross),'#,##0');K.put(ws,r,6,R2(x.tea),'#,##0');K.put(ws,r,7,{f:'E'+r+'+F'+r,r:R2(x.gross+x.tea)},'#,##0');K.put(ws,r,8,R2(x.pf),'#,##0');K.put(ws,r,9,R2(x.esic),'#,##0');K.put(ws,r,10,R2(x.pt),'#,##0');K.put(ws,r,11,R2(x.tds),'#,##0');K.put(ws,r,12,x.tds?(x.deposited?'Yes':'No'):'—');K.style(ws,r,COLS);
      if(x.tds&&!x.pan)ws.getCell(r,4).font={color:{argb:'FFC0392B'},size:10};r++;});
    if(r===st){K.put(ws,r,1,'No final salary months yet this year');K.style(ws,r,COLS);r++;}
    K.put(ws,r,1,'Total');['E','F','G','H','I','J','K'].forEach(c=>K.put(ws,r,c.charCodeAt(0)-64,{f:'SUM('+c+st+':'+c+(r-1)+')',r:0},'#,##0'));K.style(ws,r,COLS,'grand');ref.r24={st,end:r-1,tot:r};
    ws.columns=[{width:8},{width:10},{width:24},{width:13},{width:13},{width:9},{width:13},{width:10},{width:10},{width:9},{width:11},{width:10}];K.setup(ws,true,4);}
  {const ws=wA,COLS=9;
    K.banner(ws,'Annual salary statement — FY '+fy+' (Form 16 Part B working)','Salary paid and deductions for the year per employee. Tax is worked under the new regime with the ₹75,000 standard deduction; employees who chose the old regime need their declarations added. Part A of Form 16 comes from TRACES.',COLS);
    K.head(ws,4,['Employee','PAN','Months','Gross salary ₹','Standard deduction ₹','PT ₹','Taxable salary ₹','TDS deducted ₹','PF (employee) ₹'],3);
    const by={};q24.forEach(x=>{const b=by[x.id]||(by[x.id]={name:x.name,pan:x.pan,months:0,gross:0,pt:0,tds:0,pf:0});b.months++;b.gross+=x.gross+x.tea;b.pt+=x.pt;b.tds+=x.tds;b.pf+=x.pf;});
    let r=5;const st=r;Object.values(by).sort((a,b)=>a.name.localeCompare(b.name)).forEach(b=>{K.put(ws,r,1,b.name);K.put(ws,r,2,b.pan||'—');K.put(ws,r,3,b.months,'0');K.put(ws,r,4,Math.round(b.gross),'#,##0');
      K.put(ws,r,5,{f:'MIN(75000,D'+r+')',r:Math.min(75000,Math.round(b.gross))},'#,##0');K.put(ws,r,6,Math.round(b.pt),'#,##0');K.put(ws,r,7,{f:'MAX(0,D'+r+'-E'+r+')',r:Math.max(0,Math.round(b.gross)-75000)},'#,##0');K.put(ws,r,8,Math.round(b.tds),'#,##0');K.put(ws,r,9,Math.round(b.pf),'#,##0');K.style(ws,r,COLS);r++;});
    if(r===st){K.put(ws,r,1,'No final salary months yet this year');K.style(ws,r,COLS);r++;}
    K.put(ws,r,1,'Total');['D','E','F','G','H','I'].forEach(c=>K.put(ws,r,c.charCodeAt(0)-64,{f:'SUM('+c+st+':'+c+(r-1)+')',r:0},'#,##0'));K.style(ws,r,COLS,'grand');
    r+=2;K.note(ws,r,'Under the new regime, PT is not deductible and income up to ₹12 lakh (after the standard deduction) has no tax after the Sec 87A rebate. TDS shown is what Salary Working deducted.',COLS);
    ws.columns=[{width:24},{width:13},{width:8},{width:14},{width:14},{width:10},{width:15},{width:14},{width:14}];K.setup(ws,true,4);}
  {const W=wsS,COLS2=8;
    K.banner(W,'TDS — '+outlet+' · FY '+fy,'TAN '+(tan||'not set in Master Sheet')+'. Quarter returns due 31 Jul, 31 Oct, 31 Jan and 31 May; deposit by the 7th of the next month (30 Apr for March).',COLS2);
    K.head(W,4,['Quarter','','26Q TDS ₹','26Q not deposited ₹','24Q TDS ₹','24Q not deposited ₹','Total TDS ₹','Due date'],3);
    const due={Q1:'31 Jul',Q2:'31 Oct',Q3:'31 Jan',Q4:'31 May'};let r=5;
    const a26="'26Q (others)'!",a24="'24Q (salary)'!";
    ['Q1','Q2','Q3','Q4'].forEach(q=>{W.mergeCells(r,1,r,2);K.put(W,r,1,q);
      K.put(W,r,3,{f:'SUMIF('+a26+'A'+ref.r26.st+':A'+ref.r26.end+',"'+q+'",'+a26+'I'+ref.r26.st+':I'+ref.r26.end+')',r:R2(q26.filter(x=>x.q===q).reduce((t,x)=>t+x.tds,0))},K.NUM);
      K.put(W,r,4,R2(q26.filter(x=>x.q===q&&!x.deposited).reduce((t,x)=>t+x.tds,0)),K.CH_BAD);
      K.put(W,r,5,{f:'SUMIF('+a24+'A'+ref.r24.st+':A'+ref.r24.end+',"'+q+'",'+a24+'K'+ref.r24.st+':K'+ref.r24.end+')',r:R2(q24.filter(x=>x.q===q).reduce((t,x)=>t+x.tds,0))},K.NUM);
      K.put(W,r,6,R2(q24.filter(x=>x.q===q&&x.tds&&!x.deposited).reduce((t,x)=>t+x.tds,0)),K.CH_BAD);
      K.put(W,r,7,{f:'C'+r+'+E'+r,r:0},K.NUM);K.put(W,r,8,due[q]);K.style(W,r,COLS2);r++;});
    W.mergeCells(r,1,r,2);K.put(W,r,1,'Year');['C','D','E','F','G'].forEach(c=>K.put(W,r,c.charCodeAt(0)-64,{f:'SUM('+c+'5:'+c+(r-1)+')',r:0},K.NUM));K.style(W,r,COLS2,'grand');r+=2;
    const noPan=[...new Set([...q26.filter(x=>!x.pan).map(x=>x.party),...q24.filter(x=>x.tds&&!x.pan).map(x=>x.name)])];
    K.note(W,r,noPan.length?'PAN missing for: '+noPan.join(', ')+' — without PAN, TDS is at 20% (Sec 206AA). Add it in Vendors / Master Salary.':'PAN is available for every deductee.',COLS2);
    W.columns=[{width:10},{width:6},{width:13},{width:17},{width:13},{width:17},{width:13},{width:10}];K.setup(W,false,0);}
  return{wb,filename:'TDS_Working_'+rptFile(outlet)+'_FY'+fy+'.xlsx'};
}
// One page per employee — the annual salary statement for Form 16.
async function buildAnnualSalaryStatementsPdf(sid,salon,fy){
  const {q24}=tdsReturnRowsFor(sid,fy);const by={};
  q24.forEach(x=>{(by[x.id]=by[x.id]||{name:x.name,pan:x.pan,rows:[]}).rows.push(x);});
  const list=Object.values(by).sort((a,b)=>a.name.localeCompare(b.name));
  if(!list.length)throw new Error('No final salary months in FY '+fy+' yet.');
  const R=n=>Math.round(Number(n)||0);const rows=[];
  list.forEach((b,i)=>{if(i)rows.push([]);
    rows.push([b.name+(b.pan?' · PAN '+b.pan:' · PAN not on record'),'Gross ₹','PF ₹','ESIC ₹','PT ₹','TDS ₹']);
    b.rows.forEach(x=>rows.push([x.month,R(x.gross+x.tea),R(x.pf),R(x.esic),R(x.pt),R(x.tds)]));
    const s=k=>b.rows.reduce((t,x)=>t+(k==='gross'?x.gross+x.tea:x[k]),0);
    rows.push(['Total for the year',R(s('gross')),R(s('pf')),R(s('esic')),R(s('pt')),R(s('tds'))]);
    rows.push(['Taxable after ₹75,000 standard deduction (new regime)',Math.max(0,R(s('gross'))-75000),'','','','']);});
  return exportReportPdfBlob('Annual salary statements — FY '+fy,String(salon&&salon.name||'')+' · Form 16 Part B working',rows);
}

// ═══ Vendor balance confirmation ═══
async function buildVendorConfirmationPdf(salon,vendor,L,from,to){
  const dmy=s=>s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—';const R=n=>Math.round(Number(n)||0);
  const bal=n=>'₹'+Math.abs(R(n)).toLocaleString('en-IN')+(n>0.5?' payable to you (Cr)':n<-0.5?' advance with you (Dr)':' — nil');
  const rows=[['Date','Type','Reference','Paid ₹ (Dr)','Bill ₹ (Cr)','Balance ₹'],['','Opening balance','','','',R(L.opening)],
    ...L.rows.map(r=>[dmy(r.date),r.type,r.ref,r.debit?R(r.debit):'',r.credit?R(r.credit):'',R(r.balance)]),
    ['','Total for the period','',R(L.debit),R(L.credit),''],['','Closing balance as on '+dmy(to),'','','',R(L.closing)],[],
    ['Balance confirmation'],['As per our books the balance in your account as on '+dmy(to)+' is '+bal(L.closing)+'.'],
    ['Please confirm, or send your statement of account showing any difference, within 15 days. If we do not hear from you we will take the balance as correct.'],
    [],['For '+String(salon&&salon.name||'').split('—')[0].trim()+' — Authorised signatory'],['Confirmed / differences noted by '+(vendor.name||'vendor')+': ____________________   Date: __________']];
  return exportReportPdfBlob('Statement of account & balance confirmation',(vendor.name||'')+(vendor.gst?' · GSTIN '+String(vendor.gst).toUpperCase():'')+' · '+dmy(from)+' to '+dmy(to),rows);
}
async function shareVendorConfirmation(salon,vendor,L,from,to){
  const blob=await buildVendorConfirmationPdf(salon,vendor,L,from,to);
  const name='Balance_Confirmation_'+String(vendor.name||'Vendor').replace(/[^A-Za-z0-9]+/g,'_')+'_'+to+'.pdf';
  const file=new File([blob],name,{type:'application/pdf'});
  const dmy=to.slice(8,10)+'/'+to.slice(5,7)+'/'+to.slice(0,4);
  const msg='Dear '+(vendor.name||'Sir/Madam')+', please find our statement of account. As per our books the balance as on '+dmy+' is ₹'+Math.abs(Math.round(L.closing)).toLocaleString('en-IN')+(L.closing>0.5?' payable to you':L.closing<-0.5?' advance with you':'')+'. Kindly confirm or share your statement — '+String(salon&&salon.name||'').split('—')[0].trim();
  if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],text:msg,title:'Balance confirmation'});return'shared';}catch(e){if(e&&e.name==='AbortError')return'cancelled';}}
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);
  const phone=String(vendor.phone||vendor.mobile||'').replace(/[^0-9]/g,'');
  if(phone)window.open(waLink(phone,msg),'_blank');
  else if(vendor.email)window.open('mailto:'+encodeURIComponent(vendor.email)+'?subject='+encodeURIComponent('Balance confirmation as on '+dmy)+'&body='+encodeURIComponent(msg+'\n\n(The statement PDF is attached.)'),'_blank');
  return phone?'whatsapp':vendor.email?'email':'downloaded';
}

// ═══ Tally balance check ═══
function buildTallyBalancesRequestXml(company,fromIso,toIso){
  const d=s=>String(s||'').replace(/-/g,'');
  return '<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>SalonOS Balances</ID></HEADER>'
    +'<BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>'+(company?escapeTallyXml(company):'##SVCurrentCompany')+'</SVCURRENTCOMPANY>'
    +'<SVFROMDATE>'+d(fromIso)+'</SVFROMDATE><SVTODATE>'+d(toIso)+'</SVTODATE></STATICVARIABLES>'
    +'<TDL><TDLMESSAGE><COLLECTION NAME="SalonOS Balances" ISINITIALIZE="Yes"><TYPE>Ledger</TYPE><FETCH>NAME, PARENT, CLOSINGBALANCE</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>';
}
// Tally sends debit balances as negative numbers; returned as credit-positive {name: amount}.
function parseTallyBalances(xmlText){
  const out={};
  try{const doc=new DOMParser().parseFromString(xmlText,'text/xml');if(doc.querySelector('parsererror'))return out;
    Array.from(doc.getElementsByTagName('LEDGER')).forEach(el=>{
      const name=(el.getAttribute('NAME')||'').trim()||((el.getElementsByTagName('NAME')[0]||{}).textContent||'').trim();if(!name)return;
      const t=((el.getElementsByTagName('CLOSINGBALANCE')[0]||{}).textContent||'').trim();
      const n=parseFloat(t.replace(/[^0-9.\-]/g,''))||0;out[name]=/Dr/i.test(t)?-Math.abs(n):/Cr/i.test(t)?Math.abs(n):n;});}catch(e){}
  return out;
}
// Trial Balance exported from Tally to Excel: Particulars | Debit | Credit (closing). Credit-positive.
function parseTallyTrialBalanceRows(rows){
  const out={};
  (rows||[]).forEach(r=>{if(!Array.isArray(r)||!r.length)return;const name=String(r[0]==null?'':r[0]).trim();if(!name||/^(particulars|grand total|total)$/i.test(name))return;
    const nums=r.slice(1).map(c=>typeof c==='number'?c:parseFloat(String(c==null?'':c).replace(/[,₹\s]/g,''))).map(v=>isFinite(v)?v:null);
    const vals=nums.filter(v=>v!=null);if(!vals.length)return;
    const dr=nums.length>=2?(nums[nums.length-2]||0):0,cr=nums[nums.length-1]||0;out[name]=Math.round((cr-dr)*100)/100;});
  return out;
}
// Rows to compare, as on toIso: every vendor (payable) and the bank. [{kind,label,ledger,ours}]
function salonOsBalancesFor(sid,toIso,vendorLedgerNameFor,bankLedger){
  const inv=loadVendorInvoices(sid)||[];const vendors=(loadVendors(sid)||[]).filter(v=>v&&v.status!=='Inactive');
  const rows=vendors.map(v=>{const L=vendorLedgerFor(inv,v.id,null,toIso);return{kind:'Vendor',label:v.name,ledger:vendorLedgerNameFor(v.id),ours:L.closing};}).filter(r=>Math.abs(r.ours)>0.5||inv.some(i=>String(i.vendorId)===String((vendors.find(v=>v.name===r.label)||{}).id)));
  if(bankLedger){let bal=null;try{const br=(loadBankStatementRows(sid)||[]).filter(r=>r&&vlIso(r.transactionDate)&&vlIso(r.transactionDate)<=toIso&&Number(r.closingBalance));
      if(br.length){br.sort((a,b)=>vlIso(a.transactionDate).localeCompare(vlIso(b.transactionDate)));bal=Number(br[br.length-1].closingBalance);}}catch(e){}
    if(bal!=null&&isFinite(bal))rows.push({kind:'Bank',label:'Bank (statement balance)',ledger:bankLedger,ours:-bal});}
  return rows;
}
function TallyBalanceCheck({salonId,conn,live,vendorLedgerNameFor,bankLedger}){
  const h=React.createElement;const {toast}=useToast();
  const now=new Date();const lastEnd=new Date(now.getFullYear(),now.getMonth(),0);
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const [to,setTo]=useState(iso(lastEnd));const [tally,setTally]=useState(null);const [src,setSrc]=useState('');const [busy,setBusy]=useState(false);const fileRef=useRef(null);
  const fyStart=t=>{const y=Number(t.slice(0,4)),m=Number(t.slice(5,7));return (m>=4?y:y-1)+'-04-01';};
  const readLive=async()=>{setBusy(true);try{const b=parseTallyBalances(await tallySend(conn,buildTallyBalancesRequestXml(conn.company,fyStart(to),to)));
      if(!Object.keys(b).length)throw new Error('Tally sent no balances — check the right company is open.');setTally(b);setSrc('Tally (live) as on '+to);}catch(e){toast('Could not read balances: '+(e.message||e),'error');}setBusy(false);};
  const readFile=async f=>{try{await loadScript(CDN_XLSX_URL);const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true});
      const b=parseTallyTrialBalanceRows(rows);if(!Object.keys(b).length)throw new Error('No ledger balances found — export Trial Balance (closing, Dr/Cr columns) from Tally.');setTally(b);setSrc('Trial Balance file “'+f.name+'”');}catch(e){toast(e.message||String(e),'error');}};
  const ours=salonOsBalancesFor(salonId,to,vendorLedgerNameFor,bankLedger);
  const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
  const tKeys=tally?Object.keys(tally):[];const tBy={};tKeys.forEach(k=>{tBy[norm(k)]=k;});
  const rows=ours.map(r=>{const k=tally?tBy[norm(r.ledger)]:null;const t=k!=null?tally[k]:null;return{...r,tallyName:k,theirs:t,diff:t==null?null:Math.round((r.ours-t)*100)/100};});
  const bad=rows.filter(r=>r.diff==null||Math.abs(r.diff)>1);
  const f=n=>n==null?'—':(n<0?'−':'')+'₹'+Math.abs(Math.round(n)).toLocaleString('en-IN')+(n>0.5?' Cr':n<-0.5?' Dr':'');
  const exp=async()=>{try{await afDownloadXlsx('Tally check',[['Kind','SalonOS name','Tally ledger','SalonOS balance (Cr +)','Tally balance (Cr +)','Difference','Status'],...rows.map(r=>[r.kind,r.label,r.tallyName||r.ledger,Math.round(r.ours),r.theirs==null?'':Math.round(r.theirs),r.diff==null?'':Math.round(r.diff),r.diff==null?'Not in Tally':Math.abs(r.diff)<=1?'Matches':'Differs'])],'Tally_Balance_Check_'+to+'.xlsx');}catch(e){toast(e.message||String(e),'error');}};
  return h('div',{className:'card'},
    h('div',{className:'card-title'},'⚖ Balance check — SalonOS against Tally'),
    h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:10,lineHeight:1.6}},'Compares each vendor’s balance (bills − payments) and the bank balance in SalonOS with the same ledger in Tally, as on a date. Read Tally live through the connector, or upload Tally’s Trial Balance exported to Excel.'),
    h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end',marginBottom:12}},
      h('div',{className:'form-group',style:{marginBottom:0}},h('label',null,'As on'),h('input',{type:'date',className:'form-control',value:to,onChange:e=>{setTo(e.target.value);setTally(null);}})),
      h('button',{className:'btn btn-primary btn-sm',disabled:!live||busy,title:live?'':'Start the SalonOS Tally Connector and open Tally first',onClick:readLive},busy?'Reading…':'Read balances from Tally'),
      h('input',{type:'file',accept:'.xlsx,.xls,.csv',ref:fileRef,style:{display:'none'},onChange:e=>{const x=e.target.files[0];if(x)readFile(x);e.target.value='';}}),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>fileRef.current&&fileRef.current.click()},'⬆ Upload Trial Balance'),
      tally&&h('button',{className:'btn btn-ghost btn-sm',onClick:exp},'⬇ Excel')),
    !tally&&h('div',{className:'help-note'},ours.length+' balance'+(ours.length===1?'':'s')+' ready to compare. '+(live?'':'Tally is not connected — use the Trial Balance upload, or start the connector.')),
    tally&&h('div',null,
      h('div',{style:{fontSize:12.5,marginBottom:8}},'From ',src,' · ',h('b',{style:{color:bad.length?'var(--red)':'var(--green)'}},bad.length?bad.length+' to look at':'Everything matches'),' of ',rows.length),
      h('div',{className:'table-wrap'},h('table',null,
        h('thead',null,h('tr',null,['','SalonOS','Tally ledger','SalonOS balance','Tally balance','Difference'].map((t,i)=>h('th',{key:i,style:i>2?{textAlign:'right'}:null},t)))),
        h('tbody',null,[...rows].sort((a,b)=>(b.diff==null?1e15:Math.abs(b.diff))-(a.diff==null?1e15:Math.abs(a.diff))).map((r,i)=>h('tr',{key:i},
          h('td',null,r.kind),h('td',null,r.label),h('td',{style:{color:r.tallyName?'':'var(--red)'}},r.tallyName||r.ledger+' — not found'),
          h('td',{style:{textAlign:'right'}},f(r.ours)),h('td',{style:{textAlign:'right'}},f(r.theirs)),
          h('td',{style:{textAlign:'right',fontWeight:600,color:r.diff==null?'var(--text3)':Math.abs(r.diff)<=1?'var(--green)':'var(--red)'}},r.diff==null?'—':Math.abs(r.diff)<=1?'✓':f(r.diff)))))))));
}
