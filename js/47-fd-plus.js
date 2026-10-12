// ═════════════════════════════════════════════════════════════════════════════════════════════
// Front desk — plus (js/39–46 call these; every check has a switch in Master Settings → Controls):
//   A · booking advance & no-show fee, blocked time, rebook at checkout, late arrivals, off-peak price,
//       two-stylist services
//   B · combos, coupon codes, cash drawer by shift, petty cash, offline banner, duplicate-bill check
//   C · consultation form, colour formula card, similar-name duplicates, visit-gap win-back, balance link
//   D · stock count losses, usage above standard, price-rise alert, stock-out warning on bookings
//   E · registers: date-wise, client-wise, client-wise membership
// ═════════════════════════════════════════════════════════════════════════════════════════════
const fdActor=()=>(currentSessionUser()||{}).name||'';
const fdPid=p=>(p||'X')+Date.now()+Math.random().toString(36).slice(2,6);
const fdArr=k=>{const v=fdJ(k,[]);return Array.isArray(v)?v:[];};
const fdDmy=iso=>String(iso||'').split('-').reverse().join('/');

// ── A1 · booking advance (deposit) ──
function fdAdvKey(sid){return outletKey('salonos_booking_advances',sid);}
function fdAdvances(sid){return fdArr(fdAdvKey(sid));}
function fdSaveAdvances(sid,L){safeLocalSet(fdAdvKey(sid),JSON.stringify((L||[]).slice(-3000)));}
function fdAddAdvance(sid,a){
  const rec={id:fdPid('ADV'),at:new Date().toISOString(),date:fdTodayIso(),by:fdActor(),mode:'UPI',...a,phone:fdP10(a.phone),amount:Math.round(Number(a.amount)||0)};if(!(rec.amount>0))return null;
  fdSaveAdvances(sid,[...fdAdvances(sid),rec]);try{logAuditEvent(sid,{entity:'Advance',entityId:rec.id,action:'Received',summary:FD_M(rec.amount)+' '+rec.mode+' — '+(rec.client||'')});}catch(e){}return rec;
}
function fdOpenAdvances(sid,phone){const p=fdP10(phone);if(p.length!==10)return[];return fdAdvances(sid).filter(a=>a.phone===p&&!a.usedBill&&!a.refunded&&!a.forfeited);}
function fdRefundAdvance(sid,id,mode){const L=fdAdvances(sid);const a=L.find(x=>x.id===id);if(!a||a.usedBill||a.refunded)return'Already used or refunded';a.refunded={at:new Date().toISOString(),date:fdTodayIso(),mode:mode||a.mode,by:fdActor()};fdSaveAdvances(sid,L);try{logAuditEvent(sid,{entity:'Advance',entityId:id,action:'Refunded',summary:FD_M(a.amount)+' '+(mode||a.mode)});}catch(e){}return'';}
// a bill that used an advance owes that much less
(function(){if(typeof fdBillDue!=='function')return;const base=fdBillDue;fdBillDue=function(b){const d=base(b);return d>0?Math.max(0,Math.round(d-(Number(b&&b.advancePaid)||0))):d;};})();
// Day summary: advances count as money on the day they were received; the bill shows them as "Advance"
(function(){if(typeof fdDaySummary!=='function')return;const base=fdDaySummary;fdDaySummary=function(sid,iso){const ds=base(sid,iso);ds.modes.Advance=ds.modes.Advance||0;
  fdBills(sid).forEach(b=>{if(!b||b.date!==iso||b.status==='Cancelled'||b.status==='Unpaid')return;const adv=Number(b.advancePaid)||0;if(!adv||b.paymentMode==='Advance')return;
    if(['Cash','Card','UPI'].includes(b.paymentMode))ds.modes[b.paymentMode]=(ds.modes[b.paymentMode]||0)-adv;ds.modes.Advance+=adv;});
  let inn=0;fdAdvances(sid).forEach(a=>{if(a.date===iso){ds.modes[a.mode]=(ds.modes[a.mode]||0)+a.amount;inn+=a.amount;}if(a.refunded&&a.refunded.date===iso){ds.modes[a.refunded.mode]=(ds.modes[a.refunded.mode]||0)-a.amount;inn-=a.amount;}});
  ds.advancesIn=inn;ds.petty=fdPetty(sid).filter(p=>p.date===iso).reduce((s,p)=>s+(Number(p.amount)||0),0);return ds;};})();

// ── A1b · no-show fee (Controls → noShowFee) ──
function fdAddNoShowFee(sid,a){
  if(!controlOn('noShowFee',sid))return'';const amt=controlLimit('noShowFee')||200;const p=fdP10(a.phone);if(p.length!==10)return'';
  const C=fdClients(sid);const i=C.findIndex(c=>fdP10(c.phone)===p);if(i<0)return'';const fees=C[i].pendingFees||[];if(fees.some(f=>f.apptId===a.id))return'';
  C[i]={...C[i],pendingFees:[...fees,{id:fdPid('NF'),apptId:a.id,date:fdTodayIso(),service:a.service,amount:amt}]};fdSaveClients(sid,C);
  try{logAuditEvent(sid,{entity:'Client',entityId:C[i].id,action:'No-show fee',summary:FD_M(amt)+' — '+a.service});}catch(e){}return FD_M(amt)+' no-show fee goes on '+String(a.client).split(' ')[0]+'’s next bill';
}
function fdPendingFees(sid,phone){const p=fdP10(phone);if(p.length!==10)return[];const c=fdClients(sid).find(x=>fdP10(x.phone)===p);return(c&&c.pendingFees)||[];}
function fdDropFees(sid,phone,ids,why){const p=fdP10(phone);const C=fdClients(sid);const i=C.findIndex(c=>fdP10(c.phone)===p);if(i<0||!ids.length)return;C[i]={...C[i],pendingFees:(C[i].pendingFees||[]).filter(f=>!ids.includes(f.id))};fdSaveClients(sid,C);
  if(why)try{logAuditEvent(sid,{entity:'Client',entityId:C[i].id,action:'No-show fee '+why,summary:ids.length+' fee(s)'});}catch(e){}}

// ── A3 · rebook at checkout (Controls → rebookPrompt) ──
const FD_REBOOK_DEF={Hair:42,Skin:30,Nails:21,'Spa & massage':30,'Waxing & threading':21,Makeup:0};
function fdRebookDays(sid,name){const m=fdMenuItem(sid,name)||{};if(Number(m.rebookDays)>0)return Number(m.rebookDays);if(m.rebookDays!==undefined&&m.rebookDays!==''&&Number(m.rebookDays)===0)return 0;if(/colou?r|root|highlight|global/i.test(name))return 30;return FD_REBOOK_DEF[m.category]||0;}
function fdHasFutureBooking(sid,phone){const p=fdP10(phone);const B=fdLoadBook(sid);const t=fdTodayIso();return Object.keys(B).some(k=>k.split('|')[1]>t&&(B[k]||[]).some(a=>fdP10(a.phone)===p&&a.status!=='Cancelled'&&!a.block));}
function fdRebookSuggest(sid,bill){
  if(!controlOn('rebookPrompt',sid)||!bill||bill.kind==='credit-note')return null;const p=fdP10(bill.phone);if(p.length!==10||fdHasFutureBooking(sid,p))return null;
  const it=(bill.items||[]).filter(x=>x.type==='Service').map(x=>({x,d:fdRebookDays(sid,x.name)})).filter(z=>z.d>0).sort((a,b)=>a.d-b.d)[0];if(!it)return null;
  return{sid,client:bill.customer,phone:p,service:it.x.name,staffId:it.x.staffId||bill.staffId||'',date:fdAddD(bill.date||fdTodayIso(),it.d),days:it.d};
}
function fdSlotBusy(list,name,start,dur,ignoreId){return(list||[]).some(x=>x.id!==ignoreId&&x.status!=='Cancelled'&&x.status!=='No-show'&&(x.staff===name||x.assistant===name)&&start<x.start+x.dur&&x.start<start+dur);}
function FdRebookHost({sid,onBooked}){
  const h=React.createElement;const {toast}=useToast();const [rb,setRb]=useState(null);
  useEffect(()=>{const f=e=>{if(e.detail&&Number(e.detail.sid)===Number(sid))setRb({...e.detail,start:null});};window.addEventListener('fd-rebook',f);return()=>window.removeEventListener('fd-rebook',f);},[sid]);
  if(!rb)return null;const set=fdSettings(sid);const staff=fdStaff(sid,rb.date);const s=staff.find(z=>z.id===rb.staffId)||staff[0];const dur=fdDuration(sid,rb.service);const list=fdLoadBook(sid)[sid+'|'+rb.date]||[];
  const slots=[];for(let m=set.open;m+dur<=set.close;m+=set.slot)if(!s||!fdSlotBusy(list,s.name,m,dur))slots.push(m);const start=rb.start!=null?rb.start:(slots.find(m=>m>=11*60)||slots[0]);
  const book=()=>{if(!s)return toast('No stylist for that day','error');const off=fdStaffOff(sid,s,rb.date);if(off)return toast(s.name+': '+off,'error');if(start==null)return toast(s.name+' has no free slot that day','error');
    const B=fdLoadBook(sid);const k=sid+'|'+rb.date;if(fdSlotBusy(B[k]||[],s.name,start,dur))return toast(s.name+' is busy then','error');
    B[k]=[...(B[k]||[]),{id:'AP-'+Date.now(),staff:s.name,staffId:s.id,start,dur,service:rb.service,client:rb.client,phone:rb.phone,status:'Booked',rate:fdRateOf(sid,rb.service),source:'Rebooked at checkout',notes:'',createdAt:new Date().toISOString()}];
    safeLocalSet(fdBookKey(sid),JSON.stringify(B));toast(rb.client+' booked '+fdPrettyD(rb.date)+' at '+fdHM(start),'success');onBooked&&onBooked();
    if(rb.wa)fdWa(rb.phone,'Hi '+String(rb.client).split(' ')[0]+', your next '+rb.service+' is booked for '+fdPrettyD(rb.date)+' at '+fdHM(start)+' with '+String(s.name).split(' ')[0]+'. See you then!');setRb(null);};
  return h('div',{className:'modal-overlay',onClick:()=>setRb(null)},h('div',{className:'modal',style:{width:440},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'📅 Book '+String(rb.client).split(' ')[0]+'’s next visit?'),
    h('div',{style:{fontSize:12.5,color:'var(--text2)',marginBottom:10}},rb.service+' is usually repeated after about '+rb.days+' days.'),
    h('div',{className:'form-row cols2'},h('div',{className:'form-group'},h('label',null,'Date'),h('input',{type:'date',className:'form-control',value:rb.date,onChange:e=>setRb({...rb,date:e.target.value,start:null})})),
      h('div',{className:'form-group'},h('label',null,'Stylist'),h('select',{className:'form-control',value:s?s.id:'',onChange:e=>setRb({...rb,staffId:e.target.value,start:null})},staff.map(z=>h('option',{key:z.id,value:z.id},z.name+(fdStaffOff(sid,z,rb.date)?' — off':'')))))),
    h('div',{className:'form-group'},h('label',null,'Time'),slots.length?h('select',{className:'form-control',value:start,onChange:e=>setRb({...rb,start:Number(e.target.value)})},slots.map(m=>h('option',{key:m,value:m},fdHM(m)))):h('div',{style:{color:'var(--red)',fontSize:12.5}},'No free slot that day — pick another date or stylist.')),
    h('label',{style:{display:'flex',gap:6,alignItems:'center',fontSize:12.5}},h('input',{type:'checkbox',checked:!!rb.wa,onChange:e=>setRb({...rb,wa:e.target.checked})}),'Send the booking on WhatsApp'),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:()=>setRb(null)},'Not now'),h('button',{className:'btn btn-primary',disabled:!slots.length,onClick:book},'Book'))));
}

// ── A4 · late arrivals (Controls → lateArrival) ──
function fdNowMin(){const n=new Date();return n.getHours()*60+n.getMinutes();}
function fdNowSlot(sid){const set=fdSettings(sid);return Math.ceil(fdNowMin()/set.slot)*set.slot;}
function fdLateBy(sid,date,a){if(!controlOn('lateArrival',sid)||date!==fdTodayIso()||!a||a.block||!['Booked','Confirmed'].includes(a.status))return 0;const late=fdNowMin()-a.start;return late>=(controlLimit('lateArrival')||15)?late:0;}
function FdLatePanel({sid,date,a,list,onChange}){
  const h=React.createElement;const late=fdLateBy(sid,date,a);if(!late)return null;const set=fdSettings(sid);const now=fdNowSlot(sid);
  const free=now+a.dur<=set.close?fdStaff(sid,date).filter(s=>s.name!==a.staff&&!fdStaffOff(sid,s,date)&&!fdSlotBusy(list,s.name,now,a.dur,a.id)).slice(0,3):[];
  let next=null;for(let m=now;m+a.dur<=set.close;m+=set.slot)if(!fdSlotBusy(list,a.staff,m,a.dur,a.id)){next=m;break;}
  const short=Math.max(15,a.dur-late);const canShort=!fdSlotBusy(list,a.staff,now,short,a.id)&&now+short<=set.close;
  return h('div',{style:{background:'rgba(231,76,60,0.08)',border:'1px solid var(--red)',borderRadius:8,padding:'8px 10px',marginTop:10,fontSize:12.5}},
    h('b',{style:{color:'var(--red)'}},'⏰ '+late+' min late'),h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginTop:6}},
      canShort&&a.dur>short&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>onChange({start:now,dur:short,notes:((a.notes||'')+' · shortened (late)').replace(/^ · /,'')})},'Shorten to '+short+' min, start '+fdHM(now)),
      next!=null&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>onChange({start:next})},'Move to '+fdHM(next)+' with '+String(a.staff).split(' ')[0]),
      free.map(s=>h('button',{key:s.id,className:'btn btn-ghost btn-sm',onClick:()=>onChange({staff:s.name,staffId:s.id,start:now})},'Give to '+s.name+' at '+fdHM(now))),
      next==null&&!free.length&&h('span',{style:{color:'var(--text3)'}},'No free slot left today — reschedule.')));
}

// ── A5 · off-peak price (Controls → offPeakPricing) ──
function fdOffPeakCfg(sid){const r=fdSettings(sid).raw.offPeak||{};return{days:Array.isArray(r.days)?r.days.map(Number):[2,3,4],from:r.from||'11:00',to:r.to||'15:00'};}
function fdOffPeakPct(sid,date,start){
  if(!controlOn('offPeakPricing',sid))return 0;const c=fdOffPeakCfg(sid);const hm=v=>{const m=String(v).match(/^(\d{1,2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null;};
  const f=hm(c.from),t=hm(c.to);if(!c.days.includes(new Date(date+'T00:00:00').getDay())||f==null||t==null||start<f||start>=t)return 0;return controlLimit('offPeakPricing')||15;
}
function fdOffPeakInit(sid,date,start,items){const pct=fdOffPeakPct(sid,date,start);if(!pct)return{};const svc=(items||[]).filter(x=>x.type==='Service').reduce((s,x)=>s+(Number(x.qty)||1)*(Number(x.rate)||0),0);return svc?{discount:Math.round(svc*pct/100),discountReason:'Off-peak '+pct+'%'}:{};}

// ── B7 · combos: one price shared across its services so each stylist's sales stay right ──
function fdComboParts(m){return(Array.isArray(m.parts)?m.parts:String(m.parts||'').split(',')).map(s=>String(s).trim()).filter(Boolean);}
function fdComboLines(sid,m){
  const parts=fdComboParts(m).map(n=>fdMenuItem(sid,n)).filter(Boolean);if(!parts.length)return[];const sum=parts.reduce((s,p)=>s+(Number(p.rate)||0),0);const price=Number(m.rate)||0;let left=price;
  return parts.map((p,i)=>{const r=i===parts.length-1?Math.round(left*100)/100:Math.round((sum?(Number(p.rate)||0)/sum*price:price/parts.length)*100)/100;left-=r;return{name:p.name,type:p.type==='Product'?'Product':'Service',qty:1,rate:r,gst:p.gst!=null?Number(p.gst):18,comboOf:m.name};});
}

// ── B8 · coupon codes (Controls → coupons) ──
function fdCouponKey(sid){return outletKey('salonos_coupons',sid);}
function fdCoupons(sid){return fdArr(fdCouponKey(sid));}
function fdSaveCoupons(sid,L){safeLocalSet(fdCouponKey(sid),JSON.stringify(L||[]));}
function fdCheckCoupon(sid,code,phone,items){
  const c=fdCoupons(sid).find(x=>String(x.code).toUpperCase()===String(code||'').trim().toUpperCase());if(!c)return{err:'No such coupon'};if(c.active===false)return{err:c.code+' is switched off'};
  if(c.expiry&&c.expiry<fdTodayIso())return{err:c.code+' expired on '+fdDmy(c.expiry)};const uses=c.uses||[];if(Number(c.maxUses)>0&&uses.length>=Number(c.maxUses))return{err:c.code+' has reached its limit of '+c.maxUses+' use(s)'};
  const p=fdP10(phone);if(c.onlyPhone&&c.onlyPhone!==p)return{err:c.code+' is for another client'};if(c.perClient!==false){if(p.length!==10)return{err:'Enter the client’s mobile — '+c.code+' is one per client'};if(uses.some(u=>u.phone===p))return{err:'This client has already used '+c.code};}
  const base=(items||[]).filter(it=>c.on==='Services'?it.type==='Service':c.on==='Products'?it.type==='Product':it.type==='Service'||it.type==='Product').reduce((s,it)=>s+(Number(it.qty)||0)*(Number(it.rate)||0),0);
  if(Number(c.minBill)>0&&base<Number(c.minBill))return{err:'Minimum bill for '+c.code+' is '+FD_M(c.minBill)};
  let amt=c.kind==='₹'?Number(c.value)||0:base*(Number(c.value)||0)/100;if(Number(c.maxOff)>0)amt=Math.min(amt,Number(c.maxOff));return{coupon:c,amount:Math.round(Math.min(amt,base))};
}
function fdRecordCoupon(sid,bill){if(!bill.couponCode)return'';const L=fdCoupons(sid);const c=L.find(x=>String(x.code).toUpperCase()===String(bill.couponCode).toUpperCase());if(!c)return'';
  c.uses=[...(c.uses||[]),{id:fdPid('CU'),bill:bill.id,phone:fdP10(bill.phone),date:bill.date,amount:Number(bill.couponDisc)||0}];fdSaveCoupons(sid,L);return'Coupon '+c.code+' used';}
function FdCouponsModal({sid,onClose}){
  const h=React.createElement;const {toast}=useToast();const [L,setL]=useState(()=>fdCoupons(sid));const blank={code:'',kind:'%',value:10,on:'All',minBill:0,maxOff:0,maxUses:0,perClient:true,expiry:'',active:true};const [f,setF]=useState(blank);
  const save=x=>{fdSaveCoupons(sid,x);setL(x);};
  const add=()=>{const code=String(f.code).trim().toUpperCase().replace(/\s+/g,'');if(!/^[A-Z0-9-]{3,20}$/.test(code))return toast('Code: 3–20 letters / digits','error');if(L.some(c=>c.code===code))return toast('That code exists','error');if(!(Number(f.value)>0))return toast('Enter the discount','error');
    save([{...f,code,value:Number(f.value),minBill:Number(f.minBill)||0,maxOff:Number(f.maxOff)||0,maxUses:Number(f.maxUses)||0,id:fdPid('CP'),createdAt:new Date().toISOString(),by:fdActor(),uses:[]},...L]);setF(blank);try{logAuditEvent(sid,{entity:'Coupon',entityId:code,action:'Created',summary:f.value+f.kind});}catch(e){}};
  const inp={padding:'4px 6px',fontSize:12.5};const fld=(k,l,el)=>h('label',{style:{fontSize:11,color:'var(--text3)',display:'grid',gap:2}},l,el);
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:900,maxWidth:'97vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'🏷 Coupon codes'),
    h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end',marginBottom:12}},
      fld('code','Code',h('input',{className:'form-control',style:{...inp,width:120,textTransform:'uppercase'},value:f.code,placeholder:'FESTIVE20',onChange:e=>setF({...f,code:e.target.value})})),
      fld('v','Discount',h('div',{style:{display:'flex',gap:4}},h('input',{type:'number',className:'form-control',style:{...inp,width:70},value:f.value,onChange:e=>setF({...f,value:e.target.value})}),h('select',{className:'form-control',style:{...inp,width:52},value:f.kind,onChange:e=>setF({...f,kind:e.target.value})},['%','₹'].map(k=>h('option',{key:k},k))))),
      fld('on','On',h('select',{className:'form-control',style:{...inp,width:100},value:f.on,onChange:e=>setF({...f,on:e.target.value})},['All','Services','Products'].map(k=>h('option',{key:k},k)))),
      fld('mb','Min bill ₹',h('input',{type:'number',className:'form-control',style:{...inp,width:80},value:f.minBill,onChange:e=>setF({...f,minBill:e.target.value})})),
      fld('mo','Max off ₹',h('input',{type:'number',className:'form-control',style:{...inp,width:80},value:f.maxOff,onChange:e=>setF({...f,maxOff:e.target.value})})),
      fld('mu','Total uses (0 = no limit)',h('input',{type:'number',className:'form-control',style:{...inp,width:80},value:f.maxUses,onChange:e=>setF({...f,maxUses:e.target.value})})),
      fld('ex','Valid till',h('input',{type:'date',className:'form-control',style:{...inp,width:140},value:f.expiry,onChange:e=>setF({...f,expiry:e.target.value})})),
      h('label',{style:{fontSize:12,display:'flex',gap:4,alignItems:'center'}},h('input',{type:'checkbox',checked:f.perClient,onChange:e=>setF({...f,perClient:e.target.checked})}),'one per client'),
      h('button',{className:'btn btn-primary btn-sm',onClick:add},'Add')),
    !L.length?h('div',{style:{color:'var(--text3)',fontSize:12.5}},'No coupons yet.'):h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,['Code','Discount','Rules','Valid till','Used','Discount given','Active',''].map((x,i)=>h('th',{key:i},x)))),
      h('tbody',null,L.map(c=>{const u=c.uses||[];return h('tr',{key:c.id},h('td',{style:{fontWeight:700}},c.code),h('td',null,c.kind==='₹'?FD_M(c.value):c.value+'%'+(c.on!=='All'?' on '+c.on.toLowerCase():'')),
        h('td',{style:{fontSize:11.5}},[c.minBill?'min '+FD_M(c.minBill):'',c.maxOff?'max '+FD_M(c.maxOff):'',c.perClient!==false?'one per client':'',c.maxUses?c.maxUses+' uses':''].filter(Boolean).join(' · ')||'—'),
        h('td',{style:{color:c.expiry&&c.expiry<fdTodayIso()?'var(--red)':''}},c.expiry?fdDmy(c.expiry):'—'),h('td',null,u.length),h('td',null,FD_M(u.reduce((s,x)=>s+(Number(x.amount)||0),0))),
        h('td',null,h('input',{type:'checkbox',checked:c.active!==false,onChange:e=>save(L.map(x=>x.id===c.id?{...x,active:e.target.checked}:x))})),
        h('td',null,!u.length&&h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>{if(window.confirm('Delete '+c.code+'?'))save(L.filter(x=>x.id!==c.id));}},'✕')));})))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:8}},'Type the code in the bill form (“Coupon code”). A coupon’s discount does not need the discount approval — its rules are set here.'),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-primary',onClick:onClose},'Close'))));
}

// ── B9 · cash drawer by shift (Controls → cashDrawer) / B10 · petty cash (Controls → pettyCash) ──
function fdShiftKey(sid){return outletKey('salonos_cash_shifts',sid);}
function fdShifts(sid){return fdArr(fdShiftKey(sid));}
function fdSaveShifts(sid,L){safeLocalSet(fdShiftKey(sid),JSON.stringify((L||[]).slice(-400)));}
function fdOpenShift(sid){return fdShifts(sid).find(s=>!s.closedAt)||null;}
function fdPettyKey(sid){return outletKey('salonos_petty_cash',sid);}
function fdPetty(sid){return fdArr(fdPettyKey(sid));}
function fdPettyHeads(){return typeof EXPENSE_ROWS!=='undefined'?EXPENSE_ROWS.map((r,i)=>({i,name:r.name})).filter(x=>!/Commission|Salary|Incentive|Advance|Tip|Rent|Royalty|Electricity|Professional|Telephone|Internet/i.test(x.name)):[];}
function fdPostPetty(sid,iso,rowIdx,delta){if(rowIdx==null||rowIdx<0)return false;const d=new Date(iso+'T00:00:00');if(typeof isMonthLockedFor==='function'&&isMonthLockedFor(sid,d.getFullYear(),d.getMonth()))return false;
  const ek=outletKey('salonos_daily_sales_data',sid);const E=fdJ(ek,{})||{};const row={...(E[iso]||{})};row[rowIdx]=Math.round(((Number(row[rowIdx])||0)+delta)*100)/100;E[iso]=row;safeLocalSet(ek,JSON.stringify(E));return true;}
function fdAddPetty(sid,e){
  const amt=Math.round((Number(e.amount)||0)*100)/100;if(!(amt>0))return'Enter the amount';if(!String(e.note||'').trim())return'Write what it was for';const iso=fdTodayIso();
  const rec={id:fdPid('PC'),at:new Date().toISOString(),date:iso,by:fdActor(),amount:amt,head:e.head||'',rowIdx:e.rowIdx,note:String(e.note).trim(),photo:e.photo||null};rec.posted=e.post?fdPostPetty(sid,iso,e.rowIdx,amt):false;
  safeLocalSet(fdPettyKey(sid),JSON.stringify([...fdPetty(sid),rec].slice(-3000)));try{logAuditEvent(sid,{entity:'Petty cash',entityId:rec.id,action:'Paid',summary:FD_M(amt)+' — '+rec.note});}catch(err){}return'';
}
function fdDeletePetty(sid,id){const L=fdPetty(sid);const r=L.find(x=>x.id===id);if(!r)return;if(r.posted)fdPostPetty(sid,r.date,r.rowIdx,-r.amount);safeLocalSet(fdPettyKey(sid),JSON.stringify(L.filter(x=>x.id!==id)));try{logAuditEvent(sid,{entity:'Petty cash',entityId:id,action:'Deleted',summary:FD_M(r.amount)+' — '+r.note});}catch(e){}}
function fdCashIn(sid,fromAt,toAt){
  const inW=at=>!!at&&at>=fromAt&&at<=toAt;let bills=0,receipts=0,adv=0,petty=0,refunds=0;
  fdBills(sid).forEach(b=>{if(!b||b.status==='Cancelled')return;
    if(inW(b.createdAt)&&b.status!=='Unpaid'){const t=billCalc(b).total;if(b.kind==='credit-note'){if(b.paymentMode==='Cash')refunds+=Math.abs(t);}
      else if(b.paymentMode==='Cash')bills+=t-(Number(b.packagePaid)||0)-(Number(b.voucherPaid)||0)-(Number(b.advancePaid)||0);
      else if(b.paymentMode==='Split')bills+=(b.payments||[]).filter(p=>p.mode==='Cash').reduce((s,p)=>s+(Number(p.amount)||0),0);}
    (b.receipts||[]).forEach(r=>{if(r.mode==='Cash'&&inW(r.at))receipts+=Number(r.amount)||0;});});
  fdAdvances(sid).forEach(a=>{if(a.mode==='Cash'&&inW(a.at))adv+=a.amount;if(a.refunded&&a.refunded.mode==='Cash'&&inW(a.refunded.at))adv-=a.amount;});
  fdPetty(sid).forEach(p=>{if(inW(p.at))petty+=Number(p.amount)||0;});const R=Math.round;return{bills:R(bills),receipts:R(receipts),adv:R(adv),petty:R(petty),refunds:R(refunds)};
}
function fdShiftExpected(sid,sh,toAt){const c=fdCashIn(sid,sh.openedAt,toAt||new Date().toISOString());return{...c,expected:Math.round((Number(sh.float)||0)+c.bills+c.receipts+c.adv-c.petty-c.refunds)};}
function FdCashDrawerModal({sid,onClose}){
  const h=React.createElement;const {toast}=useToast();const [,setT]=useState(0);const [fl,setFl]=useState('');const [cnt,setCnt]=useState('');const [note,setNote]=useState('');const sh=fdOpenShift(sid);const L=fdShifts(sid);
  const last=L.filter(s=>s.closedAt).slice(-1)[0];
  const open=()=>{if(fdOpenShift(sid))return;const f=Number(fl===''?(last?last.counted-(Number(last.handedOver)||0):0):fl)||0;fdSaveShifts(sid,[...L,{id:fdPid('SH'),openedAt:new Date().toISOString(),openedBy:fdActor(),float:f}]);try{logAuditEvent(sid,{entity:'Cash drawer',entityId:'open',action:'Opened',summary:'Float '+FD_M(f)});}catch(e){}setFl('');setT(x=>x+1);};
  const close=()=>{if(cnt==='')return toast('Count the cash and enter the amount','error');const at=new Date().toISOString();const ex=fdShiftExpected(sid,sh,at);const c=Number(cnt)||0;const diff=Math.round(c-ex.expected);
    if(diff&&!String(note).trim())return toast((diff<0?'Short by ':'Excess ')+FD_M(Math.abs(diff))+' — write a note','error');
    fdSaveShifts(sid,L.map(s=>s.id===sh.id?{...s,closedAt:at,closedBy:fdActor(),counted:c,expected:ex.expected,diff,parts:ex,note:String(note).trim()}:s));
    try{logAuditEvent(sid,{entity:'Cash drawer',entityId:sh.id,action:'Closed',summary:'Expected '+FD_M(ex.expected)+' · counted '+FD_M(c)+(diff?' · '+(diff<0?'short ':'excess ')+FD_M(Math.abs(diff)):'')});}catch(e){}
    toast(diff?(diff<0?'Short by ':'Excess ')+FD_M(Math.abs(diff)):'Drawer tallies ✓',diff?'warning':'success');setCnt('');setNote('');setT(x=>x+1);};
  const ex=sh?fdShiftExpected(sid,sh):null;const hist=L.filter(s=>s.closedAt).slice(-15).reverse();
  const per={};L.filter(s=>s.closedAt&&s.closedAt>=new Date(Date.now()-30*864e5).toISOString()).forEach(s=>{const k=s.openedBy||'—';per[k]=(per[k]||0)+(Number(s.diff)||0);});
  const kv=(k,v,c)=>h('div',{key:k,className:'kv'},h('span',null,k),h('span',{style:c?{color:c}:null},v));
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:560,maxWidth:'96vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'💵 Cash drawer'),
    !sh?h('div',null,h('div',{style:{fontSize:12.5,marginBottom:8}},'Open the drawer at the start of a shift with the cash already in it (float).'),
        h('div',{style:{display:'flex',gap:8}},h('input',{type:'number',className:'form-control',style:{width:160},placeholder:last?'Float (last close '+FD_M(last.counted)+')':'Float ₹',value:fl,onChange:e=>setFl(e.target.value)}),h('button',{className:'btn btn-primary',onClick:open},'Open drawer')))
      :h('div',null,h('div',{style:{fontSize:12.5,color:'var(--text2)',marginBottom:6}},'Open since '+new Date(sh.openedAt).toLocaleString('en-IN')+' by '+(sh.openedBy||'—')),
        kv('Float',FD_M(sh.float)),kv('+ Cash bills',FD_M(ex.bills)),kv('+ Dues received in cash',FD_M(ex.receipts)),kv('+ Advances in cash (net)',FD_M(ex.adv)),kv('− Petty cash paid',FD_M(ex.petty)),kv('− Cash refunds',FD_M(ex.refunds)),
        h('div',{className:'kv',style:{fontWeight:700}},h('span',null,'Should be in the drawer'),h('span',null,FD_M(ex.expected))),
        h('div',{style:{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}},h('input',{type:'number',className:'form-control',style:{width:150},placeholder:'Counted ₹',value:cnt,onChange:e=>setCnt(e.target.value)}),h('input',{className:'form-control',style:{flex:1,minWidth:160},placeholder:'Note (needed if it does not tally)',value:note,onChange:e=>setNote(e.target.value)}),h('button',{className:'btn btn-primary',onClick:close},'Close drawer')),
        cnt!==''&&h('div',{style:{fontSize:12.5,marginTop:4,color:Number(cnt)-ex.expected<0?'var(--red)':Number(cnt)-ex.expected>0?'var(--orange)':'var(--green)'}},Number(cnt)===ex.expected?'Tallies ✓':(Number(cnt)<ex.expected?'Short by ':'Excess ')+FD_M(Math.abs(Number(cnt)-ex.expected))),
        h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:4}},'Tips paid out of the drawer are not counted here — pay them after closing, or note them.')),
    Object.keys(per).length>0&&h('div',{style:{marginTop:14,fontSize:12.5}},h('b',null,'Last 30 days — difference by person who opened: '),Object.entries(per).map(([k,v])=>h('span',{key:k,style:{marginRight:10,color:v<0?'var(--red)':v>0?'var(--orange)':'var(--green)'}},k+' '+(v?(v<0?'−':'+')+FD_M(Math.abs(v)):'✓')))),
    hist.length>0&&h('div',{className:'table-wrap',style:{marginTop:8}},h('table',null,h('thead',null,h('tr',null,['Closed','By','Expected','Counted','Difference','Note'].map((x,i)=>h('th',{key:i},x)))),
      h('tbody',null,hist.map(s=>h('tr',{key:s.id},h('td',null,new Date(s.closedAt).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})),h('td',null,s.closedBy),h('td',null,FD_M(s.expected)),h('td',null,FD_M(s.counted)),
        h('td',{style:{fontWeight:600,color:s.diff<0?'var(--red)':s.diff>0?'var(--orange)':'var(--green)'}},s.diff?(s.diff<0?'−':'+')+FD_M(Math.abs(s.diff)):'✓'),h('td',{style:{fontSize:11.5}},s.note||'')))))),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-primary',onClick:onClose},'Close'))));
}
function FdPettyModal({sid,onClose}){
  const h=React.createElement;const {toast}=useToast();const heads=fdPettyHeads();const [,setT]=useState(0);const [f,setF]=useState({amount:'',rowIdx:heads[0]?heads[0].i:-1,note:'',post:true,photo:null});const photoRef=useRef(null);
  const L=fdPetty(sid).filter(p=>String(p.date).slice(0,7)===fdTodayIso().slice(0,7)).slice().reverse();const sa=isSuperAdminUser(currentSessionUser());
  const add=()=>{const hd=heads.find(x=>x.i===Number(f.rowIdx));const err=fdAddPetty(sid,{...f,rowIdx:hd?hd.i:-1,head:hd?hd.name:''});if(err)return toast(err,'error');toast('Petty cash recorded'+(f.post&&hd?' and added to Daily Sales → '+hd.name:''),'success');setF({...f,amount:'',note:'',photo:null});setT(x=>x+1);};
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:640,maxWidth:'96vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'🧾 Petty cash from the counter'),
    h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end',marginBottom:8}},
      h('input',{type:'number',className:'form-control',style:{width:110},placeholder:'₹',value:f.amount,onChange:e=>setF({...f,amount:e.target.value})}),
      h('select',{className:'form-control',style:{width:200},value:f.rowIdx,onChange:e=>setF({...f,rowIdx:Number(e.target.value)})},heads.map(x=>h('option',{key:x.i,value:x.i},x.name))),
      h('input',{className:'form-control',style:{flex:1,minWidth:160},placeholder:'What for (milk, courier…)',value:f.note,onChange:e=>setF({...f,note:e.target.value})}),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>photoRef.current&&photoRef.current.click()},f.photo?'📷 ✓':'📷 Bill photo'),h('input',{type:'file',accept:'image/*',capture:'environment',ref:photoRef,style:{display:'none'},onChange:async e=>{const file=e.target.files&&e.target.files[0];e.target.value='';if(!file)return;try{const d=typeof fdShrinkPhoto==='function'?await fdShrinkPhoto(file,700):null;if(d)setF(x=>({...x,photo:{dataUrl:d,name:'petty-'+Date.now()+'.jpg'}}));}catch(err){toast('Could not read the photo','error');}}}),
      h('button',{className:'btn btn-primary btn-sm',onClick:add},'Pay')),
    h('label',{style:{display:'flex',gap:6,alignItems:'center',fontSize:12.5,marginBottom:10}},h('input',{type:'checkbox',checked:f.post,onChange:e=>setF({...f,post:e.target.checked})}),'Add it to today’s Daily Sales expenses (do not also type it there)'),
    !L.length?h('div',{style:{color:'var(--text3)',fontSize:12.5}},'Nothing paid this month.'):h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Date','Amount','Head','For','By','Bill',''].map((x,i)=>h('th',{key:i},x)))),
      h('tbody',null,L.map(p=>h('tr',{key:p.id},h('td',null,fdDmy(p.date)),h('td',null,FD_M(p.amount)),h('td',{style:{fontSize:11.5}},(p.head||'—')+(p.posted?' ✓':'')),h('td',null,p.note),h('td',null,p.by),
        h('td',null,p.photo?h(FdImg,{src:fdPhotoSrc(p.photo),style:{width:36,height:36,objectFit:'cover',borderRadius:4}}):'—'),
        h('td',null,(sa||p.date===fdTodayIso())&&h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>{if(window.confirm('Delete this entry?'+(p.posted?' It is also taken out of Daily Sales.':''))){fdDeletePetty(sid,p.id);setT(x=>x+1);}}},'✕'))))))),
    h('div',{style:{fontSize:12.5,marginTop:8}},'This month: '+FD_M(L.reduce((s,p)=>s+p.amount,0))),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-primary',onClick:onClose},'Close'))));
}

// ── B11 · offline / waiting-to-sync banner (Controls → offlineWarning) ──
function FdSyncBanner({sid}){
  const h=React.createElement;const [,setT]=useState(0);const since=useRef(0);
  useEffect(()=>{const f=()=>setT(x=>x+1);const iv=setInterval(f,10000);window.addEventListener('online',f);window.addEventListener('offline',f);return()=>{clearInterval(iv);window.removeEventListener('online',f);window.removeEventListener('offline',f);};},[]);
  if(!controlOn('offlineWarning',sid))return null;const online=navigator.onLine!==false;const pending=typeof _cloudDirty!=='undefined'?_cloudDirty.size:0;
  if(pending>0){if(!since.current)since.current=Date.now();}else since.current=0;const stuck=pending>0&&Date.now()-since.current>60000;
  if(online&&!stuck)return null;
  return h('div',{className:'attention-card',style:{marginBottom:12,color:online?'var(--orange)':'var(--red)'}},online?'⏳ '+pending+' change(s) waiting to reach the cloud — keep this tab open until it says saved.':'📴 No internet — bills and bookings are kept on this device and go to the cloud when the internet is back. Do not close the tab or clear browser data.'+(pending?' ('+pending+' waiting)':''));
}

// ── B12 · duplicate bill (Controls → duplicateBillCheck) ──
function fdDuplicateBill(sid,rec){
  const sig=b=>(b.items||[]).map(it=>it.name+'×'+(Number(it.qty)||1)).sort().join('|');const p=fdP10(rec.phone),nm=String(rec.customer||'').trim().toLowerCase();const lim=Date.now()-(controlLimit('duplicateBillCheck')||10)*60000;
  return fdBills(sid).find(b=>b&&b.status!=='Cancelled'&&b.kind!=='credit-note'&&b.createdAt&&new Date(b.createdAt).getTime()>=lim&&(p.length===10?fdP10(b.phone)===p:String(b.customer||'').trim().toLowerCase()===nm)&&sig(b)===sig(rec))||null;
}

// ── after-save hooks: advances used, no-show fees settled, coupon use, rebook offer ──
(function(){if(typeof fdAfterBillSaved!=='function')return;const base=fdAfterBillSaved;fdAfterBillSaved=function(sid,bill,isNew){const out=base(sid,bill,isNew);if(!isNew)return out;
  try{if((bill.advanceIds||[]).length){const L=fdAdvances(sid);L.forEach(a=>{if(bill.advanceIds.includes(a.id)&&!a.usedBill)a.usedBill=bill.id;});fdSaveAdvances(sid,L);out.push(FD_M(bill.advancePaid)+' advance adjusted');}}catch(e){}
  try{const ids=(bill.items||[]).map(it=>it.feeId).filter(Boolean);if(ids.length)fdDropFees(sid,bill.phone,ids,'');}catch(e){}
  try{const c=fdRecordCoupon(sid,bill);if(c)out.push(c);}catch(e){}
  try{if(bill.date===fdTodayIso()){const rb=fdRebookSuggest(sid,bill);if(rb)setTimeout(()=>window.dispatchEvent(new CustomEvent('fd-rebook',{detail:rb})),400);}}catch(e){}
  return out;};})();

// ── C13 · consultation / allergy form (Controls → consultForm) ──
const FD_CONSULT_Q=[['allergy','Allergies — products, hair dye, metals, fragrance?'],['skin','Skin or scalp conditions — eczema, psoriasis, cuts, sunburn?'],['pregnant','Pregnant or breastfeeding?'],['meds','Medicines — e.g. isotretinoin (Accutane), blood thinners, steroids?'],['chem','Chemical treatment (colour, keratin, peel) in the last 2 weeks?'],['reaction','Ever had a reaction at a salon?']];
function fdConsultDue(sid,c){if(!controlOn('consultForm',sid)||!c)return false;if(!c.consult||!c.consult.at)return true;return(Date.now()-new Date(c.consult.at))/864e5>(controlLimit('consultForm')||365);}
function FdSignPad({onChange}){
  const h=React.createElement;const ref=useRef(null);const draw=useRef(false);
  const pos=e=>{const r=ref.current.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];};
  const down=e=>{draw.current=true;const c=ref.current.getContext('2d');c.lineWidth=2;c.lineCap='round';c.strokeStyle='#111';const[x,y]=pos(e);c.beginPath();c.moveTo(x,y);};
  const move=e=>{if(!draw.current)return;e.preventDefault();const c=ref.current.getContext('2d');const[x,y]=pos(e);c.lineTo(x,y);c.stroke();};
  const up=()=>{if(!draw.current)return;draw.current=false;onChange(ref.current.toDataURL('image/png'));};
  return h('div',null,h('canvas',{ref,width:380,height:110,style:{border:'1px dashed var(--border2)',borderRadius:6,background:'#fff',touchAction:'none',maxWidth:'100%'},onPointerDown:down,onPointerMove:move,onPointerUp:up,onPointerLeave:up}),
    h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{const c=ref.current;c.getContext('2d').clearRect(0,0,c.width,c.height);onChange(null);}},'Clear'));
}
function FdConsultModal({sid,client,onClose,onSaved}){
  const h=React.createElement;const {toast}=useToast();const prev=(client.consult&&client.consult.answers)||{};const [a,setA]=useState(()=>({...prev}));const [d,setD]=useState(()=>({...((client.consult&&client.consult.details)||{})}));const [sign,setSign]=useState(null);
  const save=()=>{const miss=FD_CONSULT_Q.filter(([k])=>a[k]!=='Yes'&&a[k]!=='No');if(miss.length)return toast('Answer every question ('+miss.length+' left)','error');if(!sign)return toast('Ask the client to sign','error');
    const C=fdClients(sid);const i=C.findIndex(x=>x.id===client.id);if(i<0)return;const allergyText=a.allergy==='Yes'&&String(d.allergy||'').trim();
    C[i]={...C[i],consult:{at:new Date().toISOString(),by:fdActor(),answers:a,details:d,sign:{dataUrl:sign,name:'consult-'+client.id+'-'+Date.now()+'.png'}},...(allergyText&&!C[i].allergies?{allergies:allergyText}:{})};fdSaveClients(sid,C);
    try{logAuditEvent(sid,{entity:'Client',entityId:client.id,action:'Consultation form',summary:FD_CONSULT_Q.filter(([k])=>a[k]==='Yes').map(([k])=>k).join(', ')||'all No'});}catch(e){}toast('Consultation saved','success');onSaved&&onSaved();onClose();};
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:560,maxWidth:'96vw',maxHeight:'92vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'📝 Consultation — '+client.name),
    FD_CONSULT_Q.map(([k,q])=>h('div',{key:k,style:{padding:'6px 0',borderBottom:'1px solid var(--border)'}},h('div',{style:{fontSize:13,marginBottom:4}},q),
      h('div',{style:{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}},['No','Yes'].map(v=>h('button',{key:v,className:'btn btn-sm '+(a[k]===v?(v==='Yes'?'btn-danger':'btn-primary'):'btn-ghost'),onClick:()=>setA({...a,[k]:v})},v)),
        a[k]==='Yes'&&h('input',{className:'form-control',style:{flex:1,minWidth:160,padding:'4px 6px'},placeholder:'Details',value:d[k]||'',onChange:e=>setD({...d,[k]:e.target.value})})))),
    h('div',{style:{fontSize:12.5,margin:'10px 0 4px'}},'I confirm the answers are correct and I will tell the salon if anything changes.'),h(FdSignPad,{onChange:setSign}),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Cancel'),h('button',{className:'btn btn-primary',onClick:save},'Save'))));
}
function FdConsultNudge({sid,phone}){
  const h=React.createElement;const [open,setOpen]=useState(false);const [,setT]=useState(0);const p=fdP10(phone);if(p.length!==10)return null;const c=fdClients(sid).find(x=>fdP10(x.phone)===p);
  if(!c)return null;const flags=c.consult?FD_CONSULT_Q.filter(([k])=>(c.consult.answers||{})[k]==='Yes').map(([k])=>k+(c.consult.details&&c.consult.details[k]?': '+c.consult.details[k]:'')):[];
  if(!fdConsultDue(sid,c)&&!flags.length)return null;
  return h('div',{style:{fontSize:12.5,margin:'0 0 8px',color:flags.length&&!fdConsultDue(sid,c)?'var(--red)':'var(--orange)'}},
    fdConsultDue(sid,c)?h('span',null,'📝 '+(c.consult?'Consultation form is over a year old':'No consultation form on file')+' ',h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setOpen(true)},'Fill now')):h('span',null,'📝 Consultation: '+flags.join(' · ')),
    open&&h(FdConsultModal,{sid,client:c,onClose:()=>setOpen(false),onSaved:()=>setT(x=>x+1)}));
}

// ── C14 · colour formula card (Controls → colourFormula) ──
const fdIsColour=n=>/colou?r|root|highlight|global|balayage|ombre|toner|henna/i.test(String(n||''));
function FdFormulaCard({sid,phone,service,staffName}){
  const h=React.createElement;const {toast}=useToast();const [,setT]=useState(0);const [f,setF]=useState(null);if(!controlOn('colourFormula',sid))return null;const p=fdP10(phone);if(p.length!==10)return null;
  const c=fdClients(sid).find(x=>fdP10(x.phone)===p);if(!c)return null;const L=(c.formulas||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));if(service&&!fdIsColour(service)&&!L.length)return null;
  const save=()=>{if(!String(f.shade||'').trim())return toast('Enter the shade / mix','error');const C=fdClients(sid);const i=C.findIndex(x=>x.id===c.id);if(i<0)return;C[i]={...C[i],formulas:[...(C[i].formulas||[]),{...f,id:fdPid('F'),by:fdActor()}].slice(-40)};fdSaveClients(sid,C);setF(null);setT(x=>x+1);toast('Formula saved','success');};
  const inp={padding:'4px 6px',fontSize:12.5};
  return h('div',{style:{marginTop:10,fontSize:12.5,border:'1px solid var(--border)',borderRadius:8,padding:'8px 10px'}},
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},h('b',null,'🎨 Colour formula'+(L.length?' ('+L.length+')':'')),!f&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setF({date:fdTodayIso(),service:service||'',shade:'',developer:'',mins:'',notes:'',staff:staffName||''})},'+ Add')),
    !L.length&&!f&&h('div',{style:{color:'var(--text3)'}},c.formula?'Old note: '+c.formula:'No formula saved yet.'),
    L.slice(0,3).map(x=>h('div',{key:x.id,style:{padding:'3px 0',borderTop:'1px solid var(--border)'}},h('span',{style:{color:'var(--text3)'}},fdDmy(x.date)+' · '),h('b',null,x.shade),(x.developer?' · '+x.developer:'')+(x.mins?' · '+x.mins+' min':'')+(x.service?' · '+x.service:'')+(x.staff?' · '+x.staff:'')+(x.notes?' — '+x.notes:''))),
    f&&h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:6,marginTop:6}},
      h('input',{type:'date',className:'form-control',style:inp,value:f.date,onChange:e=>setF({...f,date:e.target.value})}),h('input',{className:'form-control',style:inp,placeholder:'Shade / mix *',value:f.shade,onChange:e=>setF({...f,shade:e.target.value})}),
      h('input',{className:'form-control',style:inp,placeholder:'Developer (e.g. 20 vol)',value:f.developer,onChange:e=>setF({...f,developer:e.target.value})}),h('input',{type:'number',className:'form-control',style:inp,placeholder:'Minutes',value:f.mins,onChange:e=>setF({...f,mins:e.target.value})}),
      h('input',{className:'form-control',style:inp,placeholder:'Service',value:f.service,onChange:e=>setF({...f,service:e.target.value})}),h('input',{className:'form-control',style:inp,placeholder:'Notes',value:f.notes,onChange:e=>setF({...f,notes:e.target.value})}),
      h('div',{style:{display:'flex',gap:4}},h('button',{className:'btn btn-primary btn-sm',onClick:save},'Save'),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setF(null)},'Cancel'))));
}

// ── C15 · similar names on different mobiles (Controls → similarClientCheck) ──
function fdNameKey(n){return String(n||'').toLowerCase().replace(/[^a-z]/g,'');}
function fdSimilarClients(sid){if(!controlOn('similarClientCheck',sid))return[];const by={};fdClients(sid).filter(c=>!c.erased).forEach(c=>{const k=fdNameKey(c.name);if(k.length<4)return;(by[k]=by[k]||[]).push(c);});return Object.values(by).filter(g=>g.length>1);}
function fdMergeClientInto(sid,keepId,dropId){
  const C=fdClients(sid);const k=C.find(c=>c.id===keepId),d=C.find(c=>c.id===dropId);if(!k||!d||k.id===d.id)return'Pick two different clients';const kp=fdP10(k.phone),dp=fdP10(d.phone);
  const m={...d};Object.keys(k).forEach(x=>{if(k[x]!==''&&k[x]!=null)m[x]=k[x];});
  m.notes=[k.notes,d.notes].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(' · ');['photos','formulas','patchTests','pendingFees','referralCredits'].forEach(f=>{const v=[...(k[f]||[]),...(d[f]||[])];if(v.length)m[f]=f==='photos'?v.slice(-8):v;});
  ['points','packageBalance'].forEach(f=>{const lg=f+'Log',bs=f+'Base';const kb=Array.isArray(k[lg])?Number(k[bs])||0:Number(k[f])||0;const db=Array.isArray(d[lg])?Number(d[bs])||0:Number(d[f])||0;const log=[...(k[lg]||[]),...(d[lg]||[])];
    if(!(kb||db||log.length))return;m[bs]=kb+db;m[lg]=log;m[f]=Math.round((m[bs]+log.reduce((s,x)=>s+(Number(x.delta)||0),0))*100)/100;});
  m.id=k.id;m.name=k.name;m.phone=k.phone||d.phone;m.alsoKnownAs=[...(k.alsoKnownAs||[]),d.name+(dp?' ('+dp+')':'')];
  fdSaveClients(sid,C.filter(c=>c.id!==d.id).map(c=>c.id===k.id?m:c));const np=fdP10(m.phone);
  if(dp&&dp!==np&&np.length===10){safeLocalSet(outletKey('salonos_billing_invoices',sid),JSON.stringify(fdBills(sid).map(b=>fdP10(b.phone)===dp?{...b,phone:np,customer:m.name}:b)));
    const B=fdLoadBook(sid);Object.keys(B).forEach(x=>{B[x]=(B[x]||[]).map(a=>fdP10(a.phone)===dp?{...a,phone:np,client:m.name}:a);});safeLocalSet(fdBookKey(sid),JSON.stringify(B));
    if(typeof saveMemberships==='function')saveMemberships(sid,fdMemberships(sid).map(x=>fdP10(x.phone)===dp?{...x,phone:np,client:m.name}:x));
    fdSaveAdvances(sid,fdAdvances(sid).map(a=>a.phone===dp?{...a,phone:np}:a));}
  try{logAuditEvent(sid,{entity:'Client',entityId:k.id,action:'Merged',summary:d.name+(dp?' ('+dp+')':'')+' → '+k.name});}catch(e){}return'';
}
function FdSimilarModal({sid,onClose,onDone}){
  const h=React.createElement;const {toast}=useToast();const [,setT]=useState(0);const G=fdSimilarClients(sid);const bills=fdBills(sid);
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:640,maxWidth:'96vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'🔍 Same name, different records'),h('div',{style:{fontSize:12.5,color:'var(--text2)',marginBottom:8}},'Check with the client before merging — two people can share a name. Merging moves bills, bookings, packages, points and notes to the record you keep.'),
    !G.length?h('div',{style:{color:'var(--green)'}},'✓ No look-alike records.'):G.map((g,gi)=>h('div',{key:gi,className:'card',style:{marginBottom:8}},g.map(c=>{const st=fdClientStats(c,bills);return h('div',{key:c.id,style:{display:'flex',gap:8,alignItems:'center',padding:'3px 0',fontSize:12.5}},
      h('span',{style:{flex:1}},h('b',null,c.name),' · '+(c.phone?fdShowPhone(sid,c.phone):'no mobile')+' · '+st.visits+' visit(s) · '+FD_M(st.spend)+(st.last?' · last '+fdDmy(st.last):'')),
      g.length===2&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{const other=g.find(x=>x.id!==c.id);if(!window.confirm('Keep '+c.name+' ('+(c.phone||'no mobile')+') and merge '+other.name+' ('+(other.phone||'no mobile')+') into it?'))return;const err=fdMergeClientInto(sid,c.id,other.id);if(err)return toast(err,'error');toast('Merged','success');setT(x=>x+1);onDone&&onDone();}},'Keep this'));}),
      g.length>2&&h('div',{style:{fontSize:11.5,color:'var(--text3)'}},'More than two — merge them two at a time from the client list.'))),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-primary',onClick:onClose},'Close'))));
}

// ── C16 · visit gap: due by the client's own rhythm (Controls → visitGapWinback) ──
function fdVisitGap(st){const B=(st&&st.bills)||[];if(B.length<3)return null;const ds=B.map(b=>b.date).sort();const g=(new Date(ds[ds.length-1])-new Date(ds[0]))/864e5/(ds.length-1);return g>=7?Math.round(g):null;}
function fdOverdueDays(sid,st){if(!controlOn('visitGapWinback',sid))return 0;const g=fdVisitGap(st);if(!g||st.since==null||st.since>365)return 0;const lim=g*(controlLimit('visitGapWinback')||150)/100;return st.since>lim?st.since-g:0;}

// ── C17 · balance link for the client (Controls → clientBalanceLink) ──
function fdBalanceLink(sid,c){
  const salon=getSalonRecordById(sid)||{};const p=fdP10(c.phone);const t=fdTodayIso();const B=fdLoadBook(sid);const up=[];
  Object.keys(B).forEach(k=>{const d=k.split('|')[1];if(d<t)return;(B[k]||[]).forEach(a=>{if(fdP10(a.phone)===p&&['Booked','Confirmed'].includes(a.status))up.push([d,fdHM(a.start),a.service]);});});
  const mem=fdMemberships(sid).filter(m=>fdP10(m.phone)===p&&(!m.validTill||m.validTill>=t)).map(m=>[m.plan||m.type,m.validTill||'',m.type==='Membership'?null:Math.max(0,Math.round((Number(m.value)||Number(m.paid)||0)-(m.redemptions||[]).reduce((s,r)=>s+(Number(r.amount)||0),0)))]);
  const data={n:String(salon.name||'').split('—')[0].trim(),c:String(c.name||'').split(' ')[0],pk:fdPackageLeft(sid,p)||0,pt:controlOn('loyaltyPoints',sid)?Number(c.points)||0:null,m:mem,up:up.sort((a,b)=>String(a[0]+a[1]).localeCompare(String(b[0]+b[1]))).slice(0,6),at:t,ph:typeof waNumber==='function'?waNumber(salon.phone||''):''};
  return location.origin+location.pathname.replace(/[^/]*$/,'')+'mycard.html#'+encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(data)))));
}

// ── D18 · stock count losses (Controls → countVariance) ──
function fdCountLosses(sid,days){
  const from=localIsoOf(new Date(Date.now()-(days||90)*864e5));const by={},mon={};
  (typeof loadInvLog==='function'?loadInvLog(sid):[]).forEach(x=>{if(x.type!=='count'||!(Number(x.qty)<0)||String(x.date)<from)return;const v=Math.abs(Number(x.qty))*(Number(x.rate)||0);const e=by[x.itemId]=by[x.itemId]||{id:x.itemId,name:x.name,times:0,qty:0,value:0};e.times++;e.qty+=Math.abs(Number(x.qty));e.value+=v;const m=String(x.date).slice(0,7);mon[m]=(mon[m]||0)+v;});
  return{items:Object.values(by).map(e=>({...e,qty:Math.round(e.qty*100)/100,value:Math.round(e.value)})).sort((a,b)=>b.value-a.value),months:Object.entries(mon).sort().map(([m,v])=>({m,v:Math.round(v)}))};
}
// ── D19 · usage above standard (Controls → usageVsStandard) ──
function fdUsageAlerts(sid){if(!controlOn('usageVsStandard',sid)||typeof consumptionFor!=='function')return[];const n=new Date();const lim=controlLimit('usageVsStandard')||20;return consumptionFor(sid,n.getFullYear(),n.getMonth()).filter(x=>x.expected>0&&x.varPct!=null&&x.varPct>lim);}
// ── D21 · supplier price rise (Controls → priceRiseAlert) ──
function fdPriceRise(sid,item,rate,vendorId){
  if(!controlOn('priceRiseAlert',sid))return null;const old=Number(item.rate)||0,r=Number(rate)||0;if(!old||!r)return null;const pct=(r/old-1)*100;if(pct<=(controlLimit('priceRiseAlert')||5))return null;
  const V=typeof loadVendors==='function'?loadVendors(sid)||[]:[];const nm=id=>(V.find(v=>String(v.id)===String(id))||{}).name||'another supplier';
  const cheaper=(item.suppliers||[]).filter(s=>Number(s.rate)>0&&Number(s.rate)<r&&String(s.vendorId)!==String(vendorId||'')).sort((a,b)=>Number(a.rate)-Number(b.rate))[0];
  return{pct:Math.round(pct),msg:item.name+': '+FD_M(old)+' → '+FD_M(r)+' (up '+Math.round(pct)+'%).'+(cheaper?' '+nm(cheaper.vendorId)+' lists it at '+FD_M(cheaper.rate)+'.':'')};
}
// ── D22 · stock-out on bookings (Controls → stockOutWarning) ──
function fdStockShort(sid,service){if(!controlOn('stockOutWarning',sid)||typeof loadStdUsage!=='function')return[];const U=loadStdUsage(sid)[service]||[];if(!U.length)return[];const S=fdStock(sid);
  return U.map(u=>{const s=S.find(z=>z.id===u.itemId);return s&&(Number(s.qty)||0)<(Number(u.qty)||0)?s.name+' ('+(Number(s.qty)||0)+' '+(s.unit||'')+' left)':null;}).filter(Boolean);}
function fdStockOutBookings(sid){if(!controlOn('stockOutWarning',sid))return[];const B=fdLoadBook(sid);const t=fdTodayIso(),tm=fdAddD(t,1);const out=[];
  [t,tm].forEach(d=>(B[sid+'|'+d]||[]).forEach(a=>{if(a.block||['Cancelled','No-show','Done'].includes(a.status))return;const s=fdStockShort(sid,a.service);if(s.length)out.push({d,a,items:s});}));return out;}

// ── blocked time (breaks, training) ──
function FdBlockModal({sid,date,onSave,onClose}){
  const h=React.createElement;const set=fdSettings(sid);const staff=fdStaff(sid,date);const [f,setF]=useState({staffId:(staff[0]||{}).id||'',start:13*60,dur:60,reason:'Lunch',d:date});const slots=[];for(let m=set.open;m<set.close;m+=set.slot)slots.push(m);
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:420},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'⛔ Block time'),
    h('div',{className:'form-row cols2'},h('div',{className:'form-group'},h('label',null,'Staff'),h('select',{className:'form-control',value:f.staffId,onChange:e=>setF({...f,staffId:e.target.value})},staff.map(s=>h('option',{key:s.id,value:s.id},s.name)))),
      h('div',{className:'form-group'},h('label',null,'Date'),h('input',{type:'date',className:'form-control',value:f.d,onChange:e=>setF({...f,d:e.target.value})}))),
    h('div',{className:'form-row cols3'},h('div',{className:'form-group'},h('label',null,'From'),h('select',{className:'form-control',value:f.start,onChange:e=>setF({...f,start:Number(e.target.value)})},slots.map(m=>h('option',{key:m,value:m},fdHM(m))))),
      h('div',{className:'form-group'},h('label',null,'Minutes'),h('select',{className:'form-control',value:f.dur,onChange:e=>setF({...f,dur:Number(e.target.value)})},[15,30,45,60,90,120,180,240].map(v=>h('option',{key:v,value:v},v)))),
      h('div',{className:'form-group'},h('label',null,'Reason'),h('select',{className:'form-control',value:f.reason,onChange:e=>setF({...f,reason:e.target.value})},['Lunch','Break','Training','Meeting','Personal','Cleaning'].map(v=>h('option',{key:v},v))))),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Cancel'),h('button',{className:'btn btn-primary',onClick:()=>{const s=staff.find(z=>z.id===f.staffId);if(s)onSave(f.d,{id:'BL-'+Date.now(),staff:s.name,staffId:s.id,start:f.start,dur:f.dur,service:f.reason,client:'⛔ '+f.reason,status:'Blocked',block:true,createdAt:new Date().toISOString(),by:fdActor()});}},'Block'))));
}

// ── E · registers ──
function fdRegDates(sid,from,to){
  const d=new Set(fdBills(sid).filter(b=>b&&b.date>=from&&b.date<=to).map(b=>b.date));fdAdvances(sid).forEach(a=>{if(a.date>=from&&a.date<=to)d.add(a.date);});
  return[...d].sort().map(iso=>{const s=fdDaySummary(sid,iso);const M=k=>Math.round(s.modes[k]||0);return{date:iso,bills:s.bills,cancelled:s.cancelled,gross:s.gross,disc:s.disc,gst:s.gst,total:s.total,cash:M('Cash'),card:M('Card'),upi:M('UPI'),pkg:M('Package'),vch:M('Voucher'),adv:M('Advance'),unpaid:M('Unpaid'),advIn:Math.round(s.advancesIn||0)};});
}
function fdRegClients(sid,from,to){
  const by={};fdBills(sid).filter(b=>b&&b.date>=from&&b.date<=to).forEach(b=>{const k=fdP10(b.phone)||'n:'+String(b.customer||'').trim().toLowerCase();
    const e=by[k]=by[k]||{key:k,name:b.customer||'—',phone:fdP10(b.phone),bills:0,cancelled:0,first:b.date,last:b.date,gross:0,disc:0,gst:0,total:0,prepaid:0,due:0,list:[]};e.list.push(b);
    if(b.status==='Cancelled'){e.cancelled++;return;}const t=billCalc(b);e.bills++;e.gross+=t.subtotal;e.disc+=t.disc;e.gst+=t.gst;e.total+=t.total;e.prepaid+=(Number(b.packagePaid)||0)+(Number(b.voucherPaid)||0)+(Number(b.advancePaid)||0);e.due+=fdBillDue(b);
    if(b.date<e.first)e.first=b.date;if(b.date>e.last)e.last=b.date;});
  const R=Math.round;return Object.values(by).map(e=>({...e,gross:R(e.gross),disc:R(e.disc),gst:R(e.gst),total:R(e.total),prepaid:R(e.prepaid),due:R(e.due),list:e.list.sort((a,b)=>String(b.date).localeCompare(String(a.date)))})).sort((a,b)=>b.total-a.total);
}
function fdMemUsed(m){return(m.redemptions||[]).reduce((s,r)=>s+(Number(r.amount)||0),0);}
function fdRegMemberships(sid){
  const by={};const t=fdTodayIso();fdMemberships(sid).forEach(m=>{const k=fdP10(m.phone)||'n:'+String(m.client||'').trim().toLowerCase();
    const e=by[k]=by[k]||{key:k,name:m.client||'—',phone:fdP10(m.phone),count:0,active:0,paid:0,value:0,used:0,left:0,expiredLeft:0,nextExpiry:'',list:[]};
    const used=fdMemUsed(m);const isMem=m.type==='Membership';const act=!m.validTill||m.validTill>=t;const left=isMem?null:Math.max(0,Math.round((Number(m.value)||Number(m.paid)||0)-used));
    e.count++;if(act)e.active++;e.paid+=Number(m.paid)||0;e.value+=Number(m.value)||Number(m.paid)||0;e.used+=used;if(left!=null){if(act)e.left+=left;else e.expiredLeft+=left;}
    if(act&&m.validTill&&(!e.nextExpiry||m.validTill<e.nextExpiry))e.nextExpiry=m.validTill;e.list.push({...m,used:Math.round(used),left,status:act?'Active':'Expired'});});
  const R=Math.round;return Object.values(by).map(e=>({...e,paid:R(e.paid),value:R(e.value),used:R(e.used),list:e.list.sort((a,b)=>String(b.soldOn||'').localeCompare(String(a.soldOn||'')))})).sort((a,b)=>b.paid-a.paid);
}
function FdRegistersModal({sid,onClose,initialTab}){
  const h=React.createElement;const t=fdTodayIso();const [tab,setTab]=useState(initialTab||'date');const [from,setFrom]=useState(t.slice(0,8)+'01');const [to,setTo]=useState(t);const [q,setQ]=useState('');const [open,setOpen]=useState(null);
  const fy=(()=>{const d=new Date(t+'T00:00:00');const y=d.getMonth()>=3?d.getFullYear():d.getFullYear()-1;return[y+'-04-01',(y+1)+'-03-31'];})();
  const lastM=(()=>{const d=new Date(t.slice(0,8)+'01T00:00:00');d.setDate(0);return[localIsoOf(new Date(d.getFullYear(),d.getMonth(),1)),localIsoOf(d)];})();
  const ql=q.trim().toLowerCase();const match=e=>!ql||String(e.name||'').toLowerCase().includes(ql)||String(e.phone||'').includes(ql);
  const D=tab==='date'?fdRegDates(sid,from,to):[];const C=tab==='client'?fdRegClients(sid,from,to).filter(match):[];const Mm=tab==='mem'?fdRegMemberships(sid).filter(match):[];
  const sum=(L,k)=>L.reduce((s,x)=>s+(Number(x[k])||0),0);const R={textAlign:'right'};const th=(L)=>h('thead',null,h('tr',null,L.map((x,i)=>h('th',{key:i,style:i?R:null},x))));const td=(v,st)=>h('td',{style:{...R,...(st||{})}},v);const M=v=>v?FD_M(v):'—';
  const outlet=String((getSalonRecordById(sid)||{}).name||'Outlet').split('—')[0].trim();
  const exportX=()=>{if(typeof XLSX==='undefined')return;const wb=XLSX.utils.book_new();const add=(rows,name)=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows.length?rows:[{Note:'No data'}]),name);
    if(tab==='date'){add(D.map(r=>({Date:fdDmy(r.date),Bills:r.bills,Cancelled:r.cancelled,Gross:r.gross,Discount:r.disc,GST:r.gst,Total:r.total,Cash:r.cash,Card:r.card,UPI:r.upi,Package:r.pkg,Voucher:r.vch,'Advance used':r.adv,Unpaid:r.unpaid,'Advance received':r.advIn})),'Date-wise');
      add(fdBills(sid).filter(b=>b.date>=from&&b.date<=to).sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(b=>{const k=billCalc(b);return{Date:fdDmy(b.date),Bill:b.id,Customer:b.customer,Mobile:b.phone||'',Items:(b.items||[]).map(it=>it.name+(Number(it.qty)>1?' ×'+it.qty:'')).join(', '),Staff:b.staff||'',Gross:Math.round(k.subtotal),Discount:Math.round(k.disc),GST:k.gst,Total:k.total,Payment:b.paymentMode,Status:b.status};}),'Bills');}
    if(tab==='client'){add(C.map(e=>({Client:e.name,Mobile:e.phone,Bills:e.bills,Cancelled:e.cancelled,'First bill':fdDmy(e.first),'Last bill':fdDmy(e.last),Gross:e.gross,Discount:e.disc,GST:e.gst,Total:e.total,'Paid from package / voucher / advance':e.prepaid,Due:e.due})),'Client-wise');
      add(C.flatMap(e=>e.list.map(b=>{const k=billCalc(b);return{Client:e.name,Mobile:e.phone,Date:fdDmy(b.date),Bill:b.id,Items:(b.items||[]).map(it=>it.name).join(', '),Total:k.total,Payment:b.paymentMode,Status:b.status};})),'Bills by client');}
    if(tab==='mem'){add(Mm.map(e=>({Client:e.name,Mobile:e.phone,'Plans bought':e.count,Active:e.active,Paid:e.paid,Value:e.value,Used:e.used,'Balance (active)':e.left,'Balance (expired)':e.expiredLeft,'Next expiry':fdDmy(e.nextExpiry)})),'Client-wise memberships');
      add(Mm.flatMap(e=>e.list.map(m=>({Client:e.name,Mobile:e.phone,Plan:m.plan||m.type,Type:m.type,'Sold on':fdDmy(m.soldOn),Paid:Number(m.paid)||0,Value:Number(m.value)||Number(m.paid)||0,Used:m.used,Balance:m.left==null?'':m.left,'Valid till':fdDmy(m.validTill),Status:m.status,Bill:m.bill||''}))),'Each plan');
      add(Mm.flatMap(e=>e.list.flatMap(m=>(m.redemptions||[]).map(r=>({Client:e.name,Plan:m.plan||m.type,Date:fdDmy(r.date),Amount:Number(r.amount)||0,Note:r.note||''})))),'Redemptions');}
    XLSX.writeFile(wb,(tab==='date'?'Date-wise':tab==='client'?'Client-wise':'Membership')+' register — '+outlet+(tab==='mem'?'':' '+from+' to '+to)+'.xlsx');};
  const billRows=L=>L.map(b=>{const k=billCalc(b);return h('div',{key:b.id,style:{display:'flex',gap:8,fontSize:12,padding:'2px 0',color:b.status==='Cancelled'?'var(--text3)':''}},h('span',{style:{width:84}},fdDmy(b.date)),h('span',{style:{width:130}},b.id),h('span',{style:{flex:1}},(tab==='date'?b.customer+' · ':'')+(b.items||[]).map(it=>it.name).join(', ')),h('span',{style:{width:80}},b.paymentMode),h('b',{style:{width:80,textAlign:'right'}},(b.status==='Cancelled'?'✕ ':'')+FD_M(k.total)));});
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:1180,maxWidth:'98vw',maxHeight:'94vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'📒 Registers — '+outlet),
    h('div',{className:'tab-bar',style:{marginBottom:10}},[['date','📅 Date-wise'],['client','👤 Client-wise'],['mem','💳 Client-wise membership']].map(([k,l])=>h('button',{key:k,className:'tab-btn '+(tab===k?'active':''),onClick:()=>{setTab(k);setOpen(null);}},l))),
    h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:10}},
      tab!=='mem'&&[h('input',{key:'f',type:'date',className:'form-control',style:{width:150},value:from,onChange:e=>setFrom(e.target.value)}),h('span',{key:'s'},'to'),h('input',{key:'t',type:'date',className:'form-control',style:{width:150},value:to,onChange:e=>setTo(e.target.value)}),
        h('button',{key:'m',className:'btn btn-ghost btn-sm',onClick:()=>{setFrom(t.slice(0,8)+'01');setTo(t);}},'This month'),h('button',{key:'l',className:'btn btn-ghost btn-sm',onClick:()=>{setFrom(lastM[0]);setTo(lastM[1]);}},'Last month'),h('button',{key:'y',className:'btn btn-ghost btn-sm',onClick:()=>{setFrom(fy[0]);setTo(fy[1]<t?fy[1]:t);}},'This FY')],
      tab!=='date'&&h('input',{className:'form-control',style:{width:220},placeholder:'Search name or mobile',value:q,onChange:e=>setQ(e.target.value)}),
      h('span',{style:{flex:1}}),h('button',{className:'btn btn-primary btn-sm',onClick:exportX},'⬇ Excel')),
    tab==='date'&&(!D.length?h('div',{className:'empty-state'},'No bills in this period.'):h('div',{className:'table-wrap'},h('table',null,th(['Date','Bills','Gross','Discount','GST','Total','Cash','Card','UPI','Package','Voucher','Advance used','Unpaid','Advance received']),
      h('tbody',null,D.map(r=>[h('tr',{key:r.date,style:{cursor:'pointer'},onClick:()=>setOpen(open===r.date?null:r.date)},h('td',{style:{fontWeight:600}},(open===r.date?'▾ ':'▸ ')+fdDmy(r.date)),td(r.bills+(r.cancelled?' (+'+r.cancelled+' ✕)':'')),td(M(r.gross)),td(M(r.disc)),td(M(r.gst)),td(h('span',null,controlOn('miniCharts',sid)&&fdBar(r.total,Math.max(...D.map(x=>x.total))),FD_M(r.total)),{fontWeight:700}),td(M(r.cash)),td(M(r.card)),td(M(r.upi)),td(M(r.pkg)),td(M(r.vch)),td(M(r.adv)),td(M(r.unpaid),r.unpaid?{color:'var(--red)'}:null),td(M(r.advIn))),
        open===r.date&&h('tr',{key:r.date+'x'},h('td',{colSpan:14,style:{background:'var(--bg3)'}},billRows(fdBills(sid).filter(b=>b.date===r.date))))]),
        h('tr',{style:{fontWeight:700,borderTop:'2px solid var(--border2)'}},h('td',null,'Total ('+D.length+' days)'),td(sum(D,'bills')),...['gross','disc','gst','total','cash','card','upi','pkg','vch','adv','unpaid','advIn'].map(k=>td(M(sum(D,k)),{key:k}))))))),
    tab==='client'&&(!C.length?h('div',{className:'empty-state'},'No bills in this period.'):h('div',{className:'table-wrap'},h('table',null,th(['Client','Mobile','Bills','First','Last','Gross','Discount','GST','Total','From package / voucher / advance','Due']),
      h('tbody',null,C.slice(0,500).map(e=>[h('tr',{key:e.key,style:{cursor:'pointer'},onClick:()=>setOpen(open===e.key?null:e.key)},h('td',{style:{fontWeight:600}},(open===e.key?'▾ ':'▸ ')+e.name),td(e.phone?fdShowPhone(sid,e.phone):'—'),td(e.bills+(e.cancelled?' (+'+e.cancelled+' ✕)':'')),td(fdDmy(e.first)),td(fdDmy(e.last)),td(M(e.gross)),td(M(e.disc)),td(M(e.gst)),td(FD_M(e.total),{fontWeight:700}),td(M(e.prepaid)),td(M(e.due),e.due?{color:'var(--red)'}:null)),
        open===e.key&&h('tr',{key:e.key+'x'},h('td',{colSpan:11,style:{background:'var(--bg3)'}},billRows(e.list)))]),
        h('tr',{style:{fontWeight:700,borderTop:'2px solid var(--border2)'}},h('td',null,'Total ('+C.length+' clients)'),td(''),td(sum(C,'bills')),td(''),td(''),...['gross','disc','gst','total','prepaid','due'].map(k=>td(M(sum(C,k)),{key:k}))))),C.length>500&&h('div',{style:{fontSize:11.5,color:'var(--text3)',padding:6}},'First 500 shown — the Excel has everyone.'))),
    tab==='mem'&&(!Mm.length?h('div',{className:'empty-state'},'No memberships or packages sold yet.'):h('div',{className:'table-wrap'},h('table',null,th(['Client','Mobile','Plans','Active','Paid','Value','Used','Balance','Expired balance','Next expiry']),
      h('tbody',null,Mm.slice(0,500).map(e=>[h('tr',{key:e.key,style:{cursor:'pointer'},onClick:()=>setOpen(open===e.key?null:e.key)},h('td',{style:{fontWeight:600}},(open===e.key?'▾ ':'▸ ')+e.name),td(e.phone?fdShowPhone(sid,e.phone):'—'),td(e.count),td(e.active,e.active?{color:'var(--green)'}:null),td(FD_M(e.paid)),td(M(e.value)),td(M(e.used)),td(M(e.left),{fontWeight:700}),td(M(e.expiredLeft),e.expiredLeft?{color:'var(--orange)'}:null),
          td(e.nextExpiry?fdDmy(e.nextExpiry):'—',e.nextExpiry&&e.nextExpiry<=fdAddD(t,15)?{color:'var(--orange)'}:null)),
        open===e.key&&h('tr',{key:e.key+'x'},h('td',{colSpan:10,style:{background:'var(--bg3)'}},e.list.map(m=>h('div',{key:m.id,style:{fontSize:12,padding:'3px 0',borderBottom:'1px solid var(--border)'}},
          h('b',null,(m.plan||m.type)),' · '+m.type+' · sold '+fdDmy(m.soldOn)+' · paid '+FD_M(m.paid)+(m.type!=='Membership'?' · value '+FD_M(m.value)+' · used '+FD_M(m.used)+' · balance '+FD_M(m.left):'')+' · till '+(m.validTill?fdDmy(m.validTill):'—')+' · ',h('span',{style:{color:m.status==='Active'?'var(--green)':'var(--text3)'}},m.status),
          (m.redemptions||[]).length>0&&h('div',{style:{color:'var(--text2)',paddingLeft:10}},(m.redemptions||[]).map(r=>fdDmy(r.date)+' '+FD_M(r.amount)+(r.note?' ('+r.note+')':'')).join(' · '))))))]),
        h('tr',{style:{fontWeight:700,borderTop:'2px solid var(--border2)'}},h('td',null,'Total ('+Mm.length+' clients)'),td(''),td(sum(Mm,'count')),td(sum(Mm,'active')),...['paid','value','used','left','expiredLeft'].map(k=>td(M(sum(Mm,k)),{key:k})),td('')))))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:8}},tab==='date'?'Cash / Card / UPI include dues received and advances taken that day (as in Day-end). Click a day to see its bills.':tab==='client'?'Click a client to see their bills. Cancelled bills are counted separately and not in the totals.':'Membership plans give a discount, so they have no balance; packages carry a ₹ balance until used or expired.'),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-primary',onClick:onClose},'Close'))));
}

if(typeof HELP_TOPICS!=='undefined'&&Array.isArray(HELP_TOPICS))HELP_TOPICS.push({title:'Registers — date-wise, client-wise, membership',body:['Billing → 📒 Registers (also in Clients). Date-wise: one line a day with payment modes; click a day for its bills. Client-wise: what each client billed in the period, with dues; click for their bills. Client-wise membership: every plan or package each client bought, what is used and the balance. ⬇ Excel downloads the register with detail sheets.']});
