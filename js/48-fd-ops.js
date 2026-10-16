// ═════════════════════════════════════════════════════════════════════════════════════════════
// Front desk — operations (js/39–47 call these; every check has a switch in Master Settings → Controls):
//   A · staff hours, booking change log, unconfirmed list, add-on suggestions, busy-hours map,
//       online booking requests
//   B · session packages, running bills, shared services, UPI QR, scheduled prices, company accounts
//   C · client preferences, stylist handover, birthday vouchers, stylist scorecard
//   D · receive against PO, stock requests between outlets, daily spot check, barcode labels,
//       monthly stock statement, slow-stock clearance
// ═════════════════════════════════════════════════════════════════════════════════════════════
const fdHmToMin=v=>{const m=String(v||'').match(/^(\d{1,2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null;};

// ── A1 · working hours for each staff member (Controls → staffHours) ──
function fdStaffHours(sid,staff){if(!controlOn('staffHours',sid)||!staff)return null;const H=(fdSettings(sid).raw.staffHours||{})[staff.id];if(!H)return null;
  const f=fdHmToMin(H.from),t=fdHmToMin(H.to),bf=fdHmToMin(H.brFrom),bt=fdHmToMin(H.brTo);return f==null&&t==null?null:{from:f==null?0:f,to:t==null?1440:t,brFrom:bf,brTo:bt};}
function fdOutsideHours(sid,staff,m){const H=fdStaffHours(sid,staff);if(!H)return false;return m<H.from||m>=H.to||(H.brFrom!=null&&H.brTo!=null&&m>=H.brFrom&&m<H.brTo);}
function fdStaffHoursMsg(sid,staff,start,dur){const H=fdStaffHours(sid,staff);if(!H)return'';
  if(start<H.from||start+dur>H.to)return staff.name+' works '+fdHM(H.from)+' – '+fdHM(H.to);
  if(H.brFrom!=null&&H.brTo!=null&&start<H.brTo&&H.brFrom<start+dur)return staff.name+' is on a break '+fdHM(H.brFrom)+' – '+fdHM(H.brTo);return'';}
function FdStaffHoursModal({sid,onClose}){
  const h=React.createElement;const {toast}=useToast();const staff=fdStaff(sid);const [H,setH]=useState(()=>JSON.parse(JSON.stringify(fdSettings(sid).raw.staffHours||{})));
  const upd=(id,k,v)=>setH(x=>({...x,[id]:{...(x[id]||{}),[k]:v}}));const inp={padding:'3px 5px',fontSize:12.5,width:100};
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:640,maxWidth:'96vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'🕘 Working hours per staff'),h('div',{style:{fontSize:12.5,color:'var(--text2)',marginBottom:8}},'Leave blank to use the outlet hours. Weekly offs and leave still come from Attendance.'),
    h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Staff','From','To','Break from','Break to'].map((x,i)=>h('th',{key:i},x)))),
      h('tbody',null,staff.map(s=>{const r=H[s.id]||{};return h('tr',{key:s.id},h('td',{style:{fontWeight:600}},s.name),...['from','to','brFrom','brTo'].map(k=>h('td',{key:k},h('input',{type:'time',className:'form-control',style:inp,value:r[k]||'',onChange:e=>upd(s.id,k,e.target.value)}))));})))),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Cancel'),h('button',{className:'btn btn-primary',onClick:()=>{const C={};Object.entries(H).forEach(([id,r])=>{if(r&&(r.from||r.to||r.brFrom||r.brTo))C[id]=r;});fdSaveSettings(sid,{staffHours:C});toast('Hours saved','success');onClose();}},'Save'))));
}

// ── A2 · booking change log (Controls → apptChangeLog) ──
function fdALog(sid,a,what){if(!controlOn('apptChangeLog',sid))return a.log;return[...(a.log||[]),{at:new Date().toISOString(),by:(currentSessionUser()||{}).name||'',what}].slice(-40);}

// ── A3 · not yet confirmed (Controls → unconfirmedAlert) ──
function fdUnconfirmed(sid,list,date){if(!controlOn('unconfirmedAlert',sid)||date!==fdTodayIso())return[];const now=fdNowMin();const lim=controlLimit('unconfirmedAlert',sid)||120;
  return(list||[]).filter(a=>!a.block&&a.status==='Booked'&&a.start>=now-15&&a.start-now<=lim).sort((a,b)=>a.start-b.start);}

// ── A4 · add-on suggestions while booking (Controls → addonSuggest) ──
function fdAddons(sid,service){if(!controlOn('addonSuggest',sid)||!service)return[];const cnt={};
  fdBills(sid).slice(0,1500).forEach(b=>{const it=(b.items||[]).filter(x=>x.type==='Service');if(!it.some(x=>x.name===service))return;it.forEach(x=>{if(x.name!==service)cnt[x.name]=(cnt[x.name]||0)+1;});});
  const menu=fdMenu(sid).filter(m=>m.type==='Service'&&m.active!==false);return Object.entries(cnt).filter(([,n])=>n>=3).sort((a,b)=>b[1]-a[1]).map(([n])=>menu.find(m=>m.name===n)).filter(Boolean).slice(0,3);}

// ── A5 · busy hours (Controls → busyHeatmap) ──
function fdHeatmap(sid,weeks){const B=fdLoadBook(sid);const from=fdAddD(fdTodayIso(),-7*(weeks||8));const grid={};let max=0;
  Object.keys(B).forEach(k=>{const d=k.split('|')[1];if(!d||d<from||d>fdTodayIso())return;const wd=new Date(d+'T00:00:00').getDay();
    (B[k]||[]).forEach(a=>{if(a.block||a.status==='Cancelled')return;for(let m=a.start;m<a.start+a.dur;m+=60){const hr=Math.floor(m/60);const key=wd+'_'+hr;grid[key]=(grid[key]||0)+1;if(grid[key]>max)max=grid[key];}});});return{grid,max,weeks:weeks||8};}

// ── A6 · online booking requests (Controls → bookingRequests; needs the "booking" function deployed) ──
function fdReqKey(sid){return outletKey('salonos_booking_requests',sid);}
function fdBookingReqs(sid){return fdArr(fdReqKey(sid));}
function fdSaveBookingReqs(sid,L){safeLocalSet(fdReqKey(sid),JSON.stringify((L||[]).slice(-300)));}
function fdBookingToken(sid){let t=fdSettings(sid).raw.bookingToken;if(!t){const a=new Uint8Array(18);(window.crypto||{}).getRandomValues?crypto.getRandomValues(a):a.forEach((_,i)=>a[i]=Math.random()*256);t=[...a].map(x=>'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x%56]).join('');fdSaveSettings(sid,{bookingToken:t});}return t;}
function fdBookingEndpoint(){return(typeof SUPABASE_URL!=='undefined'?SUPABASE_URL:'')+'/functions/v1/booking';}

// ── B7 · session packages (Controls → sessionPackages) ──
function fdSessionLeft(m){return Math.max(0,(Number(m.sessions)||0)-(m.sessionsUsed||[]).length);}
function fdSessionPacks(sid,phone){if(!controlOn('sessionPackages',sid))return[];const p=fdP10(phone);if(p.length!==10)return[];const P=typeof fdFamilyPhones==='function'?fdFamilyPhones(sid,phone):[p];const t=fdTodayIso();
  return fdMemberships(sid).filter(m=>Number(m.sessions)>0&&P.includes(fdP10(m.phone))&&(!m.validTill||m.validTill>=t)&&fdSessionLeft(m)>0);}
(function(){if(typeof fdBillDue!=='function')return;const base=fdBillDue;fdBillDue=function(b){const d=base(b);return d>0?Math.max(0,Math.round(d-(Number(b&&b.sessionPaid)||0))):d;};})();
(function(){if(typeof fdNewMoney!=='function')return;const base=fdNewMoney;fdNewMoney=function(b){return Math.max(0,base(b)-(Number(b&&b.sessionPaid)||0));};})();
(function(){if(typeof fdDaySummary!=='function')return;const base=fdDaySummary;fdDaySummary=function(sid,iso){const ds=base(sid,iso);
  fdBills(sid).forEach(b=>{if(!b||b.date!==iso||b.status==='Cancelled'||b.status==='Unpaid')return;const sp=Number(b.sessionPaid)||0;if(!sp||b.paymentMode==='Package')return;
    if(['Cash','Card','UPI'].includes(b.paymentMode))ds.modes[b.paymentMode]=(ds.modes[b.paymentMode]||0)-sp;ds.modes.Package=(ds.modes.Package||0)+sp;});return ds;};})();

// ── B8 · running bills (Controls → runningBills) ──
function fdTabKey(sid){return outletKey('salonos_open_tabs',sid);}
function fdTabs(sid){return fdArr(fdTabKey(sid)).filter(t=>!t.closedAt);}
function fdSaveTabs(sid,L){safeLocalSet(fdTabKey(sid),JSON.stringify((L||[]).slice(-200)));}
function fdOpenTab(sid,a,date){const L=fdArr(fdTabKey(sid));if(L.some(t=>!t.closedAt&&a.groupId&&t.groupId===a.groupId||!t.closedAt&&(t.apptIds||[]).includes(a.id)))return null;
  const grp=a.groupId?(fdLoadBook(sid)[sid+'|'+date]||[]).filter(x=>x.groupId===a.groupId&&x.status!=='Cancelled'):[a];
  const tab={id:fdPid('TAB'),openedAt:new Date().toISOString(),by:(currentSessionUser()||{}).name||'',client:a.client,phone:a.phone,date,apptKey:sid+'|'+date,apptIds:grp.map(x=>x.id),groupId:a.groupId||'',
    items:grp.map(x=>{const m=fdMenuItem(sid,x.service)||{};return{id:fdPid('L'),name:x.service,type:'Service',qty:1,rate:Number(m.rate)||x.rate||0,gst:m.gst!=null?Number(m.gst):18,staffId:x.staffId||'',staffName:x.staff,at:new Date().toISOString()};})};
  fdSaveTabs(sid,[...L,tab]);return tab;}
function fdCloseTab(sid,tabId,billId){fdSaveTabs(sid,fdArr(fdTabKey(sid)).map(t=>t.id===tabId?{...t,closedAt:new Date().toISOString(),bill:billId}:t));}
function FdTabsModal({sid,onBill,onClose}){
  const h=React.createElement;const {toast}=useToast();const [,setT]=useState(0);const [add,setAdd]=useState({});const L=fdTabs(sid);const menu=fdMenu(sid).filter(m=>m.active!==false&&['Service','Product'].includes(m.type));const staff=fdStaff(sid);
  const save=fn=>{fdSaveTabs(sid,fdArr(fdTabKey(sid)).map(fn));setT(x=>x+1);};
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:720,maxWidth:'97vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'🧾 Running bills'),h('div',{style:{fontSize:12.5,color:'var(--text2)',marginBottom:8}},'Opened when a client sits in the chair. Each stylist adds what they did; reception closes it into a bill.'),
    !L.length?h('div',{style:{color:'var(--text3)',fontSize:12.5}},'No running bills.'):L.map(t=>{const a=add[t.id]||{};const tot=t.items.reduce((s,x)=>s+(Number(x.qty)||0)*(Number(x.rate)||0),0);
      return h('div',{key:t.id,className:'card',style:{marginBottom:8}},h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}},h('b',null,t.client+' · '+FD_M(tot)),h('span',{style:{fontSize:11.5,color:'var(--text3)'}},'since '+new Date(t.openedAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})),
          h('button',{className:'btn btn-primary btn-sm',onClick:()=>onBill(t)},'Close → bill')),
        t.items.map(x=>h('div',{key:x.id,style:{display:'flex',gap:8,fontSize:12.5,padding:'2px 0'}},h('span',{style:{flex:1}},x.name+(Number(x.qty)>1?' ×'+x.qty:'')+(x.staffName?' · '+x.staffName:'')),h('span',null,FD_M((Number(x.qty)||0)*(Number(x.rate)||0))),
          h('span',{style:{cursor:'pointer',color:'var(--red)'},onClick:()=>save(z=>z.id!==t.id?z:{...z,items:z.items.filter(y=>y.id!==x.id)})},'✕'))),
        h('div',{style:{display:'flex',gap:6,marginTop:6,flexWrap:'wrap'}},h('select',{className:'form-control',style:{flex:1,minWidth:160,padding:'4px 6px'},value:a.name||'',onChange:e=>setAdd({...add,[t.id]:{...a,name:e.target.value}})},h('option',{value:''},'+ add service / product'),menu.map(m=>h('option',{key:m.id,value:m.name},m.name+' — '+FD_M(m.rate)))),
          h('select',{className:'form-control',style:{width:150,padding:'4px 6px'},value:a.staffId||'',onChange:e=>setAdd({...add,[t.id]:{...a,staffId:e.target.value}})},h('option',{value:''},'Done by…'),staff.map(s=>h('option',{key:s.id,value:s.id},s.name))),
          h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{const m=menu.find(z=>z.name===a.name);if(!m)return toast('Pick an item','error');const s=staff.find(z=>z.id===a.staffId);save(z=>z.id!==t.id?z:{...z,items:[...z.items,{id:fdPid('L'),name:m.name,type:m.type,qty:1,rate:Number(m.rate)||0,gst:m.gst!=null?Number(m.gst):18,staffId:s?s.id:'',staffName:s?s.name:'',at:new Date().toISOString()}]});setAdd({...add,[t.id]:{}});}},'Add')));}),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-primary',onClick:onClose},'Close'))));
}

// ── B9 · a service shared by two stylists (Controls → splitService) ──
(function(){if(typeof fdBilledSalesByStaff!=='function')return;const base=fdBilledSalesByStaff;fdBilledSalesByStaff=function(sid,year,month){const out=base(sid,year,month);const pre=year+'-'+String(month+1).padStart(2,'0');
  fdBills(sid).filter(b=>b&&b.status!=='Cancelled'&&String(b.date).startsWith(pre)).forEach(b=>{const t=billCalc(b);const k=t.subtotal?t.taxable/t.subtotal:0;
    (b.items||[]).forEach(it=>{const sp=it.split;if(!sp||!sp.staffId||!(Number(sp.pct)>0))return;const from=String(it.staffId||b.staffId||'');const to=String(sp.staffId);if(!from||from===to)return;
      const amt=Math.round((Number(it.qty)||0)*(Number(it.rate)||0)*k*Math.min(100,Number(sp.pct))/100);const cat=it.type==='Product'?'prod':(it.type==='Membership'||it.type==='Package')?'mem':'svc';
      const A=out[from]=out[from]||{svc:0,prod:0,mem:0,name:it.staffName||''};const B2=out[to]=out[to]||{svc:0,prod:0,mem:0,name:sp.staffName||''};A[cat]-=amt;B2[cat]+=amt;});});return out;};})();

// ── B10 · UPI QR for the exact amount (Controls → upiQr) ──
const FD_QR_LIB='https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
function fdUpiId(sid){return String(fdSettings(sid).raw.upiId||'').trim();}
function fdUpiUri(sid,amount,note){const id=fdUpiId(sid);if(!/^[\w.\-]{2,}@[\w]{2,}$/.test(id))return'';const nm=String((getSalonRecordById(sid)||{}).name||'Salon').split('—')[0].trim();
  return'upi://pay?pa='+encodeURIComponent(id)+'&pn='+encodeURIComponent(nm)+'&am='+(Math.round(Number(amount)*100)/100).toFixed(2)+'&cu=INR'+(note?'&tn='+encodeURIComponent(String(note).slice(0,40)):'');}
async function fdQrDataUrl(text){if(typeof qrcode!=='function'){if(typeof loadScript!=='function')throw new Error('QR not available');await loadScript(FD_QR_LIB);}const q=qrcode(0,'M');q.addData(text);q.make();return q.createDataURL(6,8);}
function FdUpiQrModal({sid,amount,note,onClose}){
  const h=React.createElement;const [src,setSrc]=useState('');const [err,setErr]=useState('');const uri=fdUpiUri(sid,amount,note);
  useEffect(()=>{if(!uri){setErr('Set a valid UPI ID in Billing → ⚙ Menu & settings → Hours, GST');return;}fdQrDataUrl(uri).then(setSrc).catch(e=>setErr(e.message||String(e)));},[uri]);
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:340,textAlign:'center'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'📱 Pay '+FD_M(amount)+' by UPI'),err?h('div',{style:{color:'var(--red)',fontSize:12.5}},err):src?h('img',{src,alt:'UPI QR',style:{width:240,height:240,imageRendering:'pixelated'}}):h('div',null,'…'),
    h('div',{style:{fontSize:12,color:'var(--text3)',marginTop:6}},fdUpiId(sid)),h('div',{style:{fontSize:11.5,color:'var(--text3)'}},'Check the payment arrived before you mark the bill paid.'),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-primary',onClick:onClose},'Done'))));
}

// ── B11 · scheduled price change (Controls → scheduledPrices) ──
function fdApplyScheduledPrices(sid){if(!controlOn('scheduledPrices',sid))return 0;const t=fdTodayIso();const raw=fdJ(outletKey('salonos_service_menu',sid),null);if(!Array.isArray(raw))return 0;let n=0;
  const L=raw.map(m=>{if(m&&m.nextFrom&&m.nextFrom<=t&&Number(m.nextRate)>0){n++;return{...m,priceHistory:[...(m.priceHistory||[]),{from:m.nextFrom,old:Number(m.rate)||0,rate:Number(m.nextRate)}].slice(-20),rate:Number(m.nextRate),nextRate:undefined,nextFrom:undefined};}return m;});
  if(n){fdSaveMenu(sid,L);try{logAuditEvent(sid,{entity:'Menu',entityId:'prices',action:'Scheduled prices applied',summary:n+' item(s)'});}catch(e){}}return n;}
function FdPriceScheduleModal({menu,setMenu,onClose}){
  const h=React.createElement;const [pct,setPct]=useState('');const [from,setFrom]=useState(fdAddD(fdTodayIso(),1));const [typ,setTyp]=useState('Service');const [rows,setRows]=useState(()=>menu.map(m=>({id:m.id,next:m.nextRate||''})));
  const shown=menu.filter(m=>typ==='All'||m.type===typ);const setR=(id,v)=>setRows(R=>R.map(r=>r.id===id?{...r,next:v}:r));
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:620,maxWidth:'96vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'📅 Schedule a price change'),
    h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:8,fontSize:12.5}},'From',h('input',{type:'date',className:'form-control',style:{width:150},value:from,min:fdAddD(fdTodayIso(),1),onChange:e=>setFrom(e.target.value)}),
      h('select',{className:'form-control',style:{width:120},value:typ,onChange:e=>setTyp(e.target.value)},['All','Service','Product','Membership','Package','Combo'].map(x=>h('option',{key:x},x))),
      h('input',{type:'number',className:'form-control',style:{width:80},placeholder:'+ %',value:pct,onChange:e=>setPct(e.target.value)}),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{const p=Number(pct)||0;if(!p)return;setRows(R=>R.map(r=>{const m=menu.find(x=>x.id===r.id);return shown.some(x=>x.id===r.id)?{...r,next:Math.round((Number(m.rate)||0)*(1+p/100)/10)*10}:r;}));}},'Apply % (rounded to ₹10)')),
    h('div',{className:'table-wrap',style:{maxHeight:'50vh',overflowY:'auto'}},h('table',null,h('thead',null,h('tr',null,['Item','Now','New price'].map((x,i)=>h('th',{key:i},x)))),
      h('tbody',null,shown.map(m=>{const r=rows.find(x=>x.id===m.id)||{};return h('tr',{key:m.id},h('td',null,m.name),h('td',null,FD_M(m.rate)),h('td',null,h('input',{type:'number',className:'form-control',style:{width:100,padding:'3px 5px'},value:r.next,onChange:e=>setR(m.id,e.target.value)})));})))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'The new prices switch on by themselves on that day; until then bills use today’s price. Press Save in the menu to keep this.'),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:()=>{setMenu(M=>M.map(m=>({...m,nextRate:undefined,nextFrom:undefined})));onClose();}},'Clear all scheduled'),h('button',{className:'btn btn-primary',onClick:()=>{setMenu(M=>M.map(m=>{const r=rows.find(x=>x.id===m.id);const v=Number(r&&r.next);return v>0&&v!==Number(m.rate)?{...m,nextRate:v,nextFrom:from}:{...m,nextRate:undefined,nextFrom:undefined};}));onClose();}},'Set'))));
}

// ── B12 · company / tie-up accounts (Controls → corporateAccounts) ──
function fdCorpKey(sid){return outletKey('salonos_corporates',sid);}
function fdCorps(sid){return fdArr(fdCorpKey(sid));}
function fdSaveCorps(sid,L){safeLocalSet(fdCorpKey(sid),JSON.stringify(L||[]));}
function fdCorpPay(sid,corpId,amount,mode){let left=Math.round(Number(amount)||0);if(!(left>0))return'Enter the amount';const L=fdBills(sid).filter(b=>b.corpId===corpId&&fdBillDue(b)>0).sort((a,b)=>String(a.date).localeCompare(String(b.date)));let n=0;
  for(const b of L){if(left<=0)break;const d=fdBillDue(b);const a=Math.min(d,left);const e=fdReceivePayment(sid,b.id,a,mode);if(!e){left-=a;n++;}}return n?'':'Nothing due';}
function fdCorpStatement(sid,corpId,ym){const B=fdBills(sid).filter(b=>b.corpId===corpId&&b.status!=='Cancelled'&&String(b.date).startsWith(ym));const all=fdBills(sid).filter(b=>b.corpId===corpId&&b.status!=='Cancelled');
  return{bills:B,total:B.reduce((s,b)=>s+billCalc(b).total,0),due:all.reduce((s,b)=>s+fdBillDue(b),0)};}
function FdCorpModal({sid,onClose}){
  const h=React.createElement;const {toast}=useToast();const [,setT]=useState(0);const [f,setF]=useState({name:'',gstin:'',contact:'',phone:'',discountPct:'',creditDays:30});const [ym,setYm]=useState(fdTodayIso().slice(0,7));const [pay,setPay]=useState({});const L=fdCorps(sid);
  const add=()=>{if(!String(f.name).trim())return toast('Company name','error');fdSaveCorps(sid,[...L,{...f,id:fdPid('CO'),name:f.name.trim(),discountPct:Number(f.discountPct)||0,creditDays:Number(f.creditDays)||0}]);setF({name:'',gstin:'',contact:'',phone:'',discountPct:'',creditDays:30});setT(x=>x+1);};
  const printSt=c=>{const st=fdCorpStatement(sid,c.id,ym);const salon=getSalonRecordById(sid)||{};const esc=s=>String(s==null?'':s).replace(/[&<>]/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[x]));
    const w=window.open('','_blank');if(!w)return toast('Allow pop-ups to print','error');w.document.write('<html><head><title>Statement '+esc(c.name)+'</title><style>body{font-family:Arial;padding:24px;font-size:13px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}.r{text-align:right}</style></head><body><h2>'+esc(salon.name||'')+'</h2>'+(salon.gst?'GSTIN '+esc(salon.gst)+'<br>':'')+'<h3>Statement — '+esc(c.name)+' — '+esc(ym)+'</h3>'+(c.gstin?'GSTIN '+esc(c.gstin)+'<br>':'')+
      '<table><tr><th>Date</th><th>Bill</th><th>Employee</th><th>Services</th><th class="r">Amount</th><th class="r">Due</th></tr>'+st.bills.map(b=>'<tr><td>'+esc(fdDmy(b.date))+'</td><td>'+esc(b.id)+'</td><td>'+esc(b.customer)+'</td><td>'+esc((b.items||[]).map(i=>i.name).join(', '))+'</td><td class="r">'+FD_M(billCalc(b).total)+'</td><td class="r">'+FD_M(fdBillDue(b))+'</td></tr>').join('')+
      '<tr><th colspan="4">Total this month</th><th class="r">'+FD_M(st.total)+'</th><th class="r">'+FD_M(st.bills.reduce((s,b)=>s+fdBillDue(b),0))+'</th></tr></table><p>Total outstanding on account: <b>'+FD_M(st.due)+'</b>'+(c.creditDays?' · payable within '+c.creditDays+' days':'')+'</p><script>window.onload=()=>window.print()<\/script></body></html>');w.document.close();};
  const inp={padding:'4px 6px',fontSize:12.5};
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:820,maxWidth:'97vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'🏢 Company accounts'),
    h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}},[['name','Company *',160],['gstin','GSTIN',140],['contact','Contact person',130],['phone','Mobile',110],['discountPct','Discount %',80],['creditDays','Credit days',80]].map(([k,l,w])=>h('input',{key:k,className:'form-control',style:{...inp,width:w},placeholder:l,value:f[k],onChange:e=>setF({...f,[k]:e.target.value})})),h('button',{className:'btn btn-primary btn-sm',onClick:add},'Add')),
    h('div',{style:{display:'flex',gap:8,alignItems:'center',marginBottom:8,fontSize:12.5}},'Month',h('input',{type:'month',className:'form-control',style:{width:150},value:ym,onChange:e=>setYm(e.target.value)})),
    !L.length?h('div',{style:{color:'var(--text3)',fontSize:12.5}},'No companies yet.'):h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Company','Bills this month','Billed','Outstanding','Receive payment',''].map((x,i)=>h('th',{key:i},x)))),
      h('tbody',null,L.map(c=>{const st=fdCorpStatement(sid,c.id,ym);const p=pay[c.id]||{};return h('tr',{key:c.id},h('td',null,h('b',null,c.name),h('div',{style:{fontSize:11,color:'var(--text3)'}},[c.gstin,c.discountPct?c.discountPct+'% off':'',c.creditDays?c.creditDays+' days':''].filter(Boolean).join(' · '))),h('td',null,st.bills.length),h('td',null,FD_M(st.total)),h('td',{style:{fontWeight:700,color:st.due?'var(--red)':''}},FD_M(st.due)),
        h('td',null,h('div',{style:{display:'flex',gap:4}},h('input',{type:'number',className:'form-control',style:{...inp,width:90},placeholder:'₹',value:p.a||'',onChange:e=>setPay({...pay,[c.id]:{...p,a:e.target.value}})}),h('select',{className:'form-control',style:{...inp,width:80},value:p.m||'Bank',onChange:e=>setPay({...pay,[c.id]:{...p,m:e.target.value}})},['Bank','UPI','Card','Cash'].map(x=>h('option',{key:x},x))),
          h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{const e=fdCorpPay(sid,c.id,p.a,p.m==='Bank'?'UPI':p.m||'UPI');if(e)return toast(e,'error');toast('Payment recorded against the oldest bills','success');setPay({...pay,[c.id]:{}});setT(x=>x+1);}},'Save'))),
        h('td',null,h('button',{className:'btn btn-ghost btn-sm',onClick:()=>printSt(c)},'🖨 Statement')));})))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:8}},'In the bill form pick “Bill to company” — the bill is kept as unpaid on the company’s account. Bank transfers are recorded as UPI in Day-end.'),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-primary',onClick:onClose},'Close'))));
}

// ── C13 · client preferences (Controls → clientPrefs) ──
const FD_PREF_F=[['drink','Drink','e.g. black coffee, no sugar'],['music','Music',''],['chat','Chat','quiet / chatty'],['time','Best time','e.g. weekday evenings'],['other','Other','e.g. sensitive scalp']];
function fdPrefsText(c){const p=(c&&c.prefs)||{};return FD_PREF_F.filter(([k])=>p[k]).map(([k,l])=>l+': '+p[k]).join(' · ');}
function FdPrefsCard({sid,phone,readOnly}){
  const h=React.createElement;const [ed,setEd]=useState(null);const [,setT]=useState(0);if(!controlOn('clientPrefs',sid))return null;const p10=fdP10(phone);if(p10.length!==10)return null;const c=fdClients(sid).find(x=>fdP10(x.phone)===p10);if(!c)return null;const txt=fdPrefsText(c);
  if(readOnly)return txt?h('div',{style:{fontSize:12.5,margin:'0 0 8px',color:'var(--text2)'}},'☕ '+txt):null;
  return h('div',{style:{marginTop:8,fontSize:12.5}},!ed?h('div',{style:{display:'flex',gap:6,alignItems:'center'}},h('span',{style:{flex:1,color:txt?'':'var(--text3)'}},'☕ '+(txt||'No preferences noted')),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setEd({...(c.prefs||{})})},'✏'))
    :h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:6}},FD_PREF_F.map(([k,l,ph])=>h('input',{key:k,className:'form-control',style:{padding:'4px 6px',fontSize:12.5},placeholder:l+(ph?' — '+ph:''),value:ed[k]||'',onChange:e=>setEd({...ed,[k]:e.target.value})})),
      h('div',{style:{display:'flex',gap:4}},h('button',{className:'btn btn-primary btn-sm',onClick:()=>{const C=fdClients(sid);const i=C.findIndex(x=>x.id===c.id);if(i>=0){C[i]={...C[i],prefs:ed};fdSaveClients(sid,C);}setEd(null);setT(x=>x+1);}},'Save'),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setEd(null)},'Cancel'))));
}

// ── C14 · stylist leaves: hand over their clients (Controls → stylistHandover) ──
function fdClientsOfStylist(sid,name){const bills=fdBills(sid);return fdClients(sid).filter(c=>!c.erased&&fdP10(c.phone).length===10).map(c=>({c,st:fdClientStats(c,bills)})).filter(x=>(x.c.prefStylist||x.st.stylist)===name&&x.st.visits>=2&&x.st.since!=null&&x.st.since<=365).sort((a,b)=>b.st.spend-a.st.spend);}
function FdHandoverModal({sid,salonName,onClose,onDone}){
  const h=React.createElement;const {toast}=useToast();const staff=fdStaff(sid);const names=[...new Set([...staff.map(s=>s.name),...fdClients(sid).map(c=>c.prefStylist).filter(Boolean)])];
  const [from,setFrom]=useState('');const [to,setTo]=useState('');const [sent,setSent]=useState({});const L=from?fdClientsOfStylist(sid,from):[];const B=fdLoadBook(sid);const fut=[];
  if(from)Object.keys(B).forEach(k=>{const d=k.split('|')[1];if(d<fdTodayIso())return;(B[k]||[]).forEach(a=>{if(a.staff===from&&!a.block&&['Booked','Confirmed'].includes(a.status))fut.push({d,a});});});
  const msg=c=>'Hi '+String(c.name).split(' ')[0]+', '+String(from).split(' ')[0]+' is no longer with us at '+salonName+'. '+String(to).split(' ')[0]+' knows your preferences and would love to look after you — reply to book.';
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:640,maxWidth:'96vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'👋 Stylist leaving — hand over clients'),
    h('div',{className:'form-row cols2'},h('div',{className:'form-group'},h('label',null,'Leaving'),h('select',{className:'form-control',value:from,onChange:e=>setFrom(e.target.value)},h('option',{value:''},'—'),names.map(n=>h('option',{key:n},n)))),
      h('div',{className:'form-group'},h('label',null,'Clients go to'),h('select',{className:'form-control',value:to,onChange:e=>setTo(e.target.value)},h('option',{value:''},'—'),staff.filter(s=>s.name!==from).map(s=>h('option',{key:s.id},s.name))))),
    from&&h('div',{style:{fontSize:12.5,marginBottom:6}},L.length+' regular client(s) (2+ visits in the last year) · '+fut.length+' upcoming booking(s)'),
    fut.length>0&&to&&h('button',{className:'btn btn-ghost btn-sm',style:{marginBottom:8},onClick:()=>{const s=staff.find(z=>z.name===to);if(!s)return;const B2=fdLoadBook(sid);let n=0,skip=0;
      fut.forEach(({d,a})=>{const k=sid+'|'+d;const list=B2[k]||[];if(fdSlotBusy(list,to,a.start,a.dur,a.id)){skip++;return;}B2[k]=list.map(x=>x.id===a.id?{...x,staff:to,staffId:s.id,log:fdALog(sid,x,'Handed over from '+from)}:x);n++;});safeLocalSet(fdBookKey(sid),JSON.stringify(B2));toast(n+' booking(s) moved to '+to+(skip?' · '+skip+' clash — move them by hand':''),skip?'warning':'success');onDone&&onDone();}},'Move upcoming bookings to '+to),
    L.slice(0,200).map(x=>h('div',{key:x.c.id,style:{display:'flex',gap:8,alignItems:'center',padding:'4px 0',borderBottom:'1px solid var(--border)',fontSize:12.5}},h('span',{style:{flex:1}},x.c.name+' · '+x.st.visits+' visits · '+FD_M(x.st.spend)+(x.c.prefStylist===to?' · ✓ moved':'')),
      to&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{const C=fdClients(sid);const i=C.findIndex(z=>z.id===x.c.id);if(i>=0){C[i]={...C[i],prefStylist:to};fdSaveClients(sid,C);}if(fdWa(x.c.phone,msg(x.c)))setSent({...sent,[x.c.id]:1});}},sent[x.c.id]?'✓ Sent':'Assign & message'))),
    to&&L.length>0&&h('button',{className:'btn btn-ghost btn-sm',style:{marginTop:8},onClick:()=>{const ids=new Set(L.map(x=>x.c.id));fdSaveClients(sid,fdClients(sid).map(c=>ids.has(c.id)?{...c,prefStylist:to}:c));toast(L.length+' client(s) now prefer '+to,'success');onDone&&onDone();}},'Assign all to '+to+' (without messages)'),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-primary',onClick:onClose},'Close'))));
}

// ── C15 · birthday voucher (Controls → birthdayVoucher) ──
const FD_MON=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function fdBirthdayMD(s){const v=String(s||'').trim().toLowerCase();let m=v.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return[Number(m[2]),Number(m[3])];m=v.match(/^(\d{1,2})[\/\-.](\d{1,2})/);if(m)return[Number(m[2]),Number(m[1])];
  m=v.match(/^(\d{1,2})\s*([a-z]{3})/);if(m&&FD_MON.indexOf(m[2])>=0)return[FD_MON.indexOf(m[2])+1,Number(m[1])];m=v.match(/^([a-z]{3})[a-z]*\s*(\d{1,2})/);if(m&&FD_MON.indexOf(m[1])>=0)return[FD_MON.indexOf(m[1])+1,Number(m[2])];return null;}
function fdBirthdaysOn(sid,iso){const d=new Date(iso+'T00:00:00');const M=d.getMonth()+1,D=d.getDate();return fdClients(sid).filter(c=>{if(c.erased||fdP10(c.phone).length!==10)return false;const md=fdBirthdayMD(c.birthday);return md&&md[0]===M&&md[1]===D;});}
function fdMakeBirthdayCoupon(sid,c){const amt=controlLimit('birthdayVoucher')||300;const t=fdTodayIso();const end=localIsoOf(new Date(new Date(t+'T00:00:00').getFullYear(),new Date(t+'T00:00:00').getMonth()+1,0));
  const code='BDAY'+Math.random().toString(36).slice(2,6).toUpperCase();fdSaveCoupons(sid,[{id:fdPid('CP'),code,kind:'₹',value:amt,on:'All',minBill:0,maxOff:0,maxUses:1,perClient:true,onlyPhone:fdP10(c.phone),expiry:end,active:true,uses:[],createdAt:new Date().toISOString(),by:'Birthday'},...fdCoupons(sid)]);
  const C=fdClients(sid);const i=C.findIndex(x=>x.id===c.id);if(i>=0){C[i]={...C[i],bdaySent:t.slice(0,4)};fdSaveClients(sid,C);}return{code,amt,end};}
function FdBirthdayStrip({sid,salonName,onChanged}){
  const h=React.createElement;const [,setT]=useState(0);if(!controlOn('birthdayVoucher',sid))return null;const t=fdTodayIso();const L=fdBirthdaysOn(sid,t);if(!L.length)return null;
  return h('div',{className:'attention-card',style:{marginBottom:12}},'🎂 Birthday today: ',L.map(c=>h('span',{key:c.id,style:{marginRight:8}},c.name+' ',c.bdaySent===t.slice(0,4)?h('span',{style:{color:'var(--green)',fontSize:12}},'✓ sent'):
    h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{const v=fdMakeBirthdayCoupon(sid,c);fdWa(c.phone,'Happy birthday '+String(c.name).split(' ')[0]+'! 🎉 Here is a '+FD_M(v.amt)+' gift from '+salonName+' — show code '+v.code+' at billing, valid till '+fdDmy(v.end)+'.');setT(x=>x+1);onChanged&&onChanged();}},'Send wish + '+FD_M(controlLimit('birthdayVoucher')||300)+' code'))));
}

// ── C16 · stylist scorecard (Controls → stylistScorecard) ──
function fdScorecard(sid,ym){
  const bills=fdBills(sid).filter(b=>b&&b.status!=='Cancelled'&&b.kind!=='credit-note');const mon=bills.filter(b=>String(b.date).startsWith(ym));const B=fdLoadBook(sid);const by={};
  mon.forEach(b=>{const t=billCalc(b);const k=t.subtotal?t.taxable/t.subtotal:0;const who=new Set();(b.items||[]).forEach(it=>{const n=it.staffName||b.staff;if(!n)return;who.add(n);const o=by[n]=by[n]||{name:n,bills:new Set(),clients:new Set(),svc:0,prod:0,ratings:[],back:0,backOf:0};const amt=(Number(it.qty)||0)*(Number(it.rate)||0)*k;if(it.type==='Product')o.prod+=amt;else o.svc+=amt;});
    who.forEach(n=>{const o=by[n];o.bills.add(b.id);const p=fdP10(b.phone);if(p.length===10)o.clients.add(p);if(Number(b.rating)>0)o.ratings.push(Number(b.rating));});});
  // came back: a later bill or a booking for the same client after this month's visit
  Object.values(by).forEach(o=>{o.clients.forEach(p=>{o.backOf++;const last=mon.filter(b=>fdP10(b.phone)===p).map(b=>b.date).sort().pop();const later=bills.some(b=>fdP10(b.phone)===p&&b.date>last)||Object.keys(B).some(k=>k.split('|')[1]>last&&(B[k]||[]).some(a=>fdP10(a.phone)===p&&a.status!=='Cancelled'&&!a.block));if(later)o.back++;});});
  return Object.values(by).map(o=>{const n=o.clients.size;return{name:o.name,bills:o.bills.size,clients:n,sales:Math.round(o.svc+o.prod),avg:o.bills.size?Math.round((o.svc+o.prod)/o.bills.size):0,retailPer:n?Math.round(o.prod/n):0,rebook:o.backOf?Math.round(o.back/o.backOf*100):null,rating:o.ratings.length?Math.round(o.ratings.reduce((s,x)=>s+x,0)/o.ratings.length*10)/10:null,low:o.ratings.filter(x=>x<=2).length};}).sort((a,b)=>b.sales-a.sales);
}

// ── D17 · receive against a purchase order (Controls → poReceiving) ──
function fdReceivePO(sid,poId,qtys){
  const P=typeof loadPOs==='function'?loadPOs(sid):[];const po=P.find(p=>p.id===poId);if(!po)return'PO not found';const S=fdStock(sid);let n=0;
  po.lines.forEach((l,i)=>{const q=Number(qtys[i])||0;if(!(q>0))return;const it=S.find(s=>(l.itemId&&s.id===l.itemId)||String(s.name).toLowerCase()===String(l.name).replace(/\s*\[.*\]$/,'').toLowerCase());if(!it)return;
    it.qty=Math.round(((Number(it.qty)||0)+q)*100)/100;if(Number(l.rate)>0)it.rate=Number(l.rate);l.received=Math.round(((Number(l.received)||0)+q)*100)/100;n++;if(typeof logInvMove==='function')logInvMove(sid,it,'receive',q,Number(l.rate)||Number(it.rate)||0,{poNo:po.no,vendorId:po.vendorId});});
  if(!n)return'Enter what arrived';fdSaveStock(sid,S);const done=po.lines.every(l=>(Number(l.received)||0)>=Number(l.qty));po.status=done?'Received':'Partly received';po.receipts=[...(po.receipts||[]),{at:new Date().toISOString(),by:(currentSessionUser()||{}).name||'',qtys}];
  savePOs(sid,P);try{logAuditEvent(sid,{entity:'Purchase order',entityId:po.no,action:po.status,summary:n+' line(s)'});}catch(e){}if(typeof fdRecalcStock==='function')fdRecalcStock(sid);return'';
}
function FdPOModal({sid,onClose,onChanged}){
  const h=React.createElement;const {toast}=useToast();const [,setT]=useState(0);const [q,setQ]=useState({});const P=(typeof loadPOs==='function'?loadPOs(sid):[]).filter(p=>!['Received','Cancelled','Closed'].includes(p.status)).reverse();const V=typeof loadVendors==='function'?loadVendors(sid)||[]:[];
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:720,maxWidth:'97vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'📦 Purchase orders to receive'),
    !P.length?h('div',{style:{color:'var(--text3)',fontSize:12.5}},'No open purchase orders. Make them from 🛒 Reorder by supplier.'):P.map(po=>{const qq=q[po.id]||{};const v=V.find(x=>String(x.id)===String(po.vendorId));
      return h('div',{key:po.id,className:'card',style:{marginBottom:8}},h('div',{style:{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:6}},h('b',null,po.no+' · '+(v?v.name:'Supplier')+' · '+fdDmy(po.date)),h('span',{style:{fontSize:12,color:'var(--text3)'}},po.status)),
        h('table',{style:{width:'100%',marginTop:6}},h('tbody',null,po.lines.map((l,i)=>{const left=Math.max(0,Number(l.qty)-(Number(l.received)||0));return h('tr',{key:i},h('td',null,l.name),h('td',{style:{fontSize:12,color:'var(--text3)'}},'ordered '+l.qty+' · got '+(Number(l.received)||0)),
          h('td',{style:{width:110}},h('input',{type:'number',min:0,className:'form-control',style:{padding:'3px 5px'},placeholder:left?String(left):'✓',disabled:!left,value:qq[i]||'',onChange:e=>setQ({...q,[po.id]:{...qq,[i]:e.target.value}})})));}))),
        h('div',{style:{display:'flex',gap:6,marginTop:6}},h('button',{className:'btn btn-primary btn-sm',onClick:()=>{if(typeof ecPoReceiveOk==='function'&&!ecPoReceiveOk(sid,po,qq))return;const e=fdReceivePO(sid,po.id,qq);if(e)return toast(e,'error');toast('Received into stock','success');setQ({...q,[po.id]:{}});setT(x=>x+1);onChanged&&onChanged();}},'Receive'),
          h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{const all={};po.lines.forEach((l,i)=>{const left=Math.max(0,Number(l.qty)-(Number(l.received)||0));if(left)all[i]=left;});setQ({...q,[po.id]:all});}},'Fill all'),
          h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>{if(!window.confirm('Close '+po.no+'? What has not come is not expected any more.'))return;const L=loadPOs(sid);const x=L.find(p=>p.id===po.id);if(x){x.status='Closed';x.closedAt=new Date().toISOString();savePOs(sid,L);}setT(z=>z+1);}},'Close PO')));}),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-primary',onClick:onClose},'Close'))));
}

// ── D18 · stock requests between outlets (Controls → stockRequests) ──
function fdSReqKey(sid){return outletKey('salonos_stock_requests',sid);}
function fdSReqs(sid){return fdArr(fdSReqKey(sid));}
function fdPutSReq(r){[r.fromSid,r.toSid].forEach(s=>{const L=fdSReqs(s).filter(x=>x.id!==r.id);safeLocalSet(fdSReqKey(s),JSON.stringify([...L,r].slice(-300)));});}
function fdRequestStock(toSid,fromSid,itemName,qty,note){const q=Number(qty)||0;if(!(q>0)||!itemName)return'Pick the item and quantity';const r={id:fdPid('SR'),at:new Date().toISOString(),by:(currentSessionUser()||{}).name||'',toSid:Number(toSid),fromSid:Number(fromSid),item:itemName,qty:q,note:note||'',status:'Requested'};fdPutSReq(r);return'';}
function fdAnswerSReq(sid,id,ok){const r=fdSReqs(sid).find(x=>x.id===id);if(!r||r.status!=='Requested')return'Already answered';if(ok){const it=fdStock(r.fromSid).find(s=>String(s.name).toLowerCase()===String(r.item).toLowerCase());if(!it)return'Item not in stock here';const e=fdTransferStock(r.fromSid,r.toSid,it.id,r.qty);if(e)return e;}
  fdPutSReq({...r,status:ok?'Sent':'Declined',answeredAt:new Date().toISOString(),answeredBy:(currentSessionUser()||{}).name||''});return'';}

// ── D19 · daily spot check (Controls → spotCheck) ──
function fdSpotKey(sid){return outletKey('salonos_spot_checks',sid);}
function fdSpotItems(sid){const n=controlLimit('spotCheck')||5;const t=fdTodayIso();const recent=new Set(fdArr(fdSpotKey(sid)).filter(x=>x.date>=fdAddD(t,-14)&&x.date<t).map(x=>x.itemId));
  const hash=s=>{let x=0;for(const ch of s)x=(x*31+ch.charCodeAt(0))>>>0;return x;};return fdStock(sid).filter(i=>i.active!==false&&!recent.has(i.id)).sort((a,b)=>hash(t+a.id)-hash(t+b.id)).slice(0,n);}
function fdSaveSpot(sid,found){const t=fdTodayIso();const S=fdStock(sid);const rec=[];let val=0;
  Object.entries(found).forEach(([id,v])=>{if(v===''||v==null)return;const it=S.find(i=>i.id===id);if(!it)return;const c=Number(v);const diff=Math.round((c-(Number(it.qty)||0))*100)/100;rec.push({date:t,itemId:id,expected:Number(it.qty)||0,found:c,by:(currentSessionUser()||{}).name||''});
    if(diff){it.qty=c;if(diff<0&&typeof fdTakeBatches==='function')fdTakeBatches(it,-diff);val+=diff*(Number(it.rate)||0);if(typeof logInvMove==='function')logInvMove(sid,it,'count',diff,Number(it.rate)||0,{spot:true});}});
  if(!rec.length)return null;fdSaveStock(sid,S);safeLocalSet(fdSpotKey(sid),JSON.stringify([...fdArr(fdSpotKey(sid)),...rec].slice(-2000)));try{logAuditEvent(sid,{entity:'Stock',entityId:'spot',action:'Spot check',summary:rec.length+' item(s) · '+(val<0?'short ':'excess ')+FD_M(Math.abs(val))});}catch(e){}return{n:rec.length,val:Math.round(val)};}

// ── D20 · barcode labels (Code 128-B) (Controls → barcodeLabels) ──
const FD_C128=['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
function fdCode128(text){const s=String(text||'');if(!s||[...s].some(ch=>ch.charCodeAt(0)<32||ch.charCodeAt(0)>126))return null;const v=[104,...[...s].map(ch=>ch.charCodeAt(0)-32)];const chk=v.reduce((t,x,i)=>t+x*(i||1),0)%103;return[...v,chk,106].map(x=>FD_C128[x]).join('');}
function fdBarcodeSvg(text,h){const w=fdCode128(text);if(!w)return'';let x=10,bars='';[...w].forEach((d,i)=>{const n=Number(d);if(i%2===0)bars+='<rect x="'+x+'" y="0" width="'+n+'" height="'+(h||40)+'"/>';x+=n;});return'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+(x+10)+' '+(h||40)+'" width="'+(x+10)*1.4+'" height="'+(h||40)+'" shape-rendering="crispEdges">'+bars+'</svg>';}
function fdAssignBarcodes(sid){const S=fdStock(sid);let n=0;const used=new Set(S.map(i=>i.barcode).filter(Boolean));S.forEach(i=>{if(i.barcode||i.active===false)return;let k=1,code;do{code='SO'+sid+'-'+String(k++).padStart(4,'0');}while(used.has(code));used.add(code);i.barcode=code;n++;});if(n)fdSaveStock(sid,S);return n;}
function fdPrintLabels(sid,picks){const S=fdStock(sid);const esc=x=>String(x==null?'':x).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));const cells=[];
  Object.entries(picks).forEach(([id,n])=>{const it=S.find(i=>i.id===id);if(!it||!it.barcode)return;for(let k=0;k<Math.min(100,Number(n)||0);k++)cells.push('<div class="l"><div class="n">'+esc(it.name)+'</div>'+fdBarcodeSvg(it.barcode,38)+'<div class="c">'+esc(it.barcode)+(Number(it.sell)>0?' · '+FD_M(it.sell):'')+'</div></div>');});
  if(!cells.length)return'Pick items that have a barcode';const w=window.open('','_blank');if(!w)return'Allow pop-ups to print';
  w.document.write('<html><head><title>Labels</title><style>body{font-family:Arial;margin:8mm}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}.l{border:1px dashed #bbb;padding:2mm;text-align:center;page-break-inside:avoid}.n{font-size:10px;font-weight:bold;white-space:nowrap;overflow:hidden}.c{font-size:9px}svg{max-width:100%}</style></head><body><div class="g">'+cells.join('')+'</div><script>window.onload=()=>window.print()<\/script></body></html>');w.document.close();return'';}
function FdLabelsModal({sid,onClose}){
  const h=React.createElement;const {toast}=useToast();const [,setT]=useState(0);const [pk,setPk]=useState({});const S=fdStock(sid).filter(i=>i.active!==false).sort((a,b)=>(Number(b.sell)>0)-(Number(a.sell)>0)||String(a.name).localeCompare(String(b.name)));const no=S.filter(i=>!i.barcode).length;
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:620,maxWidth:'96vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'🏷 Barcode labels'),
    no>0&&h('div',{style:{fontSize:12.5,marginBottom:8}},no+' item(s) have no barcode. ',h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{const n=fdAssignBarcodes(sid);toast(n+' code(s) given','success');setT(x=>x+1);}},'Give them codes')),
    h('div',{className:'table-wrap',style:{maxHeight:'55vh',overflowY:'auto'}},h('table',null,h('thead',null,h('tr',null,['Item','Barcode','Sell','Labels'].map((x,i)=>h('th',{key:i},x)))),
      h('tbody',null,S.map(i=>h('tr',{key:i.id},h('td',null,i.name),h('td',{style:{fontSize:11.5}},i.barcode||'—'),h('td',null,Number(i.sell)>0?FD_M(i.sell):'—'),h('td',null,h('input',{type:'number',min:0,max:100,disabled:!i.barcode,className:'form-control',style:{width:70,padding:'3px 5px'},value:pk[i.id]||'',onChange:e=>setPk({...pk,[i.id]:e.target.value})}))))))),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Close'),h('button',{className:'btn btn-primary',onClick:()=>{const e=fdPrintLabels(sid,pk);if(e)toast(e,'error');}},'🖨 Print'))));
}

// ── D21 · monthly stock statement for the accountant (Controls → stockStatement) — information only ──
function fdStockStatement(sid,ym){
  const log=typeof loadInvLog==='function'?loadInvLog(sid):[];const from=ym+'-01';const d=new Date(from+'T00:00:00');const to=localIsoOf(new Date(d.getFullYear(),d.getMonth()+1,0));const sgn=x=>x.type==='count'?1:(FD_MOVE_SIGN[x.type]||0);
  return fdStock(sid).filter(i=>i.active!==false).map(i=>{const mine=log.filter(x=>x&&x.itemId===i.id&&x.type!=='opening');const after=mine.filter(x=>String(x.date)>to).reduce((s,x)=>s+sgn(x)*(Number(x.qty)||0),0);const inM=mine.filter(x=>String(x.date)>=from&&String(x.date)<=to);
    const sum=f=>inM.filter(f).reduce((s,x)=>s+Math.abs(Number(x.qty)||0),0);const closing=Math.round(((Number(i.qty)||0)-after)*100)/100;const inQ=sum(x=>['receive','transfer-in','return'].includes(x.type));const used=sum(x=>['issue','sale','transfer-out'].includes(x.type));const wo=sum(x=>x.type==='writeoff');const adj=inM.filter(x=>x.type==='count').reduce((s,x)=>s+(Number(x.qty)||0),0);
    const opening=Math.round((closing-inQ+used+wo-adj)*100)/100;const r=Number(i.rate)||0;return{name:i.name,unit:i.unit,opening,inQ,used,wo,adj:Math.round(adj*100)/100,closing,rate:r,openV:Math.round(opening*r),inV:Math.round(inQ*r),usedV:Math.round(used*r),woV:Math.round(wo*r),closeV:Math.round(closing*r)};}).filter(x=>x.opening||x.inQ||x.used||x.wo||x.adj||x.closing);
}
// ── D22 · slow stock to clear (Controls → slowStock) ──
function fdSlowStock(sid){if(!controlOn('slowStock',sid))return[];const days=controlLimit('slowStock',sid)||90;const log=typeof loadInvLog==='function'?loadInvLog(sid):[];const cut=fdAddD(fdTodayIso(),-days);const soon=fdAddD(fdTodayIso(),60);
  return fdStock(sid).filter(i=>i.active!==false&&Number(i.qty)>0).map(i=>{const last=log.filter(x=>x.itemId===i.id&&['issue','sale'].includes(x.type)).reduce((a,x)=>String(x.date)>a?String(x.date):a,'');const exp=(i.batches||[]).filter(b=>Number(b.qty)>0&&b.expiry&&b.expiry<=soon).map(b=>b.expiry).sort()[0]||'';
    const slow=!last||last<cut;if(!slow&&!exp)return null;const value=Math.round((Number(i.qty)||0)*(Number(i.rate)||0));const sell=Number(i.sell)||0;const offer=sell?Math.max(Math.round(Number(i.rate)||0),Math.round(sell*0.8/10)*10):0;
    return{i,last,exp,value,offer,why:[slow?(last?'no use since '+fdDmy(last):'never used'):'',exp?'expires '+fdDmy(exp):''].filter(Boolean).join(' · ')};}).filter(Boolean).sort((a,b)=>b.value-a.value);}

// scheduled prices switch on the first time the menu is read that day
const _fdSchedDone={};
(function(){if(typeof fdMenu!=='function')return;const base=fdMenu;fdMenu=function(sid){const k=sid+'|'+fdTodayIso();if(!_fdSchedDone[k]&&typeof controlOn==='function'&&controlOn('scheduledPrices',sid)){_fdSchedDone[k]=1;try{fdApplyScheduledPrices(sid);}catch(e){}}return base(sid);};})();
// sessions used on a bill come off the session package
(function(){if(typeof fdAfterBillSaved!=='function')return;const base=fdAfterBillSaved;fdAfterBillSaved=function(sid,bill,isNew){const out=base(sid,bill,isNew);if(!isNew)return out;
  try{const ids=(bill.items||[]).filter(it=>it.sessionPkgId).map(it=>it.sessionPkgId);if(ids.length&&typeof saveMemberships==='function'){const L=fdMemberships(sid);let n=0;
    ids.forEach(id=>{const m=L.find(x=>x.id===id);if(!m)return;const per=Math.round((Number(m.paid)||0)/Math.max(1,Number(m.sessions)||1)*100)/100;m.sessionsUsed=[...(m.sessionsUsed||[]),{id:fdRid(),date:bill.date,bill:bill.id}];m.redemptions=[...(m.redemptions||[]),{id:fdRid(),date:bill.date,amount:per,note:'Session · Bill '+bill.id}];n++;});
    saveMemberships(sid,L);if(n)out.push(n+' session(s) used from the package');}}catch(e){}
  return out;};})();
