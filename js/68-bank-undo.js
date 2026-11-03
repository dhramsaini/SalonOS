// ════════════════════════════════════════════════════════════════════════════════════════════════
// Bank Statement — undo deleted lines (Controls → Bank mapping → bankUndo).
// Lines removed by "Delete Selected", "Clear Data" or "Upload fresh statement" are kept for 90 days
// (last 30 deletions) in salonos_bank_deleted_outlet_<id> = [{id, at, by, why, rows:[...]}].
// "↩ Undo last delete" puts the latest batch back; "🗂 Deleted lines" lists every batch to restore.
// A restored line keeps its id (so links to bills, salary and advances still match) unless a line with
// that id exists now; a line already in the statement again (same date, narration, debit, credit,
// balance — e.g. re-imported) is skipped.
// ════════════════════════════════════════════════════════════════════════════════════════════════
function bdOn(sid){return typeof controlOn!=='function'||controlOn('bankUndo',sid);}
function bdKey(sid){return outletKey('salonos_bank_deleted',sid);}
function bdLoad(sid){
  try{const v=JSON.parse(cachedLocalGet(bdKey(sid))||'[]');const cut=Date.now()-90*864e5;return(Array.isArray(v)?v:[]).filter(b=>b&&Array.isArray(b.rows)&&b.rows.length&&new Date(b.at).getTime()>=cut);}catch(e){return[];}
}
function bdSave(sid,list){safeLocalSet(bdKey(sid),JSON.stringify(list.slice(-30)));}
function bdStash(sid,rows,why){
  if(!bdOn(sid)||!rows||!rows.length)return;
  const by=(typeof currentSessionUser==='function'&&(currentSessionUser()||{}).name)||'';
  bdSave(sid,[...bdLoad(sid),{id:'BD'+Date.now().toString(36),at:new Date().toISOString(),by,why:why||'Deleted',rows:rows.map(r=>({...r}))}]);
  try{logAuditEvent(sid,{entity:'Bank Statement',entityId:'lines',action:'Deleted',summary:rows.length+' bank line'+(rows.length===1?'':'s')+' removed ('+(why||'Deleted')+') — can be restored from 🗂 Deleted lines'});}catch(e){}
}
const bdKeyOf=r=>[r.transactionDate,r.description,r.debit,r.credit,r.closingBalance].join('|');
// Puts a batch back into rows; returns {next, restored, skipped}.
function bdMerge(cur,batchRows){
  const ids=new Set(cur.map(r=>r.id)),keys=new Set(cur.map(bdKeyOf));let nid=cur.reduce((m,r)=>Math.max(m,Number(r.id)||0),0)+1;
  const add=[];let skipped=0;
  batchRows.forEach(r=>{if(keys.has(bdKeyOf(r))){skipped++;return;}const row=ids.has(r.id)?{...r,id:nid++}:{...r};ids.add(row.id);keys.add(bdKeyOf(row));add.push(row);});
  return{next:[...cur,...add],restored:add.length,skipped};
}
function BankUndoBar({sid,rows,setRows,onMessage}){
  const h=React.createElement;const [open,setOpen]=useState(false);const [,t]=useState(0);
  if(sid==null||!bdOn(sid))return null;const bin=bdLoad(sid);if(!bin.length)return null;
  const restore=b=>{
    const m=bdMerge(rows,b.rows);setRows(m.next);bdSave(sid,bdLoad(sid).filter(x=>x.id!==b.id));t(x=>x+1);
    try{logAuditEvent(sid,{entity:'Bank Statement',entityId:'lines',action:'Restored',summary:m.restored+' deleted bank line'+(m.restored===1?'':'s')+' restored ('+b.why+')'});}catch(e){}
    const msg='Restored '+m.restored+' line'+(m.restored===1?'':'s')+(m.skipped?' · '+m.skipped+' already in the statement again, skipped':'')+'.';
    if(onMessage)onMessage(msg);else if(typeof toast==='function')toast(msg,'success');
  };
  const last=bin[bin.length-1];const when=b=>new Date(b.at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  const R=n=>'₹'+Math.round(Number(n)||0).toLocaleString('en-IN');
  return h(React.Fragment,null,
    h('button',{className:'btn btn-ghost btn-sm',title:'Put back the '+last.rows.length+' line'+(last.rows.length===1?'':'s')+' removed by '+last.why+' ('+when(last)+')',onClick:()=>restore(last)},'↩ Undo last delete ('+last.rows.length+')'),
    h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setOpen(true)},'🗂 Deleted lines ('+bin.reduce((t,b)=>t+b.rows.length,0)+')'),
    open&&h('div',{className:'modal-overlay',onClick:()=>setOpen(false)},
      h('div',{className:'modal',style:{maxWidth:760,maxHeight:'82vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
        h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}},
          h('div',{className:'modal-title',style:{marginBottom:0,paddingBottom:0,border:'none'}},'🗂 Deleted bank lines'),
          h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setOpen(false)},'✕ Close')),
        h('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:12}},'Lines removed in the last 90 days, newest first. Restore puts a whole deletion back; lines already in the statement again are skipped.'),
        bdLoad(sid).slice().reverse().map(b=>h('div',{key:b.id,style:{border:'1px solid var(--border)',borderRadius:'var(--r)',padding:10,marginBottom:10}},
          h('div',{style:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:6}},
            h('b',{style:{fontSize:12.5}},b.rows.length+' line'+(b.rows.length===1?'':'s')+' · '+b.why),
            h('span',{style:{fontSize:11.5,color:'var(--text3)'}},when(b)+(b.by?' · by '+b.by:'')),
            h('button',{className:'btn btn-primary btn-sm',style:{marginLeft:'auto'},onClick:()=>restore(b)},'↩ Restore')),
          h('div',{className:'table-wrap'},h('table',{style:{fontSize:11.5}},
            h('thead',null,h('tr',null,['Date','Narration','Debit','Credit','Nature'].map(x=>h('th',{key:x},x)))),
            h('tbody',null,b.rows.slice(0,8).map((r,i)=>h('tr',{key:i},h('td',null,r.transactionDate||''),h('td',{style:{maxWidth:280,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},r.description||''),
              h('td',{style:{textAlign:'right'}},Number(r.debit)?R(r.debit):''),h('td',{style:{textAlign:'right'}},Number(r.credit)?R(r.credit):''),h('td',null,r.nature||'')))))),
          b.rows.length>8&&h('div',{style:{fontSize:11,color:'var(--text3)',marginTop:4}},'… and '+(b.rows.length-8)+' more'))))));
}
if(typeof HELP_TOPICS!=='undefined'&&Array.isArray(HELP_TOPICS)&&!HELP_TOPICS.some(t=>t.title==='Undo a deleted bank line'))HELP_TOPICS.push({title:'Undo a deleted bank line',body:[
  '<b>Undo</b>: Bank Statement → “↩ Undo last delete” puts back the lines removed last (Delete Selected, Clear Data or Upload fresh statement).',
  '<b>Older deletions</b>: “🗂 Deleted lines” lists every deletion of the last 90 days with who and when — Restore puts that deletion back.',
  '<b>Links</b>: a restored line keeps its links to bills, salary and advances. A line already in the statement again (re-imported) is skipped.',
  '<b>Switch</b>: Master Settings → Controls → Bank mapping → Undo deleted bank lines.'
]});
