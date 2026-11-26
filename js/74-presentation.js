// ── Presentation (26/11/2026): picture first, details on click ──
// Read-only views built on the same figures the P&L uses (plBuild) — nothing here saves data.
//   • rupeeL — headline amounts in lakhs / crores (tables keep exact rupees)
//   • PresEmpty — one look for "nothing here yet" with the next step
//   • MonthPulseCard — Outlet Dashboard: 4 big figures, where each ₹100 went, 6-month revenue, month-close checklist
//   • OutletScorecard — Master Dashboard: one row per outlet, with status dot and close progress
//   • PnlTrendCard — P&L: 12-month revenue / cost / profit bars and the cost split

function rupeeL(n){
  const v=Number(n)||0,a=Math.abs(v),s=v<0?'−':'';
  if(a>=1e7)return s+'₹'+(a/1e7).toFixed(2)+' Cr';
  if(a>=1e5)return s+'₹'+(a/1e5).toFixed(2)+' L';
  return s+'₹'+Math.round(a).toLocaleString('en-IN');
}
function PresEmpty({icon,title,text,actionLabel,onAction}){
  const h=React.createElement;
  return h('div',{className:'pz-empty'},h('div',{className:'pz-empty-icon'},icon||'📭'),h('div',{className:'pz-empty-title'},title),
    text&&h('div',{className:'pz-empty-text'},text),actionLabel&&onAction&&h('button',{className:'btn btn-primary btn-sm',style:{marginTop:10},onClick:onAction},actionLabel));
}
const PZ_M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function pzPl(sid,y,m){try{const f=calToFYMI(y,m);return plBuild(sid,f.fy,f.mi);}catch(e){return null;}}
function pzLine(d,si,name){const S=d&&d.sections&&d.sections[si];const l=S&&S.lines.find(x=>x.name===name);return l?Number(l.amt)||0:0;}
// Where the money went: products, staff, rent & fixed, other, profit (each as ₹ and % of revenue).
function pzSplit(d){
  if(!d||!d.revenue)return null;
  const staff=(d.sections[2]||{}).tot||0;const rent=pzLine(d,3,'Rent')+pzLine(d,3,'Staff Room Rent')+pzLine(d,3,'Maintenance Expenses');
  const other=Math.max(0,d.opex-staff-rent+(d.belowTot||0));
  return[{k:'Products & direct',v:d.direct,c:'#7F77DD'},{k:'Staff',v:staff,c:'#1D9E75'},{k:'Rent & fixed',v:rent,c:'#D85A30'},{k:'Other costs',v:other,c:'#888780'},{k:d.pbt>=0?'Profit':'Loss',v:d.pbt,c:d.pbt>=0?'#639922':'#E24B4A'}]
    .map(x=>({...x,p:x.v/d.revenue*100}));
}
function PzSplitBar({d,onPick}){
  const h=React.createElement;const parts=pzSplit(d);if(!parts)return null;
  const pos=parts.filter(x=>x.v>0);
  return h('div',null,
    h('div',{className:'pz-split'},pos.map(x=>h('div',{key:x.k,title:x.k+': '+rupeeL(x.v)+' ('+x.p.toFixed(1)+'%)',onClick:onPick?()=>onPick(x.k):undefined,
      style:{width:Math.max(2,x.p)+'%',background:x.c,cursor:onPick?'pointer':'default'}},x.p>=7?x.k.split(' ')[0]+' '+Math.round(x.p):''))),
    h('div',{className:'pz-legend'},parts.map(x=>h('span',{key:x.k},h('i',{style:{background:x.c}}),x.k+' ',h('b',null,rupeeL(x.v)),' · '+x.p.toFixed(1)+'%'))));
}
function PzBars({items,height}){ // items: [{label, v, hi}]
  const h=React.createElement;const max=Math.max(1,...items.map(x=>Math.abs(x.v)||0));
  return h('div',null,h('div',{className:'pz-bars',style:{height:height||80}},items.map((x,i)=>h('div',{key:i,className:'pz-bar'+(x.hi?' hi':''),title:x.label+': '+rupeeL(x.v),style:{height:Math.max(2,Math.abs(x.v)/max*100)+'%'}}))),
    h('div',{className:'pz-bars-lbl'},items.map((x,i)=>h('span',{key:i},x.label))));
}
// Month-close checklist for one outlet and month.
function pzClose(sid,y,m){
  const key=k=>y+'-'+String(m+1).padStart(2,'0')+'-'+String(k).padStart(2,'0');
  const dim=new Date(y,m+1,0).getDate();const now=new Date();const upto=(now.getFullYear()===y&&now.getMonth()===m)?now.getDate():dim;
  const out=[];
  try{const sales=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',sid))||'{}')||{};let n=0;for(let d=1;d<=upto;d++){const v=sales[key(d)];if(v&&typeof v==='object'&&Object.keys(v).length)n++;}
    out.push({k:'Daily sales',tab:'daily-sales',done:n>=upto,note:n+' of '+upto+' days'});}catch(e){}
  try{const b=bankRecoStatusFor(sid,y,m);out.push({k:'Bank mapped',tab:'bank-statement',done:b.lines>0&&b.open===0,note:b.lines?b.done+' of '+b.lines+' lines':'no statement yet'});}catch(e){}
  try{out.push({k:'Attendance final',tab:'attendance',done:isManagerFinalMonth(sid,'attendance',y,m)||isMonthLockedFor(sid,y,m)});}catch(e){}
  const approved=(meta,list)=>{const n=list.filter(e=>((meta[attMonthKey(e.id,y,m)]||{}).status)==='Approved').length;return{n,t:list.length};};
  try{const sw=swWorkingsFor(sid,y,m)||[];const a=approved(loadSWMeta(sid),sw);out.push({k:'Salary approved',tab:'salary-working',done:a.t>0&&a.n===a.t||isMonthLockedFor(sid,y,m),note:a.t?a.n+' of '+a.t:''});}catch(e){}
  try{if(!isRestaurantOutlet(sid)){const iw=incWorkingsFor(sid,y,m)||[];const a=approved(loadIWMeta(sid),iw);out.push({k:'Incentive approved',tab:'incentive-working',done:a.t>0&&a.n===a.t||isMonthLockedFor(sid,y,m),note:a.t?a.n+' of '+a.t:''});}}catch(e){}
  try{const f=calToFYMI(y,m);out.push({k:'P&L final',tab:'outlet-pnl',done:isPnlFinal(sid,f.fy,f.mi)});}catch(e){}
  return out;
}

function MonthPulseCard({salon,period,onNavTab}){
  const h=React.createElement;const sid=salon&&salon.id;const ver=typeof storeVersion==='function'?storeVersion():0;
  const c=periodToCalendar(period)||{year:new Date().getFullYear(),month:new Date().getMonth()};
  const data=useMemo(()=>{if(sid==null)return null;
    const months=[];for(let i=5;i>=0;i--){const d=new Date(c.year,c.month-i,1);months.push({y:d.getFullYear(),m:d.getMonth()});}
    const pls=months.map(x=>({...x,d:pzPl(sid,x.y,x.m)}));
    return{pls,cur:pls[5].d,prev:pls[4].d,close:pzClose(sid,c.year,c.month)};
  },[sid,c.year,c.month,ver]);
  if(!data||!data.cur)return null;
  const d=data.cur,p=data.prev;const go=t=>onNavTab&&onNavTab(t);
  const staff=(d.sections[2]||{}).tot||0;const rent=pzLine(d,3,'Rent')+pzLine(d,3,'Staff Room Rent')+pzLine(d,3,'Maintenance Expenses');
  const pct=(x,base)=>base?(x/base*100).toFixed(1)+'% of revenue':'';
  const chg=(x,y)=>{if(!y)return null;const r=(x-y)/Math.abs(y)*100;if(Math.abs(r)>=1000)return Math.round(x/y)+'× last month';return(r>=0?'▲ ':'▼ ')+Math.abs(r).toFixed(1)+'% vs last month';};
  const kpi=(label,v,sub,color,tab,cost)=>{const ch=p?chg(v,label==='Revenue'?p.revenue:label==='Staff cost'?((p.sections[2]||{}).tot||0):label==='Profit before tax'?p.pbt:null):null;
    return h('div',{className:'pz-kpi',onClick:tab?()=>go(tab):undefined,style:{cursor:tab?'pointer':'default'}},h('div',{className:'pz-kpi-l'},label),h('div',{className:'pz-kpi-v',style:color?{color}:undefined},rupeeL(v)),
      h('div',{className:'pz-kpi-s'},sub),ch&&h('div',{className:'pz-kpi-s',style:{color:(cost?ch.startsWith('▼'):ch.startsWith('▲'))||ch.includes('×')&&!cost?'var(--green)':'var(--red)'}},ch));};
  const doneN=data.close.filter(x=>x.done).length;const final=data.close.length&&doneN===data.close.length;
  return h('div',{className:'card pz-card',style:{marginBottom:16}},
    h('div',{className:'pz-head'},h('div',null,h('span',{className:'pz-title'},PZ_M[c.month]+' '+c.year+' at a glance')),
      h('span',{className:'pz-pill '+(final?'ok':'warn')},final?'Month closed':'Draft · '+doneN+' of '+data.close.length+' close steps done')),
    h('div',{className:'pz-kpis'},
      kpi('Revenue',d.revenue,'',null,'outlet-pnl'),
      kpi('Staff cost',staff,pct(staff,d.revenue),null,'salary-working',true),
      kpi('Rent & fixed',rent,pct(rent,d.revenue),null,'recurring-expenses',true),
      kpi('Profit before tax',d.pbt,pct(d.pbt,d.revenue).replace('of revenue','margin'),d.pbt>=0?'var(--green)':'var(--red)','outlet-pnl')),
    h('div',{className:'pz-grid'},
      h('div',{className:'pz-box'},
        h('div',{className:'pz-sub'},'Where each ₹100 of revenue went'),h(PzSplitBar,{d,onPick:()=>go('outlet-pnl')}),
        h('div',{className:'pz-sub',style:{marginTop:14}},'Revenue — last 6 months'),
        h(PzBars,{items:data.pls.map((x,i)=>({label:PZ_M[x.m],v:x.d?x.d.revenue:0,hi:i===5}))})),
      h('div',{className:'pz-box'},
        h('div',{className:'pz-sub'},'Month close — '+doneN+' of '+data.close.length+' done'),
        data.close.map(x=>h('div',{key:x.k,className:'pz-step'+(x.done?' done':''),onClick:()=>go(x.tab),title:'Open '+x.k},
          h('span',{className:'pz-dot'},x.done?'✓':''),h('span',{style:{flex:1}},x.k),x.note&&h('span',{className:'pz-note'},x.note))))));
}

// Master Dashboard: one row per outlet for a chosen month.
function OutletScorecard({salons,onOpen}){
  const h=React.createElement;const now=new Date();const ver=typeof storeVersion==='function'?storeVersion():0;
  const [ym,setYm]=useState(()=>{const d=new Date(now.getFullYear(),now.getMonth()-(now.getDate()<8?1:0),1);return{y:d.getFullYear(),m:d.getMonth()};});
  const [sort,setSort]=useState('status');
  const list=(salons||[]).filter(s=>s&&s.status!=='Inactive');
  const rows=useMemo(()=>list.map(s=>{const d=pzPl(s.id,ym.y,ym.m);const cl=pzClose(s.id,ym.y,ym.m);const done=cl.filter(x=>x.done).length;
    const rev=d?d.revenue:0,staff=d?((d.sections[2]||{}).tot||0):0,pbt=d?d.pbt:0;const margin=rev?pbt/rev*100:null,staffPct=rev?staff/rev*100:null;
    const status=!rev?'grey':pbt<0||(staffPct!=null&&staffPct>45)?'red':(margin!=null&&margin<5)||done<cl.length/2?'amber':'green';
    return{s,rev,staff,pbt,margin,staffPct,done,steps:cl.length,status};}),[list.map(s=>s.id).join(','),ym.y,ym.m,ver]);
  const rank={red:0,amber:1,green:2,grey:3};
  const sorted=[...rows].sort((a,b)=>sort==='status'?(rank[a.status]-rank[b.status])||(b.rev-a.rev):sort==='rev'?b.rev-a.rev:(b.margin??-999)-(a.margin??-999));
  const tot=rows.reduce((t,r)=>({rev:t.rev+r.rev,staff:t.staff+r.staff,pbt:t.pbt+r.pbt}),{rev:0,staff:0,pbt:0});
  const opts=[];for(let i=0;i<12;i++){const d=new Date(now.getFullYear(),now.getMonth()-i,1);opts.push({y:d.getFullYear(),m:d.getMonth()});}
  const th=(l,k,right)=>h('th',{style:{textAlign:right?'right':'left',cursor:k?'pointer':'default'},onClick:k?()=>setSort(k):undefined},l+(sort===k?' ▾':''));
  return h('div',{className:'card pz-card',style:{marginBottom:16}},
    h('div',{className:'pz-head'},h('span',{className:'pz-title'},'Outlet scorecard'),
      h('select',{className:'form-control',style:{width:'auto'},value:ym.y+'-'+ym.m,onChange:e=>{const[a,b]=e.target.value.split('-').map(Number);setYm({y:a,m:b});}},opts.map(o=>h('option',{key:o.y+'-'+o.m,value:o.y+'-'+o.m},PZ_M[o.m]+' '+o.y)))),
    h('div',{className:'pz-kpis',style:{marginBottom:12}},
      h('div',{className:'pz-kpi'},h('div',{className:'pz-kpi-l'},'Revenue, all outlets'),h('div',{className:'pz-kpi-v'},rupeeL(tot.rev))),
      h('div',{className:'pz-kpi'},h('div',{className:'pz-kpi-l'},'Staff cost'),h('div',{className:'pz-kpi-v'},rupeeL(tot.staff)),h('div',{className:'pz-kpi-s'},tot.rev?(tot.staff/tot.rev*100).toFixed(1)+'% of revenue':'')),
      h('div',{className:'pz-kpi'},h('div',{className:'pz-kpi-l'},'Profit before tax'),h('div',{className:'pz-kpi-v',style:{color:tot.pbt>=0?'var(--green)':'var(--red)'}},rupeeL(tot.pbt)),h('div',{className:'pz-kpi-s'},tot.rev?(tot.pbt/tot.rev*100).toFixed(1)+'% margin':'')),
      h('div',{className:'pz-kpi'},h('div',{className:'pz-kpi-l'},'Months closed'),h('div',{className:'pz-kpi-v'},rows.filter(r=>r.steps&&r.done===r.steps).length+' of '+rows.length))),
    h('div',{className:'table-wrap'},h('table',{className:'pz-table'},
      h('thead',null,h('tr',null,th('Outlet','status'),th('Revenue','rev',true),h('th',{style:{textAlign:'right'}},'Staff %'),th('Profit %','margin',true),h('th',{style:{textAlign:'right'}},'Profit'),h('th',null,'Month close'))),
      h('tbody',null,sorted.map(r=>h('tr',{key:r.s.id,onClick:()=>onOpen&&onOpen(r.s,'outlet-dashboard'),style:{cursor:'pointer'},title:'Open '+r.s.name},
        h('td',null,h('span',{className:'pz-status '+r.status}),String(r.s.name).split('—')[0].trim()),
        h('td',{className:'num'},r.rev?rupeeL(r.rev):'—'),
        h('td',{className:'num',style:{color:r.staffPct>45?'var(--red)':undefined}},r.staffPct!=null?r.staffPct.toFixed(1)+'%':'—'),
        h('td',{className:'num',style:{color:r.margin==null?undefined:r.margin<0?'var(--red)':r.margin<5?'var(--orange)':'var(--green)'}},r.margin!=null?r.margin.toFixed(1)+'%':'—'),
        h('td',{className:'num'},r.rev?rupeeL(r.pbt):'—'),
        h('td',null,h('div',{className:'pz-prog'},h('div',{style:{width:(r.steps?r.done/r.steps*100:0)+'%'}})),h('span',{className:'pz-note'},r.done+'/'+r.steps))))))),
    h('div',{className:'pz-note',style:{marginTop:6}},'● red: loss or staff cost above 45% · amber: margin under 5% or month close less than half done · green: on track · grey: no figures. Click an outlet to open it.'));
}

// P&L: 12 months of revenue, total cost and profit, and this month's cost split.
function PnlTrendCard({sid,fy,mi}){
  const h=React.createElement;const ver=typeof storeVersion==='function'?storeVersion():0;
  const cal=periodToCalendar({fy,mi});
  const data=useMemo(()=>{if(sid==null||!cal)return null;const out=[];for(let i=11;i>=0;i--){const d=new Date(cal.year,cal.month-i,1);const pl=pzPl(sid,d.getFullYear(),d.getMonth());out.push({m:d.getMonth(),y:d.getFullYear(),pl});}return out;},[sid,fy,mi,ver]);
  const [open,setOpen]=useState(()=>{try{return localStorage.getItem('sos_pl_trend')!=='0';}catch(e){return true;}});
  if(!data)return null;const cur=data[11].pl;if(!data.some(x=>x.pl&&x.pl.revenue))return null;
  const toggle=()=>{setOpen(o=>{try{localStorage.setItem('sos_pl_trend',o?'0':'1');}catch(e){}return!o;});};
  const max=Math.max(1,...data.map(x=>x.pl?Math.max(x.pl.revenue,x.pl.direct+x.pl.opex):0));
  return h('div',{className:'card pz-card',style:{marginBottom:16}},
    h('div',{className:'pz-head',style:{cursor:'pointer'},onClick:toggle},h('span',{className:'pz-title'},'📈 Last 12 months'),h('span',{className:'pz-note'},open?'Hide ▴':'Show ▾')),
    open&&h('div',{className:'pz-grid'},
      h('div',{className:'pz-box'},
        h('div',{className:'pz-trend'},data.map((x,i)=>{const r=x.pl?x.pl.revenue:0,c=x.pl?x.pl.direct+x.pl.opex:0,p=x.pl?x.pl.pbt:0;
          return h('div',{key:i,className:'pz-tcol'+(i===11?' hi':''),title:PZ_M[x.m]+' '+x.y+' — revenue '+rupeeL(r)+' · cost '+rupeeL(c)+' · profit '+rupeeL(p)},
            h('div',{className:'pz-tbars'},h('i',{className:'r',style:{height:r/max*100+'%'}}),h('i',{className:'c',style:{height:c/max*100+'%'}})),
            h('div',{className:'pz-tp',style:{color:p>=0?'var(--green)':'var(--red)'}},r?(p>=0?'+':'−')+(Math.abs(p)>=1e5?(Math.abs(p)/1e5).toFixed(1)+'L':Math.round(Math.abs(p)/1000)+'k'):''),
            h('div',{className:'pz-tl'},PZ_M[x.m]));})),
        h('div',{className:'pz-legend'},h('span',null,h('i',{style:{background:'#378ADD'}}),'Revenue'),h('span',null,h('i',{style:{background:'#B4B2A9'}}),'Total cost'),h('span',null,'Profit / loss under each month'))),
      h('div',{className:'pz-box'},h('div',{className:'pz-sub'},'Where each ₹100 went — '+PZ_M[cal.month]+' '+cal.year),cur&&cur.revenue?h(PzSplitBar,{d:cur}):h('div',{className:'pz-note'},'No revenue this month yet.'))));
}
