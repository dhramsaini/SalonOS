// ═════════════════════════════════════════════════════════════════════════════════════════════
// ✍ Manual salary (Salary Working) — type salary figures by hand for all employees or only the ones
// you pick, either the whole Net Salary or part by part (Gross Salary, Tea, PF, ESIC, Prof. Tax,
// TDS, Penalties, Advance Adj.). Switched on and set up on the Salary Working sheet itself (per month, carried
// forward); the typed figures sit in the table's own cells, a blank box keeps the calculated one.
//   • Parts replace the calculated figure in Net Salary; PF / ESIC / PT typed here also go to the
//     PF / ESIC / PT figures and challans (statutoryDeductionsFor), like the existing overrides.
//   • Whole Net Salary: the typed figure is the pay before advance recovery; the advance instalment
//     is still taken off (it is settled on the Advances sheet).
// Store: salonos_sal_manual_outlet_<id> = {'YYYY-MM':{cfg:{who,emps,mode,parts},amt:{empId:{…}}}}.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const SM_PARTS=[['gross','Gross Salary'],['tea','Tea'],['pf','PF (Emp)'],['esic','ESIC (Emp)'],['pt','Prof. Tax'],['tds','TDS'],['pen','Penalties'],['adv','Advance Adj.']];
const SM_MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
let SM_BYPASS=false;
function smYm(y,m){return y+'-'+String(m+1).padStart(2,'0');}
function smKey(sid){return outletKey('salonos_sal_manual',sid);}
function smAll(sid){try{return JSON.parse(cachedLocalGet(smKey(sid))||'{}')||{};}catch(e){return{};}}
function smSaveAll(sid,A){safeLocalSet(smKey(sid),JSON.stringify(A));}
const SM_BLANK={who:'off',emps:[],mode:'parts',parts:{}};
function smCfg(sid,y,m){const A=smAll(sid);const k=smYm(y,m);const pick=r=>({...SM_BLANK,...r.cfg,parts:{...(r.cfg.parts||{})}});if(A[k]&&A[k].cfg)return pick(A[k]);
  const prev=Object.keys(A).filter(x=>x<k&&A[x]&&A[x].cfg).sort().pop();return prev?{...pick(A[prev]),carried:prev}:{...SM_BLANK};}
function smSetCfg(sid,y,m,cfg){const A=smAll(sid);const k=smYm(y,m);const c={...cfg};delete c.carried;A[k]={...(A[k]||{}),cfg:c};smSaveAll(sid,A);}
function smAmts(sid,y,m){return(smAll(sid)[smYm(y,m)]||{}).amt||{};}
function smSetAmt(sid,y,m,empId,field,val){const A=smAll(sid);const k=smYm(y,m);const r=A[k]=A[k]||{};if(!r.cfg){const c={...smCfg(sid,y,m)};delete c.carried;r.cfg=c;}
  const a=r.amt=r.amt||{};const e=a[empId]={...(a[empId]||{})};const old=e[field];if(val===''||val==null)delete e[field];else e[field]=Number(val)||0;smSaveAll(sid,A);
  if(typeof payLogChange==='function')payLogChange(sid,'salary',y,m,empId,'Manual '+field,old==null?'':old,val===''||val==null?'':Number(val)||0);}
function smInScope(cfg,id){return cfg.who==='all'||(cfg.who==='sel'&&(cfg.emps||[]).map(String).includes(String(id)));}
function smCellOn(sid,y,m,id,k){const c=smCfg(sid,y,m);if(c.who==='off'||!smInScope(c,id))return false;return k==='net'?c.mode==='net':(c.mode==='parts'&&!!c.parts[k]);}
// Engine hook (swWorkingsFor / statutoryDeductionsFor): null, or {gross,tea,pf,esic,pt,tds,pen,net} with null = not typed.
function salManualFor(sid,e,y,m){
  if(SM_BYPASS||sid==null)return null;const c=smCfg(sid,y,m);if(c.who==='off'||!smInScope(c,e.id))return null;
  const a=smAmts(sid,y,m)[e.id]||{};const v=k=>a[k]==null||a[k]===''?null:Number(a[k])||0;const o={gross:null,tea:null,pf:null,esic:null,pt:null,tds:null,pen:null,adv:null,net:null};
  if(c.mode==='net')o.net=v('net');else SM_PARTS.forEach(([k])=>{if(c.parts[k])o[k]=v(k);});
  if(o.adv!=null&&a.advBy&&typeof a.advBy==='object')o.advBy=a.advBy; // amount chosen per advance
  return Object.values(o).some(x=>x!=null)?o:null;
}
function smCalculated(sid,y,m){SM_BYPASS=true;try{return(typeof ffLive==='function'?ffLive(()=>swWorkingsFor(sid,y,m)):swWorkingsFor(sid,y,m))||[];}catch(e){return[];}finally{SM_BYPASS=false;}}
function smCalcOf(w,k){if(!w)return 0;return k==='net'?Math.max(0,(Number(w.net)||0)+(Number(w.advAdj)||0)):k==='gross'?w.grossAfterLop:k==='tea'?w.tea:k==='pf'?w.pfEmp:k==='esic'?w.esicEmp:k==='pt'?w.ptAmt:k==='tds'?w.tdsAmt:k==='adv'?w.advAdj:w.penAmt;}

// ── Advance Adj. typed by hand, linked to the advances given ──
// The typed amount is spread over the employee's Salary advances, oldest first, up to what each
// still has to recover this month; {advanceId: amount}, or null when no advance amount is typed.
// Used by swWorkingsFor (Advance Adj.), Salary Working approval (applyAdvanceSettlement) and
// reconcileAdvanceRecoveries, so the advances register records exactly what was deducted.
function smAdvList(sid,list){if(list)return list;try{return JSON.parse(cachedLocalGet(outletKey('salonos_advances',sid))||'[]')||[];}catch(e){return[];}}
function salManualAdvDue(sid,empName,y,m,list){
  const ym=smYm(y,m),end=ym+'-31';
  return smAdvList(sid,list).map(a=>typeof advFixed==='function'?advFixed(a):a).filter(a=>a&&a.emp===empName&&(a.deductFrom||'Salary')==='Salary'&&(a.status==='Active'||a.status==='Recovered')&&String(a.date||'')<=end)
    .map(a=>{const out=typeof advTrueOutstanding==='function'?advTrueOutstanding(a):Math.max(0,Number(a.outstanding)||0);const cap=out+(Number((a.settled||{})[ym])||0);
      const sch=typeof scheduledAmountFor==='function'?scheduledAmountFor(a,y,m):null;const plan=Math.min(cap,Math.max(0,sch!==null?sch:(Number(a.repayment)||0)));
      return{id:a.id,date:String(a.date||''),amount:Number(a.amount)||0,reason:a.reason||'',cap,plan};})
    .filter(x=>x.cap>0).sort((a,b)=>a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id)));
}
function salManualAdvMap(sid,empId,empName,y,m,list){
  const sm=salManualFor(sid,{id:empId},y,m);if(!sm||sm.adv==null)return null;
  const due=salManualAdvDue(sid,empName,y,m,list);const mp={};
  if(sm.advBy){due.forEach(x=>{const t=Math.min(Math.max(0,Number(sm.advBy[x.id])||0),x.cap);if(t>0)mp[x.id]=t;});return mp;} // chosen advance by advance
  let left=Math.max(0,Number(sm.adv)||0);due.forEach(x=>{const t=Math.min(left,x.cap);if(t>0){mp[x.id]=t;left-=t;}});return mp;   // a plain total: oldest first
}
// Save the amount to recover from each advance (nothing typed = back to the plan).
function smSetAdvBy(sid,y,m,empId,map){const A=smAll(sid);const k=smYm(y,m);const r=A[k]=A[k]||{};if(!r.cfg){const c={...smCfg(sid,y,m)};delete c.carried;r.cfg=c;}
  const a=r.amt=r.amt||{};const e=a[empId]={...(a[empId]||{})};const old=e.adv;const clean={};Object.entries(map||{}).forEach(([id,v])=>{const n=Number(v);if(v!==''&&v!=null&&!isNaN(n)&&n>=0)clean[id]=n;});
  if(!Object.keys(clean).length){delete e.adv;delete e.advBy;}else{e.advBy=clean;e.adv=Object.values(clean).reduce((t,x)=>t+x,0);}smSaveAll(sid,A);
  if(typeof payLogChange==='function')payLogChange(sid,'salary',y,m,empId,'Manual advance',old==null?'':old,e.adv==null?'':e.adv+' ('+Object.entries(clean).map(([i,v])=>i+' ₹'+v).join(', ')+')');}
// The Advance Adj. cell: a button showing what is recovered (and from which advance) that opens
// the "choose advance" window.
function SmAdvCell({sid,y,m,w,calc,locked,onChanged,bg,color}){
  const h=React.createElement;const [open,setOpen]=useState(false);const [vals,setVals]=useState({});
  const rec=smAmts(sid,y,m)[w.id]||{};const typed=rec.adv!=null;const due=salManualAdvDue(sid,w.name,y,m);const planTot=Math.round(Number(calc?calc.advAdj:0)||0);
  const by=rec.advBy||(typed&&due.length?(()=>{const mp={};let left=Number(rec.adv)||0;due.forEach(x=>{const t=Math.min(left,x.cap);if(t>0){mp[x.id]=t;left-=t;}});return mp;})():{});
  const dmy=iso=>iso?String(iso).slice(0,10).split('-').reverse().join('/'):'—';const rs=n=>'₹'+Math.round(Number(n)||0).toLocaleString('en-IN');
  const openIt=()=>{if(locked)return;const v={};due.forEach(x=>{v[x.id]=typed?(by[x.id]!=null?by[x.id]:0):x.plan;});setVals(v);setOpen(true);};
  const save=()=>{for(const x of due){const n=Number(vals[x.id])||0;if(n>x.cap){window.alert(x.id+': only '+rs(x.cap)+' is still due on this advance.');return;}}smSetAdvBy(sid,y,m,w.id,vals);setOpen(false);onChanged&&onChanged();};
  const usePlan=()=>{smSetAdvBy(sid,y,m,w.id,{});setOpen(false);onChanged&&onChanged();};
  const tot=Object.values(vals).reduce((t,x)=>t+(Number(x)||0),0);
  return h('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right',background:bg||'rgba(244,196,48,0.12)',whiteSpace:'nowrap'}},
    !due.length?h('span',{style:{fontSize:11,color:'var(--text3)'},title:'No advance is due for this employee'},'no advance due'):
    h('div',{style:{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2}},
      h('button',{type:'button',disabled:!!locked,onClick:openIt,title:'Choose the advance(s) to recover from and how much',
        style:{minWidth:84,textAlign:'right',padding:'4px 6px',borderRadius:4,border:'1px solid '+(typed?'#2f5fe0':'var(--border)'),background:locked?'var(--bg2)':'var(--bg3)',color:typed?(color||'var(--text)'):'var(--text3)',fontWeight:typed?700:400,fontSize:11.5,cursor:locked?'not-allowed':'pointer'}},
        (typed?rs(rec.adv):rs(planTot)+' plan')+' ▾'),
      typed&&h('div',{style:{fontSize:9.5,color:'var(--text3)'}},Object.entries(by).filter(([,v])=>v>0).map(([id,v])=>id+' '+rs(v)).join(' · ')||'nothing recovered'),
      !typed&&h('div',{style:{fontSize:9.5,color:'var(--text3)'}},'of '+rs(due.reduce((t,x)=>t+x.cap,0))+' due')),
    open&&h('div',{className:'modal-overlay',onClick:()=>setOpen(false),style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}},
      h('div',{onClick:e=>e.stopPropagation(),style:{background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:'var(--r3)',padding:20,width:600,maxWidth:'94vw',textAlign:'left',whiteSpace:'normal'}},
        h('div',{style:{fontSize:16,fontWeight:700,marginBottom:4}},'Advance Adj. — '+w.name+' — '+SM_MON[m]+' '+y),
        h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:10}},'Type how much to recover from each advance this month (0 to skip it). It is recorded against that advance when the row is approved.'),
        h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Advance','Given on','Amount','Still due','Plan this month','Recover now'].map((x,i)=>h('th',{key:i,style:i>1?{textAlign:'right'}:null},x)))),
          h('tbody',null,due.map(x=>h('tr',{key:x.id},h('td',null,h('b',null,x.id),x.reason?h('div',{style:{fontSize:10.5,color:'var(--text3)'}},x.reason):null),h('td',null,dmy(x.date)),h('td',{style:{textAlign:'right'}},rs(x.amount)),h('td',{style:{textAlign:'right'}},rs(x.cap)),h('td',{style:{textAlign:'right',color:'var(--text3)'}},rs(x.plan)),
            h('td',{style:{textAlign:'right'}},h('input',{type:'number',min:0,max:x.cap,className:'form-control',style:{width:100,textAlign:'right',padding:'3px 6px',marginLeft:'auto'},value:vals[x.id]==null?'':vals[x.id],onChange:e=>setVals({...vals,[x.id]:e.target.value})}))))))),
        h('div',{style:{display:'flex',gap:8,alignItems:'center',marginTop:12,flexWrap:'wrap'}},h('b',null,'Total '+rs(tot)),h('span',{style:{flex:1}}),
          h('button',{className:'btn btn-ghost btn-sm',onClick:usePlan},'↺ Use the plan'),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setOpen(false)},'Cancel'),h('button',{className:'btn btn-primary btn-sm',onClick:save},'✓ Save')))));
}

// A table cell that is a box (Salary Working).
function SmAmtCell({sid,y,m,w,k,calc,locked,onChanged,bg,color}){
  const h=React.createElement;if(k==='adv')return h(SmAdvCell,{sid,y,m,w,calc,locked,onChanged,bg,color});const a=(smAmts(sid,y,m)[w.id]||{})[k];const c=Math.round(Number(smCalcOf(calc,k))||0);
  return h('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right',background:bg||'rgba(244,196,48,0.12)'},title:(k==='net'?'Net Salary typed by hand (before advance recovery)':'Typed by hand — ✍ Manual salary')+'. Calculated: ₹'+c.toLocaleString('en-IN')+'. Leave blank to use the calculated figure.'},
    h('input',{key:k+'|'+(a==null?'':a),type:'number',min:0,defaultValue:a==null?'':a,placeholder:String(c),disabled:!!locked,
      onBlur:e=>{const v=String(e.target.value).trim();if(v===String(a==null?'':a))return;smSetAmt(sid,y,m,w.id,k,v);onChanged&&onChanged();},
      onKeyDown:e=>{if(e.key==='Enter')e.target.blur();},
      style:{width:84,textAlign:'right',background:locked?'var(--bg2)':'var(--bg3)',border:'1px solid '+(a!=null?'#2f5fe0':'var(--border)'),borderRadius:4,color:color||'var(--text)',fontWeight:a!=null?700:400,fontSize:11.5,padding:'4px 6px',cursor:locked?'not-allowed':'text'}}),
    k==='adv'&&h('div',{style:{fontSize:9.5,color:'var(--text3)',marginTop:2}},(()=>{const due=salManualAdvDue(sid,w.name,y,m).reduce((t,x)=>t+x.cap,0);return due>0?'of '+'₹'+Math.round(due).toLocaleString('en-IN')+' due':'no advance due';})()),
    k==='net'&&a!=null&&Number(w.advAdj)>0&&h('div',{style:{fontSize:9.5,color:'var(--text3)',marginTop:2}},'pays ₹'+Math.round(Number(w.net)||0).toLocaleString('en-IN')+' after advance'));
}

// The set-up + list card on Salary Working.
function SalManualPanel({salon,year,month,onChanged,locked}){
  const h=React.createElement;const sid=salon&&salon.id;const [open,setOpen]=useState(false);const [,t]=useState(0);if(sid==null)return null;
  const cfg=smCfg(sid,year,month);const amt=smAmts(sid,year,month);const label=SM_MON[month]+' '+year;
  const bump=()=>{t(x=>x+1);onChanged&&onChanged();};const setC=p=>{smSetCfg(sid,year,month,{...cfg,...p});bump();};
  let emps=[];try{emps=getEmployeesForMonth(year,month,sid)||[];}catch(x){}
  const typed=Object.keys(amt).filter(id=>smInScope(cfg,id)&&Object.keys(amt[id]||{}).length).length;
  const radio=(name,val,cur,lbl,on)=>h('label',{style:{display:'inline-flex',gap:5,alignItems:'center',fontSize:12.5,marginRight:12,cursor:locked?'not-allowed':'pointer'}},h('input',{type:'radio',name,checked:cur===val,disabled:locked,onChange:on}),lbl);
  const head=h('div',{style:{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',cursor:'pointer'},onClick:()=>setOpen(!open)},h('b',null,'✍ Manual salary'),
    h('span',{style:{fontSize:12,color:cfg.who==='off'?'var(--text3)':'#2f5fe0'}},cfg.who==='off'?'Off — every figure is calculated':(cfg.who==='all'?'All employees':(cfg.emps||[]).length+' selected')+' · '+(cfg.mode==='net'?'whole Net Salary':SM_PARTS.filter(([k])=>cfg.parts[k]).map(x=>x[1]).join(', ')||'no part chosen')+' · '+typed+' typed — type in the table below'),
    h('span',{style:{marginLeft:'auto',fontSize:12,color:'var(--text3)'}},open?'▴ Hide':'▾ Set up'));
  if(!open)return h('div',{className:'card',style:{marginBottom:12,padding:'10px 14px'}},head);
  const clear=()=>{if(!window.confirm('Clear every figure typed by hand for '+label+'? The calculated figures will be used again.'))return;const A=smAll(sid);const k=smYm(year,month);if(A[k]){A[k].amt={};smSaveAll(sid,A);}bump();};
  return h('div',{className:'card',style:{marginBottom:12}},head,
    h('div',{style:{marginTop:10,display:'flex',flexDirection:'column',gap:8}},
      locked&&h('div',{style:{fontSize:12,color:'var(--red)'}},'🔒 '+label+' is locked — unlock it to change these.'),
      cfg.carried&&h('div',{style:{fontSize:11.5,color:'var(--text3)'}},'Set-up carried from '+cfg.carried.split('-').reverse().join('/')+'; typed figures start blank each month.'),
      h('div',null,h('span',{style:{fontSize:12,fontWeight:600,marginRight:10}},'Apply to'),radio('sm-who-'+sid,'off',cfg.who,'Nobody (off)',()=>setC({who:'off'})),radio('sm-who-'+sid,'all',cfg.who,'All employees',()=>setC({who:'all'})),radio('sm-who-'+sid,'sel',cfg.who,'Selected employees',()=>setC({who:'sel'}))),
      cfg.who==='sel'&&h('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},emps.map(w=>{const on=(cfg.emps||[]).map(String).includes(String(w.id));
        return h('label',{key:w.id,style:{fontSize:12,padding:'3px 8px',borderRadius:12,border:'1px solid '+(on?'#2f5fe0':'var(--border)'),display:'inline-flex',gap:4,alignItems:'center',cursor:locked?'not-allowed':'pointer'}},
          h('input',{type:'checkbox',checked:on,disabled:locked,onChange:()=>setC({emps:on?(cfg.emps||[]).filter(x=>String(x)!==String(w.id)):[...(cfg.emps||[]),w.id]})}),w.name);})),
      cfg.who!=='off'&&h('div',null,h('span',{style:{fontSize:12,fontWeight:600,marginRight:10}},'What to type'),radio('sm-mode-'+sid,'net',cfg.mode,'Whole Net Salary',()=>setC({mode:'net'})),radio('sm-mode-'+sid,'parts',cfg.mode,'Part by part',()=>setC({mode:'parts'}))),
      cfg.who!=='off'&&cfg.mode==='parts'&&h('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},SM_PARTS.map(([k,l])=>h('label',{key:k,style:{fontSize:12,display:'inline-flex',gap:4,alignItems:'center',marginRight:8,cursor:locked?'not-allowed':'pointer'}},
        h('input',{type:'checkbox',checked:!!cfg.parts[k],disabled:locked,onChange:e=>setC({parts:{...cfg.parts,[k]:e.target.checked}})}),l))),
      cfg.who!=='off'&&!locked&&h('div',null,h('button',{className:'btn btn-ghost btn-sm',onClick:clear},'✕ Clear typed figures')),
      h('div',{style:{fontSize:11.5,color:'var(--text3)'}},cfg.mode==='net'?'Net Salary typed = the pay before advance recovery; the month’s advance instalment is still taken off. ':'Each typed part replaces the calculated one in Net Salary; PF, ESIC and Prof. Tax typed here also go to the PF / ESIC / PT challans and statements. Advance Adj. is recovered from the employee’s advances, oldest first, never more than they still owe — and recorded against each advance when the row is approved. ',
        'The boxes appear in the table below — a blank box keeps the calculated figure (shown in grey). Changes are kept in 🧰 Pay tools → Change log when that is on.')));
}
