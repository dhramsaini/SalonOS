// ── Automation batch 6 ────────────────────────────────────────────────────────────────────────
//  9 Attrition watch (Incentive Working → Productivity)      10 Training & certificates (Master Salary + Due Dates)
// 11 Staffing vs bookings, next 14 days (Attendance → Weekly-off Planner)
// 13 Owner drawings ledger (P&L → Owner Drawings)            15 TDS register & 26Q working (Salary Working → Statutory Files)
// 16 Year-end pack ZIP (Month-End Close)                       18 Access review (User Management → Access review)
// 19 Outlet health score (Outlet Ranking)                      20 Feedback requests, 21 Referrals, 22 Campaign results (Clients)

const B6M=['January','February','March','April','May','June','July','August','September','October','November','December'];
const b6Money=n=>(Number(n)<0?'-':'')+'₹'+Math.round(Math.abs(Number(n)||0)).toLocaleString('en-IN');
const b6Dmy=iso=>String(iso||'').split('-').reverse().join('/');
const b6Iso=d=>localIsoOf(d);

// ── 9 · Attrition watch ──
function attritionSignals(sid,y,m){
  const att=loadAttendance(sid)||{};const adv=loadAdvances(sid)||[];
  const prevMonths=[1,2,3].map(k=>{const d=new Date(y,m-k,1);return{y:d.getFullYear(),m:d.getMonth()};});
  const absentIn=(e,yy,mm)=>(((att[e.id+'_'+yy+'_'+mm]||{}).days)||[]).filter(d=>d==='absent').length;
  // One incentive calculation per month (not per employee) — it is the expensive part.
  const monthCache={};
  const salesIn=(e,yy,mm)=>{const k=yy+'-'+mm;if(!monthCache[k]){try{monthCache[k]=incWorkingsFor(sid,yy,mm)||[];}catch(er){monthCache[k]=[];}}
    const w=monthCache[k].find(x=>x.id===e.id);return w?(Number(w.svcActual)||0)+(Number(w.prodActual)||0)+(Number(w.memActual)||0):0;};
  const since=b6Iso(new Date(Date.now()-60*864e5));
  return(getEmployeesForMonth(y,m,sid)||[]).filter(e=>e.status==='Active').map(e=>{
    const sig=[];
    const now=salesIn(e,y,m),base=prevMonths.map(p=>salesIn(e,p.y,p.m)).filter(v=>v>0);const avg=base.length?base.reduce((a,b)=>a+b,0)/base.length:0;
    if(avg>0&&now<avg*0.7)sig.push('sales '+Math.round((1-now/avg)*100)+'% below their 3-month average');
    const ab=absentIn(e,y,m),abAvg=prevMonths.reduce((t,p)=>t+absentIn(e,p.y,p.m),0)/3;
    if(ab>=3&&ab>abAvg*1.5)sig.push(ab+' absences this month (usually '+Math.round(abAvg*10)/10+')');
    const recent=adv.filter(a=>a.emp===e.name&&String(a.date||'')>=since);
    if(recent.length>=2||recent.reduce((t,a)=>t+(Number(a.amount)||0),0)>(Number(e.gross)||0)*0.5)sig.push(recent.length+' advance(s) in 60 days');
    return{e,sig};
  }).filter(x=>x.sig.length>=2).sort((a,b)=>b.sig.length-a.sig.length);
}
function AttritionWatchCard({sid,cal}){
  const h=React.createElement;const list=attritionSignals(sid,cal.year,cal.month);
  return h('div',{className:'card',style:{marginTop:14}},h('div',{className:'card-title'},'Attrition watch'),
    h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:6}},'Two or more warning signs together: sales down 30% on their 3-month average, absences well above usual, repeated or large salary advances.'),
    list.length?list.map(x=>h('div',{key:x.e.id,style:{fontSize:12.5,padding:'4px 0'}},h('b',null,x.e.name),' — '+x.sig.join(' · '))):h('div',{style:{fontSize:12.5,color:'var(--green)'}},'✓ No one shows two warning signs this month.'));
}

// ── 10 · Training & certificates ──
function loadStaffCerts(sid){try{return JSON.parse(cachedLocalGet(outletKey('salonos_staff_certs',sid))||'{}')||{};}catch(e){return{};}}
function autoStaffCertDueItemsFor(sid){
  const certs=loadStaffCerts(sid);const emps=loadEmployees(sid)||[];const ov=loadDueAutoOverrides(sid);
  const out=[];
  Object.entries(certs).forEach(([eid,list])=>{const e=emps.find(x=>String(x.id)===String(eid));if(!e||e.status!=='Active')return;
    (list||[]).filter(c=>c&&c.name&&c.validTill).forEach(c=>{const id='auto-cert-'+eid+'-'+c.name.replace(/[^A-Za-z0-9]+/g,'')+'-'+c.validTill;const o=ov[id]||{};
      out.push({id,auto:true,type:'Staff certificate',desc:e.name+' — '+c.name+' (valid till '+b6Dmy(c.validTill)+')',due:c.validTill,amount:0,paid:!!o.paid,paidAmount:o.paidAmount||'',paidDate:o.paidDate||'',ref:o.ref||'',bankRowId:null,status:typeof licenceStatus==='function'?licenceStatus(c.validTill,o.paid):(o.paid?'Paid':'Pending')});});});
  return out;
}
function StaffCertsCard({sid}){
  const h=React.createElement;const {success}=useToast();
  const emps=(loadEmployees(sid)||[]).filter(e=>e.status==='Active');
  const [certs,setCerts]=useState(()=>loadStaffCerts(sid));
  const [form,setForm]=useState({emp:'',name:'',validTill:''});
  const save=c=>{setCerts(c);safeLocalSet(outletKey('salonos_staff_certs',sid),JSON.stringify(c));};
  const add=()=>{if(!form.emp||!form.name||!form.validTill)return;const c={...certs,[form.emp]:[...(certs[form.emp]||[]),{name:form.name,validTill:form.validTill}]};save(c);setForm({emp:form.emp,name:'',validTill:''});success('Added — reminder 30 days before');};
  const today=b6Iso(new Date());const soon=b6Iso(new Date(Date.now()+30*864e5));
  const rows=[];Object.entries(certs).forEach(([eid,l])=>(l||[]).forEach((c,i)=>{const e=emps.find(x=>String(x.id)===eid);if(e)rows.push({eid,i,e,c});}));
  rows.sort((a,b)=>String(a.c.validTill).localeCompare(String(b.c.validTill)));
  return h('details',{className:'card',style:{marginBottom:16}},h('summary',{style:{cursor:'pointer',fontWeight:600}},'🎓 Training & certificates ('+rows.length+')'+(rows.some(r=>r.c.validTill<=soon)?' — renewals due':'')),
    h('div',{style:{fontSize:12,color:'var(--text3)',margin:'8px 0'}},'Health check, hygiene certificate, product or skill training — with validity dates. Reminders appear in Due Dates 30 days ahead.'),
    h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}},
      h('select',{className:'form-control',style:{width:180},value:form.emp,onChange:e=>setForm(f=>({...f,emp:e.target.value}))},h('option',{value:''},'— employee —'),emps.map(e=>h('option',{key:e.id,value:String(e.id)},e.name))),
      h('input',{className:'form-control',style:{width:220},placeholder:'Certificate / training',value:form.name,onChange:e=>setForm(f=>({...f,name:e.target.value}))}),
      h('input',{type:'date',className:'form-control',style:{width:160},value:form.validTill,onChange:e=>setForm(f=>({...f,validTill:e.target.value}))}),
      h('button',{className:'btn btn-primary btn-sm',onClick:add},'+ Add')),
    rows.length>0&&h('div',{className:'table-wrap'},h('table',null,h('tbody',null,rows.map(r=>h('tr',{key:r.eid+'-'+r.i},h('td',null,r.e.name),h('td',null,r.c.name),
      h('td',{style:{color:r.c.validTill<today?'var(--red)':r.c.validTill<=soon?'var(--orange)':''}},b6Dmy(r.c.validTill)+(r.c.validTill<today?' (expired)':'')),
      h('td',null,h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{if(!window.confirm('Remove '+r.c.name+' of '+r.e.name+'?'))return;const c={...certs,[r.eid]:certs[r.eid].filter((_,j)=>j!==r.i)};save(c);}},'Remove'))))))));
}

// ── 11 · Staffing vs bookings, next 14 days ──
function staffingNeedFor(sid){
  let book={};try{book=JSON.parse(cachedLocalGet(outletKey('salonos_appointments_book',sid))||'{}')||{};}catch(e){}
  const now=new Date();const emps=(getEmployeesForMonth(now.getFullYear(),now.getMonth(),sid)||[]).filter(e=>e.status==='Active'&&e.desig!=='Helper'&&e.desig!=='Housekeeper');
  const DOW=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return Array.from({length:14},(_,i)=>{const d=new Date(now.getTime()+i*864e5);const iso=b6Iso(d);
    const appts=(book[sid+'|'+fdDateStr(d)]||[]).filter(a=>a&&a.status!=='Cancelled');const mins=appts.reduce((t,a)=>t+(Number(a.dur)||0),0);
    const working=emps.filter(e=>e.weeklyOff!==DOW[d.getDay()]).length;const need=mins?Math.ceil(mins/(480*0.75)):0;
    return{iso,dow:DOW[d.getDay()].slice(0,3),appts:appts.length,mins,working,need,gap:working-need};});
}
function StaffingNeedCard({sid}){
  const h=React.createElement;const rows=staffingNeedFor(sid);
  return h('div',{className:'card',style:{marginTop:14}},h('div',{className:'card-title'},'Staffing vs bookings — next 14 days'),
    h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:6}},'Stylists needed = booked minutes ÷ (8 hours at 75% utilisation). Short days in red; walk-ins come on top.'),
    h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Date','Bookings','Booked hours','Stylists working','Needed','Spare'].map((t,i)=>h('th',{key:i},t)))),
      h('tbody',null,rows.map(r=>h('tr',{key:r.iso,style:{background:r.gap<0?'rgba(224,82,82,0.06)':undefined}},h('td',null,b6Dmy(r.iso)+' '+r.dow),h('td',null,r.appts),h('td',null,(r.mins/60).toFixed(1)),h('td',null,r.working),h('td',null,r.need||'—'),
        h('td',{style:{fontWeight:600,color:r.gap<0?'var(--red)':''}},r.need?r.gap:'—')))))));
}

// ── 13 · Owner drawings ledger ──
function ownerDrawingsFor(sid,y,m){
  let ds={},ent={};try{ds=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',sid))||'{}')||{};ent=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_entrydata',sid))||'{}')||{};}catch(e){}
  const pre=y+'-'+String(m+1).padStart(2,'0');const rows=[];
  Object.keys(ds).filter(k=>k.startsWith(pre)).sort().forEach(iso=>{const d=ds[iso]||{};
    if(Number(d[9])>0)rows.push({iso,type:'Cash Packet',amount:Number(d[9]),detail:''});
    if(Number(d[10])>0){const list=((ent[iso]||{})[10])||[];rows.push({iso,type:'Cash Handover',amount:Number(d[10]),detail:list.map(x=>[x.person||x.name||x.to||'',x.amount?b6Money(x.amount):''].filter(Boolean).join(' ')).join('; ')});}});
  return rows;
}
function OwnerDrawingsSheet({salon,period}={}){
  const h=React.createElement;const [cal,setCal]=useAfCal(period);const sid=salon?.id;const [tick,setTick]=useState(0);
  const rows=ownerDrawingsFor(sid,cal.year,cal.month);const tot=rows.reduce((t,r)=>t+r.amount,0);
  const ym=cal.year+'-'+String(cal.month+1).padStart(2,'0');
  let ack={};try{ack=JSON.parse(cachedLocalGet(outletKey('salonos_drawings_ack',sid))||'{}')||{};}catch(e){}
  const a=ack[ym];
  const confirmAck=()=>{const r=window.prompt('Amount the owner confirms receiving for '+B6M[cal.month]+' (book shows '+b6Money(tot)+'):',String(Math.round(tot)));if(r==null)return;
    ack[ym]={amount:Number(r)||0,by:(currentSessionUser()||{}).name||'',at:new Date().toISOString()};safeLocalSet(outletKey('salonos_drawings_ack',sid),JSON.stringify(ack));setTick(x=>x+1);};
  const ytd=(()=>{const {fy}=calToFYMI(cal.year,cal.month);let t=0;for(let i=0;i<12;i++){const c=periodToCalendar({fy,mi:i});if(!c||c.year>cal.year||(c.year===cal.year&&c.month>cal.month))break;t+=ownerDrawingsFor(sid,c.year,c.month).reduce((s,r)=>s+r.amount,0);}return t;})();
  return h('div',null,
    h('div',{className:'section-header'},h('div',null,h('div',{className:'page-title'},'Owner Drawings'),h('div',{className:'page-sub'},'Cash Packet and Cash Handover from Daily Sales & Exp — cash taken out by or for the owner')),afMonthPicker(cal,setCal)),
    h('div',{className:'grid4',style:{marginBottom:12}},
      [['This month',b6Money(tot)],['Financial year to date',b6Money(ytd)],['Owner confirmed',a?b6Money(a.amount):'not yet'],['Difference',a?b6Money(a.amount-tot):'—']].map(([l,v])=>h('div',{key:l,className:'metric-card'},h('div',{className:'metric-label'},l),h('div',{className:'metric-value',style:{fontSize:20,color:l==='Difference'&&a&&Math.abs(a.amount-tot)>1?'var(--red)':''}},v)))),
    h('button',{className:'btn btn-ghost btn-sm',style:{marginBottom:10},onClick:confirmAck},a?'Re-confirm with owner':'✓ Record owner’s confirmation'),
    a&&h('span',{style:{fontSize:11.5,color:'var(--text3)',marginLeft:8}},'confirmed by '+a.by+' on '+new Date(a.at).toLocaleDateString('en-IN')),
    h('div',{className:'card',style:{padding:0}},h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Date','Type','Amount','Detail'].map((t,i)=>h('th',{key:i},t)))),
      h('tbody',null,rows.length?rows.map((r,i)=>h('tr',{key:i},h('td',null,b6Dmy(r.iso)),h('td',null,r.type),h('td',{style:{textAlign:'right'}},b6Money(r.amount)),h('td',{style:{fontSize:12}},r.detail||''))):h('tr',null,h('td',{colSpan:4,style:{textAlign:'center',padding:20,color:'var(--text3)'}},'No Cash Packet or Cash Handover this month')))))));
}

// ── 15 · TDS register (vendors + salary) and 26Q working ──
function tdsRegisterFor(sid,fy){
  const recurring=loadRecurringExpenses(sid).filter(it=>it.status==='Active'&&it.tdsApplicable&&it.tdsSection);
  const ov=loadDueAutoOverrides(sid);const rows=[];
  for(let mi=0;mi<12;mi++){const c=periodToCalendar({fy,mi});if(!c)continue;
    const paidKeys=(ov['auto-tds-'+c.year+'-'+c.month]||{}).paidKeys||{};const ovr=ov['auto-tds-'+c.year+'-'+c.month]||{};
    (tdsPartyDetailForMonth(sid,c.year,c.month,recurring)||[]).forEach(p=>rows.push({month:B6M[c.month].slice(0,3)+' '+c.year,q:'Q'+(Math.floor(mi/3)+1),party:p.party,source:p.source,section:p.section,amt:p.amt,paid:!!paidKeys[p.key]||!!ovr.paid,ref:ovr.ref||''}));}
  return rows;
}
function TdsRegisterCard({sid,cal}){
  const h=React.createElement;const {fy}=calToFYMI(cal.year,cal.month);const rows=tdsRegisterFor(sid,fy);
  const byQ={};rows.forEach(r=>{const k=r.q;byQ[k]=byQ[k]||{q:k,amt:0,unpaid:0};byQ[k].amt+=r.amt;if(!r.paid)byQ[k].unpaid+=r.amt;});
  const exp=async()=>{try{await afDownloadXlsx('TDS register '+fy,[['Quarter','Month','Deductee','Nature','Section','TDS','Deposited','Challan ref'],...rows.map(r=>[r.q,r.month,r.party,r.source,r.section,Math.round(r.amt),r.paid?'Yes':'No',r.ref])],'TDS_Register_'+fy+'.xlsx');}catch(e){window.alert(e.message);}};
  return h('div',{className:'card',style:{marginBottom:14}},
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}},
      h('div',null,h('div',{className:'card-title',style:{marginBottom:4}},'TDS register — FY '+fy+' (vendors, rent and salary)'),
        h('div',{style:{fontSize:12,color:'var(--text3)'}},'Every deduction by quarter with deposit status — the working for 24Q (salary) and 26Q (others) and for Form 16A.'),
        h('div',{style:{fontSize:12.5,marginTop:8}},Object.values(byQ).map(x=>x.q+': '+b6Money(x.amt)+(x.unpaid?' ('+b6Money(x.unpaid)+' not deposited)':'')).join(' · ')||'No TDS this year')),
      h('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},
        h('button',{className:'btn btn-ghost btn-sm',disabled:!rows.length,onClick:exp},'⬇ TDS register .xlsx'),
        h(XlReportButton,{label:'⬇ 26Q / 24Q working (Excel)',title:'Quarter-wise deductee details, PAN check, deposit status and the annual salary sheet',build:()=>buildTdsReturnsWorkbook(sid,getSalonRecordById(sid)||{name:'Outlet'},fy)}),
        h('button',{className:'btn btn-ghost btn-sm',title:'One block per employee: salary, PF, ESIC, PT and TDS month by month — the Form 16 Part B working',onClick:async()=>{try{const s=getSalonRecordById(sid)||{name:'Outlet'};const b=await buildAnnualSalaryStatementsPdf(sid,s,fy);rDownloadBlob(b,'Annual_Salary_Statements_'+rptFile(rptShort(s))+'_FY'+fy+'.pdf');}catch(e){window.alert(e.message||String(e));}}},'📄 Annual salary statements (PDF)'))));
}

// ── 16 · Year-end pack ──
async function buildYearEndPack(salon,fy){
  const sid=salon.id;await loadScript(CDN.zip);const zip=new window.JSZip();
  const add=async(n,t,r)=>zip.file(n,await exportReportExcelBlob(t,r));
  const months=Array.from({length:12},(_,mi)=>({mi,c:periodToCalendar({fy,mi}),p:plBuild(sid,fy,mi)}));
  const names=[];months[0].p.sections.forEach(S=>{names.push(['§',S.sec]);S.lines.forEach(l=>names.push([S.sec,l.name]));});
  const hdr=['Particulars',...months.map(x=>B6M[x.c.month].slice(0,3)+' '+String(x.c.year).slice(2)),'Total'];
  const rowFor=(sec,name)=>{const vals=months.map(x=>{const S=x.p.sections.find(s=>s.sec===sec);if(name==null)return Math.round(S?S.tot:0);const l=S&&S.lines.find(z=>z.name===name);return Math.round(l?l.amt:0);});return[name==null?sec:'   '+name,...vals,vals.reduce((a,b)=>a+b,0)];};
  const pl=[hdr];names.forEach(([sec,name])=>pl.push(sec==='§'?rowFor(name,null):rowFor(sec,name)));
  ['ebitda','pbt'].forEach(k=>{const v=months.map(x=>Math.round(x.p[k]||0));pl.push([k==='ebitda'?'EBITDA':'Profit before tax',...v,v.reduce((a,b)=>a+b,0)]);});
  await add('01_PnL_12_months_'+fy+'.xlsx','P&L FY '+fy,pl);
  const st=[['Month','PF','ESIC','PT','TDS on salary']];months.forEach(x=>{if(!salaryAttendanceReady(sid,x.c.year,x.c.month))return;const r=statutoryRowsFor(sid,x.c.year,x.c.month);const s=f=>Math.round(r.reduce((t,e)=>t+(Number(e[f])||0),0));st.push([B6M[x.c.month]+' '+x.c.year,s('pfEmp')+s('pfEr'),s('esicEmp')+s('esicEr'),s('ptAmt'),s('tdsAmt')]);});
  await add('02_Statutory_summary_'+fy+'.xlsx','Statutory summary',st);
  const fa=loadFixedAssets(sid)||[];await add('03_Fixed_assets_'+fy+'.xlsx','Fixed assets',[['Asset','Purchase date','Cost','Block / rate'],...fa.map(a=>[a.name||a.asset||'',a.purchaseDate||a.date||'',Number(a.cost||a.amount)||0,a.block||a.rate||''])]);
  const adv=(loadAdvances(sid)||[]).filter(a=>a.status==='Active');await add('04_Advances_outstanding.xlsx','Advances outstanding',[['Employee','Given on','Amount','Outstanding','Recover from'],...adv.map(a=>[a.emp,a.date||'',Number(a.amount)||0,Number(a.outstanding)||0,a.deductFrom||'Salary'])]);
  const tds=tdsRegisterFor(sid,fy);await add('05_TDS_register_'+fy+'.xlsx','TDS register',[['Quarter','Month','Deductee','Nature','Section','TDS','Deposited'],...tds.map(r=>[r.q,r.month,r.party,r.source,r.section,Math.round(r.amt),r.paid?'Yes':'No'])]);
  const mem=loadMemberships(sid);const end=localIsoOf(new Date(months[11].c.year,months[11].c.month+1,0));
  await add('06_Membership_liability.xlsx','Membership liability',[['Client','Type','Sold on','Paid','Owed at year end'],...mem.map(x=>[x.client,x.type,x.soldOn,Number(x.paid)||0,Math.round(membershipState(x,end).liability)])]);
  const blob=await zip.generateAsync({type:'blob'});rDownloadBlob(blob,'Year_End_Pack_'+String(salon.name||'Outlet').split('—')[0].trim().replace(/[^A-Za-z0-9]+/g,'_')+'_FY'+fy+'.zip');
}

// ── 18 · Access review ──
function AccessReviewView({users,salons}){
  const h=React.createElement;const {success}=useToast();const [tick,setTick]=useState(0);
  let last={};try{last=JSON.parse(cachedLocalGet('salonos_access_review')||'{}')||{};}catch(e){}
  const today=b6Iso(new Date());const d30=b6Iso(new Date(Date.now()-30*864e5));
  const rows=(users||[]).map(u=>{const oa=u.outletAccess||{};const edits=Object.values(oa).filter(v=>v==='View and Edit').length;
    const flags=[];if(u.role==='Super Admin')flags.push('full access');if(u.accessUntil&&u.accessUntil<today)flags.push('temporary access ended '+b6Dmy(u.accessUntil));
    if(u.lastLogin&&String(u.lastLogin).slice(0,10)<d30)flags.push('no login in 30 days');if(!u.lastLogin)flags.push('login date unknown');if(u.status&&u.status!=='Active')flags.push(u.status);
    if(edits>=Math.max(3,Math.ceil((salons||[]).length*0.8))&&u.role!=='Super Admin')flags.push('edit on '+edits+' outlets');
    return{u,edits,views:Object.values(oa).filter(v=>v==='View Only').length,flags};});
  const done=()=>{const r={at:new Date().toISOString(),by:(currentSessionUser()||{}).name||'',users:rows.length};safeLocalSet('salonos_access_review',JSON.stringify(r));try{logAuditEvent(null,{entity:'Access review',entityId:today,action:'Reviewed',summary:rows.length+' logins reviewed'});}catch(e){}success('Access review recorded');setTick(x=>x+1);};
  return h('div',{className:'card'},
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:8}},
      h('div',null,h('div',{className:'card-title',style:{margin:0}},'Monthly access review'),h('div',{style:{fontSize:12,color:'var(--text3)'}},last.at?'Last reviewed '+new Date(last.at).toLocaleDateString('en-IN')+' by '+last.by:'Not reviewed yet')),
      h('button',{className:'btn btn-primary btn-sm',onClick:done},'✓ Mark reviewed')),
    h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Login','Role','Outlets (edit / view)','Last login','Check'].map((t,i)=>h('th',{key:i},t)))),
      h('tbody',null,rows.map(r=>h('tr',{key:r.u.id||r.u.email},h('td',null,h('b',null,r.u.name||''),h('div',{style:{fontSize:11,color:'var(--text3)'}},r.u.email||'')),h('td',null,r.u.role),h('td',null,r.edits+' / '+r.views),
        h('td',null,r.u.lastLogin?new Date(r.u.lastLogin).toLocaleDateString('en-IN'):'—'),h('td',{style:{fontSize:12,color:r.flags.length?'var(--orange)':'var(--green)'}},r.flags.join(' · ')||'✓')))))));
}

// ── 19 · Outlet health score (0–100) ──
function outletHealthFor(sid,y,m){
  let score=100;const notes=[];
  const missing=dseDaysMissingFor(sid,y,m).length;if(missing){score-=Math.min(25,missing*5);notes.push(missing+' days missing');}
  const coll=collectionDiffStatusFor(sid,y,m);if(coll.applicable&&coll.unexplained.length){score-=Math.min(20,coll.unexplained.length*4);notes.push(coll.unexplained.length+' collection diffs');}
  const pre=y+'-'+String(m+1).padStart(2,'0');const cc=loadCashCounts(sid);const lim=cashDiffLimitFor(sid);
  const badCash=Object.keys(cc).filter(k=>k.startsWith(pre)&&Math.abs(Number(cc[k].diff)||0)>lim&&!String(cc[k].reason||'').trim()).length;if(badCash){score-=Math.min(15,badCash*5);notes.push(badCash+' cash differences');}
  const over=(allDueItemsFor(sid)||[]).filter(d=>d&&!d.paid&&d.status!=='done'&&d.due&&d.due<b6Iso(new Date())).length;if(over){score-=Math.min(20,over*5);notes.push(over+' overdue dues');}
  const steps=monthCloseStepsFor(sid,y,m);const open=steps.filter(s=>!s.done).length;const now=new Date();const isPast=y<now.getFullYear()||(y===now.getFullYear()&&m<now.getMonth());
  if(isPast&&open){score-=Math.min(20,open*3);notes.push(open+' close steps open');}
  return{score:Math.max(0,score),notes};
}

// ── 20/21/22 · Feedback, referrals, campaign results ──
function loadFeedback(sid){try{return JSON.parse(cachedLocalGet(outletKey('salonos_feedback',sid))||'{}')||{};}catch(e){return{};}}
function loadReferrals(sid){try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_referrals',sid))||'[]');return Array.isArray(v)?v:[];}catch(e){return[];}}
function campaignResults(sid){
  const sent=loadSentMarks(sid,'client');let bills=[];try{bills=JSON.parse(cachedLocalGet(outletKey('salonos_billing_invoices',sid))||'[]')||[];}catch(e){}
  const ph=s=>String(s||'').replace(/\D/g,'').slice(-10);const kinds={win:'Win-back',bday:'Birthday',rep:'Repeat service',exp:'Membership renewal',appt:'Appointment reminder',fb:'Feedback'};
  let clients=[];try{clients=JSON.parse(cachedLocalGet(outletKey('salonos_clients',sid))||'[]')||[];}catch(e){}
  const res={};
  Object.entries(sent).forEach(([key,at])=>{const p=key.split('|');const kind=kinds[p[0]]||p[0];const r=res[kind]||(res[kind]={kind,sent:0,back:0,revenue:0});r.sent++;
    let phone='';if(p[0]==='rep')phone=p[1];else{const c=clients.find(x=>String(x.id)===p[1]);phone=c?ph(c.phone):'';}
    if(!phone)return;const from=String(at).slice(0,10),to=b6Iso(new Date(new Date(from).getTime()+30*864e5));
    const after=bills.filter(b=>b&&b.status!=='Cancelled'&&ph(b.phone)===phone&&b.date>from&&b.date<=to);
    if(after.length){r.back++;r.revenue+=after.reduce((t,b)=>t+billCalc(b).taxable,0);}});
  return Object.values(res);
}
function ClientGrowthModal({salon,onClose}){
  const h=React.createElement;const {success}=useToast();const sid=Number(salon&&salon.id)||1;
  const [tab,setTab]=useState('fb');const [tick,setTick]=useState(0);
  const short=String(salon&&salon.name||'the salon').split('—')[0].trim();
  let bills=[];try{bills=JSON.parse(cachedLocalGet(outletKey('salonos_billing_invoices',sid))||'[]')||[];}catch(e){}
  const y=b6Iso(new Date(Date.now()-864e5));const yb=bills.filter(b=>b&&b.date===y&&b.status!=='Cancelled'&&waPhoneOk(b.phone));
  const fb=loadFeedback(sid);const sent=loadSentMarks(sid,'client');
  const setRating=(key,b)=>{const r=window.prompt('Rating '+b.customer+' gave (1–5):',fb[key]&&fb[key].rating||'');if(r==null)return;const n=Math.max(1,Math.min(5,Number(r)||0));if(!n)return;
    const m=loadFeedback(sid);m[key]={rating:n,customer:b.customer,phone:b.phone,staff:b.staff||'',date:b.date,at:new Date().toISOString()};safeLocalSet(outletKey('salonos_feedback',sid),JSON.stringify(m));setTick(x=>x+1);};
  const low=Object.values(fb).filter(x=>x.rating<=3).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const avg=Object.values(fb).length?Object.values(fb).reduce((t,x)=>t+x.rating,0)/Object.values(fb).length:0;
  const [refs,setRefs]=useState(()=>loadReferrals(sid));const [rf,setRf]=useState({by:'',byPhone:'',name:'',phone:''});
  const saveRefs=l=>{setRefs(l);safeLocalSet(outletKey('salonos_referrals',sid),JSON.stringify(l));};
  const ph=s=>String(s||'').replace(/\D/g,'').slice(-10);
  const firstBill=r=>bills.filter(b=>b&&b.status!=='Cancelled'&&ph(b.phone)===ph(r.phone)&&b.date>=r.at.slice(0,10)).sort((a,b)=>String(a.date).localeCompare(String(b.date)))[0];
  const camp=campaignResults(sid);
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:820,maxWidth:'96vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'🌱 Client feedback, referrals & campaign results'),
    h('div',{className:'tab-bar',style:{marginBottom:12}},[['fb','Feedback'],['ref','Referrals'],['camp','Campaign results']].map(([k,l])=>h('button',{key:k,className:'tab-btn '+(tab===k?'active':''),onClick:()=>setTab(k)},l))),
    tab==='fb'&&h('div',null,
      h('div',{style:{fontSize:12.5,marginBottom:8}},'Average rating '+(avg?avg.toFixed(1)+' / 5 from '+Object.values(fb).length:'—')+'. Send the request the day after the visit; record the rating they reply with.'),
      h('div',{style:{fontWeight:600,fontSize:12.5,margin:'6px 0'}},'Yesterday’s clients ('+yb.length+')'),
      yb.length?yb.map((b,i)=>{const key='fb|'+ph(b.phone)+'|'+y;return h('div',{key:i,style:{display:'flex',gap:8,alignItems:'center',padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:12.5}},
        h('span',{style:{flex:1}},h('b',null,b.customer),' · '+(b.staff||'')),fb[key]&&h('span',{style:{fontWeight:600,color:fb[key].rating<=3?'var(--red)':'var(--green)'}},fb[key].rating+'★'),
        sent[key]&&h('span',{style:{fontSize:11,color:'var(--green)'}},'✓ asked'),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{window.open(waLink(b.phone,'Hi '+String(b.customer).split(' ')[0]+', thank you for visiting '+short+' yesterday! How was your experience with '+(b.staff||'us')+'? Reply with a rating from 1 to 5.'),'_blank');markSent(sid,'client',key);setTick(x=>x+1);}},'📤 Ask'),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setRating(key,b)},'Record rating'));}):h('div',{style:{fontSize:12,color:'var(--text3)'}},'No billed visits yesterday with a mobile number.'),
      low.length>0&&h('div',{style:{marginTop:12}},h('div',{style:{fontWeight:600,fontSize:12.5,color:'var(--red)'}},'Low ratings (3 or less) — call back'),low.slice(0,20).map((x,i)=>h('div',{key:i,style:{fontSize:12.5}},b6Dmy(x.date)+' · '+x.customer+' ('+x.phone+') · '+x.rating+'★ · '+(x.staff||''))))),
    tab==='ref'&&h('div',null,
      h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}},
        h('input',{className:'form-control',style:{width:150},placeholder:'Referred by',value:rf.by,onChange:e=>setRf(f=>({...f,by:e.target.value}))}),
        h('input',{className:'form-control',style:{width:130},placeholder:'Their mobile',value:rf.byPhone,onChange:e=>setRf(f=>({...f,byPhone:e.target.value}))}),
        h('input',{className:'form-control',style:{width:150},placeholder:'New client',value:rf.name,onChange:e=>setRf(f=>({...f,name:e.target.value}))}),
        h('input',{className:'form-control',style:{width:130},placeholder:'New client mobile',value:rf.phone,onChange:e=>setRf(f=>({...f,phone:e.target.value}))}),
        h('button',{className:'btn btn-primary btn-sm',onClick:()=>{if(!rf.by||!waPhoneOk(rf.phone))return;saveRefs([...refs,{...rf,id:'R'+Date.now(),at:new Date().toISOString(),rewardGiven:false}]);setRf({by:'',byPhone:'',name:'',phone:''});success('Referral recorded');}},'+ Add')),
      h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Referred by','New client','First bill','Reward',''].map((t,i)=>h('th',{key:i},t)))),
        h('tbody',null,refs.length?refs.slice().reverse().map(r=>{const fbl=firstBill(r);return h('tr',{key:r.id},h('td',null,r.by,h('div',{style:{fontSize:11,color:'var(--text3)'}},r.byPhone||'')),h('td',null,r.name,h('div',{style:{fontSize:11,color:'var(--text3)'}},r.phone)),
          h('td',null,fbl?b6Dmy(fbl.date)+' · '+b6Money(billCalc(fbl).taxable):'not yet'),h('td',{style:{color:r.rewardGiven?'var(--green)':fbl?'var(--orange)':''}},r.rewardGiven?'✓ given':fbl?'due':'—'),
          h('td',null,fbl&&!r.rewardGiven&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>saveRefs(refs.map(x=>x.id===r.id?{...x,rewardGiven:true,rewardAt:new Date().toISOString()}:x))},'Mark given')));}):h('tr',null,h('td',{colSpan:5,style:{textAlign:'center',padding:16,color:'var(--text3)'}},'No referrals recorded yet')))))),
    tab==='camp'&&h('div',null,h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:6}},'Clients messaged from Messages to send, and how many were billed again within 30 days (from Billing).'),
      h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Campaign','Messages sent','Came back in 30 days','Response','Revenue (excl. GST)'].map((t,i)=>h('th',{key:i},t)))),
        h('tbody',null,camp.length?camp.map(c=>h('tr',{key:c.kind},h('td',null,c.kind),h('td',null,c.sent),h('td',null,c.back),h('td',null,c.sent?Math.round(c.back/c.sent*100)+'%':'—'),h('td',null,b6Money(c.revenue)))):h('tr',null,h('td',{colSpan:5,style:{textAlign:'center',padding:16,color:'var(--text3)'}},'No messages sent yet')))))),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Close'))));
}
