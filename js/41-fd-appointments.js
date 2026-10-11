// ═════════════════════════════════════════════════════════════════════════════════════════════
// Appointments — real staff (weekly off / absence / leave blocked), outlet hours and slot length,
// durations from the menu, several services in one booking, client search (new clients added),
// day / week / stylist views with drag-and-drop, real WhatsApp reminders, waitlist, a booking link,
// and “Bill now” (the bill form, prefilled; the booking turns Done).
// Same storage as before: salonos_appointments_book_outlet_<id> → {'<sid>|<yyyy-mm-dd>':[appointment]}.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const AP_STATUS_COLOR={'Booked':'var(--blue)','Confirmed':'var(--teal)','In chair':'var(--orange)','Done':'var(--green)','No-show':'var(--red)','Cancelled':'var(--text3)'};
const fdHM=m=>{const hh=Math.floor(m/60),mm=m%60;const ap=hh>=12?'PM':'AM';const H=hh%12===0?12:hh%12;return H+':'+String(mm).padStart(2,'0')+' '+ap;};
const fdAddD=(iso,n)=>{const d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+n);return localIsoOf(d);};
const fdPrettyD=iso=>new Date(iso+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});
function fdBookKey(sid){return outletKey('salonos_appointments_book',sid);}
function fdLoadBook(sid){const v=fdJ(fdBookKey(sid),null);if(v&&typeof v==='object')return v;try{const legacy=JSON.parse(cachedLocalGet('salonos_appointments_book')||'{}')||{};const mine={};Object.keys(legacy).forEach(k=>{if(k.startsWith(sid+'|'))mine[k]=legacy[k];});return mine;}catch(e){return{};}}
function fdMarkApptBilled(sid,dayKey,ids,billId){const B=fdLoadBook(sid);B[dayKey]=(B[dayKey]||[]).map(a=>ids.includes(a.id)?{...a,status:'Done',billId}:a);safeLocalSet(fdBookKey(sid),JSON.stringify(B));}
// Save a bill from outside the Billing screen (Appointments / Clients).
function fdCreateBill(sid,rec){const L=fdBills(sid);const id=typeof fdNextBillNo==='function'?fdNextBillNo(sid,L,rec.date):nextPrefixedId(L,'INV-',4);const bill={...rec,id,createdBy:(currentSessionUser()||{}).name||'',createdAt:new Date().toISOString()};
  safeLocalSet(outletKey('salonos_billing_invoices',sid),JSON.stringify([bill,...L]));const notes=fdAfterBillSaved(sid,bill,true);return{bill,notes};}
function fdWaitKey(sid){return outletKey('salonos_appt_waitlist',sid);}
function fdLoadWait(sid){const v=fdJ(fdWaitKey(sid),[]);return Array.isArray(v)?v:[];}
function fdSaveWait(sid,l){safeLocalSet(fdWaitKey(sid),JSON.stringify((l||[]).slice(-300)));}
function fdWa(phone,text){const ph=typeof waNumber==='function'?waNumber(phone):'';if(!ph){window.alert('No valid mobile number.');return false;}window.open('https://wa.me/'+ph+'?text='+encodeURIComponent(text),'_blank','noopener');return true;}

function AppointmentBook({salon}){
  const h=React.createElement;const {toast}=useToast();const sid=Number(salon&&salon.id)||1;const set=fdSettings(sid);
  const [date,setDate]=useState(fdTodayIso());const [book,setBook]=useState(()=>fdLoadBook(sid));
  useEffect(()=>{safeLocalSet(fdBookKey(sid),JSON.stringify(book));},[book,sid]);
  const [view,setView]=useState('day');const [staffF,setStaffF]=useState('All');const [modal,setModal]=useState(null);const [bill,setBill]=useState(null);const [panel,setPanel]=useState('');const [drag,setDrag]=useState(null);const [,setT]=useState(0);
  const staff=fdStaff(sid,date);const menu=fdMenu(sid).filter(m=>m.active!==false&&m.type==='Service');const slots=[];for(let m=set.open;m<set.close;m+=set.slot)slots.push(m);
  const key=d=>sid+'|'+d;const dayList=d=>book[key(d)]||[];const appts=dayList(date);const live=appts.filter(a=>a.status!=='Cancelled');
  const setDay=(d,fn)=>setBook(b=>({...b,[key(d)]:fn(b[key(d)]||[])}));
  const cols=staffF==='All'?staff:staff.filter(s=>s.id===staffF);
  const clash=(d,sname,start,dur,ignore)=>dayList(d).some(a=>a.status!=='Cancelled'&&a.status!=='No-show'&&a.staff===sname&&!(ignore||[]).includes(a.id)&&start<a.start+a.dur&&a.start<start+dur);
  const svcFor=s=>menu.filter(m=>!(m.staffIds&&m.staffIds.length)||m.staffIds.includes(s.id));
  // ── booking ──
  const openNew=(s,start,d)=>setModal({mode:'new',date:d||date,start:start!=null?start:set.open,client:'',phone:'',source:'Phone',notes:'',repeatEvery:0,repeatTimes:4,lines:[{service:(menu[0]||{}).name||'',staffId:s?s.id:(staff[0]||{}).id||''}]});
  const saveBooking=()=>{const M=modal;if(!String(M.client).trim())return toast('Enter the guest name','error');if(!M.lines.length||M.lines.some(l=>!l.service||!l.staffId))return toast('Choose the service and stylist for each line','error');
    const warns=M.lines.map(l=>fdPatchTestOk(sid,M.phone,l.service)).filter(Boolean);if(warns.length&&!window.confirm('⚠ '+warns.join('\n⚠ ')+'\n\nBook anyway?'))return;
    let t=Number(M.start);const gid='G'+Date.now();const made=[];
    for(const l of M.lines){const s=staff.find(z=>z.id===l.staffId);const dur=fdDuration(sid,l.service);
      if(t+dur>set.close)return toast(l.service+' would run past closing ('+fdHM(set.close)+')','error');
      const off=fdStaffOff(sid,s,M.date);if(off)return toast(s.name+' is not available on '+fdPrettyD(M.date)+' ('+off+')','error');
      if(clash(M.date,s.name,t,dur))return toast(s.name+' is already booked at '+fdHM(t),'error');
      {const rs=(fdMenuItem(sid,l.service)||{}).resource;const rc=rs?fdResourceClash(sid,dayList(M.date),rs,t,dur):null;if(rc)return toast(rs+' is in use then ('+rc.client+', '+fdHM(rc.start)+')','error');}
      made.push({id:'AP-'+Date.now()+made.length,groupId:gid,staff:s.name,staffId:s.id,start:t,dur,service:l.service,client:M.client.trim(),phone:fdP10(M.phone)||M.phone,status:'Booked',rate:fdRateOf(sid,l.service),source:M.source,notes:M.notes||'',createdAt:new Date().toISOString()});
      if(!l.parallel)t+=dur;}
    setDay(M.date,L=>[...L,...made]);
    // repeat every N weeks (series)
    let rep=0,skip=[];if(Number(M.repeatEvery)>0){const sidR='R'+Date.now();setBook(b=>{const nb={...b};for(let k=1;k<=Math.min(26,Number(M.repeatTimes)||0);k++){const d2=fdAddD(M.date,7*Number(M.repeatEvery)*k);const L2=nb[key(d2)]||[];
        const ok=made.every(a=>{const s=staff.find(z=>z.id===a.staffId);return !fdStaffOff(sid,s,d2)&&!L2.some(x=>x.status!=='Cancelled'&&x.staff===a.staff&&a.start<x.start+x.dur&&x.start<a.start+a.dur);});
        if(!ok){skip.push(d2);continue;}nb[key(d2)]=[...L2,...made.map((a,j)=>({...a,id:'AP-'+Date.now()+'-'+k+'-'+j,seriesId:sidR}))];rep++;}return nb;});}
    fdUpsertClient(sid,{name:M.client.trim(),phone:M.phone,source:'Booking'});setModal(null);
    if(rep||skip.length)setTimeout(()=>toast('Repeats booked: '+rep+(skip.length?' · not booked (stylist busy / off): '+skip.map(fdPrettyD).join(', '):''),skip.length?'warning':'success'),50);
    toast(M.client.trim()+' booked '+fdPrettyD(M.date)+' at '+fdHM(Number(M.start))+(made.length>1?' ('+made.length+' services)':''),'success');};
  const setStatus=(a,st)=>{setDay(date,L=>L.map(x=>x.id===a.id?{...x,status:st}:x));setModal(null);
    if((st==='Cancelled'||st==='No-show')&&controlOn('apptWaitlist',sid)){const w=fdLoadWait(sid).filter(x=>x.date===date&&x.status!=='Booked');if(w.length)toast('A slot freed up — '+w.length+' on the waitlist for today (⏳ Waitlist)','info');}};
  const billNow=a=>{const grp=a.groupId?appts.filter(x=>x.groupId===a.groupId&&x.status!=='Cancelled'):[a];
    setModal(null);setBill({apptIds:grp.map(x=>x.id),initial:{customer:a.client,phone:a.phone,date,staffId:a.staffId||'',staff:a.staff,items:grp.map(x=>{const m=fdMenuItem(sid,x.service)||{};return{name:x.service,type:'Service',qty:1,rate:Number(m.rate)||x.rate||0,gst:m.gst!=null?Number(m.gst):18,staffId:x.staffId||'',staffName:x.staff};}),paymentMode:'Cash',status:'Paid',discount:0}});};
  const onBillSaved=rec=>{const r=fdCreateBill(sid,rec);setDay(date,L=>L.map(x=>bill.apptIds.includes(x.id)?{...x,status:'Done',billId:r.bill.id}:x));setBill(null);toast('Bill '+r.bill.id+' — '+FD_M(billCalc(r.bill).total)+(r.notes.length?' · '+r.notes.join(' · '):''),'success');};
  // ── drag & drop ──
  const dropOn=(s,m)=>{if(!drag)return;const a=appts.find(x=>x.id===drag);setDrag(null);if(!a)return;if(a.staffId===s.id&&a.start===m)return;
    const off=fdStaffOff(sid,s,date);if(off)return toast(s.name+': '+off,'error');if(m+a.dur>set.close)return toast('Runs past closing','error');if(clash(date,s.name,m,a.dur,[a.id]))return toast(s.name+' is busy then','error');
    {const rs=(fdMenuItem(sid,a.service)||{}).resource;if(rs&&fdResourceClash(sid,appts,rs,m,a.dur,[a.id]))return toast(rs+' is in use then','error');}
    setDay(date,L=>L.map(x=>x.id===a.id?{...x,staff:s.name,staffId:s.id,start:m}:x));toast('Moved to '+s.name+' · '+fdHM(m),'success');};
  // ── reminders / waitlist ──
  const remDay=panel==='rem-tomorrow'?fdAddD(fdTodayIso(),1):fdTodayIso();
  const remList=(book[key(remDay)]||[]).filter(a=>['Booked','Confirmed'].includes(a.status));
  const salonName=String((salon&&salon.name)||'').split('—')[0].trim();
  const remText=a=>'Hi '+String(a.client).split(' ')[0]+', a reminder of your '+a.service+' at '+salonName+' on '+fdPrettyD(remDay)+' at '+fdHM(a.start)+' with '+String(a.staff).split(' ')[0]+'. Reply YES to confirm or CHANGE to reschedule.';
  const markRem=a=>setDay(remDay,L=>L.map(x=>x.id===a.id?{...x,reminded:new Date().toISOString()}:x));
  const wait=fdLoadWait(sid).filter(w=>w.date>=fdTodayIso()).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const [wf,setWf]=useState({name:'',phone:'',service:'',date:fdTodayIso(),pref:''});
  const outletPhone=(salon&&salon.phone)||'';const linkText='https://wa.me/'+(typeof waNumber==='function'?waNumber(outletPhone):'')+'?text='+encodeURIComponent('Hi '+salonName+', I would like to book an appointment. Service: ___  Date: ___  Time: ___');
  // ── stats ──
  const capacity=cols.filter(s=>!fdStaffOff(sid,s,date)).length*(set.close-set.open);const bookedMin=live.filter(a=>cols.some(s=>s.name===a.staff)).reduce((t,a)=>t+a.dur,0);
  const stat=(l,v,s2,c)=>h('div',{className:'metric-card'},h('div',{className:'metric-label'},l),h('div',{className:'metric-value',style:c?{color:c}:null},v),h('div',{className:'metric-sub'},s2));
  const week=[0,1,2,3,4,5,6].map(i=>fdAddD(date,i-((new Date(date+'T00:00:00').getDay()+6)%7)));
  const apptCard=a=>h('div',{draggable:a.status!=='Done'&&a.status!=='Cancelled',onDragStart:()=>setDrag(a.id),onClick:()=>setModal({mode:'view',a}),title:'Drag to move',
    style:{background:'var(--bg2)',borderLeft:'4px solid '+(AP_STATUS_COLOR[a.status]||'var(--blue)'),borderRadius:6,padding:'4px 6px',fontSize:11.5,cursor:'pointer',height:'100%',boxShadow:'0 1px 3px rgba(0,0,0,0.08)',overflow:'hidden'}},
    h('b',null,a.client),h('div',null,a.service),h('div',{style:{color:'var(--text3)'}},fdHM(a.start)+' · '+a.dur+'m'+(a.billId?' · 🧾':'')+(a.reminded?' · ✓ reminded':'')));
  return h('div',{className:'fade-in'},
    h('div',{className:'section-header'},
      h('div',null,h('div',{className:'page-title'},'Appointment Book'),h('div',{className:'page-sub'},'Click an empty slot to book, drag a booking to move it, click a booking to check in, bill or mark a no-show.')),
      h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setPanel(panel.startsWith('rem')?'':'rem-tomorrow')},'📲 Reminders'),
        controlOn('apptWaitlist',sid)&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setPanel(panel==='wait'?'':'wait')},'⏳ Waitlist'+(wait.length?' ('+wait.length+')':'')),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setPanel(panel==='sty'?'':'sty')},'👤 Stylist day'),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setPanel(panel==='link'?'':'link')},'🔗 Booking link'),
        h('button',{className:'btn btn-primary btn-sm',onClick:()=>openNew(null,null)},'+ New appointment'))),
    panel.startsWith('rem')&&h('div',{className:'card',style:{marginBottom:12}},
      h('div',{style:{display:'flex',gap:6,marginBottom:8}},[['rem-today','Today'],['rem-tomorrow','Tomorrow']].map(([k,l])=>h('button',{key:k,className:'btn btn-sm '+(panel===k?'btn-primary':'btn-ghost'),onClick:()=>setPanel(k)},l)),h('span',{style:{fontSize:12,color:'var(--text3)',alignSelf:'center'}},remList.length+' booking(s) to remind')),
      !remList.length?h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'Nothing to remind.'):remList.map(a=>h('div',{key:a.id,style:{display:'flex',gap:8,alignItems:'center',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:12.5}},
        h('span',{style:{flex:1}},fdHM(a.start)+' · '+a.client+' · '+a.service+' · '+a.staff),a.reminded&&h('span',{style:{color:'var(--green)',fontSize:11.5}},'✓ sent'),
        h('button',{className:'btn btn-primary btn-sm',onClick:()=>{if(fdWa(a.phone,remText(a)))markRem(a);}},a.reminded?'Send again':'📲 Send')))),
    panel==='wait'&&h('div',{className:'card',style:{marginBottom:12}},
      h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'flex-end',marginBottom:8}},
        [['name','Name',140],['phone','Mobile',120]].map(([k,l,w])=>h('label',{key:k,style:{fontSize:11,color:'var(--text3)'}},l,h('input',{className:'form-control',style:{width:w,padding:'4px 6px'},value:wf[k],onChange:e=>setWf({...wf,[k]:e.target.value})}))),
        h('label',{style:{fontSize:11,color:'var(--text3)'}},'Service',h('select',{className:'form-control',style:{width:170,padding:'4px 6px'},value:wf.service,onChange:e=>setWf({...wf,service:e.target.value})},h('option',{value:''},'Any'),menu.map(m=>h('option',{key:m.id},m.name)))),
        h('label',{style:{fontSize:11,color:'var(--text3)'}},'Date',h('input',{type:'date',className:'form-control',style:{width:140,padding:'4px 6px'},value:wf.date,onChange:e=>setWf({...wf,date:e.target.value})})),
        h('label',{style:{fontSize:11,color:'var(--text3)'}},'Prefers',h('input',{className:'form-control',style:{width:120,padding:'4px 6px'},placeholder:'e.g. after 5 pm',value:wf.pref,onChange:e=>setWf({...wf,pref:e.target.value})})),
        h('button',{className:'btn btn-primary btn-sm',onClick:()=>{if(!wf.name.trim()||!fdP10(wf.phone))return toast('Name and mobile are needed','error');fdSaveWait(sid,[...fdLoadWait(sid),{...wf,id:'W'+Date.now(),status:'Waiting'}]);setWf({name:'',phone:'',service:'',date:wf.date,pref:''});setT(x=>x+1);}},'Add')),
      !wait.length?h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'Nobody waiting.'):wait.map(w=>h('div',{key:w.id,style:{display:'flex',gap:8,alignItems:'center',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:12.5}},
        h('span',{style:{flex:1}},fdPrettyD(w.date)+' · '+w.name+' · '+(w.service||'any service')+(w.pref?' · '+w.pref:'')),h('span',{style:{fontSize:11.5,color:'var(--text3)'}},w.status),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{if(fdWa(w.phone,'Hi '+w.name.split(' ')[0]+', a slot has opened at '+salonName+' on '+fdPrettyD(w.date)+'. Reply with a time that suits you and we will book you in.'))fdSaveWait(sid,fdLoadWait(sid).map(x=>x.id===w.id?{...x,status:'Offered'}:x));setT(x=>x+1);}},'📲 Offer slot'),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{setPanel('');openNew(null,null,w.date);setModal(M=>M&&{...M,client:w.name,phone:w.phone,lines:[{service:w.service||(menu[0]||{}).name||'',staffId:(staff[0]||{}).id||''}]});fdSaveWait(sid,fdLoadWait(sid).map(x=>x.id===w.id?{...x,status:'Booked'}:x));}},'Book'),
        h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>{fdSaveWait(sid,fdLoadWait(sid).filter(x=>x.id!==w.id));setT(x=>x+1);}},'✕')))),
    panel==='sty'&&(()=>{const by=fdBilledSalesByStaff(sid,new Date(date+'T00:00:00').getFullYear(),new Date(date+'T00:00:00').getMonth());const dayBills=fdBills(sid).filter(b=>b.date===date&&b.status!=='Cancelled');
      return h('div',{className:'card',style:{marginBottom:12}},h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Stylist','Bookings today','Done','Billed today','Tips today','Month: services','products','memberships'].map((x,i)=>h('th',{key:i,style:i?{textAlign:'right'}:null},x)))),
        h('tbody',null,staff.map(s=>{const L=appts.filter(a=>a.staff===s.name&&a.status!=='Cancelled');const billed=dayBills.reduce((t,b)=>{const k=billCalc(b);const r=k.subtotal?k.taxable/k.subtotal:0;return t+(b.items||[]).filter(it=>(it.staffId||b.staffId)===s.id).reduce((u,it)=>u+(Number(it.qty)||0)*(Number(it.rate)||0)*r,0);},0);
          const tips=dayBills.reduce((t,b)=>t+(b.tips||[]).filter(x=>x.staffId===s.id).reduce((u,x)=>u+(Number(x.amount)||0),0),0);const mo=by[s.id]||{svc:0,prod:0,mem:0};
          return h('tr',{key:s.id},h('td',{style:{fontWeight:600}},s.name),h('td',{style:{textAlign:'right'}},L.length),h('td',{style:{textAlign:'right'}},L.filter(a=>a.status==='Done').length),h('td',{style:{textAlign:'right'}},FD_M(billed)),h('td',{style:{textAlign:'right'}},tips?FD_M(tips):'—'),
            h('td',{style:{textAlign:'right'}},FD_M(mo.svc)),h('td',{style:{textAlign:'right'}},FD_M(mo.prod)),h('td',{style:{textAlign:'right'}},FD_M(mo.mem)));})))),h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'Billed figures are before GST; the month columns feed Incentive Working when “Sales to incentives” is used.'));})(),
    panel==='link'&&h('div',{className:'card',style:{marginBottom:12,fontSize:12.5}},
      outletPhone&&(()=>{const data={n:salonName,p:typeof waNumber==='function'?waNumber(outletPhone):'',o:set.open,c:set.close,s:menu.map(m=>[m.name,m.duration,m.rate])};const url=location.origin+location.pathname.replace(/[^/]*$/,'')+'booking.html#'+encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(data)))));
        return h('div',{style:{marginBottom:10}},h('div',{style:{fontWeight:600,marginBottom:4}},'Booking page'),h('div',{style:{marginBottom:4}},'A page with your services, durations and prices where a client picks a service, date and time — it sends the request to the outlet on WhatsApp.'),
          h('div',{style:{display:'flex',gap:6}},h('input',{className:'form-control',readOnly:true,value:url,onFocus:e=>e.target.select()}),h('button',{className:'btn btn-primary btn-sm',onClick:()=>{try{navigator.clipboard.writeText(url);toast('Booking page link copied','success');}catch(e){}}},'Copy'),h('a',{className:'btn btn-ghost btn-sm',href:url,target:'_blank',rel:'noopener'},'Open')),
          h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:4}},'Copy the link again after changing the menu so it shows the new prices.'));})(),
      h('div',{style:{marginBottom:6}},'Share this link on Instagram, Google or WhatsApp — it opens a chat with the outlet number with a booking message ready. Book the request here when it arrives.'),
      outletPhone?h('div',{style:{display:'flex',gap:6}},h('input',{className:'form-control',readOnly:true,value:linkText,onFocus:e=>e.target.select()}),h('button',{className:'btn btn-primary btn-sm',onClick:()=>{try{navigator.clipboard.writeText(linkText);toast('Link copied','success');}catch(e){}}},'Copy'))
        :h('div',{style:{color:'var(--orange)'}},'Add the outlet phone number in Master Sheet → Outlets first.'),
      h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'A self-service online booking page needs a small server function (like the WhatsApp one) — ask if you want it.')),
    h('div',{className:'fd-toolbar'},
      h('div',{className:'fd-date'},h('button',{onClick:()=>setDate(fdAddD(date,view==='day'?-1:-7))},'‹'),h('span',{className:'lbl'},view==='day'?fdPrettyD(date):fdPrettyD(week[0])+' – '+fdPrettyD(week[6])),h('button',{onClick:()=>setDate(fdAddD(date,view==='day'?1:7))},'›')),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setDate(fdTodayIso())},'Today'),
      h('div',{style:{display:'inline-flex',border:'1px solid var(--border2)',borderRadius:8,overflow:'hidden'}},[['day','Day'],['week','Week'],['stylist','Stylist']].map(([k,l])=>h('button',{key:k,onClick:()=>setView(k),style:{border:'none',padding:'5px 12px',fontSize:12,cursor:'pointer',background:view===k?'var(--accent)':'transparent',color:view===k?'#fff':'var(--text2)'}},l))),
      h('select',{className:'form-control',style:{width:'auto',fontSize:12,padding:'6px 10px'},value:staffF,onChange:e=>setStaffF(e.target.value)},h('option',{value:'All'},'All staff'),staff.map(s=>h('option',{key:s.id,value:s.id},s.name)))),
    !staff.length&&h('div',{className:'help-note',style:{marginBottom:12}},'No floor staff for this month — add stylists and beauticians in Master Salary to book them.'),
    view==='day'&&h('div',{className:'grid4',style:{marginBottom:12}},stat('Appointments',String(live.length),live.filter(a=>a.source==='Online'||a.source==='WhatsApp').length+' online / WhatsApp'),
      stat('Chair occupancy',(capacity?Math.round(bookedMin/capacity*100):0)+'%',Math.round(bookedMin/60)+' of '+Math.round(capacity/60)+' staff-hours'),
      stat('Expected revenue',FD_M(live.filter(a=>a.status!=='No-show').reduce((t,a)=>t+(Number(a.rate)||0),0)),appts.filter(a=>a.billId).length+' billed'),
      stat('No-shows',String(appts.filter(a=>a.status==='No-show').length),'today',appts.some(a=>a.status==='No-show')?'var(--red)':'var(--green)')),
    view==='day'&&h('div',{className:'cal-wrap',style:{overflowX:'auto'}},h('table',{className:'cal'},
      h('thead',null,h('tr',null,h('th',{className:'timecol'},'Time'),cols.map(s=>{const off=fdStaffOff(sid,s,date);return h('th',{key:s.id},s.name,h('span',{className:'st-sub'},off?'⛔ '+off:s.role));}))),
      h('tbody',null,slots.map(m=>h('tr',{key:m,className:m%60===0?'hour':''},h('td',{className:'timecol'},fdHM(m)),
        cols.map(s=>{const off=fdStaffOff(sid,s,date);const a=live.find(x=>x.staff===s.name&&x.start<=m&&m<x.start+x.dur);
          if(a&&a.start!==m&&!(a.start<m&&m-set.slot<a.start))return null;
          if(a&&(a.start===m||(a.start<m&&m-set.slot<a.start)))return h('td',{key:s.id,rowSpan:Math.max(1,Math.ceil((a.start+a.dur-m)/set.slot))},apptCard(a));
          if(off)return h('td',{key:s.id,style:{background:'repeating-linear-gradient(45deg,var(--bg3),var(--bg3) 6px,transparent 6px,transparent 12px)'}});
          return h('td',{key:s.id,onDragOver:e=>e.preventDefault(),onDrop:()=>dropOn(s,m)},h('button',{className:'slot-free',onClick:()=>openNew(s,m)},'+ book'));})))))),
    view==='week'&&h('div',{className:'card',style:{padding:0}},h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,h('th',null,'Staff'),week.map(d=>h('th',{key:d,style:{textAlign:'center',cursor:'pointer'},onClick:()=>{setDate(d);setView('day');}},fdPrettyD(d))))),
      h('tbody',null,cols.map(s=>h('tr',{key:s.id},h('td',{style:{fontWeight:600}},s.name),week.map(d=>{const L=dayList(d).filter(a=>a.staff===s.name&&a.status!=='Cancelled');const off=fdStaffOff(sid,s,d);
        return h('td',{key:d,style:{textAlign:'center',cursor:'pointer',background:off?'var(--bg3)':undefined},onClick:()=>{setDate(d);setView('day');}},off?h('span',{style:{fontSize:11,color:'var(--text3)'}},off):L.length?h('span',null,h('b',null,L.length),h('div',{style:{fontSize:10.5,color:'var(--text3)'}},Math.round(L.reduce((t,a)=>t+a.dur,0)/60*10)/10+' h')):'—');})))))),
      h('div',{style:{fontSize:11.5,color:'var(--text3)',padding:8}},'Bookings and hours per stylist — click a day to open it.')),
    view==='stylist'&&(()=>{const s=staff.find(z=>z.id===staffF)||staff[0];if(!s)return null;return h('div',{className:'card'},h('div',{style:{fontWeight:700,marginBottom:8}},s.name+' — week of '+fdPrettyD(week[0])+(staffF==='All'?' (pick a stylist above)':'')),
      week.map(d=>{const L=dayList(d).filter(a=>a.staff===s.name&&a.status!=='Cancelled').sort((a,b)=>a.start-b.start);const off=fdStaffOff(sid,s,d);
        return h('div',{key:d,style:{padding:'6px 0',borderBottom:'1px solid var(--border)'}},h('b',{style:{fontSize:12.5,cursor:'pointer'},onClick:()=>{setDate(d);setView('day');}},fdPrettyD(d)),off?h('span',{style:{marginLeft:8,color:'var(--text3)',fontSize:12}},off):null,
          h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}},L.length?L.map(a=>h('span',{key:a.id,className:'badge',style:{background:'var(--bg3)',borderLeft:'3px solid '+AP_STATUS_COLOR[a.status],cursor:'pointer'},onClick:()=>{setDate(d);setModal({mode:'view',a});}},fdHM(a.start)+' '+a.client+' · '+a.service)):h('span',{style:{fontSize:12,color:'var(--text3)'}},off?'':'Free all day')));}));})(),
    h('div',{className:'legend'},Object.keys(AP_STATUS_COLOR).map(k=>h('span',{key:k},h('i',{style:{background:AP_STATUS_COLOR[k]}}),k))),
    modal&&modal.mode==='new'&&(()=>{const M=modal;const c=fdP10(M.phone).length===10?fdClients(sid).find(x=>fdP10(x.phone)===fdP10(M.phone)):null;const dayStaff=fdStaff(sid,M.date);
      return h('div',{className:'modal-overlay',onClick:()=>setModal(null)},h('div',{className:'modal',style:{width:620,maxWidth:'96vw'},onClick:e=>e.stopPropagation()},
      h('div',{className:'modal-title'},'New appointment'),
      h('div',{className:'form-row cols3'},
        h('div',{className:'form-group'},h('label',null,'Mobile'),h('input',{className:'form-control',list:'ap-phones',value:M.phone,autoFocus:true,onChange:e=>{const v=e.target.value;const cl=fdP10(v).length===10?fdClients(sid).find(x=>fdP10(x.phone)===fdP10(v)):null;setModal({...M,phone:v,client:M.client||(cl?cl.name:'')});}}),
          typeof NoShowNote==='function'&&h(NoShowNote,{sid,phone:M.phone})),
        h('div',{className:'form-group'},h('label',null,'Guest name'),h('input',{className:'form-control',list:'ap-names',value:M.client,onChange:e=>{const v=e.target.value;const cl=fdClients(sid).find(x=>x.name===v);setModal({...M,client:v,phone:M.phone||(cl?cl.phone:'')});}})),
        h('div',{className:'form-group'},h('label',null,'Date'),h('input',{type:'date',className:'form-control',value:M.date,onChange:e=>setModal({...M,date:e.target.value})}))),
      h('datalist',{id:'ap-phones'},fdClients(sid).slice(0,400).map(x=>h('option',{key:x.id,value:x.phone},x.name))),h('datalist',{id:'ap-names'},fdClients(sid).slice(0,400).map(x=>h('option',{key:x.id,value:x.name},x.phone))),
      c&&h('div',{style:{fontSize:12,color:'var(--text2)',margin:'-4px 0 8px'}},'👤 '+c.name+' · '+(fdClientStats(c,fdBills(sid)).visits)+' visit(s)'+(c.stylist||c.prefStylist?' · prefers '+(c.prefStylist||c.stylist):'')+(c.allergies?' · ⚠ '+c.allergies:'')+(c.notes?' · '+c.notes:'')),
      M.lines.map((l,i)=>h('div',{key:i,style:{display:'flex',gap:6,alignItems:'center',marginBottom:6,flexWrap:'wrap'}},
        h('select',{className:'form-control',style:{flex:'1 1 200px'},value:l.service,onChange:e=>setModal({...M,lines:M.lines.map((z,j)=>j===i?{...z,service:e.target.value}:z)})},menu.map(m=>h('option',{key:m.id,value:m.name},m.name+' · '+m.duration+'m · '+FD_M(m.rate)))),
        h('select',{className:'form-control',style:{width:170},value:l.staffId,onChange:e=>setModal({...M,lines:M.lines.map((z,j)=>j===i?{...z,staffId:e.target.value}:z)})},dayStaff.map(s=>{const off=fdStaffOff(sid,s,M.date);return h('option',{key:s.id,value:s.id,disabled:!!off},s.name+(off?' — '+off:''));})),
        i>0&&h('label',{style:{fontSize:11.5,display:'flex',gap:4,alignItems:'center'}},h('input',{type:'checkbox',checked:!!l.parallel,onChange:e=>setModal({...M,lines:M.lines.map((z,j)=>j===i?{...z,parallel:e.target.checked}:z)})}),'same time'),
        M.lines.length>1&&h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>setModal({...M,lines:M.lines.filter((_,j)=>j!==i)})},'✕'))),
      h('button',{className:'btn btn-ghost btn-sm',style:{marginBottom:8},onClick:()=>setModal({...M,lines:[...M.lines,{service:(menu[0]||{}).name||'',staffId:M.lines[M.lines.length-1].staffId}]})},'+ Another service'),
      h('div',{className:'form-row cols3'},
        h('div',{className:'form-group'},h('label',null,'Start'),h('select',{className:'form-control',value:M.start,onChange:e=>setModal({...M,start:Number(e.target.value)})},slots.map(m=>h('option',{key:m,value:m},fdHM(m))))),
        h('div',{className:'form-group'},h('label',null,'Booked via'),h('select',{className:'form-control',value:M.source,onChange:e=>setModal({...M,source:e.target.value})},['Phone','Walk-in','WhatsApp','Online','Instagram'].map(x=>h('option',{key:x},x)))),
        h('div',{className:'form-group'},h('label',null,'Note'),h('input',{className:'form-control',value:M.notes,onChange:e=>setModal({...M,notes:e.target.value})}))),
      h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',fontSize:12.5,marginBottom:6}},'Repeat every',h('select',{className:'form-control',style:{width:110,padding:'3px 6px'},value:M.repeatEvery,onChange:e=>setModal({...M,repeatEvery:Number(e.target.value)})},[[0,'— no repeat —'],[1,'1 week'],[2,'2 weeks'],[3,'3 weeks'],[4,'4 weeks'],[6,'6 weeks'],[8,'8 weeks']].map(([v,l])=>h('option',{key:v,value:v},l))),
        Number(M.repeatEvery)>0&&h('span',null,'for ',h('input',{type:'number',min:1,max:26,className:'form-control',style:{width:60,padding:'3px 6px',display:'inline-block'},value:M.repeatTimes,onChange:e=>setModal({...M,repeatTimes:e.target.value})}),' more time(s)')),
      M.lines.map(l=>fdPatchTestOk(sid,M.phone,l.service)).filter(Boolean).map((w,i)=>h('div',{key:'pt'+i,style:{fontSize:12,color:'var(--red)',fontWeight:600}},'⚠ '+w)),
      h('div',{className:'help-note'},(()=>{let tt=Number(M.start),amt=0;M.lines.forEach(l=>{if(!l.parallel)tt+=fdDuration(sid,l.service);amt+=fdRateOf(sid,l.service);});return 'Finishes about '+fdHM(tt)+' · '+FD_M(amt);})()),
      h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:()=>setModal(null)},'Cancel'),h('button',{className:'btn btn-primary',onClick:saveBooking},'Book'))));})(),
    modal&&modal.mode==='view'&&(()=>{const a=appts.find(x=>x.id===modal.a.id)||modal.a;return h('div',{className:'modal-overlay',onClick:()=>setModal(null)},h('div',{className:'modal',style:{width:440},onClick:e=>e.stopPropagation()},
      h('div',{className:'modal-title'},a.client),
      [['Service',a.service+((fdMenuItem(sid,a.service)||{}).resource?' · '+(fdMenuItem(sid,a.service)||{}).resource:'')],['Time',fdHM(a.start)+' – '+fdHM(a.start+a.dur)],['Stylist',a.staff],['Mobile',a.phone||'—'],['Booked via',a.source],['Value',FD_M(a.rate)],['Note',a.notes||'—'],['Status',a.status+(a.billId?' · bill '+a.billId:'')]].map(([k,v])=>h('div',{key:k,className:'kv'},h('span',null,k),h('span',null,v))),
      h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginTop:14}},['Confirmed','In chair','No-show','Cancelled'].map(s=>h('button',{key:s,className:'btn btn-sm '+(s==='No-show'||s==='Cancelled'?'btn-danger':'btn-ghost'),onClick:()=>setStatus(a,s)},s)),
        !a.billId&&a.status!=='Cancelled'&&h('button',{className:'btn btn-primary btn-sm',onClick:()=>billNow(a)},'🧾 Done → Bill now'),
        a.seriesId&&h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>{if(!window.confirm('Cancel this and every later booking of the series?'))return;setBook(b=>{const nb={};Object.keys(b).forEach(k=>{const d0=k.split('|')[1];nb[k]=(b[k]||[]).map(x=>x.seriesId===a.seriesId&&d0>=date&&x.status!=='Done'?{...x,status:'Cancelled'}:x);});return nb;});setModal(null);}},'Cancel series'),
        a.phone&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>fdWa(a.phone,'Hi '+String(a.client).split(' ')[0]+', your '+a.service+' at '+salonName+' is on '+fdPrettyD(date)+' at '+fdHM(a.start)+'.')},'📲 WhatsApp')),
      h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:()=>setModal(null)},'Close'))));})(),
    bill&&h(BillEditor,{sid,initial:bill.initial,onSave:onBillSaved,onClose:()=>setBill(null)}));
}
