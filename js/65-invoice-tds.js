// ════════════════════════════════════════════════════════════════════════════════════════════════
// TDS on vendor bills (Controls → Entry checks → Vendor bills → invoiceTds).
// Add / Edit Invoice: tick "Deduct TDS", pick the Section (old sections before 1 Apr 2026, the new
// Income-tax Act 2025 payment codes from then — by the invoice date), Rate %. TDS is worked out on
// the value before GST (Taxable Value + Freight, CBDT Circular 23/2017) and can be typed instead.
// Starts from the vendor's own TDS setting. Saved on the bill as tdsApplicable / tdsSection / tdsRate
// / tdsAmt / tdsManual — the same fields bills made from Recurring Expenses use — plus one payment
// line {mode:'TDS'} on the invoice date, so the vendor's balance becomes the net payable and Tally
// gets the usual Journal (Vendor Dr / TDS Payable Cr). Bills with TDS feed the TDS Summary, the TDS
// due date and the fund position by their booking month.
// ════════════════════════════════════════════════════════════════════════════════════════════════
function itdsOn(sid){return typeof controlOn==='function'&&controlOn('invoiceTds',sid);}
const itdsIso=d=>{const s=String(d||'');const m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?m[3]+'-'+m[2]+'-'+m[1]:s.slice(0,10);};
function itdsBase(f){return Math.round(((Number(f&&f.taxable)||0)+(Number(f&&f.freight)||0))*100)/100;}
function itdsCalc(f){
  if(!f||!f.tdsApplicable||f.docNature==='Performa Invoice')return 0;
  if(f.tdsManual&&f.tdsAmt!==''&&f.tdsAmt!=null)return Math.max(0,Math.round(Number(f.tdsAmt)||0));
  return Math.round(itdsBase(f)*(Number(f.tdsRate)||0)/100);
}
function itdsSections(dateIso){return typeof tdsSectionsAsOf==='function'?tdsSectionsAsOf(dateIso||undefined):[];}
function itdsSectionLabel(code){const s=[...(typeof TDS_SECTIONS_OLD!=='undefined'?TDS_SECTIONS_OLD:[]),...(typeof TDS_SECTIONS_NEW!=='undefined'?TDS_SECTIONS_NEW:[])].find(x=>x.code===code);return s?s.label:(code||'');}
// The bill's payments with its TDS line replaced (or removed when there is no TDS).
function itdsPays(pays,id,inv){
  const rest=(pays||[]).filter(p=>p.mode!=='TDS');const t=Number(inv&&inv.tdsAmt)||0;
  if(!(t>0))return rest;
  return[...rest,{id:'TDS-'+id,paidAmount:t,paidDate:itdsIso(inv.invoiceDate),mode:'TDS',ref:'',note:'TDS deducted at source ('+(inv.tdsSection||'—')+(inv.tdsManual?'':' @ '+(Number(inv.tdsRate)||0)+'%')+')'}];
}
// Fields to save on the bill, or a problem (string) that stops the save.
function itdsFieldsFor(f,amount){
  if(!f.tdsApplicable||f.docNature==='Performa Invoice')return{tdsApplicable:false,tdsSection:'',tdsRate:'',tdsAmt:0,tdsManual:false};
  if(!f.tdsSection)return'Select the TDS Section, or untick "Deduct TDS".';
  const t=itdsCalc(f);
  if(!(t>0))return'TDS works out to ₹0 — enter the Rate % (or the TDS amount), or untick "Deduct TDS".';
  if(t>=amount)return'TDS (₹'+t.toLocaleString('en-IN')+') can’t be the whole bill (₹'+Math.round(amount).toLocaleString('en-IN')+') — check the rate or amount.';
  return{tdsApplicable:true,tdsSection:f.tdsSection,tdsRate:f.tdsManual?(f.tdsRate||''):(Number(f.tdsRate)||0),tdsAmt:t,tdsManual:!!f.tdsManual};
}
// Bills with TDS booked in a month (bills made from Recurring Expenses are counted there already).
function itdsBillsForMonth(sid,year,month){
  let inv=[],ven=[];try{inv=loadVendorInvoices(sid)||[];ven=loadVendors(sid)||[];}catch(e){}
  const ym=year+'-'+String(month+1).padStart(2,'0');
  return inv.filter(i=>i&&!i.recurringId&&i.docNature!=='Performa Invoice'&&i.tdsApplicable&&Number(i.tdsAmt)>0&&i.tdsSection&&typeof invoiceBookMonthOf==='function'&&invoiceBookMonthOf(i)===ym)
    .map(i=>({key:'inv_'+i.id,party:(ven.find(v=>v.id===i.vendorId)||{}).name||i.vendorId||'Vendor',source:'Bill '+(i.invoiceNo||i.id),section:i.tdsSection,amt:Number(i.tdsAmt)||0}));
}
function itdsBillSections(sid){let inv=[];try{inv=loadVendorInvoices(sid)||[];}catch(e){}return[...new Set(inv.filter(i=>i&&!i.recurringId&&i.tdsApplicable&&Number(i.tdsAmt)>0&&i.tdsSection).map(i=>i.tdsSection))];}

// ── The block in the Add / Edit Invoice form ──
function InvTdsBlock({sid,form,setForm,vendors,isEdit,total}){
  const h=React.createElement;const first=useRef(true);
  // A new bill (or another vendor chosen) starts from the vendor's own TDS setting.
  useEffect(()=>{
    if(first.current){first.current=false;if(isEdit)return;}
    const v=(vendors||[]).find(x=>x.id===form.vendorId);
    setForm(f=>v&&v.tdsApplicable&&v.tdsSection?{...f,tdsApplicable:true,tdsSection:v.tdsSection,tdsRate:v.tdsRate,tdsManual:false,tdsAmt:''}:{...f,tdsApplicable:false,tdsSection:'',tdsRate:'',tdsManual:false,tdsAmt:''});
    // eslint-disable-next-line
  },[form.vendorId]);
  if(!itdsOn(sid)||form.docNature==='Performa Invoice')return null;
  const secs=itdsSections(form.invoiceDate);const cur=form.tdsSection;
  const t=itdsCalc(form);const base=itdsBase(form);const R=n=>'₹'+Math.round(Number(n)||0).toLocaleString('en-IN');
  const v=(vendors||[]).find(x=>x.id===form.vendorId);
  return h('div',{style:{background:'var(--bg3)',border:'1px solid '+(form.tdsApplicable?'rgba(240,160,40,0.5)':'var(--border)'),borderRadius:'var(--r)',padding:'10px 12px',marginBottom:14}},
    h('label',{style:{display:'flex',gap:8,alignItems:'center',fontSize:12.5,fontWeight:600,cursor:'pointer'}},
      h('input',{type:'checkbox',checked:!!form.tdsApplicable,onChange:e=>{const on=e.target.checked;setForm(f=>({...f,tdsApplicable:on,tdsSection:on?(f.tdsSection||(v&&v.tdsSection)||''):f.tdsSection,tdsRate:on?(f.tdsRate||(v&&v.tdsRate)||''):f.tdsRate}));}}),
      '✂ Deduct TDS on this bill',
      v&&v.tdsApplicable&&h('span',{style:{fontSize:11,fontWeight:400,color:'var(--text3)'}},'(vendor’s setting: '+(v.tdsSection||'—')+' @ '+(Number(v.tdsRate)||0)+'%)')),
    form.tdsApplicable&&h(React.Fragment,null,
      !(outletSettings(sid)||{}).tdsApplicable&&h('div',{style:{fontSize:11,color:'var(--orange)',marginTop:6}},'⚠ This outlet is not marked “TDS Applicable” (TAN) in Master Sheet → Statutory Compliance — TDS can still be recorded, but add the TAN there.'),
      h('div',{className:'form-row',style:{marginTop:10,display:'grid',gridTemplateColumns:'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)',gap:12}},
        h('div',{className:'form-group'},h('label',{htmlFor:'itds-sec'},'Section *'),
          h('select',{id:'itds-sec',className:'form-control',value:cur||'',onChange:e=>{const s=secs.find(x=>x.code===e.target.value);setForm(f=>({...f,tdsSection:e.target.value,tdsRate:s?s.rate:f.tdsRate}));}},
            [h('option',{key:'',value:''},'Select Section'),...secs.map(s=>h('option',{key:s.code,value:s.code},s.label)),
             cur&&!secs.some(s=>s.code===cur)?h('option',{key:cur,value:cur},itdsSectionLabel(cur)):null].filter(Boolean))),
        h('div',{className:'form-group'},h('label',{htmlFor:'itds-rate'},'Rate (%)'),
          h('input',{id:'itds-rate',type:'number',step:'0.01',min:0,className:'form-control',value:form.tdsRate==null?'':form.tdsRate,disabled:!!form.tdsManual,onChange:e=>setForm(f=>({...f,tdsRate:e.target.value}))})),
        h('div',{className:'form-group'},h('label',{htmlFor:'itds-amt'},'TDS Amount (₹)'),
          h('input',{id:'itds-amt',type:'number',min:0,className:'form-control',value:form.tdsManual?(form.tdsAmt==null?'':form.tdsAmt):String(t),
            onChange:e=>setForm(f=>({...f,tdsManual:true,tdsAmt:e.target.value}))}),
          form.tdsManual&&h('div',{style:{fontSize:10.5,color:'var(--accent)',marginTop:3,cursor:'pointer'},onClick:()=>setForm(f=>({...f,tdsManual:false,tdsAmt:''}))},'Typed by hand — click to work it out from the rate'))),
      h('div',{style:{fontSize:12,display:'flex',gap:16,flexWrap:'wrap'}},
        h('span',null,'On ',h('b',null,R(base)),' (Taxable Value + Freight, before GST)'),
        h('span',null,'TDS ',h('b',{style:{color:'var(--orange)'}},R(t))),
        h('span',null,'Net payable to vendor ',h('b',null,R((Number(total)||0)-t)))),
      form.invoiceDate&&form.invoiceDate>='2026-04-01'&&cur&&/^19/.test(cur)&&h('div',{style:{fontSize:11,color:'var(--orange)',marginTop:4}},'⚠ This bill is dated on/after 1 Apr 2026 — the Income-tax Act 2025 payment codes apply. Pick the new code for this section.')));
}

if(typeof HELP_TOPICS!=='undefined'&&Array.isArray(HELP_TOPICS)&&!HELP_TOPICS.some(t=>t.title==='TDS on vendor bills'))HELP_TOPICS.push({title:'TDS on vendor bills',body:[
  '<b>Where</b>: Vendors → Add / Edit Invoice → “✂ Deduct TDS on this bill”. It starts ticked when the vendor has TDS Applicable in its own details.',
  '<b>Section</b>: bills dated before 1 Apr 2026 use the old sections (194C, 194J, 194I…); from 1 Apr 2026 the Income-tax Act 2025 payment codes. Choosing a section fills its usual rate; change it if needed.',
  '<b>Amount</b>: TDS is worked out on Taxable Value + Freight (before GST). Type the TDS amount instead if the bill needs a different figure.',
  '<b>What it does</b>: the bill keeps its full value; a “TDS” line on the invoice date reduces what is still payable to the vendor to the net amount. Tally gets a Journal (Vendor Dr, TDS Payable Cr). The TDS appears in Statutory → TDS Summary and the TDS due date for that month.',
  '<b>Switch</b>: Master Settings → Controls → Entry checks → Vendor bills → TDS on vendor bills.'
]});
