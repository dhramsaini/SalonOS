

// Cash entries typed directly on Daily Incentive Sheet are cash paid out of the drawer, so they
// belong on Daily Sales & Exp too (and from there in Closing Cash and the P&L). Rebuilds the
// mirrored copies (tagged fromDI) in Daily Sales & Exp's employee entries from scratch every
// time, so edits, deletes and Cash→Bank changes on Daily Incentive follow through. Entries that
// themselves came FROM Daily Sales & Exp (source:'dse') are skipped — no double counting.
// Non-category service names go to Service Commission/Incentives with the name as a note.
function syncDailyIncentiveToDSE(sid){
  try{
    let di=[];try{const r=JSON.parse(cachedLocalGet(outletKey('salonos_daily_incentive_entries',sid))||'[]');if(Array.isArray(r))di=r;}catch(e){}
    const empKey=outletKey('salonos_daily_sales_empdata',sid),dataKey=outletKey('salonos_daily_sales_data',sid);
    let emp={},data={};
    try{emp=JSON.parse(cachedLocalGet(empKey)||'{}')||{};}catch(e){}
    try{data=JSON.parse(cachedLocalGet(dataKey)||'{}')||{};}catch(e){}
    const before=JSON.stringify(emp)+'|'+JSON.stringify(data);
    const touched=new Set();
    Object.keys(emp).forEach(iso=>{const day=emp[iso]||{};Object.keys(day).forEach(ri=>{const l=day[ri];
      if(Array.isArray(l)&&l.some(e=>e&&e.fromDI)){touched.add(iso+'|'+ri);day[ri]=l.filter(e=>!(e&&e.fromDI));}});});
    di.forEach(e=>{
      if(!e||e.source==='dse'||(e.mode||'Cash')!=='Cash'||!e.date)return;
      const amt=Number(e.incentive)||0;if(amt<=0)return;
      const row=DAILY_INCENTIVE_CATEGORIES.includes(e.service)?e.service:'Service Commission/Incentives';
      const ri=String(EXPENSE_ROWS.findIndex(r=>r.name===row));if(ri==='-1')return;
      emp[e.date]=emp[e.date]||{};
      const l=Array.isArray(emp[e.date][ri])?emp[e.date][ri]:[];
      emp[e.date][ri]=[...l,{empName:e.emp,amount:amt,mode:'Cash',fromDI:true,note:e.service&&e.service!==row?e.service:''}];
      touched.add(e.date+'|'+ri);
    });
    touched.forEach(k=>{const [iso,ri]=k.split('|');const l=(emp[iso]&&emp[iso][ri])||[];
      if(!l.length&&emp[iso])delete emp[iso][ri];
      const t=l.reduce((s,x)=>s+(Number(x&&x.amount)||0),0);
      if(t>0)data[iso]={...(data[iso]||{}),[ri]:t};else if(data[iso]){data[iso]={...data[iso]};delete data[iso][ri];}});
    if(JSON.stringify(emp)+'|'+JSON.stringify(data)!==before){safeLocalSet(empKey,JSON.stringify(emp));safeLocalSet(dataKey,JSON.stringify(data));}
  }catch(e){}
}
// Salary is worked out only from FINAL attendance — until the month's Attendance is marked
// "Month Final" (or the month is already locked), Salary Working / Salary Payment / the Bank
// Payment salary file show this instead of figures that could still change.
function AttendanceNotFinalNotice({monthLabel,title,onNavTab}){
  return React.createElement('div',{className:'fade-in'},
    title&&React.createElement('div',{className:'section-header'},React.createElement('div',null,React.createElement('div',{className:'page-title'},title))),
    React.createElement('div',{className:'card',style:{textAlign:'center',padding:'40px 24px'}},
      React.createElement('div',{style:{fontSize:34,marginBottom:10}},'🔒'),
      React.createElement('div',{style:{fontSize:16,fontWeight:700,marginBottom:6}},'Attendance for '+monthLabel+' is not marked Final yet'),
      React.createElement('div',{style:{fontSize:13,color:'var(--text3)',maxWidth:520,margin:'0 auto 16px'}},
        'Salary is calculated only from final attendance. Finish marking every employee’s days in Attendance, then tick “Mark Month Final” there — Salary Working will then be worked out.'),
      onNavTab&&React.createElement('button',{className:'btn btn-primary',onClick:()=>onNavTab('attendance')},'Go to Attendance →')));
}
function DailyIncentiveCore({period,salon}={}){
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today=new Date();
  const initCal=periodToCalendar(period);
  const [selMonth,setSelMonth]=useState(initCal?initCal.month:today.getMonth());
  const [selYear,setSelYear]=useState(initCal?initCal.year:today.getFullYear());
  useEffect(()=>{
    const cal=periodToCalendar(period);
    if(cal){setSelMonth(cal.month);setSelYear(cal.year);}
    // eslint-disable-next-line
  },[period&&period.mi,period&&period.fy]);
  const {success,error:diError}=useToast();
  const diMonthLockRec=monthLockRecordFor(salon?.id,selYear,selMonth);
  const diMonthLocked=!!(diMonthLockRec&&diMonthLockRec.locked);
  const [syncTick,setSyncTick]=useState(0);
  const EMPLOYEES=getEmployeesForMonth(selYear,selMonth,salon?.id);
  const syncEmployees=()=>{setSyncTick(t=>t+1);success('Synced '+getEmployeesForMonth(selYear,selMonth,salon?.id).length+' employees from Attendance for '+MONTHS[selMonth]+' '+selYear);};
  const BLANK={date:localTodayIso(),empId:'',service:'',target:'0',achieved:'',rate:'100',mode:'Cash'};
  const diEntriesKey=()=>outletKey('salonos_daily_incentive_entries',salon?.id);
  const [entries,setEntries]=useState(()=>{
    try{const raw=JSON.parse(cachedLocalGet(diEntriesKey())||'[]');if(Array.isArray(raw))return raw;}catch(e){}
    return[];
  });
  useEffect(()=>{safeLocalSet(diEntriesKey(),JSON.stringify(entries));if(salon?.id)syncDailyIncentiveToDSE(salon.id);},[entries,salon?.id]);
  const DI_FILTER_COLS=[
    {key:'date',label:'Date',get:r=>r.date||'(blank)'},
    {key:'emp',label:'Employee',get:r=>r.emp},
    {key:'service',label:'Service Type',get:r=>r.service||'(blank)'},
    {key:'mode',label:'Mode',get:r=>r.mode||'Cash'},
    {key:'status',label:'Status',get:r=>r.status}
  ];
  const diFilters=useExcelColumnFilter(entries,DI_FILTER_COLS);
  const diWrapRef=useRef(null);
  const diCellRange=useExcelCellRange(diWrapRef);
  const [showModal,setShowModal]=useState(false);
  const [editIdx,setEditIdx]=useState(null);
  const [form,setForm]=useState(BLANK);
  const fc=(k)=>(e)=>setForm(f=>({...f,[k]:e.target.value}));
  // Service Type is a dropdown of the four Daily Incentive categories by default (so entries line
  // up with the same categories Bank Statement settles against) — svcOtherMode switches it to a
  // free-text box for anything that isn't one of those four, e.g. a specific treatment name.
  const [svcOtherMode,setSvcOtherMode]=useState(false);
  // Filters the Employee dropdown's option list as you type — the Attendance-synced roster can
  // run long, so this beats scrolling a plain native select. The employee currently selected
  // always stays in the list even if the search text no longer matches them, so picking one
  // never makes the field look like it silently cleared.
  const [empSearch,setEmpSearch]=useState('');
  const employeeOptionsForModal=(()=>{
    const q=empSearch.trim().toLowerCase();
    const filtered=!q?EMPLOYEES:EMPLOYEES.filter(e=>(e.name+' '+(e.desig||'')).toLowerCase().includes(q));
    if(form.empId&&!filtered.some(e=>e.id===form.empId)){
      const cur=EMPLOYEES.find(e=>e.id===form.empId);
      if(cur)return[cur,...filtered];
    }
    return filtered;
  })();
  const openAdd=()=>{if(diMonthLocked){diError('This month is locked — unlock it from Master Sheet or Salary Working to make changes.');return;}setForm({...BLANK,empId:EMPLOYEES[0]?.id||''});setSvcOtherMode(false);setEmpSearch('');setEditIdx(null);setShowModal(true);};
  const openEdit=(i)=>{if(diMonthLocked){diError('This month is locked — unlock it from Master Sheet or Salary Working to make changes.');return;}const r=entries[i];setForm({date:r.date,empId:r.empId,service:r.service,target:String(r.target),achieved:String(r.achieved),rate:String(r.rate),mode:r.mode||'Cash'});setSvcOtherMode(!!r.service&&!DAILY_INCENTIVE_CATEGORIES.includes(r.service));setEmpSearch('');setEditIdx(i);setShowModal(true);};
  const save=()=>{
    if(diMonthLocked){diError('This month is locked — unlock it from Master Sheet or Salary Working to make changes.');return;}
    if(!form.empId||!form.achieved){alert('Employee and Amount are required.');return;}
    const emp=EMPLOYEES.find(e=>e.id===form.empId);
    const target=Number(form.target)||0,achieved=Number(form.achieved)||0,rate=Number(form.rate)||0;
    const incentive=achieved>=target?Math.round(achieved*rate/100):0;
    const item={date:form.date,empId:form.empId,emp:emp?emp.name:form.empId,service:form.service,target,achieved,rate,incentive,mode:form.mode||'Cash',status:achieved>=target?'Computed':'Below target'};
    setEntries(prev=>editIdx!=null?prev.map((r,i)=>i===editIdx?item:r):[...prev,item]);
    setShowModal(false);
  };
  const remove=(i)=>{
    if(diMonthLocked){diError('This month is locked — unlock it from Master Sheet or Salary Working to make changes.');return;}
    if(confirm('Delete this incentive entry?'))setEntries(prev=>prev.filter((_,x)=>x!==i));
  };
  // ── Push straight to Bank Statement — the two actions below turn a Cash-default Daily
  // Incentive entry into something Bank Statement actually knows to pay. Selection is tracked by
  // each entry's real position in the full `entries` array (found via reference lookup against
  // the filtered rows actually on screen), not the filtered view's own row index, so it stays
  // correct even with column filters active. ──
  const [selectedEntries,setSelectedEntries]=useState(()=>new Set());
  const toggleEntrySelect=(realIdx)=>setSelectedEntries(prev=>{
    const next=new Set(prev);
    if(next.has(realIdx))next.delete(realIdx);else next.add(realIdx);
    return next;
  });
  const selectedCount=selectedEntries.size;
  const selectedTotal=Array.from(selectedEntries).reduce((s,i)=>s+(Number(entries[i]?.incentive)||0),0);
  // "Request Bank Payment" — just flips Mode from Cash to Bank for the ticked entries, so they
  // start showing up as Daily Incentive Outstanding in Bank Statement's Settle Pay the normal
  // way. Doesn't touch anything already Bank mode.
  const requestBankPayment=()=>{
    if(diMonthLocked){diError('This month is locked — unlock it from Master Sheet or Salary Working to make changes.');return;}
    const idxs=Array.from(selectedEntries);
    if(!idxs.length)return;
    let changed=0;
    setEntries(prev=>prev.map((r,i)=>{
      if(!idxs.includes(i)||r.mode==='Bank')return r;
      changed++;
      return{...r,mode:'Bank'};
    }));
    setSelectedEntries(new Set());
    success((changed||idxs.length)+' entr'+((changed||idxs.length)===1?'y':'ies')+' set to Bank — they\u2019ll now show under Daily Incentive Outstanding in Bank Statement, ready to settle.');
  };
  // "Add to Bank Statement" — goes a step further: creates the actual debit row(s) in Bank
  // Statement (grouped one row per employee among the selected entries, since that's how a real
  // bank transfer would line up), already fully settled against exactly the categories/amounts
  // picked here. Also flips those entries to Bank mode and tags them with the new row's id, so
  // they never show as outstanding again on either sheet.
  const addToBankStatement=()=>{
    if(diMonthLocked){diError('This month is locked — unlock it from Master Sheet or Salary Working to make changes.');return;}
    const idxs=Array.from(selectedEntries);
    if(!idxs.length){diError('Tick at least one entry first.');return;}
    const byEmp={};
    idxs.forEach(i=>{
      const r=entries[i];
      if(!r||!r.empId)return;
      if(!byEmp[r.empId])byEmp[r.empId]={employeeId:r.empId,employeeName:r.emp,byCat:{},total:0,idxs:[]};
      const cat=DAILY_INCENTIVE_CATEGORIES.includes(r.service)?r.service:'Other';
      byEmp[r.empId].byCat[cat]=(byEmp[r.empId].byCat[cat]||0)+(Number(r.incentive)||0);
      byEmp[r.empId].total+=Number(r.incentive)||0;
      byEmp[r.empId].idxs.push(i);
    });
    const groups=Object.values(byEmp).filter(g=>g.total>0);
    if(!groups.length){diError('Nothing to add — the selected entries have no incentive amount.');return;}
    const salonIdLocal=salon?.id;
    const freshRows=loadBankStatementRows(salonIdLocal);
    const todayDmy=fmtDate(localTodayIso());
    const nowYear=new Date().getFullYear(),nowMonth=new Date().getMonth();
    const nextRows=[...freshRows];
    groups.forEach((group,gi)=>{
      const newId=Date.now()+gi;
      const catList=Object.keys(group.byCat).join(', ');
      nextRows.push({
        id:newId,transactionDate:todayDmy,valueDate:todayDmy,
        description:'Daily Incentive Payment — '+group.employeeName+' ('+catList+')',
        refNo:'',debit:group.total,credit:0,closingBalance:'',
        nature:'Daily Incentive',vendorOverride:'EMP:'+group.employeeId,cradleeDate:'',
        linkedEmployeePay:[{employeeId:group.employeeId,employeeName:group.employeeName,year:nowYear,month:nowMonth,
          salary:0,incentive:0,dailyIncentive:group.total,dailyIncentiveByCat:group.byCat,
          salarySettled:false,incentiveSettled:false,
          dailyIncentiveSettled:Object.fromEntries(Object.keys(group.byCat).map(c=>[c,true]))}]
      });
      group.newRowId=newId;
    });
    saveBankStatementRows(nextRows,salonIdLocal);
    setEntries(prev=>prev.map((r,i)=>{
      const group=Object.values(byEmp).find(g=>g.idxs.includes(i));
      return group?{...r,mode:'Bank',bankRowId:group.newRowId}:r;
    }));
    setSelectedEntries(new Set());
    success('Added '+groups.length+' row'+(groups.length===1?'':'s')+' to Bank Statement — ₹'+groups.reduce((s,g)=>s+g.total,0).toLocaleString('en-IN')+' total, already recorded as settled for '+groups.map(g=>g.employeeName).join(', ')+'.');
  };
  const totalInc=entries.reduce((s,r)=>s+r.incentive,0);
  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,React.createElement('div',{className:'page-title'},'Daily Incentive Sheet'),React.createElement('div',{className:'page-sub'},MONTHS[selMonth]+' '+selYear+' — date-wise incentive entries per employee · Employees synced from Attendance')),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:syncEmployees},'⟳ Sync Employees from Attendance'),
        !diMonthLocked&&React.createElement('button',{className:'btn btn-primary btn-sm',onClick:openAdd},'+ Add Entry'),
        diMonthLocked&&React.createElement('span',{className:'badge badge-green',style:{fontSize:11}},'🔒 '+MONTHS[selMonth]+' '+selYear+' locked')
      )
    ),
    selectedCount>0&&!diMonthLocked&&React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',background:'rgba(47,95,224,0.08)',border:'1px solid rgba(47,95,224,0.25)',borderRadius:'var(--r)',padding:'8px 14px',marginBottom:14,fontSize:12}},
      React.createElement('span',{style:{fontWeight:600,color:'var(--text)'}},selectedCount+' entr'+(selectedCount===1?'y':'ies')+' selected · ₹'+selectedTotal.toLocaleString('en-IN')),
      React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Sets Mode to Bank for the ticked entries — they\u2019ll then show as Daily Incentive Outstanding in Bank Statement, ready to settle from there',onClick:requestBankPayment},'📤 Request Bank Payment'),
      React.createElement('button',{className:'btn btn-primary btn-sm',title:'Creates the actual Bank Statement row(s) for these entries — one per employee — already recorded as settled',onClick:addToBankStatement},'🏦 Add to Bank Statement'),
      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setSelectedEntries(new Set())},'Clear selection')
    ),
    React.createElement('div',{style:{background:'rgba(74,158,255,0.06)',border:'1px solid rgba(74,158,255,0.18)',borderRadius:'var(--r)',padding:'8px 14px',marginBottom:14,fontSize:12,color:'var(--blue)'}},
      EMPLOYEES.length+' employees available from the Attendance roster for '+MONTHS[selMonth]+' '+selYear+' (Active, or Resigned this month). Use \u201c\u27f3 Sync Employees from Attendance\u201d after updating Master Salary or Attendance.'
    ),
    React.createElement('div',{className:'card'},
      entries.length===0
        ?React.createElement('div',{style:{textAlign:'center',padding:32,color:'var(--text3)'}},'No incentive entries yet. Click + Add Entry — the employee list is synced from Attendance.')
        :React.createElement('div',null,
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:8}},'Tick entries on the left to push them to Bank Statement. Click a cell — or drag across several — then Ctrl/Cmd+C to copy, just like Excel.'),
          React.createElement('div',{className:'table-wrap',ref:diWrapRef},
          React.createElement('table',null,
            React.createElement('thead',null,React.createElement('tr',null,
              React.createElement('th',{key:'sel',style:{width:34}}),
              diFilters.TH(DI_FILTER_COLS[0]),diFilters.TH(DI_FILTER_COLS[1]),diFilters.TH(DI_FILTER_COLS[2]),
              React.createElement('th',{key:'target'},'Target'),React.createElement('th',{key:'achieved'},'Achieved'),React.createElement('th',{key:'rate'},'Rate %'),React.createElement('th',{key:'incentive'},'Incentive'),
              diFilters.TH(DI_FILTER_COLS[3]),diFilters.TH(DI_FILTER_COLS[4]),
              React.createElement('th',{key:'actions'},'Actions')
            )),
            React.createElement('tbody',null,diFilters.filteredRows.map((r,i)=>{
              const sel=(c)=>diCellRange.isSelected(i,c)?'rgba(47,95,224,0.12)':undefined;
              const synced=r.source==='dse';
              const realIdx=entries.indexOf(r);
              const inBank=!!r.bankRowId;
              return React.createElement('tr',{key:i},
                React.createElement('td',null,!inBank&&React.createElement('input',{type:'checkbox',checked:selectedEntries.has(realIdx),onChange:()=>toggleEntrySelect(realIdx),title:'Select to push to Bank Statement'})),
                React.createElement('td',{'data-xr':i,'data-xc':0,style:{background:sel(0)}},r.date),
                React.createElement('td',{'data-xr':i,'data-xc':1,style:{background:sel(1)}},React.createElement('span',{style:{fontWeight:500,color:'var(--text)'}},r.emp)),
                React.createElement('td',{'data-xr':i,'data-xc':2,style:{background:sel(2)}},
                  r.service||'—',
                  synced&&React.createElement('span',{title:'Synced from Daily Sales & Exp — edit the amount there, this updates automatically',style:{marginLeft:6,fontSize:10,color:'var(--blue)'}},'🔗'),
                  inBank&&React.createElement('span',{title:'Already added to Bank Statement — won\u2019t show as outstanding again',style:{marginLeft:6,fontSize:10,color:'var(--green)'}},'🏦 In Bank Statement')
                ),
                React.createElement('td',null,rupee(r.target)),
                React.createElement('td',null,rupee(r.achieved)),
                React.createElement('td',null,r.rate+'%'),
                React.createElement('td',null,React.createElement('span',{style:{color:'var(--accent)',fontWeight:600}},rupee(r.incentive))),
                React.createElement('td',{'data-xr':i,'data-xc':3,style:{background:sel(3)}},React.createElement('span',{className:'badge '+(r.mode==='Bank'?'badge-blue':'badge-amber')},r.mode||'Cash')),
                React.createElement('td',{'data-xr':i,'data-xc':4,style:{background:sel(4)}},React.createElement('span',{className:'badge '+(r.status==='Computed'?'badge-green':'badge-red')},r.status)),
                React.createElement('td',null,React.createElement('div',{style:{display:'flex',gap:4}},
                  React.createElement('button',{className:'btn btn-ghost btn-sm',title:synced?'This entry is synced from Daily Sales & Exp — editing here will be overwritten next time that entry is saved there':undefined,onClick:()=>openEdit(i)},'Edit'),
                  React.createElement('button',{'aria-label':'Delete',className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},title:synced?'Deleting here only removes this copy — it reappears if the Daily Sales & Exp entry is saved again. Clear it there to remove it for good.':undefined,onClick:()=>remove(i)},React.createElement(IconTrash,{size:14}))
                ))
              );
            }))
          )
        ),
        diFilters.Portal(),
        diCellRange.Toolbar()
        ),
      entries.length>0&&React.createElement('div',{style:{display:'flex',justifyContent:'flex-end',paddingTop:10,borderTop:'1px solid var(--border)',marginTop:8,fontSize:13,fontWeight:700,color:'var(--accent)'}},'Total Incentive: ₹'+totalInc.toLocaleString('en-IN'))
    ),
    showModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowModal(false)},
      React.createElement('div',{className:'modal',style:{width:480},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},editIdx!=null?'Edit Incentive Entry':'Add Incentive Entry'),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-50'},'Date'),React.createElement('input',{id:'f-50',type:'date',className:'form-control',value:form.date,onChange:fc('date')})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-51'},'Employee * (synced from Attendance)'),
            React.createElement('input',{className:'form-control',style:{marginBottom:6},value:empSearch,onChange:e=>setEmpSearch(e.target.value),placeholder:'🔍 Filter employees…'}),
            React.createElement('select',{id:'f-51',className:'form-control',value:form.empId,onChange:fc('empId')},React.createElement('option',{value:''},'— Select —'),employeeOptionsForModal.map(e=>React.createElement('option',{key:e.id,value:e.id},e.name+' ('+e.desig+')')))
          )
        ),
        React.createElement('div',{className:'form-row'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-52'},'Service Type'),
            React.createElement('select',{id:'f-52',className:'form-control',value:svcOtherMode?'__other__':form.service,
              onChange:e=>{
                const v=e.target.value;
                if(v==='__other__'){setSvcOtherMode(true);setForm(f=>({...f,service:''}));}
                else{setSvcOtherMode(false);setForm(f=>({...f,service:v}));}
              }
            },
              React.createElement('option',{value:''},'— Select —'),
              DAILY_INCENTIVE_CATEGORIES.map(c=>React.createElement('option',{key:c,value:c},c)),
              React.createElement('option',{value:'__other__'},'Other (type below)')
            ),
            svcOtherMode&&React.createElement('input',{className:'form-control',style:{marginTop:6},value:form.service,onChange:fc('service'),placeholder:'e.g. Keratin Treatment',autoFocus:true})
          )
        ),
        React.createElement('div',{className:'form-row'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-54'},'Amount (₹) *'),React.createElement('input',{id:'f-54',type:'number',className:'form-control',value:form.achieved,onChange:fc('achieved'),placeholder:'0',autoFocus:true}))
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-55b'},'Mode of Payment'),React.createElement('select',{id:'f-55b',className:'form-control',value:form.mode,onChange:fc('mode')},['Cash','Bank'].map(m=>React.createElement('option',{key:m,value:m},m))))
        ),
        React.createElement('div',{style:{display:'flex',gap:10,justifyContent:'flex-end',paddingTop:12,borderTop:'1px solid var(--border)'}},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowModal(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:save},editIdx!=null?'Save Changes':'Add Entry')
        )
      )
    )
  );
}

// ── Read-only view of a single Daily Sales & Exp row (Tip To Employee / Staff Over Time),
// surfaced here under Daily Incentive since both figures genuinely relate to per-day incentive-
// adjacent payouts even though they're entered in Daily Sales & Exp. Deliberately NOT a second
// place to type the same numbers — that would let the two screens drift apart. Editing still
// happens only in Daily Sales & Exp; this is a linked view onto that same data. ──
function DailyIncentiveLinkedSheet({period,salon,rowName,icon,onNavTab}={}){
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today=new Date();
  const initCal=periodToCalendar(period);
  const [selMonth,setSelMonth]=useState(initCal?initCal.month:today.getMonth());
  const [selYear,setSelYear]=useState(initCal?initCal.year:today.getFullYear());
  useEffect(()=>{
    const cal=periodToCalendar(period);
    if(cal){setSelMonth(cal.month);setSelYear(cal.year);}
    // eslint-disable-next-line
  },[period&&period.mi,period&&period.fy]);
  const [tick,setTick]=useState(0);
  const salonId=salon?.id;
  // Per-employee entries (name, mode of payment, amount) rather than just a day total — see
  // dseRowEmpEntriesForMonth for the fallback behaviour on older, pre-breakdown data.
  const entries=useMemo(()=>dseRowEmpEntriesForMonth(salonId,rowName,selYear,selMonth),[salonId,rowName,selYear,selMonth,tick]);
  const total=entries.reduce((s,r)=>s+r.amount,0);
  const daysWithEntry=new Set(entries.map(r=>r.date)).size;
  const MODE_BADGE={Cash:'badge-green',UPI:'badge-blue','Bank Transfer':'badge-purple'};
  const modeTotals=entries.reduce((m,r)=>{const k=r.mode||'Not specified';m[k]=(m[k]||0)+r.amount;return m;},{});

  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},icon+' '+rowName),
        React.createElement('div',{className:'page-sub'},MONTHS[selMonth]+' '+selYear+' — linked from Daily Sales & Exp. \u201c'+rowName+'\u201d row; edit the figures there, this is a read-only view.')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selMonth,onChange:e=>setSelMonth(Number(e.target.value))},MONTHS.map((m,i)=>React.createElement('option',{key:m,value:i},m))),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selYear,onChange:e=>setSelYear(Number(e.target.value))},appYears().map(y=>React.createElement('option',{key:y},y))),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setTick(t=>t+1)},'⟳ Refresh'),
        onNavTab&&React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>onNavTab('daily-sales')},'Go to Daily Sales & Exp →')
      )
    ),
    React.createElement('div',{className:'grid4',style:{marginBottom:16}},
      React.createElement('div',{className:'metric-card'},React.createElement('div',{className:'metric-label'},'Days With an Entry'),React.createElement('div',{className:'metric-value'},daysWithEntry)),
      React.createElement('div',{className:'metric-card'},React.createElement('div',{className:'metric-label'},'Total Entries'),React.createElement('div',{className:'metric-value'},entries.length)),
      React.createElement('div',{className:'metric-card'},React.createElement('div',{className:'metric-label'},'Total for the Month'),React.createElement('div',{className:'metric-value'},rupee(total))),
      React.createElement('div',{className:'metric-card'},
        React.createElement('div',{className:'metric-label'},'By Mode of Payment'),
        Object.keys(modeTotals).length===0
          ?React.createElement('div',{style:{fontSize:13,color:'var(--text3)',marginTop:4}},'—')
          :React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:2,marginTop:4}},
              Object.entries(modeTotals).map(([m,amt])=>React.createElement('div',{key:m,style:{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--text2)'}},
                React.createElement('span',null,m),React.createElement('span',{style:{fontWeight:600}},rupee(amt))
              ))
            )
      )
    ),
    entries.length===0
      ?React.createElement('div',{className:'card',style:{textAlign:'center',padding:32,color:'var(--text3)'}},'Nothing entered for '+rowName+' in '+MONTHS[selMonth]+' '+selYear+' yet — enter it under Daily Sales & Exp. and it will show up here automatically.')
      :React.createElement('div',{className:'card',style:{padding:0,overflow:'hidden'}},
          React.createElement('div',{style:{overflowX:'auto'}},
            React.createElement('table',null,
              React.createElement('thead',null,React.createElement('tr',null,['Date','Employee','Mode of Payment','Amount (₹)'].map(h=>React.createElement('th',{key:h,style:h==='Amount (₹)'?{textAlign:'right'}:undefined},h)))),
              React.createElement('tbody',null,[
                ...entries.map((r,i)=>React.createElement('tr',{key:r.date+'-'+i},
                  React.createElement('td',null,fmtDMY(r.date)),
                  React.createElement('td',null,r.empName),
                  React.createElement('td',null,r.mode?React.createElement('span',{className:'badge '+(MODE_BADGE[r.mode]||'badge-gray')},r.mode):React.createElement('span',{style:{color:'var(--text3)',fontSize:11.5}},'Not specified')),
                  React.createElement('td',{style:{textAlign:'right',fontWeight:600}},r.amount.toLocaleString('en-IN'))
                )),
                React.createElement('tr',{key:'total',style:{fontWeight:700}},
                  React.createElement('td',{colSpan:3},'Total'),
                  React.createElement('td',{style:{textAlign:'right',color:'var(--accent)'}},total.toLocaleString('en-IN'))
                )
              ])
            )
          )
        )
  );
}

function DailyIncentiveSheet({period,salon,onNavTab}={}){
  const [subTab,setSubTab]=useState('entries');
  const tabBar=React.createElement('div',{className:'tab-bar',style:{marginBottom:16}},
    [{id:'entries',label:'Incentive Entries'},{id:'tip',label:'Tip to Employee'},{id:'overtime',label:'Staff Overtime'}].map(t=>
      React.createElement('button',{key:t.id,className:`tab-btn ${subTab===t.id?'active':''}`,onClick:()=>setSubTab(t.id)},t.label)
    )
  );
  return React.createElement('div',{className:'fade-in'},
    tabBar,
    React.createElement('div',{style:{display:subTab==='entries'?'block':'none'}},React.createElement(DailyIncentiveCore,{period,salon})),
    React.createElement('div',{style:{display:subTab==='tip'?'block':'none'}},React.createElement(DailyIncentiveLinkedSheet,{period,salon,rowName:'Tip To Employee',icon:'💸',onNavTab})),
    React.createElement('div',{style:{display:subTab==='overtime'?'block':'none'}},React.createElement(DailyIncentiveLinkedSheet,{period,salon,rowName:'Staff Over Time',icon:'⏱️',onNavTab}))
  );
}

function AttendanceSheet({period,salon,user}={}){
  const today=new Date();
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const initCal=periodToCalendar(period);
  const [selMonth,setSelMonth]=useState(initCal?initCal.month:today.getMonth());
  const [selYear,setSelYear]=useState(initCal?initCal.year:today.getFullYear());
  useEffect(()=>{
    const cal=periodToCalendar(period);
    if(cal){setSelMonth(cal.month);setSelYear(cal.year);}
    // eslint-disable-next-line
  },[period&&period.mi,period&&period.fy]);
  const EMPLOYEES=getEmployeesForMonth(selYear,selMonth,salon?.id);
  const [viewMode,setViewMode]=useState('grid'); // 'grid' | 'register'
  const [selEmp,setSelEmp]=useState(EMPLOYEES[0]?.id||'');
  const {warn,toast}=useToast();
  // ── Manager Final Month — self-lock the outlet Manager sets once a WHOLE month's Attendance
  // is done; Super Admin/Reviewer can still edit or un-finalize it. Independent of Month Lock
  // (which blocks everyone). Scoped to the currently selected month/year. ──
  const isManagerSide=isManagerSideRole(user);
  const [mgrFinalTick,setMgrFinalTick]=useState(0);
  const mgrFinalMonth=useMemo(()=>isManagerFinalMonth(salon?.id,'attendance',selYear,selMonth),[salon?.id,selYear,selMonth,mgrFinalTick]);
  const isMonthLockedForRole=isManagerSide&&mgrFinalMonth;
  const toggleMgrFinalMonth=()=>{
    if(mgrFinalMonth&&isManagerSide){warn('This month is marked Final — ask a Super Admin or Reviewer to un-finalize it before editing.');return;}
    setManagerFinalMonth(salon?.id,'attendance',selYear,selMonth,!mgrFinalMonth,user?.name);
    setMgrFinalTick(t=>t+1);
    toast(!mgrFinalMonth?'Marked '+months[selMonth]+' '+selYear+' Final — Manager side is now locked for this month':months[selMonth]+' '+selYear+' un-finalized — editable again','success');
  };

  const STATUS_OPTS=['present','off','holiday','half','absent','notjoined','left'];
  const STATUS_LABELS={present:'P',off:'WO',holiday:'H',half:'HD',absent:'A',notjoined:'NJ',left:'L'};
  const STATUS_CSS={present:'att-present',off:'att-off',holiday:'att-holiday',half:'att-half',absent:'att-absent',notjoined:'att-notjoined',left:'att-left'};
  const STATUS_FULL={present:'Present',off:'Weekoff',holiday:'Holiday',half:'Halfday',absent:'Absent',notjoined:'Not Joined',left:'Left'};
  const STATUS_FULL_REV=Object.fromEntries(Object.entries(STATUS_FULL).map(([k,v])=>[v.toLowerCase(),k]));

  const monthKey=attMonthKey;

  // Persisted attendance store — { [empId_year_month]: {days:[31], adjustment:number} }
  const [attStore,setAttStore]=useState(()=>loadAttendance(salon?.id));
  useEffect(()=>{saveAttendance(attStore,salon?.id);},[attStore]);

  // ── Attendance Register attachment — attach a scan/photo of the physical register for the
  // selected month right from the toolbar. ──
  const [attRegFiles,setAttRegFilesState]=useState(()=>loadAttendanceRegisterFiles(salon?.id));
  useEffect(()=>{setAttRegFilesState(loadAttendanceRegisterFiles(salon?.id));},[salon?.id]);
  const {toast:attRegToast,error:attRegToastErr}=useToast();
  const attRegKey=selYear+'_'+selMonth;
  const attRegRecord=attRegFiles[attRegKey]||null;
  const attRegFileName=attRegRecord?(typeof attRegRecord==='string'?attRegRecord:attRegRecord.name):'';
  const setAttRegFile=(record)=>{
    const next={...attRegFiles};
    if(record)next[attRegKey]=record;else delete next[attRegKey];
    setAttRegFilesState(next);
    const ok=saveAttendanceRegisterFiles(salon?.id,next);
    if(!ok){setAttRegFilesState(attRegFiles);attRegToastErr("Couldn't save — browser storage is full. Free up space in Master Settings → Backup & Restore.");}
  };
  const handleAttRegFile=(file)=>{
    readFileAsAttachment(file,
      rec=>{setAttRegFile(rec);attRegToast('Attendance Register attached','success');},
      err=>attRegToastErr(err==='size'?'That file is too large (max 4MB) — try a smaller photo or a compressed PDF.':"Couldn't read that file — please try again.")
    );
  };
  const downloadAttRegFile=()=>{
    if(!downloadAttachment(attRegRecord,'attendance-register-'+attRegKey))
      attRegToastErr('This attachment was saved by an older version and its file was never actually stored — please remove it and re-attach the file to enable download.');
  };

  // ── Bulk Upload — template with a genuine dropdown (data validation) on every day column,
  // built with ExcelJS since the free SheetJS build can't write data validation any more than it
  // can write cell colors. The button here used to have no onClick at all — this wires it up
  // for real, both the template and the actual import. ──
  const [bulkBusy,setBulkBusy]=useState(false);
  const [bulkResult,setBulkResult]=useState(null);
  const bulkFileRef=useRef(null);
  const salonIdForBulk=salon?.id;
  // Excel column index (1-based) -> letter, for building A1-style ranges beyond column Z.
  const colLetter=(n)=>{let s='';while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26);}return s;};
  // Same palette as the on-screen status chips (STATUS_CSS), as solid Excel fill/font colors —
  // rgba over a page background doesn't translate, so these are the closest solid equivalents.
  const STATUS_XL_COLORS={
    present:{fill:'FFDCF5E7',font:'FF12805C'},
    absent:{fill:'FFFBE1E1',font:'FFCF3D3D'},
    half:{fill:'FFEAE9FE',font:'FF4338CA'},
    off:{fill:'FFF4F6F9',font:'FF8592A3'},
    holiday:{fill:'FFDCEBFF',font:'FF2563EB'},
    notjoined:{fill:'FFECEEF2',font:'FF8592A3'},
    left:{fill:'FFEAE3FB',font:'FF6D4FD0'}
  };
  const downloadAttendanceTemplate=async()=>{
    await loadScript(CDN_EXCELJS_URL);
    if(!window.ExcelJS){toast('Excel engine unavailable — check your internet connection.','error');return;}
    const dim=new Date(selYear,selMonth+1,0).getDate();
    const wb=new ExcelJS.Workbook();
    const ws=wb.addWorksheet(months[selMonth]+' '+selYear);
    const headerVals=['Emp ID','Name','Designation',...Array.from({length:dim},(_,i)=>'Day '+(i+1))];
    const header=ws.getRow(1);
    header.values=headerVals;
    header.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF14335E'}};c.font={bold:true,color:{argb:'FFFFFFFF'},size:9};});
    const dvList='"'+Object.values(STATUS_FULL).join(',')+'"';
    EMPLOYEES.forEach((e,ri)=>{
      const row=ws.getRow(ri+2);
      row.values=[e.id,e.name,e.desig];
      for(let d=0;d<dim;d++){
        const cell=row.getCell(4+d);
        cell.dataValidation={type:'list',allowBlank:true,formulae:[dvList]};
      }
    });
    ws.columns=[{width:10},{width:20},{width:18},...Array.from({length:dim},()=>({width:11}))];
    ws.views=[{state:'frozen',xSplit:3,ySplit:1}];
    // ── Color coding — conditional formatting so each day cell auto-colors the moment someone
    // picks a status from the dropdown, matching the app's own on-screen chip colors. ──
    const lastDataRow=Math.max(2,EMPLOYEES.length+1);
    const dayRange='D2:'+colLetter(3+dim)+lastDataRow;
    ws.addConditionalFormatting({
      ref:dayRange,
      rules:STATUS_OPTS.map((st,i)=>({
        priority:i+1,type:'cellIs',operator:'equal',formulae:['"'+STATUS_FULL[st]+'"'],
        style:{fill:{type:'pattern',pattern:'solid',fgColor:{argb:STATUS_XL_COLORS[st].fill}},font:{color:{argb:STATUS_XL_COLORS[st].font},bold:true}}
      }))
    });
    // ── Filter — AutoFilter arrows on the header row, so Emp ID/Name/Designation or any single
    // day column can be filtered right inside Excel before or after filling it in. ──
    ws.autoFilter={from:{row:1,column:1},to:{row:lastDataRow,column:headerVals.length}};
    // ── Legend — a small color key next to the table explaining what each status looks like. ──
    const legendCol=headerVals.length+2;
    ws.getRow(1).getCell(legendCol).value='Legend';
    ws.getRow(1).getCell(legendCol).font={bold:true,size:9,color:{argb:'FF14335E'}};
    STATUS_OPTS.forEach((st,i)=>{
      const r=ws.getRow(2+i);
      const swatch=r.getCell(legendCol);
      swatch.value=STATUS_LABELS[st];
      swatch.alignment={horizontal:'center'};
      swatch.fill={type:'pattern',pattern:'solid',fgColor:{argb:STATUS_XL_COLORS[st].fill}};
      swatch.font={bold:true,color:{argb:STATUS_XL_COLORS[st].font},size:9};
      r.getCell(legendCol+1).value=STATUS_FULL[st];
      r.getCell(legendCol+1).font={size:9,color:{argb:'FF4E5A6B'}};
    });
    ws.getColumn(legendCol).width=6;
    ws.getColumn(legendCol+1).width=14;
    const buf=await wb.xlsx.writeBuffer();
    const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Attendance_Template_'+months[selMonth]+'_'+selYear+'.xlsx';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
    toast('Template downloaded — dropdown, color coding and filters are all set up, just fill it in','success');
  };
  const handleBulkAttendanceFile=async(e)=>{
    const f=e.target.files&&e.target.files[0];
    if(!f)return;
    e.target.value='';
    setBulkBusy(true);
    try{
      await loadScript(CDN_XLSX_URL);
      if(!window.XLSX)throw new Error('Excel engine unavailable \u2014 check your internet connection.');
      const buf=await f.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array'});
      if(!wb.SheetNames.length)throw new Error('That workbook has no sheets.');
      // Find the Emp ID column and every "Day N" column by header text \u2014 not by fixed position \u2014
      // and search every sheet (not just the first) for one that actually has Day columns, so a
      // reordered column, an extra column inserted before Emp ID, or the wrong sheet being first
      // doesn't silently break the import.
      const dayColRe=/^day\s*(\d+)$/i;
      let json=null,dayCols=[],empIdCi=-1;
      for(const sheetName of wb.SheetNames){
        const tryJson=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:'',header:1});
        if(!tryJson.length)continue;
        const tryHeader=tryJson[0];
        const tryDayCols=[];
        tryHeader.forEach((h,ci)=>{const m=String(h||'').trim().match(dayColRe);if(m)tryDayCols.push({ci,day:Number(m[1])});});
        if(!tryDayCols.length)continue;
        const tryEmpIdCi=tryHeader.findIndex(h=>String(h||'').trim().toLowerCase()==='emp id');
        json=tryJson;dayCols=tryDayCols;empIdCi=tryEmpIdCi>=0?tryEmpIdCi:0; // fall back to column 0 if the header text itself was edited
        break;
      }
      if(!json)throw new Error('Could not find any "Day N" columns in this workbook \u2014 make sure you\'re using the downloaded template.');
      const dim=new Date(selYear,selMonth+1,0).getDate();
      const failed=[];
      let updatedEmployees=0,updatedDays=0;
      const nextStore={...attStore};
      const normId=(s)=>String(s||'').trim().toLowerCase().replace(/^0+(?=\d)/,''); // tolerate Excel silently turning "0101" into 101
      json.slice(1).forEach((row,idx)=>{
        const rowNum=idx+2;
        const empId=String(row[empIdCi]||'').trim();
        if(!empId)return;
        const emp=EMPLOYEES.find(x=>x.id===empId)||EMPLOYEES.find(x=>normId(x.id)===normId(empId));
        if(!emp){failed.push('Row '+rowNum+': Emp ID "'+empId+'" not found among this month\'s employees');return;}
        const key=monthKey(empId,selYear,selMonth);
        const existing=nextStore[key]||{days:genAttDay(emp,selYear,selMonth),adjustment:0};
        const days=[...existing.days];
        let changedThisRow=0;
        dayCols.forEach(({ci,day})=>{
          if(day>dim)return; // template built for a different month length — ignore extra columns
          const raw=String(row[ci]||'').trim();
          if(!raw)return; // blank cell — leave whatever was already there
          const code=STATUS_FULL_REV[raw.toLowerCase()];
          if(!code){failed.push('Row '+rowNum+' ('+empId+'), Day '+day+': "'+raw+'" isn\'t a valid status — use the dropdown values');return;}
          days[day-1]=code;
          changedThisRow++;
        });
        if(changedThisRow>0){
          nextStore[key]={...existing,days};
          updatedEmployees++;
          updatedDays+=changedThisRow;
        }
      });
      setAttStore(nextStore);
      setBulkResult({updatedEmployees,updatedDays,failed});
      if(updatedDays&&!failed.length)toast(updatedDays+' day'+(updatedDays===1?'':'s')+' updated across '+updatedEmployees+' employee'+(updatedEmployees===1?'':'s'),'success');
    }catch(err){toast(err.message||'Could not read that file — make sure it matches the template','error');}
    setBulkBusy(false);
  };
  // Make sure every current-month employee has a (blank/structural) record
  useEffect(()=>{
    setAttStore(prev=>{
      let changed=false;const next={...prev};
      EMPLOYEES.forEach(e=>{
        const k=monthKey(e.id,selYear,selMonth);
        if(!next[k]){next[k]={days:genAttDay(e,selYear,selMonth),adjustment:0};changed=true;}
      });
      return changed?next:prev;
    });
    // eslint-disable-next-line
  },[selMonth,selYear,EMPLOYEES.map(e=>e.id).join(',')]);

  const [showBulkModal,setShowBulkModal]=useState(false);
  const daysInMonth=new Date(selYear,selMonth+1,0).getDate();
  const dayHeaders=Array.from({length:daysInMonth},(_,i)=>i+1);
  const emp=EMPLOYEES.find(e=>e.id===selEmp);
  useEffect(()=>{
    if(!EMPLOYEES.find(e=>e.id===selEmp))setSelEmp(EMPLOYEES[0]?.id||'');
    // eslint-disable-next-line
  },[selMonth,selYear]);
  const recordFor=(empId)=>attStore[monthKey(empId,selYear,selMonth)];
  const daysFor=(empId)=>{
    const r=recordFor(empId);
    if(r&&r.days)return r.days;
    const e=EMPLOYEES.find(x=>x.id===empId);
    return e?genAttDay(e,selYear,selMonth):Array(31).fill(null);
  };
  const empDays=daysFor(selEmp);
  const present=empDays.slice(0,daysInMonth).filter(d=>d==='present').length;
  const absent=empDays.slice(0,daysInMonth).filter(d=>d==='absent').length;
  const half=empDays.slice(0,daysInMonth).filter(d=>d==='half').length;
  const lop=absent+half*0.5;

  // ── Month Lock — this outlet's month may be locked manually (Master Sheet → 🔒 Months) or
  // automatically once every employee's Salary Working row was Approved. Locked = read-only.
  const monthLockRec=monthLockRecordFor(salon?.id,selYear,selMonth);
  const attMonthLocked=!!(monthLockRec&&monthLockRec.locked);
  const updateDays=(empId,dayIdx,newStatus)=>{
    if(attMonthLocked){warn(months[selMonth]+' '+selYear+' is locked — unlock it from Master Sheet or Salary Working to make changes.');return;}
    if(isMonthLockedForRole){warn(months[selMonth]+' '+selYear+' is marked Final — ask a Super Admin or Reviewer to un-finalize it before editing.');return;}
    setAttStore(prev=>{
      const k=monthKey(empId,selYear,selMonth);
      const e=EMPLOYEES.find(x=>x.id===empId);
      const curRec=prev[k]||{days:e?genAttDay(e,selYear,selMonth):Array(31).fill(null),adjustment:0};
      const curDays=curRec.days||Array(31).fill(null);
      if(!attDayMarkable(curDays,dayIdx)){warn('Mark the previous day\'s attendance first.');return prev;}
      const nextDays=[...curDays];nextDays[dayIdx]=newStatus;
      return{...prev,[k]:{...curRec,days:nextDays}};
    });
  };
  const toggleStatus=(empId,dayIdx)=>{
    const curDays=daysFor(empId);
    if(!attDayMarkable(curDays,dayIdx)){warn('Mark the previous day\'s attendance first.');return;}
    const ci=STATUS_OPTS.indexOf(curDays[dayIdx]);
    updateDays(empId,dayIdx,STATUS_OPTS[(ci+1)%STATUS_OPTS.length]);
  };
  const setStatus=(empId,dayIdx,status)=>{updateDays(empId,dayIdx,status);};
  const setAdjustment=(empId,val)=>{
    if(attMonthLocked){warn(months[selMonth]+' '+selYear+' is locked — unlock it from Master Sheet or Salary Working to make changes.');return;}
    setAttStore(prev=>{
      const k=monthKey(empId,selYear,selMonth);
      const e=EMPLOYEES.find(x=>x.id===empId);
      const curRec=prev[k]||{days:e?genAttDay(e,selYear,selMonth):Array(31).fill(null),adjustment:0};
      return{...prev,[k]:{...curRec,adjustment:val===''?'':Number(val)}};
    });
  };

  // Delegates to the app-wide fmtDMY/toISO pair so DOJ/DOL always render as DD/MM/YYYY here too —
  // including legacy values that slipped in as an unconverted Excel serial number or a non-ISO
  // string. A genuinely blank date still shows '—', never a made-up date.
  const fmtShort=(iso)=>fmtDMY(iso);
  const fmtDays=(n)=>Number.isInteger(n)?n:n.toFixed(1);
  const exportRegister=async()=>{
    const hdr=['Name of Employee','Designation','Weekly Off','DOJ','DOL',...dayHeaders];
    const rows=EMPLOYEES.map(e=>{
      const days=daysFor(e.id);
      const sl=days.slice(0,daysInMonth);
      return[e.name,e.desig,e.weeklyOff,fmtShort(e.doj),fmtShort(e.dol),...sl.map(d=>STATUS_FULL[d||'']||'Not Marked')];
    });
    const shdr=['Name of Employee','Present','Weekoff','Holiday','Halfday','Absent','Not Joined','Left','Not Marked','Total','Working Days','Extra Days','Allowed Weekoff','Adjustment','Total Days'];
    const srows=EMPLOYEES.map(e=>{
      const s=attSummaryFor(e,selYear,selMonth,recordFor(e.id));
      return[e.name,s.present,s.off,s.holiday,s.half,s.absent,s.notjoined,s.left,s.notMarked,s.daysInMonth,fmtDays(s.workingDays),s.extraDays,s.allowedWeekoff,s.adjustment,fmtDays(s.totalDaysPayable)];
    });
    const sheetRows=[hdr,...rows,[],['ATTENDANCE SUMMARY'],shdr,...srows];
    try{
      const blob=await exportReportExcelBlob('Attendance — '+months[selMonth]+' '+selYear,sheetRows);
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Attendance_'+months[selMonth]+'_'+selYear+'.xlsx';a.click();URL.revokeObjectURL(url);
    }catch(err){warn(err.message||'Could not build the Excel file — please try again.');}
  };
  if(EMPLOYEES.length===0){
    return React.createElement('div',{className:'fade-in'},
      React.createElement('div',{className:'section-header'},
        React.createElement('div',null,React.createElement('div',{className:'page-title'},'Employee Attendance'),React.createElement('div',{className:'page-sub'},'Monthly attendance register'))
      ),
      React.createElement('div',{className:'card',style:{textAlign:'center',padding:36,color:'var(--text3)'}},
        'No employees found. Add employees under Master Salary Sheet to start tracking attendance.'
      )
    );
  }
  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,React.createElement('div',{className:'page-title'},'Employee Attendance'),React.createElement('div',{className:'page-sub'},'Monthly attendance register — click any cell to mark it (previous day must be marked first)')),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}},
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selMonth,onChange:e=>setSelMonth(Number(e.target.value))},months.map((m,i)=>React.createElement('option',{key:m,value:i},m))),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selYear,onChange:e=>setSelYear(Number(e.target.value))},appYears().map(y=>React.createElement('option',{key:y},y))),
        !attMonthLocked&&React.createElement('label',{title:mgrFinalMonth?'Marked Final — Manager side locked for this whole month':'Mark this month Final (locks it for Manager-side edits — Super Admin/Reviewer can still edit)',style:{display:'flex',alignItems:'center',gap:5,fontSize:11.5,fontWeight:500,color:mgrFinalMonth?'var(--green)':'var(--text2)',cursor:(mgrFinalMonth&&isManagerSide)?'not-allowed':'pointer',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'6px 10px'}},
          React.createElement('input',{type:'checkbox',checked:mgrFinalMonth,disabled:mgrFinalMonth&&isManagerSide,onChange:toggleMgrFinalMonth}),
          mgrFinalMonth?'🔒 Month Final':'Mark Month Final'
        ),
        React.createElement('div',{className:'tab-bar',style:{marginBottom:0,padding:2}},
          [{id:'grid',label:'Individual'},{id:'register',label:'Full Register'}].map(t=>React.createElement('button',{key:t.id,className:`tab-btn ${viewMode===t.id?'active':''}`,onClick:()=>setViewMode(t.id)},t.label))
        ),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:downloadAttendanceTemplate},'⬇ Template'),
        React.createElement('input',{ref:bulkFileRef,type:'file',accept:'.xlsx,.xls',style:{display:'none'},onChange:handleBulkAttendanceFile}),
        React.createElement('button',{className:'btn btn-ghost btn-sm',disabled:bulkBusy,onClick:()=>bulkFileRef.current&&bulkFileRef.current.click()},bulkBusy?'Importing…':'⬆ Bulk Upload'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},onClick:exportRegister},'⬇ Export Register'),
        React.createElement('input',{type:'file',accept:'image/*,.pdf',style:{display:'none'},id:'att-register-upload',onChange:e=>{const f=e.target.files[0];if(f)handleAttRegFile(f);e.target.value='';}}),
        React.createElement('label',{htmlFor:'att-register-upload',className:'btn btn-ghost btn-sm',style:{cursor:'pointer',color:attRegFileName?'var(--green)':undefined,borderColor:attRegFileName?'rgba(76,175,125,0.4)':undefined}},attRegFileName?'📎 '+attRegFileName:'📎 Attach Register'),
        attRegFileName&&React.createElement('button',{'aria-label':'Download',className:'btn btn-ghost btn-sm',title:'Download attachment',onClick:downloadAttRegFile},'⬇'),
        attRegFileName&&React.createElement('button',{'aria-label':'Close',className:'btn btn-ghost btn-sm',title:'Remove attachment',onClick:()=>{if(confirm('Remove the attached Attendance Register ("'+attRegFileName+'")?'))setAttRegFile(null);}},'✕'),
        attMonthLocked&&React.createElement('span',{className:'badge badge-green',style:{fontSize:11}},'🔒 '+months[selMonth]+' '+selYear+' locked')
      )
    ),

    bulkResult&&React.createElement('div',{className:'modal-overlay',onClick:()=>setBulkResult(null)},
      React.createElement('div',{className:'modal',style:{width:520,maxHeight:'80vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Bulk Upload Results'),
        React.createElement('div',{style:{display:'flex',gap:10,marginBottom:16}},
          React.createElement('div',{className:'metric-card green',style:{flex:1}},React.createElement('div',{className:'metric-label'},'Employees Updated'),React.createElement('div',{className:'metric-value'},bulkResult.updatedEmployees)),
          React.createElement('div',{className:'metric-card blue',style:{flex:1}},React.createElement('div',{className:'metric-label'},'Days Updated'),React.createElement('div',{className:'metric-value'},bulkResult.updatedDays)),
          React.createElement('div',{className:'metric-card '+(bulkResult.failed.length?'red':'blue'),style:{flex:1}},React.createElement('div',{className:'metric-label'},'Skipped'),React.createElement('div',{className:'metric-value'},bulkResult.failed.length))
        ),
        bulkResult.failed.length>0&&React.createElement('div',{style:{maxHeight:220,overflowY:'auto'}},
          bulkResult.failed.map((msg,i)=>React.createElement('div',{key:i,style:{fontSize:12,color:'var(--text2)',padding:'6px 10px',background:'rgba(255,107,107,0.08)',borderRadius:6,marginBottom:4}},msg))
        ),
        bulkResult.updatedDays===0&&bulkResult.failed.length===0&&React.createElement('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No cells had a status in them — nothing to update.'),
        React.createElement('div',{className:'modal-actions'},React.createElement('button',{className:'btn btn-primary',onClick:()=>setBulkResult(null)},'Close'))
      )
    ),

    // ── Individual view ──
    viewMode==='grid'&&React.createElement('div',{className:'two-col'},
      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'card-title'},'Employees'),
        EMPLOYEES.map(e=>{
          const days=daysFor(e.id);
          const P=days.slice(0,daysInMonth).filter(d=>d==='present').length;
          const A=days.slice(0,daysInMonth).filter(d=>d==='absent').length;
          return React.createElement('div',{key:e.id,
            style:{padding:'10px 12px',borderRadius:'var(--r)',cursor:'pointer',marginBottom:4,
              background:selEmp===e.id?'var(--bg3)':'transparent',
              borderLeft:`2px solid ${selEmp===e.id?'var(--accent)':'transparent'}`},
            onClick:()=>setSelEmp(e.id)},
            React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
              React.createElement('div',null,
                React.createElement('div',{style:{fontWeight:500,fontSize:13,color:selEmp===e.id?'var(--accent)':'var(--text)'}},e.name),
                React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},e.desig+' · '+e.dept)
              ),
              React.createElement('div',{style:{fontSize:11,color:'var(--text3)',textAlign:'right'}},
                React.createElement('span',{style:{color:'var(--green)'}},'P:'+P),
                ' ',
                React.createElement('span',{style:{color:'var(--red)'}},'A:'+A)
              )
            )
          );
        })
      ),
      React.createElement('div',null,
        React.createElement('div',{className:'grid4',style:{marginBottom:14}},
          [{label:'Present',val:present,color:'green'},{label:'Absent',val:absent,color:'red'},{label:'Half Day',val:half,color:'amber'},{label:'LOP Days',val:lop,color:'purple'}].map(m=>
            React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},React.createElement('div',{className:'metric-label'},m.label),React.createElement('div',{className:'metric-value'},m.val))
          )
        ),
        React.createElement('div',{className:'card'},
          React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}},
            React.createElement('div',{style:{fontWeight:500,fontSize:13,color:'var(--text)'}},(emp?emp.name:'—')+' — '+months[selMonth]+' '+selYear),
            React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},'Click cell to mark or override · greyed = mark the previous day first')
          ),
          React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginBottom:4}},
            ['M','T','W','T','F','S','S'].map((d,i)=>React.createElement('div',{key:i,style:{textAlign:'center',fontSize:9,color:'var(--text3)',fontWeight:700,padding:'2px 0'}},d))
          ),
          React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3}},
            // Empty cells before the 1st so every date sits under its real weekday (Mon-first).
            Array.from({length:(new Date(selYear,selMonth,1).getDay()+6)%7},(_,i)=>React.createElement('div',{key:'pad'+i,'aria-hidden':true})),
            Array.from({length:daysInMonth},(_,i)=>{
              const status=empDays[i];
              const dayLocked=isMonthLockedForRole||attMonthLocked;
              const markable=attDayMarkable(empDays,i)&&!dayLocked;
              const cls=status?STATUS_CSS[status]:'att-blank';
              return React.createElement('div',{key:i,
                className:`att-day ${cls} ${(!status&&!markable)?'att-locked':''}`,
                style:{cursor:markable?'pointer':'not-allowed',position:'relative',fontSize:9,aspectRatio:'1',minHeight:28,opacity:dayLocked?0.55:1},
                onClick:()=>toggleStatus(selEmp,i),
                title:dayLocked?(mgrFinalMonth?'Marked Final — ask a Super Admin or Reviewer to un-finalize it':'This month is locked'):(status?STATUS_FULL[status]:(markable?'Not marked — click to mark':'Mark the previous day first'))},
                React.createElement('div',{style:{fontSize:8,position:'absolute',top:2,left:0,right:0,textAlign:'center',color:'inherit',opacity:0.7}},i+1),
                status?(STATUS_LABELS[status]||'—'):'·'
              );
            })
          ),
          React.createElement('div',{style:{display:'flex',gap:10,marginTop:10,flexWrap:'wrap'}},
            [...Object.entries(STATUS_FULL),['blank','Not Marked']].map(([k,v])=>React.createElement('div',{key:k,style:{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'var(--text2)'}},
              React.createElement('div',{className:`att-day ${k==='blank'?'att-blank':STATUS_CSS[k]}`,style:{width:14,height:14,fontSize:7}}),v
            ))
          )
        )
      )
    ),

    // ── Daily Attendance Sheet (Full Register) view ──
    viewMode==='register'&&React.createElement(React.Fragment,null,
      React.createElement('div',{className:'card',style:{padding:0,marginBottom:16}},
        React.createElement('div',{style:{padding:'10px 14px',fontSize:12,fontWeight:600,color:'var(--text)',borderBottom:'1px solid var(--border)'}},'Daily Attendance Sheet — '+months[selMonth]+' '+selYear),
        React.createElement('div',{style:{padding:'6px 14px',fontSize:10.5,color:'var(--text3)',borderBottom:'1px solid var(--border)'}},'A blank day can only be marked once the previous day already has a status. Weekoff / Not Joined / Left are set automatically from Weekly Off, DOJ and DOL, but can always be overridden — e.g. mark a Weekoff as Present if the employee worked that day, or mark any other day as Weekoff if they took it off instead.'),
        React.createElement('div',{style:{overflowX:'auto'}},
          React.createElement('table',{style:{borderCollapse:'collapse',fontSize:11,width:'100%'}},
            React.createElement('thead',null,
              React.createElement('tr',null,
                React.createElement('th',{style:{padding:'8px 12px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',position:'sticky',left:0,zIndex:3,whiteSpace:'nowrap',borderRight:'1px solid var(--border2)',minWidth:160}},'Name of Employee'),
                React.createElement('th',{style:{padding:'8px 10px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',whiteSpace:'nowrap',borderRight:'1px solid var(--border2)',minWidth:120}},'Designation'),
                React.createElement('th',{style:{padding:'8px 10px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',whiteSpace:'nowrap',borderRight:'1px solid var(--border2)',minWidth:100}},'Weekly Off'),
                React.createElement('th',{style:{padding:'8px 10px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',whiteSpace:'nowrap',borderRight:'1px solid var(--border2)',minWidth:90}},'DOJ'),
                React.createElement('th',{style:{padding:'8px 10px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',whiteSpace:'nowrap',borderRight:'2px solid var(--border2)',minWidth:90}},'DOL'),
                ...dayHeaders.map(d=>React.createElement('th',{key:d,style:{padding:'8px 4px',background:'var(--th-bg)',color:'var(--text2)',fontSize:10,fontWeight:600,textAlign:'center',minWidth:88,borderRight:'1px solid var(--border)'}},d))
              )
            ),
            React.createElement('tbody',null,
              EMPLOYEES.map(e=>{
                const days=daysFor(e.id);
                const sl=days.slice(0,daysInMonth);
                return React.createElement('tr',{key:e.id},
                  React.createElement('td',{style:{padding:'7px 12px',position:'sticky',left:0,zIndex:2,background:'var(--bg2)',borderRight:'1px solid var(--border2)',borderBottom:'1px solid var(--border)'}},
                    React.createElement('div',{style:{fontWeight:500,color:'var(--text)',fontSize:12}},e.name)
                  ),
                  React.createElement('td',{style:{padding:'7px 10px',borderRight:'1px solid var(--border2)',borderBottom:'1px solid var(--border)',color:'var(--text2)',whiteSpace:'nowrap'}},e.desig),
                  React.createElement('td',{style:{padding:'7px 10px',borderRight:'1px solid var(--border2)',borderBottom:'1px solid var(--border)',color:'var(--text2)',whiteSpace:'nowrap'}},e.weeklyOff),
                  React.createElement('td',{style:{padding:'7px 10px',borderRight:'1px solid var(--border2)',borderBottom:'1px solid var(--border)',color:'var(--text2)',whiteSpace:'nowrap'}},fmtShort(e.doj)),
                  React.createElement('td',{style:{padding:'7px 10px',borderRight:'2px solid var(--border2)',borderBottom:'1px solid var(--border)',color:'var(--text2)',whiteSpace:'nowrap'}},fmtShort(e.dol)),
                  ...sl.map((st,di)=>{
                    const markable=attDayMarkable(sl,di)&&!isMonthLockedForRole&&!attMonthLocked;
                    return React.createElement('td',{key:di,
                      className:st?STATUS_CSS[st]:'att-blank',
                      style:{borderRight:'1px solid var(--border)',borderBottom:'1px solid var(--border)',textAlign:'center',padding:0,height:34,opacity:(!st&&!markable)?0.45:1}},
                      React.createElement('select',{
                        value:st||'',
                        disabled:!markable,
                        onChange:ev=>setStatus(e.id,di,ev.target.value),
                        title:isMonthLockedForRole?'Marked Final — ask a Super Admin or Reviewer to un-finalize it':(markable?'':'Mark the previous day first'),
                        style:{width:'100%',height:'100%',fontSize:10.5,padding:'0 4px',border:'none',background:'transparent',color:'inherit',fontWeight:500,cursor:markable?'pointer':'not-allowed',textAlignLast:'center'}
                      },[React.createElement('option',{key:'',value:'',disabled:true},'— Mark —'),...STATUS_OPTS.map(so=>React.createElement('option',{key:so,value:so},STATUS_FULL[so]))])
                    );
                  })
                );
              })
            )
          )
        )
      ),

      // ── Attendance Summary (after the Daily Attendance Sheet) ──
      React.createElement('div',{className:'card',style:{padding:0}},
        React.createElement('div',{style:{padding:'10px 14px',borderBottom:'1px solid var(--border)'}},
          React.createElement('div',{style:{fontSize:12,fontWeight:600,color:'var(--text)'}},'Attendance Summary — '+months[selMonth]+' '+selYear),
          React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:4,lineHeight:1.6}},
            'Total = 1+2+3+4+5+6+7+8  ·  Working Days = Total − 7(Left) − 6(Not Joined) − 5(Absent) − 4(Halfday)÷2 − 8(Not Marked) − Adjustment  ·  Extra Days = Allowed Weekoff − 2(Weekoff)  ·  Total Days = Working Days + Extra Days  ·  Allowed Weekoff = weekly-off weekday occurrences within DOJ–DOL for this month  ·  Not Marked days are not assumed present — mark them to convert them into paid days  ·  Adjustment is entered manually and reduces Working Days'
          )
        ),
        React.createElement('div',{style:{overflowX:'auto'}},
          React.createElement('table',{style:{borderCollapse:'collapse',fontSize:11,width:'100%'}},
            React.createElement('thead',null,
              React.createElement('tr',null,
                React.createElement('th',{style:{padding:'8px 12px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',whiteSpace:'nowrap',borderRight:'1px solid var(--border2)',minWidth:160}},'Name of Employee'),
                ['1. Present','2. Weekoff','3. Holiday','4. Halfday','5. Absent','6. Not Joined','7. Left','8. Not Marked'].map(h=>React.createElement('th',{key:h,style:{padding:'8px 10px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textAlign:'center',borderRight:'1px solid var(--border)',minWidth:96}},h)),
                ['Total','Working Days','Extra Days','Allowed Weekoff','Adjustment','Total Days'].map(h=>React.createElement('th',{key:h,style:{padding:'8px 10px',background:'var(--bg3)',color:'var(--accent)',fontSize:10,fontWeight:700,textAlign:'center',borderLeft:h==='Total'?'2px solid var(--border2)':undefined,borderRight:'1px solid var(--border2)',minWidth:100}},h))
              )
            ),
            React.createElement('tbody',null,
              EMPLOYEES.map(e=>{
                const s=attSummaryFor(e,selYear,selMonth,recordFor(e.id));
                const vals=[s.present,s.off,s.holiday,s.half,s.absent,s.notjoined,s.left,s.notMarked];
                const colors=['var(--green)','var(--text2)','var(--blue)','var(--accent2)','var(--red)','var(--text3)','var(--purple)',s.notMarked>0?'var(--orange)':'var(--text3)'];
                const rec=recordFor(e.id);
                const adjRaw=rec&&rec.adjustment!==undefined?rec.adjustment:0;
                return React.createElement('tr',{key:e.id},
                  React.createElement('td',{style:{padding:'7px 12px',borderRight:'1px solid var(--border2)',borderBottom:'1px solid var(--border)',fontWeight:500,color:'var(--text)'}},e.name),
                  ...vals.map((v,vi)=>React.createElement('td',{key:vi,style:{padding:'7px 10px',textAlign:'center',fontWeight:600,color:colors[vi],borderRight:'1px solid var(--border)',borderBottom:'1px solid var(--border)'}},v)),
                  React.createElement('td',{style:{padding:'7px 10px',textAlign:'center',fontWeight:700,color:'var(--text)',borderLeft:'2px solid var(--border2)',borderRight:'1px solid var(--border2)',borderBottom:'1px solid var(--border)'}},s.daysInMonth),
                  React.createElement('td',{style:{padding:'7px 10px',textAlign:'center',fontWeight:700,color:'var(--accent2)',borderRight:'1px solid var(--border2)',borderBottom:'1px solid var(--border)'}},fmtDays(s.workingDays)),
                  React.createElement('td',{style:{padding:'7px 10px',textAlign:'center',fontWeight:700,color:s.extraDays>0?'var(--orange)':s.extraDays<0?'var(--red)':'var(--text3)',borderRight:'1px solid var(--border2)',borderBottom:'1px solid var(--border)'}},s.extraDays),
                  React.createElement('td',{style:{padding:'7px 10px',textAlign:'center',fontWeight:700,color:'var(--text2)',borderRight:'1px solid var(--border2)',borderBottom:'1px solid var(--border)'}},s.allowedWeekoff),
                  React.createElement('td',{style:{padding:'4px 8px',textAlign:'center',borderRight:'1px solid var(--border2)',borderBottom:'1px solid var(--border)'}},
                    React.createElement('input',{type:'number',value:adjRaw,onChange:ev=>setAdjustment(e.id,ev.target.value),
                      style:{width:60,textAlign:'center',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:4,color:'var(--text)',fontSize:11,padding:'3px 4px'}})
                  ),
                  React.createElement('td',{style:{padding:'7px 10px',textAlign:'center',fontWeight:700,color:'var(--green)',borderRight:'1px solid var(--border2)',borderBottom:'1px solid var(--border)'}},fmtDays(s.totalDaysPayable))
                );
              })
            )
          )
        )
      )
    )
  );
}

function SalaryWorkingCore({period,salon,onNavTab,user}={}){
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today=new Date();
  const initCal=periodToCalendar(period);
  const [selMonth,setSelMonth]=useState(initCal?initCal.month:today.getMonth());
  const [selYear,setSelYear]=useState(initCal?initCal.year:today.getFullYear());
  useEffect(()=>{
    const cal=periodToCalendar(period);
    if(cal){setSelMonth(cal.month);setSelYear(cal.year);}
    // eslint-disable-next-line
  },[period&&period.mi,period&&period.fy]);
  const EMPLOYEES=getEmployeesForMonth(selYear,selMonth,salon?.id);
  const {success,error:swError}=useToast();
  // Row meta: Status / Payment Status / Mode — persisted per outlet, keyed like attendance
  useState(()=>reconcileAdvanceRecoveries(salon?.id)); // settle installments of months already locked
  const [meta,setMeta]=useState(()=>loadSWMeta(salon?.id));
  useEffect(()=>{saveSWMeta(meta,salon?.id);},[meta]);
  const metaKey=attMonthKey;
  const metaFor=(empId)=>meta[metaKey(empId,selYear,selMonth)]||{status:'Draft',paymentStatus:'Not Paid',mode:''};
  // ── Month Lock — read fresh from storage (also touched by Master Sheet's own Lock Months
  // panel and by Attendance/Incentive Working), and re-checked any time meta changes so an
  // Approve action that completes the set locks the month immediately, same render. ──
  const [monthLockTick,setMonthLockTick]=useState(0);
  const monthLockRec=monthLockRecordFor(salon?.id,selYear,selMonth);
  const monthLocked=!!(monthLockRec&&monthLockRec.locked);
  const unlockMonth=()=>{
    const msg=(monthLockRec&&monthLockRec.source==='manual')
      ?'Unlock '+MONTHS[selMonth]+' '+selYear+' for this outlet? Attendance, Salary Working and Incentive Working will all become editable again.'
      :'Unlock '+MONTHS[selMonth]+' '+selYear+' Salary Working (and Attendance) for this outlet? It will become editable again — Incentive Working is unaffected.';
    if(monthLockRec&&monthLockRec.source==='pnl-final'){window.alert('The P&L (Monthly) for '+MONTHS[selMonth]+' '+selYear+' is Final — un-finalize the P&L first.');return;}
    if(!requestUnlock(salon?.id,MONTHS[selMonth]+' '+selYear+' Salary Working'))return;
    setMonthLockFor(salon?.id,selYear,selMonth,false);
    setMonthLockTick(t=>t+1);
    success(MONTHS[selMonth]+' '+selYear+' unlocked');
  };
  // Manual lock — an admin can lock Salary Working (and Attendance, since Attendance feeds it)
  // directly, without waiting for every employee to be marked Approved. Incentive Working is
  // untouched, same independence as the existing auto-lock.
  const lockSalaryWorking=()=>{
    if(!window.confirm('Lock '+MONTHS[selMonth]+' '+selYear+' Salary Working (and Attendance) for this outlet? Incentive Working is unaffected and can still be edited/approved separately. You can unlock it again anytime from here.'))return;
    setMonthLockFor(salon?.id,selYear,selMonth,true,'manual-sw');
    setMonthLockTick(t=>t+1);
    success(MONTHS[selMonth]+' '+selYear+' Salary Working locked');
  };
  // Lock Entire Month — same effect as the Master Sheet's own "🔒 Months" panel (source:'manual'),
  // offered here too so it doesn't require navigating away from Salary Working to use it.
  const lockEntireMonth=()=>{
    if(!window.confirm('Lock the ENTIRE month of '+MONTHS[selMonth]+' '+selYear+' for this outlet? Attendance, Salary Working AND Incentive Working will all become read-only until unlocked — same as the Master Sheet \'🔒 Months\' panel.'))return;
    setMonthLockFor(salon?.id,selYear,selMonth,true,'manual');
    setMonthLockTick(t=>t+1);
    success('Entire month '+MONTHS[selMonth]+' '+selYear+' locked');
  };
  // ── Advance paydown on salary approval ───────────────────────────────────────────────────
  // Salary Working's "Advance Adj." column already showed each month's installment and the
  // running "Op./Closing Advance" balance — but it was purely informational: nothing ever
  // reduced the actual advance record on the Advances sheet, so the same balance (and the same
  // monthly deduction) would recur forever, never actually paying the advance down. This makes
  // marking a month's row Approved genuinely settle that month's installment — computed the exact
  // same way advanceDeductionFor totals it (each active Salary advance's own scheduled amount, or
  // flat repayment, capped at what's left on THAT record) — against the exact record(s) it came
  // from, rather than a lump sum reallocated oldest-first across every active advance. That
  // distinction matters once a pulled-forward Next Month Advance is in the mix: oldest-first could
  // grab the money from an unrelated older advance instead, leaving the pulled one's own balance
  // untouched. Un-approving (status changed back to Draft) cleanly reverses exactly what was
  // deducted, using the breakdown recorded at the time, so toggling Approval Status back and forth
  // can never double-deduct or leave the balance wrong.
  const applyAdvanceSettlement=(empName,year,month)=>{
    const key=outletKey('salonos_advances',salon?.id);
    let all=[];
    try{const raw=JSON.parse(cachedLocalGet(key)||'[]');if(Array.isArray(raw))all=raw;}catch(e){}
    const breakdown=[];
    const next=all.map(a=>{
      if(a.emp!==empName||a.status!=='Active'||(a.deductFrom||'Salary')!=='Salary')return a;
      const scheduled=scheduledAmountFor(a,year,month);
      const planned=scheduled!==null?scheduled:(Number(a.repayment)||0);
      const ym=year+'-'+String(month+1).padStart(2,'0');
      const done=Number((a.settled||{})[ym])||0; // already recovered for this month (e.g. when the month was locked)
      const take=Math.min(Math.max(0,planned-done),Math.max(0,Number(a.outstanding)||0));
      if(take<=0)return a;
      breakdown.push({id:a.id,amount:take,ym});
      const newOutstanding=Math.max(0,(Number(a.outstanding)||0)-take);
      return{...a,outstanding:newOutstanding,settled:{...(a.settled||{}),[ym]:done+take},status:newOutstanding<=0?'Recovered':a.status};
    });
    safeLocalSet(key,JSON.stringify(next));
    return breakdown;
  };
  const reverseAdvanceSettlement=(breakdown)=>{
    if(!breakdown||!breakdown.length)return;
    const key=outletKey('salonos_advances',salon?.id);
    let all=[];
    try{const raw=JSON.parse(cachedLocalGet(key)||'[]');if(Array.isArray(raw))all=raw;}catch(e){}
    const byId=Object.fromEntries(breakdown.map(b=>[b.id,b.amount]));
    const next=all.map(a=>{
      if(!(a.id in byId))return a;
      const restored=(Number(a.outstanding)||0)+byId[a.id];
      const bym=(breakdown.find(b=>b.id===a.id)||{}).ym;
      const settled={...(a.settled||{})};
      if(bym){settled[bym]=Math.max(0,(Number(settled[bym])||0)-byId[a.id]);if(!settled[bym])delete settled[bym];}
      return{...a,outstanding:restored,settled,status:restored>0?'Active':a.status};
    });
    safeLocalSet(key,JSON.stringify(next));
  };
  // ── Pull a Next Month Advance forward into this month's deduction ───────────────────────
  // Some advances get recorded early — dated in the month AFTER the one currently being worked
  // on (e.g. entering a July advance while still processing June's payroll) — and by default they
  // just sit there as a reference balance ("Next Month Adv") until that later month's own Salary
  // Working run picks them up naturally. This lets a person instead pull one forward and settle it
  // as part of THIS month's deduction, with a cutoff date so only advances actually dated on/before
  // that date (within next month) qualify — an advance dated later in that month is left alone for
  // its own month to handle. Implemented as a per-advance month-wise schedule entry for THIS
  // month, reusing the exact same schedule mechanism advanceDeductionFor already reads — which
  // has a useful side effect for free: once a record has ANY schedule, a month with no entry in it
  // returns 0 rather than falling back to the flat repayment amount (see scheduledAmountFor), so
  // next month's own Salary Working run automatically will NOT deduct it again.
  const pullNextMonthAdvance=(empId,cutoffDate)=>{
    const emp=EMPLOYEES.find(e=>e.id===empId);
    if(!emp)return[];
    const key=outletKey('salonos_advances',salon?.id);
    let all=[];
    try{const raw=JSON.parse(cachedLocalGet(key)||'[]');if(Array.isArray(raw))all=raw;}catch(e){}
    const nextY=selMonth===11?selYear+1:selYear,nextM=selMonth===11?0:selMonth+1;
    const curKey=selYear+'-'+String(selMonth+1).padStart(2,'0');
    const breakdown=[];
    const next=all.map(a=>{
      if(a.emp!==emp.name||a.status!=='Active'||(a.deductFrom||'Salary')!=='Salary')return a;
      const d=a.date?new Date(a.date+'T00:00:00'):null;
      if(!d||isNaN(d)||d.getFullYear()!==nextY||d.getMonth()!==nextM)return a; // not a Next Month advance
      if(cutoffDate&&a.date>cutoffDate)return a; // dated after the chosen cutoff — leave for its own month
      const outstanding=Math.max(0,Number(a.outstanding)||0);
      if(outstanding<=0)return a;
      breakdown.push({id:a.id,amount:outstanding});
      const schedule=[...(Array.isArray(a.schedule)?a.schedule:[])];
      const idx=schedule.findIndex(s=>s.month===curKey);
      if(idx>=0)schedule[idx]={...schedule[idx],amount:(Number(schedule[idx].amount)||0)+outstanding};
      else schedule.push({month:curKey,amount:outstanding});
      return{...a,schedule};
    });
    safeLocalSet(key,JSON.stringify(next));
    return breakdown;
  };
  // Reverses exactly what pullNextMonthAdvance added — subtracts the pulled amount back out of
  // each affected advance's schedule entry for this month (removing the entry entirely if that
  // brings it to zero), leaving everything else on the record untouched.
  const reverseNextMonthAdvancePull=(breakdown)=>{
    if(!breakdown||!breakdown.length)return;
    const key=outletKey('salonos_advances',salon?.id);
    let all=[];
    try{const raw=JSON.parse(cachedLocalGet(key)||'[]');if(Array.isArray(raw))all=raw;}catch(e){}
    const curKey=selYear+'-'+String(selMonth+1).padStart(2,'0');
    const byId=Object.fromEntries(breakdown.map(b=>[b.id,b.amount]));
    const next=all.map(a=>{
      if(!(a.id in byId))return a;
      const schedule=(Array.isArray(a.schedule)?a.schedule:[])
        .map(s=>s.month===curKey?{...s,amount:Math.max(0,(Number(s.amount)||0)-byId[a.id])}:s)
        .filter(s=>!(s.month===curKey&&Number(s.amount)<=0));
      return{...a,schedule};
    });
    safeLocalSet(key,JSON.stringify(next));
  };
  const [nextAdvPullModal,setNextAdvPullModal]=useState(null); // {empId} | null
  // ESIC (Emp) working/edit popup — shows the standard 0.75%-of-Gross calculation behind the
  // figure, with an option to override it for this employee this month (e.g. to match a slightly
  // different rounding the ESIC portal itself produced). Clears back to the auto-calculated
  // amount whenever the override field is emptied.
  const [showEsicWorking,setShowEsicWorking]=useState(null); // employee working row | null
  const [esicOverrideDraft,setEsicOverrideDraft]=useState('');
  const openEsicWorking=(e)=>{
    if(monthLocked){swError('This month is locked — unlock it above to make changes.');return;}
    setEsicOverrideDraft(e.esicOverridden?String(e.esicEmp):'');
    setShowEsicWorking(e);
  };
  const saveEsicOverride=()=>{
    const empId=showEsicWorking.id;
    const k=metaKey(empId,selYear,selMonth);
    setMeta(prev=>({...prev,[k]:{...(prev[k]||{status:'Draft',paymentStatus:'Not Paid',mode:''}),esicOverride:esicOverrideDraft===''?undefined:esicOverrideDraft}}));
    setShowEsicWorking(null);
  };
  // PF (Emp) working/edit popup — same pattern as ESIC above: shows the standard 12%-of-wage-base
  // calculation, with an option to override it for this employee this month.
  const [showPfWorking,setShowPfWorking]=useState(null); // employee working row | null
  const [pfOverrideDraft,setPfOverrideDraft]=useState('');
  const openPfWorking=(e)=>{
    if(monthLocked){swError('This month is locked — unlock it above to make changes.');return;}
    setPfOverrideDraft(e.pfOverridden?String(e.pfEmp):'');
    setShowPfWorking(e);
  };
  const savePfOverride=()=>{
    const empId=showPfWorking.id;
    const k=metaKey(empId,selYear,selMonth);
    setMeta(prev=>({...prev,[k]:{...(prev[k]||{status:'Draft',paymentStatus:'Not Paid',mode:''}),pfOverride:pfOverrideDraft===''?undefined:pfOverrideDraft}}));
    setShowPfWorking(null);
  };
  // PT (Professional Tax) working/edit popup — same pattern as ESIC/PF above: shows the state
  // slab calculation, with an option to override it for this employee this month.
  const [showPtWorking,setShowPtWorking]=useState(null); // employee working row | null
  const [ptOverrideDraft,setPtOverrideDraft]=useState('');
  const openPtWorking=(e)=>{
    if(monthLocked){swError('This month is locked — unlock it above to make changes.');return;}
    setPtOverrideDraft(e.ptOverridden?String(e.ptAmt):'');
    setShowPtWorking(e);
  };
  const savePtOverride=()=>{
    const empId=showPtWorking.id;
    const k=metaKey(empId,selYear,selMonth);
    setMeta(prev=>({...prev,[k]:{...(prev[k]||{status:'Draft',paymentStatus:'Not Paid',mode:''}),ptOverride:ptOverrideDraft===''?undefined:ptOverrideDraft}}));
    setShowPtWorking(null);
  };
  // TDS entry popup — no auto-calculation to show (see the comment on tdsAmt in swWorkingsFor for
  // why), so this is just a plain amount entry, not a working-plus-override like PF/ESIC/PT.
  const [showTdsEntry,setShowTdsEntry]=useState(null); // employee working row | null
  const [tdsAmountDraft,setTdsAmountDraft]=useState('');
  const openTdsEntry=(e)=>{
    if(monthLocked){swError('This month is locked — unlock it above to make changes.');return;}
    setTdsAmountDraft(e.tdsAmt>0?String(e.tdsAmt):'');
    setShowTdsEntry(e);
  };
  const saveTdsAmount=()=>{
    const empId=showTdsEntry.id;
    const k=metaKey(empId,selYear,selMonth);
    setMeta(prev=>({...prev,[k]:{...(prev[k]||{status:'Draft',paymentStatus:'Not Paid',mode:''}),tdsAmount:tdsAmountDraft===''?undefined:tdsAmountDraft}}));
    setShowTdsEntry(null);
  };
  // Tea Allowance — flat amount or ₹/Working-Day, configurable per outlet (see loadTeaConfig).
  const [teaConfig,setTeaConfigState]=useState(()=>loadTeaConfig(salon?.id));
  useEffect(()=>{setTeaConfigState(loadTeaConfig(salon?.id));},[salon?.id]);
  const [teaConfigModalOpen,setTeaConfigModalOpen]=useState(false);
  const [teaConfigDraft,setTeaConfigDraft]=useState(teaConfig);
  const openTeaConfigModal=()=>{setTeaConfigDraft(teaConfig);setTeaConfigModalOpen(true);};
  const saveTeaConfigDraft=()=>{
    const cfg={mode:teaConfigDraft.mode==='perDay'?'perDay':'fixed',rate:Number(teaConfigDraft.rate)||0};
    setTeaConfigState(cfg);saveTeaConfig(cfg,salon?.id);setTeaConfigModalOpen(false);
  };
  // Incentive-figure drill-down — opened by clicking Svc Incentive / Mem Inc / Prod Inc / MGR Inc
  // / Non-Performance Penalty / Total Inc, any of which just show the one number here. Shows the
  // full Incentive Working detail behind it (target/achieved/rate per category, Manager Incentive,
  // Penalty, and the Total formula) rather than leaving the person to go re-derive it themselves.
  const [incWorkingModal,setIncWorkingModal]=useState(null); // employee working row | null
  const [nextAdvPullDateInput,setNextAdvPullDateInput]=useState('');
  const openNextAdvPullModal=(empId)=>{
    if(monthLocked){swError('This month is locked — unlock it above to make changes.');return;}
    const nextY=selMonth===11?selYear+1:selYear,nextM=selMonth===11?0:selMonth+1;
    setNextAdvPullDateInput(localDateToISO(new Date(nextY,nextM+1,0))); // defaults to the last day of next month — pulls in everything dated that month unless narrowed down
    setNextAdvPullModal({empId});
  };
  const confirmNextAdvPull=()=>{
    if(!nextAdvPullModal||!nextAdvPullDateInput){swError('Pick a date first.');return;}
    const empId=nextAdvPullModal.empId;
    const breakdown=pullNextMonthAdvance(empId,nextAdvPullDateInput);
    if(!breakdown.length){swError('No Next Month Advance dated on or before that date to adjust.');setNextAdvPullModal(null);return;}
    const k=metaKey(empId,selYear,selMonth);
    setMeta(prev=>({...prev,[k]:{...(prev[k]||{status:'Draft',paymentStatus:'Not Paid',mode:''}),nextAdvPull:true,nextAdvPullDate:nextAdvPullDateInput,nextAdvPullBreakdown:breakdown}}));
    setNextAdvPullModal(null);
    success('Next Month Advance up to '+fmtDMY(nextAdvPullDateInput)+' will be adjusted in '+MONTHS[selMonth]+'\'s salary.');
  };
  const uncheckNextAdvPull=(empId)=>{
    if(monthLocked){swError('This month is locked — unlock it above to make changes.');return;}
    const k=metaKey(empId,selYear,selMonth);
    const cur=meta[k];
    if(!cur||!cur.nextAdvPull)return;
    reverseNextMonthAdvancePull(cur.nextAdvPullBreakdown);
    setMeta(prev=>({...prev,[k]:{...prev[k],nextAdvPull:false,nextAdvPullDate:'',nextAdvPullBreakdown:undefined}}));
  };
  const setMetaField=(empId,field,value)=>{
    if(monthLocked){swError('This month is locked — unlock it above to make changes.');return;}
    let nextMap=null;
    setMeta(prev=>{
      const k=metaKey(empId,selYear,selMonth);
      const cur=prev[k]||{status:'Draft',paymentStatus:'Not Paid',mode:''};
      const next={...cur,[field]:value};
      if(field==='paymentStatus'&&value==='Not Paid')next.mode='';
      if(field==='status'){
        const emp=EMPLOYEES.find(e=>e.id===empId);
        if(value==='Approved'&&!cur.advanceSettled&&emp){
          const breakdown=applyAdvanceSettlement(emp.name,selYear,selMonth);
          if(breakdown.length){
            next.advanceSettled=true;next.advanceSettledBreakdown=breakdown;
            const w=workings.find(w=>w.id===empId);
            if(w)next.advanceSplitSnapshot={prev:w.prevAdv,curr:w.currAdv,next:w.nextAdv};
          }
        }else if(value!=='Approved'&&cur.advanceSettled){
          reverseAdvanceSettlement(cur.advanceSettledBreakdown);
          next.advanceSettled=false;next.advanceSettledBreakdown=undefined;next.advanceSplitSnapshot=undefined;
        }
      }
      nextMap={...prev,[k]:next};
      return nextMap;
    });
    // Every employee's Salary Working row just became Approved for this outlet+month — lock it.
    if(field==='status'&&value==='Approved'){
      setTimeout(()=>{
        const locked=autoLockMonthIfAllApproved(salon?.id,selYear,selMonth,EMPLOYEES,nextMap,undefined);
        if(locked){setMonthLockTick(t=>t+1);success(MONTHS[selMonth]+' '+selYear+' auto-locked — every employee is now Approved');}
      },0);
    }
  };
  const approveAll=()=>{
    if(monthLocked){swError('This month is locked — unlock it above to make changes.');return;}
    let nextMap=null;
    setMeta(prev=>{
      const next={...prev};
      EMPLOYEES.forEach(e=>{
        const k=metaKey(e.id,selYear,selMonth);
        const cur=next[k]||{status:'Draft',paymentStatus:'Not Paid',mode:''};
        const upd={...cur,status:'Approved'};
        if(!cur.advanceSettled){
          const breakdown=applyAdvanceSettlement(e.name,selYear,selMonth);
          if(breakdown.length){
            upd.advanceSettled=true;upd.advanceSettledBreakdown=breakdown;
            const w=workings.find(w=>w.id===e.id);
            if(w)upd.advanceSplitSnapshot={prev:w.prevAdv,curr:w.currAdv,next:w.nextAdv};
          }
        }
        next[k]=upd;
      });
      nextMap=next;
      return next;
    });
    success('All employees marked Approved for '+MONTHS[selMonth]+' '+selYear);
    setTimeout(()=>{
      const locked=autoLockMonthIfAllApproved(salon?.id,selYear,selMonth,EMPLOYEES,nextMap,undefined);
      if(locked){setMonthLockTick(t=>t+1);success(MONTHS[selMonth]+' '+selYear+' auto-locked — every employee is now Approved');}
    },0);
  };
  // Column applicability toggles — persisted per outlet (see loadSWCols/saveSWCols), since these
  // now gate the actual Net Salary calculation, not just which columns are shown.
  const [cols,setCols]=useState(()=>loadSWCols(salon?.id));
  useEffect(()=>{saveSWCols(cols,salon?.id);},[cols,salon?.id]);
  const toggleCol=(k)=>setCols(p=>({...p,[k]:!p[k]}));
  // Refresh — workings is recomputed fresh from storage on every render already; this just
  // forces a re-render, so any change made elsewhere since the page opened (Attendance edited,
  // an advance settled or added, a penalty entered, PT slabs updated) shows up immediately
  // without navigating away and back.
  const [refreshTick,setRefreshTick]=useState(0);
  const doRefresh=()=>{setRefreshTick(t=>t+1);success('Refreshed — pulling the latest Attendance, Advances, and Penalties data.');};

  // ── Professional Tax slabs — editable per outlet, defaulting to the outlet's state's own
  // commonly-cited slabs (see PT_DEFAULT_SLABS). Verify against the current state notification;
  // these are starting defaults, not guaranteed current. ──
  const ptState=salon?.state||'';
  const ptApplies=ptAppliesToState(ptState);
  const [ptSlabs,setPtSlabsState]=useState(()=>loadPtSlabs(salon?.id,ptState));
  useEffect(()=>{setPtSlabsState(loadPtSlabs(salon?.id,ptState));},[salon?.id,ptState]);
  const [showPtSlabs,setShowPtSlabs]=useState(false);
  const setPtSlabField=(idx,field,value)=>{
    const next=ptSlabs.map((t,i)=>i===idx?{...t,[field]:value===''?0:Number(value)}:t);
    setPtSlabsState(next);savePtSlabs(salon?.id,next);
  };
  const addPtSlab=()=>{
    const next=[...ptSlabs];
    const openIdx=next.findIndex(t=>t.upto==null);
    const insertAt=openIdx>=0?openIdx:next.length;
    next.splice(insertAt,0,{upto:0,amount:0});
    setPtSlabsState(next);savePtSlabs(salon?.id,next);
  };
  const removePtSlab=(idx)=>{
    if(!confirm('Remove this PT slab tier? This changes the live Professional Tax calculation for this outlet.'))return;
    const next=ptSlabs.filter((_,i)=>i!==idx);
    setPtSlabsState(next);savePtSlabs(salon?.id,next);
  };
  const resetPtSlabs=()=>{
    const next=(PT_DEFAULT_SLABS[ptState]||[]).map(t=>({...t}));
    setPtSlabsState(next);savePtSlabs(salon?.id,next);
  };

  const fmtDays=(n)=>Number.isInteger(n)?String(n):n.toFixed(1);

  // Build per-employee working — shared with Incentive Working & P&L's Employee Cost,
  // so Total Days (from Attendance) and every derived figure always agree everywhere.
  const workings=swWorkingsFor(salon?.id,selYear,selMonth);

  // ── Send Summary for Approval — a snapshot of each employee's final salary figures (Gross,
  // Tea, PF, ESIC, PT, TDS, Advance Adj., Net) goes straight to Salon Manager/ASM for a plain
  // Approve/Return decision, without handing them any access to this working sheet itself —
  // see isSummaryApproverRole for why that separation exists. Re-sending overwrites the
  // previous snapshot and resets its status to 'Sent', so an approval can never silently apply
  // to numbers that have since changed. ──
  const [summaryTick,setSummaryTick]=useState(0);
  const salarySummaryRec=useMemo(()=>summaryApprovalFor(salon?.id,'salary',selYear,selMonth),[salon?.id,selYear,selMonth,summaryTick]);
  const sendSalarySummary=()=>{
    const rows=workings.map(w=>({empId:w.id,name:w.name,desig:w.desig,gross:w.grossAfterLop,tea:w.tea,pf:w.pfEmp,esic:w.esicEmp,pt:w.ptAmt,tds:w.tdsAmt,advAdj:w.advAdj,penalty:w.penAmt,net:w.net}));
    const total=rows.reduce((s,r)=>s+r.net,0);
    sendSummaryForApproval(salon?.id,'salary',selYear,selMonth,rows,total,user?.name);
    setSummaryTick(t=>t+1);
    success('Salary Summary sent to Salon Manager/ASM for approval');
  };

  // ── Statutory Challans — built straight from the same pfEmp/pfEr/esicEmp/esicEr/ptAmt figures
  // already shown on Salary Working (including any per-employee overrides), so the challan can
  // never disagree with what the sheet itself displays. Rendered through the same printable-report
  // template used elsewhere in the app (reportPrintableHtml/exportReportPdf), so "Save as PDF"
  // from the browser's print dialog produces a proper document. These are a starting point for
  // filing, not a replacement for generating the actual return on the respective government
  // portal (EPFO/ESIC/state PT) — the note under each table says so explicitly.
  const buildEsicChallanHtml=()=>{
    const rows=workings.filter(e=>e.esic);
    if(!rows.length){swError('No employees are marked ESIC-applicable for '+MONTHS[selMonth]+' '+selYear+'.');return;}
    const totalEmp=rows.reduce((s,e)=>s+e.esicEmp,0);
    const totalEr=rows.reduce((s,e)=>s+e.esicEr,0);
    const bodyRows=rows.map((e,i)=>'<tr>'
      +'<td class="id">'+(i+1)+'</td>'
      +'<td>'+(e.esicNumber||'—')+'</td>'
      +'<td>'+e.name+'</td>'
      +'<td class="num">'+e.totalDays+'</td>'
      +'<td class="num">₹'+(e.gross||0).toLocaleString('en-IN')+'</td>'
      +'<td class="num">₹'+e.esicEmp.toLocaleString('en-IN')+'</td>'
      +'<td class="num">₹'+e.esicEr.toLocaleString('en-IN')+'</td>'
      +'<td class="num">₹'+(e.esicEmp+e.esicEr).toLocaleString('en-IN')+'</td>'
      +'</tr>').join('');
    const body='<h3>ESIC Contribution Challan</h3>'
      +'<p><b>Establishment:</b> '+(salon?.name||'—')+' &nbsp; <b>ESIC Code:</b> '+(salon?.esicCode||'—')+'</p>'
      +'<p><b>Wage Month:</b> '+MONTHS[selMonth]+' '+selYear+' &nbsp; <b>Contribution Rate:</b> Employee 0.75% + Employer 3.25% = 4.00% of Gross Wages (wage ceiling ₹21,000/month)</p>'
      +'<table><thead><tr><th class="id">S.No</th><th>IP Number</th><th>Employee Name</th><th class="num">Days</th><th class="num">Gross Wages</th><th class="num">Employee (0.75%)</th><th class="num">Employer (3.25%)</th><th class="num">Total</th></tr></thead>'
      +'<tbody>'+bodyRows
      +'<tr class="total-row"><td colspan="5">Total ('+rows.length+' employee'+(rows.length===1?'':'s')+')</td><td class="num">₹'+totalEmp.toLocaleString('en-IN')+'</td><td class="num">₹'+totalEr.toLocaleString('en-IN')+'</td><td class="num">₹'+(totalEmp+totalEr).toLocaleString('en-IN')+'</td></tr>'
      +'</tbody></table>'
      +'<p class="note">Figures reflect any per-employee overrides entered on Salary Working. Verify against the ESIC portal before remittance — contribution is due within 15 days of month-end (Section 39, ESI Act).</p>'
      +'<p style="margin-top:40px">Prepared by: ____________________ &nbsp;&nbsp;&nbsp; Authorised Signatory: ____________________</p>';
    exportReportPdf('ESIC Challan — '+MONTHS[selMonth]+' '+selYear,salon?.name,body,{});
  };
  const buildEpfChallanHtml=()=>{
    const rows=workings.filter(e=>e.pf);
    if(!rows.length){swError('No employees are marked PF-applicable for '+MONTHS[selMonth]+' '+selYear+'.');return;}
    // EPS/EDLI/Admin split derived from the same combined 12% Employer figure (pfEr) already on
    // Salary Working — 8.33% (capped ₹1,250) goes to EPS (A/C10), the rest stays EPF (A/C1
    // Employer). EDLI (A/C21) is 0.5% capped ₹75; Admin (A/C2) 0.5%, uncapped; EDLI Admin (A/C22)
    // has been NIL since the April 2017 amendment.
    const calcRows=rows.map(e=>{
      const wageBase=e.pfOnActualBasic?(Number(e.basic)||0):Math.min(Number(e.basic)||0,15000);
      const eps=Math.min(Math.round(wageBase*0.0833),1250);
      const epfEr=Math.max(0,e.pfEr-eps);
      const edli=Math.min(Math.round(wageBase*0.005),75);
      const admin=Math.round(wageBase*0.005);
      return{...e,wageBase,eps,epfEr,edli,admin};
    });
    const tot=(k)=>calcRows.reduce((s,e)=>s+e[k],0);
    const totEmp=tot('pfEmp'),totEps=tot('eps'),totEpfEr=tot('epfEr'),totEdli=tot('edli'),totAdmin=tot('admin');
    const grandTotal=totEmp+totEps+totEpfEr+totEdli+totAdmin;
    const bodyRows=calcRows.map((e,i)=>'<tr>'
      +'<td class="id">'+(i+1)+'</td>'
      +'<td>'+(e.pfNumber||'—')+'</td>'
      +'<td>'+e.name+'</td>'
      +'<td class="num">₹'+e.wageBase.toLocaleString('en-IN')+'</td>'
      +'<td class="num">₹'+e.pfEmp.toLocaleString('en-IN')+'</td>'
      +'<td class="num">₹'+e.epfEr.toLocaleString('en-IN')+'</td>'
      +'<td class="num">₹'+e.eps.toLocaleString('en-IN')+'</td>'
      +'<td class="num">₹'+e.edli.toLocaleString('en-IN')+'</td>'
      +'<td class="num">₹'+e.admin.toLocaleString('en-IN')+'</td>'
      +'</tr>').join('');
    const body='<h3>EPF Contribution Challan (ECR)</h3>'
      +'<p><b>Establishment:</b> '+(salon?.name||'—')+' &nbsp; <b>PF Establishment Code:</b> '+(salon?.pfCode||'—')+'</p>'
      +'<p><b>Wage Month:</b> '+MONTHS[selMonth]+' '+selYear+' &nbsp; <b>Wage Ceiling:</b> ₹15,000/month unless marked "PF on Actual Basic"</p>'
      +'<table><thead><tr><th class="id">S.No</th><th>UAN</th><th>Employee Name</th><th class="num">Wage Base</th><th class="num">Employee A/C1 (12%)</th><th class="num">Employer A/C1</th><th class="num">A/C10 EPS (8.33%)</th><th class="num">A/C21 EDLI (0.5%)</th><th class="num">A/C2 Admin (0.5%)</th></tr></thead>'
      +'<tbody>'+bodyRows
      +'<tr class="total-row"><td colspan="4">Total ('+rows.length+' employee'+(rows.length===1?'':'s')+')</td><td class="num">₹'+totEmp.toLocaleString('en-IN')+'</td><td class="num">₹'+totEpfEr.toLocaleString('en-IN')+'</td><td class="num">₹'+totEps.toLocaleString('en-IN')+'</td><td class="num">₹'+totEdli.toLocaleString('en-IN')+'</td><td class="num">₹'+totAdmin.toLocaleString('en-IN')+'</td></tr>'
      +'</tbody></table>'
      +'<p><b>Total Remittance (A/C1 + A/C2 + A/C10 + A/C21 + A/C22):</b> ₹'+grandTotal.toLocaleString('en-IN')+' &nbsp; (A/C22 EDLI Admin Charges: NIL, waived w.e.f. April 2017)</p>'
      +'<p class="note">EPS/EDLI/Admin split is calculated here for reference from the combined Employer PF figure on Salary Working — please generate and verify the actual ECR on the EPFO Unified Portal before remittance. Due within 15 days of month-end.</p>'
      +'<p style="margin-top:40px">Prepared by: ____________________ &nbsp;&nbsp;&nbsp; Authorised Signatory: ____________________</p>';
    exportReportPdf('EPF Challan — '+MONTHS[selMonth]+' '+selYear,salon?.name,body,{landscape:true});
  };
  const buildPtChallanHtml=()=>{
    const rows=workings.filter(e=>e.ptAmt>0);
    if(!rows.length){swError('No Professional Tax deducted for '+MONTHS[selMonth]+' '+selYear+'.');return;}
    const total=rows.reduce((s,e)=>s+e.ptAmt,0);
    const salonRec=getSalonRecordById(salon?.id);
    const bodyRows=rows.map((e,i)=>'<tr>'
      +'<td class="id">'+(i+1)+'</td>'
      +'<td>'+e.name+'</td>'
      +'<td>'+(e.desig||'—')+'</td>'
      +'<td class="num">₹'+(e.gross||0).toLocaleString('en-IN')+'</td>'
      +'<td class="num">₹'+e.ptAmt.toLocaleString('en-IN')+'</td>'
      +'</tr>').join('');
    const body='<h3>Professional Tax Challan</h3>'
      +'<p><b>Establishment:</b> '+(salon?.name||'—')+' &nbsp; <b>PT Registration No.:</b> '+(salon?.ptRegNo||'—')+' &nbsp; <b>State:</b> '+(salonRec?.state||'—')+'</p>'
      +'<p><b>Wage Month:</b> '+MONTHS[selMonth]+' '+selYear+'</p>'
      +'<table><thead><tr><th class="id">S.No</th><th>Employee Name</th><th>Designation</th><th class="num">Gross Salary</th><th class="num">PT Deducted</th></tr></thead>'
      +'<tbody>'+bodyRows
      +'<tr class="total-row"><td colspan="4">Total ('+rows.length+' employee'+(rows.length===1?'':'s')+')</td><td class="num">₹'+total.toLocaleString('en-IN')+'</td></tr>'
      +'</tbody></table>'
      +'<p class="note">Computed from the applicable state\u2019s PT slabs on Salary Working, including any per-employee overrides. Verify against the state PT portal before remittance — due dates vary by state.</p>'
      +'<p style="margin-top:40px">Prepared by: ____________________ &nbsp;&nbsp;&nbsp; Authorised Signatory: ____________________</p>';
    exportReportPdf('Professional Tax Challan — '+MONTHS[selMonth]+' '+selYear,salon?.name,body,{});
  };
  const generateChallan=(kind)=>{
    if(kind==='esic')buildEsicChallanHtml();
    else if(kind==='epf')buildEpfChallanHtml();
    else if(kind==='pt')buildPtChallanHtml();
  };
  const generateChallanExcel=async(kind)=>{
    const rows=kind==='esic'?workings.filter(e=>e.esic):kind==='epf'?workings.filter(e=>e.pf):workings.filter(e=>e.ptAmt>0);
    if(!rows.length){
      swError('No '+(kind==='esic'?'ESIC-applicable':kind==='epf'?'PF-applicable':'PT-deducted')+' employees for '+MONTHS[selMonth]+' '+selYear+'.');
      return;
    }
    const title=(kind==='esic'?'ESIC Challan':kind==='epf'?'EPF Challan':'PT Challan')+' — '+MONTHS[selMonth]+' '+selYear;
    try{
      const blob=await buildStatutoryChallanExcelBlob({kind,title,rows,salon,MONTHS,selMonth,selYear});
      const filename=(kind==='esic'?'ESIC_Challan_':kind==='epf'?'EPF_Challan_':'PT_Challan_')+MONTHS[selMonth]+'_'+selYear+'.xlsx';
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
    }catch(err){swError('Could not build the Excel file — '+(err&&err.message?err.message:'try again'));}
  };

  // ── Selection — pick specific employees to export/share instead of always the whole list.
  // Empty selection = share everyone (unchanged default behaviour); any selection narrows every
  // export/share action below to just those rows. The table itself always shows everyone —
  // selection only affects what leaves the app via Export/Share. ──
  const [swSelectedIds,setSwSelectedIds]=useState(new Set());
  useEffect(()=>{setSwSelectedIds(new Set());},[selMonth,selYear,salon?.id]);
  const swToggleSelect=(id)=>setSwSelectedIds(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});
  // Searchable filter — by Employee name or Designation. Filters what's shown on screen and what
  // "Select All" targets; the CSV/Share exports below are untouched by this (they still default
  // to everyone unless a specific selection is active), since narrowing the view shouldn't
  // silently narrow what gets exported too.
  const [swSearch,setSwSearch]=useState('');
  const swVisibleWorkings=workings.filter(e=>!swSearch||e.name.toLowerCase().includes(swSearch.toLowerCase())||(e.desig||'').toLowerCase().includes(swSearch.toLowerCase()));
  const swAllSelected=swVisibleWorkings.length>0&&swVisibleWorkings.every(e=>swSelectedIds.has(e.id));
  const swToggleSelectAll=()=>setSwSelectedIds(swAllSelected?new Set():new Set(swVisibleWorkings.map(e=>e.id)));
  const exportWorkings=swSelectedIds.size>0?workings.filter(e=>swSelectedIds.has(e.id)):workings;

  const exportExcel=async()=>{
    const hdr=swColDefs.map(c=>c.header);
    const rows=exportWorkings.map(e=>{
      const m=metaFor(e.id);
      return swColDefs.map(c=>c.get(e,m));
    });
    const totalLine=swColDefs.map((c,i)=>swTotalRow[i]);
    const filename='SalaryWorking_'+MONTHS[selMonth]+'_'+selYear+(swSelectedIds.size>0?'_selected':'')+'.xlsx';
    try{
      const blob=await exportReportExcelBlob('Salary Working',[hdr,...rows,totalLine]);
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
    }catch(err){swError(err.message);}
  };

  const th=(txt,w,bg)=>React.createElement('th',{style:{padding:'8px 8px',background:bg||'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em',whiteSpace:'nowrap',borderBottom:'2px solid var(--accent)',minWidth:w||80,textAlign:'right'}},txt);
  const td=(val,color,bold,bg)=>React.createElement('td',{style:{padding:'8px 8px',fontSize:12,textAlign:'right',color:color||'var(--text2)',fontWeight:bold?600:400,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',background:bg||undefined}},val);
  const fmt=(n)=>n?rupee(Number(n)):'—';
  // ── Column-group color coding — Earnings/Incentive columns tinted green, Deductions tinted
  // red, Net Salary tinted blue, Advance columns tinted amber, Bank Details tinted purple —
  // applied to both the header and every body cell in that group, so the sheet's sections are
  // recognizable at a glance instead of purely by column heading text.
  const SW_BG_EARN='rgba(76,175,125,0.10)';
  const SW_BG_DED='rgba(255,107,107,0.08)';
  const SW_BG_NET='rgba(74,158,255,0.12)';
  const SW_BG_ADV='rgba(255,159,67,0.09)';
  const SW_BG_BANK='rgba(139,127,232,0.09)';

  // ── Share — PDF, Word, and Excel (live formulas — see buildSalaryWorkingExcelBlob) via the
  // same reusable Share modal used across the app. All three now mirror the same full column
  // set (respecting every column-applicability toggle, same as the CSV export below), ending at
  // Closing Advance, or continuing through Bank Name/Account No/IFSC Code when Bank Details is
  // switched on. ──
  const swReportTitle='Salary Working — '+MONTHS[selMonth]+' '+selYear+(salon?' — '+salon.name.split('—')[0].trim():'')+(swSelectedIds.size>0?' (selected)':'');
  const swColDefs=[
    {id:'name',header:'Employee',get:e=>e.name,isText:true},
    {id:'desig',header:'Designation',get:e=>e.desig,isText:true},
    {id:'salary',header:'Salary',get:e=>e.gross},
    {id:'totalDays',header:'Total Days',get:e=>fmtDays(e.totalDays),isText:true},
    {id:'gross',header:'Gross Salary',get:e=>e.grossAfterLop},
    cols.serviceInc&&{id:'svcIncAmt',header:'Service Incentive',get:e=>e.svcIncAmt},
    cols.memInc&&{id:'memInc',header:'Mem Inc',get:e=>e.memIncAmt},
    cols.prodInc&&{id:'prodInc',header:'Prod Inc',get:e=>e.prodIncAmt},
    cols.mgrInc&&{id:'mgrInc',header:'MGR Inc',get:e=>e.mgrIncAmt},
    cols.nonPerfPenalty&&{id:'nonPerfPenalty',header:'Non-Performance Penalty',get:e=>e.nonPerfPenalty},
    cols.totalInc&&{id:'totalIncSW',header:'Total Inc',get:e=>e.totalIncSW},
    cols.tea&&{id:'tea',header:'Tea',get:e=>e.tea},
    cols.pfEmp&&{id:'pfEmp',header:'PF (Emp)',get:e=>e.pfEmp},
    cols.esic&&{id:'esic',header:'ESIC (Emp)',get:e=>e.esicEmp},
    cols.pt&&{id:'pt',header:'Professional Tax',get:e=>e.ptAmt},
    cols.tds&&{id:'tds',header:'TDS',get:e=>e.tdsAmt},
    cols.advAdj&&{id:'advAdj',header:'Advance Adj.',get:e=>e.advAdj},
    cols.penalties&&{id:'penalty',header:'Penalty',get:e=>e.penAmt},
    {id:'net',header:'Net Salary',get:e=>e.net},
    cols.prevMonthAdv&&{id:'opAdv',header:'Op. Advance',get:e=>e.prevAdv},
    cols.currMonthAdv&&{id:'currAdv',header:'Curr Month Adv ('+MONTHS[selMonth]+')',get:e=>e.currAdv},
    cols.nextMonthAdv&&{id:'nextAdv',header:'Next Month Adv',get:e=>e.nextAdv},
    {id:'closingAdv',header:'Closing Advance',get:e=>e.closingAdvance},
    cols.bankDetails&&{id:'bankName',header:'Bank Name',get:e=>e.bankName||'',isText:true},
    cols.bankDetails&&{id:'accountNo',header:'Account No.',get:e=>e.accountNo||'',isText:true},
    cols.bankDetails&&{id:'ifsc',header:'IFSC Code',get:e=>e.ifsc||'',isText:true},
    {id:'status',header:'Status',get:(e,m)=>m.status,isText:true},
    {id:'paymentStatus',header:'Payment Status',get:(e,m)=>m.paymentStatus,isText:true},
    {id:'mode',header:'Mode',get:(e,m)=>m.mode||'—',isText:true}
  ].filter(Boolean);
  // Total row — sums every numeric column over exactly whichever employees are being exported
  // right now (exportWorkings: the selection if one's active, otherwise everyone). Shared by the
  // CSV export, the PDF share, and the Word share below, so all three always agree with the
  // on-screen Total row and with each other.
  const swTotalLabel='Total'+(swSelectedIds.size>0?' (selected)':'');
  const swTotalRow=swColDefs.map((c,i)=>{
    if(c.isText)return i===0?swTotalLabel:'';
    return exportWorkings.reduce((s,e)=>s+(Number(c.get(e,{}))||0),0);
  });
  const swReportBodyHtml=()=>'<table><thead><tr>'+swColDefs.map(c=>'<th'+(c.isText?'':' class="num"')+'>'+c.header+'</th>').join('')+'</tr></thead><tbody>'
    +exportWorkings.map(e=>{const m=metaFor(e.id);return '<tr>'+swColDefs.map(c=>{
      const raw=c.get(e,m);
      const val=c.isText?raw:fmt(raw);
      return '<td'+(c.isText?'':' class="num"')+'>'+val+'</td>';
    }).join('')+'</tr>';}).join('')
    +'<tr style="font-weight:700;background:#f4f4f4">'+swColDefs.map((c,i)=>{
      const val=c.isText?swTotalRow[i]:fmt(swTotalRow[i]);
      return '<td'+(c.isText?'':' class="num"')+'>'+val+'</td>';
    }).join('')+'</tr>'
    +'</tbody></table>';
  const swReportSheetRows=()=>[swColDefs.map(c=>c.header),
    ...exportWorkings.map(e=>{const m=metaFor(e.id);return swColDefs.map(c=>c.get(e,m));}),
    swTotalRow];
  const swBuildExcelBlob=()=>buildSalaryWorkingExcelBlob({title:swReportTitle,workings:exportWorkings,cols,metaFor,MONTHS,selMonth});

  // ── Generate Salary — a deliberate, explicit action to jump straight to a chosen month's
  // Salary Working, rather than only the plain month/year dropdowns already in the header above.
  // The underlying figures are always live-computed from swWorkingsFor() the moment a month is
  // selected (there's no separate batch/background "calculation" step to run), so this doesn't
  // compute anything the dropdowns wouldn't already — it's the explicit, one-click "generate this
  // month's salary" action. Before actually switching the sheet to that month, it first checks
  // every active employee's Attendance for that month and shows anyone with unmarked days — Gross
  // Salary is prorated as Salary ÷ Days in Month × Total Days Payable, so a day nobody marked
  // present/absent/off/etc. silently understates that employee's Total Days (and so their pay)
  // without this check ever calling it out.
  const [showGenerate,setShowGenerate]=useState(false);
  const [genStep,setGenStep]=useState('pick'); // 'pick' | 'review'
  const [genMonth,setGenMonth]=useState(selMonth);
  const [genYear,setGenYear]=useState(selYear);
  const [genIncomplete,setGenIncomplete]=useState([]);
  const openGenerate=()=>{setGenMonth(selMonth);setGenYear(selYear);setGenStep('pick');setShowGenerate(true);};
  const checkAttendanceThenReview=()=>{
    const emps=getEmployeesForMonth(genYear,genMonth,salon?.id).filter(e=>e.status==='Active');
    const attStore=loadAttendance(salon?.id);
    const incomplete=emps.map(e=>{
      const rec=attStore[attMonthKey(e.id,genYear,genMonth)];
      const s=attSummaryFor(e,genYear,genMonth,rec);
      return{id:e.id,name:e.name,desig:e.desig,notMarked:s.notMarked};
    }).filter(x=>x.notMarked>0).sort((a,b)=>b.notMarked-a.notMarked);
    setGenIncomplete(incomplete);
    setGenStep('review');
  };
  const runGenerate=()=>{
    setSelMonth(genMonth);setSelYear(genYear);setShowGenerate(false);
    const n=getEmployeesForMonth(genYear,genMonth,salon?.id).length;
    success('Salary generated for '+MONTHS[genMonth]+' '+genYear+' — '+n+' employee'+(n===1?'':'s'));
  };

  const ColToggle=({k,label})=>React.createElement('label',{style:{display:'flex',alignItems:'center',gap:6,fontSize:11,color:cols[k]?'var(--text)':'var(--text3)',cursor:'pointer',padding:'4px 8px',background:cols[k]?'rgba(47,95,224,0.1)':'var(--bg3)',borderRadius:'var(--r)',border:'1px solid '+(cols[k]?'rgba(47,95,224,0.3)':'var(--border)')}},
    React.createElement('input',{type:'checkbox',checked:cols[k],onChange:()=>toggleCol(k)}),label
  );

  if(!salaryAttendanceReady(salon?.id,selYear,selMonth))return React.createElement(AttendanceNotFinalNotice,{monthLabel:MONTHS[selMonth]+' '+selYear,title:'Salary Working Sheet',onNavTab});
  return React.createElement('div',{className:'fade-in',style:{position:'relative'}},
    React.createElement(WatermarkOverlay,{text:monthLocked?'FINAL':'DRAFT',final:monthLocked}),
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Salary Working Sheet'),
        React.createElement('div',{className:'page-sub'},MONTHS[selMonth]+' '+selYear+' — computed salary register · Total Days linked to Attendance Summary')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}},
        React.createElement('input',{className:'form-control',style:{width:220},placeholder:'🔍 Search employee…',value:swSearch,onChange:e=>setSwSearch(e.target.value)}),
        swSearch&&React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},swVisibleWorkings.length+' of '+workings.length+' match'),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selMonth,onChange:e=>setSelMonth(Number(e.target.value))},MONTHS.map((m,i)=>React.createElement('option',{key:m,value:i},m))),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selYear,onChange:e=>setSelYear(Number(e.target.value))},appYears().map(y=>React.createElement('option',{key:y},y))),
        React.createElement('button',{className:'btn btn-primary btn-sm',onClick:openGenerate},'🧮 Generate Salary'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:exportExcel},swSelectedIds.size>0?'⬇ Export Selected ('+swSelectedIds.size+')':'⬇ Export Excel'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',title:'One branded payslip page per employee (the ticked ones, or everyone)',onClick:async()=>{
          try{
            const list=exportWorkings.filter(w=>(Number(w.grossAfterLop)||0)>0||(Number(w.net)||0)>0);
            if(!list.length){alert('No salary for this month yet — mark attendance first.');return;}
            const blob=await buildPayslipsPdf(salon,selYear,selMonth,list,monthLocked?'':'DRAFT');
            const a=document.createElement('a');a.href=URL.createObjectURL(blob);
            a.download='Payslips_'+String((salon&&salon.name)||'Outlet').replace(/[^\w]+/g,'_')+'_'+MONTHS[selMonth]+'_'+selYear+'.pdf';
            document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(a.href),5000);
          }catch(e){alert('Could not create payslips: '+(e.message||e));}
        }},swSelectedIds.size>0?'📄 Payslips ('+swSelectedIds.size+')':'📄 Payslips (PDF)'),
        CLOUD_SYNC_ENABLED&&React.createElement(WhatsAppSalaryNotifyButton,{salon,year:selYear,month:selMonth,workings:exportWorkings}),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:'',title:'Generates a printable Challan from this month\'s Salary Working figures — opens in a new tab, ready to print or Save as PDF',onChange:e=>{if(e.target.value)generateChallan(e.target.value);e.target.value='';}},
          React.createElement('option',{value:''},'🧾 Generate Challan…'),
          React.createElement('option',{value:'esic'},'ESIC Challan'),
          React.createElement('option',{value:'epf'},'EPF Challan'),
          React.createElement('option',{value:'pt'},'PT Challan')
        ),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:'',title:'Downloads the same Challan as a formatted Excel workbook — colour-coded, with live SUM formulas in the total row (and the EPF sheet\'s EPS/EDLI/Admin split too)',onChange:e=>{if(e.target.value)generateChallanExcel(e.target.value);e.target.value='';}},
          React.createElement('option',{value:''},'⬇ Challan (Excel)…'),
          React.createElement('option',{value:'esic'},'ESIC Challan'),
          React.createElement('option',{value:'epf'},'EPF Challan'),
          React.createElement('option',{value:'pt'},'PT Challan')
        ),
        ptApplies&&React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--orange)',borderColor:'rgba(255,159,67,0.4)'},onClick:()=>setShowPtSlabs(true)},'🧾 PT Slabs ('+ptState+')'),
        React.createElement(ShareReportButton,{title:swReportTitle,subtitle:'Salary Working',getBodyHtml:swReportBodyHtml,getSheetRows:swReportSheetRows,buildExcelBlob:swBuildExcelBlob,landscape:true,watermark:monthLocked?'FINAL':'DRAFT'}),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:doRefresh},'⟳ Refresh'),
        !monthLocked&&React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:lockSalaryWorking},'🔒 Lock Salary Working'),
        !monthLocked&&React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:lockEntireMonth},'🔒 Lock Entire Month'),
        !monthLocked&&React.createElement('button',{className:'btn btn-success btn-sm',onClick:approveAll},'✓ Approve All'),
        // ── Send Summary for Approval — see comment above sendSalarySummary. Deliberately kept
        // separate from the Approve/Lock controls to its left: those govern this working sheet's
        // own row-level status, this sends a read-only snapshot to Salon Manager/ASM instead. ──
        React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(47,95,224,0.12)',border:'1px solid rgba(47,95,224,0.35)',color:'var(--accent)',padding:'6px 12px',borderRadius:'var(--r)',cursor:'pointer',fontWeight:600},
          title:'Sends a read-only summary of each employee\'s final salary figures to Salon Manager/ASM for their own Approve/Return — without giving them any access to this working sheet.',
          onClick:sendSalarySummary},'📤 Send Summary for Approval'),
        salarySummaryRec&&React.createElement('span',{className:'badge '+(salarySummaryRec.status==='Approved'?'badge-green':salarySummaryRec.status==='Returned'?'badge-red':'badge-amber'),
          title:salarySummaryRec.status==='Approved'?'Approved by '+salarySummaryRec.approvedBy+' on '+fmtDMY(salarySummaryRec.approvedAt.slice(0,10)):salarySummaryRec.status==='Returned'?'Returned'+(salarySummaryRec.remarks?': '+salarySummaryRec.remarks:''):'Sent '+fmtDMY(salarySummaryRec.sentAt.slice(0,10))+' by '+salarySummaryRec.sentBy+' — awaiting review'},
          salarySummaryRec.status==='Approved'?'✓ Summary Approved':salarySummaryRec.status==='Returned'?'↩ Summary Returned':'⏳ Summary Sent')
      )
    ),

    showGenerate&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowGenerate(false)},
      React.createElement('div',{className:'modal',style:{width:440},onClick:e=>e.stopPropagation()},
        genStep==='pick'&&React.createElement(React.Fragment,null,
          React.createElement('div',{className:'modal-title'},'🧮 Generate Salary'),
          React.createElement('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:14,lineHeight:1.5}},'Pick the month to compute Salary Working for — figures are calculated live from Attendance and Incentive Working, same as this sheet always does.'),
          React.createElement('div',{className:'form-row cols2',style:{marginBottom:16}},
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Month'),
              React.createElement('select',{className:'form-control',value:genMonth,onChange:e=>setGenMonth(Number(e.target.value))},MONTHS.map((m,i)=>React.createElement('option',{key:m,value:i},m)))),
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Year'),
              React.createElement('select',{className:'form-control',value:genYear,onChange:e=>setGenYear(Number(e.target.value))},appYears().map(y=>React.createElement('option',{key:y},y))))
          ),
          React.createElement('div',{className:'modal-actions'},
            React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowGenerate(false)},'Cancel'),
            React.createElement('button',{className:'btn btn-primary',onClick:checkAttendanceThenReview},'Continue →')
          )
        ),
        genStep==='review'&&React.createElement(React.Fragment,null,
          React.createElement('div',{className:'modal-title'},'🧮 Generate Salary — '+MONTHS[genMonth]+' '+genYear),
          genIncomplete.length===0
            ?React.createElement('div',{style:{fontSize:12.5,color:'var(--green)',background:'rgba(76,175,125,0.1)',border:'1px solid rgba(76,175,125,0.3)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:16,lineHeight:1.5}},'✓ Attendance is fully marked for every active employee this month. Safe to generate.')
            :React.createElement(React.Fragment,null,
                React.createElement('div',{style:{fontSize:12.5,color:'var(--orange)',background:'rgba(255,159,67,0.1)',border:'1px solid rgba(255,159,67,0.3)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:12,lineHeight:1.5}},
                  '⚠ '+genIncomplete.length+' employee'+(genIncomplete.length===1?'':'s')+' '+(genIncomplete.length===1?'has':'have')+' unmarked attendance days this month. Gross Salary is prorated by Total Days Payable, so their pay will be understated until these days are marked.'),
                React.createElement('div',{style:{maxHeight:220,overflowY:'auto',border:'1px solid var(--border)',borderRadius:'var(--r)',marginBottom:16}},
                  React.createElement('table',null,
                    React.createElement('thead',null,React.createElement('tr',null,
                      React.createElement('th',{style:{position:'sticky',top:0}},'Employee'),
                      React.createElement('th',{style:{position:'sticky',top:0}},'Designation'),
                      React.createElement('th',{style:{position:'sticky',top:0,textAlign:'right'}},'Days Not Marked')
                    )),
                    React.createElement('tbody',null,genIncomplete.map(e=>React.createElement('tr',{key:e.id},
                      React.createElement('td',null,e.name),
                      React.createElement('td',null,e.desig),
                      React.createElement('td',{style:{textAlign:'right',color:'var(--orange)',fontWeight:600}},e.notMarked)
                    )))
                  )
                )
              ),
          React.createElement('div',{className:'modal-actions',style:{flexWrap:'wrap'}},
            React.createElement('button',{className:'btn btn-ghost',onClick:()=>setGenStep('pick')},'← Back'),
            genIncomplete.length>0&&onNavTab&&React.createElement('button',{className:'btn btn-ghost',onClick:()=>{setShowGenerate(false);onNavTab('attendance');}},'Go to Attendance'),
            React.createElement('button',{className:genIncomplete.length===0?'btn btn-primary':'btn btn-ghost',style:genIncomplete.length>0?{color:'var(--orange)',borderColor:'rgba(255,159,67,0.4)'}:undefined,onClick:runGenerate},genIncomplete.length===0?'Generate':'Generate Anyway')
          )
        )
      )
    ),

    // Month-lock banner — shown whenever this outlet+month is locked, whichever way it got
    // locked (manually here, manually from Master Sheet, or automatically once every employee
    // was Approved).
    monthLocked&&React.createElement('div',{className:'success-card success-card-sm',style:{display:'flex',alignItems:'center',gap:10,color:'var(--text)',marginBottom:14}},
      React.createElement('span',{style:{fontSize:16}},'🔒'),
      React.createElement('span',null,MONTHS[selMonth]+' '+selYear+' is locked'+(
        monthLockRec.source==='manual'
          ?' — locked from Master Sheet. Attendance, Salary Working and Incentive Working are all read-only for this month.'
          :monthLockRec.source==='manual-sw'
            ?' — locked manually for Salary Working. Attendance and Salary Working are read-only this month; Incentive Working is unaffected and can still be approved separately.'
            :' — every employee was marked Approved on Salary Working. Attendance and Salary Working are read-only this month; Incentive Working is unaffected and can still be approved separately.'
      )),
      React.createElement('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:'auto',whiteSpace:'nowrap'},onClick:unlockMonth},'🔓 Unlock month')
    ),

    // Column toggles
    React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14}},
      React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}},'Column Applicability — toggle on/off'),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement(ColToggle,{k:'serviceInc',label:'Service Incentive'}),
        React.createElement(ColToggle,{k:'memInc',label:'Mem Inc'}),
        React.createElement(ColToggle,{k:'prodInc',label:'Prod Inc'}),
        React.createElement(ColToggle,{k:'mgrInc',label:'MGR Inc'}),
        React.createElement(ColToggle,{k:'nonPerfPenalty',label:'Non-Performance Penalty'}),
        React.createElement(ColToggle,{k:'totalInc',label:'Total Inc'}),
        React.createElement(ColToggle,{k:'tea',label:'Tea Allowance'}),
        React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Configure Tea Allowance',style:{padding:'4px 8px'},onClick:openTeaConfigModal},
          '⚙ Tea: '+(teaConfig.mode==='perDay'?'₹'+teaConfig.rate+'/day':'₹'+teaConfig.rate+' fixed')
        ),
        React.createElement(ColToggle,{k:'advAdj',label:'Advance Adjustment'}),
        React.createElement(ColToggle,{k:'penalties',label:'Penalties'}),
        React.createElement(ColToggle,{k:'prevMonthAdv',label:'Op. Advance'}),
        React.createElement(ColToggle,{k:'currMonthAdv',label:'Curr Month Advance ('+MONTHS[selMonth]+')'}),
        React.createElement(ColToggle,{k:'nextMonthAdv',label:'Next Month Advance'}),
        React.createElement(ColToggle,{k:'pfEmp',label:'PF (Emp)'}),
        React.createElement(ColToggle,{k:'esic',label:'ESIC (Emp)'}),
        React.createElement(ColToggle,{k:'pt',label:'Professional Tax'}),
        React.createElement(ColToggle,{k:'tds',label:'TDS'}),
        React.createElement(ColToggle,{k:'bankDetails',label:'Bank Name, Account No, IFSC'})
      )
    ),

    swSelectedIds.size>0&&React.createElement('div',{style:{fontSize:11.5,color:'var(--accent2)',background:'rgba(47,95,224,0.1)',border:'1px solid rgba(47,95,224,0.3)',borderRadius:'var(--r)',padding:'6px 12px',marginBottom:14}},
      swSelectedIds.size+' of '+workings.length+' employees selected — tick the box in each row to choose who Export CSV and Share (above) include — ',
      React.createElement('span',{style:{color:'var(--accent2)',cursor:'pointer',textDecoration:'underline'},onClick:()=>setSwSelectedIds(new Set())},'clear selection')
    ),

    // Professional Tax Slabs — editable, defaults to the outlet's state's own commonly-cited
    // figures. Auto-applied per swWorkingsFor; edit here if your state's current notification
    // differs from the shipped defaults.
    showPtSlabs&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowPtSlabs(false)},
      React.createElement('div',{className:'modal',style:{width:560,maxHeight:'80vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
        React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}},
          React.createElement('div',{className:'modal-title',style:{marginBottom:0,paddingBottom:0,border:'none',color:'var(--orange)'}},'🧾 Professional Tax Slabs — '+ptState),
          React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setShowPtSlabs(false)},'✕ Close')
        ),
        React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:14,paddingBottom:12,borderBottom:'1px solid var(--border)'}},
          ptState+' levies Professional Tax, so it\'s auto-applied to every employee here and deducted from Net Salary. These slabs are default figures — please verify against the current '+ptState+' PT Act/notification and edit below if they\'ve since changed.'
        ),
        React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:6,marginBottom:14}},
          ptSlabs.map((t,idx)=>React.createElement('div',{key:idx,style:{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',background:'var(--bg3)',borderRadius:'var(--r)',border:'1px solid var(--border)',flexWrap:'wrap'}},
            React.createElement('span',{style:{fontSize:12,color:'var(--text2)'}},'Gross Salary up to'),
            t.upto==null
              ?React.createElement('span',{style:{fontSize:12,fontWeight:600,color:'var(--text)',minWidth:70}},'above')
              :React.createElement('input',{type:'number',className:'form-control',style:{width:80,fontSize:12,textAlign:'right'},value:t.upto,onChange:e=>setPtSlabField(idx,'upto',e.target.value)}),
            React.createElement('span',{style:{fontSize:12,color:'var(--text3)',marginLeft:'auto'}},'PT'),
            React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'₹'),
            React.createElement('input',{type:'number',step:'0.01',className:'form-control',style:{width:70,fontSize:12,textAlign:'right'},value:t.amount,onChange:e=>setPtSlabField(idx,'amount',e.target.value)}),
            React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'/month'),
            ptSlabs.length>1&&React.createElement('span',{title:'Remove tier',onClick:()=>removePtSlab(idx),style:{cursor:'pointer',fontSize:11,color:'var(--text3)'}},'✕')
          ))
        ),
        React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
          React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:addPtSlab},'+ Add Tier'),
          React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:resetPtSlabs},'↺ Reset to Default')
        )
      )
    ),

    // Summary metrics
    React.createElement('div',{className:'grid4',style:{marginBottom:14}},
      [{label:'Total Employees',val:workings.length,color:'blue'},
       {label:'Total Gross',val:'₹'+workings.reduce((s,e)=>s+e.grossAfterLop,0).toLocaleString('en-IN'),color:'amber'},
       {label:'Total Deductions',val:'₹'+workings.reduce((s,e)=>s+(cols.pfEmp?e.pfEmp:0)+(cols.esic?e.esicEmp:0)+(cols.pt?e.ptAmt:0)+(cols.penalties?e.penAmt:0)+(cols.advAdj?e.advAdj:0),0).toLocaleString('en-IN'),color:'red'},
       {label:'Total Net Payable',val:'₹'+workings.reduce((s,e)=>s+e.net,0).toLocaleString('en-IN'),color:'green'}
      ].map(m=>React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},
        React.createElement('div',{className:'metric-label'},m.label),
        React.createElement('div',{className:'metric-value'},m.val)
      ))
    ),

    workings.length===0&&React.createElement('div',{className:'card',style:{textAlign:'center',padding:'40px 20px',marginBottom:14}},
      React.createElement('div',{style:{fontSize:32,marginBottom:10}},'👥'),
      React.createElement('div',{style:{fontWeight:700,color:'var(--text)',marginBottom:6,fontSize:14}},'No employees to compute salary for'),
      React.createElement('div',{style:{fontSize:12.5,color:'var(--text3)'}},'Add employees in Master Salary first — Salary Working calculates automatically from there once they exist.')
    ),

    React.createElement('div',{className:'card',style:{padding:0}},
      React.createElement('div',{style:{overflowX:'auto'}},
        React.createElement('table',{style:{borderCollapse:'collapse',width:'100%'}},
          React.createElement('thead',null,React.createElement.apply(React,['tr',null].concat([
            React.createElement('th',{style:{padding:'8px 10px',background:'var(--th-bg)',position:'sticky',left:0,zIndex:3,width:36,borderRight:'1px solid var(--border2)',borderBottom:'2px solid var(--accent)'}},
              workings.length>0&&React.createElement('input',{type:'checkbox',checked:swAllSelected,onChange:swToggleSelectAll,title:'Select all'})
            ),
            React.createElement('th',{style:{padding:'8px 12px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',position:'sticky',left:36,zIndex:3,minWidth:160,borderRight:'1px solid var(--border2)',borderBottom:'2px solid var(--accent)',textAlign:'left'}},'Employee'),
            th('Desig.',100),th('Salary'),th('Total Days',80),th('Gross Salary'),
            cols.serviceInc&&th('Svc Incentive',90,SW_BG_EARN),
            cols.memInc&&th('Mem Inc',90,SW_BG_EARN),
            cols.prodInc&&th('Prod Inc',90,SW_BG_EARN),
            cols.mgrInc&&th('MGR Inc',90,SW_BG_EARN),
            cols.nonPerfPenalty&&th('Non-Perf. Penalty',110,SW_BG_EARN),
            cols.totalInc&&th('Total Inc',90,SW_BG_EARN),
            cols.tea&&th('Tea',60,SW_BG_EARN),
            cols.pfEmp&&th('PF Emp',70,SW_BG_DED),cols.esic&&th('ESIC',60,SW_BG_DED),cols.pt&&th('Prof. Tax',70,SW_BG_DED),cols.tds&&th('TDS',60,SW_BG_DED),
            cols.advAdj&&React.createElement('th',{style:{padding:'8px 12px',background:SW_BG_DED,color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',borderBottom:'2px solid var(--accent)',minWidth:80,textAlign:'right',whiteSpace:'nowrap'}},
              'Adv Adj.',
              onNavTab&&React.createElement('span',{title:'Open Advances sheet',style:{marginLeft:4,cursor:'pointer',color:'var(--blue)'},onClick:()=>onNavTab('advance')},'🔗')
            ),
            cols.penalties&&th('Penalty',70,SW_BG_DED),
            th('Net Salary',80,SW_BG_NET),
            cols.prevMonthAdv&&th('Op. Advance',85,SW_BG_ADV),
            cols.currMonthAdv&&th(MONTHS[selMonth].slice(0,3)+' Adv',80,SW_BG_ADV),
            cols.nextMonthAdv&&th(MONTHS[(selMonth+1)%12].slice(0,3)+' Adv',80,SW_BG_ADV),
            th('Closing Advance',100,SW_BG_ADV),
            cols.bankDetails&&th('Bank Name',130,SW_BG_BANK),
            cols.bankDetails&&th('Account No.',130,SW_BG_BANK),
            cols.bankDetails&&th('IFSC Code',100,SW_BG_BANK),
            React.createElement('th',{style:{padding:'8px 8px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',borderBottom:'2px solid var(--accent)',minWidth:110,textAlign:'center'}},'Status'),
            React.createElement('th',{style:{padding:'8px 8px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',borderBottom:'2px solid var(--accent)',minWidth:110,textAlign:'center'}},'Payment Status'),
            React.createElement('th',{style:{padding:'8px 8px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',borderBottom:'2px solid var(--accent)',minWidth:100,textAlign:'center'}},'Mode')
          ].filter(Boolean)))),
          React.createElement('tbody',null,swVisibleWorkings.map((e,swRowIdx)=>{
            const m=metaFor(e.id);
            const swLocked=m.status==='Approved'||monthLocked;
            const swRowBg=swRowIdx%2===1?'rgba(120,130,150,0.05)':undefined;
            return React.createElement.apply(React,['tr',{key:e.id,style:{background:swSelectedIds.has(e.id)?'rgba(47,95,224,0.06)':swRowBg}}].concat([
              React.createElement('td',{style:{padding:'9px 10px',position:'sticky',left:0,zIndex:2,background:swSelectedIds.has(e.id)?'rgba(47,95,224,0.1)':(swRowBg||'var(--bg2)'),borderRight:'1px solid var(--border2)',borderBottom:'1px solid var(--border)'}},
                React.createElement('input',{type:'checkbox',checked:swSelectedIds.has(e.id),onChange:()=>swToggleSelect(e.id)})
              ),
              React.createElement('td',{style:{padding:'9px 12px',position:'sticky',left:36,zIndex:2,background:swSelectedIds.has(e.id)?'rgba(47,95,224,0.1)':(swRowBg||'var(--bg2)'),borderRight:'1px solid var(--border2)',borderBottom:'1px solid var(--border)'}},
                React.createElement('div',{style:{fontWeight:500,color:'var(--text)',fontSize:12}},e.name),
                React.createElement('div',{style:{fontSize:10,color:'var(--text3)'}},e.id)
              ),
              td(e.desig,'var(--text2)'),
              td(fmt(e.gross)),td(fmtDays(e.totalDays)),
              td(fmt(e.grossAfterLop),'var(--text)',true),
              cols.serviceInc&&React.createElement('td',{style:{padding:'8px 8px',fontSize:12,textAlign:'right',fontWeight:400,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',background:SW_BG_EARN,cursor:'pointer'},
                title:'Click to see the incentive working behind this employee\'s figures',onClick:()=>setIncWorkingModal(e)},
                e.svcIncAmt>0?React.createElement('span',{style:{color:'var(--blue)'}},'+₹'+e.svcIncAmt.toLocaleString('en-IN')):React.createElement('span',{style:{color:'var(--text3)'}},'—')
              ),
              cols.memInc&&React.createElement('td',{style:{padding:'8px 8px',fontSize:12,textAlign:'right',fontWeight:400,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',background:SW_BG_EARN,cursor:'pointer'},
                title:'Click to see the incentive working behind this employee\'s figures',onClick:()=>setIncWorkingModal(e)},
                e.memIncAmt>0?React.createElement('span',{style:{color:'var(--purple)'}},'+₹'+e.memIncAmt.toLocaleString('en-IN')):React.createElement('span',{style:{color:'var(--text3)'}},'—')
              ),
              cols.prodInc&&React.createElement('td',{style:{padding:'8px 8px',fontSize:12,textAlign:'right',fontWeight:400,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',background:SW_BG_EARN,cursor:'pointer'},
                title:'Click to see the incentive working behind this employee\'s figures',onClick:()=>setIncWorkingModal(e)},
                e.prodIncAmt>0?React.createElement('span',{style:{color:'var(--teal)'}},'+₹'+e.prodIncAmt.toLocaleString('en-IN')):React.createElement('span',{style:{color:'var(--text3)'}},'—')
              ),
              cols.mgrInc&&React.createElement('td',{style:{padding:'8px 8px',fontSize:12,textAlign:'right',fontWeight:400,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',background:SW_BG_EARN,cursor:'pointer'},
                title:'Click to see the incentive working behind this employee\'s figures',onClick:()=>setIncWorkingModal(e)},
                e.mgrIncAmt>0?React.createElement('span',{style:{color:'var(--orange)'}},'+₹'+e.mgrIncAmt.toLocaleString('en-IN')):React.createElement('span',{style:{color:'var(--text3)'}},'—')
              ),
              cols.nonPerfPenalty&&React.createElement('td',{style:{padding:'8px 8px',fontSize:12,textAlign:'right',fontWeight:400,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',background:SW_BG_EARN,cursor:'pointer'},
                title:'Click to see the incentive working behind this employee\'s figures',onClick:()=>setIncWorkingModal(e)},
                e.nonPerfPenalty>0?React.createElement('span',{style:{color:'var(--red)'}},'−₹'+e.nonPerfPenalty.toLocaleString('en-IN')):React.createElement('span',{style:{color:'var(--text3)'}},'—')
              ),
              cols.totalInc&&React.createElement('td',{style:{padding:'8px 8px',fontSize:12,textAlign:'right',fontWeight:600,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',background:SW_BG_EARN,cursor:'pointer'},
                title:'Click to see the incentive working behind this employee\'s figures',onClick:()=>setIncWorkingModal(e)},
                e.totalIncSW>0?React.createElement('span',{style:{color:'var(--green)'}},rupee(e.totalIncSW)):React.createElement('span',{style:{color:'var(--text3)'}},'—')
              ),
              cols.tea&&td(e.tea>0?'+₹'+e.tea.toLocaleString('en-IN'):'—','var(--teal)',false,SW_BG_EARN),
              cols.pfEmp&&React.createElement('td',{style:{padding:'8px 8px',fontSize:12,textAlign:'right',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',background:SW_BG_DED,cursor:'pointer'},
                title:'Click to see the PF working, or override it for this employee this month',onClick:()=>openPfWorking(e)},
                React.createElement('span',{style:{color:'var(--orange)'}},e.pfEmp>0?'−₹'+e.pfEmp.toLocaleString('en-IN'):'—'),
                e.pfOverridden&&React.createElement('span',{title:'Manually overridden this month',style:{marginLeft:4,fontSize:9,color:'var(--blue)'}},'✎')
              ),
              cols.esic&&React.createElement('td',{style:{padding:'8px 8px',fontSize:12,textAlign:'right',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',background:SW_BG_DED,cursor:'pointer'},
                title:'Click to see the ESIC working, or override it for this employee this month',onClick:()=>openEsicWorking(e)},
                React.createElement('span',{style:{color:'var(--orange)'}},e.esicEmp>0?'−₹'+e.esicEmp.toLocaleString('en-IN'):'—'),
                e.esicOverridden&&React.createElement('span',{title:'Manually overridden this month',style:{marginLeft:4,fontSize:9,color:'var(--blue)'}},'✎')
              ),
              cols.pt&&React.createElement('td',{style:{padding:'8px 8px',fontSize:12,textAlign:'right',fontWeight:400,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',background:SW_BG_DED,cursor:'pointer'},
                title:'Click to see the PT working, or override it for this employee this month',onClick:()=>openPtWorking(e)},
                !ptApplies&&!e.ptOverridden
                  ?React.createElement('span',{style:{color:'var(--text3)'}},'N/A')
                  :(e.ptAmt>0?React.createElement('span',{style:{color:'var(--orange)'}},'−₹'+e.ptAmt.toLocaleString('en-IN')):React.createElement('span',{style:{color:'var(--text3)'}},'₹0')),
                e.ptOverridden&&React.createElement('span',{title:'Manually overridden this month',style:{marginLeft:4,fontSize:9,color:'var(--blue)'}},'✎')
              ),
              cols.tds&&React.createElement('td',{style:{padding:'8px 8px',fontSize:12,textAlign:'right',fontWeight:400,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',background:SW_BG_DED,cursor:'pointer'},
                title:'Click to enter TDS for this employee this month',onClick:()=>openTdsEntry(e)},
                e.tdsAmt>0?React.createElement('span',{style:{color:'var(--orange)'}},'−₹'+e.tdsAmt.toLocaleString('en-IN')):React.createElement('span',{style:{color:'var(--text3)'}},'—')
              ),
              cols.advAdj&&React.createElement('td',{style:{padding:'8px 8px',fontSize:12,textAlign:'right',fontWeight:400,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',cursor:e.advAdj>0&&onNavTab?'pointer':undefined,background:SW_BG_DED},
                title:e.advAdj>0&&onNavTab?"This month's scheduled installment — click to view/amend on the Advances sheet":undefined,
                onClick:e.advAdj>0&&onNavTab?()=>onNavTab('advance'):undefined},
                e.advAdj>0?React.createElement('span',{style:{color:'var(--red)'}},'−₹'+e.advAdj.toLocaleString('en-IN')):React.createElement('span',{style:{color:'var(--text3)'}},'—')
              ),
              cols.penalties&&td(e.penAmt>0?'−₹'+e.penAmt.toLocaleString('en-IN'):'—','var(--red)',false,SW_BG_DED),
              td(fmt(e.net),'var(--green)',true,SW_BG_NET),
              cols.prevMonthAdv&&td(e.prevAdv>0?rupee(e.prevAdv):'—',undefined,false,SW_BG_ADV),
              cols.currMonthAdv&&td(e.currAdv>0?rupee(e.currAdv):'—',undefined,false,SW_BG_ADV),
              cols.nextMonthAdv&&React.createElement('td',{style:{padding:'8px 8px',fontSize:12,textAlign:'right',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',background:SW_BG_ADV}},
                React.createElement('div',null,e.nextAdv>0?rupee(e.nextAdv):'—'),
                e.nextAdv>0&&React.createElement('label',{title:m.nextAdvPull?'Adjusted up to '+fmtDMY(m.nextAdvPullDate)+' as part of this month\'s salary':'Pull this Next Month Advance into this month\'s deduction instead of waiting for its own month',
                  style:{display:'flex',alignItems:'center',gap:4,justifyContent:'flex-end',fontSize:9.5,color:'var(--text3)',marginTop:2,cursor:swLocked?'not-allowed':'pointer'}},
                  React.createElement('input',{type:'checkbox',checked:!!m.nextAdvPull,disabled:swLocked,
                    onChange:ev=>ev.target.checked?openNextAdvPullModal(e.id):uncheckNextAdvPull(e.id),
                    style:{width:11,height:11}}),
                  'Adjust now'
                )
              ),
              td(e.closingAdvance>0?rupee(e.closingAdvance):'—',e.closingAdvance>0?'var(--red)':'var(--text3)',true,SW_BG_ADV),
              cols.bankDetails&&td(e.bankName||'—','var(--text2)',false,SW_BG_BANK),
              cols.bankDetails&&td(e.accountNo||'—','var(--text2)',false,SW_BG_BANK),
              cols.bankDetails&&td(e.ifsc||'—','var(--text2)',false,SW_BG_BANK),
              React.createElement('td',{style:{padding:'6px 8px',textAlign:'center',borderBottom:'1px solid var(--border)'}},
                swLocked
                  ?React.createElement('span',{style:{display:'inline-flex',alignItems:'center',gap:5}},
                      React.createElement('span',{className:'badge badge-green',style:{fontSize:10.5,fontWeight:600,padding:'3px 6px'}},'🔒 Approved'),
                      !monthLocked&&React.createElement('span',{title:'Unlock — reverts this row to Draft so it can be edited again',style:{cursor:'pointer',fontSize:11,color:'var(--text3)'},
                        onClick:()=>{if(window.confirm('Unlock '+e.name+' — '+MONTHS[selMonth]+' '+selYear+' Salary Working row for editing? It will revert to Draft.'))setMetaField(e.id,'status','Draft');}},'🔓')
                    )
                  :React.createElement('select',{value:m.status,onChange:ev=>setMetaField(e.id,'status',ev.target.value),
                      className:'badge '+(m.status==='Approved'?'badge-green':'badge-amber'),
                      style:{border:'none',fontSize:10.5,fontWeight:600,cursor:'pointer',padding:'3px 6px'}},
                      ['Draft','Approved'].map(s=>React.createElement('option',{key:s,value:s},s)))
              ),
              React.createElement('td',{style:{padding:'6px 8px',textAlign:'center',borderBottom:'1px solid var(--border)'}},
                React.createElement('select',{value:m.paymentStatus,disabled:monthLocked,onChange:ev=>setMetaField(e.id,'paymentStatus',ev.target.value),
                  className:'badge '+(m.paymentStatus==='Paid'?'badge-green':'badge-gray'),
                  style:{border:'none',fontSize:10.5,fontWeight:600,cursor:monthLocked?'not-allowed':'pointer',padding:'3px 6px',opacity:monthLocked?0.6:1}},
                  ['Not Paid','Paid'].map(s=>React.createElement('option',{key:s,value:s},s)))
              ),
              React.createElement('td',{style:{padding:'6px 8px',textAlign:'center',borderBottom:'1px solid var(--border)'}},
                m.paymentStatus==='Paid'
                  ?React.createElement('select',{value:m.mode||'',disabled:monthLocked,'data-placeholder':!m.mode,onChange:ev=>setMetaField(e.id,'mode',ev.target.value),
                      style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:4,fontSize:10.5,color:m.mode?'var(--text)':'var(--text3)',cursor:'pointer',padding:'3px 6px'}},
                      [React.createElement('option',{key:'',value:''},'— Select —'),React.createElement('option',{key:'Cash',value:'Cash'},'Cash'),React.createElement('option',{key:'Bank',value:'Bank'},'Bank')])
                  :React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},'—')
              )
            ].filter(Boolean)));
          }),
          // Total row — same columns as every employee row above, column-summed across everyone
          // currently shown. Non-summable columns (Total Days, Bank Details, Status/Payment/Mode)
          // are left blank rather than adding numbers that wouldn't mean anything totalled.
          workings.length>0&&React.createElement('tr',{key:'sw-total',style:{background:'var(--th-bg)'}},
            React.createElement('td',{style:{padding:'9px 10px',position:'sticky',left:0,zIndex:2,background:'var(--th-bg)',borderRight:'1px solid var(--border2)',borderTop:'2px solid var(--accent)'}},''),
            React.createElement('td',{style:{padding:'9px 12px',position:'sticky',left:36,zIndex:2,background:'var(--th-bg)',borderRight:'1px solid var(--border2)',borderTop:'2px solid var(--accent)',fontWeight:700,fontSize:12,color:'var(--accent2)'}},swSelectedIds.size>0?'Total (selected)':'Total'),
            React.createElement('td',{style:{padding:'9px 12px',borderTop:'2px solid var(--accent)'}},''),
            td(fmt(exportWorkings.reduce((s,e)=>s+(e.gross||0),0)),'var(--text)',true),
            React.createElement('td',{style:{padding:'8px 8px',borderBottom:'1px solid var(--border)'}},''),
            td(fmt(exportWorkings.reduce((s,e)=>s+(e.grossAfterLop||0),0)),'var(--text)',true),
            cols.serviceInc&&td(fmt(exportWorkings.reduce((s,e)=>s+(e.svcIncAmt||0),0)),'var(--blue)',true),
            cols.memInc&&td(fmt(exportWorkings.reduce((s,e)=>s+(e.memIncAmt||0),0)),'var(--purple)',true),
            cols.prodInc&&td(fmt(exportWorkings.reduce((s,e)=>s+(e.prodIncAmt||0),0)),'var(--teal)',true),
            cols.mgrInc&&td(fmt(exportWorkings.reduce((s,e)=>s+(e.mgrIncAmt||0),0)),'var(--orange)',true),
            cols.nonPerfPenalty&&td(fmt(exportWorkings.reduce((s,e)=>s+(e.nonPerfPenalty||0),0)),'var(--red)',true),
            cols.totalInc&&td(fmt(exportWorkings.reduce((s,e)=>s+(e.totalIncSW||0),0)),'var(--green)',true),
            cols.tea&&td(fmt(exportWorkings.reduce((s,e)=>s+(e.tea||0),0)),'var(--teal)',true),
            cols.pfEmp&&td(fmt(exportWorkings.reduce((s,e)=>s+(e.pfEmp||0),0)),'var(--orange)',true),
            cols.esic&&td(fmt(exportWorkings.reduce((s,e)=>s+(e.esicEmp||0),0)),'var(--orange)',true),
            cols.pt&&td((ptApplies||exportWorkings.some(e=>e.ptOverridden))?fmt(exportWorkings.reduce((s,e)=>s+(e.ptAmt||0),0)):'N/A','var(--orange)',true),
            cols.tds&&td(fmt(exportWorkings.reduce((s,e)=>s+(e.tdsAmt||0),0)),'var(--orange)',true),
            cols.advAdj&&td(fmt(exportWorkings.reduce((s,e)=>s+(e.advAdj||0),0)),'var(--red)',true),
            cols.penalties&&td(fmt(exportWorkings.reduce((s,e)=>s+(e.penAmt||0),0)),'var(--red)',true),
            td(fmt(exportWorkings.reduce((s,e)=>s+(e.net||0),0)),'var(--green)',true),
            cols.prevMonthAdv&&td(fmt(exportWorkings.reduce((s,e)=>s+(e.prevAdv||0),0)),'var(--text)',true),
            cols.currMonthAdv&&td(fmt(exportWorkings.reduce((s,e)=>s+(e.currAdv||0),0)),'var(--text)',true),
            cols.nextMonthAdv&&td(fmt(exportWorkings.reduce((s,e)=>s+(e.nextAdv||0),0)),'var(--text)',true),
            td(fmt(exportWorkings.reduce((s,e)=>s+(e.closingAdvance||0),0)),'var(--red)',true),
            cols.bankDetails&&React.createElement('td',{style:{padding:'8px 8px',borderBottom:'1px solid var(--border)'}},''),
            cols.bankDetails&&React.createElement('td',{style:{padding:'8px 8px',borderBottom:'1px solid var(--border)'}},''),
            cols.bankDetails&&React.createElement('td',{style:{padding:'8px 8px',borderBottom:'1px solid var(--border)'}},''),
            React.createElement('td',{style:{padding:'8px 8px',borderBottom:'1px solid var(--border)'}},''),
            React.createElement('td',{style:{padding:'8px 8px',borderBottom:'1px solid var(--border)'}},''),
            React.createElement('td',{style:{padding:'8px 8px',borderBottom:'1px solid var(--border)'}},'')
          )
        )
        )
      )
    ),
    // ── Next Month Advance pull-forward — date modal ──
    nextAdvPullModal&&React.createElement('div',{
      className:'modal-overlay',onClick:()=>setNextAdvPullModal(null),
      style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}},
      React.createElement('div',{
        onClick:ev=>ev.stopPropagation(),
        style:{background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:'var(--r3)',padding:24,width:420,maxWidth:'92vw',boxShadow:'0 8px 40px rgba(0,0,0,0.6)'}},
        React.createElement('div',{style:{fontFamily:'var(--font2)',fontSize:17,color:'var(--text)',marginBottom:6}},'Adjust Next Month Advance Now'),
        React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:16,lineHeight:1.5}},
          'Adjust '+MONTHS[(selMonth+1)%12]+'\'s advance (given early) against '+MONTHS[selMonth]+' '+selYear+'\'s salary instead of waiting for '+MONTHS[(selMonth+1)%12]+'\'s own Salary Working. Only advances dated on or before the date below are included — anything dated later in '+MONTHS[(selMonth+1)%12]+' is left for its own month.'),
        React.createElement('div',{style:{marginBottom:18}},
          React.createElement('label',{style:{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4,fontWeight:600,display:'block'}},'Adjust advances dated on or before'),
          React.createElement('input',{type:'date',className:'form-control',value:nextAdvPullDateInput,onChange:ev=>setNextAdvPullDateInput(ev.target.value)})
        ),
        React.createElement('div',{style:{display:'flex',gap:10,justifyContent:'flex-end'}},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setNextAdvPullModal(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:confirmNextAdvPull},'✓ Adjust in '+MONTHS[selMonth])
        )
      )
    ),
    // ── Tea Allowance config modal ──
    teaConfigModalOpen&&React.createElement('div',{
      className:'modal-overlay',onClick:()=>setTeaConfigModalOpen(false),
      style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}},
      React.createElement('div',{
        onClick:ev=>ev.stopPropagation(),
        style:{background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:'var(--r3)',padding:24,width:400,maxWidth:'92vw',boxShadow:'0 8px 40px rgba(0,0,0,0.6)'}},
        React.createElement('div',{style:{fontFamily:'var(--font2)',fontSize:17,color:'var(--text)',marginBottom:6}},'Tea Allowance'),
        React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:16,lineHeight:1.5}},'Applies to every Active employee. "Working Days" is Total Days Payable from the Attendance Sheet — the same figure Gross Salary is prorated against.'),
        React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:8,marginBottom:16}},
          [{id:'perDay',label:'₹ per Working Day'},{id:'fixed',label:'Fixed amount per month'}].map(m=>React.createElement('label',{key:m.id,style:{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:'var(--r)',background:teaConfigDraft.mode===m.id?'rgba(47,95,224,0.1)':'var(--bg3)',border:'1px solid '+(teaConfigDraft.mode===m.id?'rgba(47,95,224,0.35)':'var(--border)'),cursor:'pointer'}},
            React.createElement('input',{type:'checkbox',checked:teaConfigDraft.mode===m.id,onChange:()=>setTeaConfigDraft(d=>({...d,mode:m.id}))}),
            React.createElement('span',{style:{fontSize:12.5,color:'var(--text2)'}},m.label)
          ))
        ),
        React.createElement('div',{style:{marginBottom:18}},
          React.createElement('label',{style:{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4,fontWeight:600,display:'block'}},teaConfigDraft.mode==='perDay'?'Rate per Working Day (₹)':'Fixed Amount (₹)'),
          React.createElement('input',{type:'number',min:0,className:'form-control',placeholder:teaConfigDraft.mode==='perDay'?'e.g. 10 or 20':'e.g. 800',value:teaConfigDraft.rate,onChange:ev=>setTeaConfigDraft(d=>({...d,rate:ev.target.value}))})
        ),
        React.createElement('div',{style:{display:'flex',gap:10,justifyContent:'flex-end'}},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setTeaConfigModalOpen(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:saveTeaConfigDraft},'✓ Save')
        )
      )
    ),
    // ── ESIC (Emp) working / override popup ──
    showEsicWorking&&React.createElement('div',{
      className:'modal-overlay',onClick:()=>setShowEsicWorking(null),
      style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}},
      React.createElement('div',{
        onClick:ev=>ev.stopPropagation(),
        style:{background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:'var(--r3)',padding:24,width:400,maxWidth:'92vw',boxShadow:'0 8px 40px rgba(0,0,0,0.6)'}},
        React.createElement('div',{style:{fontFamily:'var(--font2)',fontSize:17,color:'var(--text)',marginBottom:6}},showEsicWorking.name+' — ESIC (Emp)'),
        showEsicWorking.esic&&showEsicWorking.gross<=21000
          ?React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:16}},
              React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12.5,marginBottom:6}},React.createElement('span',null,'Gross Salary'),React.createElement('span',null,'₹'+Math.round(showEsicWorking.gross).toLocaleString('en-IN'))),
              React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12.5,marginBottom:6}},React.createElement('span',null,'ESIC Rate (Employee)'),React.createElement('span',null,'0.75%')),
              React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12.5,fontWeight:700,paddingTop:6,borderTop:'1px solid var(--border)'}},React.createElement('span',null,'Auto-Calculated'),React.createElement('span',null,'₹'+Math.round(showEsicWorking.esicAutoAmt).toLocaleString('en-IN')))
            )
          :React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',background:'var(--bg3)',borderRadius:'var(--r)',padding:'10px 12px',marginBottom:16}},
              !showEsicWorking.esic?'This employee doesn\'t have ESIC ticked as applicable — go to Master Salary to enable it if that\'s wrong.':'Gross Salary (₹'+Math.round(showEsicWorking.gross).toLocaleString('en-IN')+') is over the ₹21,000 ESIC wage ceiling, so nothing is auto-calculated.'),
        React.createElement('div',{style:{marginBottom:6}},
          React.createElement('label',{style:{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4,fontWeight:600,display:'block'}},'Override for this month (₹)'),
          React.createElement('input',{type:'number',min:0,className:'form-control',placeholder:'Leave blank to use the auto-calculated amount',value:esicOverrideDraft,onChange:ev=>setEsicOverrideDraft(ev.target.value)})
        ),
        React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:18}},'Only applies to '+showEsicWorking.name+' for '+MONTHS[selMonth]+' '+selYear+' — every other month, and every other employee, keeps using the standard calculation.'),
        React.createElement('div',{style:{display:'flex',gap:10,justifyContent:'flex-end'}},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowEsicWorking(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:saveEsicOverride},'✓ Save')
        )
      )
    ),
    // ── PF (Emp) working / override popup ──
    showPfWorking&&React.createElement('div',{
      className:'modal-overlay',onClick:()=>setShowPfWorking(null),
      style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}},
      React.createElement('div',{
        onClick:ev=>ev.stopPropagation(),
        style:{background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:'var(--r3)',padding:24,width:400,maxWidth:'92vw',boxShadow:'0 8px 40px rgba(0,0,0,0.6)'}},
        React.createElement('div',{style:{fontFamily:'var(--font2)',fontSize:17,color:'var(--text)',marginBottom:6}},showPfWorking.name+' — PF (Emp)'),
        showPfWorking.pf
          ?(()=>{
              const wageBase=showPfWorking.pfOnActualBasic?showPfWorking.basic:Math.min(showPfWorking.basic,15000);
              return React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:16}},
                React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12.5,marginBottom:6}},React.createElement('span',null,'Basic Salary'),React.createElement('span',null,'₹'+Math.round(showPfWorking.basic).toLocaleString('en-IN'))),
                React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12.5,marginBottom:6}},React.createElement('span',null,'PF Wage Base'+(showPfWorking.pfOnActualBasic?' (actual Basic)':' (capped at ₹15,000)')),React.createElement('span',null,'₹'+Math.round(wageBase).toLocaleString('en-IN'))),
                React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12.5,marginBottom:6}},React.createElement('span',null,'PF Rate (Employee)'),React.createElement('span',null,'12%')),
                React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12.5,fontWeight:700,paddingTop:6,borderTop:'1px solid var(--border)'}},React.createElement('span',null,'Auto-Calculated'),React.createElement('span',null,'₹'+Math.round(showPfWorking.pfAutoAmt).toLocaleString('en-IN')))
              );
            })()
          :React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',background:'var(--bg3)',borderRadius:'var(--r)',padding:'10px 12px',marginBottom:16}},
              'This employee doesn\'t have PF ticked as applicable — go to Master Salary to enable it if that\'s wrong.'),
        React.createElement('div',{style:{marginBottom:6}},
          React.createElement('label',{style:{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4,fontWeight:600,display:'block'}},'Override for this month (₹)'),
          React.createElement('input',{type:'number',min:0,className:'form-control',placeholder:'Leave blank to use the auto-calculated amount',value:pfOverrideDraft,onChange:ev=>setPfOverrideDraft(ev.target.value)})
        ),
        React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:18}},'Only applies to '+showPfWorking.name+' for '+MONTHS[selMonth]+' '+selYear+' — every other month, and every other employee, keeps using the standard calculation.'),
        React.createElement('div',{style:{display:'flex',gap:10,justifyContent:'flex-end'}},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowPfWorking(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:savePfOverride},'✓ Save')
        )
      )
    ),
    // ── PT (Professional Tax) working / override popup ──
    showPtWorking&&React.createElement('div',{
      className:'modal-overlay',onClick:()=>setShowPtWorking(null),
      style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}},
      React.createElement('div',{
        onClick:ev=>ev.stopPropagation(),
        style:{background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:'var(--r3)',padding:24,width:400,maxWidth:'92vw',boxShadow:'0 8px 40px rgba(0,0,0,0.6)'}},
        React.createElement('div',{style:{fontFamily:'var(--font2)',fontSize:17,color:'var(--text)',marginBottom:6}},showPtWorking.name+' — Professional Tax'),
        ptApplies
          ?React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:16}},
              React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12.5,marginBottom:6}},React.createElement('span',null,'Outlet State'),React.createElement('span',null,ptState||'—')),
              React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12.5,marginBottom:6}},React.createElement('span',null,'Gross Salary'),React.createElement('span',null,'₹'+Math.round(showPtWorking.gross).toLocaleString('en-IN'))),
              React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:6}},'Matched against '+ptState+"'s PT slabs (see Master Sheet → PT Slabs)."),
              React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12.5,fontWeight:700,paddingTop:6,borderTop:'1px solid var(--border)'}},React.createElement('span',null,'Auto-Calculated'),React.createElement('span',null,'₹'+Math.round(showPtWorking.ptAutoAmt).toLocaleString('en-IN')))
            )
          :React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',background:'var(--bg3)',borderRadius:'var(--r)',padding:'10px 12px',marginBottom:16}},
              'This outlet\'s State ('+(ptState||'not set')+') doesn\'t levy Professional Tax — check Master Sheet if that\'s wrong.'),
        React.createElement('div',{style:{marginBottom:6}},
          React.createElement('label',{style:{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4,fontWeight:600,display:'block'}},'Override for this month (₹)'),
          React.createElement('input',{type:'number',min:0,className:'form-control',placeholder:'Leave blank to use the auto-calculated amount',value:ptOverrideDraft,onChange:ev=>setPtOverrideDraft(ev.target.value)})
        ),
        React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:18}},'Only applies to '+showPtWorking.name+' for '+MONTHS[selMonth]+' '+selYear+' — every other month, and every other employee, keeps using the standard calculation.'),
        React.createElement('div',{style:{display:'flex',gap:10,justifyContent:'flex-end'}},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowPtWorking(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:savePtOverride},'✓ Save')
        )
      )
    ),
    // ── TDS entry popup — plain manual amount, no auto-calculation (see comment on tdsAmt) ──
    showTdsEntry&&React.createElement('div',{
      className:'modal-overlay',onClick:()=>setShowTdsEntry(null),
      style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}},
      React.createElement('div',{
        onClick:ev=>ev.stopPropagation(),
        style:{background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:'var(--r3)',padding:24,width:400,maxWidth:'92vw',boxShadow:'0 8px 40px rgba(0,0,0,0.6)'}},
        React.createElement('div',{style:{fontFamily:'var(--font2)',fontSize:17,color:'var(--text)',marginBottom:6}},showTdsEntry.name+' — TDS (Section 192)'),
        React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',background:'var(--bg3)',borderRadius:'var(--r)',padding:'10px 12px',marginBottom:16,lineHeight:1.5}},
          'TDS on salary depends on projected annual income, exemptions, and old-vs-new regime choice — this sheet has no basis to estimate that on its own, so there\'s no auto-calculation here. Enter the amount worked out separately (e.g. from Form 12BB / the employee\'s declared investments) for whichever month it should actually be deducted.'),
        React.createElement('div',{style:{marginBottom:6}},
          React.createElement('label',{style:{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4,fontWeight:600,display:'block'}},'TDS Amount for this month (₹)'),
          React.createElement('input',{type:'number',min:0,className:'form-control',placeholder:'0',value:tdsAmountDraft,onChange:ev=>setTdsAmountDraft(ev.target.value),autoFocus:true})
        ),
        React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:18}},'Only applies to '+showTdsEntry.name+' for '+MONTHS[selMonth]+' '+selYear+' — set it again for any other month it applies to.'),
        React.createElement('div',{style:{display:'flex',gap:10,justifyContent:'flex-end'}},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowTdsEntry(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:saveTdsAmount},'✓ Save')
        )
      )
    ),
    // ── Incentive-figure drill-down modal — Svc/Mem/Prod/MGR Inc, Non-Performance Penalty, Total
    // Inc all open this same summary, since they're all facets of the one Incentive Working row. ──
    incWorkingModal&&(()=>{
      const e=incWorkingModal;const d=e.incDetail;
      const iwRow=(label,target,actual,pct,amt,color)=>React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 90px 90px 60px 90px',gap:8,fontSize:11.5,padding:'6px 0',borderBottom:'1px solid var(--border)',alignItems:'center'}},
        React.createElement('span',{style:{color:'var(--text2)'}},label),
        React.createElement('span',{style:{textAlign:'right',color:'var(--text3)'}},'₹'+Math.round(target).toLocaleString('en-IN')),
        React.createElement('span',{style:{textAlign:'right',color:'var(--text3)'}},'₹'+Math.round(actual).toLocaleString('en-IN')),
        React.createElement('span',{style:{textAlign:'right',color:'var(--text3)'}},pct+'%'),
        React.createElement('span',{style:{textAlign:'right',fontWeight:600,color}},amt>0?'₹'+Math.round(amt).toLocaleString('en-IN'):'—')
      );
      const simpleRow=(label,note,amt,color)=>React.createElement('div',{style:{marginBottom:10}},
        React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12.5}},
          React.createElement('span',{style:{color:'var(--text2)'}},label),
          React.createElement('span',{style:{fontWeight:600,color}},amt>0?'₹'+Math.round(amt).toLocaleString('en-IN'):'—')),
        note&&React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:2}},note)
      );
      return React.createElement('div',{className:'modal-overlay',onClick:()=>setIncWorkingModal(null)},
        React.createElement('div',{className:'modal',style:{width:560,maxHeight:'85vh',overflowY:'auto'},onClick:ev=>ev.stopPropagation()},
          React.createElement('div',{className:'modal-title'},e.name+' — Incentive Working'),
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:16}},
            MONTHS[selMonth]+' '+selYear+' · every figure below is the exact same number Incentive Working itself computes — this is a read-only summary, edit actuals/rates/rules there.'),


          d?React.createElement(React.Fragment,null,
            React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'16px 0 6px'}},'Incentive Working — target vs achieved'),
            React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 90px 90px 60px 90px',gap:8,fontSize:9.5,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.05em',paddingBottom:4,borderBottom:'1px solid var(--border2)'}},
              React.createElement('span',null,'Category'),React.createElement('span',{style:{textAlign:'right'}},'Target'),React.createElement('span',{style:{textAlign:'right'}},'Achieved'),React.createElement('span',{style:{textAlign:'right'}},'%'),React.createElement('span',{style:{textAlign:'right'}},'Amount')),
            iwRow('Service',d.svcTarget,d.svcActual,d.svcPct,d.svcIncAmt,'var(--blue)'),
            iwRow('Membership',d.memTarget,d.memActual,d.memPct,d.memIncAmt,'var(--purple)'),
            iwRow('Product',d.prodTarget,d.prodActual,d.prodPct,d.prodIncAmt,'var(--teal)'),
            React.createElement('div',{style:{fontSize:10,color:'var(--text3)',marginTop:6,lineHeight:1.5}},
              'Membership uses whichever Membership Incentive Rule (A/B/C) is active for this outlet, not a flat rate on its own — the % shown is achievement against target, not the rate used for the amount.'),

            React.createElement('div',{style:{marginTop:14}},
              simpleRow('Manager Incentive',MANAGER_DESIGNATIONS.has(e.desig)?'This employee\'s share of the salon-wide Manager Incentive pool (collection vs. target, split between Managers).':'Not applicable — '+(e.desig||'this designation')+' isn\'t a Manager-type role.',d.mgrIncAmt,'var(--orange)'),
              simpleRow('Non-Performance Penalty',d.penaltyAmt>0?'Manually entered on Incentive Working for this employee this month.':'No penalty entered for this employee this month.',d.penaltyAmt,'var(--red)'),
              d.advAdj>0&&simpleRow('Advance Adjustment (Incentive)','This month\'s installment for any advance recovered against Incentive rather than Salary — separate from Salary Working\'s own Advance Adj.',d.advAdj,'var(--red)')
            ),

            React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:14,paddingTop:12,marginTop:10,borderTop:'2px solid var(--border2)'}},
              React.createElement('span',null,'Total Inc'),
              React.createElement('span',{style:{color:'var(--green)'}},'₹'+Math.round(d.totalInc).toLocaleString('en-IN'))),
            React.createElement('div',{style:{fontSize:10,color:'var(--text3)',marginTop:4}},
              'Service + Membership + Product + Manager Incentive − Non-Performance Penalty − Advance Adjustment')
          )
          :React.createElement('div',{style:{fontSize:12,color:'var(--text3)',padding:'10px 0'}},'This employee doesn\'t appear on Incentive Working for this month (Helper/Housekeeper designations are excluded there) — MGR Inc, Non-Performance Penalty and Total Inc show as — for that reason.'),

          React.createElement('div',{style:{display:'flex',justifyContent:'flex-end',gap:10,marginTop:18}},
            onNavTab&&React.createElement('button',{className:'btn btn-ghost',onClick:()=>{setIncWorkingModal(null);onNavTab('incentive-working');}},'Go to Incentive Working →'),
            React.createElement('button',{className:'btn btn-primary',onClick:()=>setIncWorkingModal(null)},'Close')
          )
        )
      );
    })()
  );
}

// ── Salary Payment — a payout-focused view of Salary Working: just who gets paid, how much, and
// where it goes. Pulls the same per-employee data (swWorkingsFor) Salary Working itself uses, so
// Net Salary here always matches the main sheet — nothing recomputed. Same pattern as Incentive
// Payment under Incentive Working. ──
function SalaryPaymentSheet({period,salon}={}){
  const {error:spError}=useToast();
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today=new Date();
  const initCal=periodToCalendar(period);
  const [selMonth,setSelMonth]=useState(initCal?initCal.month:today.getMonth());
  const [selYear,setSelYear]=useState(initCal?initCal.year:today.getFullYear());
  useEffect(()=>{
    const cal=periodToCalendar(period);
    if(cal){setSelMonth(cal.month);setSelYear(cal.year);}
    // eslint-disable-next-line
  },[period&&period.mi,period&&period.fy]);
  const workings=swWorkingsFor(salon?.id,selYear,selMonth);
  const fmt=(n)=>n?'₹'+Math.round(n).toLocaleString('en-IN'):'—';
  const COLS=['Name of Employee','Designation','Net Salary','Bank Name','Account No.','IFSC Code'];

  // ── Selection — pick specific employees to export/share instead of always the whole list.
  // Empty selection = share everyone (unchanged default behaviour); any selection narrows every
  // export/share action below to just those rows. ──
  const [selectedIds,setSelectedIds]=useState(new Set());
  useEffect(()=>{setSelectedIds(new Set());},[selMonth,selYear,salon?.id]); // don't carry a selection across a different month/outlet
  const toggleSelect=(id)=>setSelectedIds(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});
  const allSelected=workings.length>0&&workings.every(e=>selectedIds.has(e.id));
  const toggleSelectAll=()=>setSelectedIds(allSelected?new Set():new Set(workings.map(e=>e.id)));
  const exportRows=selectedIds.size>0?workings.filter(e=>selectedIds.has(e.id)):workings;
  const totalNet=exportRows.reduce((s,e)=>s+(e.net||0),0);

  const exportExcel=async()=>{
    const filename='SalaryPayment_'+MONTHS[selMonth]+'_'+selYear+(selectedIds.size>0?'_selected':'')+'.xlsx';
    try{
      const blob=await exportReportExcelBlob(spReportTitle,spReportSheetRows());
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
    }catch(err){spError(err.message);}
  };

  // ── Share — PDF, Word, and Excel via the same reusable Share modal used across the app. No
  // custom buildExcelBlob here (unlike Salary Working's live-formula export) — this is a flat
  // payout listing, not a working sheet, so the generic sheetRows-based exporter is enough. ──
  const spReportTitle='Salary Payment — '+MONTHS[selMonth]+' '+selYear+(salon?' — '+salon.name.split('—')[0].trim():'')+(selectedIds.size>0?' (selected)':'');
  const spReportSheetRows=()=>[COLS,...exportRows.map(e=>[e.name,e.desig,e.net,e.bankName||'',e.accountNo||'',e.ifsc||''])];
  // Net Salary tinted blue, Bank Details tinted purple — same palette Salary Working uses —
  // plus row-wise zebra striping on the neutral columns for readability.
  const SP_BG_NET='rgba(74,158,255,0.12)';
  const SP_BG_BANK='rgba(139,127,232,0.09)';
  const spReportBodyHtml=()=>'<table><thead><tr>'+COLS.map((h,i)=>'<th'+(i<2||i>2?'':' class="num"')+'>'+h+'</th>').join('')+'</tr></thead><tbody>'
    +exportRows.map(e=>'<tr><td>'+e.name+'</td><td>'+e.desig+'</td><td class="num" style="background:#eff6ff">'+fmt(e.net)+'</td><td style="background:#f5f3ff">'+(e.bankName||'—')+'</td><td style="background:#f5f3ff">'+(e.accountNo||'—')+'</td><td style="background:#f5f3ff">'+(e.ifsc||'—')+'</td></tr>').join('')+'</tbody></table>';

  if(!salaryAttendanceReady(salon?.id,selYear,selMonth))return React.createElement(AttendanceNotFinalNotice,{monthLabel:MONTHS[selMonth]+' '+selYear,title:'Salary Payment'});
  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Salary Payment'),
        React.createElement('div',{className:'page-sub'},MONTHS[selMonth]+' '+selYear+' — payout details sourced from Salary Working')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selMonth,onChange:e=>setSelMonth(Number(e.target.value))},MONTHS.map((m,i)=>React.createElement('option',{key:m,value:i},m))),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selYear,onChange:e=>setSelYear(Number(e.target.value))},appYears().map(y=>React.createElement('option',{key:y},y))),
        React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},onClick:exportExcel},selectedIds.size>0?'⬇ Export Selected ('+selectedIds.size+')':'⬇ Export Excel'),
        React.createElement(ShareReportButton,{title:spReportTitle,subtitle:'Salary Payment',getBodyHtml:spReportBodyHtml,getSheetRows:spReportSheetRows})
      )
    ),
    selectedIds.size>0&&React.createElement('div',{style:{fontSize:11.5,color:'var(--accent2)',background:'rgba(47,95,224,0.1)',border:'1px solid rgba(47,95,224,0.3)',borderRadius:'var(--r)',padding:'6px 12px',marginBottom:10}},
      selectedIds.size+' of '+workings.length+' employees selected — Export and Share above will only include the selected rows — ',
      React.createElement('span',{style:{color:'var(--accent2)',cursor:'pointer',textDecoration:'underline'},onClick:()=>setSelectedIds(new Set())},'clear selection')
    ),
    React.createElement('div',{className:'card',style:{padding:0}},
      React.createElement('div',{style:{overflowX:'auto'}},
        React.createElement('table',{style:{borderCollapse:'collapse',width:'100%',fontSize:12}},
          React.createElement('thead',null,React.createElement('tr',null,
            React.createElement('th',{style:{padding:'8px 10px',background:'var(--th-bg)',borderBottom:'2px solid var(--accent)',width:32}},
              workings.length>0&&React.createElement('input',{type:'checkbox',checked:allSelected,onChange:toggleSelectAll,title:'Select all'})
            ),
            COLS.map(h=>React.createElement('th',{key:h,style:{padding:'8px 10px',background:h==='Net Salary'?SP_BG_NET:(['Bank Name','Account No.','IFSC Code'].includes(h)?SP_BG_BANK:'var(--th-bg)'),color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em',whiteSpace:'nowrap',borderBottom:'2px solid var(--accent)',textAlign:h==='Net Salary'?'right':'left'}},h))
          )),
          workings.length===0
            ?React.createElement('tbody',null,React.createElement('tr',null,React.createElement('td',{colSpan:COLS.length+1,style:{textAlign:'center',padding:32,color:'var(--text3)'}},'No employees for this month.')))
            :React.createElement('tbody',null,
              workings.map((e,spRowIdx)=>{
                const spRowBg=spRowIdx%2===1?'rgba(120,130,150,0.05)':undefined;
                return React.createElement('tr',{key:e.id,style:{background:selectedIds.has(e.id)?'rgba(47,95,224,0.06)':spRowBg}},
                React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)'}},
                  React.createElement('input',{type:'checkbox',checked:selectedIds.has(e.id),onChange:()=>toggleSelect(e.id)})
                ),
                React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',fontWeight:500,color:'var(--text)',whiteSpace:'nowrap'}},e.name),
                React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',color:'var(--text2)',whiteSpace:'nowrap'}},e.desig),
                React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',textAlign:'right',fontWeight:600,color:'var(--accent)',background:SP_BG_NET}},fmt(e.net)),
                React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',color:'var(--text2)',background:SP_BG_BANK}},e.bankName||'—'),
                React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',color:'var(--text2)',fontFamily:'monospace',background:SP_BG_BANK}},e.accountNo||'—'),
                React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',color:'var(--text2)',fontFamily:'monospace',background:SP_BG_BANK}},e.ifsc||'—')
              );}),
              React.createElement('tr',{key:'sp-total',style:{background:'var(--th-bg)'}},
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)'}},''),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)',fontWeight:700,fontSize:12,color:'var(--accent2)'}},selectedIds.size>0?'Total (selected)':'Total'),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)'}},''),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)',textAlign:'right',fontWeight:700,color:'var(--accent)'}},fmt(totalNet)),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)'}},''),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)'}},''),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)'}},'')
              )
            )
        )
      )
    )
  );
}

// ── Tab wrapper — Salary Working (the full working sheet) and Salary Payment (a payout-only
// listing) side by side, same pattern as Incentive Working / Incentive Payment. Both screens
// stay mounted at all times — only visibility toggles — so switching between them never
// unmounts/remounts either one and never loses in-progress state. ──
// ── Salary Summary Approval — the read-only screen Salon Manager/ASM land on instead of the
// real Salary Working sheet (see isSummaryApproverRole). Shows exactly the snapshot sent via
// "Send Summary for Approval" — nothing here is editable, and nothing here can touch the
// working sheet's own row-level Approved/lock status; Approve/Return only ever changes this
// summary's own record. ──
function SalarySummaryApproval({salon,period,user}={}){
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today=new Date();
  const initCal=periodToCalendar(period);
  const [selMonth,setSelMonth]=useState(initCal?initCal.month:today.getMonth());
  const [selYear,setSelYear]=useState(initCal?initCal.year:today.getFullYear());
  useEffect(()=>{
    const cal=periodToCalendar(period);
    if(cal){setSelMonth(cal.month);setSelYear(cal.year);}
    // eslint-disable-next-line
  },[period&&period.mi,period&&period.fy]);
  const [tick,setTick]=useState(0);
  const rec=useMemo(()=>summaryApprovalFor(salon?.id,'salary',selYear,selMonth),[salon?.id,selYear,selMonth,tick]);
  const {success,error:toastErr}=useToast();
  const [remarks,setRemarks]=useState('');
  const money=(n)=>'₹'+Math.round(n||0).toLocaleString('en-IN');
  const decide=(decision)=>{
    if(decision==='Returned'&&!remarks.trim()){toastErr('Add a remark explaining why this is being returned.');return;}
    decideSummaryApproval(salon?.id,'salary',selYear,selMonth,decision,user?.name,remarks);
    setTick(t=>t+1);setRemarks('');
    success(decision==='Approved'?'Salary Summary approved':'Salary Summary returned to sender');
  };
  const COLS=[['Gross','gross'],['Tea','tea'],['PF','pf'],['ESIC','esic'],['PT','pt'],['TDS','tds'],['Adv. Adj.','advAdj'],['Penalty','penalty']];
  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Salary Summary — For Approval'),
        React.createElement('div',{className:'page-sub'},'Read-only figures sent for your review — you don\'t have access to the working sheet itself, only this summary.')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selMonth,onChange:e=>setSelMonth(Number(e.target.value))},MONTHS.map((m,i)=>React.createElement('option',{key:m,value:i},m))),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selYear,onChange:e=>setSelYear(Number(e.target.value))},appYears().map(y=>React.createElement('option',{key:y},y)))
      )
    ),
    !rec&&React.createElement('div',{className:'card',style:{textAlign:'center',padding:40,color:'var(--text3)'}},
      React.createElement('div',{style:{fontSize:32,marginBottom:8}},'📭'),
      React.createElement('div',null,'No Salary Summary has been sent for '+MONTHS[selMonth]+' '+selYear+' yet.')
    ),
    rec&&React.createElement('div',{className:'card'},
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,marginBottom:14,flexWrap:'wrap'}},
        React.createElement('span',{className:'badge '+(rec.status==='Approved'?'badge-green':rec.status==='Returned'?'badge-red':'badge-amber')},
          rec.status==='Approved'?'✓ Approved':rec.status==='Returned'?'↩ Returned':'⏳ Awaiting Your Approval'),
        React.createElement('span',{style:{fontSize:11.5,color:'var(--text3)'}},'Sent '+fmtDMY(rec.sentAt.slice(0,10))+' by '+(rec.sentBy||'—')),
        rec.status==='Approved'&&React.createElement('span',{style:{fontSize:11.5,color:'var(--text3)'}},'· Approved '+fmtDMY(rec.approvedAt.slice(0,10))+' by '+(rec.approvedBy||'—')),
        rec.status==='Returned'&&rec.remarks&&React.createElement('span',{style:{fontSize:11.5,color:'var(--red)'}},'· '+rec.remarks)
      ),
      React.createElement('div',{className:'table-wrap'},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,
            React.createElement('th',null,'Employee'),
            ...COLS.map(([label])=>React.createElement('th',{key:label},label)),
            React.createElement('th',null,'Net Salary')
          )),
          React.createElement('tbody',null,
            rec.rows.map(r=>React.createElement('tr',{key:r.empId},
              React.createElement('td',null,React.createElement('div',{style:{fontWeight:500,color:'var(--text)'}},r.name),React.createElement('div',{style:{fontSize:10,color:'var(--text3)'}},r.desig)),
              ...COLS.map(([label,k])=>React.createElement('td',{key:k},money(r[k]))),
              React.createElement('td',null,React.createElement('span',{style:{fontWeight:700,color:'var(--green)'}},money(r.net)))
            )),
            React.createElement('tr',{style:{background:'var(--bg3)'}},
              React.createElement('td',null,React.createElement('strong',null,'Total')),
              ...COLS.map(([,k])=>React.createElement('td',{key:k})),
              React.createElement('td',null,React.createElement('strong',{style:{color:'var(--green)'}},money(rec.total)))
            )
          )
        )
      ),
      React.createElement('div',{style:{marginTop:16,paddingTop:16,borderTop:'1px solid var(--border)'}},
        React.createElement('textarea',{className:'form-control',placeholder:'Remarks (required if returning)',value:remarks,onChange:e=>setRemarks(e.target.value),style:{marginBottom:10,minHeight:60}}),
        React.createElement('div',{style:{display:'flex',gap:8}},
          React.createElement('button',{className:'btn btn-success',onClick:()=>decide('Approved')},'✓ Approve'),
          React.createElement('button',{className:'btn btn-danger',onClick:()=>decide('Returned')},'↩ Return with Remarks')
        )
      )
    )
  );
}
// ── Incentive Summary Approval — same pattern as SalarySummaryApproval above, for Incentive
// Working's own snapshot. ──
function IncentiveSummaryApproval({salon,period,user}={}){
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today=new Date();
  const initCal=periodToCalendar(period);
  const [selMonth,setSelMonth]=useState(initCal?initCal.month:today.getMonth());
  const [selYear,setSelYear]=useState(initCal?initCal.year:today.getFullYear());
  useEffect(()=>{
    const cal=periodToCalendar(period);
    if(cal){setSelMonth(cal.month);setSelYear(cal.year);}
    // eslint-disable-next-line
  },[period&&period.mi,period&&period.fy]);
  const [tick,setTick]=useState(0);
  const rec=useMemo(()=>summaryApprovalFor(salon?.id,'incentive',selYear,selMonth),[salon?.id,selYear,selMonth,tick]);
  const {success,error:toastErr}=useToast();
  const [remarks,setRemarks]=useState('');
  const money=(n)=>'₹'+Math.round(n||0).toLocaleString('en-IN');
  const decide=(decision)=>{
    if(decision==='Returned'&&!remarks.trim()){toastErr('Add a remark explaining why this is being returned.');return;}
    decideSummaryApproval(salon?.id,'incentive',selYear,selMonth,decision,user?.name,remarks);
    setTick(t=>t+1);setRemarks('');
    success(decision==='Approved'?'Incentive Summary approved':'Incentive Summary returned to sender');
  };
  const COLS=[['Service Inc.','svcInc'],['Membership Inc.','memInc'],['Product Inc.','prodInc'],['Manager Inc.','mgrInc'],['Penalty','penalty']];
  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Incentive Summary — For Approval'),
        React.createElement('div',{className:'page-sub'},'Read-only figures sent for your review — you don\'t have access to the working sheet itself, only this summary.')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selMonth,onChange:e=>setSelMonth(Number(e.target.value))},MONTHS.map((m,i)=>React.createElement('option',{key:m,value:i},m))),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:selYear,onChange:e=>setSelYear(Number(e.target.value))},appYears().map(y=>React.createElement('option',{key:y},y)))
      )
    ),
    !rec&&React.createElement('div',{className:'card',style:{textAlign:'center',padding:40,color:'var(--text3)'}},
      React.createElement('div',{style:{fontSize:32,marginBottom:8}},'📭'),
      React.createElement('div',null,'No Incentive Summary has been sent for '+MONTHS[selMonth]+' '+selYear+' yet.')
    ),
    rec&&React.createElement('div',{className:'card'},
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,marginBottom:14,flexWrap:'wrap'}},
        React.createElement('span',{className:'badge '+(rec.status==='Approved'?'badge-green':rec.status==='Returned'?'badge-red':'badge-amber')},
          rec.status==='Approved'?'✓ Approved':rec.status==='Returned'?'↩ Returned':'⏳ Awaiting Your Approval'),
        React.createElement('span',{style:{fontSize:11.5,color:'var(--text3)'}},'Sent '+fmtDMY(rec.sentAt.slice(0,10))+' by '+(rec.sentBy||'—')),
        rec.status==='Approved'&&React.createElement('span',{style:{fontSize:11.5,color:'var(--text3)'}},'· Approved '+fmtDMY(rec.approvedAt.slice(0,10))+' by '+(rec.approvedBy||'—')),
        rec.status==='Returned'&&rec.remarks&&React.createElement('span',{style:{fontSize:11.5,color:'var(--red)'}},'· '+rec.remarks)
      ),
      React.createElement('div',{className:'table-wrap'},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,
            React.createElement('th',null,'Employee'),
            ...COLS.map(([label])=>React.createElement('th',{key:label},label)),
            React.createElement('th',null,'Total Incentive')
          )),
          React.createElement('tbody',null,
            rec.rows.map(r=>React.createElement('tr',{key:r.empId},
              React.createElement('td',null,React.createElement('div',{style:{fontWeight:500,color:'var(--text)'}},r.name),React.createElement('div',{style:{fontSize:10,color:'var(--text3)'}},r.desig)),
              ...COLS.map(([label,k])=>React.createElement('td',{key:k},money(r[k]))),
              React.createElement('td',null,React.createElement('span',{style:{fontWeight:700,color:'var(--green)'}},money(r.total)))
            )),
            React.createElement('tr',{style:{background:'var(--bg3)'}},
              React.createElement('td',null,React.createElement('strong',null,'Total')),
              ...COLS.map(([,k])=>React.createElement('td',{key:k})),
              React.createElement('td',null,React.createElement('strong',{style:{color:'var(--green)'}},money(rec.total)))
            )
          )
        )
      ),
      React.createElement('div',{style:{marginTop:16,paddingTop:16,borderTop:'1px solid var(--border)'}},
        React.createElement('textarea',{className:'form-control',placeholder:'Remarks (required if returning)',value:remarks,onChange:e=>setRemarks(e.target.value),style:{marginBottom:10,minHeight:60}}),
        React.createElement('div',{style:{display:'flex',gap:8}},
          React.createElement('button',{className:'btn btn-success',onClick:()=>decide('Approved')},'✓ Approve'),
          React.createElement('button',{className:'btn btn-danger',onClick:()=>decide('Returned')},'↩ Return with Remarks')
        )
      )
    )
  );
}

function SalaryWorkingSheet({period,salon,onNavTab,user}={}){
  // ── Salon Manager / ASM never get the working sheet itself — see Send Summary for Approval
  // on the sheet below (visible to whoever DOES have edit access here) and isSummaryApproverRole
  // for the full rationale. They land on a dedicated read-only Approve/Return screen instead of
  // any of this component's own sub-tabs (Salary Working, Salary Payment). ──
  if(summaryApprovalOnly(user,salon?.id,'salary-working'))return React.createElement(SalarySummaryApproval,{salon,period,user});
  return React.createElement(SalaryWorkingTabs,{period,salon,onNavTab,user}); // separate component: switching screens when access changes live never mixes hooks
}
function SalaryWorkingTabs({period,salon,onNavTab,user}={}){
  const [subTab,setSubTab]=useState('salary');
  const approver=isSummaryApproverRole(user); // given Edit here — keeps Summary Approval as a tab
  const tabBar=React.createElement('div',{className:'tab-bar',style:{marginBottom:16}},
    [{id:'salary',label:'Salary Working'},{id:'salary-payment',label:'Salary Payment'},{id:'send-payslips',label:'Send Payslips'},{id:'statutory',label:'Statutory Files'},...(approver?[{id:'summary',label:'Summary Approval'}]:[])].map(t=>
      React.createElement('button',{key:t.id,className:`tab-btn ${subTab===t.id?'active':''}`,onClick:()=>setSubTab(t.id)},t.label)
    )
  );
  return React.createElement('div',{className:'fade-in'},
    tabBar,
    React.createElement('div',{style:{display:subTab==='salary'?'block':'none'}},React.createElement(SalaryWorkingCore,{period,salon,onNavTab,user})),
    React.createElement('div',{style:{display:subTab==='salary-payment'?'block':'none'}},React.createElement(SalaryPaymentSheet,{period,salon})),
    subTab==='send-payslips'&&React.createElement(SendPayslipsSheet,{period,salon}),
    subTab==='statutory'&&React.createElement(StatutoryFilesSheet,{period,salon}),
    approver&&React.createElement('div',{style:{display:subTab==='summary'?'block':'none'}},React.createElement(SalarySummaryApproval,{salon,period,user}))
  );
}

// ── Split by Designation UI — a compact checkbox + group-tab switcher, reused by every
// category's Rules section (Service Slabs, Membership Rules, Product Rule, Manager Incentive) to
// switch between one shared plan for everyone and a separate plan per group. Purely presentational
// — the parent owns which group is "active" and re-fetches that group's settings on change. ──
function SplitByDesignationToggle({checked,onToggle,color,label}){
  return React.createElement('label',{style:{display:'inline-flex',alignItems:'center',gap:8,fontSize:12,fontWeight:600,color:checked?color:'var(--text3)',cursor:'pointer',marginBottom:checked?8:0}},
    React.createElement('input',{type:'checkbox',checked,onChange:onToggle}),
    label
  );
}
function DesignationGroupTabs({groups,active,onPick}){
  return React.createElement('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}},
    groups.map(g=>React.createElement('button',{key:g,type:'button',className:'btn btn-sm '+(active===g?'btn-primary':'btn-ghost'),onClick:()=>onPick(g)},g))
  );
}