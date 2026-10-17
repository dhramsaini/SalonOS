// ═════════════════════════════════════════════════════════════════════════════════════════════
// Incentive Rules & Settings — made easier to follow (Controls → incRulesGuide). Nothing here
// changes how incentive is worked out: it reads the same saved rules and the same functions
// Incentive Working uses.
//   • Step bar — jump to each part of the settings window in order.
//   • “How incentive is worked out” — the current rules in plain words, with ₹ examples.
//   • “Try it” — enter a salary and sales, see what the rules give.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const IG_MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
function igM(n){return '₹'+Math.round(Number(n)||0).toLocaleString('en-IN');}
function igX(n){const v=Number(n)||0;return (Math.round(v*100)/100)+'×';}
function igSlabs(sid){const s=(typeof loadServiceSlabs==='function'?loadServiceSlabs(sid):[])||[];const base=Number(s[0]&&s[0].rate)||0;
  const tiers=s.slice(1).map(t=>({th:Number(t.threshold),rate:Number(t.rate)||0})).filter(t=>!isNaN(t.th)&&t.th>0).sort((a,b)=>a.th-b.th);return{base,tiers};}
function igMem(sid){const type=typeof loadMemRuleType==='function'?loadMemRuleType(sid):'A';
  if(type==='B'){const s=loadMemRuleBSettings(sid)||{};return{type,lines:['Each Elite card sold earns '+igM(s.incPerCard)+'; the card value ('+igM(s.valuePerCard)+' each) is taken off the membership sale first.','On the rest: staff earn '+(Number(s.staffRate)||0)+'%, managers '+(Number(s.mgrRate)||0)+'% on their own sale.','A further '+(Number(s.mgrShareRate)||0)+'% of staff membership sale goes into a pool shared by managers by their Share %.']};}
  if(type==='C'){const s=loadMemRuleCSettings(sid)||{};return{type,lines:['New membership sold earns '+(Number(s.newMemRate)||0)+'%; wallet recharge earns '+(Number(s.walletRate)||0)+'%.','Managers also get a share of a pool: '+(Number(s.mgrRate)||0)+'% of staff new membership + wallet, shared by Share %.']};}
  const s=loadMemRuleASettings(sid)||{};return{type:'A',lines:['Staff earn '+(Number(s.staffRate)||0)+'% of their own membership sale.','Managers earn '+(Number(s.mgrRate)||0)+'% of their own membership sale.','A further '+(Number(s.mgrShareRate)||0)+'% of staff membership sale goes into a pool shared by managers by their Share %.']};}
function igProd(sid){const t=typeof loadProdRuleType==='function'?loadProdRuleType(sid):'A';return t==='B'?{type:'B',line:'Every stylist with product incentive on gets a flat '+igM((loadProductFlatRule(sid)||{}).amount)+' a month, whatever they sell.'}:{type:'A',line:(Number((loadProductIncentiveRule(sid)||{}).rate)||0)+'% of each stylist’s own product sale.'};}
function igMgr(sid,y,m){const tiers=((typeof loadMgrIncentiveTiers==='function'?loadMgrIncentiveTiers(sid):[])||[]).map(t=>({th:Number(t.threshold),rate:Number(t.rate)||0})).filter(t=>!isNaN(t.th)).sort((a,b)=>a.th-b.th);
  const inp=typeof loadMgrIncentiveInputs==='function'?(loadMgrIncentiveInputs(sid,y,m)||{}):{};return{tiers,target:Number(inp.targetCollection)||0};}
function IncRulesGuide({sid,year,month,applicability,showAdvanced,splitMode}){
  const h=React.createElement;const [open,setOpen]=useState(()=>{try{return localStorage.getItem('salonos_inc_guide_open')!=='0';}catch(e){return true;}});
  const [t,setT]=useState({salary:'20000',svc:'100000',mem:'20000',prod:'10000',mgr:false});const [,tick]=useState(0);
  useEffect(()=>{const iv=setInterval(()=>tick(x=>x+1),1500);return()=>clearInterval(iv);},[]); // follows edits made below
  if(sid==null||(typeof controlOn==='function'&&!controlOn('incRulesGuide',sid)))return null;
  const ap=applicability||{};const mult=typeof loadTargetMultipliers==='function'?loadTargetMultipliers(sid):{svc:5,mem:3,prod:2};const sl=igSlabs(sid);const mem=igMem(sid);const prod=igProd(sid);const mg=igMgr(sid,year,month);
  const split=splitMode&&(splitMode.service||splitMode.membership||splitMode.product);
  const STEPS=[['Applicability','Which incentives'],['Target Multipliers','Targets'],['Service Incentive Rate Slabs','Service rates',ap.service],['Membership Incentive Rules','Membership',ap.membership],['Product Incentive Rule','Product',ap.product],['Manager Incentive','Manager',ap.manager],['Column Groups','Columns'],['Overtime (OT) Working','Overtime'],['Achievement — times display','Display']]
    .concat(showAdvanced?[['Incentive Plans','Plans (advanced)'],['Employee Plan Assignment','Who is on which plan'],['Manual Override by Employee','Manual overrides'],['Rate & Amount Source','Rate source']]:[]).filter(s=>s[2]!==false);
  const go=(label)=>{const root=document.querySelector('.modal-overlay .modal');if(!root)return;const el=[...root.querySelectorAll('div')].find(d=>d.children.length<=1&&String(d.textContent||'').trim().startsWith(label));const card=el&&(el.closest('.card')||el);if(card)card.scrollIntoView({behavior:'smooth',block:'start'});};
  const toggle=()=>{setOpen(o=>{try{localStorage.setItem('salonos_inc_guide_open',o?'0':'1');}catch(e){}return!o;});};
  // Try it — uses the same rate functions as Incentive Working
  const sal=Number(t.salary)||0,svc=Number(t.svc)||0,ms=Number(t.mem)||0,ps=Number(t.prod)||0;const times=sal?svc/sal:0;
  const svcRate=typeof serviceSlabRateFor==='function'?serviceSlabRateFor(sid,times):0;const svcInc=ap.service?Math.round(svc*svcRate/100):0;
  const memRate=mem.type==='A'?Number((loadMemRuleASettings(sid)||{})[t.mgr?'mgrRate':'staffRate'])||0:mem.type==='B'?Number((loadMemRuleBSettings(sid)||{})[t.mgr?'mgrRate':'staffRate'])||0:Number((loadMemRuleCSettings(sid)||{}).newMemRate)||0;
  const memInc=ap.membership?Math.round(ms*memRate/100):0;const prodInc=ap.product?(prod.type==='B'?Math.round(Number((loadProductFlatRule(sid)||{}).amount)||0):Math.round(ps*(Number((loadProductIncentiveRule(sid)||{}).rate)||0)/100)):0;
  const nextTier=sl.tiers.find(x=>x.th>times);
  const card=(color,title,...body)=>h('div',{style:{borderLeft:'4px solid '+color,background:'var(--bg2)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:8}},h('div',{style:{fontWeight:700,fontSize:13,marginBottom:3,color}},title),...body);
  const p=(txt)=>h('div',{style:{fontSize:12.5,color:'var(--text2)',lineHeight:1.55}},txt);
  const inp=(k,label)=>h('label',{style:{display:'flex',flexDirection:'column',fontSize:11,color:'var(--text3)',gap:2}},label,h('input',{type:'number',className:'form-control',style:{width:120,padding:'4px 6px'},value:t[k],onChange:e=>setT({...t,[k]:e.target.value})}));
  return h('div',{style:{marginBottom:14}},
    h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',position:'sticky',top:0,zIndex:3,background:'var(--bg)',padding:'6px 0',borderBottom:'1px solid var(--border)',marginBottom:10}},
      h('span',{style:{fontSize:12,fontWeight:700,color:'var(--text3)',marginRight:4}},'Go to:'),
      STEPS.map(([lab,short],i)=>h('button',{key:lab,className:'btn btn-ghost btn-sm',style:{padding:'3px 9px'},onClick:()=>go(lab)},h('span',{style:{display:'inline-block',minWidth:18,height:18,lineHeight:'18px',borderRadius:9,background:'var(--accent)',color:'#fff',fontSize:10.5,textAlign:'center',marginRight:5}},i+1),short)),
      h('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:'auto'},onClick:toggle},open?'Hide summary ▴':'Show summary ▾')),
    open&&h('div',{className:'card',style:{background:'var(--bg3)'}},
      h('div',{style:{fontWeight:700,fontSize:14,marginBottom:2}},'How incentive is worked out — '+IG_MON[month]+' '+year),
      h('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'Read from the settings below and updated as you change them.'+(split?' Different plans per designation are on — this shows the default plan; each plan’s own figures are in its tab below.':'')),
      card('var(--text2)','Targets',p('Each stylist’s target is a multiple of their monthly salary — Service '+igX(mult.svc)+', Membership '+igX(mult.mem)+', Product '+igX(mult.prod)+'. With a salary of '+igM(sal||20000)+': Service target '+igM((sal||20000)*mult.svc)+', Membership '+igM((sal||20000)*mult.mem)+', Product '+igM((sal||20000)*mult.prod)+'.')),
      ap.service&&card('var(--blue)','① Service incentive',p('Service achieved = Service + Package + half of Complementary sale. The rate depends on how many times their salary they sold in services:'),
        h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',margin:'4px 0'}},[{lab:'Below '+igX(sl.tiers[0]?sl.tiers[0].th:0),rate:sl.base},...sl.tiers.map((x,i)=>({lab:igX(x.th)+(sl.tiers[i+1]?' – '+igX(sl.tiers[i+1].th):' and above'),rate:x.rate}))].map((x,i)=>h('span',{key:i,style:{fontSize:12,padding:'3px 8px',borderRadius:12,background:'rgba(74,158,255,0.12)'}},x.lab+' → ',h('b',null,x.rate+'%')))),
        p('Incentive = Service achieved × rate. Example: salary '+igM(sal||20000)+' and service sale '+igM(svc)+' ('+igX(times)+') → '+svcRate+'% → '+igM(svcInc)+'.')),
      ap.membership&&card('var(--purple)','② Membership incentive — Rule '+mem.type,...mem.lines.map((l,i)=>h('div',{key:i},p('• '+l)))),
      ap.product&&card('var(--teal)','③ Product incentive — Rule '+prod.type,p(prod.line)),
      ap.manager&&card('var(--orange)','④ Manager incentive',p('The month’s collection (the payment modes ticked in the Manager section) ÷ 1.05 is compared with the target'+(mg.target?' of '+igM(mg.target):'')+'. The rate for the achievement level is applied to the whole collection, and that pool is shared between managers by their Share %.'),
        mg.tiers.length>0&&h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}},mg.tiers.map((x,i)=>h('span',{key:i,style:{fontSize:12,padding:'3px 8px',borderRadius:12,background:'rgba(255,159,67,0.14)'}},x.th+'% of target or more → ',h('b',null,x.rate+'%'))))),
      card('var(--red)','Then taken off',p('Penalty and Advance Adj. (when those columns are on) are deducted; Overtime is added when that column is on. The total never goes below ₹0.'+(typeof controlOn==='function'&&(controlOn('incTeam',sid)||controlOn('incFeedback',sid)||controlOn('incClawback',sid)||controlOn('incCap',sid)||controlOn('incFloor',sid))?' Pay tools adjustments switched on in Controls (team share, client feedback, clawback, cap or floor) apply after that.':''))),
      h('div',{style:{borderTop:'1px solid var(--border)',paddingTop:10,marginTop:6}},
        h('div',{style:{fontWeight:700,fontSize:13,marginBottom:6}},'🧮 Try it'),
        h('div',{style:{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}},inp('salary','Monthly salary ₹'),inp('svc','Service sale ₹'),inp('mem','Membership sale ₹'),inp('prod','Product sale ₹'),
          h('label',{style:{display:'flex',gap:5,alignItems:'center',fontSize:12.5}},h('input',{type:'checkbox',checked:t.mgr,onChange:e=>setT({...t,mgr:e.target.checked})}),'Manager')),
        h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}},[[ 'Service',svcInc,ap.service,'var(--blue)',svcRate+'% at '+igX(times)],['Membership',memInc,ap.membership,'var(--purple)',memRate+'%'+(t.mgr?' + pool share':'')],['Product',prodInc,ap.product,'var(--teal)',prod.type==='B'?'flat':((Number((loadProductIncentiveRule(sid)||{}).rate)||0)+'%')]]
          .filter(x=>x[2]).map(([l,v,_,c,sub])=>h('div',{key:l,style:{padding:'6px 12px',borderRadius:'var(--r)',background:'var(--bg2)',borderTop:'3px solid '+c,minWidth:120}},h('div',{style:{fontSize:11,color:'var(--text3)'}},l),h('div',{style:{fontWeight:700,fontSize:16}},igM(v)),h('div',{style:{fontSize:11,color:'var(--text3)'}},sub))),
          h('div',{style:{padding:'6px 12px',borderRadius:'var(--r)',background:'var(--bg2)',borderTop:'3px solid var(--green)',minWidth:120}},h('div',{style:{fontSize:11,color:'var(--text3)'}},'Total (before manager pool, penalty, advance)'),h('div',{style:{fontWeight:700,fontSize:16,color:'var(--green)'}},igM(svcInc+memInc+prodInc)))),
        ap.service&&nextTier&&h('div',{style:{fontSize:12,color:'var(--text2)',marginTop:6}},'💡 '+igM(Math.ceil(nextTier.th*sal-svc))+' more service sale reaches '+igX(nextTier.th)+' and lifts the rate to '+nextTier.rate+'% (worth '+igM(Math.round((nextTier.th*sal)*nextTier.rate/100)-svcInc)+' more).'),
        h('div',{style:{fontSize:11,color:'var(--text3)',marginTop:4}},'An illustration with the rules as set now. Membership pools and the manager pool depend on the whole team, so they are not included here.'))));
}
