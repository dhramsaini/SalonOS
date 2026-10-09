// ═══════════════════════════════════════════════════════════════════════════════════════════
// Staff — paid leave balances (Attendance → Paid leave column), incentive "what if" simulator
// (Incentive Working → What if), and phone check-in with selfie and location (Attendance →
// 📲 Check-in). Each is switched on in Master Settings → 🎛 Controls (all outlets / outlet-wise).
// ═══════════════════════════════════════════════════════════════════════════════════════════
const ST_M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Paid leave ──
// Earned at the Controls rate for every month the employee is on the rolls in the financial year
// (April–March, no carry forward), less paid leave already used in earlier months of the year.
function leaveBalanceFor(sid,e,year,month){
  const rate=controlLimit('paidLeave')||1;const fyStart=month>=3?year:year-1;
  const att=loadAttendance(sid);let earned=0,used=0;
  for(let d=new Date(fyStart,3,1);d<=new Date(year,month,1);d=new Date(d.getFullYear(),d.getMonth()+1,1)){
    const y=d.getFullYear(),m=d.getMonth();const end=new Date(y,m+1,0);
    const doj=e.doj?new Date((toISO(e.doj)||e.doj)+'T00:00:00'):null,dol=e.dol?new Date((toISO(e.dol)||e.dol)+'T00:00:00'):null;
    if(doj&&doj>end)continue;if(dol&&dol<new Date(y,m,1))continue;
    earned+=rate;
    if(y!==year||m!==month)used+=Number((att[attMonthKey(e.id,y,m)]||{}).paidLeave)||0;}
  return{earned,used,available:Math.max(0,earned-used)};
}
function PaidLeaveCell({sid,e,year,month,rec,summary,onSet,locked}){
  const h=React.createElement;const b=leaveBalanceFor(sid,e,year,month);
  const unpaid=(summary.absent||0)+(summary.half||0)*0.5;const val=Number(rec&&rec.paidLeave)||0;
  const max=Math.min(unpaid,b.available);
  return h('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',gap:2}},
    h('input',{type:'number',min:0,max,step:0.5,value:val||'',placeholder:'0',disabled:locked||(!max&&!val),title:'Paid leave days from the balance (up to the absent days)',
      onChange:ev=>{let v=Number(ev.target.value)||0;if(v>max){window.alert('Only '+max+' day(s) can be paid: '+unpaid+' absent day(s), '+b.available+' leave day(s) available.');v=max;}onSet(v);},
      style:{width:52,textAlign:'center',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:4,color:'var(--text)',fontSize:11,padding:'3px 4px'}}),
    h('span',{style:{fontSize:9.5,color:'var(--text3)',whiteSpace:'nowrap'}},'bal '+Math.max(0,b.available-val)));
}

// ── Incentive "what if" ──
function IncentiveSimulator({salon,period}){
  const h=React.createElement;const sid=salon&&salon.id;
  const [cal,setCal]=useAfCal(period);
  const [d,setD]=useState({svc:0,prod:0,mem:0,gate:0});
  const rows=(incWorkingsFor(sid,cal.year,cal.month)||[]).filter(r=>(r.svcActual||r.prodActual||r.memActual));
  const pct=(a,t)=>t>0?a/t*100:100;
  const sim=rows.map(r=>{const cur=(r.svcIncAmt||0)+(r.prodIncAmt||0)+(r.memIncAmt||0);
    const ok=!d.gate||pct(r.totalActual,r.totalTarget)>=d.gate;
    const rate=(x,dx)=>Math.max(0,(Number(x)||0)+(Number(dx)||0));
    const svc=ok?r.svcActual*rate(r.svcRateUsed,d.svc)/100:0,prod=ok?r.prodActual*rate(r.prodRateUsed,d.prod)/100:0,mem=ok?r.memActual*rate(r.memRateUsed,d.mem)/100:0;
    const sale=(r.svcActual||0)+(r.prodActual||0)+(r.memActual||0);
    return{name:r.name,sale,cur,sim:Math.round(svc+prod+mem),ok,ach:pct(r.totalActual,r.totalTarget)};});
  const T=k=>sim.reduce((s,x)=>s+x[k],0);const sale=T('sale');
  const inp=(k,l,suf)=>h('div',{className:'form-group',style:{marginBottom:0}},h('label',null,l),h('div',{style:{display:'flex',alignItems:'center',gap:4}},
    h('input',{type:'number',step:0.5,className:'form-control',style:{width:90},value:d[k],onChange:e=>setD(x=>({...x,[k]:Number(e.target.value)||0}))}),h('span',{style:{fontSize:12,color:'var(--text3)'}},suf)));
  const m=n=>'₹'+Math.round(n).toLocaleString('en-IN');
  return h('div',null,
    h('div',{className:'section-header'},h('div',null,h('div',{className:'page-title'},'Incentive — what if'),
      h('div',{className:'page-sub'},'Try a different rate or a minimum target before changing the scheme. Uses this month’s actual sales from Incentive Working; nothing is saved.')),afMonthPicker(cal,setCal)),
    h('div',{className:'card',style:{display:'flex',gap:14,flexWrap:'wrap',alignItems:'flex-end',marginBottom:12}},
      inp('svc','Service rate change','% points'),inp('prod','Product rate change','% points'),inp('mem','Membership rate change','% points'),inp('gate','Pay only at target achieved ≥','%'),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setD({svc:0,prod:0,mem:0,gate:0})},'Reset')),
    !rows.length?h('div',{className:'help-note'},'No incentive sales for this month yet.'):h('div',null,
      h('div',{className:'grid4',style:{marginBottom:12}},
        h('div',{className:'metric-card blue'},h('div',{className:'metric-label'},'Incentive now'),h('div',{className:'metric-value',style:{fontSize:18}},m(T('cur'))),h('div',{style:{fontSize:11,color:'var(--text3)'}},sale?(T('cur')/sale*100).toFixed(1)+'% of sales':'')),
        h('div',{className:'metric-card teal'},h('div',{className:'metric-label'},'With the change'),h('div',{className:'metric-value',style:{fontSize:18}},m(T('sim'))),h('div',{style:{fontSize:11,color:'var(--text3)'}},sale?(T('sim')/sale*100).toFixed(1)+'% of sales':'')),
        h('div',{className:'metric-card '+(T('sim')>T('cur')?'red':'green')},h('div',{className:'metric-label'},'Difference a month'),h('div',{className:'metric-value',style:{fontSize:18}},(T('sim')>=T('cur')?'+':'−')+m(Math.abs(T('sim')-T('cur'))))),
        h('div',{className:'metric-card amber'},h('div',{className:'metric-label'},'Difference a year'),h('div',{className:'metric-value',style:{fontSize:18}},(T('sim')>=T('cur')?'+':'−')+m(Math.abs(T('sim')-T('cur'))*12)))),
      h('div',{className:'card',style:{padding:0}},h('div',{className:'table-wrap'},h('table',null,
        h('thead',null,h('tr',null,['Employee','Sales','Target achieved','Incentive now','With the change','Difference'].map((t,i)=>h('th',{key:i,style:i?{textAlign:'right'}:null},t)))),
        h('tbody',null,sim.map((x,i)=>h('tr',{key:i},h('td',null,x.name),h('td',{style:{textAlign:'right'}},m(x.sale)),h('td',{style:{textAlign:'right',color:x.ok?'':'var(--red)'}},Math.round(x.ach)+'%'),
          h('td',{style:{textAlign:'right'}},m(x.cur)),h('td',{style:{textAlign:'right',fontWeight:600}},m(x.sim)),h('td',{style:{textAlign:'right',color:x.sim>x.cur?'var(--red)':x.sim<x.cur?'var(--green)':''}},(x.sim>=x.cur?'+':'−')+m(Math.abs(x.sim-x.cur)))))))))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:8}},'Estimate: each person’s rate used this month ± the change, on their actual service / product / membership sales. Manager incentive, overtime and penalties are left out.'));
}

// ── Phone check-in ──
function checkinKey(sid){return outletKey('salonos_checkins',sid);}
function loadCheckins(sid){try{const v=JSON.parse(cachedLocalGet(checkinKey(sid))||'[]');return Array.isArray(v)?v:[];}catch(e){return[];}}
function saveCheckins(sid,list){safeLocalSet(checkinKey(sid),JSON.stringify((list||[]).slice(-1500)));}
function checkinPlaceKey(sid){return outletKey('salonos_checkin_place',sid);}
function loadCheckinPlace(sid){try{return JSON.parse(cachedLocalGet(checkinPlaceKey(sid))||'null');}catch(e){return null;}}
function geoDistanceM(a,b){const R=6371000,toR=x=>x*Math.PI/180;const dLat=toR(b.lat-a.lat),dLng=toR(b.lng-a.lng);
  const s=Math.sin(dLat/2)**2+Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLng/2)**2;return Math.round(2*R*Math.asin(Math.sqrt(s)));}
function currentPosition(){return new Promise((res,rej)=>{if(!navigator.geolocation)return rej(new Error('This phone cannot share its location.'));
  navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lng:p.coords.longitude,acc:Math.round(p.coords.accuracy)}),e=>rej(new Error(e.code===1?'Location permission was refused — allow it for this site.':'Could not get the location.')),{enableHighAccuracy:true,timeout:15000});});}
// A small square selfie (about 160 px) so it fits in storage.
function shrinkPhoto(file){return new Promise((res,rej)=>{const img=new Image();const url=URL.createObjectURL(file);
  img.onload=()=>{const s=160,c=document.createElement('canvas');c.width=s;c.height=s;const k=Math.min(img.width,img.height);c.getContext('2d').drawImage(img,(img.width-k)/2,(img.height-k)/2,k,k,0,0,s,s);URL.revokeObjectURL(url);res(c.toDataURL('image/jpeg',0.6));};
  img.onerror=()=>rej(new Error('Could not read the photo.'));img.src=url;});}
function CheckInKiosk({salon}){
  const h=React.createElement;const {toast}=useToast();const sid=salon&&salon.id;
  const today=new Date();const iso=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  const emps=(getEmployeesForMonth(today.getFullYear(),today.getMonth(),sid)||[]).filter(e=>e.status!=='Inactive');
  const [tick,setTick]=useState(0);const [who,setWho]=useState('');const [busy,setBusy]=useState(false);const camRef=useRef(null);const pending=useRef(null);
  const place=loadCheckinPlace(sid);const radius=controlLimit('phoneCheckin')||200;
  const list=loadCheckins(sid);const todays=list.filter(x=>x.date===iso);
  const lastOf=id=>todays.filter(x=>String(x.empId)===String(id)).pop();
  const u=currentSessionUser();const canSet=u&&(u.role==='Super Admin'||/manager|admin/i.test(u.role||''));
  const setPlace=async()=>{try{const p=await currentPosition();safeLocalSet(checkinPlaceKey(sid),JSON.stringify({lat:p.lat,lng:p.lng,at:new Date().toISOString()}));toast('Outlet location saved (accuracy about '+p.acc+' m)','success');setTick(t=>t+1);}catch(e){toast(e.message,'error');}};
  const start=(kind)=>{if(!who){toast('Choose your name first','error');return;}pending.current=kind;camRef.current&&camRef.current.click();};
  const onPhoto=async ev=>{const f=ev.target.files&&ev.target.files[0];ev.target.value='';if(!f)return;setBusy(true);
    try{const photo=await shrinkPhoto(f);let loc=null,dist=null;
      try{loc=await currentPosition();if(place)dist=geoDistanceM(place,loc);}catch(e){if(place){toast(e.message,'error');setBusy(false);return;}}
      if(place&&dist!=null&&dist>radius){toast('You are about '+dist+' m from the outlet (allowed '+radius+' m). Check in at the outlet.','error');setBusy(false);return;}
      const e=emps.find(x=>String(x.id)===String(who));
      const rec={id:'CI'+Date.now(),empId:who,name:e?e.name:'',date:iso,time:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),at:new Date().toISOString(),kind:pending.current,photo,dist,acc:loc?loc.acc:null};
      saveCheckins(sid,[...loadCheckins(sid),rec]);toast((rec.kind==='in'?'Checked in':'Checked out')+' — '+rec.name+' at '+rec.time,'success');setWho('');setTick(t=>t+1);
    }catch(e){toast(e.message||String(e),'error');}setBusy(false);};
  return h('div',{key:tick},
    h('div',{className:'section-header'},h('div',null,h('div',{className:'page-title'},'📲 Staff check-in'),
      h('div',{className:'page-sub'},'Keep this open on the outlet phone. Each person picks their name and takes a selfie; the location is checked against the outlet’s. The manager then applies check-ins to Attendance.'))),
    !place&&h('div',{className:'help-note',style:{marginBottom:12}},'Outlet location not set — check-ins are accepted from anywhere until it is. ',canSet&&h('button',{className:'btn btn-ghost btn-sm',onClick:setPlace},'📍 Set outlet location here')),
    place&&h('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'Outlet location set · allowed within '+radius+' m',canSet&&h('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:8},onClick:setPlace},'Reset location')),
    h('div',{className:'card',style:{maxWidth:460}},
      h('select',{className:'form-control',style:{fontSize:16,padding:12,marginBottom:12},value:who,onChange:e=>setWho(e.target.value)},h('option',{value:''},'— Choose your name —'),emps.map(e=>{const l=lastOf(e.id);return h('option',{key:e.id,value:e.id},e.name+(l?' ('+(l.kind==='in'?'in':'out')+' '+l.time+')':''));})),
      h('input',{type:'file',accept:'image/*',capture:'user',ref:camRef,style:{display:'none'},onChange:onPhoto}),
      h('div',{style:{display:'flex',gap:10}},
        h('button',{className:'btn btn-primary',style:{flex:1,fontSize:16,padding:14,justifyContent:'center'},disabled:busy,onClick:()=>start('in')},busy?'Checking…':'🟢 Check in'),
        h('button',{className:'btn btn-ghost',style:{flex:1,fontSize:16,padding:14,justifyContent:'center'},disabled:busy,onClick:()=>start('out')},'🔴 Check out'))),
    h('div',{style:{fontWeight:700,margin:'16px 0 8px'}},'Today — '+todays.length+' entr'+(todays.length===1?'y':'ies')),
    h('div',{style:{display:'flex',flexWrap:'wrap',gap:10}},todays.slice().reverse().map(x=>h('div',{key:x.id,className:'card',style:{display:'flex',gap:8,alignItems:'center',padding:8,margin:0}},
      x.photo&&h('img',{src:x.photo,alt:'',style:{width:44,height:44,borderRadius:8,objectFit:'cover'}}),
      h('div',{style:{fontSize:12}},h('b',null,x.name),h('div',{style:{color:x.kind==='in'?'var(--green)':'var(--text3)'}},(x.kind==='in'?'In ':'Out ')+x.time+(x.dist!=null?' · '+x.dist+' m':''))))))
  );
}
// Present days from check-ins that Attendance has not marked yet: [{empId,name,day}]
function pendingCheckinMarks(sid,year,month){
  const att=loadAttendance(sid);const pre=year+'-'+String(month+1).padStart(2,'0');
  const seen=new Set(),out=[];
  loadCheckins(sid).filter(x=>x.kind==='in'&&String(x.date).startsWith(pre)).forEach(x=>{const day=Number(x.date.slice(8,10));const k=x.empId+'|'+day;if(seen.has(k))return;seen.add(k);
    const rec=att[attMonthKey(x.empId,year,month)];const cur=rec&&rec.days?rec.days[day-1]:null;if(cur!=='present')out.push({empId:x.empId,name:x.name,day,cur});});
  return out;
}
