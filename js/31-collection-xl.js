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
  const over=fresh.find(inv=>{const a=al.find(x=>x.id===inv.id);return a&&Number(a.amount)>bal(inv)+1;});
  if(over)return'Bill '+(over.invoiceNo||over.id)+' would get more than its balance (₹'+Math.round(bal(over)).toLocaleString('en-IN')+').';
  const blocked=fresh.filter(inv=>al.some(a=>a.id===inv.id)&&invoiceNeedsApproval(inv,sid));
  if(blocked.length)return'Not approved yet: '+blocked.map(i=>i.invoiceNo||i.id).join(', ')+' — a Super Admin has to approve these bills first.';
  const linkId='bank-'+row.id,paidDate=toISO(row.transactionDate);
  for(const inv of fresh){const a=al.find(x=>x.id===inv.id);
    if(a&&!confirmNoDuplicatePayment(inv,{...inv,payments:[...(inv.payments||[]),{id:'__new',paidAmount:Number(a.amount),paidDate,mode:'Bank Transfer'}]}))return'Cancelled.';}
  const keys=[];
  const updated=fresh.map(inv=>{const a=al.find(x=>x.id===inv.id);if(!a)return inv;keys.push(invoiceKeyFor(inv));
    return{...inv,payments:[...(inv.payments||[]),{paidAmount:Number(a.amount),paidDate,mode:'Bank Transfer',ref:row.refNo||'',note:'Auto-linked from Bank Statement'+(al.length>1?' (split payment)':''),linkId}]};});
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
    const e=findEmployeeMatch(x.description,emps);
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
    const e=findEmployeeMatch(x.description,emps);
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
const BANK_MAP_FIELDS=['nature','vendorOverride','cradleeDate','linkedInvoice','linkedEmployeePay','linkedAdvance','aiTagged','natureLearned'];
function bankMapJournal(sid){const j=window.__bankMapJournal||(window.__bankMapJournal={});return j[sid]||(j[sid]=[]);}
function journalBankMapping(sid,row,label,extra){
  if(!row)return;const J=bankMapJournal(sid);let e=J.find(z=>z.rowId===row.id&&!z.undone);
  if(!e){const before={};BANK_MAP_FIELDS.forEach(f=>{before[f]=row[f]===undefined?undefined:JSON.parse(JSON.stringify(row[f]));});
    e={rowId:row.id,date:row.transactionDate||'',description:row.description||'',amount:Number(row.debit)||Number(row.credit)||0,side:Number(row.credit)>0?'Credit':'Debit',labels:[],before,createdInvoices:[],advBefore:null,at:Date.now()};J.push(e);}
  if(label&&!e.labels.includes(label))e.labels.push(label);
  if(extra&&extra.createdInvoices)e.createdInvoices.push(...extra.createdInvoices);
  if(extra&&extra.advBefore&&!e.advBefore)e.advBefore=extra.advBefore;
}
// Puts a bank line back as it was before the pop-up mapped it, reversing what the mapping did.
function undoBankMapping(sid,e,cur,onMap){
  cur=cur||{};const b=e.before||{};const linkId='bank-'+e.rowId;
  // bills: payments from this bank line removed; bills created for it deleted (when nothing else paid them)
  if(!b.linkedInvoice){const inv=loadVendorInvoices(sid)||[];
    if(inv.some(i=>(i.payments||[]).some(q=>q.linkId===linkId))||e.createdInvoices.length){
      const kept=inv.map(i=>(i.payments||[]).some(q=>q.linkId===linkId)?{...i,payments:i.payments.filter(q=>q.linkId!==linkId)}:i)
        .filter(i=>!(e.createdInvoices.includes(i.id)&&!(i.payments||[]).length));
      saveVendorInvoices(kept,sid);}}
  // salary / incentive back to Not Paid
  if(Array.isArray(cur.linkedEmployeePay)&&!b.linkedEmployeePay)cur.linkedEmployeePay.forEach(x=>{try{unsettleEmployeePayFor(sid,x.employeeId,x.year,x.month,{salary:x.salarySettled,incentive:x.incentiveSettled});}catch(err){}});
  // advances: new ones removed, linked ones restored
  if(Array.isArray(cur.linkedAdvance)&&!b.linkedAdvance){const created=new Set(cur.linkedAdvance.filter(a=>!a.wasExisting).map(a=>a.advanceId)),linked=new Set(cur.linkedAdvance.filter(a=>a.wasExisting).map(a=>a.advanceId));
    const adv=(loadAdvances(sid)||[]).filter(a=>!created.has(a.id)).map(a=>{if(!linked.has(a.id))return a;const old=(e.advBefore||[]).find(z=>z.id===a.id);if(old)return old;const n={...a};delete n.bankRowId;return n;});
    saveAdvances(adv,sid);}
  const patch={};BANK_MAP_FIELDS.forEach(f=>{patch[f]=b[f]===undefined?(f==='nature'||f==='vendorOverride'||f==='cradleeDate'||f==='linkedInvoice'?'':undefined):b[f];});
  if(onMap)onMap(e.rowId,patch);else saveBankLineMapping(sid,e.rowId,patch);
  e.undone=true;
  try{logAuditEvent(sid,{entity:'Bank Statement',entityId:String(e.rowId),action:'Mapping undone',summary:(e.date||'')+' ₹'+Math.round(e.amount).toLocaleString('en-IN')+' — '+e.labels.join(', ')});}catch(err){}
}
// Pop-up listing unmapped lines, each mappable in place: Nature, the vendor for a vendor payment,
// the Date as per Cradlee for a card / UPI settlement. getList() is re-read after every change.
//   onMap(id, patch)  — how to save (Bank Statement passes its own; default saves to storage)
//   onMapped()        — tells the opening screen to refresh
function UnmappedLinesPopup({sid,getList,getRows,title,intro,onClose,onNavTab,onMap,onMapped,onInvoicesChanged}){
  const h=React.createElement;const [,setTick]=useState(0);const [side,setSide]=useState('All');
  const [linkFor,setLinkFor]=useState(null);const [alloc,setAlloc]=useState({});const [linkErr,setLinkErr]=useState('');
  const [nb,setNb]=useState(null); // new-bill form while linking
  const [payFor,setPayFor]=useState(null); // {x, year, month, lines:[{employeeId,employeeName,salaryOS,incentiveOS,sal,inc,salAmt,incAmt}]}
  const [payErr,setPayErr]=useState('');
  const [advFor,setAdvFor]=useState(null); // {x, lines:[{employeeId,employeeName,amount,deductFrom,deductionStart,reason,linkExistingId}]}
  const [advErr,setAdvErr]=useState('');
  const [ticked,setTicked]=useState(()=>new Set());const [linkPlan,setLinkPlan]=useState(null);const [payPlan,setPayPlan]=useState(null);const [advPlan,setAdvPlan]=useState(null);const [advDeduct,setAdvDeduct]=useState('Salary');const [advOver,setAdvOver]=useState(false);const [payYM,setPayYM]=useState('auto');const [splitOld,setSplitOld]=useState(false);const [bulk,setBulk]=useState({nature:'',vendor:'',dateMode:'setdt',date:''});const [bulkMsg,setBulkMsg]=useState('');
  const list=getList();const vendors=(loadVendors(sid)||[]).filter(v=>v&&v.status!=='Inactive').sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const m=n=>n?'₹'+Number(n).toLocaleString('en-IN',{maximumFractionDigits:2}):'';
  const dr=list.filter(x=>x.side==='Debit'),cr=list.filter(x=>x.side==='Credit');const sum=(a,k)=>a.reduce((t,x)=>t+x[k],0);
  const shown=side==='All'?list:list.filter(x=>x.side===side);
  const rowNow=id=>(getRows?getRows():bankRowsFor(sid)).find(r=>r.id===id);
  const jr=(id,label,extra)=>journalBankMapping(sid,rowNow(id),label,extra);
  const [,setJTick]=useState(0);
  const undoEntry=e=>{undoBankMapping(sid,e,rowNow(e.rowId),onMap);setJTick(t=>t+1);setTick(t=>t+1);if(onInvoicesChanged)onInvoicesChanged();if(onMapped)onMapped();};
  const map=(x,patch)=>{
    jr(x.id,patch.nature!==undefined?'Nature: '+(patch.nature||'blank'):patch.vendorOverride?'Vendor: '+patch.vendorOverride:patch.cradleeDate?'Cradlee date '+patch.cradleeDate:'Changed');
    if(patch.nature&&(patch.nature==='Card Settlement'||patch.nature==='UPI Settlement')&&!x.cradleeDate){const sd=settlementDateFromNarration(x.description);if(sd)patch={...patch,cradleeDate:sd};}
    if(onMap)onMap(x.id,patch);else saveBankLineMapping(sid,x.id,patch);
    setTick(t=>t+1);if(onMapped)onMapped();
  };
  const dmyOf=iso=>iso?iso.split('-').reverse().join('/'):'';
  const sideOk=(x,n)=>x.side==='Credit'?BANK_CREDIT_NATURES.has(n):!/Settlement$|^Collection$|^Interest$/.test(n);
  const sigOf=d=>typeof bankNarrationSig==='function'?bankNarrationSig(d):String(d||'').toLowerCase().replace(/[^a-z]+/g,' ').trim();
  const toggleSel=id=>setTicked(p=>{const n=new Set(p);if(n.has(id))n.delete(id);else n.add(id);return n;});
  const selectSimilar=x=>{const sg=sigOf(x.description);setTicked(p=>{const n=new Set(p);list.forEach(y=>{if(y.side===x.side&&sigOf(y.description)===sg)n.add(y.id);});return n;});};
  // Same mapping on every ticked line: Nature; the vendor for vendor payments; the Date as per Cradlee
  // for card / UPI settlements (from the narration, the day before the bank date, or a chosen date).
  const applyBulk=()=>{
    const n=bulk.nature;if(!n){setBulkMsg('Choose the Nature to apply.');return;}
    const picked=list.filter(x=>ticked.has(x.id));let done=0,skipped=0,noDate=0;
    if(n==='Vendor Payment'&&!bulk.vendor&&!window.confirm('No vendor chosen — lines whose narration does not name a known vendor will stay unmapped. Continue?'))return;
    picked.forEach(x=>{
      if(!sideOk(x,n)){skipped++;return;}
      const patch={nature:n,aiTagged:false};
      if(n==='Vendor Payment'&&bulk.vendor)patch.vendorOverride=bulk.vendor;
      if(n==='Card Settlement'||n==='UPI Settlement'){
        let d=bulk.dateMode==='setdt'?settlementDateFromNarration(x.description):'';
        if(!d&&bulk.dateMode!=='pick'){const iso=toISO(x.date);if(iso){const t=new Date(iso+'T00:00:00');t.setDate(t.getDate()-1);d=String(t.getDate()).padStart(2,'0')+'/'+String(t.getMonth()+1).padStart(2,'0')+'/'+t.getFullYear();}}
        if(bulk.dateMode==='pick')d=bulk.date?dmyOf(bulk.date):'';
        if(d)patch.cradleeDate=d;else noDate++;}
      jr(x.id,'Nature: '+n+(patch.vendorOverride?' · '+patch.vendorOverride:''));if(onMap)onMap(x.id,patch);else saveBankLineMapping(sid,x.id,patch);done++;});
    setTicked(new Set());setTick(t=>t+1);if(onMapped)onMapped();
    setBulkMsg(done+' line'+(done===1?'':'s')+' set to '+n+(skipped?' · '+skipped+' skipped ('+(n&&BANK_CREDIT_NATURES.has(n)?'debits':'credits')+' cannot take this Nature)':'')+(noDate?' · '+noDate+' still need a Date as per Cradlee':'')+'.');
    try{logAuditEvent(sid,{entity:'Bank Statement',entityId:'bulk',action:'Mapped in bulk',summary:done+' line(s) set to '+n+(bulk.vendor?' — '+bulk.vendor:'')});}catch(e){}
  };
  const makePlan=sp=>{setPayPlan(null);setAdvPlan(null);setLinkPlan(planBulkBillLinks(sid,list.filter(x=>ticked.has(x.id)),sp));};
  const makePayPlan=ym=>{setAdvPlan(null);const f=ym&&ym!=='auto'?{year:Number(ym.split('-')[0]),month:Number(ym.split('-')[1])}:null;
    setLinkPlan(null);setPayPlan(planBulkEmployeePay(sid,list.filter(x=>ticked.has(x.id)),f,getRows?getRows():bankRowsFor(sid)));};
  const makeAdvPlan=df=>{setLinkPlan(null);setPayPlan(null);setAdvOver(false);setAdvPlan(planBulkAdvances(sid,list.filter(x=>ticked.has(x.id)),df));};
  const runAdvPlan=()=>{
    const rowsNow=getRows?getRows():bankRowsFor(sid);let ok=0;const fails=[];
    advPlan.filter(p=>p.line&&(!p.over||advOver)).forEach(p=>{const row=rowsNow.find(r=>r.id===p.x.id)||{id:p.x.id,debit:p.x.debit,transactionDate:p.x.date};
      const snap=JSON.parse(JSON.stringify(loadAdvances(sid)||[]));
      const err=recordBankLineAdvances(sid,row,[p.line],onMap,{limitReviewed:true});if(err)fails.push((p.x.date||'')+' '+p.emp.name+': '+err);else{journalBankMapping(sid,row,'Advance: '+p.emp.name,{advBefore:snap});ok++;}});
    setAdvPlan(null);setTicked(new Set());setTick(t=>t+1);if(onMapped)onMapped();
    setBulkMsg(ok+' advance'+(ok===1?'':'s')+' recorded'+(fails.length?' · not recorded: '+fails.join('; '):'')+'.');
  };
  const runPayPlan=()=>{
    const rowsNow=getRows?getRows():bankRowsFor(sid);let ok=0;const fails=[];
    payPlan.filter(p=>p.what).forEach(p=>{const row=rowsNow.find(r=>r.id===p.x.id)||{id:p.x.id,debit:p.x.debit,transactionDate:p.x.date};
      const err=settleBankLineToEmployees(sid,row,p.year,p.month,[{employeeId:p.emp.id,employeeName:p.emp.name,salaryAmt:p.salaryAmt,incentiveAmt:p.incentiveAmt,dailyIncentiveByCat:p.dailyIncentiveByCat}],onMap);
      if(err)fails.push((p.x.date||'')+' '+p.emp.name+': '+err);else{journalBankMapping(sid,row,p.what+': '+p.emp.name);ok++;}});
    setPayPlan(null);setTicked(new Set());setTick(t=>t+1);if(onMapped)onMapped();
    setBulkMsg(ok+' payment'+(ok===1?'':'s')+' settled to employees'+(fails.length?' · not settled: '+fails.join('; '):'')+'.');
  };
  const runPlan=()=>{
    const rowsNow=getRows?getRows():bankRowsFor(sid);let ok=0;const fails=[];
    linkPlan.filter(p=>p.allocations).forEach(p=>{const row=rowsNow.find(r=>r.id===p.x.id)||{id:p.x.id,debit:p.x.debit,transactionDate:p.x.date};
      const err=linkBankLineToBills(sid,row,p.vendor,p.allocations.map(a=>({id:a.id,amount:a.amount})),onMap);if(err)fails.push((p.x.date||'')+' '+p.vendor.name+': '+err);else{journalBankMapping(sid,row,'Linked to '+p.allocations.map(a=>a.invoiceNo).join(', '));ok++;}});
    setLinkPlan(null);setTicked(new Set());setTick(t=>t+1);if(onInvoicesChanged)onInvoicesChanged();if(onMapped)onMapped();
    setBulkMsg(ok+' payment'+(ok===1?'':'s')+' linked to bills'+(fails.length?' · not linked: '+fails.join('; '):'')+'.');
  };
  const allVendors=loadVendors(sid)||[];
  const vendorOfLine=x=>x.vendorOverride&&x.vendorOverride!=='__none__'?allVendors.find(v=>v.name===x.vendorOverride)||null:(x.vendorOverride==='__none__'?null:findVendorMatch(x.description,allVendors));
  const billBal=inv=>Math.round(((Number(inv.amount)||0)-(inv.payments||[]).reduce((t,q)=>t+(Number(q.paidAmount)||0),0))*100)/100;
  const openBillsOf=v=>(loadVendorInvoices(sid)||[]).filter(inv=>inv&&String(inv.vendorId)===String(v.id)&&inv.docNature!=='Performa Invoice'&&billBal(inv)>0.5)
    .sort((a,b)=>String(toISO(a.invoiceDate)||'').localeCompare(String(toISO(b.invoiceDate)||'')));
  const startLink=x=>{const v=vendorOfLine(x);if(!v){setLinkErr('');setLinkFor({x,v:null});return;}
    const bills=openBillsOf(v);const a={};allocateOldestFirst(bills.map(b=>({id:b.id,balance:billBal(b)})),x.debit).forEach(r=>{if(r.alloc>0)a[r.id]=String(r.alloc);});
    setPayFor(null);setAdvFor(null);setAlloc(a);setLinkErr('');setNb(bills.length?null:{invoiceNo:'',invoiceDate:toISO(x.date)||'',amount:String(x.debit),category:v.cat||defaultVendorCategoryFor(sid),gstRate:'0'});setLinkFor({x,v});};
  const doLink=()=>{const {x,v}=linkFor;const row=(getRows?getRows():bankRowsFor(sid)).find(r=>r.id===x.id)||{id:x.id,debit:x.debit,transactionDate:x.date};
    const err=linkBankLineToBills(sid,row,v,Object.keys(alloc).map(id=>({id,amount:Number(alloc[id])||0})),onMap);
    if(err){setLinkErr(err);return;}
    journalBankMapping(sid,row,'Linked to bills of '+v.name);
    setLinkFor(null);setTick(t=>t+1);if(onInvoicesChanged)onInvoicesChanged();if(onMapped)onMapped();};
  const empLinesFor=(x,year,month)=>{
    const emps=(getEmployeesForMonth(year,month,sid)||[]).filter(e=>e&&e.status!=='Inactive');
    const hit=findEmployeeMatch(x.description,emps);
    const rowsNow=getRows?getRows():bankRowsFor(sid);
    const lines=emps.map(e=>{const di={};DAILY_INCENTIVE_CATEGORIES_ALL.forEach(c=>{const os=Math.max(0,employeeDailyIncentiveCategoryOutstandingFor(sid,e.id,year,month,c)-dailyIncentiveSettledOnBank(sid,e.id,year,month,c,x.id,rowsNow));if(os>0.5)di[c]={os:Math.round(os*100)/100,sel:false,amt:''};});
      return{employeeId:e.id,employeeName:e.name,salaryOS:employeeSalaryOutstandingFor(sid,e.id,year,month),incentiveOS:employeeIncentiveOutstandingFor(sid,e.id,year,month),di,sal:false,inc:false,salAmt:'',incAmt:'',hit:!!hit&&hit.id===e.id};})
      .filter(l=>l.salaryOS>0||l.incentiveOS>0||Object.keys(l.di).length||l.hit).sort((a,b)=>(b.hit?1:0)-(a.hit?1:0)||a.employeeName.localeCompare(b.employeeName));
    const h0=lines.find(l=>l.hit);
    if(h0){if(h0.salaryOS>0){h0.sal=true;h0.salAmt=String(Math.min(h0.salaryOS,x.debit));}else if(h0.incentiveOS>0){h0.inc=true;h0.incAmt=String(Math.min(h0.incentiveOS,x.debit));}
      else{let left=x.debit;Object.keys(h0.di).forEach(c=>{const a=Math.min(h0.di[c].os,left);if(a>0){h0.di[c]={...h0.di[c],sel:true,amt:String(a)};left-=a;}});}}
    return lines;};
  const startPay=x=>{const iso=toISO(x.date)||'';const d=iso?new Date(iso+'T00:00:00'):new Date();
    const p=d.getDate()<=15?new Date(d.getFullYear(),d.getMonth()-1,1):new Date(d.getFullYear(),d.getMonth(),1);
    setPayErr('');setLinkFor(null);setAdvFor(null);setPayFor({x,year:p.getFullYear(),month:p.getMonth(),lines:empLinesFor(x,p.getFullYear(),p.getMonth())});};
  const setPayLine=(id,patch)=>setPayFor(pf=>({...pf,lines:pf.lines.map(l=>l.employeeId===id?{...l,...patch}:l)}));
  const setPayDi=(id,cat,patch)=>setPayFor(pf=>({...pf,lines:pf.lines.map(l=>l.employeeId===id?{...l,di:{...l.di,[cat]:{...l.di[cat],...patch}}}:l)}));
  const doPay=()=>{const {x,year,month,lines}=payFor;const row=(getRows?getRows():bankRowsFor(sid)).find(r=>r.id===x.id)||{id:x.id,debit:x.debit,transactionDate:x.date};
    const err=settleBankLineToEmployees(sid,row,year,month,lines.map(l=>({employeeId:l.employeeId,employeeName:l.employeeName,salaryAmt:l.sal?l.salAmt:0,incentiveAmt:l.inc?l.incAmt:0,
      dailyIncentiveByCat:Object.fromEntries(Object.entries(l.di||{}).filter(([,d])=>d.sel).map(([c,d])=>[c,Number(d.amt)||0]))})),onMap);
    if(err){setPayErr(err);return;}
    journalBankMapping(sid,row,'Paid employees ('+RPT_MONTHS[month].slice(0,3)+' '+year+')');
    setPayFor(null);setTick(t=>t+1);if(onMapped)onMapped();};
  const advEmps=()=>{const t=new Date();return(getEmployeesForMonth(t.getFullYear(),t.getMonth(),sid)||[]).filter(e=>e&&e.status!=='Inactive').sort((a,b)=>String(a.name).localeCompare(String(b.name)));};
  const nextYM=()=>{const d=new Date();d.setMonth(d.getMonth()+1,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');};
  const advLine=(e,amt)=>{const c=advanceCandidatesForEmp(sid,e.name);return{employeeId:e.id,employeeName:e.name,amount:amt>0?String(Math.round(amt*100)/100):'',deductFrom:'Salary',deductionStart:nextYM(),reason:'',linkExistingId:c.length===1&&Math.abs((Number(c[0].outstanding!=null?c[0].outstanding:c[0].amount)||0)-amt)<1?c[0].id:''};};
  const startAdv=x=>{const hit=findEmployeeMatch(x.description,advEmps());setLinkFor(null);setPayFor(null);setAdvErr('');setAdvFor({x,lines:hit?[advLine(hit,x.debit)]:[]});};
  const setAdvLine=(id,patch)=>setAdvFor(a=>({...a,lines:a.lines.map(l=>l.employeeId===id?{...l,...patch}:l)}));
  const doAdv=()=>{const {x,lines}=advFor;const row=(getRows?getRows():bankRowsFor(sid)).find(r=>r.id===x.id)||{id:x.id,debit:x.debit,transactionDate:x.date};
    const snap=JSON.parse(JSON.stringify(loadAdvances(sid)||[]));
    const err=recordBankLineAdvances(sid,row,lines,onMap);if(err){setAdvErr(err);return;}
    journalBankMapping(sid,row,'Advance recorded',{advBefore:snap});
    setAdvFor(null);setTick(t=>t+1);if(onMapped)onMapped();};
  const createAndLink=()=>{const {x,v}=linkFor;const amt=Number(nb.amount)||0;
    const others=Object.values(alloc).reduce((t,a)=>t+(Number(a)||0),0);
    if(others+amt>x.debit+1){setLinkErr('Existing bills ₹'+Math.round(others).toLocaleString('en-IN')+' + new bill ₹'+Math.round(amt).toLocaleString('en-IN')+' is more than the bank debit ₹'+Math.round(x.debit).toLocaleString('en-IN')+'.');return;}
    const row=(getRows?getRows():bankRowsFor(sid)).find(r=>r.id===x.id)||{id:x.id,debit:x.debit,transactionDate:x.date};
    const res=createBillForBankLine(sid,v,row,nb);if(res.error){setLinkErr(res.error);return;}
    const err=linkBankLineToBills(sid,row,v,[...Object.keys(alloc).map(id=>({id,amount:Number(alloc[id])||0})),{id:res.inv.id,amount:amt}],onMap);
    if(err){setLinkErr('Bill '+res.inv.invoiceNo+' was added, but not linked: '+err);if(onInvoicesChanged)onInvoicesChanged();return;}
    journalBankMapping(sid,row,'New bill '+res.inv.invoiceNo+' and linked',{createdInvoices:[res.inv.id]});
    setNb(null);setLinkFor(null);setTick(t=>t+1);if(onInvoicesChanged)onInvoicesChanged();if(onMapped)onMapped();};
  const sel={padding:'5px 6px',fontSize:11.5,minWidth:150};
  return h('div',{className:'modal-overlay',style:{zIndex:3000},onClick:onClose},h('div',{className:'modal',style:{width:1000,maxWidth:'97vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},title),
    h('div',{style:{fontSize:13,marginBottom:10,lineHeight:1.6}},intro),
    !list.length?h('div',{style:{padding:'18px 0',fontSize:14,color:'var(--green)',fontWeight:600}},'✓ Everything is mapped now.'):h(React.Fragment,null,
      h('div',{style:{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap',alignItems:'center'}},[['All',list.length],['Debit',dr.length],['Credit',cr.length]].map(([k,n])=>h('button',{key:k,className:'btn btn-sm '+(side===k?'btn-primary':'btn-ghost'),onClick:()=>setSide(k)},k+' ('+n+')')),
        h('span',{style:{fontSize:12,color:'var(--text3)',marginLeft:6}},'Debit '+(m(sum(dr,'debit'))||'₹0')+' · Credit '+(m(sum(cr,'credit'))||'₹0'))),
      ticked.size>0&&h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',padding:'8px 10px',marginBottom:8,background:'rgba(47,95,224,0.08)',border:'1px solid rgba(47,95,224,0.3)',borderRadius:8,position:'sticky',top:0,zIndex:2}},
        h('b',{style:{fontSize:12.5}},ticked.size+' ticked'),
        h('select',{className:'form-control',style:{width:190,padding:'4px 6px',fontSize:12},value:bulk.nature,onChange:e=>setBulk({...bulk,nature:e.target.value})},h('option',{value:''},'Set Nature…'),
          BANK_MAP_NATURES.filter(n=>list.some(x=>ticked.has(x.id)&&sideOk(x,n))).map(n=>h('option',{key:n,value:n},n))),
        bulk.nature==='Vendor Payment'&&h('select',{className:'form-control',style:{width:200,padding:'4px 6px',fontSize:12},value:bulk.vendor,onChange:e=>setBulk({...bulk,vendor:e.target.value})},
          h('option',{value:''},'Vendor from narration'),vendors.map(v=>h('option',{key:v.id,value:v.name},v.name))),
        (bulk.nature==='Card Settlement'||bulk.nature==='UPI Settlement')&&h('select',{className:'form-control',style:{width:210,padding:'4px 6px',fontSize:12},value:bulk.dateMode,onChange:e=>setBulk({...bulk,dateMode:e.target.value})},
          h('option',{value:'setdt'},'Cradlee date from narration (SETDT)'),h('option',{value:'prev'},'Cradlee date = day before bank date'),h('option',{value:'pick'},'Cradlee date = …')),
        (bulk.nature==='Card Settlement'||bulk.nature==='UPI Settlement')&&bulk.dateMode==='pick'&&h('input',{type:'date',className:'form-control',style:{width:140,padding:'4px 6px',fontSize:12},value:bulk.date,onChange:e=>setBulk({...bulk,date:e.target.value})}),
        h('button',{className:'btn btn-primary btn-sm',onClick:applyBulk},'Apply to '+ticked.size),
        list.some(x=>ticked.has(x.id)&&x.side==='Debit')&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>makeAdvPlan(advDeduct)},'💵 Advances ('+list.filter(x=>ticked.has(x.id)&&x.side==='Debit').length+' debits)'),
        list.some(x=>ticked.has(x.id)&&x.side==='Debit')&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>makePayPlan(payYM)},'👤 Pay employees ('+list.filter(x=>ticked.has(x.id)&&x.side==='Debit').length+' debits)'),
        list.some(x=>ticked.has(x.id)&&x.side==='Debit')&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>makePlan(splitOld)},'🔗 Link bills ('+list.filter(x=>ticked.has(x.id)&&x.side==='Debit').length+' debits)'),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setTicked(new Set())},'Clear')),
      bulkMsg&&h('div',{style:{fontSize:12,color:'var(--green)',marginBottom:6}},'✓ '+bulkMsg),
      advPlan&&(()=>{const ready=advPlan.filter(p=>p.line),over=ready.filter(p=>p.over),go=ready.filter(p=>!p.over||advOver),skip=advPlan.filter(p=>!p.line);
        return h('div',{style:{border:'1px solid var(--border2)',borderRadius:8,padding:10,marginBottom:10,background:'var(--bg3)'}},
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:6}},
            h('b',{style:{fontSize:13}},'Advances — '+go.length+' ready'+(skip.length?', '+skip.length+' skipped':'')+(over.length&&!advOver?', '+over.length+' over the limit':'')),
            h('div',{style:{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}},
              h('label',{style:{fontSize:12,display:'flex',gap:6,alignItems:'center'}},'New advances recover from',h('select',{className:'form-control',style:{width:110,padding:'3px 6px',fontSize:12},value:advDeduct,onChange:e=>{setAdvDeduct(e.target.value);makeAdvPlan(e.target.value);}},['Salary','Incentive'].map(o=>h('option',{key:o,value:o},o)))),
              over.length>0&&h('label',{style:{fontSize:12,display:'flex',gap:6,alignItems:'center',color:'var(--orange)'}},h('input',{type:'checkbox',checked:advOver,onChange:e=>setAdvOver(e.target.checked)}),'Include the '+over.length+' over the limit'))),
          h('table',{style:{width:'100%',fontSize:12}},h('thead',null,h('tr',null,['Date','Payment','Employee','Records'].map((t,i)=>h('th',{key:i,style:i===1?{textAlign:'right'}:null},t)))),
            h('tbody',null,advPlan.map(p=>h('tr',{key:p.x.id,style:{opacity:p.line&&(!p.over||advOver)?1:0.7}},
              h('td',{style:{whiteSpace:'nowrap'}},p.x.date),h('td',{style:{textAlign:'right',whiteSpace:'nowrap'}},m(p.x.debit)),h('td',null,p.emp?p.emp.name:'—'),
              h('td',{style:{color:!p.line?'var(--orange)':p.over?'var(--orange)':'var(--green)'}},!p.line?p.reason:p.linked?'Links '+p.linked+' already on the Advances sheet':'New advance, recover from '+p.line.deductFrom+' from '+RPT_MONTHS[Number(p.line.deductionStart.slice(5,7))-1].slice(0,3)+' '+p.line.deductionStart.slice(0,4)+(p.over?' — ⚠ '+p.over:'')))))),
          h('div',{style:{display:'flex',gap:8,marginTop:8}},go.length>0&&h('button',{className:'btn btn-primary btn-sm',onClick:runAdvPlan},'Record '+go.length),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setAdvPlan(null)},'Cancel')));})(),
      payPlan&&(()=>{const go=payPlan.filter(p=>p.what),skip=payPlan.filter(p=>!p.what);
        const months=[0,1,2,3].map(k=>{const d=new Date(new Date().getFullYear(),new Date().getMonth()-k,1);return d.getFullYear()+'-'+d.getMonth();});
        return h('div',{style:{border:'1px solid var(--border2)',borderRadius:8,padding:10,marginBottom:10,background:'var(--bg3)'}},
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:6}},
            h('b',{style:{fontSize:13}},'Pay employees — '+go.length+' ready'+(skip.length?', '+skip.length+' skipped':'')),
            h('label',{style:{fontSize:12,display:'flex',gap:6,alignItems:'center'}},'Pay for',h('select',{className:'form-control',style:{width:200,padding:'3px 6px',fontSize:12},value:payYM,onChange:e=>{setPayYM(e.target.value);makePayPlan(e.target.value);}},
              h('option',{value:'auto'},'By payment date (≤15th → last month)'),months.map(k=>{const [yy,mm]=k.split('-').map(Number);return h('option',{key:k,value:k},RPT_MONTHS[mm]+' '+yy);})))),
          h('table',{style:{width:'100%',fontSize:12}},h('thead',null,h('tr',null,['Date','Payment','Employee','Month','Settles'].map((t,i)=>h('th',{key:i,style:i===1?{textAlign:'right'}:null},t)))),
            h('tbody',null,payPlan.map(p=>h('tr',{key:p.x.id,style:{opacity:p.what?1:0.7}},
              h('td',{style:{whiteSpace:'nowrap'}},p.x.date),h('td',{style:{textAlign:'right',whiteSpace:'nowrap'}},m(p.x.debit)),h('td',null,p.emp?p.emp.name:'—'),
              h('td',{style:{whiteSpace:'nowrap'}},p.month!=null?RPT_MONTHS[p.month].slice(0,3)+' '+p.year:'—'),
              h('td',{style:{color:p.what?'var(--green)':'var(--orange)'}},p.what?p.what+' '+m(p.salaryAmt+p.incentiveAmt+Object.values(p.dailyIncentiveByCat||{}).reduce((t,v)=>t+v,0)):p.reason))))),
          h('div',{style:{display:'flex',gap:8,marginTop:8}},go.length>0&&h('button',{className:'btn btn-primary btn-sm',onClick:runPayPlan},'Settle '+go.length),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setPayPlan(null)},'Cancel')));})(),
      linkPlan&&(()=>{const go=linkPlan.filter(p=>p.allocations),skip=linkPlan.filter(p=>!p.allocations);
        return h('div',{style:{border:'1px solid var(--border2)',borderRadius:8,padding:10,marginBottom:10,background:'var(--bg3)'}},
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:6}},
            h('b',{style:{fontSize:13}},'Link bills — '+go.length+' ready'+(skip.length?', '+skip.length+' skipped':'')),
            h('label',{style:{fontSize:12,display:'flex',gap:6,alignItems:'center'}},h('input',{type:'checkbox',checked:splitOld,onChange:e=>{setSplitOld(e.target.checked);makePlan(e.target.checked);}}),'Split across oldest bills when no single bill matches')),
          h('table',{style:{width:'100%',fontSize:12}},h('thead',null,h('tr',null,['Date','Payment','Vendor','Linked to'].map((t,i)=>h('th',{key:i,style:i===1?{textAlign:'right'}:null},t)))),
            h('tbody',null,linkPlan.map(p=>h('tr',{key:p.x.id,style:{opacity:p.allocations?1:0.7}},
              h('td',{style:{whiteSpace:'nowrap'}},p.x.date),h('td',{style:{textAlign:'right',whiteSpace:'nowrap'}},m(p.x.debit)),h('td',null,p.vendor?p.vendor.name:'—'),
              h('td',{style:{color:p.allocations?'var(--green)':'var(--orange)'}},p.allocations?p.allocations.map(a=>a.invoiceNo+' '+m(a.amount)).join(' + '):p.reason))))),
          h('div',{style:{display:'flex',gap:8,marginTop:8}},go.length>0&&h('button',{className:'btn btn-primary btn-sm',onClick:runPlan},'Link '+go.length),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setLinkPlan(null)},'Cancel')));})(),
      h('div',{className:'table-wrap'},h('table',null,
        h('thead',null,h('tr',null,h('th',{key:'cb',style:{width:28}},h('input',{type:'checkbox',title:'Tick every line shown',checked:shown.length>0&&shown.slice(0,300).every(x=>ticked.has(x.id)),
          onChange:e=>setTicked(p=>{const n=new Set(p);shown.slice(0,300).forEach(x=>{if(e.target.checked)n.add(x.id);else n.delete(x.id);});return n;})})),
          ['Date','Side','Description','Amount','Map it','What is missing'].map((t,i)=>h('th',{key:i,style:i===3?{textAlign:'right'}:null},t)))),
        h('tbody',null,shown.slice(0,300).map(x=>{const natList=BANK_MAP_NATURES.filter(n=>x.side==='Credit'?BANK_CREDIT_NATURES.has(n)||n===x.nature:!/Settlement$|^Collection$|^Interest$/.test(n)||n===x.nature);
          const lp=linkFor&&linkFor.x.id===x.id?linkFor:null;
          const pp=payFor&&payFor.x.id===x.id?payFor:null;
          const ap=advFor&&advFor.x.id===x.id?advFor:null;
          return h(React.Fragment,{key:x.id},h('tr',{style:ticked.has(x.id)?{background:'rgba(47,95,224,0.06)'}:null},
            h('td',null,h('input',{type:'checkbox',checked:ticked.has(x.id),onChange:()=>toggleSel(x.id)})),
            h('td',{style:{whiteSpace:'nowrap'}},x.date),h('td',{style:{color:x.side==='Debit'?'var(--orange)':'var(--green)',fontWeight:600}},x.side),
            h('td',{style:{fontSize:12,maxWidth:320}},x.description,h('button',{className:'btn btn-ghost btn-sm',title:'Tick every line with a similar narration',style:{padding:'0 6px',fontSize:10.5,marginLeft:4},onClick:()=>selectSimilar(x)},'≈ similar')),h('td',{style:{textAlign:'right',fontWeight:600,whiteSpace:'nowrap'}},m(x.debit||x.credit)),
            h('td',null,h('div',{style:{display:'flex',flexDirection:'column',gap:4}},
              h('select',{className:'form-control',style:sel,value:x.nature,onChange:e=>map(x,{nature:e.target.value,aiTagged:false})},h('option',{value:''},'Select Nature'),natList.map(n=>h('option',{key:n,value:n},n))),
              x.side==='Debit'&&x.nature==='Vendor Payment'&&h('select',{className:'form-control',style:sel,value:x.vendorOverride&&x.vendorOverride!=='__none__'?x.vendorOverride:'',onChange:e=>e.target.value&&map(x,{vendorOverride:e.target.value})},
                h('option',{value:''},'Select vendor'),vendors.map(v=>h('option',{key:v.id,value:v.name},v.name))),
              x.side==='Debit'&&(!x.nature||x.nature==='Advance Salary')&&h('button',{className:'btn btn-ghost btn-sm',style:{alignSelf:'flex-start'},onClick:()=>advFor&&advFor.x.id===x.id?setAdvFor(null):startAdv(x)},advFor&&advFor.x.id===x.id?'Close advance':'💵 Advance'),
              x.side==='Debit'&&(!x.nature||x.nature==='Salary'||x.nature==='Incentive'||x.nature==='Daily Incentive')&&h('button',{className:'btn btn-ghost btn-sm',style:{alignSelf:'flex-start'},onClick:()=>payFor&&payFor.x.id===x.id?setPayFor(null):startPay(x)},payFor&&payFor.x.id===x.id?'Close employees':'👤 Pay employees'),
              x.side==='Debit'&&(!x.nature||x.nature==='Vendor Payment')&&h('button',{className:'btn btn-ghost btn-sm',style:{alignSelf:'flex-start'},onClick:()=>linkFor&&linkFor.x.id===x.id?setLinkFor(null):startLink(x)},linkFor&&linkFor.x.id===x.id?'Close bills':'🔗 Link bill'),
              x.side==='Credit'&&(x.nature==='Card Settlement'||x.nature==='UPI Settlement')&&h('input',{type:'date',className:'form-control',style:sel,value:toISO(x.cradleeDate)||'',title:'Date as per Cradlee — the sale date this settlement belongs to',
                onChange:e=>e.target.value&&map(x,{cradleeDate:dmyOf(e.target.value)})}))),
            h('td',{style:{color:'var(--red)',fontWeight:600,whiteSpace:'nowrap'}},x.problem)),
            lp&&h('tr',null,h('td',{colSpan:7,style:{background:'var(--bg3)',padding:'10px 12px'}},
              !lp.v?h('div',{style:{fontSize:12.5}},'Choose the vendor first: set Nature to Vendor Payment and pick the vendor, then 🔗 Link bill.')
              :(()=>{const bills=openBillsOf(lp.v);const tot=Object.values(alloc).reduce((t,v)=>t+(Number(v)||0),0);
                return h('div',null,
                  h('div',{style:{fontSize:12.5,fontWeight:600,marginBottom:6}},'Open bills of '+lp.v.name+' — bank debit '+m(x.debit)+' · allocated '+(m(tot)||'₹0')+(Math.abs(tot-x.debit)>0.5?' · left '+m(Math.max(0,x.debit-tot)):'')),
                  !bills.length?h('div',{style:{fontSize:12,color:'var(--text3)'}},'No unpaid bills for this vendor — enter the bill below.')
                  :h('table',{style:{width:'100%',fontSize:12}},h('thead',null,h('tr',null,['','Bill no.','Bill date','Amount','Balance','Pay from this debit'].map((t,i)=>h('th',{key:i,style:i>=3?{textAlign:'right'}:null},t)))),
                    h('tbody',null,bills.map(b=>{const on=alloc[b.id]!=null;return h('tr',{key:b.id},
                      h('td',null,h('input',{type:'checkbox',checked:on,onChange:e=>setAlloc(a=>{const n={...a};if(e.target.checked){const used=Object.entries(n).reduce((t,[k,v])=>t+(Number(v)||0),0);n[b.id]=String(Math.max(0,Math.min(billBal(b),Math.round((x.debit-used)*100)/100)));}else delete n[b.id];return n;})})),
                      h('td',null,b.invoiceNo||'—'),h('td',null,toISO(b.invoiceDate)?toISO(b.invoiceDate).split('-').reverse().join('/'):(b.invoiceDate||'—')),h('td',{style:{textAlign:'right'}},m(b.amount)),h('td',{style:{textAlign:'right'}},m(billBal(b))),
                      h('td',{style:{textAlign:'right'}},h('input',{type:'number',className:'form-control',disabled:!on,value:on?alloc[b.id]:'',onChange:e=>setAlloc(a=>({...a,[b.id]:e.target.value})),style:{width:110,padding:'3px 6px',fontSize:12,textAlign:'right',display:'inline-block'}})));}))),
                  nb&&h('div',{style:{marginTop:10,padding:10,border:'1px dashed var(--border2)',borderRadius:8}},
                    h('div',{style:{fontSize:12.5,fontWeight:600,marginBottom:6}},'New bill of '+lp.v.name+' — added paid by this debit'),
                    h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end'}},
                      h('div',null,h('div',{style:{fontSize:11,color:'var(--text3)'}},'Bill no.'),h('input',{className:'form-control',style:{width:120,padding:'4px 6px',fontSize:12},value:nb.invoiceNo,onChange:e=>setNb({...nb,invoiceNo:e.target.value})})),
                      h('div',null,h('div',{style:{fontSize:11,color:'var(--text3)'}},'Bill date'),h('input',{type:'date',className:'form-control',style:{width:140,padding:'4px 6px',fontSize:12},value:nb.invoiceDate,onChange:e=>setNb({...nb,invoiceDate:e.target.value})})),
                      h('div',null,h('div',{style:{fontSize:11,color:'var(--text3)'}},'Amount incl. GST ₹'),h('input',{type:'number',className:'form-control',style:{width:120,padding:'4px 6px',fontSize:12,textAlign:'right'},value:nb.amount,onChange:e=>setNb({...nb,amount:e.target.value})})),
                      h('div',null,h('div',{style:{fontSize:11,color:'var(--text3)'}},'GST in it'),h('select',{className:'form-control',style:{width:90,padding:'4px 6px',fontSize:12},value:nb.gstRate,onChange:e=>setNb({...nb,gstRate:e.target.value})},['0','5','12','18','28'].map(r=>h('option',{key:r,value:r},r==='0'?'None':r+'%')))),
                      h('div',null,h('div',{style:{fontSize:11,color:'var(--text3)'}},'Category'),h('select',{className:'form-control',style:{width:190,padding:'4px 6px',fontSize:12},value:nb.category,onChange:e=>setNb({...nb,category:e.target.value})},
                        h('option',{value:''},'Choose…'),withBizCategories(BANK_BILL_CATEGORIES.concat(isRestaurantOutlet(sid)?[defaultVendorCategoryFor(sid)]:[]),sid).filter((c,i,a)=>a.indexOf(c)===i).map(c=>h('option',{key:c,value:c},c)))),
                      h('button',{className:'btn btn-primary btn-sm',onClick:createAndLink},'Create & link'),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setNb(null)},'Cancel')),
                    Number(nb.gstRate)>0&&h('div',{style:{fontSize:11,color:'var(--text3)',marginTop:4}},'Split as '+(gstSupplyTypeFor(sid,lp.v.gst)==='inter'?'IGST':'CGST + SGST')+' from the vendor’s and outlet’s GSTIN; edit the bill in Vendors for freight or a different split.')),
                  linkErr&&h('div',{style:{color:'var(--red)',fontSize:12,marginTop:6}},linkErr),
                  h('div',{style:{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}},
                    bills.length>0&&!nb&&h('button',{className:'btn btn-primary btn-sm',onClick:doLink},'Link '+(m(tot)||'')),
                    !nb&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setNb({invoiceNo:'',invoiceDate:toISO(x.date)||'',amount:String(Math.max(0,Math.round((x.debit-tot)*100)/100)||x.debit),category:lp.v.cat||defaultVendorCategoryFor(sid),gstRate:'0'})},'+ New bill'),
                    h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{setLinkFor(null);setNb(null);}},'Close')));})())),
            pp&&h('tr',null,h('td',{colSpan:7,style:{background:'var(--bg3)',padding:'10px 12px'}},(()=>{
              const tot=pp.lines.reduce((t,l)=>t+(l.sal?Number(l.salAmt)||0:0)+(l.inc?Number(l.incAmt)||0:0)+Object.values(l.di||{}).reduce((u,d)=>u+(d.sel?Number(d.amt)||0:0),0),0);
              const months=[0,1,2,3].map(k=>{const d=new Date(new Date().getFullYear(),new Date().getMonth()-k,1);return{y:d.getFullYear(),m:d.getMonth()};});
              const num=(v,dis,on)=>h('input',{type:'number',className:'form-control',disabled:dis,value:v,onChange:e=>on(e.target.value),style:{width:100,padding:'3px 6px',fontSize:12,textAlign:'right',display:'inline-block'}});
              return h('div',null,
                h('div',{style:{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:6}},
                  h('span',{style:{fontSize:12.5,fontWeight:600}},'Pay for'),
                  h('select',{className:'form-control',style:{width:150,padding:'4px 6px',fontSize:12},value:pp.year+'-'+pp.month,onChange:e=>{const [y,mo]=e.target.value.split('-').map(Number);setPayFor(pf=>({...pf,year:y,month:mo,lines:empLinesFor(pf.x,y,mo)}));}},
                    months.map(o=>h('option',{key:o.y+'-'+o.m,value:o.y+'-'+o.m},RPT_MONTHS[o.m]+' '+o.y))),
                  h('span',{style:{fontSize:12,color:'var(--text3)'}},'bank debit '+m(x.debit)+' · allocated '+(m(tot)||'₹0')+(x.debit-tot>0.5?' · left '+m(x.debit-tot):''))),
                !pp.lines.length?h('div',{style:{fontSize:12,color:'var(--text3)'}},'No salary, incentive or daily incentive outstanding for '+RPT_MONTHS[pp.month]+' '+pp.year+' (attendance must be final for salary to show). Pick another month, or set Nature to Advance Salary in Bank Statement for an advance.')
                :h('table',{style:{width:'100%',fontSize:12}},h('thead',null,h('tr',null,['Employee','Salary due','Pay salary','Incentive due','Pay incentive'].map((t,i)=>h('th',{key:i,style:i?{textAlign:'right'}:null},t)))),
                  h('tbody',null,pp.lines.map(l=>h(React.Fragment,{key:l.employeeId},h('tr',null,
                    h('td',null,l.employeeName,l.hit&&h('span',{style:{fontSize:10.5,color:'var(--green)',marginLeft:6}},'named in the narration')),
                    h('td',{style:{textAlign:'right'}},m(l.salaryOS)||'—'),
                    h('td',{style:{textAlign:'right',whiteSpace:'nowrap'}},h('input',{type:'checkbox',disabled:!(l.salaryOS>0),checked:l.sal,onChange:e=>setPayLine(l.employeeId,{sal:e.target.checked,salAmt:e.target.checked?String(Math.min(l.salaryOS,Math.max(0,x.debit-tot))||l.salaryOS):''}),style:{marginRight:6}}),num(l.sal?l.salAmt:'',!l.sal,v=>setPayLine(l.employeeId,{salAmt:v}))),
                    h('td',{style:{textAlign:'right'}},m(l.incentiveOS)||'—'),
                    h('td',{style:{textAlign:'right',whiteSpace:'nowrap'}},h('input',{type:'checkbox',disabled:!(l.incentiveOS>0),checked:l.inc,onChange:e=>setPayLine(l.employeeId,{inc:e.target.checked,incAmt:e.target.checked?String(Math.min(l.incentiveOS,Math.max(0,x.debit-tot))||l.incentiveOS):''}),style:{marginRight:6}}),num(l.inc?l.incAmt:'',!l.inc,v=>setPayLine(l.employeeId,{incAmt:v})))),
                    Object.keys(l.di||{}).length>0&&h('tr',null,h('td',{colSpan:5,style:{paddingLeft:18,paddingBottom:8}},
                      h('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:3}},'Daily incentive due (Daily Incentive sheet, paid by bank)'),
                      h('div',{style:{display:'flex',gap:12,flexWrap:'wrap'}},Object.entries(l.di).map(([c,d])=>h('label',{key:c,style:{display:'flex',alignItems:'center',gap:5,fontSize:12}},
                        h('input',{type:'checkbox',checked:d.sel,onChange:e=>setPayDi(l.employeeId,c,{sel:e.target.checked,amt:e.target.checked?String(Math.min(d.os,Math.max(0,x.debit-tot))||d.os):''})}),
                        c.replace(' Commission/Incentives','')+' '+m(d.os),num(d.sel?d.amt:'',!d.sel,v=>setPayDi(l.employeeId,c,{amt:v}))))))))))),
                payErr&&h('div',{style:{color:'var(--red)',fontSize:12,marginTop:6}},payErr),
                h('div',{style:{fontSize:11,color:'var(--text3)',marginTop:6}},'Paid in full → Salary / Incentive Working shows Paid. Daily incentive paid is kept on this bank line (and not offered again on another transfer). Advances: 💵 Advance.'),
                h('div',{style:{display:'flex',gap:8,marginTop:8}},pp.lines.length>0&&h('button',{className:'btn btn-primary btn-sm',onClick:doPay},'Record '+(m(tot)||'')),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setPayFor(null)},'Close')));})())),
            ap&&h('tr',null,h('td',{colSpan:7,style:{background:'var(--bg3)',padding:'10px 12px'}},(()=>{
              const adv=loadAdvances(sid)||[];
              const amtOf=l=>{if(l.linkExistingId){const a=adv.find(z=>z.id===l.linkExistingId);return a?Number(a.outstanding!=null?a.outstanding:a.amount)||0:0;}return Number(l.amount)||0;};
              const tot=ap.lines.reduce((t,l)=>t+amtOf(l),0);const emps=advEmps();const inp={padding:'3px 6px',fontSize:12};
              return h('div',null,
                h('div',{style:{fontSize:12.5,fontWeight:600,marginBottom:6}},'Advance paid by this transfer — bank debit '+m(x.debit)+' · allocated '+(m(tot)||'₹0')+(x.debit-tot>0.5?' · left '+m(x.debit-tot):'')),
                ap.lines.map(l=>{const cands=advanceCandidatesForEmp(sid,l.employeeName);return h('div',{key:l.employeeId,style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end',padding:'6px 0',borderBottom:'1px solid var(--border)'}},
                  h('div',{style:{minWidth:140,fontWeight:600,fontSize:12.5,alignSelf:'center'}},l.employeeName),
                  cands.length>0&&h('div',null,h('div',{style:{fontSize:11,color:'var(--text3)'}},'On the Advances sheet'),h('select',{className:'form-control',style:{...inp,width:210},value:l.linkExistingId,onChange:e=>setAdvLine(l.employeeId,{linkExistingId:e.target.value})},
                    h('option',{value:''},'New advance'),cands.map(a=>h('option',{key:a.id,value:a.id},'Link '+a.id+' — '+m(Number(a.outstanding!=null?a.outstanding:a.amount)||0)+(a.status==='Pending Approval'?' (approved, not paid)':''))))),
                  !l.linkExistingId&&h(React.Fragment,null,
                    h('div',null,h('div',{style:{fontSize:11,color:'var(--text3)'}},'Amount ₹'),h('input',{type:'number',className:'form-control',style:{...inp,width:100,textAlign:'right'},value:l.amount,onChange:e=>setAdvLine(l.employeeId,{amount:e.target.value})})),
                    h('div',null,h('div',{style:{fontSize:11,color:'var(--text3)'}},'Recover from'),h('select',{className:'form-control',style:{...inp,width:110},value:l.deductFrom,onChange:e=>setAdvLine(l.employeeId,{deductFrom:e.target.value})},['Salary','Incentive'].map(o=>h('option',{key:o,value:o},o)))),
                    h('div',null,h('div',{style:{fontSize:11,color:'var(--text3)'}},'Recovery from month'),h('input',{type:'month',className:'form-control',style:{...inp,width:140},value:l.deductionStart,onChange:e=>setAdvLine(l.employeeId,{deductionStart:e.target.value})})),
                    h('div',null,h('div',{style:{fontSize:11,color:'var(--text3)'}},'Reason'),h('input',{className:'form-control',style:{...inp,width:160},value:l.reason,placeholder:'optional',onChange:e=>setAdvLine(l.employeeId,{reason:e.target.value})}))),
                  h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>setAdvFor(a=>({...a,lines:a.lines.filter(z=>z.employeeId!==l.employeeId)}))},'Remove'));}),
                h('div',{style:{display:'flex',gap:8,alignItems:'center',marginTop:8,flexWrap:'wrap'}},
                  h('select',{className:'form-control',style:{...inp,width:200},value:'',onChange:e=>{const em=emps.find(z=>String(z.id)===e.target.value);if(em&&!ap.lines.some(z=>z.employeeId===em.id))setAdvFor(a=>({...a,lines:[...a.lines,advLine(em,Math.max(0,x.debit-tot))]}));}},
                    h('option',{value:''},ap.lines.length?'+ Add another employee':'Choose the employee'),emps.filter(em=>!ap.lines.some(z=>z.employeeId===em.id)).map(em=>h('option',{key:em.id,value:em.id},em.name))),
                  advErr&&h('span',{style:{color:'var(--red)',fontSize:12}},advErr)),
                h('div',{style:{display:'flex',gap:8,marginTop:8}},ap.lines.length>0&&h('button',{className:'btn btn-primary btn-sm',onClick:doAdv},'Record advance '+(m(tot)||'')),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setAdvFor(null)},'Close')));})())));})))),
      shown.length>300&&h('div',{style:{fontSize:12,color:'var(--text3)',marginTop:6}},'…and '+(shown.length-300)+' more.')),
    (()=>{const J=bankMapJournal(sid).filter(e=>!e.undone).slice(-60).reverse();if(!J.length)return null;
      return h('div',{style:{marginTop:14,borderTop:'1px solid var(--border)',paddingTop:10}},
        h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6,gap:8,flexWrap:'wrap'}},
          h('b',{style:{fontSize:13}},'Mapped in this window ('+J.length+')'),
          h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>{if(!window.confirm('Undo all '+J.length+' mapping'+(J.length===1?'':'s')+'? Bill payments, salary “Paid” and advances made by them are reversed too.'))return;J.forEach(e=>undoBankMapping(sid,e,rowNow(e.rowId),onMap));setJTick(t=>t+1);setTick(t=>t+1);if(onInvoicesChanged)onInvoicesChanged();if(onMapped)onMapped();}},'Undo all')),
        h('table',{style:{width:'100%',fontSize:12}},h('tbody',null,J.map(e=>h('tr',{key:e.rowId+'-'+e.at},
          h('td',{style:{whiteSpace:'nowrap'}},e.date),h('td',{style:{color:e.side==='Debit'?'var(--orange)':'var(--green)'}},e.side),
          h('td',{style:{maxWidth:300,fontSize:11.5}},e.description),h('td',{style:{textAlign:'right',whiteSpace:'nowrap'}},m(e.amount)),
          h('td',{style:{color:'var(--text2)'}},e.labels.join(' · ')),
          h('td',null,h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{if(!window.confirm('Undo this mapping?\n\n'+e.date+' '+m(e.amount)+' — '+e.labels.join(', ')))return;undoEntry(e);}},'↶ Undo')))))));})(),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:8}},'Each change saves at once and the line leaves this list when it is mapped. Tick several lines (≈ similar ticks look-alike narrations) to map them together. 🔗 Link bill records the payment on the vendor’s bills (or enters a missing bill with + New bill); 👤 Pay employees settles salary / incentive; 💵 Advance records an advance on the Advances sheet — all the same as in Bank Statement. These rules can be switched off in Master Settings → 🎛 Controls.'),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},list.length?'Close':'Done'),onNavTab&&h('button',{className:'btn btn-primary',onClick:()=>{onClose();onNavTab('bank-statement');}},'Go to Bank Statement →'))));
}
// Collection Reco: credits only.
function UnmappedCreditsPopup({sid,year,month,monthLabel,onClose,onNavTab,onMapped}){
  return React.createElement(UnmappedLinesPopup,{sid,getList:()=>collRecoBlocked(sid,year,month),onClose,onNavTab,onMapped,
    title:'⚠ Map every bank credit before the Collection Reco',
    intro:'These credit lines in the bank statement for '+monthLabel+' are not mapped. Map each one below (or in Bank Statement), then the Collection Reco opens.'});
}
// Opens the pop-up from anywhere (no component state needed).
function showUnmappedLinesPopup(sid,getList,title,intro,onNavTab){
  const el=document.createElement('div');document.body.appendChild(el);const root=ReactDOM.createRoot(el);
  const close=()=>{root.unmount();el.remove();};
  root.render(React.createElement(UnmappedLinesPopup,{sid,getList,title,intro,onClose:close,onNavTab}));
}
// Month Final check: true when the month may be finalised; otherwise shows the pop-up.
function monthFinalMappingOk(sid,year,month,onNavTab){
  const bl=monthFinalBlockedLines(sid,year,month);if(!bl.length)return true;
  const dr=bl.filter(x=>x.side==='Debit').length,cr=bl.length-dr;
  showUnmappedLinesPopup(sid,()=>monthFinalBlockedLines(sid,year,month),'⚠ Map every bank line before marking the month Final',
    RPT_MONTHS[month]+' '+year+' cannot be marked Final yet: '+bl.length+' bank line'+(bl.length===1?'':'s')+' are not mapped ('+dr+' debit, '+cr+' credit). Map them below, then mark Final again.',onNavTab);
  return false;
}
// Bank Statement strip: months with unmapped lines, each opens the list (mapped through the screen's own rows).
function UnmappedMonthsStrip({salonId,rows,onMap,onInvoicesChanged}){
  const h=React.createElement;const [open,setOpen]=useState(null);
  if(salonId==null)return null;
  const all=rows||bankRowsFor(salonId);
  const months=[...new Set(all.map(r=>String(toISO(r&&r.transactionDate)||'').slice(0,7)).filter(x=>x.length===7))].sort().reverse().slice(0,6);
  const items=months.map(ym=>({ym,y:Number(ym.slice(0,4)),m:Number(ym.slice(5,7))-1})).map(x=>({...x,list:unmappedBankLinesFor(salonId,x.y,x.m,all)})).filter(x=>x.list.length);
  if(!items.length&&!open)return null;
  return h('div',{style:{background:'rgba(224,165,48,0.1)',border:'1px solid rgba(224,165,48,0.4)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,fontSize:12.5,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
    h('span',null,items.length?'🧩 Unmapped bank lines:':'✓ All bank lines mapped'),
    items.map(x=>{const dr=x.list.filter(l=>l.side==='Debit').length;return h('button',{key:x.ym,className:'btn btn-ghost btn-sm',onClick:()=>setOpen(x)},RPT_MONTHS[x.m].slice(0,3)+' '+x.y+' — '+dr+' debit, '+(x.list.length-dr)+' credit');}),
    open&&h(UnmappedLinesPopup,{sid:salonId,getList:()=>unmappedBankLinesFor(salonId,open.y,open.m,all),getRows:()=>all,onMap,onInvoicesChanged,
      title:'Unmapped bank lines — '+RPT_MONTHS[open.m]+' '+open.y,
      intro:'Map each line below — a Nature, the vendor for a vendor payment, the Date as per Cradlee for a card / UPI settlement. The month cannot be marked Final, nor its Collection Reco made, until they are mapped.',
      onClose:()=>setOpen(null),onNavTab:null}));
}
