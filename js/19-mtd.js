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
        h('button',{className:'btn btn-ghost btn-sm',onClick:exportX},'⬇ Excel'))),
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
