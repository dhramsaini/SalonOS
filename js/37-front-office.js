// ═════════════════════════════════════════════════════════════════════════════════════════════
// Front office & purchasing additions (each switched in Master Settings → 🎛 Controls):
//   • Client follow-ups (CRM → 📅 Follow-ups): repeat service due, birthdays, lapsed, membership expiring.
//   • Membership / package balance at billing (by phone), package redemption.     → membershipAtBilling
//   • No-show history when booking (2+ no-shows → ask for an advance).            → noShowWarn
//   • Smarter reorder: days of stock left from actual use, lead time.             → smartReorder
//   • Purchase orders saved, approved above a limit, linked to the vendor bill.   → poApproval / billNeedsPo
//   • Payment run: tick every bill due by a date in Bank Payment → Vendor.        → paymentRun
// ═════════════════════════════════════════════════════════════════════════════════════════════
const FO_M=n=>'₹'+Math.round(Number(n)||0).toLocaleString('en-IN');
const foPhone=p=>String(p||'').replace(/\D/g,'').slice(-10);
function foClients(sid){try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_clients',sid))||'[]');return Array.isArray(v)?v:[];}catch(e){return[];}}
function foSaveClients(sid,list){safeLocalSet(outletKey('salonos_clients',sid),JSON.stringify(list));}
function foClientByPhone(sid,phone){const p=foPhone(phone);if(p.length<10)return null;return foClients(sid).find(c=>foPhone(c.phone)===p)||null;}

// ── Client follow-ups ──
const FO_REPEAT_DAYS=[[/colou?r|highlight|root/i,42],[/keratin|smoothen|rebond/i,120],[/hair ?cut|trim|styling/i,35],[/spa/i,30],[/facial|cleanup/i,30],[/wax|thread/i,21],[/mani|pedi|nail/i,21]];
function foRepeatDays(svc){const r=FO_REPEAT_DAYS.find(([re])=>re.test(String(svc||'')));return r?r[1]:45;}
function foFollowKey(sid){return outletKey('salonos_client_followups',sid);}
function foLoadSent(sid){try{return JSON.parse(cachedLocalGet(foFollowKey(sid))||'{}')||{};}catch(e){return{};}}
function foMarkSent(sid,key){const o=foLoadSent(sid);o[key]={at:Date.now(),by:(currentSessionUser()||{}).name||''};safeLocalSet(foFollowKey(sid),JSON.stringify(o));}
function foLastVisit(sid,c,bills){const p=foPhone(c.phone);let last=String(c.last||'');(bills||[]).forEach(b=>{if(b&&b.status!=='Cancelled'&&foPhone(b.phone)===p&&String(b.date)>last)last=String(b.date);});return last;}
function clientFollowUps(sid,today){
  if(!controlOn('clientFollowUps',sid))return[];today=today||new Date();const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');const t0=iso(today);
  let bills=[];try{bills=JSON.parse(cachedLocalGet(outletKey('salonos_billing_invoices',sid))||'[]')||[];}catch(e){}
  const sent=foLoadSent(sid);const out=[];const MON=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const recent=k=>sent[k]&&Date.now()-sent[k].at<25*864e5;
  foClients(sid).forEach(c=>{if(!c||!foPhone(c.phone))return;const first=String(c.name||'').split(' ')[0];const last=foLastVisit(sid,c,bills);
    const days=last?Math.round((new Date(t0+'T00:00:00')-new Date(last+'T00:00:00'))/864e5):null;
    // birthday in the next 7 days
    const bm=String(c.birthday||'').trim().toLowerCase().match(/(\d{1,2})\s*([a-z]{3})/);
    if(bm){const mi=MON.indexOf(bm[2]);if(mi>=0){let bd=new Date(today.getFullYear(),mi,Number(bm[1]));if(bd<new Date(today.getFullYear(),today.getMonth(),today.getDate()))bd=new Date(today.getFullYear()+1,mi,Number(bm[1]));
      const dd=Math.round((bd-new Date(today.getFullYear(),today.getMonth(),today.getDate()))/864e5);const k='bday|'+c.id+'|'+bd.getFullYear();
      if(dd<=7&&!recent(k))out.push({key:k,c,kind:'Birthday',when:dd===0?'today':'in '+dd+' day'+(dd===1?'':'s'),msg:'Happy birthday '+first+'! 🎉 Wishing you a lovely year. Enjoy a complimentary cleanup with any service booked this month.'});}}
    // membership expiring within 15 days
    if(c.tier&&c.tier!=='None'&&c.tierValidTill){const dd=Math.round((new Date(c.tierValidTill+'T00:00:00')-new Date(t0+'T00:00:00'))/864e5);const k='mem|'+c.id+'|'+c.tierValidTill;
      if(dd>=-3&&dd<=15&&!recent(k))out.push({key:k,c,kind:'Membership ending',when:dd<0?'ended '+(-dd)+' day(s) ago':'in '+dd+' day(s)',msg:'Hi '+first+', your '+c.tier+' ends on '+c.tierValidTill.split('-').reverse().join('/')+'. Renew this week to keep your benefits — reply RENEW and we will set it up.'});}
    if(days==null)return;
    // lapsed (90+ days)
    if(days>90){const k='lapsed|'+c.id+'|'+last;if(!recent(k))out.push({key:k,c,kind:'Lapsed',when:days+' days since the last visit',msg:'Hi '+first+', we have missed you! It has been a while since your last '+(c.fav||'visit')+'. Reply BOOK and we will keep a slot for you this week.'});return;}
    // repeat service due
    const every=foRepeatDays(c.fav);const due=days-every;const k='repeat|'+c.id+'|'+last;
    if(c.fav&&due>=-3&&due<=21&&!recent(k))out.push({key:k,c,kind:'Repeat due',when:(due<0?'due in '+(-due)+' day(s)':due===0?'due today':'due '+due+' day(s) ago')+' — every ~'+every+' days',msg:'Hi '+first+', it is about time for your next '+c.fav+'. Shall we book you in? Reply with a day and time that suits you.'});});
  const order={'Membership ending':0,'Birthday':1,'Repeat due':2,'Lapsed':3};return out.sort((a,b)=>order[a.kind]-order[b.kind]);
}
function ClientFollowUps({salon}){
  const h=React.createElement;const sid=salon&&salon.id;const [open,setOpen]=useState(false);const [,setT]=useState(0);const [kind,setKind]=useState('All');
  if(sid==null||!controlOn('clientFollowUps',sid))return null;
  const list=clientFollowUps(sid);const kinds=['All',...new Set(list.map(x=>x.kind))];const shown=list.filter(x=>kind==='All'||x.kind===kind);
  const send=x=>{const ph=typeof waNumber==='function'?waNumber(x.c.phone):'91'+foPhone(x.c.phone);window.open('https://wa.me/'+ph+'?text='+encodeURIComponent(x.msg),'_blank','noopener');foMarkSent(sid,x.key);setT(t=>t+1);};
  return h('div',{style:{marginBottom:12}},
    h('button',{className:'btn btn-sm '+(list.length?'btn-primary':'btn-ghost'),onClick:()=>setOpen(o=>!o)},'📅 Follow-ups'+(list.length?' ('+list.length+')':'')),
    open&&h('div',{className:'card',style:{marginTop:8}},
      h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}},kinds.map(k=>h('button',{key:k,className:'btn btn-sm '+(kind===k?'btn-primary':'btn-ghost'),onClick:()=>setKind(k)},k+(k==='All'?'':' ('+list.filter(x=>x.kind===k).length+')')))),
      !shown.length?h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'Nobody to follow up today.')
      :shown.map(x=>h('div',{key:x.key,style:{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',padding:'8px 0',borderBottom:'1px solid var(--border)'}},
        h('div',{style:{flex:1,minWidth:220}},h('b',null,x.c.name),' · ',h('span',{style:{color:'var(--text3)',fontSize:12}},x.c.phone),h('div',{style:{fontSize:12}},h('span',{className:'badge badge-blue',style:{marginRight:6}},x.kind),x.when),
          h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:2}},x.msg)),
        h('button',{className:'btn btn-primary btn-sm',onClick:()=>send(x)},'📲 Send'),
        h('button',{className:'btn btn-ghost btn-sm',title:'Hide for 25 days',onClick:()=>{foMarkSent(sid,x.key);setT(t=>t+1);}},'Done'))),
      h('div',{style:{fontSize:11,color:'var(--text3)',marginTop:8}},'Repeat timing comes from the usual service (colour ~6 weeks, haircut ~5, facial ~4 …). Last visit uses the latest bill on the same phone. A sent follow-up is hidden for 25 days.')));
}

// ── Membership / package at billing ──
function BillingClientStrip({sid,phone,total,usePackage,onUsePackage}){
  const h=React.createElement;if(sid==null||!controlOn('membershipAtBilling',sid))return null;const c=foClientByPhone(sid,phone);if(!c)return null;
  const bal=typeof fdPackageLeft==='function'?fdPackageLeft(sid,phone):(Number(c.packageBalance)||0);const tier=c.tier&&c.tier!=='None'?c.tier:'';const exp=c.tierValidTill||'';const expired=exp&&exp<new Date().toISOString().slice(0,10);
  const ns=noShowCount(sid,phone);
  return h('div',{style:{background:'rgba(47,95,224,0.07)',border:'1px solid rgba(47,95,224,0.3)',borderRadius:8,padding:'8px 10px',margin:'4px 0 10px',fontSize:12.5}},
    h('b',null,'👤 '+c.name),' · '+(c.visits||0)+' visit(s)',tier&&h('span',{style:{marginLeft:8,color:expired?'var(--red)':'var(--green)',fontWeight:600}},tier+(exp?(expired?' — ended ':' till ')+exp.split('-').reverse().join('/'):'')),
    bal>0&&h('div',{style:{marginTop:4}},'Package balance ',h('b',null,FO_M(bal)),total>0&&h('label',{style:{marginLeft:10,cursor:'pointer'}},h('input',{type:'checkbox',checked:!!usePackage,onChange:e=>onUsePackage(e.target.checked),style:{marginRight:4}}),'Pay '+FO_M(Math.min(bal,total))+' from the package')),
    ns>0&&h('div',{style:{marginTop:4,color:ns>=2?'var(--red)':'var(--orange)'}},'⚠ '+ns+' no-show'+(ns===1?'':'s')+' before'),
    c.notes&&h('div',{style:{marginTop:4,color:'var(--text3)'}},'Note: '+c.notes));
}
// Called after a new bill is saved: takes the package amount off the client's balance.
function redeemPackage(sid,phone,amount,billId){
  const p=foPhone(phone);const list=foClients(sid);const i=list.findIndex(c=>foPhone(c.phone)===p);if(i<0)return 0;
  const bal=Number(list[i].packageBalance)||0;const use=Math.min(bal,Number(amount)||0);if(!(use>0))return 0;
  list[i]={...list[i],packageBalance:Math.round((bal-use)*100)/100,packageLog:[...(list[i].packageLog||[]),{at:new Date().toISOString(),bill:billId,amount:-use}].slice(-60)};foSaveClients(sid,list);
  try{logAuditEvent(sid,{entity:'Client',entityId:String(list[i].id),action:'Package used',summary:list[i].name+' — '+FO_M(use)+' on bill '+billId+', balance '+FO_M(bal-use)});}catch(e){}
  return use;
}

// ── No-shows ──
function noShowCount(sid,phone){
  const p=foPhone(phone);if(p.length<10)return 0;let book={};try{book=JSON.parse(cachedLocalGet(outletKey('salonos_appointments_book',sid))||'{}')||{};}catch(e){}
  let n=0;Object.values(book).forEach(list=>(Array.isArray(list)?list:[]).forEach(a=>{if(a&&a.status==='No-show'&&foPhone(a.phone)===p)n++;}));return n;
}
function NoShowNote({sid,phone}){
  const h=React.createElement;if(sid==null||!controlOn('noShowWarn',sid))return null;const n=noShowCount(sid,phone);if(!n)return null;
  return h('div',{style:{fontSize:12,marginTop:4,color:n>=2?'var(--red)':'var(--orange)',fontWeight:600}},'⚠ '+n+' no-show'+(n===1?'':'s')+' on this number'+(n>=2?' — ask for an advance to hold the slot':''));
}

// ── Smarter reorder ──
function smartReorderList(sid,items){
  const on=controlOn('smartReorder',sid);const lead=controlLimit('smartReorder')||7;const log=typeof loadInvLog==='function'?loadInvLog(sid):[];
  const from=new Date(Date.now()-60*864e5).toISOString().slice(0,10);const used={};log.filter(x=>(x.type==='issue'||x.type==='sale')&&String(x.date)>=from).forEach(x=>{used[x.itemId]=(used[x.itemId]||0)+(Number(x.qty)||0);});
  return(items||[]).map(i=>{const qty=Number(i.qty)||0,min=Number(i.min)||0;const perDay=(used[i.id]||0)/60;const cover=perDay>0?Math.floor(qty/perDay):null;
    const need=qty<=min||(on&&cover!=null&&cover<=(Number(i.leadDays)||lead));const order=Math.max(Math.ceil(min*2-qty),on&&perDay>0?Math.ceil(perDay*30-qty):0,need?1:0);
    return{i,qty,min,perDay:Math.round(perDay*100)/100,cover,need,order};}).filter(x=>x.need);
}

// ── Purchase orders ──
function poKey(sid){return outletKey('salonos_purchase_orders',sid);}
function loadPOs(sid){try{const v=JSON.parse(cachedLocalGet(poKey(sid))||'[]');return Array.isArray(v)?v:[];}catch(e){return[];}}
function savePOs(sid,list){safeLocalSet(poKey(sid),JSON.stringify((list||[]).slice(-500)));}
function createPO(sid,vendorId,lines,note){
  const list=loadPOs(sid);const n=Math.max(0,...list.map(p=>Number(String(p.no||'').replace(/\D/g,''))||0))+1;
  const L=(lines||[]).filter(l=>l&&l.name&&Number(l.qty)>0).map(l=>({itemId:l.itemId||'',name:l.name,qty:Number(l.qty),unit:l.unit||'',rate:Number(l.rate)||0}));
  const po={id:'PO'+Date.now(),no:'PO-'+String(n).padStart(4,'0'),vendorId,date:new Date().toISOString().slice(0,10),lines:L,total:Math.round(L.reduce((t,l)=>t+l.qty*l.rate,0)),note:note||'',status:'Draft',by:(currentSessionUser()||{}).name||'',at:new Date().toISOString()};
  savePOs(sid,[...list,po]);try{logAuditEvent(sid,{entity:'Purchase order',entityId:po.no,action:'Created',summary:FO_M(po.total)+' · '+L.length+' line(s)'});}catch(e){}return po;
}
function approvePO(sid,po){
  if(controlOn('poApproval',sid)&&po.total>controlLimit('poApproval')&&!requireApproval({control:'poApproval',sid,key:sid+'|po|'+po.id,summary:'Purchase order '+po.no+' for '+FO_M(po.total)}))return false;
  savePOs(sid,loadPOs(sid).map(p=>p.id===po.id?{...p,status:'Approved',approvedBy:(currentSessionUser()||{}).name||'',approvedAt:new Date().toISOString()}:p));
  try{logAuditEvent(sid,{entity:'Purchase order',entityId:po.no,action:'Approved',summary:FO_M(po.total)});}catch(e){}return true;
}
function linkPOToBill(sid,poId,inv){savePOs(sid,loadPOs(sid).map(p=>p.id===poId?{...p,status:'Billed',bills:[...(p.bills||[]),{invoiceNo:inv.invoiceNo,amount:Number(inv.amount)||0,at:new Date().toISOString()}]}:p));}
// Vendors → saving a bill: with Controls → billNeedsPo, a bill above the limit must name an approved PO of that vendor.
function billPoOk(sid,vendorId,amount,invoiceNo){
  if(!controlOn('billNeedsPo',sid)||!(Number(amount)>controlLimit('billNeedsPo')))return true;
  const open=loadPOs(sid).filter(p=>String(p.vendorId)===String(vendorId)&&p.status==='Approved');
  if(!open.length){window.alert('Bills above '+FO_M(controlLimit('billNeedsPo'))+' need an approved purchase order for this vendor (Master Settings → 🎛 Controls). Create and approve the PO in Inventory first.');return false;}
  const pick=window.prompt('Which purchase order is this bill against?\n\n'+open.map((p,i)=>(i+1)+'. '+p.no+' — '+FO_M(p.total)+' ('+p.date.split('-').reverse().join('/')+')').join('\n')+'\n\nType the number:',open.length===1?'1':'');
  const k=Number(pick);if(!k||!open[k-1]){if(pick!=null)window.alert('Pick one of the purchase orders listed.');return false;}
  const po=open[k-1];if(Number(amount)>po.total*1.1+1&&!window.confirm('The bill ('+FO_M(amount)+') is more than 10% above '+po.no+' ('+FO_M(po.total)+'). Save anyway?'))return false;
  linkPOToBill(sid,po.id,{invoiceNo,amount});return true;
}
function PurchaseOrdersPanel({sid,items}){
  const h=React.createElement;const [,setT]=useState(0);const [draft,setDraft]=useState(null);
  const vendors=(loadVendors(sid)||[]).filter(v=>v&&v.status!=='Inactive');const pos=loadPOs(sid).slice().reverse();const low=smartReorderList(sid,items);
  const start=()=>setDraft({vendorId:'',note:'',lines:low.map(x=>({itemId:x.i.id,name:x.i.name,unit:x.i.unit,qty:x.order,rate:Number(x.i.rate)||0}))});
  const vName=id=>(vendors.find(v=>String(v.id)===String(id))||{}).name||id||'—';
  const linkBill=po=>{const bills=(loadVendorInvoices(sid)||[]).filter(i=>String(i.vendorId)===String(po.vendorId)&&!(loadPOs(sid).some(p=>(p.bills||[]).some(b=>b.invoiceNo===i.invoiceNo))));
    if(!bills.length){window.alert('No unlinked bills of '+vName(po.vendorId)+' yet — enter the bill in Vendors first.');return;}
    const pick=window.prompt('Link which bill to '+po.no+'?\n\n'+bills.slice(-12).map((b,i)=>(i+1)+'. '+b.invoiceNo+' — '+FO_M(b.amount)+' ('+(b.invoiceDate||'')+')').join('\n'),'');const b=bills.slice(-12)[Number(pick)-1];if(!b)return;linkPOToBill(sid,po.id,b);setT(t=>t+1);};
  return h('div',{style:{marginTop:12}},
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}},h('b',null,'🧾 Purchase orders'),!draft&&h('button',{className:'btn btn-primary btn-sm',onClick:start},'+ New PO'+(low.length?' ('+low.length+' to reorder)':''))),
    draft&&h('div',{style:{border:'1px dashed var(--border2)',borderRadius:8,padding:10,marginTop:8}},
      h('select',{className:'form-control',style:{width:260,marginBottom:8},value:draft.vendorId,onChange:e=>{const vid=e.target.value;setDraft(d=>({...d,vendorId:vid,lines:d.lines.map(l=>{const it=(items||[]).find(z=>z.id===l.itemId);const cr=it&&typeof fdCatalogueRate==='function'?fdCatalogueRate(sid,it,vid):null;return cr?{...l,rate:cr.rate,code:cr.code,name:l.name+(cr.code&&!String(l.name).includes(cr.code)?' ['+cr.code+']':'')}:l;})}));}},h('option',{value:''},'— Vendor —'),vendors.map(v=>h('option',{key:v.id,value:v.id},v.name))),
      draft.lines.map((l,i)=>h('div',{key:i,style:{display:'flex',gap:6,marginBottom:4,flexWrap:'wrap'}},
        h('input',{className:'form-control',style:{width:220,padding:'2px 6px'},value:l.name,onChange:e=>setDraft(d=>({...d,lines:d.lines.map((z,j)=>j===i?{...z,name:e.target.value}:z)}))}),
        h('input',{type:'number',className:'form-control',style:{width:80,padding:'2px 6px'},value:l.qty,onChange:e=>setDraft(d=>({...d,lines:d.lines.map((z,j)=>j===i?{...z,qty:e.target.value}:z)}))}),
        h('input',{type:'number',className:'form-control',style:{width:100,padding:'2px 6px'},value:l.rate,placeholder:'rate',onChange:e=>setDraft(d=>({...d,lines:d.lines.map((z,j)=>j===i?{...z,rate:e.target.value}:z)}))}),
        h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>setDraft(d=>({...d,lines:d.lines.filter((_,j)=>j!==i)}))},'✕'))),
      h('div',{style:{display:'flex',gap:8,marginTop:6,flexWrap:'wrap'}},h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setDraft(d=>({...d,lines:[...d.lines,{name:'',qty:1,rate:0}]}))},'+ Line'),
        h('button',{className:'btn btn-primary btn-sm',onClick:()=>{if(!draft.vendorId){window.alert('Choose the vendor.');return;}const po=createPO(sid,draft.vendorId,draft.lines,draft.note);setDraft(null);setT(t=>t+1);
          if(window.confirm(po.no+' saved ('+FO_M(po.total)+'). Send it to the vendor on WhatsApp?')){const v=vendors.find(z=>String(z.id)===String(po.vendorId))||{};const ph=typeof waNumber==='function'?waNumber(v.phone):'';
            const txt='Purchase order '+po.no+' — '+String(outletSettings(sid).name||'').split('—')[0].trim()+'\n'+po.lines.map(l=>'• '+l.name+' — '+l.qty+' '+(l.unit||'')).join('\n')+'\nPlease confirm rates and delivery.';
            window.open('https://wa.me/'+(ph||'')+'?text='+encodeURIComponent(txt),'_blank','noopener');}}},'Save PO'),
        h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setDraft(null)},'Cancel'))),
    pos.length>0&&h('div',{className:'table-wrap',style:{marginTop:8}},h('table',null,h('thead',null,h('tr',null,['PO','Date','Vendor','Total','Status',''].map((t,i)=>h('th',{key:i},t)))),
      h('tbody',null,pos.slice(0,30).map(p=>h('tr',{key:p.id},h('td',null,p.no),h('td',null,p.date.split('-').reverse().join('/')),h('td',null,vName(p.vendorId)),h('td',null,FO_M(p.total)),
        h('td',{style:{color:p.status==='Billed'?'var(--green)':p.status==='Approved'?'#2f5fe0':'var(--text3)',fontWeight:600}},p.status+(p.bills&&p.bills.length?' · '+p.bills.map(b=>b.invoiceNo).join(', '):'')),
        h('td',null,p.status==='Draft'&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{if(approvePO(sid,p))setT(t=>t+1);}},'Approve'),p.status==='Approved'&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>linkBill(p)},'Link bill'))))))));
}

// ── Payment run (Bank Payment → Vendor) ──
function PaymentRunBar({sid,rows,onSelect}){
  const h=React.createElement;const d0=new Date();d0.setDate(d0.getDate()+((7-d0.getDay())%7));const [by,setBy]=useState(d0.toISOString().slice(0,10));
  if(sid==null||!controlOn('paymentRun',sid))return null;
  const due=(rows||[]).filter(r=>r.due&&r.due<=by);const tot=due.reduce((t,r)=>t+(Number(r.balance)||0),0);const over=(rows||[]).filter(r=>r.due&&r.due<new Date().toISOString().slice(0,10)).length;
  return h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',background:'var(--bg3)',borderRadius:8,padding:'8px 10px',marginBottom:10,fontSize:12.5}},
    h('b',null,'📅 Payment run'),'Bills due by',h('input',{type:'date',className:'form-control',style:{width:150,padding:'3px 6px'},value:by,onChange:e=>setBy(e.target.value)}),
    h('span',null,due.length+' bill(s) · '+FO_M(tot)),over>0&&h('span',{style:{color:'var(--red)',fontWeight:600}},over+' overdue'),
    h('button',{className:'btn btn-primary btn-sm',disabled:!due.length,onClick:()=>onSelect(due.map(r=>r.invId))},'Tick them'),
    h('span',{style:{fontSize:11.5,color:'var(--text3)'}},'Download the file below; when the bank statement comes in, the payments link to these bills automatically.'));
}
