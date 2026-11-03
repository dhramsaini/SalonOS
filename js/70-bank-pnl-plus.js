// ════════════════════════════════════════════════════════════════════════════════════════════════
// Bank and P&L — more help (switches in Controls):
//  mbOwnPairs      a debit in one of the outlet's accounts and the same amount credited in another
//                  within 3 days → "Transfer" on both lines, in one click (Bank Statement)
//  mbBalances      latest balance of each account with the date of its last line (Bank Statement)
//  mbStaleStatement  "no statement since …" for an account on the outlet dashboard (limit: days)
//  pnlFinalNeedsBills  marking a P&L Final asks first when vendor bills of the month aren't in it
//  pnlLineNotes    a line that moved more than the limit % from last month asks for a reason
// ════════════════════════════════════════════════════════════════════════════════════════════════
function bpOn(id,sid){return typeof controlOn!=='function'||controlOn(id,sid);}
const bpR=n=>'₹'+Math.round(Number(n)||0).toLocaleString('en-IN');
const bpT=d=>{const i=toISO(d);return i?new Date(i+'T00:00:00').getTime():0;};

// ── #9 Own-account transfers ──
function mbOwnPairs(sid,rows){
  if(!bpOn('mbOwnPairs',sid)||typeof mbOn!=='function'||!mbOn(sid)||mbAccounts(sid).length<2)return[];
  const p=mbPrimaryId(sid);const acct=r=>(r&&r.acct)||p;const free=(rows||[]).filter(r=>r&&!String(r.nature||'').trim()&&!r.linkedInvoice&&!(typeof bankLineLocked==='function'&&bankLineLocked(sid,r)));
  const deb=free.filter(r=>Number(r.debit)>0),cre=free.filter(r=>Number(r.credit)>0);const used=new Set(),out=[];
  deb.sort((a,b)=>bpT(a.transactionDate)-bpT(b.transactionDate)).forEach(d=>{
    const amt=Number(d.debit);const c=cre.filter(x=>!used.has(x.id)&&acct(x)!==acct(d)&&Math.abs(Number(x.credit)-amt)<0.5&&Math.abs(bpT(x.transactionDate)-bpT(d.transactionDate))<=3*864e5)
      .sort((a,b)=>Math.abs(bpT(a.transactionDate)-bpT(d.transactionDate))-Math.abs(bpT(b.transactionDate)-bpT(d.transactionDate)))[0];
    if(c){used.add(c.id);out.push({d,c,amt,from:mbFind(sid,acct(d)),to:mbFind(sid,acct(c))});}
  });
  return out;
}
function MbOwnTransfers({sid,rows,setRows}){
  const h=React.createElement;const [open,setOpen]=useState(false);const pairs=mbOwnPairs(sid,rows);if(!pairs.length)return null;
  const mark=list=>{const ids={};list.forEach(x=>{const k='OT'+x.d.id+'-'+x.c.id;ids[x.d.id]=k;ids[x.c.id]=k;});
    setRows(prev=>prev.map(r=>ids[r.id]?{...r,nature:'Transfer',ownPair:ids[r.id]}:r));};
  return h('div',{style:{background:'rgba(74,158,255,0.08)',border:'1px solid rgba(74,158,255,0.35)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,fontSize:12.5}},
    h('div',{style:{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}},
      h('span',null,'🔁 ',h('b',null,pairs.length+' transfer'+(pairs.length===1?'':'s')+' between your own bank accounts'),' — not income or expense'),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setOpen(o=>!o)},open?'Hide':'Show'),
      h('button',{className:'btn btn-primary btn-sm',onClick:()=>mark(pairs)},'Mark all as Transfer')),
    open&&h('div',{style:{marginTop:6}},pairs.map((x,i)=>h('div',{key:i,style:{display:'flex',gap:8,alignItems:'center',padding:'3px 0',flexWrap:'wrap'}},
      h('span',null,x.d.transactionDate+' · '+bpR(x.amt)+' · '+mbLabel(x.from)+' → '+mbLabel(x.to)+(x.c.transactionDate!==x.d.transactionDate?' (credited '+x.c.transactionDate+')':'')),
      h('button',{className:'btn btn-ghost btn-sm',style:{fontSize:11,padding:'1px 8px'},onClick:()=>mark([x])},'Mark')))));
}

// ── #10 / #11 Balances and last statement per account ──
function mbAccountStatus(sid,rows){
  if(typeof mbOn!=='function'||!mbOn(sid))return[];const acc=mbAccounts(sid);if(!acc.length)return[];const p=acc[0].id;
  return acc.map(a=>{const rs=(rows||[]).filter(r=>r&&((r.acct||p)===a.id));const last=rs.map(r=>toISO(r.transactionDate)).filter(Boolean).sort().pop()||'';
    const bal=typeof mbLatestBalance==='function'?mbLatestBalance(sid,rs.map(r=>({...r,acct:a.id}))):null;
    return{a,lines:rs.length,last,bal:bal?bal.b:null,days:last?Math.floor((Date.now()-new Date(last+'T00:00:00').getTime())/864e5):null};});
}
function bpStaleDays(sid){const n=typeof controlLimit==='function'?controlLimit('mbStaleStatement',sid):0;return n>0?n:7;}
function MbBalances({sid,rows}){
  const h=React.createElement;if(!bpOn('mbBalances',sid))return null;const st=mbAccountStatus(sid,rows);if(st.length<2&&!(st[0]&&st[0].lines))return null;
  const lim=bpStaleDays(sid);const dmy=i=>i?i.split('-').reverse().join('/'):'—';
  return h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}},st.map(s=>h('div',{key:s.a.id,style:{padding:'6px 10px',borderRadius:'var(--r)',border:'1px solid '+(s.days!=null&&s.days>lim?'rgba(240,160,40,0.55)':'var(--border)'),background:'var(--bg3)',fontSize:12}},
    h('div',{style:{fontWeight:700}},'🏦 '+mbLabel(s.a)),
    h('div',null,s.bal!=null?'Balance '+bpR(s.bal):'Balance —',' · last line '+dmy(s.last)),
    s.days!=null&&s.days>lim&&h('div',{style:{color:'var(--orange)',fontSize:11}},'No statement for '+s.days+' days — upload the latest'),
    !s.lines&&h('div',{style:{color:'var(--orange)',fontSize:11}},'No statement uploaded yet'))));
}
// Dashboard "Needs attention": accounts with no statement for longer than the limit.
if(typeof dataGapsFor==='function'){
  const _bpDataGaps=dataGapsFor;
  dataGapsFor=function(salon){
    const gaps=_bpDataGaps.apply(this,arguments);
    try{const sid=salon&&salon.id;if(sid!=null&&bpOn('mbStaleStatement',sid)){const lim=bpStaleDays(sid);
      mbAccountStatus(sid,loadBankStatementRows(sid)).forEach(s=>{
        if(s.lines&&s.days!=null&&s.days>lim)gaps.push({kind:'bank',tab:'bank-statement',text:'Bank statement: '+mbLabel(s.a)+' — nothing since '+s.last.split('-').reverse().join('/')+' ('+s.days+' days)'});
        else if(!s.lines&&!s.a.primary)gaps.push({kind:'bank',tab:'bank-statement',text:'Bank statement: '+mbLabel(s.a)+' — no statement uploaded yet'});});}}catch(e){}
    return gaps;
  };
}

// ── #12 P&L Final with vendor bills not in it ──
function pvcFinalOk(sid,year,month){
  if(!bpOn('pnlFinalNeedsBills',sid)||typeof pvcRows!=='function')return true;
  const bad=pvcRows(sid,year,month).filter(r=>!r.ok);
  if(bad.length&&!window.confirm(bad.length+' vendor bill'+(bad.length===1?'':'s')+' of this month '+(bad.length===1?'is':'are')+' not in the P&L ('+bad.slice(0,4).map(r=>r.vendor+' '+r.no+' '+bpR(r.amount)).join(', ')+(bad.length>4?' …':'')+') — their category has no P&L line.\n\nMark the P&L Final anyway? (Cancel to fix the category in Vendors first.)'))return false;
  return bpNotesFinalOk(sid,year,month);
}

// ── #13 Reasons for big changes on a P&L line ──
function bpNotesKey(sid){return outletKey('salonos_pnl_line_notes',sid);}
function bpNotes(sid){try{const v=JSON.parse(cachedLocalGet(bpNotesKey(sid))||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}}
function bpNoteSet(sid,ym,line,text){const n=bpNotes(sid);n[ym]={...(n[ym]||{})};if(String(text||'').trim())n[ym][line]={text:String(text).trim(),by:(typeof currentSessionUser==='function'&&(currentSessionUser()||{}).name)||'',at:new Date().toISOString()};else delete n[ym][line];safeLocalSet(bpNotesKey(sid),JSON.stringify(n));}
function bpLimitPct(sid){const n=typeof controlLimit==='function'?controlLimit('pnlLineNotes',sid):0;return n>0?n:30;}
// Operating expense lines that moved more than the limit from the previous month (and by ₹1,000 or more).
function bpBigMoves(sid,year,month){
  if(!bpOn('pnlLineNotes',sid)||typeof operatingExpensesFor!=='function')return[];
  const pm=month===0?{y:year-1,m:11}:{y:year,m:month-1};const cur=operatingExpensesFor(sid,year,month).lines,prev=operatingExpensesFor(sid,pm.y,pm.m).lines;const lim=bpLimitPct(sid);
  return cur.map(l=>{const p=(prev.find(x=>x.name===l.name)||{}).amt||0;const d=l.amt-p;const pct=p?Math.round(d/Math.abs(p)*100):(l.amt?100:0);
    return{line:l.name,cur:l.amt,prev:p,diff:d,pct};}).filter(x=>Math.abs(x.diff)>=1000&&Math.abs(x.pct)>=lim);
}
function bpNotesFinalOk(sid,year,month){
  if(!bpOn('pnlLineNotes',sid))return true;const ym=year+'-'+String(month+1).padStart(2,'0');const n=bpNotes(sid)[ym]||{};
  const miss=bpBigMoves(sid,year,month).filter(x=>!n[x.line]);if(!miss.length)return true;
  return window.confirm(miss.length+' expense line'+(miss.length===1?'':'s')+' moved more than '+bpLimitPct(sid)+'% from last month without a reason: '+miss.slice(0,4).map(x=>x.line+' ('+(x.pct>0?'+':'')+x.pct+'%)').join(', ')+(miss.length>4?' …':'')+'.\n\nOpen the line on the P&L to add a reason. Mark the P&L Final anyway?');
}
function PnlLineNote({sid,year,month,lineName}){
  const h=React.createElement;const [,t]=useState(0);if(sid==null||!bpOn('pnlLineNotes',sid))return null;
  const mv=bpBigMoves(sid,year,month).find(x=>x.line===lineName);const ym=year+'-'+String(month+1).padStart(2,'0');const note=(bpNotes(sid)[ym]||{})[lineName];
  if(!mv&&!note)return null;
  return h('div',{style:{margin:'8px 0 12px',padding:'8px 10px',borderRadius:'var(--r)',background:'rgba(240,160,40,0.08)',border:'1px solid rgba(240,160,40,0.35)',fontSize:12.5}},
    mv&&h('div',{style:{marginBottom:6}},'📈 '+(mv.diff>0?'Up ':'Down ')+Math.abs(mv.pct)+'% from last month ('+bpR(mv.prev)+' → '+bpR(mv.cur)+'). Why?'),
    h('input',{key:(note&&note.text)||'',className:'form-control',style:{fontSize:12.5},defaultValue:note?note.text:'',placeholder:'e.g. Diwali campaign — Google Ads',
      onBlur:e=>{if(e.target.value!==(note?note.text:'')){bpNoteSet(sid,ym,lineName,e.target.value);t(x=>x+1);}}}),
    note&&h('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:3}},'Reason by '+(note.by||'—')+' · '+new Date(note.at).toLocaleDateString('en-IN')));
}

if(typeof HELP_TOPICS!=='undefined'&&Array.isArray(HELP_TOPICS)&&!HELP_TOPICS.some(t=>t.title==='Bank accounts & P&L checks'))HELP_TOPICS.push({title:'Bank accounts & P&L checks',body:[
  '<b>Own transfers</b>: money moved between two of the outlet’s bank accounts (same amount out of one and into another within 3 days) is found on Bank Statement — “Mark all as Transfer”.',
  '<b>Balances</b>: Bank Statement shows each account’s latest balance and its last line date; the dashboard warns when an account has no statement for more than the set days.',
  '<b>P&L Final</b>: marking Final asks first if vendor bills of the month aren’t in the P&L, or if an expense line moved a lot from last month without a reason.',
  '<b>Reasons</b>: click a P&L expense line that moved more than the set % — type why in the box.'
]});
