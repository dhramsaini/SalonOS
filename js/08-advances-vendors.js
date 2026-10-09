

function AdvanceSheet({period,salon}={}){
  const _today=new Date();
  const _initCal=periodToCalendar(period);
  const attMonth=_initCal?_initCal.month:_today.getMonth();
  const attYear=_initCal?_initCal.year:_today.getFullYear();
  const [syncTick,setSyncTick]=useState(0);
  const {success,error:advError}=useToast();
  const advIsLocked=(dateStr)=>{
    const p=String(dateStr||'').split('-');
    if(p.length!==3)return false;
    return isMonthLockedFor(salon?.id,Number(p[0]),Number(p[1])-1);
  };
  const advBlockIfLocked=(dateStr)=>{
    if(!advIsLocked(dateStr))return false;
    advError('That month is locked — nobody can change it while it is locked. A Super Admin can unlock it, with a reason (Salary Working, Master Sheet → Months, or un-finalize the P&L).');
    return true;
  };
  const EMPLOYEES=getEmployeesForMonth(attYear,attMonth,salon?.id);
  const syncEmployees=()=>{setSyncTick(t=>t+1);success('Synced '+getEmployeesForMonth(attYear,attMonth,salon?.id).length+' employees from Attendance');};
  const ASM_LIST=EMPLOYEES.filter(e=>e.desig==='Assist Manager');
  const nextMonthFirstYM=()=>{const d=new Date();d.setMonth(d.getMonth()+1,1);return d.toISOString().slice(0,7);};
  const BLANK={id:'',emp:'',date:localTodayIso(),amount:'',reason:'',approvedBy:'',repayment:'',mode:'Bank Transfer',bankRef:'',note:'',deductFrom:'Salary',deductionStart:nextMonthFirstYM(),schedule:[]};
  const nextMonthFirst=()=>{const d=new Date();d.setMonth(d.getMonth()+1,1);return localIsoOf(d);};
  const REQUEST_BLANK={emp:'',date:localTodayIso(),amount:'',repayment:'',reason:'',deductionStart:nextMonthFirst(),deductFrom:'Salary'};
  const advSalonId=salon?.id;
  const advKey=()=>outletKey('salonos_advances',advSalonId);
  const SEED_ADVANCE_FINGERPRINTS=new Set([
    'A001|2024-01-05|10000|Medical emergency|Priya Sharma',
    'A002|2024-01-12|5000|Personal|Priya Sharma',
    'A003|2024-01-20|15000|House rent|Priya Sharma'
  ]);
  const stripSeedAdvances=(list)=>{
    if(!Array.isArray(list)||!list.length)return list;
    const cleaned=list.filter(a=>!SEED_ADVANCE_FINGERPRINTS.has([a.id,a.date,a.amount,a.reason,a.approvedBy].join('|')));
    return cleaned.length!==list.length?cleaned:list;
  };
  const [advances,setAdvances]=useState(()=>{
    reconcileAdvanceRecoveries(advSalonId);
    try{const raw=cachedLocalGet(advKey());if(raw!==null){const p=JSON.parse(raw);if(Array.isArray(p))return stripSeedAdvances(p);}}catch(e){}
    return[];
  });
  useEffect(()=>{safeLocalSet(advKey(),JSON.stringify(advances));},[advances,advSalonId]);
  const [showModal,setShowModal]=useState(false);
  const [editItem,setEditItem]=useState(null);
  const [form,setForm]=useState(BLANK);
  const [showDelete,setShowDelete]=useState(null);
  const [filterMode,setFilterMode]=useState('All');
  const [statusFilter,setStatusFilter]=useState('All');
  const [recoverFilter,setRecoverFilter]=useState('All');
  const [showRequestModal,setShowRequestModal]=useState(false);
  const [requestForm,setRequestForm]=useState(REQUEST_BLANK);
  const [showApproveModal,setShowApproveModal]=useState(null);
  const [approveForm,setApproveForm]=useState({approverId:'',repayment:'',remarks:''});
  const [viewMode,setViewMode]=useState('list'); // 'list' | 'register' | 'report'
  const [regFY,setRegFY]=useState(period?.fy||PG_FYS[PG_FYS.length-1]);
  const [reportPeriod,setReportPeriod]=useState('current'); // 'current' | '3m' | '6m' | 'all' — filters the report below by each advance's own Date (when it was given)
  const fc=(k)=>(e)=>setForm(f=>{
    const next={...f,[k]:e.target.value};
    // When picking an employee on a fresh (not-editing) advance, follow whatever source their
    // most recent active advance already uses — most employees are consistent, so this saves a
    // click most of the time without silently overriding anything once they've touched the field.
    if(k==='emp'&&!editItem&&e.target.value){
      const match=[...advances].reverse().find(a=>a.emp===e.target.value&&a.status==='Active');
      if(match)next.deductFrom=match.deductFrom||'Salary';
    }
    return next;
  });
  const rfc=(k)=>(e)=>setRequestForm(f=>{
    const next={...f,[k]:e.target.value};
    if(k==='emp'&&e.target.value){
      const match=[...advances].reverse().find(a=>a.emp===e.target.value&&a.status==='Active');
      if(match)next.deductFrom=match.deductFrom||'Salary';
    }
    return next;
  });
  const nextId=()=>nextPrefixedId(advances,'A',3);
  const openAdd=()=>{setForm(BLANK);setEditItem(null);setShowModal(true);};
  const openEdit=(a)=>{if(advBlockIfLocked(a.date))return;setForm({...a,amount:String(a.amount),repayment:String(a.repayment),deductFrom:a.deductFrom||'Salary',deductionStart:a.deductionStart&&a.deductionStart.length===7?a.deductionStart:nextMonthFirstYM(),schedule:Array.isArray(a.schedule)?a.schedule:[]});setEditItem(a);setShowModal(true);};
  const openRequest=()=>{setRequestForm(REQUEST_BLANK);setShowRequestModal(true);};
  const submitRequest=()=>{
    if(advBlockIfLocked(requestForm.date))return;
    if(!requestForm.emp||!requestForm.amount||!requestForm.repayment||!requestForm.deductionStart){alert('Employee, amount, monthly salary deduction and deduction start date are required.');return;}
    if(!advanceLimitGate(advSalonId,requestForm.emp,Number(requestForm.amount)))return;
    const item={id:nextId(),emp:requestForm.emp,date:requestForm.date,amount:Number(requestForm.amount),
      reason:requestForm.reason,approvedBy:'',repayment:Number(requestForm.repayment),
      mode:'Salary Deduction',bankRef:'',repaymentTerms:'Deduction from Salary',deductionStart:requestForm.deductionStart,
      deductFrom:requestForm.deductFrom||'Salary',
      outstanding:Number(requestForm.amount),status:'Pending Approval'};
    setAdvances(prev=>[...prev,item]);
    setShowRequestModal(false);
  };
  const openApprove=(a)=>{if(advBlockIfLocked(a.date))return;setShowApproveModal(a);setApproveForm({approverId:ASM_LIST[0]?.id||'',repayment:String(a.repayment),remarks:''});};
  const confirmApprove=()=>{
    if(advBlockIfLocked(showApproveModal&&showApproveModal.date))return;
    if(!approveForm.approverId){alert('Select the approving ASM (Assist Manager).');return;}
    const asm=ASM_LIST.find(e=>e.id===approveForm.approverId);
    const repay=Number(approveForm.repayment)||0;
    setAdvances(prev=>prev.map(a=>a.id===showApproveModal.id?{...a,status:'Active',approvedBy:asm.name+' (ASM)',repayment:repay,outstanding:Math.max(0,a.amount-repay)}:a));
    setShowApproveModal(null);
  };
  const rejectRequest=(a)=>{
    if(advBlockIfLocked(a.date))return;
    if(!confirm('Reject the advance request from '+a.emp+'?'))return;
    setAdvances(prev=>prev.map(x=>x.id===a.id?{...x,status:'Rejected'}:x));
  };
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
  const regenerateSchedule=()=>{
    if(!form.amount||!form.repayment){alert('Enter Amount and Monthly Deduction first.');return;}
    setForm(f=>({...f,schedule:genSchedule(f.amount,f.repayment,f.deductionStart||nextMonthFirstYM())}));
  };
  const setScheduleRow=(idx,field,val)=>setForm(f=>{
    const next=[...(f.schedule||[])];
    next[idx]={...next[idx],[field]:field==='amount'?(val===''?'':Number(val)):val};
    return{...f,schedule:next};
  });
  const addScheduleRow=()=>setForm(f=>{
    const list=f.schedule||[];
    const last=list[list.length-1];
    const d=last?new Date(last.month+'-01'):new Date(form.deductionStart+'-01'||new Date());
    if(last)d.setMonth(d.getMonth()+1);
    const ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    return{...f,schedule:[...list,{month:ym,amount:0}]};
  });
  const removeScheduleRow=(idx)=>{if(confirm('Remove this schedule row?'))setForm(f=>({...f,schedule:(f.schedule||[]).filter((_,i)=>i!==idx)}));};
  const scheduleTotal=(form.schedule||[]).reduce((s,r)=>s+(Number(r.amount)||0),0);
  const save=()=>{
    if(advBlockIfLocked(form.date))return;
    if(!form.emp||!form.amount){alert('Employee and amount are required.');return;}
    const isSynced=editItem&&editItem.source==='dse';
    if(!isSynced&&!form.bankRef){alert('Bank Reference is required — advances recorded here are always by Bank Transfer. Cash advances go through Daily Sales & Expenses instead.');return;}
    if(!isSynced&&!advanceLimitGate(advSalonId,form.emp,Number(form.amount)-(editItem?Number(editItem.amount)||0:0),editItem?editItem.id:undefined))return;
    const outstanding=Number(form.amount)-Number(form.repayment||0);
    const item={...form,mode:isSynced?form.mode:'Bank Transfer',id:form.id||nextId(),amount:Number(form.amount),repayment:Number(form.repayment||0),
      schedule:(form.schedule||[]).map(r=>({month:r.month,amount:Number(r.amount)||0})),
      outstanding:Math.max(0,outstanding),status:outstanding<=0?'Recovered':'Active'};
    if(editItem)setAdvances(prev=>prev.map(a=>a.id===item.id?item:a));
    else setAdvances(prev=>[...prev,item]);
    setShowModal(false);
  };
  const filtered=advances.filter(a=>(filterMode==='All'||a.mode===filterMode)&&(statusFilter==='All'||a.status===statusFilter)&&(recoverFilter==='All'||(a.deductFrom||'Salary')===recoverFilter));
  const ADV_FILTER_COLS=[
    {key:'id',label:'ID',get:a=>a.id},
    {key:'emp',label:'Employee',get:a=>a.emp},
    {key:'date',label:'Date',get:a=>a.date||'(blank)'},
    {key:'amount',label:'Amount',get:a=>rupee(a.amount)},
    {key:'mode',label:'Mode',get:a=>a.mode},
    {key:'deductFrom',label:'Recover Against',get:a=>a.deductFrom||'Salary'},
    {key:'status',label:'Status',get:a=>a.status}
  ];
  const advFilters=useExcelColumnFilter(filtered,ADV_FILTER_COLS);
  const advWrapRef=useRef(null);
  const advCellRange=useExcelCellRange(advWrapRef);
  const pendingCount=advances.filter(a=>a.status==='Pending Approval').length;
  const settledAdv=advances.filter(a=>a.status==='Active'||a.status==='Recovered');
  const totalAdv=settledAdv.reduce((s,a)=>s+a.amount,0);
  const totalOut=settledAdv.reduce((s,a)=>s+a.outstanding,0);
  const totalRec=totalAdv-totalOut;
  const outBySalary=settledAdv.filter(a=>(a.deductFrom||'Salary')==='Salary').reduce((s,a)=>s+a.outstanding,0);
  const outByIncentive=settledAdv.filter(a=>(a.deductFrom||'Salary')==='Incentive').reduce((s,a)=>s+a.outstanding,0);
  const statusBadgeClass=(status)=>status==='Active'?'badge-amber':status==='Recovered'?'badge-green':status==='Pending Approval'?'badge-blue':'badge-red';
  // ── Advance Register — employee-wise & month-wise, for the selected FY. "Given" is read from
  // each advance's own disbursement date; "Recovered" is read from each advance's month-wise
  // schedule (only advances created with a Deduction Plan carry one). Advances predating
  // scheduling have no month-by-month history to show here — their flat monthly figure still
  // feeds Salary/Incentive Working correctly, it just can't be placed into a specific past month
  // in this register without inventing data that was never actually recorded that way. ──
  const FY_MONTHS_APR=['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
  const FY_CAL_MONTH=[3,4,5,6,7,8,9,10,11,0,1,2]; // calendar month (0=Jan) for each FY_MONTHS_APR slot
  const regRows=useMemo(()=>{
    const empNames=[...new Set([...EMPLOYEES.map(e=>e.name),...advances.map(a=>a.emp)])].filter(Boolean).sort();
    const settled=advances.filter(a=>a.status==='Active'||a.status==='Recovered');
    return empNames.map(emp=>{
      const empAdv=settled.filter(a=>a.emp===emp);
      const monthly=FY_MONTHS_APR.map((label,i)=>{
        const year=Number(pgYear(regFY,i));
        const ym=year+'-'+String(FY_CAL_MONTH[i]+1).padStart(2,'0');
        const given=empAdv.filter(a=>(a.date||'').slice(0,7)===ym).reduce((s,a)=>s+(Number(a.amount)||0),0);
        const recovered=empAdv.reduce((s,a)=>{
          if(!Array.isArray(a.schedule))return s;
          const row=a.schedule.find(r=>r.month===ym);
          return s+(row?Number(row.amount)||0:0);
        },0);
        return{label,ym,given,recovered};
      });
      const hasUnscheduled=empAdv.some(a=>!Array.isArray(a.schedule)||!a.schedule.length);
      const totalGiven=empAdv.reduce((s,a)=>s+(Number(a.amount)||0),0);
      const totalRecovered=monthly.reduce((s,m)=>s+m.recovered,0);
      const outstanding=empAdv.filter(a=>a.status==='Active').reduce((s,a)=>s+(Number(a.outstanding)||0),0);
      return{emp,monthly,totalGiven,totalRecovered,outstanding,hasUnscheduled,count:empAdv.length};
    }).filter(r=>r.count>0);
  },[advances,EMPLOYEES,regFY]);
  // ── Outstanding vs Recovery report — same settled advances (Active + Recovered) as everywhere
  // else on this sheet, filtered down to just the ones actually GIVEN within the selected window,
  // then split into two separate lists: what's still outstanding on them, and what's already been
  // recovered (fully or partially) — instead of one blended list you have to mentally split
  // yourself. "Recovered" here is amount − outstanding, so a partially-recovered Active advance
  // shows up in both lists at once, which is correct — it genuinely has both an outstanding
  // remainder and a recovered portion. ──
  const reportRangeStart=useMemo(()=>{
    const now=new Date();
    if(reportPeriod==='current')return new Date(now.getFullYear(),now.getMonth(),1);
    if(reportPeriod==='3m')return new Date(now.getFullYear(),now.getMonth()-2,1);
    if(reportPeriod==='6m')return new Date(now.getFullYear(),now.getMonth()-5,1);
    return null; // 'all' — no lower bound
  },[reportPeriod]);
  const inReportRange=(dateStr)=>{
    if(!reportRangeStart)return true;
    if(!dateStr)return false;
    const d=new Date(dateStr+'T00:00:00');
    return!isNaN(d)&&d>=reportRangeStart;
  };
  const reportSettled=useMemo(()=>settledAdv.filter(a=>inReportRange(a.date)),[settledAdv,reportPeriod]);
  const reportOutstandingList=reportSettled.filter(a=>a.status==='Active'&&Number(a.outstanding)>0);
  const reportRecoveredList=reportSettled.filter(a=>(Number(a.amount)-Number(a.outstanding))>0);
  const reportTotalGiven=reportSettled.reduce((s,a)=>s+(Number(a.amount)||0),0);
  const reportTotalOutstanding=reportOutstandingList.reduce((s,a)=>s+(Number(a.outstanding)||0),0);
  const reportTotalRecovered=reportSettled.reduce((s,a)=>s+(Number(a.amount)-Number(a.outstanding)),0);
  const REPORT_PERIODS=[{id:'current',label:'Current Month'},{id:'3m',label:'Last 3 Months'},{id:'6m',label:'Last 6 Months'},{id:'all',label:'Overall'}];
  const exportReportExcel=async()=>{
    const hdr=['ID','Employee','Date','Amount','Recover Against','Outstanding','Recovered','Status'];
    const rowFor=(a)=>{const amount=Number(a.amount)||0,outstanding=Number(a.outstanding)||0;return[a.id,a.emp,a.date||'',amount,a.deductFrom||'Salary',outstanding,amount-outstanding,a.status];};
    const totalFor=(list)=>{
      const amt=list.reduce((s,a)=>s+(Number(a.amount)||0),0),os=list.reduce((s,a)=>s+(Number(a.outstanding)||0),0);
      return['Total','','',amt,'',os,amt-os,''];
    };
    const sheetRows=[hdr,
      ['Outstanding Advances'],
      ...reportOutstandingList.map(rowFor),
      totalFor(reportOutstandingList),
      ['Recovered Advances'],
      ...reportRecoveredList.map(rowFor),
      totalFor(reportRecoveredList)
    ];
    try{
      const blob=await exportReportExcelBlob('Advances Outstanding vs Recovery — '+reportPeriod,sheetRows);
      const url=URL.createObjectURL(blob);const a2=document.createElement('a');a2.href=url;a2.download='Advances_Outstanding_vs_Recovery_'+reportPeriod+'.xlsx';a2.click();URL.revokeObjectURL(url);
      success('Excel exported — colour-coded, with subtotal rows for each section.');
    }catch(err){advError(err.message||'Could not build the Excel file — please try again.');}
  };
  const exportAdvancesExcel=async()=>{
    const hdr=['ID','Employee','Date','Amount','Mode','Bank Ref','Reason','Monthly Deduction','Deduction Start From','Outstanding','Recovered','Status','Approved By'];
    const rows=filtered.map(a=>{
      const amount=Number(a.amount)||0,outstanding=Number(a.outstanding)||0;
      return[a.id,a.emp,a.date||'',amount,a.mode||'',a.bankRef||'',a.reason||'',Number(a.repayment)||0,a.deductionStart||'',outstanding,amount-outstanding,a.status,a.approvedBy||''];
    });
    const totalAmount=rows.reduce((s,r)=>s+r[3],0),totalOutstanding=rows.reduce((s,r)=>s+r[9],0),totalRecovered=rows.reduce((s,r)=>s+r[10],0);
    const sheetRows=[hdr,...rows,['Total','','',totalAmount,'','','','','',totalOutstanding,totalRecovered,'','']];
    try{
      const blob=await exportReportExcelBlob('Advances — '+(salon?.name||'Outlet'),sheetRows);
      const url=URL.createObjectURL(blob);const a2=document.createElement('a');a2.href=url;a2.download='Advances_'+(salon?salon.name.split('—')[0].trim().replace(/\s+/g,'_'):'Outlet')+'.xlsx';a2.click();URL.revokeObjectURL(url);
      success('Excel exported — colour-coded, with a live total row.');
    }catch(err){advError(err.message||'Could not build the Excel file — please try again.');}
  };
  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,React.createElement('div',{className:'page-title'},'Advance to Employees'),React.createElement('div',{className:'page-sub'},'Request advances against future salary, approved by an ASM — or record a Bank Transfer advance directly')),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},onClick:exportAdvancesExcel},'⬇ Export Excel'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:syncEmployees},'⟳ Sync Employees from Attendance'),
        React.createElement('div',{style:{display:'flex',border:'1px solid var(--border)',borderRadius:'var(--r)',overflow:'hidden'}},
          ['list','register','report'].map(v=>React.createElement('button',{key:v,className:`btn btn-sm ${viewMode===v?'btn-primary':'btn-ghost'}`,style:{borderRadius:0,border:'none'},onClick:()=>setViewMode(v)},v==='list'?'📋 List':v==='register'?'📅 Register':'📊 Report')
        )),
        React.createElement('button',{className:'btn btn-primary btn-sm',onClick:openRequest},'📝 Request Advance'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:openAdd},'+ New Advance (Bank)')
      )
    ),
    React.createElement('div',{style:{background:'rgba(47,95,224,0.08)',border:'1px solid rgba(47,95,224,0.2)',borderRadius:'var(--r)',padding:'8px 14px',marginBottom:14,fontSize:12,color:'var(--accent2)'}},
      'Employees can request an advance with repayment terms of Deduction from Salary — the request stays "Pending Approval" until an ASM (Assist Manager) approves it. For advances already disbursed via Bank Transfer, use "+ New Advance (Bank)" to record them directly. Cash advances still go through the Daily Expenses sheet.'
    ),
    React.createElement('div',{className:'grid4',style:{marginBottom:8}},
      [{label:'Pending Approval',val:pendingCount,color:'blue'},{label:'Total Advanced',val:rupee(totalAdv),color:'amber'},{label:'Outstanding',val:rupee(totalOut),color:'red'},{label:'Recovered',val:rupee(totalRec),color:'green'}].map(m=>
        React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},React.createElement('div',{className:'metric-label'},m.label),React.createElement('div',{className:'metric-value'},m.val))
      )
    ),
    React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:16}},
      'Outstanding split — ',
      React.createElement('span',{style:{color:'var(--accent2)',fontWeight:600}},'🏦 Salary: ₹'+outBySalary.toLocaleString('en-IN')),
      '  ·  ',
      React.createElement('span',{style:{color:'var(--blue)',fontWeight:600}},'💰 Incentive: ₹'+outByIncentive.toLocaleString('en-IN'))
    ),
    viewMode==='list'&&React.createElement('div',{style:{display:'flex',gap:10,marginBottom:10,flexWrap:'wrap'}},
      ['All','Cash','Bank Transfer'].map(m=>React.createElement('button',{key:m,className:`btn btn-sm ${filterMode===m?'btn-primary':'btn-ghost'}`,onClick:()=>setFilterMode(m)},m))
    ),
    viewMode==='list'&&React.createElement('div',{style:{display:'flex',gap:10,marginBottom:10,flexWrap:'wrap'}},
      ['All','Salary','Incentive'].map(m=>React.createElement('button',{key:m,className:`btn btn-sm ${recoverFilter===m?'btn-primary':'btn-ghost'}`,onClick:()=>setRecoverFilter(m)},(m==='Incentive'?'💰 ':m==='Salary'?'🏦 ':'')+m))
    ),
    viewMode==='list'&&React.createElement('div',{style:{display:'flex',gap:10,marginBottom:12,flexWrap:'wrap'}},
      ['All','Pending Approval','Active','Recovered','Rejected'].map(s=>React.createElement('button',{key:s,className:`btn btn-sm ${statusFilter===s?'btn-primary':'btn-ghost'}`,onClick:()=>setStatusFilter(s)},s))
    ),
    viewMode==='list'&&React.createElement('div',{className:'card'},
      filtered.length===0
        ?React.createElement('div',{style:{textAlign:'center',padding:32,color:'var(--text3)'}},'No advance records. Click + Request Advance or + New Advance to begin.')
        :React.createElement('div',null,
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:8}},'Click a cell — or drag across several — then Ctrl/Cmd+C to copy, just like Excel.'),
          React.createElement('div',{className:'table-wrap',ref:advWrapRef},
          React.createElement('table',null,
            React.createElement('thead',null,React.createElement('tr',null,
              advFilters.TH(ADV_FILTER_COLS[0]),advFilters.TH(ADV_FILTER_COLS[1]),advFilters.TH(ADV_FILTER_COLS[2]),advFilters.TH(ADV_FILTER_COLS[3]),advFilters.TH(ADV_FILTER_COLS[4]),
              React.createElement('th',{key:'bankRef'},'Bank Ref'),React.createElement('th',{key:'reason'},'Reason'),React.createElement('th',{key:'approvedBy'},'Approved By'),React.createElement('th',{key:'monthlyDed'},'Monthly Ded.'),React.createElement('th',{key:'dedFrom'},'Deduction From'),React.createElement('th',{key:'outstanding'},'Outstanding'),
              advFilters.TH(ADV_FILTER_COLS[5]),advFilters.TH(ADV_FILTER_COLS[6]),
              React.createElement('th',{key:'actions'},'Actions')
            )),
            React.createElement('tbody',null,advFilters.filteredRows.map((a,ri)=>{
              const sel=(c)=>advCellRange.isSelected(ri,c)?'rgba(47,95,224,0.12)':undefined;
              const synced=a.source==='dse';
              return React.createElement('tr',{key:a.id},
                React.createElement('td',{'data-xr':ri,'data-xc':0,style:{background:sel(0)}},React.createElement('span',{style:{fontFamily:'monospace',fontSize:11,color:'var(--accent)'}},a.id)),
                React.createElement('td',{'data-xr':ri,'data-xc':1,style:{background:sel(1)}},
                  React.createElement('span',{style:{fontWeight:500,color:'var(--text)'}},a.emp),
                  synced&&React.createElement('span',{title:'Synced from Daily Sales & Exp — edit the amount there, this updates automatically',style:{marginLeft:6,fontSize:10,color:'var(--blue)'}},'🔗')
                ),
                React.createElement('td',{'data-xr':ri,'data-xc':2,style:{background:sel(2)}},a.date),
                React.createElement('td',{'data-xr':ri,'data-xc':3,style:{background:sel(3)}},rupee(a.amount)),
                React.createElement('td',{'data-xr':ri,'data-xc':4,style:{background:sel(4)}},React.createElement('span',{className:`badge ${a.mode==='Bank Transfer'?'badge-blue':'badge-amber'}`},a.mode)),
                React.createElement('td',null,a.bankRef?React.createElement('span',{style:{fontFamily:'monospace',fontSize:10,color:'var(--text2)'}},a.bankRef):'—'),
                React.createElement('td',null,React.createElement('span',{style:{fontSize:12}},a.reason)),
                React.createElement('td',null,a.approvedBy),
                React.createElement('td',null,rupee(a.repayment)),
                React.createElement('td',null,a.deductionStart?React.createElement('span',{style:{fontSize:11,color:'var(--text2)'}},a.deductionStart):'—'),
                React.createElement('td',null,React.createElement('span',{style:{color:a.outstanding>0?'var(--red)':'var(--green)',fontWeight:600}},rupee(a.outstanding))),
                React.createElement('td',{'data-xr':ri,'data-xc':5,style:{background:sel(5)}},React.createElement('span',{className:`badge ${a.deductFrom==='Incentive'?'badge-blue':'badge-amber'}`},a.deductFrom||'Salary')),
                React.createElement('td',{'data-xr':ri,'data-xc':6,style:{background:sel(6)}},React.createElement('span',{className:`badge ${statusBadgeClass(a.status)}`},a.status)),
                React.createElement('td',null,
                  React.createElement('div',{style:{display:'flex',gap:4,flexWrap:'wrap'}},
                    a.status==='Pending Approval'&&React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(76,175,125,0.1)',border:'1px solid rgba(76,175,125,0.3)',color:'var(--green)',padding:'4px 8px',borderRadius:'var(--r)',cursor:'pointer',fontSize:11},onClick:()=>openApprove(a)},'✓ Approve'),
                    a.status==='Pending Approval'&&React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.3)',color:'var(--red)',padding:'4px 8px',borderRadius:'var(--r)',cursor:'pointer',fontSize:11},onClick:()=>rejectRequest(a)},'✗ Reject'),
                    React.createElement('button',{className:'btn btn-ghost btn-sm',title:synced?'This advance is synced from Daily Sales & Exp — editing here will be overwritten next time that entry is saved there':undefined,onClick:()=>openEdit(a)},'Edit'),
                    React.createElement('button',{'aria-label':'Delete',className:'btn btn-sm',style:{background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.3)',color:'var(--red)',padding:'4px 8px',borderRadius:'var(--r)',cursor:'pointer',fontSize:11},title:synced?'Deleting here only removes this copy — it reappears if the Daily Sales & Exp entry is saved again. Clear it there to remove it for good.':undefined,onClick:()=>setShowDelete(a)},React.createElement(IconTrash,{size:14}))
                  )
                )
              );
            }))
          )
        ),
        advFilters.Portal(),
        advCellRange.Toolbar()
        )
    ),
    viewMode==='register'&&React.createElement('div',{className:'card'},
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,marginBottom:12,flexWrap:'wrap'}},
        React.createElement('div',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},'Advance Register — FY '+regFY),
        React.createElement('select',{className:'form-control',style:{width:'auto',fontSize:11,padding:'4px 8px'},value:regFY,onChange:e=>setRegFY(e.target.value)},PG_FYS.map(f=>React.createElement('option',{key:f,value:f},'FY '+f))),
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginLeft:'auto'}},'Recovered = actual month-wise Deduction Plan on each advance · Given = disbursement date')
      ),
      regRows.length===0
        ?React.createElement('div',{style:{textAlign:'center',padding:32,color:'var(--text3)'}},'No advances recorded for this outlet yet.')
        :React.createElement('div',{className:'table-wrap'},
          React.createElement('table',{style:{fontSize:11.5}},
            React.createElement('thead',null,React.createElement('tr',null,
              React.createElement('th',{style:{position:'sticky',left:0,zIndex:2,background:'var(--th-bg)',minWidth:140}},'Employee'),
              ...FY_MONTHS_APR.map(label=>React.createElement('th',{key:label,style:{textAlign:'right',minWidth:70}},label)),
              React.createElement('th',{style:{textAlign:'right',minWidth:90}},'Total Given'),
              React.createElement('th',{style:{textAlign:'right',minWidth:100}},'Total Recovered'),
              React.createElement('th',{style:{textAlign:'right',minWidth:90}},'Outstanding')
            )),
            React.createElement('tbody',null,regRows.map(r=>React.createElement('tr',{key:r.emp},
              React.createElement('td',{style:{position:'sticky',left:0,zIndex:1,background:'var(--bg2)',fontWeight:500}},
                r.emp,
                r.hasUnscheduled&&React.createElement('span',{title:'This employee has at least one advance with no Deduction Plan — its flat monthly figure is applied to Salary/Incentive Working every active month, but isn\'t attributable to a specific month here.',style:{marginLeft:5,fontSize:10,color:'var(--text3)',cursor:'help'}},'✱')
              ),
              ...r.monthly.map(m=>React.createElement('td',{key:m.ym,style:{textAlign:'right'}},
                m.given>0&&React.createElement('div',{style:{color:'var(--blue)'}},'+₹'+m.given.toLocaleString('en-IN')),
                m.recovered>0&&React.createElement('div',{style:{color:'var(--red)'}},'−₹'+m.recovered.toLocaleString('en-IN')),
                (m.given===0&&m.recovered===0)&&React.createElement('span',{style:{color:'var(--text3)'}},'—')
              )),
              React.createElement('td',{style:{textAlign:'right',fontWeight:600,color:'var(--blue)'}},rupee(r.totalGiven)),
              React.createElement('td',{style:{textAlign:'right',fontWeight:600,color:'var(--red)'}},rupee(r.totalRecovered)),
              React.createElement('td',{style:{textAlign:'right',fontWeight:600,color:r.outstanding>0?'var(--orange)':'var(--green)'}},rupee(r.outstanding))
            )))
          )
        ),
      React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:10}},'✱ = has an advance recorded before month-wise Deduction Plans existed, or with no plan generated — its monthly deduction still reduces salary/incentive correctly, just isn\'t placed into a specific month above.')
    ),
    // ── Outstanding vs Recovery Report ──
    viewMode==='report'&&React.createElement(React.Fragment,null,
      React.createElement('div',{style:{display:'flex',gap:10,marginBottom:12,flexWrap:'wrap',alignItems:'center'}},
        React.createElement('span',{style:{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.06em',fontWeight:600}},'Advances given in:'),
        REPORT_PERIODS.map(p=>React.createElement('button',{key:p.id,className:`btn btn-sm ${reportPeriod===p.id?'btn-primary':'btn-ghost'}`,onClick:()=>setReportPeriod(p.id)},p.label)),
        React.createElement('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:'auto',color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},onClick:exportReportExcel},'⬇ Export Excel')
      ),
      React.createElement('div',{className:'grid4',style:{marginBottom:16}},
        [{label:'Advances Given',val:rupee(reportTotalGiven),color:'blue'},
         {label:'Outstanding',val:rupee(reportTotalOutstanding),color:'red'},
         {label:'Recovered',val:rupee(reportTotalRecovered),color:'green'},
         {label:'Records',val:reportSettled.length,color:'amber'}
        ].map(m=>React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},React.createElement('div',{className:'metric-label'},m.label),React.createElement('div',{className:'metric-value'},m.val)))
      ),
      React.createElement('div',{className:'card',style:{marginBottom:16}},
        React.createElement('div',{style:{display:'flex',alignItems:'center',gap:7,fontSize:12.5,fontWeight:600,color:'var(--red)',marginBottom:10}},
          '🔴 Outstanding Advances',React.createElement('span',{style:{fontSize:11,color:'var(--text3)',fontWeight:400}},'('+reportOutstandingList.length+')')
        ),
        reportOutstandingList.length===0
          ?React.createElement('div',{style:{textAlign:'center',padding:24,color:'var(--text3)',fontSize:12}},'Nothing outstanding for advances given in this period.')
          :React.createElement('div',{className:'table-wrap'},
              React.createElement('table',{style:{fontSize:11.5}},
                React.createElement('thead',null,React.createElement('tr',null,['Employee','Date','Amount','Recover Against','Outstanding'].map(h=>React.createElement('th',{key:h,style:{textAlign:h==='Employee'?'left':'right'}},h)))),
                React.createElement('tbody',null,
                  reportOutstandingList.map(a=>React.createElement('tr',{key:a.id},
                    React.createElement('td',null,a.emp),
                    React.createElement('td',{style:{textAlign:'right',color:'var(--text3)'}},fmtDMY(a.date)),
                    React.createElement('td',{style:{textAlign:'right'}},rupee(Number(a.amount))),
                    React.createElement('td',{style:{textAlign:'right',color:(a.deductFrom||'Salary')==='Incentive'?'var(--blue)':'var(--accent2)'}},(a.deductFrom||'Salary')==='Incentive'?'💰 Incentive':'🏦 Salary'),
                    React.createElement('td',{style:{textAlign:'right',fontWeight:700,color:'var(--red)'}},rupee(Number(a.outstanding)))
                  )),
                  React.createElement('tr',{style:{fontWeight:700}},
                    React.createElement('td',{colSpan:4},'Total'),
                    React.createElement('td',{style:{textAlign:'right',color:'var(--red)'}},rupee(reportTotalOutstanding))
                  )
                )
              )
            )
      ),
      React.createElement('div',{className:'card'},
        React.createElement('div',{style:{display:'flex',alignItems:'center',gap:7,fontSize:12.5,fontWeight:600,color:'var(--green)',marginBottom:10}},
          '🟢 Recovered Advances',React.createElement('span',{style:{fontSize:11,color:'var(--text3)',fontWeight:400}},'('+reportRecoveredList.length+')')
        ),
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:10}},'Includes fully Recovered advances and the recovered portion of any Active advance that\'s been partially paid down — an advance can appear in both this list and Outstanding above at the same time.'),
        reportRecoveredList.length===0
          ?React.createElement('div',{style:{textAlign:'center',padding:24,color:'var(--text3)',fontSize:12}},'Nothing recovered yet for advances given in this period.')
          :React.createElement('div',{className:'table-wrap'},
              React.createElement('table',{style:{fontSize:11.5}},
                React.createElement('thead',null,React.createElement('tr',null,['Employee','Date','Amount','Recover Against','Recovered','Status'].map(h=>React.createElement('th',{key:h,style:{textAlign:h==='Employee'?'left':'right'}},h)))),
                React.createElement('tbody',null,
                  reportRecoveredList.map(a=>{
                    const recovered=Number(a.amount)-Number(a.outstanding);
                    return React.createElement('tr',{key:a.id},
                      React.createElement('td',null,a.emp),
                      React.createElement('td',{style:{textAlign:'right',color:'var(--text3)'}},fmtDMY(a.date)),
                      React.createElement('td',{style:{textAlign:'right'}},rupee(Number(a.amount))),
                      React.createElement('td',{style:{textAlign:'right',color:(a.deductFrom||'Salary')==='Incentive'?'var(--blue)':'var(--accent2)'}},(a.deductFrom||'Salary')==='Incentive'?'💰 Incentive':'🏦 Salary'),
                      React.createElement('td',{style:{textAlign:'right',fontWeight:700,color:'var(--green)'}},rupee(recovered)),
                      React.createElement('td',{style:{textAlign:'right'}},React.createElement('span',{className:'badge '+statusBadgeClass(a.status)},a.status))
                    );
                  }),
                  React.createElement('tr',{style:{fontWeight:700}},
                    React.createElement('td',{colSpan:4},'Total'),
                    React.createElement('td',{style:{textAlign:'right',color:'var(--green)'}},rupee(reportTotalRecovered)),
                    React.createElement('td',null)
                  )
                )
              )
            )
      )
    ),
    showModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowModal(false)},
      React.createElement('div',{className:'modal',style:{width:560},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},editItem?'Edit Advance':'New Advance'),
        React.createElement('div',{style:{background:'rgba(74,158,255,0.08)',border:'1px solid rgba(74,158,255,0.2)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:14,fontSize:12,color:'var(--blue)'}},
          editItem&&editItem.source==='dse'
            ?'This is a Cash advance synced from Daily Sales & Expenses → Advance To Employees. Edit the amount there — changes made here get overwritten next time that entry is saved.'
            :'Advances recorded here are always by Bank Transfer. Cash advances can only be entered through Daily Sales & Expenses → Advance To Employees, and appear here automatically.'
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-56'},'Employee *'),React.createElement('select',{id:'f-56',className:'form-control',value:form.emp,onChange:fc('emp')},React.createElement('option',{value:''},'— Select —'),EMPLOYEES.map(e=>React.createElement('option',{key:e.id,value:e.name},e.name)))),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-57'},'Date'),React.createElement('input',{id:'f-57',type:'date',className:'form-control',value:form.date,onChange:fc('date')}))
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-58'},'Amount (₹) *'),React.createElement('input',{id:'f-58',type:'number',className:'form-control',value:form.amount,onChange:fc('amount'),placeholder:'0'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-59'},'Monthly Deduction (₹)'),React.createElement('input',{id:'f-59',type:'number',className:'form-control',value:form.repayment,onChange:fc('repayment'),placeholder:'0'}))
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},
            React.createElement('label',null,'Recover Against'),
            React.createElement('div',{style:{display:'flex',gap:8}},
              ['Salary','Incentive'].map(m=>{
                const active=(form.deductFrom||'Salary')===m;
                const tint=m==='Incentive'?'var(--blue)':'var(--accent2)';
                return React.createElement('button',{key:m,type:'button',onClick:()=>setForm(f=>({...f,deductFrom:m})),
                  style:{flex:1,padding:'9px 10px',borderRadius:'var(--r)',cursor:'pointer',fontSize:12.5,fontWeight:600,
                    border:active?'1.5px solid '+tint:'1px solid var(--border)',
                    background:active?(m==='Incentive'?'rgba(74,158,255,0.1)':'rgba(47,95,224,0.12)'):'var(--bg3)',
                    color:active?tint:'var(--text3)'}
                },(m==='Incentive'?'💰 ':'🏦 ')+m);
              })
            ),
            React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:6}},form.deductFrom==='Incentive'?'Deducted from the Incentive Working payout each month':'Deducted from the Salary Working payout each month')
          )
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Payment Mode'),
            editItem&&editItem.source==='dse'
              ?React.createElement('div',{className:'form-control',style:{background:'var(--bg3)',color:'var(--text3)'}},form.mode+' (synced — not editable here)')
              :React.createElement('div',{className:'form-control',style:{background:'var(--bg3)',color:'var(--text2)',display:'flex',alignItems:'center',gap:6}},'🏦 Bank Transfer')
          ),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-61'},'Bank Reference / UTR *'),React.createElement('input',{id:'f-61',className:'form-control',value:form.bankRef,onChange:fc('bankRef'),placeholder:'Transaction reference',disabled:editItem&&editItem.source==='dse'}))
        ),
        !(editItem&&editItem.source==='dse')&&React.createElement('div',{className:'form-group',style:{marginBottom:14}},
          React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}},
            React.createElement('label',{style:{margin:0}},'Deduction Plan — month-wise'),
            React.createElement('div',{style:{display:'flex',gap:6}},
              React.createElement('input',{type:'month',className:'form-control',style:{width:'auto',fontSize:11,padding:'4px 8px'},value:form.deductionStart||nextMonthFirstYM(),onChange:fc('deductionStart'),title:'Deduction start month'}),
              React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:regenerateSchedule,title:'Split the Amount across Monthly Deduction-sized installments starting from the month above'},'🔄 Generate')
            )
          ),
          (form.schedule&&form.schedule.length>0)
            ?React.createElement('div',null,
                React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:8,fontSize:10.5,color:'var(--text3)',textTransform:'uppercase',padding:'2px 4px'}},
                  React.createElement('div',null,'Month'),React.createElement('div',null,'Amount (₹)'),React.createElement('div',null)
                ),
                form.schedule.map((row,idx)=>React.createElement('div',{key:idx,style:{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:8,marginBottom:6,alignItems:'center'}},
                  React.createElement('input',{type:'month',className:'form-control',value:row.month,onChange:e=>setScheduleRow(idx,'month',e.target.value)}),
                  React.createElement('input',{type:'number',className:'form-control',value:row.amount,onChange:e=>setScheduleRow(idx,'amount',e.target.value)}),
                  React.createElement('button',{type:'button','aria-label':'Remove month',className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>removeScheduleRow(idx)},React.createElement(IconTrash,{size:13}))
                )),
                React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:4}},
                  React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:addScheduleRow},'+ Add Month'),
                  React.createElement('span',{style:{fontSize:11.5,color:scheduleTotal===Number(form.amount||0)?'var(--green)':'var(--orange)'}},
                    'Planned total: ₹'+scheduleTotal.toLocaleString('en-IN')+' of ₹'+Number(form.amount||0).toLocaleString('en-IN')+(scheduleTotal!==Number(form.amount||0)?' — doesn\'t match Amount yet':' ✓')
                  )
                )
              )
            :React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',padding:'8px 10px',background:'var(--bg3)',borderRadius:'var(--r)'}},
                'Enter Amount and Monthly Deduction above, then click Generate to split this advance into month-wise installments — each one stays editable afterwards.'
              )
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-62'},'Reason'),React.createElement('input',{id:'f-62',className:'form-control',value:form.reason,onChange:fc('reason'),placeholder:'Reason for advance'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-63'},'Approved By'),React.createElement('input',{id:'f-63',className:'form-control',value:form.approvedBy,onChange:fc('approvedBy'),placeholder:'Approver name'}))
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowModal(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:save},editItem?'Save Changes':'Record Advance')
        )
      )
    ),
    showDelete&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowDelete(null)},
      React.createElement('div',{className:'modal',style:{width:400},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title',style:{color:'var(--red)'}},'Delete Advance Record'),
        React.createElement('div',{style:{fontSize:13,color:'var(--text2)',marginBottom:20}},'Delete advance for ',React.createElement('b',null,showDelete.emp),' of ₹'+showDelete.amount.toLocaleString('en-IN')+'? This cannot be undone.'),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowDelete(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-danger',onClick:()=>{if(advBlockIfLocked(showDelete.date))return;setAdvances(prev=>prev.filter(a=>a.id!==showDelete.id));setShowDelete(null);}},'Delete')
        )
      )
    ),

    // ── Request Advance modal ──
    showRequestModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowRequestModal(false)},
      React.createElement('div',{className:'modal',style:{width:560},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Request Advance — Deduction from Salary'),
        React.createElement('div',{style:{background:'rgba(74,158,255,0.08)',border:'1px solid rgba(74,158,255,0.2)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:14,fontSize:12,color:'var(--blue)'}},
          'Repayment terms: this advance will be recovered as a monthly deduction from salary. The request stays "Pending Approval" until an ASM (Assist Manager) approves it.'
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-64'},'Employee *'),React.createElement('select',{id:'f-64',className:'form-control',value:requestForm.emp,onChange:rfc('emp')},React.createElement('option',{value:''},'— Select —'),EMPLOYEES.map(e=>React.createElement('option',{key:e.id,value:e.name},e.name)))),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-65'},'Date'),React.createElement('input',{id:'f-65',type:'date',className:'form-control',value:requestForm.date,onChange:rfc('date')}))
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-66'},'Advance Amount (₹) *'),React.createElement('input',{id:'f-66',type:'number',className:'form-control',value:requestForm.amount,onChange:rfc('amount'),placeholder:'0'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-67'},'Monthly Salary Deduction (₹) *'),React.createElement('input',{id:'f-67',type:'number',className:'form-control',value:requestForm.repayment,onChange:rfc('repayment'),placeholder:'0'}))
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-68'},'Deduction Start From *'),React.createElement('input',{id:'f-68',type:'date',className:'form-control',value:requestForm.deductionStart,onChange:rfc('deductionStart')})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-69'},'Reason'),React.createElement('input',{id:'f-69',className:'form-control',value:requestForm.reason,onChange:rfc('reason'),placeholder:'Reason for advance'}))
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},
            React.createElement('label',null,'Recover Against'),
            React.createElement('div',{style:{display:'flex',gap:8}},
              ['Salary','Incentive'].map(m=>{
                const active=(requestForm.deductFrom||'Salary')===m;
                const tint=m==='Incentive'?'var(--blue)':'var(--accent2)';
                return React.createElement('button',{key:m,type:'button',onClick:()=>setRequestForm(f=>({...f,deductFrom:m})),
                  style:{flex:1,padding:'9px 10px',borderRadius:'var(--r)',cursor:'pointer',fontSize:12.5,fontWeight:600,
                    border:active?'1.5px solid '+tint:'1px solid var(--border)',
                    background:active?(m==='Incentive'?'rgba(74,158,255,0.1)':'rgba(47,95,224,0.12)'):'var(--bg3)',
                    color:active?tint:'var(--text3)'}
                },(m==='Incentive'?'💰 ':'🏦 ')+m);
              })
            )
          )
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowRequestModal(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:submitRequest},'Submit Request')
        )
      )
    ),

    // ── Approve request modal ──
    showApproveModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowApproveModal(null)},
      React.createElement('div',{className:'modal',style:{width:520},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Approve Advance Request'),
        React.createElement('div',{style:{fontSize:13,color:'var(--text2)',marginBottom:14}},
          React.createElement('b',null,showApproveModal.emp),' requested ₹'+showApproveModal.amount.toLocaleString('en-IN')+' on '+showApproveModal.date+(showApproveModal.reason?' — '+showApproveModal.reason:'')+'. Repayment terms: Deduction from Salary'+(showApproveModal.deductionStart?', starting '+showApproveModal.deductionStart:'')+'.'
        ),
        ASM_LIST.length===0
          ?React.createElement('div',{style:{background:'rgba(255,107,107,0.08)',border:'1px solid rgba(255,107,107,0.2)',borderRadius:'var(--r)',padding:'10px 12px',marginBottom:14,fontSize:12,color:'var(--red)'}},
            'No employee with the "Assist Manager" designation was found. Add or assign an ASM via Master Salary Sheet before approving requests.'
          ):React.createElement(React.Fragment,null,
            React.createElement('div',{className:'form-row cols2'},
              React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-70'},'Approving ASM *'),React.createElement('select',{id:'f-70',className:'form-control',value:approveForm.approverId,onChange:e=>setApproveForm(f=>({...f,approverId:e.target.value}))},ASM_LIST.map(e=>React.createElement('option',{key:e.id,value:e.id},e.name)))),
              React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-71'},'Monthly Salary Deduction (₹)'),React.createElement('input',{id:'f-71',type:'number',className:'form-control',value:approveForm.repayment,onChange:e=>setApproveForm(f=>({...f,repayment:e.target.value}))}))
            ),
            React.createElement('div',{className:'form-row'},
              React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-72'},'Remarks (optional)'),React.createElement('input',{id:'f-72',className:'form-control',value:approveForm.remarks,onChange:e=>setApproveForm(f=>({...f,remarks:e.target.value})),placeholder:'Approval remarks'}))
            )
          ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowApproveModal(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',disabled:ASM_LIST.length===0,onClick:confirmApprove},'✓ Approve as ASM')
        )
      )
    )
  );
}

function PenaltySheet({period,salon}={}){
  const _today=new Date();
  const _initCal=periodToCalendar(period);
  const attMonth=_initCal?_initCal.month:_today.getMonth();
  const attYear=_initCal?_initCal.year:_today.getFullYear();
  const [syncTick,setSyncTick]=useState(0);
  const {success,error:penError}=useToast();
  const penIsLocked=(dateStr)=>{
    const p=String(dateStr||'').split('-');
    if(p.length!==3)return false;
    return isMonthLockedFor(salon?.id,Number(p[0]),Number(p[1])-1);
  };
  const penBlockIfLocked=(dateStr)=>{
    if(!penIsLocked(dateStr))return false;
    penError('That month is locked — nobody can change it while it is locked. A Super Admin can unlock it, with a reason (Salary Working, Master Sheet → Months, or un-finalize the P&L).');
    return true;
  };
  const EMPLOYEES=getEmployeesForMonth(attYear,attMonth,salon?.id);
  const syncEmployees=()=>{setSyncTick(t=>t+1);success('Synced '+getEmployeesForMonth(attYear,attMonth,salon?.id).length+' employees from Attendance');};
  const BLANK={id:'',emp:'',date:localTodayIso(),type:'Late arrival',otherType:'',amount:'',approvedBy:'',recoveryMode:'Salary',month:new Date().toLocaleString('en-IN',{month:'long',year:'numeric'}),remarks:''};
  const PENALTY_TYPES=['Late arrival','Absent without notice','Uniform violation','Misconduct','Damage to property','Mobile phone misuse','Customer complaint','Other'];
  const RECOVERY_MODES=['Bank','Salary','Incentives'];
  const penSalonId=salon?.id;
  const penKey=()=>outletKey('salonos_penalties',penSalonId);
  const PENALTIES_SEED_FINGERPRINTS=new Set([
    'P001|Kavya Reddy|2024-01-08|500|Late arrival',
    'P002|Arjun Singh|2024-01-15|200|Uniform violation',
    'P003|Pooja Patel|2024-01-22|1000|Absent without notice'
  ]);
  const [penalties,setPenalties]=useState(()=>{
    try{
      const raw=cachedLocalGet(penKey());
      if(raw!==null){
        const p=JSON.parse(raw);
        if(Array.isArray(p))return p.filter(x=>!PENALTIES_SEED_FINGERPRINTS.has([x.id,x.emp,x.date,x.amount,x.type].join('|')));
      }
    }catch(e){}
    return [];
  });
  useEffect(()=>{safeLocalSet(penKey(),JSON.stringify(penalties));},[penalties,penSalonId]);
  const [showModal,setShowModal]=useState(false);
  const [editItem,setEditItem]=useState(null);
  const [form,setForm]=useState(BLANK);
  const [showDelete,setShowDelete]=useState(null);
  const PEN_FILTER_COLS=[
    {key:'id',label:'ID',get:p=>p.id},
    {key:'emp',label:'Employee',get:p=>p.emp},
    {key:'date',label:'Date',get:p=>p.date||'(blank)'},
    {key:'type',label:'Type',get:p=>p.type==='Other'&&p.otherType?p.otherType:p.type},
    {key:'amount',label:'Amount',get:p=>rupee(Number(p.amount))}
  ];
  const penFilters=useExcelColumnFilter(penalties,PEN_FILTER_COLS);
  const penWrapRef=useRef(null);
  const penCellRange=useExcelCellRange(penWrapRef);
  const fc=(k)=>(e)=>setForm(f=>({...f,[k]:e.target.value}));
  const nextId=()=>nextPrefixedId(penalties,'P',3);
  const openAdd=()=>{setForm(BLANK);setEditItem(null);setShowModal(true);};
  const openEdit=(p)=>{if(penBlockIfLocked(p.date))return;setForm({...p,amount:String(p.amount)});setEditItem(p);setShowModal(true);};
  const save=()=>{
    if(penBlockIfLocked(form.date))return;
    if(!form.emp||!form.amount){alert('Employee and amount are required.');return;}
    if(form.type==='Other'&&!form.otherType.trim()){alert('Please specify the penalty type.');return;}
    const item={...form,id:form.id||nextId(),amount:Number(form.amount)};
    if(editItem)setPenalties(prev=>prev.map(p=>p.id===item.id?item:p));
    else setPenalties(prev=>[...prev,item]);
    setShowModal(false);
  };
  const totalPenalties=penalties.reduce((s,p)=>s+Number(p.amount),0);
  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,React.createElement('div',{className:'page-title'},'Penalty on Employees'),React.createElement('div',{className:'page-sub'},'Disciplinary deduction register')),
      React.createElement('div',{style:{display:'flex',gap:8}},
        React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},onClick:async()=>{
          const hdr=['ID','Employee','Date','Type','Amount','Approved By','Mode of Recovery','Month','Remarks'];
          const rows=penalties.map(p=>[p.id,p.emp,p.date||'',p.type==='Other'&&p.otherType?p.otherType:p.type,Number(p.amount)||0,p.approvedBy||'',p.recoveryMode||'',p.month||'',p.remarks||'']);
          const sheetRows=[hdr,...rows,['Total','','','',totalPenalties,'','','','']];
          try{
            const blob=await exportReportExcelBlob('Penalties — '+(salon?.name||'Outlet'),sheetRows);
            const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Penalties_'+(salon?salon.name.split('—')[0].trim().replace(/\s+/g,'_'):'Outlet')+'.xlsx';a.click();URL.revokeObjectURL(url);
            success('Excel exported — colour-coded, with a live total row.');
          }catch(err){penError(err.message||'Could not build the Excel file — please try again.');}
        }},'⬇ Export Excel'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:syncEmployees},'⟳ Sync Employees from Attendance'),
        React.createElement('button',{className:'btn btn-primary btn-sm',onClick:openAdd},'+ Add Penalty')
      )
    ),
    React.createElement('div',{className:'grid3',style:{marginBottom:16}},
      [{label:'Total Penalties',val:penalties.length,color:'red'},{label:'Total Amount Deducted',val:rupee(totalPenalties),color:'amber'},{label:'This Month',val:penalties.filter(p=>p.month.includes('Jan 2024')).length,color:'blue'}].map(m=>
        React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},React.createElement('div',{className:'metric-label'},m.label),React.createElement('div',{className:'metric-value'},m.val))
      )
    ),
    React.createElement('div',{className:'card'},
      penalties.length===0
        ?React.createElement('div',{style:{textAlign:'center',padding:32,color:'var(--text3)'}},'No penalties recorded. Click + Add Penalty to begin.')
        :React.createElement('div',null,
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:8}},'Click a cell — or drag across several — then Ctrl/Cmd+C to copy, just like Excel.'),
          React.createElement('div',{className:'table-wrap',ref:penWrapRef},
          React.createElement('table',null,
            React.createElement('thead',null,React.createElement('tr',null,
              penFilters.TH(PEN_FILTER_COLS[0]),penFilters.TH(PEN_FILTER_COLS[1]),penFilters.TH(PEN_FILTER_COLS[2]),penFilters.TH(PEN_FILTER_COLS[3]),penFilters.TH(PEN_FILTER_COLS[4]),
              React.createElement('th',{key:'approvedBy'},'Approved By'),React.createElement('th',{key:'month'},'Month'),React.createElement('th',{key:'remarks'},'Remarks'),React.createElement('th',{key:'actions'},'Actions')
            )),
            React.createElement('tbody',null,penFilters.filteredRows.map((p,ri)=>{
              const sel=(c)=>penCellRange.isSelected(ri,c)?'rgba(47,95,224,0.12)':undefined;
              return React.createElement('tr',{key:p.id},
                React.createElement('td',{'data-xr':ri,'data-xc':0,style:{background:sel(0)}},React.createElement('span',{style:{fontFamily:'monospace',fontSize:11,color:'var(--red)'}},p.id)),
                React.createElement('td',{'data-xr':ri,'data-xc':1,style:{background:sel(1)}},React.createElement('span',{style:{fontWeight:500,color:'var(--text)'}},p.emp)),
                React.createElement('td',{'data-xr':ri,'data-xc':2,style:{background:sel(2)}},p.date),
                React.createElement('td',{'data-xr':ri,'data-xc':3,style:{background:sel(3)}},React.createElement('span',{className:'badge badge-red'},p.type==='Other'&&p.otherType?p.otherType:p.type)),
                React.createElement('td',{'data-xr':ri,'data-xc':4,style:{background:sel(4)}},React.createElement('span',{style:{color:'var(--red)',fontWeight:600}},rupee(Number(p.amount)))),
                React.createElement('td',null,p.approvedBy),
                React.createElement('td',null,p.month),
                React.createElement('td',null,p.remarks),
                React.createElement('td',null,
                  React.createElement('div',{style:{display:'flex',gap:4}},
                    React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>openEdit(p)},'Edit'),
                    React.createElement('button',{'aria-label':'Delete',className:'btn btn-sm',style:{background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.3)',color:'var(--red)',padding:'4px 8px',borderRadius:'var(--r)',cursor:'pointer',fontSize:11},onClick:()=>setShowDelete(p)},React.createElement(IconTrash,{size:14}))
                  )
                )
              );
            }))
          )
        ),
        penFilters.Portal(),
        penCellRange.Toolbar()
        )
    ),
    showModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowModal(false)},
      React.createElement('div',{className:'modal',style:{width:540},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},editItem?'Edit Penalty':'Add Penalty'),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-73'},'Employee *'),React.createElement('select',{id:'f-73',className:'form-control',value:form.emp,onChange:fc('emp')},React.createElement('option',{value:''},'— Select —'),EMPLOYEES.map(e=>React.createElement('option',{key:e.id,value:e.name},e.name)))),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-74'},'Date'),React.createElement('input',{id:'f-74',type:'date',className:'form-control',value:form.date,onChange:fc('date')}))
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-75'},'Penalty Type'),React.createElement('select',{id:'f-75',className:'form-control',value:form.type,onChange:fc('type')},PENALTY_TYPES.map(t=>React.createElement('option',{key:t},t)))),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-76'},'Amount (₹) *'),React.createElement('input',{id:'f-76',type:'number',className:'form-control',value:form.amount,onChange:fc('amount'),placeholder:'0'}))
        ),
        form.type==='Other'&&React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-75b'},'Specify Penalty Type *'),React.createElement('input',{id:'f-75b',className:'form-control',value:form.otherType,onChange:fc('otherType'),placeholder:'e.g. Left workstation unattended'})),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-77'},'Approved By'),React.createElement('input',{id:'f-77',className:'form-control',value:form.approvedBy,onChange:fc('approvedBy'),placeholder:'Manager name'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-78'},'Deduction Month'),React.createElement('input',{id:'f-78',className:'form-control',value:form.month,onChange:fc('month'),placeholder:'e.g. Jan 2024'}))
        ),
        React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-80'},'Mode of Recovery'),React.createElement('select',{id:'f-80',className:'form-control',value:form.recoveryMode,onChange:fc('recoveryMode')},RECOVERY_MODES.map(m=>React.createElement('option',{key:m},m)))),
        React.createElement('div',{className:'form-group',style:{marginBottom:14}},React.createElement('label',{htmlFor:'f-79'},'Remarks'),React.createElement('input',{id:'f-79',className:'form-control',value:form.remarks,onChange:fc('remarks'),placeholder:'Additional notes'})),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowModal(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:save},editItem?'Save Changes':'Add Penalty')
        )
      )
    ),
    showDelete&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowDelete(null)},
      React.createElement('div',{className:'modal',style:{width:400},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title',style:{color:'var(--red)'}},'Delete Penalty'),
        React.createElement('div',{style:{fontSize:13,color:'var(--text2)',marginBottom:20}},'Delete penalty record for ',React.createElement('b',null,showDelete.emp),'? This cannot be undone.'),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowDelete(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-danger',onClick:()=>{if(penBlockIfLocked(showDelete.date))return;setPenalties(prev=>prev.filter(p=>p.id!==showDelete.id));setShowDelete(null);}},'Delete')
        )
      )
    )
  );
}

// Common TDS sections under the Income Tax Act relevant to a salon business's typical vendor/
// recurring payments — standard rate shown is a starting point (auto-filled, always editable,
// since actual applicable rate can vary — e.g. no-PAN cases attract a higher rate).
// ── Old Act (Income-tax Act, 1961) — applies to deductions before 1 April 2026. 194H's rate was
// cut from 5% to 2% by Finance Act 2024, effective 1 Oct 2024 — reflected here since that change
// predates the new Act and applies regardless of which Act is otherwise in force. ──
const TDS_SECTIONS_OLD=[
  {code:'194C',label:'194C — Payment to Contractors',rate:2},
  {code:'194J',label:'194J — Professional / Technical Services',rate:10},
  {code:'194H',label:'194H — Commission or Brokerage',rate:2},
  {code:'194I(a)',label:'194I(a) — Rent (Plant & Machinery)',rate:2},
  {code:'194I(b)',label:'194I(b) — Rent (Land / Building / Furniture)',rate:10},
  {code:'194Q',label:'194Q — Purchase of Goods',rate:0.1},
  {code:'194A',label:'194A — Interest (other than securities)',rate:10},
  {code:'Other',label:'Other',rate:''},
];
// ── New Act (Income-tax Act, 2025) — applies to deductions from 1 April 2026 onward. The old
// 194-series sections are consolidated into Section 393, identified by a 4-digit payment code
// instead of a section letter; rates and thresholds carry over unchanged, only the identifier
// changes. Payment codes below are the commonly-cited indicative mapping pending final CBDT
// notification — confirm against the notified list before relying on these for an actual filing. ──
const TDS_SECTIONS_NEW=[
  {code:'393-1024',label:'Payment Code 1024 — Contractor Payments (§393(1) Sl.6(i)) · was 194C',rate:2},
  {code:'393-1027',label:'Payment Code 1027 — Professional Services (§393(1) Sl.6(iii)) · was 194J',rate:10},
  {code:'393-1026',label:'Payment Code 1026 — Technical Services (§393(1) Sl.6(iii)) · was 194J',rate:2},
  {code:'393-1006',label:'Payment Code 1006 — Commission or Brokerage (§393(1) Sl.1(ii)) · was 194H',rate:2},
  {code:'393-1008',label:'Payment Code 1008 — Rent, Plant & Machinery (§393(1) Sl.2(ii)) · was 194I(a)',rate:2},
  {code:'393-1009',label:'Payment Code 1009 — Rent, Land / Building / Furniture (§393(1) Sl.2(ii)) · was 194I(b)',rate:10},
  {code:'393-1031',label:'Payment Code 1031 — Purchase of Goods (§393(1) Sl.8(ii)) · was 194Q',rate:0.1},
  {code:'393-1022',label:'Payment Code 1022 — Interest, other than securities (§393(1) Sl.5) · was 194A',rate:10},
  {code:'Other',label:'Other',rate:''},
];
const TDS_ACT_CUTOVER_ISO='2026-04-01'; // Income-tax Act, 2025 came into force on this date
// Which section list applies for a given date — pass the date the TDS is actually being
// deducted on (defaults to today, i.e. "currently applicable", same convention as
// gstInputAllowedAsOf uses for the GST Input Credit cutoff elsewhere in this file).
function tdsSectionsAsOf(dateIso){
  const d=dateIso||localTodayIso();
  return d>=TDS_ACT_CUTOVER_ISO?TDS_SECTIONS_NEW:TDS_SECTIONS_OLD;
}
// Backward-compat alias — a few older call sites reference TDS_SECTIONS directly; keep it
// pointing at whichever list is currently applicable so nothing silently reverts to stale law.
const TDS_SECTIONS=tdsSectionsAsOf();
// TDS Amount for one recurring-expense-style record ({amount, tdsApplicable, tdsRate}) — per
// CBDT Circular 23/2017, TDS is computed on the amount EXCLUDING GST when GST is shown
// separately on the invoice, so this uses the Taxable/Base Amount, never the GST-inclusive
// Invoice Value.
function tdsAmountOf(it){
  if(!it||!it.tdsApplicable)return 0;
  const base=Number(it.amount)||0;
  const rate=Number(it.tdsRate)||0;
  return Math.round(base*rate/100);
}
function VendorSheet({salon,period,pendingVendorCategory,pendingVendorPaymentDate,onConsumePendingVendorCategory}={}){
  const salonId=salon?.id;
  const BLANK_V={id:'',name:'',address:'',gst:'',cat:defaultVendorCategoryFor(salonId),contact:'',phone:'',terms:'30 days',status:'Active',tdsApplicable:false,tdsSection:'',tdsRate:'',
    bankName:'',accountNo:'',ifsc:'',accountHolder:'',email:''};
  const BLANK_INV={periodFrom:'',periodTo:'',splitFirst:'',vendorId:'',invoiceNo:'',invoiceDate:'',amount:'',dueDate:'',desc:'',attachment:null,docNature:'Tax Invoice',bookingDate:'',igst:'',cgst:'',sgst:'',roundOff:'',freight:'',linkedPI:'',category:'',assetLines:[],
    newVendorName:'',newVendorGst:'',newVendorPhone:'',newVendorTerms:'30 days'}; // new* = "+ Add New Vendor" from the invoice form
  const BLANK_PAY={invoiceId:null,editingPaymentId:null,paidAmount:'',paidDate:localTodayIso(),mode:'NEFT',ref:'',note:'',fromDailySales:false};

  const [vendors,setVendors]=useState(()=>loadVendors(salonId));
  useEffect(()=>{saveVendors(vendors,salonId);},[vendors,salonId]);
  const {success:toastSuccess,error:toastError,toast:invToast}=useToast();
  const vendIsLocked=(dateStr)=>{
    const p=String(dateStr||'').split('-');
    if(p.length!==3)return false;
    return isMonthLockedFor(salonId,Number(p[0]),Number(p[1])-1);
  };
  const vendBlockIfLocked=(dateStr)=>{
    if(!vendIsLocked(dateStr))return false;
    toastError('That month is locked — nobody can change it while it is locked. A Super Admin can unlock it, with a reason (Salary Working, Master Sheet → Months, or un-finalize the P&L).');
    return true;
  };

  // invoices: [{vendorId,invoiceNo,invoiceDate,amount,dueDate,desc,attachment,payments:[{paidAmount,paidDate,mode,ref,note}]}]
  const DEFAULT_INVOICES=[
    {vendorId:'V001',invoiceNo:'LOI-2024-001',invoiceDate:'2024-01-05',amount:45000,dueDate:'2024-02-04',desc:'Hair care products – Jan batch',attachment:null,docNature:'Tax Invoice',bookingDate:'2024-01-05',igst:'',cgst:'',sgst:'',roundOff:'',linkedPI:'',payments:[]},
    {vendorId:'V002',invoiceNo:'WP-2024-011',invoiceDate:'2024-01-10',amount:12000,dueDate:'2024-02-24',desc:'Wella color range',attachment:null,docNature:'Tax Invoice',bookingDate:'2024-01-10',igst:'',cgst:'',sgst:'',roundOff:'',linkedPI:'',payments:[]},
    {vendorId:'V003',invoiceNo:'SC-2024-003',invoiceDate:'2024-01-12',amount:8500,dueDate:'2024-01-27',desc:'Monthly housekeeping Jan',attachment:null,docNature:'Tax Invoice',bookingDate:'2024-01-12',igst:'',cgst:'',sgst:'',roundOff:'',linkedPI:'',payments:[{paidAmount:8500,paidDate:'2024-01-26',mode:'NEFT',ref:'TXN2024012601',note:'Cleared'}]},
    {vendorId:'V004',invoiceNo:'TF-2024-007',invoiceDate:'2024-01-15',amount:28000,dueDate:'2024-03-15',desc:'AC servicing + chair repair',attachment:null,docNature:'Tax Invoice',bookingDate:'2024-01-15',igst:'',cgst:'',sgst:'',roundOff:'',linkedPI:'',payments:[]},
  ];
  const [invoices,setInvoices]=useState(()=>loadVendorInvoices(salonId));
  useEffect(()=>{saveVendorInvoices(invoices,salonId);},[invoices,salonId]);

  const [tab,setTab]=useState('invoices');
  const [invView,setInvView]=useState('all'); // all | month | pending | pendingMonth          // 'master' | 'invoices' | 'outstanding' | 'performa' | 'dashboard'
  // Daily Sales & Exp signals here after a payment entry on a category-gated row (e.g.
  // Maintenance Expenses) — jump straight to that invoice's Record Payment modal so it can be
  // marked paid immediately, instead of leaving the person to go find it manually.
  useEffect(()=>{
    if(!pendingVendorCategory)return;
    const match=invoices.find(inv=>inv.docNature!=='Performa Invoice'&&(inv.category||'')===pendingVendorCategory&&(Number(inv.amount)-(inv.payments||[]).reduce((s,p)=>s+Number(p.paidAmount||0),0))>0);
    if(match){
      const bal=Number(match.amount)-(match.payments||[]).reduce((s,p)=>s+Number(p.paidAmount||0),0);
      // Mode:'Cash' — this trigger only ever fires from a Daily Sales & Exp payment entry, and
      // that sheet is the cash register, so the payment behind it is genuinely cash, not the
      // generic 'NEFT' default this form normally opens with. paidDate likewise comes from the
      // actual day column that was entered on Daily Sales & Exp, not today's real-world date —
      // falls back to BLANK_PAY's today-default only if somehow not provided.
      setPayForm({...BLANK_PAY,invoiceId:match.id,paidAmount:bal,mode:'Cash',fromDailySales:true,...(pendingVendorPaymentDate?{paidDate:pendingVendorPaymentDate}:{})});
      setShowPayModal(true);
    }
    setTab('outstanding');
    if(onConsumePendingVendorCategory)onConsumePendingVendorCategory();
  },[pendingVendorCategory,pendingVendorPaymentDate]);
  const [showVendorModal,setShowVendorModal]=useState(false);
  const [showVendorList,setShowVendorList]=useState(false); // 📋 Vendors list with Edit per vendor
  const [vlQ,setVlQ]=useState('');
  const [showInvModal,setShowInvModal]=useState(false);
  const [editInvoiceId,setEditInvoiceId]=useState(null); // null = adding new, string = editing the invoice with this id
  const [showIntake,setShowIntake]=useState(false);
  const [intakeInitial,setIntakeInitial]=useState(null); // {ai, attachment, draftId} — a bill from the WhatsApp inbox
  const [showWaInbox,setShowWaInbox]=useState(false);
  const waNew=waInboxLoad(salonId).filter(x=>x.status==='new').length;
  const [bulkImportResult,setBulkImportResult]=useState(null);
  const bulkFileRef=useRef(null);
  const [bulkBusy,setBulkBusy]=useState(false);
  const [showPayModal,setShowPayModal]=useState(false);
  const [showViewModal,setShowViewModal]=useState(false);
  const [editVendor,setEditVendor]=useState(null);  // null=add, obj=edit
  const [vForm,setVForm]=useState(BLANK_V);
  const [invForm,setInvForm]=useState(BLANK_INV);
  const [payForm,setPayForm]=useState(BLANK_PAY);
  // ── Match a payment against a Bank Statement debit transaction, so recording a payment can
  // auto-fill from what actually left the account instead of being typed in from scratch. ──
  const [bankRows,setBankRows]=useState(()=>loadBankStatementRows(salonId));
  const refreshBankRows=()=>setBankRows(loadBankStatementRows(salonId));
  const [matchedBankRowId,setMatchedBankRowId]=useState(null);
  const applyBankMatch=(row,invId)=>{
    const inv=invoices.find(x=>x.id===invId);
    if(!inv)return;
    const bal=Number(inv.amount)-inv.payments.reduce((s,p)=>s+Number(p.paidAmount),0);
    setPayForm(f=>({...f,paidAmount:String(row.debit||bal),paidDate:toISODate(row.transactionDate),mode:'Bank Transfer',ref:row.refNo||''}));
    setMatchedBankRowId(row.id);
  };
  const toISODate=(dmy)=>{const m=String(dmy||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):localTodayIso();};
  const [viewInv,setViewInv]=useState(null);
  // Actively asks "is this Tax Invoice against a pending PI?" whenever the selected vendor has
  // one open — rather than leaving it as an easy-to-miss optional dropdown.
  const [piPrompt,setPiPrompt]=useState('no'); // 'unanswered' | 'yes' | 'no'
  useEffect(()=>{
    if(!showInvModal)return;
    if(invForm.docNature==='Performa Invoice'){setPiPrompt('no');return;}
    if(editInvoiceId!==null){setPiPrompt(invForm.linkedPI?'yes':'no');return;}
    const openPIsForVendor=invoices.filter(inv=>inv.docNature==='Performa Invoice'&&inv.vendorId===invForm.vendorId&&isPIOpen(inv));
    setPiPrompt(invForm.vendorId&&openPIsForVendor.length>0?'unanswered':'no');
    // eslint-disable-next-line
  },[invForm.vendorId,invForm.docNature,showInvModal,editInvoiceId]);
  const [filterVendor,setFilterVendor]=useState('');
  const [vendorSearch,setVendorSearch]=useState('');
  const [outstandingSearch,setOutstandingSearch]=useState('');
  const [performaSearch,setPerformaSearch]=useState('');
  const [search,setSearch]=useState('');

  const vc=(k)=>(e)=>setVForm(f=>({...f,[k]:e.target.value}));
  const vcCheck=(k)=>(e)=>setVForm(f=>({...f,[k]:e.target.checked}));
  const ic=(k)=>(e)=>setInvForm(f=>({...f,[k]:e.target.value}));
  // IGST vs CGST+SGST from the outlet's and the chosen vendor's GSTIN state codes.
  const invVendorGst=invForm.vendorId==='__new__'?invForm.newVendorGst:((vendors.find(v=>v.id===invForm.vendorId)||{}).gst);
  const invSupply=gstSupplyTypeFor(salonId,invVendorGst);
  useEffect(()=>{if(invSupply)setInvForm(f=>{const g=gstFieldsForSupply(f,invSupply);return g===f?f:g;});},[invSupply]);
  // ── Fixed Assets — a single invoice can cover several distinct assets (e.g. chairs + mirror +
  // reception desk on one bill), each of which needs its own name and amount so it can later be
  // assigned its own depreciation Block (Depreciation tab) — a single "Asset Name" field can't
  // represent that. assetLines is the array; each line gets its own stable id so the Depreciation
  // tab can assign each one a Block independently, keyed off invoice id + line id together.
  const nextAssetLineId=(lines)=>'AL'+(Math.max(0,...lines.map(l=>Number(String(l.id||'').replace('AL',''))||0))+1);
  const addAssetLine=()=>setInvForm(f=>({...f,assetLines:[...(f.assetLines&&f.assetLines.length?f.assetLines:[]),{id:nextAssetLineId(f.assetLines||[]),name:'',amount:''}]}));
  const updateAssetLine=(id,key,val)=>setInvForm(f=>({...f,assetLines:(f.assetLines||[]).map(l=>l.id===id?{...l,[key]:val}:l)}));
  const removeAssetLine=(id)=>{if(confirm('Remove this asset line?'))setInvForm(f=>({...f,assetLines:(f.assetLines||[]).filter(l=>l.id!==id)}));};
  const pc=(k)=>(e)=>setPayForm(f=>({...f,[k]:e.target.value}));
  const nextVid=()=>nextPrefixedId(vendors,'V',3);

  const saveVendor=()=>{
    if(!(vForm.name||'').trim()){alert('Vendor name is required');return;}
    const sameName=vendors.find(v=>v.name.trim().toLowerCase()===vForm.name.trim().toLowerCase()&&(!editVendor||v.id!==editVendor.id));
    if(sameName){alert('A vendor named "'+sameName.name+'" already exists ('+sameName.id+').');return;}
    if(!confirmIdFields({gst:vForm.gst,phone:vForm.phone,email:vForm.email,accountNo:vForm.accountNo,ifsc:vForm.ifsc,bankName:vForm.bankName},'the vendor details',salonId))return;
    if(editVendor&&!vendorBankChangeOk(salonId,vendors.find(v=>v.id===editVendor.id)||editVendor,vForm))return;
    // Edits are matched on the vendor's original ID (invoices, payments and bank links point to it),
    // so the ID itself can't change here — it used to, and then nothing was saved at all.
    if(editVendor){setVendors(prev=>prev.map(v=>v.id===editVendor.id?{...v,...vForm,id:editVendor.id}:v));toastSuccess('Vendor "'+vForm.name.trim()+'" updated.');}
    else{setVendors(prev=>[...prev,{...vForm,id:vForm.id||nextVid()}]);}
    setShowVendorModal(false);setVForm(BLANK_V);setEditVendor(null);
  };
  const openEditVendor=(v)=>{setVForm({...BLANK_V,...v});setEditVendor(v);setShowVendorModal(true);};
  // A vendor with bills can't be deleted — the invoices, payments and ledger point to it; set it
  // Inactive instead. One with no bills is deleted after a confirmation.
  const deleteVendor=(id)=>{
    const v=vendors.find(x=>x.id===id);if(!v)return;
    const n=invoices.filter(i=>String(i.vendorId)===String(id)).length;
    if(n){window.alert('"'+v.name+'" has '+n+' invoice'+(n===1?'':'s')+' entered, so it cannot be deleted (its bills and payments would lose their vendor). Edit it and set Status to Inactive instead.');return;}
    if(!window.confirm('Delete vendor "'+v.name+'" ('+v.id+')? This cannot be undone.'))return;
    setVendors(prev=>prev.filter(x=>x.id!==id));
    try{logAuditEvent(salonId,{entity:'Vendor',entityId:id,action:'Deleted',summary:v.name});}catch(e){}
    toastSuccess('Vendor "'+v.name+'" deleted.');
  };

  // ── Bulk import — download a template, fill it in Excel, upload it back to add many invoices
  // at once instead of one at a time. Vendor is matched by name against the Vendor List (exact
  // match first, then a loose contains-match); rows that can't be matched, or are missing
  // Invoice No / Invoice Total / Category, are skipped and reported rather than guessed at. ──
  const CATEGORY_OPTIONS=withBizCategories(['Purchase of Cosmetic','Housekeeping','Equipment','Utilities','Rent','DG Rent','Drycleaning Expenses','Professional Fee','Staff Room Rent','Royalty','Electricity Expenses','Uniform Expenses','Telephone & Internet Expenses','Maintenance Expenses','Marketing','Other'],salonId);
  const downloadInvoiceTemplate=async()=>{
    await loadScript(CDN_XLSX_URL);
    if(!window.XLSX){toastError('Excel engine unavailable — check your internet connection.');return;}
    const headers=['Vendor Name','Doc Nature','Invoice No','Invoice Date (DD/MM/YYYY)','Due Date (DD/MM/YYYY)','Booking Date (DD/MM/YYYY)','Taxable Value','IGST','CGST','SGST','Round Off','Invoice Total','Category','Description'];
    const sampleVendor=vendors[0]?vendors[0].name:'NAMA VENTURES';
    const sample=[sampleVendor,'Tax Invoice','INV-2026-001','07/05/2026','06/06/2026','07/05/2026',3237,0,81.5,81.5,0,3400,'Purchase of Cosmetic','Backbar stock — May batch'];
    const note=['Must match a name in your Vendor List exactly (or closely)','Tax Invoice / Invoice / Performa Invoice','Required','','','','','','','','','Required — the final invoice amount','Required — one of: '+CATEGORY_OPTIONS.join(' / '),'Optional'];
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet([headers,sample,[],note]);
    ws['!cols']=headers.map(()=>({wch:22}));
    XLSX.utils.book_append_sheet(wb,ws,'Invoices');
    const vendorNamesSheet=XLSX.utils.aoa_to_sheet([['Your Vendor List — copy exact names from here'],...vendors.map(v=>[v.name])]);
    vendorNamesSheet['!cols']=[{wch:40}];
    XLSX.utils.book_append_sheet(wb,vendorNamesSheet,'Vendor Names (reference)');
    XLSX.writeFile(wb,'Vendor_Invoice_Import_Template.xlsx');
    toastSuccess('Template downloaded');
  };
  const parseTemplateDate=(v)=>{
    if(!v)return'';
    if(v instanceof Date){v=excelCellDate(v);return String(v.getDate()).padStart(2,'0')+'/'+String(v.getMonth()+1).padStart(2,'0')+'/'+v.getFullYear();}
    return String(v).trim();
  };
  const matchVendorByName=(name)=>{
    const n=String(name||'').trim().toLowerCase();
    if(!n)return null;
    return vendors.find(v=>v.name.trim().toLowerCase()===n)
      ||vendors.find(v=>v.name.toLowerCase().includes(n)||n.includes(v.name.toLowerCase()));
  };
  const handleBulkImportFile=async(e)=>{
    const f=e.target.files&&e.target.files[0];
    if(!f)return;
    e.target.value='';
    setBulkBusy(true);
    try{
      await loadScript(CDN_XLSX_URL);
      if(!window.XLSX)throw new Error('Excel engine unavailable — check your internet connection.');
      const buf=await f.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array',cellDates:true});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const json=XLSX.utils.sheet_to_json(ws,{defval:''});
      const failed=[];
      const toAdd=[];
      json.forEach((row,idx)=>{
        const rowNum=idx+2;
        const vendorNameRaw=String(row['Vendor Name']||'').trim();
        if(!vendorNameRaw)return; // silently skip fully blank rows (e.g. trailing empty rows in the sheet)
        const vendor=matchVendorByName(vendorNameRaw);
        if(!vendor){failed.push('Row '+rowNum+': No vendor in your Vendor List matches "'+vendorNameRaw+'" — add the vendor first, or fix the spelling');return;}
        const invoiceNo=String(row['Invoice No']||'').trim();
        if(!invoiceNo){failed.push('Row '+rowNum+' ('+vendorNameRaw+'): Invoice No is required');return;}
        const amount=Math.round(Number(row['Invoice Total'])||0);
        if(amount<=0){failed.push('Row '+rowNum+' ('+vendorNameRaw+'): Invoice Total is missing or zero');return;}
        const category=String(row['Category']||'').trim();
        if(!CATEGORY_OPTIONS.includes(category)){failed.push('Row '+rowNum+' ('+vendorNameRaw+'): Category must be one of '+CATEGORY_OPTIONS.join(', '));return;}
        const docNature=['Tax Invoice','Invoice','Performa Invoice'].includes(row['Doc Nature'])?row['Doc Nature']:'Tax Invoice';
        const invoiceDate=parseTemplateDate(row['Invoice Date (DD/MM/YYYY)']||row['Invoice Date']);
        const dupInv=controlOn('dupInvoice',salonId)&&duplicateVendorInvoice([...invoices,...toAdd],vendor.id,invoiceNo,docNature,null);
        if(dupInv){failed.push('Row '+rowNum+' ('+vendorNameRaw+'): Invoice No. '+invoiceNo+' is already entered for this vendor — skipped');return;}
        if(controlOn('invoiceApproval',salonId)&&!isSuperAdminUser(currentSessionUser())&&amount>controlLimit('invoiceApproval')){failed.push('Row '+rowNum+' ('+vendorNameRaw+'): ₹'+amount.toLocaleString('en-IN')+' is above the approval limit — enter this bill on its own so it can be sent for approval');return;}
        toAdd.push({
          vendorId:vendor.id,docNature,invoiceNo,invoiceDate,
          dueDate:parseTemplateDate(row['Due Date (DD/MM/YYYY)']||row['Due Date']),
          bookingDate:parseTemplateDate(row['Booking Date (DD/MM/YYYY)']||row['Booking Date'])||invoiceDate,
          taxable:row['Taxable Value']||'',igst:row['IGST']||'',cgst:row['CGST']||'',sgst:row['SGST']||'',roundOff:row['Round Off']||'',
          amount,category,desc:String(row['Description']||''),attachment:null,linkedPI:'',payments:[]
        });
      });
      {const blocked=toAdd.filter(r=>!canBookInvoiceInMonth(invoiceBookMonthOf(r)));
       blocked.forEach(r=>failed.push((r.invoiceNo||'Invoice')+': '+invoiceMonthBlockMessage()));
       const okRows=toAdd.filter(r=>!blocked.includes(r));toAdd.length=0;toAdd.push(...okRows);}
      if(toAdd.length)setInvoices(prev=>[...prev,...toAdd]);
      setBulkImportResult({added:toAdd.length,failed,totalRows:json.length});
      if(toAdd.length&&!failed.length)toastSuccess(toAdd.length+' invoice'+(toAdd.length===1?'':'s')+' imported');
    }catch(err){toastError(err.message||'Could not read that file — make sure it matches the template');}
    setBulkBusy(false);
  };
  const saveInvoice=()=>{
    if(vendBlockIfLocked(invForm.bookingDate||invForm.invoiceDate))return;
    if(invSupply==='intra'&&Number(invForm.igst)){alert(gstSupplyNote('intra')+' Move the IGST amount into CGST and SGST.');return;}
    if(invSupply==='inter'&&(Number(invForm.cgst)||Number(invForm.sgst))){alert(gstSupplyNote('inter')+' Move the CGST/SGST amount into IGST.');return;}
    const computedTotal=(Number(invForm.taxable)||0)+(Number(invForm.igst)||0)+(Number(invForm.cgst)||0)+(Number(invForm.sgst)||0)+(Number(invForm.freight)||0)+(Number(invForm.roundOff)||0);
    if(!invForm.vendorId){alert('Select a vendor, or choose "+ Add New Vendor".');return;}
    if(invForm.vendorId==='__new__'&&!(invForm.newVendorName||'').trim()){alert('Enter the new vendor’s name.');return;}
    if(invForm.vendorId==='__new__'&&!confirmIdFields({gst:invForm.newVendorGst,phone:invForm.newVendorPhone},'the new vendor details',salonId))return;
    if(!invForm.docNature){alert('Select the Doc Nature.');return;}
    if(!(invForm.invoiceNo||'').trim()){alert((invForm.docNature==='Performa Invoice'?'PI':'Invoice / Voucher')+' No. is required.');return;}
    if(!invForm.invoiceDate){alert((invForm.docNature==='Performa Invoice'?'PI':'Invoice')+' Date is required.');return;}
    {const dupInv=invForm.vendorId!=='__new__'&&controlOn('dupInvoice',salonId)&&duplicateVendorInvoice(invoices,invForm.vendorId,invForm.invoiceNo,invForm.docNature,editInvoiceId);
     if(dupInv){alert(duplicateInvoiceMessage(dupInv,getVendorName(invForm.vendorId)));return;}}
    {const orig=editInvoiceId?invoices.find(i=>i.id===editInvoiceId):null;const ym=invoiceBookMonthOf(invForm);
     if((!orig||invoiceBookMonthOf(orig)!==ym)&&!canBookInvoiceInMonth(ym)){alert(invoiceMonthBlockMessage());return;}}
    if(!computedTotal){alert('Enter at least a Taxable Value.');return;}
    {const orig=editInvoiceId?invoices.find(i=>i.id===editInvoiceId):null;
     if(!invoiceApprovalOk(salonId,invForm.vendorId==='__new__'?'new:'+(invForm.newVendorName||''):invForm.vendorId,invForm.vendorId==='__new__'?invForm.newVendorName:getVendorName(invForm.vendorId),invForm.invoiceNo,computedTotal,orig?orig.amount:null))return;}
    if(outletSettings(salonId).attachmentRequired&&!invForm.attachment){alert('This outlet requires the document to be attached for every '+invForm.docNature+' — please attach it (📎 below) before saving.');return;}
    if(!invForm.category){alert('Please select a Category before saving.');return;}
    if(invForm.category==='Fixed Assets'){
      const lines=(invForm.assetLines||[]).filter(l=>(l.name||'').trim()||Number(l.amount)>0);
      if(!lines.length){alert('Please add at least one asset (name + amount) for this Fixed Assets invoice.');return;}
      const badLine=lines.find(l=>!(l.name||'').trim()||!(Number(l.amount)>0));
      if(badLine){alert('Every asset needs both a name and an amount greater than 0.');return;}
    }
    if(!invForm.desc||!invForm.desc.trim()){alert('Description is required');return;}
    if(invForm.docNature!=='Performa Invoice'&&editInvoiceId===null&&piPrompt==='unanswered'){alert('This vendor has a pending Performa Invoice — please answer whether this '+invForm.docNature+' is against it before saving.');return;}
    if(invForm.docNature!=='Performa Invoice'&&piPrompt==='yes'&&!invForm.linkedPI){alert('Select which Performa Invoice this '+invForm.docNature+' is booked against, or choose "No — standalone '+invForm.docNature+'" above.');return;}
    const amount=Math.round(computedTotal);
    const dmy=(iso)=>{const p=String(iso||'').split('-');return p.length===3&&p[0].length===4?p[2]+'/'+p[1]+'/'+p[0]:iso;};
    // "+ Add New Vendor": create the vendor (or reuse one with the same name) and book against it.
    let vendorId=invForm.vendorId;
    if(vendorId==='__new__'){
      const name=invForm.newVendorName.trim();
      const existing=vendors.find(v=>v.name.trim().toLowerCase()===name.toLowerCase());
      if(existing){vendorId=existing.id;toastSuccess('"'+existing.name+'" already exists — using that vendor.');}
      else{
        vendorId=nextPrefixedId(vendors,'V',3);
        setVendors(prev=>[...prev,{id:vendorId,name,address:'',gst:(invForm.newVendorGst||'').trim().toUpperCase(),cat:invForm.category||'Other',
          contact:'',phone:(invForm.newVendorPhone||'').trim(),terms:invForm.newVendorTerms||'30 days',status:'Active',tdsApplicable:false,tdsSection:'',tdsRate:''}]);
        toastSuccess('Vendor "'+name+'" added to the Master Vendor List.');
      }
    }
    const {newVendorName,newVendorGst,newVendorPhone,newVendorTerms,...invFields}=invForm;
    const savedInvoice={...invFields,enteredAt:invFields.enteredAt||new Date().toISOString(),vendorId,amount,invoiceDate:dmy(invForm.invoiceDate),bookingDate:dmy(invForm.bookingDate||invForm.invoiceDate),dueDate:dmy(invForm.dueDate)};
    setInvoices(prev=>{
      let next,targetIdx;
      if(editInvoiceId!==null){
        // An approval only covers the amount that was approved — changing the amount needs a new one.
        next=prev.map(inv=>inv.id===editInvoiceId?{...savedInvoice,id:inv.id,payments:inv.payments,approval:(inv.approval&&Math.abs((Number(inv.amount)||0)-amount)<0.5)?inv.approval:undefined}:inv);
        targetIdx=next.findIndex(inv=>inv.id===editInvoiceId);
      }else{
        next=[...prev,{...savedInvoice,id:nextPrefixedId(prev,'VI-',4),payments:[]}];
        targetIdx=next.length-1;
      }
      // If this Tax Invoice/Invoice is booked against a Performa Invoice that already had
      // payment(s) recorded directly on it — e.g. an advance paid before the Tax Invoice ever
      // arrived — move those payments across so the real payable (the Tax Invoice) carries them,
      // rather than leaving them stranded on what's now just a settled reference document.
      if(savedInvoice.docNature!=='Performa Invoice'&&savedInvoice.linkedPI){
        const piIdx=next.findIndex(inv=>inv.docNature==='Performa Invoice'&&(inv.vendorId+'|'+inv.invoiceNo)===savedInvoice.linkedPI);
        if(piIdx>=0&&piIdx!==targetIdx&&next[piIdx].payments&&next[piIdx].payments.length){
          const piPayments=next[piIdx].payments;
          const newKey=next[targetIdx].vendorId+'|'+next[targetIdx].invoiceNo;
          const bankLinkedIds=piPayments.filter(p=>p.linkId).map(p=>String(p.linkId).replace(/^bank-/,''));
          if(bankLinkedIds.length){
            const freshBankRows=loadBankStatementRows(salonId);
            const updatedBankRows=freshBankRows.map(r=>bankLinkedIds.includes(String(r.id))?{...r,linkedInvoice:newKey}:r);
            saveBankStatementRows(updatedBankRows,salonId);
            setBankRows(updatedBankRows);
          }
          next=next.map((inv,i)=>{
            if(i===piIdx)return{...inv,payments:[]};
            if(i===targetIdx)return{...inv,payments:[...piPayments,...inv.payments]};
            return inv;
          });
          const movedTotal=piPayments.reduce((s,p)=>s+Number(p.paidAmount),0);
          toastSuccess(piPayments.length+' payment'+(piPayments.length===1?'':'s')+' totalling ₹'+movedTotal.toLocaleString('en-IN')+' moved from the Performa Invoice to this '+savedInvoice.docNature+'.');
        }
      }
      return next;
    });
    const auditVendorName=(vendors.find(v=>v.id===savedInvoice.vendorId)||{}).name||savedInvoice.vendorId;
    logAuditEvent(salonId,{entity:'Vendor Invoice',entityId:editInvoiceId||savedInvoice.invoiceNo,action:editInvoiceId!==null?'Edited':'Added',summary:auditVendorName+' — '+(savedInvoice.invoiceNo||'no invoice #')+' — ₹'+amount.toLocaleString('en-IN')+' ('+savedInvoice.docNature+')'});
    setShowInvModal(false);setInvForm(BLANK_INV);setEditInvoiceId(null);
  };
  const editInvoice=(id)=>{
    const inv=invoices.find(x=>x.id===id);
    if(!inv)return;
    if(vendBlockIfLocked(inv.bookingDate||inv.invoiceDate))return;
    setEditInvoiceId(id);
    // <input type="date"> requires ISO (YYYY-MM-DD); invoices saved via the Daily Sales & Exp.
    // "create invoice" popup store DD/MM/YYYY instead, which the date input can't display and
    // would silently show blank. Normalize whichever format is on file before populating the form.
    const toISO=(d)=>{const p=String(d||'').split('/');return p.length===3?p[2]+'-'+p[1]+'-'+p[0]:d;};
    setInvForm({...BLANK_INV,...inv,amount:String(inv.amount),invoiceDate:toISO(inv.invoiceDate),bookingDate:toISO(inv.bookingDate||inv.invoiceDate),dueDate:toISO(inv.dueDate),
      assetLines:(inv.assetLines&&inv.assetLines.length)?inv.assetLines:(inv.assetName?[{id:'AL1',name:inv.assetName,amount:String(inv.amount||'')}]:[])});
    setShowInvModal(true);
  };
  const deleteInvoice=(id)=>{
    const inv=invoices.find(x=>x.id===id);
    if(!inv)return;
    if(vendBlockIfLocked(inv.bookingDate||inv.invoiceDate))return;
    if(!confirm('Delete invoice '+(inv.invoiceNo||'(no number)')+' for '+getVendorName(inv.vendorId)+'? This also removes any payments recorded against it, and clears the amount from Daily Sales & Exp if it was recorded from there.'))return;
    // Any payment(s) that came from Daily Sales & Exp need clearing back out there too, or the
    // amount is left sitting on that sheet with no invoice or payment behind it anymore.
    (inv.payments||[]).filter(p=>p.note==='Auto-recorded from Daily Sales & Exp').forEach(p=>clearDsePaymentAmountFor(salonId,inv.category,p.paidDate,p.paidAmount));
    setInvoices(prev=>prev.filter(x=>x.id!==id));
  };

  // ── Bulk actions — select several invoices at once and either mark them Paid in Full (each
  // gets a real payment entry for its own current balance — no shared amount to type in, since
  // "in full" is unambiguous per invoice) or delete them. Performa Invoices and already-cleared
  // invoices are skipped by "Mark Paid" since neither has a real balance to pay against; they
  // stay selectable for bulk delete. Delete uses the same Undo-toast pattern as Employee Master
  // and Recurring Expenses. ──
  const [bulkSelectedIds,setBulkSelectedIds]=useState(()=>new Set());
  const toggleBulkSelect=(id)=>setBulkSelectedIds(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});
  const bulkMarkPaidInFull=()=>{
    const ids=bulkSelectedIds;
    const today=localTodayIso();
    const eligible=invoices.filter(inv=>ids.has(inv.id)&&!isPI(inv)&&getBalance(inv)>0);
    if(!eligible.length){toastError('Nothing to mark paid — every selected row is either a Performa Invoice or already cleared.');return;}
    setInvoices(prev=>prev.map(inv=>{
      if(!eligible.some(e=>e.id===inv.id))return inv;
      const bal=getBalance(inv);
      return{...inv,payments:[...inv.payments,{id:nextPrefixedId(inv.payments,'PMT-',3),paidAmount:bal,paidDate:today,mode:'Bank Transfer',ref:'',note:'Marked Paid in Full (bulk action)'}]};
    }));
    toastSuccess(eligible.length+' invoice'+(eligible.length===1?'':'s')+' marked Paid in Full');
    setBulkSelectedIds(new Set());
  };
  const [showBulkDeleteConfirm,setShowBulkDeleteConfirm]=useState(false);
  const [showMultiPay,setShowMultiPay]=useState(false); // true = from ticked rows; 'pick' = choose a vendor; vendor id; {vid,ids,...} from Record Payment
  const [payAlso,setPayAlso]=useState(()=>new Set()); // Record Payment: other bills this payment also covers
  // One payment split over several bills (MultiPayModal): each bill gets its part as a payment with
  // the same date / mode / reference; cash goes to Daily Sales & Exp like a single cash payment;
  // a matched bank line is linked to all of them.
  useEffect(()=>{if(!showPayModal)setPayAlso(new Set());},[showPayModal]);
  const saveMultiPay=({allocs,entry,total,bankRowId,vendorName})=>{
    if(vendBlockIfLocked(entry.paidDate))return;
    const blocked=allocs.map(a=>invoices.find(i=>i.id===a.id)).filter(inv=>inv&&invoiceNeedsApproval(inv,salonId));
    if(blocked.length){toastError('Bill '+blocked.map(b=>b.invoiceNo).join(', ')+' is above the approval limit and not approved yet — a Super Admin has to approve it first.');return;}
    const linkId=bankRowId!=null?'bank-'+bankRowId:undefined;
    const group='MP-'+Date.now().toString(36);
    const noteFor=n=>'Part of one payment of ₹'+total.toLocaleString('en-IN')+' over '+allocs.length+' bills'+(entry.note?' — '+entry.note:'');
    setInvoices(prev=>prev.map(inv=>{
      const a=allocs.find(x=>x.id===inv.id);if(!a)return inv;
      return{...inv,payments:[...(inv.payments||[]),{id:nextPrefixedId(inv.payments||[],'PMT-',3),paidAmount:a.amount,paidDate:entry.paidDate,mode:entry.mode,ref:entry.ref,note:noteFor(),multiPayGroup:group,...(linkId?{linkId}:{})}]};
    }));
    if(entry.mode==='Cash'){
      const key=outletKey('salonos_daily_sales_data',salonId);
      let dseData={};try{dseData=JSON.parse(cachedLocalGet(key)||'{}');}catch(e){}
      const day={...(dseData[entry.paidDate]||{})};let any=false;
      allocs.forEach(a=>{const inv=invoices.find(i=>i.id===a.id);const ri=inv?EXPENSE_ROWS.findIndex(r=>r.name===inv.category):-1;if(ri>=0){day[ri]=Number(day[ri]||0)+a.amount;any=true;}});
      if(any)safeLocalSet(key,JSON.stringify({...dseData,[entry.paidDate]:day}));
    }
    if(bankRowId!=null){
      const keys=allocs.map(a=>invoices.find(i=>i.id===a.id)).filter(Boolean).map(invoiceKeyFor);
      const fresh=loadBankStatementRows(salonId);
      const upd=fresh.map(r=>String(r.id)===String(bankRowId)?{...r,linkedInvoice:keys[0]||'',linkedInvoices:keys}:r);
      saveBankStatementRows(upd,salonId);setBankRows(upd);
    }
    try{logAuditEvent(salonId,{entity:'Vendor Payment',entityId:group,action:'Added',summary:vendorName+' — one payment ₹'+total.toLocaleString('en-IN')+' over '+allocs.length+' bills ('+allocs.map(a=>(invoices.find(i=>i.id===a.id)||{}).invoiceNo).join(', ')+')'+(entry.ref?' ref '+entry.ref:'')});}catch(e){}
    toastSuccess('Payment of ₹'+total.toLocaleString('en-IN')+' recorded over '+allocs.length+' bills.');
    setShowMultiPay(false);setBulkSelectedIds(new Set());
  };
  const bulkDeleteInvoices=()=>{
    const ids=bulkSelectedIds;
    if(!ids.size)return;
    const removed=invoices.filter(inv=>ids.has(inv.id));
    const removedIndices=new Map(removed.map(inv=>[inv.id,invoices.findIndex(x=>x.id===inv.id)]));
    // Same Daily Sales & Exp cleanup deleteInvoice() does for a single invoice, applied to every
    // removed row — otherwise a bulk-deleted invoice's cash payment is left sitting on that
    // sheet with nothing behind it anymore.
    removed.forEach(inv=>{
      (inv.payments||[]).filter(p=>p.note==='Auto-recorded from Daily Sales & Exp').forEach(p=>clearDsePaymentAmountFor(salonId,inv.category,p.paidDate,p.paidAmount));
    });
    setInvoices(prev=>prev.filter(inv=>!ids.has(inv.id)));
    setBulkSelectedIds(new Set());
    invToast(removed.length+' invoice'+(removed.length===1?'':'s')+' deleted','warning',8000,()=>{
      setInvoices(prev=>{
        const next=[...prev];
        [...removed].sort((a,b)=>removedIndices.get(a.id)-removedIndices.get(b.id)).forEach(inv=>{
          next.splice(Math.min(removedIndices.get(inv.id),next.length),0,inv);
        });
        return next;
      });
      // Undoing a bulk delete puts the invoice back, but any cash amount it cleared out of
      // Daily Sales & Exp above is deliberately NOT re-added there automatically — re-adding it
      // blind could double up against something entered by hand in the meantime. Flagged so
      // the person knows to check, rather than silently under-restoring.
      if(removed.some(inv=>(inv.payments||[]).some(p=>p.note==='Auto-recorded from Daily Sales & Exp')))
        invToast('Restored — re-check Daily Sales & Exp for any cash amounts that were cleared','info');
    });
  };

  // ── Approval rule (automation phase 5): a bill above the outlet's approval limit can't be paid
  // until a Super Admin approves it (invoiceNeedsApproval, js/02-shared.js). ──
  const isApprover=(currentSessionUser()||{}).role==='Super Admin';
  const approveInvoice=(id)=>{
    const u=currentSessionUser()||{};
    setInvoices(prev=>prev.map(inv=>inv.id===id?{...inv,approval:{status:'Approved',by:u.name||u.email||'',at:new Date().toISOString()}}:inv));
    toastSuccess('Bill approved — it can be paid now.');
  };
  const approvalCell=(inv)=>React.createElement(React.Fragment,null,
    React.createElement('span',{className:'badge badge-amber',title:'Above this outlet’s approval limit of ₹'+Number(outletSettings(salonId).invoiceApprovalLimit||0).toLocaleString('en-IN')},'Needs approval'),
    isApprover&&React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(47,95,224,0.12)',border:'1px solid rgba(47,95,224,0.35)',color:'var(--accent)',padding:'4px 8px',borderRadius:'var(--r)',cursor:'pointer',fontSize:11,fontWeight:500},onClick:()=>approveInvoice(inv.id)},'Approve'));
  const savePay=()=>{
    if(vendBlockIfLocked(payForm.paidDate))return;
    {const tgt=invoices.find(i=>i.id===payForm.invoiceId);if(payForm.editingPaymentId===null&&tgt&&invoiceNeedsApproval(tgt,salonId)){toastError('This bill is above the approval limit and isn’t approved yet — a Super Admin has to approve it before it can be paid.');return;}}
    if(!payForm.paidAmount||!payForm.paidDate){alert('Paid amount and date are required');return;}
    const linkId=matchedBankRowId!=null?'bank-'+matchedBankRowId:undefined;
    const entry={paidAmount:Number(payForm.paidAmount),paidDate:payForm.paidDate,mode:payForm.mode,ref:payForm.ref,note:payForm.note,...(linkId?{linkId}:{})};
    if(payForm.editingPaymentId!==null){
      setInvoices(prev=>prev.map(inv=>inv.id===payForm.invoiceId?{...inv,payments:inv.payments.map(p=>p.id===payForm.editingPaymentId?{...entry,id:p.id}:p)}:inv));
    }else{
      {const tgt=invoices.find(i=>i.id===payForm.invoiceId);if(tgt&&!confirmNoDuplicatePayment(tgt,{...tgt,payments:[...(tgt.payments||[]),{...entry,id:'__new'}]}))return;}
      setInvoices(prev=>prev.map(inv=>inv.id===payForm.invoiceId?{...inv,payments:[...inv.payments,{...entry,id:nextPrefixedId(inv.payments,'PMT-',3)}]}:inv));
      // Cash payment, recorded here rather than via Daily Sales & Exp's own invoice/payment
      // popups — write it back into that sheet's cash register too, so a cash payment is always
      // visible there no matter which screen it was actually entered on. Only for brand-new
      // payments (not edits, since correcting an edited amount would need the old value
      // subtracted first — safer to leave that for manual correction on Daily Sales & Exp), and
      // only when the invoice's Category matches an actual Daily Sales & Exp expense row —
      // categories like "Purchase of Cosmetic" or "Other" don't have one to write into.
      if(entry.mode==='Cash'){
        const targetInv=invoices.find(inv=>inv.id===payForm.invoiceId);
        const ri=targetInv?EXPENSE_ROWS.findIndex(r=>r.name===targetInv.category):-1;
        if(ri>=0){
          const iso=payForm.paidDate;
          const key=outletKey('salonos_daily_sales_data',salonId);
          let dseData={};try{dseData=JSON.parse(cachedLocalGet(key)||'{}');}catch(e){}
          const existing=Number((dseData[iso]&&dseData[iso][ri])||0);
          const nextDay={...(dseData[iso]||{}),[ri]:existing+entry.paidAmount};
          safeLocalSet(key,JSON.stringify({...dseData,[iso]:nextDay}));
        }
      }
    }
    if(matchedBankRowId!=null){
      const targetInv=invoices.find(inv=>inv.id===payForm.invoiceId);
      const invoiceKeyValue=targetInv?invoiceKeyFor(targetInv):'';
      const freshBankRows=loadBankStatementRows(salonId);
      const updatedBankRows=freshBankRows.map(r=>r.id===matchedBankRowId?{...r,linkedInvoice:invoiceKeyValue}:r);
      saveBankStatementRows(updatedBankRows,salonId);
      setBankRows(updatedBankRows);
    }
    setShowPayModal(false);setPayForm(BLANK_PAY);setMatchedBankRowId(null);
  };
  const editPayment=(invoiceId,paymentId)=>{
    const inv=invoices.find(x=>x.id===invoiceId);
    if(!inv)return;
    const p=inv.payments.find(x=>x.id===paymentId);
    if(!p)return;
    if(vendBlockIfLocked(p.paidDate))return;
    setPayForm({invoiceId,editingPaymentId:paymentId,paidAmount:String(p.paidAmount),paidDate:p.paidDate,mode:p.mode,ref:p.ref||'',note:p.note||''});
    setMatchedBankRowId(null);
    setShowViewModal(false);setShowPayModal(true);
  };
  const deletePayment=(invoiceId,paymentId)=>{
    const inv=invoices.find(x=>x.id===invoiceId);
    const p=inv&&inv.payments.find(x=>x.id===paymentId);
    if(vendBlockIfLocked(p&&p.paidDate))return;
    if(!confirm('Delete this payment record? The invoice balance will increase accordingly, and the amount will be cleared from Daily Sales & Exp if it was recorded from there.'))return;
    if(inv&&p&&p.note==='Auto-recorded from Daily Sales & Exp')clearDsePaymentAmountFor(salonId,inv.category,p.paidDate,p.paidAmount);
    setInvoices(prev=>prev.map(inv=>inv.id===invoiceId?{...inv,payments:inv.payments.filter(p=>p.id!==paymentId)}:inv));
    setViewInv(v=>v&&v.id===invoiceId?{...v,inv:{...v.inv,payments:v.inv.payments.filter(p=>p.id!==paymentId)}}:v);
  };

  const getPaid=(inv)=>inv.payments.reduce((s,p)=>s+Number(p.paidAmount),0);
  const getBalance=(inv)=>Number(inv.amount)-getPaid(inv);
  // Due dates are stored as dd/mm/yyyy or yyyy-mm-dd — new Date('07/10/2026') would read July 10.
  const isOverdue=(inv)=>{if(!(getBalance(inv)>0))return false;const p=parseInvoiceDateFlexible(inv.dueDate);return !!p&&new Date(p.y,p.m-1,p.d)<new Date(new Date().toDateString());};
  const getVendorName=(id)=>{const v=vendors.find(x=>x.id===id);return v?v.name:id;};
  // Performa Invoice tracking: a PI is a pre-invoice reference, not money actually owed — the
  // real payable is the Tax Invoice/Invoice later booked against it. So a PI is "open" until
  // some other invoice records linkedPI pointing back at it, and PIs are excluded from every
  // outstanding/overdue/payable total below so the same liability doesn't get counted twice
  // (once as the PI, once as the Tax Invoice that replaces it) while still staying visible and
  // traceable in the Invoices list and the Performa Invoice tab.
  const isPI=(inv)=>inv.docNature==='Performa Invoice';
  const piKey=(inv)=>inv.vendorId+'|'+inv.invoiceNo;
  const isPIOpen=(inv)=>isPI(inv)&&!invoices.some(x=>!isPI(x)&&x.linkedPI===piKey(inv));
  const linkedPIFor=(inv)=>!isPI(inv)&&inv.linkedPI?invoices.find(x=>isPI(x)&&piKey(x)===inv.linkedPI):null;
  const linkingTaxInvoiceFor=(pi)=>invoices.find(x=>!isPI(x)&&x.linkedPI===piKey(pi));

  const totalOutstanding=invoices.filter(inv=>!isPI(inv)).reduce((s,inv)=>s+getBalance(inv),0);
  const totalOverdue=invoices.filter(inv=>!isPI(inv)&&isOverdue(inv)).reduce((s,inv)=>s+getBalance(inv),0);
  const totalPaidMonth=invoices.reduce((s,inv)=>s+inv.payments.filter(p=>p.paidDate&&p.paidDate.slice(0,7)===new Date().toISOString().slice(0,7)).reduce((a,p)=>a+Number(p.paidAmount),0),0);

  // Quick views on Invoices & Payments. "This month" = the outlet's selected period month (by the
  // invoice's booking date, as everywhere else); "pending" = a bill (not a PI) with a balance left.
  const viewCal=periodToCalendar(period)||{year:new Date().getFullYear(),month:new Date().getMonth()};
  // The period (From / To, by booking date) defaults to the selected month and can be changed.
  const vIso=(y,m,d)=>y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  const [vFrom,setVFrom]=useState(()=>vIso(viewCal.year,viewCal.month,1));
  const [vTo,setVTo]=useState(()=>vIso(viewCal.year,viewCal.month,new Date(viewCal.year,viewCal.month+1,0).getDate()));
  const vDmy=s=>s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(2,4):'…';
  const viewMonthLabel=(()=>{const a=vFrom,b=vTo;if(a&&b&&a.slice(0,7)===b.slice(0,7)&&a.slice(8)==='01'&&Number(b.slice(8))===new Date(+b.slice(0,4),+b.slice(5,7),0).getDate())
    return new Date(+a.slice(0,4),+a.slice(5,7)-1,1).toLocaleString('en-IN',{month:'short',year:'numeric'});return vDmy(a)+' – '+vDmy(b);})();
  const bookIso=inv=>{const p=parseInvoiceDateFlexible(inv.bookingDate||inv.invoiceDate);return p?vIso(p.y,p.m-1,p.d):'';};
  const inPeriod=inv=>{const d=bookIso(inv);return !!d&&(!vFrom||d>=vFrom)&&(!vTo||d<=vTo);};
  const isPendingInv=inv=>!isPI(inv)&&getBalance(inv)>0.5;
  const inView=inv=>invView==='month'?inPeriod(inv)
    :invView==='pending'?isPendingInv(inv)
    :invView==='pendingMonth'?isPendingInv(inv)&&inPeriod(inv):true;
  const filteredInv=invoices.filter(inv=>{
    if(!inView(inv))return false;
    const matchV=!filterVendor||inv.vendorId===filterVendor;
    const matchS=!search||getVendorName(inv.vendorId).toLowerCase().includes(search.toLowerCase())||inv.invoiceNo.toLowerCase().includes(search.toLowerCase());
    return matchV&&matchS;
  });
  const INV_FILTER_COLS=[
    {key:'invoiceNo',label:'Invoice No',get:inv=>inv.invoiceNo||'(blank)'},
    {key:'docNature',label:'Doc Nature',get:inv=>inv.docNature||'Tax Invoice'},
    {key:'vendor',label:'Vendor',get:inv=>getVendorName(inv.vendorId)},
    {key:'invoiceDate',label:'Invoice Date',get:inv=>inv.invoiceDate||'(blank)'},
    {key:'dueDate',label:'Due Date',get:inv=>isPI(inv)?'—':(inv.dueDate||'(blank)')},
    {key:'amount',label:'Invoice Amt',get:inv=>rupee(Number(inv.amount))}
  ];
  const invFilters=useExcelColumnFilter(filteredInv,INV_FILTER_COLS);
  const invWrapRef=useRef(null);
  const invCellRange=useExcelCellRange(invWrapRef);
  const VEND_FILTER_COLS=[
    {key:'id',label:'ID',get:v=>v.id},
    {key:'name',label:'Vendor Name',get:v=>v.name},
    {key:'gst',label:'GST Number',get:v=>v.gst||'(blank)'},
    {key:'cat',label:'Category',get:v=>v.cat},
    {key:'contact',label:'Contact Person',get:v=>v.contact||'(blank)'},
    {key:'status',label:'Status',get:v=>v.status}
  ];
  const vendorSearchQ=vendorSearch.trim().toLowerCase();
  const filteredVendors=!vendorSearchQ?vendors:vendors.filter(v=>[v.name,v.gst,v.cat,v.contact,v.phone].some(f=>String(f||'').toLowerCase().includes(vendorSearchQ)));
  const vendFilters=useExcelColumnFilter(filteredVendors,VEND_FILTER_COLS);
  const vendWrapRef=useRef(null);
  const vendCellRange=useExcelCellRange(vendWrapRef);
  const outstandingInvBase=invoices.filter(inv=>!isPI(inv)&&getBalance(inv)>0);
  const outQ=outstandingSearch.trim().toLowerCase();
  const outstandingShown=!outQ?outstandingInvBase:outstandingInvBase.filter(inv=>[getVendorName(inv.vendorId),inv.invoiceNo].some(f=>String(f||'').toLowerCase().includes(outQ)));
  const OUT_FILTER_COLS=[
    {key:'invoiceNo',label:'Invoice No',get:inv=>inv.invoiceNo||'(blank)'},
    {key:'vendor',label:'Vendor',get:inv=>getVendorName(inv.vendorId)},
    {key:'invoiceDate',label:'Invoice Date',get:inv=>inv.invoiceDate||'(blank)'},
    {key:'dueDate',label:'Due Date',get:inv=>inv.dueDate||'(blank)'},
    {key:'amount',label:'Invoice Amt',get:inv=>rupee(Number(inv.amount))}
  ];
  const outFilters=useExcelColumnFilter(outstandingShown,OUT_FILTER_COLS);
  const outWrapRef=useRef(null);
  const outCellRange=useExcelCellRange(outWrapRef);
  const piInvBase=invoices.filter(isPI);
  const piQ=performaSearch.trim().toLowerCase();
  const piShown=!piQ?piInvBase:piInvBase.filter(inv=>[getVendorName(inv.vendorId),inv.invoiceNo].some(f=>String(f||'').toLowerCase().includes(piQ)));
  const PI_FILTER_COLS=[
    {key:'invoiceNo',label:'PI No',get:inv=>inv.invoiceNo||'(blank)'},
    {key:'vendor',label:'Vendor',get:inv=>getVendorName(inv.vendorId)},
    {key:'invoiceDate',label:'PI Date',get:inv=>inv.invoiceDate||'(blank)'},
    {key:'amount',label:'PI Total',get:inv=>rupee(Number(inv.amount))},
    {key:'status',label:'Status',get:inv=>isPIOpen(inv)?'Pending Tax Invoice':'Settled'}
  ];
  const piFilters=useExcelColumnFilter(piShown,PI_FILTER_COLS);
  const piWrapRef=useRef(null);
  const piCellRange=useExcelCellRange(piWrapRef);

  const CAT_COLORS={'Purchase of Cosmetic':'badge-blue',Housekeeping:'badge-teal',Equipment:'badge-purple',Utilities:'badge-amber',Marketing:'badge-orange'};
  const PAY_MODES=['NEFT','RTGS','Cheque','Cash','UPI','IMPS'];

  return React.createElement('div',{className:'fade-in'},

    // ── Header ──
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Vendor Sheet'),
        React.createElement('div',{className:'page-sub'},'Master vendor registry, invoices and payment tracking')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:downloadInvoiceTemplate},'⬇ Import Template'),
        React.createElement('input',{ref:bulkFileRef,type:'file',accept:'.xlsx,.xls',style:{display:'none'},onChange:handleBulkImportFile}),
        React.createElement('button',{className:'btn btn-ghost btn-sm',disabled:bulkBusy,onClick:()=>bulkFileRef.current&&bulkFileRef.current.click()},bulkBusy?'Importing…':'📥 Bulk Import Invoices'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--blue)',borderColor:'rgba(74,158,255,0.4)'},onClick:()=>{setInvForm(BLANK_INV);setEditInvoiceId(null);setIntakeInitial(null);setShowIntake(true);}},'+ Add Invoice'),
        (waNew>0||waInboxLoad(salonId).length>0)&&React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:waNew?'var(--green)':'var(--text2)'},onClick:()=>setShowWaInbox(true)},'📥 WhatsApp bills'+(waNew?' ('+waNew+')':'')),
        React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(76,175,125,0.15)',border:'1px solid rgba(76,175,125,0.45)',color:'var(--green)',fontWeight:600},title:'One payment against several bills of the same vendor',onClick:()=>setShowMultiPay('pick')},'💳 Pay Vendor'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>{setVlQ('');setShowVendorList(true);}},'📋 Vendors ('+vendors.length+') — view / edit'),
        React.createElement('button',{className:'btn btn-primary btn-sm',onClick:()=>{setVForm(BLANK_V);setEditVendor(null);setShowVendorModal(true);}},'+ Add Vendor')
      )
    ),

    // ── Metrics ──
    React.createElement('div',{className:'grid4',style:{marginBottom:16}},
      [{label:'Total Vendors',val:vendors.length,color:'blue'},
       {label:'Total Outstanding',val:rupee(totalOutstanding),color:'red'},
       {label:'Overdue',val:rupee(totalOverdue),color:'amber'},
       {label:'Paid This Month',val:rupee(totalPaidMonth),color:'green'}
      ].map(m=>React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},
        React.createElement('div',{className:'metric-label'},m.label),
        React.createElement('div',{className:'metric-value'},m.val)
      ))
    ),

    // ── 📋 Vendors list — every vendor with its details and an Edit button (the edit window opens on
    // top; the list stays open and shows the change after saving). ──
    showVendorList&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowVendorList(false)},
      React.createElement('div',{className:'modal',style:{width:980,maxWidth:'96vw'},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title',style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}},
          React.createElement('span',null,'Vendors ('+vendors.length+')'),
          React.createElement('button',{className:'btn btn-primary btn-sm',onClick:()=>{setVForm(BLANK_V);setEditVendor(null);setShowVendorModal(true);}},'+ Add Vendor')),
        React.createElement('input',{className:'form-control',autoFocus:true,placeholder:'Search name, GSTIN, mobile, category…',value:vlQ,onChange:e=>setVlQ(e.target.value),style:{marginBottom:10}}),
        (()=>{
          const q=vlQ.trim().toLowerCase();
          const list=[...vendors].filter(v=>!q||[v.name,v.id,v.gst,v.phone,v.contact,v.cat].some(x=>String(x||'').toLowerCase().includes(q)))
            .sort((a,b)=>String(a.name).localeCompare(String(b.name)));
          const owed=vid=>invoices.filter(i=>i.vendorId===vid&&!isPI(i)).reduce((t,i)=>t+Math.max(0,getBalance(i)),0);
          return React.createElement('div',{className:'table-wrap',style:{maxHeight:'60vh',overflowY:'auto'}},
            React.createElement('table',null,
              React.createElement('thead',null,React.createElement('tr',null,['ID','Vendor Name','GSTIN','Category','Contact','Mobile','Status','Outstanding',''].map(c=>React.createElement('th',{key:c,style:{position:'sticky',top:0}},c)))),
              React.createElement('tbody',null,list.length===0
                ?React.createElement('tr',null,React.createElement('td',{colSpan:9,style:{textAlign:'center',padding:20,color:'var(--text3)'}},'No vendors match.'))
                :list.map(v=>React.createElement('tr',{key:v.id},
                  React.createElement('td',{style:{fontFamily:'monospace',fontSize:11}},v.id),
                  React.createElement('td',{style:{fontWeight:600}},v.name),
                  React.createElement('td',{style:{fontFamily:'monospace',fontSize:11}},v.gst||'—'),
                  React.createElement('td',null,v.cat||'—'),
                  React.createElement('td',null,v.contact||'—'),
                  React.createElement('td',{style:{fontFamily:'monospace',fontSize:12}},v.phone||'—'),
                  React.createElement('td',null,React.createElement('span',{className:'badge '+(v.status==='Active'?'badge-green':'badge-gray')},v.status||'—')),
                  React.createElement('td',{style:{textAlign:'right'}},rupee(owed(v.id))),
                  React.createElement('td',null,React.createElement('div',{style:{display:'flex',gap:6}},owed(v.id)>0.5&&React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(76,175,125,0.15)',border:'1px solid rgba(76,175,125,0.45)',color:'var(--green)'},title:'One payment against the pending bills of this vendor',onClick:()=>{setShowVendorList(false);setShowMultiPay(v.id);}},'💳 Pay'),React.createElement('button',{className:'btn btn-primary btn-sm',onClick:()=>openEditVendor(v)},'✏ Edit'),React.createElement('button',{className:'btn btn-sm',title:'Delete this vendor',style:{background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.35)',color:'var(--red)'},onClick:()=>deleteVendor(v.id)},'🗑 Delete'))))))));
        })(),
        React.createElement('div',{style:{display:'flex',justifyContent:'flex-end',marginTop:12}},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowVendorList(false)},'Close')))),

    React.createElement(PayablesDueStrip,{salon}),
    // ── Tab bar ──
    React.createElement('div',{className:'tab-bar',style:{marginBottom:16}},
      [{id:'invoices',label:'🧾 Invoices & Payments'},{id:'messages',label:'📣 Messages'},{id:'outstanding',label:'⏳ Outstanding Invoices'},{id:'ageing',label:'⏱ Ageing'},{id:'performa',label:'📝 Performa Invoice'},{id:'dashboard',label:'📊 Dashboard'},{id:'ledger',label:'📒 Vendor Ledger'},{id:'master',label:'📋 Master Vendor List'}].map(t=>
        React.createElement('button',{key:t.id,className:`tab-btn ${tab===t.id?'active':''}`,onClick:()=>setTab(t.id)},t.label)
      )
    ),

    tab==='ledger'&&React.createElement(VendorLedgerPanel,{salon,invoices,vendors,period}),
    tab==='ageing'&&React.createElement(PayablesAgeingPanel,{salon}),
    showMultiPay&&React.createElement(MultiPayModal,{invoices,vendors,selectedIds:showMultiPay===true?bulkSelectedIds:new Set(),initialVendorId:typeof showMultiPay==='string'&&showMultiPay!=='pick'?showMultiPay:(filterVendor||''),initial:typeof showMultiPay==='object'?showMultiPay:null,bankRows,onSave:saveMultiPay,onClose:()=>setShowMultiPay(false)}),

    // ══════════════════════════════════
    // TAB 1 — MASTER VENDOR LIST
    // ══════════════════════════════════
    tab==='master'&&React.createElement('div',null,
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'6px 12px',marginBottom:14,maxWidth:360}},
        React.createElement('span',{style:{color:'var(--text3)'}},React.createElement(IconSearch,{size:13})),
        React.createElement('input',{style:{background:'none',border:'none',outline:'none',color:'var(--text)',fontFamily:'var(--font)',fontSize:13,flex:1},placeholder:'Search vendor, GST, category or contact…',value:vendorSearch,onChange:e=>setVendorSearch(e.target.value)})
      ),
      React.createElement('div',{className:'card'},
      React.createElement('div',{style:{fontSize:11,color:'var(--text3)',margin:'0 0 8px'}},'Click a cell — or drag across several — then Ctrl/Cmd+C to copy, just like Excel.'),
      React.createElement('div',{className:'table-wrap',ref:vendWrapRef},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,
            vendFilters.TH(VEND_FILTER_COLS[0]),vendFilters.TH(VEND_FILTER_COLS[1]),
            React.createElement('th',{key:'address'},'Address'),
            vendFilters.TH(VEND_FILTER_COLS[2]),vendFilters.TH(VEND_FILTER_COLS[3]),vendFilters.TH(VEND_FILTER_COLS[4]),
            React.createElement('th',{key:'phone'},'Mobile No.'),React.createElement('th',{key:'terms'},'Payment Terms'),
            vendFilters.TH(VEND_FILTER_COLS[5]),
            React.createElement('th',{key:'actions'},'Actions')
          )),
          vendFilters.filteredRows.length===0
            ?React.createElement('tbody',null,React.createElement('tr',null,React.createElement('td',{colSpan:10,style:{textAlign:'center',padding:32,color:'var(--text3)'}},vendors.length===0?'No vendors yet. Click + Add Vendor to begin.':'No vendors match your search.')))
            :React.createElement('tbody',null,vendFilters.filteredRows.map((v,i)=>{
              const sel=(c)=>vendCellRange.isSelected(i,c)?'rgba(47,95,224,0.12)':undefined;
              return React.createElement('tr',{key:v.id},
                React.createElement('td',{'data-xr':i,'data-xc':0,style:{background:sel(0)}},React.createElement('span',{style:{fontFamily:'monospace',fontSize:11,color:'var(--teal)'}},v.id)),
                React.createElement('td',{'data-xr':i,'data-xc':1,style:{background:sel(1)}},
                  React.createElement('div',{style:{fontWeight:500,color:'var(--accent)',whiteSpace:'nowrap',cursor:'pointer',textDecoration:'underline dotted'},title:'Click to edit this vendor',onClick:()=>openEditVendor(v)},v.name+' ✏'),
                  React.createElement('span',{className:`badge ${CAT_COLORS[v.cat]||'badge-gray'}`,style:{marginTop:4}},v.cat)
                ),
                React.createElement('td',{'data-xr':i,'data-xc':2,style:{background:sel(2)}},React.createElement('span',{style:{fontSize:11,color:'var(--text2)',maxWidth:180,display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},v.address||'—')),
                React.createElement('td',{'data-xr':i,'data-xc':3,style:{background:sel(3)}},React.createElement('span',{style:{fontFamily:'monospace',fontSize:11,color:'var(--text2)'}},v.gst||'—')),
                React.createElement('td',{'data-xr':i,'data-xc':4,style:{background:sel(4)}},React.createElement('span',{className:`badge ${CAT_COLORS[v.cat]||'badge-gray'}`},v.cat)),
                React.createElement('td',{'data-xr':i,'data-xc':5,style:{background:sel(5)}},React.createElement('span',{style:{fontWeight:500,color:'var(--text)'}},v.contact||'—')),
                React.createElement('td',{'data-xr':i,'data-xc':6,style:{background:sel(6)}},React.createElement('span',{style:{fontFamily:'monospace',fontSize:12}},v.phone||'—')),
                React.createElement('td',{'data-xr':i,'data-xc':7,style:{background:sel(7)}},v.terms),
                React.createElement('td',{'data-xr':i,'data-xc':8,style:{background:sel(8)}},React.createElement('span',{className:`badge ${v.status==='Active'?'badge-green':'badge-gray'}`},v.status)),
                React.createElement('td',null,
                  React.createElement('div',{style:{display:'flex',gap:4}},
                    React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>openEditVendor(v)},'Edit'),
                    React.createElement('button',{'aria-label':'Delete',className:'btn btn-sm',style:{background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.3)',color:'var(--red)',padding:'4px 8px',borderRadius:'var(--r)',cursor:'pointer',fontSize:11},onClick:()=>deleteVendor(v.id)},React.createElement(IconTrash,{size:14}))
                  )
                )
              );
            }))
        )
      ),
      vendFilters.Portal(),
      vendCellRange.Toolbar()
      )
    ),

    // ══════════════════════════════════
    // TAB 2 — INVOICES & PAYMENTS
    // ══════════════════════════════════
    tab==='invoices'&&React.createElement('div',null,
      // Filters
      React.createElement('div',{style:{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}},
        React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'6px 12px',flex:1,minWidth:180}},
          React.createElement('span',{style:{color:'var(--text3)'}},React.createElement(IconSearch,{size:13})),
          React.createElement('input',{style:{background:'none',border:'none',outline:'none',color:'var(--text)',fontFamily:'var(--font)',fontSize:13,flex:1},placeholder:'Search vendor or invoice no…',value:search,onChange:e=>setSearch(e.target.value)})
        ),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:filterVendor,onChange:e=>setFilterVendor(e.target.value)},
          React.createElement('option',{value:''},'All Vendors'),
          vendors.map(v=>React.createElement('option',{key:v.id,value:v.id},v.name))
        )
      ),
      React.createElement('div',{style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',marginBottom:12}},
        React.createElement('span',{style:{fontSize:12,color:'var(--text3)',marginRight:4}},'Show:'),
        [['all','All invoices'],['month','Invoices of '+viewMonthLabel],['pending','Pending — all months'],['pendingMonth','Pending — '+viewMonthLabel]].map(([k,l])=>{
          const n=invoices.filter(inv=>k==='month'?inPeriod(inv):k==='pending'?isPendingInv(inv):k==='pendingMonth'?isPendingInv(inv)&&inPeriod(inv):true).length;
          return React.createElement('button',{key:k,className:'btn btn-sm '+(invView===k?'btn-primary':'btn-ghost'),onClick:()=>setInvView(k)},l+' ('+n+')');
        }),
        React.createElement('span',{style:{display:'inline-flex',gap:6,alignItems:'center',marginLeft:8,fontSize:12,color:'var(--text3)'}},'Period:',
          React.createElement('input',{type:'date',className:'form-control',style:{width:'auto',padding:'3px 6px',fontSize:12},value:vFrom,onChange:e=>setVFrom(e.target.value)}),'to',
          React.createElement('input',{type:'date',className:'form-control',style:{width:'auto',padding:'3px 6px',fontSize:12},value:vTo,onChange:e=>setVTo(e.target.value)}),
          React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Back to the selected month',onClick:()=>{setVFrom(vIso(viewCal.year,viewCal.month,1));setVTo(vIso(viewCal.year,viewCal.month,new Date(viewCal.year,viewCal.month+1,0).getDate()));}},'↺')),
        invView!=='all'&&React.createElement('span',{style:{fontSize:12,color:'var(--text2)',marginLeft:6}},
          'Balance pending: ₹'+Math.round(filteredInv.filter(x=>!isPI(x)).reduce((t,x)=>t+Math.max(0,getBalance(x)),0)).toLocaleString('en-IN'))
      ),
      React.createElement('div',{className:'card'},
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:8}},'Click a cell — or drag across several — then Ctrl/Cmd+C to copy, just like Excel.'),
        // ── Bulk action toolbar — appears only once at least one row is selected. ──
        bulkSelectedIds.size>0&&React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:'10px 14px',background:'rgba(47,95,224,0.08)',border:'1px solid rgba(47,95,224,0.3)',borderRadius:'var(--r)',marginBottom:14}},
          React.createElement('span',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},bulkSelectedIds.size+' selected'),
          React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(76,175,125,0.15)',border:'1px solid rgba(76,175,125,0.4)',color:'var(--green)',padding:'5px 12px',borderRadius:'var(--r)',cursor:'pointer',fontSize:12,fontWeight:500},onClick:bulkMarkPaidInFull},'✓ Mark Paid in Full'),
          React.createElement('button',{className:'btn btn-primary btn-sm',onClick:()=>setShowMultiPay(true),title:'One cheque / transfer paid against several bills of the same vendor'},'💳 One payment for selected'),
          React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.3)',color:'var(--red)',padding:'5px 12px',borderRadius:'var(--r)',cursor:'pointer',fontSize:12,fontWeight:500},onClick:()=>setShowBulkDeleteConfirm(true)},'🗑 Delete Selected'),
          React.createElement('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:'auto'},onClick:()=>setBulkSelectedIds(new Set())},'Clear selection')
        ),
        React.createElement('div',{className:'table-wrap',ref:invWrapRef},
          React.createElement('table',null,
            React.createElement('thead',null,React.createElement('tr',null,
              React.createElement('th',{key:'bulk-check',style:{width:32}},
                invFilters.filteredRows.length>0&&React.createElement('input',{type:'checkbox',
                  checked:invFilters.filteredRows.every(inv=>bulkSelectedIds.has(inv.id)),
                  onChange:e=>setBulkSelectedIds(e.target.checked?new Set(invFilters.filteredRows.map(r=>r.id)):new Set())})),
              invFilters.TH(INV_FILTER_COLS[0]),invFilters.TH(INV_FILTER_COLS[1]),invFilters.TH(INV_FILTER_COLS[2]),
              React.createElement('th',{key:'desc'},'Description'),
              invFilters.TH(INV_FILTER_COLS[3]),invFilters.TH(INV_FILTER_COLS[4]),invFilters.TH(INV_FILTER_COLS[5]),
              React.createElement('th',{key:'paid'},'Total Paid'),React.createElement('th',{key:'bal'},'Balance'),React.createElement('th',{key:'attach'},'Attach'),React.createElement('th',{key:'status'},'Status'),React.createElement('th',{key:'actions'},'Actions')
            )),
            invFilters.filteredRows.length===0
              ?React.createElement('tbody',null,React.createElement('tr',null,React.createElement('td',{colSpan:13,style:{textAlign:'center',padding:32,color:'var(--text3)'}},'No invoices found.')))
              :React.createElement('tbody',null,invFilters.filteredRows.map((inv,i)=>{
                const paid=getPaid(inv);
                const balance=getBalance(inv);
                const overdue=isOverdue(inv);
                const cleared=balance<=0;
                const openPI=isPIOpen(inv);
                const pi=isPI(inv);
                const settledTaxInv=pi&&!openPI?linkingTaxInvoiceFor(inv):null;
                const sourcePI=!pi?linkedPIFor(inv):null;
                const sel=(c)=>invCellRange.isSelected(i,c)?'rgba(47,95,224,0.12)':undefined;
                return React.createElement('tr',{key:inv.id,style:openPI?{background:'rgba(255,107,107,0.08)',borderLeft:'3px solid var(--red)'}:undefined},
                  React.createElement('td',null,React.createElement('input',{type:'checkbox',checked:bulkSelectedIds.has(inv.id),onChange:()=>toggleBulkSelect(inv.id)})),
                  React.createElement('td',{'data-xr':i,'data-xc':0,style:{background:sel(0)}},
                    React.createElement('span',{style:{fontFamily:'monospace',fontSize:11,color:openPI?'var(--red)':'var(--accent)'}},inv.invoiceNo),
                    sourcePI&&React.createElement('div',{style:{fontSize:10,color:'var(--text3)',marginTop:2}},'↩ Against PI '+sourcePI.invoiceNo)
                  ),
                  React.createElement('td',{'data-xr':i,'data-xc':1,style:{background:sel(1)}},
                    pi
                      ?React.createElement('span',{className:'badge '+(openPI?'badge-red':'badge-green')},openPI?'PI · Pending':'PI · Settled')
                      :React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},inv.docNature||'Tax Invoice')
                  ),
                  React.createElement('td',{'data-xr':i,'data-xc':2,style:{background:sel(2)}},
                    React.createElement('div',{style:{fontWeight:500,color:'var(--text)',whiteSpace:'nowrap',fontSize:12}},getVendorName(inv.vendorId)),
                    React.createElement('div',{style:{fontSize:10,color:'var(--text3)'}},inv.vendorId)
                  ),
                  React.createElement('td',{'data-xr':i,'data-xc':3,style:{background:sel(3)}},React.createElement('span',{style:{fontSize:12,color:'var(--text2)'}},inv.desc||'—')),
                  React.createElement('td',{'data-xr':i,'data-xc':4,style:{background:sel(4)}},React.createElement('span',{style:{fontSize:12}},inv.invoiceDate||'—')),
                  React.createElement('td',{'data-xr':i,'data-xc':5,style:{background:sel(5)}},React.createElement('span',{style:{fontSize:12,color:overdue&&!cleared?'var(--red)':cleared?'var(--text3)':'var(--text)'}},pi?'—':(inv.dueDate||'—'))),
                  React.createElement('td',{'data-xr':i,'data-xc':6,style:{background:sel(6)}},React.createElement('span',{style:{fontWeight:600,color:'var(--text)'}},rupee(Number(inv.amount)))),
                  // Paid amount with dates — not applicable to a PI, since payment happens on the Tax Invoice booked against it
                  React.createElement('td',null,
                    pi?React.createElement('span',{style:{color:'var(--text3)',fontSize:12}},'N/A — see linked Tax Invoice')
                    :paid>0
                      ?React.createElement('div',null,
                        React.createElement('div',{style:{fontWeight:600,color:'var(--green)',fontSize:12}},rupee(paid)),
                        inv.payments.map((p)=>React.createElement('div',{key:p.id,style:{fontSize:10,color:'var(--text3)',lineHeight:1.4}},
                          p.paidDate+' · '+p.mode+(p.ref?' · '+p.ref:'')
                        ))
                      )
                      :React.createElement('span',{style:{color:'var(--text3)',fontSize:12}},'—')
                  ),
                  // Balance — for a PI this shows what it graduated into, not a payable amount
                  React.createElement('td',null,
                    pi
                      ?(settledTaxInv
                        ?React.createElement('span',{style:{fontSize:11.5,color:'var(--green)'}},'→ Replaced by '+settledTaxInv.invoiceNo)
                        :React.createElement('span',{style:{fontSize:11.5,color:'var(--text3)'}},'Awaiting Tax Invoice'))
                      :React.createElement('span',{style:{fontWeight:700,fontSize:13,color:cleared?'var(--green)':overdue?'var(--red)':'var(--orange)'}},
                        cleared?'✓ Cleared':rupee(balance)
                      )
                  ),
                  // Attachment
                  React.createElement('td',null,
                    inv.attachment
                      ?React.createElement('span',{style:{fontSize:11,color:'var(--green)',cursor:typeof inv.attachment!=='string'&&inv.attachment.dataUrl?'pointer':undefined},title:typeof inv.attachment!=='string'&&inv.attachment.dataUrl?'Click to download':'Saved by an older version — remove and re-attach to enable download',onClick:()=>{if(typeof inv.attachment!=='string'&&inv.attachment.dataUrl)downloadAttachment(inv.attachment,'attachment');else toastError('This attachment was saved by an older version and has nothing to download — remove and re-attach it.');}},'📎 '+(typeof inv.attachment==='string'?inv.attachment:inv.attachment.name))
                      :React.createElement('label',{style:{fontSize:11,color:'var(--text3)',cursor:'pointer',display:'flex',alignItems:'center',gap:3}},
                        React.createElement('input',{type:'file',style:{display:'none'},onChange:e=>{
                          const f=e.target.files[0];
                          if(f)readFileAsAttachment(f,
                            rec=>{setInvoices(prev=>prev.map(inv2=>inv2.id===inv.id?{...inv2,attachment:rec}:inv2));toastSuccess('Attachment added');},
                            err=>toastError(err==='size'?'That file is too large (max 4MB).':"Couldn't read that file — please try again.")
                          );
                          e.target.value='';
                        }}),
                        '📎 Attach'
                      )
                  ),
                  // Status badge
                  React.createElement('td',null,
                    pi
                      ?React.createElement('span',{className:'badge '+(openPI?'badge-red':'badge-green')},openPI?'Pending Tax Invoice':'Settled')
                      :React.createElement('span',{className:`badge ${cleared?'badge-green':overdue?'badge-red':'badge-amber'}`},
                        cleared?'Cleared':overdue?'Overdue':'Pending'
                      )
                  ),
                  // Actions
                  React.createElement('td',null,
                    React.createElement('div',{style:{display:'flex',gap:4}},
                      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>{setViewInv({inv,id:inv.id});setShowViewModal(true);}},'View'),
                      !pi&&!cleared&&(invoiceNeedsApproval(inv,salonId)?approvalCell(inv):React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(76,175,125,0.15)',border:'1px solid rgba(76,175,125,0.4)',color:'var(--green)',padding:'4px 8px',borderRadius:'var(--r)',cursor:'pointer',fontSize:11,fontWeight:500},onClick:()=>{setPayForm({...BLANK_PAY,invoiceId:inv.id,paidAmount:balance});setMatchedBankRowId(null);setShowPayModal(true);}},'Pay')),
                      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>editInvoice(inv.id)},'Edit'),
                      React.createElement('button',{'aria-label':'Delete',className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>deleteInvoice(inv.id)},React.createElement(IconTrash,{size:14}))
                    )
                  )
                );
              }))
          )
        ),
        invFilters.Portal(),
        invCellRange.Toolbar()
      )
    ),

    // ══════════════════════════════════
    // TAB 3 — OUTSTANDING INVOICES (payment not yet made, in full)
    // ══════════════════════════════════
    tab==='messages'&&React.createElement(React.Fragment,null,React.createElement(VendorPriceWatchCard,{salonId}),React.createElement(VendorMessagesPanel,{salonId,salon})),
    tab==='outstanding'&&(()=>{
      const outstandingInv=outstandingInvBase;
      const shown=outFilters.filteredRows;
      const totalOut=outstandingInv.reduce((s,inv)=>s+getBalance(inv),0);
      const totalOver=outstandingInv.filter(isOverdue).reduce((s,inv)=>s+getBalance(inv),0);
      return React.createElement('div',null,
        React.createElement('div',{className:'grid3',style:{marginBottom:14}},
          React.createElement('div',{className:'metric-card amber'},React.createElement('div',{className:'metric-label'},'Outstanding Invoices'),React.createElement('div',{className:'metric-value'},outstandingInv.length)),
          React.createElement('div',{className:'metric-card amber'},React.createElement('div',{className:'metric-label'},'Total Outstanding'),React.createElement('div',{className:'metric-value'},rupee(totalOut))),
          React.createElement('div',{className:'metric-card red'},React.createElement('div',{className:'metric-label'},'Overdue Amount'),React.createElement('div',{className:'metric-value'},rupee(totalOver)))
        ),
        React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:14,flexWrap:'wrap'}},
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'6px 12px',maxWidth:360,flex:1}},
            React.createElement('span',{style:{color:'var(--text3)'}},React.createElement(IconSearch,{size:13})),
            React.createElement('input',{style:{background:'none',border:'none',outline:'none',color:'var(--text)',fontFamily:'var(--font)',fontSize:13,flex:1},placeholder:'Search vendor or invoice no…',value:outstandingSearch,onChange:e=>setOutstandingSearch(e.target.value)})
          ),
          React.createElement(ShareReportButton,{
            title:'Outstanding Invoices',
            subtitle:'Vendor Sheet',
            getBodyHtml:()=>'<table><thead><tr><th>Invoice No</th><th>Vendor</th><th>Invoice Date</th><th>Due Date</th><th class="num">Amount</th><th class="num">Balance</th></tr></thead><tbody>'
              +shown.map(inv=>'<tr><td>'+inv.invoiceNo+'</td><td>'+getVendorName(inv.vendorId)+'</td><td>'+(inv.invoiceDate||'—')+'</td><td>'+(inv.dueDate||'—')+'</td><td class="num">₹'+Number(inv.amount).toLocaleString('en-IN')+'</td><td class="num">₹'+getBalance(inv).toLocaleString('en-IN')+'</td></tr>').join('')
              +'</tbody></table>',
            getSheetRows:()=>[['Invoice No','Vendor','Invoice Date','Due Date','Amount','Balance'],
              ...shown.map(inv=>[inv.invoiceNo,getVendorName(inv.vendorId),inv.invoiceDate||'',inv.dueDate||'',Number(inv.amount),getBalance(inv)])]
          })
        ),
        React.createElement('div',{className:'card'},
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:8}},'Click a cell — or drag across several — then Ctrl/Cmd+C to copy, just like Excel.'),
          React.createElement('div',{className:'table-wrap',ref:outWrapRef},
            React.createElement('table',null,
              React.createElement('thead',null,React.createElement('tr',null,
                outFilters.TH(OUT_FILTER_COLS[0]),
                React.createElement('th',{key:'docNature'},'Doc Nature'),
                outFilters.TH(OUT_FILTER_COLS[1]),outFilters.TH(OUT_FILTER_COLS[2]),outFilters.TH(OUT_FILTER_COLS[3]),outFilters.TH(OUT_FILTER_COLS[4]),
                React.createElement('th',{key:'paid'},'Paid'),React.createElement('th',{key:'bal'},'Balance'),React.createElement('th',{key:'status'},'Status'),React.createElement('th',{key:'actions'},'Actions')
              )),
              shown.length===0
                ?React.createElement('tbody',null,React.createElement('tr',null,React.createElement('td',{colSpan:10,style:{textAlign:'center',padding:32,color:'var(--text3)'}},outstandingInv.length===0?'Nothing outstanding — every invoice is fully paid. 🎉':'No outstanding invoices match your search.')))
                :React.createElement('tbody',null,shown.map((inv,i)=>{
                  const paid=getPaid(inv);
                  const balance=getBalance(inv);
                  const overdue=isOverdue(inv);
                  const sel=(c)=>outCellRange.isSelected(i,c)?'rgba(47,95,224,0.12)':undefined;
                  return React.createElement('tr',{key:inv.id||i,style:overdue?{background:'rgba(255,107,107,0.06)'}:undefined},
                    React.createElement('td',{'data-xr':i,'data-xc':0,style:{background:sel(0)}},React.createElement('span',{style:{fontFamily:'monospace',fontSize:11,color:'var(--accent)'}},inv.invoiceNo)),
                    React.createElement('td',null,inv.docNature==='Performa Invoice'?React.createElement('span',{className:'badge badge-red'},'PI'):React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},'Tax Invoice')),
                    React.createElement('td',{'data-xr':i,'data-xc':1,style:{background:sel(1)}},React.createElement('div',{style:{fontWeight:500,color:'var(--text)',fontSize:12}},getVendorName(inv.vendorId))),
                    React.createElement('td',{'data-xr':i,'data-xc':2,style:{background:sel(2)}},React.createElement('span',{style:{fontSize:12}},inv.invoiceDate||'—')),
                    React.createElement('td',{'data-xr':i,'data-xc':3,style:{background:sel(3)}},React.createElement('span',{style:{fontSize:12,color:overdue?'var(--red)':'var(--text)'}},inv.dueDate||'—')),
                    React.createElement('td',{'data-xr':i,'data-xc':4,style:{background:sel(4)}},React.createElement('span',{style:{fontWeight:600,color:'var(--text)'}},rupee(Number(inv.amount)))),
                    React.createElement('td',null,paid>0?React.createElement('span',{style:{color:'var(--green)',fontWeight:600}},rupee(paid)):React.createElement('span',{style:{color:'var(--text3)'}},'—')),
                    React.createElement('td',null,React.createElement('span',{style:{fontWeight:700,color:overdue?'var(--red)':'var(--orange)'}},rupee(balance))),
                    React.createElement('td',null,React.createElement('span',{className:'badge '+(overdue?'badge-red':'badge-amber')},overdue?'Overdue':'Pending')),
                    React.createElement('td',null,React.createElement('div',{style:{display:'flex',gap:4}},
                      (invoiceNeedsApproval(inv,salonId)?approvalCell(inv):React.createElement('button',{className:'btn btn-sm',style:{background:'rgba(76,175,125,0.15)',border:'1px solid rgba(76,175,125,0.4)',color:'var(--green)',padding:'4px 8px',borderRadius:'var(--r)',cursor:'pointer',fontSize:11,fontWeight:500},onClick:()=>{setPayForm({...BLANK_PAY,invoiceId:inv.id,paidAmount:balance});setMatchedBankRowId(null);setShowPayModal(true);}},'Pay')),
                      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>editInvoice(inv.id)},'Edit')
                    ))
                  );
                }))
            )
          ),
          outFilters.Portal(),
          outCellRange.Toolbar()
        )
      );
    })(),

    // ══════════════════════════════════
    // TAB 4 — PERFORMA INVOICE
    // ══════════════════════════════════
    tab==='performa'&&(()=>{
      const piInv=piInvBase;
      const shown=piFilters.filteredRows;
      const pending=piInv.filter(isPIOpen);
      const settled=piInv.filter(inv=>!isPIOpen(inv));
      const findLinkingTaxInvoice=linkingTaxInvoiceFor;
      return React.createElement('div',null,
        React.createElement('div',{className:'grid3',style:{marginBottom:14}},
          React.createElement('div',{className:'metric-card blue'},React.createElement('div',{className:'metric-label'},'Total Performa Invoices'),React.createElement('div',{className:'metric-value'},piInv.length)),
          React.createElement('div',{className:'metric-card red'},React.createElement('div',{className:'metric-label'},'Pending Tax Invoice'),React.createElement('div',{className:'metric-value'},pending.length)),
          React.createElement('div',{className:'metric-card green'},React.createElement('div',{className:'metric-label'},'Settled'),React.createElement('div',{className:'metric-value'},settled.length))
        ),
        React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'6px 12px',marginBottom:14,maxWidth:360}},
          React.createElement('span',{style:{color:'var(--text3)'}},React.createElement(IconSearch,{size:13})),
          React.createElement('input',{style:{background:'none',border:'none',outline:'none',color:'var(--text)',fontFamily:'var(--font)',fontSize:13,flex:1},placeholder:'Search vendor or PI no…',value:performaSearch,onChange:e=>setPerformaSearch(e.target.value)})
        ),
        React.createElement('div',{className:'card'},
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:8}},'Click a cell — or drag across several — then Ctrl/Cmd+C to copy, just like Excel.'),
          React.createElement('div',{className:'table-wrap',ref:piWrapRef},
            React.createElement('table',null,
              React.createElement('thead',null,React.createElement('tr',null,
                piFilters.TH(PI_FILTER_COLS[0]),piFilters.TH(PI_FILTER_COLS[1]),piFilters.TH(PI_FILTER_COLS[2]),piFilters.TH(PI_FILTER_COLS[3]),piFilters.TH(PI_FILTER_COLS[4]),
                React.createElement('th',{key:'linked'},'Linked Tax Invoice'),React.createElement('th',{key:'actions'},'Actions')
              )),
              shown.length===0
                ?React.createElement('tbody',null,React.createElement('tr',null,React.createElement('td',{colSpan:7,style:{textAlign:'center',padding:32,color:'var(--text3)'}},piInv.length===0?'No Performa Invoices recorded yet.':'No Performa Invoices match your search.')))
                :React.createElement('tbody',null,shown.map((inv,i)=>{
                  const open=isPIOpen(inv);
                  const taxInv=findLinkingTaxInvoice(inv);
                  const sel=(c)=>piCellRange.isSelected(i,c)?'rgba(47,95,224,0.12)':undefined;
                  return React.createElement('tr',{key:inv.id||i,style:open?{background:'rgba(255,107,107,0.06)'}:undefined},
                    React.createElement('td',{'data-xr':i,'data-xc':0,style:{background:sel(0)}},React.createElement('span',{style:{fontFamily:'monospace',fontSize:11,color:open?'var(--red)':'var(--accent)'}},inv.invoiceNo)),
                    React.createElement('td',{'data-xr':i,'data-xc':1,style:{background:sel(1)}},React.createElement('div',{style:{fontWeight:500,color:'var(--text)',fontSize:12}},getVendorName(inv.vendorId))),
                    React.createElement('td',{'data-xr':i,'data-xc':2,style:{background:sel(2)}},React.createElement('span',{style:{fontSize:12}},inv.invoiceDate||'—')),
                    React.createElement('td',{'data-xr':i,'data-xc':3,style:{background:sel(3)}},React.createElement('span',{style:{fontWeight:600,color:'var(--text)'}},rupee(Number(inv.amount)))),
                    React.createElement('td',{'data-xr':i,'data-xc':4,style:{background:sel(4)}},React.createElement('span',{className:'badge '+(open?'badge-red':'badge-green')},open?'Pending Tax Invoice':'Settled')),
                    React.createElement('td',null,taxInv?React.createElement('span',{style:{fontFamily:'monospace',fontSize:11,color:'var(--green)'}},taxInv.invoiceNo):React.createElement('span',{style:{color:'var(--text3)'}},'—')),
                    React.createElement('td',null,React.createElement('div',{style:{display:'flex',gap:4}},
                      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>editInvoice(inv.id)},'Edit'),
                      React.createElement('button',{'aria-label':'Delete',className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>deleteInvoice(inv.id)},React.createElement(IconTrash,{size:14}))
                    ))
                  );
                }))
            )
          ),
          piFilters.Portal(),
          piCellRange.Toolbar()
        )
      );
    })(),

    // ══════════════════════════════════
    // TAB 5 — DASHBOARD
    // ══════════════════════════════════
    tab==='dashboard'&&(()=>{
      const activeVendors=vendors.filter(v=>v.status==='Active').length;
      const payableInv=invoices.filter(inv=>!isPI(inv));
      const totalOut=payableInv.reduce((s,inv)=>s+getBalance(inv),0);
      const totalOver=payableInv.filter(isOverdue).reduce((s,inv)=>s+getBalance(inv),0);
      const totalPaidAll=payableInv.reduce((s,inv)=>s+getPaid(inv),0);
      const pendingPICount=invoices.filter(isPIOpen).length;
      const byVendor={};
      payableInv.forEach(inv=>{const b=getBalance(inv);if(b>0){byVendor[inv.vendorId]=(byVendor[inv.vendorId]||0)+b;}});
      const topVendors=Object.entries(byVendor).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([vid,amt])=>({name:getVendorName(vid),amt}));
      const maxTopVendor=Math.max(1,...topVendors.map(v=>v.amt));
      const monthLabels=[];
      const now=new Date();
      for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);monthLabels.push({key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),label:d.toLocaleString('en-IN',{month:'short'})});}
      const paidByMonth=monthLabels.map(m=>{
        const total=payableInv.reduce((s,inv)=>s+inv.payments.filter(p=>p.paidDate&&p.paidDate.slice(0,7)===m.key).reduce((a,p)=>a+Number(p.paidAmount),0),0);
        return{...m,total};
      });
      const maxPaidMonth=Math.max(1,...paidByMonth.map(m=>m.total));
      const catCounts={};
      vendors.forEach(v=>{catCounts[v.cat]=(catCounts[v.cat]||0)+1;});
      const catList=Object.entries(catCounts).sort((a,b)=>b[1]-a[1]);
      const maxCat=Math.max(1,...catList.map(c=>c[1]));
      const statusCounts={Cleared:0,Pending:0,Overdue:0};
      payableInv.forEach(inv=>{const b=getBalance(inv);if(b<=0)statusCounts.Cleared++;else if(isOverdue(inv))statusCounts.Overdue++;else statusCounts.Pending++;});
      const statusColors={Cleared:'var(--green)',Pending:'var(--accent2)',Overdue:'var(--red)'};

      return React.createElement('div',null,
        React.createElement('div',{className:'grid4',style:{marginBottom:16}},
          React.createElement('div',{className:'metric-card blue'},React.createElement('div',{className:'metric-label'},'Active Vendors'),React.createElement('div',{className:'metric-value'},activeVendors+' / '+vendors.length)),
          React.createElement('div',{className:'metric-card amber'},React.createElement('div',{className:'metric-label'},'Total Outstanding'),React.createElement('div',{className:'metric-value'},rupee(totalOut))),
          React.createElement('div',{className:'metric-card red'},React.createElement('div',{className:'metric-label'},'Overdue Amount'),React.createElement('div',{className:'metric-value'},rupee(totalOver))),
          React.createElement('div',{className:'metric-card green'},React.createElement('div',{className:'metric-label'},'Total Paid (all time)'),React.createElement('div',{className:'metric-value'},rupee(totalPaidAll)))
        ),
        pendingPICount>0&&React.createElement('div',{style:{background:'rgba(255,107,107,0.08)',border:'1px solid rgba(255,107,107,0.3)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:16,fontSize:12.5,color:'var(--text)'}},
          '⚠ '+pendingPICount+' Performa Invoice'+(pendingPICount===1?'':'s')+' still awaiting a Tax Invoice — see the Performa Invoice tab.'
        ),
        React.createElement('div',{className:'grid2'},
          React.createElement('div',{className:'card'},
            React.createElement('div',{className:'card-title'},'Top Vendors by Outstanding Balance'),
            topVendors.length===0
              ?React.createElement('div',{style:{textAlign:'center',padding:24,color:'var(--text3)',fontSize:12}},'Nothing outstanding — every invoice is fully paid.')
              :topVendors.map(v=>React.createElement('div',{key:v.name,style:{marginBottom:10}},
                  React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}},
                    React.createElement('span',{style:{color:'var(--text2)'}},v.name),
                    React.createElement('span',{style:{color:'var(--text)',fontWeight:600}},rupee(v.amt))
                  ),
                  React.createElement('div',{style:{height:8,background:'var(--bg3)',borderRadius:4,overflow:'hidden'}},
                    React.createElement('div',{style:{height:'100%',width:(v.amt/maxTopVendor*100)+'%',background:'linear-gradient(90deg,var(--accent),var(--accent2))',borderRadius:4}})
                  )
                ))
          ),
          React.createElement('div',{className:'card'},
            React.createElement('div',{className:'card-title'},'Payments Received — Last 6 Months'),
            React.createElement('div',{style:{display:'flex',alignItems:'flex-end',gap:8,height:140,paddingTop:10}},
              paidByMonth.map(m=>React.createElement('div',{key:m.key,style:{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',height:'100%'}},
                React.createElement('div',{style:{fontSize:9.5,color:'var(--text3)',marginBottom:4}},m.total>0?'₹'+(m.total>=1000?Math.round(m.total/1000)+'k':m.total):''),
                React.createElement('div',{title:m.label+': ₹'+m.total.toLocaleString('en-IN'),style:{width:'100%',height:Math.max(3,Math.round(m.total/maxPaidMonth*100))+'px',background:'linear-gradient(180deg,var(--green),rgba(76,175,125,0.4))',borderRadius:'3px 3px 0 0'}}),
                React.createElement('div',{style:{fontSize:10,color:'var(--text3)',marginTop:6}},m.label)
              ))
            )
          )
        ),
        React.createElement('div',{className:'grid2',style:{marginTop:16}},
          React.createElement('div',{className:'card'},
            React.createElement('div',{className:'card-title'},'Vendors by Category'),
            catList.length===0
              ?React.createElement('div',{style:{textAlign:'center',padding:24,color:'var(--text3)',fontSize:12}},'No vendors yet.')
              :catList.map(([cat,count])=>React.createElement('div',{key:cat,style:{marginBottom:10}},
                  React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}},
                    React.createElement('span',{className:`badge ${CAT_COLORS[cat]||'badge-gray'}`},cat),
                    React.createElement('span',{style:{color:'var(--text)',fontWeight:600}},count)
                  ),
                  React.createElement('div',{style:{height:8,background:'var(--bg3)',borderRadius:4,overflow:'hidden'}},
                    React.createElement('div',{style:{height:'100%',width:(count/maxCat*100)+'%',background:'var(--blue)',borderRadius:4}})
                  )
                ))
          ),
          React.createElement('div',{className:'card'},
            React.createElement('div',{className:'card-title'},'Invoice Status Breakdown'),
            React.createElement('div',{style:{display:'flex',gap:10,marginBottom:16}},
              Object.entries(statusCounts).map(([label,count])=>React.createElement('div',{key:label,style:{flex:1,textAlign:'center',padding:'12px 8px',background:'var(--bg3)',borderRadius:'var(--r)'}},
                React.createElement('div',{style:{fontSize:22,fontWeight:700,color:statusColors[label]}},count),
                React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:4}},label)
              ))
            ),
            React.createElement('div',{style:{display:'flex',height:14,borderRadius:7,overflow:'hidden'}},
              Object.entries(statusCounts).filter(([,c])=>c>0).map(([label,count])=>React.createElement('div',{key:label,title:label+': '+count,style:{width:(count/Math.max(1,invoices.length)*100)+'%',background:statusColors[label]}}))
            )
          )
        )
      );
    })(),

    // ══════════════════════════════════
    // MODAL — ADD / EDIT VENDOR
    // ══════════════════════════════════
    showVendorModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowVendorModal(false)},
      React.createElement('div',{className:'modal',style:{width:620},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},editVendor?'Edit Vendor — '+vForm.name:'Add New Vendor'),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-80'},'Vendor Name *'),React.createElement('input',{id:'f-80',className:'form-control',value:vForm.name,onChange:vc('name'),placeholder:'e.g. L\'Oreal India Pvt Ltd'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-81'},'Category'),React.createElement('select',{id:'f-81',className:'form-control',value:vForm.cat,onChange:vc('cat')},withBizCategories(['Purchase of Cosmetic','Housekeeping','Equipment','Utilities','Rent','DG Rent','Drycleaning Expenses','Professional Fee','Staff Room Rent','Royalty','Electricity Expenses','Uniform Expenses','Telephone & Internet Expenses','Maintenance Expenses','Marketing','Other'],salonId).map(c=>React.createElement('option',{key:c},c))))
        ),
        React.createElement('div',{className:'form-row'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-82'},'Address'),React.createElement('textarea',{id:'f-82',className:'form-control',rows:2,value:vForm.address,onChange:vc('address'),placeholder:'Full address with PIN code',style:{resize:'vertical'}}))
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-83'},'GST Number'),React.createElement('input',{id:'f-83',className:'form-control',value:vForm.gst,onChange:vc('gst'),placeholder:'e.g. 07AABCX1234R1ZP',style:{textTransform:'uppercase'}}),vForm.gst&&!isValidGSTINFormat(vForm.gst)&&fieldWarning('Doesn\u2019t look like a valid GSTIN \u2014 check the number and checksum digit.')),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-84'},'Payment Terms'),React.createElement('select',{id:'f-84',className:'form-control',value:vForm.terms,onChange:vc('terms')},['7 days','15 days','30 days','45 days','60 days','90 days','Advance'].map(t=>React.createElement('option',{key:t},t))))
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-85'},'Contact Person Name'),React.createElement('input',{id:'f-85',className:'form-control',value:vForm.contact,onChange:vc('contact'),placeholder:'Contact person'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-86'},'Mobile No.'),React.createElement('input',{id:'f-86',className:'form-control',value:vForm.phone,onChange:vc('phone'),placeholder:'98xxxxxxxx'}),vForm.phone&&!isValidIndianMobile(vForm.phone)&&fieldWarning('Doesn\u2019t look like a valid 10-digit Indian mobile number.'))
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-87'},'Vendor ID (auto if blank)'),React.createElement('input',{id:'f-87',className:'form-control',value:vForm.id,onChange:vc('id'),placeholder:'e.g. V005',readOnly:!!editVendor,title:editVendor?'The ID cannot be changed — invoices and payments are linked to it':''})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-88'},'Status'),React.createElement('select',{id:'f-88',className:'form-control',value:vForm.status,onChange:vc('status')},['Active','Inactive'].map(s=>React.createElement('option',{key:s},s))))
        ),
        React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'14px 0 10px',paddingTop:12,borderTop:'1px solid var(--border)'}},'Bank Details'),
        React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:10}},'Needed to include this vendor in a Bank Payment File (Bank Payment tab) — leave blank if payments to this vendor are never made by bank transfer.'),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Bank Name'),React.createElement(BankNameField,{value:vForm.bankName,ifsc:vForm.ifsc,onChange:v=>setVForm(f=>({...f,bankName:v}))})),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Account Holder Name'),React.createElement('input',{className:'form-control',value:vForm.accountHolder,onChange:vc('accountHolder'),placeholder:'As per bank records'}))
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'Account Number'),React.createElement('input',{className:'form-control',value:vForm.accountNo,onChange:vc('accountNo'),placeholder:'Account number',inputMode:'numeric'}),vForm.accountNo&&!isValidBankAccountNo(vForm.accountNo)&&fieldWarning('Account number must be 9 to 18 digits.')),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,'IFSC Code'),React.createElement('input',{className:'form-control',value:vForm.ifsc,onChange:vc('ifsc'),placeholder:'HDFC0001234',style:{textTransform:'uppercase'}}),vForm.ifsc&&!isValidIfscFormat(vForm.ifsc)&&fieldWarning('Doesn\u2019t look like a valid IFSC (e.g. HDFC0001234).'))
        ),
        React.createElement('div',{className:'form-group'},React.createElement('label',null,'Email (optional, some banks require it)'),React.createElement('input',{className:'form-control',value:vForm.email,onChange:vc('email'),placeholder:'vendor@company.com',type:'email'}),vForm.email&&!isValidEmailFormat(vForm.email)&&fieldWarning('Doesn\u2019t look like a valid email address.')),
        salon&&salon.tdsApplicable&&React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:14,marginTop:14}},
          React.createElement('label',{style:{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginBottom:vForm.tdsApplicable?10:0}},
            React.createElement('input',{type:'checkbox',checked:!!vForm.tdsApplicable,onChange:vcCheck('tdsApplicable')}),
            React.createElement('span',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},'TDS Applicable on payments to this vendor')
          ),
          vForm.tdsApplicable&&React.createElement('div',{className:'form-row cols2'},
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Section'),
              React.createElement('select',{className:'form-control',value:vForm.tdsSection,onChange:e=>{
                const sec=tdsSectionsAsOf().find(s=>s.code===e.target.value);
                setVForm(f=>({...f,tdsSection:e.target.value,tdsRate:sec?sec.rate:f.tdsRate}));
              }},[React.createElement('option',{key:'',value:''},'Select Section'),...tdsSectionsAsOf().map(s=>React.createElement('option',{key:s.code,value:s.code},s.label))])),
            React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-89'},'Rate (%)'),React.createElement('input',{id:'f-89',className:'form-control',type:'number',step:'0.1',value:vForm.tdsRate,onChange:vc('tdsRate'),placeholder:'e.g. 2'}))
          )
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowVendorModal(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:saveVendor},editVendor?'💾 Save Changes':'✓ Add Vendor')
        )
      )
    ),

    // ══════════════════════════════════
    // MODAL — ADD INVOICE
    // ══════════════════════════════════
    showWaInbox&&React.createElement(WhatsAppInbox,{salonId,onClose:()=>setShowWaInbox(false),
      onReview:(draft)=>{setShowWaInbox(false);setInvForm(BLANK_INV);setEditInvoiceId(null);setIntakeInitial({ai:draft.ai,attachment:draft.file,draftId:draft.id});setShowIntake(true);}}),
    showIntake&&React.createElement(InvoiceIntake,{vendors,salonId,initial:intakeInitial,
      onClose:()=>setShowIntake(false),
      onManual:()=>{setShowIntake(false);setInvForm(intakeInitial?{...BLANK_INV,attachment:intakeInitial.attachment}:BLANK_INV);if(intakeInitial)waInboxSetStatus(salonId,intakeInitial.draftId,'used');setShowInvModal(true);},
      onUse:(d,addVendor)=>{
        if(intakeInitial)waInboxSetStatus(salonId,intakeInitial.draftId,'used');
        let vid=d.vendorId;
        if(!vid&&addVendor){
          vid=nextPrefixedId(vendors,'V',3);
          setVendors(prev=>[...prev,{id:vid,name:d.vendorName||'Unnamed supplier',address:'',gst:d.gst||'',
            cat:d.category||defaultVendorCategoryFor(salonId),contact:'',phone:d.phone||'',email:d.email||'',terms:'30 days',status:'Active'}]);
        }
        const due=d.dueDate||(()=>{const p=parseInvoiceDateFlexible(d.invoiceDate);return p?localIsoOf(new Date(p.y,p.m-1,p.d+30)):'';})();
        const matchedVendor=vendors.find(v=>v.id===vid);
        // Taxable value goes into the form (it was only put in the description before, so the form's
        // total came out as GST only), and the bill itself is attached — not just its file name.
        const taxable=Number(d.taxable)||0;
        const gstSum=(Number(d.cgst)||0)+(Number(d.sgst)||0)+(Number(d.igst)||0);
        setInvForm({...BLANK_INV,vendorId:vid||'',invoiceNo:d.invoiceNo||'',invoiceDate:d.invoiceDate||'',
          amount:d.amount||'',dueDate:due,
          taxable:taxable||(d.amount?Math.max(0,Math.round((Number(d.amount)-gstSum-(Number(d.freight)||0)-(Number(d.roundOff)||0))*100)/100):''),
          desc:d.desc||[taxable?'Taxable '+Math.round(taxable):null,gstSum?'GST '+Math.round(gstSum):null].filter(Boolean).join(' · '),
          attachment:null,
          docNature:d.docNature||'Tax Invoice',bookingDate:d.bookingDate||d.invoiceDate||'',
          igst:d.igst||'',cgst:d.cgst||'',sgst:d.sgst||'',freight:d.freight||'',roundOff:d.roundOff||'',linkedPI:'',assetLines:[],
          periodFrom:d.periodFrom||'',periodTo:d.periodTo||'', // bill period read from the bill — a bill for several months is split over them
          category:d.category||(addVendor?defaultVendorCategoryFor(salonId):(matchedVendor?matchedVendor.cat:''))});
        if(d._attachment)setInvForm(f=>({...f,attachment:d._attachment})); // already in cloud storage (WhatsApp bill)
        else if(d._file)readFileAsAttachment(d._file,rec=>setInvForm(f=>({...f,attachment:rec})),err=>toastError(err==='size'?'The bill is too large to attach (max 4MB) — attach a smaller copy.':'Could not attach the bill — please attach it again.'));
        setShowIntake(false);setShowInvModal(true);
      }}),
    showInvModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>{setShowInvModal(false);setEditInvoiceId(null);}},
      React.createElement('div',{className:'modal',style:{width:580},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},editInvoiceId!==null?'Edit Invoice / Voucher':'Add Invoice / Voucher',
          invForm.attachment?React.createElement('span',{className:'badge badge-green',style:{marginLeft:10,fontSize:9}},'Auto-filled from attachment'):null),
        React.createElement('div',{className:'form-row cols3'},
          React.createElement('div',{className:'form-group'},
            React.createElement('label',null,'Vendor *'),
            React.createElement('select',{className:'form-control',value:invForm.vendorId,onChange:e=>{
              const vid=e.target.value;
              const v=vendors.find(x=>x.id===vid);
              setInvForm(f=>({...f,vendorId:vid,category:f.category?f.category:(v?v.cat:'')}));
            }},
              React.createElement('option',{value:''},'— Select Vendor —'),
              React.createElement('option',{value:'__new__'},'+ Add New Vendor'),
              vendors.map(v=>React.createElement('option',{key:v.id,value:v.id},v.name))
            )
          ),
          React.createElement('div',{className:'form-group'},
            React.createElement('label',null,'Doc Nature *'),
            React.createElement('select',{className:'form-control',value:invForm.docNature||'Tax Invoice',onChange:ic('docNature')},
              ['Tax Invoice','Invoice','Performa Invoice'].map(o=>React.createElement('option',{key:o,value:o},o))
            )
          ),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,(invForm.docNature==='Performa Invoice'?'PI No. *':'Invoice / Voucher No. *')),React.createElement('input',{className:'form-control',value:invForm.invoiceNo,onChange:ic('invoiceNo'),placeholder:invForm.docNature==='Performa Invoice'?'e.g. PI-2024-001':'e.g. INV-2024-001'}))
        ),
        invForm.vendorId==='__new__'&&React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:14}},
          React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}},'New vendor — added to the Master Vendor List when you save (full details can be filled there later)'),
          React.createElement('div',{className:'form-row cols2'},
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'Vendor Name *'),React.createElement('input',{className:'form-control',autoFocus:true,value:invForm.newVendorName,onChange:ic('newVendorName'),placeholder:'e.g. Rajiv A Luthria'})),
            React.createElement('div',{className:'form-group'},React.createElement('label',null,'GST Number'),React.createElement('input',{className:'form-control',value:invForm.newVendorGst,onChange:ic('newVendorGst'),placeholder:'e.g. 07AABCX1234R1ZP',style:{textTransform:'uppercase'}}))
          ),
          React.createElement('div',{className:'form-row cols2',style:{marginBottom:0}},
            React.createElement('div',{className:'form-group',style:{marginBottom:0}},React.createElement('label',null,'Mobile No.'),React.createElement('input',{className:'form-control',value:invForm.newVendorPhone,onChange:ic('newVendorPhone'),placeholder:'98xxxxxxxx'})),
            React.createElement('div',{className:'form-group',style:{marginBottom:0}},React.createElement('label',null,'Payment Terms'),React.createElement('select',{className:'form-control',value:invForm.newVendorTerms,onChange:ic('newVendorTerms')},['7 days','15 days','30 days','45 days','60 days','90 days','Advance'].map(t=>React.createElement('option',{key:t},t))))
          ),
          React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:6}},'The vendor’s category is taken from the Category chosen below.')
        ),
        React.createElement('div',{className:'form-row cols3'},
          React.createElement('div',{className:'form-group'},
            React.createElement('label',null,'Category *'),
            React.createElement('select',{className:'form-control',value:invForm.category||'',onChange:e=>{
              const val=e.target.value;
              setInvForm(f=>({...f,category:val,assetLines:(val==='Fixed Assets'&&(!f.assetLines||!f.assetLines.length))?[{id:'AL1',name:'',amount:''}]:(f.assetLines||[])}));
            }},
              React.createElement('option',{value:''},'— Select Category —'),
              withBizCategories(['Purchase of Cosmetic','Housekeeping','Equipment','Utilities','Rent','DG Rent','Drycleaning Expenses','Professional Fee','Staff Room Rent','Royalty','Electricity Expenses','Uniform Expenses','Telephone & Internet Expenses','Maintenance Expenses','Marketing','Fixed Assets','Other'],salonId).map(c=>React.createElement('option',{key:c,value:c},c))
            )
          )
        ),
        // ── Fixed Assets — one or more distinct assets on this single invoice, each with its own
        // name and amount (e.g. chairs ₹50,000 + mirror ₹30,000 + reception desk ₹70,000 on one
        // ₹1,50,000 bill). Each line gets its own depreciation Block later, on the Depreciation tab.
        // Whether an asset's amount should include GST depends on this outlet's GST Input Credit
        // setting (Master Sheet → Edit Salon → GST Input Tax Credit) — if ITC isn't claimable, the
        // GST paid is a real, non-recoverable cost and belongs in the capitalized asset value. ──
        invForm.category==='Fixed Assets'&&React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:14}},
          React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}},
            React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em'}},'Assets on this Invoice *'),
            React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:addAssetLine},'+ Add Another Asset')
          ),
          (()=>{const itcAllowed=gstInputAllowedAsOf(salon,invForm.invoiceDate);return React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:8}},
            itcAllowed
              ?'Enter each asset\'s pre-GST (Taxable Value) amount — GST is tracked separately as recoverable input credit.'
              :'This outlet can\'t claim GST Input Credit as of this invoice date — enter each asset\'s GST-INCLUSIVE amount, since the GST paid is a real cost that belongs in the capitalized value.');
          })(),
          (invForm.assetLines||[]).length===0&&React.createElement('div',{style:{fontSize:12,color:'var(--text3)',padding:'6px 0'}},'No assets added yet — click "+ Add Another Asset".'),
          (invForm.assetLines||[]).map((line,idx)=>React.createElement('div',{key:line.id,style:{display:'flex',gap:8,alignItems:'center',marginBottom:8}},
            React.createElement('input',{className:'form-control',style:{flex:2},placeholder:'Asset name, e.g. Salon chairs (4)',value:line.name,onChange:e=>updateAssetLine(line.id,'name',e.target.value)}),
            React.createElement('input',{className:'form-control',type:'number',style:{flex:1},placeholder:'Amount (₹)',value:line.amount,onChange:e=>updateAssetLine(line.id,'amount',e.target.value)}),
            (invForm.assetLines||[]).length>1&&React.createElement('button',{type:'button','aria-label':'Remove',className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>removeAssetLine(line.id)},'✕')
          )),
          (invForm.assetLines||[]).length>0&&(()=>{
            const itcAllowed=gstInputAllowedAsOf(salon,invForm.invoiceDate);
            const lineTotal=(invForm.assetLines||[]).reduce((s,l)=>s+(Number(l.amount)||0),0);
            const taxable=Number(invForm.taxable)||0;
            const invoiceTotal=(Number(invForm.taxable)||0)+(Number(invForm.igst)||0)+(Number(invForm.cgst)||0)+(Number(invForm.sgst)||0)+(Number(invForm.freight)||0)+(Number(invForm.roundOff)||0);
            const reference=itcAllowed?taxable:invoiceTotal;
            const referenceLabel=itcAllowed?'Taxable Value':'Invoice Total (GST-inclusive)';
            const matches=Math.abs(lineTotal-reference)<1;
            return React.createElement('div',{style:{fontSize:11.5,color:matches?'var(--green)':'var(--orange)',marginTop:4}},
              'Assets total: ₹'+lineTotal.toLocaleString('en-IN')+' · '+referenceLabel+': ₹'+reference.toLocaleString('en-IN')+(matches?' ✓':' — these don\'t match; that\'s fine if the invoice includes freight/installation split differently, otherwise double-check'));
          })()
        ),
        invForm.docNature!=='Performa Invoice'&&piPrompt==='unanswered'&&React.createElement('div',{className:'attention-card',style:{marginBottom:14}},
          React.createElement('div',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)',marginBottom:4}},'⚠ '+getVendorName(invForm.vendorId)+' has a pending Performa Invoice'),
          React.createElement('div',{style:{fontSize:12,color:'var(--text2)',marginBottom:10}},'Is this '+invForm.docNature+' being booked against a Performa Invoice already on file?'),
          React.createElement('div',{style:{display:'flex',gap:8}},
            React.createElement('button',{className:'btn btn-primary btn-sm',onClick:()=>setPiPrompt('yes')},'Yes — link it to a PI'),
            React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>{setPiPrompt('no');setInvForm(f=>({...f,linkedPI:''}));}},'No — standalone '+invForm.docNature)
          )
        ),
        invForm.docNature!=='Performa Invoice'&&piPrompt==='yes'&&React.createElement('div',{className:'form-group',style:{marginBottom:14}},
          React.createElement('label',null,'Performa Invoice Reference *'),
          React.createElement('select',{className:'form-control',value:invForm.linkedPI,onChange:ic('linkedPI')},
            React.createElement('option',{value:''},'— Select the Performa Invoice —'),
            invoices.filter(inv=>inv.docNature==='Performa Invoice'&&(!invForm.vendorId||inv.vendorId===invForm.vendorId)&&isPIOpen(inv))
              .map(inv=>React.createElement('option',{key:piKey(inv),value:piKey(inv)},inv.invoiceNo+' · '+getVendorName(inv.vendorId)+' · ₹'+Number(inv.amount).toLocaleString('en-IN')))
          ),
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:5}},'Confirms this Tax Invoice was received against that Performa Invoice — it stops showing as pending once this is saved.')
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',null,invForm.docNature==='Performa Invoice'?'PI Date *':'Invoice Date *'),React.createElement('input',{type:'date',className:'form-control',value:invForm.invoiceDate,onChange:ic('invoiceDate')})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-90'},'Booking Date'),React.createElement('input',{id:'f-90',type:'date',className:'form-control',value:invForm.bookingDate||invForm.invoiceDate,onChange:ic('bookingDate')}))
        ),
        React.createElement('div',{className:'form-row cols3'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-91'},'Taxable Value (₹)'),React.createElement('input',{id:'f-91',type:'number',className:'form-control',value:invForm.taxable,onChange:ic('taxable'),placeholder:'0'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-92'},'IGST (₹)'),React.createElement('input',{id:'f-92',type:'number',className:'form-control',value:invForm.igst,onChange:ic('igst'),placeholder:'0',disabled:invSupply==='intra',title:invSupply==='intra'?gstSupplyNote('intra'):''})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-93'},'CGST (₹)'),React.createElement('input',{id:'f-93',type:'number',className:'form-control',value:invForm.cgst,onChange:ic('cgst'),placeholder:'0',disabled:invSupply==='inter',title:invSupply==='inter'?gstSupplyNote('inter'):''}))
        ),
        React.createElement('div',{className:'form-row cols4'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-94'},'SGST (₹)'),React.createElement('input',{id:'f-94',type:'number',className:'form-control',value:invForm.sgst,onChange:ic('sgst'),placeholder:'0',disabled:invSupply==='inter',title:invSupply==='inter'?gstSupplyNote('inter'):''})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-97'},'Freight (₹)'),React.createElement('input',{id:'f-97',type:'number',className:'form-control',value:invForm.freight,onChange:ic('freight'),placeholder:'0'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-95'},'Round Off (₹)'),React.createElement('input',{id:'f-95',type:'number',className:'form-control',value:invForm.roundOff,onChange:ic('roundOff'),placeholder:'0'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',null,(invForm.docNature==='Performa Invoice'?'PI Total (₹)':'Invoice Total (₹)')),
            React.createElement('input',{className:'form-control',value:((Number(invForm.taxable)||0)+(Number(invForm.igst)||0)+(Number(invForm.cgst)||0)+(Number(invForm.sgst)||0)+(Number(invForm.freight)||0)+(Number(invForm.roundOff)||0)).toLocaleString('en-IN'),disabled:true,style:{opacity:0.85,fontWeight:700,color:'var(--accent)'}}))
        ),
        invSupply&&React.createElement('div',{style:{fontSize:11.5,color:'var(--accent)',margin:'2px 0 6px'}},'ℹ '+gstSupplyNote(invSupply)),
        React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:-6,marginBottom:14}},'Auto-calculated: Taxable Value + IGST + CGST + SGST + Freight + Round Off'),
        invForm.docNature!=='Performa Invoice'&&(()=>{
          const tot=(Number(invForm.taxable)||0)+(Number(invForm.igst)||0)+(Number(invForm.cgst)||0)+(Number(invForm.sgst)||0)+(Number(invForm.freight)||0)+(Number(invForm.roundOff)||0);
          const sp=billSplitMonths(invForm.periodFrom,invForm.periodTo);
          const on=!!(invForm.periodFrom||invForm.periodTo);
          const two=()=>{const p=parseInvoiceDateFlexible(invForm.invoiceDate);if(!p)return;const cur=p.y*12+p.m-1;const ym=i=>Math.floor(i/12)+'-'+String(i%12+1).padStart(2,'0');setInvForm(f=>({...f,periodFrom:ym(cur-1),periodTo:ym(cur)}));};
          return React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 12px',marginBottom:14}},
            React.createElement('label',{style:{display:'flex',gap:8,alignItems:'center',fontSize:12.5,fontWeight:600,cursor:'pointer'}},
              React.createElement('input',{type:'checkbox',checked:on,onChange:e=>{if(e.target.checked)two();else setInvForm(f=>({...f,periodFrom:'',periodTo:''}));}}),
              'Bill covers more than one month (e.g. a 2-month electricity bill) — split it equally in the P&L'),
            on&&React.createElement('div',{style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',marginTop:8,fontSize:11.5,color:'var(--text2)'}},
              'Quick:',
              [['Previous + this month',-1,0],['This + next month (advance)',0,1],['This + next 2 months (advance)',0,2]].map(([l,a,b])=>React.createElement('button',{key:l,type:'button',className:'btn btn-ghost btn-sm',style:{fontSize:11,padding:'2px 9px'},
                onClick:()=>{const p=parseInvoiceDateFlexible(invForm.invoiceDate);if(!p){alert('Enter the Invoice Date first.');return;}const cur=p.y*12+p.m-1;const ym=i=>Math.floor(i/12)+'-'+String(i%12+1).padStart(2,'0');setInvForm(f=>({...f,periodFrom:ym(cur+a),periodTo:ym(cur+b)}));}},l))),
            on&&React.createElement('div',{style:{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end',marginTop:8}},
              React.createElement('div',{className:'form-group',style:{marginBottom:0}},React.createElement('label',null,'From month'),React.createElement('input',{type:'month',className:'form-control',value:invForm.periodFrom,onChange:ic('periodFrom')})),
              React.createElement('div',{className:'form-group',style:{marginBottom:0}},React.createElement('label',null,'To month'),React.createElement('input',{type:'month',className:'form-control',value:invForm.periodTo,onChange:ic('periodTo')}))),
            on&&sp&&sp.months>1&&React.createElement('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginTop:8,fontSize:12,color:'var(--text2)'}},
              'Amount for the 1st month (optional):',
              React.createElement('input',{type:'number',className:'form-control',style:{width:130},placeholder:'equal split',value:invForm.splitFirst||'',onChange:ic('splitFirst')}),
              Number(invForm.splitFirst)>0&&tot>0&&React.createElement('span',null,(Number(invForm.splitFirst)<tot?'rest '+rupee(Math.round((tot-Number(invForm.splitFirst))*100)/100)+(sp.months>2?' shared by the other months':' in '+monthLabelOfIndex(sp.last)):'must be less than the total'))),
            on&&React.createElement('div',{style:{fontSize:12,marginTop:8,color:sp?'var(--text)':'var(--orange)',lineHeight:1.6}},
              sp?(sp.months>1?(tot>0?'P&L: '+billSplitText(tot,sp,invForm.splitFirst):'P&L: the bill total will be split equally over '+sp.months+' months ('+monthLabelOfIndex(sp.first)+' – '+monthLabelOfIndex(sp.last)+').'):'One month — the whole bill goes in '+monthLabelOfIndex(sp.first)+'.'):'Choose the From and To months printed on the bill (To can’t be before From).'));
        })(),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-96'},'Due Date'),React.createElement('input',{id:'f-96',type:'date',className:'form-control',value:invForm.dueDate,onChange:ic('dueDate')}))
        ),
        React.createElement('div',{className:'form-row'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-98'},'Description'),React.createElement('input',{id:'f-98',className:'form-control',value:invForm.desc,onChange:ic('desc'),placeholder:'e.g. Hair products — January batch'}))
        ),
        // Attachment upload
        React.createElement('div',{className:'form-group',style:{marginBottom:14}},
          React.createElement('label',null,'Attach Invoice / Voucher Copy'+(outletSettings(salonId).attachmentRequired?' * (required for this outlet)':'')),
          React.createElement('div',{style:{background:'var(--bg3)',border:'1px dashed '+(outletSettings(salonId).attachmentRequired&&!invForm.attachment?'var(--orange)':'var(--border2)'),borderRadius:'var(--r)',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}},
            React.createElement('input',{type:'file',accept:'image/*,.pdf',style:{display:'none'},id:'inv-attach',onChange:e=>{const f=e.target.files[0];if(f)readFileAsAttachment(f,rec=>{setInvForm(prev=>({...prev,attachment:rec}));toastSuccess('Attachment added');},err=>toastError(err==='size'?'That file is too large (max 4MB).':"Couldn't read that file — please try again."));e.target.value='';}}),
            React.createElement('label',{htmlFor:'inv-attach',style:{cursor:'pointer',fontSize:12,color:'var(--accent)',display:'flex',alignItems:'center',gap:6}},
              '📎 ',invForm.attachment?(typeof invForm.attachment==='string'?invForm.attachment:invForm.attachment.name):'Choose file (JPG / PDF)'
            ),
            invForm.attachment&&typeof invForm.attachment!=='string'&&invForm.attachment.dataUrl&&React.createElement('span',{title:'Download',style:{fontSize:12,color:'var(--blue)',cursor:'pointer'},onClick:()=>downloadAttachment(invForm.attachment,'attachment')},'⬇'),
            invForm.attachment&&React.createElement('button',{style:{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:12,marginLeft:'auto'},onClick:()=>{if(confirm('Remove the attached file?'))setInvForm(f=>({...f,attachment:null}));}},'✕ Remove')
          )
        ),
        // Payments — only for an invoice that already exists (editInvoiceId set); a brand-new
        // invoice has none yet. Same info/actions as the View modal's own Payment History, just
        // available right here too, so editing the invoice and correcting a payment don't need
        // two separate trips through two different modals.
        editInvoiceId!==null&&(()=>{
          const editingInv=invoices.find(x=>x.id===editInvoiceId);
          if(!editingInv||editingInv.docNature==='Performa Invoice')return null;
          return React.createElement('div',{style:{marginBottom:14}},
            React.createElement('label',null,'Payments'),
            (editingInv.payments||[]).length===0
              ?React.createElement('div',{style:{fontSize:12,color:'var(--text3)',padding:'8px 0'}},'No payments recorded yet.')
              :editingInv.payments.map(p=>
                  React.createElement('div',{key:p.id,style:{background:'rgba(76,175,125,0.08)',border:'1px solid rgba(76,175,125,0.2)',borderRadius:'var(--r)',padding:'10px 12px',marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}},
                    React.createElement('div',null,
                      React.createElement('div',{style:{fontWeight:600,color:'var(--green)',fontSize:13}},rupee(Number(p.paidAmount))),
                      React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:2}},p.paidDate+' · '+p.mode+(p.ref?' · Ref: '+p.ref:'')),
                      p.note&&React.createElement('div',{style:{fontSize:11,color:'var(--text2)',marginTop:1}},p.note)
                    ),
                    React.createElement('div',{style:{display:'flex',alignItems:'center',gap:6}},
                      React.createElement('button',{className:'btn btn-ghost btn-sm',style:{padding:'2px 6px',fontSize:10.5},onClick:()=>{setShowInvModal(false);editPayment(editingInv.id,p.id);}},'✎ Edit'),
                      React.createElement('button',{'aria-label':'Delete',className:'btn btn-ghost btn-sm',style:{padding:'2px 6px',fontSize:10.5,color:'var(--red)'},onClick:()=>deletePayment(editingInv.id,p.id)},React.createElement(IconTrash,{size:14}))
                    )
                  )
                ),
            React.createElement('button',{className:'btn btn-ghost btn-sm',style:{marginTop:2},onClick:()=>{setShowInvModal(false);setPayForm({...BLANK_PAY,invoiceId:editingInv.id});setMatchedBankRowId(null);setShowPayModal(true);}},'+ Record New Payment')
          );
        })(),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>{setShowInvModal(false);setEditInvoiceId(null);}},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:saveInvoice},editInvoiceId!==null?'💾 Update Invoice':'✓ Save Invoice')
        )
      )
    ),

    // ══════════════════════════════════
    // MODAL — RECORD PAYMENT
    // ══════════════════════════════════
    showPayModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowPayModal(false)},
      React.createElement('div',{className:'modal',style:{width:500},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},payForm.editingPaymentId!==null?'Edit Payment':'Record Payment'),
        payForm.invoiceId!==null&&(()=>{
          const payInv=invoices.find(x=>x.id===payForm.invoiceId);
          return React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:16,fontSize:12}},
            React.createElement('div',{style:{fontWeight:500,color:'var(--text)'}},getVendorName(payInv?.vendorId)),
            React.createElement('div',{style:{color:'var(--text3)',marginTop:2}},payInv?.invoiceNo+' · Invoice ₹'+Number(payInv?.amount||0).toLocaleString('en-IN')),
            React.createElement('div',{style:{color:'var(--orange)',marginTop:2,fontWeight:500}},'Balance: ₹'+getBalance(payInv||{amount:0,payments:[]}).toLocaleString('en-IN')),
            // One payment that also settles other bills of this vendor: tick their invoice numbers.
            payForm.editingPaymentId===null&&payInv&&(()=>{
              const others=invoices.filter(i=>i.id!==payInv.id&&String(i.vendorId)===String(payInv.vendorId)&&!isPI(i)&&getBalance(i)>0.5);
              if(!others.length)return null;
              const tot=getBalance(payInv)+others.filter(o=>payAlso.has(o.id)).reduce((t,o)=>t+getBalance(o),0);
              return React.createElement('div',{style:{marginTop:10,paddingTop:8,borderTop:'1px dashed var(--border)'}},
                React.createElement('div',{style:{fontWeight:600,color:'var(--text)',marginBottom:4}},'Does this payment also cover other invoices of this vendor? Tick the invoice nos.:'),
                React.createElement('div',{style:{maxHeight:130,overflowY:'auto'}},others.map(o=>React.createElement('label',{key:o.id,style:{display:'flex',gap:8,alignItems:'center',padding:'2px 0',cursor:'pointer'}},
                  React.createElement('input',{type:'checkbox',checked:payAlso.has(o.id),onChange:()=>setPayAlso(p=>{const n=new Set(p);n.has(o.id)?n.delete(o.id):n.add(o.id);return n;})}),
                  React.createElement('span',{style:{fontFamily:'monospace',fontSize:11,minWidth:120}},o.invoiceNo),React.createElement('span',{style:{minWidth:84}},o.invoiceDate),React.createElement('span',null,'balance ₹'+Math.round(getBalance(o)).toLocaleString('en-IN'))))),
                payAlso.size>0&&React.createElement('button',{className:'btn btn-primary btn-sm',style:{marginTop:8},onClick:()=>{
                  const ids=[payInv.id,...others.filter(o=>payAlso.has(o.id)).map(o=>o.id)];
                  setShowPayModal(false);setPayAlso(new Set());
                  setShowMultiPay({vid:payInv.vendorId,ids,amount:Number(payForm.paidAmount)>0&&Number(payForm.paidAmount)!==getBalance(payInv)?payForm.paidAmount:Math.round(tot*100)/100,date:payForm.paidDate,mode:payForm.mode,ref:payForm.ref});
                }},'Continue — one payment for '+(payAlso.size+1)+' invoices (₹'+Math.round(tot).toLocaleString('en-IN')+') →'));
            })()
          );
        })(),
        payForm.invoiceId!==null&&payForm.editingPaymentId===null&&payForm.fromDailySales&&React.createElement('div',{style:{fontSize:11,color:'var(--text3)',background:'var(--bg3)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:16}},
          '💵 Recorded as Cash from Daily Sales & Exp — no bank statement to match against.'),
        payForm.invoiceId!==null&&payForm.editingPaymentId===null&&!payForm.fromDailySales&&(()=>{
          const vendorId=invoices.find(x=>x.id===payForm.invoiceId)?.vendorId;
          const vendor=vendors.find(v=>v.id===vendorId);
          const candidates=bankRows.filter(r=>r.debit>0&&!r.linkedInvoice&&vendor&&findVendorMatch(r.description,[vendor]));
          return React.createElement('div',{style:{marginBottom:16}},
            React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}},
              React.createElement('div',{style:{fontSize:11.5,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.06em'}},'🔗 Match from Bank Statement'),
              React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:10.5,padding:'2px 8px'},onClick:refreshBankRows},'⟳ Refresh')
            ),
            candidates.length===0
              ?React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',padding:'10px 0'}},'No unmatched debit transactions found for this vendor in Bank Statement.')
              :React.createElement('div',{style:{maxHeight:140,overflowY:'auto'}},
                  candidates.map(r=>React.createElement('div',{key:r.id,
                    onClick:()=>applyBankMatch(r,payForm.invoiceId),
                    style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',border:'1px solid '+(matchedBankRowId===r.id?'var(--green)':'var(--border)'),borderRadius:'var(--r)',marginBottom:6,cursor:'pointer',background:matchedBankRowId===r.id?'rgba(76,175,125,0.08)':'transparent'}
                  },
                    React.createElement('div',null,
                      React.createElement('div',{style:{fontSize:12,color:'var(--text)'}},r.description),
                      React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)'}},r.transactionDate+(r.refNo?' · Ref '+r.refNo:''))
                    ),
                    React.createElement('div',{style:{fontWeight:600,color:'var(--red)',fontSize:12.5}},rupee(Number(r.debit)))
                  ))
                ),
            matchedBankRowId!=null&&React.createElement('div',{style:{fontSize:11,color:'var(--green)',marginTop:4}},'✓ Selected — amount, date and reference filled in below. Change any field if needed.')
          );
        })(),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-98'},'Paid Amount (₹) *'),React.createElement('input',{id:'f-98',type:'number',className:'form-control',value:payForm.paidAmount,onChange:pc('paidAmount'),placeholder:'0'})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-99'},'Payment Date *'),React.createElement('input',{id:'f-99',type:'date',className:'form-control',value:payForm.paidDate,onChange:pc('paidDate')}))
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-100'},'Payment Mode'),React.createElement('select',{id:'f-100',className:'form-control',value:payForm.mode,onChange:pc('mode')},PAY_MODES.map(m=>React.createElement('option',{key:m},m)))),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-101'},'Reference / UTR No.'),React.createElement('input',{id:'f-101',className:'form-control',value:payForm.ref,onChange:pc('ref'),placeholder:'Transaction ref'}))
        ),
        React.createElement('div',{className:'form-group',style:{marginBottom:14}},React.createElement('label',{htmlFor:'f-102'},'Notes'),React.createElement('input',{id:'f-102',className:'form-control',value:payForm.note,onChange:pc('note'),placeholder:'Optional note'})),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowPayModal(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-success',onClick:savePay},payForm.editingPaymentId!==null?'💾 Update Payment':'✓ Record Payment')
        )
      )
    ),

    // ══════════════════════════════════
    // MODAL — VIEW INVOICE DETAIL
    // ══════════════════════════════════
    showViewModal&&viewInv&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowViewModal(false)},
      React.createElement('div',{className:'modal',style:{width:560},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title',style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
          React.createElement('span',null,(isPI(viewInv.inv)?'Performa Invoice — ':'Invoice — ')+viewInv.inv.invoiceNo),
          isPI(viewInv.inv)
            ?React.createElement('span',{className:'badge '+(isPIOpen(viewInv.inv)?'badge-red':'badge-green')},isPIOpen(viewInv.inv)?'Pending Tax Invoice':'Settled')
            :React.createElement('span',{className:`badge ${getBalance(viewInv.inv)<=0?'badge-green':isOverdue(viewInv.inv)?'badge-red':'badge-amber'}`},getBalance(viewInv.inv)<=0?'Cleared':isOverdue(viewInv.inv)?'Overdue':'Pending')
        ),
        React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:14,marginBottom:14}},
          [['Vendor',getVendorName(viewInv.inv.vendorId)],['Invoice No',viewInv.inv.invoiceNo],['Invoice Date',viewInv.inv.invoiceDate],['Due Date',viewInv.inv.dueDate],['Description',viewInv.inv.desc],['Invoice Amount',rupee(Number(viewInv.inv.amount))]].map(([k,v])=>
            React.createElement('div',{key:k,className:'stat-row'},React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},k),React.createElement('span',{style:{fontSize:12,color:'var(--text)',fontWeight:k==='Invoice Amount'?600:400}},v||'—'))
          ),
          !isPI(viewInv.inv)&&linkedPIFor(viewInv.inv)&&React.createElement('div',{className:'stat-row'},React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'Booked Against PI'),React.createElement('span',{style:{fontSize:12,color:'var(--green)'}},linkedPIFor(viewInv.inv).invoiceNo)),
          isPI(viewInv.inv)&&linkingTaxInvoiceFor(viewInv.inv)&&React.createElement('div',{className:'stat-row'},React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'Replaced By'),React.createElement('span',{style:{fontSize:12,color:'var(--green)'}},linkingTaxInvoiceFor(viewInv.inv).invoiceNo)),
          viewInv.inv.attachment&&React.createElement('div',{className:'stat-row'},React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'Attachment'),React.createElement('span',{style:{fontSize:12,color:'var(--green)'}},'📎 '+viewInv.inv.attachment))
        ),
        isPI(viewInv.inv)
          ?React.createElement('div',{style:{fontSize:12,color:'var(--text3)',padding:'8px 0 14px'}},'A Performa Invoice isn\'t paid directly — record the payment on the Tax Invoice/Invoice booked against it instead. Do that from the Vendor Sheet\'s Add Invoice flow, linking it to this PI.')
          :React.createElement(React.Fragment,null,
            // Payment history
            React.createElement('div',{style:{marginBottom:14}},
              React.createElement('div',{style:{fontSize:12,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}},'Payment History'),
              viewInv.inv.payments.length===0
                ?React.createElement('div',{style:{fontSize:12,color:'var(--text3)',padding:'8px 0'}},'No payments recorded yet.')
                :viewInv.inv.payments.map((p)=>
                  React.createElement('div',{key:p.id,style:{background:'rgba(76,175,125,0.08)',border:'1px solid rgba(76,175,125,0.2)',borderRadius:'var(--r)',padding:'10px 12px',marginBottom:6}},
                    React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
                      React.createElement('div',null,
                        React.createElement('div',{style:{fontWeight:600,color:'var(--green)',fontSize:13}},rupee(Number(p.paidAmount))),
                        React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:2}},p.paidDate+' · '+p.mode+(p.ref?' · Ref: '+p.ref:'')),
                        p.note&&React.createElement('div',{style:{fontSize:11,color:'var(--text2)',marginTop:1}},p.note)
                      ),
                      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:6}},
                        React.createElement('span',{className:'badge badge-green'},'Paid'),
                        React.createElement('button',{className:'btn btn-ghost btn-sm',style:{padding:'2px 6px',fontSize:10.5},onClick:()=>editPayment(viewInv.id,p.id)},'Edit'),
                        React.createElement('button',{'aria-label':'Delete',className:'btn btn-ghost btn-sm',style:{padding:'2px 6px',fontSize:10.5,color:'var(--red)'},onClick:()=>deletePayment(viewInv.id,p.id)},React.createElement(IconTrash,{size:14}))
                      )
                    )
                  )
                ),
              React.createElement('div',{style:{display:'flex',justifyContent:'space-between',borderTop:'1px solid var(--border)',paddingTop:10,marginTop:6}},
                React.createElement('span',{style:{fontSize:12,color:'var(--text2)'}},'Total Paid: ₹'+getPaid(viewInv.inv).toLocaleString('en-IN')),
                React.createElement('span',{style:{fontSize:13,fontWeight:700,color:getBalance(viewInv.inv)<=0?'var(--green)':'var(--red)'}},getBalance(viewInv.inv)<=0?'Fully Cleared':'Balance: ₹'+getBalance(viewInv.inv).toLocaleString('en-IN'))
              )
            )
          ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowViewModal(false)},'Close'),
          !isPI(viewInv.inv)&&getBalance(viewInv.inv)>0&&React.createElement('button',{className:'btn btn-success',onClick:()=>{setShowViewModal(false);setPayForm({...BLANK_PAY,invoiceId:viewInv.id,paidAmount:getBalance(viewInv.inv)});setMatchedBankRowId(null);setShowPayModal(true);}},'Record Payment')
        )
      )
    ),

    bulkImportResult&&React.createElement('div',{className:'modal-overlay',onClick:()=>setBulkImportResult(null)},
      React.createElement('div',{className:'modal',style:{width:520,maxHeight:'80vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Bulk Import Results'),
        React.createElement('div',{style:{display:'flex',gap:10,marginBottom:16}},
          React.createElement('div',{className:'metric-card green',style:{flex:1}},React.createElement('div',{className:'metric-label'},'Imported'),React.createElement('div',{className:'metric-value'},bulkImportResult.added)),
          React.createElement('div',{className:'metric-card '+(bulkImportResult.failed.length?'red':'blue'),style:{flex:1}},React.createElement('div',{className:'metric-label'},'Skipped'),React.createElement('div',{className:'metric-value'},bulkImportResult.failed.length))
        ),
        bulkImportResult.added>0&&React.createElement('div',{style:{fontSize:12.5,color:'var(--green)',marginBottom:14}},'✓ '+bulkImportResult.added+' invoice'+(bulkImportResult.added===1?'':'s')+' added to Invoices & Payments.'),
        bulkImportResult.failed.length>0&&React.createElement('div',{style:{marginBottom:8}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}},'Rows skipped — fix and re-import just these rows'),
          React.createElement('div',{style:{maxHeight:220,overflowY:'auto'}},
            bulkImportResult.failed.map((msg,i)=>React.createElement('div',{key:i,style:{fontSize:12,color:'var(--text2)',padding:'6px 10px',background:'rgba(255,107,107,0.08)',borderRadius:6,marginBottom:4}},msg))
          )
        ),
        bulkImportResult.added===0&&bulkImportResult.failed.length===0&&React.createElement('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No rows found in that file — make sure Vendor Name and the sheet\'s first row of headers match the template.'),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-primary',onClick:()=>setBulkImportResult(null)},'Close')
        )
      )
    ),

    // ── BULK DELETE CONFIRM MODAL (Invoices & Payments) ──
    showBulkDeleteConfirm&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowBulkDeleteConfirm(false)},
      React.createElement('div',{className:'modal',style:{width:440},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title',style:{color:'var(--red)'}},'🗑 Delete '+bulkSelectedIds.size+' Invoice'+(bulkSelectedIds.size===1?'':'s')),
        React.createElement('div',{style:{fontSize:13,color:'var(--text2)',lineHeight:1.7,marginBottom:16}},
          'Delete the '+bulkSelectedIds.size+' selected invoice'+(bulkSelectedIds.size===1?'':'s')+'? ',
          React.createElement('span',{style:{color:'var(--red)',fontWeight:500}},'Any payments recorded against them will be removed too.'),
          ' You\'ll get a few seconds to Undo right after.'
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowBulkDeleteConfirm(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-danger',onClick:()=>{bulkDeleteInvoices();setShowBulkDeleteConfirm(false);}},'Yes, Delete '+bulkSelectedIds.size)
        )
      )
    )
  );
}

// ── Fixed Assets — a read-only register, not its own data entry screen. Every row here is a
// Vendor invoice booked with Category = "Fixed Assets"; the only way to add, edit, or remove an
// entry is from the Vendors tab itself (via onNavTab), so this can never drift out of sync with
// what's actually on file there. Payment status/balance are pulled from the same invoice record
// Vendors already tracks, so a payment recorded there shows up here automatically too. ──
// ── Tally Export — turns Vendor invoices and Bank Statement rows into Tally's own native XML
// import format (the same one every paid Excel/Tally connector produces under the hood), plus a
// plain CSV reference template. See the big comment block above buildTallyMastersXml for the
// full rationale on why XML (not XLS) is the reliable route, and why a true always-on connector
// isn't something a single downloadable HTML file can be. ──
// ── Bank Payment File — turns Salary Working, Incentive Working, and outstanding Vendor
// invoices into a downloadable Bulk NEFT/RTGS/IMPS payment file, ready for direct upload to a
// bank's corporate/net-banking bulk-payment portal. Uses the common column set most Indian
// banks' bulk upload accepts (Payment Type, Beneficiary Name/Account/IFSC, Amount, Debit
// Account, Remarks, Email, Mobile) — the exact column ORDER and any extra bank-specific header
// row can vary bank to bank and does change over time, so this is the reliable common core, not
// a guarantee every bank accepts it byte-for-byte. Always do one small test batch with your bank
// the first time before a full run. Saved as CSV, not XLSX — that's what most bank portals
// actually ask for. ──
const BANK_LAYOUT_FIELDS={paymentType:'Payment Type',name:'Beneficiary Name',account:'Beneficiary Account Number',ifsc:'IFSC Code',
  amount:'Amount',amount2:'Amount (2 decimals)',debit:'Debit Account Number',email:'Email',mobile:'Mobile',remarks:'Remarks',
  dateDmy:'Value Date (DD/MM/YYYY)',dateIso:'Value Date (YYYY-MM-DD)',code:'Employee / Vendor Code',blank:'(Blank column)',fixed:'(Fixed text)'};
const BANK_LAYOUT_DEFAULT_COLS=['paymentType','name','account','ifsc','amount','debit','email','mobile','remarks'];
function BankLayoutEditor({layout,onChange}){
  const h=React.createElement;
  const cols=layout.cols;
  const set=(i,patch)=>onChange({...layout,cols:cols.map((c,j)=>j===i?{...c,...patch}:c)});
  const move=(i,d)=>{const j=i+d;if(j<0||j>=cols.length)return;const n=cols.slice();const t=n[i];n[i]=n[j];n[j]=t;onChange({...layout,cols:n});};
  return h('div',{className:'card',style:{marginBottom:16}},
    h('div',{className:'card-title'},'Your bank’s file layout'),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10,lineHeight:1.6}},'Set the columns exactly as your bank’s bulk-upload sample shows them — order, header names, separator. Saved for this outlet. Do one small test batch with the bank the first time.'),
    cols.map((c,i)=>h('div',{key:i,style:{display:'flex',gap:6,alignItems:'center',marginBottom:6,flexWrap:'wrap'}},
      h('span',{style:{width:22,fontSize:11,color:'var(--text3)'}},i+1),
      h('select',{className:'form-control',style:{width:210},value:c.field,onChange:e=>set(i,{field:e.target.value,header:e.target.value==='fixed'?'':BANK_LAYOUT_FIELDS[e.target.value]})},
        Object.keys(BANK_LAYOUT_FIELDS).map(f=>h('option',{key:f,value:f},BANK_LAYOUT_FIELDS[f]))),
      h('input',{className:'form-control',style:{flex:1,minWidth:160},value:c.header,placeholder:c.field==='fixed'?'Text to put in every row':'Header name',onChange:e=>set(i,{header:e.target.value})}),
      h('button',{className:'btn btn-ghost btn-sm',title:'Move up',onClick:()=>move(i,-1)},'↑'),
      h('button',{className:'btn btn-ghost btn-sm',title:'Move down',onClick:()=>move(i,1)},'↓'),
      h('button',{className:'btn btn-ghost btn-sm',title:'Remove',onClick:()=>{if(!window.confirm('Remove this column from the file layout?'))return;onChange({...layout,cols:cols.filter((_,j)=>j!==i)});}},'✕'))),
    h('div',{style:{display:'flex',gap:14,alignItems:'center',flexWrap:'wrap',marginTop:8,fontSize:12.5,color:'var(--text2)'}},
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>onChange({...layout,cols:[...cols,{field:'blank',header:''}]})},'+ Add column'),
      h('label',{style:{display:'flex',gap:6,alignItems:'center'}},h('input',{type:'checkbox',checked:!!layout.headerRow,onChange:e=>onChange({...layout,headerRow:e.target.checked})}),'Header row'),
      h('label',{style:{display:'flex',gap:6,alignItems:'center'}},h('input',{type:'checkbox',checked:!!layout.typeCodes,onChange:e=>onChange({...layout,typeCodes:e.target.checked})}),'Payment type as N / R / I'),
      h('label',{style:{display:'flex',gap:6,alignItems:'center'}},'Separator',
        h('select',{className:'form-control',style:{width:'auto'},value:layout.sep,onChange:e=>onChange({...layout,sep:e.target.value})},
          [[',','Comma ,'],['|','Pipe |'],['~','Tilde ~'],['tab','Tab'],[';','Semicolon ;']].map(o=>h('option',{key:o[0],value:o[0]},o[1])))),
      h('label',{style:{display:'flex',gap:6,alignItems:'center'}},'File',
        h('select',{className:'form-control',style:{width:'auto'},value:layout.ext,onChange:e=>onChange({...layout,ext:e.target.value})},
          ['csv','txt'].map(o=>h('option',{key:o,value:o},'.'+o)))),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{if(confirm('Reset the layout to the standard columns?'))onChange({cols:BANK_LAYOUT_DEFAULT_COLS.map(f=>({field:f,header:BANK_LAYOUT_FIELDS[f]})),headerRow:true,sep:',',typeCodes:false,ext:'csv'});}},'Reset'))
  );
}
function BankPaymentSheet({period,salon,onNavTab}={}){
  const salonId=salon?.id;
  const {success,error:bpError,info}=useToast();
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today=new Date();
  const initCal=periodToCalendar(period);
  const [selMonth,setSelMonth]=useState(initCal?initCal.month:today.getMonth());
  const [selYear,setSelYear]=useState(initCal?initCal.year:today.getFullYear());
  useEffect(()=>{const cal=periodToCalendar(period);if(cal){setSelMonth(cal.month);setSelYear(cal.year);}},[period&&period.mi,period&&period.fy]);

  const [subTab,setSubTab]=useState('salary');
  // ── Bank selector — a single generic template genuinely doesn't work identically across banks
  // (confirmed from each bank's own published bulk-upload documentation, not assumption):
  //  • HDFC Bank (ENet/CBX) — publishes SEPARATE file structures for beneficiaries who hold an
  //    account WITHIN HDFC Bank (no IFSC needed) vs at OTHER banks (IFSC required) — so this
  //    screen now generates two separate files for HDFC, split automatically by each payee's IFSC.
  //  • ICICI Bank (CIB) — ICICI's own published "File Format for Bulk Upload in CIB" spec is a
  //    FIXED-WIDTH positional file (exact character positions/lengths per field), not a simple
  //    comma-separated file — a CSV won't be accepted as-is; the exact field layout needs to come
  //    from your RM/CIB admin, since it isn't uniformly published.
  //  • State Bank of India (CINB Vyapaar/Vistaar) — SBI's bulk upload supports single-debit/
  //    multiple-credit files, but production uploads are typically required to be ENCRYPTED
  //    (symmetric or PKI keys) before submission — a plain file's content can still be correct,
  //    but it will likely need encrypting through SBI-provided tools first.
  //  • Axis Bank, Kotak Mahindra Bank, Other — no verified bank-specific structural difference
  //    found; these use the same common Bulk NEFT/RTGS format as before. ──
  const [bankChoice,setBankChoiceRaw]=useState(()=>{try{return cachedLocalGet(outletKey('salonos_bank_payment_bank',salon?.id))||'Generic';}catch(e){return'Generic';}});
  const setBankChoice=(b)=>{setBankChoiceRaw(b);safeLocalSet(outletKey('salonos_bank_payment_bank',salonId),b);};
  const BANK_NOTES={
    'HDFC Bank':'HDFC\u2019s ENet/CBX portal uses separate file structures for beneficiaries within HDFC Bank (no IFSC needed) vs at other banks (IFSC required). This screen generates both files separately below \u2014 upload each to the matching section in ENet.',
    'ICICI Bank':'ICICI\u2019s own published CIB bulk-upload spec is a FIXED-WIDTH positional file (exact character positions per field), not a simple CSV \u2014 the file below almost certainly won\u2019t upload as-is. Get the exact field-position layout from your RM or CIB admin before relying on this.',
    'State Bank of India':'SBI\u2019s CINB (Vyapaar/Vistaar) bulk upload typically requires the file to be ENCRYPTED (symmetric or PKI keys) before submission. The content below is correct, but it will likely need encrypting through SBI-provided tools first \u2014 check with your branch/RM.',
    'IDFC First Bank':'IDFC FIRST Bank bulk-payment Excel (.xlsx) in the bank’s own template: row 1 headers, row 2 the bank’s instructions, payments from row 3. Transaction Type is IFT for IDFC FIRST beneficiaries (IFSC starting IDFB), else NEFT / RTGS by amount; date DD/MM/YYYY; currency INR. Custom Info 1–3 carry what the payment is for, the employee / vendor code and the outlet.',
    'Axis Bank':'No verified Axis-specific structural difference from the common Bulk NEFT/RTGS format \u2014 same caveat as always: confirm column order with Axis before a full batch.',
    'Kotak Mahindra Bank':'No verified Kotak-specific structural difference from the common Bulk NEFT/RTGS format \u2014 same caveat as always: confirm column order with Kotak before a full batch.',
    'Generic':'Uses the common Bulk NEFT/RTGS format most Indian banks\u2019 portals accept as a starting point. Column order and any extra header row your specific bank wants can vary \u2014 confirm before a full batch.',
    'Custom layout':'Your own column layout, set below to match your bank’s bulk-upload sample exactly (columns, order, header names, separator, N/R/I codes). Saved for this outlet.',
  };
  const [paymentMode,setPaymentMode]=useState('Auto');
  // RTGS is for ₹2,00,000 and above (no upper limit); NEFT has had no minimum or maximum since
  // 2019 but is the conventional choice below the RTGS threshold. When Payment Mode is set to
  // Auto, each payment gets NEFT or RTGS decided by its own amount rather than one mode applied
  // to the whole batch — IMPS is never auto-selected (that's a deliberate choice, not amount-based).
  const RTGS_THRESHOLD=200000;
  const paymentTypeFor=(amt)=>paymentMode==='Auto'?(Number(amt)>=RTGS_THRESHOLD?'RTGS':'NEFT'):paymentMode;
  const [debitAccount,setDebitAccount]=useState(salon?.bankAccountNo||'');
  useEffect(()=>{setDebitAccount(salon?.bankAccountNo||'');},[salonId]);
  const [valueDate,setValueDate]=useState(localTodayIso());
  // ── Custom layout (automation phase 3) — for a bank whose exact bulk-upload format isn't one
  // of the above: pick the columns, their order and header names, separator and payment-type
  // codes, once per outlet (kv salonos_bank_payment_layout_outlet_<id>). ──
  const LAYOUT_KEY=outletKey('salonos_bank_payment_layout',salonId);
  const [layout,setLayout]=useState(()=>{try{const v=JSON.parse(cachedLocalGet(LAYOUT_KEY)||'null');if(v&&Array.isArray(v.cols))return v;}catch(e){}
    return{cols:BANK_LAYOUT_DEFAULT_COLS.map(f=>({field:f,header:BANK_LAYOUT_FIELDS[f]})),headerRow:true,sep:',',typeCodes:false,ext:'csv'};});
  const saveLayout=(next)=>{setLayout(next);safeLocalSet(LAYOUT_KEY,JSON.stringify(next));};

  const [refreshTick,setRefreshTick]=useState(0);
  const doRefresh=()=>setRefreshTick(t=>t+1);

  const swReady=salaryAttendanceReady(salonId,selYear,selMonth);
  const swData=useMemo(()=>swReady?swWorkingsFor(salonId,selYear,selMonth):[],[salonId,selYear,selMonth,refreshTick,swReady]);
  const incData=useMemo(()=>incWorkingsFor(salonId,selYear,selMonth),[salonId,selYear,selMonth,refreshTick]);
  const vendors=useMemo(()=>loadVendors(salonId),[salonId,refreshTick]);
  const invoices=useMemo(()=>loadVendorInvoices(salonId).filter(inv=>inv.docNature!=='Performa Invoice'),[salonId,refreshTick]);
  const paidOfInv=(inv)=>(inv.payments||[]).reduce((s,p)=>s+(Number(p.paidAmount)||0),0);
  const vendorRows=useMemo(()=>invoices.filter(inv=>!invoiceNeedsApproval(inv,salonId)).map(inv=>{ // bills awaiting approval can't go in a payment file
    const bal=Math.round((Number(inv.amount)||0)-paidOfInv(inv));
    const v=vendors.find(x=>x.id===inv.vendorId);
    return{invId:inv.id||inv.invoiceNo,invoiceNo:inv.invoiceNo,balance:bal,vendor:v,desc:inv.desc||inv.category||''};
  }).filter(r=>r.balance>0&&r.vendor),[invoices,vendors]);

  // ── Salary rows ──
  const salaryEligible=swData.filter(e=>e.status==='Active'&&Number(e.net)>0);
  const [selSalary,setSelSalary]=useState(new Set());
  useEffect(()=>{setSelSalary(new Set());},[selYear,selMonth,salonId]);
  const [salaryAmt,setSalaryAmt]=useState({});
  const salaryAmtFor=(e)=>salaryAmt[e.id]!=null?salaryAmt[e.id]:e.net;

  // ── Incentive rows ──
  const incEligible=incData.filter(e=>Number(e.totalInc)>0);
  const [selIncentive,setSelIncentive]=useState(new Set());
  useEffect(()=>{setSelIncentive(new Set());},[selYear,selMonth,salonId]);
  const [incAmt,setIncAmt]=useState({});
  const incAmtFor=(e)=>incAmt[e.id]!=null?incAmt[e.id]:e.totalInc;

  // ── Vendor rows ──
  const [selVendor,setSelVendor]=useState(new Set());
  useEffect(()=>{setSelVendor(new Set());},[salonId,refreshTick]);
  const [vendorAmt,setVendorAmt]=useState({});
  const vendorAmtFor=(r)=>vendorAmt[r.invId]!=null?vendorAmt[r.invId]:r.balance;
  // One bank transfer per vendor: the ticked invoices of a vendor go as ONE line (total amount, all
  // invoice nos. in the remarks) instead of a separate transfer per invoice.
  const [combineVendor,setCombineVendor]=useState(true);

  const hasBank=(x)=>!!(x.bankName&&x.accountNo&&x.ifsc);

  const toggle=(setFn)=>(id)=>setFn(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});

  const rowsFor=(tab)=>{
    if(tab==='salary')return{eligible:salaryEligible,selected:selSalary,amtFor:salaryAmtFor};
    if(tab==='incentive')return{eligible:incEligible,selected:selIncentive,amtFor:incAmtFor};
    return{eligible:vendorRows,selected:selVendor,amtFor:vendorAmtFor};
  };

  const generateFile=(tab)=>{
    const {eligible,selected,amtFor:amtFor0}=rowsFor(tab);
    const amtFor=x=>x.__merged?x.amount:amtFor0(x);
    const withBank=eligible.filter(x=>tab==='vendor'?hasBank(x.vendor):hasBank(x));
    const missingBank=eligible.length-withBank.length;
    let chosen=(selected.size>0?withBank.filter(x=>selected.has(tab==='vendor'?x.invId:x.id)):withBank);
    if(tab==='vendor'&&combineVendor){
      const by=new Map();
      chosen.forEach(x=>{const k=String(x.vendor.id);const g=by.get(k);
        if(g){g.amount+=Math.round(Number(amtFor0(x))||0);g.invoiceNos.push(x.invoiceNo||'—');}
        else by.set(k,{__merged:true,vendor:x.vendor,invId:'V-'+k,amount:Math.round(Number(amtFor0(x))||0),invoiceNos:[x.invoiceNo||'—']});});
      chosen=[...by.values()].map(g=>({...g,invoiceNo:g.invoiceNos.join(', ')}));
    }
    if(!chosen.length){bpError('Nothing to include — select at least one payee with complete bank details.');return;}
    if(!debitAccount){bpError('Enter the Debit Account Number (this outlet\'s own bank account) before generating the file.');return;}
    const label=tab==='salary'?'Salary':tab==='incentive'?'Incentive':'VendorPayments';
    if(!bankFileApprovalOk(salon&&salon.id,chosen.reduce((t,x)=>t+(Math.round(Number(amtFor(x))||0)),0),chosen.length,label+' '+(valueDate||'')))return;
    const outletTag=salon?salon.name.split('—')[0].trim().replace(/\s+/g,''):'Outlet';
    const remarksFor=(x)=>tab==='salary'?'Salary '+MONTHS[selMonth]+' '+selYear:tab==='incentive'?'Incentive '+MONTHS[selMonth]+' '+selYear:'Payment against Inv# '+(x.invoiceNo||'—');
    if(tab==='vendor'&&combineVendor&&chosen.some(x=>x.invoiceNos&&x.invoiceNos.length>1))
      info('Invoices of the same vendor are combined into one transfer — after the bank pays, record it on Vendors with “💳 Pay Vendor” (tick the same invoices) and link it to the bank line.');
    const rowFor=(x,withIfsc)=>{
      const bank=tab==='vendor'?x.vendor:x;
      const name=bank.accountHolder||bank.name;
      const amt=Math.round(Number(amtFor(x))||0);
      const cells=withIfsc
        ?[paymentTypeFor(amt),name,bank.accountNo,bank.ifsc,amt,debitAccount,bank.email||'',bank.phone||bank.mobile||'',remarksFor(x)]
        :[name,bank.accountNo,amt,debitAccount,remarksFor(x)]; // HDFC within-bank: no Payment Type/IFSC needed
      return cells.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',');
    };
    const writeCsv=(rows,hdr,suffix)=>{
      const csv=[hdr.map(h=>'"'+h+'"').join(','),...rows].join('\n');
      downloadTextFile('\uFEFF'+csv,'BankPayment_'+label+'_'+outletTag+suffix+'_'+valueDate+'.csv','text/csv;charset=utf-8');
    };
    const modeSummary=(rows)=>{
      if(paymentMode!=='Auto')return paymentMode;
      const neft=rows.filter(x=>paymentTypeFor(Math.round(Number(amtFor(x))||0))==='NEFT').length;
      const rtgs=rows.length-neft;
      return 'Auto — '+neft+' NEFT, '+rtgs+' RTGS (₹'+RTGS_THRESHOLD.toLocaleString('en-IN')+'+)';
    };
    if(bankChoice==='Custom layout'){
      const sep=layout.sep==='tab'?'\t':layout.sep||',';
      const q=v=>{const s=String(v==null?'':v);return(s.indexOf(sep)!==-1||/["\n]/.test(s))?'"'+s.replace(/"/g,'""')+'"':s;};
      const dmy=valueDate?valueDate.split('-').reverse().join('/'):'';
      const valueFor=(x,f)=>{
        const bank=tab==='vendor'?x.vendor:x;const amt=Math.round(Number(amtFor(x))||0);const pt=paymentTypeFor(amt);
        switch(f){
          case'paymentType':return layout.typeCodes?(pt==='RTGS'?'R':pt==='IMPS'?'I':'N'):pt;
          case'name':return bank.accountHolder||bank.name;
          case'account':return bank.accountNo;
          case'ifsc':return bank.ifsc;
          case'amount':return amt;
          case'amount2':return amt.toFixed(2);
          case'debit':return debitAccount;
          case'email':return bank.email||'';
          case'mobile':return bank.phone||bank.mobile||'';
          case'remarks':return remarksFor(x);
          case'dateDmy':return dmy;
          case'dateIso':return valueDate;
          case'code':return tab==='vendor'?(x.vendor.id||''):(x.id||'');
          default:return'';
        }
      };
      const lines=chosen.map(x=>layout.cols.map(c=>c.field==='fixed'?q(c.header):q(valueFor(x,c.field))).join(sep));
      if(layout.headerRow)lines.unshift(layout.cols.map(c=>c.field==='fixed'?'':q(c.header)).join(sep));
      downloadTextFile((layout.ext==='csv'?'﻿':'')+lines.join('\r\n'),'BankPayment_'+label+'_'+outletTag+'_'+valueDate+'.'+(layout.ext||'csv'),layout.ext==='csv'?'text/csv;charset=utf-8':'text/plain;charset=utf-8');
      success(chosen.length+' payment(s) exported in your custom layout ('+modeSummary(chosen)+', total ₹'+chosen.reduce((s,x)=>s+(Math.round(Number(amtFor(x))||0)),0).toLocaleString('en-IN')+').'+(missingBank?' '+missingBank+' payee(s) were skipped — missing bank details.':''));
      return;
    }
    // IDFC FIRST Bank — the bank's own .xlsx template (headers + instruction row, data from row 3).
    if(bankChoice==='IDFC First Bank'){
      const H=['Beneficiary Name','Beneficiary Account Number','IFSC','Transaction Type','Debit Account Number','Transaction Date','Amount','Currency','Beneficiary Email ID','Remarks','Custom Header – 1','Custom Header – 2','Custom Header – 3','Custom Header – 4','Custom Header – 5'];
      const HELP=['Enter beneficiary name.\nMANDATORY','Enter beneficiary account number. \nThis can be IDFC FIRST Bank account or other Bank account.\nMANDATORY','Enter beneficiary bank IFSC code. Required only for Inter bank (NEFT/RTGS) payment.','Enter payment type:\nIFT - Within Bank payment\nNEFT - Inter-Bank(NEFT) payment\nRTGS - Inter-Bank(RTGS) payment\nMANDATORY','Enter debit account number. This should be IDFC FIRST Bank account only. User should have access to do transaction on this account',"Enter transaction value date. Should be today's date or future date.\nMANDATORY\nDD/MM/YYYY format",'Enter payment amount.\nMANDATORY','Enter transaction currency. Should be INR only.\nMANDATORY','Enter beneficiary email id\nOPTIONAL','Enter remarks\nOPTIONAL','Credit Advice:\nEnter Custom Info -1\nNote: Header label is editable in Row 1\nOPTIONAL','Credit Advice:\nEnter Custom Info -2\nNote: Header label is editable in Row 1\nOPTIONAL','Credit Advice:\nEnter Custom Info -3\nNote: Header label is editable in Row 1\nOPTIONAL','Credit Advice:\nEnter Custom Info -4\nNote: Header label is editable in Row 1\nOPTIONAL','Credit Advice:\nEnter Custom Info -5\nNote: Header label is editable in Row 1\nOPTIONAL'];
      const dmy=valueDate?valueDate.split('-').reverse().join('/'):'';
      const outletName=salon?salon.name.split('—')[0].trim():'';
      const data=chosen.map(x=>{
        const bank=tab==='vendor'?x.vendor:x;
        const amt=Math.round(Number(amtFor(x))||0);
        const ifsc=String(bank.ifsc||'').toUpperCase().trim();
        const pt=paymentTypeFor(amt);
        const type=ifsc.startsWith('IDFB')?'IFT':(pt==='RTGS'?'RTGS':'NEFT');
        const code=tab==='vendor'?(x.vendor.id||''):(x.empId||x.code||x.id||'');
        return[bank.accountHolder||bank.name,String(bank.accountNo||'').trim(),ifsc,type,String(debitAccount).trim(),dmy,amt,'INR',bank.email||'',remarksFor(x).slice(0,60),
          remarksFor(x),code,outletName,'',''];
      });
      const ws=XLSX.utils.aoa_to_sheet([H,HELP,...data]);
      // Account numbers as text (keeps leading zeros, never shown as 1.23E+13).
      for(let r=2;r<data.length+2;r++){['B','E'].forEach(c=>{const cell=ws[c+(r+1)];if(cell){cell.t='s';cell.v=String(cell.v);cell.z='@';}});}
      ws['!cols']=[{wch:26},{wch:22},{wch:13},{wch:16},{wch:20},{wch:16},{wch:12},{wch:9},{wch:24},{wch:34},{wch:30},{wch:14},{wch:20},{wch:14},{wch:14}];
      const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Sheet1');
      XLSX.writeFile(wb,'IDFC_'+label+'_'+outletTag+'_'+(valueDate||'').split('-').reverse().join('')+'.xlsx');
      const ift=data.filter(r=>r[3]==='IFT').length;
      success(chosen.length+' payment(s) in the IDFC FIRST Bank Excel ('+ift+' IFT, '+(chosen.length-ift)+' NEFT/RTGS), total ₹'+data.reduce((s,r)=>s+r[6],0).toLocaleString('en-IN')+'. Upload it in IDFC FIRST Business Banking → Bulk Payments.'+(missingBank?' '+missingBank+' payee(s) were skipped — no bank details.':''));
      return;
    }
    if(bankChoice==='HDFC Bank'){
      const within=chosen.filter(x=>String((tab==='vendor'?x.vendor:x).ifsc||'').toUpperCase().startsWith('HDFC'));
      const other=chosen.filter(x=>!String((tab==='vendor'?x.vendor:x).ifsc||'').toUpperCase().startsWith('HDFC'));
      if(within.length)writeCsv(within.map(x=>rowFor(x,false)),['Beneficiary Name','Beneficiary Account Number','Amount','Debit Account Number','Remarks'],'_HDFC_WithinBank');
      if(other.length)writeCsv(other.map(x=>rowFor(x,true)),['Payment Type','Beneficiary Name','Beneficiary Account Number','Beneficiary IFSC Code','Amount','Debit Account Number','Beneficiary Email','Beneficiary Mobile','Remarks'],'_HDFC_OtherBank');
      success(chosen.length+' payment(s) split into '+(within.length&&other.length?'2 files (Within HDFC Bank + Other Bank)':within.length?'1 file (all Within HDFC Bank)':'1 file (all Other Bank)')+', total ₹'+chosen.reduce((s,x)=>s+(Math.round(Number(amtFor(x))||0)),0).toLocaleString('en-IN')+(other.length?'. Other Bank file: '+modeSummary(other):'')+'. Upload each to its matching section in ENet.'+(missingBank?' '+missingBank+' payee(s) were skipped — missing bank details.':''));
      return;
    }
    const hdr=['Payment Type','Beneficiary Name','Beneficiary Account Number','Beneficiary IFSC Code','Amount','Debit Account Number','Beneficiary Email','Beneficiary Mobile','Remarks'];
    writeCsv(chosen.map(x=>rowFor(x,true)),hdr,'');
    success(chosen.length+' payment(s) exported ('+modeSummary(chosen)+', total ₹'+chosen.reduce((s,x)=>s+(Math.round(Number(amtFor(x))||0)),0).toLocaleString('en-IN')+'). Do one small test batch with your bank the first time before a full run.'+(missingBank?' '+missingBank+' payee(s) were skipped — missing bank details.':''));
  };

  const tabDef=[{id:'salary',label:'Salary'},{id:'incentive',label:'Incentive'},{id:'vendor',label:'Vendor Payments'}];
  const {eligible,selected,amtFor}=rowsFor(subTab);
  const withBankCount=eligible.filter(x=>subTab==='vendor'?hasBank(x.vendor):hasBank(x)).length;
  const missingBankCount=eligible.length-withBankCount;

  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Bank Payment'),
        React.createElement('div',{className:'page-sub'},'Generate a Bulk NEFT/RTGS/IMPS file for direct upload to your bank — Salary, Incentive, or Vendor Payments')
      ),
      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:doRefresh},'⟳ Refresh')
    ),

    React.createElement('div',{style:{fontSize:12,color:'var(--text2)',background:bankChoice==='ICICI Bank'||bankChoice==='State Bank of India'?'rgba(255,159,67,0.12)':'var(--bg3)',border:'1px solid '+(bankChoice==='ICICI Bank'||bankChoice==='State Bank of India'?'rgba(255,159,67,0.4)':'var(--border)'),borderRadius:'var(--r)',padding:'12px 16px',marginBottom:16,lineHeight:1.6}},
      React.createElement('b',{style:{color:'var(--text)'}},bankChoice+': '),
      BANK_NOTES[bankChoice]
    ),

    React.createElement('div',{className:'card',style:{marginBottom:16}},
      React.createElement('div',{className:'form-row cols4'},
        React.createElement('div',{className:'form-group'},React.createElement('label',null,'Bank'),
          React.createElement('select',{className:'form-control',value:bankChoice,onChange:e=>setBankChoice(e.target.value)},Object.keys(BANK_NOTES).map(b=>React.createElement('option',{key:b,value:b},b)))),
        React.createElement('div',{className:'form-group'},React.createElement('label',null,'Payment Mode'),
          React.createElement('select',{className:'form-control',value:paymentMode,onChange:e=>setPaymentMode(e.target.value)},[{v:'Auto',l:'Auto (NEFT/RTGS by amount)'},{v:'NEFT',l:'NEFT (force all)'},{v:'RTGS',l:'RTGS (force all)'},{v:'IMPS',l:'IMPS (force all)'}].map(m=>React.createElement('option',{key:m.v,value:m.v},m.l)))),
        React.createElement('div',{className:'form-group'},React.createElement('label',null,'Debit Account Number *'),
          React.createElement('input',{className:'form-control',value:debitAccount,onChange:e=>setDebitAccount(e.target.value),placeholder:'This outlet\'s own bank account'})),
        React.createElement('div',{className:'form-group'},React.createElement('label',null,'Value Date'),
          React.createElement('input',{type:'date',className:'form-control',value:valueDate,onChange:e=>setValueDate(e.target.value)}))
      ),
      React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:8}},paymentMode==='Auto'?'Auto mode: each payment gets NEFT below ₹2,00,000 and RTGS at ₹2,00,000 or above — decided per payee, not for the whole batch.':'RTGS is typically for ₹2 lakh+; NEFT has no minimum since 2019.')
    ),

    bankChoice==='Custom layout'&&React.createElement(BankLayoutEditor,{layout,onChange:saveLayout}),
    React.createElement('div',{className:'tab-bar',style:{marginBottom:16}},
      tabDef.map(t=>React.createElement('button',{key:t.id,className:`tab-btn ${subTab===t.id?'active':''}`,onClick:()=>setSubTab(t.id)},t.label))
    ),

    (subTab==='salary'||subTab==='incentive')&&React.createElement('div',{style:{display:'flex',gap:10,alignItems:'center',marginBottom:16}},
      React.createElement('select',{className:'form-control',style:{width:'auto'},value:selMonth,onChange:e=>setSelMonth(Number(e.target.value))},MONTHS.map((m,i)=>React.createElement('option',{key:m,value:i},m))),
      React.createElement('select',{className:'form-control',style:{width:'auto'},value:selYear,onChange:e=>setSelYear(Number(e.target.value))},appYears().map(y=>React.createElement('option',{key:y},y)))
    ),

    missingBankCount>0&&React.createElement('div',{className:'attention-card attention-card-sm',style:{marginBottom:14,color:'var(--orange)'}},
      '⚠ '+missingBankCount+' payee(s) are missing bank details and can\'t be included — add Bank Name/Account/IFSC under '+(subTab==='vendor'?'Vendors':'Master Salary')+' first.'),

    subTab==='vendor'&&eligible.length>0&&React.createElement('label',{style:{display:'flex',gap:8,alignItems:'center',fontSize:12.5,color:'var(--text2)',marginBottom:10,cursor:'pointer'}},
      React.createElement('input',{type:'checkbox',checked:combineVendor,onChange:e=>setCombineVendor(e.target.checked)}),
      React.createElement('span',null,React.createElement('b',null,'One transfer per vendor'),' — the ticked invoices of the same vendor go to the bank as ONE payment (total amount, all invoice nos. in the remarks). Untick for a separate transfer per invoice.')),
    eligible.length===0
      ?React.createElement('div',{className:'card',style:{textAlign:'center',padding:32,color:'var(--text3)'}},
          subTab==='vendor'?'No outstanding vendor invoices right now.':(subTab==='salary'&&!swReady?'Attendance for '+MONTHS[selMonth]+' '+selYear+' is not marked Month Final yet — salary is worked out only after that.':'No '+(subTab==='salary'?'active employees with net pay':'employees with a payable incentive')+' for '+MONTHS[selMonth]+' '+selYear+'.'))
      :React.createElement('div',{className:'card',style:{padding:0,overflow:'hidden'}},
          React.createElement('div',{style:{overflowX:'auto'}},
            React.createElement('table',null,
              React.createElement('thead',null,React.createElement('tr',null,
                ['','Name','Bank','Account No.','IFSC','Amount (₹)'].map(h=>React.createElement('th',{key:h},h))
              )),
              React.createElement('tbody',null,eligible.map(x=>{
                const id=subTab==='vendor'?x.invId:x.id;
                const bank=subTab==='vendor'?x.vendor:x;
                const name=subTab==='vendor'?bank.name+' (Inv# '+(x.invoiceNo||'—')+')':x.name;
                const ok=hasBank(bank);
                const setFn=subTab==='salary'?setSelSalary:subTab==='incentive'?setSelIncentive:setSelVendor;
                const amtSetFn=subTab==='salary'?setSalaryAmt:subTab==='incentive'?setIncAmt:setVendorAmt;
                return React.createElement('tr',{key:id,style:!ok?{opacity:0.5}:undefined},
                  React.createElement('td',null,React.createElement('input',{type:'checkbox',disabled:!ok,checked:selected.has(id),onChange:()=>toggle(setFn)(id)})),
                  React.createElement('td',null,name),
                  React.createElement('td',null,bank.bankName||(ok?'':'⚠ missing')),
                  React.createElement('td',null,bank.accountNo||'—'),
                  React.createElement('td',null,bank.ifsc||'—'),
                  React.createElement('td',null,React.createElement('input',{type:'number',className:'form-control',style:{width:110,fontSize:12,padding:'4px 8px'},disabled:!ok,value:amtFor(x),onChange:e=>amtSetFn(prev=>({...prev,[id]:e.target.value}))}))
                );
              }))
            )
          )
        ),

    React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:16}},
      React.createElement('div',{style:{fontSize:12,color:'var(--text3)'}},
        (selected.size>0?selected.size:withBankCount)+' payee(s) selected — total ₹'+
        (selected.size>0?eligible.filter(x=>selected.has(subTab==='vendor'?x.invId:x.id)):eligible.filter(x=>hasBank(subTab==='vendor'?x.vendor:x)))
          .reduce((s,x)=>s+(Math.round(Number(amtFor(x))||0)),0).toLocaleString('en-IN')),
      React.createElement('button',{className:'btn btn-primary',onClick:()=>generateFile(subTab)},'⬇ Generate Bank Payment File')
    ),

    onNavTab&&React.createElement('div',{style:{marginTop:16,fontSize:11.5,color:'var(--text3)'}},
      'Missing bank details? ',
      React.createElement('span',{style:{color:'var(--blue)',cursor:'pointer',textDecoration:'underline'},onClick:()=>onNavTab('vendors')},'Go to Vendors'),
      ' · ',
      React.createElement('span',{style:{color:'var(--blue)',cursor:'pointer',textDecoration:'underline'},onClick:()=>onNavTab('master-salary')},'Go to Master Salary')
    )
  );
}

// ── Vendor ledger ────────────────────────────────────────────────────────────────────────────
// One vendor's account for a period: each bill (Tax Invoice / Invoice — booked by its booking
// date, else invoice date) is a Credit, each payment a Debit (by payment date). Payments recorded
// on a Performa Invoice are advances paid, so they count too; the PI itself is not a bill.
// Opening = bills − payments before the period; Closing = Opening + bills − payments in it.
// A positive balance is what we owe the vendor.
function vlIso(s){const t=String(s==null?'':s).trim();const p=parseInvoiceDateFlexible(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(t)?t.slice(0,10):t);return p?p.y+'-'+String(p.m).padStart(2,'0')+'-'+String(p.d).padStart(2,'0'):'';}
function vendorLedgerFor(invoices,vendorId,from,to){
  const ents=[];
  (invoices||[]).filter(inv=>inv&&String(inv.vendorId)===String(vendorId)).forEach(inv=>{
    const pi=inv.docNature==='Performa Invoice';
    if(!pi){const d=vlIso(inv.bookingDate||inv.invoiceDate);ents.push({date:d,type:'Bill',ref:inv.invoiceNo||'',desc:inv.desc||inv.category||'',credit:Number(inv.amount)||0,debit:0});}
    (inv.payments||[]).forEach(p=>{const amt=Number(p.paidAmount)||0;if(!amt)return;
      ents.push({date:vlIso(p.paidDate),type:pi?'Advance (PI)':'Payment',ref:(inv.invoiceNo||'')+(p.ref?' · '+p.ref:''),desc:(p.mode||'')+(p.note?' — '+p.note:''),credit:0,debit:amt});});
  });
  ents.sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(b.credit-a.credit));
  let opening=0;const rows=[];
  ents.forEach(e=>{
    if(!e.date||(from&&e.date<from)){opening+=e.credit-e.debit;return;}
    if(to&&e.date>to)return;
    rows.push(e);
  });
  let bal=opening;rows.forEach(r=>{bal+=r.credit-r.debit;r.balance=bal;});
  const credit=rows.reduce((t,r)=>t+r.credit,0),debit=rows.reduce((t,r)=>t+r.debit,0);
  const R=n=>Math.round(n*100)/100;
  rows.forEach(r=>{r.balance=R(r.balance);});
  return{opening:R(opening),rows,credit:R(credit),debit:R(debit),closing:R(opening+credit-debit)};
}
function VendorLedgerPanel({salon,invoices,vendors,period}){
  const h=React.createElement;
  const cal=periodToCalendar(period)||{year:new Date().getFullYear(),month:new Date().getMonth()};
  const iso=(y,m,d)=>y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  const [vid,setVid]=useState(()=>(vendors[0]||{}).id||'');
  const [from,setFrom]=useState(iso(cal.year,cal.month,1));
  const [to,setTo]=useState(iso(cal.year,cal.month,new Date(cal.year,cal.month+1,0).getDate()));
  const v=vendors.find(x=>x.id===vid);
  const L=vid?vendorLedgerFor(invoices,vid,from,to):null;
  const f=n=>(n<0?'−':'')+'₹'+Math.abs(Math.round(n)).toLocaleString('en-IN');
  const dmy=s=>s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—';
  const balTxt=n=>f(Math.abs(n))+(n>0.5?' Cr (payable)':n<-0.5?' Dr (advance)':'');
  const setRange=(a,b)=>{setFrom(a);setTo(b);};
  const now=new Date(),fyStart=now.getMonth()>=3?now.getFullYear():now.getFullYear()-1;
  const title=()=>'Vendor Ledger — '+(v?v.name:'')+' — '+dmy(from)+' to '+dmy(to);
  const exportXlsx=()=>{
    if(!L)return;
    const aoa=[[title()],[],['Date','Type','Reference','Details','Debit (Paid)','Credit (Bill)','Balance'],
      ['','Opening balance','','','','',L.opening],
      ...L.rows.map(r=>[dmy(r.date),r.type,r.ref,r.desc,r.debit||'',r.credit||'',r.balance]),
      ['','Total for period','','',L.debit,L.credit,''],['','Closing balance','','','','',L.closing]];
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),'Ledger');
    XLSX.writeFile(wb,'Vendor_Ledger_'+String(v?v.name:'').replace(/[^A-Za-z0-9]+/g,'_')+'_'+from+'_to_'+to+'.xlsx');
  };
  const exportPdf=()=>{
    if(!L)return;
    const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
    const tr=c=>'<tr>'+c.map((x,i)=>'<td'+(i>=4?' class="num"':'')+'>'+esc(x)+'</td>').join('')+'</tr>';
    const body='<table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Details</th><th class="num">Debit (Paid)</th><th class="num">Credit (Bill)</th><th class="num">Balance</th></tr></thead><tbody>'
      +tr(['','Opening balance','','','','',balTxt(L.opening)])
      +L.rows.map(r=>tr([dmy(r.date),r.type,r.ref,r.desc,r.debit?f(r.debit):'',r.credit?f(r.credit):'',balTxt(r.balance)])).join('')
      +tr(['','Total for period','','',f(L.debit),f(L.credit),''])+tr(['','Closing balance','','','','',balTxt(L.closing)])+'</tbody></table>';
    exportReportPdf(title(),(salon&&salon.name)||'',body,{landscape:true});
  };
  const box=(label,val,color)=>h('div',{className:'metric-card '+color},h('div',{className:'metric-label'},label),h('div',{className:'metric-value',style:{fontSize:18}},val));
  return h('div',null,
    h('div',{style:{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end',marginBottom:12}},
      h('div',{className:'form-group',style:{marginBottom:0,minWidth:220}},h('label',null,'Vendor'),
        h('select',{className:'form-control',value:vid,onChange:e=>setVid(e.target.value)},
          [...vendors].sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(x=>h('option',{key:x.id,value:x.id},x.name)))),
      h('div',{className:'form-group',style:{marginBottom:0}},h('label',null,'From'),h('input',{type:'date',className:'form-control',value:from,onChange:e=>setFrom(e.target.value)})),
      h('div',{className:'form-group',style:{marginBottom:0}},h('label',null,'To'),h('input',{type:'date',className:'form-control',value:to,onChange:e=>setTo(e.target.value)})),
      h('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setRange(iso(cal.year,cal.month,1),iso(cal.year,cal.month,new Date(cal.year,cal.month+1,0).getDate()))},'Selected month'),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setRange(iso(fyStart,3,1),iso(fyStart+1,2,31))},'This FY'),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setRange('2000-01-01',iso(now.getFullYear(),now.getMonth(),now.getDate()))},'All time')),
      h('div',{style:{flex:1}}),
      L&&h('button',{className:'btn btn-ghost btn-sm',onClick:exportXlsx},'⬇ Excel'),
      L&&h('button',{className:'btn btn-ghost btn-sm',onClick:exportPdf},'🖨 PDF'),
      L&&v&&h('button',{className:'btn btn-ghost btn-sm',title:'Statement of account with a balance-confirmation request — shares on WhatsApp / email',onClick:async()=>{try{const r=await shareVendorConfirmation(salon,v,L,from,to);if(r==='downloaded')window.alert('Saved the PDF — this vendor has no phone or email in Vendors, so send it yourself.');}catch(e){window.alert('Could not create the confirmation: '+(e.message||e));}}},'📨 Balance confirmation')),
    !vid?h('div',{className:'help-note'},'Add a vendor first.'):from&&to&&from>to?h('div',{className:'help-note'},'"From" is after "To".'):h(React.Fragment,null,
      h('div',{className:'grid4',style:{marginBottom:12}},
        box('Opening Balance',balTxt(L.opening),'blue'),box('Bills in period',f(L.credit),'amber'),box('Paid in period',f(L.debit),'green'),box('Closing Balance',balTxt(L.closing),'red')),
      h('div',{className:'card'},h('div',{className:'table-wrap'},h('table',null,
        h('thead',null,h('tr',null,['Date','Type','Reference','Details','Debit (Paid)','Credit (Bill)','Balance'].map((c,i)=>h('th',{key:c,style:i>=4?{textAlign:'right'}:null},c)))),
        h('tbody',null,
          h('tr',{style:{fontWeight:700,background:'var(--bg3)'}},h('td',null,dmy(from)),h('td',{colSpan:5},'Opening balance'),h('td',{style:{textAlign:'right'}},balTxt(L.opening))),
          L.rows.length===0&&h('tr',null,h('td',{colSpan:7,style:{textAlign:'center',padding:20,color:'var(--text3)'}},'No bills or payments for this vendor in this period.')),
          L.rows.map((r,i)=>h('tr',{key:i},h('td',null,dmy(r.date)),h('td',null,r.type),h('td',{style:{fontFamily:'monospace',fontSize:11}},r.ref),h('td',{style:{fontSize:12,color:'var(--text2)'}},r.desc),
            h('td',{style:{textAlign:'right',color:'var(--green)'}},r.debit?f(r.debit):''),h('td',{style:{textAlign:'right',color:'var(--orange)'}},r.credit?f(r.credit):''),h('td',{style:{textAlign:'right',fontWeight:600}},balTxt(r.balance)))),
          h('tr',{style:{fontWeight:700}},h('td',null,''),h('td',{colSpan:3},'Total for period'),h('td',{style:{textAlign:'right'}},f(L.debit)),h('td',{style:{textAlign:'right'}},f(L.credit)),h('td',null,'')),
          h('tr',{style:{fontWeight:700,background:'var(--bg3)'}},h('td',null,dmy(to)),h('td',{colSpan:5},'Closing balance'),h('td',{style:{textAlign:'right'}},balTxt(L.closing)))))))));
}

// ── One payment against several bills of the same vendor ─────────────────────────────────────
// Splits an amount over bills oldest first (by invoice date); each bill gets at most its balance.
function allocateOldestFirst(items,amount){
  let left=Math.round((Number(amount)||0)*100)/100;
  return items.map(it=>{const take=Math.max(0,Math.min(left,Math.round((Number(it.balance)||0)*100)/100));left=Math.round((left-take)*100)/100;return{...it,alloc:take};});
}
function MultiPayModal({invoices,vendors,selectedIds,bankRows,onSave,onClose,initialVendorId,initial}){
  if(initial&&initial.vid&&!initialVendorId)initialVendorId=initial.vid;
  const h=React.createElement;
  const bal=inv=>(Number(inv.amount)||0)-(inv.payments||[]).reduce((t,p)=>t+(Number(p.paidAmount)||0),0);
  const dk=inv=>{const p=parseInvoiceDateFlexible(inv.invoiceDate);return p?p.y*10000+p.m*100+p.d:0;};
  const pendingOf=vid=>invoices.filter(inv=>String(inv.vendorId)===String(vid)&&inv.docNature!=='Performa Invoice'&&bal(inv)>0.5);
  // Two ways in: rows ticked in the invoice list (selectedIds), or "💳 Pay Vendor" — pick a vendor
  // and all its pending bills are listed, ticked; untick the ones this payment doesn't cover.
  const pickMode=!selectedIds||selectedIds.size===0;
  const vendorsWithDues=vendors.filter(v=>pendingOf(v.id).length>0).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const [pickVid,setPickVid]=useState(()=>initialVendorId||(vendorsWithDues[0]||{}).id||'');
  const [ticked,setTicked]=useState(()=>new Set(initial&&initial.ids?initial.ids:pendingOf(initialVendorId||(vendorsWithDues[0]||{}).id||'').map(i=>i.id)));
  const retick=n=>{setTicked(n);setManual(null);setAmount(String(Math.round(pendingOf(pickVid).filter(i=>n.has(i.id)).reduce((t,i)=>t+bal(i),0)*100)/100));};
  const choose=vid=>{setPickVid(vid);setTicked(new Set(pendingOf(vid).map(i=>i.id)));setManual(null);setAmount(String(Math.round(pendingOf(vid).reduce((t,i)=>t+bal(i),0)*100)/100));};
  const sel=pickMode?pendingOf(pickVid).filter(i=>ticked.has(i.id)):invoices.filter(inv=>selectedIds.has(inv.id));
  const elig=sel.filter(inv=>inv.docNature!=='Performa Invoice'&&bal(inv)>0.5).sort((a,b)=>dk(a)-dk(b));
  const vids=[...new Set(elig.map(i=>String(i.vendorId)))];
  const vendor=vendors.find(v=>String(v.id)===vids[0]);
  const totalBal=Math.round(elig.reduce((t,i)=>t+bal(i),0)*100)/100;
  const [amount,setAmount]=useState(()=>initial&&Number(initial.amount)>0?String(initial.amount):String(totalBal));
  const [date,setDate]=useState((initial&&initial.date)||localTodayIso());
  const [mode,setMode]=useState((initial&&initial.mode)||'NEFT');
  const [ref,setRef]=useState((initial&&initial.ref)||'');
  const [note,setNote]=useState('');
  const [manual,setManual]=useState(null); // {invId: amount} once edited by hand
  const [bankId,setBankId]=useState('');
  const auto=allocateOldestFirst(elig.map(i=>({id:i.id,balance:bal(i)})),amount);
  const allocOf=id=>manual?Number(manual[id]||0):((auto.find(a=>a.id===id)||{}).alloc||0);
  const allocTotal=Math.round(elig.reduce((t,i)=>t+allocOf(i.id),0)*100)/100;
  const amt=Math.round((Number(amount)||0)*100)/100;
  const f=n=>'₹'+(Math.round(n*100)/100).toLocaleString('en-IN');
  const isoOfRow=r=>{const p=parseInvoiceDateFlexible(r.transactionDate);return p?p.y+'-'+String(p.m).padStart(2,'0')+'-'+String(p.d).padStart(2,'0'):'';};
  const days=(a,b)=>Math.abs((new Date(a+'T00:00:00')-new Date(b+'T00:00:00'))/86400000);
  const bankCands=(bankRows||[]).filter(r=>Number(r.debit)>0&&!r.linkedInvoice&&Math.abs(Number(r.debit)-amt)<=1&&isoOfRow(r)&&days(isoOfRow(r),date)<=7);
  const problems=[];
  if(!elig.length)problems.push('None of the selected rows has a balance to pay (Performa Invoices and fully paid bills are skipped).');
  if(vids.length>1)problems.push('Select bills of ONE vendor only — a single payment goes to one vendor.');
  if(amt<=0)problems.push('Enter the amount paid.');
  if(amt>totalBal+0.5)problems.push('The amount is more than the total balance of the selected bills ('+f(totalBal)+').');
  if(manual&&Math.abs(allocTotal-amt)>0.5)problems.push('The split ('+f(allocTotal)+') must add up to the amount paid ('+f(amt)+').');
  if(elig.some(i=>allocOf(i.id)>bal(i)+0.5))problems.push('A bill cannot get more than its balance.');
  const save=()=>{
    if(problems.length){window.alert(problems.join('\n'));return;}
    if(!date){window.alert('Enter the payment date.');return;}
    const allocs=elig.map(i=>({id:i.id,amount:Math.round(allocOf(i.id)*100)/100})).filter(a=>a.amount>0);
    if(!window.confirm('Record ONE payment of '+f(amt)+' to '+(vendor?vendor.name:'the vendor')+' on '+date+', split over '+allocs.length+' bill'+(allocs.length===1?'':'s')+'?'))return;
    onSave({allocs,entry:{paidDate:date,mode,ref:ref.trim(),note:note.trim()},total:amt,bankRowId:bankId||null,vendorName:vendor?vendor.name:''});
  };
  return h('div',{className:'modal-overlay',onClick:onClose},
    h('div',{className:'modal',style:{width:760,maxWidth:'96vw'},onClick:e=>e.stopPropagation()},
      h('div',{className:'modal-title'},'💳 One payment for several bills'+(vendor?' — '+vendor.name:'')),
      pickMode&&h('div',{className:'form-group'},h('label',null,'Vendor *'),
        vendorsWithDues.length===0?h('div',{className:'help-note'},'No vendor has a pending bill.'):
        h('select',{className:'form-control',value:pickVid,onChange:e=>choose(e.target.value)},
          vendorsWithDues.map(v=>{const n=pendingOf(v.id);return h('option',{key:v.id,value:v.id},v.name+' — '+n.length+' pending bill'+(n.length===1?'':'s')+', ₹'+Math.round(n.reduce((t,i)=>t+bal(i),0)).toLocaleString('en-IN'));}))),
      pickMode&&pickVid&&h('div',{style:{border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'6px 10px',marginBottom:10,maxHeight:170,overflowY:'auto'}},
        h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--text3)',marginBottom:4}},
          h('span',null,'Bills covered by this payment (untick the ones it doesn’t cover):'),
          h('span',null,h('a',{href:'#',onClick:e=>{e.preventDefault();retick(new Set(pendingOf(pickVid).map(i=>i.id)));}},'All'),' · ',h('a',{href:'#',onClick:e=>{e.preventDefault();retick(new Set());}},'None'))),
        pendingOf(pickVid).sort((a,b)=>dk(a)-dk(b)).map(inv=>h('label',{key:inv.id,style:{display:'flex',gap:8,alignItems:'center',fontSize:12.5,padding:'2px 0',cursor:'pointer'}},
          h('input',{type:'checkbox',checked:ticked.has(inv.id),onChange:()=>{const n=new Set(ticked);n.has(inv.id)?n.delete(inv.id):n.add(inv.id);retick(n);}}),
          h('span',{style:{fontFamily:'monospace',fontSize:11,minWidth:120}},inv.invoiceNo),h('span',{style:{minWidth:90}},inv.invoiceDate),h('span',null,'balance ₹'+Math.round(bal(inv)).toLocaleString('en-IN'))))),
      h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:10}},'One cheque / transfer / UPI paid against several bills of the same vendor. The amount is split over the bills oldest first — change the split below if the vendor applied it differently. Every bill gets its part as a payment with the same date and reference.'),
      h('div',{className:'form-row cols3'},
        h('div',{className:'form-group'},h('label',null,'Amount paid (₹) *'),h('input',{type:'number',className:'form-control',value:amount,onChange:e=>{setAmount(e.target.value);setManual(null);}})),
        h('div',{className:'form-group'},h('label',null,'Payment date *'),h('input',{type:'date',className:'form-control',value:date,onChange:e=>setDate(e.target.value)})),
        h('div',{className:'form-group'},h('label',null,'Mode'),h('select',{className:'form-control',value:mode,onChange:e=>setMode(e.target.value)},['NEFT','RTGS','IMPS','UPI','Cheque','Cash'].map(m=>h('option',{key:m},m))))),
      h('div',{className:'form-row cols2'},
        h('div',{className:'form-group'},h('label',null,'UTR / Cheque / Ref no.'),h('input',{className:'form-control',value:ref,onChange:e=>setRef(e.target.value),placeholder:'Same reference on every bill'})),
        h('div',{className:'form-group'},h('label',null,'Note'),h('input',{className:'form-control',value:note,onChange:e=>setNote(e.target.value),placeholder:'optional'}))),
      bankCands.length>0&&h('div',{className:'form-group'},h('label',null,'Link to Bank Statement line'),
        h('select',{className:'form-control',value:bankId,onChange:e=>setBankId(e.target.value)},
          h('option',{value:''},'— don’t link —'),
          bankCands.map(r=>h('option',{key:r.id,value:String(r.id)},r.transactionDate+' · '+f(Number(r.debit))+' · '+String(r.description||'').slice(0,60))))),
      h('div',{className:'table-wrap',style:{maxHeight:'40vh',overflowY:'auto'}},h('table',null,
        h('thead',null,h('tr',null,['Invoice No','Invoice Date','Invoice Amt','Balance','Pay now (₹)','Balance after'].map(c=>h('th',{key:c},c)))),
        h('tbody',null,elig.map(inv=>h('tr',{key:inv.id},
          h('td',{style:{fontFamily:'monospace',fontSize:11}},inv.invoiceNo),h('td',null,inv.invoiceDate),h('td',null,f(Number(inv.amount)||0)),h('td',null,f(bal(inv))),
          h('td',null,h('input',{type:'number',className:'form-control',style:{width:120,padding:'4px 8px'},value:String(allocOf(inv.id)),
            onChange:e=>{const base=manual||Object.fromEntries(elig.map(i=>[i.id,allocOf(i.id)]));setManual({...base,[inv.id]:e.target.value});}})),
          h('td',{style:{color:bal(inv)-allocOf(inv.id)>0.5?'var(--orange)':'var(--green)'}},f(Math.max(0,bal(inv)-allocOf(inv.id))))))),
        h('tfoot',null,h('tr',{style:{fontWeight:700}},h('td',{colSpan:3},'Total'),h('td',null,f(totalBal)),h('td',null,f(allocTotal)),h('td',null,f(Math.max(0,totalBal-allocTotal))))))),
      sel.length>elig.length&&h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},(sel.length-elig.length)+' selected row(s) skipped — Performa Invoice or nothing left to pay.'),
      problems.length>0&&h('div',{style:{fontSize:12,color:'var(--red)',marginTop:8}},problems.map((p,i)=>h('div',{key:i},'⚠ '+p))),
      h('div',{className:'modal-actions',style:{marginTop:12}},
        manual&&h('button',{className:'btn btn-ghost',onClick:()=>setManual(null)},'↺ Split oldest first'),
        h('button',{className:'btn btn-ghost',onClick:onClose},'Cancel'),
        h('button',{className:'btn btn-primary',disabled:problems.length>0,onClick:save},'✓ Record payment'))));
}

// ── Vendor list with Add / Edit / Delete, usable from any screen that keeps the vendor list in its
// own state (Recurring Expenses): the parent passes vendors + setVendors, so its own save effect
// writes the same list the Vendors tab reads — a vendor added or changed here shows there too.
function VendorManagerModal({salon,vendors,setVendors,invoices,recurring,onClose}){
  const h=React.createElement;
  const salonId=salon&&salon.id;
  const BLANK={id:'',name:'',address:'',gst:'',cat:defaultVendorCategoryFor(salonId),contact:'',phone:'',terms:'30 days',status:'Active',bankName:'',accountHolder:'',accountNo:'',ifsc:'',email:'',tdsApplicable:false,tdsSection:'',tdsRate:''};
  const [q,setQ]=useState('');
  const [form,setForm]=useState(null); // null = list; object = add / edit form
  const [editId,setEditId]=useState(null);
  const fc=k=>e=>setForm(f=>({...f,[k]:e.target.value}));
  const owed=vid=>(invoices||[]).filter(i=>String(i.vendorId)===String(vid)&&i.docNature!=='Performa Invoice').reduce((t,i)=>t+Math.max(0,(Number(i.amount)||0)-(i.payments||[]).reduce((s,p)=>s+(Number(p.paidAmount)||0),0)),0);
  const usedBy=v=>{
    const n=(invoices||[]).filter(i=>String(i.vendorId)===String(v.id)).length;
    const r=(recurring||[]).filter(it=>String(it.payee||'').trim().toLowerCase()===String(v.name||'').trim().toLowerCase());
    return{n,r};
  };
  const save=()=>{
    const name=String(form.name||'').trim();
    if(!name){window.alert('Vendor name is required.');return;}
    const same=vendors.find(v=>String(v.name).trim().toLowerCase()===name.toLowerCase()&&v.id!==editId);
    if(same){window.alert('A vendor named "'+same.name+'" already exists ('+same.id+').');return;}
    if(!confirmIdFields({gst:form.gst,phone:form.phone,email:form.email,accountNo:form.accountNo,ifsc:form.ifsc,bankName:form.bankName},'the vendor details',salonId))return;
    const clean={...form,name,gst:String(form.gst||'').trim().toUpperCase(),ifsc:String(form.ifsc||'').trim().toUpperCase(),accountNo:String(form.accountNo||'').replace(/\s/g,'')};
    if(editId){
      const old=vendors.find(v=>v.id===editId);
      if(!vendorBankChangeOk(salonId,old,clean))return;
      setVendors(prev=>prev.map(v=>v.id===editId?{...v,...clean,id:editId}:v));
      try{logAuditEvent(salonId,{entity:'Vendor',entityId:editId,action:'Edited',summary:name+(old&&old.name!==name?' (was '+old.name+')':'')});}catch(e){}
    }else{
      const id=String(form.id||'').trim()||nextPrefixedId(vendors,'V',3);
      if(vendors.some(v=>v.id===id)){window.alert('Vendor ID "'+id+'" is already in use.');return;}
      setVendors(prev=>[...prev,{...clean,id}]);
      try{logAuditEvent(salonId,{entity:'Vendor',entityId:id,action:'Added',summary:name});}catch(e){}
    }
    setForm(null);setEditId(null);
  };
  const del=v=>{
    const u=usedBy(v);
    if(u.n){window.alert('"'+v.name+'" has '+u.n+' invoice'+(u.n===1?'':'s')+' entered, so it cannot be deleted. Edit it and set Status to Inactive instead.');return;}
    if(u.r.length){window.alert('"'+v.name+'" is the payee of '+u.r.length+' recurring expense'+(u.r.length===1?'':'s')+' — change or delete '+(u.r.length===1?'it':'them')+' first, or set the vendor Inactive.');return;}
    if(!window.confirm('Delete vendor "'+v.name+'" ('+v.id+')? This cannot be undone.'))return;
    setVendors(prev=>prev.filter(x=>x.id!==v.id));
    try{logAuditEvent(salonId,{entity:'Vendor',entityId:v.id,action:'Deleted',summary:v.name});}catch(e){}
  };
  const FG=(label,el,w)=>h('div',{className:'form-group'},h('label',null,label),el,w||null);
  const inp=(k,ph,extra)=>h('input',{className:'form-control',value:form[k]||'',onChange:fc(k),placeholder:ph||'',...(extra||{})});
  const cats=withBizCategories(['Purchase of Cosmetic','Housekeeping','Equipment','Utilities','Rent','DG Rent','Drycleaning Expenses','Professional Fee','Staff Room Rent','Royalty','Electricity Expenses','Uniform Expenses','Telephone & Internet Expenses','Maintenance Expenses','Marketing','Fixed Assets','Other'],salonId);
  const list=[...vendors].filter(v=>{const s=q.trim().toLowerCase();return !s||[v.name,v.id,v.gst,v.phone,v.contact,v.cat].some(x=>String(x||'').toLowerCase().includes(s));}).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  return h('div',{className:'modal-overlay',onClick:onClose},
    h('div',{className:'modal',style:{width:form?680:980,maxWidth:'96vw'},onClick:e=>e.stopPropagation()},
      !form?h(React.Fragment,null,
        h('div',{className:'modal-title',style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},h('span',null,'Vendors ('+vendors.length+')'),
          h('button',{className:'btn btn-primary btn-sm',onClick:()=>{setForm({...BLANK});setEditId(null);}},'+ Add Vendor')),
        h('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:8}},'Same vendor list as the Vendors tab — anything added, edited or deleted here shows there too.'),
        h('input',{className:'form-control',autoFocus:true,placeholder:'Search name, GSTIN, mobile, category…',value:q,onChange:e=>setQ(e.target.value),style:{marginBottom:10}}),
        h('div',{className:'table-wrap',style:{maxHeight:'60vh',overflowY:'auto'}},h('table',null,
          h('thead',null,h('tr',null,['ID','Vendor Name','GSTIN','Category','Mobile','Bank','Status','Outstanding',''].map(c=>h('th',{key:c,style:{position:'sticky',top:0}},c)))),
          h('tbody',null,list.length===0?h('tr',null,h('td',{colSpan:9,style:{textAlign:'center',padding:20,color:'var(--text3)'}},'No vendors match.')):
            list.map(v=>h('tr',{key:v.id},
              h('td',{style:{fontFamily:'monospace',fontSize:11}},v.id),h('td',{style:{fontWeight:600}},v.name),h('td',{style:{fontFamily:'monospace',fontSize:11}},v.gst||'—'),
              h('td',null,v.cat||'—'),h('td',{style:{fontFamily:'monospace',fontSize:12}},v.phone||'—'),h('td',{style:{fontSize:12}},v.bankName?(v.bankName+(v.accountNo?' ··'+String(v.accountNo).slice(-4):'')):'—'),
              h('td',null,h('span',{className:'badge '+(v.status==='Active'?'badge-green':'badge-gray')},v.status||'—')),
              h('td',{style:{textAlign:'right'}},'₹'+Math.round(owed(v.id)).toLocaleString('en-IN')),
              h('td',null,h('div',{style:{display:'flex',gap:6}},
                h('button',{className:'btn btn-primary btn-sm',onClick:()=>{setForm({...BLANK,...v});setEditId(v.id);}},'✏ Edit'),
                h('button',{className:'btn btn-sm',style:{background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.35)',color:'var(--red)'},onClick:()=>del(v)},'🗑 Delete')))))))),
        h('div',{style:{display:'flex',justifyContent:'flex-end',marginTop:12}},h('button',{className:'btn btn-ghost',onClick:onClose},'Close')))
      :h(React.Fragment,null,
        h('div',{className:'modal-title'},editId?'Edit Vendor — '+(vendors.find(v=>v.id===editId)||{}).name:'Add New Vendor'),
        h('div',{className:'form-row cols2'},FG('Vendor Name *',inp('name','e.g. ABC Traders')),
          FG('Category',h('select',{className:'form-control',value:form.cat||'',onChange:fc('cat')},cats.map(c=>h('option',{key:c},c))))),
        FG('Address',h('textarea',{className:'form-control',rows:2,value:form.address||'',onChange:fc('address'),placeholder:'Full address with PIN code'})),
        h('div',{className:'form-row cols2'},
          FG('GST Number',inp('gst','e.g. 07AABCX1234R1ZP',{style:{textTransform:'uppercase'}}),form.gst&&!isValidGSTINFormat(form.gst)&&fieldWarning('Not a valid GSTIN (format or check digit).')),
          FG('Payment Terms',h('select',{className:'form-control',value:form.terms||'30 days',onChange:fc('terms')},['7 days','15 days','30 days','45 days','60 days','90 days','Advance'].map(t=>h('option',{key:t},t))))),
        h('div',{className:'form-row cols2'},FG('Contact Person',inp('contact','Contact person')),
          FG('Mobile No.',inp('phone','98xxxxxxxx',{inputMode:'numeric'}),form.phone&&!isValidIndianMobile(form.phone)&&fieldWarning('Not a valid 10-digit mobile number.'))),
        h('div',{className:'form-row cols2'},
          FG('Vendor ID (auto if blank)',inp('id','e.g. V005',{readOnly:!!editId,title:editId?'The ID cannot be changed — invoices are linked to it':''})),
          FG('Status',h('select',{className:'form-control',value:form.status||'Active',onChange:fc('status')},['Active','Inactive'].map(s=>h('option',{key:s},s))))),
        h('div',{style:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'14px 0 10px',paddingTop:12,borderTop:'1px solid var(--border)'}},'Bank Details'),
        h('div',{className:'form-row cols2'},
          FG('Bank Name',h(BankNameField,{value:form.bankName,ifsc:form.ifsc,onChange:v=>setForm(f=>({...f,bankName:v}))})),
          FG('Account Holder Name',inp('accountHolder','As per bank records'))),
        h('div',{className:'form-row cols2'},
          FG('Account Number',inp('accountNo','Account number',{inputMode:'numeric'}),form.accountNo&&!isValidBankAccountNo(form.accountNo)&&fieldWarning('Account number must be 9 to 18 digits.')),
          FG('IFSC Code',inp('ifsc','HDFC0001234',{style:{textTransform:'uppercase'}}),form.ifsc&&!isValidIfscFormat(form.ifsc)&&fieldWarning('Not a valid IFSC (e.g. HDFC0001234).'))),
        FG('Email (optional)',inp('email','vendor@company.com',{type:'email'}),form.email&&!isValidEmailFormat(form.email)&&fieldWarning('Not a valid email.')),
        salon&&salon.tdsApplicable&&h('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'10px 12px',marginTop:8}},
          h('label',{style:{display:'flex',gap:8,alignItems:'center',cursor:'pointer'}},h('input',{type:'checkbox',checked:!!form.tdsApplicable,onChange:e=>setForm(f=>({...f,tdsApplicable:e.target.checked}))}),'TDS applicable on payments to this vendor'),
          form.tdsApplicable&&h('div',{className:'form-row cols2',style:{marginTop:8}},
            FG('Section',h('select',{className:'form-control',value:form.tdsSection||'',onChange:e=>{const sec=tdsSectionsAsOf().find(s=>s.code===e.target.value);setForm(f=>({...f,tdsSection:e.target.value,tdsRate:sec?sec.rate:f.tdsRate}));}},
              [h('option',{key:'',value:''},'Select Section'),...tdsSectionsAsOf().map(s=>h('option',{key:s.code,value:s.code},s.label))])),
            FG('Rate (%)',inp('tdsRate','e.g. 2',{type:'number',step:'0.1'})))),
        h('div',{className:'modal-actions'},
          h('button',{className:'btn btn-ghost',onClick:()=>{setForm(null);setEditId(null);}},'← Back to list'),
          h('button',{className:'btn btn-primary',onClick:save},editId?'💾 Save Changes':'✓ Add Vendor')))));
}
