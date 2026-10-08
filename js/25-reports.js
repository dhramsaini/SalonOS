// ═══════════════════════════════════════════════════════════════════════════════════════════
// Reports (Excel with formulas) — Outlet Comparison, Period P&L (quarter / FY to date / any months),
// Stylist Performance and Service Profitability. Same look as the monthly P&L report: navy title
// banner, section bands, totals with a rule above, ▲▼ changes coloured by meaning, print-ready.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Shared styling kit for the report workbooks.
function makeXlKit(wb,footer){
  const C={navy:'FF14335E',band:'FFDBE6F3',total:'FFEEF3FA',zebra:'FFF7F9FC',white:'FFFFFFFF',grey:'FF5B6472',light:'FF8A94A6',kpi:'FFF3F7FF',link:'FF1F5FBF'};
  const fill=c=>({type:'pattern',pattern:'solid',fgColor:{argb:c}});
  const THIN={style:'thin',color:{argb:'FFD7DDE6'}},BORDER={top:THIN,bottom:THIN,left:THIN,right:THIN};
  const TOP2={...BORDER,top:{style:'medium',color:{argb:C.navy}}},DBL={...BORDER,top:{style:'thin',color:{argb:C.navy}},bottom:{style:'double',color:{argb:C.navy}}};
  const K={C,fill,BORDER,THIN,
    NUM:'#,##0;[Red]-#,##0;"–"',PCT:'0.0%;[Red]-0.0%;"–"',INR:'₹ #,##0;[Red]-₹ #,##0;"–"',
    UP_GOOD:'[Color10]▲ 0.0%;[Red]▼ 0.0%;"–"',UP_BAD:'[Red]▲ 0.0%;[Color10]▼ 0.0%;"–"',CH_GOOD:'[Color10]+#,##0;[Red]-#,##0;"–"',CH_BAD:'[Red]+#,##0;[Color10]-#,##0;"–"'};
  K.sheet=(n,t)=>wb.addWorksheet(n,{properties:{tabColor:{argb:t||C.navy}},views:[{showGridLines:false}]});
  K.setup=(ws,land,freeze)=>{ws.pageSetup={paperSize:9,orientation:land?'landscape':'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.4,right:0.4,top:0.5,bottom:0.5,header:0.3,footer:0.3}};
    ws.headerFooter={oddFooter:'&L'+footer+'&RPage &P of &N'};if(freeze)ws.views=[{state:'frozen',ySplit:freeze,showGridLines:false}];};
  K.banner=(ws,t,s,cols)=>{ws.mergeCells(1,1,1,cols);const a=ws.getCell(1,1);a.value=t;a.font={bold:true,size:14,color:{argb:C.white}};a.fill=fill(C.navy);a.alignment={vertical:'middle',indent:1};ws.getRow(1).height=28;
    ws.mergeCells(2,1,2,cols);const b=ws.getCell(2,1);b.value=s;b.font={size:9,italic:true,color:{argb:C.grey}};b.alignment={wrapText:true,vertical:'top',indent:1};ws.getRow(2).height=30;};
  K.head=(ws,r,vals,rightFrom)=>{const row=ws.getRow(r);row.values=vals;row.height=30;row.eachCell({includeEmpty:true},(c,i)=>{c.fill=fill(C.navy);c.font={bold:true,size:9.5,color:{argb:C.white}};c.border=BORDER;c.alignment={horizontal:i>=rightFrom?'right':'left',vertical:'middle',wrapText:true};});};
  K.band=(ws,r,label,cols)=>{ws.mergeCells(r,1,r,cols);const c=ws.getCell(r,1);c.value=label;c.fill=fill(C.band);c.font={bold:true,size:10,color:{argb:C.navy}};c.alignment={indent:0.5,vertical:'middle'};ws.getRow(r).height=18;for(let i=1;i<=cols;i++)ws.getCell(r,i).border=BORDER;};
  K.put=(ws,r,col,v,fmt)=>{const c=ws.getCell(r,col);c.value=(v&&typeof v==='object'&&'f' in v)?{formula:v.f,result:v.r==null?0:v.r}:v;if(fmt)c.numFmt=fmt;return c;};
  K.style=(ws,r,cols,kind)=>{for(let i=1;i<=cols;i++){const c=ws.getCell(r,i);c.border=kind==='grand'?DBL:kind==='total'?TOP2:BORDER;
    if(kind==='total'||kind==='grand'){c.fill=fill(kind==='grand'?C.band:C.total);c.font={...(c.font||{}),bold:true,color:{argb:C.navy}};}else{if(r%2===0)c.fill=fill(C.zebra);c.font={...(c.font||{}),size:10};}
    c.alignment={...(c.alignment||{}),vertical:'middle',...(c.numFmt&&i>1?{horizontal:'right'}:{})};}};
  K.note=(ws,r,t,cols)=>{ws.mergeCells(r,1,r,cols);const c=ws.getCell(r,1);c.value=t;c.font={size:8.5,italic:true,color:{argb:C.light}};c.alignment={wrapText:true,vertical:'top'};ws.getRow(r).height=Math.max(15,Math.ceil(t.length/110)*13);};
  // KPI cards across row r..r+3, two columns each: {label, f, r(result), sub:{f,r} | text, ch:{f,r,fmt}}
  K.cards=(ws,r,cards)=>{const tops=[C.navy,'FF2E7D32','FFEF6C00','FF6A1B9A'];
    cards.forEach((cd,j)=>{const c1=1+j*2,c2=c1+1;for(let k=0;k<4;k++)ws.mergeCells(r+k,c1,r+k,c2);
      const t=ws.getCell(r,c1);t.value=cd.label;t.font={bold:true,size:8.5,color:{argb:C.grey}};
      const n=ws.getCell(r+1,c1);n.value={formula:cd.f,result:cd.r};n.numFmt=cd.fmt||K.INR;n.font={bold:true,size:18,color:{argb:cd.r<0?'FFC0392B':C.navy}};
      const m=ws.getCell(r+2,c1);m.value=cd.sub&&typeof cd.sub==='object'?{formula:cd.sub.f,result:cd.sub.r}:(cd.sub||'');m.font={size:9,color:{argb:C.grey}};
      const ch=ws.getCell(r+3,c1);if(cd.ch){ch.value={formula:cd.ch.f,result:cd.ch.r};ch.numFmt=cd.ch.fmt;}ch.font={bold:true,size:9};
      for(let k=0;k<4;k++)for(let cc=c1;cc<=c2;cc++){const x=ws.getCell(r+k,cc);x.fill=fill(C.kpi);x.alignment={horizontal:'left',vertical:'middle',indent:1};
        x.border={top:k===0?{style:'medium',color:{argb:tops[j%4]}}:undefined,bottom:k===3?THIN:undefined,left:cc===c1?THIN:undefined,right:cc===c2?THIN:undefined};}});
    ws.getRow(r+1).height=30;};
  K.link=(ws,r,col,text,target)=>{const c=ws.getCell(r,col);c.value={text,hyperlink:'#'+target};c.font={color:{argb:C.link},underline:true,size:10};return c;};
  return K;
}
// Fills in the stored result of every formula, so viewers that do not recalculate (phone
// previews, WhatsApp, Google Drive) show the right figures. Handles the functions these reports
// use: + − × ÷, comparisons, SUM, ROUND, IF, ABS, MAX, RANK, and cross-sheet references.
function xlFillResults(wb){
  const sheets={};wb.eachSheet(ws=>{sheets[ws.name]=ws;});const memo={},busy={};
  const val=(sn,addr)=>{const key=sn+'!'+addr;if(key in memo)return memo[key];const ws=sheets[sn];if(!ws)return 0;const c=ws.getCell(addr);let v=c.value;
    if(v&&typeof v==='object'&&'formula' in v){if(busy[key])return 0;busy[key]=1;try{v=calc(sn,v.formula);}catch(e){v=v.result;}busy[key]=0;}
    else if(v&&typeof v==='object'&&'text' in v)v=v.text;memo[key]=v;return v;};
  const rng=(sn,a,b)=>{const ws=sheets[sn];if(!ws)return[];const A=ws.getCell(a),B=ws.getCell(b),o=[];for(let r=A.row;r<=B.row;r++)for(let c=A.col;c<=B.col;c++)o.push(val(sn,ws.getCell(r,c).address));return o;};
  const flat=a=>a.flat(9).map(x=>Number(x)||0);
  const calc=(sn,f)=>{const src=f.replace(/(?:'([^']+)'!)?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?(?![\w(])/g,(m,s2,c1,r1,c2,r2)=>c2?'G('+JSON.stringify(s2||sn)+',"'+c1+r1+'","'+c2+r2+'")':'V('+JSON.stringify(s2||sn)+',"'+c1+r1+'")').replace(/<>/g,'!=').replace(/([^<>!=])=([^=])/g,'$1==$2');
    return new Function('V','G','SUM','ROUND','IF','ABS','MAX','RANK','MIN','SUMIF','return '+src)((s2,a)=>{const v=val(s2,a);return v==null||v===''?0:v;},rng,(...a)=>flat(a).reduce((x,y)=>x+y,0),(x,d)=>{const p=Math.pow(10,d);return Math.round(x*p)/p;},(c,a,b)=>c?a:b,Math.abs,(...a)=>Math.max(...flat(a)),(x,arr,o)=>1+flat(arr).filter(y=>o?y<x:y>x).length,(...a)=>Math.min(...flat(a)),(cr,crit,sr)=>cr.reduce((t,c,i)=>t+(String(c)===String(crit)?(Number(sr[i])||0):0),0));};
  wb.eachSheet(ws=>ws.eachRow(row=>row.eachCell(c=>{if(c.isMerged&&c.master!==c)return;const v=c.value;
    if(v&&typeof v==='object'&&'formula' in v&&!/TEXT\(|&"|"&/.test(v.formula)){const res=val(ws.name,c.address);if(typeof res==='number'&&isFinite(res))c.value={formula:v.formula,result:Math.round(res*10000)/10000};}
    else if(v&&typeof v==='object'&&'formula' in v){const m=/^TEXT\((.+),"0\.0%"\)&"(.*)"$/.exec(v.formula);if(m){try{const x=Number(calc(ws.name,m[1]))||0;c.value={formula:v.formula,result:(Math.round(x*1000)/10).toFixed(1)+'%'+m[2]};}catch(e){}}}})));
  return wb;
}
async function xlDownload(wb,filename){
  xlFillResults(wb);
  const buf=await wb.xlsx.writeBuffer();
  const url=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);
}
const RPT_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const rptShort=s=>String((s&&s.name)||'Outlet').split('—')[0].trim();
const rptFile=s=>String(s||'').replace(/[^A-Za-z0-9]+/g,'_');
// Headline figures of one plBuild result.
function rptHeadline(b){
  const sec=n=>(b.sections.find(x=>x.sec===n)||{tot:0}).tot;
  return{rev:b.revenue,dir:sec('Direct cost of service'),gp:b.gross,emp:sec('Employee cost'),opex:sec('Operating expenses'),ebitda:b.ebitda,dep:(b.below||[]).reduce((t,l)=>t+l.amt,0),pbt:b.pbt};
}

// ═══ 1. Outlet Comparison — every outlet side by side for a month ═══
async function buildOutletComparisonWorkbook(salons,year,month){
  await loadExcelJS();
  const wb=new ExcelJS.Workbook();wb.creator='SalonOS';wb.created=new Date();wb.calcProperties.fullCalcOnLoad=true;
  const lbl=RPT_MONTHS[month]+' '+year;
  const K=makeXlKit(wb,'Outlet comparison — '+lbl);const R=n=>Math.round(Number(n)||0);
  const fm=calToFYMI(year,month),pd=new Date(year,month-1,1),pfm=calToFYMI(pd.getFullYear(),pd.getMonth());
  const list=(salons||[]).filter(s=>s&&s.id!=null&&s.status!=='Inactive').map(s=>{let b=null,pb=null;try{b=rptHeadline(plBuild(s.id,fm.fy,fm.mi));}catch(e){}try{pb=rptHeadline(plBuild(s.id,pfm.fy,pfm.mi));}catch(e){}return{s,b,pb};}).filter(x=>x.b);
  const wsS=K.sheet('Summary'),ws=K.sheet('Comparison','FF2E7D32');
  const n=list.length,colOf=i=>String.fromCharCode(66+i),totCol=colOf(n),COLS=n+2;
  // Comparison sheet
  K.banner(ws,'Outlet comparison — '+lbl,'Each outlet’s P&L for the month as the app shows it today. Amount rows are values from each outlet’s P&L; profit rows, the total column and every ratio are formulas.',COLS);
  K.head(ws,4,['Particulars',...list.map(x=>rptShort(x.s)),'All outlets'],2);
  const rows=[['Revenue','rev'],['Direct cost of service','dir'],['Gross profit','gp'],['Employee cost','emp'],['Operating expenses','opex'],['EBITDA','ebitda'],['Depreciation & interest','dep'],['Profit before tax','pbt'],['Revenue last month','prev']];
  const RW={};let r=5;
  rows.forEach(([name,k])=>{RW[k]=r;K.put(ws,r,1,name);
    list.forEach((x,i)=>{const c=colOf(i);
      if(k==='gp')K.put(ws,r,i+2,{f:c+RW.rev+'-'+c+RW.dir,r:R(x.b.rev)-R(x.b.dir)},K.NUM);
      else if(k==='ebitda')K.put(ws,r,i+2,{f:c+RW.gp+'-'+c+RW.emp+'-'+c+RW.opex,r:R(x.b.rev)-R(x.b.dir)-R(x.b.emp)-R(x.b.opex)},K.NUM);
      else if(k==='pbt')K.put(ws,r,i+2,{f:c+RW.ebitda+'-'+c+RW.dep,r:R(x.b.rev)-R(x.b.dir)-R(x.b.emp)-R(x.b.opex)-R(x.b.dep)},K.NUM);
      else K.put(ws,r,i+2,k==='prev'?R(x.pb?x.pb.rev:0):R(x.b[k]),K.NUM);});
    K.put(ws,r,n+2,{f:'SUM(B'+r+':'+colOf(n-1)+r+')',r:0},K.NUM);
    K.style(ws,r,COLS,['gp','ebitda'].includes(k)?'total':k==='pbt'?'grand':undefined);if(k==='prev')ws.getRow(r).font={italic:true};r++;});
  r++;K.band(ws,r,'Ratios',COLS);r++;
  const ratios=[['Gross margin','gp',false],['Employee cost % of revenue','emp',true],['Operating expenses % of revenue','opex',true],['EBITDA margin','ebitda',false],['Net margin (PBT)','pbt',false]];
  const RR={};
  ratios.forEach(([name,k,cost])=>{RR[k]=r;K.put(ws,r,1,name);for(let i=0;i<=n;i++){const c=colOf(i);K.put(ws,r,i+2,{f:'IF('+c+RW.rev+'=0,0,'+c+RW[k]+'/'+c+RW.rev+')',r:0},K.PCT);}K.style(ws,r,COLS);
    ws.addConditionalFormatting({ref:'B'+r+':'+colOf(n-1)+r,rules:[{type:'colorScale',priority:1,cfvo:[{type:'min'},{type:'percentile',value:50},{type:'max'}],color:cost?[{argb:'FF63BE7B'},{argb:'FFFFEB84'},{argb:'FFF8696B'}]:[{argb:'FFF8696B'},{argb:'FFFFEB84'},{argb:'FF63BE7B'}]}]});r++;});
  K.put(ws,r,1,'Revenue growth vs last month');for(let i=0;i<=n;i++){const c=colOf(i);K.put(ws,r,i+2,{f:'IF('+c+RW.prev+'=0,0,('+c+RW.rev+'-'+c+RW.prev+')/ABS('+c+RW.prev+'))',r:0},K.UP_GOOD);}K.style(ws,r,COLS);const growthRow=r;r++;
  K.put(ws,r,1,'Rank by EBITDA margin (1 = best)');for(let i=0;i<n;i++){const c=colOf(i);K.put(ws,r,i+2,{f:'RANK('+c+RR.ebitda+',$B$'+RR.ebitda+':$'+colOf(n-1)+'$'+RR.ebitda+',0)',r:0},'0');}K.style(ws,r,COLS,'total');r++;
  if(n)ws.addConditionalFormatting({ref:'B'+RW.rev+':'+colOf(n-1)+RW.rev,rules:[{type:'dataBar',priority:2,minLength:0,maxLength:100,cfvo:[{type:'num',value:0},{type:'max'}],color:{argb:'FF63BE7B'}}]});
  for(let rr=4;rr<r;rr++){const c=ws.getCell(totCol+rr);c.border={...(c.border||K.BORDER),left:{style:'medium',color:{argb:K.C.navy}}};}
  ws.columns=[{width:32},...list.map(()=>({width:15})),{width:16}];K.setup(ws,n>5,4);
  // Summary
  {const W=wsS,COLS2=8,ref=c=>"'Comparison'!"+c;
    const tot=k=>list.reduce((t,x)=>t+R(x.b[k]),0),totRev=tot('rev'),prevRev=list.reduce((t,x)=>t+R(x.pb?x.pb.rev:0),0);
    const ebitda=totRev-tot('dir')-tot('emp')-tot('opex'),pbt=ebitda-tot('dep');
    K.banner(W,'All outlets — '+lbl,n+' outlets. Figures linked to the Comparison sheet; ranking by EBITDA margin.',COLS2);
    K.cards(W,4,[{label:'REVENUE — ALL OUTLETS',f:ref(totCol+RW.rev),r:totRev,sub:'last month ₹'+prevRev.toLocaleString('en-IN'),ch:{f:ref(totCol+growthRow),r:prevRev?(totRev-prevRev)/Math.abs(prevRev):0,fmt:'[Color10]▲ 0.0%" vs last month";[Red]▼ 0.0%" vs last month";"same as last month"'}},
      {label:'GROSS PROFIT',f:ref(totCol+RW.gp),r:totRev-tot('dir'),sub:{f:'TEXT('+ref(totCol+RR.gp)+',"0.0%")&" of revenue"',r:''}},
      {label:'EBITDA',f:ref(totCol+RW.ebitda),r:ebitda,sub:{f:'TEXT('+ref(totCol+RR.ebitda)+',"0.0%")&" margin"',r:''}},
      {label:'PROFIT BEFORE TAX',f:ref(totCol+RW.pbt),r:pbt,sub:{f:'TEXT('+ref(totCol+RR.pbt)+',"0.0%")&" net margin"',r:''}}]);
    let rr=9;K.band(W,rr,'Ranking — best EBITDA margin first',COLS2);rr++;
    K.head(W,rr,['#','Outlet','Revenue ₹','Growth','Gross margin','Employee %','EBITDA margin','PBT ₹'],3);rr++;
    const order=list.map((x,i)=>({x,i,m:x.b.rev?(x.b.rev-x.b.dir-x.b.emp-x.b.opex)/x.b.rev:-9})).sort((a,b)=>b.m-a.m);
    order.forEach((o,j)=>{const c=colOf(o.i);K.put(W,rr,1,j+1,'0');K.put(W,rr,2,rptShort(o.x.s));K.put(W,rr,3,{f:ref(c+RW.rev),r:R(o.x.b.rev)},K.NUM);K.put(W,rr,4,{f:ref(c+growthRow),r:0},K.UP_GOOD);
      K.put(W,rr,5,{f:ref(c+RR.gp),r:0},K.PCT);K.put(W,rr,6,{f:ref(c+RR.emp),r:0},K.PCT);K.put(W,rr,7,{f:ref(c+RR.ebitda),r:o.m>-9?o.m:0},K.PCT);K.put(W,rr,8,{f:ref(c+RW.pbt),r:0},K.NUM);
      K.style(W,rr,COLS2);W.getCell(rr,1).font={bold:true,color:{argb:j===0?'FF2E7D32':j===order.length-1&&order.length>1?'FFC0392B':K.C.grey}};rr++;});
    if(order.length)W.addConditionalFormatting({ref:'C11:C'+(rr-1),rules:[{type:'dataBar',priority:1,minLength:0,maxLength:100,cfvo:[{type:'num',value:0},{type:'max'}],color:{argb:'FF63BE7B'}}]});
    rr++;K.note(W,rr,'Open the Comparison sheet for every line and ratio by outlet. Colour scales: green = better (lower is better for cost ratios).',COLS2);
    W.columns=[{width:6},{width:26},{width:15},{width:11},{width:13},{width:12},{width:14},{width:15}];K.setup(W,false,0);}
  return{wb,filename:'Outlet_Comparison_'+year+'-'+String(month+1).padStart(2,'0')+'.xlsx'};
}

// ═══ 2. Period P&L — several months side by side with a total (quarter, FY to date, any range) ═══
async function buildPeriodPnlWorkbook(sid,salon,from,to){
  await loadExcelJS();
  const months=[];for(let d=new Date(from.year,from.month,1);d<=new Date(to.year,to.month,1);d=new Date(d.getFullYear(),d.getMonth()+1,1))months.push({year:d.getFullYear(),month:d.getMonth()});
  if(!months.length)throw new Error('“From” month is after “To” month.');
  if(months.length>24)throw new Error('Choose up to 24 months.');
  const wb=new ExcelJS.Workbook();wb.creator='SalonOS';wb.created=new Date();wb.calcProperties.fullCalcOnLoad=true;
  const short=m=>RPT_MONTHS[m.month].slice(0,3)+' '+String(m.year).slice(2);
  const rangeLbl=short(months[0])+' – '+short(months[months.length-1]);
  const outlet=rptShort(salon);
  const K=makeXlKit(wb,outlet+' — P&L '+rangeLbl);const R=n=>Math.round(Number(n)||0);
  const builds=months.map(m=>{const fm=calToFYMI(m.year,m.month);try{return plBuild(sid,fm.fy,fm.mi);}catch(e){return null;}});
  const wsS=K.sheet('Summary'),ws=K.sheet('Period P&L','FF2E7D32');
  const n=months.length,colOf=i=>{let x=i+2,s='';while(x>0){const m=(x-1)%26;s=String.fromCharCode(65+m)+s;x=Math.floor((x-1)/26);}return s;},TC=colOf(n),PC=colOf(n+1),COLS=n+3;
  K.banner(ws,'P&L — '+outlet+' · '+rangeLbl,months.length+' months side by side as the app shows them today. Lines, section totals, profits and the total column are formulas; % of revenue on the total.',COLS);
  K.head(ws,4,['Particulars',...months.map(short),'Total','% of revenue'],2);
  let r=5;const P={};const val=(b,sec,name)=>{if(!b)return 0;const S=b.sections.find(x=>x.sec===sec);const l=S&&S.lines.find(x=>x.name===name);return l?R(l.amt):0;};
  const block=(sec,title,key)=>{
    const names=[];builds.forEach(b=>{const S=b&&b.sections.find(x=>x.sec===sec);(S?S.lines:[]).forEach(l=>{if(!names.includes(l.name))names.push(l.name);});});
    const used=names.filter(nm=>builds.some(b=>val(b,sec,nm)));
    K.band(ws,r,title,COLS);r++;const st=r;
    used.forEach(nm=>{K.put(ws,r,1,nm.replace('Revenue from Operations - ','Revenue — '));builds.forEach((b,i)=>K.put(ws,r,i+2,val(b,sec,nm),K.NUM));
      K.put(ws,r,n+2,{f:'SUM(B'+r+':'+colOf(n-1)+r+')',r:builds.reduce((t,b)=>t+val(b,sec,nm),0)},K.NUM);K.style(ws,r,COLS);r++;});
    if(!used.length){K.put(ws,r,1,'—');K.style(ws,r,COLS);r++;}
    K.put(ws,r,1,'Total '+title.replace(/^[A-E]\. /,'').toLowerCase());for(let i=0;i<=n;i++){const c=colOf(i);K.put(ws,r,i+2,{f:'SUM('+c+st+':'+c+(r-1)+')',r:0},K.NUM);}K.style(ws,r,COLS,'total');P[key]=r;r+=2;};
  const derived=(label,key,parts)=>{K.put(ws,r,1,label);for(let i=0;i<=n;i++){const c=colOf(i);K.put(ws,r,i+2,{f:parts.map(([k,sg],j)=>(j?(sg>0?'+':'-'):'')+c+P[k]).join(''),r:0},K.NUM);}K.style(ws,r,COLS,key==='pbt'?'grand':'total');P[key]=r;r+=2;};
  block('Revenue','A. Revenue from operations','rev');block('Direct cost of service','B. Direct cost of service','dir');derived('GROSS PROFIT (A − B)','gp',[['rev',1],['dir',-1]]);
  block('Employee cost','C. Employee cost','emp');block('Operating expenses','D. Operating expenses','opex');derived('EBITDA','ebitda',[['gp',1],['emp',-1],['opex',-1]]);
  // depreciation
  {const names=[];builds.forEach(b=>(b?b.below:[]).forEach(l=>{if(!names.includes(l.name))names.push(l.name);}));const used=names.filter(nm=>builds.some(b=>b&&R((b.below.find(l=>l.name===nm)||{}).amt)));
    K.band(ws,r,'E. Depreciation & interest',COLS);r++;const st=r;
    used.forEach(nm=>{K.put(ws,r,1,nm);builds.forEach((b,i)=>K.put(ws,r,i+2,b?R((b.below.find(l=>l.name===nm)||{}).amt):0,K.NUM));K.put(ws,r,n+2,{f:'SUM(B'+r+':'+colOf(n-1)+r+')',r:0},K.NUM);K.style(ws,r,COLS);r++;});
    if(!used.length){K.put(ws,r,1,'—');K.style(ws,r,COLS);r++;}
    K.put(ws,r,1,'Total depreciation & interest');for(let i=0;i<=n;i++){const c=colOf(i);K.put(ws,r,i+2,{f:'SUM('+c+st+':'+c+(r-1)+')',r:0},K.NUM);}K.style(ws,r,COLS,'total');P.dep=r;r+=2;}
  derived('PROFIT BEFORE TAX','pbt',[['ebitda',1],['dep',-1]]);
  for(let rr=5;rr<r;rr++){const c=ws.getCell(TC+rr);if(c.isMerged)continue;if(c.value!=null){K.put(ws,rr,n+3,{f:'IF($'+TC+'$'+P.rev+'=0,0,'+TC+rr+'/$'+TC+'$'+P.rev+')',r:0},K.PCT);const x=ws.getCell(PC+rr);x.border=c.border;x.fill=c.fill;x.font=c.font;x.alignment={horizontal:'right'};}
    c.border={...(c.border||K.BORDER),left:{style:'medium',color:{argb:K.C.navy}}};}
  ws.columns=[{width:36},...months.map(()=>({width:13})),{width:15},{width:11}];K.setup(ws,n>4,4);
  // Summary
  {const W=wsS,COLS2=8,ref=c=>"'Period P&L'!"+c,H=builds.map(b=>b?rptHeadline(b):{rev:0,gp:0,ebitda:0,pbt:0,emp:0,opex:0,dir:0,dep:0});
    const sum=k=>H.reduce((t,x)=>t+R(x[k]),0),rv=sum('rev');
    K.banner(W,outlet+' — P&L '+rangeLbl,months.length+' months. Totals linked to the Period P&L sheet; month-by-month trend below.',COLS2);
    K.cards(W,4,[{label:'REVENUE',f:ref(TC+P.rev),r:rv,sub:'avg ₹'+Math.round(rv/n).toLocaleString('en-IN')+' a month'},
      {label:'GROSS PROFIT',f:ref(TC+P.gp),r:sum('gp'),sub:{f:'TEXT('+ref(PC+P.gp)+',"0.0%")&" of revenue"',r:''}},
      {label:'EBITDA',f:ref(TC+P.ebitda),r:sum('ebitda'),sub:{f:'TEXT('+ref(PC+P.ebitda)+',"0.0%")&" margin"',r:''}},
      {label:'PROFIT BEFORE TAX',f:ref(TC+P.pbt),r:sum('pbt'),sub:{f:'TEXT('+ref(PC+P.pbt)+',"0.0%")&" net margin"',r:''}}]);
    let rr=9;K.band(W,rr,'Month by month',COLS2);rr++;
    K.head(W,rr,['Month','','Revenue ₹','Gross profit ₹','EBITDA ₹','EBITDA margin','PBT ₹','Net margin'],3);rr++;const st=rr;
    months.forEach((m,i)=>{const c=colOf(i);W.mergeCells(rr,1,rr,2);K.put(W,rr,1,RPT_MONTHS[m.month]+' '+m.year);K.put(W,rr,3,{f:ref(c+P.rev),r:R(H[i].rev)},K.NUM);K.put(W,rr,4,{f:ref(c+P.gp),r:R(H[i].gp)},K.NUM);
      K.put(W,rr,5,{f:ref(c+P.ebitda),r:R(H[i].ebitda)},K.NUM);K.put(W,rr,6,{f:'IF(C'+rr+'=0,0,E'+rr+'/C'+rr+')',r:H[i].rev?H[i].ebitda/H[i].rev:0},K.PCT);K.put(W,rr,7,{f:ref(c+P.pbt),r:R(H[i].pbt)},K.NUM);K.put(W,rr,8,{f:'IF(C'+rr+'=0,0,G'+rr+'/C'+rr+')',r:H[i].rev?H[i].pbt/H[i].rev:0},K.PCT);K.style(W,rr,COLS2);rr++;});
    W.mergeCells(rr,1,rr,2);K.put(W,rr,1,'Total');['C','D','E','G'].forEach(c=>K.put(W,rr,{C:3,D:4,E:5,G:7}[c],{f:'SUM('+c+st+':'+c+(rr-1)+')',r:0},K.NUM));K.put(W,rr,6,{f:'IF(C'+rr+'=0,0,E'+rr+'/C'+rr+')',r:0},K.PCT);K.put(W,rr,8,{f:'IF(C'+rr+'=0,0,G'+rr+'/C'+rr+')',r:0},K.PCT);K.style(W,rr,COLS2,'grand');
    W.addConditionalFormatting({ref:'C'+st+':C'+(rr-1),rules:[{type:'dataBar',priority:1,minLength:0,maxLength:100,cfvo:[{type:'num',value:0},{type:'max'}],color:{argb:'FF63BE7B'}}]});
    W.addConditionalFormatting({ref:'F'+st+':F'+(rr-1),rules:[{type:'colorScale',priority:2,cfvo:[{type:'min'},{type:'percentile',value:50},{type:'max'}],color:[{argb:'FFF8696B'},{argb:'FFFFEB84'},{argb:'FF63BE7B'}]}]});
    W.columns=[{width:14},{width:10},{width:15},{width:15},{width:15},{width:13},{width:15},{width:12}];K.setup(W,false,0);}
  return{wb,filename:'PnL_'+rptFile(outlet)+'_'+months[0].year+'-'+String(months[0].month+1).padStart(2,'0')+'_to_'+months[n-1].year+'-'+String(months[n-1].month+1).padStart(2,'0')+'.xlsx'};
}
// Period picker for the Period P&L report.
function PeriodReportModal({salon,period,onClose}){
  const h=React.createElement;const {toast}=useToast();
  const c=periodToCalendar(period)||{year:new Date().getFullYear(),month:new Date().getMonth()};
  const fyStartYear=c.month>=3?c.year:c.year-1;
  const iso=(y,m)=>y+'-'+String(m+1).padStart(2,'0');
  const [from,setFrom]=useState(iso(fyStartYear,3)),[to,setTo]=useState(iso(c.year,c.month)),[busy,setBusy]=useState(false);
  const q=Math.floor(((c.month+9)%12)/3);const qStart=new Date(fyStartYear,3+q*3,1);
  const presets=[['This quarter',iso(qStart.getFullYear(),qStart.getMonth()),iso(c.year,c.month)],['FY to date',iso(fyStartYear,3),iso(c.year,c.month)],['Last 6 months',iso(new Date(c.year,c.month-5,1).getFullYear(),new Date(c.year,c.month-5,1).getMonth()),iso(c.year,c.month)],['Last FY',iso(fyStartYear-1,3),iso(fyStartYear,2)]];
  const go=async()=>{setBusy(true);try{const p=s=>({year:Number(s.slice(0,4)),month:Number(s.slice(5,7))-1});const {wb,filename}=await buildPeriodPnlWorkbook(salon.id,salon,p(from),p(to));await xlDownload(wb,filename);toast(filename+' downloaded','success');onClose();}catch(e){toast(e.message||String(e),'error');}setBusy(false);};
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:460},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'📅 P&L for a period (Excel)'),
    h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}},presets.map(([l,a,b])=>h('button',{key:l,className:'btn btn-sm '+(from===a&&to===b?'btn-primary':'btn-ghost'),onClick:()=>{setFrom(a);setTo(b);}},l))),
    h('div',{className:'form-row cols2'},h('div',{className:'form-group'},h('label',null,'From month'),h('input',{type:'month',className:'form-control',value:from,onChange:e=>setFrom(e.target.value)})),
      h('div',{className:'form-group'},h('label',null,'To month'),h('input',{type:'month',className:'form-control',value:to,onChange:e=>setTo(e.target.value)}))),
    h('div',{className:'help-note'},'Each month side by side with a total column and % of revenue, plus a summary with the month-by-month trend.'),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Cancel'),h('button',{className:'btn btn-primary',disabled:busy,onClick:go},busy?'Building…':'⬇ Download'))));
}

// ═══ 3. Stylist performance — sales, productivity and staff cost per person ═══
async function buildStylistWorkbook(sid,salon,year,month){
  await loadExcelJS();
  const wb=new ExcelJS.Workbook();wb.creator='SalonOS';wb.created=new Date();wb.calcProperties.fullCalcOnLoad=true;
  const lbl=RPT_MONTHS[month]+' '+year,outlet=rptShort(salon);
  const K=makeXlKit(wb,outlet+' — Stylist performance '+lbl);const R=n=>Math.round(Number(n)||0);
  const rows=staffProductivityFor(sid,year,month);
  const sw={};(swWorkingsFor(sid,year,month)||[]).forEach(e=>{sw[e.id]=e;});
  const inc={};(incWorkingsFor(sid,year,month)||[]).forEach(e=>{inc[e.id]=e;});
  const ready=salaryAttendanceReady(sid,year,month);
  const ws=K.sheet('Stylist performance'),COLS=15;
  K.banner(ws,'Stylist performance — '+outlet+' · '+lbl,'Sales per stylist (CRADLE staff report, else Incentive Working), days worked from Attendance, salary cost from Salary Working'+(ready?'':' (attendance not final — salary shown as Master Salary gross)')+', incentive from Incentive Working. Totals, per-day sale and cost % are formulas.',COLS);
  K.head(ws,4,['Employee','Designation','Days worked','Service sale ₹','Product sale ₹','Membership sale ₹','Total sale ₹','Sale per day ₹','Salary cost ₹','Incentive ₹','Total staff cost ₹','Cost % of sale','Clients','Repeat clients %','Chair use %'],3);
  let r=5;const st=r;
  rows.forEach(x=>{const e=x.e,s=sw[e.id]||{},sal=ready?R((s.grossAfterLop||0)+(s.tea||0)+(s.pfEr||0)+(s.esicEr||0)):R(e.gross),ic=R((inc[e.id]||{}).totalInc);
    K.put(ws,r,1,e.name);K.put(ws,r,2,e.desig||'');K.put(ws,r,3,x.worked,'0.0');K.put(ws,r,4,R(x.svc),K.NUM);K.put(ws,r,5,R(x.prod),K.NUM);K.put(ws,r,6,R(x.mem),K.NUM);
    K.put(ws,r,7,{f:'SUM(D'+r+':F'+r+')',r:R(x.svc)+R(x.prod)+R(x.mem)},K.NUM);K.put(ws,r,8,{f:'IF(C'+r+'=0,0,ROUND(G'+r+'/C'+r+',0))',r:x.worked?Math.round((R(x.svc)+R(x.prod)+R(x.mem))/x.worked):0},K.NUM);
    K.put(ws,r,9,sal,K.NUM);K.put(ws,r,10,ic,K.NUM);K.put(ws,r,11,{f:'I'+r+'+J'+r,r:sal+ic},K.NUM);K.put(ws,r,12,{f:'IF(G'+r+'=0,0,K'+r+'/G'+r+')',r:0},K.PCT);
    K.put(ws,r,13,x.clients||0,'0');K.put(ws,r,14,x.repeatPct==null?'—':x.repeatPct/100,K.PCT);K.put(ws,r,15,x.util==null?'—':x.util/100,K.PCT);K.style(ws,r,COLS);r++;});
  if(!rows.length){K.put(ws,r,1,'No stylists for the month');K.style(ws,r,COLS);r++;}
  K.put(ws,r,1,'Total');['C','D','E','F','G','I','J','K','M'].forEach(c=>K.put(ws,r,c.charCodeAt(0)-64,{f:'SUM('+c+st+':'+c+(r-1)+')',r:0},c==='C'?'0.0':c==='M'?'0':K.NUM));
  K.put(ws,r,8,{f:'IF(C'+r+'=0,0,ROUND(G'+r+'/C'+r+',0))',r:0},K.NUM);K.put(ws,r,12,{f:'IF(G'+r+'=0,0,K'+r+'/G'+r+')',r:0},K.PCT);K.style(ws,r,COLS,'grand');
  if(rows.length){ws.addConditionalFormatting({ref:'H'+st+':H'+(r-1),rules:[{type:'dataBar',priority:1,minLength:0,maxLength:100,cfvo:[{type:'num',value:0},{type:'max'}],color:{argb:'FF63BE7B'}}]});
    ws.addConditionalFormatting({ref:'L'+st+':L'+(r-1),rules:[{type:'colorScale',priority:2,cfvo:[{type:'min'},{type:'percentile',value:50},{type:'max'}],color:[{argb:'FF63BE7B'},{argb:'FFFFEB84'},{argb:'FFF8696B'}]}]});}
  r+=2;K.note(ws,r,'Read it as: sale per day shows who produces most for each day at work (bars); cost % of sale shows whose pay + incentive is high for what they sell (green low, red high). Repeat clients = clients billed more than once in 90 days (SalonOS Billing). Chair use = booked minutes ÷ 9-hour days worked.',COLS);
  ws.columns=[{width:22},{width:18},{width:9},{width:13},{width:12},{width:13},{width:13},{width:12},{width:12},{width:11},{width:13},{width:10},{width:8},{width:10},{width:9}];K.setup(ws,true,4);
  return{wb,filename:'Stylist_Performance_'+rptFile(outlet)+'_'+year+'-'+String(month+1).padStart(2,'0')+'.xlsx'};
}

// ═══ 4. Service profitability — price vs product cost and commission per service ═══
async function buildServiceProfitWorkbook(sid,salon,invoices){
  await loadExcelJS();
  const wb=new ExcelJS.Workbook();wb.creator='SalonOS';wb.created=new Date();wb.calcProperties.fullCalcOnLoad=true;
  const outlet=rptShort(salon);const K=makeXlKit(wb,outlet+' — Service profitability');const R=n=>Math.round(Number(n)||0);
  const rows=priceCheckRows(sid,invoices).filter(x=>x.rate>0);
  const lim=s5Limits(sid);
  const ws=K.sheet('Service profitability'),COLS=9;
  K.banner(ws,'Service profitability — '+outlet,'Average price charged (SalonOS Billing, else the price list) less product used per service (Inventory → standard usage × item rate) and stylist commission (highest commission slab). Target margin '+lim.margin+'% — rows below it are flagged.',COLS);
  K.head(ws,4,['Service','Times sold','Average price ₹','Product cost ₹','Commission ₹','Margin ₹','Margin %','Below target?','Product usage set?'],2);
  let r=5;const st=r;
  rows.forEach(x=>{K.put(ws,r,1,x.name);K.put(ws,r,2,x.sold,'0');K.put(ws,r,3,R(x.rate),K.NUM);K.put(ws,r,4,R(x.prod),K.NUM);K.put(ws,r,5,R(x.commission),K.NUM);
    K.put(ws,r,6,{f:'C'+r+'-D'+r+'-E'+r,r:R(x.rate)-R(x.prod)-R(x.commission)},K.NUM);K.put(ws,r,7,{f:'IF(C'+r+'=0,0,F'+r+'/C'+r+')',r:0},K.PCT);
    K.put(ws,r,8,{f:'IF(G'+r+'<'+(lim.margin/100)+',"Yes","")',r:x.low?'Yes':''});K.put(ws,r,9,x.hasUsage?'Yes':'No — set standard usage');K.style(ws,r,COLS);r++;});
  if(rows.length){ws.addConditionalFormatting({ref:'G'+st+':G'+(r-1),rules:[{type:'colorScale',priority:1,cfvo:[{type:'min'},{type:'percentile',value:50},{type:'max'}],color:[{argb:'FFF8696B'},{argb:'FFFFEB84'},{argb:'FF63BE7B'}]}]});
    ws.addConditionalFormatting({ref:'B'+st+':B'+(r-1),rules:[{type:'dataBar',priority:2,minLength:0,maxLength:100,cfvo:[{type:'num',value:0},{type:'max'}],color:{argb:'FF5B9BD5'}}]});}
  r++;K.note(ws,r,'Sorted from the weakest margin. Services without standard product usage show product cost 0 — set it in Inventory → Standard usage for a true margin.',COLS);
  ws.columns=[{width:30},{width:10},{width:14},{width:13},{width:13},{width:12},{width:10},{width:12},{width:22}];K.setup(ws,true,4);
  return{wb,filename:'Service_Profitability_'+rptFile(outlet)+'.xlsx'};
}

// Small button that builds one report workbook and downloads it.
function XlReportButton({label,build,title}){
  const h=React.createElement;const {toast}=useToast();const [busy,setBusy]=useState(false);
  return h('button',{className:'btn btn-ghost btn-sm',title:title||'',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},disabled:busy,onClick:async()=>{setBusy(true);
    try{const {wb,filename}=await build();await xlDownload(wb,filename);toast(filename+' downloaded','success');}catch(e){toast('Could not build the report: '+(e.message||e),'error');}setBusy(false);}},busy?'Working…':(label||'⬇ Excel'));
}
