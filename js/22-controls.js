// ── Automation batch 4 (top five) ─────────────────────────────────────────────────────────────
// 17 Edit-after-the-fact alert — a Daily Sales & Exp figure changed more than 2 days after its date,
//    or a fully paid vendor bill edited / deleted, goes to the Audit Log (before → after) and the
//    nightly owner digest.
// 12 Petty cash limits — a daily cap per expense head (Daily Sales & Exp → ⚙ Cash limits); an entry
//    above it needs a reason and the owner's approval (Review Centre).
//  4 Membership & package liability (Clients → 💳 Memberships) — what clients have paid for and not
//    used yet: sold, redeemed, expired, outstanding.
//  8 Staff productivity (Incentive Working → Productivity) — revenue per working day, utilisation
//    from bookings, repeat-client share.
// 14 GST input credit check (P&L → GST Summary) — vendor bills against the GSTR-2B file.

const C4_M=['January','February','March','April','May','June','July','August','September','October','November','December'];
const c4Money=n=>(Number(n)<0?'-':'')+'₹'+Math.round(Math.abs(Number(n)||0)).toLocaleString('en-IN');
const c4Dmy=iso=>String(iso||'').split('-').reverse().join('/');
function c4User(){const u=currentSessionUser();return u?(u.name||u.email||''):'';}

// ── 17 · Late edits ──
const LATE_EDIT_DAYS=2;
function isLateEditDate(iso){const d=new Date(String(iso)+'T00:00:00');if(isNaN(d))return false;const t=new Date();t.setHours(0,0,0,0);return(t-d)/864e5>LATE_EDIT_DAYS;}
function logLateEdit(sid,iso,rowName,before,after){
  if(String(before||'')===String(after||''))return;
  if(!isLateEditDate(iso))return;
  try{logAuditEvent(sid,{entity:'Daily Sales',entityId:iso,action:'Late edit',summary:rowName+' on '+c4Dmy(iso)+': '+(before===''||before==null?'blank':c4Money(before))+' → '+(after===''||after==null?'blank':c4Money(after))});}catch(e){}
}
// Called from saveVendorInvoices for every bill that was fully paid before the change.
function logPaidBillChange(sid,oldInv,newInv){
  const paid=(Number(oldInv.amount)||0)>0&&(oldInv.payments||[]).reduce((t,p)=>t+(Number(p.paidAmount)||0),0)>=(Number(oldInv.amount)||0)-0.5;
  if(!paid)return;
  const lab='Bill '+(oldInv.invoiceNo||oldInv.id);
  try{
    if(!newInv)logAuditEvent(sid,{entity:'Vendor bill',entityId:String(oldInv.id),action:'Deleted paid bill',summary:lab+' ('+c4Money(oldInv.amount)+', fully paid) deleted'});
    else if(JSON.stringify(oldInv)!==JSON.stringify(newInv)){
      const ch=[];['amount','invoiceNo','invoiceDate','vendorId','taxable','cgst','sgst','igst'].forEach(k=>{if(String(oldInv[k]??'')!==String(newInv[k]??''))ch.push(k+' '+(oldInv[k]??'')+' → '+(newInv[k]??''));});
      const po=(oldInv.payments||[]).reduce((t,p)=>t+(Number(p.paidAmount)||0),0),pn=(newInv.payments||[]).reduce((t,p)=>t+(Number(p.paidAmount)||0),0);
      if(po!==pn)ch.push('payments '+c4Money(po)+' → '+c4Money(pn));
      if(ch.length)logAuditEvent(sid,{entity:'Vendor bill',entityId:String(oldInv.id),action:'Edited paid bill',summary:lab+': '+ch.join('; ')});
    }
  }catch(e){}
}

// ── 12 · Petty cash limits ──
function loadPettyLimits(sid){try{return JSON.parse(cachedLocalGet(outletKey('salonos_petty_limits',sid))||'{}')||{};}catch(e){return{};}}
function loadPettyOverrides(sid){try{return JSON.parse(cachedLocalGet(outletKey('salonos_petty_overrides',sid))||'{}')||{};}catch(e){return{};}}
function savePettyOverrides(sid,m){safeLocalSet(outletKey('salonos_petty_overrides',sid),JSON.stringify(m));}
// After an expense cell is left: above the head's daily cap → a reason is required (else the entry is
// undone), and the over-limit entry waits for the owner's approval.
function checkPettyLimit(sid,iso,rowName,before,after,revert){
  const cap=Number(loadPettyLimits(sid)[rowName])||0;
  const amt=Number(after)||0;
  const m=loadPettyOverrides(sid);const k=iso+'|'+rowName;
  if(!cap||amt<=cap){if(m[k]){delete m[k];savePettyOverrides(sid,m);}return;}
  if(m[k]&&Number(m[k].amount)===amt)return;
  let r=null;try{r=window.prompt(rowName+': '+c4Money(amt)+' is above this outlet’s daily limit of '+c4Money(cap)+'.\n\nGive the reason (the owner approves it in the Review Centre):',m[k]?m[k].reason:'');}catch(e){}
  if(r==null||!String(r).trim()){try{window.alert('Entry undone — an amount above the limit needs a reason.');}catch(e){}if(revert)revert(before);return;}
  m[k]={iso,row:rowName,amount:amt,cap,reason:String(r).trim(),by:c4User(),at:new Date().toISOString(),status:'Pending'};
  savePettyOverrides(sid,m);
}
function PettyLimitsModal({sid,onClose}){
  const h=React.createElement;const {success}=useToast();
  const [lim,setLim]=useState(()=>({...loadPettyLimits(sid)}));
  const rows=EXPENSE_ROWS.filter(r=>r&&r.name&&expenseRowVisibleFor(r,sid)&&!/Salary|Incentive|Advance|Penalt|Commission|Purchase|Bank Deposit/i.test(r.name));
  const save=()=>{const c={};Object.entries(lim).forEach(([k,v])=>{if(Number(v)>0)c[k]=Number(v);});safeLocalSet(outletKey('salonos_petty_limits',sid),JSON.stringify(c));success('Cash limits saved');onClose();};
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:520,maxHeight:'85vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'⚙ Daily cash limits per expense head'),
    h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:10}},'An entry above the limit needs a reason and waits for the owner’s approval in the Review Centre. Blank = no limit.'),
    h('table',null,h('tbody',null,rows.map(r=>h('tr',{key:r.name},h('td',{style:{fontSize:12.5}},r.name),
      h('td',{style:{textAlign:'right'}},h('input',{type:'number',min:0,className:'form-control',style:{width:120,display:'inline-block',textAlign:'right'},value:lim[r.name]??'',placeholder:'no limit',onChange:e=>{const v=e.target.value;setLim(l=>({...l,[r.name]:v}));}})))))),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Cancel'),h('button',{className:'btn btn-primary',onClick:save},'Save limits'))));
}
const PETTY_APPROVER_ROLES=['Super Admin','Salon Owner','Owner'];
function PettyApprovalsPanel({user,salons}){
  const h=React.createElement;const [tick,setTick]=useState(0);
  const can=user&&PETTY_APPROVER_ROLES.includes(user.role);
  const list=[];
  (salons||[]).filter(s=>s&&userCanSeeOutlet(user,s.id)).forEach(s=>Object.entries(loadPettyOverrides(s.id)).forEach(([k,o])=>{if(o&&o.status==='Pending')list.push({s,k,o});}));
  if(!list.length)return null;
  const decide=(it,st)=>{const m=loadPettyOverrides(it.s.id);if(m[it.k]){m[it.k]={...m[it.k],status:st,decidedBy:c4User(),decidedAt:new Date().toISOString()};savePettyOverrides(it.s.id,m);}
    try{logAuditEvent(it.s.id,{entity:'Cash limit',entityId:it.k,action:st,summary:it.o.row+' '+c4Money(it.o.amount)+' on '+c4Dmy(it.o.iso)+' (limit '+c4Money(it.o.cap)+') '+st.toLowerCase()});}catch(e){}setTick(x=>x+1);};
  return h('div',{className:'card',style:{marginBottom:16}},h('div',{className:'card-title'},'Cash spends above the daily limit ('+list.length+')'),
    h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Outlet','Date','Head','Amount','Limit','Reason','By',''].map((t,i)=>h('th',{key:i},t)))),
      h('tbody',null,list.map(it=>h('tr',{key:it.s.id+it.k},h('td',null,String(it.s.name).split('—')[0].trim()),h('td',null,c4Dmy(it.o.iso)),h('td',null,it.o.row),
        h('td',{style:{textAlign:'right'}},c4Money(it.o.amount)),h('td',{style:{textAlign:'right'}},c4Money(it.o.cap)),h('td',{style:{fontSize:12}},it.o.reason),h('td',{style:{fontSize:12}},it.o.by),
        h('td',{style:{whiteSpace:'nowrap'}},can?h(React.Fragment,null,h('button',{className:'btn btn-success btn-sm',onClick:()=>decide(it,'Approved')},'✓'),' ',h('button',{className:'btn btn-danger btn-sm',onClick:()=>decide(it,'Rejected')},'✗')):h('span',{style:{fontSize:11,color:'var(--text3)'}},'owner approves'))))))));
}

// ── 4 · Membership & package liability ──
function loadMemberships(sid){try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_membership_register',sid))||'[]');return Array.isArray(v)?v:[];}catch(e){return[];}}
function saveMemberships(sid,l){safeLocalSet(outletKey('salonos_membership_register',sid),JSON.stringify(l));}
// Value still owed to a client on a date, in ₹ of what they paid (paid × unused share of the service value).
function membershipState(m,asOfIso){
  const value=Number(m.value)||Number(m.paid)||0,paid=Number(m.paid)||0;
  const used=(m.redemptions||[]).filter(r=>!asOfIso||r.date<=asOfIso).reduce((t,r)=>t+(Number(r.amount)||0),0);
  const sold=!asOfIso||(m.soldOn&&m.soldOn<=asOfIso);
  const expired=!!(m.validTill&&asOfIso&&m.validTill<asOfIso);
  const left=Math.max(0,value-used);
  return{sold,value,paid,used,left,expired,liability:sold&&!expired&&value?paid*left/value:0};
}
function membershipMonthMovement(list,y,m){
  const pre=y+'-'+String(m+1).padStart(2,'0');const start=pre+'-01';const end=pre+'-'+String(new Date(y,m+1,0).getDate()).padStart(2,'0');
  const prevEnd=localIsoOf(new Date(y,m,0));
  let opening=0,sold=0,redeemed=0,expired=0,closing=0;
  list.forEach(x=>{const o=membershipState(x,prevEnd),c=membershipState(x,end);opening+=o.liability;closing+=c.liability;
    if(x.soldOn>=start&&x.soldOn<=end)sold+=Number(x.paid)||0;
    const v=Number(x.value)||Number(x.paid)||0;
    (x.redemptions||[]).filter(r=>r.date>=start&&r.date<=end).forEach(r=>{redeemed+=v?(Number(x.paid)||0)*(Number(r.amount)||0)/v:0;});
    if(x.validTill&&x.validTill>=start&&x.validTill<end){const s=membershipState(x,x.validTill);expired+=s.liability;}});
  return{opening,sold,redeemed,expired,closing};
}
function MembershipRegisterModal({salon,onClose}){
  const h=React.createElement;const {success,error:toastErr}=useToast();
  const sid=Number(salon&&salon.id)||1;
  const [list,setList]=useState(()=>loadMemberships(sid));
  const persist=l=>{setList(l);saveMemberships(sid,l);};
  const [form,setForm]=useState(null);const [red,setRed]=useState(null);
  const today=localIsoOf(new Date());
  const now=new Date();const mv=membershipMonthMovement(list,now.getFullYear(),now.getMonth());
  const totLiab=list.reduce((t,x)=>t+membershipState(x,today).liability,0);
  const fc=k=>e=>{const v=e.target.value;setForm(f=>({...f,[k]:v}));};
  const saveForm=()=>{if(!form.client||!(Number(form.paid)>0)||!form.soldOn){toastErr('Client, amount paid and date sold are required.');return;}
    const rec={...form,paid:Number(form.paid),value:Number(form.value)||Number(form.paid),redemptions:form.redemptions||[]};
    persist(form.id?list.map(x=>x.id===form.id?rec:x):[...list,{...rec,id:'M'+Date.now()}]);setForm(null);success('Saved');};
  const addRed=()=>{if(!(Number(red.amount)>0)||!red.date){toastErr('Date and service value used are required.');return;}
    persist(list.map(x=>x.id===red.id?{...x,redemptions:[...(x.redemptions||[]),{date:red.date,amount:Number(red.amount),note:red.note||''}]}:x));setRed(null);success('Use recorded');};
  const exp=async()=>{try{await afDownloadXlsx('Membership & package register',[['Client','Mobile','Type','Sold on','Paid (excl. GST)','Service value','Used','Left','Valid till','Owed (₹)'],
    ...list.map(x=>{const s=membershipState(x,today);return[x.client,x.phone||'',x.type,c4Dmy(x.soldOn),s.paid,s.value,s.used,s.left,c4Dmy(x.validTill),Math.round(s.liability)];})],'Membership_Register_'+today+'.xlsx');}catch(e){toastErr(e.message);}};
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:900,maxWidth:'96vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'💳 Membership & package register'),
    h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:10}},'What clients have paid for and not used yet is owed to them (a liability), not income. Record each sale and each use; expired unused value is shown separately.'),
    h('div',{className:'grid4',style:{marginBottom:12}},
      [['Owed to clients today',c4Money(totLiab)],['Sold this month',c4Money(mv.sold)],['Used this month',c4Money(mv.redeemed)],['Expired unused this month',c4Money(mv.expired)]].map(([l,v])=>h('div',{key:l,className:'metric-card'},h('div',{className:'metric-label'},l),h('div',{className:'metric-value',style:{fontSize:20}},v)))),
    h('div',{style:{display:'flex',gap:8,marginBottom:10}},h('button',{className:'btn btn-primary btn-sm',onClick:()=>setForm({client:'',phone:'',type:'Membership',soldOn:today,paid:'',value:'',validTill:''})},'+ Record a sale'),h('button',{className:'btn btn-ghost btn-sm',onClick:exp},'⬇ Excel')),
    form&&h('div',{className:'card',style:{marginBottom:12}},
      h('div',{className:'form-row cols3'},
        h('div',{className:'form-group'},h('label',null,'Client *'),h('input',{className:'form-control',value:form.client,onChange:fc('client')})),
        h('div',{className:'form-group'},h('label',null,'Mobile'),h('input',{className:'form-control',value:form.phone,onChange:fc('phone')})),
        h('div',{className:'form-group'},h('label',null,'Type'),h('select',{className:'form-control',value:form.type,onChange:fc('type')},['Membership','Package','Prepaid card'].map(t=>h('option',{key:t},t))))),
      h('div',{className:'form-row cols4'},
        h('div',{className:'form-group'},h('label',null,'Sold on *'),h('input',{type:'date',className:'form-control',value:form.soldOn,onChange:fc('soldOn')})),
        h('div',{className:'form-group'},h('label',null,'Paid, excl. GST *'),h('input',{type:'number',className:'form-control',value:form.paid,onChange:fc('paid')})),
        h('div',{className:'form-group'},h('label',null,'Service value'),h('input',{type:'number',className:'form-control',value:form.value,onChange:fc('value'),placeholder:'= paid'})),
        h('div',{className:'form-group'},h('label',null,'Valid till'),h('input',{type:'date',className:'form-control',value:form.validTill,onChange:fc('validTill')}))),
      h('div',{style:{display:'flex',gap:8}},h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setForm(null)},'Cancel'),h('button',{className:'btn btn-primary btn-sm',onClick:saveForm},'Save'))),
    red&&h('div',{className:'card',style:{marginBottom:12,display:'flex',gap:8,alignItems:'end',flexWrap:'wrap'}},
      h('div',{className:'form-group',style:{margin:0}},h('label',null,'Used on'),h('input',{type:'date',className:'form-control',value:red.date,onChange:e=>setRed(r=>({...r,date:e.target.value}))})),
      h('div',{className:'form-group',style:{margin:0}},h('label',null,'Service value used ₹'),h('input',{type:'number',className:'form-control',value:red.amount,onChange:e=>setRed(r=>({...r,amount:e.target.value}))})),
      h('div',{className:'form-group',style:{margin:0,flex:1}},h('label',null,'Note'),h('input',{className:'form-control',value:red.note||'',onChange:e=>setRed(r=>({...r,note:e.target.value}))})),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setRed(null)},'Cancel'),h('button',{className:'btn btn-primary btn-sm',onClick:addRed},'Record use')),
    h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,['Client','Type','Sold','Paid','Value','Used','Left','Valid till','Owed',''].map((t,i)=>h('th',{key:i,style:i>=3&&i<=8&&i!==7?{textAlign:'right'}:null},t)))),
      h('tbody',null,list.length===0?h('tr',null,h('td',{colSpan:10,style:{textAlign:'center',padding:20,color:'var(--text3)'}},'No memberships or packages recorded yet')):
        list.slice().sort((a,b)=>String(b.soldOn).localeCompare(String(a.soldOn))).map(x=>{const s=membershipState(x,today);
          return h('tr',{key:x.id},h('td',null,h('b',null,x.client),h('div',{style:{fontSize:11,color:'var(--text3)'}},x.phone||'')),h('td',null,x.type),h('td',null,c4Dmy(x.soldOn)),
            h('td',{style:{textAlign:'right'}},c4Money(s.paid)),h('td',{style:{textAlign:'right'}},c4Money(s.value)),h('td',{style:{textAlign:'right'}},c4Money(s.used)),h('td',{style:{textAlign:'right'}},c4Money(s.left)),
            h('td',{style:{color:s.expired?'var(--red)':''}},x.validTill?c4Dmy(x.validTill)+(s.expired?' (expired)':''):'—'),
            h('td',{style:{textAlign:'right',fontWeight:600}},c4Money(s.liability)),
            h('td',{style:{whiteSpace:'nowrap'}},h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setRed({id:x.id,date:today,amount:'',note:''})},'+ Use'),' ',h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setForm({...x,paid:String(x.paid),value:String(x.value)})},'Edit')));})))),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Close'))));
}

// ── 8 · Staff productivity ──
function staffProductivityFor(sid,y,m){
  const att=loadAttendance(sid)||{};
  let book={};try{book=JSON.parse(cachedLocalGet(outletKey('salonos_appointments_book',sid))||'{}')||{};}catch(e){}
  let bills=[];try{bills=JSON.parse(cachedLocalGet(outletKey('salonos_billing_invoices',sid))||'[]')||[];}catch(e){}
  const pre=y+'-'+String(m+1).padStart(2,'0');const dim=new Date(y,m+1,0).getDate();
  const ninetyAgo=localIsoOf(new Date(y,m+1,0-90));
  return(getEmployeesForMonth(y,m,sid)||[]).filter(e=>e.desig!=='Helper'&&e.desig!=='Housekeeper').map(e=>{
    const days=((att[e.id+'_'+y+'_'+m]||{}).days)||[];
    const worked=days.filter(d=>d==='present').length+days.filter(d=>d==='half').length/2;
    const rep=staffWorkReportRowFor(sid,y,m,e.billingId);
    const n=v=>Number(v)||0;
    let svc=0,prod=0,mem=0,src='';
    if(rep){svc=n(rep['ServiceSale'])+n(rep['PackageSale']);prod=n(rep['ProductSale']);mem=n(rep['MemberShipSale']);src='CRADLE';}
    else{const a=(loadIncentiveActuals(sid)||{})[incActualKey(e.id,y,m)]||{};svc=n(a.svcActual);prod=n(a.prodActual);mem=n(a.memActual);src=svc||prod||mem?'Incentive Working':'';}
    let mins=0;for(let d=1;d<=dim;d++){(book[sid+'|'+pre+'-'+String(d).padStart(2,'0')]||[]).forEach(a=>{if(a&&a.status!=='Cancelled'&&a.staff===e.name)mins+=Number(a.dur)||0;});}
    const myBills=bills.filter(b=>b&&b.staff===e.name&&b.status!=='Cancelled');
    const clientsMonth=new Set(myBills.filter(b=>String(b.date||'').startsWith(pre)).map(b=>String(b.phone||b.customer||'').replace(/\D/g,'').slice(-10)||b.customer).filter(Boolean));
    let repeat=0;clientsMonth.forEach(c=>{const visits=myBills.filter(b=>(String(b.phone||b.customer||'').replace(/\D/g,'').slice(-10)||b.customer)===c&&String(b.date)>=ninetyAgo).length;if(visits>1)repeat++;});
    const rev=svc+prod+mem;
    return{e,worked,svc,prod,mem,rev,perDay:worked?rev/worked:0,util:worked&&mins?mins/(worked*540)*100:null,clients:clientsMonth.size,repeatPct:clientsMonth.size?repeat/clientsMonth.size*100:null,src};
  }).sort((a,b)=>b.perDay-a.perDay);
}
function StaffProductivitySheet({salon,period}={}){
  const h=React.createElement;const [cal,setCal]=useAfCal(period);const sid=salon?.id;
  const rows=staffProductivityFor(sid,cal.year,cal.month);
  const avg=rows.filter(r=>r.worked).reduce((t,r)=>t+r.perDay,0)/Math.max(1,rows.filter(r=>r.worked).length);
  const f=v=>v==null?'—':Math.round(v)+'%';
  return h('div',null,
    h('div',{className:'section-header'},h('div',null,h('div',{className:'page-title'},'Staff Productivity'),
      h('div',{className:'page-sub'},'Revenue per working day (CRADLE Staff Work report, else Incentive Working figures), utilisation = booked minutes ÷ 9-hour working days, repeat clients = billed again within 90 days')),afMonthPicker(cal,setCal)),
    h('div',{className:'card',style:{padding:0}},h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,['Employee','Days worked','Service','Product','Membership','Revenue / day','vs team avg','Utilisation','Repeat clients'].map((t,i)=>h('th',{key:i,style:i?{textAlign:'right'}:null},t)))),
      h('tbody',null,rows.map(r=>h('tr',{key:r.e.id},
        h('td',null,h('b',null,r.e.name),h('div',{style:{fontSize:11,color:'var(--text3)'}},(r.e.desig||'')+(r.src?' · '+r.src:' · no sales data'))),
        h('td',{style:{textAlign:'right'}},r.worked),h('td',{style:{textAlign:'right'}},c4Money(r.svc)),h('td',{style:{textAlign:'right'}},c4Money(r.prod)),h('td',{style:{textAlign:'right'}},c4Money(r.mem)),
        h('td',{style:{textAlign:'right',fontWeight:600}},c4Money(r.perDay)),
        h('td',{style:{textAlign:'right',color:!avg||!r.worked?'':r.perDay>=avg?'var(--green)':'var(--red)'}},avg&&r.worked?(r.perDay>=avg?'+':'')+Math.round((r.perDay/avg-1)*100)+'%':'—'),
        h('td',{style:{textAlign:'right'}},f(r.util)),h('td',{style:{textAlign:'right'}},r.clients?f(r.repeatPct)+' of '+r.clients:'—'))))))));
}

// ── 14 · GST input credit check against GSTR-2B ──
function normInvNo(s){return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/^0+/,'');}
function loadGstr2b(sid){try{return JSON.parse(cachedLocalGet(outletKey('salonos_gstr2b',sid))||'{}')||{};}catch(e){return{};}}
// GSTR-2B JSON (from the GST portal) or its Excel (B2B sheet) → [{gstin,name,invNo,date,taxable,tax}]
function parseGstr2b(file,buf){
  const out=[];const n=v=>Number(String(v??'').replace(/,/g,''))||0;
  if(/\.json$/i.test(file.name)){
    const j=JSON.parse(new TextDecoder().decode(buf));const dd=(j.data&&j.data.docdata)||j.docdata||(j.data)||{};
    (dd.b2b||[]).forEach(s=>(s.inv||[]).forEach(inv=>{const it=inv.items||[];out.push({gstin:s.ctin,name:s.trdnm||'',invNo:inv.inum,date:inv.dt,taxable:it.reduce((t,x)=>t+n(x.txval),0),tax:it.reduce((t,x)=>t+n(x.igst)+n(x.cgst)+n(x.sgst),0)});}));
    return out;
  }
  const wb=XLSX.read(buf,{type:'array'});const name=wb.SheetNames.find(x=>/^b2b$/i.test(x.trim()))||wb.SheetNames.find(x=>/b2b/i.test(x))||wb.SheetNames[0];
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:false,defval:''});
  const hi=rows.findIndex(r=>r.some(c=>/gstin of supplier/i.test(String(c))));if(hi<0)throw new Error('Could not find the B2B table (column "GSTIN of supplier") in that file.');
  const hdr=rows[hi].map(c=>String(c).toLowerCase());const sub=(rows[hi+1]||[]).map(c=>String(c).toLowerCase());
  const col=re=>{let i=hdr.findIndex(c=>re.test(c));if(i<0)i=sub.findIndex(c=>re.test(c));return i;};
  const cG=col(/gstin of supplier/),cN=col(/trade|legal name/),cI=col(/invoice number/),cD=col(/invoice date/),cT=col(/taxable value/),cIg=col(/integrated tax/),cC=col(/central tax/),cS=col(/state.*tax/);
  rows.slice(hi+1).forEach(r=>{if(!/^[0-9]{2}[A-Z0-9]{13}$/i.test(String(r[cG]||'').trim()))return;out.push({gstin:String(r[cG]).trim(),name:cN>=0?r[cN]:'',invNo:r[cI],date:r[cD],taxable:n(r[cT]),tax:n(r[cIg])+n(r[cC])+n(r[cS])});});
  return out;
}
function gstr2bMatchFor(sid,y,m){
  const ym=y+'-'+String(m+1).padStart(2,'0');const b2=(loadGstr2b(sid)[ym]||{}).rows||null;
  if(!b2)return null;
  const vendors=loadVendors(sid)||[];
  const bills=(loadVendorInvoices(sid)||[]).filter(i=>i&&invoiceBookMonthOf(i)===ym&&(i.docNature||'Tax Invoice')==='Tax Invoice'&&((Number(i.cgst)||0)+(Number(i.sgst)||0)+(Number(i.igst)||0))>0)
    .map(i=>{const v=vendors.find(x=>x.id===i.vendorId)||{};return{i,vendor:v.name||'',gstin:String(v.gst||'').toUpperCase().trim(),key:normInvNo(i.invoiceNo),tax:(Number(i.cgst)||0)+(Number(i.sgst)||0)+(Number(i.igst)||0)};});
  const used=new Set();const matched=[],missing2b=[],taxDiff=[];
  bills.forEach(b=>{const k=b2.findIndex((r,ix)=>!used.has(ix)&&normInvNo(r.invNo)===b.key&&(!b.gstin||String(r.gstin).toUpperCase()===b.gstin));
    if(k<0){missing2b.push(b);return;}used.add(k);const r=b2[k];if(Math.abs(r.tax-b.tax)>1)taxDiff.push({b,r});else matched.push({b,r});});
  const notInBooks=b2.filter((r,ix)=>!used.has(ix));
  return{matched,missing2b,taxDiff,notInBooks,itcAtRisk:missing2b.reduce((t,b)=>t+b.tax,0)};
}
function Gstr2bCheck({sid,cal}){
  const h=React.createElement;const {success,error:toastErr}=useToast();const [tick,setTick]=useState(0);
  const ym=cal.year+'-'+String(cal.month+1).padStart(2,'0');
  const res=gstr2bMatchFor(sid,cal.year,cal.month);
  const onFile=async e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;
    try{const rows=parseGstr2b(f,await f.arrayBuffer());const all=loadGstr2b(sid);all[ym]={file:f.name,at:new Date().toISOString(),rows};safeLocalSet(outletKey('salonos_gstr2b',sid),JSON.stringify(all));success(rows.length+' supplier invoices read from GSTR-2B');setTick(x=>x+1);}
    catch(err){toastErr('Could not read that file: '+(err.message||err));}};
  const tbl=(cols,rows)=>h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,cols.map((c,i)=>h('th',{key:i},c)))),h('tbody',null,rows)));
  return h('div',{className:'card',style:{marginTop:16,maxWidth:900}},
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}},
      h('div',{className:'card-title',style:{margin:0}},'Input credit check — vendor bills vs GSTR-2B'),
      h('label',{className:'btn btn-ghost btn-sm',style:{cursor:'pointer'}},'⬆ Upload GSTR-2B (JSON or Excel)',h('input',{type:'file',accept:'.json,.xlsx,.xls',style:{display:'none'},onChange:onFile}))),
    !res?h('div',{style:{fontSize:12.5,color:'var(--text3)',marginTop:8}},'Download GSTR-2B for '+C4_M[cal.month]+' '+cal.year+' from the GST portal (Returns → GSTR-2B → Download) and upload it here.'):
    h('div',{style:{marginTop:10}},
      h('div',{className:'grid4',style:{marginBottom:10}},
        [['Matched',String(res.matched.length),'var(--green)'],['Tax amount differs',String(res.taxDiff.length),res.taxDiff.length?'var(--orange)':'var(--green)'],['Not in GSTR-2B (credit at risk)',res.missing2b.length+' · '+c4Money(res.itcAtRisk),res.missing2b.length?'var(--red)':'var(--green)'],['In 2B, not in Vendors',String(res.notInBooks.length),res.notInBooks.length?'var(--orange)':'var(--green)']]
          .map(([l,v,c])=>h('div',{key:l,className:'metric-card'},h('div',{className:'metric-label'},l),h('div',{className:'metric-value',style:{fontSize:18,color:c}},v)))),
      res.missing2b.length>0&&h('div',{style:{marginBottom:10}},h('div',{style:{fontWeight:600,fontSize:12.5,marginBottom:4}},'Booked but the supplier hasn’t filed — ask them to file, or hold the credit'),
        tbl(['Vendor','GSTIN','Bill no.','Tax'],res.missing2b.map((b,i)=>h('tr',{key:i},h('td',null,b.vendor),h('td',null,b.gstin||h('span',{style:{color:'var(--orange)'}},'no GSTIN in Vendor Master')),h('td',null,b.i.invoiceNo),h('td',{style:{textAlign:'right'}},c4Money(b.tax)))))),
      res.taxDiff.length>0&&h('div',{style:{marginBottom:10}},h('div',{style:{fontWeight:600,fontSize:12.5,marginBottom:4}},'Tax amount differs'),
        tbl(['Vendor','Bill no.','Tax in books','Tax in 2B'],res.taxDiff.map((x,i)=>h('tr',{key:i},h('td',null,x.b.vendor),h('td',null,x.b.i.invoiceNo),h('td',{style:{textAlign:'right'}},c4Money(x.b.tax)),h('td',{style:{textAlign:'right'}},c4Money(x.r.tax)))))),
      res.notInBooks.length>0&&h('div',null,h('div',{style:{fontWeight:600,fontSize:12.5,marginBottom:4}},'In GSTR-2B but no bill in Vendors — book the bill to claim the credit'),
        tbl(['Supplier','GSTIN','Invoice no.','Date','Tax'],res.notInBooks.map((r,i)=>h('tr',{key:i},h('td',null,r.name),h('td',null,r.gstin),h('td',null,r.invNo),h('td',null,r.date),h('td',{style:{textAlign:'right'}},c4Money(r.tax))))))));
}
