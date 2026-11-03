// ════════════════════════════════════════════════════════════════════════════════════════════════
// P&L (Monthly) → "Vendor bills vs P&L" (Controls → Month close → pnlAllVendorBills).
// Every vendor bill (not a Performa Invoice) of the month — by the date the P&L counts it on
// (plBillIso: booking date) — with the P&L line it lands on, or why it doesn't: Fixed Assets go to
// the asset register, a bill made from a Recurring Expense may be covered by that estimate, and a
// category with no P&L line is flagged.
// ════════════════════════════════════════════════════════════════════════════════════════════════
function pvcLineMap(sid){
  const m={};const rest=typeof isRestaurantOutlet==='function'&&isRestaurantOutlet(sid);
  (rest?(typeof PL_DIRECT_RESTAURANT_LINES!=='undefined'?PL_DIRECT_RESTAURANT_LINES:[]):(typeof PL_DIRECT_REAL_LINES!=='undefined'?PL_DIRECT_REAL_LINES:[])).forEach(l=>{if(l.alsoVendorCat)m[l.alsoVendorCat]={name:l.name};});
  if(rest){m['Food & Raw Material Purchase']={name:'Food & Raw Material Purchase'};m['Liquor Purchase']={name:'Liquor Purchase'};}
  (typeof PL_OPEX_LINES!=='undefined'?PL_OPEX_LINES:[]).filter(l=>(!l.biz||l.biz===bizKeyOf(sid))&&l.alsoVendorCat&&!(l.newMap&&!pnlAllBillsOn(sid))).forEach(l=>{m[l.alsoVendorCat]={name:l.name,line:l};});
  return m;
}
function pvcRows(sid,year,month){
  const ym=year+'-'+String(month+1).padStart(2,'0');const vendors=loadVendors(sid)||[];const map=pvcLineMap(sid);
  const counted=typeof plRecurringCountedIds==='function'?plRecurringCountedIds(sid):new Set();
  return(loadVendorInvoices(sid)||[]).filter(i=>i&&i.docNature!=='Performa Invoice'&&String(plBillIso(sid,i)||'').slice(0,7)===ym).map(i=>{
    const v=vendors.find(x=>x.id===i.vendorId);const cat=i.category||(v?v.cat:'')||'';const hit=map[cat];
    const split=typeof billSplitMonths==='function'&&billSplitMonths(i.periodFrom,i.periodTo);
    let where,ok=true;
    if(cat==='Fixed Assets')where='Fixed asset register (depreciation, not an expense line)';
    else if(!hit){where='⚠ Not in the P&L — category “'+(cat||'none')+'” has no P&L line';ok=false;}
    else if(hit.line&&hit.line.newMap&&!hit.line.vendorSplitRecurring&&i.recurringId&&counted.has(i.recurringId))where='Covered by its Recurring Expense estimate (not added again)';
    else where=hit.name+(hit.line&&hit.line.vendorWinsOverRecurring?' (replaces the recurring estimate)':'');
    if(split&&split.months>1)where+=' · split over '+split.months+' months';
    return{id:i.id,vendor:v?v.name:'(vendor deleted)',no:i.invoiceNo||'—',date:i.bookingDate||i.invoiceDate||'',cat,amount:Number(i.amount)||0,where,ok};
  });
}
function PnlVendorBillCheck({salon,period,onNavTab}){
  const h=React.createElement;const [open,setOpen]=useState(false);const sid=salon&&salon.id;
  if(sid==null||typeof pnlAllBillsOn!=='function'||!pnlAllBillsOn(sid))return null;
  const cal=typeof periodToCalendar==='function'?periodToCalendar(period):null;if(!cal)return null;
  const rows=pvcRows(sid,cal.year,cal.month);if(!rows.length)return null;
  const bad=rows.filter(r=>!r.ok);const R=n=>'₹'+Math.round(n).toLocaleString('en-IN');
  const mon=['January','February','March','April','May','June','July','August','September','October','November','December'][cal.month]+' '+cal.year;
  return h('div',{className:'card',style:{marginBottom:14,border:'1px solid '+(bad.length?'rgba(224,82,82,0.4)':'rgba(76,175,125,0.4)')}},
    h('div',{style:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',cursor:'pointer'},onClick:()=>setOpen(o=>!o)},
      h('b',{style:{fontSize:13}},'🧾 Vendor bills vs P&L — '+mon),
      h('span',{style:{fontSize:12,color:'var(--text2)'}},rows.length+' bill'+(rows.length===1?'':'s')+' · '+R(rows.reduce((t,r)=>t+r.amount,0))),
      bad.length?h('span',{className:'badge badge-red'},bad.length+' not in the P&L · '+R(bad.reduce((t,r)=>t+r.amount,0))):h('span',{className:'badge badge-green'},'✓ all accounted for'),
      h('span',{style:{marginLeft:'auto',fontSize:12,color:'var(--accent)'}},open?'Hide ▲':'Show ▼')),
    open&&h('div',{style:{marginTop:10,overflowX:'auto'}},
      h('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:6}},'Bills counted in this month by their booking date (as Vendors shows them). Amounts are the bill value incl. GST; the P&L line also holds Daily Sales & Exp entries and recurring estimates.'),
      h('table',{className:'data-table',style:{fontSize:12,minWidth:640}},
        h('thead',null,h('tr',null,['Vendor','Bill No.','Booking date','Category','Amount','In the P&L as'].map(x=>h('th',{key:x},x)))),
        h('tbody',null,rows.map(r=>h('tr',{key:r.id,style:r.ok?null:{background:'rgba(224,82,82,0.06)'}},
          h('td',null,r.vendor),h('td',null,r.no),h('td',null,r.date),h('td',null,r.cat||'—'),h('td',{style:{textAlign:'right'}},R(r.amount)),
          h('td',{style:{color:r.ok?'var(--text2)':'var(--red)',fontWeight:r.ok?400:600}},r.where))))),
      bad.length>0&&onNavTab&&h('button',{className:'btn btn-ghost btn-sm',style:{marginTop:8},onClick:()=>onNavTab('vendors')},'Open Vendors to change the category →')));
}
