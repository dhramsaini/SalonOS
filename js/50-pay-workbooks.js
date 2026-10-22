// ═════════════════════════════════════════════════════════════════════════════════════════════
// Salary Working & Incentive Working — full workings in Excel (Controls → payWorkbooks and the
// payWb* switches). Every figure the app works out by a formula is a live Excel formula pointing
// at the data it came from, in the same workbook. Blue = data from SalonOS, black = formula, and a
// Check column on each row compares the formula's answer with the app's own figure.
//   Core: Salary Working, Attendance, Pay Rules, Advances, Penalties, Inc Working, Sales, Inc Rules,
//         Mem Pool (membership rule A/B/C) — pools and week-offs as formulas (payWbPools).
//   Extras (each its own switch): Payslips, Bank Transfer, PF ESIC PT, vs Last Month, Year to Date,
//         Cost to Company, Exceptions, Reconciliation, Approval Trail.
//   Also: what-if columns, a change check + download code, chooser, all outlets, email, protected copy.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const PW_BLUE={argb:'FF1F4E99'};
const PW_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const PW_ATT_CODE={present:'P',off:'WO',holiday:'H',half:'HD',absent:'A',notjoined:'NJ',left:'L'};
const PW_EXTRAS=[
  {key:'slip',label:'Payslips',ctl:'payWbPayslips',kinds:['salary']},{key:'bank',label:'Bank transfer list',ctl:'payWbBank',kinds:['salary']},
  {key:'stat',label:'PF / ESIC / PT challans',ctl:'payWbStatutory',kinds:['salary']},{key:'prev',label:'Compared with last month',ctl:'payWbCompare',kinds:['salary','incentive']},
  {key:'ytd',label:'Year to date',ctl:'payWbCompare',kinds:['salary','incentive']},{key:'ctc',label:'Cost to company',ctl:'payWbCtc',kinds:['salary']},
  {key:'exc',label:'Exceptions to look at',ctl:'payWbExceptions',kinds:['salary','incentive']},{key:'reco',label:'Reconciliation (paid, P&L)',ctl:'payWbReco',kinds:['salary','incentive']},
  {key:'trail',label:'Approval trail',ctl:'payWbTrail',kinds:['salary','incentive']}];
function pwRef(sheet){return "'"+String(sheet).replace(/'/g,"''")+"'!";}
function pwF(formula,result){return result===undefined||result===null||(typeof result==='number'&&!isFinite(result))?{formula}:{formula,result};}
function pwHeader(row){row.eachCell(c=>{c.fill=EXCEL_HEADER_FILL;c.font=EXCEL_HEADER_FONT;c.border=EXCEL_THIN_BORDER;c.alignment={vertical:'middle',horizontal:'center',wrapText:true};});row.height=32;}
function pwSerial(v){const iso=typeof toISO==='function'?(toISO(v)||v):v;const mm=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/);if(!mm)return null;return Math.round((Date.UTC(+mm[1],+mm[2]-1,+mm[3])-Date.UTC(1899,11,30))/864e5);}
function pwTitle(ws,text){const c=ws.getRow(1).getCell(1);c.value=text;c.font={bold:true,size:12,color:{argb:'FF14335E'}};}
// cols: [{key,h,w,input,fmt,open}] — header at startRow, rows below; returns {L, first, last, totalRow}
function pwTable(ws,startRow,cols,rows,opts){
  opts=opts||{};const idx={};cols.forEach((c,i)=>idx[c.key]=i+1);const L=k=>excelColLetter(idx[k]);
  const hr=ws.getRow(startRow);cols.forEach((c,i)=>{hr.getCell(i+1).value=c.h;});pwHeader(hr);
  rows.forEach((obj,ri)=>{const rn=startRow+1+ri;const r=ws.getRow(rn);cols.forEach((c,i)=>{const cell=r.getCell(i+1);let v=typeof obj[c.key]==='function'?obj[c.key](rn,L):obj[c.key];if(v===undefined)v=null;cell.value=v;cell.border=EXCEL_THIN_BORDER;
    if(c.input)cell.font={color:PW_BLUE};if(c.open){cell.protection={locked:false};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF7D6'}};}
    if(c.fmt)cell.numFmt=c.fmt;else if(typeof v==='number'||(v&&v.formula))cell.numFmt='#,##0';if(!c.open&&ri%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF7F9FC'}};});});
  const first=startRow+1,last=startRow+rows.length;let totalRow=null;
  if(opts.total){totalRow=last+1;const tr=ws.getRow(totalRow);cols.forEach((c,i)=>{const cell=tr.getCell(i+1);if(i===0)cell.value='TOTAL';else if(opts.total.includes(c.key))cell.value=rows.length?{formula:'SUM('+L(c.key)+first+':'+L(c.key)+last+')'}:0;
    cell.font={bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEEF3FA'}};cell.border={...EXCEL_THIN_BORDER,top:{style:'medium',color:{argb:'FF14335E'}}};cell.numFmt=c.fmt||'#,##0';});}
  cols.forEach((c,i)=>{ws.getColumn(i+1).width=c.w||12;});
  if(!opts.noFreeze)ws.views=[{state:'frozen',xSplit:opts.xSplit!=null?opts.xSplit:2,ySplit:startRow}];
  return{L,first,last,totalRow,col:k=>idx[k]};
}
function pwRules(ws,startRow,title,items){
  const t=ws.getRow(startRow);t.getCell(1).value=title;t.getCell(1).font={bold:true,size:12,color:{argb:'FF14335E'}};const refs={};
  items.forEach((it,i)=>{const r=ws.getRow(startRow+1+i);r.getCell(1).value=it[1];const c=r.getCell(2);c.value=it[2];c.font={color:PW_BLUE,bold:true};c.border=EXCEL_THIN_BORDER;if(it[3])c.numFmt=it[3];if(it[4]){r.getCell(3).value=it[4];r.getCell(3).font={italic:true,color:{argb:'FF6B7385'}};}
    refs[it[0]]=pwRef(ws.name)+'$B$'+(startRow+1+i);refs[it[0]+'_cell']=c;});
  ws.getColumn(1).width=Math.max(ws.getColumn(1).width||0,44);ws.getColumn(2).width=Math.max(ws.getColumn(2).width||0,16);ws.getColumn(3).width=Math.max(ws.getColumn(3).width||0,60);
  return{refs,next:startRow+items.length+2};
}
function pwCheck(fRef,appRef){return pwF('IF(ROUND('+fRef+',0)=ROUND('+appRef+',0),"✓","Differs by "&TEXT('+fRef+'-'+appRef+',"#,##0"))');}
function pwSumRange(sheet,T,k){return pwRef(sheet)+'$'+T.L(k)+'$'+T.first+':$'+T.L(k)+'$'+Math.max(T.first,T.last);}

// ── Advances & Penalties ledgers ──
function pwAdvances(ws,sid,y,m){
  let list=[];try{list=JSON.parse(cachedLocalGet(outletKey('salonos_advances',sid))||'[]');}catch(e){}
  const rows=list.filter(a=>a&&a.status==='Active').map(a=>{const sch=scheduledAmountFor(a,y,m);const planned=sch!==null?sch:(Number(a.repayment)||0);
    return{emp:a.emp,from:a.deductFrom||'Salary',date:pwSerial(a.date),amount:Number(a.amount)||0,outstanding:Number(a.outstanding)||0,basis:sch!==null?'Month-wise schedule':'Monthly repayment',planned,
      ded:(r,L)=>pwF('MAX(0,MIN('+L('planned')+r+','+L('outstanding')+r+'))',Math.max(0,Math.min(planned,Number(a.outstanding)||0)))};});
  pwTitle(ws,'Active advances — this month\'s deduction is the planned amount, never more than what is still outstanding');
  const T=pwTable(ws,2,[{key:'emp',h:'Employee',w:24,input:true},{key:'from',h:'Recover from',w:12,input:true},{key:'date',h:'Date given',w:12,input:true,fmt:'dd/mm/yyyy'},{key:'amount',h:'Amount given',input:true},
    {key:'outstanding',h:'Outstanding',input:true},{key:'basis',h:'Planned from',w:20,input:true},{key:'planned',h:'Planned this month',input:true},{key:'ded',h:'Deduction this month'}],rows,{total:['amount','outstanding','planned','ded'],xSplit:1});
  return{emp:pwSumRange(ws.name,T,'emp'),from:pwSumRange(ws.name,T,'from'),ded:pwSumRange(ws.name,T,'ded')};
}
function pwPenalties(ws,sid,y,m){
  let list=[];try{list=JSON.parse(cachedLocalGet(outletKey('salonos_penalties',sid))||'[]');}catch(e){}
  const rows=list.filter(p=>p&&p.emp&&p.date).filter(p=>{const d=new Date(p.date+'T00:00:00');return!isNaN(d)&&d.getFullYear()===y&&d.getMonth()===m;})
    .sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(p=>({date:pwSerial(p.date),emp:p.emp,type:p.type==='Other'?(p.otherType||'Other'):(p.type||''),amount:Number(p.amount)||0}));
  pwTitle(ws,'Penalties dated in '+PW_MONTHS[m]+' '+y);
  const T=pwTable(ws,2,[{key:'date',h:'Date',w:12,input:true,fmt:'dd/mm/yyyy'},{key:'emp',h:'Employee',w:24,input:true},{key:'type',h:'Type',w:22,input:true},{key:'amount',h:'Amount',input:true}],rows,{total:['amount'],xSplit:1});
  return{emp:pwSumRange(ws.name,T,'emp'),amt:pwSumRange(ws.name,T,'amount')};
}

// ── Incentive: Inc Rules (+ manager pool), Sales, Mem Pool, Inc Working ──
function pwIncentive(sid,y,m,S,o){
  const run=fn=>typeof withIncPlan==='function'?withIncPlan(sid,y,m,fn):fn();
  return run(()=>{
    const W=incWorkingsForLive(sid,y,m);const appl=loadIncentiveApplicability(sid);const cols=loadIWCols(sid);const splitMode=loadIncentiveSplitMode(sid);
    const actuals=loadIncentiveActuals(sid);const iwMeta=loadIWMeta(sid);const mgrIn=loadMgrIncentiveInputs(sid,y,m)||{};const pool=managerIncentivePoolFor(sid,y,m);const dim=new Date(y,m+1,0).getDate();
    const R=pwRules(S.irules,1,'Incentive rules — '+PW_MONTHS[m]+' '+y,[
      ['applSvc','Service incentive switched on',!!appl.service],['applMem','Membership incentive switched on',!!appl.membership],['applProd','Product incentive switched on',!!appl.product],['applMgr','Manager incentive switched on',!!appl.manager],
      ['colSvc','Service column on (Incentive Working)',!!cols.svcTarget],['colMem','Membership column on',!!cols.membership],['colProd','Product column on',!!cols.product],
      ['colPen','Penalty column on',!!cols.penalty],['colAdv','Advance Adj. column on',!!cols.advAdj],['colOT','Overtime (OT) column on',!!cols.ot],
      ['dim','Days in the month',dim],['compW','Complementary sale counted in Service (share)',typeof incCompWeight==='function'?incCompWeight(sid):0.5,'0%'],['pool','Manager incentive pool ₹',Math.round(pool||0),'#,##0',o.pools?'Worked out below from the month’s collection, target and tiers':'From the Manager Incentive panel']]);
    let row=R.next;const IR=S.irules;const IRn=IR.name;
    const sec=(t)=>{const c=IR.getRow(row).getCell(1);c.value=t;c.font={bold:true,color:{argb:'FF14335E'}};row++;};
    const hdr=(a)=>{const h=IR.getRow(row);a.forEach((x,i)=>{h.getCell(i+1).value=x;});pwHeader(h);row++;};
    const blue=(r,c,v,fmt)=>{const cell=IR.getRow(r).getCell(c);cell.value=v;cell.font={color:PW_BLUE};if(fmt)cell.numFmt=fmt;return pwRef(IRn)+'$'+excelColLetter(c)+'$'+r;};
    // manager pool from collections (payWbPools)
    if(o.pools){
      const sum=mgrCollectionSumFor(sid,y,m);const items=loadMgrCollectionItems(sid);const tiers=(loadMgrIncentiveTiers(sid)||[]).map(t=>({th:Number(t.threshold),rate:Number(t.rate)||0})).filter(t=>!isNaN(t.th)).sort((a,b)=>a.th-b.th);
      sec('Manager incentive pool — collection (Collection Reco) vs target, rate by achievement tier');hdr(['Collection item','Amount ₹','Included']);
      const parts=MGR_COLLECTION_ITEMS.map(it=>{blue(row,1,it.label);const b=blue(row,2,Math.round((sum[it.key]||0)*100)/100,'#,##0');const c=blue(row,3,!!items[it.key]);row++;return{b,c};});
      const lab=(t,f,fmt,res)=>{IR.getRow(row).getCell(1).value=t;const cell=IR.getRow(row).getCell(2);cell.value=pwF(f,res);cell.numFmt=fmt||'#,##0';cell.font={bold:true};const ref=pwRef(IRn)+'$B$'+row;row++;return ref;};
      const tot=lab('Total collection',parts.map(p=>'IF('+p.c+','+p.b+',0)').join('+'));const net=lab('Collection net of GST (÷ 1.05)',tot+'/1.05');
      IR.getRow(row).getCell(1).value='Target collection';const tgt=blue(row,2,Number(mgrIn.targetCollection)||0,'#,##0');row++;
      const ach=lab('Achievement %','IF('+tgt+'=0,0,'+net+'/'+tgt+'*100)','0.00');row++;
      hdr(['Achievement at least %','Rate %']);const t0=row;tiers.forEach(t=>{blue(row,1,t.th,'0.0#');blue(row,2,t.rate,'0.0#');row++;});
      const thr=tiers.length?pwRef(IRn)+'$A$'+t0+':$A$'+(row-1):null,rr=tiers.length?pwRef(IRn)+'$B$'+t0+':$B$'+(row-1):null;row++;
      const rate=lab('Rate for this month %',thr?'IF('+ach+'<MIN('+thr+'),0,INDEX('+rr+',MATCH('+ach+','+thr+',1)))':'0','0.0#');
      R.refs.pool_cell.value=pwF('ROUND('+net+'*'+rate+'/100,0)',Math.round(pool||0));R.refs.pool_cell.font={bold:true};row++;
      IR.getRow(row).getCell(1).value='SalonOS pool';const ap=blue(row,2,Math.round(pool||0),'#,##0');IR.getRow(row).getCell(3).value=pwCheck(R.refs.pool,ap);row+=2;
    }
    // service rate slabs per designation group
    const groups=[...new Set(W.map(w=>splitMode.service?incentiveGroupFor(w,sid):'__all'))];const slabRef={};
    groups.forEach(g=>{const sl=loadServiceSlabs(sid,g==='__all'?undefined:g)||[];const tiers=sl.slice(1).map(t=>({th:Number(t.threshold),rate:Number(t.rate)||0})).filter(t=>!isNaN(t.th)).sort((a,b)=>a.th-b.th);
      sec('Service rate slabs'+(g==='__all'?'':' — '+g)+' (rate by ×times of salary achieved in Service)');hdr(['Reached at least (×times)','Rate %']);
      IR.getRow(row).getCell(1).value='Below the first tier';const base=blue(row,2,Number(sl[0]&&sl[0].rate)||0,'0.0#');row++;const t0=row;tiers.forEach(t=>{blue(row,1,t.th,'0.0#');blue(row,2,t.rate,'0.0#');row++;});
      slabRef[g]={n:tiers.length,base,thr:tiers.length?pwRef(IRn)+'$A$'+t0+':$A$'+(row-1):null,rate:tiers.length?pwRef(IRn)+'$B$'+t0+':$B$'+(row-1):null};row++;});
    IR.getRow(row).getCell(1).value='Week-day names (used by Attendance)';IR.getRow(row).getCell(1).font={bold:true,color:{argb:'FF14335E'}};row++;const wd0=row;
    ATT_WEEKLY_OFFS.forEach(d=>{IR.getRow(row).getCell(1).value=d;row++;});const weekdays=pwRef(IRn)+'$A$'+wd0+':$A$'+(row-1);
    // Sales — every incentive employee (the pools need everyone)
    const sales=W.map(w=>{const rep=staffWorkReportRowFor(sid,y,m,w.billingId);const a=actuals[incActualKey(w.id,y,m)]||{};
      return rep?{id:w.id,name:w.name,src:'CRADLE Staff Work report',svc:Number(rep['ServiceSale'])||0,pkg:Number(rep['PackageSale'])||0,comp:Number(rep['ComplementarySale'])||0,mem:Number(rep['MemberShipSale'])||0,prod:Number(rep['ProductSale'])||0}
        :{id:w.id,name:w.name,src:'Typed in Incentive Working',svc:Number(a.svcActual)||0,pkg:0,comp:0,mem:Number(a.memActual)||0,prod:Number(a.prodActual)||0};});
    pwTitle(S.sales,'Sales per employee — Service counted = Service + Package + ½ Complementary');
    const ST=pwTable(S.sales,2,[{key:'id',h:'Emp ID',w:10,input:true},{key:'name',h:'Employee',w:24,input:true},{key:'src',h:'Source',w:26,input:true},{key:'svc',h:'Service sale',input:true},{key:'pkg',h:'Package sale',input:true},
      {key:'comp',h:'Complementary sale',input:true},{key:'mem',h:'Membership sale',input:true},{key:'prod',h:'Product sale',input:true}],sales,{total:['svc','pkg','comp','mem','prod']});
    const salesRow={};W.forEach((w,i)=>salesRow[w.id]=ST.first+i);const sRef=(k,id)=>pwRef(S.sales.name)+ST.L(k)+salesRow[id];
    // Mem Pool — membership rule A/B/C worked out (payWbPools)
    const memRule=typeof loadMemRuleType==='function'?loadMemRuleType(sid):'A';let memRef=null;
    if(o.pools&&S.mpool){
      const MP=S.mpool,MPn=MP.name;const appMap=membershipIncentiveMapFor(sid,y,m,W,splitMode);const grp=w=>splitMode.membership?incentiveGroupFor(w,sid):undefined;const mgrOf=w=>MANAGER_DESIGNATIONS.has(w.desig);
      pwTitle(MP,'Membership incentive — Rule '+memRule+' · managers share the pool below by their Share %');MP.getRow(2).getCell(1).value='Manager share pool ₹';MP.getRow(2).getCell(1).font={bold:true};
      let cols2,rows2;
      const base=w=>({id:w.id,name:w.name,desig:w.desig||'',mgr:mgrOf(w),app:Math.round(appMap[w.id]||0)});
      if(memRule==='B'){const rws=loadMemRuleBRows(sid,y,m)||{};
        rows2=W.map(w=>{const s=loadMemRuleBSettings(sid,grp(w))||{};const r=rws[w.id]||{};return{...base(w),cards:Number(r.cards)||0,vpc:Number(s.valuePerCard)||0,ipc:Number(s.incPerCard)||0,sold:rr=>pwF('ROUND('+sRef('mem',w.id)+',0)'),
          sr:Number(s.staffRate)||0,mr:Number(s.mgrRate)||0,msr:Number(s.mgrShareRate)||0,pct:Number(r.mgrSharePct)||0,
          cv:(rr,L)=>pwF(L('cards')+rr+'*'+L('vpc')+rr),el:(rr,L)=>pwF(L('cards')+rr+'*'+L('ipc')+rr),af:(rr,L)=>pwF('MAX(0,'+L('sold')+rr+'-'+L('cv')+rr+')'),
          si:(rr,L)=>pwF('IF('+L('mgr')+rr+',0,ROUND('+L('af')+rr+'*'+L('sr')+rr+'/100,0))'),mi:(rr,L)=>pwF('IF('+L('mgr')+rr+',ROUND('+L('af')+rr+'*'+L('mr')+rr+'/100,0),0)'),
          con:(rr,L)=>pwF('IF('+L('mgr')+rr+',0,ROUND('+L('af')+rr+'*'+L('msr')+rr+'/100,0))'),
          fin:(rr,L)=>pwF('IF('+L('mgr')+rr+','+L('el')+rr+'+'+L('mi')+rr+'+ROUND($B$2*'+L('pct')+rr+'/100,0),'+L('el')+rr+'+'+L('si')+rr+')',appMap[w.id]),chk:(rr,L)=>pwCheck(L('fin')+rr,L('app')+rr)};});
        cols2=[['cards','Elite cards',1],['vpc','Value / card',1],['ipc','Incentive / card',1],['sold','Membership sold'],['sr','Staff rate %',1],['mr','Manager rate %',1],['msr','Manager share on staff %',1],['pct','Manager Share %',1],
          ['cv','Card value'],['el','Card incentive'],['af','Membership after cards'],['si','Staff incentive'],['mi','Manager incentive'],['con','Share to pool'],['fin','Membership incentive']];
      }else if(memRule==='C'){const rws=loadMemRuleCRows(sid,y,m)||{};
        rows2=W.map(w=>{const s=loadMemRuleCSettings(sid,grp(w))||{};const r=rws[w.id]||{};return{...base(w),nm:Number(r.newMembership)||0,wr:Number(r.walletRecharge)||0,nr:Number(s.newMemRate)||0,wrr:Number(s.walletRate)||0,mr:Number(s.mgrRate)||0,pct:Number(r.mgrSharePct)||0,
          in:(rr,L)=>pwF('ROUND('+L('nm')+rr+'*'+L('nr')+rr+'/100,0)'),iw:(rr,L)=>pwF('ROUND('+L('wr')+rr+'*'+L('wrr')+rr+'/100,0)'),con:(rr,L)=>pwF('IF('+L('mgr')+rr+',0,ROUND(('+L('nm')+rr+'+'+L('wr')+rr+')*'+L('mr')+rr+'/100,0))'),
          fin:(rr,L)=>pwF(L('in')+rr+'+'+L('iw')+rr+'+IF('+L('mgr')+rr+',ROUND($B$2*'+L('pct')+rr+'/100,0),0)',appMap[w.id]),chk:(rr,L)=>pwCheck(L('fin')+rr,L('app')+rr)};});
        cols2=[['nm','New membership ₹',1],['wr','Wallet recharge ₹',1],['nr','New membership rate %',1],['wrr','Wallet rate %',1],['mr','Manager pool rate %',1],['pct','Manager Share %',1],['in','On new membership'],['iw','On wallet'],['con','Share to pool'],['fin','Membership incentive']];
      }else{const rws=loadMemRuleARows(sid,y,m)||{};
        rows2=W.map(w=>{const s=loadMemRuleASettings(sid,grp(w))||{};const r=rws[w.id]||{};return{...base(w),sold:rr=>pwF('ROUND('+sRef('mem',w.id)+',0)'),sr:Number(s.staffRate)||0,mr:Number(s.mgrRate)||0,msr:Number(s.mgrShareRate)||0,pct:Number(r.mgrSharePct)||0,
          si:(rr,L)=>pwF('IF('+L('mgr')+rr+',0,ROUND('+L('sold')+rr+'*'+L('sr')+rr+'/100,0))'),mo:(rr,L)=>pwF('IF('+L('mgr')+rr+',ROUND('+L('sold')+rr+'*'+L('mr')+rr+'/100,0),0)'),
          con:(rr,L)=>pwF('IF('+L('mgr')+rr+',0,ROUND('+L('sold')+rr+'*'+L('msr')+rr+'/100,0))'),
          fin:(rr,L)=>pwF('IF('+L('mgr')+rr+',ROUND($B$2*'+L('pct')+rr+'/100,0)+'+L('mo')+rr+','+L('si')+rr+')',appMap[w.id]),chk:(rr,L)=>pwCheck(L('fin')+rr,L('app')+rr)};});
        cols2=[['sold','Membership sold'],['sr','Staff rate %',1],['mr','Manager rate %',1],['msr','Manager share on staff %',1],['pct','Manager Share %',1],['si','Staff incentive'],['mo','Manager on own sale'],['con','Share to pool'],['fin','Membership incentive']];
      }
      const MT=pwTable(MP,4,[{key:'id',h:'Emp ID',w:9,input:true},{key:'name',h:'Employee',w:22,input:true},{key:'desig',h:'Designation',w:16,input:true},{key:'mgr',h:'Manager',input:true},
        ...cols2.map(([k,h,inp])=>({key:k,h,input:!!inp,fmt:/%/.test(h)?'0.0#':undefined})),{key:'app',h:'SalonOS',input:true},{key:'chk',h:'Check',w:14}],rows2,{total:['con','fin','app']});
      MP.getRow(2).getCell(2).value={formula:'SUM('+MT.L('con')+MT.first+':'+MT.L('con')+Math.max(MT.first,MT.last)+')'};MP.getRow(2).getCell(2).numFmt='#,##0';MP.getRow(2).getCell(2).font={bold:true};
      const mRow={};W.forEach((w,i)=>mRow[w.id]=MT.first+i);memRef=id=>pwRef(MPn)+MT.L('fin')+mRow[id];
    }
    // Inc Working
    const IWc=[{key:'id',h:'Emp ID',w:10,input:true},{key:'name',h:'Employee',w:22,input:true},{key:'desig',h:'Designation',w:16,input:true},{key:'salary',h:'Salary',input:true},
      {key:'mS',h:'Svc target ×salary',input:true,fmt:'0.0#'},{key:'mM',h:'Mem target ×salary',input:true,fmt:'0.0#'},{key:'mP',h:'Prod target ×salary',input:true,fmt:'0.0#'},{key:'pr',h:'Pro-rata factor (payable ÷ days)',input:true,fmt:'0.00%'},
      {key:'aS',h:'Svc achieved'},{key:'tS',h:'Svc target'},{key:'pS',h:'Svc %',fmt:'0'},{key:'xS',h:'Svc ×times',fmt:'0.00'},{key:'bS',h:'Svc basis',w:16,input:true},{key:'rS',h:'Svc rate %',fmt:'0.0#'},{key:'vS',h:'Svc manual ₹',input:true},{key:'iS',h:'Svc incentive'},
      {key:'aM',h:'Mem achieved'},{key:'tM',h:'Mem target'},{key:'pM',h:'Mem %',fmt:'0'},{key:'bM',h:'Mem basis',w:18,input:true},{key:'rM',h:'Mem rate %',input:true,fmt:'0.0#'},{key:'vM',h:'Mem ₹ (pool / manual)'},{key:'iM',h:'Mem incentive'},
      {key:'aP',h:'Prod achieved'},{key:'tP',h:'Prod target'},{key:'pP',h:'Prod %',fmt:'0'},{key:'bP',h:'Prod basis',w:16,input:true},{key:'rP',h:'Prod rate %',input:true,fmt:'0.0#'},{key:'vP',h:'Prod ₹ (flat / manual)',input:true},{key:'iP',h:'Prod incentive'},
      {key:'bG',h:'Mgr basis',w:16,input:true},{key:'sG',h:'Mgr share %',input:true,fmt:'0.0#'},{key:'vG',h:'Mgr manual ₹',input:true},{key:'iG',h:'Mgr incentive'},
      {key:'oA',h:'OT applies',input:true},{key:'oN',h:'Normal hrs / day',input:true,fmt:'0.0#'},{key:'oH',h:'OT hours',input:true,fmt:'0.0#'},{key:'iO',h:'OT incentive'},
      {key:'pen',h:'Penalty (entered)',input:true},{key:'iPen',h:'Penalty'},{key:'advB',h:'Advance basis',w:18,input:true},{key:'advV',h:'Advance settled ₹',input:true},{key:'iAdv',h:'Advance Adj.'},
      {key:'iX',h:'Adjustments (team, feedback, clawback, cap / floor)',input:true},{key:'tot',h:'Total incentive'},{key:'app',h:'SalonOS total',input:true},{key:'chk',h:'Check',w:14},
      ...(o.whatIf?[{key:'wX',h:'What-if: extra service sale ₹',open:true,w:14},{key:'wS',h:'What-if svc incentive'},{key:'wT',h:'What-if total'}]:[])];
    const list=W.filter(o.empOk);
    const rows=list.map(w=>{const isMgr=MANAGER_DESIGNATIONS.has(w.desig);const cm=w.calcMode||{};const ov=w.manualOv||{};const g=splitMode.service?incentiveGroupFor(w,sid):'__all';const sl=slabRef[g]||slabRef.__all||{base:'0'};
      const im=iwMeta[attMonthKey(w.id,y,m)];const settled=!!(im&&im.advanceSettled&&Array.isArray(im.advanceSettledBreakdown));const a=actuals[incActualKey(w.id,y,m)]||{};
      const svcB=cm.svc==='manualAmt'?'Manual ₹':cm.svc==='manualRate'?'Manual rate %':'Rate slab';
      const memB=cm.mem==='manualAmt'?'Manual ₹':cm.mem==='manualRate'?'Manual rate %':'Membership rule '+memRule+' (pool)';
      const prodB=cm.prod==='manualAmt'?'Manual ₹':cm.prod==='manualRate'?'Manual rate %':w.prodRuleType==='B'?'Rule B flat ₹':'Rule A rate %';
      const mgrB=!isMgr?'Not a manager':ov.mgr?'Manual ₹':'Share of pool';
      const PWD=typeof controlOn==='function'&&controlOn('incRoundTotal',sid)?2:0;const prog=svcB==='Rate slab'&&typeof controlOn==='function'&&controlOn('incProgressive',sid);
      const progF=(r,L)=>{const a=L('aS')+r,sal=L('salary')+r,n=sl.n||0;if(!n)return a+'*'+sl.base;const T=k=>'INDEX('+sl.thr+','+k+')',RT=k=>'INDEX('+sl.rate+','+k+')';const terms=['MIN('+a+','+T(1)+'*'+sal+')*'+sl.base];for(let k=1;k<n;k++)terms.push('MAX(0,MIN('+a+','+T(k+1)+'*'+sal+')-'+T(k)+'*'+sal+')*'+RT(k));terms.push('MAX(0,'+a+'-'+T(n)+'*'+sal+')*'+RT(n));return'('+terms.join('+')+')';};
      const slab=x=>sl.thr?'IF(OR(COUNT('+sl.thr+')=0,'+x+'<MIN('+sl.thr+')),'+sl.base+',INDEX('+sl.rate+',MATCH('+x+','+sl.thr+',1)))':sl.base;
      return{id:w.id,name:w.name,desig:w.desig||'',salary:Number(w.salary)||0,mS:targetMultFor('svc',sid,w,splitMode),mM:targetMultFor('mem',sid,w,splitMode),mP:targetMultFor('prod',sid,w,splitMode),pr:Number(w.proRata)||1,
        aS:(r,L)=>pwF('IF('+R.refs.colSvc+','+sRef('svc',w.id)+'+'+sRef('pkg',w.id)+'+'+R.refs.compW+'*'+sRef('comp',w.id)+',0)'),tS:(r,L)=>pwF('IF('+R.refs.colSvc+','+L('salary')+r+'*'+L('mS')+r+'*'+L('pr')+r+',0)',w.svcTarget),
        pS:(r,L)=>pwF('IF('+L('tS')+r+'=0,0,MIN(100,ROUND('+L('aS')+r+'/'+L('tS')+r+'*100,0)))',w.svcPct),xS:(r,L)=>pwF('IF('+L('salary')+r+'=0,0,'+L('aS')+r+'/'+L('salary')+r+')',w.svcTimesRaw),bS:svcB,
        rS:(r,L)=>svcB==='Manual rate %'?Number(w.svcRate)||0:svcB==='Manual ₹'?null:prog?pwF('IF('+L('aS')+r+'=0,0,'+L('iS')+r+'/'+L('aS')+r+'*100)',w.svcRateUsed):pwF(slab(L('xS')+r),w.svcRateUsed),vS:svcB==='Manual ₹'?Number(w.svcManualAmt)||0:null,
        iS:(r,L)=>pwF('IF('+R.refs.applSvc+','+(svcB==='Manual ₹'?L('vS')+r:prog?'ROUND('+progF(r,L)+'/100,'+PWD+')':'ROUND('+L('aS')+r+'*'+L('rS')+r+'/100,'+PWD+')')+',0)',w.svcIncAmt),
        aM:(r,L)=>pwF('IF('+R.refs.colMem+','+sRef('mem',w.id)+',0)'),tM:(r,L)=>pwF('IF('+R.refs.colMem+','+L('salary')+r+'*'+L('mM')+r+'*'+L('pr')+r+',0)',w.memTarget),pM:(r,L)=>pwF('IF('+L('tM')+r+'=0,0,MIN(100,ROUND('+L('aM')+r+'/'+L('tM')+r+'*100,0)))',w.memPct),
        bM:memB,rM:Number(w.memRateUsed)||0,vM:memB==='Manual rate %'?null:memB==='Manual ₹'?Number(w.memManualAmt)||0:(memRef?pwF(memRef(w.id),w.memIncAmt):Number(w.memIncAmt)||0),
        iM:(r,L)=>pwF('IF('+R.refs.applMem+','+(memB==='Manual rate %'?'ROUND('+L('aM')+r+'*'+L('rM')+r+'/100,'+PWD+')':L('vM')+r)+',0)',w.memIncAmt),
        aP:(r,L)=>pwF('IF('+R.refs.colProd+','+sRef('prod',w.id)+',0)'),tP:(r,L)=>pwF('IF('+R.refs.colProd+','+L('salary')+r+'*'+L('mP')+r+'*'+L('pr')+r+',0)',w.prodTarget),pP:(r,L)=>pwF('IF('+L('tP')+r+'=0,0,MIN(100,ROUND('+L('aP')+r+'/'+L('tP')+r+'*100,0)))',w.prodPct),
        bP:prodB,rP:(prodB==='Manual rate %'||prodB==='Rule A rate %')?Number(w.prodRateUsed)||0:null,vP:prodB==='Manual ₹'?Number(w.prodManualAmt)||0:prodB==='Rule B flat ₹'?Number(w.prodFlatAmount)||0:null,
        iP:(r,L)=>pwF('IF('+R.refs.applProd+','+((prodB==='Manual ₹'||prodB==='Rule B flat ₹')?L('vP')+r:'ROUND('+L('aP')+r+'*'+L('rP')+r+'/100,'+PWD+')')+',0)',w.prodIncAmt),
        bG:mgrB,sG:isMgr&&!ov.mgr?Number((mgrIn.shares||{})[w.id])||0:null,vG:isMgr&&ov.mgr?Number(w.mgrManualAmt)||0:null,
        iG:(r,L)=>pwF(!isMgr?'0':'IF('+R.refs.applMgr+','+(ov.mgr?L('vG')+r:'ROUND('+R.refs.pool+'*'+L('sG')+r+'/100,0)')+',0)',w.mgrIncAmt),
        oA:!!w.otApplicable,oN:Number(w.otNormalHours)||0,oH:Number(w.otHours)||0,
        iO:(r,L)=>(w.manualInc&&w.manualInc.ot!=null)?pwF(String(Number(w.manualInc.ot)||0),w.otAmt):pwF('IF(AND('+R.refs.colOT+','+L('oA')+r+','+L('oN')+r+'>0,'+L('oH')+r+'>0),ROUND('+L('salary')+r+'/'+R.refs.dim+'/'+L('oN')+r+'*'+L('oH')+r+',0),0)',w.otAmt),
        pen:(w.manualInc&&w.manualInc.pen!=null)?Number(w.penaltyAmt)||0:Number(a.penaltyAmt)||0,iPen:(r,L)=>pwF((w.manualInc&&w.manualInc.pen!=null)?L('pen')+r:'IF('+R.refs.colPen+','+L('pen')+r+',0)',w.penaltyAmt),
        advB:settled?'Settled on approval':'Active advances',advV:settled?im.advanceSettledBreakdown.reduce((s,b)=>s+(Number(b.amount)||0),0):null,
        iAdv:(r,L)=>pwF('IF('+R.refs.colAdv+','+(settled?L('advV')+r:'SUMIFS('+o.adv.ded+','+o.adv.emp+','+L('name')+r+','+o.adv.from+',"Incentive")')+',0)',w.advAdj),
        iX:(w.incAdj?Number(w.incAdj.adj)||0:0),
        tot:(r,L)=>pwF((w.manualInc&&w.manualInc.total!=null)?'MAX(0,'+(Number(w.manualInc.total)||0)+'-'+L('iAdv')+r+')':'MAX(0,'+['iS','iM','iP','iG','iO'].map(k=>L(k)+r).join('+')+'-'+L('iPen')+r+'-'+L('iAdv')+r+')+'+L('iX')+r,w.totalInc),app:Number(w.totalInc)||0,chk:(r,L)=>pwCheck(L('tot')+r,L('app')+r),
        wX:null,
        wS:(r,L)=>{const a2='('+L('aS')+r+'+'+L('wX')+r+')';const x2='IF('+L('salary')+r+'=0,0,'+a2+'/'+L('salary')+r+')';const rate2=svcB==='Rate slab'?slab(x2):L('rS')+r;
          return pwF('IF('+L('wX')+r+'="","",IF('+R.refs.applSvc+','+(svcB==='Manual ₹'?L('vS')+r:'ROUND('+a2+'*'+rate2+'/100,0)')+',0))');},
        wT:(r,L)=>pwF('IF('+L('wX')+r+'="","",MAX(0,'+L('wS')+r+'+'+['iM','iP','iG','iO'].map(k=>L(k)+r).join('+')+'-'+L('iPen')+r+'-'+L('iAdv')+r+'))')};});
    pwTitle(S.inc,'Incentive Working — '+PW_MONTHS[m]+' '+y+' · Total = Service + Membership + Product + Manager + OT − Penalty − Advance Adj. (never below 0)');
    const T=pwTable(S.inc,2,IWc,rows,{total:['salary','aS','tS','iS','aM','tM','iM','aP','tP','iP','iG','iO','iPen','iAdv','tot','app']});
    const incRow={};list.forEach((w,i)=>incRow[w.id]=T.first+i);
    return{T,W,list,incRow,weekdays,R};
  });
}

// ── the workbook ──
async function pwBuild(salon,y,m,opt){
  opt=opt||{};const kind=opt.kind||'salary';const sid=salon.id;const px=opt.px||'';await loadExcelJS();
  const wb=opt.wb||new ExcelJS.Workbook();if(!opt.wb){wb.creator='SalonOS';wb.created=new Date();}
  const allowed=PW_EXTRAS.filter(x=>x.kinds.includes(kind)&&controlOn(x.ctl,sid)).map(x=>x.key);
  const extras=new Set(opt.multi?[]:(opt.extras?opt.extras.filter(k=>allowed.includes(k)):allowed));
  const pools=controlOn('payWbPools',sid),whatIf=controlOn('payWbWhatIf',sid),integ=!opt.multi&&controlOn('payWbIntegrity',sid);
  const empOk=e=>!opt.emp||opt.emp.has(String(e.id));
  const S={};const add=(k,n)=>{S[k]=wb.addWorksheet((px+n).slice(0,31));};
  if(!opt.multi)add('about','About');
  if(kind==='salary'){add('sw','Salary Working');add('att','Attendance');add('rules','Pay Rules');}
  add('inc','Inc Working');add('sales','Sales');add('irules','Inc Rules');if(pools)add('mpool','Mem Pool');add('adv','Advances');if(kind==='salary')add('pen','Penalties');
  [['slip','Payslips'],['bank','Bank Transfer'],['stat','PF ESIC PT'],['prev','vs Last Month'],['ytd','Year to Date'],['ctc','Cost to Company'],['exc','Exceptions'],['reco','Reconciliation'],['trail','Approval Trail']].forEach(([k,n])=>{if(extras.has(k))add(k,n);});
  const adv=pwAdvances(S.adv,sid,y,m);
  const INC=pwIncentive(sid,y,m,S,{pools,whatIf,empOk,adv});const incRef=(k,id)=>INC.incRow[id]?pwRef(S.inc.name)+INC.T.L(k)+INC.incRow[id]:'0';
  const ctx={salon,sid,y,m,kind,S,INC,incRef,extras};
  if(kind==='salary')pwSalarySheets(ctx,{pools,whatIf,empOk,adv});
  const mod={slip:pwSheetPayslips,bank:pwSheetBank,stat:pwSheetStatutory,prev:pwSheetPrev,ytd:pwSheetYtd,ctc:pwSheetCtc,exc:pwSheetExceptions,reco:pwSheetReco,trail:pwSheetTrail};
  for(const k of extras){try{mod[k](S[k],ctx);}catch(e){pwTitle(S[k],'Could not build this sheet: '+(e.message||e));}}
  if(!opt.multi)await pwSheetAbout(S.about,ctx,integ);
  if(opt.protect){for(const ws of Object.values(S)){try{await ws.protect('',{selectLockedCells:true,selectUnlockedCells:true,formatColumns:true,formatRows:true,autoFilter:true,sort:true});}catch(e){}}}
  if(!opt.wb)wb.views=[{x:0,y:0,width:10000,height:20000,firstSheet:0,activeTab:1,visibility:'visible'}];
  return{wb,ctx};
}

function pwSalarySheets(ctx,o){
  const {sid,y,m,S,INC,salon}=ctx;const E=getEmployeesForMonth(y,m,sid);const SW=swWorkingsFor(sid,y,m);const byId={};SW.forEach(w=>byId[w.id]=w);
  const att=loadAttendance(sid);const cols=loadSWCols(sid);const tea=loadTeaConfig(sid);const meta=loadSWMeta(sid);const rec=getSalonRecordById(sid)||{};const dim=new Date(y,m+1,0).getDate();
  const ceiling=pfWageCeilingFor(y,m);const state=rec.state||'';const ptOn=ptAppliesToState(state);const slabs=ptOn?(loadPtSlabs(sid,state)||[]):[];
  const R=pwRules(S.rules,1,'Pay rules — '+PW_MONTHS[m]+' '+y,[
    ['dim','Days in the month',dim],['pfRate','PF rate (employee and employer)',0.12,'0.00%'],['pfCeil','PF wage ceiling ₹',ceiling,'#,##0',typeof pfCeilingLabel==='function'?'Ceiling for this month: '+pfCeilingLabel(y,m):''],
    ['epsRate','EPS (pension) rate, out of the employer 12%',0.0833,'0.00%'],['edliRate','EDLI / admin charge rate',0.005,'0.00%'],
    ['esicRate','ESIC employee rate',0.0075,'0.00%'],['esicEr','ESIC employer rate',0.0325,'0.00%'],['esicLimit','ESIC applies up to monthly salary ₹',21000,'#,##0'],
    ['pfReg','Outlet registered for PF',!!rec.pfApplicable],['esicReg','Outlet registered for ESIC',!!rec.esicApplicable],['ptOn','Professional Tax applies in '+(state||'this state'),ptOn],
    ['teaMode','Tea — per day or fixed',tea.mode==='perDay'?'perDay':'fixed'],['teaRate','Tea rate ₹',Number(tea.rate)||0,'#,##0'],
    ...[['tea','Tea'],['pfEmp','PF (Emp)'],['esic','ESIC (Emp)'],['pt','Professional Tax'],['tds','TDS'],['penalties','Penalty'],['advAdj','Advance Adj.'],['serviceInc','Service Incentive'],['memInc','Mem Inc'],['prodInc','Prod Inc'],['mgrInc','MGR Inc'],['nonPerfPenalty','Non-Performance Penalty'],['totalInc','Total Inc']]
      .map(([k,l])=>['col_'+k,l+' column switched on',!!cols[k]])]);
  let row=R.next;const RS=S.rules;RS.getRow(row).getCell(1).value='Professional Tax slabs — '+(state||'—')+' (first slab whose "up to" covers the monthly salary)';RS.getRow(row).getCell(1).font={bold:true,color:{argb:'FF14335E'}};row++;
  const ph=RS.getRow(row);['Monthly salary up to (blank = above)','PT ₹'].forEach((x,i)=>{ph.getCell(i+1).value=x;});pwHeader(ph);row++;
  const slabCells=slabs.map(s=>{const r=RS.getRow(row);r.getCell(1).value=s.upto==null?null:(Number(s.upto)||0);r.getCell(2).value=Number(s.amount)||0;r.getCell(1).font={color:PW_BLUE};r.getCell(2).font={color:PW_BLUE};const ref={upto:pwRef(RS.name)+'$A$'+row,amt:pwRef(RS.name)+'$B$'+row};row++;return ref;});
  const ptExpr=g=>{if(!ptOn||!slabCells.length)return'0';let ex=slabCells[slabCells.length-1].amt;for(let i=slabCells.length-1;i>=0;i--){const c=slabCells[i];ex='IF(OR('+c.upto+'="",'+g+'<='+c.upto+'),'+c.amt+','+ex+')';}return state==='Karnataka'&&m===1?'IF('+ex+'=200,300,'+ex+')':ex;};
  const pen=pwPenalties(S.pen,sid,y,m);const adv=o.adv;
  // Attendance
  const list=E.filter(o.empOk);const dayCols=Array.from({length:dim},(_,i)=>({key:'d'+(i+1),h:String(i+1),w:4.5,input:true}));const D1=excelColLetter(3),DN=excelColLetter(2+dim);
  const cnt=code=>(r)=>pwF('COUNTIF('+D1+r+':'+DN+r+',"'+code+'")');const mStart=pwSerial(y+'-'+String(m+1).padStart(2,'0')+'-01'),mEnd=mStart+dim-1;
  const attRows=list.map(e=>{const r=att[attMonthKey(e.id,y,m)];const days=((r&&r.days)||genAttDay(e,y,m)).slice(0,dim);const ob={id:e.id,name:e.name};days.forEach((d,i)=>{ob['d'+(i+1)]=d?(PW_ATT_CODE[d]||d):null;});const s=attSummaryFor(e,y,m,r);
    Object.assign(ob,{off:e.weeklyOff||'',doj:pwSerial(e.doj),dol:pwSerial(e.dol),adj:Number(r&&r.adjustment)||0,pl:Number(r&&r.paidLeave)||0,app:s.totalDaysPayable,
      cP:cnt('P'),cWO:cnt('WO'),cH:cnt('H'),cHD:cnt('HD'),cA:cnt('A'),cNJ:cnt('NJ'),cL:cnt('L'),nm:rr=>pwF('COUNTBLANK('+D1+rr+':'+DN+rr+')'),
      fr:(rr,L)=>pwF('MAX('+mStart+',IF('+L('doj')+rr+'="",0,'+L('doj')+rr+'))'),to:(rr,L)=>pwF('MIN('+mEnd+',IF('+L('dol')+rr+'="",99999,'+L('dol')+rr+'))'),
      awo:o.pools?(rr,L)=>pwF('IF(OR('+L('off')+rr+'="",'+L('to')+rr+'<'+L('fr')+rr+'),0,INT(('+L('to')+rr+'-'+L('fr')+rr+'+WEEKDAY('+L('fr')+rr+'-IFERROR(MATCH('+L('off')+rr+','+INC.weekdays+',0),0)))/7))',s.allowedWeekoff):s.allowedWeekoff,
      plA:(rr,L)=>pwF('MAX(0,MIN('+L('pl')+rr+','+L('cA')+rr+'+'+L('cHD')+rr+'*0.5))'),wd:(rr,L)=>pwF(R.refs.dim+'-'+L('cL')+rr+'-'+L('cNJ')+rr+'-'+L('cA')+rr+'-'+L('cHD')+rr+'*0.5-'+L('nm')+rr+'-'+L('adj')+rr),xd:(rr,L)=>pwF(L('awo')+rr+'-'+L('cWO')+rr),
      pay:(rr,L)=>pwF(L('wd')+rr+'+'+L('xd')+rr+'+'+L('plA')+rr,s.totalDaysPayable),chk:(rr,L)=>pwF('IF(ABS('+L('pay')+rr+'-'+L('app')+rr+')<0.001,"✓","Differs by "&TEXT('+L('pay')+rr+'-'+L('app')+rr+',"0.0#"))')});return ob;});
  pwTitle(S.att,'Attendance — '+PW_MONTHS[m]+' '+y+' · P Present · WO Week-off · H Holiday · HD Half day · A Absent · NJ Not joined · L Left · blank = not marked');
  const A=pwTable(S.att,2,[{key:'id',h:'Emp ID',w:9,input:true},{key:'name',h:'Employee',w:22,input:true},...dayCols,
    {key:'cP',h:'P'},{key:'cWO',h:'WO'},{key:'cH',h:'H'},{key:'cHD',h:'HD'},{key:'cA',h:'A'},{key:'cNJ',h:'NJ'},{key:'cL',h:'L'},{key:'nm',h:'Not marked'},
    {key:'off',h:'Weekly off',w:11,input:true},{key:'doj',h:'Joined',w:11,input:true,fmt:'dd/mm/yyyy'},{key:'dol',h:'Left',w:11,input:true,fmt:'dd/mm/yyyy'},{key:'fr',h:'Counts from',w:11,fmt:'dd/mm/yyyy'},{key:'to',h:'Counts to',w:11,fmt:'dd/mm/yyyy'},
    {key:'awo',h:'Allowed week-offs',input:!o.pools},{key:'adj',h:'Adjustment',input:true,fmt:'0.0#'},{key:'pl',h:'Paid leave entered',input:true,fmt:'0.0#'},{key:'plA',h:'Paid leave allowed',fmt:'0.0#'},
    {key:'wd',h:'Working days',fmt:'0.0#'},{key:'xd',h:'Extra days',fmt:'0.0#'},{key:'pay',h:'Payable days',fmt:'0.0#'},{key:'app',h:'SalonOS payable',input:true,fmt:'0.0#'},{key:'chk',h:'Check',w:14}],attRows,{});
  for(let c=3;c<3+dim;c++)S.att.getColumn(c).alignment={horizontal:'center'};const attRow={};list.forEach((e,i)=>attRow[e.id]=A.first+i);
  // Salary Working
  const ref=k=>R.refs[k],on=k=>R.refs['col_'+k];
  const swRows=list.map(e=>{const w=byId[e.id]||{};const mt=meta[attMonthKey(e.id,y,m)]||{};const ar=attRow[e.id];const wageCalc=e.pfOnActualBasic?null:pfCappedWage(e.basic,y,m,sid);const ovr=v=>v!=null&&v!==''?Number(v)||0:null;
    const settled=!!(mt.advanceSettled&&Array.isArray(mt.advanceSettledBreakdown));
    const esicF=(sal)=>'IF('+on('esic')+',IF(ESO<>"",ESO,IF(AND('+ref('esicReg')+',ESE,'+sal+'<='+ref('esicLimit')+'),ROUND('+sal+'*'+ref('esicRate')+',0),0)),0)';
    return{id:e.id,name:e.name,desig:e.desig||'',status:e.status||'',salary:payGrossFor(e,sid),basic:Number(e.basic)||0,
      days:r=>pwF(pwRef(S.att.name)+A.L('pay')+ar,w.totalDays),dim:r=>pwF(ref('dim')),gross:(r,L)=>pwF('ROUND('+L('salary')+r+'/'+L('dim')+r+'*'+L('days')+r+',0)',w.grossAfterLop),lop:(r,L)=>pwF('MAX(0,'+L('salary')+r+'-'+L('gross')+r+')',w.lopAmt),
      tea:(r,L)=>pwF('IF(AND('+on('tea')+','+L('status')+r+'="Active"),ROUND(IF('+ref('teaMode')+'="perDay",'+ref('teaRate')+'*'+L('days')+r+','+ref('teaRate')+'),0),0)',w.tea),
      pfE:!!e.pf,pfA:!!e.pfOnActualBasic,wage:(r,L)=>e.pfOnActualBasic?pwF(L('basic')+r):(wageCalc===Math.min(Number(e.basic)||0,ceiling)?pwF('MIN('+L('basic')+r+','+ref('pfCeil')+')',wageCalc):wageCalc),
      pfO:ovr(mt.pfOverride),pf:(r,L)=>pwF('IF('+on('pfEmp')+',IF('+L('pfO')+r+'<>"",'+L('pfO')+r+',IF(AND('+ref('pfReg')+','+L('pfE')+r+'),ROUND('+L('wage')+r+'*'+ref('pfRate')+',0),0)),0)',w.pfEmp),
      esE:!!e.esic,esO:ovr(mt.esicOverride),esic:(r,L)=>pwF(esicF(L('salary')+r).split('ESO').join(L('esO')+r).split('ESE').join(L('esE')+r),w.esicEmp),
      ptO:ovr(mt.ptOverride),pt:(r,L)=>pwF('IF('+on('pt')+',IF('+L('ptO')+r+'<>"",'+L('ptO')+r+','+ptExpr(L('salary')+r)+'),0)',w.ptAmt),
      tdsE:ovr(mt.tdsAmount)||0,tds:(r,L)=>pwF('IF('+on('tds')+','+L('tdsE')+r+',0)',w.tdsAmt),
      pen:(r,L)=>pwF('IF('+on('penalties')+',SUMIFS('+pen.amt+','+pen.emp+','+L('name')+r+'),0)',w.penAmt),
      advB:settled?'Settled on approval':'Active advances',advV:settled?mt.advanceSettledBreakdown.reduce((s,b)=>s+(Number(b.amount)||0),0):null,
      adv:(r,L)=>pwF('IF('+on('advAdj')+','+(settled?L('advV')+r:'SUMIFS('+adv.ded+','+adv.emp+','+L('name')+r+','+adv.from+',"Salary")')+',0)',w.advAdj),
      arr:Number(w.arrears)||0,xe:Number(w.extraEarn)||0,xd:Number(w.extraDed)||0,
      net:(r,L)=>pwF('MAX(0,'+L('gross')+r+'+'+L('arr')+r+'+'+L('xe')+r+'-'+L('xd')+r+'+'+L('tea')+r+'-'+L('pf')+r+'-'+L('esic')+r+'-'+L('pt')+r+'-'+L('tds')+r+'-'+L('pen')+r+'-'+L('adv')+r+')',w.net),
      opA:Number(w.prevAdv)||0,cuA:Number(w.currAdv)||0,nxA:Number(w.nextAdv)||0,clA:(r,L)=>pwF('MAX(0,'+L('opA')+r+'+'+L('cuA')+r+'-'+L('adv')+r+')',w.closingAdvance),
      pfEr:(r,L)=>pwF('IF(AND('+ref('pfReg')+','+L('pfE')+r+'),ROUND('+L('wage')+r+'*'+ref('pfRate')+',0),0)',w.pfEr),esEr:(r,L)=>pwF('IF(AND('+ref('esicReg')+','+L('esE')+r+','+L('salary')+r+'<='+ref('esicLimit')+'),ROUND('+L('salary')+r+'*'+ref('esicEr')+',0),0)',w.esicEr),
      ...Object.fromEntries([['iS','serviceInc','iS'],['iM','memInc','iM'],['iP','prodInc','iP'],['iG','mgrInc','iG'],['iN','nonPerfPenalty','iPen'],['iT','totalInc','tot']].map(([k,c,src])=>[k,()=>pwF('IF('+on(c)+','+ctx.incRef(src,e.id)+',0)')])),
      app:Number(w.net)||0,chk:(r,L)=>pwCheck(L('net')+r,L('app')+r),
      wSal:null,wDays:null,wTds:null,
      wNet:(r,L)=>{const S2='IF('+L('wSal')+r+'="",'+L('salary')+r+','+L('wSal')+r+')',D2='IF('+L('wDays')+r+'="",'+L('days')+r+','+L('wDays')+r+')',T2='IF('+L('wTds')+r+'="",'+L('tds')+r+',IF('+on('tds')+','+L('wTds')+r+',0))';
        const g2='ROUND('+S2+'/'+L('dim')+r+'*'+D2+',0)',t2='IF(AND('+on('tea')+','+L('status')+r+'="Active"),ROUND(IF('+ref('teaMode')+'="perDay",'+ref('teaRate')+'*'+D2+','+ref('teaRate')+'),0),0)';
        const e2=esicF(S2).split('ESO').join(L('esO')+r).split('ESE').join(L('esE')+r),p2='IF('+on('pt')+',IF('+L('ptO')+r+'<>"",'+L('ptO')+r+','+ptExpr(S2)+'),0)';
        return pwF('IF(AND('+L('wSal')+r+'="",'+L('wDays')+r+'="",'+L('wTds')+r+'=""),"",MAX(0,'+g2+'+'+L('arr')+r+'+'+L('xe')+r+'-'+L('xd')+r+'+'+t2+'-'+L('pf')+r+'-'+e2+'-'+p2+'-'+T2+'-'+L('pen')+r+'-'+L('adv')+r+'))');},
      wDiff:(r,L)=>pwF('IF('+L('wNet')+r+'="","",'+L('wNet')+r+'-'+L('net')+r+')'),
      st:mt.status||'Draft',ps:mt.paymentStatus||'',mode:mt.mode||'',bank:e.bankName||'',acct:e.accountNo||'',ifsc:e.ifsc||''};});
  pwTitle(S.sw,'Salary Working — '+(salon.name||'')+' — '+PW_MONTHS[m]+' '+y+' · Net = Gross + Tea − PF − ESIC − PT − TDS − Penalty − Advance (never below 0)');
  const T=pwTable(S.sw,2,[{key:'id',h:'Emp ID',w:9,input:true},{key:'name',h:'Employee',w:22,input:true},{key:'desig',h:'Designation',w:16,input:true},{key:'status',h:'Status',w:9,input:true},
    {key:'salary',h:'Monthly salary',input:true},{key:'basic',h:'Basic',input:true},{key:'days',h:'Payable days',fmt:'0.0#'},{key:'dim',h:'Days in month'},{key:'gross',h:'Gross salary'},{key:'lop',h:'LOP amount'},{key:'arr',h:'Arrears',input:true},{key:'xe',h:'Other earnings (bonus, overtime, encashment)',input:true},{key:'xd',h:'Other deductions (late / early, notice)',input:true},{key:'tea',h:'Tea'},
    {key:'pfE',h:'PF applies',input:true},{key:'pfA',h:'PF on actual basic',input:true},{key:'wage',h:'PF wage base'},{key:'pfO',h:'PF typed in',input:true},{key:'pf',h:'PF (Emp)'},
    {key:'esE',h:'ESIC applies',input:true},{key:'esO',h:'ESIC typed in',input:true},{key:'esic',h:'ESIC (Emp)'},{key:'ptO',h:'PT typed in',input:true},{key:'pt',h:'Professional Tax'},
    {key:'tdsE',h:'TDS entered',input:true},{key:'tds',h:'TDS'},{key:'pen',h:'Penalty'},{key:'advB',h:'Advance basis',w:18,input:true},{key:'advV',h:'Advance settled ₹',input:true},{key:'adv',h:'Advance Adj.'},
    {key:'net',h:'Net salary'},{key:'opA',h:'Op. advance',input:true},{key:'cuA',h:'Curr month adv',input:true},{key:'nxA',h:'Next month adv',input:true},{key:'clA',h:'Closing advance'},
    {key:'pfEr',h:'Employer PF'},{key:'esEr',h:'Employer ESIC'},{key:'iS',h:'Service Inc'},{key:'iM',h:'Mem Inc'},{key:'iP',h:'Prod Inc'},{key:'iG',h:'MGR Inc'},{key:'iN',h:'Non-perf. penalty'},{key:'iT',h:'Total Inc'},
    {key:'app',h:'SalonOS net',input:true},{key:'chk',h:'Check',w:14},
    ...(o.whatIf?[{key:'wSal',h:'What-if: monthly salary',open:true,w:13},{key:'wDays',h:'What-if: payable days',open:true,w:12,fmt:'0.0#'},{key:'wTds',h:'What-if: TDS',open:true,w:11},{key:'wNet',h:'What-if net'},{key:'wDiff',h:'What-if change'}]:[]),
    {key:'st',h:'Approval',w:11,input:true},{key:'ps',h:'Payment',w:10,input:true},{key:'mode',h:'Mode',w:10,input:true},{key:'bank',h:'Bank',w:16,input:true},{key:'acct',h:'Account no.',w:18,input:true},{key:'ifsc',h:'IFSC',w:13,input:true}],swRows,
    {total:['salary','basic','gross','lop','arr','xe','xd','tea','pf','esic','pt','tds','pen','adv','net','opA','cuA','nxA','clA','pfEr','esEr','iS','iM','iP','iG','iN','iT','app']});
  const swRow={};list.forEach((e,i)=>swRow[e.id]=T.first+i);
  Object.assign(ctx,{E:list,SW:byId,meta,swT:T,swRow,swRef:(k,id)=>swRow[id]?pwRef(S.sw.name)+T.L(k)+swRow[id]:'0',swTot:k=>pwRef(S.sw.name)+T.L(k)+T.totalRow,payRules:R,att,attSummary:e=>attSummaryFor(e,y,m,att[attMonthKey(e.id,y,m)])});
}

// ── extras ──
function pwSheetPayslips(ws,c){
  [26,16,26,16].forEach((w,i)=>{ws.getColumn(i+1).width=w;});let r=1;const name=String(c.salon.name||'').split('—')[0].trim();
  const put=(row,vals,opt)=>{vals.forEach((v,i)=>{if(v===undefined)return;const cell=ws.getRow(row).getCell(i+1);cell.value=v;if(v&&(v.formula||typeof v==='number'))cell.numFmt=(opt&&opt.fmt)||'#,##0';if(opt&&opt.bold)cell.font={bold:true};cell.border=EXCEL_THIN_BORDER;});};
  c.E.forEach(e=>{const s=k=>pwF(c.swRef(k,e.id));
    ws.mergeCells(r,1,r,4);const t=ws.getRow(r).getCell(1);t.value=name+' — Payslip — '+PW_MONTHS[c.m]+' '+c.y;t.font={bold:true,size:13,color:{argb:'FF14335E'}};r++;
    put(r,['Employee',e.name,'Emp ID',String(e.id)]);r++;put(r,['Designation',e.desig||'','Payable days',s('days')],{fmt:'0.0#'});r++;put(r,['Days in month',s('dim'),'Monthly salary',s('salary')]);r++;
    const h=ws.getRow(r);['Earnings','₹','Deductions','₹'].forEach((x,i)=>{h.getCell(i+1).value=x;});pwHeader(h);r++;const e0=r;
    [['Gross salary','gross','PF','pf'],['Tea','tea','ESIC','esic'],['Arrears','arr','Professional Tax','pt'],[null,null,'TDS','tds'],[null,null,'Penalty','pen'],[null,null,'Advance recovered','adv']].forEach(x=>{put(r,[x[0]||'',x[1]?s(x[1]):'',x[2],s(x[3])]);r++;});
    put(r,['Total earnings',{formula:'SUM(B'+e0+':B'+(r-1)+')'},'Total deductions',{formula:'SUM(D'+e0+':D'+(r-1)+')'}],{bold:true});const tr=r;r++;
    put(r,['Net salary',{formula:'MAX(0,B'+tr+'-D'+tr+')'},'',''],{bold:true});r++;
    put(r,['Incentive (paid separately)',s('iT'),'Advance still to recover',s('clA')]);r++;put(r,['Bank',[e.bankName,e.accountNo,e.ifsc].filter(Boolean).join(' · ')||'—','','']);r++;
    ws.getRow(r).addPageBreak();r+=2;});
}
function pwSheetBank(ws,c){
  pwTitle(ws,'Salary transfer list — '+PW_MONTHS[c.m]+' '+c.y+' · amounts are the Net salary on Salary Working');
  const rows=c.E.filter(e=>!(c.SW[e.id]||{}).hold).map(e=>({name:e.name,acct:String(e.accountNo||''),ifsc:e.ifsc||'',bankN:e.bankName||'',amt:()=>pwF(c.swRef('net',e.id)+((c.SW[e.id]||{}).cashPart?'-'+Number(c.SW[e.id].cashPart):'')),nar:'Salary '+PW_MONTHS[c.m].slice(0,3)+' '+c.y,mode:(c.meta[attMonthKey(e.id,c.y,c.m)]||{}).mode||'',note:e.accountNo?'':'No bank details — pay another way'}))
    .sort((a,b)=>(a.acct?0:1)-(b.acct?0:1));
  pwTable(ws,2,[{key:'name',h:'Beneficiary name',w:24,input:true},{key:'acct',h:'Account number',w:20,input:true},{key:'ifsc',h:'IFSC',w:13,input:true},{key:'bankN',h:'Bank',w:16,input:true},{key:'amt',h:'Amount ₹'},{key:'nar',h:'Narration',w:18,input:true},{key:'mode',h:'Payment mode',w:13,input:true},{key:'note',h:'Note',w:28}],rows,{total:['amt'],xSplit:1});
}
function pwSheetStatutory(ws,c){
  const st={};(statutoryDeductionsFor(c.sid,c.y,c.m)||[]).forEach(x=>{st[x.id]=x;});const R=c.payRules.refs;const ceiling=pfWageCeilingFor(c.y,c.m);
  pwTitle(ws,'PF (ECR), ESIC and Professional Tax — '+PW_MONTHS[c.m]+' '+c.y+' · linked to Salary Working');
  const pfL=c.E.filter(e=>{const s=st[e.id]||{};return(Number(s.pfEmp)||0)+(Number(s.pfEr)||0)>0;});
  const pfRows=pfL.map(e=>{const s=st[e.id]||{};const epsW=pfCappedWage(e.basic,c.y,c.m,c.sid);const capF=epsW===Math.min(Number(e.basic)||0,ceiling)?pwF('MIN('+c.swRef('basic',e.id)+','+R.pfCeil+')',epsW):epsW;
    return{uan:String(e.pfNumber||''),name:e.name,gw:()=>pwF(c.swRef('gross',e.id)),epf:()=>pwF(c.swRef('wage',e.id)),eps:capF,ee:()=>pwF(c.swRef('pf',e.id)),er:()=>pwF(c.swRef('pfEr',e.id)),
      epsC:(r,L)=>pwF('ROUND('+L('eps')+r+'*'+R.epsRate+',0)',s.eps),erE:(r,L)=>pwF('MAX(0,'+L('er')+r+'-'+L('epsC')+r+')',s.pfErEpf),edli:(r,L)=>pwF('ROUND('+L('eps')+r+'*'+R.edliRate+',0)',s.edli),adm:(r,L)=>pwF('ROUND('+L('eps')+r+'*'+R.edliRate+',0)',s.adminChargeRaw),
      ncp:Number((c.SW[e.id]||{}).lop)||0,app:Number(s.eps)||0,chk:(r,L)=>pwCheck(L('epsC')+r,L('app')+r)};});
  const P=pwTable(ws,3,[{key:'uan',h:'UAN',w:15,input:true},{key:'name',h:'Employee',w:22,input:true},{key:'gw',h:'Gross wages'},{key:'epf',h:'EPF wages'},{key:'eps',h:'EPS / EDLI wages'},{key:'ee',h:'Employee 12%'},{key:'er',h:'Employer 12%'},
    {key:'epsC',h:'EPS 8.33%'},{key:'erE',h:'Employer EPF (12% − EPS)'},{key:'edli',h:'EDLI 0.5%'},{key:'adm',h:'Admin 0.5%'},{key:'ncp',h:'NCP (LOP) days',input:true,fmt:'0.0#'},{key:'app',h:'SalonOS EPS',input:true},{key:'chk',h:'Check',w:14}],pfRows,{total:['gw','epf','eps','ee','er','epsC','erE','edli','adm'],noFreeze:true});
  ws.getRow(2).getCell(1).value='PF — ECR';ws.getRow(2).getCell(1).font={bold:true,color:{argb:'FF14335E'}};
  let r=(P.totalRow||P.last)+1;ws.getRow(r).getCell(1).value='Admin charges payable (₹500 minimum for the establishment)';ws.getRow(r).getCell(11).value=pwF('IF('+P.L('adm')+P.totalRow+'>0,MAX(500,'+P.L('adm')+P.totalRow+'),0)');ws.getRow(r).getCell(11).numFmt='#,##0';r+=3;
  ws.getRow(r-1).getCell(1).value='ESIC';ws.getRow(r-1).getCell(1).font={bold:true,color:{argb:'FF14335E'}};
  const esL=c.E.filter(e=>{const s=st[e.id]||{};return(Number(s.esicEmp)||0)+(Number(s.esicEr)||0)>0;});
  const ES=pwTable(ws,r,[{key:'ip',h:'IP number',w:15,input:true},{key:'name',h:'Employee',w:22,input:true},{key:'days',h:'Days paid',fmt:'0.0#'},{key:'wg',h:'Wages'},{key:'ee',h:'Employee 0.75%'},{key:'er',h:'Employer 3.25%'},{key:'tot',h:'Total'}],
    esL.map(e=>({ip:String(e.esicNumber||''),name:e.name,days:()=>pwF(c.swRef('days',e.id)),wg:()=>pwF(c.swRef('gross',e.id)),ee:()=>pwF(c.swRef('esic',e.id)),er:()=>pwF(c.swRef('esEr',e.id)),tot:(rr,L)=>pwF(L('ee')+rr+'+'+L('er')+rr)})),{total:['wg','ee','er','tot'],noFreeze:true});
  r=(ES.totalRow||ES.last)+3;ws.getRow(r-1).getCell(1).value='Professional Tax';ws.getRow(r-1).getCell(1).font={bold:true,color:{argb:'FF14335E'}};
  pwTable(ws,r,[{key:'name',h:'Employee',w:22,input:true},{key:'sal',h:'Monthly salary'},{key:'pt',h:'PT'}],c.E.filter(e=>Number((st[e.id]||{}).ptAmt)>0).map(e=>({name:e.name,sal:()=>pwF(c.swRef('salary',e.id)),pt:()=>pwF(c.swRef('pt',e.id))})),{total:['pt'],noFreeze:true});
}
function pwPrevYm(y,m){return m===0?[y-1,11]:[y,m-1];}
function pwSheetPrev(ws,c){
  const [py,pm]=pwPrevYm(c.y,c.m);const pInc={};incWorkingsFor(c.sid,py,pm).forEach(w=>pInc[w.id]=w);
  if(c.kind==='salary'){const pSW={};swWorkingsFor(c.sid,py,pm).forEach(w=>pSW[w.id]=w);
    pwTitle(ws,'Compared with '+PW_MONTHS[pm]+' '+py+' — last month as figures, this month linked to Salary Working');
    const rows=c.E.map(e=>{const p=pSW[e.id]||{},cur=c.SW[e.id]||{},pi=pInc[e.id]||{};const why=[];
      if(!pSW[e.id])why.push('new this month');else{if((p.totalDays||0)!==(cur.totalDays||0))why.push('days '+(p.totalDays||0)+' → '+(cur.totalDays||0));if((p.gross||0)!==(cur.gross||0))why.push('salary changed');
        if((p.advAdj||0)!==(cur.advAdj||0))why.push('advance '+Math.round(p.advAdj||0)+' → '+Math.round(cur.advAdj||0));if((p.penAmt||0)!==(cur.penAmt||0))why.push('penalty changed');if((p.tdsAmt||0)!==(cur.tdsAmt||0))why.push('TDS changed');
        if((p.pfEmp||0)!==(cur.pfEmp||0)||(p.esicEmp||0)!==(cur.esicEmp||0)||(p.ptAmt||0)!==(cur.ptAmt||0))why.push('PF / ESIC / PT changed');}
      return{id:e.id,name:e.name,pD:Number(p.totalDays)||0,pG:Number(p.grossAfterLop)||0,pN:Number(p.net)||0,pI:Number(pi.totalInc)||0,cD:()=>pwF(c.swRef('days',e.id)),cG:()=>pwF(c.swRef('gross',e.id)),cN:()=>pwF(c.swRef('net',e.id)),cI:()=>pwF(c.incRef('tot',e.id)),
        dN:(r,L)=>pwF(L('cN')+r+'-'+L('pN')+r),dI:(r,L)=>pwF(L('cI')+r+'-'+L('pI')+r),why:why.join('; ')||'no change in the inputs'};});
    pwTable(ws,2,[{key:'id',h:'Emp ID',w:9,input:true},{key:'name',h:'Employee',w:22,input:true},{key:'pD',h:'Last month days',input:true,fmt:'0.0#'},{key:'pG',h:'Last month gross',input:true},{key:'pN',h:'Last month net',input:true},{key:'pI',h:'Last month incentive',input:true},
      {key:'cD',h:'This month days',fmt:'0.0#'},{key:'cG',h:'This month gross'},{key:'cN',h:'This month net'},{key:'cI',h:'This month incentive'},{key:'dN',h:'Net change'},{key:'dI',h:'Incentive change'},{key:'why',h:'What changed',w:46}],rows,{total:['pG','pN','pI','cG','cN','cI','dN','dI']});
  }else{
    pwTitle(ws,'Compared with '+PW_MONTHS[pm]+' '+py+' — last month as figures, this month linked to Inc Working');
    const rows=c.INC.list.map(w=>{const p=pInc[w.id]||{};const why=[];if(!pInc[w.id])why.push('new this month');else{if(Math.round(p.svcActual||0)!==Math.round(w.svcActual||0))why.push('service sale changed');if(Math.round(p.memActual||0)!==Math.round(w.memActual||0))why.push('membership sale changed');
      if(Math.round(p.prodActual||0)!==Math.round(w.prodActual||0))why.push('product sale changed');if((p.svcRateUsed||0)!==(w.svcRateUsed||0))why.push('service rate '+(p.svcRateUsed||0)+'% → '+(w.svcRateUsed||0)+'%');if((p.mgrIncAmt||0)!==(w.mgrIncAmt||0))why.push('manager pool changed');}
      return{id:w.id,name:w.name,pS:Math.round(p.svcActual||0),pT:Number(p.totalInc)||0,cS:()=>pwF(c.incRef('aS',w.id)),cT:()=>pwF(c.incRef('tot',w.id)),dT:(r,L)=>pwF(L('cT')+r+'-'+L('pT')+r),why:why.join('; ')||'no change in the inputs'};});
    pwTable(ws,2,[{key:'id',h:'Emp ID',w:9,input:true},{key:'name',h:'Employee',w:22,input:true},{key:'pS',h:'Last month service',input:true},{key:'pT',h:'Last month incentive',input:true},{key:'cS',h:'This month service'},{key:'cT',h:'This month incentive'},{key:'dT',h:'Change'},{key:'why',h:'What changed',w:46}],rows,{total:['pS','pT','cS','cT','dT']});
  }
}
function pwSheetYtd(ws,c){
  const fyY=c.m>=3?c.y:c.y-1;const months=[];let yy=fyY,mm=3;while(yy<c.y||(yy===c.y&&mm<c.m)){months.push([yy,mm]);mm++;if(mm>11){mm=0;yy++;}}
  const lab=(y,m)=>PW_MONTHS[m].slice(0,3)+'-'+String(y).slice(2);const agg={};
  months.forEach(([y,m])=>{const inc={};incWorkingsFor(c.sid,y,m).forEach(w=>inc[w.id]=w);if(c.kind==='salary')swWorkingsFor(c.sid,y,m).forEach(w=>{const a=agg[w.id]=agg[w.id]||{};a['n'+y+m]=Number(w.net)||0;['grossAfterLop','pfEmp','esicEmp','ptAmt','tdsAmt','net'].forEach(k=>{a[k]=(a[k]||0)+(Number(w[k])||0);});a.inc=(a.inc||0)+(Number((inc[w.id]||{}).totalInc)||0);});
    else Object.values(inc).forEach(w=>{const a=agg[w.id]=agg[w.id]||{};a['n'+y+m]=Number(w.totalInc)||0;a.inc=(a.inc||0)+(Number(w.totalInc)||0);});});
  const fyLabel='FY '+fyY+'-'+String(fyY+1).slice(2);
  if(c.kind==='salary'){pwTitle(ws,'Year to date — '+fyLabel+' up to '+PW_MONTHS[c.m]+' '+c.y+' · earlier months as figures, this month linked to Salary Working');
    const metrics=[['grossAfterLop','gross','Gross'],['pfEmp','pf','PF'],['esicEmp','esic','ESIC'],['ptAmt','pt','PT'],['tdsAmt','tds','TDS'],['net','net','Net']];
    const cols=[{key:'id',h:'Emp ID',w:9,input:true},{key:'name',h:'Employee',w:22,input:true},...months.map(([y,m])=>({key:'n'+y+m,h:'Net '+lab(y,m),input:true})),{key:'cur',h:'Net '+lab(c.y,c.m)},
      ...metrics.flatMap(([k,ck,h])=>[{key:'e_'+k,h:h+' earlier months',input:true},{key:'y_'+k,h:h+' YTD'}]),{key:'e_inc',h:'Incentive earlier months',input:true},{key:'y_inc',h:'Incentive YTD'}];
    const rows=c.E.map(e=>{const a=agg[e.id]||{};const o={id:e.id,name:e.name,cur:()=>pwF(c.swRef('net',e.id))};months.forEach(([y,m])=>{o['n'+y+m]=a['n'+y+m]||0;});
      metrics.forEach(([k,ck])=>{o['e_'+k]=Math.round(a[k]||0);o['y_'+k]=(r,L)=>pwF(L('e_'+k)+r+'+'+c.swRef(ck,e.id));});o.e_inc=Math.round(a.inc||0);o.y_inc=(r,L)=>pwF(L('e_inc')+r+'+'+c.incRef('tot',e.id));return o;});
    pwTable(ws,2,cols,rows,{total:cols.filter(x=>!['id','name'].includes(x.key)).map(x=>x.key)});
  }else{pwTitle(ws,'Incentive year to date — '+fyLabel+' up to '+PW_MONTHS[c.m]+' '+c.y);
    const cols=[{key:'id',h:'Emp ID',w:9,input:true},{key:'name',h:'Employee',w:22,input:true},...months.map(([y,m])=>({key:'n'+y+m,h:lab(y,m),input:true})),{key:'cur',h:lab(c.y,c.m)},{key:'ytd',h:'YTD'}];
    const rows=c.INC.list.map(w=>{const a=agg[w.id]||{};const o={id:w.id,name:w.name,cur:()=>pwF(c.incRef('tot',w.id))};months.forEach(([y,m])=>{o['n'+y+m]=a['n'+y+m]||0;});o.ytd=(r,L)=>pwF('SUM('+L(months.length?'n'+months[0][0]+months[0][1]:'cur')+r+':'+L('cur')+r+')');return o;});
    pwTable(ws,2,cols,rows,{total:cols.filter(x=>!['id','name'].includes(x.key)).map(x=>x.key)});}
}
function pwSheetCtc(ws,c){
  pwTitle(ws,'Cost to company — '+PW_MONTHS[c.m]+' '+c.y+' · Gross + Tea + Employer PF + Employer ESIC + Monthly incentive');
  pwTable(ws,2,[{key:'id',h:'Emp ID',w:9,input:true},{key:'name',h:'Employee',w:22,input:true},{key:'desig',h:'Designation',w:16,input:true},{key:'g',h:'Gross salary'},{key:'t',h:'Tea'},{key:'pf',h:'Employer PF'},{key:'es',h:'Employer ESIC'},{key:'inc',h:'Monthly incentive'},{key:'ctc',h:'Cost to company'}],
    c.E.map(e=>({id:e.id,name:e.name,desig:e.desig||'',g:()=>pwF(c.swRef('gross',e.id)),t:()=>pwF(c.swRef('tea',e.id)),pf:()=>pwF(c.swRef('pfEr',e.id)),es:()=>pwF(c.swRef('esEr',e.id)),inc:()=>pwF(c.incRef('tot',e.id)),ctc:(r,L)=>pwF(['g','t','pf','es','inc'].map(k=>L(k)+r).join('+'))})),{total:['g','t','pf','es','inc','ctc']});
}
function pwBankPaid(sid,y,m){let rows=[];try{rows=JSON.parse(cachedLocalGet(outletKey('salonos_bank_statement_rows',sid))||'[]')||[];}catch(e){}const by={};
  rows.forEach(r=>(r&&Array.isArray(r.linkedEmployeePay)?r.linkedEmployeePay:[]).forEach(l=>{if(Number(l.year)!==y||Number(l.month)!==m)return;const o=by[l.employeeId]=by[l.employeeId]||{salary:0,incentive:0};o.salary+=Number(l.salary)||0;o.incentive+=Number(l.incentive)||0;}));return by;}
function pwSheetReco(ws,c){
  const paid=pwBankPaid(c.sid,c.y,c.m);const [ny,nm]=c.m===11?[c.y+1,0]:[c.y,c.m+1];const sal=c.kind==='salary';const cost=employeeCostFor(c.sid,c.y,c.m);
  const lineSum=f=>Math.round(((cost&&cost.lines)||[]).filter(f).reduce((s,l)=>s+(Number(l.amt)||0),0));const meta=sal?c.meta:loadIWMeta(c.sid);
  pwTitle(ws,(sal?'Salary':'Incentive')+' reconciliation — '+PW_MONTHS[c.m]+' '+c.y+' · what is due, what has been paid, and the P&L');
  const list=sal?c.E:c.INC.list;
  const T=pwTable(ws,3,[{key:'id',h:'Emp ID',w:9,input:true},{key:'name',h:'Employee',w:22,input:true},{key:'due',h:sal?'Net salary':'Total incentive'},{key:'ps',h:'Payment status',w:12,input:true},{key:'bank',h:'Paid by bank (linked lines)',input:true},{key:'bal',h:'Due less bank'}],
    list.map(e=>({id:e.id,name:e.name,due:()=>pwF(sal?c.swRef('net',e.id):c.incRef('tot',e.id)),ps:(meta[attMonthKey(e.id,c.y,c.m)]||{}).paymentStatus||'',bank:Math.round(((paid[e.id]||{})[sal?'salary':'incentive'])||0),bal:(r,L)=>pwF(L('due')+r+'-'+L('bank')+r)})),{total:['due','bank','bal'],noFreeze:true});
  let r=(T.totalRow||T.last)+2;const k=(t,f,res,bold)=>{ws.getRow(r).getCell(1).value=t;const cell=ws.getRow(r).getCell(3);cell.value=typeof f==='string'?pwF(f,res):f;cell.numFmt='#,##0';if(bold)cell.font={bold:true};if(typeof f!=='string')cell.font={color:PW_BLUE};const a=excelColLetter(3)+r;r++;return a;};
  ws.getRow(r).getCell(1).value='Paid vs due';ws.getRow(r).getCell(1).font={bold:true,color:{argb:'FF14335E'}};r++;
  const d=k('Due (total)',T.L('due')+T.totalRow);const b=k('Paid by bank',T.L('bank')+T.totalRow);
  const cash=k('Paid in cash — Daily Sales & Exp "'+(sal?'Previous Month Salary':'Previous Month Incentive')+'" in '+PW_MONTHS[nm]+' '+ny,Math.round(dailySalesRowSumFor(c.sid,ny,nm,sal?'Previous Month Salary':'Previous Month Incentive')||0));
  k('Still unpaid',d+'-'+b+'-'+cash,undefined,true);r++;
  ws.getRow(r).getCell(1).value='Ties to the P&L (Employee Cost)';ws.getRow(r).getCell(1).font={bold:true,color:{argb:'FF14335E'}};r++;
  const hd=ws.getRow(r);['Line','','This workbook','P&L','Check'].forEach((x,i)=>{hd.getCell(i+1).value=x;});pwHeader(hd);r++;
  const tie=(t,f,pl)=>{const R=ws.getRow(r);R.getCell(1).value=t;R.getCell(3).value=pwF(f);R.getCell(3).numFmt='#,##0';R.getCell(4).value=pl;R.getCell(4).numFmt='#,##0';R.getCell(4).font={color:PW_BLUE};R.getCell(5).value=pwCheck('C'+r,'D'+r);r++;};
  if(sal){tie('Employee salary (gross + tea)',c.swTot('gross')+'+'+c.swTot('tea'),lineSum(l=>l.group==='Employee Salary'));tie('PF employer contribution',c.swTot('pfEr'),lineSum(l=>l.name==='PF Employer Contribution'));tie('ESIC employer contribution',c.swTot('esEr'),lineSum(l=>l.name==='ESIC Employer Contribution'));}
  tie('Employee monthly incentive',pwRef(c.S.inc.name)+c.INC.T.L('tot')+c.INC.T.totalRow,lineSum(l=>l.group==='Employee Monthly Incentive'));
  r++;ws.getRow(r).getCell(1).value='The P&L counts salary only once attendance is marked Final, and incentive only for the roles it maps; a difference here usually means one of those.';ws.getRow(r).getCell(1).font={italic:true,color:{argb:'FF6B7385'}};
  ws.getColumn(1).width=Math.max(ws.getColumn(1).width||0,30);
}
function pwSheetExceptions(ws,c){
  const sal=c.kind==='salary';const lim=controlLimit('payWbExceptions')||50;const out=[];const link=(name,id)=>sal&&c.swRow&&c.swRow[id]?{text:name,hyperlink:"#'"+c.S.sw.name+"'!B"+c.swRow[id]}:name;
  if(sal){if(typeof salaryAttendanceReady==='function'&&!salaryAttendanceReady(c.sid,c.y,c.m))out.push({emp:'All',issue:'Attendance not marked Final',detail:'Salary is final only after attendance is marked Final',amt:null});
    c.E.forEach(e=>{const w=c.SW[e.id]||{};const s=c.attSummary(e);const mt=c.meta[attMonthKey(e.id,c.y,c.m)]||{};const L=link(e.name,e.id);
      if(s.notMarked>0)out.push({emp:L,issue:'Days not marked',detail:s.notMarked+' day(s) blank in attendance — not paid',amt:null});
      if(w.pfOverridden)out.push({emp:L,issue:'PF typed in by hand',detail:'Standard would be '+Math.round(w.pfAutoAmt||0),amt:w.pfEmp});
      if(w.esicOverridden)out.push({emp:L,issue:'ESIC typed in by hand',detail:'Standard would be '+Math.round(w.esicAutoAmt||0),amt:w.esicEmp});
      if(w.ptOverridden)out.push({emp:L,issue:'PT typed in by hand',detail:'Standard would be '+Math.round(w.ptAutoAmt||0),amt:w.ptAmt});
      if(w.tdsAmt>0)out.push({emp:L,issue:'TDS deducted',detail:'Entered by hand',amt:w.tdsAmt});
      {const pg=payGrossFor(e,c.sid);if(pg>0&&w.net<pg*lim/100)out.push({emp:L,issue:'Net below '+lim+'% of salary',detail:'Net '+Math.round(w.net)+' of salary '+Math.round(pg),amt:w.net});}
      if(w.grossAfterLop>0&&w.advAdj>w.grossAfterLop*0.25)out.push({emp:L,issue:'Large advance recovery',detail:'More than 25% of gross',amt:w.advAdj});
      if(w.net>0&&!e.accountNo&&/bank/i.test(mt.mode||''))out.push({emp:L,issue:'Bank transfer but no account number',detail:'Add bank details in Master Salary',amt:w.net});
      if(mt.status!=='Approved')out.push({emp:L,issue:'Not approved yet',detail:'Status: '+(mt.status||'Draft'),amt:null});});}
  c.INC.list.forEach(w=>{const cm=w.calcMode||{};const ov=w.manualOv||{};const nm=w.name;
    ['svc','mem','prod'].forEach(k=>{if(cm[k]==='manualAmt')out.push({emp:nm,issue:'Incentive typed in by hand',detail:({svc:'Service',mem:'Membership',prod:'Product'})[k]+' amount',amt:w[k+'IncAmt']});});
    if(ov.mgr)out.push({emp:nm,issue:'Manager incentive typed in by hand',detail:'Not from the pool',amt:w.mgrIncAmt});
    if(w.penaltyAmt>0)out.push({emp:nm,issue:'Incentive penalty',detail:(w.manualInc&&w.manualInc.pen!=null)?'Typed in ✍ Manual incentive':'Entered on Incentive Working',amt:w.penaltyAmt});
    if(w.manualInc&&w.manualInc.total!=null)out.push({emp:nm,issue:'Incentive typed in by hand',detail:'Whole amount (✍ Manual incentive), before advance recovery',amt:w.manualInc.total});
    if(w.manualInc&&w.manualInc.mgr!=null)out.push({emp:nm,issue:'Incentive typed in by hand',detail:'Manager amount',amt:w.mgrIncAmt});
    if(!w.fromReport&&(w.svcActual||w.memActual||w.prodActual))out.push({emp:nm,issue:'Sales typed in (no CRADLE report)',detail:'Service '+Math.round(w.svcActual)+' · Membership '+Math.round(w.memActual)+' · Product '+Math.round(w.prodActual),amt:null});});
  pwTitle(ws,'Exceptions — '+out.length+' item(s) to look at before approving · '+PW_MONTHS[c.m]+' '+c.y);
  pwTable(ws,2,[{key:'emp',h:'Employee',w:24},{key:'issue',h:'What',w:34},{key:'detail',h:'Detail',w:52},{key:'amt',h:'Amount ₹'}],out.length?out:[{emp:'—',issue:'Nothing unusual found',detail:'',amt:null}],{xSplit:1});
}
function pwSheetTrail(ws,c){
  const sal=c.kind==='salary';const meta=sal?c.meta:loadIWMeta(c.sid);const list=sal?c.E:c.INC.list;
  pwTitle(ws,'Approval trail — '+PW_MONTHS[c.m]+' '+c.y);
  const T=pwTable(ws,2,[{key:'id',h:'Emp ID',w:9},{key:'name',h:'Employee',w:22},{key:'st',h:'Approval',w:12},{key:'ps',h:'Payment',w:12},{key:'mode',h:'Mode',w:14},{key:'adv',h:'Advance settled on approval',w:14}],
    list.map(e=>{const mt=meta[attMonthKey(e.id,c.y,c.m)]||{};return{id:e.id,name:e.name,st:mt.status||'Draft',ps:mt.paymentStatus||'',mode:mt.mode||'',adv:mt.advanceSettled?'Yes':''};}),{noFreeze:true});
  let r=T.last+3;const sec=t=>{ws.getRow(r).getCell(1).value=t;ws.getRow(r).getCell(1).font={bold:true,color:{argb:'FF14335E'}};r++;};const kv=(a,b)=>{ws.getRow(r).getCell(1).value=a;ws.getRow(r).getCell(2).value=b||'—';r++;};
  const when=x=>x?new Date(x).toLocaleString('en-GB',DMY_DT):'';
  [sal?'salary':null,'incentive'].filter(Boolean).forEach(sh=>{const a=summaryApprovalFor(c.sid,sh,c.y,c.m);sec((sh==='salary'?'Salary':'Incentive')+' summary approval');
    if(!a){kv('Status','Not sent for approval');r++;return;}kv('Status',a.status);kv('Sent by',[a.sentBy,when(a.sentAt)].filter(Boolean).join(' · '));kv('Approved by',[a.approvedBy,when(a.approvedAt)].filter(Boolean).join(' · '));kv('Remarks',a.remarks);
    Object.entries(a.reviews||{}).forEach(([role,x])=>kv('Review — '+role,[x.status,x.by,when(x.at),x.remarks].filter(Boolean).join(' · ')));r++;});
  const plan=typeof incPlanFor==='function'?incPlanFor(c.sid,c.y,c.m):null;sec('Monthly incentive plan');if(!plan)kv('Status','No plan for this month');else{kv('Status',plan.status);kv('Prepared by',plan.preparedBy);kv('Approved by',[plan.approvedBy,when(plan.approvedAt)].filter(Boolean).join(' · '));kv('Remarks',plan.remarks);}
  ws.getColumn(1).width=Math.max(ws.getColumn(1).width||0,28);ws.getColumn(2).width=Math.max(ws.getColumn(2).width||0,50);
}
async function pwSheetAbout(ws,c,integ){
  const sal=c.kind==='salary';ws.getColumn(1).width=46;ws.getColumn(2).width=64;let r=1;
  const line=(a,b,font)=>{const R=ws.getRow(r);R.getCell(1).value=a;if(b!==undefined)R.getCell(2).value=b;if(font)R.getCell(1).font=font;R.getCell(2).alignment={wrapText:true,vertical:'top'};r++;};
  line((sal?'Salary':'Incentive')+' Working — full workings',undefined,{bold:true,size:16,color:{argb:'FF14335E'}});line((c.salon.name||'')+' · '+PW_MONTHS[c.m]+' '+c.y,undefined,{bold:true,size:12});
  const who=typeof currentSessionUser==='function'?(currentSessionUser()||{}).name:'';
  line('Downloaded',new Date().toLocaleString('en-GB',DMY_DT)+(who?' by '+who:''));r++;
  line('Status of the month',undefined,{bold:true});
  line('Attendance marked Final',typeof salaryAttendanceReady==='function'&&salaryAttendanceReady(c.sid,c.y,c.m)?'Yes':'No — figures can still change');
  line('Month locked',isMonthLockedFor(c.sid,c.y,c.m)?'Yes — nobody can change it':'No');
  if(typeof isIWEffectiveLockedFor==='function')line('Incentive Working locked',isIWEffectiveLockedFor(c.sid,c.y,c.m)?'Yes':'No');
  // download code + change check
  const figs=sal?c.E.map(e=>{const w=c.SW[e.id]||{};return[e.id,w.net,w.grossAfterLop,w.pfEmp,w.esicEmp,w.ptAmt,w.advAdj,w.penAmt,w.tdsAmt];}):c.INC.list.map(w=>[w.id,w.totalInc,w.svcIncAmt,w.memIncAmt,w.prodIncAmt,w.mgrIncAmt]);
  let code='';try{const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([c.sid,c.y,c.m,figs])));code=[...new Uint8Array(buf)].slice(0,5).map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();}catch(e){code='—';}
  line('Download code',code);
  try{logAuditEvent(c.sid,{entity:sal?'Salary Working':'Incentive Working',entityId:c.y+'-'+String(c.m+1).padStart(2,'0'),action:'Full workings downloaded',summary:'Code '+code});}catch(e){}
  if(integ){r++;line('Change check',undefined,{bold:true});
    const W=sal?[['net',1],['gross',3],['pf',7],['esic',11],['pt',13],['adv',17],['pen',19],['tds',23]]:[['tot',1],['iS',3],['iM',7],['iP',11],['iG',13]];
    const exp=Math.round(figs.reduce((s,f)=>s+W.reduce((t,[k,wt],i)=>t+(Number(f[i+1])||0)*wt,0),0));
    const tot=k=>sal?c.swTot(k):pwRef(c.S.inc.name)+c.INC.T.L(k)+c.INC.T.totalRow;
    line('Control figure now',pwF('ROUND('+W.map(([k,wt])=>wt+'*'+tot(k)).join('+')+',0)',exp));line('Control figure when downloaded',exp);
    line('Result',pwF('IF(B'+(r-2)+'=B'+(r-1)+',"Unchanged since download","⚠ Figures changed after download")'));
    line('How it works','The control figure is worked out from the totals. If any input is changed after download the two figures no longer match. The download code is recorded in SalonOS’s Audit Log, so a copy can be matched to what was downloaded.');}
  r++;line('How to read this workbook',undefined,{bold:true});
  ['Blue figures are data from SalonOS — change one and every formula that uses it recalculates.','Black figures are Excel formulas — click a cell to see how it is worked out.','Yellow “What-if” cells are for trying a change — the What-if columns show the result without touching the real figures.',
   'The Check column on each row compares the formula with the figure SalonOS shows. ✓ means they agree.',
   sal?'Salary Working: Gross = Monthly salary ÷ days in month × payable days (salary as in force that month); Net = Gross + Arrears + Tea − PF − ESIC − Professional Tax − TDS − Penalty − Advance Adj.':'Inc Working: Target = Salary × times; incentive = Achieved × Rate %, or the pool / flat / typed-in amount shown in each Basis column.',
   'Mem Pool works out the membership incentive under the outlet’s rule (A/B/C); Inc Rules works out the manager pool from the month’s collection and target.'].forEach(x=>line('•',x));
  ws.views=[{state:'normal'}];
}

// ── all outlets in one workbook ──
async function pwAllOutlets(salons,y,m){
  await loadExcelJS();const wb=new ExcelJS.Workbook();wb.creator='SalonOS';wb.created=new Date();const sum=wb.addWorksheet('Summary');const res=[];
  for(let i=0;i<salons.length;i++){const s=salons[i];const px='O'+(i+1)+' ';try{const r=await pwBuild(s,y,m,{kind:'salary',wb,px,multi:true});res.push({s,px,c:r.ctx});}catch(e){res.push({s,px,err:e.message||String(e)});}}
  pwTitle(sum,'Salary and incentive — all outlets — '+PW_MONTHS[m]+' '+y+' · each outlet’s sheets start with its code (O1, O2 …)');
  const rows=res.map(x=>({code:x.px.trim(),name:x.s.name||'',emp:x.c?x.c.E.length:0,gross:x.c?()=>pwF(x.c.swTot('gross')):null,net:x.c?()=>pwF(x.c.swTot('net')):null,pf:x.c?()=>pwF(x.c.swTot('pfEr')):null,es:x.c?()=>pwF(x.c.swTot('esEr')):null,
    inc:x.c?()=>pwF(pwRef(x.c.S.inc.name)+x.c.INC.T.L('tot')+x.c.INC.T.totalRow):null,note:x.err?'Could not build: '+x.err:''}));
  pwTable(sum,2,[{key:'code',h:'Code',w:7},{key:'name',h:'Outlet',w:34},{key:'emp',h:'Employees'},{key:'gross',h:'Gross salary'},{key:'net',h:'Net salary'},{key:'pf',h:'Employer PF'},{key:'es',h:'Employer ESIC'},{key:'inc',h:'Monthly incentive'},{key:'note',h:'Note',w:30}],rows,{total:['emp','gross','net','pf','es','inc']});
  return wb;
}

// ── download / email ──
async function pwSave(wb,filename){const buf=await wb.xlsx.writeBuffer();const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);return blob;}
function pwFileName(salon,y,m,kind){return(kind==='salary'?'Salary':'Incentive')+' Working full workings — '+String(salon.name||'').split('—')[0].trim()+' — '+PW_MONTHS[m]+' '+y+'.xlsx';}
async function pwEmail(salon,y,m,kind,wb,toSelf){
  const buf=await wb.xlsx.writeBuffer();const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  return emailCall('send_workbook',{outletId:Number(salon.id),month:PW_MONTHS[m]+' '+y,kind,fileName:pwFileName(salon,y,m,kind),xlsx:await blobToBase64(blob),toSelf:!!toSelf});
}
async function pwAutoEmail(salon,y,m){
  try{if(!salon||!controlOn('payWorkbookEmail',salon.id))return;const k=outletKey('salonos_pay_wb_emailed',salon.id);let sent={};try{sent=JSON.parse(cachedLocalGet(k)||'{}')||{};}catch(e){}const ym=y+'-'+String(m+1).padStart(2,'0');if(sent[ym])return;
    const {wb}=await pwBuild(salon,y,m,{kind:'salary'});const r=await pwEmail(salon,y,m,'salary',wb,false)||{};sent[ym]={at:new Date().toISOString(),to:(r.sentTo||[]).join(', ')};safeLocalSet(k,JSON.stringify(sent));
    try{logAuditEvent(salon.id,{entity:'Salary Working',entityId:ym,action:'Full workings emailed',summary:(r.sentTo||[]).join(', ')});}catch(e){}
    if(typeof _addToast==='function')_addToast('Salary full workings emailed to '+((r.sentTo||[]).join(', ')||'the report recipients'),'success',6000);
  }catch(e){if(typeof _addToast==='function')_addToast('Could not email the salary workings: '+(e.message||e),'error',8000);}
}
function PwDownloadModal({salon,y,m,kind,preselected,onClose}){
  const h=React.createElement;const sid=salon.id;const extras=PW_EXTRAS.filter(x=>x.kinds.includes(kind)&&controlOn(x.ctl,sid));
  const emps=kind==='salary'?getEmployeesForMonth(y,m,sid):getEmployeesForMonth(y,m,sid).filter(e=>e.desig!=='Helper'&&e.desig!=='Housekeeper');
  const [pick,setPick]=React.useState(()=>new Set(extras.map(x=>x.key)));const [who,setWho]=React.useState(()=>new Set((preselected&&preselected.size?[...preselected]:emps.map(e=>e.id)).map(String)));
  const [prot,setProt]=React.useState(false);const [busy,setBusy]=React.useState('');const [msg,setMsg]=React.useState('');
  const go=async(email)=>{setBusy(email?'email':'dl');setMsg('');try{const {wb}=await pwBuild(salon,y,m,{kind,extras:[...pick],emp:who.size===emps.length?null:who,protect:prot});
      if(email){const r=await pwEmail(salon,y,m,kind,wb,true)||{};setMsg('✓ Emailed to '+((r.sentTo||[]).join(', ')||'the report recipients'));}else{await pwSave(wb,pwFileName(salon,y,m,kind));onClose();}}catch(e){setMsg('⚠ '+(e.message||e));}setBusy('');};
  const tog=(setter,k)=>setter(s=>{const n=new Set(s);if(n.has(k))n.delete(k);else n.add(k);return n;});
  return h('div',{className:'modal-overlay',onClick:onClose},h('div',{className:'modal',style:{width:620,maxWidth:'96vw',maxHeight:'90vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    h('div',{className:'modal-title'},'⬇ '+(kind==='salary'?'Salary':'Incentive')+' Working — full workings · '+PW_MONTHS[m]+' '+y),
    h('div',{style:{fontSize:12.5,color:'var(--text2)',marginBottom:8}},extras.length?'The working sheets are always included. Pick the extra sheets and the employees:':'Pick the employees:'),
    extras.length>0&&h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:4,marginBottom:10}},extras.map(x=>h('label',{key:x.key,style:{fontSize:13,display:'flex',gap:6,alignItems:'center'}},h('input',{type:'checkbox',checked:pick.has(x.key),onChange:()=>tog(setPick,x.key)}),x.label))),
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'6px 0'}},h('b',{style:{fontSize:13}},'Employees ('+who.size+' of '+emps.length+')'),h('span',null,h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setWho(new Set(emps.map(e=>String(e.id))))},'All'),h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setWho(new Set())},'None'))),
    h('div',{style:{maxHeight:200,overflowY:'auto',border:'1px solid var(--border)',borderRadius:8,padding:6,marginBottom:10}},emps.map(e=>h('label',{key:e.id,style:{fontSize:12.5,display:'flex',gap:6,alignItems:'center',padding:'2px 0'}},h('input',{type:'checkbox',checked:who.has(String(e.id)),onChange:()=>tog(setWho,String(e.id))}),e.name+(e.desig?' · '+e.desig:'')))),
    controlOn('payWbProtected',sid)&&h('label',{style:{fontSize:13,display:'flex',gap:6,alignItems:'center',marginBottom:6}},h('input',{type:'checkbox',checked:prot,onChange:e=>setProt(e.target.checked)}),'Protected copy — formulas visible, cells locked (only the yellow what-if cells can be typed in)'),
    msg&&h('div',{style:{fontSize:12.5,margin:'6px 0',color:msg.startsWith('✓')?'var(--green)':'var(--red)'}},msg),
    h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Close'),
      controlOn('payWorkbookEmail',sid)&&h('button',{className:'btn btn-ghost',disabled:!!busy||!who.size,onClick:()=>go(true)},busy==='email'?'Sending…':'📧 Email to report recipients + me'),
      h('button',{className:'btn btn-primary',disabled:!!busy||!who.size,onClick:()=>go(false)},busy==='dl'?'Building…':'⬇ Download'))));
}
function pwOpenModal(props){const el=document.createElement('div');document.body.appendChild(el);const root=ReactDOM.createRoot(el);const close=()=>{root.unmount();el.remove();};
  root.render(React.createElement(PwDownloadModal,{...props,onClose:close}));}
async function pwDirect(salon,y,m,kind,toast,preselected){try{const {wb}=await pwBuild(salon,y,m,{kind,emp:preselected&&preselected.size?new Set([...preselected].map(String)):null});await pwSave(wb,pwFileName(salon,y,m,kind));}catch(e){if(toast)toast('Could not build the workbook: '+(e.message||e));else window.alert(e.message||e);}}
function pwDownloadSalary(salon,y,m,toast,preselected){if(controlOn('payWbChooser',salon.id))pwOpenModal({salon,y,m,kind:'salary',preselected});else pwDirect(salon,y,m,'salary',toast,preselected);}
function pwDownloadIncentive(salon,y,m,toast,preselected){if(controlOn('payWbChooser',salon.id))pwOpenModal({salon,y,m,kind:'incentive',preselected});else pwDirect(salon,y,m,'incentive',toast,preselected);}
async function pwDownloadAllOutlets(salons,y,m,toast){try{const wb=await pwAllOutlets(salons,y,m);await pwSave(wb,'Salary workings — all outlets — '+PW_MONTHS[m]+' '+y+'.xlsx');}catch(e){if(toast)toast('Could not build the workbook: '+(e.message||e),'error');else window.alert(e.message||e);}}
// kept for anything calling the first version
async function pwSalaryWorkbook(salon,y,m){return(await pwBuild(salon,y,m,{kind:'salary'})).wb;}
async function pwIncentiveWorkbook(salon,y,m){return(await pwBuild(salon,y,m,{kind:'incentive'})).wb;}
