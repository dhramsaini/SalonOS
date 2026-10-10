// ═══════════════════════════════════════════════════════════════════════════════════════════
// Controls centre (Master Settings → 🎛 Controls) — every check and approval rule in one place,
// switched on or off for all outlets, with an outlet-wise override (On / Off / same as all).
//   controlOn(id, outletId)      → is this rule active for the outlet
//   controlLimit(id)             → the ₹ limit of a rule that has one
//   requireApproval({...})       → approval rules: true when the action may go ahead now
// Stored in one shared record (salonos_controls) so every user and device follows the same rules.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const CONTROL_DEFS=[
  {id:'dupInvoice',group:'Entry checks',label:'Block a vendor invoice number entered twice',hint:'Same vendor + same invoice no. (Vendors, Daily Sales & Exp, Bank Statement).',def:true},
  {id:'gstLock',group:'Entry checks',label:'Lock CGST/SGST or IGST by state',hint:'Outlet and vendor in the same state → only CGST + SGST; different states → only IGST.',def:true},
  {id:'idChecks',group:'Entry checks',label:'Check PAN, GSTN, IFSC, Aadhaar, UAN, ESIC, account no., phone & email',hint:'Wrong formats are stopped before saving employees and vendors.',def:true},
  {id:'collRecoNeedsMapping',group:'Month close',label:'Collection Reco only after every bank credit of the month is mapped',hint:'Each credit line needs a Nature, and card / UPI settlements a Date as per Cradlee, before the month’s Collection Reco is shown or downloaded.',def:true},
  {id:'monthFinalRule',group:'Month close',label:'Mark Month Final only from the month’s last day',hint:'Daily Sales & Exp and Attendance cannot be finalised before the month ends.',def:true},
  {id:'invoiceApproval',group:'Approvals',label:'Vendor bill above the limit needs Super Admin approval',hint:'The person entering it sends a request; it saves once a Super Admin approves.',def:false,limit:50000},
  {id:'bankFileApproval',group:'Approvals',label:'Bank payment file above the limit needs Super Admin approval',hint:'Bank Payment → download of the bank upload file (total of the file).',def:false,limit:200000},
  {id:'deleteApproval',group:'Approvals',label:'Deleting a vendor bill or payment needs Super Admin approval',hint:'Anyone else gets a request instead; once approved they can delete that one entry.',def:false},
  {id:'vendorBankApproval',group:'Approvals',label:'Changing a vendor’s bank account needs Super Admin approval',hint:'Stops payments being redirected to a new account without a check.',def:false},
  {id:'payablesDueAlert',group:'Alerts',label:'Vendor bills overdue or due this week',hint:'A strip on Vendors with the overdue amount and what falls due in 7 days (⏱ Ageing has the list).',def:false},
  {id:'bankRecoAlert',group:'Alerts',label:'Bank lines left unexplained for over 7 days',hint:'A strip on Bank Statement counting lines with no Nature and no linked bill.',def:false},
  {id:'budgetAlert',group:'Alerts',label:'Spending ahead of budget this month',hint:'A strip on the Outlet Dashboard when an expense line runs more than 10% ahead of its budget pace (budgets in P&L → MTD).',def:false},
  {id:'missingSalesBanner',group:'Reminders',label:'Show days with no Daily Sales on the outlet screen',hint:'A red strip on Daily Sales & Exp listing this month’s missing days (the nightly 🔔 check is under Automation).',def:false},
  {id:'paidLeave',group:'Employees',label:'Paid leave balance',hint:'Leave earned each month (days below) for the financial year; in Attendance, absent days can be paid from it (Paid leave column).',def:false,limit:1,limitLabel:'Days a month'},
  {id:'phoneCheckin',group:'Employees',label:'Phone check-in with selfie and location',hint:'Attendance → 📲 Check-in screen on the outlet phone; the manager marks check-in days Present. Distance allowed below.',def:false,limit:200,limitLabel:'Metres'},
  {id:'empStatement',group:'Employees',label:'Employee monthly statement on WhatsApp',hint:'Salary Working → Send Payslips adds days present, leave, advance balance and incentive to each message.',def:false},
];
const CONTROLS_KEY='salonos_controls';
function loadControls(){try{return JSON.parse(cachedLocalGet(CONTROLS_KEY)||'{}')||{};}catch(e){return{};}}
function saveControls(c){safeLocalSet(CONTROLS_KEY,JSON.stringify(c||{}));}
function controlDef(id){return CONTROL_DEFS.find(d=>d.id===id);}
// Outlet override wins; then the all-outlets switch; then the rule's default.
function controlOn(id,sid){
  const d=controlDef(id);if(!d)return true;
  const c=loadControls()[id]||{};
  if(sid!=null&&c.outlets&&typeof c.outlets[String(sid)]==='boolean')return c.outlets[String(sid)];
  return typeof c.on==='boolean'?c.on:d.def;
}
function controlLimit(id){const d=controlDef(id)||{};const c=loadControls()[id]||{};const v=Number(c.limit);return v>0?v:(d.limit||0);}

// ── Approvals ──
const APPROVALS_KEY='salonos_approvals';
function loadApprovals(){try{const a=JSON.parse(cachedLocalGet(APPROVALS_KEY)||'[]');return Array.isArray(a)?a:[];}catch(e){return[];}}
function saveApprovals(a){safeLocalSet(APPROVALS_KEY,JSON.stringify((a||[]).slice(-300)));}
const isSuperAdminUser=u=>!!u&&u.role==='Super Admin';
// key identifies the exact action (e.g. outlet|vendor|invoice no.|amount) so an approval is used once, for that action only.
function requireApproval({control,sid,key,summary}){
  if(!controlOn(control,sid))return true;
  const u=currentSessionUser();
  if(isSuperAdminUser(u))return true;
  const list=loadApprovals();const k=String(key);
  const ok=list.find(a=>a.control===control&&a.key===k&&a.status==='approved');
  if(ok){ok.status='used';ok.usedAt=new Date().toISOString();saveApprovals(list);return true;}
  const rej=list.filter(a=>a.control===control&&a.key===k&&a.status==='rejected').pop();
  if(list.some(a=>a.control===control&&a.key===k&&a.status==='pending')){window.alert('This is waiting for Super Admin approval:\n\n'+summary+'\n\nTry again once it is approved (Master Settings → 🎛 Controls → Approvals).');return false;}
  const d=controlDef(control)||{};
  if(!window.confirm((rej?'A Super Admin rejected this earlier'+(rej.note?' ('+rej.note+')':'')+'.\n\n':'')+d.label+'.\n\n'+summary+'\n\nSend it to a Super Admin for approval?'))return false;
  list.push({id:'AP'+Date.now()+Math.random().toString(36).slice(2,6),control,sid:sid==null?null:Number(sid),key:k,summary,by:(u&&(u.name||u.email))||'—',at:new Date().toISOString(),status:'pending'});
  saveApprovals(list);
  try{logAuditEvent(sid,{entity:'Approval',entityId:control,action:'Requested',summary});}catch(e){}
  window.alert('Sent for approval. Once a Super Admin approves it, do the same again and it will go through.');
  return false;
}
function decideApproval(id,status,note){
  const u=currentSessionUser();if(!isSuperAdminUser(u))return false;
  const list=loadApprovals();const a=list.find(x=>x.id===id);if(!a||a.status!=='pending')return false;
  a.status=status;a.decidedBy=u.name||u.email||'Super Admin';a.decidedAt=new Date().toISOString();if(note)a.note=note;saveApprovals(list);
  try{logAuditEvent(a.sid,{entity:'Approval',entityId:a.control,action:status==='approved'?'Approved':'Rejected',summary:a.summary+(note?' — '+note:'')});}catch(e){}
  return true;
}
function pendingApprovalsFor(u,salons){
  const vis=new Set((salonsForCurrentUser(salons)||[]).map(s=>String(s.id)));
  return loadApprovals().filter(a=>a.status==='pending'&&(a.sid==null||vis.has(String(a.sid))||isSuperAdminUser(u)));
}

// ── Master Settings card ──
function ControlsCenterCard({salons}){
  const h=React.createElement;const {toast}=useToast();
  const u=currentSessionUser();const canEdit=isSuperAdminUser(u);
  const [c,setC]=useState(()=>loadControls());const [open,setOpen]=useState(null);const [tab,setTab]=useState('rules');const [,tick]=useState(0);
  const outlets=(salons||[]).filter(s=>s&&s.id!=null&&s.status!=='Inactive');
  const upd=(id,patch)=>{if(!canEdit){toast('Only a Super Admin can change controls','error');return;}
    const n={...c,[id]:{...(c[id]||{}),...patch}};setC(n);saveControls(n);
    try{logAuditEvent(null,{entity:'Controls',entityId:id,action:'Changed',summary:(controlDef(id)||{}).label+' → '+JSON.stringify(patch)});}catch(e){}};
  const allOn=d=>typeof (c[d.id]||{}).on==='boolean'?c[d.id].on:d.def;
  const outletState=(d,sid)=>{const o=(c[d.id]||{}).outlets||{};return typeof o[String(sid)]==='boolean'?(o[String(sid)]?'on':'off'):'same';};
  const setOutlet=(d,sid,v)=>{const o={...((c[d.id]||{}).outlets||{})};if(v==='same')delete o[String(sid)];else o[String(sid)]=v==='on';upd(d.id,{outlets:o});};
  const pend=loadApprovals().filter(a=>a.status==='pending');const recent=loadApprovals().filter(a=>a.status!=='pending').slice(-15).reverse();
  const sname=sid=>{const s=(salons||[]).find(x=>String(x.id)===String(sid));return s?String(s.name).split('—')[0].trim():'All outlets';};
  const decide=(a,st)=>{let note='';if(st==='rejected'){note=window.prompt('Reason for rejecting (shown to the person who asked):','');if(note==null)return;}
    else if(!window.confirm('Approve?\n\n'+a.summary))return;
    if(decideApproval(a.id,st,note)){toast(st==='approved'?'Approved — they can now go ahead':'Rejected','success');tick(x=>x+1);}};
  const groups=[...new Set(CONTROL_DEFS.map(d=>d.group))];
  const sw=(on,onClick,dis)=>h('div',{className:'toggle-switch '+(on?'on':''),style:{flexShrink:0,opacity:dis?.5:1,cursor:dis?'not-allowed':'pointer'},onClick:dis?undefined:onClick,role:'switch','aria-checked':on});
  return h('div',{className:'card',style:{marginBottom:16}},
    h('div',{className:'card-title'},'🎛 Controls'),
    h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:10,lineHeight:1.6}},'Switch each check or approval rule on or off for all outlets, then open “Outlet-wise” to set a different choice for any outlet. '+(canEdit?'':'Only a Super Admin can change these.')),
    h('div',{className:'tab-bar',style:{marginBottom:10}},[['rules','Rules'],['appr','Approvals'+(pend.length?' ('+pend.length+')':'')]].map(([k,l])=>h('button',{key:k,className:'tab-btn '+(tab===k?'active':''),onClick:()=>setTab(k)},l))),
    tab==='rules'&&groups.map(g=>h('div',{key:g,style:{marginBottom:10}},
      h('div',{style:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'8px 0 2px'}},g),
      CONTROL_DEFS.filter(d=>d.group===g).map(d=>{const over=outlets.filter(s=>outletState(d,s.id)!=='same').length;
        return h('div',{key:d.id,style:{borderBottom:'1px solid var(--border)',padding:'10px 0'}},
          h('div',{style:{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}},
            h('div',{style:{flex:'1 1 240px',minWidth:0}},h('div',{style:{fontSize:13,color:'var(--text)',fontWeight:500}},d.label),h('div',{style:{fontSize:11.5,color:'var(--text3)'}},d.hint)),
            d.limit!=null&&h('label',{style:{fontSize:11.5,color:'var(--text3)',display:'flex',alignItems:'center',gap:4}},d.limitLabel||'Limit ₹',h('input',{type:'number',min:0,className:'form-control',style:{width:100,padding:'3px 6px'},disabled:!canEdit,value:(c[d.id]||{}).limit!=null?c[d.id].limit:d.limit,onChange:e=>upd(d.id,{limit:e.target.value})})),
            h('button',{className:'btn btn-ghost btn-sm',style:{whiteSpace:'nowrap'},onClick:()=>setOpen(open===d.id?null:d.id)},'Outlet-wise'+(over?' ('+over+')':'')+(open===d.id?' ▴':' ▾')),
            h('span',{style:{fontSize:11,color:'var(--text3)',width:62,textAlign:'right'}},'All outlets'),sw(allOn(d),()=>upd(d.id,{on:!allOn(d)}),!canEdit)),
          open===d.id&&h('div',{style:{marginTop:8,background:'var(--bg3)',borderRadius:'var(--r)',padding:'6px 10px'}},
            !outlets.length&&h('div',{style:{fontSize:12,color:'var(--text3)'}},'No outlets.'),
            outlets.map(s=>{const st=outletState(d,s.id);const eff=st==='same'?allOn(d):st==='on';
              return h('div',{key:s.id,style:{display:'flex',alignItems:'center',gap:8,padding:'4px 0',fontSize:12.5}},
                h('span',{style:{flex:1}},String(s.name).split('—')[0].trim()),
                h('span',{style:{fontSize:11,color:eff?'var(--green)':'var(--text3)',width:28}},eff?'On':'Off'),
                [['same','Same as all'],['on','On'],['off','Off']].map(([v,l])=>h('button',{key:v,disabled:!canEdit,className:'btn btn-sm '+(st===v?'btn-primary':'btn-ghost'),style:{padding:'2px 8px'},onClick:()=>setOutlet(d,s.id,v)},l)));})));}))),
    tab==='appr'&&h('div',null,
      !pend.length&&h('div',{style:{fontSize:12.5,color:'var(--text3)',padding:'6px 0'}},'Nothing waiting for approval.'),
      pend.map(a=>h('div',{key:a.id,style:{display:'flex',gap:10,alignItems:'center',borderBottom:'1px solid var(--border)',padding:'8px 0'}},
        h('div',{style:{flex:1,fontSize:12.5}},h('b',null,(controlDef(a.control)||{}).label||a.control),h('div',{style:{whiteSpace:'pre-wrap'}},a.summary),
          h('div',{style:{fontSize:11,color:'var(--text3)'}},sname(a.sid)+' · asked by '+a.by+' · '+new Date(a.at).toLocaleString('en-IN'))),
        canEdit&&h('button',{className:'btn btn-primary btn-sm',onClick:()=>decide(a,'approved')},'Approve'),
        canEdit&&h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>decide(a,'rejected')},'Reject'))),
      recent.length>0&&h('div',{style:{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',margin:'14px 0 4px'}},'Decided recently'),
      recent.map(a=>h('div',{key:a.id,style:{fontSize:12,color:'var(--text2)',padding:'3px 0'}},
        h('span',{style:{fontWeight:600,color:a.status==='rejected'?'var(--red)':'var(--green)'}},a.status==='rejected'?'Rejected':a.status==='used'?'Approved · used':'Approved'),' — ',a.summary.split('\n')[0],' · ',sname(a.sid),' · by ',a.decidedBy||'—'))));
}
// Strip shown to a Super Admin on every page while requests wait.
function PendingApprovalsStrip({salons,onOpen}){
  const h=React.createElement;const u=currentSessionUser();
  if(!isSuperAdminUser(u))return null;
  const n=loadApprovals().filter(a=>a.status==='pending').length;
  if(!n)return null;
  return h('div',{style:{background:'rgba(224,165,48,0.12)',border:'1px solid rgba(224,165,48,0.4)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,fontSize:12.5,display:'flex',alignItems:'center',gap:10}},
    h('span',null,'⏳ ',h('b',null,n),' request'+(n===1?'':'s')+' waiting for your approval'),
    onOpen&&h('button',{className:'btn btn-ghost btn-sm',onClick:onOpen},'Open approvals'));
}
// Vendor bill above the approval limit — new bills, or an edit that changes the amount.
function invoiceApprovalOk(sid,vendorKey,vendorName,invoiceNo,amount,origAmount){
  if(!controlOn('invoiceApproval',sid))return true;
  const amt=Math.round(Number(amount)||0),lim=controlLimit('invoiceApproval');
  if(amt<=lim||(origAmount!=null&&Math.round(Number(origAmount)||0)===amt))return true;
  return requireApproval({control:'invoiceApproval',sid,key:sid+'|'+vendorKey+'|'+String(invoiceNo||'').trim().toUpperCase()+'|'+amt,
    summary:'Vendor bill '+(invoiceNo||'—')+' of '+(vendorName||'vendor')+' for ₹'+amt.toLocaleString('en-IN')+' (limit ₹'+lim.toLocaleString('en-IN')+')'});
}
// Vendor bank account / IFSC changed on an existing vendor.
function vendorBankChangeOk(sid,before,after){
  const norm=v=>String(v||'').replace(/\s+/g,'').toUpperCase();
  if(!before||(!norm(before.accountNo)&&!norm(before.ifsc)))return true; // first time bank details are added
  if(norm(before.accountNo)===norm(after.accountNo)&&norm(before.ifsc)===norm(after.ifsc))return true;
  return requireApproval({control:'vendorBankApproval',sid,key:sid+'|'+before.id+'|'+norm(after.accountNo)+'|'+norm(after.ifsc),
    summary:'Bank account of '+(after.name||before.name||'vendor')+' changed from '+(norm(before.accountNo)||'—')+' / '+(norm(before.ifsc)||'—')+' to '+(norm(after.accountNo)||'—')+' / '+(norm(after.ifsc)||'—')});
}
// Bank upload file whose total is above the limit.
function bankFileApprovalOk(sid,total,count,label){
  if(!controlOn('bankFileApproval',sid))return true;
  const amt=Math.round(Number(total)||0),lim=controlLimit('bankFileApproval');
  if(amt<=lim)return true;
  return requireApproval({control:'bankFileApproval',sid,key:sid+'|'+(label||'')+'|'+count+'|'+amt,
    summary:'Bank payment file'+(label?' ('+label+')':'')+': '+count+' payment'+(count===1?'':'s')+', total ₹'+amt.toLocaleString('en-IN')+' (limit ₹'+lim.toLocaleString('en-IN')+')'});
}
