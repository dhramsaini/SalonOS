// ═══════════════════════════════════════════════════════════════════════════════════════════
// Collection Reco workbook (Collection Reco → ⬇ Collection Reco Excel) — the day-wise reco of the
// Cradlee collection report against the counter cash (Daily Sales & Exp) and the bank's Card / UPI
// settlement credits, the Bank Charges reco, and the two source sheets it is built from. Every reco
// figure is a SUMIF / SUMIFS on the Collection Sheet and Bank Statement tabs, so changing a source
// row recalculates the reco.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const CX_REASONS={prevMonth:'Previous Month Collection',creditSale:'Credit Sale',shortCollection:'Short Collection',excessCollection:'Excess Collection'};
function collectionRecoDataFor(sid,year,month){
  const pre=year+'-'+String(month+1).padStart(2,'0');
  const inMonth=d=>{const i=toISO(d);return !!i&&i.startsWith(pre);};
  let cradlee=[],bank=[],reasons={},cash={},inc={wallet:true,district:true,luzo:true,online:true};
  try{cradlee=JSON.parse(cachedLocalGet(outletKey('salonos_cradlee_collection_rows',sid))||'[]')||[];}catch(e){}
  try{bank=JSON.parse(cachedLocalGet(outletKey('salonos_bank_statement_rows',sid))||'[]')||[];}catch(e){}
  try{reasons=JSON.parse(cachedLocalGet(outletKey('salonos_collection_reason_diff',sid))||'{}')||{};}catch(e){}
  try{cash=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',sid))||'{}')||{};}catch(e){}
  try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_cs_card_include_cols',sid))||'null');if(v&&typeof v==='object')inc=v;}catch(e){}
  const exp=loadDseDataFor(sid)||{};const tipIdx=EXPENSE_ROWS.findIndex(r=>r.name==='Tip To Employee');
  const coll=cradlee.filter(r=>r&&inMonth(r.invoiceDate)).sort((a,b)=>String(toISO(a.invoiceDate)).localeCompare(String(toISO(b.invoiceDate)))||String(a.centerName||'').localeCompare(String(b.centerName||'')));
  // Bank lines: everything dated in the month, plus settlements of this month's sales credited later.
  const bk=bank.filter(r=>r&&(inMonth(r.transactionDate)||((r.nature==='Card Settlement'||r.nature==='UPI Settlement')&&inMonth(r.cradleeDate))))
    .sort((a,b)=>String(toISO(a.transactionDate)).localeCompare(String(toISO(b.transactionDate))));
  const dates=[...new Set([...coll.map(r=>r.invoiceDate),...bk.filter(r=>(r.nature==='Card Settlement'||r.nature==='UPI Settlement')&&inMonth(r.cradleeDate)).map(r=>r.cradleeDate)])]
    .sort((a,b)=>String(toISO(a)).localeCompare(String(toISO(b))));
  const days=dates.map(d=>{const iso=toISO(d);const c=cash[iso]&&cash[iso][0];const t=exp[iso]&&exp[iso][tipIdx];
    const rs=reasons[d]||reasons[iso];const r=rs&&typeof rs==='object'?rs:null;
    return{date:d,iso,counter:c!=null&&c!==''?Number(c)||0:null,tip:Number(t)||0,
      reason:r&&CX_REASONS[r.type]?CX_REASONS[r.type]:(typeof rs==='string'?'Note':''),reasonAmt:r?Number(r.amount)||0:0,
      reasonNote:r?[r.invoiceNo,r.partyName,r.reason].filter(Boolean).join(' · '):(typeof rs==='string'?rs:'')};});
  return{coll,bk,days,inc};
}
async function buildCollectionRecoWorkbook(sid,salon,year,month){
  await loadExcelJS();
  const wb=new ExcelJS.Workbook();wb.creator='SalonOS';wb.created=new Date();wb.calcProperties.fullCalcOnLoad=true;
  const lbl=RPT_MONTHS[month]+' '+year,outlet=rptShort(salon);
  const K=makeXlKit(wb,outlet+' — Collection reco '+lbl);const R2=n=>Math.round((Number(n)||0)*100)/100;const N2='#,##0.00;[Red]-#,##0.00;"–"';
  const D=collectionRecoDataFor(sid,year,month);
  if(!D.coll.length&&!D.bk.length)throw new Error('No Collection Reco or Bank Statement rows for '+lbl+'.');
  const wsS=K.sheet('Summary'),wsR=K.sheet('Collection Reco','FF2E7D32'),wsB=K.sheet('Bank Charges Reco','FFC62828'),wsC=K.sheet('Collection Sheet','FF6A1B9A'),wsK=K.sheet('Bank Statement','FF00838F');
  // ── Collection Sheet (Cradlee rows) ──
  const C={};
  {const ws=wsC,COLS=11;
    const extras=[['wallet','F'],['district','G'],['luzo','H'],['online','I']].filter(([k])=>D.inc[k]!==false);
    K.banner(ws,'Collection Sheet — Cradlee collection report · '+lbl,'Rows imported in Collection Reco for the month. “Card for reco” = Card'+(extras.length?' + '+extras.map(([k])=>k[0].toUpperCase()+k.slice(1)).join(' + '):'')+' (the channels set to settle with card in Collection Sheet).',COLS);
    K.head(ws,4,['Center name','Invoice date','Cash ₹','Card ₹','UPI ₹','Wallet ₹','District ₹','Luzo ₹','Online ₹','Total ₹','Card for reco ₹'],3);
    let r=5;C.st=r;
    D.coll.forEach(x=>{K.put(ws,r,1,x.centerName||'');K.put(ws,r,2,x.invoiceDate||'');
      ['cash','card','upi','wallet','district','luzo','online'].forEach((k,j)=>K.put(ws,r,3+j,R2(x[k]),N2));
      K.put(ws,r,10,{f:'SUM(C'+r+':I'+r+')',r:0},N2);K.put(ws,r,11,{f:'D'+r+extras.map(([,c])=>'+'+c+r).join(''),r:0},N2);K.style(ws,r,COLS);r++;});
    if(r===C.st){K.put(ws,r,1,'No collection rows for the month');K.style(ws,r,COLS);r++;}
    C.end=r-1;K.put(ws,r,1,'Total');for(let c=3;c<=11;c++){const L=String.fromCharCode(64+c);K.put(ws,r,c,{f:'SUM('+L+C.st+':'+L+C.end+')',r:0},N2);}K.style(ws,r,COLS,'grand');C.tot=r;
    ws.autoFilter={from:{row:4,column:1},to:{row:Math.max(4,C.end),column:COLS}};
    ws.columns=[{width:26},{width:12},{width:12},{width:12},{width:12},{width:11},{width:11},{width:11},{width:11},{width:13},{width:14}];K.setup(ws,true,4);}
  // ── Bank Statement ──
  const B={};
  {const ws=wsK,COLS=10;
    K.banner(ws,'Bank Statement — '+lbl,'Bank lines dated in the month, plus Card / UPI settlements of this month’s sales credited in the next days. “Date as per Cradlee” is the sale date a settlement belongs to — the reco adds credits by that date.',COLS);
    K.head(ws,4,['Transaction date','Value date','Description','Ref no.','Debit ₹','Credit ₹','Closing balance ₹','Nature','Date as per Cradlee','Vendor / linked'],5);
    let r=5;B.st=r;
    D.bk.forEach(x=>{K.put(ws,r,1,x.transactionDate||'');K.put(ws,r,2,x.valueDate||'');K.put(ws,r,3,x.description||'');K.put(ws,r,4,x.refNo||'');
      K.put(ws,r,5,R2(x.debit),N2);K.put(ws,r,6,R2(x.credit),N2);K.put(ws,r,7,R2(x.closingBalance),N2);K.put(ws,r,8,x.nature||'');K.put(ws,r,9,x.cradleeDate||'');
      K.put(ws,r,10,x.linkedInvoice?'Linked to bill':(x.vendorName||''));K.style(ws,r,COLS);ws.getCell(r,3).alignment={wrapText:true,vertical:'top'};
      if(x.nature==='Card Settlement'||x.nature==='UPI Settlement')ws.getCell(r,8).font={bold:true,color:{argb:'FF2E7D32'},size:10};r++;});
    if(r===B.st){K.put(ws,r,1,'No bank lines for the month');K.style(ws,r,COLS);r++;}
    B.end=r-1;K.put(ws,r,1,'Total');K.put(ws,r,5,{f:'SUM(E'+B.st+':E'+B.end+')',r:0},N2);K.put(ws,r,6,{f:'SUM(F'+B.st+':F'+B.end+')',r:0},N2);K.style(ws,r,COLS,'grand');B.tot=r;
    r+=2;K.put(ws,r,1,'Card settlements');K.put(ws,r,6,{f:'SUMIF(H'+B.st+':H'+B.end+',"Card Settlement",F'+B.st+':F'+B.end+')',r:0},N2);K.style(ws,r,COLS);B.card=r;r++;
    K.put(ws,r,1,'UPI settlements');K.put(ws,r,6,{f:'SUMIF(H'+B.st+':H'+B.end+',"UPI Settlement",F'+B.st+':F'+B.end+')',r:0},N2);K.style(ws,r,COLS);B.upi=r;
    ws.autoFilter={from:{row:4,column:1},to:{row:Math.max(4,B.end),column:COLS}};
    ws.columns=[{width:12},{width:12},{width:44},{width:16},{width:13},{width:13},{width:15},{width:16},{width:13},{width:18}];K.setup(ws,true,4);}
  // ── Collection Reco (day-wise) ──
  const RR={};
  {const ws=wsR,COLS=15;const cs="'Collection Sheet'!",bs="'Bank Statement'!";
    const cr=c=>cs+'$'+c+'$'+C.st+':$'+c+'$'+C.end,br=c=>bs+'$'+c+'$'+B.st+':$'+c+'$'+B.end;
    K.banner(ws,'Collection Reco — '+outlet+' · '+lbl,'Cash: counter report (Daily Sales & Exp Cash Sale) − Cradlee. Card / UPI: bank settlement credits (by Date as per Cradlee) − Cradlee. Blue cells are entries; every other figure is a formula on the Collection Sheet and Bank Statement tabs.',COLS);
    const top=ws.getRow(4);[[2,4,'CASH'],[5,7,'CARD (incl. wallet / online channels)'],[8,10,'UPI'],[11,11,''],[12,15,'EXPLAINED DIFFERENCES']].forEach(([a,b,t])=>{if(b>a)ws.mergeCells(4,a,4,b);const c=ws.getCell(4,a);c.value=t;c.font={bold:true,size:9,color:{argb:K.C.navy}};c.alignment={horizontal:'center'};for(let i=a;i<=b;i++)ws.getCell(4,i).fill=K.fill(K.C.band);});
    K.head(ws,5,['Date','As per Cradlee ₹','As per counter ₹','Difference ₹','As per Cradlee ₹','As per bank ₹','Difference ₹','As per Cradlee ₹','As per bank ₹','Difference ₹','Consolidated difference ₹','Tip to employee ₹','Reason for difference','Reason amount ₹','Detail'],2);
    let r=6;RR.st=r;const blue={color:{argb:'FF1F5FBF'}};
    D.days.forEach(d=>{K.put(ws,r,1,d.date);
      K.put(ws,r,2,{f:'SUMIF('+cr('B')+',A'+r+','+cr('C')+')',r:0},N2);
      const cc=K.put(ws,r,3,d.counter==null?null:R2(d.counter),N2);cc.font=blue;
      K.put(ws,r,4,{f:'IF(C'+r+'="",0,C'+r+'-B'+r+')',r:0},K.CH_GOOD);
      K.put(ws,r,5,{f:'SUMIF('+cr('B')+',A'+r+','+cr('K')+')',r:0},N2);
      K.put(ws,r,6,{f:'SUMIFS('+br('F')+','+br('I')+',A'+r+','+br('H')+',"Card Settlement")',r:0},N2);
      K.put(ws,r,7,{f:'F'+r+'-E'+r,r:0},K.CH_GOOD);
      K.put(ws,r,8,{f:'SUMIF('+cr('B')+',A'+r+','+cr('E')+')',r:0},N2);
      K.put(ws,r,9,{f:'SUMIFS('+br('F')+','+br('I')+',A'+r+','+br('H')+',"UPI Settlement")',r:0},N2);
      K.put(ws,r,10,{f:'I'+r+'-H'+r,r:0},K.CH_GOOD);
      K.put(ws,r,11,{f:'D'+r+'+G'+r+'+J'+r,r:0},K.CH_GOOD);
      const t=K.put(ws,r,12,d.tip?R2(d.tip):null,N2);t.font=blue;
      K.put(ws,r,13,d.reason||'');const ra=K.put(ws,r,14,d.reasonAmt?R2(d.reasonAmt):null,N2);ra.font=blue;K.put(ws,r,15,d.reasonNote||'');
      K.style(ws,r,COLS);[3,12,14].forEach(c=>{ws.getCell(r,c).font={...blue,size:10};});r++;});
    if(r===RR.st){K.put(ws,r,1,'No days');K.style(ws,r,COLS);r++;}
    RR.end=r-1;K.put(ws,r,1,'Total');[2,3,4,5,6,7,8,9,10,11,12,14].forEach(c=>{const L=String.fromCharCode(64+c);K.put(ws,r,c,{f:'SUM('+L+RR.st+':'+L+RR.end+')',r:0},c===4||c===7||c===10||c===11?K.CH_GOOD:N2);});K.style(ws,r,COLS,'grand');RR.tot=r;
    const thr=(()=>{try{const v=Number(cachedLocalGet(outletKey('salonos_cs_diff_threshold',sid)));return isNaN(v)?2:v;}catch(e){return 2;}})();
    if(RR.end>=RR.st)ws.addConditionalFormatting({ref:'K'+RR.st+':K'+RR.end,rules:[{type:'expression',priority:1,formulae:['ABS(K'+RR.st+')>(E'+RR.st+'+H'+RR.st+')*'+(thr/100)],style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:'FFFDE2E2'}},font:{color:{argb:'FFC0392B'},bold:true}}}]});
    r+=2;K.note(ws,r,'Red consolidated difference = more than '+thr+'% of that day’s card + UPI (the outlet’s limit in Collection Sheet). Positive = more received than the report shows; negative = less.',COLS);
    ws.columns=[{width:12},{width:13},{width:13},{width:12},{width:13},{width:13},{width:12},{width:13},{width:13},{width:12},{width:14},{width:12},{width:22},{width:12},{width:26}];K.setup(ws,true,5);
    ws.views=[{state:'frozen',xSplit:1,ySplit:5,showGridLines:false}];}
  // ── Bank Charges Reco ──
  const BC={};
  {const ws=wsB,COLS=3;const rc="'Collection Reco'!";const m=c=>rc+'$'+c+'$'+RR.st+':$'+c+'$'+RR.end;
    K.banner(ws,'Reco of actual bank charges — '+lbl,'Consolidated difference less every explained reason, leaving the card / UPI processing charges actually deducted by the bank.',COLS);
    K.head(ws,4,['Particulars','','Amount ₹'],3);
    const line=(r,l,f,kind)=>{K.put(ws,r,1,l);ws.mergeCells(r,1,r,2);K.put(ws,r,3,{f,r:0},K.NUM);K.style(ws,r,COLS,kind);};
    line(5,'Consolidated difference',rc+'K'+RR.tot);
    line(6,'Less: previous month collection','-SUMIF('+m('M')+',"Previous Month Collection",'+m('N')+')');
    line(7,'Less: excess collection','-SUMIF('+m('M')+',"Excess Collection",'+m('N')+')');
    line(8,'Less: tip to employee','-'+rc+'L'+RR.tot);
    line(9,'Add: credit sale','SUMIF('+m('M')+',"Credit Sale",'+m('N')+')');
    line(10,'Add: short collection','SUMIF('+m('M')+',"Short Collection",'+m('N')+')');
    line(11,'Net bank charges','SUM(C5:C10)','grand');BC.net=11;
    K.put(ws,13,1,'Card + UPI settled by bank');ws.mergeCells(13,1,13,2);K.put(ws,13,3,{f:rc+'F'+RR.tot+'+'+rc+'I'+RR.tot,r:0},K.NUM);K.style(ws,13,COLS);
    K.put(ws,14,1,'Charges as % of card + UPI sales');ws.mergeCells(14,1,14,2);K.put(ws,14,3,{f:'IF(('+rc+'E'+RR.tot+'+'+rc+'H'+RR.tot+')=0,0,-C11/('+rc+'E'+RR.tot+'+'+rc+'H'+RR.tot+'))',r:0},'0.00%');K.style(ws,14,COLS);
    K.note(ws,16,'Negative net = money the bank kept (charges / MDR). Compare the % with the rate agreed with your bank or payment provider.',COLS);
    ws.columns=[{width:36},{width:6},{width:18}];K.setup(ws,false,0);}
  // ── Summary ──
  {const W=wsS,COLS2=8,rc="'Collection Reco'!",bc="'Bank Charges Reco'!";
    const tot=k=>D.coll.reduce((s,x)=>s+(Number(x[k])||0),0);
    K.banner(W,'Collection reco — '+outlet+' · '+lbl,D.days.length+' days · '+D.coll.length+' Cradlee rows · '+D.bk.length+' bank lines. Figures link to the working sheets.',COLS2);
    K.cards(W,4,[{label:'SALES AS PER CRADLEE',f:"'Collection Sheet'!J"+C.tot,r:tot('cash')+tot('card')+tot('upi')+tot('wallet')+tot('district')+tot('luzo')+tot('online')},
      {label:'CARD + UPI SETTLED BY BANK',f:rc+'F'+RR.tot+'+'+rc+'I'+RR.tot,r:0},
      {label:'CONSOLIDATED DIFFERENCE',f:rc+'K'+RR.tot,r:0},
      {label:'NET BANK CHARGES',f:bc+'C'+BC.net,r:0,sub:{f:'TEXT('+bc+'C14,"0.00%")&" of card + UPI"',r:''}}]);
    let rr=9;K.band(W,rr,'By mode',COLS2);rr++;K.head(W,rr,['Mode','','As per Cradlee ₹','As per counter / bank ₹','Difference ₹','','',''],3);rr++;
    [['Cash','B','C','D'],['Card','E','F','G'],['UPI','H','I','J']].forEach(([l,a,b,c])=>{W.mergeCells(rr,1,rr,2);K.put(W,rr,1,l);K.put(W,rr,3,{f:rc+a+RR.tot,r:0},K.NUM);K.put(W,rr,4,{f:rc+b+RR.tot,r:0},K.NUM);K.put(W,rr,5,{f:rc+c+RR.tot,r:0},K.CH_GOOD);K.style(W,rr,COLS2);rr++;});
    W.mergeCells(rr,1,rr,2);K.put(W,rr,1,'Total');K.put(W,rr,3,{f:'SUM(C'+(rr-3)+':C'+(rr-1)+')',r:0},K.NUM);K.put(W,rr,4,{f:'SUM(D'+(rr-3)+':D'+(rr-1)+')',r:0},K.NUM);K.put(W,rr,5,{f:'SUM(E'+(rr-3)+':E'+(rr-1)+')',r:0},K.CH_GOOD);K.style(W,rr,COLS2,'grand');rr+=2;
    K.band(W,rr,'What is in this file (click to open)',COLS2);rr++;
    [['Collection Reco','Day-wise Cash / Card / UPI against counter and bank, with reasons'],['Bank Charges Reco','Consolidated difference less explained reasons = bank charges'],['Collection Sheet','Cradlee collection rows for the month'],['Bank Statement','Bank lines with Nature and Date as per Cradlee']]
      .forEach(([nm,t])=>{W.mergeCells(rr,1,rr,2);W.mergeCells(rr,3,rr,COLS2);K.link(W,rr,1,nm,"'"+nm+"'!A1");K.put(W,rr,3,t);K.style(W,rr,COLS2);W.getCell(rr,1).font={color:{argb:K.C.link},underline:true,size:10};rr++;});
    W.columns=[{width:14},{width:10},{width:16},{width:18},{width:16},{width:12},{width:14},{width:12}];K.setup(W,false,0);}
  return{wb,filename:'Collection_Reco_'+rptFile(outlet)+'_'+year+'-'+String(month+1).padStart(2,'0')+'.xlsx'};
}
function CollectionRecoExcelButton({salon,onNavTab}){
  const h=React.createElement;const {toast}=useToast();
  const t=new Date();const d=new Date(t.getFullYear(),t.getMonth()-(t.getDate()<8?1:0),1);
  const [open,setOpen]=useState(false);const [m,setM]=useState(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));const [busy,setBusy]=useState(false);
  const [blocked,setBlocked]=useState(null);
  const go=async()=>{const yy=Number(m.slice(0,4)),mm=Number(m.slice(5,7))-1;const bl=collRecoBlocked(salon.id,yy,mm);if(bl.length){setBlocked({y:yy,m:mm,label:RPT_MONTHS[mm]+' '+yy});return;}
    setBusy(true);try{const {wb,filename}=await buildCollectionRecoWorkbook(salon.id,salon,yy,mm);await xlDownload(wb,filename);toast(filename+' downloaded','success');setOpen(false);}catch(e){toast(e.message||String(e),'error');}setBusy(false);};
  return h(React.Fragment,null,
    h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},onClick:()=>setOpen(true)},'⬇ Collection Reco (Excel with formulas)'),
    open&&h('div',{className:'modal-overlay',onClick:()=>setOpen(false)},h('div',{className:'modal',style:{width:420},onClick:e=>e.stopPropagation()},
      h('div',{className:'modal-title'},'Collection Reco — Excel'),
      h('div',{className:'form-group'},h('label',null,'Month'),h('input',{type:'month',className:'form-control',value:m,onChange:e=>setM(e.target.value)})),
      h('div',{className:'help-note'},'Five sheets: Summary, Collection Reco (day-wise), Bank Charges Reco, Collection Sheet and Bank Statement — the reco figures are formulas on the two data sheets.'),
      h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:()=>setOpen(false)},'Cancel'),h('button',{className:'btn btn-primary',disabled:busy,onClick:go},busy?'Building…':'⬇ Download')))),
    blocked&&h(UnmappedCreditsPopup,{sid:salon.id,year:blocked.y,month:blocked.m,monthLabel:blocked.label,onClose:()=>setBlocked(null),onNavTab:onNavTab?(t=>{setOpen(false);onNavTab(t);}):null}));
}

// ── Unmapped bank lines ──
// Every unmapped bank line of a month, debit and credit (rows = Bank Statement's own list when it
// is open, else read from storage).
//  Credit: no Nature, or a card / UPI settlement without a Date as per Cradlee.
//  Debit:  no Nature, or a Vendor Payment with no vendor (chosen or matched) and no linked bill.
function bankRowsFor(sid){try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_bank_statement_rows',sid))||'[]');return Array.isArray(v)?v:[];}catch(e){return[];}}
function bankLineProblem(r,vendors){
  const nat=String(r.nature||'').trim();const credit=Number(r.credit)>0;
  if(nat==='Split'||(Array.isArray(r.splits)&&r.splits.length))return bankRowSplits(r)?'':'Split incomplete';
  if(!nat)return'No Nature';
  if(credit&&(nat==='Card Settlement'||nat==='UPI Settlement')&&!String(r.cradleeDate||'').trim())return'No Date as per Cradlee';
  if(!credit&&nat==='Vendor Payment'&&!r.linkedInvoice){const ov=r.vendorOverride;
    const has=ov&&ov!=='__none__'?true:(ov==='__none__'?false:!!findVendorMatch(r.description,vendors));if(!has)return'No vendor';}
  return'';
}
function unmappedBankLinesFor(sid,year,month,rows){
  const pre=year+'-'+String(month+1).padStart(2,'0');const vendors=loadVendors(sid)||[];
  return(rows||bankRowsFor(sid)).filter(r=>r&&String(toISO(r.transactionDate)||'').startsWith(pre)&&(Number(r.credit)>0||Number(r.debit)>0)).map(r=>{
    const problem=bankLineProblem(r,vendors);const credit=Number(r.credit)>0;
    return problem?{id:r.id,date:r.transactionDate,description:r.description||'',credit:credit?Number(r.credit)||0:0,debit:credit?0:Number(r.debit)||0,side:credit?'Credit':'Debit',nature:String(r.nature||'').trim(),cradleeDate:r.cradleeDate||'',vendorOverride:r.vendorOverride||'',problem}:null;}).filter(Boolean);
}
function unmappedBankCreditsFor(sid,year,month,rows){return unmappedBankLinesFor(sid,year,month,rows).filter(x=>x.side==='Credit');}
function collRecoBlocked(sid,year,month,rows){return controlOn('collRecoNeedsMapping',sid)?unmappedBankCreditsFor(sid,year,month,rows):[];}
function monthFinalBlockedLines(sid,year,month,rows){return controlOn('monthFinalNeedsMapping',sid)?unmappedBankLinesFor(sid,year,month,rows):[];}
// Writes a mapping straight to storage (used when Bank Statement is not the open screen).
function saveBankLineMapping(sid,id,patch){
  const rows=bankRowsFor(sid);if(!rows.some(r=>r.id===id))return;
  safeLocalSet(outletKey('salonos_bank_statement_rows',sid),JSON.stringify(rows.map(r=>r.id===id?{...r,...patch}:r)));
}
const BANK_MAP_NATURES=['Collection','Cash Deposit','Card Settlement','UPI Settlement','Swiggy Settlement','Zomato Settlement','EazyDiner Settlement','Ownly Settlement','Eatby Minutes Settlement','Bank Charges','Interest','Vendor Payment','Salary','Incentive','Daily Incentive','Advance Salary','TDS','GST','PF Payment','ESIC Payment','PT Payment','Electricity Expenses','Drycleaning Expenses','Telephone & Internet Expenses','DG Rent','Royalty','Rent','Tax Payment','Transfer','Refund','Other'];
const BANK_CREDIT_NATURES=new Set(['Collection','Cash Deposit','Card Settlement','UPI Settlement','Swiggy Settlement','Zomato Settlement','EazyDiner Settlement','Ownly Settlement','Eatby Minutes Settlement','Interest','Transfer','Refund','Other']);
// Links a bank debit to vendor bills the same way Bank Statement's 🔗 Link does: a payment on each
// bill (linkId bank-<row id>) and the bill keys on the bank line. allocations = [{id, amount}].
// Returns '' when done, else the reason it was not linked.
function linkBankLineToBills(sid,row,vendor,allocations,onMap){
  const al=(allocations||[]).filter(a=>Number(a.amount)>0);
  if(!al.length)return'Enter an amount for at least one bill.';
  const bal=inv=>(Number(inv.amount)||0)-(inv.payments||[]).reduce((t,x)=>t+(Number(x.paidAmount)||0),0);
  const tot=al.reduce((t,a)=>t+Number(a.amount),0),deb=Number(row.debit)||0;
  if(tot>deb+1)return'₹'+Math.round(tot).toLocaleString('en-IN')+' is more than this bank debit (₹'+deb.toLocaleString('en-IN')+').';
  const fresh=loadVendorInvoices(sid)||[];
  const over=fresh.find(inv=>{const a=al.find(x=>x.id===inv.id);return a&&Number(a.amount)+(Number(a.tds)||0)>bal(inv)+1;});
  if(over)return'Bill '+(over.invoiceNo||over.id)+' would get more than its balance (₹'+Math.round(bal(over)).toLocaleString('en-IN')+').';
  const blocked=fresh.filter(inv=>al.some(a=>a.id===inv.id)&&invoiceNeedsApproval(inv,sid));
  if(blocked.length)return'Not approved yet: '+blocked.map(i=>i.invoiceNo||i.id).join(', ')+' — a Super Admin has to approve these bills first.';
  const linkId='bank-'+row.id,paidDate=toISO(row.transactionDate);
  for(const inv of fresh){const a=al.find(x=>x.id===inv.id);
    if(a&&!confirmNoDuplicatePayment(inv,{...inv,payments:[...(inv.payments||[]),{id:'__new',paidAmount:Number(a.amount),paidDate,mode:'Bank Transfer'}]}))return'Cancelled.';}
  const keys=[];
  const updated=fresh.map(inv=>{const a=al.find(x=>x.id===inv.id);if(!a)return inv;keys.push(invoiceKeyFor(inv));
    const pays=[{paidAmount:Number(a.amount),paidDate,mode:'Bank Transfer',ref:row.refNo||'',note:'Auto-linked from Bank Statement'+(al.length>1?' (split payment)':''),linkId}];
    // TDS deducted on this bill when it was paid (bank amount = bill − TDS) — kept with the same link so Undo removes both.
    if(Number(a.tds)>0)pays.push({paidAmount:Math.round(Number(a.tds)*100)/100,paidDate,mode:'TDS',ref:'',note:'TDS deducted at source — paid with bank transfer of '+(row.transactionDate||''),linkId});
    return{...inv,payments:[...(inv.payments||[]),...pays]};});
  saveVendorInvoices(updated,sid);
  const patch={linkedInvoice:keys.join(','),nature:'Vendor Payment',vendorOverride:vendor.name};
  if(onMap)onMap(row.id,patch);else saveBankLineMapping(sid,row.id,patch);
  try{logAuditEvent(sid,{entity:'Bank Statement',entityId:String(row.id),action:'Linked to bills',summary:'₹'+Math.round(tot).toLocaleString('en-IN')+' of '+(row.transactionDate||'')+' linked to '+vendor.name+' — '+al.length+' bill(s)'});}catch(e){}
  return'';
}
// Vendor bill entered from a bank debit (bill came late / was never entered). Same checks as
// Bank Statement's "add invoice": month lock, duplicate number, approval limit. Saved unpaid — the
// caller links it. form = {invoiceNo, invoiceDate (yyyy-mm-dd), amount, category, gstRate}.
const BANK_BILL_CATEGORIES=['Purchase of Cosmetic','Housekeeping','Equipment','Utilities','Rent','DG Rent','Drycleaning Expenses','Professional Fee','Staff Room Rent','Royalty','Electricity Expenses','Uniform Expenses','Telephone & Internet Expenses','Maintenance Expenses','Marketing','Other'];
function createBillForBankLine(sid,vendor,row,form){
  const no=String(form.invoiceNo||'').trim(),amt=Math.round((Number(form.amount)||0)*100)/100;
  if(!no)return{error:'Enter the bill number.'};
  if(!(amt>0))return{error:'Enter the bill amount.'};
  if(!form.category)return{error:'Choose the category (it decides the P&L line).'};
  const dmy=form.invoiceDate?form.invoiceDate.split('-').reverse().join('/'):row.transactionDate;
  if(!canBookInvoiceInMonth(invoiceBookMonthOf({invoiceDate:dmy})))return{error:invoiceMonthBlockMessage()};
  const fresh=loadVendorInvoices(sid)||[];
  const dup=controlOn('dupInvoice',sid)&&duplicateVendorInvoice(fresh,vendor.id,no,'Tax Invoice',null);
  if(dup)return{error:duplicateInvoiceMessage(dup,vendor.name)};
  if(!invoiceApprovalOk(sid,vendor.id,vendor.name,no,amt,null))return{error:'Sent for approval — create it again once approved.'};
  const r=Number(form.gstRate)||0,R2=n=>Math.round(n*100)/100;
  const taxable=r?R2(amt/(1+r/100)):amt,tax=R2(amt-taxable),inter=gstSupplyTypeFor(sid,vendor.gst)==='inter';
  const inv={id:nextPrefixedId(fresh,'VI-',4),vendorId:vendor.id,invoiceNo:no,invoiceDate:dmy,bookingDate:dmy,dueDate:'',amount:amt,docNature:'Tax Invoice',
    desc:'Added from Bank Statement',attachment:null,taxable:r?taxable:'',igst:r&&inter?tax:'',cgst:r&&!inter?R2(tax/2):'',sgst:r&&!inter?R2(tax-R2(tax/2)):'',roundOff:'',freight:'',linkedPI:'',category:form.category,assetLines:[],payments:[]};
  saveVendorInvoices([...fresh,inv],sid);
  try{logAuditEvent(sid,{entity:'Vendor bill',entityId:inv.id,action:'Added',summary:'Bill '+no+' of '+vendor.name+' for ₹'+amt.toLocaleString('en-IN')+' added from a bank debit of '+(row.transactionDate||'')});}catch(e){}
  return{inv};
}
// Settles salary / incentive of one or more employees from a bank debit — the same as Bank
// Statement's "Settle Pay": Salary / Incentive Working payment status becomes Paid when the amount
// covers the net, and the settlement is kept on the bank line. lines = [{employeeId, employeeName,
// salaryAmt, incentiveAmt}]. Returns '' when done, else the reason.
// Daily incentive of an employee / month / head already settled on bank lines (other than skipId).
function dailyIncentiveSettledOnBank(sid,employeeId,year,month,cat,skipId,rows){
  return(rows||bankRowsFor(sid)).filter(r=>r&&r.id!==skipId&&Array.isArray(r.linkedEmployeePay)).reduce((t,r)=>t+r.linkedEmployeePay
    .filter(x=>String(x.employeeId)===String(employeeId)&&x.year===year&&x.month===month).reduce((u,x)=>u+(Number((x.dailyIncentiveByCat||{})[cat])||0),0),0);
}
function settleBankLineToEmployees(sid,row,year,month,lines,onMap){
  const diSum=l=>Object.values(l.dailyIncentiveByCat||{}).reduce((t,v)=>t+(Number(v)||0),0);
  const act=(lines||[]).filter(l=>(Number(l.salaryAmt)||0)+(Number(l.incentiveAmt)||0)+diSum(l)>0);
  if(!act.length)return'Tick salary, incentive or a daily incentive head for at least one employee, with an amount.';
  const tot=act.reduce((t,l)=>t+(Number(l.salaryAmt)||0)+(Number(l.incentiveAmt)||0)+diSum(l),0),deb=Number(row.debit)||0;
  if(tot>deb+1)return'₹'+Math.round(tot).toLocaleString('en-IN')+' is more than this bank debit (₹'+deb.toLocaleString('en-IN')+').';
  if((monthLockRecordFor(sid,year,month)||{}).locked)return RPT_MONTHS[month]+' '+year+' is locked — unlock it to record salary payments.';
  const settlements=act.map(l=>{const sa=Number(l.salaryAmt)||0,ia=Number(l.incentiveAmt)||0;
    const di={};Object.entries(l.dailyIncentiveByCat||{}).forEach(([c,v])=>{if(Number(v)>0)di[c]=Number(v);});
    const r=settleEmployeePayFor(sid,l.employeeId,year,month,{salaryAmt:sa,incentiveAmt:ia,dailyIncentiveByCat:di});
    return{employeeId:l.employeeId,employeeName:l.employeeName,year,month,salary:sa,incentive:ia,dailyIncentive:Object.values(di).reduce((t,v)=>t+v,0),dailyIncentiveByCat:di,
      salarySettled:r.salarySettled,incentiveSettled:r.incentiveSettled,dailyIncentiveSettled:r.dailyIncentiveSettled};});
  const has=k=>settlements.some(x=>x[k]>0);
  const patch={nature:has('salary')?'Salary':has('incentive')?'Incentive':'Daily Incentive',linkedEmployeePay:settlements};
  if(settlements.length===1)patch.vendorOverride='EMP:'+settlements[0].employeeId;
  if(onMap)onMap(row.id,patch);else saveBankLineMapping(sid,row.id,patch);
  try{logAuditEvent(sid,{entity:'Bank Statement',entityId:String(row.id),action:'Salary settled',summary:'₹'+Math.round(tot).toLocaleString('en-IN')+' of '+(row.transactionDate||'')+' — '+settlements.map(x=>x.employeeName).join(', ')+' ('+RPT_MONTHS[month]+' '+year+')'});}catch(e){}
  return'';
}
// Advance(s) paid by a bank debit — the same as Bank Statement's "Record Advance": a new Active,
// Bank Transfer advance per employee (or an advance already on the Advances sheet linked to this
// transfer), kept on the bank line. Honours the outlet's advance limit (block or warn).
// lines = [{employeeId, employeeName, amount, deductFrom, deductionStart, reason, linkExistingId}]
function advanceCandidatesForEmp(sid,empName){return(loadAdvances(sid)||[]).filter(a=>a&&a.emp===empName&&!a.bankRowId&&(a.status==='Active'||a.status==='Pending Approval'));}
function recordBankLineAdvances(sid,row,lines,onMap,opts){
  const adv=loadAdvances(sid)||[];
  const use=(lines||[]).filter(l=>l.linkExistingId||Number(l.amount)>0);
  if(!use.length)return'Enter an amount (or pick an existing advance) for at least one employee.';
  const amtOf=l=>{if(l.linkExistingId){const a=adv.find(x=>x.id===l.linkExistingId);return a?Number(a.outstanding!=null?a.outstanding:a.amount)||0:0;}return Number(l.amount)||0;};
  const tot=use.reduce((t,l)=>t+amtOf(l),0),deb=Number(row.debit)||0;
  if(tot>deb+1)return'₹'+Math.round(tot).toLocaleString('en-IN')+' is more than this bank debit (₹'+deb.toLocaleString('en-IN')+').';
  const warn=use.filter(l=>!l.linkExistingId).map(l=>advanceLimitMessage(sid,l.employeeName,Number(l.amount)||0)).filter(Boolean);
  if(warn.length&&!(opts&&opts.limitReviewed)){if(outletSettings(sid).advBlock)return warn.join(' ')+' (the outlet blocks advances above the limit).';if(!window.confirm(warn.join('\n\n')+'\n\nRecord anyway?'))return'Cancelled.';}
  let n=Math.max(0,...adv.map(a=>Number(String(a.id||'').replace(/\D/g,''))||0));
  const updated=[...adv],fresh=[],created=[];
  use.forEach(l=>{
    if(l.linkExistingId){const i=updated.findIndex(a=>a.id===l.linkExistingId);if(i<0)return;const ex=updated[i];
      updated[i]={...ex,mode:'Bank Transfer',bankRef:row.refNo||ex.bankRef,bankRowId:row.id,date:toISO(row.transactionDate)||ex.date,status:ex.status==='Pending Approval'?'Active':ex.status};
      created.push({advanceId:ex.id,employeeId:l.employeeId,employeeName:l.employeeName,amount:amtOf(l),wasExisting:true});return;}
    n+=1;const amount=Number(l.amount)||0;
    const rec={id:'A'+String(n).padStart(3,'0'),emp:l.employeeName,date:toISO(row.transactionDate),amount,reason:l.reason||'Advance — Bank Statement',approvedBy:'',repayment:0,
      mode:'Bank Transfer',bankRef:row.refNo||'',deductFrom:l.deductFrom||'Salary',deductionStart:l.deductionStart||'',schedule:[],outstanding:amount,status:'Active',source:'bank',bankRowId:row.id};
    fresh.push(rec);created.push({advanceId:rec.id,employeeId:l.employeeId,employeeName:l.employeeName,amount,wasExisting:false});});
  if(!created.length)return'Nothing to record.';
  saveAdvances([...updated,...fresh],sid);
  const patch={nature:'Advance Salary',linkedAdvance:created};if(created.length===1)patch.vendorOverride='EMP:'+created[0].employeeId;
  if(onMap)onMap(row.id,patch);else saveBankLineMapping(sid,row.id,patch);
  try{logAuditEvent(sid,{entity:'Bank Statement',entityId:String(row.id),action:'Advance recorded',summary:'₹'+Math.round(tot).toLocaleString('en-IN')+' of '+(row.transactionDate||'')+' — '+created.map(c=>c.employeeName+' '+(c.wasExisting?c.advanceId+' (linked)':c.advanceId)).join(', ')});}catch(e){}
  return'';
}
// Plan for linking many bank debits to vendor bills at once. Per line: its vendor (chosen or named
// in the narration), then the one unpaid bill whose balance equals the debit; with split on, else the
// oldest bills until the debit is used up. Balances are reduced as the plan goes, so two debits never
// claim the same bill. [{x, vendor, allocations:[{id,invoiceNo,amount}], reason}]
function planBulkBillLinks(sid,lines,split){
  const vendors=loadVendors(sid)||[];const inv=(loadVendorInvoices(sid)||[]).filter(i=>i&&i.docNature!=='Performa Invoice');
  const left={};inv.forEach(i=>{left[i.id]=Math.round(((Number(i.amount)||0)-(i.payments||[]).reduce((t,q)=>t+(Number(q.paidAmount)||0),0))*100)/100;});
  const dateOf=i=>String(toISO(i.bookingDate||i.invoiceDate)||'');
  return(lines||[]).map(x=>{
    if(x.side!=='Debit')return{x,reason:'Credit line'};
    const ov=x.vendorOverride;const v=ov&&ov!=='__none__'?vendors.find(z=>z.name===ov):(ov==='__none__'?null:findVendorMatch(x.description,vendors));
    if(!v)return{x,reason:'No vendor — choose one for this line first'};
    const open=inv.filter(i=>String(i.vendorId)===String(v.id)&&left[i.id]>0.5).sort((a,b)=>dateOf(a).localeCompare(dateOf(b)));
    if(!open.length)return{x,vendor:v,reason:'No unpaid bills of '+v.name};
    const exact=open.filter(i=>Math.abs(left[i.id]-x.debit)<=1);
    if(exact.length===1){const lb=left[exact[0].id];left[exact[0].id]=0;return{x,vendor:v,allocations:[{id:exact[0].id,invoiceNo:exact[0].invoiceNo||exact[0].id,amount:Math.round(Math.min(x.debit,lb)*100)/100}]};}
    if(exact.length>1&&!split)return{x,vendor:v,reason:exact.length+' bills of the same amount — link this one by hand'};
    if(!split)return{x,vendor:v,reason:'No bill of exactly '+'₹'+Math.round(x.debit).toLocaleString('en-IN')+' (tick “split across oldest bills” to allow)'};
    const tot=open.reduce((t,i)=>t+left[i.id],0);
    if(tot+1<x.debit)return{x,vendor:v,reason:'Unpaid bills total only ₹'+Math.round(tot).toLocaleString('en-IN')+' — add the missing bill (+ New bill) first'};
    let rem=x.debit;const al=[];
    open.forEach(i=>{if(rem<=0.005)return;const a=Math.round(Math.min(left[i.id],rem)*100)/100;if(a>0){al.push({id:i.id,invoiceNo:i.invoiceNo||i.id,amount:a});left[i.id]=Math.round((left[i.id]-a)*100)/100;rem=Math.round((rem-a)*100)/100;}});
    return{x,vendor:v,allocations:al};});
}
// Employee for a bank narration: the name, else their bank account number (last 6+ digits) or mobile.
function findEmployeeByBank(desc,emps){
  const digits=String(desc||'').replace(/[^0-9]/g,' ').split(/\s+/).filter(d=>d.length>=6);if(!digits.length)return null;
  const hits=(emps||[]).filter(e=>{const ac=String(e.accountNo||'').replace(/[^0-9]/g,'');const mo=String(e.mobile||e.phone||'').replace(/[^0-9]/g,'').slice(-10);
    return (ac.length>=6&&digits.some(t=>t===ac||(t.length>=6&&(ac.endsWith(t)||t.endsWith(ac.slice(-6))))))||(mo.length===10&&digits.some(t=>t.endsWith(mo)));});
  return hits.length===1?hits[0]:null;
}
function findEmployeeSmart(desc,emps){return findEmployeeMatch(desc,emps)||findEmployeeByBank(desc,emps);}
// Plan for settling many bank debits against employees at once. Per line: the employee named in
// the narration, the month (forced, else the month before when paid on or before the 15th), and what
// the amount matches exactly — salary due, incentive due, both together, or all daily incentive due.
// Nothing is guessed: any other amount is skipped. Items already planned are not used twice.
// [{x, emp, year, month, salaryAmt, incentiveAmt, dailyIncentiveByCat, what, reason}]
function planBulkEmployeePay(sid,lines,forceYM,rows){
  const used={};const R=n=>Math.round((Number(n)||0)*100)/100;
  return(lines||[]).map(x=>{
    if(x.side!=='Debit')return{x,reason:'Credit line'};
    let y,m;if(forceYM){y=forceYM.year;m=forceYM.month;}else{const iso=toISO(x.date);const d=iso?new Date(iso+'T00:00:00'):null;if(!d)return{x,reason:'No bank date'};
      const p=d.getDate()<=15?new Date(d.getFullYear(),d.getMonth()-1,1):new Date(d.getFullYear(),d.getMonth(),1);y=p.getFullYear();m=p.getMonth();}
    const emps=(getEmployeesForMonth(y,m,sid)||[]).filter(e=>e&&e.status!=='Inactive');
    const e=findEmployeeSmart(x.description,emps);
    if(!e)return{x,year:y,month:m,reason:'No employee named in the narration — use 👤 Pay employees on this line'};
    const k=e.id+'|'+y+'|'+m;const u=used[k]||(used[k]={sal:false,inc:false,di:false});
    const sal=u.sal?0:R(employeeSalaryOutstandingFor(sid,e.id,y,m)),inc=u.inc?0:R(employeeIncentiveOutstandingFor(sid,e.id,y,m));
    const di={};if(!u.di)DAILY_INCENTIVE_CATEGORIES_ALL.forEach(c=>{const os=R(employeeDailyIncentiveCategoryOutstandingFor(sid,e.id,y,m,c)-dailyIncentiveSettledOnBank(sid,e.id,y,m,c,x.id,rows));if(os>0.5)di[c]=os;});
    const diTot=R(Object.values(di).reduce((t,v)=>t+v,0)),near=(a,b)=>b>0&&Math.abs(a-b)<=1;
    const base={x,emp:e,year:y,month:m,salaryAmt:0,incentiveAmt:0,dailyIncentiveByCat:{}};
    if(near(x.debit,sal)){u.sal=true;return{...base,salaryAmt:sal,what:'Salary'};}
    if(near(x.debit,inc)){u.inc=true;return{...base,incentiveAmt:inc,what:'Incentive'};}
    if(sal>0&&inc>0&&near(x.debit,sal+inc)){u.sal=u.inc=true;return{...base,salaryAmt:sal,incentiveAmt:inc,what:'Salary + incentive'};}
    if(near(x.debit,diTot)){u.di=true;return{...base,dailyIncentiveByCat:di,what:'Daily incentive'};}
    const due=[sal?'salary ₹'+Math.round(sal).toLocaleString('en-IN'):'',inc?'incentive ₹'+Math.round(inc).toLocaleString('en-IN'):'',diTot?'daily incentive ₹'+Math.round(diTot).toLocaleString('en-IN'):''].filter(Boolean).join(', ');
    return{x,emp:e,year:y,month:m,reason:due?'Amount matches nothing due ('+due+') — use 👤 Pay employees on this line':'Nothing due for '+RPT_MONTHS[m]+' '+y};});
}
// Plan for recording many bank debits as advances at once. Per line: the employee named in the
// narration; an advance already on the Advances sheet (not tied to a bank payment) of the same amount
// is linked, else a new advance of the debit amount is planned (recover from deductFrom, starting the
// month after the payment). The outlet's advance limit is checked counting the batch itself.
// [{x, emp, line, linked, over, reason}]
function planBulkAdvances(sid,lines,deductFrom){
  const t=new Date();const emps=(getEmployeesForMonth(t.getFullYear(),t.getMonth(),sid)||[]).filter(e=>e&&e.status!=='Inactive');
  const takenIds=new Set(),batch={};const block=!!outletSettings(sid).advBlock;
  return(lines||[]).map(x=>{
    if(x.side!=='Debit')return{x,reason:'Credit line'};
    const e=findEmployeeSmart(x.description,emps);
    if(!e)return{x,reason:'No employee named in the narration — use 💵 Advance on this line'};
    const cand=advanceCandidatesForEmp(sid,e.name).filter(a=>!takenIds.has(a.id)&&Math.abs((Number(a.outstanding!=null?a.outstanding:a.amount)||0)-x.debit)<=1);
    if(cand.length===1){takenIds.add(cand[0].id);return{x,emp:e,linked:cand[0].id,line:{employeeId:e.id,employeeName:e.name,linkExistingId:cand[0].id}};}
    const iso=toISO(x.date);const d=iso?new Date(iso+'T00:00:00'):new Date();const nx=new Date(d.getFullYear(),d.getMonth()+1,1);
    const ym=nx.getFullYear()+'-'+String(nx.getMonth()+1).padStart(2,'0');
    const before=batch[e.name]||0;batch[e.name]=before+x.debit;
    const msg=advanceLimitMessage(sid,e.name,before+x.debit);
    if(msg&&block)return{x,emp:e,reason:'Over the advance limit (the outlet blocks it): '+msg};
    return{x,emp:e,over:msg||'',line:{employeeId:e.id,employeeName:e.name,amount:String(x.debit),deductFrom:deductFrom||'Salary',deductionStart:ym,reason:'Advance — Bank Statement'}};});
}
// ── Undo for mappings made in the pop-up ──
// A journal per outlet, kept while the app is open: each bank line mapped from the pop-up, with its
// fields as they were before (the earliest state if it was changed several times), bills created for
// it, and the Advances sheet as it was before an advance was recorded.
const BANK_MAP_FIELDS=['nature','vendorOverride','cradleeDate','linkedInvoice','linkedEmployeePay','linkedAdvance','aiTagged','natureLearned','splits'];
// The pop-up itself (UnmappedLinesPopup) is in js/32-bank-mapper.js.
// Collection Reco: credits only.
function UnmappedCreditsPopup({sid,year,month,monthLabel,onClose,onNavTab,onMapped}){
  return React.createElement(UnmappedLinesPopup,{sid,getList:()=>collRecoBlocked(sid,year,month),onClose,onNavTab,onMapped,month:{year,month},
    title:'⚠ Map every bank credit before the Collection Reco',
    intro:'These credit lines in the bank statement for '+monthLabel+' are not mapped. Map each one below (or in Bank Statement), then the Collection Reco opens.'});
}
// Opens the pop-up from anywhere (no component state needed).
function showUnmappedLinesPopup(sid,getList,title,intro,onNavTab,month,startView){
  const el=document.createElement('div');document.body.appendChild(el);const root=ReactDOM.createRoot(el);
  const close=()=>{root.unmount();el.remove();};
  root.render(React.createElement(UnmappedLinesPopup,{sid,getList,title,intro,onClose:close,onNavTab,month,startView}));
}
// Month Final check: true when the month may be finalised; otherwise shows the pop-up.
function monthFinalMappingOk(sid,year,month,onNavTab){
  const bl=monthFinalBlockedLines(sid,year,month);
  if(bl.length){const dr=bl.filter(x=>x.side==='Debit').length,cr=bl.length-dr;
    showUnmappedLinesPopup(sid,()=>monthFinalBlockedLines(sid,year,month),'⚠ Map every bank line before marking the month Final',
      RPT_MONTHS[month]+' '+year+' cannot be marked Final yet: '+bl.length+' bank line'+(bl.length===1?'':'s')+' are not mapped ('+dr+' debit, '+cr+' credit). Map them below, then mark Final again.',onNavTab,{year,month});
    return false;}
  // Controls → second-person review: every mapped line checked before Final
  if(controlOn('mapReview',sid)){const pr=bankReviewProgress(sid,year,month);
    if(pr.pending.length){showUnmappedLinesPopup(sid,()=>monthFinalBlockedLines(sid,year,month),'⚠ Check every mapped bank line before marking the month Final',
      RPT_MONTHS[month]+' '+year+' cannot be marked Final yet: '+pr.pending.length+' of '+pr.total+' mapped bank line'+(pr.total===1?' is':'s are')+' not checked by a second person. Check them in 🔍 Review below, then mark Final again.',onNavTab,{year,month},'review');
      return false;}}
  return true;
}
// Bank Statement strip: months with unmapped lines, each opens the list (mapped through the screen's own rows).
function UnmappedMonthsStrip({salonId,rows,onMap,onInvoicesChanged}){
  const h=React.createElement;const [open,setOpen]=useState(null);
  if(salonId==null)return null;
  const all=rows||bankRowsFor(salonId);
  const months=[...new Set(all.map(r=>String(toISO(r&&r.transactionDate)||'').slice(0,7)).filter(x=>x.length===7))].sort().reverse().slice(0,6);
  const items=months.map(ym=>({ym,y:Number(ym.slice(0,4)),m:Number(ym.slice(5,7))-1})).map(x=>({...x,list:unmappedBankLinesFor(salonId,x.y,x.m,all)})).filter(x=>x.list.length);
  if(!months.length&&!open)return null;
  return h('div',{style:{background:items.length?'rgba(224,165,48,0.1)':'var(--bg3)',border:'1px solid '+(items.length?'rgba(224,165,48,0.4)':'var(--border)'),borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,fontSize:12.5,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
    h('span',null,items.length?'🧩 Unmapped bank lines:':'✓ All bank lines mapped'),
    items.map(x=>{const dr=x.list.filter(l=>l.side==='Debit').length;return h('button',{key:x.ym,className:'btn btn-ghost btn-sm',onClick:()=>setOpen(x)},RPT_MONTHS[x.m].slice(0,3)+' '+x.y+' — '+dr+' debit, '+(x.list.length-dr)+' credit');}),
    months.length>0&&h('select',{className:'form-control',style:{width:'auto',padding:'3px 6px',fontSize:12,marginLeft:'auto'},value:'',title:'Check mapped lines (second-person review) and unusual mappings of a month',
      onChange:e=>{const ym=e.target.value;if(!ym)return;setOpen({ym,y:Number(ym.slice(0,4)),m:Number(ym.slice(5,7))-1,view:'review'});}},
      h('option',{value:''},'🔍 Review / exceptions…'),months.map(ym=>h('option',{key:ym,value:ym},RPT_MONTHS[Number(ym.slice(5,7))-1]+' '+ym.slice(0,4)))),
    open&&h(UnmappedLinesPopup,{sid:salonId,getList:()=>unmappedBankLinesFor(salonId,open.y,open.m,all),getRows:()=>all,onMap,onInvoicesChanged,month:{year:open.y,month:open.m},startView:open.view,
      title:(open.view?'Bank mapping review — ':'Unmapped bank lines — ')+RPT_MONTHS[open.m]+' '+open.y,
      intro:'Map each line below — a Nature, the vendor for a vendor payment, the Date as per Cradlee for a card / UPI settlement. The month cannot be marked Final, nor its Collection Reco made, until they are mapped.',
      onClose:()=>setOpen(null),onNavTab:null}));
}
