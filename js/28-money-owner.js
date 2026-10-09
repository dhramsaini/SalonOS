// ═══════════════════════════════════════════════════════════════════════════════════════════
// Money & owner view — payables ageing with a pay-this-week list (Vendors → ⏱ Ageing), bank
// reconciliation status across outlets (Dashboard → 🏦 Bank Reco), year-on-year card and budget
// pace strip (Outlet Dashboard), health score trend (Outlet Ranking). Alerts follow Master
// Settings → 🎛 Controls (all outlets / outlet-wise).
// ═══════════════════════════════════════════════════════════════════════════════════════════
const MO_M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const moMoney=n=>(Number(n)<0?'−':'')+'₹'+Math.round(Math.abs(Number(n)||0)).toLocaleString('en-IN');
const moIso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const moDmy=iso=>iso?String(iso).slice(8,10)+'/'+String(iso).slice(5,7)+'/'+String(iso).slice(0,4):'—';
function moInvIso(v){const p=parseInvoiceDateFlexible(v);return p?p.y+'-'+String(p.m).padStart(2,'0')+'-'+String(p.d).padStart(2,'0'):'';}

// ── Payables ageing ──
function payablesAgeingFor(sid,asOnIso){
  const asOn=asOnIso||moIso(new Date());const t=new Date(asOn+'T00:00:00');
  const vendors=loadVendors(sid)||[];const inv=(loadVendorInvoices(sid)||[]).filter(i=>i&&i.docNature!=='Performa Invoice');
  const by={},bills=[];
  inv.forEach(i=>{const bal=Math.round(((Number(i.amount)||0)-(i.payments||[]).reduce((t,x)=>t+(Number(x.paidAmount)||0),0))*100)/100;if(!(bal>0.5))return;
    const d=moInvIso(i.bookingDate||i.invoiceDate);if(d&&d>asOn)return;
    const age=d?Math.max(0,Math.floor((t-new Date(d+'T00:00:00'))/864e5)):0;const due=moInvIso(i.dueDate);
    const v=vendors.find(x=>String(x.id)===String(i.vendorId))||{name:i.vendorId};
    const b=age<=30?0:age<=60?1:age<=90?2:3;
    const r=by[i.vendorId]||(by[i.vendorId]={vendorId:i.vendorId,name:v.name,b:[0,0,0,0],total:0,overdue:0,count:0,nextDue:''});
    r.b[b]+=bal;r.total+=bal;r.count++;if(due&&due<asOn)r.overdue+=bal;if(due&&due>=asOn&&(!r.nextDue||due<r.nextDue))r.nextDue=due;
    bills.push({id:i.id,vendor:v.name,vendorId:i.vendorId,invoiceNo:i.invoiceNo||'',date:d,due,age,bal,bank:!!(v.accountNo&&v.ifsc)});});
  const rows=Object.values(by).sort((a,b)=>b.total-a.total);
  const tot=[0,1,2,3].map(k=>rows.reduce((s,r)=>s+r.b[k],0));
  const week=moIso(new Date(t.getTime()+7*864e5));
  const payWeek=bills.filter(x=>x.due&&x.due<=week).sort((a,b)=>a.due.localeCompare(b.due));
  return{rows,tot,total:tot.reduce((a,b)=>a+b,0),overdue:rows.reduce((s,r)=>s+r.overdue,0),bills,payWeek,asOn};
}
function PayablesAgeingPanel({salon}){
  const h=React.createElement;const {toast}=useToast();const sid=salon&&salon.id;
  const [asOn,setAsOn]=useState(moIso(new Date()));
  const A=payablesAgeingFor(sid,asOn);
  const exp=async()=>{try{await afDownloadXlsx('Payables ageing',[['Vendor','Bills','0–30 days','31–60 days','61–90 days','Over 90 days','Total','Overdue','Next due'],
      ...A.rows.map(r=>[r.name,r.count,...r.b.map(Math.round),Math.round(r.total),Math.round(r.overdue),moDmy(r.nextDue)]),['Total','',...A.tot.map(Math.round),Math.round(A.total),Math.round(A.overdue),''],[],
      ['Pay this week (due by '+moDmy(moIso(new Date(new Date(asOn+'T00:00:00').getTime()+7*864e5)))+')'],['Vendor','Invoice','Invoice date','Due date','Balance','Bank details'],
      ...A.payWeek.map(x=>[x.vendor,x.invoiceNo,moDmy(x.date),moDmy(x.due),Math.round(x.bal),x.bank?'Yes':'Missing'])],'Payables_Ageing_'+rptFile(rptShort(salon))+'_'+asOn+'.xlsx');}catch(e){toast(e.message||String(e),'error');}};
  const card=(l,v,c)=>h('div',{className:'metric-card '+c},h('div',{className:'metric-label'},l),h('div',{className:'metric-value',style:{fontSize:18}},moMoney(v)));
  const th=(t,i)=>h('th',{key:i,style:i?{textAlign:'right'}:null},t);const td=(v,st)=>h('td',{style:{textAlign:'right',...(st||{})}},v);
  return h('div',null,
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:10,flexWrap:'wrap',marginBottom:12}},
      h('div',null,h('div',{style:{fontWeight:700,fontSize:15}},'Payables ageing'),h('div',{style:{fontSize:12,color:'var(--text3)'}},'Unpaid vendor bills by age from the invoice date, overdue by due date, and what falls due in the next 7 days.')),
      h('div',{style:{display:'flex',gap:8,alignItems:'flex-end'}},h('div',{className:'form-group',style:{marginBottom:0}},h('label',null,'As on'),h('input',{type:'date',className:'form-control',value:asOn,onChange:e=>setAsOn(e.target.value||moIso(new Date()))})),
        h('button',{className:'btn btn-ghost btn-sm',onClick:exp},'⬇ Excel'))),
    h('div',{className:'grid4',style:{marginBottom:12}},card('Total payable',A.total,'blue'),card('Overdue',A.overdue,'red'),card('Over 60 days',A.tot[2]+A.tot[3],'amber'),card('Due in next 7 days',A.payWeek.filter(x=>x.due>=A.asOn).reduce((s,x)=>s+x.bal,0),'teal')),
    h('div',{className:'card',style:{padding:0,marginBottom:14}},h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,['Vendor','Bills','0–30 days','31–60 days','61–90 days','Over 90 days','Total','Overdue','Next due'].map(th))),
      h('tbody',null,A.rows.length?A.rows.map(r=>h('tr',{key:r.vendorId},h('td',null,r.name),td(r.count),...r.b.map((v,k)=>td(v?moMoney(v):'—',k>=2&&v?{color:'var(--red)',fontWeight:600}:null)),td(moMoney(r.total),{fontWeight:700}),td(r.overdue?moMoney(r.overdue):'—',r.overdue?{color:'var(--red)'}:null),td(moDmy(r.nextDue))))
        :h('tr',null,h('td',{colSpan:9,style:{textAlign:'center',color:'var(--text3)',padding:20}},'Nothing unpaid.')),
        A.rows.length>0&&h('tr',{style:{fontWeight:700,background:'var(--bg3)'}},h('td',null,'Total'),td(''),...A.tot.map(v=>td(moMoney(v))),td(moMoney(A.total)),td(moMoney(A.overdue)),td(''))))))
    ,h('div',{style:{fontWeight:700,fontSize:14,margin:'4px 0 8px'}},'Pay this week — overdue and due in the next 7 days'),
    h('div',{className:'card',style:{padding:0}},h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,['Vendor','Invoice','Invoice date','Due','Balance','Bank details'].map(th))),
      h('tbody',null,A.payWeek.length?A.payWeek.map(x=>h('tr',{key:x.id},h('td',null,x.vendor),td(x.invoiceNo),td(moDmy(x.date)),td(moDmy(x.due),x.due<A.asOn?{color:'var(--red)',fontWeight:600}:null),td(moMoney(x.bal),{fontWeight:600}),td(x.bank?'✓':'Missing',x.bank?{color:'var(--green)'}:{color:'var(--orange)'})))
        :h('tr',null,h('td',{colSpan:6,style:{textAlign:'center',color:'var(--text3)',padding:16}},'Nothing due in the next 7 days.')))))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'Pay them together from Bank Payment → Vendor payments (one transfer per vendor), then record the payment on Invoices & Payments.'));
}
// Strip in Vendors when bills are overdue or due within 7 days (Controls → Payables due alert).
function PayablesDueStrip({salon}){
  const h=React.createElement;const sid=salon&&salon.id;
  if(!sid||!controlOn('payablesDueAlert',sid))return null;
  const A=payablesAgeingFor(sid);const due=A.payWeek.filter(x=>x.due>=A.asOn).reduce((s,x)=>s+x.bal,0);
  if(!A.overdue&&!due)return null;
  return h('div',{style:{background:'rgba(224,165,48,0.1)',border:'1px solid rgba(224,165,48,0.4)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,fontSize:12.5}},
    '⏱ ',A.overdue?h('b',{style:{color:'var(--red)'}},moMoney(A.overdue)+' overdue'):null,A.overdue&&due?' · ':'',due?h('b',null,moMoney(due)+' due in the next 7 days'):null,' — see ⏱ Ageing.');
}

// ── Bank reconciliation status ──
function bankRecoStatusFor(sid,year,month){
  const rows=(loadBankStatementRows(sid)||[]).map(r=>({...r,iso:toISO(r.transactionDate)})).filter(r=>r.iso);
  const pre=year+'-'+String(month+1).padStart(2,'0');const m=rows.filter(r=>r.iso.startsWith(pre));
  const done=r=>!!(r.linkedInvoice||String(r.nature||'').trim());
  const old=moIso(new Date(Date.now()-7*864e5));
  const open=m.filter(r=>!done(r)),stale=rows.filter(r=>!done(r)&&r.iso<=old&&(Number(r.debit)||Number(r.credit)));
  const last=rows.length?rows.map(r=>r.iso).sort().pop():'';
  return{lines:m.length,done:m.length-open.length,open:open.length,openAmt:open.reduce((s,r)=>s+(Number(r.debit)||0)+(Number(r.credit)||0),0),
    pct:m.length?Math.round((m.length-open.length)/m.length*100):null,stale:stale.length,staleAmt:stale.reduce((s,r)=>s+(Number(r.debit)||0)+(Number(r.credit)||0),0),last};
}
function BankRecoBoard({accessibleSalons,onOpenOutletTab}){
  const h=React.createElement;const [cal,setCal]=useState({year:new Date().getFullYear(),month:new Date().getMonth()});
  const list=(accessibleSalons||[]).filter(s=>s&&s.id!=null&&s.status!=='Inactive').map(s=>({s,r:bankRecoStatusFor(s.id,cal.year,cal.month)}));
  const lastMonthEnd=moIso(new Date(new Date().getFullYear(),new Date().getMonth(),0));
  return h('div',null,
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:12}},
      h('div',null,h('div',{className:'page-title'},'Bank reconciliation status'),h('div',{className:'page-sub'},'Bank lines explained (linked to a bill or given a Nature) for the month, lines still open after 7 days, and how recent the last statement is')),
      afMonthPicker(cal,setCal)),
    h('div',{className:'card',style:{padding:0}},h('div',{className:'table-wrap'},h('table',null,
      h('thead',null,h('tr',null,['Outlet','Bank lines','Explained','% done','Open this month','Open over 7 days (any month)','Last statement date',''].map((t,i)=>h('th',{key:i,style:i&&i<7?{textAlign:'right'}:null},t)))),
      h('tbody',null,list.map(({s,r})=>h('tr',{key:s.id},
        h('td',{style:{fontWeight:600}},rptShort(s)),
        h('td',{style:{textAlign:'right'}},r.lines),h('td',{style:{textAlign:'right'}},r.done),
        h('td',{style:{textAlign:'right',fontWeight:700,color:r.pct==null?'var(--text3)':r.pct>=95?'var(--green)':r.pct>=75?'var(--orange)':'var(--red)'}},r.pct==null?'—':r.pct+'%'),
        h('td',{style:{textAlign:'right'}},r.open?r.open+' · '+moMoney(r.openAmt):'—'),
        h('td',{style:{textAlign:'right',color:r.stale?'var(--red)':''}},r.stale?r.stale+' · '+moMoney(r.staleAmt):'—'),
        h('td',{style:{textAlign:'right',color:!r.last||r.last<lastMonthEnd?'var(--orange)':''}},r.last?moDmy(r.last):'Never imported'),
        h('td',null,onOpenOutletTab&&h('button',{className:'btn btn-ghost btn-sm',onClick:()=>onOpenOutletTab(s,'bank-statement')},'Open')))))))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'Orange date = no statement imported up to the end of last month.'));
}
function BankStaleStrip({salonId}){
  const h=React.createElement;if(!salonId||!controlOn('bankRecoAlert',salonId))return null;
  const r=bankRecoStatusFor(salonId,new Date().getFullYear(),new Date().getMonth());if(!r.stale)return null;
  return h('div',{style:{background:'rgba(224,82,82,0.08)',border:'1px solid rgba(224,82,82,0.35)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,fontSize:12.5}},
    '🏦 ',h('b',null,r.stale+' bank line'+(r.stale===1?'':'s')),' ('+moMoney(r.staleAmt)+') older than 7 days have no Nature and are not linked — filter Nature = (blank) to clear them.');
}

// ── Year on year (Outlet Dashboard) ──
function YoyCard({salon,period}){
  const h=React.createElement;const sid=salon&&salon.id;if(sid==null)return null;
  const c=periodToCalendar(period)||{year:new Date().getFullYear(),month:new Date().getMonth()};
  const get=(y,m)=>{try{const f=calToFYMI(y,m);return plBuild(sid,f.fy,f.mi);}catch(e){return null;}};
  const a=get(c.year,c.month),b=get(c.year-1,c.month);if(!a)return null;
  const ch=(x,y)=>y?((x-y)/Math.abs(y)*100):null;
  const item=(l,x,y,cost)=>{const p=ch(x,y);const good=p==null?null:cost?p<=0:p>=0;
    return h('div',{style:{flex:'1 1 150px',minWidth:0}},h('div',{style:{fontSize:11,color:'var(--text3)',textTransform:'uppercase'}},l),
      h('div',{style:{fontWeight:700,fontSize:17}},moMoney(x)),h('div',{style:{fontSize:12,color:'var(--text3)'}},'last year '+(y?moMoney(y):'—'),
        p!=null&&h('span',{style:{marginLeft:6,fontWeight:700,color:good?'var(--green)':'var(--red)'}},(p>=0?'▲ ':'▼ ')+Math.abs(Math.round(p))+'%')));};
  const has=b&&(b.revenue||b.ebitda);
  return h('div',{className:'card',style:{marginBottom:16}},
    h('div',{className:'card-title'},'📆 '+MO_M[c.month]+' '+c.year+' against '+MO_M[c.month]+' '+(c.year-1)),
    has?h('div',{style:{display:'flex',gap:14,flexWrap:'wrap'}},item('Revenue',a.revenue,b.revenue),item('Employee cost',(a.sections[2]||{}).tot||0,(b.sections[2]||{}).tot||0,true),item('EBITDA',a.ebitda,b.ebitda),item('Profit before tax',a.pbt,b.pbt))
      :h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No figures for '+MO_M[c.month]+' '+(c.year-1)+' — enter last year’s totals in Previous Months P&L to compare.'));
}
// ── Budget pace strip (Outlet Dashboard) ──
function BudgetPaceStrip({salon}){
  const h=React.createElement;const sid=salon&&salon.id;if(sid==null||!controlOn('budgetAlert',sid))return null;
  const t=new Date();let ov=[];try{const r=mtdPnlFor(sid,t.getFullYear(),t.getMonth());ov=budgetOverruns(sid,r,calToFYMI(t.getFullYear(),t.getMonth()).fy);}catch(e){return null;}
  if(!ov.length)return null;
  return h('div',{style:{background:'rgba(224,165,48,0.1)',border:'1px solid rgba(224,165,48,0.4)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,fontSize:12.5}},
    '📊 Against budget so far this month: ',ov.slice(0,4).map((o,i)=>h('span',{key:i},i?' · ':'',h('b',null,o.name),' '+moMoney(o.mtd)+(o.rev?' (behind pace ':' (pace ')+moMoney(o.pace)+')')),ov.length>4?' · +'+(ov.length-4)+' more':'');
}
// ── Health trend: last 6 months' scores as a mini bar row ──
function healthTrendFor(sid,y,m){
  const out=[];for(let k=5;k>=0;k--){const d=new Date(y,m-k,1);let sc=null;try{const r=outletHealthFor(sid,d.getFullYear(),d.getMonth());sc=r?r.score:null;}catch(e){}out.push({label:MO_M[d.getMonth()],score:sc});}
  return out;
}
function HealthSpark({trend}){
  const h=React.createElement;
  return h('span',{style:{display:'inline-flex',alignItems:'flex-end',gap:2,height:22},title:trend.map(t=>t.label+': '+(t.score==null?'—':t.score)).join(' · ')},
    trend.map((t,i)=>h('span',{key:i,style:{width:6,height:Math.max(2,Math.round((t.score||0)/100*22)),borderRadius:1,background:t.score==null?'var(--border)':t.score>=80?'var(--green)':t.score>=60?'var(--orange)':'var(--red)'}})));
}
