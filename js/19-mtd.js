// ── MTD P&L (P&L (Monthly) → MTD P&L) — the month so far, up to the last day with Daily Sales
// entries, so a running month can be read like a finished one:
//   • exact to date: revenue (from the month's revenue source, by date), Daily Sales & Exp costs,
//     purchases, bank charges and vendor bills booked so far, daily incentives;
//   • pro-rata for the days elapsed: salary (from Master Salary gross until the month's attendance
//     is final), PF / ESIC employer share, recurring commitments (rent, maintenance, …),
//     depreciation and interest;
//   • projected full month: daily-run items scaled up to the whole month, fixed items at full.
// Previous month (full) alongside for comparison.

function mtdLastEntryDay(sid,year,month){
  let ds={};try{ds=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',sid))||'{}')||{};}catch(e){}
  const pre=year+'-'+String(month+1).padStart(2,'0')+'-';
  let last=0;
  Object.keys(ds).forEach(iso=>{if(iso.startsWith(pre)&&Object.values(ds[iso]||{}).some(v=>Number(v))){const d=Number(iso.slice(8,10));if(d>last)last=d;}});
  return last;
}
function mtdRevenueGrossTo(sid,year,month,day){
  const pre=year+'-'+String(month+1).padStart(2,'0')+'-';
  const upto=pre+String(day).padStart(2,'0');
  if(plRevenueSourceFor(sid,year,month)==='dse')
    return dseSalesRowsForMonth(sid,year,month).filter(r=>r.id<=upto).reduce((t,r)=>({cash:t.cash+r.cash,card:t.card+r.card,upi:t.upi+r.upi}),{cash:0,card:0,upi:0});
  const t={cash:0,card:0,upi:0};
  (collectionRowsForMonth(sid,year,month)||[]).forEach(r=>{const iso=toISO(r.invoiceDate);if(!iso||iso>upto)return;t.cash+=Number(r.cash)||0;t.card+=Number(r.card)||0;t.upi+=Number(r.upi)||0;});
  return t;
}
function mtdPnlFor(sid,year,month){
  const {fy,mi}=calToFYMI(year,month);
  const days=new Date(year,month+1,0).getDate();
  const now=new Date();
  const isCurrent=year===now.getFullYear()&&month===now.getMonth();
  const isPast=year<now.getFullYear()||(year===now.getFullYear()&&month<now.getMonth());
  let day=isPast?days:mtdLastEntryDay(sid,year,month);
  if(!isPast&&!day)day=Math.max(1,now.getDate()-1);
  const f=Math.min(1,day/days);
  const full=plBuild(sid,fy,mi);
  const salaryFinal=salaryAttendanceReady(sid,year,month);
  const rest=isRestaurantOutlet(sid);
  // Salary estimate by department while the month is open: Master Salary gross × days elapsed.
  const emps=getEmployeesForMonth(year,month,sid)||[];
  const roleMap=PL_ROLE_MAP.filter(r=>!r.biz||r.biz===bizKeyOf(sid));
  const grossByLabel={};roleMap.forEach(r=>{grossByLabel[r.salaryLabel]=emps.filter(e=>e.dept===r.dept).reduce((t,e)=>t+(Number(e.gross)||0),0);});
  const st=statutoryDeductionsFor(sid,year,month)||[];
  const pfErFull=st.reduce((t,e)=>t+(Number(e.pfEr)||0),0),esicErFull=st.reduce((t,e)=>t+(Number(e.esicEr)||0),0);
  const sections=full.sections.map(S=>{
    let lines;
    if(S.sec==='Revenue'){
      const g=rest?null:mtdRevenueGrossTo(sid,year,month,day);
      lines=S.lines.map(l=>{
        if(!rest&&/Cash Sale$/.test(l.name))return{name:l.name,mtd:g.cash/1.05,kind:'var'};
        if(!rest&&/Card Sale$/.test(l.name))return{name:l.name,mtd:g.card/1.05,kind:'var'};
        if(!rest&&/UPI Sale$/.test(l.name))return{name:l.name,mtd:g.upi/1.05,kind:'var'};
        return{name:l.name,mtd:l.amt,kind:l.name==='Other Income'?'fixed':'var'};
      });
    }else if(S.sec==='Employee cost'){
      lines=S.lines.map(l=>{
        if(!salaryFinal&&Object.prototype.hasOwnProperty.call(grossByLabel,l.name))return{name:l.name,group:l.group,fullFixed:grossByLabel[l.name],mtd:grossByLabel[l.name]*f,kind:'fixed',est:true};
        if(!salaryFinal&&l.name==='PF Employer Contribution')return{name:l.name,fullFixed:pfErFull,mtd:pfErFull*f,kind:'fixed',est:true};
        if(!salaryFinal&&l.name==='ESIC Employer Contribution')return{name:l.name,fullFixed:esicErFull,mtd:esicErFull*f,kind:'fixed',est:true};
        return{name:l.name,group:l.group,mtd:l.amt,kind:l.group==='Employee Daily Incentive'?'var':'fixed',fullFixed:l.amt};
      });
    }else if(S.sec==='Operating expenses'){
      lines=S.lines.map(l=>{
        let a=null;try{a=operatingExpenseAnnexureFor(sid,year,month,l.name);}catch(e){}
        if(!a)return{name:l.name,mtd:l.amt,kind:'var'};
        const sign=a.isCredit?-1:1;
        const rec=(Number(a.recurringTotal)||0)*sign;
        const lumpy=((Number(a.bankAmt)||0)+(Number(a.vendorAmt)||0)+(Number(a.recoAmt)||0))*sign;
        const daily=l.amt-rec-lumpy; // Daily Sales & Exp part
        return{name:l.name,mtd:rec*f+lumpy+daily,recFull:rec,lumpy,daily,kind:'opex'};
      });
    }else{
      lines=S.lines.map(l=>({name:l.name,mtd:l.amt,kind:'var'}));
    }
    lines.forEach(x=>{
      x.proj=x.kind==='fixed'?(x.fullFixed!=null?x.fullFixed:x.mtd)
        :x.kind==='opex'?x.recFull+x.lumpy+(f>0?x.daily/f:0)
        :(f>0?x.mtd/f:x.mtd);
      x.full=(full.sections.find(y=>y.sec===S.sec).lines.find(y=>y.name===x.name)||{}).amt||0;
    });
    return{sec:S.sec,sign:S.sign,lines,mtd:lines.reduce((t,x)=>t+x.mtd,0),proj:lines.reduce((t,x)=>t+x.proj,0)};
  });
  const below=full.below.map(l=>({name:l.name,mtd:l.amt*f,proj:l.amt}));
  const sec=n=>sections.find(s=>s.sec===n)||{mtd:0,proj:0};
  const tot=k=>{const rev=sec('Revenue')[k],dir=sec('Direct cost of service')[k],emp=sec('Employee cost')[k],opx=sec('Operating expenses')[k],bel=below.reduce((t,l)=>t+l[k],0);
    return{revenue:rev,gross:rev-dir,ebitda:rev-dir-emp-opx,pbt:rev-dir-emp-opx-bel};};
  return{day,days,f,isCurrent,isPast,salaryFinal,sections,below,mtd:tot('mtd'),proj:tot('proj'),full};
}
function MtdPnlSheet({salon,period}={}){
  const h=React.createElement;
  const {toast}=useToast();
  const init=periodToCalendar(period);
  const [cal,setCal]=useState(init||{year:new Date().getFullYear(),month:new Date().getMonth()});
  useEffect(()=>{const c=periodToCalendar(period);if(c)setCal(c);
    // eslint-disable-next-line
  },[period&&period.mi,period&&period.fy]);
  const [open,setOpen]=useState({});
  const [tTick,setTTick]=useState(0);
  const sid=salon?.id;
  const M=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const r=mtdPnlFor(sid,cal.year,cal.month);
  const pd=new Date(cal.year,cal.month-1,1);
  const prevFm=calToFYMI(pd.getFullYear(),pd.getMonth());
  const prev=plBuild(sid,prevFm.fy,prevFm.mi);
  const prevLine=(sec,name)=>{const s=prev.sections.find(x=>x.sec===sec);const l=s&&s.lines.find(x=>x.name===name);return l?l.amt:0;};
  const prevSec=sec=>{const s=prev.sections.find(x=>x.sec===sec);return s?s.tot:0;};
  const money=n=>(n<0?'-':'')+'₹'+Math.round(Math.abs(Number(n)||0)).toLocaleString('en-IN');
  const pctOf=(n,base)=>base?(Math.round(n/base*1000)/10)+'%':'—';
  const label=M[cal.month]+' '+cal.year;
  const shift=k=>{const d=new Date(cal.year,cal.month+k,1);setCal({year:d.getFullYear(),month:d.getMonth()});};
  const shortM=M[cal.month].slice(0,3);
  const cell=(v,st)=>h('td',{style:{textAlign:'right',whiteSpace:'nowrap',...(st||{})}},v);
  const totalRow=(lab,mtd,proj,pv,col)=>h('tr',{style:{background:'var(--bg3)',fontWeight:700}},h('td',{style:{color:col}},lab),cell(money(mtd),{color:col}),cell(pctOf(mtd,r.mtd.revenue)),cell(money(proj)),cell(money(pv)));
  const [xlBusy,setXlBusy]=useState(false);
  const exportReport=async()=>{
    setXlBusy(true);
    try{
      const {wb,filename}=await buildMtdPnlWorkbook(sid,salon,cal);
      const buf=await wb.xlsx.writeBuffer();
      const url=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);
      toast(filename+' downloaded — dashboard, MTD statement and workings, linked by formula','success');
    }catch(e){toast(e.message||String(e),'error');}
    setXlBusy(false);
  };
  const exportX=async()=>{
    try{
      const rows=[['Particulars','MTD (1–'+r.day+' '+shortM+')','% of rev','Projected full month','Previous month']];
      r.sections.forEach(S=>{rows.push([S.sec,Math.round(S.mtd),'',Math.round(S.proj),Math.round(prevSec(S.sec))]);S.lines.forEach(l=>rows.push(['   '+l.name+(l.est?' (est.)':''),Math.round(l.mtd),'',Math.round(l.proj),Math.round(prevLine(S.sec,l.name))]));});
      r.below.forEach(l=>rows.push([l.name,Math.round(l.mtd),'',Math.round(l.proj),Math.round((prev.below.find(x=>x.name===l.name)||{}).amt||0)]));
      rows.push(['EBITDA',Math.round(r.mtd.ebitda),'',Math.round(r.proj.ebitda),Math.round(prev.ebitda)],['Profit before tax',Math.round(r.mtd.pbt),'',Math.round(r.proj.pbt),Math.round(prev.pbt)]);
      await afDownloadXlsx('MTD P&L',rows,'MTD_PnL_'+String(salon&&salon.name||'Outlet').split('—')[0].trim().replace(/[^A-Za-z0-9]+/g,'_')+'_'+cal.year+'-'+String(cal.month+1).padStart(2,'0')+'_upto_'+r.day+'.xlsx');
    }catch(e){toast(e.message||String(e),'error');}
  };
  const metric=(l,v,s,col)=>h('div',{className:'metric-card'},h('div',{className:'metric-label'},l),h('div',{className:'metric-value',style:{color:col,fontSize:22}},v),h('div',{className:'metric-sub'},s));
  return h('div',null,
    h('div',{className:'section-header'},
      h('div',null,h('div',{className:'page-title'},'MTD P&L'),
        h('div',{className:'page-sub'},label+' up to '+r.day+' '+shortM+(r.isPast?' (full month)':' — '+r.day+' of '+r.days+' days ('+Math.round(r.f*100)+'%), the last day with Daily Sales entries'))),
      h('div',{style:{display:'flex',gap:8,alignItems:'center'}},
        h('div',{className:'fd-date'},h('button',{onClick:()=>shift(-1)},'‹'),h('span',{className:'lbl'},shortM+' '+cal.year),h('button',{onClick:()=>shift(1)},'›')),
        h('button',{className:'btn btn-ghost btn-sm',onClick:exportX},'⬇ Excel'),
        h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},disabled:xlBusy,onClick:exportReport},xlBusy?'Building…':'⬇ Excel Report (with formulas)'))),
    h('div',{className:'grid4',style:{marginBottom:14}},
      metric('Revenue MTD',money(r.mtd.revenue),'projected '+money(r.proj.revenue),'var(--blue)'),
      metric('EBITDA MTD',money(r.mtd.ebitda),pctOf(r.mtd.ebitda,r.mtd.revenue)+' margin',r.mtd.ebitda>=0?'var(--green)':'var(--red)'),
      metric('Profit before tax MTD',money(r.mtd.pbt),pctOf(r.mtd.pbt,r.mtd.revenue)+' net margin',r.mtd.pbt>=0?'var(--green)':'var(--red)'),
      metric('Projected PBT (full month)',money(r.proj.pbt),'previous month '+money(prev.pbt),r.proj.pbt>=0?'var(--green)':'var(--red)')),
    (()=>{const tgt=salesTargetFor(sid,cal.year,cal.month);const iso=cal.year+'-'+String(cal.month+1).padStart(2,'0')+'-'+String(r.day).padStart(2,'0');const got=mtdGrossSales(sid,iso);
      const need=tgt?Math.max(0,(tgt-got)/Math.max(1,r.days-r.day)):0;
      return h('div',{className:'card',style:{marginBottom:12,display:'flex',gap:14,alignItems:'center',flexWrap:'wrap'}},
        h('b',null,'🎯 Sales target'),h('input',{type:'number',className:'form-control',style:{width:140},defaultValue:tgt||'',key:'t'+cal.year+cal.month+tTick,placeholder:'monthly, incl. GST',onBlur:e=>{setSalesTarget(sid,cal.year,cal.month,e.target.value);setTTick(x=>x+1);}}),
        tgt?h('span',{style:{fontSize:12.5}},'Sales so far '+money(got)+' = '+Math.round(got/tgt*100)+'% of target · needed '+money(need)+'/day for the remaining '+(r.days-r.day)+' days'+(got/tgt<r.f?' — behind pace':' — on pace')):h('span',{style:{fontSize:12,color:'var(--text3)'}},'Set a target to track the run-rate (shown on the Daily Summary and Outlet Ranking too).'));})(),
    (()=>{const ov=budgetOverruns(sid,r,calToFYMI(cal.year,cal.month).fy);if(!ov.length)return null;
      return h('div',{style:{background:'rgba(224,82,82,0.08)',border:'1px solid rgba(224,82,82,0.3)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:12,fontSize:12.5}},
        h('b',{style:{color:'var(--red)'}},'⚠ Against budget (pro-rata for '+r.day+' days):'),ov.map(o=>h('div',{key:o.name},'• '+o.name+': '+money(o.mtd)+' vs '+money(o.pace)+(o.rev?' — behind budget':' — '+Math.round((o.mtd/o.pace-1)*100)+'% over'))));})(),
    !r.salaryFinal&&!r.isPast&&h('div',{className:'help-note',style:{marginBottom:12}},'Salary, PF / ESIC, recurring commitments and depreciation are counted pro-rata for '+r.day+' of '+r.days+' days (salary from Master Salary gross — marked est.) until '+label+'’s attendance is final. Revenue and daily costs are actuals to date.'),
    h('div',{className:'card',style:{padding:0}},h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,h('th',null,'Particulars'),h('th',{style:{textAlign:'right'}},'MTD (1–'+r.day+' '+shortM+')'),h('th',{style:{textAlign:'right'}},'% of rev'),h('th',{style:{textAlign:'right'}},'Projected month'),h('th',{style:{textAlign:'right'}},M[pd.getMonth()].slice(0,3)+' (full)'))),
      h('tbody',null,
        ...r.sections.flatMap(S=>{
          const isOpen=!!open[S.sec];
          const head=h('tr',{key:S.sec,style:{cursor:'pointer',fontWeight:600},onClick:()=>setOpen(o=>({...o,[S.sec]:!isOpen}))},
            h('td',null,h('span',{style:{color:'var(--accent)',display:'inline-block',width:14}},isOpen?'▾':'▸'),S.sec,h('span',{style:{fontSize:10,color:'var(--text3)',marginLeft:6}},S.lines.length+' lines')),
            cell(money(S.mtd)),cell(pctOf(S.mtd,r.mtd.revenue)),cell(money(S.proj)),cell(money(prevSec(S.sec))));
          const lines=isOpen?S.lines.filter(l=>Math.round(l.mtd)||Math.round(l.proj)||Math.round(prevLine(S.sec,l.name))).map(l=>h('tr',{key:S.sec+l.name},
            h('td',{style:{paddingLeft:34,fontSize:12,color:'var(--text2)'}},l.name,l.est?h('span',{style:{fontSize:10,color:'var(--orange)',marginLeft:6}},'est.'):null),
            cell(money(l.mtd),{fontSize:12}),cell(pctOf(l.mtd,r.mtd.revenue),{fontSize:12}),cell(money(l.proj),{fontSize:12}),cell(money(prevLine(S.sec,l.name)),{fontSize:12}))):[];
          const extra=S.sec==='Direct cost of service'?[totalRow('Gross profit',r.mtd.gross,r.proj.gross,prev.gross,'var(--teal)')]:S.sec==='Operating expenses'?[totalRow('EBITDA',r.mtd.ebitda,r.proj.ebitda,prev.ebitda,'var(--blue)')]:[];
          return[head,...lines,...extra];
        }),
        ...r.below.map(l=>h('tr',{key:l.name},h('td',null,l.name),cell(money(l.mtd)),cell(pctOf(l.mtd,r.mtd.revenue)),cell(money(l.proj)),cell(money((prev.below.find(x=>x.name===l.name)||{}).amt||0)))),
        totalRow('Profit before tax',r.mtd.pbt,r.proj.pbt,prev.pbt,'var(--red)'))))));
}

// ── MTD P&L report (Excel with formulas) — same look as the monthly P&L report: a Summary
// dashboard, the MTD statement (every line linked to its working, projection a live formula off one
// "share of month" cell) and workings for revenue to date, employee cost and operating expenses. ──
async function buildMtdPnlWorkbook(sid,salon,cal){
  await loadExcelJS();
  const r=mtdPnlFor(sid,cal.year,cal.month);
  const pd=new Date(cal.year,cal.month-1,1),pfm=calToFYMI(pd.getFullYear(),pd.getMonth()),prev=plBuild(sid,pfm.fy,pfm.mi);
  const M=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthLbl=M[cal.month]+' '+cal.year,shortM=M[cal.month].slice(0,3),prevLbl=M[pd.getMonth()]+' '+pd.getFullYear();
  const outletName=salon?salon.name.split('—')[0].trim():'Outlet';
  const f=r.f,R=n=>Math.round(Number(n)||0);
  const C={navy:'FF14335E',band:'FFDBE6F3',total:'FFEEF3FA',zebra:'FFF7F9FC',white:'FFFFFFFF',grey:'FF5B6472',light:'FF8A94A6',kpi:'FFF3F7FF'};
  const fill=c=>({type:'pattern',pattern:'solid',fgColor:{argb:c}});
  const THIN={style:'thin',color:{argb:'FFD7DDE6'}},BORDER={top:THIN,bottom:THIN,left:THIN,right:THIN};
  const TOP2={...BORDER,top:{style:'medium',color:{argb:C.navy}}},DBL={...BORDER,top:{style:'thin',color:{argb:C.navy}},bottom:{style:'double',color:{argb:C.navy}}};
  const NUM='#,##0;[Red]-#,##0;"–"',PCT='0.0%;[Red]-0.0%;"–"';
  const UP_GOOD='[Color10]▲ 0.0%;[Red]▼ 0.0%;"–"',UP_BAD='[Red]▲ 0.0%;[Color10]▼ 0.0%;"–"',CH_GOOD='[Color10]+#,##0;[Red]-#,##0;"–"',CH_BAD='[Red]+#,##0;[Color10]-#,##0;"–"';
  const wb=new ExcelJS.Workbook();wb.creator='SalonOS';wb.created=new Date();wb.calcProperties.fullCalcOnLoad=true;
  const sheet=(n,t)=>wb.addWorksheet(n,{properties:{tabColor:{argb:t||C.navy}},views:[{showGridLines:false}]});
  const wsS=sheet('Summary'),wsP=sheet('MTD P&L'),w1=sheet('W1 Revenue to date','FF2E7D32'),w2=sheet('W2 Employee cost','FFEF6C00'),w3=sheet('W3 Operating exp','FFC62828');
  const ref=(ws,c)=>"'"+ws.name+"'!"+c;
  const setup=(ws,land,freeze)=>{ws.pageSetup={paperSize:9,orientation:land?'landscape':'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.4,right:0.4,top:0.5,bottom:0.5,header:0.3,footer:0.3}};
    ws.headerFooter={oddFooter:'&L'+outletName+' — MTD P&L '+monthLbl+' (to '+r.day+' '+shortM+')&RPage &P of &N'};if(freeze)ws.views=[{state:'frozen',ySplit:freeze,showGridLines:false}];};
  const banner=(ws,t,s,cols)=>{ws.mergeCells(1,1,1,cols);const a=ws.getCell(1,1);a.value=t;a.font={bold:true,size:14,color:{argb:C.white}};a.fill=fill(C.navy);a.alignment={vertical:'middle',indent:1};ws.getRow(1).height=28;
    ws.mergeCells(2,1,2,cols);const b=ws.getCell(2,1);b.value=s;b.font={size:9,italic:true,color:{argb:C.grey}};b.alignment={wrapText:true,vertical:'top',indent:1};ws.getRow(2).height=30;};
  const head=(ws,rr,vals,rightFrom)=>{const row=ws.getRow(rr);row.values=vals;row.height=30;row.eachCell({includeEmpty:true},(c,i)=>{c.fill=fill(C.navy);c.font={bold:true,size:9.5,color:{argb:C.white}};c.border=BORDER;c.alignment={horizontal:i>=rightFrom?'right':'left',vertical:'middle',wrapText:true};});};
  const band=(ws,rr,label,cols)=>{ws.mergeCells(rr,1,rr,cols);const c=ws.getCell(rr,1);c.value=label;c.fill=fill(C.band);c.font={bold:true,size:10,color:{argb:C.navy}};c.alignment={indent:0.5,vertical:'middle'};ws.getRow(rr).height=18;for(let i=1;i<=cols;i++)ws.getCell(rr,i).border=BORDER;};
  const put=(ws,rr,col,v,fmt)=>{const c=ws.getCell(rr,col);c.value=(v&&typeof v==='object'&&'f' in v)?{formula:v.f,result:v.r==null?0:v.r}:v;if(fmt)c.numFmt=fmt;return c;};
  const style=(ws,rr,cols,kind)=>{for(let i=1;i<=cols;i++){const c=ws.getCell(rr,i);c.border=kind==='grand'?DBL:kind==='total'?TOP2:BORDER;
    if(kind==='total'||kind==='grand'){c.fill=fill(kind==='grand'?C.band:C.total);c.font={...(c.font||{}),bold:true,color:{argb:C.navy}};}else{if(rr%2===0)c.fill=fill(C.zebra);c.font={...(c.font||{}),size:10};}
    c.alignment={...(c.alignment||{}),vertical:'middle',...(c.numFmt&&i>1?{horizontal:'right'}:{})};}};
  const note=(ws,rr,t,cols)=>{ws.mergeCells(rr,1,rr,cols);const c=ws.getCell(rr,1);c.value=t;c.font={size:8.5,italic:true,color:{argb:C.light}};c.alignment={wrapText:true,vertical:'top'};ws.getRow(rr).height=Math.max(15,Math.ceil(t.length/110)*13);};
  const FR="'MTD P&L'!$C$7"; // share of the month elapsed
  const proj=(cell,mtd)=>({f:'IF('+FR+'=0,'+cell+',ROUND('+cell+'/'+FR+',0))',r:f?Math.round(R(mtd)/f):R(mtd)});
  const sec=n=>r.sections.find(s=>s.sec===n)||{lines:[]};
  const prevLine=(s,n)=>{const S=prev.sections.find(x=>x.sec===s);const l=S&&S.lines.find(x=>x.name===n);return l?R(l.amt):0;};
  const link={}; // statement line → {mtd:ref, proj:ref|null, mtdV, projV}

  // ═══ W1 Revenue to date ═══
  {
    const ws=w1,COLS=8,rest=isRestaurantOutlet(sid),useDse=rest||plRevenueSourceFor(sid,cal.year,cal.month)==='dse';
    const srcName=useDse?'Daily Sales & Exp':'Collection Reco (Cradlee)';
    const upto=cal.year+'-'+String(cal.month+1).padStart(2,'0')+'-'+String(r.day).padStart(2,'0');
    const byDay={};
    if(useDse)dseSalesRowsForMonth(sid,cal.year,cal.month).filter(x=>x.id<=upto).forEach(x=>{byDay[x.id]={cash:x.cash,card:x.card,upi:x.upi};});
    else collectionRowsForMonth(sid,cal.year,cal.month).forEach(x=>{const k=toISO(x.invoiceDate);if(!k||k>upto)return;byDay[k]=byDay[k]||{cash:0,card:0,upi:0};byDay[k].cash+=Number(x.cash)||0;byDay[k].card+=Number(x.card)||0;byDay[k].upi+=Number(x.upi)||0;});
    const days=Object.keys(byDay).sort();
    const tgt=salesTargetFor(sid,cal.year,cal.month)||0;
    banner(ws,'W1 — Revenue to '+r.day+' '+shortM+' '+cal.year,'Gross collections to date from '+srcName+' (incl. 5% GST); net = gross ÷ 1.05. Day-wise table below with the running total'+(tgt?' against the monthly sales target (pace = target × day ÷ days in month).':'. Set a sales target on MTD P&L to see the pace line.'),COLS);
    const lines=sec('Revenue').lines;
    const aStart=5,aTot=aStart+lines.length,bBand=aTot+2,bHead=bBand+1,bStart=bHead+1,bEnd=bStart+Math.max(days.length,1)-1,bTot=bEnd+1;
    head(ws,4,['Revenue line','Basis','Gross to date ₹','GST @ 5% ₹','Net to date ₹ → MTD P&L','','',''],3);
    const colFor={Cash:'B',Card:'C',UPI:'D'};
    lines.forEach((l,i)=>{const rr=aStart+i,m=!rest&&/(Cash|Card|UPI) Sale$/.exec(l.name);
      put(ws,rr,1,l.name.replace('Revenue from Operations - ',''));
      if(m&&days.length){const k=m[1].toLowerCase(),g=days.reduce((t,d)=>t+byDay[d][k],0);
        put(ws,rr,2,srcName+' — to '+r.day+' '+shortM);put(ws,rr,3,{f:colFor[m[1]]+bTot,r:R(g)},NUM);put(ws,rr,4,{f:'C'+rr+'-E'+rr,r:R(g)-R(g/1.05)},NUM);put(ws,rr,5,{f:'ROUND(C'+rr+'/1.05,0)',r:R(g/1.05)},NUM);
        link[l.name]={mtd:ref(ws,'E'+rr),mtdV:R(g/1.05)};}
      else{put(ws,rr,2,/Swiggy|Zomato|EazyDiner|Ownly|Eatby/.test(l.name)?'Payout statements booked so far':'As booked for the month');put(ws,rr,5,R(l.mtd),NUM);link[l.name]={mtd:ref(ws,'E'+rr),mtdV:R(l.mtd)};}
      style(ws,rr,COLS);});
    const aSum=j=>{let t=0;for(let k=aStart;k<aTot;k++){const v=ws.getCell(k,j+3).value;t+=typeof v==='number'?v:(v&&v.result)||0;}return t;};
    put(ws,aTot,1,'Total revenue to date');['C','D','E'].forEach((c,j)=>put(ws,aTot,j+3,{f:'SUM('+c+aStart+':'+c+(aTot-1)+')',r:aSum(j)},NUM));style(ws,aTot,COLS,'grand');
    band(ws,bBand,'Day-wise collections (gross) and running total'+(tgt?' vs target pace':''),COLS);
    head(ws,bHead,['Date','Cash ₹','Card ₹','UPI ₹','Day total ₹','Running total ₹',tgt?'Target pace ₹':'',tgt?'Ahead / (behind) ₹':''],2);
    if(!days.length){put(ws,bStart,1,'No collections recorded yet');style(ws,bStart,COLS);}
    let run=0,run2=0;
    days.forEach((d,i)=>{const rr=bStart+i,x=byDay[d],dt=x.cash+x.card+x.upi;run+=dt;const dn=Number(d.slice(8,10));
      put(ws,rr,1,d.split('-').reverse().join('/'));put(ws,rr,2,R(x.cash),NUM);put(ws,rr,3,R(x.card),NUM);put(ws,rr,4,R(x.upi),NUM);
      put(ws,rr,5,{f:'SUM(B'+rr+':D'+rr+')',r:R(x.cash)+R(x.card)+R(x.upi)},NUM);run2+=R(x.cash)+R(x.card)+R(x.upi);put(ws,rr,6,{f:'SUM(E$'+bStart+':E'+rr+')',r:run2},NUM);
      if(tgt){put(ws,rr,7,R(tgt*dn/r.days),NUM);put(ws,rr,8,{f:'F'+rr+'-G'+rr,r:run2-R(tgt*dn/r.days)},CH_GOOD);}
      style(ws,rr,COLS);});
    put(ws,bTot,1,'Total to date');['cash','card','upi','all'].forEach((k,j)=>put(ws,bTot,j+2,{f:'SUM('+'BCDE'[j]+bStart+':'+'BCDE'[j]+bEnd+')',r:days.reduce((t,d)=>t+(k==='all'?R(byDay[d].cash)+R(byDay[d].card)+R(byDay[d].upi):R(byDay[d][k])),0)},NUM));style(ws,bTot,COLS,'total');
    if(days.length)ws.addConditionalFormatting({ref:'E'+bStart+':E'+bEnd,rules:[{type:'dataBar',priority:1,minLength:0,maxLength:100,cfvo:[{type:'num',value:0},{type:'max'}],color:{argb:'FF63BE7B'}}]});
    ws.columns=[{width:30},{width:34},{width:16},{width:13},{width:18},{width:16},{width:15},{width:17}];setup(ws,true,4);
  }

  // ═══ W2 Employee cost ═══
  {
    const ws=w2,COLS=5,S=sec('Employee cost');
    banner(ws,'W2 — Employee cost to '+r.day+' '+shortM,r.salaryFinal?'Attendance is final — salary, PF and ESIC are the month’s actual figures.':'Attendance is not final yet: salary, PF and ESIC are the full-month amount (Master Salary gross / statutory working) × share of month elapsed — marked "estimate". Incentives as worked out so far; daily incentives actual to date.',COLS);
    head(ws,4,['Line','Basis','Full month ₹','MTD ₹ → MTD P&L','Projected month ₹'],3);
    let rr=5;const st=rr;
    S.lines.forEach(l=>{
      if(!R(l.mtd)&&!R(l.proj)&&!prevLine('Employee cost',l.name))return;
      put(ws,rr,1,l.name);
      if(l.est){put(ws,rr,2,'Estimate — full month × share elapsed');put(ws,rr,3,R(l.fullFixed),NUM);put(ws,rr,4,{f:'ROUND(C'+rr+'*'+FR+',0)',r:R(R(l.fullFixed)*f)},NUM);put(ws,rr,5,{f:'C'+rr,r:R(l.fullFixed)},NUM);}
      else if(l.kind==='fixed'){put(ws,rr,2,'Month figure (fixed)');put(ws,rr,3,R(l.fullFixed!=null?l.fullFixed:l.mtd),NUM);put(ws,rr,4,R(l.mtd),NUM);put(ws,rr,5,{f:'C'+rr,r:R(l.fullFixed!=null?l.fullFixed:l.mtd)},NUM);}
      else{put(ws,rr,2,'Actual to date (Daily Sales & Exp) — projected by pace');put(ws,rr,4,R(l.mtd),NUM);put(ws,rr,5,proj('D'+rr,l.mtd),NUM);}
      const cv=k=>{const v=ws.getCell(rr,k).value;return typeof v==='number'?v:(v&&v.result)||0;};
      style(ws,rr,COLS);link[l.name]={mtd:ref(ws,'D'+rr),proj:ref(ws,'E'+rr),mtdV:cv(4),projV:cv(5),fullV:cv(3)};rr++;});
    const t2=k=>Object.values(link).filter(x=>x.mtd&&x.mtd.indexOf('W2')>=0).reduce((t,x)=>t+(x[k]||0),0);
    put(ws,rr,1,'Total employee cost');['C','D','E'].forEach((c,j)=>put(ws,rr,j+3,{f:'SUM('+c+st+':'+c+Math.max(st,rr-1)+')',r:t2(['fullV','mtdV','projV'][j])},NUM));style(ws,rr,COLS,'grand');rr+=2;
    if(!r.salaryFinal){
      const emps=(getEmployeesForMonth(cal.year,cal.month,sid)||[]).filter(e=>Number(e.gross)>0);
      if(emps.length){band(ws,rr,'Supporting — monthly gross per employee (Master Salary)',COLS);rr++;head(ws,rr,['Employee','Department','Monthly gross ₹','MTD share ₹',''],3);rr++;const es=rr;
        emps.forEach(e=>{put(ws,rr,1,e.name);put(ws,rr,2,e.dept||'');put(ws,rr,3,R(e.gross),NUM);put(ws,rr,4,{f:'ROUND(C'+rr+'*'+FR+',0)',r:R(R(e.gross)*f)},NUM);style(ws,rr,COLS);rr++;});
        put(ws,rr,1,'Total');put(ws,rr,3,{f:'SUM(C'+es+':C'+(rr-1)+')',r:emps.reduce((t,e)=>t+R(e.gross),0)},NUM);put(ws,rr,4,{f:'SUM(D'+es+':D'+(rr-1)+')',r:emps.reduce((t,e)=>t+R(R(e.gross)*f),0)},NUM);style(ws,rr,COLS,'total');}
    }
    ws.columns=[{width:34},{width:44},{width:15},{width:17},{width:17}];setup(ws,false,4);
  }

  // ═══ W3 Operating expenses ═══
  {
    const ws=w3,COLS=7,S=sec('Operating expenses');
    banner(ws,'W3 — Operating expenses to '+r.day+' '+shortM,'Recurring commitments (rent, maintenance…) count pro-rata for the days elapsed and in full for the projected month; bills / bank debits / bank charges as booked; Daily Sales & Exp spends actual to date, projected by pace.',COLS);
    head(ws,4,['Line','Recurring — full month ₹','Recurring — MTD ₹','Bills / bank / charges ₹','Daily Sales & Exp ₹','MTD ₹ → MTD P&L','Projected month ₹'],2);
    let rr=5;const st=rr;const colT=[0,0,0,0,0,0];
    S.lines.forEach(l=>{
      if(!R(l.mtd)&&!R(l.proj)&&!prevLine('Operating expenses',l.name))return;
      put(ws,rr,1,l.name);
      if(l.kind==='opex'){put(ws,rr,2,R(l.recFull),NUM);put(ws,rr,3,{f:'ROUND(B'+rr+'*'+FR+',0)',r:R(R(l.recFull)*f)},NUM);put(ws,rr,4,R(l.lumpy),NUM);put(ws,rr,5,R(l.daily),NUM);
        put(ws,rr,6,{f:'C'+rr+'+D'+rr+'+E'+rr,r:R(R(l.recFull)*f)+R(l.lumpy)+R(l.daily)},NUM);
        put(ws,rr,7,{f:'B'+rr+'+D'+rr+'+IF('+FR+'=0,E'+rr+',ROUND(E'+rr+'/'+FR+',0))',r:R(l.recFull)+R(l.lumpy)+(f?Math.round(R(l.daily)/f):R(l.daily))},NUM);}
      else{put(ws,rr,6,R(l.mtd),NUM);put(ws,rr,7,proj('F'+rr,l.mtd),NUM);}
      const cv=k=>{const v=ws.getCell(rr,k).value;return typeof v==='number'?v:(v&&v.result)||0;};
      [2,3,4,5,6,7].forEach((k,j)=>colT[j]+=cv(k));
      style(ws,rr,COLS);link[l.name]={mtd:ref(ws,'F'+rr),proj:ref(ws,'G'+rr),mtdV:cv(6),projV:cv(7)};rr++;});
    put(ws,rr,1,'Total operating expenses');['B','C','D','E','F','G'].forEach((c,j)=>put(ws,rr,j+2,{f:'SUM('+c+st+':'+c+Math.max(st,rr-1)+')',r:colT[j]},NUM));style(ws,rr,COLS,'grand');
    ws.columns=[{width:32},{width:16},{width:15},{width:16},{width:16},{width:17},{width:17}];setup(ws,true,4);
  }

  // ═══ MTD P&L statement ═══
  const P={},RV={},figRows=[];
  {
    const ws=wsP,COLS=8;
    banner(ws,'MTD Profit & Loss — '+outletName+' · '+monthLbl+' to '+r.day+' '+shortM,'Actuals to date where they exist; salary (until attendance is final), recurring commitments and depreciation pro-rata for the days elapsed. Projected month: daily-run items scaled by the share below, fixed items in full. Compared with '+prevLbl+' (full month). Generated '+new Date().toLocaleString('en-IN')+'.',COLS);
    band(ws,4,'Basis',COLS);
    put(ws,5,1,'Days in '+M[cal.month]);put(ws,5,3,r.days,'0');style(ws,5,COLS);
    put(ws,6,1,'Days counted (data up to '+r.day+' '+shortM+')');put(ws,6,3,r.day,'0');style(ws,6,COLS);
    put(ws,7,1,'Share of month elapsed — drives every projection');put(ws,7,3,{f:'IF(C5=0,0,C6/C5)',r:f},PCT);style(ws,7,COLS,'total');
    head(ws,9,['Particulars','Basis','MTD ₹','% of revenue','Projected month ₹',prevLbl.slice(0,3)+' (full) ₹','Projected vs '+prevLbl.slice(0,3)+' ₹','Change %'],3);
    let rr=10;
    const block=(sName,title,totalLabel,key,cost)=>{
      const S=sec(sName);const lines=S.lines.filter(l=>R(l.mtd)||R(l.proj)||prevLine(sName,l.name));
      if(!lines.length){put(ws,rr,1,title.replace(/^[A-E]\. /,'')+' — nil');[3,5,6].forEach(c=>put(ws,rr,c,0,NUM));style(ws,rr,COLS,'total');P[key]=rr;figRows.push(rr);RV[rr]={c:0,e:0,p:0,cost};rr+=2;return;}
      band(ws,rr,title,COLS);rr++;const st=rr;
      lines.forEach(l=>{const L=link[l.name]||{};const pv=prevLine(sName,l.name);
        put(ws,rr,1,l.name.replace('Revenue from Operations - ','Revenue — '));
        put(ws,rr,2,l.est?'Estimate (pro-rata)':l.kind==='fixed'?'Fixed':l.kind==='opex'?'Recurring pro-rata + actual':'Actual to date');ws.getCell(rr,2).font={size:8.5,color:{argb:l.est?'FFEF6C00':C.light}};
        const mv=L.mtdV!=null?L.mtdV:R(l.mtd);
        put(ws,rr,3,L.mtd?{f:L.mtd,r:mv}:mv,NUM);
        let pr;
        if(L.proj)pr={f:L.proj,r:L.projV!=null?L.projV:R(l.proj)};else if(l.kind==='fixed')pr=R(l.proj);else pr=proj('C'+rr,mv);
        put(ws,rr,5,pr,NUM);put(ws,rr,6,pv,NUM);
        style(ws,rr,COLS);figRows.push(rr);RV[rr]={c:mv,e:typeof pr==='object'?pr.r:pr,p:pv,cost};rr++;});
      let tc=0,te=0,tp=0;for(let k=st;k<rr;k++)if(RV[k]){tc+=RV[k].c;te+=RV[k].e;tp+=RV[k].p;}
      put(ws,rr,1,totalLabel);[['C',tc],['E',te],['F',tp]].forEach(([c,v])=>put(ws,rr,{C:3,E:5,F:6}[c],{f:'SUM('+c+st+':'+c+(rr-1)+')',r:v},NUM));style(ws,rr,COLS,'total');P[key]=rr;figRows.push(rr);RV[rr]={c:tc,e:te,p:tp,cost};rr+=2;
    };
    const derived=(label,key,parts)=>{const v=k=>parts.reduce((t,[pk,sg])=>t+sg*RV[P[pk]][k],0);
      put(ws,rr,1,label);['C','E','F'].forEach((c,j)=>put(ws,rr,j===0?3:j===1?5:6,{f:parts.map(([pk,sg],i)=>(i===0?'':(sg>0?'+':'-'))+c+P[pk]).join(''),r:v(['c','e','p'][j])},NUM));
      style(ws,rr,COLS,'grand');P[key]=rr;figRows.push(rr);RV[rr]={c:v('c'),e:v('e'),p:v('p'),cost:false};rr+=2;};
    block('Revenue','A. Revenue from operations','Total revenue','rev',false);
    block('Direct cost of service','B. Direct cost of service','Total direct cost','dir',true);
    derived('GROSS PROFIT (A − B)','gp',[['rev',1],['dir',-1]]);
    block('Employee cost','C. Employee cost','Total employee cost','emp',true);
    block('Operating expenses','D. Operating expenses','Total operating expenses','opex',true);
    derived('EBITDA (Gross profit − C − D)','ebitda',[['gp',1],['emp',-1],['opex',-1]]);
    // E. Depreciation & interest — pro-rata
    {const lines=r.below.filter(l=>R(l.mtd)||R(l.proj)||R((prev.below.find(x=>x.name===l.name)||{}).amt));
      if(!lines.length){put(ws,rr,1,'Depreciation & interest — nil');[3,5,6].forEach(c=>put(ws,rr,c,0,NUM));style(ws,rr,COLS,'total');P.dep=rr;figRows.push(rr);RV[rr]={c:0,e:0,p:0,cost:true};rr+=2;}
      else{band(ws,rr,'E. Depreciation & interest',COLS);rr++;const st=rr;
        lines.forEach(l=>{const pv=R((prev.below.find(x=>x.name===l.name)||{}).amt);put(ws,rr,1,l.name);put(ws,rr,2,'Pro-rata');ws.getCell(rr,2).font={size:8.5,color:{argb:C.light}};
          put(ws,rr,5,R(l.proj),NUM);put(ws,rr,3,{f:'ROUND(E'+rr+'*$C$7,0)',r:R(R(l.proj)*f)},NUM);put(ws,rr,6,pv,NUM);style(ws,rr,COLS);figRows.push(rr);RV[rr]={c:R(R(l.proj)*f),e:R(l.proj),p:pv,cost:true};rr++;});
        let tc=0,te=0,tp=0;for(let k=st;k<rr;k++)if(RV[k]){tc+=RV[k].c;te+=RV[k].e;tp+=RV[k].p;}
        put(ws,rr,1,'Total depreciation & interest');[['C',tc],['E',te],['F',tp]].forEach(([c,v])=>put(ws,rr,{C:3,E:5,F:6}[c],{f:'SUM('+c+st+':'+c+(rr-1)+')',r:v},NUM));style(ws,rr,COLS,'total');P.dep=rr;figRows.push(rr);RV[rr]={c:tc,e:te,p:tp,cost:true};rr+=2;}}
    derived('PROFIT BEFORE TAX (EBITDA − E)','pbt',[['ebitda',1],['dep',-1]]);
    for(const i of figRows){const v=RV[i],rv=RV[P.rev].c;
      put(ws,i,4,{f:'IF($C$'+P.rev+'=0,0,C'+i+'/$C$'+P.rev+')',r:rv?v.c/rv:0},PCT);put(ws,i,7,{f:'E'+i+'-F'+i,r:v.e-v.p},v.cost?CH_BAD:CH_GOOD);put(ws,i,8,{f:'IF(F'+i+'=0,0,(E'+i+'-F'+i+')/ABS(F'+i+'))',r:v.p?(v.e-v.p)/Math.abs(v.p):0},v.cost?UP_BAD:UP_GOOD);
      ['D','G','H'].forEach(cc=>{const x=ws.getCell(cc+i),b=ws.getCell('C'+i);x.border=b.border;x.fill=b.fill;x.font={...(b.font||{}),color:undefined};x.alignment={horizontal:'right',vertical:'middle'};});}
    note(ws,rr,'Working sheets: W1 revenue to date (day-wise, with pace), W2 employee cost, W3 operating expenses. Change the share of month in C7 to test a different date — every projection follows.',COLS);
    ws.columns=[{width:40},{width:20},{width:16},{width:11},{width:18},{width:16},{width:18},{width:10}];setup(ws,false,9);ws.pageSetup.printTitlesRow='9:9';
  }

  // ═══ Summary dashboard ═══
  {
    const ws=wsS,COLS=8,pl=c=>"'MTD P&L'!"+c,rv=RV[P.rev].c;
    banner(ws,outletName+' — MTD dashboard · '+monthLbl+' to '+r.day+' '+shortM,r.day+' of '+r.days+' days counted ('+Math.round(f*100)+'%). Projected month = daily-run items scaled up, fixed items in full. Compared with '+prevLbl+' (full month). All figures in ₹, linked to the MTD P&L and workings.',COLS);
    const cards=[['REVENUE TO DATE','rev'],['GROSS PROFIT TO DATE','gp'],['EBITDA TO DATE','ebitda'],['PBT TO DATE','pbt']];
    cards.forEach(([lbl,k],j)=>{const c1=1+j*2,c2=c1+1,v=RV[P[k]];for(let rr=4;rr<=7;rr++)ws.mergeCells(rr,c1,rr,c2);
      const t=ws.getCell(4,c1);t.value=lbl;t.font={bold:true,size:8.5,color:{argb:C.grey}};
      const n=ws.getCell(5,c1);n.value={formula:pl('C'+P[k]),result:v.c};n.numFmt='₹ #,##0;[Red]-₹ #,##0;"–"';n.font={bold:true,size:18,color:{argb:v.c<0?'FFC0392B':C.navy}};
      const m=ws.getCell(6,c1);m.value={formula:'"Projected ₹"&TEXT('+pl('E'+P[k])+',"#,##0")',result:'Projected ₹'+v.e.toLocaleString('en-IN')};m.font={size:9,color:{argb:C.grey}};
      const ch=ws.getCell(7,c1);ch.value={formula:'IF('+pl('F'+P[k])+'=0,0,('+pl('E'+P[k])+'-'+pl('F'+P[k])+')/ABS('+pl('F'+P[k])+'))',result:v.p?(v.e-v.p)/Math.abs(v.p):0};ch.numFmt='[Color10]▲ 0.0%" projected vs last month";[Red]▼ 0.0%" projected vs last month";"same as last month"';ch.font={bold:true,size:9};
      for(let rr=4;rr<=7;rr++)for(let cc=c1;cc<=c2;cc++){const x=ws.getCell(rr,cc);x.fill=fill(C.kpi);x.alignment={horizontal:'left',vertical:'middle',indent:1};
        x.border={top:rr===4?{style:'medium',color:{argb:[C.navy,'FF2E7D32','FFEF6C00','FF6A1B9A'][j]}}:undefined,bottom:rr===7?THIN:undefined,left:cc===c1?THIN:undefined,right:cc===c2?THIN:undefined};}});
    ws.getRow(5).height=30;
    let rr=9;
    // Pace
    band(ws,rr,'Month pace',COLS);rr++;
    const iso=cal.year+'-'+String(cal.month+1).padStart(2,'0')+'-'+String(r.day).padStart(2,'0');
    const tgt=salesTargetFor(sid,cal.year,cal.month)||0,got=R(mtdGrossSales(sid,iso)),left=Math.max(0,r.days-r.day);
    const pace=(lbl,val,fmt,hint)=>{ws.mergeCells(rr,1,rr,3);ws.mergeCells(rr,5,rr,8);put(ws,rr,1,lbl);put(ws,rr,4,val,fmt);put(ws,rr,5,hint||'');ws.getCell(rr,5).font={size:8.5,italic:true,color:{argb:C.light}};style(ws,rr,COLS);rr++;};
    const p0=rr;
    pace('Days counted / days in month',{f:pl('C6')+'&" / "&'+pl('C5'),r:r.day+' / '+r.days},null,'data up to '+r.day+' '+shortM);
    pace('Share of month elapsed',{f:pl('C7'),r:f},PCT,'drives every projection');
    if(tgt){
      pace('Monthly sales target (incl. GST)',tgt,NUM,'set on MTD P&L');
      pace('Sales so far (incl. GST)',got,NUM,'');
      pace('Achieved',{f:'IF(D'+(p0+2)+'=0,0,D'+(p0+3)+'/D'+(p0+2)+')',r:tgt?got/tgt:0},PCT,'of the monthly target');
      pace('Needed per day for the remaining '+left+' days',{f:'IF('+left+'=0,0,MAX(0,D'+(p0+2)+'-D'+(p0+3)+')/'+left+')',r:left?Math.max(0,tgt-got)/left:0},NUM,(tgt&&got/tgt<f)?'behind pace':'on pace');
    }else pace('Sales target','not set',null,'set a monthly target on MTD P&L to track the run-rate');
    rr++;
    // Statement in brief
    band(ws,rr,'Statement in brief',COLS);rr++;
    head(ws,rr,['Particulars','','MTD ₹','% of revenue','Projected month ₹',prevLbl.slice(0,3)+' (full) ₹','Projected vs last ₹','Change %'],3);ws.mergeCells(rr,1,rr,2);rr++;
    const SR={};
    [['Revenue','rev',false],['Direct cost of service','dir',true],['Gross profit','gp',false],['Employee cost','emp',true],['Operating expenses','opex',true],['EBITDA','ebitda',false],['Depreciation & interest','dep',true],['Profit before tax','pbt',false]].forEach(([lbl,k,cost])=>{
      const v=RV[P[k]];SR[k]=rr;ws.mergeCells(rr,1,rr,2);put(ws,rr,1,lbl);put(ws,rr,3,{f:pl('C'+P[k]),r:v.c},NUM);put(ws,rr,4,{f:'IF($C$'+SR.rev+'=0,0,C'+rr+'/$C$'+SR.rev+')',r:rv?v.c/rv:0},PCT);
      put(ws,rr,5,{f:pl('E'+P[k]),r:v.e},NUM);put(ws,rr,6,{f:pl('F'+P[k]),r:v.p},NUM);put(ws,rr,7,{f:'E'+rr+'-F'+rr,r:v.e-v.p},cost?CH_BAD:CH_GOOD);put(ws,rr,8,{f:'IF(F'+rr+'=0,0,(E'+rr+'-F'+rr+')/ABS(F'+rr+'))',r:v.p?(v.e-v.p)/Math.abs(v.p):0},cost?UP_BAD:UP_GOOD);
      style(ws,rr,COLS,k==='pbt'?'grand':['gp','ebitda'].includes(k)?'total':undefined);rr++;});
    rr++;
    // Key ratios
    band(ws,rr,'Key ratios',COLS);rr++;head(ws,rr,['Ratio','','MTD','','Projected month','Last month','',''],3);ws.mergeCells(rr,1,rr,2);rr++;
    [['Gross margin','gp'],['Employee cost / revenue','emp'],['Operating exp. / revenue','opex'],['EBITDA margin','ebitda'],['Net margin (PBT)','pbt']].forEach(([lbl,k])=>{const a=RV[P[k]],b=RV[P.rev];ws.mergeCells(rr,1,rr,2);put(ws,rr,1,lbl);
      put(ws,rr,3,{f:'IF(C'+SR.rev+'=0,0,C'+SR[k]+'/C'+SR.rev+')',r:b.c?a.c/b.c:0},PCT);put(ws,rr,5,{f:'IF(E'+SR.rev+'=0,0,E'+SR[k]+'/E'+SR.rev+')',r:b.e?a.e/b.e:0},PCT);put(ws,rr,6,{f:'IF(F'+SR.rev+'=0,0,F'+SR[k]+'/F'+SR.rev+')',r:b.p?a.p/b.p:0},PCT);style(ws,rr,COLS);rr++;});
    rr++;
    // Budget watch
    const ov=(typeof budgetOverruns==='function')?budgetOverruns(sid,r,calToFYMI(cal.year,cal.month).fy):[];
    if(ov.length){band(ws,rr,'Against budget (pro-rata for '+r.day+' days)',COLS);rr++;head(ws,rr,['Line','','MTD ₹','','Budget pace ₹','','Over / (under) ₹',''],3);ws.mergeCells(rr,1,rr,2);rr++;
      ov.forEach(o=>{ws.mergeCells(rr,1,rr,2);put(ws,rr,1,o.name+(o.rev?' (revenue)':''));put(ws,rr,3,R(o.mtd),NUM);put(ws,rr,5,R(o.pace),NUM);put(ws,rr,7,{f:'C'+rr+'-E'+rr,r:R(o.mtd)-R(o.pace)},o.rev?CH_GOOD:CH_BAD);style(ws,rr,COLS);rr++;});rr++;}
    band(ws,rr,'What is in this file (click to open)',COLS);rr++;
    [['MTD P&L','The statement to date — actual / pro-rata / projected, vs last month'],['W1 Revenue to date','Collections day by day, running total, target pace'],['W2 Employee cost','Salary (estimate until attendance is final), PF / ESIC, incentives'],['W3 Operating exp','Recurring pro-rata, bills / bank, daily spends — MTD and projected']]
      .forEach(([nm,t])=>{ws.mergeCells(rr,1,rr,2);ws.mergeCells(rr,3,rr,COLS);const c=ws.getCell(rr,1);c.value={text:nm,hyperlink:"#'"+nm+"'!A1"};put(ws,rr,3,t);style(ws,rr,COLS);c.font={color:{argb:'FF1F5FBF'},underline:true,size:10};rr++;});
    ws.columns=[{width:16},{width:14},{width:16},{width:13},{width:16},{width:15},{width:16},{width:12}];setup(ws,false,0);ws.pageSetup.fitToHeight=1;
  }
  return{wb,filename:'MTD_PnL_'+outletName.replace(/[^A-Za-z0-9]+/g,'_')+'_'+cal.year+'-'+String(cal.month+1).padStart(2,'0')+'_to_'+r.day+'.xlsx'};
}
