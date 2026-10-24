// ═════════════════════════════════════════════════════════════════════════════════════════════
// Daily Collection & Expenses report — Reports Hub, for the Super Admin and the Salon Owner only
// (Controls → Approvals & month close → Reports → dceReport). For a date or a date range, every
// outlet the user can see (or one outlet): collections by mode, sale, outstanding, expenses by head,
// collection − expenses, and the cash drawer (opening → closing, counted, difference) — straight from
// each outlet's Daily Sales & Exp. The cash chain is worked out exactly as Daily Sales & Exp does:
// Closing = Opening + Cash Sale + Outstanding Recovery (cash) + Cash Received − Cash Packet − Cash
// Handover − Bank Deposit − the day's expenses; a day's Opening is the previous recorded day's Closing.
// Excel (Summary / Expenses / Day-wise), WhatsApp summary and print.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const DCE_I={cash:0,card:1,upi:2,luzo:3,osale:4,orec:5,opening:8,packet:9,handover:10,deposit:11,received:12,swiggy:14,zomato:15,eazy:16,count:17,ownly:19,ebm:20};
let DCE_LAST=null;
function dceAllowed(){const u=typeof currentSessionUser==='function'?currentSessionUser():null;return !!u&&((typeof isSuperAdminUser==='function'&&isSuperAdminUser(u))||u.role==='Super Admin'||u.role==='Salon Owner'||u.role==='Owner');}
function dceM(n){const v=Math.round(Number(n)||0);return(v<0?'−':'')+'₹'+Math.abs(v).toLocaleString('en-IN');}
function dceDmy(iso){return iso?String(iso).slice(0,10).split('-').reverse().join('/'):'';}
function dceJ(k){try{return JSON.parse(cachedLocalGet(k)||'{}')||{};}catch(e){return{};}}
// Daily incentives paid are copied into Daily Sales & Exp expenses when that sheet opens — do the same
// first, so the report always matches the sheet.
function dceSrc(sid){if(typeof syncDailyIncentiveToDSE==='function'){try{syncDailyIncentiveToDSE(sid);}catch(e){}}return{sales:dceJ(outletKey('salonos_daily_sales_collection_data',sid)),entries:dceJ(outletKey('salonos_daily_sales_collection_entrydata',sid)),exp:typeof loadDseDataFor==='function'?loadDseDataFor(sid):dceJ(outletKey('salonos_daily_sales_data',sid))};}
const dceHas=o=>!!o&&Object.keys(o).length>0;
function dceExpTotal(exp,iso){const d=exp[iso]||{};return(typeof EXPENSE_ROWS!=='undefined'?EXPENSE_ROWS:[]).reduce((s,r,ri)=>{const v=Number(d[ri])||0;if(!v)return s;return r.name==='Penalties'?s-v:s+v;},0);}
// The cash drawer chain for one outlet: {iso:{opening,closing}} for every recorded day.
function dceChain(S){
  const n=(iso,i)=>Number((S.sales[iso]||{})[i])||0;const cashRec=iso=>(((S.entries[iso]||{})[DCE_I.orec])||[]).filter(e=>e&&e.mode==='Cash').reduce((t,e)=>t+(Number(e.amount)||0),0);
  let first=null;Object.keys(S.sales).forEach(d=>{if(dceHas(S.sales[d])&&(first===null||d<first))first=d;});
  const dates=[...new Set([...Object.keys(S.sales).filter(d=>dceHas(S.sales[d])),...Object.keys(S.entries).filter(d=>dceHas(S.entries[d])),...Object.keys(S.exp).filter(d=>dceHas(S.exp[d]))])].sort();
  const out={};let prevClose=null;
  dates.forEach(d=>{const opening=(first===null||d<=first||prevClose===null)?n(d,DCE_I.opening):prevClose;
    const closing=opening+n(d,DCE_I.cash)+cashRec(d)+n(d,DCE_I.received)-n(d,DCE_I.packet)-n(d,DCE_I.handover)-n(d,DCE_I.deposit)-dceExpTotal(S.exp,d);
    out[d]={opening,closing};if(first!==null&&d>=first)prevClose=closing;});
  return out;
}
// One outlet, one day.
function dceDay(S,chain,iso){
  const s=S.sales[iso]||{};const n=i=>Number(s[i])||0;const has=dceHas(s)||dceHas(S.entries[iso])||dceHas(S.exp[iso]);
  const apps=n(DCE_I.swiggy)+n(DCE_I.zomato)+n(DCE_I.eazy)+n(DCE_I.ownly)+n(DCE_I.ebm);
  const heads={};const d=S.exp[iso]||{};(typeof EXPENSE_ROWS!=='undefined'?EXPENSE_ROWS:[]).forEach((r,ri)=>{const v=Number(d[ri])||0;if(v)heads[r.name]=(heads[r.name]||0)+(r.name==='Penalties'?-v:v);});
  const exp=dceExpTotal(S.exp,iso);const coll=n(DCE_I.cash)+n(DCE_I.card)+n(DCE_I.upi)+n(DCE_I.luzo)+apps+n(DCE_I.orec);
  const ch=chain[iso];const cnt=s[DCE_I.count];
  return{iso,has,cash:n(DCE_I.cash),card:n(DCE_I.card),upi:n(DCE_I.upi),other:n(DCE_I.luzo)+apps,osale:n(DCE_I.osale),orec:n(DCE_I.orec),
    sale:n(DCE_I.cash)+n(DCE_I.card)+n(DCE_I.upi)+n(DCE_I.luzo)+apps+n(DCE_I.osale),coll,exp,heads,net:coll-exp,
    deposit:n(DCE_I.deposit),handover:n(DCE_I.handover)+n(DCE_I.packet),opening:ch?ch.opening:null,closing:ch?ch.closing:null,
    counted:cnt===''||cnt==null?null:Number(cnt),diff:cnt===''||cnt==null||!ch?null:Number(cnt)-ch.closing};
}
function dceDates(from,to){const out=[];let d=new Date(from+'T00:00:00');const e=new Date(to+'T00:00:00');for(let i=0;d<=e&&i<400;i++){out.push(typeof localIsoOf==='function'?localIsoOf(d):d.toISOString().slice(0,10));d.setDate(d.getDate()+1);}return out;}
// Everything the report shows, for a set of outlets and a date range.
function dceBuild(sids,from,to){
  const dates=dceDates(from,to);const outlets=sids.map(sid=>{const S=dceSrc(sid);const chain=dceChain(S);const days=dates.map(iso=>dceDay(S,chain,iso));const nm=String(((typeof SALONS!=='undefined'?SALONS:[]).find(s=>String(s.id)===String(sid))||{}).name||sid);
    const sum=k=>days.reduce((t,x)=>t+(Number(x[k])||0),0);const heads={};days.forEach(x=>Object.entries(x.heads).forEach(([k,v])=>{heads[k]=(heads[k]||0)+v;}));
    const firstRec=days.find(x=>x.opening!=null),lastRec=[...days].reverse().find(x=>x.closing!=null);const lastCnt=[...days].reverse().find(x=>x.counted!=null);
    return{sid,name:nm.split('—')[0].trim(),days,heads,missing:days.filter(x=>!x.has).map(x=>x.iso),
      t:{cash:sum('cash'),card:sum('card'),upi:sum('upi'),other:sum('other'),osale:sum('osale'),orec:sum('orec'),sale:sum('sale'),coll:sum('coll'),exp:sum('exp'),net:sum('net'),deposit:sum('deposit'),handover:sum('handover'),
        opening:firstRec?firstRec.opening:null,closing:lastRec?lastRec.closing:null,diff:lastCnt?lastCnt.diff:null}};});
  const T={};['cash','card','upi','other','osale','orec','sale','coll','exp','net','deposit','handover'].forEach(k=>{T[k]=outlets.reduce((t,o)=>t+o.t[k],0);});
  T.closing=outlets.reduce((t,o)=>t+(o.t.closing||0),0);T.opening=outlets.reduce((t,o)=>t+(o.t.opening||0),0);
  const heads={};outlets.forEach(o=>Object.entries(o.heads).forEach(([k,v])=>{heads[k]=(heads[k]||0)+v;}));
  return{from,to,dates,outlets,T,heads};
}
function dceText(R){const L=['📊 Daily Collection & Expenses — '+(R.from===R.to?dceDmy(R.from):dceDmy(R.from)+' to '+dceDmy(R.to))];
  R.outlets.forEach(o=>{L.push('','🏪 '+o.name,'Sale '+dceM(o.t.sale)+' · Collection '+dceM(o.t.coll)+' (Cash '+dceM(o.t.cash)+', Card '+dceM(o.t.card)+', UPI '+dceM(o.t.upi)+(o.t.other?', Other '+dceM(o.t.other):'')+')','Expenses '+dceM(o.t.exp)+' · Net '+dceM(o.t.net)+(o.t.closing!=null?' · Closing cash '+dceM(o.t.closing):'')+(o.missing.length?' · ⚠ no entries '+o.missing.length+' day(s)':''));});
  if(R.outlets.length>1)L.push('','TOTAL: Collection '+dceM(R.T.coll)+' · Expenses '+dceM(R.T.exp)+' · Net '+dceM(R.T.net));return L.join('\n');}
async function dceExcel(R){
  if(!R)return;await loadExcelJS();const wb=new ExcelJS.Workbook();wb.creator='SalonOS';const hdr=ws=>{const r=ws.getRow(1);r.font={bold:true,color:{argb:'FFFFFFFF'}};r.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF14335E'}};};const money='#,##0;[Red]-#,##0';
  const a=wb.addWorksheet('Summary');a.addRow(['Outlet','Total sale','Cash','Card','UPI','Other','Outstanding sale','Outstanding recovery','Total collection','Expenses','Collection − expenses','Opening cash','Closing cash','Counted − closing','Days with no entries']);hdr(a);
  R.outlets.forEach(o=>a.addRow([o.name,o.t.sale,o.t.cash,o.t.card,o.t.upi,o.t.other,o.t.osale,o.t.orec,o.t.coll,o.t.exp,o.t.net,o.t.opening,o.t.closing,o.t.diff,o.missing.length]));
  const n=R.outlets.length;if(n>1){const r=a.addRow(['Total',...['B','C','D','E','F','G','H','I','J','K','L','M'].map(c=>({formula:'SUM('+c+'2:'+c+(n+1)+')'}))]);r.font={bold:true};}
  a.columns.forEach((c,i)=>{c.width=i?15:26;if(i)c.numFmt=money;});
  const b=wb.addWorksheet('Expenses');b.addRow(['Expense head',...R.outlets.map(o=>o.name),'Total']);hdr(b);
  Object.keys(R.heads).sort((x,y)=>R.heads[y]-R.heads[x]).forEach(k=>{const r=b.addRow([k,...R.outlets.map(o=>o.heads[k]||0)]);r.getCell(n+2).value={formula:'SUM(B'+r.number+':'+String.fromCharCode(65+n)+r.number+')'};});
  b.columns.forEach((c,i)=>{c.width=i?15:32;if(i)c.numFmt=money;});
  const c=wb.addWorksheet('Day-wise');c.addRow(['Date','Outlet','Cash','Card','UPI','Other','Outstanding sale','Outstanding recovery','Total collection','Expenses','Collection − expenses','Opening cash','Closing cash','Cash counted','Counted − closing']);hdr(c);
  R.dates.forEach(d=>R.outlets.forEach(o=>{const x=o.days.find(y=>y.iso===d);if(!x)return;c.addRow([dceDmy(d),o.name,x.cash,x.card,x.upi,x.other,x.osale,x.orec,x.coll,x.exp,x.net,x.opening,x.closing,x.counted,x.diff]);}));
  c.columns.forEach((col,i)=>{col.width=i>1?14:(i?24:12);if(i>1)col.numFmt=money;});
  const buf=await wb.xlsx.writeBuffer();const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const url=URL.createObjectURL(blob);const el=document.createElement('a');el.href=url;el.download='Daily Collection & Expenses '+R.from+(R.to!==R.from?' to '+R.to:'')+'.xlsx';document.body.appendChild(el);el.click();el.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
}
function dcePrint(R){const esc=t=>String(t==null?'':t).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));const w=window.open('','_blank');if(!w){window.alert('Allow pop-ups to print.');return;}
  const row=(o,b)=>'<tr'+(b?' class="t"':'')+'><td>'+esc(o.name)+'</td>'+['sale','cash','card','upi','other','orec','coll','exp','net','closing'].map(k=>'<td>'+(o.t[k]==null?'—':esc(dceM(o.t[k])))+'</td>').join('')+'</tr>';
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Daily Collection & Expenses</title><style>body{font:12px Arial;margin:24px}table{border-collapse:collapse;width:100%;margin-bottom:16px}td,th{border:1px solid #bbb;padding:4px 6px;text-align:right}td:first-child,th:first-child{text-align:left}th{background:#eef3fa}tr.t td{font-weight:bold;background:#f6f6f6}</style></head><body><h2>Daily Collection & Expenses — '+esc(R.from===R.to?dceDmy(R.from):dceDmy(R.from)+' to '+dceDmy(R.to))+'</h2>'+
    '<table><tr><th>Outlet</th><th>Sale</th><th>Cash</th><th>Card</th><th>UPI</th><th>Other</th><th>Recovery</th><th>Collection</th><th>Expenses</th><th>Net</th><th>Closing cash</th></tr>'+R.outlets.map(o=>row(o)).join('')+(R.outlets.length>1?row({name:'Total',t:R.T},true):'')+'</table>'+
    '<table><tr><th>Expense head</th><th>Amount</th></tr>'+Object.keys(R.heads).sort((a,b)=>R.heads[b]-R.heads[a]).map(k=>'<tr><td>'+esc(k)+'</td><td>'+esc(dceM(R.heads[k]))+'</td></tr>').join('')+'</table><script>setTimeout(()=>window.print(),300)<\/script></body></html>');w.document.close();}

function DailyCollExpReport(){
  const h=React.createElement;const today=typeof localIsoOf==='function'?localIsoOf(new Date()):new Date().toISOString().slice(0,10);
  const [from,setFrom]=useState(today);const [to,setTo]=useState(today);const [sel,setSel]=useState('all');const [dayOutlet,setDayOutlet]=useState('');
  if(!dceAllowed())return h('div',{style:{fontSize:13,color:'var(--text3)'}},'This report is for the Super Admin and the Salon Owner.');
  const salons=((typeof salonsForCurrentUser==='function'?salonsForCurrentUser(SALONS):SALONS)||[]).filter(s=>s&&s.status!=='Inactive');
  const sids=sel==='all'?salons.map(s=>s.id):[sel];const f=from<=to?from:to,t=from<=to?to:from;
  const R=dceBuild(sids,f,t);DCE_LAST=R;
  const quick=(lbl,a,b)=>h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{setFrom(a);setTo(b);}},lbl);
  const dAdd=n=>{const d=new Date();d.setDate(d.getDate()+n);return typeof localIsoOf==='function'?localIsoOf(d):d.toISOString().slice(0,10);};
  const mStart=today.slice(0,8)+'01';
  const cell=(v,color,bold)=>h('td',{style:{textAlign:'right',whiteSpace:'nowrap',color:color||undefined,fontWeight:bold?700:undefined}},v==null?'—':dceM(v));
  const sumRow=(o,total)=>h('tr',{key:o.name,style:total?{background:'var(--bg3)',fontWeight:700}:undefined},h('td',null,o.name,!total&&o.missing.length?h('div',{style:{fontSize:10.5,color:'#b26a00'}},'⚠ no entries on '+(o.missing.length===R.dates.length?'any day':o.missing.length+' day(s)')):null),
    cell(o.t.sale),cell(o.t.cash),cell(o.t.card),cell(o.t.upi),cell(o.t.other),cell(o.t.orec),cell(o.t.coll,'var(--green)',true),cell(o.t.exp,'var(--red)'),cell(o.t.net,o.t.net<0?'var(--red)':'var(--text)',true),cell(o.t.opening),cell(o.t.closing,undefined,true),
    h('td',{style:{textAlign:'right',color:o.t.diff?(Math.abs(o.t.diff)>0?'var(--red)':'var(--green)'):'var(--text3)'}},o.t.diff==null?'—':(o.t.diff===0?'✓ 0':dceM(o.t.diff))));
  const dOut=R.outlets.find(o=>String(o.sid)===String(dayOutlet))||R.outlets[0];
  const heads=Object.keys(R.heads).filter(k=>R.heads[k]).sort((a,b)=>R.heads[b]-R.heads[a]);
  return h('div',null,
    h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:12}},
      h('label',{style:{fontSize:12}},'From ',h('input',{type:'date',className:'form-control',style:{width:'auto',display:'inline-block'},value:from,onChange:e=>setFrom(e.target.value)})),
      h('label',{style:{fontSize:12}},'To ',h('input',{type:'date',className:'form-control',style:{width:'auto',display:'inline-block'},value:to,onChange:e=>setTo(e.target.value)})),
      quick('Today',today,today),quick('Yesterday',dAdd(-1),dAdd(-1)),quick('Last 7 days',dAdd(-6),today),quick('This month',mStart,today),
      h('select',{className:'form-control',style:{width:'auto'},value:sel,onChange:e=>setSel(e.target.value)},h('option',{value:'all'},'All outlets ('+salons.length+')'),salons.map(s=>h('option',{key:s.id,value:s.id},String(s.name).split('—')[0].trim()))),
      h('span',{style:{flex:1}}),
      h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--green)'},onClick:()=>dceExcel(R)},'⬇ Excel'),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{const txt=dceText(R);window.open('https://wa.me/?text='+encodeURIComponent(txt),'_blank','noopener');}},'📲 WhatsApp'),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>dcePrint(R)},'🖨 Print')),
    h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginBottom:14}},
      [['Total collection',R.T.coll,'var(--green)'],['Expenses',R.T.exp,'var(--red)'],['Collection − expenses',R.T.net,R.T.net<0?'var(--red)':'var(--text)'],['Total sale',R.T.sale],['Bank deposit',R.T.deposit],['Closing cash (all)',R.T.closing]].map(([l,v,c])=>
        h('div',{key:l,className:'card',style:{padding:'10px 12px',margin:0}},h('div',{style:{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.05em'}},l),h('div',{style:{fontSize:20,fontWeight:700,color:c||'var(--text)'}},dceM(v))))),
    h('div',{style:{fontWeight:700,margin:'6px 0'}},'Outlet-wise'),
    h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Outlet','Sale','Cash','Card','UPI','Other','Recovery','Collection','Expenses','Net','Opening cash','Closing cash','Counted − closing'].map((x,i)=>h('th',{key:i,style:i?{textAlign:'right'}:null},x)))),
      h('tbody',null,R.outlets.map(o=>sumRow(o)),R.outlets.length>1&&sumRow({name:'Total',t:R.T,missing:[]},true)))),
    h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:14,marginTop:14}},
      h('div',null,h('div',{style:{fontWeight:700,margin:'6px 0'}},'Expenses by head'),
        heads.length?h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,h('th',null,'Head'),R.outlets.length>1&&R.outlets.map(o=>h('th',{key:o.sid,style:{textAlign:'right'}},o.name)),h('th',{style:{textAlign:'right'}},'Total'))),
          h('tbody',null,heads.map(k=>h('tr',{key:k},h('td',null,k),R.outlets.length>1&&R.outlets.map(o=>cell(o.heads[k]||0)),cell(R.heads[k],undefined,true)))))):h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No expenses entered.')),
      h('div',null,h('div',{style:{display:'flex',gap:8,alignItems:'center',margin:'6px 0'}},h('b',null,'Day-wise'),R.outlets.length>1&&h('select',{className:'form-control',style:{width:'auto',fontSize:12,padding:'3px 6px'},value:dOut?dOut.sid:'',onChange:e=>setDayOutlet(e.target.value)},R.outlets.map(o=>h('option',{key:o.sid,value:o.sid},o.name)))),
        dOut&&h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Date','Collection','Expenses','Net','Opening','Closing','Counted − closing'].map((x,i)=>h('th',{key:i,style:i?{textAlign:'right'}:null},x)))),
          h('tbody',null,[...dOut.days].reverse().map(x=>h('tr',{key:x.iso,style:!x.has?{color:'var(--text3)'}:undefined},h('td',null,dceDmy(x.iso),!x.has?h('span',{style:{fontSize:10.5,color:'#b26a00',marginLeft:6}},'no entries'):null),cell(x.coll,'var(--green)'),cell(x.exp,'var(--red)'),cell(x.net,x.net<0?'var(--red)':undefined,true),cell(x.opening),cell(x.closing),h('td',{style:{textAlign:'right',color:x.diff?'var(--red)':'var(--text3)'}},x.diff==null?'—':(x.diff===0?'✓ 0':dceM(x.diff)))))))))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:10}},'From each outlet’s Daily Sales & Exp. Collection = Cash + Card + UPI + other modes + outstanding recovery. Net = collection − expenses (Penalties collected count as income). Closing cash follows the Daily Sales & Exp cash drawer; Counted − closing uses the Physical Cash Count when entered.'));
}
