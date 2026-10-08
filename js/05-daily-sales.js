

function DailySalesSheet({salon,period,onRequestVendorPayment,user}={}){
  const salonId=salon?.id;
  const EMPLOYEES=sortByDesignation(loadEmployees(salon?.id));
  const dseWrapRef=useRef(null);
  const dseCellRange=useExcelCellRange(dseWrapRef);
  // Build 7-day window ending today
  const today=new Date();
  const toISO=(d)=>localIsoOf(d);
  const toLabel=(d)=>{const ds=d.toDateString().split(' ');return ds[2]+'-'+ds[1]+'-'+d.getFullYear().toString().slice(2);};

  const buildDays=(anchor,count)=>{
    const days=[];
    for(let i=count-1;i>=0;i--){const d=new Date(anchor);d.setDate(d.getDate()-i);days.push({iso:toISO(d),label:toLabel(d)});}
    // Only the month chosen in the Period selector is open here — a 5/10-day window early in the
    // month no longer spills back into the previous month's last days.
    const pc=periodToCalendar(period);
    if(!pc)return days;
    const pre=pc.year+'-'+String(pc.month+1).padStart(2,'0')+'-';
    return days.filter(d=>d.iso.startsWith(pre));
  };
  // "Full Month" isn't a fixed count — it's a sentinel meaning "from the 1st of viewDate's month
  // through viewDate", so it always tracks whichever date is picked instead of freezing at
  // whatever day-count happened to be true when it was selected.
  const resolveShowCols=(vd,sc)=>sc==='full'?new Date(vd).getDate():sc;

  // "View up to date" defaults to the outlet's selected Period — specifically, the last day of
  // that period's month — so opening an outlet into (say) June 2026 shows June 2026 here, not
  // whatever today's date happens to be. The one exception: if the selected Period IS the
  // current calendar month, default to today instead, so today's own column is still visible and
  // editable without having to change the date picker — entries can only ever be made against
  // today's actual date (see isToday checks below), so defaulting a *past* period to "today"
  // would show entirely the wrong month, and defaulting the *current* month to its last day would
  // hide today's own editable column behind unnecessary scrolling.
  const periodCal=periodToCalendar(period);
  const isPeriodCurrentMonth=periodCal&&periodCal.year===today.getFullYear()&&periodCal.month===today.getMonth();
  const defaultViewDate=()=>{
    if(!periodCal||isPeriodCurrentMonth)return toISO(today);
    // Deliberately localDateToISO(), not the shadowed toISO() above — see that helper's own
    // comment for why: a UTC round-trip on a local-midnight date silently shifts it back a day
    // in any timezone ahead of UTC, which is exactly why May's last day was showing as the 30th.
    return localDateToISO(new Date(periodCal.year,periodCal.month+1,0));
  };
  const [viewDate,setViewDate]=useState(defaultViewDate);
  useEffect(()=>{setViewDate(defaultViewDate());
    // eslint-disable-next-line
  },[period&&period.mi,period&&period.fy]);
  const [showCols,setShowCols]=useState(5);
  const [pettyOpen,setPettyOpen]=useState(false); // ⚙ Cash limits (js/22-controls.js)

  // Data store: {iso: {rowIdx: value}}. Previously this was pure in-memory state seeded with
  // fake sample numbers — every real entry was lost on reload. Now it's persisted per outlet,
  // same pattern as every other sheet in the app, and starts genuinely blank.
  const dseDataKey=()=>outletKey('salonos_daily_sales_data',salonId);
  const dseEmpDataKey=()=>outletKey('salonos_daily_sales_empdata',salonId);
  const initData=()=>{syncDailyIncentiveToDSE(salonId);try{return JSON.parse(cachedLocalGet(dseDataKey())||'{}');}catch(e){return{};}};
  const [data,setData]=useState(initData);
  useEffect(()=>{safeLocalSet(dseDataKey(),JSON.stringify(data));},[data,salonId]);
  // empData: {iso: {ri: [{empName, amount}]}}  — for employee-linked rows
  const [modalDI,setModalDI]=useState([]); // emp-modal entries that came from Daily Incentive Sheet (read-only here)
  const [empData,setEmpData]=useState(()=>{try{return JSON.parse(cachedLocalGet(dseEmpDataKey())||'{}');}catch(e){return{};}});
  useEffect(()=>{safeLocalSet(dseEmpDataKey(),JSON.stringify(empData));},[empData,salonId]);
  // descData: {iso: {ri: [{description, amount}]}}  — for rows requiring Description + allowing
  // multiple entries per day (see DESC_ROWS below)
  const dseDescDataKey=()=>outletKey('salonos_daily_sales_descdata',salonId);
  const [descData,setDescData]=useState(()=>{try{return JSON.parse(cachedLocalGet(dseDescDataKey())||'{}');}catch(e){return{};}});
  useEffect(()=>{safeLocalSet(dseDescDataKey(),JSON.stringify(descData));},[descData,salonId]);
  // invEntryData: {iso: {ri: [{id, invoiceId, paymentId, amount}]}} — for invoice-gated rows
  // (INVOICE_GATED_EXPENSE_ROWS below). Each entry links a specific day's payment to a specific
  // invoice + payment record over on Vendor Sheet, so more than one invoice can be settled for
  // the same row on the same day, and any entry can be reopened to its full invoice detail later.
  const dseInvDataKey=()=>outletKey('salonos_daily_sales_invoicedata',salonId);
  const [invEntryData,setInvEntryDataRaw]=useState(()=>{try{return JSON.parse(cachedLocalGet(dseInvDataKey())||'{}');}catch(e){return{};}});
  useEffect(()=>{safeLocalSet(dseInvDataKey(),JSON.stringify(invEntryData));},[invEntryData,salonId]);

  // ── Cash Register attachment — attach a scan/photo of the physical cash register for any
  // visible day, right on that day's column header. ──
  const [cashRegFiles,setCashRegFilesState]=useState(()=>loadCashRegisterFiles(salonId));
  useEffect(()=>{setCashRegFilesState(loadCashRegisterFiles(salonId));},[salonId]);
  const {toast:crToast,error:crToastErr}=useToast();
  // record shape: {name, dataUrl, type, size}. Older saves before this fix only ever kept the
  // filename (a plain string) — the picker marked a day "attached" but never actually stored the
  // file's bytes anywhere, so there was nothing to download. Those legacy string entries are still
  // read (shown as attached, but flagged as needing re-upload) so nobody's history disappears.
  const CASHREG_MAX_BYTES=4*1024*1024; // 4MB — generous for a phone photo/scan, safe for localStorage
  const setCashRegFile=(iso,record)=>{
    const next={...cashRegFiles};
    if(record)next[iso]=record;else delete next[iso];
    setCashRegFilesState(next);
    const ok=saveCashRegisterFiles(salonId,next);
    if(!ok){ // quota exceeded — roll back so the UI doesn't claim a save that didn't happen
      setCashRegFilesState(cashRegFiles);
      crToastErr("Couldn't save — browser storage is full. Free up space in Master Settings → Backup & Restore.");
    }
  };
  const handleCashRegFile=(iso,file)=>{
    if(!file)return;
    if(file.size>CASHREG_MAX_BYTES){
      crToastErr('That file is too large (max 4MB) — try a smaller photo or a compressed PDF.');
      return;
    }
    const reader=new FileReader();
    reader.onload=()=>{
      setCashRegFile(iso,{name:file.name,dataUrl:reader.result,type:file.type,size:file.size});
      crToast('Cash Register attached for '+iso+' — checking against the computed Closing Cash Balance…','success');
      // Auto-run the Closing Balance check the moment a register is attached — no separate
      // click needed. The 🔍 icon still lets anyone re-run it manually later if the figure
      // changes (e.g. after correcting an entry for that day).
      verifyCashRegister(iso,{name:file.name,dataUrl:reader.result,type:file.type,size:file.size});
    };
    reader.onerror=()=>crToastErr("Couldn't read that file — please try again.");
    reader.readAsDataURL(file);
  };
  const downloadCashRegFile=(iso)=>{
    const rec=cashRegFiles[iso];
    if(!rec)return;
    if(typeof rec==='string'||!rec.dataUrl){
      crToastErr('This attachment was saved by an older version and its file was never actually stored — please remove it and re-attach the file to enable download.');
      return;
    }
    if(isStoredFileRef(rec.dataUrl)){openStoredFile(rec.dataUrl,rec.name||('cash-register-'+iso));return;}
    const a=document.createElement('a');
    a.href=rec.dataUrl;a.download=rec.name||('cash-register-'+iso);
    document.body.appendChild(a);a.click();document.body.removeChild(a);
  };

  // ── Cash Register OCR check — reads the Closing Balance figure off the attached photo/PDF for
  // a given day and compares it with this app's own computed Closing Cash Balance for that same
  // day. Popped up in a modal, highlighted red if the register shows less cash than the books
  // say it should (a deficiency/shortage). ──
  const [ocrBusyIso,setOcrBusyIso]=useState(null);
  const [ocrResult,setOcrResult]=useState(null); // {iso,text,value,computed,diff,status} | null
  const verifyCashRegister=async(iso,recOverride)=>{
    const rec=recOverride||cashRegFiles[iso];
    if(!rec||typeof rec==='string'||!rec.dataUrl){crToastErr('Attach a photo or PDF of the register for this day first.');return;}
    setOcrBusyIso(iso);
    try{
      const{text,value}=await ocrReadClosingBalance(rec);
      const computed=closingBalanceFor(iso);
      if(value==null){
        setOcrResult({iso,text,value:null,computed,status:'unread'});
      }else{
        const diff=Math.round(computed)-Math.round(value); // positive = register shows LESS than books (a shortage)
        setOcrResult({iso,text,value,computed,diff,status:diff>1?'deficiency':(diff<-1?'excess':'match')});
      }
    }catch(err){
      crToastErr(err.message||'Could not read that file.');
    }
    setOcrBusyIso(null);
  };

  // ── Daily Sales & Collection — sits below Final Total Exp. Six sale streams plus the cash
  // handling chain, entered per day same as the expense grid above. Total Daily Sale, Total
  // Collection, Opening Cash Balance and Closing Cash Balance are computed live from the other
  // rows, not entered directly — Opening Cash Balance is the one exception: it's only editable
  // on the very first day ever recorded (nothing to carry forward from yet), and after that it
  // always equals the previous recorded day's Closing Cash Balance, making this a genuine
  // running day-to-day cash register, not just a same-day snapshot.
  // Closing Cash Balance = Opening Cash Balance + Cash Sale + Outstanding Recovery (Cash-mode
  // entries only — Card/UPI/Luzo/Bank Transfer recoveries never touched the drawer) + Cash
  // Received − Cash Packet − Cash Handover − Bank Deposit − Final Total Exp. (that day's full
  // expense total from the grid above — every rupee spent that day comes straight out of the
  // cash register). Outstanding Sale never appears in this formula: it's a sale made on credit,
  // not a cash movement, until it's actually recovered.
  // Cash Sale is entered here — Collection Reco's "Cash As Per Counter Report" reads this same
  // stored value instead of being entered separately there, so the two can't drift apart.
  const SALES_ROWS=[
    {name:'Cash Sale',type:'input'},
    {name:'Card Sale',type:'input'},
    {name:'UPI Sale',type:'input'},
    {name:'Luzo Sale',type:'input'},
    {name:'Outstanding Sale',type:'input'},
    {name:'Outstanding Recovery',type:'input'},
    {name:'Total Daily Sale',type:'computed'},
    {name:'Total Collection',type:'computed'},
    {name:'Opening Cash Balance',type:'opening'},
    {name:'Cash Packet',type:'input'},
    {name:'Cash Handover',type:'input'},
    {name:'Bank Deposit',type:'input'},
    {name:'Cash Received',type:'input'},
    {name:'Closing Cash Balance',type:'computed'},
    // Restaurant outlets only — stored after the rest (rows are saved by position) and shown right
    // after UPI Sale. Delivery / booking-app sales, settled later by the platform's payout.
    {name:'Swiggy Sale',type:'input',biz:'restaurant',note:'excl. GST — food value from the app’s order report'},
    {name:'Zomato Sale',type:'input',biz:'restaurant',note:'excl. GST — food value from the app’s order report'},
    {name:'EazyDiner Sale',type:'input',biz:'restaurant',note:'excl. GST — food value from the app’s order report'},
    // Cash actually counted at closing, and its difference from the book Closing Cash Balance —
    // a difference over the outlet's limit asks for a reason (js/20-ops.js recordCashCount).
    {name:'Physical Cash Count',type:'input',note:'cash counted in the drawer at closing'},
    {name:'Cash Difference',type:'computed',note:'counted − Closing Cash Balance'},
    // More restaurant apps — stored at the end (rows are saved by position), shown after EazyDiner.
    {name:'Ownly Sale',type:'input',biz:'restaurant',note:'excl. GST — food value from the app’s order report'},
    {name:'Eatby Minutes Sale',type:'input',biz:'restaurant',note:'excl. GST — food value from the app’s order report'},
  ];
  const IDX_CASH=0,IDX_CARD=1,IDX_UPI=2,IDX_LUZO=3,IDX_OSALE=4,IDX_OREC=5,IDX_TDS=6,IDX_TCOLL=7,IDX_OPENING=8,IDX_PACKET=9,IDX_HANDOVER=10,IDX_DEPOSIT=11,IDX_RECEIVED=12,IDX_DRAWER=13,IDX_SWIGGY=14,IDX_ZOMATO=15,IDX_EAZY=16,IDX_COUNT=17,IDX_CASHDIFF=18,IDX_OWNLY=19,IDX_EBM=20;
  // Display order — restaurants: the three app rows after UPI Sale, no Luzo; salons: as before.
  const SALES_ORDER=isRestaurantOutlet(salonId)?[0,1,2,IDX_SWIGGY,IDX_ZOMATO,IDX_EAZY,IDX_OWNLY,IDX_EBM,4,5,6,7,8,9,10,11,12,13,IDX_COUNT,IDX_CASHDIFF]:SALES_ROWS.map((r,i)=>i).filter(i=>!SALES_ROWS[i].biz);
  const appSalesAt=iso=>numSalesAt(iso,IDX_SWIGGY)+numSalesAt(iso,IDX_ZOMATO)+numSalesAt(iso,IDX_EAZY)+numSalesAt(iso,IDX_OWNLY)+numSalesAt(iso,IDX_EBM);
  // Rows that always require specific fields per entry (not just an amount), and allow more than
  // one entry per day — same "click cell → modal → list of lines" pattern used elsewhere in this
  // sheet, keyed here by row index since Daily Sales & Collection's rows are fixed and indexed.
  const SALES_ENTRY_FIELDS={
    [IDX_OSALE]:[{key:'invoiceNo',label:'Invoice No',type:'text'},{key:'personName',label:'Person Name',type:'text'}],
    [IDX_OREC]:[{key:'invoiceNo',label:'Invoice No',type:'invoiceSelect'},{key:'mode',label:'Mode of Payment',type:'select',options:['Cash','Card','UPI','Luzo','Bank Transfer']}],
    [IDX_RECEIVED]:[{key:'fromName',label:'Received From',type:'text'}],
    [IDX_HANDOVER]:[{key:'toName',label:'Handed Over To',type:'text'}],
  };
  const isSalesEntryRow=(sri)=>!!SALES_ENTRY_FIELDS[sri];
  const salesDataKey=()=>outletKey('salonos_daily_sales_collection_data',salonId);
  const [salesData,setSalesData]=useState(()=>{try{return JSON.parse(cachedLocalGet(salesDataKey())||'{}');}catch(e){return{};}});
  useEffect(()=>{safeLocalSet(salesDataKey(),JSON.stringify(salesData));},[salesData,salonId]);
  // salesEntryData: {iso: {sri: [entry...]}} — the required-field breakdown behind Outstanding
  // Sale / Outstanding Recovery / Cash Received / Cash Handover. salesData[iso][sri] still holds
  // the plain aggregate total (kept in sync on every save here) so everything that already reads
  // salesData — Total Daily Sale, Total Collection, Closing Cash Balance, exports — keeps working
  // unchanged; this is purely the extra breakdown those four rows now require.
  const salesEntryDataKey=()=>outletKey('salonos_daily_sales_collection_entrydata',salonId);
  const [salesEntryData,setSalesEntryData]=useState(()=>{try{return JSON.parse(cachedLocalGet(salesEntryDataKey())||'{}');}catch(e){return{};}});
  useEffect(()=>{safeLocalSet(salesEntryDataKey(),JSON.stringify(salesEntryData));},[salesEntryData,salonId]);
  const getSalesValue=(iso,ri)=>(salesData[iso]&&salesData[iso][ri]!=null)?salesData[iso][ri]:'';
  const setSalesValue=(iso,ri,val)=>{
    // Final checkpoint against a negative Closing Cash Balance, right at the point of writing —
    // not just in the callers above (guardedSetSalesValue, saveSalesEntryModal). Those still exist
    // to give an immediate, specific toast before the write is even attempted, but this is the one
    // check that can never be skipped no matter which path led here, present or future.
    // IDX_OREC excluded deliberately — see note above CASH_AFFECTING_ROWS below.
    if(CASH_AFFECTING_ROWS.has(ri)&&ri!==IDX_OREC){
      const n=val===''||val===null?0:Number(val);
      if(!isNaN(n)){
        const sim=simulateClosingChainNegative(iso,ri,n);
        if(sim.negative){
          dseSalesToastErr('That would take Closing Cash Balance on '+sim.iso+' negative (₹'+Math.round(sim.amount).toLocaleString('en-IN')+') — entry blocked.');
          return;
        }
      }
    }
    setSalesData(prev=>{
      const next={...prev};
      if(!next[iso])next[iso]={};
      const n=Number(val);
      if(val===''||val===null){const nd={...next[iso]};delete nd[ri];next[iso]=nd;}
      else next[iso]={...next[iso],[ri]:isNaN(n)?0:n};
      return next;
    });
    if(ri===IDX_COUNT){const closing=closingBalanceFor(iso);setTimeout(()=>recordCashCount(salonId,iso,val===''||val===null?'':Number(val),closing),0);}
  };
  const numSalesAt=(iso,ri)=>Number(getSalesValue(iso,ri))||0;
  // Entry breakdown helpers for the four required-field rows above.
  const getSalesEntries=(iso,sri)=>(salesEntryData[iso]&&salesEntryData[iso][sri])||[];
  const getSalesEntryTotal=(iso,sri)=>getSalesEntries(iso,sri).reduce((s,e)=>s+Number(e.amount||0),0);
  // Every Outstanding Sale invoice (across every day, not just the one being viewed) that still
  // has an unrecovered balance — i.e. total sold on that invoice minus whatever's already been
  // logged against it under Outstanding Recovery. Feeds Outstanding Recovery's Invoice No
  // dropdown, so a recovery can only ever be booked against a real, still-outstanding invoice.
  const outstandingSaleInvoices=()=>{
    const sold={}; // invoiceNo -> {personName, total}
    Object.keys(salesEntryData).forEach(iso=>{
      (salesEntryData[iso][IDX_OSALE]||[]).forEach(e=>{
        const inv=String(e.invoiceNo||'').trim();
        if(!inv)return;
        if(!sold[inv])sold[inv]={personName:e.personName||'',total:0};
        sold[inv].total+=Number(e.amount)||0;
      });
    });
    const recovered={}; // invoiceNo -> total already recovered
    Object.keys(salesEntryData).forEach(iso=>{
      (salesEntryData[iso][IDX_OREC]||[]).forEach(e=>{
        const inv=String(e.invoiceNo||'').trim();
        if(!inv)return;
        recovered[inv]=(recovered[inv]||0)+(Number(e.amount)||0);
      });
    });
    return Object.keys(sold)
      .map(inv=>({invoiceNo:inv,personName:sold[inv].personName,remaining:sold[inv].total-(recovered[inv]||0)}))
      .filter(x=>x.remaining>0)
      .sort((a,b)=>a.invoiceNo.localeCompare(b.invoiceNo));
  };
  const saleTotalForInvoice=(invoiceNo)=>{
    let total=0;
    Object.keys(salesEntryData).forEach(iso=>{
      (salesEntryData[iso][IDX_OSALE]||[]).forEach(e=>{if(String(e.invoiceNo||'').trim()===invoiceNo)total+=Number(e.amount)||0;});
    });
    return total;
  };
  // Already-recovered total for one invoice, excluding whichever day is currently open in the
  // Outstanding Recovery modal — that day's saved entries are about to be replaced wholesale by
  // whatever's in the modal right now, so counting them here too as well as in the modal
  // session's own entries below would double-count them.
  const recoveredForInvoiceExcludingIso=(invoiceNo,excludeIso)=>{
    let total=0;
    Object.keys(salesEntryData).forEach(iso=>{
      if(iso===excludeIso)return;
      (salesEntryData[iso][IDX_OREC]||[]).forEach(e=>{if(String(e.invoiceNo||'').trim()===invoiceNo)total+=Number(e.amount)||0;});
    });
    return total;
  };
  const dueRemainingForInvoice=(invoiceNo,excludeIso)=>saleTotalForInvoice(invoiceNo)-recoveredForInvoiceExcludingIso(invoiceNo,excludeIso);
  // Shared by the inline warning text under each Outstanding Recovery row and the pop-up toast
  // fired when the Amount field is left — same "is this over the real due amount" check, one
  // definition so the two can never drift out of sync with each other.
  const overDueWarningFor=(entry,allEntries,iso)=>{
    if(!entry.invoiceNo||!(Number(entry.amount)>0))return null;
    const sameInvoiceTotal=allEntries.filter(e=>e.invoiceNo===entry.invoiceNo).reduce((s,e)=>s+(Number(e.amount)||0),0);
    const due=dueRemainingForInvoice(entry.invoiceNo,iso);
    if(sameInvoiceTotal<=due)return null;
    return{invoiceNo:entry.invoiceNo,entered:sameInvoiceTotal,due:Math.max(0,due)};
  };
  // The Cash-mode-only slice of Outstanding Recovery — the rest (Card/UPI/Luzo/Bank Transfer)
  // never touched the physical cash drawer, so only this portion belongs in Closing Cash Balance.
  const cashOutstandingRecoveryAt=(iso)=>getSalesEntries(iso,IDX_OREC).filter(e=>e.mode==='Cash').reduce((s,e)=>s+(Number(e.amount)||0),0);
  // The most recent date with any real cash-register entries strictly before the given date —
  // ISO date strings ("YYYY-MM-DD") sort correctly as plain strings, so this is a cheap lookup.
  const priorCashRegisterDate=(iso)=>{
    const dates=Object.keys(salesData).filter(d=>d<iso&&salesData[d]&&Object.keys(salesData[d]).length>0);
    return dates.length?dates.sort()[dates.length-1]:null;
  };
  const isFirstEverCashDay=(iso)=>priorCashRegisterDate(iso)===null;
  const _closingBalanceCache={}; // per-render memo — without this, each cell can recurse back through every day of history ever entered
  // Closing Cash Balance = Opening Cash Balance + Cash Sale + Outstanding Recovery (Cash-mode
  // entries only) + Cash Received − Cash Packet − Cash Handover − Bank Deposit − Final Total Exp.
  // (that day's full expense total, the same running figure shown in the "Final Total Exp." row
  // above this section — every rupee spent that day comes straight out of the cash register).
  const closingBalanceFor=(iso)=>{
    if(_closingBalanceCache[iso]!==undefined)return _closingBalanceCache[iso];
    const val=openingBalanceFor(iso)+numSalesAt(iso,IDX_CASH)+cashOutstandingRecoveryAt(iso)+numSalesAt(iso,IDX_RECEIVED)-numSalesAt(iso,IDX_PACKET)-numSalesAt(iso,IDX_HANDOVER)-numSalesAt(iso,IDX_DEPOSIT)-dayTotal(iso);
    _closingBalanceCache[iso]=val;
    return val;
  };
  const openingBalanceFor=(iso)=>{
    const prev=priorCashRegisterDate(iso);
    if(prev)return closingBalanceFor(prev);
    return numSalesAt(iso,IDX_OPENING); // very first recorded day — manually entered starting float
  };
  const computedSalesValue=(iso,ri)=>{
    if(ri===IDX_TDS)return numSalesAt(iso,IDX_CASH)+numSalesAt(iso,IDX_CARD)+numSalesAt(iso,IDX_UPI)+numSalesAt(iso,IDX_LUZO)+appSalesAt(iso)+numSalesAt(iso,IDX_OSALE);
    if(ri===IDX_TCOLL)return numSalesAt(iso,IDX_CASH)+numSalesAt(iso,IDX_CARD)+numSalesAt(iso,IDX_UPI)+numSalesAt(iso,IDX_LUZO)+appSalesAt(iso)+numSalesAt(iso,IDX_OREC);
    if(ri===IDX_DRAWER)return closingBalanceFor(iso);
    if(ri===IDX_CASHDIFF){const c=getSalesValue(iso,IDX_COUNT);return c===''?0:Number(c)-closingBalanceFor(iso);}
    return 0;
  };
  // ── Hard rule: no entry may ever push Closing Cash Balance negative, on the day it's entered
  // or on any later day — because that day's Closing Balance is next day's Opening Balance, an
  // edit to today can push a future day negative even if today itself looks fine. This walks
  // forward from the changed day through every day that already has real cash-register entries,
  // recomputing each day's Closing Balance in order with the ONE proposed change substituted in,
  // and reports the first day (if any) where it would go negative. Pure — reads live state but
  // never writes it, so it's safe to call before deciding whether to commit an edit.
  const CASH_AFFECTING_ROWS=new Set([IDX_CASH,IDX_OREC,IDX_RECEIVED,IDX_PACKET,IDX_HANDOVER,IDX_DEPOSIT,IDX_OPENING]);
  const simulateClosingChainNegative=(changedIso,changedSri,newVal)=>{
    if(!CASH_AFFECTING_ROWS.has(changedSri))return{negative:false};
    const dataDates=Object.keys(salesData).filter(d=>salesData[d]&&Object.keys(salesData[d]).length>0);
    const entryDates=Object.keys(salesEntryData).filter(d=>salesEntryData[d]&&Object.keys(salesEntryData[d]).length>0);
    // A day with real expense entries but no sales-register activity still has to be walked
    // through the chain — its Final Total Exp. still eats into the running cash balance even
    // if nothing else happened that day.
    const expenseDates=Object.keys(data).filter(d=>data[d]&&Object.keys(data[d]).length>0);
    const affectedDates=[...new Set([...dataDates,...entryDates,...expenseDates,changedIso])].filter(d=>d>=changedIso).sort();
    const priorReal=priorCashRegisterDate(changedIso);
    let runningOpening=priorReal?closingBalanceFor(priorReal):numSalesAt(changedIso,IDX_OPENING);
    if(changedSri===IDX_OPENING)runningOpening=newVal;
    for(const d of affectedDates){
      const at=(sri,fallback)=>(d===changedIso&&sri===changedSri)?newVal:fallback;
      const cashSale=at(IDX_CASH,numSalesAt(d,IDX_CASH));
      const cashRecovery=at(IDX_OREC,cashOutstandingRecoveryAt(d));
      const cashReceived=at(IDX_RECEIVED,numSalesAt(d,IDX_RECEIVED));
      const packet=at(IDX_PACKET,numSalesAt(d,IDX_PACKET));
      const handover=at(IDX_HANDOVER,numSalesAt(d,IDX_HANDOVER));
      const deposit=at(IDX_DEPOSIT,numSalesAt(d,IDX_DEPOSIT));
      const closing=runningOpening+cashSale+cashRecovery+cashReceived-packet-handover-deposit-dayTotal(d);
      if(closing<0)return{negative:true,iso:d,amount:closing};
      runningOpening=closing;
    }
    return{negative:false};
  };
  // Same cascade as above, but for the OTHER thing that can push Closing Balance negative: an
  // expense entry itself (Final Total Exp. is now part of the formula). Previously only the
  // cash-flow rows above were guarded — an expense could be saved with no warning even if it
  // alone put the day, or a later day, into the red. This closes that gap the same way: walk
  // forward from the changed day with the ONE day's Final Total Exp. substituted for its new
  // value, and report the first day (if any) that would go negative.
  const simulateExpenseChangeNegative=(changedIso,newDayTotal)=>{
    const dataDates=Object.keys(salesData).filter(d=>salesData[d]&&Object.keys(salesData[d]).length>0);
    const entryDates=Object.keys(salesEntryData).filter(d=>salesEntryData[d]&&Object.keys(salesEntryData[d]).length>0);
    const expenseDates=Object.keys(data).filter(d=>data[d]&&Object.keys(data[d]).length>0);
    const affectedDates=[...new Set([...dataDates,...entryDates,...expenseDates,changedIso])].filter(d=>d>=changedIso).sort();
    const priorReal=priorCashRegisterDate(changedIso);
    let runningOpening=priorReal?closingBalanceFor(priorReal):numSalesAt(changedIso,IDX_OPENING);
    for(const d of affectedDates){
      const expTotal=d===changedIso?newDayTotal:dayTotal(d);
      const closing=runningOpening+numSalesAt(d,IDX_CASH)+cashOutstandingRecoveryAt(d)+numSalesAt(d,IDX_RECEIVED)-numSalesAt(d,IDX_PACKET)-numSalesAt(d,IDX_HANDOVER)-numSalesAt(d,IDX_DEPOSIT)-expTotal;
      if(closing<0)return{negative:true,iso:d,amount:closing};
      runningOpening=closing;
    }
    return{negative:false};
  };
  // Checks a proposed new value for one EXPENSE_ROWS row on one day — computes what that day's
  // Final Total Exp. would become (existing total, minus this row's old contribution, plus the
  // new one) and runs it through the cascade above. Returns the same {negative,iso,amount} shape
  // as simulateClosingChainNegative, and the same toast message is used by every call site.
  const wouldExpenseEntryGoNegative=(iso,ri,newRowValue)=>{
    const oldRowValue=Number((data[iso]&&data[iso][ri])||0);
    const sign=EXPENSE_ROWS[ri]?.name==='Penalties'?-1:1;
    const newDayTotal=dayTotal(iso)-sign*oldRowValue+sign*(Number(newRowValue)||0);
    return simulateExpenseChangeNegative(iso,newDayTotal);
  };
  const blockIfExpenseGoesNegative=(iso,ri,newRowValue)=>{
    const sim=wouldExpenseEntryGoNegative(iso,ri,newRowValue);
    if(sim.negative){
      dseSalesToastErr('That would take Closing Cash Balance on '+sim.iso+' negative (₹'+Math.round(sim.amount).toLocaleString('en-IN')+') — entry blocked.');
      return true;
    }
    return false;
  };
  // (Cash Sale, Cash Packet, Bank Deposit, and the day-1 Opening Cash Balance) — blocks the
  // change entirely rather than saving it and letting the balance go red.
  const guardedSetSalesValue=(iso,sri,rawVal)=>{
    const n=rawVal===''?0:Number(rawVal);
    if(CASH_AFFECTING_ROWS.has(sri)&&!isNaN(n)){
      const sim=simulateClosingChainNegative(iso,sri,n);
      if(sim.negative){
        dseSalesToastErr('That would take Closing Cash Balance on '+sim.iso+' negative (₹'+Math.round(sim.amount).toLocaleString('en-IN')+') — entry blocked.');
        return;
      }
    }
    setSalesValue(iso,sri,rawVal);
  };
  const salesValueAt=(iso,ri)=>{
    if(SALES_ROWS[ri].type==='computed')return computedSalesValue(iso,ri);
    if(ri===IDX_OPENING)return openingBalanceFor(iso);
    return numSalesAt(iso,ri);
  };
  // Balances aren't summed: Opening Cash Balance shows the first visible day's opening, Closing
  // Cash Balance the last visible day's closing.
  const salesRowTotal=(ri)=>{
    if(!days.length)return 0;
    if(ri===IDX_OPENING)return salesValueAt(days[0].iso,ri);
    if(SALES_ROWS[ri].name==='Closing Cash Balance')return salesValueAt(days[days.length-1].iso,ri);
    return days.reduce((s,d)=>s+salesValueAt(d.iso,ri),0);
  };
  const [saveMsg,setSaveMsg]=useState('');
  // Monthly & Comparative Summary modal — same ExpensesSummaryReport used under Reports and the
  // Dashboard, opened inline here since this screen's actual data is what it's summarizing.
  const [showSummaryModal,setShowSummaryModal]=useState(false);

  // ── Sales-entry modal (Outstanding Sale / Outstanding Recovery / Cash Received / Cash
  // Handover) — same "click cell → modal → multiple required-field lines" pattern as the
  // employee/description modals above. ──
  const [salesEntryModal,setSalesEntryModal]=useState(null); // {sri,iso} | null
  const [modalSalesEntries,setModalSalesEntries]=useState([]);
  const {toast:dseSalesToast,error:dseSalesToastErr,warn:dseSalesToastWarn}=useToast();
  const blankSalesEntry=(sri)=>{
    const blank={amount:''};
    (SALES_ENTRY_FIELDS[sri]||[]).forEach(f=>{blank[f.key]=f.type==='select'?f.options[0]:'';});
    return blank;
  };
  const openSalesEntryModal=(sri,iso)=>{
    const existing=getSalesEntries(iso,sri);
    setModalSalesEntries(existing.length>0?existing.map(e=>({...e})):[blankSalesEntry(sri)]);
    setSalesEntryModal({sri,iso});
  };
  const addSalesEntryModalRow=()=>setModalSalesEntries(p=>[...p,blankSalesEntry(salesEntryModal?.sri)]);
  const removeSalesEntryModalRow=(i)=>{if(confirm('Remove this entry?'))setModalSalesEntries(p=>p.filter((_,idx)=>idx!==i));};
  const updateSalesEntryModalRow=(i,k,v)=>setModalSalesEntries(p=>p.map((r,idx)=>idx===i?{...r,[k]:v}:r));
  const saveSalesEntryModal=()=>{
    const sri=salesEntryModal.sri;const iso=salesEntryModal.iso;
    const fields=SALES_ENTRY_FIELDS[sri]||[];
    const withAmount=modalSalesEntries.filter(e=>Number(e.amount)>0);
    // Every field is required on every entry that has an amount — same "don't silently drop
    // it" reasoning as the expense Description rows: a missing Invoice No or name on a real cash
    // movement is exactly the kind of gap that's a nightmare to reconstruct later.
    const missingField=withAmount.some(e=>fields.some(f=>!String(e[f.key]||'').trim()));
    if(missingField){
      dseSalesToastErr('Every entry with an amount needs '+fields.map(f=>f.label).join(' and ')+' filled in before saving.');
      return;
    }
    const valid=withAmount.filter(e=>fields.every(f=>String(e[f.key]||'').trim()));
    const total=valid.reduce((s,e)=>s+Number(e.amount),0);
    // Cash Received and Cash Handover count in full; Outstanding Sale never touches the cash
    // formula at all; Outstanding Recovery only counts the Cash-mode entries specifically.
    if(CASH_AFFECTING_ROWS.has(sri)){
      const cashPortion=sri===IDX_OREC?valid.filter(e=>e.mode==='Cash').reduce((s,e)=>s+Number(e.amount),0):total;
      const sim=simulateClosingChainNegative(iso,sri,cashPortion);
      if(sim.negative){
        dseSalesToastErr('That would take Closing Cash Balance on '+sim.iso+' negative (₹'+Math.round(sim.amount).toLocaleString('en-IN')+') — entry blocked.');
        return;
      }
    }
    setSalesEntryData(prev=>{
      const next={...prev};
      if(!next[iso])next[iso]={};
      if(valid.length===0){const nd={...next[iso]};delete nd[sri];next[iso]=nd;}
      else next[iso]={...next[iso],[sri]:valid};
      return next;
    });
    setSalesValue(iso,sri,total>0?total:'');
    setSalesEntryModal(null);
  };
  const getSalesEntryLabel=(sri,entries)=>{
    const fields=SALES_ENTRY_FIELDS[sri]||[];
    if(entries.length===0)return'';
    if(entries.length===1){
      const primary=fields[fields.length-1]; // invoiceNo/personName/mode/fromName/toName — last field reads best as the summary
      return String(entries[0][primary?.key]||'')||'1 entry';
    }
    return entries.length+' entries';
  };

  // ── Employee-name popup modal state ──
  const [empModal,setEmpModal]=useState(null);
  // empModal = {ri, iso} | null
  const [modalEntries,setModalEntries]=useState([]); // [{empName:'',amount:''}]
  const [modalSearch,setModalSearch]=useState('');

  // Rows that need employee name entry
  const EMP_ROWS=new Set([
    'Membership Commission/Incentives',
    'Product Commission/Incentives',
    'Service Commission/Incentives',
    'Target Commission/Incentives',
    'Advance To Employees',
    'Previous Month Salary',
    'Previous Month Incentive',
    'Tip To Employee',
    'Penalties',
    'Staff Over Time',
  ]);
  // Rows where only employees with OUTSTANDING salary/incentive should show
  const OUTSTANDING_ROWS=new Set(['Previous Month Salary','Previous Month Incentive']);
  // Rows that also capture a Mode of Payment per entry — these are always cash-in-hand-style
  // payouts made directly to an employee on the day, so unlike a salary/advance disbursed through
  // the bank, it's worth knowing at a glance whether each one went out as Cash, UPI, or Bank
  // Transfer. Kept to just these two for now since they're the ones surfaced on their own linked
  // read-only screens (Daily Incentive → Tip to Employee / Staff Overtime).
  const PAYMENT_MODE_ROWS=new Set(['Tip To Employee','Staff Over Time']);
  const PAYMENT_MODE_OPTIONS=['Cash','UPI','Bank Transfer'];

  // Rows that always require a Description per entry, and allow more than one entry per day
  // (e.g. two separate Conveyance trips, or Stationary bought twice in one day) — same
  // "click the cell → modal → multiple lines" pattern as the employee-linked rows above, just
  // keyed by a free-text Description instead of an employee name.
  const DESC_ROWS=new Set([
    'Pentry Expenses','Water Expenses','Conveyance Expenses','Stationary','Pooja Expenses',
    'Festival/Event Celebration Expenses','Donation','Staff Refreshment','Diesel Expenses',
    'Repair & Maintenance','Electric Work','Accessories','Tanker Cleaning','Miscellaneous Expenses',
    'Cleaning Supplies','Marketing Expenses','Cosmetics & Stock Local','Store Items','Client Food',
    'Bank Charges','Unregistered Purchase'
  ]);

  // Previous Month Salary/Incentive settle a genuine PAST due, so both of these need to look at
  // the calendar month immediately BEFORE the day this entry is being made on (not whatever
  // period/month Daily Sales & Exp happens to be showing right now) — an entry made on 27-Jul
  // settles June's due, regardless of which month is currently in view. Someone who has since
  // left could still be owed money from before they left, so status alone doesn't exclude them —
  // but someone already marked Paid for that previous month, or who has nothing computed for it
  // at all (e.g. joined after that month, or excluded from Incentive Working), correctly doesn't
  // show up here anymore. Every other employee-linked row (Advance, Commission, Tip, Overtime) is
  // a forward-looking new transaction, so only currently active employees are selectable there.
  const prevMonthOfIso=(iso)=>{
    const p=String(iso||'').split('-');
    if(p.length!==3)return null;
    const d=new Date(Number(p[0]),Number(p[1])-1,1);
    d.setMonth(d.getMonth()-1);
    return{year:d.getFullYear(),month:d.getMonth()};
  };
  // Reference figure shown next to each employee's name on outstanding rows — a helpful number to
  // work from, not a tracked ledger balance (this app doesn't carry a running paid-vs-due balance
  // across months). Both now look up the PREVIOUS month's actual computed figure — Previous Month
  // Salary from Salary Working's own Net Salary, Previous Month Incentive from Incentive Working's
  // own Total Incentive — for the month before the entry's date, not the current one.
  const referenceAmountFor=(e,rowName,iso)=>{
    const pm=prevMonthOfIso(iso);
    if(!pm)return 0;
    if(rowName==='Previous Month Incentive'){
      const inc=incWorkingsFor(salonId,pm.year,pm.month).find(x=>x.id===e.id);
      return inc?inc.totalInc:0;
    }
    if(rowName==='Previous Month Salary'){
      const sw=swWorkingsFor(salonId,pm.year,pm.month).find(x=>x.id===e.id);
      return sw?sw.net:0;
    }
    return Number(e.gross)||0;
  };
  // Already paid to this employee for the same previous month through this row on OTHER dates
  // (e.g. part on the 2nd, the rest on the 5th) — so the balance, not the full figure, is payable.
  const prevMonthPaidElsewhere=(rowName,iso,empName)=>{
    const pm=prevMonthOfIso(iso);if(!pm)return 0;
    const ri=EXPENSE_ROWS.findIndex(r=>r.name===rowName);if(ri<0)return 0;
    let t=0;
    Object.keys(empData).forEach(d=>{if(d===iso)return;const p=prevMonthOfIso(d);if(!p||p.year!==pm.year||p.month!==pm.month)return;
      ((empData[d]||{})[ri]||[]).forEach(e=>{if(e&&e.empName===empName)t+=Number(e.amount)||0;});});
    return t;
  };
  const prevMonthBalanceFor=(e,rowName,iso)=>Math.max(0,Math.round(referenceAmountFor(e,rowName,iso)-prevMonthPaidElsewhere(rowName,iso,e.name)));
  const getOutstandingEmployees=(rowName,iso)=>{
    if(!OUTSTANDING_ROWS.has(rowName))return EMPLOYEES.filter(e=>e.status==='Active');
    const pm=prevMonthOfIso(iso);
    if(!pm)return[];
    // Only surface anyone here once that previous month's own sheet is actually locked — while
    // it's still open, Salary/Incentive Working figures (and who's even Approved/Paid) can still
    // change, so there's nothing final yet worth settling as a "Previous Month" catch-up entry.
    const monthLocked=rowName==='Previous Month Salary'
      ?isMonthLockedFor(salonId,pm.year,pm.month)
      :isIWEffectiveLockedFor(salonId,pm.year,pm.month);
    if(!monthLocked)return[];
    const metaStore=rowName==='Previous Month Salary'?loadSWMeta(salonId):loadIWMeta(salonId);
    return EMPLOYEES.filter(e=>{
      const rec=metaStore[attMonthKey(e.id,pm.year,pm.month)];
      if(rec&&rec.paymentStatus==='Paid')return false; // already settled for that month
      return referenceAmountFor(e,rowName,iso)>0; // and there's actually something computed to owe
    });
  };
  const isPrevMonthLockedFor=(rowName,iso)=>{
    const pm=prevMonthOfIso(iso);
    if(!pm)return false;
    return rowName==='Previous Month Salary'?isMonthLockedFor(salonId,pm.year,pm.month):isIWEffectiveLockedFor(salonId,pm.year,pm.month);
  };

  const days=buildDays(new Date(viewDate),resolveShowCols(viewDate,showCols));
  const todayISO=toISO(today);

  const isEmpRow=(ri)=>EMP_ROWS.has(EXPENSE_ROWS[ri]?.name);
  const isOutstandingRow=(ri)=>OUTSTANDING_ROWS.has(EXPENSE_ROWS[ri]?.name);

  const getValue=(iso,ri)=>(data[iso]&&data[iso][ri]!=null)?data[iso][ri]:'';
  // ── Month Lock — Daily Sales & Exp. is a rolling day-by-day sheet (no single month picker),
  // so locking is checked per calendar day: parse the day's own ISO date into year/month and
  // look that up against the same per-outlet lock store Attendance/Salary Working use. ──
  // ── Manager Final Month — a self-lock the outlet Manager sets once a WHOLE month's entries
  // are done, using its own Month/Year picker below (independent of which days are currently
  // scrolled into view). Only restricts non-admin roles; Super Admin/Reviewer can still edit or
  // un-finalize. Folded into the same dseIsLocked/dseBlockIfLocked helpers below so every
  // existing call site (setValue, emp/desc modals, invoice creation) picks it up automatically. ──
  const isManagerSide=isManagerSideRole(user);
  const DSE_MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
  const [mgrFinalTick,setMgrFinalTick]=useState(0);
  const [mgrFinalSelMonth,setMgrFinalSelMonth]=useState(()=>defaultFinalMonthCal().month);
  const [mgrFinalSelYear,setMgrFinalSelYear]=useState(()=>defaultFinalMonthCal().year);
  const mgrFinalMonthChecked=useMemo(()=>isManagerFinalMonth(salonId,'dse',mgrFinalSelYear,mgrFinalSelMonth),[salonId,mgrFinalSelYear,mgrFinalSelMonth,mgrFinalTick]);
  const isMgrFinalMonthOf=(year,month)=>isManagerFinalMonth(salonId,'dse',year,month);
  // ── Edit Window — Master Sheet → Edit Salon → Daily Sales & Exp Edit Window. Only ever
  // narrows the CURRENT calendar month (never touches past months, which Month Lock already
  // governs entirely): once a day falls further back than the outlet's own N-day window, it
  // becomes read-only even though the month as a whole isn't locked yet. Reads the salon record
  // fresh each call (not the possibly-stale `salon` prop) so a setting changed on Master Sheet
  // takes effect immediately without needing this sheet remounted. ──
  const dseOutsideEditWindow=(iso)=>{
    const salonRec=getSalonRecordById(salonId);
    if(!salonRec||!salonRec.dseEditWindowEnabled)return false;
    const p=String(iso||'').split('-');
    if(p.length!==3)return false;
    const y=Number(p[0]),m=Number(p[1])-1,d=Number(p[2]);
    if(!(y===today.getFullYear()&&m===today.getMonth()))return false; // past/future months unaffected
    const days=Math.max(1,Number(salonRec.dseEditWindowDays)||3);
    const entryDate=new Date(y,m,d);
    const todayMidnight=new Date(today.getFullYear(),today.getMonth(),today.getDate());
    const diffDays=Math.floor((todayMidnight-entryDate)/86400000);
    return diffDays>=days;
  };
  const dseIsLocked=(iso)=>{
    const p=String(iso||'').split('-');
    if(p.length!==3)return false;
    const y=Number(p[0]),m=Number(p[1])-1;
    if(isMonthLockedFor(salonId,y,m))return true;
    if(isMgrFinalMonthOf(y,m))return true; // Month Final — nobody edits, Super Admin included
    return dseOutsideEditWindow(iso);
  };
  const {toast:dseLockToast}=useToast();
  const toggleMgrFinalMonth=()=>{
    if(!mgrFinalMonthChecked){const early=controlOn('monthFinalRule',salonId)&&monthFinalTooEarlyMessage(mgrFinalSelYear,mgrFinalSelMonth);if(early){dseLockToast(early,'error');return;}}
    if(!mgrFinalMonthChecked&&!window.confirm('Mark '+DSE_MONTHS[mgrFinalSelMonth]+' '+mgrFinalSelYear+' FINAL?\n\nThe whole month becomes read-only for everyone. Only a Super Admin can undo it, with a reason.'))return;
    if(!mgrFinalMonthChecked){const cm=collectionFinalBlockMessage(salonId,mgrFinalSelYear,mgrFinalSelMonth);if(cm){dseLockToast(cm,'error');return;}}
    if(mgrFinalMonthChecked&&!requestUnlock(salonId,'Daily Sales & Exp — '+DSE_MONTHS[mgrFinalSelMonth]+' '+mgrFinalSelYear))return;
    setManagerFinalMonth(salonId,'dse',mgrFinalSelYear,mgrFinalSelMonth,!mgrFinalMonthChecked,user?.name);
    setMgrFinalTick(t=>t+1);
    dseLockToast(!mgrFinalMonthChecked?'Marked '+DSE_MONTHS[mgrFinalSelMonth]+' '+mgrFinalSelYear+' Final — Manager side is now locked for this month':DSE_MONTHS[mgrFinalSelMonth]+' '+mgrFinalSelYear+' un-finalized — editable again','success');
  };
  const dseBlockIfLocked=(iso)=>{
    const p=String(iso||'').split('-');
    const y=p.length===3?Number(p[0]):null,m=p.length===3?Number(p[1])-1:null;
    if(y!=null&&isMonthLockedFor(salonId,y,m)){
      dseLockToast('That month is locked — nobody can change it while it is locked. A Super Admin can unlock it, with a reason (Salary Working, Master Sheet → Months, or un-finalize the P&L).','error');
      return true;
    }
    if(y!=null&&isMgrFinalMonthOf(y,m)){
      dseLockToast('This month is marked Final — nobody can change it. A Super Admin can un-finalize it, with a reason.','error');
      return true;
    }
    if(dseOutsideEditWindow(iso)){
      const salonRec=getSalonRecordById(salonId);
      const days=Math.max(1,Number(salonRec&&salonRec.dseEditWindowDays)||3);
      dseLockToast('This date is outside the '+days+'-day editable window set for this outlet (Master Sheet → Edit Salon → Daily Sales & Exp Edit Window) — only the last '+days+' day'+(days===1?'':'s')+' can be edited.','error');
      return true;
    }
    return false;
  };
  const setValue=(iso,ri,val)=>{
    if(dseBlockIfLocked(iso))return;
    setData(prev=>{
      const next={...prev};
      if(!next[iso])next[iso]={};
      const n=Number(val);
      if(val===''||val===null){const nd={...next[iso]};delete nd[ri];next[iso]=nd;}
      else next[iso]={...next[iso],[ri]:isNaN(n)?0:n};
      return next;
    });
  };
  // Same as setValue, but also writes to localStorage synchronously right here — used by the
  // invoice/payment popups below whenever there's any chance of an immediate tab switch to Vendor
  // Sheet right afterward (the rare "no matching invoice found" fallback still does this). A tab
  // switch unmounts this component; the ordinary setValue path relies on a useEffect keyed on
  // `data` to persist to localStorage, and that effect can lose the race against an immediate
  // unmount, silently dropping the entry — it would show fine right up until the tab switch, then
  // vanish. Writing inside the state updater itself guarantees the save lands before anything else
  // runs, tab switch included. Kept in use everywhere here regardless, since it's strictly safer.
  const setValueNow=(iso,ri,val)=>{
    if(dseBlockIfLocked(iso))return;
    setData(prev=>{
      const next={...prev};
      if(!next[iso])next[iso]={};
      const n=Number(val);
      if(val===''||val===null){const nd={...next[iso]};delete nd[ri];next[iso]=nd;}
      else next[iso]={...next[iso],[ri]:isNaN(n)?0:n};
      safeLocalSet(dseDataKey(),JSON.stringify(next));
      return next;
    });
  };

  // Get emp entries for a cell
  const getEmpEntries=(iso,ri)=>(empData[iso]&&empData[iso][ri])||[];
  const getEmpTotal=(iso,ri)=>getEmpEntries(iso,ri).reduce((s,e)=>s+Number(e.amount||0),0);

  // ── Description-row multi-entry modal — same shape as the employee modal above, but keyed by
  // a required free-text Description instead of an employee name. ──
  const isDescRow=(ri)=>DESC_ROWS.has(EXPENSE_ROWS[ri]?.name);
  const getDescEntries=(iso,ri)=>(descData[iso]&&descData[iso][ri])||[];
  const getDescTotal=(iso,ri)=>getDescEntries(iso,ri).reduce((s,e)=>s+Number(e.amount||0),0);
  const getDescLabel=(entries)=>entries.length===1?(entries[0].description||'1 entry'):entries.length+' entries';

  // ── Invoice-linked rows — each entry ties a specific day's payment to a specific invoice +
  // payment record on Vendor Sheet (invoiceId/paymentId), rather than one plain number per day.
  // commitInvEntries is the single place that writes the entry list AND keeps the plain dseData
  // total (rowTotal/dayTotal/P&L/exports all read that) in sync from it — same guard
  // (blockIfExpenseGoesNegative) the other multi-entry saves use, so an edit here can't silently
  // push Closing Cash Balance negative either.
  const getInvEntries=(iso,ri)=>(invEntryData[iso]&&invEntryData[iso][ri])||[];
  const getInvEntryTotal=(iso,ri)=>getInvEntries(iso,ri).reduce((s,e)=>s+(Number(e.amount)||0),0);
  const commitInvEntries=(iso,ri,nextEntries)=>{
    const total=nextEntries.reduce((s,e)=>s+(Number(e.amount)||0),0);
    if(blockIfExpenseGoesNegative(iso,ri,total))return false;
    setInvEntryDataRaw(prev=>{
      const day={...(prev[iso]||{})};
      if(nextEntries.length>0)day[ri]=nextEntries;else delete day[ri];
      return{...prev,[iso]:day};
    });
    setValueNow(iso,ri,total>0?total:'');
    return true;
  };

  const [descModal,setDescModal]=useState(null); // {ri,iso} | null
  const [modalDescEntries,setModalDescEntries]=useState([]);
  const {toast:dseToast,error:dseToastErr}=useToast();
  const openDescModal=(ri,iso)=>{
    if(dseBlockIfLocked(iso))return;
    const existing=getDescEntries(iso,ri);
    setModalDescEntries(existing.length>0?existing.map(e=>({...e})):[{description:'',amount:''}]);
    setDescModal({ri,iso});
  };
  const addDescModalRow=()=>setModalDescEntries(p=>[...p,{description:'',amount:''}]);
  const removeDescModalRow=(i)=>{if(confirm('Remove this entry?'))setModalDescEntries(p=>p.filter((_,idx)=>idx!==i));};
  const updateDescModalRow=(i,k,v)=>setModalDescEntries(p=>p.map((r,idx)=>idx===i?{...r,[k]:v}:r));
  const saveDescModal=()=>{
    // Every row that has an amount must have a Description — that's the whole point of this
    // sheet, so a blank Description with a real amount blocks the save rather than silently
    // dropping the entry (which would quietly lose money nobody could later explain).
    const withAmount=modalDescEntries.filter(e=>Number(e.amount)>0);
    const missingDesc=withAmount.some(e=>!String(e.description||'').trim());
    if(missingDesc){
      dseToastErr('Every entry with an amount needs a Description — please fill it in before saving.');
      return;
    }
    const valid=withAmount.filter(e=>String(e.description||'').trim());
    const iso=descModal.iso;const ri=descModal.ri;
    const total=valid.reduce((s,e)=>s+Number(e.amount),0);
    if(blockIfExpenseGoesNegative(iso,ri,total))return;
    setDescData(prev=>{
      const next={...prev};
      if(!next[iso])next[iso]={};
      if(valid.length===0){const nd={...next[iso]};delete nd[ri];next[iso]=nd;}
      else next[iso]={...next[iso],[ri]:valid};
      return next;
    });
    // Also update the numeric data store so rowTotal/dayTotal/P&L/exports keep working exactly
    // as before, with zero changes needed anywhere else in the sheet.
    if(total>0)setValue(iso,ri,total);
    else setValue(iso,ri,'');
    setDescModal(null);
  };

  // ── Invoice-linked rows — one modal lists every invoice entry recorded for this day+row
  // (invModal), and a single rich form (showInvoiceForm/invForm) both creates a brand-new invoice
  // AND edits an existing entry back to its full invoice detail — not just the amount — since both
  // need the exact same fields. mode:'create' adds a new entry; mode:'edit' updates the specific
  // invoice + payment this entry already points at (and moves the entry to a different day if the
  // Payment Date is changed away from the day it was originally recorded under).
  const [invModal,setInvModal]=useState(null); // {ri,iso} | null
  const openInvModal=(ri,iso)=>{
    if(dseBlockIfLocked(iso))return;
    setInvModal({ri,iso});
  };
  const INV_FORM_BLANK={vendorId:'',newVendorName:'',newVendorCat:defaultVendorCategoryFor(salonId),newVendorAddress:'',newVendorGst:'',newVendorTerms:'30 days',newVendorContact:'',newVendorPhone:'',newVendorId:'',newVendorStatus:'Active',newVendorTdsApplicable:false,newVendorTdsSection:'',newVendorTdsRate:'',
    newVendorBankName:'',newVendorAccountHolder:'',newVendorAccountNo:'',newVendorIfsc:'',newVendorEmail:'',
    docNature:'Tax Invoice',invoiceNo:'',invoiceDate:localTodayIso(),bookingDate:localTodayIso(),taxable:'',igst:'',cgst:'',sgst:'',roundOff:'',dueDate:'',desc:'',attachment:null,amountPaid:'',paymentDate:''};
  const [showInvoiceForm,setShowInvoiceForm]=useState(null); // {mode:'create'|'edit',ri,iso,category,invoiceId,paymentId,entryId} | null
  // 'pay' mode: other bills of the same vendor this one cash payment also covers (split oldest first).
  const [dseAlso,setDseAlso]=useState(()=>new Set());
  useEffect(()=>{setDseAlso(new Set());},[showInvoiceForm&&showInvoiceForm.invoiceId,showInvoiceForm&&showInvoiceForm.mode]);
  const [invForm,setInvForm]=useState(INV_FORM_BLANK);
  const ic2=(k)=>(e)=>setInvForm(f=>({...f,[k]:e.target.value}));
  // IGST vs CGST+SGST from the outlet's and the chosen vendor's GSTIN state codes.
  const invVendorGst2=invForm.vendorId==='__new__'?invForm.newVendorGst:((loadVendors(salonId).find(v=>v.id===invForm.vendorId)||{}).gst);
  const invSupply2=gstSupplyTypeFor(salonId,invVendorGst2);
  useEffect(()=>{if(invSupply2)setInvForm(f=>{const g=gstFieldsForSupply(f,invSupply2);return g===f?f:g;});},[invSupply2]);
  const invFormTotal=(Number(invForm.taxable)||0)+(Number(invForm.igst)||0)+(Number(invForm.cgst)||0)+(Number(invForm.sgst)||0)+(Number(invForm.roundOff)||0);
  const isoOfDmy=(dmyStr)=>{const p=String(dmyStr||'').split('/');return p.length===3?p[2]+'-'+p[1]+'-'+p[0]:'';};
  // Booking Date and Payment Date both default to the day column that was actually clicked to
  // open this modal — not today's real-world date — since that's the day this invoice is
  // genuinely being booked and paid against on Daily Sales & Exp. Both stay independently
  // editable afterward, in case the wrong day's column was clicked or the two genuinely differ.
  const openCreateInvoiceEntry=(ri,iso)=>{
    if(dseBlockIfLocked(iso))return;
    const category=EXPENSE_ROWS[ri]?.name;
    setInvForm({...INV_FORM_BLANK,newVendorCat:category||INV_FORM_BLANK.newVendorCat,bookingDate:iso,paymentDate:iso});
    setShowInvoiceForm({mode:'create',ri,iso,category});
  };
  // Reopens an existing entry to its FULL invoice detail (vendor, doc nature, invoice no, dates,
  // GST breakup, description, attachment) instead of just a bare amount box — pulled straight from
  // the actual linked invoice record on Vendor Sheet, not reconstructed/guessed.
  const openEditInvoiceEntry=(ri,iso,entry)=>{
    if(dseBlockIfLocked(iso))return;
    const inv=loadVendorInvoices(salonId).find(x=>x.id===entry.invoiceId);
    if(!inv){dseToastErr('Could not find the linked invoice anymore — it may have been deleted in Vendor Sheet.');return;}
    const payment=(inv.payments||[]).find(p=>p.id===entry.paymentId);
    const category=EXPENSE_ROWS[ri]?.name;
    setInvForm({...INV_FORM_BLANK,newVendorCat:category||INV_FORM_BLANK.newVendorCat,
      vendorId:inv.vendorId||'',docNature:inv.docNature||'Tax Invoice',invoiceNo:inv.invoiceNo||'',
      invoiceDate:isoOfDmy(inv.invoiceDate)||localTodayIso(),
      bookingDate:isoOfDmy(inv.bookingDate)||iso,dueDate:isoOfDmy(inv.dueDate),
      taxable:inv.taxable||'',igst:inv.igst||'',cgst:inv.cgst||'',sgst:inv.sgst||'',roundOff:inv.roundOff||'',
      desc:inv.desc||'',attachment:inv.attachment||null,
      amountPaid:String(entry.amount||''),paymentDate:(payment&&payment.paidDate)||iso});
    setShowInvoiceForm({mode:'edit',ri,iso,category,invoiceId:entry.invoiceId,paymentId:entry.paymentId,entryId:entry.id});
  };
  // Removes one entry — takes its linked payment off the invoice too (never deletes the invoice
  // itself, since it may carry other payments), then re-totals the day's cell from what's left.
  const removeInvoiceEntry=(ri,iso,entry)=>{
    if(dseBlockIfLocked(iso))return;
    if(!window.confirm('Remove this ₹'+Number(entry.amount||0).toLocaleString('en-IN')+' entry? The matching payment will also be removed from the linked invoice on Vendor Sheet.'))return;
    const invoices=loadVendorInvoices(salonId);
    const idx=invoices.findIndex(inv=>inv.id===entry.invoiceId);
    if(idx>=0){
      const nextPayments=(invoices[idx].payments||[]).filter(p=>p.id!==entry.paymentId);
      const next=[...invoices];next[idx]={...invoices[idx],payments:nextPayments};
      saveVendorInvoices(next,salonId);
    }
    commitInvEntries(iso,ri,getInvEntries(iso,ri).filter(e=>e.id!==entry.id));
  };
  // Opens an OUTSTANDING invoice (one with no entry yet today) to its full detail, same as editing
  // one already linked — the person can review/correct anything about the invoice itself, not just
  // punch in a bare amount, before recording today's payment against it. mode:'pay' distinguishes
  // this from mode:'edit' in saveInvoiceForm: it adds a NEW payment to the existing invoice rather
  // than updating one that's already there.
  const openPayExistingInvoice=(ri,iso,invoiceId)=>{
    if(dseBlockIfLocked(iso))return;
    const inv=loadVendorInvoices(salonId).find(x=>x.id===invoiceId);
    if(!inv){dseToastErr('That invoice could not be found — refresh and try again.');return;}
    const paidSoFar=(inv.payments||[]).reduce((s,p)=>s+(Number(p.paidAmount)||0),0);
    const balance=Math.max(0,(Number(inv.amount)||0)-paidSoFar);
    const category=EXPENSE_ROWS[ri]?.name;
    setInvForm({...INV_FORM_BLANK,newVendorCat:category||INV_FORM_BLANK.newVendorCat,
      vendorId:inv.vendorId||'',docNature:inv.docNature||'Tax Invoice',invoiceNo:inv.invoiceNo||'',
      invoiceDate:isoOfDmy(inv.invoiceDate)||localTodayIso(),
      bookingDate:isoOfDmy(inv.bookingDate)||iso,dueDate:isoOfDmy(inv.dueDate),
      taxable:inv.taxable||'',igst:inv.igst||'',cgst:inv.cgst||'',sgst:inv.sgst||'',roundOff:inv.roundOff||'',
      desc:inv.desc||'',attachment:inv.attachment||null,
      amountPaid:String(balance||''),paymentDate:iso});
    setShowInvoiceForm({mode:'pay',ri,iso,category,invoiceId:inv.id});
  };
  const saveInvoiceForm=()=>{
    if(!invForm.vendorId){dseToastErr('Select a vendor');return;}
    if(invForm.vendorId==='__new__'&&!invForm.newVendorName.trim()){dseToastErr('Enter a name for the new vendor');return;}
    if(!invForm.docNature){dseToastErr('Select the Doc Nature');return;}
    if(!(invForm.invoiceNo||'').trim()){dseToastErr('Invoice / Voucher No. is required');return;}
    if(!invForm.invoiceDate){dseToastErr('Invoice Date is required');return;}
    if(!canBookInvoiceInMonth(invoiceBookMonthOf(invForm))&&!(showInvoiceForm&&showInvoiceForm.invoiceId)){dseToastErr(invoiceMonthBlockMessage());return;}
    if(invFormTotal<=0){dseToastErr('Enter at least a Taxable Value');return;}
    if(outletSettings(salonId).attachmentRequired&&!invForm.attachment){dseToastErr('This outlet requires the invoice / voucher copy to be attached — please attach it before saving.');return;}
    if(invForm.vendorId==='__new__'&&!confirmIdFields({gst:invForm.newVendorGst,phone:invForm.newVendorPhone,email:invForm.newVendorEmail,accountNo:invForm.newVendorAccountNo,ifsc:invForm.newVendorIfsc,bankName:invForm.newVendorBankName},'the new vendor details',salonId))return;
    if(!(Number(invForm.amountPaid)>0)){dseToastErr('Enter Amount Paid — an invoice can\'t be saved from Daily Sales & Exp without recording a payment against it.');return;}
    const payload=showInvoiceForm;
    const category=payload.category;
    let vendorId=invForm.vendorId;
    if(vendorId==='__new__'){
      const vendors=loadVendors(salonId);
      const nameLower=invForm.newVendorName.trim().toLowerCase();
      const existing=vendors.find(v=>v.name.trim().toLowerCase()===nameLower);
      if(existing){
        vendorId=existing.id;
        dseToast('"'+existing.name+'" already exists — using the existing vendor','info');
      }else{
        const customId=invForm.newVendorId.trim();
        if(customId&&vendors.some(v=>v.id===customId)){dseToastErr('Vendor ID "'+customId+'" is already in use');return;}
        const newId=customId||nextPrefixedId(vendors,'V',3);
        const newVendor={id:newId,name:invForm.newVendorName.trim(),address:invForm.newVendorAddress,gst:invForm.newVendorGst.trim(),
          cat:invForm.newVendorCat,contact:invForm.newVendorContact,phone:invForm.newVendorPhone,terms:invForm.newVendorTerms,status:invForm.newVendorStatus,
          bankName:invForm.newVendorBankName||'',accountHolder:invForm.newVendorAccountHolder||'',accountNo:String(invForm.newVendorAccountNo||'').replace(/\s/g,''),ifsc:String(invForm.newVendorIfsc||'').trim().toUpperCase(),email:invForm.newVendorEmail||'',
          tdsApplicable:!!invForm.newVendorTdsApplicable,tdsSection:invForm.newVendorTdsSection,tdsRate:invForm.newVendorTdsRate};
        saveVendors([...vendors,newVendor],salonId);
        vendorId=newId;
      }
    }
    const dmy=(iso)=>{const p=(iso||'').split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:iso;};
    const paid=Number(invForm.amountPaid); // guaranteed > 0 — validated above
    const payDate=invForm.paymentDate||payload.iso;
    const invFields={vendorId,invoiceNo:invForm.invoiceNo.trim(),docNature:invForm.docNature,
      invoiceDate:dmy(invForm.invoiceDate),bookingDate:dmy(invForm.bookingDate||invForm.invoiceDate),dueDate:dmy(invForm.dueDate),
      taxable:Number(invForm.taxable)||0,igst:Number(invForm.igst)||0,cgst:Number(invForm.cgst)||0,sgst:Number(invForm.sgst)||0,roundOff:Number(invForm.roundOff)||0,
      amount:invFormTotal,category,desc:invForm.desc,attachment:invForm.attachment};
    {const dupInv=controlOn('dupInvoice',salonId)&&duplicateVendorInvoice(loadVendorInvoices(salonId),vendorId,invFields.invoiceNo,invFields.docNature,payload.mode==='pay'?payload.invoiceId:null);
     if(dupInv){dseToastErr(duplicateInvoiceMessage(dupInv,(vendors.find(v=>v.id===vendorId)||{}).name));return;}}
    {const orig=payload.mode==='pay'?(loadVendorInvoices(salonId).find(i=>i.id===payload.invoiceId)||null):null;
     if(!invoiceApprovalOk(salonId,vendorId,(vendors.find(v=>v.id===vendorId)||{}).name||invForm.newVendorName,invFields.invoiceNo,invFormTotal,orig?orig.amount:null))return;}

    if(payload.mode==='pay'&&dseAlso.size>0){
      // One cash payment over this bill and the other ticked bills of the vendor — oldest first.
      const invoices=loadVendorInvoices(salonId);
      const idx=invoices.findIndex(inv=>inv.id===payload.invoiceId);
      if(idx<0){dseToastErr('Could not find that invoice anymore — it may have been deleted in Vendor Sheet.');setShowInvoiceForm(null);return;}
      const balOf=i=>Math.max(0,(Number(i.amount)||0)-(i.payments||[]).reduce((t,x)=>t+(Number(x.paidAmount)||0),0));
      const cur={...invoices[idx],...invFields,linkedPI:invoices[idx].linkedPI||''};
      const others=invoices.filter(i=>dseAlso.has(i.id)&&i.id!==cur.id&&balOf(i)>0.5);
      const dk=i=>{const q=parseInvoiceDateFlexible(i.invoiceDate);return q?q.y*10000+q.m*100+q.d:0;};
      const group=[cur,...others].sort((a,b)=>dk(a)-dk(b));
      const maxPay=group.reduce((t,i)=>t+balOf(i),0);
      if(paid>maxPay+0.5){dseToastErr('₹'+paid.toLocaleString('en-IN')+' is more than the balance of the ticked bills (₹'+Math.round(maxPay).toLocaleString('en-IN')+').');return;}
      const allocs=allocateOldestFirst(group.map(i=>({id:i.id,balance:balOf(i)})),paid).filter(a=>a.alloc>0);
      const tag='MP-'+Date.now().toString(36);
      const note='Auto-recorded from Daily Sales & Exp — one payment of ₹'+paid.toLocaleString('en-IN')+' over '+allocs.length+' bills';
      const entries=[...getInvEntries(payDate,payload.ri)];
      const nextInvoices=invoices.map(i=>{
        const a=allocs.find(x=>x.id===i.id);
        const base=i.id===cur.id?cur:i;
        if(!a)return base;
        const paymentId=nextPrefixedId(base.payments||[],'PMT-',3);
        entries.push({id:nextPrefixedId(entries,'IE-',3),invoiceId:i.id,paymentId,amount:a.alloc});
        return{...base,payments:[...(base.payments||[]),{id:paymentId,paidAmount:a.alloc,paidDate:payDate,mode:'Cash',ref:'',note,multiPayGroup:tag}]};
      });
      if(!window.confirm('Record ONE cash payment of ₹'+paid.toLocaleString('en-IN')+' on '+payDate+' over '+allocs.length+' bills ('+allocs.map(a=>(group.find(g=>g.id===a.id)||{}).invoiceNo+' ₹'+a.alloc.toLocaleString('en-IN')).join(', ')+')?'))return;
      const ok=commitInvEntries(payDate,payload.ri,entries);
      if(!ok)return;
      saveVendorInvoices(nextInvoices,salonId);
      try{logAuditEvent(salonId,{entity:'Vendor Payment',entityId:tag,action:'Added',summary:'Daily Sales & Exp — one cash payment ₹'+paid.toLocaleString('en-IN')+' over '+allocs.length+' bills'});}catch(e){}
      dseToast(rupee(paid)+' recorded over '+allocs.length+' bills','success');
      setShowInvoiceForm(null);
      setInvModal(null);
      return;
    }

    if(payload.mode==='pay'){
      const invoices=loadVendorInvoices(salonId);
      const idx=invoices.findIndex(inv=>inv.id===payload.invoiceId);
      if(idx<0){dseToastErr('Could not find that invoice anymore — it may have been deleted in Vendor Sheet.');setShowInvoiceForm(null);return;}
      const inv=invoices[idx];
      const paymentId=nextPrefixedId(inv.payments||[],'PMT-',3);
      const nextPayments=[...(inv.payments||[]),{id:paymentId,paidAmount:paid,paidDate:payDate,mode:'Cash',ref:'',note:'Auto-recorded from Daily Sales & Exp'}];
      const nextInvoices=[...invoices];nextInvoices[idx]={...inv,...invFields,linkedPI:inv.linkedPI||'',payments:nextPayments};
      if(!confirmNoDuplicatePayment(inv,nextInvoices[idx]))return;
      const entryId=nextPrefixedId(getInvEntries(payDate,payload.ri),'IE-',3);
      const ok=commitInvEntries(payDate,payload.ri,[...getInvEntries(payDate,payload.ri),{id:entryId,invoiceId:inv.id,paymentId,amount:paid}]);
      if(!ok)return;
      saveVendorInvoices(nextInvoices,salonId);
      dseToast(rupee(paid)+' recorded against invoice # '+(inv.invoiceNo||'—'),'success');
      setShowInvoiceForm(null);
      setInvModal(null);
      return;
    }

    if(payload.mode==='edit'){
      const invoices=loadVendorInvoices(salonId);
      const idx=invoices.findIndex(inv=>inv.id===payload.invoiceId);
      if(idx<0){dseToastErr('Could not find the linked invoice anymore — it may have been deleted in Vendor Sheet.');setShowInvoiceForm(null);return;}
      const inv=invoices[idx];
      const nextPayments=(inv.payments||[]).map(p=>p.id===payload.paymentId?{...p,paidAmount:paid,paidDate:payDate}:p);
      const nextInvoices=[...invoices];nextInvoices[idx]={...inv,...invFields,linkedPI:inv.linkedPI||'',payments:nextPayments};
      // Move the entry to the new Payment Date's cell if it changed; otherwise just update it in place.
      const oldEntries=getInvEntries(payload.iso,payload.ri).filter(e=>e.id!==payload.entryId);
      const updatedEntry={id:payload.entryId,invoiceId:payload.invoiceId,paymentId:payload.paymentId,amount:paid};
      if(payDate===payload.iso){
        const ok=commitInvEntries(payload.iso,payload.ri,[...oldEntries,updatedEntry]);
        if(!ok)return;
      }else{
        const okOld=commitInvEntries(payload.iso,payload.ri,oldEntries);
        if(!okOld)return;
        const newEntries=getInvEntries(payDate,payload.ri).filter(e=>e.id!==payload.entryId);
        const okNew=commitInvEntries(payDate,payload.ri,[...newEntries,updatedEntry]);
        if(!okNew){commitInvEntries(payload.iso,payload.ri,[...oldEntries,updatedEntry]);return;} // roll back if the new day would go negative
      }
      saveVendorInvoices(nextInvoices,salonId);
      dseToast('Invoice updated','success');
      setShowInvoiceForm(null);
      setInvModal(null);
      return;
    }

    // mode: 'create'
    const invoices=loadVendorInvoices(salonId);
    const newId=nextPrefixedId(invoices,'VI-',4);
    const paymentId='PMT-001';
    const entryId=nextPrefixedId(getInvEntries(payDate,payload.ri),'IE-',3);
    const ok=commitInvEntries(payDate,payload.ri,[...getInvEntries(payDate,payload.ri),{id:entryId,invoiceId:newId,paymentId,amount:paid}]);
    if(!ok)return;
    const newInvoice={id:newId,...invFields,linkedPI:'',payments:[{id:paymentId,paidAmount:paid,paidDate:payDate,mode:'Cash',ref:'',note:'Auto-recorded from Daily Sales & Exp'}]};
    saveVendorInvoices([...invoices,newInvoice],salonId);
    dseToast('Invoice saved to Vendor Sheet — ₹'+paid.toLocaleString('en-IN')+' payment recorded against it','success');
    setShowInvoiceForm(null);
  };

  // Open emp modal
  const openEmpModal=(ri,iso)=>{
    if(dseBlockIfLocked(iso))return;
    const all=getEmpEntries(iso,ri);
    const existing=all.filter(e=>!e.fromDI);
    setModalDI(all.filter(e=>e.fromDI));
    setModalEntries(existing.length>0?existing.map(e=>({...e})):[blankModalEntry(ri)]);
    setModalSearch('');
    setEmpModal({ri,iso});
  };
  // ── Cash Advance extras — when the row is "Advance To Employees", each entry can carry the
  // same Recover Against / Reason / Approved By / month-wise Deduction Plan that a Bank Transfer
  // advance gets on the Advances sheet, so a Cash advance entered here is just as fully specified
  // (Payment Mode is fixed to Cash, since that's the whole point of entering it here). ──
  const nextMonthFirstYM=()=>{const d=new Date();d.setMonth(d.getMonth()+1,1);return d.toISOString().slice(0,7);};
  const genSchedule=(amount,monthly,startYM)=>{
    const amt=Number(amount)||0,mo=Math.max(1,Number(monthly)||0);
    if(amt<=0||mo<=0||!startYM)return[];
    const n=Math.ceil(amt/mo);
    const [sy,sm]=startYM.split('-').map(Number);
    const rows=[];let remaining=amt;
    for(let i=0;i<n;i++){
      const d=new Date(sy,sm-1+i,1);
      const ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
      const amtThis=i===n-1?remaining:Math.min(mo,remaining);
      rows.push({month:ym,amount:amtThis});remaining-=amtThis;
    }
    return rows;
  };
  const blankModalEntry=(ri)=>EXPENSE_ROWS[ri]?.name===DAILY_ADVANCE_SYNC_ROW
    ?{empName:'',amount:'',repayment:'',deductFrom:'Salary',reason:'',approvedBy:'',deductionStart:nextMonthFirstYM(),schedule:[]}
    :PAYMENT_MODE_ROWS.has(EXPENSE_ROWS[ri]?.name)
    ?{empName:'',amount:'',mode:'Cash'}
    :{empName:'',amount:''};
  const regenerateEntrySchedule=(i)=>setModalEntries(p=>p.map((r,idx)=>idx!==i?r:(!r.amount||!r.repayment?r:{...r,schedule:genSchedule(r.amount,r.repayment,r.deductionStart||nextMonthFirstYM())})));
  const setEntryScheduleRow=(i,si,field,val)=>setModalEntries(p=>p.map((r,idx)=>{
    if(idx!==i)return r;
    const sched=[...(r.schedule||[])];
    sched[si]={...sched[si],[field]:field==='amount'?(val===''?'':Number(val)):val};
    return{...r,schedule:sched};
  }));
  const addEntryScheduleRow=(i)=>setModalEntries(p=>p.map((r,idx)=>{
    if(idx!==i)return r;
    const list=r.schedule||[];
    const last=list[list.length-1];
    const d=last?new Date(last.month+'-01'):new Date((r.deductionStart||nextMonthFirstYM())+'-01');
    if(last)d.setMonth(d.getMonth()+1);
    const ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    return{...r,schedule:[...list,{month:ym,amount:0}]};
  }));
  const removeEntryScheduleRow=(i,si)=>{if(confirm('Remove this schedule row?'))setModalEntries(p=>p.map((r,idx)=>idx!==i?r:{...r,schedule:(r.schedule||[]).filter((_,j)=>j!==si)}));};

  // ── Daily Incentive Sheet sync — the 4 "M.Ship Pro. And Daily Incentive" employee-linked rows
  // (Membership/Product/Service/Target Commission) also get mirrored into the Daily Incentive
  // Sheet's own storage, so entering a commission here shows up there automatically instead of
  // needing the exact same figures typed in twice. One-way (Daily Sales & Exp is the source of
  // truth) and a full replace for this exact date+row every time it's saved here — so editing or
  // clearing an entry here correctly updates or removes its mirrored copy too, with nothing
  // stale left behind. Entries typed directly into Daily Incentive Sheet (not from here) are
  // untouched, since this only ever replaces entries it tagged with source:'dse' for this same
  // date+row. ──
  const DAILY_INCENTIVE_SYNC_ROWS=new Set(['Membership Commission/Incentives','Product Commission/Incentives','Service Commission/Incentives','Target Commission/Incentives']);
  // Replaces one date+row's mirrored copies (isOld) with `fresh`, keeping each existing copy that
  // still matches (same employee and amount) as it is — its id, and for an advance what has
  // already been recovered — and keeping the group where it was in the list. Returns null when
  // nothing changed, so opening this screen no longer re-saves (and renumbers, and resets the
  // outstanding of) every mirrored entry — which made other IDs' screens re-load in a loop.
  const replaceDseGroup=(all,isOld,fresh,carry)=>{
    const old=all.filter(isOld),pool=[...old];
    const amtOf=x=>Number(x&&(x.amount!=null?x.amount:x.incentive))||0;
    const next=fresh.map(f=>{
      const i=pool.findIndex(o=>o.emp===f.emp&&amtOf(o)===amtOf(f));
      if(i<0)return f;
      const o=pool.splice(i,1)[0];
      return carry(o,f);
    });
    if(JSON.stringify(old)===JSON.stringify(next))return null;
    const at=all.findIndex(isOld);
    const rest=all.filter(x=>!isOld(x));
    const pos=at<0?rest.length:all.slice(0,at).filter(x=>!isOld(x)).length;
    return[...rest.slice(0,pos),...next,...rest.slice(pos)];
  };
  const syncDailyIncentiveEntries=(iso,ri,validEntries)=>{
    const rowName=EXPENSE_ROWS[ri]?.name;
    if(!DAILY_INCENTIVE_SYNC_ROWS.has(rowName))return;
    try{
      const key=outletKey('salonos_daily_incentive_entries',salonId);
      let all=[];
      try{const raw=JSON.parse(cachedLocalGet(key)||'[]');if(Array.isArray(raw))all=raw;}catch(e){}
      const isOld=e=>!!(e&&e.source==='dse'&&e.date===iso&&e.dseRow===rowName);
      const fresh=(validEntries||[]).filter(v=>v.empName&&Number(v.amount)>0&&!v.fromDI).map(v=>{
        const emp=EMPLOYEES.find(e=>e.name===v.empName);
        const amt=Number(v.amount)||0;
        return{date:iso,empId:emp?emp.id:'',emp:v.empName,service:rowName,target:0,achieved:amt,rate:100,incentive:amt,mode:'Cash',status:'Computed',source:'dse',dseRow:rowName};
      });
      const next=replaceDseGroup(all,isOld,fresh,(o,f)=>({...o,...f}));
      if(next)safeLocalSet(key,JSON.stringify(next));
    }catch(e){}
  };

  // ── Advances sheet sync — same idea, for the "Advance To Employees" employee-linked row.
  // Mirrors into salonos_advances as an already-disbursed Cash advance (Active, nothing repaid
  // yet), tagged source:'dse' so it can be found and replaced wholesale the next time this exact
  // date+row is saved or cleared here, without touching advances entered directly on the
  // Advances sheet (requests, approvals, Bank Transfer advances, repayments, etc.). ──
  const DAILY_ADVANCE_SYNC_ROW='Advance To Employees';
  const syncAdvancesFromDSE=(iso,ri,validEntries)=>{
    const rowName=EXPENSE_ROWS[ri]?.name;
    if(rowName!==DAILY_ADVANCE_SYNC_ROW)return;
    try{
      const key=outletKey('salonos_advances',salonId);
      let all=[];
      try{const raw=JSON.parse(cachedLocalGet(key)||'[]');if(Array.isArray(raw))all=raw;}catch(e){}
      const isOld=a=>!!(a&&a.source==='dse'&&a.date===iso&&a.dseRow===rowName);
      let n=Math.max(0,...all.map(a=>Number(String(a.id||'').replace(/\D/g,''))||0));
      const fresh=(validEntries||[]).filter(v=>v.empName&&Number(v.amount)>0).map(v=>{
        const amt=Number(v.amount)||0;
        n+=1;
        return{id:'A'+String(n).padStart(3,'0'),emp:v.empName,date:iso,amount:amt,
          reason:v.reason||'Cash advance — Daily Sales & Exp',approvedBy:v.approvedBy||'',
          repayment:Number(v.repayment)||0,mode:'Cash',bankRef:'',deductFrom:v.deductFrom||'Salary',
          deductionStart:v.deductionStart||'',schedule:Array.isArray(v.schedule)?v.schedule:[],
          outstanding:amt,status:'Active',source:'dse',dseRow:rowName};
      });
      // An advance already on the Advances sheet keeps its number and what has been recovered.
      const next=replaceDseGroup(all,isOld,fresh,(o,f)=>{const r={...o,...f,id:o.id,outstanding:o.outstanding,status:o.status};if(o.settled!==undefined)r.settled=o.settled;return r;});
      if(next)safeLocalSet(key,JSON.stringify(next));
    }catch(e){}
  };
  // ── Penalties sheet sync — same idea as Advances above, for the "Penalties" employee-linked
  // row. Mirrors into salonos_penalties as a real penalty record (Type defaults to "Other" since
  // DSE doesn't ask for a reason category — edit that detail on the Penalty screen itself if
  // needed), tagged source:'dse' so it can be found and replaced wholesale the next time this
  // exact date+row is saved or cleared here, without touching penalties entered directly on the
  // Penalty screen. ──
  const DAILY_PENALTY_SYNC_ROW='Penalties';
  const syncPenaltiesFromDSE=(iso,ri,validEntries)=>{
    const rowName=EXPENSE_ROWS[ri]?.name;
    if(rowName!==DAILY_PENALTY_SYNC_ROW)return;
    try{
      const key=outletKey('salonos_penalties',salonId);
      let all=[];
      try{const raw=JSON.parse(cachedLocalGet(key)||'[]');if(Array.isArray(raw))all=raw;}catch(e){}
      const isOld=p=>!!(p&&p.source==='dse'&&p.date===iso&&p.dseRow===rowName);
      let n=Math.max(0,...all.map(p=>Number(String(p.id||'').replace(/\D/g,''))||0));
      const monthLabel=(()=>{const d=new Date(iso+'T00:00:00');return isNaN(d)?'':d.toLocaleString('en-IN',{month:'long',year:'numeric'});})();
      const fresh=(validEntries||[]).filter(v=>v.empName&&Number(v.amount)>0).map(v=>{
        n+=1;
        return{id:'P'+String(n).padStart(3,'0'),emp:v.empName,date:iso,type:'Other',otherType:'Entered via Daily Sales & Exp',amount:Number(v.amount)||0,
          approvedBy:'',recoveryMode:'Salary',month:monthLabel,remarks:'Entered via Daily Sales & Exp',source:'dse',dseRow:rowName};
      });
      const next=replaceDseGroup(all,isOld,fresh,(o,f)=>({...o,...f,id:o.id}));
      if(next)safeLocalSet(key,JSON.stringify(next));
    }catch(e){}
  };
  // One-time-per-outlet-view backfill: the sync functions above only fire when an entry is saved
  // or cleared through this screen. Without this, any Membership/Product/Service/Target
  // Commission, Advance To Employees, or Penalties data entered before this sync existed — or
  // entered in a browser session that hasn't hit Save since — would never appear on Daily
  // Incentive Sheet, Advances, or the Penalty screen, since sync is otherwise only triggered by
  // the save/clear actions themselves. This walks every date+row already in storage and syncs
  // it. Safe to run every time this screen loads: syncing an already-synced date+row just
  // replaces it with the same data (see the replace-by-date+row logic above), so it never
  // creates duplicates.
  useEffect(()=>{
    Object.keys(empData).forEach(iso=>{
      const rowMap=empData[iso]||{};
      Object.keys(rowMap).forEach(riStr=>{
        const ri=Number(riStr);
        const rowName=EXPENSE_ROWS[ri]?.name;
        const list=rowMap[riStr];
        if(!Array.isArray(list)||!list.length||!rowName)return;
        if(DAILY_INCENTIVE_SYNC_ROWS.has(rowName))syncDailyIncentiveEntries(iso,ri,list);
        if(rowName===DAILY_ADVANCE_SYNC_ROW)syncAdvancesFromDSE(iso,ri,list);
        if(rowName===DAILY_PENALTY_SYNC_ROW)syncPenaltiesFromDSE(iso,ri,list);
      });
    });
    // eslint-disable-next-line
  },[salonId]);
  const saveEmpModal=()=>{
    const valid=[...modalEntries.filter(e=>e.empName&&Number(e.amount)>0&&!e.fromDI),...modalDI];
    const iso=empModal.iso;const ri=empModal.ri;
    const rowName=EXPENSE_ROWS[ri]?.name;
    const total=valid.reduce((s,e)=>s+Number(e.amount),0);
    if(rowName===DAILY_ADVANCE_SYNC_ROW){
      const before={};getEmpEntries(iso,ri).forEach(e=>{before[e.empName]=(before[e.empName]||0)+(Number(e.amount)||0);});
      const now={};valid.forEach(e=>{now[e.empName]=(now[e.empName]||0)+(Number(e.amount)||0);});
      for(const n of Object.keys(now)){const extra=now[n]-(before[n]||0);if(extra>0&&!advanceLimitGate(salonId,n,extra))return;}
    }
    // Previous Month Salary / Incentive: never more than what's still due for that month.
    if(OUTSTANDING_ROWS.has(rowName)){
      const byName={};valid.forEach(v=>{byName[v.empName]=(byName[v.empName]||0)+(Number(v.amount)||0);});
      for(const name of Object.keys(byName)){
        const emp=EMPLOYEES.find(e=>e.name===name);if(!emp)continue;
        const bal=prevMonthBalanceFor(emp,rowName,iso);
        if(byName[name]>bal+0.5){
          const due=Math.round(referenceAmountFor(emp,rowName,iso)),paid=prevMonthPaidElsewhere(rowName,iso,name);
          dseToastErr(name+': ₹'+byName[name].toLocaleString('en-IN')+' is more than the '+(rowName==='Previous Month Salary'?'salary':'incentive')+' due — ₹'+due.toLocaleString('en-IN')+' due'+(paid?', ₹'+paid.toLocaleString('en-IN')+' already paid on other days':'')+', so at most ₹'+bal.toLocaleString('en-IN')+' can be paid.');
          return;
        }
      }
    }
    if(blockIfExpenseGoesNegative(iso,ri,total))return;
    const prevEntries=getEmpEntries(iso,ri); // before this save, for the Paid/Not-Paid diff below
    setEmpData(prev=>{
      const next={...prev};
      if(!next[iso])next[iso]={};
      if(valid.length===0){const nd={...next[iso]};delete nd[ri];next[iso]=nd;}
      else next[iso]={...next[iso],[ri]:valid};
      return next;
    });
    // Also update numeric data store for totals
    if(total>0)setValue(iso,ri,total);
    else setValue(iso,ri,'');
    syncDailyIncentiveEntries(iso,ri,valid);
    syncAdvancesFromDSE(iso,ri,valid);
    syncPenaltiesFromDSE(iso,ri,valid);
    // Previous Month Salary / Previous Month Incentive — settling someone here doesn't mean
    // anything to Salary Working / Incentive Working on its own; THAT sheet's own paymentStatus is
    // what getOutstandingEmployees actually checks, so without this, an employee paid here keeps
    // showing up as still owed everywhere else. Mark them Paid for that previous month, and revert
    // anyone taken back OFF this row to Not Paid, so the two stay in sync either direction.
    if(OUTSTANDING_ROWS.has(rowName)){
      const pm=prevMonthOfIso(iso);
      if(pm){
        const metaStore=rowName==='Previous Month Salary'?loadSWMeta(salonId):loadIWMeta(salonId);
        const saveMeta=rowName==='Previous Month Salary'?saveSWMeta:saveIWMeta;
        const newNames=new Set(valid.map(e=>e.empName));
        const oldNames=new Set(prevEntries.map(e=>e.empName));
        const nextMeta={...metaStore};
        EMPLOYEES.forEach(e=>{
          const key=attMonthKey(e.id,pm.year,pm.month);
          if(newNames.has(e.name)){
            const paidAmt=valid.filter(v=>v.empName===e.name).reduce((s,v)=>s+(Number(v.amount)||0),0)+prevMonthPaidElsewhere(rowName,iso,e.name);
            const full=paidAmt>=Math.round(referenceAmountFor(e,rowName,iso))-0.5;
            nextMeta[key]={...(nextMeta[key]||{status:'Draft',paymentStatus:'Not Paid',mode:''}),paymentStatus:full?'Paid':'Not Paid',mode:full?'Cash':'',paidDate:iso,paidAmount:paidAmt,paidVia:'Daily Sales & Exp'};
          }else if(oldNames.has(e.name)){
            const other=prevMonthPaidElsewhere(rowName,iso,e.name);
            nextMeta[key]={...(nextMeta[key]||{status:'Draft',paymentStatus:'Not Paid',mode:''}),paymentStatus:'Not Paid',mode:'',paidDate:other?nextMeta[key]&&nextMeta[key].paidDate||'':'',paidAmount:other||'',paidVia:other?'Daily Sales & Exp':''};
          }
        });
        saveMeta(nextMeta,salonId);
      }
    }
    setEmpModal(null);
  };

  const addModalRow=()=>setModalEntries(p=>[...p,blankModalEntry(empModal?.ri)]);
  const removeModalRow=(i)=>{if(confirm('Remove this row?'))setModalEntries(p=>p.filter((_,idx)=>idx!==i));};
  const updateModalRow=(i,k,v)=>setModalEntries(p=>p.map((r,idx)=>idx===i?{...r,[k]:v}:r));

  const rowTotal=(ri)=>days.reduce((s,d)=>s+(data[d.iso]&&data[d.iso][ri]?Number(data[d.iso][ri]):0),0);
  const dayTotal=(iso)=>EXPENSE_ROWS.reduce((s,r,ri)=>{const v=getValue(iso,ri);if(!v)return s;return r.name==='Penalties'?s-Number(v):s+Number(v);},0);
  const grandTotal=()=>days.reduce((s,d)=>s+dayTotal(d.iso),0);

  const isVendorRow=(ri)=>VENDOR_ROWS.has(EXPENSE_ROWS[ri]?.name);
  const isTodayCol=(iso)=>iso===todayISO;
  const isPrevSalary=(ri)=>EXPENSE_ROWS[ri]?.name==='Previous Month Salary';

  const saveDay=()=>{setSaveMsg('✓ Data saved for '+toLabel(today));setTimeout(()=>setSaveMsg(''),3000);};

  // Helper: the cell shows only how many employees were paid, never their names (open the cell to
  // see who got what).
  const getEmpLabel=(entries)=>{
    const n=new Set((entries||[]).map(e=>e&&e.empName).filter(Boolean)).size||(entries||[]).length;
    return String.fromCharCode(128101)+' '+n+(n===1?' employee':' employees');
  };

  const exportCSV=async()=>{
    const allDays=buildDays(new Date(viewDate),resolveShowCols(viewDate,showCols));
    const headers=['Daily Expenses','Expenses Group','Total',...allDays.map(d=>d.label)];
    const rows=EXPENSE_ROWS.map((r,ri)=>!expenseRowVisibleFor(r,salonId)?null:[r.name,r.group,rowTotal(ri)||0,...allDays.map(d=>getValue(d.iso,ri)||'-')]);
    const totRow=['Final Total Exp.','',grandTotal(),...allDays.map(d=>dayTotal(d.iso)||0)];
    try{
      const blob=await exportReportExcelBlob('Daily Expenses',[headers,...rows.filter(Boolean),totRow]);
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download=`Daily_Expenses_${viewDate}.xlsx`;a.click();URL.revokeObjectURL(url);
    }catch(err){dseToastErr(err.message);}
  };

  const exportPDF=()=>{
    const allDays=buildDays(new Date(viewDate),resolveShowCols(viewDate,showCols));
    const rows=EXPENSE_ROWS.map((r,ri)=>{if(!expenseRowVisibleFor(r,salonId))return null;
      const tot=rowTotal(ri);
      const isSalRow=isPrevSalary(ri);
      const vals=allDays.map(d=>{const v=getValue(d.iso,ri);return v?`<td style="text-align:right">${Number(v).toLocaleString('en-IN')}</td>`:`<td style="text-align:right;color:#bbb">-</td>`;}).join('');
      return`<tr${isSalRow&&tot>0?' style="background:#ffebee"':''}>
        <td style="font-weight:${r.name?'400':'300'};color:${r.name?'#222':'#bbb'}">${r.name||'—'}</td>
        <td style="color:#666;font-size:10px">${r.group}</td>
        <td style="text-align:right;font-weight:600;color:${tot>0?'#1a1a1a':'#bbb'}">${tot?tot.toLocaleString('en-IN'):'-'}</td>
        ${vals}</tr>`;
    }).join('');
    const hdrCols=allDays.map(d=>`<th style="text-align:right;min-width:70px">${d.label}</th>`).join('');
    const totCols=allDays.map(d=>{const t=dayTotal(d.iso);return`<td style="text-align:right;font-weight:700;color:#2F5FE0">${t?t.toLocaleString('en-IN'):'-'}</td>`;}).join('');
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Daily Expenses</title>
    <style>@page{size:A3 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#222}
    .hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:10px;border-bottom:2px solid #2F5FE0}
    .logo{font-family:Georgia,serif;font-size:20px;color:#2F5FE0;font-weight:700}.sub{font-size:9px;color:#999;text-transform:uppercase;letter-spacing:1.5px}
    table{width:100%;border-collapse:collapse}th{background:#1e1e26;color:#4C7DFF;padding:7px 6px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;text-align:left;white-space:nowrap}
    td{padding:6px 6px;border-bottom:1px solid #eee;vertical-align:middle;white-space:nowrap}tr:nth-child(even) td{background:#fafaf8}
    .foot td{background:#1e1e26!important;color:#4C7DFF;font-weight:700;font-size:11px;padding:9px 6px}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
    <div class="hdr"><div><div class="logo">SalonOS</div><div class="sub">Daily Expenses Sheet</div></div>
    <div style="text-align:right;font-size:9px;color:#888">Exported: ${new Date().toLocaleString('en-IN')}<br>Period: ${days[0].label} to ${days[days.length-1].label}</div></div>
    <table><thead><tr><th>Daily Expenses</th><th>Expenses Group</th><th>Total</th>${hdrCols}</tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="foot"><td>Final Total Exp.</td><td></td><td style="text-align:right">${grandTotal().toLocaleString('en-IN')}</td>${totCols}</tr></tfoot>
    </table><script>window.onload=()=>window.print()<\/script></body></html>`;
    const w=window.open('','_blank');w.document.write(html);w.document.close();
  };

  // ── Share Report — same reusable Share button (PDF/Word/Excel → Download/Device Share/
  // WhatsApp/Email) used on Salary Working, Incentive Working, and elsewhere. Reuses exactly the
  // same row-building logic as Export Excel/PDF above, so all three stay in sync with each other.
  const dseReportTitle='Daily Expenses & Sales — '+(salon?salon.name.split('—')[0].trim():'Outlet')+' — up to '+viewDate;
  const dseReportSheetRows=()=>{
    const allDays=buildDays(new Date(viewDate),resolveShowCols(viewDate,showCols));
    const headers=['Daily Expenses','Expenses Group','Total',...allDays.map(d=>d.label)];
    const rows=EXPENSE_ROWS.map((r,ri)=>!expenseRowVisibleFor(r,salonId)?null:[r.name,r.group,rowTotal(ri)||0,...allDays.map(d=>getValue(d.iso,ri)||'-')]);
    const totRow=['Final Total Exp.','',grandTotal(),...allDays.map(d=>dayTotal(d.iso)||0)];
    return[headers,...rows.filter(Boolean),totRow];
  };
  const dseReportBodyHtml=()=>{
    const allDays=buildDays(new Date(viewDate),resolveShowCols(viewDate,showCols));
    const rows=EXPENSE_ROWS.map((r,ri)=>{if(!expenseRowVisibleFor(r,salonId))return null;
      const tot=rowTotal(ri);
      const vals=allDays.map(d=>{const v=getValue(d.iso,ri);return'<td class="num">'+(v?Number(v).toLocaleString('en-IN'):'-')+'</td>';}).join('');
      return'<tr><td>'+(r.name||'—')+'</td><td>'+r.group+'</td><td class="num">'+(tot?tot.toLocaleString('en-IN'):'-')+'</td>'+vals+'</tr>';
    }).join('');
    const hdrCols=allDays.map(d=>'<th class="num">'+d.label+'</th>').join('');
    const totCols=allDays.map(d=>{const t=dayTotal(d.iso);return'<td class="num">'+(t?t.toLocaleString('en-IN'):'-')+'</td>';}).join('');
    return'<table><thead><tr><th>Daily Expenses</th><th>Expenses Group</th><th class="num">Total</th>'+hdrCols+'</tr></thead><tbody>'+rows+'</tbody>'
      +'<tfoot><tr><td>Final Total Exp.</td><td></td><td class="num">'+grandTotal().toLocaleString('en-IN')+'</td>'+totCols+'</tr></tfoot></table>';
  };

  // Group colour map
  const GROUP_COLORS={
    'Daily Expenses':'rgba(255,215,0,0.08)',
    'Diesel Expenses':'rgba(255,165,0,0.1)',
    'M.Ship Pro. And Daily Incentive':'rgba(74,158,255,0.08)',
    'Salary Payable':'rgba(139,127,232,0.1)',
    'Tip To Employee':'rgba(78,205,196,0.1)',
    'Penalty':'rgba(255,107,107,0.1)',
    'Repair & Maintenance Expenses':'rgba(255,107,107,0.08)',
    'Telephone & Internet Expenses':'rgba(74,158,255,0.06)',
    'Drycleaning Expenses':'rgba(47,95,224,0.1)',
    'Rent':'rgba(255,107,107,0.12)',
    'Tanker Cleaning':'rgba(78,205,196,0.08)',
    'Marketing Expenses':'rgba(139,127,232,0.08)',
    'Unregistered Purchase':'rgba(255,159,67,0.1)',
    'Uniform Expenses':'rgba(155,89,182,0.08)',
  };
  // Sticky (frozen) columns need a fully OPAQUE background, or the day columns scrolling
  // underneath show through and visually collide with the frozen row-name text (e.g. "Pentry
  // Expenses" overlapping a scrolled-past "Add" button). The group tints above are deliberately
  // translucent rgba() so they layer softly over a plain row — fine for non-sticky cells, but
  // see-through is exactly the wrong behaviour for a frozen one. opaqueStickyBg (global helper)
  // stacks that same translucent tint over a solid var(--bg2) layer so it paints as one flat
  // opaque colour no matter what scrolls behind it.
  const opaqueBg=opaqueStickyBg;

  // ── Phone view: one day at a time as a simple form (sales & collection, then expenses), instead
  // of the wide days × rows grid. Every input goes through the grid's own handlers
  // (guardedSetSalesValue, setValue + blockIfExpenseGoesNegative, the entry/employee/description/
  // invoice modals), so locks, the edit window and the negative-cash checks behave identically.
  // The full grid stays one tap away. Shown only on phones (CSS .show-phone / .hide-phone). ──
  const [phoneIso,setPhoneIso]=useState(()=>{const v=String(viewDate||'');return /^\d{4}-\d{2}-\d{2}$/.test(v)&&v<=todayISO?v:todayISO;});
  const [phoneGrid,setPhoneGrid]=useState(false);
  const shiftPhoneDay=(n)=>{
    const d=new Date(phoneIso+'T00:00:00');d.setDate(d.getDate()+n);
    const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    if(iso>todayISO)return;
    setPhoneIso(iso);
  };
  const renderPhoneDay=()=>{
    const iso=phoneIso;
    const locked=dseIsLocked(iso);
    const dayLabel=new Date(iso+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
    const fmt=v=>(Number(v)||0).toLocaleString('en-IN');
    const rowStyle={display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,padding:'10px 12px',borderBottom:'1px solid var(--border)'};
    const numInput=(value,onChange,disabled,onCommit)=>React.createElement('input',{type:'number',inputMode:'decimal',min:0,value,disabled,placeholder:'0',
      onChange:e=>onChange(e.target.value),
      onFocus:e=>{e.target.dataset.before=e.target.value;},onBlur:e=>{const b=e.target.dataset.before;if(onCommit&&b!==undefined&&b!==e.target.value)onCommit(b,e.target.value);},
      style:{width:128,flexShrink:0,textAlign:'right',fontSize:16,padding:'8px 10px',background:'var(--bg3)',border:'1px solid var(--border2)',borderRadius:8,color:disabled?'var(--text3)':'var(--text)'}});
    const tapBtn=(total,onClick)=>React.createElement('button',{type:'button',onClick,className:'btn btn-ghost btn-sm',style:{minWidth:128,flexShrink:0,justifyContent:'flex-end',fontWeight:total>0?600:400}},
      total>0?'₹'+fmt(total)+' ✎':'+ Add');
    const heading=(text,right)=>React.createElement('div',{style:{padding:'10px 12px',display:'flex',justifyContent:'space-between',gap:8,fontWeight:700,fontSize:12,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--accent2)',background:'rgba(47,95,224,0.1)'}},
      React.createElement('span',null,text),right?React.createElement('span',null,right):null);
    const salesRows=SALES_ORDER.map(sri=>{const row=SALES_ROWS[sri];
      const isComputed=row.type==='computed',isOpening=sri===IDX_OPENING;
      const readOnly=isComputed||(isOpening&&!isFirstEverCashDay(iso));
      const val=salesValueAt(iso,sri);
      const right=readOnly
        ?React.createElement('span',{style:{fontWeight:700,fontSize:15,color:val<0?'var(--red)':'var(--accent2)'}},'₹'+fmt(val))
        :isSalesEntryRow(sri)
          ?tapBtn(getSalesEntryTotal(iso,sri),()=>openSalesEntryModal(sri,iso))
          :numInput(getSalesValue(iso,sri),v=>guardedSetSalesValue(iso,sri,v),false,(b,a)=>logLateEdit(salonId,iso,SALES_ROWS[sri].name,b,a));
      return React.createElement('div',{key:'s'+sri,style:{...rowStyle,background:readOnly?'rgba(47,95,224,0.06)':undefined}},
        React.createElement('div',null,React.createElement('div',{style:{fontSize:14,fontWeight:readOnly?700:500,color:readOnly?'var(--accent2)':'var(--text)'}},row.name),
          row.note?React.createElement('div',{style:{fontSize:10.5,color:'var(--orange)'}},row.note):null),right);
    });
    const expRows=EXPENSE_ROWS.map((row,ri)=>{if(!expenseRowVisibleFor(row,salonId))return null;
      if(!row.name)return null;
      const isInv=INVOICE_GATED_EXPENSE_ROWS.includes(row.name);
      let right;
      if(isDescRow(ri))right=tapBtn(getDescTotal(iso,ri),()=>openDescModal(ri,iso));
      else if(isEmpRow(ri))right=tapBtn(getEmpTotal(iso,ri),()=>openEmpModal(ri,iso));
      else if(isInv){const t=getInvEntryTotal(iso,ri);right=tapBtn(t+Math.max(0,(Number(getValue(iso,ri))||0)-t),()=>openInvModal(ri,iso));}
      else right=numInput(getValue(iso,ri),v=>{if(blockIfExpenseGoesNegative(iso,ri,v))return;setValue(iso,ri,v);},locked,
        (b,a)=>{logLateEdit(salonId,iso,EXPENSE_ROWS[ri].name,b,a);checkPettyLimit(salonId,iso,EXPENSE_ROWS[ri].name,b,a,v=>setValue(iso,ri,v));});
      return React.createElement('div',{key:'e'+ri,style:rowStyle},
        React.createElement('div',{style:{minWidth:0}},
          React.createElement('div',{style:{fontSize:14,fontWeight:500,color:row.name==='Penalties'?'var(--red)':'var(--text)'}},row.name),
          React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)'}},row.group)),
        right);
    });
    return React.createElement('div',{className:'show-phone',style:{flexDirection:'column',gap:12,marginBottom:14}},
      React.createElement('div',{className:'card',style:{padding:10,margin:0,display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}},
        React.createElement('button',{type:'button',className:'btn btn-ghost','aria-label':'Previous day',style:{fontSize:20,minWidth:46},onClick:()=>shiftPhoneDay(-1)},'‹'),
        React.createElement('div',{style:{textAlign:'center',minWidth:0}},
          React.createElement('div',{style:{fontWeight:700,fontSize:15}},dayLabel+(iso===todayISO?' · Today':'')),
          React.createElement('input',{type:'date',value:iso,max:todayISO,'aria-label':'Pick a date',onChange:e=>{if(e.target.value&&e.target.value<=todayISO)setPhoneIso(e.target.value);},
            style:{fontSize:13,background:'transparent',border:'none',color:'var(--accent2)',textAlign:'center'}}),
          locked&&React.createElement('div',{style:{fontSize:11.5,color:'var(--orange)'}},'🔒 Locked — view only')),
        React.createElement('button',{type:'button',className:'btn btn-ghost','aria-label':'Next day',style:{fontSize:20,minWidth:46},disabled:iso>=todayISO,onClick:()=>shiftPhoneDay(1)},'›')),
      React.createElement('div',{className:'card',style:{padding:0,margin:0,overflow:'hidden'}},heading('Sales & collection'),salesRows),
      React.createElement('div',{className:'card',style:{padding:0,margin:0,overflow:'hidden'}},heading('Expenses','Total ₹'+fmt(dayTotal(iso))),expRows),
      React.createElement('button',{type:'button',className:'btn btn-ghost',onClick:()=>setPhoneGrid(g=>!g)},phoneGrid?'Hide full grid':'Show full grid (several days)'));
  };

  const missingStrip=(()=>{if(!salonId||!controlOn('missingSalesBanner',salonId))return null;const t=new Date();const days=dseDaysMissingFor(salonId,t.getFullYear(),t.getMonth());
    if(!days.length)return null;const lbl=days.map(d=>Number(d.slice(8))).join(', ');
    return React.createElement('div',{style:{background:'rgba(224,82,82,0.08)',border:'1px solid rgba(224,82,82,0.35)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,fontSize:12.5,color:'var(--text2)'}},
      '⚠ No Daily Sales entered this month for ',React.createElement('b',null,days.length+' day'+(days.length===1?'':'s')),': ',t.toLocaleString('en-IN',{month:'short'})+' '+lbl);})();
  return React.createElement('div',{className:'fade-in'},
    missingStrip,
    // Header
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},fixAmp('Daily Expenses & Sales Sheet')),
        React.createElement('div',{className:'page-sub'},'Every visible date is editable — entries here roll up into P&L (Monthly) automatically by Expense Group, for whichever month the date falls in')
      ),
      // Grid-only controls — tucked away on phones unless the full grid is open.
      React.createElement('div',{className:phoneGrid?undefined:'hide-phone',style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}},
        React.createElement('label',{style:{fontSize:11,color:'var(--text3)',whiteSpace:'nowrap'}},'View up to date:'),
        React.createElement('input',{type:'date',className:'form-control',style:{width:'auto'},value:viewDate,
          min:periodCal?localDateToISO(new Date(periodCal.year,periodCal.month,1)):undefined,
          max:periodCal?localDateToISO(new Date(periodCal.year,periodCal.month+1,0)):undefined,
          onChange:e=>{let v=e.target.value;if(!v)return;
            if(periodCal){const lo=localDateToISO(new Date(periodCal.year,periodCal.month,1)),hi=localDateToISO(new Date(periodCal.year,periodCal.month+1,0));if(v<lo)v=lo;if(v>hi)v=hi;}
            setViewDate(v);}}),
        React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Today’s summary for the owner — opens WhatsApp with it ready',onClick:()=>{const t=ownerSummaryText(salonId,viewDate);const ph=outletSettings(salonId).ownerPhone;window.open(waPhoneOk(ph)?waLink(ph,t):'https://wa.me/?text='+encodeURIComponent(t),'_blank');}},'📤 Owner summary'),
        user&&PETTY_APPROVER_ROLES.includes(user.role)&&React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Daily cash limit per expense head',onClick:()=>setPettyOpen(true)},'⚙ Cash limits'),
        pettyOpen&&React.createElement(PettyLimitsModal,{sid:salonId,onClose:()=>setPettyOpen(false)}),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:showCols,onChange:e=>setShowCols(e.target.value==='full'?'full':Number(e.target.value))},
          [5,10,15,20,25].map(n=>React.createElement('option',{key:n,value:n},n+' days')).concat([React.createElement('option',{key:'full',value:'full'},'Full Month')])
        ),
        React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},onClick:exportCSV},'⬇ Export Excel'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)',borderColor:'rgba(255,107,107,0.4)'},onClick:exportPDF},'⬇ Export PDF'),
        React.createElement(ShareReportButton,{title:dseReportTitle,subtitle:'Daily Expenses & Sales',getBodyHtml:dseReportBodyHtml,getSheetRows:dseReportSheetRows,landscape:true}),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setShowSummaryModal(true)},'📊 Monthly & Comparative Summary'),
        React.createElement('button',{className:'btn btn-primary btn-sm',onClick:saveDay},'💾 Save Today')
      )
    ),
    // Phone: the one-day form comes first, right under the title.
    renderPhoneDay(),

    showSummaryModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowSummaryModal(false)},
      React.createElement('div',{className:'modal',style:{width:920,maxWidth:'95vw',maxHeight:'88vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
        React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}},
          React.createElement('div',{className:'modal-title',style:{marginBottom:0,paddingBottom:0,border:'none'}},'📊 Expenses Summary — Monthly & Comparative'),
          React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setShowSummaryModal(false)},'✕ Close')
        ),
        React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:16,paddingBottom:12,borderBottom:'1px solid var(--border)'}},'Same figures as the sheet behind this — rolled up by month instead of by day.'),
        React.createElement(ExpensesSummaryReport,{salon,period})
      )
    ),

    // ── Mark Month Final — its own Month/Year picker, independent of the day-window above,
    // since a manager may want to finalize a month that's since scrolled out of view. ──
    React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:14}},
      React.createElement('span',{style:{fontSize:11,color:'var(--text3)',whiteSpace:'nowrap'}},'Manager sign-off:'),
      React.createElement('select',{className:'form-control',style:{width:'auto'},value:mgrFinalSelMonth,onChange:e=>setMgrFinalSelMonth(Number(e.target.value))},DSE_MONTHS.map((m,i)=>React.createElement('option',{key:m,value:i},m))),
      React.createElement('select',{className:'form-control',style:{width:'auto'},value:mgrFinalSelYear,onChange:e=>setMgrFinalSelYear(Number(e.target.value))},appYears().map(y=>React.createElement('option',{key:y},y))),
      !isMonthLockedFor(salonId,mgrFinalSelYear,mgrFinalSelMonth)&&React.createElement('label',{title:mgrFinalMonthChecked?'Marked Final — Manager side locked for this whole month':'Mark this month Final (locks it for Manager-side edits — Super Admin/Reviewer can still edit)',style:{display:'flex',alignItems:'center',gap:5,fontSize:11.5,fontWeight:500,color:mgrFinalMonthChecked?'var(--green)':'var(--text2)',cursor:(mgrFinalMonthChecked&&isManagerSide)?'not-allowed':'pointer'}},
        React.createElement('input',{type:'checkbox',checked:mgrFinalMonthChecked,disabled:mgrFinalMonthChecked&&isManagerSide,onChange:toggleMgrFinalMonth}),
        mgrFinalMonthChecked?'🔒 Month Final':'Mark Month Final'
      ),
      isMonthLockedFor(salonId,mgrFinalSelYear,mgrFinalSelMonth)&&React.createElement('span',{className:'badge badge-green',style:{fontSize:11}},'🔒 Already locked from Master Sheet/Salary Working')
    ),

    // Save toast
    saveMsg&&React.createElement('div',{style:{background:'rgba(76,175,125,0.12)',border:'1px solid rgba(76,175,125,0.3)',borderRadius:'var(--r)',padding:'8px 14px',marginBottom:12,fontSize:12,color:'var(--green)'}},saveMsg),

    // Legend
    React.createElement('div',{style:{display:'flex',gap:12,marginBottom:12,flexWrap:'wrap',fontSize:11,color:'var(--text3)'}},
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:5}},React.createElement('div',{style:{width:14,height:14,borderRadius:3,background:'rgba(47,95,224,0.25)',border:'1px solid var(--accent)'}}),React.createElement('span',null,"Today's column (editable)")),
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:5}},React.createElement('div',{style:{width:14,height:14,borderRadius:3,background:'rgba(255,107,107,0.15)',border:'1px solid rgba(255,107,107,0.4)'}}),React.createElement('span',null,'Vendor-linked (enter invoice in Vendor Sheet to clear)')),
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:5}},React.createElement('div',{style:{width:14,height:14,borderRadius:3,background:'rgba(139,127,232,0.2)',border:'1px solid var(--purple)'}}),React.createElement('span',null,'Previous Month Salary')),
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:5}},React.createElement('div',{style:{width:14,height:14,borderRadius:3,background:'rgba(78,205,196,0.2)',border:'1px solid var(--teal)'}}),React.createElement('span',null,'👤 Click to enter Employee Name + Amount')),
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:5}},React.createElement('span',null,'📎⬇'),React.createElement('span',null,"Attach that day's Cash Register (JPG/PDF, max 4MB) in the column header — ⬇ downloads it back"))
    ),

    // Metrics strip
    React.createElement('div',{className:'grid4',style:{marginBottom:16}},
      [{label:"Today's Total Exp.",val:'₹'+dayTotal(todayISO).toLocaleString('en-IN'),color:'amber'},
       {label:'Period Total',val:'₹'+grandTotal().toLocaleString('en-IN'),color:'red'},
       {label:'Expense Rows',val:EXPENSE_ROWS.filter(r=>r.name&&expenseRowVisibleFor(r,salonId)).length,color:'blue'},
       {label:'Days Shown',val:days.length,color:'teal'}].map(m=>
        React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},
          React.createElement('div',{className:'metric-label'},m.label),
          React.createElement('div',{className:'metric-value'},m.val)
        )
      )
    ),

    // Main spreadsheet
    React.createElement('div',{className:'card'+(phoneGrid?'':' hide-phone'),style:{padding:0,overflow:'hidden'}},
      // The wrap below is a bounded-height, genuinely-scrolling box (maxHeight + overflowY:'auto')
      // rather than an unbounded div that merely scrolls horizontally — this is the standard
      // "frozen header" table pattern and is what actually makes position:sticky reliable here.
      // Earlier attempts relied on the page's own scroll container (.content) sticking the header
      // via a bare overflow-x:auto wrapper, but that depends on subtle, inconsistently-supported
      // overflow/scroll-container rules across browsers (including a newer 'overflow:clip' keyword
      // that isn't universally available) — worth understanding, but not something to depend on.
      // Giving this div a real height limit and overflowY:'auto' makes IT the nearest scrolling
      // ancestor unambiguously, in every browser, so the sticky header now has a scrollport that
      // reliably tracks: scroll the table body, the header row stays pinned to the top of this box.
      React.createElement('div',{style:{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - 340px)'},ref:dseWrapRef},
        React.createElement('table',{style:{width:'100%',borderCollapse:'separate',borderSpacing:0,fontSize:12}},
          // Header row — frozen (position:sticky, top:0) so it stays visible while scrolling down
          // through what can be a very long expense-row list, same convention as the other big
          // spreadsheet-style sheets (Salary Working, Incentive Working, Comparative Sheet).
          // NOTE: border-collapse MUST be 'separate' (not 'collapse') for position:sticky to work
          // on <th>/<thead> at all — with 'collapse', most browsers silently ignore sticky on table
          // header cells entirely, which is why the header kept disappearing even after fixing the
          // overflow/scroll-container issue above. 'separate' + border-spacing:0 looks identical
          // here since every border below is already drawn on only one side of each cell (no
          // border is ever doubled up at a shared edge).
          React.createElement('thead',null,
            React.createElement('tr',null,
              React.createElement('th',{style:{padding:'10px 12px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'2px solid var(--accent)',position:'sticky',top:0,left:0,zIndex:5,width:150,minWidth:150,maxWidth:150,borderRight:'1px solid var(--border2)'}},'Daily Expenses'),
              React.createElement('th',{style:{padding:'10px 12px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'2px solid var(--accent)',position:'sticky',top:0,zIndex:4,minWidth:160,borderRight:'1px solid var(--border2)'}},'Expenses Group'),
              React.createElement('th',{style:{padding:'10px 12px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'2px solid var(--accent)',position:'sticky',top:0,zIndex:4,minWidth:90,textAlign:'right',borderRight:'2px solid var(--accent)'}},'Total'),
              ...days.map(d=>React.createElement('th',{key:d.iso,style:{
                padding:'10px 10px',
                background:isTodayCol(d.iso)?'rgba(47,95,224,0.18)':'var(--bg3)',
                color:isTodayCol(d.iso)?'var(--accent2)':'var(--text2)',
                fontSize:11,fontWeight:700,
                borderBottom:isTodayCol(d.iso)?'2px solid var(--accent)':'2px solid var(--border)',
                position:'sticky',top:0,zIndex:4,
                minWidth:80,textAlign:'right',whiteSpace:'nowrap',
                borderRight:'1px solid var(--border)',
                outline:isTodayCol(d.iso)?'2px solid rgba(47,95,224,0.3)':'none',
                outlineOffset:-1
              }},
                isTodayCol(d.iso)?React.createElement('div',null,React.createElement('div',{style:{fontSize:9,color:'var(--accent)',letterSpacing:'0.1em'}},'TODAY'),d.label):d.label,
                dseIsLocked(d.iso)&&React.createElement('div',{title:isMgrFinalMonthOf(Number(d.iso.slice(0,4)),Number(d.iso.slice(5,7))-1)?'This month is Marked Final by Manager':isMonthLockedFor(salonId,Number(d.iso.slice(0,4)),Number(d.iso.slice(5,7))-1)?'This date falls in a locked month':'Outside the editable window set for this outlet — see Master Sheet → Edit Salon',style:{fontSize:9,color:'var(--green)',marginTop:2}},
                  isMgrFinalMonthOf(Number(d.iso.slice(0,4)),Number(d.iso.slice(5,7))-1)?'🔒 Final':isMonthLockedFor(salonId,Number(d.iso.slice(0,4)),Number(d.iso.slice(5,7))-1)?'🔒 Locked':'⏳ Window Closed'),
                React.createElement('div',{style:{marginTop:4,display:'flex',alignItems:'center',justifyContent:'flex-end',gap:4}},
                  React.createElement('input',{type:'file',accept:'image/*,.pdf',style:{display:'none'},id:'cashreg-'+d.iso,onChange:e=>{const f=e.target.files[0];if(f)handleCashRegFile(d.iso,f);e.target.value='';}}),
                  React.createElement('label',{htmlFor:'cashreg-'+d.iso,title:cashRegFiles[d.iso]?'Replace Cash Register attachment':'Attach Cash Register (JPG/PDF)',style:{cursor:'pointer',fontSize:11,fontWeight:400,color:cashRegFiles[d.iso]?'var(--green)':'var(--text3)'}},'📎'),
                  cashRegFiles[d.iso]&&React.createElement('span',{title:typeof cashRegFiles[d.iso]==='string'?'Saved by an older version — click to see why this can\'t be downloaded':'Download '+(cashRegFiles[d.iso].name||'attachment'),onClick:()=>downloadCashRegFile(d.iso),style:{cursor:'pointer',fontSize:11,fontWeight:400,color:'var(--blue)'}},'⬇'),
                  cashRegFiles[d.iso]&&React.createElement('span',{title:'Remove attachment',onClick:()=>{if(confirm('Remove the Cash Register attachment for '+d.iso+'?'))setCashRegFile(d.iso,null);},style:{cursor:'pointer',fontSize:9,fontWeight:400,color:'var(--text3)'}},'✕'),
                  cashRegFiles[d.iso]&&typeof cashRegFiles[d.iso]!=='string'&&cashRegFiles[d.iso].dataUrl&&React.createElement('span',{title:'Read the Closing Balance off this attachment and compare with the computed figure',onClick:()=>ocrBusyIso!==d.iso&&verifyCashRegister(d.iso),style:{cursor:ocrBusyIso===d.iso?'wait':'pointer',fontSize:11,fontWeight:400,color:'var(--purple)'}},ocrBusyIso===d.iso?'⏳':'🔍')
                )
              ))
            )
          ),
          // Body rows
          React.createElement('tbody',null,
            EXPENSE_ROWS.map((row,ri)=>{if(!expenseRowVisibleFor(row,salonId))return null;
              const rowTot=rowTotal(ri);
              const isBlank=!row.name;
              // Some expense rows are always paid against a real Vendor Sheet invoice — every
              // entry here is linked to one, so it supports more than one invoice per day (e.g.
              // two separate Telephone bills settled the same day) and every entry can be edited
              // back to its full invoice detail, not just the amount.
              const isInv=INVOICE_GATED_EXPENSE_ROWS.includes(row.name);
              const invOutstandingForRow=isInv?outstandingVendorInvoicesFor(salonId,row.name):[];
              const isPenalty=row.name==='Penalties';
              const grpBg=GROUP_COLORS[row.group]||'transparent';
              return React.createElement('tr',{key:ri,style:{background:grpBg}},
                // Expense name — sticky
                React.createElement('td',{'data-xr':ri,'data-xc':0,style:{
                  padding:'7px 10px',borderBottom:'1px solid var(--border)',
                  position:'sticky',left:0,zIndex:2,background:opaqueBg(dseCellRange.isSelected(ri,0)?'rgba(47,95,224,0.25)':grpBg),
                  borderRight:'1px solid var(--border2)',fontWeight:500,
                  width:150,minWidth:150,maxWidth:150,whiteSpace:'normal',lineHeight:1.25,
                  color:isBlank?'var(--text3)':'var(--text)',fontSize:12
                }},row.name||'—',
                  isInv&&React.createElement('span',{style:{fontSize:9,color:invOutstandingForRow.length>0?'var(--green)':'var(--text3)',fontWeight:400,marginLeft:6}},
                    invOutstandingForRow.length>0?'🔓 '+invOutstandingForRow.length+' outstanding invoice'+(invOutstandingForRow.length===1?'':'s'):'🧾 click any cell to add/pay an invoice')
                ),
                // Group
                React.createElement('td',{'data-xr':ri,'data-xc':1,style:{padding:'7px 12px',borderBottom:'1px solid var(--border)',borderRight:'1px solid var(--border2)',fontSize:11,color:'var(--text3)',whiteSpace:'nowrap',background:dseCellRange.isSelected(ri,1)?'rgba(47,95,224,0.25)':undefined}},row.group),
                // Total
                React.createElement('td',{'data-xr':ri,'data-xc':2,style:{
                  padding:'7px 12px',borderBottom:'1px solid var(--border)',
                  borderRight:'2px solid var(--accent)',textAlign:'right',
                  fontWeight:700,fontSize:12,background:dseCellRange.isSelected(ri,2)?'rgba(47,95,224,0.25)':undefined,
                  color:(isPrevSalary(ri)||isPenalty)&&rowTot>0?'var(--red)':rowTot>0?'var(--text)':'var(--text3)'
                }},rowTot>0?(isPenalty?'-':'')+rowTot.toLocaleString('en-IN'):'-'),
                // Day cells
                ...days.map((d,di)=>{
                  const isToday=isTodayCol(d.iso);
                  const val=getValue(d.iso,ri);
                  const hasVal=val!=='';
                  const isVendor=isVendorRow(ri)&&hasVal;
                  const isSalRow=isPrevSalary(ri)&&hasVal;
                  const isEmp=isEmpRow(ri);
                  const empEntries=getEmpEntries(d.iso,ri);
                  const empTotal=getEmpTotal(d.iso,ri);
                  const hasEmpData=empEntries.length>0;
                  const isDesc=isDescRow(ri);
                  const descEntries=getDescEntries(d.iso,ri);
                  const descTotal=getDescTotal(d.iso,ri);
                  const hasDescData=descEntries.length>0;
                  const invEntries=isInv?getInvEntries(d.iso,ri):[];
                  const invEntryTotal=isInv?getInvEntryTotal(d.iso,ri):0;
                  // The plain dseData value (val, already computed above) is the real source of
                  // truth every other total (rowTotal/dayTotal/P&L) reads from. Normally it's kept
                  // exactly equal to the sum of invEntries by commitInvEntries — but any amount that
                  // predates this entry-list feature (or was entered some other way) only exists in
                  // dseData, with nothing in invEntryData behind it. Falling back to it here means
                  // that older data still shows up in the cell instead of silently looking empty.
                  const invLegacyAmount=isInv?Math.max(0,(Number(val)||0)-invEntryTotal):0;
                  const invTotal=invEntryTotal+invLegacyAmount;
                  const hasInvData=invTotal>0;
                  const cellBg=isSalRow?'rgba(139,127,232,0.2)':isVendor?'rgba(255,107,107,0.18)':isEmp&&hasEmpData?'rgba(78,205,196,0.12)':isDesc&&hasDescData?'rgba(47,95,224,0.1)':isInv&&hasInvData?'rgba(255,107,107,0.12)':isToday?'rgba(47,95,224,0.1)':'transparent';
                  return React.createElement('td',{key:d.iso,'data-xr':ri,'data-xc':3+di,style:{
                    padding:'3px 4px',borderBottom:'1px solid var(--border)',
                    borderRight:'1px solid var(--border)',background:dseCellRange.isSelected(ri,3+di)?'rgba(47,95,224,0.25)':cellBg,
                    outline:isToday?'1px solid rgba(47,95,224,0.2)':'none',
                    outlineOffset:-1
                  }},
                    !isBlank&&isDesc
                      // Description-required row: click to open modal, same pattern as employee
                      // rows — every entry needs a Description, and more than one entry per day
                      // is fine (e.g. two separate Conveyance trips in one day).
                      ? React.createElement('div',{
                          onClick:()=>openDescModal(ri,d.iso),
                          style:{
                            display:'flex',alignItems:'center',justifyContent:'flex-end',gap:4,
                            padding:'4px 6px',cursor:'pointer',borderRadius:4,minHeight:28,
                            background:hasDescData?(isVendor?'rgba(255,107,107,0.1)':'rgba(47,95,224,0.08)'):'transparent',
                            border:hasDescData?'1px solid '+(isVendor?'rgba(255,107,107,0.35)':'rgba(47,95,224,0.3)'):'1px dashed rgba(47,95,224,0.3)',
                          }},
                          hasDescData
                            ? React.createElement('div',{style:{textAlign:'right'}},
                                React.createElement('div',{style:{fontSize:12,fontWeight:600,color:isVendor?'var(--red)':'var(--accent)'}},descTotal.toLocaleString('en-IN')),
                                React.createElement('div',{style:{fontSize:9,color:'var(--text3)',maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},getDescLabel(descEntries))
                              )
                            : React.createElement('span',{style:{fontSize:10,color:'var(--text3)'}},'📝 Add')
                        )
                      : !isBlank&&isEmp
                      // Employee-linked row: click button to open modal
                      ? React.createElement('div',{
                          onClick:()=>openEmpModal(ri,d.iso),
                          style:{
                            display:'flex',alignItems:'center',justifyContent:'flex-end',gap:4,
                            padding:'4px 6px',cursor:'pointer',borderRadius:4,minHeight:28,
                            background:hasEmpData?'rgba(78,205,196,0.08)':'transparent',
                            border:hasEmpData?'1px solid rgba(78,205,196,0.3)':'1px dashed rgba(47,95,224,0.3)',
                          }},
                          hasEmpData
                            ? React.createElement('div',{style:{textAlign:'right'}},
                                React.createElement('div',{style:{fontSize:12,fontWeight:600,color:isPenalty?'var(--red)':'var(--teal)'}},(isPenalty?'-':'')+empTotal.toLocaleString('en-IN')),
                                React.createElement('div',{style:{fontSize:9,color:'var(--text3)'}},getEmpLabel(empEntries))
                              )
                            : React.createElement('span',{style:{fontSize:10,color:'var(--text3)'}},'👤 Add')
                        )
                      : !isBlank&&isInv
                        // Invoice-linked row: click to open the manage-invoices modal — lists
                        // every invoice entry for this day, lets you add another (existing or
                        // brand new), and edit any entry back to its full invoice detail.
                        ? React.createElement('div',{
                            onClick:()=>openInvModal(ri,d.iso),
                            style:{
                              display:'flex',alignItems:'center',justifyContent:'flex-end',gap:4,
                              padding:'4px 6px',cursor:dseIsLocked(d.iso)?'not-allowed':'pointer',borderRadius:4,minHeight:28,
                              background:hasInvData?'rgba(255,107,107,0.1)':'transparent',
                              border:hasInvData?'1px solid rgba(255,107,107,0.35)':'1px dashed rgba(47,95,224,0.3)',
                            }},
                            hasInvData
                              ? React.createElement('div',{style:{textAlign:'right'}},
                                  React.createElement('div',{style:{fontSize:12,fontWeight:600,color:'var(--red)'}},invTotal.toLocaleString('en-IN')),
                                  React.createElement('div',{style:{fontSize:9,color:invLegacyAmount>0?'var(--orange)':'var(--text3)'}},
                                    invEntries.length>0
                                      ?(invEntries.length+' invoice'+(invEntries.length===1?'':'s')+(invLegacyAmount>0?' +unlinked':''))
                                      :'⚠ unlinked')
                                )
                              : React.createElement('span',{style:{fontSize:10,color:'var(--text3)'}},'🧾 Add')
                          )
                        : !isBlank
                        ? React.createElement('input',{
                                type:'number',min:0,
                                value:val,
                                disabled:dseIsLocked(d.iso),
                                onChange:e=>{
                                  const raw=e.target.value;
                                  if(blockIfExpenseGoesNegative(d.iso,ri,raw))return;
                                  setValue(d.iso,ri,raw);
                                },
                                onFocus:e=>{e.target.dataset.before=e.target.value;},
                                onBlur:e=>{const b=e.target.dataset.before,a=e.target.value;if(b===undefined||b===a)return;logLateEdit(salonId,d.iso,EXPENSE_ROWS[ri].name,b,a);checkPettyLimit(salonId,d.iso,EXPENSE_ROWS[ri].name,b,a,v=>setValue(d.iso,ri,v));},
                                style:{
                                  width:'100%',background:'transparent',border:'none',outline:'none',
                                  color:dseIsLocked(d.iso)?'var(--text3)':(hasVal?(isSalRow?'var(--purple)':isVendor?'var(--red)':'var(--text)'):'var(--text3)'),
                                  fontFamily:'var(--font)',fontSize:12,textAlign:'right',
                                  padding:'4px 6px',cursor:dseIsLocked(d.iso)?'not-allowed':'text'
                                },
                                placeholder:'0'
                              })
                        : isEmp&&hasEmpData
                          ? React.createElement('div',{style:{textAlign:'right',padding:'4px 6px'}},
                              React.createElement('div',{style:{fontSize:12,fontWeight:500,color:isPenalty?'var(--red)':'var(--teal)'}},(isPenalty?'-':'')+empTotal.toLocaleString('en-IN')),
                              React.createElement('div',{style:{fontSize:9,color:'var(--text3)'}},getEmpLabel(empEntries)))
                          : React.createElement('div',{style:{
                              textAlign:'right',padding:'4px 6px',
                              color:hasVal?(isSalRow?'var(--purple)':isVendor?'var(--red)':'var(--text2)'):'var(--text3)',
                              fontWeight:hasVal?500:400
                            }},hasVal?Number(val).toLocaleString('en-IN'):'-')
                  );
                })
              );
            }),
            // Final Total Exp. — running subtotal row, now inside the same body instead of a
            // separate tfoot, so Daily Sales & Collection can continue directly underneath it.
            React.createElement('tr',{key:'final-total-exp',style:{background:'var(--th-bg)'}},
              React.createElement('td',{style:{padding:'10px 12px',position:'sticky',left:0,background:'var(--th-bg)',zIndex:2,fontWeight:700,fontSize:13,color:'var(--accent2)',borderRight:'1px solid var(--border2)',borderTop:'2px solid var(--accent)'}},'Final Total Exp.'),
              React.createElement('td',{style:{padding:'10px 12px',borderRight:'1px solid var(--border2)',borderTop:'2px solid var(--accent)'}},''),
              React.createElement('td',{style:{padding:'10px 12px',textAlign:'right',fontWeight:700,fontSize:13,color:'var(--accent2)',borderRight:'2px solid var(--accent)',borderTop:'2px solid var(--accent)'}},grandTotal().toLocaleString('en-IN')),
              ...days.map(d=>React.createElement('td',{key:d.iso,style:{
                padding:'10px 10px',textAlign:'right',fontWeight:700,fontSize:12,
                color:isTodayCol(d.iso)?'var(--accent2)':'var(--text)',
                borderRight:'1px solid var(--border)',borderTop:'2px solid var(--accent)',
                background:isTodayCol(d.iso)?'rgba(47,95,224,0.15)':'transparent'
              }},dayTotal(d.iso)>0?dayTotal(d.iso).toLocaleString('en-IN'):'-'))
            ),
            // Daily Sales & Collection — continues directly on from Final Total Exp., same
            // table, same columns. Total Daily Sale, Total Collection, Opening and Closing Cash
            // Balance are
            // computed live from the rows above them; the rest are entered per day.
            React.createElement('tr',{key:'sales-section-header'},
              React.createElement('td',{colSpan:3+days.length,style:{padding:'10px 12px',background:'rgba(47,95,224,0.12)',fontSize:11,fontWeight:700,color:'var(--accent2)',textTransform:'uppercase',letterSpacing:'0.06em',borderTop:'2px solid var(--accent)',borderBottom:'1px solid var(--border)'}},'Daily Sales & Collection')
            ),
            ...SALES_ORDER.map(sri=>{const row=SALES_ROWS[sri];
              const isComputed=row.type==='computed';
              const isOpening=sri===IDX_OPENING;
              const globalRi=EXPENSE_ROWS.length+sri;
              const sel=(ci)=>dseCellRange.isSelected(globalRi,ci);
              return React.createElement('tr',{key:'sales-'+sri,style:(isComputed||isOpening)?{background:'rgba(47,95,224,0.05)'}:undefined},
                React.createElement('td',{style:{padding:'7px 12px',position:'sticky',left:0,zIndex:1,background:opaqueBg((isComputed||isOpening)?'rgba(47,95,224,0.1)':null),fontWeight:(isComputed||isOpening)?700:500,color:(isComputed||isOpening)?'var(--accent2)':'var(--text)',borderRight:'1px solid var(--border2)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}},
                  React.createElement('div',null,row.name,
                    sri===IDX_CASH?React.createElement('span',{style:{fontSize:9,color:'var(--text3)',fontWeight:400,marginLeft:6}},'🔗 feeds Collection Reco'):null
                  ),
                  isOpening?React.createElement('div',{style:{fontSize:9,color:'var(--text3)',fontWeight:400,marginTop:2}},'auto-carried from previous day'):null,
                  row.note?React.createElement('div',{style:{fontSize:9.5,color:'var(--orange)',fontWeight:500,marginTop:2}},row.note):null),
                React.createElement('td',{style:{padding:'7px 12px',borderRight:'1px solid var(--border2)',borderBottom:'1px solid var(--border)',fontSize:11,color:'var(--text3)'}},'Sales & Collection'),
                React.createElement('td',{style:{padding:'7px 12px',textAlign:'right',fontWeight:700,color:(isComputed||isOpening)?'var(--accent2)':'var(--text)',borderRight:'2px solid var(--accent)',borderBottom:'1px solid var(--border)'}},salesRowTotal(sri)>0?salesRowTotal(sri).toLocaleString('en-IN'):'-'),
                ...days.map((d,ci)=>{
                  const val=salesValueAt(d.iso,sri);
                  const readOnlyHere=isComputed||(isOpening&&!isFirstEverCashDay(d.iso));
                  const isEntryRow=isSalesEntryRow(sri);
                  const entries=isEntryRow?getSalesEntries(d.iso,sri):[];
                  const hasEntryData=entries.length>0;
                  return React.createElement('td',{key:d.iso,'data-xr':globalRi,'data-xc':3+ci,style:{padding:readOnlyHere?'7px 10px':(isEntryRow?'3px 4px':'3px 6px'),textAlign:'right',borderBottom:'1px solid var(--border)',background:sel(3+ci)?'rgba(47,95,224,0.25)':(isTodayCol(d.iso)?'rgba(47,95,224,0.06)':undefined)}},
                    readOnlyHere
                      ?(val<0?React.createElement('span',{style:{fontWeight:700,color:'var(--red)'}},val.toLocaleString('en-IN')):React.createElement('span',{style:{fontWeight:700,color:'var(--accent2)'}},val>0?val.toLocaleString('en-IN'):'-'))
                      :isEntryRow
                        // Required-field row: click to open modal, same pattern as Daily Sales &
                        // Exp's Description-required rows above — more than one entry per day is
                        // fine (e.g. two separate Outstanding Sale invoices in one day).
                        ?React.createElement('div',{
                            onClick:()=>openSalesEntryModal(sri,d.iso),
                            style:{
                              display:'flex',alignItems:'center',justifyContent:'flex-end',gap:4,
                              padding:'4px 6px',cursor:'pointer',borderRadius:4,minHeight:28,
                              background:hasEntryData?'rgba(47,95,224,0.08)':'transparent',
                              border:hasEntryData?'1px solid rgba(47,95,224,0.3)':'1px dashed rgba(47,95,224,0.3)',
                            }},
                            hasEntryData
                              ?React.createElement('div',{style:{textAlign:'right'}},
                                  React.createElement('div',{style:{fontSize:12,fontWeight:600,color:'var(--accent)'}},getSalesEntryTotal(d.iso,sri).toLocaleString('en-IN')),
                                  React.createElement('div',{style:{fontSize:9,color:'var(--text3)',maxWidth:90,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},getSalesEntryLabel(sri,entries))
                                )
                              :React.createElement('span',{style:{fontSize:10,color:'var(--text3)'}},'📝 Add')
                          )
                        :React.createElement('input',{type:'number',value:isOpening?getSalesValue(d.iso,sri):getSalesValue(d.iso,sri),placeholder:'-',
                            onChange:e=>guardedSetSalesValue(d.iso,sri,e.target.value),
                            onFocus:e=>{e.target.dataset.before=e.target.value;},onBlur:e=>{const b=e.target.dataset.before;if(b!==undefined&&b!==e.target.value)logLateEdit(salonId,d.iso,SALES_ROWS[sri].name,b,e.target.value);},
                            style:{width:'100%',textAlign:'right',background:'transparent',border:'1px solid var(--border)',borderRadius:4,color:'var(--text)',fontSize:11.5,padding:'4px 6px'}})
                  );
                })
              );
            })
          )
        )
      ),
      dseCellRange.Toolbar()
    ),
    // ── EMPLOYEE ENTRY MODAL ──
    // ── Invoice entries list — shows every invoice recorded for this day+row, each editable back
    // to its full detail, plus ways to add another (existing outstanding invoice, or a brand new
    // one) so more than one invoice can be settled on the same day for the same expense row.
    // Rendered BEFORE showInvoiceForm below so that when it's opened from a button inside this
    // from a button inside this modal (without closing this one first), it stacks visually ON TOP
    // of this list instead of being hidden behind it — same overlay/z-index otherwise, so DOM order
    // alone decides which one is reachable, and the sub-modal needs to win.
    invModal&&(()=>{
      const entries=getInvEntries(invModal.iso,invModal.ri);
      const category=EXPENSE_ROWS[invModal.ri]?.name;
      const vendors=loadVendors(salonId);
      const invoices=loadVendorInvoices(salonId);
      const vendorName=(id)=>{const v=vendors.find(x=>x.id===id);return v?v.name:id;};
      const total=entries.reduce((s,e)=>s+(Number(e.amount)||0),0);
      // Amount sitting in this day's plain cell total that isn't backed by any invEntryData entry
      // — almost always older data entered before this row tracked individual invoices. Shown here
      // so it's never just silently invisible, with a way to either clear it or add an invoice to
      // account for it.
      const rawCellVal=Number(data[invModal.iso]&&data[invModal.iso][invModal.ri])||0;
      const legacyAmount=Math.max(0,rawCellVal-total);
      const clearLegacyAmount=()=>{
        if(!window.confirm('Clear the ₹'+legacyAmount.toLocaleString('en-IN')+' amount that isn\'t linked to any invoice? This only removes that untracked portion — any invoices listed above are unaffected.'))return;
        setValueNow(invModal.iso,invModal.ri,total>0?total:'');
      };
      // Outstanding invoices for this category, shown right here instead of behind a separate
      // "Add Existing Invoice" step — each ✎ reopens that invoice to its full detail (vendor, doc
      // nature, dates, GST breakup, description, attachment) so it can be corrected before today's
      // payment is recorded against it, not just a bare amount box.
      const outstanding=outstandingVendorInvoicesFor(salonId,category);
      return React.createElement('div',{className:'modal-overlay',onClick:()=>setInvModal(null)},
        React.createElement('div',{className:'modal',style:{width:520,maxHeight:'85vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
          React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}},
            React.createElement('div',{className:'modal-title',style:{marginBottom:0,paddingBottom:0,border:'none'}},category),
            React.createElement('span',{style:{fontSize:11,color:'var(--accent)',background:'rgba(47,95,224,0.12)',padding:'3px 10px',borderRadius:20,border:'1px solid rgba(47,95,224,0.3)'}},invModal.iso)
          ),
          React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:16}},'Every invoice paid against this row on this day — click ✎ to reopen one to its full detail, or add another below.'),
          entries.length===0&&legacyAmount<=0
            ?React.createElement('div',{style:{textAlign:'center',padding:'20px 0',color:'var(--text3)',fontSize:12.5}},'No invoices recorded yet for this day.')
            :React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:8,marginBottom:16}},
                entries.map(entry=>{
                  const inv=invoices.find(x=>x.id===entry.invoiceId);
                  return React.createElement('div',{key:entry.id,style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)'}},
                    React.createElement('div',null,
                      React.createElement('div',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},'Invoice # '+(inv?inv.invoiceNo||'—':'— not found —')),
                      React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)'}},inv?vendorName(inv.vendorId):'This invoice may have been deleted in Vendor Sheet')
                    ),
                    React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10}},
                      React.createElement('div',{style:{fontSize:13,fontWeight:700,color:'var(--red)'}},rupee(Number(entry.amount||0))),
                      inv&&React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Edit full invoice',onClick:()=>openEditInvoiceEntry(invModal.ri,invModal.iso,entry)},'✎'),
                      React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},title:'Remove this entry',onClick:()=>removeInvoiceEntry(invModal.ri,invModal.iso,entry)},'✕')
                    )
                  );
                }),
                legacyAmount>0&&React.createElement('div',{style:{padding:'10px 12px',background:'rgba(255,159,67,0.1)',border:'1px solid rgba(255,159,67,0.35)',borderRadius:'var(--r)'}},
                  React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
                    React.createElement('div',null,
                      React.createElement('div',{style:{fontSize:12.5,fontWeight:600,color:'var(--orange)'}},'⚠ ₹'+legacyAmount.toLocaleString('en-IN')+' not linked to any invoice'),
                      React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:2}},'Entered before invoice tracking, or from some other source. Add an invoice below to account for it, or clear it.')
                    ),
                    React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)',flexShrink:0},onClick:clearLegacyAmount},'Clear')
                  )
                ),
                (entries.length>1||(entries.length>0&&legacyAmount>0))&&React.createElement('div',{style:{textAlign:'right',fontSize:12,fontWeight:700,color:'var(--text)',paddingTop:4}},'Total: ₹'+rawCellVal.toLocaleString('en-IN'))
              ),
          outstanding.length>0&&React.createElement('div',{style:{marginBottom:16}},
            React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--accent2)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}},'Outstanding Invoices — click ✎ to review and pay'),
            React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:6}},
              outstanding.map(inv=>{
                const paidSoFar=(inv.payments||[]).reduce((s,p)=>s+(Number(p.paidAmount)||0),0);
                const balance=Math.max(0,(Number(inv.amount)||0)-paidSoFar);
                return React.createElement('div',{key:inv.id,style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)'}},
                  React.createElement('div',null,
                    React.createElement('div',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},'Invoice # '+(inv.invoiceNo||'—')),
                    React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)'}},vendorName(inv.vendorId)),
                    paidSoFar>0&&React.createElement('div',{style:{fontSize:10,color:'var(--green)',marginTop:2}},'Previously Paid: ₹'+paidSoFar.toLocaleString('en-IN'))
                  ),
                  React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10}},
                    React.createElement('div',{style:{textAlign:'right'}},
                      React.createElement('div',{style:{fontSize:13,fontWeight:700,color:'var(--red)'}},rupee(balance)),
                      React.createElement('div',{style:{fontSize:9,color:'var(--text3)'}},'of ₹'+(Number(inv.amount)||0).toLocaleString('en-IN')+' total')
                    ),
                    React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Review and pay',onClick:()=>openPayExistingInvoice(invModal.ri,invModal.iso,inv.id)},'✎')
                  )
                );
              })
            )
          ),
          React.createElement('button',{className:'btn btn-ghost',style:{width:'100%'},onClick:()=>openCreateInvoiceEntry(invModal.ri,invModal.iso)},'+ Create New Invoice'),
          React.createElement('div',{className:'modal-actions'},
            React.createElement('button',{className:'btn btn-primary',onClick:()=>setInvModal(null)},'Done')
          )
        )
      );
    })(),
    showInvoiceForm&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowInvoiceForm(null)},
      React.createElement('div',{className:'modal',style:{width:640,maxHeight:'85vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},showInvoiceForm.mode==='edit'?'Edit Invoice / Voucher':showInvoiceForm.mode==='pay'?'Review Invoice & Record Payment':'Add Invoice / Voucher'),
        React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:16,lineHeight:1.6}},
          showInvoiceForm.mode==='edit'
            ?'Editing the full invoice behind this entry — any field can be changed, including the amount paid. Updates save straight back to Vendor Sheet.'
            :showInvoiceForm.mode==='pay'
            ?'This invoice already exists in Vendor Sheet — correct anything that needs it, then confirm today\'s payment below.'
            :'Add a new '+showInvoiceForm.category+' invoice — it saves directly to Vendor Sheet, and this entry is added to today\'s cell right after.'),
        React.createElement('div',{className:'form-row cols3'},
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Vendor *'),
            React.createElement('select',{className:'form-control',value:invForm.vendorId,onChange:ic2('vendorId'),autoFocus:true},
              React.createElement('option',{value:''},'— Select Vendor —'),
              React.createElement('option',{value:'__new__'},'+ Add New Vendor'),
              loadVendors(salonId).filter(v=>v.status==='Active').map(v=>React.createElement('option',{key:v.id,value:v.id},v.name))
            )),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Doc Nature *'),
            React.createElement('select',{className:'form-control',value:invForm.docNature,onChange:ic2('docNature')},
              ['Tax Invoice','Invoice','Performa Invoice'].map(d=>React.createElement('option',{key:d},d)))),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Invoice / Voucher No. *'),
            React.createElement('input',{className:'form-control',value:invForm.invoiceNo,onChange:ic2('invoiceNo'),placeholder:'e.g. INV-2024-001'}))
        ),
        invForm.vendorId==='__new__'&&React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'14px',marginBottom:14}},
          React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10}},'New Vendor — same form as Vendor Sheet'),
          React.createElement('div',{className:'form-row cols2'},
            React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-40'},'Vendor Name *'),React.createElement('input',{id:'f-40',className:'form-control',value:invForm.newVendorName,onChange:ic2('newVendorName'),placeholder:'e.g. L\'Oreal India Pvt Ltd',autoFocus:true})),
            React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-41'},'Category'),React.createElement('select',{id:'f-41',className:'form-control',value:invForm.newVendorCat,onChange:ic2('newVendorCat')},withBizCategories(['Purchase of Cosmetic','Housekeeping','Equipment','Utilities','Rent','DG Rent','Drycleaning Expenses','Professional Fee','Staff Room Rent','Royalty','Electricity Expenses','Uniform Expenses','Telephone & Internet Expenses','Maintenance Expenses','Marketing','Other'],salonId).map(c=>React.createElement('option',{key:c},c))))
          ),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-42'},'Address'),React.createElement('textarea',{id:'f-42',className:'form-control',rows:2,value:invForm.newVendorAddress,onChange:ic2('newVendorAddress'),placeholder:'Full address with PIN code',style:{resize:'vertical'}})),
          React.createElement('div',{className:'form-row cols2'},
            React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-43'},'GST Number'),React.createElement('input',{id:'f-43',className:'form-control',value:invForm.newVendorGst,onChange:ic2('newVendorGst'),placeholder:'e.g. 07AABCX1234R1ZP',style:{textTransform:'uppercase'}})),
            React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-44'},'Payment Terms'),React.createElement('select',{id:'f-44',className:'form-control',value:invForm.newVendorTerms,onChange:ic2('newVendorTerms')},['7 days','15 days','30 days','45 days','60 days','90 days','Advance'].map(t=>React.createElement('option',{key:t},t))))
          ),
          React.createElement('div',{className:'form-row cols2'},
            React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-45'},'Contact Person Name'),React.createElement('input',{id:'f-45',className:'form-control',value:invForm.newVendorContact,onChange:ic2('newVendorContact'),placeholder:'Contact person'})),
            React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-46'},'Mobile No.'),React.createElement('input',{id:'f-46',className:'form-control',value:invForm.newVendorPhone,onChange:ic2('newVendorPhone'),placeholder:'98xxxxxxxx'}))
          ),
          React.createElement('div',{className:'form-row cols2'},
            React.createElement('div',{className:'form-group',style:{marginBottom:0}},React.createElement('label',{htmlFor:'f-47'},'Vendor ID (auto if blank)'),React.createElement('input',{id:'f-47',className:'form-control',value:invForm.newVendorId,onChange:ic2('newVendorId'),placeholder:'e.g. V005'})),
            React.createElement('div',{className:'form-group',style:{marginBottom:0}},React.createElement('label',{htmlFor:'f-48'},'Status'),React.createElement('select',{id:'f-48',className:'form-control',value:invForm.newVendorStatus,onChange:ic2('newVendorStatus')},['Active','Inactive'].map(s=>React.createElement('option',{key:s},s))))
          ),
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'14px 0 8px',paddingTop:10,borderTop:'1px solid var(--border)'}},'Bank Details (for bank payments — optional)'),
          React.createElement('div',{className:'form-row cols2'},
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Bank Name'),React.createElement(BankNameField,{value:invForm.newVendorBankName,ifsc:invForm.newVendorIfsc,onChange:v=>setInvForm(f=>({...f,newVendorBankName:v}))})),
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Account Holder Name'),React.createElement('input',{className:'form-control',value:invForm.newVendorAccountHolder,onChange:ic2('newVendorAccountHolder'),placeholder:'As per bank records'}))
          ),
          React.createElement('div',{className:'form-row cols2'},
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Account Number'),React.createElement('input',{className:'form-control',value:invForm.newVendorAccountNo,onChange:ic2('newVendorAccountNo'),placeholder:'Account number',inputMode:'numeric'}),invForm.newVendorAccountNo&&!isValidBankAccountNo(invForm.newVendorAccountNo)&&fieldWarning('Account number must be 9 to 18 digits.')),
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'IFSC Code'),React.createElement('input',{className:'form-control',value:invForm.newVendorIfsc,onChange:ic2('newVendorIfsc'),placeholder:'HDFC0001234',style:{textTransform:'uppercase'}}),invForm.newVendorIfsc&&!isValidIfscFormat(invForm.newVendorIfsc)&&fieldWarning('Not a valid IFSC (e.g. HDFC0001234).'))
          ),
          React.createElement('div',{className:'form-group',style:{marginBottom:0}},React.createElement('label',null,'Email (optional)'),React.createElement('input',{className:'form-control',value:invForm.newVendorEmail,onChange:ic2('newVendorEmail'),placeholder:'vendor@company.com',type:'email'}),invForm.newVendorEmail&&!isValidEmailFormat(invForm.newVendorEmail)&&fieldWarning('Not a valid email.')),
          salon&&salon.tdsApplicable&&React.createElement('div',{style:{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px',marginTop:12}},
            React.createElement('label',{style:{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginBottom:invForm.newVendorTdsApplicable?10:0}},
              React.createElement('input',{type:'checkbox',checked:!!invForm.newVendorTdsApplicable,onChange:e=>setInvForm(f=>({...f,newVendorTdsApplicable:e.target.checked}))}),
              React.createElement('span',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},'TDS Applicable on payments to this vendor')
            ),
            invForm.newVendorTdsApplicable&&React.createElement('div',{className:'form-row cols2'},
              React.createElement('div',{className:'form-group',style:{marginBottom:0}},React.createElement('label',null,'Section'),
                React.createElement('select',{className:'form-control',value:invForm.newVendorTdsSection,onChange:e=>{
                  const sec=tdsSectionsAsOf().find(s=>s.code===e.target.value);
                  setInvForm(f=>({...f,newVendorTdsSection:e.target.value,newVendorTdsRate:sec?sec.rate:f.newVendorTdsRate}));
                }},[React.createElement('option',{key:'',value:''},'Select Section'),...tdsSectionsAsOf().map(s=>React.createElement('option',{key:s.code,value:s.code},s.label))])),
              React.createElement('div',{className:'form-group',style:{marginBottom:0}},React.createElement('label',{htmlFor:'f-49'},'Rate (%)'),React.createElement('input',{id:'f-49',className:'form-control',type:'number',step:'0.1',value:invForm.newVendorTdsRate,onChange:ic2('newVendorTdsRate'),placeholder:'e.g. 2'}))
            )
          )
        ),
        React.createElement('div',{className:'form-group'},React.createElement('label',null,'Category *'),
          React.createElement('input',{className:'form-control',value:showInvoiceForm.category,disabled:true,style:{opacity:0.7}})),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Invoice Date *'),
            React.createElement('input',{type:'date',className:'form-control',value:invForm.invoiceDate,onChange:ic2('invoiceDate')})),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Booking Date'),
            React.createElement('input',{type:'date',className:'form-control',value:invForm.bookingDate,onChange:ic2('bookingDate')}))
        ),
        React.createElement('div',{className:'form-row cols3'},
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Taxable Value (₹)'),
            React.createElement('input',{type:'number',className:'form-control',value:invForm.taxable,onChange:ic2('taxable'),placeholder:'0'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'IGST (₹)'),
            React.createElement('input',{type:'number',className:'form-control',value:invForm.igst,onChange:ic2('igst'),placeholder:'0',disabled:invSupply2==='intra',title:invSupply2==='intra'?gstSupplyNote('intra'):''})),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'CGST (₹)'),
            React.createElement('input',{type:'number',className:'form-control',value:invForm.cgst,onChange:ic2('cgst'),placeholder:'0',disabled:invSupply2==='inter',title:invSupply2==='inter'?gstSupplyNote('inter'):''}))
        ),
        React.createElement('div',{className:'form-row cols3'},
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'SGST (₹)'),
            React.createElement('input',{type:'number',className:'form-control',value:invForm.sgst,onChange:ic2('sgst'),placeholder:'0',disabled:invSupply2==='inter',title:invSupply2==='inter'?gstSupplyNote('inter'):''}),
            invSupply2&&React.createElement('div',{style:{fontSize:11,color:'var(--accent)',marginTop:4}},'ℹ '+gstSupplyNote(invSupply2))),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Round Off (₹)'),
            React.createElement('input',{type:'number',className:'form-control',value:invForm.roundOff,onChange:ic2('roundOff'),placeholder:'0'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Invoice Total (₹)'),
            React.createElement('input',{className:'form-control',value:invFormTotal.toLocaleString('en-IN'),disabled:true,style:{opacity:0.85,fontWeight:700,color:'var(--accent)'}}))
        ),
        React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:-6,marginBottom:14}},'Auto-calculated: Taxable Value + IGST + CGST + SGST + Round Off'),
        React.createElement('div',{className:'form-group'},React.createElement('label',null,'Due Date'),
          React.createElement('input',{type:'date',className:'form-control',value:invForm.dueDate,onChange:ic2('dueDate')})),
        React.createElement('div',{className:'form-group'},React.createElement('label',null,'Description'),
          React.createElement('input',{className:'form-control',value:invForm.desc,onChange:ic2('desc'),placeholder:'e.g. Hair products — January batch'})),
        React.createElement('div',{className:'form-group',style:{marginBottom:14}},
          React.createElement('label',null,'Attach Invoice / Voucher Copy'+(outletSettings(salonId).attachmentRequired?' * (required for this outlet)':'')),
          React.createElement('div',{style:{background:'var(--bg3)',border:'1px dashed '+(outletSettings(salonId).attachmentRequired&&!invForm.attachment?'var(--orange)':'var(--border2)'),borderRadius:'var(--r)',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}},
            React.createElement('input',{type:'file',accept:'image/*,.pdf',style:{display:'none'},id:'daily-inv-attach',onChange:e=>{const f=e.target.files[0];if(f)readFileAsAttachment(f,rec=>{setInvForm(prev=>({...prev,attachment:rec}));crToast('Attachment added','success');},err=>crToastErr(err==='size'?'That file is too large (max 4MB).':"Couldn't read that file — please try again."));e.target.value='';}}),
            React.createElement('label',{htmlFor:'daily-inv-attach',style:{cursor:'pointer',fontSize:12,color:'var(--accent)',display:'flex',alignItems:'center',gap:6}},
              '📎 ',invForm.attachment?(typeof invForm.attachment==='string'?invForm.attachment:invForm.attachment.name):'Choose file (JPG / PDF)'
            ),
            invForm.attachment&&typeof invForm.attachment!=='string'&&invForm.attachment.dataUrl&&React.createElement('span',{title:'Download',style:{fontSize:12,color:'var(--blue)',cursor:'pointer'},onClick:()=>downloadAttachment(invForm.attachment,'attachment')},'⬇'),
            invForm.attachment&&React.createElement('button',{style:{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:12,marginLeft:'auto'},onClick:()=>{if(confirm('Remove the attached file?'))setInvForm(f=>({...f,attachment:null}));}},'✕ Remove')
          )
        ),
        (()=>{
          const otherPaid=(showInvoiceForm.mode==='edit'||showInvoiceForm.mode==='pay')
            ?(()=>{const inv=loadVendorInvoices(salonId).find(x=>x.id===showInvoiceForm.invoiceId);
                if(!inv)return 0;
                return(inv.payments||[]).filter(p=>p.id!==showInvoiceForm.paymentId).reduce((s,p)=>s+(Number(p.paidAmount)||0),0);})()
            :0;
          return React.createElement('div',{className:'form-group',style:{marginBottom:0,background:'rgba(76,175,125,0.08)',border:'1px solid rgba(76,175,125,0.3)',borderRadius:'var(--r)',padding:'12px 14px'}},
            otherPaid>0&&React.createElement('div',{style:{fontSize:11,color:'var(--text2)',marginBottom:10,paddingBottom:10,borderBottom:'1px solid rgba(76,175,125,0.25)'}},
              'Previously Paid (other payments on this invoice): ₹'+otherPaid.toLocaleString('en-IN')+' — this invoice\'s total will show ₹'+(otherPaid+(Number(invForm.amountPaid)||0)).toLocaleString('en-IN')+' paid once saved.'),
            React.createElement('label',{style:{color:'var(--green)',fontWeight:600}},'Amount Paid (₹) *'),
            React.createElement('input',{type:'number',min:0,className:'form-control',value:invForm.amountPaid,onChange:ic2('amountPaid'),placeholder:'0'}),
            // One payment that also covers other bills of this vendor — tick their invoice nos.
            showInvoiceForm.mode==='pay'&&(()=>{
              const all=loadVendorInvoices(salonId);
              const balOf=i=>Math.max(0,(Number(i.amount)||0)-(i.payments||[]).reduce((t,x)=>t+(Number(x.paidAmount)||0),0));
              const cur=all.find(x=>x.id===showInvoiceForm.invoiceId);
              const others=cur?all.filter(i=>i.id!==cur.id&&String(i.vendorId)===String(cur.vendorId)&&i.docNature!=='Performa Invoice'&&balOf(i)>0.5):[];
              if(!others.length)return null;
              const totalFor=set=>Math.round((balOf(cur)+others.filter(o=>set.has(o.id)).reduce((t,o)=>t+balOf(o),0))*100)/100;
              const toggle=id=>{const n=new Set(dseAlso);n.has(id)?n.delete(id):n.add(id);setDseAlso(n);setInvForm(f=>({...f,amountPaid:String(totalFor(n))}));};
              const dk=i=>{const q=parseInvoiceDateFlexible(i.invoiceDate);return q?q.y*10000+q.m*100+q.d:0;};
              const grp=[cur,...others.filter(o=>dseAlso.has(o.id))].sort((a,b)=>dk(a)-dk(b));
              const split=dseAlso.size?allocateOldestFirst(grp.map(i=>({id:i.id,no:i.invoiceNo,balance:balOf(i)})),invForm.amountPaid):[];
              return React.createElement('div',{style:{marginTop:10,paddingTop:8,borderTop:'1px dashed rgba(76,175,125,0.4)',fontSize:12}},
                React.createElement('div',{style:{fontWeight:600,color:'var(--text)',marginBottom:4}},'Does this payment also cover other invoices of this vendor? Tick the invoice nos.:'),
                React.createElement('div',{style:{maxHeight:130,overflowY:'auto'}},others.sort((a,b)=>dk(a)-dk(b)).map(o=>React.createElement('label',{key:o.id,style:{display:'flex',gap:8,alignItems:'center',padding:'2px 0',cursor:'pointer'}},
                  React.createElement('input',{type:'checkbox',checked:dseAlso.has(o.id),onChange:()=>toggle(o.id)}),
                  React.createElement('span',{style:{fontFamily:'monospace',fontSize:11,minWidth:120}},o.invoiceNo),React.createElement('span',{style:{minWidth:84}},o.invoiceDate),React.createElement('span',null,'balance ₹'+Math.round(balOf(o)).toLocaleString('en-IN'))))),
                dseAlso.size>0&&React.createElement('div',{style:{marginTop:6,color:'var(--text2)'}},'Split oldest first: '+split.map(a=>a.no+' ₹'+a.alloc.toLocaleString('en-IN')).join(' · ')));
            })(),
            React.createElement('div',{style:{marginTop:10}},
              React.createElement('label',{style:{color:'var(--green)',fontWeight:600}},'Date of Payment'),
              React.createElement('input',{type:'date',className:'form-control',value:invForm.paymentDate,onChange:ic2('paymentDate')})
            ),
            React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:6}},
              showInvoiceForm.mode==='edit'
                ?'Changing Date of Payment moves this entry to that day\'s cell instead of today\'s.'
                :showInvoiceForm.mode==='pay'
                ?'This records a new payment against the invoice above — its other details are saved too if you changed anything.'
                :'Required — an invoice can\'t be added from here without recording the payment against it in the same step. Date of Payment defaults to the day column you clicked.')
          );
        })(),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowInvoiceForm(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:saveInvoiceForm},showInvoiceForm.mode==='edit'?'Update Invoice':showInvoiceForm.mode==='pay'?'Save Payment':'Save Invoice')
        )
      )
    ),
    empModal&&React.createElement('div',{
      className:'modal-overlay',onClick:()=>setEmpModal(null),
      style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}},
      React.createElement('div',{
        onClick:e=>e.stopPropagation(),
        style:{background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:'var(--r3)',padding:24,width:EXPENSE_ROWS[empModal.ri]?.name===DAILY_ADVANCE_SYNC_ROW?640:520,maxWidth:'92vw',maxHeight:'85vh',overflowY:'auto',boxShadow:'0 8px 40px rgba(0,0,0,0.6)'}},

        // Modal title
        React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border)'}},
          React.createElement('div',null,
            React.createElement('div',{style:{fontFamily:'var(--font2)',fontSize:17,color:'var(--text)'}},EXPENSE_ROWS[empModal.ri]?.name),
            React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:3}},
              isOutstandingRow(empModal.ri)
                ? (isPrevMonthLockedFor(EXPENSE_ROWS[empModal.ri]?.name,empModal.iso)
                    ? '⚠ Only employees still owed for the previous month (incl. those who\'ve since left) — the amount shown is a reference figure, not a tracked balance'
                    : '🔒 The previous month isn\'t locked yet on '+(EXPENSE_ROWS[empModal.ri]?.name==='Previous Month Salary'?'Salary Working':'Incentive Working')+' — lock it there first, then it\'ll show up here')
                : EXPENSE_ROWS[empModal.ri]?.name===DAILY_ADVANCE_SYNC_ROW
                ? '💵 Cash advance — always Payment Mode Cash. For Bank Transfer, use the Advances sheet instead.'
                : '👤 Active employees only — select and enter amount'
            )
          ),
          React.createElement('span',{style:{fontSize:11,color:'var(--accent)',background:'rgba(47,95,224,0.12)',padding:'3px 10px',borderRadius:20,border:'1px solid rgba(47,95,224,0.3)'}},empModal.iso)
        ),

        modalDI.length>0&&React.createElement('div',{style:{marginBottom:12,padding:'8px 12px',borderRadius:'var(--r)',background:'rgba(47,95,224,0.08)',border:'1px solid rgba(47,95,224,0.25)',fontSize:12}},
          React.createElement('div',{style:{fontWeight:600,marginBottom:4}},'From Daily Incentive Sheet (Cash) — change these on that sheet'),
          modalDI.map((e,i)=>React.createElement('div',{key:i,style:{display:'flex',justifyContent:'space-between'}},
            React.createElement('span',null,e.empName+(e.note?' — '+e.note:'')),React.createElement('b',null,'₹'+(Number(e.amount)||0).toLocaleString('en-IN'))))),
        // Entries list
        React.createElement('div',{style:{marginBottom:14}},
          modalEntries.map((entry,i)=>{
            const empList=getOutstandingEmployees(EXPENSE_ROWS[empModal.ri]?.name,empModal.iso);
            // Once an employee has been picked in another row of this same modal, drop them from
            // every other row's dropdown — keeps the same employee from accidentally being paid
            // twice in one sitting for this row/day. The row that actually has them selected still
            // shows them (so its own current value doesn't just disappear).
            const chosenElsewhere=new Set(modalEntries.filter((e2,idx)=>idx!==i&&e2.empName).map(e2=>e2.empName));
            const empOptions=empList.filter(e=>e.name===entry.empName||!chosenElsewhere.has(e.name));
            const filtered=empOptions.filter(e=>!modalSearch||e.name.toLowerCase().includes(modalSearch.toLowerCase()));
            const isAdv=EXPENSE_ROWS[empModal.ri]?.name===DAILY_ADVANCE_SYNC_ROW;
            const showMode=PAYMENT_MODE_ROWS.has(EXPENSE_ROWS[empModal.ri]?.name);
            const schedTotal=(entry.schedule||[]).reduce((s,r)=>s+(Number(r.amount)||0),0);
            return React.createElement('div',{key:i,style:{
              marginBottom:10,background:'var(--bg3)',borderRadius:'var(--r)',padding:'10px 12px',
              border:'1px solid var(--border)'
            }},
              React.createElement('div',{style:{
                display:'grid',gridTemplateColumns:showMode?'1fr 100px 130px 32px':'1fr 120px 32px',gap:8,alignItems:'center'
              }},
                // Employee dropdown
                React.createElement('div',null,
                  React.createElement('div',{style:{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4,fontWeight:600}},'Employee Name'),
                  React.createElement('select',{
                    className:'form-control',
                    value:entry.empName,
                    onChange:e=>updateModalRow(i,'empName',e.target.value),
                    style:{fontSize:12}
                  },
                    React.createElement('option',{value:''},'— Select Employee —'),
                    empOptions.map(e=>React.createElement('option',{key:e.id,value:e.name},
                      e.name+(e.status!=='Active'?' — Left':'')+(isOutstandingRow(empModal.ri)?' (₹'+prevMonthBalanceFor(e,EXPENSE_ROWS[empModal.ri]?.name,empModal.iso).toLocaleString('en-IN')+' due)':'')
                    ))
                  )
                ),
                // Amount — Penalties shows a visual "−" since it's a deduction, not an earning;
                // the stored value stays a plain positive number, same as every other row here,
                // since that's what penaltySumFor and everywhere downstream already expects and
                // subtracts explicitly.
                (()=>{
                  const isPenalty=EXPENSE_ROWS[empModal.ri]?.name==='Penalties';
                  return React.createElement('div',null,
                    React.createElement('div',{style:{fontSize:10,color:isPenalty?'var(--red)':'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4,fontWeight:600}},isPenalty?'Amount (− ₹)':'Amount (₹)'),
                    React.createElement('div',{style:{position:'relative'}},
                      isPenalty&&React.createElement('span',{style:{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:'var(--red)',fontWeight:700,fontSize:13,pointerEvents:'none'}},'−'),
                      React.createElement('input',{
                        type:'number',min:0,className:'form-control',
                        value:entry.amount,
                        onChange:e=>updateModalRow(i,'amount',e.target.value),
                        placeholder:'0',style:{fontSize:12,color:isPenalty?'var(--red)':undefined,paddingLeft:isPenalty?18:undefined,fontWeight:isPenalty?600:400}
                      })
                    )
                  );
                })(),
                // Mode of Payment — Tip To Employee / Staff Over Time only
                showMode&&React.createElement('div',null,
                  React.createElement('div',{style:{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4,fontWeight:600}},'Mode of Payment'),
                  React.createElement('select',{
                    className:'form-control',
                    value:entry.mode||'Cash',
                    onChange:e=>updateModalRow(i,'mode',e.target.value),
                    style:{fontSize:12}
                  },PAYMENT_MODE_OPTIONS.map(m=>React.createElement('option',{key:m,value:m},m)))
                ),
                // Remove row
                React.createElement('div',{style:{paddingTop:18}},
                  modalEntries.length>1&&React.createElement('button',{'aria-label':'Close',
                    onClick:()=>removeModalRow(i),
                    style:{background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.3)',color:'var(--red)',
                      width:32,height:32,borderRadius:'var(--r)',cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}
                  },'✕')
                )
              ),
              isAdv&&React.createElement('div',{style:{marginTop:10,paddingTop:10,borderTop:'1px dashed var(--border)'}},
                React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}},
                  React.createElement('div',null,
                    React.createElement('div',{style:{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4,fontWeight:600}},'Payment Mode'),
                    React.createElement('div',{className:'form-control',style:{fontSize:12,background:'var(--bg2)',color:'var(--text2)',display:'flex',alignItems:'center',gap:6}},'💵 Cash')
                  ),
                  React.createElement('div',null,
                    React.createElement('div',{style:{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4,fontWeight:600}},'Monthly Deduction (₹)'),
                    React.createElement('input',{type:'number',min:0,className:'form-control',value:entry.repayment||'',onChange:e=>updateModalRow(i,'repayment',e.target.value),placeholder:'0',style:{fontSize:12}})
                  )
                ),
                React.createElement('div',{style:{marginBottom:8}},
                  React.createElement('div',{style:{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4,fontWeight:600}},'Recover Against'),
                  React.createElement('div',{style:{display:'flex',gap:8}},
                    ['Salary','Incentive'].map(m=>{
                      const active=(entry.deductFrom||'Salary')===m;
                      const tint=m==='Incentive'?'var(--blue)':'var(--accent2)';
                      return React.createElement('button',{key:m,type:'button',onClick:()=>updateModalRow(i,'deductFrom',m),
                        style:{flex:1,padding:'7px 10px',borderRadius:'var(--r)',cursor:'pointer',fontSize:12,fontWeight:600,
                          border:active?'1.5px solid '+tint:'1px solid var(--border)',
                          background:active?(m==='Incentive'?'rgba(74,158,255,0.1)':'rgba(47,95,224,0.12)'):'var(--bg2)',
                          color:active?tint:'var(--text3)'}
                      },(m==='Incentive'?'💰 ':'🏦 ')+m);
                    })
                  )
                ),
                React.createElement('div',{style:{marginBottom:8}},
                  React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}},
                    React.createElement('div',{style:{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}},'Deduction Plan — month-wise'),
                    React.createElement('div',{style:{display:'flex',gap:6}},
                      React.createElement('input',{type:'month',className:'form-control',style:{width:'auto',fontSize:11,padding:'4px 8px'},value:entry.deductionStart||nextMonthFirstYM(),onChange:e=>updateModalRow(i,'deductionStart',e.target.value)}),
                      React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:()=>regenerateEntrySchedule(i),title:'Split the Amount across Monthly Deduction-sized installments'},'🔄 Generate')
                    )
                  ),
                  (entry.schedule&&entry.schedule.length>0)
                    ?React.createElement('div',null,
                        entry.schedule.map((row,si)=>React.createElement('div',{key:si,style:{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:6,marginBottom:5,alignItems:'center'}},
                          React.createElement('input',{type:'month',className:'form-control',style:{fontSize:11.5},value:row.month,onChange:e=>setEntryScheduleRow(i,si,'month',e.target.value)}),
                          React.createElement('input',{type:'number',className:'form-control',style:{fontSize:11.5},value:row.amount,onChange:e=>setEntryScheduleRow(i,si,'amount',e.target.value)}),
                          React.createElement('button',{type:'button','aria-label':'Remove month',className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>removeEntryScheduleRow(i,si)},React.createElement(IconTrash,{size:12}))
                        )),
                        React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
                          React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:()=>addEntryScheduleRow(i)},'+ Add Month'),
                          React.createElement('span',{style:{fontSize:11,color:schedTotal===Number(entry.amount||0)?'var(--green)':'var(--orange)'}},
                            'Planned: ₹'+schedTotal.toLocaleString('en-IN')+' of ₹'+Number(entry.amount||0).toLocaleString('en-IN')
                          )
                        )
                      )
                    :React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},'Enter Amount and Monthly Deduction, then Generate to plan the recovery month by month — optional, leave blank to just record the advance.')
                ),
                React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}},
                  React.createElement('div',null,
                    React.createElement('div',{style:{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4,fontWeight:600}},'Reason'),
                    React.createElement('input',{className:'form-control',value:entry.reason||'',onChange:e=>updateModalRow(i,'reason',e.target.value),placeholder:'Reason for advance',style:{fontSize:12}})
                  ),
                  React.createElement('div',null,
                    React.createElement('div',{style:{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4,fontWeight:600}},'Approved By'),
                    React.createElement('input',{className:'form-control',value:entry.approvedBy||'',onChange:e=>updateModalRow(i,'approvedBy',e.target.value),placeholder:'Approver name',style:{fontSize:12}})
                  )
                )
              )
            );
          })
        ),

        // Summary bar
        modalEntries.filter(e=>e.empName&&Number(e.amount)>0).length>0&&React.createElement('div',{style:{
          background:'rgba(78,205,196,0.1)',border:'1px solid rgba(78,205,196,0.25)',borderRadius:'var(--r)',
          padding:'8px 12px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center'
        }},
          React.createElement('div',{style:{fontSize:12,color:'var(--teal)'}},getEmpLabel(modalEntries.filter(function(e){return e.empName&&Number(e.amount)>0;}))),
          React.createElement('div',{style:{fontSize:14,fontWeight:700,color:'var(--teal)'}},
            '₹'+modalEntries.filter(e=>Number(e.amount)>0).reduce((s,e)=>s+Number(e.amount),0).toLocaleString('en-IN')
          )
        ),

        // Add another employee row
        React.createElement('button',{
          onClick:addModalRow,
          style:{width:'100%',background:'transparent',border:'1px dashed var(--border2)',color:'var(--text3)',
            padding:'8px',borderRadius:'var(--r)',cursor:'pointer',fontSize:12,marginBottom:16,
            fontFamily:'var(--font)'}
        },'+ Add Another Employee'),

        // Modal actions
        React.createElement('div',{style:{display:'flex',gap:10,justifyContent:'flex-end',paddingTop:14,borderTop:'1px solid var(--border)'}},
          React.createElement('button',{
            className:'btn btn-ghost',
            onClick:()=>setEmpModal(null)
          },'Cancel'),
          React.createElement('button',{
            className:'btn btn-danger btn-sm',
            onClick:()=>{
              // Clear removes only what was typed here — Daily Incentive Sheet cash entries stay
              // (change those on that sheet).
              const keepDI=modalDI;const keepTot=keepDI.reduce((s,e)=>s+(Number(e.amount)||0),0);
              setEmpData(prev=>{const n={...prev};if(n[empModal.iso]){n[empModal.iso]={...n[empModal.iso]};if(keepDI.length)n[empModal.iso][empModal.ri]=keepDI;else delete n[empModal.iso][empModal.ri];}return n;});
              setValue(empModal.iso,empModal.ri,keepTot>0?keepTot:'');
              syncDailyIncentiveEntries(empModal.iso,empModal.ri,[]);
              syncAdvancesFromDSE(empModal.iso,empModal.ri,[]);
              syncPenaltiesFromDSE(empModal.iso,empModal.ri,[]);
              setEmpModal(null);
            }
          },'🗑 Clear'),
          React.createElement('button',{
            className:'btn btn-primary',
            onClick:saveEmpModal
          },'✓ Save Entries')
        )
      )
    ),

    // Description-row modal — same shape as the employee modal above, but a required free-text
    // Description per line instead of picking an employee.
    descModal&&React.createElement('div',{
      className:'modal-overlay',onClick:()=>setDescModal(null),
      style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}},
      React.createElement('div',{
        onClick:e=>e.stopPropagation(),
        style:{background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:'var(--r3)',padding:24,width:520,maxWidth:'92vw',maxHeight:'85vh',overflowY:'auto',boxShadow:'0 8px 40px rgba(0,0,0,0.6)'}},

        React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border)'}},
          React.createElement('div',null,
            React.createElement('div',{style:{fontFamily:'var(--font2)',fontSize:17,color:'var(--text)'}},EXPENSE_ROWS[descModal.ri]?.name),
            React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:3}},'📝 A Description is required for every entry — add another line for more than one expense this day')
          ),
          React.createElement('span',{style:{fontSize:11,color:'var(--accent)',background:'rgba(47,95,224,0.12)',padding:'3px 10px',borderRadius:20,border:'1px solid rgba(47,95,224,0.3)'}},descModal.iso)
        ),

        React.createElement('div',{style:{marginBottom:14}},
          modalDescEntries.map((entry,i)=>
            React.createElement('div',{key:i,style:{display:'flex',gap:8,alignItems:'center',marginBottom:8}},
              React.createElement('input',{
                type:'text',placeholder:'Description (required)',value:entry.description,
                onChange:e=>updateDescModalRow(i,'description',e.target.value),
                style:{flex:1,padding:'8px 10px',fontSize:12.5,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',color:'var(--text)'}
              }),
              React.createElement('input',{
                type:'number',min:0,placeholder:'Amount',value:entry.amount,
                onChange:e=>updateDescModalRow(i,'amount',e.target.value),
                style:{width:120,padding:'8px 10px',fontSize:12.5,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',color:'var(--text)',textAlign:'right'}
              }),
              React.createElement('button',{
                'aria-label':'Remove entry',className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},
                onClick:()=>removeDescModalRow(i),
                disabled:modalDescEntries.length===1
              },React.createElement(IconTrash,{size:14}))
            )
          ),
          React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:addDescModalRow,style:{marginTop:4}},'+ Add another entry')
        ),

        React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:14,borderTop:'1px solid var(--border)'}},
          React.createElement('div',{style:{fontSize:12,color:'var(--accent)'}},
            'Total: ₹'+modalDescEntries.reduce((s,e)=>s+(Number(e.amount)||0),0).toLocaleString('en-IN')
          ),
          React.createElement('div',{style:{display:'flex',gap:8}},
            React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setDescModal(null)},'Cancel'),
            getDescEntries(descModal.iso,descModal.ri).length>0&&React.createElement('button',{
              className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},
              onClick:()=>{
                setDescData(prev=>{const n={...prev};if(n[descModal.iso])delete n[descModal.iso][descModal.ri];return n;});
                setValue(descModal.iso,descModal.ri,'');
                setDescModal(null);
              }
            },'🗑 Clear'),
            React.createElement('button',{className:'btn btn-primary',onClick:saveDescModal},'✓ Save Entries')
          )
        )
      )
    ),

    // Sales-entry modal — Outstanding Sale / Outstanding Recovery / Cash Received / Cash
    // Handover. Same shape as the Description modal above, but with whichever fields
    // SALES_ENTRY_FIELDS specifies for that row (Invoice No + Person Name, Invoice No + Mode of
    // Payment, Received From, or Handed Over To).
    salesEntryModal&&React.createElement('div',{
      className:'modal-overlay',onClick:()=>setSalesEntryModal(null),
      style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}},
      React.createElement('div',{
        onClick:e=>e.stopPropagation(),
        style:{background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:'var(--r3)',padding:24,width:560,maxWidth:'92vw',maxHeight:'85vh',overflowY:'auto',boxShadow:'0 8px 40px rgba(0,0,0,0.6)'}},

        React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border)'}},
          React.createElement('div',null,
            React.createElement('div',{style:{fontFamily:'var(--font2)',fontSize:17,color:'var(--text)'}},SALES_ROWS[salesEntryModal.sri]?.name),
            React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:3}},
              '📝 '+(SALES_ENTRY_FIELDS[salesEntryModal.sri]||[]).map(f=>f.label).join(' and ')+' required for every entry — add another line for more than one this day'
            )
          ),
          React.createElement('span',{style:{fontSize:11,color:'var(--accent)',background:'rgba(47,95,224,0.12)',padding:'3px 10px',borderRadius:20,border:'1px solid rgba(47,95,224,0.3)'}},salesEntryModal.iso)
        ),

        React.createElement('div',{style:{marginBottom:14}},
          modalSalesEntries.map((entry,i)=>{
            // Outstanding Recovery: warn (don't block) if this invoice's total across all lines
            // in this save exceeds what's actually still due against it.
            const overDue=salesEntryModal.sri===IDX_OREC?overDueWarningFor(entry,modalSalesEntries,salesEntryModal.iso):null;
            const overDueWarning=overDue&&'⚠ '+overDue.invoiceNo+': ₹'+Math.round(overDue.entered).toLocaleString('en-IN')+' entered exceeds the ₹'+Math.round(overDue.due).toLocaleString('en-IN')+' actually due on this invoice';
            return React.createElement('div',{key:i,style:{marginBottom:8}},
              React.createElement('div',{style:{display:'flex',gap:8,alignItems:'center'}},
                (SALES_ENTRY_FIELDS[salesEntryModal.sri]||[]).map(f=>{
                  if(f.type==='invoiceSelect'){
                    const outstanding=outstandingSaleInvoices();
                    // Keep the currently-selected invoice in the list even if it's no longer
                    // outstanding elsewhere (e.g. reopening an existing entry) — the dropdown
                    // should never silently drop what's already saved here.
                    const current=entry[f.key];
                    const options=current&&!outstanding.some(o=>o.invoiceNo===current)
                      ?[{invoiceNo:current,personName:'',remaining:null},...outstanding]
                      :outstanding;
                    return React.createElement('select',{key:f.key,value:current||'',
                      onChange:e=>updateSalesEntryModalRow(i,f.key,e.target.value),
                      style:{flex:1,padding:'8px 10px',fontSize:12.5,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',color:'var(--text)'}},
                      React.createElement('option',{value:''},options.length?'— Select Invoice No —':'No outstanding invoices'),
                      options.map(o=>React.createElement('option',{key:o.invoiceNo,value:o.invoiceNo},
                        o.invoiceNo+(o.personName?' — '+o.personName:'')+(o.remaining!=null?' (₹'+o.remaining.toLocaleString('en-IN')+' due)':'')
                      ))
                    );
                  }
                  return f.type==='select'
                    ?React.createElement('select',{key:f.key,value:entry[f.key]||f.options[0],
                        onChange:e=>updateSalesEntryModalRow(i,f.key,e.target.value),
                        style:{flex:1,padding:'8px 10px',fontSize:12.5,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',color:'var(--text)'}},
                        f.options.map(o=>React.createElement('option',{key:o,value:o},o))
                      )
                    :React.createElement('input',{key:f.key,type:'text',placeholder:f.label+' (required)',value:entry[f.key]||'',
                        onChange:e=>updateSalesEntryModalRow(i,f.key,e.target.value),
                        style:{flex:1,padding:'8px 10px',fontSize:12.5,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',color:'var(--text)'}}
                      );
                }),
                React.createElement('input',{
                  type:'number',min:0,placeholder:'Amount',value:entry.amount,
                  onChange:e=>updateSalesEntryModalRow(i,'amount',e.target.value),
                  onBlur:()=>{
                    if(salesEntryModal.sri!==IDX_OREC)return;
                    const w=overDueWarningFor(entry,modalSalesEntries,salesEntryModal.iso);
                    if(w)dseSalesToastWarn('⚠ '+w.invoiceNo+': ₹'+Math.round(w.entered).toLocaleString('en-IN')+' entered exceeds the ₹'+Math.round(w.due).toLocaleString('en-IN')+' actually due on this invoice');
                  },
                  style:{width:110,padding:'8px 10px',fontSize:12.5,background:'var(--bg3)',border:overDueWarning?'1px solid var(--red)':'1px solid var(--border)',borderRadius:'var(--r)',color:'var(--text)',textAlign:'right'}
                }),
                React.createElement('button',{
                  'aria-label':'Remove entry',className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},
                  onClick:()=>removeSalesEntryModalRow(i),
                  disabled:modalSalesEntries.length===1
                },React.createElement(IconTrash,{size:14}))
              ),
              overDueWarning&&React.createElement('div',{style:{fontSize:10.5,color:'var(--red)',marginTop:4,paddingLeft:2}},overDueWarning)
            );
          }),
          React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:addSalesEntryModalRow,style:{marginTop:4}},'+ Add another entry')
        ),

        React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:14,borderTop:'1px solid var(--border)'}},
          React.createElement('div',{style:{fontSize:12,color:'var(--accent)'}},
            'Total: ₹'+modalSalesEntries.reduce((s,e)=>s+(Number(e.amount)||0),0).toLocaleString('en-IN')
          ),
          React.createElement('div',{style:{display:'flex',gap:8}},
            React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setSalesEntryModal(null)},'Cancel'),
            getSalesEntries(salesEntryModal.iso,salesEntryModal.sri).length>0&&React.createElement('button',{
              className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},
              onClick:()=>{
                setSalesEntryData(prev=>{const n={...prev};if(n[salesEntryModal.iso])delete n[salesEntryModal.iso][salesEntryModal.sri];return n;});
                setSalesValue(salesEntryModal.iso,salesEntryModal.sri,'');
                setSalesEntryModal(null);
              }
            },'🗑 Clear'),
            React.createElement('button',{className:'btn btn-primary',onClick:saveSalesEntryModal},'✓ Save Entries')
          )
        )
      )
    ),

    // ── Cash Register OCR result popup — reads the Closing Balance figure off the attached
    // photo/PDF and compares it against this app's own computed Closing Cash Balance for that
    // day. Highlighted red whenever the register shows LESS cash than the books say it should
    // (a deficiency/shortage) — the case that actually needs someone's attention. ──
    ocrResult&&React.createElement('div',{className:'modal-overlay',onClick:()=>setOcrResult(null)},
      React.createElement('div',{className:'modal',style:{width:480},onClick:e=>e.stopPropagation()},
        React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}},
          React.createElement('div',{className:'modal-title',style:{marginBottom:0,paddingBottom:0,border:'none'}},'🔍 Cash Register Check — '+ocrResult.iso),
          React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setOcrResult(null)},'✕ Close')
        ),
        ocrResult.status==='unread'
          ?React.createElement(React.Fragment,null,
              React.createElement('div',{className:'attention-card attention-card-sm',style:{color:'var(--text2)',margin:'10px 0'}},
                "Couldn't confidently find a Closing Balance figure in that file. Computed Closing Cash Balance from the books: ",
                React.createElement('b',null,'₹'+Math.round(ocrResult.computed).toLocaleString('en-IN')),
                '. Raw text read off the attachment is below — please check it manually.'
              ),
              React.createElement('div',{style:{fontSize:11,color:'var(--text3)',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:10,maxHeight:160,overflowY:'auto',whiteSpace:'pre-wrap',fontFamily:'monospace'}},ocrResult.text||'(no text detected)')
            )
          :React.createElement(React.Fragment,null,
              React.createElement('div',{style:{display:'flex',gap:10,marginBottom:14}},
                React.createElement('div',{className:'metric-card blue',style:{flex:1}},React.createElement('div',{className:'metric-label'},'Computed (Books)'),React.createElement('div',{className:'metric-value'},'₹'+Math.round(ocrResult.computed).toLocaleString('en-IN'))),
                React.createElement('div',{className:'metric-card '+(ocrResult.status==='deficiency'?'red':ocrResult.status==='excess'?'amber':'green'),style:{flex:1}},React.createElement('div',{className:'metric-label'},'Register (OCR)'),React.createElement('div',{className:'metric-value'},'₹'+Math.round(ocrResult.value).toLocaleString('en-IN')))
              ),
              ocrResult.status==='deficiency'&&React.createElement('div',{style:{fontSize:13,fontWeight:600,color:'var(--red)',background:'rgba(255,107,107,0.12)',border:'1px solid rgba(255,107,107,0.5)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:10}},
                '⚠ Cash Deficiency Detected — the register shows ₹'+Math.abs(ocrResult.diff).toLocaleString('en-IN')+' less than the computed Closing Cash Balance. Please investigate this shortage before closing the day.'
              ),
              ocrResult.status==='excess'&&React.createElement('div',{className:'attention-card attention-card-sm',style:{fontWeight:600,color:'var(--orange)',marginBottom:10}},
                '⚠ Register shows ₹'+Math.abs(ocrResult.diff).toLocaleString('en-IN')+' more than the computed Closing Cash Balance — check for an entry missed in the books.'
              ),
              ocrResult.status==='match'&&React.createElement('div',{style:{fontSize:13,fontWeight:600,color:'var(--green)',background:'rgba(76,175,125,0.12)',border:'1px solid rgba(76,175,125,0.5)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:10}},
                '✓ Matches — no discrepancy found for this day.'
              ),
              React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)'}},'OCR reads a printed/handwritten figure automatically — always double-check against the physical register if this looks off, especially on unclear scans or photos.')
            ),
        React.createElement('div',{className:'modal-actions'},React.createElement('button',{className:'btn btn-primary',onClick:()=>setOcrResult(null)},'Close'))
      )
    )
  );
}