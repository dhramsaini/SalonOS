// ════════════════════════════════════════════════════════════════════════════════════════════════
// Vendors — more checks and safety (each switch in Controls → Entry checks → Vendor bills):
//  vpCrossDup   same invoice no. and amount already entered under a different vendor (asks)
//  vpTdsLimit   vendors whose bills this financial year crossed the TDS limit with no TDS deducted
//  vpTdsSheet   quarterly party-wise TDS sheet (Excel) for the TDS return
//  vpPan        vendor PAN (filled from the GSTIN when blank); TDS without a PAN is warned (20%)
//  vpGstInput   bills with GST whose vendor GSTIN is missing or wrong — input credit at risk
//  vpBin        deleted bills and payments kept 90 days with Restore
//  vpHistory    every change to a bill (who, when, what) — 🕘 History on the bill
// ════════════════════════════════════════════════════════════════════════════════════════════════
function vpOn(id,sid){return typeof controlOn!=='function'||controlOn(id,sid);}
const vpR=n=>'₹'+Math.round(Number(n)||0).toLocaleString('en-IN');
const vpUser=()=>(typeof currentSessionUser==='function'&&(currentSessionUser()||{}).name)||'';
const vpNorm=n=>String(n==null?'':n).toLowerCase().replace(/[\s\-\/.]/g,'');
function vpFyStartOf(iso){const d=String(iso||'');const y=Number(d.slice(0,4)),m=Number(d.slice(5,7));return m>=4?y:y-1;}
function vpBookIso(i){return toISO(i&&(i.bookingDate||i.invoiceDate))||'';}

// ── #1 Same invoice no. + amount under another vendor ──
function vpCrossDupOk(sid,inv,list,vendors,editId){
  if(!vpOn('vpCrossDup',sid)||!inv||inv.docNature==='Performa Invoice')return true;
  const k=vpNorm(inv.invoiceNo);if(!k)return true;
  const hit=(list||[]).find(x=>x&&x.id!==editId&&x.docNature!=='Performa Invoice'&&String(x.vendorId)!==String(inv.vendorId)&&vpNorm(x.invoiceNo)===k&&Math.abs((Number(x.amount)||0)-(Number(inv.amount)||0))<1);
  if(!hit)return true;
  const vn=((vendors||[]).find(v=>v.id===hit.vendorId)||{}).name||hit.vendorId;
  return window.confirm('Invoice No. '+inv.invoiceNo+' for '+vpR(inv.amount)+' is already entered under '+vn+' (dated '+(hit.invoiceDate||'')+').\n\nIs this a different bill? OK to save it anyway, Cancel to check.');
}

// ── #8 PAN ──
function vpPanOk(p){return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(p||'').toUpperCase());}
function vpVendorPan(v){if(!v)return'';if(vpPanOk(v.pan))return String(v.pan).toUpperCase();const g=String(v.gst||'').toUpperCase();return g.length===15&&vpPanOk(g.slice(2,12))?g.slice(2,12):'';}
function VendorPanField({form,setForm}){
  const h=React.createElement;const sid=null;if(!vpOn('vpPan',sid))return null;
  const fromGst=!form.pan&&vpVendorPan({gst:form.gst});const bad=form.pan&&!vpPanOk(form.pan);
  return h('div',{className:'form-group'},h('label',{htmlFor:'vp-pan'},'PAN'),
    h('input',{id:'vp-pan',className:'form-control',style:{textTransform:'uppercase'},value:form.pan||'',placeholder:fromGst||'ABCDE1234F',maxLength:10,onChange:e=>setForm(f=>({...f,pan:e.target.value.toUpperCase().trim()}))}),
    h('div',{style:{fontSize:10.5,marginTop:3,color:bad?'var(--orange)':'var(--text3)'}},bad?'⚠ PAN is 5 letters, 4 digits, 1 letter.':fromGst?'From the GSTIN: '+fromGst+' (used when left blank)':'Needed for TDS — without a PAN, TDS is deducted at 20%.'));
}

// ── #6 TDS limits (Income-tax, from 1 Apr 2025): what each kind of payment allows before TDS ──
const VP_TDS_KIND={contract:{label:'Contractor (194C / 1023-1024)',single:30000,year:100000},prof:{label:'Professional / technical fees (194J / 1026-1028)',year:50000},
  commission:{label:'Commission (194H / 1006)',year:20000},rent:{label:'Rent (194-I / 1008-1009)',month:50000},insurance:{label:'Insurance commission (194D / 1005)',year:20000}};
function vpTdsKindOf(sid,v,cat){
  const s=String((v&&v.tdsSection)||'');
  if(/^194C|393-102[34]$/.test(s))return'contract';if(/^194J|393-102[678]$/.test(s))return'prof';if(/^194H|393-1006$/.test(s))return'commission';
  if(/^194I\(|393-100[89]$/.test(s))return'rent';if(/^194D|393-1005$/.test(s))return'insurance';
  const c=cat||(v&&v.cat)||'';
  if(['Professional Fee','Royalty'].includes(c))return'prof';if(['Rent','Staff Room Rent','DG Rent'].includes(c))return'rent';
  if(['Maintenance Expenses','Housekeeping','Drycleaning Expenses','Marketing','Uniform Expenses','Repair & Maintenance'].includes(c))return'contract';
  return'';
}
const vpBase=i=>{const t=(Number(i.taxable)||0)+(Number(i.freight)||0);return t>0?t:(Number(i.amount)||0);};
// Vendors over a limit this FY with bills that carry no TDS: [{vendor, kind, total, limit, why, untaxed}]
function vpTdsWatch(sid,asOfIso){
  if(!vpOn('vpTdsLimit',sid))return[];const today=asOfIso||localTodayIso();const fy=vpFyStartOf(today);
  const inv=(loadVendorInvoices(sid)||[]).filter(i=>i&&i.docNature!=='Performa Invoice'&&vpBookIso(i)&&vpFyStartOf(vpBookIso(i))===fy);
  const out=[];
  (loadVendors(sid)||[]).forEach(v=>{
    const mine=inv.filter(i=>String(i.vendorId)===String(v.id));if(!mine.length)return;
    const kind=vpTdsKindOf(sid,v,mine[0].category);if(!kind)return;const K=VP_TDS_KIND[kind];
    const untaxed=mine.filter(i=>!(Number(i.tdsAmt)>0));if(!untaxed.length)return;
    const total=mine.reduce((t,i)=>t+vpBase(i),0);let why='';
    if(K.year&&total>K.year)why='bills this year '+vpR(total)+' — above '+vpR(K.year);
    else if(K.single&&mine.some(i=>vpBase(i)>K.single))why='a single bill above '+vpR(K.single);
    else if(K.month){const bym={};mine.forEach(i=>{const m=vpBookIso(i).slice(0,7);bym[m]=(bym[m]||0)+vpBase(i);});const m=Object.keys(bym).find(k=>bym[k]>K.month);if(m)why='rent of '+vpR(bym[m])+' in a month — above '+vpR(K.month);}
    if(why)out.push({vendor:v,kind,label:K.label,why,untaxed:untaxed.length,untaxedAmt:untaxed.reduce((t,i)=>t+vpBase(i),0)});
  });
  return out;
}
// Note in the invoice form when TDS isn't ticked but the vendor is over the limit.
function vpTdsLimitNote(sid,form){
  if(!vpOn('vpTdsLimit',sid)||!form||form.tdsApplicable||form.docNature==='Performa Invoice'||!form.vendorId)return null;
  const w=vpTdsWatch(sid).find(x=>String(x.vendor.id)===String(form.vendorId));
  return w?React.createElement('div',{style:{fontSize:11.5,color:'var(--orange)',marginTop:6}},'⚠ '+w.vendor.name+': '+w.why+' ('+w.label+') — TDS is due on this vendor’s bills.'):null;
}
function vpNoPanNote(sid,form,vendors){
  if(!vpOn('vpPan',sid)||!form||!form.tdsApplicable)return null;const v=(vendors||[]).find(x=>x.id===form.vendorId);if(!v||vpVendorPan(v))return null;
  return React.createElement('div',{style:{fontSize:11.5,color:'var(--orange)',marginTop:6}},'⚠ '+v.name+' has no PAN in Vendors — without a PAN, TDS is deducted at 20%. Add the PAN in the vendor’s details, or use 20% here.');
}

// ── #7 Quarterly TDS sheet ──
function vpTdsQuarterRows(sid,fyStart,q){
  const from=q===4?(fyStart+1)+'-01':fyStart+'-'+String(4+(q-1)*3).padStart(2,'0'),to=q===4?(fyStart+1)+'-03':fyStart+'-'+String(6+(q-1)*3).padStart(2,'0');
  const vendors=loadVendors(sid)||[];
  return(loadVendorInvoices(sid)||[]).filter(i=>i&&Number(i.tdsAmt)>0&&i.tdsSection&&vpBookIso(i).slice(0,7)>=from&&vpBookIso(i).slice(0,7)<=to)
    .sort((a,b)=>vpBookIso(a).localeCompare(vpBookIso(b)))
    .map(i=>{const v=vendors.find(x=>x.id===i.vendorId)||{};const tp=(i.payments||[]).find(p=>p.mode==='TDS');
      return[v.name||i.vendorId,vpVendorPan(v)||'PAN NOT AVAILABLE',i.tdsSection,i.invoiceNo||'',i.invoiceDate||'',i.bookingDate||i.invoiceDate||'',Math.round(vpBase(i)*100)/100,Number(i.tdsRate)||'',Number(i.tdsAmt)||0,tp?tp.paidDate:''];});
}
function vpTdsSheetExport(sid,fyStart,q){
  const rows=vpTdsQuarterRows(sid,fyStart,q);if(!rows.length){window.alert('No bills with TDS in Q'+q+' of FY '+fyStart+'-'+String(fyStart+1).slice(2)+'.');return;}
  if(!window.XLSX){window.alert('Excel writer could not load — check the internet connection.');return;}
  const head=['Vendor','PAN','Section / Payment code','Bill No.','Bill date','Booking date','Amount credited (before GST)','Rate %','TDS','TDS date'];
  const tot=rows.reduce((t,r)=>t+r[8],0);const ws=XLSX.utils.aoa_to_sheet([head,...rows,[],['Total','','','','','','','',tot]]);
  const by={};rows.forEach(r=>{by[r[2]]=(by[r[2]]||0)+r[8];});const ws2=XLSX.utils.aoa_to_sheet([['Section / Payment code','TDS'],...Object.entries(by),['Total',tot]]);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Party-wise');XLSX.utils.book_append_sheet(wb,ws2,'Section-wise');
  const o=outletSettings(sid)||{};XLSX.writeFile(wb,'TDS_Q'+q+'_FY'+fyStart+'-'+String(fyStart+1).slice(2)+'_'+String(o.name||'outlet').split('—')[0].trim().replace(/\W+/g,'_')+'.xlsx');
}

// ── #15 Bin for deleted bills and payments ──
function vpBinKey(sid){return outletKey('salonos_vendor_bin',sid);}
function vpBinLoad(sid){try{const v=JSON.parse(cachedLocalGet(vpBinKey(sid))||'[]');const cut=Date.now()-90*864e5;return(Array.isArray(v)?v:[]).filter(b=>b&&new Date(b.at).getTime()>=cut);}catch(e){return[];}}
function vpBinSave(sid,list){safeLocalSet(vpBinKey(sid),JSON.stringify(list.slice(-200)));}
function vpBinStash(sid,kind,obj,meta){
  if(!vpOn('vpBin',sid)||!obj)return;
  vpBinSave(sid,[...vpBinLoad(sid),{id:'VB'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),kind,at:new Date().toISOString(),by:vpUser(),obj:JSON.parse(JSON.stringify(obj)),meta:meta||{}}]);
}
// ── #16 Bill history ──
function vpHistKey(sid){return outletKey('salonos_bill_history',sid);}
function vpHistLoad(sid){try{const v=JSON.parse(cachedLocalGet(vpHistKey(sid))||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}}
function vpHistAdd(sid,invId,what,changes){
  if(!vpOn('vpHistory',sid)||!invId)return;const h=vpHistLoad(sid);
  h[invId]=[...(h[invId]||[]),{at:new Date().toISOString(),by:vpUser(),what,changes:changes||[]}].slice(-50);safeLocalSet(vpHistKey(sid),JSON.stringify(h));
}
const VP_HIST_FIELDS=[['vendorId','Vendor'],['invoiceNo','Invoice No.'],['invoiceDate','Invoice date'],['bookingDate','Booking date'],['dueDate','Due date'],['docNature','Doc nature'],['category','Category'],
  ['taxable','Taxable value'],['igst','IGST'],['cgst','CGST'],['sgst','SGST'],['freight','Freight'],['roundOff','Round off'],['amount','Amount'],['desc','Description'],['tdsSection','TDS section'],['tdsRate','TDS rate'],['tdsAmt','TDS amount']];
// Called on save with the earlier bill (null for a new one) and the bill being saved.
function vpHistNote(sid,old,inv,id){
  if(!vpOn('vpHistory',sid)||!inv)return;
  if(!old){vpHistAdd(sid,id,'Created',[['Amount','',String(inv.amount)]]);return;}
  const ch=[];VP_HIST_FIELDS.forEach(([k,l])=>{const a=old[k]==null?'':String(old[k]),b=inv[k]==null?'':String(inv[k]);if(a!==b&&!(Number(a)===Number(b)&&a!==''&&b!==''))ch.push([l,a,b]);});
  if(!!old.attachment!==!!inv.attachment)ch.push(['Attachment',old.attachment?'yes':'none',inv.attachment?'yes':'none']);
  if(ch.length)vpHistAdd(sid,old.id,'Edited',ch);
}
function BillHistoryButton({sid,inv,vendors}){
  const h=React.createElement;const [open,setOpen]=useState(false);if(!inv||!vpOn('vpHistory',sid))return null;
  const list=(vpHistLoad(sid)[inv.id]||[]).slice().reverse();const vn=id=>((vendors||[]).find(v=>v.id===id)||{}).name||id;
  return h('span',null,
    h('button',{type:'button',className:'btn btn-ghost btn-sm',style:{fontSize:11,padding:'2px 8px'},onClick:e=>{e.stopPropagation();setOpen(true);}},'🕘 History'+(list.length?' ('+list.length+')':'')),
    open&&h('div',{className:'modal-overlay',onClick:e=>{e.stopPropagation();setOpen(false);}},
      h('div',{className:'modal',style:{maxWidth:620,maxHeight:'80vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
        h('div',{className:'modal-title'},'🕘 Changes to bill '+(inv.invoiceNo||inv.id)),
        !list.length&&h('div',{style:{fontSize:12,color:'var(--text3)'}},'No changes recorded yet — history starts from this release.'),
        list.map((x,i)=>h('div',{key:i,style:{borderTop:i?'1px solid var(--border)':'none',padding:'8px 0',fontSize:12.5}},
          h('div',null,h('b',null,x.what),' · '+new Date(x.at).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})+(x.by?' · '+x.by:'')),
          (x.changes||[]).map((c,j)=>h('div',{key:j,style:{color:'var(--text2)',marginLeft:10}},c[0]+': '+(c[0]==='Vendor'?vn(c[1]):c[1]||'—')+' → '+(c[0]==='Vendor'?vn(c[2]):c[2]||'—'))))),
        h('div',{style:{textAlign:'right',marginTop:10}},h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setOpen(false)},'Close')))));
}

// ── Header buttons: TDS sheet, deleted bills ──
function VendorPlusButtons({sid,invoices,setInvoices,vendors}){
  const h=React.createElement;const [m,setM]=useState(null);const [,t]=useState(0);
  const today=localTodayIso();const fy0=vpFyStartOf(today);const [fy,setFy]=useState(fy0);const [q,setQ]=useState(()=>{const mo=Number(today.slice(5,7));return mo>=4&&mo<=6?1:mo<=9&&mo>=7?2:mo>=10?3:4;});
  const bin=vpOn('vpBin',sid)?vpBinLoad(sid):[];const vn=id=>((vendors||[]).find(v=>v.id===id)||{}).name||id;
  const restore=b=>{
    if(b.kind==='bill'){
      const inv={...b.obj};const dse=(inv.payments||[]).filter(p=>p.note==='Auto-recorded from Daily Sales & Exp');
      inv.payments=(inv.payments||[]).filter(p=>p.note!=='Auto-recorded from Daily Sales & Exp');
      setInvoices(prev=>{const has=prev.some(x=>x.id===inv.id);const id=has?nextPrefixedId(prev,'VI-',4):inv.id;return[...prev,{...inv,id}];});
      vpHistAdd(sid,inv.id,'Restored from deleted bills',[]);
      window.alert('Bill '+(inv.invoiceNo||'')+' restored.'+(dse.length?' Its cash payment of '+vpR(dse.reduce((t,p)=>t+Number(p.paidAmount||0),0))+' from Daily Sales & Exp was cleared there when the bill was deleted — enter it again in Daily Sales & Exp.':''));
    }else{
      const id=b.meta&&b.meta.invoiceId;const cur=invoices.find(x=>x.id===id);
      if(!cur){window.alert('The bill this payment belonged to is not in Vendors any more — restore the bill first.');return;}
      setInvoices(prev=>prev.map(x=>x.id===id?{...x,payments:[...(x.payments||[]).filter(p=>p.id!==b.obj.id),b.obj]}:x));
      vpHistAdd(sid,id,'Payment restored',[['Payment','',vpR(b.obj.paidAmount)+' on '+(b.obj.paidDate||'')]]);
    }
    vpBinSave(sid,vpBinLoad(sid).filter(x=>x.id!==b.id));t(x=>x+1);
  };
  return h(React.Fragment,null,
    vpOn('vpTdsSheet',sid)&&h('button',{className:'btn btn-ghost btn-sm',title:'Party-wise TDS of a quarter, for the TDS return',onClick:()=>setM('tds')},'⬇ TDS sheet'),
    bin.length>0&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setM('bin')},'🗂 Deleted bills ('+bin.length+')'),
    m&&h('div',{className:'modal-overlay',onClick:()=>setM(null)},
      h('div',{className:'modal',style:{maxWidth:m==='bin'?720:420,maxHeight:'82vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
        m==='tds'&&h(React.Fragment,null,
          h('div',{className:'modal-title'},'⬇ TDS sheet — quarter'),
          h('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'Every bill with TDS booked in the quarter: vendor, PAN, section / payment code, amount credited, rate and TDS — with a section-wise total. Use it for the TDS return and challans.'),
          h('div',{style:{display:'flex',gap:8,marginBottom:12}},
            h('select',{className:'form-control','aria-label':'Financial year',value:fy,onChange:e=>setFy(Number(e.target.value))},[0,1,2,3].map(k=>h('option',{key:k,value:fy0-k},'FY '+(fy0-k)+'-'+String(fy0-k+1).slice(2)))),
            h('select',{className:'form-control','aria-label':'Quarter',value:q,onChange:e=>setQ(Number(e.target.value))},[[1,'Q1 Apr–Jun'],[2,'Q2 Jul–Sep'],[3,'Q3 Oct–Dec'],[4,'Q4 Jan–Mar']].map(([k,l])=>h('option',{key:k,value:k},l)))),
          h('div',{style:{fontSize:12,marginBottom:12}},vpTdsQuarterRows(sid,fy,q).length+' bill(s) with TDS in this quarter.'),
          h('div',{style:{display:'flex',gap:8,justifyContent:'flex-end'}},h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setM(null)},'Close'),h('button',{className:'btn btn-primary btn-sm',onClick:()=>vpTdsSheetExport(sid,fy,q)},'⬇ Download Excel'))),
        m==='bin'&&h(React.Fragment,null,
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},h('div',{className:'modal-title',style:{border:'none',marginBottom:0}},'🗂 Deleted bills & payments'),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setM(null)},'✕ Close')),
          h('div',{style:{fontSize:11.5,color:'var(--text3)',margin:'4px 0 12px'}},'Kept for 90 days, newest first. Restore puts a bill (with its payments) or a payment (into its bill) back.'),
          bin.slice().reverse().map(b=>h('div',{key:b.id,style:{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',border:'1px solid var(--border)',borderRadius:'var(--r)',marginBottom:6,fontSize:12.5,flexWrap:'wrap'}},
            h('span',{className:'badge '+(b.kind==='bill'?'badge-amber':'badge-blue')},b.kind==='bill'?'Bill':'Payment'),
            b.kind==='bill'?h('span',null,h('b',null,vn(b.obj.vendorId)),' · '+(b.obj.invoiceNo||'—')+' · '+(b.obj.invoiceDate||'')+' · '+vpR(b.obj.amount)+((b.obj.payments||[]).length?' · '+b.obj.payments.length+' payment(s)':''))
              :h('span',null,h('b',null,vpR(b.obj.paidAmount)),' on '+(b.obj.paidDate||'')+' ('+(b.obj.mode||'')+') · bill '+((b.meta&&b.meta.invoiceNo)||'')+' of '+vn(b.meta&&b.meta.vendorId)),
            h('span',{style:{fontSize:11,color:'var(--text3)'}},'deleted '+new Date(b.at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+(b.by?' by '+b.by:'')),
            h('button',{className:'btn btn-primary btn-sm',style:{marginLeft:'auto'},onClick:()=>restore(b)},'↩ Restore')))))));
}

// ── Strips on the Vendors page: TDS limit watch, GST input reminder ──
function VendorPlusStrips({sid,invoices,vendors}){
  const h=React.createElement;const [open,setOpen]=useState('');
  const watch=vpTdsWatch(sid);
  let gst=[];
  if(vpOn('vpGstInput',sid)){
    const o=outletSettings(sid)||{};const allowed=typeof gstInputAllowedAsOf==='function'?gstInputAllowedAsOf(o,localTodayIso()):false;
    if(allowed){const cut=new Date(Date.now()-100*864e5).toISOString().slice(0,10);const ok=g=>typeof isValidGSTINFormat==='function'?isValidGSTINFormat(g):/^[0-9]{2}[A-Z0-9]{13}$/.test(String(g||''));
      gst=(invoices||[]).filter(i=>i&&i.docNature!=='Performa Invoice'&&vpBookIso(i)>=cut&&((Number(i.cgst)||0)+(Number(i.sgst)||0)+(Number(i.igst)||0))>0).filter(i=>{const v=(vendors||[]).find(x=>x.id===i.vendorId);return !v||!ok(String(v.gst||'').toUpperCase());});}
  }
  if(!watch.length&&!gst.length)return null;
  const box=(key,color,title,body)=>h('div',{style:{background:'rgba('+color+',0.08)',border:'1px solid rgba('+color+',0.35)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:10,fontSize:12.5}},
    h('div',{style:{display:'flex',gap:8,alignItems:'center',cursor:'pointer'},onClick:()=>setOpen(o=>o===key?'':key)},title,h('span',{style:{marginLeft:'auto',color:'var(--accent)',fontSize:12}},open===key?'Hide ▲':'Show ▼')),open===key&&body);
  return h('div',null,
    watch.length>0&&box('tds','240,160,40',h('span',null,'✂ ',h('b',null,watch.length+' vendor'+(watch.length===1?'':'s')+' crossed the TDS limit this year'),' with bills that have no TDS'),
      h('div',{style:{marginTop:6}},watch.map(w=>h('div',{key:w.vendor.id,style:{padding:'3px 0'}},h('b',null,w.vendor.name),' — '+w.label+': '+w.why+' · '+w.untaxed+' bill(s) without TDS ('+vpR(w.untaxedAmt)+')'+(vpVendorPan(w.vendor)?'':' · no PAN'))),
        h('div',{style:{fontSize:11,color:'var(--text3)',marginTop:4}},'Limits from 1 Apr 2025: contractor ₹30,000 a bill or ₹1,00,000 a year; professional fees ₹50,000; commission ₹20,000; rent ₹50,000 a month. Tick “Deduct TDS” on the bills, and set TDS in the vendor’s details for future bills.'))),
    gst.length>0&&box('gst','224,82,82',h('span',null,'🧾 ',h('b',null,gst.length+' bill'+(gst.length===1?'':'s')+' with GST'),' whose vendor GSTIN is missing or wrong — the input credit can’t be claimed until it’s corrected'),
      h('div',{style:{marginTop:6}},gst.slice(0,15).map(i=>{const v=(vendors||[]).find(x=>x.id===i.vendorId)||{};return h('div',{key:i.id,style:{padding:'2px 0'}},(v.name||i.vendorId)+' · '+(i.invoiceNo||'')+' · '+(i.invoiceDate||'')+' · GST '+vpR((Number(i.cgst)||0)+(Number(i.sgst)||0)+(Number(i.igst)||0))+' · GSTIN: '+(v.gst||'none'));}),
        gst.length>15&&h('div',{style:{color:'var(--text3)'}},'… and '+(gst.length-15)+' more'))));
}

if(typeof HELP_TOPICS!=='undefined'&&Array.isArray(HELP_TOPICS)&&!HELP_TOPICS.some(t=>t.title==='Vendor checks: TDS limits, PAN, GST, deleted bills, history'))HELP_TOPICS.push({title:'Vendor checks: TDS limits, PAN, GST, deleted bills, history',body:[
  '<b>Same bill, other vendor</b>: saving a bill whose number and amount are already entered under another vendor asks first.',
  '<b>TDS limits</b>: Vendors shows vendors whose bills this year crossed the TDS limit with bills that have no TDS; the invoice form warns too.',
  '<b>PAN</b>: each vendor has a PAN (taken from the GSTIN when blank). TDS for a vendor without a PAN is warned — the rate is 20%.',
  '<b>TDS sheet</b>: Vendors → “⬇ TDS sheet” — party-wise and section-wise TDS of a quarter in Excel.',
  '<b>GST input</b>: bills with GST in the last 100 days whose vendor GSTIN is missing or wrong are listed.',
  '<b>Deleted bills</b>: deleted bills and payments are kept 90 days — Vendors → “🗂 Deleted bills” → Restore.',
  '<b>History</b>: every change to a bill is recorded — open the bill → “🕘 History”.'
]});
