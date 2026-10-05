
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
  const [payForm,setPayForm]=useState({paidAmount:'',paidDate:localTodayIso(),ref:''});
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
    if(d.type==='Salary Disbursement')return swWorkingsFinalFor(salonId,d.year,d.month).filter(e=>e.net>0).map(e=>({id:e.id,name:e.name,desig:e.desig,amount:e.net}));
    if(d.type==='Incentive Payment')return incWorkingsFor(salonId,d.year,d.month).filter(e=>e.totalInc>0).map(e=>({id:e.id,name:e.name,desig:e.desig,amount:e.totalInc}));
    if(d.type==='TDS Payment'){
      const recurring=loadRecurringExpenses(salonId).filter(it=>it.status==='Active'&&it.tdsApplicable&&it.tdsSection);
      return tdsPartyDetailForMonth(salonId,d.year,d.month,recurring).map(p=>({id:p.key,name:p.party,desig:p.source+' · '+p.section,amount:p.amt}));
    }
    if(d.type==='PF Challan')return swWorkingsFinalFor(salonId,d.year,d.month).filter(e=>e.pf&&((e.pfEmp||0)+(e.pfEr||0))>0).map(e=>({id:e.id,name:e.name,desig:e.desig,amount:(e.pfEmp||0)+(e.pfEr||0)}));
    if(d.type==='ESIC Challan')return swWorkingsFinalFor(salonId,d.year,d.month).filter(e=>e.esic&&e.gross<=21000&&((e.esicEmp||0)+(e.esicEr||0))>0).map(e=>({id:e.id,name:e.name,desig:e.desig,amount:(e.esicEmp||0)+(e.esicEr||0)}));
    if(d.type==='PT Payment')return swWorkingsFinalFor(salonId,d.year,d.month).filter(e=>(e.ptAmt||0)>0).map(e=>({id:e.id,name:e.name,desig:e.desig,amount:e.ptAmt}));
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
  const openAdd=()=>{setForm({...BLANK,due:localTodayIso()});setEditItem(null);setShowModal(true);};
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
  const autoItems=[...autoStatutoryDueItemsFor(salonId),...autoTdsDueItemsFor(salonId),...autoSalaryIncentiveDueItemsFor(salonId),...autoVendorDueItemsFor(salonId),...autoAmountUpdateReminders(salonId),...autoLicenceDueItemsFor(salonId)];
  const allItems=[...autoItems,...dueDates];
  const markPaid=(d)=>{
    setShowPayModal(d);
    setPayForm({paidAmount:String(d.amount||''),paidDate:localTodayIso(),ref:''});
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
              d.amount>0&&React.createElement('span',{style:{fontSize:12,color:'var(--text2)',marginLeft:4}},rupee(Number(d.amount)))
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
                    React.createElement('div',{style:{fontWeight:600,color:Math.abs((r.debit||0)-(showPayModal.amount||0))<1?'var(--green)':'var(--red)',fontSize:12.5}},rupee(Number(r.debit))+(Math.abs((r.debit||0)-(showPayModal.amount||0))<1?' ✓':''))
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

// Row index of the Cradlee report's heading row (the one with Center Name and InvoiceDate) in the first
// 30 rows of a sheet read as arrays, or -1.
function findCradleeHeaderRow(raw){
  const n=v=>String(v==null?'':v).toLowerCase().replace(/[^a-z]/g,'');
  for(let i=0;i<Math.min(30,(raw||[]).length);i++){const cells=(raw[i]||[]).map(n);if(cells.includes('centername')&&cells.includes('invoicedate'))return i;}
  return -1;
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
  // Card/UPI Settlement credits (linked by Date as per Cradlee) — an exact calculation in the browser
  // (it used to ask an AI model, which only worked inside Claude and was never needed for sums). ──
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
      // Exact arithmetic, done here: for each (date, Card/UPI) bank settlement, the Collection Reco
      // card / UPI amounts of that same date summed across centres, and the difference.
      const dkey=d=>toISO(d)||String(d||'').trim();
      const sums={};
      collections.forEach(c=>{const k=dkey(c.date);if(!sums[k])sums[k]={card:0,upi:0,n:0};sums[k].card+=Number(c.card)||0;sums[k].upi+=Number(c.upi)||0;sums[k].n++;});
      const groups={};
      settlements.forEach(s=>{const k=dkey(s.date)+'|'+s.nature;if(!groups[k])groups[k]={date:s.date,iso:dkey(s.date),nature:s.nature,bankAmount:0};groups[k].bankAmount+=Number(s.amount)||0;});
      const out=Object.values(groups).map(g=>{
        const c=sums[g.iso];
        const coll=c?(g.nature==='Card Settlement'?c.card:c.upi):0;
        const diff=Math.round((g.bankAmount-coll)*100)/100;
        const status=!c?'No Collection Data':Math.abs(diff)<1?'Matched':'Mismatch';
        const note=status==='Matched'?'Bank credit equals the collection report.':status==='No Collection Data'?'No Collection Reco entry for this date.'
          :diff>0?'Bank received ₹'+Math.abs(diff).toLocaleString('en-IN')+' more than the report shows.':'Bank received ₹'+Math.abs(diff).toLocaleString('en-IN')+' less than the report shows.';
        return{date:g.date,nature:g.nature,bankAmount:Math.round(g.bankAmount*100)/100,collectionAmount:Math.round(coll*100)/100,difference:diff,status,note,iso:g.iso};
      }).sort((a,b)=>a.iso<b.iso?1:a.iso>b.iso?-1:0).slice(0,60).map(({iso,...r})=>r);
      setAiRows(out);
    }catch(err){
      setAiError('Could not build the reconciliation: '+err.message);
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
    let txt=type.label+(entry.amount?' of ₹'+Number(entry.amount).toLocaleString('en-IN'):'');
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
      setAutoStatus('Auto-imported "'+best.file.name+'" from your connected folder.');
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
    setAutoStatus('Disconnected from the statements folder.');
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

  // ── "Get the Collection Report from Cradlee" — same flow as Bank Statement: pick the period, open
  // Cradlee, export the Collection Report; the new file is imported by itself from the connected folder
  // (checked every 3 s for 20 minutes), or with "📄 Choose file" (opens in Downloads). Only that period
  // is kept and rows already imported are skipped. ──
  const CRADLEE_LOGIN_URL='https://app.cradleesoft.com/app/login';
  const cIso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const cToday=new Date();
  const [cFrom,setCFrom]=useState(()=>cIso(new Date(cToday.getFullYear(),cToday.getMonth(),1)));
  const [cTo,setCTo]=useState(()=>cIso(cToday));
  const [cWait,setCWait]=useState(0);
  const [cWatch,setCWatch]=useState('');
  const [cStatus,setCStatus]=useState({text:'',bad:false});
  const loadWorkbookRef=useRef(null);
  const cPendingRef=useRef(false);
  const cQuick=[
    ['Yesterday',()=>{const d=new Date(cToday);d.setDate(d.getDate()-1);setCFrom(cIso(d));setCTo(cIso(d));}],
    ['Last 7 days',()=>{const d=new Date(cToday);d.setDate(d.getDate()-6);setCFrom(cIso(d));setCTo(cIso(cToday));}],
    ['This month',()=>{setCFrom(cIso(new Date(cToday.getFullYear(),cToday.getMonth(),1)));setCTo(cIso(cToday));}],
    ['Last month',()=>{setCFrom(cIso(new Date(cToday.getFullYear(),cToday.getMonth()-1,1)));setCTo(cIso(new Date(cToday.getFullYear(),cToday.getMonth(),0)));}],
    ['This FY',()=>{const y=cToday.getMonth()>=3?cToday.getFullYear():cToday.getFullYear()-1;setCFrom(cIso(new Date(y,3,1)));setCTo(cIso(cToday));}],
  ];
  const cRange=()=>cFrom.split('-').reverse().join('/')+' to '+cTo.split('-').reverse().join('/');
  const openCradlee=async()=>{
    if(cFrom>cTo){setCStatus({text:'From date must be on or before To date.',bad:true});return;}
    window.open(CRADLEE_LOGIN_URL,'_blank','noopener,noreferrer'); // first, while the click still allows pop-ups
    setCWait(Date.now()-3000);
    if(dirHandle){try{let perm=await dirHandle.queryPermission({mode:'read'});if(perm!=='granted')perm=await dirHandle.requestPermission({mode:'read'});setDirNeedsPermission(perm!=='granted');}catch(e){}}
    setCStatus({text:'Cradlee opened in a new tab. Log in, open Reports → Collection Report, choose '+cRange()+' and export it as Excel or CSV. '+(dirHandle?'Save it in your connected folder and this page imports it by itself.':'Then come back and press 📄 Choose file (it opens in Downloads).'),bad:false});
  };
  const importCradleeFile=async(f)=>{
    if(!f)return;
    setCWait(0);setCWatch('');
    setCStatus({text:'Importing "'+f.name+'"…',bad:false});
    cPendingRef.current=true;
    await loadWorkbookRef.current(f,{from:cFrom,to:cTo,append:true});
  };
  const cFileRef=useRef(null);
  const chooseCradleeFile=async()=>{
    if(typeof window.showOpenFilePicker==='function'){
      try{
        const [h]=await window.showOpenFilePicker({id:'cradlee-report-file',startIn:'downloads',multiple:false,
          types:[{description:'Cradlee Collection Report',accept:{'application/vnd.ms-excel':['.xls'],'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx'],'text/csv':['.csv']}}]});
        if(h)await importCradleeFile(await h.getFile());
        return;
      }catch(err){if(err&&err.name==='AbortError')return;}
    }
    cFileRef.current&&cFileRef.current.click();
  };
  useEffect(()=>{
    if(!cPendingRef.current||!message)return;
    cPendingRef.current=false;
    setCStatus({text:message,bad:/failed|no day rows|no new rows/i.test(message)});
    // eslint-disable-next-line
  },[message]);
  useEffect(()=>{
    if(!cWait||!dirHandle)return;
    let stop=false,busy=false,known=null;
    const tick=async()=>{
      if(stop||busy)return;
      if(Date.now()-cWait>20*60*1000){setCWait(0);setCWatch('');setCStatus({text:'Stopped waiting for the Cradlee export (20 minutes). Click "Open Cradlee" again when ready, or use "Choose file".',bad:true});return;}
      busy=true;
      try{
        if(await dirHandle.queryPermission({mode:'read'})!=='granted'){setDirNeedsPermission(true);setCWatch('Folder access needs to be allowed again — click "🔓 Allow folder access".');return;}
        const names=new Set();for await(const e of dirHandle.values()){if(e.kind==='file')names.add(e.name);}
        if(!known){known=names;setCWatch('Watching folder "'+dirHandle.name+'" for the new Cradlee export…');return;}
        const fresh=[];
        for(const n of names){
          if(known.has(n)||!/\.(xlsx|xls|csv)$/i.test(n))continue;
          try{const f=await (await dirHandle.getFileHandle(n)).getFile();if(f.size>0)fresh.push(f);}catch(e){}
        }
        if(fresh.length&&!stop){
          stop=true;
          const file=fresh.sort((a,b)=>b.lastModified-a.lastModified)[0];
          await importCradleeFile(file);
          lastAutoRef.current=file.name+'|'+file.lastModified;
          safeLocalSet(outletKey('salonos_cradlee_last_auto',salonId),lastAutoRef.current);
          return;
        }
        setCWatch('Watching folder "'+dirHandle.name+'" — no new export yet (checked '+new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'). If it was saved somewhere else, use "Choose file".');
      }catch(e){setCWatch('');setCStatus({text:'Could not read the connected folder: '+e.message,bad:true});}
      finally{busy=false;}
    };
    const t=setInterval(tick,3000);tick();
    return()=>{stop=true;clearInterval(t);};
    // eslint-disable-next-line
  },[cWait,dirHandle]);

  const clean=(v)=>{
    if(v===undefined||v===null||v==='')return 0;
    const n=Number(String(v).replace(/[₹,\s]/g,''));
    return Number.isFinite(n)?n:0;
  };
  const normalizeDate=(v,swap)=>{
    if(v===undefined||v===null||v==='')return'';
    if(v instanceof Date&&!isNaN(v)){
      v=excelCellDate(v);
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

  // opts (from the "Get the Collection Report from Cradlee" card): {from,to} ISO dates to keep only that
  // period, append:true to always add (duplicates skipped) instead of following the Replace/Append toggle.
  const loadWorkbook=async(file,opts)=>{
    setMessage('');setFileName(file.name);
    try{
      let raw;
      if(isCSVFile(file)){
        // Parse CSV ourselves — keeps every date cell as exact original text.
        raw=parseCSVToRows(await file.text());
      }else{
        if(!window.XLSX)throw new Error('Excel reader could not load. Please check your internet connection and reopen the file.');
        const buf=await file.arrayBuffer();
        const wb=XLSX.read(buf,{type:'array',cellDates:true});
        // The sheet that has the Center Name + InvoiceDate headings (a report may have a cover sheet).
        const sheets=wb.SheetNames.map(n=>XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:'',raw:true}));
        raw=sheets.find(r=>findCradleeHeaderRow(r)>=0)||sheets[0]||[];
      }
      if(!raw.length)throw new Error('The selected file has no data rows.');
      // Cradlee's own export can start with a title / centre / date-range block — the heading row is
      // wherever Center Name and InvoiceDate appear (first 30 rows), not necessarily row 1.
      const hi=Math.max(0,findCradleeHeaderRow(raw));
      const headerRow=(raw[hi]||[]).map(h=>String(h||'').trim());
      const json=raw.slice(hi+1)
        .map(r=>{const obj={};headerRow.forEach((h,ci)=>{if(h)obj[h]=r[ci]!==undefined?r[ci]:'';});return obj;})
        .filter(o=>Object.values(o).some(v=>String(v).trim()!==''));
      if(!json.length)throw new Error('The selected file has no data rows.');
      const headers=Object.keys(json[0]);
      const missing=MANDATORY.filter(h=>!headers.some(x=>String(x).trim().toLowerCase()===h.toLowerCase()));
      if(missing.length)throw new Error('Missing required columns: '+missing.join(', '));
      const missingOptional=REQUIRED.filter(h=>!MANDATORY.includes(h)&&!headers.some(x=>String(x).trim().toLowerCase()===h.toLowerCase()));
      const dateSwap=inferDateSwap(json,['InvoiceDate','Invoice Date','invoice date']);
      let imported=json.map((r,i)=>mapRow(r,i,dateSwap)).filter(r=>r.centerName||r.invoiceDate||r.total);
      // Only real day rows: a proper date (year 2000–2099). Grand-total / summary lines are left out.
      const before=imported.length;
      imported=imported.filter(r=>{const m=/^\d{2}\/\d{2}\/(\d{4})$/.exec(r.invoiceDate||'');return !!m&&+m[1]>=2000&&+m[1]<=2099;});
      const skippedLines=before-imported.length;
      let periodNote='';
      if(opts&&opts.from&&opts.to){
        const iso=d=>{const m=String(d||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?m[3]+'-'+m[2]+'-'+m[1]:'';};
        const n0=imported.length;
        imported=imported.filter(r=>{const d=iso(r.invoiceDate);return d>=opts.from&&d<=opts.to;});
        if(n0!==imported.length)periodNote=' · '+(n0-imported.length)+' row'+(n0-imported.length===1?'':'s')+' outside '+opts.from.split('-').reverse().join('/')+'–'+opts.to.split('-').reverse().join('/')+' left out';
      }
      if(!imported.length)throw new Error('No day rows'+(opts&&opts.from?' for '+opts.from.split('-').reverse().join('/')+'–'+opts.to.split('-').reverse().join('/'):'')+' in this file — check the report’s dates and that it has Center Name and InvoiceDate columns.');
      const note=(skippedLines?' · '+skippedLines+' total/summary line'+(skippedLines===1?'':'s')+' ignored':'')+periodNote+(missingOptional.length?' · '+missingOptional.join(', ')+' column'+(missingOptional.length===1?' wasn\u2019t':'s weren\u2019t')+' in this file, treated as ₹0.':'');
      // Append mode: add only rows that don't already match one on every field (same center,
      // date, and every amount column) — guards against a Cradlee export that re-covers an
      // overlapping date range, the normal case when pulling "month so far" reports repeatedly.
      if((importMode==='append'||(opts&&opts.append))&&rows.length){
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

  loadWorkbookRef.current=loadWorkbook;
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
        React.createElement('button',{className:'btn btn-primary btn-sm',onClick:openCradlee},'🔗 Open Cradlee eSoft Login'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:downloadTemplate},'⬇ Download Template'),
        rows.length>0&&React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:exportData},'⬇ Export Imported Data'),
        selected.size>0&&React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(255,107,107,.15)',border:'1px solid rgba(255,107,107,.4)',color:'var(--red)',fontWeight:600},onClick:deleteSelected},'🗑 Delete Selected ('+selected.size+')'),
        rows.length>0&&React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(255,107,107,.1)',border:'1px solid rgba(255,107,107,.3)',color:'var(--red)'},onClick:clearData},'Clear Data')
      )
    ),

    React.createElement('div',{className:'card',style:{marginBottom:16,background:'rgba(74,158,255,0.06)',border:'1px solid rgba(74,158,255,0.25)'}},
      React.createElement('div',{style:{display:'flex',gap:12,alignItems:'flex-start'}},
        React.createElement('div',{style:{fontSize:20}},'📥'),
        React.createElement('div',{style:{flex:1,minWidth:260}},
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:4}},
            React.createElement('div',{style:{fontSize:13,fontWeight:600,color:'var(--text)'}},'Get the Collection Report from Cradlee')),
          React.createElement('div',{style:{fontSize:12,color:'var(--text2)',lineHeight:1.7,marginBottom:8}},
            'Pick the period, click "Open Cradlee", log in there and export Reports → Collection Report for the same dates (Excel or CSV). '+(dirHandle?'SalonOS picks the export up from your connected folder by itself':'Then press 📄 Choose file — it opens in Downloads')+' — only that period is kept, and rows already imported are skipped. Your Cradlee login is only ever typed on Cradlee’s own site.'),
          React.createElement('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}},cQuick.map(([t,fn])=>React.createElement('button',{key:t,className:'btn btn-ghost btn-sm',style:{fontSize:11,padding:'3px 9px'},onClick:fn},t))),
          React.createElement('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
            React.createElement('label',{style:{fontSize:12,color:'var(--text2)'}},'From'),
            React.createElement('input',{type:'date',className:'form-control',style:{width:'auto'},value:cFrom,max:cTo,onChange:e=>setCFrom(e.target.value)}),
            React.createElement('label',{style:{fontSize:12,color:'var(--text2)'}},'To'),
            React.createElement('input',{type:'date',className:'form-control',style:{width:'auto'},value:cTo,min:cFrom,max:cIso(cToday),onChange:e=>setCTo(e.target.value)}),
            React.createElement('button',{className:'btn btn-primary btn-sm',onClick:openCradlee},'🔗 Open Cradlee'),
            React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Pick the exported report yourself — opens in Downloads (same period filter and duplicate check)',onClick:chooseCradleeFile},'📄 Choose file'),
            React.createElement('input',{ref:cFileRef,type:'file',accept:'.xlsx,.xls,.csv',style:{display:'none'},onChange:e=>{const f=e.target.files&&e.target.files[0];e.target.value='';importCradleeFile(f);}}),
            cWait>0&&React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>{setCWait(0);setCWatch('');setCStatus({text:'Stopped waiting.',bad:false});}},'Stop waiting')),
          cWait>0&&dirHandle&&React.createElement('div',{style:{fontSize:12,color:'var(--accent2)',marginTop:8,lineHeight:1.6}},'⏳ '+(cWatch||'Watching your connected folder…'),
            dirNeedsPermission&&React.createElement('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:8,fontSize:11,padding:'2px 8px'},onClick:async()=>{try{const p=await dirHandle.requestPermission({mode:'read'});setDirNeedsPermission(p!=='granted');}catch(e){}}},'🔓 Allow folder access')),
          cStatus.text&&React.createElement('div',{style:{marginTop:8,fontSize:12,color:cStatus.bad?'var(--red)':'var(--green)',lineHeight:1.6}},cStatus.text),
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:8}},'Cradlee has no public link for a website to pull reports from, so you export the report yourself — SalonOS does everything after that.')
        )
      )
    ),

    React.createElement('div',{className:'card',style:{marginBottom:16,background:fsSupported?'rgba(76,175,125,0.06)':'rgba(255,159,67,0.06)',border:'1px solid '+(fsSupported?'rgba(76,175,125,0.25)':'rgba(255,159,67,0.25)')}},
      React.createElement('div',{style:{display:'flex',gap:12,alignItems:'flex-start',flexWrap:'wrap'}},
        React.createElement('div',{style:{fontSize:20}},'⚡'),
        React.createElement('div',{style:{flex:1,minWidth:260}},
          React.createElement('div',{style:{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:4}},'Auto-Import from a folder inside Downloads'),
          !fsSupported?React.createElement('div',{style:{fontSize:12,color:'var(--text2)',lineHeight:1.7}},
            'This browser doesn\u2019t support folder watching (works in Chrome/Edge desktop only). Please use the upload box below instead.'
          ):React.createElement(React.Fragment,null,
            React.createElement('div',{style:{fontSize:12,color:'var(--text2)',lineHeight:1.7,marginBottom:8}},
              !dirHandle
                ?'Chrome and Edge don\u2019t let websites open the whole Downloads folder (\u201ccontains system files\u201d). Click Connect, then in Downloads click New folder, name it Cradlee Exports, open it and click Select folder \u2014 once. Save Cradlee exports there, and from then on this page picks them up automatically \u2014 no manual browsing.'
                :'Connected. Click "Check Now" any time after exporting from Cradlee, or just reopen this tab \u2014 it checks automatically on load.'
            ),
            React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}},
              !dirHandle?React.createElement('button',{className:'btn btn-primary btn-sm',onClick:connectDownloads},'📂 Connect a folder inside Downloads'):
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
          'Matches this Collection Report against Bank Statement\'s Card/UPI Settlement credits (linked by Date as per Cradlee) and flags any mismatches — the same linking used in the Settlement Reconciliation table on the Bank Statement tab, but written up as a readable sheet.'
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
    let txt=type.label+(entry.amount?' of ₹'+Number(entry.amount).toLocaleString('en-IN'):'');
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
      setAutoStatus('Auto-imported "'+best.file.name+'" from your connected folder.');
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
    setAutoStatus('Disconnected from the statements folder.');
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
      v=excelCellDate(v);
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
                          'Last month\'s Credit Sale: ₹'+ref.totalCreditSale.toLocaleString('en-IN')+' · Received so far: ₹'+ref.receivedSoFar.toLocaleString('en-IN')+' · ',
                          React.createElement('span',{style:{color:ref.outstanding>0?'var(--red)':'var(--green)',fontWeight:600}},'Still not received: ₹'+ref.outstanding.toLocaleString('en-IN'))
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
            (sign==='less'?'− ':sign==='add'?'+ ':(val<0?'':''))+'₹'+Math.abs(val).toLocaleString('en-IN'))
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
            React.createElement('span',{style:{color:netBankCharges===0?'var(--text)':netBankCharges>0?'var(--red)':'var(--green)'}},(netBankCharges>=0?'':'−')+'₹'+Math.abs(netBankCharges).toLocaleString('en-IN'))
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


// ── "How it works" walkthrough for getting / auto-importing bank statements ─────────────────────
// A short animated explainer (6 scenes) in English or Hindi: each scene shows a small picture of
// the real screen with the part to click highlighted, a caption, and spoken narration where the
// browser has a voice for that language (captions always show). Plays by itself; Back/Next/Pause.
const BANK_GUIDE_SCENES=[
  {icon:'📂',en:{t:'1. Connect a folder inside Downloads — once',s:'Chrome and Edge don’t let websites open the whole Downloads folder. Click "Connect a folder inside Downloads", click New folder, name it Bank Statements, open it, click Select folder, then Allow. Once on each computer.'},
   hi:{t:'1. Downloads के अंदर एक फ़ोल्डर जोड़ें — सिर्फ़ एक बार',s:'Chrome और Edge पूरे Downloads फ़ोल्डर को खोलने नहीं देते। "Connect a folder inside Downloads" दबाएँ, New folder बनाकर उसका नाम Bank Statements रखें, उसे खोलें, Select folder दबाएँ, फिर Allow करें। हर कंप्यूटर पर सिर्फ़ एक बार।'},
   ui:'folder'},
  {icon:'🏦',en:{t:'2. Pick the bank account and the period',s:'Under "Get statement", choose the account and the period — for example This month, Last month, or your own From and To dates.'},
   hi:{t:'2. बैंक खाता और अवधि चुनें',s:'"Get statement" में खाता चुनें और अवधि चुनें, जैसे This month, Last month, या अपनी From और To तारीख।'},
   ui:'period'},
  {icon:'🔐',en:{t:'3. Open the bank website and log in there',s:'Click "Open bank website". The bank’s own site opens in a new tab. Log in there as you always do. Your bank password never goes into SalonOS.'},
   hi:{t:'3. बैंक की वेबसाइट खोलें और वहीं लॉगिन करें',s:'"Open bank website" पर क्लिक करें। बैंक की अपनी वेबसाइट नए टैब में खुलेगी। वहीं हमेशा की तरह लॉगिन करें। आपका बैंक पासवर्ड SalonOS में कभी नहीं जाता।'},
   ui:'bank'},
  {icon:'⬇️',en:{t:'4. Download the statement for the same period',s:'On the bank’s site, open Account Statement, choose the same dates and download it as Excel, CSV or PDF into the Bank Statements folder (in Chrome settings turn on "Ask where to save each file"). No folder connected? Just press Choose file afterwards — it opens right in Downloads.'},
   hi:{t:'4. उसी अवधि का स्टेटमेंट डाउनलोड करें',s:'बैंक की साइट पर Account Statement खोलें, वही तारीखें चुनें और Excel, CSV या PDF में Bank Statements फ़ोल्डर में डाउनलोड करें (Chrome settings में "Ask where to save each file" चालू करें)। फ़ोल्डर नहीं जोड़ा? बाद में Choose file दबाएँ — वह सीधे Downloads में खुलता है।'},
   ui:'download'},
  {icon:'⚡',en:{t:'5. SalonOS imports it by itself',s:'Within a few seconds SalonOS spots the new file and imports it — only the period you chose, rows already there are skipped, and each row is tagged automatically.'},
   hi:{t:'5. SalonOS अपने-आप इम्पोर्ट कर लेता है',s:'कुछ ही सेकंड में SalonOS नई फ़ाइल पहचान लेता है और इम्पोर्ट कर देता है — सिर्फ़ चुनी हुई अवधि, पहले से मौजूद एंट्री छोड़ दी जाती हैं, और हर एंट्री अपने-आप टैग होती है।'},
   ui:'import'},
  {icon:'✅',en:{t:'6. Check and you are done',s:'Glance at a few rows below. Tip: automatic pick-up works in Chrome or Edge on a computer. On a phone, just drop the downloaded file into the upload box.'},
   hi:{t:'6. जाँचें, और काम पूरा',s:'नीचे कुछ एंट्री एक बार देख लें। ध्यान दें: अपने-आप इम्पोर्ट कंप्यूटर पर Chrome या Edge में चलता है। फ़ोन पर डाउनलोड की हुई फ़ाइल को अपलोड बॉक्स में डाल दें।'},
   ui:'done'},
];
function GuideModal({onClose,initialLang,scenes,title,pictures}){
  const [lang,setLang]=useState(initialLang||'en');
  const [i,setI]=useState(0);
  const [playing,setPlaying]=useState(true);
  const [noVoice,setNoVoice]=useState(false);
  const sc=scenes[i],txt=sc[lang];
  const synth=typeof window!=='undefined'?window.speechSynthesis:null;
  useEffect(()=>{
    let timer=null,cancelled=false;
    if(synth)synth.cancel();
    if(!playing)return()=>{};
    const next=()=>{if(cancelled)return;if(i<scenes.length-1)setI(i+1);else setPlaying(false);};
    const speak=()=>{
      const voices=synth?synth.getVoices():[];
      const want=lang==='hi'?'hi':'en';
      const v=voices.find(x=>x.lang&&x.lang.toLowerCase().startsWith(want+'-in'))||voices.find(x=>x.lang&&x.lang.toLowerCase().startsWith(want));
      if(!synth||!v){setNoVoice(lang==='hi'&&!!synth);timer=setTimeout(next,Math.max(6000,txt.s.length*70));return;}
      setNoVoice(false);
      const u=new SpeechSynthesisUtterance(txt.t+'. '+txt.s);u.voice=v;u.lang=v.lang;u.rate=lang==='hi'?0.95:1;
      u.onend=()=>{timer=setTimeout(next,900);};
      u.onerror=()=>{timer=setTimeout(next,Math.max(6000,txt.s.length*70));};
      synth.speak(u);
    };
    if(synth&&!synth.getVoices().length){synth.onvoiceschanged=()=>{synth.onvoiceschanged=null;if(!cancelled)speak();};timer=setTimeout(()=>{if(!cancelled&&!synth.speaking)speak();},700);}
    else speak();
    return()=>{cancelled=true;clearTimeout(timer);if(synth)synth.cancel();};
    // eslint-disable-next-line
  },[i,lang,playing]);
  useEffect(()=>()=>{if(synth)synth.cancel();},[]);
  const box={background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:8,padding:'8px 10px',fontSize:11.5,color:'var(--text2)'};
  const hot={animation:'bgPulse 1.4s ease-in-out infinite',outline:'2px solid var(--accent)',outlineOffset:2};
  const pill=(label,h)=>React.createElement('span',{style:{display:'inline-block',padding:'4px 10px',borderRadius:6,fontSize:11,fontWeight:600,background:h?'var(--accent)':'var(--bg3)',color:h?'#fff':'var(--text2)',marginRight:6,...(h?hot:{})}},label);
  const picture=(pictures?pictures({box,hot,pill}):{})[sc.ui]||null;
  const go=d=>{setI(x=>Math.min(scenes.length-1,Math.max(0,x+d)));};
  return guideModalBody();
  function guideModalBody(){return React.createElement('div',{className:'modal-overlay',onClick:onClose},
    React.createElement('div',{className:'modal',style:{width:620,maxWidth:'96vw'},onClick:e=>e.stopPropagation()},
      React.createElement('style',null,'@keyframes bgPulse{0%,100%{box-shadow:0 0 0 0 rgba(47,95,224,.45)}50%{box-shadow:0 0 0 8px rgba(47,95,224,0)}}@keyframes bgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}'),
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:12,flexWrap:'wrap'}},
        React.createElement('div',{className:'modal-title',style:{margin:0,flex:1}},(title&&title[lang])||''),
        ['en','hi'].map(l=>React.createElement('button',{key:l,className:'btn btn-sm '+(lang===l?'btn-primary':'btn-ghost'),onClick:()=>{setLang(l);setPlaying(true);}},l==='en'?'English':'हिंदी'))),
      React.createElement('div',{key:i+lang,style:{animation:'bgIn .4s ease both'}},
        React.createElement('div',{style:{fontSize:34,marginBottom:6}},sc.icon),
        React.createElement('div',{style:{fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:10}},txt.t),
        picture,
        React.createElement('div',{style:{fontSize:13.5,color:'var(--text)',lineHeight:1.7,marginTop:12,minHeight:70}},txt.s)),
      noVoice&&React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:4}},'This browser has no Hindi voice installed — captions only. (Windows: Settings → Time & language → Speech → add Hindi.)'),
      React.createElement('div',{style:{display:'flex',gap:6,margin:'12px 0 4px'}},scenes.map((_,k)=>React.createElement('div',{key:k,onClick:()=>setI(k),style:{flex:1,height:4,borderRadius:2,cursor:'pointer',background:k<=i?'var(--accent)':'var(--border2)'}}))),
      React.createElement('div',{className:'modal-actions'},
        React.createElement('button',{className:'btn btn-ghost',disabled:i===0,onClick:()=>go(-1)},lang==='hi'?'← पिछला':'← Back'),
        React.createElement('button',{className:'btn btn-ghost',onClick:()=>{if(!playing&&i===scenes.length-1)setI(0);setPlaying(p=>!p);}},playing?(lang==='hi'?'⏸ रोकें':'⏸ Pause'):(lang==='hi'?'▶ चलाएँ':'▶ Play')),
        React.createElement('button',{className:'btn btn-ghost',disabled:i===scenes.length-1,onClick:()=>go(1)},lang==='hi'?'अगला →':'Next →'),
        React.createElement('button',{className:'btn btn-primary',onClick:onClose},lang==='hi'?'बंद करें':'Close'))
    )
  );}
}
function bankGuidePictures({box,pill}){
  return{
    folder:React.createElement('div',{style:box},React.createElement('div',{style:{fontWeight:600,marginBottom:6}},'⚡ Auto-Import from a folder inside Downloads'),pill('📂 Connect a folder inside Downloads',true),
      React.createElement('div',{style:{marginTop:10,padding:8,border:'1px dashed var(--border2)',borderRadius:6,animation:'bgIn .6s ease both .8s'}},'🗂 Downloads › ',pill('New folder',true),' Bank Statements  ',pill('Select folder',true),pill('Allow',true))),
    period:React.createElement('div',{style:box},React.createElement('div',{style:{marginBottom:6}},'◉ HDFC Current · Current · ••1234'),
      React.createElement('div',null,pill('Yesterday'),pill('This month',true),pill('Last month'),pill('This FY')),React.createElement('div',{style:{marginTop:8}},'From 01/09/2026  →  To 29/09/2026')),
    bank:React.createElement('div',{style:box},pill('🔗 Open bank website',true),React.createElement('div',{style:{marginTop:10,padding:8,borderRadius:6,background:'var(--bg3)',animation:'bgIn .6s ease both .8s'}},'🔒 https://netbanking.yourbank…  ',React.createElement('b',null,'Login'),'  · User ID · Password')),
    download:React.createElement('div',{style:box},'Account Statement · 01/09/2026 – 29/09/2026',React.createElement('div',{style:{marginTop:8}},pill('Excel'),pill('CSV'),pill('PDF'),pill('⬇ Download',true)),
      React.createElement('div',{style:{marginTop:8,animation:'bgIn .6s ease both 1s'}},'✅ Statement_Sep.xlsx → Downloads › Bank Statements')),
    import:React.createElement('div',{style:box},React.createElement('div',{style:{color:'var(--accent2)'}},'⏳ Watching your Bank Statements folder…'),
      React.createElement('div',{style:{marginTop:8,color:'var(--green)',animation:'bgIn .6s ease both 1.2s'}},'Found "Statement_Sep.xlsx" — Appended 42 new transactions · 3 already there skipped · 30 auto-classified')),
    done:React.createElement('div',{style:box},React.createElement('div',null,'05/09  UPI/CR/…  +1,200  → UPI Settlement'),React.createElement('div',null,'06/09  NEFT RENT  −5,000'),React.createElement('div',{style:{marginTop:8}},'💻 Chrome / Edge: automatic  ·  📱 Phone: upload box')),
  };
}
function BankGuideModal(props){
  return React.createElement(GuideModal,{...props,scenes:BANK_GUIDE_SCENES,pictures:bankGuidePictures,
    title:{en:'Bank statement — how it works',hi:'बैंक स्टेटमेंट — यह कैसे काम करता है'}});
}

// ── Staff walkthrough: running the SalonOS Tally Connector (local PC, office server, cloud) ──
const TALLY_GUIDE_SCENES=[
  {icon:'🔌',ui:'intro',
   en:{t:'1. What the Tally Connector does',s:'The SalonOS Tally Connector is a small program that runs next to Tally. With it, SalonOS reads your ledgers from Tally, creates new ledgers there, and sends vouchers straight in — and Tally confirms what was created.'},
   hi:{t:'1. टैली कनेक्टर क्या करता है',s:'SalonOS टैली कनेक्टर एक छोटा प्रोग्राम है जो टैली के साथ चलता है। इससे SalonOS टैली से लेजर पढ़ता है, नए लेजर वहाँ बनाता है और वाउचर सीधे भेजता है — और टैली बताता है कि क्या बना।'}},
  {icon:'⚙️',ui:'tallycfg',
   en:{t:'2. Turn on Tally’s connection — once',s:'In TallyPrime press F1 (Help) › Settings › Connectivity › Client/Server configuration. Set "TallyPrime acts as" to Both, Enable ODBC to Yes, Port 9000, and save. In Tally.ERP 9 it is F12 › Advanced Configuration.'},
   hi:{t:'2. टैली का कनेक्शन चालू करें — सिर्फ़ एक बार',s:'TallyPrime में F1 Help, फिर Settings, Connectivity, Client/Server configuration खोलें। TallyPrime acts as को Both, Enable ODBC को Yes और Port 9000 रखें, फिर सेव करें। Tally ERP 9 में यह F12, Advanced Configuration में है।'}},
  {icon:'⬇️',ui:'download',
   en:{t:'3. Download the connector — once',s:'In SalonOS open Tally Export and download both files: Start-SalonOS-Tally-Connector.bat and SalonOS-Tally-Connector.ps1. Keep the two files together in one folder, for example Documents\\SalonOS.'},
   hi:{t:'3. कनेक्टर डाउनलोड करें — सिर्फ़ एक बार',s:'SalonOS में Tally Export खोलें और दोनों फ़ाइलें डाउनलोड करें — Start-SalonOS-Tally-Connector.bat और SalonOS-Tally-Connector.ps1। दोनों फ़ाइलें एक ही फ़ोल्डर में रखें, जैसे Documents\\SalonOS।'}},
  {icon:'💻',ui:'local',
   en:{t:'4. Local — Tally on this computer',s:'Open Tally with your company loaded. Double-click the start file. If Windows says "Windows protected your PC", click More info, then Run anyway. A window opens and says Listening — keep it open. In SalonOS click ⟳ Check: it shows Connected.'},
   hi:{t:'4. लोकल — टैली इसी कंप्यूटर पर',s:'टैली में कंपनी खोलें। स्टार्ट फ़ाइल पर डबल-क्लिक करें। अगर विंडोज़ कहे कि उसने आपका PC सुरक्षित किया, तो More info और फिर Run anyway दबाएँ। एक विंडो खुलेगी जिसमें Listening लिखा होगा — उसे खुला रखें। SalonOS में Check दबाएँ: Connected दिखेगा।'}},
  {icon:'🏢',ui:'server',
   en:{t:'5. Server — Tally on another computer or office server',s:'Right-click the start file and choose Edit. At the end of the line add -TallyHost and the server’s address, for example -TallyHost 192.168.1.20. Save, then double click it. The server’s Tally port 9000 must be reachable on your office network or VPN.'},
   hi:{t:'5. सर्वर — टैली दूसरे कंप्यूटर या ऑफ़िस सर्वर पर',s:'स्टार्ट फ़ाइल पर राइट-क्लिक करके Edit चुनें। लाइन के आख़िर में -TallyHost और सर्वर का पता लिखें, जैसे -TallyHost 192.168.1.20। सेव करके डबल-क्लिक करें। सर्वर का टैली पोर्ट 9000 आपके ऑफ़िस नेटवर्क या VPN पर पहुँचने योग्य होना चाहिए।'}},
  {icon:'☁️',ui:'cloud',
   en:{t:'6. Cloud — Tally on a cloud or remote desktop',s:'Log in to the cloud desktop where Tally runs. Copy both connector files there and start the connector there. Then open SalonOS in the browser of that same cloud desktop and click Check.'},
   hi:{t:'6. क्लाउड — टैली क्लाउड या रिमोट डेस्कटॉप पर',s:'उस क्लाउड डेस्कटॉप में लॉगिन करें जहाँ टैली चलता है। दोनों कनेक्टर फ़ाइलें वहाँ कॉपी करें और कनेक्टर वहीं चालू करें। फिर उसी क्लाउड डेस्कटॉप के ब्राउज़र में SalonOS खोलें और Check दबाएँ।'}},
  {icon:'✅',ui:'use',
   en:{t:'7. Using it every day',s:'Choose the company and click Fetch ledgers. Ledgers missing in Tally are listed with Create them in Tally. New vendors and categories are created automatically when you open this tab. Send vouchers with the Push buttons — SalonOS shows how many Tally created or rejected.'},
   hi:{t:'7. रोज़ाना इस्तेमाल',s:'कंपनी चुनें और Fetch ledgers दबाएँ। जो लेजर टैली में नहीं हैं वे Create them in Tally के साथ दिखेंगे। नए वेंडर और कैटेगरी इस टैब को खोलते ही अपने-आप बन जाते हैं। Push बटन से वाउचर भेजें — SalonOS बताएगा कि टैली ने कितने बनाए या रिजेक्ट किए।'}},
];
function tallyGuidePictures({box,pill}){
  const mono={fontFamily:'Consolas, monospace',fontSize:11,background:'#0c1a33',color:'#9fe7a4',borderRadius:6,padding:'8px 10px',lineHeight:1.6};
  return{
    intro:React.createElement('div',{style:{...box,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},pill('SalonOS'),'⇄',pill('🔌 Connector',true),'⇄',pill('Tally (port 9000)')),
    tallycfg:React.createElement('div',{style:box},'F1 Help › Settings › Connectivity › Client/Server configuration',
      React.createElement('div',{style:{marginTop:8}},'TallyPrime acts as ',pill('Both',true),' Enable ODBC ',pill('Yes',true),' Port ',pill('9000',true))),
    download:React.createElement('div',{style:box},'Tally Export › 🔌 Tally Connector',React.createElement('div',{style:{marginTop:8}},pill('⬇ Start-SalonOS-Tally-Connector.bat',true),pill('⬇ SalonOS-Tally-Connector.ps1',true)),
      React.createElement('div',{style:{marginTop:8,animation:'bgIn .6s ease both 1s'}},'📁 Documents\\SalonOS\\ (both files together)')),
    local:React.createElement('div',{style:box},'🖱 double-click Start-SalonOS-Tally-Connector.bat',
      React.createElement('div',{style:{...mono,marginTop:8,animation:'bgIn .6s ease both .8s'}},'SalonOS Tally Connector 1.0',React.createElement('br'),'Listening on   http://localhost:9123/',React.createElement('br'),'Tally at       http://127.0.0.1:9000'),
      React.createElement('div',{style:{marginTop:8,animation:'bgIn .6s ease both 1.6s'}},pill('⟳ Check'),React.createElement('span',{className:'badge badge-green'},'Connected'))),
    server:React.createElement('div',{style:box},'Right-click the .bat › Edit — add at the end of the line:',
      React.createElement('div',{style:{...mono,marginTop:8}},'powershell ... SalonOS-Tally-Connector.ps1',React.createElement('span',{style:{color:'#ffd479'}},' -TallyHost 192.168.1.20'))),
    cloud:React.createElement('div',{style:box},'☁️ Cloud desktop (Tally runs here)',React.createElement('div',{style:{marginTop:8}},pill('Tally'),pill('🔌 Connector',true),pill('Browser: digitalca.co.in',true)),
      React.createElement('div',{style:{marginTop:8,fontSize:11,color:'var(--text3)'}},'All three on the same cloud desktop')),
    use:React.createElement('div',{style:box},pill('⟳ Fetch ledgers',true),pill('➕ Create them in Tally'),pill('Push Vendor Invoices'),
      React.createElement('div',{style:{marginTop:8,color:'var(--green)',animation:'bgIn .6s ease both 1s'}},'Vendor Invoices → Tally: 12 created')),
  };
}
function TallyGuideModal(props){
  return React.createElement(GuideModal,{...props,scenes:TALLY_GUIDE_SCENES,pictures:tallyGuidePictures,
    title:{en:'Tally Connector — how to run it',hi:'टैली कनेक्टर — कैसे चलाएँ'}});
}

// ── PDF bank statements ─────────────────────────────────────────────────────────────────────────
// Turns a statement PDF (as downloaded from any bank's website) into the same rows an Excel/CSV
// statement gives: [header, ...rows] with the Generic columns. Works from the text layout: a line
// that starts with a date is a transaction, amounts are matched to the Debit/Credit/Balance
// columns by their position under the header, and the running balance settles debit vs credit
// when a PDF's columns are unclear. Lines without a date continue the previous narration.
// Password-protected PDFs (banks often use customer ID / date of birth) ask for the password —
// it is used once and never stored.
const PDFJS_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const PDF_STATEMENT_HEADERS=['Transaction Date','Value Date','Description','Cheque/Ref No','Debit','Credit','Closing Balance'];
function isPdfFile(file){return !!file&&(/\.pdf$/i.test(file.name||'')||file.type==='application/pdf');}
function pdfNormDate(s){
  const M={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
  const t=String(s||'').trim().replace(/,/g,'');
  let m=t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if(m)return m[1].padStart(2,'0')+'/'+m[2].padStart(2,'0')+'/'+(m[3].length===2?'20'+m[3]:m[3]);
  m=t.match(/^(\d{1,2})[\/\-. ]([A-Za-z]{3,9})[\/\-. ](\d{2,4})$/);
  if(m&&M[m[2].toLowerCase().slice(0,m[2].length>4?3:m[2].length)]!=null){
    const mo=M[m[2].toLowerCase().slice(0,3)];
    return m[1].padStart(2,'0')+'/'+String(mo).padStart(2,'0')+'/'+(m[3].length===2?'20'+m[3]:m[3]);
  }
  m=t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m)return m[3]+'/'+m[2]+'/'+m[1];
  return '';
}
const PDF_DATE_RE=/^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[\/\-. ][A-Za-z]{3,9},?[\/\-. ]\d{2,4}|\d{4}-\d{2}-\d{2})$/;
const PDF_AMT_RE=/^\(?-?(?:₹|Rs\.?|INR)?\s*[\d,]*\d\.\d{1,2}\)?\s*(?:\(?(Cr|Dr|CR|DR)\)?)?$/;
function pdfAmount(s){
  const t=String(s).trim();
  const neg=/^\(|^-/.test(t)||/dr\)?$/i.test(t);
  const n=Number(t.replace(/cr|dr|rs\.?|inr|₹|[(),\s]/gi,''));
  return Number.isFinite(n)?(neg?-Math.abs(n):Math.abs(n)):null;
}
async function pdfStatementToRows(file,askPassword){
  await loadScript(PDFJS_URL);
  const lib=window.pdfjsLib;
  if(!lib)throw new Error('The PDF reader could not load — check your internet connection.');
  lib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER_URL;
  const bytes=new Uint8Array(await file.arrayBuffer());
  let pdf=null,password;
  for(let attempt=0;attempt<4;attempt++){
    try{pdf=await lib.getDocument({data:bytes.slice(),password}).promise;break;}
    catch(e){
      if(e&&e.name==='PasswordException'){
        password=askPassword?await askPassword(attempt>0):null;
        if(password==null||password==='')throw new Error('This PDF is password-protected — import cancelled.');
        continue;
      }
      throw new Error('Could not read this PDF ('+((e&&e.message)||e)+').');
    }
  }
  if(!pdf)throw new Error('Wrong PDF password — import cancelled.');
  // 1. Text runs → lines (same baseline), left to right. A run that starts with a date followed
  //    by more text is split, since some PDFs put the date and narration in one run.
  const lines=[];
  for(let p=1;p<=pdf.numPages;p++){
    const tc=await (await pdf.getPage(p)).getTextContent();
    const items=[];
    tc.items.forEach(it=>{
      const s=String(it.str||'').replace(/\s+/g,' ').trim();if(!s)return;
      const x=it.transform[4],y=it.transform[5],w=it.width||s.length*4;
      const parts=s.split(/\s{2,}|(?<=^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s(?=\S)/);
      if(parts.length>1){let off=0;const per=w/Math.max(1,s.length);parts.forEach(pt=>{const i=s.indexOf(pt,off);items.push({s:pt,x:x+i*per,w:pt.length*per,y});off=i+pt.length;});}
      else items.push({s,x,w,y});
    });
    items.sort((a,b)=>b.y-a.y||a.x-b.x);
    let cur=null;
    items.forEach(it=>{if(!cur||Math.abs(cur.y-it.y)>2.5){cur={y:it.y,items:[]};lines.push(cur);}cur.items.push(it);});
  }
  lines.forEach(l=>l.items.sort((a,b)=>a.x-b.x));
  // 2. Column positions from the header line(s).
  let cols=null;
  const colOf=(txt)=>{const t=txt.toLowerCase();
    if(/value/.test(t))return'vdate';
    if(/withdraw|debit|\bdr\b|paid out/.test(t))return'debit';
    if(/deposit|credit|\bcr\b|paid in/.test(t))return'credit';
    if(/balance/.test(t))return'balance';
    if(/chq|cheque|ref|instrument/.test(t))return'ref';
    if(/narration|particular|description|remark|detail/.test(t))return'desc';
    if(/date/.test(t))return'date';
    return null;};
  lines.forEach(l=>{
    if(cols)return;
    const txt=l.items.map(i=>i.s).join(' ').toLowerCase();
    if(/date/.test(txt)&&/balance/.test(txt)&&/(withdraw|debit|\bdr\b)/.test(txt)&&/(deposit|credit|\bcr\b)/.test(txt)){
      cols={};l.items.forEach(i=>{const c=colOf(i.s);if(c&&cols[c]==null){cols[c]=i.x+i.w;cols[c+'L']=i.x;}}); // right edge for amounts (right-aligned), left edge for text columns
    }
  });
  const nearestAmtCol=(it)=>{
    if(!cols)return null;
    let best=null,bd=1e9;
    ['debit','credit','balance'].forEach(c=>{if(cols[c]==null)return;const d=Math.abs((it.x+it.w)-cols[c]);if(d<bd){bd=d;best=c;}});
    return best;
  };
  // 3. Transactions.
  const out=[];let prevBal=null,last=null;
  lines.forEach(l=>{
    const toks=l.items;const txt=toks.map(i=>i.s).join(' ');const low=txt.toLowerCase();
    if(/opening balance|balance b\/?f|brought forward/.test(low)){
      const a=toks.filter(t=>PDF_AMT_RE.test(t.s)).map(t=>pdfAmount(t.s));if(a.length)prevBal=a[a.length-1];last=null;return;
    }
    if(/closing balance|^total|grand total|statement summary|page \d+ of \d+/.test(low)){last=null;return;}
    const first=toks[0];
    if(first&&PDF_DATE_RE.test(first.s)&&pdfNormDate(first.s)){
      const r={date:pdfNormDate(first.s),vdate:'',desc:[],ref:'',debit:0,credit:0,bal:null};
      let rest=toks.slice(1);
      if(rest[0]&&PDF_DATE_RE.test(rest[0].s)&&pdfNormDate(rest[0].s)){r.vdate=pdfNormDate(rest[0].s);rest=rest.slice(1);}
      const amts=[];
      rest.forEach(t=>{
        if(PDF_AMT_RE.test(t.s))amts.push(t);
        else if(cols&&cols.refL!=null&&!r.ref&&Math.abs(t.x-cols.refL)<12)r.ref=t.s;
        else r.desc.push(t.s);
      });
      if(!amts.length)return; // a date line with no amounts is not a transaction
      if(cols){
        amts.forEach(t=>{const c=nearestAmtCol(t),v=pdfAmount(t.s);if(v==null)return;
          if(c==='balance')r.bal=v;else if(c==='debit')r.debit=Math.abs(v);else if(c==='credit')r.credit=Math.abs(v);});
      }else{
        r.bal=pdfAmount(amts[amts.length-1].s);
        const others=amts.slice(0,-1).map(t=>Math.abs(pdfAmount(t.s)||0)).filter(v=>v>0);
        if(amts.length>=3){r.debit=Math.abs(pdfAmount(amts[amts.length-3].s)||0);r.credit=Math.abs(pdfAmount(amts[amts.length-2].s)||0);}
        else if(others.length)r.credit=others[0]; // direction settled from the balance below
      }
      // Running balance decides debit vs credit whenever it can.
      if(prevBal!=null&&r.bal!=null){
        const diff=Math.round((r.bal-prevBal)*100)/100,amt=r.debit||r.credit;
        if(amt&&Math.abs(Math.abs(diff)-amt)<0.011){if(diff<0){r.debit=amt;r.credit=0;}else{r.credit=amt;r.debit=0;}}
        else if(!amt&&diff){if(diff<0)r.debit=-diff;else r.credit=diff;}
      }
      if(r.bal!=null)prevBal=r.bal;
      out.push(r);last=r;
      return;
    }
    // Narration continued on the next line (no date, no amounts).
    if(last&&toks.length&&!toks.some(t=>PDF_AMT_RE.test(t.s))&&!/date|narration|particular|balance/.test(low))last.desc.push(txt);
  });
  if(!out.length)throw new Error('No transactions found in this PDF. If it is a scanned image rather than a downloaded statement, download the statement as Excel/CSV or a text PDF instead.');
  return[PDF_STATEMENT_HEADERS,...out.map(r=>[r.date,r.vdate||r.date,r.desc.join(' ').replace(/\s+/g,' ').trim(),r.ref,r.debit||'',r.credit||'',r.bal==null?'':r.bal])];
}

// ── Fetch from bank (Account Aggregator) ────────────────────────────────────────────────────────
// Any bank / any account type on India's RBI Account Aggregator network, through the "bank-aa"
// edge function (Setu). Linking opens the AA's own page where the account holder approves with an
// OTP — SalonOS never asks for or stores a bank password. After approval, statements for any
// period are fetched on demand and handed to onImport (the Bank Statement tab's duplicate-safe
// append). Accounts are linked per outlet.
async function bankAaCall(action,payload){
  const supa=await getSupabaseClient();
  const{data,error}=await supa.functions.invoke('bank-aa',{body:{action,...payload}});
  if(error){
    let msg=error.message||'Could not reach the bank service';
    try{const b=error.context&&await error.context.json();if(b&&b.error)msg=b.error;}catch(e){}
    throw new Error(msg);
  }
  if(data&&data.error&&!data.notConfigured)throw new Error(data.error);
  return data||{};
}
function BankFetchPanel({salonId,canEdit,onImport}){
  const isoOf=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const today=new Date();
  const [state,setState]=useState({loading:true,notConfigured:false,links:[],error:''});
  const [sel,setSel]=useState('');
  const [from,setFrom]=useState(isoOf(new Date(today.getFullYear(),today.getMonth(),1)));
  const [to,setTo]=useState(isoOf(today));
  const [busy,setBusy]=useState('');
  const [msg,setMsg]=useState({text:'',bad:false});
  const [showLink,setShowLink]=useState(false);
  const [linkForm,setLinkForm]=useState({label:'',mobile:''});
  const load=useCallback(async(quiet)=>{
    if(!CLOUD_SYNC_ENABLED||salonId==null){setState({loading:false,notConfigured:true,links:[],error:''});return;}
    if(!quiet)setState(s=>({...s,loading:true}));
    try{
      const d=await bankAaCall('list',{outlet_id:salonId});
      if(d.notConfigured){setState({loading:false,notConfigured:true,links:[],error:''});return;}
      const links=(d.links||[]).filter(l=>l.status!=='REVOKED');
      setState({loading:false,notConfigured:false,links,error:''});
      setSel(s=>links.some(l=>l.id===s)?s:((links.find(l=>l.status==='ACTIVE')||links[0]||{}).id||''));
    }catch(e){setState(s=>({...s,loading:false,error:e.message}));}
  },[salonId]);
  useEffect(()=>{load();},[load]);
  // While an approval is pending, re-check every 6 s (the OTP page is in another tab).
  const pending=state.links.some(l=>l.status==='PENDING');
  useEffect(()=>{if(!pending)return;const t=setInterval(()=>load(true),6000);return()=>clearInterval(t);},[pending,load]);
  const setRange=(f,t)=>{setFrom(isoOf(f));setTo(isoOf(t));};
  const quick=[
    ['Yesterday',()=>{const d=new Date(today);d.setDate(d.getDate()-1);setRange(d,d);}],
    ['Last 7 days',()=>{const d=new Date(today);d.setDate(d.getDate()-6);setRange(d,today);}],
    ['This month',()=>setRange(new Date(today.getFullYear(),today.getMonth(),1),today)],
    ['Last month',()=>setRange(new Date(today.getFullYear(),today.getMonth()-1,1),new Date(today.getFullYear(),today.getMonth(),0))],
    ['This FY',()=>{const y=today.getMonth()>=3?today.getFullYear():today.getFullYear()-1;setRange(new Date(y,3,1),today);}],
  ];
  const link=async()=>{
    const mobile=linkForm.mobile.replace(/\D/g,'');
    if(mobile.length!==10){setMsg({text:'Enter the 10-digit mobile number registered with the bank.',bad:true});return;}
    setBusy('link');setMsg({text:'',bad:false});
    // Open the approval tab right away (inside the click) so pop-up blockers allow it.
    const w=window.open('about:blank','_blank');
    try{
      const d=await bankAaCall('link',{outlet_id:salonId,label:linkForm.label.trim(),mobile,redirect_url:location.origin+location.pathname});
      if(d.notConfigured){if(w)w.close();setState(s=>({...s,notConfigured:true}));return;}
      if(w)w.location.href=d.url;else window.open(d.url,'_blank');
      setShowLink(false);setLinkForm({label:'',mobile:''});
      setMsg({text:'Approval page opened in a new tab — enter the OTP there and choose the account(s) to share. This screen updates by itself once approved.',bad:false});
      await load(true);
      if(d.link)setSel(d.link.id);
    }catch(e){if(w)w.close();setMsg({text:e.message,bad:true});}
    finally{setBusy('');}
  };
  const fetchNow=async()=>{
    if(!sel)return;
    if(from>to){setMsg({text:'From date must be on or before To date.',bad:true});return;}
    setBusy('fetch');setMsg({text:'Fetching from the bank… this usually takes 5–30 seconds.',bad:false});
    try{
      const d=await bankAaCall('fetch',{id:sel,from,to});
      const txns=d.transactions||[];
      const res=onImport(txns);
      const accs=(d.accounts||[]).map(a=>(a.masked||'account')+(a.type?' ('+a.type+')':'')).join(', ');
      setMsg({text:(txns.length?'Fetched '+txns.length+' transaction'+(txns.length===1?'':'s'):'No transactions in that period')+(accs?' from '+accs:'')+' · '+res.added+' new added'+(res.skipped?' · '+res.skipped+' already in the statement skipped':'')+(d.status==='PARTIAL'?' · some accounts did not respond — try again later for those.':'')+'.',bad:false});
      load(true);
    }catch(e){setMsg({text:e.message,bad:true});}
    finally{setBusy('');}
  };
  const unlink=async(l)=>{
    if(!confirm('Remove "'+l.label+'"? Its approval is cancelled at the bank’s end too. Already imported rows stay.'))return;
    setBusy('unlink');
    try{await bankAaCall('unlink',{id:l.id});setMsg({text:'"'+l.label+'" removed.',bad:false});await load(true);}
    catch(e){setMsg({text:e.message,bad:true});}
    finally{setBusy('');}
  };
  const STATUS={ACTIVE:['✅ Approved','var(--green)'],PENDING:['⏳ Waiting for approval (OTP)','var(--orange)'],REJECTED:['✖ Declined','var(--red)'],EXPIRED:['⌛ Expired — link again','var(--red)'],PAUSED:['⏸ Paused','var(--orange)']};
  const selLink=state.links.find(l=>l.id===sel);
  const sub={fontSize:11.5,color:'var(--text3)',lineHeight:1.6};
  return React.createElement('div',{className:'card',style:{marginBottom:16,border:'1px solid rgba(47,95,224,0.3)',background:'rgba(47,95,224,0.05)'}},
    React.createElement('div',{style:{display:'flex',gap:12,alignItems:'flex-start',flexWrap:'wrap'}},
      React.createElement('div',{style:{fontSize:20}},'🏦'),
      React.createElement('div',{style:{flex:1,minWidth:260}},
        React.createElement('div',{style:{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:4}},'Fetch statement from bank — automatic'),
        React.createElement('div',{style:{...sub,marginBottom:10}},'Works with any bank and any account type (savings, current, OD/CC…) through the RBI-approved Account Aggregator. Link an account once with an OTP — no bank password is ever entered here — then pick a period and fetch. New transactions are added; ones already here are skipped.'),
        state.loading?React.createElement('div',{style:sub},'Loading linked accounts…'):
        state.notConfigured?React.createElement('div',{style:{fontSize:12,color:'var(--orange)',lineHeight:1.6}},'Not switched on yet. A Super Admin needs to add the Account Aggregator (Setu) keys in Supabase → Edge Functions → Secrets: SETU_CLIENT_ID, SETU_CLIENT_SECRET, SETU_PRODUCT_INSTANCE_ID (and SETU_ENV = production when going live). Meanwhile, use the upload box below.'):
        React.createElement(React.Fragment,null,
          state.error&&React.createElement('div',{style:{fontSize:12,color:'var(--red)',marginBottom:8}},state.error),
          state.links.length>0&&React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:6,marginBottom:10}},
            state.links.map(l=>{const st=STATUS[l.status]||[l.status,'var(--text3)'];
              return React.createElement('label',{key:l.id,style:{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',borderRadius:'var(--r)',border:'1px solid '+(sel===l.id?'var(--accent)':'var(--border2)'),background:'var(--bg2)',cursor:'pointer',flexWrap:'wrap'}},
                React.createElement('input',{type:'radio',name:'bankAaSel',checked:sel===l.id,onChange:()=>setSel(l.id)}),
                React.createElement('span',{style:{fontWeight:600,fontSize:12.5}},l.label),
                (l.accounts||[]).length>0&&React.createElement('span',{style:{fontSize:11,color:'var(--text2)'}},(l.accounts||[]).map(a=>(a.masked||'')+(a.type?' '+a.type:'')).join(', ')),
                React.createElement('span',{style:{fontSize:11,color:st[1]}},st[0]),
                l.last_fetch_at&&React.createElement('span',{style:{fontSize:10.5,color:'var(--text3)'}},'last fetched '+new Date(l.last_fetch_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})),
                canEdit&&React.createElement('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:'auto',fontSize:11,padding:'2px 8px'},disabled:!!busy,onClick:e=>{e.preventDefault();unlink(l);}},'Remove'));
            })
          ),
          selLink&&selLink.status==='ACTIVE'&&canEdit&&React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:8,marginBottom:10}},
            React.createElement('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},quick.map(([t,fn])=>React.createElement('button',{key:t,className:'btn btn-ghost btn-sm',style:{fontSize:11,padding:'3px 9px'},onClick:fn},t))),
            React.createElement('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
              React.createElement('label',{style:{fontSize:12,color:'var(--text2)'}},'From'),
              React.createElement('input',{type:'date',className:'form-control',style:{width:'auto'},value:from,max:to,onChange:e=>setFrom(e.target.value)}),
              React.createElement('label',{style:{fontSize:12,color:'var(--text2)'}},'To'),
              React.createElement('input',{type:'date',className:'form-control',style:{width:'auto'},value:to,min:from,max:isoOf(today),onChange:e=>setTo(e.target.value)}),
              React.createElement('button',{className:'btn btn-primary btn-sm',disabled:!!busy,onClick:fetchNow},busy==='fetch'?'Fetching…':'⬇ Fetch & import')
            )
          ),
          selLink&&selLink.status==='PENDING'&&React.createElement('div',{style:{fontSize:12,color:'var(--orange)',marginBottom:10}},'Waiting for the OTP approval in the other tab. This updates by itself — or click ',
            React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:11,padding:'2px 8px'},onClick:()=>load()},'Check now')),
          canEdit&&(showLink
            ?React.createElement('div',{style:{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap',padding:10,border:'1px dashed var(--border2)',borderRadius:'var(--r)'}},
                React.createElement('div',null,React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:3}},'Name for this account'),
                  React.createElement('input',{className:'form-control',style:{width:200},placeholder:'e.g. HDFC Current',value:linkForm.label,onChange:e=>setLinkForm(f=>({...f,label:e.target.value}))})),
                React.createElement('div',null,React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:3}},'Mobile number registered with the bank'),
                  React.createElement('input',{className:'form-control',style:{width:170},inputMode:'numeric',maxLength:14,placeholder:'10-digit mobile',value:linkForm.mobile,onChange:e=>setLinkForm(f=>({...f,mobile:e.target.value}))})),
                React.createElement('button',{className:'btn btn-primary btn-sm',disabled:!!busy,onClick:link},busy==='link'?'Opening…':'Link & approve with OTP'),
                React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setShowLink(false)},'Cancel'))
            :React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setShowLink(true)},'➕ Link a bank account')),
          !canEdit&&React.createElement('div',{style:sub},'You have view-only access here — fetching is available to users who can edit this Bank Statement.')
        ),
        msg.text&&React.createElement('div',{style:{marginTop:8,fontSize:12,color:msg.bad?'var(--red)':'var(--green)',lineHeight:1.6}},msg.text)
      )
    )
  );
}

// Salary / Incentive auto-link core (see autoLinkSalaryPayments in BankStatement): settles what it
// is sure of and returns {settledByRow: Map(row id -> linkedEmployeePay records), total}.
function autoSettleSalaryRows(salonId,candidates){
  const periodFromTransactionDate=dmy=>{const iso=toISO(dmy);const d=iso?new Date(iso+'T00:00:00'):null;return(d&&!isNaN(d))?{year:d.getFullYear(),month:d.getMonth()}:null;};
  const norm=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,' ').replace(/\s+/g,' ').trim();
  const emps=loadEmployees(salonId).filter(e=>e&&e.name&&e.status!=='Left'&&e.status!=='Inactive');
  const used=new Set(); // employee|year|month|component already settled in this run
  const settledByRow=new Map();
  let total=0;
  candidates.forEach(r=>{
    const desc=' '+norm(r.description)+' ',digits=String(r.description||'').replace(/\D/g,'');
    const hits=emps.filter(e=>{const n=norm(e.name);const acct=String(e.accountNo||'').replace(/\D/g,'');
      return(n.length>=4&&desc.indexOf(' '+n+' ')!==-1)||(acct.length>=6&&digits.indexOf(acct)!==-1);});
    if(hits.length!==1)return;
    const e=hits[0];
    const p=periodFromTransactionDate(r.transactionDate);if(!p)return;
    const options=[];
    [0,-1,-2].forEach(off=>{
      const d=new Date(p.year,p.month+off,1),y=d.getFullYear(),m=d.getMonth();
      if(((monthLockRecordFor(salonId,y,m))||{}).locked)return;
      const sal=used.has(e.id+'|'+y+'|'+m+'|s')?0:employeeSalaryOutstandingFor(salonId,e.id,y,m);
      const inc=used.has(e.id+'|'+y+'|'+m+'|i')?0:employeeIncentiveOutstandingFor(salonId,e.id,y,m);
      if(sal>0&&Math.abs(sal-r.debit)<1)options.push({y,m,salary:sal,incentive:0});
      if(inc>0&&Math.abs(inc-r.debit)<1)options.push({y,m,salary:0,incentive:inc});
      if(sal>0&&inc>0&&Math.abs(sal+inc-r.debit)<1)options.push({y,m,salary:sal,incentive:inc});
    });
    if(options.length!==1)return;
    const c=options[0];
    const res=settleEmployeePayFor(salonId,e.id,c.y,c.m,{salaryAmt:c.salary,incentiveAmt:c.incentive,dailyIncentiveByCat:{}});
    if(!res.salarySettled&&!res.incentiveSettled)return;
    if(c.salary)used.add(e.id+'|'+c.y+'|'+c.m+'|s');
    if(c.incentive)used.add(e.id+'|'+c.y+'|'+c.m+'|i');
    total+=r.debit;
    settledByRow.set(r.id,[{employeeId:e.id,employeeName:e.name,year:c.y,month:c.m,salary:c.salary,incentive:c.incentive,dailyIncentive:0,dailyIncentiveByCat:{},
      salarySettled:res.salarySettled,incentiveSettled:res.incentiveSettled,dailyIncentiveSettled:{},auto:true}]);
  });
  return{settledByRow,total};
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
  // Where each bank's net banking starts — the login pages each bank links from its own website,
  // checked to open on 29 Sep 2026. Banks without a confirmed login page open their official home
  // page ("Login" is one click away there). A saved account's own login address, if given, wins.
  const homeOnly=u=>({Personal:u,Corporate:u,Business:u});
  const BANK_LOGIN_URLS={
    'HDFC Bank':homeOnly('https://now.hdfc.bank.in/retail-app/'), // HDFC NetBanking (the old netbanking.hdfcbank.com redirects here)
    'ICICI Bank':{Personal:'https://retailnetbanking.icici.bank.in/login-page',
      Corporate:'https://cibnext.icici.bank.in/corp/AuthenticationController?FORMSGROUP_ID__=AuthenticationFG&__START_TRAN_FLAG__=Y&FG_BUTTONS__=LOAD&ACTION.LOAD=Y&AuthenticationFG.LOGIN_FLAG=1&BANK_ID=ICI',
      Business:'https://cibnext.icici.bank.in/corp/AuthenticationController?FORMSGROUP_ID__=AuthenticationFG&__START_TRAN_FLAG__=Y&FG_BUTTONS__=LOAD&ACTION.LOAD=Y&AuthenticationFG.LOGIN_FLAG=1&BANK_ID=ICI'},
    'Axis Bank':{Personal:'https://omni.axis.bank.in/axisretailbanking/',Corporate:'https://straight2axis.axis.bank.in/CorporatePortal/login',Business:'https://smedigital.axis.bank.in/sbbcj/login'},
    'State Bank of India':{Personal:'https://onlinesbi.sbi.bank.in/',Corporate:'https://corp.sbi.bank.in/corporate/sbi/sbi_home.html',Business:'https://corp.sbi.bank.in/corporate/sbi/sbi_home.html'},
    'Kotak Mahindra Bank':homeOnly('https://netbanking.kotak.bank.in/knb2/'),
    'Bank of Baroda':{Personal:'https://bobibanking.bankofbaroda.bank.in/',
      Corporate:'https://feba.bobibanking.com/corp/AuthenticationController?FORMSGROUP_ID__=AuthenticationFG&__START_TRAN_FLAG__=Y&FG_BUTTONS__=LOAD&ACTION.LOAD=Y&AuthenticationFG.LOGIN_FLAG=1&BANK_ID=012',
      Business:'https://feba.bobibanking.com/corp/AuthenticationController?FORMSGROUP_ID__=AuthenticationFG&__START_TRAN_FLAG__=Y&FG_BUTTONS__=LOAD&ACTION.LOAD=Y&AuthenticationFG.LOGIN_FLAG=1&BANK_ID=012'},
    'Punjab National Bank':homeOnly('https://www.pnbindia.in/'),
    'Canara Bank':homeOnly('https://www.canarabank.bank.in/'),
    'Union Bank of India':homeOnly('https://www.unionbankofindia.bank.in/'),
    'IndusInd Bank':{Personal:'https://indusnet.indusind.bank.in/login',
      Corporate:'https://indusnet.indusind.bank.in/corp/BANKAWAY?Action.RetUser.Init.001=Y&AppSignonBankId=234&AppType=corporate&CorporateSignonLangId=001',
      Business:'https://indusnet.indusind.bank.in/corp/BANKAWAY?Action.RetUser.Init.001=Y&AppSignonBankId=234&AppType=corporate&CorporateSignonLangId=001'},
    'Yes Bank':homeOnly('https://www.yesbank.in/'),
    'IDFC FIRST Bank':homeOnly('https://my.idfcfirst.bank.in/login'),
    'RBL Bank':homeOnly('https://www.rblbank.com/'),
    'Federal Bank':homeOnly('https://www.federalbank.co.in/'),
    'Bank of India':homeOnly('https://www.bankofindia.bank.in/'),
    'IDBI Bank':homeOnly('https://www.idbibank.in/'),
    'Bandhan Bank':homeOnly('https://bandhanbank.com/'),
    'Central Bank of India':homeOnly('https://www.centralbankofindia.co.in/'),
    'UCO Bank':homeOnly('https://www.ucobank.com/'),
    'Indian Overseas Bank':homeOnly('https://www.iob.bank.in/'),
    'South Indian Bank':homeOnly('https://www.southindianbank.bank.in/'),
    'Karnataka Bank':homeOnly('https://www.karnatakabank.bank.in/'),
    'Standard Chartered Bank':homeOnly('https://www.sc.com/in/'),
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
  // Self-heal: earlier builds misread some banks' exports (HDFC's .xls header sits on row 21) and saved
  // the account holder's address, "****" lines, date-only rows with no amounts, the statement-summary
  // line and the bank's footer notes as rows. Anything that isn't a transaction (isTxnRow) is removed
  // once, and the screen says so — those rows had nothing in them to link or classify.
  useEffect(()=>{
    const n=rows.filter(r=>!isTxnRow(r)).length;
    if(!n)return;
    setRows(prev=>prev.filter(isTxnRow));
    setMessage('Cleaned up '+n+' line'+(n===1?'':'s')+' an earlier import had saved by mistake (bank address, date-only rows without amounts, totals and footer notes) — they were not transactions. Import the statement again now to bring in anything that was missed.');
    // eslint-disable-next-line
  },[salonId]);

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

  // since (ms): during a guided download, any statement-type file saved after that moment counts,
  // whatever the bank named it; otherwise the file name must look like a statement.
  const findLatestStatement=async(handle,since)=>{
    let best=null;
    const tokens=['statement','txn','transaction','acct','account','stmt','passbook','history',...bankTokens()];
    for await (const entry of handle.values()){
      if(entry.kind!=='file')continue;
      const name=entry.name.toLowerCase();
      if(!/\.(xlsx|xls|csv|pdf)$/.test(name))continue;
      if(!since&&!tokens.some(t=>name.includes(t)))continue;
      const file=await entry.getFile();
      if(since&&file.lastModified<since)continue;
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
      setAutoStatus('Auto-imported "'+best.file.name+'" from your connected folder.');
      setDirNeedsPermission(false);
    }catch(err){
      setAutoStatus('Auto-import check failed: '+err.message);
    }
    setAutoBusy(false);
  };

  // "📄 Choose file": opens the file window straight in Downloads (Chrome/Edge), newest statement one
  // click away; other browsers get the normal file box.
  const chooseStatementFile=async()=>{
    if(typeof window.showOpenFilePicker==='function'){
      try{
        const [h]=await window.showOpenFilePicker({id:'bank-statement-file',startIn:'downloads',multiple:false,
          types:[{description:'Bank statement',accept:{'application/vnd.ms-excel':['.xls'],'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx'],'text/csv':['.csv'],'application/pdf':['.pdf']}}]});
        if(h)await onGuidedFile(await h.getFile());
        return;
      }catch(err){if(err&&err.name==='AbortError')return;}
    }
    gFileRef.current&&gFileRef.current.click();
  };
  // Chrome and Edge never let a website open the whole Downloads (or Desktop / Documents) folder —
  // "can't open this folder because it contains system files". A folder INSIDE Downloads is allowed,
  // so the window opens in Downloads and the card asks for a "Bank Statements" folder there.
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
    setAutoStatus('Disconnected from the statements folder.');
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

  // ── Guided statement download — the bank login always happens on the bank's own website ──
  // Saved accounts (per outlet, any bank / account type) → pick a period → "Open bank website" →
  // log in there and download → the new file is picked up from the connected Downloads folder and
  // imported by itself, keeping only that period and skipping duplicates.
  const BANK_ACCOUNT_TYPES=['Current','Savings','OD / CC','Salary','NRE / NRO','Other'];
  const acctKey=outletKey('salonos_bank_accounts',salonId);
  const [bankAccounts,setBankAccounts]=useState(()=>{try{const a=JSON.parse(cachedLocalGet(acctKey)||'[]');return Array.isArray(a)?a:[];}catch(e){return[];}});
  useEffect(()=>{safeLocalSet(acctKey,JSON.stringify(bankAccounts));},[bankAccounts,acctKey]);
  const [gAcctId,setGAcctId]=useState(()=>{try{return(JSON.parse(cachedLocalGet(acctKey)||'[]')[0]||{}).id||'';}catch(e){return'';}});
  const gAcct=bankAccounts.find(a=>a.id===gAcctId)||bankAccounts[0]||null;
  const gIso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const gToday=new Date();
  const [gFrom,setGFrom]=useState(()=>gIso(new Date(gToday.getFullYear(),gToday.getMonth(),1)));
  const [gTo,setGTo]=useState(()=>gIso(gToday));
  const [acctForm,setAcctForm]=useState(null); // null, or the account being added/edited
  const [guideLang,setGuideLang]=useState(null); // 'en' | 'hi' while the walkthrough is open
  const guideButtons=React.createElement('span',{style:{display:'inline-flex',gap:6,flexWrap:'wrap'}},
    React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:11,padding:'3px 10px'},onClick:()=>setGuideLang('en')},'▶ Watch how it works'),
    React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:11,padding:'3px 10px'},onClick:()=>setGuideLang('hi')},'▶ हिंदी में देखें'));
  const [waitSince,setWaitSince]=useState(0);
  const [gStatus,setGStatus]=useState({text:'',bad:false});
  const loadWorkbookRef=useRef(null);
  const acctLoginUrl=(a)=>a&&((a.url&&/^https:\/\//i.test(a.url))?a.url:((BANK_LOGIN_URLS[a.bank]||{})[a.loginType||'Personal']||''));
  const gQuick=[
    ['Yesterday',()=>{const d=new Date(gToday);d.setDate(d.getDate()-1);setGFrom(gIso(d));setGTo(gIso(d));}],
    ['Last 7 days',()=>{const d=new Date(gToday);d.setDate(d.getDate()-6);setGFrom(gIso(d));setGTo(gIso(gToday));}],
    ['This month',()=>{setGFrom(gIso(new Date(gToday.getFullYear(),gToday.getMonth(),1)));setGTo(gIso(gToday));}],
    ['Last month',()=>{setGFrom(gIso(new Date(gToday.getFullYear(),gToday.getMonth()-1,1)));setGTo(gIso(new Date(gToday.getFullYear(),gToday.getMonth(),0)));}],
    ['This FY',()=>{const y=gToday.getMonth()>=3?gToday.getFullYear():gToday.getFullYear()-1;setGFrom(gIso(new Date(y,3,1)));setGTo(gIso(gToday));}],
  ];
  const saveAcct=()=>{
    const f=acctForm;if(!f)return;
    if(!f.bank.trim()){setGStatus({text:'Choose or type the bank name.',bad:true});return;}
    const url=(f.url||'').trim();
    if(!BANK_LOGIN_URLS[f.bank]&&!/^https:\/\//i.test(url)){setGStatus({text:'For a bank not in the list, paste its net-banking login address (starting with https://).',bad:true});return;}
    const clean={id:f.id||('ba'+Date.now().toString(36)),label:(f.label||'').trim()||f.bank+(f.type?' '+f.type:''),bank:f.bank.trim(),loginType:f.loginType||'Personal',type:f.type||'Current',last4:String(f.last4||'').replace(/\D/g,'').slice(-4),url:/^https:\/\//i.test(url)?url:''};
    setBankAccounts(p=>f.id?p.map(a=>a.id===f.id?clean:a):[...p,clean]);
    setGAcctId(clean.id);setAcctForm(null);setGStatus({text:'Saved "'+clean.label+'".',bad:false});
  };
  const removeAcct=(a)=>{if(!confirm('Remove "'+a.label+'" from this list? Imported statement rows stay.'))return;setBankAccounts(p=>p.filter(x=>x.id!==a.id));};
  const openBankSite=async()=>{
    if(!gAcct)return;
    if(gFrom>gTo){setGStatus({text:'From date must be on or before To date.',bad:true});return;}
    const url=acctLoginUrl(gAcct);
    if(!url){setGStatus({text:'No login address saved for this account — edit it and add one.',bad:true});return;}
    window.open(url,'_blank','noopener,noreferrer'); // first, while the click still allows pop-ups
    if(BANKS[gAcct.bank])setBank(gAcct.bank);
    setWaitSince(Date.now()-3000);
    if(dirHandle){
      try{let perm=await dirHandle.queryPermission({mode:'read'});if(perm!=='granted')perm=await dirHandle.requestPermission({mode:'read'});setDirNeedsPermission(perm!=='granted');}catch(e){}
    }
    setGStatus({text:'Bank website opened. Log in there, choose '+gFrom.split('-').reverse().join('/')+' to '+gTo.split('-').reverse().join('/')+' and download the statement (Excel, CSV or PDF). '+(dirHandle?'This page will import it by itself once it is saved in your connected folder.':'Then press 📄 Choose file (it opens in Downloads) or drop the file in the upload box below.'),bad:false});
  };
  // While waiting, look for the new download every 3 s (up to 20 minutes). The folder's file names
  // are noted when waiting starts; any file that appears after that is the download — whatever its
  // name, and whatever date the bank stamped on it (some downloads keep the server's old date, so a
  // time check alone missed them). What the watcher sees is shown, so a download that went to a
  // different folder or came as another file type is obvious.
  const [watchInfo,setWatchInfo]=useState('');
  const STATEMENT_EXT=/\.(xlsx|xls|csv|pdf)$/i;
  useEffect(()=>{
    if(!waitSince||!dirHandle)return;
    let stop=false,busy=false,known=null;
    const otherNew=new Set();
    const listNames=async()=>{const names=new Set();for await(const e of dirHandle.values()){if(e.kind==='file')names.add(e.name);}return names;};
    const tick=async()=>{
      if(stop||busy)return;
      if(Date.now()-waitSince>20*60*1000){setWaitSince(0);setWatchInfo('');setGStatus({text:'Stopped waiting for the download (20 minutes). Click "Open bank website" again when ready, or use "Choose file".',bad:true});return;}
      busy=true;
      try{
        if(await dirHandle.queryPermission({mode:'read'})!=='granted'){setDirNeedsPermission(true);setWatchInfo('Folder access needs to be allowed again — click "🔓 Allow folder access".');return;}
        setDirNeedsPermission(false);
        const names=await listNames();
        if(!known){known=names;setWatchInfo('Watching folder "'+dirHandle.name+'" ('+names.size+' files already there). Waiting for the new download…');return;}
        const fresh=[...names].filter(n=>!known.has(n));
        const stmt=[];
        for(const n of fresh){
          if(/\.(crdownload|part|tmp|download)$/i.test(n))continue; // still downloading
          if(!STATEMENT_EXT.test(n)){otherNew.add(n);continue;}
          try{const f=await (await dirHandle.getFileHandle(n)).getFile();if(f.size>0)stmt.push(f);}catch(e){}
        }
        // Fallback: a statement file saved after the click even if its name was already there.
        if(!stmt.length){const best=await findLatestStatement(dirHandle,waitSince);if(best&&!known.has(best.file.name))stmt.push(best.file);}
        if(stmt.length&&!stop){
          const file=stmt.sort((a,b)=>b.lastModified-a.lastModified)[0];
          stop=true;setWaitSince(0);setWatchInfo('');
          setGStatus({text:'Found "'+file.name+'" — importing…',bad:false});
          guidedPendingRef.current=true;
          await loadWorkbookRef.current(file,{from:gFrom,to:gTo,append:true});
          lastAutoRef.current=file.name+'|'+file.lastModified;
          safeLocalSet(outletKey('salonos_bank_last_auto',salonId),lastAutoRef.current);
          return;
        }
        const t=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
        setWatchInfo(otherNew.size
          ?'A new file arrived but it is not Excel, CSV or PDF: "'+[...otherNew].slice(-1)[0]+'". If it is a ZIP, open it and save the statement into "'+dirHandle.name+'"; or download the statement again as Excel/CSV/PDF. (checked '+t+')'
          :'Watching folder "'+dirHandle.name+'" — no new file yet (checked '+t+'). If your download finished, it may have gone to another folder: use "Choose file" below, or reconnect the folder your browser saves to.');
      }catch(e){setWatchInfo('');setGStatus({text:'Could not read the connected folder: '+e.message,bad:true});}
      finally{busy=false;}
    };
    const t=setInterval(tick,3000);tick();
    return()=>{stop=true;clearInterval(t);};
    // eslint-disable-next-line
  },[waitSince,dirHandle]);
  // Backup: pick the downloaded file by hand — same period filter and duplicate check.
  const gFileRef=useRef(null);
  const onGuidedFile=async(e)=>{
    const f=e&&e.target?(e.target.files&&e.target.files[0]):e;if(e&&e.target)e.target.value='';
    if(!f)return;
    setWaitSince(0);setWatchInfo('');
    setGStatus({text:'Importing "'+f.name+'"…',bad:false});
    guidedPendingRef.current=true;
    await loadWorkbookRef.current(f,{from:gFrom,to:gTo,append:true});
  };
  // Show the import's own result (rows added / skipped, or why it failed) right in this card.
  const guidedPendingRef=useRef(false);
  useEffect(()=>{
    if(!guidedPendingRef.current||!message)return;
    guidedPendingRef.current=false;
    setGStatus({text:(gAcct?gAcct.label+': ':'')+message,bad:/failed|couldn’t|could not|no transactions/i.test(message)});
    // eslint-disable-next-line
  },[message]);

  const keyNorm=(v)=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const val=(r,names)=>{const keys=Object.keys(r);for(const name of names){const hit=keys.find(k=>keyNorm(k)===keyNorm(name));if(hit!==undefined)return r[hit];}return'';};
  const num=(v)=>{if(v===undefined||v===null||v==='')return 0;const n=Number(String(v).replace(/[₹,\s()]/g,'').replace(/^-/,'-'));return Number.isFinite(n)?n:0;};
  const MONTH_ABBR={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
  const fmtDate=(v,swap)=>{
    if(v===undefined||v===null||v==='')return'';
    if(v instanceof Date&&!isNaN(v)){v=excelCellDate(v);return String(v.getDate()).padStart(2,'0')+'/'+String(v.getMonth()+1).padStart(2,'0')+'/'+v.getFullYear();}
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
  // Scans the first 80 rows (HDFC's .xls, for one, has 20 lines of account details before the header —
  // a 20-row limit missed it and the whole file was misread). A header cell is short text; a row whose
  // following rows start with dates gets a bonus, so an address or "Statement period" line never wins.
  const findHeaderRowIndex=(rawRows)=>{
    let bestIdx=0,bestScore=-1;
    const scanLimit=Math.min(rawRows.length,80);
    for(let i=0;i<scanLimit;i++){
      const row=rawRows[i]||[];
      const nonEmpty=row.filter(c=>String(c||'').trim()!=='');
      if(nonEmpty.length<3)continue; // a real header row has several columns
      let score=0;
      nonEmpty.forEach(c=>{
        const s=String(c).toLowerCase();
        if(s.length<=40&&HEADER_ROW_KEYWORDS.some(k=>s.includes(k)))score++;
      });
      if(score<2)continue;
      const next=rawRows.slice(i+1,i+6).filter(r=>(r||[]).some(c=>String(c||'').trim()!==''&&!/^\*+$/.test(String(c).trim())));
      if(next.some(r=>(r||[]).slice(0,3).some(c=>looksLikeDateVal(c))))score+=3;
      if(score>bestScore){bestScore=score;bestIdx=i;}
    }
    return bestScore>=2?bestIdx:0; // need at least 2 keyword hits to trust it; otherwise assume row 1
  };
  // A real transaction line: a proper date and money in or out. Everything else in a bank's export —
  // "****" separator lines, the account holder's address, opening-balance and summary lines, the
  // bank's footer notes — is left out.
  // (Year 2000–2099: the statement-summary line's big balance figure otherwise reads as a date in year 3597.)
  const isTxnRow=(r)=>{const m=/^\d{1,2}\/\d{1,2}\/(\d{4})$/.exec(String(r.transactionDate||'').trim());return !!m&&+m[1]>=2000&&+m[1]<=2099&&(Number(r.debit)>0||Number(r.credit)>0);};
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
    if(desc.includes('swiggy')||desc.includes('bundl tech'))return{nature:'Swiggy Settlement',cradleeDate:baseDate};
    if(desc.includes('zomato'))return{nature:'Zomato Settlement',cradleeDate:baseDate};
    if(desc.includes('eazydiner')||desc.includes('eazy diner'))return{nature:'EazyDiner Settlement',cradleeDate:baseDate};
    if(desc.includes('ownly'))return{nature:'Ownly Settlement',cradleeDate:baseDate};
    if(/eat\s?by\s?minute/.test(desc))return{nature:'Eatby Minutes Settlement',cradleeDate:baseDate};
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
  const applyAutoClassification=(list,force)=>{const learned=bankLearnedNatures(rows);return list.map(r=>{
    let cls=classifyNatureAndDate(r.description,r.credit,r.valueDate,r.transactionDate);
    if(!cls){
      const debitNature=classifyDebitNature(r.description,r.debit,vendors);
      if(debitNature)cls={nature:debitNature,cradleeDate:''};
    }
    // No rule matched — use the Nature given earlier to lines with the same narration pattern.
    if(!cls&&!r.nature){const ln=bankLearnedNatureFor(learned,r);if(ln)return{...r,nature:ln,natureLearned:true};}
    if(!cls)return r;
    // Default (force=false, used on fresh import): only fill in blanks.
    // Force mode (used by the Re-classify button): overwrite with whatever the rules produce —
    // but only for fields the matched rule actually set a value for, so e.g. a debit-only rule
    // (which never sets a Cradlee date) doesn't wipe out a date that was already there.
    return{...r,
      nature:force?(cls.nature||r.nature):(r.nature||cls.nature),
      cradleeDate:force?(cls.cradleeDate||r.cradleeDate):(r.cradleeDate||cls.cradleeDate)
    };
  });};
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
  // opts (from the guided download): {from,to} ISO dates to keep only that period, append:true.
  const loadWorkbook=async(file,opts)=>{
    setMessage('');setFileName(file.name);
    try{
      let sheet;
      if(isPdfFile(file)){
        const raw=await pdfStatementToRows(file,(again)=>Promise.resolve(window.prompt((again?'That password didn’t work. ':'')+'"'+file.name+'" is password-protected.\nBanks usually use your customer ID or date of birth (e.g. DDMMYYYY). Enter the PDF password:')));
        sheet={raw,rowCount:raw.length};
      }else if(isCSVFile(file)){
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
      // Remember which bank / account this statement is from (Tally Integration picks the bank ledger from it).
      try{const acNo=bankAccountNoFromHeader(sheet.raw.slice(0,Math.max(headerRowIdx,0)));if(acNo||bank)saveBankStatementInfo(salonId,{bank:bank&&bank!=='Generic'?bank:'',accountNo:acNo,file:file.name});}catch(e){}
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
      const beforeClean=imported.length;
      imported=imported.filter(isTxnRow);
      const skippedLines=beforeClean-imported.length;
      if(!imported.length)throw new Error('Couldn\u2019t find any recognisable transaction data in this file \u2014 please check it has date, description and amount columns.');
      let note='',periodNote='';
      if(opts&&opts.from&&opts.to){
        const iso=d=>{const m=String(d||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?m[3]+'-'+m[2]+'-'+m[1]:'';};
        const before=imported.length;
        imported=imported.filter(r=>{const d=iso(r.transactionDate);return !d||(d>=opts.from&&d<=opts.to);});
        if(before!==imported.length)periodNote=' \u00b7 '+(before-imported.length)+' row'+(before-imported.length===1?'':'s')+' outside '+opts.from.split('-').reverse().join('/')+'\u2013'+opts.to.split('-').reverse().join('/')+' left out';
      }
      if(usedAutoDetect){
        note=' Columns were detected automatically from this file\u2019s own headers/data (didn\u2019t match the '+bank+' format).';
      }else if(bank!=='Generic'&&matchRatio<0.5&&!isPdfFile(file)){
        note=' Note: this file\u2019s columns don\u2019t look like the '+bank+' format you\u2019ve selected \u2014 double-check the Bank dropdown above if any fields look off.';
      }
      imported=applyAutoClassification(imported);
      const autoClassified=imported.filter(r=>r.nature).length;
      const formatNote=(usedAutoDetect?' using automatic column detection.':' using the '+bank+' format.')+note+periodNote
        +(skippedLines>0?' · '+skippedLines+' non-transaction line'+(skippedLines===1?'':'s')+' (headings, address, totals, bank notes) ignored':'');
      // Append mode: add only to what's already there, skipping rows that look like the same
      // transaction already imported (same date, description, debit, credit and closing balance
      // — a bank statement export re-covering an overlapping date range is the normal case this
      // guards against, e.g. downloading "this month so far" every few days). Replace mode keeps
      // the original one-shot behavior of wiping the table and starting over.
      if((importMode==='append'||(opts&&opts.append))&&rows.length){
        const dedupeKey=(r)=>[r.transactionDate,r.description,r.debit,r.credit,r.closingBalance].join('|');
        const existingKeys=new Set(rows.map(dedupeKey));
        const freshOnes=imported.filter(r=>!existingKeys.has(dedupeKey(r)));
        const dupCount=imported.length-freshOnes.length;
        let nextId=rows.reduce((m,r)=>Math.max(m,Number(r.id)||0),0)+1;
        const withFreshIds=freshOnes.map(r=>({...r,id:nextId++}));
        autoMatchPendingRef.current=new Set(withFreshIds.map(r=>r.id));
        setRows(prev=>[...prev,...withFreshIds]);
        setMessage((withFreshIds.length?'Appended '+withFreshIds.length+' new transaction'+(withFreshIds.length===1?'':'s'):'No new transactions found')+' from '+file.name+formatNote
          +(dupCount?' · '+dupCount+' row'+(dupCount===1?'':'s')+' already in the statement '+(dupCount===1?'was':'were')+' skipped as duplicate'+(dupCount===1?'':'s')+'.':'.')
          +(withFreshIds.filter(r=>r.nature).length?' · '+withFreshIds.filter(r=>r.nature).length+' auto-classified (Nature + Date as per Cradlee).':''));
      }else{
        autoMatchPendingRef.current=new Set(imported.map(r=>r.id));
        setRows(imported);
        setMessage('Imported '+imported.length+' transaction'+(imported.length===1?'':'s')+' from '+file.name+formatNote+(autoClassified?' · '+autoClassified+' auto-classified (Nature + Date as per Cradlee).':'')+' Double-check a few rows below, then edit Nature and Date as per Cradlee as needed.');
      }
    }catch(err){setMessage('Import failed: '+err.message);}
  };
  loadWorkbookRef.current=loadWorkbook; // the download watcher always uses this render's copy (current rows)
  // Transactions fetched from the bank (Account Aggregator) — always appended, never replacing.
  // Skips anything already here: same bank transaction id, or same date/description/amounts/
  // balance (rows imported earlier from a file have no transaction id).
  const importFetched=(txns)=>{
    const dedupeKey=(r)=>[r.transactionDate,r.description,r.debit,r.credit,r.closingBalance].join('|');
    const haveIds=new Set(rows.filter(r=>r.txnId).map(r=>r.txnId));
    const haveKeys=new Set(rows.map(dedupeKey));
    let nextId=rows.reduce((m,r)=>Math.max(m,Number(r.id)||0),0)+1;
    const fresh=[];
    txns.forEach(t=>{
      const r={transactionDate:t.transactionDate,valueDate:t.valueDate,description:t.description,refNo:t.refNo,debit:Number(t.debit)||0,credit:Number(t.credit)||0,closingBalance:Number(t.closingBalance)||0,nature:'',cradleeDate:'',txnId:t.txnId||'',bankAccount:t.account||''};
      const k=dedupeKey(r);
      if((r.txnId&&haveIds.has(r.txnId))||haveKeys.has(k))return;
      haveKeys.add(k);if(r.txnId)haveIds.add(r.txnId);
      fresh.push({...r,id:nextId++});
    });
    const classified=applyAutoClassification(fresh);
    if(classified.length){autoMatchPendingRef.current=new Set(classified.map(r=>r.id));setRows(prev=>[...prev,...classified]);}
    return{added:classified.length,skipped:txns.length-classified.length};
  };
  const canEditBank=(()=>{
    const u=currentSessionUser();
    if(!u)return false;
    if(u.role==='Super Admin')return true;
    if(['Reviewer','Owner'].includes(u.role))return false;
    const oa=u.outletAccess&&Object.keys(u.outletAccess).length?u.outletAccess:null;
    if(oa&&oa[String(salonId)]!=='View and Edit')return false;
    const sa=u.sheetAccessByOutlet&&u.sheetAccessByOutlet[salonId];
    return !(sa&&sa['bank-statement']&&sa['bank-statement']!=='Edit');
  })();
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
  const natures=['','Collection','Cash Deposit','Card Settlement','UPI Settlement','Swiggy Settlement','Zomato Settlement','EazyDiner Settlement','Ownly Settlement','Eatby Minutes Settlement','Bank Charges','Interest','Vendor Payment','Salary','Incentive','Daily Incentive','Advance Salary','TDS','GST','ESIC Payment','Electricity Expenses','Drycleaning Expenses','Telephone & Internet Expenses','DG Rent','Royalty','Rent','Tax Payment','Transfer','Refund','Other'];
  // Loaded once for the "link the rest with Vendor Sheet automatically" classification rule.
  const [vendors]=useState(()=>loadVendors(salonId));
  const [employees]=useState(()=>loadEmployees(salonId));

  // ── Reconciliation summary — how much of the ledger is actually mapped to Revenue (Card/UPI
  // Settlement + Cash Deposit + Collection, the Natures that feed P&L revenue via Collection Reco)
  // and to Vendors (debits tagged Vendor Payment, and of those, how many are actually linked to a
  // Vendor Sheet invoice vs. just labelled). Computed off the full, unfiltered rows list so it
  // always reflects the whole imported statement, not whatever the on-screen filters narrow it to. ──
  const REVENUE_NATURES=new Set(['Card Settlement','UPI Settlement','Swiggy Settlement','Zomato Settlement','EazyDiner Settlement','Ownly Settlement','Eatby Minutes Settlement','Cash Deposit','Collection']);
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
    if(!canBookInvoiceInMonth(invoiceBookMonthOf({invoiceDate:addInvoiceForm.invoiceDate||row.transactionDate}))){faError(invoiceMonthBlockMessage());return;}
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
    setAddDIForm({date:defaultDate||localTodayIso(),amounts:Object.fromEntries(DAILY_INCENTIVE_CATEGORIES.map(c=>[c,'']))});
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
    {const blocked=loadVendorInvoices(salonId).filter(inv=>allocations.some(a=>a.id===inv.id)&&invoiceNeedsApproval(inv,salonId));if(blocked.length){faError('Not approved yet: '+blocked.map(i=>i.invoiceNo||i.id).join(', ')+' — a Super Admin has to approve '+(blocked.length===1?'this bill':'these bills')+' in Vendors before payment.');return;}}
    const linkId='bank-'+linkRow.id;
    const freshInvoices=loadVendorInvoices(salonId);
    for(const inv of freshInvoices){const alloc=allocations.find(a=>a.id===inv.id);
      if(alloc&&!confirmNoDuplicatePayment(inv,{...inv,payments:[...(inv.payments||[]),{id:'__new',paidAmount:alloc.amount,paidDate:toISO(linkRow.transactionDate),mode:'Bank Transfer'}]}))return;}
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
  // opts.onlyIds: only these rows (the ones just imported); opts.quiet: no toasts, just the result.
  // Returns {linkedIds:Set of bank row ids, count, total}.
  const autoLinkVendorPayments=(opts)=>{
    const o=opts||{};const none={linkedIds:new Set(),count:0,total:0};
    const freshInvoices=loadVendorInvoices(salonId);
    const candidates=rows.filter(r=>r.debit>0&&!r.linkedInvoice&&!(r.linkedEmployeePay&&r.linkedEmployeePay.length)&&(!o.onlyIds||o.onlyIds.has(r.id)));
    if(!candidates.length){if(!o.quiet)toastInfo('Nothing to link — every debit row is already linked (or there are no debit rows).');return none;}
    // Tracked by inv.id (always unique), not invoiceKeyFor(inv) (vendorId+invoiceNo) — two open
    // invoices for the same vendor with a blank or duplicated Invoice No would otherwise collide
    // onto the same key and get cross-matched or double-counted.
    const usedInvoiceIds=new Set();
    const rowToInvId=new Map(); // row.id -> invoice.id
    let noVendorCount=0,needsReviewCount=0;
    candidates.forEach(r=>{
      const vendor=findVendorMatch(r.description,vendors);
      if(!vendor){noVendorCount++;return;}
      const openInv=freshInvoices.filter(inv=>inv.vendorId===vendor.id&&invBalance(inv)>0&&!usedInvoiceIds.has(inv.id)&&!invoiceNeedsApproval(inv,salonId));
      const amountMatches=openInv.filter(inv=>Math.abs(invBalance(inv)-r.debit)<1);
      if(amountMatches.length===1){
        usedInvoiceIds.add(amountMatches[0].id);
        rowToInvId.set(r.id,amountMatches[0].id);
      }else{
        needsReviewCount++;
      }
    });
    if(!rowToInvId.size){
      if(!o.quiet)toastInfo('No confident vendor matches — every unlinked debit either has no vendor match or no single exact-amount open invoice. Use 🔗 Link on individual rows to review these by hand.');
      return none;
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
    if(!o.quiet)toastSuccess('Auto-linked '+linkedCount+' payment'+(linkedCount===1?'':'s')+' totalling '+money(linkedTotal)+' to matching invoices.'+
      (needsReviewCount?' '+needsReviewCount+' need manual review (vendor matched but amount didn\u2019t line up, or multiple invoices tie).':'')+
      (noVendorCount?' '+noVendorCount+' had no vendor match.':''));
    return{linkedIds:new Set(rowToInvKey.keys()),count:linkedCount,total:linkedTotal};
  };
  // \u2500\u2500 Salary / Incentive auto-link (automation phase 3). A debit is settled against an employee
  // only when BOTH are certain: exactly one active employee's full name (or bank account number)
  // appears in the narration, and the amount equals \u2014 to the rupee \u2014 that employee's outstanding
  // Salary, Incentive, or Salary + Incentive for exactly one of the last three months (the month
  // of the transaction and the two before). Anything else is left for Settle Pay by hand. Uses the
  // same settleEmployeePayFor + linkedEmployeePay record as Settle Pay, so \ud83d\udd17 Unlink reverses it. \u2500\u2500
  const autoLinkSalaryPayments=(opts)=>{
    const o=opts||{};
    const candidates=rows.filter(r=>r.debit>0&&!r.linkedInvoice&&!(r.linkedEmployeePay&&r.linkedEmployeePay.length)
      &&(!o.onlyIds||o.onlyIds.has(r.id))&&!(o.skipIds&&o.skipIds.has(r.id)));
    const{settledByRow,total}=autoSettleSalaryRows(salonId,candidates);
    if(settledByRow.size)setRows(prev=>{
      const next=prev.map(r=>settledByRow.has(r.id)?{...r,linkedEmployeePay:settledByRow.get(r.id),nature:r.nature||(settledByRow.get(r.id)[0].salary?'Salary':'Incentive')}:r);
      saveBankStatementRows(next,salonId);
      return next;
    });
    return{linkedIds:new Set(settledByRow.keys()),count:settledByRow.size,total};
  };
  // Both, in order (vendor first; a row linked there isn't looked at for salary). Returns a
  // one-line summary, or '' if nothing matched.
  const autoLinkAll=(opts)=>{
    const o=opts||{};
    const v=autoLinkVendorPayments({onlyIds:o.onlyIds,quiet:true});
    const s=autoLinkSalaryPayments({onlyIds:o.onlyIds,skipIds:v.linkedIds});
    const parts=[];
    if(v.count)parts.push(v.count+' vendor payment'+(v.count===1?'':'s')+' ('+money(v.total)+')');
    if(s.count)parts.push(s.count+' salary/incentive payment'+(s.count===1?'':'s')+' ('+money(s.total)+')');
    return parts.length?'Auto-linked '+parts.join(' and ')+' \u2014 exact amount matches only; \ud83d\udd17 Unlink on a row undoes it.':'';
  };
  const autoLinkButton=()=>{
    const msg=autoLinkAll();
    if(msg)toastSuccess(msg);
    else toastInfo('No confident matches \u2014 a payment is linked automatically only when the vendor or employee is recognised in the narration and the amount matches an open invoice / unpaid salary exactly. Use \ud83d\udd17 Link or Settle Pay on individual rows for the rest.');
  };
  // ── 🤖 AI tagging (automation phase 4) — rows the rules above left without a Nature get one
  // suggested by the AI (only high/medium confidence is applied; low is left blank). Marked aiTagged
  // so they show as AI suggestions; the Nature dropdown still changes them as usual. ──
  const [aiBusy,setAiBusy]=useState(false);
  const aiTagRows=async()=>{
    const todo=rows.filter(r=>!r.nature&&!r.linkedInvoice&&!(r.linkedEmployeePay&&r.linkedEmployeePay.length)&&(r.debit||r.credit));
    if(!todo.length){toastInfo('Every row already has a Nature.');return;}
    setAiBusy(true);
    try{
      const vendorsList=loadVendors(salonId);
      const byId=new Map();
      for(let s=0;s<todo.length;s+=150){
        const batch=todo.slice(s,s+150);
        const res=await aiCall('tag_bank',{rows:batch.map(r=>({i:r.id,d:r.description,dr:r.debit,cr:r.credit})),natures:natures.filter(Boolean),
          vendors:vendorsList.map(v=>v.name).filter(Boolean),employees:employees.map(e=>e.name).filter(Boolean)});
        (res.items||[]).forEach(x=>{if(x.nature&&x.confidence!=='low')byId.set(x.i,x);});
      }
      if(byId.size)setRows(prev=>{
        const next=prev.map(r=>{const x=byId.get(r.id);if(!x||r.nature)return r;
          return{...r,nature:x.nature,aiTagged:true,...(x.nature==='Vendor Payment'&&x.vendor?{vendorOverride:x.vendor}:{})};});
        saveBankStatementRows(next,salonId);return next;
      });
      toastSuccess('AI tagged '+byId.size+' of '+todo.length+' row'+(todo.length===1?'':'s')+' (🤖 marks them — check and change any that look wrong).'+(todo.length-byId.size?' '+(todo.length-byId.size)+' left for you — the AI wasn’t sure.':''));
      if(byId.size){const msg=autoLinkAll({onlyIds:new Set(byId.keys())});if(msg)toastInfo(msg);}
    }catch(e){(e.notConfigured?toastInfo:faError)(e.message);}
    setAiBusy(false);
  };
  // Run the auto-link on rows just imported, once they're in state.
  const autoMatchPendingRef=useRef(null);
  useEffect(()=>{
    const ids=autoMatchPendingRef.current;
    if(!ids||!rows.some(r=>ids.has(r.id)))return;
    autoMatchPendingRef.current=null;
    const msg=autoLinkAll({onlyIds:ids});
    if(msg)setMessage(m=>(m?m+' \u00b7 ':'')+msg);
  },[rows]);

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
        rows.length>0&&React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Scan every unlinked debit: link it to a Vendor Sheet invoice, or settle an employee’s Salary / Incentive, when the vendor or employee is named in the narration AND the amount matches exactly — anything ambiguous is left for manual review. New imports are auto-linked the same way.',onClick:autoLinkButton},'🔗 Auto-Link Payments'),
        rows.length>0&&React.createElement('button',{className:'btn btn-ghost btn-sm'+(aiBusy?' btn-loading':''),disabled:aiBusy,title:'Ask the AI to suggest a Nature for every row that has none yet (needs the AI key in Master Settings). Only confident suggestions are applied; they show a 🤖 mark.',onClick:aiTagRows},aiBusy?'AI tagging…':'🤖 AI: tag untagged rows'),
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
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:10,lineHeight:1.6}},'Personal is for individual/retail accounts, Corporate for company netbanking (multi-user, maker-checker), and Business for MSME / current-account logins \u2014 pick the one matching how this outlet\u2019s account is held. Each opens the bank\u2019s official website in a new tab (its login page where known, otherwise the home page \u2014 click "Login" there). Save an account under "Get statement" with its exact login page for one-click access next time. Always check the address bar shows the bank\u2019s real domain before entering your credentials \u2014 SalonOS never asks for or stores your banking password.')
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
    // Account Aggregator fetch (BankFetchPanel, edge function bank-aa) stays built but hidden —
    // the owner chose download-from-the-bank-website instead of a third-party gateway.
    React.createElement('div',{className:'card',style:{marginBottom:16,border:'1px solid rgba(47,95,224,0.3)',background:'rgba(47,95,224,0.05)'}},
      React.createElement('div',{style:{display:'flex',gap:12,alignItems:'flex-start',flexWrap:'wrap'}},
        React.createElement('div',{style:{fontSize:20}},'📥'),
        React.createElement('div',{style:{flex:1,minWidth:260}},
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:4}},
            React.createElement('div',{style:{fontSize:13,fontWeight:600,color:'var(--text)'}},'Get statement from your bank’s website'),guideButtons),
          React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',lineHeight:1.6,marginBottom:10}},'Pick the account and period, click "Open bank website", log in there as usual and download the statement (Excel, CSV or PDF). SalonOS picks up the download and imports it by itself — only that period, duplicates skipped. Your bank login is only ever typed on the bank’s own site.'),
          bankAccounts.length>0&&React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:6,marginBottom:10}},
            bankAccounts.map(a=>React.createElement('label',{key:a.id,style:{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',borderRadius:'var(--r)',border:'1px solid '+(gAcct&&gAcct.id===a.id?'var(--accent)':'var(--border2)'),background:'var(--bg2)',cursor:'pointer',flexWrap:'wrap'}},
              React.createElement('input',{type:'radio',name:'bsAcct',checked:!!gAcct&&gAcct.id===a.id,onChange:()=>setGAcctId(a.id)}),
              React.createElement('span',{style:{fontWeight:600,fontSize:12.5}},a.label),
              React.createElement('span',{style:{fontSize:11,color:'var(--text2)'}},a.bank+' · '+a.type+(a.last4?' · ••'+a.last4:'')+' · '+a.loginType+' login'),
              (()=>{const u=acctLoginUrl(a);let host='';try{host=new URL(u).hostname;}catch(e){}return host?React.createElement('span',{title:u,style:{fontSize:10.5,color:'var(--text3)'}},'→ opens '+host):null;})(),
              canEditBank&&React.createElement('span',{style:{marginLeft:'auto',display:'flex',gap:4}},
                React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:11,padding:'2px 8px'},onClick:e=>{e.preventDefault();setAcctForm({...a});}},'Edit'),
                React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:11,padding:'2px 8px'},onClick:e=>{e.preventDefault();removeAcct(a);}},'Remove'))
            ))
          ),
          gAcct&&React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:8,marginBottom:10}},
            React.createElement('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},gQuick.map(([t,fn])=>React.createElement('button',{key:t,className:'btn btn-ghost btn-sm',style:{fontSize:11,padding:'3px 9px'},onClick:fn},t))),
            React.createElement('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
              React.createElement('label',{style:{fontSize:12,color:'var(--text2)'}},'From'),
              React.createElement('input',{type:'date',className:'form-control',style:{width:'auto'},value:gFrom,max:gTo,onChange:e=>setGFrom(e.target.value)}),
              React.createElement('label',{style:{fontSize:12,color:'var(--text2)'}},'To'),
              React.createElement('input',{type:'date',className:'form-control',style:{width:'auto'},value:gTo,min:gFrom,max:gIso(gToday),onChange:e=>setGTo(e.target.value)}),
              React.createElement('button',{className:'btn btn-primary btn-sm',onClick:openBankSite},'🔗 Open bank website'),
              React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Pick the downloaded statement yourself (same period filter and duplicate check) — opens in your Downloads folder',onClick:chooseStatementFile},'📄 Choose file'),
              React.createElement('input',{ref:gFileRef,type:'file',accept:'.xlsx,.xls,.csv,.pdf',style:{display:'none'},onChange:onGuidedFile}),
              waitSince>0&&React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>{setWaitSince(0);setWatchInfo('');setGStatus({text:'Stopped waiting.',bad:false});}},'Stop waiting')
            ),
            waitSince>0&&dirHandle&&React.createElement('div',{style:{fontSize:12,color:'var(--accent2)',lineHeight:1.6}},'⏳ '+(watchInfo||'Watching your connected folder for the new statement…'),
              dirNeedsPermission&&React.createElement('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:8,fontSize:11,padding:'2px 8px'},onClick:async()=>{try{const p=await dirHandle.requestPermission({mode:'read'});setDirNeedsPermission(p!=='granted');}catch(e){}}},'🔓 Allow folder access')),
            waitSince>0&&!dirHandle&&fsSupported&&React.createElement('div',{style:{fontSize:12,color:'var(--orange)'}},'Tip: ',React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:11,padding:'2px 8px'},onClick:connectDownloads},'📂 Connect a statements folder'),' once, and statements saved there are imported by themselves from then on. Or press 📄 Choose file after downloading.')
          ),
          canEditBank&&(acctForm
            ?React.createElement('div',{style:{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap',padding:10,border:'1px dashed var(--border2)',borderRadius:'var(--r)'}},
                React.createElement('div',null,React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:3}},'Bank'),
                  React.createElement('input',{list:'acct-bank-options',className:'form-control',style:{width:200},placeholder:'Type to search any bank',value:acctForm.bank,onChange:e=>setAcctForm(f=>({...f,bank:e.target.value}))}),
                  React.createElement('datalist',{id:'acct-bank-options'},Object.keys(BANK_LOGIN_URLS).sort().map(b=>React.createElement('option',{key:b,value:b})))),
                React.createElement('div',null,React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:3}},'Account type'),
                  React.createElement('select',{className:'form-control',style:{width:'auto'},value:acctForm.type,onChange:e=>setAcctForm(f=>({...f,type:e.target.value}))},BANK_ACCOUNT_TYPES.map(t=>React.createElement('option',{key:t},t)))),
                React.createElement('div',null,React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:3}},'Login'),
                  React.createElement('select',{className:'form-control',style:{width:'auto'},value:acctForm.loginType,onChange:e=>setAcctForm(f=>({...f,loginType:e.target.value}))},LOGIN_TYPES.map(t=>React.createElement('option',{key:t,value:t},t)))),
                React.createElement('div',null,React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:3}},'Last 4 digits (optional)'),
                  React.createElement('input',{className:'form-control',style:{width:110},inputMode:'numeric',maxLength:4,value:acctForm.last4,onChange:e=>setAcctForm(f=>({...f,last4:e.target.value.replace(/\D/g,'').slice(0,4)}))})),
                React.createElement('div',null,React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:3}},'Name (optional)'),
                  React.createElement('input',{className:'form-control',style:{width:160},placeholder:'e.g. HDFC Current',value:acctForm.label,onChange:e=>setAcctForm(f=>({...f,label:e.target.value}))})),
                React.createElement('div',{style:{flexBasis:'100%'}},React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:3}},BANK_LOGIN_URLS[acctForm.bank]?'Login address (optional — leave blank to use the '+acctForm.bank+' '+(acctForm.loginType||'Personal')+' login)':'Login address of this bank’s net banking (https://…)'),
                  React.createElement('input',{className:'form-control',style:{width:'100%',maxWidth:460},placeholder:'https://',value:acctForm.url,onChange:e=>setAcctForm(f=>({...f,url:e.target.value}))})),
                React.createElement('button',{className:'btn btn-primary btn-sm',onClick:saveAcct},'Save account'),
                React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setAcctForm(null)},'Cancel'))
            :React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setAcctForm({bank:'',type:'Current',loginType:'Business',last4:'',label:'',url:''})},'➕ Add a bank account')),
          gStatus.text&&React.createElement('div',{style:{marginTop:8,fontSize:12,color:gStatus.bad?'var(--red)':'var(--green)',lineHeight:1.6}},gStatus.text)
        )
      )
    ),
    React.createElement('div',{className:'card',style:{marginBottom:16,background:fsSupported?'rgba(76,175,125,0.06)':'rgba(255,159,67,0.06)',border:'1px solid '+(fsSupported?'rgba(76,175,125,0.25)':'rgba(255,159,67,0.25)')}},
      React.createElement('div',{style:{display:'flex',gap:12,alignItems:'flex-start',flexWrap:'wrap'}},
        React.createElement('div',{style:{fontSize:20}},'⚡'),
        React.createElement('div',{style:{flex:1,minWidth:260}},
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:4}},
            React.createElement('div',{style:{fontSize:13,fontWeight:600,color:'var(--text)'}},'Auto-Import from a statements folder'),guideButtons),
          !fsSupported?React.createElement('div',{style:{fontSize:12,color:'var(--text2)',lineHeight:1.7}},
            'This browser doesn\u2019t support folder watching (works in Chrome/Edge desktop only). Please use the upload box below instead.'
          ):React.createElement(React.Fragment,null,
            React.createElement('div',{style:{fontSize:12,color:'var(--text2)',lineHeight:1.7,marginBottom:8}},
              !dirHandle
                ?React.createElement(React.Fragment,null,
                    'Chrome and Edge don’t let any website open the whole Downloads folder (“contains system files”), so use a folder inside it — once on each computer:',
                    React.createElement('ol',{style:{margin:'6px 0 0',paddingLeft:18}},
                      React.createElement('li',null,'Click ',React.createElement('b',null,'Connect a folder inside Downloads'),'. The window opens in Downloads — click ',React.createElement('b',null,'New folder'),', name it ',React.createElement('b',null,'Bank Statements'),', open it and click ',React.createElement('b',null,'Select folder'),', then ',React.createElement('b',null,'Allow'),'.'),
                      React.createElement('li',null,'Make the bank’s download go there: Chrome/Edge Settings → Downloads → turn on ',React.createElement('b',null,'Ask where to save each file'),' (and pick Bank Statements when saving), or set the download Location to that folder.'),
                      React.createElement('li',null,'After that, statements saved there are imported by themselves when you use "Open bank website" above, click "Check Now" or reopen this tab.')),
                    React.createElement('div',{style:{marginTop:4}},'Simpler: skip this and press ',React.createElement('b',null,'📄 Choose file'),' above after downloading — it opens right in Downloads.'))
                :'Connected. After "Open bank website" above, the new download is imported by itself within seconds. You can also click "Check Now" any time, or just reopen this tab \u2014 it checks automatically on load.'
            ),
            React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}},
              !dirHandle?React.createElement('button',{className:'btn btn-primary btn-sm',onClick:connectDownloads},'📂 Connect a folder inside Downloads'):
              React.createElement(React.Fragment,null,
                React.createElement('button',{className:'btn btn-primary btn-sm',disabled:autoBusy,onClick:checkNow},autoBusy?'Checking…':(dirNeedsPermission?'🔓 Reconnect & Check':'🔄 Check Now')),
                React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:disconnectDownloads},'Disconnect')
              )
            ),
            autoStatus&&React.createElement('div',{style:{marginTop:8,fontSize:12,color:autoStatus.indexOf('failed')>-1||autoStatus.indexOf('not')>-1?'var(--red)':'var(--green)'}},autoStatus),
            React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:8,lineHeight:1.6}},'After "Open bank website", any Excel, CSV or PDF saved to this folder in the next 20 minutes is taken, whatever its name. "Check Now" and reopening the tab take the newest file whose name contains "statement", "txn", "account", "history"'+(bank!=='Generic'?' or the bank name':'')+'. Only files SalonOS hasn\u2019t imported before are read; rows already in the statement are skipped. You always log in and download on your bank\u2019s own site \u2014 SalonOS only reads the downloaded file.')
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
      React.createElement('input',{ref:fileRef,type:'file',accept:'.xlsx,.xls,.csv,.pdf',style:{display:'none'},onChange:onFile}),
      React.createElement('div',{onDragOver:e=>{e.preventDefault();setDragging(true)},onDragLeave:()=>setDragging(false),onDrop,
        onClick:()=>fileRef.current&&fileRef.current.click(),style:{border:'2px dashed '+(dragging?'var(--accent)':'var(--border2)'),borderRadius:'var(--r2)',padding:28,textAlign:'center',cursor:'pointer',background:dragging?'rgba(47,95,224,.06)':'var(--bg3)'}},
        React.createElement('div',{style:{fontSize:30,marginBottom:8}},'🏦'),React.createElement('div',{style:{fontSize:14,fontWeight:600,color:'var(--text)',marginBottom:5}},'Drop bank statement here or click to browse'),
        React.createElement('div',{style:{fontSize:12,color:'var(--text3)'}},'Accepted: Excel (.xlsx, .xls), CSV and PDF (password-protected PDFs ask for the password)'),fileName&&React.createElement('div',{style:{fontSize:11,color:'var(--accent)',marginTop:8}},'Selected: '+fileName)
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
          React.createElement('div',{style:{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',maxWidth:'100%'}},
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
            React.createElement('td',{'data-xr':ri,'data-xc':8,style:{minWidth:165,background:cellRange.isSelected(ri,8)?'rgba(47,95,224,0.12)':undefined}},React.createElement('div',{style:{display:'flex',alignItems:'center',gap:4}},r.aiTagged&&React.createElement('span',{title:'Suggested by AI — change it if it’s wrong',style:{fontSize:12}},'🤖'),React.createElement('select',{className:'form-control',value:r.nature,onChange:e=>{update(r.id,'nature',e.target.value);if(r.aiTagged)update(r.id,'aiTagged',false);},style:{padding:'6px 8px',fontSize:11}},natures.map(n=>React.createElement('option',{key:n,value:n},n||'Select Nature'))))),
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
    guideLang&&React.createElement(BankGuideModal,{initialLang:guideLang,onClose:()=>setGuideLang(null)}),
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
        const iso=(d)=>localIsoOf(d);
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
                    React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},inv.docNature+' · Due '+(inv.dueDate||'—')+' · Bal ₹'+bal.toLocaleString('en-IN'))
                  )
                ),
                checked
                  ?React.createElement('div',{style:{textAlign:'right'}},
                      React.createElement('input',{type:'number',className:'form-control',style:{width:110,padding:'6px 8px',fontSize:12,textAlign:'right'},value:linkAllocations[key]!=null?linkAllocations[key]:'',onChange:e=>setLinkAllocations({...linkAllocations,[key]:e.target.value})}),
                      closeMatch&&React.createElement('div',{style:{fontSize:10,color:'var(--green)',marginTop:2}},'Amount matches ✓')
                    )
                  :React.createElement('div',{style:{fontWeight:600,color:'var(--orange)',fontSize:12.5}},rupee(bal))
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
            React.createElement('span',{style:{fontWeight:700,color:matches?'var(--green)':'var(--text)'}},rupee(totalAllocated)+' of ₹'+debitAmt.toLocaleString('en-IN')+(matches?' ✓':''))
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
                React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)'}},'Outstanding ₹'+outstanding.toLocaleString('en-IN'))
              )
            ),
            checked
              ?React.createElement('div',{style:{textAlign:'right'}},
                  React.createElement('input',{type:'number',className:'form-control',style:{width:100,padding:'5px 7px',fontSize:11.5,textAlign:'right'},value:amtValue!=null?amtValue:'',onChange:e=>updateEmpLineAmount(line.employeeId,comp,e.target.value)}),
                  closeMatch&&React.createElement('div',{style:{fontSize:10,color:'var(--green)',marginTop:2}},'Matches ✓')
                )
              :React.createElement('div',{style:{fontWeight:600,color:'var(--orange)',fontSize:12}},rupee(outstanding))
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
            React.createElement('span',{style:{fontWeight:700,color:Math.abs(totalAllocated-(Number(row.debit)||0))<1?'var(--green)':'var(--text)'}},rupee(totalAllocated)+' of ₹'+(Number(row.debit)||0).toLocaleString('en-IN'))
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
          return React.createElement('div',{style:{fontSize:12,color:'var(--text3)',margin:'6px 0 16px'}},'Total: ',React.createElement('span',{style:{fontWeight:700,color:'var(--accent)'}},rupee(total)));
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
              candidates.map(c=>React.createElement('option',{key:c.id,value:c.id},c.id+' · ₹'+(Number(c.outstanding!=null?c.outstanding:c.amount)||0).toLocaleString('en-IN')+' · '+c.status+(c.date?' · '+c.date:'')))
            )
          ),
          linked
            ?React.createElement('div',{style:{fontSize:11,color:'var(--text3)',lineHeight:1.7,padding:'6px 2px'}},
                'Linking to '+linked.id+' — ₹'+(Number(linked.outstanding!=null?linked.outstanding:linked.amount)||0).toLocaleString('en-IN')+' outstanding, '+linked.status+
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
            React.createElement('span',{style:{fontWeight:700,color:Math.abs(totalAllocated-(Number(row.debit)||0))<1?'var(--green)':'var(--text)'}},rupee(totalAllocated)+' of ₹'+(Number(row.debit)||0).toLocaleString('en-IN'))
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

// ═══ Due Date Compliance register (Master Dashboard) and the login reminder ═══════════════════
// Every payment / compliance item of every outlet — the same list each outlet's Due Dates sheet
// shows (auto items from Salary Working, Vendors, TDS and licences, plus items added by hand).
// "Update Amount" reminders are left out — they ask for a figure, they aren't a payment.
function allDueItemsFor(sid){
  let manual=[];try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_due_dates',sid))||'[]');if(Array.isArray(v))manual=v;}catch(e){}
  const auto=[...autoStatutoryDueItemsFor(sid),...autoTdsDueItemsFor(sid),...autoSalaryIncentiveDueItemsFor(sid),...autoVendorDueItemsFor(sid),
    ...(typeof autoLicenceDueItemsFor==='function'?autoLicenceDueItemsFor(sid):[]),
    ...(typeof autoStaffCertDueItemsFor==='function'?autoStaffCertDueItemsFor(sid):[])];
  return [...auto,...manual.map(d=>({...d,manual:true}))].filter(d=>d&&d.type!=='Update Amount');
}
const DUE_SOON_DAYS=5;
function dueDaysFrom(iso){
  if(!iso)return null;const d=new Date(String(iso).slice(0,10)+'T00:00:00');if(isNaN(d))return null;
  const t=new Date(localTodayIso()+'T00:00:00');return Math.round((d-t)/86400000);
}
// Paid · Overdue (unpaid, date gone) · Due (unpaid, within the next 5 days) · Pending (unpaid, later or no date)
function complianceStatusOf(d){
  if(d.paid||d.status==='done')return 'Paid';
  const n=dueDaysFrom(d.due);
  if(n!=null&&n<0)return 'Overdue';
  if(n!=null&&n<=DUE_SOON_DAYS)return 'Due';
  return 'Pending';
}
function complianceRowsFor(salons){
  const out=[];
  (salons||[]).forEach(s=>{allDueItemsFor(s.id).forEach(d=>{
    out.push({...d,outletId:s.id,outlet:s.name,status4:complianceStatusOf(d),days:dueDaysFrom(d.due),amt:Number(d.paid?(d.paidAmount||d.amount):d.amount)||0});
  });});
  return out.sort((a,b)=>String(a.due||'9999').localeCompare(String(b.due||'9999')));
}
const COMP_BADGE={Overdue:'badge-red',Due:'badge-amber',Pending:'badge-blue',Paid:'badge-green'};
const compDaysText=r=>r.days==null?'—':r.status4==='Paid'?'':r.days<0?(-r.days)+' day'+(r.days===-1?'':'s')+' overdue':r.days===0?'due today':'in '+r.days+' day'+(r.days===1?'':'s');
const compDate=iso=>iso?String(iso).slice(0,10).split('-').reverse().join('/'):'—';

function ComplianceRegister({accessibleSalons,onOpenOutletTab}){
  const h=React.createElement;
  const {toast,error:toastError}=useToast();
  const salons=(accessibleSalons||[]).filter(s=>s.status!=='Inactive');
  const [status,setStatus]=useState('Open');
  const [outlet,setOutlet]=useState('all');
  const [cat,setCat]=useState('all');
  const [from,setFrom]=useState('');
  const [to,setTo]=useState('');
  const [q,setQ]=useState('');
  const all=useMemo(()=>complianceRowsFor(salons),[salons.map(s=>s.id).join(',')]);
  const cats=Array.from(new Set(all.map(r=>r.type).filter(Boolean))).sort();
  const base=all.filter(r=>(outlet==='all'||String(r.outletId)===String(outlet))&&(cat==='all'||r.type===cat)
    &&(!from||(r.due&&r.due>=from))&&(!to||(r.due&&r.due<=to))
    &&(!q||[r.outlet,r.type,r.desc].join(' ').toLowerCase().includes(q.toLowerCase())));
  const rows=base.filter(r=>status==='All'||(status==='Open'?r.status4!=='Paid':r.status4===status));
  const sum=k=>base.filter(r=>r.status4===k);
  const tot=list=>list.reduce((s,r)=>s+r.amt,0);
  const card=(k,label,color,sub)=>{const l=sum(k);return h('div',{className:'metric-card '+color,style:{cursor:'pointer',outline:status===k?'2px solid var(--accent)':'none'},onClick:()=>setStatus(k)},
    h('div',{className:'metric-label'},label),h('div',{className:'metric-value'},rupee(tot(l))),h('div',{style:{fontSize:11,color:'var(--text3)',marginTop:3}},l.length+' item'+(l.length===1?'':'s')+(sub?' · '+sub:'')));};
  const exportXlsx=async()=>{
    try{
      const sheet=[['Due Date Compliance register — '+compDate(localTodayIso())],[],['Outlet','Category','Description','Due date','Amount','Status','Days','Paid on','Reference'],
        ...rows.map(r=>[r.outlet,r.type,r.desc||'',compDate(r.due),r.amt,r.status4,compDaysText(r),r.paid?compDate(r.paidDate):'',r.ref||'']),['Total','','','',tot(rows)]];
      const blob=await exportReportExcelBlob('Compliance register',sheet);
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Compliance_Register_'+localTodayIso()+'.xlsx';document.body.appendChild(a);a.click();a.remove();
      toast('Excel downloaded','success');
    }catch(e){toastError('Could not build the Excel file — please try again');}
  };
  return h('div',null,
    h('div',{className:'grid4',style:{marginBottom:14}},
      card('Overdue','Overdue','red','date passed, not paid'),
      card('Due','Due in '+DUE_SOON_DAYS+' days','amber','pay this week'),
      card('Pending','Pending (later)','blue','not yet due'),
      card('Paid','Paid','green','marked paid')),
    h('div',{className:'card',style:{marginBottom:12,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}},
      ['Open','Overdue','Due','Pending','Paid','All'].map(k=>h('button',{key:k,type:'button',className:'btn btn-sm '+(status===k?'btn-primary':'btn-ghost'),onClick:()=>setStatus(k)},
        k==='Open'?'All unpaid':k==='Due'?'Due ('+DUE_SOON_DAYS+' days)':k)),
      h('select',{className:'form-control',style:{width:'auto'},value:outlet,onChange:e=>setOutlet(e.target.value),'aria-label':'Outlet'},
        h('option',{value:'all'},'All outlets'),salons.map(s=>h('option',{key:s.id,value:s.id},s.name))),
      h('select',{className:'form-control',style:{width:'auto'},value:cat,onChange:e=>setCat(e.target.value),'aria-label':'Category'},
        h('option',{value:'all'},'All categories'),cats.map(c=>h('option',{key:c,value:c},c))),
      h('label',{style:{fontSize:12,color:'var(--text3)'}},'From'),h('input',{type:'date',className:'form-control',style:{width:'auto'},value:from,onChange:e=>setFrom(e.target.value)}),
      h('label',{style:{fontSize:12,color:'var(--text3)'}},'To'),h('input',{type:'date',className:'form-control',style:{width:'auto'},value:to,onChange:e=>setTo(e.target.value)}),
      h('input',{className:'form-control',style:{width:200},placeholder:'Search outlet, category, description…',value:q,onChange:e=>setQ(e.target.value)}),
      h('button',{type:'button',className:'btn btn-ghost btn-sm',style:{marginLeft:'auto'},onClick:exportXlsx},'⬇ Export Excel')),
    h('div',{className:'help-note',style:{marginBottom:12}},'Every payment and compliance date of your outlets in one place — PF, ESIC, PT, TDS, salary and incentive, vendor bills, licence renewals and items added on each outlet’s Due Dates sheet. Pay and mark paid on the outlet’s Due Dates sheet (Open).'),
    h('div',{className:'card'},rows.length===0
      ?h('div',{className:'empty-state'},h('div',{className:'empty-icon'},'✅'),h('div',{className:'empty-title'},status==='Overdue'?'Nothing overdue':'Nothing here'),h('div',{className:'empty-sub'},'Change the filters to see other items.'))
      :h('div',{className:'table-wrap'},h('table',null,
        h('thead',null,h('tr',null,['Outlet','Category','Description','Due date','Amount','Status','','Paid on',''].map((t,i)=>h('th',{key:i},t)))),
        h('tbody',null,rows.map((r,i)=>h('tr',{key:r.outletId+'|'+r.id+'|'+i},
          h('td',{style:{fontWeight:600}},String(r.outlet).split('—')[0].trim()),
          h('td',null,r.type,r.auto&&h('span',{className:'badge badge-gray',style:{marginLeft:6,fontSize:9.5}},'AUTO')),
          h('td',{style:{maxWidth:360,fontSize:12.5,color:'var(--text2)'}},r.desc||'—'),
          h('td',{style:{whiteSpace:'nowrap'}},compDate(r.due)),
          h('td',{style:{textAlign:'right',fontWeight:600}},r.amt?rupee(r.amt):'—'),
          h('td',null,h('span',{className:'badge '+COMP_BADGE[r.status4]},r.status4)),
          h('td',{style:{fontSize:11.5,color:r.status4==='Overdue'?'var(--red)':'var(--text3)',whiteSpace:'nowrap'}},compDaysText(r)),
          h('td',{style:{fontSize:12,whiteSpace:'nowrap'}},r.paid?compDate(r.paidDate)+(r.ref?' · '+r.ref:''):'—'),
          h('td',null,onOpenOutletTab&&h('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:()=>{const s=salons.find(x=>String(x.id)===String(r.outletId));if(s)onOpenOutletTab(s,'due-dates');}},'Open →')))),
          h('tr',{style:{fontWeight:700}},h('td',{colSpan:4},'Total ('+rows.length+')'),h('td',{style:{textAlign:'right'}},rupee(tot(rows))),h('td',{colSpan:4})))))));
}

// Login reminder — Owner, Salon Owner, Super Admin and Accountant: overdue items and anything due
// in the next 5 days, once per sign-in.
const DUE_POPUP_ROLES=['Super Admin','Owner','Salon Owner','Accountant'];
const DUE_POPUP_DAYS=5;
function DueReminderPopup({user,accessibleSalons,onOpenRegister}){
  const h=React.createElement;
  const KEY='salonos_due_popup_shown';
  const [open,setOpen]=useState(false);
  const [rows,setRows]=useState([]);
  useEffect(()=>{
    if(!user||!DUE_POPUP_ROLES.includes(user.role))return;
    try{writeDueSnapshots((accessibleSalons||[]).filter(s=>s.status!=='Inactive'));}catch(e){}
    try{if(sessionStorage.getItem(KEY))return;}catch(e){}
    const list=complianceRowsFor((accessibleSalons||[]).filter(s=>s.status!=='Inactive'))
      .filter(r=>r.status4==='Overdue'||(r.status4!=='Paid'&&r.days!=null&&r.days>=0&&r.days<=DUE_POPUP_DAYS));
    try{sessionStorage.setItem(KEY,'1');}catch(e){}
    if(list.length){setRows(list);setOpen(true);}
  },[user&&user.id,(accessibleSalons||[]).length]);
  if(!open)return null;
  const over=rows.filter(r=>r.status4==='Overdue'),soon=rows.filter(r=>r.status4!=='Overdue');
  const tot=l=>l.reduce((s,r)=>s+r.amt,0);
  const table=(list)=>h('div',{className:'table-wrap',style:{maxHeight:240,overflowY:'auto'}},h('table',null,
    h('thead',null,h('tr',null,['Outlet','Category','Description','Due date','Amount',''].map((t,i)=>h('th',{key:i},t)))),
    h('tbody',null,list.map((r,i)=>h('tr',{key:i},h('td',{style:{fontWeight:600}},String(r.outlet).split('—')[0].trim()),h('td',null,r.type),
      h('td',{style:{fontSize:12,color:'var(--text2)',maxWidth:280}},r.desc||'—'),h('td',{style:{whiteSpace:'nowrap'}},compDate(r.due)),
      h('td',{style:{textAlign:'right',fontWeight:600}},r.amt?rupee(r.amt):'—'),h('td',{style:{fontSize:11.5,whiteSpace:'nowrap',color:r.status4==='Overdue'?'var(--red)':'var(--orange)'}},compDaysText(r)))))));
  return h('div',{className:'modal-overlay',onClick:()=>setOpen(false)},
    h('div',{className:'modal',style:{width:860,maxWidth:'96vw'},onClick:e=>e.stopPropagation(),role:'dialog','aria-label':'Payments due'},
      h('div',{className:'modal-title'},'📌 Payments needing attention'),
      over.length>0&&h('div',{style:{marginBottom:14}},
        h('div',{style:{fontWeight:700,color:'var(--red)',marginBottom:6}},'🔴 Overdue — '+over.length+' item'+(over.length===1?'':'s')+' · '+rupee(tot(over))),table(over)),
      soon.length>0&&h('div',{style:{marginBottom:6}},
        h('div',{style:{fontWeight:700,color:'var(--orange)',marginBottom:6}},'🟡 Due in the next '+DUE_POPUP_DAYS+' days — '+soon.length+' item'+(soon.length===1?'':'s')+' · '+rupee(tot(soon))),table(soon)),
      h('div',{className:'modal-actions'},
        h('button',{className:'btn btn-ghost',onClick:()=>setOpen(false)},'Close'),
        h('button',{className:'btn btn-primary',onClick:()=>{setOpen(false);onOpenRegister&&onOpenRegister();}},'Open compliance register'))));
}
