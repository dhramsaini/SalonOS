// ── Email (automation phase 3) — Master Settings → 📧 Email (Super Admin): the Resend API key and From
// address for the "email" cloud function (stored server-side, never shown again), with a test email.
// The same details send the nightly / weekly / monthly reports and the alert digest. Also the
// "📧 Email" button on Owner Insights' month-end pack (emails the PDF to the report recipients).
// Loaded before js/14 (which starts the app).

async function emailCall(action,payload){
  const supa=await getSupabaseClient();
  const{data,error}=await supa.functions.invoke('email',{body:{action,...(payload||{})}});
  if(error){let msg=error.message||'Could not reach the email service';try{const b=error.context&&await error.context.json();if(b&&b.error)msg=b.error;}catch(e){}
    if(/not found|404|Failed to send a request/i.test(msg))msg='The email service isn’t installed in Supabase yet.';throw new Error(msg);}
  if(data&&data.error)throw new Error(data.error);
  return data||{};
}
async function blobToBase64(blob){
  const url=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result));r.onerror=()=>rej(new Error('Could not read the file'));r.readAsDataURL(blob);});
  return url.split(',')[1]||'';
}

function EmailSettingsCard(){
  const h=React.createElement;
  const {success,error:toastError}=useToast();
  const [st,setSt]=useState(null);
  const [key,setKey]=useState('');
  const [from,setFrom]=useState('');
  const [testTo,setTestTo]=useState('');
  const [busy,setBusy]=useState('');
  const load=async()=>{try{const s=await emailCall('status');setSt(s);setFrom(s.configured?s.from:'');}catch(e){setSt({error:e.message});}};
  useEffect(()=>{load();},[]);
  const save=async()=>{setBusy('save');try{const r=await emailCall('save',{apiKey:key.trim(),from:from.trim()});setKey('');success('Email connected — sending as '+r.from);await load();}catch(e){toastError(e.message);}setBusy('');};
  const test=async()=>{setBusy('test');try{const r=await emailCall('test',{to:testTo.trim()});success('Test email sent to '+r.to+' — check the inbox (and spam).');}catch(e){toastError(e.message);}setBusy('');};
  const remove=async()=>{if(!confirm('Disconnect email? Reports will stop going out by email.'))return;setBusy('rm');try{await emailCall('remove');success('Email disconnected');await load();}catch(e){toastError(e.message);}setBusy('');};
  return h('div',{className:'card',style:{marginBottom:16}},
    h('div',{className:'card-title'},'📧 Email'),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',lineHeight:1.6,marginBottom:12}},'Sends the nightly, weekly and monthly reports, new-alert digests and month-end packs, through Resend (free for up to 100 emails a day). Recipients are set under Automatic reports.'),
    st===null?h('div',{style:{fontSize:12,color:'var(--text3)'}},'Checking…'):
    st.error?h('div',{style:{fontSize:12,color:'var(--red)'}},st.error):
    h(React.Fragment,null,
      h('div',{style:{fontSize:12.5,marginBottom:10,color:st.configured?'var(--green)':'var(--orange)'}},
        st.configured?'✓ Connected — sending as '+st.from+(st.keyHint?' · key '+st.keyHint:'')+(st.fromEnv?' (from Supabase secrets)':''):'Not connected yet'),
      h('details',{style:{marginBottom:10},open:!st.configured},
        h('summary',{style:{cursor:'pointer',fontSize:12.5,fontWeight:600}},st.configured?'Change key or From address':'Connect (step by step)'),
        h('ol',{style:{fontSize:12,color:'var(--text2)',lineHeight:1.7,paddingLeft:18,margin:'8px 0'}},
          h('li',null,'Sign up free at resend.com.'),
          h('li',null,'API Keys → Create API key (permission "Sending access" is enough) → copy it (starts with re_).'),
          h('li',null,'Paste it below and Save. Until step 4 is done, Resend only delivers to the email you signed up with, from onboarding@resend.dev.'),
          h('li',null,'To send to anyone: Resend → Domains → Add domain "digitalca.co.in" → add the DNS records it shows at your domain provider → Verify. Then set From to e.g. SalonOS Reports <reports@digitalca.co.in> and Save.')),
        h('div',{className:'form-row cols2'},
          h('div',{className:'form-group'},h('label',null,'Resend API key'+(st.configured?' (blank = keep)':' *')),
            h('input',{className:'form-control',type:'password',autoComplete:'off',value:key,onChange:e=>setKey(e.target.value),placeholder:'re_…'})),
          h('div',{className:'form-group'},h('label',null,'From'),
            h('input',{className:'form-control',value:from,onChange:e=>setFrom(e.target.value),placeholder:st.defaultFrom||'SalonOS Reports <onboarding@resend.dev>'}))),
        h('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},
          h('button',{className:'btn btn-primary btn-sm',disabled:!!busy||(!st.configured&&!key.trim())||st.fromEnv,onClick:save},busy==='save'?'Checking with Resend…':'Save & check'),
          st.configured&&!st.fromEnv&&h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},disabled:!!busy,onClick:remove},'Disconnect'))),
      st.configured&&h('div',{style:{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}},
        h('input',{className:'form-control',style:{width:240},value:testTo,onChange:e=>setTestTo(e.target.value),placeholder:'Send test to (blank = your login email)'}),
        h('button',{className:'btn btn-ghost btn-sm',disabled:!!busy,onClick:test},busy==='test'?'Sending…':'Send test email')))
  );
}

// Owner Insights → Month-end pack → 📧 Email: builds the same PDF and emails it to the report recipients.
function EmailPackButton({salon,ym,buildRows}){
  const h=React.createElement;
  const {success,error:toastError}=useToast();
  const [open,setOpen]=useState(false);
  const [toSelf,setToSelf]=useState(true);
  const [busy,setBusy]=useState(false);
  const M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const recips=(()=>{try{return(JSON.parse(cachedLocalGet('salonos_secret_report_settings')||'{}')||{}).emails||[];}catch(e){return[];}})();
  const short=String(salon.name||'').split('—')[0].trim();
  const send=async()=>{
    setBusy(true);
    try{
      const rows=buildRows();
      if(!rows.length)throw new Error('You have no access to this outlet’s sheets.');
      const month=M[ym.m]+' '+ym.y;
      const blob=await exportReportPdfBlob('Month-end pack — '+month,String(salon.name||''),rows);
      const r=await emailCall('send_pack',{outletId:Number(salon.id),month,fileName:'SalonOS_'+short.replace(/[^A-Za-z0-9]+/g,'_')+'_'+ym.y+'-'+String(ym.m+1).padStart(2,'0')+'_month_end.pdf',pdf:await blobToBase64(blob),toSelf});
      success('Month-end pack emailed to '+r.sentTo.join(', '));setOpen(false);
    }catch(e){toastError(e.message||String(e));}
    setBusy(false);
  };
  return h(React.Fragment,null,
    h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setOpen(true)},'📧 '+short),
    open&&h('div',{className:'modal-overlay',onClick:()=>setOpen(false)},
      h('div',{className:'modal',style:{width:440},onClick:e=>e.stopPropagation()},
        h('div',{className:'modal-title'},'Email the month-end pack — '+short+', '+M[ym.m]+' '+ym.y),
        h('div',{style:{fontSize:12.5,color:'var(--text2)',marginBottom:10}},recips.length?'Goes to the Automatic reports recipients: '+recips.join(', '):'Goes to the Automatic reports recipients set by the Super Admin (Master Settings → Automatic reports), if any.'),
        h('label',{style:{display:'flex',gap:8,alignItems:'center',fontSize:13}},h('input',{type:'checkbox',checked:toSelf,onChange:e=>setToSelf(e.target.checked)}),'Also send to me'),
        h('div',{className:'modal-actions'},
          h('button',{className:'btn btn-ghost',onClick:()=>setOpen(false)},'Cancel'),
          h('button',{className:'btn btn-primary'+(busy?' btn-loading':''),disabled:busy,onClick:send},'Send'))))
  );
}
