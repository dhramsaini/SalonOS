

function TallyExportSheet({salon,onNavTab}={}){
  const salonId=salon?.id;
  const {success,error:tallyErr}=useToast();
  const [refreshTick,setRefreshTick]=useState(0);
  const doRefresh=()=>setRefreshTick(t=>t+1);

  const vendors=useMemo(()=>loadVendors(salonId),[salonId,refreshTick]);
  const invoices=useMemo(()=>loadVendorInvoices(salonId).filter(inv=>inv.docNature!=='Performa Invoice'),[salonId,refreshTick]);
  const bankRows=useMemo(()=>loadBankStatementRows(salonId).filter(r=>r.debit||r.credit),[salonId,refreshTick]);
  const categories=useMemo(()=>Array.from(new Set(invoices.map(inv=>inv.category).filter(Boolean))).sort(),[invoices]);
  const gstTypesUsed=useMemo(()=>({
    igst:invoices.some(inv=>Number(inv.igst)>0),
    cgst:invoices.some(inv=>Number(inv.cgst)>0),
    sgst:invoices.some(inv=>Number(inv.sgst)>0)
  }),[invoices]);
  // Whether this outlet can claim GST Input Credit — if blocked, Purchase Vouchers book the
  // full invoice amount to the expense ledger directly (no separate GST Input ledgers at all),
  // since there's no recoverable asset to track.
  const gstInputBlocked=!gstInputAllowedAsOf(salon,new Date().toISOString().slice(0,10));

  const [map,setMap]=useState(()=>loadTallyLedgerMap(salonId));
  useEffect(()=>{setMap(loadTallyLedgerMap(salonId));},[salonId,refreshTick]);
  const updateMap=(next)=>{setMap(next);saveTallyLedgerMap(next,salonId);};
  const vendorLedgerNameFor=(id)=>{const v=vendors.find(x=>x.id===id);return(map.vendors&&map.vendors[id])||(v?v.name:id);};
  const categoryLedgerNameFor=(cat)=>(map.categories&&map.categories[cat])||cat;

  // ── Date range — narrows which invoices/bank rows go into a Voucher export (Masters aren't
  // date-scoped since ledgers either exist or don't). Empty = everything on file. ──
  const [fromDate,setFromDate]=useState('');
  const [toDate,setToDate]=useState('');
  const dmyToIso=(dmy)=>{const p=parseInvoiceDateFlexible(dmy);return p?p.y+'-'+String(p.m).padStart(2,'0')+'-'+String(p.d).padStart(2,'0'):'';};
  const inRange=(dmy)=>{if(!fromDate&&!toDate)return true;const iso=dmyToIso(dmy);if(!iso)return true;if(fromDate&&iso<fromDate)return false;if(toDate&&iso>toDate)return false;return true;};
  const filteredInvoices=invoices.filter(inv=>inRange(inv.bookingDate||inv.invoiceDate));
  const filteredBankRows=bankRows.filter(r=>inRange(r.transactionDate));

  const outletTag=salon?salon.name.split('—')[0].trim().replace(/\s+/g,''):'Outlet';

  const downloadMasters=()=>{
    if(!map.bankLedger){tallyErr('Enter the Bank ledger name (exactly as it exists in Tally) before downloading masters.');return;}
    const xml=buildTallyMastersXml(vendors,categories,gstTypesUsed,map.bankLedger,vendorLedgerNameFor,categoryLedgerNameFor,gstInputBlocked);
    downloadTextFile(xml,'Tally_Masters_'+outletTag+'.xml');
    markSynced(vendors.map(v=>v.id),categories,true);
    success('Masters XML downloaded — import this FIRST via Gateway of Tally → Import Data → Masters.');
  };
  const downloadPurchaseVouchers=()=>{
    if(!filteredInvoices.length){tallyErr('No vendor invoices in this date range.');return;}
    const xml=buildTallyPurchaseVouchersXml(filteredInvoices,vendorLedgerNameFor,categoryLedgerNameFor,gstInputBlocked);
    downloadTextFile(xml,'Tally_PurchaseVouchers_'+outletTag+'.xml');
    success(filteredInvoices.length+' invoice(s) exported — import via Gateway of Tally → Import Data → Vouchers (after the Masters file).');
  };
  const downloadBankVouchers=()=>{
    if(!map.bankLedger){tallyErr('Enter the Bank ledger name before downloading bank vouchers.');return;}
    if(!filteredBankRows.length){tallyErr('No bank statement transactions in this date range.');return;}
    const xml=buildTallyBankVouchersXml(filteredBankRows,map.bankLedger,vendors);
    downloadTextFile(xml,'Tally_BankVouchers_'+outletTag+'.xml');
    success(filteredBankRows.length+' transaction(s) exported — import via Gateway of Tally → Import Data → Vouchers.');
  };
  const downloadInvoiceCsv=()=>{
    const hdr=['Vendor (Tally Ledger)','Invoice No.','Booking Date','Category (Tally Ledger)','Taxable Value','IGST','CGST','SGST','Round Off','Total Amount','Description'];
    const rows=filteredInvoices.map(inv=>[vendorLedgerNameFor(inv.vendorId),inv.invoiceNo||'',inv.bookingDate||inv.invoiceDate||'',categoryLedgerNameFor(inv.category),inv.taxable||0,inv.igst||0,inv.cgst||0,inv.sgst||0,inv.roundOff||0,inv.amount||0,inv.desc||''].map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(','));
    const csv=[hdr.map(h=>'"'+h+'"').join(','),...rows].join('\n');
    downloadTextFile('\uFEFF'+csv,'Tally_VendorInvoices_'+outletTag+'.csv','text/csv;charset=utf-8');
  };
  const downloadBankCsv=()=>{
    const hdr=['Date','Narration','Debit','Credit','Voucher Type','Counterparty (Tally Ledger)'];
    const rows=filteredBankRows.map(r=>{const match=findVendorMatch(r.description,vendors);return[r.transactionDate||'',r.description||'',r.debit||'',r.credit||'',r.debit?'Payment':'Receipt',match?match.name:''].map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',');});
    const csv=[hdr.map(h=>'"'+h+'"').join(','),...rows].join('\n');
    downloadTextFile('\uFEFF'+csv,'Tally_BankStatement_'+outletTag+'.csv','text/csv;charset=utf-8');
  };

  // ── Tally Connector: live link to Tally through the local SalonOS Tally Connector ──
  const [conn,setConn]=useState(()=>loadTallyConnectorCfg());
  const updateConn=(patch)=>{const next={...conn,...patch};setConn(next);saveTallyConnectorCfg(next);};
  const [connState,setConnState]=useState({checking:false,ok:false,tally:false,msg:'',companies:[]});
  const [showConnSettings,setShowConnSettings]=useState(false);
  const checkConnector=async(cfg)=>{
    const c=cfg||conn;
    setConnState(s=>({...s,checking:true}));
    try{
      const st=await tallyConnectorStatus(c);
      let companies=[];
      if(st.tallyReachable){try{companies=parseTallyCompanies(await tallyConnectorCall(c,'/tally',buildTallyCompanyListXml()));}catch(e){}}
      setConnState({checking:false,ok:true,tally:!!st.tallyReachable,companies,
        msg:st.tallyReachable?('Connected to Tally at '+st.tally+(companies.length?' — '+companies.length+' compan'+(companies.length===1?'y':'ies')+' open':'')):('Connector is running, but Tally is not answering at '+st.tally+' — open Tally with a company loaded and enable its XML/ODBC server (port 9000).')});
      if(st.tallyReachable&&companies.length===1&&!c.company)updateConn({company:companies[0]});
      return !!st.tallyReachable;
    }catch(e){setConnState({checking:false,ok:false,tally:false,companies:[],msg:e.message});return false;}
  };
  useEffect(()=>{checkConnector();/* eslint-disable-next-line */},[]);
  const [pushBusy,setPushBusy]=useState('');
  // Sends XML to Tally through the connector and reports Tally's own answer (created / updated /
  // rejected). Without the connector, falls back to the old blind send to localhost:9000.
  const tryDirectPush=async(xml,label)=>{
    setPushBusy(label);
    try{
      const reply=await tallySend(conn,xml);
      const r=parseTallyImportResult(reply);
      (r.errors||r.exceptions?tallyErr:success)(label+' → Tally: '+tallyResultText(r)+'.');
      setPushBusy('');return r;
    }catch(err){
      if(!err.notRunning){tallyErr(label+': '+err.message);setPushBusy('');return null;}
      try{
        await fetch('http://localhost:9000',{method:'POST',headers:{'Content-Type':'text/xml'},body:withTallyCompany(xml,conn.company),mode:'no-cors'});
        success('Sent to Tally at localhost:9000 without the connector — Tally’s reply can’t be read this way, so check Tally’s Day Book. Start the SalonOS Tally Connector for confirmed results.');
      }catch(e2){tallyErr(err.message);}
    }
    setPushBusy('');return null;
  };

  const unmappedVendors=vendors.filter(v=>!map.vendors||!map.vendors[v.id]).length;

  // ── New-since-last-export tracking ──
  const [synced,setSynced]=useState(()=>loadTallySyncedLedgers(salonId));
  useEffect(()=>{setSynced(loadTallySyncedLedgers(salonId));},[salonId,refreshTick]);
  const markSynced=(vendorIds,cats,bankToo)=>{
    const next={
      vendors:{...synced.vendors,...Object.fromEntries(vendorIds.map(id=>[id,true]))},
      categories:{...synced.categories,...Object.fromEntries(cats.map(c=>[c,true]))},
      bank:synced.bank||!!bankToo
    };
    setSynced(next);saveTallySyncedLedgers(next,salonId);
  };
  const newVendors=vendors.filter(v=>!synced.vendors[v.id]);
  const newCategories=categories.filter(c=>!synced.categories[c]);
  const hasNewLedgers=newVendors.length>0||newCategories.length>0;

  const downloadNewLedgersOnly=()=>{
    if(!hasNewLedgers){tallyErr('Nothing new to push — every current Vendor and Category is already marked synced.');return;}
    const xml=buildTallyMastersXml(newVendors,newCategories,{igst:false,cgst:false,sgst:false},'',vendorLedgerNameFor,categoryLedgerNameFor);
    downloadTextFile(xml,'Tally_NewLedgers_'+outletTag+'.xml');
    markSynced(newVendors.map(v=>v.id),newCategories,false);
    success((newVendors.length+newCategories.length)+' new ledger(s) downloaded — import via Gateway of Tally → Import Data → Masters, then they\'re marked synced here.');
  };

  // ── Tally's actual ledger list, read through the connector (with its Parent group).
  // Ledgers fetched from Tally are kept per outlet (shared), so the mapping suggestions and the
  // "missing in Tally" check work for everyone until the next fetch.
  const [ledgerCache,setLedgerCache]=useState(()=>loadTallyLedgerCache(salonId));
  useEffect(()=>{setLedgerCache(loadTallyLedgerCache(salonId));},[salonId,refreshTick]);
  const tallyLedgerList=ledgerCache?ledgerCache.ledgers.map(l=>l.name):null;
  const [fetchingLedgers,setFetchingLedgers]=useState(false);
  const fetchLedgersFromTally=async(quiet)=>{
    setFetchingLedgers(true);
    try{
      const ledgers=parseTallyLedgersDetailed(await tallySend(conn,buildTallyLedgerListRequestXml(conn.company)));
      const cache={ledgers,company:conn.company||'',fetchedAt:new Date().toISOString()};
      saveTallyLedgerCache(salonId,cache);setLedgerCache(cache);
      if(!quiet){if(ledgers.length)success('Fetched '+ledgers.length+' ledger(s) from Tally'+(conn.company?' ('+conn.company+')':'')+'.');else tallyErr('Tally answered but sent no ledgers — check the right company is open/selected.');}
      setFetchingLedgers(false);return cache;
    }catch(err){
      if(!quiet)tallyErr('Could not fetch ledgers from Tally: '+err.message);
      setFetchingLedgers(false);return null;
    }
  };
  // Ledgers SalonOS needs that Tally doesn't have yet (by exact name).
  const missingFrom=(cache)=>{
    if(!cache)return null;
    const have=new Set(cache.ledgers.map(l=>l.name.toLowerCase()));
    return tallyMastersPreviewRows(vendors,categories,gstTypesUsed,map.bankLedger,vendorLedgerNameFor,categoryLedgerNameFor,gstInputBlocked).filter(r=>!have.has(String(r.name).toLowerCase()));
  };
  const missingInTally=missingFrom(ledgerCache);
  // Creates exactly the missing ledgers in Tally, then re-reads Tally's list to confirm.
  const createMissingInTally=async(quiet,cache)=>{
    const miss=missingFrom(cache||ledgerCache)||[];
    if(!miss.length){if(!quiet)success('Tally already has every ledger SalonOS needs.');return;}
    const names=new Set(miss.map(r=>r.name));
    const vend=vendors.filter(v=>names.has(vendorLedgerNameFor(v.id)));
    const cats=categories.filter(c=>names.has(categoryLedgerNameFor(c)));
    const gst={igst:names.has('IGST Input'),cgst:names.has('CGST Input'),sgst:names.has('SGST Input')};
    const xml=buildTallyMastersXml(vend,cats,gst,names.has(map.bankLedger)?map.bankLedger:'',vendorLedgerNameFor,categoryLedgerNameFor,gstInputBlocked);
    const r=await tryDirectPush(xml,'New ledgers ('+miss.length+')');
    if(r){markSynced(vend.map(v=>v.id),cats,names.has(map.bankLedger));await fetchLedgersFromTally(true);}
  };
  // With "auto-create" on: when the connector and Tally are reachable, ledgers added in SalonOS
  // (new vendors, new categories) are created in Tally when this tab opens.
  const autoRanRef=useRef(false);
  useEffect(()=>{
    if(autoRanRef.current||!connState.tally||!conn.autoCreate)return;
    autoRanRef.current=true;
    (async()=>{const cache=await fetchLedgersFromTally(true);if(cache&&(missingFrom(cache)||[]).length)await createMissingInTally(false,cache);})();
    // eslint-disable-next-line
  },[connState.tally]);

  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Tally Export'),
        React.createElement('div',{className:'page-sub'},'Push Vendor invoices and Bank Statement data into Tally — as its own native import format')
      ),
      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:doRefresh},'⟳ Refresh')
    ),

    React.createElement('div',{style:{fontSize:12.5,color:'var(--text2)',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 16px',marginBottom:16,lineHeight:1.6}},
      React.createElement('b',{style:{color:'var(--text)'}},'How this works: '),
      'This generates the same XML format Tally itself uses to import and export data — free, and more reliable than an Excel-based import. Download the files below, then in Tally go to ',
      React.createElement('b',null,'Gateway of Tally → Import Data'),
      ' — Masters first, then Vouchers. Or connect live with the SalonOS Tally Connector below: ledgers are read from Tally, new ones are created there, and vouchers are sent straight in with Tally’s own confirmation.'
    ),

    // ── Tally Connector — live link (local PC, office server or cloud desktop) ──
    React.createElement('div',{className:'card',style:{marginBottom:16,border:'1px solid '+(connState.tally?'rgba(76,175,125,0.4)':'rgba(47,95,224,0.3)')}},
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:6}},
        React.createElement('div',{style:{fontWeight:600,fontSize:13,color:'var(--text)'}},'🔌 Tally Connector'),
        React.createElement('span',{className:'badge '+(connState.tally?'badge-green':connState.ok?'badge-amber':'badge-red'),style:{fontSize:10}},connState.checking?'Checking…':connState.tally?'Connected':connState.ok?'Tally not answering':'Not connected'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:'auto'},disabled:connState.checking,onClick:()=>checkConnector()},'⟳ Check'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setShowConnSettings(s=>!s)},showConnSettings?'Hide settings':'⚙ Settings')
      ),
      React.createElement('div',{style:{fontSize:12,color:connState.tally?'var(--green)':'var(--text2)',lineHeight:1.6,marginBottom:8}},connState.msg||'Checking for the SalonOS Tally Connector…'),
      connState.tally&&React.createElement('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:8}},
        React.createElement('span',{style:{fontSize:12,color:'var(--text2)'}},'Company in Tally:'),
        React.createElement('select',{className:'form-control',style:{width:'auto',minWidth:220},value:conn.company||'',onChange:e=>{updateConn({company:e.target.value});}},
          React.createElement('option',{value:''},'(the one currently selected in Tally)'),
          connState.companies.map(c=>React.createElement('option',{key:c,value:c},c))),
        React.createElement('label',{style:{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--text2)',cursor:'pointer'}},
          React.createElement('input',{type:'checkbox',checked:!!conn.autoCreate,onChange:e=>updateConn({autoCreate:e.target.checked})}),
          'Create new SalonOS ledgers in Tally automatically')),
      !connState.tally&&React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',lineHeight:1.7,background:'var(--bg3)',borderRadius:'var(--r)',padding:'10px 12px',marginBottom:8}},
        React.createElement('b',{style:{color:'var(--text2)'}},'Set up once (Windows): '),
        '1) In Tally: F1 Help → Settings → Connectivity → Client/Server configuration → TallyPrime acts as "Both", Enable ODBC "Yes", Port 9000 (Tally.ERP 9: F12 → Advanced Configuration). ',
        '2) Download both connector files below into one folder. ',
        '3) Double-click ',React.createElement('b',null,'Start-SalonOS-Tally-Connector.bat'),' and keep its window open. ',
        '4) Click ⟳ Check. ',
        React.createElement('br'),
        React.createElement('b',{style:{color:'var(--text2)'}},'Tally on a server or another PC: '),'edit the .bat file and add ',React.createElement('code',null,'-TallyHost <server IP>'),' (the server’s Tally port 9000 must be reachable on your network/VPN). ',
        React.createElement('b',{style:{color:'var(--text2)'}},'Tally on a cloud / remote desktop: '),'run the connector inside that desktop and open SalonOS there.',
        React.createElement('div',{style:{marginTop:8,display:'flex',gap:8,flexWrap:'wrap'}},
          React.createElement('a',{className:'btn btn-primary btn-sm',href:'tally-connector/Start-SalonOS-Tally-Connector.bat',download:'Start-SalonOS-Tally-Connector.bat'},'⬇ Start-SalonOS-Tally-Connector.bat'),
          React.createElement('a',{className:'btn btn-ghost btn-sm',href:'tally-connector/SalonOS-Tally-Connector.ps1',download:'SalonOS-Tally-Connector.ps1'},'⬇ SalonOS-Tally-Connector.ps1'))),
      showConnSettings&&React.createElement('div',{className:'form-row cols2',style:{marginBottom:0}},
        React.createElement('div',{className:'form-group'},React.createElement('label',null,'Connector address'),
          React.createElement('input',{className:'form-control',value:conn.url,placeholder:TALLY_CONNECTOR_DEFAULT,onChange:e=>updateConn({url:e.target.value.trim()})})),
        React.createElement('div',{className:'form-group'},React.createElement('label',null,'Connector token (only if started with -Token)'),
          React.createElement('input',{className:'form-control',type:'password',autoComplete:'off',value:conn.token,onChange:e=>updateConn({token:e.target.value})}))),
      connState.tally&&ledgerCache&&React.createElement('div',{style:{fontSize:12,color:'var(--text2)',marginTop:4,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
        '📒 '+ledgerCache.ledgers.length+' ledgers in Tally'+(ledgerCache.company?' ('+ledgerCache.company+')':'')+' · fetched '+new Date(ledgerCache.fetchedAt).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+' · ',
        (missingInTally&&missingInTally.length)
          ?React.createElement(React.Fragment,null,
              React.createElement('span',{style:{color:'var(--orange)'}},missingInTally.length+' SalonOS ledger(s) missing in Tally: '+missingInTally.slice(0,6).map(r=>r.name).join(', ')+(missingInTally.length>6?'…':'')),
              React.createElement('button',{className:'btn btn-primary btn-sm',disabled:!!pushBusy,onClick:()=>createMissingInTally(false)},pushBusy?'Creating…':'➕ Create them in Tally'))
          :React.createElement('span',{style:{color:'var(--green)'}},'✓ every SalonOS ledger exists in Tally'))
    ),

    // ── Ledger name mapping ──
    React.createElement('div',{className:'card',style:{marginBottom:16}},
      React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}},
        React.createElement('div',{style:{fontWeight:600,fontSize:13,color:'var(--text)'}},'Ledger Name Mapping'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',disabled:fetchingLedgers,onClick:()=>fetchLedgersFromTally(false)},fetchingLedgers?'Fetching…':'⟳ Fetch ledgers from Tally')
      ),
      React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:12}},'Tally matches purely by ledger name — whatever you enter here must be spelled exactly like the ledger in Tally. Leave a field blank to use the name as-is from '+(salon?salon.name.split('—')[0].trim():'this outlet')+'\'s records.'),
      tallyLedgerList&&tallyLedgerList.length>0&&React.createElement('div',{style:{fontSize:10.5,color:'var(--green)',marginBottom:12}},'✓ '+tallyLedgerList.length+' ledger name(s) fetched from Tally — typing below will now suggest matches from Tally\'s actual list.'),
      React.createElement('datalist',{id:'tally-ledger-names'},(tallyLedgerList||[]).map(n=>React.createElement('option',{key:n,value:n}))),
      React.createElement('div',{className:'form-group',style:{marginBottom:14}},
        React.createElement('label',null,'Bank Ledger Name in Tally *'),
        React.createElement('input',{className:'form-control',style:{maxWidth:320},list:'tally-ledger-names',placeholder:'e.g. HDFC Bank - Current A/c',value:map.bankLedger||'',onChange:e=>updateMap({...map,bankLedger:e.target.value})})
      ),
      vendors.length>0&&React.createElement('div',{style:{marginBottom:14}},
        React.createElement('div',{style:{fontSize:11,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:6}},'Vendors → Tally Ledger'+(unmappedVendors?' ('+unmappedVendors+' using default name)':'')),
        React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,maxHeight:220,overflowY:'auto'}},
          vendors.map(v=>React.createElement('div',{key:v.id,style:{display:'flex',alignItems:'center',gap:8}},
            React.createElement('div',{style:{fontSize:12,color:'var(--text2)',minWidth:130,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',display:'flex',alignItems:'center',gap:4},title:v.name},
              !synced.vendors[v.id]&&React.createElement('span',{className:'badge badge-amber',style:{fontSize:9,padding:'1px 5px'}},'🆕'),v.name),
            React.createElement('input',{className:'form-control',style:{fontSize:12,padding:'4px 8px'},list:'tally-ledger-names',placeholder:v.name,value:(map.vendors&&map.vendors[v.id])||'',onChange:e=>updateMap({...map,vendors:{...map.vendors,[v.id]:e.target.value}})})
          ))
        )
      ),
      categories.length>0&&React.createElement('div',null,
        React.createElement('div',{style:{fontSize:11,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:6}},'Categories → Tally Ledger'),
        React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}},
          categories.map(cat=>React.createElement('div',{key:cat,style:{display:'flex',alignItems:'center',gap:8}},
            React.createElement('div',{style:{fontSize:12,color:'var(--text2)',minWidth:130,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',display:'flex',alignItems:'center',gap:4},title:cat+' (suggested group: '+tallyGroupForCategory(cat)+')'},
              !synced.categories[cat]&&React.createElement('span',{className:'badge badge-amber',style:{fontSize:9,padding:'1px 5px'}},'🆕'),cat),
            React.createElement('input',{className:'form-control',style:{fontSize:12,padding:'4px 8px'},list:'tally-ledger-names',placeholder:cat,value:(map.categories&&map.categories[cat])||'',onChange:e=>updateMap({...map,categories:{...map.categories,[cat]:e.target.value}})})
          ))
        )
      )
    ),

    // ── Masters (Ledgers) Preview — exactly what buildTallyMastersXml would create, shown as a
    // plain table so there's nothing to guess about before downloading. ──
    (()=>{
      const previewRows=tallyMastersPreviewRows(vendors,categories,gstTypesUsed,map.bankLedger,vendorLedgerNameFor,categoryLedgerNameFor,gstInputBlocked);
      return React.createElement('div',{className:'card',style:{marginBottom:16,padding:0,overflow:'hidden'}},
        React.createElement('div',{style:{padding:'12px 14px',borderBottom:'1px solid var(--border)'}},
          React.createElement('div',{style:{fontWeight:600,fontSize:13,color:'var(--text)'}},'Masters (Ledgers) — Preview'),
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:2}},previewRows.length+' ledger(s) will be created when Masters is downloaded'+(gstInputBlocked?' — GST Input ledgers excluded since Input Credit is blocked for this outlet':'')+'.')
        ),
        previewRows.length===0
          ?React.createElement('div',{style:{padding:24,textAlign:'center',color:'var(--text3)',fontSize:12}},'Nothing to create yet — add a Vendor or book an invoice first.')
          :React.createElement('div',{style:{overflowX:'auto',maxHeight:280,overflowY:'auto'}},
              React.createElement('table',null,
                React.createElement('thead',null,React.createElement('tr',null,['Ledger Name','Parent Group','Type','Note'].map(h=>React.createElement('th',{key:h},h)))),
                React.createElement('tbody',null,previewRows.map((r,i)=>React.createElement('tr',{key:i},
                  React.createElement('td',{style:{fontWeight:500}},r.name),
                  React.createElement('td',null,r.parent),
                  React.createElement('td',null,React.createElement('span',{className:'badge '+(r.type==='Vendor'?'badge-blue':r.type==='GST'?'badge-purple':r.type==='Bank'?'badge-green':'badge-amber')},r.type)),
                  React.createElement('td',{style:{color:'var(--text3)',fontSize:11}},r.note||'—')
                )))
              )
            )
      );
    })(),

    // ── New Ledgers Since Last Export — lets a newly-added Vendor or a Category seen for the
    // first time get pushed to Tally right away, without re-exporting everything. ──
    hasNewLedgers&&React.createElement('div',{className:'attention-card',style:{marginBottom:16}},
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:6}},
        React.createElement('span',{className:'badge badge-amber',style:{fontSize:10}},'🆕 NEW'),
        React.createElement('span',{style:{fontWeight:600,fontSize:13}},'New Ledgers Since Last Export')
      ),
      React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},
        newVendors.length+' new vendor(s), '+newCategories.length+' new categor'+(newCategories.length===1?'y':'ies')+' — created here since the last time Masters were exported. Push just these instead of re-sending the full ledger list.'),
      React.createElement('button',{className:'btn btn-primary btn-sm',onClick:downloadNewLedgersOnly},'⬇ Download New Ledgers Only')
    ),

    // ── Date range for voucher exports ──
    React.createElement('div',{style:{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:16}},
      React.createElement('span',{style:{fontSize:11.5,color:'var(--text3)'}},'Date range (Vouchers only — leave blank for everything on file):'),
      React.createElement('input',{type:'date',className:'form-control',style:{width:'auto'},value:fromDate,onChange:e=>setFromDate(e.target.value)}),
      React.createElement('span',{style:{color:'var(--text3)'}},'to'),
      React.createElement('input',{type:'date',className:'form-control',style:{width:'auto'},value:toDate,onChange:e=>setToDate(e.target.value)}),
      (fromDate||toDate)&&React.createElement('span',{style:{color:'var(--accent2)',cursor:'pointer',fontSize:11.5,textDecoration:'underline'},onClick:()=>{setFromDate('');setToDate('');}},'clear')
    ),

    // ── Step cards ──
    React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14}},
      React.createElement('div',{className:'card'},
        React.createElement('div',{style:{fontWeight:600,fontSize:13,marginBottom:4}},'Step 1 · Masters (Ledgers)'),
        React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:12}},vendors.length+' vendor(s), '+categories.length+' categor'+(categories.length===1?'y':'ies')+', plus GST and Bank ledgers as needed. Import this before any vouchers.'),
        React.createElement('button',{className:'btn btn-primary btn-sm',style:{width:'100%'},onClick:downloadMasters},'⬇ Download Masters XML')
      ),
      React.createElement('div',{className:'card'},
        React.createElement('div',{style:{fontWeight:600,fontSize:13,marginBottom:4}},'Step 2 · Vendor Invoices'),
        React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:12}},filteredInvoices.length+' invoice(s) in range — becomes a Purchase Voucher each. '+(gstInputBlocked?'GST Input is blocked for this outlet, so the full invoice amount books to the category ledger directly — no separate GST split.':'GST is split out separately, with the category as the expense/asset ledger.')),
        React.createElement('div',{style:{display:'flex',gap:8}},
          React.createElement('button',{className:'btn btn-primary btn-sm',style:{flex:1},onClick:downloadPurchaseVouchers},'⬇ Download XML'),
          React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:downloadInvoiceCsv,title:'Plain CSV reference — for manual review or Excel-based import tools'},'⬇ CSV')
        )
      ),
      React.createElement('div',{className:'card'},
        React.createElement('div',{style:{fontWeight:600,fontSize:13,marginBottom:4}},'Step 3 · Bank Statement'),
        React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:12}},filteredBankRows.length+' transaction(s) in range — debits become Payment vouchers, credits become Receipt vouchers. Unmatched counterparties land in "'+('Suspense Account (Review in Tally)')+'" for you to reclassify.'),
        React.createElement('div',{style:{display:'flex',gap:8}},
          React.createElement('button',{className:'btn btn-primary btn-sm',style:{flex:1},onClick:downloadBankVouchers},'⬇ Download XML'),
          React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:downloadBankCsv,title:'Plain CSV reference — for manual review or Excel-based import tools'},'⬇ CSV')
        )
      )
    ),

    // ── Experimental direct push ──
    React.createElement('div',{className:'card',style:{marginTop:16,borderColor:connState.tally?'rgba(76,175,125,0.4)':'rgba(255,159,67,0.4)'}},
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:4}},
        React.createElement('span',{className:'badge '+(connState.tally?'badge-green':'badge-amber'),style:{fontSize:10}},connState.tally?'LIVE':'CONNECTOR OFF'),
        React.createElement('span',{style:{fontWeight:600,fontSize:13}},'Send straight to Tally')
      ),
      React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:12,lineHeight:1.6}},
        connState.tally
          ?'Sends through the SalonOS Tally Connector to '+(conn.company||'the company open in Tally')+' and shows Tally’s own reply (created / updated / rejected). Send Masters first, then vouchers. Vouchers use the date range above.'
          :'Start the SalonOS Tally Connector (see above) for confirmed results. Without it, SalonOS can only send blindly to Tally on this computer (localhost:9000) and can’t read whether it landed.'
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('button',{className:'btn btn-ghost btn-sm',disabled:!!pushBusy,onClick:()=>tryDirectPush(buildTallyMastersXml(vendors,categories,gstTypesUsed,map.bankLedger,vendorLedgerNameFor,categoryLedgerNameFor,gstInputBlocked),'Masters')},pushBusy==='Masters'?'Sending…':'Push Masters'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',disabled:!!pushBusy,onClick:()=>tryDirectPush(buildTallyPurchaseVouchersXml(filteredInvoices,vendorLedgerNameFor,categoryLedgerNameFor,gstInputBlocked),'Vendor Invoices')},pushBusy==='Vendor Invoices'?'Sending…':'Push Vendor Invoices'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',disabled:!!pushBusy,onClick:()=>tryDirectPush(buildTallyBankVouchersXml(filteredBankRows,map.bankLedger,vendors),'Bank Statement')},pushBusy==='Bank Statement'?'Sending…':'Push Bank Statement')
      )
    ),

    onNavTab&&React.createElement('div',{style:{marginTop:16,fontSize:11.5,color:'var(--text3)'}},
      'Need to fix something before exporting? ',
      React.createElement('span',{style:{color:'var(--blue)',cursor:'pointer',textDecoration:'underline'},onClick:()=>onNavTab('vendors')},'Go to Vendors'),
      ' · ',
      React.createElement('span',{style:{color:'var(--blue)',cursor:'pointer',textDecoration:'underline'},onClick:()=>onNavTab('bank-statement')},'Go to Bank Statement')
    )
  );
}

// ── Reports — a register of every person a Cash Handover was made to, or a Cash Received was
// taken from, on the Daily Sales & Collection sheet. Reads salesEntryData straight from storage
// (same key the Daily Sales & Exp. sheet writes to) rather than needing that sheet mounted, so it
// stays correct however the person navigates here. Entries are told apart by shape, not by row
// index, so this keeps working even if Daily Sales & Collection's row order ever changes:
// a 'toName' field means Cash Handover, a 'fromName' field means Cash Received. ──
function CashPersonsRegister({salon}={}){
  const salonId=salon?.id;
  const [tick,setTick]=useState(0);
  const entryData=useMemo(()=>{
    try{
      const raw=cachedLocalGet(outletKey('salonos_daily_sales_collection_entrydata',salonId));
      return raw?JSON.parse(raw):{};
    }catch(e){return{};}
  },[salonId,tick]);
  const rows=useMemo(()=>{
    const out=[];
    Object.keys(entryData).forEach(iso=>{
      const dayObj=entryData[iso]||{};
      Object.keys(dayObj).forEach(sriKey=>{
        (dayObj[sriKey]||[]).forEach(e=>{
          if(!e)return;
          if(e.toName!==undefined)out.push({iso,type:'Handover',person:String(e.toName||'').trim()||'(unnamed)',amount:Number(e.amount)||0});
          else if(e.fromName!==undefined)out.push({iso,type:'Received',person:String(e.fromName||'').trim()||'(unnamed)',amount:Number(e.amount)||0});
        });
      });
    });
    out.sort((a,b)=>a.iso<b.iso?1:a.iso>b.iso?-1:0);
    return out;
  },[entryData]);
  const [filterType,setFilterType]=useState('all');
  const [search,setSearch]=useState('');
  const matchesFilter=(person,type)=>(filterType==='all'||type===filterType)&&(!search||person.toLowerCase().includes(search.toLowerCase()));
  const filteredRows=rows.filter(r=>matchesFilter(r.person,r.type));
  const personSummary=useMemo(()=>{
    const map={};
    rows.forEach(r=>{
      const key=r.person+'||'+r.type;
      if(!map[key])map[key]={person:r.person,type:r.type,count:0,total:0,lastDate:r.iso};
      map[key].count+=1;
      map[key].total+=r.amount;
      if(r.iso>map[key].lastDate)map[key].lastDate=r.iso;
    });
    return Object.values(map).sort((a,b)=>b.total-a.total);
  },[rows]);
  const filteredSummary=personSummary.filter(p=>matchesFilter(p.person,p.type));
  const totalHandover=rows.filter(r=>r.type==='Handover').reduce((s,r)=>s+r.amount,0);
  const totalReceived=rows.filter(r=>r.type==='Received').reduce((s,r)=>s+r.amount,0);
  const crTitle='Cash Register — '+(salon?salon.name.split('—')[0].trim():'Outlet');
  const crSheetRows=()=>{
    const hdr=['Date','Type','Person','Amount'];
    const dataRows=filteredRows.map(r=>[r.iso,r.type==='Handover'?'Handed Over To':'Received From',r.person,r.amount]);
    return[hdr,...dataRows,['Total Handover','','',totalHandover],['Total Received','','',totalReceived]];
  };
  // Handover rows tinted red (money leaving), Received rows tinted green (money coming in) —
  // same palette the on-screen badges already use for these two types.
  const crBodyHtml=()=>'<table><thead><tr><th>Date</th><th>Type</th><th>Person</th><th class="num">Amount</th></tr></thead><tbody>'
    +filteredRows.map(r=>'<tr><td>'+fmtDMY(r.iso)+'</td><td style="background:'+(r.type==='Handover'?'#fdecea':'#e8f6ee')+';color:'+(r.type==='Handover'?'#b3261e':'#1b7a43')+'">'+(r.type==='Handover'?'Handed Over To':'Received From')+'</td><td>'+r.person+'</td><td class="num">₹'+Math.round(r.amount).toLocaleString('en-IN')+'</td></tr>').join('')
    +'<tr><td colspan="3"><b>Total Handover</b></td><td class="num" style="background:#fdecea"><b>₹'+Math.round(totalHandover).toLocaleString('en-IN')+'</b></td></tr>'
    +'<tr><td colspan="3"><b>Total Received</b></td><td class="num" style="background:#e8f6ee"><b>₹'+Math.round(totalReceived).toLocaleString('en-IN')+'</b></td></tr>'
    +'</tbody></table>';
  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Cash Register'),
        React.createElement('div',{className:'page-sub'},'Register of persons to whom Cash Handover was made, or from whom Cash Received was taken — sourced from Daily Sales & Collection entries.')
      ),
      React.createElement('div',{style:{display:'flex',gap:8}},
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setTick(t=>t+1)},'⟳ Refresh'),
        React.createElement(ShareReportButton,{title:crTitle,subtitle:'Cash Register',getBodyHtml:crBodyHtml,getSheetRows:crSheetRows})
      )
    ),
    React.createElement('div',{style:{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap'}},
      React.createElement('div',{className:'card',style:{flex:'1 1 220px',padding:14}},
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},'Total Cash Handed Over'),
        React.createElement('div',{style:{fontSize:20,fontWeight:700,color:'var(--red)'}},'₹'+totalHandover.toLocaleString())
      ),
      React.createElement('div',{className:'card',style:{flex:'1 1 220px',padding:14}},
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},'Total Cash Received'),
        React.createElement('div',{style:{fontSize:20,fontWeight:700,color:'var(--green)'}},'₹'+totalReceived.toLocaleString())
      )
    ),
    React.createElement('div',{style:{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}},
      React.createElement('select',{className:'form-control',style:{width:'auto'},value:filterType,onChange:e=>setFilterType(e.target.value)},
        [['all','All Types'],['Handover','Cash Handover'],['Received','Cash Received']].map(([v,l])=>React.createElement('option',{key:v,value:v},l))),
      React.createElement('input',{className:'form-control',style:{maxWidth:260},placeholder:'Search by person name…',value:search,onChange:e=>setSearch(e.target.value)})
    ),
    React.createElement('div',{className:'card',style:{padding:0,overflow:'hidden',marginBottom:20}},
      React.createElement('div',{style:{padding:'10px 14px',fontSize:11,fontWeight:700,color:'var(--accent2)',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid var(--border)'}},'Person-wise Summary'),
      filteredSummary.length===0
        ?React.createElement('div',{style:{textAlign:'center',padding:32,color:'var(--text3)'}},rows.length===0?'No Cash Handover or Cash Received entries recorded yet — they\'ll show up here as soon as one is added on Daily Sales & Exp.':'Nothing matches this filter.')
        :React.createElement('div',{style:{overflowX:'auto'}},
          React.createElement('table',null,
            React.createElement('thead',null,React.createElement('tr',null,['Person','Type','Transactions','Total Amount','Date'].map(h=>React.createElement('th',{key:h},h)))),
            React.createElement('tbody',null,filteredSummary.map((p,i)=>React.createElement('tr',{key:i},
              React.createElement('td',{style:{fontWeight:600}},p.person),
              React.createElement('td',null,React.createElement('span',{className:'badge '+(p.type==='Handover'?'badge-red':'badge-green')},p.type==='Handover'?'Handed Over To':'Received From')),
              React.createElement('td',{style:{textAlign:'center'}},p.count),
              React.createElement('td',{style:{textAlign:'right',fontWeight:600}},'₹'+p.total.toLocaleString()),
              React.createElement('td',{style:{fontSize:11.5,color:'var(--text3)'}},fmtDMY(p.lastDate))
            )))
          )
        )
    ),
    React.createElement('div',{className:'card',style:{padding:0,overflow:'hidden'}},
      React.createElement('div',{style:{padding:'10px 14px',fontSize:11,fontWeight:700,color:'var(--accent2)',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid var(--border)'}},'Transaction Log'),
      filteredRows.length===0
        ?React.createElement('div',{style:{textAlign:'center',padding:32,color:'var(--text3)'}},rows.length===0?'No entries yet.':'Nothing matches this filter.')
        :React.createElement('div',{style:{overflowX:'auto',maxHeight:420,overflowY:'auto'}},
          React.createElement('table',null,
            React.createElement('thead',null,React.createElement('tr',null,['Date','Type','Person','Amount'].map(h=>React.createElement('th',{key:h},h)))),
            React.createElement('tbody',null,filteredRows.map((r,i)=>React.createElement('tr',{key:i},
              React.createElement('td',{style:{whiteSpace:'nowrap',fontSize:11.5,color:'var(--text3)'}},fmtDMY(r.iso)),
              React.createElement('td',null,React.createElement('span',{className:'badge '+(r.type==='Handover'?'badge-red':'badge-green')},r.type==='Handover'?'Handed Over To':'Received From')),
              React.createElement('td',null,r.person),
              React.createElement('td',{style:{textAlign:'right',fontWeight:600,color:r.type==='Handover'?'var(--red)':'var(--green)'}},'₹'+r.amount.toLocaleString())
            )))
          )
        )
    )
  );
}

// ── Expense Register — a per-expense-category register built the same way as the person
// register above: read straight from Daily Sales & Exp's own storage (three different shapes
// depending on the row — a plain number for most rows, a list of {empName,amount} for the
// employee-linked rows, a list of {description,amount} for the description-required rows) rather
// than needing that sheet mounted. Picking one expense from the dropdown gives exactly "the
// register for that expense" — every dated entry behind it, in one place — while 'All Expenses'
// gives the category-wise overview across the whole outlet. ──
// Kept as its own copy of the row-type sets (not shared with DailySalesSheet's own EMP_ROWS/
// DESC_ROWS, which are local to that component) — small, stable lists, easiest to keep in sync by
// eye if a row is ever recategorized than to thread state out of a components hundreds of lines away.
const EXPENSE_REG_EMP_ROWS=new Set([
  'Membership Commission/Incentives','Product Commission/Incentives','Service Commission/Incentives',
  'Target Commission/Incentives','Advance To Employees','Previous Month Salary','Previous Month Incentive',
  'Tip To Employee','Penalties','Staff Over Time',
]);
const EXPENSE_REG_DESC_ROWS=new Set([
  'Pentry Expenses','Water Expenses','Conveyance Expenses','Stationary','Pooja Expenses',
  'Festival/Event Celebration Expenses','Donation','Staff Refreshment','Diesel Expenses',
  'Repair & Maintenance','Electric Work','Accessories','Tanker Cleaning','Miscellaneous Expenses',
  'Cleaning Supplies','Marketing Expenses','Cosmetics & Stock Local','Store Items','Client Food',
  'Bank Charges','Unregistered Purchase',
]);
function ExpenseRegisterSheet({salon}={}){
  const salonId=salon?.id;
  const [tick,setTick]=useState(0);
  const plainData=useMemo(()=>{
    try{const raw=cachedLocalGet(outletKey('salonos_daily_sales_data',salonId));return raw?JSON.parse(raw):{};}catch(e){return{};}
  },[salonId,tick]);
  const empData=useMemo(()=>{
    try{const raw=cachedLocalGet(outletKey('salonos_daily_sales_empdata',salonId));return raw?JSON.parse(raw):{};}catch(e){return{};}
  },[salonId,tick]);
  const descData=useMemo(()=>{
    try{const raw=cachedLocalGet(outletKey('salonos_daily_sales_descdata',salonId));return raw?JSON.parse(raw):{};}catch(e){return{};}
  },[salonId,tick]);
  // The invoice-gated rows (Rent, DG Rent, Telephone & Internet Expenses, etc.) don't carry their
  // own description — they're plain amounts on Daily Sales & Exp — but each payment there is
  // auto-recorded against a real Vendor Sheet invoice, which DOES have vendor name + a description.
  // Pull that in here too, keyed by category+date, so those rows get a real description instead of
  // always showing '—'.
  const vendorInvoices=useMemo(()=>{
    try{const raw=cachedLocalGet(outletKey('salonos_vendor_invoices',salonId));const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed:[];}catch(e){return[];}
  },[salonId,tick]);
  const vendorNameById=useMemo(()=>{
    const m={};loadVendors(salonId).forEach(v=>{m[v.id]=v.name;});return m;
  },[salonId,tick]);
  const invoiceDetailLookup=useMemo(()=>{
    const map={};
    vendorInvoices.forEach(inv=>{
      (inv.payments||[]).forEach(p=>{
        if(!p||!p.paidDate)return;
        const key=(inv.category||'')+'|'+p.paidDate;
        if(!map[key])map[key]=[];
        map[key].push({desc:(inv.desc||'').trim(),vendorName:vendorNameById[inv.vendorId]||'',invoiceNo:inv.invoiceNo||''});
      });
    });
    return map;
  },[vendorInvoices,vendorNameById]);
  // One row per real transaction, across every expense category, whichever storage it lives in.
  const rows=useMemo(()=>{
    const out=[];
    EXPENSE_ROWS.forEach((row,ri)=>{
      const{name,group}=row;
      if(EXPENSE_REG_EMP_ROWS.has(name)){
        Object.keys(empData).forEach(iso=>{
          (empData[iso]&&empData[iso][ri]||[]).forEach(e=>{
            const amount=Number(e&&e.amount)||0;
            if(amount<=0)return;
            out.push({iso,name,group,detail:(e.empName||'').trim()||'(unnamed)',mode:e.mode||'',amount});
          });
        });
      }else if(EXPENSE_REG_DESC_ROWS.has(name)){
        Object.keys(descData).forEach(iso=>{
          (descData[iso]&&descData[iso][ri]||[]).forEach(e=>{
            const amount=Number(e&&e.amount)||0;
            if(amount<=0)return;
            out.push({iso,name,group,detail:(e.description||'').trim()||'—',mode:'',amount});
          });
        });
      }else{
        Object.keys(plainData).forEach(iso=>{
          const amount=Number(plainData[iso]&&plainData[iso][ri])||0;
          if(amount<=0)return;
          const invMatches=invoiceDetailLookup[name+'|'+iso]||[];
          const detail=invMatches.length
            ?invMatches.map(m=>(m.vendorName||'Vendor')+(m.desc?' — '+m.desc:'')+(m.invoiceNo?' (Inv# '+m.invoiceNo+')':'')).join('; ')
            :'—';
          out.push({iso,name,group,detail,mode:'',amount});
        });
      }
    });
    out.sort((a,b)=>a.iso<b.iso?1:a.iso>b.iso?-1:0);
    return out;
  },[plainData,empData,descData,invoiceDetailLookup]);
  const [filterExpense,setFilterExpense]=useState('all');
  const [search,setSearch]=useState('');
  const matchesFilter=(name,group,detail)=>(filterExpense==='all'||name===filterExpense)&&(!search||((name+' '+group+' '+detail).toLowerCase().includes(search.toLowerCase())));
  const filteredRows=rows.filter(r=>matchesFilter(r.name,r.group,r.detail));
  const categorySummary=useMemo(()=>{
    const map={};
    rows.forEach(r=>{
      if(!map[r.name])map[r.name]={name:r.name,group:r.group,count:0,total:0,lastDate:r.iso};
      map[r.name].count+=1;
      map[r.name].total+=r.amount;
      if(r.iso>map[r.name].lastDate)map[r.name].lastDate=r.iso;
    });
    return Object.values(map).sort((a,b)=>b.total-a.total);
  },[rows]);
  const filteredSummary=categorySummary.filter(c=>matchesFilter(c.name,c.group,''));
  const grandTotal=rows.reduce((s,r)=>s+r.amount,0);
  const erTitle='Expense Register'+(filterExpense!=='all'?' — '+filterExpense:'')+' — '+(salon?salon.name.split('—')[0].trim():'Outlet');
  const erSheetRows=()=>{
    const hdr=['Date','Expense','Group','Description / Person','Amount'];
    const dataRows=filteredRows.map(r=>[r.iso,r.name,r.group,r.detail+(r.mode?' · '+r.mode:''),r.amount]);
    const total=filteredRows.reduce((s,r)=>s+r.amount,0);
    return[hdr,...dataRows,['Grand Total','','','',total]];
  };
  const erBodyHtml=()=>{
    const total=filteredRows.reduce((s,r)=>s+r.amount,0);
    return'<table><thead><tr><th>Date</th><th>Expense</th><th>Group</th><th>Description / Person</th><th class="num">Amount</th></tr></thead><tbody>'
      +filteredRows.map(r=>'<tr><td>'+fmtDMY(r.iso)+'</td><td>'+r.name+'</td><td style="background:#eef2f7">'+r.group+'</td><td>'+r.detail+(r.mode?' · '+r.mode:'')+'</td><td class="num">₹'+Math.round(r.amount).toLocaleString('en-IN')+'</td></tr>').join('')
      +'<tr><td colspan="4"><b>Grand Total</b></td><td class="num" style="background:#fdecea"><b>₹'+Math.round(total).toLocaleString('en-IN')+'</b></td></tr>'
      +'</tbody></table>';
  };
  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Expense Register'),
        React.createElement('div',{className:'page-sub'},'Every entry behind each Daily Sales & Exp. expense row — pick one expense for just its own register, or leave it on All Expenses for the full picture.')
      ),
      React.createElement('div',{style:{display:'flex',gap:8}},
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setTick(t=>t+1)},'⟳ Refresh'),
        React.createElement(ShareReportButton,{title:erTitle,subtitle:'Expense Register',getBodyHtml:erBodyHtml,getSheetRows:erSheetRows})
      )
    ),
    React.createElement('div',{style:{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap'}},
      React.createElement('div',{className:'card',style:{flex:'1 1 220px',padding:14}},
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},filterExpense==='all'?'Total — All Expenses':'Total — '+filterExpense),
        React.createElement('div',{style:{fontSize:20,fontWeight:700,color:'var(--red)'}},'₹'+(filterExpense==='all'?grandTotal:filteredRows.reduce((s,r)=>s+r.amount,0)).toLocaleString())
      ),
      React.createElement('div',{className:'card',style:{flex:'1 1 220px',padding:14}},
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},'Transactions Shown'),
        React.createElement('div',{style:{fontSize:20,fontWeight:700,color:'var(--accent2)'}},filteredRows.length)
      )
    ),
    React.createElement('div',{style:{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}},
      React.createElement('select',{className:'form-control',style:{width:'auto',minWidth:220},value:filterExpense,onChange:e=>setFilterExpense(e.target.value)},
        React.createElement('option',{value:'all'},'All Expenses'),
        EXPENSE_ROWS.map(r=>React.createElement('option',{key:r.name,value:r.name},r.name+' ('+r.group+')'))
      ),
      React.createElement('input',{className:'form-control',style:{maxWidth:260},placeholder:'Search description / person…',value:search,onChange:e=>setSearch(e.target.value)})
    ),
    React.createElement('div',{className:'card',style:{padding:0,overflow:'hidden',marginBottom:20}},
      React.createElement('div',{style:{padding:'10px 14px',fontSize:11,fontWeight:700,color:'var(--accent2)',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid var(--border)'}},'Category-wise Summary'),
      filteredSummary.length===0
        ?React.createElement('div',{style:{textAlign:'center',padding:32,color:'var(--text3)'}},rows.length===0?'No expense entries recorded yet — they\'ll show up here as soon as one is added on Daily Sales & Exp.':'Nothing matches this filter.')
        :React.createElement('div',{style:{overflowX:'auto'}},
          React.createElement('table',null,
            React.createElement('thead',null,React.createElement('tr',null,['Expense','Group','Transactions','Total Amount','Date'].map(h=>React.createElement('th',{key:h},h)))),
            React.createElement('tbody',null,filteredSummary.map((c,i)=>React.createElement('tr',{key:i},
              React.createElement('td',{style:{fontWeight:600,cursor:'pointer',color:filterExpense===c.name?'var(--accent)':'var(--text)'},onClick:()=>setFilterExpense(c.name),title:'Show only '+c.name},c.name),
              React.createElement('td',{style:{fontSize:11.5,color:'var(--text3)'}},c.group),
              React.createElement('td',{style:{textAlign:'center'}},c.count),
              React.createElement('td',{style:{textAlign:'right',fontWeight:600,color:'var(--red)'}},'₹'+c.total.toLocaleString()),
              React.createElement('td',{style:{fontSize:11.5,color:'var(--text3)'}},fmtDMY(c.lastDate))
            )))
          )
        )
    ),
    React.createElement('div',{className:'card',style:{padding:0,overflow:'hidden'}},
      React.createElement('div',{style:{padding:'10px 14px',fontSize:11,fontWeight:700,color:'var(--accent2)',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid var(--border)'}},'Transaction Log'),
      filteredRows.length===0
        ?React.createElement('div',{style:{textAlign:'center',padding:32,color:'var(--text3)'}},rows.length===0?'No entries yet.':'Nothing matches this filter.')
        :React.createElement('div',{style:{overflowX:'auto',maxHeight:420,overflowY:'auto'}},
          React.createElement('table',null,
            React.createElement('thead',null,React.createElement('tr',null,['Date','Expense','Group','Description / Person','Amount'].map(h=>React.createElement('th',{key:h},h)))),
            React.createElement('tbody',null,filteredRows.map((r,i)=>React.createElement('tr',{key:i},
              React.createElement('td',{style:{whiteSpace:'nowrap',fontSize:11.5,color:'var(--text3)'}},fmtDMY(r.iso)),
              React.createElement('td',{style:{fontWeight:500}},r.name),
              React.createElement('td',{style:{fontSize:11.5,color:'var(--text3)'}},r.group),
              React.createElement('td',null,r.detail+(r.mode?' · '+r.mode:'')),
              React.createElement('td',{style:{textAlign:'right',fontWeight:600,color:'var(--red)'}},'₹'+r.amount.toLocaleString())
            )))
          )
        )
    )
  );
}

const REPORT_FYS=['2023-24','2024-25','2025-26','2026-27'];
// A calendar month has "come" once it's the current month or earlier — used across the Reports
// tab's statutory summaries so a Recurring Expense's smoothed monthly TDS (or PF/ESIC/PT, which
// are driven by the employee master, not month-specific entries) doesn't show as already
// deducted for months that haven't happened yet.
function isMonthUpToNow(year,month){
  const now=new Date();
  return year<now.getFullYear()||(year===now.getFullYear()&&month<=now.getMonth());
}
// Monthly ↔ Annual switcher — reused by TDS Summary and the PF/ESIC/PT summaries below. Monthly
// shows one financial year's 12 months (with a Total row); Annual shows every financial year
// side by side, one row per year, so a multi-year trend is visible without switching FY back
// and forth.
function ReportViewToggle({mode,onChange}){
  return React.createElement('div',{style:{display:'flex',gap:6}},
    [['monthly','Monthly'],['annual','Annual']].map(([m,lbl])=>
      React.createElement('button',{key:m,type:'button',className:'btn btn-sm '+(mode===m?'btn-primary':'btn-ghost'),onClick:()=>onChange(m)},lbl))
  );
}
// TDS for one calendar month — Recurring Expenses' TDS (smoothed by frequency, same as the P&L
// treats the expense amount itself) bucketed by section, plus Salary Working's own Section 192
// entries summed across every employee.
function tdsCellsForMonth(salonId,year,month,recurring,sectionCodes,salaryCol){
  const cells={};
  sectionCodes.forEach(code=>{cells[code]=0;});
  if(!isMonthUpToNow(year,month)){cells[salaryCol]=0;return cells;} // hasn't happened yet — nothing deducted
  recurring.forEach(it=>{
    const divisor=RECURRING_FREQ_DIVISOR[it.frequency]||1;
    cells[it.tdsSection]=(cells[it.tdsSection]||0)+tdsAmountOf(it)/divisor;
  });
  cells[salaryCol]=statutoryDeductionsFor(salonId,year,month).reduce((s,e)=>s+e.tdsAmt,0);
  return cells;
}
// Party-wise detail behind one month's TDS figure — every Active/TDS-Applicable recurring
// expense's own Payee, plus every employee with a Section 192 entry that month. Each row carries
// a stable `key` (recurring expense id / employee id) so a specific contributor's "remitted"
// status can be tracked reliably even if two rows share the same name or amount.
function tdsPartyDetailForMonth(salonId,year,month,recurring){
  if(!isMonthUpToNow(year,month))return[];
  const fromRecurring=recurring.map(it=>{
    const divisor=RECURRING_FREQ_DIVISOR[it.frequency]||1;
    return{key:'rec_'+it.id,party:it.payee||'(no payee set)',source:(it.expenseName==='Other'&&it.customName?it.customName:it.expenseName),section:it.tdsSection,amt:tdsAmountOf(it)/divisor};
  }).filter(r=>r.amt>0);
  const fromSalary=statutoryDeductionsFor(salonId,year,month).filter(e=>e.tdsAmt>0)
    .map(e=>({key:'emp_'+e.id,party:e.name,source:'Salary',section:'Sec. 192',amt:e.tdsAmt}));
  return[...fromRecurring,...fromSalary];
}
// ── TDS Summary — Monthly (one FY, 12 rows) or Annual (every FY, one row each) × section-wise.
// Two sources feed it: every Active recurring expense with TDS Applicable (bucketed by its own
// tdsSection), and Salary Working's own per-employee TDS entries under Section 192 — always its
// own column since salary TDS isn't rule-based here. Months that haven't happened yet show
// nothing — click any month that HAS happened for the full section-wise + party-wise detail
// behind that figure. ──
function TdsSummaryReport({salon}={}){
  const salonId=salon?.id;
  const [mode,setMode]=useState('monthly');
  const [fy,setFy]=useState(()=>calToFYMI(new Date().getFullYear(),new Date().getMonth()).fy);
  const [drill,setDrill]=useState(null); // {label,year,calMonth}
  const recurring=loadRecurringExpenses(salonId).filter(it=>it.status==='Active'&&it.tdsApplicable&&it.tdsSection);
  const sectionCodes=Array.from(new Set(recurring.map(it=>it.tdsSection))).sort();
  const SALARY_COL='Sec. 192';
  const columns=[...sectionCodes,SALARY_COL];
  const monthlyRows=Array.from({length:12},(_,mi)=>{
    const year=mi<9?Number(fy.slice(0,4)):Number('20'+fy.slice(5));
    const calMonth=(mi+3)%12; // mi 0=Apr..11=Mar -> calendar month index (Jan=0)
    const cells=tdsCellsForMonth(salonId,year,calMonth,recurring,sectionCodes,SALARY_COL);
    return{key:PL_MONTHS[mi]+' '+year,label:PL_MONTHS[mi]+' '+year,year,calMonth,came:isMonthUpToNow(year,calMonth),cells,total:Object.values(cells).reduce((s,v)=>s+v,0)};
  });
  const annualRows=REPORT_FYS.map(f=>{
    const cells={};columns.forEach(c=>{cells[c]=0;});
    for(let mi=0;mi<12;mi++){
      const year=mi<9?Number(f.slice(0,4)):Number('20'+f.slice(5));
      const calMonth=(mi+3)%12;
      const m=tdsCellsForMonth(salonId,year,calMonth,recurring,sectionCodes,SALARY_COL);
      columns.forEach(c=>{cells[c]+=m[c]||0;});
    }
    return{key:f,label:'FY '+f,cells,total:Object.values(cells).reduce((s,v)=>s+v,0)};
  });
  const rows=mode==='monthly'?monthlyRows:annualRows;
  const colTotals={};columns.forEach(c=>{colTotals[c]=rows.reduce((s,r)=>s+(r.cells[c]||0),0);});
  const grandTotal=rows.reduce((s,r)=>s+r.total,0);
  const money=(n)=>n?'₹'+Math.round(n).toLocaleString('en-IN'):'—';
  const th=(txt,title)=>React.createElement('th',{title,style:{padding:'8px 10px',background:'#12121a',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',whiteSpace:'nowrap',borderBottom:'2px solid var(--accent)',textAlign:'right'}},txt);
  const td=(val,bold,color)=>React.createElement('td',{style:{padding:'7px 10px',fontSize:11.5,textAlign:'right',color:color||(bold?'var(--text)':'var(--text2)'),fontWeight:bold?700:400,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}},val);
  const drillDetail=drill?tdsPartyDetailForMonth(salonId,drill.year,drill.calMonth,recurring):[];
  const drillBySection={};
  drillDetail.forEach(d=>{drillBySection[d.section]=(drillBySection[d.section]||0)+d.amt;});
  const drillTotal=drillDetail.reduce((s,d)=>s+d.amt,0);
  const exportTitle='TDS Summary — '+(mode==='monthly'?fy:'All Years')+' — '+(salon?salon.name.split('—')[0].trim():'Outlet');
  const exportSheetRows=()=>{
    const hdr=[mode==='monthly'?'Month':'Financial Year',...columns.map(c=>c===SALARY_COL?'Sec. 192 (Salary)':c),'Total'];
    const dataRows=rows.map(r=>[r.label,...columns.map(c=>r.cells[c]||0),r.total]);
    const totalRow=[mode==='monthly'?'Total ('+fy+')':'Total (all years)',...columns.map(c=>colTotals[c]),grandTotal];
    return[hdr,...dataRows,totalRow];
  };
  // Recurring Expense sections tinted gold (matches the on-screen accent), Section 192 (Salary)
  // tinted blue, Total column bold.
  const exportBodyHtml=()=>{
    const colHeaders=columns.map(c=>c===SALARY_COL?'Sec. 192 (Salary)':c);
    return'<table><thead><tr><th>'+(mode==='monthly'?'Month':'Financial Year')+'</th>'+colHeaders.map(h=>'<th class="num">'+h+'</th>').join('')+'<th class="num">Total</th></tr></thead><tbody>'
      +rows.map(r=>'<tr><td>'+r.label+'</td>'+columns.map(c=>'<td class="num" style="background:'+(c===SALARY_COL?'#eff6ff':'#fdf6e8')+'">₹'+Math.round(r.cells[c]||0).toLocaleString('en-IN')+'</td>').join('')+'<td class="num"><b>₹'+Math.round(r.total).toLocaleString('en-IN')+'</b></td></tr>').join('')
      +'<tr><td><b>'+(mode==='monthly'?'Total ('+fy+')':'Total (all years)')+'</b></td>'+columns.map(c=>'<td class="num"><b>₹'+Math.round(colTotals[c]).toLocaleString('en-IN')+'</b></td>').join('')+'<td class="num"><b>₹'+Math.round(grandTotal).toLocaleString('en-IN')+'</b></td></tr>'
      +'</tbody></table>';
  };
  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{style:{display:'flex',gap:14,alignItems:'center',marginBottom:14,flexWrap:'wrap'}},
      React.createElement(ReportViewToggle,{mode,onChange:setMode}),
      mode==='monthly'&&React.createElement('div',{style:{display:'flex',gap:10,alignItems:'center'}},
        React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},'Financial Year'),
        React.createElement('select',{className:'form-control',style:{width:'auto',fontSize:12,padding:'6px 10px'},value:fy,onChange:e=>setFy(e.target.value)},
          REPORT_FYS.map(f=>React.createElement('option',{key:f},f)))),
      React.createElement('div',{style:{marginLeft:'auto'}},React.createElement(ShareReportButton,{title:exportTitle,subtitle:'TDS Summary',getBodyHtml:exportBodyHtml,getSheetRows:exportSheetRows,landscape:true}))
    ),
    sectionCodes.length===0&&React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14}},
      'No Recurring Expenses currently have TDS Applicable switched on — this report will still show Salary TDS (Section 192) below as entries are made on Salary Working.'),
    React.createElement('div',{className:'card'},
      React.createElement('div',{className:'table-wrap'},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,
            [React.createElement('th',{key:'m',style:{padding:'8px 10px',background:'#12121a',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',borderBottom:'2px solid var(--accent)',textAlign:'left'}},mode==='monthly'?'Month':'Financial Year'),
             ...columns.map(c=>th(c,c===SALARY_COL?'Salary TDS — Section 192':tdsSectionFullLabel(c))),
             th('Total')]
          )),
          React.createElement('tbody',null,
            rows.map(r=>{
              const clickable=mode==='monthly'&&r.came&&r.total>0;
              return React.createElement('tr',{key:r.key,style:clickable?{cursor:'pointer'}:null,onClick:clickable?()=>setDrill(r):null,className:clickable?'row-hover':''},
                React.createElement('td',{style:{padding:'7px 10px',fontSize:11.5,color:clickable?'var(--blue)':'var(--text)',fontWeight:600,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',textDecoration:clickable?'underline':'none'}},r.label+(mode==='monthly'&&!r.came?' (upcoming)':'')),
                ...columns.map(c=>td(money(r.cells[c]))),
                td(money(r.total),true,'var(--accent)')
              );
            }),
            React.createElement('tr',{style:{background:'rgba(47,95,224,0.08)'}},
              React.createElement('td',{style:{padding:'8px 10px',fontSize:11.5,fontWeight:700,color:'var(--text)',borderTop:'2px solid var(--border)'}},mode==='monthly'?'Total ('+fy+')':'Total (all years)'),
              ...columns.map(c=>React.createElement('td',{style:{padding:'8px 10px',fontSize:11.5,textAlign:'right',fontWeight:700,color:'var(--text)',borderTop:'2px solid var(--border)'}},money(colTotals[c]))),
              React.createElement('td',{style:{padding:'8px 10px',fontSize:12,textAlign:'right',fontWeight:700,color:'var(--accent)',borderTop:'2px solid var(--border)'}},money(grandTotal))
            )
          )
        )
      )
    ),
    React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:10,lineHeight:1.5}},'Only months that have already started show a figure — a Recurring Expense\'s TDS (smoothed evenly by frequency, e.g. a Quarterly amount split ÷3, same way its own expense amount is treated on P&L) never appears for a month that hasn\'t come yet. Section/payment-code columns reflect whatever\'s actually saved on each recurring expense (old Income-tax Act, 1961 or new Income-tax Act, 2025, depending on when it was set) — hover a column header for its full description. Click any month for the full section-wise and party-wise breakdown.'),
    drill&&React.createElement('div',{className:'modal-overlay',onClick:()=>setDrill(null)},
      React.createElement('div',{className:'modal',style:{width:560,maxHeight:'82vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
        React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:2}},
          React.createElement('div',{className:'modal-title',style:{marginBottom:0}},'TDS Deduction — '+drill.label),
          React.createElement(ShareReportButton,{title:'TDS Deduction — '+drill.label+' — '+(salon?salon.name.split('—')[0].trim():'Outlet'),subtitle:'TDS Summary — '+drill.label,
            getBodyHtml:()=>'<table><thead><tr><th>Party</th><th>Source</th><th>Section</th><th class="num">TDS</th></tr></thead><tbody>'
              +drillDetail.map(d=>'<tr><td>'+d.party+'</td><td>'+d.source+'</td><td>'+d.section+'</td><td class="num">₹'+Math.round(d.amt).toLocaleString('en-IN')+'</td></tr>').join('')
              +'<tr><td colspan="3"><b>Total</b></td><td class="num"><b>₹'+Math.round(drillTotal).toLocaleString('en-IN')+'</b></td></tr></tbody></table>',
            getSheetRows:()=>[['Party','Source','Section','TDS'],...drillDetail.map(d=>[d.party,d.source,d.section,d.amt]),['Total','','',drillTotal]]})
        ),
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:16}},(salon?salon.name:'Outlet')+' · Section-wise and party-wise detail behind this month\'s TDS'),
        React.createElement('div',{style:{marginBottom:18}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}},'By Section'),
          Object.keys(drillBySection).length===0
            ?React.createElement('div',{style:{fontSize:12,color:'var(--text3)'}},'No TDS deducted this month.')
            :Object.keys(drillBySection).sort().map(sec=>React.createElement('div',{key:sec,style:{display:'flex',justifyContent:'space-between',fontSize:12.5,color:'var(--text2)',padding:'5px 0',borderBottom:'1px solid var(--border)'}},
                React.createElement('span',{title:sec==='Sec. 192'?'Salary TDS — Section 192':tdsSectionFullLabel(sec)},sec),
                React.createElement('span',{style:{fontWeight:600,color:'var(--text)'}},money(drillBySection[sec]))
              ))
        ),
        drillDetail.length>0&&React.createElement('div',{style:{marginBottom:18}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}},'By Party'),
          React.createElement('div',{className:'table-wrap'},
            React.createElement('table',null,
              React.createElement('thead',null,React.createElement('tr',null,
                React.createElement('th',{style:{padding:'6px 8px',fontSize:10,color:'var(--accent2)',textAlign:'left',borderBottom:'2px solid var(--accent)',textTransform:'uppercase'}},'Party'),
                React.createElement('th',{style:{padding:'6px 8px',fontSize:10,color:'var(--accent2)',textAlign:'left',borderBottom:'2px solid var(--accent)',textTransform:'uppercase'}},'Source'),
                React.createElement('th',{style:{padding:'6px 8px',fontSize:10,color:'var(--accent2)',textAlign:'left',borderBottom:'2px solid var(--accent)',textTransform:'uppercase'}},'Section'),
                React.createElement('th',{style:{padding:'6px 8px',fontSize:10,color:'var(--accent2)',textAlign:'right',borderBottom:'2px solid var(--accent)',textTransform:'uppercase'}},'TDS')
              )),
              React.createElement('tbody',null,
                drillDetail.map((d,i)=>React.createElement('tr',{key:i},
                  React.createElement('td',{style:{padding:'6px 8px',fontSize:12,color:'var(--text)',borderBottom:'1px solid var(--border)'}},d.party),
                  React.createElement('td',{style:{padding:'6px 8px',fontSize:11.5,color:'var(--text3)',borderBottom:'1px solid var(--border)'}},d.source),
                  React.createElement('td',{style:{padding:'6px 8px',fontSize:11.5,color:'var(--text3)',borderBottom:'1px solid var(--border)'}},d.section),
                  React.createElement('td',{style:{padding:'6px 8px',fontSize:12,color:'var(--text)',fontWeight:600,textAlign:'right',borderBottom:'1px solid var(--border)'}},money(d.amt))
                ))
              )
            )
          )
        ),
        React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:14,fontWeight:700,paddingTop:10,borderTop:'2px solid var(--border)'}},
          React.createElement('span',null,'Total'),React.createElement('span',{style:{color:'var(--accent)'}},money(drillTotal))
        ),
        React.createElement('div',{style:{display:'flex',justifyContent:'flex-end',marginTop:16}},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setDrill(null)},'Close'))
      )
    )
  );
}

// One calendar month's PF/ESIC/PT totals, summed across every employee.
const STATUTORY_ZERO_CELLS={pfEmp:0,eps:0,pfErEpf:0,pfEr:0,edli:0,adminCharges:0,employerCost:0,pfTotal:0,esicEmp:0,esicEr:0,esicTotal:0,ptAmt:0};
function statutoryCellsForMonth(salonId,year,month){
  if(!isMonthUpToNow(year,month))return{...STATUTORY_ZERO_CELLS}; // hasn't happened yet — nothing due
  const emps=statutoryDeductionsFor(salonId,year,month);
  const pfEmp=emps.reduce((s,e)=>s+e.pfEmp,0);
  const eps=emps.reduce((s,e)=>s+e.eps,0);
  const pfErEpf=emps.reduce((s,e)=>s+e.pfErEpf,0);
  const pfEr=eps+pfErEpf; // Employer EPF share (A/c 1) + EPS (A/c 10) — matches the raw 12%-of-wage pfEr per employee, just split into its two destination accounts
  const edli=emps.reduce((s,e)=>s+e.edli,0);
  // Admin Charges — 0.5% per employee, but the ₹500/month minimum applies once across the whole
  // establishment (all employees combined), not per employee. ₹75 minimum for a month with zero
  // PF-enrolled employees isn't charged here — there's nothing to administer at all in that case.
  const adminChargeRaw=emps.reduce((s,e)=>s+e.adminChargeRaw,0);
  const adminCharges=adminChargeRaw>0?Math.max(500,adminChargeRaw):0;
  const employerCost=pfEr+edli+adminCharges; // total employer-side PF cost: EPF+EPS+EDLI+Admin (EDLI Admin is nil, waived by EPFO w.e.f. 1 Apr 2017)
  const esicEmp=emps.reduce((s,e)=>s+e.esicEmp,0),esicEr=emps.reduce((s,e)=>s+e.esicEr,0);
  const ptAmt=emps.reduce((s,e)=>s+e.ptAmt,0);
  return{pfEmp,eps,pfErEpf,pfEr,edli,adminCharges,employerCost,pfTotal:pfEmp+employerCost,esicEmp,esicEr,esicTotal:esicEmp+esicEr,ptAmt};
}
// Shared Monthly/Annual row-builder for the PF/ESIC/PT reports below — Monthly returns one FY's
// 12 months, Annual returns one row per financial year (summed across its 12 months).
function statutoryReportRows(salonId,mode,fy){
  if(mode==='monthly'){
    return Array.from({length:12},(_,mi)=>{
      const year=mi<9?Number(fy.slice(0,4)):Number('20'+fy.slice(5));
      const calMonth=(mi+3)%12;
      return{key:PL_MONTHS[mi]+' '+year,label:PL_MONTHS[mi]+' '+year,year,calMonth,came:isMonthUpToNow(year,calMonth),...statutoryCellsForMonth(salonId,year,calMonth)};
    });
  }
  return REPORT_FYS.map(f=>{
    const totals={pfEmp:0,eps:0,pfErEpf:0,pfEr:0,edli:0,adminCharges:0,employerCost:0,pfTotal:0,esicEmp:0,esicEr:0,esicTotal:0,ptAmt:0};
    for(let mi=0;mi<12;mi++){
      const year=mi<9?Number(f.slice(0,4)):Number('20'+f.slice(5));
      const calMonth=(mi+3)%12;
      const c=statutoryCellsForMonth(salonId,year,calMonth);
      for(const k in totals)totals[k]+=c[k];
    }
    return{key:f,label:'FY '+f,...totals};
  });
}
// Shared table shell for the PF/ESIC/PT reports — cols is [{key,label,color?}], each row an
// object carrying those keys (from statutoryReportRows above).
function StatutorySummaryTable({salonId,salon,reportTitle,mode,fy,onModeChange,onFyChange,cols,empCols,accentColor,footnote}){
  const rows=statutoryReportRows(salonId,mode,fy);
  const money=(n)=>n?'₹'+Math.round(n).toLocaleString('en-IN'):'—';
  const sum=(k)=>rows.reduce((s,r)=>s+r[k],0);
  const th=(txt)=>React.createElement('th',{style:{padding:'8px 10px',background:'#12121a',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',whiteSpace:'nowrap',borderBottom:'2px solid var(--accent)',textAlign:'right'}},txt);
  const td=(val,bold,color)=>React.createElement('td',{style:{padding:'7px 10px',fontSize:11.5,textAlign:'right',color:color||(bold?'var(--text)':'var(--text2)'),fontWeight:bold?700:400,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}},val);
  // ── Per-month, employee-wise detail — click any month (in Monthly view) to see exactly which
  // employees make up that month's figures, with its own Download/Share (Excel/PDF/Word, or
  // straight to WhatsApp/Email) separate from the outlet-wide summary export above. ──
  const [drill,setDrill]=useState(null); // the clicked row
  const drillEmps=drill?statutoryDeductionsFor(salonId,drill.year,drill.calMonth):[];
  const exportTitle=reportTitle+' — '+(mode==='monthly'?fy:'All Years')+' — '+(salon?salon.name.split('—')[0].trim():'Outlet');
  const exportSheetRows=()=>{
    const hdr=[mode==='monthly'?'Month':'Financial Year',...cols.map(c=>c.label)];
    const dataRows=rows.map(r=>[r.label,...cols.map(c=>r[c.key]||0)]);
    const totalRow=[mode==='monthly'?'Total ('+fy+')':'Total (all years)',...cols.map(c=>sum(c.key))];
    return[hdr,...dataRows,totalRow];
  };
  // Employee columns tinted blue, Employer columns tinted purple — same palette used everywhere
  // else in this app for these two — bold/summary columns (the totals) tinted green.
  const colTint=(c)=>c.bold?'#e8f6ee':/^Employee/.test(c.label)?'#eff6ff':/^Employer/.test(c.label)?'#f5f3ff':'#fdf6e8';
  const exportBodyHtml=()=>'<table><thead><tr><th>'+(mode==='monthly'?'Month':'Financial Year')+'</th>'+cols.map(c=>'<th class="num">'+c.label+'</th>').join('')+'</tr></thead><tbody>'
    +rows.map(r=>'<tr><td>'+r.label+'</td>'+cols.map(c=>'<td class="num" style="background:'+colTint(c)+'">'+(c.bold?'<b>':'')+'₹'+Math.round(r[c.key]||0).toLocaleString('en-IN')+(c.bold?'</b>':'')+'</td>').join('')+'</tr>').join('')
    +'<tr><td><b>'+(mode==='monthly'?'Total ('+fy+')':'Total (all years)')+'</b></td>'+cols.map(c=>'<td class="num"><b>₹'+Math.round(sum(c.key)).toLocaleString('en-IN')+'</b></td>').join('')+'</tr>'
    +'</tbody></table>';
  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{style:{display:'flex',gap:14,alignItems:'center',marginBottom:14,flexWrap:'wrap'}},
      React.createElement(ReportViewToggle,{mode,onChange:onModeChange}),
      mode==='monthly'&&React.createElement('div',{style:{display:'flex',gap:10,alignItems:'center'}},
        React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},'Financial Year'),
        React.createElement('select',{className:'form-control',style:{width:'auto',fontSize:12,padding:'6px 10px'},value:fy,onChange:e=>onFyChange(e.target.value)},
          REPORT_FYS.map(f=>React.createElement('option',{key:f},f)))),
      React.createElement('div',{style:{marginLeft:'auto'}},React.createElement(ShareReportButton,{title:exportTitle,subtitle:reportTitle,getBodyHtml:exportBodyHtml,getSheetRows:exportSheetRows,landscape:cols.length>3}))
    ),
    React.createElement('div',{className:'grid3',style:{marginBottom:16}},
      cols.filter(c=>c.summary).map(c=>React.createElement('div',{key:c.key,className:`metric-card ${c.cardColor||'blue'}`},
        React.createElement('div',{className:'metric-label'},c.summaryLabel||c.label),
        React.createElement('div',{className:'metric-value',style:{fontSize:18}},money(sum(c.key)))
      ))
    ),
    React.createElement('div',{className:'card'},
      React.createElement('div',{className:'table-wrap'},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,
            [React.createElement('th',{key:'m',style:{padding:'8px 10px',background:'#12121a',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',borderBottom:'2px solid var(--accent)',textAlign:'left'}},mode==='monthly'?'Month':'Financial Year'),
             ...cols.map(c=>th(c.label))]
          )),
          React.createElement('tbody',null,
            rows.map(r=>{
              const clickable=mode==='monthly'&&empCols&&r.came&&r[cols.find(c=>c.bold)?.key||cols[0].key]>0;
              return React.createElement('tr',{key:r.key},
                React.createElement('td',{style:{padding:'7px 10px',fontSize:11.5,color:clickable?'var(--blue)':'var(--text)',fontWeight:600,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',cursor:clickable?'pointer':'default',textDecoration:clickable?'underline':'none'},onClick:clickable?()=>setDrill(r):null},r.label),
                ...cols.map(c=>td(money(r[c.key]),!!c.bold,c.bold?accentColor:null))
              );
            }),
            React.createElement('tr',{style:{background:'rgba(47,95,224,0.08)'}},
              React.createElement('td',{style:{padding:'8px 10px',fontSize:11.5,fontWeight:700,color:'var(--text)',borderTop:'2px solid var(--border)'}},mode==='monthly'?'Total ('+fy+')':'Total (all years)'),
              ...cols.map(c=>React.createElement('td',{key:c.key,style:{padding:'8px 10px',fontSize:11.5,textAlign:'right',fontWeight:700,color:c.bold?accentColor:'var(--text)',borderTop:'2px solid var(--border)'}},money(sum(c.key))))
            )
          )
        )
      )
    ),
    footnote&&React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:10,lineHeight:1.5}},footnote),
    drill&&empCols&&(()=>{
      const dTitle=reportTitle+' — '+drill.label+' — '+(salon?salon.name.split('—')[0].trim():'Outlet');
      const dEmps=drillEmps.filter(e=>empCols.some(c=>e[c.key]>0));
      const dSheetRows=()=>{
        const hdr=['Employee','Designation',...empCols.map(c=>c.label)];
        const dataRows=dEmps.map(e=>[e.name,e.desig,...empCols.map(c=>e[c.key]||0)]);
        const totalRow=['Total','',...empCols.map(c=>dEmps.reduce((s,e)=>s+(e[c.key]||0),0))];
        return[hdr,...dataRows,totalRow];
      };
      const dBodyHtml=()=>'<table><thead><tr><th>Employee</th><th>Designation</th>'+empCols.map(c=>'<th class="num">'+c.label+'</th>').join('')+'</tr></thead><tbody>'
        +dEmps.map(e=>'<tr><td>'+e.name+'</td><td>'+e.desig+'</td>'+empCols.map(c=>'<td class="num">₹'+Math.round(e[c.key]||0).toLocaleString('en-IN')+'</td>').join('')+'</tr>').join('')
        +'<tr><td colspan="2"><b>Total</b></td>'+empCols.map(c=>'<td class="num"><b>₹'+Math.round(dEmps.reduce((s,e)=>s+(e[c.key]||0),0)).toLocaleString('en-IN')+'</b></td>').join('')+'</tr>'
        +'</tbody></table>';
      return React.createElement('div',{className:'modal-overlay',onClick:()=>setDrill(null)},
        React.createElement('div',{className:'modal',style:{width:560,maxHeight:'82vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
          React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}},
            React.createElement('div',null,
              React.createElement('div',{className:'modal-title',style:{marginBottom:2}},reportTitle+' — '+drill.label),
              React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},(salon?salon.name:'Outlet')+' · Employee-wise detail for this month')
            ),
            React.createElement(ShareReportButton,{title:dTitle,subtitle:reportTitle+' — '+drill.label,getBodyHtml:dBodyHtml,getSheetRows:dSheetRows})
          ),
          dEmps.length===0
            ?React.createElement('div',{style:{fontSize:12,color:'var(--text3)',padding:'20px 0',textAlign:'center'}},'No employees had a nonzero amount this month.')
            :React.createElement('div',{className:'table-wrap'},
                React.createElement('table',null,
                  React.createElement('thead',null,React.createElement('tr',null,
                    React.createElement('th',{style:{padding:'6px 8px',fontSize:10,color:'var(--accent2)',textAlign:'left',borderBottom:'2px solid var(--accent)',textTransform:'uppercase'}},'Employee'),
                    ...empCols.map(c=>React.createElement('th',{key:c.key,style:{padding:'6px 8px',fontSize:10,color:'var(--accent2)',textAlign:'right',borderBottom:'2px solid var(--accent)',textTransform:'uppercase'}},c.label))
                  )),
                  React.createElement('tbody',null,
                    dEmps.map(e=>React.createElement('tr',{key:e.id},
                      React.createElement('td',{style:{padding:'6px 8px',fontSize:12,color:'var(--text)',borderBottom:'1px solid var(--border)'}},e.name+' — '+e.desig),
                      ...empCols.map(c=>React.createElement('td',{key:c.key,style:{padding:'6px 8px',fontSize:12,color:'var(--text)',fontWeight:600,textAlign:'right',borderBottom:'1px solid var(--border)'}},money(e[c.key])))
                    ))
                  )
                )
              ),
          React.createElement('div',{style:{display:'flex',justifyContent:'flex-end',marginTop:16}},
            React.createElement('button',{className:'btn btn-ghost',onClick:()=>setDrill(null)},'Close'))
        )
      );
    })()
  );
}
const STATUTORY_FOOTNOTE='Only months that have already started show a figure — nothing appears for a month that hasn\'t come yet. Figures use each employee\'s Salary Working entry for that month (manual override if one was set, otherwise the standard formula), regardless of whether the corresponding column happens to be shown or hidden on Salary Working itself.';
// ── PF Summary — Monthly or Annual, Employee/Employer/Total. 12% of PF wage base each side
// (capped at ₹15,000 unless the employee's own pfOnActualBasic override is set). ──
function PfSummaryReport({salon}={}){
  const salonId=salon?.id;
  const [mode,setMode]=useState('monthly');
  const [fy,setFy]=useState(()=>calToFYMI(new Date().getFullYear(),new Date().getMonth()).fy);
  return React.createElement(StatutorySummaryTable,{salonId,salon,reportTitle:'PF Summary',mode,fy,onModeChange:setMode,onFyChange:setFy,accentColor:'var(--blue)',
    cols:[
      {key:'pfEmp',label:'Employee (12%)',summary:true,summaryLabel:'Employee Share',cardColor:'blue'},
      {key:'pfErEpf',label:'Employer — EPF (3.67%)'},
      {key:'eps',label:'Employer — EPS (8.33%)'},
      {key:'edli',label:'EDLI (0.5%)'},
      {key:'adminCharges',label:'Admin Charges (0.5%, min ₹500)'},
      {key:'employerCost',label:'Total Employer Cost',bold:true,summary:true,summaryLabel:'Total Employer Cost',cardColor:'purple'},
      {key:'pfTotal',label:'Total Remitted',bold:true,summary:true,summaryLabel:'PF Total (Emp + Er)',cardColor:'green'}
    ],
    empCols:[{key:'pfEmp',label:'Employee (12%)'},{key:'pfErEpf',label:'Employer EPF'},{key:'eps',label:'EPS'},{key:'edli',label:'EDLI'}],
    footnote:'Employee\'s 12% and Employer\'s EPF+EPS 12% both use the PF wage base (Basic, capped at ₹15,000 unless the employee\'s pfOnActualBasic override is set). EPS, EDLI, and Admin Charges always use the ₹15,000 ceiling regardless of that override — EPS = 8.33% of that capped wage (≈₹1,250 max), Employer EPF share is the remaining ≈3.67%. EDLI is 0.5%, employer-only. Admin Charges are 0.5% per employee, but the ₹500/month minimum applies once across every employee combined, not per employee. EDLI Admin Charges aren\'t shown — EPFO waived them entirely w.e.f. 1 April 2017. '+STATUTORY_FOOTNOTE});
}
// ── ESIC Summary — Monthly or Annual, Employee/Employer/Total. 0.75%/3.25% of Gross, only for
// employees with Gross ≤ ₹21,000. ──
function EsicSummaryReport({salon}={}){
  const salonId=salon?.id;
  const [mode,setMode]=useState('monthly');
  const [fy,setFy]=useState(()=>calToFYMI(new Date().getFullYear(),new Date().getMonth()).fy);
  return React.createElement(StatutorySummaryTable,{salonId,salon,reportTitle:'ESIC Summary',mode,fy,onModeChange:setMode,onFyChange:setFy,accentColor:'var(--purple)',
    cols:[{key:'esicEmp',label:'Employee (0.75%)'},{key:'esicEr',label:'Employer (3.25%)'},{key:'esicTotal',label:'Total Remitted',bold:true,summary:true,summaryLabel:'ESIC Total (Emp + Er)',cardColor:'purple'}],
    empCols:[{key:'esicEmp',label:'Employee (0.75%)'},{key:'esicEr',label:'Employer (3.25%)'}],
    footnote:'ESIC applies only to employees with Gross Salary ≤ ₹21,000 — 0.75% (Employee) + 3.25% (Employer) of Gross. '+STATUTORY_FOOTNOTE});
}
// ── PT Summary — Monthly or Annual. Employee-only — no employer-side PT under Indian law. ──
function PtSummaryReport({salon}={}){
  const salonId=salon?.id;
  const [mode,setMode]=useState('monthly');
  const [fy,setFy]=useState(()=>calToFYMI(new Date().getFullYear(),new Date().getMonth()).fy);
  return React.createElement(StatutorySummaryTable,{salonId,salon,reportTitle:'PT Summary',mode,fy,onModeChange:setMode,onFyChange:setFy,accentColor:'var(--accent)',
    cols:[{key:'ptAmt',label:'Amount',bold:true,summary:true,summaryLabel:'PT Total',cardColor:'amber'}],
    empCols:[{key:'ptAmt',label:'PT Amount'}],
    footnote:'Professional Tax is employee-only — computed from the outlet\'s own state slab against Gross Salary, only in states that levy it. '+STATUTORY_FOOTNOTE});
}

// ── Reports tab wrapper — Cash Register (persons behind Cash Handover / Cash Received) and
// Expense Register (every Daily Sales & Exp. expense category) side by side, same "both mounted,
// only visibility toggles" pattern used for Salary Working / Incentive Working's own sub-tabs. ──
// ── Fund Position — Bank Balance less every outstanding Payable, as of any chosen date. Bank
// Balance comes straight from the latest Bank Statement closing balance on/before that date;
// each Payable line is computed fresh from the same stores the rest of the app already uses
// (Salary/Incentive Working's own Payment Status, PF/ESIC/PT/TDS's own paidKeys from the Due
// Date Tracker, Vendor Sheet's own invoice balances) — never a separately-maintained figure that
// could drift out of sync with what those sheets actually show. ──
function bankBalanceAsOf(salonId,asOfIso){
  const rows=loadBankStatementRows(salonId)
    .map(r=>({iso:toISO(r.transactionDate),closingBalance:r.closingBalance}))
    .filter(r=>r.iso&&r.iso<=asOfIso&&r.closingBalance!=null&&r.closingBalance!=='');
  if(!rows.length)return null; // no bank statement data on/before this date — can't state a balance
  rows.sort((a,b)=>a.iso<b.iso?-1:a.iso>b.iso?1:0);
  return Number(rows[rows.length-1].closingBalance)||0;
}
function fundPositionAsOf(salonId,asOfIso,monthsBack){
  monthsBack=monthsBack||12;
  const asOf=new Date(asOfIso+'T00:00:00');
  const asOfYear=asOf.getFullYear(),asOfMonth=asOf.getMonth();
  const swMeta=loadSWMeta(salonId);
  const iwMeta=loadIWMeta(salonId);
  const dueOverrides=loadDueAutoOverrides(salonId);
  const salonRec=getSalonRecordById(salonId);
  const recurring=loadRecurringExpenses(salonId).filter(it=>it.status==='Active'&&it.tdsApplicable&&it.tdsSection);
  let salaryPayable=0,incentivePayable=0,tdsPayable=0,esicPayable=0,pfPayable=0,ptPayable=0;
  for(let i=0;i<monthsBack;i++){
    const cal=addMonths(asOfYear,asOfMonth,-i);
    const workings=swWorkingsFor(salonId,cal.year,cal.month).filter(e=>e.net>0);
    workings.forEach(e=>{
      const m=swMeta[attMonthKey(e.id,cal.year,cal.month)];
      if(!(m&&m.paymentStatus==='Paid'))salaryPayable+=e.net;
    });
    const incData=incWorkingsFor(salonId,cal.year,cal.month).filter(e=>e.totalInc>0);
    incData.forEach(e=>{
      const m=iwMeta[attMonthKey(e.id,cal.year,cal.month)];
      if(!(m&&m.paymentStatus==='Paid'))incentivePayable+=e.totalInc;
    });
    const partyDetail=tdsPartyDetailForMonth(salonId,cal.year,cal.month,recurring);
    if(partyDetail.length){
      const paidKeys=(dueOverrides['auto-tds-'+cal.year+'-'+cal.month]||{}).paidKeys||{};
      partyDetail.forEach(p=>{if(!paidKeys[p.key])tdsPayable+=p.amt;});
    }
    const swW=swWorkingsFor(salonId,cal.year,cal.month);
    const pfEmps=swW.filter(e=>e.pf&&((e.pfEmp||0)+(e.pfEr||0))>0);
    if(pfEmps.length){
      const paidKeys=(dueOverrides['auto-pf-'+cal.year+'-'+cal.month]||{}).paidKeys||{};
      pfEmps.forEach(e=>{if(!paidKeys[e.id])pfPayable+=(e.pfEmp||0)+(e.pfEr||0);});
    }
    const esicEmps=swW.filter(e=>e.esic&&e.gross<=21000&&((e.esicEmp||0)+(e.esicEr||0))>0);
    if(esicEmps.length){
      const paidKeys=(dueOverrides['auto-esic-'+cal.year+'-'+cal.month]||{}).paidKeys||{};
      esicEmps.forEach(e=>{if(!paidKeys[e.id])esicPayable+=(e.esicEmp||0)+(e.esicEr||0);});
    }
    if(salonRec&&ptAppliesToState(salonRec.state)){
      const ptEmps=swW.filter(e=>(e.ptAmt||0)>0);
      if(ptEmps.length){
        const paidKeys=(dueOverrides['auto-pt-'+cal.year+'-'+cal.month]||{}).paidKeys||{};
        ptEmps.forEach(e=>{if(!paidKeys[e.id])ptPayable+=e.ptAmt;});
      }
    }
  }
  // Vendor Sheet — every invoice with a real outstanding balance and its own Invoice Date on or
  // before the as-on date (not yet incurred at all if later), grouped by Category.
  const vendorsList=loadVendors(salonId);
  const invoices=loadVendorInvoices(salonId);
  const catTotals={};
  invoices.forEach(inv=>{
    if(inv.docNature==='Performa Invoice')return;
    const invIso=toISO(inv.invoiceDate);
    if(invIso&&invIso>asOfIso)return;
    const paidSoFar=(inv.payments||[]).reduce((s,p)=>s+(Number(p.paidAmount)||0),0);
    const outstanding=Math.round((Number(inv.amount)||0)-paidSoFar);
    if(outstanding<=0)return;
    const vendor=vendorsList.find(v=>v.id===inv.vendorId);
    const category=inv.category||(vendor?vendor.cat:'')||'Uncategorized';
    catTotals[category]=(catTotals[category]||0)+outstanding;
  });
  let rentPayable=0,electricityPayable=0,cosmeticPayable=0;
  const othersBreakup=[];
  Object.keys(catTotals).forEach(cat=>{
    const amt=catTotals[cat];
    if(/rent/i.test(cat))rentPayable+=amt;
    else if(cat==='Electricity Expenses')electricityPayable+=amt;
    else if(cat==='Purchase of Cosmetic')cosmeticPayable+=amt;
    else othersBreakup.push({category:cat,amount:amt});
  });
  othersBreakup.sort((a,b)=>b.amount-a.amount);
  const othersPayable=othersBreakup.reduce((s,o)=>s+o.amount,0);
  const totalPayable=salaryPayable+incentivePayable+rentPayable+electricityPayable+cosmeticPayable+tdsPayable+esicPayable+pfPayable+ptPayable+othersPayable;
  const bankBalance=bankBalanceAsOf(salonId,asOfIso);
  return{bankBalance,salaryPayable,incentivePayable,rentPayable,electricityPayable,cosmeticPayable,tdsPayable,esicPayable,pfPayable,ptPayable,othersPayable,othersBreakup,totalPayable,surplus:(bankBalance||0)-totalPayable};
}
// ── Expected Future Outgo — only kicks in when the As-on date is ahead of today. Everything in
// fundPositionAsOf() above is "already unpaid as of that date" — it never invents an amount that
// hasn't been recorded anywhere yet. This layer sits on top of it, purely additive, and estimates
// what's likely to fall due between today and a future As-on date:
//  • Recurring Expenses (Rent, Electricity, Royalty, etc.) — projected month by month using the
//    same monthly-equivalent figure (recurringExpenseMonthlyAmt) the P&L already uses to smooth a
//    Quarterly/Half-Yearly/Yearly commitment evenly across months, for every Active item whose own
//    Start/End Date window covers that month. The As-on month itself only counts an item if its
//    Due Day has actually been reached by the As-on date — a Rent due on the 5th doesn't count
//    itself as expected outgo for an As-on date of the 1st.
//  • Salary / Incentive / PF / ESIC / PT — a future month only gets an actual figure once its own
//    Attendance/Salary Working has really been run (fundPositionAsOf already picks that up on its
//    own, so it's never touched here). For a future month with nothing entered yet, this estimates
//    it using the most recent month that *does* have real Salary Working data, clearly labelled as
//    an estimate rather than an actual.
// Vendor Sheet invoices are deliberately NOT re-estimated here — any invoice already recorded with
// a future date is picked up automatically by fundPositionAsOf's own invIso<=asOfIso check, so
// re-projecting them here would double count. ──
function fundPositionExpectedOutgo(salonId,asOfIso){
  const todayIso=new Date().toISOString().slice(0,10);
  if(!(asOfIso>todayIso))return null; // nothing to project for today or a past date
  const todayD=new Date(todayIso+'T00:00:00');
  const asOfD=new Date(asOfIso+'T00:00:00');
  const salonRec=getSalonRecordById(salonId);
  const ptApplies=!!(salonRec&&ptAppliesToState(salonRec.state));
  // Find the most recent month (today or earlier) with a real, already-run Salary Working — used
  // as the proxy for any future month that has nothing entered yet.
  let proxy=null;
  for(let i=0;i<12&&!proxy;i++){
    const cal=addMonths(todayD.getFullYear(),todayD.getMonth(),-i);
    const sw=swWorkingsFor(salonId,cal.year,cal.month).filter(e=>e.net>0);
    if(sw.length){
      const iw=incWorkingsFor(salonId,cal.year,cal.month).filter(e=>e.totalInc>0);
      proxy={year:cal.year,month:cal.month,
        salary:sw.reduce((s,e)=>s+e.net,0),
        incentive:iw.reduce((s,e)=>s+e.totalInc,0),
        pf:sw.filter(e=>e.pf).reduce((s,e)=>s+(e.pfEmp||0)+(e.pfEr||0),0),
        esic:sw.filter(e=>e.esic&&e.gross<=21000).reduce((s,e)=>s+(e.esicEmp||0)+(e.esicEr||0),0),
        pt:ptApplies?sw.reduce((s,e)=>s+(e.ptAmt||0),0):0};
    }
  }
  // Every calendar month strictly after "today"'s month, through the As-on date's month.
  const months=[];
  let c=addMonths(todayD.getFullYear(),todayD.getMonth(),1);
  while(c.year<asOfD.getFullYear()||(c.year===asOfD.getFullYear()&&c.month<=asOfD.getMonth())){
    months.push({...c,isAsOfMonth:c.year===asOfD.getFullYear()&&c.month===asOfD.getMonth()});
    c=addMonths(c.year,c.month,1);
  }
  const recurringActive=loadRecurringExpenses(salonId).filter(it=>it.status==='Active');
  let salary=0,incentive=0,pf=0,esic=0,pt=0,recurring=0;
  const recurringBreakup={};
  months.forEach(m=>{
    const swActual=swWorkingsFor(salonId,m.year,m.month).filter(e=>e.net>0);
    if(!swActual.length&&proxy){salary+=proxy.salary;incentive+=proxy.incentive;pf+=proxy.pf;esic+=proxy.esic;pt+=proxy.pt;}
    const monthStartIso=new Date(m.year,m.month,1).toISOString().slice(0,10);
    const monthEndIso=new Date(m.year,m.month+1,0).toISOString().slice(0,10);
    recurringActive.forEach(it=>{
      const amt=recurringExpenseMonthlyAmt(it,m.year,m.month,salonId);
      if(!amt)return;
      const startIso=toISO(it.startDate||it.rentStartDate);
      const endIso=it.endDate?toISO(it.endDate):null;
      if(startIso&&startIso>monthEndIso)return; // hasn't started by this month
      if(endIso&&endIso<monthStartIso)return; // already ended before this month
      if(m.isAsOfMonth){
        const dueDay=Number(it.dueDay)||1;
        if(dueDay>asOfD.getDate())return; // due date within this month hasn't been reached yet
      }
      recurring+=amt;
      const name=recurringExpenseNameOf(it);
      recurringBreakup[name]=(recurringBreakup[name]||0)+amt;
    });
  });
  const total=salary+incentive+pf+esic+pt+recurring;
  if(!total)return{months:months.length,proxy,salary:0,incentive:0,pf:0,esic:0,pt:0,recurring:0,recurringBreakup:[],total:0};
  return{months:months.length,proxy,salary,incentive,pf,esic,pt,recurring,
    recurringBreakup:Object.keys(recurringBreakup).map(k=>({category:k,amount:recurringBreakup[k]})).sort((a,b)=>b.amount-a.amount),total};
}
function FundPositionReport({salon}={}){
  const salonId=salon?.id;
  const [asOf,setAsOf]=useState(()=>new Date().toISOString().slice(0,10));
  const [othersOpen,setOthersOpen]=useState(false);
  const [expectedOpen,setExpectedOpen]=useState(false);
  const [recBreakupOpen,setRecBreakupOpen]=useState(false);
  const fp=useMemo(()=>fundPositionAsOf(salonId,asOf),[salonId,asOf]);
  const expected=useMemo(()=>fundPositionExpectedOutgo(salonId,asOf),[salonId,asOf]);
  const money=(n)=>'₹'+Math.round(Math.abs(n||0)).toLocaleString('en-IN');
  const outletName=salon?salon.name.split('—')[0].trim():'Outlet';
  const asOfLabel=fmtDMY(asOf);
  const MONTH_SHORT=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const projectedSurplus=expected?fp.surplus-expected.total:null;
  const LINES=[
    ['Salary Payable',fp.salaryPayable],
    ['Incentive Payable',fp.incentivePayable],
    ['Rent Payable',fp.rentPayable],
    ['Electricity Payable',fp.electricityPayable],
    ['Cosmetic Payable',fp.cosmeticPayable],
    ['TDS Payable',fp.tdsPayable],
    ['ESIC Payable',fp.esicPayable],
    ['EPF Payable',fp.pfPayable],
    ['PT Payable',fp.ptPayable],
  ];
  const row=(label,val,opts)=>React.createElement('div',{key:label,style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:(opts&&opts.pad)||'8px 0',borderBottom:(opts&&opts.noBorder)?'none':'1px solid var(--border)',cursor:(opts&&opts.onClick)?'pointer':'default',paddingLeft:(opts&&opts.indent)||0},onClick:opts&&opts.onClick},
    React.createElement('span',{style:{fontSize:(opts&&opts.bold)?13.5:12.5,fontWeight:(opts&&opts.bold)?700:400,color:(opts&&opts.color)||'var(--text)'}},(opts&&opts.prefix)||'',label),
    React.createElement('span',{style:{fontSize:(opts&&opts.bold)?14:12.5,fontWeight:(opts&&opts.bold)?700:600,color:(opts&&opts.color)||'var(--text)'}},(opts&&opts.neg?'(':'')+money(val)+(opts&&opts.neg?')':''))
  );
  const title='Fund Position as on '+asOfLabel+' for '+outletName;
  const reportSheetRows=()=>{
    const rows=[['Particulars','Amount']];
    rows.push([title,'']);
    rows.push(['Bank Balance',Math.round(fp.bankBalance||0)]);
    rows.push(['Less: Expenses Payable','']);
    LINES.forEach(([l,v])=>rows.push(['  '+l,Math.round(v)]));
    if(fp.othersBreakup.length){
      rows.push(['  Others Payable',Math.round(fp.othersPayable)]);
      fp.othersBreakup.forEach(o=>rows.push(['    · '+o.category,Math.round(o.amount)]));
    }else{
      rows.push(['  Others Payable',0]);
    }
    rows.push(['Total Payable',Math.round(fp.totalPayable)]);
    rows.push(['Surplus (Deficiency) of Funds',Math.round(fp.surplus)]);
    if(expected&&expected.total>0){
      rows.push(['',''],['Expected Outgo before '+asOfLabel+' (Projected)','']);
      if(expected.salary)rows.push(['  Salary (Estimated)',Math.round(expected.salary)]);
      if(expected.incentive)rows.push(['  Incentive (Estimated)',Math.round(expected.incentive)]);
      if(expected.pf)rows.push(['  EPF (Estimated)',Math.round(expected.pf)]);
      if(expected.esic)rows.push(['  ESIC (Estimated)',Math.round(expected.esic)]);
      if(expected.pt)rows.push(['  PT (Estimated)',Math.round(expected.pt)]);
      if(expected.recurring)rows.push(['  Recurring Expenses (Projected)',Math.round(expected.recurring)]);
      expected.recurringBreakup.forEach(o=>rows.push(['    · '+o.category,Math.round(o.amount)]));
      rows.push(['Total Expected Outgo',Math.round(expected.total)]);
      rows.push(['Projected Surplus (Deficiency) of Funds',Math.round(fp.surplus-expected.total)]);
    }
    return rows;
  };
  const reportBodyHtml=()=>{
    let html='<table><tbody>';
    html+='<tr><td colspan="2"><b>'+title+'</b></td></tr>';
    html+='<tr><td>Bank Balance</td><td class="num">'+money(fp.bankBalance||0)+'</td></tr>';
    html+='<tr><td colspan="2"><b>Less: Expenses Payable</b></td></tr>';
    LINES.forEach(([l,v])=>{html+='<tr><td style="padding-left:20px">'+l+'</td><td class="num">'+money(v)+'</td></tr>';});
    html+='<tr><td style="padding-left:20px">Others Payable</td><td class="num">'+money(fp.othersPayable)+'</td></tr>';
    fp.othersBreakup.forEach(o=>{html+='<tr><td style="padding-left:36px;color:#8592A3;font-size:11px">'+o.category+'</td><td class="num" style="color:#8592A3;font-size:11px">'+money(o.amount)+'</td></tr>';});
    html+='<tr style="background:#fdf6e8"><td><b>Total Payable</b></td><td class="num"><b>'+money(fp.totalPayable)+'</b></td></tr>';
    html+='<tr style="background:'+(fp.surplus>=0?'#e8f6ee':'#fdecea')+'"><td><b>Surplus (Deficiency) of Funds</b></td><td class="num"><b>'+(fp.surplus<0?'('+money(fp.surplus)+')':money(fp.surplus))+'</b></td></tr>';
    if(expected&&expected.total>0){
      html+='<tr><td colspan="2"><b>Expected Outgo before '+asOfLabel+' (Projected)</b></td></tr>';
      if(expected.salary)html+='<tr><td style="padding-left:20px">Salary (Estimated)</td><td class="num">'+money(expected.salary)+'</td></tr>';
      if(expected.incentive)html+='<tr><td style="padding-left:20px">Incentive (Estimated)</td><td class="num">'+money(expected.incentive)+'</td></tr>';
      if(expected.pf)html+='<tr><td style="padding-left:20px">EPF (Estimated)</td><td class="num">'+money(expected.pf)+'</td></tr>';
      if(expected.esic)html+='<tr><td style="padding-left:20px">ESIC (Estimated)</td><td class="num">'+money(expected.esic)+'</td></tr>';
      if(expected.pt)html+='<tr><td style="padding-left:20px">PT (Estimated)</td><td class="num">'+money(expected.pt)+'</td></tr>';
      if(expected.recurring)html+='<tr><td style="padding-left:20px">Recurring Expenses (Projected)</td><td class="num">'+money(expected.recurring)+'</td></tr>';
      expected.recurringBreakup.forEach(o=>{html+='<tr><td style="padding-left:36px;color:#8592A3;font-size:11px">'+o.category+'</td><td class="num" style="color:#8592A3;font-size:11px">'+money(o.amount)+'</td></tr>';});
      html+='<tr style="background:#fdf6e8"><td><b>Total Expected Outgo</b></td><td class="num"><b>'+money(expected.total)+'</b></td></tr>';
      const projSurplus=fp.surplus-expected.total;
      html+='<tr style="background:'+(projSurplus>=0?'#e8f6ee':'#fdecea')+'"><td><b>Projected Surplus (Deficiency) of Funds</b></td><td class="num"><b>'+(projSurplus<0?'('+money(projSurplus)+')':money(projSurplus))+'</b></td></tr>';
    }
    html+='</tbody></table>';
    return html;
  };
  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{style:{display:'flex',gap:14,alignItems:'center',marginBottom:16,flexWrap:'wrap'}},
      React.createElement('div',{style:{display:'flex',gap:10,alignItems:'center'}},
        React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},'As on'),
        React.createElement('input',{type:'date',className:'form-control',style:{width:'auto',fontSize:12,padding:'6px 10px'},value:asOf,onChange:e=>setAsOf(e.target.value)})
      ),
      React.createElement('div',{style:{marginLeft:'auto'}},React.createElement(ShareReportButton,{title,subtitle:'Fund Position',getBodyHtml:reportBodyHtml,getSheetRows:reportSheetRows}))
    ),
    fp.bankBalance==null&&React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14}},
      'No Bank Statement data found on or before this date — Bank Balance is shown as ₹0 below. Import a statement covering this date on Bank Statement for an accurate figure.'),
    React.createElement('div',{className:'card',style:{maxWidth:640}},
      React.createElement('div',{style:{fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:2}},'Fund Position'),
      React.createElement('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:18}},'as on '+asOfLabel+' for '+outletName),
      row('Bank Balance',fp.bankBalance||0,{bold:true}),
      React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.06em',padding:'14px 0 6px'}},'Less: Expenses Payable'),
      LINES.map(([l,v])=>row(l,v,{indent:12})),
      row('Others Payable',fp.othersPayable,{indent:12,onClick:()=>setOthersOpen(o=>!o),prefix:othersOpen?'▾ ':'▸ ',noBorder:othersOpen&&fp.othersBreakup.length>0}),
      othersOpen&&fp.othersBreakup.length>0&&React.createElement('div',{style:{paddingLeft:28,paddingBottom:4,borderBottom:'1px solid var(--border)'}},
        fp.othersBreakup.map(o=>React.createElement('div',{key:o.category,style:{display:'flex',justifyContent:'space-between',fontSize:11.5,color:'var(--text3)',padding:'4px 0'}},
          React.createElement('span',null,o.category),React.createElement('span',null,money(o.amount))
        ))
      ),
      othersOpen&&fp.othersBreakup.length===0&&React.createElement('div',{style:{paddingLeft:28,paddingBottom:8,fontSize:11.5,color:'var(--text3)'}},'Nothing outstanding outside the categories above.'),
      row('Total Payable',fp.totalPayable,{bold:true,pad:'12px 0',color:'var(--accent)'}),
      React.createElement('div',{style:{marginTop:10,padding:'12px 14px',borderRadius:'var(--r)',background:fp.surplus>=0?'rgba(76,175,125,0.1)':'rgba(255,107,107,0.1)',border:'1px solid '+(fp.surplus>=0?'rgba(76,175,125,0.3)':'rgba(255,107,107,0.3)')}},
        row('Surplus (Deficiency) of Funds',fp.surplus,{bold:true,noBorder:true,pad:'0',neg:fp.surplus<0,color:fp.surplus>=0?'var(--green)':'var(--red)'})
      )
    ),
    expected&&expected.total>0&&React.createElement('div',{className:'card',style:{maxWidth:640,marginTop:14,border:'1px dashed var(--border)'}},
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:2}},
        React.createElement('div',{style:{fontSize:14,fontWeight:700,color:'var(--text)'}},'Expected Outgo (Projected)'),
        React.createElement('span',{style:{fontSize:9.5,fontWeight:700,color:'var(--accent)',background:'rgba(200,150,50,0.12)',padding:'2px 7px',borderRadius:20,letterSpacing:'0.02em'}},'ESTIMATE')
      ),
      React.createElement('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:16}},'between today and '+asOfLabel),
      expected.salary>0&&row('Salary'+(expected.proxy?' (Est.)':''),expected.salary,{indent:12}),
      expected.incentive>0&&row('Incentive'+(expected.proxy?' (Est.)':''),expected.incentive,{indent:12}),
      expected.pf>0&&row('EPF (Est.)',expected.pf,{indent:12}),
      expected.esic>0&&row('ESIC (Est.)',expected.esic,{indent:12}),
      expected.pt>0&&row('PT (Est.)',expected.pt,{indent:12}),
      expected.recurring>0&&row('Recurring Expenses',expected.recurring,{indent:12,onClick:()=>setRecBreakupOpen(o=>!o),prefix:recBreakupOpen?'▾ ':'▸ ',noBorder:recBreakupOpen}),
      recBreakupOpen&&expected.recurringBreakup.length>0&&React.createElement('div',{style:{paddingLeft:28,paddingBottom:4,borderBottom:'1px solid var(--border)'}},
        expected.recurringBreakup.map(o=>React.createElement('div',{key:o.category,style:{display:'flex',justifyContent:'space-between',fontSize:11.5,color:'var(--text3)',padding:'4px 0'}},
          React.createElement('span',null,o.category),React.createElement('span',null,money(o.amount))
        ))
      ),
      row('Total Expected Outgo',expected.total,{bold:true,pad:'12px 0',color:'var(--accent)'}),
      React.createElement('div',{style:{marginTop:10,padding:'12px 14px',borderRadius:'var(--r)',background:projectedSurplus>=0?'rgba(76,175,125,0.1)':'rgba(255,107,107,0.1)',border:'1px solid '+(projectedSurplus>=0?'rgba(76,175,125,0.3)':'rgba(255,107,107,0.3)')}},
        row('Projected Surplus (Deficiency) of Funds',projectedSurplus,{bold:true,noBorder:true,pad:'0',neg:projectedSurplus<0,color:projectedSurplus>=0?'var(--green)':'var(--red)'})
      ),
      React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:12,lineHeight:1.5}},
        (expected.proxy?'Salary/Incentive/PF/ESIC/PT for a future month with no Salary Working run yet are estimated from '+MONTH_SHORT[expected.proxy.month]+' '+expected.proxy.year+', the most recent month with actual figures. ':'No past month with an actual Salary Working was found to estimate Salary/Incentive/PF/ESIC/PT from, so only Recurring Expenses are projected below. ')
        +'Recurring Expenses are projected month-by-month from each Active item\'s own Frequency, Due Day, and Start/End Date. Any Vendor Sheet invoice already recorded with a future date is already included above in Total Payable, not repeated here.')
    ),
    React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:12,lineHeight:1.5,maxWidth:640}},'Bank Balance is the latest Bank Statement closing balance on or before this date. Every Payable line is pulled live from the same records as Salary/Incentive Working, the PF/ESIC/PT/TDS entries on Due Dates, and Vendor Sheet\'s own invoice balances — nothing here is separately maintained, so it can never drift out of sync with those sheets. Salary/Incentive/PF/ESIC/PT/TDS look back 12 months for anything still unpaid as of this date; Others Payable is every other Vendor Sheet category, click to expand.')
  );
}

function ReportsSheet({salon,period}={}){
  const [subTab,setSubTab]=useState('cash');
  const tabBar=React.createElement('div',{className:'tab-bar',style:{marginBottom:16}},
    [{id:'cash',label:'Cash Register'},{id:'expense',label:'Expense Register'},
     {id:'expenses-summary',label:'Expenses Summary',hint:'Monthly and comparative totals from Daily Sales & Exp, by individual expense row or rolled up by group.'},
     {id:'tds',label:'TDS Summary',hint:'Tax Deducted at Source — tax you deduct from a payment (salary, rent, professional fees) and remit to the government on the payee\'s behalf.'},
     {id:'pf',label:'PF Summary',hint:'Provident Fund — a retirement savings scheme both the employee (12% of wages) and employer contribute to every month.'},
     {id:'esic',label:'ESIC Summary',hint:'Employees\' State Insurance — medical/injury insurance for lower-wage employees (Gross ≤ ₹21,000), funded by small employee + employer contributions.'},
     {id:'pt',label:'PT Summary',hint:'Professional Tax — a small state-government tax on salaries, only in states that levy it (deducted from the employee, no employer share).'},
     {id:'fund',label:'Fund Position'}].map(t=>
      React.createElement('button',{key:t.id,title:t.hint,className:`tab-btn ${subTab===t.id?'active':''}`,onClick:()=>setSubTab(t.id)},t.label)
    )
  );
  return React.createElement('div',{className:'fade-in'},
    tabBar,
    React.createElement('div',{style:{display:subTab==='cash'?'block':'none'}},React.createElement(CashPersonsRegister,{salon})),
    React.createElement('div',{style:{display:subTab==='expense'?'block':'none'}},React.createElement(ExpenseRegisterSheet,{salon})),
    React.createElement('div',{style:{display:subTab==='expenses-summary'?'block':'none'}},React.createElement(ExpensesSummaryReport,{salon,period})),
    React.createElement('div',{style:{display:subTab==='tds'?'block':'none'}},React.createElement(TdsSummaryReport,{salon})),
    React.createElement('div',{style:{display:subTab==='pf'?'block':'none'}},React.createElement(PfSummaryReport,{salon})),
    React.createElement('div',{style:{display:subTab==='esic'?'block':'none'}},React.createElement(EsicSummaryReport,{salon})),
    React.createElement('div',{style:{display:subTab==='pt'?'block':'none'}},React.createElement(PtSummaryReport,{salon})),
    React.createElement('div',{style:{display:subTab==='fund'?'block':'none'}},React.createElement(FundPositionReport,{salon}))
  );
}

function FixedAssetsCore({salon,onNavTab}={}){
  const salonId=salon?.id;
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const [refreshTick,setRefreshTick]=useState(0);
  const doRefresh=()=>setRefreshTick(t=>t+1);
  const vendors=useMemo(()=>loadVendors(salonId),[salonId,refreshTick]);
  const getVendorName=(id)=>{const v=vendors.find(x=>x.id===id);return v?v.name:id;};
  const assets=useMemo(()=>loadVendorInvoices(salonId)
    .filter(inv=>(inv.category||'')==='Fixed Assets'&&inv.docNature!=='Performa Invoice')
    .sort((a,b)=>{
      const pa=parseInvoiceDateFlexible(a.bookingDate||a.invoiceDate);
      const pb=parseInvoiceDateFlexible(b.bookingDate||b.invoiceDate);
      const na=pa?pa.y*10000+pa.m*100+pa.d:0, nb=pb?pb.y*10000+pb.m*100+pb.d:0;
      return nb-na;
    }),
    [salonId,refreshTick]);
  const fmt=(n)=>n?'₹'+Math.round(n).toLocaleString():'—';
  const gstOf=(inv)=>(Number(inv.igst)||0)+(Number(inv.cgst)||0)+(Number(inv.sgst)||0);
  const paidOf=(inv)=>(inv.payments||[]).reduce((s,p)=>s+(Number(p.paidAmount)||0),0);
  const balanceOf=(inv)=>(Number(inv.amount)||0)-paidOf(inv);
  const payStatusOf=(inv)=>{const bal=balanceOf(inv);if(bal<=0)return'Paid';if(paidOf(inv)>0)return'Partially Paid';return'Unpaid';};
  const dmyToLong=(dmy)=>{const p=parseInvoiceDateFlexible(dmy);if(!p)return dmy||'—';return p.d+' '+MONTHS[p.m-1].slice(0,3)+' '+p.y;};

  // ── Selection — same pattern as every other export-capable sheet: empty = everyone, any
  // selection narrows Export/Share to just those rows. ──
  const [selectedIds,setSelectedIds]=useState(new Set());
  useEffect(()=>{setSelectedIds(new Set());},[salonId]);
  const toggleSelect=(id)=>setSelectedIds(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});
  const allSelected=assets.length>0&&assets.every(a=>selectedIds.has(a.id));
  const toggleSelectAll=()=>setSelectedIds(allSelected?new Set():new Set(assets.map(a=>a.id)));
  const exportRows=selectedIds.size>0?assets.filter(a=>selectedIds.has(a.id)):assets;

  const totalValue=assets.reduce((s,inv)=>s+(Number(inv.amount)||0),0);
  const totalPaid=assets.reduce((s,inv)=>s+paidOf(inv),0);
  const totalOutstanding=totalValue-totalPaid;

  const COLS=['Asset / Description','Vendor','Invoice No.','Booking Date','Taxable Value','GST','Total Amount','Paid','Balance','Payment Status'];
  const rowValues=(inv)=>[assetNamesDisplay(inv),getVendorName(inv.vendorId),inv.invoiceNo||'—',dmyToLong(inv.bookingDate||inv.invoiceDate),Number(inv.taxable)||0,gstOf(inv),Number(inv.amount)||0,paidOf(inv),balanceOf(inv),payStatusOf(inv)];

  const exportExcel=async()=>{
    const filename='FixedAssets_'+(salon?salon.name.split('—')[0].trim().replace(/\s+/g,''):'')+(selectedIds.size>0?'_selected':'')+'.xlsx';
    try{
      const blob=await exportReportExcelBlob(faReportTitle,faReportSheetRows());
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
    }catch(err){faError(err.message);}
  };
  const faReportTitle='Fixed Assets Register'+(salon?' — '+salon.name.split('—')[0].trim():'')+(selectedIds.size>0?' (selected)':'');
  const faReportSheetRows=()=>{
    const totalRow=['Total'+(selectedIds.size>0?' (selected)':''),'','','',
      exportRows.reduce((s,inv)=>s+(Number(inv.taxable)||0),0),
      exportRows.reduce((s,inv)=>s+gstOf(inv),0),
      exportRows.reduce((s,inv)=>s+(Number(inv.amount)||0),0),
      exportRows.reduce((s,inv)=>s+paidOf(inv),0),
      exportRows.reduce((s,inv)=>s+balanceOf(inv),0),''
    ];
    return[COLS,...exportRows.map(rowValues),totalRow];
  };
  const faReportBodyHtml=()=>{
    const headRow='<tr>'+COLS.map((h,i)=>'<th'+(i>=4&&i<=8?' class="num"':'')+'>'+h+'</th>').join('')+'</tr>';
    const bodyRows=exportRows.map(inv=>{
      const v=rowValues(inv);
      return '<tr><td>'+v[0]+'</td><td>'+v[1]+'</td><td>'+v[2]+'</td><td>'+v[3]+'</td><td class="num">'+fmt(v[4])+'</td><td class="num">'+fmt(v[5])+'</td><td class="num">'+fmt(v[6])+'</td><td class="num">'+fmt(v[7])+'</td><td class="num">'+fmt(v[8])+'</td><td>'+v[9]+'</td></tr>';
    }).join('');
    const totalRow='<tr style="font-weight:700;background:#f4f4f4"><td>'+'Total'+(selectedIds.size>0?' (selected)':'')+'</td><td></td><td></td><td></td>'
      +'<td class="num">'+fmt(exportRows.reduce((s,inv)=>s+(Number(inv.taxable)||0),0))+'</td>'
      +'<td class="num">'+fmt(exportRows.reduce((s,inv)=>s+gstOf(inv),0))+'</td>'
      +'<td class="num">'+fmt(exportRows.reduce((s,inv)=>s+(Number(inv.amount)||0),0))+'</td>'
      +'<td class="num">'+fmt(exportRows.reduce((s,inv)=>s+paidOf(inv),0))+'</td>'
      +'<td class="num">'+fmt(exportRows.reduce((s,inv)=>s+balanceOf(inv),0))+'</td><td></td></tr>';
    return '<table><thead>'+headRow+'</thead><tbody>'+bodyRows+totalRow+'</tbody></table>';
  };

  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Fixed Assets'),
        React.createElement('div',{className:'page-sub'},'Auto-populated from Vendors — every invoice booked with Category "Fixed Assets" shows up here')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:doRefresh},'⟳ Refresh'),
        React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)',borderColor:'rgba(76,175,125,0.4)'},onClick:exportExcel},selectedIds.size>0?'⬇ Export Selected ('+selectedIds.size+')':'⬇ Export Excel'),
        React.createElement(ShareReportButton,{title:faReportTitle,subtitle:'Fixed Assets Register',getBodyHtml:faReportBodyHtml,getSheetRows:faReportSheetRows}),
        onNavTab&&React.createElement('button',{className:'btn btn-primary btn-sm',onClick:()=>onNavTab('vendors')},'+ Book Fixed Asset Invoice')
      )
    ),
    React.createElement('div',{className:'grid4',style:{marginBottom:16}},
      React.createElement('div',{className:'metric-card'},React.createElement('div',{className:'metric-label'},'Total Assets Booked'),React.createElement('div',{className:'metric-value'},assets.length)),
      React.createElement('div',{className:'metric-card blue'},React.createElement('div',{className:'metric-label'},'Total Value'),React.createElement('div',{className:'metric-value'},fmt(totalValue))),
      React.createElement('div',{className:'metric-card green'},React.createElement('div',{className:'metric-label'},'Total Paid'),React.createElement('div',{className:'metric-value'},fmt(totalPaid))),
      React.createElement('div',{className:'metric-card '+(totalOutstanding>0?'red':'green')},React.createElement('div',{className:'metric-label'},'Outstanding'),React.createElement('div',{className:'metric-value'},fmt(totalOutstanding)))
    ),
    selectedIds.size>0&&React.createElement('div',{style:{fontSize:11.5,color:'var(--accent2)',background:'rgba(47,95,224,0.1)',border:'1px solid rgba(47,95,224,0.3)',borderRadius:'var(--r)',padding:'6px 12px',marginBottom:10}},
      selectedIds.size+' of '+assets.length+' assets selected — Export and Share above will only include the selected rows — ',
      React.createElement('span',{style:{color:'var(--accent2)',cursor:'pointer',textDecoration:'underline'},onClick:()=>setSelectedIds(new Set())},'clear selection')
    ),
    React.createElement('div',{className:'card',style:{padding:0}},
      React.createElement('div',{style:{overflowX:'auto'}},
        React.createElement('table',{style:{borderCollapse:'collapse',width:'100%',fontSize:12}},
          React.createElement('thead',null,React.createElement('tr',null,
            React.createElement('th',{style:{padding:'8px 10px',background:'var(--th-bg)',borderBottom:'2px solid var(--accent)',width:32}},
              assets.length>0&&React.createElement('input',{type:'checkbox',checked:allSelected,onChange:toggleSelectAll,title:'Select all'})
            ),
            COLS.map(h=>React.createElement('th',{key:h,style:{padding:'8px 10px',background:'var(--th-bg)',color:'var(--accent2)',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em',whiteSpace:'nowrap',borderBottom:'2px solid var(--accent)',textAlign:['Taxable Value','GST','Total Amount','Paid','Balance'].includes(h)?'right':'left'}},h)),
            React.createElement('th',{style:{padding:'8px 10px',background:'var(--th-bg)',borderBottom:'2px solid var(--accent)',width:60}},'')
          )),
          assets.length===0
            ?React.createElement('tbody',null,React.createElement('tr',null,React.createElement('td',{colSpan:COLS.length+2,style:{textAlign:'center',padding:32,color:'var(--text3)'}},
                'No Fixed Assets recorded yet. Book an invoice under Vendors with Category "Fixed Assets" and it will appear here automatically.',
                onNavTab&&React.createElement('div',{style:{marginTop:12}},React.createElement('button',{className:'btn btn-primary btn-sm',onClick:()=>onNavTab('vendors')},'Go to Vendors →'))
              )))
            :React.createElement('tbody',null,
              assets.map((inv,idx)=>{
                const rowBg=idx%2===1?'rgba(120,130,150,0.05)':undefined;
                const status=payStatusOf(inv);
                const statusColor=status==='Paid'?'var(--green)':status==='Partially Paid'?'var(--orange)':'var(--red)';
                return React.createElement('tr',{key:inv.id,style:{background:selectedIds.has(inv.id)?'rgba(47,95,224,0.06)':rowBg}},
                  React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)'}},
                    React.createElement('input',{type:'checkbox',checked:selectedIds.has(inv.id),onChange:()=>toggleSelect(inv.id)})
                  ),
                  React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',fontWeight:500,color:'var(--text)'}},assetNamesDisplay(inv)),
                  React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',color:'var(--text2)',whiteSpace:'nowrap'}},getVendorName(inv.vendorId)),
                  React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',color:'var(--text2)',whiteSpace:'nowrap'}},inv.invoiceNo||'—'),
                  React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',color:'var(--text2)',whiteSpace:'nowrap'}},dmyToLong(inv.bookingDate||inv.invoiceDate)),
                  React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',textAlign:'right',color:'var(--text2)'}},fmt(inv.taxable)),
                  React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',textAlign:'right',color:'var(--text2)'}},fmt(gstOf(inv))),
                  React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',textAlign:'right',fontWeight:600,color:'var(--accent)',background:'rgba(139,127,232,0.09)'}},fmt(inv.amount)),
                  React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',textAlign:'right',color:'var(--green)'}},fmt(paidOf(inv))),
                  React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',textAlign:'right',color:balanceOf(inv)>0?'var(--red)':'var(--text3)',fontWeight:balanceOf(inv)>0?600:400}},fmt(balanceOf(inv))),
                  React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)'}},React.createElement('span',{className:'badge',style:{color:statusColor,border:'1px solid '+statusColor,background:'transparent',fontSize:10.5}},status)),
                  React.createElement('td',{style:{padding:'7px 10px',borderBottom:'1px solid var(--border)',textAlign:'center'}},
                    onNavTab&&React.createElement('span',{title:'View / edit this invoice on the Vendors tab',style:{cursor:'pointer',color:'var(--blue)',fontSize:12},onClick:()=>onNavTab('vendors')},'🔗 Vendors')
                  )
                );
              }),
              React.createElement('tr',{key:'fa-total',style:{background:'var(--th-bg)'}},
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)'}},''),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)',fontWeight:700,color:'var(--accent2)'}},selectedIds.size>0?'Total (selected)':'Total'),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)'}},''),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)'}},''),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)'}},''),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)',textAlign:'right',fontWeight:700}},fmt(exportRows.reduce((s,inv)=>s+(Number(inv.taxable)||0),0))),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)',textAlign:'right',fontWeight:700}},fmt(exportRows.reduce((s,inv)=>s+gstOf(inv),0))),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)',textAlign:'right',fontWeight:700,color:'var(--accent)'}},fmt(exportRows.reduce((s,inv)=>s+(Number(inv.amount)||0),0))),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)',textAlign:'right',fontWeight:700,color:'var(--green)'}},fmt(exportRows.reduce((s,inv)=>s+paidOf(inv),0))),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)',textAlign:'right',fontWeight:700,color:'var(--red)'}},fmt(exportRows.reduce((s,inv)=>s+balanceOf(inv),0))),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)'}},''),
                React.createElement('td',{style:{padding:'8px 10px',borderTop:'2px solid var(--accent)'}},'')
              )
            )
        )
      )
    )
  );
}

// ── Tab wrapper — Fixed Assets register (invoices booked under Vendors with Category "Fixed
// Assets") and Depreciation (the Fixed Asset Register + WDV/SLM calculator) as sub-tabs under one
// Fixed Assets section, same pattern as every other multi-tab sheet in this app. Both stay
// mounted at all times — only visibility toggles. ──
function FixedAssetsSheet({salon,period,onNavTab}={}){
  const [subTab,setSubTab]=useState('assets');
  const tabBar=React.createElement('div',{className:'tab-bar',style:{marginBottom:16}},
    [{id:'assets',label:'Assets'},{id:'depreciation',label:'Depreciation'}].map(t=>
      React.createElement('button',{key:t.id,className:`tab-btn ${subTab===t.id?'active':''}`,onClick:()=>setSubTab(t.id)},t.label)
    )
  );
  return React.createElement('div',{className:'fade-in'},
    tabBar,
    React.createElement('div',{style:{display:subTab==='assets'?'block':'none'}},React.createElement(FixedAssetsCore,{salon,onNavTab})),
    React.createElement('div',{style:{display:subTab==='depreciation'?'block':'none'}},React.createElement(DepreciationSheet,{salon,period}))
  );
}

// ── Due Date Sheet — auto-generated items ────────────────────────────────────────────────────
// Two sources feed the Due Date Sheet automatically, on top of anything entered manually there:
//  1. Statutory dues (PF/ESIC/PT) — computed from Salary Working's own swWorkingsFor(), the same
//     single source of truth used by the Salary Working sheet and P&L's Employee Cost, so the
//     amount shown here always matches what Salary Working actually calculated for that month.
//  2. Vendor Sheet payables — every vendor invoice with a real outstanding balance, shown
//     vendor-wise with its Category, using the invoice's own Due Date.
// Both kinds carry a stable id (so marking one Paid persists across re-renders/reload via a small
// overrides store) and a status computed live from today's date rather than a manually-picked
// value, since these should self-update as the due date approaches or passes.

// PF and ESIC are both Central-government deadlines — 15th of the following month, no exceptions
// by state. Professional Tax is state-specific; these are the due-days verified for a few major
// states, with 20th used as a reasonable default for the rest — same "commonly-cited, always
// verify against the current state notification" caveat as PT_DEFAULT_SLABS above, since state
// governments do revise these by circular (e.g. Maharashtra moved from month-end to the 15th
// effective March 2026).
const PT_DUE_DAY={'Karnataka':20,'Maharashtra':15,'West Bengal':21};
function ptDueDayFor(state){return PT_DUE_DAY[state]||20;}

// Adds `months` to a {year,month} (month is 0-11) and returns the same shape.
function addMonths(year,month,months){
  const d=new Date(year,month+months,1);
  return{year:d.getFullYear(),month:d.getMonth()};
}
// Due date for a contribution made FOR {year,month}, payable by `day` of the following month.
function statutoryDueDateFor(year,month,day){
  const next=addMonths(year,month,1);
  const lastDayOfNext=new Date(next.year,next.month+1,0).getDate();
  return next.year+'-'+String(next.month+1).padStart(2,'0')+'-'+String(Math.min(day,lastDayOfNext)).padStart(2,'0');
}
// A due item's live status — computed from today rather than stored, so it self-updates as the
// date passes. 'soon' = due within 7 days.
function dueStatusFor(dueIso,paid){
  if(paid)return'done';
  if(!dueIso)return'upcoming';
  const due=new Date(dueIso+'T00:00:00');
  if(isNaN(due))return'upcoming';
  const today=new Date();today.setHours(0,0,0,0);
  const days=Math.round((due-today)/86400000);
  if(days<0)return'overdue';
  if(days<=7)return'soon';
  return'ok';
}
// Small persisted store for the only mutable part of an auto-generated item — its paid status —
// keyed by the item's own stable id, since the item itself is recomputed fresh every render.
function loadDueAutoOverrides(salonId){
  try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_due_auto_overrides',salonId))||'{}');if(v&&typeof v==='object')return v;}catch(e){}
  return{};
}
function saveDueAutoOverride(salonId,id,val){
  const all=loadDueAutoOverrides(salonId);
  all[id]={...(all[id]||{}),...val};
  safeLocalSet(outletKey('salonos_due_auto_overrides',salonId),JSON.stringify(all));
}
// Statutory (PF/ESIC/PT) due items for a rolling window of recent months — older months are
// almost certainly already settled, and future months don't have finalized attendance yet.
function autoStatutoryDueItemsFor(salonId,monthsBack){
  monthsBack=monthsBack||4;
  const salonRec=getSalonRecordById(salonId);
  const overrides=loadDueAutoOverrides(salonId);
  const today=new Date();
  const items=[];
  for(let i=monthsBack-1;i>=0;i--){
    const cal=addMonths(today.getFullYear(),today.getMonth(),-i);
    const workings=swWorkingsFor(salonId,cal.year,cal.month);
    if(!workings.length)continue;
    const label=new Date(cal.year,cal.month,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'});
    const pfEmps=workings.filter(e=>e.pf&&((e.pfEmp||0)+(e.pfEr||0))>0);
    const esicEmps=workings.filter(e=>e.esic&&e.gross<=21000&&((e.esicEmp||0)+(e.esicEr||0))>0);
    const ptEmps=workings.filter(e=>(e.ptAmt||0)>0);
    const pfTotal=pfEmps.reduce((s,e)=>s+(e.pfEmp||0)+(e.pfEr||0),0);
    const esicTotal=esicEmps.reduce((s,e)=>s+(e.esicEmp||0)+(e.esicEr||0),0);
    const ptTotal=ptEmps.reduce((s,e)=>s+(e.ptAmt||0),0);
    // Paid per-employee (paidKeys, same pattern as TDS Payment) — even though PF/ESIC/PT are
    // each remitted to the government as one combined challan (not per employee), tracking which
    // employees' contributions are actually included/reconciled within that one payment still
    // has real audit value — e.g. an employee added mid-reconciliation, or one whose figure needs
    // correcting before the challan is filed. The item as a whole only reads as Paid once every
    // employee that month is checked off.
    if(pfTotal>0){
      const id='auto-pf-'+cal.year+'-'+cal.month;
      const ov=overrides[id]||{};
      const paidKeys=ov.paidKeys||{};
      const paid=pfEmps.length>0&&pfEmps.every(e=>paidKeys[e.id]);
      const due=statutoryDueDateFor(cal.year,cal.month,15);
      items.push({id,auto:true,type:'PF Challan',year:cal.year,month:cal.month,desc:'PF for '+label+' — '+pfEmps.length+' employee(s) on PF (Employee + Employer contribution)',due,amount:Math.round(pfTotal),paid,paidAmount:paid?(ov.paidAmount||Math.round(pfTotal)):'',paidDate:paid?(ov.paidDate||''):'',ref:ov.ref||'',bankRowId:ov.bankRowId!=null?ov.bankRowId:null,status:dueStatusFor(due,paid)});
    }
    if(esicTotal>0){
      const id='auto-esic-'+cal.year+'-'+cal.month;
      const ov=overrides[id]||{};
      const paidKeys=ov.paidKeys||{};
      const paid=esicEmps.length>0&&esicEmps.every(e=>paidKeys[e.id]);
      const due=statutoryDueDateFor(cal.year,cal.month,15);
      items.push({id,auto:true,type:'ESIC Challan',year:cal.year,month:cal.month,desc:'ESIC for '+label+' — '+esicEmps.length+' employee(s) on ESIC (Employee + Employer contribution)',due,amount:Math.round(esicTotal),paid,paidAmount:paid?(ov.paidAmount||Math.round(esicTotal)):'',paidDate:paid?(ov.paidDate||''):'',ref:ov.ref||'',bankRowId:ov.bankRowId!=null?ov.bankRowId:null,status:dueStatusFor(due,paid)});
    }
    if(ptTotal>0&&salonRec&&ptAppliesToState(salonRec.state)){
      const id='auto-pt-'+cal.year+'-'+cal.month;
      const ov=overrides[id]||{};
      const paidKeys=ov.paidKeys||{};
      const paid=ptEmps.length>0&&ptEmps.every(e=>paidKeys[e.id]);
      const due=statutoryDueDateFor(cal.year,cal.month,ptDueDayFor(salonRec.state));
      items.push({id,auto:true,type:'PT Payment',year:cal.year,month:cal.month,desc:'Professional Tax for '+label+' — '+salonRec.state+' — '+ptEmps.length+' employee(s)',due,amount:Math.round(ptTotal),paid,paidAmount:paid?(ov.paidAmount||Math.round(ptTotal)):'',paidDate:paid?(ov.paidDate||''):'',ref:ov.ref||'',bankRowId:ov.bankRowId!=null?ov.bankRowId:null,status:dueStatusFor(due,paid)});
    }
  }
  return items;
}
// TDS Payment due items — same rolling-window pattern as PF/ESIC/PT above, combining both TDS
// sources this app tracks: Salary Working's own Section 192 entries, and every Active/TDS-
// Applicable Recurring Expense (smoothed by frequency, same as its own expense amount and the
// TDS Summary report under Reports). One combined "TDS Payment" item per month, since it's all
// deposited through the same monthly challan (ITNS 281) regardless of section — the description
// breaks out what makes up the total. Due by the 7th of the following month, except tax deducted
// in March, which is due by 30 April instead (Rule 30, Income Tax Rules).
function tdsDueDateFor(year,month){
  if(month===2)return year+'-04-30'; // March deduction — due 30 April, not the 7th
  return statutoryDueDateFor(year,month,7);
}
function autoTdsDueItemsFor(salonId,monthsBack){
  monthsBack=monthsBack||4;
  const overrides=loadDueAutoOverrides(salonId);
  const today=new Date();
  const recurring=loadRecurringExpenses(salonId).filter(it=>it.status==='Active'&&it.tdsApplicable&&it.tdsSection);
  const items=[];
  for(let i=monthsBack-1;i>=0;i--){
    const cal=addMonths(today.getFullYear(),today.getMonth(),-i);
    const label=new Date(cal.year,cal.month,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'});
    const partyDetail=tdsPartyDetailForMonth(salonId,cal.year,cal.month,recurring);
    const total=partyDetail.reduce((s,p)=>s+p.amt,0);
    if(total<=0)continue;
    const bySection={};
    partyDetail.forEach(p=>{bySection[p.section]=(bySection[p.section]||0)+p.amt;});
    const parts=Object.keys(bySection).sort().map(sec=>sec+' ₹'+Math.round(bySection[sec]).toLocaleString('en-IN'));
    const id='auto-tds-'+cal.year+'-'+cal.month;
    const ov=overrides[id]||{};
    // Paid per-contributor (paidKeys, from the party-wise checkbox list in Mark as Paid) — the
    // item as a whole only reads as Paid once every contributor that month is checked off, same
    // "all-or-nothing rolls up from the real per-party state" pattern Salary/Incentive Payment
    // use, just tracked here instead of on another sheet since TDS remittance has no home sheet
    // of its own to read a per-party status from.
    const paidKeys=ov.paidKeys||{};
    const paid=partyDetail.length>0&&partyDetail.every(p=>paidKeys[p.key]);
    const due=tdsDueDateFor(cal.year,cal.month);
    items.push({id,auto:true,type:'TDS Payment',year:cal.year,month:cal.month,desc:'TDS for '+label+' — '+parts.join(', '),due,amount:Math.round(total),paid,paidAmount:paid?(ov.paidAmount||Math.round(total)):'',paidDate:paid?(ov.paidDate||''):'',ref:ov.ref||'',bankRowId:ov.bankRowId!=null?ov.bankRowId:null,status:dueStatusFor(due,paid)});
  }
  return items;
}
// Salary Disbursement & Incentive Payment due items — same rolling-window pattern as PF/ESIC/PT
// above, but the due day is configurable per outlet (Master Sheet → Edit Salon → Payment Due
// Dates) instead of a fixed statutory day, since payroll cutoff varies salon to salon. Paid/Not
// Paid is read straight from Salary Working's / Incentive Working's own Payment Status for every
// employee that month — an item only shows Paid here once every employee with an amount due that
// month has actually been marked Paid on the sheet itself, so this can never say "done" while
// someone's payment is still sitting outstanding.
function autoSalaryIncentiveDueItemsFor(salonId,monthsBack){
  monthsBack=monthsBack||4;
  const salonRec=getSalonRecordById(salonId);
  const salaryDueDay=Number(salonRec&&salonRec.salaryDueDay)||7;
  const incentiveDueDay=Number(salonRec&&salonRec.incentiveDueDay)||10;
  const today=new Date();
  const swMeta=loadSWMeta(salonId);
  const iwMeta=loadIWMeta(salonId);
  const overrides=loadDueAutoOverrides(salonId);
  const items=[];
  for(let i=monthsBack-1;i>=0;i--){
    const cal=addMonths(today.getFullYear(),today.getMonth(),-i);
    const label=new Date(cal.year,cal.month,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'});

    const workings=swWorkingsFor(salonId,cal.year,cal.month).filter(e=>e.net>0);
    if(workings.length){
      const netTotal=workings.reduce((s,e)=>s+e.net,0);
      const salaryId='auto-salary-'+cal.year+'-'+cal.month;
      const ov=overrides[salaryId]||{};
      // Paid if every employee's own Payment Status on Salary Working says Paid — or, failing
      // that, if it was marked Paid by hand right here (e.g. paid through a channel Salary
      // Working itself doesn't track). Real per-employee data wins whenever it's actually there.
      const metaPaid=workings.every(e=>{const m=swMeta[attMonthKey(e.id,cal.year,cal.month)];return m&&m.paymentStatus==='Paid';});
      const paid=metaPaid||!!ov.paid;
      const due=statutoryDueDateFor(cal.year,cal.month,salaryDueDay);
      items.push({id:salaryId,auto:true,type:'Salary Disbursement',year:cal.year,month:cal.month,
        desc:'Salary for '+label+' — '+workings.length+' employee(s)',due,amount:Math.round(netTotal),
        paid,paidAmount:paid?(ov.paidAmount||Math.round(netTotal)):'',paidDate:paid?(ov.paidDate||''):'',ref:ov.ref||'',bankRowId:ov.bankRowId!=null?ov.bankRowId:null,status:dueStatusFor(due,paid)});
    }

    const incData=incWorkingsFor(salonId,cal.year,cal.month).filter(e=>e.totalInc>0);
    if(incData.length){
      const incTotal=incData.reduce((s,e)=>s+e.totalInc,0);
      const incId='auto-incentive-'+cal.year+'-'+cal.month;
      const ov=overrides[incId]||{};
      const metaPaid=incData.every(e=>{const m=iwMeta[attMonthKey(e.id,cal.year,cal.month)];return m&&m.paymentStatus==='Paid';});
      const paid=metaPaid||!!ov.paid;
      const due=statutoryDueDateFor(cal.year,cal.month,incentiveDueDay);
      items.push({id:incId,auto:true,type:'Incentive Payment',year:cal.year,month:cal.month,
        desc:'Incentive for '+label+' — '+incData.length+' employee(s)',due,amount:Math.round(incTotal),
        paid,paidAmount:paid?(ov.paidAmount||Math.round(incTotal)):'',paidDate:paid?(ov.paidDate||''):'',ref:ov.ref||'',bankRowId:ov.bankRowId!=null?ov.bankRowId:null,status:dueStatusFor(due,paid)});
    }
  }
  return items;
}
// Vendor Sheet payables, grouped one item PER VENDOR (not per invoice) — every open invoice for
// that vendor rolled into one due item, using the earliest of their own due dates to drive
// urgency. Marking this Paid in the Due Date Tracker doesn't set a status flag the way PF/ESIC/
// TDS do — it records a REAL payment against each checked invoice directly in Vendor Sheet (same
// as recording a payment there by hand), so a vendor's group shrinks and eventually disappears
// on its own as invoices actually get settled — nothing extra to keep in sync.
function autoVendorDueItemsFor(salonId){
  const vendorsList=loadVendors(salonId);
  const invoices=loadVendorInvoices(salonId);
  const byVendor={};
  invoices.forEach((inv,idx)=>{
    if(inv.docNature==='Performa Invoice')return;
    const paidSoFar=(inv.payments||[]).reduce((s,p)=>s+(Number(p.paidAmount)||0),0);
    const outstanding=Math.round((Number(inv.amount)||0)-paidSoFar);
    if(outstanding<=0)return;
    const vendor=vendorsList.find(v=>v.id===inv.vendorId);
    const vendorName=vendor?vendor.name:(inv.vendorId||'Unknown Vendor');
    const category=inv.category||(vendor?vendor.cat:'')||'Uncategorized';
    const due=toISO(inv.dueDate)||toISO(inv.invoiceDate)||'';
    const key=inv.vendorId!=null?String(inv.vendorId):'unknown';
    if(!byVendor[key])byVendor[key]={vendorId:inv.vendorId,vendorName,invoices:[]};
    byVendor[key].invoices.push({invId:inv.id,invoiceNo:inv.invoiceNo||'—',category,due,outstanding});
  });
  const items=[];
  Object.keys(byVendor).forEach(key=>{
    const grp=byVendor[key];
    const total=grp.invoices.reduce((s,i)=>s+i.outstanding,0);
    if(total<=0)return;
    const dues=grp.invoices.map(i=>i.due).filter(Boolean).sort();
    const due=dues[0]||''; // earliest of this vendor's open invoices drives urgency
    const cats=Array.from(new Set(grp.invoices.map(i=>i.category)));
    const id='auto-vendor-'+key;
    items.push({id,auto:true,type:'Vendor Payment',vendorKey:key,
      desc:grp.vendorName+' — '+cats.join(', ')+' — '+grp.invoices.length+' invoice'+(grp.invoices.length===1?'':'s')+' outstanding',
      due,amount:total,paid:false,paidAmount:'',paidDate:'',ref:'',bankRowId:null,status:dueStatusFor(due,false)});
  });
  return items;
}
// Electricity/Telephone bills flagged by needsAmountUpdate() — surfaced here too, not just as a
// badge on the Recurring Expenses list, since Due Date Sheet is where the person already looks
// for "what needs attention this month."
function autoAmountUpdateReminders(salonId){
  const overrides=loadDueAutoOverrides(salonId);
  const items=[];
  loadRecurringExpenses(salonId).filter(it=>it.status==='Active'&&needsAmountUpdate(it)).forEach(it=>{
    const dayField=it.expenseName==='Electricity Expenses'?it.invoiceCreationDay:it.telephoneInvoiceCreationDay;
    const lastInvoiceDate=mostRecentInvoiceCreationDate(dayField);
    const due=lastInvoiceDate?localDateToISO(lastInvoiceDate):'';
    const id='auto-amtupdate-'+it.id;
    const ov=overrides[id]||{};
    items.push({id,auto:true,type:'Update Amount',desc:it.expenseName+' — '+it.payee+' — bill varies each cycle, confirm the latest Taxable Amount',due,amount:Number(it.amount)||0,paid:!!ov.paid,paidAmount:ov.paidAmount||'',paidDate:ov.paidDate||'',ref:ov.ref||'',bankRowId:ov.bankRowId!=null?ov.bankRowId:null,status:dueStatusFor(due,ov.paid)});
  });
  return items;
}

// ── Audit Log viewer — who/what/when for Employees, Vendor Invoices, and P&L Overrides, the
// three highest-stakes screens logAuditEvent() is wired into so far. Read-only by design (the
// point of an audit trail is that it isn't itself editable); filter by entity and search by name. ──
function AuditLogSheet({salon}={}){
  const salonId=salon?.id;
  const [tick,setTick]=useState(0);
  const log=useMemo(()=>loadAuditLog(salonId),[salonId,tick]);
  const [filterEntity,setFilterEntity]=useState('all');
  const [search,setSearch]=useState('');
  const entities=['all',...Array.from(new Set(log.map(e=>e.entity)))];
  const filtered=log.filter(e=>(filterEntity==='all'||e.entity===filterEntity)&&(!search||((e.summary||'')+(e.user||'')).toLowerCase().includes(search.toLowerCase())));

  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Audit Log'),
        React.createElement('div',{className:'page-sub'},'Who changed what, and when — covers Master Salary, Vendor Invoices, and P&L Overrides. Last 500 events for this outlet.')
      ),
      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setTick(t=>t+1)},'⟳ Refresh')
    ),
    React.createElement('div',{style:{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}},
      React.createElement('select',{className:'form-control',style:{width:'auto'},value:filterEntity,onChange:e=>setFilterEntity(e.target.value)},
        entities.map(e=>React.createElement('option',{key:e,value:e},e==='all'?'All Types':e))),
      React.createElement('input',{className:'form-control',style:{maxWidth:260},placeholder:'Search by name or user…',value:search,onChange:e=>setSearch(e.target.value)})
    ),
    filtered.length===0
      ?React.createElement('div',{className:'card',style:{textAlign:'center',padding:32,color:'var(--text3)'}},log.length===0?'No audit events recorded yet for this outlet — they\'ll show up here as Employees, Vendor Invoices, and P&L Overrides are added or edited.':'Nothing matches this filter.')
      :React.createElement('div',{className:'card',style:{padding:0,overflow:'hidden'}},
          React.createElement('div',{style:{overflowX:'auto'}},
            React.createElement('table',null,
              React.createElement('thead',null,React.createElement('tr',null,['When','User','Type','Action','Details'].map(h=>React.createElement('th',{key:h},h)))),
              React.createElement('tbody',null,filtered.map((e,i)=>React.createElement('tr',{key:i},
                React.createElement('td',{style:{whiteSpace:'nowrap',fontSize:11.5,color:'var(--text3)'}},new Date(e.ts).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})),
                React.createElement('td',null,e.user+(e.role?' ('+e.role+')':'')),
                React.createElement('td',null,React.createElement('span',{className:'badge badge-blue'},e.entity)),
                React.createElement('td',null,React.createElement('span',{className:'badge '+(e.action==='Deleted'?'badge-red':e.action==='Added'?'badge-green':'badge-amber')},e.action)),
                React.createElement('td',{style:{fontSize:12.5,color:'var(--text2)'}},e.summary)
              )))
            )
          )
        )
  );
}

// Plain-language hint for each Due Date Tracker type — shown as a hover tooltip on the type
// label, since "PF Challan"/"ESIC Challan"/"PT Payment"/"TDS Payment" are all statutory jargon a
// salon owner (as opposed to their CA) may not immediately recognize.
const DUE_TYPE_HINTS={
  'PF Challan':'Provident Fund — the monthly retirement-savings payment (employee + employer share) due to EPFO.',
  'ESIC Challan':'Employees\' State Insurance — monthly medical/injury insurance payment for lower-wage employees.',
  'PT Payment':'Professional Tax — a small state-government tax on salaries, only in states that levy it.',
  'TDS Payment':'Tax Deducted at Source — tax withheld from salary/vendor payments, remitted to the government.',
  'GST Filing':'Goods & Services Tax return — the periodic filing reporting GST collected and paid.',
};