// ── Automation batch 5 — sales insights and stock ─────────────────────────────────────────────
// Billing → 📊 Insights: 1 discount watch, 2 ticket size & service mix, 3 price check.
// Inventory: 5 consumption vs standard usage per service, 6 real purchase order + dead stock,
// 7 purchase-rate increase alert (Inventory receive) and vendor bill price watch (Vendors).

const S5M=v=>(Number(v)<0?'-':'')+'₹'+Math.round(Math.abs(Number(v)||0)).toLocaleString('en-IN');
const s5Pct=v=>v==null||!isFinite(v)?'—':(Math.round(v*10)/10)+'%';
function s5IsProduct(it){return it&&(it.type==='Product'||BILL_PRODUCTS.some(p=>p.name===it.name));}
function s5Bills(invoices,fromIso,toIso){return(invoices||[]).filter(b=>b&&b.status!=='Cancelled'&&b.date>=fromIso&&b.date<=toIso);}
function s5Limits(sid){const s=outletSettings(sid);return{disc:Number(s.discLimitPct)>0?Number(s.discLimitPct):10,margin:Number(s.marginTargetPct)>0?Number(s.marginTargetPct):55};}

// 1 · discounts per stylist and per day
function discountWatch(invoices,fromIso,toIso,limit){
  const bills=s5Bills(invoices,fromIso,toIso);const by={},day={};
  bills.forEach(b=>{const c=billCalc(b);const k=b.staff||'—';
    by[k]=by[k]||{staff:k,bills:0,gross:0,disc:0,discBills:0};by[k].bills++;by[k].gross+=c.subtotal;by[k].disc+=c.disc;if(c.disc>0)by[k].discBills++;
    day[b.date]=day[b.date]||{date:b.date,gross:0,disc:0};day[b.date].gross+=c.subtotal;day[b.date].disc+=c.disc;});
  const staff=Object.values(by).map(x=>({...x,pct:x.gross?x.disc/x.gross*100:0})).sort((a,b)=>b.pct-a.pct);
  const days=Object.values(day).map(x=>({...x,pct:x.gross?x.disc/x.gross*100:0})).filter(x=>x.pct>limit).sort((a,b)=>b.pct-a.pct);
  const tot=staff.reduce((t,x)=>({gross:t.gross+x.gross,disc:t.disc+x.disc}),{gross:0,disc:0});
  return{staff,days,total:{...tot,pct:tot.gross?tot.disc/tot.gross*100:0}};
}
// 2 · ticket size, services per bill, product attach — per stylist, and the last 8 weeks for the outlet
function ticketStats(bills){
  const n=bills.length;if(!n)return{bills:0,avg:0,svcPer:0,attach:0};
  let taxable=0,svc=0,withProd=0;
  bills.forEach(b=>{taxable+=billCalc(b).taxable;const items=b.items||[];svc+=items.filter(i=>!s5IsProduct(i)).reduce((t,i)=>t+(Number(i.qty)||1),0);if(items.some(s5IsProduct))withProd++;});
  return{bills:n,avg:taxable/n,svcPer:svc/n,attach:withProd/n*100,taxable};
}
// 3 · price check per service: rate excl. GST − product cost (standard usage × stock rate) − commission
function priceCheckRows(sid,invoices){
  const usage=loadStdUsage(sid);const items=loadInvItems(sid);const rateOf=id=>(items.find(i=>i.id===id)||{}).rate||0;
  const comm=(()=>{try{const sl=loadServiceSlabs(sid);return Math.max(...sl.map(s=>Number(s.rate)||0));}catch(e){return 5;}})();
  const charged={};(invoices||[]).forEach(b=>(b.items||[]).forEach(it=>{if(s5IsProduct(it))return;const c=charged[it.name]||(charged[it.name]={sum:0,n:0});c.sum+=Number(it.rate)||0;c.n++;}));
  const names=[...new Set([...BILL_SERVICES.map(s=>s.name),...Object.keys(charged)])];
  const {margin}=s5Limits(sid);
  return names.map(n=>{const list=BILL_SERVICES.find(s=>s.name===n);const rate=charged[n]?charged[n].sum/charged[n].n:(list?list.rate:0);
    const prod=(usage[n]||[]).reduce((t,u)=>t+(Number(u.qty)||0)*rateOf(u.itemId),0);const commission=rate*comm/100;const m=rate-prod-commission;
    return{name:n,rate,prod,commission,margin:m,marginPct:rate?m/rate*100:0,low:rate>0&&m/rate*100<margin,hasUsage:!!(usage[n]&&usage[n].length),sold:charged[n]?charged[n].n:0};}).sort((a,b)=>a.marginPct-b.marginPct);
}
function SalesInsightsModal({salon,invoices,onClose}){
  const h=React.createElement;const sid=Number(salon&&salon.id)||1;
  const [tab,setTab]=useState('disc');
  const today=new Date();const [cal,setCal]=useState({year:today.getFullYear(),month:today.getMonth()});
  const from=cal.year+'-'+String(cal.month+1).padStart(2,'0')+'-01',to=cal.year+'-'+String(cal.month+1).padStart(2,'0')+'-31';
  const lim=s5Limits(sid);
  const dw=discountWatch(invoices,from,to,lim.disc);
  const bills=s5Bills(invoices,from,to);
  const staffNames=[...new Set(bills.map(b=>b.staff||'—'))];
  const weeks=Array.from({length:8},(_,i)=>{const end=new Date(today.getTime()-i*7*864e5);const st=new Date(end.getTime()-6*864e5);return{label:localIsoOf(st).slice(5).split('-').reverse().join('/')+'–'+localIsoOf(end).slice(5).split('-').reverse().join('/'),s:ticketStats(s5Bills(invoices,localIsoOf(st),localIsoOf(end)))};}).reverse();
  const pc=priceCheckRows(sid,invoices);
  const th=(t,i)=>h('th',{key:i,style:i?{textAlign:'right'}:null},t);const r=(v,st)=>h('td',{style:{textAlign:'right',...(st||{})}},v);
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:900,maxWidth:'96vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}},h('div',{className:'modal-title',style:{margin:0}},'📊 Sales insights — from Billing'),afMonthPicker(cal,setCal)),
    h('div',{className:'tab-bar',style:{margin:'12px 0'}},[['disc','Discounts'],['ticket','Ticket size & mix'],['price','Price check']].map(([k,l])=>h('button',{key:k,className:'tab-btn '+(tab===k?'active':''),onClick:()=>setTab(k)},l))),
    !bills.length&&tab!=='price'&&h('div',{className:'help-note'},'No bills in Billing for this month. These figures use bills entered in SalonOS Billing.'),
    tab==='disc'&&h('div',null,
      h('div',{style:{fontSize:12.5,marginBottom:8}},'Discounts this month: ',h('b',null,S5M(dw.total.disc)),' on ',S5M(dw.total.gross),' billed (',h('b',{style:{color:dw.total.pct>lim.disc?'var(--red)':''}},s5Pct(dw.total.pct)),') · flagged above ',lim.disc,'% (Master Sheet → Controls)'),
      h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Stylist','Bills','Billed','Discount','Discount %','Bills with discount'].map(th))),
        h('tbody',null,dw.staff.map(x=>h('tr',{key:x.staff},h('td',null,x.staff),r(x.bills),r(S5M(x.gross)),r(S5M(x.disc)),r(s5Pct(x.pct),{fontWeight:600,color:x.pct>lim.disc?'var(--red)':''}),r(x.discBills)))))),
      dw.days.length>0&&h('div',{style:{marginTop:10,fontSize:12.5}},h('b',{style:{color:'var(--orange)'}},'Days above the limit: '),dw.days.map(d=>String(d.date).split('-').reverse().slice(0,2).join('/')+' ('+s5Pct(d.pct)+')').join(' · '))),
    tab==='ticket'&&h('div',null,
      h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Stylist','Bills','Average bill (excl. GST)','Services per bill','Product attach'].map(th))),
        h('tbody',null,[...staffNames.map(n=>({n,s:ticketStats(bills.filter(b=>(b.staff||'—')===n))})),{n:'Outlet',s:ticketStats(bills)}].map(({n,s})=>h('tr',{key:n,style:n==='Outlet'?{fontWeight:700,background:'var(--bg3)'}:null},h('td',null,n),r(s.bills),r(S5M(s.avg)),r(s.svcPer.toFixed(2)),r(s5Pct(s.attach))))))),
      h('div',{style:{fontWeight:600,fontSize:12.5,margin:'14px 0 6px'}},'Outlet, last 8 weeks'),
      h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Week','Bills','Average bill','Services per bill','Product attach'].map(th))),
        h('tbody',null,weeks.map((w,i)=>{const p=i?weeks[i-1].s:null;const ch=p&&p.avg?(w.s.avg/p.avg-1)*100:null;
          return h('tr',{key:w.label},h('td',null,w.label),r(w.s.bills),r(S5M(w.s.avg)+(ch==null?'':' ('+(ch>=0?'+':'')+Math.round(ch)+'%)'),{color:ch==null?'':ch>=0?'var(--green)':'var(--red)'}),r(w.s.svcPer.toFixed(2)),r(s5Pct(w.s.attach)));}))))),
    tab==='price'&&h('div',null,
      h('div',{style:{fontSize:12.5,marginBottom:8}},'Margin = average rate charged (excl. GST) − product used (Inventory → Standard usage × stock rate) − stylist commission (top service slab). Flagged below ',lim.margin,'%.'),
      h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Service','Times sold','Rate','Product cost','Commission','Margin','Margin %'].map(th))),
        h('tbody',null,pc.map(x=>h('tr',{key:x.name},h('td',null,x.name,!x.hasUsage&&h('div',{style:{fontSize:10.5,color:'var(--text3)'}},'no standard usage set')),r(x.sold),r(S5M(x.rate)),r(S5M(x.prod)),r(S5M(x.commission)),r(S5M(x.margin)),r(s5Pct(x.marginPct),{fontWeight:600,color:x.low?'var(--red)':'var(--green)'}))))))),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Close'))));
}

// ── Inventory: movement log, standard usage, consumption, purchase order, dead stock, price watch ──
function loadInvItems(sid){try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_inventory_items',sid))||'[]');return Array.isArray(v)?v:[];}catch(e){return[];}}
function loadInvLog(sid){try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_inventory_log',sid))||'[]');return Array.isArray(v)?v:[];}catch(e){return[];}}
function logInvMove(sid,item,type,qty,rate){
  const l=loadInvLog(sid);l.push({date:localIsoOf(new Date()),itemId:item.id,name:item.name,type,qty:Number(qty)||0,rate:rate!=null?Number(rate):undefined});
  safeLocalSet(outletKey('salonos_inventory_log',sid),JSON.stringify(l.slice(-5000)));
}
function loadStdUsage(sid){try{return JSON.parse(cachedLocalGet(outletKey('salonos_std_usage',sid))||'{}')||{};}catch(e){return{};}}
// Rate rise on receipt: the new purchase rate vs the item's last one; over 5% is logged and returned.
function checkPurchaseRate(sid,item,newRate){
  const r=Number(newRate)||0,old=Number(item.rate)||0;
  if(!r||!old||r<=old*1.05)return'';
  const msg=item.name+': purchase rate up '+Math.round((r/old-1)*100)+'% ('+S5M(old)+' → '+S5M(r)+')';
  try{logAuditEvent(sid,{entity:'Stock',entityId:String(item.id),action:'Price increase',summary:msg});}catch(e){}
  return msg;
}
function consumptionFor(sid,y,m){
  const pre=y+'-'+String(m+1).padStart(2,'0');const usage=loadStdUsage(sid);
  let bills=[];try{bills=JSON.parse(cachedLocalGet(outletKey('salonos_billing_invoices',sid))||'[]')||[];}catch(e){}
  const done={};bills.filter(b=>b&&b.status!=='Cancelled'&&String(b.date).startsWith(pre)).forEach(b=>(b.items||[]).forEach(it=>{if(!s5IsProduct(it))done[it.name]=(done[it.name]||0)+(Number(it.qty)||1);}));
  const expected={};Object.entries(usage).forEach(([svc,list])=>(list||[]).forEach(u=>{expected[u.itemId]=(expected[u.itemId]||0)+(done[svc]||0)*(Number(u.qty)||0);}));
  const actual={};loadInvLog(sid).filter(x=>x.type==='issue'&&String(x.date).startsWith(pre)).forEach(x=>{actual[x.itemId]=(actual[x.itemId]||0)+x.qty;});
  return loadInvItems(sid).map(i=>({i,expected:expected[i.id]||0,actual:actual[i.id]||0})).filter(x=>x.expected||x.actual).map(x=>({...x,varPct:x.expected?(x.actual/x.expected-1)*100:null}));
}
function InventoryTools({sid,items}){
  const h=React.createElement;const {success}=useToast();
  const [tab,setTab]=useState('po');const [tick,setTick]=useState(0);
  const now=new Date();const [cal,setCal]=useState({year:now.getFullYear(),month:now.getMonth()});
  const low=items.filter(i=>Number(i.qty)<=Number(i.min));
  const [poText,setPoText]=useState('');
  const buildPo=()=>{const lines=low.map(i=>{const q=Math.max(Number(i.min)||1,Math.ceil((Number(i.min)||0)*2-(Number(i.qty)||0)));return'• '+i.name+' — '+q+' '+i.unit+' (≈ '+S5M(q*(Number(i.rate)||0))+')';});
    setPoText('Purchase order — '+String(outletSettings(sid).name||'').split('—')[0].trim()+' ('+localIsoOf(new Date()).split('-').reverse().join('/')+')\n'+lines.join('\n')+'\nPlease confirm rates and delivery date.');};
  const log=loadInvLog(sid);const cutoff=localIsoOf(new Date(Date.now()-90*864e5));
  const lastMove=id=>log.filter(x=>x.itemId===id).reduce((a,x)=>x.date>a?x.date:a,'');
  const dead=items.filter(i=>Number(i.qty)>0&&(lastMove(i.id)||'')<cutoff).map(i=>({i,last:lastMove(i.id),value:(Number(i.qty)||0)*(Number(i.rate)||0)}));
  const usage=loadStdUsage(sid);const [draft,setDraft]=useState(()=>JSON.parse(JSON.stringify(usage)));
  const svcNames=[...new Set([...BILL_SERVICES.map(s=>s.name),...Object.keys(draft)])];
  const setU=(svc,idx,k,v)=>setDraft(d=>{const l=[...(d[svc]||[])];l[idx]={...l[idx],[k]:v};return{...d,[svc]:l};});
  const saveU=()=>{const c={};Object.entries(draft).forEach(([s,l])=>{const k=(l||[]).filter(u=>u&&u.itemId&&Number(u.qty)>0).map(u=>({itemId:u.itemId,qty:Number(u.qty)}));if(k.length)c[s]=k;});safeLocalSet(outletKey('salonos_std_usage',sid),JSON.stringify(c));success('Standard usage saved');setTick(x=>x+1);};
  const cons=consumptionFor(sid,cal.year,cal.month);
  const priceUps=log.filter(x=>x.type==='receive'&&x.rate!=null).length;
  const tbl=(cols,rows)=>h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,cols.map((c,i)=>h('th',{key:i},c)))),h('tbody',null,rows)));
  return h('div',{className:'card',style:{marginTop:16}},
    h('div',{className:'tab-bar',style:{marginBottom:12}},[['po','Purchase order ('+low.length+')'],['dead','Dead stock ('+dead.length+')'],['usage','Standard usage'],['cons','Consumption check']].map(([k,l])=>h('button',{key:k,className:'tab-btn '+(tab===k?'active':''),onClick:()=>setTab(k)},l))),
    tab==='po'&&h('div',null,low.length?h(React.Fragment,null,
        h('div',{style:{fontSize:12.5,marginBottom:8}},low.length+' items at or below their minimum — ordering up to twice the minimum.'),
        !poText?h('button',{className:'btn btn-primary btn-sm',onClick:buildPo},'🛒 Draft purchase order'):h(React.Fragment,null,
          h('textarea',{className:'form-control',rows:Math.min(14,low.length+4),value:poText,onChange:e=>setPoText(e.target.value),style:{fontSize:12.5,fontFamily:'inherit'}}),
          h('div',{style:{display:'flex',gap:8,marginTop:8}},h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{try{navigator.clipboard.writeText(poText);success('Copied');}catch(e){}}},'Copy'),
            h('button',{className:'btn btn-primary btn-sm',onClick:()=>window.open('https://wa.me/?text='+encodeURIComponent(poText),'_blank')},'📤 Send on WhatsApp'))))
      :h('div',{style:{fontSize:12.5,color:'var(--green)'}},'✓ Nothing below its minimum.')),
    tab==='dead'&&h('div',null,h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:6}},'In stock with no issue or receipt in 90 days (movements are logged from today on).'),
      dead.length?tbl(['Item','On hand','Value','Last movement'],dead.map(x=>h('tr',{key:x.i.id},h('td',null,x.i.name),h('td',null,x.i.qty+' '+x.i.unit),h('td',null,S5M(x.value)),h('td',null,x.last?x.last.split('-').reverse().join('/'):'none logged'))))
        :h('div',{style:{fontSize:12.5,color:'var(--green)'}},'✓ No dead stock.')),
    tab==='usage'&&h('div',null,h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:6}},'Product used per service (e.g. Hair Colour (Global) → 1 tube colour, 0.1 bottle developer). Drives the consumption check and the Billing price check.'),
      h('div',{className:'table-wrap',style:{maxHeight:360,overflowY:'auto'}},h('table',null,h('tbody',null,svcNames.map(svc=>{const l=draft[svc]||[];
        return h('tr',{key:svc},h('td',{style:{fontWeight:600,fontSize:12.5,verticalAlign:'top',width:200}},svc),h('td',null,
          [...l,{}].map((u,idx)=>h('div',{key:idx,style:{display:'flex',gap:6,marginBottom:4}},
            h('select',{className:'form-control',style:{width:220,padding:'2px 6px'},value:u.itemId||'',onChange:e=>setU(svc,idx,'itemId',e.target.value)},h('option',{value:''},'— product —'),items.map(i=>h('option',{key:i.id,value:i.id},i.name+' ('+i.unit+')'))),
            h('input',{type:'number',step:'0.01',className:'form-control',style:{width:90,padding:'2px 6px'},placeholder:'qty',value:u.qty??'',onChange:e=>setU(svc,idx,'qty',e.target.value)})))));})))),
      h('button',{className:'btn btn-primary btn-sm',style:{marginTop:8},onClick:saveU},'Save standard usage')),
    tab==='cons'&&h('div',null,h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}},h('div',{style:{fontSize:12,color:'var(--text3)'}},'Expected = services billed × standard usage; actual = units issued to the back bar (logged). Over 15% more than expected is flagged.'),afMonthPicker(cal,setCal)),
      cons.length?tbl(['Product','Expected','Issued','Difference'],cons.map(x=>h('tr',{key:x.i.id},h('td',null,x.i.name),h('td',null,(Math.round(x.expected*100)/100)+' '+x.i.unit),h('td',null,x.actual+' '+x.i.unit),
        h('td',{style:{fontWeight:600,color:x.varPct!=null&&x.varPct>15?'var(--red)':''}},x.varPct==null?'no standard usage':((x.varPct>=0?'+':'')+Math.round(x.varPct)+'%')))))
        :h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'Set standard usage and issue stock to the back bar to see this.')));
}
// 7 · vendor bill price watch: same vendor and category, bill amount more than 5% above the previous one
function vendorPriceWatch(sid){
  const vendors=loadVendors(sid)||[];const by={};
  (loadVendorInvoices(sid)||[]).filter(i=>i&&i.docNature!=='Performa Invoice'&&Number(i.amount)>0).forEach(i=>{const k=i.vendorId+'|'+(i.category||'');(by[k]=by[k]||[]).push(i);});
  const out=[];
  Object.values(by).forEach(list=>{list.sort((a,b)=>String(toISO(a.invoiceDate)).localeCompare(String(toISO(b.invoiceDate))));
    if(list.length<2)return;const last=list[list.length-1],prev=list[list.length-2];const ch=(Number(last.amount)/Number(prev.amount)-1)*100;
    if(ch>5&&localIsoOf(new Date(Date.now()-60*864e5))<=String(toISO(last.invoiceDate)))out.push({vendor:(vendors.find(v=>v.id===last.vendorId)||{}).name||last.vendorId,category:last.category||'',prev,last,ch});});
  return out.sort((a,b)=>b.ch-a.ch);
}
function VendorPriceWatchCard({salonId}){
  const h=React.createElement;const list=vendorPriceWatch(salonId);
  if(!list.length)return null;
  return h('div',{className:'card',style:{marginBottom:14}},h('div',{className:'card-title'},'📈 Bills up more than 5% on the last one (last 60 days)'),
    h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:6}},'Same vendor and category. Check whether the rate or the quantity went up.'),
    h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Vendor','Category','Previous bill','Latest bill','Change'].map((t,i)=>h('th',{key:i},t)))),
      h('tbody',null,list.map((x,i)=>h('tr',{key:i},h('td',null,x.vendor),h('td',null,x.category),h('td',null,S5M(x.prev.amount)+' · '+(x.prev.invoiceDate||'')),h('td',null,S5M(x.last.amount)+' · '+(x.last.invoiceDate||'')),h('td',{style:{fontWeight:600,color:'var(--red)'}},'+'+Math.round(x.ch)+'%')))))));
}
