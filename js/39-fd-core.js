// ═════════════════════════════════════════════════════════════════════════════════════════════
// Front desk — shared core for Billing, Appointments, Clients and Inventory (js/39–42).
//   • Service & product menu per outlet (name, category, price, duration, GST, staff, stock link,
//     membership / package terms) — replaces the fixed demo list.
//   • Real staff from Master Salary (weekly off, leave and absence block bookings).
//   • Front-desk settings: hours, slot length, prices incl. GST, GST registered.
//   • Clients kept up to date from bills and bookings; memberships / packages in the Membership register.
//   • The bill form (BillEditor) used by Billing, Appointments ("Bill now") and Clients.
// Same storage keys as before, so existing bills, bookings, clients and stock carry over.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const FD_M=n=>'₹'+Math.round(Number(n)||0).toLocaleString('en-IN');
const fdP10=p=>String(p||'').replace(/\D/g,'').slice(-10);
const fdTodayIso=()=>localIsoOf(new Date());
const fdJ=(k,d)=>{try{const v=JSON.parse(cachedLocalGet(k)||'null');return v==null?d:v;}catch(e){return d;}};

// ── Settings ──
function fdSettings(sid){
  const s=fdJ(outletKey('salonos_frontdesk_settings',sid),{})||{};const rec=(typeof getSalonRecordById==='function'&&getSalonRecordById(sid))||outletSettings(sid)||{};
  const hm=v=>{const m=String(v||'').match(/^(\d{1,2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null;};
  return{open:hm(s.open)!=null?hm(s.open):9*60,close:hm(s.close)!=null?hm(s.close):21*60,slot:[15,20,30,45,60].includes(Number(s.slot))?Number(s.slot):30,
    inclusive:!!s.inclusive,gst:s.gst!=null?!!s.gst:!!(rec&&rec.gst),raw:s};
}
function fdSaveSettings(sid,patch){const k=outletKey('salonos_frontdesk_settings',sid);safeLocalSet(k,JSON.stringify({...(fdJ(k,{})||{}),...patch}));}

// ── Menu ──
const FD_CATS=['Hair','Skin','Nails','Spa & massage','Makeup','Waxing & threading','Retail product','Membership','Package','Other'];
function fdDefaultMenu(){
  const dur=typeof FD_DUR!=='undefined'?FD_DUR:{};const cat=n=>/facial|clean/i.test(n)?'Skin':/mani|pedi|nail/i.test(n)?'Nails':/massage|spa/i.test(n)?'Spa & massage':/makeup/i.test(n)?'Makeup':/wax|thread/i.test(n)?'Waxing & threading':'Hair';
  return[...BILL_SERVICES.map((s,i)=>({id:'S'+String(i+1).padStart(3,'0'),name:s.name,type:'Service',category:cat(s.name),rate:s.rate,duration:dur[s.name]||45,gst:18,staffIds:[],active:true})),
    ...BILL_PRODUCTS.map((p,i)=>({id:'P'+String(i+1).padStart(3,'0'),name:p.name,type:'Product',category:'Retail product',rate:p.rate,duration:0,gst:18,staffIds:[],active:true,stockItemId:''}))];
}
function fdMenu(sid){const v=fdJ(outletKey('salonos_service_menu',sid),null);return Array.isArray(v)&&v.length?v:fdDefaultMenu();}
function fdSaveMenu(sid,list){safeLocalSet(outletKey('salonos_service_menu',sid),JSON.stringify(list||[]));}
function fdMenuItem(sid,name){return fdMenu(sid).find(m=>m.name===name)||null;}
function fdDuration(sid,name){const m=fdMenuItem(sid,name);return m&&Number(m.duration)>0?Number(m.duration):45;}
function fdRateOf(sid,name){const m=fdMenuItem(sid,name);return m?Number(m.rate)||0:0;}

// ── Staff (Master Salary) ──
const FD_NON_FLOOR=/helper|housekeep|guard|driver|cleaner|peon|security|accountant/i;
function fdStaff(sid,iso){
  const d=iso?new Date(iso+'T00:00:00'):new Date();
  const emps=(typeof getEmployeesForMonth==='function'?getEmployeesForMonth(d.getFullYear(),d.getMonth(),sid)||[]:[]).filter(e=>e&&e.status!=='Inactive'&&!FD_NON_FLOOR.test(e.desig||''));
  return emps.map(e=>({id:String(e.id),name:e.name,role:e.desig||'',weeklyOff:e.weeklyOff||''}));
}
// '' when available, else why not (weekly off, absent on the register, approved leave).
function fdStaffOff(sid,staff,iso){
  if(!staff||!iso||!controlOn('staffOffBlocking',sid))return'';const d=new Date(iso+'T00:00:00');const dn=d.toLocaleDateString('en-IN',{weekday:'long'});
  if(staff.weeklyOff&&String(staff.weeklyOff).toLowerCase().includes(dn.toLowerCase()))return'Weekly off';
  try{const att=loadAttendance(sid)[attMonthKey(staff.id,d.getFullYear(),d.getMonth())];const v=att&&att.days?att.days[d.getDate()-1]:null;if(v==='absent')return'Absent';if(v==='off')return'Off';}catch(e){}
  try{if(typeof loadLeaveRequests==='function'&&loadLeaveRequests(sid).some(r=>r.status==='approved'&&String(r.empId)===String(staff.id)&&r.from<=iso&&(r.to||r.from)>=iso))return'On leave';}catch(e){}
  return'';
}

// ── Clients ──
function fdClients(sid){const v=fdJ(outletKey('salonos_clients',sid),[]);return Array.isArray(v)?v:[];}
function fdSaveClients(sid,list){safeLocalSet(outletKey('salonos_clients',sid),JSON.stringify(list||[]));}
function fdNextClientId(list){return'CL'+String(Math.max(0,...list.map(c=>Number(String(c.id||'').replace(/\D/g,''))||0))+1).padStart(5,'0');}
// Add or update by phone (or by exact name when no phone). Returns the client.
function fdUpsertClient(sid,data){
  const list=fdClients(sid);const p=fdP10(data.phone);const name=String(data.name||'').trim();if(!name&&!p)return null;
  let i=p.length===10?list.findIndex(c=>fdP10(c.phone)===p):list.findIndex(c=>!fdP10(c.phone)&&String(c.name||'').trim().toLowerCase()===name.toLowerCase());
  if(i<0){const c={id:fdNextClientId(list),name:name||'Client '+p.slice(-4),phone:p?p:'',tier:'None',visits:0,spend:0,createdAt:new Date().toISOString(),source:data.source||'Billing',...data,phone:p?p:(data.phone||'')};list.push(c);fdSaveClients(sid,list);return c;}
  const keep={...list[i]};Object.keys(data).forEach(k=>{if(data[k]!==undefined&&data[k]!==''&&k!=='phone')keep[k]=data[k];});if(!keep.name&&name)keep.name=name;list[i]=keep;fdSaveClients(sid,list);return keep;
}
function fdBills(sid){const v=fdJ(outletKey('salonos_billing_invoices',sid),[]);return Array.isArray(v)?v:[];}
// Visits, spend, last visit, usual service and stylist from the bills on the client's phone.
function fdClientStats(c,bills){
  const p=fdP10(c&&c.phone);const mine=p.length===10?(bills||[]).filter(b=>b&&b.status!=='Cancelled'&&fdP10(b.phone)===p):[];
  if(!mine.length){const since=c&&c.last?Math.round((new Date(fdTodayIso()+'T00:00:00')-new Date(c.last+'T00:00:00'))/864e5):null;return{visits:Number(c&&c.visits)||0,spend:Number(c&&c.spend)||0,last:(c&&c.last)||'',since,fav:(c&&c.fav)||'',stylist:(c&&c.stylist)||'',bills:[]};}
  const svc={},sty={};let spend=0,last='';mine.forEach(b=>{spend+=billCalc(b).total;if(String(b.date)>last)last=String(b.date);(b.items||[]).forEach(it=>{if(it.type==='Service'){svc[it.name]=(svc[it.name]||0)+1;const s=it.staffName||b.staff;if(s)sty[s]=(sty[s]||0)+1;}});});
  const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1])[0];
  return{visits:mine.length,spend:Math.round(spend),last,since:Math.round((new Date(fdTodayIso()+'T00:00:00')-new Date(last+'T00:00:00'))/864e5),fav:(top(svc)||[c.fav||''])[0],stylist:(top(sty)||[c.stylist||''])[0],bills:mine.sort((a,b)=>String(b.date).localeCompare(String(a.date)))};
}
function fdSegOf(st){return st.since==null?'New':st.since>90?'Lapsed':st.visits>=12?'VIP':st.visits>=4?'Regular':'New';}

// ── Memberships & packages (Membership register, js/22) ──
function fdMemberships(sid){return typeof loadMemberships==='function'?loadMemberships(sid)||[]:[];}
function fdActiveMembership(sid,phone){
  const P=typeof fdFamilyPhones==='function'?fdFamilyPhones(sid,phone):[fdP10(phone)];const t=fdTodayIso();return fdMemberships(sid).filter(m=>m.type==='Membership'&&P.includes(fdP10(m.phone))&&(!m.validTill||m.validTill>=t)).sort((a,b)=>String(b.soldOn).localeCompare(String(a.soldOn)))[0]||null;
}
function fdPackageLeft(sid,phone){
  const p=fdP10(phone);const P=typeof fdFamilyPhones==='function'?fdFamilyPhones(sid,phone):[p];const t=fdTodayIso();let left=0;
  fdMemberships(sid).forEach(m=>{if(m.type==='Membership'||!P.includes(fdP10(m.phone))||(m.validTill&&m.validTill<t))return;const used=(m.redemptions||[]).reduce((s,r)=>s+(Number(r.amount)||0),0);left+=Math.max(0,(Number(m.value)||Number(m.paid)||0)-used);});
  const c=fdClients(sid).find(x=>fdP10(x.phone)===p);return Math.round(left+(Number(c&&c.packageBalance)||0));
}

// ── Stock ──
function fdStock(sid){const v=fdJ(outletKey('salonos_inventory_items',sid),[]);return Array.isArray(v)?v:[];}
function fdSaveStock(sid,list){safeLocalSet(outletKey('salonos_inventory_items',sid),JSON.stringify(list||[]));}

// ── Saving a bill: client, membership / package, loyalty, stock ──
function fdAfterBillSaved(sid,bill,isNew){
  const out=[];if(!isNew)return out;const t=billCalc(bill);const p=fdP10(bill.phone);
  // client
  const st0=fdUpsertClient(sid,{name:bill.customer,phone:bill.phone,source:'Billing'});
  // membership / package sold
  (bill.items||[]).filter(it=>it.type==='Membership'||it.type==='Package').forEach(it=>{const m=fdMenuItem(sid,it.name)||{};const days=Number(m.validityDays)||365;
    const valid=localIsoOf(new Date(Date.now()+days*864e5));const paid=Math.round((Number(it.qty)||1)*(Number(it.rate)||0));const value=it.type==='Package'?Math.round((Number(m.credit)||paid)*(Number(it.qty)||1)):paid;
    if(typeof saveMemberships==='function'){const L=fdMemberships(sid);L.push({id:'M'+Date.now()+Math.random().toString(36).slice(2,4),client:bill.customer,phone:p,type:it.type,soldOn:bill.date,paid,value,validTill:valid,redemptions:[],bill:bill.id,plan:it.name,discountPct:Number(m.discountPct)||0});saveMemberships(sid,L);}
    if(it.type==='Membership')fdUpsertClient(sid,{phone:bill.phone,name:bill.customer,tier:it.name,tierValidTill:valid});
    out.push(it.type+' '+it.name+' recorded (till '+valid.split('-').reverse().join('/')+')');});
  // package used
  if(Number(bill.packagePaid)>0){let need=Number(bill.packagePaid);const L=fdMemberships(sid);
    const FP=typeof fdFamilyPhones==='function'?fdFamilyPhones(sid,bill.phone):[p];
    L.filter(m=>m.type!=='Membership'&&FP.includes(fdP10(m.phone))&&(!m.validTill||m.validTill>=bill.date)).sort((a,b)=>String(a.validTill||'9').localeCompare(String(b.validTill||'9'))).forEach(m=>{if(need<=0)return;
      const left=(Number(m.value)||Number(m.paid)||0)-(m.redemptions||[]).reduce((s,r)=>s+(Number(r.amount)||0),0);const use=Math.min(left,need);if(use>0){m.redemptions=[...(m.redemptions||[]),{id:typeof fdRid==='function'?fdRid():'R'+Date.now(),date:bill.date,amount:Math.round(use*100)/100,note:'Bill '+bill.id}];need-=use;}});
    if(typeof saveMemberships==='function')saveMemberships(sid,L);
    if(need>0.5){if(typeof fdClientAdjust==='function')fdClientAdjust(sid,bill.phone,'packageBalance',-need,'Bill '+bill.id);}
    out.push(FD_M(bill.packagePaid)+' paid from the package');}
  // gift voucher sold / used
  if(bill.voucherSale&&typeof fdSaveVouchers==='function'){fdSaveVouchers(sid,[...fdVouchers(sid),{...bill.voucherSale,soldOn:bill.date,bill:bill.id,redemptions:[]}]);out.push('Voucher '+bill.voucherSale.code+' issued');}
  if(Number(bill.voucherPaid)>0&&bill.voucherCode&&typeof fdRedeemVoucher==='function'){const u=fdRedeemVoucher(sid,bill.voucherCode,bill.voucherPaid,bill.id);if(u)out.push(FD_M(u)+' from voucher '+bill.voucherCode);}
  {const rr=typeof fdReferralReward==='function'?fdReferralReward(sid,bill):'';if(rr)out.push(rr);}
  // loyalty points
  if(controlOn('loyaltyPoints',sid)&&p.length===10){const pct=controlLimit('loyaltyPoints')||5;const earnOn=Math.max(0,t.total-(Number(bill.packagePaid)||0)-(Number(bill.voucherPaid)||0));const earned=Math.floor(earnOn*pct/100);
    const delta=earned-(Number(bill.pointsUsed)||0);if(delta&&typeof fdClientAdjust==='function')fdClientAdjust(sid,bill.phone,'points',delta,'Bill '+bill.id);if(earned)out.push(earned+' points earned');}
  // stock: retail sold, and back-bar use per service (standard usage)
  const stock=fdStock(sid);let changed=false;
  if(controlOn('billReducesStock',sid))(bill.items||[]).filter(it=>it.type==='Product').forEach(it=>{const m=fdMenuItem(sid,it.name)||{};
    const s=stock.find(z=>(m.stockItemId&&z.id===m.stockItemId)||String(z.name).toLowerCase()===String(it.name).toLowerCase());if(!s)return;const q=Number(it.qty)||1;s.qty=Math.round(((Number(s.qty)||0)-q)*100)/100;changed=true;
    if(typeof logInvMove==='function')logInvMove(sid,s,'sale',q,Number(it.rate)||0);});
  if(controlOn('autoIssueStdUsage',sid)&&typeof loadStdUsage==='function'){const U=loadStdUsage(sid);(bill.items||[]).filter(it=>it.type==='Service').forEach(it=>{(U[it.name]||[]).forEach(u=>{const s=stock.find(z=>z.id===u.itemId);if(!s)return;const q=(Number(u.qty)||0)*(Number(it.qty)||1);if(!(q>0))return;
    s.qty=Math.round(((Number(s.qty)||0)-q)*100)/100;changed=true;if(typeof logInvMove==='function')logInvMove(sid,s,'issue',q,null,{staff:it.staffName||bill.staff||''});});});}
  if(changed){fdSaveStock(sid,stock);if(typeof fdRecalcStock==='function')fdRecalcStock(sid);}
  try{logAuditEvent(sid,{entity:'Bill',entityId:bill.id,action:'Created',summary:(bill.customer||'')+' — '+FD_M(t.total)+(out.length?' · '+out.join(' · '):'')});}catch(e){}
  return out;
}

// ── The bill form ──
function fdBlankBill(sid,staff){return{customer:'',phone:'',staff:staff&&staff[0]?staff[0].name:'',staffId:staff&&staff[0]?staff[0].id:'',date:fdTodayIso(),items:[],discount:0,discountReason:'',paymentMode:'Cash',payments:[],tips:[],status:'Paid',notes:''};}
function BillEditor({sid,initial,editId,onSave,onClose,existingIds}){
  const h=React.createElement;const {toast}=useToast();const set=fdSettings(sid);const menu=fdMenu(sid).filter(m=>m.active!==false);const staff=fdStaff(sid,(initial&&initial.date)||fdTodayIso());
  const [form,setForm]=useState(()=>({...fdBlankBill(sid,staff),...(initial||{}),items:((initial&&initial.items)||[]).map(x=>({...x}))}));const [pick,setPick]=useState('');const [vcode,setVcode]=useState((initial&&initial.voucherCode)||'');
  const t=billCalc({...form,noGst:!set.gst,inclusive:set.inclusive});const c=fdP10(form.phone).length===10?fdClients(sid).find(x=>fdP10(x.phone)===fdP10(form.phone)):null;
  const mem=fdP10(form.phone).length===10?fdActiveMembership(sid,form.phone):null;const pkg=fdP10(form.phone).length===10?fdPackageLeft(sid,form.phone):0;
  const fc=k=>e=>{const v=e.target.value;setForm(f=>({...f,[k]:v}));};
  const addItem=nameOrCode=>{const q=String(nameOrCode||'').trim();if(!q)return;
    let m=menu.find(x=>x.name===q)||menu.find(x=>x.barcode&&x.barcode===q);let st=null;
    if(!m){st=fdStock(sid).find(z=>z.barcode&&z.barcode===q&&z.active!==false);if(st)m={name:st.name,type:'Product',rate:Number(st.sell)||0,gst:18,stockItemId:st.id};}
    if(!m){toast('Not in the menu: '+q,'error');return;}
    if(m.type==='Combo'&&typeof fdComboLines==='function'){const CL=fdComboLines(sid,m);if(!CL.length){toast('Combo '+m.name+' has no valid parts — fix it in ⚙ Menu','error');return;}setForm(f=>({...f,items:[...f.items,...CL.map(x=>({...x,staffId:f.staffId||'',staffName:f.staff||''}))]}));setPick('');return;}
    setForm(f=>{const ex=f.items.findIndex(x=>x.name===m.name&&x.type==='Product');if(ex>=0)return{...f,items:f.items.map((x,i)=>i===ex?{...x,qty:(Number(x.qty)||0)+1}:x)};
      return{...f,items:[...f.items,{name:m.name,type:m.type,qty:1,rate:Number(m.rate)||0,gst:m.gst!=null?Number(m.gst):18,staffId:f.staffId||'',staffName:f.staff||''}]};});setPick('');};
  const setItem=(i,k,v)=>setForm(f=>({...f,items:f.items.map((x,j)=>j===i?{...x,[k]:v}:x)}));
  const save=()=>{
    if(!String(form.customer).trim()){toast('Customer name is required','error');return;}
    if(!form.items.length){toast('Add at least one service or product','error');return;}
    const rateDisc=typeof fdRateDiscount==='function'?fdRateDiscount(sid,form.items):0;const sub=typeof fdListSubtotal==='function'?fdListSubtotal(sid,form.items):t.subtotal;const discPct=sub?((Number(form.discount)||0)-(Number(form.couponDisc)||0)+rateDisc)/sub*100:0;
    if(rateDisc>0&&controlOn('discountReason',sid)&&discPct>(controlLimit('discountReason')||10)&&!String(form.discountReason||'').trim()){toast('Rates below the menu price give '+FD_M(rateDisc)+' off — enter the discount reason','error');return;}
    if(editId&&initial&&controlOn('staffChangeLock',sid)&&!isSuperAdminUser(currentSessionUser())){const was=(initial.items||[]).map(x=>x.name+'|'+(x.staffId||'')).join(';'),now=form.items.map(x=>x.name+'|'+(x.staffId||'')).join(';');if(was!==now&&(initial.items||[]).length===form.items.length&&(initial.items||[]).every((x,i)=>x.name===form.items[i].name)){toast('Changing who did a service on a saved bill needs a Super Admin (Controls → Stylist change lock)','error');return;}}
    if(controlOn('discountReason',sid)&&discPct>(controlLimit('discountReason')||10)&&!String(form.discountReason||'').trim()){toast('Discount above '+(controlLimit('discountReason')||10)+'% — enter the reason','error');return;}
    if(!editId&&controlOn('discountApproval',sid)&&discPct>(controlLimit('discountApproval')||25)&&!requireApproval({control:'discountApproval',sid,key:sid+'|disc|'+fdP10(form.phone)+'|'+form.date+'|'+Math.round((Number(form.discount)||0)+rateDisc),summary:'Discount of '+Math.round(discPct)+'% ('+FD_M((Number(form.discount)||0)+rateDisc)+(rateDisc?' incl. '+FD_M(rateDisc)+' below menu price':'')+') on a '+FD_M(sub)+' bill for '+form.customer}))return;
    if(form.status==='Unpaid'&&!editId&&controlOn('creditLimit',sid)&&typeof fdClientDue==='function'){const owed=fdClientDue(sid,form.phone);const lim=controlLimit('creditLimit')||5000;if(owed+t.total>lim){toast('Credit limit '+FD_M(lim)+': '+form.customer+' already owes '+FD_M(owed)+' — take payment or raise the limit in Controls','error');return;}}
    if(form.paymentMode==='Split'){const paid=(form.payments||[]).reduce((s,x)=>s+(Number(x.amount)||0),0)+(Number(form.packagePaid)||0)+(Number(form.voucherPaid)||0)+(Number(form.advancePaid)||0);if(Math.abs(paid-t.total)>1){toast('Split payments add up to '+FD_M(paid)+' — the bill is '+FD_M(t.total),'error');return;}}
    if(form.usePackage&&pkg>0){form.packagePaid=Math.min(pkg,t.total);}
    if(Number(form.pointsUsed)>Number(c&&c.points||0)){toast('Only '+(c&&c.points||0)+' points available','error');return;}
    const rec={...form,noGst:!set.gst,inclusive:set.inclusive,items:form.items.map(x=>({...x,qty:Number(x.qty)||1,rate:Number(x.rate)||0,gst:Number(x.gst)||0})),discount:Number(form.discount)||0,
      tips:(form.tips||[]).filter(x=>Number(x.amount)>0).map(x=>({...x,amount:Number(x.amount)})),payments:form.paymentMode==='Split'?(form.payments||[]).filter(x=>Number(x.amount)>0).map(x=>({...x,amount:Number(x.amount)})):[]};
    if(Number(rec.packagePaid)>=t.total-0.5&&rec.paymentMode!=='Split')rec.paymentMode='Package';
    if(Number(rec.voucherPaid)>=t.total-0.5&&rec.paymentMode!=='Split')rec.paymentMode='Voucher';
    if(Number(rec.advancePaid)>=t.total-0.5&&rec.paymentMode!=='Split')rec.paymentMode='Advance';
    delete rec.usePackage;delete rec._cc;
    if(!editId&&controlOn('duplicateBillCheck',sid)&&typeof fdDuplicateBill==='function'){const d=fdDuplicateBill(sid,rec);if(d&&!window.confirm('Bill '+d.id+' for '+d.customer+' with the same items was made '+Math.max(1,Math.round((Date.now()-new Date(d.createdAt))/60000))+' min ago.\n\nMake another one anyway?'))return;}
    onSave(rec);};
  const inp={padding:'4px 6px',fontSize:12.5};const lbl=(l,el)=>h('div',{className:'form-group',style:{marginBottom:8}},h('label',null,l),el);
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:780,maxWidth:'97vw',maxHeight:'92vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},editId?'Edit bill — '+editId:'New bill'),
    h('div',{className:'form-row cols3'},
      lbl('Mobile',h('input',{className:'form-control',value:form.phone,list:'fd-client-phones',placeholder:'98xxxxxxxx',onChange:e=>{const v=e.target.value;const cl=fdP10(v).length===10?fdClients(sid).find(x=>fdP10(x.phone)===fdP10(v)):null;setForm(f=>({...f,phone:v,customer:f.customer||(cl?cl.name:'')}));}})),
      lbl('Customer name *',h('input',{className:'form-control',value:form.customer,list:'fd-client-names',placeholder:'Name',onChange:e=>{const v=e.target.value;const cl=fdClients(sid).find(x=>x.name===v);setForm(f=>({...f,customer:v,phone:f.phone||(cl?cl.phone:'')}));}})),
      lbl('Date',h('input',{type:'date',className:'form-control',value:form.date,onChange:fc('date')}))),
    h('datalist',{id:'fd-client-phones'},fdClients(sid).slice(0,400).map(x=>h('option',{key:x.id,value:x.phone},x.name))),
    h('datalist',{id:'fd-client-names'},fdClients(sid).slice(0,400).map(x=>h('option',{key:x.id,value:x.name},x.phone))),
    (()=>{const ro=typeof fdRenewalOffer==='function'?fdRenewalOffer(sid,form.phone,form.items):null;return ro?h('div',{style:{fontSize:12.5,margin:'0 0 8px',color:'#2f5fe0'}},'🔁 '+ro.plan+(ro.days>=0?' ends in '+ro.days+' day(s)':' ended '+(-ro.days)+' day(s) ago')+' — renewal offer '+ro.pct+'%',ro.hasLine&&!(Number(form.discount)>0)&&h('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:6},onClick:()=>setForm(f=>({...f,discount:ro.amount,discountReason:'Renewal offer '+ro.pct+'%'}))},'Apply '+FD_M(ro.amount))):null;})(),
    fdSettings(sid).gst&&h('div',{style:{display:'flex',gap:8,alignItems:'center',margin:'0 0 8px',flexWrap:'wrap'}},h('span',{style:{fontSize:12,color:'var(--text3)'}},'Business client GSTIN (optional)'),h('input',{className:'form-control',style:{width:200,padding:'4px 6px',textTransform:'uppercase'},value:form.custGstin||'',maxLength:15,onChange:e=>setForm(f=>({...f,custGstin:e.target.value.toUpperCase().trim()}))}),
      form.custGstin&&typeof isValidGSTINFormat==='function'&&!isValidGSTINFormat(form.custGstin)&&h('span',{style:{fontSize:11.5,color:'var(--red)'}},'GSTIN looks wrong'),form.custGstin&&typeof fdIsInterState==='function'&&fdIsInterState(sid,form)&&h('span',{style:{fontSize:11.5,color:'#2f5fe0'}},'Other state → IGST')),
    !editId&&typeof FdConsultNudge==='function'&&h(FdConsultNudge,{sid,phone:form.phone}),
    !editId&&(()=>{const A=typeof fdOpenAdvances==='function'?fdOpenAdvances(sid,form.phone):[];if(!A.length)return null;const amt=A.reduce((s,a)=>s+a.amount,0);return h('div',{style:{fontSize:12.5,margin:'0 0 8px',color:'var(--green)'}},'💰 Advance of '+FD_M(amt)+' received ('+A.map(a=>fdDmy(a.date)+' '+a.mode).join(', ')+')',
      Number(form.advancePaid)>0?h('span',null,' — '+FD_M(form.advancePaid)+' adjusted ',h('button',{className:'btn btn-ghost btn-sm',style:{padding:'0 4px'},onClick:()=>setForm(f=>({...f,advancePaid:0,advanceIds:[]}))},'✕')):h('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:6},onClick:()=>setForm(f=>({...f,advancePaid:Math.min(amt,t.total),advanceIds:A.map(a=>a.id)}))},'Adjust in this bill'));})(),
    !editId&&(()=>{const F=typeof fdPendingFees==='function'?fdPendingFees(sid,form.phone).filter(x=>!form.items.some(it=>it.feeId===x.id)):[];if(!F.length)return null;return h('div',{style:{fontSize:12.5,margin:'0 0 8px',color:'var(--orange)'}},'🚫 No-show fee pending: '+F.map(x=>FD_M(x.amount)+' ('+x.service+', '+fdDmy(x.date)+')').join(', '),
      h('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:6},onClick:()=>setForm(f=>({...f,items:[...f.items,...F.map(x=>({name:'No-show fee',type:'Fee',qty:1,rate:x.amount,gst:18,feeId:x.id,staffId:'',staffName:''}))]}))},'Add to bill'),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{if(!requireApproval({control:'noShowFee',sid,key:sid+'|waive|'+F.map(x=>x.id).join(','),summary:'Waive no-show fee '+FD_M(F.reduce((s,x)=>s+x.amount,0))+' for '+form.customer}))return;fdDropFees(sid,form.phone,F.map(x=>x.id),'waived');setForm(f=>({...f}));}},'Waive'));})(),
    typeof BillingClientStrip==='function'&&h(BillingClientStrip,{sid,phone:form.phone,total:t.total,usePackage:form.usePackage,onUsePackage:v=>setForm(f=>({...f,usePackage:v}))}),
    mem&&Number(mem.discountPct)>0&&!(Number(form.discount)>0)&&h('div',{style:{fontSize:12.5,margin:'0 0 8px'}},h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{const svc=form.items.filter(x=>x.type==='Service').reduce((s,x)=>s+(Number(x.qty)||0)*(Number(x.rate)||0),0);setForm(f=>({...f,discount:Math.round(svc*Number(mem.discountPct)/100),discountReason:'Membership '+(mem.plan||'')+' '+mem.discountPct+'%'}));}},'Apply membership discount '+mem.discountPct+'% on services')),
    h('div',{className:'form-row cols3'},
      lbl('Main stylist',h('select',{className:'form-control',value:form.staffId,onChange:e=>{const s=staff.find(z=>z.id===e.target.value);setForm(f=>({...f,staffId:e.target.value,staff:s?s.name:''}));}},h('option',{value:''},staff.length?'— choose —':'Add staff in Master Salary'),staff.map(s=>h('option',{key:s.id,value:s.id},s.name+(s.role?' · '+s.role:''))))),
      lbl('Payment',h('select',{className:'form-control',value:form.paymentMode,onChange:fc('paymentMode')},['Cash','Card','UPI','Split'].map(m=>h('option',{key:m},m)))),
      lbl('Status',h('select',{className:'form-control',value:form.status,onChange:fc('status')},['Paid','Unpaid','Cancelled'].map(m=>h('option',{key:m},m))))),
    h('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:10,marginBottom:10,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
      h('input',{className:'form-control',style:{flex:1,minWidth:220},list:'fd-menu-list',value:pick,placeholder:'Type a service / product, or scan a barcode — Enter to add',onChange:e=>setPick(e.target.value),onKeyDown:e=>{if(e.key==='Enter'){e.preventDefault();addItem(pick);}}}),
      h('datalist',{id:'fd-menu-list'},menu.map(m=>h('option',{key:m.id,value:m.name},m.type+' · '+FD_M(m.rate)))),
      h('select',{className:'form-control',style:{width:220},value:'',onChange:e=>addItem(e.target.value)},h('option',{value:''},'+ Pick from the menu…'),
        ['Service','Product','Membership','Package',...(controlOn('combos',sid)?['Combo']:[])].map(tp=>{const L=menu.filter(m=>m.type===tp);return L.length?h('optgroup',{key:tp,label:tp+'s'},L.map(m=>h('option',{key:m.id,value:m.name},m.name+' — '+FD_M(m.rate)))):null;}))),
    (()=>{const sg=typeof fdProductSuggestions==='function'?fdProductSuggestions(sid,form.items):[];return sg.length?h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',marginBottom:8,fontSize:12}},h('span',{style:{color:'var(--text3)'}},'💡 Often bought with these services:'),sg.map(x=>h('button',{key:x.m.id,className:'btn btn-ghost btn-sm',onClick:()=>addItem(x.m.name)},'+ '+x.m.name+' ('+FD_M(x.m.rate)+')'))):null;})(),
    (()=>{const rd=typeof fdRateDiscount==='function'?fdRateDiscount(sid,form.items):0;return rd>0?h('div',{style:{fontSize:12,color:'var(--orange)',marginBottom:6}},'⚠ Rates entered below the menu price — '+FD_M(rd)+' counts as discount.'):null;})(),
    form.items.length>0&&h('div',{className:'table-wrap',style:{marginBottom:10,border:'1px solid var(--border)',borderRadius:'var(--r)'}},h('table',null,
      h('thead',null,h('tr',null,['Item','Done by','Qty','Rate ₹','GST %','Amount',''].map((x,i)=>h('th',{key:i,style:i>=2&&i<=5?{textAlign:'right'}:null},x)))),
      h('tbody',null,form.items.map((it,i)=>h('tr',{key:i},
        h('td',null,h('div',{style:{fontWeight:500}},it.name),h('span',{className:'badge '+(it.type==='Service'?'badge-blue':it.type==='Product'?'badge-purple':'badge-amber'),style:{fontSize:9}},it.type)),
        h('td',null,h('select',{className:'form-control',style:{...inp,width:140},value:it.staffId||'',onChange:e=>{const s=staff.find(z=>z.id===e.target.value);setForm(f=>({...f,items:f.items.map((x,j)=>j===i?{...x,staffId:e.target.value,staffName:s?s.name:''}:x)}));}},h('option',{value:''},'—'),staff.map(s=>h('option',{key:s.id,value:s.id},s.name)))),
        h('td',{style:{width:64}},h('input',{type:'number',min:1,className:'form-control',style:{...inp,textAlign:'right'},value:it.qty,onChange:e=>setItem(i,'qty',e.target.value)})),
        h('td',{style:{width:96}},h('input',{type:'number',min:0,className:'form-control',style:{...inp,textAlign:'right'},value:it.rate,onChange:e=>setItem(i,'rate',e.target.value)})),
        h('td',{style:{width:70}},h('select',{className:'form-control',style:{...inp},value:String(it.gst==null?18:it.gst),disabled:!set.gst,onChange:e=>setItem(i,'gst',Number(e.target.value))},[0,5,12,18,28].map(g=>h('option',{key:g,value:g},g)))),
        h('td',{style:{textAlign:'right',fontWeight:600}},FD_M((Number(it.qty)||0)*(Number(it.rate)||0))),
        h('td',null,h('span',{style:{cursor:'pointer',color:'var(--red)'},onClick:()=>setForm(f=>({...f,items:f.items.filter((_,j)=>j!==i)}))},'✕'))))))),
    h('div',{style:{display:'flex',gap:14,flexWrap:'wrap',alignItems:'flex-start'}},
      h('div',{style:{flex:'1 1 300px'}},
        h('div',{className:'form-row cols2'},lbl('Discount ₹',h('input',{type:'number',min:0,className:'form-control',value:form.discount,onChange:fc('discount')})),
          lbl('Discount reason',h('input',{className:'form-control',value:form.discountReason||'',placeholder:Number(form.discount)>0?'e.g. regular client':'',onChange:fc('discountReason')}))),
        controlOn('giftVouchers',sid)&&!editId&&h('div',{className:'form-group',style:{marginBottom:8}},h('label',null,'Gift voucher code'),h('div',{style:{display:'flex',gap:6}},
          h('input',{className:'form-control',style:{textTransform:'uppercase'},value:vcode,placeholder:'GV…',onChange:e=>setVcode(e.target.value)}),
          h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{const v=fdFindVoucher(sid,vcode);if(!v)return toast('No such voucher','error');if(v.expired)return toast('Voucher expired on '+v.expiry,'error');if(!(v.left>0))return toast('Voucher already used up','error');
            const use=Math.min(v.left,Math.max(0,t.total-(Number(form.packagePaid)||0)));setForm(f=>({...f,voucherCode:v.code,voucherPaid:use}));toast(FD_M(use)+' from voucher '+v.code+' (left '+FD_M(v.left-use)+')','success');}},'Apply')),
          Number(form.voucherPaid)>0&&h('div',{style:{fontSize:11.5,color:'var(--green)'}},FD_M(form.voucherPaid)+' from '+form.voucherCode,h('button',{className:'btn btn-ghost btn-sm',style:{padding:'0 4px'},onClick:()=>setForm(f=>({...f,voucherCode:'',voucherPaid:0}))},'✕'))),
        controlOn('coupons',sid)&&!editId&&h('div',{className:'form-group',style:{marginBottom:8}},h('label',null,'Coupon code'),Number(form.couponDisc)>0?h('div',{style:{fontSize:12.5,color:'var(--green)'}},form.couponCode+' — '+FD_M(form.couponDisc)+' off',
            h('button',{className:'btn btn-ghost btn-sm',style:{padding:'0 4px'},onClick:()=>setForm(f=>({...f,discount:Math.max(0,(Number(f.discount)||0)-(Number(f.couponDisc)||0)),discountReason:String(f.discountReason||'').replace(' + Coupon '+f.couponCode,'').replace('Coupon '+f.couponCode,''),couponCode:'',couponDisc:0}))},'✕'))
          :h('div',{style:{display:'flex',gap:6}},h('input',{className:'form-control',style:{textTransform:'uppercase'},value:form._cc||'',placeholder:'e.g. FESTIVE20',onChange:e=>{const v=e.target.value;setForm(f=>({...f,_cc:v}));}}),
            h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{const r=fdCheckCoupon(sid,form._cc,form.phone,form.items);if(r.err)return toast(r.err,'error');if(!(r.amount>0))return toast('Nothing on this bill qualifies for '+r.coupon.code,'error');
              setForm(f=>({...f,couponCode:r.coupon.code,couponDisc:r.amount,discount:(Number(f.discount)||0)+r.amount,discountReason:(String(f.discountReason||'').trim()?f.discountReason+' + ':'')+'Coupon '+r.coupon.code}));toast(FD_M(r.amount)+' off with '+r.coupon.code,'success');}},'Apply'))),
        controlOn('loyaltyPoints',sid)&&c&&Number(c.points)>0&&lbl('Redeem points (1 point = ₹1) — '+c.points+' available',h('input',{type:'number',min:0,max:c.points,className:'form-control',value:form.pointsUsed||'',onChange:fc('pointsUsed')})),
        form.paymentMode==='Split'&&h('div',{style:{marginBottom:8}},h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:4}},'Split payment'),
          ['Cash','Card','UPI'].map(md=>{const v=((form.payments||[]).find(x=>x.mode===md)||{}).amount||'';return h('div',{key:md,style:{display:'flex',gap:6,alignItems:'center',marginBottom:4}},h('span',{style:{width:44,fontSize:12}},md),
            h('input',{type:'number',className:'form-control',style:{...inp,width:120},value:v,onChange:e=>{const a=e.target.value;setForm(f=>{const P=(f.payments||[]).filter(x=>x.mode!==md);if(a!=='')P.push({mode:md,amount:a});return{...f,payments:P};});}}));})),
        h('div',{style:{fontSize:12,color:'var(--text3)',margin:'4px 0'}},'Tips (not part of the bill)'),
        staff.length>0&&h('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},(form.tips||[]).concat([{}]).map((tp,i)=>h('div',{key:i,style:{display:'flex',gap:4}},
          h('select',{className:'form-control',style:{...inp,width:130},value:tp.staffId||'',onChange:e=>{const s=staff.find(z=>z.id===e.target.value);setForm(f=>{const T=[...(f.tips||[])];T[i]={...(T[i]||{}),staffId:e.target.value,staff:s?s.name:''};return{...f,tips:T};});}},h('option',{value:''},'Tip for…'),staff.map(s=>h('option',{key:s.id,value:s.id},s.name))),
          h('input',{type:'number',className:'form-control',style:{...inp,width:80},placeholder:'₹',value:tp.amount||'',onChange:e=>{const a=e.target.value;setForm(f=>{const T=[...(f.tips||[])];T[i]={...(T[i]||{}),amount:a};return{...f,tips:T};});}})))),
        lbl('Notes',h('input',{className:'form-control',value:form.notes||'',onChange:fc('notes')}))),
      h('div',{style:{flex:'1 1 240px',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px'}},
        [['Subtotal',t.subtotal],...(t.disc>0?[['Discount'+(Number(form.pointsUsed)>0?' + points':''),-t.disc]]:[]),['Taxable',t.taxable],[set.gst?'GST'+(set.inclusive?' (included)':''):'GST — not registered',t.gst]].map((r,i)=>h('div',{key:i,style:{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:6,color:'var(--text2)'}},h('span',null,r[0]),h('span',null,(r[1]<0?'− ':'')+FD_M(Math.abs(r[1]))))),
        h('div',{style:{display:'flex',justifyContent:'space-between',borderTop:'2px solid var(--accent)',paddingTop:8}},h('b',null,'Grand total'),h('b',{style:{fontSize:16,color:'var(--accent)'}},FD_M(t.total))),
        (form.tips||[]).some(x=>Number(x.amount)>0)&&h('div',{style:{fontSize:12,color:'var(--text3)',marginTop:6}},'+ tips '+FD_M((form.tips||[]).reduce((s,x)=>s+(Number(x.amount)||0),0))))),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Cancel'),h('button',{className:'btn btn-primary',onClick:save},editId?'💾 Save changes':'✓ Create bill'))));
}

// ── Menu & settings (Billing → ⚙ Menu & settings) ──
function FdMenuSettings({sid,onClose}){
  const h=React.createElement;const {toast}=useToast();const [menu,setMenu]=useState(()=>fdMenu(sid).map(x=>({...x})));const [tab,setTab]=useState('menu');const [typeF,setTypeF]=useState('All');
  const staff=fdStaff(sid);const stock=fdStock(sid);const st=fdSettings(sid);const [s2,setS2]=useState({open:st.raw.open||'09:00',close:st.raw.close||'21:00',slot:st.slot,inclusive:st.inclusive,gst:st.gst,resources:(st.raw.resources||[]).join(', '),waTemplates:{...((st.raw.waTemplates)||{})},offPeak:{...((st.raw.offPeak)||{})}});
  const upd=(i,k,v)=>setMenu(L=>L.map((x,j)=>j===i?{...x,[k]:v}:x));
  const add=tp=>setMenu(L=>[...L,{id:(tp==='Service'?'S':tp==='Product'?'P':'X')+Date.now().toString().slice(-6),name:'',type:tp,category:tp==='Product'?'Retail product':tp==='Membership'?'Membership':tp==='Package'?'Package':'Hair',rate:0,duration:tp==='Service'?30:0,gst:18,staffIds:[],active:true,validityDays:tp==='Membership'||tp==='Package'?365:0}]);
  const saveAll=()=>{const bad=menu.find(x=>!String(x.name).trim());if(bad){toast('Every item needs a name','error');return;}const names=menu.map(x=>x.name.trim().toLowerCase());if(names.some((n,i)=>names.indexOf(n)!==i)){toast('Two items have the same name','error');return;}
    {const badC=menu.find(x=>x.type==='Combo'&&(fdComboParts(x).length<2||fdComboParts(x).some(n=>!menu.some(y=>y.name.trim()===n&&y.type!=='Combo'))));if(badC){toast('Combo “'+badC.name+'”: list 2 or more menu items by their exact names, separated by commas','error');return;}}
    fdSaveMenu(sid,menu.map(x=>({...x,name:x.name.trim(),rate:Number(x.rate)||0,duration:Number(x.duration)||0,gst:Number(x.gst)||0,credit:Number(x.credit)||0,validityDays:Number(x.validityDays)||0,discountPct:Number(x.discountPct)||0})));
    fdSaveSettings(sid,{open:s2.open,close:s2.close,slot:Number(s2.slot)||30,inclusive:!!s2.inclusive,gst:!!s2.gst,resources:String(s2.resources||'').split(',').map(z=>z.trim()).filter(Boolean),waTemplates:s2.waTemplates||{},offPeak:s2.offPeak||{}});try{logAuditEvent(sid,{entity:'Front desk',entityId:'menu',action:'Menu / settings saved',summary:menu.length+' items'});}catch(e){}toast('Saved','success');onClose();};
  const copyTo=()=>{const outs=(typeof SALONS!=='undefined'?SALONS:[]).filter(s=>s&&s.id!==sid&&s.status!=='Inactive'&&userCanSeeOutlet(currentSessionUser(),s.id));if(!outs.length){toast('No other outlets','error');return;}
    if(!window.confirm('Copy this menu (prices, durations, GST) to '+outs.map(s=>rptShort(s)).join(', ')+'? Their own menu is replaced; staff and stock links are not copied.'))return;
    outs.forEach(s=>fdSaveMenu(s.id,menu.map(x=>({...x,staffIds:[],stockItemId:''}))));toast('Menu copied to '+outs.length+' outlet(s)','success');};
  const shown=menu.map((x,i)=>({x,i})).filter(z=>typeF==='All'||z.x.type===typeF);const inp={padding:'3px 5px',fontSize:12};
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:1100,maxWidth:'98vw',maxHeight:'92vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'⚙ Menu & front-desk settings'),
    h('div',{className:'tab-bar',style:{marginBottom:10}},[['menu','Services & products ('+menu.length+')'],['set','Hours, GST']].map(([k,l])=>h('button',{key:k,className:'tab-btn '+(tab===k?'active':''),onClick:()=>setTab(k)},l))),
    tab==='menu'&&h('div',null,
      h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}},['All','Service','Product','Membership','Package','Combo'].map(k=>h('button',{key:k,className:'btn btn-sm '+(typeF===k?'btn-primary':'btn-ghost'),onClick:()=>setTypeF(k)},k)),
        h('span',{style:{flex:1}}),['Service','Product','Membership','Package',...(controlOn('combos',sid)?['Combo']:[])].map(k=>h('button',{key:'a'+k,className:'btn btn-ghost btn-sm',onClick:()=>add(k)},'+ '+k)),h('button',{className:'btn btn-ghost btn-sm',onClick:copyTo},'Copy to other outlets')),
      h('div',{className:'table-wrap',style:{maxHeight:'56vh',overflowY:'auto'}},h('table',null,
        h('thead',null,h('tr',null,['Name','Type','Category','Price ₹','Mins','GST %','SAC / HSN','Done by','Stock item / terms','Room / patch test','Active'].map((x,i)=>h('th',{key:i},x)))),
        h('tbody',null,shown.map(({x,i})=>h('tr',{key:x.id},
          h('td',null,h('input',{className:'form-control',style:{...inp,width:190},value:x.name,onChange:e=>upd(i,'name',e.target.value)})),
          h('td',{style:{fontSize:12}},x.type),
          h('td',null,h('select',{className:'form-control',style:{...inp,width:130},value:x.category||'',onChange:e=>upd(i,'category',e.target.value)},FD_CATS.map(cg=>h('option',{key:cg},cg)))),
          h('td',null,h('input',{type:'number',className:'form-control',style:{...inp,width:84},value:x.rate,onChange:e=>upd(i,'rate',e.target.value)})),
          h('td',null,x.type==='Service'?h('input',{type:'number',className:'form-control',style:{...inp,width:58},value:x.duration,onChange:e=>upd(i,'duration',e.target.value)}):'—'),
          h('td',null,h('select',{className:'form-control',style:{...inp,width:58},value:String(x.gst==null?18:x.gst),onChange:e=>upd(i,'gst',Number(e.target.value))},[0,5,12,18,28].map(g=>h('option',{key:g,value:g},g)))),
          h('td',null,h('input',{className:'form-control',style:{...inp,width:76},value:x.sac||'',placeholder:x.type==='Product'?'HSN':(FD_SAC_DEFAULT&&FD_SAC_DEFAULT[x.category])||'',onChange:e=>upd(i,'sac',e.target.value.replace(/\D/g,'').slice(0,8))})),
          h('td',null,x.type==='Service'?h('select',{multiple:true,className:'form-control',style:{...inp,width:150,height:46},value:x.staffIds||[],title:'Leave empty = anyone; Ctrl-click for several',onChange:e=>upd(i,'staffIds',[...e.target.selectedOptions].map(o=>o.value))},staff.map(s=>h('option',{key:s.id,value:s.id},s.name))):'—'),
          h('td',null,x.type==='Product'?h('select',{className:'form-control',style:{...inp,width:170},value:x.stockItemId||'',onChange:e=>upd(i,'stockItemId',e.target.value)},h('option',{value:''},'— match by name —'),stock.map(s=>h('option',{key:s.id,value:s.id},s.name)))
            :x.type==='Package'?h('span',{style:{fontSize:11.5}},'Credit ₹ ',h('input',{type:'number',className:'form-control',style:{...inp,width:80,display:'inline-block'},value:x.credit||'',onChange:e=>upd(i,'credit',e.target.value)}),' days ',h('input',{type:'number',className:'form-control',style:{...inp,width:56,display:'inline-block'},value:x.validityDays||'',onChange:e=>upd(i,'validityDays',e.target.value)}))
            :x.type==='Membership'?h('span',{style:{fontSize:11.5}},'Disc % ',h('input',{type:'number',className:'form-control',style:{...inp,width:52,display:'inline-block'},value:x.discountPct||'',onChange:e=>upd(i,'discountPct',e.target.value)}),' days ',h('input',{type:'number',className:'form-control',style:{...inp,width:56,display:'inline-block'},value:x.validityDays||'',onChange:e=>upd(i,'validityDays',e.target.value)})):x.type==='Combo'?h('input',{className:'form-control',style:{...inp,width:210},placeholder:'Parts: Haircut, Hair Spa',title:'Menu items in this combo, by exact name, separated by commas — the combo price is shared across them',value:Array.isArray(x.parts)?x.parts.join(', '):(x.parts||''),onChange:e=>upd(i,'parts',e.target.value)}):'—'),
          h('td',null,x.type==='Service'?h('div',null,h('select',{className:'form-control',style:{...inp,width:120},value:x.resource||'',onChange:e=>upd(i,'resource',e.target.value)},h('option',{value:''},'No room'),String(s2.resources||'').split(',').map(z=>z.trim()).filter(Boolean).map(z=>h('option',{key:z},z))),
            h('label',{style:{fontSize:11,display:'flex',gap:3,alignItems:'center'}},h('input',{type:'checkbox',checked:!!x.needsPatchTest,onChange:e=>upd(i,'needsPatchTest',e.target.checked)}),'patch test'),h('label',{style:{fontSize:11,display:'flex',gap:3,alignItems:'center'},title:'Days until the next visit is usually due — offered at checkout (0 = never)'},'rebook',h('input',{type:'number',min:0,className:'form-control',style:{...inp,width:46},value:x.rebookDays==null?'':x.rebookDays,placeholder:typeof fdRebookDays==='function'?String(fdRebookDays(sid,x.name)||''):'',onChange:e=>upd(i,'rebookDays',e.target.value===''?undefined:Number(e.target.value))}),'d')):'—'),
          h('td',null,h('input',{type:'checkbox',checked:x.active!==false,onChange:e=>upd(i,'active',e.target.checked)}))))))),
      h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'Inactive items stay on old bills but are not offered. Packages give the credit shown (e.g. pay ₹10,000, get ₹12,000) valid for the days set; memberships give the % off services.')),
    tab==='set'&&h('div',{style:{maxWidth:520}},
      h('div',{className:'form-row cols3'},h('div',{className:'form-group'},h('label',null,'Opens at'),h('input',{type:'time',className:'form-control',value:s2.open,onChange:e=>setS2({...s2,open:e.target.value})})),
        h('div',{className:'form-group'},h('label',null,'Closes at'),h('input',{type:'time',className:'form-control',value:s2.close,onChange:e=>setS2({...s2,close:e.target.value})})),
        h('div',{className:'form-group'},h('label',null,'Booking slot'),h('select',{className:'form-control',value:s2.slot,onChange:e=>setS2({...s2,slot:Number(e.target.value)})},[15,20,30,45,60].map(v=>h('option',{key:v,value:v},v+' min'))))),
      h('label',{style:{display:'flex',gap:8,alignItems:'center',margin:'8px 0',fontSize:13}},h('input',{type:'checkbox',checked:s2.gst,onChange:e=>setS2({...s2,gst:e.target.checked})}),'Outlet is GST-registered (charge GST on bills)'),
      h('label',{style:{display:'flex',gap:8,alignItems:'center',margin:'8px 0',fontSize:13}},h('input',{type:'checkbox',checked:s2.inclusive,disabled:!s2.gst,onChange:e=>setS2({...s2,inclusive:e.target.checked})}),'Menu prices already include GST'),
      h('div',{style:{fontSize:11.5,color:'var(--text3)'}},'Not registered → bills carry no GST. Each item’s GST rate is set in the menu.'),
      h('div',{className:'form-group',style:{marginTop:10}},h('label',null,'Rooms / equipment (comma separated)'),h('input',{className:'form-control',value:s2.resources||'',placeholder:'e.g. Spa room, Pedicure chair, Facial bed',onChange:e=>setS2({...s2,resources:e.target.value})})),
      h('div',{style:{fontSize:11.5,color:'var(--text3)'}},'A service tied to a room (Services tab) cannot be booked twice at the same time, whoever the stylist.'),
      h('div',{style:{fontWeight:600,fontSize:13,marginTop:12}},'Off-peak hours (used when “Off-peak price” is on in Controls)'),
      h('div',{style:{display:'flex',gap:4,flexWrap:'wrap',margin:'4px 0'}},['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=>{const cur=(s2.offPeak&&Array.isArray(s2.offPeak.days))?s2.offPeak.days:[2,3,4];const on=cur.includes(i);return h('button',{key:d,className:'btn btn-sm '+(on?'btn-primary':'btn-ghost'),onClick:()=>setS2({...s2,offPeak:{...(s2.offPeak||{}),days:on?cur.filter(x=>x!==i):[...cur,i].sort()}})},d);})),
      h('div',{className:'form-row cols2'},h('div',{className:'form-group'},h('label',null,'From'),h('input',{type:'time',className:'form-control',value:(s2.offPeak&&s2.offPeak.from)||'11:00',onChange:e=>setS2({...s2,offPeak:{...(s2.offPeak||{}),from:e.target.value}})})),
        h('div',{className:'form-group'},h('label',null,'To'),h('input',{type:'time',className:'form-control',value:(s2.offPeak&&s2.offPeak.to)||'15:00',onChange:e=>setS2({...s2,offPeak:{...(s2.offPeak||{}),to:e.target.value}})}))),
      h('div',{style:{fontWeight:600,fontSize:13,marginTop:12}},'WhatsApp Business templates (when “Send through the WhatsApp API” is on in Controls)'),
      [['reminder','Appointment reminder — {{1}} name, {{2}} service, {{3}} day & time'],['campaign','Offer / campaign — {{1}} name, {{2}} message'],['renewal','Membership renewal — {{1}} name, {{2}} plan, {{3}} end date']].map(([k,l])=>h('div',{key:k,className:'form-group'},h('label',null,l),h('input',{className:'form-control',placeholder:'approved template name',value:(s2.waTemplates||{})[k]||'',onChange:e=>setS2({...s2,waTemplates:{...(s2.waTemplates||{}),[k]:e.target.value.trim()}})}))),
      h('div',{style:{fontSize:11.5,color:'var(--text3)'}},'Templates are created and approved in your Meta Business account; the language is the one set in Master Settings → WhatsApp.')),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Cancel'),h('button',{className:'btn btn-primary',onClick:saveAll},'Save'))));
}
