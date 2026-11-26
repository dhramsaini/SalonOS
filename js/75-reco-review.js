// ═══════════════════════════════════════════════════════════════════════════════════════════
// Bank Reconcile — "For review" view (a second layout of the same screen, chosen on the screen).
//   Tiles on top, a "For review" list with one action per line (Match / Add / Review), and the
//   matches, categories and split under the line when it is opened.
//   It uses the same matching (rcBuild) and the same actions (ok → rcApply, mapAs, newVendor) as
//   the classic view in js/72 — nothing is saved differently.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The amount a match applies (bills, salary lines) — else the bank amount.
function rcvAltAmount(a,bankAmt){const ap=a&&a.apply;if(!ap)return bankAmt;
  if(ap.type==='link'&&ap.plan&&ap.plan.allocations)return ap.plan.allocations.reduce((t,x)=>t+(Number(x.amount)||0),0);
  if(ap.type==='pay'&&ap.plan&&ap.plan.lines)return ap.plan.lines.reduce((t,l)=>t+(Number(l.salaryAmt)||0)+(Number(l.incentiveAmt)||0),0);
  return bankAmt;}
// Who the line is paid to / received from, as the match reads it.
function rcvPayee(it){const s=it.s,ap=s&&s.apply;
  if(ap&&ap.type==='pay'&&ap.plan&&ap.plan.lines)return ap.plan.lines.map(l=>l.employeeName).join(', ');
  if(ap&&ap.type==='link'&&ap.plan&&ap.plan.vendor)return ap.plan.vendor.name;
  if(ap&&ap.type==='advance'&&ap.line)return ap.line.employeeName;
  if(ap&&ap.type==='transfer'&&ap.other)return ap.other.name;
  if(ap&&ap.type==='patch'&&ap.patch&&ap.patch.vendorOverride)return ap.patch.vendorOverride;
  return rcPayeeName(it.x.description)||'';}
// A match to something already in the books, or a category to post the line to.
function rcvIsMatch(a){const t=a&&a.apply&&a.apply.type;return t==='link'||t==='pay'||t==='due'||t==='transfer'||t==='advance'||!!(a&&a.payout);}
// Month-end bank balance: closing balance of the last line of the month.
function rcvMonthEndBalance(lines){let best=null,bt=-1;(lines||[]).forEach((r,i)=>{if(!r||r.closingBalance===''||r.closingBalance==null||!isFinite(Number(r.closingBalance)))return;
  const iso=toISO(r.transactionDate)||'';const t=iso?new Date(iso+'T00:00:00').getTime():0;if(t>bt||(t===bt)){bt=t;best=r;}});return best?Number(best.closingBalance):null;}

function RcReviewTop({data,M,pct,doneN,total,count,filter,setFilter,setSel,side,setSide,typeF,setTypeF,q,setQ,searchRef,P,panel,setPanel,showSet,setShowSet,so,bal,acc}){
  const h=React.createElement;
  const openAmt=data.items.reduce((t,i)=>t+(i.x.debit||i.x.credit),0);
  const endBal=rcvMonthEndBalance(data.all);
  const tile=(k,label,value,sub,on,onClick,color)=>h('button',{key:k,type:'button',className:'rcv-tile'+(on?' on':''),onClick},
    h('div',{className:'rcv-tk'},label),h('div',{className:'rcv-tv',style:color?{color}:null},value),h('div',{className:'rcv-ts'},sub));
  const T=[['todo','For review',data.items.length],['sure','Sure',count('sure')],['check','Check',count('check')],['new','New payee',count('new')],['unknown','No match',count('unknown')],['done','Reconciled',doneN]];
  const settleWarn=data.settlements.filter(g=>g.status!=='ok').length;
  return h('div',{style:{marginBottom:10}},
    h('div',{className:'rcv-tiles'},
      tile('bal','Bank balance at month end',endBal!=null?M(endBal):'—',total+' lines this month',false,()=>setPanel(p=>p==='breaks'?null:'breaks')),
      tile('rev','For review',String(data.items.length),M(openAmt)+' not yet reconciled',filter==='todo',()=>{setFilter('todo');setSel(0);},data.items.length?'#b26a00':'var(--green)'),
      tile('pct','Reconciled',pct+'%',doneN+' of '+total+' lines',filter==='done',()=>{setFilter('done');setSel(0);},'var(--green)'),
      tile('st','This month',so?'Signed off':'Open',so?('by '+(so.by||'—')):(bal&&bal.gaps?'⚠ balance breaks in '+bal.gaps+' place'+(bal.gaps===1?'':'s'):(bal?'✓ statement balance runs through':'')),false,()=>setPanel(p=>p==='breaks'?null:'breaks'),so?'var(--green)':null)),
    h('div',{className:'rcv-tabs'},
      T.map(([k,l,n])=>h('button',{key:k,type:'button',className:'rcv-tab'+(filter===k?' on':''),onClick:()=>{setFilter(k);setSel(0);}},l+' ('+n+')')),
      h('div',{style:{flex:1}}),
      h('select',{className:'form-control',style:{width:'auto',padding:'3px 8px',fontSize:12},value:side,onChange:e=>{setSide(e.target.value);setSel(0);}},
        h('option',{value:'all'},'Spent and received'),h('option',{value:'Debit'},'Spent only'),h('option',{value:'Credit'},'Received only')),
      h('select',{className:'form-control',style:{width:'auto',padding:'3px 8px',fontSize:12},value:typeF||'',onChange:e=>{setTypeF(e.target.value||null);setSel(0);}},
        h('option',{value:''},'All types'),h('option',{value:'salary'},'Salary and incentive'),h('option',{value:'vendor'},'Vendors'),h('option',{value:'settle'},'Card / UPI'),h('option',{value:'other'},'Other')),
      h(MenuButton,{label:'Tools'+(panel||showSet?' •':''),items:[
        {label:'Card / UPI settled '+data.settlements.reduce((t,g)=>t+g.n,0)+(settleWarn?' · ⚠ '+settleWarn:''),onClick:()=>setShowSet(v=>!v)},
        ...P.map(([k,l])=>({label:l,onClick:()=>setPanel(p=>p===k?null:k)}))]}),
      h('input',{ref:searchRef,className:'form-control',style:{width:200,padding:'4px 10px'},placeholder:'Search ( / )',value:q,onChange:e=>{setQ(e.target.value);setSel(0);}})),
    acc&&h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:4,textAlign:'right'}},'Suggestions right '+acc.pct+'% this month ('+acc.n+')'));
}

function RcReviewTable({sid,data,shown,cur,setSel,open,setOpen,checked,toggleCheck,setChecked,locked,ok,mapAs,newVendor,onNavTab,listRef,M}){
  const h=React.createElement;
  const [mode,setMode]=useState('match');const [pick,setPick]=useState(0);
  useEffect(()=>{setMode('match');setPick(0);},[open]);
  const chip=(t,cls)=>h('span',{className:'rcv-chip '+cls},t);
  const statusChip=it=>{const s=it.s;if(!s)return it.newPayee?chip('New payee','b'):chip('No match','n');
    if(it.bucket==='check')return chip('Check','y');return rcvIsMatch(s)?chip('Match found','g'):chip('Rule','b');};
  const action=(it,isOpen)=>{const s=it.s;
    if(s&&it.bucket==='sure'&&!it.dup)return h('button',{type:'button',className:'rcv-act',disabled:locked,onClick:e=>{e.stopPropagation();ok(it,s);}},rcvIsMatch(s)?'Match':'Add');
    return h('button',{type:'button',className:'rcv-lnk',onClick:e=>{e.stopPropagation();setOpen(isOpen?null:it.x.id);}},isOpen?'Close ▴':s?'Review':'Choose');};
  const panelFor=it=>{const x=it.x,cr=x.side==='Credit',amt=x.debit||x.credit;
    const alts=(it.alts&&it.alts.length?it.alts:(it.s?[it.s]:[])).slice(0,6);const a=alts[Math.min(pick,alts.length-1)];
    const applied=a?rcvAltAmount(a,amt):0;const leftOver=Math.round((amt-applied)*100)/100;
    const radio=(k,l)=>h('label',{key:k,className:'rcv-radio'+(mode===k?' on':'')},h('input',{type:'radio',checked:mode===k,onChange:()=>setMode(k)}),l);
    return h('div',{className:'rcv-panel'},
      h('div',{className:'rcv-radios'},radio('match','Find match'+(alts.length?' ('+alts.length+')':'')),radio('cat','Categorise'),radio('why','Why this match'),
        h('button',{type:'button',className:'rcv-lnk',style:{marginLeft:'auto'},onClick:()=>onNavTab&&onNavTab('bank-statement')},'Split or link by hand in Bank Statement →')),
      mode==='match'&&(alts.length?h('div',{className:'rcv-mwrap'},
        h('table',{className:'rcv-mt'},
          h('thead',null,h('tr',null,h('th',{style:{width:26}}),h('th',null,'Possible matches'),h('th',{className:'num'},'Applies'),h('th',null,'Why'),h('th',{className:'num'},'Score'))),
          h('tbody',null,alts.map((z,k)=>h('tr',{key:k,className:k===pick?'on':'',onClick:()=>setPick(k)},
            h('td',null,h('input',{type:'radio',checked:k===pick,onChange:()=>setPick(k)})),
            h('td',null,h('div',{style:{fontWeight:600}},z.label),z.why&&h('div',{className:'rcv-sub'},z.why)),
            h('td',{className:'num'},M(rcvAltAmount(z,amt))),
            h('td',{className:'rcv-sub'},(z.reasons||[]).slice(0,3).join(' · ')),
            h('td',{className:'num',style:{color:z.score>=0.9?'var(--green)':'#b26a00',fontWeight:600}},Math.round(z.score*100)+'%'))))),
        h('div',{className:'rcv-sum'},
          h('div',{className:'rcv-sub'},'Bank amount'),h('div',{className:'rcv-big'},M(amt)),
          h('div',{className:'rcv-sub',style:{marginTop:8}},'Selected match applies'),h('div',{className:'rcv-big'},M(applied)),
          Math.abs(leftOver)>0.5&&h('div',{style:{marginTop:6,color:'#b26a00',fontWeight:600,fontSize:12.5}},leftOver>0?M(leftOver)+' of the bank amount not covered':M(-leftOver)+' more than the bank amount'),
          it.dup&&h('div',{style:{marginTop:6,color:'var(--red)',fontSize:12}},'⚠ Possible duplicate of '+it.dup[0].transactionDate),
          h('div',{style:{display:'flex',gap:8,marginTop:12}},
            h('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:()=>setOpen(null)},'Cancel'),
            h('button',{type:'button',className:'rcv-act',disabled:locked||!a,onClick:()=>{if(a!==it.s&&it.s)try{noteBankFeedback(sid,x,typeof suggestionNature==='function'?(suggestionNature(it.s)||it.s.label):it.s.label,false);}catch(e){}ok(it,a);}},'Save'))))
        :h('div',{className:'rcv-sub',style:{padding:'8px 0'}},'No bill, salary or other entry matches this line. Choose “Categorise”, or add the vendor.')),
      mode==='cat'&&h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',padding:'4px 0'}},
        !cr&&h('button',{type:'button',className:'btn btn-ghost btn-sm',disabled:locked,onClick:()=>newVendor(it)},'＋ New vendor'),
        !cr&&RC_DEBIT_CHOICES.map(([n,l])=>h('button',{key:n,type:'button',className:'btn btn-ghost btn-sm',disabled:locked,onClick:()=>mapAs(it,n)},l)),
        cr&&RC_CREDIT_CHOICES.map(([n,l])=>h('button',{key:n,type:'button',className:'btn btn-ghost btn-sm',disabled:locked,onClick:()=>mapAs(it,n,/Settlement$/.test(n)?{cradleeDate:bmapPrevDay(x.date)}:undefined)},l)),
        h('select',{className:'form-control',style:{width:'auto',padding:'3px 8px',fontSize:12},value:'',disabled:locked,onChange:e=>{if(e.target.value)mapAs(it,e.target.value);}},
          h('option',{value:''},'Other category…'),(typeof BANK_MAP_NATURES!=='undefined'?BANK_MAP_NATURES:[]).filter(n=>cr?BANK_CREDIT_NATURES.has(n):!BANK_CREDIT_NATURES.has(n)||n==='Transfer'||n==='Other'||n==='Refund').map(n=>h('option',{key:n,value:n},n)))),
      mode==='why'&&h('ul',{style:{margin:'4px 0 0 18px',padding:0,fontSize:12.5,color:'var(--text2)'}},rcExplain(sid,it).map((l,k)=>h('li',{key:k},l))));};
  return h('div',{className:'card',ref:listRef,style:{padding:0}},
    !shown.length&&h('div',{style:{padding:'28px 16px',textAlign:'center',color:'var(--text3)',fontSize:13}},data.items.length?'Nothing in this filter.':'✓ Every bank line of this month is reconciled.'),
    shown.length>0&&h('div',{className:'table-wrap',style:{margin:0}},h('table',{className:'rcv-table'},
      h('thead',null,h('tr',null,
        h('th',{style:{width:28}},h('input',{type:'checkbox',checked:shown.every(i=>checked.has(i.x.id)),onChange:e=>setChecked(e.target.checked?new Set(shown.map(i=>i.x.id)):new Set())})),
        h('th',null,'Date'),h('th',null,'Bank description'),h('th',null,'Payee'),h('th',null,'Category or match'),h('th',{className:'num'},'Spent'),h('th',{className:'num'},'Received'),h('th',{style:{width:90}},'Action'))),
      h('tbody',null,shown.map((it,i)=>{const x=it.x,s=it.s,cr=x.side==='Credit',isOpen=open===x.id,isSel=cur===it;const payee=rcvPayee(it);
        return h(React.Fragment,{key:x.id},
          h('tr',{'data-rc-sel':isSel?'1':'0',className:(isSel?'sel ':'')+(isOpen?'open':''),onClick:()=>{setSel(i);setOpen(isOpen?null:x.id);}},
            h('td',{onClick:e=>e.stopPropagation()},h('input',{type:'checkbox',checked:checked.has(x.id),onChange:()=>toggleCheck(x.id)})),
            h('td',{style:{whiteSpace:'nowrap'}},x.date),
            h('td',{className:'rcv-desc',title:x.description},h('span',{style:isOpen?{fontWeight:700}:null},x.description)),
            h('td',null,payee||(!cr&&it.newPayee?h('button',{type:'button',className:'rcv-lnk',disabled:locked,onClick:e=>{e.stopPropagation();newVendor(it);}},'+ Add payee'):h('span',{className:'rcv-sub'},'—'))),
            h('td',null,statusChip(it),' ',s?h('span',{title:s.why||''},s.label):h('span',{className:'rcv-sub'},it.newPayee?it.newPayee+' isn’t a vendor or employee yet':'Choose what it is')),
            h('td',{className:'num'},cr?'':M(x.debit)),
            h('td',{className:'num'},cr?M(x.credit):''),
            h('td',null,action(it,isOpen))),
          isOpen&&h('tr',{className:'rcv-open'},h('td',{colSpan:8},panelFor(it))));})))));
}
