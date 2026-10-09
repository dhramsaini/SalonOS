

// initial (optional): {ai, attachment} — a bill already read on the server (WhatsApp inbox); opens
// straight on the review step with that stored file attached.
function InvoiceIntake({vendors,salonId,onUse,onManual,onClose,initial}){
  const {toast}=useToast();
  const fromInitial=()=>{
    if(!initial)return null;
    const d=initial.ai?aiBillToIntake(initial.ai,vendors):{conf:{},raw:'Not read automatically — enter the details.',docNature:'Tax Invoice'};
    d.fileName=initial.attachment&&initial.attachment.name;
    d.bookingDate=d.invoiceDate||'';
    d.category=d.vendorId?(((vendors.find(v=>v.id===d.vendorId)||{}).cat)||d.aiCategory||''):(d.aiCategory||'');
    if(d.amount)d.amount=Math.round(Number(d.amount));
    return d;
  };
  const [stage,setStage]=useState(initial?'review':'pick');   // pick | busy | review | error
  const [msg,setMsg]=useState('');
  const [file,setFile]=useState(null);
  const [data,setData]=useState(fromInitial);
  const [err,setErr]=useState('');
  const [showRaw,setShowRaw]=useState(false);
  const [drag,setDrag]=useState(false);
  const [newVendor,setNewVendor]=useState(()=>{const d=fromInitial();return !(d&&d.vendorId);});

  const run=async(f)=>{
    const ext=(f.name.split('.').pop()||'').toLowerCase();
    if(OK_EXT.indexOf(ext)<0){setErr('“'+f.name+'” is not a supported format. Attach a PDF, Word file or photo of the bill.');setStage('error');return}
    if(f.size>20*1024*1024){setErr('That file is '+(f.size/1048576).toFixed(1)+' MB. Please keep attachments under 20 MB.');setStage('error');return}
    setFile(f);setStage('busy');setErr('');
    // AI first (when a Super Admin has set it up); the in-browser reader below is the fallback.
    let aiNote='';
    try{
      setMsg('Reading the bill with AI');
      const ai=await aiReadBill(f,vendors);
      if(ai){
        ai.fileName=f.name;
        ai.bookingDate=ai.invoiceDate||'';
        ai.category=ai.vendorId?(((vendors.find(v=>v.id===ai.vendorId)||{}).cat)||ai.aiCategory):ai.aiCategory;
        if(ai.amount)ai.amount=Math.round(Number(ai.amount));
        setData(ai);setNewVendor(!ai.vendorId);setStage('review');
        toast((ai.vendorId?'Read by AI · matched to '+vendors.find(v=>v.id===ai.vendorId).name:'Read by AI — no vendor match, review below')+(ai.aiNotes?' · note: '+ai.aiNotes:''),ai.vendorId?'success':'warning');
        return;
      }
    }catch(e){aiNote='AI could not read it ('+(e.message||'error')+') — reading it here instead. ';}
    try{
      if(aiNote)setMsg(aiNote);
      let text='';
      if(ext==='pdf'){
        setMsg('Opening the PDF');
        text=await pdfToText(f,setMsg);
        if(text.replace(/\s/g,'').length<40){setMsg('No text layer found — running OCR on the scan');text=await imgToText(f,setMsg)}
      }else if(ext==='docx'){text=await docxToText(f,setMsg)}
      else if(ext==='doc'){
        setMsg('Reading legacy Word file');
        const buf=new Uint8Array(await readBuf(f));
        text=legacyDocToText(buf);
      }else{text=await imgToText(f,setMsg)}
      if(!text||text.replace(/\s/g,'').length<20)throw new Error('Could not read any text from this file. Try a clearer scan, or enter the details manually.');
      setMsg('Matching against your vendor master');
      const parsed=parseInvoice(text,vendors);parsed.fileName=f.name;
      parsed.docNature=parsed.docNature||'Tax Invoice';
      parsed.bookingDate=parsed.invoiceDate||'';
      parsed.category=parsed.vendorId?((vendors.find(v=>v.id===parsed.vendorId)||{}).cat||''):'';
      if(parsed.amount)parsed.amount=Math.round(Number(parsed.amount));
      setData(parsed);setNewVendor(!parsed.vendorId);setStage('review');
      toast(parsed.vendorId?'Matched to '+vendors.find(v=>v.id===parsed.vendorId).name:'Details read — no vendor match, review below',parsed.vendorId?'success':'warning');
    }catch(e){setErr(e.message||'Extraction failed');setStage('error')}
  };
  const pick=(e)=>{const f=e.target.files&&e.target.files[0];if(f)run(f)};
  const drop=(e)=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files&&e.dataTransfer.files[0];if(f)run(f)};
  const set=(k,v)=>setData(d=>({...d,[k]:v,conf:{...d.conf,[k]:'edited'}}));

  const field=(label,k,type)=>{
    const c=data.conf[k];
    const b=c==='edited'?['badge-blue','Edited']:CONF_BADGE[c];
    return h('div',{className:'form-group',key:k},
      h('label',{style:{display:'flex',alignItems:'center',gap:8}},label,
        b?h('span',{className:'badge '+b[0],style:{fontSize:9}},b[1]):null),
      h('input',{className:'form-control',type:type||'text',value:data[k]||'',
        onChange:e=>set(k,type==='number'?e.target.value:e.target.value)}));
  };

  const use=()=>{
    if(!data.amount)return toast('Enter the '+(data.docNature==='Performa Invoice'?'PI':'invoice')+' amount before continuing','error');
    if(!data.category)return toast('Select a Category before continuing','error');
    onUse({...data,amount:Math.round(Number(data.amount)||0),_file:file,_attachment:initial?initial.attachment:null},newVendor);
  };
  const isPI=data&&data.docNature==='Performa Invoice';

  return h('div',{className:'modal-overlay',onClick:onClose},
    h('div',{className:'modal',style:{width:stage==='review'?720:560},onClick:e=>e.stopPropagation()},
      h('div',{className:'modal-title'},'Add invoice — attach the bill first'),

      stage==='pick'&&h('div',null,
        h('div',{className:'dropzone'+(drag?' on':''),
          onDragOver:e=>{e.preventDefault();setDrag(true)},onDragLeave:()=>setDrag(false),onDrop:drop,
          onClick:()=>document.getElementById('intake-file').click()},
          h('div',{className:'dz-icon'},'📄'),
          h('div',{className:'dz-title'},'Drop the vendor bill here'),
          h('div',{className:'dz-sub'},'or click to browse — PDF, Word (.doc / .docx) or a photo (JPG, PNG)'),
          h('input',{type:'file',id:'intake-file',style:{display:'none'},
            accept:'.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp',onChange:pick})),
        // Phones: open the camera straight away and read the photo.
        h('div',{style:{display:'flex',justifyContent:'center',marginTop:10}},
          h('input',{type:'file',id:'intake-camera',accept:'image/*',capture:'environment',style:{display:'none'},onChange:pick}),
          h('button',{type:'button',className:'btn btn-primary',onClick:()=>document.getElementById('intake-camera').click()},'📷 Take a photo of the bill')),
        h('div',{className:'help-note',style:{marginTop:14}},
          'The bill is read in your browser — nothing is uploaded anywhere. GSTIN, invoice number, date and amount are picked up automatically and matched against your vendor master. Scanned bills and photos go through OCR, which takes a few seconds longer.'),
        h('div',{className:'modal-actions'},
          h('button',{className:'btn btn-ghost',onClick:onManual},'Skip — enter manually'),
          h('button',{className:'btn btn-ghost',onClick:onClose},'Cancel'))),

      stage==='busy'&&h('div',{style:{padding:'26px 0',textAlign:'center'}},
        h('div',{className:'spinner'}),
        h('div',{style:{fontSize:13.5,color:'var(--text)',marginTop:16}},msg||'Working…'),
        h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},file?file.name:''),
        h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Cancel'))),

      stage==='error'&&h('div',null,
        h('div',{className:'empty-state'},h('div',{className:'empty-icon'},'⚠'),
          h('div',{className:'empty-title'},'Could not read that file'),
          h('div',{className:'empty-sub'},err)),
        h('div',{className:'modal-actions'},
          h('button',{className:'btn btn-ghost',onClick:()=>{setStage('pick');setErr('')}},'Try another file'),
          h('button',{className:'btn btn-primary',onClick:onManual},'Enter manually'))),

      stage==='review'&&data&&h('div',null,
        h('div',{className:'intake-match '+(data.vendorId?'ok':'new')},
          h('div',{style:{fontSize:11,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--text3)',marginBottom:5}},
            data.vendorId?'Matched by '+data.matchBy:'No vendor match'),
          h('div',{style:{fontSize:15,color:'var(--text)',fontWeight:600}},
            data.vendorId?vendors.find(v=>v.id===data.vendorId).name:(data.vendorName||'Unknown supplier')),
          h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:3}},
            data.gst?'GSTIN '+data.gst+(data.conf.gst==='high'?' · checksum valid':' · checksum failed, verify'):'No GSTIN found on the bill'),
          !data.vendorId&&h('label',{className:'gate-remember',style:{marginTop:12,marginBottom:0}},
            h('input',{type:'checkbox',checked:newVendor,onChange:e=>setNewVendor(e.target.checked)}),
            h('div',null,h('div',{className:'t'},'Add this supplier to the vendor master'),
              h('div',{className:'s'},'Creates a vendor record with the name, GSTIN and contact read from this bill.')))),
        h('div',{className:'form-row cols2'},field('Supplier name','vendorName'),field('GSTIN','gst')),
        h('div',{className:'form-row cols3'},
          h('div',{className:'form-group',key:'docNature'},
            h('label',null,'Doc Nature'),
            h('select',{className:'form-control',value:data.docNature||'Tax Invoice',onChange:e=>set('docNature',e.target.value)},
              ['Tax Invoice','Invoice','Performa Invoice'].map(o=>h('option',{key:o,value:o},o)))
          ),
          field(isPI?'PI no.':'Invoice no.','invoiceNo'),
          field(isPI?'PI date':'Invoice date','invoiceDate','date')
        ),
        h('div',{className:'form-row cols3'},
          field('Booking date','bookingDate','date'),field('Due date','dueDate','date'),
          h('div',{className:'form-group',key:'category'},
            h('label',null,'Category *'),
            h('select',{className:'form-control',value:data.category||'',onChange:e=>set('category',e.target.value)},
              h('option',{value:''},'— Select Category —'),
              withBizCategories(['Purchase of Cosmetic','Housekeeping','Equipment','Utilities','Rent','DG Rent','Drycleaning Expenses','Professional Fee','Staff Room Rent','Royalty','Electricity Expenses','Uniform Expenses','Telephone & Internet Expenses','Maintenance Expenses','Marketing','Other'],salonId).map(c=>h('option',{key:c,value:c},c)))
          )
        ),
        h('div',{className:'form-row cols3'},field('Taxable value','taxable','number'),field('IGST','igst','number'),field('CGST','cgst','number')),
        h('div',{className:'form-row cols3'},field('SGST','sgst','number'),field('Freight','freight','number'),field('Round off','roundOff','number')),
        h('div',{className:'form-row cols3'},field((isPI?'PI total':'Invoice total')+' ₹','amount','number'),field('Phone','phone'),field('Email','email')),
        data.aiNotes&&h('div',{className:'help-note',style:{borderLeft:'3px solid var(--orange)',marginBottom:12}},'Note from the AI: '+data.aiNotes),
        (function(){
          const parts=(Number(data.taxable)||0)+(Number(data.cgst)||0)+(Number(data.sgst)||0)+(Number(data.igst)||0)+(Number(data.freight)||0)+(Number(data.roundOff)||0);
          const tot=Number(data.amount)||0;
          if(!data.taxable||!tot)return null;
          const diff=Math.abs(parts-tot);
          return h('div',{className:'help-note',style:{borderLeft:'3px solid '+(diff<=2?'var(--green)':'var(--orange)'),marginBottom:12}},
            diff<=2?'Taxable value plus GST and round off equals the '+(isPI?'PI':'invoice')+' total — the bill ties.'
                   :'Taxable value plus GST and round off comes to ₹'+Math.round(parts).toLocaleString('en-IN')+', but the total reads ₹'+Math.round(tot).toLocaleString('en-IN')+'. Difference of ₹'+Math.round(diff).toLocaleString('en-IN')+' — check for freight or a missed line.');
        })(),
        h('div',{style:{marginTop:6}},
          h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setShowRaw(!showRaw)},showRaw?'Hide extracted text':'Show extracted text'),
          showRaw&&h('pre',{className:'rawbox'},data.raw.slice(0,4000))),
        h('div',{className:'modal-actions'},
          h('button',{className:'btn btn-ghost',onClick:()=>setStage('pick')},'Attach a different file'),
          h('button',{className:'btn btn-primary',onClick:use},'Use these details')))
    ));
}

// Every sheet available under an outlet, and the icon/label shown for it. Module-level (not
// recreated per-render) since it's pure static data — also lets the permission-redirect effect
// in App() reference it safely before the logged-out early return, which a hook can't do with a
// same-named local const declared after that return.
// ── Import Center — a single, professional-looking landing page for every template download
// and data import in the app, instead of each one being scattered inside its own working sheet.
// The actual upload/parsing logic stays where it belongs (each sheet already knows how to
// validate and reconcile its own import against its own data), so this is a directory + one-
// click jump to the right screen, not a duplicate of six different bespoke import pipelines.
function ImportCenter({salon,onNavTab}={}){
  const CARDS=[
    {icon:'🧑‍💼',title:'Employee / Staff Master Import',desc:'Bulk-add employees straight into Master Salary — download the template, fill it in, then upload it from Master Salary.',tab:'master-salary',cta:'Go to Master Salary'},
    {icon:'🏭',title:'Vendor Invoice Import',desc:'Bulk-import vendor invoices with amounts, dates, and categories into Vendor Sheet.',tab:'vendors',cta:'Go to Vendor Sheet'},
    {icon:'🏆',title:'Membership / Incentive Rule C Import',desc:'Bulk-load target multipliers and incentive rates for Rule C into Incentive Working.',tab:'incentive-working',cta:'Go to Incentive Working'},
    {icon:'📥',title:'Collection Reco Import',desc:'Import daily Cash/Card/UPI/Wallet/District/Luzo/Online collection figures against Cradlee for reconciliation.',tab:'collection',cta:'Go to Collection Reco'},
    {icon:'🏦',title:'Bank Statement Import',desc:'Import a bank statement (per-bank column template) for classification, reconciliation, and Settle Pay.',tab:'bank-statement',cta:'Go to Bank Statement'},
    {icon:'📝',title:'Staff Work Report Import',desc:'Bulk-import daily service/target achievement figures used to compute Daily Incentive.',tab:'incentive-working',cta:'Go to Incentive Working'},
    {icon:'🗂️',title:'Previous Months P&L Import',desc:'Bulk-load historical monthly P&L figures for months entered before this tool was in use.',tab:'previous-pnl',cta:'Go to Previous Months P&L'},
  ];
  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,React.createElement('div',{className:'page-title'},'Import Center'),
        React.createElement('div',{className:'page-sub'},'Every template download and bulk import in one place — '+(salon?salon.name.split('—')[0].trim():'this outlet'))),
    ),
    React.createElement('div',{style:{background:'rgba(74,158,255,0.06)',border:'1px solid rgba(74,158,255,0.18)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:16,fontSize:12,color:'var(--blue)'}},
      'Each card below opens the actual working sheet, where you\u2019ll find both "Download Template" and "Upload" right there — the import itself needs that sheet\u2019s own preview and validation, so it always happens next to the data it affects.'
    ),
    React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14,marginBottom:16}},
      CARDS.map(c=>React.createElement('div',{key:c.title,className:'card',style:{display:'flex',flexDirection:'column',gap:10}},
        React.createElement('div',{style:{fontSize:26}},c.icon),
        React.createElement('div',{style:{fontWeight:700,fontSize:14,color:'var(--text)'}},c.title),
        React.createElement('div',{style:{fontSize:12,color:'var(--text3)',lineHeight:1.5,flex:1}},c.desc),
        React.createElement('button',{className:'btn btn-primary btn-sm',style:{alignSelf:'flex-start'},onClick:()=>onNavTab&&onNavTab(c.tab)},c.cta+' →')
      )),
      React.createElement('div',{className:'card',style:{display:'flex',flexDirection:'column',gap:10,background:'var(--bg3)'}},
        React.createElement('div',{style:{fontSize:26}},'🏪'),
        React.createElement('div',{style:{fontWeight:700,fontSize:14,color:'var(--text)'}},'Outlet / Salon Import'),
        React.createElement('div',{style:{fontSize:12,color:'var(--text3)',lineHeight:1.5,flex:1}},'Bulk-add new outlets across the whole business — this isn\u2019t specific to one outlet, so it lives on Master Sheet in the main sidebar rather than in here.'),
        React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',fontStyle:'italic'}},'Open Master Sheet from the sidebar → + Add Salon → Import')
      )
    )
  );
}

// Color-coded by functional group (matches each tab's own `group` field below) so the tab bar
// is scannable at a glance — Front Desk vs Payroll & HR vs Money vs Reports all read as distinct
// color clusters instead of one long undifferentiated row of icons.
const SALON_TAB_GROUP_COLORS={
  'Overview':'var(--blue)',
  'Front Desk':'var(--teal)',
  'Payroll & HR':'var(--purple)',
  'Money':'var(--green)',
  'Reports & Compliance':'var(--orange)'
};
// RGB triplets matching the hex each var() above resolves to — needed so the tab-bar CSS can
// build rgba() glows/washes per tab group (rgba() can't extract components back out of a var()
// that's already a color, so the triplet has to be supplied alongside it).
const SALON_TAB_GROUP_COLORS_RGB={
  'Overview':'74,158,255',
  'Front Desk':'78,205,196',
  'Payroll & HR':'139,127,232',
  'Money':'76,175,125',
  'Reports & Compliance':'255,159,67'
};
// Owner / Reviewer: reports-only accounts — only these outlet sheets (also used by Help & Guide to
// decide which training videos a person sees).
const REPORTS_ONLY_ROLES=['Owner','Reviewer'];
const REPORTS_ONLY_TAB_IDS=['outlet-dashboard','outlet-pnl','previous-pnl','reports','collection','collection-sheet','due-dates','audit-log'];
// Sheets of one outlet — salon-only / restaurant-only sheets (biz) appear only on that kind of outlet.
function salonTabsFor(sn){const k=sn&&sn.businessType==='Restaurant'?'restaurant':'salon';return SALON_TABS.filter(t=>!t.biz||t.biz===k);}
const SALON_TABS=[
  {id:'outlet-dashboard',label:'Dashboard',icon:'📊',group:'Overview'},
  {id:'appointments',label:'Appointments',icon:'📅',group:'Front Desk',biz:'salon'},
  {id:'billing',label:'Billing',icon:'🧾',group:'Front Desk',biz:'salon'},
  {id:'clients',label:'Clients',icon:'👥',group:'Front Desk',biz:'salon'},
  {id:'inventory',label:'Inventory',icon:'📦',group:'Front Desk',biz:'salon'},
  {id:'master-salary',label:'Master Salary',icon:'💰',group:'Payroll & HR'},
  {id:'daily-sales',label:'Daily Sales & Exp.',icon:'💵',group:'Money'},
  {id:'aggregators',label:'Swiggy, Zomato & Other Apps',icon:'🛵',group:'Money',biz:'restaurant'},
  {id:'food-cost',label:'Food Cost',icon:'🍳',group:'Money',biz:'restaurant'},
  {id:'service-charge',label:'Service Charge',icon:'🍽',group:'Payroll & HR',biz:'restaurant'},
  {id:'attendance',label:'Attendance',icon:'✅',group:'Payroll & HR'},
  {id:'salary-working',label:'Salary Working',icon:'📋',group:'Payroll & HR'},
  {id:'incentive-working',label:'Incentive Working',icon:'🏆',group:'Payroll & HR',biz:'salon'},
  {id:'daily-incentive',label:'Daily Incentive',icon:'🎯',group:'Payroll & HR'},
  {id:'advance',label:'Advances',icon:'💳',group:'Payroll & HR'},
  {id:'penalty',label:'Penalties',icon:'⚠️',group:'Payroll & HR'},
  {id:'vendors',label:'Vendors',icon:'🏭',group:'Money'},
  {id:'due-dates',label:'Due Dates',icon:'📌',group:'Money'},
  {id:'bank-statement',label:'Bank Statement',icon:'🏦',group:'Money'},
  {id:'bank-payment',label:'Bank Payment',icon:'🏧',group:'Money'},
  {id:'recurring-expenses',label:'Recurring Expenses',icon:'🔁',group:'Money'},
  {id:'fixed-assets',label:'Fixed Assets',icon:'🏢',group:'Money'},
  {id:'collection',label:'Collection Summary',icon:'📥',group:'Money',biz:'salon'},
  {id:'collection-sheet',label:'Collection Reco',icon:'📊',group:'Money',biz:'salon'},
  {id:'outlet-pnl',label:'P&L (Monthly)',icon:'📈',group:'Reports & Compliance'},
  {id:'previous-pnl',label:'Previous Months P&L',icon:'🗂️',group:'Reports & Compliance'},
  {id:'tally-export',label:'Tally Export',icon:'🔄',group:'Reports & Compliance'},
  {id:'reports',label:'Reports',icon:'📇',group:'Reports & Compliance'},
  {id:'audit-log',label:'Audit Log',icon:'🕵',group:'Reports & Compliance'},
  {id:'import-center',label:'Import Center',icon:'📥',group:'Reports & Compliance'},
];
// ── 🔔 Alerts bell (automation phase 2) — the open alerts from the nightly server check, for the
// outlets this person can see. Refreshes every 5 minutes, on window focus, and after "Run checks
// now"; an alert already fixed on this device is hidden until the next run closes it. ──
function AlertsBell({user,salons,onOpen}){
  const h=React.createElement;
  const {success,error:toastError}=useToast();
  const [alerts,setAlerts]=useState(null); // null = not loaded / not available
  const [open,setOpen]=useState(false);
  const [,setTick]=useState(0);
  const load=useCallback(async()=>{
    try{setAlerts(await loadOpenAlerts());}catch(e){setAlerts(prev=>prev||null);}
  },[]);
  useEffect(()=>{
    load();
    const t=setInterval(load,5*60*1000);
    const tick=setInterval(()=>setTick(x=>x+1),60*1000);
    const onFocus=()=>load();
    window.addEventListener('focus',onFocus);window.addEventListener('salonos-alerts-refresh',onFocus);
    return()=>{clearInterval(t);clearInterval(tick);window.removeEventListener('focus',onFocus);window.removeEventListener('salonos-alerts-refresh',onFocus);};
  },[load,user&&user.id]);
  useEffect(()=>{if(open)load();},[open]);
  if(alerts===null)return null;
  const visible=alerts.filter(a=>(a.outlet_id==null?user&&user.role==='Super Admin':userCanSeeOutlet(user,a.outlet_id))&&!alertFixedLocally(a));
  const rank={urgent:0,warn:1,info:2};
  visible.sort((a,b)=>(a.severity in rank?rank[a.severity]:1)-(b.severity in rank?rank[b.severity]:1)||String(b.created_at).localeCompare(String(a.created_at)));
  const urgent=visible.filter(a=>a.severity==='urgent').length;
  const salonOf=id=>(salons||[]).find(s=>Number(s.id)===Number(id));
  const groups=[];
  visible.forEach(a=>{const k=a.outlet_id==null?'all':String(a.outlet_id);let g=groups.find(x=>x.k===k);if(!g){g={k,name:a.outlet_id==null?'All outlets':((salonOf(a.outlet_id)||{}).name||('Outlet '+a.outlet_id)).split('—')[0].trim(),items:[]};groups.push(g);}g.items.push(a);});
  const done=async(a)=>{
    try{await resolveAlert(a.id);setAlerts(list=>(list||[]).filter(x=>x.id!==a.id));success('Marked done');}
    catch(e){toastError((e&&e.message)||'Could not close this alert');}
  };
  const dot=sev=>h('span',{style:{width:8,height:8,borderRadius:'50%',flexShrink:0,marginTop:6,background:sev==='urgent'?'var(--red)':sev==='info'?'var(--accent)':'var(--orange)'}});
  return h(React.Fragment,null,
    h('button',{className:'topbar-icon-btn',title:visible.length?visible.length+' alert'+(visible.length===1?'':'s')+' need attention':'No alerts',
      'aria-label':'Alerts','aria-expanded':open,onClick:()=>setOpen(o=>!o),style:{position:'relative'}},
      h('span',{style:{fontSize:15,lineHeight:1}},'🔔'),
      visible.length>0&&h('span',{style:{position:'absolute',top:-6,right:-6,minWidth:18,height:18,borderRadius:9,padding:'0 5px',fontSize:10.5,fontWeight:700,lineHeight:'18px',textAlign:'center',color:'#fff',background:urgent?'var(--red)':'var(--orange)'}},visible.length>99?'99+':visible.length)),
    open&&h(React.Fragment,null,
      h('div',{style:{position:'fixed',inset:0,zIndex:998},onClick:()=>setOpen(false)}),
      h('div',{role:'dialog','aria-label':'Alerts',style:{position:'fixed',top:56,right:12,width:'min(430px, calc(100vw - 24px))',maxHeight:'calc(100vh - 80px)',overflowY:'auto',zIndex:999,
        background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,boxShadow:'0 12px 32px rgba(0,0,0,.18)'}},
        h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--bg2)'}},
          h('div',{style:{fontWeight:700,fontSize:14}},'Alerts',visible.length?' ('+visible.length+')':''),
          h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setOpen(false),'aria-label':'Close'},'✕')),
        !visible.length&&h('div',{style:{padding:'28px 16px',textAlign:'center',color:'var(--text3)',fontSize:13}},'✓ All clear — nothing needs attention right now.',
          h('div',{style:{fontSize:11.5,marginTop:6}},'The server checks every night at 9 PM.')),
        groups.map(g=>h('div',{key:g.k},
          h('div',{style:{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:'var(--text3)',padding:'10px 14px 4px'}},g.name),
          g.items.map(a=>h('div',{key:a.id,style:{display:'flex',gap:10,padding:'8px 14px 10px',borderBottom:'1px solid var(--border)'}},
            dot(a.severity),
            h('div',{style:{flex:1,minWidth:0}},
              h('div',{style:{fontSize:13,fontWeight:600,color:'var(--text)'}},String(a.title||'').replace(/^[^:]+:\s*/,'')),
              a.body&&h('div',{style:{fontSize:12,color:'var(--text2)',whiteSpace:'pre-line',marginTop:2}},a.body),
              h('div',{style:{display:'flex',gap:6,marginTop:6}},
                a.kind==='backup'&&h('button',{className:'btn btn-ghost btn-sm',onClick:async()=>{try{await downloadCloudBackupFile(null);success('Backup file saved — keep it outside SalonOS.');setAlerts(list=>(list||[]).filter(x=>x.id!==a.id));}catch(e){toastError('Download failed: '+(e.message||'network error'));}}},'⬇ Download backup file'),
                a.tab&&a.outlet_id!=null&&salonOf(a.outlet_id)&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{setOpen(false);onOpen(salonOf(a.outlet_id),a.tab);}},'Open'),
                h('button',{className:'btn btn-ghost btn-sm',onClick:()=>done(a)},'Mark done')))))))))
  );
}
// ── 💬 Ask SalonOS (automation phase 4) — a question about one outlet, answered by the AI from a
// summary of the sheets this person can see there (askContextFor, js/13-pnl.js). ──
function AskSalonOS({user,salons,currentSalonId}){
  const h=React.createElement;
  const [open,setOpen]=useState(false);
  const [sid,setSid]=useState(null);
  const [q,setQ]=useState('');
  const [busy,setBusy]=useState(false);
  const [log,setLog]=useState([]); // [{q,answer,basis,error}]
  const outletId=sid!=null?sid:(currentSalonId!=null?currentSalonId:(salons[0]&&salons[0].id));
  const ask=async()=>{
    const question=q.trim();if(!question||busy||outletId==null)return;
    setBusy(true);
    try{
      const res=await aiCall('ask',{question,outlet:String((salons.find(s=>String(s.id)===String(outletId))||{}).name||''),context:askContextFor(user,outletId)});
      setLog(l=>[...l,{q:question,answer:res.answer,basis:res.basis}]);setQ('');
    }catch(e){setLog(l=>[...l,{q:question,error:e.message}]);}
    setBusy(false);
  };
  const examples=['What were total sales last month vs the month before?','Which vendor bills are overdue?','पिछले महीने कौन सा खर्च सबसे ज़्यादा बढ़ा?'];
  return h(React.Fragment,null,
    h('button',{className:'topbar-icon-btn',title:'Ask SalonOS a question about an outlet',onClick:()=>setOpen(o=>!o)},h('span',{style:{fontSize:15,lineHeight:1}},'💬'),h('span',{className:'lbl-full'},'Ask')),
    open&&h(React.Fragment,null,
      h('div',{style:{position:'fixed',inset:0,zIndex:998},onClick:()=>setOpen(false)}),
      h('div',{role:'dialog','aria-label':'Ask SalonOS',style:{position:'fixed',top:56,right:12,width:'min(460px, calc(100vw - 24px))',maxHeight:'calc(100vh - 80px)',display:'flex',flexDirection:'column',zIndex:999,
        background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,boxShadow:'0 12px 32px rgba(0,0,0,.18)'}},
        h('div',{style:{display:'flex',alignItems:'center',gap:8,padding:'12px 14px',borderBottom:'1px solid var(--border)'}},
          h('div',{style:{fontWeight:700,fontSize:14}},'💬 Ask SalonOS'),
          h('select',{className:'form-control',style:{width:'auto',marginLeft:'auto',fontSize:12,padding:'4px 8px'},value:outletId==null?'':outletId,onChange:e=>setSid(e.target.value)},
            salons.map(s=>h('option',{key:s.id,value:s.id},String(s.name||'').split('—')[0].trim()))),
          h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setOpen(false),'aria-label':'Close'},'✕')),
        h('div',{style:{flex:1,overflowY:'auto',padding:'10px 14px',fontSize:13,lineHeight:1.6}},
          !log.length&&h('div',{style:{color:'var(--text3)',fontSize:12.5}},'Ask in English or Hindi about sales, expenses, staff, attendance, vendor bills or the bank statement of this outlet. Try:',
            examples.map((x,i)=>h('div',{key:i},h('button',{className:'btn btn-ghost btn-sm',style:{marginTop:6,textAlign:'left',whiteSpace:'normal'},onClick:()=>setQ(x)},x)))),
          log.map((m,i)=>h('div',{key:i,style:{marginBottom:12}},
            h('div',{style:{fontWeight:600,color:'var(--accent)'}},m.q),
            m.error?h('div',{style:{color:'var(--orange)'}},m.error)
              :h(React.Fragment,null,h('div',{style:{whiteSpace:'pre-line',color:'var(--text)'}},m.answer),m.basis&&h('div',{style:{fontSize:11,color:'var(--text3)',marginTop:2}},'Based on: '+m.basis))))),
        h('div',{style:{display:'flex',gap:8,padding:'10px 14px',borderTop:'1px solid var(--border)'}},
          h('input',{className:'form-control',value:q,placeholder:'Type your question…',onChange:e=>setQ(e.target.value),onKeyDown:e=>{if(e.key==='Enter')ask();},autoFocus:true}),
          h('button',{className:'btn btn-primary btn-sm'+(busy?' btn-loading':''),disabled:busy||!q.trim(),onClick:ask},busy?'Thinking…':'Ask')),
        h('div',{style:{fontSize:10.5,color:'var(--text3)',padding:'0 14px 10px'}},'Only this outlet’s data you can see is sent to the AI, for this answer only. Check important figures on the sheet itself.'))
    )
  );
}
function App(){
  // Esc closes whatever modal/popup is currently open, app-wide. Every modal in this app already
  // closes when its backdrop (.modal-overlay) is clicked — so rather than wiring an Escape
  // handler into each of the ~57 separate modal call sites individually (easy to miss one, and
  // every future modal would need it added by hand too), this finds the open overlay and
  // triggers a real click on it, reusing whatever close logic that modal already has. If more
  // than one happens to be open at once (a confirm dialog opened from within another modal), the
  // last one in the DOM — the most recently opened, in normal top-to-bottom render order — gets
  // closed first, same as clicking through them would.
  useEffect(()=>{
    const onKeyDown=(e)=>{
      if(e.key!=='Escape')return;
      const overlays=document.querySelectorAll('.modal-overlay');
      if(overlays.length)overlays[overlays.length-1].click();
    };
    document.addEventListener('keydown',onKeyDown);
    return()=>document.removeEventListener('keydown',onKeyDown);
  },[]);
  const [loggedIn,setLoggedIn]=useState(()=>!!sessionStorage.getItem('salonos_user'));
  const [user,setUser]=useState(()=>{try{return JSON.parse(sessionStorage.getItem('salonos_user'))}catch(e){return null}});
  // Backup-overdue reminder — dismissible for the current session only, so it doesn't nag on
  // every single page navigation, but comes back next time the app is opened if still overdue.
  // 14 days is a judgment call, not a hard rule — the point is a real downloaded file exists
  // somewhere outside this browser, not that it's exactly two weeks old.
  const [backupBannerDismissed,setBackupBannerDismissed]=useState(false);
  const backupDaysOverdue=daysSinceLastBackup();
  const backupOverdue=backupDaysOverdue===null||backupDaysOverdue>=14;
  // ── Mobile sidebar drawer — closed by default; a hamburger button (only rendered under 900px
  // via CSS) toggles it open as an off-canvas panel over the content, closed again by picking a
  // nav item or tapping the backdrop. Desktop/tablet widths never see the hamburger or backdrop
  // at all (display:none in the media query), so this has zero effect above 900px. ──
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const closeSidebar=()=>setSidebarOpen(false);
  const [activePage,setActivePage]=useState('dashboard');
  const [selectedSalon,setSelectedSalon]=useState(null);
  const [salonTab,setSalonTab]=useState('master-salary');
  const [dashTab,setDashTab]=useState('overview'); // Master Dashboard: 'overview' | 'compliance'
  // If the sheet currently open stops being accessible to this user (an admin just changed
  // their permissions, or they logged in with an account that never had access to it), move
  // them to the first sheet they can actually see rather than leaving them on a hidden one.
  // Super Admin and legacy accounts with no sheetAccess configured are never redirected — same
  // "sees everything" rule the nav filtering itself uses.
  useEffect(()=>{
    if(!user||user.role==='Super Admin')return;
    const oa=(user.sheetAccessByOutlet&&selectedSalon&&user.sheetAccessByOutlet[selectedSalon.id])||user.sheetAccess;
    if(!oa)return;
    const currentAllowed=(oa[salonTab]||'View Only')!=='No Access';
    if(currentAllowed)return;
    const firstAllowed=SALON_TABS.find(t=>(oa[t.id]||'View Only')!=='No Access');
    if(firstAllowed)setSalonTab(firstAllowed.id);
  },[user,salonTab,selectedSalon]);
  // A salon-only sheet doesn't exist on a restaurant outlet (and the other way round) — opening
  // another kind of outlet while on one lands on its dashboard instead.
  useEffect(()=>{
    if(selectedSalon&&!salonTabsFor(selectedSalon).some(t=>t.id===salonTab))setSalonTab('outlet-dashboard');
  },[selectedSalon,salonTab]);
  // Keeps the currently-active sheet visible in the horizontally-scrolling tab strip — matters
  // most when salonTab changes from somewhere other than clicking a visible tab button (the
  // command palette's "Go to" entries, or the permission-redirect above), where the newly active
  // tab could otherwise be scrolled off to one side with no visual indication it changed at all.
  const salonTabBarScrollTo=(dir)=>{
    const el=document.getElementById('salon-tab-bar');
    if(el)el.scrollBy({left:dir*220,behavior:'smooth'});
  };
  useEffect(()=>{
    const el=document.getElementById('salon-tab-bar');
    if(!el)return;
    const activeBtn=el.querySelector('.tab-btn.active');
    if(activeBtn)activeBtn.scrollIntoView({behavior:'smooth',inline:'nearest',block:'nearest'});
  },[salonTab,selectedSalon]);
  // Was hardcoded to '2025-26' — defaults to whatever FY today actually falls in, same as the
  // Period Gate, so the Master Dashboard doesn't quietly default to last year's FY forever.
  const [selFY,setSelFY]=useState(()=>pgCurrent().fy);
  const [toasts,setToasts]=useState([]);
  const [cmdOpen,setCmdOpen]=useState(false);
  const [theme,setTheme]=useState(()=>{try{return cachedLocalGet('salonos_theme')||'light'}catch(e){return 'light'}});
  useEffect(()=>{document.body.classList.toggle('light',theme==='light');safeLocalSet('salonos_theme',theme)},[theme]);
  // Auto-backup — every 1 minute while enabled, snapshots all SalonOS data into a dedicated
  // localStorage slot (not a file download, so it doesn't spam the browser's download prompt).
  // Toggled from Master Settings; runs regardless of which page is open since it lives in App.
  const [autoBackupOn,setAutoBackupOn]=useState(()=>{try{return cachedLocalGet('salonos_autobackup_enabled')==='1'}catch(e){return false}});
  useEffect(()=>{safeLocalSet('salonos_autobackup_enabled',autoBackupOn?'1':'0')},[autoBackupOn]);
  const [lastAutoBackup,setLastAutoBackup]=useState(()=>{try{const raw=cachedLocalGet('salonos_autobackup_snapshot');return raw?JSON.parse(raw).savedAt:null;}catch(e){return null}});
  useEffect(()=>{
    if(!autoBackupOn)return;
    const doSnapshot=()=>{
      try{
        const data=collectSalonOSData();
        const savedAt=new Date().toISOString();
        safeLocalSet('salonos_autobackup_snapshot',JSON.stringify({savedAt,data}));
        setLastAutoBackup(savedAt);
      }catch(e){}
    };
    const id=setInterval(doSnapshot,60000);
    return ()=>clearInterval(id);
  },[autoBackupOn]);
  const [period,setPeriod]=useState(null);
  const [defaultPeriods,setDefaultPeriods]=useState(()=>pgLoadAll());
  const [gateFor,setGateFor]=useState(null);
  const [showHelp,setShowHelp]=useState(false);
  const [pendingVendorCategory,setPendingVendorCategory]=useState(null);
  const [pendingVendorPaymentDate,setPendingVendorPaymentDate]=useState(null);
  const [salons,setSalons]=useState(SALONS);
  // Every add/edit/delete goes through this instead of setSalons directly — it mutates the
  // shared SALONS array in place (so every other component reading it sees the change
  // immediately on the same re-render, not one tick later) and persists it, in that order,
  // before React state updates — this is what actually makes "Master Sheet" changes show up
  // in every outlet selector throughout the app, which never genuinely worked before.
  const setSalonsAndSync=(updater)=>{
    setSalons(prev=>{
      const next=typeof updater==='function'?updater(prev):updater;
      SALONS.length=0;SALONS.push(...next);
      saveSalonsToStorage(next);
      return next;
    });
  };

  // One-time cleanup: earlier versions of this app shipped with 2 hardcoded sample submissions
  // as the fallback default — meaning the very first time this browser ever loaded the Review
  // Centre, before any real submission existed, those samples got saved as if they were real
  // data. This strips out only those exact entries (matched on ID AND every field, not just the
  // ID) so it can never mistakenly remove a genuine submission that happens to reuse an ID.
  const KNOWN_DUMMY_SUBMISSIONS=[
    {id:'SUB-1001',outletId:2,outlet:'Glow & Co — Sector 18',period:'June 2026',module:'Monthly Operations',submittedBy:'Rahul Mehta',submittedAt:'2026-06-26T18:30:00+05:30',status:'Submitted',remarks:'',reviewedBy:'',reviewedAt:''},
    {id:'SUB-1000',outletId:1,outlet:'Luxe Studio — Connaught Place',period:'May 2026',module:'Payroll & Attendance',submittedBy:'Priya Sharma',submittedAt:'2026-06-05T12:15:00+05:30',status:'Approved',remarks:'Checked and approved.',reviewedBy:'Amit Verma',reviewedAt:'2026-06-06T10:00:00+05:30'}
  ];
  const loadSubmissionsClean=()=>{
    try{
      const stored=JSON.parse(cachedLocalGet('salonos_submissions'))||[];
      return stored.filter(s=>!KNOWN_DUMMY_SUBMISSIONS.some(d=>JSON.stringify(d)===JSON.stringify(s)));
    }catch(e){return []}
  };
  const [submissions,setSubmissions]=useState(loadSubmissionsClean);
  useEffect(()=>{safeLocalSet('salonos_submissions',JSON.stringify(submissions));},[submissions]);
  // App-level state (outlet list, submissions) is read once when the app first loads — before
  // login, so before any cloud data arrived. Re-read it whenever cloud data lands in this browser,
  // or it keeps showing (and later saving back) that older copy.
  const reloadAppLevelData=useCallback(()=>{
    const s=loadSalonsFromStorage();
    SALONS.length=0;SALONS.push(...s);
    setSalons(s);
    setSubmissions(loadSubmissionsClean());
  },[]);

  // Wire toast system
  const addToast=useCallback((msg,type='success',dur=3000,onUndo)=>{
    const id=Date.now()+Math.random();
    setToasts(p=>[...p,{id,msg,type,onUndo}]);
    setTimeout(()=>setToasts(p=>p.map(t=>t.id===id?{...t,leaving:true}:t)),dur);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),dur+220);
  },[]);
  _addToast=addToast;
  const saveActivity=useSaveActivity();
  const cloudStatus=useCloudStatus();
  // ── Live updates from other IDs: bumping dataVersion re-mounts the open screen so it re-reads
  // the fresh data. Held back while this user is mid-edit (typing in the last 5s, a field focused,
  // or a form/modal open) so their work is never yanked away — a banner offers it instead, and it
  // applies by itself as soon as they pause. ──
  const [dataVersion,setDataVersion]=useState(0);
  const _viewRef=useRef({page:null,sid:null});
  _viewRef.current={page:activePage,sid:selectedSalon?selectedSalon.id:null};
  const _lastRemountRef=useRef(0);
  // Does a changed key affect the screen open now? Inside an outlet: that outlet's data or shared
  // settings — not another outlet's, and never background logs.
  const _keyShownNow=k=>{
    if(/^salonos_(audit_log|due_snapshot|period_default|sent_)/.test(k))return false;
    const pg=_viewRef.current,m=/_outlet_(\d+)$/.exec(k);
    return !m||!(pg.page==='salon'&&pg.sid!=null)||String(pg.sid)===m[1];
  };
  const [cloudUpdateWaiting,setCloudUpdateWaiting]=useState(false);
  // New-version check: version.json is tiny and fetched uncached; if it names a different
  // version than the one running, offer a one-tap update (held back while edits are still saving).
  const [newVersion,setNewVersion]=useState(null);
  useEffect(()=>{
    if(location.protocol==='file:')return;
    const check=async()=>{
      try{
        const r=await fetch('version.json?t='+Date.now(),{cache:'no-store'});
        if(!r.ok)return;
        const v=(await r.json()).version;
        if(v&&v!==APP_VERSION)setNewVersion(v);
      }catch(e){}
    };
    check();
    const t=setInterval(check,10*60*1000);
    const onVis=()=>{if(document.visibilityState==='visible')check();};
    document.addEventListener('visibilitychange',onVis);
    return()=>{clearInterval(t);document.removeEventListener('visibilitychange',onVis);};
  },[]);
  const updateNow=()=>{
    if(CLOUD_SYNC_ENABLED&&(_cloudDirty.size>0||_cloudPushing>0)){addToast('Finishing saving your changes first — try again in a moment','info');return;}
    window.location.reload();
  };
  // Phone-only chrome: the topbar ⋯ menu and the full-screen "All sheets" picker.
  const [phoneMenuOpen,setPhoneMenuOpen]=useState(false);
  const [modulePickerOpen,setModulePickerOpen]=useState(false);
  const [moduleQuery,setModuleQuery]=useState('');
  const applyCloudUpdatesNow=useCallback(async()=>{
    try{
      const scroller=document.querySelector('.content');
      const top=scroller?scroller.scrollTop:0;
      const applied=await cloudApplyUpdates();
      setCloudUpdateWaiting(false);
      if(!applied.length)return;
      reloadAppLevelData();
      // Re-mount (which resets tabs, filters and scroll) only when a change touches what's on screen:
      // inside an outlet, that outlet's data or shared settings - not another outlet's saves, and
      // never background logs (audit log, due snapshot, a default period, sent-message logs). The
      // data itself is already in this browser, so other screens show it when they next open.
      const shown=applied.filter(_keyShownNow);
      if(!shown.length)return;
      _lastRemountRef.current=Date.now();
      setDataVersion(v=>v+1);
      setTimeout(()=>{const el=document.querySelector('.content');if(el)el.scrollTop=top;},60);
    }catch(e){}
  },[reloadAppLevelData]);
  useEffect(()=>{
    if(!CLOUD_SYNC_ENABLED)return;
    let lastActivity=0,lastTyping=0,waiting=false,waitingSince=0;
    const mark=(e)=>{lastActivity=Date.now();if(e&&(e.type==='keydown'||e.type==='input'))lastTyping=lastActivity;};
    // Another user's saves on the outlet open here wait while this person is using the screen
    // (typing, clicking or scrolling in the last 20 s, or a form open), and the screen re-loads at
    // most once a minute — a colleague working through a sheet used to re-load it on every save, so
    // the screen kept flickering. After 3 minutes of waiting they load at the next 5 s without
    // typing (no form open). Changes to other outlets go in quietly, with no re-load. Nothing is
    // lost while waiting: saves made meanwhile are merged with them.
    const evs=['keydown','input','pointerdown','wheel','touchstart','scroll'];
    evs.forEach(ev=>window.addEventListener(ev,mark,{capture:true,passive:true}));
    const busy=()=>{
      const now=Date.now();
      if(document.querySelector('.modal-overlay'))return true;
      if(waiting&&now-waitingSince>180000)return now-lastTyping<5000;
      return now-lastActivity<20000||now-_lastRemountRef.current<60000;
    };
    const onUpdates=(e)=>{
      const keys=(e&&e.detail&&e.detail.keys)||[];
      if(keys.length&&!keys.some(_keyShownNow)&&!waiting){applyCloudUpdatesNow();return;}
      if(busy()){if(!waiting){waiting=true;waitingSince=Date.now();}setCloudUpdateWaiting(true);}
      else{waiting=false;applyCloudUpdatesNow();}
    };
    const t=setInterval(()=>{if(waiting&&!busy()){waiting=false;applyCloudUpdatesNow();}},1000);
    window.addEventListener('salonos-cloud-data',onUpdates);
    return()=>{evs.forEach(ev=>window.removeEventListener(ev,mark,{capture:true}));clearInterval(t);window.removeEventListener('salonos-cloud-data',onUpdates);};
  },[applyCloudUpdatesNow]);
  const removeToast=(id)=>{
    setToasts(p=>p.map(t=>t.id===id?{...t,leaving:true}:t));
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),220);
  };

  useEffect(()=>{
    const onKey=(e)=>{
      if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='f'){e.preventDefault();setCmdOpen(o=>!o)}
      if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();setCmdOpen(true)}
    };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[]);

  // Cloud mode pulls every saved key down from Supabase into localStorage before the app renders
  // any real screen — otherwise the very first render after login would briefly show whatever
  // (possibly empty) data happened to already be cached in this browser.
  // Starts true when the tab reopens already logged in, so no screen renders (and saves back its
  // stale cached data) before the session check + pull below have finished.
  const [syncing,setSyncing]=useState(()=>CLOUD_SYNC_ENABLED&&loggedIn&&!_cloudSyncReady);
  // A page refresh (or the tab reloading after being backgrounded) restores loggedIn/user
  // straight from sessionStorage above, bypassing handleLogin entirely — without this,
  // _cloudSyncReady stays stuck at its initial false for the rest of this tab's life, and
  // queueCloudPush silently no-ops on every single edit made after the refresh (see its guard
  // near CLOUD_SYNC_ENABLED). This re-runs the same pull-and-mark-ready step handleLogin does,
  // once, whenever the app mounts already logged in.
  // The app's own "logged in" flag lives in sessionStorage, but every cloud read/write needs a live
  // Supabase session too. When that session has expired or been revoked, Supabase answers with
  // empty lists instead of an error — User Management shows 0 users, other IDs' data never loads,
  // and saves never leave this browser. So: verify it on mount, and drop back to the login screen
  // whenever it's found missing, rather than carrying on half-logged-in.
  const forceRelogin=useCallback(()=>{
    if(!sessionStorage.getItem('salonos_user'))return;
    sessionStorage.removeItem('salonos_user');setLoggedIn(false);setUser(null);
    addToast('Your login session has expired — please sign in again. Unsynced changes on this device will be uploaded after you sign in.','warning',9000);
  },[]);
  useEffect(()=>{
    if(!CLOUD_SYNC_ENABLED)return;
    window.addEventListener('salonos-session-lost',forceRelogin);
    let sub=null;
    getSupabaseClient().then(supa=>{
      if(!supa)return;
      sub=supa.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')forceRelogin();}).data.subscription;
      if(loggedIn&&!_cloudSyncReady){
        supa.auth.getSession().then(({data:{session}})=>{
          if(!session){setSyncing(false);forceRelogin();return;}
          cloudPullAndHydrate().then(()=>{reloadAppLevelData();setSyncing(false);});
        }).catch(()=>setSyncing(false));
      }
    }).catch(()=>setSyncing(false));
    return()=>{window.removeEventListener('salonos-session-lost',forceRelogin);if(sub)sub.unsubscribe();};
  },[]);
  const handleLogin=async(u)=>{
    if(CLOUD_SYNC_ENABLED){
      setSyncing(true);
      await cloudPullAndHydrate();
      reloadAppLevelData();
      setSyncing(false);
    }
    setUser(u);setLoggedIn(true);sessionStorage.setItem('salonos_user',JSON.stringify(u));
    if(CLOUD_SYNC_ENABLED)purgeOutletDataWithoutAccess(); // needs the signed-in user, set just above
    if(!CLOUD_SYNC_ENABLED){
      try{
        const accts=loadUserAccounts();
        const stamped=accts.map(a=>a.email.toLowerCase()===u.email.toLowerCase()?{...a,lastLogin:new Date().toISOString()}:a);
        saveUserAccounts(stamped);
      }catch(e){}
    }
    setActivePage(['Super Admin','Reviewer'].includes(u.role)?'collaboration':'collaboration');
    if(u.isDemo){
      addToast('🎉 Demo Access — this login is available for 5 days only from your network'+(u.demoDaysLeft?' ('+u.demoDaysLeft+' day'+(u.demoDaysLeft===1?'':'s')+' left)':'')+'. Contact us to purchase SalonOS.','info',8000);
    }else{
      addToast('Welcome, '+u.name+'!','success');
    }
  };
  const logout=()=>{
    sessionStorage.removeItem('salonos_user');try{sessionStorage.removeItem('salonos_due_popup_shown');}catch(e){}setLoggedIn(false);setUser(null);
    // scope:'local' — Supabase's default signOut() is global and revokes this account's session on
    // EVERY device/browser, silently breaking cloud sync wherever else it was still open.
    if(CLOUD_SYNC_ENABLED)getSupabaseClient().then(supa=>supa&&supa.auth.signOut({scope:'local'})).catch(()=>{});
  };
  // Access a Super Admin changes applies straight away — this person's own profile is re-read every
  // 30 s and when the window regains focus. Before, rights were read only at login, so outlets or
  // sheets given later stayed hidden (and removed ones stayed visible) until they signed in again.
  useEffect(()=>{
    if(!CLOUD_SYNC_ENABLED||!loggedIn||!user||!user.id)return;
    let stopped=false,busy=false;
    const FIELDS=['name','role','access','status','outletIds','outletAccess','sheetAccessByOutlet'];
    const check=async()=>{
      if(busy||stopped||document.visibilityState!=='visible')return;
      busy=true;
      try{
        const supa=await getSupabaseClient();
        const{data:{session}}=await supa.auth.getSession();
        if(!session||stopped)return; // no live login right now — the session check elsewhere handles that
        const{data:p,error}=await supa.from('profiles').select('*').eq('id',user.id).maybeSingle();
        if(error||stopped||!p)return; // can't see the row this time (network, token refresh) — never sign out on that
        if(p.status==='Inactive'){logout();addToast('This account has been deactivated. Contact your Super Admin.','warning',9000);return;}
        if(accessEnded(p)){logout();addToast('Your access to SalonOS has ended. Contact your Super Admin.','warning',9000);return;}
        const cur=currentSessionUser()||user;
        const next={...cur,...userFromProfile(p,cur.email,{isDemo:cur.isDemo,demoDaysLeft:cur.demoDaysLeft})};
        if(FIELDS.every(f=>JSON.stringify(next[f])===JSON.stringify(cur[f])))return;
        sessionStorage.setItem('salonos_user',JSON.stringify(next));
        setUser(next);
        purgeOutletDataWithoutAccess();
        cloudCheckForUpdates(); // brings down the data of any outlet just given
        addToast('Your access has been updated by the Super Admin.','info',6000);
      }catch(e){}finally{busy=false;}
    };
    const t=setInterval(check,30000);
    window.addEventListener('focus',check);
    check();
    return()=>{stopped=true;clearInterval(t);window.removeEventListener('focus',check);};
  },[loggedIn,user&&user.id]);
  // If the outlet open right now is no longer allowed, leave it.
  useEffect(()=>{
    if(user&&selectedSalon&&!userCanSeeOutlet(user,selectedSalon.id)){setSelectedSalon(null);setActivePage('dashboard');}
  },[user,selectedSalon]);
  // Shared counter PCs and phones often stay logged in all day — sign out after 30 minutes with
  // no activity, but never while an edit is still on its way to the cloud.
  useEffect(()=>{
    if(!loggedIn)return;
    const IDLE_MS=30*60*1000;
    let last=Date.now();
    const mark=()=>{last=Date.now();};
    const evs=['keydown','mousedown','touchstart','wheel','scroll'];
    evs.forEach(ev=>window.addEventListener(ev,mark,{capture:true,passive:true}));
    const t=setInterval(()=>{
      if(Date.now()-last<IDLE_MS)return;
      if(CLOUD_SYNC_ENABLED&&(_cloudDirty.size>0||_cloudPushing>0))return;
      logout();
      addToast('Signed out after 30 minutes of inactivity — sign in again to continue.','info',10000);
    },30000);
    return()=>{evs.forEach(ev=>window.removeEventListener(ev,mark,{capture:true}));clearInterval(t);};
  },[loggedIn]);
  const handleSelectSalon=(s)=>{
    const dp=defaultPeriods[s.id];
    if(!dp){setGateFor(s);return}
    setPeriod(dp);setSelFY(dp.fy);setSelectedSalon(s);setActivePage('salon');setSalonTab('outlet-dashboard');
  };
  const confirmPeriod=(pd,remember)=>{
    const target=gateFor||selectedSalon;
    setPeriod(pd);
    if(target){
      if(remember){pgSave(pd,target.id);setDefaultPeriods(prev=>({...prev,[target.id]:pd}));}
      else{pgSave(null,target.id);setDefaultPeriods(prev=>{const n={...prev};delete n[target.id];return n;});}
    }
    setSelFY(pd.fy);
    if(gateFor){setSelectedSalon(gateFor);setActivePage('salon');setSalonTab('outlet-dashboard');setGateFor(null);}
    addToast('Working in '+pgLabel(pd)+(remember?' — saved as the default for '+(target?target.name.split('—')[0].trim():'this outlet'):''),'success');
  };

  // ── Back navigation — a generic history stack that watches activePage/selectedSalon/salonTab
  // and remembers whatever they were right before each change, regardless of which click handler
  // caused it (sidebar nav, command palette, "Go to" links, tab switches, etc.) — so a single
  // Back button in the topbar always returns to the previous screen without every navigation
  // call site needing to know about history itself. isBackNavRef suppresses re-recording the
  // screen you're leaving when the change was itself caused by pressing Back.
  const navHistoryRef=useRef([]);
  const prevNavRef=useRef({activePage,selectedSalon,salonTab,period,selFY});
  const isBackNavRef=useRef(false);
  const [canGoBack,setCanGoBack]=useState(false);
  useEffect(()=>{
    const prev=prevNavRef.current;
    const changed=prev.activePage!==activePage||prev.selectedSalon?.id!==selectedSalon?.id||prev.salonTab!==salonTab;
    if(changed){
      if(isBackNavRef.current){
        isBackNavRef.current=false;
      }else{
        navHistoryRef.current.push(prev);
        if(navHistoryRef.current.length>50)navHistoryRef.current.shift();
        setCanGoBack(true);
      }
      prevNavRef.current={activePage,selectedSalon,salonTab,period,selFY};
    }
  },[activePage,selectedSalon,salonTab]);
  const goBack=()=>{
    const hist=navHistoryRef.current;
    if(!hist.length)return;
    const prev=hist.pop();
    isBackNavRef.current=true;
    setSelectedSalon(prev.selectedSalon);
    setSalonTab(prev.salonTab);
    setPeriod(prev.period);
    setSelFY(prev.selFY);
    setActivePage(prev.activePage);
    setCanGoBack(hist.length>0);
  };
  useEffect(()=>{
    const onKey=(e)=>{
      if(e.altKey&&e.key==='ArrowLeft'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();goBack();}
    };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[]);
  // Automation phase 3: monthly invoices for Fixed recurring expenses, on outlets that switched it
  // on — run once the data is loaded, then hourly, by anyone who can edit that outlet's Vendors.
  useEffect(()=>{
    if(!loggedIn||syncing||!user)return;
    const run=()=>{
      let total=0;const names=[];
      salons.filter(s=>userCanSeeOutlet(user,s.id)&&userCanEditSheet(user,s.id,'vendors')).forEach(s=>{
        try{const r=autoCreateRecurringInvoices(s.id);if(r.create.length){total+=r.create.length;names.push(String(s.name||'').split('—')[0].trim());}}catch(e){}
      });
      if(total){setDataVersion(v=>v+1);addToast('Created '+total+' recurring invoice'+(total===1?'':'s')+' for this month in Vendor Sheet ('+names.join(', ')+')','info',6000);}
    };
    const first=setTimeout(run,4000);
    const t=setInterval(run,60*60*1000);
    return()=>{clearTimeout(first);clearInterval(t);};
  },[loggedIn,syncing,user&&user.id,salons]);
  // Automation phase 3: evening Tally sync — only on a computer where it was switched on (Tally
  // Export → 🌙 Evening auto-sync), from the set time onward, once a day per outlet. If the
  // connector/Tally isn't answering it keeps trying every 5 minutes while the app is open.
  useEffect(()=>{
    if(!loggedIn||syncing||!user)return;
    let busy=false;
    const pad=n=>String(n).padStart(2,'0');
    const tick=async()=>{
      if(busy)return;
      const cfg=loadTallyConnectorCfg();
      if(cfg.disconnected)return; // Tally Integration → Disconnect
      const auto=cfg.autoSync||{};
      const ids=Object.keys(auto);
      if(!ids.length)return;
      const now=new Date(),hm=pad(now.getHours())+':'+pad(now.getMinutes());
      if(hm<(cfg.syncTime||'20:00'))return;
      const today=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate());
      busy=true;
      try{
        for(const id of ids){
          if(!userCanSeeOutlet(user,id)||!userCanEditSheet(user,id,'tally-export'))continue;
          const last=(cfg.lastSync||{})[id];
          if(last&&last.day===today)continue;
          const name=String(outletSettings(id).name||'Outlet').split('—')[0].trim();
          let res;
          try{res={...(await runTallyAutoSync(id,cfg,auto[id])),day:today};}
          catch(e){res={error:e.message,at:new Date().toISOString(),errorDay:today,sent:0,failed:[],changed:[]};}
          const c2=loadTallyConnectorCfg();
          const hadErrToday=((c2.lastSync||{})[id]||{}).errorDay===today;
          c2.lastSync={...(c2.lastSync||{}),[id]:res};saveTallyConnectorCfg(c2);
          if(res.error){if(!hadErrToday)addToast('Evening Tally sync ('+name+') is waiting: '+res.error,'warning',8000);}
          else if(res.sent||res.failed.length)addToast('Tally sync ('+name+'): '+res.sent+' voucher'+(res.sent===1?'':'s')+' sent'+(res.ledgersCreated?', '+res.ledgersCreated+' ledger(s) created':'')+(res.failed.length?' · '+res.failed.length+' rejected — see Tally Export':''),res.failed.length?'warning':'success',8000);
        }
      }finally{busy=false;}
    };
    const first=setTimeout(tick,8000);
    const t=setInterval(tick,5*60*1000);
    return()=>{clearTimeout(first);clearInterval(t);};
  },[loggedIn,syncing,user&&user.id]);

  if(CLOUD_SYNC_ENABLED&&isPasswordRecoveryLink())return React.createElement(ResetPasswordPage,null);
  if(!loggedIn)return React.createElement(LoginPage,{onLogin:handleLogin});
  if(syncing)return React.createElement('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',gap:14,color:'var(--text2)',fontSize:13}},
    React.createElement('div',{style:{width:34,height:34,border:'3px solid var(--border2)',borderTopColor:'var(--accent)',borderRadius:'50%',animation:'btn-spin 700ms linear infinite'}}),
    'Syncing your data from the cloud…'
  );

  const isAdmin=user?.role==='Super Admin';
  const isReviewer=['Super Admin','Reviewer'].includes(user?.role);
  // Owner / Reviewer get a curated, read-only view — reports and oversight only, none of the
  // day-to-day working documents (Daily Sales, Salary Working, Bank Statement, Vendor Sheet,
  // Advances, Import Center, etc.). Salon Owner follows the outlet and sheet access set in User
  // Management (View Only / Edit per sheet), like Salon Manager — database rule step19.
  const isReportOnlyRole=!!(user&&REPORTS_ONLY_ROLES.includes(user.role));
  const GLOBAL_NAV=[
    ...(isReportOnlyRole?[]:[{id:'collaboration',label:isReviewer?'Review Centre':'My Submissions',icon:'✅'}]),
    {id:'dashboard',label:'Dashboard',icon:'📊'},
    {id:'insights',label:'Owner Insights',icon:'💡'},
    ...(isAdmin?[{id:'master-sheet',label:'Master Sheet',icon:'🏪'}]:[]),
    {id:'reports',label:'Reports Hub',icon:'📋'},
    ...(isReviewer||isReportOnlyRole?[{id:'pnl',label:'P&L Statement',icon:'📈'}]:[]),
    ...(isAdmin?[{id:'users',label:'User Management',icon:'👥'},{id:'settings',label:'Master Settings',icon:'⚙'}]:[]),
  ];
  // Sheet access is now set per outlet — look up the matrix for whichever outlet is currently
  // selected. Falls back to the old flat sheetAccess (pre-outlet-wise accounts, not yet re-saved
  // through the updated User Management form) so nothing changes for anyone until an admin
  // actively opens their record and sets outlet-specific permissions.
  const outletSheetAccess=(user&&selectedSalon&&user.sheetAccessByOutlet&&user.sheetAccessByOutlet[selectedSalon.id])||(user&&user.sheetAccess)||null;
  // Salary Working / Incentive Working stay visible to Salon Manager / ASM even with "No Access"
  // set for those sheets — see isSummaryApproverRole. They land on the Summary Approval screen
  // (SalaryWorkingSheet/IncentiveWorkingSheet already branch on role for that), never the actual
  // working sheet, so showing the tab itself is safe regardless of the sheet-permission matrix.
  const visibleSalonTabs=((user&&user.role==='Super Admin')||!user||!outletSheetAccess
    ?salonTabsFor(selectedSalon)
    :salonTabsFor(selectedSalon).filter(t=>(outletSheetAccess[t.id]||'View Only')!=='No Access'||(isSummaryApproverRole(user)&&(t.id==='salary-working'||t.id==='incentive-working')))
  ).filter(t=>!isReportOnlyRole||REPORTS_ONLY_TAB_IDS.includes(t.id));
  // Guards the "🔗 jump to Bank Statement / Daily Sales & Exp" links (Collection Sheet, etc.)
  // too — a report-only user can't land on a working document by clicking through one of those
  // either, not just by the tab bar being hidden.
  const navToSalonTab=(tabId)=>{
    if(isReportOnlyRole&&!REPORTS_ONLY_TAB_IDS.includes(tabId)){addToast('This is a working document — not available on a reports-only account.','info');return;}
    setSalonTab(tabId);
  };
  const SALON_TAB_COMPONENTS={
    'outlet-dashboard':(props)=>React.createElement(OutletDashboard,{salon:selectedSalon,period}),
    'appointments':AppointmentBook,
    'billing':(props)=>React.createElement(BillingSheet,{salon:selectedSalon}),
    'clients':ClientCRM,
    'inventory':InventorySheet,
    'master-salary':MasterSalarySheet,
    'daily-sales':DailySalesSheet,
    'daily-incentive':DailyIncentiveSheet,
    'attendance':AttendanceSheet,
    'salary-working':SalaryWorkingSheet,
    'incentive-working':IncentiveWorkingSheet,
    'advance':AdvanceSheet,
    'penalty':PenaltySheet,
    'vendors':VendorSheet,
    'due-dates':DueDateSheet,
    'outlet-pnl':OutletPnLSheet,
    'collection':CollectionReco,
    'collection-sheet':CollectionSheetView,
    'bank-statement':BankStatement,
    'bank-payment':BankPaymentSheet,
    'tally-export':TallyExportSheet,
    'reports':ReportsSheet,
    'recurring-expenses':RecurringExpensesSheet,
    'previous-pnl':PreviousMonthsPnLSheet,
    'fixed-assets':FixedAssetsSheet,
    'audit-log':AuditLogSheet,
    'import-center':ImportCenter,
    'aggregators':AggregatorsSheet,
    'food-cost':FoodCostSheet,
    'service-charge':ServiceChargeSheet,
  };

  // FY 2022-23 up to the current FY (a fixed list used to stop at 2026-27).
  const FYS=(()=>{const cur=Number(pgCurrent().fy.slice(0,4));const out=[];for(let y=2022;y<=cur;y++)out.push(y+'-'+String(y+1).slice(2));return out;})();

  const accessibleSalons=salons.filter(s=>userCanSeeOutlet(user,s.id)); // Super Admin: all; everyone else: outlets given in User Management
  // 🔔 "Open" — straight to the sheet that fixes the alert (period picker first if none is set yet).
  const openFromAlert=(sn,tabId)=>{
    const dp=(activePage==='salon'&&selectedSalon&&selectedSalon.id===sn.id&&period)||defaultPeriods[sn.id];
    if(!dp){handleSelectSalon(sn);return;}
    setPeriod(dp);setSelFY(dp.fy);setSelectedSalon(sn);setActivePage('salon');navToSalonTab(tabId);
  };
  const renderPage=()=>{
    if(gateFor||(activePage==='salon'&&!period)){
      const gateSalon=gateFor||selectedSalon;
      return React.createElement(PeriodGate,{salon:gateSalon,initial:period||(gateSalon&&defaultPeriods[gateSalon.id])||null,
        hadDefault:!!(gateSalon&&defaultPeriods[gateSalon.id]),onConfirm:confirmPeriod,
        onCancel:selectedSalon&&period?()=>setGateFor(null):(()=>{setGateFor(null);setActivePage('master-sheet')})});
    }
    if(activePage==='collaboration')return React.createElement(CollaborationReview,{user,salons:accessibleSalons,submissions,setSubmissions});
    if(activePage==='dashboard'&&salons.length===0)return React.createElement(GettingStarted,{onAddSalon:()=>setActivePage('master-sheet'),isAdmin});
    if(activePage==='dashboard')return React.createElement(MasterDashboard,{selFY,setSelFY,FYS,accessibleSalons,dashTab,setDashTab,onOpenOutletTab:openFromAlert});
    if(activePage==='insights')return React.createElement(OwnerInsights,{accessibleSalons,user});
    if(activePage==='master-sheet')return React.createElement(MasterSheet,{onSelect:handleSelectSalon,salons,setSalons:setSalonsAndSync,user});
    if(activePage==='pnl')return React.createElement(PnLSheet,null);
    if(activePage==='reports')return React.createElement(ReportsHub,{onNav:(p)=>setActivePage(p),onSalon:(s)=>handleSelectSalon(s)});
    if(activePage==='users')return React.createElement(UserManagement,null);
    if(activePage==='settings')return React.createElement(MasterSettings,{autoBackupOn,setAutoBackupOn,lastAutoBackup,salons});
    if(activePage==='salon'){
      const Comp=SALON_TAB_COMPONENTS[salonTab]||MasterSalarySheet;
      return React.createElement('div',{className:'fade-in'},
        // Phone: the outlet name is already in the topbar, so this bar is hidden there.
        React.createElement('div',{className:'hide-phone',style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'12px 16px',marginBottom:16,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}},
          React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},'Outlet:'),
          React.createElement('span',{style:{fontSize:13,color:'var(--accent)',fontWeight:500}},selectedSalon?.name),
          React.createElement('span',{style:{marginLeft:'auto',fontSize:11,color:'var(--text3)',cursor:'pointer'},onClick:()=>setActivePage('master-sheet')},'← Back to Master Sheet')
        ),
        React.createElement('div',{className:'period-bar'},
          React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},'Period'),
          React.createElement('span',{className:'pv'},pgLabel(period)),
          selectedSalon&&defaultPeriods[selectedSalon.id]?React.createElement('span',{className:'badge badge-green'},'Default'):null,
          React.createElement('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:'auto'},onClick:()=>setGateFor(selectedSalon)},'Change period'),
          selectedSalon&&defaultPeriods[selectedSalon.id]?React.createElement('button',{className:'btn btn-ghost btn-sm',
            onClick:()=>{pgSave(null,selectedSalon.id);setDefaultPeriods(prev=>{const n={...prev};delete n[selectedSalon.id];return n;});addToast('Default cleared for this outlet — it will ask for a period again','info')}},'Clear default'):null
        ),
        // Phone: one big "current sheet" button opening the full-screen sheet picker, instead of a
        // 27-tab strip that shows two tabs at a time.
        (()=>{const cur=visibleSalonTabs.find(t=>t.id===salonTab);
          return React.createElement('button',{type:'button',className:'module-switch',onClick:()=>{setModuleQuery('');setModulePickerOpen(true);}},
            React.createElement('span',{className:'ms-icon'},cur?cur.icon:'📋'),
            React.createElement('span',null,cur?cur.label:'Choose a sheet'),
            React.createElement('span',{className:'ms-more'},'All sheets ▾'));})(),
        React.createElement('div',{className:'hide-phone',style:{display:'flex',alignItems:'center',gap:6,marginBottom:20}},
          React.createElement('button',{type:'button','aria-label':'Scroll sheets left',className:'btn btn-ghost btn-sm',style:{flexShrink:0,padding:'6px 9px'},onClick:()=>salonTabBarScrollTo(-1)},'‹'),
          React.createElement('div',{className:'tab-bar',id:'salon-tab-bar',style:{marginBottom:0,flex:1}},
            visibleSalonTabs.map(t=>React.createElement('button',{key:t.id,className:`tab-btn ${salonTab===t.id?'active':''}`,onClick:()=>setSalonTab(t.id),
              style:{'--tabc':SALON_TAB_GROUP_COLORS[t.group]||'var(--accent)','--tabc-rgb':SALON_TAB_GROUP_COLORS_RGB[t.group]||'47,95,224'}},
              React.createElement('span',{style:{display:'inline-block',width:7,height:7,borderRadius:'50%',background:SALON_TAB_GROUP_COLORS[t.group]||'var(--text3)',boxShadow:'0 0 5px rgba('+(SALON_TAB_GROUP_COLORS_RGB[t.group]||'47,95,224')+',0.7)',flexShrink:0}}),
              React.createElement('span',{className:'tab-btn-icon'},t.icon),t.label))
          ),
          React.createElement('button',{type:'button','aria-label':'Scroll sheets right',className:'btn btn-ghost btn-sm',style:{flexShrink:0,padding:'6px 9px'},onClick:()=>salonTabBarScrollTo(1)},'›')
        ),
        salonTab==='outlet-dashboard'
          ?React.createElement(OutletDashboard,{key:'dash-outlet-'+(selectedSalon?selectedSalon.id:'none'),salon:selectedSalon,period,onNavTab:navToSalonTab})
          :salonTab==='billing'
            ?React.createElement(BillingSheet,{key:'billing-'+(selectedSalon&&selectedSalon.id),salon:selectedSalon})
            :React.createElement(Comp,{key:salonTab+'-outlet-'+(selectedSalon?selectedSalon.id:'none'),period,salon:selectedSalon,user,
                onRequestVendorPayment:(category,date)=>{setPendingVendorCategory(category);setPendingVendorPaymentDate(date||null);setSalonTab('vendors');},
                pendingVendorCategory:salonTab==='vendors'?pendingVendorCategory:null,
                pendingVendorPaymentDate:salonTab==='vendors'?pendingVendorPaymentDate:null,
                onConsumePendingVendorCategory:()=>{setPendingVendorCategory(null);setPendingVendorPaymentDate(null);},
                onNavTab:navToSalonTab})
      );
    }
  };

  // Same per-outlet sheet-permission filter as visibleSalonTabs above, but usable for ANY outlet
  // (visibleSalonTabs is scoped to whichever outlet is currently open) — the command palette
  // used to list every sheet of every outlet unfiltered, straight from SALON_TABS, which let
  // Ctrl+F jump a user straight into a sheet their own permissions say "No Access" to, bypassing
  // the tab bar being hidden (the only enforcement that existed before this).
  const sheetsAllowedForSalon=(sn)=>{
    if(!user||user.role==='Super Admin')return salonTabsFor(sn);
    const oa=(user.sheetAccessByOutlet&&user.sheetAccessByOutlet[sn.id])||user.sheetAccess||null;
    const base=!oa?salonTabsFor(sn):salonTabsFor(sn).filter(t=>(oa[t.id]||'View Only')!=='No Access'||(isSummaryApproverRole(user)&&(t.id==='salary-working'||t.id==='incentive-working')));
    return base.filter(t=>!isReportOnlyRole||REPORTS_ONLY_TAB_IDS.includes(t.id));
  };
  const CMD_ACTIONS=[
    ...GLOBAL_NAV.map(n=>({label:n.label,group:'Go to',icon:n.icon,run:()=>setActivePage(n.id)})),
    ...accessibleSalons.map(sn=>({label:sn.name,group:'Outlet',icon:sn.businessType==='Restaurant'?'🍽':'💈',run:()=>handleSelectSalon(sn)})),
    ...accessibleSalons.flatMap(sn=>sheetsAllowedForSalon(sn).map(t=>({label:sn.name.split('—')[0].trim()+' → '+t.label,group:'Sheet',icon:'📄',
      run:()=>{setSelectedSalon(sn);setActivePage('salon');navToSalonTab(t.id);}}))),
    {label:'Sign out',group:'Account',icon:'⏻',run:logout},
  ];

  return React.createElement(React.Fragment,null,
    React.createElement(ToastContainer,{toasts,remove:removeToast}),
    showHelp&&React.createElement(HelpPanel,{onClose:()=>setShowHelp(false)}),
    React.createElement(CommandPalette,{open:cmdOpen,setOpen:setCmdOpen,actions:CMD_ACTIONS}),
    React.createElement(DueReminderPopup,{user,accessibleSalons,onOpenRegister:()=>{setDashTab('compliance');setActivePage('dashboard');}}),
    React.createElement('div',{className:'app'},
    sidebarOpen&&React.createElement('div',{className:'sidebar-backdrop show',onClick:closeSidebar}),
    React.createElement('div',{className:'sidebar'+(sidebarOpen?' open':'')},
      React.createElement('div',{className:'sidebar-logo'},
        React.createElement('div',{className:'logo-text'},'SalonOS'),
        React.createElement('div',{className:'logo-sub'},'Management Suite')
      ),
      React.createElement('div',{className:'sidebar-nav'},
        React.createElement('div',{className:'nav-section'},'Global'),
        GLOBAL_NAV.map(n=>React.createElement('div',{key:n.id,className:`nav-item ${activePage===n.id?'active':''}`,tabIndex:0,role:'button',
          onClick:()=>{setActivePage(n.id);closeSidebar();},onKeyDown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setActivePage(n.id);closeSidebar();}}},
          React.createElement('span',{className:'icon'},n.icon),n.label
        )),
        React.createElement('div',{className:'nav-divider'}),
        React.createElement('div',{className:'nav-section'},'Outlets'),
        accessibleSalons.map(s=>React.createElement('div',{key:s.id,
          className:`nav-item ${activePage==='salon'&&selectedSalon?.id===s.id?'active':''}`,
          tabIndex:0,role:'button',
          onClick:()=>{handleSelectSalon(s);closeSidebar();},onKeyDown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();handleSelectSalon(s);closeSidebar();}}},
          React.createElement('span',{className:'icon'},s.businessType==='Restaurant'?'🍽':'💈'),
          React.createElement('span',{style:{fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},s.name.split('—')[0].trim())
        ))
      ),
      React.createElement('div',{style:{padding:'0 12px 10px'}},
        React.createElement('button',{className:'help-trigger',onClick:()=>setShowHelp(true)},
          React.createElement('span',null,'❓'),React.createElement('span',null,'Help & Guide')
        )
      ),
      React.createElement('div',{className:'sidebar-user'},
        React.createElement('div',{className:'user-info'},
          React.createElement('div',{className:'user-avatar'},user?.name?.slice(0,2).toUpperCase()),
          React.createElement('div',null,
            React.createElement('div',{className:'user-name'},user?.name),
            React.createElement('div',{className:'user-role'},roleLabelForUser(user))
          )
        ),
        React.createElement('div',{style:{fontSize:9.5,color:'var(--text3)',textAlign:'center',marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)',letterSpacing:'0.02em'}},'Developed By CA Dharmender Saini, Gurugram')
      )
    ),
    React.createElement('div',{className:'main'+(activePage==='salon'&&selectedSalon&&period&&!gateFor?' has-bottom-nav':'')},
      React.createElement('div',{className:'topbar'},
        React.createElement('div',{className:'topbar-breadcrumb',style:{display:'flex',alignItems:'center',gap:10}},
          React.createElement('button',{className:'sidebar-hamburger',title:'Menu',onClick:()=>setSidebarOpen(o=>!o)},
            React.createElement('span',null,'☰')),
          canGoBack&&React.createElement('button',{className:'topbar-icon-btn',title:'Go back to the previous screen (Alt+←)',onClick:goBack,style:{padding:'4px 8px'}},
            React.createElement('span',null,'←'),React.createElement('span',{className:'lbl-full'},'Back')
          ),
          React.createElement('span',{className:'topbar-title'},activePage==='salon'&&selectedSalon?selectedSalon.name:'SalonOS')
        ),
        React.createElement('div',{className:'topbar-right'},
          CLOUD_SYNC_ENABLED&&user&&accessibleSalons.length>0&&React.createElement(AskSalonOS,{user,salons:accessibleSalons,currentSalonId:activePage==='salon'&&selectedSalon?selectedSalon.id:null}),
          CLOUD_SYNC_ENABLED&&user&&React.createElement(AlertsBell,{user,salons:accessibleSalons,onOpen:openFromAlert}),
          React.createElement('button',{className:'topbar-icon-btn hide-phone',title:'Reload the app',
            onClick:()=>window.location.reload()},React.createElement(IconRefresh,null),React.createElement('span',null,'Refresh')),
          CLOUD_SYNC_ENABLED
            // Cloud mode: show whether edits have actually reached the cloud, not just this browser.
            ?React.createElement('button',{className:'topbar-icon-btn',
              title:cloudStatus.state==='error'?'Not saved to the cloud yet ('+(cloudStatus.error||'network error')+') — kept on this device and retrying automatically'
                :cloudStatus.state==='saving'?'Saving your changes to the cloud…'
                :'Everything is saved to the cloud'+(cloudStatus.lastSyncedAt?' — last saved '+relativeTimeFromNow(cloudStatus.lastSyncedAt):''),
              style:cloudStatus.state==='error'?{color:'var(--red)',borderColor:'var(--red)'}:undefined,
              onClick:()=>{if(cloudStatus.state==='error'){retryDirtyCloudKeys();addToast('Retrying cloud save…','info');}else addToast(cloudStatus.state==='saving'?'Saving to the cloud…':'All changes are saved to the cloud','success');}},
              React.createElement(IconSave,null),
              React.createElement('span',{className:'lbl-full'},cloudStatus.state==='error'?'NOT saved — retrying':cloudStatus.state==='saving'?'Saving…':'Saved to cloud'),
              React.createElement('span',{className:'lbl-short'},cloudStatus.state==='error'?'Not saved':cloudStatus.state==='saving'?'Saving…':'Saved'),
              React.createElement('span',{className:'save-pulse-dot'+(saveActivity.pulsing||cloudStatus.state==='saving'?' active':'')})
            )
            :React.createElement('button',{className:'topbar-icon-btn',
            title:saveActivity.lastSavedAt?'Last saved '+relativeTimeFromNow(saveActivity.lastSavedAt)+' — all changes save automatically':'All changes are saved automatically',
            onClick:()=>addToast('All changes saved','success')},
            React.createElement(IconSave,null),
            React.createElement('span',null,saveActivity.lastSavedAt?'Saved '+relativeTimeFromNow(saveActivity.lastSavedAt):'Save'),
            React.createElement('span',{className:'save-pulse-dot'+(saveActivity.pulsing?' active':'')})
          ),
          // FY selector in topbar — while inside an outlet, this mirrors that outlet's own period
          // (set via the period bar below) rather than being a second, independently-changeable
          // FY, so the two never show conflicting values. Elsewhere (Master Dashboard etc.) it's
          // the normal editable global-report FY selector.
          React.createElement('button',{className:'theme-toggle hide-phone',onClick:()=>setTheme(theme==='light'?'dark':'light'),
            title:theme==='light'?'Switch to dark':'Switch to light'},theme==='light'?React.createElement(IconMoon,null):React.createElement(IconSun,null),
            React.createElement('span',null,theme==='light'?'Dark':'Light')),
          React.createElement('div',{className:'kbd-hint hide-phone',onClick:()=>setCmdOpen(true),title:'Search sheets, employees and vendors (Ctrl+F)'},
            React.createElement(IconSearch,{size:13}),
            React.createElement('span',null,'Search'),
            React.createElement('kbd',null,navigator.platform.indexOf('Mac')>-1?'⌘F':'Ctrl F')),
          activePage==='salon'&&period
            ?React.createElement('span',{className:'hide-phone',title:'Set via this outlet\'s period picker below',style:{fontSize:11,padding:'4px 8px',border:'1px solid var(--border)',borderRadius:6,color:'var(--text2)'}},'FY '+period.fy)
            :React.createElement('select',{className:'form-control hide-phone',style:{width:'auto',fontSize:11,padding:'4px 8px'},value:selFY,onChange:e=>setSelFY(e.target.value)},FYS.map(f=>React.createElement('option',{key:f,value:f},'FY '+f))),
          React.createElement('div',{className:'hide-phone',style:{fontSize:12,color:'var(--text3)'}},new Date().toLocaleDateString('en-IN',{weekday:'short',month:'short',day:'numeric',year:'numeric'})),
          (()=>{const c=!CLOUD_SYNC_ENABLED?'var(--green)':cloudStatus.state==='error'?'var(--red)':cloudStatus.state==='saving'?'var(--orange)':'var(--green)';
            return React.createElement('div',{className:'hide-phone',title:!CLOUD_SYNC_ENABLED?'Synced locally on this device':cloudStatus.state==='error'?'Cloud save failing — retrying':cloudStatus.state==='saving'?'Saving to the cloud…':'Live — synced with the cloud',style:{width:8,height:8,borderRadius:'50%',background:c,boxShadow:'0 0 6px '+c}});})(),
          React.createElement('span',{className:'role-chip hide-phone'},roleLabelForUser(user)),
          React.createElement('button',{className:'topbar-icon-btn hide-phone',onClick:logout},React.createElement(IconLogOut,null),React.createElement('span',null,'Sign Out')),
          // Phone: everything above folds into one ⋯ menu so the topbar stays a single row.
          React.createElement('button',{className:'topbar-icon-btn show-phone','aria-label':'More options','aria-expanded':phoneMenuOpen,style:{fontSize:18,padding:'4px 12px',minHeight:38},onClick:()=>setPhoneMenuOpen(o=>!o)},'⋯')
        ),
        phoneMenuOpen&&React.createElement(React.Fragment,null,
          React.createElement('div',{className:'phone-menu-backdrop',onClick:()=>setPhoneMenuOpen(false)}),
          React.createElement('div',{className:'phone-menu',role:'menu'},
            React.createElement('button',{onClick:()=>{setPhoneMenuOpen(false);setCmdOpen(true);}},React.createElement(IconSearch,{size:16}),'Search sheets & outlets'),
            React.createElement('button',{onClick:()=>window.location.reload()},React.createElement(IconRefresh,null),'Refresh'),
            React.createElement('button',{onClick:()=>setTheme(theme==='light'?'dark':'light')},theme==='light'?React.createElement(IconMoon,null):React.createElement(IconSun,null),theme==='light'?'Dark mode':'Light mode'),
            activePage==='salon'&&period
              ?React.createElement('div',{className:'pm-row',style:{color:'var(--text2)'}},'📅 '+pgLabel(period))
              :React.createElement('div',{className:'pm-row'},'📅',React.createElement('select',{className:'form-control',style:{flex:1,fontSize:16},value:selFY,onChange:e=>setSelFY(e.target.value)},FYS.map(f=>React.createElement('option',{key:f,value:f},'FY '+f)))),
            React.createElement('button',{style:{color:'var(--red)'},onClick:()=>{setPhoneMenuOpen(false);logout();}},React.createElement(IconLogOut,null),'Sign Out'),
            React.createElement('div',{className:'pm-meta'},(user?.name||'')+' · '+(user?.role||'')+' · '+new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}))
          )
        )
      ),
      !CLOUD_SYNC_ENABLED&&backupOverdue&&!backupBannerDismissed&&React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'10px 20px',background:'rgba(255,159,67,0.12)',borderBottom:'1px solid rgba(255,159,67,0.35)',fontSize:12.5,color:'var(--text)'}},
        React.createElement('div',null,
          React.createElement('span',{style:{marginRight:6}},'⚠'),
          backupDaysOverdue===null
            ?'No backup has ever been downloaded for this browser. '
            :'It\'s been '+backupDaysOverdue+' day'+(backupDaysOverdue===1?'':'s')+' since your last downloaded backup. ',
          'This app\'s data lives only in this browser — a cleared cache or lost device means it\'s gone unless you\'ve downloaded a copy.'
        ),
        React.createElement('div',{style:{display:'flex',gap:8,flexShrink:0}},
          React.createElement('button',{className:'btn btn-primary btn-sm',onClick:()=>{downloadSalonOSBackup();setBackupBannerDismissed(true);}},'⬇ Download Backup Now'),
          React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setBackupBannerDismissed(true)},'Dismiss for now')
        )
      ),
      newVersion&&React.createElement('div',{className:'update-banner'},
        React.createElement('div',null,'✨ A new version of SalonOS is available.'),
        React.createElement('button',{className:'btn btn-primary btn-sm',onClick:updateNow},'Update now')
      ),
      // Floating, so it never pushes the page down when it appears or goes away.
      CLOUD_SYNC_ENABLED&&cloudUpdateWaiting&&React.createElement('div',{title:'Other users saved changes to this outlet. They load by themselves when you pause — or load them now (finish or close any open form first).',style:{position:'fixed',right:16,bottom:76,zIndex:60,display:'flex',alignItems:'center',gap:10,padding:'6px 8px 6px 14px',background:'var(--bg2)',border:'1px solid var(--accent)',borderRadius:999,boxShadow:'0 4px 16px rgba(0,0,0,0.15)',fontSize:12.5,color:'var(--text)',maxWidth:'calc(100vw - 32px)'}},
        React.createElement('span',null,'↻ New changes from another user'),
        React.createElement('button',{className:'btn btn-primary btn-sm',onClick:()=>{_lastRemountRef.current=0;applyCloudUpdatesNow();}},'Show latest')
      ),
      React.createElement('div',{className:'content'},React.createElement('div',{key:activePage+'_'+(selectedSalon?.id||'')+'_'+dataVersion,className:'content-frame'},activePage!=='settings'&&React.createElement(PendingApprovalsStrip,{onOpen:()=>{setActivePage('settings');setTimeout(()=>{const el=document.getElementById('controls-card');if(el)el.scrollIntoView({behavior:'smooth'});},300);}}),renderPage())),
      // ── Phone bottom tab bar inside an outlet: the four everyday sheets (only those this user
      // may open) plus "All sheets". Hidden on wider screens by CSS. ──
      activePage==='salon'&&selectedSalon&&period&&!gateFor&&(()=>{
        const FAVS=['outlet-dashboard','daily-sales','attendance','master-salary'];
        const SHORT={'outlet-dashboard':'Home','daily-sales':'Sales','attendance':'Attendance','master-salary':'Staff'};
        const favs=FAVS.map(id=>visibleSalonTabs.find(t=>t.id===id)).filter(Boolean);
        const others=visibleSalonTabs.filter(t=>!FAVS.includes(t.id));
        while(favs.length<4&&others.length)favs.push(others.shift());
        const onFav=favs.some(t=>t.id===salonTab);
        return React.createElement('nav',{className:'bottom-nav','aria-label':'Outlet sheets'},
          favs.map(t=>React.createElement('button',{key:t.id,type:'button',className:salonTab===t.id?'active':'',onClick:()=>setSalonTab(t.id)},
            React.createElement('span',{className:'bn-icon'},t.icon),SHORT[t.id]||t.label)),
          React.createElement('button',{type:'button',className:!onFav||modulePickerOpen?'active':'',onClick:()=>{setModuleQuery('');setModulePickerOpen(true);}},
            React.createElement('span',{className:'bn-icon'},'▦'),'All sheets'));
      })(),
      modulePickerOpen&&activePage==='salon'&&React.createElement('div',{className:'module-sheet',role:'dialog','aria-label':'All sheets'},
        React.createElement('div',{className:'module-sheet-head'},
          React.createElement('input',{className:'form-control',placeholder:'Search sheets…',value:moduleQuery,onChange:e=>setModuleQuery(e.target.value)}),
          React.createElement('button',{type:'button',className:'btn btn-ghost',onClick:()=>setModulePickerOpen(false)},'Close')
        ),
        React.createElement('div',{className:'module-grid'},
          visibleSalonTabs.filter(t=>!moduleQuery.trim()||t.label.toLowerCase().includes(moduleQuery.trim().toLowerCase())).map(t=>
            React.createElement('button',{key:t.id,type:'button',className:salonTab===t.id?'active':'',style:{'--mgc':SALON_TAB_GROUP_COLORS[t.group]||'var(--accent)'},
              onClick:()=>{setSalonTab(t.id);setModulePickerOpen(false);const el=document.querySelector('.content');if(el)el.scrollTop=0;}},
              React.createElement('span',{className:'mg-icon'},t.icon),t.label))
        )
      )
    )
  ));
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App,null));

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  });
}

// ── Table Scroll Arrows ─────────────────────────────────────────────────────────────────────
// Auto-applies to every .table-wrap in the app (59+ tables across every sheet), current and
// future, without touching any of their individual render call sites. Deliberately lives outside
// React's own DOM tree — appended once to document.body — so a table's own re-renders (typing
// into a cell, a toast firing, a row being added) can never wipe these two buttons out the way
// children manually injected inside a React-managed node would be.
(function(){
  function init(){
    const mkBtn=(dir,label)=>{
      const b=document.createElement('button');
      b.type='button';b.className='table-scroll-arrow table-scroll-arrow-'+(dir<0?'left':'right');
      b.setAttribute('aria-label',label);b.textContent=dir<0?'‹':'›';
      document.body.appendChild(b);
      return b;
    };
    const leftBtn=mkBtn(-1,'Scroll table left');
    const rightBtn=mkBtn(1,'Scroll table right');
    let activeWrap=null;

    const isScrollable=(el)=>!!el&&el.scrollWidth>el.clientWidth+2;

    // Finds the nearest horizontally-scrollable ancestor of a <table> by ACTUAL computed
    // overflow-x behavior, not by a specific className — some tables in this app sit inside a
    // div with className:'table-wrap', others inside a div with an inline
    // style:{overflowX:'auto'} instead (~24 of them, including Salary Working, the one from the
    // original screenshot this feature was requested for). Walking up from every <table> and
    // checking getComputedStyle catches both patterns, and any future one, without needing to
    // know which convention a given screen happens to use.
    function scrollableAncestorOf(table){
      let el=table.parentElement,hops=0;
      while(el&&hops<8){
        const cs=getComputedStyle(el);
        if((cs.overflowX==='auto'||cs.overflowX==='scroll')&&isScrollable(el))return el;
        el=el.parentElement;hops++;
      }
      return null;
    }

    // The table under the mouse wins (several tables can be on screen at once); otherwise the one
    // with the most vertical space on-screen right now.
    let pointerWrap=null;
    document.addEventListener('mousemove',e=>{
      const t=e.target&&e.target.closest&&e.target.closest('table');
      if(t){const w=scrollableAncestorOf(t);if(w)pointerWrap=w;}
    },{passive:true});
    const visibleHeight=w=>{const r=w.getBoundingClientRect();return Math.min(r.bottom,window.innerHeight)-Math.max(r.top,0);};
    function pickActiveWrap(){
      if(pointerWrap&&document.body.contains(pointerWrap)&&isScrollable(pointerWrap)&&visibleHeight(pointerWrap)>24)return pointerWrap;
      const tables=document.querySelectorAll('table');
      let best=null,bestVisible=0;
      tables.forEach(t=>{
        const w=scrollableAncestorOf(t);
        if(!w)return;
        const visible=visibleHeight(w);
        if(visible>bestVisible&&w.getBoundingClientRect().width>0){bestVisible=visible;best=w;}
      });
      return bestVisible>24?best:null;
    }

    function hide(){leftBtn.classList.remove('visible');rightBtn.classList.remove('visible');}

    // A column frozen on the left (sticky with a left offset) — header cells that are only sticky
    // to the top (so the heading stays visible while scrolling down) don't count.
    const frozenLeft=c=>{const cs=getComputedStyle(c);return cs.position==='sticky'&&cs.left!=='auto';};
    // Width of the frozen (sticky) columns on the left, so a step never hides a column under them.
    function stickyWidth(wrap){
      const row=wrap.querySelector('thead tr')||wrap.querySelector('tr');
      if(!row)return 0;
      let w=0;
      for(const c of row.children){if(frozenLeft(c))w+=c.getBoundingClientRect().width;else break;}
      return Math.min(w,wrap.clientWidth*0.6);
    }
    // Column start positions (in the table's own scroll coordinates), from the header row.
    function columnStarts(wrap){
      const row=wrap.querySelector('thead tr')||wrap.querySelector('tr');
      if(!row)return[];
      const base=wrap.getBoundingClientRect().left-wrap.scrollLeft;
      return[...row.children].filter(c=>!frozenLeft(c)).map(c=>Math.round(c.getBoundingClientRect().left-base));
    }
    // One column at a time: the next / previous column lines up just right of the frozen columns.
    // Clicks made while the previous smooth scroll is still moving count from where THAT scroll is
    // heading, not from the half-way position — otherwise quick clicks got lost or even stepped
    // back. The pending target is forgotten shortly after the last click.
    let pendingWrap=null,pendingLeft=null,pendingTimer=null;
    function step(dir){
      const w=activeWrap;if(!w)return;
      const from=(pendingWrap===w&&pendingLeft!=null)?pendingLeft:w.scrollLeft;
      const sw=stickyWidth(w),starts=columnStarts(w),edge=from+sw;
      const max=w.scrollWidth-w.clientWidth;
      let target=null;
      if(dir>0){const next=starts.find(x=>x>edge+4);target=next!=null?next-sw:from+w.clientWidth*0.6;}
      else{const prev=starts.filter(x=>x<edge-4).pop();target=prev!=null?prev-sw:0;}
      target=Math.max(0,Math.min(target,max));
      pendingWrap=w;pendingLeft=target;
      clearTimeout(pendingTimer);pendingTimer=setTimeout(()=>{pendingWrap=null;pendingLeft=null;},700);
      w.scrollTo({left:target,behavior:'smooth'});
    }

    function position(){
      activeWrap=pickActiveWrap();
      if(!activeWrap){hide();return;}
      const r=activeWrap.getBoundingClientRect();
      // Middle of the part of the table that is actually on screen (a long table's arrows used to sit
      // beside its first rows, far from where the person is reading).
      const top=Math.max(r.top,64),bottom=Math.min(r.bottom,window.innerHeight-8);
      const midY=bottom>top?(top+bottom)/2:Math.max(24,Math.min(window.innerHeight-24,r.top+r.height/2));
      const sw=stickyWidth(activeWrap);
      leftBtn.style.top=midY+'px';leftBtn.style.left=(r.left+sw+6)+'px';
      rightBtn.style.top=midY+'px';rightBtn.style.left=(r.right-40)+'px';
      const cur=(pendingWrap===activeWrap&&pendingLeft!=null)?pendingLeft:activeWrap.scrollLeft;
      const atStart=cur<=2;
      const atEnd=cur>=activeWrap.scrollWidth-activeWrap.clientWidth-2;
      leftBtn.classList.toggle('visible',!atStart);
      rightBtn.classList.toggle('visible',!atEnd);
    }

    leftBtn.addEventListener('click',()=>step(-1));
    rightBtn.addEventListener('click',()=>step(1));

    let raf=null;
    const schedule=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=null;position();});};

    window.addEventListener('scroll',schedule,true); // capture:true so a table-wrap's own internal scroll (which doesn't bubble) still triggers a reposition
    window.addEventListener('resize',schedule);
    // Safety net for layout changes that don't fire a scroll/resize event at all — a tab switch,
    // a row being added/removed, a modal opening. Cheap (a handful of getBoundingClientRect calls
    // at most), so a light interval is simpler and more reliable here than trying to hook every
    // possible React state change that could resize a table.
    setInterval(schedule,600);
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
