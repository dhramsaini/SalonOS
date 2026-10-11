// ═════════════════════════════════════════════════════════════════════════════════════════════
// Billing (front desk) — bills on the outlet's own menu and staff, GST per item (or none when not
// registered), split payment, tips, discount reason / approval, membership & package sale and use,
// loyalty points, client + stock updates on save, WhatsApp bill and rating, day-end summary, and
// billed sales → Incentive Working (Controls → billingFeedsIncentive).
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Per staff member, this month's billed sales by type (line's “done by”, else the bill's main stylist).
function fdBilledSalesByStaff(sid,year,month){
  const pre=year+'-'+String(month+1).padStart(2,'0');const out={};
  fdBills(sid).filter(b=>b&&b.status!=='Cancelled'&&String(b.date).startsWith(pre)).forEach(b=>{const t=billCalc(b);const k=t.subtotal?t.taxable/t.subtotal:0;
    (b.items||[]).forEach(it=>{const id=String(it.staffId||b.staffId||'');if(!id)return;const o=out[id]=out[id]||{svc:0,prod:0,mem:0,name:it.staffName||b.staff||''};const amt=(Number(it.qty)||0)*(Number(it.rate)||0)*k;
      if(it.type==='Product')o.prod+=amt;else if(it.type==='Membership'||it.type==='Package')o.mem+=amt;else o.svc+=amt;});});
  Object.values(out).forEach(o=>{o.svc=Math.round(o.svc);o.prod=Math.round(o.prod);o.mem=Math.round(o.mem);});return out;
}
function fdPushIncentive(sid,year,month){
  const by=fdBilledSalesByStaff(sid,year,month);const A=loadIncentiveActuals(sid);let n=0;
  Object.keys(by).forEach(id=>{const k=incActualKey(id,year,month);A[k]={...(A[k]||{}),svcActual:by[id].svc,prodActual:by[id].prod,memActual:by[id].mem,fromBilling:new Date().toISOString()};n++;});
  saveIncentiveActuals(A,sid);try{logAuditEvent(sid,{entity:'Incentive',entityId:year+'-'+(month+1),action:'Sales from Billing',summary:n+' staff'});}catch(e){}return n;
}
function fdDaySummary(sid,iso){
  const L=fdBills(sid).filter(b=>b&&b.date===iso);const live=L.filter(b=>b.status!=='Cancelled');const modes={Cash:0,Card:0,UPI:0,Package:0,Voucher:0,Unpaid:0};let gross=0,disc=0,gst=0,total=0;const tips={};
  live.forEach(b=>{const t=billCalc(b);gross+=t.subtotal;disc+=t.disc;gst+=t.gst;total+=t.total;
    if(b.status==='Unpaid')modes.Unpaid+=t.total;else if(b.paymentMode==='Split'){(b.payments||[]).forEach(p=>{modes[p.mode]=(modes[p.mode]||0)+(Number(p.amount)||0);});modes.Package+=Number(b.packagePaid)||0;}
    else if(b.paymentMode==='Package')modes.Package+=t.total;else if(b.paymentMode==='Voucher')modes.Voucher+=t.total;else{modes[b.paymentMode]=(modes[b.paymentMode]||0)+t.total-(Number(b.packagePaid)||0)-(Number(b.voucherPaid)||0);modes.Package+=Number(b.packagePaid)||0;modes.Voucher+=Number(b.voucherPaid)||0;}
    (b.receipts||[]).forEach(r=>{if(r.date===iso)modes[r.mode]=(modes[r.mode]||0)+(Number(r.amount)||0);});
    (b.tips||[]).forEach(x=>{tips[x.staff||'—']=(tips[x.staff||'—']||0)+(Number(x.amount)||0);});});
  let cr=null;try{if(typeof cradleeDayTotals==='function'){const T=cradleeDayTotals(sid)[iso.split('-').reverse().join('/')];if(T)cr={card:Math.round(T.card),upi:Math.round(T.upi)};}}catch(e){}
  return{bills:live.length,cancelled:L.length-live.length,gross:Math.round(gross),disc:Math.round(disc),gst:Math.round(gst),total:Math.round(total),modes,tips,cradlee:cr};
}
function fdBillText(sid,b){
  const t=billCalc(b);const salon=getSalonRecordById(sid)||{};const nm=String(salon.name||'').split('—')[0].trim();
  return'Thank you for visiting '+nm+'!\nBill '+b.id+' · '+b.date.split('-').reverse().join('/')+'\n'+(b.items||[]).map(it=>'• '+it.name+(Number(it.qty)>1?' ×'+it.qty:'')+' — '+FD_M((Number(it.qty)||0)*(Number(it.rate)||0))).join('\n')
    +(t.disc?'\nDiscount −'+FD_M(t.disc):'')+(t.gst?'\nGST '+FD_M(t.gst):'')+'\nTotal '+FD_M(t.total)+'\n\nHow was your visit? Reply with a rating from 1 to 5 ⭐';
}
function fdPrintBill(sid,inv){
  const t=billCalc(inv);const salon=getSalonRecordById(sid)||{};const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const sName=salon.name||'Salon';const addr=[salon.address,salon.city,salon.state,salon.pin].filter(Boolean).join(', ');const half=Math.round(t.gst/2);
  const rows=(inv.items||[]).map((it,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(it.name)+'<div class="m">'+esc(it.type)+(it.staffName?' · '+esc(it.staffName):'')+'</div></td><td class="r">'+it.qty+'</td><td class="r">'+FD_M(it.rate)+'</td><td class="r">'+(inv.noGst?'—':(it.gst==null?18:it.gst)+'%')+'</td><td class="r">'+FD_M((Number(it.qty)||0)*(Number(it.rate)||0))+'</td></tr>').join('');
  const html='<!doctype html><html><head><meta charset="utf-8"><title>'+esc(inv.id)+'</title><style>@page{size:A5 portrait;margin:10mm}body{font-family:Arial,sans-serif;font-size:12px;color:#222}h1{font-size:18px;margin:0}.m{color:#777;font-size:10px}table{width:100%;border-collapse:collapse;margin:10px 0}td,th{border-bottom:1px solid #eee;padding:5px}th{text-align:left;font-size:10px;color:#666;text-transform:uppercase}.r{text-align:right}.tot td{border:0;padding:3px 5px}.big td{font-weight:700;font-size:14px;border-top:2px solid #2f5fe0}</style></head><body>'
    +(salon.logo?'<img src="'+salon.logo+'" style="max-height:40px">':'')+'<h1>'+esc(sName)+'</h1><div class="m">'+esc(addr)+(salon.gst&&!inv.noGst?'<br>GSTIN '+esc(salon.gst):'')+'</div>'
    +'<p><b>Bill '+esc(inv.id)+'</b> · '+esc(inv.date.split('-').reverse().join('/'))+'<br>'+esc(inv.customer)+(inv.phone?' · '+esc(inv.phone):'')+'</p>'
    +'<table><tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">GST</th><th class="r">Amount</th></tr>'+rows+'</table>'
    +'<table class="tot"><tr><td>Subtotal</td><td class="r">'+FD_M(t.subtotal)+'</td></tr>'+(t.disc?'<tr><td>Discount</td><td class="r">−'+FD_M(t.disc)+'</td></tr>':'')
    +(inv.noGst?'':'<tr><td>Taxable</td><td class="r">'+FD_M(t.taxable)+'</td></tr><tr><td>CGST</td><td class="r">'+FD_M(half)+'</td></tr><tr><td>SGST</td><td class="r">'+FD_M(t.gst-half)+'</td></tr>')
    +'<tr class="big"><td>Total</td><td class="r">'+FD_M(t.total)+'</td></tr>'+(Number(inv.packagePaid)>0?'<tr><td>Paid from package</td><td class="r">'+FD_M(inv.packagePaid)+'</td></tr>':'')
    +'<tr><td>Paid by</td><td class="r">'+(inv.paymentMode==='Split'?(inv.payments||[]).map(p=>esc(p.mode)+' '+FD_M(p.amount)).join(', '):esc(inv.paymentMode))+'</td></tr></table><p class="m">Thank you — see you again!</p><script>window.onload=()=>window.print()<\/script></body></html>';
  const w=window.open('','_blank');if(!w){window.alert('Allow pop-ups to print the bill.');return;}w.document.write(html);w.document.close();
}
function BillingSheet({salon}){
  const h=React.createElement;const {toast}=useToast();const sid=Number(salon&&salon.id)||1;
  const [invoices,setInvoices]=useState(()=>fdBills(sid));
  useEffect(()=>{safeLocalSet(outletKey('salonos_billing_invoices',sid),JSON.stringify(invoices));},[invoices,sid]);
  const [search,setSearch]=useState('');const [fMode,setFMode]=useState('All');const [fStatus,setFStatus]=useState('All');const [fStaff,setFStaff]=useState('All');
  const [editor,setEditor]=useState(null);const [viewInv,setViewInv]=useState(null);const [impOpen,setImpOpen]=useState(false);const [duesOpen,setDuesOpen]=useState(false);const [vchOpen,setVchOpen]=useState(false);const [refundOf,setRefundOf]=useState(null);const [menuOpen,setMenuOpen]=useState(false);const [dayOpen,setDayOpen]=useState(false);const [dayIso,setDayIso]=useState(fdTodayIso());const [insOpen,setInsOpen]=useState(false);
  // a bill started from an appointment (js/41) — picked up once
  useEffect(()=>{try{const k='salonos_bill_draft_'+sid;const d=sessionStorage.getItem(k);if(d){sessionStorage.removeItem(k);setEditor({initial:JSON.parse(d)});}}catch(e){}},[sid]);
  const today=fdTodayIso();const cur=today.slice(0,7);const staff=fdStaff(sid);
  const T=b=>billCalc(b).total;const live=invoices.filter(b=>b.status!=='Cancelled');
  const todaySales=live.filter(b=>b.date===today).reduce((s,b)=>s+T(b),0),monthSales=live.filter(b=>String(b.date).slice(0,7)===cur).reduce((s,b)=>s+T(b),0);
  const unpaid=live.filter(b=>fdBillDue(b)>0);const reload=()=>setInvoices(fdBills(sid));const lowRated=controlOn('lowRatingAlert',sid)?invoices.filter(b=>Number(b.rating)>0&&Number(b.rating)<=2&&!b.ratingSeen):[];
  const q=search.trim().toLowerCase();
  const filtered=invoices.filter(b=>(!q||String(b.customer||'').toLowerCase().includes(q)||String(b.id).toLowerCase().includes(q)||String(b.phone||'').includes(q))&&(fMode==='All'||b.paymentMode===fMode)&&(fStatus==='All'||b.status===fStatus)&&(fStaff==='All'||b.staff===fStaff||(b.items||[]).some(it=>it.staffName===fStaff)));
  const saveBill=rec=>{
    if(editor&&editor.editId){setInvoices(L=>L.map(b=>b.id===editor.editId?{...rec,id:editor.editId}:b));try{logAuditEvent(sid,{entity:'Bill',entityId:editor.editId,action:'Edited',summary:FD_M(T(rec))});}catch(e){}toast('Bill '+editor.editId+' updated','success');setEditor(null);return;}
    const id=fdNextBillNo(sid,invoices,rec.date);const bill={...rec,id,createdBy:(currentSessionUser()||{}).name||'',createdAt:new Date().toISOString()};
    setInvoices(L=>[bill,...L]);setTimeout(()=>{const notes=fdAfterBillSaved(sid,bill,true);
      try{if(editor&&editor.initial&&editor.initial.apptKey&&typeof fdMarkApptBilled==='function')fdMarkApptBilled(sid,editor.initial.apptKey,editor.initial.apptIds||[],id);}catch(e){}
      toast('Bill '+id+' — '+FD_M(T(bill))+(notes.length?' · '+notes.join(' · '):''),'success');},0);
    setEditor(null);};
  const del=b=>{if(!window.confirm('Cancel bill '+b.id+' ('+FD_M(T(b))+')? It stays in the list as Cancelled.'))return;setInvoices(L=>L.map(x=>x.id===b.id?{...x,status:'Cancelled',cancelledBy:(currentSessionUser()||{}).name||'',cancelledAt:new Date().toISOString()}:x));
    try{logAuditEvent(sid,{entity:'Bill',entityId:b.id,action:'Cancelled',summary:FD_M(T(b))});}catch(e){}setViewInv(null);};
  const setRating=(b,r)=>{setInvoices(L=>L.map(x=>x.id===b.id?{...x,rating:r}:x));setViewInv(v=>v&&v.id===b.id?{...v,rating:r}:v);};
  const sendWa=b=>{const ph=typeof waNumber==='function'?waNumber(b.phone):'';if(!ph){toast('No valid mobile on this bill','error');return;}window.open('https://wa.me/'+ph+'?text='+encodeURIComponent(fdBillText(sid,b)),'_blank','noopener');};
  const ds=dayOpen?fdDaySummary(sid,dayIso):null;
  const metric=(l,v,sub,cls)=>h('div',{className:'metric-card '+(cls||'')},h('div',{className:'metric-label'},l),h('div',{className:'metric-value'},v),sub&&h('div',{className:'metric-sub'},sub));
  const now=new Date();const fi=controlOn('billingFeedsIncentive',sid);
  return h('div',{className:'fade-in'},
    h('div',{className:'section-header'},
      h('div',null,h('div',{className:'page-title'},'Billing'+(salon?' — '+String(salon.name).split('—')[0].trim():'')),
        h('div',{className:'page-sub'},'Bills on your own menu and staff. '+(fdSettings(sid).gst?'GST per item'+(fdSettings(sid).inclusive?' (prices include GST)':''):'Outlet not GST-registered — no GST on bills')+'.')),
      h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setMenuOpen(true)},'⚙ Menu & settings'),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setDayOpen(true)},'📅 Day-end'),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setDuesOpen(true)},'💳 Dues'+(unpaid.length?' ('+unpaid.length+')':'')),
        controlOn('giftVouchers',sid)&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setVchOpen(true)},'🎁 Vouchers'),
        h('button',{className:'btn btn-ghost btn-sm',title:'Bills from the Cradlee sales register or any Excel',onClick:()=>setImpOpen(true)},'⬆ Import bills'),
        typeof SalesInsightsModal==='function'&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setInsOpen(true)},'📊 Insights'),
        fi&&h('button',{className:'btn btn-ghost btn-sm',title:'Fill this month’s Service / Product / Membership sales in Incentive Working from the bills',onClick:()=>{if(!window.confirm('Send '+RPT_MONTHS[now.getMonth()]+' billed sales of each staff member to Incentive Working? (Used only where no staff work report is imported.)'))return;const n=fdPushIncentive(sid,now.getFullYear(),now.getMonth());toast('Sales of '+n+' staff sent to Incentive Working','success');}},'↗ Sales to incentives'),
        h('button',{className:'btn btn-primary',onClick:()=>setEditor({})},'+ New bill'))),
    insOpen&&h(SalesInsightsModal,{salon,invoices:live,onClose:()=>setInsOpen(false)}),
    !staff.length&&h('div',{className:'help-note',style:{marginBottom:12}},'No floor staff found for this month — add stylists in Master Salary so bills (and incentives) carry the right person.'),
    lowRated.length>0&&h('div',{className:'attention-card',style:{marginBottom:12,color:'var(--red)'}},'⭐ '+lowRated.length+' low rating(s): ',lowRated.slice(0,4).map(b=>h('button',{key:b.id,className:'btn btn-ghost btn-sm',onClick:()=>setViewInv(b)},b.customer+' ('+b.rating+'★)'))),
    h('div',{className:'grid4',style:{marginBottom:16}},metric("Today's sales",FD_M(todaySales),live.filter(b=>b.date===today).length+' bill(s)','green'),metric('This month',FD_M(monthSales),RPT_MONTHS[now.getMonth()],'blue'),
      metric('Average bill',FD_M(live.filter(b=>String(b.date).slice(0,7)===cur).length?monthSales/live.filter(b=>String(b.date).slice(0,7)===cur).length:0),'this month','amber'),
      metric('Client dues',FD_M(unpaid.reduce((s,b)=>s+fdBillDue(b),0)),unpaid.length+' bill(s)',unpaid.length?'red':'teal')),
    h('div',{style:{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}},
      h('input',{className:'form-control',style:{flex:1,minWidth:200},placeholder:'Search bill no., customer, mobile…',value:search,onChange:e=>setSearch(e.target.value)}),
      h('select',{className:'form-control',style:{width:'auto'},value:fMode,onChange:e=>setFMode(e.target.value)},['All','Cash','Card','UPI','Split','Package'].map(m=>h('option',{key:m,value:m},m==='All'?'All payments':m))),
      h('select',{className:'form-control',style:{width:'auto'},value:fStatus,onChange:e=>setFStatus(e.target.value)},['All','Paid','Unpaid','Cancelled'].map(m=>h('option',{key:m,value:m},m==='All'?'All status':m))),
      h('select',{className:'form-control',style:{width:'auto'},value:fStaff,onChange:e=>setFStaff(e.target.value)},h('option',{value:'All'},'All staff'),staff.map(s=>h('option',{key:s.id,value:s.name},s.name))),
      h('span',{style:{fontSize:12,color:'var(--text3)'}},filtered.length+' of '+invoices.length)),
    h('div',{className:'card',style:{padding:0}},!filtered.length?h('div',{className:'empty-state'},h('div',{className:'empty-icon'},'🧾'),h('div',{className:'empty-title'},'No bills'),h('div',{className:'empty-sub'},'Press + New bill to make the first one.'))
      :h('div',{className:'table-wrap'},h('table',null,
        h('thead',null,h('tr',null,['Bill','Date','Customer','Items','Staff','Payment','Status','Amount',''].map((x,i)=>h('th',{key:i,style:i===7?{textAlign:'right'}:null},x)))),
        h('tbody',null,filtered.slice(0,500).map(b=>h('tr',{key:b.id,style:{opacity:b.status==='Cancelled'?0.55:1}},
          h('td',{style:{fontFamily:'monospace',fontWeight:600,color:'var(--accent)'}},b.id),h('td',{style:{fontSize:12}},String(b.date).split('-').reverse().join('/')),
          h('td',null,h('div',{style:{fontWeight:600}},b.customer),b.phone&&h('div',{style:{fontSize:10.5,color:'var(--text3)'}},b.phone)),
          h('td',{style:{fontSize:12}},(b.items||[]).length+' item(s)'),h('td',{style:{fontSize:12}},b.staff||'—'),
          h('td',null,h('span',{className:'badge badge-blue'},b.paymentMode)),h('td',null,h('span',{className:'badge '+(b.status==='Paid'?'badge-green':b.status==='Unpaid'?'badge-red':'badge-gray')},b.status),Number(b.rating)>0&&h('span',{style:{marginLeft:4,fontSize:11}},b.rating+'★')),
          h('td',{style:{textAlign:'right',fontWeight:700}},FD_M(T(b))),
          h('td',{style:{whiteSpace:'nowrap'}},h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setViewInv(b)},'View'),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>fdPrintBill(sid,b)},'🖨'),
            b.status!=='Cancelled'&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setEditor({initial:b,editId:b.id})},'✏')))))))),
    editor&&h(BillEditor,{sid,initial:editor.initial,editId:editor.editId,onSave:saveBill,onClose:()=>setEditor(null)}),
    menuOpen&&h(FdMenuSettings,{sid,onClose:()=>setMenuOpen(false)}),
    impOpen&&h(FdImportBillsModal,{sid,onClose:()=>setImpOpen(false),onDone:()=>{setImpOpen(false);reload();}}),
    duesOpen&&h(FdDuesModal,{sid,onClose:()=>{setDuesOpen(false);reload();},onChanged:reload}),
    vchOpen&&h(FdVouchersModal,{sid,onClose:()=>setVchOpen(false),onSell:v=>{setVchOpen(false);setEditor({initial:{customer:v.buyer,phone:v.phone,items:[{name:'Gift voucher '+v.code+(v.forName?' for '+v.forName:''),type:'Voucher',qty:1,rate:v.value,gst:0}],voucherSale:v,paymentMode:'Cash',status:'Paid',discount:0}});}}),
    refundOf&&h(FdRefundModal,{sid,bill:refundOf,onClose:()=>setRefundOf(null),onDone:()=>{setRefundOf(null);setViewInv(null);reload();}}),
    viewInv&&(()=>{const b=invoices.find(x=>x.id===viewInv.id)||viewInv;const t=billCalc(b);return h('div',{className:'modal-overlay',onClick:()=>setViewInv(null)},h('div',{className:'modal',style:{width:560},onClick:e=>e.stopPropagation()},
      h('div',{className:'modal-title'},'Bill '+b.id+' · '+b.status),
      h('div',{style:{fontSize:13,marginBottom:8}},h('b',null,b.customer),b.phone?' · '+b.phone:'',' · ',String(b.date).split('-').reverse().join('/'),b.staff?' · '+b.staff:''),
      h('div',{className:'table-wrap',style:{border:'1px solid var(--border)',borderRadius:'var(--r)',marginBottom:10}},h('table',null,h('tbody',null,(b.items||[]).map((it,i)=>h('tr',{key:i},h('td',null,it.name,h('div',{style:{fontSize:10.5,color:'var(--text3)'}},it.type+(it.staffName?' · '+it.staffName:''))),h('td',{style:{textAlign:'right'}},it.qty+' × '+FD_M(it.rate)),h('td',{style:{textAlign:'right',fontWeight:600}},FD_M((Number(it.qty)||0)*(Number(it.rate)||0)))))))),
      h('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'10px 12px',fontSize:12.5}},
        [['Subtotal',t.subtotal],t.disc?['Discount'+(b.discountReason?' ('+b.discountReason+')':''),-t.disc]:null,b.noGst?null:['GST',t.gst],['Total',t.total],Number(b.packagePaid)>0?['From package',b.packagePaid]:null].filter(Boolean).map((r,i)=>h('div',{key:i,style:{display:'flex',justifyContent:'space-between',fontWeight:r[0]==='Total'?700:400}},h('span',null,r[0]),h('span',null,(r[1]<0?'− ':'')+FD_M(Math.abs(r[1]))))),
        h('div',{style:{marginTop:4,color:'var(--text3)'}},'Paid by '+(b.paymentMode==='Split'?(b.payments||[]).map(p=>p.mode+' '+FD_M(p.amount)).join(', '):b.paymentMode)+((b.tips||[]).length?' · tips '+(b.tips||[]).map(x=>x.staff+' '+FD_M(x.amount)).join(', '):''))),
      h('div',{style:{display:'flex',gap:4,alignItems:'center',margin:'10px 0'}},h('span',{style:{fontSize:12.5,marginRight:6}},'Client rating'),[1,2,3,4,5].map(r=>h('button',{key:r,className:'btn btn-ghost btn-sm',style:{padding:'0 6px',fontSize:16,color:Number(b.rating)>=r?'#e0a530':'var(--text3)'},onClick:()=>setRating(b,r)},'★')),
        Number(b.rating)>0&&Number(b.rating)<=2&&!b.ratingSeen&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{setInvoices(L=>L.map(x=>x.id===b.id?{...x,ratingSeen:true}:x));}},'Handled')),
      h('div',{className:'modal-actions'},b.status!=='Cancelled'&&h('button',{className:'btn btn-ghost',style:{color:'var(--red)'},onClick:()=>del(b)},'Cancel bill'),h('button',{className:'btn btn-ghost',onClick:()=>sendWa(b)},'📲 WhatsApp'),
        h('button',{className:'btn btn-ghost',onClick:()=>fdPrintBill(sid,b)},'🖨 A5'),h('button',{className:'btn btn-ghost',onClick:()=>fdPrintReceipt(sid,b,80)},'🧾 80 mm'),h('button',{className:'btn btn-ghost',onClick:()=>fdPrintReceipt(sid,b,58)},'58 mm'),
        b.status!=='Cancelled'&&b.kind!=='credit-note'&&h('button',{className:'btn btn-ghost',onClick:()=>setRefundOf(b)},'↩ Refund'),
        b.status!=='Cancelled'&&b.kind!=='credit-note'&&h('button',{className:'btn btn-primary',onClick:()=>{setViewInv(null);setEditor({initial:b,editId:b.id});}},'✏ Edit'))));})(),
    ds&&h('div',{className:'modal-overlay',onClick:()=>setDayOpen(false)},h('div',{className:'modal',style:{width:520},onClick:e=>e.stopPropagation()},
      h('div',{className:'modal-title',style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},'📅 Day-end summary',h('input',{type:'date',className:'form-control',style:{width:150},value:dayIso,onChange:e=>setDayIso(e.target.value)})),
      [['Bills',ds.bills+(ds.cancelled?' ('+ds.cancelled+' cancelled)':'')],['Gross',FD_M(ds.gross)],['Discounts',FD_M(ds.disc)],['GST',FD_M(ds.gst)],['Total billed',FD_M(ds.total)]].map(([k,v])=>h('div',{key:k,className:'kv'},h('span',null,k),h('b',null,v))),
      h('div',{style:{fontWeight:700,margin:'10px 0 4px'}},'By payment'),
      Object.entries(ds.modes).filter(([,v])=>v).map(([k,v])=>h('div',{key:k,className:'kv'},h('span',null,k),h('span',null,FD_M(v),ds.cradlee&&(k==='Card'||k==='UPI')?h('span',{style:{marginLeft:8,fontSize:11.5,color:Math.abs(ds.cradlee[k.toLowerCase()]-v)>1?'var(--orange)':'var(--green)'}},'Cradlee '+FD_M(ds.cradlee[k.toLowerCase()])):null))),
      Object.keys(ds.tips).length>0&&h('div',{style:{fontWeight:700,margin:'10px 0 4px'}},'Tips to pay out'),Object.entries(ds.tips).map(([k,v])=>h('div',{key:k,className:'kv'},h('span',null,k),h('span',null,FD_M(v)))),
      h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:8}},'Count the cash drawer against the Cash line; Card / UPI are compared with the Cradlee sale for the day where imported.'),
      controlOn('billingFeedsDailySales',sid)&&h('button',{className:'btn btn-primary btn-sm',style:{marginTop:8},onClick:()=>{const err=fdFillDailySales(sid,dayIso);if(err)return toast(err,err==='Cancelled.'?'info':'error');toast('Daily Sales & Exp filled for '+dayIso.split('-').reverse().join('/'),'success');}},'↗ Fill Daily Sales & Exp for this day'),
      h('div',{className:'modal-actions'},h('button',{className:'btn btn-primary',onClick:()=>setDayOpen(false)},'Close')))));
}
