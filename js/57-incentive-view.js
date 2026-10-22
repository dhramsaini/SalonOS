// ═════════════════════════════════════════════════════════════════════════════════════════════
// Incentive Working — clearer presentation and optional calculation choices. Each item has its
// own switch in Controls → Salary & staff → Incentive Working view / Incentive calculation.
//   View: Simple / Detailed (incSimpleView), breakdown per stylist (incBreakdown), progress bars
//         (incProgress), why ₹0 (incWhyZero), data source label (incSourceLabel), change against last
//         month (incDeltaLM), incentive statement (incStatement), pool lines (incPools), tie-out
//         with the outlet's sales (incTieOut).
//   Calculation (used by incWorkingsForLive): pro-rata targets (incProRata), progressive slabs
//         (incProgressive), complementary weighting (incCompWeight), rounding once on the total
//         (incRoundTotal, rounding helper incRoundAmt in js/02).
// ═════════════════════════════════════════════════════════════════════════════════════════════
const IV_MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
function ivOn(id,sid){return typeof controlOn==='function'&&controlOn(id,sid);}
function ivLim(id,d,sid){const v=typeof controlLimit==='function'?Number(controlLimit(id,sid)):0;return v>0?v:d;}
function ivM(n){const v=Number(n)||0;return '₹'+(Math.abs(v%1)>0.004?v.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}):Math.round(v).toLocaleString('en-IN'));}
function ivX(n){return(Math.round((Number(n)||0)*100)/100)+'×';}

// ── calculation choices ──
function incCompWeight(sid){return ivOn('incCompWeight',sid)?Math.max(0,Math.min(100,ivLim('incCompWeight',50,sid)))/100:0.5;}
function incProRataFactor(sid,e,y,m){if(!ivOn('incProRata',sid))return 1;try{const att=loadAttendance(sid);const s=attSummaryFor(e,y,m,att[attMonthKey(e.id,y,m)]);const dim=new Date(y,m+1,0).getDate();const f=(Number(s.totalDaysPayable)||0)/dim;return f>0&&f<1?Math.round(f*10000)/10000:1;}catch(x){return 1;}}
function incSlabBands(sid,group){const sl=(typeof loadServiceSlabs==='function'?loadServiceSlabs(sid,group):[])||[];const base=Number(sl[0]&&sl[0].rate)||0;
  const tiers=sl.slice(1).map(t=>({th:Number(t.threshold),rate:Number(t.rate)||0})).filter(t=>!isNaN(t.th)).sort((a,b)=>a.th-b.th);return{base,tiers};}
function incProgressiveAmt(sid,svcActual,timesRaw,group){
  if(!ivOn('incProgressive',sid))return null;const a=Number(svcActual)||0;if(!(a>0))return{amount:0,rate:0,bands:[]};const sal=timesRaw>0?a/timesRaw:0;if(!(sal>0))return null;
  const {base,tiers}=incSlabBands(sid,group);const edges=[0,...tiers.map(t=>t.th*sal)];const rates=[base,...tiers.map(t=>t.rate)];const bands=[];let amt=0;
  for(let i=0;i<rates.length;i++){const lo=edges[i],hi=i+1<edges.length?edges[i+1]:Infinity;const part=Math.max(0,Math.min(a,hi)-lo);if(part>0){bands.push({from:lo,to:Math.min(a,hi),part,rate:rates[i]});amt+=part*rates[i]/100;}}
  const amount=typeof incRoundAmt==='function'?incRoundAmt(sid,amt):Math.round(amt);return{amount,rate:Math.round(amount/a*10000)/100,bands};
}
// ── 13 · tie-out with the outlet's sales ──
function incTieOut(sid,y,m,rows){
  const ym=y+'-'+String(m+1).padStart(2,'0');const W=rows||(incWorkingsFor(sid,y,m)||[]);let stylists=0;
  W.forEach(w=>{const rep=typeof staffWorkReportRowFor==='function'?staffWorkReportRowFor(sid,y,m,w.billingId):null;
    stylists+=rep?['ServiceSale','PackageSale','ComplementarySale','MemberShipSale','ProductSale'].reduce((s,k)=>s+(Number(rep[k])||0),0):((Number(w.svcActual)||0)+(Number(w.memActual)||0)+(Number(w.prodActual)||0));});
  let outlet=0,src='';const B=typeof fdBills==='function'?fdBills(sid).filter(b=>b&&b.kind!=='credit-note'&&b.status!=='Cancelled'&&String(b.date||'').startsWith(ym)):[];
  if(B.length&&typeof billCalc==='function'){outlet=B.reduce((s,b)=>s+(billCalc(b).subtotal||0),0);src='Billing (before discount and GST)';}
  else{try{const ds=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',sid))||'{}')||{};Object.keys(ds).forEach(d=>{if(d.startsWith(ym)){const v=ds[d]||{};outlet+=[0,1,2,3,4].reduce((s,i)=>s+(Number(v[i])||0),0);}});src='Daily Sales total';}catch(e){}}
  const diff=Math.round(stylists-outlet);const pct=outlet?Math.round(Math.abs(diff)/outlet*1000)/10:null;return{stylists:Math.round(stylists),outlet:Math.round(outlet),src,diff,pct,flag:outlet>0&&pct!=null&&pct>ivLim('incTieOut',5,sid)};
}
// ── 4 · why ₹0 ──
function incWhyZero(sid,w,appl,cols){if((Number(w.totalInc)||0)>0)return'';const R=[];
  if(!(Number(w.salary)>0))R.push('no salary');if(!w.fromReport&&!(Number(w.svcActual)||Number(w.memActual)||Number(w.prodActual)))R.push('no sales imported or typed');
  if(appl&&!appl.service&&!appl.membership&&!appl.product&&!appl.manager)R.push('all incentive types switched off');
  if((Number(w.penaltyAmt)||0)+(Number(w.advAdj)||0)>0&&((Number(w.svcIncAmt)||0)+(Number(w.memIncAmt)||0)+(Number(w.prodIncAmt)||0)+(Number(w.mgrIncAmt)||0))>0)R.push('penalty / advance took all of it');
  if(!R.length&&Number(w.svcRateUsed)===0&&Number(w.svcActual)>0)R.push('service below the first slab (0%)');
  return R.join('; ')||'nothing earned this month';}
// ── 8 · pools ──
function incPools(sid,y,m,rows){
  const W=rows||(incWorkingsFor(sid,y,m)||[]);const mgr=W.filter(w=>MANAGER_DESIGNATIONS.has(w.desig));const pool=typeof managerIncentivePoolFor==='function'?managerIncentivePoolFor(sid,y,m):0;
  const type=typeof loadMemRuleType==='function'?loadMemRuleType(sid):'A';let memPool=0;
  try{if(type==='C'){const rws=loadMemRuleCRows(sid,y,m)||{};W.filter(w=>!MANAGER_DESIGNATIONS.has(w.desig)).forEach(w=>{const r=rws[w.id]||{};memPool+=Math.round(((Number(r.newMembership)||0)+(Number(r.walletRecharge)||0))*(Number((loadMemRuleCSettings(sid)||{}).mgrRate)||0)/100);});}
    else{const S=type==='B'?(loadMemRuleBSettings(sid)||{}):(loadMemRuleASettings(sid)||{});const rws=type==='B'?(loadMemRuleBRows(sid,y,m)||{}):{};W.filter(w=>!MANAGER_DESIGNATIONS.has(w.desig)).forEach(w=>{let base=Math.round(Number(w.memActual)||0);if(type==='B')base=Math.max(0,base-(Number((rws[w.id]||{}).cards)||0)*(Number(S.valuePerCard)||0));memPool+=Math.round(base*(Number(S.mgrShareRate)||0)/100);});}}catch(e){}
  return{pool,mgr:mgr.map(w=>({name:w.name,mgr:Number(w.mgrIncAmt)||0,mem:Number(w.memIncAmt)||0})),memPool,type};
}

// ── 1, 7 · breakdown and statement ──
function incBreakdownLines(sid,y,m,w){
  const L=[];const add=(label,value,note,kind)=>L.push({label,value,note:note||'',kind:kind||''});const cm=w.calcMode||{};
  add('Monthly salary',ivM(w.salary));
  if(w.proRata&&w.proRata!==1)add('Pro-rata factor',(Math.round(w.proRata*1000)/10)+'%','payable days ÷ days in month — targets scaled');
  add('Service achieved',ivM(w.svcActual),w.fromReport?'Service + Package + '+Math.round(incCompWeight(sid)*100)+'% of Complementary (CRADLE report)':'typed in Incentive Working');
  add('Service target',ivM(w.svcTarget),w.svcPct+'% reached · '+ivX(w.svcTimesRaw)+' of salary');
  const pg=cm.svc!=='manualRate'&&cm.svc!=='manualAmt'?incProgressiveAmt(sid,w.svcActual,w.svcTimesRaw,(typeof incentiveGroupFor==='function'&&(loadIncentiveSplitMode(sid)||{}).service)?incentiveGroupFor(w,sid):undefined):null;
  add('Service incentive',ivM(w.svcIncAmt),cm.svc==='manualAmt'?'typed in by hand':pg&&pg.bands.length?'progressive: '+pg.bands.map(b=>ivM(b.part)+' × '+b.rate+'%').join(' + '):(w.svcRateUsed||0)+'% of '+ivM(w.svcActual)+(cm.svc==='manualRate'?' (rate typed in)':' (slab for '+ivX(w.svcTimesRaw)+')'),'earn');
  add('Membership incentive',ivM(w.memIncAmt),cm.mem==='manualAmt'?'typed in by hand':cm.mem==='manualRate'?(w.memRateUsed||0)+'% of '+ivM(w.memActual):'membership rule ('+ivM(w.memActual)+' sold; includes any pool share)','earn');
  add('Product incentive',ivM(w.prodIncAmt),cm.prod==='manualAmt'?'typed in by hand':w.prodRuleType==='B'?'flat amount':(w.prodRateUsed||0)+'% of '+ivM(w.prodActual),'earn');
  if(Number(w.mgrIncAmt))add('Manager incentive',ivM(w.mgrIncAmt),w.manualOv&&w.manualOv.mgr?'typed in by hand':'share of the manager pool','earn');
  if(Number(w.otAmt))add('Overtime',ivM(w.otAmt),ivM(w.salary)+' ÷ '+w.otDays+' days ÷ '+w.otNormalHours+' h × '+w.otHours+' h','earn');
  if(Number(w.penaltyAmt))add('Penalty','− '+ivM(w.penaltyAmt),w.manualInc&&w.manualInc.pen!=null?'typed in ✍ Manual incentive':'','ded');
  if(Number(w.advAdj))add('Advance recovered','− '+ivM(w.advAdj),'','ded');
  const a=w.incAdj||{};if(a.team)add('Team incentive',ivM(a.team),'','earn');if(a.feedback)add('Client feedback','− '+ivM(a.feedback),'average '+a.fbAvg+'★','ded');if(a.clawback)add('Clawback','− '+ivM(a.clawback),(a.clawLines||[]).length+' bill(s)','ded');if(a.capped)add('Cap','− '+ivM(a.capped),'','ded');if(a.floored)add('New-joiner floor top-up',ivM(a.floored),'','earn');
  if(w.manualInc&&w.manualInc.total!=null)add('Incentive typed in by hand',ivM(w.manualInc.total),'✍ Manual incentive — replaces the lines above; advance recovery is still taken off','earn');
  add('Total incentive',ivM(w.totalInc),'never below ₹0','total');return L;
}
function incStatementText(sid,y,m,w){return 'Incentive statement — '+w.name+' — '+IV_MON[m]+' '+y+'\n'+incBreakdownLines(sid,y,m,w).map(l=>l.label+': '+l.value+(l.note?' ('+l.note+')':'')).join('\n');}
function incStatementPrint(sid,y,m,w){const esc=t=>String(t==null?'':t).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));const salon=(typeof SALONS!=='undefined'?SALONS:[]).find(s=>String(s.id)===String(sid))||{};const win=window.open('','_blank');if(!win){window.alert('Allow pop-ups to print.');return;}
  win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Incentive statement</title><style>body{font:13px Arial;margin:30px}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #ddd;padding:6px}td.v{text-align:right;font-weight:bold;white-space:nowrap}td.n{color:#667;font-size:11.5px}tr.total td{border-top:2px solid #14335e;font-size:15px}</style></head><body><h2 style="margin:0">'+esc(String(salon.name||'').split('—')[0])+'</h2><div>Incentive statement — '+esc(w.name)+' ('+esc(w.desig||'')+') — '+IV_MON[m]+' '+y+'</div><br><table>'
    +incBreakdownLines(sid,y,m,w).map(l=>'<tr class="'+l.kind+'"><td>'+esc(l.label)+'</td><td class="n">'+esc(l.note)+'</td><td class="v">'+esc(l.value)+'</td></tr>').join('')+'</table><script>setTimeout(()=>window.print(),300)<\/script></body></html>');win.document.close();}
function IncBreakdownModal({sid,year,month,w,onClose}){
  const h=React.createElement;const L=incBreakdownLines(sid,year,month,w);const e=(loadEmployees(sid)||[]).find(x=>String(x.id)===String(w.id));
  const col=k=>k==='earn'?'var(--green)':k==='ded'?'var(--red)':k==='total'?'var(--text)':'var(--text2)';
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:620,maxWidth:'96vw',maxHeight:'90vh',overflowY:'auto'},onClick:ev=>ev.stopPropagation()},
    h('div',{className:'modal-title'},'🔍 '+w.name+' — incentive for '+IV_MON[month]+' '+year),
    h('div',null,L.map((l,i)=>h('div',{key:i,style:{display:'flex',gap:10,alignItems:'baseline',padding:'7px 0',borderTop:l.kind==='total'?'2px solid var(--accent)':i?'1px solid var(--border)':'none'}},
      h('span',{style:{width:24,color:'var(--text3)',fontSize:12}},l.kind==='total'?'=':l.kind==='ded'?'−':l.kind==='earn'?'+':'·'),h('span',{style:{flex:'0 0 180px',fontWeight:l.kind==='total'?700:500}},l.label),
      h('span',{style:{flex:1,fontSize:11.5,color:'var(--text3)'}},l.note),h('b',{style:{color:col(l.kind),fontSize:l.kind==='total'?16:13,whiteSpace:'nowrap'}},l.value)))),
    h('div',{className:'modal-actions'},ivOn('incStatement',sid)&&h('button',{className:'btn btn-ghost',onClick:()=>incStatementPrint(sid,year,month,w)},'🖨 Statement'),
      ivOn('incStatement',sid)&&h('button',{className:'btn btn-ghost',onClick:()=>{const ph=typeof waNumber==='function'?waNumber(e&&e.mobile):'';window.open('https://wa.me/'+(ph||'')+'?text='+encodeURIComponent(incStatementText(sid,year,month,w)),'_blank','noopener');}},'📲 WhatsApp to stylist'),
      h('button',{className:'btn btn-primary',onClick:onClose},'Close'))));
}

// ── 2 · Simple view (with 3, 4, 5, 6, 8, 13) ──
function incViewIsSimple(sid){if(!ivOn('incSimpleView',sid))return false;try{return localStorage.getItem('salonos_iw_view')==='simple';}catch(e){return false;}}
function IncSimpleView({salon,year,month,rows,onChanged}){
  const h=React.createElement;const sid=salon&&salon.id;const [open,setOpen]=useState(null);const [,t]=useState(0);
  if(sid==null)return null;const simple=incViewIsSimple(sid);const W=rows||[];
  const setView=v=>{try{localStorage.setItem('salonos_iw_view',v);}catch(e){}t(x=>x+1);onChanged&&onChanged();};
  const p=month===0?[year-1,11]:[year,month-1];let prev={};if(ivOn('incDeltaLM',sid)){try{(incWorkingsFor(sid,p[0],p[1])||[]).forEach(w=>{prev[w.id]=Number(w.totalInc)||0;});}catch(e){}}
  const appl=typeof loadIncentiveApplicability==='function'?loadIncentiveApplicability(sid):{};const tie=ivOn('incTieOut',sid)?incTieOut(sid,year,month,W):null;const pools=ivOn('incPools',sid)?incPools(sid,year,month,W):null;
  const typed=W.filter(w=>!w.fromReport&&((Number(w.svcActual)||0)+(Number(w.memActual)||0)+(Number(w.prodActual)||0))>0).length;
  const monthOver=new Date()>new Date(year,month+1,0);const anyReport=W.some(w=>w.fromReport);
  const bar=(pct)=>{const v=Math.max(0,Math.min(100,Number(pct)||0));const c=v>=100?'var(--green)':v>=75?'#2f9be0':v>=50?'var(--orange,#e69a1f)':'var(--red)';return h('div',{style:{height:6,borderRadius:3,background:'var(--bg3)',overflow:'hidden',marginTop:2,width:90}},h('div',{style:{height:'100%',width:v+'%',background:c}}));};
  const cell=(sale,target,pct)=>h('div',null,h('div',{style:{fontSize:12}},ivM(sale)+(target?h('span',{style:{color:'var(--text3)'}},' / '+ivM(target)):'')),ivOn('incProgress',sid)&&target>0&&bar(pct),target>0&&h('div',{style:{fontSize:10.5,color:'var(--text3)'}},(pct||0)+'%'));
  const totals=k=>W.reduce((s,w)=>s+(Number(w[k])||0),0);
  return h('div',{style:{marginBottom:12}},
    ivOn('incSimpleView',sid)&&h('div',{style:{display:'flex',gap:6,alignItems:'center',marginBottom:8}},h('span',{style:{fontSize:12,color:'var(--text3)'}},'View:'),
      h('button',{className:'btn btn-sm '+(simple?'btn-primary':'btn-ghost'),onClick:()=>setView('simple')},'Simple'),h('button',{className:'btn btn-sm '+(!simple?'btn-primary':'btn-ghost'),onClick:()=>setView('detailed')},'Detailed')),
    ivOn('incSourceLabel',sid)&&monthOver&&!anyReport&&W.length>0&&h('div',{style:{fontSize:12.5,color:'var(--orange,#c27711)',marginBottom:6}},'⚠ No CRADLE Staff Work report for '+IV_MON[month]+' — all sales are typed by hand. Import the report (Staff Work Report) so the figures come from billing.'),
    tie&&h('div',{style:{fontSize:12.5,marginBottom:6,color:tie.flag?'var(--red)':'var(--text3)'}},(tie.flag?'⚠ ':'✓ ')+'Stylists’ sales '+ivM(tie.stylists)+' vs outlet '+ivM(tie.outlet)+' ('+tie.src+')'+(tie.pct!=null?' — difference '+ivM(tie.diff)+' ('+tie.pct+'%)':'')+(tie.flag?' — more than '+ivLim('incTieOut',5,sid)+'%, check before approving':'')),
    pools&&(pools.pool>0||pools.memPool>0)&&h('div',{style:{display:'flex',gap:10,flexWrap:'wrap',marginBottom:8}},
      pools.pool>0&&h('div',{className:'card',style:{padding:'8px 12px',margin:0,borderTop:'3px solid var(--orange)'}},h('div',{style:{fontSize:11,color:'var(--text3)'}},'Manager pool'),h('b',null,ivM(pools.pool)),h('div',{style:{fontSize:11.5,color:'var(--text2)'}},pools.mgr.filter(x=>x.mgr).map(x=>x.name+' '+ivM(x.mgr)).join(' · ')||'no shares set')),
      pools.memPool>0&&h('div',{className:'card',style:{padding:'8px 12px',margin:0,borderTop:'3px solid var(--purple)'}},h('div',{style:{fontSize:11,color:'var(--text3)'}},'Membership pool (Rule '+pools.type+')'),h('b',null,ivM(pools.memPool)),h('div',{style:{fontSize:11.5,color:'var(--text2)'}},'shared by managers by Share % — '+pools.mgr.map(x=>x.name+' '+ivM(x.mem)).join(' · ')))),
    simple&&h('div',{className:'card',style:{padding:0}},h('div',{style:{overflowX:'auto'}},h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:12.5}},
      h('thead',null,h('tr',null,['Stylist','Service','Membership','Product','Service ₹','Membership ₹','Product ₹','Manager ₹','Less','Total',ivOn('incDeltaLM',sid)?'vs last month':null].filter(Boolean).map((x,i)=>h('th',{key:i,style:{textAlign:i?'right':'left',padding:'8px'}},x)))),
      h('tbody',null,W.map(w=>{const less=(Number(w.penaltyAmt)||0)+(Number(w.advAdj)||0);const adj=w.incAdj?Number(w.incAdj.adj)||0:0;const d=prev[w.id]!=null?(Number(w.totalInc)||0)-prev[w.id]:null;const why=ivOn('incWhyZero',sid)?incWhyZero(sid,w,appl):'';
        return h('tr',{key:w.id,style:{borderTop:'1px solid var(--border)',cursor:ivOn('incBreakdown',sid)?'pointer':'default'},onClick:()=>ivOn('incBreakdown',sid)&&setOpen(w),title:ivOn('incBreakdown',sid)?'Click for the breakdown':''},
          h('td',{style:{padding:'8px'}},h('div',{style:{fontWeight:600}},w.name),h('div',{style:{fontSize:11,color:'var(--text3)'}},(w.desig||'')+(ivOn('incSourceLabel',sid)?' · '+(w.fromReport?'📄 CRADLE report':'✍ typed'):''))),
          h('td',{style:{textAlign:'right',padding:'8px'}},cell(w.svcActual,w.svcTarget,w.svcPct)),h('td',{style:{textAlign:'right',padding:'8px'}},cell(w.memActual,w.memTarget,w.memPct)),h('td',{style:{textAlign:'right',padding:'8px'}},cell(w.prodActual,w.prodTarget,w.prodPct)),
          ...['svcIncAmt','memIncAmt','prodIncAmt','mgrIncAmt'].map(k=>h('td',{key:k,style:{textAlign:'right',padding:'8px'}},Number(w[k])?ivM(w[k]):'—')),
          h('td',{style:{textAlign:'right',padding:'8px',color:'var(--red)'}},less?'− '+ivM(less):'—',adj?h('div',{style:{fontSize:10.5,color:adj<0?'var(--red)':'var(--green)'}},'adj '+(adj>0?'+':'')+ivM(adj)):null),
          h('td',{style:{textAlign:'right',padding:'8px'}},h('b',{style:{fontSize:13.5}},ivM(w.totalInc)),why?h('div',{style:{fontSize:10.5,color:'var(--text3)',maxWidth:160,marginLeft:'auto'}},'₹0: '+why):null),
          ivOn('incDeltaLM',sid)&&h('td',{style:{textAlign:'right',padding:'8px',color:d==null?'var(--text3)':d>0?'var(--green)':d<0?'var(--red)':'var(--text3)'}},d==null?'new':d===0?'—':(d>0?'↑ ':'↓ ')+ivM(Math.abs(d))));})),
      h('tfoot',null,h('tr',{style:{borderTop:'2px solid var(--accent)',fontWeight:700}},h('td',{style:{padding:'8px'}},'Total'),h('td',{style:{textAlign:'right',padding:'8px'}},ivM(totals('svcActual'))),h('td',{style:{textAlign:'right',padding:'8px'}},ivM(totals('memActual'))),h('td',{style:{textAlign:'right',padding:'8px'}},ivM(totals('prodActual'))),
        ...['svcIncAmt','memIncAmt','prodIncAmt','mgrIncAmt'].map(k=>h('td',{key:k,style:{textAlign:'right',padding:'8px'}},ivM(totals(k)))),h('td',{style:{textAlign:'right',padding:'8px',color:'var(--red)'}},'− '+ivM(totals('penaltyAmt')+totals('advAdj'))),h('td',{style:{textAlign:'right',padding:'8px'}},ivM(totals('totalInc'))),ivOn('incDeltaLM',sid)&&h('td',null)))))),
    simple&&typed>0&&ivOn('incSourceLabel',sid)&&h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:4}},typed+' stylist(s) with sales typed by hand (✍).'),
    open&&h(IncBreakdownModal,{sid,year,month,w:open,onClose:()=>setOpen(null)}));
}
