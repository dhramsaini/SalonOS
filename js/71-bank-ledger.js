// ════════════════════════════════════════════════════════════════════════════════════════════════
// Bank lines for loans, capital and fixed assets → their own Tally ledger (Controls → Bank mapping →
// bankTallyLedger). Natures: Secured Loan, Unsecured Loan (received or repaid), Capital Introduced,
// Drawings, Fixed Asset Purchase / Sale (and Loan Principal). Each goes to its Tally group (Secured
// Loans, Unsecured Loans, Capital Account, Fixed Assets); the line can name its own ledger — e.g.
// “Nisha Yadav” under Unsecured Loans — kept on the line as tallyLedger. Suggestions: the party in the
// narration, ledgers used before for that nature, and ledgers already in Tally under that group.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const BL_NATURES=new Set(['Secured Loan','Unsecured Loan','Capital Introduced','Drawings','Fixed Asset Purchase','Fixed Asset Sale','Loan Principal','Other']); // Other: any ledger you create
function blOn(sid){return typeof controlOn!=='function'||controlOn('bankTallyLedger',sid);}
// The party named in a NEFT / IMPS / RTGS / UPI narration ("NEFT/KKBK…/NISHA YADAV/KKBK…" → "Nisha Yadav").
function blParty(desc){
  const segs=String(desc||'').split(/[\/|:-]/).map(s=>s.trim()).filter(Boolean);
  const skip=/^(NEFT|IMPS|RTGS|UPI|INB|MB|IB|TRF|TO|FROM|BY|CR|DR|NACH|ACH|ECS|CHQ|CLG|INF|INFT|P2A|P2M|ITDTAX|REFUND|SALARY|SAL)$/i;
  const cand=segs.filter(s=>/^[A-Za-z][A-Za-z .&]{2,}$/.test(s)&&!skip.test(s)&&!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(s));
  const best=cand.sort((a,b)=>b.replace(/[^A-Za-z]/g,'').length-a.replace(/[^A-Za-z]/g,'').length)[0]||'';
  return best.toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase()).replace(/\s+/g,' ').trim();
}
const BL_GROUP={'Secured Loan':'Secured Loans','Unsecured Loan':'Unsecured Loans','Capital Introduced':'Capital Account','Drawings':'Capital Account','Fixed Asset Purchase':'Fixed Assets','Fixed Asset Sale':'Fixed Assets','Loan Principal':'Secured Loans'};
function blSuggestions(sid,nature){
  const used=new Set();
  try{blOwn(sid).filter(l=>nature==='Other'||l.group===(BL_GROUP[nature]||l.group)).forEach(l=>used.add(l.name));}catch(e){}
  (loadBankStatementRows(sid)||[]).forEach(r=>{if(r&&r.nature===nature&&String(r.tallyLedger||'').trim())used.add(String(r.tallyLedger).trim());});
  try{const c=typeof loadTallyLedgerCache==='function'?loadTallyLedgerCache(sid):null;const g=String(BL_GROUP[nature]||'').toLowerCase();
    (c&&c.ledgers||[]).forEach(l=>{if(g&&String(l.parent||'').toLowerCase()===g)used.add(l.name);});}catch(e){}
  return[...used].sort();
}
// Choosing one of these natures in the mapping window asks for the ledger (the line leaves the list once
// mapped): {tallyLedger} or {} — Cancel keeps the general ledger of that type.
function blAsk(sid,nature,row){
  if(!BL_NATURES.has(nature)||!blOn(sid))return{};
  if(nature==='Other'&&!window.confirm('Post this line to a ledger of your own in Tally (instead of Suspense)?'))return{};
  const def=String((row&&row.tallyLedger)||'')||blParty(row&&row.description)||'';const sug=blSuggestions(sid,nature);
  const v=window.prompt('Tally ledger for this '+nature+' line (under '+(BL_GROUP[nature]||'its group')+') — e.g. the lender’s or partner’s name.'+(sug.length?'\nUsed before: '+sug.slice(0,6).join(', '):'')+'\nLeave blank for the general “'+((TALLY_NATURE_LEDGERS[nature]||[])[0]||nature)+'” ledger.',def);
  if(v==null)return{};const nm=String(v).trim();if(nm&&!blOwnFind(loadTallyLedgerMap(sid),nm)){let g=BL_GROUP[nature];if(!g){g=window.prompt('Which Tally group is “'+nm+'” under?\n'+BL_GROUPS.join(', '),'Indirect Expenses');if(g==null)return{};g=BL_GROUPS.find(x=>x.toLowerCase()===String(g).trim().toLowerCase())||String(g).trim()||'Indirect Expenses';}blOwnAdd(sid,nm,g);}return{tallyLedger:nm};
}
function BankLedgerField({sid,row,onSet}){
  const h=React.createElement;const [nw,setNw]=useState(false);if(!row||!BL_NATURES.has(row.nature)||!blOn(sid))return null;
  const party=blParty(row.description);const cur=String(row.tallyLedger||'');const listId='bl-'+String(row.id).replace(/\W/g,'');const sug=blSuggestions(sid,row.nature);
  return h('div',{style:{display:'flex',flexDirection:'column',gap:3,marginTop:4,minWidth:160}},
    h('input',{key:cur,className:'form-control',list:listId,style:{padding:'4px 7px',fontSize:11.5},defaultValue:cur,placeholder:'Tally ledger'+(BL_GROUP[row.nature]?' ('+BL_GROUP[row.nature]+')':' (any group)'),title:'The Tally ledger this line posts to, under '+(BL_GROUP[row.nature]||'its group')+' — e.g. the lender’s or partner’s name. Blank: the general “'+row.nature+'” ledger.',
      onBlur:e=>{const v=e.target.value.trim();if(v!==cur){if(v&&!blOwnFind(loadTallyLedgerMap(sid),v))blOwnAdd(sid,v,BL_GROUP[row.nature]);onSet(v);}},onKeyDown:e=>{if(e.key==='Enter')e.target.blur();}}),
    h('datalist',{id:listId},sug.map(n=>h('option',{key:n,value:n}))),
    !cur&&party&&h('button',{type:'button',className:'btn btn-ghost btn-sm',style:{fontSize:10.5,padding:'1px 6px',alignSelf:'flex-start'},onClick:()=>onSet(party)},'Use “'+party+'”'),
    h('button',{type:'button',className:'btn btn-ghost btn-sm',style:{fontSize:10.5,padding:'1px 6px',alignSelf:'flex-start'},onClick:()=>setNw(true)},'+ New ledger'),
    cur&&h('span',{style:{fontSize:10.5,color:'var(--text3)'}},'→ Tally: '+cur+' ('+(((blOwnFind(loadTallyLedgerMap(sid),cur)||{}).group)||BL_GROUP[row.nature]||'')+')'),
    nw&&h(BlNewLedger,{sid,nature:row.nature,defName:cur?'':party,onDone:nm=>onSet(nm),onClose:()=>setNw(false)}));
}

// ── Your own ledgers under these groups — kept in the outlet's Tally ledger map (map.ownLedgers =
// [{name, group}]) so every Tally create / sync makes the missing ones (tallyExtraLedgers). ──
const BL_GROUPS=['Secured Loans','Unsecured Loans','Capital Account','Fixed Assets','Loans & Advances (Asset)','Investments','Deposits (Asset)','Current Assets','Current Liabilities','Sundry Creditors','Sundry Debtors','Duties & Taxes','Provisions','Indirect Expenses','Direct Expenses','Indirect Incomes','Direct Incomes','Bank Accounts','Cash-in-Hand','Suspense A/c'];
function blOwn(sid){try{const m=loadTallyLedgerMap(sid)||{};return Array.isArray(m.ownLedgers)?m.ownLedgers.filter(l=>l&&l.name):[];}catch(e){return[];}}
function blOwnFind(map,name){const n=String(name||'').trim().toLowerCase();return((map&&map.ownLedgers)||[]).find(l=>l&&String(l.name).trim().toLowerCase()===n)||null;}
function blOwnAdd(sid,name,group){
  const nm=String(name||'').trim();if(!nm)return null;const m=loadTallyLedgerMap(sid)||{};const list=Array.isArray(m.ownLedgers)?m.ownLedgers.slice():[];
  const i=list.findIndex(l=>String(l.name).trim().toLowerCase()===nm.toLowerCase());
  if(i>=0)list[i]={...list[i],group:group||list[i].group};else list.push({name:nm,group:group||'Unsecured Loans',at:new Date().toISOString()});
  saveTallyLedgerMap({...m,ownLedgers:list},sid);return nm;
}
function blOwnRemove(sid,name){const m=loadTallyLedgerMap(sid)||{};saveTallyLedgerMap({...m,ownLedgers:(m.ownLedgers||[]).filter(l=>String(l.name).toLowerCase()!==String(name).toLowerCase())},sid);}
function blUsedBy(sid,name){const n=String(name||'').toLowerCase();return(loadBankStatementRows(sid)||[]).filter(r=>r&&String(r.tallyLedger||'').toLowerCase()===n).length;}
// "+ New ledger": name and group; returns the name through onDone.
function BlNewLedger({sid,nature,defName,onDone,onClose}){
  const h=React.createElement;const [name,setName]=useState(defName||'');const [group,setGroup]=useState(BL_GROUP[nature]||(nature==='Other'?'Indirect Expenses':'Unsecured Loans'));
  const save=()=>{const nm=blOwnAdd(sid,name,group);if(!nm){window.alert('Type the ledger name.');return;}onDone&&onDone(nm);onClose&&onClose();};
  return h('div',{className:'modal-overlay',style:{zIndex:4000},onClick:e=>{e.stopPropagation();onClose&&onClose();}},
    h('div',{className:'modal',style:{maxWidth:420},onClick:e=>e.stopPropagation()},
      h('div',{className:'modal-title'},'📒 New ledger for Tally'),
      h('div',{className:'form-group'},h('label',{htmlFor:'bl-nm'},'Ledger name'),h('input',{id:'bl-nm',className:'form-control',autoFocus:true,value:name,placeholder:'e.g. Nisha Yadav',onChange:e=>setName(e.target.value),onKeyDown:e=>{if(e.key==='Enter')save();}})),
      h('div',{className:'form-group'},h('label',{htmlFor:'bl-gr'},'Under (Tally group)'),h('select',{id:'bl-gr',className:'form-control',value:group,onChange:e=>setGroup(e.target.value)},BL_GROUPS.map(g=>h('option',{key:g,value:g},g)))),
      h('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:12}},'Created in Tally under this group the next time ledgers are created or vouchers are sent (Tally Export).'),
      h('div',{style:{display:'flex',gap:8,justifyContent:'flex-end'}},h('button',{className:'btn btn-ghost btn-sm',onClick:()=>onClose&&onClose()},'Cancel'),h('button',{className:'btn btn-primary btn-sm',onClick:save},'Create ledger'))));
}
// 📒 Ledgers button (bank mapping window): the same list in a window.
function BlLedgersButton({sid}){
  const h=React.createElement;const [open,setOpen]=useState(false);if(sid==null||!blOn(sid))return null;
  return h(React.Fragment,null,h('button',{className:'btn btn-ghost btn-sm',title:'Create and manage your own Tally ledgers',onClick:()=>setOpen(true)},'📒 Ledgers'),
    open&&h('div',{className:'modal-overlay',style:{zIndex:3500},onClick:e=>{e.stopPropagation();setOpen(false);}},
      h('div',{className:'modal',style:{maxWidth:720,maxHeight:'85vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
        h(BlLedgerManager,{sid}),h('div',{style:{textAlign:'right'}},h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setOpen(false)},'Close')))));
}
// Tally Export → Ledgers: the list, with add / change group / remove.
function BlLedgerManager({sid,inTally,onChanged}){
  const h=React.createElement;const [,t]=useState(0);const [adding,setAdding]=useState(false);if(sid==null||!blOn(sid))return null;
  const list=blOwn(sid);const by={};list.forEach(l=>{(by[l.group]=by[l.group]||[]).push(l);});
  const ch=()=>{t(x=>x+1);onChanged&&onChanged();};
  return h('div',{className:'card',style:{marginBottom:14}},
    h('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:8}},h('b',{style:{fontSize:13}},'📒 Your ledgers for Tally'),
      h('button',{className:'btn btn-primary btn-sm',style:{marginLeft:'auto'},onClick:()=>setAdding(true)},'+ New ledger')),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:8}},'Lenders, partners, owners, assets — or any ledger under any group. Choose them on bank lines mapped as a loan, capital, drawings, fixed asset or Other. Missing ones are created in Tally with the other ledgers.'),
    !list.length&&h('div',{style:{fontSize:12,color:'var(--text3)'}},'None yet.'),
    Object.keys(by).sort().map(g=>h('div',{key:g,style:{marginBottom:8}},h('div',{style:{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}},g),
      by[g].map(l=>{const it=inTally?inTally(l.name):null;const used=blUsedBy(sid,l.name);return h('div',{key:l.name,style:{display:'flex',alignItems:'center',gap:10,padding:'4px 0',fontSize:12.5,flexWrap:'wrap'}},
        h('span',{style:{minWidth:200}},l.name),
        it!==null&&h('span',{style:{fontSize:11,color:it?'var(--green)':'var(--orange)'}},it?'✓ in Tally':'will be created'),
        h('span',{style:{fontSize:11,color:'var(--text3)'}},used?used+' bank line(s)':''),
        h('select',{className:'form-control',style:{width:'auto',fontSize:11.5,padding:'2px 6px',marginLeft:'auto'},'aria-label':'Group of '+l.name,value:l.group,onChange:e=>{blOwnAdd(sid,l.name,e.target.value);ch();}},BL_GROUPS.map(x=>h('option',{key:x,value:x},x))),
        h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>{if(used){window.alert(l.name+' is used on '+used+' bank line(s) — change those lines first.');return;}if(window.confirm('Remove '+l.name+' from this list?')){blOwnRemove(sid,l.name);ch();}}},'Remove'));}))),
    adding&&h(BlNewLedger,{sid,nature:'Unsecured Loan',onDone:ch,onClose:()=>setAdding(false)}));
}
if(typeof HELP_TOPICS!=='undefined'&&Array.isArray(HELP_TOPICS)&&!HELP_TOPICS.some(t=>t.title==='Loans, capital and fixed assets in the bank'))HELP_TOPICS.push({title:'Loans, capital and fixed assets in the bank',body:[
  '<b>Natures</b>: Secured Loan, Unsecured Loan (money received or repaid), Capital Introduced, Drawings, Fixed Asset Purchase and Fixed Asset Sale — in Bank Statement and the bank mapping window.',
  '<b>Tally ledger</b>: after choosing one of them, type the ledger — e.g. the lender’s name — or click “Use …” for the party in the narration. It posts to Tally under Secured Loans, Unsecured Loans, Capital Account or Fixed Assets, and the ledger is created there if missing.',
  '<b>P&L</b>: these lines are not income or expense.',
  '<b>Switch</b>: Master Settings → Controls → Bank mapping → Tally ledger for loans, capital and fixed assets.'
]});
