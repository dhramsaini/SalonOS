

// Billing moved to js/40-fd-billing.js (front-desk rewrite).

function CollaborationReview({user,salons,submissions,setSubmissions}){
  const {toast}=useToast();
  const [filter,setFilter]=useState('All');
  const [note,setNote]=useState({});
  const canReview=['Super Admin','Reviewer'].includes(user.role);
  const visible=submissions.filter(x=>userCanSeeOutlet(user,x.outletId)).filter(x=>filter==='All'||x.status===filter);
  const updateStatus=(id,status)=>{
    setSubmissions(prev=>prev.map(x=>x.id===id?{...x,status,reviewedBy:user.name,reviewedAt:new Date().toISOString(),remarks:note[id]||x.remarks}:x));
    toast('Submission marked '+status.toLowerCase(),'success');
  };
  const createSubmission=()=>{
    const outletId=user.outletIds[0]||salons[0]?.id;
    const outlet=salons.find(s=>s.id===outletId);
    const item={id:'SUB-'+Date.now(),outletId,outlet:outlet?.name||'Outlet',period:new Date().toLocaleDateString('en-IN',{month:'long',year:'numeric'}),module:'Monthly Operations',submittedBy:user.name,submittedAt:new Date().toISOString(),status:'Submitted',remarks:'',reviewedBy:'',reviewedAt:''};
    setSubmissions(p=>[item,...p]);toast('Data submitted for review','success');
  };
  return React.createElement('div',{className:'fade-in'},
    React.createElement(SummaryApprovalsPanel,{user,salons}),
    React.createElement(PettyApprovalsPanel,{user,salons}),
    React.createElement('div',{className:'section-header'},React.createElement('div',null,React.createElement('div',{className:'page-title'},canReview?'Review Centre':'My Submissions'),React.createElement('div',{className:'page-sub'},canReview?'Review and approve data submitted by outlet users':'Submit outlet data and track review status')),!canReview&&React.createElement('button',{className:'btn btn-primary',onClick:createSubmission},'+ Submit Current Data')),
    React.createElement('div',{className:'grid4',style:{marginBottom:16}},['Submitted','Under Review','Approved','Returned'].map((st,i)=>React.createElement('div',{key:st,className:'metric-card '+['blue','amber','green','red'][i]},React.createElement('div',{className:'metric-label'},st),React.createElement('div',{className:'metric-value'},visible.filter(x=>x.status===st).length)))),
    React.createElement('div',{style:{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}},['All','Submitted','Under Review','Approved','Returned'].map(st=>React.createElement('button',{key:st,className:'btn '+(filter===st?'btn-primary':'btn-ghost')+' btn-sm',onClick:()=>setFilter(st)},st))),
    React.createElement('div',{className:'card'},visible.length===0?React.createElement('div',{className:'empty-state'},React.createElement('div',{className:'empty-icon'},'📥'),React.createElement('div',{className:'empty-title'},'No submissions found')):React.createElement('div',{className:'table-wrap'},React.createElement('table',null,
      React.createElement('thead',null,React.createElement('tr',null,['Submission','Outlet','Period','Submitted By','Submitted At','Status','Review'].map(h=>React.createElement('th',{key:h},h)))),
      React.createElement('tbody',null,visible.map(x=>React.createElement('tr',{key:x.id},
        React.createElement('td',null,React.createElement('div',{style:{fontWeight:600,color:'var(--text)'}},x.module),React.createElement('div',{style:{fontSize:10,color:'var(--text3)'}},x.id)),
        React.createElement('td',null,x.outlet),React.createElement('td',null,x.period),React.createElement('td',null,x.submittedBy),React.createElement('td',null,new Date(x.submittedAt).toLocaleString('en-IN')),
        React.createElement('td',null,React.createElement('span',{className:'badge '+({Approved:'badge-green',Returned:'badge-red',Submitted:'badge-blue','Under Review':'badge-amber'}[x.status]||'badge-gray')},x.status),x.remarks&&React.createElement('div',{style:{fontSize:10,color:'var(--text3)',marginTop:5,maxWidth:180}},x.remarks)),
        React.createElement('td',null,canReview?React.createElement('div',{style:{minWidth:230}},React.createElement('textarea',{className:'form-control review-note',placeholder:'Review remarks',value:note[x.id]??x.remarks,onChange:e=>setNote(n=>({...n,[x.id]:e.target.value}))}),React.createElement('div',{style:{display:'flex',gap:5,marginTop:6}},React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>updateStatus(x.id,'Under Review')},'Review'),React.createElement('button',{className:'btn btn-success btn-sm',onClick:()=>updateStatus(x.id,'Approved')},'Approve'),React.createElement('button',{className:'btn btn-danger btn-sm',onClick:()=>updateStatus(x.id,'Returned')},'Return'))):React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},x.reviewedBy?'Reviewed by '+x.reviewedBy:'Awaiting review'))
      )))
    )))
  );
}

/* ==================== FRONT DESK MODULES ==================== */
const h=React.createElement;
const FD_STAFF=['Meera Joshi','Arjun Singh','Kavya Reddy','Pooja Patel','Deepak Nair'];
const FD_ROLE={'Meera Joshi':'Senior stylist','Arjun Singh':'Stylist','Kavya Reddy':'Beautician','Pooja Patel':'Beautician','Deepak Nair':'Spa therapist'};
const FD_OPEN=9, FD_CLOSE=21;                      // 9am to 9pm
const FD_SLOTS=(()=>{const a=[];for(let m=FD_OPEN*60;m<FD_CLOSE*60;m+=30)a.push(m);return a})();
const fdT=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const fdT12=m=>{const hh=Math.floor(m/60),mm=m%60;const ap=hh>=12?'PM':'AM';const H=hh%12===0?12:hh%12;return H+':'+String(mm).padStart(2,'0')+' '+ap};
const inr=n=>'₹'+Math.round(n||0).toLocaleString('en-IN');
const FD_DUR={'Haircut & Styling':45,'Hair Spa':60,'Hair Colour (Global)':120,'Keratin Treatment':180,'Facial — Gold':60,'Cleanup':45,'Manicure':45,'Pedicure':45,'Threading (Eyebrow)':15,'Full Arms Waxing':30,'Bridal Makeup':180,'Head Massage':30};
const fdDur=s=>FD_DUR[s]||45;
const fdRate=s=>{const x=BILL_SERVICES.find(v=>v.name===s);return x?x.rate:600};
const AP_CLASS={'Booked':'ap-booked','Confirmed':'ap-confirmed','In chair':'ap-chair','Done':'ap-done','No-show':'ap-noshow','Cancelled':'ap-cancel'};
const AP_COLOR={'Booked':'var(--blue)','Confirmed':'var(--teal)','In chair':'var(--orange)','Done':'var(--green)','No-show':'var(--red)','Cancelled':'var(--text3)'};
const fdRand=(a,b)=>{let x=Math.sin(a*127.1+b*311.7)*43758.5453;return x-Math.floor(x)};
const fdDateStr=d=>localIsoOf(d);
const fdAddDays=(s,n)=>{const d=new Date(s+'T00:00:00');d.setDate(d.getDate()+n);return fdDateStr(d)};
const fdPretty=s=>new Date(s+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});
const fdPhone=(sid,i)=>'9'+String(Math.floor(fdRand(sid*7+i,3)*899999999)+100000000).slice(0,9);

/* Appointment Book → js/41-fd-appointments.js */
/* Clients → js/42-fd-clients.js */
const segOf=c=>c.since>90?'Lapsed':c.visits>=12?'VIP':c.visits>=4?'Regular':'New';
/* Inventory → js/43-fd-inventory.js */
function CommandPalette({open,setOpen,actions}){
  const [q,setQ]=useState('');
  const [i,setI]=useState(0);
  const ref=useRef(null);
  useEffect(()=>{if(open){setQ('');setI(0);setTimeout(()=>ref.current&&ref.current.focus(),30)}},[open]);
  if(!open)return null;
  const list=actions.filter(a=>(a.label+' '+a.group).toLowerCase().includes(q.toLowerCase())).slice(0,40);
  const run=(a)=>{if(a){a.run();setOpen(false)}};
  const key=e=>{
    if(e.key==='Escape')return setOpen(false);
    if(e.key==='ArrowDown'){e.preventDefault();setI(x=>Math.min(x+1,list.length-1))}
    if(e.key==='ArrowUp'){e.preventDefault();setI(x=>Math.max(x-1,0))}
    if(e.key==='Enter'){e.preventDefault();run(list[i])}
  };
  return h('div',{className:'cp-ov',onClick:()=>setOpen(false)},
    h('div',{className:'cp',onClick:e=>e.stopPropagation()},
      h('input',{ref,value:q,placeholder:'Jump to an outlet, sheet or report…',
        onChange:e=>{setQ(e.target.value);setI(0)},onKeyDown:key}),
      h('div',{className:'list'},
        list.length?list.map((a,n)=>h('div',{key:a.group+a.label,className:'it '+(n===i?'on':''),
          onMouseEnter:()=>setI(n),onClick:()=>run(a)},
          h('span',null,a.icon||'→'),h('span',null,a.label),h('span',{className:'grp'},a.group))):
          h('div',{className:'it'},'Nothing matches “'+q+'”')),
      h('div',{className:'foot'},
        h('span',null,h('kbd',null,'↑'),' ',h('kbd',null,'↓'),' navigate'),
        h('span',null,h('kbd',null,'Enter'),' open'),
        h('span',null,h('kbd',null,'Esc'),' close'))));
}

/* ---------- OUTLET MONTHLY P&L ---------- */
const PL_MONTHS=['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
const PL_STRUCT=[
  {sec:'Revenue',sign:1,src:'Collection Reco (Imported Data Preview)',lines:[
    ['Revenue from Operations - Cash Sale',0.15,0.10],['Revenue from Operations - Card Sale',0.35,0.08],
    ['Revenue from Operations - UPI Sale',0.42,0.07],['Other Income',0.03,0.30]]},
  {sec:'Direct cost of service',sign:-1,src:'Daily Sales & Exp.',lines:[]},
  {sec:'Employee cost',sign:-1,src:'Master Salary + Salary Working + Incentive Working + Daily Sales & Exp.',lines:[]},
  {sec:'Operating expenses',sign:-1,src:'Daily Sales & Exp. + Recurring Expenses + Bank Statement + Vendor Sheet',lines:[]},
];
const PL_BELOW=[['Depreciation on equipment & interiors',0.031,0.00],['Interest on equipment loan',0.014,0.01]];
// Real vendor-invoice total for a given Vendor category, in a calendar month — an invoice's own
// Category (if set on the invoice) wins over its vendor's default category, so a one-off invoice
// can be reclassified without having to change the vendor's own category. Performa Invoices are
// excluded, same as everywhere else — they're not a real payable yet.
// What each vendor invoice adds to expenses, dated by its invoice date. Normally a Performa Invoice
// adds nothing. With the outlet's "Treat Performa Invoice (PI) as an expense" (Master Sheet) on, a
// PI adds its full amount in its own month, and the first actual invoice booked against it
// (linkedPI) adds only the difference — actual − PI, short or excess, possibly negative — in the
// actual invoice's month. Any further actual invoices against the same PI add their full amount.
function vendorInvoiceExpenseEntries(salonId){
  const salon=outletSettings(salonId);
  const piOn=!!salon.piAsExpense;
  const invoices=loadVendorInvoices(salonId);
  const isPI=inv=>inv.docNature==='Performa Invoice';
  const piByKey={};
  const out=[];
  if(piOn)invoices.forEach(inv=>{if(isPI(inv)){piByKey[inv.vendorId+'|'+inv.invoiceNo]=inv;out.push({inv,amount:Number(inv.amount)||0,pi:null});}});
  const used=new Set();
  invoices.filter(inv=>!isPI(inv))
    .sort((a,b)=>{const da=toISO(a.invoiceDate)||'',db=toISO(b.invoiceDate)||'';return da<db?-1:da>db?1:0;})
    .forEach(inv=>{
      let amount=Number(inv.amount)||0,pi=null;
      if(piOn&&inv.linkedPI&&piByKey[inv.linkedPI]&&!used.has(inv.linkedPI)){
        pi=piByKey[inv.linkedPI];used.add(inv.linkedPI);
        amount=Math.round((amount-(Number(pi.amount)||0))*100)/100;
      }
      out.push({inv,amount,pi});
    });
  return out;
}
// excludeIds: invoices already counted another way (bills of a Variable recurring expense, which
// are spread over the months they cover instead of landing whole in their invoice month).
function vendorInvoiceCategorySumFor(salonId,year,month,categoryName,excludeIds){
  return vendorInvoiceCategoryBreakupFor(salonId,year,month,categoryName,excludeIds).reduce((s,r)=>s+r.amount,0);
}
// Same category-matching + same-month filter as vendorInvoiceCategorySumFor above, but returns
// the individual invoices instead of just their total — Vendor Name, Invoice Date, and Invoice
// No, for the P&L's "Purchase of Cosmetic" (and any other vendor-invoice-backed) line drill-down.
function vendorInvoiceCategoryBreakupFor(salonId,year,month,categoryName,excludeIds){
  const vendorsList=loadVendors(salonId);
  const out=[];
  vendorInvoiceExpenseEntries(salonId).forEach(({inv,amount,pi})=>{
    if(excludeIds&&excludeIds.has(inv.id))return;
    const vendor=vendorsList.find(v=>v.id===inv.vendorId);
    const effectiveCat=inv.category||(vendor?vendor.cat:'');
    if(effectiveCat!==categoryName)return;
    const sp=typeof billSplitMonths==='function'?billSplitMonths(inv.periodFrom,inv.periodTo):null;
    if(sp&&sp.months>1){
      // A bill for several months (e.g. a 2-month electricity bill) — an equal share in each month it
      // covers. A month that was closed before the bill was entered is left as it was; its share is
      // booked in the latest month of the bill still open (or the bill's own month).
      const t=year*12+month,sh=billShares(amount,sp.months,inv.splitFirst),shareOf=c=>Math.round(sh[c-sp.first]*100)/100;
      const closed=[];let lastOpen=null;
      for(let c=sp.first;c<=sp.last;c++){if(monthClosedBeforeBill(salonId,c,inv))closed.push(c);else lastOpen=c;}
      const bm=monthIndexOfIso(toISO(inv.invoiceDate));
      const u=lastOpen!=null?lastOpen:Math.max(sp.last+1,bm!=null?bm:sp.last+1);
      let amt=0,note='';
      if(t>=sp.first&&t<=sp.last&&!closed.includes(t)){amt+=shareOf(t);note=(t-sp.first+1)+' of '+sp.months+' months';}
      if(t===u&&closed.length){amt+=closed.reduce((a,c)=>a+shareOf(c),0);note=(note?note+' + ':'')+'share of closed '+closed.map(monthLabelOfIndex).join(', ');}
      if(!amt)return;
      out.push({vendorName:vendor?vendor.name:'(vendor deleted)',invoiceDate:inv.invoiceDate,
        invoiceNo:(inv.invoiceNo||'—')+' ('+note+')',docNature:inv.docNature,amount:Math.round(amt*100)/100});
      return;
    }
    const iso=toISO(inv.invoiceDate);
    if(!iso)return;
    const d=new Date(iso+'T00:00:00');
    if(isNaN(d)||d.getFullYear()!==year||d.getMonth()!==month)return;
    out.push({vendorName:vendor?vendor.name:'(vendor deleted)',invoiceDate:inv.invoiceDate,
      invoiceNo:(inv.invoiceNo||'—')+(pi?' (₹'+Math.round(Number(inv.amount)||0).toLocaleString('en-IN')+' − PI '+(pi.invoiceNo||'')+' ₹'+Math.round(Number(pi.amount)||0).toLocaleString('en-IN')+')':''),
      docNature:inv.docNature,amount});
  });
  out.sort((a,b)=>{const da=toISO(a.invoiceDate)||'';const db=toISO(b.invoiceDate)||'';return da<db?-1:da>db?1:0;});
  return out;
}
// The two Direct Cost lines that are real, sourced from Daily Sales & Exp rather than the
// revenue-percentage model the rest of that section still uses. Purchase of Cosmetic also folds
// in real Vendor Sheet invoices categorised "Purchase of Cosmetic" — registered purchases through
// a vendor, plus any small ad-hoc ones entered directly in Daily Sales & Exp.
const PL_DIRECT_REAL_LINES=[
  {name:'Purchase of Cosmetic',group:'Purchase of Cosmetic',alsoVendorCat:'Purchase of Cosmetic'},
  {name:'Unregistered Purchase',group:'Unregistered Purchase'}
];
// Restaurant outlets: food consumption (opening + purchases − closing stock, from Food Cost),
// liquor consumption when the outlet has a bar, packaging and gas.
const PL_DIRECT_RESTAURANT_LINES=[
  {name:'Food Cost (Consumption)',fn:(s,y,m)=>foodCostFor(s,y,m).consumption},
  {name:'Liquor Cost',bar:true,fn:(s,y,m)=>barCostFor(s,y,m).consumption},
  {name:'Packaging Material',group:'Packaging Material',alsoVendorCat:'Packaging Material'},
  {name:'Gas / LPG',group:'Gas / LPG',alsoVendorCat:'Gas / LPG'}
];

// Manual overrides for the two P&L items that have no real, naturally-tracked data source
// anywhere in this app: Other Income (gift cards, membership fees, anything not captured by
// Collection Reco) and Depreciation/Interest (accounting entries that come from a Fixed Asset
// Register / loan schedule, not day-to-day operations). These used to be filled in with a
// seeded-random percentage of revenue — fabricated numbers that looked plausible but weren't
// real. They now default honestly to 0 and are only ever whatever the person actually enters.
function loadPLManualOverrides(salonId){
  try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_pl_manual_overrides',salonId))||'{}');if(v&&typeof v==='object')return v;}catch(e){}
  return{};
}
function savePLManualOverride(salonId,year,month,field,value){
  if(isMonthLockedFor(salonId,year,month)){try{window.alert('That month is locked — the P&L can’t be changed.');}catch(e){}return false;}
  const all=loadPLManualOverrides(salonId);
  const key=year+'-'+month;
  all[key]={...(all[key]||{}),[field]:value};
  safeLocalSet(outletKey('salonos_pl_manual_overrides',salonId),JSON.stringify(all));
}
// Builds a plBuild()-shaped result straight from a Previous Months P&L entry, so a historical,
// manually-entered month and a live, computed month can flow through every screen (Dashboard,
// Monthly P&L, Annual P&L, Reports Hub) identically — same shape, same fields, no special-casing
// needed downstream.
function plFromPreviousRecord(rec){
  const t=ppTotals(rec);
  const src='Previous Months P&L (manually entered)';
  const out={sections:[],below:[],isHistorical:true};
  out.sections.push({sec:'Revenue',sign:1,src,lines:[
    {name:'Revenue from Operations - Cash Sale',amt:Number(rec.cash)||0},
    {name:'Revenue from Operations - Card Sale',amt:Number(rec.card)||0},
    {name:'Revenue from Operations - UPI Sale',amt:Number(rec.upi)||0},
    {name:'Other Income',amt:Number(rec.otherIncome)||0}
  ],tot:t.revenue});
  out.sections.push({sec:'Direct cost of service',sign:-1,src,lines:[{name:'Direct Cost of Service',amt:t.direct}],tot:t.direct});
  out.sections.push({sec:'Employee cost',sign:-1,src,lines:[{name:'Employee Cost',amt:t.emp}],tot:t.emp});
  out.sections.push({sec:'Operating expenses',sign:-1,src,lines:PL_OPEX_LINES.map(l=>({name:l.name,amt:Number(rec.opex&&rec.opex[l.name])||0})),tot:t.opexTotal});
  out.below=[{name:'Depreciation',amt:Number(rec.depreciation)||0},{name:'Interest',amt:Number(rec.interest)||0}];
  out.revenue=t.revenue;out.direct=t.direct;out.gross=t.gross;out.opex=t.opexTotal;out.ebitda=t.ebitda;
  out.belowTot=(Number(rec.depreciation)||0)+(Number(rec.interest)||0);out.pbt=t.pbt;
  return out;
}
// Same category-matching logic as vendorInvoiceCategorySumFor, but sums actual PAYMENTS made
// this month (by payment date, across invoices from any month) rather than invoices booked this
// month (by invoice date) — the gap between the two is real cash movement the P&L doesn't show,
// since Purchase of Cosmetic is recognized on the P&L when the invoice is booked, not when it's
// actually paid.
function vendorPaymentsCategorySumFor(salonId,year,month,categoryName){
  const vendorsList=loadVendors(salonId);
  const invoices=loadVendorInvoices(salonId);
  let sum=0;
  invoices.forEach(inv=>{
    if(inv.docNature==='Performa Invoice')return;
    const vendor=vendorsList.find(v=>v.id===inv.vendorId);
    const effectiveCat=inv.category||(vendor?vendor.cat:'');
    if(effectiveCat!==categoryName)return;
    (inv.payments||[]).forEach(p=>{
      const iso=toISO(p.paidDate);
      if(!iso)return;
      const d=new Date(iso+'T00:00:00');
      if(isNaN(d)||d.getFullYear()!==year||d.getMonth()!==month)return;
      sum+=Number(p.paidAmount)||0;
    });
  });
  return sum;
}
// Manual overrides for the Cash Flow items with no natural source anywhere else in this app:
// Investing Activities (asset purchases/sales — there's no Fixed Asset Register) and Financing
// Activities (loan draw-downs/repayments, owner capital introduced/withdrawn), plus the Opening
// Cash & Bank Balance for the month. Same honest-default-to-0 pattern as Depreciation/Interest/
// Other Income on the P&L itself — real only when the person actually enters it.
function loadCashFlowManualOverrides(salonId){
  try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_cf_manual_overrides',salonId))||'{}');if(v&&typeof v==='object')return v;}catch(e){}
  return{};
}
function saveCashFlowManualOverride(salonId,year,month,field,value){
  const all=loadCashFlowManualOverrides(salonId);
  const key=year+'-'+month;
  all[key]={...(all[key]||{}),[field]:value};
  safeLocalSet(outletKey('salonos_cf_manual_overrides',salonId),JSON.stringify(all));
}
// ── Cash Flow Statement (Indirect Method) — starts from the P&L's own Profit Before Tax and
// reverses out every non-cash / not-yet-cash item already baked into that figure:
//  • Depreciation — a pure book entry, zero cash movement.
//  • The nine Recurring-Expense-driven Operating Expense lines (Rent, Electricity, Royalty, DG
//    Rent, Staff Room Rent, Telephone & Internet, Drycleaning, Professional Fee, Maintenance) —
//    each lands on the P&L as this month's accrual regardless of whether it was actually paid;
//    the gap against what Daily Sales & Exp shows as actually paid this month is real cash
//    retained (or spent beyond the accrual, if overpaid).
//  • Purchase of Cosmetic — booked on the vendor invoice date, paid whenever the invoice is
//    actually settled; same accrual-vs-paid gap, sourced from the Vendor Sheet.
// Investing/Financing Activities and Opening Balance are manual entries (see above) since
// nothing else in this app tracks fixed assets, loans, or owner capital movements.
function cashFlowFor(sid,year,month,cur){
  const overrides=(year!=null&&month!=null)?(loadCashFlowManualOverrides(sid)[year+'-'+month]||{}):{};
  const dep=cur.below.find(l=>/Depreciation/i.test(l.name));
  const depAmt=dep?dep.amt:0;
  // Historical months entered in Previous Months P&L are flat totals with no live line-item
  // detail — computing an accrual-vs-paid gap against today's Recurring Expenses/Vendor Sheet
  // data for a manually-entered past total would be misleading, so those two adjustments are
  // skipped for historical months (Depreciation and the Opening/Investing/Financing overrides
  // still apply normally).
  const isHistorical=!!cur.isHistorical;

  const opexAdj=(!isHistorical&&year!=null&&month!=null)?PL_OPEX_LINES.filter(l=>l.noDaily).map(l=>{
    const a=operatingExpenseAnnexureFor(sid,year,month,l.name);
    const accrued=a?a.recurringTotal:0;
    const paid=a?a.dailyAmt:0;
    return{name:l.name,accrued,paid,gap:accrued-paid};
  }):[];
  const opexGapTotal=opexAdj.reduce((s,l)=>s+l.gap,0);

  const cosmeticBooked=(!isHistorical&&year!=null&&month!=null)?vendorInvoiceCategorySumFor(sid,year,month,'Purchase of Cosmetic'):0;
  const cosmeticPaid=(!isHistorical&&year!=null&&month!=null)?vendorPaymentsCategorySumFor(sid,year,month,'Purchase of Cosmetic'):0;
  const cosmeticGap=cosmeticBooked-cosmeticPaid;

  const investing=Number(overrides.investing)||0;
  const financing=Number(overrides.financing)||0;
  const opening=Number(overrides.opening)||0;

  const operatingCF=cur.pbt+depAmt+opexGapTotal+cosmeticGap;
  const netCF=operatingCF+investing+financing;
  const closing=opening+netCF;

  return{pbt:cur.pbt,depAmt,opexAdj,opexGapTotal,cosmeticBooked,cosmeticPaid,cosmeticGap,operatingCF,investing,financing,netCF,opening,closing};
}
// ── Depreciation — Fixed Asset Register ──────────────────────────────────────────────────────
// Two different statutory methods, chosen automatically by the outlet's own Firm Category
// (Master Sheet → Edit Salon → Firm Details):
//  • Proprietorship / Partnership Firm / LLP → Income Tax Act, 1961, Section 32 — Block of
//    Assets, Written Down Value (WDV) method, rates per Appendix I of the Income Tax Rules, 1962.
//    Assets pool into a handful of blocks; the BLOCK carries a running WDV, not each asset
//    individually. An addition used for 180+ days in its year of purchase gets the full rate;
//    under 180 days gets half the rate (Section 32(1), second proviso).
//  • Private Limited → Companies Act, 2013, Schedule II — per-asset Straight Line Method (SLM)
//    depreciation over the prescribed useful life, standard 5% residual value.
// Both methods let opening assets (owned before this register was set up) be entered directly
// with their current carrying value, rather than requiring the full original purchase history.
const IT_BLOCKS=[
  {key:'building_res',label:'Building — Residential',rate:0.05},
  {key:'building_nonres',label:'Building — Non-Residential (incl. salon premises)',rate:0.10},
  {key:'furniture',label:'Furniture & Fittings (incl. salon chairs, fixtures)',rate:0.10},
  {key:'plant_general',label:'Plant & Machinery — General (salon equipment)',rate:0.15},
  {key:'motor_vehicle',label:'Motor Vehicles',rate:0.15},
  {key:'computers',label:'Computers & Software',rate:0.40},
  {key:'intangibles',label:'Intangible Assets (know-how, licenses, trademarks)',rate:0.25},
];
const COMPANIES_ACT_BLOCKS=[
  {key:'building_rcc',label:'Building — RCC Frame Structure',years:60},
  {key:'building_other',label:'Building — Other than RCC',years:30},
  {key:'furniture',label:'Furniture & Fittings (incl. salon chairs, fixtures)',years:10},
  {key:'office_equipment',label:'Office Equipment',years:5},
  {key:'plant_general',label:'Plant & Machinery — General (salon equipment)',years:15},
  {key:'computers_enduser',label:'Computers — End User Devices',years:3},
  {key:'computers_server',label:'Computers — Servers & Networks',years:6},
  {key:'motor_vehicle',label:'Motor Vehicles — Motor Cars',years:8},
  {key:'motor_2wheeler',label:'Motor Vehicles — Motorcycles/Scooters',years:10},
];
// Proprietorship, Partnership Firm and LLP all file under the Income Tax Act (no separate Firm
// concept for depreciation); only a company follows Schedule II of the Companies Act.
function depreciationMethodFor(firmCategory){return firmCategory==='Private Limited'?'companies_act':'income_tax';}
function depreciationBlocksFor(firmCategory){return depreciationMethodFor(firmCategory)==='companies_act'?COMPANIES_ACT_BLOCKS:IT_BLOCKS;}

function loadFixedAssets(salonId){
  try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_fixed_assets',salonId))||'[]');if(Array.isArray(v))return v;}catch(e){}
  return[];
}
function saveFixedAssets(salonId,assets){safeLocalSet(outletKey('salonos_fixed_assets',salonId),JSON.stringify(assets));}

// ── Bridge to Vendor Sheet — every invoice booked there with Category "Fixed Assets" should be
// depreciable without re-entering it by hand. The one thing Vendor Sheet has no concept of is
// which depreciation Block/Category it belongs to (that's a tax/accounting classification, not a
// purchasing one), so that single choice is captured here per invoice and everything else
// (cost, date, description) is read straight from the invoice — never duplicated or re-typed. ──
function loadFixedAssetBlockOverrides(salonId){
  try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_fixed_asset_blocks',salonId))||'{}');if(v&&typeof v==='object')return v;}catch(e){}
  return{};
}
// Keyed by invoice+line together (not just invoice), since one invoice can carry several
// distinct assets, each needing its own Block.
function fixedAssetLineKey(invoiceId,lineId){return invoiceId+'::'+lineId;}
function saveFixedAssetBlockOverride(salonId,lineKey,block){
  const all=loadFixedAssetBlockOverrides(salonId);
  if(block)all[lineKey]=block;else delete all[lineKey];
  safeLocalSet(outletKey('salonos_fixed_asset_blocks',salonId),JSON.stringify(all));
}
// Every non-Performa Vendor Sheet invoice booked under Category "Fixed Assets".
function vendorFixedAssetInvoices(salonId){
  return loadVendorInvoices(salonId).filter(inv=>(inv.category||'')==='Fixed Assets'&&inv.docNature!=='Performa Invoice');
}
// An invoice's asset line items — the new assetLines array if present, or a single synthetic
// line built from the old assetName field for invoices saved before multi-asset support existed.
function invoiceAssetLines(inv){
  if(inv.assetLines&&inv.assetLines.length)return inv.assetLines;
  if(inv.assetName)return[{id:'AL1',name:inv.assetName,amount:inv.amount}];
  return[];
}
// Joins every asset name on an invoice for display in the Fixed Assets register (e.g. "Salon
// chairs (4); Mirror; Reception desk" for a multi-asset invoice), falling back to the generic
// Description for an invoice with no asset lines at all.
function assetNamesDisplay(inv){
  const lines=invoiceAssetLines(inv).map(l=>l.name).filter(Boolean);
  return lines.length?lines.join('; '):(inv.desc||'—');
}
// Vendor invoice asset LINES that have had a Block assigned, reshaped into the same asset shape
// the depreciation engine already understands — these are never stored as separate "assets",
// only ever derived fresh from the Vendor Sheet + the block-assignment store above.
function vendorDerivedAssets(salonId){
  const overrides=loadFixedAssetBlockOverrides(salonId);
  const out=[];
  vendorFixedAssetInvoices(salonId).forEach(inv=>{
    invoiceAssetLines(inv).forEach(line=>{
      const key=fixedAssetLineKey(inv.id,line.id);
      if(!overrides[key])return;
      out.push({
        id:'VI-'+key,block:overrides[key],description:line.name||inv.desc||'',isOpening:false,
        cost:Number(line.amount)||0,addedDate:toISO(inv.bookingDate||inv.invoiceDate),
        fromVendorInvoice:true,vendorInvoiceId:inv.id,lineId:line.id
      });
    });
  });
  return out;
}
// Single combined pool the depreciation engine actually calculates from — manually-entered
// assets (opening balances, anything not tied to a Vendor Sheet invoice) plus every Vendor Sheet
// Fixed Asset invoice LINE that's been assigned a Block.
function depreciableAssetsFor(salonId){
  return[...loadFixedAssets(salonId),...vendorDerivedAssets(salonId)];
}

// ── FY string helpers — fy is always 'YYYY-YY' e.g. '2025-26', starting 1 April. ──
function fyStartYear(fy){return Number(String(fy).slice(0,4));}
function fyBoundsFromFyString(fy){
  const y=fyStartYear(fy);
  return{startYear:y,start:new Date(y,3,1),end:new Date(y+1,2,31)};
}
function fyOfDate(iso){
  if(!iso)return null;
  const d=new Date(iso+'T00:00:00');
  if(isNaN(d))return null;
  const y=d.getMonth()>=3?d.getFullYear():d.getFullYear()-1;
  return y+'-'+String(y+1).slice(2);
}
function nextFyString(fy){const y=fyStartYear(fy)+1;return y+'-'+String(y+1).slice(2);}
function daysInclusive(a,b){return Math.round((b-a)/86400000)+1;}

// ── Income Tax Act — Block of Assets, WDV method. Depreciation is a running-balance concept, so
// this replays every FY from the earliest one touched by an opening entry or a purchase, up to
// the target FY, carrying each block's WDV forward year over year. In normal use the person sets
// up the register with the block's CURRENT WDV as an opening entry for whichever FY they're in,
// so this loop typically runs once — the multi-year replay only matters if assets were entered
// spanning several years' purchases without an opening entry bringing the block up to date. ──
function itBlockScheduleFor(salonId,targetFy){
  const assets=depreciableAssetsFor(salonId);
  const blockMeta=Object.fromEntries(IT_BLOCKS.map(b=>[b.key,b]));
  const fyKeys=[];
  assets.forEach(a=>{
    if(a.isOpening&&a.openingAsOfFy)fyKeys.push(a.openingAsOfFy);
    if(!a.isOpening&&a.addedDate){const f=fyOfDate(a.addedDate);if(f)fyKeys.push(f);}
  });
  if(!fyKeys.length)return[];
  let fy=fyKeys.reduce((min,f)=>fyStartYear(f)<fyStartYear(min)?f:min,fyKeys[0]);
  const targetStartYear=fyStartYear(targetFy);
  if(fyStartYear(fy)>targetStartYear)return[]; // register only starts after the target FY — nothing to show yet
  const wdv={};
  let rows=[];
  let guard=0;
  while(guard++<100){
    const bounds=fyBoundsFromFyString(fy);
    assets.filter(a=>a.isOpening&&a.openingAsOfFy===fy).forEach(a=>{wdv[a.block]=(wdv[a.block]||0)+(Number(a.openingWDV)||0);});
    const add180={},addLt180={},disposals={};
    assets.filter(a=>!a.isOpening&&a.addedDate&&fyOfDate(a.addedDate)===fy).forEach(a=>{
      const usedDays=daysInclusive(new Date(a.addedDate+'T00:00:00'),bounds.end);
      const bucket=usedDays>=180?add180:addLt180;
      bucket[a.block]=(bucket[a.block]||0)+(Number(a.cost)||0);
    });
    assets.filter(a=>a.disposed&&a.disposalDate&&fyOfDate(a.disposalDate)===fy).forEach(a=>{
      disposals[a.block]=(disposals[a.block]||0)+(Number(a.disposalValue)||Number(a.cost)||0);
    });
    const allBlockKeys=new Set([...Object.keys(wdv),...Object.keys(add180),...Object.keys(addLt180),...Object.keys(disposals)]);
    rows=[];
    allBlockKeys.forEach(key=>{
      const meta=blockMeta[key];
      const rate=meta?meta.rate:0;
      const opening=wdv[key]||0;
      const a180=add180[key]||0,aLt180=addLt180[key]||0,disp=disposals[key]||0;
      const beforeDep=opening+a180+aLt180-disp;
      // Section 32: the rate applies to (Opening WDV + Additions − Sale proceeds during the
      // year), not to Opening WDV alone with disposals only affecting the closing balance
      // afterwards. Sale proceeds are netted against the full-rate portion of the block first.
      const fullRateBase=Math.max(0,opening+a180-disp);
      const dep=Math.min(Math.max(0,beforeDep),fullRateBase*rate+aLt180*rate*0.5);
      const closing=Math.max(0,beforeDep-dep);
      rows.push({block:key,label:meta?meta.label:key,rate,opening,additions180:a180,additionsLt180:aLt180,disposals:disp,depreciation:Math.round(dep),closing:Math.round(closing)});
      wdv[key]=closing;
    });
    if(fy===targetFy)break;
    fy=nextFyString(fy);
  }
  return rows;
}

// ── Companies Act, 2013 — Schedule II, per-asset Straight Line Method. Unlike WDV, SLM's annual
// charge is constant for an asset's life, so each asset's depreciation for the target FY can be
// computed directly from elapsed years — no year-by-year replay needed. ──
function companiesActScheduleFor(salonId,targetFy){
  const assets=depreciableAssetsFor(salonId);
  const blockMeta=Object.fromEntries(COMPANIES_ACT_BLOCKS.map(b=>[b.key,b]));
  const targetStartYear=fyStartYear(targetFy);
  const rows=[];
  assets.forEach(a=>{
    const meta=blockMeta[a.block];
    const usefulLifeYears=a.isOpening?(Number(a.remainingUsefulLifeYears)||0):(meta?meta.years:0);
    if(usefulLifeYears<=0)return;
    const baseValue=a.isOpening?(Number(a.openingWDV)||0):(Number(a.cost)||0);
    if(baseValue<=0)return;
    const residual=baseValue*0.05;
    const annualDep=(baseValue-residual)/usefulLifeYears;
    const startFy=a.isOpening?a.openingAsOfFy:fyOfDate(a.addedDate);
    if(!startFy)return;
    const startYear=fyStartYear(startFy);
    const elapsedYears=targetStartYear-startYear;
    if(elapsedYears<0)return; // not yet acquired/opened as of the target FY
    if(elapsedYears>=usefulLifeYears)return; // fully depreciated — no charge, carrying value sits at residual
    const disposalFy=a.disposed?fyOfDate(a.disposalDate):null;
    if(disposalFy&&fyStartYear(disposalFy)<targetStartYear)return; // disposed in an earlier FY
    let dep=annualDep;
    let note='';
    if(elapsedYears===0&&!a.isOpening){
      // Year of purchase — prorate by days actually in use during this FY.
      const bounds=fyBoundsFromFyString(targetFy);
      const usedDays=daysInclusive(new Date(a.addedDate+'T00:00:00'),bounds.end);
      const fyDays=daysInclusive(bounds.start,bounds.end);
      dep=annualDep*(usedDays/fyDays);
      note='prorated — purchased mid-year';
    }
    if(disposalFy&&fyStartYear(disposalFy)===targetStartYear){
      const bounds=fyBoundsFromFyString(targetFy);
      const usedDays=daysInclusive(bounds.start,new Date(a.disposalDate+'T00:00:00'));
      const fyDays=daysInclusive(bounds.start,bounds.end);
      dep=annualDep*(usedDays/fyDays);
      note=note?note+', disposed mid-year':'prorated — disposed mid-year';
    }
    const carryingAtStart=baseValue-annualDep*elapsedYears;
    const closing=Math.max(residual,carryingAtStart-dep);
    rows.push({id:a.id,block:a.block,label:(meta?meta.label:a.block)+(a.description?' — '+a.description:''),usefulLifeYears,annualDep:Math.round(annualDep),
      opening:Math.round(Math.max(residual,carryingAtStart)),depreciation:Math.round(Math.max(0,dep)),closing:Math.round(closing),note});
  });
  return rows;
}

// The single figure that feeds the P&L — total depreciation for the FY, computed by whichever
// method the outlet's Firm Category requires. Used for the Depreciation tab's FY summary and by
// Cash Flow; the actual month-by-month P&L line uses monthlyDepreciationFor() below instead of a
// flat ÷12 of this, so a December purchase doesn't phantom-charge depreciation back in April.
function annualDepreciationFor(salonId,fy){
  const salonRec=getSalonRecordById(salonId);
  const method=depreciationMethodFor(salonRec&&salonRec.firmCategory);
  const schedule=method==='companies_act'?companiesActScheduleFor(salonId,fy):itBlockScheduleFor(salonId,fy);
  return schedule.reduce((s,r)=>s+(r.depreciation||0),0);
}

// ── The actual monthly depreciation charge for the P&L — unlike a flat (annual ÷ 12), this
// correctly shows ₹0 for any month before an asset existed, and — for an asset purchased during
// the year — divides its depreciation across the exact number of days from its purchase date to
// 31 March of that FY, not whole-month buckets (so a 25 December purchase counts only the ~6
// remaining days of December, not a full month's share):
//  • Companies Act (SLM, per-asset): each asset's own FY figure (already prorated for a mid-year
//    purchase/disposal by companiesActScheduleFor) is divided by the exact number of days it was
//    actually owned that FY, then multiplied by however many of those days fall in the target
//    calendar month.
//  • Income Tax Act (WDV, per-block): the portion of a block's depreciation attributable to its
//    OPENING balance (value that existed since 1 April) is divided the same way across the days
//    of the full FY; the portion attributable to a NEW addition during the year is divided across
//    only the days from its purchase date to 31 March. Disposals are netted at the block level
//    exactly as itBlockScheduleFor already does and, for simplicity, are treated as reducing the
//    opening portion evenly across the year rather than pinpointing the exact disposal date. ──
function daysOwnedInMonth(rangeStart,rangeEnd,year,month){
  const monthStart=new Date(year,month,1);
  const monthEnd=new Date(year,month+1,0);
  const overlapStart=rangeStart>monthStart?rangeStart:monthStart;
  const overlapEnd=rangeEnd<monthEnd?rangeEnd:monthEnd;
  if(overlapStart>overlapEnd)return 0;
  return daysInclusive(overlapStart,overlapEnd);
}
function monthlyDepreciationFor(salonId,year,month){
  const salonRec=getSalonRecordById(salonId);
  const isCompaniesAct=depreciationMethodFor(salonRec&&salonRec.firmCategory)==='companies_act';
  const cal=calToFYMI(year,month);
  const fy=cal.fy;
  const assets=depreciableAssetsFor(salonId);
  const bounds=fyBoundsFromFyString(fy);

  if(isCompaniesAct){
    const rows=companiesActScheduleFor(salonId,fy);
    let total=0;
    rows.forEach(r=>{
      const asset=assets.find(a=>a.id===r.id);
      if(!asset)return;
      let rangeStart=bounds.start;
      if(!asset.isOpening){
        const acqFy=fyOfDate(asset.addedDate);
        if(acqFy===fy)rangeStart=new Date(asset.addedDate+'T00:00:00'); // purchased this FY — start counting from the purchase date, not 1 April
      }
      let rangeEnd=bounds.end;
      if(asset.disposed&&fyOfDate(asset.disposalDate)===fy)rangeEnd=new Date(asset.disposalDate+'T00:00:00');
      const totalDaysOwned=daysInclusive(rangeStart,rangeEnd);
      if(totalDaysOwned<=0)return;
      const daysThisMonth=daysOwnedInMonth(rangeStart,rangeEnd,year,month);
      if(daysThisMonth<=0)return;
      total+=(r.depreciation/totalDaysOwned)*daysThisMonth;
    });
    return Math.round(total);
  }

  const rows=itBlockScheduleFor(salonId,fy);
  const fyTotalDays=daysInclusive(bounds.start,bounds.end);
  let total=0;
  rows.forEach(r=>{
    const disp=r.disposals||0;
    const openingAfterDisposal=Math.max(0,r.opening-disp);
    const openingAnnualDep=openingAfterDisposal*r.rate;
    // Opening portion — existed the whole FY, divided by the FY's actual day count (365/366).
    const openingDaysThisMonth=daysOwnedInMonth(bounds.start,bounds.end,year,month);
    total+=(openingAnnualDep/fyTotalDays)*openingDaysThisMonth;

    // New additions this FY — divided only across the days from purchase date to 31 March.
    assets.filter(a=>!a.isOpening&&a.block===r.block&&a.addedDate&&fyOfDate(a.addedDate)===fy).forEach(a=>{
      const purchaseDate=new Date(a.addedDate+'T00:00:00');
      const totalDaysOwned=daysInclusive(purchaseDate,bounds.end);
      if(totalDaysOwned<=0)return;
      const usedDays=totalDaysOwned; // same measure the 180-day rule in itBlockScheduleFor already uses
      const rateMultiplier=usedDays>=180?1:0.5;
      const assetAnnualDep=(Number(a.cost)||0)*r.rate*rateMultiplier;
      const daysThisMonth=daysOwnedInMonth(purchaseDate,bounds.end,year,month);
      if(daysThisMonth<=0)return;
      total+=(assetAnnualDep/totalDaysOwned)*daysThisMonth;
    });
  });
  return Math.round(total);
}

// ── P&L Variance Analysis — compares two periods' P&L line-by-line (every Revenue/Direct Cost/
// Employee Cost/Operating Expense line, plus section totals and Net Profit), computing % and ₹
// variance for each and flagging which ones are "significant" — a threshold on BOTH % and ₹
// magnitude together, so a huge % swing on a trivial base amount (₹50 → ₹150 is +200%) doesn't
// get flagged the same way as a real material change. Revenue/profit lines: an increase is
// favourable (green). Expense lines: an increase is UNFAVOURABLE (red) — the exact opposite
// colour logic from revenue, computed centrally here so every screen that shows a variance
// agrees on which direction is "good" for which kind of line. ──
function plVarianceLine(label,a,b,kind){ // kind: 'revenue'|'expense'|'profit'
  a=Math.round(a||0);b=Math.round(b||0);
  const diffAmt=b-a;
  const diffPct=a!==0?Math.round((diffAmt/Math.abs(a))*1000)/10:(b!==0?100:0);
  const favourable=kind==='expense'?diffAmt<=0:diffAmt>=0;
  const significant=Math.abs(diffPct)>=10&&Math.abs(diffAmt)>=1000;
  let comment=null;
  if(significant){
    const dir=diffAmt>=0?'increased':'decreased';
    const tone=favourable
      ?(kind==='expense'?'— cost under control':'— positive momentum, keep it up')
      :(kind==='expense'?'— worth a closer look':'— needs attention');
    comment={text:label+' '+dir+' by '+Math.abs(diffPct)+'% (₹'+Math.abs(diffAmt).toLocaleString('en-IN')+') '+tone,favourable};
  }
  return{label,a,b,diffAmt,diffPct,kind,favourable,significant,comment};
}
function buildPnLVariance(salonId,fyA,miA,fyB,miB){
  const dA=plBuild(salonId,fyA,miA),dB=plBuild(salonId,fyB,miB);
  const revA=dA.sections[0].lines,revB=dB.sections[0].lines;
  const dirA=dA.sections[1],dirB=dB.sections[1],empA=dA.sections[2],empB=dB.sections[2],opexA=dA.sections[3],opexB=dB.sections[3];
  const revenueLines=revA.map((l,i)=>plVarianceLine(l.name.replace('Revenue from Operations - ',''),l.amt,revB[i]?revB[i].amt:0,'revenue'));
  // Match by line name (not position) so a line present in one period but not the other still
  // compares against ₹0 rather than being silently dropped from the report.
  const matchLines=(linesA,linesB,kind)=>{
    const names=Array.from(new Set([...(linesA||[]).map(l=>l.name),...(linesB||[]).map(l=>l.name)]));
    return names.map(name=>{
      const a=(linesA||[]).find(l=>l.name===name);const b=(linesB||[]).find(l=>l.name===name);
      return plVarianceLine(name,a?a.amt:0,b?b.amt:0,kind);
    });
  };
  const directLines=matchLines(dirA.lines,dirB.lines,'expense');
  const empLines=matchLines(empA.lines,empB.lines,'expense');
  const opexLines=matchLines(opexA.lines,opexB.lines,'expense');
  const totals=[
    plVarianceLine('Total Revenue',dA.revenue,dB.revenue,'revenue'),
    plVarianceLine('Direct Cost of Service',dA.direct,dB.direct,'expense'),
    plVarianceLine('Gross Profit',dA.gross,dB.gross,'profit'),
    plVarianceLine('Employee Cost',empA.tot,empB.tot,'expense'),
    plVarianceLine('Operating Expenses',opexA.tot,opexB.tot,'expense'),
    plVarianceLine('EBITDA',dA.ebitda,dB.ebitda,'profit'),
    plVarianceLine('Net Profit (PBT)',dA.pbt,dB.pbt,'profit'),
  ];
  const comments=[...revenueLines,...directLines,...empLines,...opexLines,...totals]
    .filter(l=>l.comment).sort((x,y)=>Math.abs(y.diffAmt)-Math.abs(x.diffAmt));
  return{dA,dB,revenueLines,directLines,empLines,opexLines,totals,comments};
}
function plBuild(sid,fy,mi){
  const cal=periodToCalendar({fy,mi});
  // A historical month entered in Previous Months P&L takes over entirely — computing a "live"
  // P&L from Collection Reco/Daily Sales & Exp for a month that was never tracked live here would
  // just be zeros, which is worse than honestly using what was actually recorded for it.
  if(cal){
    const prevRecord=loadPreviousPnL(sid).find(r=>r.year===cal.year&&r.month===cal.month);
    if(prevRecord)return plFromPreviousRecord(prevRecord);
  }
  // Real revenue for the month, straight from Collection Reco's Imported Data Preview — the
  // /1.05 backs GST out of the gross collected amount to arrive at the revenue figure.
  const coll=cal?plRevenueGrossFor(sid,cal.year,cal.month):{cash:0,card:0,upi:0};
  const realCash=coll.cash/1.05,realCard=coll.card/1.05,realUpi=coll.upi/1.05;
  const overrides=cal?(loadPLManualOverrides(sid)[cal.year+'-'+cal.month]||{}):{};
  const otherIncome=Number(overrides.otherIncome)||0;
  const out={sections:[],below:[]};
  let revTotal=0,directTotal=0,opexTotal=0;
  PL_STRUCT.forEach((S,si)=>{
    if(S.sec==='Revenue'){
      // Restaurant: counter sales from Daily Sales & Exp (÷ 1.05 for 5% GST), Swiggy / Zomato food
      // sales from their payouts, bar sales and service charge when the outlet has them.
      const rest=cal&&isRestaurantOutlet(sid);
      const ro=rest?outletSettings(sid):null;
      const rc=rest?restaurantCounterSalesFor(sid,cal.year,cal.month):null;
      const lines=rest?[
        {name:'Revenue from Operations - Cash Sale',amt:rc.cash},
        {name:'Revenue from Operations - Card Sale',amt:rc.card},
        {name:'Revenue from Operations - UPI Sale',amt:rc.upi},
        {name:'Revenue from Operations - Swiggy',amt:aggregatorSalesFor(sid,cal.year,cal.month,'Swiggy')},
        {name:'Revenue from Operations - Zomato',amt:aggregatorSalesFor(sid,cal.year,cal.month,'Zomato')},
        {name:'Revenue from Operations - EazyDiner',amt:aggregatorSalesFor(sid,cal.year,cal.month,'EazyDiner')},
        {name:'Revenue from Operations - Ownly',amt:aggregatorSalesFor(sid,cal.year,cal.month,'Ownly')},
        {name:'Revenue from Operations - Eatby Minutes',amt:aggregatorSalesFor(sid,cal.year,cal.month,'Eatby Minutes')},
        ...(ro.servesLiquor?[{name:'Revenue from Operations - Bar Sale',amt:barSalesFor(sid,cal.year,cal.month)}]:[]),
        ...(ro.serviceChargeApplicable?[{name:'Service Charge Collected',amt:serviceChargeCollectedFor(sid,cal.year,cal.month)}]:[]),
        {name:'Other Income',amt:otherIncome}
      ]:[
        {name:'Revenue from Operations - Cash Sale',amt:Math.round(realCash)},
        {name:'Revenue from Operations - Card Sale',amt:Math.round(realCard)},
        {name:'Revenue from Operations - UPI Sale',amt:Math.round(realUpi)},
        {name:'Other Income',amt:otherIncome}
      ];
      const tot=lines.reduce((t,l)=>t+l.amt,0);
      revTotal+=tot;
      out.sections.push({...S,lines,tot});
      return;
    }
    // Employee cost is built directly from Master Salary + Salary Working + Incentive Working +
    // Daily Sales & Exp — not the generic revenue-percentage model used for the leftover
    // synthetic sections.
    if(S.sec==='Employee cost'&&cal){
      const ec=employeeCostFor(sid,cal.year,cal.month);
      opexTotal+=ec.tot;
      out.sections.push({...S,lines:ec.lines,tot:ec.tot,detail:ec.detail});
      return;
    }
    // Operating expenses is entirely real, sourced from Daily Sales & Exp. (and Bank Statement
    // for the Bank Charges line) — see operatingExpensesFor / PL_OPEX_LINES.
    if(S.sec==='Operating expenses'&&cal){
      const oe=operatingExpensesFor(sid,cal.year,cal.month);
      opexTotal+=oe.tot;
      out.sections.push({...S,lines:oe.lines,tot:oe.tot});
      return;
    }
    // Direct cost of service — the two real lines from Daily Sales & Exp / Vendor invoices;
    // PL_STRUCT's own `lines` for this section is empty, so there's nothing synthetic left here.
    const directDefs=isRestaurantOutlet(sid)?PL_DIRECT_RESTAURANT_LINES.filter(l=>!l.bar||outletSettings(sid).servesLiquor):PL_DIRECT_REAL_LINES;
    const extraLines=(S.sec==='Direct cost of service'&&cal)
      ?directDefs.map(l=>({name:l.name,amt:l.fn?Math.round(l.fn(sid,cal.year,cal.month)||0):dailySalesGroupSumFor(sid,cal.year,cal.month,l.group)+(l.alsoVendorCat?vendorInvoiceCategorySumFor(sid,cal.year,cal.month,l.alsoVendorCat):0)}))
      :[];
    const lines=extraLines;
    const tot=lines.reduce((t,l)=>t+l.amt,0);
    if(S.sec==='Direct cost of service')directTotal+=tot;
    else opexTotal+=tot;
    out.sections.push({...S,lines,tot});
  });
  // Depreciation defaults to the Fixed Asset Register's calculated monthly share (annual ÷ 12)
  // unless this specific month has its own manual override on file — same override-takes-
  // precedence convention as every other computed-but-editable line on this P&L. Interest has no
  // automatic source anywhere in this app, so it stays manual-only, defaulting to 0.
  const hasDepOverride=cal&&Object.prototype.hasOwnProperty.call(overrides,'depreciation');
  const depAuto=cal?monthlyDepreciationFor(sid,cal.year,cal.month):0;
  out.below=PL_BELOW.map((l,i)=>({name:l[0],amt:i===0?(hasDepOverride?Number(overrides.depreciation)||0:depAuto):(Number(overrides.interest)||0)}));
  out.revenue=revTotal;
  out.direct=directTotal;
  out.gross=revTotal-directTotal;
  out.opex=opexTotal;
  out.ebitda=out.gross-opexTotal;
  out.belowTot=out.below.reduce((t,l)=>t+l.amt,0);
  out.pbt=out.ebitda-out.belowTot;
  return out;
}