// ═════════════════════════════════════════════════════════════════════════════════════════════
// Salary Working & Incentive Working — more tools ("🧰 Pay tools" bar on both sheets). Each has its
// own switch in Controls → Salary & staff → Salary tools / Incentive tools.
//   Salary:    hold (payHold), overtime and late / early from check-ins (payOvertime, payLateEarly),
//              one-off earnings (payOneOffs), bonus & gratuity provisions (payProvisions), leavers'
//              full and final (payFnF), leave encashment (payLeaveEncash), changes before approval
//              (payChangePreview), bank + cash split (paySplit).
//   Incentive: live target tracker (incTracker), simulator (incSimulator), team incentive
//              (incTeam), client feedback (incFeedback), clawback for refunds / cancellations
//              (incClawback), cap (incCap) and floor for new joiners (incFloor), product-mix check
//              (incMixCheck).
//   Both:      maker-checker (payMakerChecker), change log (payChangeLog), month comparison
//              (payCompare), budget (payBudget), employee yearly view (payYearly).
// Per month and employee extras live in outletKey('salonos_pay_extras') = {ym: {empId: {...},
// _check: {salary|incentive: {empId: {by, at}}}, _team: {target, pool, by}}}.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const PT_MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
function ptOn(id,sid){return typeof controlOn==='function'&&controlOn(id,sid);}
function ptLim(id,d,sid){const v=typeof controlLimit==='function'?Number(controlLimit(id,sid)):0;return v>0?v:d;}
function ptM(n){return '₹'+Math.round(Number(n)||0).toLocaleString('en-IN');}
function ptYm(y,m){return y+'-'+String(m+1).padStart(2,'0');}
function ptWho(){const u=typeof currentSessionUser==='function'?currentSessionUser():null;return u?(u.name||u.email||''):'';}
function ptKey(sid){return outletKey('salonos_pay_extras',sid);}
function ptAll(sid){try{const v=JSON.parse(cachedLocalGet(ptKey(sid))||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}}
function ptSaveAll(sid,o){safeLocalSet(ptKey(sid),JSON.stringify(o));}
function ptGet(sid,ym,id){return((ptAll(sid)[ym]||{})[String(id)])||{};}
function ptSet(sid,ym,id,patch){const A=ptAll(sid);const M=A[ym]=A[ym]||{};M[String(id)]={...(M[String(id)]||{}),...patch};ptSaveAll(sid,A);}
function ptMonthGet(sid,ym,k){return(ptAll(sid)[ym]||{})[k]||null;}
function ptMonthSet(sid,ym,k,v){const A=ptAll(sid);const M=A[ym]=A[ym]||{};M[k]=v;ptSaveAll(sid,A);}
function ptSettings(sid){let s={};try{s=JSON.parse(cachedLocalGet(outletKey('salonos_pay_tools_settings',sid))||'{}')||{};}catch(e){}return{shiftFrom:'10:00',shiftTo:'20:00',otMult:1,lateCapDays:1,...s};}
function ptSaveSettings(sid,s){safeLocalSet(outletKey('salonos_pay_tools_settings',sid),JSON.stringify(s));}
function ptHm(s){const m=String(s||'').match(/^(\d{1,2}):(\d{2})/);return m?(+m[1])*60+(+m[2]):null;}

// ── 2 · overtime and late / early from phone check-ins ──
function ptOtLate(sid,e,y,m){
  const otOn=ptOn('payOvertime',sid),lateOn=ptOn('payLateEarly',sid);if(!otOn&&!lateOn)return{ot:0,late:0,otMin:0,lateMin:0,days:0};
  if(typeof loadCheckins!=='function')return{ot:0,late:0,otMin:0,lateMin:0,days:0};
  const S=ptSettings(sid);let sh=null;try{sh=typeof fdStaffHours==='function'?fdStaffHours(sid,{id:e.id}):null;}catch(x){}
  const from=sh&&sh.from!=null?sh.from:ptHm(S.shiftFrom),to=sh&&sh.to!=null?sh.to:ptHm(S.shiftTo);if(from==null||to==null||to<=from)return{ot:0,late:0,otMin:0,lateMin:0,days:0};
  const pre=ptYm(y,m);const L=loadCheckins(sid).filter(x=>String(x.empId)===String(e.id)&&String(x.date).startsWith(pre));const byDay={};
  L.forEach(x=>{const d=new Date(x.at);if(isNaN(d))return;const min=d.getHours()*60+d.getMinutes();const o=byDay[x.date]=byDay[x.date]||{in:null,out:null};
    if(x.kind==='in'&&(o.in==null||min<o.in))o.in=min;if(x.kind==='out'&&(o.out==null||min>o.out))o.out=min;});
  const grace=ptLim('payLateEarly',15,sid),otMinH=ptLim('payOvertime',1,sid);let otMin=0,lateMin=0,days=0;
  Object.values(byDay).forEach(o=>{days++;if(o.in!=null&&o.in>from+grace)lateMin+=o.in-from;if(o.out!=null&&o.out<to-grace)lateMin+=to-o.out;if(o.out!=null&&o.out-to>=otMinH*60)otMin+=o.out-to;});
  const dim=new Date(y,m+1,0).getDate();const perMin=(Number(e.gross)||0)/dim/(to-from);
  const ot=otOn?Math.round(otMin*perMin*(Number(S.otMult)||1)):0;let late=lateOn?Math.round(lateMin*perMin):0;const cap=Math.round((Number(e.gross)||0)/dim*(Number(S.lateCapDays)||1));if(late>cap)late=cap;
  return{ot,late,otMin,lateMin,days,shift:[from,to]};
}
// ── 1, 3, 5, 6, 8 · what Salary Working adds and takes off ──
function payExtrasFor(sid,e,y,m,ctx){
  const ym=ptYm(y,m);const x=ptGet(sid,ym,e.id);const dim=new Date(y,m+1,0).getDate();
  const bonus=ptOn('payOneOffs',sid)?(Array.isArray(x.oneOffs)?x.oneOffs:[]).reduce((t,b)=>t+(Number(b.amount)||0),0):0;
  const ol=ptOtLate(sid,e,y,m);
  const encash=ptOn('payLeaveEncash',sid)&&Number(x.encashDays)>0?Math.round((Number(e.basic)||0)/dim*Number(x.encashDays)):0;
  const notice=ptOn('payFnF',sid)&&Number(x.noticeDays)>0?Math.round((Number(e.gross)||0)/dim*Number(x.noticeDays)):0;
  const earn=bonus+ol.ot+encash,ded=ol.late+notice;
  return{earn,ded,parts:{bonus,ot:ol.ot,encash,late:ol.late,notice},otMin:ol.otMin,lateMin:ol.lateMin,
    hold:ptOn('payHold',sid)&&x.hold&&x.hold.on?x.hold:null,cash:ptOn('paySplit',sid)?Math.max(0,Number(x.cashPart)||0):0};
}
// ── 4 · provisions ──
function payProvisionFor(sid,e){const basic=Number(e.basic)||0,gross=payGrossFor(e,sid);const ceil=ptLim('payProvisions',7000,sid);
  return{bonus:gross<=21000?Math.round(Math.min(basic,ceil)*0.0833):0,gratuity:Math.round(basic*0.0481)};}
function payProvisionsTotal(sid,y,m){if(!ptOn('payProvisions',sid))return{bonus:0,gratuity:0};const E=getEmployeesForMonth(y,m,sid)||[];return E.reduce((t,e)=>{const p=payProvisionFor(sid,e);return{bonus:t.bonus+p.bonus,gratuity:t.gratuity+p.gratuity};},{bonus:0,gratuity:0});}

// ── Incentive adjustments: 11 team, 12 feedback, 13 clawback, 14 cap & floor ──
const PT_TEAM_MEMO={};
function ptTeamShares(sid,y,m){
  const ym=ptYm(y,m);const T=ptMonthGet(sid,ym,'_team');if(!ptOn('incTeam',sid)||!T||!(Number(T.target)>0)||!(Number(T.pool)>0))return null;
  const k=sid+'|'+ym;const memo=PT_TEAM_MEMO[k];if(memo&&Date.now()-memo.t<1500)return memo.v;
  let sales=0;try{const ds=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',sid))||'{}')||{};Object.keys(ds).forEach(d=>{if(d.startsWith(ym)){const v=ds[d]||{};sales+=[0,1,2,3,4].reduce((s,i)=>s+(Number(v[i])||0),0);}});}catch(e){}
  const hit=sales>=Number(T.target);const E=(getEmployeesForMonth(y,m,sid)||[]).filter(e=>e.desig!=='Helper'&&e.desig!=='Housekeeper');let att={};try{att=loadAttendance(sid);}catch(e){}
  const w=E.map(e=>{let d=1;if(T.by!=='equal'){try{d=Number(attSummaryFor(e,y,m,att[attMonthKey(e.id,y,m)]).totalDaysPayable)||0;}catch(x){d=0;}}return{id:e.id,w:d};});const tw=w.reduce((s,x)=>s+x.w,0);
  const shares={};if(hit&&tw>0)w.forEach(x=>{shares[x.id]=Math.round(Number(T.pool)*x.w/tw);});const v={sales,target:Number(T.target),pool:Number(T.pool),hit,shares};PT_TEAM_MEMO[k]={t:Date.now(),v};return v;
}
function ptBillsMonth(sid,ym){return typeof fdBills==='function'?fdBills(sid).filter(b=>b&&String(b.date||'').startsWith(ym)):[];}
function ptStaffOf(b,it){return String((it&&it.staffName)||b.staff||'').trim();}
function ptFeedback(sid,e,y,m){if(!ptOn('incFeedback',sid))return null;const L=ptBillsMonth(sid,ptYm(y,m)).filter(b=>Number(b.rating)>0&&b.status!=='Cancelled'&&(String(b.staff||'')===e.name||(b.items||[]).some(it=>it.staffName===e.name)));
  if(L.length<5)return{n:L.length,avg:null,cut:0};const avg=L.reduce((s,b)=>s+Number(b.rating),0)/L.length;return{n:L.length,avg:Math.round(avg*10)/10,cut:avg<3.5?ptLim('incFeedback',10,sid):0};}
function ptClawback(sid,e,y,m,svcRate,prodRate){
  if(!ptOn('incClawback',sid)||typeof fdBills!=='function')return{amount:0,lines:[]};const ym=ptYm(y,m);const B=fdBills(sid);const byId={};B.forEach(b=>{if(b)byId[b.id]=b;});const lines=[];
  B.forEach(b=>{if(!b)return;
    if(b.kind==='credit-note'&&String(b.date||'').startsWith(ym)){const o=byId[b.refBill];if(!o||String(o.date||'').startsWith(ym))return;
      (b.items||[]).forEach(it=>{if(ptStaffOf(o,it)!==e.name&&ptStaffOf(b,it)!==e.name)return;const amt=Math.abs((Number(it.rate)||0)*(Number(it.qty)||0));const r=it.type==='Product'?prodRate:svcRate;if(amt&&r)lines.push({bill:o.id,date:o.date,what:'Refund '+b.id+' — '+it.name,amount:Math.round(amt*r/100)});});}
    if(b.status==='Cancelled'&&b.cancelledAt&&String(b.cancelledAt).slice(0,7)===ym&&!String(b.date||'').startsWith(ym)){(b.items||[]).forEach(it=>{if(ptStaffOf(b,it)!==e.name)return;const amt=Math.abs((Number(it.rate)||0)*(Number(it.qty)||1));const r=it.type==='Product'?prodRate:svcRate;if(amt&&r)lines.push({bill:b.id,date:b.date,what:'Cancelled — '+it.name,amount:Math.round(amt*r/100)});});}});
  return{amount:lines.reduce((s,l)=>s+l.amount,0),lines};
}
function ptMonthsSinceJoin(e,y,m){const d=e&&e.doj?new Date(String(e.doj).slice(0,10)+'T00:00:00'):null;if(!d||isNaN(d))return 99;return(y-d.getFullYear())*12+(m-d.getMonth());}
// The incentive after the adjustments (called by incWorkingsForLive with the existing total).
function incAdjFor(sid,e,y,m,base,ctx){
  const team=(ptTeamShares(sid,y,m)||{shares:{}}).shares[e.id]||0;
  const fb=ptFeedback(sid,e,y,m);const fbCut=fb&&fb.cut?Math.round((Math.max(0,base)+team)*fb.cut/100):0;
  const cb=ptClawback(sid,e,y,m,Number(ctx.svcRate)||0,Number(ctx.prodRate)||0);
  let t=Math.max(0,base+team-fbCut-cb.amount);if(ptOn('incRoundTotal',sid))t=Math.round(t);let capped=0,floored=0;
  if(ptOn('incCap',sid)){const cap=Math.round((Number(ctx.salary)||0)*ptLim('incCap',100,sid)/100);if(cap>0&&t>cap){capped=t-cap;t=cap;}}
  if(ptOn('incFloor',sid)&&ptMonthsSinceJoin(e,y,m)<3){const fl=ptLim('incFloor',2000,sid);if(t<fl){floored=fl-t;t=fl;}}
  return{total:t,team,feedback:fbCut,fbAvg:fb&&fb.avg,clawback:cb.amount,clawLines:cb.lines,capped,floored,adj:t-Math.max(0,base)};
}

// ── 16 · maker-checker, 17 change log, 19 budget, 7 changes — gates on approval ──
function ptChecked(sid,y,m,kind,id){const C=(ptMonthGet(sid,ptYm(y,m),'_check')||{})[kind]||{};return C[String(id)]||null;}
function ptMarkChecked(sid,y,m,kind,ids,on){const ym=ptYm(y,m);const C=ptMonthGet(sid,ym,'_check')||{};const K=C[kind]={...(C[kind]||{})};ids.forEach(id=>{if(on)K[String(id)]={by:ptWho(),at:new Date().toISOString()};else delete K[String(id)];});ptMonthSet(sid,ym,'_check',C);}
function payApproveRowOk(sid,y,m,kind,id){
  if(!ptOn('payMakerChecker',sid))return true;const c=ptChecked(sid,y,m,kind,id);const me=ptWho();
  if(!c){window.alert('Maker-checker: this row has to be checked by someone first (🧰 Pay tools → Checking).');if(typeof controlHit==='function')controlHit('payMakerChecker',sid,'b');return false;}
  if(c.by&&c.by===me){window.alert('Maker-checker: you checked this row — a different person has to approve it.');if(typeof controlHit==='function')controlHit('payMakerChecker',sid,'b');return false;}
  return true;
}
function ptTotals(sid,y,m){let sw=[],iw=[];try{sw=swWorkingsFor(sid,y,m)||[];}catch(e){}try{iw=incWorkingsFor(sid,y,m)||[];}catch(e){}
  return{n:sw.length,gross:sw.reduce((s,w)=>s+(w.grossAfterLop||0),0),net:sw.reduce((s,w)=>s+(w.net||0),0),inc:iw.reduce((s,w)=>s+(w.totalInc||0),0),sw,iw};}
function ptChanges(sid,y,m){const p=m===0?[y-1,11]:[y,m-1];const cur=ptTotals(sid,y,m),prev=ptTotals(sid,p[0],p[1]);const lim=ptLim('payChangePreview',20,sid);const P={};prev.sw.forEach(w=>{P[w.id]=w;});
  const rows=cur.sw.map(w=>{const o=P[w.id];const pct=o&&o.net?Math.round(((w.net||0)-o.net)/o.net*100):null;const why=[];if(!o)why.push('new this month');else{if((o.totalDays||0)!==(w.totalDays||0))why.push('days '+o.totalDays+' → '+w.totalDays);if((o.gross||0)!==(w.gross||0))why.push('salary '+ptM(o.gross)+' → '+ptM(w.gross));if((o.advAdj||0)!==(w.advAdj||0))why.push('advance '+ptM(o.advAdj)+' → '+ptM(w.advAdj));if((o.extraEarn||0)!==(w.extraEarn||0)||(o.extraDed||0)!==(w.extraDed||0))why.push('other earnings / deductions');if((o.arrears||0)!==(w.arrears||0))why.push('arrears');}
    return{w,o,pct,flag:pct!=null&&Math.abs(pct)>lim,why:why.join('; ')};});return{rows,lim,cur,prev};}
function payApproveAllOk(sid,y,m,kind){
  const msgs=[];
  if(kind==='salary'&&ptOn('payChangePreview',sid)){const c=ptChanges(sid,y,m);const f=c.rows.filter(r=>r.flag);if(f.length)msgs.push(f.length+' employee(s) with net pay changed by more than '+c.lim+'% from last month: '+f.slice(0,6).map(r=>r.w.name+' ('+(r.pct>0?'+':'')+r.pct+'%)').join(', '));}
  if(kind==='incentive'&&typeof incTieOut==='function'&&ptOn('incTieOut',sid)){const ti=incTieOut(sid,y,m);if(ti.flag)msgs.push('Stylists’ sales '+ptM(ti.stylists)+' differ from the outlet’s '+ptM(ti.outlet)+' ('+ti.src+') by '+ti.pct+'%');}
  if(ptOn('payBudget',sid)){const b=ptLim('payBudget',0,sid);if(b>0){const t=ptTotals(sid,y,m);const tot=Math.round(t.net+t.inc);if(tot>b)msgs.push('Salary + incentive '+ptM(tot)+' is above the budget of '+ptM(b));}}
  if(ptOn('payMakerChecker',sid)){const ids=(kind==='salary'?(swWorkingsFor(sid,y,m)||[]):(incWorkingsFor(sid,y,m)||[])).map(w=>w.id);const me=ptWho();const bad=ids.filter(id=>{const c=ptChecked(sid,y,m,kind,id);return!c||c.by===me;});
    if(bad.length){window.alert('Maker-checker: '+bad.length+' row(s) are not checked yet, or were checked by you. A different person has to check each row before it is approved (🧰 Pay tools → Checking).');return false;}}
  if(!msgs.length)return true;return window.confirm('Please check before approving:\n\n• '+msgs.join('\n• ')+'\n\nApprove anyway?');
}
function payLogChange(sid,kind,y,m,empId,field,from,to){
  if(!ptOn('payChangeLog',sid)||String(from==null?'':from)===String(to==null?'':to))return;
  try{const k=outletKey('salonos_pay_changelog',sid);const L=JSON.parse(cachedLocalGet(k)||'[]')||[];L.push({at:new Date().toISOString(),by:ptWho(),kind,ym:ptYm(y,m),empId,field,from,to});safeLocalSet(k,JSON.stringify(L.slice(-3000)));}catch(e){}
}
function ptChangeLog(sid,ym,kind){try{return(JSON.parse(cachedLocalGet(outletKey('salonos_pay_changelog',sid))||'[]')||[]).filter(x=>(!ym||x.ym===ym)&&(!kind||x.kind===kind)).reverse();}catch(e){return[];}}

// ── 5 · leavers' full and final ──
function ptLeavers(sid,y,m){const ym=ptYm(y,m);return(getEmployeesForMonth(y,m,sid)||[]).filter(e=>e.dol&&String(e.dol).slice(0,7)===ym);}
function ptFnF(sid,e,y,m){let w=null,iw=null;try{w=(swWorkingsFor(sid,y,m)||[]).find(x=>x.id===e.id);}catch(x){}try{iw=(incWorkingsFor(sid,y,m)||[]).find(x=>x.id===e.id);}catch(x){}
  const adv=(typeof advLoadAll==='function'?advLoadAll(sid):(loadAdvances(sid)||[])).filter(a=>a.emp===e.name&&a.status==='Active').reduce((s,a)=>s+(Number(a.outstanding)||0),0);
  const advThisMonth=w?Number(w.advAdj)||0:0;const yrs=(()=>{const d=e.doj?new Date(String(e.doj).slice(0,10)+'T00:00:00'):null;const l=e.dol?new Date(String(e.dol).slice(0,10)+'T00:00:00'):new Date();return d&&!isNaN(d)?Math.floor((l-d)/(365.25*864e5)):0;})();
  const grat=yrs>=5?Math.round((Number(e.basic)||0)*15/26*yrs):0;
  return{w,iw,net:w?w.net:0,inc:iw?iw.totalInc:0,advLeft:Math.max(0,adv-advThisMonth),yrs,gratuity:grat,parts:w?w.payExtra:null};}

// ── 9 · live tracker ──
function ptTracker(sid){const n=new Date();const y=n.getFullYear(),m=n.getMonth();const dim=new Date(y,m+1,0).getDate();const left=Math.max(1,dim-n.getDate()+1);let W=[];try{W=incWorkingsFor(sid,y,m)||[];}catch(e){}
  return W.filter(w=>(Number(w.svcTarget)||0)>0).map(w=>{const sl=(typeof loadServiceSlabs==='function'?loadServiceSlabs(sid):[])||[];const next=sl.slice(1).map(t=>Number(t.threshold)).filter(t=>t*(w.salary||0)>(w.svcActual||0)).sort((a,b)=>a-b)[0];
    const need=Math.max(0,(w.svcTarget||0)-(w.svcActual||0));return{name:w.name,ach:w.svcActual||0,target:w.svcTarget||0,pct:w.svcTarget?Math.round((w.svcActual||0)/w.svcTarget*100):0,perDay:Math.ceil(need/left),nextSlab:next?{at:Math.round(next*(w.salary||0)),gap:Math.round(next*(w.salary||0)-(w.svcActual||0))}:null,inc:w.totalInc||0};}).sort((a,b)=>b.pct-a.pct);}
// ── 10 · simulator (service incentive on last month's sales) ──
function ptSimulate(sid,y,m,dMult,ratePct){let W=[];try{W=incWorkingsFor(sid,y,m)||[];}catch(e){}
  return W.map(w=>{const t2=Math.round((w.salary||0)*Math.max(0,(Number(w.svcTarget)&&w.salary?w.svcTarget/w.salary:0)+Number(dMult||0)));const r2=(Number(w.svcRateUsed)||0)*(1+Number(ratePct||0)/100);const s2=Math.round((w.svcActual||0)*r2/100);
    return{name:w.name,ach:w.svcActual||0,target:w.svcTarget||0,target2:t2,svc:w.svcIncAmt||0,svc2:(w.calcMode&&w.calcMode.svc==='manualAmt')?w.svcIncAmt||0:s2};});}
// ── 15 · product vs service mix ──
function ptMix(sid,y,m){const lim=ptLim('incMixCheck',40,sid);let W=[];try{W=incWorkingsFor(sid,y,m)||[];}catch(e){}return W.filter(w=>(w.prodActual||0)>5000&&(w.svcActual||0)>0&&(w.prodActual/w.svcActual*100)>lim).map(w=>({name:w.name,prod:w.prodActual,svc:w.svcActual,pct:Math.round(w.prodActual/w.svcActual*100)}));}
// ── 20 · yearly view ──
function ptYearRows(sid,empId,fyStart){const out=[];for(let i=0;i<12;i++){const d=new Date(fyStart,3+i,1);const y=d.getFullYear(),m=d.getMonth();if(d>new Date())break;let w=null,iw=null;try{w=(swWorkingsFor(sid,y,m)||[]).find(x=>String(x.id)===String(empId));}catch(e){}try{iw=(incWorkingsFor(sid,y,m)||[]).find(x=>String(x.id)===String(empId));}catch(e){}
  if(!w&&!iw)continue;out.push({ym:ptYm(y,m),days:w?w.totalDays:0,gross:w?w.grossAfterLop:0,ded:w?(w.pfEmp+w.esicEmp+w.ptAmt+w.tdsAmt+w.penAmt):0,adv:w?w.advAdj:0,extra:w?(w.extraEarn||0)-(w.extraDed||0)+(w.arrears||0):0,inc:iw?iw.totalInc:0,net:w?w.net:0});}return out;}
function ptPrint(title,head,rows){const esc=t=>String(t==null?'':t).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));const w=window.open('','_blank');if(!w){window.alert('Allow pop-ups to print.');return;}
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>body{font:12.5px Arial;margin:28px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:4px 6px;text-align:right}td:first-child,th:first-child{text-align:left}th{background:#eef3fa}</style></head><body><h2>'+esc(title)+'</h2><table><tr>'+head.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</table><script>setTimeout(()=>window.print(),300)<\/script></body></html>');w.document.close();}

// ═════════════ the 🧰 Pay tools bar ═════════════
function PayToolsBar({salon,year,month,kind,onChanged}){
  const h=React.createElement;const sid=salon&&salon.id;const {toast}=useToast();const [tab,setTab]=useState('');const [,t]=useState(0);const bump=()=>{t(x=>x+1);onChanged&&onChanged();};
  if(sid==null)return null;const ym=ptYm(year,month);const S=kind==='salary';
  const TABS=(S?[['extras','💼 Hold & extras','payHold|payOneOffs|payLeaveEncash|paySplit|payFnF'],['otlate','⏰ Overtime & late','payOvertime|payLateEarly'],['fnf','🚪 Leavers F&F','payFnF'],['prov','🏦 Provisions','payProvisions'],['changes','🔍 Changes','payChangePreview|payCompare']]
    :[['tracker','📈 Live tracker','incTracker'],['sim','🧪 Simulator','incSimulator'],['team','👥 Team incentive','incTeam'],['adj','⚖ Feedback & clawback','incFeedback|incClawback|incCap|incFloor'],['mix','🧴 Product mix','incMixCheck'],['changes','🔍 Compare months','payCompare']])
    .concat([['check','✔ Checking','payMakerChecker'],['log','🧾 Change log','payChangeLog'],['budget','🎯 Budget','payBudget'],['year','📅 Yearly view','payYearly']])
    .filter(x=>x[2].split('|').some(k=>ptOn(k,sid)));
  if(!TABS.length)return null;
  const E=(S?(swWorkingsFor(sid,year,month)||[]):(incWorkingsFor(sid,year,month)||[]));const empOpt=h('option',{value:''},'— Choose employee —');
  const box=(...k)=>h('div',{style:{marginTop:10}},...k);const small=(t2)=>h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:4}},t2);
  const tbl=(head,rows)=>h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,head.map((x,i)=>h('th',{key:i,style:i?{textAlign:'right'}:null},x)))),h('tbody',null,rows.map((r,i)=>h('tr',{key:i},r.map((c,j)=>h('td',{key:j,style:j?{textAlign:'right'}:null},c)))))));
  const budget=ptOn('payBudget',sid)?ptLim('payBudget',0,sid):0;const tot=budget>0?ptTotals(sid,year,month):null;const over=tot&&(tot.net+tot.inc)>budget;
  return h('div',{className:'card',style:{marginBottom:12}},
    h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}},h('b',{style:{marginRight:6}},'🧰 Pay tools'),TABS.map(([k,l])=>h('button',{key:k,className:'btn btn-sm '+(tab===k?'btn-primary':'btn-ghost'),onClick:()=>setTab(tab===k?'':k)},l)),
      over&&h('span',{style:{fontSize:12,color:'var(--red)',fontWeight:600}},'⚠ Over budget: '+ptM(tot.net+tot.inc)+' of '+ptM(budget))),
    tab==='extras'&&h(PtExtras,{sid,year,month,E,bump}),
    tab==='otlate'&&h(PtOtLate,{sid,year,month,E,bump}),
    tab==='fnf'&&box((()=>{const L=ptLeavers(sid,year,month);if(!L.length)return h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'Nobody has a leaving date in '+PT_MON[month]+' '+year+'.');
      return h('div',null,L.map(e=>{const f=ptFnF(sid,e,year,month);const x=ptGet(sid,ym,e.id);const rows=[['Net salary (incl. encashment, notice shortfall, extras)',ptM(f.net)],['Incentive',ptM(f.inc)],['Advance still due after this month',f.advLeft?'− '+ptM(f.advLeft):'—'],['Gratuity ('+f.yrs+' yrs; 5+ years)',f.gratuity?ptM(f.gratuity):'—'],['Total full and final',ptM(f.net+f.inc-f.advLeft+f.gratuity)]];
        return h('div',{key:e.id,style:{borderTop:'1px solid var(--border)',padding:'8px 0'}},h('b',null,e.name+' — leaving '+String(e.dol).split('-').reverse().join('/')),
          h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',margin:'6px 0',fontSize:12.5}},'Leave encashment days',h('input',{type:'number',min:0,className:'form-control',style:{width:80,padding:'3px 6px'},defaultValue:x.encashDays||'',onBlur:ev=>{ptSet(sid,ym,e.id,{encashDays:Number(ev.target.value)||0});bump();}}),
            'Notice shortfall days',h('input',{type:'number',min:0,className:'form-control',style:{width:80,padding:'3px 6px'},defaultValue:x.noticeDays||'',onBlur:ev=>{ptSet(sid,ym,e.id,{noticeDays:Number(ev.target.value)||0});bump();}})),
          tbl(['Full and final',''],rows),h('button',{className:'btn btn-ghost btn-sm',style:{marginTop:4},onClick:()=>ptPrint('Full and final — '+e.name,['Item','Amount'],rows)},'🖨 Print'));}),
        small('Encashment = basic ÷ days in month × days; notice shortfall = salary ÷ days × days. An advance still due after this month can be recovered or written off on the Advances screen.'));})()),
    tab==='prov'&&box((()=>{const L=(getEmployeesForMonth(year,month,sid)||[]).map(e=>({e,p:payProvisionFor(sid,e)}));const b=L.reduce((s,x)=>s+x.p.bonus,0),g=L.reduce((s,x)=>s+x.p.gratuity,0);
      return h('div',null,tbl(['Employee','Statutory bonus 8.33%','Gratuity 4.81%'],[...L.map(x=>[x.e.name,ptM(x.p.bonus),ptM(x.p.gratuity)]),[h('b',null,'Total'),h('b',null,ptM(b)),h('b',null,ptM(g))]]),
        small('Bonus: 8.33% of basic up to '+ptM(ptLim('payProvisions',7000,sid))+' for salary up to ₹21,000. Gratuity: 15/26 of a month’s basic a year = 4.81% a month. Both are shown in the P&L as provisions.'));})()),
    tab==='changes'&&box((()=>{const c=ptChanges(sid,year,month);const ly=ptTotals(sid,year-1,month);const row=(l,a,b2,c2)=>[l,a,b2,c2];
      return h('div',null,tbl(['','This month','Last month','Same month last year'],[row('Employees',c.cur.n,c.prev.n,ly.n),row('Gross',ptM(c.cur.gross),ptM(c.prev.gross),ptM(ly.gross)),row('Net salary',ptM(c.cur.net),ptM(c.prev.net),ptM(ly.net)),row('Incentive',ptM(c.cur.inc),ptM(c.prev.inc),ptM(ly.inc))]),
        S&&h('div',{style:{marginTop:8}},tbl(['Employee','Net now','Last month','Change','What changed'],c.rows.filter(r=>r.flag||!r.o).map(r=>[r.w.name,ptM(r.w.net),r.o?ptM(r.o.net):'—',r.pct==null?'new':h('span',{style:{color:'var(--red)',fontWeight:700}},(r.pct>0?'+':'')+r.pct+'%'),r.why])),small('Listed: net pay changed by more than '+c.lim+'%, and new employees. “Approve all” asks first when any are listed.')));})()),
    tab==='tracker'&&box((()=>{const L=ptTracker(sid);if(!L.length)return h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No service targets this month.');
      const wa=()=>{const ph=typeof waNumber==='function'?waNumber((typeof outletSettings==='function'?outletSettings(sid):{}).ownerPhone||''):'';window.open('https://wa.me/'+(ph||'')+'?text='+encodeURIComponent('📈 Targets so far — '+String(salon.name||'').split('—')[0]+'\n'+L.map(r=>r.name+': '+r.pct+'% ('+ptM(r.ach)+' of '+ptM(r.target)+')'+(r.perDay?' · needs '+ptM(r.perDay)+'/day':' ✓')).join('\n')),'_blank','noopener');};
      return h('div',null,tbl(['Stylist','Service so far','Target','%','Needed a day','Next slab'],L.map(r=>[r.name,ptM(r.ach),ptM(r.target),r.pct+'%',r.perDay?ptM(r.perDay):'✓',r.nextSlab?ptM(r.nextSlab.gap)+' more':'—'])),h('button',{className:'btn btn-ghost btn-sm',style:{marginTop:6},onClick:wa},'📲 WhatsApp to manager'),small('This month so far. Staff see their own progress on the phone screen (💰 My incentive).'));})()),
    tab==='sim'&&h(PtSim,{sid,year,month}),
    tab==='team'&&h(PtTeam,{sid,year,month,bump}),
    tab==='adj'&&box((()=>{const W=incWorkingsFor(sid,year,month)||[];const rows=W.filter(w=>w.incAdj&&(w.incAdj.team||w.incAdj.feedback||w.incAdj.clawback||w.incAdj.capped||w.incAdj.floored));
      return h('div',null,rows.length?tbl(['Stylist','Team','Feedback','Clawback','Capped','Floor top-up','Total incentive'],rows.map(w=>[w.name,ptM(w.incAdj.team),w.incAdj.feedback?'− '+ptM(w.incAdj.feedback)+' (avg '+w.incAdj.fbAvg+'★)':'—',w.incAdj.clawback?'− '+ptM(w.incAdj.clawback):'—',w.incAdj.capped?'− '+ptM(w.incAdj.capped):'—',w.incAdj.floored?'+ '+ptM(w.incAdj.floored):'—',ptM(w.totalInc)])):h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No adjustments this month.'),
        rows.some(w=>w.incAdj.clawLines&&w.incAdj.clawLines.length)&&h('div',{style:{marginTop:6,fontSize:12}},rows.flatMap(w=>(w.incAdj.clawLines||[]).map((l,i)=>h('div',{key:w.id+i},w.name+': '+l.what+' (bill '+l.bill+', '+String(l.date).split('-').reverse().join('/')+') − '+ptM(l.amount))))),
        small('Feedback: incentive reduced by '+ptLim('incFeedback',10,sid)+'% when the average client rating is below 3.5★ (5+ ratings). Clawback: incentive on bills refunded or cancelled this month that were billed in an earlier month. Cap: '+ptLim('incCap',100,sid)+'% of salary. Floor for the first 3 months: '+ptM(ptLim('incFloor',2000,sid))+'.'));})()),
    tab==='mix'&&box((()=>{const L=ptMix(sid,year,month);return L.length?h('div',null,tbl(['Stylist','Product','Service','Product ÷ service'],L.map(r=>[r.name,ptM(r.prod),ptM(r.svc),h('span',{style:{color:'var(--red)',fontWeight:700}},r.pct+'%')])),small('Product sale above '+ptLim('incMixCheck',40,sid)+'% of service sale (and over ₹5,000) — check the bills before approving.')):h('div',{style:{fontSize:12.5,color:'var(--green)'}},'✓ Nothing unusual.');})()),
    tab==='check'&&box((()=>{const me=ptWho();return h('div',null,h('div',{style:{display:'flex',gap:6,marginBottom:6}},h('button',{className:'btn btn-primary btn-sm',onClick:()=>{ptMarkChecked(sid,year,month,kind,E.map(w=>w.id),true);bump();toast('All rows marked checked by you','success');}},'✔ Check all'),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{ptMarkChecked(sid,year,month,kind,E.map(w=>w.id),false);bump();}},'Clear')),
      tbl(['Employee',S?'Net':'Incentive','Checked by',''],E.map(w=>{const c=ptChecked(sid,year,month,kind,w.id);return[w.name,ptM(S?w.net:w.totalInc),c?c.by+' · '+new Date(c.at).toLocaleString('en-GB',DMY_DT):'—',h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{ptMarkChecked(sid,year,month,kind,[w.id],!c);bump();}},c?'Undo':'✔ Check')];})),
      small(ptOn('payMakerChecker',sid)?'Approval needs each row checked by someone other than the person approving ('+(me||'you')+' can’t approve rows you checked).':'Maker-checker is off — checking is for information only.'));})()),
    tab==='log'&&box((()=>{const L=ptChangeLog(sid,ym,kind).slice(0,200);const nm={};E.forEach(w=>{nm[w.id]=w.name;});return L.length?tbl(['When','Who','Employee','Field','From','To'],L.map(x=>[new Date(x.at).toLocaleString('en-GB',DMY_DT),x.by,nm[x.empId]||x.empId,x.field,String(x.from==null?'':x.from),String(x.to==null?'':x.to)])):h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No changes recorded for '+PT_MON[month]+' '+year+' yet.');})()),
    tab==='budget'&&box((()=>{const T=ptTotals(sid,year,month);const sum=Math.round(T.net+T.inc);return h('div',{style:{fontSize:13}},'Salary (net) '+ptM(T.net)+' + incentive '+ptM(T.inc)+' = ',h('b',null,ptM(sum)),budget>0?h('span',{style:{color:sum>budget?'var(--red)':'var(--green)',fontWeight:700}},' · budget '+ptM(budget)+(sum>budget?' — over by '+ptM(sum-budget):' — within')):' · no budget set',small('Set the monthly budget (all outlets or outlet-wise) in Controls → Salary & staff → Salary and incentive budget. “Approve all” asks first when it is over.'));})()),
    tab==='year'&&h(PtYear,{sid,year,month}));
}
function PtExtras({sid,year,month,E,bump}){
  const h=React.createElement;const {toast}=useToast();const ym=ptYm(year,month);const [id,setId]=useState('');const [ob,setOb]=useState({type:'Festival bonus',amount:'',note:''});const e=E.find(w=>String(w.id)===String(id));const x=e?ptGet(sid,ym,e.id):{};
  const held=E.filter(w=>w.hold);
  return h('div',{style:{marginTop:10}},held.length>0&&h('div',{style:{fontSize:12.5,color:'var(--red)',marginBottom:6}},'⏸ On hold: '+held.map(w=>w.name+' ('+w.hold.reason+')').join(', ')),
    h('select',{className:'form-control',style:{width:'auto',marginBottom:8},value:id,onChange:ev=>setId(ev.target.value)},h('option',{value:''},'— Choose employee —'),E.map(w=>h('option',{key:w.id,value:w.id},w.name+(w.hold?' ⏸':'')))),
    e&&h('div',{style:{display:'grid',gap:8}},
      ptOn('payHold',sid)&&h('div',{style:{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}},h('b',{style:{fontSize:13,width:150}},'⏸ Salary hold'),
        x.hold&&x.hold.on?h(React.Fragment,null,h('span',{style:{fontSize:12.5,color:'var(--red)'}},'On hold — '+x.hold.reason+' ('+x.hold.by+')'),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{ptSet(sid,ym,e.id,{hold:{on:false,releasedBy:ptWho(),releasedAt:new Date().toISOString(),reason:x.hold.reason}});try{logAuditEvent(sid,{entity:'Salary',entityId:e.id,action:'Hold released',summary:e.name+' '+ym});}catch(z){}bump();}},'Release'))
          :h('button',{className:'btn btn-ghost btn-sm',onClick:()=>{const r=window.prompt('Reason for holding '+e.name+'’s salary (absconding, documents pending, notice …):','');if(!r||!r.trim())return;ptSet(sid,ym,e.id,{hold:{on:true,reason:r.trim(),by:ptWho(),at:new Date().toISOString()}});try{logAuditEvent(sid,{entity:'Salary',entityId:e.id,action:'Salary on hold',summary:e.name+' '+ym+' — '+r.trim()});}catch(z){}bump();}},'Hold this month’s salary')),
      ptOn('payOneOffs',sid)&&h('div',null,h('b',{style:{fontSize:13}},'➕ Bonus / one-off earnings'),(x.oneOffs||[]).map((b,i)=>h('div',{key:i,style:{fontSize:12.5,display:'flex',gap:8,alignItems:'center'}},b.type+' '+ptM(b.amount)+(b.note?' — '+b.note:''),h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>{ptSet(sid,ym,e.id,{oneOffs:(x.oneOffs||[]).filter((_,j)=>j!==i)});bump();}},'Remove'))),
        h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}},h('select',{className:'form-control',style:{width:'auto',padding:'3px 6px'},value:ob.type,onChange:ev=>setOb({...ob,type:ev.target.value})},['Festival bonus','Referral bonus','Performance bonus','Reimbursement','Other'].map(o=>h('option',{key:o},o))),
          h('input',{type:'number',className:'form-control',style:{width:110,padding:'3px 6px'},placeholder:'₹',value:ob.amount,onChange:ev=>setOb({...ob,amount:ev.target.value})}),h('input',{className:'form-control',style:{width:180,padding:'3px 6px'},placeholder:'Note',value:ob.note,onChange:ev=>setOb({...ob,note:ev.target.value})}),
          h('button',{className:'btn btn-primary btn-sm',onClick:()=>{const a=Math.round(Number(ob.amount)||0);if(!a){toast('Enter the amount','error');return;}ptSet(sid,ym,e.id,{oneOffs:[...(x.oneOffs||[]),{type:ob.type,amount:a,note:ob.note.trim(),by:ptWho(),at:new Date().toISOString()}]});setOb({...ob,amount:'',note:''});bump();}},'Add'))),
      ptOn('payLeaveEncash',sid)&&h('div',{style:{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}},h('b',{style:{fontSize:13,width:150}},'🌴 Leave encashment'),h('input',{type:'number',min:0,className:'form-control',style:{width:90,padding:'3px 6px'},defaultValue:x.encashDays||'',placeholder:'days',onBlur:ev=>{ptSet(sid,ym,e.id,{encashDays:Number(ev.target.value)||0});bump();}}),h('span',{style:{fontSize:12,color:'var(--text3)'}},'days × basic ÷ days in month')),
      ptOn('paySplit',sid)&&h('div',{style:{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}},h('b',{style:{fontSize:13,width:150}},'💵 Paid in cash'),h('input',{type:'number',min:0,className:'form-control',style:{width:110,padding:'3px 6px'},defaultValue:x.cashPart||'',placeholder:'₹ in cash',onBlur:ev=>{ptSet(sid,ym,e.id,{cashPart:Number(ev.target.value)||0});bump();}}),h('span',{style:{fontSize:12,color:'var(--text3)'}},'the rest goes in the bank list (Salary Payment)')),
      e.payExtra&&h('div',{style:{fontSize:12,color:'var(--text2)'}},'This month: other earnings '+ptM(e.extraEarn)+' (bonus '+ptM(e.payExtra.parts.bonus)+', overtime '+ptM(e.payExtra.parts.ot)+', encashment '+ptM(e.payExtra.parts.encash)+') · other deductions '+ptM(e.extraDed)+' (late / early '+ptM(e.payExtra.parts.late)+', notice '+ptM(e.payExtra.parts.notice)+') · net '+ptM(e.net))));
}
function PtOtLate({sid,year,month,E,bump}){
  const h=React.createElement;const [s,setS]=useState(()=>ptSettings(sid));const rows=E.map(w=>({w,o:ptOtLate(sid,w,year,month)})).filter(r=>r.o.days);
  const save=()=>{ptSaveSettings(sid,s);bump();};const fmtMin=n=>n?Math.floor(n/60)+'h '+(n%60)+'m':'—';
  return h('div',{style:{marginTop:10}},
    h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',fontSize:12.5,marginBottom:8}},'Usual shift',h('input',{type:'time',className:'form-control',style:{width:'auto',padding:'3px 6px'},value:s.shiftFrom,onChange:e=>setS({...s,shiftFrom:e.target.value})}),'to',h('input',{type:'time',className:'form-control',style:{width:'auto',padding:'3px 6px'},value:s.shiftTo,onChange:e=>setS({...s,shiftTo:e.target.value})}),
      'Overtime pay ×',h('input',{type:'number',step:'0.25',min:0,className:'form-control',style:{width:70,padding:'3px 6px'},value:s.otMult,onChange:e=>setS({...s,otMult:e.target.value})}),'Late / early cap (days’ pay a month)',h('input',{type:'number',min:0,className:'form-control',style:{width:70,padding:'3px 6px'},value:s.lateCapDays,onChange:e=>setS({...s,lateCapDays:e.target.value})}),h('button',{className:'btn btn-primary btn-sm',onClick:save},'Save')),
    rows.length?h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Employee','Days checked in','Overtime','Overtime pay','Late / early','Deduction'].map((x,i)=>h('th',{key:i,style:i?{textAlign:'right'}:null},x)))),
      h('tbody',null,rows.map(r=>h('tr',{key:r.w.id},h('td',null,r.w.name),h('td',{style:{textAlign:'right'}},r.o.days),h('td',{style:{textAlign:'right'}},fmtMin(r.o.otMin)),h('td',{style:{textAlign:'right',color:'var(--green)'}},r.o.ot?ptM(r.o.ot):'—'),h('td',{style:{textAlign:'right'}},fmtMin(r.o.lateMin)),h('td',{style:{textAlign:'right',color:'var(--red)'}},r.o.late?'− '+ptM(r.o.late):'—')))))):h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No phone check-ins this month (Attendance → 📲 Staff phone screen).'),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:4}},'From phone check-in / check-out times. A staff member’s own working hours (Front desk → staff hours) are used when set, otherwise the usual shift. Overtime counts from '+ptLim('payOvertime',1,sid)+' hour(s) past the shift end; late / early allows '+ptLim('payLateEarly',15,sid)+' minutes’ grace. Pay per minute = salary ÷ days ÷ shift minutes.'));
}
function PtSim({sid,year,month}){
  const h=React.createElement;const p=month===0?[year-1,11]:[year,month-1];const [d,setD]=useState('0');const [r,setR]=useState('0');const L=ptSimulate(sid,p[0],p[1],d,r);const a=L.reduce((s,x)=>s+x.svc,0),b=L.reduce((s,x)=>s+x.svc2,0);
  return h('div',{style:{marginTop:10}},h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',fontSize:12.5,marginBottom:8}},'On '+PT_MON[p[1]]+' '+p[0]+' sales — service target ×salary change',h('input',{type:'number',step:'0.25',className:'form-control',style:{width:80,padding:'3px 6px'},value:d,onChange:e=>setD(e.target.value)}),'rates change %',h('input',{type:'number',className:'form-control',style:{width:80,padding:'3px 6px'},value:r,onChange:e=>setR(e.target.value)})),
    h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Stylist','Service sale','Target now','Target tried','Service incentive now','With the change'].map((x,i)=>h('th',{key:i,style:i?{textAlign:'right'}:null},x)))),
      h('tbody',null,L.map((x,i)=>h('tr',{key:i},h('td',null,x.name),...[x.ach,x.target,x.target2,x.svc,x.svc2].map((v,j)=>h('td',{key:j,style:{textAlign:'right',fontWeight:j===4?700:400}},ptM(v))))),h('tr',null,h('td',null,h('b',null,'Total')),h('td',null),h('td',null),h('td',null),h('td',{style:{textAlign:'right',fontWeight:700}},ptM(a)),h('td',{style:{textAlign:'right',fontWeight:700,color:b>a?'var(--red)':'var(--green)'}},ptM(b)+' ('+(b-a>=0?'+':'')+ptM(b-a)+')'))))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:4}},'Service incentive only, worked on last month’s actual sales with each stylist’s rate changed by the %. Nothing is saved — change the rules in Incentive Rules when happy.'));
}
function PtTeam({sid,year,month,bump}){
  const h=React.createElement;const ym=ptYm(year,month);const cur=ptMonthGet(sid,ym,'_team')||{};const [f,setF]=useState({target:cur.target||'',pool:cur.pool||'',by:cur.by||'days'});const T=ptTeamShares(sid,year,month);
  return h('div',{style:{marginTop:10}},h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',fontSize:12.5}},'Outlet sales target for '+PT_MON[month]+' ₹',h('input',{type:'number',className:'form-control',style:{width:130,padding:'3px 6px'},value:f.target,onChange:e=>setF({...f,target:e.target.value})}),
      'Team pool ₹',h('input',{type:'number',className:'form-control',style:{width:110,padding:'3px 6px'},value:f.pool,onChange:e=>setF({...f,pool:e.target.value})}),h('select',{className:'form-control',style:{width:'auto',padding:'3px 6px'},value:f.by,onChange:e=>setF({...f,by:e.target.value})},h('option',{value:'days'},'Shared by days worked'),h('option',{value:'equal'},'Shared equally')),
      h('button',{className:'btn btn-primary btn-sm',onClick:()=>{ptMonthSet(sid,ym,'_team',{target:Number(f.target)||0,pool:Number(f.pool)||0,by:f.by,by_:ptWho()});bump();}},'Save')),
    T&&h('div',{style:{fontSize:13,marginTop:8}},'Sales so far '+ptM(T.sales)+' of '+ptM(T.target)+' — ',h('b',{style:{color:T.hit?'var(--green)':'var(--orange,#c27711)'}},T.hit?'target reached: '+ptM(T.pool)+' shared':'not reached yet')),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:4}},'Sales = Daily Sales total (cash, card, UPI, Luzo, outstanding) for the month. The share is added to each person’s total on Incentive Working.'));
}
function PtYear({sid,year,month}){
  const h=React.createElement;const fy=month>=3?year:year-1;const E=getEmployeesForMonth(year,month,sid)||[];const [id,setId]=useState('');const e=E.find(x=>String(x.id)===String(id));const rows=e?ptYearRows(sid,e.id,fy):[];
  const head=['Month','Days','Gross','PF/ESIC/PT/TDS/Penalty','Advance','Other / arrears','Incentive','Net salary'];const body=rows.map(r=>[PT_MON[+r.ym.slice(5)-1].slice(0,3)+' '+r.ym.slice(0,4),r.days,ptM(r.gross),ptM(r.ded),ptM(r.adv),ptM(r.extra),ptM(r.inc),ptM(r.net)]);
  const tot=k=>rows.reduce((s,r)=>s+(Number(r[k])||0),0);
  return h('div',{style:{marginTop:10}},h('select',{className:'form-control',style:{width:'auto',marginBottom:8},value:id,onChange:ev=>setId(ev.target.value)},h('option',{value:''},'— Choose employee —'),E.map(x=>h('option',{key:x.id,value:x.id},x.name))),
    e&&h('div',null,h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,head.map((x,i)=>h('th',{key:i,style:i?{textAlign:'right'}:null},x)))),h('tbody',null,body.map((r,i)=>h('tr',{key:i},r.map((c,j)=>h('td',{key:j,style:j?{textAlign:'right'}:null},c)))),
      h('tr',null,h('td',null,h('b',null,'FY '+fy+'-'+String(fy+1).slice(2))),h('td',null),...['gross','ded','adv','extra','inc','net'].map(k=>h('td',{key:k,style:{textAlign:'right',fontWeight:700}},ptM(tot(k)))))))),
      h('button',{className:'btn btn-ghost btn-sm',style:{marginTop:6},onClick:()=>ptPrint(e.name+' — FY '+fy+'-'+String(fy+1).slice(2),head,[...body,['Total','',ptM(tot('gross')),ptM(tot('ded')),ptM(tot('adv')),ptM(tot('extra')),ptM(tot('inc')),ptM(tot('net'))]])},'🖨 PDF')));
}
