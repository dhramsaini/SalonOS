// ── Owner Insights (sidebar → 💡 Owner Insights) — a phone-first overview for the owner, built only
// from data SalonOS already has, for the outlets this login may see:
//   • Today: sales / expenses / staff present per outlet, month-to-date against the outlet's target
//   • Forecast: where this month will close (weekday pattern of the last 8 weeks) and an estimate
//     for next month (last 3 months, adjusted by last year's season when there is a year of data)
//   • Bills due in the next 7 days (and overdue)
//   • Staff scorecard: target achievement, attendance and sales per ₹ of pay, as one score
//   • Month-end pack: one PDF (summary, P&L, salary, staff, vendor dues) for an outlet and month
// Each card respects the sheet permissions in User Management (a card is left out for an outlet whose
// source sheet this login can't view). Monthly sales targets: kv salonos_sales_target_outlet_<id>
// {"YYYY-MM": amount}, set here by anyone who can edit that outlet's Daily Sales.
// Loaded before js/14 (which starts the app), so the page exists before the first render.

const INS_MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const insPad=n=>String(n).padStart(2,'0');
const insIso=(y,m,d)=>y+'-'+insPad(m+1)+'-'+insPad(d);
const insDaysIn=(y,m)=>new Date(y,m+1,0).getDate();
const insInr=v=>'₹'+Math.round(Number(v)||0).toLocaleString('en-IN');
function insReadJson(key,dflt){try{const v=JSON.parse(cachedLocalGet(key)||'null');return v==null?dflt:v;}catch(e){return dflt;}}

// One day of Daily Sales & Exp.: collection rows 0–4 = Cash, Card, UPI, Luzo, Outstanding sale (same
// reading as the server's reports); expenses are every value in the other daily record.
function insDayFigures(sid,iso){
  const s=(insReadJson(outletKey('salonos_daily_sales_collection_data',sid),{})||{})[iso];
  const e=(insReadJson(outletKey('salonos_daily_sales_data',sid),{})||{})[iso];
  const n=v=>Number(v)||0;
  const entered=!!(s&&typeof s==='object'&&Object.values(s).some(v=>String(v==null?'':v)!==''));
  const r=s||{};
  const cash=n(r[0]),card=n(r[1]),upi=n(r[2]),luzo=n(r[3]),osale=n(r[4]);
  const exp=e&&typeof e==='object'?Object.values(e).reduce((t,v)=>t+n(v),0):0;
  return{entered,cash,card,upi,luzo,osale,sales:cash+card+upi+luzo+osale,exp};
}
function insMonthSales(sid,y,m,uptoDay){
  let sales=0,exp=0,days=0;
  const last=Math.min(uptoDay||insDaysIn(y,m),insDaysIn(y,m));
  for(let d=1;d<=last;d++){const f=insDayFigures(sid,insIso(y,m,d));sales+=f.sales;exp+=f.exp;if(f.entered)days++;}
  return{sales,exp,days};
}
function insTargets(sid){return insReadJson(outletKey('salonos_sales_target',sid),{})||{};}
function insTargetFor(sid,y,m){return Number(insTargets(sid)[y+'-'+insPad(m+1)])||0;}
function insSaveTarget(sid,y,m,amount){
  const t={...insTargets(sid)};const k=y+'-'+insPad(m+1);
  if(Number(amount)>0)t[k]=Math.round(Number(amount));else delete t[k];
  safeLocalSet(outletKey('salonos_sales_target',sid),JSON.stringify(t));
}

// Where this month will close. Days already entered count as they are; every day still to come
// (today too, if today isn't entered yet) is estimated from the average of the same weekday over
// the last 8 weeks (at least 2 entries), else the average entered day of the last 28 days.
// Past days with no entry are counted as 0 and reported (missingDays) — they may be closed days.
function insForecastMonth(sid,y,m,today){
  const dim=insDaysIn(y,m);
  const cur=today.getFullYear()===y&&today.getMonth()===m;
  const past=new Date(y,m,dim)<new Date(today.getFullYear(),today.getMonth(),today.getDate());
  const tDay=cur?today.getDate():past?dim:0;
  let mtd=0,entered=0,missingDays=0;
  const todayFig=cur?insDayFigures(sid,insIso(y,m,tDay)):null;
  for(let d=1;d<=tDay;d++){
    const f=insDayFigures(sid,insIso(y,m,d));
    mtd+=f.sales;
    if(f.entered)entered++;else if(!(cur&&d===tDay))missingDays++;
  }
  const byDow={},recent=[];
  for(let back=1;back<=56;back++){
    const d=new Date(today.getFullYear(),today.getMonth(),today.getDate()-back);
    const f=insDayFigures(sid,insIso(d.getFullYear(),d.getMonth(),d.getDate()));
    if(!f.entered)continue;
    (byDow[d.getDay()]=byDow[d.getDay()]||[]).push(f.sales);
    if(back<=28)recent.push(f.sales);
  }
  const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
  const dayAvg=recent.length?avg(recent):(entered?mtd/entered:0);
  let rest=0,usedPattern=false;
  const from=cur?(todayFig.entered?tDay+1:tDay):past?dim+1:1;
  for(let d=from;d<=dim;d++){
    const w=byDow[new Date(y,m,d).getDay()];
    if(w&&w.length>=2){rest+=avg(w);usedPattern=true;}else rest+=dayAvg;
  }
  const daysLeft=Math.max(0,dim-from+1);
  return{mtd,entered,missingDays,daysLeft,projected:Math.round(mtd+rest),
    basis:past||!daysLeft?'all days in':usedPattern?'weekday pattern of the last 8 weeks':'average day of the last 4 weeks'};
}

// Next month: average of the last 3 complete months that have at least 15 days entered; when the
// same months a year earlier (and next month a year earlier) have data too, adjusted by how next
// month compared with them last year (factor kept between 0.5 and 2).
function insNextMonthEstimate(sid,today){
  const y=today.getFullYear(),m=today.getMonth();
  const mon=(k)=>{const d=new Date(y,m+k,1);return{y:d.getFullYear(),m:d.getMonth()};};
  const full=(p)=>{const r=insMonthSales(sid,p.y,p.m);return r.days>=15?r.sales:null;};
  const base=[-1,-2,-3].map(k=>full(mon(k))).filter(v=>v!=null);
  if(!base.length)return{estimate:null,basis:'needs at least one full month of daily sales'};
  const baseAvg=base.reduce((s,v)=>s+v,0)/base.length;
  const lyNext=full(mon(-11));
  const lyBase=[-13,-14,-15].map(k=>full(mon(k))).filter(v=>v!=null);
  if(lyNext!=null&&lyBase.length){
    const f=Math.min(2,Math.max(0.5,lyNext/(lyBase.reduce((s,v)=>s+v,0)/lyBase.length)));
    return{estimate:Math.round(baseAvg*f),basis:'last '+base.length+' month'+(base.length>1?'s':'')+' × last year\'s season ('+(f>=1?'+':'')+Math.round((f-1)*100)+'%)'};
  }
  return{estimate:Math.round(baseAvg),basis:'average of the last '+base.length+' month'+(base.length>1?'s':'')};
}

// Vendor bills (not PIs) with money still owed, due within `ahead` days or already overdue.
function insVendorDues(sid,today,ahead){
  const t0=new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime();
  const vendors=loadVendors(sid);
  const out=[];
  loadVendorInvoices(sid).forEach(inv=>{
    if(!inv||inv.docNature==='Performa Invoice')return;
    const bal=(Number(inv.amount)||0)-(inv.payments||[]).reduce((s,p)=>s+(Number(p.paidAmount)||0),0);
    if(bal<=0.5)return;
    const iso=toISO(inv.dueDate);if(!iso)return;
    const [yy,mm,dd]=iso.split('-').map(Number);
    const days=Math.round((new Date(yy,mm-1,dd).getTime()-t0)/864e5);
    if(days>(ahead==null?7:ahead))return;
    const v=vendors.find(x=>String(x.id)===String(inv.vendorId));
    out.push({vendor:(v&&v.name)||inv.vendorName||String(inv.vendorId||'—'),invoiceNo:inv.invoiceNo||'',due:iso,days,bal:Math.round(bal)});
  });
  return out.sort((a,b)=>a.days-b.days);
}

// Staff scorecard for one outlet and month. Sales and targets from Incentive Working (targets and
// pay pro-rated to the days gone in the current month); attendance = worked ÷ working days marked
// (weekly offs / holidays left out; half day = 0.5). Score out of 100 = 50% target achievement (120%
// or more = full marks), 30% attendance, 20% sales per ₹ of pay (4× pay = full marks); a part with no
// data is left out and the others re-weighted.
function insStaffScores(sid,y,m,today){
  const dim=insDaysIn(y,m);
  const cur=today.getFullYear()===y&&today.getMonth()===m;
  const elapsed=cur?today.getDate():dim;
  const share=elapsed/dim;
  const att=loadAttendance(sid)||{};
  return incWorkingsFor(sid,y,m).map(w=>{
    const days=((att[attMonthKey(w.id,y,m)]||{}).days)||[];
    let worked=0,working=0;
    for(let i=0;i<elapsed;i++){const v=days[i];if(v==='present'){worked++;working++;}else if(v==='half'){worked+=0.5;working++;}else if(v==='absent')working++;}
    const attPct=working?worked/working*100:null;
    const sales=Number(w.totalActual)||0;
    const target=(Number(w.totalTarget)||0)*share;
    const achPct=target>0?sales/target*100:null;
    const pay=(Number(w.salary)||0)*share+(Number(w.totalInc)||0);
    const perPay=pay>0&&sales>0?sales/pay:null;
    const parts=[[achPct==null?null:Math.min(achPct,120)/120*100,0.5],[attPct,0.3],[perPay==null?null:Math.min(perPay/4,1)*100,0.2]].filter(p=>p[0]!=null);
    const wsum=parts.reduce((s,p)=>s+p[1],0);
    const score=wsum?Math.round(parts.reduce((s,p)=>s+p[0]*p[1],0)/wsum):null;
    return{id:w.id,name:w.name,desig:w.desig,sales:Math.round(sales),target:Math.round(target),achPct:achPct==null?null:Math.round(achPct),
      attPct:attPct==null?null:Math.round(attPct),pay:Math.round(pay),perPay:perPay==null?null:Math.round(perPay*10)/10,score};
  }).sort((a,b)=>(b.score==null?-1:b.score)-(a.score==null?-1:a.score));
}

// Month-end pack rows for exportReportPdfBlob (a blank row separates the tables).
function insMonthPackRows(salon,y,m,today,canSee){
  const sid=Number(salon.id);
  const rows=[];
  const ms=insMonthSales(sid,y,m);
  const tgt=insTargetFor(sid,y,m);
  if(canSee('daily-sales')){
    rows.push(['Summary'],['Item','Amount']);
    rows.push(['Sales (Daily Sales & Exp.)',insInr(ms.sales)],['Expenses (Daily Sales & Exp.)',insInr(ms.exp)],['Days with sales entered',ms.days+' of '+insDaysIn(y,m)]);
    if(tgt)rows.push(['Sales target',insInr(tgt)],['Achieved',Math.round(ms.sales/tgt*100)+'%']);
    rows.push([]);
  }
  if(canSee('outlet-pnl')){
    const p=calToFYMI(y,m);const d=plBuild(sid,p.fy,p.mi);
    rows.push(['Profit & Loss'],['Line','Amount']);
    d.sections.forEach(S=>{rows.push([S.sec,insInr(S.tot)]);(S.lines||[]).filter(l=>l.amt).forEach(l=>rows.push(['   '+l.name,insInr(l.amt)]));});
    (d.below||[]).filter(l=>l.amt).forEach(l=>rows.push([l.name,insInr(l.amt)]));
    rows.push(['Revenue',insInr(d.revenue)],['EBITDA',insInr(d.ebitda)],['Profit before tax',insInr(d.pbt)]);
    rows.push([]);
  }
  if(canSee('salary-working')){
    const sw=swWorkingsFinalFor(sid,y,m);
    if(sw.length){
      rows.push(['Salary'],['Employee','Days payable','Gross','Deductions','Net pay']);
      let g=0,n=0;
      sw.forEach(w=>{const gross=Math.round(w.grossAfterLop||0),net=Math.round(w.net||0);g+=gross;n+=net;
        rows.push([w.name,String(w.totalDays)+' / '+String(w.daysInMonth),insInr(gross),insInr((w.pfEmp||0)+(w.esicEmp||0)+(w.ptAmt||0)+(w.tdsAmt||0)+(w.advAdj||0)+(w.penAmt||0)),insInr(net)]);});
      rows.push(['Total','',insInr(g),'',insInr(n)]);
      rows.push([]);
    }
  }
  if(canSee('incentive-working')&&canSee('salary-working')){
    const sc=insStaffScores(sid,y,m,today);
    if(sc.length){
      rows.push(['Staff scorecard'],['Employee','Sales','Target','Achieved','Attendance','Sales ÷ pay','Score']);
      sc.forEach(r=>rows.push([r.name,insInr(r.sales),r.target?insInr(r.target):'—',r.achPct==null?'—':r.achPct+'%',r.attPct==null?'—':r.attPct+'%',r.perPay==null?'—':r.perPay+'×',r.score==null?'—':String(r.score)]));
      rows.push([]);
    }
  }
  if(canSee('vendors')){
    const dues=insVendorDues(sid,today,3650);
    rows.push(['Vendor bills outstanding'],['Vendor','Invoice','Due','Balance']);
    if(dues.length){dues.forEach(x=>rows.push([x.vendor,x.invoiceNo,x.due.split('-').reverse().join('/')+(x.days<0?' (overdue)':''),insInr(x.bal)]));
      rows.push(['Total','','',insInr(dues.reduce((s,x)=>s+x.bal,0))]);}
    else rows.push(['None','','','']);
  }
  return rows;
}

function OwnerInsights({accessibleSalons,user}){
  const h=React.createElement;
  const {success,error:toastError}=useToast();
  const today=new Date();
  const salons=(accessibleSalons||[]).filter(s=>s.status==='Active');
  const [sel,setSel]=useState('all');
  const [ym,setYm]=useState(()=>({y:today.getFullYear(),m:today.getMonth()}));
  const [tick,setTick]=useState(0);
  const [editTarget,setEditTarget]=useState(null); // {sid, value}
  const [busy,setBusy]=useState(false);
  const shown=sel==='all'?salons:salons.filter(s=>String(s.id)===String(sel));
  const can=(sid,sheet)=>userCanViewSheet(user,sid,sheet);
  const short=s=>String(s.name||'').split('—')[0].trim();
  const monthOpts=[];for(let k=0;k<12;k++){const d=new Date(today.getFullYear(),today.getMonth()-k,1);monthOpts.push({y:d.getFullYear(),m:d.getMonth()});}
  const ty=today.getFullYear(),tm=today.getMonth(),td=today.getDate();
  const todayIso=insIso(ty,tm,td);

  const pct=(a,b)=>b?Math.round(a/b*100):null;
  const bar=(p,color)=>h('div',{className:'progress',style:{marginTop:6}},h('div',{className:'progress-fill',style:{width:Math.min(100,Math.max(0,p||0))+'%',background:color||'var(--accent)'}}));

  // ── Today ──
  const todayCards=shown.map(s=>{
    const sid=Number(s.id);
    const salesOk=can(sid,'daily-sales'),attOk=can(sid,'attendance');
    const f=salesOk?insDayFigures(sid,todayIso):null;
    const mtd=salesOk?insMonthSales(sid,ty,tm,td):null;
    const lm=salesOk?insMonthSales(sid,new Date(ty,tm-1,1).getFullYear(),new Date(ty,tm-1,1).getMonth(),td):null;
    const tgt=salesOk?insTargetFor(sid,ty,tm):0;
    let a=null;
    if(attOk){
      const emps=getEmployeesForMonth(ty,tm,sid).filter(e=>e.status==='Active');
      const att=loadAttendance(sid)||{};
      a={staff:0,present:0,absent:0,half:0,off:0,unmarked:0};
      emps.forEach(e=>{
        if(e.doj&&toISO(e.doj)>todayIso)return;
        a.staff++;
        const v=((att[attMonthKey(e.id,ty,tm)]||{}).days||[])[td-1];
        if(v==='present')a.present++;else if(v==='absent')a.absent++;else if(v==='half')a.half++;else if(v==='off'||v==='holiday')a.off++;else a.unmarked++;
      });
    }
    return h('div',{key:sid,className:'card',style:{marginBottom:0}},
      h('div',{style:{fontWeight:700,fontSize:14,marginBottom:8}},short(s)),
      salesOk&&h(React.Fragment,null,
        h('div',{style:{fontSize:11.5,color:'var(--text3)'}},'Sales today'),
        h('div',{style:{fontSize:22,fontWeight:700,color:f.entered?'var(--text)':'var(--orange)'}},f.entered?insInr(f.sales):'Not entered yet'),
        f.entered&&h('div',{style:{fontSize:11.5,color:'var(--text3)'}},'Cash '+insInr(f.cash)+' · Card '+insInr(f.card)+' · UPI '+insInr(f.upi)+(f.luzo?' · Luzo '+insInr(f.luzo):'')),
        h('div',{style:{fontSize:12.5,marginTop:6}},'Expenses today: ',h('b',null,insInr(f.exp))),
        h('div',{style:{fontSize:12.5,marginTop:8}},'This month so far: ',h('b',null,insInr(mtd.sales)),
          tgt?h('span',{style:{color:'var(--text3)'}},' of '+insInr(tgt)+' target ('+pct(mtd.sales,tgt)+'%)'):null),
        tgt?bar(pct(mtd.sales,tgt),pct(mtd.sales,tgt)>=Math.round(td/insDaysIn(ty,tm)*100)?'var(--green)':'var(--orange)'):null,
        mtd.days===0&&h('div',{style:{fontSize:11.5,marginTop:4,color:'var(--orange)'}},'No daily sales entered this month yet'),
        mtd.days>0&&lm.sales>0&&h('div',{style:{fontSize:11.5,marginTop:4,color:mtd.sales>=lm.sales?'var(--green)':'var(--red)'}},
          (mtd.sales>=lm.sales?'▲ ':'▼ ')+Math.abs(pct(mtd.sales,lm.sales)-100)+'% vs the same '+td+' day'+(td>1?'s':'')+' last month')),
      a&&h('div',{style:{fontSize:12.5,marginTop:10,paddingTop:8,borderTop:'1px solid var(--border)'}},
        '👥 ',h('b',null,a.present+(a.half?' + '+a.half+' half':'')),' present of '+a.staff,
        a.absent?h('span',{style:{color:'var(--red)'}},' · '+a.absent+' absent'):null,
        a.off?h('span',{style:{color:'var(--text3)'}},' · '+a.off+' off'):null,
        a.unmarked?h('span',{style:{color:'var(--orange)'}},' · '+a.unmarked+' not marked'):null),
      !salesOk&&!attOk&&h('div',{style:{fontSize:12,color:'var(--text3)'}},'No access to this outlet\'s sales or attendance.'));
  });

  // ── Forecast ──
  const fcRows=shown.filter(s=>can(Number(s.id),'daily-sales')).map(s=>{
    const sid=Number(s.id);
    const fc=insForecastMonth(sid,ty,tm,today);
    const nx=insNextMonthEstimate(sid,today);
    const tgt=insTargetFor(sid,ty,tm);
    let costs=null;
    if(can(sid,'outlet-pnl')){try{const p=calToFYMI(new Date(ty,tm-1,1).getFullYear(),new Date(ty,tm-1,1).getMonth());const d=plBuild(sid,p.fy,p.mi);costs=Math.round(d.direct+d.opex+(d.belowTot||0));}catch(e){}}
    return{s,sid,fc,nx,tgt,costs,canEdit:userCanEditSheet(user,sid,'daily-sales')};
  });

  // ── Dues ──
  const dues=shown.filter(s=>can(Number(s.id),'vendors')).flatMap(s=>insVendorDues(Number(s.id),today,7).map(x=>({...x,outlet:short(s)}))).sort((a,b)=>a.days-b.days);
  const dueTotal=dues.reduce((t,x)=>t+x.bal,0),overdueTotal=dues.filter(x=>x.days<0).reduce((t,x)=>t+x.bal,0);

  // ── Staff ──
  const staffBlocks=shown.filter(s=>can(Number(s.id),'incentive-working')&&can(Number(s.id),'salary-working')).map(s=>({s,rows:insStaffScores(Number(s.id),ym.y,ym.m,today)})).filter(b=>b.rows.length)
    .map(b=>({...b,empty:b.rows.every(r=>!r.sales&&r.attPct==null)}));

  const savePack=async(s)=>{
    setBusy(true);
    try{
      const sid=Number(s.id);
      const rows=insMonthPackRows(s,ym.y,ym.m,today,sheet=>can(sid,sheet));
      if(!rows.length)throw new Error('You have no access to this outlet\'s sheets.');
      const title='Month-end pack — '+INS_MONTHS[ym.m]+' '+ym.y;
      const blob=await exportReportPdfBlob(title,String(s.name||''),rows);
      const url=URL.createObjectURL(blob);const a=document.createElement('a');
      a.href=url;a.download='SalonOS_'+short(s).replace(/[^A-Za-z0-9]+/g,'_')+'_'+ym.y+'-'+insPad(ym.m+1)+'_month_end.pdf';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),4000);
      success('Month-end pack saved');
    }catch(e){toastError('Could not build the pack: '+(e.message||e));}
    finally{setBusy(false);}
  };

  const th=t=>h('th',{key:t},t);
  return h('div',{className:'fade-in',key:tick},
    h('div',{className:'page-title'},'💡 Owner Insights'),
    h('div',{className:'page-sub'},'Today at a glance, where the month is heading, bills due and how the team is doing — '+today.getDate()+' '+INS_MONTHS[tm]+' '+ty),
    h('div',{style:{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'center'}},
      h('select',{className:'form-control',style:{width:'auto'},value:sel,onChange:e=>setSel(e.target.value)},
        h('option',{value:'all'},'All outlets'),salons.map(s=>h('option',{key:s.id,value:s.id},s.name)))),
    salons.length===0&&h('div',{className:'card',style:{color:'var(--text3)',fontSize:13}},'No active outlets you can see yet.'),

    shown.length>0&&h('div',{className:'card-title',style:{margin:'4px 0 10px'}},'📍 Today'),
    shown.length>0&&h('div',{className:'grid2',style:{marginBottom:20,gap:12}},todayCards),

    fcRows.length>0&&h('div',{className:'card',style:{marginBottom:20}},
      h('div',{className:'card-title'},'🔮 Forecast'),
      h('div',{className:'table-wrap'},h('table',null,
        h('thead',null,h('tr',null,['Outlet','So far ('+INS_MONTHS[tm]+')','Expected '+INS_MONTHS[tm]+' close','Target','Last month costs','Next month (est.)'].map(th))),
        h('tbody',null,fcRows.map(r=>h('tr',{key:r.sid},
          h('td',{'data-label':'Outlet',style:{fontWeight:600}},short(r.s)),
          h('td',{'data-label':'So far'},insInr(r.fc.mtd),h('div',{style:{fontSize:11,color:'var(--text3)'}},r.fc.entered+' day'+(r.fc.entered===1?'':'s')+' entered'+(r.fc.missingDays?' · '+r.fc.missingDays+' missing':''))),
          h('td',{'data-label':'Expected close'},h('b',null,insInr(r.fc.projected)),h('div',{style:{fontSize:11,color:'var(--text3)'}},r.fc.basis)),
          h('td',{'data-label':'Target'},
            editTarget&&editTarget.sid===r.sid
              ?h('span',{style:{display:'inline-flex',gap:4}},
                  h('input',{type:'number',min:0,className:'form-control',style:{width:110,padding:'4px 6px'},autoFocus:true,value:editTarget.value,onChange:e=>setEditTarget({sid:r.sid,value:e.target.value})}),
                  h('button',{className:'btn btn-primary btn-sm',onClick:()=>{insSaveTarget(r.sid,ty,tm,editTarget.value);setEditTarget(null);setTick(t=>t+1);success('Target saved');}},'Save'))
              :h(React.Fragment,null,
                  r.tgt?h('span',null,insInr(r.tgt),h('div',{style:{fontSize:11,color:r.fc.projected>=r.tgt?'var(--green)':'var(--red)'}},r.fc.projected>=r.tgt?'on track (+'+insInr(r.fc.projected-r.tgt)+')':'short by '+insInr(r.tgt-r.fc.projected))):h('span',{style:{color:'var(--text3)'}},'—'),
                  r.canEdit&&h('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:6,padding:'2px 8px'},onClick:()=>setEditTarget({sid:r.sid,value:r.tgt||''})},r.tgt?'Edit':'Set'))),
          h('td',{'data-label':'Last month costs'},r.costs==null?'—':insInr(r.costs),r.costs?h('div',{style:{fontSize:11,color:r.fc.projected>=r.costs?'var(--green)':'var(--red)'}},r.fc.projected>=r.costs?'leaves about '+insInr(r.fc.projected-r.costs):'short by about '+insInr(r.costs-r.fc.projected)):null),
          h('td',{'data-label':'Next month'},r.nx.estimate==null?h('span',{style:{color:'var(--text3)',fontSize:12}},r.nx.basis):h(React.Fragment,null,insInr(r.nx.estimate),h('div',{style:{fontSize:11,color:'var(--text3)'}},r.nx.basis)))))))),
      h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:8}},'Sales from Daily Sales & Exp. Costs = last month\'s P&L (direct cost + operating expenses + depreciation/interest). Estimates, not promises — they improve as more days are entered.')),

    shown.some(s=>can(Number(s.id),'vendors'))&&h('div',{className:'card',style:{marginBottom:20}},
      h('div',{className:'card-title'},'💸 Bills due in the next 7 days'+(dues.length?' — '+insInr(dueTotal):'')),
      dues.length===0?h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'Nothing due this week. 🎉'):
      h(React.Fragment,null,
        overdueTotal>0&&h('div',{style:{fontSize:12.5,color:'var(--red)',marginBottom:8}},'⚠ '+insInr(overdueTotal)+' already overdue'),
        h('div',{className:'table-wrap'},h('table',null,
          h('thead',null,h('tr',null,['Due','Vendor','Invoice','Outlet','Balance'].map(th))),
          h('tbody',null,dues.slice(0,30).map((x,i)=>h('tr',{key:i},
            h('td',{'data-label':'Due',style:{color:x.days<0?'var(--red)':x.days<=1?'var(--orange)':'var(--text)',fontWeight:x.days<=1?600:400}},x.days<0?Math.abs(x.days)+' day'+(x.days===-1?'':'s')+' overdue':x.days===0?'Today':x.days===1?'Tomorrow':x.due.split('-').reverse().join('/')),
            h('td',{'data-label':'Vendor'},x.vendor),h('td',{'data-label':'Invoice'},x.invoiceNo),h('td',{'data-label':'Outlet'},x.outlet),
            h('td',{'data-label':'Balance',style:{fontWeight:600}},insInr(x.bal))))))))),

    h('div',{style:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',margin:'4px 0 10px'}},
      h('div',{className:'card-title',style:{marginBottom:0}},'🏅 Staff scorecard & month-end pack'),
      h('select',{className:'form-control',style:{width:'auto',fontSize:12},value:ym.y+'-'+ym.m,onChange:e=>{const[a,b]=e.target.value.split('-').map(Number);setYm({y:a,m:b});}},
        monthOpts.map(o=>h('option',{key:o.y+'-'+o.m,value:o.y+'-'+o.m},INS_MONTHS[o.m]+' '+o.y)))),
    staffBlocks.length===0&&h('div',{className:'card',style:{fontSize:12.5,color:'var(--text3)',marginBottom:16}},'No staff figures for this month yet (needs Incentive Working and Salary Working access).'),
    staffBlocks.map(b=>h('div',{key:b.s.id,className:'card',style:{marginBottom:16}},
      h('div',{style:{fontWeight:700,fontSize:13.5,marginBottom:8}},short(b.s)),
      b.empty?h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No staff sales or attendance recorded for '+INS_MONTHS[ym.m]+' '+ym.y+' yet ('+b.rows.length+' staff).'):
      h('div',{className:'table-wrap'},h('table',null,
        h('thead',null,h('tr',null,['#','Employee','Sales','Target','Achieved','Attendance','Sales ÷ pay','Score'].map(th))),
        h('tbody',null,b.rows.map((r,i)=>h('tr',{key:r.id},
          h('td',{'data-label':'#'},!r.score?'—':i===0?'🥇':i===1?'🥈':i===2?'🥉':String(i+1)),
          h('td',{'data-label':'Employee',style:{fontWeight:600}},r.name,h('div',{style:{fontSize:11,color:'var(--text3)',fontWeight:400}},r.desig||'')),
          h('td',{'data-label':'Sales'},insInr(r.sales)),
          h('td',{'data-label':'Target'},r.target?insInr(r.target):'—'),
          h('td',{'data-label':'Achieved',style:{color:r.achPct==null?'var(--text3)':r.achPct>=100?'var(--green)':r.achPct>=70?'var(--orange)':'var(--red)'}},r.achPct==null?'—':r.achPct+'%'),
          h('td',{'data-label':'Attendance'},r.attPct==null?'—':r.attPct+'%'),
          h('td',{'data-label':'Sales ÷ pay'},r.perPay==null?'—':r.perPay+'×'),
          h('td',{'data-label':'Score'},r.score==null?'—':h('span',{className:'badge '+(r.score>=75?'badge-green':r.score>=50?'badge-amber':'badge-red')},r.score))))))),
      !b.empty&&h('div',{style:{fontSize:11,color:'var(--text3)',marginTop:6}},'Score = 50% target achieved (120% = full marks) + 30% attendance + 20% sales per ₹ of pay (4× = full marks).'+(ym.y===ty&&ym.m===tm?' This month: targets and pay counted for the '+td+' days so far.':'')))),

    shown.length>0&&h('div',{className:'card',style:{marginBottom:20}},
      h('div',{className:'card-title'},'📦 Month-end pack — '+INS_MONTHS[ym.m]+' '+ym.y),
      h('div',{style:{fontSize:12.5,color:'var(--text2)',marginBottom:10}},'One PDF per outlet: summary, P&L, salary, staff scorecard and vendor bills outstanding (only the parts your login can see).'),
      h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        shown.map(s=>h('button',{key:s.id,className:'btn btn-ghost btn-sm'+(busy?' btn-loading':''),disabled:busy,onClick:()=>savePack(s)},'⬇ '+short(s))),
        CLOUD_SYNC_ENABLED&&shown.filter(s=>can(Number(s.id),'daily-sales')).map(s=>h(EmailPackButton,{key:'e'+s.id,salon:s,ym,buildRows:()=>insMonthPackRows(s,ym.y,ym.m,today,sheet=>can(Number(s.id),sheet))}))))
  );
}
