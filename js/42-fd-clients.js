// ═════════════════════════════════════════════════════════════════════════════════════════════
// Clients — add / edit / import from Excel, filled automatically from bills and bookings; visits,
// spend, last visit, usual service and stylist worked out from the bills; visit history; preferences
// (formula, allergies, stylist), photos; membership & package sold through a real bill; loyalty
// points; ratings; merge duplicates; no-marketing flag. Same storage: salonos_clients_outlet_<id>.
// ═════════════════════════════════════════════════════════════════════════════════════════════
function fdShrinkPhoto(file,size){return new Promise((res,rej)=>{const img=new Image();const url=URL.createObjectURL(file);
  img.onload=()=>{const s=size||360;const k=Math.min(1,s/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);res(c.toDataURL('image/jpeg',0.72));};
  img.onerror=()=>rej(new Error('Could not read the photo'));img.src=url;});}
// Merge clients sharing a phone: the most complete record stays; visits / notes / photos are combined.
function fdMergeDuplicates(sid){
  const L=fdClients(sid);const by={};L.forEach(c=>{const p=fdP10(c.phone);if(p.length!==10)return;(by[p]=by[p]||[]).push(c);});let merged=0;const drop=new Set();
  Object.values(by).forEach(g=>{if(g.length<2)return;g.sort((a,b)=>Object.keys(b).length-Object.keys(a).length);const keep=g[0];
    g.slice(1).forEach(d=>{Object.keys(d).forEach(k=>{if(keep[k]===undefined||keep[k]===''||keep[k]===null)keep[k]=d[k];});keep.notes=[keep.notes,d.notes].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(' · ');
      keep.photos=[...(keep.photos||[]),...(d.photos||[])].slice(0,8);keep.points=(Number(keep.points)||0)+(Number(d.points)||0);keep.packageBalance=(Number(keep.packageBalance)||0)+(Number(d.packageBalance)||0);drop.add(d.id);merged++;});});
  if(merged){fdSaveClients(sid,L.filter(c=>!drop.has(c.id)));try{logAuditEvent(sid,{entity:'Client',entityId:'merge',action:'Duplicates merged',summary:merged+' record(s)'});}catch(e){}}
  return merged;
}
function fdImportClientRows(sid,rows){
  const L=fdClients(sid);let added=0,updated=0;const lk=o=>{const m={};Object.keys(o||{}).forEach(k=>{m[String(k).trim().toLowerCase()]=o[k];});return m;};
  rows.forEach(r0=>{const r=lk(r0);const name=String(r['name']||r['client']||r['client name']||r['customer']||'').trim();const phone=fdP10(r['mobile']||r['phone']||r['contact']||r['mobile no']||r['mobile number']);
    if(!name&&phone.length!==10)return;const bd=r['birthday']||r['dob']||r['date of birth'];const bdS=bd instanceof Date?bd.getDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][bd.getMonth()]:String(bd||'').trim();
    const i=phone.length===10?L.findIndex(c=>fdP10(c.phone)===phone):-1;const data={name,phone,email:String(r['email']||'').trim(),birthday:bdS,notes:String(r['notes']||r['note']||'').trim(),gender:String(r['gender']||'').trim()};
    if(i>=0){Object.keys(data).forEach(k=>{if(data[k]&&!L[i][k])L[i][k]=data[k];});updated++;}else{L.push({id:fdNextClientId(L),tier:'None',visits:0,spend:0,source:'Import',createdAt:new Date().toISOString(),...data});added++;}});
  fdSaveClients(sid,L);return{added,updated};
}
function ClientForm({sid,client,onClose,onSaved}){
  const h=React.createElement;const {toast}=useToast();const staff=fdStaff(sid);
  const [f,setF]=useState(()=>({name:'',phone:'',email:'',gender:'',birthday:'',anniversary:'',prefStylist:'',formula:'',allergies:'',notes:'',tags:'',optOut:false,photos:[],patchTests:[],referredBy:'',familyId:'',...(client||{})}));const [pt,setPt]=useState({date:fdTodayIso(),service:'',result:'Clear',photo:''});
  const others=fdClients(sid).filter(x=>x.id!==(client&&client.id));
  const fc=k=>e=>setF(x=>({...x,[k]:e.target.type==='checkbox'?e.target.checked:e.target.value}));
  const save=()=>{if(!f.name.trim())return toast('Name is required','error');const p=fdP10(f.phone);if(f.phone&&p.length!==10)return toast('Mobile must have 10 digits','error');
    const L=fdClients(sid);if(p&&L.some(c=>fdP10(c.phone)===p&&c.id!==f.id))return toast('Another client already has this mobile — open that client or merge duplicates','error');
    if(f.id){fdSaveClients(sid,L.map(c=>c.id===f.id?{...c,...f,phone:p||f.phone}:c));}else{L.push({...f,id:fdNextClientId(L),phone:p,tier:'None',visits:0,spend:0,source:'Added',createdAt:new Date().toISOString()});fdSaveClients(sid,L);}
    toast('Client saved','success');onSaved&&onSaved();onClose();};
  const addPhoto=async e=>{const file=e.target.files&&e.target.files[0];e.target.value='';if(!file)return;try{const d=await fdShrinkPhoto(file,360);setF(x=>({...x,photos:[...(x.photos||[]),{dataUrl:d,name:'photo-'+Date.now()+'.jpg',at:fdTodayIso()}].slice(-8)}));}catch(err){toast(err.message,'error');}};
  const fld=(k,l,t,ph)=>h('div',{className:'form-group'},h('label',null,l),h('input',{type:t||'text',className:'form-control',value:f[k]||'',placeholder:ph||'',onChange:fc(k)}));
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:640,maxWidth:'96vw',maxHeight:'92vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},f.id?'Edit client':'New client'),
    h('div',{className:'form-row cols3'},fld('name','Name *'),fld('phone','Mobile','tel','98xxxxxxxx'),fld('email','Email','email')),
    h('div',{className:'form-row cols3'},fld('birthday','Birthday','text','e.g. 12 Jan'),fld('anniversary','Anniversary','text','e.g. 5 Dec'),
      h('div',{className:'form-group'},h('label',null,'Gender'),h('select',{className:'form-control',value:f.gender||'',onChange:fc('gender')},['','Female','Male','Other'].map(g=>h('option',{key:g,value:g},g||'—'))))),
    h('div',{className:'form-row cols2'},h('div',{className:'form-group'},h('label',null,'Preferred stylist'),h('select',{className:'form-control',value:f.prefStylist||'',onChange:fc('prefStylist')},h('option',{value:''},'—'),staff.map(s=>h('option',{key:s.id,value:s.name},s.name)))),fld('tags','Tags','text','e.g. bride, corporate')),
    h('div',{className:'form-row cols2'},fld('formula','Colour formula / technical notes'),fld('allergies','Allergies / sensitivities')),
    fld('notes','Notes'),
    h('div',{className:'form-row cols2'},h('div',{className:'form-group'},h('label',null,'Referred by'),h('select',{className:'form-control',value:f.referredBy||'',onChange:fc('referredBy')},h('option',{value:''},'—'),others.map(x=>h('option',{key:x.id,value:x.id},x.name+(x.phone?' · '+x.phone:''))))),
      h('div',{className:'form-group'},h('label',null,'Family of'),h('select',{className:'form-control',value:'',onChange:e=>{const o=others.find(x=>x.id===e.target.value);if(!o)return;const fid=o.familyId||('FAM'+Date.now());if(!o.familyId)fdSaveClients(sid,fdClients(sid).map(x=>x.id===o.id?{...x,familyId:fid}:x));setF(x=>({...x,familyId:fid}));}},
        h('option',{value:''},f.familyId?'Linked ('+fdClients(sid).filter(x=>x.familyId===f.familyId&&x.id!==f.id).map(x=>x.name).join(', ')+') — change…':'— link to a family member —'),others.map(x=>h('option',{key:x.id,value:x.id},x.name))),
        f.familyId&&h('button',{className:'btn btn-ghost btn-sm',style:{padding:'0 4px'},onClick:()=>setF(x=>({...x,familyId:''}))},'Unlink'))),
    h('div',{style:{marginTop:8}},h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:4}},'Patch tests & consent'),
      (f.patchTests||[]).map((p,i)=>h('div',{key:i,style:{display:'flex',gap:6,alignItems:'center',fontSize:12.5,padding:'2px 0'}},h('span',{style:{flex:1}},p.date.split('-').reverse().join('/')+' · '+(p.service||'patch test')+' · ',h('b',{style:{color:p.result==='Reaction'?'var(--red)':'var(--green)'}},p.result)),
        p.photo&&h(FdImg,{src:fdPhotoSrc(p.photo),style:{height:28,width:40,objectFit:'cover',borderRadius:4}}),h('button',{className:'btn btn-ghost btn-sm',style:{padding:'0 4px'},onClick:()=>setF(x=>({...x,patchTests:x.patchTests.filter((_,j)=>j!==i)}))},'✕'))),
      h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',marginTop:4}},h('input',{type:'date',className:'form-control',style:{width:140,padding:'3px 6px'},value:pt.date,onChange:e=>setPt({...pt,date:e.target.value})}),
        h('input',{className:'form-control',style:{width:150,padding:'3px 6px'},placeholder:'Product / service',value:pt.service,onChange:e=>setPt({...pt,service:e.target.value})}),
        h('select',{className:'form-control',style:{width:100,padding:'3px 6px'},value:pt.result,onChange:e=>setPt({...pt,result:e.target.value})},['Clear','Reaction'].map(r=>h('option',{key:r},r))),
        h('label',{className:'btn btn-ghost btn-sm',style:{cursor:'pointer'}},pt.photo?'✓ Consent photo':'📷 Consent form',h('input',{type:'file',accept:'image/*',style:{display:'none'},onChange:async e=>{const file=e.target.files&&e.target.files[0];e.target.value='';if(file){try{setPt(p=>({...p,photo:''}));const d=await fdShrinkPhoto(file,600);setPt(p=>({...p,photo:{dataUrl:d,name:'consent-'+Date.now()+'.jpg'}}));}catch(err){}}}})),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{if(!pt.date)return;setF(x=>({...x,patchTests:[...(x.patchTests||[]),{...pt,by:(currentSessionUser()||{}).name||''}]}));setPt({date:fdTodayIso(),service:'',result:'Clear',photo:''});}},'+ Add'))),
    h('label',{style:{display:'flex',gap:8,alignItems:'center',fontSize:13,margin:'6px 0'}},h('input',{type:'checkbox',checked:!!f.marketingConsent,onChange:e=>setF(x=>({...x,marketingConsent:e.target.checked?{at:new Date().toISOString(),by:(currentSessionUser()||{}).name||''}:null,optOut:e.target.checked?false:x.optOut}))}),'Agreed to receive offers on WhatsApp / SMS'+(f.marketingConsent&&f.marketingConsent.at?' ('+new Date(f.marketingConsent.at).toLocaleDateString('en-IN')+')':'')),
    h('label',{style:{display:'flex',gap:8,alignItems:'center',fontSize:13,margin:'6px 0'}},h('input',{type:'checkbox',checked:!!f.optOut,onChange:e=>setF(x=>({...x,optOut:e.target.checked,marketingConsent:e.target.checked?null:x.marketingConsent}))}),'Does not want offers / marketing messages'),
    h('div',{style:{marginTop:8}},h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:4}},'Photos (before / after)'),
      h('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},(f.photos||[]).map((p,i)=>h('div',{key:i,style:{position:'relative'}},h(FdImg,{src:fdPhotoSrc(p),style:{width:84,height:84,objectFit:'cover',borderRadius:8}}),
        h('button',{className:'btn btn-ghost btn-sm',style:{position:'absolute',top:0,right:0,padding:'0 4px',background:'rgba(255,255,255,0.8)'},onClick:()=>setF(x=>({...x,photos:x.photos.filter((_,j)=>j!==i)}))},'✕'))),
        h('label',{className:'btn btn-ghost btn-sm',style:{height:84,width:84,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}},'+ Photo',h('input',{type:'file',accept:'image/*',style:{display:'none'},onChange:addPhoto})))),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Cancel'),h('button',{className:'btn btn-primary',onClick:save},'Save'))));
}
function ClientCRM({salon}){
  const h=React.createElement;const {toast}=useToast();const sid=Number(salon&&salon.id)||1;
  const [tick,setTick]=useState(0);const refresh=()=>setTick(t=>t+1);
  const [q,setQ]=useState('');const [seg,setSeg]=useState('All');const [sel,setSel]=useState(null);const [form,setForm]=useState(null);const [bill,setBill]=useState(null);const [wa,setWa]=useState(null);
  const [memOpen,setMemOpen]=useState(false);const [simOpen,setSimOpen]=useState(false);const [lim,setLim]=useState(150);const [hoOpen,setHoOpen]=useState(false);const [regOpen,setRegOpen]=useState(null);const [consult,setConsult]=useState(null);const [growOpen,setGrowOpen]=useState(false);const [msgOpen,setMsgOpen]=useState(false);const [campOpen,setCampOpen]=useState(false);const importRef=useRef(null);const [,setLiveTick]=useState(0); // redraw with other users' saves without re-mounting the list
  useEffect(()=>{const v=fdTakeOpen('client',sid);if(v)setSel(v);const f=e=>{const d=e.detail||{};if(d.kind==='client'&&Number(d.sid)===sid){fdTakeOpen('client',sid);setSeg('All');setQ('');setSel(d.id);}};const g=e=>{if(!e.detail||Number(e.detail.sid)===sid)setLiveTick(x=>x+1);};window.addEventListener('fd-open',f);window.addEventListener('fd-clients-changed',g);return()=>{window.removeEventListener('fd-open',f);window.removeEventListener('fd-clients-changed',g);};},[sid]);
  const bills=fdBills(sid);const book=fdLoadBook(sid);
  const rows=fdClients(sid).map(c=>{const st=fdClientStats(c,bills);return{c,st,seg:fdSegOf(st),od:typeof fdOverdueDays==='function'?fdOverdueDays(sid,st):0};});
  const ql=q.trim().toLowerCase();const list=rows.filter(r=>(seg==='All'||r.seg===seg||(seg==='Due back'&&r.od>0))&&(!ql||String(r.c.name||'').toLowerCase().includes(ql)||String(r.c.phone||'').includes(ql)||String(r.c.tags||'').toLowerCase().includes(ql))).sort((a,b)=>b.st.spend-a.st.spend);
  const active=rows.filter(r=>r.st.since!=null&&r.st.since<=90).length;const lapsed=rows.filter(r=>r.seg==='Lapsed').length;const repeat=rows.filter(r=>r.st.visits>1).length;
  const members=rows.filter(r=>fdActiveMembership(sid,r.c.phone)||(r.c.tier&&r.c.tier!=='None')).length;const dups=(()=>{const s={};let n=0;rows.forEach(r=>{const p=fdP10(r.c.phone);if(p.length===10){if(s[p])n++;s[p]=1;}});return n;})();
  const cur=sel?rows.find(r=>r.c.id===sel):null;
  const importFile=async e=>{const file=e.target.files&&e.target.files[0];e.target.value='';if(!file)return;try{const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});const sh=wb.Sheets[wb.SheetNames[0]];const data=XLSX.utils.sheet_to_json(sh,{defval:''});
    const r=fdImportClientRows(sid,data);toast(r.added+' client(s) added, '+r.updated+' updated','success');refresh();}catch(err){toast('Could not read the file: '+(err.message||err),'error');}};
  const visits=c=>{const p=fdP10(c.phone);const out=[];fdClientStats(c,bills).bills.forEach(b=>out.push({date:b.date,kind:'Bill',text:(b.items||[]).map(it=>it.name).join(', '),amt:billCalc(b).total,who:b.staff,rating:b.rating,id:b.id}));
    if(p.length===10)Object.keys(book).forEach(k=>(book[k]||[]).forEach(a=>{if(fdP10(a.phone)===p&&!a.billId)out.push({date:k.split('|')[1],kind:a.status==='No-show'?'No-show':a.status==='Cancelled'?'Cancelled':'Booking',text:a.service,who:a.staff,id:a.id});}));
    return out.sort((a,b)=>String(b.date).localeCompare(String(a.date)));};
  const sellMembership=c=>{const items=fdMenu(sid).filter(m=>m.active!==false&&(m.type==='Membership'||m.type==='Package'));if(!items.length){toast('Add membership / package plans in Billing → ⚙ Menu & settings first','error');return;}
    setBill({initial:{customer:c.name,phone:c.phone,date:fdTodayIso(),items:[],paymentMode:'Cash',status:'Paid',discount:0},pick:items});};
  const onBillSaved=rec=>{const r=fdCreateBill(sid,rec);setBill(null);toast('Bill '+r.bill.id+' — '+FD_M(billCalc(r.bill).total)+(r.notes.length?' · '+r.notes.join(' · '):''),'success');refresh();};
  const del=c=>{if(!window.confirm('Delete '+c.name+'? Their bills stay; the client record, notes and photos go.'))return;fdSaveClients(sid,fdClients(sid).filter(x=>x.id!==c.id));try{logAuditEvent(sid,{entity:'Client',entityId:c.id,action:'Deleted',summary:c.name});}catch(e){}setSel(null);refresh();
    fdOfferUndo(sid,c.name+' deleted',()=>{fdSaveClients(sid,[...fdClients(sid),c]);try{logAuditEvent(sid,{entity:'Client',entityId:c.id,action:'Delete undone',summary:c.name});}catch(e){}window.dispatchEvent(new CustomEvent('fd-clients-changed',{detail:{sid}}));});};
  const templates=c=>{const first=String(c.name||'').split(' ')[0];const nm=String((salon&&salon.name)||'').split('—')[0].trim();const st=fdClientStats(c,bills);
    return{'Win back':'Hi '+first+', we have missed you at '+nm+'! It has been a while since your last '+(st.fav||'visit')+'. Reply BOOK and we will keep a slot for you this week.','Reminder':'Hi '+first+', just a reminder of your appointment with us. Reply YES to confirm.',
      'Birthday':'Happy birthday '+first+'! 🎉 Enjoy a complimentary cleanup with any service this month.','Thank you':'Thank you for visiting '+nm+', '+first+'! We would love your feedback — reply with a rating from 1 to 5.'};};
  const stat=(l,v,s2,col)=>h('div',{className:'metric-card'},h('div',{className:'metric-label'},l),h('div',{className:'metric-value',style:col?{color:col}:null},v),h('div',{className:'metric-sub'},s2));
  const segCls=s=>s==='VIP'?'badge-amber':s==='Lapsed'?'badge-red':s==='Regular'?'badge-green':'badge-blue';
  return h('div',{className:'fade-in',key:tick},
    h('div',{className:'section-header'},
      h('div',null,h('div',{className:'page-title'},'Clients'),h('div',{className:'page-sub'},'Built from bills and bookings — add, import or edit clients any time.')),
      h(FdToolbar,{sid,keep:[/Campaign/,/Registers/]},
        h('button',{className:'btn btn-primary btn-sm',onClick:()=>setForm({})},'+ New client'),
        h('button',{className:'btn btn-ghost btn-sm',title:'Excel with columns Name, Mobile, Email, Birthday, Notes',onClick:()=>importRef.current&&importRef.current.click()},'⬆ Import Excel'),h('input',{type:'file',accept:'.xlsx,.xls,.csv',ref:importRef,style:{display:'none'},onChange:importFile}),
        dups>0&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{if(!window.confirm(dups+' duplicate record(s) share a mobile number. Merge them?'))return;const n=fdMergeDuplicates(sid);toast(n+' merged','success');refresh();}},'🔗 Merge '+dups+' duplicate(s)'),
        (()=>{const g=typeof fdSimilarClients==='function'?fdSimilarClients(sid).length:0;return g?h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setSimOpen(true)},'🔍 Similar names ('+g+')'):null;})(),
        controlOn('fdRegisters',sid)&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setRegOpen('client')},'📒 Registers'),
        controlOn('stylistHandover',sid)&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setHoOpen(true)},'👋 Stylist left'),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setCampOpen(true)},'📣 Campaign'),
        typeof ClientGrowthModal==='function'&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setGrowOpen(true)},'🌱 Feedback & referrals'),
        typeof MembershipRegisterModal==='function'&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setMemOpen(true)},'💳 Memberships'),
        typeof ClientMessagesModal==='function'&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setMsgOpen(true)},'📣 Messages'))),
    campOpen&&h(FdCampaignModal,{sid,onClose:()=>setCampOpen(false)}),
    hoOpen&&h(FdHandoverModal,{sid,salonName:String((salon&&salon.name)||'').split('—')[0].trim(),onClose:()=>{setHoOpen(false);refresh();},onDone:refresh}),
    simOpen&&h(FdSimilarModal,{sid,onClose:()=>setSimOpen(false),onDone:refresh}),regOpen&&h(FdRegistersModal,{sid,initialTab:regOpen,onClose:()=>setRegOpen(null)}),h(FdRebookHost,{sid}),
    consult&&h(FdConsultModal,{sid,client:consult,onClose:()=>setConsult(null),onSaved:refresh}),
    memOpen&&h(MembershipRegisterModal,{salon,onClose:()=>{setMemOpen(false);refresh();}}),growOpen&&h(ClientGrowthModal,{salon,onClose:()=>setGrowOpen(false)}),
    msgOpen&&h(ClientMessagesModal,{salon,clients:rows.filter(r=>!r.c.optOut).map(r=>({...r.c,...r.st})),onClose:()=>setMsgOpen(false)}),
    h(FdTodayStrip,{sid}),
    h(FdBirthdayStrip,{sid,salonName:String((salon&&salon.name)||'').split('—')[0].trim(),onChanged:refresh}),
    h('div',{className:'grid4',style:{marginBottom:16}},stat('Clients',String(rows.length),members+' with membership / package'),stat('Active',String(active),'visited in 90 days','var(--green)'),
      stat('Lapsed',String(lapsed),lapsed?'worth a win-back message':'nobody drifting','var(--red)'),stat('Repeat',rows.length?Math.round(repeat/rows.length*100)+'%':'—','came more than once')),
    h('div',{className:'crm'},
      h('div',{className:'card'},
        h('input',{className:'form-control',placeholder:'Search name, mobile or tag…',value:q,onChange:e=>setQ(e.target.value),style:{marginBottom:10}}),
        typeof ClientFollowUps==='function'&&h(ClientFollowUps,{salon}),
        h('div',{className:'seg'},['All','VIP','Regular','New','Lapsed',...(controlOn('visitGapWinback',sid)?['Due back']:[])].map(s=>h('button',{key:s,className:seg===s?'on':'',title:s==='Due back'?'Past their own usual gap between visits':'',onClick:()=>setSeg(s)},s,s!=='All'?' · '+rows.filter(r=>s==='Due back'?r.od>0:r.seg===s).length:''))),
        h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',margin:'6px 0'}},h(FdMoreBar,{shown:Math.min(lim,list.length),total:list.length,onMore:()=>setLim(l=>l+300)}),
          controlOn('filterChips',sid)&&(seg!=='All'||q)&&[seg!=='All'&&h('span',{key:'s',className:'badge',style:{background:'var(--accent)',color:'#fff',cursor:'pointer'},onClick:()=>setSeg('All')},seg+' ✕'),q&&h('span',{key:'q',className:'badge',style:{background:'var(--accent)',color:'#fff',cursor:'pointer'},onClick:()=>setQ('')},'“'+q+'” ✕')]),
        h('div',{style:{maxHeight:480,overflowY:'auto'}},list.length?list.slice(0,lim).map(r=>h('div',{key:r.c.id,className:'cl-row '+(sel===r.c.id?'on':''),onClick:()=>setSel(r.c.id)},
          h('div',{className:'cl-av'},String(r.c.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2)),
          h('div',{style:{minWidth:0}},h('div',{className:'cl-nm'},r.c.name,r.c.optOut&&h('span',{style:{fontSize:10,color:'var(--text3)',marginLeft:4}},'🔕'),r.od>0&&h('span',{style:{fontSize:10,color:'var(--orange)',marginLeft:4},title:'Due back by their usual gap'},'⏳')),h('div',{className:'cl-sub'},(r.c.phone?fdShowPhone(sid,r.c.phone)+' · ':'')+r.st.visits+' visit(s)'+(r.st.since!=null?' · last '+(r.st.since===0?'today':r.st.since+'d ago'):'')+(r.st.stylist?' · '+String(r.st.stylist).split(' ')[0]:''))),
          h('div',{className:'cl-amt'},FD_M(r.st.spend),h('div',null,h('span',{className:'badge '+segCls(r.seg)},r.seg)))))
          :h('div',{className:'empty-state'},h('div',{className:'empty-icon'},'👥'),h('div',{className:'empty-title'},rows.length?'No clients match':'No clients yet'),h('div',{className:'empty-sub'},rows.length?'Try another search or segment.':'Add a client, import an Excel list, or they appear automatically from bills and bookings.')))),
      h('div',{className:'card'},!cur?h('div',{className:'empty-state'},h('div',{className:'empty-icon'},'👤'),h('div',{className:'empty-title'},'Pick a client'),h('div',{className:'empty-sub'},'History, preferences, membership and messages appear here.'))
        :(()=>{const c=cur.c,st=cur.st;const mem=fdActiveMembership(sid,c.phone);const pkg=fdPackageLeft(sid,c.phone);const V=visits(c);const ns=typeof noShowCount==='function'?noShowCount(sid,c.phone):0;const rated=V.filter(v=>Number(v.rating)>0);
          return h('div',null,
            h('div',{style:{display:'flex',gap:12,alignItems:'center',marginBottom:12}},h('div',{className:'cl-av',style:{width:44,height:44,fontSize:14}},String(c.name).split(' ').map(w=>w[0]).join('').slice(0,2)),
              h('div',{style:{minWidth:0}},h('div',{style:{fontSize:16}},c.name),h('div',{className:'cl-sub'},(c.phone?fdShowPhone(sid,c.phone):'no mobile')+(c.email?' · '+c.email:'')+' · '+c.id)),h('span',{className:'badge '+segCls(cur.seg),style:{marginLeft:'auto'}},cur.seg)),
            [['Lifetime spend',FD_M(st.spend)],['Visits',st.visits],['Average bill',st.visits?FD_M(st.spend/st.visits):'—'],['Last visit',st.last?String(st.last).split('-').reverse().join('/')+' ('+st.since+'d)':'—'],['Usual service',st.fav||'—'],['Stylist',c.prefStylist||st.stylist||'—'],
              ['Membership',mem?(mem.plan||'Membership')+' till '+String(mem.validTill||'').split('-').reverse().join('/'):(c.tier&&c.tier!=='None'?c.tier+(c.tierValidTill?' till '+c.tierValidTill.split('-').reverse().join('/'):''):'—')],['Package balance',pkg?FD_M(pkg):'—'],
              controlOn('loyaltyPoints',sid)?['Points',String(Number(c.points)||0)]:null,ns?['No-shows',String(ns)]:null,rated.length?['Rating',(rated.reduce((s,v)=>s+Number(v.rating),0)/rated.length).toFixed(1)+'★ ('+rated.length+')']:null,
              c.birthday?['Birthday',c.birthday]:null,c.anniversary?['Anniversary',c.anniversary]:null].filter(Boolean).map(([k,v])=>h('div',{key:k,className:'kv'},h('span',null,k),h('span',null,v))),
            (c.formula||c.allergies||c.notes||c.tags)&&h('div',{className:'help-note',style:{marginTop:10}},c.allergies&&h('div',{style:{color:'var(--red)'}},'⚠ '+c.allergies),c.formula&&h('div',null,'🎨 '+c.formula),c.notes&&h('div',null,'📝 '+c.notes),c.tags&&h('div',null,'🏷 '+c.tags)),
            (()=>{const fam=c.familyId?fdClients(sid).filter(x=>x.familyId===c.familyId&&x.id!==c.id):[];const refs=fdClients(sid).filter(x=>x.referredBy===c.id);const by=c.referredBy?fdClients(sid).find(x=>x.id===c.referredBy):null;const pts=(c.patchTests||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
              return(fam.length||refs.length||by||pts.length)?h('div',{style:{fontSize:12.5,marginTop:10,display:'grid',gap:3}},fam.length>0&&h('div',null,'👪 Family: '+fam.map(x=>x.name).join(', ')+(controlOn('familySharing',sid)?' (package & membership shared)':'')),
                by&&h('div',null,'🤝 Referred by '+by.name),refs.length>0&&h('div',null,'🤝 Referred '+refs.length+': '+refs.map(x=>x.name).join(', ')+((c.referralCredits||[]).length?' · credits '+FD_M((c.referralCredits||[]).reduce((s,x)=>s+x.amount,0)):'')),
                pts.length>0&&h('div',{style:{color:pts[0].result==='Reaction'?'var(--red)':'var(--text2)'}},'🧪 Last patch test '+pts[0].date.split('-').reverse().join('/')+' — '+pts[0].result+(pts[0].service?' ('+pts[0].service+')':''))):null;})(),
            (c.photos||[]).length>0&&h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginTop:10}},c.photos.map((p,i)=>h(FdImg,{key:i,src:fdPhotoSrc(p),title:p.at,style:{width:72,height:72,objectFit:'cover',borderRadius:8}}))),
            cur.od>0&&h('div',{style:{fontSize:12.5,marginTop:8,color:'var(--orange)'}},'⏳ Usually visits every '+fdVisitGap(st)+' days — now '+st.since+' days since the last visit.'),
            fdPendingFees(sid,c.phone).length>0&&h('div',{style:{fontSize:12.5,marginTop:4,color:'var(--orange)'}},'🚫 No-show fee pending: '+FD_M(fdPendingFees(sid,c.phone).reduce((s2,x)=>s2+x.amount,0))),
            fdOpenAdvances(sid,c.phone).length>0&&h('div',{style:{fontSize:12.5,marginTop:4,color:'var(--green)'}},'💰 Advance held: '+FD_M(fdOpenAdvances(sid,c.phone).reduce((s2,x)=>s2+x.amount,0))),
            controlOn('consultForm',sid)&&h('div',{style:{fontSize:12.5,marginTop:8,display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}},c.consult?h('span',{style:{color:FD_CONSULT_Q.some(([k])=>(c.consult.answers||{})[k]==='Yes')?'var(--red)':''}},'📝 Consultation '+new Date(c.consult.at).toLocaleDateString('en-IN')+(FD_CONSULT_Q.some(([k])=>(c.consult.answers||{})[k]==='Yes')?' — ⚠ '+FD_CONSULT_Q.filter(([k])=>(c.consult.answers||{})[k]==='Yes').map(([k])=>k+((c.consult.details||{})[k]?': '+c.consult.details[k]:'')).join(' · '):' — all clear')):h('span',{style:{color:'var(--orange)'}},'📝 No consultation form'),
              h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setConsult(c)},c.consult?'Redo':'Fill now')),
            h(FdFormulaCard,{sid,phone:c.phone}),
            h(FdPrefsCard,{sid,phone:c.phone}),
            (()=>{const SP=typeof fdSessionPacks==='function'?fdSessionPacks(sid,c.phone):[];return SP.length?h('div',{style:{fontSize:12.5,marginTop:6,color:'var(--green)'}},'🎟 '+SP.map(m=>(m.plan||'Package')+': '+fdSessionLeft(m)+' of '+m.sessions+' '+(m.sessionService||'')+' left').join(' · ')):null;})(),
            h('div',{style:{display:'flex',gap:6,marginTop:12,flexWrap:'wrap'}},
              h('button',{className:'btn btn-primary btn-sm',onClick:()=>setBill({initial:{customer:c.name,phone:c.phone,date:fdTodayIso(),items:[],paymentMode:'Cash',status:'Paid',discount:0}})},'🧾 New bill'),
              h('button',{className:'btn btn-ghost btn-sm',onClick:()=>sellMembership(c)},'💳 Sell membership / package'),
              c.phone&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setWa(c)},'📲 WhatsApp'),
              c.phone&&controlOn('clientBalanceLink',sid)&&h('button',{className:'btn btn-ghost btn-sm',title:'Send the client a page with their package balance, points and bookings',onClick:()=>fdWa(c.phone,'Hi '+String(c.name).split(' ')[0]+', your balance and bookings at '+String((salon&&salon.name)||'').split('—')[0].trim()+': '+fdBalanceLink(sid,c))},'🔗 Balance link'),
              h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setForm(c)},'✏ Edit'),h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>del(c)},'Delete'),
              isSuperAdminUser(currentSessionUser())&&h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},title:'On the client’s request: removes name, mobile, notes and photos; bills stay without them',onClick:()=>{if(!window.confirm('Erase '+c.name+'’s personal data on their request?\n\nName, mobile, notes, photos and patch tests are removed; bills and bookings stay with “Erased client”. This cannot be undone.'))return;const err=fdEraseClient(sid,c.id);if(err)return toast(err,'error');toast('Personal data erased','success');setSel(null);refresh();}},'🗑 Erase data')),
            h('div',{style:{fontWeight:700,margin:'14px 0 6px'}},'History ('+V.length+')'),
            !V.length?h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No bills or bookings on this mobile yet.'):h('div',{style:{maxHeight:260,overflowY:'auto'}},V.slice(0,60).map((v,i)=>h('div',{key:i,style:{display:'flex',gap:8,padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:12.5}},
              h('span',{style:{width:80,color:'var(--text3)'}},String(v.date).split('-').reverse().join('/')),h('span',{className:'badge '+(v.kind==='Bill'?'badge-green':v.kind==='No-show'?'badge-red':'badge-gray'),style:{fontSize:10}},v.kind),
              h('span',{style:{flex:1}},v.text+(v.who?' · '+v.who:'')),v.amt!=null&&h('b',null,FD_M(v.amt)),Number(v.rating)>0&&h('span',null,v.rating+'★')))));})())),
    form&&h(ClientForm,{sid,client:form.id?form:null,onClose:()=>setForm(null),onSaved:refresh}),
    bill&&h(BillEditor,{sid,initial:bill.initial,onSave:onBillSaved,onClose:()=>setBill(null)}),
    wa&&h('div',{className:'modal-overlay',onClick:()=>setWa(null)},h('div',{className:'modal',onClick:e=>e.stopPropagation()},
      h('div',{className:'modal-title'},'Message '+wa.name),wa.optOut&&h('div',{className:'help-note',style:{color:'var(--orange)'}},'🔕 This client does not want offers — send only service messages.'),
      Object.entries(templates(wa)).map(([k,t])=>h('div',{key:k,style:{marginBottom:12}},h('div',{style:{fontSize:11,color:'var(--text3)',textTransform:'uppercase',marginBottom:4}},k),
        h('div',{style:{background:'var(--bg3)',borderRadius:8,padding:'8px 10px',fontSize:12.5}},t),h('button',{className:'btn btn-primary btn-sm',style:{marginTop:4},onClick:()=>fdWa(wa.phone,t)},'📲 Send'))),
      h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:()=>setWa(null)},'Close')))));
}
