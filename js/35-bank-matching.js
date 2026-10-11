// ═══ Bank mapping — matching helpers (reversals, bill ↔ bank, other outlets, recurring, quick map, paste, payee
// learning, Tally pull, bill combos, loans, payee names, own accounts) ═══
// Split out of js/32-bank-mapper.js. Loaded after js/32.

// ── Paste from Excel: header row with Narration / Ref and Nature (Date, Amount, Vendor, Date as per Cradlee optional) ──
function parseBankPaste(text){
  const lines=String(text||'').replace(/\r/g,'').split('\n').filter(l=>l.trim());if(!lines.length)return{rows:[],error:'Paste the rows first.'};
  const split=l=>l.includes('\t')?l.split('\t'):l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c=>c.replace(/^"|"$/g,''));
  const H=split(lines[0]).map(c=>c.trim().toLowerCase());const find=re=>H.findIndex(c=>re.test(c));
  const col={cradlee:find(/cradlee/)};col.date=H.findIndex((c,i)=>/date/.test(c)&&i!==col.cradlee);col.key=find(/ref|narration|description|particular|remark/);
  col.amount=find(/amount/);col.debit=find(/debit|withdraw/);col.credit=find(/credit|deposit/);col.nature=find(/nature|head|ledger/);col.vendor=find(/vendor|party/);
  let start=1;
  if(col.nature<0){if(split(lines[0]).length===2){Object.keys(col).forEach(k=>col[k]=-1);col.key=0;col.nature=1;start=0;}else return{rows:[],error:'Add a header row with at least a “Narration” (or “Ref”) and a “Nature” column.'};}
  if(col.key<0&&col.amount<0&&col.debit<0&&col.credit<0)return{rows:[],error:'Add a “Narration” / “Ref” or an “Amount” column so each row can be matched to a bank line.'};
  const num=v=>{const n=Number(String(v==null?'':v).replace(/[₹,\s]/g,''));return isFinite(n)&&n>0?n:0;};
  const cell=(c,i)=>i>=0?String(c[i]==null?'':c[i]).trim():'';
  const rows=lines.slice(start).map(l=>{const c=split(l);return{date:cell(c,col.date),key:cell(c,col.key),amount:num(cell(c,col.amount))||num(cell(c,col.debit))||num(cell(c,col.credit)),nature:cell(c,col.nature),vendor:cell(c,col.vendor),cradlee:cell(c,col.cradlee)};}).filter(r=>r.nature||r.key);
  return{rows,error:rows.length?'':'No rows found under the header.'};
}

function planBankPaste(sid,list,rowsAll,parsed){
  const vendors=loadVendors(sid)||[];const used=new Set();const rows=rowsAll||bankRowsFor(sid);
  return(parsed.rows||[]).map((p,i)=>{const base={i,p};
    const nat=BANK_MAP_NATURES.find(n=>n.toLowerCase()===String(p.nature||'').trim().toLowerCase());
    if(!nat)return{...base,status:'Nature “'+(p.nature||'')+'” is not in the list'};
    const k=String(p.key||'').trim().toLowerCase();const iso=p.date?toISO(p.date):'';
    const c=list.filter(x=>{if(used.has(x.id))return false;const r=rows.find(z=>z.id===x.id)||{};
      if(k&&!(String(r.refNo||'').trim().toLowerCase()===k||(x.description||'').toLowerCase().includes(k)))return false;
      if(p.amount&&Math.abs((x.debit||x.credit)-p.amount)>0.5)return false;
      if(iso&&toISO(x.date)!==iso)return false;return !!(k||p.amount);});
    if(!c.length)return{...base,status:'No unmapped line matches'};
    if(c.length>1)return{...base,status:c.length+' lines match — add the amount or date'};
    const x=c[0];
    if(!(x.side==='Credit'?BANK_CREDIT_NATURES.has(nat):!/Settlement$|^Collection$|^Interest$/.test(nat)))return{...base,x,status:nat+' is not for a '+x.side.toLowerCase()};
    const patch={nature:nat,aiTagged:false};
    if(nat==='Vendor Payment'&&p.vendor){const v=vendors.find(z=>String(z.name||'').trim().toLowerCase()===String(p.vendor).trim().toLowerCase());if(!v)return{...base,x,status:'Vendor “'+p.vendor+'” not found'};patch.vendorOverride=v.name;}
    if(nat==='Card Settlement'||nat==='UPI Settlement'){const ci=p.cradlee?toISO(p.cradlee):'';const d=ci?ci.split('-').reverse().join('/'):settlementDateFromNarration(x.description)||'';if(d)patch.cradleeDate=d;}
    used.add(x.id);return{...base,x,patch,status:'ok'};});
}

// ── Reversal pairs: a credit that gives back an earlier debit (failed NEFT, refund) ──
function bankReversalPairsFor(sid,list,rows){
  const out={};if(!controlOn('bankReversalPairs',sid))return out;const R=rows||bankRowsFor(sid);const ids=new Set(list.filter(x=>!x.nature).map(x=>x.id));
  const t=r=>{const i=toISO(r.transactionDate);return i?new Date(i+'T00:00:00').getTime():0;};const plain=r=>!r.linkedInvoice&&!(Array.isArray(r.linkedEmployeePay)&&r.linkedEmployeePay.length)&&!(Array.isArray(r.linkedAdvance)&&r.linkedAdvance.length)&&!r.reversalOf;
  const used=new Set();
  R.filter(r=>r&&Number(r.credit)>0&&ids.has(r.id)).forEach(c=>{const kw=/rev|return|rtn|refund|fail|rvsl|reject|unsucc/i.test(c.description||'');const sc=bmapSig(c.description);
    const cands=R.filter(d=>d&&Number(d.debit)>0&&!used.has(d.id)&&plain(d)&&!bankLineLocked(sid,d)&&Math.abs(Number(d.debit)-Number(c.credit))<=0.5&&t(d)<=t(c)&&t(c)-t(d)<=15*864e5
      &&(kw||(sc&&sc.length>=6&&bmapSig(d.description)===sc)||(c.refNo&&d.refNo&&String(c.refNo).trim()===String(d.refNo).trim()))).sort((a,b)=>t(b)-t(a));
    if(!cands.length)return;const d=cands[0];used.add(d.id);
    out[c.id]={other:d,kw};if(ids.has(d.id))out[d.id]={other:c,kw};});
  return out;
}

// ── Vendors: unpaid bills whose exact balance went out of the bank to that vendor (not yet linked) ──
function billBankMatches(sid){
  if(!controlOn('billReverseMatch',sid))return[];
  const inv=(loadVendorInvoices(sid)||[]).filter(i=>i&&i.docNature!=='Performa Invoice');const vendors=loadVendors(sid)||[];
  const bal=i=>Math.round(((Number(i.amount)||0)-(i.payments||[]).reduce((t,q)=>t+(Number(q.paidAmount)||0),0))*100)/100;
  const free=bankRowsFor(sid).filter(r=>r&&Number(r.debit)>0&&!r.linkedInvoice&&!(Array.isArray(r.linkedEmployeePay)&&r.linkedEmployeePay.length)&&!(Array.isArray(r.linkedAdvance)&&r.linkedAdvance.length)&&(!r.nature||r.nature==='Vendor Payment')&&!bankLineLocked(sid,r));
  const used=new Set();const out=[];
  inv.slice().sort((a,b)=>String(toISO(a.invoiceDate)||'').localeCompare(String(toISO(b.invoiceDate)||''))).forEach(i=>{const b=bal(i);if(!(b>0.5))return;const v=vendors.find(z=>String(z.id)===String(i.vendorId));if(!v)return;
    const bi=toISO(i.invoiceDate);const from=bi?new Date(new Date(bi+'T00:00:00').getTime()-7*864e5).toISOString().slice(0,10):'';
    const no=String(i.invoiceNo||'').trim().toLowerCase();
    const c=free.filter(r=>!used.has(r.id)&&Math.abs(Number(r.debit)-b)<=0.5&&(!from||String(toISO(r.transactionDate)||'')>=from)
      &&(bankLineVendorName(r,vendors)===v.name||(no.length>=3&&String(r.description||'').toLowerCase().includes(no))));
    if(c.length===1){used.add(c[0].id);out.push({inv:i,vendor:v,row:c[0],amount:b});}});
  return out;
}

function BillBankMatchStrip({salonId,onChanged}){
  const h=React.createElement;const [,setT]=useState(0);const [open,setOpen]=useState(false);
  if(salonId==null)return null;const L=billBankMatches(salonId);if(!L.length)return null;
  const m=n=>'₹'+Number(n).toLocaleString('en-IN',{maximumFractionDigits:2});
  const link=x=>{if(!mapApprovalOk(salonId,{id:x.row.id,debit:x.row.debit,date:x.row.transactionDate},'Link bill '+x.inv.invoiceNo))return;
    const err=linkBankLineToBills(salonId,x.row,x.vendor,[{id:x.inv.id,amount:x.amount}],null);if(err){window.alert(err);return;}
    journalBankMapping(salonId,x.row,'Linked from Vendors to '+x.inv.invoiceNo);setT(t=>t+1);if(onChanged)onChanged();};
  return h('div',{style:{background:'rgba(47,95,224,0.07)',border:'1px solid rgba(47,95,224,0.3)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,fontSize:12.5}},
    h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},'🏦 ',h('b',null,L.length+' unpaid bill'+(L.length===1?'':'s')),' already paid from the bank — the payment is in the bank statement but not linked.',
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setOpen(o=>!o)},open?'Hide':'Show & link'),
      L.length>1&&h('button',{className:'btn btn-primary btn-sm',onClick:()=>{if(!window.confirm('Link all '+L.length+' bills to their bank payments?'))return;L.forEach(link);}},'Link all')),
    open&&h('table',{style:{width:'100%',fontSize:12,marginTop:6}},h('tbody',null,L.map(x=>h('tr',{key:x.inv.id},
      h('td',null,x.vendor.name),h('td',null,'Bill '+(x.inv.invoiceNo||'—')+' · '+(x.inv.invoiceDate||'')),h('td',{style:{textAlign:'right'}},m(x.amount)),
      h('td',{style:{color:'var(--text3)'}},'⇄ '+x.row.transactionDate+' — '+String(x.row.description||'').slice(0,46)),
      h('td',null,h('button',{className:'btn btn-primary btn-sm',onClick:()=>link(x)},'Link')))))));
}

// ── Other outlets: unmapped look-alike lines (same side and narration pattern) ──
function bankOtherOutletMatches(sid,x){
  if(!controlOn('crossOutletMap',sid)||typeof SALONS==='undefined')return[];const sg=bmapSig(x.description);if(sg.length<6)return[];
  const u=currentSessionUser();
  return SALONS.filter(s=>s&&s.id!==sid&&s.status!=='Inactive'&&(typeof userCanSeeOutlet!=='function'||userCanSeeOutlet(u,s.id))).map(s=>{const vendors=loadVendors(s.id)||[];
    const ids=bankRowsFor(s.id).filter(r=>r&&((x.side==='Credit')===(Number(r.credit)>0))&&(Number(r.credit)>0||Number(r.debit)>0)&&bankLineProblem(r,vendors)==='No Nature'&&bmapSig(r.description)===sg).map(r=>r.id);
    return{sid:s.id,name:rptShort(s),ids};}).filter(o=>o.ids.length);
}

function mapOtherOutlets(groups,patch){
  let done=0,skipped=0;
  groups.forEach(g=>{const vendors=loadVendors(g.sid)||[];const rows=bankRowsFor(g.sid);
    g.ids.forEach(id=>{const r=rows.find(z=>z.id===id);if(!r)return;if(mapApprovalNeeded(g.sid,{id,debit:r.debit,credit:r.credit})){skipped++;return;}
      const pt={nature:patch.nature,aiTagged:false};if(patch.vendorOverride&&vendors.some(v=>v.name===patch.vendorOverride))pt.vendorOverride=patch.vendorOverride;
      if(pt.nature==='Card Settlement'||pt.nature==='UPI Settlement'){const d=settlementDateFromNarration(r.description)||bmapPrevDay(r.transactionDate);if(d)pt.cradleeDate=d;}
      journalBankMapping(g.sid,r,'Nature: '+pt.nature+' (from another outlet)');saveBankLineMapping(g.sid,id,pt);done++;});});
  return{done,skipped};
}

// ── Recurring payments not seen this month ──
function bankRecurringExpected(sid,year,month,rows){
  if(!controlOn('bankRecurringWatch',sid))return[];
  const R=(rows||bankRowsFor(sid)).filter(r=>r&&Number(r.debit)>0);const vendors=loadVendors(sid)||[];
  const mk=(y,m)=>y+'-'+String(m+1).padStart(2,'0');const prevs=[1,2,3,4].map(k=>{const d=new Date(year,month-k,1);return mk(d.getFullYear(),d.getMonth());});const cur=mk(year,month);
  const key=r=>{const n=String(r.nature||'');if(!n||n==='Split'||bankLineProblem(r,vendors))return'';const vn=(n==='Vendor Payment'||r.linkedInvoice)?bankLineVendorName(r,vendors):'';return n+'|'+(vn||bmapSig(r.description));};
  const g={};R.forEach(r=>{const ym=String(toISO(r.transactionDate)||'').slice(0,7);const k=key(r);if(!k)return;const e=g[k]=g[k]||{};(e[ym]=e[ym]||[]).push(r);});
  const curUn=R.filter(r=>String(toISO(r.transactionDate)||'').startsWith(cur)&&bankLineProblem(r,vendors));
  const today=new Date();const isCur=today.getFullYear()===year&&today.getMonth()===month;const past=new Date(year,month+1,1)<=today;
  const out=[];
  Object.keys(g).forEach(k=>{const byM=g[k];const hit=prevs.filter(pm=>byM[pm]);if(hit.length<3||byM[cur])return;
    const amts=hit.map(pm=>byM[pm].reduce((t,r)=>t+Number(r.debit),0)).sort((a,b)=>a-b);const med=amts[Math.floor(amts.length/2)];
    if(amts.some(a=>Math.abs(a-med)>med*0.25+1))return;
    const days=hit.map(pm=>Number(String(toISO(byM[pm][0].transactionDate)).slice(8,10))).sort((a,b)=>a-b);const day=days[Math.floor(days.length/2)];
    const i=k.indexOf('|');const sample=byM[hit[0]][0];const sigs=new Set(hit.flatMap(pm=>byM[pm].map(r=>bmapSig(r.description))));
    const pending=curUn.find(r=>sigs.has(bmapSig(r.description))&&Math.abs(Number(r.debit)-med)<=med*0.25+1);
    const status=pending?'In the statement — not mapped yet':past?'Not paid this month':isCur&&today.getDate()>day+3?'Overdue':'Due around the '+day+(day===1?'st':day===2?'nd':day===3?'rd':'th');
    out.push({key:k,nature:k.slice(0,i),who:k.slice(i+1),sample:sample.description||'',amount:Math.round(med),day,seen:hit.length,status,pendingId:pending?pending.id:null,
      late:!pending&&(past||(isCur&&today.getDate()>day+3))});});
  return out.sort((a,b)=>(b.late?1:0)-(a.late?1:0)||a.day-b.day);
}

// ⚡ Quick map: "rent sharma 100300" → the Nature (or vendor), words in the narration, the amount.
const BMAP_ALIASES={sal:'Salary',salary:'Salary',rent:'Rent',elec:'Electricity Expenses',electricity:'Electricity Expenses',bill:'Vendor Payment',vendor:'Vendor Payment',charges:'Bank Charges',chg:'Bank Charges',bank:'Bank Charges',card:'Card Settlement',upi:'UPI Settlement',adv:'Advance Salary',advance:'Advance Salary',phone:'Telephone & Internet Expenses',internet:'Telephone & Internet Expenses',cash:'Cash Deposit',interest:'Interest',refund:'Refund',tds:'TDS',gst:'GST',pf:'PF Payment',esic:'ESIC Payment',royalty:'Royalty',transfer:'Transfer',other:'Other',incentive:'Incentive'};

function bankQuickParse(sid,text,list){
  const toks=String(text||'').toLowerCase().split(/\s+/).filter(Boolean);if(!toks.length)return null;
  let nature=null,vendor=null;const rest=[];let amount=0;const vendors=loadVendors(sid)||[];
  toks.forEach(t=>{const n=t.replace(/[₹,]/g,'');if(/^\d+(\.\d+)?$/.test(n)&&Number(n)>0){amount=Number(n);return;}
    if(!nature){const al=BMAP_ALIASES[t];const nn=al||(t.length>=4?BANK_MAP_NATURES.find(z=>z.toLowerCase().startsWith(t)):null);if(nn){nature=nn;return;}}
    if(!vendor&&t.length>=3){const v=vendors.find(z=>z&&z.status!=='Inactive'&&String(z.name||'').toLowerCase().split(/\s+/).some(w=>w.startsWith(t)));if(v){vendor=v;rest.push(t);return;}}
    rest.push(t);});
  if(!nature&&vendor)nature='Vendor Payment';
  if(!nature)return{error:'Start with the Nature, e.g. “rent”, “sal”, “charges”, or a vendor name'};
  const words=rest.filter(w=>!(vendor&&String(vendor.name).toLowerCase().includes(w)));
  const okSide=x=>x.side==='Credit'?BANK_CREDIT_NATURES.has(nature):!/Settlement$|^Collection$|^Interest$/.test(nature);
  const c=list.filter(x=>okSide(x)&&(!amount||Math.abs((x.debit||x.credit)-amount)<=0.5)&&words.every(w=>(x.description||'').toLowerCase().includes(w))
    &&(!vendor||words.length||amount||bankLineVendorName({description:x.description,credit:x.credit},vendors)===vendor.name));
  const patch={nature,aiTagged:false};if(vendor&&nature==='Vendor Payment')patch.vendorOverride=vendor.name;
  return{nature,vendor,amount,words,cands:c,patch};
}

// ── Pull from Tally: bank vouchers already in Tally → map the matching lines and mark them as sent ──
function buildTallyDayBookRequestXml(fromIso,toIso){const d=s=>String(s).replace(/-/g,'');
  return '<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>Day Book</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>##SVCurrentCompany</SVCURRENTCOMPANY>'
    +'<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVFROMDATE TYPE="Date">'+d(fromIso)+'</SVFROMDATE><SVTODATE TYPE="Date">'+d(toIso)+'</SVTODATE></STATICVARIABLES></DESC></BODY></ENVELOPE>';}

function parseTallyBankVouchers(xmlText,bankLedger){
  const clean=String(xmlText||'').replace(/&#(?:[0-8]|1[0-2]|1[4-9]|2\d|3[01]);/g,'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
  let doc;try{doc=new DOMParser().parseFromString(clean,'text/xml');}catch(e){return[];}
  const bl=String(bankLedger||'').trim().toLowerCase();const txt=(el,tag)=>{const c=el.getElementsByTagName(tag)[0];return c?String(c.textContent||'').trim():'';};
  const out=[];
  [...doc.getElementsByTagName('VOUCHER')].forEach(v=>{
    const ents=[...v.children].filter(ch=>/^(ALL)?LEDGERENTRIES\.LIST$/.test(ch.tagName)).map(e=>({ledger:txt(e,'LEDGERNAME'),amount:Number(String(txt(e,'AMOUNT')).replace(/,/g,''))||0}));
    const bank=ents.find(e=>e.ledger.toLowerCase()===bl);if(!bank||!bank.amount)return;
    const other=ents.filter(e=>e!==bank).sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount))[0];
    const ds=txt(v,'DATE');const dmy=/^\d{8}$/.test(ds)?ds.slice(6,8)+'/'+ds.slice(4,6)+'/'+ds.slice(0,4):'';
    out.push({date:dmy,type:txt(v,'VOUCHERTYPENAME'),vno:txt(v,'VOUCHERNUMBER'),narration:txt(v,'NARRATION'),amount:Math.abs(bank.amount),side:bank.amount<0?'Credit':'Debit',ledger:other?other.ledger:''});});
  return out;
}

function natureFromTallyLedger(ledger,map,vendors){
  const L=String(ledger||'').trim().toLowerCase();if(!L)return null;const nm=(map&&map.natures)||{};
  for(const n of BANK_MAP_NATURES){const l=String(nm[n]||(TALLY_NATURE_LEDGERS[n]||[])[0]||'').trim().toLowerCase();if(l&&l===L)return{nature:n};}
  const vm=(map&&map.vendors)||{};const v=(vendors||[]).find(z=>z&&String(vm[z.id]||z.name||'').trim().toLowerCase()===L);if(v)return{nature:'Vendor Payment',vendorOverride:v.name};
  return null;
}

function planTallyPull(sid,list,rows,vouchers,map){
  const vendors=loadVendors(sid)||[];const used=new Set();const t=d=>{const i=toISO(d);return i?new Date(i+'T00:00:00').getTime():0;};
  return(vouchers||[]).map((v,i)=>{const base={i,v};
    const c=list.filter(x=>!used.has(x.id)&&x.side===v.side&&Math.abs((x.debit||x.credit)-v.amount)<=0.5&&Math.abs(t(x.date)-t(v.date))<=3*864e5).sort((a,b)=>Math.abs(t(a.date)-t(v.date))-Math.abs(t(b.date)-t(v.date)));
    if(!c.length)return{...base,status:'No unmapped bank line matches'};
    if(c.length>1&&Math.abs(t(c[0].date)-t(v.date))===Math.abs(t(c[1].date)-t(v.date)))return{...base,status:c.length+' bank lines match — map by hand'};
    const x=c[0];const nf=natureFromTallyLedger(v.ledger,map,vendors);
    if(!nf)return{...base,x,status:'Ledger “'+v.ledger+'” has no Nature in SalonOS (Tally Export → Ledgers)'};
    if(!(x.side==='Credit'?BANK_CREDIT_NATURES.has(nf.nature):!/Settlement$|^Collection$|^Interest$/.test(nf.nature)))return{...base,x,status:nf.nature+' is not for a '+x.side.toLowerCase()};
    const patch={...nf,aiTagged:false};if(patch.nature==='Card Settlement'||patch.nature==='UPI Settlement'){const d=settlementDateFromNarration(x.description)||bmapPrevDay(x.date);if(d)patch.cradleeDate=d;}
    used.add(x.id);return{...base,x,patch,status:'ok'};});
}

// ── Payee tokens (account numbers / UPI IDs in narrations) → employee / vendor ──
const PAYEE_TOKENS_KEY='salonos_bank_payee_tokens';

function payeeTokensOf(desc){const d=String(desc||'');const upi=(d.match(/[a-z0-9._-]{2,}@[a-z]{2,}/gi)||[]).map(t=>t.toLowerCase());
  const dig=d.replace(/[^0-9]/g,' ').split(/\s+/).filter(t=>t.length>=9&&t.length<=18);return[...new Set([...upi,...dig])];}

function loadPayeeTokens(){try{const v=JSON.parse(cachedLocalGet(PAYEE_TOKENS_KEY)||'{}');return v&&typeof v==='object'?{emp:v.emp||{},vendor:v.vendor||{}}:{emp:{},vendor:{}};}catch(e){return{emp:{},vendor:{}};}}

function learnPayeeTokens(sid,kind,id,desc){
  if(!controlOn('bankLearnPayees',sid))return;const toks=payeeTokensOf(desc);if(!toks.length)return;const T=loadPayeeTokens();const M=T[kind];
  toks.forEach(t=>{const e=M[t];if(!e)M[t]={sid,id:String(id),n:1};else if(e.id===String(id))e.n=(e.n||1)+1;else e.bad=true;});
  const keys=Object.keys(M);if(keys.length>5000)keys.slice(0,keys.length-5000).forEach(k=>delete M[k]);
  safeLocalSet(PAYEE_TOKENS_KEY,JSON.stringify(T));
}

function payeeByToken(kind,desc,list){
  const toks=payeeTokensOf(desc);if(!toks.length||!list||!list.length)return null;const M=loadPayeeTokens()[kind];const hits=new Set();
  toks.forEach(t=>{const e=M[t];if(!e||e.bad)return;if(!(t.includes('@')||(e.n||1)>=2))return;if(list.some(z=>z&&String(z.id)===e.id))hits.add(e.id);});
  if(hits.size!==1)return null;const id=[...hits][0];return list.find(z=>z&&String(z.id)===id)||null;
}

function vendorBankOffers(sid){
  if(!controlOn('vendorBankFromPayments',sid))return[];const vendors=loadVendors(sid)||[];const M=loadPayeeTokens().vendor;const rows=bankRowsFor(sid);
  return vendors.filter(v=>v&&v.status!=='Inactive').map(v=>{
    const mine=Object.keys(M).filter(t=>M[t].id===String(v.id)&&String(M[t].sid)===String(sid)&&!M[t].bad);
    const ac=!v.accountNo?mine.filter(t=>!t.includes('@')&&(M[t].n||1)>=2).sort((a,b)=>(M[b].n||1)-(M[a].n||1))[0]||'':'';
    const upi=!v.upi?mine.find(t=>t.includes('@'))||'':'';
    let ifsc='';if(!v.ifsc&&ac){const ln=rows.find(r=>String(r.description||'').includes(ac)&&/[A-Z]{4}0[A-Z0-9]{6}/.test(String(r.description||'').toUpperCase()));if(ln)ifsc=(String(ln.description).toUpperCase().match(/[A-Z]{4}0[A-Z0-9]{6}/)||[''])[0];}
    return(ac||upi)?{vendor:v,accountNo:ac,ifsc,upi}:null;}).filter(Boolean);
}

function saveVendorBankOffer(sid,o){const list=loadVendors(sid)||[];
  saveVendors(list.map(v=>v.id===o.vendor.id?{...v,...(o.accountNo?{accountNo:o.accountNo}:{}),...(o.ifsc?{ifsc:o.ifsc}:{}),...(o.upi?{upi:o.upi}:{})}:v),sid);
  try{logAuditEvent(sid,{entity:'Vendor',entityId:String(o.vendor.id),action:'Bank details saved from payments',summary:o.vendor.name+(o.accountNo?' · A/c …'+o.accountNo.slice(-4):'')+(o.ifsc?' · '+o.ifsc:'')+(o.upi?' · '+o.upi:'')});}catch(e){}}

// ── Fast re-render: a short signature of the rows' mapping (memo key) ──
function bankRowsSig(rows){let h=(rows||[]).length;(rows||[]).forEach(r=>{if(!r)return;const s=String(r.id)+'|'+(r.nature||'')+'|'+(r.vendorOverride||'')+'|'+(r.cradleeDate||'')+'|'+(r.linkedInvoice||'')+'|'+(Array.isArray(r.splits)?r.splits.length:0)+'|'+(Array.isArray(r.linkedEmployeePay)?r.linkedEmployeePay.length:0)+'|'+(Array.isArray(r.linkedAdvance)?r.linkedAdvance.length:0);
  for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;});return String(h);}

// ── One payment for several bills / two payments for one bill (Controls → billComboMatch) ──
function bankComboLinks(sid,debits,vendors){
  const out={};if(!controlOn('billComboMatch',sid)||!debits.length)return out;
  const inv=(loadVendorInvoices(sid)||[]).filter(i=>i&&i.docNature!=='Performa Invoice');const bal=i=>Math.round(((Number(i.amount)||0)-(i.payments||[]).reduce((t,q)=>t+(Number(q.paidAmount)||0),0))*100)/100;
  const vOf=x=>{const ov=x.vendorOverride&&x.vendorOverride!=='__none__'?vendors.find(v=>v.name===x.vendorOverride):null;return ov||findVendorMatch(x.description,vendors)||payeeByToken('vendor',x.description,vendors);};
  const used=new Set();const left={};inv.forEach(i=>{left[i.id]=bal(i);});
  debits.forEach(x=>{const v=vOf(x);if(!v)return;const bills=inv.filter(i=>String(i.vendorId)===String(v.id)&&!used.has(i.id)&&left[i.id]>0.5).sort((a,b)=>String(toISO(a.invoiceDate)||'').localeCompare(String(toISO(b.invoiceDate)||''))).slice(0,14);
    if(bills.length<2)return;const sols=[];
    const dfs=(start,pick,sum)=>{if(sols.length>1)return;if(pick.length>=2&&Math.abs(sum-x.debit)<=0.5){sols.push(pick.slice());return;}if(pick.length>=4)return;
      for(let k=start;k<bills.length;k++){const b2=left[bills[k].id];if(sum+b2>x.debit+0.5)continue;pick.push(bills[k]);dfs(k+1,pick,sum+b2);pick.pop();}};
    dfs(0,[],0);if(sols.length!==1)return;const sol=sols[0];sol.forEach(i=>used.add(i.id));
    out[x.id]={x,vendor:v,how:'combo',allocations:sol.map(i=>({id:i.id,invoiceNo:i.invoiceNo,amount:left[i.id]}))};});
  // two debits → one bill
  const rest=debits.filter(x=>!out[x.id]);const t=d=>{const i=toISO(d);return i?new Date(i+'T00:00:00').getTime():0;};
  for(let a=0;a<rest.length;a++)for(let c=a+1;c<rest.length;c++){const A=rest[a],B=rest[c];if(out[A.id]||out[B.id])continue;const v=vOf(A);if(!v||vOf(B)!==v)continue;if(Math.abs(t(A.date)-t(B.date))>15*864e5)continue;
    const hit=inv.filter(i=>String(i.vendorId)===String(v.id)&&!used.has(i.id)&&Math.abs(left[i.id]-(A.debit+B.debit))<=0.5);if(hit.length!==1)continue;const i=hit[0];used.add(i.id);
    out[A.id]={x:A,vendor:v,how:'pair',partner:B,allocations:[{id:i.id,invoiceNo:i.invoiceNo,amount:A.debit}]};out[B.id]={x:B,vendor:v,how:'pair',partner:A,allocations:[{id:i.id,invoiceNo:i.invoiceNo,amount:B.debit}]};}
  return out;
}

// ── Loans: EMI → principal + interest (Controls → loanEmiSplit) ──
function bankLoansKey(sid){return outletKey('salonos_bank_loans',sid);}

function loadBankLoans(sid){try{const v=JSON.parse(cachedLocalGet(bankLoansKey(sid))||'[]');return Array.isArray(v)?v:[];}catch(e){return[];}}

function saveBankLoans(sid,list){safeLocalSet(bankLoansKey(sid),JSON.stringify(list||[]));}

function loanOutstanding(sid,loan,beforeIso,rows){
  let o=Number(loan.opening)||0;const from=String(loan.asOn||'');
  (rows||bankRowsFor(sid)).forEach(r=>{if(!r||r.loanId!==loan.id)return;const iso=toISO(r.transactionDate)||'';if((from&&iso<from)||(beforeIso&&iso>=beforeIso))return;
    const sp=Array.isArray(r.splits)?r.splits:[];const pr=sp.filter(z=>z.nature==='Loan Principal').reduce((t,z)=>t+(Number(z.amount)||0),0)+(r.nature==='Loan Principal'?Number(r.debit)||0:0);o-=pr;});
  return Math.max(0,Math.round(o*100)/100);
}

function bankLoanSuggestion(sid,x,rows){
  if(!controlOn('loanEmiSplit',sid)||x.side!=='Debit')return null;const loans=loadBankLoans(sid);if(!loans.length)return null;const lo=String(x.description||'').toLowerCase();
  const L=loans.find(l=>l.contains&&lo.includes(String(l.contains).toLowerCase()))||loans.find(l=>!l.contains&&Math.abs((Number(l.emi)||0)-x.debit)<=1);if(!L)return null;
  const iso=toISO(x.date)||'';const out0=loanOutstanding(sid,L,iso,rows);const int=Math.min(x.debit,Math.round(out0*(Number(L.rate)||0)/1200*100)/100);const prin=Math.round((x.debit-int)*100)/100;
  const m=n=>'₹'+Math.round(n).toLocaleString('en-IN');
  const patch=int>0&&prin>0?{nature:'Split',splits:[{nature:'Loan Interest',amount:int,vendorOverride:''},{nature:'Loan Principal',amount:prin,vendorOverride:''}],loanId:L.id}:{nature:int>0?'Loan Interest':'Loan Principal',loanId:L.id};
  const exact=Math.abs((Number(L.emi)||0)-x.debit)<=1;
  return{conf:exact&&L.contains?'high':'mid',label:'EMI '+L.name+' — interest '+m(int)+' + principal '+m(prin),why:'Loan '+L.name+': '+m(out0)+' outstanding at '+(Number(L.rate)||0)+'% a year'+(exact?'; amount equals the EMI':''),apply:{type:'patch',patch}};
}

// ── Payee name / IFSC from a narration (NEFT / RTGS / IMPS / UPI / funds transfer) ──
function bankPayeeName(desc){
  const d=String(desc||'').toUpperCase().replace(/\s+/g,' ').trim();let m;
  m=d.match(/(?:NEFT|RTGS)\s*(?:DR|CR)?-?[A-Z]{4}0[A-Z0-9]{6}-([A-Z0-9][A-Z0-9 .&'()\/]+?)(?:-NETBANK|-N\d|-[A-Z]?\d{6,}|-|$)/);
  if(!m)m=d.match(/IMPS[ -\/](?:P2[AP][ -\/])?(?:\d+[ -\/])?([A-Z][A-Z .&']{3,40}?)(?:[-\/]|$)/);
  if(!m)m=d.match(/UPI[\/-](?:DR|CR|P2[AP]|\d+)?[\/-]?(?:\d+[\/-])?([A-Z][A-Z .&']{2,40}?)[\/-]/);
  if(!m)m=d.match(/FUNDS TRANSFER (?:DR|CR)-\d+\s*-\s*([A-Z][A-Z0-9 .&']{2,40})/);
  if(!m)return'';const n=m[1].replace(/\s+/g,' ').trim();if(n.length<3||/^(NETBANK|MUM|SELF)$/.test(n))return'';
  return n.split(' ').map(w=>w.length<=2||/^(PVT|LTD|LLP|OPC|HUF)$/.test(w)?w:w.charAt(0)+w.slice(1).toLowerCase()).join(' ');
}

// A payee who is (or was) on the staff list is never offered as a new vendor.
function bankPayeeIsStaff(sid,desc){try{const emps=typeof loadEmployees==='function'?loadEmployees(sid)||[]:[];return !!(emps.length&&(findEmployeeMatch(desc,emps)||findEmployeeByBank(desc,emps)||payeeByToken('emp',desc,emps)));}catch(e){return false;}}

function bankIfscOf(desc){const m=String(desc||'').toUpperCase().match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/);return m?m[1]:'';}

function addVendorFromNarration(sid,name,desc){
  const list=loadVendors(sid)||[];const ex=list.find(v=>String(v.name||'').trim().toLowerCase()===String(name).trim().toLowerCase());if(ex)return ex;
  const v={id:nextPrefixedId(list,'V',3),name:String(name).trim(),address:'',gst:'',cat:defaultVendorCategoryFor(sid),contact:'',phone:'',terms:'30 days',status:'Active',tdsApplicable:false,tdsSection:'',tdsRate:'',bankName:'',accountNo:'',ifsc:bankIfscOf(desc),accountHolder:'',email:'',addedFrom:'Bank mapping'};
  saveVendors([...list,v],sid);try{logAuditEvent(sid,{entity:'Vendor',entityId:v.id,action:'Added from bank mapping',summary:v.name+(v.ifsc?' · IFSC '+v.ifsc:'')});}catch(e){}
  return v;
}

// ── Own accounts / group companies (Controls → ownTransferPairs) ──
const OWN_ENTITIES_KEY='salonos_bank_own_entities';

function loadOwnEntities(){try{const v=JSON.parse(cachedLocalGet(OWN_ENTITIES_KEY)||'[]');return Array.isArray(v)?v:[];}catch(e){return[];}}

function saveOwnEntities(list){safeLocalSet(OWN_ENTITIES_KEY,JSON.stringify(list||[]));}

function ownNameTokens(){
  const names=new Set();const accts=new Set();const norm=s=>String(s||'').toUpperCase().replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|OPC)\b\.?/g,' ').replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  (typeof SALONS!=='undefined'?SALONS:[]).forEach(s=>{if(!s)return;[s.legalName,s.companyName,s.entityName].forEach(n=>{const k=norm(n);if(k.length>=6)names.add(k);});const a=String(s.accountNo||s.bankAccountNo||'').replace(/\D/g,'');if(a.length>=9)accts.add(a);});
  loadOwnEntities().forEach(e=>{const k=norm(e.name);if(k.length>=4)names.add(k);const a=String(e.account||'').replace(/\D/g,'');if(a.length>=6)accts.add(a);});
  return{names:[...names],accts:[...accts],norm};
}

function bankOwnTransferFor(sid,x){
  if(!controlOn('ownTransferPairs',sid))return null;const T=ownNameTokens();if(!T.names.length&&!T.accts.length)return null;
  const d=T.norm(x.description);const dig=String(x.description||'').replace(/\D/g,' ').split(/\s+/).filter(z=>z.length>=6);
  const hitName=T.names.find(n=>(' '+d+' ').includes(' '+n+' '));const hitAc=T.accts.find(a=>dig.some(z=>z===a||z.endsWith(a.slice(-6))&&a.endsWith(z.slice(-6))));
  if(!hitName&&!hitAc)return null;
  // the other side in another outlet: opposite side, same amount, within 2 days, not mapped yet
  const amt=x.debit||x.credit;const t=v=>{const i=toISO(v);return i?new Date(i+'T00:00:00').getTime():0;};let pair=null;
  (typeof SALONS!=='undefined'?SALONS:[]).filter(s=>s&&s.id!==sid&&s.status!=='Inactive').some(s=>{const r=bankRowsFor(s.id).find(z=>z&&!z.nature&&((x.side==='Debit')?Number(z.credit)>0:Number(z.debit)>0)&&Math.abs((Number(z.debit)||Number(z.credit))-amt)<=0.5&&Math.abs(t(z.transactionDate)-t(x.date))<=2*864e5);
    if(r){pair={sid:s.id,id:r.id,name:rptShort(s),date:r.transactionDate};return true;}return false;});
  return{who:hitName||('account …'+String(hitAc).slice(-4)),pair};
}

// Sends the given mapped bank lines (and the vendor bills linked to them) to Tally through the
// Tally Connector — the same routine as Tally Export → Sync, limited to these lines.
async function sendBankLinesToTally(sid,rowIds){
  const cfg=loadTallyConnectorCfg();const rows=bankRowsFor(sid).filter(r=>rowIds.includes(r.id));
  const inv=loadVendorInvoices(sid)||[];const invIds=new Set();
  rows.forEach(r=>{String(r.linkedInvoice||'').split(',').filter(Boolean).forEach(k=>{const [vid,no]=k.split('|');const i=inv.find(z=>String(z.vendorId)===vid&&String(z.invoiceNo)===no);if(i)invIds.add(i.id);});
    inv.forEach(i=>{if((i.payments||[]).some(q=>q.linkId==='bank-'+r.id))invIds.add(i.id);});});
  const res=await tallySyncVouchers(sid,cfg,{company:cfg.company,only:{inv:invIds,bank:new Set(rows.map(r=>r.id))}});
  try{addTallyLog(sid,{action:'Send from mapping pop-up',sent:res.sent,created:res.ledgersCreated,errors:res.failed.length,detail:res.failed.slice(0,10)});}catch(e){}
  return res;
}
