// ═════════════════════════════════════════════════════════════════════════════════════════════
// ✍ Manual salary (Salary Working) — type salary figures by hand for all employees or only the ones
// you pick, either the whole Net Salary or part by part (Gross Salary, Tea, PF, ESIC, Prof. Tax,
// TDS, Penalties). Switched on and set up on the Salary Working sheet itself (per month, carried
// forward); the typed figures sit in the table's own cells, a blank box keeps the calculated one.
//   • Parts replace the calculated figure in Net Salary; PF / ESIC / PT typed here also go to the
//     PF / ESIC / PT figures and challans (statutoryDeductionsFor), like the existing overrides.
//   • Whole Net Salary: the typed figure is the pay before advance recovery; the advance instalment
//     is still taken off (it is settled on the Advances sheet).
// Store: salonos_sal_manual_outlet_<id> = {'YYYY-MM':{cfg:{who,emps,mode,parts},amt:{empId:{…}}}}.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const SM_PARTS=[['gross','Gross Salary'],['tea','Tea'],['pf','PF (Emp)'],['esic','ESIC (Emp)'],['pt','Prof. Tax'],['tds','TDS'],['pen','Penalties']];
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
  const a=smAmts(sid,y,m)[e.id]||{};const v=k=>a[k]==null||a[k]===''?null:Number(a[k])||0;const o={gross:null,tea:null,pf:null,esic:null,pt:null,tds:null,pen:null,net:null};
  if(c.mode==='net')o.net=v('net');else SM_PARTS.forEach(([k])=>{if(c.parts[k])o[k]=v(k);});
  return Object.values(o).some(x=>x!=null)?o:null;
}
function smCalculated(sid,y,m){SM_BYPASS=true;try{return(typeof ffLive==='function'?ffLive(()=>swWorkingsFor(sid,y,m)):swWorkingsFor(sid,y,m))||[];}catch(e){return[];}finally{SM_BYPASS=false;}}
function smCalcOf(w,k){if(!w)return 0;return k==='net'?Math.max(0,(Number(w.net)||0)+(Number(w.advAdj)||0)):k==='gross'?w.grossAfterLop:k==='tea'?w.tea:k==='pf'?w.pfEmp:k==='esic'?w.esicEmp:k==='pt'?w.ptAmt:k==='tds'?w.tdsAmt:w.penAmt;}

// A table cell that is a box (Salary Working).
function SmAmtCell({sid,y,m,w,k,calc,locked,onChanged,bg,color}){
  const h=React.createElement;const a=(smAmts(sid,y,m)[w.id]||{})[k];const c=Math.round(Number(smCalcOf(calc,k))||0);
  return h('td',{style:{padding:'4px 6px',borderBottom:'1px solid var(--border)',textAlign:'right',background:bg||'rgba(244,196,48,0.12)'},title:(k==='net'?'Net Salary typed by hand (before advance recovery)':'Typed by hand — ✍ Manual salary')+'. Calculated: ₹'+c.toLocaleString('en-IN')+'. Leave blank to use the calculated figure.'},
    h('input',{key:k+'|'+(a==null?'':a),type:'number',min:0,defaultValue:a==null?'':a,placeholder:String(c),disabled:!!locked,
      onBlur:e=>{const v=String(e.target.value).trim();if(v===String(a==null?'':a))return;smSetAmt(sid,y,m,w.id,k,v);onChanged&&onChanged();},
      onKeyDown:e=>{if(e.key==='Enter')e.target.blur();},
      style:{width:84,textAlign:'right',background:locked?'var(--bg2)':'var(--bg3)',border:'1px solid '+(a!=null?'#2f5fe0':'var(--border)'),borderRadius:4,color:color||'var(--text)',fontWeight:a!=null?700:400,fontSize:11.5,padding:'4px 6px',cursor:locked?'not-allowed':'text'}}),
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
      h('div',{style:{fontSize:11.5,color:'var(--text3)'}},cfg.mode==='net'?'Net Salary typed = the pay before advance recovery; the month’s advance instalment is still taken off. ':'Each typed part replaces the calculated one in Net Salary; PF, ESIC and Prof. Tax typed here also go to the PF / ESIC / PT challans and statements. ',
        'The boxes appear in the table below — a blank box keeps the calculated figure (shown in grey). Changes are kept in 🧰 Pay tools → Change log when that is on.')));
}
