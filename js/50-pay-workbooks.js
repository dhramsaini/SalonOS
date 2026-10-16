// ═════════════════════════════════════════════════════════════════════════════════════════════
// Salary Working & Incentive Working — full workings in Excel (Controls → payWorkbooks).
// Every figure the app works out by a formula is a live Excel formula that points at the data it
// came from, in the same workbook: attendance day by day, salary inputs, PF / ESIC / PT rules and
// slabs, tea, advances and penalties ledgers, sales per stylist, targets, service rate slabs,
// manager pool. Figures that are typed in or come from a pool (manual amounts, membership rule
// pools, TDS, overrides) come in as data with their basis written beside them. Blue = data from
// SalonOS (change it to test), black = formula. A Check column on each row compares the formula's
// answer with the app's own figure, so any difference shows at once.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const PW_BLUE={argb:'FF1F4E99'};
const PW_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const PW_ATT_CODE={present:'P',off:'WO',holiday:'H',half:'HD',absent:'A',notjoined:'NJ',left:'L'};
function pwRef(sheet){return "'"+String(sheet).replace(/'/g,"''")+"'!";}
function pwF(formula,result){return result===undefined||result===null||(typeof result==='number'&&!isFinite(result))?{formula}:{formula,result};}
function pwHeader(row){row.eachCell(c=>{c.fill=EXCEL_HEADER_FILL;c.font=EXCEL_HEADER_FONT;c.border=EXCEL_THIN_BORDER;c.alignment={vertical:'middle',horizontal:'center',wrapText:true};});row.height=32;}
// cols: [{key,h,w,input,fmt}] — writes header at startRow and data rows below; returns {L(key), first, last}
function pwTable(ws,startRow,cols,rows,opts){
  const idx={};cols.forEach((c,i)=>idx[c.key]=i+1);const L=k=>excelColLetter(idx[k]);
  const hr=ws.getRow(startRow);cols.forEach((c,i)=>{hr.getCell(i+1).value=c.h;});pwHeader(hr);
  rows.forEach((obj,ri)=>{const r=ws.getRow(startRow+1+ri);cols.forEach((c,i)=>{const cell=r.getCell(i+1);let v=typeof obj[c.key]==='function'?obj[c.key](startRow+1+ri,L):obj[c.key];if(v===undefined)v=null;cell.value=v;cell.border=EXCEL_THIN_BORDER;
    if(c.input)cell.font={color:PW_BLUE};if(c.fmt)cell.numFmt=c.fmt;else if(typeof v==='number'||(v&&v.formula))cell.numFmt='#,##0';if(ri%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF7F9FC'}};});});
  const first=startRow+1,last=startRow+rows.length;
  if(opts&&opts.total&&rows.length){const tr=ws.getRow(last+1);tr.getCell(1).value='TOTAL';cols.forEach((c,i)=>{const cell=tr.getCell(i+1);if(opts.total.includes(c.key))cell.value={formula:'SUM('+L(c.key)+first+':'+L(c.key)+last+')'};
    cell.font={bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEEF3FA'}};cell.border={...EXCEL_THIN_BORDER,top:{style:'medium',color:{argb:'FF14335E'}}};if(c.fmt)cell.numFmt=c.fmt;else cell.numFmt='#,##0';});}
  cols.forEach((c,i)=>{ws.getColumn(i+1).width=c.w||12;});
  if(!(opts&&opts.noFreeze))ws.views=[{state:'frozen',xSplit:(opts&&opts.xSplit)!=null?opts.xSplit:2,ySplit:startRow}];
  return{L,first,last};
}
// key/value block (rules) — returns absolute refs by key
function pwRules(ws,startRow,title,items){
  const t=ws.getRow(startRow);t.getCell(1).value=title;t.getCell(1).font={bold:true,size:12,color:{argb:'FF14335E'}};const refs={};
  items.forEach((it,i)=>{const r=ws.getRow(startRow+1+i);r.getCell(1).value=it[1];const c=r.getCell(2);c.value=it[2];c.font={color:PW_BLUE,bold:true};c.border=EXCEL_THIN_BORDER;if(it[3])c.numFmt=it[3];if(it[4]){r.getCell(3).value=it[4];r.getCell(3).font={italic:true,color:{argb:'FF6B7385'}};}
    refs[it[0]]=pwRef(ws.name)+'$B$'+(startRow+1+i);});
  ws.getColumn(1).width=Math.max(ws.getColumn(1).width||0,44);ws.getColumn(2).width=Math.max(ws.getColumn(2).width||0,16);ws.getColumn(3).width=Math.max(ws.getColumn(3).width||0,60);
  return{refs,next:startRow+items.length+2};
}
function pwCheck(fRef,appRef){return pwF('IF(ROUND('+fRef+',0)=ROUND('+appRef+',0),"✓","Differs by "&TEXT('+fRef+'-'+appRef+',"#,##0"))');}
function pwAbout(ws,title,salon,y,m,lines){
  ws.getColumn(1).width=110;const add=(v,font)=>{const r=ws.addRow([v]);if(font)r.getCell(1).font=font;r.getCell(1).alignment={wrapText:true,vertical:'top'};};
  add(title,{bold:true,size:16,color:{argb:'FF14335E'}});add((salon&&salon.name||'')+' · '+PW_MONTHS[m]+' '+y,{bold:true,size:12});
  add('Downloaded '+new Date().toLocaleString('en-IN')+((currentSessionUser()||{}).name?' by '+currentSessionUser().name:''),{color:{argb:'FF6B7385'}});add('');
  add('How to read this workbook',{bold:true});
  ['Blue figures are data taken from SalonOS — change one and every formula that uses it recalculates.','Black figures are Excel formulas — click any cell to see exactly how it is worked out and which sheet it comes from.',
   'The Check column on each row compares the formula with the figure SalonOS shows. ✓ means they agree.',...(lines||[])].forEach(x=>add('•  '+x));
}
async function pwDownload(wb,filename){const buf=await wb.xlsx.writeBuffer();const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}

// ── Advances (both recovery sources) and Penalties ledgers ──
function pwAdvancesSheet(ws,sid){
  let list=[];try{list=JSON.parse(cachedLocalGet(outletKey('salonos_advances',sid))||'[]');}catch(e){}
  return{list:list.filter(a=>a&&a.status==='Active'),write:(y,m)=>{
    const rows=list.filter(a=>a&&a.status==='Active').map(a=>{const sch=scheduledAmountFor(a,y,m);return{emp:a.emp,from:a.deductFrom||'Salary',date:a.date||'',amount:Number(a.amount)||0,outstanding:Number(a.outstanding)||0,
      basis:sch!==null?'Month-wise schedule':'Monthly repayment',planned:sch!==null?sch:(Number(a.repayment)||0),ded:(r,L)=>pwF('MAX(0,MIN('+L('planned')+r+','+L('outstanding')+r+'))',Math.max(0,Math.min(sch!==null?sch:(Number(a.repayment)||0),Number(a.outstanding)||0)))};});
    ws.addRow(['Active advances — this month\'s deduction is the planned amount, never more than what is still outstanding']).getCell(1).font={bold:true,color:{argb:'FF14335E'}};
    return pwTable(ws,2,[{key:'emp',h:'Employee',w:24,input:true},{key:'from',h:'Recover from',w:12,input:true},{key:'date',h:'Date given',w:12,input:true},{key:'amount',h:'Amount given',input:true},
      {key:'outstanding',h:'Outstanding',input:true},{key:'basis',h:'Planned from',w:20,input:true},{key:'planned',h:'Planned this month',input:true},{key:'ded',h:'Deduction this month'}],rows,{total:['amount','outstanding','planned','ded'],xSplit:1});}};
}
function pwPenaltiesSheet(ws,sid,y,m){
  let list=[];try{list=JSON.parse(cachedLocalGet(outletKey('salonos_penalties',sid))||'[]');}catch(e){}
  const rows=list.filter(p=>p&&p.emp&&p.date).filter(p=>{const d=new Date(p.date+'T00:00:00');return!isNaN(d)&&d.getFullYear()===y&&d.getMonth()===m;})
    .sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(p=>({date:p.date,emp:p.emp,type:p.type==='Other'?(p.otherType||'Other'):(p.type||''),amount:Number(p.amount)||0}));
  ws.addRow(['Penalties dated in '+PW_MONTHS[m]+' '+y]).getCell(1).font={bold:true,color:{argb:'FF14335E'}};
  return pwTable(ws,2,[{key:'date',h:'Date',w:12,input:true},{key:'emp',h:'Employee',w:24,input:true},{key:'type',h:'Type',w:22,input:true},{key:'amount',h:'Amount',input:true}],rows,{total:['amount'],xSplit:1});
}

// ── Incentive sheets (Inc Rules, Sales, Inc Working) — used by both workbooks ──
function pwIncentiveSheets(wb,sid,y,m,wsRules,wsSales,wsInc,advRefs){
  const run=fn=>typeof withIncPlan==='function'?withIncPlan(sid,y,m,fn):fn();
  return run(()=>{
    const W=incWorkingsForLive(sid,y,m);const appl=loadIncentiveApplicability(sid);const cols=loadIWCols(sid);const splitMode=loadIncentiveSplitMode(sid);
    const actuals=loadIncentiveActuals(sid);const iwMeta=loadIWMeta(sid);const mgrIn=loadMgrIncentiveInputs(sid,y,m)||{};const pool=managerIncentivePoolFor(sid,y,m);const dim=new Date(y,m+1,0).getDate();
    const R=pwRules(wsRules,1,'Incentive rules — '+PW_MONTHS[m]+' '+y,[
      ['applSvc','Service incentive switched on',!!appl.service],['applMem','Membership incentive switched on',!!appl.membership],['applProd','Product incentive switched on',!!appl.product],['applMgr','Manager incentive switched on',!!appl.manager],
      ['colSvc','Service column on (Incentive Working)',!!cols.svcTarget],['colMem','Membership column on',!!cols.membership],['colProd','Product column on',!!cols.product],
      ['colPen','Penalty column on',!!cols.penalty],['colAdv','Advance Adj. column on',!!cols.advAdj],['colOT','Overtime (OT) column on',!!cols.ot],
      ['dim','Days in the month',dim],['pool','Manager incentive pool ₹',Math.round(pool||0),'#,##0','Collection vs target pool from the Manager Incentive panel; each manager gets their Share %']]);
    // service rate slabs, one table per designation group in use
    const groups=[...new Set(W.map(w=>splitMode.service?incentiveGroupFor(w,sid):'__all'))];let row=R.next;const slabRef={};
    groups.forEach(g=>{const sl=loadServiceSlabs(sid,g==='__all'?undefined:g)||[];const base=Number(sl[0]&&sl[0].rate)||0;
      const tiers=sl.slice(1).map(t=>({th:Number(t.threshold),rate:Number(t.rate)||0})).filter(t=>!isNaN(t.th)).sort((a,b)=>a.th-b.th);
      const hr=wsRules.getRow(row);hr.getCell(1).value='Service rate slabs'+(g==='__all'?'':' — '+g)+' (rate by ×times of salary achieved in Service)';hr.getCell(1).font={bold:true,color:{argb:'FF14335E'}};row++;
      const h2=wsRules.getRow(row);['Reached at least (×times)','Rate %'].forEach((x,i)=>{h2.getCell(i+1).value=x;});pwHeader(h2);row++;
      const br=wsRules.getRow(row);br.getCell(1).value='Below the first tier';br.getCell(2).value=base;br.getCell(2).font={color:PW_BLUE};const baseRef=pwRef(wsRules.name)+'$B$'+row;row++;
      const t0=row;tiers.forEach(t=>{const r=wsRules.getRow(row);r.getCell(1).value=t.th;r.getCell(2).value=t.rate;r.getCell(1).font={color:PW_BLUE};r.getCell(2).font={color:PW_BLUE};row++;});
      slabRef[g]={base:baseRef,thr:tiers.length?pwRef(wsRules.name)+'$A$'+t0+':$A$'+(row-1):null,rate:tiers.length?pwRef(wsRules.name)+'$B$'+t0+':$B$'+(row-1):null};row++;});
    // Sales sheet — what each stylist sold (Staff Work report, else the figures typed into Incentive Working)
    const sales=W.map(w=>{const rep=staffWorkReportRowFor(sid,y,m,w.billingId);const a=actuals[incActualKey(w.id,y,m)]||{};
      return rep?{id:w.id,name:w.name,src:'CRADLE Staff Work report',svc:Number(rep['ServiceSale'])||0,pkg:Number(rep['PackageSale'])||0,comp:Number(rep['ComplementarySale'])||0,mem:Number(rep['MemberShipSale'])||0,prod:Number(rep['ProductSale'])||0}
        :{id:w.id,name:w.name,src:'Typed in Incentive Working',svc:Number(a.svcActual)||0,pkg:0,comp:0,mem:Number(a.memActual)||0,prod:Number(a.prodActual)||0};});
    wsSales.addRow(['Sales per employee — Service counted = Service + Package + ½ Complementary']).getCell(1).font={bold:true,color:{argb:'FF14335E'}};
    const S=pwTable(wsSales,2,[{key:'id',h:'Emp ID',w:10,input:true},{key:'name',h:'Employee',w:24,input:true},{key:'src',h:'Source',w:26,input:true},{key:'svc',h:'Service sale',input:true},{key:'pkg',h:'Package sale',input:true},
      {key:'comp',h:'Complementary sale',input:true},{key:'mem',h:'Membership sale',input:true},{key:'prod',h:'Product sale',input:true}],sales,{total:['svc','pkg','comp','mem','prod']});
    const sRef=k=>pwRef(wsSales.name)+S.L(k);
    // Incentive Working
    const IW=[{key:'id',h:'Emp ID',w:10,input:true},{key:'name',h:'Employee',w:22,input:true},{key:'desig',h:'Designation',w:16,input:true},{key:'salary',h:'Salary',input:true},
      {key:'mS',h:'Svc target ×salary',input:true,fmt:'0.0#'},{key:'mM',h:'Mem target ×salary',input:true,fmt:'0.0#'},{key:'mP',h:'Prod target ×salary',input:true,fmt:'0.0#'},
      {key:'aS',h:'Svc achieved'},{key:'tS',h:'Svc target'},{key:'pS',h:'Svc %',fmt:'0'},{key:'xS',h:'Svc ×times',fmt:'0.00'},{key:'bS',h:'Svc basis',w:16,input:true},{key:'rS',h:'Svc rate %',fmt:'0.0#'},{key:'vS',h:'Svc manual ₹',input:true},{key:'iS',h:'Svc incentive'},
      {key:'aM',h:'Mem achieved'},{key:'tM',h:'Mem target'},{key:'pM',h:'Mem %',fmt:'0'},{key:'bM',h:'Mem basis',w:18,input:true},{key:'rM',h:'Mem rate %',input:true,fmt:'0.0#'},{key:'vM',h:'Mem ₹ (pool / manual)',input:true},{key:'iM',h:'Mem incentive'},
      {key:'aP',h:'Prod achieved'},{key:'tP',h:'Prod target'},{key:'pP',h:'Prod %',fmt:'0'},{key:'bP',h:'Prod basis',w:16,input:true},{key:'rP',h:'Prod rate %',input:true,fmt:'0.0#'},{key:'vP',h:'Prod ₹ (flat / manual)',input:true},{key:'iP',h:'Prod incentive'},
      {key:'bG',h:'Mgr basis',w:16,input:true},{key:'sG',h:'Mgr share %',input:true,fmt:'0.0#'},{key:'vG',h:'Mgr manual ₹',input:true},{key:'iG',h:'Mgr incentive'},
      {key:'oA',h:'OT applies',input:true},{key:'oN',h:'Normal hrs / day',input:true,fmt:'0.0#'},{key:'oH',h:'OT hours',input:true,fmt:'0.0#'},{key:'iO',h:'OT incentive'},
      {key:'pen',h:'Penalty (entered)',input:true},{key:'iPen',h:'Penalty'},{key:'advB',h:'Advance basis',w:18,input:true},{key:'advV',h:'Advance settled ₹',input:true},{key:'iAdv',h:'Advance Adj.'},
      {key:'tot',h:'Total incentive'},{key:'app',h:'SalonOS total',input:true},{key:'chk',h:'Check',w:14}];
    const rows=W.map((w,i)=>{const sr=S.first+i;const isMgr=MANAGER_DESIGNATIONS.has(w.desig);const cm=w.calcMode||{};const ov=w.manualOv||{};const g=splitMode.service?incentiveGroupFor(w,sid):'__all';const sl=slabRef[g]||slabRef.__all||{base:'0'};
      const im=iwMeta[attMonthKey(w.id,y,m)];const settled=!!(im&&im.advanceSettled&&Array.isArray(im.advanceSettledBreakdown));const a=actuals[incActualKey(w.id,y,m)]||{};
      const svcB=cm.svc==='manualAmt'?'Manual ₹':cm.svc==='manualRate'?'Manual rate %':'Rate slab';
      const memB=cm.mem==='manualAmt'?'Manual ₹':cm.mem==='manualRate'?'Manual rate %':'Membership rule '+(typeof loadMemRuleType==='function'?loadMemRuleType(sid):'')+' (pool)';
      const prodB=cm.prod==='manualAmt'?'Manual ₹':cm.prod==='manualRate'?'Manual rate %':w.prodRuleType==='B'?'Rule B flat ₹':'Rule A rate %';
      const mgrB=!isMgr?'Not a manager':ov.mgr?'Manual ₹':'Share of pool';
      return{id:w.id,name:w.name,desig:w.desig||'',salary:Number(w.salary)||0,mS:targetMultFor('svc',sid,w,splitMode),mM:targetMultFor('mem',sid,w,splitMode),mP:targetMultFor('prod',sid,w,splitMode),
        aS:(r,L)=>pwF('IF('+R.refs.colSvc+','+sRef('svc')+sr+'+'+sRef('pkg')+sr+'+0.5*'+sRef('comp')+sr+',0)'),tS:(r,L)=>pwF('IF('+R.refs.colSvc+','+L('salary')+r+'*'+L('mS')+r+',0)',w.svcTarget),
        pS:(r,L)=>pwF('IF('+L('tS')+r+'=0,0,MIN(100,ROUND('+L('aS')+r+'/'+L('tS')+r+'*100,0)))',w.svcPct),xS:(r,L)=>pwF('IF('+L('salary')+r+'=0,0,'+L('aS')+r+'/'+L('salary')+r+')',w.svcTimesRaw),bS:svcB,
        rS:(r,L)=>svcB==='Manual rate %'?Number(w.svcRate)||0:svcB==='Manual ₹'?null:pwF(sl.thr?'IF(OR(COUNT('+sl.thr+')=0,'+L('xS')+r+'<MIN('+sl.thr+')),'+sl.base+',INDEX('+sl.rate+',MATCH('+L('xS')+r+','+sl.thr+',1)))':sl.base,w.svcRateUsed),
        vS:svcB==='Manual ₹'?Number(w.svcManualAmt)||0:null,
        iS:(r,L)=>pwF('IF('+R.refs.applSvc+','+(svcB==='Manual ₹'?L('vS')+r:'ROUND('+L('aS')+r+'*'+L('rS')+r+'/100,0)')+',0)',w.svcIncAmt),
        aM:(r,L)=>pwF('IF('+R.refs.colMem+','+sRef('mem')+sr+',0)'),tM:(r,L)=>pwF('IF('+R.refs.colMem+','+L('salary')+r+'*'+L('mM')+r+',0)',w.memTarget),pM:(r,L)=>pwF('IF('+L('tM')+r+'=0,0,MIN(100,ROUND('+L('aM')+r+'/'+L('tM')+r+'*100,0)))',w.memPct),
        bM:memB,rM:Number(w.memRateUsed)||0,vM:memB==='Manual rate %'?null:(memB==='Manual ₹'?Number(w.memManualAmt)||0:Number(w.memIncAmt)||0),
        iM:(r,L)=>pwF('IF('+R.refs.applMem+','+(memB==='Manual rate %'?'ROUND('+L('aM')+r+'*'+L('rM')+r+'/100,0)':L('vM')+r)+',0)',w.memIncAmt),
        aP:(r,L)=>pwF('IF('+R.refs.colProd+','+sRef('prod')+sr+',0)'),tP:(r,L)=>pwF('IF('+R.refs.colProd+','+L('salary')+r+'*'+L('mP')+r+',0)',w.prodTarget),pP:(r,L)=>pwF('IF('+L('tP')+r+'=0,0,MIN(100,ROUND('+L('aP')+r+'/'+L('tP')+r+'*100,0)))',w.prodPct),
        bP:prodB,rP:(prodB==='Manual rate %'||prodB==='Rule A rate %')?Number(w.prodRateUsed)||0:null,vP:prodB==='Manual ₹'?Number(w.prodManualAmt)||0:prodB==='Rule B flat ₹'?Number(w.prodFlatAmount)||0:null,
        iP:(r,L)=>pwF('IF('+R.refs.applProd+','+((prodB==='Manual ₹'||prodB==='Rule B flat ₹')?L('vP')+r:'ROUND('+L('aP')+r+'*'+L('rP')+r+'/100,0)')+',0)',w.prodIncAmt),
        bG:mgrB,sG:isMgr&&!ov.mgr?Number((mgrIn.shares||{})[w.id])||0:null,vG:isMgr&&ov.mgr?Number(w.mgrManualAmt)||0:null,
        iG:(r,L)=>pwF(!isMgr?'0':'IF('+R.refs.applMgr+','+(ov.mgr?L('vG')+r:'ROUND('+R.refs.pool+'*'+L('sG')+r+'/100,0)')+',0)',w.mgrIncAmt),
        oA:!!w.otApplicable,oN:Number(w.otNormalHours)||0,oH:Number(w.otHours)||0,
        iO:(r,L)=>pwF('IF(AND('+R.refs.colOT+','+L('oA')+r+','+L('oN')+r+'>0,'+L('oH')+r+'>0),ROUND('+L('salary')+r+'/'+R.refs.dim+'/'+L('oN')+r+'*'+L('oH')+r+',0),0)',w.otAmt),
        pen:Number(a.penaltyAmt)||0,iPen:(r,L)=>pwF('IF('+R.refs.colPen+','+L('pen')+r+',0)',w.penaltyAmt),
        advB:settled?'Settled on approval':'Active advances',advV:settled?im.advanceSettledBreakdown.reduce((s,b)=>s+(Number(b.amount)||0),0):null,
        iAdv:(r,L)=>pwF('IF('+R.refs.colAdv+','+(settled?L('advV')+r:'SUMIFS('+advRefs.ded+','+advRefs.emp+','+L('name')+r+','+advRefs.from+',"Incentive")')+',0)',w.advAdj),
        tot:(r,L)=>pwF('MAX(0,'+['iS','iM','iP','iG','iO'].map(k=>L(k)+r).join('+')+'-'+L('iPen')+r+'-'+L('iAdv')+r+')',w.totalInc),app:Number(w.totalInc)||0,chk:(r,L)=>pwCheck(L('tot')+r,L('app')+r)};});
    wsInc.addRow(['Incentive Working — '+PW_MONTHS[m]+' '+y+' · Total = Service + Membership + Product + Manager + OT − Penalty − Advance Adj. (never below 0)']).getCell(1).font={bold:true,color:{argb:'FF14335E'}};
    const T=pwTable(wsInc,2,IW,rows,{total:['salary','aS','tS','iS','aM','tM','iM','aP','tP','iP','iG','iO','iPen','iAdv','tot','app']});
    return{T,W,sheet:wsInc.name};
  });
}

// ── Workbooks ──
async function pwSalaryWorkbook(salon,y,m){
  await loadExcelJS();const sid=salon.id;const wb=new ExcelJS.Workbook();wb.creator='SalonOS';wb.created=new Date();
  const wsAbout=wb.addWorksheet('About'),wsSW=wb.addWorksheet('Salary Working'),wsAtt=wb.addWorksheet('Attendance'),wsRules=wb.addWorksheet('Pay Rules'),wsAdv=wb.addWorksheet('Advances'),wsPen=wb.addWorksheet('Penalties'),
    wsInc=wb.addWorksheet('Inc Working'),wsSales=wb.addWorksheet('Sales'),wsIR=wb.addWorksheet('Inc Rules');
  const E=getEmployeesForMonth(y,m,sid);const SW=swWorkingsFor(sid,y,m);const byId={};SW.forEach(w=>byId[w.id]=w);const att=loadAttendance(sid);const cols=loadSWCols(sid);const tea=loadTeaConfig(sid);const meta=loadSWMeta(sid);
  const rec=getSalonRecordById(sid)||{};const dim=new Date(y,m+1,0).getDate();const ceiling=pfWageCeilingFor(y,m);const state=rec.state||'';const ptOn=ptAppliesToState(state);const slabs=ptOn?(loadPtSlabs(sid,state)||[]):[];
  pwAbout(wsAbout,'Salary Working — full workings',salon,y,m,['Salary Working: Gross = Monthly salary ÷ days in month × payable days; Net = Gross + Tea − PF − ESIC − Professional Tax − TDS − Penalty − Advance Adj. (never below 0).',
    'Attendance: payable days = days in month − Left − Not joined − Absent − ½ Half days − not marked − adjustment + (allowed week-offs − week-offs taken) + paid leave.',
    'Pay Rules: PF 12% of basic up to the PF wage ceiling, ESIC 0.75% of monthly salary up to ₹21,000, Professional Tax by the state slabs, tea, and which columns are switched on.',
    'Advances and Penalties: the ledgers the deductions are summed from. Inc Working / Sales / Inc Rules: the incentive workings behind the incentive columns (shown for reference — not part of Net Salary).',
    'TDS and any PF / ESIC / PT figure typed in by hand (an override) come in as data — the formula uses the typed figure when there is one.']);
  const R=pwRules(wsRules,1,'Pay rules — '+PW_MONTHS[m]+' '+y,[
    ['dim','Days in the month',dim],['pfRate','PF rate (employee and employer)',0.12,'0.00%'],['pfCeil','PF wage ceiling ₹',ceiling,'#,##0',typeof pfCeilingLabel==='function'?'Ceiling for this month: '+pfCeilingLabel(y,m):''],
    ['esicRate','ESIC employee rate',0.0075,'0.00%'],['esicEr','ESIC employer rate',0.0325,'0.00%'],['esicLimit','ESIC applies up to monthly salary ₹',21000,'#,##0'],
    ['pfReg','Outlet registered for PF',!!rec.pfApplicable],['esicReg','Outlet registered for ESIC',!!rec.esicApplicable],['ptOn','Professional Tax applies in '+(state||'this state'),ptOn],
    ['teaMode','Tea — per day or fixed',tea.mode==='perDay'?'perDay':'fixed'],['teaRate','Tea rate ₹',Number(tea.rate)||0,'#,##0'],
    ...[['tea','Tea'],['pfEmp','PF (Emp)'],['esic','ESIC (Emp)'],['pt','Professional Tax'],['tds','TDS'],['penalties','Penalty'],['advAdj','Advance Adj.'],['serviceInc','Service Incentive'],['memInc','Mem Inc'],['prodInc','Prod Inc'],['mgrInc','MGR Inc'],['nonPerfPenalty','Non-Performance Penalty'],['totalInc','Total Inc']]
      .map(([k,l])=>['col_'+k,l+' column switched on',!!cols[k]])]);
  // PT slabs
  let row=R.next;const ptT=row;wsRules.getRow(row).getCell(1).value='Professional Tax slabs — '+(state||'—')+' (first slab whose "up to" covers the monthly salary)';wsRules.getRow(row).getCell(1).font={bold:true,color:{argb:'FF14335E'}};row++;
  const ph=wsRules.getRow(row);['Monthly salary up to (blank = above)','PT ₹'].forEach((x,i)=>{ph.getCell(i+1).value=x;});pwHeader(ph);row++;
  const slabCells=slabs.map(s=>{const r=wsRules.getRow(row);r.getCell(1).value=s.upto==null?null:(Number(s.upto)||0);r.getCell(2).value=Number(s.amount)||0;r.getCell(1).font={color:PW_BLUE};r.getCell(2).font={color:PW_BLUE};const ref={upto:pwRef(wsRules.name)+'$A$'+row,amt:pwRef(wsRules.name)+'$B$'+row};row++;return ref;});
  const ptExpr=g=>{if(!ptOn||!slabCells.length)return'0';let ex=slabCells[slabCells.length-1].amt;for(let i=slabCells.length-1;i>=0;i--){const c=slabCells[i];ex='IF(OR('+c.upto+'="",'+g+'<='+c.upto+'),'+c.amt+','+ex+')';}
    return state==='Karnataka'&&m===1?'IF('+ex+'=200,300,'+ex+')':ex;};
  // Advances & penalties
  const ADV=pwAdvancesSheet(wsAdv,sid).write(y,m);const advRefs={emp:pwRef(wsAdv.name)+'$'+ADV.L('emp')+'$'+ADV.first+':$'+ADV.L('emp')+'$'+Math.max(ADV.first,ADV.last),from:pwRef(wsAdv.name)+'$'+ADV.L('from')+'$'+ADV.first+':$'+ADV.L('from')+'$'+Math.max(ADV.first,ADV.last),ded:pwRef(wsAdv.name)+'$'+ADV.L('ded')+'$'+ADV.first+':$'+ADV.L('ded')+'$'+Math.max(ADV.first,ADV.last)};
  const PEN=pwPenaltiesSheet(wsPen,sid,y,m);const penRefs={emp:pwRef(wsPen.name)+'$'+PEN.L('emp')+'$'+PEN.first+':$'+PEN.L('emp')+'$'+Math.max(PEN.first,PEN.last),amt:pwRef(wsPen.name)+'$'+PEN.L('amount')+'$'+PEN.first+':$'+PEN.L('amount')+'$'+Math.max(PEN.first,PEN.last)};
  // Incentive sheets
  const INC=pwIncentiveSheets(wb,sid,y,m,wsIR,wsSales,wsInc,advRefs);const incCol=k=>pwRef(wsInc.name)+'$'+INC.T.L(k)+':$'+INC.T.L(k);const incId=pwRef(wsInc.name)+'$A:$A';
  // Attendance
  const dayCols=Array.from({length:dim},(_,i)=>({key:'d'+(i+1),h:String(i+1),w:4.5,input:true}));
  const attRows=E.map(e=>{const r=att[attMonthKey(e.id,y,m)];const days=((r&&r.days)||genAttDay(e,y,m)).slice(0,dim);const o={id:e.id,name:e.name};days.forEach((d,i)=>{o['d'+(i+1)]=d?(PW_ATT_CODE[d]||d):null;});
    const s=attSummaryFor(e,y,m,r);Object.assign(o,{awo:allowedWeekoffFor(e,y,m,dim),adj:Number(r&&r.adjustment)||0,pl:Number(r&&r.paidLeave)||0,app:s.totalDaysPayable});return o;});
  const D1=excelColLetter(3),DN=excelColLetter(2+dim);const cnt=code=>(r)=>pwF('COUNTIF('+D1+r+':'+DN+r+',"'+code+'")');
  wsAtt.addRow(['Attendance — '+PW_MONTHS[m]+' '+y+' · P Present · WO Week-off · H Holiday · HD Half day · A Absent · NJ Not joined · L Left · blank = not marked']).getCell(1).font={bold:true,color:{argb:'FF14335E'}};
  const A=pwTable(wsAtt,2,[{key:'id',h:'Emp ID',w:9,input:true},{key:'name',h:'Employee',w:22,input:true},...dayCols,
    {key:'cP',h:'P'},{key:'cWO',h:'WO'},{key:'cH',h:'H'},{key:'cHD',h:'HD'},{key:'cA',h:'A'},{key:'cNJ',h:'NJ'},{key:'cL',h:'L'},{key:'nm',h:'Not marked'},
    {key:'awo',h:'Allowed week-offs',input:true},{key:'adj',h:'Adjustment',input:true,fmt:'0.0#'},{key:'pl',h:'Paid leave entered',input:true,fmt:'0.0#'},{key:'plA',h:'Paid leave allowed',fmt:'0.0#'},
    {key:'wd',h:'Working days',fmt:'0.0#'},{key:'xd',h:'Extra days',fmt:'0.0#'},{key:'pay',h:'Payable days',fmt:'0.0#'},{key:'app',h:'SalonOS payable',input:true,fmt:'0.0#'},{key:'chk',h:'Check',w:14}],
    attRows.map(o=>({...o,cP:cnt('P'),cWO:cnt('WO'),cH:cnt('H'),cHD:cnt('HD'),cA:cnt('A'),cNJ:cnt('NJ'),cL:cnt('L'),nm:r=>pwF('COUNTBLANK('+D1+r+':'+DN+r+')'),
      plA:(r,L)=>pwF('MAX(0,MIN('+L('pl')+r+','+L('cA')+r+'+'+L('cHD')+r+'*0.5))'),
      wd:(r,L)=>pwF(R.refs.dim+'-'+L('cL')+r+'-'+L('cNJ')+r+'-'+L('cA')+r+'-'+L('cHD')+r+'*0.5-'+L('nm')+r+'-'+L('adj')+r),xd:(r,L)=>pwF(L('awo')+r+'-'+L('cWO')+r),
      pay:(r,L)=>pwF(L('wd')+r+'+'+L('xd')+r+'+'+L('plA')+r,o.app),chk:(r,L)=>pwF('IF(ABS('+L('pay')+r+'-'+L('app')+r+')<0.001,"✓","Differs by "&TEXT('+L('pay')+r+'-'+L('app')+r+',"0.0#"))')})),{});
  for(let c=3;c<3+dim;c++)wsAtt.getColumn(c).alignment={horizontal:'center'};
  const attRow={};E.forEach((e,i)=>attRow[e.id]=A.first+i);
  // Salary Working
  const ref=k=>R.refs[k];const on=k=>R.refs['col_'+k];
  const swRows=E.map(e=>{const w=byId[e.id]||{};const mt=meta[attMonthKey(e.id,y,m)]||{};const ar=attRow[e.id];const wageCalc=e.pfOnActualBasic?null:pfCappedWage(e.basic,y,m,sid);const ovr=v=>v!=null&&v!==''?Number(v)||0:null;
    const settled=!!(mt.advanceSettled&&Array.isArray(mt.advanceSettledBreakdown));
    return{id:e.id,name:e.name,desig:e.desig||'',status:e.status||'',salary:Number(e.gross)||0,basic:Number(e.basic)||0,
      days:r=>pwF(pwRef(wsAtt.name)+A.L('pay')+ar,w.totalDays),dim:r=>pwF(ref('dim')),gross:(r,L)=>pwF('ROUND('+L('salary')+r+'/'+L('dim')+r+'*'+L('days')+r+',0)',w.grossAfterLop),lop:(r,L)=>pwF('MAX(0,'+L('salary')+r+'-'+L('gross')+r+')',w.lopAmt),
      tea:(r,L)=>pwF('IF(AND('+on('tea')+','+L('status')+r+'="Active"),ROUND(IF('+ref('teaMode')+'="perDay",'+ref('teaRate')+'*'+L('days')+r+','+ref('teaRate')+'),0),0)',w.tea),
      pfE:!!e.pf,pfA:!!e.pfOnActualBasic,wage:(r,L)=>e.pfOnActualBasic?pwF(L('basic')+r):(wageCalc===Math.min(Number(e.basic)||0,ceiling)?pwF('MIN('+L('basic')+r+','+ref('pfCeil')+')',wageCalc):wageCalc),
      pfO:ovr(mt.pfOverride),pf:(r,L)=>pwF('IF('+on('pfEmp')+',IF('+L('pfO')+r+'<>"",'+L('pfO')+r+',IF(AND('+ref('pfReg')+','+L('pfE')+r+'),ROUND('+L('wage')+r+'*'+ref('pfRate')+',0),0)),0)',w.pfEmp),
      esE:!!e.esic,esO:ovr(mt.esicOverride),esic:(r,L)=>pwF('IF('+on('esic')+',IF('+L('esO')+r+'<>"",'+L('esO')+r+',IF(AND('+ref('esicReg')+','+L('esE')+r+','+L('salary')+r+'<='+ref('esicLimit')+'),ROUND('+L('salary')+r+'*'+ref('esicRate')+',0),0)),0)',w.esicEmp),
      ptO:ovr(mt.ptOverride),pt:(r,L)=>pwF('IF('+on('pt')+',IF('+L('ptO')+r+'<>"",'+L('ptO')+r+','+ptExpr(L('salary')+r)+'),0)',w.ptAmt),
      tdsE:ovr(mt.tdsAmount)||0,tds:(r,L)=>pwF('IF('+on('tds')+','+L('tdsE')+r+',0)',w.tdsAmt),
      pen:(r,L)=>pwF('IF('+on('penalties')+',SUMIFS('+penRefs.amt+','+penRefs.emp+','+L('name')+r+'),0)',w.penAmt),
      advB:settled?'Settled on approval':'Active advances',advV:settled?mt.advanceSettledBreakdown.reduce((s,b)=>s+(Number(b.amount)||0),0):null,
      adv:(r,L)=>pwF('IF('+on('advAdj')+','+(settled?L('advV')+r:'SUMIFS('+advRefs.ded+','+advRefs.emp+','+L('name')+r+','+advRefs.from+',"Salary")')+',0)',w.advAdj),
      net:(r,L)=>pwF('MAX(0,'+L('gross')+r+'+'+L('tea')+r+'-'+L('pf')+r+'-'+L('esic')+r+'-'+L('pt')+r+'-'+L('tds')+r+'-'+L('pen')+r+'-'+L('adv')+r+')',w.net),
      opA:Number(w.prevAdv)||0,cuA:Number(w.currAdv)||0,nxA:Number(w.nextAdv)||0,clA:(r,L)=>pwF('MAX(0,'+L('opA')+r+'+'+L('cuA')+r+'-'+L('adv')+r+')',w.closingAdvance),
      pfEr:(r,L)=>pwF('IF(AND('+ref('pfReg')+','+L('pfE')+r+'),ROUND('+L('wage')+r+'*'+ref('pfRate')+',0),0)',w.pfEr),esEr:(r,L)=>pwF('IF(AND('+ref('esicReg')+','+L('esE')+r+','+L('salary')+r+'<='+ref('esicLimit')+'),ROUND('+L('salary')+r+'*'+ref('esicEr')+',0),0)',w.esicEr),
      ...Object.fromEntries([['iS','serviceInc','iS'],['iM','memInc','iM'],['iP','prodInc','iP'],['iG','mgrInc','iG'],['iN','nonPerfPenalty','iPen'],['iT','totalInc','tot']].map(([k,c,src])=>[k,(r,L)=>pwF('IF('+on(c)+',IFERROR(INDEX('+incCol(src)+',MATCH('+L('id')+r+','+incId+',0)),0),0)')])),
      app:Number(w.net)||0,chk:(r,L)=>pwCheck(L('net')+r,L('app')+r),st:mt.status||'Draft',ps:mt.paymentStatus||'',mode:mt.mode||'',bank:e.bankName||'',acct:e.accountNo||'',ifsc:e.ifsc||''};});
  wsSW.addRow(['Salary Working — '+(salon.name||'')+' — '+PW_MONTHS[m]+' '+y]).getCell(1).font={bold:true,size:13,color:{argb:'FF14335E'}};
  pwTable(wsSW,2,[{key:'id',h:'Emp ID',w:9,input:true},{key:'name',h:'Employee',w:22,input:true},{key:'desig',h:'Designation',w:16,input:true},{key:'status',h:'Status',w:9,input:true},
    {key:'salary',h:'Monthly salary',input:true},{key:'basic',h:'Basic',input:true},{key:'days',h:'Payable days',fmt:'0.0#'},{key:'dim',h:'Days in month'},{key:'gross',h:'Gross salary'},{key:'lop',h:'LOP amount'},{key:'tea',h:'Tea'},
    {key:'pfE',h:'PF applies',input:true},{key:'pfA',h:'PF on actual basic',input:true},{key:'wage',h:'PF wage base'},{key:'pfO',h:'PF typed in',input:true},{key:'pf',h:'PF (Emp)'},
    {key:'esE',h:'ESIC applies',input:true},{key:'esO',h:'ESIC typed in',input:true},{key:'esic',h:'ESIC (Emp)'},{key:'ptO',h:'PT typed in',input:true},{key:'pt',h:'Professional Tax'},
    {key:'tdsE',h:'TDS entered',input:true},{key:'tds',h:'TDS'},{key:'pen',h:'Penalty'},{key:'advB',h:'Advance basis',w:18,input:true},{key:'advV',h:'Advance settled ₹',input:true},{key:'adv',h:'Advance Adj.'},
    {key:'net',h:'Net salary'},{key:'opA',h:'Op. advance',input:true},{key:'cuA',h:'Curr month adv',input:true},{key:'nxA',h:'Next month adv',input:true},{key:'clA',h:'Closing advance'},
    {key:'pfEr',h:'Employer PF'},{key:'esEr',h:'Employer ESIC'},{key:'iS',h:'Service Inc'},{key:'iM',h:'Mem Inc'},{key:'iP',h:'Prod Inc'},{key:'iG',h:'MGR Inc'},{key:'iN',h:'Non-perf. penalty'},{key:'iT',h:'Total Inc'},
    {key:'app',h:'SalonOS net',input:true},{key:'chk',h:'Check',w:14},{key:'st',h:'Approval',w:11,input:true},{key:'ps',h:'Payment',w:10,input:true},{key:'mode',h:'Mode',w:10,input:true},
    {key:'bank',h:'Bank',w:16,input:true},{key:'acct',h:'Account no.',w:18,input:true},{key:'ifsc',h:'IFSC',w:13,input:true}],swRows,
    {total:['salary','basic','gross','lop','tea','pf','esic','pt','tds','pen','adv','net','opA','cuA','nxA','clA','pfEr','esEr','iS','iM','iP','iG','iN','iT','app']});
  wb.views=[{x:0,y:0,width:10000,height:20000,firstSheet:0,activeTab:1,visibility:'visible'}];
  return wb;
}
async function pwIncentiveWorkbook(salon,y,m){
  await loadExcelJS();const sid=salon.id;const wb=new ExcelJS.Workbook();wb.creator='SalonOS';wb.created=new Date();
  const wsAbout=wb.addWorksheet('About'),wsInc=wb.addWorksheet('Inc Working'),wsSales=wb.addWorksheet('Sales'),wsIR=wb.addWorksheet('Inc Rules'),wsAdv=wb.addWorksheet('Advances');
  pwAbout(wsAbout,'Incentive Working — full workings',salon,y,m,['Inc Working: Target = Salary × target times; Achievement % = Achieved ÷ Target (max 100); Service rate comes from the rate slabs on Inc Rules by ×times of salary achieved.',
    'Incentive = Achieved × Rate % — or the typed-in / flat / pool amount where that is the basis (shown in each Basis column). Manager incentive = manager pool × Share %. OT = Salary ÷ days in month ÷ normal hours × OT hours.',
    'Total = Service + Membership + Product + Manager + OT − Penalty − Advance Adj. (never below 0).','Sales: what each employee sold — from the CRADLE Staff Work report when imported, else the figures typed into Incentive Working. Advances: incentive-recovered advances.',
    'Membership incentive under Rule A/B/C is shared from a pool across staff and managers — it comes in as data (Mem ₹) with the rule named.']);
  const ADV=pwAdvancesSheet(wsAdv,sid).write(y,m);const rng=k=>pwRef(wsAdv.name)+'$'+ADV.L(k)+'$'+ADV.first+':$'+ADV.L(k)+'$'+Math.max(ADV.first,ADV.last);
  pwIncentiveSheets(wb,sid,y,m,wsIR,wsSales,wsInc,{emp:rng('emp'),from:rng('from'),ded:rng('ded')});
  wb.views=[{x:0,y:0,width:10000,height:20000,firstSheet:0,activeTab:1,visibility:'visible'}];
  return wb;
}
async function pwDownloadSalary(salon,y,m,toast){
  try{const wb=await pwSalaryWorkbook(salon,y,m);await pwDownload(wb,'Salary Working full workings — '+String(salon.name||'').split('—')[0].trim()+' — '+PW_MONTHS[m]+' '+y+'.xlsx');}
  catch(e){if(toast)toast('Could not build the workbook: '+(e.message||e),'error');else window.alert(e.message||e);}
}
async function pwDownloadIncentive(salon,y,m,toast){
  try{const wb=await pwIncentiveWorkbook(salon,y,m);await pwDownload(wb,'Incentive Working full workings — '+String(salon.name||'').split('—')[0].trim()+' — '+PW_MONTHS[m]+' '+y+'.xlsx');}
  catch(e){if(toast)toast('Could not build the workbook: '+(e.message||e),'error');else window.alert(e.message||e);}
}
