
function OutletDashboard({salon,period,onNavTab}){
  const sid=Number(salon&&salon.id)||1;
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONTH_FULL=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today=new Date();
  const isRest=isRestaurantOutlet(sid);
  const _initCal=periodToCalendar(period);
  const [view,setView]=useState('monthly'); // 'monthly' | 'compare' | 'pl'
  const [selMonth,setSelMonth]=useState(_initCal?_initCal.month:today.getMonth());
  const [selYear,setSelYear]=useState(_initCal?_initCal.year:today.getFullYear());
  const [cmpMonthA,setCmpMonthA]=useState(_initCal?(_initCal.month-1+12)%12:(today.getMonth()-1+12)%12);
  const [cmpMonthB,setCmpMonthB]=useState(_initCal?_initCal.month:today.getMonth());
  const [cmpYear,setCmpYear]=useState(_initCal?_initCal.year:today.getFullYear());
  const [rangeMonths,setRangeMonths]=useState(12); // 1 | 3 | 6 | 12 | 18 | 24 | 36

  // Real monthly figures — same plBuild() that powers the actual P&L, converted from calendar
  // month/year via calToFYMI(). The old Service/Product/Membership/Gift split is gone: no real
  // data anywhere in this app tracks revenue broken down that way (Collection Reco only tracks
  // payment method), so it's replaced with the real breakdown that IS tracked — Cash/Card/UPI
  // Sale plus Other Income, the same four lines the P&L itself shows.
  const monthData=(m,y)=>{
    const{fy,mi}=calToFYMI(y,m);
    const d=plBuild(sid,fy,mi);
    const cal=periodToCalendar({fy,mi});
    const lineAmt=(si,name)=>{const l=d.sections[si].lines.find(x=>x.name===name);return l?l.amt:0;};
    const cash=lineAmt(0,'Revenue from Operations - Cash Sale'),card=lineAmt(0,'Revenue from Operations - Card Sale'),
      upi=lineAmt(0,'Revenue from Operations - UPI Sale'),otherInc=lineAmt(0,'Other Income');
    const emps=cal?getEmployeesForMonth(cal.year,cal.month,sid):[];
    const activeEmps=emps.filter(e=>e.status==='Active');
    const sw=cal?swWorkingsFor(sid,cal.year,cal.month):[];
    const attPct=sw.length?Math.round(sw.reduce((s,e)=>s+(e.daysInMonth?e.totalDays/e.daysInMonth*100:0),0)/sw.length):0;
    const opexLines=d.sections[3].lines;
    const findOpex=(name)=>{const l=opexLines.find(x=>x.name===name);return l?l.amt:0;};
    const rent=findOpex('Rent'),elec=findOpex('Electricity Expenses'),mktg=findOpex('Marketing Expenses'),
      rMaint=findOpex('Repair & Maintenance Expenses'),misc=findOpex('Daily Expenses');
    const cosmetics=d.sections[1].lines.reduce((s,l)=>s+l.amt,0); // Direct Cost of Service total
    const incentives=d.sections[2].lines.filter(l=>l.group==='Employee Monthly Incentive'||l.group==='Employee Daily Incentive').reduce((s,l)=>s+l.amt,0);
    const salaries=d.sections[2].tot-incentives;
    const totalRev=d.revenue;
    const totalExp=d.direct+d.opex;
    const netProfit=d.pbt;
    // Restaurant outlets: their own revenue and expense lines (Swiggy, Zomato, bar, service charge;
    // food / liquor cost, packaging & gas, aggregator commission). "Other operating expenses" is
    // whatever is left, so the items always add up to Total Expenses.
    let revItems=null,expItems=null,mixItems=null;
    if(isRest){
      const ro=outletSettings(sid);
      const swiggy=lineAmt(0,'Revenue from Operations - Swiggy'),zomato=lineAmt(0,'Revenue from Operations - Zomato'),eazy=lineAmt(0,'Revenue from Operations - EazyDiner'),ownly=lineAmt(0,'Revenue from Operations - Ownly'),ebm=lineAmt(0,'Revenue from Operations - Eatby Minutes'),
        barSale=lineAmt(0,'Revenue from Operations - Bar Sale'),svc=lineAmt(0,'Service Charge Collected');
      revItems=[['Cash Sale',cash,'var(--green)'],['Card Sale',card,'var(--blue)'],['UPI Sale',upi,'var(--purple)'],['Swiggy',swiggy,'var(--orange)'],['Zomato',zomato,'var(--red)'],['EazyDiner',eazy,'var(--teal)'],['Ownly',ownly,'var(--blue)'],['Eatby Minutes',ebm,'var(--purple)'],
        ...(ro.servesLiquor?[['Bar Sale',barSale,'var(--amber,var(--accent))']]:[]),...(ro.serviceChargeApplicable?[['Service Charge',svc,'var(--teal)']]:[]),['Other Income',otherInc,'var(--text3)']];
      const svcStaff=lineAmt(2,'Service Charge to Staff');
      const food=lineAmt(1,'Food Cost (Consumption)'),liquor=lineAmt(1,'Liquor Cost'),packGas=lineAmt(1,'Packaging Material')+lineAmt(1,'Gas / LPG');
      const agg=findOpex('Aggregator Commission & Charges');
      const listed=[['Staff Salaries',d.sections[2].tot-svcStaff,'var(--red)'],...(ro.serviceChargeApplicable?[['Service Charge to Staff',svcStaff,'var(--orange)']]:[]),
        ['Food Cost',food,'var(--blue)'],...(ro.servesLiquor?[['Liquor Cost',liquor,'var(--purple)']]:[]),['Packaging & Gas',packGas,'var(--teal)'],
        ['Rent',rent,'var(--purple)'],['Electricity',elec,'var(--amber,var(--accent))'],['Aggregator Commission',agg,'var(--orange)'],['Marketing',mktg,'var(--teal)']];
      expItems=[...listed,['Other Operating Expenses',totalExp-listed.reduce((t,x)=>t+x[1],0),'var(--text3)']];
      mixItems=[['Cash',cash,'var(--accent)'],['Card',card,'var(--blue)'],['UPI',upi,'var(--teal)'],['Swiggy',swiggy,'var(--orange)'],['Zomato',zomato,'var(--red)'],['EazyDiner',eazy,'var(--teal)'],['Ownly',ownly,'var(--blue)'],['Eatby Minutes',ebm,'var(--purple)'],...(ro.servesLiquor?[['Bar',barSale,'var(--purple)']]:[])];
    }
    return{cash,card,upi,otherInc,totalRev,salaries,rent,elec,cosmetics,mktg,rMaint,misc,incentives,totalExp,netProfit,revItems,expItems,mixItems,
      cashColl:cash+card+upi,staff:activeEmps.length,attPct,gm:totalRev?Math.round((netProfit/totalRev)*100):0};
  };

  const cur=monthData(selMonth,selYear);
  const prev=monthData((selMonth-1+12)%12,selMonth===0?selYear-1:selYear);
  const ytd12=Array.from({length:12},(_,i)=>{const m=(today.getMonth()-11+i+12)%12;const y=today.getFullYear()+(today.getMonth()-11+i<0?-1:0);return monthData(m,y);});
  const dashReportTitle='Outlet Dashboard — '+(salon?salon.name.split('—')[0].trim():'Outlet')+' — '+MONTH_FULL[selMonth]+' '+selYear;
  const dashReportRows=isRest?[
    ...cur.revItems.map(x=>[x[0],x[1]]),['Total Revenue',cur.totalRev],
    ...cur.expItems.map(x=>[x[0],x[1]]),['Total Expenses',cur.totalExp],
    ['Net Profit',cur.netProfit],['Net Margin %',cur.gm+'%'],['Active Staff',cur.staff],['Attendance %',cur.attPct+'%']
  ]:[
    ['Cash Sale',cur.cash],['Card Sale',cur.card],['UPI Sale',cur.upi],['Other Income',cur.otherInc],['Total Revenue',cur.totalRev],
    ['Salaries',cur.salaries],['Rent',cur.rent],['Electricity',cur.elec],['Cosmetics/Backbar',cur.cosmetics],['Marketing',cur.mktg],['Repair & Maintenance',cur.rMaint],['Incentives',cur.incentives],['Miscellaneous',cur.misc],['Total Expenses',cur.totalExp],
    ['Net Profit',cur.netProfit],['Net Margin %',cur.gm+'%'],
    ['Cash Collection',cur.cash],['Card Collection',cur.card],['UPI Collection',cur.upi],
    ['Active Staff',cur.staff],['Attendance %',cur.attPct+'%']
  ];
  const dashReportBodyHtml=()=>'<table><thead><tr><th>Metric</th><th class="num">Value</th></tr></thead><tbody>'
    +dashReportRows.map(r=>'<tr><td>'+r[0]+'</td><td class="num">'+(typeof r[1]==='number'?'₹'+Math.round(r[1]).toLocaleString('en-IN'):r[1])+'</td></tr>').join('')+'</tbody></table>';
  const dashReportSheetRows=()=>[['Metric','Value'],...dashReportRows];

  const pct=(a,b)=>b>0?Math.round(((a-b)/b)*100):0;
  const arrow=(v)=>v>0?'+'+v+'%':v+'%';
  const arrowColor=(v)=>v>0?'var(--green)':v<0?'var(--red)':'var(--text3)';


  const MetCard=({label,val,sub,color,change})=>React.createElement('div',{className:`metric-card ${color||'blue'}`},
    React.createElement('div',{className:'metric-label'},label),
    React.createElement('div',{className:'metric-value'},val),
    sub&&React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:3}},sub),
    change!==undefined&&React.createElement('div',{style:{fontSize:11,color:arrowColor(change),marginTop:3}},arrow(change)+' vs last month')
  );

  const SectionBar=({label,a,b,colorA,colorB,labelA,labelB})=>{
    const mx=Math.max(a,b,1);
    return React.createElement('div',{style:{marginBottom:10}},
      React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}},
        React.createElement('span',{style:{color:'var(--text2)'}},(label)),
        React.createElement('span',{style:{color:'var(--text)',fontWeight:600}},rupee(a))
      ),
      React.createElement('div',{style:{display:'flex',gap:3,alignItems:'center'}},
        React.createElement('div',{style:{flex:1,height:8,background:'var(--bg3)',borderRadius:4,overflow:'hidden'}},
          React.createElement('div',{style:{height:'100%',width:(a/mx*100)+'%',background:colorA,borderRadius:4,transition:'width 0.4s'}})
        ),
        b!==undefined&&React.createElement('div',{style:{flex:1,height:8,background:'var(--bg3)',borderRadius:4,overflow:'hidden'}},
          React.createElement('div',{style:{height:'100%',width:(b/mx*100)+'%',background:colorB,borderRadius:4,transition:'width 0.4s'}})
        )
      )
    );
  };

  // Month-on-month comparison
  const cmpA=monthData(cmpMonthA,cmpYear);
  const cmpB=monthData(cmpMonthB,cmpYear);

  const CmpRow=({label,a,b,isExpense})=>{
    const diff=b-a;
    // a===0 with b>0 is a jump from nothing, not "no change" — forcing pctDiff to 0 there (the
    // only way to dodge dividing by zero) used to render a flat "0%" on a line that actually
    // went from ₹0 to a real amount. "New" reads honestly instead of a misleading flat number;
    // a===0 and b===0 together is genuinely no change, so that case still correctly shows 0%.
    const isNewFromZero=a===0&&b>0;
    const pctDiff=a>0?Math.round((diff/a)*100):0;
    // Revenue lines: an increase is favourable (green). Expense lines: an increase is
    // UNFAVOURABLE (red) — the opposite direction, so isExpense flips which sign reads as
    // "good" instead of just coloring every increase green regardless of what the line is.
    const displayPct=isExpense?pctDiff*-1:pctDiff;
    return React.createElement('div',{className:'stat-row'},
      React.createElement('span',{style:{fontSize:12,color:'var(--text2)',flex:1}},label),
      React.createElement('span',{style:{fontSize:12,textAlign:'right',minWidth:90}},rupee(a)),
      React.createElement('span',{style:{fontSize:12,textAlign:'right',minWidth:90}},rupee(b)),
      React.createElement('span',{style:{fontSize:12,textAlign:'right',minWidth:70,fontWeight:600,color:isNewFromZero?arrowColor(isExpense?-1:1):arrowColor(displayPct)}},isNewFromZero?'New':arrow(pctDiff))
    );
  };

  return React.createElement('div',{className:'fade-in'},
    React.createElement(OutletSetupChecklist,{salon,onNavTab}),
    React.createElement(DataGapsCard,{salon,onNavTab}),
    React.createElement(BudgetPaceStrip,{salon}),
    React.createElement(YoyCard,{salon,period}),
    // Header
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},fixAmp('Outlet Dashboard'+(salon?' — '+salon.name.split('—')[0].trim():''))),
        React.createElement('div',{className:'page-sub'},'Performance overview, P&L and month-on-month comparison')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}},
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selMonth,onChange:e=>setSelMonth(Number(e.target.value))},MONTH_FULL.map((m,i)=>React.createElement('option',{key:m,value:i},m))),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selYear,onChange:e=>setSelYear(Number(e.target.value))},appYears().map(y=>React.createElement('option',{key:y},y))),
        React.createElement(ShareReportButton,{title:dashReportTitle,subtitle:'Dashboard',getBodyHtml:dashReportBodyHtml,getSheetRows:dashReportSheetRows})
      )
    ),

    // View toggle tabs
    React.createElement('div',{className:'tab-bar',style:{marginBottom:16}},
      [{id:'monthly',label:'Monthly Overview'},{id:'compare',label:'Month-on-Month Comparison'},{id:'pl',label:'P&L Statement'},{id:'range',label:'Period Reports'},{id:'expenses',label:'Expenses Summary'}].map(t=>
        React.createElement('button',{key:t.id,className:`tab-btn ${view===t.id?'active':''}`,onClick:()=>setView(t.id)},t.label)
      )
    ),

    // ══ EXPENSES SUMMARY — Daily Sales & Exp rolled up, row-wise and group-wise, this month and
    // compared across months. Same shared component as Reports and Daily Sales & Exp itself. ══
    view==='expenses'&&React.createElement(ExpensesSummaryReport,{salon,period}),

    // ══ MONTHLY OVERVIEW ══
    view==='monthly'&&React.createElement('div',null,
      // KPI metrics
      React.createElement('div',{className:'grid4',style:{marginBottom:16}},
        React.createElement(MetCard,{label:'Total Revenue',val:rupee(cur.totalRev),color:'green',change:pct(cur.totalRev,prev.totalRev)}),
        React.createElement(MetCard,{label:'Net Profit',val:rupee(cur.netProfit),color:cur.netProfit>0?'teal':'red',change:pct(cur.netProfit,prev.netProfit)}),
        React.createElement(MetCard,{label:'Total Expenses',val:rupee(cur.totalExp),color:'amber',change:pct(cur.totalExp,prev.totalExp)}),
        React.createElement(MetCard,{label:'Gross Margin',val:cur.gm+'%',color:cur.gm>=20?'blue':'red',sub:MONTH_FULL[selMonth]+' '+selYear})
      ),
      React.createElement('div',{className:'grid4',style:{marginBottom:16}},
        React.createElement(MetCard,{label:'Cash Collection',val:rupee(cur.cash),color:'blue',change:pct(cur.cash,prev.cash)}),
        React.createElement(MetCard,{label:'Card Collection',val:rupee(cur.card),color:'purple',change:pct(cur.card,prev.card)}),
        React.createElement(MetCard,{label:'UPI Collection',val:rupee(cur.upi),color:'teal',change:pct(cur.upi,prev.upi)}),
        React.createElement(MetCard,{label:'Staff',val:cur.staff,sub:'Attendance: '+cur.attPct+'%',color:'blue'})
      ),

      // Charts row
      React.createElement('div',{className:'grid2',style:{marginBottom:16}},
        // Revenue trend bar chart
        React.createElement('div',{className:'card'},
          React.createElement('div',{className:'card-title'},'Revenue Trend — Last 12 Months'),
          React.createElement(DynamicBarChart,{
            data:ytd12.map((d,i)=>({label:MONTHS[(today.getMonth()-11+i+12)%12],value:d.totalRev})),
            height:150,highlightLast:true
          }),
          React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text3)',marginTop:8}},
            React.createElement('span',null,'12-month range'),
            React.createElement('span',null,'Max: ₹'+Math.max(...ytd12.map(d=>d.totalRev)).toLocaleString('en-IN'))
          )
        ),
        // Collection mix — animated donut
        React.createElement('div',{className:'card'},
          React.createElement('div',{className:'card-title'},(isRest?'Sales Mix — ':'Collection Mix — ')+MONTH_FULL[selMonth]),
          React.createElement(DynamicDonutChart,{
            centerLabel:isRest?'Total Sales':'Total Collected',
            segments:isRest?cur.mixItems.map(x=>({label:x[0],value:x[1],color:x[2]})):[
              {label:'Cash',value:cur.cash,color:'var(--accent)'},
              {label:'Card',value:cur.card,color:'var(--blue)'},
              {label:'UPI',value:cur.upi,color:'var(--teal)'}
            ]
          })
        )
      ),

      // Revenue vs Expense breakdown
      React.createElement('div',{className:'grid2'},
        React.createElement('div',{className:'card'},
          React.createElement('div',{className:'card-title'},'Revenue Breakdown'),
          ...(isRest?cur.revItems.map(x=>React.createElement(SectionBar,{key:x[0],label:x[0],a:x[1],colorA:x[2]})):[
          React.createElement(SectionBar,{key:'c',label:'Cash Sale',a:cur.cash,colorA:'var(--green)'}),
          React.createElement(SectionBar,{key:'d',label:'Card Sale',a:cur.card,colorA:'var(--blue)'}),
          React.createElement(SectionBar,{key:'u',label:'UPI Sale',a:cur.upi,colorA:'var(--purple)'}),
          React.createElement(SectionBar,{key:'o',label:'Other Income',a:cur.otherInc,colorA:'var(--teal)'})]),
          React.createElement('div',{style:{borderTop:'2px solid var(--accent)',paddingTop:8,marginTop:8,display:'flex',justifyContent:'space-between'}},
            React.createElement('span',{style:{fontWeight:700,color:'var(--text)'}},'Total Revenue'),
            React.createElement('span',{style:{fontWeight:700,fontSize:15,color:'var(--green)'}},rupee(cur.totalRev))
          )
        ),
        React.createElement('div',{className:'card'},
          React.createElement('div',{className:'card-title'},'Expense Breakdown'),
          ...(isRest?cur.expItems.map(x=>React.createElement(SectionBar,{key:x[0],label:x[0],a:x[1],colorA:x[2]})):[
          React.createElement(SectionBar,{key:'s',label:'Staff Salaries',a:cur.salaries,colorA:'var(--red)'}),
          React.createElement(SectionBar,{key:'i',label:'Incentives',a:cur.incentives,colorA:'var(--orange)'}),
          React.createElement(SectionBar,{key:'r',label:'Rent',a:cur.rent,colorA:'var(--purple)'}),
          React.createElement(SectionBar,{key:'e',label:'Electricity',a:cur.elec,colorA:'var(--amber,var(--accent))'}),
          React.createElement(SectionBar,{key:'c',label:'Cosmetics / Products',a:cur.cosmetics,colorA:'var(--blue)'}),
          React.createElement(SectionBar,{key:'m',label:'Marketing',a:cur.mktg,colorA:'var(--teal)'}),
          React.createElement(SectionBar,{key:'x',label:'R&M + Misc',a:cur.rMaint+cur.misc,colorA:'var(--text3)'})]),
          React.createElement('div',{style:{borderTop:'2px solid var(--red)',paddingTop:8,marginTop:8,display:'flex',justifyContent:'space-between'}},
            React.createElement('span',{style:{fontWeight:700,color:'var(--text)'}},'Total Expenses'),
            React.createElement('span',{style:{fontWeight:700,fontSize:15,color:'var(--red)'}},rupee(cur.totalExp))
          )
        )
      )
    ),

    // ══ MONTH ON MONTH COMPARISON ══
    view==='compare'&&React.createElement('div',null,
      React.createElement('div',{style:{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'center'}},
        React.createElement('div',{style:{background:'rgba(74,158,255,0.08)',border:'1px solid rgba(74,158,255,0.2)',borderRadius:'var(--r)',padding:'8px 14px',display:'flex',gap:8,alignItems:'center'}},
          React.createElement('span',{style:{fontSize:11,color:'var(--blue)',fontWeight:600}},'Month A:'),
          React.createElement('select',{className:'form-control',style:{width:'auto'},value:cmpMonthA,onChange:e=>setCmpMonthA(Number(e.target.value))},MONTH_FULL.map((m,i)=>React.createElement('option',{key:m,value:i},m)))
        ),
        React.createElement('span',{style:{fontSize:18,color:'var(--text3)',fontWeight:700}},'vs'),
        React.createElement('div',{style:{background:'rgba(76,175,125,0.08)',border:'1px solid rgba(76,175,125,0.2)',borderRadius:'var(--r)',padding:'8px 14px',display:'flex',gap:8,alignItems:'center'}},
          React.createElement('span',{style:{fontSize:11,color:'var(--green)',fontWeight:600}},'Month B:'),
          React.createElement('select',{className:'form-control',style:{width:'auto'},value:cmpMonthB,onChange:e=>setCmpMonthB(Number(e.target.value))},MONTH_FULL.map((m,i)=>React.createElement('option',{key:m,value:i},m)))
        ),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:cmpYear,onChange:e=>setCmpYear(Number(e.target.value))},appYears().map(y=>React.createElement('option',{key:y},y)))
      ),
      // Side-by-side KPI cards
      React.createElement('div',{className:'grid4',style:{marginBottom:16}},
        [
          {label:'Total Revenue',a:cmpA.totalRev,b:cmpB.totalRev,color:'green'},
          {label:'Net Profit',a:cmpA.netProfit,b:cmpB.netProfit,color:'teal'},
          {label:'Total Expenses',a:cmpA.totalExp,b:cmpB.totalExp,color:'red'},
          {label:'Gross Margin',a:cmpA.gm,b:cmpB.gm,color:'blue',suffix:'%'},
        ].map(m=>React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},
          React.createElement('div',{className:'metric-label'},m.label),
          React.createElement('div',{style:{display:'flex',gap:12,alignItems:'flex-end',marginTop:4}},
            React.createElement('div',null,
              React.createElement('div',{style:{fontSize:10,color:'var(--blue)',marginBottom:2}},MONTHS[cmpMonthA]),
              React.createElement('div',{style:{fontSize:17,fontWeight:700,color:'var(--text)'}},(m.suffix?m.a:(rupee(m.a)))+(m.suffix||''))
            ),
            React.createElement('div',{style:{fontSize:14,color:'var(--text3)'}},'→'),
            React.createElement('div',null,
              React.createElement('div',{style:{fontSize:10,color:'var(--green)',marginBottom:2}},MONTHS[cmpMonthB]),
              React.createElement('div',{style:{fontSize:17,fontWeight:700,color:'var(--text)'}},(m.suffix?m.b:(rupee(m.b)))+(m.suffix||''))
            ),
            React.createElement('div',{style:{fontSize:11,fontWeight:700,color:arrowColor(pct(m.a,m.b)*-1)}},arrow(pct(m.b,m.a)))
          )
        ))
      ),
      // Detailed comparison table
      React.createElement('div',{className:'card'},
        React.createElement('div',{style:{display:'flex',marginBottom:10,paddingBottom:8,borderBottom:'1px solid var(--border)'}},
          React.createElement('span',{style:{flex:1,fontSize:11,color:'var(--text3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}},'Category'),
          React.createElement('span',{style:{minWidth:110,textAlign:'right',fontSize:11,color:'var(--blue)',fontWeight:600}},MONTHS[cmpMonthA]+' '+cmpYear),
          React.createElement('span',{style:{minWidth:110,textAlign:'right',fontSize:11,color:'var(--green)',fontWeight:600}},MONTHS[cmpMonthB]+' '+cmpYear),
          React.createElement('span',{style:{minWidth:70,textAlign:'right',fontSize:11,color:'var(--text3)',fontWeight:600}},'Change')
        ),
        React.createElement('div',{style:{marginBottom:8,paddingBottom:8,borderBottom:'1px solid var(--border)'}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--green)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}},'Revenue'),
          ...(isRest?cmpB.revItems.map((x,i)=>React.createElement(CmpRow,{key:x[0],label:x[0],a:(cmpA.revItems[i]||[])[1]||0,b:x[1]})):[
          React.createElement(CmpRow,{key:'c',label:'Cash Sale',a:cmpA.cash,b:cmpB.cash}),
          React.createElement(CmpRow,{key:'d',label:'Card Sale',a:cmpA.card,b:cmpB.card}),
          React.createElement(CmpRow,{key:'u',label:'UPI Sale',a:cmpA.upi,b:cmpB.upi}),
          React.createElement(CmpRow,{key:'o',label:'Other Income',a:cmpA.otherInc,b:cmpB.otherInc})]),
          React.createElement('div',{className:'stat-row',style:{fontWeight:700}},
            React.createElement('span',{style:{fontSize:13,color:'var(--text)',flex:1}},'Total Revenue'),
            React.createElement('span',{style:{color:'var(--green)',minWidth:110,textAlign:'right'}},rupee(cmpA.totalRev)),
            React.createElement('span',{style:{color:'var(--green)',minWidth:110,textAlign:'right'}},rupee(cmpB.totalRev)),
            React.createElement('span',{style:{minWidth:70,textAlign:'right',color:arrowColor(pct(cmpB.totalRev,cmpA.totalRev))}},arrow(pct(cmpB.totalRev,cmpA.totalRev)))
          )
        ),
        React.createElement('div',{style:{marginBottom:8,paddingBottom:8,borderBottom:'1px solid var(--border)'}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--red)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}},'Expenses'),
          ...(isRest?cmpB.expItems.map((x,i)=>React.createElement(CmpRow,{key:x[0],label:x[0],a:(cmpA.expItems[i]||[])[1]||0,b:x[1],isExpense:true})):[
          React.createElement(CmpRow,{key:'s',label:'Staff Salaries',a:cmpA.salaries,b:cmpB.salaries,isExpense:true}),
          React.createElement(CmpRow,{key:'i',label:'Incentives',a:cmpA.incentives,b:cmpB.incentives,isExpense:true}),
          React.createElement(CmpRow,{key:'r',label:'Rent',a:cmpA.rent,b:cmpB.rent,isExpense:true}),
          React.createElement(CmpRow,{key:'e',label:'Electricity',a:cmpA.elec,b:cmpB.elec,isExpense:true}),
          React.createElement(CmpRow,{key:'c',label:'Products/Cosmetics',a:cmpA.cosmetics,b:cmpB.cosmetics,isExpense:true}),
          React.createElement(CmpRow,{key:'m',label:'Marketing',a:cmpA.mktg,b:cmpB.mktg,isExpense:true}),
          React.createElement(CmpRow,{key:'x',label:'Repair & Misc',a:cmpA.rMaint+cmpA.misc,b:cmpB.rMaint+cmpB.misc,isExpense:true})]),
          React.createElement('div',{className:'stat-row',style:{fontWeight:700}},
            React.createElement('span',{style:{fontSize:13,color:'var(--text)',flex:1}},'Total Expenses'),
            React.createElement('span',{style:{color:'var(--red)',minWidth:110,textAlign:'right'}},rupee(cmpA.totalExp)),
            React.createElement('span',{style:{color:'var(--red)',minWidth:110,textAlign:'right'}},rupee(cmpB.totalExp)),
            React.createElement('span',{style:{minWidth:70,textAlign:'right',color:arrowColor(pct(cmpB.totalExp,cmpA.totalExp)*-1)}},arrow(pct(cmpB.totalExp,cmpA.totalExp)))
          )
        ),
        React.createElement('div',{className:'stat-row',style:{fontWeight:700}},
          React.createElement('span',{style:{fontSize:14,color:'var(--text)',flex:1}},'Net Profit / Loss'),
          React.createElement('span',{style:{fontWeight:800,fontSize:14,color:cmpA.netProfit>=0?'var(--green)':'var(--red)',minWidth:110,textAlign:'right'}},rupee(cmpA.netProfit)),
          React.createElement('span',{style:{fontWeight:800,fontSize:14,color:cmpB.netProfit>=0?'var(--green)':'var(--red)',minWidth:110,textAlign:'right'}},rupee(cmpB.netProfit)),
          React.createElement('span',{style:{minWidth:70,textAlign:'right',fontWeight:800,color:arrowColor(pct(cmpB.netProfit,cmpA.netProfit))}},arrow(pct(cmpB.netProfit,cmpA.netProfit)))
        )
      )
    ),

    // ══ P&L STATEMENT ══
    view==='pl'&&React.createElement('div',null,
      React.createElement('div',{className:'grid4',style:{marginBottom:16}},
        React.createElement(MetCard,{label:'Total Revenue',val:rupee(cur.totalRev),color:'green'}),
        React.createElement(MetCard,{label:'Total Expenses',val:rupee(cur.totalExp),color:'red'}),
        React.createElement(MetCard,{label:'Net Profit',val:'₹'+Math.abs(cur.netProfit).toLocaleString('en-IN'),color:cur.netProfit>=0?'teal':'red',sub:cur.netProfit>=0?'Profit':'Loss'}),
        React.createElement(MetCard,{label:'Gross Margin',val:cur.gm+'%',color:cur.gm>=20?'blue':'amber'})
      ),
      React.createElement('div',{className:'grid2'},
        React.createElement('div',{className:'card',style:{borderLeft:'3px solid var(--green)'}},
          React.createElement('div',{style:{fontWeight:700,fontSize:14,color:'var(--green)',marginBottom:12}},'INCOME — '+MONTH_FULL[selMonth]+' '+selYear),
          (isRest?cur.revItems:[['Cash Sale',cur.cash],['Card Sale',cur.card],['UPI Sale',cur.upi],['Other Income',cur.otherInc]]).map(([k,v])=>
            React.createElement('div',{key:k,className:'stat-row'},
              React.createElement('span',{style:{fontSize:13,color:'var(--text2)'}},k),
              React.createElement('div',{style:{textAlign:'right'}},
                React.createElement('div',{style:{fontSize:13,fontWeight:500,color:'var(--green)'}},rupee(v)),
                React.createElement('div',{style:{fontSize:10,color:'var(--text3)'}},cur.totalRev>0?(v/cur.totalRev*100).toFixed(1)+'%':'0%')
              )
            )
          ),
          React.createElement('div',{style:{display:'flex',justifyContent:'space-between',paddingTop:10,marginTop:4,borderTop:'2px solid rgba(76,175,125,0.4)',fontWeight:700}},
            React.createElement('span',{style:{fontSize:14}},'Total Revenue'),
            React.createElement('span',{style:{fontSize:16,color:'var(--green)'}},rupee(cur.totalRev))
          )
        ),
        React.createElement('div',{className:'card',style:{borderLeft:'3px solid var(--red)'}},
          React.createElement('div',{style:{fontWeight:700,fontSize:14,color:'var(--red)',marginBottom:12}},'EXPENSES — '+MONTH_FULL[selMonth]+' '+selYear),
          (isRest?cur.expItems:[['Staff Salaries',cur.salaries],['Incentive Payments',cur.incentives],['Rent',cur.rent],['Electricity',cur.elec],['Cosmetics/Products',cur.cosmetics],['Marketing',cur.mktg],['Repair & Maintenance',cur.rMaint],['Miscellaneous',cur.misc]]).map(([k,v])=>
            React.createElement('div',{key:k,className:'stat-row'},
              React.createElement('span',{style:{fontSize:13,color:'var(--text2)'}},k),
              React.createElement('div',{style:{textAlign:'right'}},
                React.createElement('div',{style:{fontSize:13,fontWeight:500,color:'var(--red)'}},rupee(v)),
                React.createElement('div',{style:{fontSize:10,color:'var(--text3)'}},cur.totalRev>0?(v/cur.totalRev*100).toFixed(1)+'%':'0%')
              )
            )
          ),
          React.createElement('div',{style:{display:'flex',justifyContent:'space-between',paddingTop:10,marginTop:4,borderTop:'2px solid rgba(255,107,107,0.4)',fontWeight:700}},
            React.createElement('span',{style:{fontSize:14}},'Total Expenses'),
            React.createElement('span',{style:{fontSize:16,color:'var(--red)'}},rupee(cur.totalExp))
          )
        )
      ),
      React.createElement('div',{className:'card',style:{marginTop:14,background:'var(--bg4)',borderLeft:'3px solid var(--accent)'}},
        React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
          React.createElement('span',{style:{fontWeight:700,fontSize:17,color:'var(--text)'}},'NET PROFIT / LOSS — '+MONTH_FULL[selMonth]+' '+selYear),
          React.createElement('div',{style:{textAlign:'right'}},
            React.createElement('div',{style:{fontWeight:800,fontSize:26,color:cur.netProfit>=0?'var(--green)':'var(--red)'}},(cur.netProfit>=0?'+':'')+rupee(cur.netProfit)),
            React.createElement('div',{style:{fontSize:12,color:'var(--text3)',marginTop:2}},'Gross Margin: '+cur.gm+'%')
          )
        )
      ),

      // ── Variance vs Previous Month / Same Month Last Year — comparative chart + colour-coded
      // line-by-line table + auto-flagged significant swings, same engine OutletPnLSheet's own
      // Variance Analysis tab uses, so the two screens can never disagree. ──
      React.createElement('div',{style:{marginTop:24}},
        React.createElement('div',{style:{fontWeight:700,fontSize:15,color:'var(--text)',marginBottom:4}},'Variance Analysis'),
        React.createElement('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:14}},'How '+MONTH_FULL[selMonth]+' '+selYear+' moved against a comparison period.'),
        React.createElement(PnLVarianceSection,{salonId:sid,fy:calToFYMI(selYear,selMonth).fy,mi:calToFYMI(selYear,selMonth).mi})
      )
    ),

    // ══ PERIOD / RANGE REPORTS (1–36 months) ══
    view==='range'&&(()=>{
      const list=Array.from({length:rangeMonths},(_,i)=>{
        const idx=selYear*12+selMonth-(rangeMonths-1-i);
        const y=Math.floor(idx/12),m=((idx%12)+12)%12;
        return{m,y,d:monthData(m,y)};
      });
      const sum=(k)=>list.reduce((s,x)=>s+x.d[k],0);
      const totRev=sum('totalRev'),totExp=sum('totalExp'),totNet=sum('netProfit');
      const avgGm=totRev>0?Math.round((totNet/totRev)*100):0;
      const maxRev=Math.max(...list.map(x=>x.d.totalRev),1);
      return React.createElement('div',null,
        React.createElement('div',{style:{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}},
          React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'Report range (ending '+MONTH_FULL[selMonth]+' '+selYear+'):'),
          [1,3,6,12,18,24,36].map(n=>React.createElement('button',{key:n,className:`btn btn-sm ${rangeMonths===n?'btn-primary':'btn-ghost'}`,onClick:()=>setRangeMonths(n)},n===1?'1 Month':n+' Months')),
          salon&&React.createElement('span',{style:{marginLeft:'auto'}},React.createElement(XlReportButton,{label:'⬇ Full P&L for these months (Excel)',title:'Every P&L line month by month with totals, margins and a summary',
            build:()=>{const st=new Date(selYear,selMonth-Math.min(rangeMonths,24)+1,1);return buildPeriodPnlWorkbook(salon.id,salon,{year:st.getFullYear(),month:st.getMonth()},{year:selYear,month:selMonth});}}))
        ),
        React.createElement('div',{className:'grid4',style:{marginBottom:16}},
          React.createElement(MetCard,{label:'Total Revenue ('+rangeMonths+' mo)',val:rupee(totRev),color:'green'}),
          React.createElement(MetCard,{label:'Total Expenses ('+rangeMonths+' mo)',val:rupee(totExp),color:'amber'}),
          React.createElement(MetCard,{label:'Net Profit ('+rangeMonths+' mo)',val:rupee(totNet),color:totNet>=0?'teal':'red'}),
          React.createElement(MetCard,{label:'Avg Net Margin',val:avgGm+'%',color:avgGm>=20?'blue':'red',sub:'Avg revenue ₹'+Math.round(totRev/rangeMonths).toLocaleString('en-IN')+'/mo'})
        ),
        React.createElement('div',{className:'card',style:{marginBottom:16}},
          React.createElement('div',{className:'card-title'},'Revenue Trend — Last '+rangeMonths+' Month'+(rangeMonths>1?'s':'')),
          React.createElement('div',{style:{display:'flex',alignItems:'flex-end',gap:2,height:130,paddingBottom:20,position:'relative'}},
            list.map((x,i)=>React.createElement('div',{key:i,title:MONTH_FULL[x.m]+' '+x.y+': ₹'+x.d.totalRev.toLocaleString('en-IN'),style:{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',height:'100%'}},
              React.createElement('div',{style:{width:'100%',height:Math.max(3,Math.round((x.d.totalRev/maxRev)*105))+'px',background:i===list.length-1?'linear-gradient(to top,var(--accent),var(--accent2))':'linear-gradient(to top,var(--blue),rgba(74,158,255,0.4))',borderRadius:'2px 2px 0 0',transition:'height 0.4s'}}),
              rangeMonths<=18&&React.createElement('div',{style:{position:'absolute',bottom:2,fontSize:8,color:'var(--text3)',left:i*(100/list.length)+'%',width:(100/list.length)+'%',textAlign:'center',overflow:'hidden'}},MONTHS[x.m])
            ))
          ),
          rangeMonths>18&&React.createElement('div',{style:{fontSize:10,color:'var(--text3)',marginTop:4}},'Hover a bar to see the month and revenue')
        ),
        React.createElement('div',{className:'card'},
          React.createElement('div',{className:'card-title'},'Month-wise Report — '+rangeMonths+' Month'+(rangeMonths>1?'s':'')),
          React.createElement('div',{className:'table-wrap'},
            React.createElement('table',null,
              React.createElement('thead',null,React.createElement('tr',null,['Month','Revenue','Expenses','Net Profit','Margin %','Cash','Card','UPI'].map(h=>React.createElement('th',{key:h},h)))),
              React.createElement('tbody',null,
                list.map((x,i)=>React.createElement('tr',{key:i},
                  React.createElement('td',null,React.createElement('span',{style:{fontWeight:500,color:'var(--text)',whiteSpace:'nowrap'}},MONTH_FULL[x.m]+' '+x.y)),
                  React.createElement('td',null,rupee(x.d.totalRev)),
                  React.createElement('td',null,rupee(x.d.totalExp)),
                  React.createElement('td',null,React.createElement('span',{style:{color:x.d.netProfit>=0?'var(--green)':'var(--red)',fontWeight:600}},rupee(x.d.netProfit))),
                  React.createElement('td',null,x.d.gm+'%'),
                  React.createElement('td',null,rupee(x.d.cash)),
                  React.createElement('td',null,rupee(x.d.card)),
                  React.createElement('td',null,rupee(x.d.upi))
                )),
                React.createElement('tr',{style:{fontWeight:700,background:'var(--bg3)'}},
                  React.createElement('td',null,'TOTAL ('+rangeMonths+' mo)'),
                  React.createElement('td',null,rupee(totRev)),
                  React.createElement('td',null,rupee(totExp)),
                  React.createElement('td',null,React.createElement('span',{style:{color:totNet>=0?'var(--green)':'var(--red)'}},rupee(totNet))),
                  React.createElement('td',null,avgGm+'%'),
                  React.createElement('td',null,'₹'+sum('cash').toLocaleString('en-IN')),
                  React.createElement('td',null,'₹'+sum('card').toLocaleString('en-IN')),
                  React.createElement('td',null,'₹'+sum('upi').toLocaleString('en-IN'))
                )
              )
            )
          )
        )
      );
    })()
  );
}

// EPF Employer Contribution — 12% of Basic Salary, capped at the statutory PF wage ceiling
// (pfWageCeilingFor — ₹25,000 from 17 Sep 2026) by default (uncapped if pfOnActualBasic is set). Zero whenever PF doesn't apply —
// either the outlet isn't PF-registered, or this employee individually isn't on PF. This is a
// real cost to the employer and must be included in Gross CTC, not shown as a side note next to it.
function epfEmployerContributionFor(basic,pfOnActualBasic,pfApplicableAtSalon,pfEnabledForEmployee,year,month){
  if(!pfApplicableAtSalon||!pfEnabledForEmployee)return 0;
  const wageBase=pfOnActualBasic?(Number(basic)||0):pfCappedWage(basic,year,month);
  return Math.round(wageBase*0.12);
}
function MasterSalarySheet({salon}={}){
  const DEPARTMENTS=isRestaurantOutlet(salon?.id)
    ?['Kitchen','Service','Bar','Manager','Accounts / Admin','Helper','Housekeeper']
    :['Hairdresser','Beautician','Pedicurist','Manager','Helper','Housekeeper'];
  const DESIG_BY_DEPT=isRestaurantOutlet(salon?.id)?{
    'Kitchen':['Head Chef','Sous Chef','Chef de Partie','Commis','Tandoor Chef','Kitchen Helper'],
    'Service':['Captain','Steward','Waiter','Host / Hostess','Cashier'],
    'Bar':['Bartender','Bar Back'],
    'Manager':['Restaurant Manager','Assistant Manager','F&B Manager'],
    'Accounts / Admin':['Accountant','Store Keeper'],
    'Helper':['Helper','Dishwasher'],
    'Housekeeper':['Housekeeper']
  }:{
    'Hairdresser':['Unisex Hairdresser','Men Hairdresser','Ladies Hairdresser'],
    'Beautician':['Beautician'],
    'Pedicurist':['Pedicurist'],
    'Manager':['Salon Manager','Manager','Assist Manager'],
    'Helper':['Helper'],
    'Housekeeper':['Housekeeper']
  };
  const BLANK={id:'',billingId:'',name:'',fatherName:'',mobile:'',email:'',address:'',desig:'',dept:'',doj:'',dol:'',weeklyOff:'Sunday',basic:'',hra:'',conv:'',special:'',gross:'',pf:false,pfOnActualBasic:false,pfNumber:'',esic:false,esicNumber:'',pt:false,tds:false,pan:'',aadhar:'',bankName:'',accountNo:'',ifsc:'',accountHolder:'',status:'Active',panFile:null,aadharFile:null,bankProofFile:null};
  const [employees,setEmployees]=useState(()=>loadEmployees(salon?.id));
  useEffect(()=>{saveEmployees(employees,salon?.id);},[employees]);
  const [showAddModal,setShowAddModal]=useState(false);
  const [showViewModal,setShowViewModal]=useState(false);
  const [showImportModal,setShowImportModal]=useState(false);
  const [showDeleteModal,setShowDeleteModal]=useState(false);
  const [deleteTarget,setDeleteTarget]=useState(null);
  const [showBulkDeleteConfirm,setShowBulkDeleteConfirm]=useState(false);
  const [viewEmp,setViewEmp]=useState(null);
  const [editMode,setEditMode]=useState(false);
  const [form,setForm]=useState(BLANK);
  const [importRows,setImportRows]=useState([]);
  const [importError,setImportError]=useState('');
  const [search,setSearch]=useState('');
  const [statusFilter,setStatusFilter]=useState('All');
  const [activeTab,setActiveTab]=useState('personal');
  const [exportMsg,setExportMsg]=useState('');
  const [empView,setEmpView]=useState('active');   // 'active' | 'inactive'
  const [showInactive,setShowInactive]=useState(false);

  // ── Bulk actions — select several employees at once (checkbox column, header "select all"
  // for whatever's currently visible under the active filters) and apply one action to all of
  // them: Mark Active, Mark Inactive, or Delete. Delete goes through the same Undo-toast pattern
  // as a single delete, just restoring the whole batch at its original positions if clicked. ──
  const [bulkSelectedIds,setBulkSelectedIds]=useState(()=>new Set());
  const toggleBulkSelect=(id)=>setBulkSelectedIds(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});
  const bulkSetStatus=(status)=>{
    const ids=bulkSelectedIds;
    setEmployees(prev=>prev.map(e=>ids.has(e.id)?{...e,status}:e));
    ids.forEach(id=>{
      const emp=employees.find(e=>e.id===id);
      if(emp)logAuditEvent(salon&&salon.id,{entity:'Employee',entityId:id,action:'Edited',summary:emp.name+' — status set to '+status+' (bulk)'});
    });
    empToast(ids.size+' employee'+(ids.size===1?'':'s')+' marked '+status,'success');
    setBulkSelectedIds(new Set());
  };
  const bulkDelete=()=>{
    const ids=bulkSelectedIds;
    if(!ids.size)return;
    const removedEmps=employees.filter(e=>ids.has(e.id));
    const removedIndices=new Map(removedEmps.map(e=>[e.id,employees.findIndex(x=>x.id===e.id)]));
    removedEmps.forEach(e=>logAuditEvent(salon&&salon.id,{entity:'Employee',entityId:e.id,action:'Deleted',summary:e.name+' — '+(e.desig||'')+' (bulk)'}));
    setEmployees(prev=>prev.filter(e=>!ids.has(e.id)));
    setBulkSelectedIds(new Set());
    empToast(removedEmps.length+' employee'+(removedEmps.length===1?'':'s')+' deleted','warning',8000,()=>{
      removedEmps.forEach(e=>logAuditEvent(salon&&salon.id,{entity:'Employee',entityId:e.id,action:'Restored (Undo)',summary:e.name+' — '+(e.desig||'')}));
      setEmployees(prev=>{
        const next=[...prev];
        // Restore in original relative order, each at (clamped) original index.
        [...removedEmps].sort((a,b)=>removedIndices.get(a.id)-removedIndices.get(b.id)).forEach(e=>{
          next.splice(Math.min(removedIndices.get(e.id),next.length),0,e);
        });
        return next;
      });
    });
  };
  useEffect(()=>{setBulkSelectedIds(new Set());},[search,statusFilter,salon?.id]);

  const nextId=()=>nextPrefixedId(employees,'E',3);
  const {toast:empToast,error:empToastErr}=useToast();
  const fv=(k)=>(v)=>setForm(f=>({...f,[k]:v}));
  const fc=(k)=>(e)=>fv(k)(e.target.type==='checkbox'?e.target.checked:e.target.value);
  const fvFile=(k)=>(file)=>{
    readFileAsAttachment(file,
      rec=>{fv(k)(rec);empToast((k==='panFile'?'PAN':k==='aadharFile'?'Aadhaar':'Bank proof')+' attached','success');},
      err=>empToastErr(err==='size'?'That file is too large (max 4MB) — try a smaller photo or a compressed PDF.':"Couldn't read that file — please try again.")
    );
  };

  const saveEmployee=()=>{
    if(!form.name||!form.desig||!form.doj){alert('Name, Designation and Date of Joining are required.');return;}
    if(!form.aadharFile){alert('Uploading a copy of the Aadhaar Card is mandatory.');return;}
    if(!confirmIdFields({pan:form.pan,aadhar:form.aadhar,mobile:form.mobile,email:form.email,pfNumber:form.pfNumber,esicNumber:form.esicNumber,accountNo:form.accountNo,ifsc:form.ifsc,bankName:form.bankName},'the employee details',salon&&salon.id))return;
    // Professional Tax always tracks the outlet's own applicability — never a manual per-employee
    // choice, since it's the outlet's State (not the person) that decides whether PT applies.
    // Gross CTC is always the live auto-sum (Basic + HRA + Conveyance + Special + EPF Employer
    // Contribution) — recomputed at save time so it can never drift from a stale/older total.
    const epfContrib=epfEmployerContributionFor(form.basic,form.pfOnActualBasic,salon&&salon.pfApplicable,form.pf);
    const emp={...form,id:form.id||nextId(),basic:Number(form.basic)||0,hra:Number(form.hra)||0,conv:Number(form.conv)||0,special:Number(form.special)||0,
      gross:Number(form.basic)+Number(form.hra)+Number(form.conv)+Number(form.special)+epfContrib,
      pt:!!(salon&&salon.ptApplicable)};
    if(editMode){setEmployees(prev=>prev.map(e=>e.id===emp.id?emp:e));}
    else{setEmployees(prev=>[...prev,emp]);}
    logAuditEvent(salon&&salon.id,{entity:'Employee',entityId:emp.id,action:editMode?'Edited':'Added',summary:emp.name+' — '+emp.desig+' — Gross CTC ₹'+Math.round(emp.gross).toLocaleString('en-IN')});
    setShowAddModal(false);setForm(BLANK);setEditMode(false);
  };

  const openEdit=(emp)=>{setForm({...BLANK,...emp});setEditMode(true);setActiveTab('personal');setShowAddModal(true);};
  const openView=(emp)=>{setViewEmp(emp);setShowViewModal(true);};
  const openDelete=(emp)=>{setDeleteTarget(emp);setShowDeleteModal(true);};
  const confirmDelete=()=>{
    const removedEmp=deleteTarget;
    const removedIndex=employees.findIndex(e=>e.id===removedEmp.id);
    logAuditEvent(salon&&salon.id,{entity:'Employee',entityId:removedEmp.id,action:'Deleted',summary:removedEmp.name+' — '+(removedEmp.desig||'')});
    setEmployees(prev=>prev.filter(e=>e.id!==removedEmp.id));setShowDeleteModal(false);setDeleteTarget(null);
    // Undo — restores the exact record at its original position rather than just appending it
    // back at the end, so re-sorting/scroll position after undoing feels like nothing happened.
    // 8 seconds (vs. the usual 3s toast) since "did I mean to delete that" takes a moment longer
    // to register than a routine save confirmation.
    empToast(removedEmp.name+' deleted','warning',8000,()=>{
      logAuditEvent(salon&&salon.id,{entity:'Employee',entityId:removedEmp.id,action:'Restored (Undo)',summary:removedEmp.name+' — '+(removedEmp.desig||'')});
      setEmployees(prev=>{
        const next=[...prev];
        next.splice(Math.min(removedIndex,next.length),0,removedEmp);
        return next;
      });
    });
  };

  // Export to Excel (CSV)
  const exportToExcel=async(data)=>{
    const cols=['Emp ID','Billing Software ID','Full Name',"Father's Name",'Mobile','Email','Address','Designation','Department','Date of Joining','Date of Left','Weekly Off','Basic','HRA','Conveyance','Special Allowance','Gross CTC','PF','ESIC','PAN Card No','Aadhaar No','Bank Name','Account Number','IFSC Code','Account Holder Name','Status'];
    const rows=data.map(e=>[e.id,e.billingId||'',e.name,e.fatherName||'',e.mobile||'',e.email||'',e.address||'',e.desig,e.dept||'',e.doj||'',e.dol||'',e.weeklyOff||'Sunday',e.basic||0,e.hra||0,e.conv||0,e.special||0,e.gross||0,e.pf?'Yes':'No',e.esic?'Yes':'No',e.pan||'',e.aadhar||'',e.bankName||'',e.accountNo||'',e.ifsc||'',e.accountHolder||'',e.status]);
    const filename=`SalonOS_Master_Salary_Sheet_${localTodayIso()}.xlsx`;
    try{
      const blob=await exportReportExcelBlob('Master Salary Sheet',[cols,...rows]);
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
      setExportMsg('✓ Excel exported successfully');setTimeout(()=>setExportMsg(''),3000);
    }catch(err){
      setExportMsg('✕ Export failed — '+err.message);setTimeout(()=>setExportMsg(''),4000);
    }
  };

  // Export to PDF (print-ready HTML rendered in new window)
  const exportToPDF=(data)=>{
    const rows=data.map(e=>`
      <tr>
        <td>${e.id}</td><td><b>${e.name}</b><br><small>${e.dept||''}</small></td>
        <td>${e.desig}</td><td>${fmtDMY(e.doj)}</td><td style="color:${e.dol?'#c0392b':'#888'}">${e.dol?fmtDMY(e.dol):'—'}</td>
        <td>${e.weeklyOff||'Sun'}</td>
        <td>₹${(e.basic||0).toLocaleString('en-IN')}</td><td>₹${(e.hra||0).toLocaleString('en-IN')}</td>
        <td>₹${(e.conv||0).toLocaleString('en-IN')}</td><td>₹${(e.special||0).toLocaleString('en-IN')}</td>
        <td><b>₹${(e.gross||0).toLocaleString('en-IN')}</b></td>
        <td>${e.pf?'✓':'✗'}</td><td>${e.esic?'✓':'✗'}</td>
        <td style="font-family:monospace;font-size:10px">${e.pan||'—'}</td>
        <td style="font-family:monospace;font-size:10px">${e.aadhar||'—'}</td>
        <td>${e.bankName||'—'}</td>
        <td style="font-family:monospace;font-size:10px">${e.accountNo?'••••'+String(e.accountNo).slice(-4):'—'}</td>
        <td style="font-family:monospace;font-size:10px">${e.ifsc||'—'}</td>
        <td><span style="background:${e.status==='Active'?'#e8f5e9':e.status==='Resigned'?'#ffebee':'#fff3e0'};color:${e.status==='Active'?'#2e7d32':e.status==='Resigned'?'#c62828':'#e65100'};padding:2px 8px;border-radius:10px;font-size:10px">${e.status}</span></td>
        <td>${e.mobile||'—'}</td><td style="font-size:10px">${e.email||'—'}</td>
      </tr>`).join('');
    const totalGross=data.reduce((s,e)=>s+Number(e.gross||0),0);
    const activeCount=data.filter(e=>e.status==='Active').length;
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Master Salary Sheet — SalonOS</title>
    <style>
      @page{size:A3 landscape;margin:15mm}
      *{box-sizing:border-box}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#222;margin:0;padding:0}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #2F5FE0}
      .logo{font-family:Georgia,serif;font-size:22px;color:#2F5FE0;font-weight:600}
      .logo-sub{font-size:10px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-top:2px}
      .meta{text-align:right;font-size:10px;color:#666}
      .meta b{color:#222;font-size:12px}
      .summary{display:flex;gap:16px;margin-bottom:16px}
      .sum-card{flex:1;background:#f8f6f0;border:1px solid #e8e0d0;border-radius:6px;padding:10px 14px;border-top:3px solid #2F5FE0}
      .sum-label{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:4px}
      .sum-val{font-size:18px;font-weight:700;color:#222}
      table{width:100%;border-collapse:collapse;font-size:10px}
      thead tr{background:#1e1e26}
      th{padding:8px 6px;text-align:left;font-size:9px;font-weight:700;color:#4C7DFF;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap}
      td{padding:7px 6px;border-bottom:1px solid #eee;vertical-align:top}
      tr:nth-child(even) td{background:#fafaf8}
      tr:hover td{background:#fff8ee}
      .footer{margin-top:16px;padding-top:10px;border-top:1px solid #ddd;display:flex;justify-content:space-between;font-size:9px;color:#999}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
    <div class="header">
      <div><div class="logo">SalonOS</div><div class="logo-sub">Master Salary Sheet</div></div>
      <div class="meta">
        <div><b>Exported on:</b> ${new Date().toLocaleString('en-IN')}</div>
        <div><b>Filter:</b> ${statusFilter} employees &nbsp;|&nbsp; <b>Records:</b> ${data.length}</div>
      </div>
    </div>
    <div class="summary">
      <div class="sum-card"><div class="sum-label">Total Employees</div><div class="sum-val">${data.length}</div></div>
      <div class="sum-card"><div class="sum-label">Active</div><div class="sum-val">${activeCount}</div></div>
      <div class="sum-card"><div class="sum-label">Total Gross CTC</div><div class="sum-val">₹${totalGross.toLocaleString('en-IN')}</div></div>
      <div class="sum-card"><div class="sum-label">On PF</div><div class="sum-val">${data.filter(e=>e.pf).length}</div></div>
      <div class="sum-card"><div class="sum-label">On ESIC</div><div class="sum-val">${data.filter(e=>e.esic).length}</div></div>
    </div>
    <table>
      <thead><tr>${['ID','Name','Designation','DOJ','DOL','W/Off','Basic','HRA','Conv','Special','Gross CTC','PF','ESIC','PAN','Aadhaar','Bank','Acc No','IFSC','Status','Mobile','Email'].map(h=>`<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">
      <div>SalonOS — Confidential | For Internal Use Only</div>
      <div>Total Gross Payable: <b>₹${totalGross.toLocaleString('en-IN')}</b></div>
    </div>
    <script>window.onload=()=>{window.print();}<\/script>
    </body></html>`;
    const w=window.open('','_blank');w.document.write(html);w.document.close();
    setExportMsg('✓ PDF ready — print dialog opened');setTimeout(()=>setExportMsg(''),4000);
  };

  // Download Excel Template
  const downloadTemplate=()=>{
    const headers=['Emp ID','Billing Software ID','Full Name','Father Name','Mobile','Email','Address','Designation','Department','Date of Joining (YYYY-MM-DD)','Date of Left (YYYY-MM-DD)','Weekly Off','Basic Salary','HRA','Conveyance','Special Allowance','Gross CTC','PF (Yes/No)','PF Number (UAN)','ESIC (Yes/No)','ESIC Number','Professional Tax (Yes/No)','TDS (Yes/No)','PAN Card No','Aadhaar No','Bank Name','Account Number','IFSC Code','Account Holder Name','Status (Active/Inactive)'];
    const sample=['E001','BILL-1001','Ravi Kumar','Suresh Kumar','9876500000','ravi@email.com','123 Main Street, City 110001','Stylist','Hair','2024-01-01','','Sunday',15000,6000,1600,2400,25000,'Yes','100123456789','Yes','3412345678','Yes','No','ABCPK1234A','1234 5678 9012','HDFC Bank','50100123456','HDFC0001234','Ravi Kumar','Active'];
    const csvContent=[headers,sample].map(r=>r.map(c=>`"${c}"`).join(',')).join('\n');
    const blob=new Blob([csvContent],{type:'text/csv'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='SalonOS_Employee_Import_Template.csv';a.click();URL.revokeObjectURL(url);
  };

  // Import CSV/Excel parsing
  const handleFileImport=(e)=>{
    const file=e.target.files[0];if(!file)return;
    setImportError('');
    const reader=new FileReader();
    reader.onload=(ev)=>{
      try{
        const text=ev.target.result;
        const lines=text.split('\n').filter(l=>l.trim());
        if(lines.length<2){setImportError('File is empty or has no data rows.');return;}
        const headers=lines[0].split(',').map(h=>h.replace(/"/g,'').trim());
        const rows=lines.slice(1).map(line=>{
          const vals=line.split(',').map(v=>v.replace(/"/g,'').trim());
          const obj={};headers.forEach((h,i)=>obj[h]=vals[i]||'');
          return{
            id:obj['Emp ID']||nextId(),billingId:obj['Billing Software ID']||'',name:obj['Full Name']||'',fatherName:obj['Father Name']||'',
            mobile:obj['Mobile']||'',email:obj['Email']||'',address:obj['Address']||'',
            desig:obj['Designation']||'',dept:obj['Department']||'',
            doj:toISO(obj['Date of Joining (YYYY-MM-DD)'])||'',dol:toISO(obj['Date of Left (YYYY-MM-DD)'])||'',
            weeklyOff:obj['Weekly Off']||'Sunday',
            basic:Number(obj['Basic Salary'])||0,hra:Number(obj['HRA'])||0,conv:Number(obj['Conveyance'])||0,
            special:Number(obj['Special Allowance'])||0,gross:Number(obj['Gross CTC'])||0,
            pf:(obj['PF (Yes/No)']||'').toLowerCase()==='yes',
            pfNumber:obj['PF Number (UAN)']||'',
            esic:(obj['ESIC (Yes/No)']||'').toLowerCase()==='yes',
            esicNumber:obj['ESIC Number']||'',
            pt:(obj['Professional Tax (Yes/No)']||'').toLowerCase()==='yes',
            tds:(obj['TDS (Yes/No)']||'').toLowerCase()==='yes',
            pan:obj['PAN Card No']||'',aadhar:obj['Aadhaar No']||'',
            bankName:obj['Bank Name']||'',accountNo:obj['Account Number']||'',
            ifsc:obj['IFSC Code']||'',accountHolder:obj['Account Holder Name']||'',
            status:obj['Status (Active/Inactive)']||'Active',panFile:null,aadharFile:null
          };
        }).filter(r=>r.name);
        if(rows.length===0){setImportError('No valid rows found. Check that Full Name column is filled.');return;}
        setImportRows(rows);
      }catch(err){setImportError('Could not parse file. Please use the provided CSV template.');}
    };
    reader.readAsText(file);
    e.target.value='';
  };

  const confirmImport=()=>{
    setEmployees(prev=>{
      const existing=new Set(prev.map(e=>e.id));
      const newOnes=importRows.filter(r=>!existing.has(r.id));
      const updated=prev.map(e=>{const imp=importRows.find(r=>r.id===e.id);return imp?imp:e;});
      return[...updated,...newOnes];
    });
    setImportRows([]);setShowImportModal(false);
  };

  const handleDocUpload=(empId,docType,file)=>{
    setEmployees(prev=>prev.map(e=>e.id===empId?{...e,[docType]:file?file.name:null}:e));
  };

  const inactiveEmployees=employees.filter(e=>e.status==='Inactive');
  const filtered=sortByDesignation(employees.filter(e=>{
    if(e.status==='Inactive')return false; // Inactive employees live under the Inactive Employees sub tab
    const matchSearch=!search||e.name.toLowerCase().includes(search.toLowerCase())||e.id.toLowerCase().includes(search.toLowerCase())||e.desig.toLowerCase().includes(search.toLowerCase());
    const matchStatus=statusFilter==='All'||e.status===statusFilter;
    return matchSearch&&matchStatus;
  }));

  const WEEKLY_OFFS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const EMP_FILTER_COLS=[
    {key:'id',label:'Emp ID',get:e=>e.id},
    {key:'name',label:'Name & Dept',get:e=>e.name},
    {key:'desig',label:'Designation',get:e=>e.desig},
    {key:'doj',label:'DOJ',get:e=>e.doj?fmtDMY(e.doj):'(blank)'},
    {key:'dol',label:'DOL',get:e=>e.dol?fmtDMY(e.dol):'(blank)'},
    {key:'weeklyOff',label:'Weekly Off',get:e=>e.weeklyOff||'Sunday'},
    {key:'gross',label:'Gross CTC',get:e=>'₹'+(e.gross||0).toLocaleString('en-IN')},
    {key:'bankName',label:'Bank',get:e=>e.bankName||'(blank)'},
    {key:'pan',label:'PAN',get:e=>e.pan||'(blank)'},
    {key:'aadhar',label:'Aadhaar',get:e=>e.aadhar||'(blank)'},
    {key:'pf',label:'PF',get:e=>e.pf?'Yes':'No'},
    {key:'esic',label:'ESIC',get:e=>e.esic?'Yes':'No'},
    {key:'status',label:'Status',get:e=>e.status}
  ];
  const empFilters=useExcelColumnFilter(filtered,EMP_FILTER_COLS);
  const empWrapRef=useRef(null);
  const empCellRange=useExcelCellRange(empWrapRef);

  // TAB sections in Add/Edit modal
  const personalFields=()=>React.createElement('div',null,
    React.createElement('div',{className:'form-row cols4'},
      React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-14'},'Employee Id'),React.createElement('input',{id:'f-14',className:'form-control',value:form.id,onChange:fc('id'),placeholder:'Auto if blank'})),
      React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-15'},'Employee Id as per Billing Software'),React.createElement('input',{id:'f-15',className:'form-control',value:form.billingId,onChange:fc('billingId'),placeholder:'Billing software ID'})),
      React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-16'},'Full Name *'),React.createElement('input',{id:'f-16',className:'form-control',value:form.name,onChange:fc('name'),placeholder:'Full name'})),
      React.createElement('div',{className:'form-group'},React.createElement('label',null,"Father's Name"),React.createElement('input',{className:'form-control',value:form.fatherName,onChange:fc('fatherName'),placeholder:"Father's name"}))
    ),
    React.createElement('div',{className:'form-row cols3'},
      React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-17'},'Mobile No'),React.createElement('input',{id:'f-17',className:'form-control',value:form.mobile,onChange:fc('mobile'),placeholder:'98xxxxxxxx'}),form.mobile&&!isValidIndianMobile(form.mobile)&&fieldWarning('Doesn\u2019t look like a valid 10-digit Indian mobile number.')),
      React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-18'},'Email ID'),React.createElement('input',{id:'f-18',className:'form-control',value:form.email,onChange:fc('email'),placeholder:'email@example.com'}),form.email&&!isValidEmailFormat(form.email)&&fieldWarning('Doesn\u2019t look like a valid email address.')),
      React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-19'},'Status'),React.createElement('select',{id:'f-19',className:'form-control',value:form.status,onChange:fc('status')},['Active','Inactive','On Notice','Resigned'].map(s=>React.createElement('option',{key:s},s))))
    ),
    React.createElement('div',{className:'form-row'},
      React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-20'},'Address'),React.createElement('textarea',{id:'f-20',className:'form-control',rows:2,value:form.address,onChange:fc('address'),placeholder:'Full address with PIN code',style:{resize:'vertical'}}))
    ),
    React.createElement('div',{className:'form-row cols2'},
      React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-21'},'PAN Card No'),React.createElement('input',{id:'f-21',className:'form-control',value:form.pan,onChange:fc('pan'),placeholder:'ABCDE1234F',style:{textTransform:'uppercase'}}),form.pan&&!isValidPANFormat(form.pan)&&fieldWarning('Doesn\u2019t look like a valid PAN (e.g. AABCX1234R).')),
      React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-22'},'Aadhaar No'),React.createElement('input',{id:'f-22',className:'form-control',value:form.aadhar,onChange:fc('aadhar'),placeholder:'XXXX XXXX XXXX',inputMode:'numeric'}),form.aadhar&&!isValidAadhaar(form.aadhar)&&fieldWarning('Not a valid Aadhaar number (12 digits with a check digit) — re-check it.'))
    ),
    React.createElement('div',{className:'form-row cols2'},
      React.createElement('div',{className:'form-group'},
        React.createElement('label',null,'PAN Card (Upload Copy)'),
        React.createElement('div',{style:{background:'var(--bg3)',border:'1px dashed var(--border2)',borderRadius:'var(--r)',padding:'10px 14px',display:'flex',alignItems:'center',gap:10}},
          React.createElement('input',{type:'file',accept:'image/*,.pdf',style:{display:'none'},id:'pan-upload',onChange:e=>{const f=e.target.files[0];if(f)fvFile('panFile')(f);e.target.value='';}}),
          React.createElement('label',{htmlFor:'pan-upload',style:{cursor:'pointer',fontSize:12,color:'var(--accent)'}},form.panFile?'📎 '+(typeof form.panFile==='string'?form.panFile:form.panFile.name):'📎 Choose file (JPG/PDF)'),
          form.panFile&&typeof form.panFile!=='string'&&form.panFile.dataUrl&&React.createElement('span',{title:'Download',style:{fontSize:10,color:'var(--blue)',marginLeft:8,cursor:'pointer'},onClick:()=>downloadAttachment(form.panFile,'PAN')},'⬇'),
          form.panFile&&React.createElement('span',{style:{fontSize:10,color:'var(--text3)',marginLeft:'auto',cursor:'pointer'},onClick:()=>{if(confirm('Remove the attached PAN card copy?'))fv('panFile')(null);}},'✕ Remove')
        )
      ),
      React.createElement('div',{className:'form-group'},
        React.createElement('label',null,'Aadhaar Card (Upload Copy) *'),
        React.createElement('div',{style:{background:'var(--bg3)',border:'1px dashed var(--border2)',borderRadius:'var(--r)',padding:'10px 14px',display:'flex',alignItems:'center',gap:10}},
          React.createElement('input',{type:'file',accept:'image/*,.pdf',style:{display:'none'},id:'aadhar-upload',onChange:e=>{const f=e.target.files[0];if(f)fvFile('aadharFile')(f);e.target.value='';}}),
          React.createElement('label',{htmlFor:'aadhar-upload',style:{cursor:'pointer',fontSize:12,color:'var(--accent)'}},form.aadharFile?'📎 '+(typeof form.aadharFile==='string'?form.aadharFile:form.aadharFile.name):'📎 Choose file (JPG/PDF)'),
          form.aadharFile&&typeof form.aadharFile!=='string'&&form.aadharFile.dataUrl&&React.createElement('span',{title:'Download',style:{fontSize:10,color:'var(--blue)',marginLeft:8,cursor:'pointer'},onClick:()=>downloadAttachment(form.aadharFile,'Aadhaar')},'⬇'),
          form.aadharFile&&React.createElement('span',{style:{fontSize:10,color:'var(--text3)',marginLeft:'auto',cursor:'pointer'},onClick:()=>{if(confirm('Remove the attached Aadhaar card copy?'))fv('aadharFile')(null);}},'✕ Remove')
        )
      )
    )
  );

  // 12% of Basic Salary, capped at the statutory PF wage ceiling by default — check
  // "Calculate on actual Basic Salary" to remove the cap and use full Basic instead.
  const epfEmployerContribution=epfEmployerContributionFor(form.basic,form.pfOnActualBasic,salon&&salon.pfApplicable,form.pf);

  const employmentFields=()=>React.createElement('div',null,
    React.createElement('div',{className:'form-row cols3'},
      React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-23'},'Department *'),React.createElement('select',{id:'f-23',className:'form-control',value:form.dept,onChange:e=>{const newDept=e.target.value;const opts=DESIG_BY_DEPT[newDept]||[];setForm(p=>({...p,dept:newDept,desig:opts.includes(p.desig)?p.desig:(opts[0]||'')}));}},[React.createElement('option',{key:'',value:''},'Select Department'),...DEPARTMENTS.map(d=>React.createElement('option',{key:d},d))])),
      React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-24'},'Designation *'),React.createElement('select',{id:'f-24',className:'form-control',value:form.desig,onChange:fc('desig'),disabled:!form.dept},[React.createElement('option',{key:'',value:''},form.dept?'Select Designation':'Select Department first'),...(DESIG_BY_DEPT[form.dept]||[]).map(d=>React.createElement('option',{key:d},d))])),
      React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-25'},'Weekly Off'),React.createElement('select',{id:'f-25',className:'form-control',value:form.weeklyOff,onChange:fc('weeklyOff')},WEEKLY_OFFS.map(d=>React.createElement('option',{key:d},d))))
    ),
    React.createElement('div',{className:'form-row cols3'},
      React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-26'},'Date of Joining *'),React.createElement('input',{id:'f-26',type:'date',className:'form-control',value:form.doj,onChange:fc('doj')}),form.doj&&React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:3}},'→ '+fmtDMY(form.doj)+' (DD/MM/YYYY)')),
      React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-27'},'Date of Left'),React.createElement('input',{id:'f-27',type:'date',className:'form-control',value:form.dol,onChange:fc('dol')}),form.dol&&React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:3}},'→ '+fmtDMY(form.dol)+' (DD/MM/YYYY)')),
      React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-28'},'Status'),React.createElement('select',{id:'f-28',className:'form-control',value:form.status,onChange:fc('status')},['Active','Inactive','On Notice','Resigned'].map(s=>React.createElement('option',{key:s},s))))
    ),
    React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:14,marginBottom:14}},
      React.createElement('div',{style:{fontSize:12,fontWeight:600,color:'var(--text2)',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}},'Salary Components (₹/month)'),
      React.createElement('div',{className:'form-row cols3'},
        React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-29'},'Basic Salary'),React.createElement('input',{id:'f-29',className:'form-control',type:'number',value:form.basic,onChange:fc('basic'),placeholder:'0'})),
        React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-30'},'HRA'),React.createElement('input',{id:'f-30',className:'form-control',type:'number',value:form.hra,onChange:fc('hra'),placeholder:'0'})),
        React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-31'},'Conveyance'),React.createElement('input',{id:'f-31',className:'form-control',type:'number',value:form.conv,onChange:fc('conv'),placeholder:'0'}))
      ),
      React.createElement('div',{className:(salon&&salon.pfApplicable&&form.pf)?'form-row cols3':'form-row cols2'},
        React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-32'},'Special Allowance'),React.createElement('input',{id:'f-32',className:'form-control',type:'number',value:form.special,onChange:fc('special'),placeholder:'0'})),
        (salon&&salon.pfApplicable&&form.pf)&&React.createElement('div',{className:'form-group'},
          React.createElement('label',null,'EPF Employer Contribution'),
          React.createElement('input',{className:'form-control',type:'number',value:epfEmployerContribution||'',readOnly:true,disabled:true,style:{color:'var(--text3)',cursor:'not-allowed'},placeholder:'Auto-calculated'}),
          React.createElement('div',{style:{fontSize:10,color:'var(--text3)',marginTop:3}},'12% of '+(form.pfOnActualBasic?'actual Basic Salary':pfCeilingLabel()+' (statutory PF wage ceiling)')+' — included in Gross CTC'),
          React.createElement('label',{style:{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--text2)',cursor:'pointer',marginTop:6}},
            React.createElement('input',{type:'checkbox',checked:!!form.pfOnActualBasic,onChange:fc('pfOnActualBasic')}),'Calculate on actual Basic Salary (ignore the '+pfCeilingLabel()+' ceiling)'
          )
        ),
        React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-33'},'Gross CTC (auto-sum)'),React.createElement('input',{id:'f-33',className:'form-control',type:'number',readOnly:true,disabled:true,style:{color:'var(--text3)',cursor:'not-allowed'},value:(Number(form.basic)||0)+(Number(form.hra)||0)+(Number(form.conv)||0)+(Number(form.special)||0)+epfEmployerContribution,placeholder:'Auto-calculated'}),React.createElement('div',{style:{fontSize:10,color:'var(--text3)',marginTop:3}},'Basic + HRA + Conveyance + Special'+(epfEmployerContribution?' + EPF Employer Contribution':''))),
      ),
      (salon&&(salon.pfApplicable||salon.esicApplicable||salon.ptApplicable||salon.tdsApplicable))&&React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:14}},
        React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}},'Statutory Applicability — for this employee'),
        React.createElement('div',{style:{display:'flex',gap:20,flexWrap:'wrap',marginBottom:8}},
          salon.pfApplicable&&React.createElement('label',{style:{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--text2)',cursor:'pointer'}},
            React.createElement('input',{type:'checkbox',checked:form.pf,onChange:fc('pf')}),'PF'
          ),
          salon.esicApplicable&&React.createElement('label',{style:{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--text2)',cursor:'pointer'}},
            React.createElement('input',{type:'checkbox',checked:form.esic,onChange:fc('esic')}),'ESIC'
          ),
          salon.ptApplicable&&React.createElement('label',{style:{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--text2)'}},
            React.createElement('input',{type:'checkbox',checked:true,disabled:true,style:{cursor:'not-allowed'}}),'Professional Tax (auto-applied — '+(salon.state||'this outlet\'s state')+')'
          ),
          salon.tdsApplicable&&React.createElement('label',{style:{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--text2)',cursor:'pointer'}},
            React.createElement('input',{type:'checkbox',checked:form.tds,onChange:fc('tds')}),'TDS'
          )
        ),
        ((salon.pfApplicable&&form.pf)||(salon.esicApplicable&&form.esic))
          ?React.createElement('div',{className:'form-row cols2'},
              (salon.pfApplicable&&form.pf)?React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-34'},'PF Number (UAN)'),React.createElement('input',{id:'f-34',className:'form-control',value:form.pfNumber,onChange:fc('pfNumber'),placeholder:'e.g. 100123456789',inputMode:'numeric'}),form.pfNumber&&!isValidUAN(form.pfNumber)&&fieldWarning('UAN must be 12 digits.')):React.createElement('div',null),
              (salon.esicApplicable&&form.esic)?React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-35'},'ESIC Number'),React.createElement('input',{id:'f-35',className:'form-control',value:form.esicNumber,onChange:fc('esicNumber'),placeholder:'e.g. 3412345678',inputMode:'numeric'}),form.esicNumber&&!isValidESICNo(form.esicNumber)&&fieldWarning('ESIC number must be 10 (or 17) digits.')):React.createElement('div',null)
            )
          :null
      )
    )
  );

  const bankFields=()=>React.createElement('div',null,
    React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:14,marginBottom:14}},
      React.createElement('div',{style:{fontSize:12,fontWeight:600,color:'var(--text2)',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}},'Bank Account Details'),
      React.createElement('div',{className:'form-row cols2'},
        React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-36'},'Bank Name'),React.createElement(BankNameField,{id:'f-36',value:form.bankName,ifsc:form.ifsc,onChange:v=>setForm(f=>({...f,bankName:v}))})),
        React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-37'},'Account Holder Name'),React.createElement('input',{id:'f-37',className:'form-control',value:form.accountHolder,onChange:fc('accountHolder'),placeholder:'As per bank records'}))
      ),
      React.createElement('div',{className:'form-row cols2'},
        React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-38'},'Account Number'),React.createElement('input',{id:'f-38',className:'form-control',value:form.accountNo,onChange:fc('accountNo'),placeholder:'Account number',inputMode:'numeric'}),form.accountNo&&!isValidBankAccountNo(form.accountNo)&&fieldWarning('Account number must be 9 to 18 digits.')),
        React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-39'},'IFSC Code'),React.createElement('input',{id:'f-39',className:'form-control',value:form.ifsc,onChange:fc('ifsc'),placeholder:'e.g. HDFC0001234',style:{textTransform:'uppercase'}}),form.ifsc&&!isValidIfscFormat(form.ifsc)&&fieldWarning('Doesn\u2019t look like a valid IFSC (e.g. HDFC0001234).'))
      ),
      React.createElement('div',{className:'form-row'},
        React.createElement('div',{className:'form-group'},
          React.createElement('label',null,'Bank Cancelled Cheque / Passbook (Upload Copy)'),
          React.createElement('div',{style:{background:'var(--bg3)',border:'1px dashed var(--border2)',borderRadius:'var(--r)',padding:'10px 14px',display:'flex',alignItems:'center',gap:10}},
            React.createElement('input',{type:'file',accept:'image/*,.pdf',style:{display:'none'},id:'bank-proof-upload',onChange:e=>{const f=e.target.files[0];if(f)fvFile('bankProofFile')(f);e.target.value='';}}),
            React.createElement('label',{htmlFor:'bank-proof-upload',style:{cursor:'pointer',fontSize:12,color:'var(--accent)'}},form.bankProofFile?'📎 '+(typeof form.bankProofFile==='string'?form.bankProofFile:form.bankProofFile.name):'📎 Choose file (JPG/PDF)'),
            form.bankProofFile&&typeof form.bankProofFile!=='string'&&form.bankProofFile.dataUrl&&React.createElement('span',{title:'Download',style:{fontSize:10,color:'var(--blue)',marginLeft:8,cursor:'pointer'},onClick:()=>downloadAttachment(form.bankProofFile,'Bank Proof')},'⬇'),
            form.bankProofFile&&React.createElement('span',{style:{fontSize:10,color:'var(--text3)',marginLeft:'auto',cursor:'pointer'},onClick:()=>{if(confirm('Remove the attached bank proof (cancelled cheque/passbook)?'))fv('bankProofFile')(null);}},'✕ Remove')
          )
        )
      )
    )
  );

  const MODAL_TABS=[{id:'personal',label:'👤 Personal'},{id:'employment',label:'💼 Employment & Salary'},{id:'bank',label:'🏦 Bank Details'}];

  return React.createElement('div',{className:'fade-in'},
    React.createElement(ExitChecklistCard,{sid:salon?.id}),
    React.createElement(StaffCertsCard,{sid:salon?.id}),
    // ── Header ──
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,React.createElement('div',{className:'page-title'},'Master Salary Sheet'),React.createElement('div',{className:'page-sub'},'Employee roster with CTC, bank & document details'+(salon?.name?' · '+salon.name:''))),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:downloadTemplate},'⬇ Template'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>{setImportRows([]);setImportError('');setShowImportModal(true);}},'⬆ Import'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},onClick:()=>exportToExcel(filtered)},'⬇ Export Excel'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)',borderColor:'rgba(255,107,107,0.4)'},onClick:()=>exportToPDF(filtered)},'⬇ Export PDF'),
        React.createElement('button',{className:'btn btn-primary btn-sm',onClick:()=>{setForm(BLANK);setEditMode(false);setActiveTab('personal');setShowAddModal(true);}},'+ Add Employee')
      )
    ),
    exportMsg&&React.createElement('div',{style:{background:'rgba(76,175,125,0.12)',border:'1px solid rgba(76,175,125,0.3)',borderRadius:'var(--r)',padding:'8px 14px',marginBottom:12,fontSize:12,color:'var(--green)',display:'flex',alignItems:'center',gap:8}},exportMsg),

    // ── Sub tabs: Employees | Inactive Employees ──
    React.createElement('div',{className:'tab-bar',style:{marginBottom:16}},
      [{id:'active',label:'Employees ('+(employees.length-inactiveEmployees.length)+')'},{id:'inactive',label:'Inactive Employees ('+inactiveEmployees.length+')'}].map(t=>
        React.createElement('button',{key:t.id,className:`tab-btn ${empView===t.id?'active':''}`,onClick:()=>setEmpView(t.id)},t.label)
      )
    ),

    // ── Inactive Employees view ──
    empView==='inactive'&&React.createElement('div',null,
      React.createElement('div',{className:'card',style:{marginBottom:16}},
        React.createElement('label',{style:{display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontSize:13,color:'var(--text)'}},
          React.createElement('input',{type:'checkbox',checked:showInactive,onChange:e=>setShowInactive(e.target.checked)}),
          'Show inactive employees'
        ),
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:6}},'Employees marked as Inactive are moved here automatically and hidden from the main roster. Tick the box to view the list.')
      ),
      showInactive?React.createElement('div',{className:'card'},
        inactiveEmployees.length===0
          ?React.createElement('div',{style:{textAlign:'center',padding:32,color:'var(--text3)'}},'No inactive employees.')
          :React.createElement('div',{className:'table-wrap'},
            React.createElement('table',null,
              React.createElement('thead',null,React.createElement('tr',null,['Emp ID','Name & Dept','Designation','DOJ','DOL','Gross CTC','Status','Actions'].map(h=>React.createElement('th',{key:h},h)))),
              React.createElement('tbody',null,inactiveEmployees.map(e=>React.createElement('tr',{key:e.id},
                React.createElement('td',null,React.createElement('span',{style:{fontFamily:'monospace',fontSize:11,color:'var(--accent)'}},e.id)),
                React.createElement('td',null,
                  React.createElement('div',{style:{fontWeight:500,color:'var(--text)',whiteSpace:'nowrap'}},e.name),
                  React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},e.dept||'—')
                ),
                React.createElement('td',null,e.desig),
                React.createElement('td',null,fmtDMY(e.doj)),
                React.createElement('td',null,e.dol?React.createElement('span',{style:{color:'var(--red)'}},e.dol):'—'),
                React.createElement('td',null,'₹'+(e.gross||0).toLocaleString('en-IN')),
                React.createElement('td',null,React.createElement('span',{className:'badge badge-gray'},e.status)),
                React.createElement('td',null,React.createElement('div',{style:{display:'flex',gap:4}},
                  React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>openView(e)},'View'),
                  React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>openEdit(e)},'Edit'),
                  React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)'},onClick:()=>setEmployees(prev=>prev.map(x=>x.id===e.id?{...x,status:'Active'}:x))},'↩ Reactivate'),
                  React.createElement('button',{'aria-label':'Delete',className:'btn btn-sm',style:{background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.3)',color:'var(--red)',padding:'4px 8px',borderRadius:'var(--r)',cursor:'pointer',fontSize:11},onClick:()=>openDelete(e)},React.createElement(IconTrash,{size:14}))
                ))
              )))
            )
          )
      ):React.createElement('div',{className:'card',style:{textAlign:'center',padding:28,color:'var(--text3)',fontSize:12}},
        inactiveEmployees.length+' inactive employee'+(inactiveEmployees.length===1?'':'s')+' hidden — tick \u201cShow inactive employees\u201d above to view.'
      )
    ),

    // ── Filters ──
    empView==='active'&&React.createElement('div',{style:{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}},
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'6px 12px',flex:1,minWidth:200}},
        React.createElement('span',{style:{color:'var(--text3)'}},React.createElement(IconSearch,{size:13})),
        React.createElement('input',{style:{background:'none',border:'none',outline:'none',color:'var(--text)',fontFamily:'var(--font)',fontSize:13,flex:1},placeholder:'Search by name, ID, designation…',value:search,onChange:e=>setSearch(e.target.value)})
      ),
      React.createElement('select',{className:'form-control',style:{width:'auto'},value:statusFilter,onChange:e=>setStatusFilter(e.target.value)},
        ['All','Active','On Notice','Resigned'].map(s=>React.createElement('option',{key:s},s))
      ),
      React.createElement('div',{style:{fontSize:12,color:'var(--text3)',alignSelf:'center'}},`${filtered.length} of ${employees.length} employees`)
    ),

    // ── Summary Metrics ──
    empView==='active'&&React.createElement('div',{className:'grid4',style:{marginBottom:16}},
      [{label:'Total Employees',val:employees.length,color:'blue'},{label:'Active',val:employees.filter(e=>e.status==='Active').length,color:'green'},{label:'Total Gross CTC',val:'₹'+employees.reduce((s,e)=>s+Number(e.gross||0),0).toLocaleString('en-IN'),color:'amber'},{label:'On PF',val:employees.filter(e=>e.pf).length,color:'purple'}].map(m=>
        React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},React.createElement('div',{className:'metric-label'},m.label),React.createElement('div',{className:'metric-value'},m.val))
      )
    ),

    // ── Bulk action toolbar — appears only once at least one row is selected. ──
    empView==='active'&&bulkSelectedIds.size>0&&React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:'10px 14px',background:'rgba(47,95,224,0.08)',border:'1px solid rgba(47,95,224,0.3)',borderRadius:'var(--r)',marginBottom:14}},
      React.createElement('span',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},bulkSelectedIds.size+' selected'),
      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>bulkSetStatus('Active')},'Mark Active'),
      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>bulkSetStatus('Inactive')},'Mark Inactive'),
      React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.3)',color:'var(--red)',padding:'5px 12px',borderRadius:'var(--r)',cursor:'pointer',fontSize:12,fontWeight:500},onClick:()=>setShowBulkDeleteConfirm(true)},'🗑 Delete Selected'),
      React.createElement('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:'auto'},onClick:()=>setBulkSelectedIds(new Set())},'Clear selection')
    ),

    // ── Table ──
    empView==='active'&&React.createElement('div',{className:'card'},
      React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:8}},'Click a cell — or drag across several — then Ctrl/Cmd+C to copy, just like Excel.'),
      React.createElement('div',{className:'table-wrap',ref:empWrapRef},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,
            React.createElement('th',{key:'bulk-check',style:{width:32}},
              empFilters.filteredRows.length>0&&React.createElement('input',{type:'checkbox',
                checked:empFilters.filteredRows.every(e=>bulkSelectedIds.has(e.id)),
                onChange:e=>setBulkSelectedIds(e.target.checked?new Set(empFilters.filteredRows.map(r=>r.id)):new Set())})),
            ...EMP_FILTER_COLS.map(col=>empFilters.TH(col)),
            React.createElement('th',{key:'actions'},'Actions')
          )),
          empFilters.filteredRows.length===0
            ? React.createElement('tbody',null,React.createElement('tr',null,React.createElement('td',{colSpan:14,style:{textAlign:'center',padding:32,color:'var(--text3)'}},'No employees found. Add one or import from CSV.')))
            : React.createElement('tbody',null,empFilters.filteredRows.map((e,ri)=>{
              const sel=(c)=>empCellRange.isSelected(ri,c)?'rgba(47,95,224,0.12)':undefined;
              return React.createElement('tr',{key:e.id},
                React.createElement('td',null,React.createElement('input',{type:'checkbox',checked:bulkSelectedIds.has(e.id),onChange:()=>toggleBulkSelect(e.id)})),
                React.createElement('td',{'data-xr':ri,'data-xc':0,style:{background:sel(0)}},React.createElement('span',{style:{fontFamily:'monospace',fontSize:11,color:'var(--accent)'}},e.id)),
                React.createElement('td',{'data-xr':ri,'data-xc':1,style:{background:sel(1)}},
                  React.createElement('div',{style:{fontWeight:500,color:'var(--text)',whiteSpace:'nowrap'}},e.name),
                  React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},e.dept||'—'),
                  e.mobile&&React.createElement('div',{style:{fontSize:10,color:'var(--text3)'}},e.mobile)
                ),
                React.createElement('td',{'data-xr':ri,'data-xc':2,style:{background:sel(2)}},React.createElement('span',{style:{whiteSpace:'nowrap'}},e.desig)),
                React.createElement('td',{'data-xr':ri,'data-xc':3,style:{background:sel(3)}},React.createElement('span',{style:{whiteSpace:'nowrap',fontSize:12}},fmtDMY(e.doj))),
                React.createElement('td',{'data-xr':ri,'data-xc':4,style:{background:sel(4)}},e.dol?React.createElement('span',{style:{whiteSpace:'nowrap',fontSize:12,color:'var(--red)'}},e.dol):'—'),
                React.createElement('td',{'data-xr':ri,'data-xc':5,style:{background:sel(5)}},React.createElement('span',{className:'badge badge-blue',style:{whiteSpace:'nowrap'}},e.weeklyOff||'Sunday')),
                React.createElement('td',{'data-xr':ri,'data-xc':6,style:{background:sel(6)}},React.createElement('span',{style:{fontWeight:600,color:'var(--text)',whiteSpace:'nowrap'}},'₹'+(e.gross||0).toLocaleString('en-IN'))),
                React.createElement('td',{'data-xr':ri,'data-xc':7,style:{background:sel(7)}},
                  e.bankName?React.createElement('div',null,
                    React.createElement('div',{style:{fontSize:12,color:'var(--text)',whiteSpace:'nowrap'}},e.bankName),
                    React.createElement('div',{style:{fontSize:10,color:'var(--text3)',fontFamily:'monospace'}},e.accountNo?'••••'+String(e.accountNo).slice(-4):'—')
                  ):'—'
                ),
                React.createElement('td',{'data-xr':ri,'data-xc':8,style:{background:sel(8)}},
                  React.createElement('div',{style:{fontSize:11,fontFamily:'monospace',color:'var(--text2)'}},e.pan||'—'),
                  e.panFile&&React.createElement('span',{style:{fontSize:10,color:'var(--green)',cursor:typeof e.panFile!=='string'&&e.panFile.dataUrl?'pointer':undefined},title:typeof e.panFile!=='string'&&e.panFile.dataUrl?'Click to download':undefined,onClick:()=>downloadAttachment(e.panFile,'PAN')},'📎 Attached')
                ),
                React.createElement('td',{'data-xr':ri,'data-xc':9,style:{background:sel(9)}},
                  React.createElement('div',{style:{fontSize:11,fontFamily:'monospace',color:'var(--text2)'}},e.aadhar||'—'),
                  e.aadharFile&&React.createElement('span',{style:{fontSize:10,color:'var(--green)',cursor:typeof e.aadharFile!=='string'&&e.aadharFile.dataUrl?'pointer':undefined},title:typeof e.aadharFile!=='string'&&e.aadharFile.dataUrl?'Click to download':undefined,onClick:()=>downloadAttachment(e.aadharFile,'Aadhaar')},'📎 Attached')
                ),
                React.createElement('td',{'data-xr':ri,'data-xc':10,style:{background:sel(10)}},React.createElement('span',{className:`badge ${e.pf?'badge-green':'badge-gray'}`},e.pf?'Yes':'No')),
                React.createElement('td',{'data-xr':ri,'data-xc':11,style:{background:sel(11)}},React.createElement('span',{className:`badge ${e.esic?'badge-blue':'badge-gray'}`},e.esic?'Yes':'No')),
                React.createElement('td',{'data-xr':ri,'data-xc':12,style:{background:sel(12)}},React.createElement('span',{className:`badge ${e.status==='Active'?'badge-green':e.status==='Resigned'?'badge-red':e.status==='On Notice'?'badge-amber':'badge-gray'}`},e.status)),
                React.createElement('td',null,
                  React.createElement('div',{style:{display:'flex',gap:4}},
                    React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>openView(e)},'View'),
                    React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>openEdit(e)},'Edit'),
                    React.createElement('button',{'aria-label':'Delete',className:'btn btn-sm',style:{background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.3)',color:'var(--red)',padding:'4px 8px',borderRadius:'var(--r)',cursor:'pointer',fontSize:11,fontWeight:500},onClick:()=>openDelete(e)},React.createElement(IconTrash,{size:14}))
                  )
                )
              );
            }))
        )
      ),
      empFilters.Portal(),
      empCellRange.Toolbar()
    ),

    // ── ADD / EDIT MODAL ──
    showAddModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowAddModal(false)},
      React.createElement('div',{className:'modal',style:{width:680},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},editMode?`Edit Employee — ${form.name}`:'Add New Employee'),
        React.createElement('div',{className:'tab-bar',style:{marginBottom:16}},
          MODAL_TABS.map(t=>React.createElement('button',{key:t.id,className:`tab-btn ${activeTab===t.id?'active':''}`,onClick:()=>setActiveTab(t.id)},t.label))
        ),
        activeTab==='personal'&&personalFields(),
        activeTab==='employment'&&employmentFields(),
        activeTab==='bank'&&bankFields(),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowAddModal(false)},'Cancel'),
          activeTab!=='personal'&&React.createElement('button',{className:'btn btn-ghost',onClick:()=>setActiveTab(activeTab==='bank'?'employment':'personal')},'← Back'),
          activeTab!=='bank'&&React.createElement('button',{className:'btn btn-primary',onClick:()=>setActiveTab(activeTab==='personal'?'employment':'bank')},'Next →'),
          activeTab==='bank'&&React.createElement('button',{className:'btn btn-primary',onClick:saveEmployee},editMode?'💾 Save Changes':'✓ Add Employee')
        )
      )
    ),

    // ── VIEW DETAIL MODAL ──
    showViewModal&&viewEmp&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowViewModal(false)},
      React.createElement('div',{className:'modal',style:{width:680},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title',style:{display:'flex',alignItems:'center',gap:12}},
          React.createElement('div',{style:{width:44,height:44,borderRadius:'50%',background:'linear-gradient(135deg,var(--accent-fill,var(--accent)),var(--purple))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700,color:'#fff',flexShrink:0}},viewEmp.name.slice(0,2).toUpperCase()),
          React.createElement('div',null,
            React.createElement('div',null,viewEmp.name),
            React.createElement('div',{style:{fontSize:12,color:'var(--text3)',fontFamily:'var(--font)',fontWeight:400}},viewEmp.id+' · '+viewEmp.desig)
          ),
          React.createElement('span',{className:`badge ${viewEmp.status==='Active'?'badge-green':viewEmp.status==='Resigned'?'badge-red':'badge-amber'}`,style:{marginLeft:'auto'}},viewEmp.status)
        ),
        React.createElement('div',{className:'grid2',style:{gap:12}},
          // Personal
          React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:14}},
            React.createElement('div',{style:{fontSize:11,fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}},'Personal Info'),
            [["Billing Software ID",viewEmp.billingId||'—'],["Father's Name",viewEmp.fatherName],['Mobile',viewEmp.mobile],['Email',viewEmp.email],['Address',viewEmp.address],['PAN',viewEmp.pan||'—'],['Aadhaar',viewEmp.aadhar||'—']].map(([k,v])=>
              React.createElement('div',{key:k,className:'stat-row'},React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},k),React.createElement('span',{style:{fontSize:12,color:'var(--text)',maxWidth:200,textAlign:'right'}},v||'—'))
            ),
            React.createElement('div',{style:{marginTop:8,display:'flex',gap:8}},
              viewEmp.panFile&&React.createElement('span',{style:{fontSize:11,color:'var(--green)',cursor:typeof viewEmp.panFile!=='string'&&viewEmp.panFile.dataUrl?'pointer':undefined},title:typeof viewEmp.panFile!=='string'&&viewEmp.panFile.dataUrl?'Click to download':undefined,onClick:()=>downloadAttachment(viewEmp.panFile,'PAN')},'📎 PAN Attached'),
              viewEmp.aadharFile&&React.createElement('span',{style:{fontSize:11,color:'var(--green)',cursor:typeof viewEmp.aadharFile!=='string'&&viewEmp.aadharFile.dataUrl?'pointer':undefined},title:typeof viewEmp.aadharFile!=='string'&&viewEmp.aadharFile.dataUrl?'Click to download':undefined,onClick:()=>downloadAttachment(viewEmp.aadharFile,'Aadhaar')},'📎 Aadhaar Attached')
            )
          ),
          // Employment
          React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:14}},
            React.createElement('div',{style:{fontSize:11,fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}},'Employment'),
            [['Dept',viewEmp.dept],['DOJ',fmtDMY(viewEmp.doj)],['DOL',viewEmp.dol?fmtDMY(viewEmp.dol):'—'],['Weekly Off',viewEmp.weeklyOff||'Sunday'],['Gross CTC','₹'+(viewEmp.gross||0).toLocaleString('en-IN')],['Basic','₹'+(viewEmp.basic||0).toLocaleString('en-IN')],['PF',viewEmp.pf?'Yes':'No'],['ESIC',viewEmp.esic?'Yes':'No']].map(([k,v])=>
              React.createElement('div',{key:k,className:'stat-row'},React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},k),React.createElement('span',{style:{fontSize:12,color:'var(--text)'}},v||'—'))
            )
          )
        ),
        // Bank
        React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:14,marginTop:12}},
          React.createElement('div',{style:{fontSize:11,fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}},'Bank Details'),
          React.createElement('div',{className:'grid2'},
            [['Bank',viewEmp.bankName],['Account Holder',viewEmp.accountHolder],['Account No',viewEmp.accountNo],['IFSC',viewEmp.ifsc]].map(([k,v])=>
              React.createElement('div',{key:k,className:'stat-row'},React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},k),React.createElement('span',{style:{fontSize:12,color:'var(--text)',fontFamily:k==='Account No'||k==='IFSC'?'monospace':'inherit'}},v||'—'))
            )
          )
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowViewModal(false)},'Close'),
          React.createElement('button',{className:'btn btn-primary',onClick:()=>{setShowViewModal(false);openEdit(viewEmp);}},'✏ Edit Employee')
        )
      )
    ),

    // ── IMPORT MODAL ──
    showImportModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowImportModal(false)},
      React.createElement('div',{className:'modal',style:{width:640},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'⬆ Import Employees from CSV'),
        React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:14,marginBottom:16}},
          React.createElement('div',{style:{fontSize:13,color:'var(--text)',marginBottom:8,fontWeight:500}},'Instructions'),
          React.createElement('div',{style:{fontSize:12,color:'var(--text2)',lineHeight:1.8}},
            '1. First, download the CSV template using the ⬇ Download Template button.',React.createElement('br'),
            '2. Fill in employee data in the template (do not change column headers).',React.createElement('br'),
            '3. Save as CSV and upload here. Existing employees with same Emp ID will be updated.',React.createElement('br'),
            '4. For PAN/Aadhaar document copies, use the Edit Employee option after import.'
          )
        ),
        React.createElement('div',{style:{display:'flex',gap:10,marginBottom:16}},
          React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:downloadTemplate},'⬇ Download CSV Template first'),
        ),
        React.createElement('div',{style:{border:'2px dashed var(--border2)',borderRadius:'var(--r)',padding:24,textAlign:'center',marginBottom:16,cursor:'pointer'},
          onClick:()=>document.getElementById('csv-upload').click()},
          React.createElement('input',{type:'file',id:'csv-upload',accept:'.csv,.xlsx,.xls',style:{display:'none'},onChange:handleFileImport}),
          React.createElement('div',{style:{fontSize:24,marginBottom:8}},'📂'),
          React.createElement('div',{style:{fontSize:13,color:'var(--text2)'}},'Click to select CSV file'),
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:4}},'Supports .csv format')
        ),
        importError&&React.createElement('div',{style:{background:'rgba(255,107,107,0.1)',border:'1px solid var(--red)',borderRadius:'var(--r)',padding:10,marginBottom:12,fontSize:12,color:'var(--red)'}},importError),
        importRows.length>0&&React.createElement('div',null,
          React.createElement('div',{style:{fontSize:13,color:'var(--green)',marginBottom:8,fontWeight:500}},`✓ ${importRows.length} employee records ready to import`),
          React.createElement('div',{className:'table-wrap',style:{maxHeight:200,overflowY:'auto',border:'1px solid var(--border)',borderRadius:'var(--r)'}},
            React.createElement('table',null,
              React.createElement('thead',null,React.createElement('tr',null,['Emp ID','Name','Designation','Dept','Gross CTC','Status'].map(h=>React.createElement('th',{key:h},h)))),
              React.createElement('tbody',null,importRows.map((r,i)=>
                React.createElement('tr',{key:i},
                  React.createElement('td',null,r.id),React.createElement('td',null,r.name),
                  React.createElement('td',null,r.desig),React.createElement('td',null,r.dept),
                  React.createElement('td',null,'₹'+(r.gross||0).toLocaleString('en-IN')),
                  React.createElement('td',null,React.createElement('span',{className:`badge ${r.status==='Active'?'badge-green':'badge-gray'}`},r.status))
                )
              ))
            )
          )
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowImportModal(false)},'Cancel'),
          importRows.length>0&&React.createElement('button',{className:'btn btn-primary',onClick:confirmImport},`Import ${importRows.length} Employees`)
        )
      )
    ),

    // ── DELETE CONFIRM MODAL ──
    showDeleteModal&&deleteTarget&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowDeleteModal(false)},
      React.createElement('div',{className:'modal',style:{width:440},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title',style:{color:'var(--red)'}},'🗑 Delete Employee'),
        React.createElement('div',{style:{background:'rgba(255,107,107,0.08)',border:'1px solid rgba(255,107,107,0.25)',borderRadius:'var(--r)',padding:16,marginBottom:16}},
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:12,marginBottom:10}},
            React.createElement('div',{style:{width:40,height:40,borderRadius:'50%',background:'linear-gradient(135deg,var(--red),var(--orange))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'#fff',flexShrink:0}},deleteTarget.name.slice(0,2).toUpperCase()),
            React.createElement('div',null,
              React.createElement('div',{style:{fontWeight:600,color:'var(--text)',fontSize:14}},deleteTarget.name),
              React.createElement('div',{style:{fontSize:12,color:'var(--text3)'}},deleteTarget.id+' · '+deleteTarget.desig)
            )
          ),
          React.createElement('div',{style:{fontSize:13,color:'var(--text2)',lineHeight:1.7}},
            'Are you sure you want to permanently delete this employee record? ',
            React.createElement('span',{style:{color:'var(--red)',fontWeight:500}},'This action cannot be undone.'),
            ' All associated salary, attendance, and incentive data linked to this employee will be affected.'
          )
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowDeleteModal(false)},'Cancel — Keep Employee'),
          React.createElement('button',{className:'btn btn-danger',onClick:confirmDelete},'Yes, Delete Permanently')
        )
      )
    ),

    // ── BULK DELETE CONFIRM MODAL ──
    showBulkDeleteConfirm&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowBulkDeleteConfirm(false)},
      React.createElement('div',{className:'modal',style:{width:440},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title',style:{color:'var(--red)'}},'🗑 Delete '+bulkSelectedIds.size+' Employee'+(bulkSelectedIds.size===1?'':'s')),
        React.createElement('div',{style:{fontSize:13,color:'var(--text2)',lineHeight:1.7,marginBottom:16}},
          'Delete the '+bulkSelectedIds.size+' selected employee'+(bulkSelectedIds.size===1?'':'s')+'? ',
          React.createElement('span',{style:{color:'var(--red)',fontWeight:500}},'Associated salary, attendance, and incentive data linked to them will be affected.'),
          ' You\'ll get a few seconds to Undo right after.'
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowBulkDeleteConfirm(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-danger',onClick:()=>{bulkDelete();setShowBulkDeleteConfirm(false);}},'Yes, Delete '+bulkSelectedIds.size)
        )
      )
    )
  );
}

// ── Daily Sales & Exp row list — hoisted to module scope so the P&L (Monthly) statement can
// aggregate real entries by group without duplicating this list. Each of these groups maps
// directly to a P&L expense line; the blank placeholder rows have been given names for expense
// types that needed somewhere to be entered (Electricity, DG Rent, Royalty, Staff Room Rent,
// Professional Fee, Maintenance, Bank Charges, Purchase of Cosmetic). ──
const EXPENSE_ROWS=[
  {name:'Pentry Expenses',group:'Daily Expenses'},
  {name:'Water Expenses',group:'Daily Expenses'},
  {name:'Conveyance Expenses',group:'Daily Expenses'},
  {name:'Stationary',group:'Daily Expenses'},
  {name:'Pooja Expenses',group:'Daily Expenses'},
  {name:'Festival/Event Celebration Expenses',group:'Daily Expenses'},
  {name:'Donation',group:'Daily Expenses'},
  {name:'Staff Refreshment',group:'Daily Expenses'},
  {name:'Diesel Expenses',group:'Diesel Expenses'},
  {name:'Membership Commission/Incentives',group:'M.Ship Pro. And Daily Incentive',biz:'salon'},
  {name:'Product Commission/Incentives',group:'M.Ship Pro. And Daily Incentive',biz:'salon'},
  {name:'Service Commission/Incentives',group:'M.Ship Pro. And Daily Incentive'},
  {name:'Target Commission/Incentives',group:'M.Ship Pro. And Daily Incentive'},
  {name:'Advance To Employees',group:'Salary Payable'},
  {name:'Previous Month Salary',group:'Salary Payable'},
  {name:'Previous Month Incentive',group:'Salary Payable'},
  {name:'Tip To Employee',group:'Tip To Employee'},
  {name:'Penalties',group:'Penalty'},
  {name:'Staff Over Time',group:'Daily Expenses'},
  {name:'Repair & Maintenance',group:'Repair & Maintenance Expenses'},
  {name:'Telephone & Internet Expenses',group:'Telephone & Internet Expenses'},
  {name:'Electric Work',group:'Repair & Maintenance Expenses'},
  {name:'Drycleaning Expenses',group:'Drycleaning Expenses'},
  {name:'Rent',group:'Rent'},
  {name:'Accessories',group:'Repair & Maintenance Expenses'},
  {name:'Tanker Cleaning',group:'Tanker Cleaning'},
  {name:'Miscellaneous Expenses',group:'Daily Expenses'},
  {name:'Cleaning Supplies',group:'Daily Expenses'},
  {name:'Marketing Expenses',group:'Marketing Expenses'},
  {name:'Uniform Expenses',group:'Uniform Expenses'},
  {name:'Cosmetics & Stock Local',group:'Unregistered Purchase',biz:'salon'},
  {name:'Store Items',group:'Unregistered Purchase',biz:'salon'},
  {name:'Client Food',group:'Daily Expenses',biz:'salon'},
  {name:'Electricity Expenses',group:'Electricity Expenses'},
  {name:'DG Rent',group:'DG Rent'},
  {name:'Royalty',group:'Royalty'},
  {name:'Staff Room Rent',group:'Staff Room Rent'},
  {name:'Professional Fee',group:'Professional Fee'},
  {name:'Maintenance Expenses',group:'Maintenance Expenses'},
  {name:'Bank Charges',group:'Bank Charges'},
  {name:'Unregistered Purchase',group:'Unregistered Purchase'},
  // Restaurant outlets only (appended — rows are stored by position, so never insert above).
  {name:'Vegetables & Fruits',group:'Food Purchase (Local)',biz:'restaurant'},
  {name:'Dairy & Eggs',group:'Food Purchase (Local)',biz:'restaurant'},
  {name:'Meat, Chicken & Seafood',group:'Food Purchase (Local)',biz:'restaurant'},
  {name:'Grocery & Provisions',group:'Food Purchase (Local)',biz:'restaurant'},
  {name:'Bakery & Bread',group:'Food Purchase (Local)',biz:'restaurant'},
  {name:'Beverages & Ice',group:'Food Purchase (Local)',biz:'restaurant'},
  {name:'Gas / LPG',group:'Gas / LPG',biz:'restaurant'},
  {name:'Packaging Material',group:'Packaging Material',biz:'restaurant'},
  {name:'Kitchen Consumables',group:'Kitchen Consumables',biz:'restaurant'},
  {name:'Pest Control',group:'Pest Control',biz:'restaurant'},
];
// Salon-only and restaurant-only rows are hidden on the other kind of outlet.
function expenseRowVisibleFor(row,salonId){return !row||!row.biz||row.biz===bizKeyOf(salonId);}
// Vendor-linked rows — if these have value, cell turns red until voucher entered in Vendor Sheet
const VENDOR_ROWS=new Set(['Repair & Maintenance','Telephone & Internet Expenses','Electric Work','Drycleaning Expenses','Rent','Accessories','Tanker Cleaning']);
// Expense rows that can only be entered on a day there's a real, unpaid vendor invoice (matched
// by Category in Vendor Sheet → Outstanding Invoices) behind them.
const INVOICE_GATED_EXPENSE_ROWS=['DG Rent','Drycleaning Expenses','Professional Fee','Staff Room Rent','Royalty','Electricity Expenses','Uniform Expenses','Telephone & Internet Expenses','Maintenance Expenses','Rent'];
// Reads Daily Sales & Exp's saved data directly from storage (for a given outlet) and sums every
// entry across a calendar month whose row belongs to the given group — this is how the P&L
// (Monthly) pulls its real expense-line totals instead of a fabricated percentage-of-revenue
// number. year/month here are calendar (month is 0-11), matching periodToCalendar's output.
function dailySalesGroupSumFor(salonId,year,month,groupName){
  let data={};
  try{data=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_data',salonId))||'{}');}catch(e){}
  const rowIdxs=EXPENSE_ROWS.reduce((arr,r,i)=>{if(r.group===groupName)arr.push(i);return arr;},[]);
  if(!rowIdxs.length)return 0;
  let sum=0;
  Object.keys(data).forEach(iso=>{
    const d=new Date(iso+'T00:00:00');
    if(isNaN(d)||d.getFullYear()!==year||d.getMonth()!==month)return;
    const dayVals=data[iso]||{};
    rowIdxs.forEach(ri=>{const v=Number(dayVals[ri]);if(!isNaN(v))sum+=v;});
  });
  return sum;
}

function dailySalesRowSumFor(salonId,year,month,rowName){
  let data={};
  try{data=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_data',salonId))||'{}');}catch(e){}
  const ri=EXPENSE_ROWS.findIndex(r=>r.name===rowName);
  if(ri<0)return 0;
  let sum=0;
  Object.keys(data).forEach(iso=>{
    const d=new Date(iso+'T00:00:00');
    if(isNaN(d)||d.getFullYear()!==year||d.getMonth()!==month)return;
    const v=Number((data[iso]||{})[ri]);
    if(!isNaN(v))sum+=v;
  });
  return sum;
}
// Unique expense groups, in EXPENSE_ROWS's own first-appearance order — the "Expenses Group
// Wise" breakdown rolls every row up into one of these.
const EXPENSE_GROUPS_ORDERED=(()=>{
  const seen=new Set();const out=[];
  EXPENSE_ROWS.forEach(r=>{if(!seen.has(r.group)){seen.add(r.group);out.push(r.group);}});
  return out;
})();
// ── Expenses Summary Report — Monthly + Comparative, both Daily-Expenses-wise (every individual
// row) and Expenses-Group-wise (rolled up). One shared implementation mounted in three places —
// a modal from Daily Sales & Exp itself, its own sub-tab under Reports, and its own tab on the
// Outlet Dashboard — all reading the exact same dailySalesRowSumFor/dailySalesGroupSumFor the
// real P&L uses for these lines, so all three (and the P&L) can never quietly disagree with each
// other about what a month's expenses actually were.
function ExpensesSummaryReport({salon,period}={}){
  const salonId=salon?.id;
  const MONTHS_SHORT=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONTHS_FULL=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const todayCal=(()=>{const d=new Date();return{year:d.getFullYear(),month:d.getMonth()};})();
  const cal=periodToCalendar(period)||todayCal;
  const [viewBy,setViewBy]=useState('row'); // 'row' | 'group'
  const [mode,setMode]=useState('month'); // 'month' | 'comparative'
  const [rangeMonths,setRangeMonths]=useState(6); // 3 | 6 | 12 | 24
  const [hideZero,setHideZero]=useState(true);
  // Variance highlighting — same idea as Collection Sheet's configurable diff threshold. A month
  // (or comparative column) is flagged when it moves by at least this % from the prior month, in
  // either direction; going from/to ₹0 is always flagged regardless of the number, since a %
  // change against zero isn't meaningful on its own.
  const [varPct,setVarPct]=useState(()=>{try{const v=Number(cachedLocalGet(outletKey('salonos_expsummary_variance_pct',salonId)));return v>0?v:20;}catch(e){return 20;}});
  useEffect(()=>{safeLocalSet(outletKey('salonos_expsummary_variance_pct',salonId),String(varPct));},[varPct,salonId]);
  const prevCalOf=(y,m)=>m===0?{y:y-1,m:11}:{y,m:m-1};
  // pct===null means "not comparable" (both months zero); Infinity/-Infinity mean "from/to zero".
  const varianceOf=(amt,prevAmt)=>{
    if(prevAmt===0&&amt===0)return{pct:null,sig:false};
    if(prevAmt===0)return{pct:Infinity,sig:true};
    if(amt===0)return{pct:-Infinity,sig:true};
    const pct=Math.round((amt-prevAmt)/prevAmt*1000)/10;
    return{pct,sig:Math.abs(pct)>=varPct};
  };
  // Expense convention used throughout this app (see OutletDashboard's Total Expenses arrow):
  // an increase is the "bad" direction (red), a decrease is the "good" direction (green) —
  // opposite of how a revenue figure would be colored.
  const varianceColor=(v)=>{if(!v.sig)return'var(--text3)';return(v.pct===Infinity||v.pct>0)?'var(--red)':'var(--green)';};
  const varianceLabel=(v)=>{
    if(v.pct===null)return'—';
    if(v.pct===Infinity)return'New';
    if(v.pct===-Infinity)return'→ ₹0';
    return(v.pct>0?'+':'')+v.pct+'%';
  };

  const items=useMemo(()=>viewBy==='row'
    ?EXPENSE_ROWS.map(r=>({key:r.name,label:r.name,group:r.group}))
    :EXPENSE_GROUPS_ORDERED.map(g=>({key:g,label:g})),
    [viewBy]);
  const amtFor=(key,y,m)=>viewBy==='row'?dailySalesRowSumFor(salonId,y,m,key):dailySalesGroupSumFor(salonId,y,m,key);

  const monthRows=useMemo(()=>{
    const prevCal=prevCalOf(cal.year,cal.month);
    return items.map(it=>{
      const amt=amtFor(it.key,cal.year,cal.month);
      const prevAmt=amtFor(it.key,prevCal.y,prevCal.m);
      return{...it,amt,prevAmt,variance:varianceOf(amt,prevAmt)};
    }).sort((a,b)=>b.amt-a.amt);
  },[salonId,viewBy,cal.year,cal.month,items,varPct]);
  const monthTotal=monthRows.reduce((s,r)=>s+r.amt,0);

  const monthsList=useMemo(()=>Array.from({length:rangeMonths},(_,i)=>{
    const idx=cal.year*12+cal.month-(rangeMonths-1-i);
    return{y:Math.floor(idx/12),m:((idx%12)+12)%12};
  }),[cal.year,cal.month,rangeMonths]);
  const compRows=useMemo(()=>items.map(it=>{
    const vals=monthsList.map(({y,m})=>amtFor(it.key,y,m));
    const variances=monthsList.map(({y,m},i)=>{
      const prev=i===0?prevCalOf(y,m):monthsList[i-1];
      const prevAmt=i===0?amtFor(it.key,prev.y,prev.m):vals[i-1];
      return varianceOf(vals[i],prevAmt);
    });
    return{...it,vals,variances,total:vals.reduce((s,v)=>s+v,0)};
  }).sort((a,b)=>b.total-a.total),[salonId,viewBy,monthsList,items,varPct]);
  const compColTotals=monthsList.map((_,ci)=>compRows.reduce((s,r)=>s+r.vals[ci],0));
  const compGrandTotal=compColTotals.reduce((s,v)=>s+v,0);

  const visibleMonthRows=hideZero?monthRows.filter(r=>r.amt>0):monthRows;
  const visibleCompRows=hideZero?compRows.filter(r=>r.total>0):compRows;

  const money=(n)=>n?'₹'+Math.round(n).toLocaleString('en-IN'):'—';
  const viewLabel=viewBy==='row'?'Daily Expenses Wise':'Expenses Group Wise';

  const reportTitle=(salon?salon.name.split('—')[0].trim()+' — ':'')+'Expenses Summary — '+viewLabel+' — '+(mode==='month'?MONTHS_FULL[cal.month]+' '+cal.year:'Last '+rangeMonths+' Months to '+MONTHS_FULL[cal.month]+' '+cal.year);
  const reportSheetRows=()=>{
    if(mode==='month'){
      const headers=viewBy==='row'?['Expense','Group','Amount','% of Total','vs Last Month']:['Expense Group','Amount','% of Total','vs Last Month'];
      const rows=visibleMonthRows.map(r=>viewBy==='row'
        ?[r.label,r.group,r.amt,monthTotal?Math.round(r.amt/monthTotal*1000)/10:0,varianceLabel(r.variance)]
        :[r.label,r.amt,monthTotal?Math.round(r.amt/monthTotal*1000)/10:0,varianceLabel(r.variance)]);
      const totalRow=viewBy==='row'?['Total','',monthTotal,100,'']:['Total',monthTotal,100,''];
      return[headers,...rows,totalRow];
    }
    const headers=[viewBy==='row'?'Expense':'Expense Group',...monthsList.map(({y,m})=>MONTHS_SHORT[m]+' '+String(y).slice(2)),'Total'];
    const rows=visibleCompRows.map(r=>[r.label,...r.vals,r.total]);
    const totalRow=['Total',...compColTotals,compGrandTotal];
    return[headers,...rows,totalRow];
  };
  const reportBodyHtml=()=>{
    if(mode==='month'){
      const bodyRows=visibleMonthRows.map(r=>'<tr><td>'+r.label+(viewBy==='row'?' <span style="color:#999;font-size:10px">('+r.group+')</span>':'')+'</td><td class="num">'+money(r.amt)+'</td><td class="num">'+(monthTotal?Math.round(r.amt/monthTotal*1000)/10:0)+'%</td><td class="num" style="color:'+varianceColor(r.variance)+'">'+varianceLabel(r.variance)+'</td></tr>').join('');
      return'<table><thead><tr><th>'+(viewBy==='row'?'Expense':'Expense Group')+'</th><th class="num">Amount</th><th class="num">% of Total</th><th class="num">vs Last Month</th></tr></thead><tbody>'+bodyRows+'</tbody>'
        +'<tfoot><tr><td>Total</td><td class="num">'+money(monthTotal)+'</td><td class="num">100%</td><td></td></tr></tfoot></table>';
    }
    const hdrCols=monthsList.map(({y,m})=>'<th class="num">'+MONTHS_SHORT[m]+' '+String(y).slice(2)+'</th>').join('');
    const bodyRows=visibleCompRows.map(r=>'<tr><td>'+r.label+'</td>'+r.vals.map((v,i)=>'<td class="num" style="color:'+(r.variances[i].sig?varianceColor(r.variances[i]):'inherit')+'">'+money(v)+(r.variances[i].sig?' <span style="font-size:9px">('+varianceLabel(r.variances[i])+')</span>':'')+'</td>').join('')+'<td class="num" style="font-weight:600">'+money(r.total)+'</td></tr>').join('');
    const totCols=compColTotals.map(v=>'<td class="num">'+money(v)+'</td>').join('');
    return'<table><thead><tr><th>'+(viewBy==='row'?'Expense':'Expense Group')+'</th>'+hdrCols+'<th class="num">Total</th></tr></thead><tbody>'+bodyRows+'</tbody>'
      +'<tfoot><tr><td>Total</td>'+totCols+'<td class="num">'+money(compGrandTotal)+'</td></tr></tfoot></table>';
  };
  const exportExcel=async()=>{
    try{
      const blob=await exportReportExcelBlob(reportTitle,reportSheetRows());
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;
      a.download='Expenses_Summary_'+(viewBy==='row'?'RowWise':'GroupWise')+'_'+(mode==='month'?MONTHS_SHORT[cal.month]+cal.year:'Last'+rangeMonths+'Months')+'.xlsx';
      a.click();URL.revokeObjectURL(url);
    }catch(err){}
  };

  const monthTheadCells=[React.createElement('th',{key:'label'},viewBy==='row'?'Expense':'Expense Group')]
    .concat(viewBy==='row'?[React.createElement('th',{key:'group'},'Group')]:[])
    .concat([
      React.createElement('th',{key:'amt',style:{textAlign:'right'}},'Amount'),
      React.createElement('th',{key:'pct',style:{textAlign:'right'}},'% of Total'),
      React.createElement('th',{key:'var',style:{textAlign:'right'}},'vs Last Month')
    ]);
  const monthColSpan=viewBy==='row'?5:4;
  const compTheadCells=[React.createElement('th',{key:'label'},viewBy==='row'?'Expense':'Expense Group')]
    .concat(monthsList.map(({y,m},i)=>React.createElement('th',{key:'m'+i,style:{textAlign:'right'}},MONTHS_SHORT[m]+' '+String(y).slice(2))))
    .concat([React.createElement('th',{key:'tot',style:{textAlign:'right'}},'Total')]);
  // A significant cell gets a soft tinted background (not just colored text) so it's visible at
  // a glance while scanning the table, not just when reading each number individually.
  const varBg=(v)=>v.sig?((v.pct===Infinity||v.pct>0)?'rgba(255,107,107,0.08)':'rgba(76,175,125,0.08)'):undefined;

  return React.createElement('div',null,
    React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:14}},
      React.createElement('div',{className:'tab-bar',style:{marginBottom:0}},
        [{id:'row',label:'Daily Expenses Wise'},{id:'group',label:'Expenses Group Wise'}].map(t=>
          React.createElement('button',{key:t.id,className:'tab-btn '+(viewBy===t.id?'active':''),onClick:()=>setViewBy(t.id)},t.label))
      ),
      React.createElement('div',{className:'tab-bar',style:{marginBottom:0}},
        [{id:'month',label:'Monthly Summary'},{id:'comparative',label:'Comparative Summary'}].map(t=>
          React.createElement('button',{key:t.id,className:'tab-btn '+(mode===t.id?'active':''),onClick:()=>setMode(t.id)},t.label))
      ),
      mode==='comparative'&&React.createElement('div',{style:{display:'flex',gap:6,alignItems:'center'}},
        React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},'Range:'),
        [3,6,12,24].map(n=>React.createElement('button',{key:n,className:'btn btn-sm '+(rangeMonths===n?'btn-primary':'btn-ghost'),onClick:()=>setRangeMonths(n)},n+'mo'))
      ),
      React.createElement('div',{title:'A month is highlighted when it moves by at least this % from the month before it, in either direction.',style:{display:'flex',gap:5,alignItems:'center',fontSize:11.5,color:'var(--text2)'}},
        React.createElement('span',null,'⚠ Flag changes ≥'),
        React.createElement('input',{type:'number',min:1,max:200,className:'form-control',style:{width:52,padding:'4px 6px',fontSize:11.5},value:varPct,onChange:e=>setVarPct(Math.max(1,Number(e.target.value)||1))}),
        React.createElement('span',null,'%')
      ),
      React.createElement('label',{style:{display:'flex',alignItems:'center',gap:5,fontSize:11.5,color:'var(--text2)',cursor:'pointer',marginLeft:'auto'}},
        React.createElement('input',{type:'checkbox',checked:hideZero,onChange:e=>setHideZero(e.target.checked)}),'Hide zero rows'
      ),
      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:exportExcel},'⬇ Export Excel'),
      React.createElement(ShareReportButton,{title:reportTitle,subtitle:'Expenses Summary',getBodyHtml:reportBodyHtml,getSheetRows:reportSheetRows})
    ),
    React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:12}},
      mode==='month'
        ?'Every entry on Daily Sales & Exp for '+MONTHS_FULL[cal.month]+' '+cal.year+', rolled up '+(viewBy==='row'?'by individual expense row':'by expense group')+'. '
        :'The '+rangeMonths+' months ending '+MONTHS_FULL[cal.month]+' '+cal.year+' — '+(viewBy==='row'?'one row per expense':'one row per expense group')+', so you can compare trends month to month. ',
      React.createElement('span',null,'Highlighted cells moved '+varPct+'% or more from the month before — red for an increase, green for a decrease.')
    ),
    mode==='month'
      ?React.createElement('div',{className:'card',style:{padding:0}},
          React.createElement('div',{className:'table-wrap'},
            React.createElement('table',null,
              React.createElement('thead',null,React.createElement.apply(React,['tr',null].concat(monthTheadCells))),
              React.createElement('tbody',null,
                visibleMonthRows.length===0
                  ?React.createElement('tr',null,React.createElement('td',{colSpan:monthColSpan,style:{textAlign:'center',padding:20,color:'var(--text3)'}},'No expenses entered for this month yet.'))
                  :visibleMonthRows.map(r=>{
                      const cells=[React.createElement('td',{key:'l'},r.label)]
                        .concat(viewBy==='row'?[React.createElement('td',{key:'g'},React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},r.group))]:[])
                        .concat([
                          React.createElement('td',{key:'a',style:{textAlign:'right',fontWeight:600}},money(r.amt)),
                          React.createElement('td',{key:'p',style:{textAlign:'right',color:'var(--text3)'}},(monthTotal?Math.round(r.amt/monthTotal*1000)/10:0)+'%'),
                          React.createElement('td',{key:'v',style:{textAlign:'right',fontWeight:r.variance.sig?700:400,color:varianceColor(r.variance),background:varBg(r.variance)}},varianceLabel(r.variance))
                        ]);
                      return React.createElement.apply(React,['tr',{key:r.key}].concat(cells));
                    })
              ),
              visibleMonthRows.length>0&&React.createElement('tfoot',null,
                React.createElement.apply(React,['tr',{style:{fontWeight:700,background:'var(--bg3)'}}].concat(
                  [React.createElement('td',{key:'l'},'Total')]
                    .concat(viewBy==='row'?[React.createElement('td',{key:'g'})]:[])
                    .concat([
                      React.createElement('td',{key:'a',style:{textAlign:'right'}},money(monthTotal)),
                      React.createElement('td',{key:'p',style:{textAlign:'right'}},'100%'),
                      React.createElement('td',{key:'v'})
                    ])
                ))
              )
            )
          )
        )
      :React.createElement('div',{className:'card',style:{padding:0}},
          React.createElement('div',{className:'table-wrap'},
            React.createElement('table',null,
              React.createElement('thead',null,React.createElement.apply(React,['tr',null].concat(compTheadCells))),
              React.createElement('tbody',null,
                visibleCompRows.length===0
                  ?React.createElement('tr',null,React.createElement('td',{colSpan:rangeMonths+2,style:{textAlign:'center',padding:20,color:'var(--text3)'}},'No expenses entered for this range yet.'))
                  :visibleCompRows.map(r=>{
                      const cells=[React.createElement('td',{key:'l'},r.label)]
                        .concat(r.vals.map((v,i)=>React.createElement('td',{key:'v'+i,title:r.variances[i].sig?varianceLabel(r.variances[i])+' vs previous month':undefined,
                          style:{textAlign:'right',fontWeight:r.variances[i].sig?700:400,color:r.variances[i].sig?varianceColor(r.variances[i]):'inherit',background:varBg(r.variances[i])}},money(v))))
                        .concat([React.createElement('td',{key:'t',style:{textAlign:'right',fontWeight:600}},money(r.total))]);
                      return React.createElement.apply(React,['tr',{key:r.key}].concat(cells));
                    })
              ),
              visibleCompRows.length>0&&React.createElement('tfoot',null,
                React.createElement.apply(React,['tr',{style:{fontWeight:700,background:'var(--bg3)'}}].concat(
                  [React.createElement('td',{key:'l'},'Total')]
                    .concat(compColTotals.map((v,i)=>React.createElement('td',{key:'v'+i,style:{textAlign:'right'}},money(v))))
                    .concat([React.createElement('td',{key:'t',style:{textAlign:'right'}},money(compGrandTotal))])
                ))
              )
            )
          )
        )
  );
}
// Real Cash/Card/UPI collection totals for a calendar month, straight from Collection Reco's
// "Imported Data Preview" (the Cradlee report import) — this is what the P&L's Revenue from
// Operations lines are built from.
function collectionSalesSumFor(salonId,year,month){
  let rows=[];
  try{rows=JSON.parse(cachedLocalGet(outletKey('salonos_cradlee_collection_rows',salonId))||'[]');}catch(e){}
  let cash=0,card=0,upi=0;
  rows.forEach(r=>{
    const iso=toISO(r.invoiceDate);
    if(!iso)return;
    const d=new Date(iso+'T00:00:00');
    if(isNaN(d)||d.getFullYear()!==year||d.getMonth()!==month)return;
    cash+=Number(r.cash)||0;card+=Number(r.card)||0;upi+=Number(r.upi)||0;
  });
  return{cash,card,upi};
}
// Where a salon's P&L takes Cash / Card / UPI Sale from: 'collection' (Collection Reco's imported
// CRADLE data, the original source) or 'dse' (Daily Sales & Exp — Luzo Sale is added to UPI Sale).
// Chosen per month on the P&L; the last choice becomes the default for months not yet chosen.
// Months already P&L Final are pinned to the source they were finalised with before a new
// default is saved, so changing it never alters a finalised month.
function loadPlRevenueSource(sid){try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_pl_revenue_source',sid))||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}}
function plRevenueSourceFor(sid,year,month){
  const m=loadPlRevenueSource(sid);const v=m[year+'-'+month]||m.default;
  return v==='dse'?'dse':'collection';
}
function setPlRevenueSource(sid,year,month,src){
  const m=loadPlRevenueSource(sid);
  try{Object.entries(loadPnlFinal(sid)).forEach(([k,v])=>{if(!v||!v.final)return;const [fy,mi]=k.split('|');const c=periodToCalendar({fy,mi:Number(mi)});
    if(c&&!m[c.year+'-'+c.month])m[c.year+'-'+c.month]=plRevenueSourceFor(sid,c.year,c.month);});}catch(e){}
  m[year+'-'+month]=src;m.default=src;
  safeLocalSet(outletKey('salonos_pl_revenue_source',sid),JSON.stringify(m));
}
// Daily Sales & Exp sale rows for a month, per day: Cash (row 0), Card (1), UPI (2) + Luzo (3).
function dseSalesRowsForMonth(sid,year,month){
  let ds={};try{ds=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',sid))||'{}')||{};}catch(e){}
  const pre=year+'-'+String(month+1).padStart(2,'0')+'-';
  const n=v=>Number(v)||0;
  return Object.keys(ds).filter(iso=>iso.startsWith(pre)).sort().map(iso=>{const d=ds[iso]||{};
    return{id:iso,invoiceDate:iso.split('-').reverse().join('/'),centerName:'Daily Sales & Exp',cash:n(d[0]),card:n(d[1]),upi:n(d[2])+n(d[3]),luzo:n(d[3])};})
    .filter(r=>r.cash||r.card||r.upi);
}
// Gross (incl. GST) Cash / Card / UPI for the P&L, from whichever source the month uses.
function plRevenueGrossFor(sid,year,month){
  if(plRevenueSourceFor(sid,year,month)!=='dse')return collectionSalesSumFor(sid,year,month);
  return dseSalesRowsForMonth(sid,year,month).reduce((t,r)=>({cash:t.cash+r.cash,card:t.card+r.card,upi:t.upi+r.upi,luzo:t.luzo+r.luzo}),{cash:0,card:0,upi:0,luzo:0});
}
// The individual Collection Reco rows behind a month's Cash/Card/UPI Sale figure — used by the
// P&L's "🔗" drill-down on those three Revenue lines, so a person can see exactly which imported
// rows add up to the number instead of just trusting a total.
function collectionRowsForMonth(salonId,year,month){
  let rows=[];
  try{rows=JSON.parse(cachedLocalGet(outletKey('salonos_cradlee_collection_rows',salonId))||'[]');}catch(e){}
  return rows.filter(r=>{
    const iso=toISO(r.invoiceDate);
    if(!iso)return false;
    const d=new Date(iso+'T00:00:00');
    return!isNaN(d)&&d.getFullYear()===year&&d.getMonth()===month;
  }).sort((a,b)=>toISO(a.invoiceDate)<toISO(b.invoiceDate)?-1:1);
}
// Sum of Bank Statement debit rows tagged with a given Nature, in a calendar month — used to
// fold real bank-debited charges (e.g. Nature = "Bank Charges") into the matching P&L line
// alongside whatever's entered by hand in Daily Sales & Exp.
function bankStatementNatureDebitSumFor(salonId,year,month,natureValue){
  let rows=[];
  try{rows=JSON.parse(cachedLocalGet(outletKey('salonos_bank_statement_rows',salonId))||'[]');}catch(e){}
  let sum=0;
  rows.forEach(r=>{
    if(r.nature!==natureValue)return;
    const iso=toISO(r.transactionDate);
    if(!iso)return;
    const d=new Date(iso+'T00:00:00');
    if(isNaN(d)||d.getFullYear()!==year||d.getMonth()!==month)return;
    sum+=Number(r.debit)||0;
  });
  return sum;
}
// Net Bank Charges for a calendar month — the exact same "Reco of Actual Bank Charges" formula
// Collection Sheet computes for its live-filtered view (Consolidate Difference, less Previous
// Month Collection/Excess Collection/Tip to Employee, plus Credit Sale/Short Collection), just
// run standalone here for a fixed month so the P&L can pull from it too, independent of whatever
// filter happens to be active on the Collection Sheet screen at the time.
function netBankChargesFor(salonId,year,month){
  const cradleeRows=collectionRowsForMonth(salonId,year,month);
  if(!cradleeRows.length)return 0;
  const byDate={};
  cradleeRows.forEach(r=>{
    if(!byDate[r.invoiceDate])byDate[r.invoiceDate]={cashCradlee:0,cardCradlee:0,upiCradlee:0};
    byDate[r.invoiceDate].cashCradlee+=Number(r.cash)||0;
    byDate[r.invoiceDate].cardCradlee+=Number(r.card)||0;
    byDate[r.invoiceDate].upiCradlee+=Number(r.upi)||0;
  });
  const bankSettlements=loadBankSettlementsByDate(salonId);
  let dseCashByIso={};try{dseCashByIso=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',salonId))||'{}');}catch(e){}
  let dseExpenseByIso={};try{dseExpenseByIso=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_data',salonId))||'{}');}catch(e){}
  const tipRowIdx=EXPENSE_ROWS.findIndex(r=>r.name==='Tip To Employee');
  let reasonForDiff={};try{reasonForDiff=JSON.parse(cachedLocalGet(outletKey('salonos_collection_reason_diff',salonId))||'{}');}catch(e){}
  let consolidateDiff=0,prevMonth=0,excess=0,creditSale=0,shortCollection=0,tip=0;
  Object.keys(byDate).forEach(dmy=>{
    const d=byDate[dmy];
    const iso=toISO(dmy);
    const bank=bankSettlements[dmy]||{card:0,upi:0};
    const counterRaw=iso&&dseCashByIso[iso]?dseCashByIso[iso][0]:'';
    const hasCounter=counterRaw!==undefined&&counterRaw!=='';
    const cashDiff=hasCounter?Number(counterRaw)-d.cashCradlee:0;
    const cardDiff=(bank.card||0)-d.cardCradlee;
    const upiDiff=(bank.upi||0)-d.upiCradlee;
    consolidateDiff+=cashDiff+cardDiff+upiDiff;
    const tipVal=iso&&dseExpenseByIso[iso]&&tipRowIdx>=0?dseExpenseByIso[iso][tipRowIdx]:'';
    tip+=(tipVal!=null&&tipVal!=='')?(Number(tipVal)||0):0;
    const entry=reasonForDiff[dmy];
    if(entry&&typeof entry==='object'){
      const amt=Number(entry.amount)||0;
      if(entry.type==='prevMonth')prevMonth+=amt;
      else if(entry.type==='excessCollection')excess+=amt;
      else if(entry.type==='creditSale')creditSale+=amt;
      else if(entry.type==='shortCollection')shortCollection+=amt;
    }
  });
  return consolidateDiff-prevMonth-excess-tip+creditSale+shortCollection;
}
// The full "Operating expenses" section — every line here is real, pulled from Daily Sales &
// Exp's saved entries (grouped as set up in EXPENSE_ROWS), in the exact order requested.
// Note: Unregistered Purchase is deliberately NOT a line here — it's already counted once under
// Direct Cost of Service (see PL_DIRECT_REAL_LINES below), which sources from the exact same
// EXPENSE_ROWS group. Including it here too would double-count the entire group.
// Membership/Product/Service/Target Commission is likewise NOT a line here — it now lives under
// Employee Cost (see employeeCostFor above), right after the role-wise Monthly Incentive lines,
// since it's a staff commission payout, not an operating expense.
// Tip To Employee is also NOT a line here, by request — removed from the P&L entirely rather
// than moved elsewhere.
// Penalty Recovery is flagged `credit:true` — it's money recovered FROM employees (the same
// "Penalties" row/sheet Salary Working already deducts from Net Salary), so on the P&L it reduces
// Operating Expenses rather than adding to them.
// alsoVendorCat folds in real Vendor Sheet invoices booked under that Category. For lines with
// no competing accrual (Uniform Expenses), this simply adds to whatever Daily Sales & Exp already
// contributes — same treatment "Purchase of Cosmetic" gets under Direct Cost of Service. For lines
// that already get a monthly estimate from Recurring Expenses (flagged `vendorWinsOverRecurring`),
// a REAL invoice booked this month replaces that estimate for the month instead of stacking on top
// of it — more accurate than the estimate, and avoids double-counting the same bill twice. If no
// real invoice exists for the month, the Recurring Expenses estimate is still used as the fallback,
// so the line never just goes blank the way it used to whenever an invoice hadn't been booked yet.
const PL_OPEX_LINES=[
  {name:'Rent',group:'Rent',noDaily:true,alsoVendorCat:'Rent',vendorWinsOverRecurring:true},
  {name:'Staff Room Rent',group:'Staff Room Rent',noDaily:true,alsoVendorCat:'Staff Room Rent',vendorWinsOverRecurring:true},
  {name:'Daily Expenses',group:'Daily Expenses'},
  {name:'Royalty',group:'Royalty',noDaily:true,alsoVendorCat:'Royalty',vendorWinsOverRecurring:true},
  {name:'Electricity Expenses',group:'Electricity Expenses',noDaily:true,alsoVendorCat:'Electricity Expenses',vendorWinsOverRecurring:true},
  {name:'DG Rent',group:'DG Rent',noDaily:true,alsoVendorCat:'DG Rent',vendorWinsOverRecurring:true},
  {name:'Diesel Expenses',group:'Diesel Expenses'},
  {name:'Telephone & Internet Expenses',group:'Telephone & Internet Expenses',noDaily:true,alsoVendorCat:'Telephone & Internet Expenses',vendorWinsOverRecurring:true},
  {name:'Marketing Expenses',group:'Marketing Expenses'},
  {name:'Tanker Expenses',group:'Tanker Cleaning'},
  {name:'Drycleaning Expenses',group:'Drycleaning Expenses',noDaily:true,alsoVendorCat:'Drycleaning Expenses',vendorWinsOverRecurring:true},
  {name:'Professional Fee',group:'Professional Fee',noDaily:true,alsoVendorCat:'Professional Fee',vendorWinsOverRecurring:true},
  {name:'Repair & Maintenance Expenses',group:'Repair & Maintenance Expenses'},
  {name:'Uniform Expenses',group:'Uniform Expenses',alsoVendorCat:'Uniform Expenses'},
  {name:'Maintenance Expenses',group:'Maintenance Expenses',noDaily:true,alsoVendorCat:'Maintenance Expenses',vendorWinsOverRecurring:true},
  {name:'Bank Charges',group:'Bank Charges',alsoNature:'Bank Charges',alsoNetBankCharges:true},
  {name:'Penalty Recovery',group:'Penalty',credit:true},
  // Restaurant outlets only.
  {name:'Aggregator Commission & Charges',biz:'restaurant',fn:(s,y,m)=>typeof aggregatorChargesFor==='function'?aggregatorChargesFor(s,y,m):0},
  {name:'Kitchen Consumables',group:'Kitchen Consumables',biz:'restaurant'},
  {name:'Pest Control',group:'Pest Control',biz:'restaurant',alsoVendorCat:'Pest Control'},
  {name:'Licences & Fees',group:'Licences & Fees',biz:'restaurant',alsoVendorCat:'Licences & Fees'},
];
// Which Recurring Expenses "Expense Type" each P&L Operating Expense line pulls from — most
// share the exact same name, "Maintenance Expenses" here maps to "Maintenance Bill" there since
// that's what the Recurring Expenses form calls it. Lines with no entry here (Daily Expenses,
// Tanker Expenses, Repair & Maintenance Expenses, Uniform Expenses,
// Membership/Product/Service/Target Commission) have no standing-bill equivalent
// and stay sourced from Daily Sales & Exp only.
// ── noDaily lines (see PL_OPEX_LINES above) — Rent, Staff Room Rent, Royalty, Electricity
// Expenses, DG Rent, Telephone & Internet Expenses, Drycleaning Expenses, Professional Fee,
// Maintenance Expenses — are the expense rows Daily Sales & Exp gates behind a real outstanding
// Vendor Sheet invoice before a payment can even be entered. Their P&L cost is recognized once,
// through the Recurring Expenses accrual, not a second time through the day the payment happens
// to be made — so operatingExpensesFor skips their Daily Sales & Exp contribution entirely.
// Uniform Expenses is also invoice-gated but deliberately excluded from that list: unlike the
// others, it has no Recurring Expenses category of its own (nothing above maps to it), so its
// Daily Sales & Exp entries are its only route onto the P&L at all — stripping them would zero
// it out completely every month instead of avoiding a double-count.
const PL_OPEX_RECURRING_MAP={
  'Rent':'Rent','Staff Room Rent':'Staff Room Rent','Royalty':'Royalty','Electricity Expenses':'Electricity Expenses',
  'DG Rent':'DG Rent','Diesel Expenses':'Diesel Expenses','Telephone & Internet Expenses':'Telephone & Internet Expenses',
  'Marketing Expenses':'Marketing Expenses','Drycleaning Expenses':'Drycleaning Expenses','Professional Fee':'Professional Fee',
  'Maintenance Expenses':'Maintenance Bill','Bank Charges':'Bank Charges'
};
function loadRecurringExpenses(salonId){
  try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_recurring_expenses',salonId))||'[]');if(Array.isArray(v))return v;}catch(e){}
  return[];
}
function recurringExpenseNameOf(it){return it.expenseName==='Other'&&it.customName?it.customName:it.expenseName;}
// Rent and Staff Room Rent both get the full treatment: GST applicability, GSTIN, GST Amount,
// Invoice Value, Reverse Charge on the P&L when GST isn't applicable, escalation tracking, and
// agreement attachment. Every other expense type stays simple (just a taxable amount).
const RENT_LIKE_TYPES=new Set(['Rent','Staff Room Rent','DG Rent','Maintenance Bill']);
function isRentLikeExpense(name){return RENT_LIKE_TYPES.has(name);}
// The monthly-equivalent cost of a recurring commitment — what actually lands on the P&L each
// month. This business can't claim GST input credit, so GST is never a recoverable amount — it's
// always a real cost, and the Invoice Value (Taxable + GST) is what should be expensed, never
// just the Taxable Value on its own. If GST is applicable (the payee charges it), use the actual
// GST Amount entered. If GST is NOT applicable (the payee isn't GST-registered), 18% becomes
// payable under Reverse Charge Mechanism — equally a real, unrecoverable cost. Applies across
// every expense type.
// The Taxable Amount actually in effect for a given month:
//  • Rent-like increment schedule (Rent/Staff Room Rent/DG Rent) — every increment whose date has
//    passed by the end of that month compounds on the result of the one before it.
//  • Marketing Expenses' / Drycleaning Expenses' Next Increment Date/Amount — a simple one-time
//    flat step-up, not a %.
// With no year/month given (the recurring-expense list/exports, which show a single reference
// figure rather than a specific month), this just returns the flat entered amount, unchanged from
// before either kind of increment existed.
function effectiveTaxableAmountFor(it,year,month){
  const base=Number(it.amount)||0;
  if(year==null||month==null)return base;
  const monthEnd=new Date(year,month+1,0);
  const increments=(it.increments||[]).filter(x=>x.date&&Number(x.pct));
  if(increments.length){
    let amt=base;
    increments.slice().sort((a,b)=>a.date.localeCompare(b.date)).forEach(inc=>{
      const d=new Date(inc.date+'T00:00:00');
      if(!isNaN(d)&&d<=monthEnd)amt=amt*(1+Number(inc.pct)/100);
    });
    return amt;
  }
  const flatStepUp=[
    {date:it.marketingNextIncrementDate,amt:it.marketingNextAmount},
    {date:it.drycleaningNextIncrementDate,amt:it.drycleaningNextAmount},
    {date:it.profFeeNextIncrementDate,amt:it.profFeeNextAmount}
  ].find(s=>s.date&&Number(s.amt)>0);
  if(flatStepUp){
    const d=new Date(flatStepUp.date+'T00:00:00');
    if(!isNaN(d)&&d<=monthEnd)return Number(flatStepUp.amt);
  }
  return base;
}
// ── Prepaid / postpaid bills for non-monthly items ──
// Months one bill covers: "Months covered by each bill" on the item, else the frequency (Quarterly = 3).
function recurringMonthsOf(it){const c=Number(it&&it.coverMonths);return c>0&&c<=24?Math.round(c):(RECURRING_PERIOD_MONTHS[it&&it.frequency]||1);}
function recurringDivisorOf(it){const c=Number(it&&it.coverMonths);return c>0&&c<=24?Math.round(c):(RECURRING_FREQ_DIVISOR[it&&it.frequency]||1);}
// 'prepaid' — the bill covers its own month and the next ones (advance);
// 'postpaid' — its own month and the previous ones; 'arrears' — the months just before it (electricity).
function recurringBillTiming(it){
  if(it&&it.billTiming)return it.billTiming;
  if(isVariableRecurring(it))return it.billFor==='current'?'postpaid':'arrears';
  return'postpaid';
}
// The months a bill dated in month bm covers when it doesn't print its own period.
function recurringBillPeriodFor(it,bm){
  const N=recurringMonthsOf(it),tm=recurringBillTiming(it);
  const last=tm==='prepaid'?bm+N-1:tm==='postpaid'?bm:bm-1;
  return{first:last-N+1,last};
}
function recurringExpenseMonthlyAmt(it,year,month,salonId){
  const taxable=effectiveTaxableAmountFor(it,year,month);
  const divisor=recurringDivisorOf(it);
  // Supply of electrical energy is exempt from GST (Notification 2/2017-Central Tax (Rate)) — no
  // GST charged directly, and no Reverse Charge either, unlike every other expense type here.
  // GST/RCM always adds through to the Invoice Value here regardless of this outlet's GST Input
  // Credit setting (Master Sheet → Edit Salon → GST Input Tax Credit) — that setting affects
  // whether the GST portion is ALSO tracked as separately recoverable elsewhere, not whether it's
  // a real cash cost in the first place. See "GST & Reverse Charge on Recurring Expenses" in Help.
  const gstAmt=it.expenseName==='Electricity Expenses'?0:(it.gstApplicable?(Number(it.gstAmount)||0):(it.gstReverseChargeApplicable?taxable*0.18:0));
  const effectiveAmt=taxable+gstAmt;
  return effectiveAmt/divisor;
}
// Electricity and Telephone/Internet bills genuinely vary every billing cycle — unlike Rent,
// there's no sensible way to "increment" toward a real figure, so instead of silently re-using
// last period's amount forever, this flags when it's time to go check the new bill and update it.
// "Stale" means: the most recent Invoice Creation Day has passed, and the Amount hasn't been
// touched since before that day.
function mostRecentInvoiceCreationDate(day,asOf){
  const d=Number(day);
  if(!d||d<1||d>31)return null;
  const today=asOf||new Date();
  const thisMonthDate=new Date(today.getFullYear(),today.getMonth(),Math.min(d,new Date(today.getFullYear(),today.getMonth()+1,0).getDate()));
  if(thisMonthDate<=today)return thisMonthDate;
  return new Date(today.getFullYear(),today.getMonth()-1,Math.min(d,new Date(today.getFullYear(),today.getMonth(),0).getDate()));
}
function needsAmountUpdate(it,asOf){
  const dayField=it.expenseName==='Electricity Expenses'?it.invoiceCreationDay:it.expenseName==='Telephone & Internet Expenses'?it.telephoneInvoiceCreationDay:null;
  if(!dayField)return false;
  const lastInvoiceDate=mostRecentInvoiceCreationDate(dayField,asOf);
  if(!lastInvoiceDate)return false;
  if(!it.amountUpdatedOn)return true; // never confirmed at all — definitely flag it
  const updated=new Date(it.amountUpdatedOn+'T00:00:00');
  return isNaN(updated)||updated<lastInvoiceDate;
}

// ── Variable recurring bills (Electricity, Telephone… — amount unknown until the bill comes) ──
// A recurring item with amountType 'Variable' takes its P&L figure from the ACTUAL bills: each bill
// (the payee's Vendor Sheet invoices — those entered with "Enter bill" carry recurringId; the
// standing "REC-" invoice is not a bill) is spread evenly over the months it covers — its own periodFrom/periodTo (YYYY-MM) when
// given, otherwise the N months of the frequency ending the month BEFORE the bill (billFor
// 'previous', usual for electricity) or ending the bill's own month (billFor 'current'). Months no
// bill covers yet get an estimate: the average monthly cost of the last 3 bills, or the item's own
// amount ÷ N while there is no bill history.
const RECURRING_PERIOD_MONTHS={Monthly:1,'Bi-Monthly':2,Quarterly:3,'Half-Yearly':6,Yearly:12};
function isVariableRecurring(it){return !!it&&it.amountType==='Variable';}
// Items whose P&L comes from their actual bills spread over the months each bill covers: every
// Variable item, and every Fixed item billed less often than monthly (Bi-Monthly, Quarterly,
// Half-Yearly, Yearly). For a Fixed one, a bill with no period of its own covers the N months ending
// in the bill's own month (a Bi-Monthly bill dated in September = August + September), and months no
// bill covers yet carry the usual estimate (amount ÷ N) — so the earlier month is already on the P&L
// and the bill only replaces the estimate, instead of the whole bill landing in one month on top of it.
function isSpreadRecurring(it){return isVariableRecurring(it)||recurringMonthsOf(it)>1;}
function monthIndexOfIso(iso){const m=/^(\d{4})-(\d{2})/.exec(iso||'');return m?Number(m[1])*12+Number(m[2])-1:null;}
// A bill's own period (YYYY-MM from / to) → {first,last,months} when it covers 2–24 months, else null.
function billSplitMonths(periodFrom,periodTo){
  const a=monthIndexOfIso(periodFrom),b=monthIndexOfIso(periodTo);
  if(a==null||b==null||b<a||b-a>23)return null;
  return{first:a,last:b,months:b-a+1};
}
// A bill's amount per month: equal shares, or — when an amount for the 1st month is given (bi-monthly
// electricity read from the meter, say) — that amount in the first month and the rest shared equally.
function billShares(total,months,first){
  total=Number(total)||0;months=Math.max(1,months|0);
  const f=Number(first);
  if(months>1&&f>0&&f<total){const rest=(total-f)/(months-1);return[f,...Array(months-1).fill(rest)];}
  return Array(months).fill(total/months);
}
// "₹4,300 ÷ 2 = ₹2,150 in each month: Aug 2026 ₹2,150 · Sep 2026 ₹2,150", or with a 1st-month amount
// "₹4,300: Aug 2026 ₹2,000 (1st month) · Sep 2026 ₹2,300 (rest)".
function billSplitText(total,sp,first){
  if(!sp||sp.months<2||!(total>0))return'';
  const sh=billShares(total,sp.months,first),equal=sh.every(x=>Math.abs(x-sh[0])<0.01);
  const parts=sh.map((x,i)=>monthLabelOfIndex(sp.first+i)+' '+rupee(Math.round(x*100)/100));
  return equal?rupee(total)+' ÷ '+sp.months+' = '+rupee(Math.round(sh[0]*100)/100)+' in each month: '+parts.join(' · ')
    :rupee(total)+': '+parts.map((p,i)=>p+(i===0?' (1st month)':'')).join(' · ');
}
// For a recurring item with an amount for the 1st month of each cycle: how much of the per-month
// average this month carries (1st month of the cycle vs the others). 1 when split equally.
function recurringSplitFactor(it,t){
  const N=recurringMonthsOf(it),tot=Number(it&&it.amount)||0,f=Number(it&&it.firstMonthAmt)||0;
  if(N<2||!(tot>0)||!(f>0)||f>=tot)return 1;
  const start=monthIndexOfIso(it.startDate);
  const anchor=start!=null?start:(recurringBillTiming(it)==='arrears'?-1:0);
  const pos=(((t-anchor)%N)+N)%N;
  return pos===0?N*f/tot:N*(tot-f)/(tot*(N-1));
}
function monthLabelOfIndex(i){return['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][((i%12)+12)%12]+' '+Math.floor(i/12);}
function variableRecurringBills(it,salonId){
  const payee=String(it.payee||'').trim().toLowerCase();
  const vendor=loadVendors(salonId).find(v=>String(v.name||'').trim().toLowerCase()===payee);
  if(!vendor)return[];
  return loadVendorInvoices(salonId)
    .filter(inv=>inv.vendorId===vendor.id&&inv.docNature!=='Performa Invoice'&&!String(inv.invoiceNo||'').startsWith('REC-')&&(!inv.recurringId||inv.recurringId===it.id))
    .map(inv=>{
      let first=monthIndexOfIso(inv.periodFrom),last=monthIndexOfIso(inv.periodTo);
      if(first==null||last==null||last<first){
        const bm=monthIndexOfIso(toISO(inv.invoiceDate));
        if(bm==null)return null;
        ({first,last}=recurringBillPeriodFor(it,bm));
      }
      const amount=Number(inv.amount)||0,months=last-first+1;
      const itTot=Number(it.amount)||0,itFirst=Number(it.firstMonthAmt)||0;
      const firstAmt=Number(inv.splitFirst)>0?Number(inv.splitFirst):(months>1&&itTot>0&&itFirst>0&&itFirst<itTot?amount*itFirst/itTot:null);
      const bookIdx=monthIndexOfIso(toISO(inv.bookingDate||inv.invoiceDate));
      return{inv,amount,first,last,months,shares:billShares(amount,months,firstAmt),bookIdx:bookIdx!=null?bookIdx:last};
    })
    .filter(Boolean).sort((a,b)=>a.last-b.last);
}
function variableRecurringEstimatePerMonth(it,bills){
  // The previous bill (the latest one known) is the basis — "August is estimated from July's bill".
  const prev=bills.slice().sort((a,b)=>a.last-b.last).pop();
  if(prev)return prev.amount/prev.months;
  return recurringExpenseMonthlyAmt(it); // no bill yet: the item's own amount spread over its period
}
// ── Accrual method for recurring bills (estimate → actual → reversal) ──
// Each month is recognised once and never restated:
//  • its bill is already booked (booking month ≤ that month) → the actual share;
//  • otherwise → an ESTIMATE from the previous bill known then (e.g. August from July's actual bill);
//  • in the month a bill is booked, every earlier month it covers is adjusted: actual share − amount
//    already claimed (the estimate), shown as that month's adjustment / reversal.
// So an Aug bill received in September: August shows the estimate, September shows its own amount +
// (August actual − August estimate). Advance bills (months after the booking month) take their shares.
function monthClosedAtIdx(salonId,t){
  const y=Math.floor(t/12),m=((t%12)+12)%12;
  const lock=monthLockRecordFor(salonId,y,m);
  const times=[];
  if(lock&&lock.locked&&lock.at)times.push(lock.at);
  try{const c=calToFYMI(y,m);const f=loadPnlFinal(salonId)[c.fy+'|'+c.mi];if(f&&f.final&&f.at)times.push(f.at);}catch(e){}
  return times.sort()[0]||null;
}
function monthClosedBeforeBill(salonId,t,inv){
  if(!inv||!inv.enteredAt)return false;
  const at=monthClosedAtIdx(salonId,t);
  return !!at&&at<inv.enteredAt;
}
// The estimate month t carried: from the latest bill already booked by then for an earlier month.
function recurringEstimateFor(it,bills,t,salonId){
  const start=monthIndexOfIso(it.startDate),end=monthIndexOfIso(it.endDate);
  if((start!=null&&t<start)||(end!=null&&t>end))return{amt:0,basis:null};
  const ym=Math.floor(t/12)+'-'+String(t%12+1).padStart(2,'0');
  const ov=it.estimateOverrides&&it.estimateOverrides[ym];
  if(ov!=null&&ov!=='')return{amt:Number(ov)||0,basis:null,manual:true}; // set by hand in 📒 Register
  const known=bills.filter(b=>b.bookIdx<=t&&b.last<t).sort((a,b)=>a.last-b.last||a.bookIdx-b.bookIdx);
  const prev=known[known.length-1]||null;
  const f=recurringSplitFactor(it,t);
  if(prev&&isVariableRecurring(it))return{amt:prev.amount/prev.months*f,basis:prev};
  return{amt:(isVariableRecurring(it)?recurringExpenseMonthlyAmt(it):recurringExpenseMonthlyAmt(it,Math.floor(t/12),t%12,salonId))*f,basis:prev};
}
function variableRecurringEstimateAsOf(it,bills,t,salonId){return recurringEstimateFor(it,bills,t,salonId).amt;}
// One month of the accrual register — everything the audit trail needs.
function recurringAccrualRow(it,salonId,t,bills){
  bills=bills||variableRecurringBills(it,salonId);
  const covering=bills.filter(b=>t>=b.first&&t<=b.last);
  const bookedByNow=covering.filter(b=>b.bookIdx<=t),bookedLater=covering.filter(b=>b.bookIdx>t);
  const est=recurringEstimateFor(it,bills,t,salonId);
  let own,estimated=null,claimed;
  if(bookedByNow.length){own=bookedByNow.reduce((x,b)=>x+b.shares[t-b.first],0);claimed=own;}
  else{own=est.amt;estimated=est.amt;claimed=est.amt;}
  const actual=covering.length?covering.reduce((x,b)=>x+b.shares[t-b.first],0):null;
  const later=bookedLater.length&&!bookedByNow.length?bookedLater.reduce((a,b)=>a.bookIdx<b.bookIdx?a:b):null;
  const adjustmentLater=later?{amount:actual-claimed,bookedIn:later.bookIdx,bill:later}:null;
  // Adjustments booked in THIS month for earlier months covered by bills booked now.
  const adjustmentsHere=[];
  bills.filter(b=>b.bookIdx===t).forEach(b=>{
    for(let c=b.first;c<=Math.min(b.last,t-1);c++){
      const prior=bills.filter(x=>x!==b&&c>=x.first&&c<=x.last&&x.bookIdx<=c);
      if(prior.length)continue; // that month already had its actual — nothing to reverse
      const e=recurringEstimateFor(it,bills,c,salonId).amt,share=b.shares[c-b.first];
      adjustmentsHere.push({month:c,actual:share,claimed:e,diff:share-e,bill:b});
    }
  });
  const recognized=own+adjustmentsHere.reduce((x,a)=>x+a.diff,0);
  return{month:t,basis:est.basis,manual:!!est.manual,estimated,actual,actualBills:covering,claimed,adjustmentLater,adjustmentsHere,recognized,
    own,bookedByNow};
}
function recurringAccrualRegister(it,salonId,fromIdx,toIdx){
  const bills=variableRecurringBills(it,salonId);const out=[];
  for(let t=fromIdx;t<=toIdx;t++)out.push(recurringAccrualRow(it,salonId,t,bills));
  return out;
}
function variableRecurringMonthAmt(it,salonId,year,month){
  const t=year*12+month;
  const bills=variableRecurringBills(it,salonId);
  const r=recurringAccrualRow(it,salonId,t,bills);
  const covering=r.bookedByNow.slice();
  r.adjustmentsHere.forEach(a=>{if(!covering.includes(a.bill))covering.push(a.bill);});
  return{amt:r.recognized,actual:covering.length>0,bills,covering,
    trueUps:r.adjustmentsHere.map(a=>({month:a.month,share:a.actual,provision:a.claimed,diff:a.diff,bill:a.bill})),
    provision:r.estimated!=null,basis:r.basis,row:r};
}
// The latest billing period that has ended with no bill entered yet — {first,last} or null.
function variableRecurringMissingPeriod(it,salonId,asOf){
  if(!isVariableRecurring(it)||it.status!=='Active')return null;
  const d=asOf||new Date();
  const N=recurringMonthsOf(it);
  const bills=variableRecurringBills(it,salonId);
  const now=d.getFullYear()*12+d.getMonth();
  const lastCovered=bills.length?bills[bills.length-1].last:(monthIndexOfIso(it.startDate)!=null?monthIndexOfIso(it.startDate)-1:now-N-1);
  const first=lastCovered+1,last=first+N-1;
  return last<now?{first,last}:null; // that period is over, and its bill hasn't been entered
}
function recurringExpenseMonthlySumFor(salonId,recurringTypeName,year,month){
  return loadRecurringExpenses(salonId).filter(it=>it.status==='Active'&&recurringExpenseNameOf(it)===recurringTypeName&&!isSpreadRecurring(it))
    .reduce((s,it)=>s+recurringExpenseMonthlyAmt(it,year,month,salonId),0);
}
// Variable items of a recurring type for one month: their total, per-item detail, and the vendor
// invoices already counted through them (so the plain "invoices booked this month" figure doesn't
// count those bills a second time).
function variableRecurringSumFor(salonId,recurringTypeName,year,month){
  const rows=[];const used=new Set();let amt=0;
  const allInvoices=loadVendorInvoices(salonId);
  loadRecurringExpenses(salonId).filter(it=>it.status==='Active'&&recurringExpenseNameOf(it)===recurringTypeName&&isSpreadRecurring(it)).forEach(it=>{
    const r=variableRecurringMonthAmt(it,salonId,year,month);
    r.bills.forEach(b=>used.add(b.inv.id));
    allInvoices.forEach(inv=>{if(inv.invoiceNo==='REC-'+it.id)used.add(inv.id);}); // a standing invoice from when it was Fixed
    amt+=r.amt;rows.push({it,amt:r.amt,actual:r.actual,covering:r.covering,trueUps:r.trueUps,provision:r.provision});
  });
  return{amt,rows,used};
}
// ── Automatic monthly invoices for Fixed recurring expenses (automation phase 3; outlet switch
// "Create recurring invoices automatically", Master Sheet → outlet → Vendor Invoices). For each
// Active, Fixed, Monthly item: one invoice per month in Vendor Sheet, id = invoice no =
// REC-<item id>-<YYYY-MM> (the same on every device, so two people opening the app on the 1st can
// never create it twice — saves merge records by id). Dated the 1st, due on the item's due day,
// amount = that month's taxable (increments applied) + forward-charge GST; TDS as an auto payment
// line like the standing REC- invoice. Looks at this month and last month only, and skips a month
// that already has any invoice from that vendor (booked by hand, or the standing REC- invoice), so
// the P&L — where a Rent/Maintenance/… invoice replaces that month's accrual — never counts twice.
// Monthly only: a quarterly bill would land whole in one month while the other months still accrue.
function autoRecurringInvoicesDue(salonId,asOf){
  if(!outletSettings(salonId).autoRecurringInvoices)return{create:[],needVendor:[]};
  const now=asOf||new Date();
  const vendors=loadVendors(salonId),invoices=loadVendorInvoices(salonId);
  const have=new Set(invoices.map(i=>i.id));
  const create=[],needVendor=[];
  const pad=n=>String(n).padStart(2,'0');
  loadRecurringExpenses(salonId).forEach(it=>{
    if(it.status!=='Active'||isVariableRecurring(it)||(it.frequency||'Monthly')!=='Monthly')return;
    const payee=String(it.payee||'').trim().toLowerCase();
    const vendor=payee&&(vendors.find(v=>String(v.name||'').trim().toLowerCase()===payee)
      ||vendors.find(v=>{const n=String(v.name||'').toLowerCase();return n&&(n.includes(payee)||payee.includes(n));}));
    [-1,0].forEach(off=>{
      const d=new Date(now.getFullYear(),now.getMonth()+off,1),y=d.getFullYear(),m=d.getMonth();
      const code=y+'-'+pad(m+1),t=y*12+m;
      const start=monthIndexOfIso(it.startDate),end=monthIndexOfIso(it.endDate);
      if((start!=null&&t<start)||(end!=null&&t>end))return;
      const id='REC-'+it.id+'-'+code;
      if(have.has(id))return;
      if(!vendor){if(off===0)needVendor.push(recurringExpenseNameOf(it)+' ('+(it.payee||'no payee')+')');return;}
      const booked=invoices.some(inv=>inv.vendorId===vendor.id&&inv.docNature!=='Performa Invoice'&&monthIndexOfIso(toISO(inv.invoiceDate))===t);
      if(booked)return;
      const base=Number(it.amount)||0;
      const taxable=Math.round(effectiveTaxableAmountFor(it,y,m)*100)/100;
      const gst=it.expenseName==='Electricity Expenses'||!it.gstApplicable?0:Math.round((Number(it.gstAmount)||0)*(base>0?taxable/base:1)*100)/100;
      const tds=it.tdsApplicable?Math.round(taxable*(Number(it.tdsRate)||0)/100):0;
      const days=new Date(y,m+1,0).getDate();
      const dmy=dd=>pad(dd)+'/'+pad(m+1)+'/'+y;
      const invDate=dmy(1);
      create.push({id,invoiceNo:id,recurringId:it.id,vendorId:vendor.id,docNature:'Tax Invoice',invoiceDate:invDate,bookingDate:invDate,
        dueDate:dmy(Math.min(Math.max(1,Number(it.dueDay)||1),days)),taxable,
        // GST by supply type: different states → IGST; same state (or a GSTIN missing) → CGST + SGST.
        ...(gst?(gstSupplyTypeFor(salonId,vendor.gst)==='inter'?{igst:gst,cgst:'',sgst:''}:{igst:'',cgst:Math.round(gst*50)/100,sgst:Math.round((gst-Math.round(gst*50)/100)*100)/100}):{igst:'',cgst:'',sgst:''}),
        roundOff:'',freight:'',amount:Math.round((taxable+gst)*100)/100,
        tdsAmt:tds,tdsSection:it.tdsApplicable?(it.tdsSection||''):'',tdsRate:it.tdsApplicable?(it.tdsRate||''):'',
        category:recurringVendorCategoryFor(it.expenseName),desc:'Auto invoice: '+recurringExpenseNameOf(it)+' for '+MONTH_NAMES_SHORT_[m]+' '+y,attachment:null,linkedPI:'',assetLines:[],
        payments:tds>0?[{id:'TDS-'+id,paidAmount:tds,paidDate:y+'-'+pad(m+1)+'-01',mode:'TDS',ref:'',note:'TDS deducted at source ('+(it.tdsSection||'—')+' @ '+(Number(it.tdsRate)||0)+'%) — remitted to the government, not paid to the vendor'}]:[],
        autoCreated:true});
    });
  });
  return{create,needVendor};
}
// Same mapping as the Recurring Expenses sheet uses for its payee vendor and standing REC- invoice.
function recurringVendorCategoryFor(expenseName){
  const same=['DG Rent','Drycleaning Expenses','Professional Fee','Staff Room Rent','Rent','Royalty','Electricity Expenses','Telephone & Internet Expenses','Uniform Expenses'];
  if(same.indexOf(expenseName)!==-1)return expenseName;
  if(expenseName==='Maintenance Expenses'||expenseName==='Maintenance Bill')return'Maintenance Expenses';
  if(expenseName==='Diesel Expenses')return'Utilities';
  if(expenseName==='Marketing Expenses')return'Marketing';
  return'Other';
}
const MONTH_NAMES_SHORT_=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// Creates what autoRecurringInvoicesDue finds. Returns the invoices created.
function autoCreateRecurringInvoices(salonId,asOf){
  const due=autoRecurringInvoicesDue(salonId,asOf);
  if(due.create.length)saveVendorInvoices([...loadVendorInvoices(salonId),...due.create],salonId,{system:true});
  return due;
}
function operatingExpensesFor(salonId,year,month){
  const lines=PL_OPEX_LINES.filter(l=>!l.biz||l.biz===bizKeyOf(salonId)).map(l=>{
    if(l.fn)return{name:l.name,amt:Math.round(l.fn(salonId,year,month)||0)};
    let amt=l.noDaily?0:(l.row?dailySalesRowSumFor(salonId,year,month,l.row):dailySalesGroupSumFor(salonId,year,month,l.group));
    if(l.alsoNature)amt+=bankStatementNatureDebitSumFor(salonId,year,month,l.alsoNature);
    const recurringType=PL_OPEX_RECURRING_MAP[l.name];
    const recurringAmt=recurringType?recurringExpenseMonthlySumFor(salonId,recurringType,year,month):0;
    const variable=recurringType?variableRecurringSumFor(salonId,recurringType,year,month):{amt:0,used:new Set()};
    const vendorAmt=l.alsoVendorCat?vendorInvoiceCategorySumFor(salonId,year,month,l.alsoVendorCat,variable.used):0;
    amt+=variable.amt; // variable bills: actual bills spread over their months, estimates for the rest
    if(l.vendorWinsOverRecurring){
      // A real invoice this month is more accurate than the estimate — use it instead of adding
      // to it. Falls back to the Recurring Expenses estimate only when no invoice exists yet.
      amt+=vendorAmt>0?vendorAmt:recurringAmt;
    }else{
      amt+=vendorAmt+recurringAmt;
    }
    // Net Bank Charges from Collection Sheet's Reco table — added straight through, no sign
    // flip: a positive Net Bank Charges there lands here as a positive expense, a negative one
    // reduces this line.
    if(l.alsoNetBankCharges)amt+=netBankChargesFor(salonId,year,month);
    if(l.credit)amt=-amt; // money recovered, not spent — reduces the section total instead of adding to it
    return{name:l.name,amt};
  });
  const tot=lines.reduce((s,l)=>s+l.amt,0);
  return{lines,tot};
}
// Annexure data for a single Operating Expenses line — the recurring commitments that feed it,
// plus what Daily Sales & Exp (and Bank Statement, for Bank Charges) contributed this month.
// dailyAmt is still returned (and shown) even for noDaily lines, so a payment recorded there
// stays visible for reference — dailyExcluded just tells the popup not to fold it into the P&L
// total, since that would double-count against the Recurring Expenses accrual for that line.
function operatingExpenseAnnexureFor(salonId,year,month,lineName){
  const line=PL_OPEX_LINES.find(l=>l.name===lineName);
  if(!line)return null;
  const recurringType=PL_OPEX_RECURRING_MAP[lineName];
  const recurring=recurringType?loadRecurringExpenses(salonId).filter(it=>recurringExpenseNameOf(it)===recurringType):[];
  const dailyAmt=line.row?dailySalesRowSumFor(salonId,year,month,line.row):dailySalesGroupSumFor(salonId,year,month,line.group);
  const bankAmt=line.alsoNature?bankStatementNatureDebitSumFor(salonId,year,month,line.alsoNature):0;
  const variable=recurringType?variableRecurringSumFor(salonId,recurringType,year,month):{amt:0,rows:[],used:new Set()};
  const vendorAmt=line.alsoVendorCat?vendorInvoiceCategorySumFor(salonId,year,month,line.alsoVendorCat,variable.used):0;
  const recoAmt=line.alsoNetBankCharges?netBankChargesFor(salonId,year,month):0;
  const recurringTotalRaw=recurring.filter(it=>it.status==='Active'&&!isSpreadRecurring(it)).reduce((s,it)=>s+recurringExpenseMonthlyAmt(it,year,month,salonId),0);
  const vendorWins=!!line.vendorWinsOverRecurring&&vendorAmt>0;
  // Group-based lines (no single `row`) can bundle several distinct Daily Sales & Exp rows under
  // one P&L line — e.g. "Daily Expenses" folds in Pentry, Water, Conveyance, Stationary, etc. This
  // breaks that combined total back out per row, same rows/order as Daily Sales & Exp itself, so
  // the annexure shows exactly what's behind the number instead of just the bundled sum.
  const dailyRows=line.row?[]:EXPENSE_ROWS.filter(r=>r.group===line.group).map(r=>({name:r.name,amt:dailySalesRowSumFor(salonId,year,month,r.name)}));
  return{lineName,recurring,dailyAmt,dailyRows,dailyExcluded:!!line.noDaily,bankAmt,vendorAmt,recoAmt,isCredit:!!line.credit,
    recurringTotal:(vendorWins?0:recurringTotalRaw)+variable.amt,recurringTotalRaw,vendorWinsOverRecurring:!!line.vendorWinsOverRecurring,vendorWins,
    variableAmt:variable.amt,variableRows:variable.rows};
}