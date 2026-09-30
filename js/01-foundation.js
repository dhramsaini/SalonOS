
const {useState,useEffect,useRef,useCallback,useMemo}=React;

// ── Shared currency formatter, used by every screen ──
// decimals: number of fraction digits (default 0)
// dashZero: show '—' instead of '₹0' when the amount is zero (default false)
function formatMoney(n,{decimals=0,dashZero=false}={}){
  const num=Number(n||0);
  if(dashZero&&num===0)return '—';
  return '₹'+num.toLocaleString('en-IN',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
}

// ── Button interactions — ripple + success/error flash, shared by every .btn in the app ──
// Ripple: one delegated listener catches every click on a .btn, drops a short-lived circle
// at the exact click point (clipped by the button's own overflow:hidden), and removes it once
// the CSS animation finishes. No per-button wiring needed — it's automatic for any element
// with the .btn class.
document.addEventListener('click',(e)=>{
  const btn=e.target.closest && e.target.closest('.btn,.tab-btn,.nav-item');
  if(!btn||btn.disabled)return;
  const rect=btn.getBoundingClientRect();
  const size=Math.max(rect.width,rect.height);
  const span=document.createElement('span');
  span.className='btn-ripple';
  span.style.width=span.style.height=size+'px';
  span.style.left=(e.clientX-rect.left-size/2)+'px';
  span.style.top=(e.clientY-rect.top-size/2)+'px';
  btn.appendChild(span);
  setTimeout(()=>span.remove(),500);
});
// flashButton(el,'success'|'error') — call from any onClick handler after an action resolves,
// e.g. flashButton(e.currentTarget,'success') on a successful save, or 'error' on a failed one.
// Not wired into every action in this app (that's hundreds of call sites) — it's applied to a
// couple of representative ones (Sign In, Save Vendor) as a working example to build out from.
window.flashButton=(el,type)=>{
  if(!el)return;
  const cls=type==='error'?'btn-flash-error':'btn-flash-success';
  el.classList.remove('btn-flash-error','btn-flash-success');
  void el.offsetWidth; // restart the animation if it's already mid-flash
  el.classList.add(cls);
  setTimeout(()=>el.classList.remove(cls),800);
};


// ── Excel-style column AutoFilter — shared across every data table in the app. Pass it the full
// (unfiltered) row list and a column-def array [{key,label,get(row)}]; it returns the filtered
// rows plus two ready-to-use renderers: TH(col) for a clickable funnel header cell, and Portal()
// for the checklist popover (call once per table, anywhere in the returned tree). Behaviour
// mirrors Excel's AutoFilter: per-column checklist of distinct values with counts, search box,
// Select All / Clear All, and "no filter" = everything shown. ──
function useExcelColumnFilter(rows,cols){
  const [columnFilters,setColumnFilters]=useState({});
  const [openFilterCol,setOpenFilterCol]=useState(null);
  const [filterPos,setFilterPos]=useState({top:0,left:0});
  const [filterSearch,setFilterSearch]=useState('');
  useEffect(()=>{
    if(!openFilterCol)return;
    const onDocMouseDown=(e)=>{
      if(e.target.closest&&(e.target.closest('.autofilter-toggle')||e.target.closest('.autofilter-popover')))return;
      setOpenFilterCol(null);
    };
    document.addEventListener('mousedown',onDocMouseDown);
    return ()=>document.removeEventListener('mousedown',onDocMouseDown);
  },[openFilterCol]);
  const openFilterAt=(colKey,e)=>{
    if(openFilterCol===colKey){setOpenFilterCol(null);return;}
    const rect=e.currentTarget.getBoundingClientRect();
    const popW=260;
    const popH=420; // generous estimate of the popover's max height (header+search+list+footer)
    let left=rect.left;
    if(left+popW>window.innerWidth-12)left=Math.max(12,window.innerWidth-12-popW);
    // Horizontal clamping already existed here, but vertical never did — a header row sitting in
    // the lower half of a tall page (common once a table has settings/metric cards above it, as
    // Incentive Working does) meant the popover opened downward off the bottom of the viewport
    // with no way to reach it, since position:fixed content doesn't move when the page scrolls.
    // Flip it to open upward instead whenever there isn't room below.
    let top=rect.bottom+6;
    if(top+popH>window.innerHeight-12){
      top=Math.max(12,rect.top-popH-6);
    }
    setFilterPos({top,left});
    setFilterSearch('');
    setOpenFilterCol(colKey);
  };
  const uniqueValuesFor=(col)=>{
    const counts=new Map();
    rows.forEach(r=>{const v=String(col.get(r));counts.set(v,(counts.get(v)||0)+1);});
    return Array.from(counts.entries()).map(([value,count])=>({value,count})).sort((a,b)=>a.value.localeCompare(b.value));
  };
  const toggleFilterValue=(colKey,val,allVals)=>{
    setColumnFilters(prev=>{
      const cur=prev[colKey]?new Set(prev[colKey]):new Set(allVals);
      if(cur.has(val))cur.delete(val);else cur.add(val);
      const next={...prev};
      if(cur.size===allVals.length)delete next[colKey];
      else next[colKey]=cur;
      return next;
    });
  };
  const clearColumnFilter=(colKey)=>setColumnFilters(prev=>{const next={...prev};delete next[colKey];return next;});
  const filteredRows=rows.filter(r=>{
    for(const col of cols){
      const active=columnFilters[col.key];
      if(active!==undefined&&!active.has(String(col.get(r))))return false;
    }
    return true;
  });
  const TH=(col)=>{
    const active=columnFilters[col.key];
    const isOpen=openFilterCol===col.key;
    return React.createElement('th',{key:col.key,style:{whiteSpace:'nowrap'}},
      React.createElement('div',{
        className:'autofilter-toggle',
        style:{display:'inline-flex',alignItems:'center',gap:6,cursor:'pointer',userSelect:'none',padding:'3px 6px',borderRadius:5,background:isOpen?'rgba(47,95,224,0.16)':'transparent',transition:'background 0.12s'},
        onClick:e=>openFilterAt(col.key,e)
      },
        col.label,
        React.createElement('span',{style:{display:'inline-flex',alignItems:'center',justifyContent:'center',width:14,height:14,borderRadius:3,background:active?'var(--accent)':'transparent',color:active?'#1a1410':'var(--text3)',fontSize:8}},'▾')
      )
    );
  };
  const Portal=()=>{
    if(!openFilterCol)return null;
    const col=cols.find(c=>c.key===openFilterCol);
    if(!col)return null;
    const allVals=uniqueValuesFor(col);
    const active=columnFilters[col.key];
    const visibleVals=allVals.filter(v=>v.value.toLowerCase().includes(filterSearch.toLowerCase()));
    const isChecked=(v)=>!active||active.has(v);
    const selectedCount=active?active.size:allVals.length;
    return ReactDOM.createPortal(
      React.createElement('div',{className:'autofilter-popover',style:{position:'fixed',top:filterPos.top,left:filterPos.left,zIndex:1000,width:260,background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:10,boxShadow:'0 12px 32px rgba(0,0,0,0.45),0 2px 8px rgba(0,0,0,0.3)',overflow:'hidden',fontFamily:'inherit'}},
        React.createElement('div',{style:{padding:'10px 12px',borderBottom:'1px solid var(--border)',background:'var(--bg3)'}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text)',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}},
            React.createElement('span',null,col.label),
            React.createElement('span',{style:{fontSize:10,fontWeight:500,color:'var(--text3)'}},selectedCount+' of '+allVals.length)
          ),
          React.createElement('div',{style:{position:'relative'}},
            React.createElement('span',{style:{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',fontSize:11,color:'var(--text3)'}},React.createElement(IconSearch,{size:13})),
            React.createElement('input',{value:filterSearch,onChange:e=>setFilterSearch(e.target.value),placeholder:'Search values…',autoFocus:true,
              style:{width:'100%',padding:'6px 8px 6px 24px',fontSize:12,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)'}})
          )
        ),
        React.createElement('div',{style:{display:'flex',gap:8,padding:'8px 12px',borderBottom:'1px solid var(--border)'}},
          React.createElement('button',{onClick:()=>clearColumnFilter(col.key),style:{flex:1,padding:'4px 0',fontSize:10.5,fontWeight:600,color:'var(--accent)',background:'transparent',border:'none',cursor:'pointer'}},'Select All'),
          React.createElement('button',{onClick:()=>setColumnFilters(prev=>({...prev,[col.key]:new Set()})),style:{flex:1,padding:'4px 0',fontSize:10.5,fontWeight:600,color:'var(--text3)',background:'transparent',border:'none',cursor:'pointer'}},'Clear All')
        ),
        React.createElement('div',{style:{maxHeight:240,overflowY:'auto',padding:'6px 4px'}},
          visibleVals.length===0
            ?React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',padding:'14px 12px',textAlign:'center'}},'No matching values')
            :visibleVals.map(({value,count})=>React.createElement('label',{key:value,
                style:{display:'flex',alignItems:'center',gap:8,fontSize:12,padding:'6px 8px',cursor:'pointer',color:'var(--text2)',borderRadius:6},
                onMouseEnter:e=>e.currentTarget.style.background='rgba(47,95,224,0.08)',
                onMouseLeave:e=>e.currentTarget.style.background='transparent'
              },
                React.createElement('input',{type:'checkbox',checked:isChecked(value),onChange:()=>toggleFilterValue(col.key,value,allVals.map(v=>v.value))}),
                React.createElement('span',{style:{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},value),
                React.createElement('span',{style:{fontSize:10,color:'var(--text3)'}},count)
              ))
        ),
        React.createElement('div',{style:{display:'flex',justifyContent:'flex-end',padding:'8px 12px',borderTop:'1px solid var(--border)',background:'var(--bg3)'}},
          React.createElement('button',{className:'btn btn-primary btn-sm',style:{padding:'5px 16px',fontSize:11.5},onClick:()=>setOpenFilterCol(null)},'OK')
        )
      ),
      document.body
    );
  };
  return {filteredRows,columnFilters,setColumnFilters,TH,Portal,hasActiveFilters:Object.keys(columnFilters).length>0,clearAll:()=>setColumnFilters({})};
}

// ── Excel-style cell-range copy/paste — attach to any table via a wrapper ref, and mark every
// <td> that should participate with data-xr={row index} data-xc={col index}. Click-drag (or
// shift+click) selects a rectangle; Ctrl/Cmd+C copies it as tab/newline-separated text (which is
// exactly what a real spreadsheet expects on paste); Ctrl/Cmd+V pastes clipboard text back in —
// filling every selected cell with a single copied value, or laying a copied block down starting
// at the selection's top-left cell, matching how Excel itself decides between the two. Paste only
// writes into cells that actually contain an <input>/<select>/<textarea> (i.e. inline-editable
// grids); on read-only tables Ctrl+C still works for copying data out into Excel — there's just
// nothing for Ctrl+V to write into. ──
function useExcelCellRange(wrapRef){
  const [anchor,setAnchor]=useState(null);
  const [focus,setFocus]=useState(null);
  const draggingRef=useRef(false);
  const cellAt=(el)=>{
    const td=el&&el.closest&&el.closest('[data-xr]');
    if(!td)return null;
    return{r:Number(td.getAttribute('data-xr')),c:Number(td.getAttribute('data-xc')),td};
  };
  useEffect(()=>{
    const wrap=wrapRef.current;
    if(!wrap)return;
    const onDown=(e)=>{
      const cell=cellAt(e.target);
      if(!cell)return;
      draggingRef.current=true;
      if(e.shiftKey&&anchor){setFocus({r:cell.r,c:cell.c});}
      else{setAnchor({r:cell.r,c:cell.c});setFocus({r:cell.r,c:cell.c});}
    };
    const onOver=(e)=>{
      if(!draggingRef.current)return;
      const cell=cellAt(e.target);
      if(!cell)return;
      setFocus({r:cell.r,c:cell.c});
    };
    const onUp=()=>{draggingRef.current=false;};
    wrap.addEventListener('mousedown',onDown);
    wrap.addEventListener('mouseover',onOver);
    window.addEventListener('mouseup',onUp);
    return ()=>{wrap.removeEventListener('mousedown',onDown);wrap.removeEventListener('mouseover',onOver);window.removeEventListener('mouseup',onUp);};
    // eslint-disable-next-line
  },[wrapRef.current]);
  const range=(!anchor||!focus)?null:{r1:Math.min(anchor.r,focus.r),r2:Math.max(anchor.r,focus.r),c1:Math.min(anchor.c,focus.c),c2:Math.max(anchor.c,focus.c)};
  const isSelected=(r,c)=>!!range&&r>=range.r1&&r<=range.r2&&c>=range.c1&&c<=range.c2;
  const cellText=(td)=>{
    if(!td)return '';
    const input=td.querySelector('input,select,textarea');
    if(input)return input.value!=null?String(input.value):'';
    return (td.innerText||td.textContent||'').trim();
  };
  const setNativeValue=(el,value)=>{
    const proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:el.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,'value')&&Object.getOwnPropertyDescriptor(proto,'value').set;
    if(setter)setter.call(el,value);else el.value=value;
    el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));
    if(el.tagName!=='SELECT')el.dispatchEvent(new Event('change',{bubbles:true}));
  };
  const doCopy=async()=>{
    const wrap=wrapRef.current;
    if(!wrap||!range)return;
    const lines=[];
    for(let r=range.r1;r<=range.r2;r++){
      const cells=[];
      for(let c=range.c1;c<=range.c2;c++)cells.push(cellText(wrap.querySelector('[data-xr="'+r+'"][data-xc="'+c+'"]')));
      lines.push(cells.join('\t'));
    }
    try{await navigator.clipboard.writeText(lines.join('\n'));}catch(err){}
  };
  const doPaste=async()=>{
    const wrap=wrapRef.current;
    if(!wrap||!range)return;
    let text='';
    try{text=await navigator.clipboard.readText();}catch(err){return;}
    if(!text)return;
    const lines=text.replace(/\r/g,'').split('\n');
    while(lines.length>1&&lines[lines.length-1]==='')lines.pop();
    const grid=lines.map(l=>l.split('\t'));
    const selR=range.r2-range.r1+1,selC=range.c2-range.c1+1;
    const singleValue=grid.length===1&&grid[0].length===1;
    if(singleValue&&(selR>1||selC>1)){
      for(let r=range.r1;r<=range.r2;r++)for(let c=range.c1;c<=range.c2;c++){
        const td=wrap.querySelector('[data-xr="'+r+'"][data-xc="'+c+'"]');
        const input=td&&td.querySelector('input,select,textarea');
        if(input)setNativeValue(input,grid[0][0]);
      }
    }else{
      for(let ri=0;ri<grid.length;ri++)for(let ci=0;ci<grid[ri].length;ci++){
        const td=wrap.querySelector('[data-xr="'+(range.r1+ri)+'"][data-xc="'+(range.c1+ci)+'"]');
        const input=td&&td.querySelector('input,select,textarea');
        if(input)setNativeValue(input,grid[ri][ci]);
      }
    }
  };
  // Fill Right — Excel's Ctrl+R: takes whatever is in the first (leftmost) selected column of
  // each row and repeats it across every other selected column in that same row. This is the
  // "same data as the first visible column, on every other visible column" behaviour — select
  // the first column plus however many columns to its right you want filled, then Fill Right.
  const doFillRight=()=>{
    const wrap=wrapRef.current;
    if(!wrap||!range||range.c2===range.c1)return;
    for(let r=range.r1;r<=range.r2;r++){
      const sourceTd=wrap.querySelector('[data-xr="'+r+'"][data-xc="'+range.c1+'"]');
      const sourceVal=cellText(sourceTd);
      for(let c=range.c1+1;c<=range.c2;c++){
        const td=wrap.querySelector('[data-xr="'+r+'"][data-xc="'+c+'"]');
        const input=td&&td.querySelector('input,select,textarea');
        if(input)setNativeValue(input,sourceVal);
      }
    }
  };
  useEffect(()=>{
    const onKeyDown=(e)=>{
      const wrap=wrapRef.current;
      if(!wrap||!range)return;
      const active=document.activeElement;
      if(!wrap.contains(active)&&active!==document.body)return;
      const isCopy=(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c';
      const isPaste=(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v';
      const isFillRight=(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='r';
      if(isCopy)doCopy();
      else if(isPaste){e.preventDefault();doPaste();}
      else if(isFillRight){e.preventDefault();doFillRight();}
    };
    document.addEventListener('keydown',onKeyDown);
    return ()=>document.removeEventListener('keydown',onKeyDown);
    // eslint-disable-next-line
  },[range,wrapRef]);
  // A fixed, stable toolbar — rendered once wherever the caller places it (e.g. next to a card
  // title), not a floating popup that chases the selection around the screen. Buttons just
  // disable themselves when there's nothing selected, rather than the whole toolbar vanishing
  // and reappearing in a different spot every time you click a different cell.
  const Toolbar=()=>{
    const hasSelection=!!range;
    const spansCols=!!range&&range.c2>range.c1;
    return React.createElement('div',{
      style:{display:'inline-flex',gap:4,background:'var(--bg3)',border:'1px solid var(--border2)',borderRadius:8,padding:4}
    },
      React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:10.5,padding:'4px 8px'},disabled:!hasSelection,title:hasSelection?'Copy selection (Ctrl/Cmd+C)':'Select a cell first',onClick:doCopy},'📋 Copy'),
      React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:10.5,padding:'4px 8px'},disabled:!hasSelection,title:hasSelection?'Paste into selection (Ctrl/Cmd+V)':'Select a cell first',onClick:doPaste},'📄 Paste'),
      React.createElement('button',{className:'btn btn-ghost btn-sm',style:{fontSize:10.5,padding:'4px 8px'},disabled:!spansCols,title:'Fill every selected column with the first column\'s value (Ctrl/Cmd+R)',onClick:doFillRight},'➡ Fill Right')
    );
  };
  return{isSelected,range,doCopy,doPaste,doFillRight,Toolbar};
}


// ── Global Toast System ──────────────────────────────────────────────
// ── In-app Help Panel — accessible from the sidebar on every screen. Content is specific to
// this app's actual complex features (not generic filler), and lives in this same file so it
// can't drift out of date the way a separate docs site would. ──
const HELP_TOPICS=[
  {title:'Getting started',body:[
    'Everything in this app is scoped to a salon (outlet) — start by adding your salon in Master Sheet, then add employees in Master Salary.',
    'Once employees exist, Attendance and Salary Working compute automatically from there — nothing extra to set up.',
    'Recurring Expenses (Rent, Electricity, Royalty, etc.) feed into P&L (Monthly) automatically once entered — set them up once, they carry forward every month.'
  ]},
  {title:'GST & Reverse Charge on Recurring Expenses',body:[
    '<b>GST Applicable</b> (the payee charges it) → only the Taxable Amount counts as a real cost on the P&L — the GST portion isn\'t recoverable for this business, so it still gets added on top via Invoice Value, not treated as input credit.',
    '<b>GST Not Applicable</b> (the payee isn\'t registered) → 18% is added automatically under Reverse Charge, since that becomes a real, unrecoverable cost too.',
    'Either way, the full Invoice Value — never just the Taxable Value — is what actually lands on P&L (Monthly). This applies to every expense type, not just Rent.'
  ]},
  {title:'How P&L (Monthly) numbers are built',body:[
    '<b>Revenue</b> (Cash/Card/UPI Sale) = the day\'s collections from Collection Reco\'s Imported Data Preview, divided by 1.05 to back out GST. Click the 🔗 next to any Revenue line to see the exact source rows.',
    '<b>Employee Cost</b> = Master Salary (role-wise) + Salary Working (Gross Salary + Tea) + Incentive Working + PF/ESIC employer contribution.',
    '<b>Operating Expenses</b> (Rent, Electricity, Royalty, etc.) = Recurring Expenses (Active commitments) + whatever\'s entered directly in Daily Sales & Exp for that month. Click the 📎 next to any Operating Expenses line to see exactly which recurring items and daily entries make it up.'
  ]},
  {title:'Bank Statement auto-classification',body:[
    'Nature and Date as per Cradlee are filled in automatically based on patterns in the Description — UPI/Card settlements, Salary, TDS, GST, and several vendor-specific patterns.',
    'Open "ℹ️ How classification works" directly on the Bank Statement screen for the exact, current list of rules — it always reflects what\'s actually running, not a simplified summary.',
    'Anything auto-filled can be overridden by hand, and manual edits are never overwritten — except by "🪄 Re-classify," which is explicitly for correcting many rows at once.'
  ]},
  {title:'Sharing & exporting reports',body:[
    'The 📤 Share button (wherever it appears) offers PDF, Word, and Excel — all real files, not print-outs, so all three can go straight to WhatsApp, Email, or your device\'s own share sheet.',
    'Excel exports are fully color-coded and styled — dark headers, zebra striping, bold totals, real number formats — not just raw data in a grid.',
    'No website can force-attach a file into a specific WhatsApp chat or email draft automatically — that\'s a browser/OS restriction. Entering a recipient gets that exact chat or draft open with the file downloaded and ready; you attach it there, one tap.'
  ]},
  {title:'Every outlet is independent',body:[
    'Salons don\'t share data with each other — employees, invoices, recurring expenses, bank statements, everything is scoped per outlet.',
    'Switching outlets never mixes or overwrites another outlet\'s data.'
  ]},
];
function HelpPanel({onClose}){
  const [openIdx,setOpenIdx]=useState(0);
  // Renders a help paragraph that may contain a leading <b>...</b> span as real React elements
  // instead of dangerouslySetInnerHTML — same bold-text result, without ever parsing HTML out of
  // a string. Every HELP_TOPICS string is hardcoded developer copy (never user input), so this
  // was never exploitable in practice, but there's no reason to keep an HTML-injection-shaped
  // pattern around when a five-line parser removes it for free.
  const renderHelpParagraph=(text)=>{
    const parts=[];
    const re=/<b>(.*?)<\/b>/g;
    let lastIndex=0,m,key=0;
    while((m=re.exec(text))){
      if(m.index>lastIndex)parts.push(text.slice(lastIndex,m.index));
      parts.push(React.createElement('b',{key:key++},m[1]));
      lastIndex=re.lastIndex;
    }
    if(lastIndex<text.length)parts.push(text.slice(lastIndex));
    return parts;
  };
  return React.createElement(React.Fragment,null,
    React.createElement('div',{className:'help-overlay',onClick:onClose}),
    React.createElement('div',{className:'help-drawer'},
      React.createElement('div',{className:'help-drawer-head'},
        React.createElement('div',null,
          React.createElement('div',{style:{fontFamily:'var(--font2)',fontSize:17,color:'var(--text)'}},'Help & Guide'),
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},'How the trickier parts of SalonOS actually work')
        ),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:onClose},'✕ Close')
      ),
      React.createElement('div',{className:'help-drawer-body'},
        typeof StaffGuidesList==='function'&&React.createElement(StaffGuidesList,null),
        HELP_TOPICS.map((t,i)=>React.createElement('div',{key:i,className:'help-topic'},
          React.createElement('div',{className:'help-topic-title',onClick:()=>setOpenIdx(openIdx===i?-1:i)},
            t.title,
            React.createElement('span',{style:{color:'var(--accent)',fontSize:11}},openIdx===i?'▾':'▸')
          ),
          openIdx===i&&React.createElement('div',{className:'help-topic-body slide-down'},
            t.body.map((p,pi)=>React.createElement('p',{key:pi},renderHelpParagraph(p)))
          )
        ))
      )
    )
  );
}

function ToastContainer({toasts,remove}){
  if(!toasts.length)return null;
  const icons={success:'✓',error:'✕',warning:'⚠',info:'ℹ'};
  return React.createElement('div',{className:'toast-container'},
    toasts.map(t=>React.createElement('div',{key:t.id,className:'toast '+t.type+(t.leaving?' toast-leaving':''),style:t.leaving?{animation:'toastOut 0.2s ease-in forwards'}:undefined},
      React.createElement('span',{className:'toast-icon'},icons[t.type]||'ℹ'),
      React.createElement('span',{className:'toast-msg'},t.msg),
      // Undo — only present when the action that fired this toast passed one (see addToast's
      // 4th argument). Clicking it runs the restore callback then dismisses the toast right
      // away, rather than waiting for its normal auto-dismiss timer.
      t.onUndo&&React.createElement('button',{className:'btn btn-ghost btn-sm',style:{padding:'3px 10px',fontSize:11,flexShrink:0},onClick:()=>{t.onUndo();remove(t.id);}},'Undo'),
      React.createElement('button',{'aria-label':'Close',className:'toast-close',onClick:()=>remove(t.id)},'✕')
    ))
  );
}

// ── Global notification ref ──────────────────────────────────────────
let _addToast=null;
function useToast(){
  // 4th arg (onUndo) is optional — only the base `toast()` function threads it through, since
  // that's the one call sites use for "X was deleted" style messages. success/error/warn/info
  // stay simple messages, no undo affordance.
  const add=(msg,type='success',dur=3000,onUndo)=>{if(_addToast)_addToast(msg,type,dur,onUndo);};
  return{toast:add,success:(m)=>add(m,'success'),error:(m)=>add(m,'error'),warn:(m)=>add(m,'warning'),info:(m)=>add(m,'info')};
}

// Every localStorage.setItem in this app used to be wrapped in its own silent try/catch —
// reasonable for reads (a corrupt/missing value shouldn't crash the app), but for writes it
// meant a full/blocked storage quota failed with literally no signal: the user keeps typing,
// thinks it's saved, and it never was. This wrapper keeps the same "never throw" guarantee but
// surfaces the failure once per session via the app's existing toast system, instead of eating
// it. Existing call sites (`try{localStorage.setItem(...)}catch(e){}`) still work unmodified;
// new/updated call sites should prefer safeLocalSet(key,value) so failures aren't silent.
let _storageWriteErrorShown=false;
let _lastSavedAt=null;
// ── In-memory read cache for localStorage — a lot of report/comparison code (the Incentive
// Comparative Sheet especially, which loops months × employees) ends up calling the same
// loadXxx(salonId) helper, and therefore re-reading and re-JSON.parsing the exact same
// localStorage key, dozens of times within a single render. safeLocalSet below is the one and
// only write path this whole app uses (every save funnels through it), so keeping this cache in
// sync there — and nowhere else — is enough to guarantee no caller ever sees a stale value; every
// write immediately updates the cache, and every read after that sees the fresh one. Reads that
// scan every key in localStorage dynamically (storage-usage estimates, the full backup dump) call
// localStorage.getItem directly instead, since caching a one-off full scan of arbitrary keys
// would only waste memory, not save any repeat work. ──
const _lsReadCache={};
function cachedLocalGet(key){
  if(Object.prototype.hasOwnProperty.call(_lsReadCache,key))return _lsReadCache[key];
  let v=null;
  try{v=localStorage.getItem(key);}catch(e){}
  _lsReadCache[key]=v;
  return v;
}
// Deletions bypass safeLocalSet (there's no "safeLocalRemove" — removal never fails the way a
// write can hit a quota), so this is the second and only other place the read cache needs to
// stay in sync: every localStorage.removeItem in the app goes through here instead of calling
// the browser API directly, so a deleted key can never be served stale out of the cache.
function cachedLocalRemove(key){
  try{localStorage.removeItem(key);}catch(e){}
  _lsReadCache[key]=null;
}
// Sticky (frozen) columns/cells need a fully OPAQUE background, or whatever scrolls underneath
// them shows through and visually collides with the frozen text (e.g. a row name overlapping a
// scrolled-past button, or a date cell overlapping wrapped text behind it). Highlight/selection
// tints across the app are deliberately translucent rgba() so they layer softly over a plain row
// — fine for a normal cell, but see-through is exactly the wrong behaviour for a frozen one. This
// stacks that same translucent tint over a solid base colour within one `background` value (CSS
// multi-background), which paints as one flat opaque colour no matter what scrolls behind it.
function opaqueStickyBg(rgba,base){
  base=base||'var(--bg2)';
  return(!rgba||rgba==='transparent')?base:'linear-gradient('+rgba+','+rgba+'), '+base;
}
function safeLocalSet(key,value){
  try{
    // Many screens save their whole state straight back on mount (useEffect on [state]), even when
    // nothing was edited. Pushing those unchanged copies to the cloud overwrote other users' newer
    // edits (e.g. employees another ID added) with this browser's older copy — only push real changes.
    const unchanged=cachedLocalGet(key)===value;
    localStorage.setItem(key,value);
    _lsReadCache[key]=value; // keep the read cache in sync — safeLocalSet is the only write path
    _lastSavedAt=Date.now();
    try{window.dispatchEvent(new Event('salonos-saved'));}catch(e3){}
    if(!unchanged)queueCloudPush(key,value); // no-op unless cloud sync is configured — see CLOUD_SYNC_ENABLED below
    return true;
  }
  catch(e){
    // Throttled, not a one-time-ever flag — a boolean that stayed true forever meant every write
    // failure after the very first one in a session was completely silent, so someone who missed
    // or dismissed that first toast would have every later edit across every screen fail to save
    // with zero indication anything was wrong. A few seconds' throttle still avoids spamming a
    // toast per keystroke while a save keeps failing, without going silent forever.
    if(!_storageWriteErrorShown||Date.now()-_storageWriteErrorShown>15000){
      _storageWriteErrorShown=Date.now();
      try{if(_addToast)_addToast("Couldn't save — browser storage is full or unavailable. Go to Master Settings → Backup & Restore and export a backup, then free up space.",'error',10000);}catch(e2){}
    }
    return false;
  }
}
// Keeps this tab's read cache from serving stale data after ANOTHER tab/window of this same app
// writes a key — without this, cachedLocalGet() here could keep returning what was true before
// that other tab's save, and a screen that re-reads that key (e.g. on remount) would silently
// undo the other tab's change the next time it wrote its own (unrelated) state back out.
// Same-tab writes don't fire this event by design (the browser only dispatches 'storage' to
// OTHER tabs), so safeLocalSet's own cache update above still handles same-tab consistency.
try{
  window.addEventListener('storage',(e)=>{
    if(e.key==null)return; // localStorage.clear() — nothing safe to reconcile key-by-key
    _lsReadCache[e.key]=e.newValue;
  });
}catch(e){}

// ============================================================================
// ── CLOUD SYNC (Supabase) — Phase 2 of going live ──────────────────────────
// Fill SUPABASE_URL and SUPABASE_ANON_KEY in to move SalonOS from single-
// browser local storage to a real shared Postgres database with proper
// server-side login. Leave both blank and the app behaves exactly as it
// always has — local-only, single browser, the built-in account list. Run
// supabase_schema.sql (same folder as this file) once in your Supabase
// project's SQL Editor before filling these in.
//
// The anon key below is meant to be public / embedded in client-side code —
// by itself it can't read or write anything; Row Level Security policies
// (defined in that SQL file) are what actually grant it access, scoped to
// signed-in users only. That's the standard, safe way to ship a Supabase key.
//
// How this works: every safeLocalSet() call (the app's one and only write
// path — see above) also queues a debounced push of that key to the
// kv_store table. On login, cloudPullAndHydrate() pulls every key back down
// from the database into this browser's localStorage before the app renders,
// so whichever device/browser you log in from sees the same shared data.
// This is "sync on login + push on save," not millisecond-live co-editing —
// two people editing the exact same record at the exact same moment still
// resolves last-write-wins, same as this app has always behaved locally,
// just shared across devices now instead of trapped in one browser.
// ============================================================================
// Years offered in every year picker: 2023 up to next year (a fixed list used to stop at 2026).
function appYears(){const out=[];for(let y=2023;y<=new Date().getFullYear()+1;y++)out.push(y);return out;}
// Bumped with every release, together with version.json next to this file — the app compares the
// two to offer "A new version is available — Update now" instead of people running stale code.
const APP_VERSION='2026.09.30.22';
const SUPABASE_URL='https://cuvcxxjbcmctsajhctju.supabase.co';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1dmN4eGpiY21jdHNhamhjdGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1NTQ5NTYsImV4cCI6MjEwMjEzMDk1Nn0.lyBbyZcX9vP8XoJ0ADoZ8K3JTwSqQeIvMEY66lqXMow';
const CLOUD_SYNC_ENABLED=!!(SUPABASE_URL&&SUPABASE_ANON_KEY);
// Pinned to an exact, tested version — "@2" silently followed every new release, so a library
// change (e.g. 2.107's new session handling) could alter login behaviour with no update from us.
// Change only together with a test of login, two-step login and live sync.
const CDN_SUPABASE_URL='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.min.js';
// Records a failed sign-in step under Master Settings → App errors. Goes straight to the REST API
// with the token just issued, so it works even when the failure is the library not attaching
// that login to its own requests.
function logLoginIssue(session,email,message){
  try{
    if(!session||!session.access_token||!session.user)return;
    fetch(SUPABASE_URL+'/rest/v1/client_errors',{method:'POST',headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({user_id:session.user.id,email:email||null,page:'login v'+APP_VERSION,message:('Login: '+message).slice(0,500),ua:navigator.userAgent.slice(0,300)})}).catch(()=>{});
  }catch(e){}
}
// SalonOS open in several tabs/windows of one browser shares one saved login; a stale tab can
// disturb a new sign-in in another. Tabs announce themselves so the newest can warn once.
const _tabChannel=(()=>{try{return typeof BroadcastChannel==='function'?new BroadcastChannel('salonos-tabs'):null;}catch(e){return null;}})();
let _otherTabSeen=false;
if(_tabChannel){
  _tabChannel.onmessage=(e)=>{
    if(!e||!e.data)return;
    if(e.data==='hello'){try{_tabChannel.postMessage('here');}catch(x){}}
    if(e.data==='here'||e.data==='hello')_otherTabSeen=true;
  };
  try{_tabChannel.postMessage('hello');}catch(e){}
}
function salonosOpenElsewhere(){return _otherTabSeen;}
let _supabaseClient=null;
async function getSupabaseClient(){
  if(!CLOUD_SYNC_ENABLED)return null;
  if(_supabaseClient)return _supabaseClient;
  await loadScript(CDN_SUPABASE_URL);
  // Each tab keeps its own login (sessionStorage, under a per-tab key). SalonOS already signs in
  // per tab (salonos_user lives in sessionStorage), and a login shared through localStorage let
  // any other SalonOS tab/window of the browser wipe it: a tab still holding an old, revoked
  // login fails to refresh it, removes the shared session and broadcasts "signed out" on a
  // channel named after the storage key — which signed new logins out right after sign-in
  // (29 Sep 2026). A per-tab key also gives each tab its own broadcast channel.
  let authKey=null;
  try{
    authKey=sessionStorage.getItem('salonos_auth_key');
    if(!authKey){authKey='salonos-auth-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);sessionStorage.setItem('salonos_auth_key',authKey);}
  }catch(e){authKey=null;}
  _supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,authKey?{auth:{storage:window.sessionStorage,storageKey:authKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}:undefined);
  return _supabaseClient;
}
// Guards against pushing stale/incomplete local data back up over the real
// server copy before the initial pull has even finished — flips true once
// cloudPullAndHydrate() completes (or immediately, in local-only mode).
let _cloudSyncReady=!CLOUD_SYNC_ENABLED;
// ── Live cloud sync ────────────────────────────────────────────────────────────────────────────
// The cloud (kv_store) is the source of truth; localStorage is only this browser's working cache.
//  • Saves go up within ~0.6s, and never blindly: each push re-reads the server copy and, if another
//    ID changed it since this browser last synced, MERGES the two (record by record for id-keyed
//    lists like employees, field by field for plain objects) instead of overwriting their work.
//    The write itself is conditional on the server copy not having changed in between (optimistic
//    concurrency on updated_at), and re-merges on conflict.
//  • Every 15s (and whenever the window regains focus) it checks which keys changed on the server
//    and pulls just those, so other IDs' edits appear without logging out and back in.
//  • The topbar shows the real cloud state — Saving… / Saved to cloud / NOT saved — rather than
//    only "saved on this device".
const _cloudPushTimers={};
const _cloudPushFailedOnce={};
const _cloudBase={};      // key -> the value this browser last saw on the server (merge base)
const _cloudUpdatedAt={}; // key -> server updated_at for that value
const _cloudDirty=new Set(); // keys edited here and not yet confirmed saved in the cloud
let _cloudPushing=0;
let _cloudStatus={state:'saved',lastSyncedAt:null,error:null};
function setCloudStatus(patch){
  _cloudStatus={..._cloudStatus,...patch};
  try{window.dispatchEvent(new Event('salonos-cloud-status'));}catch(e){}
}
function refreshCloudStatus(){
  if(_cloudDirty.size===0&&_cloudPushing===0)setCloudStatus({state:'saved',lastSyncedAt:Date.now(),error:null});
  else if(_cloudStatus.state!=='error')setCloudStatus({state:'saving'});
}
// Keys saved on this device that haven't reached kv_store yet (no session, network error). Kept in
// localStorage so they survive a reload/re-login and get pushed up (merged) BEFORE the next pull.
// (_v2: the first version of this list could also capture stale screen-mount writes made before the
// initial pull finished — those must never be pushed, so any list saved under the old name is ignored.)
const CLOUD_PENDING_KEY='salonos_cloud_pending_v2';
function loadCloudPending(){try{return JSON.parse(localStorage.getItem(CLOUD_PENDING_KEY))||[];}catch(e){return[];}}
function markCloudPending(key,pending){
  try{
    const s=new Set(loadCloudPending());
    if(pending)s.add(key);else s.delete(key);
    localStorage.setItem(CLOUD_PENDING_KEY,JSON.stringify(Array.from(s)));
  }catch(e){}
}
// Fired when a push finds no valid Supabase session — the App shell listens and sends the user
// back to the login screen, since everything else (user list, other IDs' data) is empty too.
function notifyCloudSessionLost(){try{window.dispatchEvent(new Event('salonos-session-lost'));}catch(e){}}
// Fired after values from the cloud replace what's in this browser, so open screens can re-read.
function notifyCloudDataChanged(keys){
  try{window.dispatchEvent(new CustomEvent('salonos-cloud-data',{detail:{keys}}));}catch(e){}
}
function applyCloudValue(key,value){
  try{localStorage.setItem(key,value);}catch(e){}
  _lsReadCache[key]=value;
}

// ── Three-way merge: base = last value this browser synced, local = this browser's edit,
// server = what's in the cloud now. Changes made on either side since base are both kept. ──
function _jsonEq(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function _isPlainObj(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
function _idListOk(arr){
  if(!Array.isArray(arr))return false;
  const seen=new Set();
  for(const it of arr){
    if(!_isPlainObj(it)||it.id==null||it.id==='')return false;
    const k=String(it.id);
    if(seen.has(k))return false;
    seen.add(k);
  }
  return true;
}
// Two IDs adding a record at the same moment can both pick the same next sequential id (E004,
// A012, 7…). Keep both records: the local one gets the next free id.
function _freshId(id,taken){
  if(typeof id==='number'){let n=Math.max(0,...Array.from(taken).map(Number).filter(x=>!isNaN(x)))+1;return n;}
  const m=/^(.*?)(\d+)$/.exec(String(id));
  if(m){
    const prefix=m[1],width=m[2].length;
    let n=0;
    taken.forEach(t=>{const mm=/^(.*?)(\d+)$/.exec(String(t));if(mm&&mm[1]===prefix)n=Math.max(n,Number(mm[2]));});
    return prefix+String(n+1).padStart(width,'0');
  }
  let i=2;while(taken.has(String(id)+'-'+i))i++;
  return String(id)+'-'+i;
}
function _mergeById(b,l,s){
  const bMap=new Map((_idListOk(b)?b:[]).map(it=>[String(it.id),it]));
  const sMap=new Map(s.map(it=>[String(it.id),it]));
  const lIds=new Set(l.map(it=>String(it.id)));
  const out=[],collided=[];
  for(const li of l){
    const id=String(li.id),bi=bMap.get(id),si=sMap.get(id);
    if(si){
      if(!bi&&!_jsonEq(li,si)){out.push(si);collided.push(li);} // both sides added a different record under the same id
      else out.push(_mergeAny(bi,li,si));
    }else if(bi){
      if(!_jsonEq(li,bi))out.push(li); // deleted on the server but edited here — keep the edit
    }else out.push(li); // added here
  }
  for(const si of s){
    const id=String(si.id);
    if(lIds.has(id))continue;
    const bi=bMap.get(id);
    if(bi){if(!_jsonEq(si,bi))out.push(si);} // deleted here — unless edited on the server since
    else out.push(si); // added by another ID
  }
  const taken=new Set(out.map(it=>String(it.id)));
  for(const li of collided){
    const nid=_freshId(li.id,taken);
    taken.add(String(nid));
    out.push({...li,id:nid});
  }
  return out;
}
function _mergePrimitiveList(b,l,s){
  const bs=new Set((Array.isArray(b)?b:[]).map(x=>JSON.stringify(x)));
  const ss=new Set(s.map(x=>JSON.stringify(x)));
  const ls=new Set(l.map(x=>JSON.stringify(x)));
  const out=l.filter(x=>{const k=JSON.stringify(x);return ss.has(k)||!bs.has(k);}); // drop what the server deleted
  s.forEach(x=>{const k=JSON.stringify(x);if(!ls.has(k)&&!bs.has(k))out.push(x);}); // add what the server added
  return out;
}
function _mergeAny(b,l,s){
  if(_jsonEq(l,s))return l;
  if(b!==undefined&&_jsonEq(l,b))return s; // only the server changed
  if(b!==undefined&&_jsonEq(s,b))return l; // only this browser changed
  if(Array.isArray(l)&&Array.isArray(s)){
    if(_idListOk(l)&&_idListOk(s))return _mergeById(b,l,s);
    if(l.concat(s).every(x=>x===null||typeof x!=='object'))return _mergePrimitiveList(b,l,s);
    return l;
  }
  if(_isPlainObj(l)&&_isPlainObj(s)){
    const bo=_isPlainObj(b)?b:{};
    const out={};
    new Set([...Object.keys(l),...Object.keys(s)]).forEach(k=>{
      const inL=Object.prototype.hasOwnProperty.call(l,k),inS=Object.prototype.hasOwnProperty.call(s,k),inB=Object.prototype.hasOwnProperty.call(bo,k);
      if(inL&&inS)out[k]=_mergeAny(inB?bo[k]:undefined,l[k],s[k]);
      else if(inL){if(!inB||!_jsonEq(l[k],bo[k]))out[k]=l[k];} // server deleted it: drop unless edited here
      else{if(!inB||!_jsonEq(s[k],bo[k]))out[k]=s[k];}      // deleted here: drop unless edited on the server
    });
    return out;
  }
  return l; // plain values that both sides changed: this (latest) edit wins
}
function mergeCloudValues(baseStr,localStr,serverStr){
  let b,l,s;
  try{l=JSON.parse(localStr);s=JSON.parse(serverStr);}catch(e){return localStr;} // not JSON — latest edit wins
  try{b=baseStr==null?undefined:JSON.parse(baseStr);}catch(e){b=undefined;}
  return JSON.stringify(_mergeAny(b,l,s));
}

async function _cloudSession(){
  const supa=await getSupabaseClient();
  const{data:{session}}=await supa.auth.getSession();
  return{supa,session};
}
// The database only lets each login read/change the outlets User Management gives it; a refused
// write is reported as this error so the caller can undo it locally instead of retrying forever.
function cloudPermissionError(){const e=new Error('View-only access — change not saved');e.permissionDenied=true;return e;}
// Moves any freshly attached files (data: URLs) inside this key's value into private storage,
// replacing them with "sbfile:" references, before the value goes to the cloud. Files go under the
// key's outlet folder, so storage applies the same per-outlet access as the data itself.
const _uploadedDataUrls=new Map(); // folder|data: URL -> sbfile ref, so a re-save of the same file never re-uploads
async function externalizeAttachments(key){
  const raw=localStorage.getItem(key);
  if(!raw||raw.indexOf('"dataUrl":"data:')<0)return;
  const m=/_outlet_(\d+)$/.exec(key);
  const folder=m?'outlet_'+m[1]:'global';
  const supa=await getSupabaseClient();
  const val=JSON.parse(raw);
  const walk=async(node)=>{
    if(Array.isArray(node)){for(const x of node)await walk(x);return;}
    if(!node||typeof node!=='object')return;
    if(typeof node.dataUrl==='string'&&node.dataUrl.indexOf('data:')===0){
      // Cached per folder: the same file attached in two outlets must be stored in both, or
      // someone with access to only one of them couldn't open it.
      const cacheKey=folder+'|'+node.dataUrl;
      let ref=_uploadedDataUrls.get(cacheKey);
      if(!ref){
        const blob=await(await fetch(node.dataUrl)).blob();
        const safe=String(node.name||'file').replace(/[^\w.\-]+/g,'_').slice(-80);
        const path=folder+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'-'+safe;
        const{error}=await supa.storage.from(FILES_BUCKET).upload(path,blob,{contentType:node.type||blob.type||'application/octet-stream',upsert:false});
        if(error){if(/row-level security|unauthori[sz]ed|403/i.test((error.message||'')+' '+(error.statusCode||'')))throw cloudPermissionError();throw error;}
        ref=SBFILE_PREFIX+path;
        _uploadedDataUrls.set(cacheKey,ref);
      }
      node.dataUrl=ref;
    }
    for(const k of Object.keys(node))if(k!=='dataUrl')await walk(node[k]);
  };
  await walk(val);
  if(localStorage.getItem(key)===raw)applyCloudValue(key,JSON.stringify(val)); // unless edited again meanwhile
}
// Pushes this browser's current value for one key, merged with whatever is in the cloud now.
async function cloudPushKey(key){
  const{supa,session}=await _cloudSession();
  if(!session){notifyCloudSessionLost();throw new Error('Not signed in');}
  for(let attempt=0;attempt<6;attempt++){
    await externalizeAttachments(key);
    const local=localStorage.getItem(key);
    if(local==null)return; // removed locally — removals aren't synced (same as before)
    if(local.indexOf('"dataUrl":"data:')>=0)continue; // edited during the upload — externalize again
    const{data:row,error:readErr}=await supa.from('kv_store').select('value,updated_at').eq('key',key).maybeSingle();
    if(readErr)throw readErr;
    if(row&&row.value===local){_cloudBase[key]=local;_cloudUpdatedAt[key]=row.updated_at;return;} // already saved — nothing to write
    let merged=local;
    if(row&&row.value!=null&&row.value!==local&&row.value!==_cloudBase[key])
      merged=mergeCloudValues(_cloudBase[key],local,row.value);
    const now=new Date().toISOString();
    let res;
    if(row){
      res=await supa.from('kv_store').update({value:merged,updated_at:now,updated_by:session.user.id}).eq('key',key).eq('updated_at',row.updated_at).select('key');
    }else{
      res=await supa.from('kv_store').insert({key,value:merged,updated_at:now,updated_by:session.user.id}).select('key');
      if(res.error&&(res.error.code==='42501'||/row-level security/i.test(res.error.message||'')))throw cloudPermissionError();
      // Duplicate: another ID created it first — merge with theirs. (If this login couldn't even
      // see the existing row, it has no access to it at all.)
      if(res.error&&(res.error.code==='23505'||/duplicate/i.test(res.error.message||''))){
        if(attempt>0){const{data:vis}=await supa.from('kv_store').select('key').eq('key',key).maybeSingle();if(!vis)throw cloudPermissionError();}
        continue;
      }
    }
    if(res.error){if(res.error.code==='42501')throw cloudPermissionError();throw res.error;}
    if(!res.data||!res.data.length){
      // Zero rows updated: either someone saved in between (merge again) or this login may only
      // view this key — the database silently skips rows it isn't allowed to change.
      const{data:chk}=await supa.from('kv_store').select('updated_at').eq('key',key).maybeSingle();
      if(!chk||chk.updated_at===row.updated_at)throw cloudPermissionError();
      continue;
    }
    // Open screens still hold `local` in memory and their next edit builds on it, so `local` stays
    // the merge base. If the merge pulled in other IDs' changes, the cloud now differs from this
    // browser: leave _cloudUpdatedAt stale so the next update check brings the merged copy down
    // (applied only at the moment the screen refreshes — see cloudApplyUpdates).
    _cloudBase[key]=local;
    _cloudUpdatedAt[key]=merged===local?now:null;
    if(merged!==local)cloudCheckForUpdates();
    return;
  }
  throw new Error('Too many simultaneous edits — will retry');
}
function queueCloudPush(key,value,delay){
  // Nothing written before the initial pull finishes is a real edit — it's a screen saving back the
  // stale cached copy it just loaded — so it must never be pushed or marked pending.
  if(!CLOUD_SYNC_ENABLED||key===CLOUD_PENDING_KEY||!_cloudSyncReady)return;
  markCloudPending(key,true);
  _cloudDirty.add(key);
  refreshCloudStatus();
  clearTimeout(_cloudPushTimers[key]);
  _cloudPushTimers[key]=setTimeout(async()=>{
    delete _cloudPushTimers[key];
    _cloudPushing++;
    try{
      await cloudPushKey(key);
      _cloudPushing--;
      _cloudPushFailedOnce[key]=false;
      if(!_cloudPushTimers[key]){_cloudDirty.delete(key);markCloudPending(key,false);} // no newer edit queued meanwhile
      if(_cloudStatus.state==='error')setCloudStatus({state:'saving',error:null});
      refreshCloudStatus();
    }catch(e){
      _cloudPushing--;
      if(e&&e.permissionDenied){
        // Not a failure to retry: this login may only view this sheet/outlet. Drop the edit and
        // bring the cloud copy back (the next update check re-downloads it and refreshes the screen).
        _cloudDirty.delete(key);markCloudPending(key,false);
        _cloudUpdatedAt[key]=null;
        if(!_cloudPushFailedOnce[key]){
          _cloudPushFailedOnce[key]=true;
          try{if(_addToast)_addToast('You have view-only access here — that change was not saved. Ask your Super Admin for edit access if you need it.','warning',7000);}catch(e2){}
        }
        refreshCloudStatus();
        notifyCloudDataChanged([key]);
        return;
      }
      setCloudStatus({state:'error',error:(e&&e.message)||'Network error'});
      if(!_cloudPushFailedOnce[key]){ // one toast per key per session — a flaky connection shouldn't spam every keystroke
        _cloudPushFailedOnce[key]=true;
        try{if(_addToast)_addToast('NOT saved to the cloud yet — kept on this device and retrying automatically. Don\'t close this tab until the top bar says "Saved to cloud".','error',8000);}catch(e2){}
      }
    }
  },delay==null?600:delay);
}
// Deleting an outlet used to clear only this browser — every key stayed in the cloud and came
// straight back on the next login. kv_store doesn't allow row deletes, so a deleted key is stored
// as NULL value, which every reader here treats as "doesn't exist" (and removes locally).
async function cloudDeleteOutletData(salonId){
  if(!CLOUD_SYNC_ENABLED||!_cloudSyncReady||salonId==null)return;
  try{
    const{supa,session}=await _cloudSession();
    if(!session){notifyCloudSessionLost();return;}
    const suffix='_outlet_'+salonId;
    const{data,error}=await supa.from('kv_store').select('key').like('key','salonos_%'+suffix).not('value','is',null);
    if(error)throw error;
    for(const{key}of(data||[])){
      if(!key.endsWith(suffix))continue; // LIKE treats "_" as a wildcard — only exact suffix matches
      clearTimeout(_cloudPushTimers[key]);delete _cloudPushTimers[key];
      _cloudDirty.delete(key);markCloudPending(key,false);
      const now=new Date().toISOString();
      const{error:e2}=await supa.from('kv_store').update({value:null,updated_at:now,updated_by:session.user.id}).eq('key',key);
      if(e2)throw e2;
      delete _cloudBase[key];_cloudUpdatedAt[key]=now;
    }
    refreshCloudStatus();
  }catch(e){
    try{if(_addToast)_addToast('Outlet removed here, but its data could not be deleted from the cloud: '+((e&&e.message)||'network error'),'error',8000);}catch(e2){}
  }
}
// This browser may still hold copies of outlets this login no longer has access to (from an
// earlier login, or before access rules were enforced). Remove them — the cloud copy is untouched.
function purgeOutletDataWithoutAccess(){
  try{
    const u=JSON.parse(sessionStorage.getItem('salonos_user')||'null');
    if(!u||u.role==='Super Admin')return; // Reviewers too see only the outlets they are given
    const oa=u.outletAccess&&Object.keys(u.outletAccess).length?u.outletAccess:null;
    const allowed=new Set(oa?Object.keys(oa).filter(id=>oa[id]&&oa[id]!=='No Access'):(u.outletIds||[]).map(String));
    const pending=new Set(loadCloudPending());
    const drop=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);const m=k&&k.indexOf('salonos_')===0&&/_outlet_(\d+)$/.exec(k);
      if(m&&!allowed.has(m[1])&&!pending.has(k))drop.push(k);
    }
    drop.forEach(k=>cachedLocalRemove(k));
  }catch(e){}
}
function migrateInlineAttachments(){
  try{
    // Done from a Super Admin's browser only — they can write every outlet, so nobody with
    // view-only access gets "not saved" notices for a background move they never asked for.
    const u=JSON.parse(sessionStorage.getItem('salonos_user')||'null');
    if(!u||u.role!=='Super Admin')return;
    const keys=[];
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.indexOf('salonos_')===0&&(localStorage.getItem(k)||'').indexOf('"dataUrl":"data:')>=0)keys.push(k);}
    keys.forEach((k,i)=>queueCloudPush(k,null,i*400));
  }catch(e){}
}
// Removes documents nothing points to any more (employee deleted, attachment replaced). A file is
// kept while current data OR any kept backup still references it, so restores keep working, and
// for 7 days after upload regardless. Runs at most once a day, from a Super Admin's browser.
async function cleanupUnusedFiles(){
  const supa=await getSupabaseClient();
  const refs=new Set();
  const add=s=>{(String(s||'').match(/sbfile:[^"\\]+/g)||[]).forEach(r=>refs.add(r.slice(SBFILE_PREFIX.length)));};
  const{data:kv,error:e1}=await supa.from('kv_store').select('value').not('value','is',null);
  if(e1)throw e1;
  kv.forEach(r=>add(r.value));
  const{data:bk,error:e2}=await supa.from('kv_backups').select('data');
  if(e2)throw e2;
  bk.forEach(b=>add(JSON.stringify(b.data)));
  const{data:folders,error:e3}=await supa.storage.from(FILES_BUCKET).list('',{limit:1000});
  if(e3)throw e3;
  const remove=[];
  for(const f of folders||[]){
    if(f.id)continue; // folders have no id; files at the root are left alone
    const{data:files,error:e4}=await supa.storage.from(FILES_BUCKET).list(f.name,{limit:1000});
    if(e4)throw e4;
    (files||[]).forEach(o=>{
      const path=f.name+'/'+o.name;
      if(!refs.has(path)&&Date.now()-new Date(o.created_at).getTime()>7*86400000)remove.push(path);
    });
  }
  if(remove.length){const{error}=await supa.storage.from(FILES_BUCKET).remove(remove);if(error)throw error;}
  return remove.length;
}
function maybeCleanupUnusedFiles(){
  try{
    const u=JSON.parse(sessionStorage.getItem('salonos_user')||'null');
    if(!u||u.role!=='Super Admin')return;
    const last=Number(localStorage.getItem('sos_file_cleanup_at')||0); // not a salonos_ key: stays on this device
    if(Date.now()-last<86400000)return;
    localStorage.setItem('sos_file_cleanup_at',String(Date.now()));
    cleanupUnusedFiles().catch(e=>reportClientError('File cleanup failed: '+((e&&e.message)||e)));
  }catch(e){}
}
// Records crashes and failed operations in the cloud (client_errors) so a Super Admin can see
// them under Master Settings → App errors. Throttled: 15 per page load, each message once.
const _reportedErrors=new Set();
function reportClientError(message,stack){
  try{
    if(!CLOUD_SYNC_ENABLED||_reportedErrors.size>=15)return;
    const msg=String(message||'Unknown error').slice(0,500);
    if(_reportedErrors.has(msg))return;
    _reportedErrors.add(msg);
    const u=JSON.parse(sessionStorage.getItem('salonos_user')||'null');
    if(!u)return;
    getSupabaseClient().then(supa=>supa.auth.getSession().then(({data:{session}})=>{
      if(!session)return;
      return supa.from('client_errors').insert({user_id:session.user.id,email:u.email||null,page:(location.hash||'')+' '+(document.title||''),
        message:msg,stack:String(stack||'').slice(0,2000),ua:navigator.userAgent.slice(0,300)});
    })).catch(()=>{});
  }catch(e){}
}
try{
  window.addEventListener('error',e=>{if(e&&e.message)reportClientError(e.message,e.error&&e.error.stack);});
  window.addEventListener('unhandledrejection',e=>{const r=e&&e.reason;reportClientError('Unhandled: '+((r&&r.message)||r),r&&r.stack);});
}catch(e){}
// Retries anything still unsaved (after a network blip) — called by the periodic sync loop.
function retryDirtyCloudKeys(){
  _cloudDirty.forEach(key=>{if(!_cloudPushTimers[key])queueCloudPush(key,null,0);});
}
// Two steps, on purpose. Open screens hold their own in-memory copy of the data, and their next
// save builds on that copy — so newer cloud data must only land in this browser at the exact
// moment those screens re-mount and re-read it (the App shell does both together, and waits
// while someone is typing or has a form open). cloudCheckForUpdates just looks (cheap: key +
// updated_at only) and announces; cloudApplyUpdates downloads and writes, then the caller remounts.
async function _cloudChangedKeys(supa){
  const{data:stamps,error}=await supa.from('kv_store').select('key,updated_at');
  if(error)throw error;
  // Keys with unsaved edits here are skipped — their push re-reads and merges the server copy.
  return(stamps||[]).filter(r=>_cloudUpdatedAt[r.key]!==r.updated_at&&!_cloudDirty.has(r.key)&&!_cloudPushTimers[r.key]).map(r=>r.key);
}
let _cloudCheckBusy=false;
async function cloudCheckForUpdates(){
  if(!CLOUD_SYNC_ENABLED||!_cloudSyncReady||_cloudCheckBusy)return;
  _cloudCheckBusy=true;
  try{
    const{supa,session}=await _cloudSession();
    if(!session){notifyCloudSessionLost();return;}
    const changed=await _cloudChangedKeys(supa);
    if(changed.length)notifyCloudDataChanged(changed);
  }catch(e){
    // A failed background check isn't data loss — the next tick retries. Saves report their own errors.
  }finally{_cloudCheckBusy=false;}
}
// Downloads everything that changed and writes it into this browser. Returns the keys written;
// the caller must re-mount the screens (and reload App-level state) right after, same tick.
async function cloudApplyUpdates(){
  if(!CLOUD_SYNC_ENABLED||!_cloudSyncReady)return[];
  const{supa,session}=await _cloudSession();
  if(!session){notifyCloudSessionLost();return[];}
  const changed=await _cloudChangedKeys(supa);
  const rows=[];
  for(let i=0;i<changed.length;i+=50){
    const{data,error}=await supa.from('kv_store').select('key,value,updated_at').in('key',changed.slice(i,i+50));
    if(error)throw error;
    rows.push(...(data||[]));
  }
  await sheetsFromTables(supa,rows);
  const applied=[];
  rows.forEach(row=>{ // synchronous from here on — no await between writing and the caller's remount
    if(_cloudDirty.has(row.key)||_cloudPushTimers[row.key])return;
    _cloudUpdatedAt[row.key]=row.updated_at;
    if(row.value==null){ // deleted in the cloud (e.g. another ID deleted an outlet)
      delete _cloudBase[row.key];
      if(localStorage.getItem(row.key)!=null){cachedLocalRemove(row.key);applied.push(row.key);}
      return;
    }
    _cloudBase[row.key]=row.value;
    if(localStorage.getItem(row.key)!==row.value){applyCloudValue(row.key,row.value);applied.push(row.key);}
  });
  return applied;
}
// ── Sheets that come from real database tables (#3) ─────────────────────────────────────────────
// Saves still go to kv_store; the database copies each sheet into its table in the same step
// (triggers, supabase/step6, 7 and 9). Loads rebuild each outlet's sheet from the table (pos =
// order, raw = each record exactly as saved). If that ever differs from the kv_store copy, the
// kv_store copy is used and the mismatch is logged under Master Settings → App errors.
// Rollback switches: set EMPLOYEES_FROM_TABLE / ATTENDANCE_FROM_TABLE to false.
const EMPLOYEES_FROM_TABLE=true;
const ATTENDANCE_FROM_TABLE=true;
const TABLE_BACKED_SHEETS=[
  {on:EMPLOYEES_FROM_TABLE,label:'Employees',table:'employees',re:/^salonos_master_employees_outlet_(\d+)$/,cols:'outlet_id,raw,pos',
    build:recs=>'['+recs.map(t=>t.raw).join(',')+']'},
  {on:ATTENDANCE_FROM_TABLE,label:'Attendance',table:'attendance',re:/^salonos_attendance_outlet_(\d+)$/,cols:'outlet_id,rec_key,raw,pos',
    build:recs=>'{'+recs.map(t=>JSON.stringify(t.rec_key)+':'+t.raw).join(',')+'}'},
];
async function sheetsFromTables(supa,rows){
  for(const sh of TABLE_BACKED_SHEETS){
    if(!sh.on)continue;
    const mine=rows.filter(r=>r.value!=null&&sh.re.test(r.key));
    if(!mine.length)continue;
    try{
      const ids=mine.map(r=>Number(sh.re.exec(r.key)[1]));
      const recs=[];
      for(let from=0;;from+=1000){ // the API returns at most 1000 rows per request
        const{data,error}=await supa.from(sh.table).select(sh.cols).in('outlet_id',ids).eq('deleted',false).order('outlet_id').order('pos').range(from,from+999);
        if(error)throw error;
        recs.push(...(data||[]));
        if(!data||data.length<1000)break;
      }
      const byOutlet={};
      recs.forEach(t=>{(byOutlet[t.outlet_id]=byOutlet[t.outlet_id]||[]).push(t);});
      for(const r of mine){
        const id=sh.re.exec(r.key)[1];
        const fromTable=sh.build(byOutlet[id]||[]);
        if(fromTable===r.value){r.value=fromTable;continue;}
        // A save landing between the two reads is not a problem — only log a real mismatch.
        const{data:now}=await supa.from('kv_store').select('updated_at').eq('key',r.key).maybeSingle();
        if(now&&now.updated_at===r.updated_at)reportClientError(sh.label+' table differs from the saved sheet for outlet '+id+' — used the saved sheet');
      }
    }catch(e){reportClientError('Could not read the '+sh.table+' table: '+((e&&e.message)||e));}
  }
}
let _cloudLoopStarted=false;
function startCloudSyncLoop(){
  if(!CLOUD_SYNC_ENABLED||_cloudLoopStarted)return;
  _cloudLoopStarted=true;
  // Instant path: Supabase Realtime pushes every kv_store change the moment it's saved. It only
  // delivers once kv_store is in the supabase_realtime publication (one SQL line in Supabase);
  // until then — or if the socket drops — the fast poll below keeps other IDs' edits appearing
  // within ~5s. Once Realtime has proven it's delivering, the poll backs off to a 30s safety net.
  let lastRealtimeAt=0,rtTimer=null;
  getSupabaseClient().then(supa=>{
    if(!supa)return;
    supa.channel('salonos-kv-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'kv_store'},payload=>{
        lastRealtimeAt=Date.now();
        const row=payload.new||{};
        if(row.key&&localStorage.getItem(row.key)===row.value)return; // our own save echoing back
        clearTimeout(rtTimer);
        rtTimer=setTimeout(cloudCheckForUpdates,250); // coalesce a burst of saves into one check
      })
      .subscribe();
  }).catch(()=>{});
  let lastPoll=0;
  setInterval(()=>{
    if(document.visibilityState!=='visible')return;
    const realtimeLive=Date.now()-lastRealtimeAt<10*60*1000;
    if(Date.now()-lastPoll<(realtimeLive?30000:5000))return;
    lastPoll=Date.now();
    retryDirtyCloudKeys();cloudCheckForUpdates();
  },1000);
  window.addEventListener('focus',()=>cloudCheckForUpdates());
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')cloudCheckForUpdates();});
  window.addEventListener('online',()=>{retryDirtyCloudKeys();cloudCheckForUpdates();});
  // Closing the tab mid-save would lose the edit for everyone else — ask first.
  window.addEventListener('beforeunload',(e)=>{if(_cloudDirty.size>0||_cloudPushing>0){e.preventDefault();e.returnValue='';}});
}
// Pulls every row from kv_store down into this browser's localStorage, bypassing safeLocalSet
// (a pull must never re-trigger a push — that key's data just came FROM the server). Call once,
// right after a successful login, before the app renders any real screen.
async function cloudPullAndHydrate(){
  if(!CLOUD_SYNC_ENABLED)return;
  try{
    const{supa,session}=await _cloudSession();
    if(!session)throw new Error('No cloud session');
    // Push (merged) anything saved on this device while it couldn't reach the cloud first, so the
    // pull below doesn't overwrite it with the older server copy.
    const pending=loadCloudPending();
    const stillPending=[];
    for(const key of pending){
      try{await cloudPushKey(key);}catch(e){stillPending.push(key);}
    }
    try{localStorage.setItem(CLOUD_PENDING_KEY,JSON.stringify(stillPending));}catch(e){}
    const{data,error}=await supa.from('kv_store').select('key,value,updated_at');
    if(error)throw error;
    await sheetsFromTables(supa,data||[]);
    (data||[]).forEach(row=>{
      if(stillPending.includes(row.key))return;
      if(row.value==null){ // deleted in the cloud — drop this browser's leftover copy too
        if(localStorage.getItem(row.key)!=null)cachedLocalRemove(row.key);
        _cloudUpdatedAt[row.key]=row.updated_at;
        return;
      }
      applyCloudValue(row.key,row.value);
      _cloudBase[row.key]=row.value;
      _cloudUpdatedAt[row.key]=row.updated_at;
    });
    stillPending.forEach(k=>_cloudDirty.add(k));
    purgeOutletDataWithoutAccess();
    _cloudSyncReady=true;
    refreshCloudStatus();
    // Files attached before documents moved to cloud storage are still inline in some sheets —
    // re-save those once so they get moved (runs quietly in the background, a few seconds in).
    setTimeout(migrateInlineAttachments,4000);
    setTimeout(maybeCleanupUnusedFiles,20000);
  }catch(e){
    try{if(_addToast)_addToast('Could not load your data from the cloud — showing what is cached on this device','error',7000);}catch(e2){}
    _cloudSyncReady=true; // still let the app proceed with whatever's cached locally rather than blocking forever
    setCloudStatus({state:'error',error:(e&&e.message)||'Could not reach the cloud'});
  }
  startCloudSyncLoop();
}
// Topbar hook: the real cloud save state.
function useCloudStatus(){
  const [st,setSt]=useState(_cloudStatus);
  useEffect(()=>{
    const on=()=>setSt(_cloudStatus);
    window.addEventListener('salonos-cloud-status',on);
    const tick=setInterval(()=>setSt({..._cloudStatus}),15000); // keeps "Saved 20s ago" fresh
    return()=>{window.removeEventListener('salonos-cloud-status',on);clearInterval(tick);};
  },[]);
  return st;
}
// ── Live save-activity indicator for the topbar — listens for the event safeLocalSet fires on
// every successful write (i.e. essentially every real edit anywhere in the app, since all
// persistence goes through it) and exposes both a brief "just saved" pulse and a friendly
// relative last-saved label, without needing every component to report in individually. ──
function relativeTimeFromNow(ts){
  if(!ts)return null;
  const s=Math.floor((Date.now()-ts)/1000);
  if(s<5)return'just now';
  if(s<60)return s+'s ago';
  const m=Math.floor(s/60);
  if(m<60)return m+' min ago';
  const h=Math.floor(m/60);
  if(h<24)return h+'h ago';
  return Math.floor(h/24)+'d ago';
}
function useSaveActivity(){
  const [lastSavedAt,setLastSavedAt]=useState(_lastSavedAt);
  const [pulsing,setPulsing]=useState(false);
  useEffect(()=>{
    let pulseTimer;
    const onSave=()=>{
      setLastSavedAt(_lastSavedAt);
      setPulsing(true);
      clearTimeout(pulseTimer);
      pulseTimer=setTimeout(()=>setPulsing(false),900);
    };
    window.addEventListener('salonos-saved',onSave);
    const tickTimer=setInterval(()=>setLastSavedAt(_lastSavedAt),15000); // refresh the relative label text
    return()=>{window.removeEventListener('salonos-saved',onSave);clearInterval(tickTimer);clearTimeout(pulseTimer);};
  },[]);
  return{lastSavedAt,pulsing};
}

// ── Shared file-attachment helpers — every "attach a scan/photo" feature in the app (Cash
// Register, Attendance Register, PAN/Aadhaar/Bank Proof) uses this same pair of functions so
// they all behave identically: read real bytes in, and hand real bytes back out on download.
// Record shape everywhere: {name, dataUrl, type, size}. A plain string means it was saved by an
// older build that only ever kept the filename — those are still shown as "attached" so nothing
// vanishes from anyone's records, but they genuinely have nothing to download.
const ATTACHMENT_MAX_BYTES=4*1024*1024; // 4MB — generous for a phone photo/scan, safe for localStorage
function readFileAsAttachment(file,onDone,onError){
  if(!file)return;
  if(file.size>ATTACHMENT_MAX_BYTES){onError&&onError('size');return;}
  const reader=new FileReader();
  reader.onload=()=>onDone({name:file.name,dataUrl:reader.result,type:file.type,size:file.size});
  reader.onerror=()=>onError&&onError('read');
  reader.readAsDataURL(file);
}
// ── Documents live in private cloud storage (bucket salonos-files, access-checked per outlet),
// not inside the data rows: a stored record's dataUrl is a reference "sbfile:<path>" instead of
// the file's bytes. The UI still treats any non-empty dataUrl as "has a file"; only opening one
// needs a short-lived signed link. New attachments are read in as normal data: URLs (so OCR etc.
// work instantly) and moved to storage when saved — see externalizeAttachments. ──
const FILES_BUCKET='salonos-files';
const SBFILE_PREFIX='sbfile:';
function isStoredFileRef(u){return typeof u==='string'&&u.indexOf(SBFILE_PREFIX)===0;}
async function signedFileUrl(ref,downloadName){
  const supa=await getSupabaseClient();
  const{data,error}=await supa.storage.from(FILES_BUCKET).createSignedUrl(ref.slice(SBFILE_PREFIX.length),120,downloadName?{download:downloadName}:undefined);
  if(error)throw error;
  return data.signedUrl;
}
async function resolveAttachmentDataUrl(u){
  if(!isStoredFileRef(u))return u;
  const blob=await(await fetch(await signedFileUrl(u))).blob();
  return await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(new Error('Could not read the file'));r.readAsDataURL(blob);});
}
function openStoredFile(ref,name){
  signedFileUrl(ref,name||'attachment').then(url=>{
    const a=document.createElement('a');a.href=url;a.rel='noopener';
    document.body.appendChild(a);a.click();document.body.removeChild(a);
  }).catch(e=>{try{if(_addToast)_addToast('Could not open the file: '+((e&&e.message)||'network error'),'error',6000);}catch(e2){}});
}
function downloadAttachment(rec,fallbackName){
  if(!rec)return false;
  if(typeof rec==='string'||!rec.dataUrl)return false;
  if(isStoredFileRef(rec.dataUrl)){openStoredFile(rec.dataUrl,rec.name||fallbackName);return true;}
  const a=document.createElement('a');
  a.href=rec.dataUrl;a.download=rec.name||fallbackName||'attachment';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  return true;
}

// ── Cash Register OCR — reads the Closing Balance figure straight off an attached photo/scan
// of the physical cash register, so it can be checked against this app's own computed Closing
// Cash Balance for the same day. Tesseract.js does the character recognition; pdf.js is only
// invoked when the attachment is a PDF, purely to rasterize page 1 into an image first, since
// Tesseract itself can't read PDF files. ──
function extractClosingBalanceFromText(text){
  if(!text)return null;
  const cleaned=String(text).replace(/,/g,'');
  const patterns=[
    /closing\s*cash\s*balance[^0-9\-]{0,20}(-?\d+(?:\.\d+)?)/i,
    /closing\s*cash[^0-9\-]{0,20}(-?\d+(?:\.\d+)?)/i,
    /closing\s*balance[^0-9\-]{0,20}(-?\d+(?:\.\d+)?)/i,
    /closing\s*bal[^0-9\-]{0,20}(-?\d+(?:\.\d+)?)/i
  ];
  for(const re of patterns){
    const m=cleaned.match(re);
    if(m)return Number(m[1]);
  }
  // No labelled "closing balance" text found — fall back to the last reasonably-sized number
  // in the document, since a physical register usually ends with the day's closing figure.
  const nums=cleaned.match(/-?\d{2,}(?:\.\d{1,2})?/g);
  if(nums&&nums.length)return Number(nums[nums.length-1]);
  return null;
}
async function renderPdfFirstPageToDataUrl(dataUrl){
  await loadScript(CDN_PDFJS_URL);
  if(!window.pdfjsLib)throw new Error('PDF engine unavailable — check your internet connection.');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc=CDN_PDFJS_WORKER_URL;
  const base64=dataUrl.split(',')[1]||'';
  const binary=atob(base64);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const pdf=await window.pdfjsLib.getDocument({data:bytes}).promise;
  const page=await pdf.getPage(1);
  const viewport=page.getViewport({scale:2.2}); // upscaled — OCR accuracy improves a lot on higher-res renders
  const canvas=document.createElement('canvas');
  canvas.width=viewport.width;canvas.height=viewport.height;
  const ctx=canvas.getContext('2d');
  await page.render({canvasContext:ctx,viewport}).promise;
  return canvas.toDataURL('image/png');
}
async function ocrReadClosingBalance(attachmentRec){
  if(!attachmentRec||typeof attachmentRec==='string'||!attachmentRec.dataUrl)throw new Error("This attachment has no readable file (it was saved by an older version) — remove it and re-attach.");
  const isPdf=(attachmentRec.type||'').includes('pdf')||/\.pdf$/i.test(attachmentRec.name||'');
  const srcDataUrl=await resolveAttachmentDataUrl(attachmentRec.dataUrl); // fetches it from cloud storage if needed
  const imgDataUrl=isPdf?await renderPdfFirstPageToDataUrl(srcDataUrl):srcDataUrl;
  await loadScript(CDN_TESSERACT_URL);
  if(!window.Tesseract)throw new Error('OCR engine unavailable — check your internet connection.');
  const result=await window.Tesseract.recognize(imgDataUrl,'eng');
  const text=(result&&result.data&&result.data.text)||'';
  return{text,value:extractClosingBalanceFromText(text)};
}

// ── localStorage usage estimate — browsers give no direct quota API for this, so we sum the
// byte length of every key this origin owns. Typical browser ceiling is 5–10MB per origin;
// we assume 5MB (the conservative end) so the meter turns amber/red before anyone actually
// hits a save failure, rather than after. ──
const STORAGE_ASSUMED_LIMIT_BYTES=5*1024*1024;
function estimateStorageUsage(){
  try{
    let bytes=0;
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      bytes+=(k?k.length:0)+(localStorage.getItem(k)?.length||0);
    }
    return{bytes,pct:Math.min(100,Math.round(bytes/STORAGE_ASSUMED_LIMIT_BYTES*100))};
  }catch(e){return{bytes:0,pct:0};}
}
function formatBytes(b){
  if(b<1024)return b+' B';
  if(b<1024*1024)return (b/1024).toFixed(0)+' KB';
  return (b/(1024*1024)).toFixed(1)+' MB';
}
// ── Storage breakdown — groups every localStorage key by what it actually is, so "storage is
// full" turns into an actionable list instead of just a percentage. Per-outlet keys (suffixed
// "_outlet_<id>") are grouped under their salon's name; the auto-backup snapshot (a full
// duplicate copy of everything else, kept only for the "recover after an accidental close"
// case) is broken out on its own since clearing it is the single biggest, safest way to
// reclaim space — it's redundant with a real downloaded backup. ──
function estimateStorageBreakdown(){
  try{
    const salons=loadSalonsFromStorage();
    const nameFor=(id)=>{const s=salons.find(x=>String(x.id)===String(id));return s?s.name:'Outlet '+id;};
    const groups={};
    let total=0;
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      const v=localStorage.getItem(k);
      const bytes=(k?k.length:0)+(v?v.length:0);
      total+=bytes;
      if(!k){continue;}
      let label;
      if(k==='salonos_autobackup_snapshot')label='Auto-backup snapshot (in-browser, redundant with a downloaded backup)';
      else if(k.indexOf('_outlet_')!==-1){
        const outletId=k.slice(k.lastIndexOf('_outlet_')+8);
        label='Outlet data — '+nameFor(outletId);
      }
      else if(k.indexOf('salonos_')===0)label='App data — '+k.replace('salonos_','').replace(/_/g,' ');
      else label=k;
      groups[label]=(groups[label]||0)+bytes;
    }
    const items=Object.entries(groups).map(([label,bytes])=>({label,bytes})).sort((a,b)=>b.bytes-a.bytes);
    return{items,total};
  }catch(e){return{items:[],total:0};}
}
// Clears just the auto-backup snapshot key — safe because it's an internal duplicate copy the
// app keeps for crash-recovery, not a distinct piece of live data. Doesn't touch anything the
// user actually entered.
function clearAutoBackupSnapshot(){
  try{cachedLocalRemove('salonos_autobackup_snapshot');return true;}catch(e){return false;}
}
// Nuclear option — wipes every salonos_ key in this browser, including the auto-backup
// snapshot. Only ever called from a confirmation modal that requires a downloaded backup first.
function clearAllSalonOSData(){
  try{
    const keys=[];
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.indexOf('salonos_')===0)keys.push(k);}
    keys.forEach(k=>{cachedLocalRemove(k);});
    return keys.length;
  }catch(e){return 0;}
}
// Re-measures on the same save event as the last-saved indicator, throttled to at most once
// every 4s so heavy typing doesn't churn a localStorage.length scan on every keystroke.
function useStorageUsage(){
  const [usage,setUsage]=useState(()=>estimateStorageUsage());
  useEffect(()=>{
    let lastRun=0,pending;
    const remeasure=()=>{setUsage(estimateStorageUsage());lastRun=Date.now();};
    const onSave=()=>{
      const wait=4000-(Date.now()-lastRun);
      if(wait<=0)remeasure();
      else{clearTimeout(pending);pending=setTimeout(remeasure,wait);}
    };
    window.addEventListener('salonos-saved',onSave);
    return()=>{window.removeEventListener('salonos-saved',onSave);clearTimeout(pending);};
  },[]);
  return usage;
}