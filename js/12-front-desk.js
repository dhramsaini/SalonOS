

function BillingSheet({salon}){
  const {toast}=useToast();
  const todayStr=new Date().toISOString().slice(0,10);

  // deterministic per-outlet seed so each outlet shows its OWN bills
  const seedInvoices=()=>{
    const sid=Number(salon&&salon.id)||1;
    const today=new Date();
    const r=(k)=>{let x=Math.sin((sid*97)+(k*13.13))*10000;return x-Math.floor(x);};
    const modes=['Cash','Card','UPI','UPI','Card'];
    const n=8+(sid%4);
    const out=[];
    for(let i=0;i<n;i++){
      const d=new Date(today);d.setDate(today.getDate()-Math.floor(r(i+1)*26));
      const nItems=1+Math.floor(r(i+2)*3);
      const items=[];
      for(let j=0;j<nItems;j++){
        const pool=r(i*5+j+3)>0.78?BILL_PRODUCTS:BILL_SERVICES;
        const pick=pool[Math.floor(r(i*5+j+4)*pool.length)];
        items.push({name:pick.name,type:pick.type,qty:1+Math.floor(r(i*5+j+5)*2),rate:pick.rate});
      }
      const disc=r(i+6)>0.72?Math.round(r(i+7)*30)*10:0;
      out.push({
        id:'INV-'+String(1000+sid*100+i).slice(-4),
        date:d.toISOString().slice(0,10),
        customer:BILL_CUSTOMERS[Math.floor(r(i+8)*BILL_CUSTOMERS.length)],
        phone:'9'+String(800000000+Math.floor(r(i+9)*99999998)).slice(0,9),
        staff:BILL_STAFF[Math.floor(r(i+10)*BILL_STAFF.length)],
        items,discount:disc,
        paymentMode:modes[Math.floor(r(i+11)*modes.length)],
        status:r(i+12)>0.88?'Unpaid':'Paid',
      });
    }
    return out.sort((a,b)=>b.date.localeCompare(a.date));
  };

  const [invoices,setInvoices]=useState(()=>{
    const sid=Number(salon&&salon.id)||1;
    try{
      const raw=cachedLocalGet(outletKey('salonos_billing_invoices',sid));
      if(raw!==null){
        const parsed=JSON.parse(raw);
        // If what's stored is byte-for-byte identical to what the seed generator would still
        // produce for this outlet, it was never actually touched by a real invoice — clear it.
        if(Array.isArray(parsed))return JSON.stringify(parsed)===JSON.stringify(seedInvoices())?[]:parsed;
      }
    }catch(e){}
    return [];
  });
  useEffect(()=>{safeLocalSet(outletKey('salonos_billing_invoices',Number(salon&&salon.id)||1),JSON.stringify(invoices));},[invoices,salon&&salon.id]);
  const [search,setSearch]=useState('');
  const [fMode,setFMode]=useState('All');
  const [fStatus,setFStatus]=useState('All');
  const [showModal,setShowModal]=useState(false);
  const [showDelete,setShowDelete]=useState(null);
  const [viewInv,setViewInv]=useState(null);
  const [editId,setEditId]=useState(null);

  const BLANK={customer:'',phone:'',staff:BILL_STAFF[0],date:todayStr,items:[],discount:0,paymentMode:'Cash',status:'Paid'};
  const [form,setForm]=useState(BLANK);

  const fc=(k)=>(e)=>setForm(f=>({...f,[k]:e.target.value}));
  const invNo=()=>nextPrefixedId(invoices,'INV-',4);

  const openNew=()=>{setForm({...BLANK,date:todayStr,items:[]});setEditId(null);setShowModal(true);};
  const openEdit=(inv)=>{setForm({...inv,items:inv.items.map(x=>({...x}))});setEditId(inv.id);setShowModal(true);};

  const addItem=(name)=>{
    if(!name)return;
    const it=[...BILL_SERVICES,...BILL_PRODUCTS].find(x=>x.name===name);if(!it)return;
    setForm(f=>{
      const ex=f.items.find(x=>x.name===it.name);
      if(ex)return{...f,items:f.items.map(x=>x.name===it.name?{...x,qty:x.qty+1}:x)};
      return{...f,items:[...f.items,{name:it.name,type:it.type,qty:1,rate:it.rate}]};
    });
  };
  const setItem=(idx,k,v)=>setForm(f=>({...f,items:f.items.map((x,i)=>i===idx?{...x,[k]:Math.max(0,Number(v)||0)}:x)}));
  const removeItem=(idx)=>{if(confirm('Remove this line item?'))setForm(f=>({...f,items:f.items.filter((_,i)=>i!==idx)}));};

  const save=()=>{
    if(!form.customer.trim()){toast('Customer name is required','error');return;}
    if(form.items.length===0){toast('Add at least one service or product','error');return;}
    if(editId){
      setInvoices(prev=>prev.map(i=>i.id===editId?{...form,id:editId}:i));
      toast('Invoice '+editId+' updated','success');
    }else{
      const id=invNo();
      setInvoices(prev=>[{...form,id},...prev]);
      toast('Invoice '+id+' created — ₹'+billCalc(form).total.toLocaleString('en-IN'),'success');
    }
    setShowModal(false);
  };
  const confirmDelete=(inv)=>{setInvoices(prev=>prev.filter(i=>i.id!==inv.id));setShowDelete(null);toast('Invoice '+inv.id+' deleted','warning');};

  // ── single-invoice print (A4) ──
  const esc=(s)=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const printInvoice=(inv)=>{
    const t=billCalc(inv);const cgst=Math.round(t.gst/2);const sgst=t.gst-cgst;
    const sName=salon?salon.name:'SalonOS Outlet';
    const sAddr=salon?[salon.city,salon.state,salon.pin].filter(Boolean).join(', '):'';
    const sGst=salon&&salon.gst?salon.gst:'—';
    const logoHtml=salon&&salon.logo?`<img src="${salon.logo}" alt="${esc(sName)}" style="max-height:44px;max-width:160px;object-fit:contain;display:block">`:`<div class="logo">SalonOS</div>`;
    const rows=inv.items.map((it,i)=>`<tr><td>${i+1}</td><td>${esc(it.name)} <span class="tag">${esc(it.type)}</span></td><td class="r">${it.qty}</td><td class="r">₹${(it.rate).toLocaleString('en-IN')}</td><td class="r">₹${(it.qty*it.rate).toLocaleString('en-IN')}</td></tr>`).join('');
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(inv.id)} — ${esc(sName)}</title>
    <style>
      @page{size:A4 portrait;margin:16mm}
      *{box-sizing:border-box}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#222;margin:0}
      .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2F5FE0;padding-bottom:14px;margin-bottom:18px}
      .logo{font-family:Georgia,serif;font-size:24px;color:#2F5FE0;font-weight:700}
      .logo-sub{font-size:10px;color:#888;letter-spacing:1px;margin-top:2px}
      .salon{font-size:13px;font-weight:600;margin-top:8px;color:#222}
      .muted{color:#777;font-size:11px;line-height:1.6}
      .inv-meta{text-align:right}
      .inv-meta .big{font-size:20px;font-weight:700;letter-spacing:1px;color:#222}
      .parties{display:flex;justify-content:space-between;margin-bottom:16px;gap:24px}
      .box{background:#f8f6f0;border:1px solid #ece4d4;border-radius:6px;padding:10px 14px;flex:1}
      .box .lbl{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:4px}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:14px}
      thead tr{background:#1e1e26}
      th{padding:8px 10px;text-align:left;font-size:9px;font-weight:700;color:#4C7DFF;text-transform:uppercase;letter-spacing:0.5px}
      td{padding:8px 10px;border-bottom:1px solid #eee}
      .r{text-align:right}
      .tag{font-size:8px;background:#eee;color:#777;padding:1px 6px;border-radius:8px;margin-left:4px;text-transform:uppercase;letter-spacing:0.5px}
      .totals{margin-left:auto;width:300px}
      .totals .row{display:flex;justify-content:space-between;padding:5px 0;font-size:12px}
      .totals .grand{border-top:2px solid #2F5FE0;margin-top:6px;padding-top:8px;font-size:16px;font-weight:700}
      .pay{margin-top:18px;display:flex;justify-content:space-between;align-items:center;background:#f8f6f0;border-radius:6px;padding:10px 14px;font-size:11px}
      .pill{padding:3px 10px;border-radius:12px;font-weight:600;font-size:11px}
      .foot{margin-top:26px;text-align:center;color:#aaa;font-size:10px;border-top:1px solid #eee;padding-top:10px}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
      <div class="head">
        <div>
          ${logoHtml}<div class="logo-sub">TAX INVOICE</div>
          <div class="salon">${esc(sName)}</div>
          <div class="muted">${esc(sAddr)}<br>GSTIN: ${esc(sGst)}</div>
        </div>
        <div class="inv-meta">
          <div class="muted">Invoice No.</div>
          <div class="big">${esc(inv.id)}</div>
          <div class="muted" style="margin-top:6px">Date: <b>${esc(inv.date)}</b><br>Billed by: ${esc(inv.staff||'—')}</div>
        </div>
      </div>
      <div class="parties">
        <div class="box"><div class="lbl">Billed To</div><div style="font-weight:600;font-size:13px">${esc(inv.customer)}</div><div class="muted">${esc(inv.phone||'—')}</div></div>
        <div class="box"><div class="lbl">Payment</div><div style="font-weight:600;font-size:13px">${esc(inv.paymentMode)}</div><div class="muted">Status: ${esc(inv.status)}</div></div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">
        <div class="row"><span>Subtotal</span><span>₹${t.subtotal.toLocaleString('en-IN')}</span></div>
        ${t.disc>0?`<div class="row"><span>Discount</span><span style="color:#c0392b">− ₹${t.disc.toLocaleString('en-IN')}</span></div>`:''}
        <div class="row"><span>Taxable Value</span><span>₹${t.taxable.toLocaleString('en-IN')}</span></div>
        <div class="row"><span>CGST @ 9%</span><span>₹${cgst.toLocaleString('en-IN')}</span></div>
        <div class="row"><span>SGST @ 9%</span><span>₹${sgst.toLocaleString('en-IN')}</span></div>
        <div class="row grand"><span>Grand Total</span><span>₹${t.total.toLocaleString('en-IN')}</span></div>
      </div>
      <div class="pay">
        <span>Thank you for visiting ${esc(sName.split('—')[0].trim())}!</span>
        <span class="pill" style="background:${inv.status==='Paid'?'#e8f5e9':'#ffebee'};color:${inv.status==='Paid'?'#2e7d32':'#c62828'}">${esc(inv.status==='Paid'?'PAID':'PAYMENT DUE')}</span>
      </div>
      <div class="foot">This is a computer-generated invoice. SalonOS Management Suite.</div>
      <script>window.onload=()=>window.print()<\/script>
    </body></html>`;
    const w=window.open('','_blank');if(!w){toast('Allow pop-ups to print the invoice','warning');return;}
    w.document.write(html);w.document.close();
  };

  // ── list export (table) ──
  const exportListPDF=(data)=>{
    const sName=salon?salon.name:'SalonOS';
    const logoHtml=salon&&salon.logo?`<img src="${salon.logo}" alt="${esc(sName)}" style="max-height:38px;max-width:140px;object-fit:contain;display:block">`:`<div class="logo">SalonOS</div>`;
    const rows=data.map(i=>{const t=billCalc(i);return `<tr><td>${esc(i.id)}</td><td>${esc(i.date)}</td><td><b>${esc(i.customer)}</b><br><small>${esc(i.phone||'')}</small></td><td>${i.items.length}</td><td>${esc(i.staff||'—')}</td><td>${esc(i.paymentMode)}</td><td><span style="background:${i.status==='Paid'?'#e8f5e9':'#ffebee'};color:${i.status==='Paid'?'#2e7d32':'#c62828'};padding:2px 8px;border-radius:10px;font-size:10px">${esc(i.status)}</span></td><td style="text-align:right"><b>₹${t.total.toLocaleString('en-IN')}</b></td></tr>`;}).join('');
    const grand=data.reduce((s,i)=>s+billCalc(i).total,0);
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Billing Register — ${esc(sName)}</title>
    <style>@page{size:A4 landscape;margin:14mm}*{box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#222;margin:0}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2F5FE0;padding-bottom:12px;margin-bottom:16px}
    .logo{font-family:Georgia,serif;font-size:22px;color:#2F5FE0;font-weight:700}.logo-sub{font-size:10px;color:#888;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px}
    .meta{text-align:right;font-size:10px;color:#666}.meta b{color:#222}
    table{width:100%;border-collapse:collapse;font-size:10px}thead tr{background:#1e1e26}
    th{padding:8px 8px;text-align:left;font-size:9px;font-weight:700;color:#4C7DFF;text-transform:uppercase;letter-spacing:0.5px}
    td{padding:7px 8px;border-bottom:1px solid #eee;vertical-align:top}tr:nth-child(even) td{background:#fafaf8}
    .footer{margin-top:14px;padding-top:10px;border-top:1px solid #ddd;display:flex;justify-content:space-between;font-size:10px;color:#777}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
    <div class="header"><div>${logoHtml}<div class="logo-sub">Billing Register — ${esc(sName)}</div></div>
    <div class="meta"><div><b>Exported:</b> ${new Date().toLocaleString('en-IN')}</div><div><b>Invoices:</b> ${data.length} &nbsp;|&nbsp; <b>Total:</b> ₹${grand.toLocaleString('en-IN')}</div></div></div>
    <table><thead><tr>${['Invoice #','Date','Customer','Items','Billed By','Mode','Status','Amount'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
    <div class="footer"><div>SalonOS — Confidential | For Internal Use Only</div><div>Total Collection: <b>₹${grand.toLocaleString('en-IN')}</b></div></div>
    <script>window.onload=()=>window.print()<\/script></body></html>`;
    const w=window.open('','_blank');if(!w){toast('Allow pop-ups to export','warning');return;}
    w.document.write(html);w.document.close();
  };

  // metrics
  const curMonth=todayStr.slice(0,7);
  const todaySales=invoices.filter(i=>i.date===todayStr).reduce((s,i)=>s+billCalc(i).total,0);
  const monthSales=invoices.filter(i=>i.date.slice(0,7)===curMonth).reduce((s,i)=>s+billCalc(i).total,0);
  const pending=invoices.filter(i=>i.status==='Unpaid').reduce((s,i)=>s+billCalc(i).total,0);

  const filtered=invoices.filter(i=>{
    const q=search.trim().toLowerCase();
    const okQ=!q||i.customer.toLowerCase().includes(q)||i.id.toLowerCase().includes(q)||String(i.phone||'').includes(q);
    return okQ&&(fMode==='All'||i.paymentMode===fMode)&&(fStatus==='All'||i.status===fStatus);
  });

  const FG=(label,children)=>React.createElement('div',{className:'form-group'},React.createElement('label',null,label),children);
  const INP=(props)=>React.createElement('input',{className:'form-control',...props});
  const SEL=(value,onChange,opts)=>React.createElement('select',{className:'form-control',value,onChange},opts.map(o=>React.createElement('option',{key:o},o)));
  const modeBadge=(m)=>({Cash:'badge-green',Card:'badge-blue',UPI:'badge-purple',Split:'badge-amber'}[m]||'badge-gray');

  const liveT=billCalc(form);

  return React.createElement('div',{className:'fade-in'},
    // Header
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},fixAmp('Billing'+(salon?' — '+salon.name.split('—')[0].trim():''))),
        React.createElement('div',{className:'page-sub'},'Point-of-sale invoicing for this outlet — GST '+GST_PCT+'% (CGST 9% + SGST 9%)')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},onClick:()=>exportListPDF(filtered)},'⬇ Export PDF'),
        React.createElement('button',{className:'btn btn-primary',onClick:openNew},'+ New Bill')
      )
    ),

    // Metrics
    React.createElement('div',{className:'grid4',style:{marginBottom:16}},
      React.createElement('div',{className:'metric-card green'},React.createElement('div',{className:'metric-label'},"Today's Collection"),React.createElement('div',{className:'metric-value'},'₹'+todaySales.toLocaleString('en-IN'))),
      React.createElement('div',{className:'metric-card blue'},React.createElement('div',{className:'metric-label'},'This Month'),React.createElement('div',{className:'metric-value'},'₹'+monthSales.toLocaleString('en-IN')),React.createElement('div',{className:'metric-sub'},new Date().toLocaleDateString('en-IN',{month:'long',year:'numeric'}))),
      React.createElement('div',{className:'metric-card amber'},React.createElement('div',{className:'metric-label'},'Total Invoices'),React.createElement('div',{className:'metric-value'},invoices.length)),
      React.createElement('div',{className:'metric-card '+(pending>0?'red':'teal')},React.createElement('div',{className:'metric-label'},'Pending Dues'),React.createElement('div',{className:'metric-value'},'₹'+pending.toLocaleString('en-IN')),React.createElement('div',{className:'metric-sub'},invoices.filter(i=>i.status==='Unpaid').length+' unpaid'))
    ),

    // Filters
    React.createElement('div',{style:{display:'flex',gap:10,marginBottom:14,alignItems:'center',flexWrap:'wrap'}},
      React.createElement('div',{className:'search-bar',style:{flex:1,minWidth:200}},
        React.createElement('span',{style:{color:'var(--text3)'}},React.createElement(IconSearch,{size:13})),
        React.createElement('input',{placeholder:'Search invoice #, customer, phone…',value:search,onChange:e=>setSearch(e.target.value)})
      ),
      React.createElement('select',{className:'form-control',style:{width:'auto'},value:fMode,onChange:e=>setFMode(e.target.value)},['All','Cash','Card','UPI'].map(m=>React.createElement('option',{key:m},m==='All'?'All Modes':m))),
      React.createElement('select',{className:'form-control',style:{width:'auto'},value:fStatus,onChange:e=>setFStatus(e.target.value)},['All','Paid','Unpaid'].map(s=>React.createElement('option',{key:s},s==='All'?'All Status':s))),
      React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},filtered.length+' of '+invoices.length)
    ),

    // Table
    React.createElement('div',{className:'card'},
      filtered.length===0
        ?React.createElement('div',{className:'empty-state'},
          React.createElement('div',{className:'empty-icon'},'🧾'),
          React.createElement('div',{className:'empty-title'},'No invoices found'),
          React.createElement('div',{className:'empty-sub'},search||fMode!=='All'||fStatus!=='All'?'Try clearing filters.':'Click + New Bill to create the first invoice.')
        )
        :React.createElement('div',{className:'table-wrap'},
          React.createElement('table',null,
            React.createElement('thead',null,React.createElement('tr',null,
              ['Invoice #','Date','Customer','Items','Billed By','Mode','Status','Amount','Actions'].map(h=>React.createElement('th',{key:h,style:h==='Amount'?{textAlign:'right'}:null},h))
            )),
            React.createElement('tbody',null,filtered.map(inv=>{
              const t=billCalc(inv);
              return React.createElement('tr',{key:inv.id},
                React.createElement('td',{style:{fontFamily:'monospace',fontWeight:600,color:'var(--accent)'}},inv.id),
                React.createElement('td',{style:{fontSize:12}},inv.date),
                React.createElement('td',null,
                  React.createElement('div',{style:{fontWeight:600,color:'var(--text)'}},inv.customer),
                  inv.phone&&React.createElement('div',{style:{fontSize:10,color:'var(--text3)'}},inv.phone)
                ),
                React.createElement('td',null,React.createElement('span',{style:{fontSize:12}},inv.items.length+' item'+(inv.items.length>1?'s':''))),
                React.createElement('td',{style:{fontSize:12}},inv.staff||'—'),
                React.createElement('td',null,React.createElement('span',{className:'badge '+modeBadge(inv.paymentMode)},inv.paymentMode)),
                React.createElement('td',null,React.createElement('span',{className:'badge '+(inv.status==='Paid'?'badge-green':'badge-red')},inv.status)),
                React.createElement('td',{style:{textAlign:'right',fontWeight:700,color:'var(--text)'}},'₹'+t.total.toLocaleString('en-IN')),
                React.createElement('td',null,
                  React.createElement('div',{style:{display:'flex',gap:4,flexWrap:'nowrap'}},
                    React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setViewInv(inv)},'View'),
                    React.createElement('button',{'aria-label':'Print',className:'btn btn-ghost btn-sm',onClick:()=>printInvoice(inv)},'🖨'),
                    React.createElement('button',{'aria-label':'Edit',className:'btn btn-ghost btn-sm',onClick:()=>openEdit(inv)},'✏'),
                    React.createElement('button',{'aria-label':'Delete',className:'btn btn-sm',style:{background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.3)',color:'var(--red)',padding:'4px 8px',borderRadius:'var(--r)',cursor:'pointer',fontSize:11},onClick:()=>setShowDelete(inv)},React.createElement(IconTrash,{size:14}))
                  )
                )
              );
            }))
          )
        )
    ),

    // ── NEW / EDIT BILL MODAL ──
    showModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowModal(false)},
      React.createElement('div',{className:'modal',style:{width:720},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},editId?'Edit Invoice — '+editId:'New Bill'+(salon?' · '+salon.name.split('—')[0].trim():'')),

        React.createElement('div',{className:'form-row cols3'},
          FG('Customer Name *',INP({value:form.customer,onChange:fc('customer'),placeholder:'Walk-in customer name'})),
          FG('Phone',INP({value:form.phone,onChange:fc('phone'),placeholder:'98xxxxxxxx'})),
          FG('Date',INP({type:'date',value:form.date,onChange:fc('date')}))
        ),
        React.createElement('div',{className:'form-row cols3'},
          FG('Billed By',SEL(form.staff,fc('staff'),BILL_STAFF)),
          FG('Payment Mode',SEL(form.paymentMode,fc('paymentMode'),['Cash','Card','UPI','Split'])),
          FG('Status',SEL(form.status,fc('status'),['Paid','Unpaid']))
        ),

        // Add-item picker
        React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:12,marginBottom:14}},
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}},'Add Service / Product'),
          React.createElement('select',{className:'form-control',value:'',onChange:e=>{addItem(e.target.value);e.target.value='';}},
            React.createElement('option',{value:''},'+ Select to add…'),
            React.createElement('optgroup',{label:'Services'},BILL_SERVICES.map(s=>React.createElement('option',{key:s.name,value:s.name},s.name+'  —  ₹'+s.rate.toLocaleString('en-IN')))),
            React.createElement('optgroup',{label:'Products'},BILL_PRODUCTS.map(p=>React.createElement('option',{key:p.name,value:p.name},p.name+'  —  ₹'+p.rate.toLocaleString('en-IN'))))
          )
        ),

        // Line items
        form.items.length>0&&React.createElement('div',{className:'table-wrap',style:{marginBottom:14,border:'1px solid var(--border)',borderRadius:'var(--r)'}},
          React.createElement('table',null,
            React.createElement('thead',null,React.createElement('tr',null,
              ['Item','Qty','Rate (₹)','Amount','',].map((h,i)=>React.createElement('th',{key:i,style:i>=1&&i<=3?{textAlign:'right'}:null},h))
            )),
            React.createElement('tbody',null,form.items.map((it,idx)=>React.createElement('tr',{key:idx},
              React.createElement('td',null,React.createElement('div',{style:{fontWeight:500,color:'var(--text)'}},it.name),React.createElement('span',{className:'badge '+(it.type==='Service'?'badge-blue':'badge-purple'),style:{fontSize:9,marginTop:2}},it.type)),
              React.createElement('td',{style:{width:70}},React.createElement('input',{className:'form-control',type:'number',min:1,value:it.qty,onChange:e=>setItem(idx,'qty',e.target.value),style:{padding:'4px 6px',textAlign:'right'}})),
              React.createElement('td',{style:{width:100}},React.createElement('input',{className:'form-control',type:'number',min:0,value:it.rate,onChange:e=>setItem(idx,'rate',e.target.value),style:{padding:'4px 6px',textAlign:'right'}})),
              React.createElement('td',{style:{textAlign:'right',fontWeight:600,color:'var(--text)'}},'₹'+(it.qty*it.rate).toLocaleString('en-IN')),
              React.createElement('td',{style:{width:30}},React.createElement('span',{style:{cursor:'pointer',color:'var(--red)',fontSize:13},onClick:()=>removeItem(idx)},'✕'))
            )))
          )
        ),

        // Discount + live totals
        React.createElement('div',{style:{display:'flex',gap:16,alignItems:'flex-start',flexWrap:'wrap'}},
          React.createElement('div',{style:{flex:1,minWidth:180}},
            FG('Discount (₹)',INP({type:'number',min:0,value:form.discount,onChange:e=>setForm(f=>({...f,discount:Math.max(0,Number(e.target.value)||0)})),placeholder:'0'}))
          ),
          React.createElement('div',{style:{flex:1,minWidth:240,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px'}},
            [['Subtotal','₹'+liveT.subtotal.toLocaleString('en-IN'),'var(--text2)'],
             ...(liveT.disc>0?[['Discount','− ₹'+liveT.disc.toLocaleString('en-IN'),'var(--red)']]:[]),
             ['Taxable','₹'+liveT.taxable.toLocaleString('en-IN'),'var(--text2)'],
             ['GST @ '+GST_PCT+'%','₹'+liveT.gst.toLocaleString('en-IN'),'var(--text2)']
            ].map((r,i)=>React.createElement('div',{key:i,style:{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:6}},
              React.createElement('span',{style:{color:'var(--text3)'}},r[0]),React.createElement('span',{style:{color:r[2]}},r[1])
            )),
            React.createElement('div',{style:{display:'flex',justifyContent:'space-between',borderTop:'2px solid var(--accent)',paddingTop:8,marginTop:4}},
              React.createElement('span',{style:{fontWeight:700,color:'var(--text)'}},'Grand Total'),
              React.createElement('span',{style:{fontWeight:700,fontSize:16,color:'var(--accent)'}},'₹'+liveT.total.toLocaleString('en-IN'))
            )
          )
        ),

        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowModal(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',onClick:save},editId?'💾 Save Changes':'✓ Create Invoice')
        )
      )
    ),

    // ── VIEW INVOICE MODAL ──
    viewInv&&(function(){const t=billCalc(viewInv);return React.createElement('div',{className:'modal-overlay',onClick:()=>setViewInv(null)},
      React.createElement('div',{className:'modal',style:{width:560},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title',style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
          React.createElement('span',null,'Invoice ',React.createElement('span',{style:{fontFamily:'monospace',color:'var(--accent)'}},viewInv.id)),
          React.createElement('span',{className:'badge '+(viewInv.status==='Paid'?'badge-green':'badge-red'),style:{fontSize:11}},viewInv.status)
        ),
        React.createElement('div',{className:'grid2',style:{marginBottom:14}},
          React.createElement('div',null,React.createElement('div',{style:{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em'}},'Customer'),React.createElement('div',{style:{fontWeight:600,color:'var(--text)'}},viewInv.customer),React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},viewInv.phone||'—')),
          React.createElement('div',null,React.createElement('div',{style:{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em'}},'Date / Billed By'),React.createElement('div',{style:{fontWeight:600,color:'var(--text)'}},viewInv.date),React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},viewInv.staff||'—'))
        ),
        React.createElement('div',{className:'table-wrap',style:{border:'1px solid var(--border)',borderRadius:'var(--r)',marginBottom:14}},
          React.createElement('table',null,
            React.createElement('thead',null,React.createElement('tr',null,['Item','Qty','Rate','Amount'].map((h,i)=>React.createElement('th',{key:h,style:i>=1?{textAlign:'right'}:null},h)))),
            React.createElement('tbody',null,viewInv.items.map((it,i)=>React.createElement('tr',{key:i},
              React.createElement('td',null,it.name),
              React.createElement('td',{style:{textAlign:'right'}},it.qty),
              React.createElement('td',{style:{textAlign:'right'}},'₹'+it.rate.toLocaleString('en-IN')),
              React.createElement('td',{style:{textAlign:'right',fontWeight:600,color:'var(--text)'}},'₹'+(it.qty*it.rate).toLocaleString('en-IN'))
            )))
          )
        ),
        React.createElement('div',{style:{background:'var(--bg3)',borderRadius:'var(--r)',padding:'12px 14px'}},
          [['Subtotal','₹'+t.subtotal.toLocaleString('en-IN')],...(t.disc>0?[['Discount','− ₹'+t.disc.toLocaleString('en-IN')]]:[]),['GST @ '+GST_PCT+'%','₹'+t.gst.toLocaleString('en-IN')]].map((r,i)=>
            React.createElement('div',{key:i,style:{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:6,color:'var(--text2)'}},React.createElement('span',null,r[0]),React.createElement('span',null,r[1]))
          ),
          React.createElement('div',{style:{display:'flex',justifyContent:'space-between',borderTop:'2px solid var(--accent)',paddingTop:8,marginTop:4}},
            React.createElement('span',{style:{fontWeight:700,color:'var(--text)'}},'Grand Total'),React.createElement('span',{style:{fontWeight:700,fontSize:16,color:'var(--accent)'}},'₹'+t.total.toLocaleString('en-IN')))
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setViewInv(null)},'Close'),
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>printInvoice(viewInv)},'🖨 Print / PDF'),
          React.createElement('button',{className:'btn btn-primary',onClick:()=>{const v=viewInv;setViewInv(null);openEdit(v);}},'✏ Edit')
        )
      )
    );})(),

    // ── DELETE CONFIRM MODAL ──
    showDelete&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowDelete(null)},
      React.createElement('div',{className:'modal',style:{width:440},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title',style:{color:'var(--red)'}},'Delete Invoice'),
        React.createElement('div',{style:{background:'rgba(255,107,107,0.08)',border:'1px solid rgba(255,107,107,0.2)',borderRadius:'var(--r)',padding:14,marginBottom:16}},
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:12,marginBottom:10}},
            React.createElement('div',{style:{width:40,height:40,borderRadius:'50%',background:'rgba(255,107,107,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}},'🧾'),
            React.createElement('div',null,
              React.createElement('div',{style:{fontWeight:600,color:'var(--text)',fontSize:14}},showDelete.id+' · '+showDelete.customer),
              React.createElement('div',{style:{fontSize:12,color:'var(--text3)'}},showDelete.date+' · ₹'+billCalc(showDelete).total.toLocaleString('en-IN'))
            )
          ),
          React.createElement('div',{style:{fontSize:13,color:'var(--text2)',lineHeight:1.7}},'Are you sure you want to delete this invoice? ',React.createElement('strong',{style:{color:'var(--red)'}},'This cannot be undone.'))
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowDelete(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-danger',onClick:()=>confirmDelete(showDelete)},'Yes, Delete')
        )
      )
    )
  );
}



function CollaborationReview({user,salons,submissions,setSubmissions}){
  const {toast}=useToast();
  const [filter,setFilter]=useState('All');
  const [note,setNote]=useState({});
  const canReview=['Super Admin','Reviewer'].includes(user.role);
  const visible=submissions.filter(x=>userCanSeeOutlet(user,x.outletId)).filter(x=>filter==='All'||x.status===filter);
  const updateStatus=(id,status)=>{
    setSubmissions(prev=>prev.map(x=>x.id===id?{...x,status,reviewedBy:user.name,reviewedAt:new Date().toISOString(),remarks:note[id]||x.remarks}:x));
    toast('Submission marked '+status.toLowerCase(),'success');
  };
  const createSubmission=()=>{
    const outletId=user.outletIds[0]||salons[0]?.id;
    const outlet=salons.find(s=>s.id===outletId);
    const item={id:'SUB-'+Date.now(),outletId,outlet:outlet?.name||'Outlet',period:new Date().toLocaleDateString('en-IN',{month:'long',year:'numeric'}),module:'Monthly Operations',submittedBy:user.name,submittedAt:new Date().toISOString(),status:'Submitted',remarks:'',reviewedBy:'',reviewedAt:''};
    setSubmissions(p=>[item,...p]);toast('Data submitted for review','success');
  };
  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},React.createElement('div',null,React.createElement('div',{className:'page-title'},canReview?'Review Centre':'My Submissions'),React.createElement('div',{className:'page-sub'},canReview?'Review and approve data submitted by outlet users':'Submit outlet data and track review status')),!canReview&&React.createElement('button',{className:'btn btn-primary',onClick:createSubmission},'+ Submit Current Data')),
    React.createElement('div',{className:'grid4',style:{marginBottom:16}},['Submitted','Under Review','Approved','Returned'].map((st,i)=>React.createElement('div',{key:st,className:'metric-card '+['blue','amber','green','red'][i]},React.createElement('div',{className:'metric-label'},st),React.createElement('div',{className:'metric-value'},visible.filter(x=>x.status===st).length)))),
    React.createElement('div',{style:{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}},['All','Submitted','Under Review','Approved','Returned'].map(st=>React.createElement('button',{key:st,className:'btn '+(filter===st?'btn-primary':'btn-ghost')+' btn-sm',onClick:()=>setFilter(st)},st))),
    React.createElement('div',{className:'card'},visible.length===0?React.createElement('div',{className:'empty-state'},React.createElement('div',{className:'empty-icon'},'📥'),React.createElement('div',{className:'empty-title'},'No submissions found')):React.createElement('div',{className:'table-wrap'},React.createElement('table',null,
      React.createElement('thead',null,React.createElement('tr',null,['Submission','Outlet','Period','Submitted By','Submitted At','Status','Review'].map(h=>React.createElement('th',{key:h},h)))),
      React.createElement('tbody',null,visible.map(x=>React.createElement('tr',{key:x.id},
        React.createElement('td',null,React.createElement('div',{style:{fontWeight:600,color:'var(--text)'}},x.module),React.createElement('div',{style:{fontSize:10,color:'var(--text3)'}},x.id)),
        React.createElement('td',null,x.outlet),React.createElement('td',null,x.period),React.createElement('td',null,x.submittedBy),React.createElement('td',null,new Date(x.submittedAt).toLocaleString('en-IN')),
        React.createElement('td',null,React.createElement('span',{className:'badge '+({Approved:'badge-green',Returned:'badge-red',Submitted:'badge-blue','Under Review':'badge-amber'}[x.status]||'badge-gray')},x.status),x.remarks&&React.createElement('div',{style:{fontSize:10,color:'var(--text3)',marginTop:5,maxWidth:180}},x.remarks)),
        React.createElement('td',null,canReview?React.createElement('div',{style:{minWidth:230}},React.createElement('textarea',{className:'form-control review-note',placeholder:'Review remarks',value:note[x.id]??x.remarks,onChange:e=>setNote(n=>({...n,[x.id]:e.target.value}))}),React.createElement('div',{style:{display:'flex',gap:5,marginTop:6}},React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>updateStatus(x.id,'Under Review')},'Review'),React.createElement('button',{className:'btn btn-success btn-sm',onClick:()=>updateStatus(x.id,'Approved')},'Approve'),React.createElement('button',{className:'btn btn-danger btn-sm',onClick:()=>updateStatus(x.id,'Returned')},'Return'))):React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},x.reviewedBy?'Reviewed by '+x.reviewedBy:'Awaiting review'))
      )))
    )))
  );
}

/* ==================== FRONT DESK MODULES ==================== */
const h=React.createElement;
const FD_STAFF=['Meera Joshi','Arjun Singh','Kavya Reddy','Pooja Patel','Deepak Nair'];
const FD_ROLE={'Meera Joshi':'Senior stylist','Arjun Singh':'Stylist','Kavya Reddy':'Beautician','Pooja Patel':'Beautician','Deepak Nair':'Spa therapist'};
const FD_OPEN=9, FD_CLOSE=21;                      // 9am to 9pm
const FD_SLOTS=(()=>{const a=[];for(let m=FD_OPEN*60;m<FD_CLOSE*60;m+=30)a.push(m);return a})();
const fdT=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const fdT12=m=>{const hh=Math.floor(m/60),mm=m%60;const ap=hh>=12?'PM':'AM';const H=hh%12===0?12:hh%12;return H+':'+String(mm).padStart(2,'0')+' '+ap};
const inr=n=>'₹'+Math.round(n||0).toLocaleString('en-IN');
const FD_DUR={'Haircut & Styling':45,'Hair Spa':60,'Hair Colour (Global)':120,'Keratin Treatment':180,'Facial — Gold':60,'Cleanup':45,'Manicure':45,'Pedicure':45,'Threading (Eyebrow)':15,'Full Arms Waxing':30,'Bridal Makeup':180,'Head Massage':30};
const fdDur=s=>FD_DUR[s]||45;
const fdRate=s=>{const x=BILL_SERVICES.find(v=>v.name===s);return x?x.rate:600};
const AP_CLASS={'Booked':'ap-booked','Confirmed':'ap-confirmed','In chair':'ap-chair','Done':'ap-done','No-show':'ap-noshow','Cancelled':'ap-cancel'};
const AP_COLOR={'Booked':'var(--blue)','Confirmed':'var(--teal)','In chair':'var(--orange)','Done':'var(--green)','No-show':'var(--red)','Cancelled':'var(--text3)'};
const fdRand=(a,b)=>{let x=Math.sin(a*127.1+b*311.7)*43758.5453;return x-Math.floor(x)};
const fdDateStr=d=>d.toISOString().slice(0,10);
const fdAddDays=(s,n)=>{const d=new Date(s+'T00:00:00');d.setDate(d.getDate()+n);return fdDateStr(d)};
const fdPretty=s=>new Date(s+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});
const fdPhone=(sid,i)=>'9'+String(Math.floor(fdRand(sid*7+i,3)*899999999)+100000000).slice(0,9);

/* ---------- APPOINTMENT BOOK ---------- */
function seedAppts(sid,date){
  const dayIdx=new Date(date+'T00:00:00').getDay();
  const out=[];const svcs=BILL_SERVICES.map(s=>s.name);
  const load=dayIdx===0?0.34:dayIdx===6?0.62:dayIdx===5?0.5:0.38;
  FD_STAFF.forEach((st,si)=>{
    let cursor=FD_OPEN*60+Math.floor(fdRand(sid+si,dayIdx)*3)*30;
    let guard=0;
    while(cursor<FD_CLOSE*60-30&&guard++<12){
      const r=fdRand(sid*13+si*7+guard,dayIdx*3+1);
      if(r>load){cursor+=30;continue}
      const svc=svcs[Math.floor(fdRand(si*5+guard,dayIdx+7)*svcs.length)];
      const dur=fdDur(svc);
      if(cursor+dur>FD_CLOSE*60)break;
      const cust=BILL_CUSTOMERS[Math.floor(fdRand(si*3+guard,dayIdx+11)*BILL_CUSTOMERS.length)];
      const past=date<fdDateStr(new Date());
      const q=fdRand(si+guard*3,dayIdx+5);
      const st2=past?(q>0.9?'No-show':'Done'):(cursor<new Date().getHours()*60+new Date().getMinutes()&&date===fdDateStr(new Date())?(q>0.85?'In chair':'Done'):(q>0.55?'Confirmed':'Booked'));
      out.push({id:'AP-'+sid+si+guard+dayIdx,staff:st,start:cursor,dur,service:svc,client:cust,
        phone:fdPhone(sid,si*4+guard),status:st2,rate:fdRate(svc),source:q>0.66?'Online':q>0.33?'Walk-in':'Phone'});
      cursor+=dur+30;
    }
  });
  return out;
}

function AppointmentBook({salon}){
  const {toast}=useToast();
  const sid=Number(salon&&salon.id)||1;
  const [date,setDate]=useState(fdDateStr(new Date()));
  // One book per outlet (it used to be a single shared record holding every outlet's guests, so
  // anyone with any outlet access could read all of them). Bookings for this outlet still sitting
  // in the old shared record are carried over the first time this outlet's book is opened.
  const APPT_BOOK_KEY=outletKey('salonos_appointments_book',sid);
  const [book,setBook]=useState(()=>{
    try{const raw=cachedLocalGet(APPT_BOOK_KEY);if(raw!==null){const p=JSON.parse(raw);if(p&&typeof p==='object')return p;}}catch(e){}
    try{
      const legacy=JSON.parse(cachedLocalGet('salonos_appointments_book')||'{}')||{};
      const mine={};Object.keys(legacy).forEach(k=>{if(k.startsWith(sid+'|'))mine[k]=legacy[k];});
      return mine;
    }catch(e){}
    return{};
  });
  useEffect(()=>{safeLocalSet(APPT_BOOK_KEY,JSON.stringify(book));},[book]);
  const [modal,setModal]=useState(null);   // {mode:'new'|'view', ...}
  const [staffFilter,setStaffFilter]=useState('All');
  const key=sid+'|'+date;
  // Previously this auto-generated a fresh batch of fake appointments (fdRand-seeded, fake
  // customers/staff/timings) the very first time ANY date was ever viewed, for as long as this
  // outlet existed — meaning it kept injecting fake data indefinitely, not just once at setup.
  // A day with genuinely nothing booked now just shows empty, same as it would in reality.
  const appts=book[key]||[];
  const setAppts=fn=>setBook(b=>({...b,[key]:fn(b[key]||[])}));

  const cols=staffFilter==='All'?FD_STAFF:[staffFilter];
  const busy={};
  appts.forEach(a=>{if(a.status==='Cancelled')return;for(let m=a.start;m<a.start+a.dur;m+=30)busy[a.staff+'|'+m]=a});

  const live=appts.filter(a=>a.status!=='Cancelled');
  const bookedMin=live.reduce((t,a)=>t+a.dur,0);
  const capacity=cols.length*(FD_CLOSE-FD_OPEN)*60;
  const occ=capacity?Math.round(bookedMin/capacity*100):0;
  const expRev=live.filter(a=>a.status!=='No-show').reduce((t,a)=>t+a.rate,0);
  const noShow=appts.filter(a=>a.status==='No-show').length;
  const doneRev=appts.filter(a=>a.status==='Done').reduce((t,a)=>t+a.rate,0);

  const openNew=(staff,start)=>setModal({mode:'new',staff,start,client:'',phone:'',service:BILL_SERVICES[0].name,source:'Phone'});
  const save=()=>{
    if(!modal.client.trim())return toast('Enter the guest name','error');
    const dur=fdDur(modal.service);
    if(modal.start+dur>FD_CLOSE*60)return toast(modal.service+' needs '+dur+' minutes and would run past closing','error');
    const clash=live.some(a=>a.staff===modal.staff&&modal.start<a.start+a.dur&&a.start<modal.start+dur);
    if(clash)return toast(modal.staff.split(' ')[0]+' is already booked in that window','error');
    setAppts(list=>[...list,{id:'AP-'+Date.now(),staff:modal.staff,start:modal.start,dur,service:modal.service,
      client:modal.client.trim(),phone:modal.phone.trim(),status:'Booked',rate:fdRate(modal.service),source:modal.source}]);
    setModal(null);toast(modal.client.trim()+' booked at '+fdT12(modal.start)+' with '+modal.staff.split(' ')[0]);
  };
  const setStatus=(id,st)=>{setAppts(l=>l.map(a=>a.id===id?{...a,status:st}:a));setModal(null);
    toast(st==='Done'?'Marked done — push the bill from the Billing tab':'Status updated to '+st,st==='No-show'?'warning':'success')};
  const remind=()=>{
    const n=live.filter(a=>['Booked','Confirmed'].includes(a.status)).length;
    if(!n)return toast('No pending guests to remind','info');
    toast('WhatsApp reminder queued for '+n+' guest'+(n>1?'s':''),'success');
  };

  const stat=(l,v,s,c)=>h('div',{className:'metric-card'},
    h('div',{className:'metric-label'},l),
    h('div',{className:'metric-value',style:c?{color:c}:null},v),
    h('div',{className:'metric-sub'},s));

  return h('div',{className:'fade-in'},
    h('div',{className:'section-header'},
      h('div',null,h('div',{className:'page-title'},'Appointment Book'),
        h('div',{className:'page-sub'},'Click any empty slot to book. Click a card to check in, complete or mark a no-show.')),
      h('div',{style:{display:'flex',gap:8}},
        h('button',{className:'btn btn-ghost btn-sm',onClick:remind},'Send WhatsApp reminders'),
        h('button',{className:'btn btn-primary btn-sm',onClick:()=>openNew(FD_STAFF[0],FD_OPEN*60)},'+ New appointment'))),

    h('div',{className:'fd-toolbar'},
      h('div',{className:'fd-date'},
        h('button',{onClick:()=>setDate(fdAddDays(date,-1)),title:'Previous day'},'‹'),
        h('span',{className:'lbl'},fdPretty(date)),
        h('button',{onClick:()=>setDate(fdAddDays(date,1)),title:'Next day'},'›')),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setDate(fdDateStr(new Date()))},'Today'),
      h('select',{className:'form-control',style:{width:'auto',fontSize:12,padding:'6px 10px'},value:staffFilter,onChange:e=>setStaffFilter(e.target.value)},
        h('option',null,'All'),FD_STAFF.map(s=>h('option',{key:s},s))),
      h('span',{style:{marginLeft:'auto',fontSize:11,color:'var(--text3)'}},salon?salon.name:'')),

    h('div',{className:'grid4',style:{marginBottom:16}},
      stat('Appointments',String(live.length),(live.filter(a=>a.source==='Online').length)+' booked online'),
      stat('Chair occupancy',occ+'%',Math.round(bookedMin/60)+' of '+Math.round(capacity/60)+' chair-hours',occ>70?'var(--green)':occ>45?'var(--accent)':'var(--red)'),
      stat('Expected revenue',inr(expRev),inr(doneRev)+' already billed'),
      stat('No-shows',String(noShow),noShow?'Charge or follow up':'Clean day',noShow?'var(--red)':'var(--green)')),

    h('div',{className:'cal-wrap'},
      h('table',{className:'cal'},
        h('thead',null,h('tr',null,
          h('th',{className:'timecol'},'Time'),
          cols.map(s=>h('th',{key:s},s,h('span',{className:'st-sub'},FD_ROLE[s]))))),
        h('tbody',null,FD_SLOTS.map(m=>h('tr',{key:m,className:m%60===0?'hour':''},
          h('td',{className:'timecol'},m%60===0?fdT12(m):fdT(m)),
          cols.map(s=>{
            const a=busy[s+'|'+m];
            if(a&&a.start!==m)return null;
            if(a)return h('td',{key:s,rowSpan:Math.max(1,Math.round(a.dur/30))},
              h('div',{className:'appt '+AP_CLASS[a.status],onClick:()=>setModal({mode:'view',a})},
                h('div',{className:'who'},a.client),
                h('div',{className:'what'},a.service),
                a.dur>=45?h('div',{className:'amt'},fdT12(a.start)+' · '+a.dur+'m · '+inr(a.rate)):null));
            return h('td',{key:s},h('button',{className:'slot-free',onClick:()=>openNew(s,m)},'+ book'));
          }))))) ),

    h('div',{className:'legend'},Object.keys(AP_COLOR).map(k=>
      h('span',{key:k},h('i',{style:{background:AP_COLOR[k]}}),k))),

    modal&&modal.mode==='new'&&h('div',{className:'modal-overlay',onClick:()=>setModal(null)},
      h('div',{className:'modal',onClick:e=>e.stopPropagation()},
        h('div',{className:'modal-title'},'New appointment — '+fdPretty(date)),
        h('div',{className:'form-row'},
          h('div',{className:'form-group'},h('label',null,'Guest name'),
            h('input',{className:'form-control',autoFocus:true,value:modal.client,placeholder:'Anjali Mehta',
              onChange:e=>setModal({...modal,client:e.target.value}),onKeyDown:e=>e.key==='Enter'&&save()})),
          h('div',{className:'form-group'},h('label',null,'Mobile'),
            h('input',{className:'form-control',value:modal.phone,placeholder:'98765 43210',onChange:e=>setModal({...modal,phone:e.target.value})}))),
        h('div',{className:'form-row'},
          h('div',{className:'form-group'},h('label',null,'Service'),
            h('select',{className:'form-control',value:modal.service,onChange:e=>setModal({...modal,service:e.target.value})},
              BILL_SERVICES.map(s=>h('option',{key:s.name},s.name)))),
          h('div',{className:'form-group'},h('label',null,'Stylist'),
            h('select',{className:'form-control',value:modal.staff,onChange:e=>setModal({...modal,staff:e.target.value})},
              FD_STAFF.map(s=>h('option',{key:s},s))))),
        h('div',{className:'form-row'},
          h('div',{className:'form-group'},h('label',null,'Start time'),
            h('select',{className:'form-control',value:modal.start,onChange:e=>setModal({...modal,start:Number(e.target.value)})},
              FD_SLOTS.map(m=>h('option',{key:m,value:m},fdT12(m))))),
          h('div',{className:'form-group'},h('label',null,'Booked via'),
            h('select',{className:'form-control',value:modal.source,onChange:e=>setModal({...modal,source:e.target.value})},
              ['Phone','Walk-in','Online','WhatsApp'].map(s=>h('option',{key:s},s))))),
        h('div',{className:'help-tip'},fdDur(modal.service)+' minutes · '+inr(fdRate(modal.service))+' · finishes '+fdT12(modal.start+fdDur(modal.service))),
        h('div',{className:'modal-actions'},
          h('button',{className:'btn btn-ghost',onClick:()=>setModal(null)},'Cancel'),
          h('button',{className:'btn btn-primary',onClick:save},'Book appointment')))),

    modal&&modal.mode==='view'&&h('div',{className:'modal-overlay',onClick:()=>setModal(null)},
      h('div',{className:'modal',style:{width:430},onClick:e=>e.stopPropagation()},
        h('div',{className:'modal-title'},modal.a.client),
        h('div',{className:'kv'},h('span',null,'Service'),h('span',null,modal.a.service)),
        h('div',{className:'kv'},h('span',null,'Slot'),h('span',null,fdT12(modal.a.start)+' – '+fdT12(modal.a.start+modal.a.dur))),
        h('div',{className:'kv'},h('span',null,'Stylist'),h('span',null,modal.a.staff)),
        h('div',{className:'kv'},h('span',null,'Mobile'),h('span',null,modal.a.phone||'—')),
        h('div',{className:'kv'},h('span',null,'Booked via'),h('span',null,modal.a.source)),
        h('div',{className:'kv'},h('span',null,'Ticket value'),h('span',null,inr(modal.a.rate))),
        h('div',{className:'kv'},h('span',null,'Status'),h('span',{style:{color:AP_COLOR[modal.a.status]}},modal.a.status)),
        h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',marginTop:16}},
          ['Confirmed','In chair','Done','No-show','Cancelled'].map(s=>
            h('button',{key:s,className:'btn btn-sm '+(s==='Done'?'btn-success':s==='No-show'||s==='Cancelled'?'btn-danger':'btn-ghost'),
              onClick:()=>setStatus(modal.a.id,s)},s))),
        h('div',{className:'modal-actions'},
          h('button',{className:'btn btn-ghost',onClick:()=>setModal(null)},'Close'))))
  );
}

/* ---------- CLIENT CRM ---------- */
function seedClients(sid){
  const first=['Anjali','Rohan','Sneha','Vikram','Neha','Aditya','Priyanka','Karan','Ritu','Farah','Ishita','Nikhil','Tanya','Rahul','Meghna','Sahil','Divya','Arnav','Pooja','Zoya'];
  const last=['Mehta','Kapoor','Iyer','Rao','Gupta','Jain','Das','Malhotra','Singh','Khan','Bansal','Nair','Sethi','Chopra','Reddy'];
  const tiers=['Gold membership','Silver membership','None','None','None','Prepaid package'];
  return first.map((f,i)=>{
    const r=k=>fdRand(sid*17+i*3,k);
    const visits=1+Math.floor(r(1)*22);
    const spend=Math.round((900+r(2)*4200)*visits/1.6);
    const since=Math.floor(r(3)*140);
    return {id:'C'+sid+String(i).padStart(3,'0'),name:f+' '+last[Math.floor(r(4)*last.length)],
      phone:fdPhone(sid,i),visits,spend,since,
      last:fdAddDays(fdDateStr(new Date()),-since),
      fav:BILL_SERVICES[Math.floor(r(5)*BILL_SERVICES.length)].name,
      stylist:FD_STAFF[Math.floor(r(6)*FD_STAFF.length)],
      tier:tiers[Math.floor(r(7)*tiers.length)],
      birthday:['12 Jan','03 Mar','28 Apr','19 Jun','07 Sep','22 Nov'][Math.floor(r(8)*6)],
      notes:r(9)>0.6?'Prefers ammonia-free colour.':r(9)>0.3?'Allergic to strong fragrance.':''};
  });
}
const segOf=c=>c.since>90?'Lapsed':c.visits>=12?'VIP':c.visits>=4?'Regular':'New';

function ClientCRM({salon}){
  const {toast}=useToast();
  const sid=Number(salon&&salon.id)||1;
  const clientsKey=(s)=>outletKey('salonos_clients',s);
  const loadClients=(s)=>{
    try{
      const raw=cachedLocalGet(clientsKey(s));
      if(raw!==null){
        const p=JSON.parse(raw);
        if(Array.isArray(p))return JSON.stringify(p)===JSON.stringify(seedClients(s))?[]:p;
      }
    }catch(e){}
    return [];
  };
  const [clients,setClients]=useState(()=>loadClients(sid));
  // Outlet changed — load THAT outlet's saved clients (or seed once if it has none yet), instead
  // of unconditionally re-seeding and discarding any real edits every time.
  useEffect(()=>{setClients(loadClients(sid));setSel(null)},[sid]);
  useEffect(()=>{safeLocalSet(clientsKey(sid),JSON.stringify(clients));},[clients,sid]);
  const [q,setQ]=useState('');
  const [seg,setSeg]=useState('All');
  const [sel,setSel]=useState(null);
  const [wa,setWa]=useState(null);

  const list=clients.filter(c=>(seg==='All'||segOf(c)===seg)&&
    (c.name.toLowerCase().includes(q.toLowerCase())||c.phone.includes(q)))
    .sort((a,b)=>b.spend-a.spend);
  const active=clients.filter(c=>c.since<=90).length;
  const lapsed=clients.length-active;
  const avgTicket=clients.reduce((t,c)=>t+c.spend/c.visits,0)/clients.length;
  const members=clients.filter(c=>c.tier!=='None').length;
  const retention=Math.round(clients.filter(c=>c.visits>1).length/clients.length*100);
  const c=sel?clients.find(x=>x.id===sel):null;

  const templates=(cl)=>({
    'Win back':`Hi ${cl.name.split(' ')[0]}, we have missed you at ${salon?salon.name.split('—')[0].trim():'the salon'}! It has been ${cl.since} days since your last ${cl.fav}. Reply BOOK for a slot this week and get 20% off.`,
    'Reminder':`Hi ${cl.name.split(' ')[0]}, this is a reminder for your appointment tomorrow with ${cl.stylist.split(' ')[0]}. Reply YES to confirm or CHANGE to reschedule.`,
    'Birthday':`Happy birthday ${cl.name.split(' ')[0]}! Your gift from us: a complimentary cleanup with any service booked this month. See you soon.`,
    'Membership':`Hi ${cl.name.split(' ')[0]}, you have spent ${inr(cl.spend)} with us across ${cl.visits} visits. Our Gold membership would have saved you about ${inr(cl.spend*0.15)}. Want the details?`
  });
  const copy=(t)=>{navigator.clipboard&&navigator.clipboard.writeText(t);toast('Message copied — paste into WhatsApp')};

  const stat=(l,v,s,col)=>h('div',{className:'metric-card'},h('div',{className:'metric-label'},l),
    h('div',{className:'metric-value',style:col?{color:col}:null},v),h('div',{className:'metric-sub'},s));

  return h('div',{className:'fade-in'},
    h('div',{className:'section-header'},
      h('div',null,h('div',{className:'page-title'},'Clients'),
        h('div',{className:'page-sub'},'Who they are, what they spend, and who has stopped coming back.'))),
    h('div',{className:'grid4',style:{marginBottom:16}},
      stat('Clients on file',String(clients.length),members+' on membership or package'),
      stat('Active',String(active),'visited in the last 90 days','var(--green)'),
      stat('Lapsed',String(lapsed),lapsed?'Worth a win-back campaign':'Nobody has drifted','var(--red)'),
      stat('Repeat rate',retention+'%','avg ticket '+inr(avgTicket))),
    h('div',{className:'crm'},
      h('div',{className:'card'},
        h('input',{className:'form-control',placeholder:'Search by name or mobile…',value:q,onChange:e=>setQ(e.target.value),style:{marginBottom:12}}),
        h('div',{className:'seg'},['All','VIP','Regular','New','Lapsed'].map(s=>
          h('button',{key:s,className:seg===s?'on':'',onClick:()=>setSeg(s)},s,
            s!=='All'?' · '+clients.filter(x=>segOf(x)===s).length:''))),
        h('div',{style:{maxHeight:460,overflowY:'auto'}},
          list.length?list.map(cl=>h('div',{key:cl.id,className:'cl-row '+(sel===cl.id?'on':''),onClick:()=>setSel(cl.id)},
            h('div',{className:'cl-av'},cl.name.split(' ').map(w=>w[0]).join('').slice(0,2)),
            h('div',{style:{minWidth:0}},h('div',{className:'cl-nm'},cl.name),
              h('div',{className:'cl-sub'},cl.visits+' visits · last '+(cl.since===0?'today':cl.since+'d ago')+' · '+cl.stylist.split(' ')[0])),
            h('div',{className:'cl-amt'},inr(cl.spend),
              h('div',null,h('span',{className:'badge '+(segOf(cl)==='VIP'?'badge-amber':segOf(cl)==='Lapsed'?'badge-red':segOf(cl)==='Regular'?'badge-green':'badge-blue')},segOf(cl)))))):
            h('div',{className:'empty-state'},h('div',{className:'empty-icon'},React.createElement(IconSearch,{size:13})),
              h('div',{className:'empty-title'},'No clients match'),
              h('div',{className:'empty-sub'},'Try a different name, number or segment.')))),
      h('div',{className:'card'},
        c?h('div',null,
          h('div',{style:{display:'flex',gap:12,alignItems:'center',marginBottom:16}},
            h('div',{className:'cl-av',style:{width:44,height:44,fontSize:14}},c.name.split(' ').map(w=>w[0]).join('').slice(0,2)),
            h('div',null,h('div',{style:{fontSize:16,color:'var(--text)'}},c.name),
              h('div',{className:'cl-sub'},c.phone+' · '+c.id)),
            h('span',{className:'badge badge-amber',style:{marginLeft:'auto'}},segOf(c))),
          h('div',{className:'kv'},h('span',null,'Lifetime spend'),h('span',null,inr(c.spend))),
          h('div',{className:'kv'},h('span',null,'Visits'),h('span',null,c.visits)),
          h('div',{className:'kv'},h('span',null,'Average ticket'),h('span',null,inr(c.spend/c.visits))),
          h('div',{className:'kv'},h('span',null,'Last visit'),h('span',null,fdPretty(c.last)+' ('+c.since+'d)')),
          h('div',{className:'kv'},h('span',null,'Usual service'),h('span',null,c.fav)),
          h('div',{className:'kv'},h('span',null,'Preferred stylist'),h('span',null,c.stylist)),
          h('div',{className:'kv'},h('span',null,'Membership'),h('span',null,c.tier)),
          h('div',{className:'kv'},h('span',null,'Birthday'),h('span',null,c.birthday)),
          c.notes?h('div',{className:'help-tip',style:{marginTop:12}},'Note: '+c.notes):null,
          h('div',{style:{display:'flex',gap:8,marginTop:16,flexWrap:'wrap'}},
            h('button',{className:'btn btn-primary btn-sm',onClick:()=>toast('Open the Appointment Book to place '+c.name.split(' ')[0]+' in a slot','info')},'Book appointment'),
            h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setWa(c)},'WhatsApp'),
            h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{
              setClients(l=>l.map(x=>x.id===c.id?{...x,tier:'Gold membership'}:x));toast(c.name.split(' ')[0]+' upgraded to Gold membership')}},'Sell membership'))
        ):h('div',{className:'empty-state'},h('div',{className:'empty-icon'},'👤'),
          h('div',{className:'empty-title'},'Pick a client'),
          h('div',{className:'empty-sub'},'Their history, spend and messaging options appear here.')))),
    wa&&h('div',{className:'modal-overlay',onClick:()=>setWa(null)},
      h('div',{className:'modal',onClick:e=>e.stopPropagation()},
        h('div',{className:'modal-title'},'Message '+wa.name+' — '+wa.phone),
        Object.entries(templates(wa)).map(([k,t])=>h('div',{key:k,style:{marginBottom:14}},
          h('div',{style:{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:5}},k),
          h('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 12px',fontSize:12.5,color:'var(--text2)',lineHeight:1.55}},t),
          h('button',{className:'btn btn-ghost btn-sm',style:{marginTop:6},onClick:()=>copy(t)},'Copy'))),
        h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:()=>setWa(null)},'Close'))))
  );
}

/* ---------- INVENTORY ---------- */
function seedStock(sid){
  const base=[
    ['L\u2019Or\u00e9al Majirel 5.3','tube',340,10,'Backbar — colour'],
    ['Developer 20 vol 1L','bottle',420,6,'Backbar — colour'],
    ['Ker\u00e1stase Bain Satin 250ml','bottle',1150,5,'Retail'],
    ['Olaplex No.3 100ml','bottle',1800,4,'Retail'],
    ['Hair spa mask 500g','jar',890,4,'Backbar — spa'],
    ['Wax beans 1kg','pack',520,6,'Backbar — beauty'],
    ['Gold facial kit','kit',1250,5,'Backbar — beauty'],
    ['Disposable towels','pack',260,8,'Consumable'],
    ['Foil roll 100m','roll',380,3,'Consumable'],
    ['Nail polish remover 500ml','bottle',180,4,'Consumable']
  ];
  return base.map((b,i)=>({id:'SKU-'+sid+String(i).padStart(2,'0'),name:b[0],unit:b[1],rate:b[2],min:b[3],cat:b[4],
    qty:Math.max(0,Math.round(b[3]*(0.3+fdRand(sid*11+i,2)*2.2))),
    moved:Math.floor(fdRand(sid+i,5)*40)}));
}
function InventorySheet({salon}){
  const {toast}=useToast();
  const sid=Number(salon&&salon.id)||1;
  const invKey=(s)=>outletKey('salonos_inventory_items',s);
  const loadInv=(s)=>{
    try{
      const raw=cachedLocalGet(invKey(s));
      if(raw!==null){
        const parsed=JSON.parse(raw);
        if(Array.isArray(parsed))return JSON.stringify(parsed)===JSON.stringify(seedStock(s))?[]:parsed;
      }
    }catch(e){}
    return [];
  };
  const [items,setItems]=useState(()=>loadInv(sid));
  // Outlet changed — load THAT outlet's saved stock (or seed it once if it has none yet). This
  // used to unconditionally re-seed on every outlet switch, silently discarding any real edits.
  useEffect(()=>{setItems(loadInv(sid));},[sid]);
  useEffect(()=>{safeLocalSet(invKey(sid),JSON.stringify(items));},[items,sid]);
  const [q,setQ]=useState('');
  const [lowOnly,setLowOnly]=useState(false);
  const [rec,setRec]=useState(null);

  const list=items.filter(i=>(!lowOnly||i.qty<=i.min)&&i.name.toLowerCase().includes(q.toLowerCase()));
  const INV_ITEM_FILTER_COLS=[
    {key:'name',label:'Item',get:i=>i.name},
    {key:'cat',label:'Category',get:i=>i.cat},
    {key:'onHand',label:'On hand',get:i=>i.qty+' '+i.unit}
  ];
  const invItemFilters=useExcelColumnFilter(list,INV_ITEM_FILTER_COLS);
  const invItemWrapRef=useRef(null);
  const invItemCellRange=useExcelCellRange(invItemWrapRef);
  const value=items.reduce((t,i)=>t+i.qty*i.rate,0);
  const low=items.filter(i=>i.qty<=i.min);
  const dead=items.filter(i=>i.moved<5);
  const reorderCost=low.reduce((t,i)=>t+(i.min*2-i.qty)*i.rate,0);

  const consume=(id)=>{setItems(l=>l.map(i=>i.id===id?{...i,qty:Math.max(0,i.qty-1),moved:i.moved+1}:i));toast('One unit issued to backbar','info')};
  const receive=()=>{
    const n=Number(rec.qty);
    if(!n||n<=0)return toast('Enter a quantity','error');
    setItems(l=>l.map(i=>i.id===rec.id?{...i,qty:i.qty+n}:i));
    toast(n+' '+rec.unit+' of '+rec.name+' received');setRec(null);
  };
  const stat=(l,v,s,col)=>h('div',{className:'metric-card'},h('div',{className:'metric-label'},l),
    h('div',{className:'metric-value',style:col?{color:col}:null},v),h('div',{className:'metric-sub'},s));

  return h('div',{className:'fade-in'},
    h('div',{className:'section-header'},
      h('div',null,h('div',{className:'page-title'},'Inventory'),
        h('div',{className:'page-sub'},'Backbar consumption, retail stock and what needs reordering.')),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>toast(low.length?'Purchase order drafted for '+low.length+' items — '+inr(reorderCost):'Nothing below reorder level',low.length?'success':'info')},'Draft purchase order')),
    h('div',{className:'grid4',style:{marginBottom:16}},
      stat('Stock value',inr(value),items.length+' SKUs'),
      stat('Below reorder',String(low.length),low.length?inr(reorderCost)+' to restock':'All healthy',low.length?'var(--red)':'var(--green)'),
      stat('Slow movers',String(dead.length),'under 5 units moved this month','var(--orange)'),
      stat('Retail SKUs',String(items.filter(i=>i.cat==='Retail').length),'margin builders')),
    h('div',{className:'card'},
      h('div',{className:'fd-toolbar'},
        h('input',{className:'form-control',style:{maxWidth:260},placeholder:'Search stock…',value:q,onChange:e=>setQ(e.target.value)}),
        h('button',{className:'btn btn-sm '+(lowOnly?'btn-primary':'btn-ghost'),onClick:()=>setLowOnly(!lowOnly)},'Low stock only')),
      h('div',{style:{fontSize:11,color:'var(--text3)',margin:'0 0 8px'}},'Click a cell — or drag across several — then Ctrl/Cmd+C to copy, just like Excel.'),
      h('div',{className:'attention-card attention-card-sm',style:{color:'var(--orange)',marginBottom:10}},'⚠ There\'s currently no way to add a brand-new stock item here — only receive/consume quantity for items already in the list. Known gap, not yet built.'),
      invItemFilters.filteredRows.length===0&&h('div',{style:{textAlign:'center',padding:'32px 20px',color:'var(--text3)'}},
        h('div',{style:{fontSize:28,marginBottom:8}},'📦'),
        h('div',{style:{fontWeight:600,color:'var(--text)',marginBottom:4}},'No stock items match'),
        h('div',{style:{fontSize:12}},q||lowOnly?'Try clearing your search or the Low Stock filter.':'No inventory recorded for this outlet yet.')),
      h('div',{className:'table-wrap',ref:invItemWrapRef},
        h('table',null,
          h('thead',null,h('tr',null,
            invItemFilters.TH(INV_ITEM_FILTER_COLS[0]),invItemFilters.TH(INV_ITEM_FILTER_COLS[1]),invItemFilters.TH(INV_ITEM_FILTER_COLS[2]),
            h('th',{key:'reorder'},'Reorder at'),h('th',{key:'rate'},'Rate'),h('th',{key:'value'},'Stock value'),h('th',{key:'moved'},'Moved'),h('th',{key:'action'},'Action')
          )),
          h('tbody',null,invItemFilters.filteredRows.map((i,ri)=>{
            const sel=(c)=>invItemCellRange.isSelected(ri,c)?'rgba(47,95,224,0.12)':undefined;
            return h('tr',{key:i.id},
              h('td',{'data-xr':ri,'data-xc':0,style:{background:sel(0)}},i.name,i.qty<=i.min?h('span',{className:'badge badge-red',style:{marginLeft:8}},'Reorder'):null),
              h('td',{'data-xr':ri,'data-xc':1,style:{background:sel(1)}},i.cat),
              h('td',{'data-xr':ri,'data-xc':2,style:{background:sel(2)}},i.qty+' '+i.unit),
              h('td',null,i.min),
              h('td',null,inr(i.rate)),
              h('td',null,inr(i.qty*i.rate)),
              h('td',null,i.moved),
              h('td',null,h('div',{style:{display:'flex',gap:6}},
                h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setRec({...i,qty:''})},'Receive'),
                h('button',{className:'btn btn-ghost btn-sm',onClick:()=>consume(i.id)},'Issue 1'))));
          }))
        )
      ),
      invItemFilters.Portal(),
      invItemCellRange.Toolbar()),
    rec&&h('div',{className:'modal-overlay',onClick:()=>setRec(null)},
      h('div',{className:'modal',style:{width:420},onClick:e=>e.stopPropagation()},
        h('div',{className:'modal-title'},'Receive stock — '+rec.name),
        h('div',{className:'form-group'},h('label',null,'Quantity in '+rec.unit),
          h('input',{className:'form-control',type:'number',autoFocus:true,value:rec.qty,
            onChange:e=>setRec({...rec,qty:e.target.value}),onKeyDown:e=>e.key==='Enter'&&receive()})),
        h('div',{className:'help-tip'},'Landed cost at '+inr(rec.rate)+' per '+rec.unit+' = '+inr((Number(rec.qty)||0)*rec.rate)),
        h('div',{className:'modal-actions'},
          h('button',{className:'btn btn-ghost',onClick:()=>setRec(null)},'Cancel'),
          h('button',{className:'btn btn-primary',onClick:receive},'Add to stock'))))
  );
}

/* ---------- COMMAND PALETTE ---------- */
function CommandPalette({open,setOpen,actions}){
  const [q,setQ]=useState('');
  const [i,setI]=useState(0);
  const ref=useRef(null);
  useEffect(()=>{if(open){setQ('');setI(0);setTimeout(()=>ref.current&&ref.current.focus(),30)}},[open]);
  if(!open)return null;
  const list=actions.filter(a=>(a.label+' '+a.group).toLowerCase().includes(q.toLowerCase())).slice(0,40);
  const run=(a)=>{if(a){a.run();setOpen(false)}};
  const key=e=>{
    if(e.key==='Escape')return setOpen(false);
    if(e.key==='ArrowDown'){e.preventDefault();setI(x=>Math.min(x+1,list.length-1))}
    if(e.key==='ArrowUp'){e.preventDefault();setI(x=>Math.max(x-1,0))}
    if(e.key==='Enter'){e.preventDefault();run(list[i])}
  };
  return h('div',{className:'cp-ov',onClick:()=>setOpen(false)},
    h('div',{className:'cp',onClick:e=>e.stopPropagation()},
      h('input',{ref,value:q,placeholder:'Jump to an outlet, sheet or report…',
        onChange:e=>{setQ(e.target.value);setI(0)},onKeyDown:key}),
      h('div',{className:'list'},
        list.length?list.map((a,n)=>h('div',{key:a.group+a.label,className:'it '+(n===i?'on':''),
          onMouseEnter:()=>setI(n),onClick:()=>run(a)},
          h('span',null,a.icon||'→'),h('span',null,a.label),h('span',{className:'grp'},a.group))):
          h('div',{className:'it'},'Nothing matches “'+q+'”')),
      h('div',{className:'foot'},
        h('span',null,h('kbd',null,'↑'),' ',h('kbd',null,'↓'),' navigate'),
        h('span',null,h('kbd',null,'Enter'),' open'),
        h('span',null,h('kbd',null,'Esc'),' close'))));
}

/* ---------- OUTLET MONTHLY P&L ---------- */
const PL_MONTHS=['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
const PL_STRUCT=[
  {sec:'Revenue',sign:1,src:'Collection Reco (Imported Data Preview)',lines:[
    ['Revenue from Operations - Cash Sale',0.15,0.10],['Revenue from Operations - Card Sale',0.35,0.08],
    ['Revenue from Operations - UPI Sale',0.42,0.07],['Other Income',0.03,0.30]]},
  {sec:'Direct cost of service',sign:-1,src:'Daily Sales & Exp.',lines:[]},
  {sec:'Employee cost',sign:-1,src:'Master Salary + Salary Working + Incentive Working + Daily Sales & Exp.',lines:[]},
  {sec:'Operating expenses',sign:-1,src:'Daily Sales & Exp. + Recurring Expenses + Bank Statement + Vendor Sheet',lines:[]},
];
const PL_BELOW=[['Depreciation on equipment & interiors',0.031,0.00],['Interest on equipment loan',0.014,0.01]];
// Real vendor-invoice total for a given Vendor category, in a calendar month — an invoice's own
// Category (if set on the invoice) wins over its vendor's default category, so a one-off invoice
// can be reclassified without having to change the vendor's own category. Performa Invoices are
// excluded, same as everywhere else — they're not a real payable yet.
// What each vendor invoice adds to expenses, dated by its invoice date. Normally a Performa Invoice
// adds nothing. With the outlet's "Treat Performa Invoice (PI) as an expense" (Master Sheet) on, a
// PI adds its full amount in its own month, and the first actual invoice booked against it
// (linkedPI) adds only the difference — actual − PI, short or excess, possibly negative — in the
// actual invoice's month. Any further actual invoices against the same PI add their full amount.
function vendorInvoiceExpenseEntries(salonId){
  const salon=outletSettings(salonId);
  const piOn=!!salon.piAsExpense;
  const invoices=loadVendorInvoices(salonId);
  const isPI=inv=>inv.docNature==='Performa Invoice';
  const piByKey={};
  const out=[];
  if(piOn)invoices.forEach(inv=>{if(isPI(inv)){piByKey[inv.vendorId+'|'+inv.invoiceNo]=inv;out.push({inv,amount:Number(inv.amount)||0,pi:null});}});
  const used=new Set();
  invoices.filter(inv=>!isPI(inv))
    .sort((a,b)=>{const da=toISO(a.invoiceDate)||'',db=toISO(b.invoiceDate)||'';return da<db?-1:da>db?1:0;})
    .forEach(inv=>{
      let amount=Number(inv.amount)||0,pi=null;
      if(piOn&&inv.linkedPI&&piByKey[inv.linkedPI]&&!used.has(inv.linkedPI)){
        pi=piByKey[inv.linkedPI];used.add(inv.linkedPI);
        amount=Math.round((amount-(Number(pi.amount)||0))*100)/100;
      }
      out.push({inv,amount,pi});
    });
  return out;
}
// excludeIds: invoices already counted another way (bills of a Variable recurring expense, which
// are spread over the months they cover instead of landing whole in their invoice month).
function vendorInvoiceCategorySumFor(salonId,year,month,categoryName,excludeIds){
  return vendorInvoiceCategoryBreakupFor(salonId,year,month,categoryName,excludeIds).reduce((s,r)=>s+r.amount,0);
}
// Same category-matching + same-month filter as vendorInvoiceCategorySumFor above, but returns
// the individual invoices instead of just their total — Vendor Name, Invoice Date, and Invoice
// No, for the P&L's "Purchase of Cosmetic" (and any other vendor-invoice-backed) line drill-down.
function vendorInvoiceCategoryBreakupFor(salonId,year,month,categoryName,excludeIds){
  const vendorsList=loadVendors(salonId);
  const out=[];
  vendorInvoiceExpenseEntries(salonId).forEach(({inv,amount,pi})=>{
    if(excludeIds&&excludeIds.has(inv.id))return;
    const vendor=vendorsList.find(v=>v.id===inv.vendorId);
    const effectiveCat=inv.category||(vendor?vendor.cat:'');
    if(effectiveCat!==categoryName)return;
    const iso=toISO(inv.invoiceDate);
    if(!iso)return;
    const d=new Date(iso+'T00:00:00');
    if(isNaN(d)||d.getFullYear()!==year||d.getMonth()!==month)return;
    out.push({vendorName:vendor?vendor.name:'(vendor deleted)',invoiceDate:inv.invoiceDate,
      invoiceNo:(inv.invoiceNo||'—')+(pi?' (₹'+Math.round(Number(inv.amount)||0).toLocaleString('en-IN')+' − PI '+(pi.invoiceNo||'')+' ₹'+Math.round(Number(pi.amount)||0).toLocaleString('en-IN')+')':''),
      docNature:inv.docNature,amount});
  });
  out.sort((a,b)=>{const da=toISO(a.invoiceDate)||'';const db=toISO(b.invoiceDate)||'';return da<db?-1:da>db?1:0;});
  return out;
}
// The two Direct Cost lines that are real, sourced from Daily Sales & Exp rather than the
// revenue-percentage model the rest of that section still uses. Purchase of Cosmetic also folds
// in real Vendor Sheet invoices categorised "Purchase of Cosmetic" — registered purchases through
// a vendor, plus any small ad-hoc ones entered directly in Daily Sales & Exp.
const PL_DIRECT_REAL_LINES=[
  {name:'Purchase of Cosmetic',group:'Purchase of Cosmetic',alsoVendorCat:'Purchase of Cosmetic'},
  {name:'Unregistered Purchase',group:'Unregistered Purchase'}
];

// Manual overrides for the two P&L items that have no real, naturally-tracked data source
// anywhere in this app: Other Income (gift cards, membership fees, anything not captured by
// Collection Reco) and Depreciation/Interest (accounting entries that come from a Fixed Asset
// Register / loan schedule, not day-to-day operations). These used to be filled in with a
// seeded-random percentage of revenue — fabricated numbers that looked plausible but weren't
// real. They now default honestly to 0 and are only ever whatever the person actually enters.
function loadPLManualOverrides(salonId){
  try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_pl_manual_overrides',salonId))||'{}');if(v&&typeof v==='object')return v;}catch(e){}
  return{};
}
function savePLManualOverride(salonId,year,month,field,value){
  const all=loadPLManualOverrides(salonId);
  const key=year+'-'+month;
  all[key]={...(all[key]||{}),[field]:value};
  safeLocalSet(outletKey('salonos_pl_manual_overrides',salonId),JSON.stringify(all));
}
// Builds a plBuild()-shaped result straight from a Previous Months P&L entry, so a historical,
// manually-entered month and a live, computed month can flow through every screen (Dashboard,
// Monthly P&L, Annual P&L, Reports Hub) identically — same shape, same fields, no special-casing
// needed downstream.
function plFromPreviousRecord(rec){
  const t=ppTotals(rec);
  const src='Previous Months P&L (manually entered)';
  const out={sections:[],below:[],isHistorical:true};
  out.sections.push({sec:'Revenue',sign:1,src,lines:[
    {name:'Revenue from Operations - Cash Sale',amt:Number(rec.cash)||0},
    {name:'Revenue from Operations - Card Sale',amt:Number(rec.card)||0},
    {name:'Revenue from Operations - UPI Sale',amt:Number(rec.upi)||0},
    {name:'Other Income',amt:Number(rec.otherIncome)||0}
  ],tot:t.revenue});
  out.sections.push({sec:'Direct cost of service',sign:-1,src,lines:[{name:'Direct Cost of Service',amt:t.direct}],tot:t.direct});
  out.sections.push({sec:'Employee cost',sign:-1,src,lines:[{name:'Employee Cost',amt:t.emp}],tot:t.emp});
  out.sections.push({sec:'Operating expenses',sign:-1,src,lines:PL_OPEX_LINES.map(l=>({name:l.name,amt:Number(rec.opex&&rec.opex[l.name])||0})),tot:t.opexTotal});
  out.below=[{name:'Depreciation',amt:Number(rec.depreciation)||0},{name:'Interest',amt:Number(rec.interest)||0}];
  out.revenue=t.revenue;out.direct=t.direct;out.gross=t.gross;out.opex=t.opexTotal;out.ebitda=t.ebitda;
  out.belowTot=(Number(rec.depreciation)||0)+(Number(rec.interest)||0);out.pbt=t.pbt;
  return out;
}
// Same category-matching logic as vendorInvoiceCategorySumFor, but sums actual PAYMENTS made
// this month (by payment date, across invoices from any month) rather than invoices booked this
// month (by invoice date) — the gap between the two is real cash movement the P&L doesn't show,
// since Purchase of Cosmetic is recognized on the P&L when the invoice is booked, not when it's
// actually paid.
function vendorPaymentsCategorySumFor(salonId,year,month,categoryName){
  const vendorsList=loadVendors(salonId);
  const invoices=loadVendorInvoices(salonId);
  let sum=0;
  invoices.forEach(inv=>{
    if(inv.docNature==='Performa Invoice')return;
    const vendor=vendorsList.find(v=>v.id===inv.vendorId);
    const effectiveCat=inv.category||(vendor?vendor.cat:'');
    if(effectiveCat!==categoryName)return;
    (inv.payments||[]).forEach(p=>{
      const iso=toISO(p.paidDate);
      if(!iso)return;
      const d=new Date(iso+'T00:00:00');
      if(isNaN(d)||d.getFullYear()!==year||d.getMonth()!==month)return;
      sum+=Number(p.paidAmount)||0;
    });
  });
  return sum;
}
// Manual overrides for the Cash Flow items with no natural source anywhere else in this app:
// Investing Activities (asset purchases/sales — there's no Fixed Asset Register) and Financing
// Activities (loan draw-downs/repayments, owner capital introduced/withdrawn), plus the Opening
// Cash & Bank Balance for the month. Same honest-default-to-0 pattern as Depreciation/Interest/
// Other Income on the P&L itself — real only when the person actually enters it.
function loadCashFlowManualOverrides(salonId){
  try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_cf_manual_overrides',salonId))||'{}');if(v&&typeof v==='object')return v;}catch(e){}
  return{};
}
function saveCashFlowManualOverride(salonId,year,month,field,value){
  const all=loadCashFlowManualOverrides(salonId);
  const key=year+'-'+month;
  all[key]={...(all[key]||{}),[field]:value};
  safeLocalSet(outletKey('salonos_cf_manual_overrides',salonId),JSON.stringify(all));
}
// ── Cash Flow Statement (Indirect Method) — starts from the P&L's own Profit Before Tax and
// reverses out every non-cash / not-yet-cash item already baked into that figure:
//  • Depreciation — a pure book entry, zero cash movement.
//  • The nine Recurring-Expense-driven Operating Expense lines (Rent, Electricity, Royalty, DG
//    Rent, Staff Room Rent, Telephone & Internet, Drycleaning, Professional Fee, Maintenance) —
//    each lands on the P&L as this month's accrual regardless of whether it was actually paid;
//    the gap against what Daily Sales & Exp shows as actually paid this month is real cash
//    retained (or spent beyond the accrual, if overpaid).
//  • Purchase of Cosmetic — booked on the vendor invoice date, paid whenever the invoice is
//    actually settled; same accrual-vs-paid gap, sourced from the Vendor Sheet.
// Investing/Financing Activities and Opening Balance are manual entries (see above) since
// nothing else in this app tracks fixed assets, loans, or owner capital movements.
function cashFlowFor(sid,year,month,cur){
  const overrides=(year!=null&&month!=null)?(loadCashFlowManualOverrides(sid)[year+'-'+month]||{}):{};
  const dep=cur.below.find(l=>/Depreciation/i.test(l.name));
  const depAmt=dep?dep.amt:0;
  // Historical months entered in Previous Months P&L are flat totals with no live line-item
  // detail — computing an accrual-vs-paid gap against today's Recurring Expenses/Vendor Sheet
  // data for a manually-entered past total would be misleading, so those two adjustments are
  // skipped for historical months (Depreciation and the Opening/Investing/Financing overrides
  // still apply normally).
  const isHistorical=!!cur.isHistorical;

  const opexAdj=(!isHistorical&&year!=null&&month!=null)?PL_OPEX_LINES.filter(l=>l.noDaily).map(l=>{
    const a=operatingExpenseAnnexureFor(sid,year,month,l.name);
    const accrued=a?a.recurringTotal:0;
    const paid=a?a.dailyAmt:0;
    return{name:l.name,accrued,paid,gap:accrued-paid};
  }):[];
  const opexGapTotal=opexAdj.reduce((s,l)=>s+l.gap,0);

  const cosmeticBooked=(!isHistorical&&year!=null&&month!=null)?vendorInvoiceCategorySumFor(sid,year,month,'Purchase of Cosmetic'):0;
  const cosmeticPaid=(!isHistorical&&year!=null&&month!=null)?vendorPaymentsCategorySumFor(sid,year,month,'Purchase of Cosmetic'):0;
  const cosmeticGap=cosmeticBooked-cosmeticPaid;

  const investing=Number(overrides.investing)||0;
  const financing=Number(overrides.financing)||0;
  const opening=Number(overrides.opening)||0;

  const operatingCF=cur.pbt+depAmt+opexGapTotal+cosmeticGap;
  const netCF=operatingCF+investing+financing;
  const closing=opening+netCF;

  return{pbt:cur.pbt,depAmt,opexAdj,opexGapTotal,cosmeticBooked,cosmeticPaid,cosmeticGap,operatingCF,investing,financing,netCF,opening,closing};
}
// ── Depreciation — Fixed Asset Register ──────────────────────────────────────────────────────
// Two different statutory methods, chosen automatically by the outlet's own Firm Category
// (Master Sheet → Edit Salon → Firm Details):
//  • Proprietorship / Partnership Firm / LLP → Income Tax Act, 1961, Section 32 — Block of
//    Assets, Written Down Value (WDV) method, rates per Appendix I of the Income Tax Rules, 1962.
//    Assets pool into a handful of blocks; the BLOCK carries a running WDV, not each asset
//    individually. An addition used for 180+ days in its year of purchase gets the full rate;
//    under 180 days gets half the rate (Section 32(1), second proviso).
//  • Private Limited → Companies Act, 2013, Schedule II — per-asset Straight Line Method (SLM)
//    depreciation over the prescribed useful life, standard 5% residual value.
// Both methods let opening assets (owned before this register was set up) be entered directly
// with their current carrying value, rather than requiring the full original purchase history.
const IT_BLOCKS=[
  {key:'building_res',label:'Building — Residential',rate:0.05},
  {key:'building_nonres',label:'Building — Non-Residential (incl. salon premises)',rate:0.10},
  {key:'furniture',label:'Furniture & Fittings (incl. salon chairs, fixtures)',rate:0.10},
  {key:'plant_general',label:'Plant & Machinery — General (salon equipment)',rate:0.15},
  {key:'motor_vehicle',label:'Motor Vehicles',rate:0.15},
  {key:'computers',label:'Computers & Software',rate:0.40},
  {key:'intangibles',label:'Intangible Assets (know-how, licenses, trademarks)',rate:0.25},
];
const COMPANIES_ACT_BLOCKS=[
  {key:'building_rcc',label:'Building — RCC Frame Structure',years:60},
  {key:'building_other',label:'Building — Other than RCC',years:30},
  {key:'furniture',label:'Furniture & Fittings (incl. salon chairs, fixtures)',years:10},
  {key:'office_equipment',label:'Office Equipment',years:5},
  {key:'plant_general',label:'Plant & Machinery — General (salon equipment)',years:15},
  {key:'computers_enduser',label:'Computers — End User Devices',years:3},
  {key:'computers_server',label:'Computers — Servers & Networks',years:6},
  {key:'motor_vehicle',label:'Motor Vehicles — Motor Cars',years:8},
  {key:'motor_2wheeler',label:'Motor Vehicles — Motorcycles/Scooters',years:10},
];
// Proprietorship, Partnership Firm and LLP all file under the Income Tax Act (no separate Firm
// concept for depreciation); only a company follows Schedule II of the Companies Act.
function depreciationMethodFor(firmCategory){return firmCategory==='Private Limited'?'companies_act':'income_tax';}
function depreciationBlocksFor(firmCategory){return depreciationMethodFor(firmCategory)==='companies_act'?COMPANIES_ACT_BLOCKS:IT_BLOCKS;}

function loadFixedAssets(salonId){
  try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_fixed_assets',salonId))||'[]');if(Array.isArray(v))return v;}catch(e){}
  return[];
}
function saveFixedAssets(salonId,assets){safeLocalSet(outletKey('salonos_fixed_assets',salonId),JSON.stringify(assets));}

// ── Bridge to Vendor Sheet — every invoice booked there with Category "Fixed Assets" should be
// depreciable without re-entering it by hand. The one thing Vendor Sheet has no concept of is
// which depreciation Block/Category it belongs to (that's a tax/accounting classification, not a
// purchasing one), so that single choice is captured here per invoice and everything else
// (cost, date, description) is read straight from the invoice — never duplicated or re-typed. ──
function loadFixedAssetBlockOverrides(salonId){
  try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_fixed_asset_blocks',salonId))||'{}');if(v&&typeof v==='object')return v;}catch(e){}
  return{};
}
// Keyed by invoice+line together (not just invoice), since one invoice can carry several
// distinct assets, each needing its own Block.
function fixedAssetLineKey(invoiceId,lineId){return invoiceId+'::'+lineId;}
function saveFixedAssetBlockOverride(salonId,lineKey,block){
  const all=loadFixedAssetBlockOverrides(salonId);
  if(block)all[lineKey]=block;else delete all[lineKey];
  safeLocalSet(outletKey('salonos_fixed_asset_blocks',salonId),JSON.stringify(all));
}
// Every non-Performa Vendor Sheet invoice booked under Category "Fixed Assets".
function vendorFixedAssetInvoices(salonId){
  return loadVendorInvoices(salonId).filter(inv=>(inv.category||'')==='Fixed Assets'&&inv.docNature!=='Performa Invoice');
}
// An invoice's asset line items — the new assetLines array if present, or a single synthetic
// line built from the old assetName field for invoices saved before multi-asset support existed.
function invoiceAssetLines(inv){
  if(inv.assetLines&&inv.assetLines.length)return inv.assetLines;
  if(inv.assetName)return[{id:'AL1',name:inv.assetName,amount:inv.amount}];
  return[];
}
// Joins every asset name on an invoice for display in the Fixed Assets register (e.g. "Salon
// chairs (4); Mirror; Reception desk" for a multi-asset invoice), falling back to the generic
// Description for an invoice with no asset lines at all.
function assetNamesDisplay(inv){
  const lines=invoiceAssetLines(inv).map(l=>l.name).filter(Boolean);
  return lines.length?lines.join('; '):(inv.desc||'—');
}
// Vendor invoice asset LINES that have had a Block assigned, reshaped into the same asset shape
// the depreciation engine already understands — these are never stored as separate "assets",
// only ever derived fresh from the Vendor Sheet + the block-assignment store above.
function vendorDerivedAssets(salonId){
  const overrides=loadFixedAssetBlockOverrides(salonId);
  const out=[];
  vendorFixedAssetInvoices(salonId).forEach(inv=>{
    invoiceAssetLines(inv).forEach(line=>{
      const key=fixedAssetLineKey(inv.id,line.id);
      if(!overrides[key])return;
      out.push({
        id:'VI-'+key,block:overrides[key],description:line.name||inv.desc||'',isOpening:false,
        cost:Number(line.amount)||0,addedDate:toISO(inv.bookingDate||inv.invoiceDate),
        fromVendorInvoice:true,vendorInvoiceId:inv.id,lineId:line.id
      });
    });
  });
  return out;
}
// Single combined pool the depreciation engine actually calculates from — manually-entered
// assets (opening balances, anything not tied to a Vendor Sheet invoice) plus every Vendor Sheet
// Fixed Asset invoice LINE that's been assigned a Block.
function depreciableAssetsFor(salonId){
  return[...loadFixedAssets(salonId),...vendorDerivedAssets(salonId)];
}

// ── FY string helpers — fy is always 'YYYY-YY' e.g. '2025-26', starting 1 April. ──
function fyStartYear(fy){return Number(String(fy).slice(0,4));}
function fyBoundsFromFyString(fy){
  const y=fyStartYear(fy);
  return{startYear:y,start:new Date(y,3,1),end:new Date(y+1,2,31)};
}
function fyOfDate(iso){
  if(!iso)return null;
  const d=new Date(iso+'T00:00:00');
  if(isNaN(d))return null;
  const y=d.getMonth()>=3?d.getFullYear():d.getFullYear()-1;
  return y+'-'+String(y+1).slice(2);
}
function nextFyString(fy){const y=fyStartYear(fy)+1;return y+'-'+String(y+1).slice(2);}
function daysInclusive(a,b){return Math.round((b-a)/86400000)+1;}

// ── Income Tax Act — Block of Assets, WDV method. Depreciation is a running-balance concept, so
// this replays every FY from the earliest one touched by an opening entry or a purchase, up to
// the target FY, carrying each block's WDV forward year over year. In normal use the person sets
// up the register with the block's CURRENT WDV as an opening entry for whichever FY they're in,
// so this loop typically runs once — the multi-year replay only matters if assets were entered
// spanning several years' purchases without an opening entry bringing the block up to date. ──
function itBlockScheduleFor(salonId,targetFy){
  const assets=depreciableAssetsFor(salonId);
  const blockMeta=Object.fromEntries(IT_BLOCKS.map(b=>[b.key,b]));
  const fyKeys=[];
  assets.forEach(a=>{
    if(a.isOpening&&a.openingAsOfFy)fyKeys.push(a.openingAsOfFy);
    if(!a.isOpening&&a.addedDate){const f=fyOfDate(a.addedDate);if(f)fyKeys.push(f);}
  });
  if(!fyKeys.length)return[];
  let fy=fyKeys.reduce((min,f)=>fyStartYear(f)<fyStartYear(min)?f:min,fyKeys[0]);
  const targetStartYear=fyStartYear(targetFy);
  if(fyStartYear(fy)>targetStartYear)return[]; // register only starts after the target FY — nothing to show yet
  const wdv={};
  let rows=[];
  let guard=0;
  while(guard++<100){
    const bounds=fyBoundsFromFyString(fy);
    assets.filter(a=>a.isOpening&&a.openingAsOfFy===fy).forEach(a=>{wdv[a.block]=(wdv[a.block]||0)+(Number(a.openingWDV)||0);});
    const add180={},addLt180={},disposals={};
    assets.filter(a=>!a.isOpening&&a.addedDate&&fyOfDate(a.addedDate)===fy).forEach(a=>{
      const usedDays=daysInclusive(new Date(a.addedDate+'T00:00:00'),bounds.end);
      const bucket=usedDays>=180?add180:addLt180;
      bucket[a.block]=(bucket[a.block]||0)+(Number(a.cost)||0);
    });
    assets.filter(a=>a.disposed&&a.disposalDate&&fyOfDate(a.disposalDate)===fy).forEach(a=>{
      disposals[a.block]=(disposals[a.block]||0)+(Number(a.disposalValue)||Number(a.cost)||0);
    });
    const allBlockKeys=new Set([...Object.keys(wdv),...Object.keys(add180),...Object.keys(addLt180),...Object.keys(disposals)]);
    rows=[];
    allBlockKeys.forEach(key=>{
      const meta=blockMeta[key];
      const rate=meta?meta.rate:0;
      const opening=wdv[key]||0;
      const a180=add180[key]||0,aLt180=addLt180[key]||0,disp=disposals[key]||0;
      const beforeDep=opening+a180+aLt180-disp;
      // Section 32: the rate applies to (Opening WDV + Additions − Sale proceeds during the
      // year), not to Opening WDV alone with disposals only affecting the closing balance
      // afterwards. Sale proceeds are netted against the full-rate portion of the block first.
      const fullRateBase=Math.max(0,opening+a180-disp);
      const dep=Math.min(Math.max(0,beforeDep),fullRateBase*rate+aLt180*rate*0.5);
      const closing=Math.max(0,beforeDep-dep);
      rows.push({block:key,label:meta?meta.label:key,rate,opening,additions180:a180,additionsLt180:aLt180,disposals:disp,depreciation:Math.round(dep),closing:Math.round(closing)});
      wdv[key]=closing;
    });
    if(fy===targetFy)break;
    fy=nextFyString(fy);
  }
  return rows;
}

// ── Companies Act, 2013 — Schedule II, per-asset Straight Line Method. Unlike WDV, SLM's annual
// charge is constant for an asset's life, so each asset's depreciation for the target FY can be
// computed directly from elapsed years — no year-by-year replay needed. ──
function companiesActScheduleFor(salonId,targetFy){
  const assets=depreciableAssetsFor(salonId);
  const blockMeta=Object.fromEntries(COMPANIES_ACT_BLOCKS.map(b=>[b.key,b]));
  const targetStartYear=fyStartYear(targetFy);
  const rows=[];
  assets.forEach(a=>{
    const meta=blockMeta[a.block];
    const usefulLifeYears=a.isOpening?(Number(a.remainingUsefulLifeYears)||0):(meta?meta.years:0);
    if(usefulLifeYears<=0)return;
    const baseValue=a.isOpening?(Number(a.openingWDV)||0):(Number(a.cost)||0);
    if(baseValue<=0)return;
    const residual=baseValue*0.05;
    const annualDep=(baseValue-residual)/usefulLifeYears;
    const startFy=a.isOpening?a.openingAsOfFy:fyOfDate(a.addedDate);
    if(!startFy)return;
    const startYear=fyStartYear(startFy);
    const elapsedYears=targetStartYear-startYear;
    if(elapsedYears<0)return; // not yet acquired/opened as of the target FY
    if(elapsedYears>=usefulLifeYears)return; // fully depreciated — no charge, carrying value sits at residual
    const disposalFy=a.disposed?fyOfDate(a.disposalDate):null;
    if(disposalFy&&fyStartYear(disposalFy)<targetStartYear)return; // disposed in an earlier FY
    let dep=annualDep;
    let note='';
    if(elapsedYears===0&&!a.isOpening){
      // Year of purchase — prorate by days actually in use during this FY.
      const bounds=fyBoundsFromFyString(targetFy);
      const usedDays=daysInclusive(new Date(a.addedDate+'T00:00:00'),bounds.end);
      const fyDays=daysInclusive(bounds.start,bounds.end);
      dep=annualDep*(usedDays/fyDays);
      note='prorated — purchased mid-year';
    }
    if(disposalFy&&fyStartYear(disposalFy)===targetStartYear){
      const bounds=fyBoundsFromFyString(targetFy);
      const usedDays=daysInclusive(bounds.start,new Date(a.disposalDate+'T00:00:00'));
      const fyDays=daysInclusive(bounds.start,bounds.end);
      dep=annualDep*(usedDays/fyDays);
      note=note?note+', disposed mid-year':'prorated — disposed mid-year';
    }
    const carryingAtStart=baseValue-annualDep*elapsedYears;
    const closing=Math.max(residual,carryingAtStart-dep);
    rows.push({id:a.id,block:a.block,label:(meta?meta.label:a.block)+(a.description?' — '+a.description:''),usefulLifeYears,annualDep:Math.round(annualDep),
      opening:Math.round(Math.max(residual,carryingAtStart)),depreciation:Math.round(Math.max(0,dep)),closing:Math.round(closing),note});
  });
  return rows;
}

// The single figure that feeds the P&L — total depreciation for the FY, computed by whichever
// method the outlet's Firm Category requires. Used for the Depreciation tab's FY summary and by
// Cash Flow; the actual month-by-month P&L line uses monthlyDepreciationFor() below instead of a
// flat ÷12 of this, so a December purchase doesn't phantom-charge depreciation back in April.
function annualDepreciationFor(salonId,fy){
  const salonRec=getSalonRecordById(salonId);
  const method=depreciationMethodFor(salonRec&&salonRec.firmCategory);
  const schedule=method==='companies_act'?companiesActScheduleFor(salonId,fy):itBlockScheduleFor(salonId,fy);
  return schedule.reduce((s,r)=>s+(r.depreciation||0),0);
}

// ── The actual monthly depreciation charge for the P&L — unlike a flat (annual ÷ 12), this
// correctly shows ₹0 for any month before an asset existed, and — for an asset purchased during
// the year — divides its depreciation across the exact number of days from its purchase date to
// 31 March of that FY, not whole-month buckets (so a 25 December purchase counts only the ~6
// remaining days of December, not a full month's share):
//  • Companies Act (SLM, per-asset): each asset's own FY figure (already prorated for a mid-year
//    purchase/disposal by companiesActScheduleFor) is divided by the exact number of days it was
//    actually owned that FY, then multiplied by however many of those days fall in the target
//    calendar month.
//  • Income Tax Act (WDV, per-block): the portion of a block's depreciation attributable to its
//    OPENING balance (value that existed since 1 April) is divided the same way across the days
//    of the full FY; the portion attributable to a NEW addition during the year is divided across
//    only the days from its purchase date to 31 March. Disposals are netted at the block level
//    exactly as itBlockScheduleFor already does and, for simplicity, are treated as reducing the
//    opening portion evenly across the year rather than pinpointing the exact disposal date. ──
function daysOwnedInMonth(rangeStart,rangeEnd,year,month){
  const monthStart=new Date(year,month,1);
  const monthEnd=new Date(year,month+1,0);
  const overlapStart=rangeStart>monthStart?rangeStart:monthStart;
  const overlapEnd=rangeEnd<monthEnd?rangeEnd:monthEnd;
  if(overlapStart>overlapEnd)return 0;
  return daysInclusive(overlapStart,overlapEnd);
}
function monthlyDepreciationFor(salonId,year,month){
  const salonRec=getSalonRecordById(salonId);
  const isCompaniesAct=depreciationMethodFor(salonRec&&salonRec.firmCategory)==='companies_act';
  const cal=calToFYMI(year,month);
  const fy=cal.fy;
  const assets=depreciableAssetsFor(salonId);
  const bounds=fyBoundsFromFyString(fy);

  if(isCompaniesAct){
    const rows=companiesActScheduleFor(salonId,fy);
    let total=0;
    rows.forEach(r=>{
      const asset=assets.find(a=>a.id===r.id);
      if(!asset)return;
      let rangeStart=bounds.start;
      if(!asset.isOpening){
        const acqFy=fyOfDate(asset.addedDate);
        if(acqFy===fy)rangeStart=new Date(asset.addedDate+'T00:00:00'); // purchased this FY — start counting from the purchase date, not 1 April
      }
      let rangeEnd=bounds.end;
      if(asset.disposed&&fyOfDate(asset.disposalDate)===fy)rangeEnd=new Date(asset.disposalDate+'T00:00:00');
      const totalDaysOwned=daysInclusive(rangeStart,rangeEnd);
      if(totalDaysOwned<=0)return;
      const daysThisMonth=daysOwnedInMonth(rangeStart,rangeEnd,year,month);
      if(daysThisMonth<=0)return;
      total+=(r.depreciation/totalDaysOwned)*daysThisMonth;
    });
    return Math.round(total);
  }

  const rows=itBlockScheduleFor(salonId,fy);
  const fyTotalDays=daysInclusive(bounds.start,bounds.end);
  let total=0;
  rows.forEach(r=>{
    const disp=r.disposals||0;
    const openingAfterDisposal=Math.max(0,r.opening-disp);
    const openingAnnualDep=openingAfterDisposal*r.rate;
    // Opening portion — existed the whole FY, divided by the FY's actual day count (365/366).
    const openingDaysThisMonth=daysOwnedInMonth(bounds.start,bounds.end,year,month);
    total+=(openingAnnualDep/fyTotalDays)*openingDaysThisMonth;

    // New additions this FY — divided only across the days from purchase date to 31 March.
    assets.filter(a=>!a.isOpening&&a.block===r.block&&a.addedDate&&fyOfDate(a.addedDate)===fy).forEach(a=>{
      const purchaseDate=new Date(a.addedDate+'T00:00:00');
      const totalDaysOwned=daysInclusive(purchaseDate,bounds.end);
      if(totalDaysOwned<=0)return;
      const usedDays=totalDaysOwned; // same measure the 180-day rule in itBlockScheduleFor already uses
      const rateMultiplier=usedDays>=180?1:0.5;
      const assetAnnualDep=(Number(a.cost)||0)*r.rate*rateMultiplier;
      const daysThisMonth=daysOwnedInMonth(purchaseDate,bounds.end,year,month);
      if(daysThisMonth<=0)return;
      total+=(assetAnnualDep/totalDaysOwned)*daysThisMonth;
    });
  });
  return Math.round(total);
}

// ── P&L Variance Analysis — compares two periods' P&L line-by-line (every Revenue/Direct Cost/
// Employee Cost/Operating Expense line, plus section totals and Net Profit), computing % and ₹
// variance for each and flagging which ones are "significant" — a threshold on BOTH % and ₹
// magnitude together, so a huge % swing on a trivial base amount (₹50 → ₹150 is +200%) doesn't
// get flagged the same way as a real material change. Revenue/profit lines: an increase is
// favourable (green). Expense lines: an increase is UNFAVOURABLE (red) — the exact opposite
// colour logic from revenue, computed centrally here so every screen that shows a variance
// agrees on which direction is "good" for which kind of line. ──
function plVarianceLine(label,a,b,kind){ // kind: 'revenue'|'expense'|'profit'
  a=Math.round(a||0);b=Math.round(b||0);
  const diffAmt=b-a;
  const diffPct=a!==0?Math.round((diffAmt/Math.abs(a))*1000)/10:(b!==0?100:0);
  const favourable=kind==='expense'?diffAmt<=0:diffAmt>=0;
  const significant=Math.abs(diffPct)>=10&&Math.abs(diffAmt)>=1000;
  let comment=null;
  if(significant){
    const dir=diffAmt>=0?'increased':'decreased';
    const tone=favourable
      ?(kind==='expense'?'— cost under control':'— positive momentum, keep it up')
      :(kind==='expense'?'— worth a closer look':'— needs attention');
    comment={text:label+' '+dir+' by '+Math.abs(diffPct)+'% (₹'+Math.abs(diffAmt).toLocaleString('en-IN')+') '+tone,favourable};
  }
  return{label,a,b,diffAmt,diffPct,kind,favourable,significant,comment};
}
function buildPnLVariance(salonId,fyA,miA,fyB,miB){
  const dA=plBuild(salonId,fyA,miA),dB=plBuild(salonId,fyB,miB);
  const revA=dA.sections[0].lines,revB=dB.sections[0].lines;
  const dirA=dA.sections[1],dirB=dB.sections[1],empA=dA.sections[2],empB=dB.sections[2],opexA=dA.sections[3],opexB=dB.sections[3];
  const revenueLines=revA.map((l,i)=>plVarianceLine(l.name.replace('Revenue from Operations - ',''),l.amt,revB[i]?revB[i].amt:0,'revenue'));
  // Match by line name (not position) so a line present in one period but not the other still
  // compares against ₹0 rather than being silently dropped from the report.
  const matchLines=(linesA,linesB,kind)=>{
    const names=Array.from(new Set([...(linesA||[]).map(l=>l.name),...(linesB||[]).map(l=>l.name)]));
    return names.map(name=>{
      const a=(linesA||[]).find(l=>l.name===name);const b=(linesB||[]).find(l=>l.name===name);
      return plVarianceLine(name,a?a.amt:0,b?b.amt:0,kind);
    });
  };
  const directLines=matchLines(dirA.lines,dirB.lines,'expense');
  const empLines=matchLines(empA.lines,empB.lines,'expense');
  const opexLines=matchLines(opexA.lines,opexB.lines,'expense');
  const totals=[
    plVarianceLine('Total Revenue',dA.revenue,dB.revenue,'revenue'),
    plVarianceLine('Direct Cost of Service',dA.direct,dB.direct,'expense'),
    plVarianceLine('Gross Profit',dA.gross,dB.gross,'profit'),
    plVarianceLine('Employee Cost',empA.tot,empB.tot,'expense'),
    plVarianceLine('Operating Expenses',opexA.tot,opexB.tot,'expense'),
    plVarianceLine('EBITDA',dA.ebitda,dB.ebitda,'profit'),
    plVarianceLine('Net Profit (PBT)',dA.pbt,dB.pbt,'profit'),
  ];
  const comments=[...revenueLines,...directLines,...empLines,...opexLines,...totals]
    .filter(l=>l.comment).sort((x,y)=>Math.abs(y.diffAmt)-Math.abs(x.diffAmt));
  return{dA,dB,revenueLines,directLines,empLines,opexLines,totals,comments};
}
function plBuild(sid,fy,mi){
  const cal=periodToCalendar({fy,mi});
  // A historical month entered in Previous Months P&L takes over entirely — computing a "live"
  // P&L from Collection Reco/Daily Sales & Exp for a month that was never tracked live here would
  // just be zeros, which is worse than honestly using what was actually recorded for it.
  if(cal){
    const prevRecord=loadPreviousPnL(sid).find(r=>r.year===cal.year&&r.month===cal.month);
    if(prevRecord)return plFromPreviousRecord(prevRecord);
  }
  // Real revenue for the month, straight from Collection Reco's Imported Data Preview — the
  // /1.05 backs GST out of the gross collected amount to arrive at the revenue figure.
  const coll=cal?collectionSalesSumFor(sid,cal.year,cal.month):{cash:0,card:0,upi:0};
  const realCash=coll.cash/1.05,realCard=coll.card/1.05,realUpi=coll.upi/1.05;
  const overrides=cal?(loadPLManualOverrides(sid)[cal.year+'-'+cal.month]||{}):{};
  const otherIncome=Number(overrides.otherIncome)||0;
  const out={sections:[],below:[]};
  let revTotal=0,directTotal=0,opexTotal=0;
  PL_STRUCT.forEach((S,si)=>{
    if(S.sec==='Revenue'){
      const lines=[
        {name:'Revenue from Operations - Cash Sale',amt:Math.round(realCash)},
        {name:'Revenue from Operations - Card Sale',amt:Math.round(realCard)},
        {name:'Revenue from Operations - UPI Sale',amt:Math.round(realUpi)},
        {name:'Other Income',amt:otherIncome}
      ];
      const tot=lines.reduce((t,l)=>t+l.amt,0);
      revTotal+=tot;
      out.sections.push({...S,lines,tot});
      return;
    }
    // Employee cost is built directly from Master Salary + Salary Working + Incentive Working +
    // Daily Sales & Exp — not the generic revenue-percentage model used for the leftover
    // synthetic sections.
    if(S.sec==='Employee cost'&&cal){
      const ec=employeeCostFor(sid,cal.year,cal.month);
      opexTotal+=ec.tot;
      out.sections.push({...S,lines:ec.lines,tot:ec.tot,detail:ec.detail});
      return;
    }
    // Operating expenses is entirely real, sourced from Daily Sales & Exp. (and Bank Statement
    // for the Bank Charges line) — see operatingExpensesFor / PL_OPEX_LINES.
    if(S.sec==='Operating expenses'&&cal){
      const oe=operatingExpensesFor(sid,cal.year,cal.month);
      opexTotal+=oe.tot;
      out.sections.push({...S,lines:oe.lines,tot:oe.tot});
      return;
    }
    // Direct cost of service — the two real lines from Daily Sales & Exp / Vendor invoices;
    // PL_STRUCT's own `lines` for this section is empty, so there's nothing synthetic left here.
    const extraLines=(S.sec==='Direct cost of service'&&cal)
      ?PL_DIRECT_REAL_LINES.map(l=>({name:l.name,amt:dailySalesGroupSumFor(sid,cal.year,cal.month,l.group)+(l.alsoVendorCat?vendorInvoiceCategorySumFor(sid,cal.year,cal.month,l.alsoVendorCat):0)}))
      :[];
    const lines=extraLines;
    const tot=lines.reduce((t,l)=>t+l.amt,0);
    if(S.sec==='Direct cost of service')directTotal+=tot;
    else opexTotal+=tot;
    out.sections.push({...S,lines,tot});
  });
  // Depreciation defaults to the Fixed Asset Register's calculated monthly share (annual ÷ 12)
  // unless this specific month has its own manual override on file — same override-takes-
  // precedence convention as every other computed-but-editable line on this P&L. Interest has no
  // automatic source anywhere in this app, so it stays manual-only, defaulting to 0.
  const hasDepOverride=cal&&Object.prototype.hasOwnProperty.call(overrides,'depreciation');
  const depAuto=cal?monthlyDepreciationFor(sid,cal.year,cal.month):0;
  out.below=PL_BELOW.map((l,i)=>({name:l[0],amt:i===0?(hasDepOverride?Number(overrides.depreciation)||0:depAuto):(Number(overrides.interest)||0)}));
  out.revenue=revTotal;
  out.direct=directTotal;
  out.gross=revTotal-directTotal;
  out.opex=opexTotal;
  out.ebitda=out.gross-opexTotal;
  out.belowTot=out.below.reduce((t,l)=>t+l.amt,0);
  out.pbt=out.ebitda-out.belowTot;
  return out;
}