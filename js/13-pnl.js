

// ── Cash Flow (Monthly) — split out into its own tab (see OutletPnLSheet) so it reads as a
// standalone statement rather than a card tucked under the P&L table. Keeps its own month/FY
// navigator, same convention as Salary Working / Salary Payment being independently browsable
// sub-tabs, defaulting to the outlet's currently selected Period. ──
// ── Depreciation — Fixed Asset Register tab. Method (Income Tax Act block/WDV vs Companies Act
// Schedule II SLM) is chosen automatically from the outlet's Firm Category; this screen never
// asks the person to pick a method themselves, since that's a legal fact about the firm, not a
// preference. ──
function DepreciationSheet({salon,period}={}){
  const {toast}=useToast();
  const sid=Number(salon&&salon.id)||1;
  const FYS=['2023-24','2024-25','2025-26','2026-27'];
  const [fy,setFy]=useState((period&&period.fy)||'2025-26');
  useEffect(()=>{if(period&&period.fy)setFy(period.fy);},[period&&period.fy]);
  const [assets,setAssets]=useState(()=>loadFixedAssets(sid));
  useEffect(()=>{saveFixedAssets(sid,assets);},[assets,sid]);
  const [showModal,setShowModal]=useState(false);
  const [editAsset,setEditAsset]=useState(null);
  const [showDisposeModal,setShowDisposeModal]=useState(null);
  const [showDeleteModal,setShowDeleteModal]=useState(null);
  const [vendorAssetsTick,setVendorAssetsTick]=useState(0); // vendor invoices/block overrides live outside React state — bump to force a refresh after assigning a block
  const vendorInvoices=vendorFixedAssetInvoices(sid);
  const vendorsList=loadVendors(sid);
  // Flattened one row per asset line (an invoice with 3 assets on it produces 3 rows here), each
  // carrying its own stable key for the block-override store.
  const vendorAssetLines=vendorInvoices.flatMap(inv=>invoiceAssetLines(inv).map(line=>({
    key:fixedAssetLineKey(inv.id,line.id),inv,line,
    vendorName:(vendorsList.find(v=>v.id===inv.vendorId)||{}).name||inv.vendorId||'—'
  })));
  const blockOverrides=loadFixedAssetBlockOverrides(sid);
  const assignBlock=(lineKey,block)=>{
    saveFixedAssetBlockOverride(sid,lineKey,block);
    setVendorAssetsTick(t=>t+1);
    toast(block?'Block assigned — now included in the depreciation schedule below':'Block assignment removed from the schedule','success');
  };

  const method=depreciationMethodFor(salon&&salon.firmCategory);
  const isCompaniesAct=method==='companies_act';
  const blocks=depreciationBlocksFor(salon&&salon.firmCategory);
  const methodLabel=isCompaniesAct?'Companies Act, 2013 — Schedule II (Straight Line Method)':'Income Tax Act, 1961 — Block of Assets (Written Down Value)';

  const BLANK={id:'',block:blocks[0]?blocks[0].key:'',description:'',isOpening:false,
    cost:'',addedDate:localTodayIso(),
    openingWDV:'',openingAsOfFy:fy,remainingUsefulLifeYears:'',
    disposed:false,disposalDate:'',disposalValue:''};
  const nextId=()=>'FA'+(Math.max(0,...assets.map(a=>Number(String(a.id).replace('FA',''))||0))+1);

  const openAdd=()=>{setEditAsset(null);setShowModal({...BLANK});};
  const openEdit=(a)=>{setEditAsset(a);setShowModal({...BLANK,...a});};
  const saveAsset=()=>{
    const f=showModal;
    if(!f.block){toast('Category/Block is required','error');return;}
    if(f.isOpening){
      if(!f.openingWDV||Number(f.openingWDV)<=0){toast('Opening WDV / carrying value is required','error');return;}
      if(isCompaniesAct&&(!f.remainingUsefulLifeYears||Number(f.remainingUsefulLifeYears)<=0)){toast('Remaining Useful Life is required for an opening asset under Companies Act','error');return;}
    } else {
      if(!f.cost||Number(f.cost)<=0){toast('Cost is required','error');return;}
      if(!f.addedDate){toast('Date of Purchase is required','error');return;}
    }
    const rec={...f,id:f.id||nextId(),cost:Number(f.cost)||0,openingWDV:Number(f.openingWDV)||0,
      remainingUsefulLifeYears:Number(f.remainingUsefulLifeYears)||0};
    setAssets(prev=>editAsset?prev.map(a=>a.id===rec.id?rec:a):[...prev,rec]);
    setShowModal(false);
    toast(editAsset?'Asset updated':'Asset added','success');
  };
  const confirmDispose=()=>{
    setAssets(prev=>prev.map(a=>a.id===showDisposeModal.id?{...a,disposed:true,disposalDate:showDisposeModal.disposalDate,disposalValue:Number(showDisposeModal.disposalValue)||0}:a));
    setShowDisposeModal(null);
    toast('Asset marked disposed','success');
  };
  const confirmDelete=()=>{
    setAssets(prev=>prev.filter(a=>a.id!==showDeleteModal.id));
    setShowDeleteModal(null);
    toast('Asset removed','warning');
  };

  const schedule=isCompaniesAct?companiesActScheduleFor(sid,fy):itBlockScheduleFor(sid,fy);
  const totalDep=schedule.reduce((s,r)=>s+(r.depreciation||0),0);
  const money=(n)=>formatMoney(n);

  const FG=(label,children)=>React.createElement('div',{className:'form-group'},React.createElement('label',null,label),children);

  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Depreciation — Fixed Asset Register'),
        React.createElement('div',{className:'page-sub'},'Method: '+methodLabel+' — chosen automatically from this outlet\'s Firm Category')),
      React.createElement('div',{style:{display:'flex',gap:8}},
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>{const o={...BLANK,isOpening:true};setEditAsset(null);setShowModal(o);}},'+ Add Opening Asset'),
        React.createElement('button',{className:'btn btn-primary btn-sm',onClick:openAdd},'+ Add New Asset')
      )
    ),
    React.createElement('div',{style:{display:'flex',gap:10,alignItems:'center',marginBottom:16}},
      React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},'Financial Year'),
      React.createElement('select',{className:'form-control',style:{width:'auto',fontSize:12,padding:'6px 10px'},value:fy,onChange:e=>setFy(e.target.value)},
        FYS.map(f=>React.createElement('option',{key:f},f)))
    ),
    React.createElement('div',{className:'grid4',style:{marginBottom:16}},
      [{label:'Total Assets',val:assets.filter(a=>!a.disposed).length+vendorAssetLines.filter(l=>blockOverrides[l.key]).length,color:'blue'},
       {label:'FY Depreciation',val:money(totalDep),color:'amber'},
       {label:isCompaniesAct?'Blocks/Categories':'Blocks',val:new Set(schedule.map(r=>r.block)).size,color:'purple'},
       {label:'Needs Block Assignment',val:vendorAssetLines.filter(l=>!blockOverrides[l.key]).length,color:vendorAssetLines.filter(l=>!blockOverrides[l.key]).length>0?'red':'gray'}].map(m=>
        React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},React.createElement('div',{className:'metric-label'},m.label),React.createElement('div',{className:'metric-value'},m.val))
      )
    ),
    vendorAssetLines.length>0&&React.createElement('div',{className:'card',style:{marginBottom:16}},
      React.createElement('div',{className:'card-title'},'Vendor Fixed Asset Invoices'),
      React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:14,lineHeight:1.6}},
        'Every invoice booked under Vendors with Category "Fixed Assets" shows up here — one row per asset, even when several assets share a single invoice. Assign each one a Block — the only thing this depreciation calculation needs that a purchase invoice doesn\'t already have — and it flows straight into the schedule below, using that asset\'s own cost and the invoice\'s date.'),
      React.createElement('div',{className:'table-wrap'},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,['Asset','Vendor','Invoice No.','Amount','Booking Date','Block'].map(hh=>React.createElement('th',{key:hh},hh)))),
          React.createElement('tbody',null,vendorAssetLines.map(l=>
            React.createElement('tr',{key:l.key},
              React.createElement('td',null,l.line.name||l.inv.desc||'—'),
              React.createElement('td',null,l.vendorName),
              React.createElement('td',null,l.inv.invoiceNo||'—'),
              React.createElement('td',{style:{textAlign:'right'}},money(l.line.amount)),
              React.createElement('td',null,fmtDMY(toISO(l.inv.bookingDate||l.inv.invoiceDate))),
              React.createElement('td',null,
                React.createElement('select',{className:'form-control',style:{fontSize:12,padding:'5px 8px'},value:blockOverrides[l.key]||'',onChange:e=>assignBlock(l.key,e.target.value)},
                  [React.createElement('option',{key:'',value:''},'— Assign Block —'),...blocks.map(b=>React.createElement('option',{key:b.key,value:b.key},b.label))]
                )
              )
            )
          ))
        )
      )
    ),
    React.createElement('div',{className:'card',style:{marginBottom:16}},
      React.createElement('div',{className:'card-title'},(isCompaniesAct?'Asset-wise':'Block-wise')+' Depreciation — '+fy),
      schedule.length===0
        ?React.createElement('div',{style:{textAlign:'center',padding:32,color:'var(--text3)'}},'No assets on record for '+fy+' yet. Add an opening asset (if you already own equipment/furniture/etc.) or a new asset purchased this year.')
        :React.createElement('div',{className:'table-wrap'},
            React.createElement('table',null,
              React.createElement('thead',null,React.createElement('tr',null,
                (isCompaniesAct
                  ?['Asset','Useful Life','Opening Carrying Value','Depreciation','Closing Carrying Value','Note']
                  :['Block','Rate','Opening WDV','Additions (≥180 days)','Additions (<180 days)','Disposals','Depreciation','Closing WDV']
                ).map(hh=>React.createElement('th',{key:hh},hh))
              )),
              React.createElement('tbody',null,schedule.map((r,i)=>React.createElement('tr',{key:r.id||r.block+i},
                React.createElement('td',null,r.label),
                isCompaniesAct?React.createElement('td',null,r.usefulLifeYears+' yrs'):React.createElement('td',null,(r.rate*100).toFixed(0)+'%'),
                React.createElement('td',{style:{textAlign:'right'}},money(r.opening)),
                !isCompaniesAct&&React.createElement('td',{style:{textAlign:'right'}},money(r.additions180)),
                !isCompaniesAct&&React.createElement('td',{style:{textAlign:'right'}},money(r.additionsLt180)),
                !isCompaniesAct&&React.createElement('td',{style:{textAlign:'right'}},money(r.disposals)),
                React.createElement('td',{style:{textAlign:'right',fontWeight:600,color:'var(--orange)'}},money(r.depreciation)),
                React.createElement('td',{style:{textAlign:'right',fontWeight:600}},money(r.closing)),
                isCompaniesAct&&React.createElement('td',{style:{fontSize:10.5,color:'var(--text3)'}},r.note||'—')
              )))
            )
          ),
      React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:14,paddingTop:12,marginTop:12,borderTop:'2px solid var(--border2)'}},
        React.createElement('span',null,'Total Depreciation for '+fy),React.createElement('span',{style:{color:'var(--accent2)'}},money(totalDep))),
      React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:8}},
        'Flows into P&L (Monthly) — Depreciation on equipment & interiors — month by month below, unless a specific month has its own manual override there. A mid-year purchase is divided across the exact number of days from its purchase date to 31 March, not spread back over months before it existed and not split into equal whole-month shares.')
    ),
    React.createElement('div',{className:'card',style:{marginBottom:16}},
      React.createElement('div',{className:'card-title'},'Month-wise — '+fy),
      React.createElement('div',{className:'table-wrap'},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,PL_MONTHS.map(m=>React.createElement('th',{key:m,style:{textAlign:'right'}},m)))),
          React.createElement('tbody',null,React.createElement('tr',null,
            PL_MONTHS.map((m,mi)=>{
              const c=periodToCalendar({fy,mi});
              const amt=c?monthlyDepreciationFor(sid,c.year,c.month):0;
              return React.createElement('td',{key:m,style:{textAlign:'right',fontWeight:amt>0?600:400,color:amt>0?'var(--text)':'var(--text3)'}},money(amt));
            })
          ))
        )
      )
    ),
    React.createElement('div',{className:'card'},
      React.createElement('div',{className:'card-title'},'Asset Register'),
      assets.length===0
        ?React.createElement('div',{style:{textAlign:'center',padding:32,color:'var(--text3)'}},'No assets added yet.')
        :React.createElement('div',{className:'table-wrap'},
            React.createElement('table',null,
              React.createElement('thead',null,React.createElement('tr',null,['Category','Description','Type','Value','Date','Status','Actions'].map(hh=>React.createElement('th',{key:hh},hh)))),
              React.createElement('tbody',null,assets.map(a=>{
                const meta=blocks.find(b=>b.key===a.block);
                return React.createElement('tr',{key:a.id,style:a.disposed?{opacity:0.55}:undefined},
                  React.createElement('td',null,meta?meta.label:a.block),
                  React.createElement('td',null,a.description||'—'),
                  React.createElement('td',null,React.createElement('span',{className:'badge '+(a.isOpening?'badge-amber':'badge-blue')},a.isOpening?'Opening':'New')),
                  React.createElement('td',{style:{textAlign:'right'}},money(a.isOpening?a.openingWDV:a.cost)),
                  React.createElement('td',null,a.isOpening?('as of '+a.openingAsOfFy):fmtDMY(a.addedDate)),
                  React.createElement('td',null,a.disposed?React.createElement('span',{className:'badge badge-gray'},'Disposed '+fmtDMY(a.disposalDate)):React.createElement('span',{className:'badge badge-green'},'Active')),
                  React.createElement('td',null,
                    React.createElement('div',{style:{display:'flex',gap:4}},
                      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>openEdit(a)},'Edit'),
                      !a.disposed&&React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setShowDisposeModal({...a,disposalDate:localTodayIso(),disposalValue:''})},'Dispose'),
                      React.createElement('button',{'aria-label':'Delete',className:'btn btn-sm',style:{background:'rgba(255,107,107,0.08)',border:'1px solid rgba(255,107,107,0.2)',color:'var(--red)',padding:'4px 8px',borderRadius:'var(--r)',cursor:'pointer',fontSize:11},onClick:()=>setShowDeleteModal(a)},React.createElement(IconTrash,{size:14}))
                    )
                  )
                );
              }))
            )
          )
    ),

    // ── ADD/EDIT ASSET MODAL ──
    showModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowModal(false)},
      React.createElement('div',{className:'modal',style:{width:520},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},editAsset?'Edit Asset':(showModal.isOpening?'Add Opening Asset':'Add New Asset')),
        !editAsset&&React.createElement('label',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:14,cursor:'pointer'}},
          React.createElement('input',{type:'checkbox',checked:!!showModal.isOpening,onChange:e=>setShowModal(f=>({...f,isOpening:e.target.checked}))}),
          React.createElement('span',{style:{fontSize:12.5}},'This is an opening asset — already owned, entering its current carrying value rather than original purchase details')
        ),
        FG('Category / Block *',React.createElement('select',{className:'form-control',value:showModal.block,onChange:e=>setShowModal(f=>({...f,block:e.target.value}))},
          blocks.map(b=>React.createElement('option',{key:b.key,value:b.key},b.label+(isCompaniesAct?' — '+b.years+' yrs':' — '+(b.rate*100).toFixed(0)+'%'))))),
        FG('Description',React.createElement('input',{className:'form-control',value:showModal.description,onChange:e=>setShowModal(f=>({...f,description:e.target.value})),placeholder:'e.g. Salon chairs (4), reception desk'})),
        (()=>{const itcAllowed=gstInputAllowedAsOf(salon,showModal.addedDate||localTodayIso());return React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:10}},
          itcAllowed
            ?'Enter the pre-GST (Taxable Value) cost — GST is tracked separately as recoverable input credit for this outlet.'
            :'This outlet can\'t claim GST Input Credit — enter the GST-INCLUSIVE cost, since the GST paid is a real, non-recoverable cost that belongs in the capitalized value.');
        })(),
        showModal.isOpening
          ?React.createElement(React.Fragment,null,
              React.createElement('div',{className:'form-row cols2'},
                FG('Opening WDV / Carrying Value (₹) *',React.createElement('input',{type:'number',className:'form-control',value:showModal.openingWDV,onChange:e=>setShowModal(f=>({...f,openingWDV:e.target.value})),placeholder:'0'})),
                FG('As of Financial Year *',React.createElement('select',{className:'form-control',value:showModal.openingAsOfFy,onChange:e=>setShowModal(f=>({...f,openingAsOfFy:e.target.value}))},FYS.map(f=>React.createElement('option',{key:f},f))))
              ),
              isCompaniesAct&&FG('Remaining Useful Life (years) *',React.createElement('input',{type:'number',className:'form-control',value:showModal.remainingUsefulLifeYears,onChange:e=>setShowModal(f=>({...f,remainingUsefulLifeYears:e.target.value})),placeholder:'e.g. 6'})),
              !isCompaniesAct&&React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:10}},'Added directly to this block\'s opening WDV for the selected FY — Income Tax block depreciation runs on the block\'s total, not per asset.')
            )
          :React.createElement('div',{className:'form-row cols2'},
              FG('Cost (₹) *',React.createElement('input',{type:'number',className:'form-control',value:showModal.cost,onChange:e=>setShowModal(f=>({...f,cost:e.target.value})),placeholder:'0'})),
              FG('Date of Purchase *',React.createElement('input',{type:'date',className:'form-control',value:showModal.addedDate,onChange:e=>setShowModal(f=>({...f,addedDate:e.target.value}))}))
            ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowModal(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:saveAsset},editAsset?'Save Changes':'Add Asset')
        )
      )
    ),

    // ── DISPOSE MODAL ──
    showDisposeModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowDisposeModal(null)},
      React.createElement('div',{className:'modal',style:{width:420},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Dispose Asset'),
        React.createElement('div',{className:'form-row cols2'},
          FG('Disposal Date',React.createElement('input',{type:'date',className:'form-control',value:showDisposeModal.disposalDate,onChange:e=>setShowDisposeModal(f=>({...f,disposalDate:e.target.value}))})),
          FG('Sale Proceeds (₹)',React.createElement('input',{type:'number',className:'form-control',value:showDisposeModal.disposalValue,onChange:e=>setShowDisposeModal(f=>({...f,disposalValue:e.target.value})),placeholder:'0'}))
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowDisposeModal(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:confirmDispose},'Confirm Disposal')
        )
      )
    ),

    // ── DELETE CONFIRM MODAL ──
    showDeleteModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowDeleteModal(null)},
      React.createElement('div',{className:'modal',style:{width:420},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title',style:{color:'var(--red)'}},'Delete Asset'),
        React.createElement('div',{style:{fontSize:13,color:'var(--text2)',marginBottom:16}},'Remove this asset from the register permanently? This cannot be undone.'),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowDeleteModal(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-danger',onClick:confirmDelete},'Yes, Delete')
        )
      )
    )
  );
}

function CashFlowSheet({salon,period}={}){
  const {toast}=useToast();
  const sid=Number(salon&&salon.id)||1;
  const [fy,setFy]=useState((period&&period.fy)||'2025-26');
  const [mi,setMi]=useState(period&&typeof period.mi==='number'?period.mi:3);
  useEffect(()=>{if(period){setFy(period.fy);setMi(period.mi)}},[period&&period.fy,period&&period.mi]);
  const [editCfOverride,setEditCfOverride]=useState(null); // {field:'opening'|'investing'|'financing', label, current} or null
  const FYS=['2023-24','2024-25','2025-26','2026-27'];

  const cur=plBuild(sid,fy,mi);
  const curCal=periodToCalendar({fy,mi});
  const cf=cashFlowFor(sid,curCal&&curCal.year,curCal&&curCal.month,cur);
  const money=(n)=>formatMoney(n,{dashZero:true});

  return React.createElement(React.Fragment,null,
    h('div',{className:'fd-toolbar'},
      h('div',{className:'fd-date'},
        h('button',{onClick:()=>{if(mi===0){const i=FYS.indexOf(fy);if(i>0){setFy(FYS[i-1]);setMi(11)}}else setMi(mi-1)}},'‹'),
        h('span',{className:'lbl'},PL_MONTHS[mi]+' '+(mi<9?fy.slice(0,4):'20'+fy.slice(5))),
        h('button',{onClick:()=>{if(mi===11){const i=FYS.indexOf(fy);if(i<FYS.length-1){setFy(FYS[i+1]);setMi(0)}}else setMi(mi+1)}},'›')),
      h('select',{className:'form-control',style:{width:'auto',fontSize:12,padding:'6px 10px'},value:fy,onChange:e=>setFy(e.target.value)},
        FYS.map(f=>h('option',{key:f},f)))
    ),
    h('div',{className:'card',style:{marginBottom:16}},
      h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:2}},
        h('div',{className:'card-title'},'Cash Flow (Monthly) — Indirect Method'),
        h('div',{style:{fontSize:10.5,color:'var(--text3)'}},PL_MONTHS[mi]+' '+(mi<9?fy.slice(0,4):'20'+fy.slice(5)))),
      h('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:14,lineHeight:1.6}},
        'Starts from Profit Before Tax and reverses out what isn\'t actually cash yet — Depreciation (no cash movement at all), and the gap between what\'s accrued on the P&L and what\'s actually been paid for Recurring-Expense lines and Purchase of Cosmetic.'),

      h('div',{className:'kv'},h('span',null,'Net Profit (Profit Before Tax)'),h('span',{style:{fontWeight:600}},money(cf.pbt))),
      h('div',{className:'kv'},h('span',null,'Add: Depreciation (non-cash)'),h('span',null,money(cf.depAmt))),
      cf.opexAdj.filter(l=>l.gap!==0).length>0&&h('div',{style:{margin:'6px 0'}},
        h('div',{className:'kv'},h('span',null,(cf.opexGapTotal>=0?'Add':'Less')+': Operating Exp. accrued vs. actually paid'),h('span',{style:{color:cf.opexGapTotal>=0?'var(--green)':'var(--red)'}},money(cf.opexGapTotal))),
        h('div',{style:{paddingLeft:14,marginTop:4}},
          cf.opexAdj.filter(l=>l.gap!==0).map(l=>h('div',{key:l.name,style:{display:'flex',justifyContent:'space-between',fontSize:10.5,color:'var(--text3)',marginBottom:2}},
            h('span',null,l.name+' (accrued '+money(l.accrued)+' vs. paid '+money(l.paid)+')'),
            h('span',null,money(l.gap)))))),
      cf.cosmeticGap!==0&&h('div',{className:'kv'},
        h('span',null,(cf.cosmeticGap>=0?'Add':'Less')+': Purchase of Cosmetic — booked vs. paid ('+money(cf.cosmeticBooked)+' vs. '+money(cf.cosmeticPaid)+')'),
        h('span',{style:{color:cf.cosmeticGap>=0?'var(--green)':'var(--red)'}},money(cf.cosmeticGap))),
      h('div',{className:'kv',style:{fontWeight:700,borderTop:'1px solid var(--border2)',paddingTop:8,marginTop:8}},h('span',null,'Net Cash from Operating Activities'),h('span',{style:{color:cf.operatingCF>=0?'var(--green)':'var(--red)'}},money(cf.operatingCF))),

      h('div',{className:'kv',style:{marginTop:10,cursor:'pointer'},onClick:()=>setEditCfOverride({field:'investing',label:'Investing Activities',current:cf.investing})},
        h('span',{style:{color:'var(--accent)',textDecoration:'underline',textDecorationStyle:'dotted'}},'✏️ Investing Activities'),h('span',null,money(cf.investing))),
      h('div',{className:'kv',style:{cursor:'pointer'},onClick:()=>setEditCfOverride({field:'financing',label:'Financing Activities',current:cf.financing})},
        h('span',{style:{color:'var(--accent)',textDecoration:'underline',textDecorationStyle:'dotted'}},'✏️ Financing Activities'),h('span',null,money(cf.financing))),
      h('div',{className:'kv',style:{fontWeight:700,borderTop:'1px solid var(--border2)',paddingTop:8,marginTop:8}},h('span',null,'Net Cash Flow for the Month'),h('span',{style:{color:cf.netCF>=0?'var(--green)':'var(--red)'}},money(cf.netCF))),

      h('div',{className:'kv',style:{marginTop:10,cursor:'pointer'},onClick:()=>setEditCfOverride({field:'opening',label:'Opening Cash & Bank Balance',current:cf.opening})},
        h('span',{style:{color:'var(--accent)',textDecoration:'underline',textDecorationStyle:'dotted'}},'✏️ Opening Cash & Bank Balance'),h('span',null,money(cf.opening))),
      h('div',{className:'kv',style:{fontWeight:700,background:'var(--bg3)',padding:'8px 10px',borderRadius:'var(--r)',marginTop:6}},h('span',null,'Closing Cash & Bank Balance'),h('span',{style:{color:'var(--accent2)'}},money(cf.closing))),
      h('div',{style:{fontSize:10,color:'var(--text3)',marginTop:8}},'Carry this Closing Balance forward as next month\'s Opening Balance.')),

    editCfOverride&&h('div',{className:'modal-overlay',onClick:()=>setEditCfOverride(null)},
      h('div',{className:'modal',style:{width:420},onClick:e=>e.stopPropagation()},
        h('div',{className:'modal-title'},'Edit '+editCfOverride.label),
        h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:14,lineHeight:1.6}},
          editCfOverride.field==='opening'
            ?'Enter the actual Cash & Bank balance at the start of '+PL_MONTHS[mi]+' — usually last month\'s Closing Balance. It stays 0 until you enter it.'
            :'Nothing else in this app tracks '+editCfOverride.label.toLowerCase()+' (no Fixed Asset Register or loan module) — enter the real net amount for '+PL_MONTHS[mi]+'. It stays 0 until you do.'),
        h('div',{className:'form-group',style:{marginBottom:16}},
          h('label',null,editCfOverride.label+' (₹)'),
          h('input',{type:'number',className:'form-control',autoFocus:true,defaultValue:editCfOverride.current||'',id:'cf-override-input',placeholder:'0'})
        ),
        h('div',{className:'modal-actions'},
          h('button',{className:'btn btn-ghost',onClick:()=>setEditCfOverride(null)},'Cancel'),
          h('button',{className:'btn btn-primary',onClick:()=>{
            const val=Number(document.getElementById('cf-override-input').value)||0;
            const cal=periodToCalendar({fy,mi});
            if(cal)saveCashFlowManualOverride(sid,cal.year,cal.month,editCfOverride.field,val);
            setEditCfOverride(null);
            toast(editCfOverride.label+' updated','success');
          }},'Save')
        )
      )
    )
  );
}

function OutletPnLCore({salon,period}){
  const {toast}=useToast();
  const sid=Number(salon&&salon.id)||1;
  const [fy,setFy]=useState((period&&period.fy)||'2025-26');
  const [mi,setMi]=useState(period&&typeof period.mi==='number'?period.mi:3);
  useEffect(()=>{if(period){setFy(period.fy);setMi(period.mi)}},[period&&period.fy,period&&period.mi]);
  const [cmp,setCmp]=useState('Previous month');
  const [open,setOpen]=useState({});
  const [openGroups,setOpenGroups]=useState({});
  const [empCostModal,setEmpCostModal]=useState(null); // holds the Employee cost section for the "Summary of working" drill-down
  const [revSrcTick,setRevSrcTick]=useState(0); // re-render after the Revenue source is changed
  const [revDrilldown,setRevDrilldown]=useState(null); // 'cash' | 'card' | 'upi' | null — which Revenue line's source rows to show
  const [opexAnnexure,setOpexAnnexure]=useState(null); // Operating Expenses line name, or null — which line's annexure to show
  const [costBreakup,setCostBreakup]=useState(null); // Direct Cost of Service line name, or null — which line's invoice-wise breakup to show
  const [editOverride,setEditOverride]=useState(null); // {field:'otherIncome'|'depreciation'|'interest', label, current} or null
  const FYS=['2023-24','2024-25','2025-26','2026-27'];

  const cur=plBuild(sid,fy,mi);
  const prevFy=FYS[Math.max(0,FYS.indexOf(fy)-1)];
  const base=cmp==='Previous month'
    ?plBuild(sid,mi===0?prevFy:fy,mi===0?11:mi-1)
    :cmp==='Same month last year'
      ?plBuild(sid,prevFy,mi)
      :null;
  const budget=cmp==='Budget';
  const bud=v=>Math.round(v*1.05/10)*10;
  const cmpVal=(v)=>budget?bud(v):null;

  const of=(v)=>cur.revenue?(v/cur.revenue*100):0;
  const delta=(now,then)=>then?((now-then)/Math.abs(then)*100):0;
  const money=(n)=>formatMoney(n,{dashZero:true});
  const pct=(n)=>(n>0?'+':'')+n.toFixed(1)+'%';

  const compare=(sel)=>{
    if(budget){const b=budgetPlFor(sid,fy,cur);return b?sel(b):null;} // real budget (P&L → Budget)
    if(!base)return null;
    return sel(base);
  };

  const gp=cur.gross, ebit=cur.ebitda, pbt=cur.pbt;
  const margin=cur.revenue?pbt/cur.revenue*100:0;
  const prevPbt=compare(x=>x.pbt);
  const prevRev=compare(x=>x.revenue);

  // break-even: treat Employee cost (excl. incentives) + Operating expenses as fixed
  const fixed=cur.sections.filter(s=>['Employee cost','Operating expenses'].includes(s.sec))
    .reduce((t,s)=>t+s.lines.filter(l=>!/Incentive/i.test(l.name)).reduce((a,l)=>a+l.amt,0),0)+cur.belowTot;
  const contribRatio=cur.revenue?(cur.revenue-cur.direct-cur.sections[2].lines.filter(l=>/Incentive/i.test(l.name)).reduce((a,l)=>a+l.amt,0))/cur.revenue:0;
  const breakEven=contribRatio>0?fixed/contribRatio:0;
  const daysToBE=cur.revenue?Math.ceil(breakEven/(cur.revenue/30)):0;

  const th=(t,right,w)=>h('th',{style:{padding:'9px 12px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',textAlign:right?'right':'left',whiteSpace:'nowrap',borderBottom:'2px solid var(--accent)',minWidth:w||null}},t);
  const cell=(v,o)=>h('td',{style:Object.assign({padding:'7px 12px',fontSize:12.5,textAlign:'right',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums',color:'var(--text2)'},o||{})},v);

  const totalRow=(label,val,color,note)=>{
    const b=compare(x=>label==='Gross profit'?x.gross:label==='EBITDA'?x.ebitda:x.pbt);
    const d=b?delta(val,b):null;
    return h('tr',{key:label,style:{background:'var(--bg3)'}},
      h('td',{style:{padding:'10px 12px',fontSize:12.5,fontWeight:700,color:color,borderBottom:'1px solid var(--border2)',borderTop:'1px solid var(--border2)'}},label,
        note?h('span',{style:{fontWeight:400,color:'var(--text3)',fontSize:11}},'  '+note):null),
      cell(money(val),{fontWeight:700,color,borderTop:'1px solid var(--border2)'}),
      cell(of(val).toFixed(1)+'%',{fontWeight:600,color:'var(--text3)',borderTop:'1px solid var(--border2)'}),
      cell(b?money(b):'—',{borderTop:'1px solid var(--border2)'}),
      cell(d===null?'—':pct(d),{fontWeight:600,color:d>=0?'var(--green)':'var(--red)',borderTop:'1px solid var(--border2)'}));
  };

  const exportCsv=async()=>{
    const rows=[['Particulars','Amount','% of revenue']];
    cur.sections.forEach(S=>{rows.push([S.sec,'','']);S.lines.forEach(l=>rows.push([l.name,l.amt,of(l.amt).toFixed(1)]))});
    rows.push(['Gross profit',cur.gross,of(cur.gross).toFixed(1)]);
    rows.push(['EBITDA',cur.ebitda,of(cur.ebitda).toFixed(1)]);
    cur.below.forEach(l=>rows.push([l.name,l.amt,of(l.amt).toFixed(1)]));
    rows.push(['Profit before tax',cur.pbt,of(cur.pbt).toFixed(1)]);
    const filename='PnL_'+(salon?salon.name.split('—')[0].trim().replace(/\s/g,'_'):'Outlet')+'_'+PL_MONTHS[mi]+'_FY'+fy+'_'+(plFinal?'Final':'Draft')+'.xlsx';
    try{
      const blob=await stampExcelBlob(await exportReportExcelBlob('Monthly P&L',rows),plWm);
      const url=URL.createObjectURL(blob);const a=document.createElement('a');
      a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
      toast('Monthly P&L exported');
    }catch(err){toast(err.message,'error');}
  };
  const [finalTick,setFinalTick]=useState(0);
  const plFinal=isPnlFinal(sid,fy,mi)&&finalTick>=0;
  const plFinalRec=loadPnlFinal(sid)[fy+'|'+mi]||null;
  const plWm=plFinal?'FINAL':'DRAFT';
  const plUser=currentSessionUser();
  const canFinalize=!!plUser&&(plUser.role==='Super Admin'||userCanEditSheet(plUser,sid,'outlet-pnl'));
  const toggleFinal=()=>{
    const label=PL_MONTHS[mi]+' '+(mi<9?fy.slice(0,4):'20'+fy.slice(5));
    if(!plFinal){const cal0=periodToCalendar({fy,mi});const cm=cal0?collectionFinalBlockMessage(sid,cal0.year,cal0.month):'';if(cm){toast(cm,'error');return;}}
    if(!plFinal){if(!window.confirm('Mark the '+label+' P&L as FINAL? The whole month locks: nobody — Super Admin included — can change Daily Sales, Vendors, Attendance, Salary, Incentive, Advances, Penalties or the P&L for it. Only a Super Admin can un-finalize it, with a reason.'))return;}
    else if(!requestUnlock(sid,'the '+label+' P&L (it goes back to DRAFT and the month unlocks)'))return;
    setPnlFinal(sid,fy,mi,!plFinal);setFinalTick(t=>t+1);
    toast(plFinal?label+' P&L is back to Draft':label+' P&L marked Final','success');
    if(!plFinal&&salon&&window.confirm('Email the final '+label+' P&L to the Automatic-reports recipients (and you)?'))
      emailFinalPnl(salon,fy,mi).then(r=>toast('Final P&L emailed to '+((r&&r.sentTo)||[]).join(', '),'success')).catch(e=>toast('Could not email the P&L: '+(e.message||e),'error'));
  };
  const plReportTitle='Monthly P&L — '+(salon?salon.name.split('—')[0].trim():'Outlet')+' — '+PL_MONTHS[mi]+' '+(mi<9?fy.slice(0,4):'20'+fy.slice(5));
  // ── P&L Excel export with LIVE FORMULAS — not pasted numbers. Totals are real SUM() formulas,
  // Gross Profit/EBITDA/PBT are real subtraction formulas, Revenue lines are real ÷1.05 formulas,
  // Operating Expenses lines are real SUM-of-source-columns formulas, and every %-of-revenue cell
  // references the Total Revenue cell — so opening this in Excel and clicking any number shows
  // exactly how it was built, and changing a source figure recalculates everything downstream. ──
  const [plExcelBusy,setPlExcelBusy]=useState(false);
  const exportPnLExcelWithFormulas=async()=>{
    setPlExcelBusy(true);
    try{
      await loadExcelJS();
      const cal=periodToCalendar({fy,mi});
      const coll=cal?plRevenueGrossFor(sid,cal.year,cal.month):{cash:0,card:0,upi:0};
      const revSection=cur.sections[0],directSection=cur.sections[1],empSection=cur.sections[2],opexSection=cur.sections[3];
      const otherIncome=(revSection.lines.find(l=>l.name==='Other Income')||{amt:0}).amt;

      // ── Lay out row numbers first (1-indexed, matching Excel rows) — unchanged from before ──
      let r=6;
      const L={};
      L.revHeader=r++; L.revCash=r++; L.revCard=r++; L.revUpi=r++; L.revOther=r++; L.totalRev=r++; r++;
      L.directHeader=r++; L.directStart=r; directSection.lines.forEach(()=>r++); L.directEnd=r-1; L.totalDirect=r++; r++;
      L.grossProfit=r++; r++;
      L.empHeader=r++; L.empStart=r; empSection.lines.forEach(()=>r++); L.empEnd=r-1; L.totalEmp=r++; r++;
      L.opexHeader=r++; L.opexStart=r; opexSection.lines.forEach(()=>r++); L.opexEnd=r-1; L.totalOpex=r++; r++;
      L.ebitda=r++; r++;
      L.belowHeader=r++; L.belowStart=r; cur.below.forEach(()=>r++); L.belowEnd=r-1;
      L.pbt=r++;
      const maxRow=L.pbt,maxCol=7;

      const wb=new ExcelJS.Workbook();
      wb.creator='SalonOS';wb.created=new Date();
      const ws=wb.addWorksheet('P&L Statement');
      const HEADER_FILL={type:'pattern',pattern:'solid',fgColor:{argb:'FF14335E'}};
      const SECTION_FILL={type:'pattern',pattern:'solid',fgColor:{argb:'FFDBE6F3'}};
      const TOTAL_FILL={type:'pattern',pattern:'solid',fgColor:{argb:'FFEEF3FA'}};
      const ZEBRA_FILL={type:'pattern',pattern:'solid',fgColor:{argb:'FFF4F7FB'}};
      const THIN={style:'thin',color:{argb:'FFD7DDE6'}};
      const BORDER={top:THIN,bottom:THIN,left:THIN,right:THIN};
      const TOTAL_BORDER={...BORDER,top:{style:'medium',color:{argb:'FF14335E'}}};

      ws.getCell('A1').value=plReportTitle;
      ws.getCell('A1').font={bold:true,size:13,color:{argb:'FF14335E'}};
      ws.getCell('A2').value='FY '+fy+' · Generated '+new Date().toLocaleString('en-IN');
      ws.getCell('A2').font={size:9,color:{argb:'FF5B6472'}};
      ws.getCell('A3').value='All figures in ₹. Cells with a live formula recalculate automatically if you edit any source figure.';
      ws.getCell('A3').font={size:8.5,italic:true,color:{argb:'FF8A94A6'}};

      const headerRow=ws.getRow(5);
      headerRow.values=['Particulars','Amount (₹)','% of Revenue','Recurring (Active) ₹','Daily Sales & Exp ₹','Bank Statement ₹','Raw Collected — Cradlee ₹'];
      headerRow.eachCell({includeEmpty:true},(cell,col)=>{
        cell.fill=HEADER_FILL;cell.font={bold:true,color:{argb:'FFFFFFFF'},size:9};
        cell.alignment={horizontal:col===1?'left':'right',vertical:'middle'};cell.border=BORDER;
      });

      // Section-header rows (merged across all columns, light-blue band)
      const sectionRow=(rowNum,label)=>{
        ws.mergeCells(rowNum,1,rowNum,maxCol);
        const cell=ws.getCell(rowNum,1);
        cell.value=label;cell.fill=SECTION_FILL;cell.font={bold:true,color:{argb:'FF14335E'},size:9};
        ws.getRow(rowNum).eachCell({includeEmpty:true},c=>c.border=BORDER);
      };
      // A regular data row — zebra shading, borders, right-aligned numbers
      const dataRow=(rowNum,values)=>{
        const row=ws.getRow(rowNum);
        row.values=values;
        row.eachCell({includeEmpty:true},(cell,col)=>{
          cell.border=BORDER;
          if(rowNum%2===0)cell.fill=ZEBRA_FILL;
          if(col>1)cell.alignment={horizontal:'right'};
        });
      };
      // A total/subtotal row — bold, tinted, heavier top border
      const totalRow=(rowNum,values)=>{
        const row=ws.getRow(rowNum);
        row.values=values;
        row.eachCell({includeEmpty:true},(cell,col)=>{
          cell.fill=TOTAL_FILL;cell.font={bold:true};cell.border=TOTAL_BORDER;
          if(col>1)cell.alignment={horizontal:'right'};
        });
      };
      const setF=(rowNum,col,formula,result)=>{
        const cell=ws.getCell(rowNum,col);
        cell.value={formula,result:result==null?0:result};
        if(col===2)cell.numFmt='#,##0';
        if(col===3)cell.numFmt='0.0%';
      };
      const setNum=(rowNum,col,val)=>{const cell=ws.getCell(rowNum,col);cell.value=val;if(col>=2&&col<=7)cell.numFmt='#,##0';};

      sectionRow(L.revHeader,'A. REVENUE (Note 1)');
      dataRow(L.revCash,['Revenue from Operations - Cash Sale','','','','','',Math.round(coll.cash)]);
      dataRow(L.revCard,['Revenue from Operations - Card Sale','','','','','',Math.round(coll.card)]);
      dataRow(L.revUpi,['Revenue from Operations - UPI Sale','','','','','',Math.round(coll.upi)]);
      dataRow(L.revOther,['Other Income']);setNum(L.revOther,2,Math.round(otherIncome));
      totalRow(L.totalRev,['Total Revenue (Note 1)']);

      sectionRow(L.directHeader,'B. DIRECT COST OF SERVICE (Note 2)');
      directSection.lines.forEach((l,i)=>{dataRow(L.directStart+i,[l.name]);setNum(L.directStart+i,2,Math.round(l.amt));});
      totalRow(L.totalDirect,['Total Direct Cost (Note 2)']);

      totalRow(L.grossProfit,['Gross Profit']);

      sectionRow(L.empHeader,'C. EMPLOYEE BENEFIT EXPENSES (Note 3)');
      empSection.lines.forEach((l,i)=>{dataRow(L.empStart+i,[l.name]);setNum(L.empStart+i,2,Math.round(l.amt));});
      totalRow(L.totalEmp,['Total Employee Benefit Expenses (Note 3)']);

      sectionRow(L.opexHeader,'D. OPERATING EXPENSES (Note 4)');
      opexSection.lines.forEach((l,i)=>{
        const d=cal?operatingExpenseAnnexureFor(sid,cal.year,cal.month,l.name):null;
        const rn=L.opexStart+i;
        dataRow(rn,[l.name]);
        setNum(rn,4,d?Math.round(d.recurringTotal):0);setNum(rn,5,d?Math.round(d.dailyAmt):0);setNum(rn,6,d?Math.round(d.bankAmt):0);
      });
      totalRow(L.totalOpex,['Total Operating Expenses (Note 4)']);

      totalRow(L.ebitda,['EBITDA']);

      sectionRow(L.belowHeader,'E. DEPRECIATION AND INTEREST (Note 5)');
      cur.below.forEach((l,i)=>{dataRow(L.belowStart+i,[l.name]);setNum(L.belowStart+i,2,Math.round(l.amt));});
      totalRow(L.pbt,['Profit Before Tax']);

      // ── Live formulas, cached with today's computed values for correct display before Excel
      // ever recalculates ──
      setF(L.revCash,2,'G'+L.revCash+'/1.05',Math.round(coll.cash/1.05));
      setF(L.revCard,2,'G'+L.revCard+'/1.05',Math.round(coll.card/1.05));
      setF(L.revUpi,2,'G'+L.revUpi+'/1.05',Math.round(coll.upi/1.05));
      setF(L.totalRev,2,'SUM(B'+L.revCash+':B'+L.revOther+')',Math.round(cur.revenue));
      setF(L.totalDirect,2,'SUM(B'+L.directStart+':B'+L.directEnd+')',Math.round(cur.direct));
      setF(L.grossProfit,2,'B'+L.totalRev+'-B'+L.totalDirect,Math.round(cur.gross));
      setF(L.totalEmp,2,'SUM(B'+L.empStart+':B'+L.empEnd+')',Math.round(empSection.tot));
      // For noDaily lines (see PL_OPEX_LINES) the formula deliberately excludes column E — the
      // Daily Sales & Exp amount is still shown there for reference, but operatingExpensesFor
      // never counts it for these lines (the cost is already in column D's Recurring accrual),
      // so the live formula has to skip it too or it'd silently recalculate to a bigger, wrong
      // number the moment this file is opened in Excel.
      opexSection.lines.forEach((l,i)=>{const rn=L.opexStart+i;const noDaily=PL_OPEX_LINES[i]&&PL_OPEX_LINES[i].noDaily;setF(rn,2,noDaily?('D'+rn+'+F'+rn):('D'+rn+'+E'+rn+'+F'+rn),Math.round(l.amt));});
      setF(L.totalOpex,2,'SUM(B'+L.opexStart+':B'+L.opexEnd+')',Math.round(opexSection.tot));
      setF(L.ebitda,2,'B'+L.grossProfit+'-B'+L.totalEmp+'-B'+L.totalOpex,Math.round(cur.ebitda));
      setF(L.pbt,2,'B'+L.ebitda+'-SUM(B'+L.belowStart+':B'+L.belowEnd+')',Math.round(cur.pbt));
      // % of Revenue — every amount-bearing row, referencing the Total Revenue cell absolutely
      const pctRows=[[L.revCash,coll.cash/1.05],[L.revCard,coll.card/1.05],[L.revUpi,coll.upi/1.05],[L.revOther,otherIncome],[L.totalRev,cur.revenue],
        ...directSection.lines.map((l,i)=>[L.directStart+i,l.amt]),[L.totalDirect,cur.direct],[L.grossProfit,cur.gross],
        ...empSection.lines.map((l,i)=>[L.empStart+i,l.amt]),[L.totalEmp,empSection.tot],
        ...opexSection.lines.map((l,i)=>[L.opexStart+i,l.amt]),[L.totalOpex,opexSection.tot],[L.ebitda,cur.ebitda],
        ...cur.below.map((l,i)=>[L.belowStart+i,l.amt]),[L.pbt,cur.pbt]];
      pctRows.forEach(([rn,amt])=>setF(rn,3,'B'+rn+'/$B$'+L.totalRev,cur.revenue?amt/cur.revenue:0));

      ws.columns=[{width:38},{width:16},{width:12},{width:16},{width:16},{width:16},{width:20}];
      ws.views=[{state:'frozen',ySplit:5}];
      ws.autoFilter={from:{row:5,column:1},to:{row:5,column:maxCol}};

      // ── Sheet 2: Recurring Expenses working — the payee-level detail behind the "Recurring
      // (Active) ₹" column on Sheet 1, with a live monthly-equivalent formula of its own. GST
      // input credit isn't available for this business, so Monthly Equivalent is always built
      // from the Invoice Value (Taxable + GST) — GST Amount itself is a live 18%-of-Taxable
      // formula whenever GST isn't applicable (Reverse Charge), not a fixed pasted number. ──
      const ws2=wb.addWorksheet('Recurring Expenses Working');
      ws2.mergeCells(1,1,1,9);
      ws2.getCell(1,1).value='Working Notes — Recurring Expenses feeding Operating Expenses';
      ws2.getCell(1,1).fill=SECTION_FILL;ws2.getCell(1,1).font={bold:true,color:{argb:'FF14335E'},size:10};
      const rec2Header=ws2.getRow(2);
      rec2Header.values=['P&L Line','Payee / Vendor','Frequency','Taxable Amount ₹','GST Applicable','GST Amount ₹','Invoice Value ₹','Divisor','Monthly Equivalent ₹'];
      rec2Header.eachCell({includeEmpty:true},(cell,col)=>{cell.fill=HEADER_FILL;cell.font={bold:true,color:{argb:'FFFFFFFF'},size:9};cell.border=BORDER;if(col>3)cell.alignment={horizontal:'right'};});
      let rr=3;
      opexSection.lines.forEach(l=>{
        const d=cal?operatingExpenseAnnexureFor(sid,cal.year,cal.month,l.name):null;
        if(!d)return;
        d.recurring.filter(it=>it.status==='Active').forEach(it=>{
          const divisor=recurringDivisorOf(it);
          const gstAmt=it.gstApplicable?(Number(it.gstAmount)||0):Number(it.amount)*0.18;
          const row=ws2.getRow(rr);
          row.values=[l.name,it.payee,it.frequency,Number(it.amount),it.gstApplicable?'Yes':'No (RCM)','','',divisor,''];
          row.eachCell({includeEmpty:true},(cell,col)=>{cell.border=BORDER;if(rr%2===0)cell.fill=ZEBRA_FILL;if(col>3)cell.alignment={horizontal:'right'};});
          row.getCell(4).numFmt='#,##0';
          if(!it.gstApplicable){row.getCell(6).value={formula:'D'+rr+'*0.18',result:Math.round(gstAmt)};}
          else{row.getCell(6).value=Math.round(gstAmt);}
          row.getCell(6).numFmt='#,##0';
          row.getCell(7).value={formula:'D'+rr+'+F'+rr,result:Math.round(Number(it.amount)+gstAmt)};row.getCell(7).numFmt='#,##0';
          row.getCell(9).value={formula:'G'+rr+'/H'+rr,result:Math.round(recurringExpenseMonthlyAmt(it))};row.getCell(9).numFmt='#,##0';
          rr++;
        });
      });
      ws2.columns=[{width:26},{width:26},{width:12},{width:15},{width:14},{width:13},{width:15},{width:10},{width:18}];
      ws2.views=[{state:'frozen',ySplit:2}];
      ws2.autoFilter={from:{row:2,column:1},to:{row:2,column:9}};

      // ── Sheet 3: Notes to Accounts — same numbered-note convention a corporate financial
      // statement uses (Note 1, Note 2, ...), each with its own sub-schedule and a total that's a
      // live formula pointing straight back at the matching total cell on the P&L Statement sheet,
      // so the two can never quietly drift apart from each other. ──
      const ws3=wb.addWorksheet('Notes to Accounts');
      ws3.mergeCells(1,1,1,4);
      ws3.getCell(1,1).value=plReportTitle+' — Notes to Accounts';
      ws3.getCell(1,1).fill=SECTION_FILL;ws3.getCell(1,1).font={bold:true,color:{argb:'FF14335E'},size:11};
      ws3.getCell(2,1).value='Forming part of the Profit & Loss Statement for the period. All figures in ₹.';
      ws3.getCell(2,1).font={size:8.5,italic:true,color:{argb:'FF8A94A6'}};
      let nr=4;
      const noteHeader=(num,title)=>{
        ws3.mergeCells(nr,1,nr,4);
        const cell=ws3.getCell(nr,1);
        cell.value='Note '+num+' — '+title;
        cell.fill=HEADER_FILL;cell.font={bold:true,color:{argb:'FFFFFFFF'},size:10};
        ws3.getRow(nr).eachCell({includeEmpty:true},c=>c.border=BORDER);
        nr++;
      };
      const noteSubHeader=(cols)=>{
        const row=ws3.getRow(nr);
        row.values=cols;
        row.eachCell({includeEmpty:true},(cell,col)=>{cell.font={bold:true,size:9,color:{argb:'FF5B6472'}};cell.border=BORDER;if(col>1)cell.alignment={horizontal:'right'};});
        nr++;
      };
      const noteLine=(label,val,isFormula)=>{
        const row=ws3.getRow(nr);
        row.getCell(1).value=label;
        const c2=row.getCell(2);
        if(isFormula)c2.value={formula:val.formula,result:val.result};else c2.value=val;
        c2.numFmt='#,##0';
        row.eachCell({includeEmpty:true},(cell,col)=>{cell.border=BORDER;if(nr%2===0)cell.fill=ZEBRA_FILL;if(col>1)cell.alignment={horizontal:'right'};});
        nr++;
      };
      const noteTotal=(label,formula,result)=>{
        const row=ws3.getRow(nr);
        row.getCell(1).value=label;
        row.getCell(2).value={formula,result};row.getCell(2).numFmt='#,##0';
        row.eachCell({includeEmpty:true},(cell,col)=>{cell.fill=TOTAL_FILL;cell.font={bold:true};cell.border=TOTAL_BORDER;if(col>1)cell.alignment={horizontal:'right'};});
        nr++;nr++; // blank row after each note
      };

      noteHeader(1,'Revenue from Operations');
      noteLine('Cash Sale (Collection Reco, net of GST @ 5%)',{formula:"'P&L Statement'!B"+L.revCash,result:Math.round(coll.cash/1.05)},true);
      noteLine('Card Sale (Collection Reco, net of GST @ 5%)',{formula:"'P&L Statement'!B"+L.revCard,result:Math.round(coll.card/1.05)},true);
      noteLine('UPI Sale (Collection Reco, net of GST @ 5%)',{formula:"'P&L Statement'!B"+L.revUpi,result:Math.round(coll.upi/1.05)},true);
      noteLine('Other Income',{formula:"'P&L Statement'!B"+L.revOther,result:Math.round(otherIncome)},true);
      noteTotal('Total Revenue from Operations',"'P&L Statement'!B"+L.totalRev,Math.round(cur.revenue));

      noteHeader(2,'Direct Cost of Service');
      directSection.lines.forEach((l,i)=>noteLine(l.name,{formula:"'P&L Statement'!B"+(L.directStart+i),result:Math.round(l.amt)},true));
      noteTotal('Total Direct Cost of Service',"'P&L Statement'!B"+L.totalDirect,Math.round(cur.direct));

      noteHeader(3,'Employee Benefit Expenses');
      empSection.lines.forEach((l,i)=>noteLine(l.name,{formula:"'P&L Statement'!B"+(L.empStart+i),result:Math.round(l.amt)},true));
      noteTotal('Total Employee Benefit Expenses',"'P&L Statement'!B"+L.totalEmp,Math.round(empSection.tot));

      noteHeader(4,'Operating Expenses');
      noteSubHeader(['Particulars','Amount (₹)','','Sourced From']);
      opexSection.lines.forEach((l,i)=>{
        const rn2=L.opexStart+i;
        const line=PL_OPEX_LINES[i];
        const src=[];
        if(line){
          if(line.credit)src.push('Penalties (credit — reduces this section)');
          else if(line.vendorWinsOverRecurring)src.push('Vendor Sheet invoice if booked this month, else Recurring Expenses estimate');
          else if(line.noDaily)src.push('Recurring Expenses accrual');
          else src.push('Daily Sales & Exp'+(line.alsoVendorCat?' + Vendor Sheet':''));
          if(line.alsoNature)src.push('Bank Statement (Nature = '+line.alsoNature+')');
          if(line.alsoNetBankCharges)src.push('Collection Reco Net Bank Charges');
        }
        const row=ws3.getRow(nr);
        row.getCell(1).value=l.name;
        row.getCell(2).value={formula:"'P&L Statement'!B"+rn2,result:Math.round(l.amt)};row.getCell(2).numFmt='#,##0';
        row.getCell(4).value=src.join('; ');row.getCell(4).font={size:8,color:{argb:'FF8A94A6'}};
        row.eachCell({includeEmpty:true},(cell,col)=>{cell.border=BORDER;if(nr%2===0)cell.fill=ZEBRA_FILL;if(col===2)cell.alignment={horizontal:'right'};});
        nr++;
      });
      noteTotal('Total Operating Expenses',"'P&L Statement'!B"+L.totalOpex,Math.round(opexSection.tot));

      noteHeader(5,'Depreciation and Interest');
      cur.below.forEach((l,i)=>noteLine(l.name,{formula:"'P&L Statement'!B"+(L.belowStart+i),result:Math.round(l.amt)},true));
      noteTotal('Total Depreciation and Interest',"SUM('P&L Statement'!B"+L.belowStart+":B"+L.belowEnd+")",cur.below.reduce((s,l)=>s+l.amt,0));

      ws3.columns=[{width:42},{width:16},{width:4},{width:52}];

      const filename=(plReportTitle.replace(/[^a-z0-9]+/gi,'_')||'PnL')+'_with_Formulas_'+(plFinal?'Final':'Draft')+'.xlsx';
      const buf=await wb.xlsx.writeBuffer();
      const blob=await stampExcelBlob(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),plWm);
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();
      setTimeout(()=>URL.revokeObjectURL(url),4000);
      toast(filename+' downloaded — every total and % is a live formula, open it in Excel to trace it','success');
    }catch(e){toast(e.message||'Could not build the Excel file — please try again','error');}
    setPlExcelBusy(false);
  };
  // Working Notes — the "how was this number arrived at" appendix. Mirrors exactly what the
  // in-app Revenue drill-down and Operating Expenses annexure show, so the exported file carries
  // the same backup a reviewer would otherwise have to click through the app to see.
  const plWorkingNotesFor=()=>{
    const cal=periodToCalendar({fy,mi});
    if(!cal)return{revenueNotes:[],opexNotes:[]};
    const coll=plRevenueGrossFor(sid,cal.year,cal.month);
    const srcName=plRevenueSourceFor(sid,cal.year,cal.month)==='dse'?'Daily Sales & Exp':'Collection Reco';
    const revenueNotes=[
      {label:'Revenue from Operations - Cash Sale',formula:'Cash Sale per '+srcName+' ÷ 1.05',raw:coll.cash,result:coll.cash/1.05},
      {label:'Revenue from Operations - Card Sale',formula:'Card Sale per '+srcName+' ÷ 1.05',raw:coll.card,result:coll.card/1.05},
      {label:'Revenue from Operations - UPI Sale',formula:(srcName==='Daily Sales & Exp'?'UPI Sale + Luzo Sale':'UPI collected')+' per '+srcName+' ÷ 1.05',raw:coll.upi,result:coll.upi/1.05}
    ];
    const opexNotes=PL_OPEX_LINES.map(l=>{
      const d=operatingExpenseAnnexureFor(sid,cal.year,cal.month,l.name);
      return d&&(d.recurringTotal>0||d.dailyAmt>0||d.bankAmt>0)?d:null;
    }).filter(Boolean);
    return{revenueNotes,opexNotes};
  };
  const plReportBodyHtml=()=>{
    let rows='';
    cur.sections.forEach(S=>{
      rows+='<tr><td class="section" colspan="3">'+S.sec+'</td></tr>';
      S.lines.forEach(l=>{rows+='<tr><td>'+l.name+'</td><td class="num">'+money(l.amt)+'</td><td class="num">'+of(l.amt).toFixed(1)+'%</td></tr>';});
    });
    rows+='<tr class="total-row"><td>Gross Profit</td><td class="num">'+money(cur.gross)+'</td><td class="num">'+of(cur.gross).toFixed(1)+'%</td></tr>';
    rows+='<tr class="total-row"><td>EBITDA</td><td class="num '+(cur.ebitda>=0?'positive':'negative')+'">'+money(cur.ebitda)+'</td><td class="num">'+of(cur.ebitda).toFixed(1)+'%</td></tr>';
    cur.below.forEach(l=>{rows+='<tr><td>'+l.name+'</td><td class="num">'+money(l.amt)+'</td><td class="num">'+of(l.amt).toFixed(1)+'%</td></tr>';});
    rows+='<tr class="total-row"><td>Profit Before Tax</td><td class="num '+(cur.pbt>=0?'positive':'negative')+'">'+money(cur.pbt)+'</td><td class="num">'+of(cur.pbt).toFixed(1)+'%</td></tr>';
    let out='<table><thead><tr><th>Particulars</th><th class="num">Amount</th><th class="num">% of Revenue</th></tr></thead><tbody>'+rows+'</tbody></table>';

    const{revenueNotes,opexNotes}=plWorkingNotesFor();
    out+='<h3 style="margin-top:26px;font-size:15px">Working Notes</h3>';
    out+='<p style="font-size:11px;color:#777;margin-bottom:10px">How each linked figure above was arrived at — same backup as the in-app "🔗" and "📎" drill-downs.</p>';
    revenueNotes.forEach(n=>{out+='<p style="font-size:12px;margin:4px 0"><b>'+n.label+'</b> = '+n.formula+' = ₹'+Math.round(n.raw).toLocaleString('en-IN')+' ÷ 1.05 = <b>₹'+Math.round(n.result).toLocaleString('en-IN')+'</b></p>';});
    out+='<p style="font-size:12px;margin:10px 0"><b>Employee Cost</b> = Master Salary (role-wise gross) + Salary Working (Gross Salary + Tea) + Incentive Working + PF/ESIC employer contribution + Membership/Product/Daily Incentive from Daily Sales & Exp. Full employee-wise breakup: "🔍 Summary of Working" in-app.</p>';
    if(opexNotes.length){
      out+='<p style="font-size:12px;font-weight:700;margin:14px 0 6px">Operating Expenses — Recurring Commitments + Actuals</p>';
      opexNotes.forEach(d=>{
        const parts=[];
        if(d.recurringTotal>0)parts.push('Recurring Expenses (Active): ₹'+Math.round(d.recurringTotal).toLocaleString('en-IN'));
        if(d.dailyAmt>0)parts.push('Daily Sales & Exp: ₹'+Math.round(d.dailyAmt).toLocaleString('en-IN')+(d.dailyExcluded?' (excluded — already in Recurring)':''));
        if(d.bankAmt>0)parts.push('Bank Statement: ₹'+Math.round(d.bankAmt).toLocaleString('en-IN'));
        const lineTotal=d.recurringTotal+(d.dailyExcluded?0:d.dailyAmt)+d.bankAmt;
        out+='<p style="font-size:12px;margin:6px 0 2px"><b>'+d.lineName+'</b> = '+parts.join(' + ')+' = <b>₹'+Math.round(lineTotal).toLocaleString('en-IN')+'</b></p>';
        const active=d.recurring.filter(it=>it.status==='Active');
        if(active.length){
          out+='<table style="margin:4px 0 10px"><thead><tr><th>Payee</th><th>Frequency</th><th class="num">Amount</th><th class="num">Monthly Equiv.</th></tr></thead><tbody>'
            +active.map(it=>'<tr><td>'+it.payee+'</td><td>'+it.frequency+'</td><td class="num">₹'+Number(it.amount).toLocaleString('en-IN')+'</td><td class="num">₹'+Math.round(recurringExpenseMonthlyAmt(it)).toLocaleString('en-IN')+'</td></tr>').join('')
            +'</tbody></table>';
        }
      });
    }
    return out;
  };
  const plReportSheetRows=()=>{
    const out=[['Particulars','Amount','% of Revenue']];
    cur.sections.forEach(S=>{out.push([S.sec,'','']);S.lines.forEach(l=>out.push([l.name,Math.round(l.amt),of(l.amt).toFixed(1)]));});
    out.push(['Gross Profit',Math.round(cur.gross),of(cur.gross).toFixed(1)]);
    out.push(['EBITDA',Math.round(cur.ebitda),of(cur.ebitda).toFixed(1)]);
    cur.below.forEach(l=>out.push([l.name,Math.round(l.amt),of(l.amt).toFixed(1)]));
    out.push(['Profit Before Tax',Math.round(cur.pbt),of(cur.pbt).toFixed(1)]);
    out.push([]);out.push(['WORKING NOTES']);
    const{revenueNotes,opexNotes}=plWorkingNotesFor();
    revenueNotes.forEach(n=>out.push([n.label,n.formula,'Raw: '+Math.round(n.raw),'Result: '+Math.round(n.result)]));
    out.push(['Employee Cost','Master Salary + Salary Working (Gross Salary + Tea) + Incentive Working + PF/ESIC + Membership/Product/Daily Incentive']);
    if(opexNotes.length){
      out.push([]);out.push(['Operating Expenses — breakdown']);
      out.push(['Line','Recurring (Active)','Daily Sales & Exp','Bank Statement','Total']);
      opexNotes.forEach(d=>out.push([d.lineName,Math.round(d.recurringTotal),Math.round(d.dailyAmt)+(d.dailyExcluded?' (excluded)':''),Math.round(d.bankAmt),Math.round(d.recurringTotal+(d.dailyExcluded?0:d.dailyAmt)+d.bankAmt)]));
      out.push([]);out.push(['Recurring Expenses detail']);
      out.push(['Line','Payee','Frequency','Amount','Monthly Equivalent']);
      opexNotes.forEach(d=>d.recurring.filter(it=>it.status==='Active').forEach(it=>out.push([d.lineName,it.payee,it.frequency,Number(it.amount),Math.round(recurringExpenseMonthlyAmt(it))])));
    }
    return out;
  };

  const metric=(l,v,s,col)=>h('div',{className:'metric-card'},h('div',{className:'metric-label'},l),
    h('div',{className:'metric-value',style:col?{color:col}:null},v),h('div',{className:'metric-sub'},s));

  const trend=PL_MONTHS.map((m,i)=>{const p=plBuild(sid,fy,i);return {m,rev:p.revenue,pbt:p.pbt}});
  const maxRev=Math.max(...trend.map(t=>t.rev));

  return h('div',{className:'fade-in',style:{position:'relative'}},
    h(WatermarkOverlay,{text:plWm,final:plFinal}),
    h('div',{className:'section-header'},
      h('div',null,h('div',{className:'page-title'},fixAmp('Monthly P&L — '+(salon?salon.name:'Outlet')),h(WatermarkBadge,{final:plFinal,hint:plFinal?'This month’s P&L is marked Final':'Draft until someone marks it Final'})),
        h('div',{className:'page-sub'},'One outlet, one month. Figures roll up from Billing, Daily Sales & Exp., Salary Working and Vendors.')),
      h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        h('button',{className:'btn btn-ghost btn-sm',onClick:exportCsv},'⬇ Export Excel'),
        h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},disabled:plExcelBusy,onClick:exportPnLExcelWithFormulas},plExcelBusy?'Working…':'⬇ Excel with Formulas'),
        h(ShareReportButton,{title:plReportTitle,subtitle:'FY '+fy,getBodyHtml:plReportBodyHtml,getSheetRows:plReportSheetRows,watermark:plWm,
          execSummary:[
            'Revenue for the period: <b>'+money(cur.revenue)+'</b>'+(prevRev?' ('+pct(delta(cur.revenue,prevRev))+' vs '+cmp.toLowerCase()+')':''),
            'Gross Profit: <b>'+money(cur.gross)+'</b> ('+of(cur.gross).toFixed(1)+'% of revenue)',
            'EBITDA: <b class="'+(cur.ebitda>=0?'positive':'negative')+'">'+money(cur.ebitda)+'</b> ('+of(cur.ebitda).toFixed(1)+'% margin)',
            'Profit Before Tax: <b class="'+(cur.pbt>=0?'positive':'negative')+'">'+money(cur.pbt)+'</b> ('+margin.toFixed(1)+'% net margin)'+(prevPbt?' — '+pct(delta(pbt,prevPbt))+' vs '+cmp.toLowerCase():''),
            cur.revenue>=breakEven?'Break-even covered, with '+money(cur.revenue-breakEven)+' of revenue to spare.':'Short of break-even by '+money(breakEven-cur.revenue)+'.'
          ]
        }),
        canFinalize&&h('button',{className:'btn btn-sm '+(plFinal?'btn-ghost':'btn-primary'),onClick:toggleFinal,
          title:plFinal&&plFinalRec?'Marked Final'+(plFinalRec.by?' by '+plFinalRec.by:'')+' on '+new Date(plFinalRec.at).toLocaleDateString('en-IN'):'Mark this month’s P&L as final'},
          plFinal?'↩ Un-finalize':'✓ Mark as Final'))),

    h('div',{className:'fd-toolbar'},
      h('div',{className:'fd-date'},
        h('button',{onClick:()=>{if(mi===0){const i=FYS.indexOf(fy);if(i>0){setFy(FYS[i-1]);setMi(11)}}else setMi(mi-1)}},'‹'),
        h('span',{className:'lbl'},PL_MONTHS[mi]+' '+(mi<9?fy.slice(0,4):'20'+fy.slice(5))),
        h('button',{onClick:()=>{if(mi===11){const i=FYS.indexOf(fy);if(i<FYS.length-1){setFy(FYS[i+1]);setMi(0)}}else setMi(mi+1)}},'›')),
      h('select',{className:'form-control',style:{width:'auto',fontSize:12,padding:'6px 10px'},value:fy,onChange:e=>setFy(e.target.value)},
        FYS.map(f=>h('option',{key:f},f))),
      !isRestaurantOutlet(sid)&&(()=>{const c=periodToCalendar({fy,mi});if(!c)return null;
        const src=plRevenueSourceFor(sid,c.year,c.month);
        return h(React.Fragment,null,
          h('span',{style:{fontSize:11,color:'var(--text3)'}},'Revenue from'),
          h('select',{className:'form-control',style:{width:'auto',fontSize:12,padding:'6px 10px'},value:src,
            title:'Where Cash / Card / UPI Sale come from for this month (Luzo Sale is added to UPI Sale when using Daily Sales & Exp)',
            onChange:e=>{if(isPnlFinal(sid,fy,mi)){toast('This month\u2019s P&L is Final — un-finalize it to change the revenue source.','error');return;}
              setPlRevenueSource(sid,c.year,c.month,e.target.value);setRevSrcTick(t=>t+1);toast('Revenue now taken from '+(e.target.value==='dse'?'Daily Sales & Exp':'Collection Reco')+' for '+PL_MONTHS[mi]+' (and new months)','success');}},
            h('option',{value:'collection'},'Collection Reco (CRADLE)'),
            h('option',{value:'dse'},'Daily Sales & Exp')));})(),
      h('span',{style:{fontSize:11,color:'var(--text3)'}},'Compare with'),
      h('select',{className:'form-control',style:{width:'auto',fontSize:12,padding:'6px 10px'},value:cmp,onChange:e=>setCmp(e.target.value)},
        ['Previous month','Same month last year','Budget'].map(c=>h('option',{key:c},c))),
      h('div',{className:'seg',style:{margin:0,marginLeft:'auto'}},
        h('button',{onClick:()=>setOpen(Object.fromEntries(PL_STRUCT.map(S=>[S.sec,true])))},'Expand all'),
        h('button',{onClick:()=>setOpen({})},'Collapse all'))),

    h('div',{className:'grid4',style:{marginBottom:16}},
      metric('Revenue',money(cur.revenue),prevRev?pct(delta(cur.revenue,prevRev))+' vs '+cmp.toLowerCase():'—','var(--blue)'),
      metric('Gross profit',money(gp),of(gp).toFixed(1)+'% of revenue','var(--teal)'),
      metric('EBITDA',money(ebit),of(ebit).toFixed(1)+'% margin',ebit>0?'var(--green)':'var(--red)'),
      metric('Profit before tax',money(pbt),margin.toFixed(1)+'% net margin'+(prevPbt?' · '+pct(delta(pbt,prevPbt)):''),pbt>0?'var(--green)':'var(--red)')),

    h('div',{className:'two-col',style:{display:'grid',gridTemplateColumns:'minmax(0,2.1fr) minmax(0,1fr)',gap:16,alignItems:'start'}},
      h('div',{className:'card',style:{padding:0,overflow:'hidden'}},
        h('div',{style:{overflowX:'auto'}},
          h('table',{style:{borderCollapse:'collapse',width:'100%'}},
            h('thead',null,h('tr',null,th('Particulars',false,240),th(PL_MONTHS[mi],true,110),th('% of rev',true,80),
              th(budget?'Budget':cmp==='Previous month'?'Prev month':'LY same mth',true,110),th('Change',true,90))),
            h('tbody',null,
              cur.sections.map(S=>{
                const isOpen=!!open[S.sec];
                const b=compare(x=>x.sections.find(y=>y.sec===S.sec).tot);
                const d=b?delta(S.tot,b):null;
                const good=S.sign===1?d>=0:d<=0;
                const isEmpCost=S.sec==='Employee cost';
                const REV_LINK={
                  'Revenue from Operations - Cash Sale':'cash',
                  'Revenue from Operations - Card Sale':'card',
                  'Revenue from Operations - UPI Sale':'upi'
                };
                const lineRow=(l,indent)=>{
                  const lb=compare(x=>{const s2=x.sections.find(y=>y.sec===S.sec);const m2=s2.lines.find(y=>y.name===l.name);return m2?m2.amt:0});
                  const ld=lb?delta(l.amt,lb):null;
                  const lgood=S.sign===1?ld>=0:ld<=0;
                  const revKey=REV_LINK[l.name];
                  const isOpexLine=S.sec==='Operating expenses';
                  const isOtherIncome=l.name==='Other Income';
                  const isCostBreakupLine=S.sec==='Direct cost of service'&&l.name==='Purchase of Cosmetic';
                  const clickHandler=revKey?()=>setRevDrilldown(revKey)
                    :isEmpCost?()=>setEmpCostModal(S)
                    :isOpexLine?()=>setOpexAnnexure(l.name)
                    :isCostBreakupLine&&!cur.isHistorical?()=>setCostBreakup(l.name)
                    :isCostBreakupLine?()=>toast('This is a historical month from Previous Months P&L — no invoice-level detail available for it.','info')
                    :isOtherIncome&&!cur.isHistorical?()=>setEditOverride({field:'otherIncome',label:'Other Income',current:l.amt})
                    :isOtherIncome?()=>toast('This is a historical month from Previous Months P&L — edit it there instead','info')
                    :()=>toast(l.name+' — sourced from '+S.src,'info');
                  return h('tr',{key:S.sec+l.name,className:'slide-down',onClick:clickHandler},
                    h('td',{style:{padding:'6px 12px 6px '+indent+'px',fontSize:12,color:(revKey||isOpexLine||isOtherIncome||isCostBreakupLine)?'var(--accent)':'var(--text3)',borderBottom:'1px solid var(--border)',cursor:'pointer',textDecoration:(revKey||isOpexLine||isOtherIncome||isCostBreakupLine)?'underline':'none',textDecorationStyle:'dotted'}},
                      revKey?'🔗 ':isOpexLine?'📎 ':isOtherIncome?'✏️ ':isCostBreakupLine?'🧾 ':'',l.name),
                    cell(money(l.amt)),cell(of(l.amt).toFixed(1)+'%'),cell(lb?money(lb):'—'),
                    cell(ld===null?'—':pct(ld),{color:ld===null?'var(--text3)':lgood?'var(--green)':'var(--red)'}));
                };
                // Employee cost nests two sub-groups (Employee Salary, Employee Monthly Incentive)
                // with their own expand/collapse; everything else renders flat, same as before.
                const groupOrder=[];
                S.lines.forEach(l=>{if(l.group&&!groupOrder.includes(l.group))groupOrder.push(l.group);});
                const renderedLines=[];
                groupOrder.forEach(g=>{
                  const groupLines=S.lines.filter(l=>l.group===g);
                  const groupTot=groupLines.reduce((s,l)=>s+l.amt,0);
                  const gKey=S.sec+'|'+g;
                  const gOpen=!!openGroups[gKey];
                  renderedLines.push(h('tr',{key:gKey,className:'slide-down',style:{cursor:'pointer',background:'rgba(255,255,255,0.02)'},onClick:()=>setOpenGroups({...openGroups,[gKey]:!gOpen})},
                    h('td',{style:{padding:'6px 12px 6px 34px',fontSize:12,fontWeight:600,color:'var(--text2)',borderBottom:'1px solid var(--border)'}},
                      h('span',{style:{color:'var(--accent)',display:'inline-block',width:12,fontSize:10}},gOpen?'▾':'▸'),g,
                      h('span',{style:{fontSize:10,color:'var(--text3)',marginLeft:6}},groupLines.length+' lines')),
                    cell(money(groupTot),{fontWeight:600}),cell(of(groupTot).toFixed(1)+'%'),cell('—'),cell('—')));
                  if(gOpen)groupLines.forEach(l=>renderedLines.push(lineRow(l,52)));
                });
                S.lines.filter(l=>!l.group).forEach(l=>renderedLines.push(lineRow(l,34)));
                return [
                  h('tr',{key:S.sec,style:{cursor:'pointer'},onClick:()=>setOpen({...open,[S.sec]:!isOpen})},
                    h('td',{style:{padding:'9px 12px',fontSize:12.5,fontWeight:600,color:'var(--text)',borderBottom:'1px solid var(--border)'}},
                      h('span',{style:{color:'var(--accent)',display:'inline-block',width:14}},isOpen?'▾':'▸'),S.sec,
                      h('span',{style:{fontSize:10,color:'var(--text3)',marginLeft:8}},S.lines.length+' lines'),
                      isEmpCost?h('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:10,padding:'2px 8px',fontSize:10},
                        onClick:(ev)=>{ev.stopPropagation();setEmpCostModal(S);}},'🔍 Summary of working'):null),
                    cell(money(S.tot),{fontWeight:600,color:'var(--text)'}),
                    cell(of(S.tot).toFixed(1)+'%'),
                    cell(b?money(b):'—'),
                    cell(d===null?'—':pct(d),{color:d===null?'var(--text3)':good?'var(--green)':'var(--red)',fontWeight:600})),
                  ...(isOpen?renderedLines:[]),
                  S.sec==='Direct cost of service'?totalRow('Gross profit',gp,'var(--teal)','revenue less direct cost'):null,
                  S.sec==='Operating expenses'?totalRow('EBITDA',ebit,'var(--accent2)','before depreciation and interest'):null
                ];
              }),
              cur.below.map(l=>h('tr',{key:l.name,onClick:cur.isHistorical?()=>toast('This is a historical month from Previous Months P&L — edit it there instead','info'):()=>setEditOverride({field:l.name==='Depreciation'||l.name.startsWith('Depreciation')?'depreciation':'interest',label:l.name,current:l.amt})},
                h('td',{style:{padding:'7px 12px',fontSize:12,color:'var(--accent)',borderBottom:'1px solid var(--border)',cursor:'pointer',textDecoration:'underline',textDecorationStyle:'dotted'}},'✏️ '+l.name),
                cell(money(l.amt)),cell(of(l.amt).toFixed(1)+'%'),cell(compare(x=>{const m2=x.below.find(y=>y.name===l.name);return m2?m2.amt:0})?money(compare(x=>{const m2=x.below.find(y=>y.name===l.name);return m2?m2.amt:0})):'—'),cell('—'))),
              totalRow('Profit before tax',pbt,pbt>0?'var(--green)':'var(--red)','carried to the group P&L')
            )))),

      h('div',null,
        h('div',{className:'card',style:{marginBottom:16}},
          h('div',{className:'card-title'},'Break-even'),
          h('div',{className:'kv'},h('span',null,'Fixed cost for the month'),h('span',null,money(fixed))),
          h('div',{className:'kv'},h('span',null,'Contribution margin'),h('span',null,(contribRatio*100).toFixed(1)+'%')),
          h('div',{className:'kv'},h('span',null,'Break-even revenue'),h('span',{style:{color:'var(--accent2)'}},money(breakEven))),
          h('div',{className:'kv'},h('span',null,'Reached on day'),h('span',null,daysToBE>30?'not reached':'day '+daysToBE)),
          h('div',{className:'progress',style:{marginTop:12}},
            h('div',{className:'progress-fill',style:{width:Math.min(100,cur.revenue/breakEven*100)+'%',
              background:cur.revenue>=breakEven?'var(--green)':'var(--red)'}})),
          h('div',{className:'help-note',style:{marginTop:10}},cur.revenue>=breakEven
            ?'Covered fixed costs with '+money(cur.revenue-breakEven)+' of revenue to spare.'
            :'Short of break-even by '+money(breakEven-cur.revenue)+'. Fixed cost is the lever, not discounting.')),

        h('div',{className:'card',style:{marginBottom:16}},
          h('div',{className:'card-title'},'Where the rupee goes'),
          [['Direct cost',cur.direct,'var(--orange)'],
           ['Employee cost',cur.sections[2].tot,'var(--purple)'],
           ['Operating expenses',cur.sections[3].tot,'var(--blue)'],
           ['Depreciation & interest',cur.belowTot,'var(--text3)'],
           ['Profit before tax',Math.max(0,pbt),'var(--green)']].map(r=>
            h('div',{key:r[0],style:{marginBottom:9}},
              h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:11.5,color:'var(--text2)',marginBottom:4}},
                h('span',null,r[0]),h('span',null,of(r[1]).toFixed(1)+'% · '+money(r[1]))),
              h('div',{className:'progress'},h('div',{className:'progress-fill',style:{width:Math.max(1,of(r[1]))+'%',background:r[2]}}))))),

        h('div',{className:'card'},
          h('div',{className:'card-title'},'FY '+fy+' trend'),
          h('div',{style:{display:'flex',alignItems:'flex-end',gap:3,height:110,marginBottom:6}},
            trend.map((t,i)=>h('div',{key:t.m,onClick:()=>setMi(i),title:t.m+' · '+money(t.rev),
              style:{flex:1,cursor:'pointer',display:'flex',flexDirection:'column',justifyContent:'flex-end',height:'100%'}},
              h('div',{style:{height:Math.max(4,t.rev/maxRev*100)+'%',borderRadius:'3px 3px 0 0',
                background:i===mi?'var(--accent)':t.pbt>0?'rgba(76,175,125,.55)':'rgba(255,107,107,.55)'}})))),
          h('div',{style:{display:'flex',gap:3,fontSize:9,color:'var(--text3)'}},
            trend.map((t,i)=>h('div',{key:t.m,style:{flex:1,textAlign:'center',color:i===mi?'var(--accent)':null}},t.m))),
          h('div',{className:'help-note',style:{marginTop:10}},'Click a bar to open that month. Green bars are profitable months.')))),

    // ── PROFIT DISTRIBUTION — splits this month's Profit Before Tax across the outlet's Firm
    // Details (Master Sheet → Edit Salon → Firm Details): 100% to the Proprietor for a sole
    // proprietorship, or by each Partner's/Shareholder's Share % for Partnership Firm/LLP/Pvt Ltd. ──
    (()=>{
      const cat=salon&&salon.firmCategory;
      const members=(salon&&salon.firmMembers)||[];
      const label={'Partnership Firm':'Partners','LLP':'Partners','Private Limited':'Shareholders'}[cat]||'Proprietor';
      const singularLabel={'Partnership Firm':'Partner','LLP':'Partner','Private Limited':'Shareholder'}[cat]||'Proprietor';
      let rows=[];
      if(cat==='Partnership Firm'||cat==='LLP'||cat==='Private Limited'){
        rows=members.map(m=>({name:m.name||'(unnamed)',sharePct:Number(m.sharePct)||0,din:m.din||'',amt:pbt*(Number(m.sharePct)||0)/100}));
      } else {
        rows=[{name:(salon&&salon.proprietorName)||(salon?salon.name:'Proprietor'),sharePct:100,din:'',amt:pbt}];
      }
      const shareTotal=rows.reduce((s,r)=>s+r.sharePct,0);
      return h('div',{className:'card',style:{marginBottom:16}},
        h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:2}},
          h('div',{className:'card-title'},'Profit Distribution — '+label),
          h('div',{style:{fontSize:10.5,color:'var(--text3)'}},PL_MONTHS[mi]+' '+(mi<9?fy.slice(0,4):'20'+fy.slice(5)))),
        h('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:14,lineHeight:1.6}},
          'Splits this month\'s Profit Before Tax ('+money(pbt)+') by Share % from this outlet\'s Firm Details. Set up '+label+' under Master Sheet → Edit Salon → Firm Details.'),
        (cat==='Partnership Firm'||cat==='LLP'||cat==='Private Limited')&&members.length===0
          ?h('div',{style:{fontSize:12,color:'var(--text3)',padding:'10px 12px',background:'var(--bg3)',borderRadius:'var(--r)'}},'No '+label.toLowerCase()+' added yet for this outlet — add them under Master Sheet → Edit Salon → Firm Details to see the split here.')
          :h('div',{className:'table-wrap'},
              h('table',null,
                h('thead',null,h('tr',null,[singularLabel,'Share %',(cat==='LLP'||cat==='Private Limited')?'DIN':null,'Amount'].filter(Boolean).map(hh=>h('th',{key:hh},hh)))),
                h('tbody',null,rows.map((r,i)=>h('tr',{key:i},
                  h('td',null,r.name),
                  h('td',{style:{textAlign:'right'}},r.sharePct+'%'),
                  (cat==='LLP'||cat==='Private Limited')?h('td',{style:{textAlign:'right',color:'var(--text3)'}},r.din||'—'):null,
                  h('td',{style:{textAlign:'right',fontWeight:600,color:pbt>=0?'var(--green)':'var(--red)'}},money(r.amt))
                )))
              )
            ),
        (cat==='Partnership Firm'||cat==='LLP'||cat==='Private Limited')&&members.length>0&&shareTotal!==100&&h('div',{style:{fontSize:11.5,color:'var(--orange)',marginTop:8}},'Share % totals '+shareTotal+'% — should add up to 100%. Fix this under Master Sheet → Edit Salon → Firm Details.'));
    })(),

    empCostModal&&h('div',{className:'modal-overlay',onClick:()=>setEmpCostModal(null)},
      h('div',{className:'modal',style:{width:760,maxHeight:'82vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
        h('div',{className:'modal-title'},'Employee Cost — Summary of Working'),
        h('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:14}},
          PL_MONTHS[mi]+' '+(mi<9?fy.slice(0,4):'20'+fy.slice(5))+' · '+(salon?salon.name:'Outlet')+' · sourced from Salary Working + Incentive Working'),
        h('div',{className:'table-wrap'},
          h('table',null,
            h('thead',null,h('tr',null,['Employee','Designation','Total Days','Gross Salary','Tea','PF (Employer)','ESIC (Employer)','Incentive','Total Cost'].map(hh=>h('th',{key:hh},hh)))),
            h('tbody',null,
              (empCostModal.detail||[]).map(d=>h('tr',{key:d.id},
                h('td',null,h('div',{style:{fontWeight:500,color:'var(--text)'}},d.name),h('div',{style:{fontSize:10,color:'var(--text3)'}},d.id)),
                h('td',null,d.desig),
                h('td',{style:{textAlign:'right'}},d.totalDays),
                h('td',{style:{textAlign:'right'}},money(d.grossAfterLop)),
                h('td',{style:{textAlign:'right'}},money(d.tea)),
                h('td',{style:{textAlign:'right'}},money(d.pfEr)),
                h('td',{style:{textAlign:'right'}},money(d.esicEr)),
                h('td',{style:{textAlign:'right',color:'var(--green)'}},d.incentive>0?money(d.incentive):'—'),
                h('td',{style:{textAlign:'right',fontWeight:700}},money(d.total))
              ))
            )
          )
        ),
        h('div',{style:{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:14,paddingTop:12,marginTop:12,borderTop:'2px solid var(--border2)'}},
          h('span',null,'Total Employee Cost'),h('span',{style:{color:'var(--purple)'}},money(empCostModal.tot))),
        h('div',{style:{display:'flex',justifyContent:'flex-end',marginTop:16}},
          h('button',{className:'btn btn-ghost',onClick:()=>setEmpCostModal(null)},'Close')))),
    editOverride&&h('div',{className:'modal-overlay',onClick:()=>setEditOverride(null)},
      h('div',{className:'modal',style:{width:420},onClick:e=>e.stopPropagation()},
        h('div',{className:'modal-title'},'Edit '+editOverride.label),
        h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:14,lineHeight:1.6}},
          editOverride.field==='depreciation'
            ?'This defaults to the Fixed Asset Register\'s calculated figure for '+PL_MONTHS[mi]+' (see the Depreciation tab) — enter a value here only to override that specific month; leave the Fixed Asset Register as the source otherwise.'
            :'There\'s no automatic source for this figure anywhere in the app — enter the real amount for '+PL_MONTHS[mi]+'. It stays 0 until you do.'),
        h('div',{className:'form-group',style:{marginBottom:16}},
          h('label',null,editOverride.label+' (₹)'),
          h('input',{type:'number',className:'form-control',autoFocus:true,defaultValue:editOverride.current||'',id:'pl-override-input',placeholder:'0'})
        ),
        h('div',{className:'modal-actions'},
          h('button',{className:'btn btn-ghost',onClick:()=>setEditOverride(null)},'Cancel'),
          h('button',{className:'btn btn-primary',onClick:()=>{
            const val=Number(document.getElementById('pl-override-input').value)||0;
            const cal=periodToCalendar({fy,mi});
            if(cal){
              savePLManualOverride(sid,cal.year,cal.month,editOverride.field,val);
              logAuditEvent(sid,{entity:'P&L Override',entityId:editOverride.field,action:'Set',summary:editOverride.label+' for '+PL_MONTHS[mi]+' '+fy+' — ₹'+(editOverride.current||0).toLocaleString('en-IN')+' → ₹'+val.toLocaleString('en-IN')});
            }
            setEditOverride(null);
            toast(editOverride.label+' updated','success');
          }},'Save')
        )
      )
    ),
    revDrilldown&&(()=>{
      const cal=periodToCalendar({fy,mi});
      const fromDse=!!cal&&plRevenueSourceFor(sid,cal.year,cal.month)==='dse';
      const monthRows=!cal?[]:fromDse?dseSalesRowsForMonth(sid,cal.year,cal.month):collectionRowsForMonth(sid,cal.year,cal.month);
      const fieldFor={cash:'cash',card:'card',upi:'upi'}[revDrilldown];
      const labelFor={cash:'Cash Sale',card:'Card Sale',upi:'UPI Sale'}[revDrilldown];
      const grossTotal=monthRows.reduce((s,r)=>s+(Number(r[fieldFor])||0),0);
      return h('div',{className:'modal-overlay',onClick:()=>setRevDrilldown(null)},
        h('div',{className:'modal',style:{width:640,maxHeight:'82vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
          h('div',{className:'modal-title'},'Revenue from Operations - '+labelFor+' — source rows'),
          h('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:14}},
            PL_MONTHS[mi]+' '+(mi<9?fy.slice(0,4):'20'+fy.slice(5))+' · '+(salon?salon.name:'Outlet')+(fromDse?' · from Daily Sales & Exp'+(revDrilldown==='upi'?' (UPI Sale + Luzo Sale)':''):' · from Collection Reco\'s Imported Data Preview')),
          monthRows.length===0
            ?h('div',{style:{textAlign:'center',padding:32,color:'var(--text3)',fontSize:12.5}},fromDse?'No sales entered in Daily Sales & Exp for this month yet — that\'s why this line reads ₹0.':'No Collection Reco data imported for this month yet — that\'s why this line reads ₹0.')
            :h('div',{className:'table-wrap'},
                h('table',null,
                  h('thead',null,h('tr',null,['Date','Centre',labelFor].map(hh=>h('th',{key:hh},hh)))),
                  h('tbody',null,monthRows.map(r=>h('tr',{key:r.id},
                    h('td',null,r.invoiceDate),
                    h('td',null,r.centerName),
                    h('td',{style:{textAlign:'right'}},money(Number(r[fieldFor])||0))
                  )))
                )
              ),
          h('div',{style:{marginTop:14,paddingTop:12,borderTop:'2px solid var(--border2)'}},
            h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12.5,color:'var(--text2)',marginBottom:4}},
              h('span',null,'Gross collected ('+labelFor+')'),h('span',null,money(grossTotal))),
            h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12.5,color:'var(--text2)',marginBottom:4}},
              h('span',null,'÷ 1.05 (removes GST)'),h('span',null,'÷ 1.05')),
            h('div',{style:{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:14}},
              h('span',null,'Revenue from Operations - '+labelFor),h('span',{style:{color:'var(--blue)'}},money(grossTotal/1.05)))),
          h('div',{style:{display:'flex',justifyContent:'flex-end',marginTop:16}},
            h('button',{className:'btn btn-ghost',onClick:()=>setRevDrilldown(null)},'Close'))))
    })(),
    opexAnnexure&&(()=>{
      const cal=periodToCalendar({fy,mi});
      const detail=cal?operatingExpenseAnnexureFor(sid,cal.year,cal.month,opexAnnexure):null;
      if(!detail)return null;
      const grandTotal=(detail.recurringTotal+(detail.dailyExcluded?0:detail.dailyAmt)+detail.bankAmt+(detail.vendorAmt||0)+(detail.recoAmt||0))*(detail.isCredit?-1:1);
      return h('div',{className:'modal-overlay',onClick:()=>setOpexAnnexure(null)},
        h('div',{className:'modal',style:{width:640,maxHeight:'82vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
          h('div',{className:'modal-title'},opexAnnexure+' — Annexure'),
          h('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:16}},
            PL_MONTHS[mi]+' '+(mi<9?fy.slice(0,4):'20'+fy.slice(5))+' · '+(salon?salon.name:'Outlet')+' · builds up from Recurring Expenses + Daily Sales & Exp'+(detail.bankAmt?' + Bank Statement':'')+(detail.vendorAmt?' + Vendor Sheet':'')),
          detail.isCredit&&h('div',{style:{fontSize:11,color:'var(--green)',background:'rgba(76,175,125,0.1)',border:'1px solid rgba(76,175,125,0.3)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:16}},
            'This is money recovered from employees, not spent — it reduces Operating Expenses on the P&L rather than adding to it.'),

          detail.recurring.length>0&&h('div',{style:{marginBottom:18}},
            h('div',{style:{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}},'Recurring Expenses commitments'),
            detail.vendorWins&&h('div',{style:{fontSize:11,color:'var(--blue)',background:'rgba(74,158,255,0.1)',border:'1px solid rgba(74,158,255,0.3)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:10}},
              'A real invoice was booked this month (₹'+Math.round(detail.vendorAmt).toLocaleString('en-IN')+') — used on the P&L instead of the estimate below, which would otherwise have been ₹'+Math.round(detail.recurringTotalRaw).toLocaleString('en-IN')+'.'),
            h('div',{className:'table-wrap'},
              h('table',null,
                h('thead',null,h('tr',null,['Payee / Vendor','Frequency','Amount','Monthly Equiv.','Status'].map(hh=>h('th',{key:hh},hh)))),
                h('tbody',null,detail.recurring.map(it=>{
                  const vr=isSpreadRecurring(it)?(detail.variableRows||[]).find(r=>r.it.id===it.id):null;
                  return h('tr',{key:it.id,style:it.status!=='Active'?{opacity:0.5}:undefined},
                    h('td',null,it.payee,isSpreadRecurring(it)&&h('div',{style:{fontSize:10,color:'var(--text3)'}},isVariableRecurring(it)?'Variable bill':'Bill split over its months')),
                    h('td',null,it.frequency),
                    h('td',{style:{textAlign:'right'}},rupee(Number(it.amount))),
                    vr
                      ?h('td',{style:{textAlign:'right',fontWeight:700}},'₹'+Math.round(vr.amt).toLocaleString('en-IN'),
                          h('div',{style:{fontSize:10,fontWeight:400,color:vr.actual?'var(--green)':'var(--orange)'}},vr.actual
                            ?'actual: '+vr.covering.map(b=>(b.inv.invoiceNo||'bill')+' ₹'+Math.round(b.amount).toLocaleString('en-IN')+' ÷ '+b.months+' month'+(b.months===1?'':'s')).join(', ')
                              +((vr.trueUps||[]).length?' · adjustment for '+vr.trueUps.map(u=>monthLabelOfIndex(u.month)+' (actual '+rupee(Math.round(u.share))+' − already claimed '+rupee(Math.round(u.provision))+' = '+rupee(Math.round(u.diff))+')').join(', '):'')
                            :'estimate'+(vr.basis?' from previous bill '+(vr.basis.inv.invoiceNo||'')+' ('+monthLabelOfIndex(vr.basis.last)+')':' from the item amount')+' — reversed when the actual bill is booked'
                              +((vr.trueUps||[]).length?' · adjustment for '+vr.trueUps.map(u=>monthLabelOfIndex(u.month)+' '+rupee(Math.round(u.diff))).join(', '):'')))
                      :h('td',{style:{textAlign:'right',fontWeight:it.status==='Active'?700:400}},'₹'+Math.round(recurringExpenseMonthlyAmt(it)).toLocaleString('en-IN')),
                    h('td',null,h('span',{className:'badge '+(it.status==='Active'?'badge-green':it.status==='Expired'?'badge-red':'badge-gray')},it.status))
                  );
                }))
              )
            ),
            h('div',{style:{display:'flex',justifyContent:'flex-end',fontSize:12,fontWeight:700,color:detail.vendorWins?'var(--text3)':'var(--accent2)',marginTop:6}},
              (detail.vendorWins?'Estimate — not counted this month, real invoice used instead: ₹':'Subtotal (Active only): ₹')+Math.round(detail.recurringTotalRaw).toLocaleString('en-IN')),
            detail.variableAmt>0&&h('div',{style:{display:'flex',justifyContent:'flex-end',fontSize:12,fontWeight:700,color:'var(--accent2)',marginTop:2}},
              'Variable bills this month (counted): ₹'+Math.round(detail.variableAmt).toLocaleString('en-IN'))
          ),
          detail.recurring.length===0&&h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:18,padding:'10px 12px',background:'var(--bg3)',borderRadius:'var(--r)'}},
            'No standing commitment set up for this line in Recurring Expenses yet. Add one there to have it show up here automatically.'),

          (detail.dailyAmt>0||detail.bankAmt>0)&&h('div',{style:{marginBottom:10}},
            h('div',{style:{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}},'This month\'s actual entries'),
            detail.dailyAmt>0&&h('div',{style:{marginBottom:4}},
              detail.dailyRows.length>1&&h('div',{className:'table-wrap',style:{marginBottom:8}},
                h('table',null,
                  h('thead',null,h('tr',null,['Daily Expenses','Amount'].map(hh=>h('th',{key:hh},hh)))),
                  h('tbody',null,detail.dailyRows.map(r=>h('tr',{key:r.name},
                    h('td',null,r.name),
                    h('td',{style:{textAlign:'right',color:r.amt?'var(--text)':'var(--text3)'}},r.amt?'₹'+Math.round(r.amt).toLocaleString('en-IN'):'—')
                  )))
                )
              ),
              h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12.5,fontWeight:detail.dailyRows.length>1?700:400,color:detail.dailyExcluded?'var(--text3)':'var(--text2)'}},
                h('span',null,'From Daily Sales & Exp'+(detail.dailyExcluded?' (not counted below — see note)':'')),
                h('span',{style:{textDecoration:detail.dailyExcluded?'line-through':'none'}},'₹'+Math.round(detail.dailyAmt).toLocaleString('en-IN'))),
              detail.dailyExcluded&&h('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:2}},
                'This row requires an outstanding Vendor Sheet invoice before a payment can be entered — the cost is already counted once via the Recurring Expenses accrual above, so the payment itself isn\'t added again here.')
            ),
            detail.bankAmt>0&&h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12.5,color:'var(--text2)',marginBottom:4}},h('span',null,'From Bank Statement (Nature = Bank Charges)'),h('span',null,'₹'+Math.round(detail.bankAmt).toLocaleString('en-IN'))),
            detail.vendorAmt>0&&h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12.5,color:'var(--text2)',marginBottom:4}},h('span',null,'From Vendor Sheet (real invoices booked this month)'),h('span',null,'₹'+Math.round(detail.vendorAmt).toLocaleString('en-IN'))),
            detail.recoAmt!==0&&h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12.5,color:'var(--text2)',marginBottom:4}},
              h('span',null,'From Collection Reco (Net Bank Charges)'),
              h('span',{style:{color:detail.recoAmt<0?'var(--green)':'var(--text)'}},(detail.recoAmt>=0?'₹':'−₹')+Math.round(Math.abs(detail.recoAmt)).toLocaleString('en-IN')))
          ),

          h('div',{style:{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:14,paddingTop:12,marginTop:6,borderTop:'2px solid var(--border2)'}},
            h('span',null,opexAnnexure+' — Total on P&L'),h('span',{style:{color:grandTotal<0?'var(--green)':'var(--accent2)'}},(grandTotal<0?'−₹':'₹')+Math.round(Math.abs(grandTotal)).toLocaleString('en-IN'))),
          h('div',{style:{display:'flex',justifyContent:'flex-end',marginTop:16}},
            h('button',{className:'btn btn-ghost',onClick:()=>setOpexAnnexure(null)},'Close'))
        )
      );
    })(),
    costBreakup&&(()=>{
      const cal=periodToCalendar({fy,mi});
      const rows=cal?vendorInvoiceCategoryBreakupFor(sid,cal.year,cal.month,costBreakup):[];
      const total=rows.reduce((s,r)=>s+r.amount,0);
      return h('div',{className:'modal-overlay',onClick:()=>setCostBreakup(null)},
        h('div',{className:'modal',style:{width:600,maxHeight:'82vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
          h('div',{className:'modal-title'},costBreakup+' — Invoice-wise Breakup'),
          h('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:16}},
            PL_MONTHS[mi]+' '+(mi<9?fy.slice(0,4):'20'+fy.slice(5))+' · '+(salon?salon.name:'Outlet')+' · every Vendor Sheet invoice categorised "'+costBreakup+'" and booked (by Invoice Date) in this month'),
          !rows.length
            ?h('div',{style:{fontSize:12,color:'var(--text3)',padding:'16px 12px',background:'var(--bg3)',borderRadius:'var(--r)',marginBottom:16}},'No invoices booked against this category in this month yet.')
            :h('div',{className:'table-wrap',style:{marginBottom:16}},
                h('table',null,
                  h('thead',null,h('tr',null,['Vendor Name','Invoice No','Invoice Date','Doc Nature','Amount'].map(hh=>h('th',{key:hh,style:hh==='Amount'?{textAlign:'right'}:undefined},hh)))),
                  h('tbody',null,rows.map((r,i)=>h('tr',{key:i},
                    h('td',null,r.vendorName),
                    h('td',null,r.invoiceNo),
                    h('td',null,r.invoiceDate||'—'),
                    h('td',null,r.docNature),
                    h('td',{style:{textAlign:'right',fontWeight:600}},'₹'+Math.round(r.amount).toLocaleString('en-IN'))
                  )))
                )
              ),
          h('div',{style:{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:14,paddingTop:12,marginTop:6,borderTop:'2px solid var(--border2)'}},
            h('span',null,costBreakup+' — Total on P&L'),h('span',{style:{color:'var(--accent2)'}},'₹'+Math.round(total).toLocaleString('en-IN'))),
          h('div',{style:{display:'flex',justifyContent:'flex-end',marginTop:16}},
            h('button',{className:'btn btn-ghost',onClick:()=>setCostBreakup(null)},'Close'))
        )
      );
    })()
  );
}

// ── Tab wrapper — P&L Statement and Cash Flow (Monthly) as separate sub-tabs under P&L (Monthly),
// same pattern as Salary Working / Salary Payment. Both stay mounted at all times — only
// visibility toggles — so switching tabs never loses in-progress state (an open drill-down modal,
// which month/FY each tab was browsing, etc.). ──
// ── Compare — pick any set of months (even spanning different Financial Years) and see P&L and
// Cash Flow side by side, one column per month. Uses the exact same plBuild()/cashFlowFor() as
// the P&L Statement and Cash Flow tabs, so the numbers can never disagree with those screens. ──
// ── P&L Variance Chart — a simple SVG grouped-bar comparison (Period A vs Period B) across
// Revenue, Direct Cost, Employee Cost, Opex and Net Profit. Deliberately plain SVG rather than a
// charting library — this file has none loaded, and five grouped bars don't need one. ──
function PnLVarianceChart({totals,labelA,labelB}){
  const cats=[
    {key:'Total Revenue',color:'var(--green)'},
    {key:'Direct Cost of Service',color:'var(--red)'},
    {key:'Employee Cost',color:'var(--orange)'},
    {key:'Operating Expenses',color:'var(--purple)'},
    {key:'Net Profit (PBT)',color:'var(--accent)'},
  ];
  const rows=cats.map(c=>({...c,line:totals.find(t=>t.label===c.key)}));
  const maxVal=Math.max(1,...rows.flatMap(r=>[Math.abs(r.line?.a||0),Math.abs(r.line?.b||0)]));
  const W=760,H=220,padL=8,padR=8,PT=16,padBottom=34;
  const groupW=(W-padL-padR)/rows.length;
  const barW=Math.min(38,groupW/3);
  const scaleY=(v)=>(H-padBottom-PT)*Math.abs(v)/maxVal;
  const money=(n)=>'₹'+Math.round(Math.abs(n)).toLocaleString('en-IN');
  return React.createElement('div',{style:{overflowX:'auto'}},
    React.createElement('svg',{viewBox:'0 0 '+W+' '+H,style:{width:'100%',minWidth:560,height:H,display:'block'}},
      React.createElement('line',{x1:padL,y1:H-padBottom,x2:W-padR,y2:H-padBottom,stroke:'var(--border)',strokeWidth:1}),
      rows.map((r,i)=>{
        const cx=padL+i*groupW+groupW/2;
        const av=r.line?r.line.a:0,bv=r.line?r.line.b:0;
        const ah=scaleY(av),bh=scaleY(bv);
        return React.createElement('g',{key:r.key},
          React.createElement('rect',{x:cx-barW-2,y:H-padBottom-ah,width:barW,height:ah,fill:r.color,opacity:0.45,rx:3}),
          React.createElement('rect',{x:cx+2,y:H-padBottom-bh,width:barW,height:bh,fill:r.color,rx:3}),
          React.createElement('text',{x:cx-barW-2+barW/2,y:H-padBottom-ah-5,textAnchor:'middle',fontSize:9,fill:'var(--text3)'},money(av)),
          React.createElement('text',{x:cx+2+barW/2,y:H-padBottom-bh-5,textAnchor:'middle',fontSize:9,fontWeight:700,fill:'var(--text)'},money(bv)),
          React.createElement('text',{x:cx,y:H-padBottom+16,textAnchor:'middle',fontSize:10,fill:'var(--text2)'},r.key.replace(' of Service','').replace(' (PBT)',''))
        );
      })
    ),
    React.createElement('div',{style:{display:'flex',gap:16,justifyContent:'center',marginTop:6}},
      React.createElement('span',{style:{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--text3)'}},
        React.createElement('span',{style:{width:12,height:12,borderRadius:3,background:'var(--text3)',opacity:0.45,display:'inline-block'}}),labelA),
      React.createElement('span',{style:{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--text2)'}},
        React.createElement('span',{style:{width:12,height:12,borderRadius:3,background:'var(--text3)',display:'inline-block'}}),labelB)
    )
  );
}

// ── P&L Variance Section — the full comparison: mode toggle (Previous Month / Same Month Last
// Year / pick manually), a line-by-line table colour-coded green/red by whichever direction is
// actually favourable for that line (see plVarianceLine), an auto-generated plain-English
// commentary list for every line that cleared the "significant" bar, and the chart above. One
// component, reused by both the Outlet Dashboard and the per-outlet P&L (Monthly) sheet so the
// two never disagree about a variance. ──
function PnLVarianceSection({salonId,fy,mi}){
  const MONTHS_FULL=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const cal=periodToCalendar({fy,mi})||{year:new Date().getFullYear(),month:new Date().getMonth()};
  const [mode,setMode]=useState('prevMonth'); // 'prevMonth' | 'yoy' | 'custom'
  const [customFy,setCustomFy]=useState(fy);
  const [customMi,setCustomMi]=useState(mi>0?mi-1:11);

  const periodB={fy,mi}; // "current" — always the outlet's selected period
  let periodA,labelA;
  if(mode==='yoy'){
    const fyIdx=PG_FYS.indexOf(fy);
    periodA={fy:fyIdx>0?PG_FYS[fyIdx-1]:fy,mi};
    labelA=PL_MONTHS[mi]+' '+pgYear(periodA.fy,mi)+' (Last Year)';
  }else if(mode==='custom'){
    periodA={fy:customFy,mi:customMi};
    labelA=PL_MONTHS[customMi]+' '+pgYear(customFy,customMi);
  }else{
    periodA=mi>0?{fy,mi:mi-1}:{fy:PG_FYS[Math.max(0,PG_FYS.indexOf(fy)-1)],mi:11};
    labelA=PL_MONTHS[periodA.mi]+' '+pgYear(periodA.fy,periodA.mi);
  }
  const labelB=PL_MONTHS[mi]+' '+pgYear(fy,mi)+' (Current)';

  const v=useMemo(()=>buildPnLVariance(salonId,periodA.fy,periodA.mi,periodB.fy,periodB.mi),
    [salonId,periodA.fy,periodA.mi,periodB.fy,periodB.mi]);

  const pctColor=(l)=>l.diffAmt===0?'var(--text3)':(l.favourable?'var(--green)':'var(--red)');
  const pctBg=(l)=>l.diffAmt===0?'transparent':(l.favourable?'rgba(76,175,125,0.12)':'rgba(255,107,107,0.12)');
  const arrow=(l)=>l.diffAmt>0?'▲':l.diffAmt<0?'▼':'—';
  const money=(n)=>'₹'+Math.round(Math.abs(n)).toLocaleString('en-IN');

  const row=(l,bold)=>React.createElement('tr',{key:l.label,style:bold?{background:'var(--bg3)'}:undefined},
    React.createElement('td',{style:{padding:'6px 10px',fontSize:12,fontWeight:bold?700:400,color:bold?'var(--text)':'var(--text2)'}},l.label),
    React.createElement('td',{style:{padding:'6px 10px',fontSize:12,textAlign:'right',color:'var(--text3)'}},money(l.a)),
    React.createElement('td',{style:{padding:'6px 10px',fontSize:12,textAlign:'right',fontWeight:bold?700:500,color:'var(--text)'}},money(l.b)),
    React.createElement('td',{style:{padding:'6px 10px',fontSize:12,textAlign:'right'}},
      React.createElement('span',{style:{color:'var(--text3)'}},(l.diffAmt>=0?'+':'−')+money(l.diffAmt))),
    React.createElement('td',{style:{padding:'6px 10px',textAlign:'right'}},
      React.createElement('span',{style:{display:'inline-flex',alignItems:'center',gap:4,fontSize:11.5,fontWeight:700,color:pctColor(l),background:pctBg(l),padding:'3px 8px',borderRadius:20}},
        arrow(l),Math.abs(l.diffPct)+'%',l.significant&&React.createElement('span',{title:'Significant variance'},'●')))
  );

  return React.createElement('div',null,
    React.createElement('div',{style:{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}},
      React.createElement('span',{style:{fontSize:11,color:'var(--text3)',fontWeight:600}},'Compare '+PL_MONTHS[mi]+' '+pgYear(fy,mi)+' with:'),
      [['prevMonth','Previous Month'],['yoy','Same Month Last Year'],['custom','Pick a Month…']].map(([id,label])=>
        React.createElement('button',{key:id,className:'btn btn-sm '+(mode===id?'btn-primary':'btn-ghost'),onClick:()=>setMode(id)},label)
      ),
      mode==='custom'&&React.createElement(React.Fragment,null,
        React.createElement('select',{className:'form-control',style:{width:'auto',fontSize:12,padding:'6px 10px'},value:customFy,onChange:e=>setCustomFy(e.target.value)},PG_FYS.map(f=>React.createElement('option',{key:f},f))),
        React.createElement('select',{className:'form-control',style:{width:'auto',fontSize:12,padding:'6px 10px'},value:customMi,onChange:e=>setCustomMi(Number(e.target.value))},PL_MONTHS.map((m,i)=>React.createElement('option',{key:i,value:i},m)))
      )
    ),

    // Chart
    React.createElement('div',{className:'card',style:{marginBottom:16}},
      React.createElement('div',{className:'card-title',style:{marginBottom:10}},'Comparative Chart'),
      React.createElement(PnLVarianceChart,{totals:v.totals,labelA,labelB})
    ),

    // Auto-commentary — only lines that cleared the significance bar (≥10% AND ≥₹1,000 change)
    React.createElement('div',{className:'card',style:{marginBottom:16}},
      React.createElement('div',{className:'card-title',style:{marginBottom:4}},'Comments — Significant Variances'),
      React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:10}},'Flags any line that moved by 10% or more AND ₹1,000 or more — small swings on a small base are left out on purpose.'),
      v.comments.length===0
        ?React.createElement('div',{style:{fontSize:12.5,color:'var(--text3)',padding:'8px 0'}},'No line moved enough to flag — a quiet month.')
        :React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:6}},
          v.comments.map((l,i)=>React.createElement('div',{key:i,style:{display:'flex',alignItems:'flex-start',gap:8,padding:'8px 12px',borderRadius:'var(--r)',background:l.favourable?'rgba(76,175,125,0.08)':'rgba(255,107,107,0.08)',border:'1px solid '+(l.favourable?'rgba(76,175,125,0.25)':'rgba(255,107,107,0.25)')}},
            React.createElement('span',{style:{fontSize:13,color:l.favourable?'var(--green)':'var(--red)',flexShrink:0}},l.favourable?'✓':'⚠'),
            React.createElement('span',{style:{fontSize:12.5,color:'var(--text)'}},l.comment.text)
          ))
        )
    ),

    // Line-by-line table
    React.createElement('div',{className:'card',style:{padding:0,overflow:'hidden'}},
      React.createElement('div',{style:{overflowX:'auto'}},
        React.createElement('table',{style:{width:'100%',borderCollapse:'collapse'}},
          React.createElement('thead',null,React.createElement('tr',null,
            React.createElement('th',{style:{padding:'8px 10px',textAlign:'left',fontSize:10.5,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.04em'}},'Line'),
            React.createElement('th',{style:{padding:'8px 10px',textAlign:'right',fontSize:10.5,color:'var(--text3)',textTransform:'uppercase'}},labelA),
            React.createElement('th',{style:{padding:'8px 10px',textAlign:'right',fontSize:10.5,color:'var(--text3)',textTransform:'uppercase'}},labelB),
            React.createElement('th',{style:{padding:'8px 10px',textAlign:'right',fontSize:10.5,color:'var(--text3)',textTransform:'uppercase'}},'Change ₹'),
            React.createElement('th',{style:{padding:'8px 10px',textAlign:'right',fontSize:10.5,color:'var(--text3)',textTransform:'uppercase'}},'Change %')
          )),
          React.createElement('tbody',null,
            React.createElement('tr',null,React.createElement('td',{colSpan:5,style:{padding:'6px 10px',fontSize:10.5,fontWeight:700,color:'var(--green)',textTransform:'uppercase',letterSpacing:'0.05em',background:'var(--bg3)'}},'Revenue')),
            ...v.revenueLines.map(l=>row(l,false)),
            row(v.totals[0],true),
            React.createElement('tr',null,React.createElement('td',{colSpan:5,style:{padding:'6px 10px',fontSize:10.5,fontWeight:700,color:'var(--red)',textTransform:'uppercase',letterSpacing:'0.05em',background:'var(--bg3)'}},'Direct Cost of Service')),
            ...v.directLines.map(l=>row(l,false)),
            row(v.totals[1],true),
            row(v.totals[2],true),
            React.createElement('tr',null,React.createElement('td',{colSpan:5,style:{padding:'6px 10px',fontSize:10.5,fontWeight:700,color:'var(--orange)',textTransform:'uppercase',letterSpacing:'0.05em',background:'var(--bg3)'}},'Employee Cost')),
            ...v.empLines.map(l=>row(l,false)),
            row(v.totals[3],true),
            React.createElement('tr',null,React.createElement('td',{colSpan:5,style:{padding:'6px 10px',fontSize:10.5,fontWeight:700,color:'var(--purple)',textTransform:'uppercase',letterSpacing:'0.05em',background:'var(--bg3)'}},'Operating Expenses')),
            ...v.opexLines.map(l=>row(l,false)),
            row(v.totals[4],true),
            row(v.totals[5],true),
            row(v.totals[6],true)
          )
        )
      )
    )
  );
}

function PnLCompareSheet({salon,period}={}){
  const {toast}=useToast();
  const sid=Number(salon&&salon.id)||1;
  const FYS=['2023-24','2024-25','2025-26','2026-27'];
  const defaultFy=(period&&period.fy)||'2025-26';
  const defaultMi=period&&typeof period.mi==='number'?period.mi:3;
  const [pickFy,setPickFy]=useState(defaultFy);
  const [pickMi,setPickMi]=useState(defaultMi);
  const periodKey=(fy,mi)=>fy+'|'+mi;
  // Builds the last `n` months ending at the outlet's current period (or fewer, if that would
  // run past the earliest FY this app tracks — FYS.indexOf returns -1/0 there and the loop stops
  // rather than crashing).
  const lastNMonthsWindow=(n)=>{
    const out=[];
    let fy=defaultFy,mi=defaultMi;
    for(let i=0;i<n;i++){
      out.unshift({fy,mi});
      if(mi===0){const idx=FYS.indexOf(fy);if(idx>0){fy=FYS[idx-1];mi=11;}else break;}
      else mi--;
    }
    return out;
  };
  const [selected,setSelected]=useState(()=>lastNMonthsWindow(3));
  const money=(n)=>formatMoney(n,{dashZero:true});

  const applyPreset=(n)=>{
    setSelected(lastNMonthsWindow(n));
    toast('Showing the last '+n+' months','success');
  };
  const addPeriod=()=>{
    if(selected.some(p=>periodKey(p.fy,p.mi)===periodKey(pickFy,pickMi))){toast('That month is already in the comparison','info');return;}
    setSelected(prev=>[...prev,{fy:pickFy,mi:pickMi}].sort((a,b)=>fyStartYear(a.fy)-fyStartYear(b.fy)||a.mi-b.mi));
  };
  const removePeriod=(fy,mi)=>setSelected(prev=>prev.filter(p=>periodKey(p.fy,p.mi)!==periodKey(fy,mi)));

  const cols=selected.map(p=>{
    const cur=plBuild(sid,p.fy,p.mi);
    const cal=periodToCalendar(p);
    const cf=cashFlowFor(sid,cal&&cal.year,cal&&cal.month,cur);
    const label=PL_MONTHS[p.mi]+' '+(p.mi<9?p.fy.slice(0,4):'20'+p.fy.slice(5));
    return{label,cur,cf};
  });

  const plRows=[
    {label:'Revenue',get:c=>c.cur.revenue},
    {label:'Direct Cost of Service',get:c=>c.cur.direct},
    {label:'Gross Profit',get:c=>c.cur.gross,bold:true},
    {label:'Employee Cost',get:c=>c.cur.sections[2]?c.cur.sections[2].tot:0},
    {label:'Operating Expenses',get:c=>c.cur.sections[3]?c.cur.sections[3].tot:0},
    {label:'EBITDA',get:c=>c.cur.ebitda,bold:true},
    {label:'Depreciation',get:c=>{const d=c.cur.below.find(l=>/Depreciation/i.test(l.name));return d?d.amt:0;}},
    {label:'Interest',get:c=>{const d=c.cur.below.find(l=>/Interest/i.test(l.name));return d?d.amt:0;}},
    {label:'Profit Before Tax',get:c=>c.cur.pbt,bold:true,accent:true},
    {label:'PBT Margin %',get:c=>c.cur.revenue?(c.cur.pbt/c.cur.revenue*100):0,pct:true},
  ];
  const cfRows=[
    {label:'Net Profit (PBT)',get:c=>c.cf.pbt},
    {label:'Add: Depreciation (non-cash)',get:c=>c.cf.depAmt},
    {label:'Operating Exp. accrued vs. paid',get:c=>c.cf.opexGapTotal},
    {label:'Purchase of Cosmetic booked vs. paid',get:c=>c.cf.cosmeticGap},
    {label:'Net Cash from Operating Activities',get:c=>c.cf.operatingCF,bold:true},
    {label:'Investing Activities',get:c=>c.cf.investing},
    {label:'Financing Activities',get:c=>c.cf.financing},
    {label:'Net Cash Flow for the Month',get:c=>c.cf.netCF,bold:true,accent:true},
    {label:'Opening Cash & Bank Balance',get:c=>c.cf.opening},
    {label:'Closing Cash & Bank Balance',get:c=>c.cf.closing,bold:true},
  ];

  const exportCsv=async()=>{
    const hdr=['Line',...cols.map(c=>c.label)];
    const rows=[['— P&L —',...cols.map(()=>'')],...plRows.map(r=>[r.label,...cols.map(c=>Math.round(r.get(c)))]),
      ['— Cash Flow —',...cols.map(()=>'')],...cfRows.map(r=>[r.label,...cols.map(c=>Math.round(r.get(c)))])];
    try{
      const blob=await exportReportExcelBlob('P&L & Cash Flow Comparison',[hdr,...rows]);
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='PnL_CashFlow_Comparison.xlsx';a.click();URL.revokeObjectURL(url);
    }catch(err){toast(err.message,'error');}
  };

  const table=(title,rowsDef)=>h('div',{className:'card',style:{marginBottom:16,padding:0,overflow:'hidden'}},
    h('div',{style:{padding:'12px 14px',borderBottom:'1px solid var(--border)'}},h('div',{className:'card-title'},title)),
    h('div',{style:{overflowX:'auto'}},
      h('table',{style:{borderCollapse:'collapse',width:'100%'}},
        h('thead',null,h('tr',null,
          h('th',{style:{padding:'9px 12px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',textAlign:'left',whiteSpace:'nowrap',position:'sticky',left:0,zIndex:2}},'Line'),
          cols.map(c=>h('th',{key:c.label,style:{padding:'9px 12px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',textAlign:'right',whiteSpace:'nowrap',minWidth:110}},c.label))
        )),
        h('tbody',null,rowsDef.map(r=>h('tr',{key:r.label},
          h('td',{style:{padding:'7px 12px',fontSize:12,color:r.bold?'var(--text)':'var(--text2)',fontWeight:r.bold?700:400,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',position:'sticky',left:0,background:'var(--bg2)'}},r.label),
          cols.map(c=>{
            const v=r.get(c);
            return h('td',{key:c.label,style:{padding:'7px 12px',fontSize:12,textAlign:'right',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums',fontWeight:r.bold?700:400,color:r.accent?(v>=0?'var(--green)':'var(--red)'):(r.bold?'var(--text)':'var(--text2)')}},
              r.pct?v.toFixed(1)+'%':money(v));
          })
        )))
      )
    )
  );

  return React.createElement('div',{className:'fade-in'},
    h('div',{className:'section-header'},
      h('div',null,h('div',{className:'page-title'},'Compare — P&L & Cash Flow'),h('div',{className:'page-sub'},'Pick any set of months to see them side by side')),
      cols.length>0&&h('button',{className:'btn btn-ghost btn-sm',onClick:exportCsv},'⬇ Export Excel')
    ),
    h('div',{className:'card',style:{marginBottom:16}},
      h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:14}},
        h('span',{style:{fontSize:11,color:'var(--text3)'}},'Quick range:'),
        [3,6,9,12].map(n=>h('button',{key:n,className:'btn btn-ghost btn-sm',onClick:()=>applyPreset(n)},'Last '+n+' months'))
      ),
      h('div',{style:{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:14,paddingTop:14,borderTop:'1px solid var(--border)'}},
        h('span',{style:{fontSize:11,color:'var(--text3)'}},'Add month:'),
        h('select',{className:'form-control',style:{width:'auto',fontSize:12,padding:'6px 10px'},value:pickFy,onChange:e=>setPickFy(e.target.value)},FYS.map(f=>h('option',{key:f},f))),
        h('select',{className:'form-control',style:{width:'auto',fontSize:12,padding:'6px 10px'},value:pickMi,onChange:e=>setPickMi(Number(e.target.value))},PL_MONTHS.map((m,i)=>h('option',{key:i,value:i},m))),
        h('button',{className:'btn btn-primary btn-sm',onClick:addPeriod},'+ Add')
      ),
      h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        selected.length===0
          ?h('span',{style:{fontSize:12,color:'var(--text3)'}},'No months selected yet — pick a quick range above, or add one at a time.')
          :selected.map(p=>h('span',{key:periodKey(p.fy,p.mi),className:'badge badge-blue',style:{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 10px'}},
              PL_MONTHS[p.mi]+' '+(p.mi<9?p.fy.slice(0,4):'20'+p.fy.slice(5)),
              h('span',{style:{cursor:'pointer',fontWeight:700},onClick:()=>removePeriod(p.fy,p.mi)},'✕')
            ))
      )
    ),
    cols.length===0
      ?h('div',{className:'card',style:{textAlign:'center',padding:32,color:'var(--text3)'}},'Add at least one month above to see the comparison.')
      :React.createElement(React.Fragment,null,table('P&L Comparison',plRows),table('Cash Flow Comparison',cfRows))
  );
}

// ── 🤖 "Explain this month" (automation phase 4) — sends this month's and last month's P&L lines
// (figures only, from plBuild — the same numbers as the statement below) to the AI and shows a
// plain-language summary. Needs the AI key (Master Settings → AI Assistant). ──
function pnlLinesForAi(sid,fy,mi,pfy,pmi){
  const a=plBuild(sid,fy,mi),b=plBuild(sid,pfy,pmi);
  const out=[];
  a.sections.forEach((S,si)=>{
    const B=b.sections[si]||{lines:[]};
    const names=Array.from(new Set([...(S.lines||[]).map(l=>l.name),...(B.lines||[]).map(l=>l.name)]));
    names.forEach(n=>{const x=(S.lines||[]).find(l=>l.name===n),y=(B.lines||[]).find(l=>l.name===n);
      const amt=x?x.amt:0,prev=y?y.amt:0;if(amt||prev)out.push({section:S.sec,name:n,amt,prev});});
    out.push({section:S.sec,name:'Total '+S.sec,amt:S.tot||0,prev:B.tot||0});
  });
  [['Total Revenue','revenue'],['Gross Profit','gross'],['EBITDA','ebitda'],['Net Profit (PBT)','pbt']].forEach(([n,k])=>out.push({section:'Totals',name:n,amt:a[k]||0,prev:b[k]||0}));
  return out;
}
function AiExplainPnlCard({salon,period}){
  const h=React.createElement;
  const [busy,setBusy]=useState(false);
  const [res,setRes]=useState(null);
  const [err,setErr]=useState('');
  const cal=periodToCalendar(period);
  useEffect(()=>{setRes(null);setErr('');},[salon&&salon.id,cal&&cal.year,cal&&cal.month]);
  if(!cal||!CLOUD_SYNC_ENABLED)return null;
  const MN=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const prev=new Date(cal.year,cal.month-1,1);
  const run=async()=>{
    setBusy(true);setErr('');
    try{
      const A=calToFYMI(cal.year,cal.month),B=calToFYMI(prev.getFullYear(),prev.getMonth());
      const lines=pnlLinesForAi(salon.id,A.fy,A.mi,B.fy,B.mi);
      setRes(await aiCall('explain_pnl',{outlet:String(salon.name||'').split('—')[0].trim(),month:MN[cal.month]+' '+cal.year,prevMonth:MN[prev.getMonth()]+' '+prev.getFullYear(),lines}));
    }catch(e){setErr(e.message);}
    setBusy(false);
  };
  return h('div',{className:'card',style:{marginBottom:16,border:'1px solid rgba(47,95,224,0.25)'}},
    h('div',{style:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
      h('div',{style:{fontWeight:600,fontSize:13}},'🤖 What happened this month?'),
      h('button',{className:'btn btn-ghost btn-sm'+(busy?' btn-loading':''),disabled:busy,onClick:run},busy?'Reading the P&L…':res?'Explain again':'Explain '+MN[cal.month]+' vs '+MN[prev.getMonth()])),
    err&&h('div',{style:{fontSize:12,color:'var(--orange)',marginTop:8}},err),
    res&&h('div',{style:{marginTop:10,fontSize:13,lineHeight:1.65,color:'var(--text)'}},
      h('div',{style:{fontWeight:600,marginBottom:6}},res.headline),
      h('ul',{style:{margin:'0 0 6px 18px',padding:0}},(res.points||[]).map((p,i)=>h('li',{key:i},p))),
      (res.watch||[]).length>0&&h('div',{style:{marginTop:6}},h('b',null,'Worth checking: '),h('ul',{style:{margin:'4px 0 0 18px',padding:0}},res.watch.map((p,i)=>h('li',{key:i},p)))),
      h('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:6}},'Written by AI from the figures on this page — the figures themselves are the source of truth.'))
  );
}
// ── "Ask SalonOS" data (automation phase 4) — a compact text summary of one outlet, built only from
// the sheets this user may view there (userCanViewSheet), for the AI to answer questions from. ──
function askContextFor(user,salonId,asOf){
  const now=asOf||new Date();
  const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const can=s=>userCanViewSheet(user,salonId,s);
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const J=k=>{try{return JSON.parse(cachedLocalGet(outletKey(k,salonId))||'null');}catch(e){return null;}};
  const parts=['Outlet: '+(outletSettings(salonId).name||salonId)+'. Today: '+iso(now)+'. Amounts in ₹.'];
  const months=[0,1,2,3,4,5].map(k=>new Date(now.getFullYear(),now.getMonth()-k,1));
  if(can('outlet-pnl')){
    const rows=[];
    months.forEach(d=>{try{const p=calToFYMI(d.getFullYear(),d.getMonth());const b=plBuild(salonId,p.fy,p.mi);
      rows.push(MN[d.getMonth()]+' '+d.getFullYear()+': revenue '+Math.round(b.revenue||0)+', direct cost '+Math.round(b.direct||0)+', gross profit '+Math.round(b.gross||0)
        +', '+b.sections.filter(S=>S.sec!=='Revenue').map(S=>S.sec+' '+Math.round(S.tot||0)).join(', ')+', EBITDA '+Math.round(b.ebitda||0)+', net profit '+Math.round(b.pbt||0)
        +' | lines: '+b.sections.flatMap(S=>(S.lines||[]).filter(l=>l.amt).map(l=>l.name+' '+Math.round(l.amt))).join('; '));}catch(e){}});
    parts.push('P&L BY MONTH (latest first):\n'+rows.join('\n'));
  }
  if(can('daily-sales')){
    const s=J('salonos_daily_sales_collection_data')||{};
    const days=Object.keys(s).filter(k=>k>=iso(months[2])).sort();
    parts.push('DAILY SALES (date: cash/card/upi/luzo/outstanding sale):\n'+days.map(k=>{const r=s[k]||{};return k+': '+[0,1,2,3,4].map(i=>Number(r[i])||0).join('/');}).join('\n'));
    const e=J('salonos_daily_sales_data')||{};
    const ed=Object.keys(e).filter(k=>k>=iso(months[1])).sort();
    parts.push('DAILY EXPENSES TOTAL BY DATE:\n'+ed.map(k=>k+': '+Object.values(e[k]||{}).reduce((t,v)=>t+(Number(v)||0),0)).join(', '));
  }
  const emps=loadEmployees(salonId)||[];
  if(can('master-salary'))parts.push('STAFF (name, designation, status, gross monthly, joined):\n'+emps.map(x=>[x.name,x.desig,x.status,x.gross,x.doj].join(', ')).join('\n'));
  if(can('attendance')){
    const att=J('salonos_attendance')||{};
    const lines=[];
    [months[0],months[1]].forEach(d=>emps.filter(x=>x.status==='Active').forEach(x=>{const r=att[x.id+'_'+d.getFullYear()+'_'+d.getMonth()];if(!r||!r.days)return;
      const c=v=>r.days.filter(y=>y===v).length;lines.push(MN[d.getMonth()]+' '+x.name+': present '+c('present')+', absent '+c('absent')+', half '+c('half')+', off '+(c('off')+c('holiday')));}));
    parts.push('ATTENDANCE:\n'+lines.join('\n'));
  }
  if(can('salary-working')){
    const lines=[];
    [months[1],months[2]].forEach(d=>{try{swWorkingsFor(salonId,d.getFullYear(),d.getMonth()).forEach(w=>lines.push(MN[d.getMonth()]+' '+(w.name||(emps.find(x=>x.id===w.id)||{}).name||w.id)+': net salary '+Math.round(w.net||0)));}catch(e){}});
    parts.push('SALARY WORKING (net payable):\n'+lines.join('\n'));
  }
  if(can('vendors')){
    const vs=loadVendors(salonId);const vn=id=>(vs.find(v=>v.id===id)||{}).name||id;
    const open=loadVendorInvoices(salonId).filter(i=>i.docNature!=='Performa Invoice').map(i=>({i,bal:Number(i.amount)-(i.payments||[]).reduce((t,p)=>t+(Number(p.paidAmount)||0),0)})).filter(x=>x.bal>0.5);
    parts.push('UNPAID VENDOR BILLS (vendor, invoice no, date, due, balance):\n'+open.slice(0,150).map(x=>[vn(x.i.vendorId),x.i.invoiceNo,x.i.invoiceDate,x.i.dueDate||'-',Math.round(x.bal)].join(', ')).join('\n'));
    const recent=loadVendorInvoices(salonId).filter(i=>{const d=toISO(i.invoiceDate);return d&&d>=iso(months[2]);});
    parts.push('VENDOR BILLS LAST 3 MONTHS (vendor, category, date, amount):\n'+recent.slice(0,300).map(i=>[vn(i.vendorId),i.category||'',i.invoiceDate,i.amount].join(', ')).join('\n'));
  }
  if(can('recurring-expenses'))parts.push('RECURRING EXPENSES (name, payee, amount, frequency, due day, status):\n'+loadRecurringExpenses(salonId).map(i=>[recurringExpenseNameOf(i),i.payee,i.amount,i.frequency,i.dueDay,i.status].join(', ')).join('\n'));
  if(can('advance'))parts.push('ADVANCES (employee, amount, date, status):\n'+loadAdvances(salonId).slice(-100).map(a=>[a.emp,a.amount,a.date,a.status].join(', ')).join('\n'));
  if(can('bank-statement'))parts.push('BANK STATEMENT, LAST 150 ROWS (date, narration, debit, credit, nature):\n'+loadBankStatementRows(salonId).slice(-150).map(r=>[r.transactionDate,String(r.description||'').slice(0,60),r.debit||'',r.credit||'',r.nature||''].join(', ')).join('\n'));
  return parts.join('\n\n').slice(0,110000);
}
// ── Collection Comparison — day by day, what Collection Reco's CRADLE import says was collected
// vs what the outlet entered in Daily Sales & Exp (Luzo Sale counted with UPI), with the
// difference per mode, so a missed or mistyped day stands out. Gross amounts (incl. GST). ──
function collectionComparisonRowsFor(sid,year,month){
  const days=new Date(year,month+1,0).getDate();
  const ym=year+'-'+String(month+1).padStart(2,'0');
  const cr={},ds={};
  (collectionRowsForMonth(sid,year,month)||[]).forEach(r=>{const iso=toISO(r.invoiceDate);if(!iso)return;const t=cr[iso]||(cr[iso]={cash:0,card:0,upi:0});
    t.cash+=Number(r.cash)||0;t.card+=Number(r.card)||0;t.upi+=Number(r.upi)||0;});
  dseSalesRowsForMonth(sid,year,month).forEach(r=>{ds[r.id]=r;});
  const rows=[];
  for(let d=1;d<=days;d++){
    const iso=ym+'-'+String(d).padStart(2,'0');const c=cr[iso]||{cash:0,card:0,upi:0},e=ds[iso]||{cash:0,card:0,upi:0,luzo:0};
    rows.push({iso,hasC:!!cr[iso],hasD:!!ds[iso],c,e,ct:c.cash+c.card+c.upi,et:e.cash+e.card+e.upi});
  }
  return rows;
}
function CollectionComparisonSheet({salon,period}={}){
  const {toast}=useToast();
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today=new Date();
  const init=periodToCalendar(period);
  const [cal,setCal]=useState(init||{year:today.getFullYear(),month:today.getMonth()});
  useEffect(()=>{const c=periodToCalendar(period);if(c)setCal(c);
    // eslint-disable-next-line
  },[period&&period.mi,period&&period.fy]);
  const [onlyDiff,setOnlyDiff]=useState(false);
  const sid=salon?.id;
  // Reason for the difference, typed per day — saved per outlet. Read-only once the month's P&L
  // is Final or the month is locked.
  const reasonKey=()=>outletKey('salonos_collection_cmp_reasons',sid);
  const [reasons,setReasons]=useState(()=>{try{return JSON.parse(cachedLocalGet(reasonKey())||'{}')||{};}catch(e){return{};}});
  useEffect(()=>{try{setReasons(JSON.parse(cachedLocalGet(reasonKey())||'{}')||{});}catch(e){setReasons({});}
    // eslint-disable-next-line
  },[sid]);
  const fymi=calToFYMI(cal.year,cal.month);
  const reasonLocked=isPnlFinal(sid,fymi.fy,fymi.mi)||isMonthLockedFor(sid,cal.year,cal.month);
  const saveReason=(iso,text)=>{
    const v=String(text||'').trim();
    if((reasons[iso]||'')===v)return;
    if(reasonLocked){toast('This month is locked — the reason can\u2019t be changed.','error');return;}
    const next={...reasons};if(v)next[iso]=v;else delete next[iso];
    setReasons(next);safeLocalSet(reasonKey(),JSON.stringify(next));
  };
  const all=collectionComparisonRowsFor(sid,cal.year,cal.month);
  const cds=collectionDiffSettings(sid);
  const isDiff=r=>collectionDayOverLimit(r,cds.limit);
  const todayIso=localIsoOf(today);
  const rows=onlyDiff?all.filter(isDiff):all.filter(r=>r.hasC||r.hasD||r.iso<=todayIso);
  const sum=f=>all.reduce((s,r)=>s+f(r),0);
  const T={cc:sum(r=>r.c.cash),ec:sum(r=>r.e.cash),cd:sum(r=>r.c.card),ed:sum(r=>r.e.card),cu:sum(r=>r.c.upi),eu:sum(r=>r.e.upi),ct:sum(r=>r.ct),et:sum(r=>r.et),luzo:sum(r=>r.e.luzo||0)};
  const m=n=>n?'₹'+Math.round(n).toLocaleString('en-IN'):'—';
  const dm=n=>Math.abs(n)<0.5?'—':(n>0?'+':'−')+'₹'+Math.round(Math.abs(n)).toLocaleString('en-IN');
  const dColor=n=>Math.abs(n)<0.5?'var(--text3)':n>0?'var(--green)':'var(--red)';
  const shift=k=>{const d=new Date(cal.year,cal.month+k,1);setCal({year:d.getFullYear(),month:d.getMonth()});};
  const fmtD=iso=>iso.split('-').reverse().join('/');
  const td=(v,st)=>React.createElement('td',{style:{textAlign:'right',whiteSpace:'nowrap',...(st||{})}},v);
  const group=(c,e,shade)=>[td(m(c),{background:shade}),td(m(e),{background:shade}),td(dm(e-c),{background:shade,color:dColor(e-c),fontWeight:600})];
  const withKeys=list=>list.map((x,i)=>React.cloneElement(x,{key:i}));
  const exportXlsx=async()=>{
    try{
      const hdr=['Date','Cash – CRADLE','Cash – Daily Sales','Cash Diff','Card – CRADLE','Card – Daily Sales','Card Diff','UPI – CRADLE','UPI + Luzo – Daily Sales','UPI Diff','Total – CRADLE','Total – Daily Sales','Total Diff','Reason for difference'];
      const body=rows.map(r=>[fmtD(r.iso),r.c.cash,r.e.cash,r.e.cash-r.c.cash,r.c.card,r.e.card,r.e.card-r.c.card,r.c.upi,r.e.upi,r.e.upi-r.c.upi,r.ct,r.et,r.et-r.ct,reasons[r.iso]||'']);
      const tot=['Total',T.cc,T.ec,T.ec-T.cc,T.cd,T.ed,T.ed-T.cd,T.cu,T.eu,T.eu-T.cu,T.ct,T.et,T.et-T.ct,''];
      const blob=await exportReportExcelBlob('Collection Comparison',[hdr,...body,tot]);
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;
      a.download='Collection_Comparison_'+(salon?salon.name.split('—')[0].trim().replace(/\s+/g,'_'):'Outlet')+'_'+MONTHS[cal.month]+'_'+cal.year+'.xlsx';a.click();URL.revokeObjectURL(url);
    }catch(err){toast(err.message,'error');}
  };
  const mismatchDays=all.filter(r=>(r.hasC||r.hasD)&&isDiff(r)).length;
  const h=React.createElement;
  return h('div',null,
    h('div',{className:'section-header'},
      h('div',null,
        h('div',{className:'page-title'},'Collection Comparison'),
        h('div',{className:'page-sub'},'Day-wise: Collection Reco (imported from CRADLE) vs Daily Sales & Exp · amounts incl. GST · Luzo Sale counted with UPI · Diff = Daily Sales − CRADLE · flagged when over ₹'+cds.limit.toLocaleString('en-IN')+(cds.block?' (reasons needed before Final)':'')+' — set per outlet in Master Sheet')),
      h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
        h('div',{className:'fd-date'},
          h('button',{onClick:()=>shift(-1)},'‹'),
          h('span',{className:'lbl'},MONTHS[cal.month].slice(0,3)+' '+cal.year),
          h('button',{onClick:()=>shift(1)},'›')),
        h('label',{style:{display:'flex',gap:6,alignItems:'center',fontSize:12,cursor:'pointer'}},
          h('input',{type:'checkbox',checked:onlyDiff,onChange:e=>setOnlyDiff(e.target.checked)}),'Only flagged days'),
        h('button',{className:'btn btn-ghost btn-sm',onClick:exportXlsx},'⬇ Export Excel'))),
    h('div',{className:'grid4',style:{marginBottom:14}},
      [['CRADLE (Collection Reco)',m(T.ct),'var(--blue)'],['Daily Sales & Exp',m(T.et),'var(--teal)'],['Difference',dm(T.et-T.ct),Math.abs(T.et-T.ct)<0.5?'var(--green)':'var(--red)'],['Days not matching',String(mismatchDays),mismatchDays?'var(--orange)':'var(--green)']].map(([l,v,c])=>
        h('div',{key:l,className:'metric-card'},h('div',{className:'metric-label'},l),h('div',{className:'metric-value',style:{color:c,fontSize:22}},v)))),
    h('div',{className:'card',style:{padding:0}},
      h('div',{className:'table-wrap'},
        h('table',null,
          h('thead',null,
            h('tr',null,h('th',{rowSpan:2},'Date'),
              ...['Cash','Card','UPI (+ Luzo)','Total'].map(g=>h('th',{key:g,colSpan:3,style:{textAlign:'center'}},g)),
              h('th',{key:'reason',rowSpan:2,style:{minWidth:220}},'Reason for difference')),
            h('tr',null,...withKeys([0,1,2,3].flatMap(()=>['CRADLE','Daily Sales','Diff'].map(t=>h('th',{style:{textAlign:'right',whiteSpace:'nowrap'}},t)))))),
          h('tbody',null,
            rows.length===0?h('tr',null,h('td',{colSpan:14,style:{textAlign:'center',padding:28,color:'var(--text3)'}},onlyDiff?'Every day matches.':'Nothing imported or entered for this month yet.')):
            rows.map(r=>h('tr',{key:r.iso},
              h('td',{style:{whiteSpace:'nowrap'}},fmtD(r.iso),
                !r.hasC&&r.hasD&&h('div',{style:{fontSize:10,color:'var(--orange)'}},'not in CRADLE import'),
                r.hasC&&!r.hasD&&h('div',{style:{fontSize:10,color:'var(--orange)'}},'not entered in Daily Sales')),
              ...withKeys([...group(r.c.cash,r.e.cash),...group(r.c.card,r.e.card,'rgba(47,95,224,0.04)'),...group(r.c.upi,r.e.upi),...group(r.ct,r.et,'rgba(47,95,224,0.07)')]),
              h('td',{style:{minWidth:220}},
                reasonLocked?h('span',{style:{fontSize:12,color:reasons[r.iso]?'var(--text)':'var(--text3)'}},reasons[r.iso]||'—')
                :h('input',{key:r.iso+'|'+(reasons[r.iso]||''),className:'form-control',defaultValue:reasons[r.iso]||'',
                  placeholder:isDiff(r)?'Why is it different?':'',
                  style:{fontSize:12,padding:'4px 8px',borderColor:isDiff(r)&&!reasons[r.iso]?'var(--orange)':undefined},
                  onBlur:e=>saveReason(r.iso,e.target.value),
                  onKeyDown:e=>{if(e.key==='Enter')e.target.blur();}}))))),
          h('tfoot',null,h('tr',{style:{fontWeight:700}},
            h('td',null,'Total'),...withKeys([...group(T.cc,T.ec),...group(T.cd,T.ed),...group(T.cu,T.eu),...group(T.ct,T.et)]),
            h('td',{style:{fontSize:11.5,fontWeight:500,color:'var(--text3)'}},(()=>{const open=all.filter(r=>(r.hasC||r.hasD)&&isDiff(r)&&!reasons[r.iso]).length;return open?open+' difference'+(open===1?'':'s')+' without a reason':'All differences explained';})())))))),
    T.luzo>0&&h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:8}},'Daily Sales UPI includes Luzo Sale of '+m(T.luzo)+' for the month.'));
}
function OutletPnLSheet({salon,period,onNavTab}={}){
  const [subTab,setSubTab]=useState('pnl');
  const tabBar=React.createElement('div',{className:'tab-bar',style:{marginBottom:16}},
    [{id:'pnl',label:'P&L Statement'},{id:'mtd',label:'MTD P&L'},{id:'variance',label:'Variance Analysis'},{id:'cashflow',label:'Cash Flow'},{id:'compare',label:'Compare'},{id:'collcmp',label:'Collection Comparison'},{id:'gst',label:'GST Summary'},{id:'budget',label:'Budget'},{id:'drawings',label:'Owner Drawings'},{id:'bankreco',label:'Bank Reco'},{id:'forecast',label:'30-day Forecast'},{id:'close',label:'Month-End Close'}].map(t=>
      React.createElement('button',{key:t.id,className:`tab-btn ${subTab===t.id?'active':''}`,onClick:()=>setSubTab(t.id)},t.label)
    )
  );
  const cal=periodToCalendar(period);
  const curFyMi=cal?calToFYMI(cal.year,cal.month):{fy:(period&&period.fy)||'2025-26',mi:(period&&typeof period.mi==='number')?period.mi:3};
  return React.createElement('div',{className:'fade-in'},
    tabBar,
    React.createElement('div',{style:{display:subTab==='pnl'?'block':'none'}},React.createElement(AiExplainPnlCard,{salon,period}),React.createElement(OutletPnLCore,{salon,period})),
    subTab==='variance'&&React.createElement('div',null,
      React.createElement('div',{className:'section-header'},
        React.createElement('div',null,
          React.createElement('div',{className:'page-title'},'Variance Analysis'),
          React.createElement('div',{className:'page-sub'},'How this month\'s Revenue and Expenses moved against a comparison period, with significant swings called out automatically')
        )
      ),
      React.createElement(PnLVarianceSection,{salonId:salon?.id,fy:curFyMi.fy,mi:curFyMi.mi})
    ),
    React.createElement('div',{style:{display:subTab==='cashflow'?'block':'none'}},React.createElement(CashFlowSheet,{salon,period})),
    React.createElement('div',{style:{display:subTab==='compare'?'block':'none'}},React.createElement(PnLCompareSheet,{salon,period})),
    subTab==='collcmp'&&React.createElement(CollectionComparisonSheet,{salon,period}),
    subTab==='mtd'&&React.createElement(MtdPnlSheet,{salon,period}),
    subTab==='gst'&&React.createElement(GstSummarySheet,{salon,period}),
    subTab==='budget'&&React.createElement(BudgetSheet,{salon,period}),
    subTab==='drawings'&&React.createElement(OwnerDrawingsSheet,{salon,period}),
    subTab==='bankreco'&&React.createElement(BankRecoSheet,{salon,period}),
    subTab==='forecast'&&React.createElement(CashForecastSheet,{salon}),
    subTab==='close'&&React.createElement(MonthCloseChecklist,{salon,period,onNavTab})
  );
}

/* ---------- PERIOD GATE ---------- */
const PG_FYS=['2023-24','2024-25','2025-26','2026-27'];
const PG_MONTHS=['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
const PG_LONG=['April','May','June','July','August','September','October','November','December','January','February','March'];
const pgYear=(fy,mi)=>mi<9?fy.slice(0,4):'20'+fy.slice(5);
function periodToCalendar(period){
  if(!period||typeof period.mi!=='number'||!period.fy)return null;
  return{month:(period.mi+3)%12,year:Number(pgYear(period.fy,period.mi))};
}
// The reverse of periodToCalendar — turns a calendar year/month (month 0-11, Jan=0) into the
// {fy,mi} shape plBuild() and the rest of the P&L engine expect.
function calToFYMI(year,month){
  const mi=(month+9)%12; // Jan(0) -> 9, Apr(3) -> 0
  const start=month>=3?year:year-1;
  return{fy:start+'-'+String(start+1).slice(2),mi};
}
const pgLabel=(p)=>p?PG_LONG[p.mi]+' '+pgYear(p.fy,p.mi)+' · FY '+p.fy:'';
function pgCurrent(){
  const d=new Date();
  return calToFYMI(d.getFullYear(),d.getMonth());
}
function pgKeyFor(salonId){return salonId!=null?'salonos_period_default_outlet_'+salonId:'salonos_period_default'}
function pgLoad(salonId){try{const v=JSON.parse(cachedLocalGet(pgKeyFor(salonId)));return v&&v.fy?v:null}catch(e){return null}}
function pgSave(p,salonId){try{p?safeLocalSet(pgKeyFor(salonId),JSON.stringify(p)):cachedLocalRemove(pgKeyFor(salonId))}catch(e){}}
function pgLoadAll(){
  const map={};
  let legacy=null;try{legacy=JSON.parse(cachedLocalGet('salonos_period_default'));if(!(legacy&&legacy.fy))legacy=null}catch(e){}
  SALONS.forEach(s=>{const v=pgLoad(s.id);if(v)map[s.id]=v;else if(legacy){map[s.id]=legacy;pgSave(legacy,s.id);}});
  try{cachedLocalRemove('salonos_period_default')}catch(e){}
  return map;
}

function PeriodGate({salon,initial,onConfirm,onCancel,hadDefault}){
  const now=pgCurrent();
  const [fy,setFy]=useState((initial&&initial.fy)||now.fy);
  const [mi,setMi]=useState(initial&&typeof initial.mi==='number'?initial.mi:now.mi);
  const [remember,setRemember]=useState(!!hadDefault);
  const isFuture=(f,i)=>PG_FYS.indexOf(f)>PG_FYS.indexOf(now.fy)||(f===now.fy&&i>now.mi);
  const go=()=>{if(isFuture(fy,mi))return;onConfirm({fy,mi},remember)};
  return h('div',{className:'gate fade-in'},
    h('div',{className:'gate-card'},
      h('div',{className:'gate-eyebrow'},'Opening outlet'),
      h('div',{className:'gate-title'},salon?salon.name:'Select a period'),
      h('div',{className:'gate-sub'},'Every sheet in this outlet — salary, incentives, attendance, expenses and P&L — is filed by period. Choose the one you want to work in.'),
      h('div',{className:'gate-label'},'Financial year'),
      h('div',{className:'fy-row'},PG_FYS.map(f=>h('button',{key:f,className:'fy-chip '+(fy===f?'on':''),
        onClick:()=>{setFy(f);if(isFuture(f,mi))setMi(f===now.fy?now.mi:11)}},'FY '+f))),
      h('div',{className:'gate-label'},'Month'),
      h('div',{className:'mon-grid'},PG_MONTHS.map((m,i)=>{
        const fut=isFuture(fy,i);
        return h('button',{key:m,className:'mon '+(mi===i?'on':'')+(fut?' future':''),disabled:fut,
          title:fut?'Period has not started yet':'',onClick:()=>!fut&&setMi(i),
          onDoubleClick:()=>!fut&&onConfirm({fy,mi:i},remember)},
          h('div',{className:'m'},m),h('div',{className:'y'},pgYear(fy,i)));
      })),
      h('label',{className:'gate-remember'},
        h('input',{type:'checkbox',checked:remember,onChange:e=>setRemember(e.target.checked)}),
        h('div',null,h('div',{className:'t'},'Make this my default period'),
          h('div',{className:'s'},'This outlet will open straight into '+PG_LONG[mi]+' '+pgYear(fy,mi)+' without asking. You can change it any time from the period bar inside the outlet.'))),
      h('div',{style:{display:'flex',gap:10,justifyContent:'flex-end'}},
        onCancel?h('button',{className:'btn btn-ghost',onClick:onCancel},'Cancel'):null,
        h('button',{className:'btn btn-primary',onClick:go,disabled:isFuture(fy,mi)},
          'Open '+PG_LONG[mi]+' '+pgYear(fy,mi)))));
}

/* ---------- INVOICE INTAKE: attach → extract → autofill ---------- */
const CDN={
  pdf:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfWorker:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  zip:'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  ocr:'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.0/tesseract.min.js'
};
const _loaded={};
function loadScript(url){
  if(_loaded[url])return _loaded[url];
  _loaded[url]=new Promise((res,rej)=>{
    const s=document.createElement('script');s.src=url;s.async=true;s.crossOrigin='anonymous'; // lets errors inside it show their real message (not just "Script error.")
    const timer=setTimeout(()=>{
      finish(rej,new Error('Timed out loading '+url.split('/').pop()+' — check your internet connection and try again'));
    },15000);
    let done=false;
    const finish=(fn,arg)=>{
      if(done)return;
      done=true;
      clearTimeout(timer);
      if(fn===rej)delete _loaded[url]; // don't cache a failure — the next attempt should retry, not stay stuck
      fn(arg);
    };
    s.onload=()=>finish(res,true);
    s.onerror=()=>finish(rej,new Error('Could not load '+url.split('/').pop()+' — check your internet connection and try again'));
    document.head.appendChild(s);
  });
  return _loaded[url];
}
const readBuf=(f)=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(new Error('Could not read the file'));r.readAsArrayBuffer(f)});

// ── Shared formatting helpers — one source of truth for how numbers, currency, and dates
// display, used by every export path (PDF/Word/Excel) instead of each report re-implementing
// its own formatting. Kept as small, single-purpose functions rather than one large utility. ──
function formatCurrency(n){return '₹'+Math.round(Number(n)||0).toLocaleString('en-IN');}
function formatNumber(n,decimals){decimals=decimals||0;return Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});}
function formatDateDMY(d){
  if(!d)return '';
  if(d instanceof Date)return String(d.getDate()).padStart(2,'0')+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+d.getFullYear();
  return String(d);
}
// Guesses a column's data type from a sample of its values, so exports can align/format cells
// sensibly (right-align currency & numbers, center IDs & dates, left-align text) without every
// report generator repeating this logic itself.
function detectColumnType(values){
  const sample=(values||[]).filter(v=>v!==''&&v!=null).slice(0,20);
  if(!sample.length)return'text';
  if(sample.every(v=>v instanceof Date||/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(String(v))))return'date';
  if(sample.every(v=>/^[A-Za-z]{1,4}\d{2,6}$/.test(String(v))))return'id';
  if(sample.every(v=>typeof v==='number'||(String(v).trim()!==''&&!isNaN(Number(v)))))return'number';
  return'text';
}
// Computes sensible Excel column widths from actual cell content — shared by every Excel export
// instead of each one recomputing it inline.
function autoColumnWidths(rows){
  const widths=[];
  (rows||[]).forEach(row=>{if(!Array.isArray(row))return;row.forEach((cell,ci)=>{
    const len=String(cell==null?'':cell).length;
    widths[ci]=Math.min(42,Math.max(widths[ci]||10,len+2));
  });});
  return widths.map(w=>({wch:w||12}));
}
// Scans a report's body HTML for <h3> section headings, tags each with an anchor id, and returns
// both the annotated HTML and the heading list — used to auto-build a Table of Contents for
// reports with multiple sections (mainly the Word export) without every report generator having
// to build its own TOC by hand.
function annotateSectionsForToc(bodyHtml){
  const headings=[];
  let idx=0;
  const withAnchors=String(bodyHtml).replace(/<h3(?:\s[^>]*)?>(.*?)<\/h3>/g,(m,text)=>{
    idx++;
    const id='sec-'+idx;
    headings.push({id,text:text.replace(/<[^>]+>/g,'')});
    return '<h3 id="'+id+'">'+text+'</h3>';
  });
  return{headings,withAnchors};
}

// ── Share Report engine — generates a PDF, Word doc, or Excel workbook from a report's own HTML
// and data, then either hands it to the OS share sheet (so WhatsApp/Email/anything else shows up
// as a real option, file attached automatically) via the Web Share API, or — where that isn't
// supported, mainly on desktop — downloads it and opens WhatsApp Web / a mailto draft so the
// person just has to attach the file that was downloaded. There is no way for a website to attach
// a file to WhatsApp or Email on someone's behalf without the Web Share API; that's a browser/OS
// restriction, not something this app can route around. ──
// opts: {execSummary?: string[], landscape?: boolean} — both optional, existing callers that
// pass only (title, subtitle, bodyHtml) are unaffected.
const REPORT_CSS=`
  *{box-sizing:border-box}
  .sos-report{font-family:'Segoe UI',Calibri,Arial,Helvetica,sans-serif;color:#1f2937;padding:0;margin:0 auto;font-size:13px;line-height:1.5;background:#fff}
  .sos-report .cover{border-bottom:4px solid #14335e;padding-bottom:16px;margin-bottom:22px}
  .sos-report .cover .brand{font-size:10.5px;letter-spacing:0.12em;text-transform:uppercase;color:#8a94a6;font-weight:600;margin-bottom:6px}
  .sos-report h1{font-size:24px;margin:0 0 6px;color:#14335e;font-weight:700;letter-spacing:-0.01em}
  .sos-report .sub{color:#5b6472;font-size:12px;margin-bottom:2px}
  .sos-report .meta{color:#8a94a6;font-size:10.5px;margin-top:8px}
  .sos-report h3{color:#14335e;font-size:15px;margin:26px 0 4px;padding-bottom:4px;border-bottom:2px solid #dbe6f3;page-break-before:auto}
  .sos-report h4{color:#1d4e8f;font-size:12.5px;margin:16px 0 6px}
  .sos-report p{margin:4px 0}
  .sos-report table{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:18px;page-break-inside:auto}
  .sos-report thead{display:table-header-group}
  .sos-report tr{page-break-inside:avoid;page-break-after:auto}
  .sos-report th,.sos-report td{padding:7px 10px;border:1px solid #d7dde6;text-align:left}
  .sos-report th{background:#14335e;color:#ffffff;font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:0.04em}
  .sos-report tbody tr:nth-child(even){background:#f4f7fb}
  .sos-report td.num,.sos-report th.num{text-align:right;font-variant-numeric:tabular-nums}
  .sos-report td.id,.sos-report th.id,.sos-report td.date,.sos-report th.date{text-align:center}
  .sos-report .section{font-weight:700;background:#dbe6f3;color:#14335e;padding:8px 10px;text-transform:uppercase;font-size:10.5px;letter-spacing:0.05em}
  .sos-report .total-row td{background:#eef3fa;font-weight:700;border-top:2px solid #14335e}
  .sos-report .positive{color:#1a7a4c;font-weight:700}
  .sos-report .negative{color:#b3261e;font-weight:700}
  .sos-report .warning{color:#a15c00;font-weight:700}
  .sos-report .note{color:#6b7280;font-size:10.5px}
  .sos-report .badge-note{display:inline-block;background:#fff3d6;color:#8a5b00;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;margin-left:6px}
  .sos-report .exec-summary{background:#f4f7fb;border-left:4px solid #14335e;padding:14px 16px;margin-bottom:22px;border-radius:0 4px 4px 0}
  .sos-report .exec-summary h2{font-size:12px;color:#14335e;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px}
  .sos-report .exec-summary ul{margin:0;padding-left:18px}
  .sos-report .exec-summary li{margin-bottom:4px}
  .sos-report .toc{margin-bottom:24px}
  .sos-report .toc h2{font-size:12px;color:#14335e;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px}
  .sos-report .toc ol{margin:0;padding-left:20px}
  .sos-report .toc a{color:#1d4e8f;text-decoration:none}
  .sos-report .footer{margin-top:28px;padding-top:10px;border-top:1px solid #d7dde6;color:#8a94a6;font-size:10px;display:flex;justify-content:space-between}
`;
// The inner content shared by the print-based export and the real-PDF-blob export below — one
// source of truth for the cover/exec-summary/TOC/body/footer markup so the two rendering paths
// (browser print vs html2canvas rasterization) can never visually drift apart.
function reportInnerHtml(title,subtitle,bodyHtml,opts){
  opts=opts||{};
  const{headings,withAnchors}=annotateSectionsForToc(bodyHtml);
  const showToc=headings.length>=2;
  return{headings,html:`<div class="cover">
      <div class="brand">SalonOS — Business Report</div>
      <h1>${title}</h1>
      ${subtitle?`<div class="sub">${subtitle}</div>`:''}
      <div class="meta">Generated ${new Date().toLocaleString('en-IN',{dateStyle:'long',timeStyle:'short'})}${opts.watermark?` · <b style="color:${String(opts.watermark).toUpperCase()==='FINAL'?'#15803d':'#b91c1c'}">${String(opts.watermark).toUpperCase()==='FINAL'?'FINAL':'DRAFT — not final'}</b>`:''}</div>
    </div>
    ${opts.execSummary&&opts.execSummary.length?`<div class="exec-summary"><h2>Executive Summary</h2><ul>${opts.execSummary.map(li=>'<li>'+li+'</li>').join('')}</ul></div>`:''}
    ${showToc?`<div class="toc"><h2>Contents</h2><ol>${headings.map(h=>'<li><a href="#'+h.id+'">'+h.text+'</a></li>').join('')}</ol></div>`:''}
    ${withAnchors}
    <div class="footer"><span>SalonOS · Confidential — for internal use</span><span>${title}</span></div>`};
}
function reportPrintableHtml(title,subtitle,bodyHtml,opts){
  opts=opts||{};
  const pageSize=opts.landscape?'A4 landscape':'A4';
  const inner=reportInnerHtml(title,subtitle,bodyHtml,opts);
  const wm=opts.watermark?String(opts.watermark).toUpperCase():'';
  const wmCol=wm==='FINAL'?'rgba(22,163,74,0.12)':'rgba(220,38,38,0.12)';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>
      .sos-wm{position:fixed;top:38%;left:0;right:0;text-align:center;font:800 120px Arial,sans-serif;color:${wmCol};transform:rotate(-28deg);z-index:9;pointer-events:none;letter-spacing:0.08em}
      @page{size:${pageSize};margin:16mm 14mm}
      body{margin:0}
      .sos-report{max-width:${opts.landscape?'1280px':'960px'};padding:0}
      ${REPORT_CSS}
      @media print{
        .sos-report .footer{position:fixed;bottom:0;left:0;right:0}
      }
    </style></head><body>
    ${wm?`<div class="sos-wm">${wm}</div>`:''}
    <div class="sos-report">${inner.html}</div>
    </body></html>`;
}
async function shareOrDownload(blob,filename,{whatsappText,emailSubject}={}){
  const file=new File([blob],filename,{type:blob.type});
  try{
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      await navigator.share({files:[file],title:filename,text:whatsappText||filename});
      return'shared';
    }
  }catch(e){
    if(e&&e.name==='AbortError')return'cancelled'; // person closed the OS share sheet — not an error
  }
  // Fallback: download the file, then offer quick WhatsApp/Email openers. Neither can attach the
  // file automatically — that's a hard browser limitation — so this is upfront about it rather
  // than pretending the file went along.
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
  return{fallback:true,waUrl:'https://wa.me/?text='+encodeURIComponent(whatsappText||('Sharing: '+filename)),
    mailUrl:'mailto:?subject='+encodeURIComponent(emailSubject||filename)+'&body='+encodeURIComponent('Attached: '+filename)};
}
function exportReportPdf(title,subtitle,bodyHtml,opts){
  const w=window.open('','_blank');
  if(!w)return null;
  w.document.write(reportPrintableHtml(title,subtitle,bodyHtml,opts));
  w.document.close();
  w.onload=()=>w.print();
  return true;
}
function exportReportWordBlob(title,subtitle,bodyHtml,opts){
  const html=reportPrintableHtml(title,subtitle,bodyHtml,opts);
  return new Blob(['\ufeff'+html],{type:'application/msword'});
}
// Same styled document as the Word/PDF exports, served as a real standalone .html file instead
// \u2014 opens in any browser with the report's own formatting intact, no viewer/app required.
function exportReportHtmlBlob(title,subtitle,bodyHtml,opts){
  const html=reportPrintableHtml(title,subtitle,bodyHtml,opts);
  return new Blob([html],{type:'text/html'});
}
const CDN_EXCELJS_URL='https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
async function loadExcelJS(){
  await loadScript(CDN_EXCELJS_URL);
  if(!window.ExcelJS)throw new Error('Excel engine unavailable — check your internet connection.');
}
// Rows whose first cell reads like a grand total / key subtotal get the highlighted "total row"
// treatment (bold, tinted background, top border) — same visual language as the PDF/Word exports.
const EXCEL_TOTAL_ROW_WORDS=/^(total|gross profit|ebitda|profit before tax|net profit|grand total|sub[- ]?total)/i;
async function exportReportExcelBlob(title,sheetRows){
  await loadExcelJS();
  const wb=new ExcelJS.Workbook();
  wb.creator='SalonOS';wb.created=new Date();
  const ws=wb.addWorksheet((title||'Report').slice(0,31).replace(/[\\/*?:[\]]/g,''));
  const rows=(sheetRows||[]).filter(r=>Array.isArray(r));
  const maxCols=Math.max(1,...rows.map(r=>r.length));
  const headerRowIdx=rows.findIndex(r=>r.length>1);
  const isTotalRow=(row,ri)=>ri!==headerRowIdx&&typeof row[0]==='string'&&EXCEL_TOTAL_ROW_WORDS.test(row[0].trim());
  // Live SUM() formulas for the total row — but only when the sheet has exactly one. A single
  // "Total"/"Grand Total" row unambiguously sums everything since the header, so that's always
  // safe. A sheet with several ("Subtotal" per section, then a final "Total") is a real risk of
  // double-counting if formula-ized blindly — a summed range that includes an earlier subtotal
  // row would count those rows twice — so multi-total sheets keep the static, correctly-computed
  // values they already had rather than risk a wrong live formula.
  const totalRowCount=rows.filter(isTotalRow).length;

  rows.forEach((row,ri)=>{
    const padded=row.slice();while(padded.length<maxCols)padded.push('');
    const excelRow=ws.addRow(padded);
    const isHeader=ri===headerRowIdx;
    const isTotal=isTotalRow(row,ri);
    const isSectionLabel=row.filter(c=>c!==''&&c!=null).length===1&&row.length<maxCols&&!isHeader;
    if(isTotal&&totalRowCount===1&&headerRowIdx>=0){
      const dataStartExcelRow=headerRowIdx+2; // first data row, 1-based
      const dataEndExcelRow=ri; // this total row is 0-based ri → previous Excel row is ri (1-based data end)
      excelRow.eachCell({includeEmpty:true},(cell,colNum)=>{
        if(typeof cell.value==='number'){
          const colLetter=excelColLetter(colNum);
          cell.value={formula:'SUM('+colLetter+dataStartExcelRow+':'+colLetter+dataEndExcelRow+')',result:cell.value};
        }
      });
    }
    excelRow.eachCell({includeEmpty:true},(cell,colNum)=>{
      cell.border={top:{style:'thin',color:{argb:'FFD7DDE6'}},bottom:{style:'thin',color:{argb:'FFD7DDE6'}},
        left:{style:'thin',color:{argb:'FFD7DDE6'}},right:{style:'thin',color:{argb:'FFD7DDE6'}}};
      if(isHeader){
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF14335E'}};
        cell.font={bold:true,color:{argb:'FFFFFFFF'},size:10};
        cell.alignment={vertical:'middle',horizontal:colNum===1?'left':'right'};
      }else if(isSectionLabel){
        if(colNum===1){cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFDBE6F3'}};cell.font={bold:true,color:{argb:'FF14335E'},size:10};}
      }else if(isTotal){
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEEF3FA'}};
        cell.font={bold:true};
        cell.border.top={style:'medium',color:{argb:'FF14335E'}};
        if(colNum>1)cell.alignment={horizontal:'right'};
        const v=(cell.value&&cell.value.formula)?cell.value.result:cell.value;
        if(typeof v==='number')cell.numFmt=Number.isInteger(v)?'#,##0':'#,##0.00';
      }else{
        if(ri%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF4F7FB'}};
        if(colNum>1)cell.alignment={horizontal:'right'};
        if(typeof cell.value==='number'){
          cell.numFmt=Math.abs(cell.value)<=1&&!Number.isInteger(cell.value)?'0.0%':'#,##0';
          if(cell.value<0)cell.font={color:{argb:'FFB3261E'}};
        }
      }
    });
  });
  ws.columns=autoColumnWidths(sheetRows).map(w=>({width:w.wch}));
  if(headerRowIdx>=0){
    ws.views=[{state:'frozen',ySplit:headerRowIdx+1}];
    ws.autoFilter={from:{row:headerRowIdx+1,column:1},to:{row:headerRowIdx+1,column:maxCols}};
  }
  const buf=await wb.xlsx.writeBuffer();
  return new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

// 1-based column index → Excel column letter(s), e.g. 1→'A', 27→'AA'.
function excelColLetter(n){
  let s='';
  while(n>0){const rem=(n-1)%26;s=String.fromCharCode(65+rem)+s;n=Math.floor((n-1)/26);}
  return s;
}
const EXCEL_HEADER_FILL={type:'pattern',pattern:'solid',fgColor:{argb:'FF14335E'}};
const EXCEL_HEADER_FONT={bold:true,color:{argb:'FFFFFFFF'},size:10};
const EXCEL_THIN_BORDER={top:{style:'thin',color:{argb:'FFD7DDE6'}},bottom:{style:'thin',color:{argb:'FFD7DDE6'}},left:{style:'thin',color:{argb:'FFD7DDE6'}},right:{style:'thin',color:{argb:'FFD7DDE6'}}};

// ── Salary Working — Excel export with live formulas, not flat values. Net Salary and Closing
// Advance are real formulas referencing the row's own Gross/Incentive/Deduction/Advance cells —
// edit any of those in Excel and Net Salary & Closing Advance recalculate automatically, exactly
// per swWorkingsFor's own math. Columns not currently toggled on in the app are simply left out
// of the export (their term becomes a literal number in the formula instead of a cell reference).
async function buildSalaryWorkingExcelBlob({title,workings,cols,metaFor,MONTHS,selMonth}){
  await loadExcelJS();
  const wb=new ExcelJS.Workbook();
  wb.creator='SalonOS';wb.created=new Date();
  const ws=wb.addWorksheet((title||'Salary Working').slice(0,31).replace(/[\\/*?:[\]]/g,''));

  const colDefs=[
    {id:'name',header:'Employee'},
    {id:'desig',header:'Designation'},
    {id:'salary',header:'Salary'},
    {id:'totalDays',header:'Total Days'},
    {id:'gross',header:'Gross Salary'},
    cols.serviceInc&&{id:'svcIncAmt',header:'Service Incentive'},
    cols.memInc&&{id:'memInc',header:'Mem Inc'},
    cols.prodInc&&{id:'prodInc',header:'Prod Inc'},
    cols.mgrInc&&{id:'mgrInc',header:'MGR Inc'},
    cols.nonPerfPenalty&&{id:'nonPerfPenalty',header:'Non-Performance Penalty'},
    cols.totalInc&&{id:'totalIncSW',header:'Total Inc'},
    cols.tea&&{id:'tea',header:'Tea'},
    cols.pfEmp&&{id:'pfEmp',header:'PF (Emp)'},
    cols.esic&&{id:'esic',header:'ESIC (Emp)'},
    cols.pt&&{id:'pt',header:'Professional Tax'},
    cols.tds&&{id:'tds',header:'TDS'},
    cols.advAdj&&{id:'advAdj',header:'Advance Adj.'},
    cols.penalties&&{id:'penalty',header:'Penalty'},
    {id:'net',header:'Net Salary'},
    cols.prevMonthAdv&&{id:'opAdv',header:'Op. Advance'},
    cols.currMonthAdv&&{id:'currAdv',header:'Curr Month Adv ('+MONTHS[selMonth]+')'},
    cols.nextMonthAdv&&{id:'nextAdv',header:'Next Month Adv'},
    {id:'closingAdv',header:'Closing Advance'},
    cols.bankDetails&&{id:'bankName',header:'Bank Name'},
    cols.bankDetails&&{id:'accountNo',header:'Account No.'},
    cols.bankDetails&&{id:'ifsc',header:'IFSC Code'},
    {id:'status',header:'Status'},
    {id:'paymentStatus',header:'Payment Status'},
    {id:'mode',header:'Mode'}
  ].filter(Boolean);
  const colIdx={};colDefs.forEach((c,i)=>colIdx[c.id]=i+1);
  const letter=(id)=>excelColLetter(colIdx[id]);
  const has=(id)=>colIdx[id]!=null;

  const headerRow=ws.addRow(colDefs.map(c=>c.header));
  headerRow.eachCell(cell=>{cell.fill=EXCEL_HEADER_FILL;cell.font=EXCEL_HEADER_FONT;cell.border=EXCEL_THIN_BORDER;});

  workings.forEach((e,idx)=>{
    const r=idx+2;
    const m=metaFor(e.id);
    const term=(id,fallback)=>has(id)?letter(id)+r:String(Math.round(fallback)||0);
    const netFormula=term('gross',e.grossAfterLop)+'+'+term('tea',e.tea)+'-'+term('pfEmp',e.pfEmp)+'-'+term('esic',e.esicEmp)+'-'+term('pt',e.ptAmt)+'-'+term('tds',e.tdsAmt)+'-'+term('advAdj',e.advAdj)+'-'+term('penalty',e.penAmt);
    const closingFormula='MAX(0,'+term('opAdv',e.prevAdv)+'+'+term('currAdv',e.currAdv)+'-'+term('advAdj',e.advAdj)+')';
    const rowVals={name:e.name,desig:e.desig,salary:e.gross,totalDays:e.totalDays,gross:e.grossAfterLop,
      net:{formula:netFormula,result:e.net},closingAdv:{formula:closingFormula,result:e.closingAdvance},
      status:m.status,paymentStatus:m.paymentStatus,mode:m.mode||'—'};
    if(has('svcIncAmt'))rowVals.svcIncAmt=e.svcIncAmt;
    if(has('memInc'))rowVals.memInc=e.memIncAmt;
    if(has('prodInc'))rowVals.prodInc=e.prodIncAmt;
    if(has('mgrInc'))rowVals.mgrInc=e.mgrIncAmt;
    if(has('nonPerfPenalty'))rowVals.nonPerfPenalty=e.nonPerfPenalty;
    if(has('totalIncSW'))rowVals.totalIncSW=e.totalIncSW;
    if(has('tea'))rowVals.tea=e.tea;
    if(has('pfEmp'))rowVals.pfEmp=e.pfEmp;
    if(has('esic'))rowVals.esic=e.esicEmp;
    if(has('pt'))rowVals.pt=e.ptAmt;
    if(has('tds'))rowVals.tds=e.tdsAmt;
    if(has('advAdj'))rowVals.advAdj=e.advAdj;
    if(has('penalty'))rowVals.penalty=e.penAmt;
    if(has('opAdv'))rowVals.opAdv=e.prevAdv;
    if(has('currAdv'))rowVals.currAdv=e.currAdv;
    if(has('nextAdv'))rowVals.nextAdv=e.nextAdv;
    if(has('bankName'))rowVals.bankName=e.bankName||'';
    if(has('accountNo'))rowVals.accountNo=e.accountNo||'';
    if(has('ifsc'))rowVals.ifsc=e.ifsc||'';

    const excelRow=ws.addRow(colDefs.map(c=>rowVals[c.id]));
    excelRow.eachCell({includeEmpty:true},(cell,colNum)=>{
      cell.border=EXCEL_THIN_BORDER;
      if(idx%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF4F7FB'}};
      if(colNum>2)cell.alignment={horizontal:'right'};
      if(typeof cell.value==='number'||(cell.value&&cell.value.formula))cell.numFmt='#,##0';
    });
  });

  const lastDataRow=workings.length+1;
  const SUMMABLE=new Set(['salary','gross','svcIncAmt','memInc','prodInc','mgrInc','nonPerfPenalty','totalIncSW','tea','pfEmp','esic','pt','tds','advAdj','penalty','net','opAdv','currAdv','nextAdv','closingAdv']);
  const totalCells=colDefs.map((c,i)=>{
    if(i===0)return 'TOTAL';
    if(SUMMABLE.has(c.id)){const L=excelColLetter(i+1);return{formula:'SUM('+L+'2:'+L+lastDataRow+')'};}
    return '';
  });
  const totalRow=ws.addRow(totalCells);
  totalRow.eachCell((cell,colNum)=>{
    cell.font={bold:true};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEEF3FA'}};
    cell.border={...EXCEL_THIN_BORDER,top:{style:'medium',color:{argb:'FF14335E'}}};
    if(colNum>2)cell.alignment={horizontal:'right'};
    if(typeof cell.value==='number'||(cell.value&&cell.value.formula))cell.numFmt='#,##0';
  });

  ws.columns=colDefs.map(c=>({width:Math.max(12,c.header.length+2)}));
  ws.views=[{state:'frozen',ySplit:1}];
  ws.autoFilter={from:{row:1,column:1},to:{row:1,column:colDefs.length}};

  const buf=await wb.xlsx.writeBuffer();
  return new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

// ── Incentive Working — Excel export with live formulas. Target Multipliers sit in editable
// cells ($B$1/$B$2/$B$3) that every row's Target formulas reference — change a multiplier once in
// Excel and every employee's Target recalculates. Achievement %, Total Target/Achieved, and each
// category's Incentive amount are all formulas too, built from Achieved and Rate cells on the
// same row (edit either and Incentive recalculates). Mgr Incentive stays a value — it comes from
// the separate salon-wide Manager Incentive panel, not a per-row rate.
async function buildIncentiveWorkingExcelBlob({title,incData,targetMult,includeBankDetails,includeOT}){
  await loadExcelJS();
  const wb=new ExcelJS.Workbook();
  wb.creator='SalonOS';wb.created=new Date();
  const ws=wb.addWorksheet((title||'Incentive Working').slice(0,31).replace(/[\\/*?:[\]]/g,''));

  ws.addRow(['Service Multiplier (Times of Salary)',targetMult.svc]);
  ws.addRow(['Membership Multiplier (Times of Salary)',targetMult.mem]);
  ws.addRow(['Product Multiplier (Times of Salary)',targetMult.prod]);
  ws.addRow([]);
  for(let i=1;i<=3;i++){ws.getCell('A'+i).font={bold:true};ws.getCell('B'+i).numFmt='0.0';ws.getCell('B'+i).font={bold:true,color:{argb:'FF14335E'}};}

  const colDefs=[
    {id:'name',header:'Employee'},{id:'desig',header:'Designation'},{id:'salary',header:'Salary'},
    {id:'svcTarget',header:'Svc Target'},{id:'svcAchieved',header:'Svc Achieved'},{id:'svcAchPct',header:'Svc Achievement %'},
    {id:'memTarget',header:'Mem Target'},{id:'memAchieved',header:'Mem Achieved'},{id:'memAchPct',header:'Mem Achievement %'},
    {id:'prodTarget',header:'Prod Target'},{id:'prodAchieved',header:'Prod Achieved'},{id:'prodAchPct',header:'Prod Achievement %'},
    {id:'totalTarget',header:'Total Target'},{id:'totalAchieved',header:'Total Achieved'},{id:'totalTimes',header:'Total Achievement (Times)'},
    {id:'svcRate',header:'Svc Rate %'},{id:'memRate',header:'Mem Rate %'},{id:'prodRate',header:'Prod Rate %'},
    {id:'penalty',header:'Penalty'},
    {id:'advAdj',header:'Advance Adj.'},
    {id:'svcInc',header:'Svc Inc'},{id:'memInc',header:'Mem Inc'},{id:'prodInc',header:'Prod Inc'},{id:'mgrInc',header:'Mgr Inc'},
    ...(includeOT?[{id:'otAmt',header:'OT Inc'}]:[]),
    {id:'totalInc',header:'Total Incentive'},
    ...(includeBankDetails?[{id:'bankName',header:'Bank Name'},{id:'accountNo',header:'Account No.'},{id:'ifsc',header:'IFSC Code'}]:[])
  ];
  const colIdx={};colDefs.forEach((c,i)=>colIdx[c.id]=i+1);
  const L=(id)=>excelColLetter(colIdx[id]);

  const headerRowIdx=5;
  const headerRow=ws.addRow(colDefs.map(c=>c.header));
  headerRow.eachCell(cell=>{cell.fill=EXCEL_HEADER_FILL;cell.font=EXCEL_HEADER_FONT;cell.border=EXCEL_THIN_BORDER;});

  incData.forEach((e,idx)=>{
    const r=headerRowIdx+1+idx;
    const salaryRef=L('salary')+r;
    const svcTargetF='ROUND('+salaryRef+'*$B$1,0)';
    const memTargetF='ROUND('+salaryRef+'*$B$2,0)';
    const prodTargetF='ROUND('+salaryRef+'*$B$3,0)';
    const pct=(achId,tgtId)=>'IF('+L(tgtId)+r+'=0,0,'+L(achId)+r+'/'+L(tgtId)+r+')';
    const rowVals={
      name:e.name,desig:e.desig,salary:e.salary,
      svcTarget:{formula:svcTargetF,result:e.svcTarget},svcAchieved:e.svcActual,svcAchPct:{formula:pct('svcAchieved','svcTarget'),result:(e.svcPct||0)/100},
      memTarget:{formula:memTargetF,result:e.memTarget},memAchieved:e.memActual,memAchPct:{formula:pct('memAchieved','memTarget'),result:(e.memPct||0)/100},
      prodTarget:{formula:prodTargetF,result:e.prodTarget},prodAchieved:e.prodActual,prodAchPct:{formula:pct('prodAchieved','prodTarget'),result:(e.prodPct||0)/100},
      totalTarget:{formula:L('svcTarget')+r+'+'+L('memTarget')+r+'+'+L('prodTarget')+r,result:e.totalTarget},
      totalAchieved:{formula:L('svcAchieved')+r+'+'+L('memAchieved')+r+'+'+L('prodAchieved')+r,result:e.totalActual},
      totalTimes:{formula:'IF('+salaryRef+'=0,0,'+L('totalAchieved')+r+'/'+salaryRef+')',result:e.totalTimesRaw},
      svcRate:e.svcRateUsed,memRate:e.memRateUsed,prodRate:e.prodRateUsed!=null?e.prodRateUsed:'',
      penalty:e.penaltyAmt||0,
      advAdj:e.advAdj||0,
      svcInc:{formula:'ROUND('+L('svcAchieved')+r+'*'+L('svcRate')+r+'/100,0)',result:e.svcIncAmt},
      memInc:{formula:'ROUND('+L('memAchieved')+r+'*'+L('memRate')+r+'/100,0)',result:e.memIncAmt},
      // Rule 2 (flat ₹ amount, irrespective of Product Sale) has no rate to build a formula off
      // of — falls back to the plain figure instead of a formula referencing an empty rate cell.
      prodInc:e.prodRateUsed!=null?{formula:'ROUND('+L('prodAchieved')+r+'*'+L('prodRate')+r+'/100,0)',result:e.prodIncAmt}:e.prodIncAmt,
      mgrInc:e.mgrIncAmt||0,
      ...(includeOT?{otAmt:e.otAmt||0}:{}),
      totalInc:{formula:'MAX(0,'+L('svcInc')+r+'+'+L('memInc')+r+'+'+L('prodInc')+r+'+'+L('mgrInc')+r+(includeOT?'+'+L('otAmt')+r:'')+'-'+L('penalty')+r+'-'+L('advAdj')+r+')',result:e.totalInc},
      bankName:e.bankName||'',accountNo:e.accountNo||'',ifsc:e.ifsc||''
    };
    const excelRow=ws.addRow(colDefs.map(c=>rowVals[c.id]));
    excelRow.eachCell({includeEmpty:true},(cell,colNum)=>{
      cell.border=EXCEL_THIN_BORDER;
      if(idx%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF4F7FB'}};
      if(colNum>2)cell.alignment={horizontal:'right'};
      const id=colDefs[colNum-1].id;
      if(id==='svcAchPct'||id==='memAchPct'||id==='prodAchPct')cell.numFmt='0.0%';
      else if(id==='totalTimes')cell.numFmt='0.00';
      else if(typeof cell.value==='number'||(cell.value&&cell.value.formula))cell.numFmt='#,##0';
    });
  });

  const lastDataRow=headerRowIdx+incData.length;
  const SUMMABLE=new Set(['salary','svcTarget','svcAchieved','memTarget','memAchieved','prodTarget','prodAchieved','totalTarget','totalAchieved','penalty','advAdj','svcInc','memInc','prodInc','mgrInc','totalInc']);
  const totalCells=colDefs.map((c,i)=>{
    if(i===0)return 'TOTAL';
    if(SUMMABLE.has(c.id)){const Lc=excelColLetter(i+1);return{formula:'SUM('+Lc+(headerRowIdx+1)+':'+Lc+lastDataRow+')'};}
    return '';
  });
  const totalRow=ws.addRow(totalCells);
  totalRow.eachCell((cell,colNum)=>{
    cell.font={bold:true};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEEF3FA'}};
    cell.border={...EXCEL_THIN_BORDER,top:{style:'medium',color:{argb:'FF14335E'}}};
    if(colNum>2)cell.alignment={horizontal:'right'};
    if(typeof cell.value==='number'||(cell.value&&cell.value.formula))cell.numFmt='#,##0';
  });

  ws.columns=colDefs.map(c=>({width:Math.max(12,c.header.length+2)}));
  ws.views=[{state:'frozen',ySplit:headerRowIdx}];
  ws.autoFilter={from:{row:headerRowIdx,column:1},to:{row:headerRowIdx,column:colDefs.length}};

  const buf=await wb.xlsx.writeBuffer();
  return new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
// ── Statutory Challans (ESIC / EPF / PT) — Excel export with live formulas. Same visual
// standard as Salary Working/Incentive Working above (navy header, alternating rows, bold total
// row with a medium top border, frozen header + autofilter) so every export in Salary Suite
// looks and behaves the same way. Every per-employee amount column is a live SUM in the total
// row, and the EPF sheet's Employer/EPS/EDLI/Admin split is written as real formulas against the
// Wage Base and combined Employer-PF columns on the same row — change a wage base in the sheet
// and the whole split recalculates, the same way the app itself derives it.
async function buildStatutoryChallanExcelBlob({kind,title,rows,salon,MONTHS,selMonth,selYear}){
  await loadExcelJS();
  const wb=new ExcelJS.Workbook();
  wb.creator='SalonOS';wb.created=new Date();
  const ws=wb.addWorksheet((title||'Challan').slice(0,31).replace(/[\\/*?:[\]]/g,''));

  const infoLines=kind==='esic'
    ?[['Establishment',salon?.name||'—'],['ESIC Code',salon?.esicCode||'—'],['Wage Month',MONTHS[selMonth]+' '+selYear],['Rate','Employee 0.75% + Employer 3.25% of Gross Wages (ceiling ₹21,000)']]
    :kind==='epf'
    ?[['Establishment',salon?.name||'—'],['PF Establishment Code',salon?.pfCode||'—'],['Wage Month',MONTHS[selMonth]+' '+selYear],['Wage Ceiling',pfCeilingLabel(selYear,selMonth)+'/month unless "PF on Actual Basic"']]
    :[['Establishment',salon?.name||'—'],['PT Registration No.',salon?.ptRegNo||'—'],['State',(getSalonRecordById(salon?.id)||{}).state||'—'],['Wage Month',MONTHS[selMonth]+' '+selYear]];
  infoLines.forEach(([k,v])=>{
    const r=ws.addRow([k,v]);
    r.getCell(1).font={bold:true,color:{argb:'FF14335E'}};
  });
  ws.addRow([]);
  const infoRows=infoLines.length+1;

  const colDefs=kind==='esic'
    ?[{id:'no',header:'S.No'},{id:'ipNo',header:'IP Number'},{id:'name',header:'Employee Name'},{id:'days',header:'Days'},{id:'gross',header:'Gross Wages'},{id:'empAmt',header:'Employee (0.75%)'},{id:'erAmt',header:'Employer (3.25%)'},{id:'total',header:'Total'}]
    :kind==='epf'
    ?[{id:'no',header:'S.No'},{id:'uan',header:'UAN'},{id:'name',header:'Employee Name'},{id:'wageBase',header:'Wage Base'},{id:'empAmt',header:'Employee A/C1 (12%)'},{id:'erAmt',header:'Employer A/C1'},{id:'eps',header:'A/C10 EPS (8.33%)'},{id:'edli',header:'A/C21 EDLI (0.5%)'},{id:'admin',header:'A/C2 Admin (0.5%)'}]
    :[{id:'no',header:'S.No'},{id:'name',header:'Employee Name'},{id:'desig',header:'Designation'},{id:'gross',header:'Gross Salary'},{id:'pt',header:'PT Deducted'}];
  const colIdx={};colDefs.forEach((c,i)=>colIdx[c.id]=i+1);
  const L=(id)=>excelColLetter(colIdx[id]);

  const headerRowIdx=infoRows+1;
  const headerRow=ws.addRow(colDefs.map(c=>c.header));
  headerRow.eachCell(cell=>{cell.fill=EXCEL_HEADER_FILL;cell.font=EXCEL_HEADER_FONT;cell.border=EXCEL_THIN_BORDER;cell.alignment={vertical:'middle'};});

  rows.forEach((e,idx)=>{
    const r=headerRowIdx+1+idx;
    let rowVals;
    if(kind==='esic'){
      rowVals={no:idx+1,ipNo:e.esicNumber||'—',name:e.name,days:e.totalDays,gross:e.gross||0,
        empAmt:e.esicEmp,erAmt:e.esicEr,total:{formula:L('empAmt')+r+'+'+L('erAmt')+r,result:e.esicEmp+e.esicEr}};
    }else if(kind==='epf'){
      const capped=pfCappedWage(e.basic,selYear,selMonth,salon&&salon.id),ceil=pfWageCeilingFor(selYear,selMonth);
      const wageBase=e.pfOnActualBasic?(Number(e.basic)||0):capped;
      const eps=Math.round(capped*0.0833);
      rowVals={no:idx+1,uan:e.pfNumber||'—',name:e.name,wageBase,empAmt:e.pfEmp,erAmt:e.pfEr,
        eps:{formula:'MIN(ROUND('+L('wageBase')+r+'*0.0833,0),'+Math.round(ceil*0.0833)+')',result:eps},
        edli:{formula:'MIN(ROUND('+L('wageBase')+r+'*0.005,0),'+Math.round(ceil*0.005)+')',result:Math.round(capped*0.005)},
        admin:{formula:'ROUND('+L('wageBase')+r+'*0.005,0)',result:Math.round(wageBase*0.005)}};
    }else{
      rowVals={no:idx+1,name:e.name,desig:e.desig||'—',gross:e.gross||0,pt:e.ptAmt};
    }
    const excelRow=ws.addRow(colDefs.map(c=>rowVals[c.id]));
    excelRow.eachCell({includeEmpty:true},(cell,colNum)=>{
      cell.border=EXCEL_THIN_BORDER;
      if(idx%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF4F7FB'}};
      if(colNum>=4)cell.alignment={horizontal:'right'};
      if(typeof cell.value==='number'||(cell.value&&cell.value.formula))cell.numFmt='#,##0';
    });
  });

  const lastDataRow=headerRowIdx+rows.length;
  const SUMMABLE=kind==='esic'?['days','gross','empAmt','erAmt','total']:kind==='epf'?['wageBase','empAmt','erAmt','eps','edli','admin']:['gross','pt'];
  const totalCells=colDefs.map((c,i)=>{
    if(i===0)return'TOTAL';
    if(i===1&&kind!=='esic'&&kind!=='epf')return'';
    if(SUMMABLE.includes(c.id)){const cl=excelColLetter(i+1);return{formula:'SUM('+cl+(headerRowIdx+1)+':'+cl+lastDataRow+')'};}
    return'';
  });
  const totalRow=ws.addRow(totalCells);
  totalRow.eachCell((cell,colNum)=>{
    cell.font={bold:true};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEEF3FA'}};
    cell.border={...EXCEL_THIN_BORDER,top:{style:'medium',color:{argb:'FF14335E'}}};
    if(colNum>=4)cell.alignment={horizontal:'right'};
    if(typeof cell.value==='number'||(cell.value&&cell.value.formula))cell.numFmt='#,##0';
  });

  ws.getColumn(1).width=6;
  colDefs.slice(1).forEach((c,i)=>{ws.getColumn(i+2).width=Math.max(14,c.header.length+2);});
  ws.views=[{state:'frozen',ySplit:headerRowIdx}];
  ws.autoFilter={from:{row:headerRowIdx,column:1},to:{row:headerRowIdx,column:colDefs.length}};

  const buf=await wb.xlsx.writeBuffer();
  return new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
const CDN_XLSX_URL='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const CDN_JSPDF_URL='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const CDN_JSPDF_AUTOTABLE_URL='https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
// ── Cash Register OCR — Tesseract.js reads the closing-balance figure straight off an attached
// photo/scan; pdf.js is only needed when the attachment is a PDF (Tesseract can't read PDFs
// directly), to rasterize page 1 to a canvas image first. ──
const CDN_TESSERACT_URL='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
const CDN_PDFJS_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const CDN_PDFJS_WORKER_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
// ── Real PDF as a Blob — built directly from a report's sheetRows (the same array-of-arrays
// already used for Excel), via jsPDF + autoTable. Text-based, not a screenshot: crisper, smaller,
// and searchable/selectable, unlike rendering the page to a canvas and dropping it in as an
// image. The point of building this at all is that a Blob can be handed to navigator.share() or
// downloaded and attached — the print-dialog PDF (still used for on-screen "Save as PDF") never
// exists as a file the browser can pass anywhere, which is exactly why PDF previously had to be
// silently downgraded to Word whenever sending to WhatsApp or Email.
// Indian-style amount in words, e.g. 123456 → "One Lakh Twenty Three Thousand Four Hundred Fifty Six".
function rupeesInWords(n){
  n=Math.round(Math.abs(Number(n)||0));
  if(n===0)return'Zero';
  const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const two=x=>x<20?a[x]:b[Math.floor(x/10)]+(x%10?' '+a[x%10]:'');
  const three=x=>(x>=100?a[Math.floor(x/100)]+' Hundred'+(x%100?' ':''):'')+(x%100?two(x%100):'');
  const parts=[];
  const crore=Math.floor(n/10000000);n%=10000000;
  const lakh=Math.floor(n/100000);n%=100000;
  const thousand=Math.floor(n/1000);n%=1000;
  if(crore)parts.push(three(crore)+' Crore');
  if(lakh)parts.push(two(lakh)+' Lakh');
  if(thousand)parts.push(two(thousand)+' Thousand');
  if(n)parts.push(three(n));
  return parts.join(' ');
}
// ── Branded payslips — one A4 page per employee, built from swWorkingsFor (the exact figures on
// Salary Working, so the two can never disagree), with the outlet's logo and details. ──
async function buildPayslipsPdf(salon,year,month,workings,watermark){
  await loadScript(CDN_JSPDF_URL);
  await loadScript(CDN_JSPDF_AUTOTABLE_URL);
  if(!window.jspdf||!window.jspdf.jsPDF)throw new Error('PDF engine unavailable — check your internet connection.');
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:'p',unit:'mm',format:'a4'});
  const pw=doc.internal.pageSize.getWidth();
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const inr=v=>'Rs. '+Math.round(Number(v)||0).toLocaleString('en-IN');
  const firm=(salon&&(salon.firmName||salon.name))||'SalonOS';
  const brand=salon&&salon.brandName&&salon.brandName!==firm?salon.brandName:'';
  const addr=[salon&&salon.city,salon&&salon.state,salon&&salon.pin].filter(Boolean).join(', ');
  let logo=null;
  try{if(salon&&salon.logo)logo=await resolveAttachmentDataUrl(typeof salon.logo==='string'?salon.logo:salon.logo.dataUrl);}catch(e){}
  const mask=s=>{s=String(s||'');return s.length>4?'XXXX'+s.slice(-4):(s||'—');};
  workings.forEach((w,idx)=>{
    if(idx)doc.addPage();
    // Header band
    doc.setFillColor(20,51,94);doc.rect(0,0,pw,30,'F');
    let tx=12;
    if(logo){try{doc.addImage(logo,'PNG',10,5,20,20,undefined,'FAST');tx=34;}catch(e){}}
    doc.setTextColor(255,255,255);doc.setFont(undefined,'bold');doc.setFontSize(15);doc.text(firm,tx,13);
    doc.setFont(undefined,'normal');doc.setFontSize(8.5);doc.setTextColor(205,218,238);
    doc.text([brand,addr,salon&&salon.gst?'GSTIN: '+salon.gst:''].filter(Boolean).join('  ·  ').slice(0,110),tx,19);
    doc.setTextColor(255,255,255);doc.setFont(undefined,'bold');doc.setFontSize(11);
    doc.text('PAYSLIP — '+MONTHS[month].toUpperCase()+' '+year,pw-12,13,{align:'right'});
    // Employee details
    doc.autoTable({startY:36,theme:'plain',styles:{fontSize:9,cellPadding:1.6},columnStyles:{0:{fontStyle:'bold',cellWidth:34},2:{fontStyle:'bold',cellWidth:34}},
      body:[
        ['Employee',w.name||'—','Employee ID',w.id||'—'],
        ['Designation',w.desig||'—','Date of joining',w.doj?String(w.doj).split('-').reverse().join('/'):'—'],
        ['PAN',w.pan||'—','Bank A/c',mask(w.accountNo)+(w.bankName?' ('+w.bankName+')':'')],
        ['Days payable',String(w.totalDays)+' of '+String(w.daysInMonth),'PF / ESIC No.',[w.pfNumber,w.esicNumber].filter(Boolean).join(' / ')||'—']
      ]});
    // Earnings vs deductions side by side
    const earn=[['Gross salary (for days payable)',inr(w.grossAfterLop)]];
    if(w.tea)earn.push(['Tea allowance',inr(w.tea)]);
    const ded=[];
    if(w.pfEmp)ded.push(['Provident Fund (employee)',inr(w.pfEmp)]);
    if(w.esicEmp)ded.push(['ESIC (employee)',inr(w.esicEmp)]);
    if(w.ptAmt)ded.push(['Professional Tax',inr(w.ptAmt)]);
    if(w.tdsAmt)ded.push(['TDS',inr(w.tdsAmt)]);
    if(w.advAdj)ded.push(['Advance recovery',inr(w.advAdj)]);
    if(w.penAmt)ded.push(['Penalties',inr(w.penAmt)]);
    const totalEarn=(Number(w.grossAfterLop)||0)+(Number(w.tea)||0);
    const totalDed=ded.reduce((s,r)=>s+Number(String(r[1]).replace(/[^\d]/g,'')),0);
    const n=Math.max(earn.length,ded.length,1);
    const body=[];
    for(let i=0;i<n;i++)body.push([(earn[i]||['',''])[0],(earn[i]||['',''])[1],(ded[i]||['',''])[0],(ded[i]||['',''])[1]]);
    body.push([{content:'Total earnings',styles:{fontStyle:'bold'}},{content:inr(totalEarn),styles:{fontStyle:'bold'}},{content:'Total deductions',styles:{fontStyle:'bold'}},{content:inr(totalDed),styles:{fontStyle:'bold'}}]);
    doc.autoTable({startY:doc.lastAutoTable.finalY+6,head:[['Earnings','Amount','Deductions','Amount']],body,theme:'grid',
      headStyles:{fillColor:[235,240,248],textColor:[20,51,94]},styles:{fontSize:9,cellPadding:2.2},columnStyles:{1:{halign:'right'},3:{halign:'right'}}});
    // Net pay
    let y=doc.lastAutoTable.finalY+8;
    doc.setFillColor(232,245,238);doc.roundedRect(12,y,pw-24,20,2,2,'F');
    doc.setTextColor(18,128,92);doc.setFont(undefined,'bold');doc.setFontSize(13);
    doc.text('Net pay: '+inr(w.net),16,y+8.5);
    doc.setFont(undefined,'normal');doc.setFontSize(9);doc.setTextColor(60,70,90);
    doc.text('Rupees '+rupeesInWords(w.net)+' only',16,y+15);
    y+=30;
    doc.setFontSize(8);doc.setTextColor(120,130,150);
    doc.text('This is a computer-generated payslip and does not require a signature.',12,y);
    doc.text('Generated '+new Date().toLocaleString('en-IN')+' · SalonOS',12,y+4.5);
  });
  if(watermark)pdfWatermark(doc,watermark);
  return doc.output('blob');
}
async function exportReportPdfBlob(title,subtitle,sheetRows,opts){
  await loadScript(CDN_JSPDF_URL);
  await loadScript(CDN_JSPDF_AUTOTABLE_URL);
  if(!window.jspdf||!window.jspdf.jsPDF)throw new Error('PDF engine unavailable — check your internet connection.');
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:(opts&&opts.landscape)?'l':'p',unit:'mm',format:'a4'});
  const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
  const drawHeader=()=>{
    doc.setFillColor(20,51,94);doc.rect(0,0,pw,18,'F');
    doc.setTextColor(255,255,255);doc.setFontSize(13);doc.setFont(undefined,'bold');
    doc.text(String(title),8,9);
    doc.setFontSize(8);doc.setFont(undefined,'normal');doc.setTextColor(200,215,235);
    doc.text(((subtitle||'')+(subtitle?' · ':'')+'Generated '+new Date().toLocaleString('en-IN')).slice(0,120),8,14.5);
  };
  drawHeader();
  // Split into separate tables at each blank row. Every report's sheetRows already uses a blank
  // row `[]` as a section separator (e.g. between the main statement and a "Working Notes"
  // appendix with a different column count) — reusing that as the split point means each table
  // renders with ITS OWN column count, matching its own header. Feeding rows of different widths
  // into one autoTable call locked to the first row's width silently drops every cell beyond
  // that count with no error — confirmed by actually parsing the generated PDF's text back out,
  // which is what this fixes.
  const allRows=(sheetRows||[]).filter(r=>Array.isArray(r));
  const blocks=[];
  let current=[];
  allRows.forEach(row=>{
    if(row.length===0){if(current.length)blocks.push(current);current=[];}
    else current.push(row);
  });
  if(current.length)blocks.push(current);

  let y=22;
  blocks.forEach(block=>{
    let rows=block;
    // Peel off a leading title row — single non-empty cell, narrower than what follows it — and
    // draw it as a heading. Repeats in case of consecutive title-like rows. What's left (if
    // anything) becomes the actual table, sized to ITS OWN column count, not the title's.
    while(rows.length>1){
      const first=rows[0];
      const nonEmpty=first.filter(c=>c!==''&&c!=null).length;
      const restMax=Math.max(...rows.slice(1).map(r=>r.length));
      if(nonEmpty===1&&first.length<restMax){
        if(y>ph-20){doc.addPage();drawHeader();y=22;}
        doc.setFontSize(10);doc.setFont(undefined,'bold');doc.setTextColor(20,51,94);
        doc.text(String(first.find(c=>c!==''&&c!=null)),8,y+4);
        doc.setFont(undefined,'normal');doc.setTextColor(0,0,0);
        y+=10;
        rows=rows.slice(1);
      }else break;
    }
    if(rows.length===1&&rows[0].filter(c=>c!==''&&c!=null).length===1){
      // A lone title with no table left in this block (e.g. a heading followed only by a blank line)
      if(y>ph-20){doc.addPage();drawHeader();y=22;}
      doc.setFontSize(10);doc.setFont(undefined,'bold');doc.setTextColor(20,51,94);
      doc.text(String(rows[0].find(c=>c!==''&&c!=null)),8,y+4);
      doc.setFont(undefined,'normal');doc.setTextColor(0,0,0);
      y+=10;
      return;
    }
    const maxCols=Math.max(1,...rows.map(r=>r.length));
    const head=[rows[0].map(c=>c==null?'':c)];
    const body=rows.slice(1).map(row=>{
      const nonEmpty=row.filter(c=>c!==''&&c!=null).length;
      if(nonEmpty===1&&row.length<maxCols){
        return[{content:String(row.find(c=>c!==''&&c!=null)),colSpan:maxCols,
          styles:{fillColor:[219,230,243],textColor:[20,51,94],fontStyle:'bold'}}];
      }
      const padded=row.slice();
      while(padded.length<maxCols)padded.push('');
      return padded.map(c=>c==null?'':c);
    });
    doc.autoTable({
      head,body,startY:y,margin:{top:22,left:8,right:8,bottom:12},
      styles:{fontSize:8,cellPadding:2,overflow:'linebreak'},
      headStyles:{fillColor:[20,51,94],textColor:255,fontStyle:'bold',fontSize:8},
      alternateRowStyles:{fillColor:[244,247,251]},
      didDrawPage:(data)=>{if(data.pageNumber>1)drawHeader();}
    });
    y=doc.lastAutoTable.finalY+8;
  });
  const pageCount=doc.internal.getNumberOfPages();
  for(let i=1;i<=pageCount;i++){
    doc.setPage(i);
    doc.setFontSize(7.5);doc.setTextColor(140,150,165);
    doc.text('SalonOS — Confidential',8,ph-5);
    doc.text('Page '+i+' of '+pageCount,pw-8,ph-5,{align:'right'});
  }
  if(opts&&opts.watermark)pdfWatermark(doc,opts.watermark);
  return doc.output('blob');
}
// Big faint diagonal DRAFT / FINAL across every page of a jsPDF document.
function pdfWatermark(doc,label){
  const text=String(label).toUpperCase(),fin=text==='FINAL';
  const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
  for(let i=1;i<=doc.internal.getNumberOfPages();i++){
    doc.setPage(i);
    try{doc.saveGraphicsState();doc.setGState(new doc.GState({opacity:0.13}));}catch(e){}
    doc.setFont(undefined,'bold');doc.setFontSize(Math.min(pw,ph)/2.2);
    if(fin)doc.setTextColor(22,163,74);else doc.setTextColor(220,38,38);
    doc.text(text,pw/2,ph/2,{align:'center',baseline:'middle',angle:28});
    try{doc.restoreGraphicsState();}catch(e){}
  }
  doc.setTextColor(0,0,0);doc.setFont(undefined,'normal');
}
// Marks an .xlsx as DRAFT / FINAL: red/green sheet tabs, the word printed at the top of every
// page (Excel has no true watermark), and the workbook title.
async function stampExcelBlob(blob,label){
  const text=String(label).toUpperCase(),argb=text==='FINAL'?'FF16A34A':'FFDC2626';
  await loadExcelJS();
  const wb=new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  wb.title=text;wb.subject=text==='FINAL'?'Final':'Draft — not final';
  wb.eachSheet(ws=>{
    ws.properties.tabColor={argb};
    const hdr='&C&"Arial,Bold"&28&K'+argb.slice(2)+text;
    ws.headerFooter={...(ws.headerFooter||{}),oddHeader:hdr,evenHeader:hdr,firstHeader:hdr};
  });
  return new Blob([await wb.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

async function pdfToText(file,say){
  await loadScript(CDN.pdf);
  const lib=window.pdfjsLib;
  if(!lib)throw new Error('PDF engine unavailable');
  lib.GlobalWorkerOptions.workerSrc=CDN.pdfWorker;
  const buf=await readBuf(file);
  const doc=await lib.getDocument({data:buf}).promise;
  let out='';
  for(let p=1;p<=doc.numPages;p++){
    say('Reading page '+p+' of '+doc.numPages);
    const pg=await doc.getPage(p);
    const tc=await pg.getTextContent();
    let last=null,line='';
    tc.items.forEach(it=>{
      const y=it.transform[5];
      if(last!==null&&Math.abs(y-last)>3){out+=line.trim()+'\n';line=''}
      line+=it.str+' ';last=y;
    });
    out+=line.trim()+'\n';
  }
  return out;
}
async function docxToText(file,say){
  say('Unpacking the document');
  await loadScript(CDN.zip);
  if(!window.JSZip)throw new Error('DOCX engine unavailable');
  const zip=await window.JSZip.loadAsync(await readBuf(file));
  const f=zip.file('word/document.xml');
  if(!f)throw new Error('This does not look like a .docx file');
  const xml=await f.async('string');
  return xml.replace(/<\/w:p>/g,'\n').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/[ \t]+/g,' ');
}
// Legacy .doc files (pre-2007 binary "Compound File" format) have no XML part to unzip like
// .docx does, and a full OLE parser is overkill just to pull GSTIN/dates/amounts out. Word
// text inside them is stored as either plain single-byte characters or UTF-16LE — reading it
// as the wrong one turns real words into "T a x a b l e" (letters separated by stray spaces),
// which breaks every label match in parseInvoice. So this tries both layouts and keeps whichever
// one reads more like real words.
function legacyDocToText(buf){
  const singleByte=Array.from(buf).map(b=>(b>31&&b<127)||b===10?String.fromCharCode(b):' ').join('').replace(/[ \t]{3,}/g,'\n');
  let wide='';
  for(let i=0;i+1<buf.length;i+=2){
    const lo=buf[i],hi=buf[i+1];
    wide+=(hi===0&&lo>31&&lo<127)?String.fromCharCode(lo):(hi===0&&lo===10?'\n':' ');
  }
  wide=wide.replace(/[ \t]{3,}/g,'\n');
  const readability=(t)=>(t.match(/\b(invoice|total|amount|gst|tax|taxable|date|vendor|bill|no|rs|inr)\b/gi)||[]).length+(t.match(/[A-Za-z]{4,}/g)||[]).length*0.1;
  return readability(wide)>readability(singleByte)?wide:singleByte;
}
async function imgToText(file,say){
  say('Loading the OCR engine (first run downloads ~5 MB)');
  await loadScript(CDN.ocr);
  if(!window.Tesseract)throw new Error('OCR engine unavailable');
  const r=await window.Tesseract.recognize(file,'eng',{logger:m=>{
    if(m.status==='recognizing text')say('Reading the scan — '+Math.round(m.progress*100)+'%');
    else if(m.status)say(m.status.charAt(0).toUpperCase()+m.status.slice(1));
  }});
  return r.data.text;
}

/* --- field parsing --- */
function gstValid(g){
  if(!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(g))return false;
  const CS='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';let sum=0;
  for(let i=0;i<14;i++){const v=CS.indexOf(g[i]);let p=v*(i%2===0?1:2);sum+=Math.floor(p/36)+(p%36)}
  return CS[(36-(sum%36))%36]===g[14];
}
const MON={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
// Converts a Date OBJECT (not a string — see toISO() below for that) to YYYY-MM-DD using its
// LOCAL date parts. Deliberately not .toISOString().slice(0,10): that converts via UTC first,
// and a Date built with no time component defaults to local midnight — for any timezone ahead of
// UTC (India is UTC+5:30), local midnight is always still the PREVIOUS day in UTC, silently
// shifting the date back by one. This was the exact cause of "View up to date" showing May 30
// instead of May 31 when a previous month was selected, and of an outlet payment reminder date
// being one day early — both fixed by using this instead.
function localDateToISO(d){
  if(!(d instanceof Date)||isNaN(d))return '';
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function toISO(s){
  if(!s)return '';
  s=String(s).trim();
  // Excel serial date number (e.g. "46019") — happens when a date-formatted cell gets exported
  // to CSV without its formatting, leaving the raw internal day-count instead of a date string.
  // Serial 1 = 1 Jan 1900; the +1 covers Excel's (incorrect) treatment of 1900 as a leap year.
  if(/^\d{4,6}$/.test(s)){
    const n=Number(s);
    if(n>=1&&n<=60000){
      const ms=Math.round((n-25569)*86400*1000);
      const d=new Date(ms);
      if(!isNaN(d))return d.toISOString().slice(0,10);
    }
  }
  let m=s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if(m)return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0');
  m=s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/);
  if(m){let y=m[3].length===2?'20'+m[3]:m[3];return y+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0')}
  m=s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]*(\d{2,4})$/);
  if(m){const mm=MON[m[2].slice(0,3).toLowerCase()];if(mm){let y=m[3].length===2?'20'+m[3]:m[3];return y+'-'+String(mm).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0')}}
  return '';
}
// Display formatter — every date this app stores is ISO (YYYY-MM-DD); this is the one place that
// turns it into DD/MM/YYYY for showing on screen, so every screen displays dates the same way.
function fmtDMY(iso){
  if(!iso)return '—';
  const norm=toISO(iso)||iso; // tolerate an unconverted legacy value (e.g. a stray serial number) by normalizing it on the fly
  const m=String(norm).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return iso;
  return m[3]+'/'+m[2]+'/'+m[1];
}
const numOf=(s)=>{const n=parseFloat(String(s).replace(/[₹,\s]/g,''));return isNaN(n)?null:n};

function parseInvoice(text,vendors){
  const T=text.replace(/\r/g,'');
  const lines=T.split('\n').map(l=>l.trim()).filter(Boolean);
  const flat=T.replace(/\n/g,' ');
  const R={conf:{},raw:T};

  // GSTIN — checksum-verified where possible
  const gs=(flat.toUpperCase().match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]/g)||[]);
  const valid=gs.filter(gstValid);
  if(valid.length){R.gst=valid[0];R.conf.gst='high'}
  else if(gs.length){R.gst=gs[0];R.conf.gst='low'}

  // PAN
  const pan=(flat.toUpperCase().match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g)||[])[0];
  if(pan){R.pan=pan;R.conf.pan=R.gst&&R.gst.slice(2,12)===pan?'high':'medium'}

  // invoice number
  const invPats=[
    /\b(?:[il1]nvo[il1]ce|invoice|bill|voucher|inv)\s*(?:no\.?|number|#|nos\.?)\s*[:\-.]?\s*([A-Za-z0-9][A-Za-z0-9\/\-]{2,24})/i,
    /\b(?:invoice|bill)\s*[#:]\s*([A-Za-z0-9][A-Za-z0-9\/\-]{2,24})/i
  ];
  for(const pat of invPats){
    const mm=flat.match(pat);
    if(mm&&/\d/.test(mm[1])&&!/^(date|no|number)$/i.test(mm[1])){
      R.invoiceNo=mm[1].replace(/[.,;:]+$/,'');R.conf.invoiceNo='high';break;
    }
  }

  // dates
  const dpat=/(\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}|\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\d{1,2}[-\s][A-Za-z]{3,9}[-\s,]*\d{2,4})/;
  let m=flat.match(new RegExp('(?:invoice\\s*date|bill\\s*date|dated|date)\\s*[:.-]?\\s*'+dpat.source,'i'));
  if(m){R.invoiceDate=toISO(m[1]);R.conf.invoiceDate='high'}
  else{const any=flat.match(dpat);if(any){R.invoiceDate=toISO(any[1]);R.conf.invoiceDate='low'}}
  m=flat.match(new RegExp('(?:due\\s*date|payment\\s*due|due\\s*on)\\s*[:.-]?\\s*'+dpat.source,'i'));
  if(m){R.dueDate=toISO(m[1]);R.conf.dueDate='high'}

  // amounts
  // amounts are read from the labelled LINE — the last number on it, never a percentage
  const amtAfter=(labels)=>{
    for(const L of labels){
      const re=new RegExp('\\b'+L,'i');
      for(let li=0;li<lines.length;li++){
        const ln=lines[li];
        if(!re.test(ln))continue;
        const toks=ln.match(/\d[\d,]*(?:\.\d{1,2})?(?!\s*%)/g)||[];
        const vals=toks.map(numOf).filter(v=>v!==null&&v>0);
        if(vals.length)return vals[vals.length-1];
        // Label matched but no number on that same line — common in table-based invoices
        // where a PDF's text layer puts the "Taxable Value" column header and its figure
        // on separate lines. Check the next couple of lines for the first standalone number.
        for(let lj=li+1;lj<Math.min(lines.length,li+3);lj++){
          const toks2=lines[lj].match(/\d[\d,]*(?:\.\d{1,2})?(?!\s*%)/g)||[];
          const vals2=toks2.map(numOf).filter(v=>v!==null&&v>0);
          if(vals2.length)return vals2[0];
        }
      }
    }
    return null;
  };
  const total=amtAfter(['grand\\s*total','total\\s*amount\\s*(?:payable|due)?','amount\\s*payable','net\\s*payable','invoice\\s*total','bill\\s*total','total\\s*invoice\\s*value','round\\s*off\\s*total','net\\s*amount','total\\b','amount\\s*due','amount\\b']);
  if(total!==null){R.amount=total;R.conf.amount='high'}
  else{
    const nums=(flat.match(/(?:₹|rs\.?|inr)\s?[0-9][0-9,]*(?:\.[0-9]{1,2})?/gi)||[]).map(numOf).filter(v=>v!==null);
    if(nums.length){R.amount=Math.max.apply(null,nums);R.conf.amount='low'}
  }
  const tv=amtAfter(['total\\s*taxable\\s*value','taxable\\s*(?:value|amount)','assessable\\s*value','sub\\s*total','subtotal']);
  if(tv!==null)R.taxable=tv;
  const cg=amtAfter(['cgst']),sg=amtAfter(['sgst','utgst']),ig=amtAfter(['igst']);
  if(cg!==null)R.cgst=cg;if(sg!==null)R.sgst=sg;if(ig!==null)R.igst=ig;

  // contact
  const em=flat.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/);if(em)R.email=em[0];
  const ph=flat.match(/(?:\+91[\s-]?)?[6-9]\d{9}\b/);if(ph)R.phone=ph[0].replace(/^\+91[\s-]?/,'');

  // vendor name — the line above/at the GSTIN, else the first meaningful line
  const skip=/^(tax\s*invoice|invoice|bill|gst|gstin|original|duplicate|proforma|debit|credit|to\b|ship\s*to|bill\s*to)/i;
  const ADDR=/\b(road|rd\.?|nagar|plot|sector|street|st\.?|marg|lane|floor|block|phase|colony|near|opp\.?|po\b|dist\b)\b|\b\d{6}\b|^\d/i;
  const CORP=/\b(pvt|private|ltd|limited|llp|inc|corp|company|co\.?|enterprises?|traders?|services?|solutions?|industries|distributors?|agencies|associates|suppliers?|&\s*co)\b/i;
  const scoreName=(c)=>{
    if(!c||c.length<5||skip.test(c)||!/[A-Za-z]{4}/.test(c))return -99;
    let sc=0;
    if(CORP.test(c))sc+=5;
    if(ADDR.test(c))sc-=6;
    if(/\d[\d,]*\.\d{2}|%/.test(c))sc-=8;      // an amount line, not a name
    if(c===c.toUpperCase())sc+=1;
    if(c.length>60)sc-=3;
    if(/[@]|www\.|http/i.test(c))sc-=4;
    return sc;
  };
  const cands=[];
  if(R.gst){
    const gi=lines.findIndex(l=>l.toUpperCase().includes(R.gst));
    for(let i=Math.max(0,gi-5);i<=gi;i++)cands.push(lines[i]);
  }
  lines.slice(0,6).forEach(l=>cands.push(l));
  let best=null,bestScore=-1;
  cands.filter(Boolean).forEach(l=>{
    const c=l.replace(/gstin.*/i,'').replace(/[:,\-]+$/,'').trim();
    const sc=scoreName(c);
    if(sc>bestScore){bestScore=sc;best=c}
  });
  if(best){R.vendorName=best;R.conf.vendorName=bestScore>=5?'medium':'low'}

  // match an existing vendor
  const norm=(x)=>String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  let hit=R.gst?vendors.find(v=>norm(v.gst)===norm(R.gst)):null;
  if(hit)R.matchBy='GSTIN';
  if(!hit&&R.vendorName){
    const n=norm(R.vendorName);
    hit=vendors.find(v=>{const vn=norm(v.name);return vn&&(vn===n||(n.length>5&&(n.includes(vn)||vn.includes(n))))});
    if(hit)R.matchBy='name';
  }
  if(hit)R.vendorId=hit.id;
  return R;
}

/* --- UI --- */
const CONF_BADGE={high:['badge-green','Verified'],medium:['badge-amber','Likely'],low:['badge-red','Check this'],ai:['badge-purple','AI']};
// ── AI bill reading (the "ai" cloud function, using the AI key(s) from Master Settings → AI
// Assistant). Returns the same shape parseInvoice gives, or null when AI isn't set up — callers
// then fall back to reading the bill in the browser. Throws on a real AI error.
const AI_BILL_CATEGORIES=['Purchase of Cosmetic','Housekeeping','Equipment','Utilities','Rent','DG Rent','Drycleaning Expenses','Professional Fee','Staff Room Rent','Royalty','Electricity Expenses','Uniform Expenses','Telephone & Internet Expenses','Maintenance Expenses','Marketing','Fixed Assets','Food & Raw Material Purchase','Liquor Purchase','Packaging Material','Gas / LPG','Pest Control','Licences & Fees','Other'];
// Any other AI action (automation phase 4: tag_bank, explain_pnl, ask). Resolves with the answer;
// throws a readable error, or one with .notConfigured when no AI key has been saved yet.
async function aiCall(action,payload){
  if(!CLOUD_SYNC_ENABLED){const e=new Error('AI needs the cloud version of SalonOS.');e.notConfigured=true;throw e;}
  const supa=await getSupabaseClient();
  const{data,error}=await supa.functions.invoke('ai',{body:{...payload,action}});
  if(error){let msg=error.message||'AI request failed';try{const b=error.context&&await error.context.json();if(b&&b.error)msg=b.error;}catch(e){}throw new Error(msg);}
  if(!data||data.notConfigured){const e=new Error((data&&data.error)||'AI isn’t set up yet — a Super Admin can add the key in Master Settings → AI Assistant.');e.notConfigured=true;throw e;}
  if(data.error)throw new Error(data.error);
  return data;
}
async function aiReadBill(file,vendors){
  if(!CLOUD_SYNC_ENABLED)return null;
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  const mediaType=ext==='pdf'?'application/pdf':ext==='png'?'image/png':ext==='webp'?'image/webp':(ext==='jpg'||ext==='jpeg')?'image/jpeg':'';
  if(!mediaType||file.size>8*1024*1024)return null;
  const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=()=>rej(new Error('Could not read the file'));r.readAsDataURL(file);});
  const supa=await getSupabaseClient();
  const{data,error}=await supa.functions.invoke('ai',{body:{action:'read_bill',file:b64,mediaType,categories:AI_BILL_CATEGORIES}});
  if(error){let msg=error.message||'AI could not read the bill';try{const b=error.context&&await error.context.json();if(b&&b.error)msg=b.error;}catch(e){}throw new Error(msg);}
  if(!data||data.notConfigured)return null;
  if(data.error)throw new Error(data.error);
  return aiBillToIntake(data,vendors);
}
// The ai function's read_bill answer → the fields InvoiceIntake reviews (also used for bills that
// arrived on WhatsApp, which the server has already read).
function billMonthsFromDates(start,end){
  const re=/^(\d{4})-(\d{2})-(\d{2})$/;const a=re.exec(start||''),b=re.exec(end||'');
  if(!a||!b)return null;
  const s=new Date(+a[1],+a[2]-1,+a[3]),e=new Date(+b[1],+b[2]-1,+b[3]);
  const days=Math.round((e-s)/864e5)+1;if(!(days>=20&&days<=400))return null;
  const n=Math.max(1,Math.round(days/30.44));
  const m=new Date(e.getFullYear(),e.getMonth(),e.getDate()-15),last=m.getFullYear()*12+m.getMonth(),first=last-n+1;
  const ym=i=>Math.floor(i/12)+'-'+String(i%12+1).padStart(2,'0');
  return{from:ym(first),to:ym(last),months:n};
}
function aiBillToIntake(data,vendors){
  const R={conf:{},raw:'Read by AI ('+(data.provider?data.provider+' · ':'')+(data.model||'')+').'+(data.notes?'\nNotes from the AI: '+data.notes:'')+'\n\n'+JSON.stringify(data,null,2)};
  const put=(k,v)=>{if(v!==''&&v!=null&&!(typeof v==='number'&&v===0)){R[k]=v;R.conf[k]='ai';}};
  put('vendorName',String(data.supplierName||'').trim());put('gst',String(data.supplierGstin||'').toUpperCase().replace(/\s/g,''));
  put('phone',data.supplierPhone);put('email',data.supplierEmail);put('invoiceNo',data.invoiceNo);
  put('invoiceDate',/^\d{4}-\d{2}-\d{2}$/.test(data.invoiceDate)?data.invoiceDate:'');put('dueDate',/^\d{4}-\d{2}-\d{2}$/.test(data.dueDate)?data.dueDate:'');
  ['taxable','igst','cgst','sgst','freight','roundOff'].forEach(k=>put(k,Number(data[k])||0));
  put('amount',Number(data.total)||0);put('desc',data.description);
  if(/^\d{4}-\d{2}$/.test(data.periodFrom||''))R.periodFrom=data.periodFrom;if(/^\d{4}-\d{2}$/.test(data.periodTo||''))R.periodTo=data.periodTo;
  // A printed billing period (e.g. 12/07/2026 – 11/09/2026) decides the months: as many as the days
  // make up (62 days → 2), ending in the month where the period mostly falls (end date − 15 days).
  const pm=billMonthsFromDates(data.periodStartDate,data.periodEndDate);
  if(pm){R.periodFrom=pm.from;R.periodTo=pm.to;R.periodDates=data.periodStartDate+' – '+data.periodEndDate;}
  R.docNature=data.docNature||'Tax Invoice';
  if(R.gst&&typeof gstValid==='function'&&gstValid(R.gst))R.conf.gst='high';
  R.aiCategory=data.category||'';R.aiNotes=data.notes||'';
  // Match an existing vendor — same rule as parseInvoice: GSTIN first, then name.
  const norm=(x)=>String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  let hit=R.gst?vendors.find(v=>norm(v.gst)&&norm(v.gst)===norm(R.gst)):null;
  if(hit)R.matchBy='GSTIN';
  if(!hit&&R.vendorName){const n=norm(R.vendorName);hit=vendors.find(v=>{const vn=norm(v.name);return vn&&(vn===n||(n.length>5&&(n.includes(vn)||vn.includes(n))));});if(hit)R.matchBy='name';}
  if(hit)R.vendorId=hit.id;
  return R;
}
const OK_EXT=['pdf','docx','doc','jpg','jpeg','png','webp'];