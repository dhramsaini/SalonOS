// ═════════════════════════════════════════════════════════════════════════════════════════════
// ✍ Manual incentive (Incentive Working) — type the incentive by hand for all employees or only the
// ones you pick, either as one whole amount or part by part (Service, Membership, Product, Manager,
// Penalty). Switched on and set up in ⚙ Incentive Rules & Settings → Manual Incentive (per month,
// carried forward); the amounts are typed on the Incentive Working sheet.
//   • A part typed here is fed into the same per-employee manual path the engine already has
//     (manualOv + svc/mem/prod/mgr manual amounts in incWorkingsForLive), so Incentive Payment, the
//     P&L and the Full-workings Excel all follow it. A blank box = the calculated amount is used.
//   • Penalty typed here replaces the Penalty column for that employee.
//   • Whole amount: the typed figure is the incentive before advance recovery; overtime, penalty and
//     the automatic adjustments are not added to it. Advance recovery is still taken off.
// Stored per month: salonos_inc_manual_outlet_<id> = {'YYYY-MM':{cfg:{who,emps,mode,parts},amt:{empId:{…}}}}.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const IM_PARTS=[['svc','Service'],['mem','Membership'],['prod','Product'],['mgr','Manager'],['pen','Penalty']];
const IM_MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
let IM_BYPASS=false;
function imYm(y,m){return y+'-'+String(m+1).padStart(2,'0');}
function imKey(sid){return outletKey('salonos_inc_manual',sid);}
function imAll(sid){try{return JSON.parse(cachedLocalGet(imKey(sid))||'{}')||{};}catch(e){return{};}}
function imSaveAll(sid,A){safeLocalSet(imKey(sid),JSON.stringify(A));}
const IM_CFG_BLANK={who:'off',emps:[],mode:'parts',parts:{svc:false,mem:false,prod:false,mgr:false,pen:false}};
// The month's set-up; a month with none yet uses the latest earlier month's set-up (amounts never carry).
function imCfg(sid,y,m){const A=imAll(sid);const k=imYm(y,m);if(A[k]&&A[k].cfg)return{...IM_CFG_BLANK,...A[k].cfg,parts:{...IM_CFG_BLANK.parts,...(A[k].cfg.parts||{})}};
  const prev=Object.keys(A).filter(x=>x<k&&A[x]&&A[x].cfg).sort().pop();return prev?{...IM_CFG_BLANK,...A[prev].cfg,parts:{...IM_CFG_BLANK.parts,...(A[prev].cfg.parts||{})},carried:prev}:{...IM_CFG_BLANK};}
function imSetCfg(sid,y,m,cfg){const A=imAll(sid);const k=imYm(y,m);const c={...cfg};delete c.carried;A[k]={...(A[k]||{}),cfg:c};imSaveAll(sid,A);}
function imAmts(sid,y,m){return(imAll(sid)[imYm(y,m)]||{}).amt||{};}
function imSetAmt(sid,y,m,empId,field,val){const A=imAll(sid);const k=imYm(y,m);const r=A[k]=A[k]||{};if(!r.cfg)r.cfg=(()=>{const c={...imCfg(sid,y,m)};delete c.carried;return c;})();
  const a=r.amt=r.amt||{};const e=a[empId]={...(a[empId]||{})};const old=e[field];if(val===''||val==null)delete e[field];else e[field]=Number(val)||0;imSaveAll(sid,A);
  if(typeof payLogChange==='function')payLogChange(sid,'incentive',y,m,empId,'Manual '+field,old==null?'':old,val===''||val==null?'':Number(val)||0);}
function imInScope(cfg,empId){return cfg.who==='all'||(cfg.who==='sel'&&(cfg.emps||[]).map(String).includes(String(empId)));}
// Engine hook (incWorkingsForLive): null, or {svc,mem,prod,mgr,pen,total} with null = not typed.
function incManualFor(sid,e,y,m){
  if(IM_BYPASS)return null;
  const cfg=imCfg(sid,y,m);if(cfg.who==='off'||!imInScope(cfg,e.id))return null;
  const a=imAmts(sid,y,m)[e.id]||{};const v=k=>a[k]==null||a[k]===''?null:Number(a[k])||0;
  const out={svc:null,mem:null,prod:null,mgr:null,pen:null,total:null};
  if(cfg.mode==='total')out.total=v('total');else IM_PARTS.forEach(([k])=>{if(cfg.parts[k])out[k]=v(k);});
  return Object.values(out).some(x=>x!=null)?out:null;
}
// The month's working with nothing typed by hand here — the grey "calculated" figures in the boxes.
function imCalculated(sid,y,m){IM_BYPASS=true;try{return incWorkingsFor(sid,y,m)||[];}catch(e){return[];}finally{IM_BYPASS=false;}}

// ── Set-up: ⚙ Incentive Rules & Settings → Manual Incentive (who it applies to, and what is typed) ──
function IncManualSetup({sid,year,month,onChanged}){
  const h=React.createElement;const [,setT]=useState(0);if(sid==null)return null;
  const cfg=imCfg(sid,year,month);const label=IM_MON[month]+' '+year;
  const locked=typeof isIWEffectiveLockedFor==='function'&&isIWEffectiveLockedFor(sid,year,month);
  const setC=p=>{imSetCfg(sid,year,month,{...cfg,...p});setT(t=>t+1);onChanged&&onChanged();};
  let emps=[];try{emps=(getEmployeesForMonth(year,month,sid)||[]).filter(e=>e.desig!=='Helper'&&e.desig!=='Housekeeper');}catch(e){}
  const radio=(name,val,cur,lbl,on)=>h('label',{style:{display:'inline-flex',gap:5,alignItems:'center',fontSize:12.5,marginRight:12,cursor:locked?'not-allowed':'pointer'}},h('input',{type:'radio',name,checked:cur===val,disabled:locked,onChange:on}),lbl);
  return h('div',{className:'card',style:{marginBottom:14}},
    h('div',{style:{fontSize:11,color:'var(--text3)',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}},'Manual Incentive'),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10}},'Type the incentive by hand for '+label+' — for all employees or only the ones you pick, as one whole amount or part by part. The amounts are typed on the Incentive Working sheet (✍ Manual incentive); a blank box uses the calculated amount.'),
    locked&&h('div',{style:{fontSize:12,color:'var(--red)',marginBottom:8}},'🔒 '+label+' is approved and locked.'),
    cfg.carried&&h('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:6}},'Carried from '+cfg.carried.split('-').reverse().join('/')+' — any change here applies from '+label+'.'),
    h('div',{style:{marginBottom:8}},h('span',{style:{fontSize:12,fontWeight:600,marginRight:10}},'Apply to'),
      radio('imr-who-'+sid,'off',cfg.who,'Nobody (off)',()=>setC({who:'off'})),radio('imr-who-'+sid,'all',cfg.who,'All employees',()=>setC({who:'all'})),radio('imr-who-'+sid,'sel',cfg.who,'Selected employees',()=>setC({who:'sel'}))),
    cfg.who==='sel'&&h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}},emps.map(w=>{const on=(cfg.emps||[]).map(String).includes(String(w.id));
      return h('label',{key:w.id,style:{fontSize:12,padding:'3px 8px',borderRadius:12,border:'1px solid '+(on?'#2f5fe0':'var(--border)'),background:on?'rgba(47,95,224,0.08)':undefined,cursor:locked?'not-allowed':'pointer',display:'inline-flex',gap:4,alignItems:'center'}},
        h('input',{type:'checkbox',checked:on,disabled:locked,onChange:()=>setC({emps:on?(cfg.emps||[]).filter(x=>String(x)!==String(w.id)):[...(cfg.emps||[]),w.id]})}),w.name);})),
    cfg.who!=='off'&&h('div',{style:{marginBottom:8}},h('span',{style:{fontSize:12,fontWeight:600,marginRight:10}},'What to type'),
      radio('imr-mode-'+sid,'total',cfg.mode,'Whole incentive amount',()=>setC({mode:'total'})),radio('imr-mode-'+sid,'parts',cfg.mode,'Part by part',()=>setC({mode:'parts'}))),
    cfg.who!=='off'&&cfg.mode==='parts'&&h('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},IM_PARTS.map(([k,l])=>h('label',{key:k,style:{fontSize:12,display:'inline-flex',gap:4,alignItems:'center',marginRight:8,cursor:locked?'not-allowed':'pointer'}},
      h('input',{type:'checkbox',checked:!!cfg.parts[k],disabled:locked,onChange:e=>setC({parts:{...cfg.parts,[k]:e.target.checked}})}),l+(k==='mgr'?' (managers only)':'')))),
    cfg.who!=='off'&&h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:8}},cfg.mode==='total'?'Whole amount = the employee’s incentive before advance recovery; overtime, penalty and the automatic adjustments are not added to it, advance recovery is still taken off.':'Each typed part replaces the calculated one; the rest is still worked out as usual. Penalty typed here replaces the Penalty column.'));
}
// ── Typing the amounts: Incentive Working sheet (shown only when Manual Incentive is set up) ──
function IncManualPanel({salon,year,month,onChanged,onOpenRules}){
  const h=React.createElement;const sid=salon&&salon.id;const [open,setOpen]=useState(false);const [tick,setTick]=useState(0);
  if(sid==null)return null;const cfg=imCfg(sid,year,month);if(cfg.who==='off')return null;
  const amt=imAmts(sid,year,month);const label=IM_MON[month]+' '+year;
  const locked=typeof isIWEffectiveLockedFor==='function'&&isIWEffectiveLockedFor(sid,year,month);
  const typedCount=Object.keys(amt).filter(id=>imInScope(cfg,id)&&Object.keys(amt[id]||{}).length).length;
  const bump=()=>{setTick(t=>t+1);onChanged&&onChanged();};
  const head=h('div',{style:{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}},
    h('b',{style:{cursor:'pointer'},onClick:()=>setOpen(!open)},'✍ Manual incentive'),
    h('span',{style:{fontSize:12,color:'#2f5fe0'}},(cfg.who==='all'?'All employees':(cfg.emps||[]).length+' selected employee(s)')+' · '+(cfg.mode==='total'?'whole incentive amount':IM_PARTS.filter(([k])=>cfg.parts[k]).map(x=>x[1]).join(', ')||'no part chosen')+' · '+typedCount+' typed'),
    h('span',{style:{fontSize:11.5,color:'var(--text3)'}},'Type the amounts in the Incentive Amounts columns below, or open this list'),
    onOpenRules&&h('button',{className:'btn btn-ghost btn-sm',style:{padding:'1px 8px'},onClick:onOpenRules},'Change in ⚙ Incentive Rules & Settings'),
    h('span',{style:{marginLeft:'auto',fontSize:12,color:'var(--text3)',cursor:'pointer'},onClick:()=>setOpen(!open)},open?'▴ Hide':'▾ Open'));
  if(!open)return h('div',{className:'card',style:{marginBottom:12,padding:'10px 14px'}},head);
  const calc=imCalculated(sid,year,month);const scope=calc.filter(w=>imInScope(cfg,w.id));const LIVE={};try{(incWorkingsFor(sid,year,month)||[]).forEach(x=>LIVE[x.id]=x);}catch(x){}
  const fields=cfg.mode==='total'?[['total','Incentive amount']]:IM_PARTS.filter(([k])=>cfg.parts[k]);
  const calcOf=(w,k)=>k==='total'?Math.max(0,(w.totalInc||0)+(w.advAdj||0)):k==='svc'?w.svcIncAmt:k==='mem'?w.memIncAmt:k==='prod'?w.prodIncAmt:k==='mgr'?w.mgrIncAmt:w.penaltyAmt;
  const isMgr=w=>typeof MANAGER_DESIGNATIONS!=='undefined'&&MANAGER_DESIGNATIONS.has(w.desig);
  const fill=()=>{scope.forEach(w=>fields.forEach(([k])=>{if(k==='mgr'&&!isMgr(w))return;const a=(amt[w.id]||{})[k];if(a==null)imSetAmt(sid,year,month,w.id,k,Math.round(Number(calcOf(w,k))||0));}));bump();};
  const clear=()=>{if(!window.confirm('Clear every amount typed here for '+label+'? The calculated amounts will be used again.'))return;const A=imAll(sid);const k=imYm(year,month);if(A[k]){A[k].amt={};imSaveAll(sid,A);}bump();};
  const fmt=n=>'₹'+Math.round(Number(n)||0).toLocaleString('en-IN');
  return h('div',{className:'card',style:{marginBottom:12}},head,
    h('div',{style:{marginTop:10,display:'flex',flexDirection:'column',gap:8}},
      locked&&h('div',{style:{fontSize:12,color:'var(--red)'}},'🔒 '+label+' is approved and locked — unlock Incentive Working to change these.'),
      !fields.length&&h('div',{style:{fontSize:12,color:'var(--text3)'}},'No part chosen yet — tick the parts in ⚙ Incentive Rules & Settings → Manual Incentive.'),
      !scope.length&&h('div',{style:{fontSize:12,color:'var(--text3)'}},'No employee chosen yet — tick them in ⚙ Incentive Rules & Settings → Manual Incentive.'),
      fields.length>0&&scope.length>0&&h('div',{className:'table-wrap'},h('table',null,
        h('thead',null,h('tr',null,h('th',null,'Employee'),fields.map(([k,l])=>h('th',{key:k,style:{textAlign:'right'}},l)),h('th',{style:{textAlign:'right'}},'Total incentive now'))),
        h('tbody',null,scope.map(w=>{const a=amt[w.id]||{};
          return h('tr',{key:w.id+'_'+tick},h('td',null,w.name,h('div',{style:{fontSize:10.5,color:'var(--text3)'}},w.desig||'')),
            fields.map(([k])=>h('td',{key:k,style:{textAlign:'right'}},k==='mgr'&&!isMgr(w)?h('span',{style:{color:'var(--text3)',fontSize:11.5}},'—'):
              h('input',{type:'number',min:0,className:'form-control',disabled:locked,style:{width:110,padding:'3px 6px',textAlign:'right',marginLeft:'auto',fontWeight:a[k]!=null?700:400},
                defaultValue:a[k]!=null?a[k]:'',placeholder:String(Math.round(Number(calcOf(w,k))||0)),title:'Calculated: '+fmt(calcOf(w,k))+' — leave blank to use it',
                onBlur:e=>{const v=e.target.value.trim();if(String(v)===String(a[k]!=null?a[k]:''))return;imSetAmt(sid,year,month,w.id,k,v);bump();}}))),
            h('td',{style:{textAlign:'right',fontWeight:700}},fmt(LIVE[w.id]?LIVE[w.id].totalInc:0)));})))),
      fields.length>0&&scope.length>0&&!locked&&h('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},
        h('button',{className:'btn btn-ghost btn-sm',onClick:fill},'⬇ Fill blanks with the calculated amounts'),
        h('button',{className:'btn btn-ghost btn-sm',onClick:clear},'✕ Clear typed amounts')),
      h('div',{style:{fontSize:11.5,color:'var(--text3)'}},'A blank box uses the calculated amount (shown in grey). '+(cfg.mode==='total'?'The amount typed is the incentive before advance recovery.':'Each typed part replaces the calculated one.'))));
}

// ── Typing straight into Incentive Working's Incentive Amounts columns ──
// Is this employee's part (svc/mem/prod/mgr/pen, or 'total') typed by hand this month?
function imCellOn(sid,y,m,empId,k){const cfg=imCfg(sid,y,m);if(cfg.who==='off'||!imInScope(cfg,empId))return false;return k==='total'?cfg.mode==='total':(cfg.mode==='parts'&&!!(cfg.parts||{})[k]);}
function imCalcOf(w,k){if(!w)return 0;return k==='total'?Math.max(0,(w.totalInc||0)+(w.advAdj||0)):k==='svc'?w.svcIncAmt:k==='mem'?w.memIncAmt:k==='prod'?w.prodIncAmt:k==='mgr'?w.mgrIncAmt:w.penaltyAmt;}
function ImAmtCell({sid,y,m,w,k,calc,locked,onChanged,color}){
  const h=React.createElement;const a=(imAmts(sid,y,m)[w.id]||{})[k];const c=Math.round(Number(imCalcOf(calc,k))||0);
  const lk=locked||(typeof isIWEffectiveLockedFor==='function'&&isIWEffectiveLockedFor(sid,y,m));
  const tip=(k==='total'?'Whole incentive typed by hand (before advance recovery)':'Typed by hand — ✍ Manual Incentive')+'. Calculated: ₹'+c.toLocaleString('en-IN')+'. Leave blank to use the calculated amount.';
  return h('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right',background:'rgba(244,196,48,0.12)'},title:tip},
    h('input',{key:k+'|'+(a==null?'':a),type:'number',min:0,defaultValue:a==null?'':a,placeholder:String(c),disabled:!!lk,
      onBlur:e=>{const v=String(e.target.value).trim();if(v===String(a==null?'':a))return;imSetAmt(sid,y,m,w.id,k,v);onChanged&&onChanged();},
      onKeyDown:e=>{if(e.key==='Enter')e.target.blur();},
      style:{width:84,textAlign:'right',background:lk?'var(--bg2)':'var(--bg3)',border:'1px solid '+(a!=null?'#2f5fe0':'var(--border)'),borderRadius:4,color:color||'var(--text)',fontWeight:a!=null?700:400,fontSize:11.5,padding:'4px 6px',cursor:lk?'not-allowed':'text'}}),
    k==='total'&&a!=null&&Number(w.advAdj)>0&&h('div',{style:{fontSize:9.5,color:'var(--text3)',marginTop:2}},'pays ₹'+Math.round(Number(w.totalInc)||0).toLocaleString('en-IN')+' after advance'));
}
