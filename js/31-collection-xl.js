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
  const go=async()=>{const yy=Number(m.slice(0,4)),mm=Number(m.slice(5,7))-1;const bl=collRecoBlocked(salon.id,yy,mm);if(bl.length){setBlocked({list:bl,label:RPT_MONTHS[mm]+' '+yy});return;}
    setBusy(true);try{const {wb,filename}=await buildCollectionRecoWorkbook(salon.id,salon,yy,mm);await xlDownload(wb,filename);toast(filename+' downloaded','success');setOpen(false);}catch(e){toast(e.message||String(e),'error');}setBusy(false);};
  return h(React.Fragment,null,
    h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},onClick:()=>setOpen(true)},'⬇ Collection Reco (Excel with formulas)'),
    open&&h('div',{className:'modal-overlay',onClick:()=>setOpen(false)},h('div',{className:'modal',style:{width:420},onClick:e=>e.stopPropagation()},
      h('div',{className:'modal-title'},'Collection Reco — Excel'),
      h('div',{className:'form-group'},h('label',null,'Month'),h('input',{type:'month',className:'form-control',value:m,onChange:e=>setM(e.target.value)})),
      h('div',{className:'help-note'},'Five sheets: Summary, Collection Reco (day-wise), Bank Charges Reco, Collection Sheet and Bank Statement — the reco figures are formulas on the two data sheets.'),
      h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:()=>setOpen(false)},'Cancel'),h('button',{className:'btn btn-primary',disabled:busy,onClick:go},busy?'Building…':'⬇ Download')))),
    blocked&&h(UnmappedCreditsPopup,{list:blocked.list,monthLabel:blocked.label,onClose:()=>setBlocked(null),onNavTab:onNavTab?(t=>{setOpen(false);onNavTab(t);}):null}));
}

// Bank credits of a month that are not mapped yet: no Nature, or a card / UPI settlement without a
// Date as per Cradlee. [{id, date, description, credit, nature, problem}]
function unmappedBankCreditsFor(sid,year,month){
  const pre=year+'-'+String(month+1).padStart(2,'0');let bank=[];
  try{bank=JSON.parse(cachedLocalGet(outletKey('salonos_bank_statement_rows',sid))||'[]')||[];}catch(e){}
  return bank.filter(r=>r&&Number(r.credit)>0&&String(toISO(r.transactionDate)||'').startsWith(pre)).map(r=>{
    const nat=String(r.nature||'').trim();
    const problem=!nat?'No Nature':((nat==='Card Settlement'||nat==='UPI Settlement')&&!String(r.cradleeDate||'').trim())?'No Date as per Cradlee':'';
    return problem?{id:r.id,date:r.transactionDate,description:r.description||'',credit:Number(r.credit)||0,nature:nat,problem}:null;}).filter(Boolean);
}
function collRecoBlocked(sid,year,month){
  if(!controlOn('collRecoNeedsMapping',sid))return[];
  return unmappedBankCreditsFor(sid,year,month);
}
function UnmappedCreditsPopup({list,monthLabel,onClose,onNavTab}){
  const h=React.createElement;const m=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
  const tot=list.reduce((t,x)=>t+x.credit,0);
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:760,maxWidth:'96vw',maxHeight:'88vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'⚠ Map every bank credit before the Collection Reco'),
    h('div',{style:{fontSize:13,marginBottom:10,lineHeight:1.6}},h('b',null,list.length+' credit line'+(list.length===1?'':'s')+' ('+m(tot)+')'),' in the bank statement for '+monthLabel+' are not mapped. Give each a Nature in Bank Statement — and a Date as per Cradlee for card / UPI settlements — then come back.'),
    h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,['Date','Description','Credit','Nature','What is missing'].map((t,i)=>h('th',{key:i,style:i===2?{textAlign:'right'}:null},t)))),
      h('tbody',null,list.slice(0,200).map((x,i)=>h('tr',{key:i},h('td',{style:{whiteSpace:'nowrap'}},x.date),h('td',{style:{fontSize:12}},x.description),h('td',{style:{textAlign:'right',fontWeight:600}},m(x.credit)),h('td',null,x.nature||'—'),h('td',{style:{color:'var(--red)',fontWeight:600,whiteSpace:'nowrap'}},x.problem)))))),
    list.length>200&&h('div',{style:{fontSize:12,color:'var(--text3)',marginTop:6}},'…and '+(list.length-200)+' more.'),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:8}},'In Bank Statement, filter Nature = (blank) to see them together. This rule can be switched off in Master Settings → 🎛 Controls.'),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Close'),onNavTab&&h('button',{className:'btn btn-primary',onClick:()=>{onClose();onNavTab('bank-statement');}},'Go to Bank Statement →'))));
}
