// ═══════════════════════════════════════════════════════════════════════════════════════════
// Restaurant line of business — outlets whose Master Sheet "Line of Business" is Restaurant.
// Three sheets of their own (Swiggy & Zomato, Food Cost, Service Charge) plus the helpers the
// P&L, Due Dates and Daily Sales & Exp use for restaurant outlets. Salon outlets never see any of it.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const AGG_PLATFORMS=['Swiggy','Zomato','EazyDiner'];
// Daily Sales & Exp row (by stored position) where each platform's day sale is entered.
const AGG_DSE_ROW={Swiggy:14,Zomato:15,EazyDiner:16};
const rYm=(y,m)=>y+'-'+String(m+1).padStart(2,'0');
const rMonthLabel=(y,m)=>new Date(y,m,1).toLocaleString('en-IN',{month:'long',year:'numeric'});
const rNum=v=>{const n=Number(String(v==null?'':v).replace(/[₹,\s]/g,''));return isFinite(n)?n:0;};
function rLoad(key,sid,fallback){try{const v=JSON.parse(cachedLocalGet(outletKey(key,sid)));if(v!=null)return v;}catch(e){}return fallback;}
function rSave(key,sid,val){safeLocalSet(outletKey(key,sid),JSON.stringify(val));}
function rIsoOf(v){
  if(!v)return '';
  const s=String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
  const m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if(m){const y=m[3].length===2?'20'+m[3]:m[3];return y+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');}
  return '';
}

// ── Swiggy / Zomato payouts ──────────────────────────────────────────────────────────────
// One record per payout statement: {id, platform, periodFrom, periodTo, payoutDate, orders,
// grossSales (food value, excl. GST — the GST on these orders is paid by the platform u/s 9(5)),
// commission, pgCharges, adsMarketing, otherDeductions, tds, netPayout, utr, note}.
function loadAggPayouts(sid){const v=rLoad('salonos_aggregator_payouts',sid,[]);return Array.isArray(v)?v:[];}
function saveAggPayouts(sid,list){rSave('salonos_aggregator_payouts',sid,list);}
const aggCharges=p=>rNum(p.commission)+rNum(p.pgCharges)+rNum(p.adsMarketing)+rNum(p.otherDeductions);
const aggExpectedNet=p=>rNum(p.grossSales)-aggCharges(p)-rNum(p.tds);
// Share of a payout that belongs to a calendar month — by the days of its order period that fall
// in the month (a weekly payout running 29 Sep–5 Oct is 2/7 September, 5/7 October). Without a
// period, the whole payout belongs to its payout date's month.
function aggMonthShare(p,year,month){
  const f=rIsoOf(p.periodFrom),t=rIsoOf(p.periodTo);
  if(f&&t&&t>=f){
    const a=new Date(f+'T00:00:00'),b=new Date(t+'T00:00:00');
    const total=Math.round((b-a)/86400000)+1;
    const ms=new Date(year,month,1),me=new Date(year,month+1,0);
    const s=a>ms?a:ms,e=b<me?b:me;
    if(e<s)return 0;
    return(Math.round((e-s)/86400000)+1)/total;
  }
  const d=rIsoOf(p.payoutDate)||rIsoOf(p.periodTo)||rIsoOf(p.periodFrom);
  if(!d)return 0;
  return d.slice(0,7)===rYm(year,month)?1:0;
}
function aggregatorMonthFor(sid,year,month,platform){
  const out={gross:0,charges:0,tds:0,net:0,orders:0,commission:0};
  loadAggPayouts(sid).filter(p=>!platform||p.platform===platform).forEach(p=>{
    const k=aggMonthShare(p,year,month);if(!k)return;
    out.gross+=rNum(p.grossSales)*k;out.charges+=aggCharges(p)*k;out.tds+=rNum(p.tds)*k;
    out.net+=rNum(p.netPayout)*k;out.orders+=rNum(p.orders)*k;out.commission+=rNum(p.commission)*k;
  });
  Object.keys(out).forEach(x=>out[x]=Math.round(out[x]));
  return out;
}
function aggDailyEntriesFor(sid,year,month,platform){
  let ds={};try{ds=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',sid))||'{}');}catch(e){}
  const pre=rYm(year,month),ri=AGG_DSE_ROW[platform];let t=0;
  Object.keys(ds).forEach(iso=>{if(iso.startsWith(pre))t+=rNum((ds[iso]||{})[ri]);});
  return Math.round(t);
}
function aggregatorSalesFor(sid,year,month,platform){return aggregatorMonthFor(sid,year,month,platform).gross;}
function aggregatorChargesFor(sid,year,month){return aggregatorMonthFor(sid,year,month).charges;}
// Bank match — a credit on Bank Statement for this platform within 7 days of the payout date and
// within ₹1 of the net payout.
function aggBankMatch(sid,p){
  let rows=[];try{rows=JSON.parse(cachedLocalGet(outletKey('salonos_bank_statement_rows',sid))||'[]');}catch(e){}
  const pd=rIsoOf(p.payoutDate);if(!pd||!(rNum(p.netPayout)>0))return null;
  const word=p.platform==='Swiggy'?/swiggy|bundl/i:p.platform==='EazyDiner'?/eazy\s?diner/i:/zomato/i;
  const t0=new Date(pd+'T00:00:00').getTime();
  return rows.find(r=>{
    if(!(Number(r.credit)>0)||Math.abs(Number(r.credit)-rNum(p.netPayout))>1)return false;
    if(!(word.test(String(r.description||''))||r.nature===p.platform+' Settlement'))return false;
    const d=rIsoOf(r.transactionDate);if(!d)return false;
    return Math.abs(new Date(d+'T00:00:00').getTime()-t0)<=7*86400000;
  })||null;
}

// ── Food cost ────────────────────────────────────────────────────────────────────────────
// Monthly stock counts: {'YYYY-MM':{openingFood,closingFood,openingBar,closingBar,barSales}, _settings:{foodTarget,barTarget}}
function loadFoodStock(sid){const v=rLoad('salonos_food_stock',sid,{});return v&&typeof v==='object'?v:{};}
function saveFoodStock(sid,v){rSave('salonos_food_stock',sid,v);}
function foodSettings(sid){const s=loadFoodStock(sid)._settings||{};return{foodTarget:s.foodTarget!=null?Number(s.foodTarget):32,barTarget:s.barTarget!=null?Number(s.barTarget):25};}
function prevYm(y,m){return m===0?rYm(y-1,11):rYm(y,m-1);}
// Consumption = opening stock + purchases − closing stock. Until a closing stock count is entered
// for the month, consumption is simply the month's purchases.
function stockConsumptionFor(sid,year,month,kind){
  const all=loadFoodStock(sid);const cur=all[rYm(year,month)]||{};const prev=all[prevYm(year,month)]||{};
  const isBar=kind==='bar';
  const purchases=isBar
    ?vendorInvoiceCategorySumFor(sid,year,month,'Liquor Purchase')
    :vendorInvoiceCategorySumFor(sid,year,month,'Food & Raw Material Purchase')+dailySalesGroupSumFor(sid,year,month,'Food Purchase (Local)');
  const oKey=isBar?'openingBar':'openingFood',cKey=isBar?'closingBar':'closingFood';
  const hasClosing=cur[cKey]!==undefined&&cur[cKey]!=='';
  const opening=cur[oKey]!==undefined&&cur[oKey]!==''?rNum(cur[oKey]):(prev[cKey]!==undefined&&prev[cKey]!==''?rNum(prev[cKey]):0);
  const closing=hasClosing?rNum(cur[cKey]):null;
  const consumption=hasClosing?opening+purchases-closing:purchases;
  return{opening,purchases:Math.round(purchases),closing,hasClosing,consumption:Math.round(consumption)};
}
function foodCostFor(sid,year,month){return stockConsumptionFor(sid,year,month,'food');}
function barCostFor(sid,year,month){return stockConsumptionFor(sid,year,month,'bar');}
function barSalesFor(sid,year,month){return rNum((loadFoodStock(sid)[rYm(year,month)]||{}).barSales);}
// Counter sales (cash, card, UPI) from Daily Sales & Exp, excluding GST at 5%.
function restaurantCounterSalesFor(sid,year,month){
  let ds={};try{ds=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',sid))||'{}');}catch(e){}
  const pre=rYm(year,month);const t={cash:0,card:0,upi:0};
  Object.keys(ds).forEach(iso=>{if(!iso.startsWith(pre))return;const d=ds[iso]||{};t.cash+=rNum(d[0]);t.card+=rNum(d[1]);t.upi+=rNum(d[2]);});
  return{cash:Math.round(t.cash/1.05),card:Math.round(t.card/1.05),upi:Math.round(t.upi/1.05)};
}
function restaurantFoodSalesFor(sid,year,month){
  const c=restaurantCounterSalesFor(sid,year,month);
  return c.cash+c.card+c.upi+aggregatorSalesFor(sid,year,month);
}
// Recipes: ingredients {id,name,unit,price,yieldPct}; recipes {id,name,category,price,portions,lines:[{ingId,qty}]}
function loadIngredients(sid){const v=rLoad('salonos_ingredients',sid,[]);return Array.isArray(v)?v:[];}
function saveIngredients(sid,v){rSave('salonos_ingredients',sid,v);}
function loadRecipes(sid){const v=rLoad('salonos_recipes',sid,[]);return Array.isArray(v)?v:[];}
function saveRecipes(sid,v){rSave('salonos_recipes',sid,v);}
const ingUnitCost=ing=>{const y=rNum(ing&&ing.yieldPct)||100;return rNum(ing&&ing.price)/(y/100);};
function recipeCost(rec,ings){
  const byId={};(ings||[]).forEach(i=>byId[i.id]=i);
  const batch=(rec.lines||[]).reduce((s,l)=>s+rNum(l.qty)*ingUnitCost(byId[l.ingId]),0);
  const portions=rNum(rec.portions)||1;
  return batch/portions;
}

// ── Service charge ───────────────────────────────────────────────────────────────────────
// {settings:{ratePct,housePct,method,points:{designation:points},excludeManagers}, months:{'YYYY-MM':{collected,final}}}
const SC_METHODS=[
  {id:'equal',label:'Equal share among eligible staff'},
  {id:'points',label:'By points (designation)'},
  {id:'days',label:'By days present'},
  {id:'points_days',label:'Points × days present'}
];
function loadServiceCharge(sid){const v=rLoad('salonos_service_charge',sid,{});return{settings:{ratePct:'',housePct:0,method:'equal',points:{},excludeManagers:false,...((v&&v.settings)||{})},months:(v&&v.months)||{}};}
function saveServiceCharge(sid,v){rSave('salonos_service_charge',sid,v);}
function serviceChargeCollectedFor(sid,year,month){return rNum((loadServiceCharge(sid).months[rYm(year,month)]||{}).collected);}
function serviceChargeSplitFor(sid,year,month){
  const sc=loadServiceCharge(sid);const st=sc.settings;
  const collected=serviceChargeCollectedFor(sid,year,month);
  const house=Math.round(collected*rNum(st.housePct)/100);
  const distributable=collected-house;
  const days={};try{swWorkingsFor(sid,year,month).forEach(w=>{days[w.id]=Number(w.totalDays)||0;});}catch(e){}
  const emps=getEmployeesForMonth(year,month,sid).filter(e=>e.status==='Active'&&!(st.excludeManagers&&e.dept==='Manager'));
  const rows=emps.map(e=>{
    const pts=st.points&&st.points[e.desig]!=null&&st.points[e.desig]!==''?rNum(st.points[e.desig]):1;
    const d=days[e.id]!=null?days[e.id]:new Date(year,month+1,0).getDate();
    const w=st.method==='points'?pts:st.method==='days'?d:st.method==='points_days'?pts*d:1;
    return{id:e.id,name:e.name,desig:e.desig||'',dept:e.dept||'',points:pts,days:d,weight:w};
  });
  const tw=rows.reduce((s,r)=>s+r.weight,0);
  let given=0;
  rows.forEach((r,i)=>{r.amount=tw>0?Math.floor(distributable*r.weight/tw):0;given+=r.amount;});
  // Rounding remainder goes to the largest share so the split always adds up exactly.
  if(rows.length&&tw>0&&given!==distributable){const big=rows.reduce((a,b)=>b.weight>a.weight?b:a);big.amount+=distributable-given;}
  return{collected,house,distributable,rows};
}
function serviceChargeDistributedFor(sid,year,month){return serviceChargeSplitFor(sid,year,month).distributable;}

// ── Licence renewals for Due Dates (restaurant outlets) ──────────────────────────────────
// Renewals need lead time — amber from 30 days before expiry, red once expired.
function licenceStatus(date,paid){
  if(paid)return dueStatusFor(date,true);
  const days=Math.round((new Date(date+'T00:00:00')-new Date(localTodayIso()+'T00:00:00'))/86400000);
  return days<0?'overdue':days<=30?'soon':dueStatusFor(date,false);
}
function autoLicenceDueItemsFor(sid){
  const o=outletSettings(sid);if(o.businessType!=='Restaurant')return[];
  const overrides=loadDueAutoOverrides(sid);
  const list=[['fssai','FSSAI licence renewal',o.fssaiValidTill,o.fssaiNo],['fire','Fire NOC renewal',o.fireNocValidTill,''],
    ['trade','Health / trade licence renewal',o.tradeLicenceValidTill,''],
    ...(o.servesLiquor?[['liquor','Liquor (bar) licence renewal',o.liquorLicenceValidTill,o.liquorLicenceNo]]:[])];
  return list.filter(x=>x[2]).map(([k,label,date,no])=>{
    const id='auto-lic-'+k+'-'+date;const ov=overrides[id]||{};
    return{id,auto:true,type:'Licence Renewal',desc:label+(no?' — '+no:'')+' (valid till '+date.split('-').reverse().join('/')+')',due:date,amount:0,
      paid:!!ov.paid,paidAmount:ov.paidAmount||'',paidDate:ov.paidDate||'',ref:ov.ref||'',bankRowId:ov.bankRowId!=null?ov.bankRowId:null,status:licenceStatus(date,ov.paid)};
  });
}

// ═════════════════════════════ Sheets ═════════════════════════════
function RCard({label,val,sub,color}){
  const h=React.createElement;
  return h('div',{className:'metric-card '+(color||'blue')},h('div',{className:'metric-label'},label),h('div',{className:'metric-value'},val),sub&&h('div',{className:'metric-sub'},sub));
}
function rDownloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);}

const AGG_FIELDS=[
  ['platform','Platform'],['periodFrom','Order period from'],['periodTo','Order period to'],['payoutDate','Payout date'],['orders','Orders'],
  ['grossSales','Gross food sales (excl. GST)'],['commission','Commission (incl. GST)'],['pgCharges','Payment gateway charges'],
  ['adsMarketing','Ads / marketing'],['otherDeductions','Other deductions'],['tds','TDS deducted'],['netPayout','Net payout'],['utr','UTR / reference'],['note','Note']
];
function AggregatorsSheet({salon,period}={}){
  const h=React.createElement;
  const sid=salon&&salon.id;
  const {toast,error:toastError}=useToast();
  const cal=periodToCalendar(period)||{year:new Date().getFullYear(),month:new Date().getMonth()};
  const [list,setList]=useState(()=>loadAggPayouts(sid));
  useEffect(()=>{setList(loadAggPayouts(sid));},[sid]);
  const persist=next=>{setList(next);saveAggPayouts(sid,next);};
  const [plat,setPlat]=useState('All');
  const [form,setForm]=useState(null);
  const fileRef=useRef(null);
  const editable=userCanEditSheet(currentSessionUser(),sid,'aggregators');
  const inMonth=list.filter(p=>aggMonthShare(p,cal.year,cal.month)>0&&(plat==='All'||p.platform===plat))
    .sort((a,b)=>String(rIsoOf(b.payoutDate)).localeCompare(String(rIsoOf(a.payoutDate))));
  const m=aggregatorMonthFor(sid,cal.year,cal.month,plat==='All'?null:plat);
  const pct=m.gross?Math.round(m.charges/m.gross*1000)/10:0;
  const unmatched=inMonth.filter(p=>!aggBankMatch(sid,p)).length;
  const blank={id:'',platform:'Swiggy',periodFrom:'',periodTo:'',payoutDate:'',orders:'',grossSales:'',commission:'',pgCharges:'',adsMarketing:'',otherDeductions:'',tds:'',netPayout:'',utr:'',note:''};
  const save=()=>{
    if(!form.platform)return toastError('Choose the platform');
    if(!rIsoOf(form.payoutDate)&&!rIsoOf(form.periodTo))return toastError('Enter the payout date or the order period');
    if(!(rNum(form.grossSales)>0))return toastError('Enter the gross food sales');
    const rec={...form,id:form.id||('AP'+Date.now())};
    persist(form.id?list.map(p=>p.id===form.id?rec:p):[rec,...list]);
    setForm(null);toast('Payout saved','success');
  };
  const del=p=>{if(!confirm('Delete this '+p.platform+' payout?'))return;persist(list.filter(x=>x.id!==p.id));};
  const template=()=>{
    const head=AGG_FIELDS.map(f=>f[1]);
    const ex=['Swiggy','2026-09-01','2026-09-07','2026-09-10','142','58400','12264','1168','2000','0','584','42384','UTR123456789',''];
    rDownloadBlob(new Blob(['\uFEFF'+head.join(',')+'\n'+ex.join(',')+'\n'],{type:'text/csv'}),'Aggregator_Payouts_Template.csv');
  };
  const importFile=async e=>{
    const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;
    try{
      if(!window.XLSX)throw new Error('Excel reader not loaded — check the internet connection');
      const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:'',raw:false});
      let added=0,skipped=0;const next=[...list];
      rows.forEach((r,i)=>{
        const get=lbl=>{const k=Object.keys(r).find(x=>x.trim().toLowerCase()===lbl.toLowerCase());return k?r[k]:'';};
        const rec={id:'AP'+Date.now()+'_'+i};AGG_FIELDS.forEach(([k,l])=>rec[k]=String(get(l)).trim());
        rec.platform=AGG_PLATFORMS.find(x=>x.toLowerCase()===String(rec.platform).toLowerCase())||'';
        ['periodFrom','periodTo','payoutDate'].forEach(k=>rec[k]=rIsoOf(rec[k])||rec[k]);
        if(!rec.platform||!(rNum(rec.grossSales)>0)){skipped++;return;}
        if(next.some(p=>p.platform===rec.platform&&p.payoutDate===rec.payoutDate&&rNum(p.netPayout)===rNum(rec.netPayout))){skipped++;return;}
        next.unshift(rec);added++;
      });
      persist(next);toast('Imported '+added+' payout'+(added===1?'':'s')+(skipped?' · '+skipped+' skipped (missing platform/sales, or already imported)':''),'success');
    }catch(err){toastError('Import failed: '+(err.message||err));}
  };
  const exportXlsx=async()=>{
    try{
      const rows=[['Swiggy & Zomato payouts — '+salon.name+' — '+rMonthLabel(cal.year,cal.month)],[],
        ['Platform','Period','Payout date','Orders','Gross sales','Commission','PG charges','Ads','Other','TDS','Net payout','Expected net','Bank'],
        ...inMonth.map(p=>[p.platform,(p.periodFrom||'')+' – '+(p.periodTo||''),p.payoutDate,rNum(p.orders),rNum(p.grossSales),rNum(p.commission),rNum(p.pgCharges),rNum(p.adsMarketing),rNum(p.otherDeductions),rNum(p.tds),rNum(p.netPayout),Math.round(aggExpectedNet(p)),aggBankMatch(sid,p)?'Matched':'Not found'])];
      rDownloadBlob(await exportReportExcelBlob('Aggregator payouts',rows),'Aggregator_Payouts_'+rYm(cal.year,cal.month)+'.xlsx');
    }catch(e){toastError('Could not build the Excel file');}
  };
  const F=(k,label,type)=>h('div',{className:'form-group'},h('label',null,label),
    k==='platform'?h('select',{className:'form-control',value:form[k],onChange:e=>setForm(f=>({...f,[k]:e.target.value}))},AGG_PLATFORMS.map(x=>h('option',{key:x},x)))
    :h('input',{className:'form-control',type:type||'text',value:form[k],onChange:e=>setForm(f=>({...f,[k]:e.target.value}))}));
  const money=v=>rupee(Math.round(v));
  return h('div',{className:'fade-in'},
    h('div',{className:'section-header'},
      h('div',null,h('div',{className:'page-title'},'Swiggy, Zomato & EazyDiner'),
        h('div',{className:'page-sub'},'Delivery-app payouts for '+rMonthLabel(cal.year,cal.month)+' — sales, commission and charges, and whether each payout reached the bank')),
      h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        h('button',{className:'btn btn-ghost btn-sm',onClick:template},'⬇ Template'),
        editable&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>fileRef.current&&fileRef.current.click()},'📥 Import payouts'),
        h('input',{ref:fileRef,type:'file',accept:'.csv,.xlsx,.xls',style:{display:'none'},onChange:importFile}),
        h('button',{className:'btn btn-ghost btn-sm',onClick:exportXlsx},'⬇ Export Excel'),
        editable&&h('button',{className:'btn btn-primary btn-sm',onClick:()=>setForm({...blank})},'+ Add Payout'))),
    h('div',{className:'grid4',style:{marginBottom:16}},
      h(RCard,{label:'Gross food sales',val:money(m.gross),sub:Math.round(m.orders)+' orders',color:'blue'}),
      h(RCard,{label:'Commission & charges',val:money(m.charges),sub:pct+'% of sales',color:'amber'}),
      h(RCard,{label:'Net payout',val:money(m.net),sub:'TDS credit '+money(m.tds),color:'green'}),
      h(RCard,{label:'Not found in bank',val:String(unmatched),sub:unmatched?'import the bank statement or check the payout':'all payouts matched',color:unmatched?'red':'green'})),
    h('div',{style:{display:'flex',gap:6,marginBottom:10}},['All',...AGG_PLATFORMS].map(x=>h('button',{key:x,className:'btn btn-sm '+(plat===x?'btn-primary':'btn-ghost'),onClick:()=>setPlat(x)},x))),
    h('div',{className:'card',style:{marginBottom:12}},
      h('div',{className:'card-title'},'Daily entries vs payouts — '+rMonthLabel(cal.year,cal.month)),
      h('div',{className:'table-wrap'},h('table',{style:{maxWidth:820}},
        h('thead',null,h('tr',null,['Platform','Entered daily (Daily Sales & Exp)','Payout gross food sales','Difference',''].map((t,i)=>h('th',{key:i},t)))),
        h('tbody',null,AGG_PLATFORMS.map(pl=>{const d=aggDailyEntriesFor(sid,cal.year,cal.month,pl),g=aggregatorSalesFor(sid,cal.year,cal.month,pl),df=d-g;
          return h('tr',{key:pl},h('td',null,h('b',null,pl)),h('td',{style:{textAlign:'right'}},money(d)),h('td',{style:{textAlign:'right'}},money(g)),
            h('td',{style:{textAlign:'right',color:Math.abs(df)>1?'var(--orange)':'var(--text3)'}},(df>0?'+':'')+money(df)),
            h('td',{style:{fontSize:11.5,color:'var(--text3)'}},!d&&!g?'—':!g?'no payout entered yet':!d?'no daily entries':Math.abs(df)<=Math.max(50,g*0.01)?'matches':'check — GST or a missed day?'));})))),
      h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'Daily entries are what the manager typed each day; the payout figure is the platform’s food value excluding GST. The P&L uses the payouts.')),
    h('div',{className:'help-note',style:{marginBottom:12}},'Enter each payout from the Swiggy / Zomato / EazyDiner payout statement, or import many with the template. Gross food sales go to P&L revenue (GST on these orders is paid by the platform), commission, gateway, ads and other deductions go to "Aggregator Commission & Charges", and TDS is a tax credit. A payout spanning two months is split by days. Each payout is matched to its bank credit within 7 days.'),
    h('div',{className:'card'},inMonth.length===0
      ?h('div',{className:'empty-state'},h('div',{className:'empty-icon'},'🛵'),h('div',{className:'empty-title'},'No payouts for this month'),h('div',{className:'empty-sub'},'Add a payout from the statement, or import the template.'))
      :h('div',{className:'table-wrap'},h('table',null,
        h('thead',null,h('tr',null,['Platform','Order period','Payout date','Orders','Gross sales','Commission','Gateway','Ads','Other','TDS','Net payout','Check','Bank',''].map(t=>h('th',{key:t},t)))),
        h('tbody',null,inMonth.map(p=>{
          const diff=Math.round(rNum(p.netPayout)-aggExpectedNet(p));const bm=aggBankMatch(sid,p);
          return h('tr',{key:p.id},
            h('td',null,h('b',null,p.platform)),h('td',null,(p.periodFrom||'—')+' → '+(p.periodTo||'—')),h('td',null,p.payoutDate||'—'),
            h('td',{style:{textAlign:'right'}},rNum(p.orders)||'—'),
            ...['grossSales','commission','pgCharges','adsMarketing','otherDeductions','tds','netPayout'].map(k=>h('td',{key:k,style:{textAlign:'right'}},rNum(p[k])?money(rNum(p[k])):'—')),
            h('td',{style:{fontSize:11.5}},Math.abs(diff)<=1?h('span',{className:'badge badge-green'},'Adds up'):h('span',{className:'badge badge-amber',title:'Gross − charges − TDS = '+money(aggExpectedNet(p))},(diff>0?'+':'')+money(diff))),
            h('td',{style:{fontSize:11.5}},bm?h('span',{className:'badge badge-green',title:bm.description},'✓ '+bm.transactionDate):h('span',{className:'badge badge-gray'},'Not found')),
            h('td',null,editable&&h('div',{style:{display:'flex',gap:4}},
              h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setForm({...blank,...p})},'Edit'),
              h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>del(p)},'Delete'))));
        }))))),
    form&&h('div',{className:'modal-overlay',onClick:()=>setForm(null)},
      h('div',{className:'modal',style:{width:680},onClick:e=>e.stopPropagation()},
        h('div',{className:'modal-title'},form.id?'Edit payout':'Add payout'),
        h('div',{className:'form-row cols3'},F('platform','Platform *'),F('periodFrom','Order period from','date'),F('periodTo','Order period to','date')),
        h('div',{className:'form-row cols3'},F('payoutDate','Payout date *','date'),F('orders','Orders','number'),F('grossSales','Gross food sales (excl. GST) *','number')),
        h('div',{className:'form-row cols3'},F('commission','Commission (incl. GST)','number'),F('pgCharges','Payment gateway charges','number'),F('adsMarketing','Ads / marketing','number')),
        h('div',{className:'form-row cols3'},F('otherDeductions','Other deductions','number'),F('tds','TDS deducted','number'),F('netPayout','Net payout received','number')),
        h('div',{className:'form-row cols2'},F('utr','UTR / reference'),F('note','Note')),
        h('div',{style:{fontSize:12,color:'var(--text2)',marginBottom:8}},'Expected net = gross − commission − gateway − ads − other − TDS = ',h('b',null,money(aggExpectedNet(form)))),
        h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:()=>setForm(null)},'Cancel'),h('button',{className:'btn btn-primary',onClick:save},'Save payout'))))
  );
}

function FoodCostSheet({salon,period}={}){
  const h=React.createElement;
  const sid=salon&&salon.id;
  const {toast,error:toastError}=useToast();
  const o=outletSettings(sid);const bar=!!o.servesLiquor;
  const cal=periodToCalendar(period)||{year:new Date().getFullYear(),month:new Date().getMonth()};
  const ym=rYm(cal.year,cal.month);
  const editable=userCanEditSheet(currentSessionUser(),sid,'food-cost');
  const [tab,setTab]=useState('month');
  const [stock,setStock]=useState(()=>loadFoodStock(sid));
  const [ings,setIngs]=useState(()=>loadIngredients(sid));
  const [recs,setRecs]=useState(()=>loadRecipes(sid));
  useEffect(()=>{setStock(loadFoodStock(sid));setIngs(loadIngredients(sid));setRecs(loadRecipes(sid));},[sid]);
  const setStockField=(k,v)=>{const next={...stock,[ym]:{...(stock[ym]||{}),[k]:v}};setStock(next);saveFoodStock(sid,next);};
  const setSetting=(k,v)=>{const next={...stock,_settings:{...(stock._settings||{}),[k]:v}};setStock(next);saveFoodStock(sid,next);};
  const st=foodSettings(sid);
  const fc=foodCostFor(sid,cal.year,cal.month);
  const sales=restaurantFoodSalesFor(sid,cal.year,cal.month);
  const pct=sales?Math.round(fc.consumption/sales*1000)/10:0;
  const col=p=>p<=st.foodTarget?'green':p<=st.foodTarget+5?'amber':'red';
  const money=v=>rupee(Math.round(v));
  const cur=stock[ym]||{};
  const numIn=(k,ph)=>h('input',{type:'number',className:'form-control',style:{width:160},disabled:!editable,placeholder:ph||'',value:cur[k]==null?'':cur[k],onChange:e=>setStockField(k,e.target.value)});
  const trend=[5,4,3,2,1,0].map(back=>{const d=new Date(cal.year,cal.month-back,1);const y=d.getFullYear(),mm=d.getMonth();
    const c=foodCostFor(sid,y,mm),s=restaurantFoodSalesFor(sid,y,mm);return{label:d.toLocaleString('en-IN',{month:'short',year:'2-digit'}),sales:s,cost:c.consumption,pct:s?Math.round(c.consumption/s*1000)/10:0,counted:c.hasClosing};});
  // recipes
  const [ingForm,setIngForm]=useState(null);
  const [recForm,setRecForm]=useState(null);
  const saveIng=()=>{
    if(!ingForm.name.trim())return toastError('Enter the ingredient name');
    const rec={...ingForm,id:ingForm.id||('ING'+Date.now())};
    const next=ingForm.id?ings.map(i=>i.id===ingForm.id?rec:i):[...ings,rec];setIngs(next);saveIngredients(sid,next);setIngForm(null);
  };
  const delIng=i=>{if(recs.some(r=>(r.lines||[]).some(l=>l.ingId===i.id)))return toastError('Used in a recipe — remove it from the recipe first');
    if(!confirm('Delete '+i.name+'?'))return;const next=ings.filter(x=>x.id!==i.id);setIngs(next);saveIngredients(sid,next);};
  const saveRec=()=>{
    if(!recForm.name.trim())return toastError('Enter the dish name');
    const rec={...recForm,id:recForm.id||('REC'+Date.now()),lines:(recForm.lines||[]).filter(l=>l.ingId&&rNum(l.qty)>0)};
    const next=recForm.id?recs.map(r=>r.id===recForm.id?rec:r):[...recs,rec];setRecs(next);saveRecipes(sid,next);setRecForm(null);toast('Recipe saved','success');
  };
  const delRec=r=>{if(!confirm('Delete '+r.name+'?'))return;const next=recs.filter(x=>x.id!==r.id);setRecs(next);saveRecipes(sid,next);};
  const recRows=recs.map(r=>{const c=recipeCost(r,ings);const p=rNum(r.price);return{r,cost:c,pct:p?Math.round(c/p*1000)/10:0,margin:p-c};}).sort((a,b)=>b.pct-a.pct);
  const bc=barCostFor(sid,cal.year,cal.month);const bs=barSalesFor(sid,cal.year,cal.month);const bpct=bs?Math.round(bc.consumption/bs*1000)/10:0;
  const tabs=[['month','📅 Monthly food cost'],['recipes','🍲 Recipe costing'],...(bar?[['bar','🍷 Bar']]:[])];
  return h('div',{className:'fade-in'},
    h('div',{className:'section-header'},h('div',null,h('div',{className:'page-title'},'Food Cost'),
      h('div',{className:'page-sub'},'What the kitchen consumed against what it sold — '+rMonthLabel(cal.year,cal.month)))),
    h('div',{className:'tab-bar',style:{marginBottom:16}},tabs.map(([k,l])=>h('button',{key:k,className:'tab-btn '+(tab===k?'active':''),onClick:()=>setTab(k)},l))),
    tab==='month'&&h('div',null,
      h('div',{className:'grid4',style:{marginBottom:16}},
        h(RCard,{label:'Food sales (excl. GST)',val:money(sales),sub:'counter + Swiggy + Zomato',color:'blue'}),
        h(RCard,{label:'Food consumption',val:money(fc.consumption),sub:fc.hasClosing?'opening + purchases − closing':'purchases only — enter the closing stock',color:'amber'}),
        h(RCard,{label:'Food cost %',val:pct+'%',sub:'target '+st.foodTarget+'%',color:col(pct)}),
        h(RCard,{label:'Gross margin on food',val:money(sales-fc.consumption),sub:sales?Math.round((sales-fc.consumption)/sales*100)+'% of sales':'',color:'green'})),
      h('div',{className:'card',style:{marginBottom:16}},
        h('div',{className:'card-title'},'Stock count & purchases — '+rMonthLabel(cal.year,cal.month)),
        h('table',{style:{maxWidth:640}},h('tbody',null,
          h('tr',null,h('td',null,'Opening food stock (₹)'),h('td',null,numIn('openingFood',fc.opening?String(fc.opening)+' = last closing':'0'))),
          h('tr',null,h('td',null,'Purchases — vendor bills (Food & Raw Material Purchase) + local purchases in Daily Sales & Exp'),h('td',{style:{fontWeight:700}},money(fc.purchases))),
          h('tr',null,h('td',null,'Closing food stock (₹) — value of the month-end stock count'),h('td',null,numIn('closingFood','enter after the count'))),
          h('tr',null,h('td',null,h('b',null,'Consumption')),h('td',{style:{fontWeight:700}},money(fc.consumption))),
          h('tr',null,h('td',null,'Target food cost %'),h('td',null,h('input',{type:'number',className:'form-control',style:{width:100},disabled:!editable,value:st.foodTarget,onChange:e=>setSetting('foodTarget',e.target.value)})))))),
      h('div',{className:'card'},h('div',{className:'card-title'},'Last 6 months'),
        h('div',{className:'table-wrap'},h('table',null,
          h('thead',null,h('tr',null,['Month','Food sales','Consumption','Food cost %','Stock counted'].map(t=>h('th',{key:t},t)))),
          h('tbody',null,trend.map(t=>h('tr',{key:t.label},h('td',null,t.label),h('td',{style:{textAlign:'right'}},money(t.sales)),h('td',{style:{textAlign:'right'}},money(t.cost)),
            h('td',{style:{textAlign:'right'}},h('span',{className:'badge badge-'+(t.sales?(col(t.pct)==='amber'?'amber':col(t.pct)==='red'?'red':'green'):'gray')},t.sales?t.pct+'%':'—')),
            h('td',null,t.counted?'✓':'—')))))))),
    tab==='recipes'&&h('div',null,
      h('div',{className:'grid2',style:{alignItems:'start'}},
        h('div',{className:'card'},
          h('div',{style:{display:'flex',alignItems:'center',marginBottom:8}},h('div',{className:'card-title',style:{margin:0,flex:1}},'Ingredients ('+ings.length+')'),
            editable&&h('button',{className:'btn btn-primary btn-sm',onClick:()=>setIngForm({id:'',name:'',unit:'kg',price:'',yieldPct:100})},'+ Ingredient')),
          h('div',{className:'help-note',style:{marginBottom:8}},'Price per purchase unit, and yield % — the usable part after cleaning or trimming (e.g. onions 90%).'),
          ings.length===0?h('div',{style:{color:'var(--text3)',fontSize:12.5}},'No ingredients yet.'):
          h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Ingredient','Unit','Price','Yield','Usable cost',''].map(t=>h('th',{key:t},t)))),
            h('tbody',null,ings.map(i=>h('tr',{key:i.id},h('td',null,i.name),h('td',null,i.unit),h('td',{style:{textAlign:'right'}},rupee(rNum(i.price))),h('td',{style:{textAlign:'right'}},(rNum(i.yieldPct)||100)+'%'),
              h('td',{style:{textAlign:'right'}},'₹'+ingUnitCost(i).toFixed(2)+'/'+i.unit),
              h('td',null,editable&&h('div',{style:{display:'flex',gap:4}},h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setIngForm({...i})},'Edit'),h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>delIng(i)},'✕'))))))))),
        h('div',{className:'card'},
          h('div',{style:{display:'flex',alignItems:'center',marginBottom:8}},h('div',{className:'card-title',style:{margin:0,flex:1}},'Dishes ('+recs.length+')'),
            editable&&h('button',{className:'btn btn-primary btn-sm',onClick:()=>setRecForm({id:'',name:'',category:'',price:'',portions:1,lines:[{ingId:'',qty:''}]})},'+ Recipe')),
          h('div',{className:'help-note',style:{marginBottom:8}},'Dish cost from its ingredients; food cost % against the menu price (excl. GST). Highest food cost first — target '+st.foodTarget+'%.'),
          recRows.length===0?h('div',{style:{color:'var(--text3)',fontSize:12.5}},'No recipes yet.'):
          h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Dish','Menu price','Cost','Food cost %','Margin',''].map(t=>h('th',{key:t},t)))),
            h('tbody',null,recRows.map(x=>h('tr',{key:x.r.id},h('td',null,h('div',{style:{fontWeight:600}},x.r.name),x.r.category&&h('div',{style:{fontSize:11,color:'var(--text3)'}},x.r.category)),
              h('td',{style:{textAlign:'right'}},rupee(rNum(x.r.price))),h('td',{style:{textAlign:'right'}},'₹'+x.cost.toFixed(2)),
              h('td',{style:{textAlign:'right'}},h('span',{className:'badge badge-'+(col(x.pct)==='amber'?'amber':col(x.pct)==='red'?'red':'green')},x.pct+'%')),
              h('td',{style:{textAlign:'right'}},rupee(Math.round(x.margin))),
              h('td',null,editable&&h('div',{style:{display:'flex',gap:4}},h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setRecForm({...x.r,lines:(x.r.lines||[]).length?x.r.lines:[{ingId:'',qty:''}]})},'Edit'),h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>delRec(x.r)},'✕'))))))))))),
    tab==='bar'&&bar&&h('div',null,
      h('div',{className:'grid4',style:{marginBottom:16}},
        h(RCard,{label:'Bar sales',val:money(bs),sub:'entered below',color:'blue'}),
        h(RCard,{label:'Liquor consumption',val:money(bc.consumption),sub:bc.hasClosing?'opening + purchases − closing':'purchases only',color:'amber'}),
        h(RCard,{label:'Liquor cost %',val:bpct+'%',sub:'target '+st.barTarget+'%',color:bpct<=st.barTarget?'green':bpct<=st.barTarget+5?'amber':'red'}),
        h(RCard,{label:'Liquor licence',val:o.liquorLicenceValidTill?o.liquorLicenceValidTill.split('-').reverse().join('/'):'—',sub:o.liquorLicenceNo||'set in Master Sheet',color:'purple'})),
      h('div',{className:'card'},h('div',{className:'card-title'},'Bar — '+rMonthLabel(cal.year,cal.month)),
        h('table',{style:{maxWidth:640}},h('tbody',null,
          h('tr',null,h('td',null,'Bar sales for the month (₹)'),h('td',null,numIn('barSales'))),
          h('tr',null,h('td',null,'Opening liquor stock (₹)'),h('td',null,numIn('openingBar',bc.opening?String(bc.opening):'0'))),
          h('tr',null,h('td',null,'Purchases — vendor bills with category Liquor Purchase'),h('td',{style:{fontWeight:700}},money(bc.purchases))),
          h('tr',null,h('td',null,'Closing liquor stock (₹)'),h('td',null,numIn('closingBar'))),
          h('tr',null,h('td',null,h('b',null,'Consumption')),h('td',{style:{fontWeight:700}},money(bc.consumption))),
          h('tr',null,h('td',null,'Target liquor cost %'),h('td',null,h('input',{type:'number',className:'form-control',style:{width:100},disabled:!editable,value:st.barTarget,onChange:e=>setSetting('barTarget',e.target.value)}))))))),
    ingForm&&h('div',{className:'modal-overlay',onClick:()=>setIngForm(null)},h('div',{className:'modal',style:{width:480},onClick:e=>e.stopPropagation()},
      h('div',{className:'modal-title'},ingForm.id?'Edit ingredient':'Add ingredient'),
      h('div',{className:'form-group'},h('label',null,'Name *'),h('input',{className:'form-control',value:ingForm.name,onChange:e=>setIngForm(f=>({...f,name:e.target.value})),placeholder:'e.g. Paneer'})),
      h('div',{className:'form-row cols3'},
        h('div',{className:'form-group'},h('label',null,'Unit'),h('select',{className:'form-control',value:ingForm.unit,onChange:e=>setIngForm(f=>({...f,unit:e.target.value}))},['kg','g','l','ml','pc','dozen','pack'].map(u=>h('option',{key:u},u)))),
        h('div',{className:'form-group'},h('label',null,'Price per unit (₹)'),h('input',{type:'number',className:'form-control',value:ingForm.price,onChange:e=>setIngForm(f=>({...f,price:e.target.value}))})),
        h('div',{className:'form-group'},h('label',null,'Yield %'),h('input',{type:'number',className:'form-control',value:ingForm.yieldPct,onChange:e=>setIngForm(f=>({...f,yieldPct:e.target.value}))}))),
      h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:()=>setIngForm(null)},'Cancel'),h('button',{className:'btn btn-primary',onClick:saveIng},'Save')))),
    recForm&&h('div',{className:'modal-overlay',onClick:()=>setRecForm(null)},h('div',{className:'modal',style:{width:620},onClick:e=>e.stopPropagation()},
      h('div',{className:'modal-title'},recForm.id?'Edit recipe':'Add recipe'),
      h('div',{className:'form-row cols2'},
        h('div',{className:'form-group'},h('label',null,'Dish name *'),h('input',{className:'form-control',value:recForm.name,onChange:e=>setRecForm(f=>({...f,name:e.target.value})),placeholder:'e.g. Paneer Butter Masala'})),
        h('div',{className:'form-group'},h('label',null,'Category'),h('input',{className:'form-control',value:recForm.category,onChange:e=>setRecForm(f=>({...f,category:e.target.value})),placeholder:'e.g. Main course'}))),
      h('div',{className:'form-row cols2'},
        h('div',{className:'form-group'},h('label',null,'Menu price (₹, excl. GST)'),h('input',{type:'number',className:'form-control',value:recForm.price,onChange:e=>setRecForm(f=>({...f,price:e.target.value}))})),
        h('div',{className:'form-group'},h('label',null,'Portions this recipe makes'),h('input',{type:'number',className:'form-control',value:recForm.portions,onChange:e=>setRecForm(f=>({...f,portions:e.target.value}))}))),
      h('div',{style:{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',margin:'4px 0 6px'}},'Ingredients'),
      (recForm.lines||[]).map((l,i)=>h('div',{key:i,style:{display:'grid',gridTemplateColumns:'1fr 120px 110px 32px',gap:8,marginBottom:6,alignItems:'center'}},
        h('select',{className:'form-control',value:l.ingId,onChange:e=>setRecForm(f=>({...f,lines:f.lines.map((x,j)=>j===i?{...x,ingId:e.target.value}:x)}))},
          h('option',{value:''},'— Ingredient —'),ings.map(g=>h('option',{key:g.id,value:g.id},g.name+' ('+g.unit+')'))),
        h('input',{type:'number',className:'form-control',placeholder:'Qty',value:l.qty,onChange:e=>setRecForm(f=>({...f,lines:f.lines.map((x,j)=>j===i?{...x,qty:e.target.value}:x)}))}),
        h('div',{style:{fontSize:12,color:'var(--text2)',textAlign:'right'}},'₹'+(rNum(l.qty)*ingUnitCost(ings.find(g=>g.id===l.ingId))).toFixed(2)),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setRecForm(f=>({...f,lines:f.lines.filter((x,j)=>j!==i)}))},'✕'))),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setRecForm(f=>({...f,lines:[...(f.lines||[]),{ingId:'',qty:''}]}))},'+ Add ingredient'),
      ings.length===0&&h('div',{style:{fontSize:12,color:'var(--orange)',marginTop:6}},'Add ingredients first (left panel).'),
      (()=>{const c=recipeCost(recForm,ings);const p=rNum(recForm.price);return h('div',{style:{marginTop:10,fontSize:13}},'Cost per portion ',h('b',null,'₹'+c.toFixed(2)),p?' · food cost '+(Math.round(c/p*1000)/10)+'% · margin '+rupee(Math.round(p-c)):'');})(),
      h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:()=>setRecForm(null)},'Cancel'),h('button',{className:'btn btn-primary',onClick:saveRec},'Save recipe'))))
  );
}

function ServiceChargeSheet({salon,period}={}){
  const h=React.createElement;
  const sid=salon&&salon.id;
  const {toast,error:toastError}=useToast();
  const cal=periodToCalendar(period)||{year:new Date().getFullYear(),month:new Date().getMonth()};
  const ym=rYm(cal.year,cal.month);
  const editable=userCanEditSheet(currentSessionUser(),sid,'service-charge');
  const [sc,setSc]=useState(()=>loadServiceCharge(sid));
  useEffect(()=>{setSc(loadServiceCharge(sid));},[sid]);
  const persist=next=>{setSc(next);saveServiceCharge(sid,next);};
  const setS=(k,v)=>persist({...sc,settings:{...sc.settings,[k]:v}});
  const mon=sc.months[ym]||{};
  const setM=(k,v)=>persist({...sc,months:{...sc.months,[ym]:{...mon,[k]:v}}});
  const o=outletSettings(sid);
  const split=serviceChargeSplitFor(sid,cal.year,cal.month);
  const locked=!!mon.final;
  const desigs=Array.from(new Set(getEmployeesForMonth(cal.year,cal.month,sid).filter(e=>e.status==='Active').map(e=>e.desig||'—')));
  const money=v=>rupee(Math.round(v));
  const exportXlsx=async()=>{
    try{
      const rows=[['Service charge — '+salon.name+' — '+rMonthLabel(cal.year,cal.month)],
        ['Method',(SC_METHODS.find(x=>x.id===sc.settings.method)||{}).label],['Collected',split.collected],['House share',split.house],['Distributed',split.distributable],[],
        ['Employee','Designation','Points','Days present','Amount'],...split.rows.map(r=>[r.name,r.desig,r.points,r.days,r.amount]),['Total','','','',split.rows.reduce((s,r)=>s+r.amount,0)]];
      rDownloadBlob(await exportReportExcelBlob('Service charge',rows),'Service_Charge_'+ym+'.xlsx');
    }catch(e){toastError('Could not build the Excel file');}
  };
  const dis=!editable||locked;
  return h('div',{className:'fade-in'},
    h('div',{className:'section-header'},h('div',null,h('div',{className:'page-title'},'Service Charge'),
      h('div',{className:'page-sub'},'Service charge collected and how it is shared with staff — '+rMonthLabel(cal.year,cal.month))),
      h('div',{style:{display:'flex',gap:8}},h('button',{className:'btn btn-ghost btn-sm',onClick:exportXlsx},'⬇ Export Excel'),
        editable&&h('button',{className:'btn btn-sm '+(locked?'btn-ghost':'btn-success'),onClick:()=>setM('final',!locked)},locked?'↩ Reopen month':'✓ Mark month final'))),
    !o.serviceChargeApplicable&&h('div',{className:'attention-card attention-card-sm',style:{marginBottom:12}},'Service charge is switched off for this outlet in Master Sheet → Edit outlet → Restaurant settings. You can still prepare the sharing rules here.'),
    h('div',{className:'grid4',style:{marginBottom:16}},
      h(RCard,{label:'Collected',val:money(split.collected),sub:o.serviceChargeRate?'charged at '+o.serviceChargeRate+'% on bills':'',color:'blue'}),
      h(RCard,{label:'House share',val:money(split.house),sub:(rNum(sc.settings.housePct)||0)+'% kept for breakage / admin',color:'amber'}),
      h(RCard,{label:'Shared with staff',val:money(split.distributable),sub:split.rows.length+' staff',color:'green'}),
      h(RCard,{label:'Status',val:locked?'Final':'Draft',sub:locked?'locked for this month':'mark final after checking',color:locked?'green':'purple'})),
    h('div',{className:'grid2',style:{alignItems:'start'}},
      h('div',{className:'card'},h('div',{className:'card-title'},'Sharing rules (outlet setting)'),
        h('div',{className:'form-group'},h('label',null,'How is it shared?'),h('select',{className:'form-control',disabled:!editable,value:sc.settings.method,onChange:e=>setS('method',e.target.value)},SC_METHODS.map(m=>h('option',{key:m.id,value:m.id},m.label)))),
        h('div',{className:'form-row cols2'},
          h('div',{className:'form-group'},h('label',null,'House share % (kept by the outlet)'),h('input',{type:'number',className:'form-control',disabled:!editable,value:sc.settings.housePct,onChange:e=>setS('housePct',e.target.value)})),
          h('label',{style:{display:'flex',gap:8,alignItems:'center',fontSize:12.5,marginTop:22}},h('input',{type:'checkbox',disabled:!editable,checked:!!sc.settings.excludeManagers,onChange:e=>setS('excludeManagers',e.target.checked)}),'Exclude managers')),
        (sc.settings.method==='points'||sc.settings.method==='points_days')&&h('div',null,
          h('div',{style:{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',margin:'6px 0'}},'Points by designation'),
          desigs.map(d=>h('div',{key:d,style:{display:'flex',alignItems:'center',gap:8,marginBottom:6}},h('div',{style:{flex:1,fontSize:13}},d),
            h('input',{type:'number',className:'form-control',style:{width:90},disabled:!editable,placeholder:'1',value:(sc.settings.points||{})[d]==null?'':(sc.settings.points||{})[d],
              onChange:e=>setS('points',{...(sc.settings.points||{}),[d]:e.target.value})})))),
        h('div',{className:'help-note'},'Days present come from Attendance (total days payable). Change the method any time — the month’s split recalculates until the month is marked final.')),
      h('div',{className:'card'},h('div',{className:'card-title'},'This month'),
        h('div',{className:'form-group'},h('label',null,'Service charge collected this month (₹, from the POS report)'),
          h('input',{type:'number',className:'form-control',style:{maxWidth:220},disabled:dis,value:mon.collected==null?'':mon.collected,onChange:e=>setM('collected',e.target.value)})),
        split.rows.length===0?h('div',{style:{color:'var(--text3)',fontSize:12.5}},'No active employees this month — add staff in Master Salary.'):
        h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Employee','Designation','Points','Days','Share'].map(t=>h('th',{key:t},t)))),
          h('tbody',null,split.rows.map(r=>h('tr',{key:r.id},h('td',null,r.name),h('td',null,r.desig),h('td',{style:{textAlign:'right'}},r.points),h('td',{style:{textAlign:'right'}},r.days),h('td',{style:{textAlign:'right',fontWeight:600}},money(r.amount)))),
            h('tr',{style:{fontWeight:700}},h('td',{colSpan:4},'Total'),h('td',{style:{textAlign:'right'}},money(split.rows.reduce((s,r)=>s+r.amount,0))))))))));
}
