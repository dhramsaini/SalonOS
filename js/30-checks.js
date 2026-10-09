// ═══════════════════════════════════════════════════════════════════════════════════════════
// Checks — late-edit report (entries changed after the fact, paid bills edited or deleted, deletes
// approved) and cash difference patterns (by weekday, repeat days), across outlets.
// Dashboard → 🔍 Edits & cash. The delete approval rule lives in Master Settings → 🎛 Controls.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const CK_DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function lateEditsFor(sid,days){
  const since=new Date(Date.now()-days*864e5).toISOString();
  return(loadAuditLog(sid)||[]).filter(e=>e&&e.ts>=since&&(/Late edit|paid bill|Deleted|Unlocked/i.test(String(e.action||''))));
}
function cashPatternFor(sid,days){
  const m=loadCashCounts(sid)||{};const lim=cashDiffLimitFor(sid);const since=new Date(Date.now()-days*864e5);
  const rows=Object.keys(m).filter(iso=>new Date(iso+'T00:00:00')>=since).map(iso=>({iso,...m[iso],diff:Number(m[iso].diff!=null?m[iso].diff:(Number(m[iso].count)||0)-(Number(m[iso].closing)||0))}))
    .filter(r=>Math.abs(r.diff)>lim).sort((a,b)=>a.iso.localeCompare(b.iso));
  const byDow=CK_DOW.map((d,i)=>{const x=rows.filter(r=>new Date(r.iso+'T00:00:00').getDay()===i);return{d,n:x.length,amt:x.reduce((s,r)=>s+r.diff,0)};});
  const short=rows.filter(r=>r.diff<0),total=rows.reduce((s,r)=>s+r.diff,0);
  const worst=byDow.slice().sort((a,b)=>b.n-a.n)[0];
  return{rows,byDow,lim,short:short.length,shortAmt:short.reduce((s,r)=>s+r.diff,0),total,
    pattern:rows.length>=3&&worst.n>=Math.max(2,Math.ceil(rows.length*0.4))?worst.d:null,noReason:rows.filter(r=>!String(r.reason||'').trim()).length};
}
function EditsCashBoard({accessibleSalons}){
  const h=React.createElement;const [days,setDays]=useState(30);const [open,setOpen]=useState(null);
  const outlets=(accessibleSalons||[]).filter(s=>s&&s.id!=null&&s.status!=='Inactive');
  const data=outlets.map(s=>({s,edits:lateEditsFor(s.id,days),cash:cashPatternFor(s.id,days)}));
  const m=n=>(n<0?'−':'')+'₹'+Math.abs(Math.round(n)).toLocaleString('en-IN');
  const dt=ts=>{try{return new Date(ts).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});}catch(e){return ts;}};
  return h('div',null,
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:12}},
      h('div',null,h('div',{className:'page-title'},'Edits & cash'),h('div',{className:'page-sub'},'Entries changed after the day had passed, paid bills edited or deleted, months unlocked, and cash count differences above each outlet’s limit')),
      h('div',{style:{display:'flex',gap:6}},[7,30,90].map(n=>h('button',{key:n,className:'btn btn-sm '+(days===n?'btn-primary':'btn-ghost'),onClick:()=>setDays(n)},'Last '+n+' days')))),
    h('div',{className:'card',style:{padding:0,marginBottom:16}},h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,['Outlet','Late edits','Paid bills changed','Unlocks','Cash differences','Short (cash less than book)','Without reason','Pattern',''].map((t,i)=>h('th',{key:i,style:i&&i<7?{textAlign:'right'}:null},t)))),
      h('tbody',null,data.map(({s,edits,cash})=>{const le=edits.filter(e=>/Late edit/.test(e.action)).length,pb=edits.filter(e=>/paid bill/i.test(e.action)).length,un=edits.filter(e=>/Unlocked/.test(e.action)).length;
        return h(React.Fragment,{key:s.id},h('tr',null,
          h('td',{style:{fontWeight:600}},rptShort(s)),h('td',{style:{textAlign:'right',color:le?'var(--orange)':''}},le||'—'),h('td',{style:{textAlign:'right',color:pb?'var(--red)':''}},pb||'—'),h('td',{style:{textAlign:'right'}},un||'—'),
          h('td',{style:{textAlign:'right'}},cash.rows.length?cash.rows.length+' · '+m(cash.total):'—'),h('td',{style:{textAlign:'right',color:cash.short?'var(--red)':''}},cash.short?cash.short+' · '+m(cash.shortAmt):'—'),
          h('td',{style:{textAlign:'right',color:cash.noReason?'var(--red)':''}},cash.noReason||'—'),
          h('td',{style:{color:cash.pattern?'var(--red)':'var(--text3)',fontSize:12}},cash.pattern?'Mostly on '+cash.pattern:'—'),
          h('td',null,(edits.length||cash.rows.length)?h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setOpen(open===s.id?null:s.id)},open===s.id?'Hide':'Details'):null)),
          open===s.id&&h('tr',null,h('td',{colSpan:9,style:{background:'var(--bg3)'}},
            edits.length>0&&h('div',{style:{marginBottom:10}},h('div',{style:{fontWeight:700,fontSize:12,marginBottom:4}},'Changes'),
              edits.slice(0,60).map((e,i)=>h('div',{key:i,style:{fontSize:12,padding:'2px 0'}},h('span',{style:{color:'var(--text3)'}},dt(e.ts)+' · '+(e.user||'—')+' · '),h('b',null,e.action),' — ',e.summary))),
            cash.rows.length>0&&h('div',null,h('div',{style:{fontWeight:700,fontSize:12,marginBottom:4}},'Cash differences above '+m(cash.lim)+' — by weekday: '+cash.byDow.filter(x=>x.n).map(x=>x.d+' '+x.n).join(', ')),
              cash.rows.slice().reverse().map(r=>h('div',{key:r.iso,style:{fontSize:12,padding:'2px 0'}},String(r.iso).split('-').reverse().join('/')+' '+CK_DOW[new Date(r.iso+'T00:00:00').getDay()]+' · counted '+m(r.count)+' vs book '+m(r.closing)+' = ',
                h('b',{style:{color:r.diff<0?'var(--red)':'var(--green)'}},m(r.diff)),r.reason?' · '+r.reason:h('span',{style:{color:'var(--red)'}},' · no reason')))))));}))))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)'}},'Late edit = a Daily Sales & Exp figure changed more than 2 days after its date. “Pattern” flags a weekday with at least 40% of the cash differences.'));
}
// Delete of a vendor bill or payment by someone other than a Super Admin (Controls → Delete approval).
function deleteApprovalOk(sid,what,id,summary){
  return requireApproval({control:'deleteApproval',sid,key:sid+'|del|'+what+'|'+id,summary:'Delete '+summary});
}
