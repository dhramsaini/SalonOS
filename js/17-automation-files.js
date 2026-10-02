// ── Automation phase 2 ───────────────────────────────────────────────────────────────────────
//   • Statutory Files (Salary Working → Statutory Files): PF ECR text file for the EPFO portal,
//     ESIC monthly contribution sheet, PT and TDS-on-salary lists — straight from Salary Working.
//   • GST Summary (P&L (Monthly) → GST Summary): outward GST from the month's sales and input GST
//     from vendor tax invoices booked in the month — a GSTR-3B working.
//   • Send Payslips (Salary Working → Send Payslips) and Client messages (Clients → 📣 Messages
//     to send): the app prepares every WhatsApp message; the manager presses Send for each one
//     (WhatsApp opens with the text ready — nothing is sent automatically).
//   • P&L Final → offer to email the final P&L to the Automatic-reports recipients.

const AF_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const afMoney=n=>'₹'+Math.round(Number(n)||0).toLocaleString('en-IN');
// WhatsApp click-to-chat link; 10-digit Indian numbers get +91.
function waLink(phone,text){
  let d=String(phone||'').replace(/\D/g,'');
  if(d.length===11&&d[0]==='0')d=d.slice(1);
  if(d.length===10)d='91'+d;
  return'https://wa.me/'+d+'?text='+encodeURIComponent(text||'');
}
function waPhoneOk(phone){const d=String(phone||'').replace(/\D/g,'');return d.length>=10;}
// Per-day "already sent" marks so a list doesn't get sent twice (per outlet, per kind).
function loadSentMarks(sid,kind){try{return JSON.parse(cachedLocalGet(outletKey('salonos_sent_'+kind,sid))||'{}')||{};}catch(e){return{};}}
function markSent(sid,kind,key){const m=loadSentMarks(sid,kind);m[key]=new Date().toISOString();safeLocalSet(outletKey('salonos_sent_'+kind,sid),JSON.stringify(m));}
async function afDownloadXlsx(title,rows,fileName){
  const blob=await exportReportExcelBlob(title,rows);
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=fileName;a.click();URL.revokeObjectURL(url);
}
function afMonthPicker(cal,setCal){
  const h=React.createElement;
  const shift=k=>{const d=new Date(cal.year,cal.month+k,1);setCal({year:d.getFullYear(),month:d.getMonth()});};
  return h('div',{className:'fd-date'},h('button',{onClick:()=>shift(-1)},'‹'),h('span',{className:'lbl'},AF_MONTHS[cal.month].slice(0,3)+' '+cal.year),h('button',{onClick:()=>shift(1)},'›'));
}
function useAfCal(period){
  const init=periodToCalendar(period);
  const [cal,setCal]=useState(init||prevMonthCal());
  useEffect(()=>{const c=periodToCalendar(period);if(c)setCal(c);
    // eslint-disable-next-line
  },[period&&period.mi,period&&period.fy]);
  return[cal,setCal];
}

// ── Statutory files ──
function statutoryRowsFor(sid,year,month){
  const sw=swWorkingsFor(sid,year,month);
  const st={};(statutoryDeductionsFor(sid,year,month)||[]).forEach(r=>{st[r.id]=r;});
  return sw.map(e=>({...e,...(st[e.id]||{}),pfEmp:e.pfEmp,esicEmp:e.esicEmp,ptAmt:e.ptAmt,tdsAmt:e.tdsAmt}));
}
function pfEcrFor(sid,year,month){
  const rows=statutoryRowsFor(sid,year,month).filter(e=>(Number(e.pfEmp)||0)+(Number(e.pfEr)||0)>0);
  const r=Math.round;
  const lines=rows.map(e=>{
    const basic=Number(e.basic)||0;
    const epfW=e.pfOnActualBasic?basic:Math.min(basic,15000);
    const epsW=Math.min(basic,15000);
    return[String(e.pfNumber||'').replace(/\s/g,''),String(e.name||'').toUpperCase(),r(e.grossAfterLop||e.gross||0),r(epfW),r(epsW),r(epsW),r(e.pfEmp||0),r(e.eps||0),r(e.pfErEpf||0),r(e.lop||0),0].join('#~#');
  });
  return{rows,text:lines.join('\n'),missingUan:rows.filter(e=>!String(e.pfNumber||'').trim()).map(e=>e.name)};
}
function esicRowsFor(sid,year,month){
  const rows=statutoryRowsFor(sid,year,month).filter(e=>(Number(e.esicEmp)||0)+(Number(e.esicEr)||0)>0);
  return{rows,missingIp:rows.filter(e=>!String(e.esicNumber||'').trim()).map(e=>e.name)};
}
function StatutoryFilesSheet({salon,period}={}){
  const h=React.createElement;
  const {toast}=useToast();
  const [cal,setCal]=useAfCal(period);
  const sid=salon?.id;
  const label=AF_MONTHS[cal.month]+' '+cal.year;
  const short=String(salon&&salon.name||'Outlet').split('—')[0].trim().replace(/[^A-Za-z0-9]+/g,'_');
  const tag=cal.year+'-'+String(cal.month+1).padStart(2,'0');
  if(!salaryAttendanceReady(sid,cal.year,cal.month))return h('div',null,
    h('div',{className:'section-header'},h('div',null,h('div',{className:'page-title'},'Statutory Files')),afMonthPicker(cal,setCal)),
    h('div',{className:'card',style:{textAlign:'center',padding:32,color:'var(--text3)'}},'Attendance for '+label+' is not marked Month Final yet — the files are made from final salary.'));
  const ecr=pfEcrFor(sid,cal.year,cal.month);
  const esic=esicRowsFor(sid,cal.year,cal.month);
  const all=statutoryRowsFor(sid,cal.year,cal.month);
  const pt=all.filter(e=>(Number(e.ptAmt)||0)>0);
  const tds=all.filter(e=>(Number(e.tdsAmt)||0)>0);
  const sum=(l,f)=>l.reduce((t,e)=>t+(Number(e[f])||0),0);
  const warn=(names,what)=>names.length?h('div',{style:{fontSize:11.5,color:'var(--orange)',marginTop:6}},'⚠ '+what+' missing for: '+names.join(', ')+' — add it in Master Salary before uploading.'):null;
  const card=(title,desc,stats,btn,extra)=>h('div',{className:'card',style:{marginBottom:14}},
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}},
      h('div',null,h('div',{className:'card-title',style:{marginBottom:4}},title),h('div',{style:{fontSize:12,color:'var(--text3)'}},desc),
        h('div',{style:{fontSize:12.5,marginTop:8}},stats)),btn),extra);
  const dl=async(fn)=>{try{await fn();}catch(e){toast(e.message||String(e),'error');}};
  return h('div',null,
    h('div',{className:'section-header'},
      h('div',null,h('div',{className:'page-title'},'Statutory Files'),h('div',{className:'page-sub'},'Ready-to-upload files for '+label+', made from Salary Working')),
      afMonthPicker(cal,setCal)),
    card('PF — ECR file (EPFO portal)','Text file in the EPFO ECR format: UAN, name, gross / EPF / EPS / EDLI wages, EE share, EPS, ER share, NCP (LOP) days.',
      ecr.rows.length+' employee(s) · EE '+afMoney(sum(ecr.rows,'pfEmp'))+' · ER '+afMoney(sum(ecr.rows,'pfEr')),
      h('button',{className:'btn btn-primary btn-sm',disabled:!ecr.rows.length,onClick:()=>{downloadTextFile(ecr.text,'PF_ECR_'+short+'_'+tag+'.txt','text/plain;charset=utf-8');}},'⬇ ECR .txt'),
      warn(ecr.missingUan,'UAN')),
    card('ESIC — monthly contribution sheet','IP number, name, days paid, total monthly wages — the columns the ESIC portal upload asks for.',
      esic.rows.length+' employee(s) · EE '+afMoney(sum(esic.rows,'esicEmp'))+' · ER '+afMoney(sum(esic.rows,'esicEr')),
      h('button',{className:'btn btn-primary btn-sm',disabled:!esic.rows.length,onClick:()=>dl(()=>afDownloadXlsx('ESIC Contribution',
        [['IP Number','IP Name','No of Days for which wages paid/payable during the month','Total Monthly Wages','Reason Code for Zero workings days','Last Working Day'],
          ...esic.rows.map(e=>[String(e.esicNumber||''),e.name,Math.round(e.totalDays||0),Math.round(e.grossAfterLop||0),(e.totalDays||0)>0?'':'1',''])],'ESIC_'+short+'_'+tag+'.xlsx'))},'⬇ ESIC .xlsx'),
      warn(esic.missingIp,'ESIC IP number')),
    card('Professional Tax','PT deducted this month, per employee.',pt.length+' employee(s) · '+afMoney(sum(pt,'ptAmt')),
      h('button',{className:'btn btn-ghost btn-sm',disabled:!pt.length,onClick:()=>dl(()=>afDownloadXlsx('Professional Tax',[['Employee','Gross','PT'],...pt.map(e=>[e.name,Math.round(e.gross||0),Math.round(e.ptAmt)])],'PT_'+short+'_'+tag+'.xlsx'))},'⬇ PT .xlsx')),
    card('TDS on salary (Sec 192)','TDS deducted this month, per employee — for the challan and 24Q working.',tds.length+' employee(s) · '+afMoney(sum(tds,'tdsAmt')),
      h('button',{className:'btn btn-ghost btn-sm',disabled:!tds.length,onClick:()=>dl(()=>afDownloadXlsx('TDS on Salary',[['Employee','PAN','Gross','TDS'],...tds.map(e=>[e.name,e.pan||'',Math.round(e.gross||0),Math.round(e.tdsAmt)])],'TDS_Salary_'+short+'_'+tag+'.xlsx'))},'⬇ TDS .xlsx')));
}

// ── GST summary (GSTR-3B working) ──
function gstSummaryFor(sid,year,month){
  const g=plRevenueGrossFor(sid,year,month);
  const gross=(g.cash||0)+(g.card||0)+(g.upi||0);
  const taxable=gross/1.05,tax=gross-taxable;
  const ym=year+'-'+String(month+1).padStart(2,'0');
  const s=outletSettings(sid);
  const blocked=!!s.gstInputBlocked&&(!s.gstInputWef||s.gstInputWef<=ym+'-31');
  const inv=(loadVendorInvoices(sid)||[]).filter(i=>i&&invoiceBookMonthOf(i)===ym&&(i.docNature||'Tax Invoice')==='Tax Invoice');
  const n=v=>Number(v)||0;
  const itc={taxable:inv.reduce((t,i)=>t+n(i.taxable),0),igst:inv.reduce((t,i)=>t+n(i.igst),0),cgst:inv.reduce((t,i)=>t+n(i.cgst),0),sgst:inv.reduce((t,i)=>t+n(i.sgst),0),count:inv.length};
  const itcTotal=blocked?0:itc.igst+itc.cgst+itc.sgst;
  return{source:plRevenueSourceFor(sid,year,month),gross,taxable,cgst:tax/2,sgst:tax/2,itc,itcTotal,blocked,net:Math.max(0,tax-itcTotal),credit:Math.max(0,itcTotal-tax)};
}
function GstSummarySheet({salon,period}={}){
  const h=React.createElement;
  const {toast}=useToast();
  const [cal,setCal]=useAfCal(period);
  const sid=salon?.id;
  const g=gstSummaryFor(sid,cal.year,cal.month);
  const label=AF_MONTHS[cal.month]+' '+cal.year;
  const row=(l,v,b)=>h('tr',null,h('td',{style:b?{fontWeight:700}:null},l),h('td',{style:{textAlign:'right',fontWeight:b?700:400}},v));
  const rows=[['Particulars','Amount'],['Sales incl. GST ('+(g.source==='dse'?'Daily Sales & Exp':'Collection Reco')+')',Math.round(g.gross)],['Taxable value (÷ 1.05)',Math.round(g.taxable)],['Output CGST 2.5%',Math.round(g.cgst)],['Output SGST 2.5%',Math.round(g.sgst)],
    ['Input tax — vendor tax invoices ('+g.itc.count+')',Math.round(g.itc.igst+g.itc.cgst+g.itc.sgst)],['Input credit usable'+(g.blocked?' (blocked for this outlet)':''),Math.round(g.itcTotal)],['Net GST payable (cash)',Math.round(g.net)],['Credit carried forward',Math.round(g.credit)]];
  return h('div',null,
    h('div',{className:'section-header'},
      h('div',null,h('div',{className:'page-title'},'GST Summary'),h('div',{className:'page-sub'},'GSTR-3B working for '+label+' — outward tax at 5% (same ÷ 1.05 the P&L uses) less input from vendor tax invoices booked this month')),
      h('div',{style:{display:'flex',gap:8}},afMonthPicker(cal,setCal),
        h('button',{className:'btn btn-ghost btn-sm',onClick:async()=>{try{await afDownloadXlsx('GST Summary',rows,'GST_Summary_'+String(salon&&salon.name||'Outlet').split('—')[0].trim().replace(/[^A-Za-z0-9]+/g,'_')+'_'+cal.year+'-'+String(cal.month+1).padStart(2,'0')+'.xlsx');}catch(e){toast(e.message,'error');}}},'⬇ Excel'))),
    !outletSettings(sid).gstApplicable&&h('div',{className:'help-note',style:{marginBottom:12}},'This outlet is not marked GST applicable in Master Sheet — figures shown for reference.'),
    h('div',{className:'card',style:{maxWidth:640}},h('table',null,h('tbody',null,rows.slice(1).map((r,i)=>h(React.Fragment,{key:i},row(r[0],afMoney(r[1]),i===6)))))),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:8}},'Check against the GST portal before filing — invoices without Taxable / CGST / SGST / IGST filled in Vendors don’t count as input.'));
}

// ── Send payslips by WhatsApp (manager presses Send per employee) ──
function SendPayslipsSheet({salon,period}={}){
  const h=React.createElement;
  const {toast}=useToast();
  const [cal,setCal]=useAfCal(period);
  const [tick,setTick]=useState(0);
  const [busy,setBusy]=useState('');
  const sid=salon?.id;
  const label=AF_MONTHS[cal.month]+' '+cal.year;
  const ready=salaryAttendanceReady(sid,cal.year,cal.month);
  const locked=isMonthLockedFor(sid,cal.year,cal.month);
  const rows=ready?swWorkingsFor(sid,cal.year,cal.month).filter(e=>e.net>0):[];
  const sent=loadSentMarks(sid,'payslip');
  const short=String(salon&&salon.name||'').split('—')[0].trim();
  const msg=e=>'Hi '+String(e.name).split(' ')[0]+', your payslip for '+label+' from '+short+': net pay '+afMoney(e.net)+' ('+Math.round(e.totalDays||0)+' days paid). The PDF payslip is attached.';
  const send=async e=>{
    setBusy(e.id);
    try{
      const blob=await buildPayslipsPdf(salon,cal.year,cal.month,[e],locked?'':'DRAFT');
      const file=new File([blob],'Payslip_'+String(e.name).replace(/[^\w]+/g,'_')+'_'+AF_MONTHS[cal.month]+'_'+cal.year+'.pdf',{type:'application/pdf'});
      if(navigator.canShare&&navigator.canShare({files:[file]})){
        await navigator.share({files:[file],text:msg(e),title:'Payslip '+label});
      }else{
        const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=file.name;a.click();URL.revokeObjectURL(url);
        window.open(waLink(e.mobile||e.phone,msg(e)),'_blank');
        toast('Payslip downloaded — attach it in the WhatsApp chat that just opened','info');
      }
      markSent(sid,'payslip',e.id+'|'+cal.year+'-'+cal.month);setTick(t=>t+1);
    }catch(err){if(!(err&&err.name==='AbortError'))toast(err.message||String(err),'error');}
    setBusy('');
  };
  return h('div',null,
    h('div',{className:'section-header'},
      h('div',null,h('div',{className:'page-title'},'Send Payslips'),h('div',{className:'page-sub'},'Press Send for each employee — on a phone the payslip PDF goes straight into WhatsApp; on a computer it downloads and the chat opens with the message ready')),
      afMonthPicker(cal,setCal)),
    !ready?h('div',{className:'card',style:{textAlign:'center',padding:32,color:'var(--text3)'}},'Attendance for '+label+' is not marked Month Final yet.'):
    h('div',{className:'card',style:{padding:0}},
      !locked&&h('div',{className:'help-note',style:{margin:12}},'Salary for '+label+' is not approved / locked yet — payslips will carry a DRAFT mark.'),
      h('div',{className:'table-wrap'},h('table',null,
        h('thead',null,h('tr',null,['Employee','Mobile','Net pay','',''].map((t,i)=>h('th',{key:i,style:i===2?{textAlign:'right'}:null},t)))),
        h('tbody',null,rows.length===0?h('tr',null,h('td',{colSpan:5,style:{textAlign:'center',padding:24,color:'var(--text3)'}},'No one with net pay this month')):
          rows.map(e=>{const s=sent[e.id+'|'+cal.year+'-'+cal.month];const ph=e.mobile||e.phone;
            return h('tr',{key:e.id},h('td',null,h('b',null,e.name),h('div',{style:{fontSize:11,color:'var(--text3)'}},e.desig||'')),
              h('td',null,ph||h('span',{style:{color:'var(--orange)'}},'no mobile')),
              h('td',{style:{textAlign:'right'}},afMoney(e.net)),
              h('td',{style:{fontSize:11,color:'var(--green)'}},s?'✓ sent '+new Date(s).toLocaleDateString('en-IN'):''),
              h('td',{style:{textAlign:'right'}},h('button',{className:'btn btn-primary btn-sm',disabled:!waPhoneOk(ph)||busy===e.id,onClick:()=>send(e)},busy===e.id?'Preparing…':s?'Send again':'📤 Send')));}))))));
}

// ── Client messages — tomorrow's appointment reminders, win-back for lapsed clients ──
function ClientMessagesModal({salon,clients,onClose}){
  const h=React.createElement;
  const [tick,setTick]=useState(0);
  const sid=Number(salon&&salon.id)||1;
  const short=String(salon&&salon.name||'the salon').split('—')[0].trim();
  const today=localIsoOf(new Date());
  const tmr=new Date();tmr.setDate(tmr.getDate()+1);
  let book={};try{book=JSON.parse(cachedLocalGet(outletKey('salonos_appointments_book',sid))||'{}')||{};}catch(e){}
  const appts=(book[sid+'|'+fdDateStr(tmr)]||[]).filter(a=>a&&a.status!=='Cancelled'&&waPhoneOk(a.phone));
  const hm=m=>{const H=Math.floor(m/60),M=m%60;return((H+11)%12+1)+':'+String(M).padStart(2,'0')+(H<12?' am':' pm');};
  const lapsed=(clients||[]).filter(c=>c&&waPhoneOk(c.phone)&&Number(c.since)>=60&&Number(c.since)<=180).sort((a,b)=>b.spend-a.spend).slice(0,40);
  const sent=loadSentMarks(sid,'client');
  const go=(key,phone,text)=>{window.open(waLink(phone,text),'_blank');markSent(sid,'client',key);setTick(t=>t+1);};
  const item=(key,title,sub,phone,text)=>h('div',{key,style:{display:'flex',gap:10,alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}},
    h('div',{style:{flex:1,minWidth:0}},h('div',{style:{fontSize:13,fontWeight:600}},title),h('div',{style:{fontSize:11.5,color:'var(--text3)'}},sub)),
    sent[key]&&h('span',{style:{fontSize:11,color:'var(--green)'}},'✓ sent'),
    h('button',{className:'btn btn-ghost btn-sm',onClick:()=>go(key,phone,text)},sent[key]?'Again':'📤 Send'));
  return h('div',{className:'modal-overlay',onClick:onClose},
    h('div',{className:'modal',style:{width:560,maxHeight:'85vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
      h('div',{className:'modal-title'},'📣 Messages to send'),
      h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:12}},'Each Send opens WhatsApp with the message ready — you press send there. Nothing goes out on its own.'),
      h('div',{style:{fontWeight:700,fontSize:12.5,margin:'6px 0'}},'Appointment reminders — tomorrow ('+appts.length+')'),
      appts.length?appts.map(a=>item('appt|'+a.id+'|'+fdDateStr(tmr),a.client,a.service+' · '+hm(a.start)+' · '+a.staff,a.phone,
        'Hi '+String(a.client).split(' ')[0]+', a reminder of your '+a.service+' appointment tomorrow at '+hm(a.start)+' at '+short+'. Reply YES to confirm or CHANGE to reschedule.'))
        :h('div',{style:{fontSize:12,color:'var(--text3)'}},'No bookings with a mobile number for tomorrow.'),
      h('div',{style:{fontWeight:700,fontSize:12.5,margin:'16px 0 6px'}},'Win back — not visited in 60–180 days ('+lapsed.length+')'),
      lapsed.length?lapsed.map(c=>item('win|'+c.id+'|'+today.slice(0,7),c.name,c.since+' days since last visit · spent '+afMoney(c.spend),c.phone,
        'Hi '+String(c.name).split(' ')[0]+', we have missed you at '+short+'! It has been '+c.since+' days since your last '+(c.fav||'visit')+'. Reply BOOK for a slot this week.'))
        :h('div',{style:{fontSize:12,color:'var(--text3)'}},'Nobody in that range.'),
      h('div',{className:'modal-actions'},h('button',{className:'btn btn-ghost',onClick:onClose},'Close'))));
}

// ── P&L Final → email the final P&L to the Automatic-reports recipients ──
async function emailFinalPnl(salon,fy,mi){
  const d=plBuild(salon.id,fy,mi);
  const cal=periodToCalendar({fy,mi});
  const month=AF_MONTHS[cal.month].slice(0,3)+' '+cal.year;
  const rows=[['Particulars','Amount']];
  d.sections.forEach(S=>{rows.push([S.sec,Math.round(S.tot)]);(S.lines||[]).forEach(l=>{if(l.amt)rows.push(['   '+l.name,Math.round(l.amt)]);});});
  rows.push(['Revenue',Math.round(d.revenue)],['EBITDA',Math.round(d.ebitda)],['Profit before tax',Math.round(d.pbt)]);
  const blob=await exportReportPdfBlob('P&L (Final) — '+month,String(salon.name||''),rows);
  const short=String(salon.name||'').split('—')[0].trim();
  return emailCall('send_pack',{outletId:Number(salon.id),month,fileName:'PnL_'+short.replace(/[^A-Za-z0-9]+/g,'_')+'_'+cal.year+'-'+String(cal.month+1).padStart(2,'0')+'.pdf',pdf:await blobToBase64(blob),toSelf:true});
}
