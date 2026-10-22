// ═════════════════════════════════════════════════════════════════════════════════════════════
// Front desk extras (used by js/39–43):
//   Billing   — import bills from Cradlee / Excel, credit (unpaid) ledger with part payments,
//               gift vouchers, 80 mm receipts, FY invoice series, refunds / credit notes,
//               bills → Daily Sales & Exp.
//   Bookings  — recurring bookings, rooms / equipment, stylist day view, patch-test check, booking page link.
//   Clients   — consent & patch tests, family accounts, campaigns, referrals.
//   Stock     — purchase price history, back-bar use per stylist, expiry write-off, supplier catalogue.
// Each rule is switched in Master Settings → 🎛 Controls.
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ── Invoice number series per financial year (Controls → fyInvoiceSeries) ──
function fdNextBillNo(sid,bills,dateIso){
  if(!controlOn('fyInvoiceSeries',sid))return nextPrefixedId(bills,'INV-',4);
  const d=new Date((dateIso||fdTodayIso())+'T00:00:00');const fy=calToFYMI(d.getFullYear(),d.getMonth()).fy;const pre='INV/'+fy+'/';
  const n=Math.max(0,...(bills||[]).filter(b=>String(b.id).startsWith(pre)).map(b=>Number(String(b.id).slice(pre.length))||0))+1;return pre+String(n).padStart(4,'0');
}
function fdNextCreditNo(bills,dateIso){const d=new Date((dateIso||fdTodayIso())+'T00:00:00');const fy=calToFYMI(d.getFullYear(),d.getMonth()).fy;const pre='CN/'+fy+'/';
  const n=Math.max(0,...(bills||[]).filter(b=>String(b.id).startsWith(pre)).map(b=>Number(String(b.id).slice(pre.length))||0))+1;return pre+String(n).padStart(4,'0');}

// ── Credit (unpaid) bills ──
function fdBillDue(b){if(!b||b.status!=='Unpaid')return 0;const t=billCalc(b).total;return Math.max(0,Math.round(t-(Number(b.packagePaid)||0)-(Number(b.voucherPaid)||0)-(b.receipts||[]).reduce((s,r)=>s+(Number(r.amount)||0),0)));}
function fdDues(sid){
  const by={};fdBills(sid).forEach(b=>{const due=fdBillDue(b);if(!(due>0))return;const k=fdP10(b.phone)||('name:'+String(b.customer||'').toLowerCase());const e=by[k]=by[k]||{key:k,name:b.customer,phone:b.phone,due:0,bills:[],oldest:b.date};
    e.due+=due;e.bills.push({...b,due});if(String(b.date)<e.oldest)e.oldest=b.date;});
  const t=new Date(fdTodayIso()+'T00:00:00');return Object.values(by).map(e=>({...e,age:Math.round((t-new Date(e.oldest+'T00:00:00'))/864e5)})).sort((a,b)=>b.due-a.due);
}
function fdClientDue(sid,phone){const p=fdP10(phone);if(p.length!==10)return 0;return fdBills(sid).filter(b=>fdP10(b.phone)===p).reduce((s,b)=>s+fdBillDue(b),0);}
function fdReceivePayment(sid,billId,amount,mode){
  const L=fdBills(sid);const i=L.findIndex(b=>b.id===billId);if(i<0)return'Bill not found';const due=fdBillDue(L[i]);const a=Math.min(Number(amount)||0,due);if(!(a>0))return'Enter the amount received';
  L[i]={...L[i],receipts:[...(L[i].receipts||[]),{at:new Date().toISOString(),date:fdTodayIso(),amount:a,mode:mode||'Cash',by:(currentSessionUser()||{}).name||''}]};if(fdBillDue(L[i])<=0)L[i].status='Paid';
  safeLocalSet(outletKey('salonos_billing_invoices',sid),JSON.stringify(L));try{logAuditEvent(sid,{entity:'Bill',entityId:billId,action:'Payment received',summary:FD_M(a)+' '+(mode||'Cash')});}catch(e){}return'';
}
function FdDuesModal({sid,onClose,onChanged}){
  const h=React.createElement;const {toast}=useToast();const [,setT]=useState(0);const [pay,setPay]=useState(null);const dues=fdDues(sid);const tot=dues.reduce((s,e)=>s+e.due,0);
  const bucket=a=>a<=30?'0–30 days':a<=60?'31–60 days':'60+ days';const nm=String((getSalonRecordById(sid)||{}).name||'').split('—')[0].trim();
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:760,maxWidth:'97vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'💳 Client dues — '+FD_M(tot)),
    h('div',{style:{display:'flex',gap:10,marginBottom:10,flexWrap:'wrap'}},['0–30 days','31–60 days','60+ days'].map(b=>h('div',{key:b,className:'metric-card',style:{flex:1,minWidth:140}},h('div',{className:'metric-label'},b),h('div',{className:'metric-value',style:{fontSize:18}},FD_M(dues.filter(e=>bucket(e.age)===b).reduce((s,e)=>s+e.due,0)))))),
    !dues.length?h('div',{style:{color:'var(--green)',fontSize:13}},'✓ Nobody owes anything.'):dues.map(e=>h('div',{key:e.key,style:{borderBottom:'1px solid var(--border)',padding:'8px 0'}},
      h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},h('b',{style:{flex:1}},e.name+(e.phone?' · '+e.phone:'')),h('span',{style:{color:e.age>60?'var(--red)':e.age>30?'var(--orange)':'var(--text2)',fontSize:12}},e.age+' days'),h('b',null,FD_M(e.due)),
        e.phone&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>fdWa(e.phone,'Hi '+String(e.name).split(' ')[0]+', a gentle reminder from '+nm+': '+FD_M(e.due)+' is due on bill(s) '+e.bills.map(b=>b.id).join(', ')+'. You can pay by UPI or at your next visit. Thank you!')},'📲 Remind')),
      e.bills.map(b=>h('div',{key:b.id,style:{display:'flex',gap:8,alignItems:'center',fontSize:12.5,padding:'3px 0 3px 12px'}},h('span',{style:{flex:1}},b.id+' · '+String(b.date).split('-').reverse().join('/')+((b.receipts||[]).length?' · paid '+FD_M((b.receipts||[]).reduce((s,r)=>s+r.amount,0)):'')),h('span',null,FD_M(b.due)),
        h('button',{className:'btn btn-primary btn-sm',onClick:()=>setPay({id:b.id,amount:String(b.due),mode:'UPI'})},'Receive'))))),
    pay&&h('div',{className:'card',style:{marginTop:10}},h('b',null,'Receive on '+pay.id),h('div',{style:{display:'flex',gap:8,marginTop:6}},h('input',{type:'number',className:'form-control',style:{width:130},value:pay.amount,onChange:e=>setPay({...pay,amount:e.target.value})}),
      h('select',{className:'form-control',style:{width:110},value:pay.mode,onChange:e=>setPay({...pay,mode:e.target.value})},['Cash','Card','UPI'].map(m=>h('option',{key:m},m))),
      h('button',{className:'btn btn-primary btn-sm',onClick:()=>{const err=fdReceivePayment(sid,pay.id,pay.amount,pay.mode);if(err)return toast(err,'error');toast('Payment recorded','success');setPay(null);setT(x=>x+1);onChanged&&onChanged();}},'Save'))),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-primary',onClick:onClose},'Close'))));
}

// ── Gift vouchers (Controls → giftVouchers) ──
function fdVoucherKey(sid){return outletKey('salonos_gift_vouchers',sid);}
function fdVouchers(sid){const v=fdJ(fdVoucherKey(sid),[]);return Array.isArray(v)?v:[];}
function fdSaveVouchers(sid,l){safeLocalSet(fdVoucherKey(sid),JSON.stringify(l||[]));}
function fdVoucherLeft(v){return Math.max(0,Math.round((Number(v.value)||0)-(v.redemptions||[]).reduce((s,r)=>s+(Number(r.amount)||0),0)));}
function fdFindVoucher(sid,code){const c=String(code||'').trim().toUpperCase();if(!c)return null;const v=fdVouchers(sid).find(x=>String(x.code).toUpperCase()===c);if(!v)return null;
  const expired=v.expiry&&v.expiry<fdTodayIso();return{...v,left:fdVoucherLeft(v),expired};}
function fdNewVoucherCode(sid){const L=fdVouchers(sid);let c;do{c='GV'+Math.random().toString(36).slice(2,8).toUpperCase();}while(L.some(x=>x.code===c));return c;}
function fdRedeemVoucher(sid,code,amount,billId){const L=fdVouchers(sid);const v=L.find(x=>String(x.code).toUpperCase()===String(code).toUpperCase());if(!v)return 0;const use=Math.min(fdVoucherLeft(v),Number(amount)||0);if(!(use>0))return 0;
  v.redemptions=[...(v.redemptions||[]),{id:typeof fdRid==='function'?fdRid():'R'+Date.now(),date:fdTodayIso(),amount:use,bill:billId}];fdSaveVouchers(sid,L);return use;}
function FdVouchersModal({sid,onClose,onSell}){
  const h=React.createElement;const {toast}=useToast();const [f,setF]=useState({value:'',days:'365',buyer:'',phone:'',forName:''});const L=fdVouchers(sid).slice().reverse();
  const sell=()=>{const v=Number(f.value);if(!(v>0))return toast('Enter the voucher value','error');if(!f.buyer.trim())return toast('Enter the buyer','error');
    const code=fdNewVoucherCode(sid);const exp=localIsoOf(new Date(Date.now()+(Number(f.days)||365)*864e5));
    onSell({code,value:v,expiry:exp,buyer:f.buyer.trim(),phone:f.phone,forName:f.forName.trim()});};
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:700,maxWidth:'97vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'🎁 Gift vouchers'),
    h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'flex-end',marginBottom:10}},
      [['value','Value ₹',100,'number'],['days','Valid days',80,'number'],['buyer','Bought by',150],['phone','Buyer mobile',120],['forName','For (gift to)',140]].map(([k,l,w,t])=>h('label',{key:k,style:{fontSize:11,color:'var(--text3)'}},l,h('input',{type:t||'text',className:'form-control',style:{width:w,padding:'4px 6px'},value:f[k],onChange:e=>setF({...f,[k]:e.target.value})}))),
      h('button',{className:'btn btn-primary btn-sm',onClick:sell},'Sell → bill')),
    !L.length?h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No vouchers sold yet.'):h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Code','For','Value','Left','Expires','Sold'].map((x,i)=>h('th',{key:i},x)))),
      h('tbody',null,L.map(v=>h('tr',{key:v.code},h('td',{style:{fontFamily:'monospace',fontWeight:700}},v.code),h('td',null,(v.forName||v.buyer)+(v.phone?' · '+v.phone:'')),h('td',null,FD_M(v.value)),h('td',null,FD_M(fdVoucherLeft(v))),
        h('td',{style:{color:v.expiry<fdTodayIso()?'var(--red)':''}},String(v.expiry||'').split('-').reverse().join('/')),h('td',null,String(v.soldOn||'').split('-').reverse().join('/')+(v.bill?' · '+v.bill:''))))))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:8}},'The code is redeemed in the bill form (Voucher code). Unused value is owed to the holder until it expires.'),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-primary',onClick:onClose},'Close'))));
}

// ── 80 mm / 58 mm receipt ──
function fdPrintReceipt(sid,inv,mm){
  const t=billCalc(inv);const salon=getSalonRecordById(sid)||{};const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));const w=mm||80;
  const line=(a,b,bold)=>'<div class="l'+(bold?' b':'')+'"><span>'+esc(a)+'</span><span>'+esc(b)+'</span></div>';
  const html='<!doctype html><html><head><meta charset="utf-8"><title>'+esc(inv.id)+'</title><style>@page{size:'+w+'mm auto;margin:3mm}body{font-family:monospace;font-size:'+(w<70?10:11.5)+'px;width:'+(w-6)+'mm;margin:0}.c{text-align:center}.l{display:flex;justify-content:space-between;gap:6px}.b{font-weight:700;font-size:1.15em}hr{border:0;border-top:1px dashed #000}</style></head><body>'
    +'<div class="c b">'+esc(salon.name||'Salon')+'</div><div class="c">'+esc([salon.address,salon.city].filter(Boolean).join(', '))+(salon.gst&&!inv.noGst?'<br>GSTIN '+esc(salon.gst):'')+'</div><hr>'
    +line(inv.id,String(inv.date).split('-').reverse().join('/'))+line(inv.customer||'',inv.phone||'')+'<hr>'
    +(inv.items||[]).map(it=>line((Number(it.qty)!==1?it.qty+'× ':'')+it.name,FD_M((Number(it.qty)||0)*(Number(it.rate)||0)))).join('')+'<hr>'
    +line('Subtotal',FD_M(t.subtotal))+(t.disc?line('Discount','-'+FD_M(t.disc)):'')+(inv.noGst?'':line('GST',FD_M(t.gst)))+line('TOTAL',FD_M(t.total),true)
    +(Number(inv.packagePaid)>0?line('Package',FD_M(inv.packagePaid)):'')+(Number(inv.voucherPaid)>0?line('Voucher '+(inv.voucherCode||''),FD_M(inv.voucherPaid)):'')
    +line('Paid by',inv.paymentMode==='Split'?(inv.payments||[]).map(p=>p.mode+' '+FD_M(p.amount)).join(', '):inv.paymentMode)+'<hr><div class="c">Thank you! Visit again 🙏</div><script>window.onload=()=>window.print()<\/script></body></html>';
  const wn=window.open('','_blank','width=380,height=640');if(!wn){window.alert('Allow pop-ups to print the receipt.');return;}wn.document.write(html);wn.document.close();
}

// ── Refund / credit note ──
function fdCreateCreditNote(sid,orig,lines,reason,mode){
  const L=fdBills(sid);const items=(lines||[]).filter(l=>Number(l.qty)>0).map(l=>({...l,qty:-Math.abs(Number(l.qty))}));if(!items.length)return{error:'Pick what is refunded'};
  const id=fdNextCreditNo(L,fdTodayIso());const cn={id,kind:'credit-note',refBill:orig.id,customer:orig.customer,phone:orig.phone,staff:orig.staff,staffId:orig.staffId,date:fdTodayIso(),items,discount:0,noGst:orig.noGst,inclusive:orig.inclusive,
    paymentMode:mode||'Cash',status:'Paid',refundReason:reason||'',createdBy:(currentSessionUser()||{}).name||'',createdAt:new Date().toISOString()};
  const amt=-billCalc(cn).total;const next=[cn,...L.map(b=>b.id===orig.id?{...b,refunds:[...(b.refunds||[]),{id,amount:amt,date:cn.date}]}:b)];safeLocalSet(outletKey('salonos_billing_invoices',sid),JSON.stringify(next));
  if(mode==='Package credit'&&typeof fdClientAdjust==='function')fdClientAdjust(sid,orig.phone,'packageBalance',amt,'Credit note '+id);
  if(controlOn('billReducesStock',sid)){const S=fdStock(sid);let ch=false;items.filter(it=>it.type==='Product').forEach(it=>{const m=fdMenuItem(sid,it.name)||{};const s=S.find(z=>(m.stockItemId&&z.id===m.stockItemId)||String(z.name).toLowerCase()===String(it.name).toLowerCase());if(!s)return;
    s.qty=(Number(s.qty)||0)+Math.abs(it.qty);ch=true;if(typeof logInvMove==='function')logInvMove(sid,s,'return',Math.abs(it.qty),Number(it.rate)||0);});if(ch)fdSaveStock(sid,S);}
  try{logAuditEvent(sid,{entity:'Bill',entityId:id,action:'Credit note',summary:FD_M(amt)+' against '+orig.id+(reason?' — '+reason:'')});}catch(e){}
  return{cn,amount:amt};
}
function FdRefundModal({sid,bill,onClose,onDone}){
  const h=React.createElement;const {toast}=useToast();const [lines,setLines]=useState(()=>(bill.items||[]).filter(it=>Number(it.qty)>0).map(it=>({...it,pick:false,rq:String(it.qty)})));const [reason,setReason]=useState(bill._reason||'');const [mode,setMode]=useState(bill.paymentMode==='Card'?'Card':bill.paymentMode==='UPI'?'UPI':'Cash');
  const chosen=lines.filter(l=>l.pick&&Number(l.rq)>0).map(l=>({name:l.name,type:l.type,rate:l.rate,gst:l.gst,staffId:l.staffId,staffName:l.staffName,qty:Math.min(Number(l.rq),Number(l.qty))}));
  const amt=chosen.length?-billCalc({items:chosen.map(c=>({...c,qty:-c.qty})),noGst:bill.noGst,inclusive:bill.inclusive}).total:0;
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:520},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'↩ Refund / credit note — '+bill.id),
    lines.map((l,i)=>h('div',{key:i,style:{display:'flex',gap:8,alignItems:'center',padding:'4px 0'}},h('input',{type:'checkbox',checked:l.pick,onChange:e=>setLines(L=>L.map((z,j)=>j===i?{...z,pick:e.target.checked}:z))}),
      h('span',{style:{flex:1,fontSize:12.5}},l.name+' ('+l.type+')'),h('input',{type:'number',className:'form-control',style:{width:70,padding:'3px 6px'},value:l.rq,onChange:e=>setLines(L=>L.map((z,j)=>j===i?{...z,rq:e.target.value}:z))}),h('span',{style:{fontSize:12}},'of '+l.qty))),
    h('div',{className:'form-row cols2',style:{marginTop:8}},h('div',{className:'form-group'},h('label',null,'Reason'),h('input',{className:'form-control',value:reason,onChange:e=>setReason(e.target.value)})),
      h('div',{className:'form-group'},h('label',null,'Refund as'),h('select',{className:'form-control',value:mode,onChange:e=>setMode(e.target.value)},['Cash','Card','UPI','Package credit'].map(m=>h('option',{key:m},m))))),
    h('div',{className:'help-note'},'Credit note for '+FD_M(amt)+(mode==='Package credit'?' — added to the client’s package balance':'')+'. Returned products go back to stock.'),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Cancel'),h('button',{className:'btn btn-primary',onClick:()=>{if(!reason.trim())return toast('Enter the reason','error');const r=fdCreateCreditNote(sid,bill,chosen,reason.trim(),mode);if(r.error)return toast(r.error,'error');toast('Credit note '+r.cn.id+' — '+FD_M(r.amount),'success');onDone&&onDone();}},'Make credit note'))));
}

// ── Bills → Daily Sales & Exp (Controls → billingFeedsDailySales) ──
function fdFillDailySales(sid,iso){
  const d=new Date(iso+'T00:00:00');if(typeof isMonthLockedFor==='function'&&isMonthLockedFor(sid,d.getFullYear(),d.getMonth()))return'The month is locked.';{const ffm=typeof ffBlock==='function'&&ffBlock(sid,iso,'dsePost');if(ffm)return ffm;}
  const ds=fdDaySummary(sid,iso);const k=outletKey('salonos_daily_sales_collection_data',sid);const all=fdJ(k,{})||{};const cur=all[iso]||{};
  const had=[cur[0],cur[1],cur[2]].some(v=>Number(v)>0);if(had&&!window.confirm('Daily Sales for '+iso.split('-').reverse().join('/')+' already has Cash / Card / UPI entered. Replace them with the billed figures?'))return'Cancelled.';
  all[iso]={...cur,0:Math.round(ds.modes.Cash||0),1:Math.round(ds.modes.Card||0),2:Math.round(ds.modes.UPI||0)};safeLocalSet(k,JSON.stringify(all));
  const tips=Object.values(ds.tips).reduce((s,v)=>s+v,0);if(tips>0&&typeof EXPENSE_ROWS!=='undefined'){const ti=EXPENSE_ROWS.findIndex(r=>r.name==='Tip To Employee');if(ti>=0){const ek=outletKey('salonos_daily_sales_data',sid);const E=fdJ(ek,{})||{};E[iso]={...(E[iso]||{}),[ti]:Math.round(tips)};safeLocalSet(ek,JSON.stringify(E));}}
  try{logAuditEvent(sid,{entity:'Daily Sales',entityId:iso,action:'Filled from Billing',summary:'Cash '+FD_M(ds.modes.Cash)+' · Card '+FD_M(ds.modes.Card)+' · UPI '+FD_M(ds.modes.UPI)+(tips?' · tips '+FD_M(tips):'')});}catch(e){}
  return'';
}

// ── Import bills (Cradlee sales register / any Excel) ──
function fdGuessCol(headers,res){const H=headers.map(x=>String(x).trim().toLowerCase());for(const re of res){const i=H.findIndex(x=>re.test(x));if(i>=0)return headers[i];}return'';}
function fdParseImportRows(rows){
  if(!rows.length)return{cols:{},bills:[]};const headers=Object.keys(rows[0]);
  const cols={no:fdGuessCol(headers,[/invoice ?(no|number|#)/,/bill ?(no|number|#)/,/^invoice$/,/receipt/]),date:fdGuessCol(headers,[/invoice ?date/,/bill ?date/,/^date/,/date/]),
    name:fdGuessCol(headers,[/guest|client|customer/]),phone:fdGuessCol(headers,[/mobile|phone|contact/]),item:fdGuessCol(headers,[/service|item|product|particular/]),
    qty:fdGuessCol(headers,[/^qty|quantity/]),amount:fdGuessCol(headers,[/net ?amount|net ?total|^amount|^total|value|price/]),staff:fdGuessCol(headers,[/staff|stylist|employee|therapist|service by/]),mode:fdGuessCol(headers,[/payment|mode|paid by/])};
  const num=v=>{const n=Number(String(v==null?'':v).replace(/[₹,\s]/g,''));return isFinite(n)?n:0;};
  const iso=v=>{if(v instanceof Date)return localIsoOf(v);const t=typeof toISO==='function'?toISO(v):'';return t||'';};
  const by={};rows.forEach((r,i)=>{const no=String(cols.no?r[cols.no]:'').trim()||('row'+i);const b=by[no]=by[no]||{no,date:iso(cols.date?r[cols.date]:''),customer:String(cols.name?r[cols.name]:'').trim(),phone:fdP10(cols.phone?r[cols.phone]:''),staff:String(cols.staff?r[cols.staff]:'').trim(),mode:String(cols.mode?r[cols.mode]:'').trim(),items:[]};
    const name=String(cols.item?r[cols.item]:'').trim();const amt=num(cols.amount?r[cols.amount]:0);const q=num(cols.qty?r[cols.qty]:1)||1;if(name||amt)b.items.push({name:name||'Sale',qty:q,amount:amt});});
  return{cols,bills:Object.values(by).filter(b=>b.date&&b.items.length)};
}
function fdImportBills(sid,parsed){
  const L=fdBills(sid);const ids=new Set(L.map(b=>String(b.id)));const menu=fdMenu(sid);const staff=fdStaff(sid);let added=0,skipped=0;const out=[];
  parsed.bills.forEach(b=>{const id='CR-'+b.no;if(ids.has(id)){skipped++;return;}const st=staff.find(s=>s.name.toLowerCase()===b.staff.toLowerCase());
    const md=/card/i.test(b.mode)?'Card':/upi|gpay|phonepe|paytm/i.test(b.mode)?'UPI':/cash/i.test(b.mode)?'Cash':(b.mode?'Split':'Cash');
    out.push({id,source:'Import',date:b.date,customer:b.customer||'Walk-in',phone:b.phone,staff:st?st.name:b.staff,staffId:st?st.id:'',noGst:true,discount:0,status:'Paid',paymentMode:md==='Split'?'Cash':md,
      items:b.items.map(it=>{const m=menu.find(x=>x.name.toLowerCase()===it.name.toLowerCase());return{name:it.name,type:m?m.type:'Service',qty:it.qty,rate:Math.round(it.amount/(it.qty||1)*100)/100,gst:0,staffId:st?st.id:'',staffName:st?st.name:b.staff};}),createdAt:new Date().toISOString()});
    if(b.customer||b.phone)fdUpsertClient(sid,{name:b.customer,phone:b.phone,source:'Import'});added++;});
  safeLocalSet(outletKey('salonos_billing_invoices',sid),JSON.stringify([...out,...L]));try{logAuditEvent(sid,{entity:'Bill',entityId:'import',action:'Bills imported',summary:added+' bill(s)'});}catch(e){}
  return{added,skipped};
}
function FdImportBillsModal({sid,onClose,onDone}){
  const h=React.createElement;const {toast}=useToast();const [parsed,setParsed]=useState(null);const ref=useRef(null);
  const read=async e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;try{const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});setParsed(fdParseImportRows(rows));}catch(err){toast('Could not read: '+(err.message||err),'error');}};
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:640},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'⬆ Import bills (Cradlee sales register or any Excel)'),
    h('div',{style:{fontSize:12.5,color:'var(--text2)',marginBottom:8}},'Export the invoice / sales register from Cradlee (one row per invoice or per service line) and choose it here. Columns are matched by their names — invoice no., date, guest, mobile, service, qty, amount, staff, payment. Bills already imported are skipped; clients are added.'),
    h('button',{className:'btn btn-primary btn-sm',onClick:()=>ref.current&&ref.current.click()},'Choose file'),h('input',{type:'file',accept:'.xlsx,.xls,.csv',ref,style:{display:'none'},onChange:read}),
    parsed&&h('div',{style:{marginTop:10,fontSize:12.5}},h('div',null,'Columns found: ',Object.entries(parsed.cols).map(([k,v])=>h('span',{key:k,className:'badge '+(v?'badge-green':'badge-gray'),style:{marginRight:4}},k+(v?' = '+v:' —')))),
      h('div',{style:{marginTop:6}},parsed.bills.length+' bill(s) · '+FD_M(parsed.bills.reduce((s,b)=>s+b.items.reduce((t,i)=>t+i.amount,0),0))+(parsed.bills[0]?' · first: '+parsed.bills[0].date+' '+parsed.bills[0].customer:'')),
      !parsed.cols.date||!parsed.cols.amount?h('div',{style:{color:'var(--red)',marginTop:6}},'A date and an amount column are needed.'):null),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Cancel'),parsed&&parsed.bills.length>0&&parsed.cols.date&&parsed.cols.amount&&h('button',{className:'btn btn-primary',onClick:()=>{const r=fdImportBills(sid,parsed);toast(r.added+' bill(s) imported'+(r.skipped?', '+r.skipped+' already there':''),'success');onDone&&onDone();}},'Import '+parsed.bills.length+' bill(s)'))));
}

// ── Rooms / equipment ──
function fdResources(sid){const r=(fdSettings(sid).raw.resources)||[];return Array.isArray(r)?r.filter(Boolean):[];}
function fdResourceClash(sid,dayList,resource,start,dur,ignore){if(!resource)return null;return(dayList||[]).find(a=>a.status!=='Cancelled'&&a.status!=='No-show'&&!(ignore||[]).includes(a.id)&&(a.resource||((fdMenuItem(sid,a.service)||{}).resource))===resource&&start<a.start+a.dur&&a.start<start+dur)||null;}

// ── Patch tests (Controls → patchTestWarn) ──
function fdPatchTestOk(sid,phone,service){
  const m=fdMenuItem(sid,service);if(!m||!m.needsPatchTest||!controlOn('patchTestWarn',sid))return'';const c=fdClients(sid).find(x=>fdP10(x.phone)===fdP10(phone));const days=controlLimit('patchTestWarn',sid)||180;
  const last=(c&&c.patchTests||[]).filter(p=>p.result!=='Reaction').map(p=>p.date).sort().pop();if(!last)return service+' needs a patch test — none on record'+(c&&(c.patchTests||[]).some(p=>p.result==='Reaction')?' (an earlier test showed a reaction)':'');
  const age=Math.round((new Date(fdTodayIso()+'T00:00:00')-new Date(last+'T00:00:00'))/864e5);return age>days?service+' — last patch test '+age+' days ago (older than '+days+')':'';
}

// ── Family accounts (Controls → familySharing) ──
function fdFamilyPhones(sid,phone){const p=fdP10(phone);const C=fdClients(sid);const me=C.find(c=>fdP10(c.phone)===p);if(!me||!me.familyId||!controlOn('familySharing',sid))return[p];return C.filter(c=>c.familyId===me.familyId).map(c=>fdP10(c.phone)).filter(x=>x.length===10);}

// ── Campaigns ──
function fdCampaignKey(sid){return outletKey('salonos_campaigns',sid);}
function fdCampaigns(sid){const v=fdJ(fdCampaignKey(sid),[]);return Array.isArray(v)?v:[];}
function fdCampaignAudience(sid,f){
  const bills=fdBills(sid);const t=fdTodayIso();const mon=new Date().toLocaleDateString('en-IN',{month:'short'}).toLowerCase();
  const needConsent=controlOn('requireMarketingConsent',sid);
  return fdClients(sid).filter(c=>fdP10(c.phone).length===10&&!c.optOut&&(!needConsent||c.marketingConsent)).map(c=>({c,st:fdClientStats(c,bills)})).filter(({c,st})=>{const seg=fdSegOf(st);
    if(f.seg&&f.seg!=='All'&&seg!==f.seg)return false;if(f.service&&!st.bills.some(b=>(b.items||[]).some(it=>it.name===f.service)))return false;
    if(f.minDays&&!(st.since!=null&&st.since>=Number(f.minDays)))return false;if(f.maxDays&&!(st.since!=null&&st.since<=Number(f.maxDays)))return false;
    if(f.bday&&!String(c.birthday||'').toLowerCase().includes(mon))return false;if(f.minSpend&&st.spend<Number(f.minSpend))return false;if(f.tag&&!String(c.tags||'').toLowerCase().includes(String(f.tag).toLowerCase()))return false;return true;});
}
function FdCampaignModal({sid,onClose}){
  const h=React.createElement;const {toast}=useToast();const [f,setF]=useState({seg:'All',service:'',minDays:'',maxDays:'',minSpend:'',bday:false,tag:'',name:'',msg:'Hi {name}, '});const [camp,setCamp]=useState(null);const [,setT]=useState(0);
  const aud=fdCampaignAudience(sid,f);const menu=fdMenu(sid).filter(m=>m.type==='Service');const list=fdCampaigns(sid).slice().reverse();
  const start=()=>{if(!f.name.trim())return toast('Name the campaign','error');if(!f.msg.includes('{name}')&&!window.confirm('The message has no {name} — send it as it is?'))return;
    const c={id:'CP'+Date.now(),name:f.name.trim(),msg:f.msg,at:new Date().toISOString(),by:(currentSessionUser()||{}).name||'',to:aud.map(x=>({id:x.c.id,name:x.c.name,phone:x.c.phone,sent:false}))};safeLocalSet(fdCampaignKey(sid),JSON.stringify([...fdCampaigns(sid),c].slice(-50)));setCamp(c);};
  const send=(c,r)=>{if(!fdWa(r.phone,c.msg.split('{name}').join(String(r.name).split(' ')[0])))return;const L=fdCampaigns(sid).map(x=>x.id!==c.id?x:{...x,to:x.to.map(z=>z.id===r.id?{...z,sent:new Date().toISOString()}:z)});safeLocalSet(fdCampaignKey(sid),JSON.stringify(L));setCamp(L.find(x=>x.id===c.id));setT(x=>x+1);};
  const fld=(k,l,w,t)=>h('label',{style:{fontSize:11,color:'var(--text3)'}},l,h('input',{type:t||'text',className:'form-control',style:{width:w,padding:'4px 6px'},value:f[k],onChange:e=>setF({...f,[k]:e.target.value})}));
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:760,maxWidth:'97vw',maxHeight:'92vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'📣 Campaign'),
    !camp?h('div',null,
      h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'flex-end',marginBottom:8}},
        h('label',{style:{fontSize:11,color:'var(--text3)'}},'Segment',h('select',{className:'form-control',style:{width:110,padding:'4px 6px'},value:f.seg,onChange:e=>setF({...f,seg:e.target.value})},['All','VIP','Regular','New','Lapsed'].map(s=>h('option',{key:s},s)))),
        h('label',{style:{fontSize:11,color:'var(--text3)'}},'Had service',h('select',{className:'form-control',style:{width:170,padding:'4px 6px'},value:f.service,onChange:e=>setF({...f,service:e.target.value})},h('option',{value:''},'Any'),menu.map(m=>h('option',{key:m.id},m.name)))),
        fld('minDays','Last visit ≥ days',80,'number'),fld('maxDays','≤ days',70,'number'),fld('minSpend','Spend ≥ ₹',90,'number'),fld('tag','Tag',90),
        h('label',{style:{fontSize:12,display:'flex',gap:4,alignItems:'center'}},h('input',{type:'checkbox',checked:f.bday,onChange:e=>setF({...f,bday:e.target.checked})}),'Birthday this month')),
      h('div',{style:{fontSize:12.5,marginBottom:6}},h('b',null,aud.length),' client(s) match (clients who opted out are left out).'),
      fld('name','Campaign name',260),h('textarea',{className:'form-control',rows:4,style:{marginTop:6},value:f.msg,onChange:e=>setF({...f,msg:e.target.value})}),
      h('div',{style:{fontSize:11.5,color:'var(--text3)'}},'{name} becomes the client’s first name. Messages open one by one in WhatsApp — sent ones are ticked.'),
      list.length>0&&h('div',{style:{marginTop:10,fontSize:12.5}},h('b',null,'Earlier campaigns'),list.slice(0,8).map(c=>h('div',{key:c.id,style:{display:'flex',gap:8,padding:'3px 0'}},h('span',{style:{flex:1}},c.name+' · '+new Date(c.at).toLocaleDateString('en-GB',DMY_D)),h('span',null,c.to.filter(x=>x.sent).length+' / '+c.to.length+' sent'),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setCamp(c)},'Open')))))
    :h('div',null,h('div',{style:{marginBottom:6}},h('b',null,camp.name),' — '+camp.to.filter(x=>x.sent).length+' of '+camp.to.length+' sent'),h('div',{style:{background:'var(--bg3)',borderRadius:8,padding:8,fontSize:12.5,marginBottom:8}},camp.msg),
      h('div',{style:{maxHeight:'50vh',overflowY:'auto'}},camp.to.map(r=>h('div',{key:r.id,style:{display:'flex',gap:8,alignItems:'center',padding:'4px 0',borderBottom:'1px solid var(--border)',fontSize:12.5}},h('span',{style:{flex:1}},r.name+' · '+r.phone),r.sent?h('span',{style:{color:'var(--green)'}},'✓ sent'):null,h('button',{className:'btn btn-'+(r.sent?'ghost':'primary')+' btn-sm',onClick:()=>send(camp,r)},r.sent?'Again':'📲 Send')))),
      h('div',{style:{display:'flex',gap:6,marginTop:6}},h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setCamp(null)},'← Back'),
        controlOn('waApiSend',sid)&&h('button',{className:'btn btn-primary btn-sm',onClick:async()=>{const left=camp.to.filter(r=>!r.sent);if(!left.length)return;if(!window.confirm('Send to '+left.length+' client(s) through the WhatsApp Business API now?'))return;
          try{const r=await fdWaApiSend(sid,'campaign',left.map(x=>({phone:x.phone,params:[String(x.name).split(' ')[0],camp.msg.split('{name}').join(String(x.name).split(' ')[0])]})));const okP=new Set((r.results||[]).filter(z=>z.ok).map(z=>z.phone));
            const L=fdCampaigns(sid).map(x=>x.id!==camp.id?x:{...x,to:x.to.map(z=>okP.has(z.phone)?{...z,sent:new Date().toISOString(),api:true}:z)});safeLocalSet(fdCampaignKey(sid),JSON.stringify(L));setCamp(L.find(x=>x.id===camp.id));toast((r.sent||0)+' sent through the API','success');}catch(e){toast(e.message||String(e),'error');}}},'Send all through WhatsApp API'))),
    h('div',{className:'modal-actions'},!camp&&h('button',{className:'btn btn-primary',disabled:!aud.length,onClick:start},'Start ('+aud.length+')'),h('button',{className:'btn btn-ghost',onClick:onClose},'Close'))));
}

// ── Referral reward (Controls → referralReward): first bill of a referred client credits the referrer ──
function fdReferralReward(sid,bill){
  if(!controlOn('referralReward',sid))return'';const p=fdP10(bill.phone);if(p.length!==10)return'';const C=fdClients(sid);const me=C.find(c=>fdP10(c.phone)===p);if(!me||!me.referredBy||me.referralRewarded)return'';
  const prior=fdBills(sid).filter(b=>fdP10(b.phone)===p&&b.id!==bill.id&&b.status!=='Cancelled'&&b.kind!=='credit-note').length;if(prior)return'';
  const ref=C.find(c=>c.id===me.referredBy);if(!ref)return'';const amt=controlLimit('referralReward')||200;
  fdSaveClients(sid,C.map(c=>c.id===ref.id?{...c,referralCredits:[...(c.referralCredits||[]),{id:typeof fdRid==='function'?fdRid():'R'+Date.now(),date:bill.date,amount:amt,for:me.name}]}:c.id===me.id?{...c,referralRewarded:bill.id}:c));
  if(typeof fdClientAdjust==='function')fdClientAdjust(sid,ref.phone,'packageBalance',amt,'Referral: '+me.name);
  return FD_M(amt)+' referral credit to '+ref.name;
}

// ── Stock: price history, back-bar use per stylist, write-off, supplier catalogue ──
function fdPriceHistory(sid,itemId){const vendors=loadVendors(sid)||[];return(typeof loadInvLog==='function'?loadInvLog(sid):[]).filter(x=>x.itemId===itemId&&x.type==='receive'&&x.rate!=null)
  .map(x=>({date:x.date,rate:Number(x.rate),qty:x.qty,vendor:x.vendorId?((vendors.find(v=>String(v.id)===String(x.vendorId))||{}).name||x.vendorId):''})).sort((a,b)=>String(b.date).localeCompare(String(a.date)));}
function fdBackbarByStylist(sid,year,month){
  const pre=year+'-'+String(month+1).padStart(2,'0');const items=fdStock(sid);const out={};
  (typeof loadInvLog==='function'?loadInvLog(sid):[]).filter(x=>x.type==='issue'&&x.staff&&String(x.date).startsWith(pre)).forEach(x=>{const it=items.find(i=>i.id===x.itemId);const o=out[x.staff]=out[x.staff]||{issued:0,services:0};o.issued+=(Number(x.qty)||0)*(Number(it&&it.rate)||0);});
  fdBills(sid).filter(b=>b.status!=='Cancelled'&&String(b.date).startsWith(pre)).forEach(b=>(b.items||[]).forEach(it=>{if(it.type!=='Service')return;const s=it.staffName||b.staff;if(!s)return;const o=out[s]=out[s]||{issued:0,services:0};o.services+=(Number(it.qty)||0)*(Number(it.rate)||0);}));
  return Object.entries(out).map(([name,o])=>({name,issued:Math.round(o.issued),services:Math.round(o.services),pct:o.services?Math.round(o.issued/o.services*1000)/10:null})).sort((a,b)=>(b.pct||0)-(a.pct||0));
}
function fdWriteOffKey(sid){return outletKey('salonos_stock_writeoffs',sid);}
function fdWriteOffs(sid){const v=fdJ(fdWriteOffKey(sid),[]);return Array.isArray(v)?v:[];}
function fdWriteOffBatch(sid,itemId,batch,reason){
  const S=fdStock(sid);const it=S.find(i=>i.id===itemId);if(!it)return'Item not found';const b=(it.batches||[]).find(x=>x.batch===batch.batch&&x.expiry===batch.expiry);if(!b)return'Batch not found';
  const q=Number(b.qty)||0;it.batches=it.batches.filter(x=>x!==b);it.qty=Math.max(0,Math.round(((Number(it.qty)||0)-q)*100)/100);fdSaveStock(sid,S);const val=Math.round(q*(Number(it.rate)||0));
  safeLocalSet(fdWriteOffKey(sid),JSON.stringify([...fdWriteOffs(sid),{date:fdTodayIso(),itemId,name:it.name,batch:b.batch,expiry:b.expiry,qty:q,value:val,reason:reason||'Expired',by:(currentSessionUser()||{}).name||''}].slice(-500)));
  if(typeof logInvMove==='function')logInvMove(sid,it,'writeoff',q,Number(it.rate)||0);try{logAuditEvent(sid,{entity:'Stock',entityId:itemId,action:'Written off',summary:q+' '+it.unit+' '+it.name+' — '+FD_M(val)+' ('+(reason||'Expired')+')'});}catch(e){}
  return'';
}
function fdCatalogueRate(sid,item,vendorId){const s=(item&&item.suppliers||[]).find(x=>String(x.vendorId)===String(vendorId));return s?{rate:Number(s.rate)||Number(item.rate)||0,code:s.code||'',pack:s.pack||''}:null;}
