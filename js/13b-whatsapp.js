// ── WhatsApp (automation phase 2) — screens for the "whatsapp" cloud function:
//   • Master Settings → 💬 WhatsApp (Super Admin): the Meta Business details (stored server-side, never
//     shown again), webhook URL + verify token to paste into Meta, the staff numbers allowed to send
//     bills (kv salonos_secret_whatsapp_settings), switches, and a test message.
//   • Vendors → 📥 WhatsApp bills: bills staff sent on WhatsApp, already read by AI, waiting for a person
//     to check them in the normal invoice form (kv salonos_whatsapp_inbox_outlet_<id>, written by the
//     server; status new → used / discarded).
//   • Salary Working → 📲 Notify on WhatsApp: tells each employee their net pay (approved template).
// Loaded before js/14 (which starts the app).

const WA_SETTINGS_KEY='salonos_secret_whatsapp_settings';
function waInboxKey(salonId){return outletKey('salonos_whatsapp_inbox',salonId);}
function waInboxLoad(salonId){
  if(salonId==null)return[];
  try{const v=JSON.parse(cachedLocalGet(waInboxKey(salonId))||'[]');return Array.isArray(v)?v.filter(x=>x&&x.id):[];}catch(e){return[];}
}
function waInboxSetStatus(salonId,id,status){
  const list=waInboxLoad(salonId);
  if(!list.some(x=>x.id===id))return;
  safeLocalSet(waInboxKey(salonId),JSON.stringify(list.map(x=>x.id===id?{...x,status,statusAt:new Date().toISOString()}:x)));
}
// 98765 43210 / +91-98765-43210 / 098765 43210 → 919876543210 (same rule as the server).
function waNumber(raw){
  let d=String(raw==null?'':raw).replace(/\D/g,'');
  if(d.length===11&&d[0]==='0')d=d.slice(1);
  if(d.length===10)d='91'+d;
  return d.length>=11&&d.length<=15?d:'';
}
async function waCall(action,payload){
  const supa=await getSupabaseClient();
  const{data,error}=await supa.functions.invoke('whatsapp',{body:{action,...(payload||{})}});
  if(error){let msg=error.message||'Could not reach the WhatsApp service';try{const b=error.context&&await error.context.json();if(b&&b.error)msg=b.error;}catch(e){}
    if(/not found|404|Failed to send a request/i.test(msg))msg='The WhatsApp service isn’t installed in Supabase yet.';throw new Error(msg);}
  if(data&&data.error)throw new Error(data.error);
  return data||{};
}

function WhatsAppSettingsCard(){
  const h=React.createElement;
  const {success,error:toastError}=useToast();
  const [st,setSt]=useState(null);
  const [f,setF]=useState({token:'',appSecret:'',phoneNumberId:'',salary:'',lang:''});
  const [busy,setBusy]=useState('');
  const [testTo,setTestTo]=useState('');
  const saved=(()=>{try{return JSON.parse(cachedLocalGet(WA_SETTINGS_KEY)||'{}')||{};}catch(e){return{};}})();
  const [senders,setSenders]=useState(()=>(saved.senders||[]).map(s=>({...s})));
  const [billCapture,setBillCapture]=useState(saved.billCapture!==false);
  const [todayReplies,setTodayReplies]=useState(saved.todayReplies!==false);
  const outlets=SALONS.filter(s=>s.status==='Active');
  const load=async()=>{try{const s=await waCall('status');setSt(s);setF(p=>({...p,phoneNumberId:s.phoneNumberId||'',salary:s.templates&&s.templates.salary||'',lang:s.templates&&s.templates.lang||''}));}catch(e){setSt({error:e.message});}};
  useEffect(()=>{load();},[]);
  const saveCreds=async()=>{
    setBusy('save');
    try{const r=await waCall('save',{token:f.token.trim(),appSecret:f.appSecret.trim(),phoneNumberId:f.phoneNumberId.trim(),templates:{salary:f.salary.trim(),lang:f.lang.trim()}});
      setF(p=>({...p,token:'',appSecret:''}));success('WhatsApp connected — '+(r.verifiedName||'')+' '+(r.displayPhone||''));await load();}
    catch(e){toastError(e.message);}
    setBusy('');
  };
  const remove=async()=>{if(!confirm('Disconnect WhatsApp? Bills sent on WhatsApp will stop arriving.'))return;setBusy('rm');try{await waCall('remove');success('WhatsApp disconnected');await load();}catch(e){toastError(e.message);}setBusy('');};
  const test=async()=>{setBusy('test');try{await waCall('test',{to:testTo});success('Test message sent — check WhatsApp on '+testTo);}catch(e){toastError(e.message);}setBusy('');};
  const saveSenders=()=>{
    const clean=senders.map(s=>({phone:waNumber(s.phone),name:String(s.name||'').trim(),outletId:Number(s.outletId)||null})).filter(s=>s.phone||s.name);
    const bad=clean.find(s=>!s.phone||!s.outletId);
    if(bad)return toastError('Each number needs a valid mobile and an outlet'+(bad.name?' ('+bad.name+')':'')+'.');
    const dup=clean.find((s,i)=>clean.findIndex(x=>x.phone===s.phone)!==i);
    if(dup)return toastError(dup.phone+' is listed twice.');
    safeLocalSet(WA_SETTINGS_KEY,JSON.stringify({...saved,senders:clean,billCapture,todayReplies}));
    setSenders(clean);success('Saved — '+clean.length+' number'+(clean.length===1?'':'s')+' can send bills');
  };
  const copy=(t)=>{try{navigator.clipboard.writeText(t);success('Copied');}catch(e){}};
  const lbl=(t)=>h('label',null,t);
  const code={fontFamily:'monospace',fontSize:12,background:'var(--bg3)',padding:'4px 8px',borderRadius:6,wordBreak:'break-all'};
  return h('div',{className:'card',style:{marginBottom:16}},
    h('div',{className:'card-title'},'💬 WhatsApp'),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',lineHeight:1.6,marginBottom:12}},
      'Staff send a photo or PDF of a vendor bill to your SalonOS WhatsApp number — AI reads it and it waits in Vendors → 📥 WhatsApp bills for checking. "today" gets today’s sales. Also used for the weekly/nightly summaries and salary messages. Needs a WhatsApp Business (Cloud API) number from Meta.'),
    st===null?h('div',{style:{fontSize:12,color:'var(--text3)'}},'Checking…'):
    st.error?h('div',{style:{fontSize:12,color:'var(--red)'}},st.error):
    h(React.Fragment,null,
      h('div',{style:{fontSize:12.5,marginBottom:10,color:st.configured?'var(--green)':'var(--orange)'}},
        st.configured?'✓ Connected — '+(st.displayPhone||st.phoneNumberId)+(st.tokenHint?' · token '+st.tokenHint:'')+(st.appSecretSet?'':' · ⚠ app secret missing (bills can’t arrive)'):'Not connected yet'),
      h('details',{style:{marginBottom:10},open:!st.configured},
        h('summary',{style:{cursor:'pointer',fontSize:12.5,fontWeight:600}},st.configured?'Change connection details':'Connect (step by step)'),
        h('ol',{style:{fontSize:12,color:'var(--text2)',lineHeight:1.7,paddingLeft:18,margin:'8px 0'}},
          h('li',null,'developers.facebook.com → My Apps → Create app → type "Business" → add the WhatsApp product. Add your business phone number (one not already on the WhatsApp app).'),
          h('li',null,'Business settings → System users → add one (Admin) → Generate token for your app with whatsapp_business_messaging and whatsapp_business_management → copy the permanent token.'),
          h('li',null,'WhatsApp → API Setup: copy the Phone number ID. App settings → Basic: copy the App secret.'),
          h('li',null,'Paste the three below and Save — SalonOS checks them with Meta.'),
          h('li',null,'WhatsApp → Configuration → Webhook: paste the Callback URL and Verify token shown below, Verify and save, then subscribe to "messages".'),
          h('li',null,'WhatsApp Manager → Message templates: create "salonos_daily_summary" (Utility; body with {{1}} and {{2}}, e.g. "{{1}}: {{2}}") and "salonos_salary_paid" (Utility; e.g. "Hi {{1}}, your salary for {{2}} of {{3}} has been released."). Wait for Meta to approve them.')),
        h('div',{className:'form-row cols3'},
          h('div',{className:'form-group'},lbl('Permanent access token'+(st.configured?' (blank = keep)':' *')),h('input',{className:'form-control',type:'password',autoComplete:'off',value:f.token,onChange:e=>setF({...f,token:e.target.value}),placeholder:'EAA…'})),
          h('div',{className:'form-group'},lbl('Phone number ID *'),h('input',{className:'form-control',inputMode:'numeric',value:f.phoneNumberId,onChange:e=>setF({...f,phoneNumberId:e.target.value}),placeholder:'1234567890…'})),
          h('div',{className:'form-group'},lbl('App secret'+(st.appSecretSet?' (blank = keep)':' *')),h('input',{className:'form-control',type:'password',autoComplete:'off',value:f.appSecret,onChange:e=>setF({...f,appSecret:e.target.value}),placeholder:'32 characters'}))),
        h('div',{className:'form-row cols2'},
          h('div',{className:'form-group'},lbl('Salary message template'),h('input',{className:'form-control',value:f.salary,onChange:e=>setF({...f,salary:e.target.value}),placeholder:'salonos_salary_paid'})),
          h('div',{className:'form-group'},lbl('Template language code'),h('input',{className:'form-control',value:f.lang,onChange:e=>setF({...f,lang:e.target.value}),placeholder:'en'}))),
        h('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},
          h('button',{className:'btn btn-primary btn-sm',disabled:!!busy||!f.phoneNumberId.trim()||(!st.configured&&(!f.token.trim()||!f.appSecret.trim())),onClick:saveCreds},busy==='save'?'Checking with Meta…':'Save & check'),
          st.configured&&h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},disabled:!!busy,onClick:remove},'Disconnect'))),
      st.configured&&h('div',{style:{fontSize:12,marginBottom:12,display:'grid',gap:6}},
        h('div',null,'Callback URL: ',h('span',{style:code},st.webhookUrl),' ',h('button',{className:'btn btn-ghost btn-sm',style:{padding:'1px 8px'},onClick:()=>copy(st.webhookUrl)},'Copy')),
        h('div',null,'Verify token: ',h('span',{style:code},st.verifyToken),' ',h('button',{className:'btn btn-ghost btn-sm',style:{padding:'1px 8px'},onClick:()=>copy(st.verifyToken)},'Copy'))),
      st.configured&&h('div',{style:{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',marginBottom:14}},
        h('input',{className:'form-control',style:{width:200},value:testTo,onChange:e=>setTestTo(e.target.value),placeholder:'Your mobile, e.g. 98xxxxxxxx'}),
        h('button',{className:'btn btn-ghost btn-sm',disabled:!!busy||!waNumber(testTo),onClick:test},busy==='test'?'Sending…':'Send test message')),
      h('div',{style:{fontWeight:600,fontSize:12.5,margin:'6px 0'}},'Numbers that may send bills'),
      h('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:8}},'Bills from each number go to its outlet. Messages from any other number are refused.'),
      senders.map((s,i)=>h('div',{key:i,style:{display:'flex',gap:6,marginBottom:6,flexWrap:'wrap'}},
        h('input',{className:'form-control',style:{width:160},value:s.phone||'',placeholder:'Mobile',onChange:e=>setSenders(l=>l.map((x,j)=>j===i?{...x,phone:e.target.value}:x))}),
        h('input',{className:'form-control',style:{width:160},value:s.name||'',placeholder:'Name',onChange:e=>setSenders(l=>l.map((x,j)=>j===i?{...x,name:e.target.value}:x))}),
        h('select',{className:'form-control',style:{width:'auto'},value:s.outletId||'',onChange:e=>setSenders(l=>l.map((x,j)=>j===i?{...x,outletId:e.target.value}:x))},
          h('option',{value:''},'Outlet…'),outlets.map(o=>h('option',{key:o.id,value:o.id},o.name))),
        h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>setSenders(l=>l.filter((_,j)=>j!==i))},'✕'))),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setSenders(l=>[...l,{phone:'',name:'',outletId:outlets.length===1?outlets[0].id:''}])},'+ Add number'),
      h('div',{style:{display:'flex',gap:18,flexWrap:'wrap',margin:'12px 0',fontSize:13,color:'var(--text2)'}},
        h('label',{style:{display:'flex',gap:6,alignItems:'center'}},h('input',{type:'checkbox',checked:billCapture,onChange:e=>setBillCapture(e.target.checked)}),'Accept bills on WhatsApp'),
        h('label',{style:{display:'flex',gap:6,alignItems:'center'}},h('input',{type:'checkbox',checked:todayReplies,onChange:e=>setTodayReplies(e.target.checked)}),'Reply to "today" with today’s sales')),
      h('button',{className:'btn btn-primary btn-sm',onClick:saveSenders},'Save numbers & switches'))
  );
}

function WhatsAppInbox({salonId,onClose,onReview}){
  const h=React.createElement;
  const {success}=useToast();
  const [tick,setTick]=useState(0);
  const [showAll,setShowAll]=useState(false);
  const all=waInboxLoad(salonId).slice().sort((a,b)=>String(b.receivedAt).localeCompare(String(a.receivedAt)));
  const list=showAll?all:all.filter(x=>x.status==='new');
  const when=iso=>{try{return new Date(iso).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});}catch(e){return iso;}};
  const inr=v=>'₹'+Math.round(Number(v)||0).toLocaleString('en-IN');
  return h('div',{className:'modal-overlay',onClick:onClose},
    h('div',{className:'modal',style:{width:720},onClick:e=>e.stopPropagation(),key:tick},
      h('div',{className:'modal-title'},'📥 Bills received on WhatsApp'),
      h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:10}},'Read automatically by AI. Check each one before it becomes an invoice — "Review & add" opens the usual invoice form, filled in, with the bill attached.'),
      list.length===0?h('div',{className:'empty-state'},h('div',{className:'empty-icon'},'📭'),h('div',{className:'empty-title'},showAll?'No WhatsApp bills yet':'Nothing waiting'))
      :h('div',{className:'table-wrap'},h('table',null,
        h('thead',null,h('tr',null,['Received','From','Supplier','Invoice','Amount','',''].map((t,i)=>h('th',{key:i},t)))),
        h('tbody',null,list.map(x=>{const a=x.ai||{};return h('tr',{key:x.id,style:{opacity:x.status==='new'?1:0.55}},
          h('td',{'data-label':'Received'},when(x.receivedAt)),
          h('td',{'data-label':'From'},x.senderName||x.from,x.caption?h('div',{style:{fontSize:11,color:'var(--text3)'}},x.caption):null),
          h('td',{'data-label':'Supplier'},a.supplierName||h('span',{style:{color:'var(--orange)'}},x.aiError?'Not read ('+x.aiError+')':'—')),
          h('td',{'data-label':'Invoice'},[a.invoiceNo,a.invoiceDate&&a.invoiceDate.split('-').reverse().join('/')].filter(Boolean).join(' · ')||'—'),
          h('td',{'data-label':'Amount',style:{fontWeight:600}},a.total?inr(a.total):'—'),
          h('td',null,h('button',{className:'btn btn-ghost btn-sm',onClick:()=>downloadAttachment(x.file,'bill')},'👁 Bill')),
          h('td',null,x.status==='new'
            ?h('div',{style:{display:'flex',gap:4}},
                h('button',{className:'btn btn-primary btn-sm',onClick:()=>onReview(x)},'Review & add'),
                h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>{if(!confirm('Discard this bill? It stays in the list under "Show handled".'))return;waInboxSetStatus(salonId,x.id,'discarded');setTick(t=>t+1);success('Discarded');}},'Discard'))
            :h('span',{style:{fontSize:11.5,color:'var(--text3)'}},x.status==='used'?'Added':'Discarded')));}))
      )),
      h('div',{className:'modal-actions'},
        h('label',{style:{display:'flex',gap:6,alignItems:'center',fontSize:12.5,marginRight:'auto'}},h('input',{type:'checkbox',checked:showAll,onChange:e=>setShowAll(e.target.checked)}),'Show handled'),
        h('button',{className:'btn btn-ghost',onClick:onClose},'Close')))
  );
}

function WhatsAppSalaryNotifyButton({salon,year,month,workings}){
  const h=React.createElement;
  const {success,error:toastError}=useToast();
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const sid=salon&&salon.id;
  const emps=(sid!=null?loadEmployees(sid):[])||[];
  const rows=(workings||[]).filter(w=>(Number(w.net)||0)>0).map(w=>{const e=emps.find(x=>String(x.id)===String(w.id))||{};return{id:w.id,name:w.name,net:Math.round(Number(w.net)||0),to:waNumber(e.mobile)};});
  const [pick,setPick]=useState({});
  const chosen=rows.filter(r=>r.to&&pick[r.id]!==false);
  const send=async()=>{
    setBusy(true);
    try{
      const r=await waCall('notify_salary',{outletId:sid,month:MON[month]+' '+year,items:chosen.map(x=>({empId:x.id,amount:x.net}))});
      const failed=(r.results||[]).filter(x=>!x.ok);
      if(failed.length)toastError(r.sent+' sent, '+failed.length+' failed: '+failed.slice(0,3).map(x=>(rows.find(y=>String(y.id)===String(x.empId))||{}).name+' — '+x.error).join('; '));
      else success('Salary message sent to '+r.sent+' employee'+(r.sent===1?'':'s'));
      setOpen(false);
    }catch(e){toastError(e.message);}
    setBusy(false);
  };
  return h(React.Fragment,null,
    h('button',{className:'btn btn-ghost btn-sm',title:'WhatsApp each employee that their salary is released (net pay)',onClick:()=>setOpen(true)},'📲 Notify on WhatsApp'),
    open&&h('div',{className:'modal-overlay',onClick:()=>setOpen(false)},
      h('div',{className:'modal',style:{width:520},onClick:e=>e.stopPropagation()},
        h('div',{className:'modal-title'},'Tell staff their salary is released — '+MON[month]+' '+year),
        h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:10}},'Uses the approved "salary paid" template (Master Settings → WhatsApp). Employees without a mobile number in Master Salary are skipped.'),
        rows.length===0?h('div',{style:{fontSize:13,color:'var(--text3)'}},'No net pay for this month yet.'):
        h('div',{style:{maxHeight:320,overflow:'auto'}},rows.map(r=>h('label',{key:r.id,style:{display:'flex',gap:8,alignItems:'center',padding:'5px 0',borderTop:'1px solid var(--border)',fontSize:13,opacity:r.to?1:0.5}},
          h('input',{type:'checkbox',disabled:!r.to,checked:!!r.to&&pick[r.id]!==false,onChange:e=>setPick(p=>({...p,[r.id]:e.target.checked}))}),
          h('span',{style:{flex:1}},r.name),h('span',{style:{color:'var(--text3)',fontSize:12}},r.to?'+'+r.to:'no mobile'),h('b',null,rupee(r.net))))),
        h('div',{className:'modal-actions'},
          h('button',{className:'btn btn-ghost',onClick:()=>setOpen(false)},'Cancel'),
          h('button',{className:'btn btn-primary'+(busy?' btn-loading':''),disabled:busy||!chosen.length,onClick:send},'Send to '+chosen.length))))
  );
}
