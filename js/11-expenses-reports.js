
function RecurringExpensesSheet({salon}={}){
  const salonId=salon?.id;
  const {toast}=useToast();
  const storeKey=()=>outletKey('salonos_recurring_expenses',salonId);
  const [items,setItems]=useState(()=>{try{return JSON.parse(cachedLocalGet(storeKey())||'[]');}catch(e){return[];}});
  useEffect(()=>{safeLocalSet(storeKey(),JSON.stringify(items));},[items,salonId]);

  // ── Vendor List sync — every recurring expense's Payee should exist as a real vendor, so it
  // shows up consistently across Vendor Sheet, invoices, and everywhere else that reads from the
  // Vendor List. New/renamed payees get a vendor auto-created on save; existing recurring
  // expenses can be caught up retroactively with "🔄 Sync to Vendor List". ──
  const [vendors,setVendors]=useState(()=>loadVendors(salonId));
  useEffect(()=>{saveVendors(vendors,salonId);},[vendors,salonId]);
  const [vendorInvoices,setVendorInvoices]=useState(()=>loadVendorInvoices(salonId));
  useEffect(()=>{saveVendorInvoices(vendorInvoices,salonId);},[vendorInvoices,salonId]);
  const vendorCategoryForExpenseType=(expenseName)=>{
    if(expenseName==='DG Rent')return'DG Rent';
    if(expenseName==='Drycleaning Expenses')return'Drycleaning Expenses';
    if(expenseName==='Professional Fee')return'Professional Fee';
    if(expenseName==='Staff Room Rent')return'Staff Room Rent';
    if(expenseName==='Rent')return'Rent';
    if(expenseName==='Royalty')return'Royalty';
    if(expenseName==='Electricity Expenses')return'Electricity Expenses';
    if(expenseName==='Telephone & Internet Expenses')return'Telephone & Internet Expenses';
    if(expenseName==='Uniform Expenses')return'Uniform Expenses';
    if(expenseName==='Maintenance Expenses'||expenseName==='Maintenance Bill')return'Maintenance Expenses';
    if(expenseName==='Diesel Expenses')return'Utilities';
    if(expenseName==='Marketing Expenses')return'Marketing';
    return'Other';
  };
  // Finds an existing vendor by name (exact, then loose match) or creates one, returning
  // {vendors, created} so the caller can report whether a new vendor was actually added.
  const ensureVendorForPayee=(vendorsList,payeeRaw,expenseName,gstin)=>{
    const payee=String(payeeRaw||'').trim();
    if(!payee)return{vendors:vendorsList,created:null};
    const existing=vendorsList.find(v=>v.name.trim().toLowerCase()===payee.toLowerCase())
      ||vendorsList.find(v=>v.name.toLowerCase().includes(payee.toLowerCase())||payee.toLowerCase().includes(v.name.toLowerCase()));
    if(existing)return{vendors:vendorsList,created:null};
    const newId=nextPrefixedId(vendorsList,'V',3);
    const newVendor={id:newId,name:payee,address:'',gst:gstin||'',cat:vendorCategoryForExpenseType(expenseName),contact:'',phone:'',terms:'30 days',status:'Active'};
    return{vendors:[...vendorsList,newVendor],created:newVendor};
  };

  // ── Invoice sync — brings the recurring expense itself into Vendor Sheet's Invoices &
  // Payments, not just the vendor record, so it shows up as a real payable against that vendor.
  // Keyed by "REC-{recurring expense id}" so re-saving the same recurring expense updates its
  // one linked invoice instead of creating a duplicate every time you edit it. The invoice amount
  // is what's actually owed to the vendor: Invoice Value (Taxable + GST) when GST is applicable,
  // or just the Taxable Amount when it's not — Reverse Charge GST is self-paid to the government
  // directly, it was never on the vendor's own invoice to begin with. ──
  const isoToDMY2=(iso)=>{if(!iso)return'';const p=iso.split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:'';};
  const ensureInvoiceForRecurring=(invoicesList,rec,vendorId)=>{
    if(!vendorId)return{invoices:invoicesList,created:false,updated:false};
    const linkNo='REC-'+rec.id;
    const invoiceDateIso=rec.startDate||rec.rentStartDate||new Date().toISOString().slice(0,10);
    const invoiceDate=isoToDMY2(invoiceDateIso)||new Date().toLocaleDateString('en-GB').replace(/\//g,'/');
    const amount=rec.gstApplicable?(Number(rec.amount)||0)+(Number(rec.gstAmount)||0):(Number(rec.amount)||0);
    // TDS — deducted at source, so it's never actually paid to the vendor in cash. Recorded here
    // as an auto-managed payment entry (a fixed id keyed to this invoice, replaced every time this
    // recurring expense is saved) so the invoice's Outstanding balance already nets it off,
    // instead of expecting a real cash payment for the full Invoice Value.
    const tdsAmt=tdsAmountOf(rec);
    const tdsPaymentId='TDS-'+linkNo;
    const payload={vendorId,invoiceNo:linkNo,docNature:'Tax Invoice',invoiceDate,dueDate:'',bookingDate:invoiceDate,
      taxable:Number(rec.amount)||0,igst:'',cgst:'',sgst:'',roundOff:'',amount,
      tdsAmt,tdsSection:rec.tdsApplicable?rec.tdsSection:'',tdsRate:rec.tdsApplicable?rec.tdsRate:'',
      category:vendorCategoryForExpenseType(rec.expenseName),
      desc:'Recurring: '+displayName(rec)+' ('+rec.frequency+')',attachment:null,linkedPI:''};
    const withTdsPayment=(existingPayments)=>{
      const withoutOldTds=(existingPayments||[]).filter(p=>p.id!==tdsPaymentId);
      return tdsAmt>0
        ?[...withoutOldTds,{id:tdsPaymentId,paidAmount:tdsAmt,paidDate:invoiceDateIso,mode:'TDS',ref:'',note:'TDS deducted at source ('+(rec.tdsSection||'—')+' @ '+(Number(rec.tdsRate)||0)+'%) — remitted to the government, not paid to the vendor'}]
        :withoutOldTds;
    };
    const idx=invoicesList.findIndex(i=>i.invoiceNo===linkNo&&i.vendorId===vendorId);
    if(idx>=0){
      const next=[...invoicesList];
      next[idx]={...next[idx],...payload,payments:withTdsPayment(next[idx].payments)};
      return{invoices:next,created:false,updated:true};
    }
    return{invoices:[...invoicesList,{...payload,payments:withTdsPayment([])}],created:true,updated:false};
  };

  // ── "Enter bill" for Variable items: the actual bill is saved as this payee's vendor invoice
  // (recurringId links it to the item) with the months it covers; the P&L spreads it over those
  // months (variableRecurringMonthAmt). ──
  const [billItem,setBillItem]=useState(null);
  const [billForm,setBillForm]=useState({});
  const ymOf=(idx)=>Math.floor(idx/12)+'-'+String(idx%12+1).padStart(2,'0');
  const defaultBillPeriod=(it,billDateIso)=>{
    const N=RECURRING_PERIOD_MONTHS[it.frequency]||1;const bm=monthIndexOfIso(billDateIso);
    if(bm==null)return{from:'',to:''};
    const last=it.billFor==='current'?bm:bm-1;return{from:ymOf(last-N+1),to:ymOf(last)};
  };
  const openEnterBill=(it)=>{
    const today=new Date().toISOString().slice(0,10);const p=defaultBillPeriod(it,today);
    setBillForm({billNo:'',billDate:today,periodFrom:p.from,periodTo:p.to,amount:'',gst:'',attachment:null,periodTouched:false});
    setBillItem(it);
  };
  const saveBill=()=>{
    const it=billItem,f=billForm;
    if(!f.billNo.trim()){toast('Enter the bill number','error');return;}
    if(!f.billDate){toast('Enter the bill date','error');return;}
    if(!(Number(f.amount)>0)){toast('Enter the bill amount','error');return;}
    if(!f.periodFrom||!f.periodTo||f.periodTo<f.periodFrom){toast('Choose the months this bill covers','error');return;}
    if(outletSettings(salonId).attachmentRequired&&!f.attachment){toast('This outlet requires the bill copy to be attached','error');return;}
    const{vendors:vlist,created}=ensureVendorForPayee(vendors,it.payee,it.expenseName,it.gstin);
    if(created)setVendors(vlist);
    const payee=String(it.payee||'').trim().toLowerCase();
    const vendor=vlist.find(v=>v.name.trim().toLowerCase()===payee)||vlist.find(v=>v.name.toLowerCase().includes(payee)||payee.includes(v.name.toLowerCase()));
    if(!vendor){toast('Could not find or create a vendor for this payee','error');return;}
    const taxable=Math.round(Number(f.amount)),gst=Math.round(Number(f.gst)||0);
    const tdsAmt=it.tdsApplicable?Math.round(taxable*(Number(it.tdsRate)||0)/100):0;
    const id=nextPrefixedId(vendorInvoices,'VI-',4);
    const dmy=isoToDMY2(f.billDate);
    const months=(monthIndexOfIso(f.periodTo+'-01')-monthIndexOfIso(f.periodFrom+'-01'))+1;
    const periodText=monthLabelOfIndex(monthIndexOfIso(f.periodFrom+'-01'))+(months>1?' – '+monthLabelOfIndex(monthIndexOfIso(f.periodTo+'-01')):'');
    const inv={id,vendorId:vendor.id,invoiceNo:f.billNo.trim(),docNature:'Tax Invoice',invoiceDate:dmy,bookingDate:dmy,dueDate:'',
      taxable,igst:'',cgst:gst?gst/2:'',sgst:gst?gst/2:'',roundOff:'',amount:taxable+gst,
      tdsAmt,tdsSection:it.tdsApplicable?it.tdsSection:'',tdsRate:it.tdsApplicable?it.tdsRate:'',
      category:vendorCategoryForExpenseType(it.expenseName),desc:displayName(it)+' bill for '+periodText,attachment:f.attachment,linkedPI:'',
      recurringId:it.id,periodFrom:f.periodFrom,periodTo:f.periodTo,
      payments:tdsAmt>0?[{id:'TDS-'+id,paidAmount:tdsAmt,paidDate:f.billDate,mode:'TDS',ref:'',note:'TDS deducted at source ('+(it.tdsSection||'—')+' @ '+(Number(it.tdsRate)||0)+'%)'}]:[]};
    setVendorInvoices(prev=>[...prev,inv]);
    setItems(prev=>prev.map(x=>x.id===it.id?{...x,amountUpdatedOn:new Date().toISOString().slice(0,10)}:x));
    toast('Bill '+inv.invoiceNo+' saved — ₹'+inv.amount.toLocaleString('en-IN')+' for '+periodText+(months>1?' (₹'+Math.round(inv.amount/months).toLocaleString('en-IN')+' per month on the P&L)':'')+'. It is also in Vendor Sheet for payment.','success');
    setBillItem(null);
  };

  const BLANK={id:'',expenseName:RECURRING_EXPENSE_TYPES[0],customName:'',payee:'',amount:'',frequency:'Monthly',dueDay:5,paymentMode:'Bank Transfer',startDate:'',endDate:'',status:'Active',notes:'',
    amountType:'Fixed',billFor:'previous',
    gstApplicable:false,gstin:'',gstAmount:'',
    // Reverse Charge Mechanism only applies to specific categories of supply under Section
    // 9(3)/9(4) of the CGST Act — it's not automatic just because the payee doesn't charge GST.
    // Defaults to true only so an existing record that was relying on the old automatic-18%
    // assumption doesn't silently change; every entry now gets asked explicitly.
    gstReverseChargeApplicable:true,
    tdsApplicable:false,tdsSection:'',tdsRate:'',
    rentStartDate:'',nextIncrementDate:'',incrementPct:'',agreementFile:null,
    numIncrements:'',increments:[],
    // Royalty
    royaltyCondition:'',royaltyPct:'',royaltyAgreementFile:null,
    // Electricity Expenses
    electricityAccountNo:'',electricityPaymentLink:'',invoiceCreationDay:'',electricityInvoiceFile:null,
    // Telephone & Internet Expenses
    telephoneNo:'',telephoneAccountNo:'',telephonePaymentLink:'',telephoneInvoiceCreationDay:'',telephoneInvoiceFile:null,
    // Marketing Expenses
    marketingNature:'',marketingNextIncrementDate:'',marketingNextAmount:'',
    // Drycleaning Expenses
    drycleaningNextIncrementDate:'',drycleaningNextAmount:'',drycleaningDocFile:null,
    // Professional Fee
    profFeeNextIncrementDate:'',profFeeNextAmount:'',profFeeDocFile:null,
    // Software Subscription
    nextRenewalDate:'',
    // Applies to every expense type — when this recurring entry itself should be closed/stopped,
    // separate from a contract's own End Date above.
    closingDate:'',
    // Amount-update tracking — for expense types whose bill genuinely varies each period
    // (Electricity, Telephone & Internet) rather than staying flat like Rent, so the app can
    // remind rather than silently re-use a stale figure. Stamped to today whenever Amount is
    // edited; see needsAmountUpdate() below.
    amountUpdatedOn:new Date().toISOString().slice(0,10)};
  const [showModal,setShowModal]=useState(false);
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState(BLANK);
  const [showDelete,setShowDelete]=useState(null);
  // ── Show More Details — GST/TDS/increment schedule/agreement uploads/type-specific fields
  // (Electricity account no., Telephone no., Royalty terms, etc.) stay collapsed by default so
  // adding a simple recurring bill is a 5-field form, not a 25-field one. Editing an item that
  // already has any of this filled in opens with it expanded, so nothing already configured is
  // ever hidden from the person who set it up. ──
  const [showMoreDetails,setShowMoreDetails]=useState(false);
  const recordHasExtraDetails=(it)=>!!(it&&(it.gstApplicable||it.tdsApplicable||it.rentStartDate||(it.increments&&it.increments.length)||it.agreementFile
    ||it.royaltyCondition||it.royaltyPct||it.electricityAccountNo||it.telephoneNo||it.marketingNature||it.drycleaningNextIncrementDate
    ||it.profFeeNextIncrementDate||it.nextRenewalDate));
  // ── Bulk actions — select several recurring expenses at once and apply one action to all:
  // Mark Active, Mark Inactive, or Delete. Same pattern as Employee Master's bulk actions —
  // checkbox column, a toolbar that only shows once something's selected, and delete goes
  // through an Undo toast that restores both the items AND whichever of their linked Vendor
  // Sheet invoices were removed alongside them (remove() below already cleans those up, so
  // undo has to put both halves back, not just the recurring-expense record). ──
  const [bulkSelectedIds,setBulkSelectedIds]=useState(()=>new Set());
  const toggleBulkSelect=(id)=>setBulkSelectedIds(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});
  const bulkSetStatus=(status)=>{
    const ids=bulkSelectedIds;
    setItems(prev=>prev.map(it=>ids.has(it.id)?{...it,status}:it));
    toast(ids.size+' item'+(ids.size===1?'':'s')+' marked '+status,'success');
    setBulkSelectedIds(new Set());
  };
  const [showBulkDeleteConfirm,setShowBulkDeleteConfirm]=useState(false);
  const bulkDelete=()=>{
    const ids=bulkSelectedIds;
    if(!ids.size)return;
    const removedItems=items.filter(it=>ids.has(it.id));
    const removedIndices=new Map(removedItems.map(it=>[it.id,items.findIndex(x=>x.id===it.id)]));
    const linkNos=new Set(removedItems.map(it=>'REC-'+it.id));
    const removedInvoices=vendorInvoices.filter(i=>linkNos.has(i.invoiceNo));
    setItems(prev=>prev.filter(it=>!ids.has(it.id)));
    setVendorInvoices(prev=>prev.filter(i=>!linkNos.has(i.invoiceNo)));
    setBulkSelectedIds(new Set());
    toast(removedItems.length+' recurring expense'+(removedItems.length===1?'':'s')+' deleted','warning',8000,()=>{
      setItems(prev=>{
        const next=[...prev];
        [...removedItems].sort((a,b)=>removedIndices.get(a.id)-removedIndices.get(b.id)).forEach(it=>{
          next.splice(Math.min(removedIndices.get(it.id),next.length),0,it);
        });
        return next;
      });
      if(removedInvoices.length)setVendorInvoices(prev=>[...prev,...removedInvoices]);
    });
  };
  const fc=(k)=>(e)=>setForm(f=>({...f,[k]:e.target.value}));
  // Resizes the increments array to match No. of Increments, preserving whatever's already
  // entered in existing rows and only adding/trimming at the end.
  const setNumIncrements=(n)=>setForm(f=>{
    const count=Math.max(0,Math.min(24,Number(n)||0)); // sane ceiling — this is a rent schedule, not a spreadsheet
    const current=f.increments||[];
    const next=Array.from({length:count},(_,i)=>current[i]||{date:'',pct:''});
    return{...f,numIncrements:n,increments:next};
  });
  const updateIncrementRow=(idx,key,val)=>setForm(f=>({...f,increments:(f.increments||[]).map((r,i)=>i===idx?{...r,[key]:val}:r)}));

  const nextId=()=>nextPrefixedId(items,'RE',3);
  const displayName=(it)=>it.expenseName==='Other'&&it.customName?it.customName:it.expenseName;
  // Shared with the P&L linkage — one formula, no drift. Variable items: the current estimate
  // (average of recent bills per month).
  const monthlyEquiv=(it)=>isVariableRecurring(it)?variableRecurringEstimatePerMonth(it,variableRecurringBills(it,salonId)):recurringExpenseMonthlyAmt(it);
  // Invoice Value = Taxable/Base Amount + whatever GST actually applies — forward-charge GST
  // (as entered) when the payee charges it, or 18% under Reverse Charge when they don't (and RCM
  // was flagged as applicable). Mirrors recurringExpenseMonthlyAmt's own GST/RCM math exactly, so
  // this preview and the P&L figure this expense actually contributes always agree.
  const invoiceValueOf=(it)=>{
    const base=Number(it.amount)||0;
    if(it.expenseName==='Electricity Expenses')return base;
    const gstAmt=it.gstApplicable?(Number(it.gstAmount)||0):(it.gstReverseChargeApplicable?base*0.18:0);
    return base+gstAmt;
  };

  const openAdd=()=>{setForm({...BLANK,id:nextId()});setEditId(null);setShowMoreDetails(false);setShowModal(true);};
  const openEdit=(it)=>{
    // Migrate a legacy single nextIncrementDate/incrementPct pair (from before the multi-increment
    // schedule existed) into the new increments array, so nothing already saved gets lost.
    const migratedIncrements=(it.increments&&it.increments.length)?it.increments:(it.nextIncrementDate?[{date:it.nextIncrementDate,pct:it.incrementPct||''}]:[]);
    setForm({...BLANK,...it,increments:migratedIncrements,numIncrements:it.numIncrements||(migratedIncrements.length||'')});
    setEditId(it.id);setShowMoreDetails(recordHasExtraDetails(it));setShowModal(true);
  };
  const save=()=>{
    if(!form.payee.trim()){toast('Payee / Vendor name is required','error');return;}
    if(!form.amount||Number(form.amount)<=0){toast('Enter a valid amount','error');return;}
    if(form.expenseName==='Other'&&!form.customName.trim()){toast('Enter a name for this "Other" expense','error');return;}
    if(form.gstApplicable&&!form.gstin.trim()){toast('Enter the GSTIN, or uncheck GST Applicable','error');return;}
    const rec={...form,amount:Math.round(Number(form.amount)),dueDay:Math.min(31,Math.max(1,Number(form.dueDay)||1)),
      gstAmount:form.gstApplicable?Math.round(Number(form.gstAmount)||0):'',
      gstin:form.gstApplicable?form.gstin.trim():''};
    if(editId){setItems(prev=>prev.map(i=>i.id===editId?rec:i));}
    else{setItems(prev=>[...prev,rec]);}
    const{vendors:nextVendors,created}=ensureVendorForPayee(vendors,rec.payee,rec.expenseName,rec.gstin);
    if(created)setVendors(nextVendors);
    const vendorMatch=nextVendors.find(v=>v.name.trim().toLowerCase()===rec.payee.trim().toLowerCase())
      ||nextVendors.find(v=>v.name.toLowerCase().includes(rec.payee.toLowerCase())||rec.payee.toLowerCase().includes(v.name.toLowerCase()));
    // Variable items have no standing invoice — each actual bill ("Enter bill") is the payable. A
    // standing one left from when the item was Fixed is removed if nothing was paid against it.
    let invCreated=false;
    if(rec.amountType==='Variable'){
      setVendorInvoices(prev=>prev.filter(i=>!(i.invoiceNo==='REC-'+rec.id&&!(i.payments||[]).some(p=>p.mode!=='TDS'))));
    }else{
      const r=ensureInvoiceForRecurring(vendorInvoices,rec,vendorMatch&&vendorMatch.id);
      invCreated=r.created;setVendorInvoices(r.invoices);
    }
    if(created)toast('Recurring expense saved — added "'+created.name+'" to Vendor List ('+created.cat+') with a linked invoice','success');
    else if(invCreated)toast((editId?'Recurring expense updated':'Recurring expense added')+' — invoice added in Vendor Sheet','success');
    else toast(editId?'Recurring expense updated — linked invoice kept in sync':'Recurring expense added','success');
    setShowModal(false);
  };
  const remove=(id)=>{
    const linkNo='REC-'+id;
    const linked=vendorInvoices.find(i=>i.invoiceNo===linkNo);
    const hasPayments=linked&&linked.payments&&linked.payments.length>0;
    setItems(prev=>prev.filter(i=>i.id!==id));
    if(linked)setVendorInvoices(prev=>prev.filter(i=>i.invoiceNo!==linkNo));
    setShowDelete(null);
    if(hasPayments)toast('Recurring expense and its linked invoice removed — that invoice had '+linked.payments.length+' payment'+(linked.payments.length===1?'':'s')+' recorded against it, now gone too','warning');
    else toast('Recurring expense removed'+(linked?' — its linked invoice in Vendor Sheet was removed too':''),'info');
  };
  // Retroactively catches up any existing recurring expenses whose Payee isn't in the Vendor List
  // yet, and makes sure each one has its linked invoice in Vendor Sheet's Invoices & Payments.
  const syncAllToVendors=()=>{
    let workingVendors=vendors;
    let workingInvoices=vendorInvoices;
    let createdVendors=0,createdInvoices=0,updatedInvoices=0;
    items.forEach(it=>{
      const{vendors:nextV,created}=ensureVendorForPayee(workingVendors,it.payee,it.expenseName,it.gstin);
      workingVendors=nextV;
      if(created)createdVendors++;
      const match=workingVendors.find(v=>v.name.trim().toLowerCase()===it.payee.trim().toLowerCase())
        ||workingVendors.find(v=>v.name.toLowerCase().includes(it.payee.toLowerCase())||it.payee.toLowerCase().includes(v.name.toLowerCase()));
      if(it.amountType==='Variable')return; // bills are the payables for variable items
      const{invoices:nextI,created:invC,updated:invU}=ensureInvoiceForRecurring(workingInvoices,it,match&&match.id);
      workingInvoices=nextI;
      if(invC)createdInvoices++;
      if(invU)updatedInvoices++;
    });
    setVendors(workingVendors);
    setVendorInvoices(workingInvoices);
    if(createdVendors||createdInvoices||updatedInvoices){
      toast([createdVendors?createdVendors+' vendor'+(createdVendors===1?'':'s')+' added':null,
        createdInvoices?createdInvoices+' invoice'+(createdInvoices===1?'':'s')+' added':null,
        updatedInvoices?updatedInvoices+' invoice'+(updatedInvoices===1?'':'s')+' updated':null].filter(Boolean).join(' · '),'success');
    }else toast('Everything is already in sync with Vendor Sheet','info');
  };

  const activeItems=items.filter(i=>i.status==='Active');
  const totalMonthly=activeItems.reduce((s,i)=>s+monthlyEquiv(i),0);
  const today=new Date();
  const dueSoon=activeItems.filter(i=>{const d=Number(i.dueDay)-today.getDate();return d>=0&&d<=7;});

  const REF_COLS=[
    {key:'expenseName',label:'Expense Type',type:'enum',get:i=>displayName(i)},
    {key:'payee',label:'Payee / Vendor',type:'text',get:i=>i.payee},
    {key:'frequency',label:'Frequency',type:'enum',get:i=>i.frequency},
    {key:'amount',label:'Taxable Amount',type:'number',get:i=>'₹'+Number(i.amount).toLocaleString('en-IN'),raw:i=>Number(i.amount)||0},
    {key:'paymentMode',label:'Payment Mode',type:'enum',get:i=>i.paymentMode},
    {key:'status',label:'Status',type:'enum',get:i=>i.status}
  ];
  const reFilters=useExcelColumnFilter(items,REF_COLS);
  const reWrapRef=useRef(null);
  const reCellRange=useExcelCellRange(reWrapRef);

  const reReportBodyHtml=()=>'<table><thead><tr><th>Expense Type</th><th>Payee</th><th>Frequency</th><th class="num">Taxable Amount</th><th class="num">Invoice Value</th><th class="num">TDS Payable</th><th class="num">Payable to Payee</th><th class="num">Monthly Equiv.</th><th>Due Day</th><th>Payment Mode</th><th>Status</th></tr></thead><tbody>'
    +reFilters.filteredRows.map(i=>'<tr><td>'+displayName(i)+'</td><td>'+i.payee+'</td><td>'+i.frequency+'</td><td class="num">₹'+Number(i.amount).toLocaleString('en-IN')+'</td><td class="num">₹'+invoiceValueOf(i).toLocaleString('en-IN')+'</td><td class="num">'+(tdsAmountOf(i)?'₹'+tdsAmountOf(i).toLocaleString('en-IN'):'—')+'</td><td class="num">₹'+(invoiceValueOf(i)-tdsAmountOf(i)).toLocaleString('en-IN')+'</td><td class="num">₹'+Math.round(monthlyEquiv(i)).toLocaleString('en-IN')+'</td><td>'+i.dueDay+'</td><td>'+i.paymentMode+'</td><td>'+i.status+'</td></tr>').join('')+'</tbody></table>';
  const reReportSheetRows=()=>[['Expense Type','Payee','Frequency','Taxable Amount','GST Applicable','GSTIN','GST Amount','Invoice Value','TDS Section','TDS Rate %','TDS Payable','Payable to Payee','Monthly Equivalent','Due Day','Payment Mode','Start Date','End Date','Status','Notes'],
    ...reFilters.filteredRows.map(i=>[displayName(i),i.payee,i.frequency,Number(i.amount),
      i.gstApplicable?'Yes':'No',i.gstin||'',i.gstAmount||'',
      invoiceValueOf(i),i.tdsApplicable?(i.tdsSection||''):'',i.tdsApplicable?(Number(i.tdsRate)||0):'',tdsAmountOf(i),invoiceValueOf(i)-tdsAmountOf(i),
      Math.round(monthlyEquiv(i)),i.dueDay,i.paymentMode,i.startDate||'',i.endDate||'',i.status,i.notes||''])];

  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Recurring Expenses'),
        React.createElement('div',{className:'page-sub'},'Standing bills this outlet expects every period — Rent, Royalty, Electricity, Telephone & Internet, and the like. Payees are kept in sync with the Vendor List automatically.')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:syncAllToVendors},'🔄 Sync to Vendor List'),
        React.createElement(ShareReportButton,{title:'Recurring Expenses — '+(salon?salon.name.split('—')[0].trim():'Outlet'),subtitle:'Recurring Expenses',getBodyHtml:reReportBodyHtml,getSheetRows:reReportSheetRows}),
        React.createElement('button',{className:'btn btn-primary btn-sm',onClick:openAdd},'+ Add Recurring Expense')
      )
    ),

    React.createElement('div',{className:'grid4',style:{marginBottom:16}},
      React.createElement('div',{className:'metric-card blue'},React.createElement('div',{className:'metric-label'},'Active Recurring Items'),React.createElement('div',{className:'metric-value'},activeItems.length)),
      React.createElement('div',{className:'metric-card amber'},React.createElement('div',{className:'metric-label'},'Monthly Commitment'),React.createElement('div',{className:'metric-value'},'₹'+Math.round(totalMonthly).toLocaleString('en-IN'))),
      React.createElement('div',{className:'metric-card green'},React.createElement('div',{className:'metric-label'},'Annual Commitment'),React.createElement('div',{className:'metric-value'},'₹'+Math.round(totalMonthly*12).toLocaleString('en-IN'))),
      React.createElement('div',{className:'metric-card red'},React.createElement('div',{className:'metric-label'},'Due Within 7 Days'),React.createElement('div',{className:'metric-value'},dueSoon.length))
    ),

    // ── Bulk action toolbar — appears only once at least one row is selected. ──
    bulkSelectedIds.size>0&&React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:'10px 14px',background:'rgba(47,95,224,0.08)',border:'1px solid rgba(47,95,224,0.3)',borderRadius:'var(--r)',marginBottom:14}},
      React.createElement('span',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},bulkSelectedIds.size+' selected'),
      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>bulkSetStatus('Active')},'Mark Active'),
      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>bulkSetStatus('Inactive')},'Mark Inactive'),
      React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.3)',color:'var(--red)',padding:'5px 12px',borderRadius:'var(--r)',cursor:'pointer',fontSize:12,fontWeight:500},onClick:()=>setShowBulkDeleteConfirm(true)},'🗑 Delete Selected'),
      React.createElement('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:'auto'},onClick:()=>setBulkSelectedIds(new Set())},'Clear selection')
    ),

    React.createElement('div',{className:'card'},
      React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:8}},'Click a cell — or drag across several — then Ctrl/Cmd+C to copy, just like Excel.'),
      React.createElement('div',{className:'table-wrap',ref:reWrapRef},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,
            React.createElement('th',{key:'bulk-check',style:{width:32}},
              reFilters.filteredRows.length>0&&React.createElement('input',{type:'checkbox',
                checked:reFilters.filteredRows.every(it=>bulkSelectedIds.has(it.id)),
                onChange:e=>setBulkSelectedIds(e.target.checked?new Set(reFilters.filteredRows.map(r=>r.id)):new Set())})),
            reFilters.TH(REF_COLS[0]),reFilters.TH(REF_COLS[1]),reFilters.TH(REF_COLS[2]),reFilters.TH(REF_COLS[3]),
            React.createElement('th',{key:'invoiceValue'},'Invoice Value'),
            React.createElement('th',{key:'tdsPayable',title:'TDS to deduct and pay to the government each period'},'TDS Payable'),
            React.createElement('th',{key:'netPayable',title:'What is actually paid to the payee each period: Invoice Value − TDS'},'Payable to Payee'),
            React.createElement('th',{key:'monthlyEq'},'Monthly Equiv.'),
            React.createElement('th',{key:'dueDay'},'Due Day'),
            reFilters.TH(REF_COLS[4]),
            React.createElement('th',{key:'window'},'Active Window'),
            reFilters.TH(REF_COLS[5]),
            React.createElement('th',{key:'actions'},'Actions')
          )),
          reFilters.filteredRows.length===0
            ?React.createElement('tbody',null,React.createElement('tr',null,React.createElement('td',{colSpan:14,style:{textAlign:'center',padding:32,color:'var(--text3)'}},items.length===0?'No recurring expenses set up yet. Click + Add Recurring Expense to begin.':'No recurring expenses match your filters.')))
            :React.createElement('tbody',null,reFilters.filteredRows.map((it,ri)=>{
              const sel=(c)=>reCellRange.isSelected(ri,c)?'rgba(47,95,224,0.12)':undefined;
              const dueInDays=Number(it.dueDay)-today.getDate();
              const isDueSoon=it.status==='Active'&&dueInDays>=0&&dueInDays<=7;
              return React.createElement('tr',{key:it.id,style:isDueSoon?{background:'rgba(255,159,67,0.08)'}:undefined},
                React.createElement('td',null,React.createElement('input',{type:'checkbox',checked:bulkSelectedIds.has(it.id),onChange:()=>toggleBulkSelect(it.id)})),
                React.createElement('td',{'data-xr':ri,'data-xc':0,style:{background:sel(0)}},React.createElement('div',{style:{fontWeight:500,color:'var(--text)'}},displayName(it)),React.createElement('div',{style:{fontSize:10,color:'var(--text3)'}},it.id)),
                React.createElement('td',{'data-xr':ri,'data-xc':1,style:{background:sel(1)}},it.payee),
                React.createElement('td',{'data-xr':ri,'data-xc':2,style:{background:sel(2)}},React.createElement('span',{className:'badge badge-blue'},it.frequency)),
                React.createElement('td',{'data-xr':ri,'data-xc':3,style:{background:sel(3)}},
                  React.createElement('span',{style:{fontWeight:600,color:'var(--text)'}},'₹'+Number(it.amount).toLocaleString('en-IN')),
                  isVariableRecurring(it)
                    ?(()=>{
                        const bills=variableRecurringBills(it,salonId);const last=bills[bills.length-1];
                        const miss=variableRecurringMissingPeriod(it,salonId);
                        return React.createElement('div',{style:{fontSize:10,marginTop:2,lineHeight:1.5}},
                          React.createElement('span',{className:'badge badge-purple',style:{fontSize:9,padding:'1px 6px'}},'Variable'),
                          last&&React.createElement('div',{style:{color:'var(--text3)'}},'Last bill ₹'+Math.round(last.amount).toLocaleString('en-IN')+' ('+monthLabelOfIndex(last.first)+(last.months>1?'–'+monthLabelOfIndex(last.last):'')+')'),
                          miss&&React.createElement('div',{style:{color:'var(--orange)',fontWeight:600}},'⚠ '+monthLabelOfIndex(miss.first)+(miss.last>miss.first?'–'+monthLabelOfIndex(miss.last):'')+' bill not entered'));
                      })()
                    :(it.status==='Active'&&needsAmountUpdate(it)&&React.createElement('div',{style:{fontSize:10,color:'var(--orange)',fontWeight:600,marginTop:2}},'⚠ Update Amount'))
                ),
                React.createElement('td',null,'₹'+invoiceValueOf(it).toLocaleString('en-IN')),
                React.createElement('td',null,tdsAmountOf(it)>0
                  ?React.createElement('span',{title:(it.tdsSection||'')+' @ '+(Number(it.tdsRate)||0)+'% on ₹'+Number(it.amount).toLocaleString('en-IN'),style:{color:'var(--orange)',fontWeight:600}},'₹'+tdsAmountOf(it).toLocaleString('en-IN'))
                  :React.createElement('span',{style:{color:'var(--text3)'}},'—')),
                React.createElement('td',{style:{fontWeight:600}},'₹'+(invoiceValueOf(it)-tdsAmountOf(it)).toLocaleString('en-IN')),
                React.createElement('td',null,'₹'+Math.round(monthlyEquiv(it)).toLocaleString('en-IN')),
                React.createElement('td',null,isDueSoon?React.createElement('span',{style:{color:'var(--orange)',fontWeight:600}},'Day '+it.dueDay+' ⚠'):('Day '+it.dueDay)),
                React.createElement('td',{'data-xr':ri,'data-xc':4,style:{background:sel(4)}},it.paymentMode),
                React.createElement('td',null,React.createElement('div',{style:{fontSize:11}},it.startDate||'—'),it.endDate?React.createElement('div',{style:{fontSize:10,color:'var(--text3)'}},'to '+it.endDate):null),
                React.createElement('td',{'data-xr':ri,'data-xc':5,style:{background:sel(5)}},React.createElement('span',{className:'badge '+(it.status==='Active'?'badge-green':it.status==='Expired'?'badge-red':'badge-gray')},it.status)),
                React.createElement('td',null,React.createElement('div',{style:{display:'flex',gap:4}},
                  isVariableRecurring(it)&&React.createElement('button',{className:'btn btn-primary btn-sm',title:'Record this period’s actual bill',onClick:()=>openEnterBill(it)},'➕ Enter bill'),
                  React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>openEdit(it)},'Edit'),
                  React.createElement('button',{'aria-label':'Delete',className:'btn btn-sm',style:{background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.3)',color:'var(--red)',padding:'4px 8px',borderRadius:'var(--r)',cursor:'pointer',fontSize:11},onClick:()=>setShowDelete(it)},React.createElement(IconTrash,{size:14}))
                ))
              );
            }))
        )
      ),
      reFilters.Portal(),
      reCellRange.Toolbar()
    ),

    showModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowModal(false)},
      React.createElement('div',{className:'modal',style:{width:580},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},editId?'Edit Recurring Expense':'Add Recurring Expense'),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},
            React.createElement('label',null,'Expense Type *'),
            React.createElement('select',{className:'form-control',value:form.expenseName,onChange:fc('expenseName')},RECURRING_EXPENSE_TYPES.map(t=>React.createElement('option',{key:t,value:t},t)))
          ),
          form.expenseName==='Other'
            ?React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-110'},'Custom Name *'),React.createElement('input',{id:'f-110',className:'form-control',value:form.customName,onChange:fc('customName'),placeholder:'e.g. Pest Control Contract'}))
            :React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-111'},'Payee / Vendor / Landlord *'),React.createElement('input',{id:'f-111',className:'form-control',value:form.payee,onChange:fc('payee'),placeholder:'Who this is paid to'}))
        ),
        form.expenseName==='Other'&&React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-112'},'Payee / Vendor *'),React.createElement('input',{id:'f-112',className:'form-control',value:form.payee,onChange:fc('payee'),placeholder:'Who this is paid to'}))
        ),
        React.createElement('div',{className:'form-row cols3'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-113'},gstInputAllowedAsOf(salon,new Date().toISOString().slice(0,10))?'Taxable Amount (₹) *':'Amount Total (₹) *'),React.createElement('input',{id:'f-113',type:'number',className:'form-control',value:form.amount,onChange:e=>setForm(f=>({...f,amount:e.target.value,amountUpdatedOn:new Date().toISOString().slice(0,10)})),placeholder:'0'})),
          React.createElement('div',{className:'form-group'},
            React.createElement('label',null,'Frequency'),
            React.createElement('select',{className:'form-control',value:form.frequency,onChange:fc('frequency')},RECURRING_FREQUENCIES.map(f=>React.createElement('option',{key:f,value:f},f)))
          ),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-114'},'Due Day of Month'),React.createElement('input',{id:'f-114',type:'number',min:1,max:31,className:'form-control',value:form.dueDay,onChange:fc('dueDay')}))
        ),
        // ── Fixed vs Variable amount — Variable is for bills whose amount is only known when the bill
        // arrives (electricity, telephone, water…). See variableRecurringMonthAmt for the P&L rule. ──
        React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14}},
          React.createElement('div',{style:{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}},
            React.createElement('span',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},'Amount:'),
            [['Fixed','Fixed — same every period'],['Variable','Variable — actual bill each period']].map(([v,l])=>React.createElement('label',{key:v,style:{display:'flex',alignItems:'center',gap:6,fontSize:12.5,cursor:'pointer'}},
              React.createElement('input',{type:'radio',name:'reAmountType',checked:(form.amountType||'Fixed')===v,onChange:()=>setForm(f=>({...f,amountType:v}))}),l))
          ),
          form.amountType==='Variable'&&React.createElement('div',{style:{marginTop:10}},
            React.createElement('div',{style:{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center',marginBottom:6}},
              React.createElement('span',{style:{fontSize:12,color:'var(--text2)'}},'Each bill is for:'),
              [['previous','the period just ended (usual for electricity)'],['current','the current period (billed in advance)']].map(([v,l])=>React.createElement('label',{key:v,style:{display:'flex',alignItems:'center',gap:6,fontSize:12,cursor:'pointer'}},
                React.createElement('input',{type:'radio',name:'reBillFor',checked:(form.billFor||'previous')===v,onChange:()=>setForm(f=>({...f,billFor:v}))}),l))),
            React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',lineHeight:1.6}},
              'Record each actual bill with "➕ Enter bill" on this row (or as an invoice from this payee in Vendor Sheet). On the P&L, each bill is spread evenly over the months it covers — e.g. a '+(form.frequency||'Bi-Monthly')+' bill of ₹12,000 counts ₹'+Math.round(12000/(RECURRING_PERIOD_MONTHS[form.frequency]||1)).toLocaleString('en-IN')+' per month. Months whose bill hasn’t come yet use an estimate: the average of the last 3 bills (the amount above until there is a bill history).'))
        ),

        // ── Show More Details toggle — collapses GST/TDS/increment-schedule/agreement/
        // type-specific fields by default; expands automatically in openEdit above if the item
        // being edited already has any of them filled in. ──
        React.createElement('div',{style:{marginBottom:14}},
          React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:()=>setShowMoreDetails(v=>!v)},
            showMoreDetails?'− Hide GST, TDS & other details':'+ Add GST, TDS & other details')
        ),

        showMoreDetails&&React.createElement(React.Fragment,null,
        form.expenseName==='Electricity Expenses'
          ?React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:14,fontSize:10.5,color:'var(--text3)',lineHeight:1.5}},
              'No GST or TDS on electricity — supply of electrical energy is exempt from GST (Notification 2/2017-Central Tax (Rate)), and there\'s no TDS provision on electricity payments. The Taxable Amount above flows into the P&L as-is.')
          :React.createElement(React.Fragment,null,
              (()=>{
                const itcAllowed=gstInputAllowedAsOf(salon,new Date().toISOString().slice(0,10));
                const amtLabel=itcAllowed?'Taxable Amount':'Amount Total';
                return React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:14}},
                    !itcAllowed&&React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',lineHeight:1.5,marginBottom:10}},
                      'GST Input Credit is blocked for this outlet (Master Sheet → Edit Salon → GST Input Tax Credit) — so whichever of these applies, the GST portion is a real, non-recoverable cost too, not a claimable input credit. It still adds to the Invoice Value used on P&L, same as when ITC is allowed.'),
                    React.createElement('label',{style:{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginBottom:form.gstApplicable?12:0}},
                      React.createElement('input',{type:'checkbox',checked:!!form.gstApplicable,onChange:e=>setForm(f=>({...f,gstApplicable:e.target.checked}))}),
                      React.createElement('span',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},'GST Applicable on this '+form.expenseName),
                      React.createElement('span',{style:{fontSize:10.5,color:'var(--text3)'}},'— the payee is GST-registered and charges it on the invoice')
                    ),
                    form.gstApplicable
                      ?React.createElement('div',null,
                          React.createElement('div',{className:'form-row cols2'},
                            React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-115'},'GSTIN *'),React.createElement('input',{id:'f-115',className:'form-control',value:form.gstin,onChange:fc('gstin'),placeholder:'e.g. 07AAAAA0000A1Z5'})),
                            React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-116'},'GST Amount (₹)'),React.createElement('input',{id:'f-116',type:'number',className:'form-control',value:form.gstAmount,onChange:fc('gstAmount'),placeholder:'0'}))
                          ),
                          React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',lineHeight:1.5}},'The full Invoice Value ('+amtLabel+' + GST Amount) flows into the P&L, not just the '+amtLabel+(itcAllowed?' — GST paid here is treated as part of the real cost.':'.'))
                        )
                      :React.createElement('div',null,
                          React.createElement('label',{style:{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}},
                            React.createElement('input',{type:'checkbox',checked:!!form.gstReverseChargeApplicable,onChange:e=>setForm(f=>({...f,gstReverseChargeApplicable:e.target.checked}))}),
                            React.createElement('span',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},'GST payable under Reverse Charge Mechanism')
                          ),
                          React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',lineHeight:1.5,marginTop:6}},
                            'RCM only applies to specific categories notified under Section 9(3)/9(4) of the CGST Act (e.g. GTA services, legal services, sponsorship) — not automatically just because the payee doesn\'t charge GST. Check this only if this particular expense actually falls under one of those categories.'),
                          form.gstReverseChargeApplicable
                            ?React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',lineHeight:1.5,marginTop:6}},'18% is added to the '+amtLabel+' under RCM when this flows into the P&L — a real, unrecoverable cost.')
                            :React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',lineHeight:1.5,marginTop:6}},'No RCM — the '+amtLabel+' above flows into the P&L as-is, with nothing added.')
                        )
                  );
              })(),
              salon&&salon.tdsApplicable&&React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:14}},
                React.createElement('label',{style:{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginBottom:form.tdsApplicable?10:0}},
                  React.createElement('input',{type:'checkbox',checked:!!form.tdsApplicable,onChange:e=>setForm(f=>({...f,tdsApplicable:e.target.checked}))}),
                  React.createElement('span',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},'TDS Applicable on this '+form.expenseName)
                ),
                form.tdsApplicable&&React.createElement('div',{className:'form-row cols2'},
                  React.createElement('div',{className:'form-group'},React.createElement('label',null,'Section'),
                    React.createElement('select',{className:'form-control',value:form.tdsSection,onChange:e=>{
                      const sec=tdsSectionsAsOf().find(s=>s.code===e.target.value);
                      setForm(f=>({...f,tdsSection:e.target.value,tdsRate:sec?sec.rate:f.tdsRate}));
                    }},[React.createElement('option',{key:'',value:''},'Select Section'),...tdsSectionsAsOf().map(s=>React.createElement('option',{key:s.code,value:s.code},s.label))])),
                  React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-117'},'Rate (%)'),React.createElement('input',{id:'f-117',className:'form-control',type:'number',step:'0.1',value:form.tdsRate,onChange:fc('tdsRate'),placeholder:'e.g. 2'}))
                )
              )
            ),
        (Number(form.amount)>0)&&React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12,padding:'8px 12px',background:'rgba(47,95,224,0.08)',borderRadius:'var(--r)',marginBottom:form.tdsApplicable?0:14}},
          React.createElement('span',{style:{color:'var(--text2)'}},'Invoice Value (Taxable Amount + GST Amount)'),
          React.createElement('span',{style:{fontWeight:700,color:'var(--accent)'}},'₹'+invoiceValueOf(form).toLocaleString('en-IN'))
        ),
        (Number(form.amount)>0)&&form.tdsApplicable&&React.createElement(React.Fragment,null,
          React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12,padding:'8px 12px',background:'rgba(255,159,67,0.08)'}},
            React.createElement('span',{style:{color:'var(--text2)'}},'TDS Deducted ('+(form.tdsSection||'—')+' @ '+(Number(form.tdsRate)||0)+'% on Taxable Amount)'),
            React.createElement('span',{style:{fontWeight:700,color:'var(--orange)'}},'−₹'+tdsAmountOf(form).toLocaleString('en-IN'))
          ),
          React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12.5,padding:'8px 12px',background:'rgba(76,175,125,0.1)',borderRadius:'0 0 var(--r) var(--r)',marginBottom:14}},
            React.createElement('span',{style:{color:'var(--text2)',fontWeight:600}},'Net Payable to '+(form.payee||'Vendor')),
            React.createElement('span',{style:{fontWeight:700,color:'var(--green)'}},'₹'+(invoiceValueOf(form)-tdsAmountOf(form)).toLocaleString('en-IN'))
          )
        ),
        isRentLikeExpense(form.expenseName)&&React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-118'},form.expenseName+' Start Date'),React.createElement('input',{id:'f-118',type:'date',className:'form-control',value:form.rentStartDate,onChange:fc('rentStartDate')})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-121'},'No. of Increments'),React.createElement('input',{id:'f-121',type:'number',min:0,max:24,className:'form-control',value:form.numIncrements,onChange:e=>setNumIncrements(e.target.value),placeholder:'e.g. 3'}))
        ),
        isRentLikeExpense(form.expenseName)&&(form.increments||[]).length>0&&React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:14}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:10}},'Increment Schedule'),
          React.createElement('div',{className:'table-wrap'},
            React.createElement('table',null,
              React.createElement('thead',null,React.createElement('tr',null,['#','Next Increment Date','% of Increment','Amount After Increment (₹)'].map(hh=>React.createElement('th',{key:hh},hh)))),
              React.createElement('tbody',null,(()=>{
                let running=Number(form.amount)||0;
                return (form.increments||[]).map((row,idx)=>{
                  running=running*(1+(Number(row.pct)||0)/100);
                  return React.createElement('tr',{key:idx},
                    React.createElement('td',null,idx+1),
                    React.createElement('td',null,React.createElement('input',{type:'date',className:'form-control',style:{fontSize:12,padding:'5px 8px'},value:row.date,onChange:e=>updateIncrementRow(idx,'date',e.target.value)})),
                    React.createElement('td',null,React.createElement('input',{type:'number',className:'form-control',style:{fontSize:12,padding:'5px 8px'},value:row.pct,onChange:e=>updateIncrementRow(idx,'pct',e.target.value),placeholder:'e.g. 5'})),
                    React.createElement('td',{style:{textAlign:'right',fontWeight:600,color:'var(--accent2)'}},'₹'+Math.round(running).toLocaleString('en-IN'))
                  );
                });
              })())
            )
          ),
          React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:8}},'Each increment compounds on the previous amount — e.g. a 3rd increment of 5% applies to the amount after the 2nd increment, not the original Taxable Amount. Applied automatically to the P&L once each increment\'s date has passed.')
        ),
        isRentLikeExpense(form.expenseName)&&React.createElement('div',{className:'form-group'},
          React.createElement('label',null,form.expenseName+' Agreement'),
          form.agreementFile
            ?React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,fontSize:12,color:'var(--green)'}},
                '📎 '+form.agreementFile,
                React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>{if(confirm('Remove the attached agreement copy?'))setForm(f=>({...f,agreementFile:null}));}},'Remove'))
            :React.createElement('label',{className:'btn btn-ghost btn-sm',style:{cursor:'pointer',display:'inline-block'}},
                '📎 Attach '+form.expenseName+' Agreement',
                React.createElement('input',{type:'file',style:{display:'none'},accept:'.pdf,.doc,.docx,.jpg,.jpeg,.png',onChange:e=>{const f2=e.target.files[0];if(f2)setForm(f=>({...f,agreementFile:f2.name}));}})
              )
        ),

        // ── Royalty — the condition/basis the royalty is calculated on (e.g. "5% of monthly
        // gross revenue, minimum ₹20,000") plus the actual % rate, and the agreement itself. ──
        form.expenseName==='Royalty'&&React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:14}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:10}},'Royalty Details'),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Condition for Royalty Calculation'),
            React.createElement('input',{className:'form-control',value:form.royaltyCondition,onChange:fc('royaltyCondition'),placeholder:'e.g. % of monthly gross revenue, subject to a minimum guarantee'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'% of Royalty'),
            React.createElement('input',{type:'number',className:'form-control',value:form.royaltyPct,onChange:fc('royaltyPct'),placeholder:'e.g. 5',style:{maxWidth:160}})),
          React.createElement('div',{className:'form-group',style:{marginTop:10,marginBottom:0}},
            React.createElement('label',null,'Royalty Agreement (if any)'),
            form.royaltyAgreementFile
              ?React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,fontSize:12,color:'var(--green)'}},
                  '📎 '+form.royaltyAgreementFile,
                  React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>{if(confirm('Remove the attached royalty agreement copy?'))setForm(f=>({...f,royaltyAgreementFile:null}));}},'Remove'))
              :React.createElement('label',{className:'btn btn-ghost btn-sm',style:{cursor:'pointer',display:'inline-block'}},
                  '📎 Attach Agreement',
                  React.createElement('input',{type:'file',style:{display:'none'},accept:'.pdf,.doc,.docx,.jpg,.jpeg,.png',onChange:e=>{const f2=e.target.files[0];if(f2)setForm(f=>({...f,royaltyAgreementFile:f2.name}));}})
                )
          )
        ),

        // ── Electricity Expenses — account number, an online payment link, and the two-date
        // billing cycle (invoice generated on one day, due ~2 weeks later — e.g. created on the
        // 11th, due on the 25th). "Due Day of Month" above already IS the payment due day; this
        // adds the missing other half, when the invoice itself gets generated. ──
        form.expenseName==='Electricity Expenses'&&React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:14}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:10}},'Electricity Details'),
          editId&&needsAmountUpdate(form)&&React.createElement('div',{className:'attention-card attention-card-sm',style:{marginBottom:10,color:'var(--orange)'}},
            '⚠ This bill\'s amount varies every cycle — the new invoice should be out by now. Update the Taxable Amount above to the latest bill before saving.'),
          React.createElement('div',{className:'form-row cols2'},
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Electricity Account No.'),
              React.createElement('input',{className:'form-control',value:form.electricityAccountNo,onChange:fc('electricityAccountNo'),placeholder:'e.g. K-12345678'})),
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Payment Link'),
              React.createElement('input',{className:'form-control',value:form.electricityPaymentLink,onChange:fc('electricityPaymentLink'),placeholder:'e.g. https://discom.gov.in/pay/...'}))
          ),
          React.createElement('div',{className:'form-row cols2'},
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Invoice Creation Day of Month'),
              React.createElement('input',{type:'number',min:1,max:31,className:'form-control',value:form.invoiceCreationDay,onChange:fc('invoiceCreationDay'),placeholder:'e.g. 11'})),
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Payment Due Day (= Due Day of Month above)'),
              React.createElement('input',{className:'form-control',value:form.dueDay,disabled:true,style:{opacity:0.7}}))
          ),
          form.invoiceCreationDay&&form.dueDay&&React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:10}},
            'Invoice generated on the '+form.invoiceCreationDay+' of the month, payment due by the '+form.dueDay+'.'),
          React.createElement('div',{className:'form-group',style:{marginBottom:0}},
            React.createElement('label',null,'Electricity Invoice'),
            form.electricityInvoiceFile
              ?React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,fontSize:12,color:'var(--green)'}},
                  '📎 '+form.electricityInvoiceFile,
                  React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>{if(confirm('Remove the attached electricity invoice copy?'))setForm(f=>({...f,electricityInvoiceFile:null}));}},'Remove'))
              :React.createElement('label',{className:'btn btn-ghost btn-sm',style:{cursor:'pointer',display:'inline-block'}},
                  '📎 Attach Invoice',
                  React.createElement('input',{type:'file',style:{display:'none'},accept:'.pdf,.jpg,.jpeg,.png',onChange:e=>{const f2=e.target.files[0];if(f2)setForm(f=>({...f,electricityInvoiceFile:f2.name}));}})
                )
          )
        ),

        // ── Telephone & Internet Expenses — telephone number, account number, an online payment
        // link, and the same invoice-creation-day pattern as Electricity Expenses (bill generated
        // on one day each month, due by the existing "Due Day of Month" field). ──
        form.expenseName==='Telephone & Internet Expenses'&&React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:14}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:10}},'Telephone & Internet Details'),
          editId&&needsAmountUpdate(form)&&React.createElement('div',{className:'attention-card attention-card-sm',style:{marginBottom:10,color:'var(--orange)'}},
            '⚠ This bill\'s amount varies every cycle — the new invoice should be out by now. Update the Taxable Amount above to the latest bill before saving.'),
          React.createElement('div',{className:'form-row cols2'},
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Telephone No.'),
              React.createElement('input',{className:'form-control',value:form.telephoneNo,onChange:fc('telephoneNo'),placeholder:'e.g. 98xxxxxxxx / 011-4xxxxxxx'})),
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Account No.'),
              React.createElement('input',{className:'form-control',value:form.telephoneAccountNo,onChange:fc('telephoneAccountNo'),placeholder:'e.g. CA-12345678'}))
          ),
          React.createElement('div',{className:'form-row cols2'},
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Payment Link'),
              React.createElement('input',{className:'form-control',value:form.telephonePaymentLink,onChange:fc('telephonePaymentLink'),placeholder:'e.g. https://airtel.in/pay/...'})),
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Invoice Creation Day of Month'),
              React.createElement('input',{type:'number',min:1,max:31,className:'form-control',value:form.telephoneInvoiceCreationDay,onChange:fc('telephoneInvoiceCreationDay'),placeholder:'e.g. 11'}))
          ),
          form.telephoneInvoiceCreationDay&&form.dueDay&&React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:10}},
            'Invoice generated on the '+form.telephoneInvoiceCreationDay+' of the month, payment due by the '+form.dueDay+'.'),
          React.createElement('div',{className:'form-group',style:{marginBottom:0}},
            React.createElement('label',null,'Telephone / Internet Invoice'),
            form.telephoneInvoiceFile
              ?React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,fontSize:12,color:'var(--green)'}},
                  '📎 '+form.telephoneInvoiceFile,
                  React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>{if(confirm('Remove the attached telephone invoice copy?'))setForm(f=>({...f,telephoneInvoiceFile:null}));}},'Remove'))
              :React.createElement('label',{className:'btn btn-ghost btn-sm',style:{cursor:'pointer',display:'inline-block'}},
                  '📎 Attach Invoice',
                  React.createElement('input',{type:'file',style:{display:'none'},accept:'.pdf,.jpg,.jpeg,.png',onChange:e=>{const f2=e.target.files[0];if(f2)setForm(f=>({...f,telephoneInvoiceFile:f2.name}));}})
                )
          )
        ),

        // ── Marketing Expenses — what kind of marketing this spend actually is (digital ads,
        // print, influencer collab, event sponsorship, etc.), since "Marketing Expenses" alone
        // doesn't say much for later analysis or a Tally narration. Next Increment Date/Amount is
        // a simple one-time step-up (a flat new amount from that date), not the compounding %
        // schedule Rent uses — marketing spend typically gets renegotiated to a new flat budget,
        // not escalated by a fixed percentage. ──
        form.expenseName==='Marketing Expenses'&&React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:14}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:10}},'Marketing Details'),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Nature of Marketing'),
            React.createElement('input',{className:'form-control',value:form.marketingNature,onChange:fc('marketingNature'),placeholder:'e.g. Digital Ads, Print, Influencer Collab, Event Sponsorship'})),
          React.createElement('div',{className:'form-row cols2',style:{marginTop:10,marginBottom:0}},
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Next Increment Date'),
              React.createElement('input',{type:'date',className:'form-control',value:form.marketingNextIncrementDate,onChange:fc('marketingNextIncrementDate')})),
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Amount (₹) after Increment'),
              React.createElement('input',{type:'number',className:'form-control',value:form.marketingNextAmount,onChange:fc('marketingNextAmount'),placeholder:'e.g. 45000'}))
          ),
          form.marketingNextIncrementDate&&Number(form.marketingNextAmount)>0&&React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:8}},
            'From '+form.marketingNextIncrementDate+' onward, the Taxable Amount used in the P&L becomes ₹'+Number(form.marketingNextAmount).toLocaleString('en-IN')+' instead of the ₹'+(Number(form.amount)||0).toLocaleString('en-IN')+' above.')
        ),

        // ── Drycleaning Expenses — same simple flat step-up as Marketing (contract rates get
        // renegotiated to a new flat amount, not escalated by a fixed %), plus somewhere to keep
        // the agreement or a sample invoice on file. ──
        form.expenseName==='Drycleaning Expenses'&&React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:14}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:10}},'Drycleaning Details'),
          React.createElement('div',{className:'form-row cols2'},
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Next Increment Date'),
              React.createElement('input',{type:'date',className:'form-control',value:form.drycleaningNextIncrementDate,onChange:fc('drycleaningNextIncrementDate')})),
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Amount (₹) after Increment'),
              React.createElement('input',{type:'number',className:'form-control',value:form.drycleaningNextAmount,onChange:fc('drycleaningNextAmount'),placeholder:'e.g. 8000'}))
          ),
          form.drycleaningNextIncrementDate&&Number(form.drycleaningNextAmount)>0&&React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:10}},
            'From '+form.drycleaningNextIncrementDate+' onward, the Taxable Amount used in the P&L becomes ₹'+Number(form.drycleaningNextAmount).toLocaleString('en-IN')+' instead of the ₹'+(Number(form.amount)||0).toLocaleString('en-IN')+' above.'),
          React.createElement('div',{className:'form-group',style:{marginBottom:0}},
            React.createElement('label',null,'Agreement / Invoice Copy'),
            form.drycleaningDocFile
              ?React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,fontSize:12,color:'var(--green)'}},
                  '📎 '+form.drycleaningDocFile,
                  React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>{if(confirm('Remove the attached document?'))setForm(f=>({...f,drycleaningDocFile:null}));}},'Remove'))
              :React.createElement('label',{className:'btn btn-ghost btn-sm',style:{cursor:'pointer',display:'inline-block'}},
                  '📎 Attach Agreement / Invoice',
                  React.createElement('input',{type:'file',style:{display:'none'},accept:'.pdf,.doc,.docx,.jpg,.jpeg,.png',onChange:e=>{const f2=e.target.files[0];if(f2)setForm(f=>({...f,drycleaningDocFile:f2.name}));}})
                )
          )
        ),

        // ── Professional Fee — same simple flat step-up as Drycleaning/Marketing (fee revisions
        // are usually a new negotiated flat amount, not a fixed % escalation), plus somewhere to
        // keep the engagement letter/agreement or a sample invoice on file. ──
        form.expenseName==='Professional Fee'&&React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:14}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:10}},'Professional Fee Details'),
          React.createElement('div',{className:'form-row cols2'},
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Next Increment Date'),
              React.createElement('input',{type:'date',className:'form-control',value:form.profFeeNextIncrementDate,onChange:fc('profFeeNextIncrementDate')})),
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Amount (₹) after Increment'),
              React.createElement('input',{type:'number',className:'form-control',value:form.profFeeNextAmount,onChange:fc('profFeeNextAmount'),placeholder:'e.g. 25000'}))
          ),
          form.profFeeNextIncrementDate&&Number(form.profFeeNextAmount)>0&&React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:10}},
            'From '+form.profFeeNextIncrementDate+' onward, the Taxable Amount used in the P&L becomes ₹'+Number(form.profFeeNextAmount).toLocaleString('en-IN')+' instead of the ₹'+(Number(form.amount)||0).toLocaleString('en-IN')+' above.'),
          React.createElement('div',{className:'form-group',style:{marginBottom:0}},
            React.createElement('label',null,'Agreement / Invoice Copy'),
            form.profFeeDocFile
              ?React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,fontSize:12,color:'var(--green)'}},
                  '📎 '+form.profFeeDocFile,
                  React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>{if(confirm('Remove the attached document?'))setForm(f=>({...f,profFeeDocFile:null}));}},'Remove'))
              :React.createElement('label',{className:'btn btn-ghost btn-sm',style:{cursor:'pointer',display:'inline-block'}},
                  '📎 Attach Agreement / Invoice',
                  React.createElement('input',{type:'file',style:{display:'none'},accept:'.pdf,.doc,.docx,.jpg,.jpeg,.png',onChange:e=>{const f2=e.target.files[0];if(f2)setForm(f=>({...f,profFeeDocFile:f2.name}));}})
                )
          )
        ),

        // ── Software Subscription — just needs to know when it renews next, so it doesn't
        // silently auto-continue past a plan that was meant to be reviewed or cancelled. ──
        form.expenseName==='Software Subscription'&&React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:14}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:10}},'Software Subscription Details'),
          React.createElement('div',{className:'form-group',style:{marginBottom:0}},React.createElement('label',null,'Next Renewal Date'),
            React.createElement('input',{type:'date',className:'form-control',value:form.nextRenewalDate,onChange:fc('nextRenewalDate')}))
        )
        ),

        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},
            React.createElement('label',null,'Payment Mode'),
            React.createElement('select',{className:'form-control',value:form.paymentMode,onChange:fc('paymentMode')},['Bank Transfer','Cheque','Cash','UPI','Auto-Debit'].map(m=>React.createElement('option',{key:m,value:m},m)))
          ),
          React.createElement('div',{className:'form-group'},
            React.createElement('label',null,'Status'),
            React.createElement('select',{className:'form-control',value:form.status,onChange:fc('status')},['Active','Inactive','Expired'].map(s=>React.createElement('option',{key:s,value:s},s)))
          )
        ),
        React.createElement('div',{className:'form-row cols3'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-120'},'Start Date'),React.createElement('input',{id:'f-120',type:'date',className:'form-control',value:form.startDate,onChange:fc('startDate')})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-122'},'End Date (if contract expires)'),React.createElement('input',{id:'f-122',type:'date',className:'form-control',value:form.endDate,onChange:fc('endDate')})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-124'},'Recurring Exp Closing Date'),React.createElement('input',{id:'f-124',type:'date',className:'form-control',value:form.closingDate,onChange:fc('closingDate')}))
        ),
        React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-123'},'Notes'),React.createElement('textarea',{id:'f-123',className:'form-control',rows:2,value:form.notes,onChange:fc('notes'),placeholder:'Contract terms, escalation clause, contact person, etc.'})),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowModal(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:save},editId?'Save Changes':'Add Recurring Expense')
        )
      )
    ),

    billItem&&React.createElement('div',{className:'modal-overlay',onClick:()=>setBillItem(null)},
      React.createElement('div',{className:'modal',style:{width:560,maxWidth:'96vw'},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Enter bill — '+displayName(billItem)),
        React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:14,lineHeight:1.6}},billItem.payee+' · '+billItem.frequency+' · saved as this payee’s invoice in Vendor Sheet (for payment) and spread over the months it covers on the P&L.'),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Bill / Invoice No. *'),
            React.createElement('input',{className:'form-control',autoFocus:true,value:billForm.billNo,onChange:e=>setBillForm(f=>({...f,billNo:e.target.value})),placeholder:'e.g. EB-2026-0915'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Bill Date *'),
            React.createElement('input',{type:'date',className:'form-control',value:billForm.billDate,onChange:e=>{const v=e.target.value;setBillForm(f=>{const p=f.periodTouched?{}:defaultBillPeriod(billItem,v);return{...f,billDate:v,...(f.periodTouched?{}:{periodFrom:p.from,periodTo:p.to})};});}}))
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Covers from (month) *'),
            React.createElement('input',{type:'month',className:'form-control',value:billForm.periodFrom,onChange:e=>setBillForm(f=>({...f,periodFrom:e.target.value,periodTouched:true}))})),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Covers to (month) *'),
            React.createElement('input',{type:'month',className:'form-control',value:billForm.periodTo,onChange:e=>setBillForm(f=>({...f,periodTo:e.target.value,periodTouched:true}))}))
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',null,(billItem.expenseName==='Electricity Expenses'?'Bill Amount':'Taxable Amount')+' (₹) *'),
            React.createElement('input',{type:'number',className:'form-control',value:billForm.amount,onChange:e=>setBillForm(f=>({...f,amount:e.target.value})),placeholder:'0'})),
          billItem.expenseName!=='Electricity Expenses'&&React.createElement('div',{className:'form-group'},React.createElement('label',null,'GST on the bill (₹)'),
            React.createElement('input',{type:'number',className:'form-control',value:billForm.gst,onChange:e=>setBillForm(f=>({...f,gst:e.target.value})),placeholder:'0'}))
        ),
        (()=>{
          const amt=(Number(billForm.amount)||0)+(Number(billForm.gst)||0);
          const mi=monthIndexOfIso((billForm.periodFrom||'')+'-01'),mj=monthIndexOfIso((billForm.periodTo||'')+'-01');
          const months=(mi!=null&&mj!=null&&mj>=mi)?mj-mi+1:0;
          const tds=billItem.tdsApplicable?Math.round((Number(billForm.amount)||0)*(Number(billItem.tdsRate)||0)/100):0;
          return amt>0&&months>0&&React.createElement('div',{style:{fontSize:12,background:'rgba(47,95,224,0.08)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,lineHeight:1.7}},
            'P&L: ₹'+Math.round(amt/months).toLocaleString('en-IN')+' in each of '+months+' month'+(months===1?'':'s')+' ('+monthLabelOfIndex(mi)+(months>1?' – '+monthLabelOfIndex(mj):'')+')',
            tds>0&&React.createElement('div',null,'TDS payable ₹'+tds.toLocaleString('en-IN')+' · Payable to '+billItem.payee+' ₹'+(amt-tds).toLocaleString('en-IN')));
        })(),
        React.createElement('div',{className:'form-group'},
          React.createElement('label',null,'Bill copy'+(outletSettings(salonId).attachmentRequired?' * (required for this outlet)':'')),
          React.createElement('div',{style:{display:'flex',gap:10,alignItems:'center'}},
            React.createElement('input',{type:'file',accept:'image/*,.pdf',id:'re-bill-attach',style:{display:'none'},onChange:e=>{const fl=e.target.files[0];if(fl)readFileAsAttachment(fl,rec=>setBillForm(f=>({...f,attachment:rec})),err=>toast(err==='size'?'That file is too large (max 4MB).':'Couldn’t read that file.','error'));e.target.value='';}}),
            React.createElement('label',{htmlFor:'re-bill-attach',className:'btn btn-ghost btn-sm',style:{cursor:'pointer'}},'📎 '+(billForm.attachment?(billForm.attachment.name||'Attached'):'Attach bill (JPG / PDF)')),
            billForm.attachment&&React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setBillForm(f=>({...f,attachment:null}))},'✕'))),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setBillItem(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:saveBill},'Save bill'))
      )
    ),
    showDelete&&(()=>{
      const linked=vendorInvoices.find(i=>i.invoiceNo==='REC-'+showDelete.id);
      const hasPayments=linked&&linked.payments&&linked.payments.length>0;
      return React.createElement('div',{className:'modal-overlay',onClick:()=>setShowDelete(null)},
        React.createElement('div',{className:'modal',style:{width:440},onClick:e=>e.stopPropagation()},
          React.createElement('div',{className:'modal-title'},'Remove Recurring Expense'),
          React.createElement('div',{style:{fontSize:13,color:'var(--text2)',marginBottom:hasPayments?10:16}},
            'Remove "'+displayName(showDelete)+'" ('+showDelete.payee+') from the recurring expenses register?'
            +(linked?' Its linked invoice in Vendor Sheet ('+linked.invoiceNo+') will be removed too.':'')),
          hasPayments&&React.createElement('div',{style:{fontSize:12.5,color:'var(--red)',background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.3)',borderRadius:'var(--r)',padding:'10px 12px',marginBottom:16,fontWeight:600}},
            '⚠ That invoice has '+linked.payments.length+' payment'+(linked.payments.length===1?'':'s')+' recorded against it — removing it will remove that payment history too.'),
          React.createElement('div',{className:'modal-actions'},
            React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowDelete(null)},'Cancel'),
            React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(255,107,107,0.15)',border:'1px solid rgba(255,107,107,0.4)',color:'var(--red)',padding:'8px 16px',borderRadius:'var(--r)',cursor:'pointer',fontWeight:600},onClick:()=>remove(showDelete.id)},'Remove')
          )
        )
      );
    })(),

    // ── BULK DELETE CONFIRM MODAL ──
    showBulkDeleteConfirm&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowBulkDeleteConfirm(false)},
      React.createElement('div',{className:'modal',style:{width:440},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title',style:{color:'var(--red)'}},'🗑 Delete '+bulkSelectedIds.size+' Recurring Expense'+(bulkSelectedIds.size===1?'':'s')),
        React.createElement('div',{style:{fontSize:13,color:'var(--text2)',lineHeight:1.7,marginBottom:16}},
          'Delete the '+bulkSelectedIds.size+' selected recurring expense'+(bulkSelectedIds.size===1?'':'s')+'? ',
          React.createElement('span',{style:{color:'var(--red)',fontWeight:500}},'Any linked invoices in Vendor Sheet (and their payment history) will be removed too.'),
          ' You\'ll get a few seconds to Undo right after.'
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowBulkDeleteConfirm(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-danger',onClick:()=>{bulkDelete();setShowBulkDeleteConfirm(false);}},'Yes, Delete '+bulkSelectedIds.size)
        )
      )
    )
  );
}

// ── Previous Months P&L — lets a real, real-world catch: someone starting on this app mid-year
// still wants continuity/comparison against months before they started tracking live data here.
// Uses the exact same 16 Operating Expenses line names as the real computed P&L (see
// PL_OPEX_LINES) so a historical month and a live computed month are genuinely comparable
// side by side, not just two different shapes of data sitting near each other. ──
function loadPreviousPnL(salonId){
  try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_previous_pnl',salonId))||'[]');if(Array.isArray(v))return v;}catch(e){}
  return[];
}
function savePreviousPnL(list,salonId){safeLocalSet(outletKey('salonos_previous_pnl',salonId),JSON.stringify(list));}
const PP_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
function ppBlankOpex(){const o={};PL_OPEX_LINES.forEach(l=>{o[l.name]=0;});return o;}
function ppTotals(rec){
  const revenue=(Number(rec.cash)||0)+(Number(rec.card)||0)+(Number(rec.upi)||0)+(Number(rec.otherIncome)||0);
  const opexTotal=PL_OPEX_LINES.reduce((s,l)=>s+(Number(rec.opex&&rec.opex[l.name])||0),0);
  const direct=Number(rec.directCost)||0,emp=Number(rec.employeeCost)||0;
  const gross=revenue-direct;
  const ebitda=gross-emp-opexTotal;
  const pbt=ebitda-(Number(rec.depreciation)||0)-(Number(rec.interest)||0);
  return{revenue,direct,opexTotal,emp,gross,ebitda,pbt};
}
function PreviousMonthsPnLSheet({salon}={}){
  const {toast}=useToast();
  const salonId=salon?.id;
  const [records,setRecords]=useState(()=>loadPreviousPnL(salonId));
  useEffect(()=>{savePreviousPnL(records,salonId);},[records,salonId]);
  const [showModal,setShowModal]=useState(false);
  const [editId,setEditId]=useState(null);
  const [showDelete,setShowDelete]=useState(null);
  const [bulkBusy,setBulkBusy]=useState(false);
  const [bulkResult,setBulkResult]=useState(null);
  const bulkFileRef=useRef(null);
  const today=new Date();
  const BLANK={id:'',year:today.getFullYear(),month:today.getMonth(),cash:'',card:'',upi:'',otherIncome:'',directCost:'',employeeCost:'',opex:ppBlankOpex(),depreciation:'',interest:''};
  const [form,setForm]=useState(BLANK);
  const fc=(k)=>(e)=>setForm(f=>({...f,[k]:e.target.value}));
  const fcOpex=(name)=>(e)=>setForm(f=>({...f,opex:{...f.opex,[name]:e.target.value}}));

  const openAdd=()=>{setForm({...BLANK,opex:ppBlankOpex()});setEditId(null);setShowModal(true);};
  const openEdit=(r)=>{setForm({...BLANK,...r,opex:{...ppBlankOpex(),...r.opex}});setEditId(r.id);setShowModal(true);};
  const save=()=>{
    const dup=records.find(r=>r.year===Number(form.year)&&r.month===Number(form.month)&&r.id!==editId);
    if(dup){toast(PP_MONTHS[form.month]+' '+form.year+' is already recorded — edit that entry instead of adding a duplicate','error');return;}
    const rec={...form,id:editId||Date.now(),year:Number(form.year),month:Number(form.month)};
    if(editId)setRecords(prev=>prev.map(r=>r.id===editId?rec:r));
    else setRecords(prev=>[...prev,rec]);
    toast((editId?'Updated ':'Added ')+PP_MONTHS[rec.month]+' '+rec.year,'success');
    setShowModal(false);
  };
  const confirmDelete=(id)=>{setRecords(prev=>prev.filter(r=>r.id!==id));setShowDelete(null);toast('Removed','warning');};

  const sorted=[...records].sort((a,b)=>b.year-a.year||b.month-a.month);

  // ── Excel template + bulk import ──
  const TEMPLATE_HEADERS=['Year','Month (1-12)','Cash Sale','Card Sale','UPI Sale','Other Income','Direct Cost of Service','Employee Cost',
    ...PL_OPEX_LINES.map(l=>l.name),'Depreciation','Interest'];
  const downloadTemplate=async()=>{
    await loadScript(CDN_XLSX_URL);
    if(!window.XLSX){toast('Excel engine unavailable — check your internet connection.','error');return;}
    const sampleOpex=PL_OPEX_LINES.map(()=>0);
    const sample=[2025,4,145000,178000,89000,0,12000,150000,...sampleOpex,15000,5000];
    const note=['Required, e.g. 2025','Required, 1=Jan...12=Dec','','','','','','',
      ...PL_OPEX_LINES.map(()=>'0 if none'),'0 if none','0 if none'];
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS,sample,[],note]);
    ws['!cols']=TEMPLATE_HEADERS.map(()=>({wch:20}));
    XLSX.utils.book_append_sheet(wb,ws,'Previous Months PL');
    XLSX.writeFile(wb,'Previous_Months_PL_Template.xlsx');
    toast('Template downloaded','success');
  };
  const handleBulkFile=async(e)=>{
    const f=e.target.files&&e.target.files[0];
    if(!f)return;
    e.target.value='';
    setBulkBusy(true);
    try{
      await loadScript(CDN_XLSX_URL);
      if(!window.XLSX)throw new Error('Excel engine unavailable — check your internet connection.');
      const buf=await f.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const json=XLSX.utils.sheet_to_json(ws,{defval:''});
      const failed=[];
      let working=[...records];
      let added=0,updated=0;
      json.forEach((row,idx)=>{
        const rowNum=idx+2;
        const year=Number(row['Year']);
        const monthNum=Number(row['Month (1-12)']);
        if(!year||!monthNum){if(row['Year']||row['Month (1-12)'])failed.push('Row '+rowNum+': Year and Month are both required');return;}
        if(monthNum<1||monthNum>12){failed.push('Row '+rowNum+': Month must be 1-12');return;}
        const month=monthNum-1;
        const opex={};PL_OPEX_LINES.forEach(l=>{opex[l.name]=Number(row[l.name])||0;});
        const rec={year,month,cash:Number(row['Cash Sale'])||0,card:Number(row['Card Sale'])||0,upi:Number(row['UPI Sale'])||0,
          otherIncome:Number(row['Other Income'])||0,directCost:Number(row['Direct Cost of Service'])||0,
          employeeCost:Number(row['Employee Cost'])||0,opex,depreciation:Number(row['Depreciation'])||0,interest:Number(row['Interest'])||0};
        const existingIdx=working.findIndex(r=>r.year===year&&r.month===month);
        if(existingIdx>=0){working[existingIdx]={...rec,id:working[existingIdx].id};updated++;}
        else{working=[...working,{...rec,id:Date.now()+idx}];added++;}
      });
      setRecords(working);
      setBulkResult({added,updated,failed,totalRows:json.length});
      if((added||updated)&&!failed.length)toast((added?added+' added':'')+(added&&updated?', ':'')+(updated?updated+' updated':''),'success');
    }catch(err){toast(err.message||'Could not read that file — make sure it matches the template','error');}
    setBulkBusy(false);
  };

  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},fixAmp('Previous Months P&L')),
        React.createElement('div',{className:'page-sub'},'Enter historical months from before you started tracking live here — same Operating Expenses breakdown as the real P&L, so they\'re genuinely comparable')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:downloadTemplate},'⬇ Download Template'),
        React.createElement('input',{ref:bulkFileRef,type:'file',accept:'.xlsx,.xls',style:{display:'none'},onChange:handleBulkFile}),
        React.createElement('button',{className:'btn btn-ghost btn-sm',disabled:bulkBusy,onClick:()=>bulkFileRef.current&&bulkFileRef.current.click()},bulkBusy?'Importing…':'📥 Bulk Import'),
        React.createElement('button',{className:'btn btn-primary',onClick:openAdd},'+ Add Month')
      )
    ),
    records.length===0&&React.createElement('div',{className:'card',style:{textAlign:'center',padding:'40px 20px'}},
      React.createElement('div',{style:{fontSize:32,marginBottom:10}},'🗂️'),
      React.createElement('div',{style:{fontWeight:700,color:'var(--text)',marginBottom:6,fontSize:14}},'No previous months recorded yet'),
      React.createElement('div',{style:{fontSize:12.5,color:'var(--text3)'}},'Add one month at a time, or download the template and bulk-import several years at once.')
    ),
    records.length>0&&React.createElement('div',{className:'card'},
      React.createElement('div',{className:'table-wrap'},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,
            ['Month','Total Revenue','Direct Cost','Employee Cost','Operating Exp.','Gross Profit','EBITDA','PBT','Actions'].map(h=>React.createElement('th',{key:h},h))
          )),
          React.createElement('tbody',null,sorted.map(r=>{
            const t=ppTotals(r);
            return React.createElement('tr',{key:r.id},
              React.createElement('td',null,React.createElement('b',null,PP_MONTHS[r.month]+' '+r.year)),
              React.createElement('td',null,'₹'+t.revenue.toLocaleString()),
              React.createElement('td',null,'₹'+t.direct.toLocaleString()),
              React.createElement('td',null,'₹'+t.emp.toLocaleString()),
              React.createElement('td',null,'₹'+t.opexTotal.toLocaleString()),
              React.createElement('td',null,'₹'+t.gross.toLocaleString()),
              React.createElement('td',{style:{color:t.ebitda<0?'var(--red)':'var(--green)',fontWeight:600}},'₹'+t.ebitda.toLocaleString()),
              React.createElement('td',{style:{color:t.pbt<0?'var(--red)':'var(--green)',fontWeight:600}},'₹'+t.pbt.toLocaleString()),
              React.createElement('td',null,React.createElement('div',{style:{display:'flex',gap:6}},
                React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>openEdit(r)},'Edit'),
                React.createElement('button',{'aria-label':'Delete',className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>setShowDelete(r)},React.createElement(IconTrash,{size:14}))
              ))
            );
          }))
        )
      )
    ),

    showModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowModal(false)},
      React.createElement('div',{className:'modal',style:{width:640,maxHeight:'85vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},editId?'Edit Previous Month':'Add Previous Month'),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Month'),
            React.createElement('select',{className:'form-control',value:form.month,onChange:fc('month')},PP_MONTHS.map((m,i)=>React.createElement('option',{key:i,value:i},m)))),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Year'),
            React.createElement('input',{type:'number',className:'form-control',value:form.year,onChange:fc('year')}))
        ),
        React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'14px 0 8px'}},'Revenue'),
        React.createElement('div',{className:'form-row cols3'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-124'},'Cash Sale'),React.createElement('input',{id:'f-124',type:'number',className:'form-control',value:form.cash,onChange:fc('cash'),placeholder:'0'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-125'},'Card Sale'),React.createElement('input',{id:'f-125',type:'number',className:'form-control',value:form.card,onChange:fc('card'),placeholder:'0'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-126'},'UPI Sale'),React.createElement('input',{id:'f-126',type:'number',className:'form-control',value:form.upi,onChange:fc('upi'),placeholder:'0'}))
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-127'},'Other Income'),React.createElement('input',{id:'f-127',type:'number',className:'form-control',value:form.otherIncome,onChange:fc('otherIncome'),placeholder:'0'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-128'},'Direct Cost of Service'),React.createElement('input',{id:'f-128',type:'number',className:'form-control',value:form.directCost,onChange:fc('directCost'),placeholder:'0'}))
        ),
        React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'14px 0 8px'}},'Employee Cost'),
        React.createElement('div',{className:'form-group'},React.createElement('input',{type:'number',className:'form-control',value:form.employeeCost,onChange:fc('employeeCost'),placeholder:'0'})),
        React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'14px 0 8px'}},'Operating Expenses — same lines as the real P&L'),
        React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 12px',marginBottom:14}},
          PL_OPEX_LINES.map(l=>React.createElement('div',{key:l.name,className:'form-group',style:{marginBottom:0}},
            React.createElement('label',{style:{fontSize:10.5}},l.name),
            React.createElement('input',{type:'number',className:'form-control',value:form.opex[l.name],onChange:fcOpex(l.name),placeholder:'0',style:{padding:'6px 10px',fontSize:12}})
          ))
        ),
        React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'14px 0 8px'}},'Below EBITDA'),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-129'},'Depreciation'),React.createElement('input',{id:'f-129',type:'number',className:'form-control',value:form.depreciation,onChange:fc('depreciation'),placeholder:'0'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-130'},'Interest'),React.createElement('input',{id:'f-130',type:'number',className:'form-control',value:form.interest,onChange:fc('interest'),placeholder:'0'}))
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowModal(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:save},editId?'Save Changes':'Add Month')
        )
      )
    ),

    showDelete&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowDelete(null)},
      React.createElement('div',{className:'modal',style:{width:420},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Remove Month'),
        React.createElement('div',{style:{fontSize:13,color:'var(--text2)',marginBottom:16}},'Remove '+PP_MONTHS[showDelete.month]+' '+showDelete.year+'? This cannot be undone.'),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowDelete(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-danger',onClick:()=>confirmDelete(showDelete.id)},'Remove')
        )
      )
    ),

    bulkResult&&React.createElement('div',{className:'modal-overlay',onClick:()=>setBulkResult(null)},
      React.createElement('div',{className:'modal',style:{width:520,maxHeight:'80vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Bulk Import Results'),
        React.createElement('div',{style:{display:'flex',gap:10,marginBottom:16}},
          React.createElement('div',{className:'metric-card green',style:{flex:1}},React.createElement('div',{className:'metric-label'},'Added'),React.createElement('div',{className:'metric-value'},bulkResult.added)),
          React.createElement('div',{className:'metric-card blue',style:{flex:1}},React.createElement('div',{className:'metric-label'},'Updated'),React.createElement('div',{className:'metric-value'},bulkResult.updated)),
          React.createElement('div',{className:'metric-card '+(bulkResult.failed.length?'red':'blue'),style:{flex:1}},React.createElement('div',{className:'metric-label'},'Skipped'),React.createElement('div',{className:'metric-value'},bulkResult.failed.length))
        ),
        bulkResult.failed.length>0&&React.createElement('div',{style:{maxHeight:220,overflowY:'auto'}},
          bulkResult.failed.map((msg,i)=>React.createElement('div',{key:i,style:{fontSize:12,color:'var(--text2)',padding:'6px 10px',background:'rgba(255,107,107,0.08)',borderRadius:6,marginBottom:4}},msg))
        ),
        React.createElement('div',{className:'modal-actions'},React.createElement('button',{className:'btn btn-primary',onClick:()=>setBulkResult(null)},'Close'))
      )
    )
  );
}

function PnLSheet(){
  const MONTHS=['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
  // Was hardcoded to '2025-26' — defaults to whatever FY today actually falls in (same
  // pgCurrent() the Period Gate uses), so this doesn't quietly go stale again every April.
  const [selFY,setSelFY]=useState(()=>pgCurrent().fy);
  const FYS=['2023-24','2024-25','2025-26','2026-27'];
  const ACTIVE_SALONS=salonsForCurrentUser().filter(s=>s.status==='Active');
  const [selOutletId,setSelOutletId]=useState((ACTIVE_SALONS[0]||{}).id||1);
  const sid=Number(selOutletId)||1;

  // Real monthly figures — one call to the same plBuild() that powers the real Monthly P&L, for
  // each of the 12 months in the selected FY, so this Annual Statement can never disagree with
  // what Monthly P&L shows for any given month.
  const monthlyData=MONTHS.map((_,mi)=>plBuild(sid,selFY,mi));
  const mkRow=(label,vals)=>({label,vals:vals.map(v=>Math.round(v))});
  const REVENUE=[
    mkRow('Revenue from Operations - Cash Sale',monthlyData.map(d=>d.sections[0].lines[0].amt)),
    mkRow('Revenue from Operations - Card Sale',monthlyData.map(d=>d.sections[0].lines[1].amt)),
    mkRow('Revenue from Operations - UPI Sale',monthlyData.map(d=>d.sections[0].lines[2].amt)),
    mkRow('Other Income',monthlyData.map(d=>d.sections[0].lines[3].amt)),
  ];
  const EXPENSES_ROWS=[
    mkRow('Direct Cost of Service',monthlyData.map(d=>d.direct)),
    mkRow('Employee Cost',monthlyData.map(d=>d.sections[2].tot)),
    mkRow('Operating Expenses',monthlyData.map(d=>d.sections[3].tot)),
    mkRow('Depreciation & Interest',monthlyData.map(d=>d.belowTot)),
  ];

  const totalRev=(mi)=>REVENUE.reduce((s,r)=>s+r.vals[mi],0);
  const totalExp=(mi)=>EXPENSES_ROWS.reduce((s,r)=>s+r.vals[mi],0);
  const grossProfit=(mi)=>totalRev(mi)-totalExp(mi);
  const gpm=(mi)=>totalRev(mi)>0?((grossProfit(mi)/totalRev(mi))*100).toFixed(1):0;

  const fmtC=(n)=>n===0?'—':'₹'+Math.round(n).toLocaleString();
  const th=(t,right)=>React.createElement('th',{style:{padding:'8px 10px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em',textAlign:right?'right':'left',whiteSpace:'nowrap',borderBottom:'2px solid var(--accent)',minWidth:right?80:160}},t);
  const td=(v,color,bold,bg)=>React.createElement('td',{style:{padding:'7px 10px',fontSize:12,textAlign:'right',color:color||'var(--text2)',fontWeight:bold?600:400,borderBottom:'1px solid var(--border)',background:bg||'transparent',whiteSpace:'nowrap'}},v);

  const annual=(row)=>row.vals.reduce((s,v)=>s+v,0);
  const totalRevAnnual=REVENUE.reduce((s,r)=>s+annual(r),0);
  const totalExpAnnual=EXPENSES_ROWS.reduce((s,r)=>s+annual(r),0);
  const gpa=totalRevAnnual-totalExpAnnual;
  const selOutletName=(SALONS.find(s=>String(s.id)===String(selOutletId))||{}).name;
  const annualReportTitle='Profit & Loss Statement — '+(selOutletName?selOutletName.split('—')[0].trim():'Outlet')+' — FY '+selFY;
  const annualReportBodyHtml=()=>{
    const rowHtml=(label,rows,bold)=>rows.map(r=>'<tr><td'+(bold?' style="font-weight:700"':'')+'>'+r.label+'</td>'+MONTHS.map((_,mi)=>'<td class="num">'+fmtC(r.vals[mi])+'</td>').join('')+'<td class="num"><b>'+fmtC(annual(r))+'</b></td></tr>').join('');
    return '<table><thead><tr><th>Particulars</th>'+MONTHS.map(m=>'<th class="num">'+m+'</th>').join('')+'<th class="num">Annual</th></tr></thead><tbody>'
      +'<tr><td class="section" colspan="'+(MONTHS.length+2)+'">A. Revenue</td></tr>'+rowHtml('Revenue',REVENUE)
      +'<tr><td><b>Total Revenue</b></td>'+MONTHS.map((_,mi)=>'<td class="num"><b>'+fmtC(totalRev(mi))+'</b></td>').join('')+'<td class="num"><b>'+fmtC(totalRevAnnual)+'</b></td></tr>'
      +'<tr><td class="section" colspan="'+(MONTHS.length+2)+'">B. Expenses</td></tr>'+rowHtml('Expenses',EXPENSES_ROWS)
      +'<tr><td><b>Total Expenses</b></td>'+MONTHS.map((_,mi)=>'<td class="num"><b>'+fmtC(totalExp(mi))+'</b></td>').join('')+'<td class="num"><b>'+fmtC(totalExpAnnual)+'</b></td></tr>'
      +'<tr><td><b>Net Profit</b></td>'+MONTHS.map((_,mi)=>'<td class="num"><b>'+fmtC(grossProfit(mi))+'</b></td>').join('')+'<td class="num"><b>'+fmtC(gpa)+'</b></td></tr>'
      +'</tbody></table>';
  };
  const annualReportSheetRows=()=>{
    const out=[['Particulars',...MONTHS,'Annual']];
    out.push(['A. Revenue']);
    REVENUE.forEach(r=>out.push([r.label,...r.vals,annual(r)]));
    out.push(['Total Revenue',...MONTHS.map((_,mi)=>totalRev(mi)),totalRevAnnual]);
    out.push(['B. Expenses']);
    EXPENSES_ROWS.forEach(r=>out.push([r.label,...r.vals,annual(r)]));
    out.push(['Total Expenses',...MONTHS.map((_,mi)=>totalExp(mi)),totalExpAnnual]);
    out.push(['Net Profit',...MONTHS.map((_,mi)=>grossProfit(mi)),gpa]);
    return out;
  };

  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},fixAmp('Profit & Loss Statement')),
        React.createElement('div',{className:'page-sub'},'Real figures, aggregated from each month\'s P&L — FY '+selFY)
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selOutletId,onChange:e=>setSelOutletId(e.target.value)},ACTIVE_SALONS.map(s=>React.createElement('option',{key:s.id,value:s.id},s.name.split('—')[0].trim()))),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selFY,onChange:e=>setSelFY(e.target.value)},FYS.map(f=>React.createElement('option',{key:f},f))),
        React.createElement(ShareReportButton,{title:annualReportTitle,subtitle:'Annual',getBodyHtml:annualReportBodyHtml,getSheetRows:annualReportSheetRows})
      )
    ),
    // Annual summary cards
    React.createElement('div',{className:'grid4',style:{marginBottom:16}},
      [{label:'Annual Revenue',val:'₹'+totalRevAnnual.toLocaleString(),color:'blue'},
       {label:'Annual Expenses',val:'₹'+totalExpAnnual.toLocaleString(),color:'red'},
       {label:'Annual Net Profit',val:'₹'+gpa.toLocaleString(),color:gpa>0?'green':'red'},
       {label:'Avg Net Margin',val:totalRevAnnual>0?((gpa/totalRevAnnual)*100).toFixed(1)+'%':'—',color:'amber'}
      ].map(m=>React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},
        React.createElement('div',{className:'metric-label'},m.label),
        React.createElement('div',{className:'metric-value'},m.val)
      ))
    ),
    React.createElement('div',{className:'card',style:{padding:0}},
      React.createElement('div',{style:{overflowX:'auto'}},
        React.createElement('table',{style:{borderCollapse:'collapse',width:'100%'}},
          React.createElement('thead',null,React.createElement('tr',null,
            th('Particulars'),
            ...MONTHS.map(m=>th(m,true)),
            th('Annual',true)
          )),
          React.createElement('tbody',null,
            // Revenue section header
            React.createElement('tr',null,React.createElement('td',{colSpan:14,style:{padding:'10px 12px',background:'rgba(74,158,255,0.1)',fontSize:11,fontWeight:700,color:'var(--blue)',textTransform:'uppercase',letterSpacing:'0.08em',borderBottom:'1px solid var(--border)'}},'A. Revenue')),
            ...REVENUE.map((r,ri)=>React.createElement('tr',{key:ri},
              React.createElement('td',{style:{padding:'7px 12px',fontSize:12,color:'var(--text2)',borderBottom:'1px solid var(--border)',paddingLeft:20}},r.label),
              ...r.vals.map((v,mi)=>td(fmtC(v))),
              td(fmtC(annual(r)),'var(--text)',true)
            )),
            React.createElement('tr',{style:{background:'rgba(74,158,255,0.08)'}},
              React.createElement('td',{style:{padding:'8px 12px',fontSize:12,fontWeight:700,color:'var(--blue)',borderBottom:'2px solid var(--border2)'}},'Total Revenue'),
              ...MONTHS.map((_,mi)=>td(fmtC(totalRev(mi)),'var(--blue)',true,'rgba(74,158,255,0.05)')),
              td(fmtC(totalRevAnnual),'var(--blue)',true,'rgba(74,158,255,0.08)')
            ),
            // Expense section header
            React.createElement('tr',null,React.createElement('td',{colSpan:14,style:{padding:'10px 12px',background:'rgba(255,107,107,0.1)',fontSize:11,fontWeight:700,color:'var(--red)',textTransform:'uppercase',letterSpacing:'0.08em',borderBottom:'1px solid var(--border)'}},'B. Expenses')),
            ...EXPENSES_ROWS.map((r,ri)=>React.createElement('tr',{key:ri},
              React.createElement('td',{style:{padding:'7px 12px',fontSize:12,color:'var(--text2)',borderBottom:'1px solid var(--border)',paddingLeft:20}},r.label),
              ...r.vals.map((v,mi)=>td(fmtC(v))),
              td(fmtC(annual(r)),'var(--text)',true)
            )),
            React.createElement('tr',{style:{background:'rgba(255,107,107,0.06)'}},
              React.createElement('td',{style:{padding:'8px 12px',fontSize:12,fontWeight:700,color:'var(--red)',borderBottom:'2px solid var(--border2)'}},'Total Expenses'),
              ...MONTHS.map((_,mi)=>td(fmtC(totalExp(mi)),'var(--red)',true,'rgba(255,107,107,0.04)')),
              td(fmtC(totalExpAnnual),'var(--red)',true,'rgba(255,107,107,0.06)')
            ),
            // Net Profit row
            React.createElement('tr',{style:{background:'rgba(76,175,125,0.08)'}},
              React.createElement('td',{style:{padding:'10px 12px',fontSize:13,fontWeight:700,color:'var(--accent2)',borderBottom:'2px solid var(--accent)'}},'C. Net Profit (A - B)'),
              ...MONTHS.map((_,mi)=>{const gp=grossProfit(mi);return td(fmtC(gp),gp>=0?'var(--green)':'var(--red)',true,'rgba(76,175,125,0.04)');}),
              td(fmtC(gpa),gpa>=0?'var(--green)':'var(--red)',true,'rgba(76,175,125,0.08)')
            ),
            // Net margin row
            React.createElement('tr',null,
              React.createElement('td',{style:{padding:'7px 12px',fontSize:12,color:'var(--text3)',borderBottom:'1px solid var(--border)'}},'Net Margin %'),
              ...MONTHS.map((_,mi)=>React.createElement('td',{style:{padding:'7px 10px',fontSize:11,textAlign:'right',color:'var(--text3)',borderBottom:'1px solid var(--border)'}},gpm(mi)+'%')),
              React.createElement('td',{style:{padding:'7px 10px',fontSize:11,textAlign:'right',color:'var(--text3)',borderBottom:'1px solid var(--border)'}},totalRevAnnual>0?((gpa/totalRevAnnual)*100).toFixed(1)+'%':'—')
            )
          )
        )
      )
    )
  );
}

function StaffReportSheet({period,salon}={}){
  const salonId=salon?.id;
  const [subTab,setSubTab]=useState('report');
  const [attachments,setAttachments]=useState([]);
  const addAttachments=(files)=>{
    const items=Array.from(files).map(f=>({name:f.name,size:f.size,type:f.type||'file',date:new Date().toISOString().slice(0,10)}));
    setAttachments(prev=>[...prev,...items]);
  };
  const TEMPLATE_COLS=['EmpId','Emp_Name','Employee Designation','Salary','Target','ServiceSale','MemberShipSale','ProductSale','PackageSale','ComplementarySale','TotalSale','Invoice Count','Service Count','ComplementaryService Count','Total Customer','Membership Customer','Walk-in Customer','API (by invoice)','APC (by customer)','Target achieved','Target achieved in (%)','Existing Customer','New Customer'];
  const periodMonthKey=(p)=>{const cal=periodToCalendar(p);return cal?(cal.year+'-'+String(cal.month+1).padStart(2,'0')):new Date().toISOString().slice(0,7);};
  const staffReportMonthKey=()=>outletKey('salonos_staff_report_selected_month',salonId);
  const loadSavedSelMonth=()=>{try{return cachedLocalGet(staffReportMonthKey())||'';}catch(e){return'';}};
  const saveSelMonth=(m)=>{safeLocalSet(staffReportMonthKey(),m);};
  // Prefer whatever month the user last actually looked at (persisted), so navigating away to
  // another page/tab and back doesn't silently jump the picker back to the global working
  // period and make an already-uploaded report look like it disappeared. Only falls back to the
  // global period's month if nothing's been picked here before.
  const [selMonth,setSelMonthState]=useState(()=>loadSavedSelMonth()||periodMonthKey(period));
  const setSelMonth=(m)=>{setSelMonthState(m);saveSelMonth(m);};
  const periodSyncedOnce=useRef(false);
  useEffect(()=>{
    // Skip the very first run (mount) — the lazy initializer above already picked the right
    // starting month (persisted choice takes priority over the global period). Only react to
    // the global period genuinely changing while this screen is already mounted.
    if(!periodSyncedOnce.current){periodSyncedOnce.current=true;return;}
    setSelMonth(periodMonthKey(period));
    // eslint-disable-next-line
  },[period&&period.fy,period&&period.mi]);
  const reportsKey=()=>outletKey('salonos_staff_work_reports',salonId);
  const loadAllReports=()=>{try{const v=JSON.parse(cachedLocalGet(reportsKey())||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}};
  const saveAllReports=(map)=>{safeLocalSet(reportsKey(),JSON.stringify(map));};
  const [reports,setReportsState]=useState(()=>loadAllReports()[selMonth]||[]);
  const setReports=(updater)=>{
    setReportsState(prev=>{
      const next=typeof updater==='function'?updater(prev):updater;
      const all=loadAllReports();
      all[selMonth]=next;
      saveAllReports(all);
      return next;
    });
  };
  // Switching the selected month should load THAT month's saved records, not keep showing
  // whichever month was loaded last.
  useEffect(()=>{setReportsState(loadAllReports()[selMonth]||[]);},[selMonth,salonId]);
  const [rawCSV,setRawCSV]=useState('');
  const [parseMsg,setParseMsg]=useState('');
  const [selected,setSelected]=useState(()=>new Set()); // indices into `reports`
  const toggleSelect=(idx)=>setSelected(prev=>{const n=new Set(prev);n.has(idx)?n.delete(idx):n.add(idx);return n;});
  const deleteSelected=()=>{
    if(!selected.size)return;
    if(confirm('Delete '+selected.size+' selected staff record'+(selected.size===1?'':'s')+'?')){
      setReports(prev=>prev.filter((_,i)=>!selected.has(i)));
      setSelected(new Set());
    }
  };

  // ── Manual entry — an alternative to the CSV/Excel upload above: add or edit one staff's row
  // by hand, same TEMPLATE_COLS shape, straight into the same `reports` list. editIdx is the
  // index being edited, or null when the modal is adding a brand-new row.
  const MANUAL_BLANK=TEMPLATE_COLS.reduce((o,c)=>{o[c]='';return o;},{});
  const [showManualModal,setShowManualModal]=useState(false);
  const [manualForm,setManualForm]=useState(MANUAL_BLANK);
  const [editIdx,setEditIdx]=useState(null);
  const manualMonthCal=periodToCalendar(period)||{year:new Date().getFullYear(),month:new Date().getMonth()};
  const manualEmployees=getEmployeesForMonth(manualMonthCal.year,manualMonthCal.month,salonId);
  const openAddManual=()=>{setManualForm(MANUAL_BLANK);setEditIdx(null);setShowManualModal(true);};
  const openEditManual=(idx)=>{setManualForm({...MANUAL_BLANK,...reports[idx]});setEditIdx(idx);setShowManualModal(true);};
  const setManualField=(field,value)=>setManualForm(prev=>({...prev,[field]:value}));
  const applyManualEmployee=(empId)=>{
    const emp=manualEmployees.find(e=>String(e.billingId||'').trim()===empId);
    if(!emp)return;
    setManualForm(prev=>({...prev,EmpId:emp.billingId||'',Emp_Name:emp.name||'',
      'Employee Designation':emp.desig||'',Salary:emp.gross||''}));
  };
  // Fills TotalSale, Target achieved (×times, floored) and Target achieved in (%) (the raw
  // ratio, matching how the imported CSV template itself expresses it — e.g. 1.22, not "122%")
  // from whatever's currently in the sale/target fields — doesn't stop the user overwriting any
  // of the three afterwards by hand.
  const recalcManualTotals=()=>{
    const num=(f)=>Number(manualForm[f])||0;
    const total=num('ServiceSale')+num('MemberShipSale')+num('ProductSale')+num('PackageSale')+num('ComplementarySale');
    const target=num('Target');
    const ratio=target?total/target:0;
    setManualForm(prev=>({...prev,TotalSale:total,'Target achieved':Math.floor(ratio),'Target achieved in (%)':target?Number(ratio.toFixed(2)):0}));
  };
  const saveManualRow=()=>{
    if(!String(manualForm.EmpId||'').trim()&&!String(manualForm.Emp_Name||'').trim()){
      setParseMsg('Enter at least an Emp Id or Employee Name before saving.');
      return;
    }
    const row={...manualForm};
    setReports(prev=>editIdx!=null?prev.map((r,i)=>i===editIdx?row:r):[...prev,row]);
    setShowManualModal(false);
    setParseMsg((editIdx!=null?'Updated':'Added')+' staff record for '+(row.Emp_Name||row.EmpId)+'.');
  };

  const downloadTemplate=()=>{
    const csv=[TEMPLATE_COLS,['E001','Meera Joshi','Senior Stylist',30000,120000,138500,0,8500,0,0,147000,45,38,7,52,8,44,3267,2827,1,1.22,30,22]].map(r=>r.map(c=>'"'+c+'"').join(',')).join('\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='StaffWorkReport_Template.csv';a.click();URL.revokeObjectURL(url);
  };

  const parseCSVText=(text)=>{
    const lines=(text||'').trim().split(/\r?\n/).filter(l=>l.trim());
    if(lines.length<2){setParseMsg('No data rows found.');return 0;}
    const hdr=lines[0].split(',').map(h=>h.replace(/"/g,'').trim());
    const parsed=lines.slice(1).map(line=>{
      const v=line.split(',').map(c=>c.replace(/"/g,'').trim());
      const obj={};hdr.forEach((h,i)=>obj[h]=v[i]||'');
      return obj;
    }).filter(r=>r['EmpId']||r['Emp_Name']);
    setReports(parsed);setSelected(new Set());
    return parsed.length;
  };
  const loadCSV=()=>{
    const n=parseCSVText(rawCSV);
    setParseMsg('Loaded '+n+' staff records.');
  };

  // ---- Download from Cradlee + Auto-Import from a watched Downloads folder (same pattern as Collection Reco) ----
  const fsSupported=typeof window!=='undefined'&&typeof window.showDirectoryPicker==='function';
  const [dirHandle,setDirHandle]=useState(null);
  const [dirNeedsPermission,setDirNeedsPermission]=useState(false);
  const [autoStatus,setAutoStatus]=useState('');
  const [autoBusy,setAutoBusy]=useState(false);
  const lastAutoRef=useRef(typeof localStorage!=='undefined'?(cachedLocalGet(outletKey('salonos_staffreport_last_auto',salonId))||''):'');

  useEffect(()=>{
    let cancelled=false;
    if(!fsSupported)return;
    (async()=>{
      try{
        const handle=await fsIdbGet(outletKey('staffReportDir',salonId));
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
      if(!/(cradle|staff|work)/.test(name))continue;
      if(!/\.(csv|xlsx|xls)$/.test(name))continue;
      const file=await entry.getFile();
      if(!best||file.lastModified>best.file.lastModified)best={entry,file};
    }
    return best;
  };

  const loadWorkbookFile=async(file)=>{
    let text;
    if(isCSVFile(file)){
      text=await file.text();
    }else{
      if(!window.XLSX)throw new Error('Excel reader could not load. Please check your internet connection and reopen the file.');
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array',cellDates:false,raw:true});
      const ws=wb.Sheets[wb.SheetNames[0]];
      if(!ws)throw new Error('No sheet found in this Excel file.');
      text=XLSX.utils.sheet_to_csv(ws,{blankrows:false});
    }
    setRawCSV(text);
    const n=parseCSVText(text);
    return n;
  };

  const scanAndAutoImport=async(handle,opts)=>{
    const silent=opts&&opts.silent;
    setAutoBusy(true);
    try{
      const best=await findLatestReport(handle);
      if(!best){
        if(!silent)setAutoStatus('No Cradlee Staff Work Report file found in the connected folder yet.');
        setAutoBusy(false);return;
      }
      const tag=best.file.name+'|'+best.file.lastModified;
      if(tag===lastAutoRef.current){
        if(!silent)setAutoStatus('Already up to date — "'+best.file.name+'" was already imported.');
        setAutoBusy(false);return;
      }
      const n=await loadWorkbookFile(best.file);
      lastAutoRef.current=tag;
      safeLocalSet(outletKey('salonos_staffreport_last_auto',salonId),tag);
      setParseMsg('Loaded '+n+' staff records.');
      setAutoStatus('Auto-imported "'+best.file.name+'" from your Downloads folder.');
      setDirNeedsPermission(false);
    }catch(err){
      setAutoStatus('Auto-import check failed: '+err.message);
    }
    setAutoBusy(false);
  };

  const connectDownloads=async()=>{
    try{
      const handle=await window.showDirectoryPicker({id:'staff-report-downloads',mode:'read',startIn:'downloads'});
      try{await fsIdbSet(outletKey('staffReportDir',salonId),handle);}catch(e){}
      setDirHandle(handle);setDirNeedsPermission(false);
      await scanAndAutoImport(handle);
    }catch(err){
      if(err.name!=='AbortError')setAutoStatus('Could not connect: '+err.message);
    }
  };

  const disconnectDownloads=async()=>{
    try{await fsIdbDelete(outletKey('staffReportDir',salonId));}catch(e){}
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

  const numCols=['Salary','Target','ServiceSale','MemberShipSale','ProductSale','PackageSale','TotalSale','Invoice Count','Total Customer','New Customer','Existing Customer'];
  const pctCols=['Target achieved in (%)'];
  // Master Salary's employees, for matching each Staff Work Report row's EmpId against an
  // employee's "Employee Id as per Billing Software" (billingId) — see row highlighting below.
  const masterEmployees=loadEmployees(salonId);
  const masterEmpForReportRow=(r)=>{
    const empIdVal=String((r&&r['EmpId'])||'').trim();
    if(!empIdVal)return null;
    return masterEmployees.find(e=>e.billingId&&String(e.billingId).trim()===empIdVal)||null;
  };

  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Consolidated Staff Work Report'),
        React.createElement('div',{className:'page-sub'},'Consolidated staff performance — upload from POS/Cradlee export')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('input',{type:'month',className:'form-control',style:{width:'auto'},value:selMonth,onChange:e=>setSelMonth(e.target.value)}),
        React.createElement('button',{className:'btn btn-primary btn-sm',onClick:()=>window.open('https://app.cradleesoft.com/app/login','_blank','noopener,noreferrer')},'🔗 Open Cradlee eSoft Login'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:downloadTemplate},'⬇ Download Template'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'}},'⬇ Export'),
        selected.size>0&&React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(255,107,107,.15)',border:'1px solid rgba(255,107,107,.4)',color:'var(--red)',fontWeight:600},onClick:deleteSelected},'🗑 Delete Selected ('+selected.size+')'),
        reports.length>0&&React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(255,107,107,.1)',border:'1px solid rgba(255,107,107,.3)',color:'var(--red)'},onClick:()=>{if(confirm('Remove all imported staff work report data?')){setReports([]);setRawCSV('');setParseMsg('');setSelected(new Set());}}},'Clear Data')
      )
    ),

    subTab==='report'&&React.createElement('div',{className:'card',style:{marginBottom:16,background:'rgba(74,158,255,0.06)',border:'1px solid rgba(74,158,255,0.25)'}},
      React.createElement('div',{style:{display:'flex',gap:12,alignItems:'flex-start'}},
        React.createElement('div',{style:{fontSize:20}},'💡'),
        React.createElement('div',null,
          React.createElement('div',{style:{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:4}},'How to bring in your Cradlee Staff Work Report'),
          React.createElement('div',{style:{fontSize:12,color:'var(--text2)',lineHeight:1.8}},
            '1. Click \u201cOpen Cradlee eSoft Login\u201d above and sign in to your account.',React.createElement('br'),
            '2. In Cradlee, go to Reports → Staff Work Report and export it as CSV or Excel.',React.createElement('br'),
            '3. Come back here and drop the exported file in the upload box below, or connect your Downloads folder once so it\u2019s picked up automatically.'
          ),
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:8}},'Note: a direct, one-click pull from Cradlee isn\u2019t possible \u2014 their platform doesn\u2019t offer a public API/export link that a browser-based app can call on your behalf, so the export-then-upload step above is needed.')
        )
      )
    ),

    subTab==='report'&&React.createElement('div',{className:'card',style:{marginBottom:16,background:fsSupported?'rgba(76,175,125,0.06)':'rgba(255,159,67,0.06)',border:'1px solid '+(fsSupported?'rgba(76,175,125,0.25)':'rgba(255,159,67,0.25)')}},
      React.createElement('div',{style:{display:'flex',gap:12,alignItems:'flex-start',flexWrap:'wrap'}},
        React.createElement('div',{style:{fontSize:20}},'⚡'),
        React.createElement('div',{style:{flex:1,minWidth:260}},
          React.createElement('div',{style:{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:4}},'Auto-Import from your Downloads folder'),
          !fsSupported?React.createElement('div',{style:{fontSize:12,color:'var(--text2)',lineHeight:1.7}},
            'This browser doesn\u2019t support folder watching (works in Chrome/Edge desktop only). Please use the upload box below instead.'
          ):React.createElement(React.Fragment,null,
            React.createElement('div',{style:{fontSize:12,color:'var(--text2)',lineHeight:1.7,marginBottom:8}},
              !dirHandle
                ?'Connect your Downloads folder once. From then on, every time a Cradlee Staff Work Report export lands there, this page can pick it up automatically \u2014 no manual browsing.'
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
            React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:8,lineHeight:1.6}},'It looks for the most recently modified file in that folder whose name contains "Cradle", "Staff", or "Work" (.csv, .xlsx, or .xls). You still export the report from Cradlee yourself \u2014 this just removes the manual browse-and-select step afterwards.')
          )
        )
      )
    ),

    // Sub tabs: Report Data | Attachments
    React.createElement('div',{className:'tab-bar',style:{marginBottom:16}},
      [{id:'report',label:'Report Data'},{id:'attachments',label:'📎 Attachments ('+attachments.length+')'}].map(t=>
        React.createElement('button',{key:t.id,className:`tab-btn ${subTab===t.id?'active':''}`,onClick:()=>setSubTab(t.id)},t.label)
      )
    ),

    // Attachments tab
    subTab==='attachments'&&React.createElement('div',null,
      React.createElement('div',{className:'card',style:{marginBottom:16}},
        React.createElement('div',{className:'card-title'},'Attachments — Consolidated Staff Work Report'),
        React.createElement('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:10}},'Attach supporting files for this report (POS exports, screenshots, approvals — PDF, images, Excel/CSV).'),
        React.createElement('input',{type:'file',multiple:true,style:{display:'none'},id:'swr-attach',onChange:e=>{if(e.target.files.length)addAttachments(e.target.files);e.target.value='';}}),
        React.createElement('label',{htmlFor:'swr-attach',className:'btn btn-primary btn-sm',style:{cursor:'pointer'}},'📎 Attach Files')
      ),
      React.createElement('div',{className:'card'},
        attachments.length===0
          ?React.createElement('div',{style:{textAlign:'center',padding:32,color:'var(--text3)'}},'No attachments yet. Click 📎 Attach Files to add supporting documents.')
          :React.createElement('div',{className:'table-wrap'},
            React.createElement('table',null,
              React.createElement('thead',null,React.createElement('tr',null,['File Name','Type','Size','Attached On','Actions'].map(h=>React.createElement('th',{key:h},h)))),
              React.createElement('tbody',null,attachments.map((a,i)=>React.createElement('tr',{key:i},
                React.createElement('td',null,React.createElement('span',{style:{fontWeight:500,color:'var(--text)'}},'📎 '+a.name)),
                React.createElement('td',null,a.type||'—'),
                React.createElement('td',null,a.size?(a.size/1024).toFixed(1)+' KB':'—'),
                React.createElement('td',null,a.date),
                React.createElement('td',null,React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>{if(confirm('Remove attachment "'+a.name+'"? This can\'t be undone.'))setAttachments(prev=>prev.filter((_,x)=>x!==i));}},'✕ Remove'))
              )))
            )
          )
      )
    ),

    // Upload card
    subTab==='report'&&React.createElement('div',{className:'card',style:{marginBottom:16}},
      React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}},
        React.createElement('div',{className:'card-title',style:{marginBottom:0}},'Upload Staff Work Report'),
        React.createElement('button',{className:'btn btn-primary btn-sm',onClick:openAddManual},'✎ Add Record Manually')
      ),
      React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',margin:'2px 0 10px'}},'Prefer typing it in yourself instead of a CSV/Excel upload? Use "Add Record Manually" above — one employee at a time, same columns as the template below.'),
      React.createElement('div',{style:{display:'flex',gap:10,marginBottom:10,alignItems:'center',flexWrap:'wrap'}},
        React.createElement('input',{type:'file',accept:'.csv,.xlsx,.xls',style:{display:'none'},id:'staff-upload',onChange:async e=>{
          const f=e.target.files[0];if(!f)return;
          e.target.value='';
          setParseMsg('');
          try{
            if(isCSVFile(f)){
              const text=await f.text();
              setRawCSV(text);
            }else{
              if(!window.XLSX)throw new Error('Excel reader could not load. Please check your internet connection and reopen the file.');
              const buf=await f.arrayBuffer();
              const wb=XLSX.read(buf,{type:'array',cellDates:false,raw:true});
              const ws=wb.Sheets[wb.SheetNames[0]];
              if(!ws)throw new Error('No sheet found in this Excel file.');
              const csv=XLSX.utils.sheet_to_csv(ws,{blankrows:false});
              setRawCSV(csv);
            }
          }catch(err){setParseMsg('Could not read "'+f.name+'": '+err.message);}
        }}),
        React.createElement('label',{htmlFor:'staff-upload',className:'btn btn-ghost btn-sm',style:{cursor:'pointer'}},'📂 Choose CSV or Excel File'),
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},'Accepted: CSV (.csv) and Excel (.xlsx, .xls)')
      ),
      React.createElement('textarea',{className:'form-control',rows:5,value:rawCSV,onChange:e=>setRawCSV(e.target.value),placeholder:'Paste CSV data here, or choose a CSV/Excel file…',style:{fontFamily:'monospace',fontSize:11,resize:'vertical',marginBottom:10}}),
      React.createElement('div',{style:{display:'flex',gap:10}},
        React.createElement('button',{className:'btn btn-primary',onClick:loadCSV},'Load Report Data'),
        React.createElement('button',{className:'btn btn-ghost',onClick:()=>{setRawCSV('');setReports([]);setParseMsg('');}},'Clear')
      ),
      parseMsg&&React.createElement('div',{className:'success-card success-card-sm',style:{marginTop:10,color:'var(--green)'}},parseMsg)
    ),

    // Template reference
    subTab==='report'&&React.createElement('div',{className:'card',style:{marginBottom:reports.length>0?16:0}},
      React.createElement('div',{className:'card-title'},'Template Columns Reference'),
      React.createElement('div',{style:{display:'flex',flexWrap:'wrap',gap:6}},
        TEMPLATE_COLS.map((c,i)=>React.createElement('span',{key:i,style:{fontFamily:'monospace',fontSize:11,background:'var(--bg3)',padding:'3px 8px',borderRadius:4,color:i<4?'var(--accent2)':'var(--text2)',border:'1px solid var(--border)'}},c))
      )
    ),

    // Data table
    subTab==='report'&&reports.length>0&&React.createElement('div',{className:'card',style:{padding:0}},
      React.createElement('div',{style:{overflowX:'auto'}},
        React.createElement('table',{style:{borderCollapse:'collapse',width:'100%',fontSize:11}},
          React.createElement('thead',null,React.createElement('tr',null,
            React.createElement('th',{key:'sel',style:{width:32,padding:'8px 10px',background:'var(--th-bg)'}},React.createElement('input',{type:'checkbox',
              checked:reports.length>0&&reports.every((_,i)=>selected.has(i)),
              onChange:e=>setSelected(e.target.checked?new Set(reports.map((_,i)=>i)):new Set())
            })),
            ...[...TEMPLATE_COLS,''].map(h=>React.createElement('th',{key:h,style:{padding:'8px 10px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em',whiteSpace:'nowrap',borderBottom:'2px solid var(--accent)',textAlign:numCols.includes(h)||pctCols.includes(h)?'right':'left',minWidth:h==='Emp_Name'?140:80}},h))
          )),
          React.createElement('tbody',null,
            reports.map((r,i)=>{
              const matchedEmp=masterEmpForReportRow(r);
              const isSelected=selected.has(i);
              const matchBg=matchedEmp?'rgba(56,142,98,0.22)':'rgba(196,68,68,0.18)';
              // This tint sits on top of the theme's own card background, so normal theme-aware
              // text colors stay readable in both themes without needing an override: pale tint
              // over a light background (light theme) or a darker tint over a dark background
              // (dark theme) — either way the existing var(--text)/var(--text2)/var(--text3)
              // contrast still holds.
              const rowTextStrong='var(--text)';
              const rowTextMuted='var(--text3)';
              const rowTitle=matchedEmp
                ?('Master Salary match: '+matchedEmp.name+' (Billing Software ID '+matchedEmp.billingId+')')
                :'No Master Salary employee has this Billing Software ID — check Master Salary → Employee Id as per Billing Software';
              return React.createElement('tr',{key:i,title:rowTitle,style:{background:isSelected?'rgba(47,95,224,0.06)':matchBg}},
              React.createElement('td',{key:'sel',style:{padding:'7px 10px',borderBottom:'1px solid var(--border)'}},React.createElement('input',{type:'checkbox',checked:isSelected,onChange:()=>toggleSelect(i)})),
              ...TEMPLATE_COLS.map(col=>React.createElement('td',{key:col,style:{padding:'7px 10px',fontSize:11,borderBottom:'1px solid var(--border)',textAlign:numCols.includes(col)||pctCols.includes(col)?'right':'left',color:col==='Emp_Name'?rowTextStrong:numCols.includes(col)&&Number(r[col])>0?rowTextStrong:rowTextMuted,fontWeight:col==='TotalSale'||col==='Target achieved in (%)'?600:400}},
                pctCols.includes(col)
                  ?React.createElement('span',{style:{color:Number(r[col])>=100?'var(--green)':Number(r[col])>=80?'var(--accent)':'var(--red)',fontWeight:600}},r[col]+'%')
                  :numCols.includes(col)&&r[col]
                    ?'₹'+Number(r[col]).toLocaleString()
                    :r[col]||'—'
              )),
              React.createElement('td',{key:'act',style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}},
                React.createElement('button',{'aria-label':'Edit',className:'btn btn-ghost btn-sm',title:'Edit this row manually',onClick:()=>openEditManual(i)},'✎'),
                React.createElement('button',{'aria-label':'Delete',className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},title:'Delete this row',onClick:()=>{if(confirm('Delete this staff record?')){setReports(prev=>prev.filter((_,x)=>x!==i));setSelected(new Set());}}},React.createElement(IconTrash,{size:14})))
              );
            })
          )
        )
      )
    ),

    // Manual Add/Edit modal — same TEMPLATE_COLS shape as the CSV/Excel upload, one row at a
    // time. Picking a Master Salary employee auto-fills EmpId/Name/Designation/Salary from
    // their record; everything else (and those four too) stays freely editable.
    showManualModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowManualModal(false)},
      React.createElement('div',{className:'modal',style:{width:760,maxWidth:'95vw',maxHeight:'88vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
        React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}},
          React.createElement('div',{className:'modal-title',style:{marginBottom:0,paddingBottom:0,border:'none'}},editIdx!=null?'Edit Staff Record':'Add Staff Record Manually'),
          React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setShowManualModal(false)},'\u2715 Close')
        ),
        React.createElement('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:14,paddingBottom:12,borderBottom:'1px solid var(--border)'}},'Fills the same '+MONTHS[manualMonthCal.month]+' '+manualMonthCal.year+' Staff Work Report used by the CSV/Excel upload above — this row will show up in Incentive Working exactly the same way.'),
        React.createElement('div',{className:'form-group',style:{marginBottom:14}},
          React.createElement('label',null,'Pick a Master Salary employee (optional — autofills Emp Id / Name / Designation / Salary)'),
          React.createElement('select',{className:'form-control',value:'',onChange:e=>{if(e.target.value)applyManualEmployee(e.target.value);}},
            [React.createElement('option',{key:'',value:''},'— Select employee —'),
             ...manualEmployees.map(emp=>React.createElement('option',{key:emp.id,value:emp.billingId||''},emp.name+(emp.billingId?' ('+emp.billingId+')':' — no Billing Software ID set')))]
          )
        ),
        React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))',gap:10,marginBottom:14}},
          TEMPLATE_COLS.map(col=>React.createElement('div',{key:col,className:'form-group',style:{marginBottom:0}},
            React.createElement('label',{style:{fontSize:11}},col),
            React.createElement('input',{type:numCols.includes(col)||pctCols.includes(col)?'number':'text',step:pctCols.includes(col)?'0.01':undefined,
              className:'form-control',value:manualForm[col],placeholder:col==='EmpId'?'e.g. E001':undefined,
              onChange:e=>setManualField(col,e.target.value)})
          ))
        ),
        React.createElement('div',{style:{display:'flex',gap:8,justifyContent:'space-between',flexWrap:'wrap'}},
          React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:recalcManualTotals,title:'Fills Total Sale, Target achieved and Target achieved in (%) from the sale/target figures above'},'⟳ Recalculate Totals'),
          React.createElement('div',{style:{display:'flex',gap:8}},
            React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowManualModal(false)},'Cancel'),
            React.createElement('button',{className:'btn btn-primary',onClick:saveManualRow},editIdx!=null?'Save Changes':'Add Record')
          )
        )
      )
    )
  );
}

function BankTemplatesSheet(){
  const [bank,setBank]=useState('yes');
  const BANKS=[
    {id:'yes',name:'Yes Bank'},
    {id:'idfc',name:'IDFC Bank'},
    {id:'icici',name:'ICICI Bank'},
    {id:'hdfc',name:'HDFC Bank'},
    {id:'indusind',name:'IndusInd Bank'},
  ];
  const COLS={
    yes:['Transaction Date','Value Date','Description','Reference Number','Withdrawals','Deposits','Running Balance','Nature'],
    idfc:['Transaction Date','Value Date','Particulars','Cheque No.','Debit','Credit','Balance','Nature'],
    icici:['No.','Transaction ID','Value Date','Txn Posted Date','Cheque No.','Description','Cr/Dr','Transaction Amount (INR)','Available Balance (INR)','Nature'],
    hdfc:['Date','Narration','Chq./Ref.No.','Value Dt','Withdrawal Amt.','Deposit Amt.','Closing Balance','Nature'],
    indusind:['Date','Particulars','Ref No','Chq No','Withdrawal','Deposit','Balance','Nature'],
  };
  const RULES={
    yes:[
      {pattern:'POS PYMT',field:'Description',nature:'Card'},
      {pattern:'SALONSURF',field:'Description',nature:'Card'},
      {pattern:'Rent',field:'Description',nature:'Rent'},
      {pattern:'Salary',field:'Description',condition:'date <= 15',nature:'Previous Month Salary'},
      {pattern:'Incentive',field:'Description',condition:'date > 15',nature:'Previous Month Incentive'},
    ],
    idfc:[
      {pattern:'PINE LABS',field:'Particulars',nature:'UPI'},
      {pattern:'CARD PMT MID',field:'Particulars',nature:'Card'},
      {pattern:'SALONSURF',field:'Particulars',nature:'Card'},
      {pattern:'Salary',field:'Particulars',condition:'date <= 15',nature:'Previous Month Salary'},
      {pattern:'Incentive',field:'Particulars',condition:'date > 15',nature:'Previous Month Incentive'},
      {pattern:'Terminal management Fee',field:'Particulars',nature:'Bank Charges'},
      {pattern:'REGBIL',field:'Particulars',nature:'Electricity'},
      {pattern:'UPI',field:'Particulars',condition:'Credit Txn',nature:'UPI'},
    ],
    icici:[
      {pattern:'MESPOS',field:'Description',nature:'Card'},
      {pattern:'PAYTM PAYMENTS SERVICES',field:'Description',nature:'Card'},
      {pattern:'SALONSURF',field:'Description',nature:'Card'},
      {pattern:'Salary',field:'Description',condition:'date <= 15',nature:'Previous Month Salary'},
      {pattern:'Incentive',field:'Description',condition:'date > 15',nature:'Previous Month Incentive'},
    ],
    hdfc:[
      {pattern:'UPI SETTLEMENT',field:'Narration',nature:'UPI'},
      {pattern:'CARDS SETTL',field:'Narration',nature:'Card'},
      {pattern:'SALONSURF',field:'Narration',nature:'Card'},
      {pattern:'Salary',field:'Narration',condition:'date <= 15',nature:'Previous Month Salary'},
      {pattern:'Incentive',field:'Narration',condition:'date > 15',nature:'Previous Month Incentive'},
    ],
    indusind:[
      {pattern:'Trf frm',field:'Particulars',nature:'Card'},
    ],
  };

  const [rawData,setRawData]=useState('');
  const [parsed,setParsed]=useState([]);
  const [parseMsg,setParseMsg]=useState('');
  const [editingNature,setEditingNature]=useState({});

  const dlTemplate=()=>{
    const cols=COLS[bank];
    const sample={yes:['01/04/2026','01/04/2026','POS PYMT - SALONSURF','TXN2024001','','21500','150000',''],idfc:['01/04/2026','01/04/2026','CARD PMT MID XXXXXXXX','','','21500','150000',''],icici:['1','TXN001','01/04/2026','01/04/2026','','UPI SALONSURF CREDIT','CR','21500','150000',''],hdfc:['01/04/2026','UPI SETTLEMENT SALONSURF','TXN001','01/04/2026','','21500','150000',''],indusind:['01/04/2026','Trf frm SALONSURF','TXN001','','','21500','150000','']};
    const csv=[cols,sample[bank]||cols.map(()=>'')].map(r=>r.map(c=>'"'+c+'"').join(',')).join('\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=BANKS.find(b=>b.id===bank).name.replace(' ','_')+'_Statement_Template.csv';a.click();URL.revokeObjectURL(url);
  };

  const applyNatureRules=(rows)=>{
    const rules=RULES[bank]||[];
    const descField={yes:'Description',idfc:'Particulars',icici:'Description',hdfc:'Narration',indusind:'Particulars'}[bank]||'Description';
    return rows.map(row=>{
      const desc=(row[descField]||row['Description']||row['Narration']||row['Particulars']||'').toString().toUpperCase();
      const dateStr=row['Transaction Date']||row['Date']||'';
      const day=parseInt((dateStr.split('/')[0]||dateStr.split('-')[0])||'1',10);
      const amount=parseFloat(row['Deposits']||row['Credit']||row['Deposit']||row['Transaction Amount (INR)']||'0');
      const isCredit=amount>0||(row['Cr/Dr']||'').toUpperCase()==='CR';
      let nature='';
      for(const r of rules){
        if(desc.includes(r.pattern.toUpperCase())){
          if(!r.condition)nature=r.nature;
          else if(r.condition==='date <= 15'&&day<=15)nature=r.nature;
          else if(r.condition==='date > 15'&&day>15)nature=r.nature;
          else if(r.condition==='Credit Txn'&&isCredit)nature=r.nature;
          if(nature)break;
        }
      }
      return{...row,Nature:nature||row['Nature']||''};
    });
  };

  const loadData=()=>{
    const lines=rawData.trim().split(/\r?\n/).filter(l=>l.trim());
    if(lines.length<2){setParseMsg('No data rows found.');return;}
    const hdr=lines[0].split(',').map(h=>h.replace(/"/g,'').trim());
    const rows=lines.slice(1).map(line=>{
      const v=line.split(',').map(c=>c.replace(/"/g,'').trim());
      const obj={};hdr.forEach((h,i)=>obj[h]=v[i]||'');
      return obj;
    }).filter(r=>Object.values(r).some(v=>v));
    const withNature=applyNatureRules(rows);
    setParsed(withNature);
    setParseMsg('Loaded '+withNature.length+' transactions. AI nature rules applied.');
  };

  const updateNature=(i,val)=>{
    setParsed(prev=>prev.map((r,ri)=>ri===i?{...r,Nature:val}:r));
  };

  const exportWithNature=async()=>{
    if(!parsed.length)return;
    const cols=[...COLS[bank].filter(c=>c!=='Nature'),'Nature'];
    const sheetRows=[cols,...parsed.map(r=>cols.map(c=>{
      const v=r[c]||'';
      return(typeof v==='string'&&v.trim()!==''&&!isNaN(Number(v)))?Number(v):v;
    }))];
    try{
      const blob=await exportReportExcelBlob(BANKS.find(b=>b.id===bank).name+' — Classified',sheetRows);
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=BANKS.find(b=>b.id===bank).name.replace(' ','_')+'_Classified.xlsx';a.click();URL.revokeObjectURL(url);
    }catch(err){alert(err.message||'Could not build the Excel file — please try again.');}
  };

  const curRules=RULES[bank]||[];

  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},fixAmp('Bank Statement Templates & Classification')),
        React.createElement('div',{className:'page-sub'},'AI-powered transaction nature tagging for all bank formats')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:dlTemplate},'⬇ Download Template'),
        parsed.length>0&&React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},onClick:exportWithNature},'⬇ Export Classified')
      )
    ),

    // Bank selector
    React.createElement('div',{className:'tab-bar',style:{marginBottom:16}},
      BANKS.map(b=>React.createElement('button',{key:b.id,className:`tab-btn ${bank===b.id?'active':''}`,onClick:()=>{setBank(b.id);setParsed([]);setParseMsg('');setRawData('');}},b.name))
    ),

    React.createElement('div',{className:'grid2',style:{marginBottom:16}},
      // Column reference
      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'card-title'},'Template Columns — '+BANKS.find(b=>b.id===bank).name),
        React.createElement('div',{style:{display:'flex',flexWrap:'wrap',gap:6}},
          COLS[bank].map((c,i)=>React.createElement('span',{key:i,style:{fontFamily:'monospace',fontSize:11,background:c==='Nature'?'rgba(47,95,224,0.15)':'var(--bg3)',padding:'3px 8px',borderRadius:4,color:c==='Nature'?'var(--accent2)':'var(--text2)',border:'1px solid '+(c==='Nature'?'rgba(47,95,224,0.3)':'var(--border)')}},c))
        )
      ),
      // Rules reference
      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'card-title'},'Auto-Classification Rules'),
        React.createElement('div',{className:'table-wrap'},
          React.createElement('table',null,
            React.createElement('thead',null,React.createElement('tr',null,['If text contains','Condition','Nature'].map(h=>React.createElement('th',{key:h},h)))),
            React.createElement('tbody',null,curRules.map((r,i)=>
              React.createElement('tr',{key:i},
                React.createElement('td',null,React.createElement('code',{style:{background:'var(--bg3)',padding:'1px 6px',borderRadius:3,fontSize:11}},r.pattern)),
                React.createElement('td',null,React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},r.condition||'Always')),
                React.createElement('td',null,React.createElement('span',{className:'badge badge-blue'},r.nature))
              )
            ))
          )
        )
      )
    ),

    // Upload & parse
    React.createElement('div',{className:'card',style:{marginBottom:16}},
      React.createElement('div',{className:'card-title'},'Upload & Classify'),
      React.createElement('div',{style:{marginBottom:10}},
        React.createElement('input',{type:'file',accept:'.csv,.txt',style:{display:'none'},id:'bank-stmt-upload',onChange:e=>{
          const f=e.target.files[0];if(!f)return;
          const rdr=new FileReader();rdr.onload=ev=>setRawData(ev.target.result);rdr.readAsText(f);e.target.value='';
        }}),
        React.createElement('label',{htmlFor:'bank-stmt-upload',className:'btn btn-ghost btn-sm',style:{cursor:'pointer'}},'📂 Choose Bank Statement CSV')
      ),
      React.createElement('textarea',{className:'form-control',rows:6,value:rawData,onChange:e=>setRawData(e.target.value),placeholder:'Paste bank statement CSV here or upload a file…',style:{fontFamily:'monospace',fontSize:11,resize:'vertical',marginBottom:10}}),
      React.createElement('div',{style:{display:'flex',gap:10}},
        React.createElement('button',{className:'btn btn-primary',onClick:loadData},'Load & Classify'),
        React.createElement('button',{className:'btn btn-ghost',onClick:()=>{setRawData('');setParsed([]);setParseMsg('');}},'Clear')
      ),
      parseMsg&&React.createElement('div',{className:'success-card success-card-sm',style:{marginTop:10,color:'var(--green)'}},parseMsg)
    ),

    // Results table
    parsed.length>0&&React.createElement('div',{className:'card',style:{padding:0}},
      React.createElement('div',{style:{overflowX:'auto'}},
        React.createElement('table',{style:{borderCollapse:'collapse',width:'100%',fontSize:11}},
          React.createElement('thead',null,React.createElement('tr',null,
            [...COLS[bank].filter(c=>c!=='Nature'),'Nature'].map(h=>React.createElement('th',{key:h,style:{padding:'8px 10px',background:'var(--th-bg)',color:h==='Nature'?'var(--accent2)':'var(--text2)',fontSize:10,fontWeight:700,textTransform:'uppercase',whiteSpace:'nowrap',borderBottom:'2px solid var(--accent)',minWidth:h==='Nature'?160:80}},'h'))
          )),
          React.createElement('tbody',null,parsed.slice(0,200).map((r,i)=>
            React.createElement('tr',{key:i},
              ...COLS[bank].filter(c=>c!=='Nature').map(col=>React.createElement('td',{key:col,style:{padding:'6px 10px',fontSize:11,borderBottom:'1px solid var(--border)',color:'var(--text2)',whiteSpace:'nowrap',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis'}},r[col]||'—')),
              React.createElement('td',{style:{padding:'4px 8px',borderBottom:'1px solid var(--border)'}},
                React.createElement('input',{className:'form-control',style:{fontSize:11,padding:'4px 8px',minWidth:140},value:r['Nature']||'',onChange:e=>updateNature(i,e.target.value),placeholder:'Enter or edit nature…'})
              )
            )
          ))
        )
      )
    )
  );
}

// ── REPORTS HUB ─────────────────────────────────────────────────────
function ReportsHub(){
  const today=new Date();
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const [selMonth,setSelMonth]=useState(today.getMonth());
  const [selYear,setSelYear]=useState(today.getFullYear());
  const [selOutlet,setSelOutlet]=useState('all');
  const [activeReport,setActiveReport]=useState(null);
  const targets=selOutlet==='all'?salonsForCurrentUser().filter(s=>s.status==='Active').map(s=>s.id):[Number(selOutlet)];
  const EMPLOYEES=sortByDesignation(
    targets.flatMap(sid=>loadEmployees(sid).map(e=>({...e,_salonId:sid})))
  );
  // Real attendance for the selected month — replaces what used to be entirely random,
  // seeded-fake data (ATT_DATA), a leftover from long before real attendance tracking existed.
  const realAttFor=(e)=>{
    const store=loadAttendance(e._salonId);
    const rec=store[attMonthKey(e.id,selYear,selMonth)];
    return attSummaryFor(e,selYear,selMonth,rec);
  };
  // ── Real data for every report below — built once here, used by both the on-screen tables and
  // the CSV export, so the two can never show different numbers from different sources. Replaces
  // VENDORS/ADVANCES/PENALTIES/INCENTIVES/DUE_DATES/SALES_DATA/COLLECTION — a leftover block of
  // hardcoded demo arrays from long before any of these screens had real data behind them. ──
  const realSalaryRows=targets.flatMap(sid=>{
    const outletName=(SALONS.find(s=>s.id===sid)||{}).name||('Outlet '+sid);
    return swWorkingsFor(sid,selYear,selMonth).map(e=>({...e,outletName}));
  });
  const realCollectionByDate=(useReal05=false)=>{
    const byDate={};
    targets.forEach(sid=>{
      collectionRowsForMonth(sid,selYear,selMonth).forEach(r=>{
        const iso=toISO(r.invoiceDate);if(!iso)return;
        byDate[iso]=byDate[iso]||{cash:0,card:0,upi:0};
        const div=useReal05?1.05:1;
        byDate[iso].cash+=(Number(r.cash)||0)/div;byDate[iso].card+=(Number(r.card)||0)/div;byDate[iso].upi+=(Number(r.upi)||0)/div;
      });
    });
    return Object.keys(byDate).sort().map(iso=>({date:iso,...byDate[iso],total:byDate[iso].cash+byDate[iso].card+byDate[iso].upi}));
  };
  const realVendorRows=targets.flatMap(sid=>{
    const vendorsBySid=loadVendors(sid);
    return loadVendorInvoices(sid).filter(inv=>inv.docNature!=='Performa Invoice').map(inv=>{
      const paid=(inv.payments||[]).reduce((s,p)=>s+(Number(p.paidAmount)||0),0);
      const bal=(Number(inv.amount)||0)-paid;
      const vendor=vendorsBySid.find(v=>v.id===inv.vendorId)||{};
      return{id:inv.vendorId,name:vendor.name||inv.vendorId,cat:inv.category||'',contact:vendor.contact||'—',terms:vendor.terms||'—',
        invoiceDate:inv.invoiceDate||'',dueDate:inv.dueDate||'',amount:Number(inv.amount)||0,outstanding:Math.max(0,bal),status:bal>0?'Outstanding':'Paid'};
    });
  });
  const realAdvanceRows=targets.flatMap(sid=>{
    let list=[];try{list=JSON.parse(cachedLocalGet(outletKey('salonos_advances',sid))||'[]');}catch(e){}
    return list;
  });
  const realPenaltyRows=targets.flatMap(sid=>{
    let list=[];try{list=JSON.parse(cachedLocalGet(outletKey('salonos_penalties',sid))||'[]');}catch(e){}
    return list;
  });
  const realIncentiveRows=targets.flatMap(sid=>incWorkingsFor(sid,selYear,selMonth));
  const realComplianceRows=targets.flatMap(sid=>{
    let list=[];try{list=JSON.parse(cachedLocalGet(outletKey('salonos_due_dates',sid))||'[]');}catch(e){}
    const outletName=(SALONS.find(s=>s.id===sid)||{}).name||('Outlet '+sid);
    return list.map(d=>({...d,outletName}));
  });

  // Real monthly figures via plBuild() — summed across every active outlet when "All Outlets"
  // is selected, since plBuild itself is single-outlet. (The outlet selector was previously
  // decorative — mk() never actually received selOutlet — that's fixed here too.) Field names
  // below are kept from the old shape (svc/prod/mem/gift) to avoid touching every reference in
  // this file, but they now hold real Cash/Card/UPI Sale/Other Income — the labels shown to the
  // user say so explicitly.
  const mk=(m,y)=>{
    const{fy,mi}=calToFYMI(y,m);
    const targets=selOutlet==='all'?salonsForCurrentUser().filter(s=>s.status==='Active').map(s=>s.id):[Number(selOutlet)];
    const builds=targets.map(sid=>plBuild(sid,fy,mi));
    const sumField=(fn)=>builds.reduce((s,b)=>s+fn(b),0);
    const cash=sumField(b=>b.sections[0].lines[0].amt);
    const card=sumField(b=>b.sections[0].lines[1].amt);
    const upi=sumField(b=>b.sections[0].lines[2].amt);
    const otherInc=sumField(b=>b.sections[0].lines[3].amt);
    const findOpexSum=(name)=>sumField(b=>{const l=b.sections[3].lines.find(x=>x.name===name);return l?l.amt:0;});
    const rent=findOpexSum('Rent'),elec=findOpexSum('Electricity Expenses'),mktg=findOpexSum('Marketing Expenses'),
      rm=findOpexSum('Repair & Maintenance Expenses'),misc=findOpexSum('Daily Expenses');
    const cosmetics=sumField(b=>b.sections[1].lines.reduce((s,l)=>s+l.amt,0));
    const inc=sumField(b=>b.sections[2].lines.filter(l=>l.group==='Employee Monthly Incentive'||l.group==='Employee Daily Incentive').reduce((s,l)=>s+l.amt,0));
    const salaries=sumField(b=>b.sections[2].tot)-inc;
    const cal=periodToCalendar({fy,mi});
    let staff=0,attSum=0,attCount=0;
    targets.forEach(sid=>{
      const emps=cal?getEmployeesForMonth(cal.year,cal.month,sid):[];
      staff+=emps.filter(e=>e.status==='Active').length;
      const sw=cal?swWorkingsFor(sid,cal.year,cal.month):[];
      sw.forEach(e=>{if(e.daysInMonth){attSum+=e.totalDays/e.daysInMonth*100;attCount++;}});
    });
    const att=attCount?Math.round(attSum/attCount):0;
    return{svc:cash,prod:card,mem:upi,gift:otherInc,salaries,rent,elec,cosmetics,mktg,rm,misc,inc,cash,card,upi,staff,att};
  };
  const d=mk(selMonth,selYear);
  const rev=d.svc+d.prod+d.mem+d.gift;
  const exp=d.salaries+d.rent+d.elec+d.cosmetics+d.mktg+d.rm+d.misc+d.inc;
  const net=rev-exp;
  // Every "% of Revenue" figure below divides by rev with no zero-guard — a period with no
  // revenue yet (or an outlet before its first sale) used to produce literal "NaN%"/"Infinity%"
  // on screen AND in the exported CSV/PDF/Excel, since exportReport() below reuses this same
  // unguarded division. pctSafe() is the single fix point for all of it.
  const pctSafe=(a,b)=>(b?(a/b*100):0);

  // 6-month trend
  const trend=Array.from({length:6},(_,i)=>{
    const m=(selMonth-5+i+12)%12;
    const y=selYear+(selMonth-5+i<0?-1:0);
    const t=mk(m,y);
    const tr=t.svc+t.prod+t.mem+t.gift;
    const te=t.salaries+t.rent+t.elec+t.cosmetics+t.mktg+t.rm+t.misc+t.inc;
    return{month:MONTHS[m].slice(0,3),rev:tr,exp:te,net:tr-te};
  });
  const REPORTS=[
    {id:'revenue',icon:'💰',title:'Revenue Report',sub:'Service, Product, Membership, Gift breakdown'},
    {id:'expense',icon:'📉',title:'Expense Report',sub:'Category-wise expense analysis'},
    {id:'pl',icon:'📊',title:'P&L Summary',sub:'Net profit/loss with margins'},
    {id:'salary',icon:'👥',title:'Salary Register',sub:'Employee-wise salary disbursement'},
    {id:'attendance',icon:'📅',title:'Attendance Report',sub:'Present/Absent/LOP summary'},
    {id:'incentive',icon:'🎯',title:'Incentive Report',sub:'Target vs achievement analysis'},
    {id:'vendor',icon:'🏭',title:'Vendor Payables',sub:'Outstanding & aging report'},
    {id:'advance',icon:'💸',title:'Advance Register',sub:'Employee advances & recovery'},
    {id:'collection',icon:'🏦',title:'Collection Report',sub:'Cash, Card, UPI collection'},
    {id:'penalty',icon:'⚠',title:'Penalty Register',sub:'Disciplinary deductions'},
    {id:'compliance',icon:'📋',title:'Compliance Calendar',sub:'PF, ESIC, GST, TDS due dates'},
    {id:'daily',icon:'📆',title:'Daily Sales Report',sub:'Date-wise revenue & expenses'},
  ];

  const exportReport=async(type)=>{
    const rows=[];
    if(type==='revenue'){
      rows.push(['"Category"','"Amount (₹)"','"% of Revenue"']);
      [['Cash Sale',d.svc],['Card Sale',d.prod],['UPI Sale',d.mem],['Other Income',d.gift]].forEach(([k,v])=>
        rows.push(['"'+k+'"','"'+v+'"','"'+pctSafe(v,rev).toFixed(1)+'%"'])
      );
      rows.push(['"TOTAL"','"'+rev+'"','"100%"']);
    }else if(type==='expense'){
      rows.push(['"Category"','"Amount (₹)"','"% of Revenue"']);
      [['Salaries',d.salaries],['Incentives',d.inc],['Rent',d.rent],['Electricity',d.elec],['Cosmetics',d.cosmetics],['Marketing',d.mktg],['R&M',d.rm],['Misc',d.misc]].forEach(([k,v])=>
        rows.push(['"'+k+'"','"'+v+'"','"'+pctSafe(v,rev).toFixed(1)+'%"'])
      );
      rows.push(['"TOTAL"','"'+exp+'"','"'+pctSafe(exp,rev).toFixed(1)+'%"']);
    }else if(type==='pl'){
      rows.push(['"Item"','"Amount (₹)"']);
      rows.push(['"Total Revenue"','"'+rev+'"']);
      rows.push(['"Total Expenses"','"'+exp+'"']);
      rows.push(['"Net Profit/Loss"','"'+net+'"']);
      rows.push(['"Gross Margin %"','"'+pctSafe(net,rev).toFixed(1)+'%"']);
    }else if(type==='salary'){
      rows.push(['"Emp ID"','"Name"','"Designation"','"Outlet"','"Gross Salary"','"PF Emp"','"ESIC"','"Net Salary"','"Status"']);
      realSalaryRows.forEach(e=>rows.push(['"'+e.id+'"','"'+e.name+'"','"'+e.desig+'"','"'+e.outletName+'"','"'+e.grossAfterLop+'"','"'+e.pfEmp+'"','"'+e.esicEmp+'"','"'+e.net+'"','"'+e.status+'"']));
    }else if(type==='collection'){
      rows.push(['"Date"','"Cash"','"Card"','"UPI"','"Total"']);
      realCollectionByDate().forEach(r=>rows.push(['"'+r.date+'"','"'+Math.round(r.cash)+'"','"'+Math.round(r.card)+'"','"'+Math.round(r.upi)+'"','"'+Math.round(r.total)+'"']));
    }else if(type==='attendance'){
      rows.push(['"Emp ID"','"Name"','"Present"','"Absent"','"Half Day"','"LOP Days"','"Att %"']);
      EMPLOYEES.forEach(e=>{
        const s=realAttFor(e);
        const wd=s.daysInMonth-s.off-s.notMarked;
        rows.push(['"'+e.id+'"','"'+e.name+'"','"'+s.present+'"','"'+s.absent+'"','"'+s.half+'"','"'+(s.absent+s.half*0.5)+'"','"'+(wd>0?(s.present/wd*100).toFixed(0)+'%':'—')+'"']);
      });
    }else if(type==='vendor'){
      rows.push(['"Vendor"','"Category"','"Invoice Date"','"Due Date"','"Amount"','"Status"']);
      realVendorRows.forEach(v=>rows.push(['"'+v.name+'"','"'+v.cat+'"','"'+v.invoiceDate+'"','"'+v.dueDate+'"','"'+v.amount+'"','"'+v.status+'"']));
    }else if(type==='advance'){
      rows.push(['"ID"','"Employee"','"Date"','"Amount"','"Outstanding"','"Status"']);
      realAdvanceRows.forEach(a=>rows.push(['"'+a.id+'"','"'+a.emp+'"','"'+a.date+'"','"'+(Number(a.amount)||0)+'"','"'+(Number(a.outstanding)||0)+'"','"'+a.status+'"']));
    }else if(type==='penalty'){
      rows.push(['"ID"','"Employee"','"Date"','"Type"','"Amount"','"Month"']);
      realPenaltyRows.forEach(p=>rows.push(['"'+p.id+'"','"'+p.emp+'"','"'+p.date+'"','"'+p.type+'"','"'+(Number(p.amount)||0)+'"','"'+p.month+'"']));
    }else if(type==='incentive'){
      rows.push(['"Employee"','"Service Target"','"Service Achieved"','"Membership Target"','"Membership Achieved"','"Product Target"','"Product Achieved"','"Total Incentive"']);
      realIncentiveRows.forEach(e=>rows.push(['"'+e.name+'"','"'+e.svcTarget+'"','"'+e.svcActual+'"','"'+e.memTarget+'"','"'+e.memActual+'"','"'+e.prodTarget+'"','"'+e.prodActual+'"','"'+e.totalInc+'"']));
    }else if(type==='compliance'){
      rows.push(['"Type"','"Description"','"Due Date"','"Status"','"Amount"']);
      realComplianceRows.forEach(d=>rows.push(['"'+d.type+'"','"'+d.desc+'"','"'+d.due+'"','"'+d.status+'"','"'+(Number(d.amount)||0)+'"']));
    }else if(type==='daily'){
      // No real data anywhere in this app splits revenue by Service/Product/Gift — Collection
      // Reco only tracks payment method. Reframed to what's actually tracked, same fix already
      // applied to the Dashboard.
      rows.push(['"Date"','"Cash Sale"','"Card Sale"','"UPI Sale"','"Total Sale"']);
      realCollectionByDate(true).forEach(r=>rows.push(['"'+r.date+'"','"'+Math.round(r.cash)+'"','"'+Math.round(r.card)+'"','"'+Math.round(r.upi)+'"','"'+Math.round(r.total)+'"']));
    }
    if(!rows.length){alert('No data for this report.');return;}
    // Rows were built as quoted-string cells for the old CSV writer — strip the quotes and turn
    // anything number-shaped back into a real number, so amounts land as actual Excel numbers
    // (right-aligned, summed by the total row) instead of quoted text.
    const cleanRows=rows.map(r=>r.map(c=>{
      const s=typeof c==='string'?c.replace(/^"|"$/g,''):c;
      if(typeof s==='string'&&s.trim()!==''&&!s.includes('%')&&!isNaN(Number(s)))return Number(s);
      return s;
    }));
    try{
      const blob=await exportReportExcelBlob('SalonOS — '+(REPORTS.find(r=>r.id===type)||{title:type}).title+' — '+MONTHS[selMonth]+' '+selYear,cleanRows);
      const url=URL.createObjectURL(blob);const a=document.createElement('a');
      a.href=url;a.download='SalonOS_'+type+'_'+MONTHS[selMonth]+'_'+selYear+'.xlsx';a.click();URL.revokeObjectURL(url);
    }catch(err){alert(err.message||'Could not build the Excel file — please try again.');}
  };

  // Every caller passes pct as x/rev*100 with no guard against rev being 0 (a brand-new outlet,
  // or any period with no revenue entered yet) — that division used to render literal "NaN%" or
  // "Infinity%" here (and fed the same unguarded value into the CSV/PDF/Excel export below),
  // same bug class already fixed once in the Master Dashboard and once in the donut chart.
  // Sanitizing it once here, at render, covers every Row call site without touching each one.
  const Row=({label,val,pct,color})=>{
    const safePct=(pct!==undefined&&Number.isFinite(pct))?pct:(pct!==undefined?0:undefined);
    return React.createElement('div',{style:{marginBottom:10}},
    React.createElement('div',{style:{display:'flex',justifyContent:'space-between',marginBottom:3}},
      React.createElement('span',{style:{fontSize:12,color:'var(--text2)'}},label),
      React.createElement('div',{style:{textAlign:'right'}},
        React.createElement('span',{style:{fontSize:12,fontWeight:600,color:color||'var(--text)'}},'₹'+val.toLocaleString()),
        safePct!==undefined&&React.createElement('span',{style:{fontSize:10,color:'var(--text3)',marginLeft:6}},(safePct).toFixed(1)+'%')
      )
    ),
    safePct!==undefined&&React.createElement('div',{style:{height:5,background:'var(--bg3)',borderRadius:3,overflow:'hidden'}},
      React.createElement('div',{style:{height:'100%',width:Math.min(100,safePct)+'%',background:color||'var(--accent)',borderRadius:3,transition:'width 0.4s'}})
    )
  );};

  const outletLabel=selOutlet==='all'?'All Outlets':(SALONS.find(s=>String(s.id)===String(selOutlet))||{}).name;
  const reportsHubTitle='Reports Hub — '+MONTHS[selMonth]+' '+selYear+' — '+(outletLabel||'All Outlets').split('—')[0].trim();
  const reportsHubRows=[
    ['Cash Sale',d.svc],['Card Sale',d.prod],['UPI Sale',d.mem],['Other Income',d.gift],['Total Revenue',rev],
    ['Salaries',d.salaries],['Rent',d.rent],['Electricity',d.elec],['Cosmetics/Backbar',d.cosmetics],['Marketing',d.mktg],['Repair & Maintenance',d.rm],['Incentives',d.inc],['Miscellaneous',d.misc],['Total Expenses',exp],
    ['Net Profit',net],['Gross Margin %',pctSafe(net,rev).toFixed(1)+'%'],
    ['Cash Collection',d.cash],['Card Collection',d.card],['UPI Collection',d.upi],
    ['Active Staff',d.staff],['Attendance %',d.att+'%']
  ];
  const reportsHubBodyHtml=()=>'<table><thead><tr><th>Metric</th><th class="num">Value</th></tr></thead><tbody>'
    +reportsHubRows.map(r=>'<tr><td>'+r[0]+'</td><td class="num">'+(typeof r[1]==='number'?'₹'+Math.round(r[1]).toLocaleString('en-IN'):r[1])+'</td></tr>').join('')+'</tbody></table>';
  const reportsHubSheetRows=()=>[['Metric','Value'],...reportsHubRows];

  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Reports Hub'),
        React.createElement('div',{className:'page-sub'},'All reports — export any report as CSV for Excel')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selOutlet,onChange:e=>setSelOutlet(e.target.value)},
          React.createElement('option',{value:'all'},'All Outlets'),
          salonsForCurrentUser().filter(s=>s.status==='Active').map(s=>React.createElement('option',{key:s.id,value:s.id},s.name.split('—')[0].trim()))
        ),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selMonth,onChange:e=>setSelMonth(Number(e.target.value))},MONTHS.map((m,i)=>React.createElement('option',{key:m,value:i},m))),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selYear,onChange:e=>setSelYear(Number(e.target.value))},[2023,2024,2025,2026].map(y=>React.createElement('option',{key:y},y))),
        React.createElement(ShareReportButton,{title:reportsHubTitle,subtitle:'Reports Hub',getBodyHtml:reportsHubBodyHtml,getSheetRows:reportsHubSheetRows})
      )
    ),

    // KPI strip
    React.createElement('div',{className:'grid4',style:{marginBottom:20}},
      [{l:'Total Revenue',v:'₹'+rev.toLocaleString(),c:'green'},{l:'Net Profit',v:'₹'+net.toLocaleString(),c:net>0?'teal':'red'},{l:'Total Expenses',v:'₹'+exp.toLocaleString(),c:'amber'},{l:'Gross Margin',v:pctSafe(net,rev).toFixed(1)+'%',c:pctSafe(net,rev)>15?'blue':'red'}].map(m=>
        React.createElement('div',{key:m.l,className:'metric-card '+m.c},
          React.createElement('div',{className:'metric-label'},m.l),
          React.createElement('div',{className:'metric-value'},m.v)
        )
      )
    ),

    // Revenue trend chart
    React.createElement('div',{className:'card',style:{marginBottom:20}},
      React.createElement('div',{className:'card-title'},'6-Month Revenue vs Expense Trend — '+MONTHS[selMonth]+' '+selYear),
      React.createElement(DynamicBarChart,{
        data:trend.map(t=>({label:t.month,rev:t.rev,exp:t.exp})),
        height:150,
        series:[
          {key:'rev',label:'Revenue',color:'var(--green)',color2:'#7fdaa8'},
          {key:'exp',label:'Expenses',color:'var(--red)',color2:'#ff8a8a'}
        ]
      })
    ),

    // Report grid
    React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:12,marginBottom:20}},
      REPORTS.map(r=>React.createElement('div',{key:r.id,className:'report-card',onClick:()=>setActiveReport(activeReport===r.id?null:r.id)},
        React.createElement('div',{className:'rc-icon'},r.icon),
        React.createElement('div',{className:'rc-title'},r.title),
        React.createElement('div',{className:'rc-sub'},r.sub),
        React.createElement('div',{style:{display:'flex',gap:6,marginTop:12}},
          React.createElement('button',{className:'btn btn-ghost btn-sm',style:{flex:1,textAlign:'center'},onClick:e=>{e.stopPropagation();setActiveReport(r.id);}},activeReport===r.id?'Hide':'View'),
          React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(76,175,125,0.15)',border:'1px solid rgba(76,175,125,0.3)',color:'var(--green)',padding:'4px 10px',borderRadius:'var(--r)',cursor:'pointer',fontSize:11},onClick:e=>{e.stopPropagation();exportReport(r.id);}},'\u2b07 CSV')
        )
      ))
    ),

    // Expanded report view
    activeReport&&React.createElement('div',{className:'card fade-in',style:{marginBottom:20}},
      React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}},
        React.createElement('div',{className:'card-title',style:{margin:0}},REPORTS.find(r=>r.id===activeReport)?.icon+' '+REPORTS.find(r=>r.id===activeReport)?.title+' — '+MONTHS[selMonth]+' '+selYear),
        React.createElement('div',{style:{display:'flex',gap:8}},
          React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},onClick:()=>exportReport(activeReport)},'\u2b07 Export CSV'),
          React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setActiveReport(null)},'✕ Close')
        )
      ),

      // Revenue report
      activeReport==='revenue'&&React.createElement('div',{className:'grid2'},
        React.createElement('div',null,
          React.createElement(Row,{label:'Cash Sale',val:d.svc,pct:d.svc/rev*100,color:'var(--green)'}),
          React.createElement(Row,{label:'Card Sale',val:d.prod,pct:d.prod/rev*100,color:'var(--blue)'}),
          React.createElement(Row,{label:'UPI Sale',val:d.mem,pct:d.mem/rev*100,color:'var(--purple)'}),
          React.createElement(Row,{label:'Other Income',val:d.gift,pct:d.gift/rev*100,color:'var(--teal)'}),
          React.createElement('div',{style:{borderTop:'2px solid var(--accent)',paddingTop:10,marginTop:8,display:'flex',justifyContent:'space-between',fontWeight:700}},
            React.createElement('span',null,'Total Revenue'),
            React.createElement('span',{style:{color:'var(--green)'}},'₹'+rev.toLocaleString())
          )
        ),
        React.createElement('div',null,
          React.createElement('div',{style:{fontSize:12,fontWeight:600,color:'var(--text2)',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}},'Collection Mix'),
          React.createElement(Row,{label:'Cash Collection',val:d.cash,pct:d.cash/(d.cash+d.card+d.upi)*100,color:'var(--accent)'}),
          React.createElement(Row,{label:'Card Collection',val:d.card,pct:d.card/(d.cash+d.card+d.upi)*100,color:'var(--blue)'}),
          React.createElement(Row,{label:'UPI Collection',val:d.upi,pct:d.upi/(d.cash+d.card+d.upi)*100,color:'var(--teal)'})
        )
      ),

      // Expense report
      activeReport==='expense'&&React.createElement('div',{className:'grid2'},
        React.createElement('div',null,
          [['Staff Salaries',d.salaries,'var(--red)'],['Incentive Payments',d.inc,'var(--orange)'],['Rent',d.rent,'var(--purple)'],['Electricity',d.elec,'var(--amber)']].map(([l,v,c])=>React.createElement(Row,{key:l,label:l,val:v,pct:v/rev*100,color:c}))
        ),
        React.createElement('div',null,
          [['Cosmetics/Products',d.cosmetics,'var(--blue)'],['Marketing',d.mktg,'var(--teal)'],['Repair & Maintenance',d.rm,'var(--text3)'],['Miscellaneous',d.misc,'var(--text3)']].map(([l,v,c])=>React.createElement(Row,{key:l,label:l,val:v,pct:v/rev*100,color:c})),
          React.createElement('div',{style:{borderTop:'2px solid var(--red)',paddingTop:10,marginTop:8,display:'flex',justifyContent:'space-between',fontWeight:700}},
            React.createElement('span',null,'Total Expenses'),
            React.createElement('span',{style:{color:'var(--red)'}},'₹'+exp.toLocaleString())
          )
        )
      ),

      // P&L
      activeReport==='pl'&&React.createElement('div',null,
        React.createElement('div',{className:'grid4',style:{marginBottom:12}},
          [{l:'Revenue',v:'₹'+rev.toLocaleString(),c:'green'},{l:'Expenses',v:'₹'+exp.toLocaleString(),c:'red'},{l:'Net P/L',v:(net>=0?'+':'')+'₹'+Math.abs(net).toLocaleString(),c:net>=0?'teal':'red'},{l:'Margin',v:pctSafe(net,rev).toFixed(1)+'%',c:pctSafe(net,rev)>15?'blue':'amber'}].map(m=>
            React.createElement('div',{key:m.l,className:'metric-card '+m.c},React.createElement('div',{className:'metric-label'},m.l),React.createElement('div',{className:'metric-value'},m.v))
          )
        ),
        React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:14,fontSize:13,color:'var(--text2)',lineHeight:1.9}},
          React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'4px 24px'}},
            [['Total Revenue','₹'+rev.toLocaleString(),'var(--green)'],['Cash Sale','₹'+d.svc.toLocaleString(),''],['Card Sale','₹'+d.prod.toLocaleString(),''],['UPI Sale','₹'+d.mem.toLocaleString(),''],['Total Expenses','₹'+exp.toLocaleString(),'var(--red)'],['Salaries + Incentives','₹'+(d.salaries+d.inc).toLocaleString(),''],['Rent + Utilities','₹'+(d.rent+d.elec).toLocaleString(),''],['Others','₹'+(d.cosmetics+d.mktg+d.rm+d.misc).toLocaleString(),'']].map(([k,v,c],i)=>
              React.createElement('div',{key:i,style:{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid var(--border)'}},
                React.createElement('span',null,k),React.createElement('span',{style:{fontWeight:600,color:c||'var(--text)'}},v)
              )
            )
          )
        )
      ),

      // Salary report
      activeReport==='salary'&&React.createElement('div',{className:'table-wrap'},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,['Emp ID','Name','Designation','Outlet','Gross Salary','PF (Emp)','ESIC','Adv. Ded.','Penalty','Net Salary','Status'].map(h=>React.createElement('th',{key:h},h)))),
          React.createElement('tbody',null,realSalaryRows.map(e=>
            React.createElement('tr',{key:e._salonId+'-'+e.id},
              React.createElement('td',null,React.createElement('span',{style:{fontFamily:'monospace',fontSize:11,color:'var(--accent)'}},e.id)),
              React.createElement('td',null,React.createElement('div',{style:{fontWeight:500,color:'var(--text)'}},e.name),React.createElement('div',{style:{fontSize:10,color:'var(--text3)'}},e.dept)),
              React.createElement('td',null,e.desig),React.createElement('td',null,e.outletName),
              React.createElement('td',null,'₹'+e.grossAfterLop.toLocaleString()),
              React.createElement('td',null,e.pfEmp?'₹'+e.pfEmp.toLocaleString():'—'),
              React.createElement('td',null,e.esicEmp?'₹'+e.esicEmp.toLocaleString():'—'),
              React.createElement('td',null,e.advAdj?React.createElement('span',{style:{color:'var(--orange)'}},'₹'+e.advAdj.toLocaleString()):'—'),
              React.createElement('td',null,e.penAmt?React.createElement('span',{style:{color:'var(--red)'}},'₹'+e.penAmt.toLocaleString()):'—'),
              React.createElement('td',null,React.createElement('span',{style:{fontWeight:700,color:'var(--green)',fontSize:14}},'₹'+e.net.toLocaleString())),
              React.createElement('td',null,React.createElement('span',{className:'badge '+(e.status==='Active'?'badge-green':'badge-amber')},e.status))
            )
          )),
          React.createElement('tfoot',null,React.createElement('tr',{style:{background:'#12121a'}},
            React.createElement('td',{colSpan:4,style:{padding:'10px 12px',fontWeight:700,color:'var(--accent2)'}},'TOTAL'),
            React.createElement('td',{style:{padding:'10px 12px',fontWeight:700,color:'var(--text)'}},'₹'+realSalaryRows.reduce((s,e)=>s+e.grossAfterLop,0).toLocaleString()),
            React.createElement('td',{colSpan:4}),
            React.createElement('td',{style:{padding:'10px 12px',fontWeight:700,color:'var(--green)',fontSize:14}},
              '₹'+realSalaryRows.reduce((s,e)=>s+e.net,0).toLocaleString()
            ),
            React.createElement('td')
          ))
        )
      ),

      // Attendance report
      activeReport==='attendance'&&React.createElement('div',{className:'table-wrap'},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,['Emp ID','Name','Designation','Present','Absent','Half Day','LOP Days','Working Days','Attendance %'].map(h=>React.createElement('th',{key:h},h)))),
          React.createElement('tbody',null,EMPLOYEES.map(e=>{
            const s=realAttFor(e);
            const p=s.present,a=s.absent,h=s.half,wd=s.daysInMonth-s.off-s.notMarked;
            const pct=wd>0?Math.round(p/wd*100):0;
            return React.createElement('tr',{key:e.id},
              React.createElement('td',null,React.createElement('span',{style:{fontFamily:'monospace',fontSize:11,color:'var(--accent)'}},e.id)),
              React.createElement('td',null,React.createElement('span',{style:{fontWeight:500,color:'var(--text)'}},e.name)),
              React.createElement('td',null,e.desig),
              React.createElement('td',null,React.createElement('span',{style:{color:'var(--green)',fontWeight:500}},p)),
              React.createElement('td',null,React.createElement('span',{style:{color:'var(--red)',fontWeight:500}},a)),
              React.createElement('td',null,React.createElement('span',{style:{color:'var(--accent)',fontWeight:500}},h)),
              React.createElement('td',null,React.createElement('span',{style:{color:'var(--orange)',fontWeight:500}},(a+h*0.5).toFixed(1))),
              React.createElement('td',null,wd),
              React.createElement('td',null,
                React.createElement('div',null,
                  React.createElement('span',{style:{fontWeight:700,color:pct>=90?'var(--green)':pct>=75?'var(--accent)':'var(--red)'}},(pct||0)+'%'),
                  React.createElement('div',{className:'progress',style:{width:80,marginTop:4}},React.createElement('div',{className:'progress-fill',style:{width:pct+'%',background:pct>=90?'var(--green)':pct>=75?'var(--accent)':'var(--red)'}}))
                )
              )
            );
          }))
        )
      ),

      // Incentive report
      activeReport==='incentive'&&React.createElement('div',{className:'table-wrap'},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,['Employee','Total Target','Total Achieved','% Achieved','Total Incentive'].map(h=>React.createElement('th',{key:h},h)))),
          React.createElement('tbody',null,realIncentiveRows.map((r,i)=>{
            const pct=r.totalTarget>0?Math.round(r.totalActual/r.totalTarget*100):null;
            return React.createElement('tr',{key:r.id+'-'+i},
              React.createElement('td',null,React.createElement('span',{style:{fontWeight:500,color:'var(--text)'}},r.name)),
              React.createElement('td',null,r.totalTarget>0?'₹'+r.totalTarget.toLocaleString():'N/A'),
              React.createElement('td',null,r.totalActual>0?'₹'+r.totalActual.toLocaleString():'—'),
              React.createElement('td',null,pct!==null?React.createElement('div',null,React.createElement('span',{style:{fontWeight:600,color:pct>=100?'var(--green)':pct>=80?'var(--accent)':'var(--red)'}},(pct||0)+'%'),React.createElement('div',{className:'progress',style:{width:80,marginTop:4}},React.createElement('div',{className:'progress-fill',style:{width:Math.min(100,pct)+'%',background:pct>=100?'var(--green)':pct>=80?'var(--accent)':'var(--red)'}}))):'—'),
              React.createElement('td',null,React.createElement('span',{style:{fontWeight:700,color:'var(--accent)'}},'₹'+r.totalInc.toLocaleString()))
            );
          }))
        )
      ),

      // Vendor payables
      activeReport==='vendor'&&React.createElement('div',{className:'table-wrap'},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,['Vendor','Category','Contact','Payment Terms','Invoice Amt','Outstanding','Status'].map(h=>React.createElement('th',{key:h},h)))),
          React.createElement('tbody',null,realVendorRows.map((v,i)=>
            React.createElement('tr',{key:v.id+'-'+i},
              React.createElement('td',null,React.createElement('span',{style:{fontWeight:500,color:'var(--text)'}},v.name)),
              React.createElement('td',null,React.createElement('span',{className:'badge badge-blue'},v.cat)),
              React.createElement('td',null,v.contact),React.createElement('td',null,v.terms),
              React.createElement('td',null,'₹'+v.amount.toLocaleString()),
              React.createElement('td',null,React.createElement('span',{style:{color:v.outstanding>0?'var(--red)':'var(--green)',fontWeight:600}},'₹'+v.outstanding.toLocaleString())),
              React.createElement('td',null,React.createElement('span',{className:'badge '+(v.status==='Outstanding'?'badge-amber':'badge-green')},v.status))
            )
          )),
          React.createElement('tfoot',null,React.createElement('tr',{style:{background:'#12121a'}},
            React.createElement('td',{colSpan:4,style:{padding:'10px 12px',fontWeight:700,color:'var(--accent2)'}},'TOTAL OUTSTANDING'),
            React.createElement('td'),
            React.createElement('td',{style:{padding:'10px 12px',fontWeight:700,color:'var(--red)',fontSize:14}},'₹'+realVendorRows.reduce((s,v)=>s+v.outstanding,0).toLocaleString()),
            React.createElement('td')
          ))
        )
      ),

      // Advance register
      activeReport==='advance'&&React.createElement('div',{className:'table-wrap'},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,['ID','Employee','Date','Amount','Reason','Approved By','Monthly Ded.','Outstanding','Status'].map(h=>React.createElement('th',{key:h},h)))),
          React.createElement('tbody',null,realAdvanceRows.map((a,i)=>React.createElement('tr',{key:a.id+'-'+i},
            React.createElement('td',null,React.createElement('span',{style:{fontFamily:'monospace',fontSize:11,color:'var(--accent)'}},a.id)),
            React.createElement('td',null,a.emp),React.createElement('td',null,fmtDMY(a.date)),
            React.createElement('td',null,'₹'+(Number(a.amount)||0).toLocaleString()),
            React.createElement('td',null,a.reason),React.createElement('td',null,a.approvedBy),
            React.createElement('td',null,'₹'+(Number(a.repayment)||0).toLocaleString()),
            React.createElement('td',null,React.createElement('span',{style:{color:(Number(a.outstanding)||0)>0?'var(--red)':'var(--green)',fontWeight:600}},'₹'+(Number(a.outstanding)||0).toLocaleString())),
            React.createElement('td',null,React.createElement('span',{className:'badge '+(a.status==='Active'?'badge-amber':'badge-green')},a.status))
          )))
        )
      ),

      // Penalty register
      activeReport==='penalty'&&React.createElement('div',{className:'table-wrap'},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,['ID','Employee','Date','Type','Amount','Approved By','Month','Remarks'].map(h=>React.createElement('th',{key:h},h)))),
          React.createElement('tbody',null,realPenaltyRows.map((p,i)=>React.createElement('tr',{key:p.id+'-'+i},
            React.createElement('td',null,React.createElement('span',{style:{fontFamily:'monospace',fontSize:11,color:'var(--red)'}},p.id)),
            React.createElement('td',null,p.emp),React.createElement('td',null,fmtDMY(p.date)),
            React.createElement('td',null,React.createElement('span',{className:'badge badge-red'},p.type)),
            React.createElement('td',null,React.createElement('span',{style:{color:'var(--red)',fontWeight:600}},'₹'+(Number(p.amount)||0))),
            React.createElement('td',null,p.approvedBy),React.createElement('td',null,p.month),React.createElement('td',null,p.remarks)
          )))
        )
      ),

      // Compliance
      activeReport==='compliance'&&React.createElement('div',null,
        realComplianceRows.length===0&&React.createElement('div',{style:{textAlign:'center',padding:'30px 20px',color:'var(--text3)',fontSize:12.5}},'No due dates recorded for the selected outlet(s) yet.'),
        realComplianceRows.map((d,i)=>React.createElement('div',{key:(d.id||i)+'-'+i,style:{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'var(--bg3)',borderRadius:'var(--r)',marginBottom:8,borderLeft:'3px solid '+(d.status==='overdue'?'var(--red)':d.status==='soon'?'var(--orange)':d.status==='done'?'var(--border)':'var(--green)')}},
          React.createElement('span',{style:{fontSize:18}},(d.status==='overdue'?'🔴':d.status==='soon'?'🟡':d.status==='done'?'✅':'🟢')),
          React.createElement('div',{style:{flex:1}},
            React.createElement('div',{style:{fontWeight:500,fontSize:13,color:'var(--text)'}},d.type),
            React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},(d.desc||'')+' — '+d.outletName)
          ),
          React.createElement('div',{style:{textAlign:'right'}},
            React.createElement('div',{style:{fontSize:12,fontWeight:600,color:d.status==='overdue'?'var(--red)':d.status==='soon'?'var(--orange)':'var(--text2)'}},fmtDMY(d.due)),
            d.amount>0&&React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},'₹'+Number(d.amount).toLocaleString()),
            React.createElement('span',{className:'badge '+(d.status==='overdue'?'badge-red':d.status==='soon'?'badge-amber':d.status==='done'?'badge-green':'badge-blue'),style:{marginTop:4}},d.status)
          )
        ))
      ),

      // Daily sales — Cash/Card/UPI is the only real revenue breakdown Collection Reco tracks;
      // no real data anywhere splits this by Service/Product/Gift, so that's not fabricated here.
      activeReport==='daily'&&React.createElement('div',{className:'table-wrap'},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,['Date','Cash Sale','Card Sale','UPI Sale','Total Sale'].map(h=>React.createElement('th',{key:h},h)))),
          React.createElement('tbody',null,realCollectionByDate(true).map((r,i)=>React.createElement('tr',{key:i},
            React.createElement('td',null,fmtDMY(r.date)),
            React.createElement('td',null,'₹'+Math.round(r.cash).toLocaleString()),
            React.createElement('td',null,'₹'+Math.round(r.card).toLocaleString()),
            React.createElement('td',null,'₹'+Math.round(r.upi).toLocaleString()),
            React.createElement('td',null,React.createElement('span',{style:{fontWeight:600,color:'var(--text)'}},'₹'+Math.round(r.total).toLocaleString()))
          ))),
          React.createElement('tfoot',null,React.createElement('tr',{style:{background:'#12121a'}},
            React.createElement('td',{style:{padding:'10px 12px',fontWeight:700,color:'var(--accent2)'}},'TOTAL'),
            React.createElement('td',{style:{padding:'10px 12px',fontWeight:700}},'₹'+Math.round(realCollectionByDate(true).reduce((s,r)=>s+r.cash,0)).toLocaleString()),
            React.createElement('td',{style:{padding:'10px 12px',fontWeight:700}},'₹'+Math.round(realCollectionByDate(true).reduce((s,r)=>s+r.card,0)).toLocaleString()),
            React.createElement('td',{style:{padding:'10px 12px',fontWeight:700}},'₹'+Math.round(realCollectionByDate(true).reduce((s,r)=>s+r.upi,0)).toLocaleString()),
            React.createElement('td',{style:{padding:'10px 12px',fontWeight:700,color:'var(--text)'}},'₹'+Math.round(realCollectionByDate(true).reduce((s,r)=>s+r.total,0)).toLocaleString())
          ))
        )
      ),

      // Collection report
      activeReport==='collection'&&React.createElement('div',null,
        React.createElement('div',{className:'grid3',style:{marginBottom:14}},
          [{l:'Total Cash',v:'₹'+Math.round(realCollectionByDate().reduce((s,r)=>s+r.cash,0)).toLocaleString(),c:'amber'},{l:'Total Card',v:'₹'+Math.round(realCollectionByDate().reduce((s,r)=>s+r.card,0)).toLocaleString(),c:'blue'},{l:'Total UPI',v:'₹'+Math.round(realCollectionByDate().reduce((s,r)=>s+r.upi,0)).toLocaleString(),c:'teal'}].map(m=>
            React.createElement('div',{key:m.l,className:'metric-card '+m.c},React.createElement('div',{className:'metric-label'},m.l),React.createElement('div',{className:'metric-value'},m.v))
          )
        ),
        React.createElement('div',{className:'table-wrap'},
          React.createElement('table',null,
            React.createElement('thead',null,React.createElement('tr',null,['Date','Cash','Card','UPI','Total'].map(h=>React.createElement('th',{key:h},h)))),
            React.createElement('tbody',null,realCollectionByDate().map((r,i)=>React.createElement('tr',{key:i},
              React.createElement('td',null,fmtDMY(r.date)),
              React.createElement('td',null,'₹'+Math.round(r.cash).toLocaleString()),React.createElement('td',null,'₹'+Math.round(r.card).toLocaleString()),
              React.createElement('td',null,'₹'+Math.round(r.upi).toLocaleString()),
              React.createElement('td',null,React.createElement('span',{style:{fontWeight:600}},'₹'+Math.round(r.total).toLocaleString()))
            )))
          )
        )
      )
    )
  );
}

// ══════════════════════════════════════════════════════════════════
// BILLING / POS  —  outlet-scoped invoicing module
// ══════════════════════════════════════════════════════════════════
const BILL_SERVICES=[
  {name:'Haircut & Styling',rate:600,type:'Service'},
  {name:'Hair Spa',rate:1500,type:'Service'},
  {name:'Hair Colour (Global)',rate:2800,type:'Service'},
  {name:'Keratin Treatment',rate:4500,type:'Service'},
  {name:'Facial — Gold',rate:1800,type:'Service'},
  {name:'Cleanup',rate:800,type:'Service'},
  {name:'Manicure',rate:500,type:'Service'},
  {name:'Pedicure',rate:700,type:'Service'},
  {name:'Threading (Eyebrow)',rate:80,type:'Service'},
  {name:'Full Arms Waxing',rate:450,type:'Service'},
  {name:'Bridal Makeup',rate:9000,type:'Service'},
  {name:'Head Massage',rate:600,type:'Service'},
];
const BILL_PRODUCTS=[
  {name:'Pro Shampoo 250ml',rate:850,type:'Product'},
  {name:'Hair Serum',rate:1200,type:'Product'},
  {name:'Hair Mask',rate:950,type:'Product'},
  {name:'Nail Polish',rate:350,type:'Product'},
];
const BILL_STAFF=['Meera Joshi','Arjun Singh','Kavya Reddy','Pooja Patel','Deepak Nair'];
const BILL_CUSTOMERS=['Anjali Mehta','Rohan Kapoor','Sneha Iyer','Vikram Rao','Neha Gupta','Aditya Jain','Priyanka Das','Karan Malhotra','Ritu Singh','Farah Khan'];
const GST_PCT=18;

// totals for one invoice
function billCalc(inv){
  const subtotal=(inv.items||[]).reduce((s,it)=>s+(Number(it.qty)||0)*(Number(it.rate)||0),0);
  const disc=Math.min(subtotal,Number(inv.discount)||0);
  const taxable=Math.max(0,subtotal-disc);
  const gst=Math.round(taxable*GST_PCT/100);
  const total=taxable+gst;
  return {subtotal,disc,taxable,gst,total};
}