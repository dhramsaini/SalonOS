// ════════════════════════════════════════════════════════════════════════════════════════════════
// Multiple bank accounts per outlet (Controls → Bank mapping → multiBank).
// Master Sheet → Bank Details is the Primary account (the fields there, as before); more accounts are
// added under it. The list lives in salonos_bank_accounts_outlet_<id> — the same list the guided
// statement download uses — so there is one list everywhere. {id:'primary'} in that list only holds
// extras for the Primary (login address, type, label, settlements); its bank and account number
// always come from Master Sheet.
// Every Bank Statement row carries acct (the account id). Rows imported before this have none and
// belong to the Primary. Upload asks which account the file is for; append / replace / duplicate
// check work inside that account only; the table can be filtered by account; each account has its
// own Tally bank ledger (map.bankLedgers[id], Primary = map.bankLedger).
// ════════════════════════════════════════════════════════════════════════════════════════════════
const MB_TYPES=['Current','Savings','OD / CC','Salary','NRE / NRO','Other'];
function mbOn(sid){return typeof controlOn==='function'&&controlOn('multiBank',sid);}
function mbKey(sid){return outletKey('salonos_bank_accounts',sid);}
function mbRaw(sid){try{const a=JSON.parse(cachedLocalGet(mbKey(sid))||'[]');return Array.isArray(a)?a.filter(x=>x&&x.id):[];}catch(e){return[];}}
function mbSaveRaw(sid,list){safeLocalSet(mbKey(sid),JSON.stringify(list));}
const mbLast4=x=>String(x||'').replace(/\D/g,'').slice(-4);
function mbAccounts(sid){
  const o=outletSettings(sid)||{};const raw=mbRaw(sid);
  const hasSalonBank=!!(o.bankName||o.bankAccountNo);
  if(!hasSalonBank){
    // No bank in Master Sheet yet: the first saved account is the Primary.
    return raw.map((a,i)=>({...a,primary:i===0,last4:a.last4||mbLast4(a.accountNo)}));
  }
  const p4=mbLast4(o.bankAccountNo);
  const ex=raw.find(a=>a.id==='primary')||{};
  // An account saved earlier (guided download) for the same account number is the Primary itself.
  const same=raw.find(a=>a.id!=='primary'&&p4&&mbLast4(a.last4||a.accountNo)===p4);
  const prim={...(same||{}),...ex,id:'primary',primary:true,bank:o.bankName||ex.bank||(same&&same.bank)||'',accountNo:o.bankAccountNo||'',ifsc:o.bankIFSC||'',branch:o.bankBranch||'',holder:o.bankAccountHolder||'',last4:p4||ex.last4||''};
  if(!prim.label)prim.label=prim.bank+(prim.type?' '+prim.type:'');
  return[prim,...raw.filter(a=>a.id!=='primary'&&a!==same).map(a=>({...a,primary:false,last4:a.last4||mbLast4(a.accountNo)}))];
}
function mbPrimaryId(sid){const a=mbAccounts(sid);return a.length?a[0].id:'primary';}
function mbAcctOf(r,sid){return(r&&r.acct)||mbPrimaryId(sid);}
function mbLabel(a){if(!a)return'';const l=String(a.label||a.bank||'Bank').trim();return l+(a.last4&&!l.includes(a.last4)?' ••'+a.last4:'');}
function mbFind(sid,id){return mbAccounts(sid).find(a=>a.id===id)||null;}
// Only the rows of one account (acct id, or all when id is falsy / the switch is off).
function mbRowsOf(sid,rows,id){if(!id||!mbOn(sid))return rows||[];const p=mbPrimaryId(sid);return(rows||[]).filter(r=>((r&&r.acct)||p)===id);}
// Card / UPI settlement lines count for Collection Reco only from accounts that receive settlements.
function mbSettleRows(sid,rows){
  if(!mbOn(sid))return rows||[];const acc=mbAccounts(sid);if(!acc.some(a=>a.settle===false))return rows||[];
  const p=acc.length?acc[0].id:'primary';const no=new Set(acc.filter(a=>a.settle===false).map(a=>a.id));
  return(rows||[]).filter(r=>!(r&&(r.nature==='Card Settlement'||r.nature==='UPI Settlement')&&no.has(r.acct||p)));
}
// Can this line be a card / UPI settlement? No when its account has "Card/UPI settlements land here" unticked.
function mbSettleAcctOk(sid,r){
  if(!r||!mbOn(sid))return true;const acc=mbAccounts(sid);const a=acc.find(x=>x.id===((r&&r.acct)||(acc[0]&&acc[0].id)));return !(a&&a.settle===false);
}
// Rows grouped by account: [[id, rows]] (one group when the switch is off).
function mbGroups(sid,rows){if(!mbOn(sid))return[['all',rows||[]]];const p=mbPrimaryId(sid);const g={};(rows||[]).forEach(r=>{const k=(r&&r.acct)||p;(g[k]=g[k]||[]).push(r);});return Object.entries(g);}
// The statement format (Bank Statement → BANKS) that fits an account's bank name.
function mbFormatFor(a,banks){
  if(!a||!banks)return'';const n=x=>String(x||'').toLowerCase().replace(/[^a-z]/g,'');const b=n(a.bank);if(!b)return'';
  return Object.keys(banks).find(k=>k!=='Generic'&&n(k)===b)||Object.keys(banks).find(k=>k!=='Generic'&&(b.includes(n(k))||n(k).includes(b)))||'';
}
// The account number printed in the file against the chosen account: a warning, or ''; throws when the
// number is another saved account's.
function mbHeaderWarning(sid,id,acNo){
  const d4=mbLast4(acNo);if(!d4||/[xX*]{4,}$/.test(String(acNo||'')))return'';
  const acc=mbAccounts(sid);const a=acc.find(x=>x.id===id);if(!a||!a.last4||a.last4===d4)return'';
  const other=acc.find(x=>x.last4===d4);
  // The file belongs to another saved account: refuse (loadWorkbook throws this).
  if(other)throw new Error('This statement is for '+mbLabel(other)+' (account no. ending '+d4+'), not '+mbLabel(a)+'. Choose '+mbLabel(other)+' above and upload it again.');
  return'⚠ The file shows account no. ending '+d4+', but '+mbLabel(a)+' ends '+a.last4+' — check this is the right account';
}
// Tally bank ledger for a row: its account's own ledger, else the Primary's (map.bankLedger).
function tallyRowBankLedger(map,r){const m=map||{};return(r&&r.acct&&r.acct!=='primary'&&m.bankLedgers&&m.bankLedgers[r.acct])||m.bankLedger||'';}
// Accounts (other than the Primary) that have rows here but no Tally ledger yet: labels.
function mbTallyGap(sid,map,rows){
  if(!mbOn(sid))return[];const p=mbPrimaryId(sid);const m=map||{};const ids=new Set();
  (rows||[]).forEach(r=>{const k=(r&&r.acct)||p;if(k!==p&&!(m.bankLedgers&&m.bankLedgers[k]))ids.add(k);});
  return[...ids].map(id=>mbLabel(mbFind(sid,id))||'a removed bank account');
}
// Latest closing balance per account, added up: {b, iso} or null. asOfIso optional.
function mbLatestBalance(sid,rows,asOfIso){
  let tot=0,any=false,last='';
  mbGroups(sid,rows).forEach(([,rs])=>{
    const L=rs.map(r=>({iso:toISO(r.transactionDate||r.date),b:r.closingBalance})).filter(x=>x.iso&&(!asOfIso||x.iso<=asOfIso)&&x.b!=null&&x.b!==''&&!isNaN(Number(x.b))).sort((a,b)=>a.iso.localeCompare(b.iso));
    if(L.length){any=true;tot+=Number(L[L.length-1].b);if(L[L.length-1].iso>last)last=L[L.length-1].iso;}
  });
  return any?{b:tot,iso:last}:null;
}

// ── Master Sheet → Bank Details: other bank accounts (saved straight away) ──
function MbMasterAccounts({sid}){
  const h=React.createElement;const [,t]=useState(0);const [form,setForm]=useState(null);const [msg,setMsg]=useState('');
  if(sid==null||sid===''||!mbOn(sid))return null;
  const acc=mbAccounts(sid);const raw=mbRaw(sid);
  const put=(list)=>{mbSaveRaw(sid,list);t(x=>x+1);};
  const setExtra=(id,patch)=>{const has=raw.some(a=>a.id===id);put(has?raw.map(a=>a.id===id?{...a,...patch}:a):[...raw,{id,...patch}]);};
  const save=()=>{
    const f=form;const bank=String(f.bank||'').trim();const no=String(f.accountNo||'').replace(/\s/g,'');
    if(!bank){setMsg('Choose the bank.');return;}
    if(!no&&!mbLast4(f.last4)){setMsg('Enter the account number.');return;}
    if(f.ifsc&&typeof isValidIfscFormat==='function'&&!isValidIfscFormat(f.ifsc)){setMsg('IFSC does not look right (e.g. HDFC0001234).');return;}
    const l4=mbLast4(no)||mbLast4(f.last4);
    if(acc.some(a=>a.id!==f.id&&a.last4&&a.last4===l4&&(!no||!a.accountNo||String(a.accountNo).replace(/\s/g,'')===no))){setMsg('This account is already in the list.');return;}
    const clean={...(raw.find(a=>a.id===f.id)||{}),id:f.id||('ba'+Date.now().toString(36)),bank,accountNo:no,last4:l4,ifsc:String(f.ifsc||'').toUpperCase().trim(),branch:String(f.branch||'').trim(),
      holder:String(f.holder||'').trim(),type:f.type||'Current',label:String(f.label||'').trim()||bank+' '+(f.type||'Current'),settle:f.settle!==false};
    put(f.id?raw.map(a=>a.id===f.id?clean:a):[...raw,clean]);setForm(null);setMsg('Saved '+mbLabel(clean)+'.');
  };
  const remove=(a)=>{
    const n=(typeof loadBankStatementRows==='function'?loadBankStatementRows(sid):[]).filter(r=>r.acct===a.id).length;
    if(n){window.alert(mbLabel(a)+' has '+n+' statement line'+(n===1?'':'s')+' in Bank Statement. Remove those lines first (filter by this bank there), then remove the account.');return;}
    if(!window.confirm('Remove '+mbLabel(a)+' from this outlet?'))return;put(raw.filter(x=>x.id!==a.id));
  };
  const lookup=async()=>{if(!form||!form.ifsc||typeof fetchIfscDetails!=='function')return;try{const d=await fetchIfscDetails(form.ifsc);if(d)setForm(f=>({...f,bank:f.bank||d.BANK||'',branch:f.branch||((d.BRANCH||'')+(d.CITY?', '+d.CITY:''))}));}catch(e){}};
  const F=(label,el)=>h('div',{className:'form-group',style:{marginBottom:8}},h('label',null,label),el);
  const inp=(k,ph,extra)=>h('input',{className:'form-control',value:form[k]||'',placeholder:ph||'',onChange:e=>setForm({...form,[k]:e.target.value}),...(extra||{})});
  return h('div',{style:{marginBottom:14}},
    h('div',{style:{display:'flex',alignItems:'center',gap:8,margin:'4px 0 8px'}},
      h('div',{style:{fontSize:12,fontWeight:700,color:'var(--text2)'}},'🏦 Bank accounts of this outlet ('+acc.length+')'),
      h('button',{type:'button',className:'btn btn-ghost btn-sm',style:{marginLeft:'auto'},onClick:()=>{setMsg('');setForm({id:'',bank:'',accountNo:'',ifsc:'',branch:'',holder:'',type:'Current',label:'',settle:true});}},'+ Add bank account')),
    h('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:8}},'The bank above is the Primary account. Accounts added here appear in Bank Statement when you upload a statement, and each gets its own Tally bank ledger. Changes here are saved straight away.'),
    h('div',{style:{display:'flex',flexDirection:'column',gap:6}},acc.map(a=>h('div',{key:a.id,style:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:'8px 12px',borderRadius:'var(--r)',border:'1px solid var(--border)',background:'var(--bg3)',fontSize:12.5}},
      h('b',null,mbLabel(a)),a.primary&&h('span',{className:'badge badge-blue'},'Primary'),
      h('span',{style:{color:'var(--text3)'}},[a.bank,a.type,a.accountNo?'A/c '+a.accountNo:'',a.ifsc].filter(Boolean).join(' · ')),
      h('label',{style:{marginLeft:'auto',display:'flex',alignItems:'center',gap:5,fontSize:11.5,cursor:'pointer'},title:'Card / UPI settlement credits of this account are matched in Collection Reco'},
        h('input',{type:'checkbox',checked:a.settle!==false,onChange:e=>setExtra(a.id,{settle:e.target.checked})}),'Card/UPI settlements land here'),
      !a.primary&&h('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:()=>{setMsg('');setForm({...a});}},'Edit'),
      !a.primary&&h('button',{type:'button',className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>remove(a)},'Remove')))),
    form&&h('div',{style:{marginTop:10,padding:12,borderRadius:'var(--r)',border:'1px solid rgba(47,95,224,0.35)',background:'rgba(47,95,224,0.05)'}},
      h('div',{className:'form-row cols3'},
        F('Bank *',h(BankNameField,{value:form.bank,ifsc:form.ifsc,onChange:v=>setForm(f=>({...f,bank:v}))})),
        F('Account Number *',inp('accountNo','Account number')),
        F('IFSC Code',inp('ifsc','HDFC0001234',{style:{textTransform:'uppercase'},onBlur:lookup}))),
      h('div',{className:'form-row cols3'},
        F('Branch',inp('branch','Auto-filled from IFSC')),
        F('Account Holder Name',inp('holder','As per bank records')),
        F('Account Type',h('select',{className:'form-control',value:form.type||'Current',onChange:e=>setForm({...form,type:e.target.value})},MB_TYPES.map(x=>h('option',{key:x,value:x},x))))),
      h('div',{className:'form-row cols2'},
        F('Short name (shown in Bank Statement)',inp('label','e.g. SBI Current')),
        h('label',{style:{display:'flex',alignItems:'center',gap:6,fontSize:12,marginTop:22,cursor:'pointer'}},h('input',{type:'checkbox',checked:form.settle!==false,onChange:e=>setForm({...form,settle:e.target.checked})}),'Card/UPI settlements land in this account')),
      h('div',{style:{display:'flex',gap:8,marginTop:4}},
        h('button',{type:'button',className:'btn btn-primary btn-sm',onClick:save},form.id?'Save changes':'Add account'),
        h('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:()=>{setForm(null);setMsg('');}},'Cancel'))),
    msg&&h('div',{style:{fontSize:11.5,marginTop:6,color:/^Saved/.test(msg)?'var(--green)':'var(--orange)'}},msg));
}

// ── Bank Statement: "Which bank account is this statement for?" ──
function MbUploadPicker({sid,value,onChange,rows}){
  const h=React.createElement;if(!mbOn(sid))return null;const acc=mbAccounts(sid);
  if(!acc.length)return h('div',{style:{fontSize:12,color:'var(--orange)',marginBottom:12}},'No bank account in Master Sheet → Bank Details yet — add one so statements are kept against it.');
  const p=acc[0].id;const n=id=>(rows||[]).filter(r=>((r&&r.acct)||p)===id).length;
  return h('div',{style:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:12,padding:'10px 12px',borderRadius:'var(--r)',border:'1px solid rgba(47,95,224,0.35)',background:'rgba(47,95,224,0.05)'}},
    h('label',{htmlFor:'mb-up-acct',style:{fontSize:12.5,fontWeight:700}},'Which bank account is this statement for?'),
    h('select',{id:'mb-up-acct',className:'form-control',style:{width:'auto',minWidth:240,fontSize:12.5},value:value||p,onChange:e=>onChange(e.target.value)},
      acc.map(a=>h('option',{key:a.id,value:a.id},mbLabel(a)+(a.primary?' (Primary)':'')+' — '+n(a.id)+' line'+(n(a.id)===1?'':'s')))),
    h('span',{style:{fontSize:11,color:'var(--text3)'}},'Append, fresh upload and the duplicate check apply to this account only. Add accounts in Master Sheet → Bank Details.'));
}

// ── Bank Statement: filter the table by account ──
function MbFilterChips({sid,rows,value,onChange}){
  const h=React.createElement;if(!mbOn(sid))return null;const acc=mbAccounts(sid);const p=acc.length?acc[0].id:'primary';
  const count=id=>(rows||[]).filter(r=>((r&&r.acct)||p)===id).length;
  const used=acc.filter(a=>count(a.id)>0||a.id===value);const orphan=[...new Set((rows||[]).map(r=>r&&r.acct).filter(x=>x&&!acc.some(a=>a.id===x)))];
  if(used.length+orphan.length<2&&(!value||value==='all'))return null;
  const chip=(id,label,n)=>h('button',{key:id,onClick:()=>onChange(id),style:{fontSize:11.5,padding:'5px 11px',borderRadius:20,cursor:'pointer',border:'1px solid '+(value===id?'var(--accent)':'var(--border2)'),background:value===id?'var(--accent)':'transparent',color:value===id?'#fff':'var(--text2)',display:'inline-flex',gap:5,alignItems:'center'}},label,h('span',{style:{fontSize:10,opacity:0.75}},'('+n+')'));
  return h('div',{style:{marginBottom:12}},
    h('div',{style:{fontSize:10.5,color:'var(--text3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:6}},'Bank account'),
    h('div',{style:{display:'flex',flexWrap:'wrap',gap:6}},chip('all','All banks',(rows||[]).length),...used.map(a=>chip(a.id,'🏦 '+mbLabel(a),count(a.id))),...orphan.map(id=>chip(id,'Removed account',count(id)))));
}
function mbRowTag(sid,r){
  if(!mbOn(sid))return null;const acc=mbAccounts(sid);if(acc.length<2)return null;const a=acc.find(x=>x.id===((r&&r.acct)||acc[0].id));
  return React.createElement('div',{style:{fontSize:10,color:'var(--accent)',marginTop:2,fontWeight:600}},'🏦 '+(a?mbLabel(a):'Removed account'));
}

// ── Tally Integration → Ledgers: a bank ledger for every other account ──
function MbTallyLedgers({sid,map,updateMap,ledgers,inTally}){
  const h=React.createElement;if(!mbOn(sid))return null;const acc=mbAccounts(sid).slice(1);if(!acc.length)return null;
  const bankL=(ledgers||[]).filter(l=>/bank|o\.?d\b|occ|cash credit|\bcc\b/i.test(String(l.parent||''))&&!/cash-in-hand/i.test(String(l.parent||'')));
  const suggest=a=>{const w=String(a.bank||'').toLowerCase().split(/[^a-z]+/).filter(x=>x.length>2&&!['bank','of','the','india','ltd','limited'].includes(x));
    return bankL.filter(l=>l.name!==map.bankLedger&&((a.last4&&String(l.name).replace(/\D/g,'').includes(a.last4))||w.some(x=>String(l.name).toLowerCase().includes(x)))).slice(0,2);};
  const set=(id,v)=>updateMap({...map,bankLedgers:{...(map.bankLedgers||{}),[id]:v}});
  return h('div',{style:{flexBasis:'100%',display:'flex',flexDirection:'column',gap:8,marginTop:6}},
    h('div',{style:{fontSize:11.5,color:'var(--text3)'}},'The ledger above is for the Primary bank account. Other bank accounts of this outlet:'),
    acc.map(a=>{const v=(map.bankLedgers||{})[a.id]||'';const it=v&&inTally?inTally(v):null;return h('div',{key:a.id,style:{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}},
      h('div',{style:{width:200,fontSize:12.5,fontWeight:600}},'🏦 '+mbLabel(a)),
      h('input',{className:'form-control',style:{width:300},list:'tally-ledger-names',placeholder:'e.g. '+(a.bank||'Bank')+' - '+(a.type||'Current')+' A/c',value:v,onChange:e=>set(a.id,e.target.value)}),
      it!==null&&v&&h('span',{style:{fontSize:12,color:it?'var(--green)':'var(--orange)'}},it?'✓ in Tally':'Not in Tally yet — it will be created'),
      !v&&suggest(a).map(l=>h('button',{key:l.name,className:'btn btn-ghost btn-sm',onClick:()=>set(a.id,l.name)},'Use “'+l.name+'”')));}));
}

if(typeof HELP_TOPICS!=='undefined'&&Array.isArray(HELP_TOPICS)&&!HELP_TOPICS.some(t=>t.title==='More than one bank account'))HELP_TOPICS.push({title:'More than one bank account',body:[
  '<b>Add accounts</b>: Master Sheet → Bank Details. The bank there is the Primary account; add more with “+ Add bank account”.',
  '<b>Upload</b>: in Bank Statement choose the account first. Append, fresh upload and the duplicate check work for that account only. Lines imported earlier belong to the Primary.',
  '<b>View</b>: the Bank account chips above the table show one account or all of them.',
  '<b>Tally</b>: Tally Integration → Ledgers — give each account its own bank ledger; bank vouchers post to the right one.',
  '<b>Collection Reco</b>: untick “Card/UPI settlements land here” for an account that never receives card or UPI money.',
  '<b>Switch</b>: Master Settings → Controls → Bank mapping → Multiple bank accounts.'
]});
