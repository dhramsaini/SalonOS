// ════════════════════════════════════════════════════════════════════════════════════════════════
// Bank lines for loans, capital and fixed assets → their own Tally ledger (Controls → Bank mapping →
// bankTallyLedger). Natures: Secured Loan, Unsecured Loan (received or repaid), Capital Introduced,
// Drawings, Fixed Asset Purchase / Sale (and Loan Principal). Each goes to its Tally group (Secured
// Loans, Unsecured Loans, Capital Account, Fixed Assets); the line can name its own ledger — e.g.
// “Nisha Yadav” under Unsecured Loans — kept on the line as tallyLedger. Suggestions: the party in the
// narration, ledgers used before for that nature, and ledgers already in Tally under that group.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const BL_NATURES=new Set(['Secured Loan','Unsecured Loan','Capital Introduced','Drawings','Fixed Asset Purchase','Fixed Asset Sale','Loan Principal']);
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
  (loadBankStatementRows(sid)||[]).forEach(r=>{if(r&&r.nature===nature&&String(r.tallyLedger||'').trim())used.add(String(r.tallyLedger).trim());});
  try{const c=typeof loadTallyLedgerCache==='function'?loadTallyLedgerCache(sid):null;const g=String(BL_GROUP[nature]||'').toLowerCase();
    (c&&c.ledgers||[]).forEach(l=>{if(g&&String(l.parent||'').toLowerCase()===g)used.add(l.name);});}catch(e){}
  return[...used].sort();
}
// Choosing one of these natures in the mapping window asks for the ledger (the line leaves the list once
// mapped): {tallyLedger} or {} — Cancel keeps the general ledger of that type.
function blAsk(sid,nature,row){
  if(!BL_NATURES.has(nature)||!blOn(sid))return{};
  const def=String((row&&row.tallyLedger)||'')||blParty(row&&row.description)||'';const sug=blSuggestions(sid,nature);
  const v=window.prompt('Tally ledger for this '+nature+' line (under '+(BL_GROUP[nature]||'its group')+') — e.g. the lender’s or partner’s name.'+(sug.length?'\nUsed before: '+sug.slice(0,6).join(', '):'')+'\nLeave blank for the general “'+((TALLY_NATURE_LEDGERS[nature]||[])[0]||nature)+'” ledger.',def);
  return v==null?{}:{tallyLedger:String(v).trim()};
}
function BankLedgerField({sid,row,onSet}){
  const h=React.createElement;if(!row||!BL_NATURES.has(row.nature)||!blOn(sid))return null;
  const party=blParty(row.description);const cur=String(row.tallyLedger||'');const listId='bl-'+String(row.id).replace(/\W/g,'');const sug=blSuggestions(sid,row.nature);
  return h('div',{style:{display:'flex',flexDirection:'column',gap:3,marginTop:4,minWidth:160}},
    h('input',{key:cur,className:'form-control',list:listId,style:{padding:'4px 7px',fontSize:11.5},defaultValue:cur,placeholder:'Tally ledger ('+(BL_GROUP[row.nature]||'')+')',title:'The Tally ledger this line posts to, under '+(BL_GROUP[row.nature]||'its group')+' — e.g. the lender’s or partner’s name. Blank: the general “'+row.nature+'” ledger.',
      onBlur:e=>{const v=e.target.value.trim();if(v!==cur)onSet(v);},onKeyDown:e=>{if(e.key==='Enter')e.target.blur();}}),
    h('datalist',{id:listId},sug.map(n=>h('option',{key:n,value:n}))),
    !cur&&party&&h('button',{type:'button',className:'btn btn-ghost btn-sm',style:{fontSize:10.5,padding:'1px 6px',alignSelf:'flex-start'},onClick:()=>onSet(party)},'Use “'+party+'”'),
    cur&&h('span',{style:{fontSize:10.5,color:'var(--text3)'}},'→ Tally: '+cur+' ('+(BL_GROUP[row.nature]||'')+')'));
}
if(typeof HELP_TOPICS!=='undefined'&&Array.isArray(HELP_TOPICS)&&!HELP_TOPICS.some(t=>t.title==='Loans, capital and fixed assets in the bank'))HELP_TOPICS.push({title:'Loans, capital and fixed assets in the bank',body:[
  '<b>Natures</b>: Secured Loan, Unsecured Loan (money received or repaid), Capital Introduced, Drawings, Fixed Asset Purchase and Fixed Asset Sale — in Bank Statement and the bank mapping window.',
  '<b>Tally ledger</b>: after choosing one of them, type the ledger — e.g. the lender’s name — or click “Use …” for the party in the narration. It posts to Tally under Secured Loans, Unsecured Loans, Capital Account or Fixed Assets, and the ledger is created there if missing.',
  '<b>P&L</b>: these lines are not income or expense.',
  '<b>Switch</b>: Master Settings → Controls → Bank mapping → Tally ledger for loans, capital and fixed assets.'
]});
