
function DueDateSheet({salon,onNavTab}={}){
  const salonId=salon?.id;
  const DUE_CATS=['PF Challan','ESIC Challan','GST Filing','PT Payment','TDS Payment','Salary Disbursement','Incentive Payment','Electricity Bill','Rent Payment','Vendor Payment','Maintenance','Other'];
  const BLANK={id:'',type:'PF Challan',desc:'',due:'',amount:'',status:'upcoming',paid:false,paidAmount:'',paidDate:'',attachment:null};
  const [dueDates,setDueDates]=useState(()=>{
    try{
      const raw=cachedLocalGet(outletKey('salonos_due_dates',salonId));
      if(raw!==null){const parsed=JSON.parse(raw);if(Array.isArray(parsed))return parsed;}
    }catch(e){}
    return[];
  });
  useEffect(()=>{safeLocalSet(outletKey('salonos_due_dates',salonId),JSON.stringify(dueDates));},[dueDates,salonId]);
  const [showModal,setShowModal]=useState(false);
  const [editItem,setEditItem]=useState(null);
  const [form,setForm]=useState(BLANK);
  const [showPayModal,setShowPayModal]=useState(null);
  const [payForm,setPayForm]=useState({paidAmount:'',paidDate:new Date().toISOString().slice(0,10),ref:''});
  // ── Match a payment against a Bank Statement debit transaction — same "🔗 Match from Bank
  // Statement" pattern Vendor Sheet uses, so marking something paid here can pull the real
  // amount/date/reference off what actually left the account instead of typing it in from
  // scratch. Reuses the bank row's own `linkedInvoice` field to remember the link (keyed
  // 'due|<id>' so it can't collide with an actual vendor invoice key), which also keeps it from
  // being offered again — to Vendor Sheet's own matcher or another Due Date item — once used. ──
  const [bankRows,setBankRows]=useState(()=>loadBankStatementRows(salonId));
  const refreshBankRows=()=>setBankRows(loadBankStatementRows(salonId));
  const [matchedBankRowId,setMatchedBankRowId]=useState(null);
  // ── Party-wise checkboxes — for Salary Disbursement / Incentive Payment (per employee, writes
  // to that sheet's own Payment Status) and PF Challan / ESIC Challan / PT Payment / TDS Payment
  // (per contributor — none of those have a sheet of their own to defer a per-party status to,
  // so paid contributors are tracked directly on that due item's own override as `paidKeys`).
  // Even though PF/ESIC/PT/TDS are each remitted as one combined government payment, tracking
  // which contributors are actually included still has real audit value. ──
  const PARTY_KEY_TYPES=new Set(['TDS Payment','PF Challan','ESIC Challan','PT Payment']);
  const [empSel,setEmpSel]=useState({}); // {partyId: boolean} — employee id, or a party's own `key`
  const payItemEmployees=(d)=>{
    if(!d)return[];
    if(d.type==='Vendor Payment'){
      if(d.vendorKey==null)return[];
      const invoices=loadVendorInvoices(salonId);
      return invoices.filter(inv=>{
        if(inv.docNature==='Performa Invoice')return false;
        const key=inv.vendorId!=null?String(inv.vendorId):'unknown';
        return key===d.vendorKey;
      }).map(inv=>{
        const paidSoFar=(inv.payments||[]).reduce((s,p)=>s+(Number(p.paidAmount)||0),0);
        const outstanding=Math.round((Number(inv.amount)||0)-paidSoFar);
        return{id:inv.id,name:'Inv# '+(inv.invoiceNo||'—'),desig:(inv.category||'Uncategorized')+(inv.dueDate?' · Due '+fmtDMY(toISO(inv.dueDate)):''),amount:outstanding};
      }).filter(i=>i.amount>0);
    }
    if(d.year==null||d.month==null)return[];
    if(d.type==='Salary Disbursement')return swWorkingsFor(salonId,d.year,d.month).filter(e=>e.net>0).map(e=>({id:e.id,name:e.name,desig:e.desig,amount:e.net}));
    if(d.type==='Incentive Payment')return incWorkingsFor(salonId,d.year,d.month).filter(e=>e.totalInc>0).map(e=>({id:e.id,name:e.name,desig:e.desig,amount:e.totalInc}));
    if(d.type==='TDS Payment'){
      const recurring=loadRecurringExpenses(salonId).filter(it=>it.status==='Active'&&it.tdsApplicable&&it.tdsSection);
      return tdsPartyDetailForMonth(salonId,d.year,d.month,recurring).map(p=>({id:p.key,name:p.party,desig:p.source+' · '+p.section,amount:p.amt}));
    }
    if(d.type==='PF Challan')return swWorkingsFor(salonId,d.year,d.month).filter(e=>e.pf&&((e.pfEmp||0)+(e.pfEr||0))>0).map(e=>({id:e.id,name:e.name,desig:e.desig,amount:(e.pfEmp||0)+(e.pfEr||0)}));
    if(d.type==='ESIC Challan')return swWorkingsFor(salonId,d.year,d.month).filter(e=>e.esic&&e.gross<=21000&&((e.esicEmp||0)+(e.esicEr||0))>0).map(e=>({id:e.id,name:e.name,desig:e.desig,amount:(e.esicEmp||0)+(e.esicEr||0)}));
    if(d.type==='PT Payment')return swWorkingsFor(salonId,d.year,d.month).filter(e=>(e.ptAmt||0)>0).map(e=>({id:e.id,name:e.name,desig:e.desig,amount:e.ptAmt}));
    return[];
  };
  const empPaidNow=(d,empId)=>{
    if(!d)return false;
    if(d.type==='Vendor Payment')return false; // a listed invoice is by definition still outstanding
    if(PARTY_KEY_TYPES.has(d.type)){
      const ov=loadDueAutoOverrides(salonId)[d.id]||{};
      return!!(ov.paidKeys&&ov.paidKeys[empId]);
    }
    const metaMap=d.type==='Salary Disbursement'?loadSWMeta(salonId):loadIWMeta(salonId);
    const m=metaMap[attMonthKey(empId,d.year,d.month)];
    return!!(m&&m.paymentStatus==='Paid');
  };
  const toggleEmpSel=(d,empId)=>{
    setEmpSel(prev=>{
      const next={...prev,[empId]:!prev[empId]};
      const emps=payItemEmployees(d);
      const sum=emps.filter(e=>next[e.id]).reduce((s,e)=>s+e.amount,0);
      setPayForm(f=>({...f,paidAmount:String(sum)}));
      return next;
    });
  };
  const [filterStatus,setFilterStatus]=useState('all');
  const [paidTick,setPaidTick]=useState(0); // bump to force a re-render after an auto item's paid-override changes
  const fc=(k)=>(e)=>setForm(f=>({...f,[k]:e.target.value}));
  const nextId=()=>Math.max(0,...dueDates.map(d=>d.id))+1;
  const openAdd=()=>{setForm({...BLANK,due:new Date().toISOString().slice(0,10)});setEditItem(null);setShowModal(true);};
  const openEdit=(d)=>{setForm({...d,amount:String(d.amount||'')});setEditItem(d);setShowModal(true);};
  const save=()=>{
    if(!form.type||!form.due){alert('Type and Due Date are required.');return;}
    const item={...form,id:form.id||nextId(),amount:Number(form.amount||0)};
    if(editItem)setDueDates(prev=>prev.map(d=>d.id===item.id?item:d));
    else setDueDates(prev=>[...prev,item]);
    setShowModal(false);
  };
  // ── Auto-generated items — PF/ESIC/PT from Salary Working, Vendor payables from the Vendor
  // Sheet (vendor-wise with Category). Recomputed fresh every render from live data, with only
  // their paid status persisted (see loadDueAutoOverrides) since everything else about them is
  // always derived, never stored — so they can never go stale the way a manually-entered item can. ──
  const autoItems=[...autoStatutoryDueItemsFor(salonId),...autoTdsDueItemsFor(salonId),...autoSalaryIncentiveDueItemsFor(salonId),...autoVendorDueItemsFor(salonId),...autoAmountUpdateReminders(salonId)];
  const allItems=[...autoItems,...dueDates];
  const markPaid=(d)=>{
    setShowPayModal(d);
    setPayForm({paidAmount:String(d.amount||''),paidDate:new Date().toISOString().slice(0,10),ref:''});
    setMatchedBankRowId(null);
    // Default: every employee not already Paid is pre-checked; already-Paid ones stay checked too
    // (informational — unchecking one would revert them to Not Paid on Confirm).
    const emps=payItemEmployees(d);
    const sel={};emps.forEach(e=>{sel[e.id]=true;});
    setEmpSel(sel);
  };
  const applyBankMatch=(row)=>{
    setPayForm(f=>({...f,paidAmount:String(row.debit||f.paidAmount),paidDate:toISO(row.transactionDate)||f.paidDate,ref:row.refNo||''}));
    setMatchedBankRowId(row.id);
  };
  const confirmPaid=()=>{
    const d=showPayModal;
    const linkKey='due|'+d.id;
    if(matchedBankRowId!=null){
      const nextRows=bankRows.map(r=>r.id===matchedBankRowId?{...r,linkedInvoice:linkKey}:r);
      saveBankStatementRows(nextRows,salonId);
      setBankRows(nextRows);
    }
    if(d.type==='Vendor Payment'){
      // Invoice-wise — records a REAL payment against each checked invoice, straight in Vendor
      // Sheet's own payments array (same as recording one there by hand). No status flag to keep
      // in sync: once an invoice's outstanding balance hits ₹0 it simply stops appearing in this
      // vendor's group next render — the group itself disappears once every invoice is settled.
      const invs=payItemEmployees(d);
      const checked=invs.filter(i=>empSel[i.id]);
      if(checked.length){
        const checkedIds=new Set(checked.map(i=>i.id));
        const allInvoices=loadVendorInvoices(salonId);
        const nextInvoices=allInvoices.map(inv=>{
          if(!checkedIds.has(inv.id))return inv;
          const paidSoFar=(inv.payments||[]).reduce((s,p)=>s+(Number(p.paidAmount)||0),0);
          const outstanding=Math.round((Number(inv.amount)||0)-paidSoFar);
          if(outstanding<=0)return inv;
          const paymentId='due-'+Date.now()+'-'+inv.id;
          return{...inv,payments:[...(inv.payments||[]),{id:paymentId,paidAmount:outstanding,paidDate:payForm.paidDate,mode:'Bank Transfer',ref:payForm.ref||'',note:'Marked Paid via Due Date Tracker'}]};
        });
        saveVendorInvoices(nextInvoices,salonId);
      }
      setPaidTick(t=>t+1);
    }else if(d.type==='Salary Disbursement'||d.type==='Incentive Payment'){
      // Employee-wise — write straight to Salary/Incentive Working's own per-employee Payment
      // Status for whichever employees are checked; uncheck one and it goes back to Not Paid.
      // The due item's own overall "Paid" status is then always derived live from these (see
      // autoSalaryIncentiveDueItemsFor's metaPaid check) — nothing extra to keep in sync here.
      const emps=payItemEmployees(d);
      const loadMeta=d.type==='Salary Disbursement'?loadSWMeta:loadIWMeta;
      const saveMeta=d.type==='Salary Disbursement'?saveSWMeta:saveIWMeta;
      const meta=loadMeta(salonId);
      const next={...meta};
      emps.forEach(e=>{
        const key=attMonthKey(e.id,d.year,d.month);
        const cur=next[key]||{status:'Draft',paymentStatus:'Not Paid',mode:''};
        next[key]={...cur,paymentStatus:empSel[e.id]?'Paid':'Not Paid',mode:empSel[e.id]?'Bank Transfer':''};
      });
      saveMeta(next,salonId);
      setPaidTick(t=>t+1);
    }else if(PARTY_KEY_TYPES.has(d.type)){
      // Party-wise — PF Challan/ESIC Challan/PT Payment/TDS Payment have no sheet of their own
      // to defer a per-party status to, so the checked contributors are stored directly on this
      // item's own override.
      saveDueAutoOverride(salonId,d.id,{paidKeys:{...empSel},paidAmount:payForm.paidAmount,paidDate:payForm.paidDate,ref:payForm.ref,bankRowId:matchedBankRowId});
      setPaidTick(t=>t+1);
    }else if(d.auto){
      saveDueAutoOverride(salonId,d.id,{paid:true,paidAmount:payForm.paidAmount,paidDate:payForm.paidDate,ref:payForm.ref,bankRowId:matchedBankRowId});
      setPaidTick(t=>t+1); // auto items aren't in React state, so force a re-render to reflect the change
    } else {
      setDueDates(prev=>prev.map(x=>x.id===d.id?{...x,paid:true,status:'done',paidAmount:payForm.paidAmount,paidDate:payForm.paidDate,ref:payForm.ref,bankRowId:matchedBankRowId}:x));
    }
    setShowPayModal(null);
  };
  const unmarkPaid=(d)=>{
    // Frees up the linked bank transaction again, if there was one, so it goes back to being an
    // available candidate for reconciliation.
    if(d.bankRowId!=null){
      const nextRows=bankRows.map(r=>r.id===d.bankRowId&&r.linkedInvoice==='due|'+d.id?{...r,linkedInvoice:''}:r);
      saveBankStatementRows(nextRows,salonId);
      setBankRows(nextRows);
    }
    if(d.type==='Salary Disbursement'||d.type==='Incentive Payment'){
      // Reverts every employee behind this item back to Not Paid — mirrors "un-checking everyone".
      const emps=payItemEmployees(d);
      const loadMeta=d.type==='Salary Disbursement'?loadSWMeta:loadIWMeta;
      const saveMeta=d.type==='Salary Disbursement'?saveSWMeta:saveIWMeta;
      const meta=loadMeta(salonId);
      const next={...meta};
      emps.forEach(e=>{
        const key=attMonthKey(e.id,d.year,d.month);
        if(next[key])next[key]={...next[key],paymentStatus:'Not Paid',mode:''};
      });
      saveMeta(next,salonId);
      setPaidTick(t=>t+1);
    }else if(PARTY_KEY_TYPES.has(d.type)){
      saveDueAutoOverride(salonId,d.id,{paidKeys:{},paidAmount:'',paidDate:'',ref:'',bankRowId:null});
      setPaidTick(t=>t+1);
    }else if(d.auto){
      saveDueAutoOverride(salonId,d.id,{paid:false,paidAmount:'',paidDate:'',ref:'',bankRowId:null});
      setPaidTick(t=>t+1);
    } else {
      setDueDates(prev=>prev.map(x=>x.id===d.id?{...x,paid:false,status:'upcoming',paidAmount:'',paidDate:'',ref:'',bankRowId:null}:x));
    }
  };
  const getStatusColor={overdue:'var(--red)',soon:'var(--orange)',ok:'var(--green)',done:'var(--text3)',upcoming:'var(--blue)'};
  const getStatusIcon={overdue:'🔴',soon:'🟡',ok:'🟢',done:'✅',upcoming:'🔵'};
  const filtered=allItems.filter(d=>filterStatus==='all'||d.status===filterStatus)
    .sort((a,b)=>(a.paid===b.paid?0:a.paid?1:-1)||String(a.due||'').localeCompare(String(b.due||'')));
  const overdue=allItems.filter(d=>d.status==='overdue'&&!d.paid).length;
  const soon=allItems.filter(d=>d.status==='soon'&&!d.paid).length;
  const done=allItems.filter(d=>d.paid).length;
  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,React.createElement('div',{className:'page-title'},'Due Date Tracker'),React.createElement('div',{className:'page-sub'},'Compliance, salary, rent, GST, TDS and vendor payments')),
      React.createElement('div',{style:{display:'flex',gap:8}},
        onNavTab&&React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Jump to Bank Statement',onClick:()=>onNavTab('bank-statement')},'🏦 Bank Statement'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},onClick:async()=>{
          const hdr=['Type','Description','Due Date','Amount','Status','Paid','Paid Amount','Paid Date','Source'];
          const rows=allItems.map(d=>[d.type,d.desc,d.due||'',Number(d.amount)||0,d.status,d.paid?'Yes':'No',Number(d.paidAmount)||0,d.paidDate||'',d.auto?'Auto':'Manual']);
          const totalAmount=rows.reduce((s,r)=>s+r[3],0),totalPaid=rows.reduce((s,r)=>s+r[6],0);
          const sheetRows=[hdr,...rows,['Total','','',totalAmount,'','',totalPaid,'','']];
          try{
            const blob=await exportReportExcelBlob('Due Dates — '+(salon?.name||'Outlet'),sheetRows);
            const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='DueDates_'+(salon?salon.name.split('—')[0].trim().replace(/\s+/g,'_'):'Outlet')+'.xlsx';a.click();URL.revokeObjectURL(url);
          }catch(err){alert(err.message||'Could not build the Excel file — please try again.');}
        }},'⬇ Export Excel'),
        React.createElement('button',{className:'btn btn-primary btn-sm',onClick:openAdd},'+ Add Due Date')
      )
    ),
    React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:12,lineHeight:1.6}},
      "PF, ESIC and PT items are auto-generated from Salary Working's own figures for this outlet; Vendor Payment items are auto-generated from the Vendor Sheet's outstanding balances, vendor-wise with Category. Anything else is added manually below."),
    React.createElement('div',{className:'grid4',style:{marginBottom:16}},
      [{label:'Total Items',val:allItems.length,color:'blue'},{label:'Overdue',val:overdue,color:'red'},{label:'Due Soon',val:soon,color:'amber'},{label:'Completed',val:done,color:'green'}].map(m=>
        React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},React.createElement('div',{className:'metric-label'},m.label),React.createElement('div',{className:'metric-value'},m.val))
      )
    ),
    React.createElement('div',{style:{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}},
      ['all','overdue','soon','ok','done','upcoming'].map(s=>React.createElement('button',{key:s,className:`btn btn-sm ${filterStatus===s?'btn-primary':'btn-ghost'}`,onClick:()=>setFilterStatus(s)},s==='all'?'All':s.charAt(0).toUpperCase()+s.slice(1)))
    ),
    React.createElement('div',{className:'card'},
      filtered.length===0
        ?React.createElement('div',{style:{textAlign:'center',padding:32,color:'var(--text3)'}},'No items found.')
        :filtered.map(d=>React.createElement('div',{key:d.id,style:{
            display:'flex',alignItems:'flex-start',gap:14,padding:14,
            borderRadius:'var(--r)',marginBottom:8,
            background:d.paid?'var(--bg3)':'var(--bg3)',
            borderLeft:'3px solid '+(d.paid?'var(--border)':getStatusColor[d.status]||'var(--border)'),
            opacity:d.paid?0.7:1
          }},
          React.createElement('div',{style:{fontSize:20,marginTop:2}},getStatusIcon[d.status]||'📅'),
          React.createElement('div',{style:{flex:1}},
            React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:3}},
              React.createElement('span',{style:{fontWeight:600,fontSize:13,color:'var(--text)'},title:DUE_TYPE_HINTS[d.type]||''},d.type),
              d.auto&&React.createElement('span',{className:'badge badge-blue',title:'Auto-generated — recomputed live from Salary Working / Vendor Sheet'},'AUTO'),
              d.paid&&React.createElement('span',{className:'badge badge-green'},'PAID'),
              d.amount>0&&React.createElement('span',{style:{fontSize:12,color:'var(--text2)',marginLeft:4}},'₹'+Number(d.amount).toLocaleString())
            ),
            React.createElement('div',{style:{fontSize:12,color:'var(--text2)'}},d.desc),
            d.paid&&d.paidDate&&React.createElement('div',{style:{fontSize:11,color:'var(--green)',marginTop:2}},
              'Paid ₹'+(d.paidAmount||0)+' on '+d.paidDate,
              d.bankRowId!=null&&(onNavTab
                ?React.createElement('span',{style:{cursor:'pointer',textDecoration:'underline'},title:'Jump to this transaction on Bank Statement',onClick:(ev)=>{ev.stopPropagation();onNavTab('bank-statement');}},' · 🔗 linked to Bank Statement')
                :' · 🔗 linked to Bank Statement'),
              d.ref?' · Ref '+d.ref:'')
          ),
          React.createElement('div',{style:{textAlign:'right',flexShrink:0}},
            React.createElement('div',{style:{fontSize:13,fontWeight:600,color:d.paid?'var(--text3)':getStatusColor[d.status]||'var(--text2)',marginBottom:6}},d.due),
            React.createElement('div',{style:{display:'flex',gap:4,justifyContent:'flex-end'}},
              !d.paid&&React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(76,175,125,0.15)',border:'1px solid rgba(76,175,125,0.4)',color:'var(--green)',padding:'4px 10px',borderRadius:'var(--r)',cursor:'pointer',fontSize:11,fontWeight:500},onClick:()=>markPaid(d)},'✓ Mark Paid'),
              d.paid&&d.auto&&React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>unmarkPaid(d)},'↩ Unmark Paid'),
              !d.auto&&React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>openEdit(d)},'Edit'),
              !d.auto&&React.createElement('button',{'aria-label':'Delete',className:'btn btn-sm',style:{background:'rgba(255,107,107,0.08)',border:'1px solid rgba(255,107,107,0.2)',color:'var(--red)',padding:'4px 8px',borderRadius:'var(--r)',cursor:'pointer',fontSize:11},onClick:()=>{if(confirm('Delete this due-date item ('+d.type+' \u2014 '+d.due+')?'))setDueDates(prev=>prev.filter(x=>x.id!==d.id));}},React.createElement(IconTrash,{size:14}))
            )
          )
        ))
    ),
    // ADD/EDIT MODAL
    showModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowModal(false)},
      React.createElement('div',{className:'modal',style:{width:560},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},editItem?'Edit Due Date':'Add Due Date'),
        React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-103'},'Category *'),React.createElement('select',{id:'f-103',className:'form-control',value:form.type,onChange:fc('type')},DUE_CATS.map(c=>React.createElement('option',{key:c},c)))),
        React.createElement('div',{className:'form-group',style:{marginBottom:14}},React.createElement('label',{htmlFor:'f-104'},'Description'),React.createElement('input',{id:'f-104',className:'form-control',value:form.desc,onChange:fc('desc'),placeholder:'e.g. PF deposit for January 2024'})),
        React.createElement('div',{className:'form-row cols3'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-105'},'Due Date *'),React.createElement('input',{id:'f-105',type:'date',className:'form-control',value:form.due,onChange:fc('due')})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-106'},'Amount (₹)'),React.createElement('input',{id:'f-106',type:'number',className:'form-control',value:form.amount,onChange:fc('amount'),placeholder:'0 if not applicable'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-107'},'Status'),React.createElement('select',{id:'f-107',className:'form-control',value:form.status,onChange:fc('status')},['upcoming','ok','soon','overdue','done'].map(s=>React.createElement('option',{key:s},s))))
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowModal(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:save},editItem?'Save Changes':'Add Due Date')
        )
      )
    ),
    // MARK PAID MODAL
    showPayModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowPayModal(null)},
      React.createElement('div',{className:'modal',style:{width:(showPayModal.type==='Salary Disbursement'||showPayModal.type==='Incentive Payment'||showPayModal.type==='Vendor Payment'||PARTY_KEY_TYPES.has(showPayModal.type))?520:460,maxHeight:'85vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Mark as Paid — '+showPayModal.type),
        React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:16,fontSize:12,color:'var(--text2)'}},showPayModal.desc),
        (showPayModal.type==='Salary Disbursement'||showPayModal.type==='Incentive Payment'||showPayModal.type==='Vendor Payment'||PARTY_KEY_TYPES.has(showPayModal.type))&&(()=>{
          const isPartyWise=PARTY_KEY_TYPES.has(showPayModal.type);
          const isVendor=showPayModal.type==='Vendor Payment';
          const emps=payItemEmployees(showPayModal);
          const checkedCount=emps.filter(e=>empSel[e.id]).length;
          const allChecked=emps.length>0&&checkedCount===emps.length;
          return React.createElement('div',{style:{marginBottom:16}},
            React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}},
              React.createElement('div',{style:{fontSize:11.5,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.06em'}},(isVendor?'✓ Invoices Being Paid (':isPartyWise?'✓ Contributors Remitted (':'✓ Employees Being Paid (')+checkedCount+' of '+emps.length+')'),
              React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:10.5,padding:'2px 8px'},onClick:()=>{
                const sel={};emps.forEach(e=>{sel[e.id]=!allChecked;});
                setEmpSel(sel);
                const sum=allChecked?0:emps.reduce((s,e)=>s+e.amount,0);
                setPayForm(f=>({...f,paidAmount:String(sum)}));
              }},allChecked?'Uncheck All':'Check All')
            ),
            React.createElement('div',{style:{maxHeight:180,overflowY:'auto',border:'1px solid var(--border)',borderRadius:'var(--r)'}},
              emps.map((e,i)=>{
                const alreadyPaid=empPaidNow(showPayModal,e.id);
                return React.createElement('label',{key:e.id,style:{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',cursor:'pointer',borderBottom:i<emps.length-1?'1px solid var(--border)':'none',background:empSel[e.id]?'rgba(76,175,125,0.06)':'transparent'}},
                  React.createElement('input',{type:'checkbox',checked:!!empSel[e.id],onChange:()=>toggleEmpSel(showPayModal,e.id)}),
                  React.createElement('div',{style:{flex:1}},
                    React.createElement('div',{style:{fontSize:12.5,color:'var(--text)'}},e.name+' — '+e.desig),
                    alreadyPaid&&React.createElement('div',{style:{fontSize:10,color:'var(--green)'}},isPartyWise?'Already marked Remitted':'Already marked Paid')
                  ),
                  React.createElement('div',{style:{fontWeight:600,fontSize:12.5,color:'var(--text)'}},'₹'+Math.round(e.amount).toLocaleString('en-IN'))
                );
              })
            ),
            React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:6,lineHeight:1.5}},
              isVendor
                ?'Confirming Payment records a real payment against every checked invoice, straight in Vendor Sheet — same as recording one there by hand. A fully-settled invoice simply stops showing up here on its own; nothing to undo separately.'
                :showPayModal.type==='TDS Payment'
                ?'Each contributor here is a Recurring Expense payee (or Salary\'s own Section 192 total) whose TDS makes up this month\'s figure — check off whichever have actually been remitted to the government; the item only reads as fully Paid once every contributor is checked.'
                :isPartyWise
                ?'Even though '+showPayModal.type+' is remitted to the government as one combined payment covering every employee, this tracks which employees\' contributions are actually confirmed/included — the item only reads as fully Paid once every employee that month is checked.'
                :'Unchecking an employee here sets their own Payment Status back to Not Paid on '+(showPayModal.type==='Salary Disbursement'?'Salary Working':'Incentive Working')+' — this writes straight to that sheet, so the two screens always agree on who\'s actually been paid.')
          );
        })(),
        (()=>{
          const candidates=bankRows.filter(r=>r.debit>0&&!r.linkedInvoice)
            .sort((a,b)=>Math.abs((a.debit||0)-(showPayModal.amount||0))-Math.abs((b.debit||0)-(showPayModal.amount||0)))
            .slice(0,8);
          return React.createElement('div',{style:{marginBottom:16}},
            React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}},
              React.createElement('div',{style:{fontSize:11.5,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.06em'}},'🔗 Link with Bank Statement'),
              React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:10.5,padding:'2px 8px'},onClick:refreshBankRows},'⟳ Refresh')
            ),
            candidates.length===0
              ?React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',padding:'10px 0'}},'No unlinked debit transactions found in Bank Statement — closest matches by amount will show here once there are some.')
              :React.createElement('div',{style:{maxHeight:150,overflowY:'auto'}},
                  candidates.map(r=>React.createElement('div',{key:r.id,
                    onClick:()=>applyBankMatch(r),
                    style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',border:'1px solid '+(matchedBankRowId===r.id?'var(--green)':'var(--border)'),borderRadius:'var(--r)',marginBottom:6,cursor:'pointer',background:matchedBankRowId===r.id?'rgba(76,175,125,0.08)':'transparent'}
                  },
                    React.createElement('div',null,
                      React.createElement('div',{style:{fontSize:12,color:'var(--text)'}},r.description),
                      React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)'}},r.transactionDate+(r.refNo?' · Ref '+r.refNo:''))
                    ),
                    React.createElement('div',{style:{fontWeight:600,color:Math.abs((r.debit||0)-(showPayModal.amount||0))<1?'var(--green)':'var(--red)',fontSize:12.5}},'₹'+Number(r.debit).toLocaleString()+(Math.abs((r.debit||0)-(showPayModal.amount||0))<1?' ✓':''))
                  ))
                ),
            matchedBankRowId!=null&&React.createElement('div',{style:{fontSize:11,color:'var(--green)',marginTop:4}},'✓ Selected — amount, date and reference filled in below. Change any field if needed, or mark paid without linking a transaction.')
          );
        })(),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-108'},'Amount Paid (₹)'),React.createElement('input',{id:'f-108',type:'number',className:'form-control',value:payForm.paidAmount,onChange:e=>setPayForm(f=>({...f,paidAmount:e.target.value})),placeholder:'0'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-109'},'Payment Date'),React.createElement('input',{id:'f-109',type:'date',className:'form-control',value:payForm.paidDate,onChange:e=>setPayForm(f=>({...f,paidDate:e.target.value}))}))
        ),
        React.createElement('div',{className:'form-group',style:{marginBottom:14}},React.createElement('label',{htmlFor:'f-110'},'Reference / UTR No.'),React.createElement('input',{id:'f-110',className:'form-control',value:payForm.ref,onChange:e=>setPayForm(f=>({...f,ref:e.target.value})),placeholder:'Transaction ref'})),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowPayModal(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-success',onClick:confirmPaid},'Confirm Payment')
        )
      )
    )
  );
}

/* ---------- FS handle persistence (for Downloads-folder auto-import) ---------- */
function fsIdbOpen(){
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(new Error('IndexedDB not available'));return;}
    const req=indexedDB.open('salonos_fs_handles',1);
    req.onupgradeneeded=()=>{req.result.createObjectStore('handles');};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function fsIdbSet(key,val){
  const db=await fsIdbOpen();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('handles','readwrite');
    tx.objectStore('handles').put(val,key);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}
async function fsIdbGet(key){
  const db=await fsIdbOpen();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('handles','readonly');
    const req=tx.objectStore('handles').get(key);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error);
  });
}
async function fsIdbDelete(key){
  const db=await fsIdbOpen();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('handles','readwrite');
    tx.objectStore('handles').delete(key);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}

function CollectionReco({salon,onNavTab}={}){
  const salonId=salon?.id;
  const csWrapRef=useRef(null);
  const csCellRange=useExcelCellRange(csWrapRef);
  const money=(n)=>formatMoney(n);
  // Consolidate Difference is flagged red once it exceeds this % of that day's Card + UPI As Per
  // Cradlee — adjustable per outlet (not a fixed 2%), persisted like everything else here.
  const [csDiffThresholdPct,setCsDiffThresholdPct]=useState(()=>{
    try{const v=cachedLocalGet(outletKey('salonos_cs_diff_threshold',salonId));if(v!==null){const n=Number(v);if(!isNaN(n)&&n>=0)return n;}}catch(e){}
    return 2;
  });
  useEffect(()=>{safeLocalSet(outletKey('salonos_cs_diff_threshold',salonId),String(csDiffThresholdPct));},[csDiffThresholdPct,salonId]);
  // Which imported columns feed "Card As Per Cradlee", beyond Card itself — Wallet/District/Luzo/
  // Online are all electronic-payout channels that get settled through the bank the same way Card
  // does, so they belong in the same bucket for matching against Bank Statement's Card Settlement
  // credits. Checkable per outlet in case one of these actually settles differently there.
  const CS_CARD_EXTRA_COLS=[{key:'wallet',label:'Wallet'},{key:'district',label:'District'},{key:'luzo',label:'Luzo'},{key:'online',label:'Online'}];
  const [csCardIncludeCols,setCsCardIncludeCols]=useState(()=>{
    try{const v=cachedLocalGet(outletKey('salonos_cs_card_include_cols',salonId));if(v!==null){const parsed=JSON.parse(v);if(parsed&&typeof parsed==='object')return parsed;}}catch(e){}
    return{wallet:true,district:true,luzo:true,online:true};
  });
  useEffect(()=>{safeLocalSet(outletKey('salonos_cs_card_include_cols',salonId),JSON.stringify(csCardIncludeCols));},[csCardIncludeCols,salonId]);
  const toggleCsCardIncludeCol=(key)=>setCsCardIncludeCols(prev=>({...prev,[key]:!prev[key]}));
  const REQUIRED=['Center Name','InvoiceDate','Cash','Card','UPI','Wallet','District','Luzo','Online','Total'];
  const SAMPLE=['CUT&STYLE Koramangala 2','01/06/2026',7264,3686,25253,2000,0,1500,1500,41203];
  // Only these are truly required to identify a transaction. Every payment-mode column
  // (Cash/Card/UPI/Wallet/District/Luzo/Online/Total) is optional on import — a report that's
  // missing one (e.g. a centre with no Wallet transactions and no Wallet column at all) still
  // imports fine, with that column simply treated as ₹0.
  const MANDATORY=['Center Name','InvoiceDate'];
  const [rows,setRows]=useState(()=>{
    try{return JSON.parse(cachedLocalGet(outletKey('salonos_cradlee_collection_rows',salonId))||'[]');}catch(e){return[];}
  });
  const [fileName,setFileName]=useState('');
  const [message,setMessage]=useState('');
  const [dragging,setDragging]=useState(false);
  // Same append-vs-replace choice as Bank Statement — defaults to append once there's already
  // data, since a fresh daily/monthly Cradlee export overlapping a previous one is the normal
  // case, not the exception. Persisted (not just local component state) and shared by key with
  // Collection Sheet's own loadWorkbook below — both read/write the same
  // salonos_cradlee_collection_rows data, and Collection Sheet's copy of this logic only ever
  // runs via the silent Downloads-folder auto-import (it has no upload button of its own), so it
  // needs to follow whatever mode was last chosen here rather than defining its own disconnected
  // toggle no one would see.
  const [importMode,setImportMode]=useState(()=>{try{return cachedLocalGet(outletKey('salonos_cradlee_import_mode',salonId))||'append';}catch(e){return'append';}});
  useEffect(()=>{safeLocalSet(outletKey('salonos_cradlee_import_mode',salonId),importMode);},[importMode,salonId]);
  const [search,setSearch]=useState('');
  const [selected,setSelected]=useState(()=>new Set());
  const fileRef=useRef(null);

  useEffect(()=>{
    safeLocalSet(outletKey('salonos_cradlee_collection_rows',salonId),JSON.stringify(rows));
  },[rows,salonId]);

  // ── AI Reconciliation Sheet — cross-checks Collection Reco against the Bank Statement's
  // Card/UPI Settlement credits (linked by Date as per Cradlee) using the Claude API. ──
  const [aiRows,setAiRows]=useState(null);
  const [aiLoading,setAiLoading]=useState(false);
  const [aiError,setAiError]=useState('');
  const generateAIReco=async()=>{
    setAiLoading(true);setAiError('');setAiRows(null);
    try{
      let bankRows=[];
      try{bankRows=JSON.parse(cachedLocalGet(outletKey('salonos_bank_statement_rows',salonId))||'[]');}catch(e){}
      const settlements=bankRows.filter(r=>(r.nature==='Card Settlement'||r.nature==='UPI Settlement')&&r.cradleeDate)
        .map(r=>({date:r.cradleeDate,nature:r.nature,amount:r.credit}));
      if(!rows.length)throw new Error('Import a Collection Report first — there\'s nothing to reconcile yet.');
      if(!settlements.length)throw new Error('No Card Settlement / UPI Settlement rows found in Bank Statement yet — import a bank statement and classify (or auto-classify) those rows first.');
      const collections=rows.map(r=>({date:r.invoiceDate,centre:r.centerName,cash:r.cash,card:r.card,upi:r.upi,wallet:r.wallet,total:r.total}));
      const prompt='You are reconciling salon collections (from a Cradlee Collection Report) against bank settlement credits.\n\n'+
        'Bank settlements (Card/UPI Settlement credits from Bank Statement, keyed by "Date as per Cradlee"):\n'+JSON.stringify(settlements)+'\n\n'+
        'Collection Reco entries (one per centre per day):\n'+JSON.stringify(collections)+'\n\n'+
        'For each unique (date, nature) settlement, sum the matching Collection Reco amounts for that exact date across all centres '+
        '(Card Settlement -> sum "card"; UPI Settlement -> sum "upi"), and compare that sum to the bank settlement amount.\n'+
        'Respond with ONLY a raw JSON array (no markdown fences, no prose, no explanation) of objects shaped exactly like:\n'+
        '{"date":"DD/MM/YYYY","nature":"Card Settlement or UPI Settlement","bankAmount":number,"collectionAmount":number,"difference":number,"status":"Matched or Mismatch or No Collection Data","note":"one short sentence"}\n'+
        'Keep it concise: one entry per (date, nature) pair, at most 15 entries, sorted by date descending.';
      const response=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1000,messages:[{role:'user',content:prompt}]})
      });
      if(!response.ok)throw new Error('API request failed (HTTP '+response.status+')');
      const data=await response.json();
      const textOut=(data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
      const clean=textOut.replace(/```json|```/g,'').trim();
      const parsed=JSON.parse(clean);
      if(!Array.isArray(parsed))throw new Error('Unexpected response shape from the AI.');
      setAiRows(parsed);
    }catch(err){
      setAiError('Could not generate the AI reconciliation ('+err.message+'). This calls the Anthropic API directly from the page — it only works while this is running inside Claude; if you\'ve saved this file and are opening it as a plain local file in your own browser, this specific button won\'t be able to reach the API. The Settlement Reconciliation table on the Bank Statement tab does the same date-based matching without needing the API, as a fallback.');
    }
    setAiLoading(false);
  };

  // ── Collection Sheet — daily reconciliation table: Cradlee vs Counter Report (Cash) and
  // Cradlee vs Bank Statement settlements (Card/UPI), plus a running Consolidate Difference.
  // "Cash As Per Counter Report" reads Daily Sales & Exp's "Cash Sale" row (row index 0 there)
  // for the matching date, rather than being entered separately — same real-world figure, one
  // place to type it in. Read fresh whenever this sheet mounts. ──
  const [dseCashSaleByIso]=useState(()=>{try{return JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',salonId))||'{}');}catch(e){return{};}});
  const cashFromDailySalesFor=(dmyDate)=>{
    const iso=toISO(dmyDate);
    const dayEntry=iso&&dseCashSaleByIso[iso];
    const v=dayEntry&&dayEntry[0]; // row 0 = Cash Sale in Daily Sales & Exp's SALES_ROWS
    return(v!=null&&v!=='')?v:'';
  };
  // Tip To Employee, per date — for the Reco of Actual Bank Charges table below, which nets it
  // out against Consolidate Difference (tips paid out in cash reduce what should have landed as
  // card/UPI settlement, so they're a genuine, explainable part of the difference, not a charge).
  const [dseExpenseByIso]=useState(()=>loadDseDataFor(salonId));
  const tipRowIdx=EXPENSE_ROWS.findIndex(r=>r.name==='Tip To Employee');
  const tipForDate=(dmyDate)=>{
    const iso=toISO(dmyDate);
    const v=iso&&dseExpenseByIso[iso]&&dseExpenseByIso[iso][tipRowIdx];
    return(v!=null&&v!=='')?(Number(v)||0):0;
  };
  const [reasonForDiff,setReasonForDiff]=useState(()=>{try{return JSON.parse(cachedLocalGet(outletKey('salonos_collection_reason_diff',salonId))||'{}');}catch(e){return{};}});
  useEffect(()=>{safeLocalSet(outletKey('salonos_collection_reason_diff',salonId),JSON.stringify(reasonForDiff));},[reasonForDiff,salonId]);
  // ── Reason for Diff — was a free-text note, now a dropdown of the reasons that actually
  // explain a Cash/Card/UPI difference, each with its own amount plus whatever extra detail that
  // reason needs (see REASON_EXTRA_FIELDS): money genuinely owed from last month showing up this
  // month (Previous Month Collection), a sale that hasn't come in as cash/card/UPI yet because it
  // was sold on credit (Credit Sale, with Invoice No. and Party Name), a shortfall at the counter
  // (Short Collection), or an overage (Excess Collection) — the latter two each with a free-text
  // Reason explaining why. Old free-text notes (plain strings, from before this changed) still
  // display for reference; selecting a reason replaces the note with the structured shape below.
  const REASON_EXTRA_FIELDS={
    invoiceNo:{label:'Invoice No.',placeholder:'e.g. INV-1042'},
    partyName:{label:'Party Name',placeholder:'e.g. Ramesh Traders'},
    reason:{label:'Reason',placeholder:'Explain why…'},
  };
  const REASON_TYPES=[
    {id:'prevMonth',label:'Previous Month Collection',fields:[]},
    {id:'creditSale',label:'Credit Sale',fields:['invoiceNo','partyName']},
    {id:'shortCollection',label:'Short Collection',fields:['reason']},
    {id:'excessCollection',label:'Excess Collection',fields:['reason']},
  ];
  const reasonEntryFor=(date)=>{
    const v=reasonForDiff[date];
    if(v&&typeof v==='object')return v;
    if(typeof v==='string'&&v)return{legacy:v};
    return null;
  };
  const setReasonType=(date,type)=>setReasonForDiff(prev=>{
    const cur=prev[date];
    const carryAmount=(cur&&typeof cur==='object'&&cur.type===type)?cur.amount:'';
    if(!type)return{...prev,[date]:''};
    return{...prev,[date]:{type,amount:carryAmount}};
  });
  const setReasonField=(date,field,value)=>setReasonForDiff(prev=>({...prev,[date]:{...(prev[date]&&typeof prev[date]==='object'?prev[date]:{}),[field]:value}}));
  // Previous Month Collection, for reference — last month's total Credit Sale (what was sold but
  // not yet received as cash/card/UPI), how much of it has been logged as received THIS month via
  // Previous Month Collection entries so far, and what's therefore still outstanding. This is what
  // should genuinely be trickling in as Previous Month Collection, so it's the reference shown —
  // not last month's own Previous Month Collection figure, which wouldn't tell you what's left.
  const prevMonthCreditSaleRefFor=(date)=>{
    const d=new Date(date+'T00:00:00');
    if(isNaN(d))return{totalCreditSale:0,receivedSoFar:0,outstanding:0};
    const py=d.getMonth()===0?d.getFullYear()-1:d.getFullYear();
    const pm=d.getMonth()===0?11:d.getMonth()-1;
    const prevPrefix=py+'-'+String(pm+1).padStart(2,'0');
    const curPrefix=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const sumType=(prefix,type,excludeDate)=>Object.keys(reasonForDiff).filter(k=>k.startsWith(prefix)&&k!==excludeDate).reduce((s,k)=>{
      const v=reasonForDiff[k];
      return s+(v&&typeof v==='object'&&v.type===type?(Number(v.amount)||0):0);
    },0);
    const totalCreditSale=sumType(prevPrefix,'creditSale',null);
    const receivedSoFar=sumType(curPrefix,'prevMonth',date);
    return{totalCreditSale,receivedSoFar,outstanding:Math.max(0,totalCreditSale-receivedSoFar)};
  };
  const reasonDisplayText=(date)=>{
    const entry=reasonEntryFor(date);
    if(!entry)return'';
    if(entry.legacy)return entry.legacy;
    const type=REASON_TYPES.find(r=>r.id===entry.type);
    if(!type)return'';
    let txt=type.label+(entry.amount?' of ₹'+Number(entry.amount).toLocaleString():'');
    if(entry.invoiceNo||entry.partyName)txt+=' ('+[entry.invoiceNo,entry.partyName].filter(Boolean).join(' · ')+')';
    if(entry.reason)txt+=' — '+entry.reason;
    return txt;
  };
  const [bankSettlements,setBankSettlements]=useState(()=>loadBankSettlementsByDate(salonId));
  const refreshBankSettlements=()=>setBankSettlements(loadBankSettlementsByDate(salonId));

  const collectionSheetRows=Object.values(rows.reduce((acc,r)=>{
    if(!acc[r.invoiceDate])acc[r.invoiceDate]={date:r.invoiceDate,cashCradlee:0,cardCradlee:0,upiCradlee:0};
    acc[r.invoiceDate].cashCradlee+=r.cash;
    acc[r.invoiceDate].cardCradlee+=r.card
      +(csCardIncludeCols.wallet?(Number(r.wallet)||0):0)
      +(csCardIncludeCols.district?(Number(r.district)||0):0)
      +(csCardIncludeCols.luzo?(Number(r.luzo)||0):0)
      +(csCardIncludeCols.online?(Number(r.online)||0):0);
    acc[r.invoiceDate].upiCradlee+=r.upi;
    return acc;
  },{})).sort((a,b)=>{
    const pd=(s)=>{const m=String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?new Date(+m[3],+m[2]-1,+m[1]).getTime():0;};
    return pd(a.date)-pd(b.date);
  }).map(d=>{
    const bank=bankSettlements[d.date]||{card:0,upi:0};
    const counterRaw=cashFromDailySalesFor(d.date);
    const hasCounter=counterRaw!==undefined&&counterRaw!=='';
    const cashDiff=hasCounter?Number(counterRaw)-d.cashCradlee:null;
    const cardDiff=bank.card-d.cardCradlee;
    const upiDiff=bank.upi-d.upiCradlee;
    const consolidateDiff=(cashDiff||0)+cardDiff+upiDiff;
    return{...d,cardBank:bank.card,upiBank:bank.upi,counterRaw:hasCounter?counterRaw:'',cashDiff,cardDiff,upiDiff,consolidateDiff};
  });
  // Excel-style AutoFilter for the Collection Sheet table, same pattern as Bank Statement's.
  const csFilterCols=[
    {key:'date',label:'InvoiceDate',get:d=>d.date},
    {key:'cashCradlee',label:'Cash As Per Cradlee',get:d=>money(d.cashCradlee)},
    {key:'counterRaw',label:'Cash As Per Counter Report',get:d=>d.counterRaw?money(Number(d.counterRaw)):'—'},
    {key:'cashDiff',label:'Difference',get:d=>d.cashDiff===null?'—':money(d.cashDiff)},
    {key:'cardCradlee',label:'Card As Per Cradlee',get:d=>money(d.cardCradlee)},
    {key:'cardBank',label:'Card As Per Bank Statement',get:d=>d.cardBank?money(d.cardBank):'—'},
    {key:'cardDiff',label:'Difference',get:d=>money(d.cardDiff)},
    {key:'upiCradlee',label:'UPI As Per Cradlee',get:d=>money(d.upiCradlee)},
    {key:'upiBank',label:'UPI As Per Bank Statement',get:d=>d.upiBank?money(d.upiBank):'—'},
    {key:'upiDiff',label:'Difference',get:d=>money(d.upiDiff)},
    {key:'consolidateDiff',label:'Consolidate Difference',get:d=>money(d.consolidateDiff)}
  ];
  const [csColumnFilters,setCsColumnFilters]=useState({});
  const [csOpenFilterCol,setCsOpenFilterCol]=useState(null);
  const [csFilterPos,setCsFilterPos]=useState({top:0,left:0});
  const [csFilterSearch,setCsFilterSearch]=useState('');
  useEffect(()=>{
    if(!csOpenFilterCol)return;
    const onDocMouseDown=(e)=>{
      if(e.target.closest&&(e.target.closest('.autofilter-toggle')||e.target.closest('.autofilter-popover')))return;
      setCsOpenFilterCol(null);
    };
    document.addEventListener('mousedown',onDocMouseDown);
    return ()=>document.removeEventListener('mousedown',onDocMouseDown);
  },[csOpenFilterCol]);
  const csOpenFilterAt=(colKey,e)=>{
    if(csOpenFilterCol===colKey){setCsOpenFilterCol(null);return;}
    const rect=e.currentTarget.getBoundingClientRect();
    const popW=260;
    let left=rect.left;
    if(left+popW>window.innerWidth-12)left=Math.max(12,window.innerWidth-12-popW);
    setCsFilterPos({top:rect.bottom+6,left});
    setCsFilterSearch('');
    setCsOpenFilterCol(colKey);
  };
  const csUniqueValuesFor=(col)=>{
    const counts=new Map();
    collectionSheetRows.forEach(d=>{const v=String(col.get(d));counts.set(v,(counts.get(v)||0)+1);});
    return Array.from(counts.entries()).map(([value,count])=>({value,count})).sort((a,b)=>a.value.localeCompare(b.value));
  };
  const csToggleFilterValue=(colKey,val,allVals)=>{
    setCsColumnFilters(prev=>{
      const cur=prev[colKey]?new Set(prev[colKey]):new Set(allVals);
      if(cur.has(val))cur.delete(val);else cur.add(val);
      const next={...prev};
      if(cur.size===allVals.length)delete next[colKey];
      else next[colKey]=cur;
      return next;
    });
  };
  const csClearColumnFilter=(colKey)=>setCsColumnFilters(prev=>{const next={...prev};delete next[colKey];return next;});
  const filteredCollectionSheetRows=collectionSheetRows.filter(d=>{
    for(const col of csFilterCols){
      const active=csColumnFilters[col.key];
      if(active!==undefined&&!active.has(String(col.get(d))))return false;
    }
    return true;
  });
  // ---- Auto-import from a watched Downloads folder (Chrome/Edge only) ----
  const fsSupported=typeof window!=='undefined'&&typeof window.showDirectoryPicker==='function';
  const [dirHandle,setDirHandle]=useState(null);
  const [dirNeedsPermission,setDirNeedsPermission]=useState(false);
  const [autoStatus,setAutoStatus]=useState('');
  const [autoBusy,setAutoBusy]=useState(false);
  const lastAutoRef=useRef(typeof localStorage!=='undefined'?(cachedLocalGet(outletKey('salonos_cradlee_last_auto',salonId))||''):'');

  useEffect(()=>{
    let cancelled=false;
    if(!fsSupported)return;
    (async()=>{
      try{
        const handle=await fsIdbGet(outletKey('cradleeDir',salonId));
        if(!handle||cancelled)return;
        const perm=await handle.queryPermission({mode:'read'});
        if(cancelled)return;
        setDirHandle(handle);
        if(perm==='granted'){
          scanAndAutoImport(handle,{silent:true});
        }else{
          setDirNeedsPermission(true);
          setAutoStatus('Reconnect needed — click "Check Now" to re-grant folder access.');
        }
      }catch(e){/* no saved folder yet, or IndexedDB unavailable — ignore */}
    })();
    return ()=>{cancelled=true};
    // eslint-disable-next-line
  },[]);

  const findLatestReport=async(handle)=>{
    let best=null;
    for await (const entry of handle.values()){
      if(entry.kind!=='file')continue;
      const name=entry.name.toLowerCase();
      if(!/(cradle|collection)/.test(name))continue;
      if(!/\.(xlsx|xls|csv)$/.test(name))continue;
      const file=await entry.getFile();
      if(!best||file.lastModified>best.file.lastModified)best={entry,file};
    }
    return best;
  };

  const scanAndAutoImport=async(handle,opts)=>{
    const silent=opts&&opts.silent;
    setAutoBusy(true);
    try{
      const best=await findLatestReport(handle);
      if(!best){
        if(!silent)setAutoStatus('No Cradlee/Collection report file found in the connected folder yet.');
        setAutoBusy(false);return;
      }
      const tag=best.file.name+'|'+best.file.lastModified;
      if(tag===lastAutoRef.current){
        if(!silent)setAutoStatus('Already up to date — "'+best.file.name+'" was already imported.');
        setAutoBusy(false);return;
      }
      await loadWorkbook(best.file);
      lastAutoRef.current=tag;
      safeLocalSet(outletKey('salonos_cradlee_last_auto',salonId),tag);
      setAutoStatus('Auto-imported "'+best.file.name+'" from your Downloads folder.');
      setDirNeedsPermission(false);
    }catch(err){
      setAutoStatus('Auto-import check failed: '+err.message);
    }
    setAutoBusy(false);
  };

  const connectDownloads=async()=>{
    try{
      const handle=await window.showDirectoryPicker({id:'cradlee-downloads',mode:'read',startIn:'downloads'});
      try{await fsIdbSet(outletKey('cradleeDir',salonId),handle);}catch(e){}
      setDirHandle(handle);setDirNeedsPermission(false);
      await scanAndAutoImport(handle);
    }catch(err){
      if(err.name!=='AbortError')setAutoStatus('Could not connect: '+err.message);
    }
  };

  const disconnectDownloads=async()=>{
    try{await fsIdbDelete(outletKey('cradleeDir',salonId));}catch(e){}
    setDirHandle(null);setDirNeedsPermission(false);
    setAutoStatus('Disconnected from Downloads folder.');
  };

  const checkNow=async()=>{
    if(!dirHandle)return;
    try{
      let perm=await dirHandle.queryPermission({mode:'read'});
      if(perm!=='granted'){
        perm=await dirHandle.requestPermission({mode:'read'});
      }
      if(perm!=='granted'){setAutoStatus('Permission was not granted.');return;}
      setDirNeedsPermission(false);
      await scanAndAutoImport(dirHandle);
    }catch(err){setAutoStatus('Check failed: '+err.message);}
  };

  const clean=(v)=>{
    if(v===undefined||v===null||v==='')return 0;
    const n=Number(String(v).replace(/[₹,\s]/g,''));
    return Number.isFinite(n)?n:0;
  };
  const normalizeDate=(v,swap)=>{
    if(v===undefined||v===null||v==='')return'';
    if(v instanceof Date&&!isNaN(v)){
      return String(v.getDate()).padStart(2,'0')+'/'+String(v.getMonth()+1).padStart(2,'0')+'/'+v.getFullYear();
    }
    if(typeof v==='number'&&window.XLSX&&XLSX.SSF){
      const d=XLSX.SSF.parse_date_code(v);
      if(d)return String(d.d).padStart(2,'0')+'/'+String(d.m).padStart(2,'0')+'/'+d.y;
    }
    const s=String(v).trim();
    let m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if(m){
      const a=+m[1],b=+m[2];
      const year=m[3].length===2?'20'+m[3]:m[3];
      let day=a,month=b;
      if(a>12&&b<=12){/* already day-first */}
      else if(b>12&&a<=12){day=b;month=a;}
      else if(swap){day=b;month=a;}
      return String(day).padStart(2,'0')+'/'+String(month).padStart(2,'0')+'/'+year;
    }
    m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if(m)return m[3].padStart(2,'0')+'/'+m[2].padStart(2,'0')+'/'+m[1];
    return s;
  };
  // Same file-wide day/month disambiguation as Bank Statement — an InvoiceDate column is
  // consistently one format or the other across the whole file, never a per-row toss-up.
  const inferDateSwap=(json,dateColNames)=>{
    let sawMonthFirstEvidence=false,sawDayFirstEvidence=false;
    for(const r of json){
      let raw;
      for(const col of dateColNames){if(r[col]!==undefined&&r[col]!==''){raw=r[col];break;}}
      if(raw===undefined||raw instanceof Date)continue;
      const s=String(raw).trim();
      const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-]\d{2,4}$/);
      if(!m)continue;
      const a=+m[1],b=+m[2];
      if(a>12&&b<=12)sawDayFirstEvidence=true;
      else if(b>12&&a<=12)sawMonthFirstEvidence=true;
    }
    return sawMonthFirstEvidence&&!sawDayFirstEvidence;
  };
  const mapRow=(r,idx,swap)=>{
    const center=r['Center Name']??r['CenterName']??r['center name']??'';
    const date=r['InvoiceDate']??r['Invoice Date']??r['invoice date']??'';
    const cash=clean(r['Cash']??r['cash']);
    const card=clean(r['Card']??r['card']);
    const upi=clean(r['UPI']??r['upi']);
    const wallet=clean(r['Wallet']??r['wallet']);
    const district=clean(r['District']??r['district']);
    const luzo=clean(r['Luzo']??r['LUZO']??r['luzo']);
    const online=clean(r['Online']??r['online']);
    const rawTotal=r['Total']??r['total'];
    const hasSuppliedTotal=rawTotal!==undefined&&rawTotal!==null&&String(rawTotal).trim()!=='';
    const suppliedTotal=clean(rawTotal);
    const calculatedTotal=cash+card+upi+wallet+district+luzo+online;
    const total=hasSuppliedTotal?suppliedTotal:calculatedTotal;
    return{id:Date.now()+idx,centerName:String(center||'').trim(),invoiceDate:normalizeDate(date,swap),cash,card,upi,wallet,district,luzo,online,total,calculatedTotal,isValid:hasSuppliedTotal?suppliedTotal===calculatedTotal:true};
  };

  const loadWorkbook=async(file)=>{
    setMessage('');setFileName(file.name);
    try{
      let json;
      if(isCSVFile(file)){
        // Parse CSV ourselves — keeps every date cell as exact original text.
        const text=await file.text();
        const raw=parseCSVToRows(text);
        if(!raw.length)throw new Error('The selected file has no data rows.');
        const headerRow=raw[0].map(h=>String(h||'').trim());
        json=raw.slice(1)
          .map(r=>{const obj={};headerRow.forEach((h,ci)=>{if(h)obj[h]=r[ci]!==undefined?r[ci]:'';});return obj;})
          .filter(o=>Object.values(o).some(v=>String(v).trim()!==''));
      }else{
        if(!window.XLSX)throw new Error('Excel reader could not load. Please check your internet connection and reopen the file.');
        const buf=await file.arrayBuffer();
        const wb=XLSX.read(buf,{type:'array',cellDates:true});
        const ws=wb.Sheets[wb.SheetNames[0]];
        json=XLSX.utils.sheet_to_json(ws,{defval:'',raw:true});
      }
      if(!json.length)throw new Error('The selected file has no data rows.');
      const headers=Object.keys(json[0]);
      const missing=MANDATORY.filter(h=>!headers.some(x=>String(x).trim().toLowerCase()===h.toLowerCase()));
      if(missing.length)throw new Error('Missing required columns: '+missing.join(', '));
      const missingOptional=REQUIRED.filter(h=>!MANDATORY.includes(h)&&!headers.some(x=>String(x).trim().toLowerCase()===h.toLowerCase()));
      const dateSwap=inferDateSwap(json,['InvoiceDate','Invoice Date','invoice date']);
      const imported=json.map((r,i)=>mapRow(r,i,dateSwap)).filter(r=>r.centerName||r.invoiceDate||r.total);
      const note=missingOptional.length?' · '+missingOptional.join(', ')+' column'+(missingOptional.length===1?' wasn\u2019t':'s weren\u2019t')+' in this file, treated as ₹0.':'';
      // Append mode: add only rows that don't already match one on every field (same center,
      // date, and every amount column) — guards against a Cradlee export that re-covers an
      // overlapping date range, the normal case when pulling "month so far" reports repeatedly.
      if(importMode==='append'&&rows.length){
        const dedupeKey=(r)=>[r.centerName,r.invoiceDate,r.cash,r.card,r.upi,r.wallet,r.district,r.luzo,r.online,r.total].join('|');
        const existingKeys=new Set(rows.map(dedupeKey));
        const freshOnes=imported.filter(r=>!existingKeys.has(dedupeKey(r)));
        const dupCount=imported.length-freshOnes.length;
        let nextId=rows.reduce((m,r)=>Math.max(m,Number(r.id)||0),0)+1;
        const withFreshIds=freshOnes.map(r=>({...r,id:nextId++}));
        const invalidNew=withFreshIds.filter(r=>!r.isValid).length;
        setRows(prev=>[...prev,...withFreshIds]);
        setMessage((withFreshIds.length?'Appended '+withFreshIds.length+' new row'+(withFreshIds.length===1?'':'s'):'No new rows found')+' from '+file.name
          +(dupCount?' · '+dupCount+' row'+(dupCount===1?'':'s')+' already imported '+(dupCount===1?'was':'were')+' skipped as duplicate'+(dupCount===1?'':'s')+'.':'.')
          +(invalidNew?' · '+invalidNew+' total mismatch'+(invalidNew===1?'':'es')+' found in the new rows.':'')+note);
      }else{
        setRows(imported);
        const invalid=imported.filter(r=>!r.isValid).length;
        setMessage('Imported '+imported.length+' row'+(imported.length===1?'':'s')+' from '+file.name+(invalid?' · '+invalid+' total mismatch'+(invalid===1?'':'es')+' found.':' · All totals are correct.')+note);
      }
    }catch(err){setMessage('Import failed: '+err.message);}
  };

  const onFile=(e)=>{const f=e.target.files&&e.target.files[0];if(f)loadWorkbook(f);e.target.value='';};
  const onDrop=(e)=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files&&e.dataTransfer.files[0];if(f)loadWorkbook(f);};
  const downloadTemplate=()=>{
    const csv=[REQUIRED,SAMPLE].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Cradlee_Collection_Import_Template.csv';a.click();URL.revokeObjectURL(url);
  };
  const clearData=()=>{if(confirm('Remove all imported Cradlee collection data?')){setRows([]);setFileName('');setSelected(new Set());setMessage('Imported data cleared.');}};
  const toggleSelect=(id)=>setSelected(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const deleteSelected=()=>{
    if(!selected.size)return;
    if(confirm('Delete '+selected.size+' selected row'+(selected.size===1?'':'s')+'?')){
      setRows(prev=>prev.filter(r=>!selected.has(r.id)));
      setSelected(new Set());
    }
  };
  const exportData=()=>{
    if(!rows.length)return;
    const body=rows.map(r=>[r.centerName,r.invoiceDate,r.cash,r.card,r.upi,r.wallet,r.district,r.luzo,r.online,r.total].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(','));
    const csv=[REQUIRED.map(v=>'"'+v+'"').join(','),...body].join('\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Cradlee_Collection_Imported_Data.csv';a.click();URL.revokeObjectURL(url);
  };

  const filtered=rows.filter(r=>!search||[r.centerName,r.invoiceDate].join(' ').toLowerCase().includes(search.toLowerCase()));
  const totals=filtered.reduce((a,r)=>({cash:a.cash+r.cash,card:a.card+r.card,upi:a.upi+r.upi,wallet:a.wallet+r.wallet,district:a.district+r.district,luzo:a.luzo+r.luzo,online:a.online+r.online,total:a.total+r.total}),{cash:0,card:0,upi:0,wallet:0,district:0,luzo:0,online:0,total:0});

  // ── Collection Sheet — colour-coded Excel & PDF export, matching the on-screen palette exactly
  // (green = As Per Cradlee, orange = Counter Report/Bank Statement, green/red = Diff sign, red
  // highlight = Consolidate Diff over the configured threshold % of that day's Card+UPI Cradlee,
  // on-screen highlight) — the generic exportReportExcelBlob/exportReportPdfBlob can bold a total
  // row but can't do this kind of per-column, conditional colour coding, so this bypasses them via
  // ShareReportButton's buildExcelBlob/buildPdfBlob props. ──
  const csRowFlags=(d)=>{
    const cardUpiBase=(Number(d.cardCradlee)||0)+(Number(d.upiCradlee)||0);
    const diffPct=cardUpiBase>0?Math.abs(d.consolidateDiff)/cardUpiBase:(d.consolidateDiff!==0?Infinity:0);
    return{overThreshold:diffPct>(csDiffThresholdPct/100),diffPct};
  };
  const buildCollectionSheetExcelBlob=async()=>{
    await loadExcelJS();
    const wb=new ExcelJS.Workbook();
    wb.creator='SalonOS';wb.created=new Date();
    const ws=wb.addWorksheet('Collection Reco');
    const GREEN_FILL={type:'pattern',pattern:'solid',fgColor:{argb:'FFE3F2E9'}};
    const ORANGE_FILL={type:'pattern',pattern:'solid',fgColor:{argb:'FFFCE9D6'}};
    const RED_FILL={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFD6D6'}};
    const GREEN_TEXT={argb:'FF12805C'};
    const RED_TEXT={argb:'FFCF3D3D'};
    const GREEN_COLS=new Set([2,5,8]),ORANGE_COLS=new Set([3,6,9]),DIFF_COLS=new Set([4,7,10]);

    const headerRow=ws.addRow(['Date','Cash (Cradlee)','Cash (Counter)','Cash Diff','Card (Cradlee)','Card (Bank)','Card Diff','UPI (Cradlee)','UPI (Bank)','UPI Diff','Consolidate Diff']);
    headerRow.eachCell(cell=>{cell.fill=EXCEL_HEADER_FILL;cell.font=EXCEL_HEADER_FONT;cell.border=EXCEL_THIN_BORDER;cell.alignment={vertical:'middle',horizontal:'center'};});

    const sums=Array(10).fill(0);
    collectionSheetRows.forEach((d,idx)=>{
      const{overThreshold}=csRowFlags(d);
      const vals=[d.cashCradlee||0,d.counterRaw?Number(d.counterRaw):null,d.cashDiff,d.cardCradlee||0,d.cardBank||0,d.cardDiff,d.upiCradlee||0,d.upiBank||0,d.upiDiff,d.consolidateDiff];
      vals.forEach((v,i)=>{if(typeof v==='number')sums[i]+=v;});
      const row=ws.addRow([d.date,...vals]);
      row.eachCell({includeEmpty:true},(cell,colNum)=>{
        cell.border=EXCEL_THIN_BORDER;
        if(colNum===1){if(idx%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF4F7FB'}};return;}
        const v=cell.value;
        if(typeof v==='number')cell.numFmt='#,##0.00';
        cell.alignment={horizontal:'right'};
        if(GREEN_COLS.has(colNum))cell.fill=GREEN_FILL;
        else if(ORANGE_COLS.has(colNum))cell.fill=ORANGE_FILL;
        else if(DIFF_COLS.has(colNum)){
          if(typeof v==='number'&&v!==0)cell.font={color:v>0?GREEN_TEXT:RED_TEXT,bold:true};
          else cell.font={color:{argb:'FF8A94A6'}};
        }else if(colNum===11){
          if(overThreshold){cell.fill=RED_FILL;cell.font={color:RED_TEXT,bold:true};}
          else cell.font={color:{argb:'FF5B6472'}};
        }
      });
    });

    const lastDataRow=1+collectionSheetRows.length;
    const cols=['B','C','D','E','F','G','H','I','J','K'];
    const totalRow=ws.addRow(['TOTAL',...cols.map((L,i)=>({formula:'SUM('+L+'2:'+L+lastDataRow+')',result:Math.round(sums[i]*100)/100}))]);
    totalRow.eachCell((cell,colNum)=>{
      cell.font={bold:true};
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEEF3FA'}};
      cell.border={...EXCEL_THIN_BORDER,top:{style:'medium',color:{argb:'FF14335E'}}};
      if(colNum>1){cell.alignment={horizontal:'right'};cell.numFmt='#,##0.00';}
    });

    ws.getColumn(1).width=13;
    for(let c=2;c<=11;c++)ws.getColumn(c).width=15;
    ws.views=[{state:'frozen',ySplit:1}];
    ws.autoFilter={from:{row:1,column:1},to:{row:1,column:11}};

    const buf=await wb.xlsx.writeBuffer();
    return new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  };
  const buildCollectionSheetPdfBlob=async()=>{
    await loadScript(CDN_JSPDF_URL);
    await loadScript(CDN_JSPDF_AUTOTABLE_URL);
    if(!window.jspdf||!window.jspdf.jsPDF)throw new Error('PDF engine unavailable — check your internet connection.');
    const{jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:'l',unit:'mm',format:'a4'});
    const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
    doc.setFillColor(20,51,94);doc.rect(0,0,pw,18,'F');
    doc.setTextColor(255,255,255);doc.setFontSize(13);doc.setFont(undefined,'bold');
    doc.text('Collection Reco — '+(salon?salon.name.split('—')[0].trim():'Outlet'),8,9);
    doc.setFontSize(8);doc.setFont(undefined,'normal');doc.setTextColor(200,215,235);
    doc.text('Collection Reco · Generated '+new Date().toLocaleString('en-IN'),8,14.5);

    const hdr=['Date','Cash (Cradlee)','Cash (Counter)','Cash Diff','Card (Cradlee)','Card (Bank)','Card Diff','UPI (Cradlee)','UPI (Bank)','UPI Diff','Consolidate Diff'];
    const sums=Array(10).fill(0);
    const rowMeta=[]; // per body row: {overThreshold, diffSigns:{3:sign,6:sign,9:sign}}
    const body=collectionSheetRows.map(d=>{
      const{overThreshold}=csRowFlags(d);
      const vals=[d.cashCradlee||0,d.counterRaw?Number(d.counterRaw):null,d.cashDiff,d.cardCradlee||0,d.cardBank||0,d.cardDiff,d.upiCradlee||0,d.upiBank||0,d.upiDiff,d.consolidateDiff];
      vals.forEach((v,i)=>{if(typeof v==='number')sums[i]+=v;});
      rowMeta.push({overThreshold,diffSigns:{3:d.cashDiff,6:d.cardDiff,9:d.upiDiff}});
      return[d.date,money(d.cashCradlee),d.counterRaw?money(Number(d.counterRaw)):'—',d.cashDiff===null?'—':money(d.cashDiff),money(d.cardCradlee),money(d.cardBank),money(d.cardDiff),money(d.upiCradlee),money(d.upiBank),money(d.upiDiff),money(d.consolidateDiff)];
    });
    doc.autoTable({
      head:[hdr],body,
      foot:[['TOTAL',money(sums[0]),money(sums[1]),money(sums[2]),money(sums[3]),money(sums[4]),money(sums[5]),money(sums[6]),money(sums[7]),money(sums[8]),money(sums[9])]],
      startY:22,margin:{top:22,left:8,right:8,bottom:12},
      styles:{fontSize:7.5,cellPadding:2,overflow:'linebreak',halign:'right'},
      headStyles:{fillColor:[20,51,94],textColor:255,fontStyle:'bold',fontSize:7.5,halign:'center'},
      footStyles:{fillColor:[238,243,250],textColor:[20,51,94],fontStyle:'bold',fontSize:7.5},
      columnStyles:{0:{halign:'left'}},
      didParseCell:(data)=>{
        if(data.section!=='body')return;
        const col=data.column.index,meta=rowMeta[data.row.index];
        if(!meta)return;
        if([1,4,7].includes(col))data.cell.styles.fillColor=[227,242,233];
        else if([2,5,8].includes(col))data.cell.styles.fillColor=[252,233,214];
        else if([3,6,9].includes(col)){
          const sign=meta.diffSigns[col];
          if(typeof sign==='number'&&sign!==0)data.cell.styles.textColor=sign>0?[18,128,92]:[207,61,61];
          else data.cell.styles.textColor=[138,148,166];
        }else if(col===10&&meta.overThreshold){
          data.cell.styles.fillColor=[255,214,214];data.cell.styles.textColor=[207,61,61];data.cell.styles.fontStyle='bold';
        }
      }
    });
    const pageCount=doc.internal.getNumberOfPages();
    for(let i=1;i<=pageCount;i++){
      doc.setPage(i);
      doc.setFontSize(7.5);doc.setTextColor(140,150,165);
      doc.text('SalonOS — Confidential',8,ph-5);
      doc.text('Page '+i+' of '+pageCount,pw-8,ph-5,{align:'right'});
    }
    return doc.output('blob');
  };

  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Import Collection Data'),
        React.createElement('div',{className:'page-sub'},'Import the Cradlee Collection Report in the prescribed format')
      ),
      React.createElement('div',{className:'quick-actions'},
        React.createElement('button',{className:'btn btn-primary btn-sm',onClick:()=>window.open('https://app.cradleesoft.com/app/login','_blank','noopener,noreferrer')},'🔗 Open Cradlee eSoft Login'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:downloadTemplate},'⬇ Download Template'),
        rows.length>0&&React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:exportData},'⬇ Export Imported Data'),
        selected.size>0&&React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(255,107,107,.15)',border:'1px solid rgba(255,107,107,.4)',color:'var(--red)',fontWeight:600},onClick:deleteSelected},'🗑 Delete Selected ('+selected.size+')'),
        rows.length>0&&React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(255,107,107,.1)',border:'1px solid rgba(255,107,107,.3)',color:'var(--red)'},onClick:clearData},'Clear Data')
      )
    ),

    React.createElement('div',{className:'card',style:{marginBottom:16,background:'rgba(74,158,255,0.06)',border:'1px solid rgba(74,158,255,0.25)'}},
      React.createElement('div',{style:{display:'flex',gap:12,alignItems:'flex-start'}},
        React.createElement('div',{style:{fontSize:20}},'💡'),
        React.createElement('div',null,
          React.createElement('div',{style:{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:4}},'How to bring in your Cradlee Collection Report'),
          React.createElement('div',{style:{fontSize:12,color:'var(--text2)',lineHeight:1.8}},
            '1. Click "Open Cradlee eSoft Login" above and sign in to your account.',React.createElement('br'),
            '2. In Cradlee, go to Reports → Collection Report and export it as Excel or CSV.',React.createElement('br'),
            '3. Come back here and drop the exported file in the upload zone below — it will be auto-matched to the required format.'
          ),
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:8}},'Note: a direct, one-click pull from Cradlee isn\u2019t possible \u2014 their platform doesn\u2019t offer a public API/export link that a browser-based app can call on your behalf, so the export-then-upload step above is needed.')
        )
      )
    ),

    React.createElement('div',{className:'card',style:{marginBottom:16,background:fsSupported?'rgba(76,175,125,0.06)':'rgba(255,159,67,0.06)',border:'1px solid '+(fsSupported?'rgba(76,175,125,0.25)':'rgba(255,159,67,0.25)')}},
      React.createElement('div',{style:{display:'flex',gap:12,alignItems:'flex-start',flexWrap:'wrap'}},
        React.createElement('div',{style:{fontSize:20}},'⚡'),
        React.createElement('div',{style:{flex:1,minWidth:260}},
          React.createElement('div',{style:{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:4}},'Auto-Import from your Downloads folder'),
          !fsSupported?React.createElement('div',{style:{fontSize:12,color:'var(--text2)',lineHeight:1.7}},
            'This browser doesn\u2019t support folder watching (works in Chrome/Edge desktop only). Please use the upload box below instead.'
          ):React.createElement(React.Fragment,null,
            React.createElement('div',{style:{fontSize:12,color:'var(--text2)',lineHeight:1.7,marginBottom:8}},
              !dirHandle
                ?'Connect your Downloads folder once. From then on, every time a Cradlee export lands there, this page can pick it up automatically \u2014 no manual browsing.'
                :'Connected. Click "Check Now" any time after exporting from Cradlee, or just reopen this tab \u2014 it checks automatically on load.'
            ),
            React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}},
              !dirHandle?React.createElement('button',{className:'btn btn-primary btn-sm',onClick:connectDownloads},'📂 Connect Downloads Folder'):
              React.createElement(React.Fragment,null,
                React.createElement('button',{className:'btn btn-primary btn-sm',disabled:autoBusy,onClick:checkNow},autoBusy?'Checking…':(dirNeedsPermission?'🔓 Reconnect & Check':'🔄 Check Now')),
                React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:disconnectDownloads},'Disconnect')
              )
            ),
            autoStatus&&React.createElement('div',{style:{marginTop:8,fontSize:12,color:autoStatus.indexOf('failed')>-1||autoStatus.indexOf('not')>-1?'var(--red)':'var(--green)'}},autoStatus),
            React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:8,lineHeight:1.6}},'It looks for the most recently modified file in that folder whose name contains "Cradle" or "Collection" (.xlsx/.xls/.csv). You still export the report from Cradlee yourself \u2014 this just removes the manual browse-and-select step afterwards.')
          )
        )
      )
    ),

    React.createElement('div',{className:'card',style:{marginBottom:16}},
      React.createElement('div',{className:'card-title'},'Required Cradlee Format'),
      React.createElement('div',{style:{fontSize:12,color:'var(--text2)',marginBottom:14,lineHeight:1.7}},'Upload an Excel (.xlsx/.xls) or CSV file. The first row must contain the exact column headings shown below. Only Center Name and InvoiceDate are mandatory. Cash, Card, UPI, Wallet, District, Luzo and Online are optional and default to \u20b90 if a column is missing. Total isn\u2019t required either \u2014 it\u2019s automatically calculated as Cash + Card + UPI + Wallet + District + Luzo + Online for every row; if your file already has its own Total column, that figure is kept and checked against the calculated sum, and any row where the two don\u2019t match is flagged.'),
      React.createElement('div',{className:'table-wrap'},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,REQUIRED.map(h=>React.createElement('th',{key:h},h))))
        )
      )
    ),

    React.createElement('div',{className:'card',style:{marginBottom:16}},
      React.createElement('div',{className:'card-title'},'Upload Cradlee Collection Report'),
      rows.length>0&&React.createElement('div',{style:{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}},
        [{v:'append',label:'➕ Append to existing data',desc:'Adds new rows to the '+rows.length+' already imported \u2014 duplicates are skipped automatically'},
         {v:'replace',label:'🔄 Upload fresh report',desc:'Replaces all '+rows.length+' currently imported rows with just this file'}
        ].map(o=>React.createElement('label',{key:o.v,title:o.desc,
          style:{display:'flex',alignItems:'center',gap:7,padding:'8px 12px',borderRadius:'var(--r)',cursor:'pointer',fontSize:12.5,fontWeight:600,
            border:'1px solid '+(importMode===o.v?'var(--accent)':'var(--border2)'),
            background:importMode===o.v?'rgba(47,95,224,0.12)':'var(--bg3)',color:importMode===o.v?'var(--accent2)':'var(--text2)'}},
          React.createElement('input',{type:'radio',name:'crImportMode',checked:importMode===o.v,onChange:()=>setImportMode(o.v),style:{margin:0}}),
          o.label
        ))
      ),
      rows.length>0&&React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:14,marginTop:-6}},
        importMode==='append'
          ?'The next file you upload will be added to what\u2019s already here. Rows matching an existing one on Center Name, Date and every amount column are treated as the same entry and skipped, so re-uploading an overlapping date range is safe.'
          :React.createElement('span',{style:{color:'var(--orange)'}},'\u26a0 The next file you upload will remove all '+rows.length+' currently imported rows first \u2014 use this only if this file is the complete, correct report on its own.')
      ),
      React.createElement('input',{ref:fileRef,type:'file',accept:'.xlsx,.xls,.csv',style:{display:'none'},onChange:onFile}),
      React.createElement('div',{
        onDragOver:e=>{e.preventDefault();setDragging(true);},onDragLeave:()=>setDragging(false),onDrop,
        onClick:()=>fileRef.current&&fileRef.current.click(),
        style:{border:'2px dashed '+(dragging?'var(--accent)':'var(--border2)'),borderRadius:'var(--r2)',padding:'34px 20px',textAlign:'center',cursor:'pointer',background:dragging?'rgba(47,95,224,.06)':'var(--bg3)',transition:'all .15s'}
      },
        React.createElement('div',{style:{fontSize:36,marginBottom:10}},'📥'),
        React.createElement('div',{style:{fontSize:14,fontWeight:600,color:'var(--text)',marginBottom:5}},'Drop the Cradlee report here or click to browse'),
        React.createElement('div',{style:{fontSize:12,color:'var(--text3)'}},'Accepted files: Excel (.xlsx, .xls) and CSV'),
        fileName&&React.createElement('div',{style:{marginTop:10,color:'var(--accent)',fontSize:12}},'Selected: '+fileName)
      ),
      message&&React.createElement('div',{style:{marginTop:12,padding:'10px 12px',borderRadius:'var(--r)',background:message.startsWith('Import failed')?'rgba(255,107,107,.1)':'rgba(76,175,125,.1)',color:message.startsWith('Import failed')?'var(--red)':'var(--green)',fontSize:12}},message)
    ),

    rows.length>0&&React.createElement(React.Fragment,null,
      React.createElement('div',{className:'grid4',style:{marginBottom:16}},
        [{label:'Imported Rows',val:filtered.length,color:'blue'},{label:'Cash',val:money(totals.cash),color:'amber'},{label:'Digital (Card+UPI+Wallet+Online)',val:money(totals.card+totals.upi+totals.wallet+totals.online),color:'purple'},{label:'Grand Total',val:money(totals.total),color:'green'}].map(m=>React.createElement('div',{key:m.label,className:'metric-card '+m.color},React.createElement('div',{className:'metric-label'},m.label),React.createElement('div',{className:'metric-value',style:{fontSize:20}},m.val)))
      ),
      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'section-header',style:{marginBottom:12}},
          React.createElement('div',{className:'card-title',style:{marginBottom:0}},'Imported Data Preview'),
          React.createElement('div',{className:'search-bar',style:{maxWidth:320}},React.createElement('span',null,React.createElement(IconSearch,{size:13})),React.createElement('input',{value:search,onChange:e=>setSearch(e.target.value),placeholder:'Search centre or date…'}))
        ),
        React.createElement('div',{className:'table-wrap'},React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,
            React.createElement('th',{style:{width:32}},React.createElement('input',{type:'checkbox',
              checked:filtered.length>0&&filtered.every(r=>selected.has(r.id)),
              onChange:e=>setSelected(prev=>{const n=new Set(prev);if(e.target.checked)filtered.forEach(r=>n.add(r.id));else filtered.forEach(r=>n.delete(r.id));return n;})
            })),
            ...[...REQUIRED,'Validation',''].map(h=>React.createElement('th',{key:h},h))
          )),
          React.createElement('tbody',null,filtered.map(r=>React.createElement('tr',{key:r.id,style:selected.has(r.id)?{background:'rgba(47,95,224,0.06)'}:undefined},
            React.createElement('td',null,React.createElement('input',{type:'checkbox',checked:selected.has(r.id),onChange:()=>toggleSelect(r.id)})),
            React.createElement('td',{style:{fontWeight:500,color:'var(--text)'}},r.centerName),
            React.createElement('td',null,r.invoiceDate),
            React.createElement('td',null,money(r.cash)),React.createElement('td',null,money(r.card)),React.createElement('td',null,money(r.upi)),React.createElement('td',null,money(r.wallet)),React.createElement('td',null,money(r.district)),React.createElement('td',null,money(r.luzo)),React.createElement('td',null,money(r.online)),
            React.createElement('td',{style:{fontWeight:600}},money(r.total)),
            React.createElement('td',null,React.createElement('span',{className:'badge '+(r.isValid?'badge-green':'badge-red')},r.isValid?'Total Matched':'Expected '+money(r.calculatedTotal))),
            React.createElement('td',null,React.createElement('button',{'aria-label':'Delete',className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},title:'Delete this row',onClick:()=>{if(confirm('Delete this row?'))setRows(prev=>prev.filter(x=>x.id!==r.id));}},React.createElement(IconTrash,{size:14})))
          ))),
          React.createElement('tfoot',null,React.createElement('tr',{style:{background:'var(--bg3)',fontWeight:700}},
            React.createElement('td',null),
            React.createElement('td',{style:{color:'var(--text)'}},'TOTAL'),
            React.createElement('td',null),
            React.createElement('td',null,money(totals.cash)),React.createElement('td',null,money(totals.card)),React.createElement('td',null,money(totals.upi)),React.createElement('td',null,money(totals.wallet)),React.createElement('td',null,money(totals.district)),React.createElement('td',null,money(totals.luzo)),React.createElement('td',null,money(totals.online)),
            React.createElement('td',{style:{color:'var(--accent)'}},money(totals.total)),
            React.createElement('td',null),
            React.createElement('td',null)
          ))
        ))
      ),


      React.createElement('div',{className:'card',style:{marginTop:16}},
        React.createElement('div',{className:'section-header',style:{marginBottom:10}},
          React.createElement('div',{className:'card-title',style:{marginBottom:0}},'✨ AI Reconciliation Sheet'),
          React.createElement('button',{className:'btn btn-primary btn-sm',disabled:aiLoading,onClick:generateAIReco},aiLoading?'Reconciling…':'✨ Generate Reconciliation with AI')
        ),
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:12,lineHeight:1.6}},
          'Asks Claude to match this Collection Report against Bank Statement\'s Card/UPI Settlement credits (linked by Date as per Cradlee) and flag any mismatches — the same linking used in the Settlement Reconciliation table on the Bank Statement tab, but written up as a readable sheet.'
        ),
        aiError&&React.createElement('div',{style:{background:'rgba(255,107,107,.08)',border:'1px solid rgba(255,107,107,.25)',borderRadius:'var(--r)',padding:'10px 12px',fontSize:11.5,color:'var(--red)',lineHeight:1.6}},aiError),
        aiRows&&aiRows.length===0&&!aiError&&React.createElement('div',{style:{textAlign:'center',padding:20,color:'var(--text3)',fontSize:12}},'AI returned no reconciliation entries.'),
        aiRows&&aiRows.length>0&&React.createElement('div',{className:'table-wrap'},
          React.createElement('table',null,
            React.createElement('thead',null,React.createElement('tr',null,['Date','Nature','Bank Amount','Collection Amount','Difference','Status','Note'].map(h=>React.createElement('th',{key:h},h)))),
            React.createElement('tbody',null,aiRows.map((r,i)=>React.createElement('tr',{key:i},
              React.createElement('td',null,r.date),
              React.createElement('td',null,r.nature),
              React.createElement('td',{style:{fontWeight:600}},money(r.bankAmount)),
              React.createElement('td',null,money(r.collectionAmount)),
              React.createElement('td',{style:{color:r.status==='Matched'?'var(--green)':r.status==='Mismatch'?'var(--red)':'var(--text3)',fontWeight:600}},(Number(r.difference)>=0?'+':'')+money(r.difference)),
              React.createElement('td',null,React.createElement('span',{className:'badge '+(r.status==='Matched'?'badge-green':r.status==='Mismatch'?'badge-red':'badge-gray')},r.status)),
              React.createElement('td',{style:{fontSize:11,color:'var(--text3)',maxWidth:220}},r.note||'—')
            )))
          )
        )
      )
    )
  );
}

function CollectionSheetView({salon,onNavTab}={}){
  const salonId=salon?.id;
  const csWrapRef=useRef(null);
  const csCellRange=useExcelCellRange(csWrapRef);
  const money=(n)=>formatMoney(n);
  // Consolidate Difference is flagged red once it exceeds this % of that day's Card + UPI As Per
  // Cradlee — adjustable per outlet (not a fixed 2%), persisted like everything else here.
  const [csDiffThresholdPct,setCsDiffThresholdPct]=useState(()=>{
    try{const v=cachedLocalGet(outletKey('salonos_cs_diff_threshold',salonId));if(v!==null){const n=Number(v);if(!isNaN(n)&&n>=0)return n;}}catch(e){}
    return 2;
  });
  useEffect(()=>{safeLocalSet(outletKey('salonos_cs_diff_threshold',salonId),String(csDiffThresholdPct));},[csDiffThresholdPct,salonId]);
  // Which imported columns feed "Card As Per Cradlee", beyond Card itself — Wallet/District/Luzo/
  // Online are all electronic-payout channels that get settled through the bank the same way Card
  // does, so they belong in the same bucket for matching against Bank Statement's Card Settlement
  // credits. Checkable per outlet in case one of these actually settles differently there.
  const CS_CARD_EXTRA_COLS=[{key:'wallet',label:'Wallet'},{key:'district',label:'District'},{key:'luzo',label:'Luzo'},{key:'online',label:'Online'}];
  const [csCardIncludeCols,setCsCardIncludeCols]=useState(()=>{
    try{const v=cachedLocalGet(outletKey('salonos_cs_card_include_cols',salonId));if(v!==null){const parsed=JSON.parse(v);if(parsed&&typeof parsed==='object')return parsed;}}catch(e){}
    return{wallet:true,district:true,luzo:true,online:true};
  });
  useEffect(()=>{safeLocalSet(outletKey('salonos_cs_card_include_cols',salonId),JSON.stringify(csCardIncludeCols));},[csCardIncludeCols,salonId]);
  const toggleCsCardIncludeCol=(key)=>setCsCardIncludeCols(prev=>({...prev,[key]:!prev[key]}));
  const REQUIRED=['Center Name','InvoiceDate','Cash','Card','UPI','Wallet','District','Luzo','Online','Total'];
  const SAMPLE=['CUT&STYLE Koramangala 2','01/06/2026',7264,3686,25253,2000,0,1500,1500,41203];
  // Only these are truly required to identify a transaction. Every payment-mode column
  // (Cash/Card/UPI/Wallet/District/Luzo/Online/Total) is optional on import — a report that's
  // missing one (e.g. a centre with no Wallet transactions and no Wallet column at all) still
  // imports fine, with that column simply treated as ₹0.
  const MANDATORY=['Center Name','InvoiceDate'];
  const [rows,setRows]=useState(()=>{
    try{return JSON.parse(cachedLocalGet(outletKey('salonos_cradlee_collection_rows',salonId))||'[]');}catch(e){return[];}
  });
  const [fileName,setFileName]=useState('');
  const [message,setMessage]=useState('');
  // Same append-vs-replace choice as Bank Statement / Collection Reco (same underlying
  // salonos_cradlee_collection_rows data). This tab has no upload button of its own — loadWorkbook
  // here only ever runs via the silent Downloads-folder auto-import below — so it just reads
  // whatever mode was last chosen on the Collection Reco tab rather than defining its own toggle.
  const [importMode]=useState(()=>{try{return cachedLocalGet(outletKey('salonos_cradlee_import_mode',salonId))||'append';}catch(e){return'append';}});
  const [search,setSearch]=useState('');
  const [selected,setSelected]=useState(()=>new Set());

  useEffect(()=>{
    safeLocalSet(outletKey('salonos_cradlee_collection_rows',salonId),JSON.stringify(rows));
  },[rows,salonId]);

  // ── Collection Sheet — daily reconciliation table: Cradlee vs Counter Report (Cash) and
  // Cradlee vs Bank Statement settlements (Card/UPI), plus a running Consolidate Difference.
  // "Cash As Per Counter Report" reads Daily Sales & Exp's "Cash Sale" row (row index 0 there)
  // for the matching date, rather than being entered separately — same real-world figure, one
  // place to type it in. Read fresh whenever this sheet mounts. ──
  const [dseCashSaleByIso]=useState(()=>{try{return JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',salonId))||'{}');}catch(e){return{};}});
  const cashFromDailySalesFor=(dmyDate)=>{
    const iso=toISO(dmyDate);
    const dayEntry=iso&&dseCashSaleByIso[iso];
    const v=dayEntry&&dayEntry[0]; // row 0 = Cash Sale in Daily Sales & Exp's SALES_ROWS
    return(v!=null&&v!=='')?v:'';
  };
  // Tip To Employee, per date — for the Reco of Actual Bank Charges table below, which nets it
  // out against Consolidate Difference (tips paid out in cash reduce what should have landed as
  // card/UPI settlement, so they're a genuine, explainable part of the difference, not a charge).
  const [dseExpenseByIso]=useState(()=>loadDseDataFor(salonId));
  const tipRowIdx=EXPENSE_ROWS.findIndex(r=>r.name==='Tip To Employee');
  const tipForDate=(dmyDate)=>{
    const iso=toISO(dmyDate);
    const v=iso&&dseExpenseByIso[iso]&&dseExpenseByIso[iso][tipRowIdx];
    return(v!=null&&v!=='')?(Number(v)||0):0;
  };
  const [reasonForDiff,setReasonForDiff]=useState(()=>{try{return JSON.parse(cachedLocalGet(outletKey('salonos_collection_reason_diff',salonId))||'{}');}catch(e){return{};}});
  useEffect(()=>{safeLocalSet(outletKey('salonos_collection_reason_diff',salonId),JSON.stringify(reasonForDiff));},[reasonForDiff,salonId]);
  // ── Reason for Diff — was a free-text note, now a dropdown of the reasons that actually
  // explain a Cash/Card/UPI difference, each with its own amount plus whatever extra detail that
  // reason needs (see REASON_EXTRA_FIELDS): money genuinely owed from last month showing up this
  // month (Previous Month Collection), a sale that hasn't come in as cash/card/UPI yet because it
  // was sold on credit (Credit Sale, with Invoice No. and Party Name), a shortfall at the counter
  // (Short Collection), or an overage (Excess Collection) — the latter two each with a free-text
  // Reason explaining why. Old free-text notes (plain strings, from before this changed) still
  // display for reference; selecting a reason replaces the note with the structured shape below.
  const REASON_EXTRA_FIELDS={
    invoiceNo:{label:'Invoice No.',placeholder:'e.g. INV-1042'},
    partyName:{label:'Party Name',placeholder:'e.g. Ramesh Traders'},
    reason:{label:'Reason',placeholder:'Explain why…'},
  };
  const REASON_TYPES=[
    {id:'prevMonth',label:'Previous Month Collection',fields:[]},
    {id:'creditSale',label:'Credit Sale',fields:['invoiceNo','partyName']},
    {id:'shortCollection',label:'Short Collection',fields:['reason']},
    {id:'excessCollection',label:'Excess Collection',fields:['reason']},
  ];
  const reasonEntryFor=(date)=>{
    const v=reasonForDiff[date];
    if(v&&typeof v==='object')return v;
    if(typeof v==='string'&&v)return{legacy:v};
    return null;
  };
  const setReasonType=(date,type)=>setReasonForDiff(prev=>{
    const cur=prev[date];
    const carryAmount=(cur&&typeof cur==='object'&&cur.type===type)?cur.amount:'';
    if(!type)return{...prev,[date]:''};
    return{...prev,[date]:{type,amount:carryAmount}};
  });
  const setReasonField=(date,field,value)=>setReasonForDiff(prev=>({...prev,[date]:{...(prev[date]&&typeof prev[date]==='object'?prev[date]:{}),[field]:value}}));
  // Previous Month Collection, for reference — last month's total Credit Sale (what was sold but
  // not yet received as cash/card/UPI), how much of it has been logged as received THIS month via
  // Previous Month Collection entries so far, and what's therefore still outstanding. This is what
  // should genuinely be trickling in as Previous Month Collection, so it's the reference shown —
  // not last month's own Previous Month Collection figure, which wouldn't tell you what's left.
  const prevMonthCreditSaleRefFor=(date)=>{
    const d=new Date(date+'T00:00:00');
    if(isNaN(d))return{totalCreditSale:0,receivedSoFar:0,outstanding:0};
    const py=d.getMonth()===0?d.getFullYear()-1:d.getFullYear();
    const pm=d.getMonth()===0?11:d.getMonth()-1;
    const prevPrefix=py+'-'+String(pm+1).padStart(2,'0');
    const curPrefix=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const sumType=(prefix,type,excludeDate)=>Object.keys(reasonForDiff).filter(k=>k.startsWith(prefix)&&k!==excludeDate).reduce((s,k)=>{
      const v=reasonForDiff[k];
      return s+(v&&typeof v==='object'&&v.type===type?(Number(v.amount)||0):0);
    },0);
    const totalCreditSale=sumType(prevPrefix,'creditSale',null);
    const receivedSoFar=sumType(curPrefix,'prevMonth',date);
    return{totalCreditSale,receivedSoFar,outstanding:Math.max(0,totalCreditSale-receivedSoFar)};
  };
  const reasonDisplayText=(date)=>{
    const entry=reasonEntryFor(date);
    if(!entry)return'';
    if(entry.legacy)return entry.legacy;
    const type=REASON_TYPES.find(r=>r.id===entry.type);
    if(!type)return'';
    let txt=type.label+(entry.amount?' of ₹'+Number(entry.amount).toLocaleString():'');
    if(entry.invoiceNo||entry.partyName)txt+=' ('+[entry.invoiceNo,entry.partyName].filter(Boolean).join(' · ')+')';
    if(entry.reason)txt+=' — '+entry.reason;
    return txt;
  };
  const [bankSettlements,setBankSettlements]=useState(()=>loadBankSettlementsByDate(salonId));
  const refreshBankSettlements=()=>setBankSettlements(loadBankSettlementsByDate(salonId));

  const collectionSheetRows=Object.values(rows.reduce((acc,r)=>{
    if(!acc[r.invoiceDate])acc[r.invoiceDate]={date:r.invoiceDate,cashCradlee:0,cardCradlee:0,upiCradlee:0};
    acc[r.invoiceDate].cashCradlee+=r.cash;
    acc[r.invoiceDate].cardCradlee+=r.card
      +(csCardIncludeCols.wallet?(Number(r.wallet)||0):0)
      +(csCardIncludeCols.district?(Number(r.district)||0):0)
      +(csCardIncludeCols.luzo?(Number(r.luzo)||0):0)
      +(csCardIncludeCols.online?(Number(r.online)||0):0);
    acc[r.invoiceDate].upiCradlee+=r.upi;
    return acc;
  },{})).sort((a,b)=>{
    const pd=(s)=>{const m=String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?new Date(+m[3],+m[2]-1,+m[1]).getTime():0;};
    return pd(a.date)-pd(b.date);
  }).map(d=>{
    const bank=bankSettlements[d.date]||{card:0,upi:0};
    const counterRaw=cashFromDailySalesFor(d.date);
    const hasCounter=counterRaw!==undefined&&counterRaw!=='';
    const cashDiff=hasCounter?Number(counterRaw)-d.cashCradlee:null;
    const cardDiff=bank.card-d.cardCradlee;
    const upiDiff=bank.upi-d.upiCradlee;
    const consolidateDiff=(cashDiff||0)+cardDiff+upiDiff;
    return{...d,cardBank:bank.card,upiBank:bank.upi,counterRaw:hasCounter?counterRaw:'',cashDiff,cardDiff,upiDiff,consolidateDiff};
  });
  // Excel-style AutoFilter for the Collection Sheet table, same pattern as Bank Statement's.
  const csFilterCols=[
    {key:'date',label:'InvoiceDate',get:d=>d.date},
    {key:'cashCradlee',label:'Cash As Per Cradlee',get:d=>money(d.cashCradlee)},
    {key:'counterRaw',label:'Cash As Per Counter Report',get:d=>d.counterRaw?money(Number(d.counterRaw)):'—'},
    {key:'cashDiff',label:'Difference',get:d=>d.cashDiff===null?'—':money(d.cashDiff)},
    {key:'cardCradlee',label:'Card As Per Cradlee',get:d=>money(d.cardCradlee)},
    {key:'cardBank',label:'Card As Per Bank Statement',get:d=>d.cardBank?money(d.cardBank):'—'},
    {key:'cardDiff',label:'Difference',get:d=>money(d.cardDiff)},
    {key:'upiCradlee',label:'UPI As Per Cradlee',get:d=>money(d.upiCradlee)},
    {key:'upiBank',label:'UPI As Per Bank Statement',get:d=>d.upiBank?money(d.upiBank):'—'},
    {key:'upiDiff',label:'Difference',get:d=>money(d.upiDiff)},
    {key:'consolidateDiff',label:'Consolidate Difference',get:d=>money(d.consolidateDiff)}
  ];
  const [csColumnFilters,setCsColumnFilters]=useState({});
  const [csOpenFilterCol,setCsOpenFilterCol]=useState(null);
  const [csFilterPos,setCsFilterPos]=useState({top:0,left:0});
  const [csFilterSearch,setCsFilterSearch]=useState('');
  useEffect(()=>{
    if(!csOpenFilterCol)return;
    const onDocMouseDown=(e)=>{
      if(e.target.closest&&(e.target.closest('.autofilter-toggle')||e.target.closest('.autofilter-popover')))return;
      setCsOpenFilterCol(null);
    };
    document.addEventListener('mousedown',onDocMouseDown);
    return ()=>document.removeEventListener('mousedown',onDocMouseDown);
  },[csOpenFilterCol]);
  const csOpenFilterAt=(colKey,e)=>{
    if(csOpenFilterCol===colKey){setCsOpenFilterCol(null);return;}
    const rect=e.currentTarget.getBoundingClientRect();
    const popW=260;
    let left=rect.left;
    if(left+popW>window.innerWidth-12)left=Math.max(12,window.innerWidth-12-popW);
    setCsFilterPos({top:rect.bottom+6,left});
    setCsFilterSearch('');
    setCsOpenFilterCol(colKey);
  };
  const csUniqueValuesFor=(col)=>{
    const counts=new Map();
    collectionSheetRows.forEach(d=>{const v=String(col.get(d));counts.set(v,(counts.get(v)||0)+1);});
    return Array.from(counts.entries()).map(([value,count])=>({value,count})).sort((a,b)=>a.value.localeCompare(b.value));
  };
  const csToggleFilterValue=(colKey,val,allVals)=>{
    setCsColumnFilters(prev=>{
      const cur=prev[colKey]?new Set(prev[colKey]):new Set(allVals);
      if(cur.has(val))cur.delete(val);else cur.add(val);
      const next={...prev};
      if(cur.size===allVals.length)delete next[colKey];
      else next[colKey]=cur;
      return next;
    });
  };
  const csClearColumnFilter=(colKey)=>setCsColumnFilters(prev=>{const next={...prev};delete next[colKey];return next;});
  const filteredCollectionSheetRows=collectionSheetRows.filter(d=>{
    for(const col of csFilterCols){
      const active=csColumnFilters[col.key];
      if(active!==undefined&&!active.has(String(col.get(d))))return false;
    }
    return true;
  });
  // ---- Auto-import from a watched Downloads folder (Chrome/Edge only) ----
  const fsSupported=typeof window!=='undefined'&&typeof window.showDirectoryPicker==='function';
  const [dirHandle,setDirHandle]=useState(null);
  const [dirNeedsPermission,setDirNeedsPermission]=useState(false);
  const [autoStatus,setAutoStatus]=useState('');
  const [autoBusy,setAutoBusy]=useState(false);
  const lastAutoRef=useRef(typeof localStorage!=='undefined'?(cachedLocalGet(outletKey('salonos_cradlee_last_auto',salonId))||''):'');

  useEffect(()=>{
    let cancelled=false;
    if(!fsSupported)return;
    (async()=>{
      try{
        const handle=await fsIdbGet(outletKey('cradleeDir',salonId));
        if(!handle||cancelled)return;
        const perm=await handle.queryPermission({mode:'read'});
        if(cancelled)return;
        setDirHandle(handle);
        if(perm==='granted'){
          scanAndAutoImport(handle,{silent:true});
        }else{
          setDirNeedsPermission(true);
          setAutoStatus('Reconnect needed — click "Check Now" to re-grant folder access.');
        }
      }catch(e){/* no saved folder yet, or IndexedDB unavailable — ignore */}
    })();
    return ()=>{cancelled=true};
    // eslint-disable-next-line
  },[]);

  const findLatestReport=async(handle)=>{
    let best=null;
    for await (const entry of handle.values()){
      if(entry.kind!=='file')continue;
      const name=entry.name.toLowerCase();
      if(!/(cradle|collection)/.test(name))continue;
      if(!/\.(xlsx|xls|csv)$/.test(name))continue;
      const file=await entry.getFile();
      if(!best||file.lastModified>best.file.lastModified)best={entry,file};
    }
    return best;
  };

  const scanAndAutoImport=async(handle,opts)=>{
    const silent=opts&&opts.silent;
    setAutoBusy(true);
    try{
      const best=await findLatestReport(handle);
      if(!best){
        if(!silent)setAutoStatus('No Cradlee/Collection report file found in the connected folder yet.');
        setAutoBusy(false);return;
      }
      const tag=best.file.name+'|'+best.file.lastModified;
      if(tag===lastAutoRef.current){
        if(!silent)setAutoStatus('Already up to date — "'+best.file.name+'" was already imported.');
        setAutoBusy(false);return;
      }
      await loadWorkbook(best.file);
      lastAutoRef.current=tag;
      safeLocalSet(outletKey('salonos_cradlee_last_auto',salonId),tag);
      setAutoStatus('Auto-imported "'+best.file.name+'" from your Downloads folder.');
      setDirNeedsPermission(false);
    }catch(err){
      setAutoStatus('Auto-import check failed: '+err.message);
    }
    setAutoBusy(false);
  };

  const connectDownloads=async()=>{
    try{
      const handle=await window.showDirectoryPicker({id:'cradlee-downloads',mode:'read',startIn:'downloads'});
      try{await fsIdbSet(outletKey('cradleeDir',salonId),handle);}catch(e){}
      setDirHandle(handle);setDirNeedsPermission(false);
      await scanAndAutoImport(handle);
    }catch(err){
      if(err.name!=='AbortError')setAutoStatus('Could not connect: '+err.message);
    }
  };

  const disconnectDownloads=async()=>{
    try{await fsIdbDelete(outletKey('cradleeDir',salonId));}catch(e){}
    setDirHandle(null);setDirNeedsPermission(false);
    setAutoStatus('Disconnected from Downloads folder.');
  };

  const checkNow=async()=>{
    if(!dirHandle)return;
    try{
      let perm=await dirHandle.queryPermission({mode:'read'});
      if(perm!=='granted'){
        perm=await dirHandle.requestPermission({mode:'read'});
      }
      if(perm!=='granted'){setAutoStatus('Permission was not granted.');return;}
      setDirNeedsPermission(false);
      await scanAndAutoImport(dirHandle);
    }catch(err){setAutoStatus('Check failed: '+err.message);}
  };

  const clean=(v)=>{
    if(v===undefined||v===null||v==='')return 0;
    const n=Number(String(v).replace(/[₹,\s]/g,''));
    return Number.isFinite(n)?n:0;
  };
  const normalizeDate=(v,swap)=>{
    if(v===undefined||v===null||v==='')return'';
    if(v instanceof Date&&!isNaN(v)){
      return String(v.getDate()).padStart(2,'0')+'/'+String(v.getMonth()+1).padStart(2,'0')+'/'+v.getFullYear();
    }
    if(typeof v==='number'&&window.XLSX&&XLSX.SSF){
      const d=XLSX.SSF.parse_date_code(v);
      if(d)return String(d.d).padStart(2,'0')+'/'+String(d.m).padStart(2,'0')+'/'+d.y;
    }
    const s=String(v).trim();
    let m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if(m){
      const a=+m[1],b=+m[2];
      const year=m[3].length===2?'20'+m[3]:m[3];
      let day=a,month=b;
      if(a>12&&b<=12){/* already day-first */}
      else if(b>12&&a<=12){day=b;month=a;}
      else if(swap){day=b;month=a;}
      return String(day).padStart(2,'0')+'/'+String(month).padStart(2,'0')+'/'+year;
    }
    m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if(m)return m[3].padStart(2,'0')+'/'+m[2].padStart(2,'0')+'/'+m[1];
    return s;
  };
  // Same file-wide day/month disambiguation as Bank Statement — an InvoiceDate column is
  // consistently one format or the other across the whole file, never a per-row toss-up.
  const inferDateSwap=(json,dateColNames)=>{
    let sawMonthFirstEvidence=false,sawDayFirstEvidence=false;
    for(const r of json){
      let raw;
      for(const col of dateColNames){if(r[col]!==undefined&&r[col]!==''){raw=r[col];break;}}
      if(raw===undefined||raw instanceof Date)continue;
      const s=String(raw).trim();
      const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-]\d{2,4}$/);
      if(!m)continue;
      const a=+m[1],b=+m[2];
      if(a>12&&b<=12)sawDayFirstEvidence=true;
      else if(b>12&&a<=12)sawMonthFirstEvidence=true;
    }
    return sawMonthFirstEvidence&&!sawDayFirstEvidence;
  };
  const mapRow=(r,idx,swap)=>{
    const center=r['Center Name']??r['CenterName']??r['center name']??'';
    const date=r['InvoiceDate']??r['Invoice Date']??r['invoice date']??'';
    const cash=clean(r['Cash']??r['cash']);
    const card=clean(r['Card']??r['card']);
    const upi=clean(r['UPI']??r['upi']);
    const wallet=clean(r['Wallet']??r['wallet']);
    const district=clean(r['District']??r['district']);
    const luzo=clean(r['Luzo']??r['LUZO']??r['luzo']);
    const online=clean(r['Online']??r['online']);
    const rawTotal=r['Total']??r['total'];
    const hasSuppliedTotal=rawTotal!==undefined&&rawTotal!==null&&String(rawTotal).trim()!=='';
    const suppliedTotal=clean(rawTotal);
    const calculatedTotal=cash+card+upi+wallet+district+luzo+online;
    const total=hasSuppliedTotal?suppliedTotal:calculatedTotal;
    return{id:Date.now()+idx,centerName:String(center||'').trim(),invoiceDate:normalizeDate(date,swap),cash,card,upi,wallet,district,luzo,online,total,calculatedTotal,isValid:hasSuppliedTotal?suppliedTotal===calculatedTotal:true};
  };

  const loadWorkbook=async(file)=>{
    setMessage('');setFileName(file.name);
    try{
      let json;
      if(isCSVFile(file)){
        // Parse CSV ourselves — keeps every date cell as exact original text.
        const text=await file.text();
        const raw=parseCSVToRows(text);
        if(!raw.length)throw new Error('The selected file has no data rows.');
        const headerRow=raw[0].map(h=>String(h||'').trim());
        json=raw.slice(1)
          .map(r=>{const obj={};headerRow.forEach((h,ci)=>{if(h)obj[h]=r[ci]!==undefined?r[ci]:'';});return obj;})
          .filter(o=>Object.values(o).some(v=>String(v).trim()!==''));
      }else{
        if(!window.XLSX)throw new Error('Excel reader could not load. Please check your internet connection and reopen the file.');
        const buf=await file.arrayBuffer();
        const wb=XLSX.read(buf,{type:'array',cellDates:true});
        const ws=wb.Sheets[wb.SheetNames[0]];
        json=XLSX.utils.sheet_to_json(ws,{defval:'',raw:true});
      }
      if(!json.length)throw new Error('The selected file has no data rows.');
      const headers=Object.keys(json[0]);
      const missing=MANDATORY.filter(h=>!headers.some(x=>String(x).trim().toLowerCase()===h.toLowerCase()));
      if(missing.length)throw new Error('Missing required columns: '+missing.join(', '));
      const missingOptional=REQUIRED.filter(h=>!MANDATORY.includes(h)&&!headers.some(x=>String(x).trim().toLowerCase()===h.toLowerCase()));
      const dateSwap=inferDateSwap(json,['InvoiceDate','Invoice Date','invoice date']);
      const imported=json.map((r,i)=>mapRow(r,i,dateSwap)).filter(r=>r.centerName||r.invoiceDate||r.total);
      const note=missingOptional.length?' · '+missingOptional.join(', ')+' column'+(missingOptional.length===1?' wasn\u2019t':'s weren\u2019t')+' in this file, treated as ₹0.':'';
      // Append mode: add only rows that don't already match one on every field (same center,
      // date, and every amount column) — guards against a Cradlee export that re-covers an
      // overlapping date range, the normal case when pulling "month so far" reports repeatedly.
      if(importMode==='append'&&rows.length){
        const dedupeKey=(r)=>[r.centerName,r.invoiceDate,r.cash,r.card,r.upi,r.wallet,r.district,r.luzo,r.online,r.total].join('|');
        const existingKeys=new Set(rows.map(dedupeKey));
        const freshOnes=imported.filter(r=>!existingKeys.has(dedupeKey(r)));
        const dupCount=imported.length-freshOnes.length;
        let nextId=rows.reduce((m,r)=>Math.max(m,Number(r.id)||0),0)+1;
        const withFreshIds=freshOnes.map(r=>({...r,id:nextId++}));
        const invalidNew=withFreshIds.filter(r=>!r.isValid).length;
        setRows(prev=>[...prev,...withFreshIds]);
        setMessage((withFreshIds.length?'Appended '+withFreshIds.length+' new row'+(withFreshIds.length===1?'':'s'):'No new rows found')+' from '+file.name
          +(dupCount?' · '+dupCount+' row'+(dupCount===1?'':'s')+' already imported '+(dupCount===1?'was':'were')+' skipped as duplicate'+(dupCount===1?'':'s')+'.':'.')
          +(invalidNew?' · '+invalidNew+' total mismatch'+(invalidNew===1?'':'es')+' found in the new rows.':'')+note);
      }else{
        setRows(imported);
        const invalid=imported.filter(r=>!r.isValid).length;
        setMessage('Imported '+imported.length+' row'+(imported.length===1?'':'s')+' from '+file.name+(invalid?' · '+invalid+' total mismatch'+(invalid===1?'':'es')+' found.':' · All totals are correct.')+note);
      }
    }catch(err){setMessage('Import failed: '+err.message);}
  };

  const downloadTemplate=()=>{
    const csv=[REQUIRED,SAMPLE].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Cradlee_Collection_Import_Template.csv';a.click();URL.revokeObjectURL(url);
  };
  const clearData=()=>{if(confirm('Remove all imported Cradlee collection data?')){setRows([]);setFileName('');setSelected(new Set());setMessage('Imported data cleared.');}};
  const toggleSelect=(id)=>setSelected(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const deleteSelected=()=>{
    if(!selected.size)return;
    if(confirm('Delete '+selected.size+' selected row'+(selected.size===1?'':'s')+'?')){
      setRows(prev=>prev.filter(r=>!selected.has(r.id)));
      setSelected(new Set());
    }
  };
  const exportData=()=>{
    if(!rows.length)return;
    const body=rows.map(r=>[r.centerName,r.invoiceDate,r.cash,r.card,r.upi,r.wallet,r.district,r.luzo,r.online,r.total].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(','));
    const csv=[REQUIRED.map(v=>'"'+v+'"').join(','),...body].join('\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Cradlee_Collection_Imported_Data.csv';a.click();URL.revokeObjectURL(url);
  };

  const filtered=rows.filter(r=>!search||[r.centerName,r.invoiceDate].join(' ').toLowerCase().includes(search.toLowerCase()));
  const totals=filtered.reduce((a,r)=>({cash:a.cash+r.cash,card:a.card+r.card,upi:a.upi+r.upi,wallet:a.wallet+r.wallet,district:a.district+r.district,luzo:a.luzo+r.luzo,online:a.online+r.online,total:a.total+r.total}),{cash:0,card:0,upi:0,wallet:0,district:0,luzo:0,online:0,total:0});

  // ── Collection Sheet — colour-coded Excel & PDF export, matching the on-screen palette exactly
  // (green = As Per Cradlee, orange = Counter Report/Bank Statement, green/red = Diff sign, red
  // highlight = Consolidate Diff over the configured threshold % of that day's Card+UPI Cradlee,
  // on-screen highlight) — the generic exportReportExcelBlob/exportReportPdfBlob can bold a total
  // row but can't do this kind of per-column, conditional colour coding, so this bypasses them via
  // ShareReportButton's buildExcelBlob/buildPdfBlob props. ──
  const csRowFlags=(d)=>{
    const cardUpiBase=(Number(d.cardCradlee)||0)+(Number(d.upiCradlee)||0);
    const diffPct=cardUpiBase>0?Math.abs(d.consolidateDiff)/cardUpiBase:(d.consolidateDiff!==0?Infinity:0);
    return{overThreshold:diffPct>(csDiffThresholdPct/100),diffPct};
  };
  const buildCollectionSheetExcelBlob=async()=>{
    await loadExcelJS();
    const wb=new ExcelJS.Workbook();
    wb.creator='SalonOS';wb.created=new Date();
    const ws=wb.addWorksheet('Collection Reco');
    const GREEN_FILL={type:'pattern',pattern:'solid',fgColor:{argb:'FFE3F2E9'}};
    const ORANGE_FILL={type:'pattern',pattern:'solid',fgColor:{argb:'FFFCE9D6'}};
    const RED_FILL={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFD6D6'}};
    const GREEN_TEXT={argb:'FF12805C'};
    const RED_TEXT={argb:'FFCF3D3D'};
    const GREEN_COLS=new Set([2,5,8]),ORANGE_COLS=new Set([3,6,9]),DIFF_COLS=new Set([4,7,10]);

    const headerRow=ws.addRow(['Date','Cash (Cradlee)','Cash (Counter)','Cash Diff','Card (Cradlee)','Card (Bank)','Card Diff','UPI (Cradlee)','UPI (Bank)','UPI Diff','Consolidate Diff']);
    headerRow.eachCell(cell=>{cell.fill=EXCEL_HEADER_FILL;cell.font=EXCEL_HEADER_FONT;cell.border=EXCEL_THIN_BORDER;cell.alignment={vertical:'middle',horizontal:'center'};});

    const sums=Array(10).fill(0);
    collectionSheetRows.forEach((d,idx)=>{
      const{overThreshold}=csRowFlags(d);
      const vals=[d.cashCradlee||0,d.counterRaw?Number(d.counterRaw):null,d.cashDiff,d.cardCradlee||0,d.cardBank||0,d.cardDiff,d.upiCradlee||0,d.upiBank||0,d.upiDiff,d.consolidateDiff];
      vals.forEach((v,i)=>{if(typeof v==='number')sums[i]+=v;});
      const row=ws.addRow([d.date,...vals]);
      row.eachCell({includeEmpty:true},(cell,colNum)=>{
        cell.border=EXCEL_THIN_BORDER;
        if(colNum===1){if(idx%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF4F7FB'}};return;}
        const v=cell.value;
        if(typeof v==='number')cell.numFmt='#,##0.00';
        cell.alignment={horizontal:'right'};
        if(GREEN_COLS.has(colNum))cell.fill=GREEN_FILL;
        else if(ORANGE_COLS.has(colNum))cell.fill=ORANGE_FILL;
        else if(DIFF_COLS.has(colNum)){
          if(typeof v==='number'&&v!==0)cell.font={color:v>0?GREEN_TEXT:RED_TEXT,bold:true};
          else cell.font={color:{argb:'FF8A94A6'}};
        }else if(colNum===11){
          if(overThreshold){cell.fill=RED_FILL;cell.font={color:RED_TEXT,bold:true};}
          else cell.font={color:{argb:'FF5B6472'}};
        }
      });
    });

    const lastDataRow=1+collectionSheetRows.length;
    const cols=['B','C','D','E','F','G','H','I','J','K'];
    const totalRow=ws.addRow(['TOTAL',...cols.map((L,i)=>({formula:'SUM('+L+'2:'+L+lastDataRow+')',result:Math.round(sums[i]*100)/100}))]);
    totalRow.eachCell((cell,colNum)=>{
      cell.font={bold:true};
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEEF3FA'}};
      cell.border={...EXCEL_THIN_BORDER,top:{style:'medium',color:{argb:'FF14335E'}}};
      if(colNum>1){cell.alignment={horizontal:'right'};cell.numFmt='#,##0.00';}
    });

    ws.getColumn(1).width=13;
    for(let c=2;c<=11;c++)ws.getColumn(c).width=15;
    ws.views=[{state:'frozen',ySplit:1}];
    ws.autoFilter={from:{row:1,column:1},to:{row:1,column:11}};

    const buf=await wb.xlsx.writeBuffer();
    return new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  };
  const buildCollectionSheetPdfBlob=async()=>{
    await loadScript(CDN_JSPDF_URL);
    await loadScript(CDN_JSPDF_AUTOTABLE_URL);
    if(!window.jspdf||!window.jspdf.jsPDF)throw new Error('PDF engine unavailable — check your internet connection.');
    const{jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:'l',unit:'mm',format:'a4'});
    const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
    doc.setFillColor(20,51,94);doc.rect(0,0,pw,18,'F');
    doc.setTextColor(255,255,255);doc.setFontSize(13);doc.setFont(undefined,'bold');
    doc.text('Collection Reco — '+(salon?salon.name.split('—')[0].trim():'Outlet'),8,9);
    doc.setFontSize(8);doc.setFont(undefined,'normal');doc.setTextColor(200,215,235);
    doc.text('Collection Reco · Generated '+new Date().toLocaleString('en-IN'),8,14.5);

    const hdr=['Date','Cash (Cradlee)','Cash (Counter)','Cash Diff','Card (Cradlee)','Card (Bank)','Card Diff','UPI (Cradlee)','UPI (Bank)','UPI Diff','Consolidate Diff'];
    const sums=Array(10).fill(0);
    const rowMeta=[]; // per body row: {overThreshold, diffSigns:{3:sign,6:sign,9:sign}}
    const body=collectionSheetRows.map(d=>{
      const{overThreshold}=csRowFlags(d);
      const vals=[d.cashCradlee||0,d.counterRaw?Number(d.counterRaw):null,d.cashDiff,d.cardCradlee||0,d.cardBank||0,d.cardDiff,d.upiCradlee||0,d.upiBank||0,d.upiDiff,d.consolidateDiff];
      vals.forEach((v,i)=>{if(typeof v==='number')sums[i]+=v;});
      rowMeta.push({overThreshold,diffSigns:{3:d.cashDiff,6:d.cardDiff,9:d.upiDiff}});
      return[d.date,money(d.cashCradlee),d.counterRaw?money(Number(d.counterRaw)):'—',d.cashDiff===null?'—':money(d.cashDiff),money(d.cardCradlee),money(d.cardBank),money(d.cardDiff),money(d.upiCradlee),money(d.upiBank),money(d.upiDiff),money(d.consolidateDiff)];
    });
    doc.autoTable({
      head:[hdr],body,
      foot:[['TOTAL',money(sums[0]),money(sums[1]),money(sums[2]),money(sums[3]),money(sums[4]),money(sums[5]),money(sums[6]),money(sums[7]),money(sums[8]),money(sums[9])]],
      startY:22,margin:{top:22,left:8,right:8,bottom:12},
      styles:{fontSize:7.5,cellPadding:2,overflow:'linebreak',halign:'right'},
      headStyles:{fillColor:[20,51,94],textColor:255,fontStyle:'bold',fontSize:7.5,halign:'center'},
      footStyles:{fillColor:[238,243,250],textColor:[20,51,94],fontStyle:'bold',fontSize:7.5},
      columnStyles:{0:{halign:'left'}},
      didParseCell:(data)=>{
        if(data.section!=='body')return;
        const col=data.column.index,meta=rowMeta[data.row.index];
        if(!meta)return;
        if([1,4,7].includes(col))data.cell.styles.fillColor=[227,242,233];
        else if([2,5,8].includes(col))data.cell.styles.fillColor=[252,233,214];
        else if([3,6,9].includes(col)){
          const sign=meta.diffSigns[col];
          if(typeof sign==='number'&&sign!==0)data.cell.styles.textColor=sign>0?[18,128,92]:[207,61,61];
          else data.cell.styles.textColor=[138,148,166];
        }else if(col===10&&meta.overThreshold){
          data.cell.styles.fillColor=[255,214,214];data.cell.styles.textColor=[207,61,61];data.cell.styles.fontStyle='bold';
        }
      }
    });
    const pageCount=doc.internal.getNumberOfPages();
    for(let i=1;i<=pageCount;i++){
      doc.setPage(i);
      doc.setFontSize(7.5);doc.setTextColor(140,150,165);
      doc.text('SalonOS — Confidential',8,ph-5);
      doc.text('Page '+i+' of '+pageCount,pw-8,ph-5,{align:'right'});
    }
    return doc.output('blob');
  };

  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,React.createElement('div',{className:'page-title'},'Collection Reco'),React.createElement('div',{className:'page-sub'},'Daily reconciliation — Cradlee vs Counter Report vs Bank Statement · '+(salon?salon.name.split('—')[0].trim():'Outlet')))
    ),
    collectionSheetRows.length===0&&React.createElement('div',{className:'card',style:{textAlign:'center',padding:40,color:'var(--text3)'}},
      'No Collection Reco data yet — import a Cradlee Collection Report from Collection Summary first.',
      React.createElement('div',{style:{marginTop:12}},React.createElement('button',{className:'btn btn-primary btn-sm',onClick:()=>onNavTab&&onNavTab('collection')},'Go to Collection Summary →'))
    ),
      collectionSheetRows.length>0&&React.createElement('div',{className:'card',style:{marginTop:16}},
        React.createElement('div',{className:'section-header',style:{marginBottom:10}},
          React.createElement('div',{className:'card-title',style:{marginBottom:0}},'📊 Collection Reco'),
          React.createElement('div',{style:{display:'flex',gap:8}},
            React.createElement('div',{title:'Consolidate Difference is flagged red once it exceeds this % of that day\'s Card + UPI As Per Cradlee — adjust to suit how tight a match you expect',style:{display:'flex',alignItems:'center',gap:6,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'4px 10px',fontSize:11.5,color:'var(--text3)'}},
              'Flag Diff over',
              React.createElement('input',{type:'number',min:0,step:0.5,value:csDiffThresholdPct,onChange:e=>setCsDiffThresholdPct(Math.max(0,Number(e.target.value)||0)),style:{width:48,padding:'2px 4px',border:'1px solid var(--border)',borderRadius:4,background:'var(--bg2)',color:'var(--text)',fontSize:11.5,textAlign:'center'}}),
              '%'
            ),
            React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Jump to Daily Sales & Exp',onClick:()=>onNavTab&&onNavTab('daily-sales')},'📆 Daily Sales & Exp'),
            React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Jump to Bank Statement',onClick:()=>onNavTab&&onNavTab('bank-statement')},'🏦 Bank Statement'),
            React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:refreshBankSettlements},'⟳ Refresh Bank Data'),
            React.createElement(ShareReportButton,{
              title:'Collection Reco — '+(salon?salon.name.split('—')[0].trim():'Outlet'),
              subtitle:'Collection Reco',
              getBodyHtml:()=>'<table><thead><tr><th>Date</th><th class="num">Cash (Cradlee)</th><th class="num">Cash (Counter)</th><th class="num">Cash Diff</th><th class="num">Card (Cradlee)</th><th class="num">Card (Bank)</th><th class="num">Card Diff</th><th class="num">UPI (Cradlee)</th><th class="num">UPI (Bank)</th><th class="num">UPI Diff</th><th class="num">Consolidate Diff</th></tr></thead><tbody>'
                +collectionSheetRows.map(r=>'<tr><td>'+r.date+'</td><td class="num">'+money(r.cashCradlee)+'</td><td class="num">'+(r.counterRaw?money(Number(r.counterRaw)):'—')+'</td><td class="num">'+(r.cashDiff===null?'—':money(r.cashDiff))+'</td><td class="num">'+money(r.cardCradlee)+'</td><td class="num">'+money(r.cardBank)+'</td><td class="num">'+money(r.cardDiff)+'</td><td class="num">'+money(r.upiCradlee)+'</td><td class="num">'+money(r.upiBank)+'</td><td class="num">'+money(r.upiDiff)+'</td><td class="num">'+money(r.consolidateDiff)+'</td></tr>').join('')+'</tbody></table>',
              getSheetRows:()=>[['Date','Cash (Cradlee)','Cash (Counter)','Cash Diff','Card (Cradlee)','Card (Bank)','Card Diff','UPI (Cradlee)','UPI (Bank)','UPI Diff','Consolidate Diff'],
                ...collectionSheetRows.map(r=>[r.date,r.cashCradlee,r.counterRaw?Number(r.counterRaw):'',r.cashDiff===null?'':r.cashDiff,r.cardCradlee,r.cardBank,r.cardDiff,r.upiCradlee,r.upiBank,r.upiDiff,r.consolidateDiff])],
              landscape:true,
              buildExcelBlob:buildCollectionSheetExcelBlob,
              buildPdfBlob:buildCollectionSheetPdfBlob
            })
          )
        ),
        React.createElement('div',{style:{display:'flex',alignItems:'center',flexWrap:'wrap',gap:12,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'8px 14px',marginBottom:12,fontSize:11.5}},
          React.createElement('span',{style:{fontWeight:600,color:'var(--text)'}},'Card As Per Cradlee = Card'),
          CS_CARD_EXTRA_COLS.map(c=>React.createElement('label',{key:c.key,style:{display:'flex',alignItems:'center',gap:5,cursor:'pointer',color:'var(--text2)'}},
            React.createElement('input',{type:'checkbox',checked:!!csCardIncludeCols[c.key],onChange:()=>toggleCsCardIncludeCol(c.key)}),
            '+ '+c.label
          ))
        ),
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:12,lineHeight:1.6}},
          'One row per day. Reason for Diff is picked from a dropdown (Previous Month Collection or Credit Sale, each with its own amount) — Cash As Per Counter Report pulls from Daily Sales & Exp\'s Cash Sale row, and Card/UPI As Per Bank Statement pull automatically from Bank Statement\'s Card/UPI Settlement credits, both linked by Date as per Cradlee. Card As Per Cradlee folds in whichever of Wallet/District/Luzo/Online are ticked above, alongside Card itself — all electronic channels that settle through the bank the same way. The small \u201c\ud83d\udd17 from \u2026\u201d links under those figures jump straight to that source screen. Consolidate Difference = sum of all three Difference columns — flagged red, and a Reason becomes required, once it exceeds the % set above. Click any column header to filter it. Click a cell — or drag across several — then Ctrl/Cmd+C to copy, or Ctrl/Cmd+V to paste, like Excel.'
        ),
        (()=>{
          const missingCount=collectionSheetRows.filter(d=>{
            const{overThreshold}=csRowFlags(d);
            const entry=reasonEntryFor(d.date);
            return overThreshold&&!(entry&&entry.type);
          }).length;
          return missingCount>0&&React.createElement('div',{style:{background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.3)',borderRadius:'var(--r)',padding:'8px 14px',marginBottom:12,fontSize:12,color:'var(--red)',fontWeight:600,display:'flex',alignItems:'center',flexWrap:'wrap',gap:10}},
            React.createElement('span',null,'⚠ '+missingCount+' day'+(missingCount===1?'':'s')+' with a Consolidate Diff over '+csDiffThresholdPct+'% still need'+(missingCount===1?'s':'')+' a Reason for Diff.'),
            React.createElement('span',{style:{display:'flex',gap:12,fontWeight:500}},
              React.createElement('span',{style:{cursor:'pointer',textDecoration:'underline'},onClick:()=>onNavTab&&onNavTab('daily-sales')},'Check Daily Sales & Exp →'),
              React.createElement('span',{style:{cursor:'pointer',textDecoration:'underline'},onClick:()=>onNavTab&&onNavTab('bank-statement')},'Check Bank Statement →')
            )
          );
        })(),
        React.createElement('div',{className:'table-wrap',ref:csWrapRef},
          React.createElement('table',{style:{borderCollapse:'collapse',width:'100%',fontSize:11.5}},
            React.createElement('thead',null,React.createElement('tr',null,
              [
                {col:csFilterCols[0],bg:undefined},
                {col:csFilterCols[1],bg:'rgba(74,158,255,0.18)'},
                {col:csFilterCols[2],bg:'rgba(255,159,67,0.18)'},
                {col:csFilterCols[3],bg:undefined},
                {col:csFilterCols[4],bg:'rgba(74,158,255,0.18)'},
                {col:csFilterCols[5],bg:'rgba(255,159,67,0.18)'},
                {col:csFilterCols[6],bg:undefined},
                {col:csFilterCols[7],bg:'rgba(74,158,255,0.18)'},
                {col:csFilterCols[8],bg:'rgba(255,159,67,0.18)'},
                {col:csFilterCols[9],bg:undefined},
                {col:csFilterCols[10],bg:'rgba(255,107,107,0.28)'},
                {col:{key:'reason',label:'Reason for Diff',get:d=>reasonDisplayText(d.date)||'(blank)'},bg:undefined}
              ].map(({col,bg})=>{
                const active=csColumnFilters[col.key];
                const isOpen=csOpenFilterCol===col.key;
                return React.createElement('th',{key:col.key,style:{padding:'8px 10px',background:bg||'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.03em',whiteSpace:'nowrap',borderBottom:'2px solid var(--accent)'}},
                  React.createElement('div',{
                    className:'autofilter-toggle',
                    style:{display:'inline-flex',alignItems:'center',gap:6,cursor:'pointer',userSelect:'none',padding:'3px 6px',borderRadius:5,background:isOpen?'rgba(47,95,224,0.16)':'transparent',transition:'background 0.12s'},
                    onClick:e=>csOpenFilterAt(col.key,e)
                  },
                    col.label,
                    React.createElement('span',{style:{display:'inline-flex',alignItems:'center',justifyContent:'center',width:14,height:14,borderRadius:3,background:active?'var(--accent)':'transparent',color:active?'#1a1410':'inherit',fontSize:8}},'▾')
                  )
                );
              })
            )),
            React.createElement('tbody',null,filteredCollectionSheetRows.map((d,i)=>{
              const sel=(c)=>csCellRange.isSelected(i,c)?'rgba(47,95,224,0.25)':undefined;
              const diffCell=(v,k,c)=>React.createElement('td',{key:k,'data-xr':i,'data-xc':c,style:{padding:'7px 10px',textAlign:'right',background:sel(c)||'rgba(150,150,160,0.10)',color:v===null?'var(--text3)':v===0?'var(--text3)':v>0?'var(--green)':'var(--red)',fontWeight:600,borderBottom:'1px solid var(--border)'}},v===null?'—':(v>=0?'+':'')+money(v));
              const cradleeCell=(v,k,c)=>React.createElement('td',{key:k,'data-xr':i,'data-xc':c,style:{padding:'7px 10px',textAlign:'right',background:sel(c)||'rgba(76,175,125,0.12)',color:'var(--text)',borderBottom:'1px solid var(--border)'}},money(v));
              const otherCell=(v,k,c)=>React.createElement('td',{key:k,'data-xr':i,'data-xc':c,style:{padding:'7px 10px',textAlign:'right',background:sel(c)||'rgba(255,159,67,0.12)',color:'var(--text)',fontWeight:600,borderBottom:'1px solid var(--border)'}},
                v?money(v):React.createElement('span',{style:{color:'var(--text3)',fontWeight:400}},'—'),
                React.createElement('div',{style:{fontSize:9,color:'var(--text3)',fontWeight:400,marginTop:1,cursor:'pointer'},title:'Jump to Bank Statement',onClick:()=>onNavTab&&onNavTab('bank-statement')},'🔗 from Bank Statement')
              );
              return React.createElement('tr',{key:d.date},
                React.createElement('td',{'data-xr':i,'data-xc':0,style:{padding:'7px 10px',fontWeight:500,color:'var(--text)',whiteSpace:'nowrap',borderBottom:'1px solid var(--border)',background:sel(0)}},d.date),
                cradleeCell(d.cashCradlee,'cashCr',1),
                React.createElement('td',{key:'cashCounter','data-xr':i,'data-xc':2,style:{padding:'7px 10px',textAlign:'right',background:sel(2)||'rgba(255,159,67,0.12)',borderBottom:'1px solid var(--border)',color:'var(--text)',fontWeight:600}},
                  d.counterRaw!==''?money(Number(d.counterRaw)):React.createElement('span',{style:{color:'var(--text3)',fontWeight:400}},'—'),
                  React.createElement('div',{style:{fontSize:9,color:'var(--text3)',fontWeight:400,marginTop:1,cursor:'pointer'},title:'Jump to Daily Sales & Exp',onClick:()=>onNavTab&&onNavTab('daily-sales')},'🔗 from Daily Sales & Exp')
                ),
                diffCell(d.cashDiff,'cashDiff',3),
                cradleeCell(d.cardCradlee,'cardCr',4),
                otherCell(d.cardBank,'cardBank',5),
                diffCell(d.cardDiff,'cardDiff',6),
                cradleeCell(d.upiCradlee,'upiCr',7),
                otherCell(d.upiBank,'upiBank',8),
                diffCell(d.upiDiff,'upiDiff',9),
                (()=>{
                  // Flag Consolidate Difference in red only when it's actually material — more
                  // than the configured % of that day's Card + UPI As Per Cradlee (the base it's
                  // being compared against, adjustable above) — rather than tinting every row red
                  // regardless of size, which made a ₹20 rounding gap look as urgent as a ₹5,000 one.
                  const{overThreshold,diffPct}=csRowFlags(d);
                  const cardUpiBase=(Number(d.cardCradlee)||0)+(Number(d.upiCradlee)||0);
                  return React.createElement('td',{key:'consolidate','data-xr':i,'data-xc':10,style:{padding:'7px 10px',textAlign:'right',background:sel(10)||(overThreshold?'rgba(255,60,60,0.35)':'transparent'),color:d.consolidateDiff===0?'var(--text2)':(overThreshold?'var(--red)':'var(--text)'),fontWeight:overThreshold?700:500,borderBottom:'1px solid var(--border)'},title:cardUpiBase>0?diffPct.toLocaleString('en-IN',{style:'percent',maximumFractionDigits:2})+' of Card + UPI As Per Cradlee':undefined},(d.consolidateDiff>=0?'+':'')+money(d.consolidateDiff));
                })(),
                React.createElement('td',{key:'reason','data-xr':i,'data-xc':11,style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',background:sel(11)}},
                  (()=>{
                    const entry=reasonEntryFor(d.date);
                    const legacy=entry&&entry.legacy;
                    const type=entry&&entry.type;
                    const typeDef=REASON_TYPES.find(r=>r.id===type);
                    const{overThreshold}=csRowFlags(d);
                    const reasonMissing=overThreshold&&!type;
                    const fieldStyle={width:'100%',background:'transparent',border:'1px solid var(--border)',borderRadius:4,color:'var(--text)',fontSize:11,padding:'3px 5px'};
                    return React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:3,minWidth:190}},
                      legacy&&React.createElement('div',{style:{fontSize:9.5,color:'var(--text3)',fontStyle:'italic'}},'Note: '+legacy),
                      reasonMissing&&React.createElement('div',{style:{fontSize:9.5,color:'var(--red)',fontWeight:600}},'⚠ Reason required — Consolidate Diff is over threshold'),
                      React.createElement('select',{value:type||'',onChange:e=>setReasonType(d.date,e.target.value),style:reasonMissing?{...fieldStyle,border:'1.5px solid var(--red)',background:'rgba(255,107,107,0.06)'}:fieldStyle},
                        React.createElement('option',{value:''},legacy?'— Replace note with a reason —':(reasonMissing?'— Select Reason (required) —':'— Select Reason —')),
                        REASON_TYPES.map(r=>React.createElement('option',{key:r.id,value:r.id},r.label))
                      ),
                      type&&React.createElement('div',{style:{display:'flex',alignItems:'center',gap:4}},
                        React.createElement('span',{style:{fontSize:10.5,color:'var(--text3)'}},'₹'),
                        React.createElement('input',{type:'number',min:0,value:entry.amount??'',placeholder:'0',
                          onChange:e=>setReasonField(d.date,'amount',e.target.value),style:fieldStyle})
                      ),
                      typeDef&&typeDef.fields.map(f=>React.createElement('input',{key:f,type:'text',value:entry[f]||'',placeholder:REASON_EXTRA_FIELDS[f].placeholder,
                        onChange:e=>setReasonField(d.date,f,e.target.value),style:fieldStyle,title:REASON_EXTRA_FIELDS[f].label})),
                      type==='prevMonth'&&(()=>{
                        const ref=prevMonthCreditSaleRefFor(d.date);
                        return React.createElement('div',{style:{fontSize:9.5,color:'var(--text3)',lineHeight:1.5}},
                          'Last month\'s Credit Sale: ₹'+ref.totalCreditSale.toLocaleString()+' · Received so far: ₹'+ref.receivedSoFar.toLocaleString()+' · ',
                          React.createElement('span',{style:{color:ref.outstanding>0?'var(--red)':'var(--green)',fontWeight:600}},'Still not received: ₹'+ref.outstanding.toLocaleString())
                        );
                      })()
                    );
                  })()
                )
              );
            })),
            (()=>{
              const t=filteredCollectionSheetRows.reduce((a,d)=>({
                cashCradlee:a.cashCradlee+d.cashCradlee,
                counter:a.counter+(d.counterRaw?Number(d.counterRaw):0),
                cashDiff:a.cashDiff+(d.cashDiff||0),
                cardCradlee:a.cardCradlee+d.cardCradlee,
                cardBank:a.cardBank+d.cardBank,
                cardDiff:a.cardDiff+d.cardDiff,
                upiCradlee:a.upiCradlee+d.upiCradlee,
                upiBank:a.upiBank+d.upiBank,
                upiDiff:a.upiDiff+d.upiDiff,
                consolidateDiff:a.consolidateDiff+d.consolidateDiff
              }),{cashCradlee:0,counter:0,cashDiff:0,cardCradlee:0,cardBank:0,cardDiff:0,upiCradlee:0,upiBank:0,upiDiff:0,consolidateDiff:0});
              const diffTotalCell=(v)=>React.createElement('td',{style:{padding:'7px 10px',textAlign:'right',background:'rgba(150,150,160,0.16)',color:v===0?'var(--text2)':v>0?'var(--green)':'var(--red)',fontWeight:700}},(v>=0?'+':'')+money(v));
              return React.createElement('tfoot',null,React.createElement('tr',{style:{background:'var(--bg3)'}},
                React.createElement('td',{style:{padding:'7px 10px',fontWeight:700,color:'var(--text)',whiteSpace:'nowrap'}},'TOTAL ('+filteredCollectionSheetRows.length+' day'+(filteredCollectionSheetRows.length===1?'':'s')+')'),
                React.createElement('td',{style:{padding:'7px 10px',textAlign:'right',background:'rgba(76,175,125,0.18)',fontWeight:700,color:'var(--text)'}},money(t.cashCradlee)),
                React.createElement('td',{style:{padding:'7px 10px',textAlign:'right',background:'rgba(255,159,67,0.18)',fontWeight:700,color:'var(--text)'}},money(t.counter)),
                diffTotalCell(t.cashDiff),
                React.createElement('td',{style:{padding:'7px 10px',textAlign:'right',background:'rgba(76,175,125,0.18)',fontWeight:700,color:'var(--text)'}},money(t.cardCradlee)),
                React.createElement('td',{style:{padding:'7px 10px',textAlign:'right',background:'rgba(255,159,67,0.18)',fontWeight:700,color:'var(--text)'}},money(t.cardBank)),
                diffTotalCell(t.cardDiff),
                React.createElement('td',{style:{padding:'7px 10px',textAlign:'right',background:'rgba(76,175,125,0.18)',fontWeight:700,color:'var(--text)'}},money(t.upiCradlee)),
                React.createElement('td',{style:{padding:'7px 10px',textAlign:'right',background:'rgba(255,159,67,0.18)',fontWeight:700,color:'var(--text)'}},money(t.upiBank)),
                diffTotalCell(t.upiDiff),
                React.createElement('td',{style:{padding:'7px 10px',textAlign:'right',background:'rgba(255,107,107,0.3)',fontWeight:700,color:t.consolidateDiff===0?'var(--text)':'var(--red)'}},(t.consolidateDiff>=0?'+':'')+money(t.consolidateDiff)),
                React.createElement('td',null)
              ));
            })()
          )
        )
      ),
      // ── Reco of Actual Bank Charges — nets Consolidate Difference against every explainable
      // reason logged above (Reason for Diff's four types, plus Tip To Employee paid out in cash)
      // for exactly the same filtered set of days shown in the table, so what's left over is the
      // genuine, unexplained gap — actual bank/processor charges — rather than a number muddied by
      // known, already-accounted-for differences.
      (()=>{
        let prevMonth=0,excess=0,creditSale=0,shortCollection=0,tip=0,consolidateDiff=0;
        filteredCollectionSheetRows.forEach(d=>{
          consolidateDiff+=d.consolidateDiff;
          tip+=tipForDate(d.date);
          const entry=reasonEntryFor(d.date);
          if(entry&&typeof entry==='object'){
            const amt=Number(entry.amount)||0;
            if(entry.type==='prevMonth')prevMonth+=amt;
            else if(entry.type==='excessCollection')excess+=amt;
            else if(entry.type==='creditSale')creditSale+=amt;
            else if(entry.type==='shortCollection')shortCollection+=amt;
          }
        });
        const netBankCharges=consolidateDiff-prevMonth-excess-tip+creditSale+shortCollection;
        const recoRow=(label,val,sign)=>React.createElement('div',{key:label,style:{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:12.5}},
          React.createElement('span',{style:{color:'var(--text2)'}},label),
          React.createElement('span',{style:{fontWeight:600,color:sign==='less'?'var(--red)':sign==='add'?'var(--green)':(val<0?'var(--red)':'var(--text)')}},
            (sign==='less'?'− ':sign==='add'?'+ ':(val<0?'':''))+'₹'+Math.abs(val).toLocaleString())
        );
        return React.createElement('div',{className:'card',style:{marginTop:16,maxWidth:460}},
          React.createElement('div',{style:{fontFamily:'var(--font2)',fontSize:15,color:'var(--text)',marginBottom:4}},'Reco of Actual Bank Charges'),
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:12}},'For the '+filteredCollectionSheetRows.length+' day'+(filteredCollectionSheetRows.length===1?'':'s')+' shown above — same filter as the table.'),
          recoRow('Consolidate Difference',consolidateDiff,null),
          recoRow('Less Previous Month Collection',prevMonth,'less'),
          recoRow('Less Excess Collection',excess,'less'),
          recoRow('Less Tip to Employee',tip,'less'),
          recoRow('Add Credit Sale',creditSale,'add'),
          recoRow('Add Short Collection',shortCollection,'add'),
          React.createElement('div',{style:{display:'flex',justifyContent:'space-between',padding:'12px 0 2px',fontSize:14,fontWeight:700}},
            React.createElement('span',null,'Net Bank Charges'),
            React.createElement('span',{style:{color:netBankCharges===0?'var(--text)':netBankCharges>0?'var(--red)':'var(--green)'}},(netBankCharges>=0?'':'−')+'₹'+Math.abs(netBankCharges).toLocaleString())
          )
        );
      })(),
      csCellRange.Toolbar(),

      csOpenFilterCol&&(()=>{
        const col=csFilterCols.find(c=>c.key===csOpenFilterCol)||{key:'reason',label:'Reason for Diff',get:d=>reasonDisplayText(d.date)||'(blank)'};
        const allVals=csUniqueValuesFor(col);
        const active=csColumnFilters[col.key];
        const visibleVals=allVals.filter(v=>v.value.toLowerCase().includes(csFilterSearch.toLowerCase()));
        const isChecked=(v)=>!active||active.has(v);
        const selectedCount=active?active.size:allVals.length;
        return ReactDOM.createPortal(
          React.createElement('div',{
            className:'autofilter-popover',
            style:{position:'fixed',top:csFilterPos.top,left:csFilterPos.left,zIndex:1000,width:260,background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:10,boxShadow:'0 12px 32px rgba(0,0,0,0.45),0 2px 8px rgba(0,0,0,0.3)',overflow:'hidden',fontFamily:'inherit'}
          },
            React.createElement('div',{style:{padding:'10px 12px',borderBottom:'1px solid var(--border)',background:'var(--bg3)'}},
              React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text)',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}},
                React.createElement('span',null,col.label),
                React.createElement('span',{style:{fontSize:10,fontWeight:500,color:'var(--text3)'}},selectedCount+' of '+allVals.length)
              ),
              React.createElement('div',{style:{position:'relative'}},
                React.createElement('span',{style:{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',fontSize:11,color:'var(--text3)'}},React.createElement(IconSearch,{size:13})),
                React.createElement('input',{value:csFilterSearch,onChange:e=>setCsFilterSearch(e.target.value),placeholder:'Search values…',autoFocus:true,
                  style:{width:'100%',padding:'6px 8px 6px 24px',fontSize:12,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)'}})
              )
            ),
            React.createElement('div',{style:{display:'flex',gap:8,padding:'8px 12px',borderBottom:'1px solid var(--border)'}},
              React.createElement('button',{onClick:()=>csClearColumnFilter(col.key),style:{flex:1,padding:'4px 0',fontSize:10.5,fontWeight:600,color:'var(--accent)',background:'transparent',border:'none',cursor:'pointer'}},'Select All'),
              React.createElement('button',{onClick:()=>setCsColumnFilters(prev=>({...prev,[col.key]:new Set()})),style:{flex:1,padding:'4px 0',fontSize:10.5,fontWeight:600,color:'var(--text3)',background:'transparent',border:'none',cursor:'pointer'}},'Clear All')
            ),
            React.createElement('div',{style:{maxHeight:240,overflowY:'auto',padding:'6px 4px'}},
              visibleVals.length===0
                ?React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',padding:'14px 12px',textAlign:'center'}},'No matching values')
                :visibleVals.map(({value,count})=>React.createElement('label',{key:value,
                    style:{display:'flex',alignItems:'center',gap:8,fontSize:12,padding:'6px 8px',cursor:'pointer',color:'var(--text2)',borderRadius:6},
                    onMouseEnter:e=>e.currentTarget.style.background='rgba(47,95,224,0.08)',
                    onMouseLeave:e=>e.currentTarget.style.background='transparent'
                  },
                    React.createElement('input',{type:'checkbox',checked:isChecked(value),onChange:()=>csToggleFilterValue(col.key,value,allVals.map(v=>v.value))}),
                    React.createElement('span',{style:{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},value),
                    React.createElement('span',{style:{fontSize:10,color:'var(--text3)'}},count)
                  ))
            ),
            React.createElement('div',{style:{display:'flex',justifyContent:'flex-end',padding:'8px 12px',borderTop:'1px solid var(--border)',background:'var(--bg3)'}},
              React.createElement('button',{className:'btn btn-primary btn-sm',style:{padding:'5px 16px',fontSize:11.5},onClick:()=>setCsOpenFilterCol(null)},'OK')
            )
          ),
          document.body
        );
      })(),
  );
}


function BankStatement({salon,onNavTab}={}){
  const salonId=salon?.id;
  const bsWrapRef=useRef(null);
  const cellRange=useExcelCellRange(bsWrapRef);
  const BANKS={
    'Generic':{headers:['Transaction Date','Value Date','Description','Cheque/Ref No','Debit','Credit','Closing Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'HDFC Bank':{headers:['Date','Value Dt','Narration','Chq./Ref.No.','Withdrawal Amt.','Deposit Amt.','Closing Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'ICICI Bank':{headers:['Transaction Date','Value Date','Transaction Remarks','Cheque Number','Withdrawal Amount (INR)','Deposit Amount (INR)','Balance (INR)'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'Axis Bank':{headers:['Tran Date','Value Date','Transaction Particulars','Chq No','Debit','Credit','Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'State Bank of India':{headers:['Txn Date','Value Date','Description','Ref No./Cheque No.','Debit','Credit','Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'Kotak Mahindra Bank':{headers:['Transaction Date','Value Date','Description','Cheque / Reference Number','Debit','Credit','Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'Bank of Baroda':{headers:['Txn Date','Value Date','Description','Cheque No','Debit','Credit','Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'Punjab National Bank':{headers:['Date','Value Date','Particulars','Instrument ID','Debit','Credit','Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'Canara Bank':{headers:['Txn Date','Value Date','Description','Cheque Number','Debit','Credit','Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'Union Bank of India':{headers:['Txn Date','Value Date','Description','Ref No/Chq No','Debit','Credit','Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'IndusInd Bank':{headers:['Date','Value Date','Transaction Details','Cheque No','Withdrawal','Deposit','Running Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'Yes Bank':{headers:['Transaction Date','Value Date','Description','Cheque No','Debit','Credit','Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'IDFC FIRST Bank':{headers:['Date','Value Date','Narration','Chq/Ref No','Withdrawal Amt','Deposit Amt','Running Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'RBL Bank':{headers:['Txn Date','Value Date','Description','Reference No','Debit','Credit','Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'Federal Bank':{headers:['Date','Value Date','Narration','Cheque Details','Debit','Credit','Running Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'Bank of India':{headers:['Date','Value Date','Description','Cheque No','Debit','Credit','Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'IDBI Bank':{headers:['Date','Value Date','Description','Cheque No/Ref No','Withdrawal Amt','Deposit Amt','Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'Bandhan Bank':{headers:['Transaction Date','Value Date','Description','Ref No','Debit','Credit','Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'Central Bank of India':{headers:['Date','Value Date','Particulars','Chq No','Withdrawal','Deposit','Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'UCO Bank':{headers:['Date','Value Date','Description','Chq No','Debit','Credit','Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'Indian Overseas Bank':{headers:['Date','Value Date','Narration','Ref No','Debit','Credit','Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'South Indian Bank':{headers:['Date','Value Date','Description','Cheque No','Debit','Credit','Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'Karnataka Bank':{headers:['Date','Value Date','Narration','Reference','Debit','Credit','Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
    'Standard Chartered Bank':{headers:['Date','Value Date','Description','Reference','Debit','Credit','Balance'],sample:['01/06/2026','01/06/2026','UPI COLLECTION','UPI123456','',40203,125000]},
  };
  // Each bank exposes three separate login portals — Personal (retail), Corporate and
  // Business (MSME/current account) — since these are different systems even for the same bank.
  const BANK_LOGIN_URLS={
    'HDFC Bank':{Personal:'https://now.hdfc.bank.in/retail-app/',Corporate:'https://now.hdfc.bank.in/corporate-enet/',Business:'https://now.hdfc.bank.in/business-app/'},
    'ICICI Bank':{Personal:'https://retailnetbanking.icici.bank.in/',Corporate:'https://corpnetbanking.icici.bank.in/',Business:'https://businessnetbanking.icici.bank.in/'},
    'Axis Bank':{Personal:'https://www.axis.bank.in/retail/',Corporate:'https://www.axis.bank.in/corporate/',Business:'https://www.axis.bank.in/business/'},
    'State Bank of India':{Personal:'https://onlinesbi.sbi.bank.in/personal/',Corporate:'https://onlinesbi.sbi.bank.in/corporate/',Business:'https://onlinesbi.sbi.bank.in/business/'},
    'Kotak Mahindra Bank':{Personal:'https://www.kotak.bank.in/personal/',Corporate:'https://www.kotak.bank.in/corporate/',Business:'https://www.kotak.bank.in/business/'},
    'Bank of Baroda':{Personal:'https://www.bankofbaroda.bank.in/personal/',Corporate:'https://www.bankofbaroda.bank.in/corporate/',Business:'https://www.bankofbaroda.bank.in/business/'},
    'Punjab National Bank':{Personal:'https://www.pnb.bank.in/personal/',Corporate:'https://www.pnb.bank.in/corporate/',Business:'https://www.pnb.bank.in/business/'},
    'Canara Bank':{Personal:'https://www.canarabank.bank.in/personal/',Corporate:'https://www.canarabank.bank.in/corporate/',Business:'https://www.canarabank.bank.in/business/'},
    'Union Bank of India':{Personal:'https://www.unionbankofindia.bank.in/personal/',Corporate:'https://www.unionbankofindia.bank.in/corporate/',Business:'https://www.unionbankofindia.bank.in/business/'},
    'IndusInd Bank':{Personal:'https://www.indusind.bank.in/personal/',Corporate:'https://www.indusind.bank.in/corporate/',Business:'https://www.indusind.bank.in/business/'},
    'Yes Bank':{Personal:'https://www.yesbank.bank.in/personal/',Corporate:'https://www.yesbank.bank.in/corporate/',Business:'https://www.yesbank.bank.in/business/'},
    'IDFC FIRST Bank':{Personal:'https://www.idfcfirstbank.bank.in/personal/',Corporate:'https://www.idfcfirstbank.bank.in/corporate/',Business:'https://www.idfcfirstbank.bank.in/business/'},
    'RBL Bank':{Personal:'https://www.rblbank.bank.in/personal/',Corporate:'https://www.rblbank.bank.in/corporate/',Business:'https://www.rblbank.bank.in/business/'},
    'Federal Bank':{Personal:'https://www.federalbank.bank.in/personal/',Corporate:'https://www.federalbank.bank.in/corporate/',Business:'https://www.federalbank.bank.in/business/'},
    'Bank of India':{Personal:'https://www.bankofindia.bank.in/personal/',Corporate:'https://www.bankofindia.bank.in/corporate/',Business:'https://www.bankofindia.bank.in/business/'},
    'IDBI Bank':{Personal:'https://www.idbibank.bank.in/personal/',Corporate:'https://www.idbibank.bank.in/corporate/',Business:'https://www.idbibank.bank.in/business/'},
    'Bandhan Bank':{Personal:'https://www.bandhanbank.bank.in/personal/',Corporate:'https://www.bandhanbank.bank.in/corporate/',Business:'https://www.bandhanbank.bank.in/business/'},
    'Central Bank of India':{Personal:'https://www.centralbankofindia.bank.in/personal/',Corporate:'https://www.centralbankofindia.bank.in/corporate/',Business:'https://www.centralbankofindia.bank.in/business/'},
    'UCO Bank':{Personal:'https://www.ucobank.bank.in/personal/',Corporate:'https://www.ucobank.bank.in/corporate/',Business:'https://www.ucobank.bank.in/business/'},
    'Indian Overseas Bank':{Personal:'https://www.iob.bank.in/personal/',Corporate:'https://www.iob.bank.in/corporate/',Business:'https://www.iob.bank.in/business/'},
    'South Indian Bank':{Personal:'https://www.southindianbank.bank.in/personal/',Corporate:'https://www.southindianbank.bank.in/corporate/',Business:'https://www.southindianbank.bank.in/business/'},
    'Karnataka Bank':{Personal:'https://www.karnatakabank.bank.in/personal/',Corporate:'https://www.karnatakabank.bank.in/corporate/',Business:'https://www.karnatakabank.bank.in/business/'},
    'Standard Chartered Bank':{Personal:'https://www.standardchartered.bank.in/personal/',Corporate:'https://www.standardchartered.bank.in/corporate/',Business:'https://www.standardchartered.bank.in/business/'},
  };
  const LOGIN_TYPES=['Personal','Corporate','Business'];
  const [bank,setBank]=useState('Generic');
  const [loginType,setLoginType]=useState('Personal');
  const QUICK_BANKS=['HDFC Bank','ICICI Bank','Axis Bank','State Bank of India','Kotak Mahindra Bank'];
  const [otherBankQuery,setOtherBankQuery]=useState('');
  const [otherLoginType,setOtherLoginType]=useState('Personal');
  const otherBankMatch=Object.keys(BANK_LOGIN_URLS).find(b=>b.toLowerCase()===otherBankQuery.trim().toLowerCase());
  const [rows,setRows]=useState(()=>{try{return JSON.parse(cachedLocalGet(outletKey('salonos_bank_statement_rows',salonId))||'[]');}catch(e){return[];}});
  // 'append' by default once there's already data — a second/monthly statement is far more common
  // than deliberately wiping everything out, so that shouldn't require an extra click every time.
  // A brand-new outlet with nothing imported yet has no meaningful choice, so the toggle itself
  // only renders once rows.length>0 (see the Upload Bank Statement card below).
  const [importMode,setImportMode]=useState('append');
  const [fileName,setFileName]=useState('');
  const [message,setMessage]=useState('');
  const [dragging,setDragging]=useState(false);
  const [search,setSearch]=useState('');
  const [selected,setSelected]=useState(()=>new Set());
  const [showRulesModal,setShowRulesModal]=useState(false);
  const fileRef=useRef(null);
  useEffect(()=>{safeLocalSet(outletKey('salonos_bank_statement_rows',salonId),JSON.stringify(rows));},[rows,salonId]);

  // ---- Auto-import from a watched Downloads folder (Chrome/Edge only) ----
  const fsSupported=typeof window!=='undefined'&&typeof window.showDirectoryPicker==='function';
  const [dirHandle,setDirHandle]=useState(null);
  const [dirNeedsPermission,setDirNeedsPermission]=useState(false);
  const [autoStatus,setAutoStatus]=useState('');
  const [autoBusy,setAutoBusy]=useState(false);
  const lastAutoRef=useRef(typeof localStorage!=='undefined'?(cachedLocalGet(outletKey('salonos_bank_last_auto',salonId))||''):'');
  const bankRef=useRef(bank);
  useEffect(()=>{bankRef.current=bank;},[bank]);

  const bankTokens=()=>{
    const short={'Generic':[],'HDFC Bank':['hdfc'],'ICICI Bank':['icici'],'Axis Bank':['axis'],'State Bank of India':['sbi','statebank'],'Kotak Mahindra Bank':['kotak']};
    return short[bankRef.current]||[];
  };

  useEffect(()=>{
    let cancelled=false;
    if(!fsSupported)return;
    (async()=>{
      try{
        const handle=await fsIdbGet(outletKey('bankStatementDir',salonId));
        if(!handle||cancelled)return;
        const perm=await handle.queryPermission({mode:'read'});
        if(cancelled)return;
        setDirHandle(handle);
        if(perm==='granted'){
          scanAndAutoImport(handle,{silent:true});
        }else{
          setDirNeedsPermission(true);
          setAutoStatus('Reconnect needed — click "Check Now" to re-grant folder access.');
        }
      }catch(e){/* no saved folder yet, or IndexedDB unavailable — ignore */}
    })();
    return ()=>{cancelled=true};
    // eslint-disable-next-line
  },[]);

  const findLatestStatement=async(handle)=>{
    let best=null;
    const tokens=['statement','txn','transaction','acct','account',...bankTokens()];
    for await (const entry of handle.values()){
      if(entry.kind!=='file')continue;
      const name=entry.name.toLowerCase();
      if(!tokens.some(t=>name.includes(t)))continue;
      if(!/\.(xlsx|xls|csv)$/.test(name))continue;
      const file=await entry.getFile();
      if(!best||file.lastModified>best.file.lastModified)best={entry,file};
    }
    return best;
  };

  const scanAndAutoImport=async(handle,opts)=>{
    const silent=opts&&opts.silent;
    setAutoBusy(true);
    try{
      const best=await findLatestStatement(handle);
      if(!best){
        if(!silent)setAutoStatus('No matching bank statement file found in the connected folder yet.');
        setAutoBusy(false);return;
      }
      const tag=best.file.name+'|'+best.file.lastModified;
      if(tag===lastAutoRef.current){
        if(!silent)setAutoStatus('Already up to date — "'+best.file.name+'" was already imported.');
        setAutoBusy(false);return;
      }
      await loadWorkbook(best.file);
      lastAutoRef.current=tag;
      safeLocalSet(outletKey('salonos_bank_last_auto',salonId),tag);
      setAutoStatus('Auto-imported "'+best.file.name+'" from your Downloads folder.');
      setDirNeedsPermission(false);
    }catch(err){
      setAutoStatus('Auto-import check failed: '+err.message);
    }
    setAutoBusy(false);
  };

  const connectDownloads=async()=>{
    try{
      const handle=await window.showDirectoryPicker({id:'bank-statement-downloads',mode:'read',startIn:'downloads'});
      try{await fsIdbSet(outletKey('bankStatementDir',salonId),handle);}catch(e){}
      setDirHandle(handle);setDirNeedsPermission(false);
      await scanAndAutoImport(handle);
    }catch(err){
      if(err.name!=='AbortError')setAutoStatus('Could not connect: '+err.message);
    }
  };

  const disconnectDownloads=async()=>{
    try{await fsIdbDelete(outletKey('bankStatementDir',salonId));}catch(e){}
    setDirHandle(null);setDirNeedsPermission(false);
    setAutoStatus('Disconnected from Downloads folder.');
  };

  const checkNow=async()=>{
    if(!dirHandle)return;
    try{
      let perm=await dirHandle.queryPermission({mode:'read'});
      if(perm!=='granted'){
        perm=await dirHandle.requestPermission({mode:'read'});
      }
      if(perm!=='granted'){setAutoStatus('Permission was not granted.');return;}
      setDirNeedsPermission(false);
      await scanAndAutoImport(dirHandle);
    }catch(err){setAutoStatus('Check failed: '+err.message);}
  };

  const keyNorm=(v)=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const val=(r,names)=>{const keys=Object.keys(r);for(const name of names){const hit=keys.find(k=>keyNorm(k)===keyNorm(name));if(hit!==undefined)return r[hit];}return'';};
  const num=(v)=>{if(v===undefined||v===null||v==='')return 0;const n=Number(String(v).replace(/[₹,\s()]/g,'').replace(/^-/,'-'));return Number.isFinite(n)?n:0;};
  const MONTH_ABBR={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
  const fmtDate=(v,swap)=>{
    if(v===undefined||v===null||v==='')return'';
    if(v instanceof Date&&!isNaN(v))return String(v.getDate()).padStart(2,'0')+'/'+String(v.getMonth()+1).padStart(2,'0')+'/'+v.getFullYear();
    if(typeof v==='number'&&window.XLSX&&XLSX.SSF){const d=XLSX.SSF.parse_date_code(v);if(d)return String(d.d).padStart(2,'0')+'/'+String(d.m).padStart(2,'0')+'/'+d.y;}
    const x=String(v).trim();
    let m=x.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if(m){
      const a=+m[1],b=+m[2];
      const year=m[3].length===2?'20'+m[3]:m[3];
      let day=a,month=b;
      if(a>12&&b<=12){/* already day-first — a can only be a day */}
      else if(b>12&&a<=12){day=b;month=a;/* was month-first (US-style) — swap to day-first */}
      else if(swap){day=b;month=a;/* both ≤12: genuinely ambiguous here, but other rows in this same file proved it's month-first, so stay consistent */}
      return String(day).padStart(2,'0')+'/'+String(month).padStart(2,'0')+'/'+year;
    }
    m=x.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);if(m)return m[3].padStart(2,'0')+'/'+m[2].padStart(2,'0')+'/'+m[1];
    // Month-name dates — e.g. "01-Jun-2026", "01 Jun 2026", "1-Jun-26" — some banks (Yes Bank's
    // own export among them) write the transaction date this way instead of all-numeric. Without
    // this, the string above falls through unrecognized to the final `return x` and gets stored
    // as-is; every date-math function downstream (addDaysToDMY, toISO here, the date picker) only
    // understands numeric DD/MM/YYYY, so Date as per Cradlee would silently never populate and
    // the date input would just show blank — not obviously wrong, just quietly not working.
    m=x.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s.,-]+(\d{2,4})$/);
    if(m){
      const mon=MONTH_ABBR[m[2].slice(0,4).toLowerCase().replace(/t$/,'')]||MONTH_ABBR[m[2].slice(0,3).toLowerCase()];
      if(mon){const year=m[3].length===2?'20'+m[3]:m[3];return m[1].padStart(2,'0')+'/'+String(mon).padStart(2,'0')+'/'+year;}
    }
    return x;
  };
  // A file's date column is either consistently DD/MM/YYYY or consistently MM/DD/YYYY — it's
  // never a per-row toss-up. So look across every row for a value where one position must be a
  // day (>12) and the other must be a month (≤12); once one unambiguous row settles which
  // format the file uses, apply that same reading to every ambiguous row (e.g. "06/01/2026")
  // instead of guessing per-row and silently swapping day/month.
  const inferDateSwap=(json,dateColNames)=>{
    let sawMonthFirstEvidence=false,sawDayFirstEvidence=false;
    for(const r of json){
      let raw;
      for(const col of dateColNames){if(r[col]!==undefined&&r[col]!==''){raw=r[col];break;}}
      if(raw===undefined||raw instanceof Date)continue;
      const s=String(raw).trim();
      const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-]\d{2,4}$/);
      if(!m)continue;
      const a=+m[1],b=+m[2];
      if(a>12&&b<=12)sawDayFirstEvidence=true;
      else if(b>12&&a<=12)sawMonthFirstEvidence=true;
    }
    return sawMonthFirstEvidence&&!sawDayFirstEvidence;
  };
  // Runs the value through fmtDate first — self-heals rows imported before month-name date
  // support existed (their transactionDate/cradleeDate strings are still stored as raw
  // "01-Jun-2026" text), instead of requiring a fresh re-import to see it working.
  const toISO=(d)=>{const norm=fmtDate(d);const m=String(norm||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):'';};
  // Column matching is driven by the SELECTED bank's own header format first (so the
  // import genuinely follows "Format as per selected bank"), then falls back to the
  // other known bank aliases for resilience if a file has slightly different labels.
  const mapRow=(r,i,bankKey,swap)=>{
    const H=(BANKS[bankKey]||BANKS.Generic).headers; // [Date,ValueDate,Desc,Ref,Debit,Credit,Balance]
    return{
      id:Date.now()+i,
      transactionDate:fmtDate(val(r,[H[0],'Transaction Date','Date','Tran Date','Txn Date','Post Date','Value Dt']),swap),
      valueDate:fmtDate(val(r,[H[1],'Value Date','Value Dt']),swap),
      description:String(val(r,[H[2],'Description','Narration','Transaction Remarks','Transaction Particulars','Particulars','Remarks','Details','Transaction Details'])||'').trim(),
      refNo:String(val(r,[H[3],'Cheque/Ref No','Chq./Ref.No.','Cheque Number','Chq No','Ref No./Cheque No.','Cheque / Reference Number','Reference No','Reference','Instrument ID','Cheque Details'])||'').trim(),
      debit:num(val(r,[H[4],'Debit','Withdrawal Amt.','Withdrawal Amount (INR)','Withdrawal'])),
      credit:num(val(r,[H[5],'Credit','Deposit Amt.','Deposit Amount (INR)','Deposit'])),
      closingBalance:num(val(r,[H[6],'Closing Balance','Balance','Balance (INR)','Running Balance'])),
      nature:'',cradleeDate:''
    };
  };

  // ── Fallback: if the file doesn't match any known bank format at all, read it on its own
  // terms — look at the file's own headers and, failing that, the shape of its data — so any
  // reasonably-structured bank statement can still be imported instead of being rejected. ──
  const looksLikeDateVal=(v)=>{
    if(v instanceof Date)return !isNaN(v);
    if(typeof v==='number')return v>20000&&v<80000; // plausible Excel date-serial range
    const s=String(v||'').trim();
    return /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(s)||/^\d{4}-\d{1,2}-\d{1,2}/.test(s);
  };
  const looksLikeNumberVal=(v)=>{
    if(v===''||v===undefined||v===null)return false;
    const n=Number(String(v).replace(/[₹,\s()]/g,''));
    return Number.isFinite(n)&&String(v).trim()!=='';
  };
  const findByKeyword=(headers,keys,exactKeys)=>{
    for(const k of (exactKeys||keys)){const hit=headers.find(h=>keyNorm(h)===keyNorm(k));if(hit)return hit;}
    for(const k of keys){const hit=headers.find(h=>keyNorm(h).includes(keyNorm(k)));if(hit)return hit;}
    return null;
  };
  const autoDetectColumns=(headers,sample)=>{
    const DATE_KEYS=['transactiondate','txndate','trandate','postdate','valuedate','date'];
    const DESC_KEYS=['narration','description','transactionremarks','transactionparticulars','particulars','remarks','details','transactiondetails'];
    const REF_KEYS=['chequerefno','chqrefno','chequenumber','referencenumber','instrumentid','refno','chqno','reference','cheque'];
    const DEBIT_KEYS=['withdrawalamtinr','withdrawalamt','withdrawalamount','withdrawal','debit'];
    const CREDIT_KEYS=['depositamtinr','depositamt','depositamount','deposit','credit'];
    const DEBIT_KEYS_EXACT=[...DEBIT_KEYS,'dr'];
    const CREDIT_KEYS_EXACT=[...CREDIT_KEYS,'cr'];
    const BALANCE_KEYS=['closingbalance','runningbalance','balanceinr','balance'];
    const AMOUNT_KEYS=['amount','txnamount','transactionamount'];
    const TYPE_KEYS=['drcr','crdr','type','transactiontype'];
    let dateCol=findByKeyword(headers,DATE_KEYS);
    if(!dateCol)dateCol=headers.find(h=>sample.filter(r=>looksLikeDateVal(r[h])).length>sample.length*0.5);
    let descCol=findByKeyword(headers,DESC_KEYS);
    if(!descCol){
      const candidates=headers.filter(h=>h!==dateCol);
      const avgLen=(col)=>sample.reduce((s,r)=>s+String(r[col]||'').length,0)/Math.max(1,sample.length);
      descCol=candidates.sort((a,b)=>avgLen(b)-avgLen(a))[0];
    }
    const refCol=findByKeyword(headers,REF_KEYS);
    let debitCol=findByKeyword(headers,DEBIT_KEYS,DEBIT_KEYS_EXACT);
    let creditCol=findByKeyword(headers,CREDIT_KEYS,CREDIT_KEYS_EXACT);
    let balanceCol=findByKeyword(headers,BALANCE_KEYS);
    if(!balanceCol){
      const numericCols=headers.filter(h=>![dateCol,descCol,refCol].includes(h)&&sample.filter(r=>looksLikeNumberVal(r[h])).length>sample.length*0.5);
      balanceCol=numericCols[numericCols.length-1]; // rightmost numeric column is usually the running/closing balance
    }
    if(debitCol||creditCol)return{dateCol,descCol,refCol,balanceCol,debitCol,creditCol,mode:'debitcredit'};
    const amtCol=findByKeyword(headers,AMOUNT_KEYS);
    const typeCol=findByKeyword(headers,TYPE_KEYS);
    if(amtCol)return{dateCol,descCol,refCol,balanceCol,amtCol,typeCol,mode:'amount'};
    const numericCols=headers.filter(h=>![dateCol,descCol,refCol,balanceCol].includes(h)&&sample.filter(r=>looksLikeNumberVal(r[h])).length>0);
    return{dateCol,descCol,refCol,balanceCol,debitCol:numericCols[0],creditCol:numericCols[1],mode:'debitcredit'};
  };
  // Real bank/Cradlee exports very often have a few preamble rows first — account holder
  // name, account number, statement period, a title like "Statement of Account" — before
  // the actual column-header row. Reading row 1 as the header in that case silently breaks
  // every column match. Scan the first ~20 rows and pick whichever one actually looks like
  // a header (several cells, multiple recognisable column-name keywords).
  const HEADER_ROW_KEYWORDS=['date','narration','description','particular','remark','detail','debit','credit','withdrawal','deposit','balance','amount','cheque','chq','reference','ref no','txn','transaction','instrument'];
  const findHeaderRowIndex=(rawRows)=>{
    let bestIdx=0,bestScore=-1;
    const scanLimit=Math.min(rawRows.length,20);
    for(let i=0;i<scanLimit;i++){
      const row=rawRows[i]||[];
      const nonEmpty=row.filter(c=>String(c||'').trim()!=='');
      if(nonEmpty.length<3)continue; // a real header row has several columns
      let score=0;
      nonEmpty.forEach(c=>{
        const s=String(c).toLowerCase();
        if(HEADER_ROW_KEYWORDS.some(k=>s.includes(k)))score++;
      });
      if(score>bestScore){bestScore=score;bestIdx=i;}
    }
    return bestScore>=2?bestIdx:0; // need at least 2 keyword hits to trust it; otherwise assume row 1
  };
  // Similarly, pick whichever sheet actually looks like the transaction table if the workbook
  // has multiple tabs (e.g. a "Summary" cover sheet before the real statement).
  const pickBestSheet=(wb)=>{
    let best=null;
    for(const name of wb.SheetNames){
      const ws=wb.Sheets[name];
      const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});
      const rowCount=raw.filter(r=>r.some(c=>String(c||'').trim()!=='')).length;
      if(!best||rowCount>best.rowCount)best={name,ws,raw,rowCount};
    }
    return best;
  };
  const mapRowAuto=(r,i,det,swap)=>{
    let debit=0,credit=0;
    if(det.mode==='amount'&&det.amtCol){
      const amt=num(r[det.amtCol]);
      const t=det.typeCol?String(r[det.typeCol]||'').toLowerCase():'';
      if(t.includes('cr')||t.includes('deposit'))credit=Math.abs(amt);
      else if(t.includes('dr')||t.includes('withdraw'))debit=Math.abs(amt);
      else if(amt<0)debit=Math.abs(amt);else credit=amt;
    }else{
      debit=det.debitCol?num(r[det.debitCol]):0;
      credit=det.creditCol?num(r[det.creditCol]):0;
    }
    return{
      id:Date.now()+i,
      transactionDate:fmtDate(det.dateCol?r[det.dateCol]:'',swap),
      valueDate:'',
      description:String(det.descCol?r[det.descCol]:'' ||'').trim(),
      refNo:String(det.refCol?r[det.refCol]:'' ||'').trim(),
      debit,credit,
      closingBalance:det.balanceCol?num(r[det.balanceCol]):0,
      nature:'',cradleeDate:''
    };
  };
  // ── Auto-classify Nature + Date as per Cradlee from the Description, for Credit entries ──
  // Checked most-specific-first so e.g. "UPI Settlement" doesn't fall through to the generic "UPI" rule.
  const addDaysToDMY=(dmy,delta)=>{
    const norm=fmtDate(dmy);
    const m=String(norm||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(!m)return dmy||'';
    const d=new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));
    d.setDate(d.getDate()+delta);
    return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
  };
  const classifyNatureAndDate=(description,credit,valueDate,transactionDate)=>{
    if(!(credit>0))return null;
    const desc=String(description||'').toLowerCase();
    const baseDate=valueDate||transactionDate;
    if(!baseDate)return null;
    if(desc.includes('upi settlement'))return{nature:'UPI Settlement',cradleeDate:addDaysToDMY(baseDate,-1)};
    if(desc.includes('cards settl'))return{nature:'Card Settlement',cradleeDate:addDaysToDMY(baseDate,-1)};
    if(desc.includes('pos pymt'))return{nature:'Card Settlement',cradleeDate:addDaysToDMY(baseDate,-1)};
    if(desc.includes('paytm payments'))return{nature:'Card Settlement',cradleeDate:addDaysToDMY(baseDate,-1)};
    // NOTE: a blanket "if(desc.includes('neft')) → Card Settlement" rule used to live here.
    // Removed — NEFT is a generic bank-transfer rail used for all sorts of credits (refunds,
    // loans, owner capital, vendor refunds), not just card settlements, unlike every other rule
    // in this list which matches a specific payment-processor/settlement term. Tagging every
    // NEFT credit as Card Settlement risked false positives on unrelated transactions. If your
    // card aggregator's real payout narration is a NEFT credit carrying its own recognizable
    // name (e.g. a specific processor like Razorpay/PayU/CCAvenue), add a rule matching that
    // exact narration instead of the bare word "neft" — narrower and won't catch unrelated NEFT
    // credits. Until then, NEFT credits fall through to manual classification.
    if(desc.includes('icicipos'))return{nature:'Card Settlement',cradleeDate:addDaysToDMY(baseDate,-1)};
    if(desc.includes('salonsurf')||desc.includes('salon surf'))return{nature:'Card Settlement',cradleeDate:addDaysToDMY(baseDate,-1)};
    if(desc.includes('upi'))return{nature:'UPI Settlement',cradleeDate:baseDate};
    return null;
  };
  // Debit-side classification. "Salary"/"Sal" and "Incentive"/"Inc" are matched as whole words
  // (\b boundaries) so they don't fire on a name or company that merely contains those letters
  // — e.g. "SALONSURF" or an employee named "Salim" won't match "Sal", but a narration token
  // like "...-SALARY" or "...-SAL-..." will. "Bescom", "EDC Rental", "Settlement Charge",
  // "GSTMSME", "CBDTMSME", "ESIC" and "Laundry" are matched as plain substrings instead, since
  // real narrations often run them together with no separator (e.g. "BILLDKBESCOM", or
  // "GSTMSME"/"CBDTMSME" as one continuous token that a \b-bounded "gst"/"cbdt" check wouldn't
  // catch on its own).
  const classifyDebitNature=(description,debit,vendors)=>{
    if(!(debit>0))return null;
    const desc=String(description||'');
    const descLower=desc.toLowerCase();
    if(/\b(advance|adv)\b/i.test(desc))return'Advance Salary';
    if(/\b(salary|sal)\b/i.test(desc))return'Salary';
    if(/\b(incentive|inc)\b/i.test(desc))return'Incentive';
    if(descLower.includes('cbdtmsme'))return'TDS';
    if(/\b(cbdt|tds)\b/i.test(desc))return'TDS';
    if(descLower.includes('gstmsme'))return'GST';
    if(/\bgst\b/i.test(desc))return'GST';
    if(descLower.includes('esic'))return'ESIC Payment';
    if(descLower.includes('bescom'))return'Electricity Expenses';
    if(descLower.includes('electricity'))return'Electricity Expenses';
    if(descLower.includes('dtax'))return'TDS';
    if(descLower.includes('airtel'))return'Telephone & Internet Expenses';
    if(descLower.includes('dg rent'))return'DG Rent';
    if(descLower.includes('royalty'))return'Royalty';
    if(descLower.includes('edc rental'))return'Bank Charges';
    if(descLower.includes('settlement charge'))return'Bank Charges';
    if(descLower.includes('laundry'))return'Drycleaning Expenses';
    // Rest: try to auto-link with the Vendor Sheet by name.
    if(findVendorMatch(desc,vendors))return'Vendor Payment';
    return null;
  };
  const applyAutoClassification=(list,force)=>list.map(r=>{
    let cls=classifyNatureAndDate(r.description,r.credit,r.valueDate,r.transactionDate);
    if(!cls){
      const debitNature=classifyDebitNature(r.description,r.debit,vendors);
      if(debitNature)cls={nature:debitNature,cradleeDate:''};
    }
    if(!cls)return r;
    // Default (force=false, used on fresh import): only fill in blanks.
    // Force mode (used by the Re-classify button): overwrite with whatever the rules produce —
    // but only for fields the matched rule actually set a value for, so e.g. a debit-only rule
    // (which never sets a Cradlee date) doesn't wipe out a date that was already there.
    return{...r,
      nature:force?(cls.nature||r.nature):(r.nature||cls.nature),
      cradleeDate:force?(cls.cradleeDate||r.cradleeDate):(r.cradleeDate||cls.cradleeDate)
    };
  });
  // Re-apply the classification rules to whatever's already in the table — covers data that was
  // imported before these rules existed, or where a rule has since changed, or rows that were
  // classified wrong and need a redo. This OVERWRITES existing Nature and Date as per Cradlee
  // values wherever a rule matches (not just blanks) — that's the whole point of "re-classify".
  const reclassifyExisting=()=>{
    if(!rows.length)return;
    if(!confirm('This re-applies the classification rules to every row and overwrites its Nature and Date as per Cradlee — including rows you\'ve already set by hand. Continue?'))return;
    const next=applyAutoClassification(rows,true);
    const changed=next.filter((r,i)=>r.nature!==rows[i].nature||r.cradleeDate!==rows[i].cradleeDate).length;
    setRows(next);
    setMessage(changed?'Re-classified '+changed+' row'+(changed===1?'':'s')+' — Nature and Date as per Cradlee re-applied from the classification rules.':'No rows matched the classification rules (or the rules already agree with what\'s there).');
  };
  const loadWorkbook=async(file)=>{
    setMessage('');setFileName(file.name);
    try{
      let sheet;
      if(isCSVFile(file)){
        // Parse CSV ourselves — keeps every date cell as exact original text (see parseCSVToRows).
        const text=await file.text();
        const raw=parseCSVToRows(text);
        sheet={raw,rowCount:raw.filter(r=>r.some(c=>String(c||'').trim()!=='')).length};
      }else{
        if(!window.XLSX)throw new Error('Excel reader could not load. Please check your internet connection and reopen the file.');
        const buf=await file.arrayBuffer();const wb=XLSX.read(buf,{type:'array',cellDates:true});
        sheet=pickBestSheet(wb);
      }
      if(!sheet||!sheet.rowCount)throw new Error('The selected file has no data.');
      const headerRowIdx=findHeaderRowIndex(sheet.raw);
      const headerRow=(sheet.raw[headerRowIdx]||[]).map(h=>String(h||'').trim());
      let json=sheet.raw.slice(headerRowIdx+1)
        .map(r=>{const obj={};headerRow.forEach((h,ci)=>{if(h)obj[h]=r[ci]!==undefined?r[ci]:'';});return obj;})
        .filter(o=>Object.values(o).some(v=>String(v).trim()!==''));
      if(!json.length)throw new Error('The selected file has no transaction rows.');
      // Check how well the file's own columns match the SELECTED bank's format before importing.
      const fileCols=Object.keys(json[0]||{});
      const expectedCols=(BANKS[bank]||BANKS.Generic).headers;
      const matchCount=expectedCols.filter(h=>fileCols.some(c=>keyNorm(c)===keyNorm(h))).length;
      const matchRatio=expectedCols.length?matchCount/expectedCols.length:1;
      // Figure out once, from the whole file, whether its date strings are DD/MM/YYYY or
      // MM/DD/YYYY — applied consistently to every row instead of guessing per-row (which
      // silently swaps day/month for ambiguous values like "06/01/2026").
      const dateColHint=(BANKS[bank]||BANKS.Generic).headers[0];
      const valueDateColHint=(BANKS[bank]||BANKS.Generic).headers[1];
      const dateSwap=inferDateSwap(json,[dateColHint,valueDateColHint,'Transaction Date','Date','Tran Date','Txn Date','Post Date','Value Date','Value Dt']);
      let imported=json.map((r,i)=>mapRow(r,i,bank,dateSwap)).filter(r=>r.transactionDate||r.debit||r.credit||r.closingBalance);
      // A "successful" strict match still needs actual amount data, not just a lucky date-header
      // hit — a row with a date but no debit/credit/balance at all isn't usable transaction data.
      const hasAmounts=imported.some(r=>r.debit||r.credit||r.closingBalance);
      let usedAutoDetect=false;
      if(!imported.length||!hasAmounts){
        // Didn't match the selected bank (or any known alias) with real amount data — read the
        // file on its own terms instead of rejecting it or importing blank rows.
        const det=autoDetectColumns(fileCols,json.slice(0,25));
        const autoImported=json.map((r,i)=>mapRowAuto(r,i,det,dateSwap)).filter(r=>r.transactionDate||r.debit||r.credit||r.closingBalance);
        if(autoImported.some(r=>r.debit||r.credit||r.closingBalance)||!imported.length){
          imported=autoImported;
          usedAutoDetect=true;
        }
      }
      if(!imported.length)throw new Error('Couldn\u2019t find any recognisable transaction data in this file \u2014 please check it has date, description and amount columns.');
      let note='';
      if(usedAutoDetect){
        note=' Columns were detected automatically from this file\u2019s own headers/data (didn\u2019t match the '+bank+' format).';
      }else if(bank!=='Generic'&&matchRatio<0.5){
        note=' Note: this file\u2019s columns don\u2019t look like the '+bank+' format you\u2019ve selected \u2014 double-check the Bank dropdown above if any fields look off.';
      }
      imported=applyAutoClassification(imported);
      const autoClassified=imported.filter(r=>r.nature).length;
      const formatNote=(usedAutoDetect?' using automatic column detection.':' using the '+bank+' format.')+note;
      // Append mode: add only to what's already there, skipping rows that look like the same
      // transaction already imported (same date, description, debit, credit and closing balance
      // — a bank statement export re-covering an overlapping date range is the normal case this
      // guards against, e.g. downloading "this month so far" every few days). Replace mode keeps
      // the original one-shot behavior of wiping the table and starting over.
      if(importMode==='append'&&rows.length){
        const dedupeKey=(r)=>[r.transactionDate,r.description,r.debit,r.credit,r.closingBalance].join('|');
        const existingKeys=new Set(rows.map(dedupeKey));
        const freshOnes=imported.filter(r=>!existingKeys.has(dedupeKey(r)));
        const dupCount=imported.length-freshOnes.length;
        let nextId=rows.reduce((m,r)=>Math.max(m,Number(r.id)||0),0)+1;
        const withFreshIds=freshOnes.map(r=>({...r,id:nextId++}));
        setRows(prev=>[...prev,...withFreshIds]);
        setMessage((withFreshIds.length?'Appended '+withFreshIds.length+' new transaction'+(withFreshIds.length===1?'':'s'):'No new transactions found')+' from '+file.name+formatNote
          +(dupCount?' · '+dupCount+' row'+(dupCount===1?'':'s')+' already in the statement '+(dupCount===1?'was':'were')+' skipped as duplicate'+(dupCount===1?'':'s')+'.':'.')
          +(withFreshIds.filter(r=>r.nature).length?' · '+withFreshIds.filter(r=>r.nature).length+' auto-classified (Nature + Date as per Cradlee).':''));
      }else{
        setRows(imported);
        setMessage('Imported '+imported.length+' transaction'+(imported.length===1?'':'s')+' from '+file.name+formatNote+(autoClassified?' · '+autoClassified+' auto-classified (Nature + Date as per Cradlee).':'')+' Double-check a few rows below, then edit Nature and Date as per Cradlee as needed.');
      }
    }catch(err){setMessage('Import failed: '+err.message);}
  };
  const onFile=(e)=>{const f=e.target.files&&e.target.files[0];if(f)loadWorkbook(f);e.target.value='';};
  const onDrop=(e)=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files&&e.dataTransfer.files[0];if(f)loadWorkbook(f);};
  const update=(id,k,v)=>setRows(p=>p.map(r=>r.id===id?{...r,[k]:v}:r));
  const downloadTemplate=()=>{const t=BANKS[bank]||BANKS.Generic;const csv=[t.headers,t.sample].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=bank.replace(/\s+/g,'_')+'_Bank_Statement_Template.csv';a.click();URL.revokeObjectURL(u);};
  const clearData=()=>{if(confirm('Remove all imported bank statement data?')){setRows([]);setFileName('');setSelected(new Set());setMessage('Bank statement data cleared.');}};
  const toggleSelect=(id)=>setSelected(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const deleteSelected=()=>{
    if(!selected.size)return;
    if(confirm('Delete '+selected.size+' selected transaction'+(selected.size===1?'':'s')+'?')){
      setRows(prev=>prev.filter(r=>!selected.has(r.id)));
      setSelected(new Set());
    }
  };
  const exportData=()=>{if(!rows.length)return;const heads=[...(BANKS[bank]||BANKS.Generic).headers,'Nature','Date as per Cradlee','Vendor Name'];const body=rows.map(r=>[r.transactionDate,r.valueDate,r.description,r.refNo,r.debit,r.credit,r.closingBalance,r.nature,r.cradleeDate,vendorNameFor(r)].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(','));const csv=[heads.map(v=>'"'+v+'"').join(','),...body].join('\n');const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=bank.replace(/\s+/g,'_')+'_Statement_With_Cradlee_Mapping.csv';a.click();URL.revokeObjectURL(u);};
  const money=(n)=>formatMoney(n,{decimals:2});
  // Excel-style AutoFilter: columnFilters[key] = Set of values still shown for that column.
  // Undefined means "no filter applied yet" (everything shown), matching Excel's default state.
  // The popover renders through a portal into document.body, positioned with `fixed` coordinates
  // captured from the header's own bounding box — so it's never clipped by the table's scroll
  // container, and always lands directly under the header regardless of horizontal scroll.
  const [columnFilters,setColumnFilters]=useState({});
  // Quick filters — one-click toggles built for what someone reconciling a bank statement
  // actually needs to find fast ("what's still unclassified", "what's not linked to an invoice
  // yet"), rather than making them build that up column-by-column through the AutoFilter popovers.
  const [quickFilters,setQuickFilters]=useState(()=>new Set());
  const toggleQuickFilter=(key,exclusiveWith)=>setQuickFilters(prev=>{
    const next=new Set(prev);
    if(next.has(key))next.delete(key);
    else{next.add(key);(exclusiveWith||[]).forEach(k=>next.delete(k));}
    return next;
  });
  const QUICK_FILTERS=[
    {key:'unclassified',label:'⚠️ Unclassified'},
    {key:'noCradlee',label:'📅 Missing Cradlee Date'},
    {key:'noVendor',label:'❓ No Vendor Match'},
    {key:'unlinked',label:'🔗 Unlinked Debits'},
    {key:'large',label:'🔺 Large (>₹10,000)'},
    {key:'debits',label:'💸 Debits Only',exclusiveWith:['credits']},
    {key:'credits',label:'💰 Credits Only',exclusiveWith:['debits']},
    {key:'thisMonth',label:'📆 This Month',exclusiveWith:['lastMonth']},
    {key:'lastMonth',label:'📆 Last Month',exclusiveWith:['thisMonth']}
  ];
  const [openFilterCol,setOpenFilterCol]=useState(null);
  const [filterPos,setFilterPos]=useState({top:0,left:0});
  const [filterSearch,setFilterSearch]=useState('');
  useEffect(()=>{
    if(!openFilterCol)return;
    // mousedown (not click) so the popover closes the instant you click elsewhere, matching
    // native dropdown feel — but ignore clicks on any toggle button or inside any open popover,
    // so re-clicking the same header to close it doesn't fight with this listener and reopen.
    const onDocMouseDown=(e)=>{
      if(e.target.closest&&(e.target.closest('.autofilter-toggle')||e.target.closest('.autofilter-popover')))return;
      setOpenFilterCol(null);
    };
    document.addEventListener('mousedown',onDocMouseDown);
    return ()=>document.removeEventListener('mousedown',onDocMouseDown);
  },[openFilterCol]);
  const openFilterAt=(colKey,e)=>{
    if(openFilterCol===colKey){setOpenFilterCol(null);return;}
    const rect=e.currentTarget.getBoundingClientRect();
    const popW=280;
    const popH=420;
    let left=rect.left;
    if(left+popW>window.innerWidth-12)left=Math.max(12,window.innerWidth-12-popW);
    let top=rect.bottom+6;
    if(top+popH>window.innerHeight-12){
      top=Math.max(12,rect.top-popH-6);
    }
    setFilterPos({top,left});
    setFilterSearch('');
    setOpenFilterCol(colKey);
  };
  const bankHeaders=(BANKS[bank]||BANKS.Generic).headers;
  // Vendor Name: auto-matched from Description against the Vendor List by default, but a person
  // can override it per row — pick a different vendor, or explicitly mark "no vendor" — via the
  // dropdown in that column. r.vendorOverride is undefined/missing = use the auto-match; '' = an
  // explicit "no vendor" (not the same as no override); any other string = an explicit vendor name.
  // Vendor Name: auto-matched from Description against the Vendor List by default, but a person
  // can override it per row — pick a different vendor, or explicitly mark "no vendor" — via the
  // dropdown in that column. r.vendorOverride is undefined/missing = use the auto-match; '' = an
  // explicit "no vendor" (not the same as no override); any other string = an explicit vendor name.
  //
  // Special cases, since these credit/debit lines aren't vendor payments at all:
  // - UPI/Card settlement credits and the SalonSurf payout aggregator → "NA" (nothing to match a
  //   vendor against; it's the day's card/UPI collection landing in the account, not a purchase).
  // - Salary lines → resolves to the matched Employee's name instead of a vendor.
  // - Rent lines → resolves to a landlord match from the Vendor List if there's an entry for one,
  //   otherwise just labelled "Landlord" (there's no separate landlord list in the app yet).
  const autoVendorNameFor=(r)=>{
    const desc=String(r.description||'');
    const nature=r.nature||'';
    // Card/UPI Settlement credits are the payment aggregator's own payout, not a real vendor
    // from Vendor Sheet — but "Auto: NA" was uninformative. Showing the Nature itself here means
    // the Vendor Name column, its AutoFilter, exports, and the "no vendor" quick filter all treat
    // every settlement row as having a resolved identity — never blank, never a false "no match" —
    // regardless of the exact wording in Description (UPI SETTLEMENT vs plain UPI, CARDS SETTL vs
    // SALONSURF, etc.), since any row already classified with this Nature is a settlement by
    // definition.
    if(nature==='UPI Settlement')return'UPI Settlement';
    if(nature==='Card Settlement')return'Card Settlement';
    if((nature==='Salary'||nature==='Incentive'||nature==='Daily Incentive'||nature==='Advance Salary')&&new RegExp('\\b('+(nature==='Salary'?'salary|sal':nature==='Advance Salary'?'advance|adv':'incentive|inc')+')\\b','i').test(desc)){
      const emp=findEmployeeMatch(desc,employees);
      return emp?emp.name:'Employee (unmatched)';
    }
    if(nature==='Rent'&&/\brent\b/i.test(desc)){
      const landlord=findVendorMatch(desc,vendors);
      return landlord?landlord.name:'Landlord';
    }
    const m=findVendorMatch(desc,vendors);
    return m?m.name:'';
  };
  const vendorNameFor=(r)=>r.vendorOverride!=null?r.vendorOverride:autoVendorNameFor(r);
  // Resolves a row to an actual Vendor Sheet record (not just a display name) — used by the
  // "O/S Invoices" column and the Link modal so a manually-picked vendor (vendorOverride) and an
  // auto-matched one (findVendorMatch on the description) both work the same way. Returns null
  // for "— No vendor —" and for rows where nothing matches, so callers can show a "Pick Vendor"
  // prompt instead of guessing. A row overridden to an Employee ("EMP:" prefix) is never a
  // vendor, so that also resolves to null here — see resolvedEmployeeFor below for that case.
  const resolvedVendorFor=(r)=>{
    if(r.vendorOverride==='__none__')return null;
    if(typeof r.vendorOverride==='string'&&r.vendorOverride.startsWith('EMP:'))return null;
    if(r.vendorOverride!=null&&r.vendorOverride!=='')return vendors.find(v=>v.name===r.vendorOverride)||null;
    return findVendorMatch(r.description,vendors);
  };
  // Same idea as resolvedVendorFor, but for the employee an auto- or manually-matched Salary/
  // Incentive/Advance Salary row belongs to — used by the O/S Invoices column to show that
  // employee's Salary/Incentive Outstanding, or to record a new Advance. Only resolves for rows
  // actually classified with one of those three Natures; any other Nature returns null even if
  // the description happens to contain an employee's name.
  const resolvedEmployeeFor=(r)=>{
    if(r.nature!=='Salary'&&r.nature!=='Incentive'&&r.nature!=='Daily Incentive'&&r.nature!=='Advance Salary')return null;
    if(typeof r.vendorOverride==='string'&&r.vendorOverride.startsWith('EMP:')){
      return employees.find(e=>e.id===r.vendorOverride.slice(4))||null;
    }
    if(r.vendorOverride==='__none__')return null;
    if(r.vendorOverride!=null&&r.vendorOverride!=='')return null; // overridden to a specific vendor, not an employee
    return findEmployeeMatch(r.description,employees);
  };
  // Picking an actual vendor from the "Vendor Name" column is now the primary action for a debit
  // row, so it also sets Nature to "Vendor Payment" automatically — matching what would have
  // happened anyway via classifyDebitNature's own vendor-match fallback, just without waiting for
  // Re-classify. Picking an Employee ("EMP:" prefix) never forces Nature, since the small select
  // is what actually decides Salary vs Incentive for an employee row. Picking "Auto: …" or
  // "— No vendor —" leaves Nature exactly as it was too.
  const updateVendorPick=(id,value)=>setRows(prev=>prev.map(r=>{
    if(r.id!==id)return r;
    const vendorOverride=value===''?undefined:(value==='__none__'?'':value);
    const pickedRealVendor=value!==''&&value!=='__none__'&&!value.startsWith('EMP:');
    return{...r,vendorOverride,nature:pickedRealVendor?'Vendor Payment':r.nature};
  }));
  const FILTER_COLS=[
    {key:'transactionDate',label:bankHeaders[0],type:'date',get:r=>r.transactionDate||'(blank)',raw:r=>toISO(r.transactionDate)},
    {key:'valueDate',label:bankHeaders[1],type:'date',get:r=>r.valueDate||'(blank)',raw:r=>toISO(r.valueDate)},
    {key:'description',label:bankHeaders[2],type:'text',get:r=>r.description||'(blank)'},
    {key:'refNo',label:bankHeaders[3],type:'text',get:r=>r.refNo||'(blank)'},
    {key:'debit',label:bankHeaders[4],type:'number',get:r=>r.debit?money(r.debit):'—',raw:r=>Number(r.debit)||0},
    {key:'credit',label:bankHeaders[5],type:'number',get:r=>r.credit?money(r.credit):'—',raw:r=>Number(r.credit)||0},
    {key:'closingBalance',label:bankHeaders[6],type:'number',get:r=>money(r.closingBalance),raw:r=>Number(r.closingBalance)||0},
    // Primary Vendor/Employee picker — Nature now has its own separate column again (see the
    // 'nature' entry below), rather than living inside this cell as a secondary select.
    {key:'vendorName',label:'Vendor Name',type:'text',get:r=>vendorNameFor(r)||'(no match)'},
    {key:'nature',label:'Nature',type:'enum',get:r=>r.nature||'(blank)'},
    {key:'cradleeDate',label:'Date as per Cradlee',type:'date',get:r=>r.cradleeDate||'(blank)',raw:r=>toISO(r.cradleeDate)},
    // O/S Invoices reflects this row's outstanding-invoice / link status against Vendor Sheet.
    {key:'osInvoices',label:'O/S Invoices',type:'enum',get:r=>{
      if(r.linkedInvoice)return'Linked';
      const v=resolvedVendorFor(r);
      if(!v)return'No Vendor';
      const openCount=vendorInvoices.filter(inv=>inv.vendorId===v.id&&invBalance(inv)>0).length;
      return openCount>0?'Open Invoices':'No Open Invoices';
    }}
  ];
  // Returns [{value,count}] sorted by value, for the popover's checklist (with counts shown).
  const uniqueValuesFor=(col)=>{
    const counts=new Map();
    rows.forEach(r=>{const v=String(col.get(r));counts.set(v,(counts.get(v)||0)+1);});
    return Array.from(counts.entries()).map(([value,count])=>({value,count})).sort((a,b)=>a.value.localeCompare(b.value));
  };
  const toggleFilterValue=(colKey,val,allVals)=>{
    setColumnFilters(prev=>{
      const cur=(prev[colKey] instanceof Set)?new Set(prev[colKey]):new Set(allVals);
      if(cur.has(val))cur.delete(val);else cur.add(val);
      const next={...prev};
      if(cur.size===allVals.length)delete next[colKey];
      else next[colKey]=cur;
      return next;
    });
  };
  const clearColumnFilter=(colKey)=>setColumnFilters(prev=>{const next={...prev};delete next[colKey];return next;});
  // Short, readable label for an active filter — used by the "active filters" chip bar so it's
  // obvious at a glance what's currently narrowing the table, without opening every popover.
  const filterSummaryFor=(col,active)=>{
    if(active instanceof Set)return col.label+': '+active.size+' selected';
    if(active&&active.mode==='contains')return col.label+' contains "'+active.text+'"';
    if(active&&active.mode==='range'){
      const parts=[];
      if(active.min!=='' && active.min!=null)parts.push('≥₹'+active.min);
      if(active.max!=='' && active.max!=null)parts.push('≤₹'+active.max);
      return col.label+' '+(parts.join(' & ')||'(no bounds set)');
    }
    if(active&&active.mode==='daterange'){
      const parts=[];
      if(active.from)parts.push('from '+active.from);
      if(active.to)parts.push('to '+active.to);
      return col.label+' '+(parts.join(' ')||'(no bounds set)');
    }
    return col.label;
  };
  const matchesQuickFilter=(r,key)=>{
    const now=new Date();
    const ymOf=(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    switch(key){
      case'debits':return r.debit>0;
      case'credits':return r.credit>0;
      case'unclassified':return!r.nature;
      case'noCradlee':return!!r.nature&&!r.cradleeDate;
      case'noVendor':{const vn=vendorNameFor(r);return!vn||vn==='Employee (unmatched)';}
      case'unlinked':return r.debit>0&&!r.linkedInvoice;
      case'large':return(Number(r.debit)||0)>10000||(Number(r.credit)||0)>10000;
      case'thisMonth':{const d=toISO(r.transactionDate);return!!d&&d.startsWith(ymOf(now));}
      case'lastMonth':{const lm=new Date(now.getFullYear(),now.getMonth()-1,1);const d=toISO(r.transactionDate);return!!d&&d.startsWith(ymOf(lm));}
      default:return true;
    }
  };
  const filtered=rows.filter(r=>{
    if(search&&![r.transactionDate,r.description,r.refNo,r.nature,r.cradleeDate].join(' ').toLowerCase().includes(search.toLowerCase()))return false;
    for(const qf of quickFilters){if(!matchesQuickFilter(r,qf))return false;}
    for(const col of FILTER_COLS){
      const active=columnFilters[col.key];
      if(active===undefined)continue;
      if(active instanceof Set){if(!active.has(String(col.get(r))))return false;}
      else if(active&&active.mode==='contains'){if(!String(col.get(r)).toLowerCase().includes(String(active.text||'').toLowerCase()))return false;}
      else if(active&&active.mode==='range'){
        const n=col.raw(r);
        if(active.min!==''&&active.min!=null&&n<Number(active.min))return false;
        if(active.max!==''&&active.max!=null&&n>Number(active.max))return false;
      }
      else if(active&&active.mode==='daterange'){
        const d=col.raw(r);
        if(!d)return false;
        if(active.from&&d<active.from)return false;
        if(active.to&&d>active.to)return false;
      }
    }
    return true;
  });
  const totals=filtered.reduce((a,r)=>({debit:a.debit+r.debit,credit:a.credit+r.credit}),{debit:0,credit:0});
  const natures=['','Collection','Cash Deposit','Card Settlement','UPI Settlement','Bank Charges','Interest','Vendor Payment','Salary','Incentive','Daily Incentive','Advance Salary','TDS','GST','ESIC Payment','Electricity Expenses','Drycleaning Expenses','Telephone & Internet Expenses','DG Rent','Royalty','Rent','Tax Payment','Transfer','Refund','Other'];
  // Loaded once for the "link the rest with Vendor Sheet automatically" classification rule.
  const [vendors]=useState(()=>loadVendors(salonId));
  const [employees]=useState(()=>loadEmployees(salonId));

  // ── Reconciliation summary — how much of the ledger is actually mapped to Revenue (Card/UPI
  // Settlement + Cash Deposit + Collection, the Natures that feed P&L revenue via Collection Reco)
  // and to Vendors (debits tagged Vendor Payment, and of those, how many are actually linked to a
  // Vendor Sheet invoice vs. just labelled). Computed off the full, unfiltered rows list so it
  // always reflects the whole imported statement, not whatever the on-screen filters narrow it to. ──
  const REVENUE_NATURES=new Set(['Card Settlement','UPI Settlement','Cash Deposit','Collection']);
  const reconciliationStats=useMemo(()=>{
    let creditTotal=0,creditMapped=0,creditUnclassified=0;
    let debitTotal=0,vendorPaymentTotal=0,vendorPaymentLinked=0,debitUnclassified=0;
    rows.forEach(r=>{
      const debit=Number(r.debit)||0,credit=Number(r.credit)||0;
      if(credit>0){
        creditTotal+=credit;
        if(r.nature&&REVENUE_NATURES.has(r.nature))creditMapped+=credit;
        if(!r.nature)creditUnclassified+=credit;
      }
      if(debit>0){
        debitTotal+=debit;
        if(r.nature==='Vendor Payment'){
          vendorPaymentTotal+=debit;
          if(r.linkedInvoice)vendorPaymentLinked+=debit;
        }
        if(!r.nature)debitUnclassified+=debit;
      }
    });
    return{creditTotal,creditMapped,creditUnclassified,debitTotal,vendorPaymentTotal,vendorPaymentLinked,debitUnclassified};
  },[rows]);

  // ── Link a debit transaction to a Vendor Sheet invoice: records a payment against that
  // invoice and tags this row so it shows as linked. Vendor Sheet's "Record Payment" screen
  // does the same thing from its side, reading Bank Statement's debit rows. ──
  const [linkRow,setLinkRow]=useState(null); // the bank row currently being linked, or null
  const [linkVendorId,setLinkVendorId]=useState('');
  // A single bank debit often settles more than one open invoice at once (or only part of one),
  // so linking supports selecting several invoices and splitting the debit amount across them —
  // rather than forcing a 1:1 match. linkSelected tracks which invoices are checked; linkAllocations
  // holds the (editable) amount applied to each selected invoice, keyed by inv.id.
  const [linkSelected,setLinkSelected]=useState(()=>new Set());
  const [linkAllocations,setLinkAllocations]=useState({});
  const [vendorInvoices,setVendorInvoices]=useState(()=>loadVendorInvoices(salonId));
  const refreshVendorInvoices=()=>setVendorInvoices(loadVendorInvoices(salonId));
  const openLinkModal=(row)=>{
    const freshInvoices=loadVendorInvoices(salonId);
    setVendorInvoices(freshInvoices);
    const match=resolvedVendorFor(row);
    setLinkVendorId(match?match.id:'');
    setLinkSelected(new Set());
    setLinkAllocations({});
    setLinkRow(row);
  };
  // Keyed by the invoice's own unique id (inv.id, e.g. "VI-0004") — NOT invoiceKeyFor(inv)
  // (vendorId+invoiceNo). Two open invoices for the same vendor with no Invoice No entered yet
  // (or an accidentally duplicated one) would otherwise collide onto the same composite key,
  // so checking one would silently check both. inv.id is always unique.
  const toggleInvoiceSelect=(inv)=>{
    const key=inv.id;
    if(linkSelected.has(key)){
      const nextSel=new Set(linkSelected);nextSel.delete(key);
      setLinkSelected(nextSel);
      const nextAlloc={...linkAllocations};delete nextAlloc[key];
      setLinkAllocations(nextAlloc);
    }else{
      const bal=invBalance(inv);
      const alreadyAllocated=Object.values(linkAllocations).reduce((s,v)=>s+(Number(v)||0),0);
      const remaining=Math.max(0,(linkRow?Number(linkRow.debit)||0:0)-alreadyAllocated);
      const defaultAmt=remaining>0?Math.min(bal,remaining):bal;
      const nextSel=new Set(linkSelected);nextSel.add(key);
      setLinkSelected(nextSel);
      setLinkAllocations({...linkAllocations,[key]:String(defaultAmt)});
    }
  };
  // ── Add Invoice directly from a Bank Statement debit row — for when money has already gone
  // out but no invoice was ever entered in Vendor Sheet for it (a common gap: the bill arrives
  // late, or was never formally logged). Creates the invoice already fully paid, linked straight
  // back to this bank row, since the debit itself IS the payment evidence. ──
  const [addInvoiceRow,setAddInvoiceRow]=useState(null); // {row, vendor} or null
  const [addInvoiceForm,setAddInvoiceForm]=useState({invoiceNo:'',invoiceDate:'',amount:'',docNature:'Tax Invoice'});
  const openAddInvoiceModal=(row,vendor)=>{
    setAddInvoiceForm({invoiceNo:'',invoiceDate:toISO(row.transactionDate),amount:String(row.debit||''),docNature:'Tax Invoice'});
    setAddInvoiceRow({row,vendor});
  };
  const saveAddInvoice=()=>{
    if(!addInvoiceRow)return;
    const{row,vendor}=addInvoiceRow;
    if(!addInvoiceForm.invoiceNo.trim()){faError('Enter an invoice number.');return;}
    if(!(Number(addInvoiceForm.amount)>0)){faError('Enter a valid invoice amount.');return;}
    const freshInvoices=loadVendorInvoices(salonId);
    const invoiceDateDmy=addInvoiceForm.invoiceDate?fmtDate(addInvoiceForm.invoiceDate):row.transactionDate;
    const linkId='bank-'+row.id;
    const newInv={
      id:nextPrefixedId(freshInvoices,'VI-',4),
      vendorId:vendor.id,invoiceNo:addInvoiceForm.invoiceNo.trim(),invoiceDate:invoiceDateDmy,bookingDate:invoiceDateDmy,dueDate:'',
      amount:Number(addInvoiceForm.amount)||0,docNature:addInvoiceForm.docNature,desc:'Added from Bank Statement',attachment:null,
      igst:'',cgst:'',sgst:'',roundOff:'',freight:'',linkedPI:'',category:'',assetLines:[],
      payments:[{paidAmount:Number(addInvoiceForm.amount)||0,paidDate:toISO(row.transactionDate),mode:'Bank Transfer',ref:row.refNo||'',note:'Recorded from Bank Statement (new invoice)',linkId}]
    };
    const updated=[...freshInvoices,newInv];
    saveVendorInvoices(updated,salonId);
    setVendorInvoices(updated);
    setRows(prev=>{
      const next=prev.map(r=>r.id===row.id?{...r,linkedInvoice:invoiceKeyFor(newInv),vendorOverride:vendor.name,nature:'Vendor Payment'}:r);
      saveBankStatementRows(next,salonId);
      return next;
    });
    setAddInvoiceRow(null);
    toastSuccess('Invoice '+newInv.invoiceNo+' added and linked — recorded as fully paid against this transaction.');
  };
  // ── Settle Salary / Incentive against one OR MORE employees directly from a Bank Statement
  // debit row — parallel to the Vendor invoice-link flow above, but against Salary Working's /
  // Incentive Working's own Payment Status instead of a Vendor Sheet invoice. Each employee "line"
  // offers both components (checkable, like the multi-invoice link modal) since a single bank
  // transfer sometimes covers one employee's Salary AND Incentive together — and employees can be
  // added freely, since a single bank transfer sometimes covers a whole batch of employees at
  // once (a combined payroll NEFT), not just one.
  const [empPayRow,setEmpPayRow]=useState(null); // {row, year, month} or null
  const [empPayLines,setEmpPayLines]=useState([]); // [{employeeId,employeeName,salaryOS,incentiveOS,selSalary,selIncentive,salaryAmt,incentiveAmt}]
  const [diSplitAmt,setDiSplitAmt]=useState({}); // employeeId -> string, the "total to split across Daily Incentive heads" input
  const MONTH_SHORT=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const periodFromTransactionDate=(dmy)=>{
    const iso=toISO(dmy);
    const d=iso?new Date(iso+'T00:00:00'):null;
    return(d&&!isNaN(d))?{year:d.getFullYear(),month:d.getMonth()}:null;
  };
  const makeEmpPayLine=(employee,year,month)=>({
    employeeId:employee.id,employeeName:employee.name,
    salaryOS:employeeSalaryOutstandingFor(salonId,employee.id,year,month),
    incentiveOS:employeeIncentiveOutstandingFor(salonId,employee.id,year,month),
    selSalary:false,selIncentive:false,salaryAmt:'',incentiveAmt:'',
    // Daily Incentive is really four separate payable buckets (plus "Other" for free-text
    // service entries) — each independently checkable/editable, keyed by category name.
    dailyIncentive:Object.fromEntries(DAILY_INCENTIVE_CATEGORIES_ALL.map(cat=>[cat,{
      os:employeeDailyIncentiveCategoryOutstandingFor(salonId,employee.id,year,month,cat),sel:false,amt:''
    }]))
  });
  const openEmployeePayModal=(row,employee)=>{
    const period=periodFromTransactionDate(row.transactionDate);
    if(!period){faError('This row needs a valid Transaction Date before Salary/Incentive Outstanding can be looked up.');return;}
    setEmpPayLines(employee?[makeEmpPayLine(employee,period.year,period.month)]:[]);
    setDiSplitAmt({});
    setEmpPayRow({row,...period});
  };
  // Splits one entered total across every Daily Incentive category this employee has an
  // outstanding balance in, proportional to each category's own share of the total outstanding
  // (e.g. Membership ₹150 + Service ₹250 + Target ₹125 of ₹525 total → a ₹400 split lands
  // roughly ₹114 / ₹190 / ₹95) — ticks each category it allocates to and fills in its amount,
  // capped so no category is ever allocated more than its own outstanding. Every field stays
  // editable afterward for fine-tuning, this is just a fast starting point.
  const splitDailyIncentiveAcrossCategories=(employeeId)=>{
    const total=Number(diSplitAmt[employeeId])||0;
    if(total<=0){faError('Enter a total amount to split first.');return;}
    setEmpPayLines(prev=>prev.map(l=>{
      if(l.employeeId!==employeeId)return l;
      const targetCats=DAILY_INCENTIVE_CATEGORIES_ALL.filter(cat=>l.dailyIncentive[cat].os>0);
      if(!targetCats.length)return l;
      const sumOS=targetCats.reduce((s,cat)=>s+l.dailyIncentive[cat].os,0);
      const nextDI={...l.dailyIncentive};
      targetCats.forEach(cat=>{
        const c=l.dailyIncentive[cat];
        const share=sumOS>0?Math.round(total*(c.os/sumOS)):0;
        const amt=Math.min(share,c.os);
        nextDI[cat]={...c,sel:amt>0,amt:amt>0?String(amt):''};
      });
      return{...l,dailyIncentive:nextDI};
    }));
  };
  const addEmpPayLine=(employeeId)=>{
    if(!empPayRow||!employeeId)return;
    if(empPayLines.some(l=>l.employeeId===employeeId))return; // already added
    const employee=employees.find(e=>e.id===employeeId);
    if(!employee)return;
    setEmpPayLines(prev=>[...prev,makeEmpPayLine(employee,empPayRow.year,empPayRow.month)]);
  };
  const removeEmpPayLine=(employeeId)=>{
    if(!confirm('Remove this employee from the payment?'))return;
    setEmpPayLines(prev=>prev.filter(l=>l.employeeId!==employeeId));
    setDiSplitAmt(prev=>{const next={...prev};delete next[employeeId];return next;});
  };
  // ── Add Daily Incentive entries right from inside Settle Pay — sometimes the reason nothing
  // shows as outstanding is simply that no entry was ever recorded for that employee this month,
  // not that it was already settled. Rather than sending the person over to the Daily Incentive
  // Sheet and back, this creates one entry per category with an amount (Mode Bank, since it's
  // being added specifically to be paid by this bank transaction) — split across as many of the
  // four categories as apply in one go — and immediately refreshes their outstanding figures in
  // the line already open here. ──
  const [addDIRow,setAddDIRow]=useState(null); // {employeeId,employeeName,year,month} or null
  const [addDIForm,setAddDIForm]=useState({date:'',amounts:{}}); // amounts: {category: '150', ...}
  const openAddDIEntry=(employeeId,employeeName,year,month)=>{
    const defaultDate=empPayRow?toISO(empPayRow.row.transactionDate):'';
    setAddDIForm({date:defaultDate||new Date().toISOString().slice(0,10),amounts:Object.fromEntries(DAILY_INCENTIVE_CATEGORIES.map(c=>[c,'']))});
    setAddDIRow({employeeId,employeeName,year,month});
  };
  const saveAddDIEntry=()=>{
    if(!addDIRow)return;
    const d=addDIForm.date?new Date(addDIForm.date+'T00:00:00'):null;
    if(!d||isNaN(d)||d.getFullYear()!==addDIRow.year||d.getMonth()!==addDIRow.month){
      faError('Date must fall within '+MONTH_SHORT[addDIRow.month]+' '+addDIRow.year+' — the month this bank row is being settled for.');
      return;
    }
    const activeCats=DAILY_INCENTIVE_CATEGORIES.filter(c=>Number(addDIForm.amounts[c])>0);
    if(!activeCats.length){faError('Enter an amount for at least one category.');return;}
    const newEntries=activeCats.map(cat=>{
      const amt=Number(addDIForm.amounts[cat])||0;
      return{date:addDIForm.date,empId:addDIRow.employeeId,emp:addDIRow.employeeName,service:cat,
        target:0,achieved:amt,rate:100,incentive:amt,mode:'Bank',status:'Computed'};
    });
    const freshEntries=loadDailyIncentiveEntries(salonId);
    saveDailyIncentiveEntries([...freshEntries,...newEntries],salonId);
    setEmpPayLines(prev=>prev.map(l=>{
      if(l.employeeId!==addDIRow.employeeId)return l;
      const nextDI={...l.dailyIncentive};
      activeCats.forEach(cat=>{
        nextDI[cat]={...nextDI[cat],os:employeeDailyIncentiveCategoryOutstandingFor(salonId,addDIRow.employeeId,addDIRow.year,addDIRow.month,cat)};
      });
      return{...l,dailyIncentive:nextDI};
    }));
    setAddDIRow(null);
    const total=newEntries.reduce((s,e)=>s+e.incentive,0);
    toastSuccess('Added '+money(total)+' across '+activeCats.length+' categor'+(activeCats.length===1?'y':'ies')+' for '+addDIRow.employeeName+' — now showing under Daily Incentive Outstanding above.');
  };
  const empPayLineTotal=(l)=>(l.selSalary?Number(l.salaryAmt)||0:0)+(l.selIncentive?Number(l.incentiveAmt)||0:0)
    +DAILY_INCENTIVE_CATEGORIES_ALL.reduce((s,cat)=>s+(l.dailyIncentive[cat].sel?Number(l.dailyIncentive[cat].amt)||0:0),0);
  const empPayLinesTotal=(lines)=>lines.reduce((s,l)=>s+empPayLineTotal(l),0);
  // comp is 'salary' | 'incentive' | a Daily Incentive category name (one of
  // DAILY_INCENTIVE_CATEGORIES_ALL) — the two flat components live directly on the line, the
  // Daily Incentive ones live nested under line.dailyIncentive[comp].
  const toggleEmpLineComponent=(employeeId,comp)=>{
    const totalAllocated=empPayLinesTotal(empPayLines);
    const isDI=DAILY_INCENTIVE_CATEGORIES_ALL.includes(comp);
    setEmpPayLines(prev=>prev.map(l=>{
      if(l.employeeId!==employeeId)return l;
      if(isDI){
        const c=l.dailyIncentive[comp];
        if(c.sel)return{...l,dailyIncentive:{...l.dailyIncentive,[comp]:{...c,sel:false}}};
        const remaining=Math.max(0,(empPayRow?Number(empPayRow.row.debit)||0:0)-totalAllocated);
        const defaultAmt=remaining>0?Math.min(c.os,remaining):c.os;
        return{...l,dailyIncentive:{...l.dailyIncentive,[comp]:{...c,sel:true,amt:String(defaultAmt)}}};
      }
      const selKey=comp==='salary'?'selSalary':'selIncentive';
      const amtKey=comp==='salary'?'salaryAmt':'incentiveAmt';
      const osKey=comp==='salary'?'salaryOS':'incentiveOS';
      if(l[selKey])return{...l,[selKey]:false};
      const remaining=Math.max(0,(empPayRow?Number(empPayRow.row.debit)||0:0)-totalAllocated);
      const defaultAmt=remaining>0?Math.min(l[osKey],remaining):l[osKey];
      return{...l,[selKey]:true,[amtKey]:String(defaultAmt)};
    }));
  };
  const updateEmpLineAmount=(employeeId,comp,value)=>{
    const isDI=DAILY_INCENTIVE_CATEGORIES_ALL.includes(comp);
    setEmpPayLines(prev=>prev.map(l=>{
      if(l.employeeId!==employeeId)return l;
      if(isDI)return{...l,dailyIncentive:{...l.dailyIncentive,[comp]:{...l.dailyIncentive[comp],amt:value}}};
      const amtKey=comp==='salary'?'salaryAmt':'incentiveAmt';
      return{...l,[amtKey]:value};
    }));
  };
  const saveEmployeePay=()=>{
    if(!empPayRow)return;
    const{row,year,month}=empPayRow;
    const lineIsActive=(l)=>(l.selSalary&&Number(l.salaryAmt)>0)||(l.selIncentive&&Number(l.incentiveAmt)>0)
      ||DAILY_INCENTIVE_CATEGORIES_ALL.some(cat=>l.dailyIncentive[cat].sel&&Number(l.dailyIncentive[cat].amt)>0);
    const activeLines=empPayLines.filter(lineIsActive);
    if(!activeLines.length){faError('Tick Salary, Incentive and/or Daily Incentive for at least one employee, with an amount.');return;}
    const settlements=activeLines.map(l=>{
      const salaryAmt=l.selSalary?(Number(l.salaryAmt)||0):0;
      const incentiveAmt=l.selIncentive?(Number(l.incentiveAmt)||0):0;
      const dailyIncentiveByCat={};
      DAILY_INCENTIVE_CATEGORIES_ALL.forEach(cat=>{
        const c=l.dailyIncentive[cat];
        if(c.sel&&Number(c.amt)>0)dailyIncentiveByCat[cat]=Number(c.amt);
      });
      const result=settleEmployeePayFor(salonId,l.employeeId,year,month,{salaryAmt,incentiveAmt,dailyIncentiveByCat});
      const dailyIncentiveTotal=Object.values(dailyIncentiveByCat).reduce((s,v)=>s+v,0);
      return{employeeId:l.employeeId,employeeName:l.employeeName,year,month,salary:salaryAmt,incentive:incentiveAmt,
        dailyIncentive:dailyIncentiveTotal,dailyIncentiveByCat,
        salarySettled:result.salarySettled,incentiveSettled:result.incentiveSettled,dailyIncentiveSettled:result.dailyIncentiveSettled};
    });
    setRows(prev=>{
      const next=prev.map(r=>r.id===row.id?{...r,linkedEmployeePay:settlements}:r);
      saveBankStatementRows(next,salonId);
      return next;
    });
    setEmpPayRow(null);
    const total=settlements.reduce((s,e)=>s+e.salary+e.incentive+e.dailyIncentive,0);
    toastSuccess('Recorded '+money(total)+' across '+settlements.length+' employee'+(settlements.length===1?'':'s')+' ('+settlements.map(e=>e.employeeName).join(', ')+').');
  };
  const unlinkEmployeePay=(row)=>{
    const lp=row.linkedEmployeePay;
    if(!lp||!lp.length)return;
    if(!confirm('Unlink this payment? Salary/Incentive Payment Status will be reset to "Not Paid" for whichever part(s) this had marked Paid (Daily Incentive has no status to reset — it\'ll just be removed from this transaction\'s record), across all '+lp.length+' employee'+(lp.length===1?'':'s')+'.'))return;
    lp.forEach(e=>unsettleEmployeePayFor(salonId,e.employeeId,e.year,e.month,{salary:e.salarySettled,incentive:e.incentiveSettled}));
    setRows(prev=>{
      const next=prev.map(r=>r.id===row.id?{...r,linkedEmployeePay:undefined}:r);
      saveBankStatementRows(next,salonId);
      return next;
    });
    toastInfo('Unlinked — Payment Status reverted where it had been marked Paid.');
  };
  // ── Record Advance directly from a Bank Statement debit row — for when a bank transfer is a
  // NEW Advance disbursement to one or more employees, not a settlement of Salary/Incentive
  // already payable. Creates real Advances-sheet record(s) (Bank Transfer, already disbursed,
  // Active) linked back to this bank row — same idea as "+ Add Invoice" creating a Vendor Sheet
  // invoice, just on the Advances sheet instead. Supports more than one employee on the same row,
  // since a single bank transfer sometimes disburses advances to several employees at once (a
  // batch advance payment), same multi-line pattern as Settle Pay above.
  const [advanceRow,setAdvanceRow]=useState(null); // {row} or null
  const [advanceLines,setAdvanceLines]=useState([]); // [{employeeId,employeeName,amount,reason,deductFrom,repayment,deductionStart,linkExistingId}]
  const nextMonthYM=()=>{const d=new Date();d.setMonth(d.getMonth()+1,1);return d.toISOString().slice(0,7);};
  // Existing Advances-sheet records for this employee that aren't tied to a bank transaction yet
  // (no bankRowId) and are still awaiting disbursement (Active or Pending Approval) — e.g. an
  // advance that was requested and approved on the Advances sheet before the actual bank
  // transfer happened. These get offered to LINK against instead of always creating a duplicate.
  const advanceCandidatesFor=(employeeName)=>loadAdvances(salonId).filter(a=>a.emp===employeeName&&!a.bankRowId&&(a.status==='Active'||a.status==='Pending Approval'));
  const makeAdvanceLine=(employee,defaultAmount)=>{
    const candidates=advanceCandidatesFor(employee.name);
    const defaultLink=candidates.length===1?candidates[0].id:'';
    return{
      employeeId:employee.id,employeeName:employee.name,
      amount:defaultAmount!=null&&defaultAmount>0?String(defaultAmount):'',
      reason:'',deductFrom:'Salary',repayment:'',deductionStart:nextMonthYM(),
      linkExistingId:defaultLink
    };
  };
  const openAdvanceModal=(row,employee)=>{
    setAdvanceLines(employee?[makeAdvanceLine(employee,row.debit)]:[]);
    setAdvanceRow({row});
  };
  const addAdvanceLine=(employeeId)=>{
    if(!advanceRow||!employeeId)return;
    if(advanceLines.some(l=>l.employeeId===employeeId))return;
    const employee=employees.find(e=>e.id===employeeId);
    if(!employee)return;
    const alreadyAllocated=advanceLines.reduce((s,l)=>s+(Number(l.amount)||0),0);
    const remaining=Math.max(0,(Number(advanceRow.row.debit)||0)-alreadyAllocated);
    setAdvanceLines(prev=>[...prev,makeAdvanceLine(employee,remaining)]);
  };
  const removeAdvanceLine=(employeeId)=>{if(confirm('Remove this employee from the Advance?'))setAdvanceLines(prev=>prev.filter(l=>l.employeeId!==employeeId));};
  const updateAdvanceLine=(employeeId,field,value)=>setAdvanceLines(prev=>prev.map(l=>l.employeeId===employeeId?{...l,[field]:value}:l));
  const saveAdvanceRecord=()=>{
    if(!advanceRow)return;
    const{row}=advanceRow;
    const freshAdvances=loadAdvances(salonId);
    let n=Math.max(0,...freshAdvances.map(a=>Number(String(a.id||'').replace(/\D/g,''))||0));
    const created=[];
    let updatedAdvances=[...freshAdvances];
    const newRecords=[];
    advanceLines.forEach(l=>{
      if(l.linkExistingId){
        const idx=updatedAdvances.findIndex(a=>a.id===l.linkExistingId);
        if(idx<0)return;
        const existing=updatedAdvances[idx];
        const amount=Number(existing.outstanding!=null?existing.outstanding:existing.amount)||0;
        if(amount<=0)return;
        updatedAdvances[idx]={...existing,mode:'Bank Transfer',bankRef:row.refNo||existing.bankRef,bankRowId:row.id,
          date:toISO(row.transactionDate)||existing.date,status:existing.status==='Pending Approval'?'Active':existing.status};
        created.push({advanceId:existing.id,employeeId:l.employeeId,employeeName:l.employeeName,amount,wasExisting:true});
      }else{
        if(!(Number(l.amount)>0))return;
        n+=1;
        const amount=Number(l.amount)||0;
        const repayment=Number(l.repayment)||0;
        const outstanding=Math.max(0,amount-repayment);
        const rec={id:'A'+String(n).padStart(3,'0'),emp:l.employeeName,date:toISO(row.transactionDate),amount,
          reason:l.reason||'Advance — Bank Statement',approvedBy:'',repayment,mode:'Bank Transfer',bankRef:row.refNo||'',
          deductFrom:l.deductFrom||'Salary',deductionStart:l.deductionStart||'',schedule:[],
          outstanding,status:outstanding<=0?'Recovered':'Active',source:'bank',bankRowId:row.id};
        newRecords.push(rec);
        created.push({advanceId:rec.id,employeeId:l.employeeId,employeeName:l.employeeName,amount,wasExisting:false});
      }
    });
    if(!created.length){faError('Select an existing Advance to link, or enter an amount to record a new one, for at least one employee.');return;}
    saveAdvances([...updatedAdvances,...newRecords],salonId);
    setRows(prev=>{
      const next=prev.map(r=>r.id===row.id?{...r,linkedAdvance:created}:r);
      saveBankStatementRows(next,salonId);
      return next;
    });
    setAdvanceRow(null);
    const total=created.reduce((s,c)=>s+c.amount,0);
    const newCount=created.filter(c=>!c.wasExisting).length,linkedCount=created.filter(c=>c.wasExisting).length;
    toastSuccess('Recorded '+money(total)+' across '+created.length+' Advance'+(created.length===1?'':'s')+' for '+created.map(c=>c.employeeName).join(', ')+
      (linkedCount?' ('+linkedCount+' linked to existing, '+newCount+' new)':'')+'.');
  };
  const unlinkAdvance=(row)=>{
    const la=row.linkedAdvance;
    if(!la||!la.length)return;
    const createdOnes=la.filter(a=>!a.wasExisting);
    const linkedOnes=la.filter(a=>a.wasExisting);
    let msg='Unlink this Advance?';
    if(createdOnes.length)msg+=' The Advance record'+(createdOnes.length>1?'s':'')+' created here for '+createdOnes.map(a=>a.employeeName).join(', ')+' will be deleted from the Advances sheet — this can\'t be undone if any recovery has already happened against '+(createdOnes.length>1?'them':'it')+'.';
    if(linkedOnes.length)msg+=' The pre-existing Advance record'+(linkedOnes.length>1?'s':'')+' for '+linkedOnes.map(a=>a.employeeName).join(', ')+' will just be unlinked from this transaction, not deleted.';
    if(!confirm(msg))return;
    const createdIds=new Set(createdOnes.map(a=>a.advanceId));
    const linkedIds=new Set(linkedOnes.map(a=>a.advanceId));
    const freshAdvances=loadAdvances(salonId);
    const updated=freshAdvances.filter(a=>!createdIds.has(a.id)).map(a=>linkedIds.has(a.id)?{...a,bankRowId:undefined}:a);
    saveAdvances(updated,salonId);
    setRows(prev=>{
      const next=prev.map(r=>r.id===row.id?{...r,linkedAdvance:undefined}:r);
      saveBankStatementRows(next,salonId);
      return next;
    });
    toastInfo('Unlinked.');
  };
  const {success:toastSuccess,info:toastInfo,error:faError}=useToast();
  const invBalance=(inv)=>Number(inv.amount)-inv.payments.reduce((s,p)=>s+Number(p.paidAmount),0);
  const linkSelectedInvoices=()=>{
    if(!linkRow)return;
    // linkSelected/linkAllocations are keyed by inv.id (see toggleInvoiceSelect) — match against
    // that, not invoiceKeyFor, so invoices with the same/blank Invoice No stay independently
    // selectable and never get linked or amount-mixed together.
    const allocations=Array.from(linkSelected).map(id=>({id,amount:Number(linkAllocations[id])||0})).filter(a=>a.amount>0);
    if(!allocations.length){faError('Enter an amount for at least one selected invoice.');return;}
    const linkId='bank-'+linkRow.id;
    const freshInvoices=loadVendorInvoices(salonId);
    const linkedNos=[];
    const linkedKeys=[];
    const updated=freshInvoices.map(inv=>{
      const alloc=allocations.find(a=>a.id===inv.id);
      if(!alloc)return inv;
      linkedNos.push(inv.invoiceNo);
      linkedKeys.push(invoiceKeyFor(inv));
      return{...inv,payments:[...inv.payments,{paidAmount:alloc.amount,paidDate:toISO(linkRow.transactionDate),mode:'Bank Transfer',ref:linkRow.refNo||'',note:'Auto-linked from Bank Statement'+(allocations.length>1?' (split payment)':''),linkId}]};
    });
    saveVendorInvoices(updated,salonId);
    setVendorInvoices(updated);
    const combinedKey=linkedKeys.join(',');
    const totalAllocated=allocations.reduce((s,a)=>s+a.amount,0);
    setRows(prev=>{
      const next=prev.map(r=>r.id===linkRow.id?{...r,linkedInvoice:combinedKey}:r);
      saveBankStatementRows(next,salonId);
      return next;
    });
    setLinkRow(null);
    toastSuccess('Linked — '+money(totalAllocated)+' allocated across '+allocations.length+' invoice'+(allocations.length===1?'':'s')+' ('+linkedNos.join(', ')+').');
  };
  const unlinkRow=(row)=>{
    if(!confirm('Unlink this transaction? The matching payment record on that invoice will also be removed.'))return;
    const linkId='bank-'+row.id;
    const freshInvoices=loadVendorInvoices(salonId);
    const updated=freshInvoices.map(inv=>inv.payments.some(p=>p.linkId===linkId)?{...inv,payments:inv.payments.filter(p=>p.linkId!==linkId)}:inv);
    saveVendorInvoices(updated,salonId);
    setVendorInvoices(updated);
    setRows(prev=>{
      const next=prev.map(r=>r.id===row.id?{...r,linkedInvoice:''}:r);
      saveBankStatementRows(next,salonId);
      return next;
    });
    toastInfo('Unlinked — the payment record was removed from Vendor Sheet.');
  };
  // ── Bulk "Auto-Link Vendor Payments" — the one-row-at-a-time 🔗 Link modal is fine for a
  // stray transaction, but going through 30+ vendor debits by hand every month isn't. This scans
  // every unlinked debit row, finds its vendor the same way the modal does (findVendorMatch), and
  // only auto-links when exactly one of that vendor's open invoices has a balance matching the
  // debit amount to the rupee — that's the same "Amount matches ✓" signal the modal already
  // highlights, just applied automatically instead of requiring a click per row. Anything
  // ambiguous (no vendor match, no amount match, or more than one invoice tying) is left alone
  // for manual review via the individual 🔗 Link button, rather than guessing. ──
  const autoLinkVendorPayments=()=>{
    const freshInvoices=loadVendorInvoices(salonId);
    const candidates=rows.filter(r=>r.debit>0&&!r.linkedInvoice);
    if(!candidates.length){toastInfo('Nothing to link — every debit row is already linked (or there are no debit rows).');return;}
    // Tracked by inv.id (always unique), not invoiceKeyFor(inv) (vendorId+invoiceNo) — two open
    // invoices for the same vendor with a blank or duplicated Invoice No would otherwise collide
    // onto the same key and get cross-matched or double-counted.
    const usedInvoiceIds=new Set();
    const rowToInvId=new Map(); // row.id -> invoice.id
    let noVendorCount=0,needsReviewCount=0;
    candidates.forEach(r=>{
      const vendor=findVendorMatch(r.description,vendors);
      if(!vendor){noVendorCount++;return;}
      const openInv=freshInvoices.filter(inv=>inv.vendorId===vendor.id&&invBalance(inv)>0&&!usedInvoiceIds.has(inv.id));
      const amountMatches=openInv.filter(inv=>Math.abs(invBalance(inv)-r.debit)<1);
      if(amountMatches.length===1){
        usedInvoiceIds.add(amountMatches[0].id);
        rowToInvId.set(r.id,amountMatches[0].id);
      }else{
        needsReviewCount++;
      }
    });
    if(!rowToInvId.size){
      toastInfo('No confident matches — every unlinked debit either has no vendor match or no single exact-amount open invoice. Use 🔗 Link on individual rows to review these by hand.');
      return;
    }
    let linkedCount=0,linkedTotal=0;
    const rowToInvKey=new Map(); // row.id -> invoiceKeyFor(inv), for the display field on the bank row
    const updatedInvoices=freshInvoices.map(inv=>{
      const matchedRow=candidates.find(r=>rowToInvId.get(r.id)===inv.id);
      if(!matchedRow)return inv;
      linkedCount++;linkedTotal+=matchedRow.debit;
      rowToInvKey.set(matchedRow.id,invoiceKeyFor(inv));
      const linkId='bank-'+matchedRow.id;
      return{...inv,payments:[...inv.payments,{paidAmount:matchedRow.debit,paidDate:toISO(matchedRow.transactionDate),mode:'Bank Transfer',ref:matchedRow.refNo||'',note:'Auto-linked from Bank Statement (bulk)',linkId}]};
    });
    saveVendorInvoices(updatedInvoices,salonId);
    setVendorInvoices(updatedInvoices);
    setRows(prev=>{
      const next=prev.map(r=>rowToInvKey.has(r.id)?{...r,linkedInvoice:rowToInvKey.get(r.id)}:r);
      saveBankStatementRows(next,salonId);
      return next;
    });
    toastSuccess('Auto-linked '+linkedCount+' payment'+(linkedCount===1?'':'s')+' totalling '+money(linkedTotal)+' to matching invoices.'+
      (needsReviewCount?' '+needsReviewCount+' need manual review (vendor matched but amount didn\u2019t line up, or multiple invoices tie).':'')+
      (noVendorCount?' '+noVendorCount+' had no vendor match.':''));
  };

  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,React.createElement('div',{className:'page-title'},'Bank Statement'),React.createElement('div',{className:'page-sub'},'Import a bank-specific statement and map transactions with Cradlee details')),
      React.createElement('div',{className:'quick-actions'},
        onNavTab&&React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Jump to Due Dates',onClick:()=>onNavTab('due-dates')},'📅 Due Dates'),
        BANK_LOGIN_URLS[bank]&&React.createElement('div',{style:{display:'flex',gap:6,alignItems:'center'}},
          React.createElement('select',{className:'form-control',style:{width:'auto',padding:'6px 8px',fontSize:12},value:loginType,onChange:e=>setLoginType(e.target.value)},
            LOGIN_TYPES.map(t=>React.createElement('option',{key:t,value:t},t+' Login'))),
          React.createElement('button',{className:'btn btn-primary btn-sm',onClick:()=>window.open(BANK_LOGIN_URLS[bank][loginType],'_blank','noopener,noreferrer')},'🔗 Open '+bank+' '+loginType+' Login')
        ),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:downloadTemplate},'⬇ Download '+bank+' Template'),
        rows.length>0&&React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:e=>{exportData();if(window.flashButton)window.flashButton(e.currentTarget,'success');}},'⬇ Export Mapped Data'),
        rows.length>0&&React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Re-apply the classification rules to Nature and Date as per Cradlee for every row, overwriting what\'s there now',onClick:reclassifyExisting},'🪄 Re-classify Nature & Dates'),
        rows.length>0&&React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Scan every unlinked debit and auto-link it to a Vendor Sheet invoice where the vendor and the exact amount both match — anything ambiguous is left for manual review',onClick:autoLinkVendorPayments},'🔗 Auto-Link Vendor Payments'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setShowRulesModal(true)},'ℹ️ How classification works'),
        selected.size>0&&React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(255,107,107,.15)',border:'1px solid rgba(255,107,107,.4)',color:'var(--red)',fontWeight:600},onClick:deleteSelected},'🗑 Delete Selected ('+selected.size+')'),
        rows.length>0&&React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(255,107,107,.1)',border:'1px solid rgba(255,107,107,.3)',color:'var(--red)'},onClick:clearData},'Clear Data')
      )
    ),
    React.createElement('div',{className:'card',style:{marginBottom:16,background:'rgba(74,158,255,0.06)',border:'1px solid rgba(74,158,255,0.25)'}},
      React.createElement('div',{style:{display:'flex',gap:12,alignItems:'flex-start'}},
        React.createElement('div',{style:{fontSize:20}},'🏦'),
        React.createElement('div',{style:{flex:1}},
          React.createElement('div',{style:{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:8}},'Quick Access — Personal, Corporate & Business Login'),
          React.createElement('div',{style:{display:'flex',gap:14,flexWrap:'wrap'}},
            QUICK_BANKS.map(b=>React.createElement('div',{key:b,style:{display:'flex',flexDirection:'column',gap:5,padding:'8px 10px',background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--r)'}},
              React.createElement('div',{style:{fontSize:11.5,fontWeight:600,color:'var(--text)'}},b),
              React.createElement('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},
                LOGIN_TYPES.map(t=>React.createElement('button',{key:t,className:'btn btn-ghost btn-sm',style:{fontSize:10.5,padding:'4px 8px'},onClick:()=>window.open(BANK_LOGIN_URLS[b][t],'_blank','noopener,noreferrer')},t))
              )
            ))
          ),
          React.createElement('div',{style:{marginTop:14,paddingTop:14,borderTop:'1px solid var(--border)'}},
            React.createElement('div',{style:{fontSize:11.5,fontWeight:600,color:'var(--text)',marginBottom:6}},'🔎 Other Bank'),
            React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}},
              React.createElement('input',{list:'other-bank-options',value:otherBankQuery,onChange:e=>setOtherBankQuery(e.target.value),
                placeholder:'Search any bank — e.g. Bank of Baroda, PNB, Yes Bank…',
                className:'form-control',style:{width:280}}),
              React.createElement('datalist',{id:'other-bank-options'},
                Object.keys(BANK_LOGIN_URLS).filter(b=>!QUICK_BANKS.includes(b)).sort().map(b=>React.createElement('option',{key:b,value:b}))
              ),
              otherBankMatch&&React.createElement(React.Fragment,null,
                React.createElement('select',{className:'form-control',style:{width:'auto',padding:'6px 8px',fontSize:12},value:otherLoginType,onChange:e=>setOtherLoginType(e.target.value)},
                  LOGIN_TYPES.map(t=>React.createElement('option',{key:t,value:t},t+' Login'))),
                React.createElement('button',{className:'btn btn-primary btn-sm',onClick:()=>window.open(BANK_LOGIN_URLS[otherBankMatch][otherLoginType],'_blank','noopener,noreferrer')},'🔗 Open '+otherBankMatch+' '+otherLoginType+' Login'),
                React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setBank(otherBankMatch)},'Use for Import Format too')
              )
            ),
            otherBankQuery&&!otherBankMatch&&React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:6}},Object.keys(BANK_LOGIN_URLS).length+' banks available — start typing to search, then pick an exact match from the list.')
          ),
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:10,lineHeight:1.6}},'Personal is for individual/retail accounts, Corporate for company netbanking (multi-user, maker-checker), and Business for MSME / current-account logins \u2014 pick the one matching how this outlet\u2019s account is held. All open each bank\u2019s official portal (RBI-mandated ".bank.in" domain) in a new tab. Always check the address bar shows the correct ".bank.in" domain before entering your credentials \u2014 SalonOS never asks for or stores your banking password.')
        )
      )
    ),
    React.createElement('div',{className:'card',style:{marginBottom:16}},
      React.createElement('div',{className:'card-title'},'Select Bank-Specific Format'),
      React.createElement('div',{className:'form-row cols2'},
        React.createElement('div',{className:'form-group'},React.createElement('label',null,'Bank (type to search '+Object.keys(BANKS).length+' banks)'),
          React.createElement('input',{list:'format-bank-options',className:'form-control',value:bank,
            onChange:e=>{const v=e.target.value;if(BANKS[v])setBank(v);else setBank(v);},
            onBlur:e=>{if(!BANKS[e.target.value])setBank('Generic');}}),
          React.createElement('datalist',{id:'format-bank-options'},Object.keys(BANKS).sort().map(b=>React.createElement('option',{key:b,value:b})))
        ),
        React.createElement('div',{className:'form-group'},React.createElement('label',null,'Expected Columns'),React.createElement('div',{style:{fontSize:11,color:'var(--text2)',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'9px 12px'}},(BANKS[bank]||BANKS.Generic).headers.join(' • ')))
      ),
      React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},'Download the selected bank\u2019s template or directly upload a statement downloaded from that bank. The import, on-screen table and export all follow this bank\u2019s column format \u2014 switch the bank above any time to re-map. Extra columns will be ignored.')
    ),
    React.createElement('div',{className:'card',style:{marginBottom:16,background:fsSupported?'rgba(76,175,125,0.06)':'rgba(255,159,67,0.06)',border:'1px solid '+(fsSupported?'rgba(76,175,125,0.25)':'rgba(255,159,67,0.25)')}},
      React.createElement('div',{style:{display:'flex',gap:12,alignItems:'flex-start',flexWrap:'wrap'}},
        React.createElement('div',{style:{fontSize:20}},'⚡'),
        React.createElement('div',{style:{flex:1,minWidth:260}},
          React.createElement('div',{style:{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:4}},'Auto-Import from your Downloads folder'),
          !fsSupported?React.createElement('div',{style:{fontSize:12,color:'var(--text2)',lineHeight:1.7}},
            'This browser doesn\u2019t support folder watching (works in Chrome/Edge desktop only). Please use the upload box below instead.'
          ):React.createElement(React.Fragment,null,
            React.createElement('div',{style:{fontSize:12,color:'var(--text2)',lineHeight:1.7,marginBottom:8}},
              !dirHandle
                ?'Connect your Downloads folder once. From then on, every time you download a '+bank+' statement there, this page can pick it up automatically \u2014 no manual browsing.'
                :'Connected. Click "Check Now" any time after downloading a statement from your bank\u2019s site, or just reopen this tab \u2014 it checks automatically on load.'
            ),
            React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}},
              !dirHandle?React.createElement('button',{className:'btn btn-primary btn-sm',onClick:connectDownloads},'📂 Connect Downloads Folder'):
              React.createElement(React.Fragment,null,
                React.createElement('button',{className:'btn btn-primary btn-sm',disabled:autoBusy,onClick:checkNow},autoBusy?'Checking…':(dirNeedsPermission?'🔓 Reconnect & Check':'🔄 Check Now')),
                React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:disconnectDownloads},'Disconnect')
              )
            ),
            autoStatus&&React.createElement('div',{style:{marginTop:8,fontSize:12,color:autoStatus.indexOf('failed')>-1||autoStatus.indexOf('not')>-1?'var(--red)':'var(--green)'}},autoStatus),
            React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:8,lineHeight:1.6}},'It looks for the most recently modified file in that folder whose name contains "statement", "txn", "account"'+(bank!=='Generic'?', or the bank name':'')+' (.xlsx/.xls/.csv). You still download the statement from your bank\u2019s net-banking portal yourself \u2014 this just removes the manual browse-and-select step afterwards.')
          )
        )
      )
    ),
    React.createElement('div',{className:'card',style:{marginBottom:16}},
      React.createElement('div',{className:'card-title'},'Upload Bank Statement'),
      rows.length>0&&React.createElement('div',{style:{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}},
        [{v:'append',label:'➕ Append to existing statement',desc:'Adds new rows to the '+rows.length+' already imported \u2014 duplicates are skipped automatically'},
         {v:'replace',label:'🔄 Upload fresh statement',desc:'Replaces all '+rows.length+' currently imported rows with just this file'}
        ].map(o=>React.createElement('label',{key:o.v,title:o.desc,
          style:{display:'flex',alignItems:'center',gap:7,padding:'8px 12px',borderRadius:'var(--r)',cursor:'pointer',fontSize:12.5,fontWeight:600,
            border:'1px solid '+(importMode===o.v?'var(--accent)':'var(--border2)'),
            background:importMode===o.v?'rgba(47,95,224,0.12)':'var(--bg3)',color:importMode===o.v?'var(--accent2)':'var(--text2)'}},
          React.createElement('input',{type:'radio',name:'bsImportMode',checked:importMode===o.v,onChange:()=>setImportMode(o.v),style:{margin:0}}),
          o.label
        ))
      ),
      rows.length>0&&React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:14,marginTop:-6}},
        importMode==='append'
          ?'The next file you upload will be added to what\u2019s already here. Rows with the same date, description, debit, credit and closing balance as an existing row are treated as the same transaction and skipped, so re-uploading an overlapping date range is safe.'
          :React.createElement('span',{style:{color:'var(--orange)'}},'\u26a0 The next file you upload will remove all '+rows.length+' currently imported rows first \u2014 use this only if this file is the complete, correct statement on its own.')
      ),
      React.createElement('input',{ref:fileRef,type:'file',accept:'.xlsx,.xls,.csv',style:{display:'none'},onChange:onFile}),
      React.createElement('div',{onDragOver:e=>{e.preventDefault();setDragging(true)},onDragLeave:()=>setDragging(false),onDrop,
        onClick:()=>fileRef.current&&fileRef.current.click(),style:{border:'2px dashed '+(dragging?'var(--accent)':'var(--border2)'),borderRadius:'var(--r2)',padding:28,textAlign:'center',cursor:'pointer',background:dragging?'rgba(47,95,224,.06)':'var(--bg3)'}},
        React.createElement('div',{style:{fontSize:30,marginBottom:8}},'🏦'),React.createElement('div',{style:{fontSize:14,fontWeight:600,color:'var(--text)',marginBottom:5}},'Drop bank statement here or click to browse'),
        React.createElement('div',{style:{fontSize:12,color:'var(--text3)'}},'Accepted: Excel (.xlsx, .xls) and CSV'),fileName&&React.createElement('div',{style:{fontSize:11,color:'var(--accent)',marginTop:8}},'Selected: '+fileName)
      ),
      message&&React.createElement('div',{style:{marginTop:12,padding:10,borderRadius:'var(--r)',fontSize:12,color:message.startsWith('Import failed')?'var(--red)':'var(--green)',background:message.startsWith('Import failed')?'rgba(255,107,107,.08)':'rgba(76,175,125,.08)'}},message)
    ),
    rows.length>0&&React.createElement(React.Fragment,null,
      React.createElement('div',{className:'grid3',style:{marginBottom:16}},
        React.createElement('div',{className:'metric-card blue'},React.createElement('div',{className:'metric-label'},'Transactions'),React.createElement('div',{className:'metric-value'},filtered.length)),
        React.createElement('div',{className:'metric-card red'},React.createElement('div',{className:'metric-label'},'Total Debit'),React.createElement('div',{className:'metric-value'},money(totals.debit))),
        React.createElement('div',{className:'metric-card green'},React.createElement('div',{className:'metric-label'},'Total Credit'),React.createElement('div',{className:'metric-value'},money(totals.credit)))
      ),

      React.createElement('div',{className:'card',style:{marginBottom:16}},
        React.createElement('div',{className:'card-title'},'Reconciliation Summary — full statement, not just the current filter'),
        React.createElement('div',{className:'grid4'},
          React.createElement('div',{className:'metric-card green'},
            React.createElement('div',{className:'metric-label'},'Revenue Mapped (Credits)'),
            React.createElement('div',{className:'metric-value',style:{fontSize:19}},money(reconciliationStats.creditMapped)),
            React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:2}},'of '+money(reconciliationStats.creditTotal)+' total credits · Card/UPI Settlement + Cash Deposit + Collection')
          ),
          React.createElement('div',{className:'metric-card teal'},
            React.createElement('div',{className:'metric-label'},'Vendor Payments Linked'),
            React.createElement('div',{className:'metric-value',style:{fontSize:19}},money(reconciliationStats.vendorPaymentLinked)),
            React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:2}},'of '+money(reconciliationStats.vendorPaymentTotal)+' tagged Vendor Payment · rest need 🔗 Link')
          ),
          React.createElement('div',{className:'metric-card amber'},
            React.createElement('div',{className:'metric-label'},'Unclassified Credits'),
            React.createElement('div',{className:'metric-value',style:{fontSize:19}},money(reconciliationStats.creditUnclassified)),
            React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:2}},'no Nature set — use ⚠️ Unclassified quick filter')
          ),
          React.createElement('div',{className:'metric-card purple'},
            React.createElement('div',{className:'metric-label'},'Unclassified Debits'),
            React.createElement('div',{className:'metric-value',style:{fontSize:19}},money(reconciliationStats.debitUnclassified)),
            React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:2}},'no Nature set — use ⚠️ Unclassified quick filter')
          )
        )
      ),

      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'section-header',style:{marginBottom:12}},
          React.createElement('div',{className:'card-title',style:{marginBottom:0}},'Imported Statement & Cradlee Mapping'),
          React.createElement('div',{style:{display:'flex',gap:12,alignItems:'center'}},
            onNavTab&&React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Jump to Due Dates',onClick:()=>onNavTab('due-dates')},'📅 Due Dates'),
            cellRange.Toolbar(),
            React.createElement('div',{className:'search-bar',style:{maxWidth:320}},React.createElement('span',null,React.createElement(IconSearch,{size:13})),React.createElement('input',{value:search,onChange:e=>setSearch(e.target.value),placeholder:'Search transaction…'}))
          )
        ),
        (()=>{
          return React.createElement('div',{style:{marginBottom:12}},
            React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:6}},'Quick filters — click to toggle, combine as many as you like'),
            React.createElement('div',{style:{display:'flex',flexWrap:'wrap',gap:6}},
              QUICK_FILTERS.map(qf=>{
                const isOn=quickFilters.has(qf.key);
                const count=rows.filter(r=>matchesQuickFilter(r,qf.key)).length;
                return React.createElement('button',{key:qf.key,
                  onClick:()=>toggleQuickFilter(qf.key,qf.exclusiveWith),
                  title:count+' of '+rows.length+' rows',
                  style:{fontSize:11,padding:'5px 10px',borderRadius:20,border:'1px solid '+(isOn?'var(--accent)':'var(--border2)'),background:isOn?'var(--accent)':'transparent',color:isOn?'#ffffff':'var(--text2)',cursor:'pointer',fontWeight:isOn?700:500,display:'inline-flex',alignItems:'center',gap:5}
                },qf.label,React.createElement('span',{style:{fontSize:9.5,opacity:0.75}},'('+count+')'));
              })
            )
          );
        })(),
        (Object.keys(columnFilters).length>0||quickFilters.size>0)&&React.createElement('div',{style:{display:'flex',flexWrap:'wrap',gap:6,alignItems:'center',marginBottom:12,padding:'8px 10px',background:'var(--bg3)',borderRadius:'var(--r)'}},
          React.createElement('span',{style:{fontSize:10.5,color:'var(--text3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em'}},'Active filters:'),
          Array.from(quickFilters).map(key=>
            React.createElement('span',{key:'qf-'+key,style:{display:'inline-flex',alignItems:'center',gap:6,fontSize:11,padding:'4px 6px 4px 10px',background:'rgba(47,95,224,0.14)',border:'1px solid rgba(47,95,224,0.35)',borderRadius:20,color:'var(--text)'}},
              (QUICK_FILTERS.find(q=>q.key===key)||{}).label||key,
              React.createElement('span',{onClick:()=>toggleQuickFilter(key),title:'Remove this filter',style:{cursor:'pointer',color:'var(--text3)',fontWeight:700,padding:'0 3px'}},'✕')
            )
          ),
          FILTER_COLS.filter(col=>columnFilters[col.key]!==undefined).map(col=>
            React.createElement('span',{key:col.key,style:{display:'inline-flex',alignItems:'center',gap:6,fontSize:11,padding:'4px 6px 4px 10px',background:'rgba(47,95,224,0.14)',border:'1px solid rgba(47,95,224,0.35)',borderRadius:20,color:'var(--text)'}},
              filterSummaryFor(col,columnFilters[col.key]),
              React.createElement('span',{onClick:()=>clearColumnFilter(col.key),title:'Remove this filter',style:{cursor:'pointer',color:'var(--text3)',fontWeight:700,padding:'0 3px'}},'✕')
            )
          ),
          React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:10.5,padding:'3px 10px'},onClick:()=>{setColumnFilters({});setQuickFilters(new Set());}},'Clear all')
        ),
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:10}},'Vendor Name is matched automatically from the Description against your Vendor List — pick a different vendor to override it, choose "— No vendor —" to clear it, or "Auto: …" to go back to automatic matching; picking a vendor also sets Nature to "Vendor Payment". Nature has its own column for everything else — Salary, TDS, GST, Card/UPI Settlement, and so on. O/S Invoices shows that vendor\u2019s outstanding invoices, ready to link, or lets you add one on the spot if none exist yet. Date as per Cradlee is editable too. Changes are saved automatically in this browser. Click a cell — or drag across several — then Ctrl/Cmd+C to copy or Ctrl/Cmd+V to paste, exactly like Excel. The header row and the first two columns stay in view as you scroll — like Freeze Panes.'),
        React.createElement('div',{className:'table-wrap',ref:bsWrapRef,style:{maxHeight:'70vh',overflowY:'auto'}},React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,
            React.createElement('th',{style:{width:32,position:'sticky',top:0,left:0,zIndex:5,background:'var(--th-bg)'}},React.createElement('input',{type:'checkbox',
              checked:filtered.length>0&&filtered.every(r=>selected.has(r.id)),
              onChange:e=>setSelected(prev=>{const n=new Set(prev);if(e.target.checked)filtered.forEach(r=>n.add(r.id));else filtered.forEach(r=>n.delete(r.id));return n;})
            })),
            ...FILTER_COLS.map((col,ci)=>{
              const active=columnFilters[col.key];
              const isOpen=openFilterCol===col.key;
              const frozen=ci===0;
              return React.createElement('th',{key:col.key,style:{whiteSpace:'nowrap',position:'sticky',top:0,zIndex:frozen?5:4,background:'var(--th-bg)',...(frozen?{left:32,borderRight:'2px solid var(--accent)'}:{})}},
                React.createElement('div',{
                  className:'autofilter-toggle',
                  style:{display:'inline-flex',alignItems:'center',gap:6,cursor:'pointer',userSelect:'none',padding:'3px 6px',borderRadius:5,background:isOpen?'rgba(47,95,224,0.16)':'transparent',transition:'background 0.12s'},
                  onClick:e=>openFilterAt(col.key,e)
                },
                  col.label,
                  React.createElement('span',{style:{display:'inline-flex',alignItems:'center',justifyContent:'center',width:14,height:14,borderRadius:3,background:active?'var(--accent)':'transparent',color:active?'#1a1410':'var(--text3)',fontSize:8}},'▾')
                )
              );
            }),
            React.createElement('th',{style:{position:'sticky',top:0,zIndex:4,background:'var(--th-bg)'}})
          )),
          React.createElement('tbody',null,filtered.map((r,ri)=>React.createElement('tr',{key:r.id,style:selected.has(r.id)?{background:'rgba(47,95,224,0.06)'}:undefined},
            React.createElement('td',{style:{position:'sticky',left:0,zIndex:2,background:'var(--bg2)'}},React.createElement('input',{type:'checkbox',checked:selected.has(r.id),onChange:()=>toggleSelect(r.id)})),
            React.createElement('td',{'data-xr':ri,'data-xc':0,style:{whiteSpace:'nowrap',position:'sticky',left:32,zIndex:2,borderRight:'2px solid var(--accent)',background:opaqueStickyBg(cellRange.isSelected(ri,0)?'rgba(47,95,224,0.35)':null)}},r.transactionDate),
            React.createElement('td',{'data-xr':ri,'data-xc':1,style:{whiteSpace:'nowrap',background:cellRange.isSelected(ri,1)?'rgba(47,95,224,0.12)':undefined}},r.valueDate),
            React.createElement('td',{'data-xr':ri,'data-xc':2,style:{minWidth:220,background:cellRange.isSelected(ri,2)?'rgba(47,95,224,0.12)':undefined}},r.description||'—'),
            React.createElement('td',{'data-xr':ri,'data-xc':3,style:{whiteSpace:'nowrap',background:cellRange.isSelected(ri,3)?'rgba(47,95,224,0.12)':undefined}},r.refNo||'—'),
            React.createElement('td',{'data-xr':ri,'data-xc':4,style:{color:r.debit?'var(--red)':'var(--text3)',whiteSpace:'nowrap',background:cellRange.isSelected(ri,4)?'rgba(47,95,224,0.12)':undefined}},r.debit?money(r.debit):'—'),
            React.createElement('td',{'data-xr':ri,'data-xc':5,style:{color:r.credit?'var(--green)':'var(--text3)',whiteSpace:'nowrap',background:cellRange.isSelected(ri,5)?'rgba(47,95,224,0.12)':undefined}},r.credit?money(r.credit):'—'),
            React.createElement('td',{'data-xr':ri,'data-xc':6,style:{fontWeight:600,whiteSpace:'nowrap',background:cellRange.isSelected(ri,6)?'rgba(47,95,224,0.12)':undefined}},money(r.closingBalance)),
            (()=>{
              // "Vendor Name" — the primary picker for who this transaction actually belongs to.
              // Nature is now its own separate column (data-xc 8) instead of a secondary select
              // nested in this cell. Picking a real vendor above still auto-sets Nature to
              // "Vendor Payment" via updateVendorPick.
              const autoName=autoVendorNameFor(r);
              const sortedVendors=vendors.slice().sort((a,b)=>a.name.localeCompare(b.name));
              const sortedEmployees=employees.slice().sort((a,b)=>a.name.localeCompare(b.name));
              const isEmployeeNature=r.nature==='Salary'||r.nature==='Incentive'||r.nature==='Daily Incentive'||r.nature==='Advance Salary';
              return React.createElement('td',{'data-xr':ri,'data-xc':7,style:{minWidth:190,background:cellRange.isSelected(ri,7)?'rgba(47,95,224,0.12)':undefined}},
                React.createElement('select',{
                  className:'form-control',
                  value:r.vendorOverride!=null?r.vendorOverride:'',
                  onChange:e=>updateVendorPick(r.id,e.target.value),
                  style:{padding:'6px 8px',fontSize:11}
                },
                  React.createElement('option',{value:''},'Auto: '+(autoName||'no match')),
                  React.createElement('option',{value:'__none__'},'— No vendor —'),
                  // Salary/Incentive/Daily Incentive/Advance Salary rows only ever settle against
                  // an employee, never a vendor — so the Vendors group is hidden entirely for
                  // those Natures instead of padding the list with irrelevant options.
                  isEmployeeNature
                    ?React.createElement('optgroup',{label:'Employees'},sortedEmployees.map(e=>React.createElement('option',{key:e.id,value:'EMP:'+e.id},e.name)))
                    :React.createElement('optgroup',{label:'Vendors'},sortedVendors.map(v=>React.createElement('option',{key:v.id,value:v.name},v.name)))
                )
              );
            })(),
            React.createElement('td',{'data-xr':ri,'data-xc':8,style:{minWidth:165,background:cellRange.isSelected(ri,8)?'rgba(47,95,224,0.12)':undefined}},React.createElement('select',{className:'form-control',value:r.nature,onChange:e=>update(r.id,'nature',e.target.value),style:{padding:'6px 8px',fontSize:11}},natures.map(n=>React.createElement('option',{key:n,value:n},n||'Select Nature')))),
            React.createElement('td',{'data-xr':ri,'data-xc':9,style:{minWidth:150,background:cellRange.isSelected(ri,9)?'rgba(47,95,224,0.12)':undefined}},React.createElement('input',{type:'date',className:'form-control',value:toISO(r.cradleeDate),onChange:e=>update(r.id,'cradleeDate',e.target.value?fmtDate(e.target.value):''),style:{padding:'6px 8px',fontSize:11}})),
            (()=>{
              // "O/S Invoices" — reads the vendor OR employee resolved from the column above.
              // Vendor Payment rows show that vendor's open Vendor Sheet invoices, ready to link
              // (or "+ Add Invoice" if none exist yet). Salary/Incentive rows show that employee's
              // Salary/Incentive Outstanding instead, sourced from Salary Working's / Incentive
              // Working's own Payment Status — click to settle one or both components at once,
              // since a single bank transfer sometimes covers both for the same employee. Doesn't
              // apply to credit rows, which never settle against a payable.
              if(!(r.debit>0)){
                return React.createElement('td',{'data-xr':ri,'data-xc':10,style:{minWidth:170,color:'var(--text3)',fontSize:11,background:cellRange.isSelected(ri,10)?'rgba(47,95,224,0.12)':undefined}},'—');
              }
              const vendor=resolvedVendorFor(r);
              const employee=resolvedEmployeeFor(r);
              let body;
              if(r.linkedInvoice&&r.linkedInvoice.startsWith('due|')){
                // Linked from the Due Date Tracker's own "🔗 Link with Bank Statement" (PF/ESIC/
                // TDS/Salary/Incentive/Vendor Payment) — not a Vendor Sheet invoice key, so this
                // jumps back to Due Dates instead of trying to unlink an invoice that isn't there.
                body=onNavTab
                  ?React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',fontSize:10.5},title:'Linked to a Due Date Tracker item — click to jump there',onClick:()=>onNavTab('due-dates')},'🔗 Due Date item')
                  :React.createElement('span',{style:{color:'var(--green)',fontSize:10.5}},'🔗 Due Date item');
              }else if(r.linkedInvoice){
                const invNos=r.linkedInvoice.split(',').map(k=>k.split('|')[1]||k);
                const label=invNos.length>1?(invNos.length+' invoices'):invNos[0];
                body=React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',fontSize:10.5},title:'Linked to '+invNos.join(', ')+' — click to unlink',onClick:()=>unlinkRow(r)},'🔗 Linked '+label);
              }else if(r.linkedEmployeePay&&r.linkedEmployeePay.length){
                const lp=r.linkedEmployeePay;
                const total=lp.reduce((s,e)=>s+e.salary+e.incentive+(e.dailyIncentive||0),0);
                const label=lp.length>1?(lp.length+' employees · '+money(total)):(()=>{
                  const parts=[];
                  if(lp[0].salary>0)parts.push('Salary '+money(lp[0].salary));
                  if(lp[0].incentive>0)parts.push('Incentive '+money(lp[0].incentive));
                  if(lp[0].dailyIncentive>0)parts.push('Daily Inc. '+money(lp[0].dailyIncentive));
                  return parts.join(' + ');
                })();
                body=React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',fontSize:10.5},title:'Recorded for '+lp.map(e=>e.employeeName).join(', ')+' — '+money(total)+' total — click to unlink',onClick:()=>unlinkEmployeePay(r)},'🔗 '+label);
              }else if(r.linkedAdvance&&r.linkedAdvance.length){
                const la=r.linkedAdvance;
                const total=la.reduce((s,a)=>s+a.amount,0);
                const label=la.length>1?(la.length+' employees · '+money(total)):money(total);
                body=React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',fontSize:10.5},title:'Advance recorded for '+la.map(a=>a.employeeName).join(', ')+' — '+money(total)+' total, added to the Advances sheet — click to unlink',onClick:()=>unlinkAdvance(r)},'🔗 Advance '+label);
              }else if(employee&&r.nature==='Advance Salary'){
                const candidates=advanceCandidatesFor(employee.name);
                body=candidates.length
                  ?React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:10.5},title:candidates.length+' existing Advance'+(candidates.length>1?'s':'')+' for '+employee.name+' not yet tied to a bank transaction — link this payment to '+(candidates.length>1?'one of them':'it')+', or record a new one instead',onClick:()=>openAdvanceModal(r,employee)},'🔗 '+candidates.length+' to link · '+money(candidates.reduce((s,a)=>s+(Number(a.outstanding!=null?a.outstanding:a.amount)||0),0)))
                  :React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:10.5},title:'Record this as a new Advance for '+employee.name+' — creates an Active, Bank Transfer entry on the Advances sheet, or add more employees if this transfer covers several people at once',onClick:()=>openAdvanceModal(r,employee)},'+ Record Advance: '+money(r.debit));
              }else if(employee){
                const period=periodFromTransactionDate(r.transactionDate);
                if(!period){
                  body=React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)'}},'Set Transaction Date');
                }else{
                  const salaryOS=employeeSalaryOutstandingFor(salonId,employee.id,period.year,period.month);
                  const incentiveOS=employeeIncentiveOutstandingFor(salonId,employee.id,period.year,period.month);
                  const dailyIncentiveOS=employeeDailyIncentiveOutstandingFor(salonId,employee.id,period.year,period.month);
                  if(salaryOS<=0&&incentiveOS<=0&&dailyIncentiveOS<=0){
                    body=React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)'}},'Already Paid');
                  }else{
                    let primaryOS,primaryLabel;
                    if(r.nature==='Incentive'){primaryOS=incentiveOS;primaryLabel='Incentive O/S';}
                    else if(r.nature==='Daily Incentive'){primaryOS=dailyIncentiveOS;primaryLabel='Daily Incentive O/S';}
                    else{primaryOS=salaryOS;primaryLabel='Salary O/S';}
                    const otherParts=[];
                    if(r.nature!=='Salary'&&salaryOS>0)otherParts.push('Salary');
                    if(r.nature!=='Incentive'&&incentiveOS>0)otherParts.push('Incentive');
                    if(r.nature!=='Daily Incentive'&&dailyIncentiveOS>0)otherParts.push('Daily Incentive');
                    body=React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:10.5},
                      title:'Settle '+employee.name+'\u2019s Salary/Incentive/Daily Incentive for '+MONTH_SHORT[period.month]+' '+period.year+' — tick as many as this one payment covers, or add more employees if this transfer covers several people at once',
                      onClick:()=>openEmployeePayModal(r,employee)},
                      primaryLabel+': '+money(primaryOS)+(otherParts.length?' · +'+otherParts.join(' +'):''));
                  }
                }
              }else if(vendor){
                const openInv=vendorInvoices.filter(inv=>inv.vendorId===vendor.id&&invBalance(inv)>0);
                if(openInv.length){
                  const openTotal=openInv.reduce((s,inv)=>s+invBalance(inv),0);
                  body=React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:10.5},title:'View and link '+vendor.name+'\u2019s open invoices',onClick:()=>openLinkModal(r)},openInv.length+' open · '+money(openTotal));
                }else{
                  body=React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:10.5},title:'No outstanding invoice for '+vendor.name+' — add one for this payment',onClick:()=>openAddInvoiceModal(r,vendor)},'+ Add Invoice');
                }
              }else if(r.nature==='Advance Salary'){
                // No single employee auto-matched — common for a batch advance transfer covering
                // several employees at once. Offer to build the employee list by hand instead of
                // forcing a pick in the column above.
                body=React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:10.5},title:'No single employee matched — add each employee this Advance covers',onClick:()=>openAdvanceModal(r,null)},'👥 Record Advance (multiple)');
              }else if(r.nature==='Salary'||r.nature==='Incentive'||r.nature==='Daily Incentive'){
                // No single employee auto-matched from the Description — common for a combined
                // payroll NEFT that names a batch reference rather than any one person. Offer to
                // build the employee list by hand instead of forcing a pick in the column above.
                body=React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:10.5},title:'No single employee matched — add each employee this payment covers',onClick:()=>openEmployeePayModal(r,null)},'👥 Split Between Employees');
              }else{
                body=React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)'}},'— Pick a vendor —');
              }
              return React.createElement('td',{'data-xr':ri,'data-xc':10,style:{minWidth:170,background:cellRange.isSelected(ri,10)?'rgba(47,95,224,0.12)':undefined}},body);
            })(),
            React.createElement('td',null,
              React.createElement('button',{'aria-label':'Delete',className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},title:'Delete this transaction',onClick:()=>{if(confirm('Delete this transaction?'))setRows(prev=>prev.filter(x=>x.id!==r.id));}},React.createElement(IconTrash,{size:14}))
            )
          )))
        ))
      )
    ),
    showRulesModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowRulesModal(false)},
      React.createElement('div',{className:'modal',style:{width:640,maxHeight:'85vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'How Nature, Date as per Cradlee & Vendor Name are worked out'),
        React.createElement('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:16,lineHeight:1.6}},'These rules run automatically on import, and again whenever you click "🪄 Re-classify Nature & Dates". Anything you set by hand always wins — none of this overrides a value you\'ve typed in yourself, except Re-classify, which is explicitly for overwriting.'),

        React.createElement('div',{style:{fontSize:12.5,fontWeight:700,color:'var(--accent)',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.04em'}},'1. Nature & Date as per Cradlee — credit rows'),
        React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:8}},'Only runs on rows where Credit > 0. Checked in this order — first match wins. Note: "NEFT" is a broad match — if any of your NEFT credits aren\'t card settlements (e.g. a refund or an advance received by NEFT), those would get tagged Card Settlement too and need a manual fix.'),
        React.createElement('table',{style:{width:'100%',fontSize:12,marginBottom:16,borderCollapse:'collapse'}},
          React.createElement('thead',null,React.createElement('tr',null,
            React.createElement('th',{style:{textAlign:'left',padding:'6px 8px',color:'var(--text3)',fontSize:10.5,textTransform:'uppercase',borderBottom:'1px solid var(--border)'}},'If Description contains'),
            React.createElement('th',{style:{textAlign:'left',padding:'6px 8px',color:'var(--text3)',fontSize:10.5,textTransform:'uppercase',borderBottom:'1px solid var(--border)'}},'Nature'),
            React.createElement('th',{style:{textAlign:'left',padding:'6px 8px',color:'var(--text3)',fontSize:10.5,textTransform:'uppercase',borderBottom:'1px solid var(--border)'}},'Date as per Cradlee')
          )),
          React.createElement('tbody',null,
            [['"UPI SETTLEMENT"','UPI Settlement','Value Date (or Transaction Date) − 1 day'],
             ['"CARDS SETTL"','Card Settlement','Value Date (or Transaction Date) − 1 day'],
             ['"POS PYMT"','Card Settlement','Value Date (or Transaction Date) − 1 day'],
             ['"PAYTM PAYMENTS"','Card Settlement','Value Date (or Transaction Date) − 1 day'],
             ['"NEFT"','Card Settlement','Value Date (or Transaction Date) − 1 day'],
             ['"ICICIPOS"','Card Settlement','Value Date (or Transaction Date) − 1 day'],
             ['"SALONSURF" or "SALON SURF"','Card Settlement','Value Date (or Transaction Date) − 1 day'],
             ['"UPI" (on its own, no "SETTLEMENT")','UPI Settlement','Same as Value/Transaction Date, no offset']
            ].map(([a,b,c])=>React.createElement('tr',{key:a},
              React.createElement('td',{style:{padding:'6px 8px',borderBottom:'1px solid var(--border)',color:'var(--text2)'}},a),
              React.createElement('td',{style:{padding:'6px 8px',borderBottom:'1px solid var(--border)'}},React.createElement('span',{className:'badge badge-blue'},b)),
              React.createElement('td',{style:{padding:'6px 8px',borderBottom:'1px solid var(--border)',color:'var(--text3)',fontSize:11}},c)
            ))
          )
        ),

        React.createElement('div',{style:{fontSize:12.5,fontWeight:700,color:'var(--accent)',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.04em'}},'2. Nature — debit rows'),
        React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:8}},'Only runs on rows where Debit > 0. Date as per Cradlee is left blank for these — Nature only. "Salary/Sal", "Incentive/Inc", "CBDT/TDS" and "GST" only match as whole words (so "SALONSURF" won\'t trigger "Sal", and "GSTMSME"/"CBDTMSME" need their own specific rule below since they\'re one continuous word); the rest match anywhere in the text.'),
        React.createElement('table',{style:{width:'100%',fontSize:12,marginBottom:16,borderCollapse:'collapse'}},
          React.createElement('thead',null,React.createElement('tr',null,
            React.createElement('th',{style:{textAlign:'left',padding:'6px 8px',color:'var(--text3)',fontSize:10.5,textTransform:'uppercase',borderBottom:'1px solid var(--border)'}},'If Description contains'),
            React.createElement('th',{style:{textAlign:'left',padding:'6px 8px',color:'var(--text3)',fontSize:10.5,textTransform:'uppercase',borderBottom:'1px solid var(--border)'}},'Nature')
          )),
          React.createElement('tbody',null,
            [['"Salary" or "Sal" (whole word)','Salary'],
             ['"Incentive" or "Inc" (whole word)','Incentive'],
             ['"CBDTMSME"','TDS'],
             ['"DTAX"','TDS'],
             ['"CBDT" or "TDS" (whole word)','TDS'],
             ['"GSTMSME"','GST'],
             ['"GST" (whole word)','GST'],
             ['"ESIC"','ESIC Payment'],
             ['"Bescom"','Electricity Expenses'],
             ['"Electricity"','Electricity Expenses'],
             ['"Airtel"','Telephone & Internet Expenses'],
             ['"DG Rent"','DG Rent'],
             ['"Royalty"','Royalty'],
             ['"EDC Rental"','Bank Charges'],
             ['"Settlement Charge"','Bank Charges'],
             ['"Laundry"','Drycleaning Expenses'],
             ['Matches a name in your Vendor List','Vendor Payment']
            ].map(([a,b])=>React.createElement('tr',{key:a},
              React.createElement('td',{style:{padding:'6px 8px',borderBottom:'1px solid var(--border)',color:'var(--text2)'}},a),
              React.createElement('td',{style:{padding:'6px 8px',borderBottom:'1px solid var(--border)'}},React.createElement('span',{className:'badge badge-red'},b))
            ))
          )
        ),

        React.createElement('div',{style:{fontSize:12.5,fontWeight:700,color:'var(--accent)',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.04em'}},'3. Vendor Name'),
        React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:8}},'Re-evaluated live on every render — it always reflects your current Vendor List and Employee list, not a one-time snapshot. Checked in this order:'),
        React.createElement('table',{style:{width:'100%',fontSize:12,borderCollapse:'collapse'}},
          React.createElement('thead',null,React.createElement('tr',null,
            React.createElement('th',{style:{textAlign:'left',padding:'6px 8px',color:'var(--text3)',fontSize:10.5,textTransform:'uppercase',borderBottom:'1px solid var(--border)'}},'Condition'),
            React.createElement('th',{style:{textAlign:'left',padding:'6px 8px',color:'var(--text3)',fontSize:10.5,textTransform:'uppercase',borderBottom:'1px solid var(--border)'}},'Vendor Name')
          )),
          React.createElement('tbody',null,
            [['Nature = UPI Settlement and Description has "UPI SETTLEMENT"','NA'],
             ['Nature = Card Settlement and Description has "CARDS SETTL"','NA'],
             ['Nature = Card Settlement and Description has "SALONSURF"/"SALON SURF"','NA'],
             ['Nature = Salary and Description has "Salary"/"Sal"','The matched employee\'s name (or "Employee (unmatched)")'],
             ['Nature = Rent and Description has "Rent"','The matched landlord from your Vendor List (or "Landlord")'],
             ['None of the above','Best match from your Vendor List, or blank if nothing matches']
            ].map(([a,b])=>React.createElement('tr',{key:a},
              React.createElement('td',{style:{padding:'6px 8px',borderBottom:'1px solid var(--border)',color:'var(--text2)',fontSize:11.5}},a),
              React.createElement('td',{style:{padding:'6px 8px',borderBottom:'1px solid var(--border)',fontWeight:600,color:'var(--text)'}},b)
            ))
          )
        ),
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:14,lineHeight:1.6}},'Every one of these can be overridden by hand — the Vendor Name dropdown (pick a different vendor, choose "— No vendor —", or "Auto: …" to go back to automatic), the Nature dropdown, and the Date as per Cradlee date picker.'),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-primary',onClick:()=>setShowRulesModal(false)},'Close')
        )
      )
    ),
    openFilterCol&&(()=>{
      const col=FILTER_COLS.find(c=>c.key===openFilterCol);
      if(!col)return null;
      const active=columnFilters[col.key];
      const popStyle={position:'fixed',top:filterPos.top,left:filterPos.left,zIndex:1000,width:280,background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:10,boxShadow:'0 12px 32px rgba(0,0,0,0.45),0 2px 8px rgba(0,0,0,0.3)',overflow:'hidden',fontFamily:'inherit'};

      // ── NUMBER columns (Debit/Credit/Closing Balance) — a value-by-value checklist is useless
      // when almost every amount is different. Min/Max range is what's actually practical here. ──
      if(col.type==='number'){
        const rmin=(active&&active.mode==='range')?active.min:'';
        const rmax=(active&&active.mode==='range')?active.max:'';
        const matchCount=rows.filter(r=>{
          const n=col.raw(r);
          if(rmin!==''&&rmin!=null&&n<Number(rmin))return false;
          if(rmax!==''&&rmax!=null&&n>Number(rmax))return false;
          return true;
        }).length;
        const setRange=(patch)=>setColumnFilters(prev=>({...prev,[col.key]:{mode:'range',min:rmin,max:rmax,...patch}}));
        return ReactDOM.createPortal(
          React.createElement('div',{className:'autofilter-popover',style:popStyle},
            React.createElement('div',{style:{padding:'12px'}},
              React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text)',marginBottom:10}},col.label+' — amount range'),
              React.createElement('div',{style:{display:'flex',gap:8,marginBottom:4}},
                React.createElement('div',{style:{flex:1}},
                  React.createElement('label',{style:{fontSize:10,color:'var(--text3)',display:'block',marginBottom:3}},'Min ₹'),
                  React.createElement('input',{type:'number',value:rmin,autoFocus:true,placeholder:'0',onChange:e=>setRange({min:e.target.value}),
                    style:{width:'100%',padding:'7px 8px',fontSize:12,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)'}})
                ),
                React.createElement('div',{style:{flex:1}},
                  React.createElement('label',{style:{fontSize:10,color:'var(--text3)',display:'block',marginBottom:3}},'Max ₹'),
                  React.createElement('input',{type:'number',value:rmax,placeholder:'No limit',onChange:e=>setRange({max:e.target.value}),
                    style:{width:'100%',padding:'7px 8px',fontSize:12,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)'}})
                )
              ),
              React.createElement('div',{style:{fontSize:10.5,color:(rmin!==''||rmax!=='')?'var(--accent)':'var(--text3)',marginTop:6,fontWeight:600}},
                (rmin!==''||rmax!=='')?(matchCount+' of '+rows.length+' rows match'):'Set a min and/or max to filter'),
              React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:12}},
                React.createElement('button',{onClick:()=>clearColumnFilter(col.key),style:{fontSize:10.5,fontWeight:600,color:'var(--text3)',background:'transparent',border:'none',cursor:'pointer'}},'Clear filter'),
                React.createElement('button',{className:'btn btn-primary btn-sm',style:{padding:'5px 16px',fontSize:11.5},onClick:()=>setOpenFilterCol(null)},'OK')
              )
            )
          ),
          document.body
        );
      }

      // ── DATE columns — quick presets cover the common cases (Today, This Week, This Month…)
      // plus a custom From/To range. Picking exact individual dates one at a time was never
      // practical for a running bank statement. ──
      if(col.type==='date'){
        const todayD=new Date();
        const iso=(d)=>d.toISOString().slice(0,10);
        const daysAgo=(n)=>{const d=new Date();d.setDate(d.getDate()-n);return iso(d);};
        const startOfWeek=()=>{const d=new Date();const day=d.getDay();d.setDate(d.getDate()-(day===0?6:day-1));return iso(d);};
        const startOfMonth=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01';};
        const todayISO=iso(todayD);
        const dfrom=(active&&active.mode==='daterange')?active.from:'';
        const dto=(active&&active.mode==='daterange')?active.to:'';
        const setDateRange=(from,to)=>setColumnFilters(prev=>({...prev,[col.key]:{mode:'daterange',from,to}}));
        const presets=[
          {label:'Today',from:todayISO,to:todayISO},
          {label:'Yesterday',from:daysAgo(1),to:daysAgo(1)},
          {label:'This week',from:startOfWeek(),to:todayISO},
          {label:'This month',from:startOfMonth(),to:todayISO},
          {label:'Last 7 days',from:daysAgo(6),to:todayISO},
          {label:'Last 30 days',from:daysAgo(29),to:todayISO}
        ];
        const matchCount=rows.filter(r=>{
          const d=col.raw(r);
          if(!d)return false;
          if(dfrom&&d<dfrom)return false;
          if(dto&&d>dto)return false;
          return true;
        }).length;
        return ReactDOM.createPortal(
          React.createElement('div',{className:'autofilter-popover',style:popStyle},
            React.createElement('div',{style:{padding:'12px'}},
              React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text)',marginBottom:8}},col.label),
              React.createElement('div',{style:{display:'flex',flexWrap:'wrap',gap:5,marginBottom:10}},
                presets.map(p=>React.createElement('button',{key:p.label,
                  onClick:()=>setDateRange(p.from,p.to),
                  style:{fontSize:10.5,padding:'4px 8px',borderRadius:6,border:'1px solid '+(dfrom===p.from&&dto===p.to?'var(--accent)':'var(--border2)'),background:dfrom===p.from&&dto===p.to?'rgba(47,95,224,0.16)':'transparent',color:dfrom===p.from&&dto===p.to?'var(--accent)':'var(--text2)',cursor:'pointer'}
                },p.label))
              ),
              React.createElement('div',{style:{display:'flex',gap:8}},
                React.createElement('div',{style:{flex:1}},
                  React.createElement('label',{style:{fontSize:10,color:'var(--text3)',display:'block',marginBottom:3}},'From'),
                  React.createElement('input',{type:'date',value:dfrom,onChange:e=>setDateRange(e.target.value,dto),
                    style:{width:'100%',padding:'6px 8px',fontSize:11.5,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)'}})
                ),
                React.createElement('div',{style:{flex:1}},
                  React.createElement('label',{style:{fontSize:10,color:'var(--text3)',display:'block',marginBottom:3}},'To'),
                  React.createElement('input',{type:'date',value:dto,onChange:e=>setDateRange(dfrom,e.target.value),
                    style:{width:'100%',padding:'6px 8px',fontSize:11.5,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)'}})
                )
              ),
              React.createElement('div',{style:{fontSize:10.5,color:(dfrom||dto)?'var(--accent)':'var(--text3)',marginTop:8,fontWeight:600}},
                (dfrom||dto)?(matchCount+' of '+rows.length+' rows match'):'Pick a preset or a custom range'),
              React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:12}},
                React.createElement('button',{onClick:()=>clearColumnFilter(col.key),style:{fontSize:10.5,fontWeight:600,color:'var(--text3)',background:'transparent',border:'none',cursor:'pointer'}},'Clear filter'),
                React.createElement('button',{className:'btn btn-primary btn-sm',style:{padding:'5px 16px',fontSize:11.5},onClick:()=>setOpenFilterCol(null)},'OK')
              )
            )
          ),
          document.body
        );
      }

      // ── TEXT / ENUM columns — a search box that always works the same way regardless of how
      // many distinct values there are: it narrows the checklist below, AND if nothing's checked
      // when you close it, the typed text itself becomes a "contains" filter. So a short list
      // (Nature) works exactly like before — just check the values you want — and a long list
      // (Description) works by typing without needing to hunt through hundreds of checkboxes. ──
      const allVals=uniqueValuesFor(col);
      const visibleVals=allVals.filter(v=>v.value.toLowerCase().includes(filterSearch.toLowerCase()));
      const isChecked=(v)=>!active||(active instanceof Set&&active.has(v));
      const selectedCount=active instanceof Set?active.size:allVals.length;
      const containsText=(active&&active.mode==='contains')?active.text:'';
      const CHECKLIST_LIMIT=30;
      const showAsChecklist=allVals.length<=CHECKLIST_LIMIT;
      return ReactDOM.createPortal(
        React.createElement('div',{className:'autofilter-popover',style:popStyle},
          showAsChecklist
            ?React.createElement(React.Fragment,null,
                React.createElement('div',{style:{padding:'10px 12px',borderBottom:'1px solid var(--border)',background:'var(--bg3)'}},
                  React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text)',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}},
                    React.createElement('span',null,col.label),
                    React.createElement('span',{style:{fontSize:10,fontWeight:500,color:'var(--text3)'}},selectedCount+' of '+allVals.length)
                  ),
                  React.createElement('div',{style:{position:'relative'}},
                    React.createElement('span',{style:{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',fontSize:11,color:'var(--text3)'}},React.createElement(IconSearch,{size:13})),
                    React.createElement('input',{value:filterSearch,onChange:e=>setFilterSearch(e.target.value),placeholder:'Search values…',autoFocus:true,
                      style:{width:'100%',padding:'6px 8px 6px 24px',fontSize:12,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)'}})
                  )
                ),
                React.createElement('div',{style:{display:'flex',gap:8,padding:'8px 12px',borderBottom:'1px solid var(--border)'}},
                  React.createElement('button',{onClick:()=>clearColumnFilter(col.key),style:{flex:1,padding:'4px 0',fontSize:10.5,fontWeight:600,color:'var(--accent)',background:'transparent',border:'none',cursor:'pointer'}},'Select All'),
                  React.createElement('button',{onClick:()=>setColumnFilters(prev=>({...prev,[col.key]:new Set()})),style:{flex:1,padding:'4px 0',fontSize:10.5,fontWeight:600,color:'var(--text3)',background:'transparent',border:'none',cursor:'pointer'}},'Clear All')
                ),
                React.createElement('div',{style:{maxHeight:240,overflowY:'auto',padding:'6px 4px'}},
                  visibleVals.length===0
                    ?React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',padding:'14px 12px',textAlign:'center'}},'No matching values')
                    :visibleVals.map(({value,count})=>React.createElement('label',{key:value,
                        style:{display:'flex',alignItems:'center',gap:8,fontSize:12,padding:'6px 8px',cursor:'pointer',color:'var(--text2)',borderRadius:6},
                        onMouseEnter:e=>e.currentTarget.style.background='rgba(47,95,224,0.08)',
                        onMouseLeave:e=>e.currentTarget.style.background='transparent'
                      },
                        React.createElement('input',{type:'checkbox',checked:isChecked(value),onChange:()=>toggleFilterValue(col.key,value,allVals.map(v=>v.value))}),
                        React.createElement('span',{style:{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},value),
                        React.createElement('span',{style:{fontSize:10,color:'var(--text3)'}},count)
                      ))
                ),
                React.createElement('div',{style:{display:'flex',justifyContent:'flex-end',padding:'8px 12px',borderTop:'1px solid var(--border)',background:'var(--bg3)'}},
                  React.createElement('button',{className:'btn btn-primary btn-sm',style:{padding:'5px 16px',fontSize:11.5},onClick:()=>setOpenFilterCol(null)},'OK')
                )
              )
            :(()=>{
                const matchCount=containsText?rows.filter(r=>String(col.get(r)).toLowerCase().includes(containsText.toLowerCase())).length:rows.length;
                return React.createElement('div',{style:{padding:'12px'}},
                  React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text)',marginBottom:6}},col.label),
                  React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:10,lineHeight:1.5}},
                    allVals.length+' different values here — too many to list usefully, so type to filter by what '+col.label+' contains.'),
                  React.createElement('input',{
                    value:containsText,autoFocus:true,
                    onChange:e=>setColumnFilters(prev=>({...prev,[col.key]:{mode:'contains',text:e.target.value}})),
                    onKeyDown:e=>{if(e.key==='Enter')setOpenFilterCol(null);if(e.key==='Escape')setOpenFilterCol(null);},
                    placeholder:'e.g. UPI, SETTLEMENT, a vendor name…',
                    style:{width:'100%',padding:'8px 10px',fontSize:12,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)'}
                  }),
                  React.createElement('div',{style:{fontSize:10.5,color:containsText?'var(--accent)':'var(--text3)',marginTop:6,fontWeight:600}},
                    containsText?(matchCount+' of '+rows.length+' rows match — updates as you type'):'Type above to see the match count here'),
                  React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:12}},
                    React.createElement('button',{onClick:()=>clearColumnFilter(col.key),style:{fontSize:10.5,fontWeight:600,color:'var(--text3)',background:'transparent',border:'none',cursor:'pointer'}},'Clear filter'),
                    React.createElement('button',{className:'btn btn-primary btn-sm',style:{padding:'5px 16px',fontSize:11.5},onClick:()=>setOpenFilterCol(null)},'OK')
                  )
                );
              })()
        ),
        document.body
      );
    })(),
    linkRow&&React.createElement('div',{className:'modal-overlay',onClick:()=>setLinkRow(null)},
      React.createElement('div',{className:'modal',style:{width:560},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Link to Vendor Sheet Invoice'),
        React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14,fontSize:12}},
          React.createElement('div',{style:{color:'var(--text)',fontWeight:500}},linkRow.description),
          React.createElement('div',{style:{color:'var(--text3)',marginTop:2}},linkRow.transactionDate+' · Debit '+money(linkRow.debit)+(linkRow.refNo?' · Ref '+linkRow.refNo:''))
        ),
        React.createElement('div',{className:'form-group',style:{marginBottom:10}},
          React.createElement('label',null,'Vendor'),
          React.createElement('select',{className:'form-control',value:linkVendorId,onChange:e=>{setLinkVendorId(e.target.value);setLinkSelected(new Set());setLinkAllocations({});}},
            React.createElement('option',{value:''},'— Select Vendor —'),
            vendors.map(v=>React.createElement('option',{key:v.id,value:v.id},v.name))
          ),
          !linkVendorId&&React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:5}},'Couldn\'t auto-match a vendor from the description — pick one to see their outstanding invoices.')
        ),
        linkVendorId&&React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:8}},'Tick one or more invoices this payment settles — split a single debit across several bills by adjusting each amount below.'),
        React.createElement('div',{style:{maxHeight:280,overflowY:'auto'}},
          !linkVendorId?null:(()=>{
            const openInv=vendorInvoices.filter(inv=>inv.vendorId===linkVendorId&&invBalance(inv)>0);
            if(!openInv.length)return React.createElement('div',{style:{textAlign:'center',padding:24,color:'var(--text3)',fontSize:12}},
              React.createElement('div',{style:{marginBottom:10}},'No outstanding invoices for this vendor.'),
              React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>{const v=vendors.find(vv=>vv.id===linkVendorId);if(v)openAddInvoiceModal(linkRow,v);setLinkRow(null);}},'+ Add Invoice for this payment')
            );
            return openInv.map(inv=>{
              const bal=invBalance(inv);
              const key=inv.id;
              const checked=linkSelected.has(key);
              const allocatedAmt=Number(linkAllocations[key])||0;
              const closeMatch=checked&&Math.abs(allocatedAmt-bal)<1;
              return React.createElement('div',{key,
                style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',border:'1px solid '+(closeMatch?'var(--green)':(checked?'var(--accent)':'var(--border)')),borderRadius:'var(--r)',marginBottom:8,background:closeMatch?'rgba(76,175,125,0.08)':(checked?'rgba(47,95,224,0.06)':'transparent')}
              },
                React.createElement('label',{style:{display:'flex',alignItems:'center',gap:10,cursor:'pointer',flex:1,minWidth:0}},
                  React.createElement('input',{type:'checkbox',checked,onChange:()=>toggleInvoiceSelect(inv)}),
                  React.createElement('div',{style:{minWidth:0}},
                    React.createElement('div',{style:{fontWeight:500,color:'var(--text)',fontSize:12.5}},inv.invoiceNo||'(no invoice no.)'),
                    React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},inv.docNature+' · Due '+(inv.dueDate||'—')+' · Bal ₹'+bal.toLocaleString())
                  )
                ),
                checked
                  ?React.createElement('div',{style:{textAlign:'right'}},
                      React.createElement('input',{type:'number',className:'form-control',style:{width:110,padding:'6px 8px',fontSize:12,textAlign:'right'},value:linkAllocations[key]!=null?linkAllocations[key]:'',onChange:e=>setLinkAllocations({...linkAllocations,[key]:e.target.value})}),
                      closeMatch&&React.createElement('div',{style:{fontSize:10,color:'var(--green)',marginTop:2}},'Amount matches ✓')
                    )
                  :React.createElement('div',{style:{fontWeight:600,color:'var(--orange)',fontSize:12.5}},'₹'+bal.toLocaleString())
              );
            });
          })()
        ),
        linkSelected.size>0&&(()=>{
          const totalAllocated=Array.from(linkSelected).reduce((s,k)=>s+(Number(linkAllocations[k])||0),0);
          const debitAmt=Number(linkRow.debit)||0;
          const matches=Math.abs(totalAllocated-debitAmt)<1;
          return React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:12,padding:'8px 12px',background:'var(--bg3)',borderRadius:'var(--r)',marginTop:6}},
            React.createElement('span',{style:{color:'var(--text3)'}},linkSelected.size+' invoice'+(linkSelected.size===1?'':'s')+' selected'),
            React.createElement('span',{style:{fontWeight:700,color:matches?'var(--green)':'var(--text)'}},'₹'+totalAllocated.toLocaleString()+' of ₹'+debitAmt.toLocaleString()+(matches?' ✓':''))
          );
        })(),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setLinkRow(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',disabled:linkSelected.size===0,onClick:linkSelectedInvoices},'Link '+(linkSelected.size>1?linkSelected.size+' Invoices':'Invoice'))
        )
      )
    ),
    addInvoiceRow&&React.createElement('div',{className:'modal-overlay',onClick:()=>setAddInvoiceRow(null)},
      React.createElement('div',{className:'modal',style:{width:460},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Add Invoice for '+addInvoiceRow.vendor.name),
        React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14,fontSize:12}},
          React.createElement('div',{style:{color:'var(--text)',fontWeight:500}},addInvoiceRow.row.description),
          React.createElement('div',{style:{color:'var(--text3)',marginTop:2}},addInvoiceRow.row.transactionDate+' · Debit '+money(addInvoiceRow.row.debit))
        ),
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:14,lineHeight:1.6}},'No outstanding invoice found for this vendor — add one here. It\u2019ll be recorded as fully paid and linked straight to this transaction, since the debit itself is the payment evidence.'),
        React.createElement('div',{className:'form-row cols2',style:{marginBottom:12}},
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Invoice No *'),React.createElement('input',{className:'form-control',value:addInvoiceForm.invoiceNo,onChange:e=>setAddInvoiceForm(f=>({...f,invoiceNo:e.target.value})),placeholder:'e.g. INV-2026-045',autoFocus:true})),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Doc Nature'),React.createElement('select',{className:'form-control',value:addInvoiceForm.docNature,onChange:e=>setAddInvoiceForm(f=>({...f,docNature:e.target.value}))},['Tax Invoice','Invoice','Performa Invoice'].map(n=>React.createElement('option',{key:n,value:n},n))))
        ),
        React.createElement('div',{className:'form-row cols2',style:{marginBottom:16}},
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Invoice Date'),React.createElement('input',{type:'date',className:'form-control',value:addInvoiceForm.invoiceDate,onChange:e=>setAddInvoiceForm(f=>({...f,invoiceDate:e.target.value}))})),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Amount *'),React.createElement('input',{type:'number',className:'form-control',value:addInvoiceForm.amount,onChange:e=>setAddInvoiceForm(f=>({...f,amount:e.target.value}))}))
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setAddInvoiceRow(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:saveAddInvoice},'Add & Link Invoice')
        )
      )
    ),
    empPayRow&&(()=>{
      const{row,year,month}=empPayRow;
      // Which buckets this modal offers depends on the Nature the row was classified with —
      // a Salary or Incentive row settles Salary/Incentive only; a Daily Incentive row settles
      // only the four Daily Incentive categories (+ Other). They're never mixed in one screen,
      // so the modal always matches what the person actually picked under Nature.
      const showSalaryIncentive=row.nature!=='Daily Incentive';
      const showDailyIncentive=row.nature==='Daily Incentive';
      const lineFor=(line)=>{
        // comp is 'salary' | 'incentive' | a Daily Incentive category name. Flat components read/
        // write directly on the line; Daily Incentive ones read/write line.dailyIncentive[comp].
        const compRow=(comp,label,outstanding)=>{
          if(outstanding<=0)return null;
          const isDI=DAILY_INCENTIVE_CATEGORIES_ALL.includes(comp);
          const checked=isDI?line.dailyIncentive[comp].sel:(comp==='salary'?line.selSalary:line.selIncentive);
          const amtValue=isDI?line.dailyIncentive[comp].amt:(comp==='salary'?line.salaryAmt:line.incentiveAmt);
          const allocatedAmt=Number(amtValue)||0;
          const closeMatch=checked&&Math.abs(allocatedAmt-outstanding)<1;
          return React.createElement('div',{key:comp,
            style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',border:'1px solid '+(closeMatch?'var(--green)':(checked?'var(--accent)':'var(--border)')),borderRadius:'var(--r)',marginBottom:6,background:closeMatch?'rgba(76,175,125,0.08)':(checked?'rgba(47,95,224,0.06)':'transparent')}
          },
            React.createElement('label',{style:{display:'flex',alignItems:'center',gap:10,cursor:'pointer',flex:1,minWidth:0}},
              React.createElement('input',{type:'checkbox',checked,onChange:()=>toggleEmpLineComponent(line.employeeId,comp)}),
              React.createElement('div',null,
                React.createElement('div',{style:{fontWeight:500,color:'var(--text)',fontSize:12}},label),
                React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)'}},'Outstanding ₹'+outstanding.toLocaleString())
              )
            ),
            checked
              ?React.createElement('div',{style:{textAlign:'right'}},
                  React.createElement('input',{type:'number',className:'form-control',style:{width:100,padding:'5px 7px',fontSize:11.5,textAlign:'right'},value:amtValue!=null?amtValue:'',onChange:e=>updateEmpLineAmount(line.employeeId,comp,e.target.value)}),
                  closeMatch&&React.createElement('div',{style:{fontSize:10,color:'var(--green)',marginTop:2}},'Matches ✓')
                )
              :React.createElement('div',{style:{fontWeight:600,color:'var(--orange)',fontSize:12}},'₹'+outstanding.toLocaleString())
          );
        };
        const anyDIOutstanding=showDailyIncentive&&DAILY_INCENTIVE_CATEGORIES_ALL.some(cat=>line.dailyIncentive[cat].os>0);
        const nothingToShow=showSalaryIncentive?(line.salaryOS<=0&&line.incentiveOS<=0):!anyDIOutstanding;
        return React.createElement('div',{key:line.employeeId,style:{border:'1px solid var(--border)',borderRadius:'var(--r)',padding:10,marginBottom:10,background:'var(--bg3)'}},
          React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}},
            React.createElement('div',{style:{fontWeight:600,fontSize:12.5,color:'var(--text)'}},line.employeeName),
            React.createElement('span',{onClick:()=>removeEmpPayLine(line.employeeId),title:'Remove this employee from the payment',style:{cursor:'pointer',color:'var(--text3)',fontSize:11}},'✕ Remove')
          ),
          nothingToShow&&!showDailyIncentive
            ?React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},'Already Paid for '+MONTH_SHORT[month]+' '+year+'.')
            :React.createElement(React.Fragment,null,
                showSalaryIncentive&&compRow('salary','Salary Outstanding',line.salaryOS),
                showSalaryIncentive&&compRow('incentive','Incentive Outstanding',line.incentiveOS),
                showDailyIncentive&&anyDIOutstanding&&React.createElement('div',{style:{fontSize:10,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.04em',margin:'8px 0 4px'}},'Daily Incentive'),
                showDailyIncentive&&!anyDIOutstanding&&React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:6}},'No Daily Incentive on Bank mode found for '+line.employeeName+' in '+MONTH_SHORT[month]+' '+year+'.'),
                showDailyIncentive&&DAILY_INCENTIVE_CATEGORIES_ALL.map(cat=>compRow(cat,cat==='Other'?'Other Daily Incentive':cat,line.dailyIncentive[cat].os)),
                showDailyIncentive&&anyDIOutstanding&&React.createElement('div',{style:{display:'flex',gap:6,alignItems:'center',marginTop:4,padding:'6px 8px',background:'var(--bg2)',border:'1px dashed var(--border2)',borderRadius:'var(--r)'}},
                  React.createElement('input',{type:'number',className:'form-control',style:{flex:1,padding:'5px 7px',fontSize:11.5},placeholder:'Total amount to split across heads',value:diSplitAmt[line.employeeId]!=null?diSplitAmt[line.employeeId]:'',onChange:e=>setDiSplitAmt(prev=>({...prev,[line.employeeId]:e.target.value}))}),
                  React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:10.5,whiteSpace:'nowrap'},onClick:()=>splitDailyIncentiveAcrossCategories(line.employeeId)},'Split')
                ),
                showDailyIncentive&&React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:10.5,marginTop:6},title:'Add a Daily Incentive entry for '+line.employeeName+' straight from here — it\u2019ll be recorded on the Daily Incentive Sheet, Mode Bank, and its outstanding shown above right away',onClick:()=>openAddDIEntry(line.employeeId,line.employeeName,year,month)},'+ Add Daily Incentive Entry')
              )
        );
      };
      const totalAllocated=empPayLinesTotal(empPayLines);
      const anySelected=empPayLines.some(l=>l.selSalary||l.selIncentive||DAILY_INCENTIVE_CATEGORIES_ALL.some(cat=>l.dailyIncentive[cat].sel));
      const addableEmployees=employees.filter(e=>!empPayLines.some(l=>l.employeeId===e.id)).sort((a,b)=>a.name.localeCompare(b.name));
      return React.createElement('div',{className:'modal-overlay',onClick:()=>setEmpPayRow(null)},
        React.createElement('div',{className:'modal',style:{width:560,maxHeight:'82vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
          React.createElement('div',{className:'modal-title'},'Settle Pay'),
          React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14,fontSize:12}},
            React.createElement('div',{style:{color:'var(--text)',fontWeight:500}},row.description),
            React.createElement('div',{style:{color:'var(--text3)',marginTop:2}},row.transactionDate+' · Debit '+money(row.debit)+(row.refNo?' · Ref '+row.refNo:''))
          ),
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:12,lineHeight:1.6}},
            (row.nature==='Daily Incentive'
              ?'Tick whichever Daily Incentive categories this payment covers for each employee'
              :'Tick Salary and/or Incentive for each employee this payment covers')
            +' — split the amount below if it settles more than one for the same person, or add more employees below if this one transfer is a combined payroll payment for several people at once.'),
          empPayLines.map(lineFor),
          React.createElement('div',{className:'form-group',style:{marginBottom:14}},
            React.createElement('select',{className:'form-control',value:'',onChange:e=>{if(e.target.value)addEmpPayLine(e.target.value);}},
              React.createElement('option',{value:''},addableEmployees.length?'+ Add another employee to this payment…':'All employees already added'),
              addableEmployees.map(e=>React.createElement('option',{key:e.id,value:e.id},e.name))
            )
          ),
          anySelected&&React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:12,padding:'8px 12px',background:'var(--bg3)',borderRadius:'var(--r)',marginBottom:6}},
            React.createElement('span',{style:{color:'var(--text3)'}},empPayLines.filter(l=>l.selSalary||l.selIncentive||DAILY_INCENTIVE_CATEGORIES_ALL.some(cat=>l.dailyIncentive[cat].sel)).length+' employee'+(empPayLines.filter(l=>l.selSalary||l.selIncentive||DAILY_INCENTIVE_CATEGORIES_ALL.some(cat=>l.dailyIncentive[cat].sel)).length===1?'':'s')+' selected'),
            React.createElement('span',{style:{fontWeight:700,color:Math.abs(totalAllocated-(Number(row.debit)||0))<1?'var(--green)':'var(--text)'}},'₹'+totalAllocated.toLocaleString()+' of ₹'+(Number(row.debit)||0).toLocaleString())
          ),
          React.createElement('div',{className:'modal-actions'},
            React.createElement('button',{className:'btn btn-ghost',onClick:()=>setEmpPayRow(null)},'Cancel'),
            React.createElement('button',{className:'btn btn-primary',disabled:!anySelected,onClick:saveEmployeePay},'Record Payment')
          )
        )
      );
    })(),
    addDIRow&&React.createElement('div',{className:'modal-overlay',onClick:()=>setAddDIRow(null)},
      React.createElement('div',{className:'modal',style:{width:460},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Add Daily Incentive Entry — '+addDIRow.employeeName),
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:14,lineHeight:1.6}},'Recorded on the Daily Incentive Sheet with Mode "Bank" — split across as many categories as apply, each becomes its own entry. Outstanding shows in Settle Pay immediately after saving, for '+MONTH_SHORT[addDIRow.month]+' '+addDIRow.year+'.'),
        React.createElement('div',{className:'form-group',style:{marginBottom:14}},React.createElement('label',null,'Date *'),React.createElement('input',{type:'date',className:'form-control',value:addDIForm.date,onChange:e=>setAddDIForm(f=>({...f,date:e.target.value})),autoFocus:true})),
        DAILY_INCENTIVE_CATEGORIES.map(cat=>React.createElement('div',{key:cat,className:'form-group',style:{marginBottom:10}},
          React.createElement('label',null,cat),
          React.createElement('input',{type:'number',className:'form-control',placeholder:'Amount',value:addDIForm.amounts[cat]!=null?addDIForm.amounts[cat]:'',onChange:e=>setAddDIForm(f=>({...f,amounts:{...f.amounts,[cat]:e.target.value}}))})
        )),
        (()=>{
          const total=DAILY_INCENTIVE_CATEGORIES.reduce((s,cat)=>s+(Number(addDIForm.amounts[cat])||0),0);
          return React.createElement('div',{style:{fontSize:12,color:'var(--text3)',margin:'6px 0 16px'}},'Total: ',React.createElement('span',{style:{fontWeight:700,color:'var(--accent)'}},'₹'+total.toLocaleString()));
        })(),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setAddDIRow(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:saveAddDIEntry},'Add Entry')
        )
      )
    ),
    advanceRow&&(()=>{
      const{row}=advanceRow;
      const advanceLineAmount=(line)=>{
        if(line.linkExistingId){
          const cand=loadAdvances(salonId).find(a=>a.id===line.linkExistingId);
          return cand?(Number(cand.outstanding!=null?cand.outstanding:cand.amount)||0):0;
        }
        return Number(line.amount)||0;
      };
      const totalAllocated=advanceLines.reduce((s,l)=>s+advanceLineAmount(l),0);
      const addableEmployees=employees.filter(e=>!advanceLines.some(l=>l.employeeId===e.id)).sort((a,b)=>a.name.localeCompare(b.name));
      const lineFor=(line)=>{
        const candidates=advanceCandidatesFor(line.employeeName);
        const linked=line.linkExistingId?candidates.find(c=>c.id===line.linkExistingId):null;
        return React.createElement('div',{key:line.employeeId,style:{border:'1px solid var(--border)',borderRadius:'var(--r)',padding:10,marginBottom:10,background:'var(--bg3)'}},
          React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}},
            React.createElement('div',{style:{fontWeight:600,fontSize:12.5,color:'var(--text)'}},line.employeeName),
            React.createElement('span',{onClick:()=>removeAdvanceLine(line.employeeId),title:'Remove this employee from the Advance',style:{cursor:'pointer',color:'var(--text3)',fontSize:11}},'✕ Remove')
          ),
          candidates.length>0&&React.createElement('div',{className:'form-group',style:{marginBottom:10}},
            React.createElement('label',null,'Link to existing Advance'),
            React.createElement('select',{className:'form-control',style:{padding:'6px 8px',fontSize:12},value:line.linkExistingId,onChange:e=>updateAdvanceLine(line.employeeId,'linkExistingId',e.target.value)},
              React.createElement('option',{value:''},'— Record as a new Advance instead —'),
              candidates.map(c=>React.createElement('option',{key:c.id,value:c.id},c.id+' · ₹'+(Number(c.outstanding!=null?c.outstanding:c.amount)||0).toLocaleString()+' · '+c.status+(c.date?' · '+c.date:'')))
            )
          ),
          linked
            ?React.createElement('div',{style:{fontSize:11,color:'var(--text3)',lineHeight:1.7,padding:'6px 2px'}},
                'Linking to '+linked.id+' — ₹'+(Number(linked.outstanding!=null?linked.outstanding:linked.amount)||0).toLocaleString()+' outstanding, '+linked.status+
                (linked.reason?', "'+linked.reason+'"':'')+'. This transaction\u2019s date and Ref No will be attached to it; the amount, deduction plan and reason already on that Advance record stay as they are.'
              )
            :React.createElement(React.Fragment,null,
                React.createElement('div',{className:'form-row cols2',style:{marginBottom:8}},
                  React.createElement('div',{className:'form-group',style:{marginBottom:0}},React.createElement('label',null,'Amount *'),React.createElement('input',{type:'number',className:'form-control',style:{padding:'6px 8px',fontSize:12},value:line.amount,onChange:e=>updateAdvanceLine(line.employeeId,'amount',e.target.value)})),
                  React.createElement('div',{className:'form-group',style:{marginBottom:0}},React.createElement('label',null,'Recover Against'),React.createElement('select',{className:'form-control',style:{padding:'6px 8px',fontSize:12},value:line.deductFrom,onChange:e=>updateAdvanceLine(line.employeeId,'deductFrom',e.target.value)},['Salary','Incentive'].map(m=>React.createElement('option',{key:m,value:m},m))))
                ),
                React.createElement('div',{className:'form-row cols2',style:{marginBottom:8}},
                  React.createElement('div',{className:'form-group',style:{marginBottom:0}},React.createElement('label',null,'Monthly Deduction'),React.createElement('input',{type:'number',className:'form-control',style:{padding:'6px 8px',fontSize:12},value:line.repayment,onChange:e=>updateAdvanceLine(line.employeeId,'repayment',e.target.value),placeholder:'Optional'})),
                  React.createElement('div',{className:'form-group',style:{marginBottom:0}},React.createElement('label',null,'Deduction Start'),React.createElement('input',{type:'month',className:'form-control',style:{padding:'6px 8px',fontSize:12},value:line.deductionStart,onChange:e=>updateAdvanceLine(line.employeeId,'deductionStart',e.target.value)}))
                ),
                React.createElement('div',{className:'form-group',style:{marginBottom:0}},React.createElement('label',null,'Reason'),React.createElement('input',{className:'form-control',style:{padding:'6px 8px',fontSize:12},value:line.reason,onChange:e=>updateAdvanceLine(line.employeeId,'reason',e.target.value),placeholder:'e.g. Medical emergency'}))
              )
        );
      };
      return React.createElement('div',{className:'modal-overlay',onClick:()=>setAdvanceRow(null)},
        React.createElement('div',{className:'modal',style:{width:560,maxHeight:'82vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
          React.createElement('div',{className:'modal-title'},'Record Advance'),
          React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14,fontSize:12}},
            React.createElement('div',{style:{color:'var(--text)',fontWeight:500}},row.description),
            React.createElement('div',{style:{color:'var(--text3)',marginTop:2}},row.transactionDate+' · Debit '+money(row.debit)+(row.refNo?' · Ref '+row.refNo:''))
          ),
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:12,lineHeight:1.6}},'If an employee already has an Advance recorded on the Advances sheet awaiting disbursement, link this payment to it instead of creating a duplicate — otherwise it creates a new Advances-sheet record (Active, Bank Transfer, with this transaction\u2019s date and Ref No carried over). Add more than one employee if this transfer is a combined advance payment covering several people at once.'),
          advanceLines.map(lineFor),
          React.createElement('div',{className:'form-group',style:{marginBottom:14}},
            React.createElement('select',{className:'form-control',value:'',onChange:e=>{if(e.target.value)addAdvanceLine(e.target.value);}},
              React.createElement('option',{value:''},addableEmployees.length?'+ Add another employee to this Advance…':'All employees already added'),
              addableEmployees.map(e=>React.createElement('option',{key:e.id,value:e.id},e.name))
            )
          ),
          advanceLines.length>0&&React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:12,padding:'8px 12px',background:'var(--bg3)',borderRadius:'var(--r)',marginBottom:6}},
            React.createElement('span',{style:{color:'var(--text3)'}},advanceLines.length+' employee'+(advanceLines.length===1?'':'s')),
            React.createElement('span',{style:{fontWeight:700,color:Math.abs(totalAllocated-(Number(row.debit)||0))<1?'var(--green)':'var(--text)'}},'₹'+totalAllocated.toLocaleString()+' of ₹'+(Number(row.debit)||0).toLocaleString())
          ),
          React.createElement('div',{className:'modal-actions'},
            React.createElement('button',{className:'btn btn-ghost',onClick:()=>setAdvanceRow(null)},'Cancel'),
            React.createElement('button',{className:'btn btn-primary',disabled:!advanceLines.length||advanceLines.every(l=>!l.linkExistingId&&!(Number(l.amount)>0)),onClick:saveAdvanceRecord},'Record Advance')
          )
        )
      );
    })()
  );
}

// ── RECURRING EXPENSES — a register of standing bills the outlet expects every period (Rent,
// Staff Room Rent, Royalty, Electricity, DG Rent, Telephone & Internet, Marketing, Drycleaning,
// Professional Fee, Maintenance, etc.), tracked with full detail (payee, frequency, due day,
// payment mode, active window) rather than just a name and a number. This is a commitments
// register — "what's expected, from whom, how often" — separate from Daily Sales & Exp's actual
// day-by-day entries. ──
const RECURRING_EXPENSE_TYPES=['Rent','Staff Room Rent','Royalty','Electricity Expenses','DG Rent','Telephone & Internet Expenses','Marketing Expenses','Drycleaning Expenses','Professional Fee','Maintenance Bill','Software Subscription','Other'];
const RECURRING_FREQUENCIES=['Monthly','Bi-Monthly','Quarterly','Half-Yearly','Yearly'];
const RECURRING_FREQ_DIVISOR={Monthly:1,'Bi-Monthly':2,Quarterly:3,'Half-Yearly':6,Yearly:12};