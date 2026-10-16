// ═════════════════════════════════════════════════════════════════════════════════════════════
// Front desk — daily use: ⚡ Quick bill, text receipt, check-in kiosk, service timings, stylist
// commission statement, product suggestions on the bill, membership renewal offer, reorder by
// supplier, owner front-desk dashboard, WhatsApp Business API sending (Controls → waApiSend).
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ── ⚡ Quick bill: big buttons for the most used services, client by phone, one tap per payment ──
function fdTopServices(sid,n){const cnt={};fdBills(sid).slice(0,600).forEach(b=>(b.items||[]).forEach(it=>{cnt[it.name]=(cnt[it.name]||0)+(Number(it.qty)||1);}));
  const menu=fdMenu(sid).filter(m=>m.active!==false&&(m.type==='Service'||m.type==='Product'));return menu.slice().sort((a,b)=>(cnt[b.name]||0)-(cnt[a.name]||0)).slice(0,n||12);}
function FdQuickBill({sid,onClose,onSaved}){
  const h=React.createElement;const {toast}=useToast();const staff=fdStaff(sid);const tiles=fdTopServices(sid,12);
  const [phone,setPhone]=useState('');const [name,setName]=useState('');const [staffId,setStaffId]=useState((staff[0]||{}).id||'');const [items,setItems]=useState([]);
  const c=fdP10(phone).length===10?fdClients(sid).find(x=>fdP10(x.phone)===fdP10(phone)):null;
  const add=m=>setItems(L=>{const i=L.findIndex(x=>x.name===m.name);if(i>=0)return L.map((x,j)=>j===i?{...x,qty:x.qty+1}:x);const s=staff.find(z=>z.id===staffId);return[...L,{name:m.name,type:m.type,qty:1,rate:Number(m.rate)||0,gst:m.gst!=null?Number(m.gst):18,staffId,staffName:s?s.name:''}];});
  const set=fdSettings(sid);const t=billCalc({items,noGst:!set.gst,inclusive:set.inclusive});
  const pay=mode=>{if(!items.length)return toast('Tap at least one service','error');const nm=name.trim()||(c&&c.name)||'Walk-in';const s=staff.find(z=>z.id===staffId);
    const r=fdCreateBill(sid,{customer:nm,phone:fdP10(phone),date:fdTodayIso(),staffId,staff:s?s.name:'',items,discount:0,paymentMode:mode,status:mode==='Unpaid'?'Unpaid':'Paid',noGst:!set.gst,inclusive:set.inclusive,quick:true});
    toast('Bill '+r.bill.id+' — '+FD_M(billCalc(r.bill).total)+' ('+mode+')','success');setItems([]);setPhone('');setName('');onSaved&&onSaved();};
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:760,maxWidth:'98vw',maxHeight:'94vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'⚡ Quick bill'),
    h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}},h('input',{className:'form-control',style:{flex:'1 1 160px',fontSize:16,padding:10},inputMode:'tel',placeholder:'Mobile',value:phone,onChange:e=>setPhone(e.target.value),autoFocus:true}),
      h('input',{className:'form-control',style:{flex:'1 1 160px',fontSize:16,padding:10},placeholder:c?c.name:'Name (optional)',value:name,onChange:e=>setName(e.target.value)}),
      h('select',{className:'form-control',style:{flex:'1 1 160px',fontSize:15},value:staffId,onChange:e=>setStaffId(e.target.value)},staff.map(s=>h('option',{key:s.id,value:s.id},s.name)))),
    c&&h('div',{style:{fontSize:12.5,marginBottom:8,color:'var(--text2)'}},'👤 '+c.name+(c.allergies?' · ⚠ '+c.allergies:'')+(fdPackageLeft(sid,c.phone)?' · package '+FD_M(fdPackageLeft(sid,c.phone)):'')),
    h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:8}},tiles.map(m=>h('button',{key:m.id,className:'btn btn-ghost',style:{height:64,flexDirection:'column',justifyContent:'center',whiteSpace:'normal',lineHeight:1.2,fontSize:13},onClick:()=>add(m)},h('b',null,m.name),h('span',{style:{fontSize:12,color:'var(--text3)'}},FD_M(m.rate))))),
    items.length>0&&h('div',{style:{marginTop:10,fontSize:13}},items.map((it,i)=>h('div',{key:i,style:{display:'flex',gap:8,alignItems:'center',padding:'3px 0'}},h('span',{style:{flex:1}},it.name+(it.qty>1?' ×'+it.qty:'')),h('b',null,FD_M(it.qty*it.rate)),h('button',{className:'btn btn-ghost btn-sm',style:{padding:'0 6px'},onClick:()=>setItems(L=>L.filter((_,j)=>j!==i))},'✕'))),
      h('div',{style:{display:'flex',justifyContent:'space-between',borderTop:'2px solid var(--accent)',marginTop:6,paddingTop:6,fontSize:16}},h('b',null,'Total'),h('b',null,FD_M(t.total)))),
    h('div',{style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginTop:12}},['Cash','Card','UPI','Unpaid'].map(md=>h('button',{key:md,className:'btn '+(md==='Unpaid'?'btn-ghost':'btn-primary'),style:{height:52,fontSize:15,justifyContent:'center'},disabled:!items.length,onClick:()=>pay(md)},md==='Unpaid'?'Unpaid':'💳 '+md))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:8}},'For discounts, split payment, packages or vouchers use + New bill.'),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Close'))));
}

// ── Text receipt (for thermal printer apps / sharing) ──
function fdReceiptText(sid,inv){
  const t=billCalc(inv);const salon=getSalonRecordById(sid)||{};const W=32;const pad=(a,b)=>{a=String(a);b=String(b);const sp=Math.max(1,W-a.length-b.length);return a.slice(0,W-b.length-1)+' '.repeat(sp)+b;};const line='-'.repeat(W);
  return[String(salon.name||'Salon').slice(0,W),salon.gst&&!inv.noGst?'GSTIN '+salon.gst:'',line,pad(inv.id,String(inv.date).split('-').reverse().join('/')),String(inv.customer||'').slice(0,W),line,
    ...(inv.items||[]).map(it=>pad((Number(it.qty)!==1?it.qty+'x ':'')+it.name,Math.round((Number(it.qty)||0)*(Number(it.rate)||0)))),line,pad('Subtotal',Math.round(t.subtotal)),t.disc?pad('Discount','-'+Math.round(t.disc)):'',inv.noGst?'':pad('GST',t.gst),pad('TOTAL Rs',t.total),pad('Paid by',inv.paymentMode),line,'Thank you! Visit again'].filter(Boolean).join('\n');
}
async function fdShareText(text,title){try{if(navigator.share){await navigator.share({title:title||'Receipt',text});return'shared';}}catch(e){if(e&&e.name==='AbortError')return'';}
  try{await navigator.clipboard.writeText(text);return'copied';}catch(e){return'';}}
if(typeof HELP_TOPICS!=='undefined'&&!HELP_TOPICS.some(t=>t.title==='Printing bills and receipts'))HELP_TOPICS.push({title:'Printing bills and receipts',body:[
  '<b>A5 bill</b> (🖨 A5) prints on any printer. <b>80 mm / 58 mm receipt</b> buttons open a narrow page — in the print dialog choose the thermal printer, paper size 80 mm (or 58 mm) roll, margins “None”, scale 100%, and switch off headers and footers.',
  'On Android, install a thermal printer app such as RawBT, then use <b>📄 Text</b> on the bill → Share → the printer app: it prints plain text without the browser’s page margins.',
  'For bills that must carry GST details, set SAC / HSN codes in Billing → ⚙ Menu & settings and enter the customer GSTIN on the bill — IGST is used automatically when the GSTIN is from another state.']});

// ── 🙋 Check-in kiosk (reception tablet) ──
function FdCheckinKiosk({sid,salonName,onClose,onCheckedIn}){
  const h=React.createElement;const [ph,setPh]=useState('');const [msg,setMsg]=useState('');const today=fdTodayIso();const key=sid+'|'+today;
  const find=()=>{const p=fdP10(ph);if(p.length!==10){setMsg('Please enter your 10-digit mobile number.');return;}const B=fdLoadBook(sid);const L=(B[key]||[]).filter(a=>fdP10(a.phone)===p&&['Booked','Confirmed'].includes(a.status));
    if(!L.length){setMsg('We could not find a booking for today on this number — please tell the front desk.');return;}
    B[key]=(B[key]||[]).map(a=>L.some(x=>x.id===a.id)?{...a,status:'Checked in',arrivedAt:new Date().toISOString()}:a);safeLocalSet(fdBookKey(sid),JSON.stringify(B));
    setMsg('✓ Welcome '+String(L[0].client).split(' ')[0]+'! You are checked in for '+L.map(a=>a.service).join(', ')+' with '+L[0].staff.split(' ')[0]+'. Please have a seat.');setPh('');onCheckedIn&&onCheckedIn();setTimeout(()=>setMsg(''),9000);};
  return h('div',{style:{position:'fixed',inset:0,zIndex:4000,background:'var(--bg)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:20}},
    h('div',{style:{fontSize:28,fontWeight:700,marginBottom:6,textAlign:'center'}},'Welcome to '+salonName),h('div',{style:{fontSize:16,color:'var(--text3)',marginBottom:20}},'Enter your mobile number to check in'),
    h('input',{className:'form-control',inputMode:'numeric',style:{maxWidth:360,fontSize:28,padding:16,textAlign:'center',letterSpacing:2},value:ph,onChange:e=>setPh(e.target.value.replace(/\D/g,'').slice(0,10)),onKeyDown:e=>e.key==='Enter'&&find(),autoFocus:true}),
    h('button',{className:'btn btn-primary',style:{marginTop:16,fontSize:20,padding:'14px 40px'},onClick:find},'Check in'),
    msg&&h('div',{style:{marginTop:20,fontSize:18,maxWidth:520,textAlign:'center',color:msg.startsWith('✓')?'var(--green)':'var(--orange)'}},msg),
    h('button',{className:'btn btn-ghost btn-sm',style:{position:'absolute',top:12,right:12,opacity:0.5},onClick:()=>{if(window.confirm('Close the check-in screen?'))onClose();}},'Staff: close'));
}

// ── ⏱ Service timings ──
function fdTimings(sid,fromIso,toIso){
  const B=fdLoadBook(sid);const svc={},sty={};
  Object.keys(B).forEach(k=>{const d=k.split('|')[1];if(d<fromIso||d>toIso)return;(B[k]||[]).forEach(a=>{if(!a.startedAt||!a.finishedAt)return;const m=Math.round((new Date(a.finishedAt)-new Date(a.startedAt))/60000);if(!(m>0&&m<600))return;
    const o=svc[a.service]=svc[a.service]||{n:0,mins:0,planned:fdDuration(sid,a.service)};o.n++;o.mins+=m;const s=sty[a.staff]=sty[a.staff]||{n:0,mins:0,over:0};s.n++;s.mins+=m;if(m>o.planned+10)s.over++;});});
  return{services:Object.entries(svc).map(([name,o])=>({name,n:o.n,avg:Math.round(o.mins/o.n),planned:o.planned})).sort((a,b)=>b.n-a.n),staff:Object.entries(sty).map(([name,o])=>({name,n:o.n,avg:Math.round(o.mins/o.n),over:o.over}))};
}
function fdUtilisation(sid,iso){
  const set=fdSettings(sid);const all=fdLoadBook(sid)[sid+'|'+iso]||[];const L=all.filter(a=>a.status!=='Cancelled'&&a.status!=='No-show'&&!a.block);
  return fdStaff(sid,iso).map(s=>{const off=fdStaffOff(sid,s,iso);const blk=all.filter(a=>a.block&&a.staff===s.name&&a.status!=='Cancelled').reduce((t,a)=>t+a.dur,0);const avail=off?0:Math.max(0,set.close-set.open-blk);const booked=L.filter(a=>a.staff===s.name).reduce((t,a)=>t+a.dur,0);return{name:s.name,off,booked,avail,pct:avail?Math.round(booked/avail*100):null};});
}

// ── 📄 Stylist commission statement ──
function fdStylistStatement(sid,staff,year,month){
  const by=fdBilledSalesByStaff(sid,year,month)[staff.id]||{svc:0,prod:0,mem:0};const pre=year+'-'+String(month+1).padStart(2,'0');
  const tips=fdBills(sid).filter(b=>b.status!=='Cancelled'&&String(b.date).startsWith(pre)).reduce((t,b)=>t+(b.tips||[]).filter(x=>String(x.staffId)===String(staff.id)).reduce((u,x)=>u+(Number(x.amount)||0),0),0);
  let inc=null;try{const r=(incWorkingsFor(sid,year,month)||[]).find(z=>String(z.id)===String(staff.id));if(r)inc=Math.round((Number(r.svcIncAmt)||0)+(Number(r.prodIncAmt)||0)+(Number(r.memIncAmt)||0)+(Number(r.mgrIncAmt)||0));}catch(e){}
  let adv=0;try{adv=Math.round(advanceDeductionFor(sid,staff.name,'Incentive',year,month)||0);}catch(e){}
  const B=fdLoadBook(sid);let done=0;Object.keys(B).forEach(k=>{if(!k.split('|')[1].startsWith(pre))return;(B[k]||[]).forEach(a=>{if(a.staff===staff.name&&(a.status==='Done'||a.billId))done++;});});
  return{name:staff.name,month:RPT_MONTHS[month]+' '+year,svc:by.svc,prod:by.prod,mem:by.mem,tips:Math.round(tips),inc,adv,done};
}
function fdStatementText(st,salonName){return'Hi '+String(st.name).split(' ')[0]+', your '+st.month+' statement from '+salonName+':\nServices '+FD_M(st.svc)+' · Products '+FD_M(st.prod)+(st.mem?' · Memberships '+FD_M(st.mem):'')+'\nClients served: '+st.done+'\nTips: '+FD_M(st.tips)+(st.inc!=null?'\nIncentive (estimate): '+FD_M(st.inc):'')+(st.adv?'\nAdvance recovered from incentive: '+FD_M(st.adv):'')+'\nThank you for your work!';}

// ── 💡 Product suggestions on the bill (Controls → productSuggestions) ──
function fdProductSuggestions(sid,items){
  if(!controlOn('productSuggestions',sid))return[];const svc=new Set((items||[]).filter(i=>i.type==='Service').map(i=>i.name));if(!svc.size)return[];const have=new Set((items||[]).map(i=>i.name));const cnt={};
  fdBills(sid).slice(0,1500).forEach(b=>{const it=b.items||[];if(!it.some(x=>x.type==='Service'&&svc.has(x.name)))return;it.forEach(x=>{if(x.type==='Product'&&!have.has(x.name))cnt[x.name]=(cnt[x.name]||0)+1;});});
  const menu=fdMenu(sid);return Object.entries(cnt).filter(([,n])=>n>=2).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name,n])=>({m:menu.find(x=>x.name===name),n})).filter(x=>x.m&&x.m.active!==false);
}
// ── 🔁 Membership renewal offer (Controls → renewalOffer) ──
function fdRenewalOffer(sid,phone,items){
  if(!controlOn('renewalOffer',sid)||fdP10(phone).length!==10)return null;const pct=controlLimit('renewalOffer',sid)||10;const p=fdP10(phone);const t=new Date(fdTodayIso()+'T00:00:00');
  const mem=fdMemberships(sid).filter(m=>m.type==='Membership'&&fdP10(m.phone)===p&&m.validTill).sort((a,b)=>String(b.validTill).localeCompare(String(a.validTill)))[0];if(!mem)return null;
  const days=Math.round((new Date(mem.validTill+'T00:00:00')-t)/864e5);if(days>15||days<-15)return null;const line=(items||[]).find(i=>i.type==='Membership');
  return{pct,days,plan:mem.plan||'Membership',amount:line?Math.round((Number(line.qty)||1)*(Number(line.rate)||0)*pct/100):0,hasLine:!!line};
}

// ── 🛒 Reorder by supplier ──
function fdReorderGroups(sid){
  const items=fdStock(sid).filter(i=>i.active!==false);const low=typeof smartReorderList==='function'?smartReorderList(sid,items):items.filter(i=>Number(i.qty)<=Number(i.min)).map(i=>({i,order:Math.max(1,Math.ceil(Number(i.min)*2-Number(i.qty)))}));
  const g={};low.forEach(x=>{const sp=(x.i.suppliers||[])[0];const k=sp?String(sp.vendorId):'';(g[k]=g[k]||[]).push({...x,sp});});return g;
}
function FdReorderModal({sid,onClose}){
  const h=React.createElement;const {toast}=useToast();const [,setT]=useState(0);const g=fdReorderGroups(sid);const vendors=loadVendors(sid)||[];const nm=String((getSalonRecordById(sid)||{}).name||'').split('—')[0].trim();
  const send=k=>{if(typeof createPO!=='function')return;const lines=g[k].map(x=>({itemId:x.i.id,name:x.i.name+(x.sp&&x.sp.code?' ['+x.sp.code+']':''),qty:x.order,unit:x.i.unit,rate:x.sp?Number(x.sp.rate)||Number(x.i.rate)||0:Number(x.i.rate)||0}));
    const po=createPO(sid,k,lines,'Reorder');const v=vendors.find(z=>String(z.id)===k)||{};const ph=typeof waNumber==='function'?waNumber(v.phone):'';
    const txt='Purchase order '+po.no+' — '+nm+'\n'+lines.map(l=>'• '+l.name+' — '+l.qty+' '+(l.unit||'')).join('\n')+'\nPlease confirm rates and delivery date.';
    if(ph)window.open('https://wa.me/'+ph+'?text='+encodeURIComponent(txt),'_blank','noopener');else{try{navigator.clipboard.writeText(txt);}catch(e){}toast('No phone for '+(v.name||'this vendor')+' — the PO text is copied','info');}
    toast(po.no+' created for '+(v.name||'supplier'),'success');setT(x=>x+1);};
  const keys=Object.keys(g);
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:640,maxWidth:'96vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'🛒 Reorder by supplier'),
    !keys.length?h('div',{style:{color:'var(--green)'}},'✓ Nothing to reorder.'):keys.map(k=>{const v=vendors.find(z=>String(z.id)===k);return h('div',{key:k||'none',className:'card',style:{marginBottom:8}},
      h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},h('b',null,v?v.name:'No supplier set (add one in the item’s catalogue)'),v&&h('button',{className:'btn btn-primary btn-sm',onClick:()=>send(k)},'Create PO & send on WhatsApp')),
      g[k].map(x=>h('div',{key:x.i.id,style:{fontSize:12.5,padding:'2px 0'}},x.i.name+' — order '+x.order+' '+x.i.unit+' (have '+x.i.qty+', min '+x.i.min+')'+(x.sp&&x.sp.rate?' · '+FD_M(x.sp.rate):''))));}),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-primary',onClick:onClose},'Close'))));
}

// ── 🧾 Owner front-desk dashboard (Dashboard → Front desk) ──
function FrontDeskOwnerBoard({accessibleSalons}){
  const h=React.createElement;const [iso,setIso]=useState(fdTodayIso());const outs=(accessibleSalons||[]).filter(s=>s&&s.id!=null&&s.status!=='Inactive');const ym=iso.slice(0,7);
  const rows=outs.map(s=>{const B=(fdLoadBook(s.id)[s.id+'|'+iso]||[]);const L=fdBills(s.id).filter(b=>b.date===iso);const live=L.filter(b=>b.status!=='Cancelled'&&b.kind!=='credit-note');
    const disc=live.reduce((t,b)=>t+billCalc(b).disc+(typeof fdRateDiscount==='function'?fdRateDiscount(s.id,b.items):0),0);const canc=L.filter(b=>b.status==='Cancelled').reduce((t,b)=>t+billCalc(b).total,0);const ref=L.filter(b=>b.kind==='credit-note').reduce((t,b)=>t-billCalc(b).total,0);
    const mm=fdMonthMoney(s.id,ym);const dues=fdDues(s.id);const old=fdOldDues(s.id);const low=fdBills(s.id).filter(b=>Number(b.rating)>0&&Number(b.rating)<=2&&!b.ratingSeen).length;
    return{s,bookings:B.filter(a=>a.status!=='Cancelled'&&!a.block).length,noShow:B.filter(a=>a.status==='No-show').length,done:B.filter(a=>a.status==='Done').length,sales:live.reduce((t,b)=>t+fdNewMoney(b),0),bills:live.length,disc,canc,ref,mm,due:dues.reduce((t,e)=>t+e.due,0),old:old.length,low,closed:!!fdClosedDays(s.id)[iso]};});
  const td=(v,c)=>h('td',{style:{textAlign:'right',color:c}},v);
  return h('div',null,h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}},
      h('div',null,h('div',{className:'page-title'},'Front desk'),h('div',{className:'page-sub'},'Bookings, sales (new money), discounts, cancellations, refunds, dues and low ratings per outlet.')),h('input',{type:'date',className:'form-control',style:{width:160},value:iso,onChange:e=>setIso(e.target.value)})),
    h('div',{className:'card',style:{padding:0}},h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,['Outlet','Bookings','Done','No-shows','Bills','Sales (new money)','Discounts','Cancelled','Refunds','Day closed','Month: new money','Used from packages','Dues','Old dues','Low ratings'].map((x,i)=>h('th',{key:i,style:i?{textAlign:'right'}:null},x)))),
      h('tbody',null,rows.map(r=>h('tr',{key:r.s.id},h('td',{style:{fontWeight:600}},rptShort(r.s)),td(r.bookings),td(r.done),td(r.noShow||'—',r.noShow?'var(--red)':''),td(r.bills),td(FD_M(r.sales)),td(r.disc?FD_M(r.disc):'—',r.disc?'var(--orange)':''),
        td(r.canc?FD_M(r.canc):'—',r.canc?'var(--red)':''),td(r.ref?FD_M(r.ref):'—',r.ref?'var(--red)':''),td(r.closed?'✓':'—',r.closed?'var(--green)':'var(--text3)'),td(FD_M(r.mm.newMoney)),td(r.mm.fromPackages?FD_M(r.mm.fromPackages):'—'),
        td(r.due?FD_M(r.due):'—'),td(r.old||'—',r.old?'var(--red)':''),td(r.low||'—',r.low?'var(--red)':''))))))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'Discounts include rates entered below the menu price. New money leaves out services paid from packages or vouchers (that money came in when the package was sold).'));
}

// ── WhatsApp Business API (Controls → waApiSend; needs the whatsapp function redeployed + approved templates) ──
async function fdWaApiSend(sid,templateKey,items){
  const tpl=((fdSettings(sid).raw.waTemplates)||{})[templateKey];if(!tpl)throw new Error('Enter the approved template name for “'+templateKey+'” in Billing → ⚙ Menu & settings → Hours, GST.');
  if(typeof waCall!=='function')throw new Error('WhatsApp is not available in this copy.');
  return await waCall('notify_clients',{outletId:sid,template:tpl,items:items.slice(0,200)});
}
