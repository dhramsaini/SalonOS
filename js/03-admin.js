
function ResetPasswordPage(){
  const [pass,setPass]=useState('');
  const [pass2,setPass2]=useState('');
  const [showPass,setShowPass]=useState(false);
  const [err,setErr]=useState('');
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const submit=async(e)=>{
    e.preventDefault();
    setErr('');
    if(pass.length<8){setErr('Password must be at least 8 characters.');return;}
    if(pass!==pass2){setErr('Passwords do not match.');return;}
    setBusy(true);
    try{
      const supa=await getSupabaseClient();
      const{error}=await supa.auth.updateUser({password:pass});
      if(error){setErr(error.message||'Could not update password.');setBusy(false);return;}
      setDone(true);
      // Strip the recovery token from the URL so refreshing lands on the ordinary login page,
      // not back on this screen — then bounce there after a moment to confirm sign-in with it.
      window.history.replaceState(null,'',window.location.pathname+window.location.search);
      try{await supa.auth.signOut({scope:'local'});}catch(e2){}
      setTimeout(()=>{window.location.reload();},2000);
    }catch(err){setErr(err.message||'Could not update password — check your internet connection.');setBusy(false);}
  };
  return React.createElement('div',{className:'login-page'},
    React.createElement('div',{className:'login-card fade-in',style:{width:420}},
      React.createElement('div',{className:'login-logo'},'SalonOS'),
      React.createElement('div',{className:'login-tagline'},done?'Password updated':'Set a new password'),
      done
        ?React.createElement('div',{style:{textAlign:'center',color:'var(--text2)',fontSize:13,lineHeight:1.6}},
            'Your password has been updated. Taking you to the sign-in page…')
        :React.createElement('form',{className:'login-form',onSubmit:submit},
            React.createElement('div',{className:'form-group'},
              React.createElement('label',null,'New Password'),
              React.createElement('div',{style:{position:'relative'}},
                React.createElement('input',{className:'form-control',type:showPass?'text':'password',value:pass,onChange:e=>setPass(e.target.value),autoFocus:true,style:{paddingRight:40}}),
                React.createElement('button',{type:'button',onClick:()=>setShowPass(s=>!s),style:{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:14}},showPass?'🙈':'👁')
              )
            ),
            React.createElement('div',{className:'form-group'},
              React.createElement('label',null,'Confirm New Password'),
              React.createElement('input',{className:'form-control',type:showPass?'text':'password',value:pass2,onChange:e=>setPass2(e.target.value)})
            ),
            err&&React.createElement('div',{style:{color:'var(--red)',fontSize:12.5,marginBottom:12}},err),
            React.createElement('button',{type:'submit',className:'btn btn-primary'+(busy?' btn-loading':''),disabled:busy,style:{width:'100%',padding:'10px'}},'Set Password')
          )
    )
  );
}
function LoginPage({onLogin}){
  const ACCOUNTS=loadUserAccounts();
  // Prefilled with the built-in demo Super Admin login only in local (non-cloud) mode, so the
  // form isn't blank on first load there. Once cloud sync is configured, that demo account has
  // no matching Supabase user — prefilling it just showed real visitors credentials that would
  // fail to sign in, so the fields start blank instead and everyone types their real login.
  const overridesAtLoad=loadPasswordOverrides();
  const defaultAccount=ACCOUNTS[0];
  const [email,setEmail]=useState(CLOUD_SYNC_ENABLED?'':defaultAccount.email);
  const [pass,setPass]=useState(CLOUD_SYNC_ENABLED?'':(overridesAtLoad[defaultAccount.email.toLowerCase()]||defaultAccount.password));
  const [showPass,setShowPass]=useState(false);
  const [err,setErr]=useState('');
  const [showExit,setShowExit]=useState(false);
  const [exitDone,setExitDone]=useState(false);
  const [showForgot,setShowForgot]=useState(false);
  const [forgotEmail,setForgotEmail]=useState('');
  const [forgotStep,setForgotStep]=useState('email'); // 'email' | 'reset' | 'done'
  const [forgotErr,setForgotErr]=useState('');
  const [newPass,setNewPass]=useState('');
  const [newPass2,setNewPass2]=useState('');
  const currentPasswordFor=(acct)=>{const ov=loadPasswordOverrides();return ov[acct.email.toLowerCase()]||acct.password;};
  const [cloudBusy,setCloudBusy]=useState(false);
  // When cloud sync is configured (see SUPABASE_URL near safeLocalSet), real Supabase Auth
  // replaces this app's original built-in plaintext account list entirely — sign-in goes to
  // Supabase, and the matching `profiles` row (name/role/outlet access) stands in for the
  // local ACCOUNTS entry the rest of this component was built around, same shape either way.
  const cloudLogin=async(e)=>{
    setErr('');setCloudBusy(true);
    try{
      const supa=await getSupabaseClient();
      const{data,error}=await supa.auth.signInWithPassword({email:email.trim(),password:pass});
      if(error){setErr('Invalid email or password.');if(e&&e.currentTarget&&window.flashButton)window.flashButton(e.currentTarget,'error');return;}
      let{data:profile,error:profErr}=await supa.from('profiles').select('*').eq('id',data.user.id).maybeSingle();
      // Seen in the field: the password step succeeds but the follow-up request goes out without
      // the new login (e.g. another SalonOS tab/window holding the library's session lock), so the
      // profile looks missing. Ask again directly with the token we were just given.
      const firstTry=profErr?(profErr.message||String(profErr)):(profile?'':'no row visible');
      const tabNote=salonosOpenElsewhere()?' — SalonOS is open in another tab':'';
      if(!profile&&data.session&&data.session.access_token){
        try{
          const r=await fetch(SUPABASE_URL+'/rest/v1/profiles?select=*&id=eq.'+encodeURIComponent(data.user.id),{headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+data.session.access_token,Accept:'application/json'}});
          const rows=r.ok?await r.json():null;
          if(Array.isArray(rows)&&rows[0]){profile=rows[0];profErr=null;}
          else if(!r.ok)profErr=profErr||new Error('HTTP '+r.status);
        }catch(e2){profErr=profErr||e2;}
        if(profile){
          // The direct request worked, so the library lost the login it just created — hand it
          // back so everything after this (two-step check, loading data) uses it too.
          logLoginIssue(data.session,email.trim(),'first profile lookup failed ('+firstTry+'); direct retry worked'+tabNote);
          try{await supa.auth.setSession({access_token:data.session.access_token,refresh_token:data.session.refresh_token});}catch(e3){}
        }
      }
      if(!profile){
        logLoginIssue(data.session,email.trim(),'profile not loaded: '+(profErr?(profErr.message||String(profErr)):'no row visible')+' (first try: '+firstTry+')'+tabNote);
        setErr(profErr
          ?'Signed in, but your profile could not be loaded ('+((profErr.message||String(profErr)).slice(0,120))+'). Close other SalonOS tabs/windows, then try again.'
          :'Signed in, but no profile is set up for this account yet — ask your Super Admin to add one.');
        await supa.auth.signOut({scope:'local'});return;
      }
      if(profile.status==='Inactive'){setErr('This account has been deactivated. Contact your Super Admin.');await supa.auth.signOut({scope:'local'});return;}
      // Two-step login: accounts with an authenticator app set up must also enter its 6-digit code.
      // (The database only grants Super Admin powers to such an account after this step.)
      const{data:aal}=await supa.auth.mfa.getAuthenticatorAssuranceLevel();
      if(aal&&aal.nextLevel==='aal2'&&aal.currentLevel!=='aal2'){setMfaCode('');setMfaStep({profile,user:data.user});return;}
      await finishCloudLogin(profile,data.user);
    }catch(err){
      setErr(err.message||'Could not sign in — check your internet connection and try again.');
      if(e&&e.currentTarget&&window.flashButton)window.flashButton(e.currentTarget,'error');
    }finally{setCloudBusy(false);}
  };
  const [mfaStep,setMfaStep]=useState(null); // {profile,user} while waiting for the authenticator code
  const [mfaCode,setMfaCode]=useState('');
  const verifyMfa=async()=>{
    setErr('');setCloudBusy(true);
    try{
      const supa=await getSupabaseClient();
      const{data:f}=await supa.auth.mfa.listFactors();
      const factor=((f&&f.totp)||[]).find(x=>x.status==='verified');
      if(!factor)throw new Error('No authenticator app is set up for this account.');
      const{error}=await supa.auth.mfa.challengeAndVerify({factorId:factor.id,code:mfaCode.replace(/\s/g,'')});
      if(error){setErr('That code isn\'t right — use the current 6-digit code from your authenticator app.');return;}
      await finishCloudLogin(mfaStep.profile,mfaStep.user);
    }catch(err){setErr(err.message||'Could not verify the code — try again.');}
    finally{setCloudBusy(false);}
  };
  const cancelMfa=async()=>{try{const supa=await getSupabaseClient();await supa.auth.signOut({scope:'local'});}catch(e){}setMfaStep(null);setMfaCode('');setErr('');};
  const finishCloudLogin=async(profile,authUser)=>{
    try{
      const supa=await getSupabaseClient();
      const data={user:authUser};
      // Demo accounts (profiles.is_demo) are gated server-side by IP, not just by this being a
      // shared public login — demo-access-check runs with the service-role key against a table
      // this client can't read or write directly, so clearing localStorage/sessionStorage or
      // using a different browser on the SAME network can't reset the 5-day window. A real
      // customer profile always gets {allowed:true,isDemo:false} back immediately, untouched.
      let demoDaysLeft=null;
      if(profile.is_demo){
        try{
          const{data:gate,error:gateErr}=await supa.functions.invoke('demo-access-check',{body:{}});
          const fnErr=gateErr||(gate&&gate.error);
          if(fnErr){setErr('Could not verify demo access — check your internet connection and try again.');await supa.auth.signOut({scope:'local'});return;}
          if(!gate.allowed){setErr('This demo login is only available for 5 days from a given network, and that window has ended here. Please contact us to purchase SalonOS.');await supa.auth.signOut({scope:'local'});return;}
          demoDaysLeft=gate.daysLeft;
        }catch(gateEx){
          setErr('Could not verify demo access — check your internet connection and try again.');await supa.auth.signOut({scope:'local'});return;
        }
      }
      onLogin(userFromProfile(profile,data.user.email,{demoDaysLeft}));
    }catch(err){
      setErr(err.message||'Could not sign in — check your internet connection and try again.');
    }
  };
  const handleLogin=(e)=>{
    if(CLOUD_SYNC_ENABLED){cloudLogin(e);return;}
    const found=ACCOUNTS.find(u=>u.email.toLowerCase()===email.trim().toLowerCase()&&currentPasswordFor(u)===pass);
    if(found&&found.status==='Inactive'){setErr('This account has been deactivated. Contact your Super Admin.');if(e&&e.currentTarget&&window.flashButton)window.flashButton(e.currentTarget,'error');return;}
    if(found){setErr('');onLogin({...found});}
    else{setErr('Invalid email or password.');if(e&&e.currentTarget&&window.flashButton)window.flashButton(e.currentTarget,'error');}
  };
  const openForgot=()=>{setShowForgot(true);setForgotStep('email');setForgotEmail(email);setForgotErr('');setNewPass('');setNewPass2('');};
  // Cloud mode has a real mailbox behind it (Supabase Auth), so "Forgot password?" sends an
  // actual reset email instead of the old local-only override — that local flow never touched
  // the real cloud account at all, so clicking it here used to silently do nothing useful.
  const submitForgotEmailCloud=async()=>{
    if(!forgotEmail.trim()){setForgotErr('Enter your email address.');return;}
    setForgotErr('');setCloudBusy(true);
    try{
      const supa=await getSupabaseClient();
      await supa.auth.resetPasswordForEmail(forgotEmail.trim(),{redirectTo:window.location.origin+window.location.pathname});
      setForgotStep('sent');
    }catch(err){
      setForgotErr(err.message||'Could not send the reset email — check your internet connection and try again.');
    }finally{setCloudBusy(false);}
  };
  const submitForgotEmail=()=>{
    if(CLOUD_SYNC_ENABLED){submitForgotEmailCloud();return;}
    const acct=ACCOUNTS.find(u=>u.email.toLowerCase()===forgotEmail.trim().toLowerCase());
    if(!acct){setForgotErr('No SalonOS account found with that email.');return;}
    setForgotErr('');setForgotStep('reset');
  };
  const submitNewPassword=()=>{
    if(newPass.length<8){setForgotErr('New password must be at least 8 characters.');return;}
    if(newPass!==newPass2){setForgotErr('Passwords don\'t match.');return;}
    savePasswordOverride(forgotEmail,newPass);
    setForgotErr('');setForgotStep('done');
    setEmail(forgotEmail);setPass(newPass);
  };
  const doExitBackup=()=>{downloadSalonOSBackup();setShowExit(false);setExitDone(true);setTimeout(()=>window.close(),300);};
  const doExitNoBackup=()=>{setShowExit(false);setExitDone(true);setTimeout(()=>window.close(),300);};
  return React.createElement('div',{className:'login-page'},
    React.createElement('div',{className:'login-card fade-in',style:{width:460}},
      React.createElement('div',{className:'login-logo'},'SalonOS'),
      React.createElement('div',{className:'login-tagline'},'Multi-user Management Suite'),
      React.createElement('div',{className:'divider'}),
      mfaStep?React.createElement('div',{className:'login-form'},
        React.createElement('div',{style:{fontSize:13.5,color:'var(--text2)',marginBottom:14,lineHeight:1.6}},'🔐 Two-step login is on for this account. Enter the 6-digit code shown in your authenticator app (Google Authenticator, Microsoft Authenticator, etc.).'),
        React.createElement('div',{className:'form-group',style:{marginBottom:14}},
          React.createElement('label',null,'Authenticator code'),
          React.createElement('input',{className:'form-control',value:mfaCode,autoFocus:true,inputMode:'numeric',autoComplete:'one-time-code',maxLength:8,placeholder:'123456',
            style:{fontSize:20,letterSpacing:'0.3em',textAlign:'center'},onChange:e=>setMfaCode(e.target.value.replace(/[^\d\s]/g,'')),onKeyDown:e=>e.key==='Enter'&&verifyMfa()})),
        err&&React.createElement('div',{style:{color:'var(--red)',fontSize:12,marginBottom:12}},err),
        React.createElement('button',{className:'btn btn-primary'+(cloudBusy?' btn-loading':''),disabled:cloudBusy||mfaCode.replace(/\s/g,'').length<6,style:{width:'100%',padding:'10px'},onClick:verifyMfa},'Verify & Sign In'),
        React.createElement('button',{className:'btn btn-ghost',style:{width:'100%',padding:'10px',marginTop:10},disabled:cloudBusy,onClick:cancelMfa},'Use a different account')
      ):
      React.createElement('div',{className:'login-form'},
        React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-1'},'Email Address'),React.createElement('input',{id:'f-1',className:'form-control',value:email,onChange:e=>setEmail(e.target.value),placeholder:'you@yourcompany.com'})),
        React.createElement('div',{className:'form-group',style:{marginBottom:18}},
          React.createElement('label',null,'Password'),
          React.createElement('div',{style:{position:'relative'}},
            React.createElement('input',{className:'form-control',type:showPass?'text':'password',value:pass,onChange:e=>setPass(e.target.value),onKeyDown:e=>e.key==='Enter'&&handleLogin(),style:{paddingRight:40}}),
            React.createElement('button',{type:'button',onClick:()=>setShowPass(v=>!v),title:showPass?'Hide password':'Show password',
              style:{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--text3)',fontSize:14,padding:4}},
              showPass?'🙈':'👁')
          ),
          React.createElement('div',{style:{textAlign:'right',marginTop:6}},
            React.createElement('span',{style:{fontSize:11.5,color:'var(--accent)',cursor:'pointer'},onClick:openForgot},'Forgot password?')
          )
        ),
        err&&React.createElement('div',{style:{color:'var(--red)',fontSize:12,marginBottom:12}},err),
        React.createElement('button',{className:'btn btn-primary'+(cloudBusy?' btn-loading':''),disabled:cloudBusy,style:{width:'100%',padding:'10px'},onClick:e=>handleLogin(e)},'Sign In'),
        React.createElement('button',{className:'btn btn-ghost',style:{width:'100%',padding:'10px',marginTop:10},onClick:()=>setShowExit(true)},'Exit'),
        React.createElement('div',{style:{fontSize:10,color:'var(--text3)',textAlign:'center',marginTop:16,paddingTop:14,borderTop:'1px solid var(--border)',letterSpacing:'0.02em'}},'Developed By CA Dharmender Saini, Gurugram')
      )
    ),
    showForgot&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowForgot(false)},
      React.createElement('div',{className:'modal',style:{width:400},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Reset your password'),
        forgotStep==='email'&&React.createElement(React.Fragment,null,
          React.createElement('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:14,lineHeight:1.5}},
            CLOUD_SYNC_ENABLED?'Enter your account email and we\'ll send you a reset link.':'This app has no mail server, so recovery works locally: confirm your account email, then set a new password right here.'),
          React.createElement('div',{className:'form-group',style:{marginBottom:14}},
            React.createElement('label',null,'Email Address'),
            React.createElement('input',{className:'form-control',value:forgotEmail,autoFocus:true,onChange:e=>setForgotEmail(e.target.value),onKeyDown:e=>e.key==='Enter'&&submitForgotEmail(),placeholder:'you@yourcompany.com'})
          ),
          forgotErr&&React.createElement('div',{style:{color:'var(--red)',fontSize:12,marginBottom:12}},forgotErr),
          React.createElement('div',{className:'modal-actions'},
            React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowForgot(false)},'Cancel'),
            React.createElement('button',{className:'btn btn-primary',disabled:cloudBusy,onClick:submitForgotEmail},cloudBusy?'Sending…':'Continue')
          )
        ),
        forgotStep==='sent'&&React.createElement(React.Fragment,null,
          React.createElement('div',{style:{fontSize:12,color:'var(--text2)',marginBottom:16,lineHeight:1.5}},'📧 If an account exists for '+forgotEmail+', a reset link has been sent. Open it to set a new password.'),
          React.createElement('div',{className:'modal-actions'},
            React.createElement('button',{className:'btn btn-primary',onClick:()=>setShowForgot(false)},'Done')
          )
        ),
        forgotStep==='reset'&&React.createElement(React.Fragment,null,
          React.createElement('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:14}},'Set a new password for '+forgotEmail+'.'),
          React.createElement('div',{className:'form-group',style:{marginBottom:12}},
            React.createElement('label',null,'New Password'),
            React.createElement('input',{className:'form-control',type:'password',value:newPass,autoFocus:true,onChange:e=>setNewPass(e.target.value)})
          ),
          React.createElement('div',{className:'form-group',style:{marginBottom:14}},
            React.createElement('label',null,'Confirm New Password'),
            React.createElement('input',{className:'form-control',type:'password',value:newPass2,onChange:e=>setNewPass2(e.target.value),onKeyDown:e=>e.key==='Enter'&&submitNewPassword()})
          ),
          forgotErr&&React.createElement('div',{style:{color:'var(--red)',fontSize:12,marginBottom:12}},forgotErr),
          React.createElement('div',{className:'modal-actions'},
            React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowForgot(false)},'Cancel'),
            React.createElement('button',{className:'btn btn-primary',onClick:submitNewPassword},'Set New Password')
          )
        ),
        forgotStep==='done'&&React.createElement(React.Fragment,null,
          React.createElement('div',{style:{fontSize:12,color:'var(--text2)',marginBottom:16}},'✅ Password updated. It\'s filled in on the sign-in form now — just hit Sign In.'),
          React.createElement('div',{className:'modal-actions'},
            React.createElement('button',{className:'btn btn-primary',onClick:()=>setShowForgot(false)},'Done')
          )
        )
      )
    ),
    showExit&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowExit(false)},
      React.createElement('div',{className:'modal',style:{width:420},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Take a backup before exiting?'),
        React.createElement('div',{style:{fontSize:12.5,color:'var(--text2)',lineHeight:1.6,marginBottom:18}},'This app\'s data lives only in this browser. Downloading a backup now means you\'ll always have a copy, even if this browser\'s data is ever cleared.'),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowExit(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-ghost',onClick:doExitNoBackup},'No, Just Exit'),
          React.createElement('button',{className:'btn btn-primary',onClick:doExitBackup},'⬇ Yes, Download Backup')
        )
      )
    ),
    exitDone&&React.createElement('div',{className:'modal-overlay'},
      React.createElement('div',{className:'modal',style:{width:380,textAlign:'center'}},
        React.createElement('div',{style:{fontSize:28,marginBottom:10}},'👋'),
        React.createElement('div',{style:{fontSize:14,color:'var(--text)',fontWeight:600,marginBottom:6}},'It\'s safe to close this tab now'),
        React.createElement('div',{style:{fontSize:12,color:'var(--text3)'}},'If this tab didn\'t close automatically, you can close it yourself.')
      )
    )
  );
}

// ── First-run onboarding — shown instead of the dashboard when no salons exist yet, so a fresh
// install guides someone toward real data instead of just looking broken/empty. ──
function GettingStarted({onAddSalon,isAdmin}){
  const steps=[
    {icon:'🏪',title:'Add your first salon',desc:'Register your outlet — name, city, GST details. Every other screen in the app is scoped to a salon, so this comes first.'},
    {icon:'👥',title:'Add your employees',desc:'Master Salary — names, designation, salary structure. Needed before Attendance, Salary Working, or Incentive Working can do anything.'},
    {icon:'🔁',title:'Set up Recurring Expenses',desc:'Rent, Electricity, Royalty, and the like — enter each one once, and it flows into P&L (Monthly) automatically every month after that.'},
    {icon:'📊',title:'Start entering daily data',desc:'Daily Sales & Exp, Collection Reco, Bank Statement — the real, day-to-day numbers everything else is built from.'},
  ];
  return React.createElement('div',{className:'fade-in',style:{maxWidth:640,margin:'48px auto',textAlign:'center',padding:'0 16px'}},
    React.createElement('div',{style:{fontSize:44,marginBottom:14}},'🚀'),
    React.createElement('div',{style:{fontFamily:'var(--font2)',fontSize:26,color:'var(--text)',marginBottom:8}},'Welcome to SalonOS'),
    React.createElement('div',{style:{color:'var(--text3)',fontSize:13.5,marginBottom:30,lineHeight:1.6}},'No salons set up yet. Here\'s the order that gets you to real, working data fastest.'),
    React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:10,textAlign:'left',marginBottom:30}},
      steps.map((s,i)=>React.createElement('div',{key:i,className:'card',style:{display:'flex',gap:14,alignItems:'flex-start',padding:'14px 18px',opacity:i===0?1:0.6}},
        React.createElement('div',{style:{fontSize:22,flexShrink:0}},s.icon),
        React.createElement('div',null,
          React.createElement('div',{style:{fontWeight:700,color:'var(--text)',marginBottom:2,fontSize:13.5}},(i+1)+'. '+s.title),
          React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',lineHeight:1.5}},s.desc)
        )
      ))
    ),
    isAdmin
      ? React.createElement('button',{className:'btn btn-primary',style:{fontSize:14,padding:'11px 26px'},onClick:onAddSalon},'+ Add Your First Salon')
      : React.createElement('div',{style:{fontSize:12.5,color:'var(--text3)',fontStyle:'italic'}},'Ask your Super Admin to add a salon — Master Sheet access is admin-only.')
  );
}

function MasterDashboard({selFY,setSelFY,FYS,accessibleSalons}){
  const [selOutlet,setSelOutlet]=useState('all');
  // Scoped to accessibleSalons (the same outlet-permission list the sidebar/outlet switcher
  // already uses), NOT the raw global SALONS — this used to aggregate every outlet's real
  // revenue/expenses/staff into these cards regardless of the logged-in user's own outlet
  // access, so a Data Entry User restricted to one outlet (or the sandboxed public demo
  // account) could still read off company-wide financial totals just from this screen, without
  // ever being able to open the other outlets directly.
  const activeSalons=(accessibleSalons||SALONS).filter(s=>s.status==='Active');
  const targetSalons=selOutlet==='all'?activeSalons:activeSalons.filter(s=>String(s.id)===String(selOutlet));
  const today=new Date();

  // Every figure below is computed live from the same real accounting/attendance engine that
  // powers the per-outlet Dashboard and P&L (plBuild / swWorkingsFor / statutoryDeductionsFor) —
  // this used to be a screen of fixed placeholder numbers that never changed no matter what data
  // existed. Months with no real entries naturally contribute ₹0, so nothing here is fabricated.
  const fyAgg=(sid)=>{
    let revenue=0,expenses=0,netProfit=0,salaries=0,pfEr=0,esicEr=0,netDisbursed=0,lopDays=0,attSum=0,attCount=0;
    const monthly=PG_MONTHS.map((abbr,mi)=>{
      const d=plBuild(sid,selFY,mi);
      revenue+=d.revenue;expenses+=d.direct+d.opex;netProfit+=d.pbt;
      const incentives=d.sections[2].lines.filter(l=>l.group==='Employee Monthly Incentive'||l.group==='Employee Daily Incentive').reduce((s,l)=>s+l.amt,0);
      salaries+=d.sections[2].tot-incentives;
      const year=Number(pgYear(selFY,mi)),month=(mi+3)%12;
      const sw=swWorkingsFor(sid,year,month);
      sw.forEach(w=>{netDisbursed+=w.net;lopDays+=w.lop;});
      if(sw.length){attSum+=sw.reduce((s,w)=>s+(w.daysInMonth?w.totalDays/w.daysInMonth*100:0),0);attCount+=sw.length;}
      statutoryDeductionsFor(sid,year,month).forEach(x=>{pfEr+=x.pfEr;esicEr+=x.esicEr;});
      return{abbr,revenue:d.revenue};
    });
    return{revenue,expenses,netProfit,salaries,pfEr,esicEr,netDisbursed,lopDays,attSum,attCount,monthly};
  };

  const aggs=targetSalons.map(s=>({salon:s,...fyAgg(Number(s.id))}));
  const totals=aggs.reduce((t,a)=>({
    revenue:t.revenue+a.revenue,expenses:t.expenses+a.expenses,netProfit:t.netProfit+a.netProfit,
    salaries:t.salaries+a.salaries,pfEr:t.pfEr+a.pfEr,esicEr:t.esicEr+a.esicEr,
    netDisbursed:t.netDisbursed+a.netDisbursed,lopDays:t.lopDays+a.lopDays,
    attSum:t.attSum+a.attSum,attCount:t.attCount+a.attCount
  }),{revenue:0,expenses:0,netProfit:0,salaries:0,pfEr:0,esicEr:0,netDisbursed:0,lopDays:0,attSum:0,attCount:0});

  const activeStaffCount=targetSalons.reduce((s,salon)=>
    s+getEmployeesForMonth(today.getFullYear(),today.getMonth(),Number(salon.id)).filter(e=>e.status==='Active').length,0);

  const onLeaveToday=targetSalons.reduce((s,salon)=>{
    const emps=getEmployeesForMonth(today.getFullYear(),today.getMonth(),Number(salon.id)).filter(e=>e.status==='Active');
    const attStore=loadAttendance(Number(salon.id));
    return s+emps.filter(e=>{
      const rec=attStore[attMonthKey(e.id,today.getFullYear(),today.getMonth())];
      const days=(rec&&rec.days)||[];
      return days[today.getDate()-1]==='absent';
    }).length;
  },0);

  const fmtL=(v)=>'₹'+(v/100000).toFixed(2)+'L';
  const revMonthly=PG_MONTHS.map((abbr,mi)=>({label:abbr,value:aggs.reduce((s,a)=>s+(a.monthly[mi]?a.monthly[mi].revenue:0),0)}));
  const avgAttPct=totals.attCount?Math.round(totals.attSum/totals.attCount):0;

  // ── Outlet comparison for one month — every figure from the same engines as the P&L and
  // Salary Working (plBuild / swWorkingsFor), side by side and ranked by revenue. ──
  const nowFYMI=calToFYMI(today.getFullYear(),today.getMonth());
  const [cmpMi,setCmpMi]=useState(nowFYMI.fy===selFY?nowFYMI.mi:11);
  const inr=v=>'₹'+Math.round(Number(v)||0).toLocaleString('en-IN');
  const cmpRows=activeSalons.map(s=>{
    const sid=Number(s.id);
    const d=plBuild(sid,selFY,cmpMi);
    const prev=cmpMi>0?plBuild(sid,selFY,cmpMi-1):null;
    const year=Number(pgYear(selFY,cmpMi)),month=(cmpMi+3)%12;
    const sw=swWorkingsFor(sid,year,month);
    const staff=getEmployeesForMonth(year,month,sid).filter(e=>e.status==='Active').length;
    const att=sw.length?Math.round(sw.reduce((t,w)=>t+(w.daysInMonth?w.totalDays/w.daysInMonth*100:0),0)/sw.length):null;
    return{s,rev:d.revenue,exp:d.direct+d.opex,pbt:d.pbt,margin:d.revenue?Math.round(d.pbt/d.revenue*100):null,
      chg:prev&&prev.revenue?Math.round((d.revenue-prev.revenue)/prev.revenue*100):null,staff,perStaff:staff?d.revenue/staff:0,att};
  }).sort((a,b)=>b.rev-a.rev);
  const topRev=cmpRows.length?cmpRows[0].rev:0;

  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'page-title'},'Master Dashboard'),
    React.createElement('div',{className:'page-sub'},'Consolidated analytics across all outlets — FY '+selFY),
    React.createElement('div',{style:{display:'flex',gap:10,marginBottom:20,flexWrap:'wrap'}},
      React.createElement('select',{className:'form-control',style:{width:'auto'},value:selOutlet,onChange:e=>setSelOutlet(e.target.value)},
        React.createElement('option',{value:'all'},'All Outlets'),
        activeSalons.map(s=>React.createElement('option',{key:s.id,value:s.id},s.name))
      ),
      React.createElement('select',{className:'form-control',style:{width:'auto'},value:selFY,onChange:e=>setSelFY(e.target.value)},
        FYS.map(f=>React.createElement('option',{key:f,value:f},'FY '+f))
      )
    ),
    (()=>{const all=activeSalons.map(s=>({s,gaps:dataGapsFor(s)})).filter(x=>x.gaps.length);
      return all.length>0&&React.createElement('div',{className:'card',style:{marginBottom:20,borderColor:'var(--orange)'}},
        React.createElement('div',{className:'card-title'},'⚠️ Needs attention'),
        all.map(x=>React.createElement('div',{key:x.s.id,style:{padding:'6px 0',borderTop:'1px solid var(--border)'}},
          React.createElement('div',{style:{fontWeight:600,fontSize:13,marginBottom:2}},x.s.name),
          x.gaps.map((g,i)=>React.createElement('div',{key:i,style:{fontSize:12.5,color:'var(--text2)'}},'• '+g.text)))),
        React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'Open the outlet to fix these — each outlet\'s dashboard has a button for each item.'));})(),
    cmpRows.length>0&&React.createElement('div',{className:'card',style:{marginBottom:20}},
      React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap',marginBottom:12}},
        React.createElement('div',{className:'card-title',style:{marginBottom:0}},'🏪 Outlet comparison'),
        React.createElement('select',{className:'form-control',style:{width:'auto',fontSize:12},value:cmpMi,onChange:e=>setCmpMi(Number(e.target.value))},
          PG_MONTHS.map((m,i)=>React.createElement('option',{key:i,value:i},m+' '+pgYear(selFY,i))))
      ),
      React.createElement('div',{className:'table-wrap'},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,
            ['Outlet','Revenue','vs last month','Expenses','Net profit','Margin','Staff','Revenue / staff','Attendance'].map(h=>React.createElement('th',{key:h},h)))),
          React.createElement('tbody',null,cmpRows.map(r=>React.createElement('tr',{key:r.s.id},
            React.createElement('td',{style:{fontWeight:600}},(r.rev>0&&r.rev===topRev&&cmpRows.length>1?'🏆 ':'')+r.s.name),
            React.createElement('td',null,inr(r.rev)),
            React.createElement('td',{style:{color:r.chg==null?'var(--text3)':r.chg>=0?'var(--green)':'var(--red)'}},r.chg==null?'—':(r.chg>=0?'▲ ':'▼ ')+Math.abs(r.chg)+'%'),
            React.createElement('td',null,inr(r.exp)),
            React.createElement('td',{style:{color:r.pbt>=0?'var(--green)':'var(--red)',fontWeight:600}},inr(r.pbt)),
            React.createElement('td',null,r.margin==null?'—':r.margin+'%'),
            React.createElement('td',null,r.staff),
            React.createElement('td',null,r.staff?inr(r.perStaff):'—'),
            React.createElement('td',null,r.att==null?'—':r.att+'%')))))
      ),
      React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:8}},'Same figures as each outlet\'s P&L and Salary Working. Ranked by revenue.')
    ),
    activeSalons.length===0&&React.createElement('div',{className:'card',style:{marginBottom:16,color:'var(--text3)',fontSize:13}},
      'No active outlets yet — figures below will fill in as soon as an outlet and its data are added.'
    ),
    React.createElement('div',{className:'grid4',style:{marginBottom:16}},
      [{label:'Total Revenue',val:fmtL(totals.revenue),color:'blue'},
       {label:'Net Profit',val:fmtL(totals.netProfit),color:'green'},
       {label:'Total Expenses',val:fmtL(totals.expenses),color:'amber'},
       {label:'Active Staff',val:String(activeStaffCount),color:'purple',sub:'Across '+targetSalons.length+' active outlet'+(targetSalons.length===1?'':'s')}].map(m=>
        React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},
          React.createElement('div',{className:'metric-label'},m.label),
          React.createElement('div',{className:'metric-value'},m.val),
          m.sub&&React.createElement('div',{className:'metric-sub'},m.sub)
        )
      )
    ),
    React.createElement('div',{className:'grid2',style:{marginBottom:16}},
      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'card-title'},'📈 Monthly Revenue Trend — FY '+selFY),
        React.createElement(DynamicBarChart,{
          data:revMonthly,
          height:150,highlightLast:true,
          formatValue:v=>'₹'+Math.round(v).toLocaleString('en-IN')
        })
      ),
      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'card-title'},'🏪 Outlet Performance — FY '+selFY),
        aggs.length===0?React.createElement('div',{style:{fontSize:12,color:'var(--text3)'}},'No outlets to show.'):
        (()=>{
          const palette=['var(--accent)','var(--blue)','var(--teal)','var(--purple)','var(--green)'];
          const maxV=Math.max(...aggs.map(a=>a.revenue),1);
          return aggs.map((a,i)=>React.createElement('div',{key:a.salon.id,style:{marginBottom:14}},
            React.createElement('div',{style:{display:'flex',justifyContent:'space-between',marginBottom:4}},
              React.createElement('span',{style:{fontSize:12,color:'var(--text2)'}},a.salon.name.split('—')[0].trim()),
              React.createElement('span',{style:{fontSize:12,color:'var(--text)',fontWeight:500}},fmtL(a.revenue))
            ),
            React.createElement('div',{className:'progress'},
              React.createElement('div',{className:'progress-fill',style:{width:Math.round(a.revenue/maxV*100)+'%',background:palette[i%palette.length]}})
            )
          ));
        })()
      )
    ),
    React.createElement('div',{className:'grid2'},
      React.createElement('div',{className:'card card-sm'},
        React.createElement('div',{className:'card-title'},'💰 Salary Summary — FY '+selFY),
        [['Gross payable','₹'+Math.round(totals.salaries).toLocaleString('en-IN')],
         ['PF (Employer)','₹'+Math.round(totals.pfEr).toLocaleString('en-IN')],
         ['ESIC (Employer)','₹'+Math.round(totals.esicEr).toLocaleString('en-IN')],
         ['Net disbursed','₹'+Math.round(totals.netDisbursed).toLocaleString('en-IN')]].map(([k,v],i)=>
          React.createElement('div',{key:k,className:'stat-row'},
            React.createElement('span',{style:{fontSize:12,color:'var(--text2)'}},k),
            React.createElement('span',{style:{fontSize:12,fontWeight:i===3?600:400,color:i===3?'var(--green)':'var(--text)'}},v)
          )
        )
      ),
      React.createElement('div',{className:'card card-sm'},
        React.createElement('div',{className:'card-title'},'📊 Attendance Overview — FY '+selFY),
        [['Avg attendance',avgAttPct+'%','green'],['Total LOP days',Math.round(totals.lopDays)+' days',''],['On leave today',onLeaveToday+' employee'+(onLeaveToday===1?'':'s'),'']].map(([k,v,c])=>
          React.createElement('div',{key:k,className:'stat-row'},
            React.createElement('span',{style:{fontSize:12,color:'var(--text2)'}},k),
            React.createElement('span',{style:{fontSize:12,color:c?`var(--${c})`:'var(--text)',fontWeight:c?500:400}},v)
          )
        )
      )
    )
  );
}

// ── Lock Months panel — per-outlet checklist (grouped by Financial Year) letting an admin lock
// or unlock any specific past month from Master Sheet. Months auto-locked from Salary Working
// (all employees Approved) show up already checked, tagged "auto" — unchecking them here works
// exactly the same as unlocking from Salary Working itself. ──
function SalonMonthLockPanel({salon,onClose}){
  const {toast}=useToast();
  const [fy,setFy]=useState(()=>{const d=new Date();return calToFYMI(d.getFullYear(),d.getMonth()).fy;});
  const [tick,setTick]=useState(0); // bump to force re-read from storage after a toggle
  const locks=loadMonthLocks(salon?.id);
  const monthsOfFY=PG_MONTHS.map((abbr,mi)=>({mi,abbr,long:PG_LONG[mi],year:Number(pgYear(fy,mi))}));
  const toggle=(year,monthCal)=>{
    // Toggles the manual/master override specifically — leaves either sheet's own independent
    // auto-lock (from full approval) untouched, since that's unlocked from that sheet itself.
    const rec=monthLockRecordFor(salon?.id,year,monthCal);
    const currentlyManual=!!(rec&&rec.locked&&rec.source==='manual');
    const nowLocked=!currentlyManual;
    setMonthLockFor(salon?.id,year,monthCal,nowLocked,'manual');
    setTick(t=>t+1);
    toast((nowLocked?'Locked ':'Unlocked ')+PG_LONG[monthCal]+' '+year,'success');
  };
  return React.createElement('div',{className:'modal-overlay',onClick:onClose},
    React.createElement('div',{className:'modal',style:{width:520,maxHeight:'82vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
      React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}},
        React.createElement('div',{className:'modal-title',style:{marginBottom:0,paddingBottom:0,border:'none'}},'🔒 Lock Months — '+(salon?salon.name.split('—')[0].trim():'')),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:onClose},'✕ Close')
      ),
      React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:14,paddingBottom:12,borderBottom:'1px solid var(--border)'}},
        'Tick a month to lock it manually — Attendance, Salary Working and Incentive Working all become read-only for that outlet that month, overriding both sheets\' own approvals. Left untouched, Salary Working (with Attendance) and Incentive Working now each lock themselves automatically and independently, the moment every employee on that sheet is marked Approved — approving one doesn\'t lock the other.'
      ),
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:12}},
        React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},'Financial Year'),
        React.createElement('select',{className:'form-control',style:{width:'auto'},value:fy,onChange:e=>setFy(e.target.value)},
          PG_FYS.map(f=>React.createElement('option',{key:f,value:f},'FY '+f)))
      ),
      React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:6}},
        monthsOfFY.map(m=>{
          const rec=locks[monthLockCode(m.year,m.mi)];
          const locked=!!(rec&&rec.locked);
          const iwRec=iwAutoLockRecordFor(salon?.id,m.year,m.mi);
          const iwLocked=!!(iwRec&&iwRec.locked)&&!(locked&&rec.source==='manual');
          return React.createElement('label',{key:m.mi,style:{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'var(--bg3)',borderRadius:'var(--r)',border:'1px solid var(--border)',cursor:'pointer'}},
            React.createElement('input',{type:'checkbox',checked:locked&&rec.source==='manual',onChange:()=>toggle(m.year,m.mi)}),
            React.createElement('span',{style:{fontSize:12.5,fontWeight:500,color:'var(--text)',minWidth:120}},m.long+' '+m.year),
            locked&&rec.source==='manual'&&React.createElement('span',{className:'badge badge-amber',style:{fontSize:10}},'🔒 Locked (Master Sheet — all sheets)'),
            locked&&rec.source==='auto'&&React.createElement('span',{className:'badge badge-green',style:{fontSize:10}},'🔒 Salary Working — Auto (Approved)'),
            locked&&rec.source==='manual-sw'&&React.createElement('span',{className:'badge badge-green',style:{fontSize:10}},'🔒 Salary Working — Locked Manually'),
            iwLocked&&React.createElement('span',{className:'badge badge-green',style:{fontSize:10}},iwRec&&iwRec.source==='manual'?'🔒 Incentive Working — Locked Manually':'🔒 Incentive Working — Auto (Approved)'),
            !locked&&!iwLocked&&React.createElement('span',{style:{fontSize:11,color:'var(--text3)'}},'Open')
          );
        })
      )
    )
  );
}

function MasterSheet({onSelect,salons,setSalons,user}){
  const BLANK={id:'',name:'',city:'',state:'',pin:'',gst:'',pan:'',type:'Owned',manager:'',phone:'',email:'',status:'Active',est:new Date().toISOString().slice(0,10),typeHistory:[],
    // Brand Logo — stored as a base64 data URL (localStorage, same as everything else here), used
    // on printed Tax Invoices, the Billing Register export, and anywhere else the salon's own
    // branding should appear instead of the generic SalonOS wordmark.
    logo:'',
    firmName:'',brandName:'',firmCategory:'',proprietorName:'',
    // firmMembers covers Partners (Partnership Firm / LLP) and Shareholders (Private Limited) —
    // one shared shape {name, sharePct, din} since all three are just "who owns how much of this
    // firm", differing only in whether DIN applies (LLP designated partners & company directors
    // have one; plain Partnership Act partners don't).
    firmMembers:[],
    bankName:'',bankAccountNo:'',bankIFSC:'',bankBranch:'',bankAccountHolder:'',
    gstApplicable:false,gstLoginId:'',gstPassword:'',gstWef:'',
    esicApplicable:false,esicCode:'',esicLoginId:'',esicPassword:'',esicWef:'',
    pfApplicable:false,pfCode:'',pfLoginId:'',pfPassword:'',pfWef:'',
    tdsApplicable:false,tan:'',tdsLoginId:'',tdsPassword:'',tdsWef:'',
    ptApplicable:false,ptRegNo:'',ptLoginId:'',ptPassword:'',ptWef:'',
    // GST Input Tax Credit — separate from gstApplicable above (that's whether the outlet is
    // GST-registered and charges GST on sales; this is whether it's BLOCKED from claiming credit
    // on what it pays GST on for purchases — standard "Blocked Credit" terminology under Section
    // 17(5) of the CGST Act). Salon/beauty services commonly are — defaults to Yes (blocked),
    // matching that industry norm, with a With Effect From date since this can change (e.g. a
    // change in registration type, or a change in the law itself).
    gstInputBlocked:true,gstInputWef:'',
    // Vendor invoices: piAsExpense — a Performa Invoice counts as an expense in its own month, and
    // the actual invoice later booked against it adds only the difference (short/excess) in the
    // actual invoice's month. attachmentRequired — Tax Invoice / Invoice / Performa Invoice can't be
    // saved without the document attached.
    piAsExpense:false,attachmentRequired:false,
    // Payment Due Dates — feeds the Due Date Tracker's auto-generated Salary Disbursement /
    // Incentive Payment items, same rolling-window pattern as PF/ESIC/PT, but on a day the outlet
    // itself sets rather than a fixed statutory one, since payroll cutoff varies salon to salon.
    // "Day of the following month" — same convention as PF/ESIC (contribution for July is due by
    // this day in August).
    salaryDueDay:7,incentiveDueDay:10,
    // ── Daily Sales & Exp Edit Window — restricts backdated editing on the CURRENT calendar
    // month to a rolling window of N days from today, so old entries can't quietly be changed
    // long after the fact even before that month gets fully locked. Only applies while the
    // month itself isn't already locked (a locked month is already fully read-only regardless).
    // Past months are governed entirely by the existing Month Lock — this never affects them.
    dseEditWindowEnabled:false,dseEditWindowDays:3};
  const [showModal,setShowModal]=useState(false);
  // '', 'loading', 'found', 'notfound' — feedback for the IFSC → Branch auto-lookup below.
  const [ifscLookupStatus,setIfscLookupStatus]=useState('');
  const doIfscLookup=async()=>{
    const code=(form.bankIFSC||'').trim().toUpperCase();
    if(!isValidIfscFormat(code)){setIfscLookupStatus('');return;}
    setIfscLookupStatus('loading');
    const details=await fetchIfscDetails(code);
    if(details&&details.BRANCH){
      setForm(f=>({...f,bankIFSC:code,bankBranch:details.BRANCH+(details.CITY?', '+details.CITY:''),bankName:details.BANK||f.bankName}));
      setIfscLookupStatus('found');
    }else{
      setIfscLookupStatus('notfound');
    }
  };
  const [showDelete,setShowDelete]=useState(null);
  const [showReset,setShowReset]=useState(null);
  const [showLockMonths,setShowLockMonths]=useState(null);
  const [editItem,setEditItem]=useState(null);
  const [form,setForm]=useState(BLANK);
  const [search,setSearch]=useState('');
  const {toast}=useToast();

  const fc=(k)=>(e)=>setForm(f=>({...f,[k]:e.target.value}));
  const fcCheck=(k)=>(e)=>setForm(f=>({...f,[k]:e.target.checked}));
  const nextId=()=>nextSalonId(salons);
  // ── Brand Logo upload — downsizes to a reasonable max dimension via canvas before storing as a
  // base64 data URL, so a large phone-camera photo doesn't bloat localStorage. PNG/JPG/WebP only.
  const [logoBusy,setLogoBusy]=useState(false);
  const logoFileRef=useRef(null);
  const handleLogoFile=(e)=>{
    const file=e.target.files&&e.target.files[0];
    e.target.value='';
    if(!file)return;
    if(!/^image\/(png|jpe?g|webp)$/i.test(file.type)){toast('Please choose a PNG, JPG or WebP image','error');return;}
    if(file.size>4*1024*1024){toast('Logo image is too large — please choose one under 4 MB','error');return;}
    setLogoBusy(true);
    const reader=new FileReader();
    reader.onload=(ev)=>{
      const img=new Image();
      img.onload=()=>{
        const MAX=480;
        const scale=Math.min(1,MAX/Math.max(img.width,img.height));
        const w=Math.round(img.width*scale),h=Math.round(img.height*scale);
        const canvas=document.createElement('canvas');
        canvas.width=w;canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        setForm(f=>({...f,logo:canvas.toDataURL('image/png')}));
        setLogoBusy(false);
      };
      img.onerror=()=>{toast('Could not read that image','error');setLogoBusy(false);};
      img.src=ev.target.result;
    };
    reader.onerror=()=>{toast('Could not read that file','error');setLogoBusy(false);};
    reader.readAsDataURL(file);
  };
  const removeLogo=()=>setForm(f=>({...f,logo:''}));
  // Professional Tax is never a manual choice — the outlet's own State decides it. Whichever
  // state is picked, ptApplicable is forced to match that state's PT applicability immediately.
  const onStateChange=(e)=>{
    const st=e.target.value;
    setForm(f=>({...f,state:st,ptApplicable:ptAppliesToState(st)}));
  };
  // ── Firm Details — Partners (Partnership Firm / LLP) or Shareholders (Private Limited) are a
  // repeatable list, not a single field, since these structures normally involve more than one
  // person. Switching Firm Category doesn't clear an already-entered list, in case someone picks
  // the wrong category first and corrects it — the DIN column just shows/hides as relevant. ──
  const FIRM_MEMBER_LABEL={'Partnership Firm':'Partner','LLP':'Partner','Private Limited':'Shareholder'}[form.firmCategory]||'Member';
  const firmMemberHasDin=form.firmCategory==='LLP'||form.firmCategory==='Private Limited';
  const addFirmMember=()=>setForm(f=>({...f,firmMembers:[...(f.firmMembers||[]),{name:'',sharePct:'',din:''}]}));
  const updateFirmMember=(idx,key,val)=>setForm(f=>({...f,firmMembers:(f.firmMembers||[]).map((m,i)=>i===idx?{...m,[key]:val}:m)}));
  const removeFirmMember=(idx)=>{if(confirm('Remove this partner/shareholder entry?'))setForm(f=>({...f,firmMembers:(f.firmMembers||[]).filter((_,i)=>i!==idx)}));};
  const firmMemberShareTotal=(form.firmMembers||[]).reduce((s,m)=>s+(Number(m.sharePct)||0),0);

  // ── Bulk import — download a template, fill it in Excel, upload it back to add many salons at
  // once. Covers core business, bank, and compliance-registration-number fields. Portal login
  // IDs/passwords are deliberately left out of the template — those are real credentials, and a
  // spreadsheet that gets emailed or copied around is a worse place for them than entering each
  // one individually per salon, which stays in the app only. ──
  const [bulkBusy,setBulkBusy]=useState(false);
  const [bulkResult,setBulkResult]=useState(null);
  const bulkFileRef=useRef(null);
  // ── Headers mirror the Edit Salon form field-for-field, section by section: Basic, Firm Details
  // (added alongside the form's own Firm Details section), Address, Registration, Contact, Bank
  // Details, Statutory. Keeping the same order as the form makes filling the template feel familiar. ──
  const SALON_TEMPLATE_HEADERS=['Salon Name','Outlet Type',
    'Firm Name','Brand Name','Firm Category','Name of Proprietor','Partners / Shareholders',
    'City','State','PIN Code','GST Number','PAN Number','Manager Name','Contact Phone','Email','Established Date (DD/MM/YYYY)','Status',
    'Bank Name','Account Holder Name','Account Number','IFSC Code','Branch',
    'GST Applicable (Yes/No)','ESIC Applicable (Yes/No)','ESIC Code','PF Applicable (Yes/No)','PF Establishment Code','TDS Applicable (Yes/No)','TAN Number','PT Applicable (Yes/No)','PT Registration Number'];
  const downloadSalonTemplate=async()=>{
    await loadScript(CDN_XLSX_URL);
    if(!window.XLSX){toast('Excel engine unavailable — check your internet connection.','error');return;}
    const sample=['Cut & Style K1','Owned',
      'Cut & Style Salons LLP','Cut & Style','LLP','','Rohit Mehra : 60 : 07654321; Anita Mehra : 40 : 07654322',
      'New Delhi','Delhi','110001','07AABCX1234R1ZP','AABCX1234R','Manager Name','9876543210','outlet@company.com','24/07/2026','Active',
      'HDFC Bank','Account Holder Name','50100123456','HDFC0001234','Connaught Place',
      'Yes','Yes','ESIC123456','Yes','PFCODE123','Yes','ABCPK1234A','Yes','PT12345'];
    const note=['Required','Owned / COCO / FOCO / Franchise',
      'Legal/registered name of the firm','Trading/brand name shown to customers','Proprietorship / Partnership Firm / LLP / Private Limited','Only if Firm Category = Proprietorship','Name : Share% : DIN — separate multiple with a semicolon (;). DIN only for LLP/Pvt Ltd',
      'Required','','','','','','','','','Active / Inactive',
      '','','','','','Yes / No','Yes / No','','Yes / No','','Yes / No','','Yes / No',''];
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet([SALON_TEMPLATE_HEADERS,sample,[],note]);
    ws['!cols']=SALON_TEMPLATE_HEADERS.map(h=>({wch:h==='Partners / Shareholders'?40:22}));
    XLSX.utils.book_append_sheet(wb,ws,'Salons');
    XLSX.writeFile(wb,'Salon_Import_Template.xlsx');
    toast('Template downloaded','success');
  };
  const yn=(v)=>String(v||'').trim().toLowerCase()==='yes';
  // Parses the template's 'Partners / Shareholders' column: 'Name : Share% : DIN; Name2 : Share% : DIN2'
  // (DIN segment optional — Proprietorship/Partnership Act partners don't have one).
  const parseFirmMembers=(v)=>String(v||'').split(';').map(s=>s.trim()).filter(Boolean).map(part=>{
    const bits=part.split(':').map(b=>b.trim());
    return{name:bits[0]||'',sharePct:bits[1]||'',din:bits[2]||''};
  });
  const handleBulkSalonFile=async(e)=>{
    const f=e.target.files&&e.target.files[0];
    if(!f)return;
    e.target.value='';
    setBulkBusy(true);
    try{
      await loadScript(CDN_XLSX_URL);
      if(!window.XLSX)throw new Error('Excel engine unavailable — check your internet connection.');
      const buf=await f.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array',cellDates:true});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const json=XLSX.utils.sheet_to_json(ws,{defval:''});
      const failed=[];
      const toAdd=[];
      const fmtDate=(v)=>{
        if(!v)return new Date().toISOString().slice(0,10);
        if(v instanceof Date)return v.toISOString().slice(0,10);
        const m=String(v).match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
        if(m)return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
        return new Date().toISOString().slice(0,10);
      };
      json.forEach((row,idx)=>{
        const rowNum=idx+2;
        const name=String(row['Salon Name']||'').trim();
        if(!name)return; // silently skip fully blank trailing rows
        const city=String(row['City']||'').trim();
        if(!city){failed.push('Row '+rowNum+' ('+name+'): City is required');return;}
        const type=['Owned','COCO','FOCO','Franchise'].includes(row['Outlet Type'])?row['Outlet Type']:'Owned';
        if(salons.some(s=>s.name.trim().toLowerCase()===name.toLowerCase())){failed.push('Row '+rowNum+' ('+name+'): A salon with this name already exists — skipped');return;}
        toAdd.push({
          id:nextSalonId(salons.concat(toAdd)),name,type,city,state:String(row['State']||''),pin:String(row['PIN Code']||''),
          firmName:String(row['Firm Name']||''),brandName:String(row['Brand Name']||''),
          firmCategory:['Proprietorship','Partnership Firm','LLP','Private Limited'].includes(row['Firm Category'])?row['Firm Category']:'',
          proprietorName:String(row['Name of Proprietor']||''),firmMembers:parseFirmMembers(row['Partners / Shareholders']),
          gst:String(row['GST Number']||'').toUpperCase(),pan:String(row['PAN Number']||'').toUpperCase(),
          manager:String(row['Manager Name']||''),phone:String(row['Contact Phone']||''),email:String(row['Email']||''),
          est:fmtDate(row['Established Date (DD/MM/YYYY)']||row['Established Date']),
          status:row['Status']==='Inactive'?'Inactive':'Active',typeHistory:[],
          bankName:String(row['Bank Name']||''),bankAccountHolder:String(row['Account Holder Name']||''),
          bankAccountNo:String(row['Account Number']||''),bankIFSC:String(row['IFSC Code']||'').toUpperCase(),bankBranch:String(row['Branch']||''),
          gstApplicable:yn(row['GST Applicable (Yes/No)']),gstLoginId:'',gstPassword:'',
          esicApplicable:yn(row['ESIC Applicable (Yes/No)']),esicCode:String(row['ESIC Code']||''),esicLoginId:'',esicPassword:'',
          pfApplicable:yn(row['PF Applicable (Yes/No)']),pfCode:String(row['PF Establishment Code']||''),pfLoginId:'',pfPassword:'',
          tdsApplicable:yn(row['TDS Applicable (Yes/No)']),tan:String(row['TAN Number']||'').toUpperCase(),tdsLoginId:'',tdsPassword:'',
          ptApplicable:ptAppliesToState(String(row['State']||'')),ptRegNo:String(row['PT Registration Number']||''),ptLoginId:'',ptPassword:'',
        });
      });
      if(toAdd.length)setSalons(prev=>[...prev,...toAdd]);
      setBulkResult({added:toAdd.length,failed,totalRows:json.length});
      if(toAdd.length&&!failed.length)toast(toAdd.length+' salon'+(toAdd.length===1?'':'s')+' imported','success');
    }catch(err){toast(err.message||'Could not read that file — make sure it matches the template','error');}
    setBulkBusy(false);
  };
  const openAdd=()=>{setForm({...BLANK});setEditItem(null);setShowModal(true);};
  const openEdit=(s)=>{setForm({...BLANK,...s});setEditItem(s);setShowModal(true);};

  const save=()=>{
    if(!form.name.trim()){toast('Salon name is required','error');return;}
    if(!form.city.trim()){toast('City is required','error');return;}
    const bankMismatch=bankIfscMismatch(form.bankName,form.bankIFSC);
    if(bankMismatch){toast(bankMismatch,'error');return;}
    // Safety net — guarantees ptApplicable always matches the saved State even if this record
    // was created before Professional Tax auto-detection existed, or its State was never re-picked.
    const formToSave={...form,ptApplicable:ptAppliesToState(form.state)};
    if(editItem){
      // Outlet Type changed — record it (from, to, when), never overwrite past entries. This is
      // the only field on this form with a real audit trail, since it's the one that materially
      // changes how an outlet is treated (ownership/franchise structure).
      let typeHistory=formToSave.typeHistory||[];
      if(editItem.type!==formToSave.type){
        typeHistory=[...typeHistory,{from:editItem.type,to:formToSave.type,date:new Date().toISOString(),by:user?.name||'Unknown'}];
        toast('Outlet Type changed: '+editItem.type+' → '+formToSave.type+' (logged)','success');
      }
      setSalons(prev=>prev.map(s=>s.id===formToSave.id?{...formToSave,typeHistory}:s));
      if(editItem.type===formToSave.type)toast('Salon updated successfully','success');
    } else {
      setSalons(prev=>[...prev,{...formToSave,id:nextId(),typeHistory:[]}]);
      toast('Salon added successfully','success');
    }
    setShowModal(false);
  };

  const confirmDelete=(id)=>{
    const removedSalon=salons.find(s=>s.id===id);
    const removedIndex=salons.findIndex(s=>s.id===id);
    // Snapshot every localStorage key this outlet owns (same key list deleteAllSalonScopedData
    // itself walks) before wiping them, plus this outlet's own slice of the shared appointment
    // book — so Undo can write it all back exactly as it was, not just re-add the salon record
    // with none of its employees/invoices/history behind it.
    const snapshot={};
    SALON_SCOPED_KEY_BASES.forEach(base=>{const k=outletKey(base,id);snapshot[k]=cachedLocalGet(k);});
    try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.indexOf('salonos_')===0&&k.endsWith('_outlet_'+id)&&!(k in snapshot))snapshot[k]=localStorage.getItem(k);}}catch(e){}
    const apptRaw=cachedLocalGet('salonos_appointments_book');
    setSalons(prev=>prev.filter(s=>s.id!==id));
    deleteAllSalonScopedData(id);
    setShowDelete(null);
    toast(removedSalon.name+' and all its data deleted','warning',8000,()=>{
      Object.keys(snapshot).forEach(k=>{if(snapshot[k]!=null)safeLocalSet(k,snapshot[k]);});
      if(apptRaw!=null)safeLocalSet('salonos_appointments_book',apptRaw);
      setSalons(prev=>{
        const next=[...prev];
        next.splice(Math.min(removedIndex,next.length),0,removedSalon);
        return next;
      });
      toast(removedSalon.name+' restored','success');
    });
  };

  const filtered=salons.filter(s=>
    !search||s.name.toLowerCase().includes(search.toLowerCase())||
    s.city.toLowerCase().includes(search.toLowerCase())||
    s.manager.toLowerCase().includes(search.toLowerCase())
  );

  const FG=(label,children)=>React.createElement('div',{className:'form-group'},
    React.createElement('label',null,label),children
  );
  const INP=(props)=>React.createElement('input',{className:'form-control',...props});
  const SEL=(value,onChange,opts)=>React.createElement('select',{className:'form-control',value,onChange},
    opts.map(o=>React.createElement('option',{key:o},o))
  );

  return React.createElement('div',{className:'fade-in'},
    // ── First-run onboarding checklist — only shows when this browser has literally zero
    // salons registered yet (the true "just opened this for the first time" moment). Once a
    // first salon exists, this never shows again — the summary metrics/table below take over as
    // the normal working view, and per-outlet setup (employees, bank statement, incentive rules)
    // is guided by each of those screens' own existing empty states instead. ──
    salons.length===0&&React.createElement('div',{className:'card',style:{marginBottom:16,background:'rgba(47,95,224,0.06)',border:'1px solid rgba(47,95,224,0.25)'}},
      React.createElement('div',{style:{fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:2}},'👋 Welcome to SalonOS'),
      React.createElement('div',{style:{fontSize:12.5,color:'var(--text3)',marginBottom:16}},'A quick outline of the usual setup order for a new outlet — each step opens once you\'re on that outlet\'s own screen.'),
      React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:8}},
        [
          {n:1,title:'Add your first Salon',desc:'Name, city, GST details — the outlet everything else lives under.',active:true},
          {n:2,title:'Add Employees',desc:'Master Salary → Employees. Designation and Gross CTC drive Salary/Incentive Working automatically.'},
          {n:3,title:'Import a Bank Statement',desc:'Bank Statement tab — lets Fund Position, vendor payments, and reconciliation all work off real balances.'},
          {n:4,title:'Set Incentive Rules',desc:'Incentive Working → ⚙ Incentive Rules & Settings. Quick Setup covers most outlets in under a minute.'}
        ].map(step=>React.createElement('div',{key:step.n,style:{display:'flex',alignItems:'flex-start',gap:12,padding:'10px 12px',borderRadius:'var(--r)',background:step.active?'rgba(47,95,224,0.1)':'var(--bg3)',border:'1px solid '+(step.active?'rgba(47,95,224,0.3)':'var(--border)')}},
          React.createElement('div',{style:{width:22,height:22,borderRadius:'50%',background:step.active?'var(--accent)':'var(--bg4)',color:step.active?'#fff':'var(--text3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0,marginTop:1}},step.n),
          React.createElement('div',null,
            React.createElement('div',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},step.title),
            React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:1}},step.desc)
          )
        ))
      ),
      React.createElement('button',{className:'btn btn-primary btn-sm',style:{marginTop:14},onClick:openAdd},'+ Add Your First Salon')
    ),

    // Header
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'Master Sheet'),
        React.createElement('div',{className:'page-sub'},'All registered salon outlets')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:downloadSalonTemplate},'⬇ Import Template'),
        React.createElement('input',{ref:bulkFileRef,type:'file',accept:'.xlsx,.xls',style:{display:'none'},onChange:handleBulkSalonFile}),
        React.createElement('button',{className:'btn btn-ghost btn-sm',disabled:bulkBusy,onClick:()=>bulkFileRef.current&&bulkFileRef.current.click()},bulkBusy?'Importing…':'📥 Bulk Import Salons'),
        React.createElement('button',{className:'btn btn-primary',onClick:openAdd},'+ Add Salon')
      )
    ),

    // Summary metrics
    React.createElement('div',{className:'grid4',style:{marginBottom:16}},
      [{l:'Total Outlets',v:salons.length,c:'blue'},{l:'Active',v:salons.filter(s=>s.status==='Active').length,c:'green'},
       {l:'Owned',v:salons.filter(s=>s.type==='Owned').length,c:'amber'},{l:'Franchise',v:salons.filter(s=>s.type==='Franchise').length,c:'purple'}
      ].map(m=>React.createElement('div',{key:m.l,className:'metric-card '+m.c},
        React.createElement('div',{className:'metric-label'},m.l),
        React.createElement('div',{className:'metric-value'},m.v)
      ))
    ),

    // Search
    React.createElement('div',{style:{display:'flex',gap:10,marginBottom:14,alignItems:'center'}},
      React.createElement('div',{className:'search-bar',style:{flex:1}},
        React.createElement('span',{style:{color:'var(--text3)'}},React.createElement(IconSearch,{size:13})),
        React.createElement('input',{placeholder:'Search by name, city, manager…',value:search,onChange:e=>setSearch(e.target.value)})
      ),
      React.createElement('span',{style:{fontSize:12,color:'var(--text3)'}},filtered.length+' of '+salons.length+' outlets')
    ),

    // Table
    React.createElement('div',{className:'card'},
      filtered.length===0
        ?React.createElement('div',{className:'empty-state'},
          React.createElement('div',{className:'empty-icon'},'🏪'),
          React.createElement('div',{className:'empty-title'},'No salons found'),
          React.createElement('div',{className:'empty-sub'},search?'Try a different search term.':'Click + Add Salon to register your first outlet.')
        )
        :React.createElement('div',{className:'table-wrap'},
          React.createElement('table',null,
            React.createElement('thead',null,React.createElement('tr',null,
              ['Salon Name','City / State','Type','GST Number','PAN','Manager','Phone','Status','Actions'].map(h=>React.createElement('th',{key:h},h))
            )),
            React.createElement('tbody',null,filtered.map(s=>
              React.createElement('tr',{key:s.id},
                React.createElement('td',null,
                  React.createElement('div',{style:{fontWeight:600,color:'var(--text)'}},s.name),
                  React.createElement('div',{style:{fontSize:10,color:'var(--text3)',marginTop:2}},'Est. '+s.est)
                ),
                React.createElement('td',null,
                  React.createElement('div',{style:{fontSize:12}},s.city),
                  React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},s.state+(s.pin?' — '+s.pin:''))
                ),
                React.createElement('td',null,
                  React.createElement('span',{className:'badge '+({Owned:'badge-blue',COCO:'badge-teal',FOCO:'badge-amber',Franchise:'badge-purple'}[s.type]||'badge-gray')},s.type),
                  s.typeHistory&&s.typeHistory.length>0&&React.createElement('span',{style:{marginLeft:5,fontSize:10,color:'var(--text3)'},title:s.typeHistory.length+' change'+(s.typeHistory.length===1?'':'s')+' on record'},'🕘')
                ),
                React.createElement('td',{style:{fontFamily:'monospace',fontSize:11,color:'var(--text2)'}},s.gst||'—'),
                React.createElement('td',{style:{fontFamily:'monospace',fontSize:11,color:'var(--text2)'}},s.pan||'—'),
                React.createElement('td',null,
                  React.createElement('div',{style:{fontWeight:500,fontSize:12}},s.manager),
                  s.email&&React.createElement('div',{style:{fontSize:10,color:'var(--text3)'}},s.email)
                ),
                React.createElement('td',{style:{fontFamily:'monospace',fontSize:11}},s.phone||'—'),
                React.createElement('td',null,React.createElement('span',{className:'badge '+(s.status==='Active'?'badge-green':'badge-gray')},s.status)),
                React.createElement('td',null,
                  React.createElement('div',{style:{display:'flex',gap:4,flexWrap:'nowrap'}},
                    React.createElement('button',{className:'btn btn-primary btn-sm',onClick:()=>onSelect(s)},'Open'),
                    React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>openEdit(s)},'✏ Edit'),
                    React.createElement('button',{className:'btn btn-ghost btn-sm',title:'Lock/unlock past months for this outlet',onClick:()=>setShowLockMonths(s)},'🔒 Months'),
                    React.createElement('button',{'aria-label':'Delete',
                      className:'btn btn-sm',
                      style:{background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.3)',color:'var(--red)',padding:'4px 8px',borderRadius:'var(--r)',cursor:'pointer',fontSize:11,fontWeight:500},
                      onClick:()=>setShowDelete(s)
                    },React.createElement(IconTrash,{size:14}))
                  )
                )
              )
            ))
          )
        )
    ),

    // ── LOCK MONTHS PANEL ──
    showLockMonths&&React.createElement(SalonMonthLockPanel,{salon:showLockMonths,onClose:()=>setShowLockMonths(null)}),

    // ── ADD / EDIT MODAL ──
    showModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowModal(false)},
      React.createElement('div',{className:'modal',style:{width:620},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},editItem?'Edit Salon — '+editItem.name:'Add New Salon'),

        React.createElement('div',{className:'form-row cols2'},
          FG('Salon Name *',INP({value:form.name,onChange:fc('name'),placeholder:'e.g. Luxe Studio — CP'})),
          FG('Outlet Type',SEL(form.type,fc('type'),['Owned','COCO','FOCO','Franchise']))
        ),
        (form.typeHistory&&form.typeHistory.length>0)&&React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14}},
          React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}},'Outlet Type change history'),
          form.typeHistory.slice().reverse().map((h,i)=>React.createElement('div',{key:i,style:{fontSize:12,color:'var(--text2)',padding:'3px 0'}},
            React.createElement('span',{style:{color:'var(--text3)'}},new Date(h.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})+' — '),
            h.from,' → ',React.createElement('b',{style:{color:'var(--text)'}},h.to),
            h.by&&React.createElement('span',{style:{color:'var(--text3)'}},' · by '+h.by)
          ))
        ),

        // ── FIRM DETAILS ──
        React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'18px 0 10px',paddingTop:14,borderTop:'1px solid var(--border)'}},'Firm Details'),
        React.createElement('div',{className:'form-row cols2'},
          FG('Firm Name',INP({value:form.firmName,onChange:fc('firmName'),placeholder:'Legal/registered name of the firm'})),
          FG('Brand Name',INP({value:form.brandName,onChange:fc('brandName'),placeholder:'Trading/brand name shown to customers'}))
        ),
        React.createElement('div',{className:'form-group',style:{marginBottom:14}},
          React.createElement('label',null,'Brand Logo'),
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:12}},
            React.createElement('div',{style:{width:64,height:64,borderRadius:'var(--r)',border:'1px dashed var(--border)',background:'var(--bg3)',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0}},
              form.logo
                ?React.createElement('img',{src:form.logo,alt:'Salon logo',style:{width:'100%',height:'100%',objectFit:'contain'}})
                :React.createElement('span',{style:{fontSize:20,color:'var(--text3)'}},'🏷')
            ),
            React.createElement('input',{ref:logoFileRef,type:'file',accept:'image/png,image/jpeg,image/webp',style:{display:'none'},onChange:handleLogoFile}),
            React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',disabled:logoBusy,onClick:()=>logoFileRef.current&&logoFileRef.current.click()},logoBusy?'Uploading…':(form.logo?'Change Logo':'+ Upload Logo')),
            form.logo&&React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>{if(confirm('Remove the brand logo?'))removeLogo();}},'Remove'),
            React.createElement('span',{style:{fontSize:10.5,color:'var(--text3)'}},'PNG/JPG/WebP, used on invoices & printed reports')
          )
        ),
        React.createElement('div',{className:'form-row cols2'},
          FG('Firm Category',React.createElement('select',{className:'form-control',value:form.firmCategory,onChange:fc('firmCategory')},
            [React.createElement('option',{key:'',value:''},'— Select —'),...['Proprietorship','Partnership Firm','LLP','Private Limited'].map(c=>React.createElement('option',{key:c,value:c},c))]
          )),
          form.firmCategory==='Proprietorship'&&FG('Name of Proprietor',INP({value:form.proprietorName,onChange:fc('proprietorName'),placeholder:'Full name'}))
        ),
        ['Partnership Firm','LLP','Private Limited'].includes(form.firmCategory)&&React.createElement('div',{style:{marginBottom:14}},
          React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}},
            React.createElement('div',{style:{fontSize:11,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em'}},
              (form.firmCategory==='Private Limited'?'Shareholders':'Partners')+' & Their Share'
            ),
            React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:addFirmMember},'+ Add '+FIRM_MEMBER_LABEL)
          ),
          (form.firmMembers||[]).length===0&&React.createElement('div',{style:{fontSize:12,color:'var(--text3)',padding:'8px 0'}},'No '+FIRM_MEMBER_LABEL.toLowerCase()+'s added yet.'),
          (form.firmMembers||[]).map((m,idx)=>React.createElement('div',{key:idx,style:{display:'flex',gap:8,alignItems:'center',marginBottom:8}},
            React.createElement('input',{className:'form-control',style:{flex:2},placeholder:'Name of '+FIRM_MEMBER_LABEL.toLowerCase(),value:m.name,onChange:e=>updateFirmMember(idx,'name',e.target.value)}),
            React.createElement('input',{className:'form-control',type:'number',min:0,max:100,style:{flex:1},placeholder:'Share %',value:m.sharePct,onChange:e=>updateFirmMember(idx,'sharePct',e.target.value)}),
            firmMemberHasDin&&React.createElement('input',{className:'form-control',style:{flex:1},placeholder:'DIN',value:m.din,onChange:e=>updateFirmMember(idx,'din',e.target.value)}),
            React.createElement('button',{type:'button','aria-label':'Remove',className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>removeFirmMember(idx)},'✕')
          )),
          (form.firmMembers||[]).length>0&&React.createElement('div',{style:{fontSize:11.5,color:firmMemberShareTotal===100?'var(--green)':'var(--orange)',marginTop:4}},
            'Total share: '+firmMemberShareTotal+'%'+(firmMemberShareTotal!==100?' — should add up to 100%':' ✓')
          )
        ),

        React.createElement('div',{className:'form-row cols3'},
          FG('City *',INP({value:form.city,onChange:fc('city'),placeholder:'City'})),
          FG('State',React.createElement('select',{className:'form-control',value:form.state,onChange:onStateChange},
            [React.createElement('option',{key:'',value:''},'Select State'),...INDIA_STATES_UTS.map(s=>React.createElement('option',{key:s,value:s},s))]
          )),
          FG('PIN Code',INP({value:form.pin,onChange:fc('pin'),placeholder:'110001'}))
        ),
        React.createElement('div',{className:'form-row cols2'},
          FG('GST Number',React.createElement(React.Fragment,null,
            React.createElement('div',{style:{display:'flex',gap:6}},
              INP({value:form.gst,onChange:fc('gst'),placeholder:'07AABCX1234R1ZP',style:{textTransform:'uppercase',flex:1}}),
              form.gst&&isValidGSTINFormat(form.gst)&&React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',style:{flexShrink:0,whiteSpace:'nowrap'},
                title:'Copies the GSTIN and opens the government\u2019s official Search Taxpayer page to confirm registered name & live status',
                onClick:()=>openGstPortalLookup(form.gst,toast)},'Verify on GST Portal ↗')
            ),
            (()=>{
              const g=String(form.gst||'').trim().toUpperCase();
              if(!g)return null;
              if(!isValidGSTINFormat(g))return fieldWarning('Doesn\u2019t look like a valid GSTIN \u2014 check the number and checksum digit.');
              const panMismatch=form.pan&&panFromGstin(g)&&panFromGstin(g)!==String(form.pan).trim().toUpperCase();
              const gstStateName=gstStateNameFor(g);
              const stateMismatch=form.state&&gstStateName&&gstStateName!==form.state;
              if(panMismatch)return fieldWarning('This GSTIN\u2019s embedded PAN ('+panFromGstin(g)+') doesn\u2019t match the PAN Number field below.');
              if(stateMismatch)return fieldWarning('This GSTIN\u2019s jurisdiction ('+gstStateName+') doesn\u2019t match the State selected above.');
              return fieldOk('Valid GSTIN \u2014 format, checksum'+(form.pan?', and PAN':'')+(form.state?' and State':'')+' all match. Use \u2018Verify on GST Portal\u2019 to confirm live registration status.');
            })()
          )),
          FG('PAN Number',React.createElement(React.Fragment,null,
            INP({value:form.pan,onChange:fc('pan'),placeholder:'AABCX1234R',style:{textTransform:'uppercase'}}),
            form.pan&&!isValidPANFormat(form.pan)&&fieldWarning('Doesn\u2019t look like a valid PAN (e.g. AABCX1234R).')
          ))
        ),
        React.createElement('div',{className:'form-row cols2'},
          FG('Manager Name',INP({value:form.manager,onChange:fc('manager'),placeholder:'Manager full name'})),
          FG('Contact Phone',React.createElement(React.Fragment,null,
            INP({value:form.phone,onChange:fc('phone'),placeholder:'98xxxxxxxx'}),
            form.phone&&!isValidIndianMobile(form.phone)&&fieldWarning('Doesn\u2019t look like a valid 10-digit Indian mobile number.')
          ))
        ),
        React.createElement('div',{className:'form-row cols3'},
          FG('Email',React.createElement(React.Fragment,null,
            INP({value:form.email,onChange:fc('email'),placeholder:'outlet@company.com',type:'email'}),
            form.email&&!isValidEmailFormat(form.email)&&fieldWarning('Doesn\u2019t look like a valid email address.')
          )),
          FG('Established Date',INP({type:'date',value:form.est,onChange:fc('est')})),
          FG('Status',SEL(form.status,fc('status'),['Active','Inactive']))
        ),

        React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'18px 0 10px',paddingTop:14,borderTop:'1px solid var(--border)'}},'Bank Details'),
        React.createElement('div',{className:'form-row cols2'},
          FG('Bank Name',React.createElement('select',{className:'form-control',value:form.bankName,onChange:fc('bankName')},
            [React.createElement('option',{key:'',value:''},'— Select Bank —'),
             ...INDIAN_BANKS.map(b=>React.createElement('option',{key:b,value:b},b)),
             (form.bankName&&!INDIAN_BANKS.includes(form.bankName))?React.createElement('option',{key:form.bankName,value:form.bankName},form.bankName):null
            ].filter(Boolean)
          )),
          FG('Account Holder Name',INP({value:form.bankAccountHolder,onChange:fc('bankAccountHolder'),placeholder:'As per bank records'}))
        ),
        React.createElement('div',{className:'form-row cols3'},
          FG('Account Number',INP({value:form.bankAccountNo,onChange:fc('bankAccountNo'),placeholder:'Account number'})),
          React.createElement('div',{className:'form-group'},
            React.createElement('label',null,'IFSC Code'),
            INP({value:form.bankIFSC,onChange:e=>{fc('bankIFSC')(e);setIfscLookupStatus('');},onBlur:doIfscLookup,placeholder:'HDFC0001234',style:{textTransform:'uppercase'}}),
            React.createElement('div',{style:{fontSize:10,marginTop:3,color:ifscLookupStatus==='found'?'var(--green)':(ifscLookupStatus==='notfound'||(form.bankIFSC&&!isValidIfscFormat(form.bankIFSC)))?'var(--orange)':'var(--text3)'}},
              ifscLookupStatus==='loading'?'Looking up branch…':
              ifscLookupStatus==='found'?'✓ Bank & Branch auto-filled from IFSC':
              ifscLookupStatus==='notfound'?'Couldn\'t find this IFSC — enter Branch manually':
              (form.bankIFSC&&!isValidIfscFormat(form.bankIFSC))?'⚠ Doesn\'t look like a valid IFSC (e.g. HDFC0001234) — check for typos.':
              'Enter the 11-character IFSC (chequebook/passbook) — Branch fills in automatically'
            )
          ),
          FG('Branch',INP({value:form.bankBranch,onChange:fc('bankBranch'),placeholder:'Auto-filled from IFSC, or enter manually'}))
        ),
        (()=>{const mismatch=bankIfscMismatch(form.bankName,form.bankIFSC);return mismatch&&React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.35)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14,fontSize:12,color:'var(--red)'}},
          '⚠ ',mismatch);})(),

        React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'18px 0 4px',paddingTop:14,borderTop:'1px solid var(--border)'}},'Statutory Compliance'),
        React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:10,lineHeight:1.5}},'Portal login details are stored in this browser like everything else in this app — there\'s no backend here. These are real government portal credentials, more sensitive than an ordinary password, so treat this the same as you would any other place you\'d store them, and don\'t rely on this as your only record.'),
        [
          {key:'gst',label:'GST',regLabel:null,regKey:null},
          {key:'esic',label:'ESIC',regLabel:'ESIC Code',regKey:'esicCode'},
          {key:'pf',label:'PF (EPFO)',regLabel:'PF Establishment Code',regKey:'pfCode'},
          {key:'tds',label:'TDS',regLabel:'TAN Number',regKey:'tan'},
          {key:'pt',label:'Professional Tax',regLabel:'PT Registration Number',regKey:'ptRegNo'},
        ].map(c=>React.createElement('div',{key:c.key,style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:8}},
          c.key==='pt'
            ?React.createElement(React.Fragment,null,
                React.createElement('label',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:form.ptApplicable?10:0}},
                  React.createElement('input',{type:'checkbox',checked:!!form.ptApplicable,disabled:true,style:{cursor:'not-allowed'}}),
                  React.createElement('span',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},'Professional Tax Applicable'),
                  React.createElement('span',{style:{fontSize:10.5,color:'var(--text3)',marginLeft:'auto'}},
                    form.state?(form.ptApplicable?'Auto-applied — '+form.state+' levies PT':form.state+' does not levy PT'):'Pick a State above to auto-detect')
                )
              )
            :React.createElement('label',{style:{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginBottom:form[c.key+'Applicable']?10:0}},
                React.createElement('input',{type:'checkbox',checked:!!form[c.key+'Applicable'],onChange:fcCheck(c.key+'Applicable')}),
                React.createElement('span',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},c.label+' Applicable')
              ),
          form[c.key+'Applicable']&&React.createElement('div',{className:'form-row '+(c.regKey?'cols3':'cols2'),style:{marginBottom:10}},
            c.regKey&&FG(c.regLabel,INP({value:form[c.regKey],onChange:fc(c.regKey),placeholder:c.regLabel})),
            FG('Portal Login ID',INP({value:form[c.key+'LoginId'],onChange:fc(c.key+'LoginId'),placeholder:'Login ID / username'})),
            FG('Portal Password',INP({type:'password',value:form[c.key+'Password'],onChange:fc(c.key+'Password'),placeholder:'Password'}))
          ),
          form[c.key+'Applicable']&&React.createElement('div',{className:'form-row cols2',style:{marginBottom:0}},
            FG('Effective Date of Applicability (W.e.f.)',INP({type:'date',value:form[c.key+'Wef'],onChange:fc(c.key+'Wef')})),
            React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',alignSelf:'center',paddingTop:18}},
              form[c.key+'Wef']
                ?c.label+' has applied to this outlet since '+fmtDMY(form[c.key+'Wef'])+'.'
                :'Optional \u2014 the date '+c.label+' registration/liability started applying, for your own record.')
          )
        )),

        React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'18px 0 4px',paddingTop:14,borderTop:'1px solid var(--border)'}},'Payment Due Dates'),
        React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:10,lineHeight:1.5}},'Day of the following month Salary and Incentive are due by — same convention as PF/ESIC (e.g. July\'s salary due by the 7th of August). Drives the auto-generated Salary Disbursement / Incentive Payment items on the Due Date Tracker, so they don\'t have to be added by hand every month.'),
        React.createElement('div',{className:'form-row cols2',style:{marginBottom:14}},
          FG('Salary Payment Due Day',INP({type:'number',min:1,max:28,value:form.salaryDueDay,onChange:fc('salaryDueDay'),placeholder:'e.g. 7'})),
          FG('Incentive Payment Due Day',INP({type:'number',min:1,max:28,value:form.incentiveDueDay,onChange:fc('incentiveDueDay'),placeholder:'e.g. 10'}))
        ),

        React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'18px 0 4px',paddingTop:14,borderTop:'1px solid var(--border)'}},'Daily Sales & Exp Edit Window'),
        React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:10,lineHeight:1.5}},'Restricts backdated editing on Daily Sales & Exp for the CURRENT month to just the last N days from today — a day older than that becomes read-only even though the month itself isn\'t fully locked yet. Doesn\'t affect past months (those are governed entirely by Month Lock), and has no effect once the current month gets locked either, since a locked month is already fully read-only.'),
        React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14}},
          React.createElement('label',{style:{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginBottom:form.dseEditWindowEnabled?10:0}},
            React.createElement('input',{type:'checkbox',checked:!!form.dseEditWindowEnabled,onChange:fcCheck('dseEditWindowEnabled')}),
            React.createElement('span',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},'Limit Daily Sales & Exp editing to the last N days (current month)')
          ),
          form.dseEditWindowEnabled&&React.createElement('div',{className:'form-row',style:{marginBottom:0}},
            FG('Editable Window (days)',INP({type:'number',min:1,max:31,value:form.dseEditWindowDays,onChange:fc('dseEditWindowDays'),placeholder:'e.g. 3',style:{maxWidth:140}}))
          )
        ),

        React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'18px 0 4px',paddingTop:14,borderTop:'1px solid var(--border)'}},'GST Input Tax Credit'),
        React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginBottom:10,lineHeight:1.5}},'Separate from GST Applicable above — that\'s whether this outlet charges GST on sales; this is whether it\'s blocked from claiming credit for GST paid on purchases (\"Blocked Credit\" under Section 17(5) of the CGST Act). Salon/beauty services commonly are, so this defaults to Yes.'),
        React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14}},
          React.createElement('label',{style:{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginBottom:10}},
            React.createElement('input',{type:'checkbox',checked:!!form.gstInputBlocked,onChange:fcCheck('gstInputBlocked')}),
            React.createElement('span',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},'GST Input Credit Blocked for this Outlet')
          ),
          React.createElement('div',{className:'form-row cols2'},
            FG('W.e.f. (with effect from)',INP({type:'date',value:form.gstInputWef,onChange:fc('gstInputWef')})),
            React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',alignSelf:'center',paddingTop:18}},
              form.gstInputWef
                ?(form.gstInputBlocked?'GST paid on purchases from this date onward is treated as a real cost (capitalized into Fixed Assets / expensed), not a recoverable credit.':'ITC treated as claimable from this date onward.')
                :'Set a date if this status started applying from a specific point — leave blank if it\'s always applied.')
          )
        ),

        React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'18px 0 4px',paddingTop:14,borderTop:'1px solid var(--border)'}},'Vendor Invoices'),
        React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14,display:'flex',flexDirection:'column',gap:10}},
          React.createElement('label',{style:{display:'flex',alignItems:'flex-start',gap:8,cursor:'pointer'}},
            React.createElement('input',{type:'checkbox',checked:!!form.piAsExpense,onChange:fcCheck('piAsExpense'),style:{marginTop:3}}),
            React.createElement('span',null,
              React.createElement('span',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},'Treat Performa Invoice (PI) as an expense'),
              React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',lineHeight:1.5,marginTop:2}},'A PI is booked as an expense in the month of its date. When the actual Tax Invoice / Invoice is later entered against that PI, only the difference (actual − PI, short or excess) is booked, in the month of the actual invoice. Off: PIs are not expenses; only actual invoices are.'))),
          React.createElement('label',{style:{display:'flex',alignItems:'flex-start',gap:8,cursor:'pointer'}},
            React.createElement('input',{type:'checkbox',checked:!!form.attachmentRequired,onChange:fcCheck('attachmentRequired'),style:{marginTop:3}}),
            React.createElement('span',null,
              React.createElement('span',{style:{fontSize:12.5,fontWeight:600,color:'var(--text)'}},'Attachment compulsory for invoices'),
              React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',lineHeight:1.5,marginTop:2}},'A Tax Invoice, Invoice or Performa Invoice can’t be saved without attaching the document (in Vendor Sheet and in Daily Sales & Exp).')))
        ),

        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowModal(false)},'Cancel'),
          editItem&&React.createElement('button',{
            className:'btn btn-sm',
            style:{background:'rgba(255,159,67,0.1)',border:'1px solid rgba(255,159,67,0.3)',color:'var(--orange)',padding:'5px 12px',borderRadius:'var(--r)',cursor:'pointer',fontSize:12},
            onClick:()=>{setShowModal(false);setShowReset(editItem);}
          },'🧹 Reset Outlet Data'),
          editItem&&React.createElement('button',{
            className:'btn btn-sm',
            style:{background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.3)',color:'var(--red)',padding:'5px 12px',borderRadius:'var(--r)',cursor:'pointer',fontSize:12},
            onClick:()=>{setShowModal(false);setShowDelete(editItem);}
          },'🗑 Delete'),
          React.createElement('button',{className:'btn btn-primary',onClick:save},editItem?'💾 Save Changes':'✓ Add Salon')
        )
      )
    ),

    // ── DELETE CONFIRM MODAL ──
    showDelete&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowDelete(null)},
      React.createElement('div',{className:'modal',style:{width:440},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title',style:{color:'var(--red)'}},'Delete Salon'),
        React.createElement('div',{style:{background:'rgba(255,107,107,0.08)',border:'1px solid rgba(255,107,107,0.2)',borderRadius:'var(--r)',padding:14,marginBottom:16}},
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:12,marginBottom:10}},
            React.createElement('div',{style:{width:40,height:40,borderRadius:'50%',background:'rgba(255,107,107,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}},'🏪'),
            React.createElement('div',null,
              React.createElement('div',{style:{fontWeight:600,color:'var(--text)',fontSize:14}},showDelete.name),
              React.createElement('div',{style:{fontSize:12,color:'var(--text3)'}},showDelete.city+', '+showDelete.state+' · '+showDelete.type)
            )
          ),
          React.createElement('div',{style:{fontSize:13,color:'var(--text2)',lineHeight:1.7}},
            'Are you sure you want to permanently delete this salon? ',
            React.createElement('strong',{style:{color:'var(--red)'}},'All associated data for this outlet will be removed.'),
            ' You\'ll get a few seconds to Undo right after, but once that toast disappears this can\'t be recovered — take a backup first if you\'re not certain.'
          )
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowDelete(null)},'Cancel — Keep Salon'),
          React.createElement('button',{className:'btn btn-danger',onClick:()=>confirmDelete(showDelete.id)},'Yes, Delete Permanently')
        )
      )
    ),

    showReset&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowReset(null)},
      React.createElement('div',{className:'modal',style:{width:460},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Reset Outlet Data'),
        React.createElement('div',{style:{fontSize:13,color:'var(--text2)',marginBottom:16,lineHeight:1.7}},
          'This clears every employee, vendor, invoice, bank statement row, recurring expense, and every other real record stored for ',
          React.createElement('b',{style:{color:'var(--text)'}},showReset.name),
          ' — the salon itself stays, only its data is wiped, back to a genuinely blank outlet. ',
          React.createElement('strong',{style:{color:'var(--orange)'}},'This cannot be undone.'),
          ' Use this if this outlet ended up with leftover data from a deleted salon reusing the same id — a bug that\'s now fixed, but existing salons affected by it need this one-time clean-up.'
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowReset(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-danger',onClick:()=>{deleteAllSalonScopedData(showReset.id);toast('All data for '+showReset.name+' has been cleared','warning');setShowReset(null);}},'Yes, Wipe This Outlet\'s Data')
        )
      )
    ),

    bulkResult&&React.createElement('div',{className:'modal-overlay',onClick:()=>setBulkResult(null)},
      React.createElement('div',{className:'modal',style:{width:520,maxHeight:'80vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Bulk Import Results'),
        React.createElement('div',{style:{display:'flex',gap:10,marginBottom:16}},
          React.createElement('div',{className:'metric-card green',style:{flex:1}},React.createElement('div',{className:'metric-label'},'Imported'),React.createElement('div',{className:'metric-value'},bulkResult.added)),
          React.createElement('div',{className:'metric-card '+(bulkResult.failed.length?'red':'blue'),style:{flex:1}},React.createElement('div',{className:'metric-label'},'Skipped'),React.createElement('div',{className:'metric-value'},bulkResult.failed.length))
        ),
        bulkResult.added>0&&React.createElement('div',{style:{fontSize:12.5,color:'var(--green)',marginBottom:14}},'✓ '+bulkResult.added+' salon'+(bulkResult.added===1?'':'s')+' added — open Edit on any of them to set up portal login IDs/passwords, which aren\'t part of the bulk template.'),
        bulkResult.failed.length>0&&React.createElement('div',{style:{marginBottom:8}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}},'Rows skipped — fix and re-import just these rows'),
          React.createElement('div',{style:{maxHeight:220,overflowY:'auto'}},
            bulkResult.failed.map((msg,i)=>React.createElement('div',{key:i,style:{fontSize:12,color:'var(--text2)',padding:'6px 10px',background:'rgba(255,107,107,0.08)',borderRadius:6,marginBottom:4}},msg))
          )
        ),
        bulkResult.added===0&&bulkResult.failed.length===0&&React.createElement('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No rows found in that file — make sure Salon Name and City are filled in, and the sheet\'s headers match the template.'),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-primary',onClick:()=>setBulkResult(null)},'Close')
        )
      )
    )
  );
}

// ── Cloud Backups (Super Admin) — Supabase keeps a full snapshot of every outlet's data every
// night at 2:00 AM (30 days kept) plus any taken here (90 days). Restoring first saves a
// "before restore" snapshot, so a restore can itself be undone. ──
function CloudBackupsCard(){
  const {success,error:toastError}=useToast();
  const [rows,setRows]=useState(null);
  const [busy,setBusy]=useState(false);
  const [restoreFor,setRestoreFor]=useState(null);
  const [restoreOutlet,setRestoreOutlet]=useState('all');
  const [confirmText,setConfirmText]=useState('');
  const salonsList=loadSalonsFromStorage();
  const KIND={auto:'Nightly',manual:'Manual','pre-restore':'Before restore',archive:'Archive of old app data (kept permanently, not restorable here)'};
  const load=useCallback(async()=>{
    try{
      const supa=await getSupabaseClient();
      const{data,error}=await supa.from('kv_backups').select('id,taken_at,kind,rows_count').order('taken_at',{ascending:false}).limit(60);
      if(error)throw error;
      setRows(data||[]);
    }catch(e){setRows([]);toastError('Could not load cloud backups: '+(e.message||'network error'));}
  },[]);
  useEffect(()=>{load();},[load]);
  const backupNow=async()=>{
    setBusy(true);
    try{
      const supa=await getSupabaseClient();
      const{error}=await supa.rpc('salonos_take_backup',{p_kind:'manual'});
      if(error)throw error;
      success('Cloud backup taken');await load();
    }catch(e){toastError('Backup failed: '+(e.message||'network error'));}
    setBusy(false);
  };
  const doRestore=async()=>{
    setBusy(true);
    try{
      const supa=await getSupabaseClient();
      const{data,error}=await supa.rpc('salonos_restore_backup',{p_backup_id:restoreFor.id,p_outlet_id:restoreOutlet==='all'?null:Number(restoreOutlet)});
      if(error)throw error;
      setRestoreFor(null);
      success('Restored '+data+' record'+(data===1?'':'s')+'. Everyone\'s screens will update in a moment.');
      notifyCloudDataChanged([]);
      await load();
    }catch(e){toastError('Restore failed: '+(e.message||'network error'));}
    setBusy(false);
  };
  const fmt=(ts)=>new Date(ts).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'});
  return React.createElement('div',{className:'card',style:{marginBottom:16}},
    React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap',marginBottom:8}},
      React.createElement('div',{className:'card-title',style:{marginBottom:0}},'☁️ Cloud Backups'),
      React.createElement('button',{className:'btn btn-primary btn-sm'+(busy?' btn-loading':''),disabled:busy,onClick:backupNow},'Back up now')
    ),
    React.createElement('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:12,lineHeight:1.6}},
      'Every outlet\'s data is backed up automatically every night at 2:00 AM and kept for 30 days (manual backups: 90 days). Restoring saves a "Before restore" backup first, so any restore can be undone.'),
    rows===null?React.createElement('div',{style:{fontSize:12,color:'var(--text3)'}},'Loading…')
    :rows.length===0?React.createElement('div',{style:{fontSize:12,color:'var(--text3)'}},'No backups yet — the first nightly backup runs at 2:00 AM.')
    :React.createElement('div',{style:{maxHeight:300,overflowY:'auto',border:'1px solid var(--border)',borderRadius:'var(--r)'}},
      rows.map(r=>React.createElement('div',{key:r.id,style:{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderBottom:'1px solid var(--border)',fontSize:12.5}},
        React.createElement('div',{style:{flex:1,minWidth:0}},
          React.createElement('div',{style:{color:'var(--text)'}},fmt(r.taken_at)),
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},(KIND[r.kind]||r.kind)+' · '+r.rows_count+' records')),
        r.kind==='archive'?null:React.createElement('button',{className:'btn btn-ghost btn-sm',disabled:busy,onClick:()=>{setRestoreFor(r);setRestoreOutlet('all');setConfirmText('');}},'Restore…')))),
    restoreFor&&React.createElement('div',{className:'modal-overlay',onClick:()=>!busy&&setRestoreFor(null)},
      React.createElement('div',{className:'modal',style:{width:460},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Restore backup of '+fmt(restoreFor.taken_at)),
        React.createElement('div',{style:{fontSize:13,color:'var(--text2)',marginBottom:12,lineHeight:1.6}},
          'This replaces the current data with this backup for everyone. Anything entered after this backup (in what you restore) will be removed. A "Before restore" backup is saved first, so you can undo this.'),
        React.createElement('div',{className:'form-group',style:{marginBottom:12}},
          React.createElement('label',null,'What to restore'),
          React.createElement('select',{className:'form-control',value:restoreOutlet,onChange:e=>setRestoreOutlet(e.target.value)},
            React.createElement('option',{value:'all'},'Everything (all outlets + settings)'),
            salonsList.map(s=>React.createElement('option',{key:s.id,value:String(s.id)},'Only '+s.name)))),
        React.createElement('div',{className:'form-group'},
          React.createElement('label',null,'Type RESTORE to confirm'),
          React.createElement('input',{className:'form-control',value:confirmText,onChange:e=>setConfirmText(e.target.value),placeholder:'RESTORE'})),
        React.createElement('div',{className:'modal-actions',style:{marginTop:16}},
          React.createElement('button',{className:'btn btn-ghost',disabled:busy,onClick:()=>setRestoreFor(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-danger'+(busy?' btn-loading':''),disabled:busy||confirmText.trim().toUpperCase()!=='RESTORE',onClick:doRestore},'Restore')
        )
      )
    )
  );
}
// Turns a storage key like "salonos_master_employees_outlet_5" into "Master Employees · Mysha…".
function describeDataKey(key,salons){
  const m=/_outlet_(\d+)$/.exec(key||'');
  const base=String(key||'').replace(/^salonos_/,'').replace(/_outlet_\d+$/,'').replace(/_/g,' ');
  const label=base.replace(/\b\w/g,c=>c.toUpperCase());
  if(!m)return{sheet:label,outlet:'All outlets'};
  const s=(salons||[]).find(x=>String(x.id)===m[1]);
  return{sheet:label,outlet:s?s.name:'Outlet #'+m[1]+' (deleted)'};
}
// ── Change history (Super Admin) — recorded by the database itself on every save (a trigger on
// kv_store), so it can't be edited from any browser. Saves by the same person to the same sheet
// within 10 minutes are grouped into one entry that keeps the version from BEFORE that session,
// which "Restore previous version" puts back. Kept 90 days. ──
function ChangeHistoryCard(){
  const {success,error:toastError}=useToast();
  const salonsList=loadSalonsFromStorage();
  const [rows,setRows]=useState(null);
  const [outlet,setOutlet]=useState('all');
  const [busy,setBusy]=useState(false);
  const [confirmRow,setConfirmRow]=useState(null);
  const load=useCallback(async()=>{
    try{
      const supa=await getSupabaseClient();
      let q=supa.from('kv_audit').select('id,at,key,changed_by_email,new_len,edits').order('at',{ascending:false}).limit(150);
      if(outlet!=='all')q=q.like('key','%\\_outlet\\_'+outlet);
      const{data,error}=await q;
      if(error)throw error;
      setRows(data||[]);
    }catch(e){setRows([]);toastError('Could not load change history: '+(e.message||'network error'));}
  },[outlet]);
  useEffect(()=>{load();},[load]);
  const restore=async()=>{
    setBusy(true);
    try{
      const supa=await getSupabaseClient();
      const{error}=await supa.rpc('salonos_restore_version',{p_audit_id:confirmRow.id});
      if(error)throw error;
      setConfirmRow(null);success('Previous version restored — everyone\'s screens will update in a moment.');
      notifyCloudDataChanged([]);await load();
    }catch(e){toastError('Restore failed: '+(e.message||'network error'));}
    setBusy(false);
  };
  const fmt=(ts)=>new Date(ts).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
  return React.createElement('div',{className:'card',style:{marginBottom:16}},
    React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap',marginBottom:8}},
      React.createElement('div',{className:'card-title',style:{marginBottom:0}},'📜 Change history'),
      React.createElement('select',{className:'form-control',style:{width:'auto',fontSize:12,padding:'4px 8px'},value:outlet,onChange:e=>setOutlet(e.target.value)},
        React.createElement('option',{value:'all'},'All outlets'),
        salonsList.map(s=>React.createElement('option',{key:s.id,value:String(s.id)},s.name)))
    ),
    React.createElement('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:12,lineHeight:1.6}},
      'Every save is recorded by the database: who changed which sheet, and when. Use "Restore previous version" to undo someone\'s changes to a sheet. Kept for 90 days.'),
    rows===null?React.createElement('div',{style:{fontSize:12,color:'var(--text3)'}},'Loading…')
    :rows.length===0?React.createElement('div',{style:{fontSize:12,color:'var(--text3)'}},'No changes recorded yet.')
    :React.createElement('div',{style:{maxHeight:360,overflowY:'auto',border:'1px solid var(--border)',borderRadius:'var(--r)'}},
      rows.map(r=>{const d=describeDataKey(r.key,salonsList);
        return React.createElement('div',{key:r.id,style:{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderBottom:'1px solid var(--border)',fontSize:12.5}},
          React.createElement('div',{style:{flex:1,minWidth:0}},
            React.createElement('div',{style:{color:'var(--text)',fontWeight:500}},d.sheet+' · '+d.outlet),
            React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},fmt(r.at)+' · '+(r.changed_by_email||'system')+(r.edits>1?' · '+r.edits+' saves':''))),
          React.createElement('button',{className:'btn btn-ghost btn-sm',disabled:busy,onClick:()=>setConfirmRow(r)},'Restore previous version'));})),
    confirmRow&&React.createElement('div',{className:'modal-overlay',onClick:()=>!busy&&setConfirmRow(null)},
      React.createElement('div',{className:'modal',style:{width:440},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Restore previous version?'),
        React.createElement('div',{style:{fontSize:13,color:'var(--text2)',marginBottom:16,lineHeight:1.6}},
          (()=>{const d=describeDataKey(confirmRow.key,salonsList);return '"'+d.sheet+'" at '+d.outlet+' goes back to how it was before '+(confirmRow.changed_by_email||'this change')+'\'s changes on '+fmt(confirmRow.at)+'. Anything saved to this sheet after that is replaced too. This restore is itself recorded, so it can be undone the same way.';})()),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',disabled:busy,onClick:()=>setConfirmRow(null)},'Cancel'),
          React.createElement('button',{className:'btn btn-danger'+(busy?' btn-loading':''),disabled:busy,onClick:restore},'Restore'))))
  );
}
// ── App errors (Super Admin) — crashes and failed operations users hit are recorded in the
// cloud (see reportClientError), so problems get noticed instead of silently annoying staff. ──
function AppErrorsCard(){
  const [rows,setRows]=useState(null);
  useEffect(()=>{(async()=>{
    try{const supa=await getSupabaseClient();const{data,error}=await supa.from('client_errors').select('id,at,email,page,message').order('at',{ascending:false}).limit(50);if(error)throw error;setRows(data||[]);}
    catch(e){setRows([]);}
  })();},[]);
  if(!rows||!rows.length)return null;
  const fmt=(ts)=>new Date(ts).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
  return React.createElement('div',{className:'card',style:{marginBottom:16}},
    React.createElement('div',{className:'card-title'},'🐞 App errors (last '+rows.length+')'),
    React.createElement('div',{style:{maxHeight:240,overflowY:'auto',border:'1px solid var(--border)',borderRadius:'var(--r)'}},
      rows.map(r=>React.createElement('div',{key:r.id,style:{padding:'7px 12px',borderBottom:'1px solid var(--border)',fontSize:12}},
        React.createElement('div',{style:{color:'var(--red)',wordBreak:'break-word'}},r.message),
        React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},fmt(r.at)+' · '+(r.email||'?')+(r.page?' · '+r.page:''))))));
}
// ── AI Assistant (Super Admin) — the Claude API key is sent once to the ai-settings cloud
// function, checked with a tiny request and stored server-side (public.app_secrets). It is never
// shown again or kept in the browser; only "configured", the model and its last 4 characters. ──
async function aiSettingsCall(action,payload){
  const supa=await getSupabaseClient();
  const{data,error}=await supa.functions.invoke('ai-settings',{body:{action,...(payload||{})}});
  if(error){let msg=error.message||'Could not reach the AI settings service';try{const b=error.context&&await error.context.json();if(b&&b.error)msg=b.error;}catch(e){}throw new Error(msg);}
  if(data&&data.error)throw new Error(data.error);
  return data||{};
}
function AiSettingsCard(){
  const {success,error:toastError}=useToast();
  const [st,setSt]=useState(null); // null = loading
  const [key,setKey]=useState('');
  const [showKey,setShowKey]=useState(false);
  const [model,setModel]=useState('claude-opus-5-5');
  const [busy,setBusy]=useState('');
  const load=async()=>{try{const s=await aiSettingsCall('status');setSt(s);setModel(s.model);}catch(e){setSt({error:e.message});}};
  useEffect(()=>{load();},[]);
  const MODEL_LABELS={'claude-opus-5-5':'Claude Opus 5.5 — most capable (recommended)','claude-sonnet-5-5':'Claude Sonnet 5.5 — faster, lower cost','claude-haiku-4-5':'Claude Haiku 4.5 — fastest, lowest cost'};
  const save=async()=>{
    setBusy('save');
    try{const r=await aiSettingsCall('save',{key:key.trim(),model});setKey('');setShowKey(false);success(key.trim()?'AI key saved and checked — Claude replied: "'+(r.reply||'ok')+'"':'Model updated.');await load();}
    catch(e){toastError(e.message);}
    setBusy('');
  };
  const test=async()=>{setBusy('test');try{const r=await aiSettingsCall('test');success('Working — '+r.model+' replied: "'+(r.reply||'ok')+'"');}catch(e){toastError(e.message);}setBusy('');};
  const remove=async()=>{if(!confirm('Remove the saved AI key? AI features will stop until a new key is saved.'))return;setBusy('remove');try{await aiSettingsCall('remove');success('AI key removed.');await load();}catch(e){toastError(e.message);}setBusy('');};
  return React.createElement('div',{className:'card',style:{marginBottom:16}},
    React.createElement('div',{className:'card-title'},'🤖 AI Assistant (Claude API key)'),
    React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',lineHeight:1.6,marginBottom:12}},
      'Connects SalonOS to Anthropic’s Claude for AI features. Create a key at console.anthropic.com → API Keys (billing is on your Anthropic account). The key is checked, then stored securely on the server — it is never shown again or saved in any browser.'),
    st===null?React.createElement('div',{style:{fontSize:12,color:'var(--text3)'}},'Checking…'):
    st.error?React.createElement('div',{style:{fontSize:12,color:'var(--red)'}},st.error):
    React.createElement(React.Fragment,null,
      React.createElement('div',{style:{fontSize:12.5,marginBottom:10}},st.configured
        ?React.createElement('span',{style:{color:'var(--green)'}},'✓ Key saved ('+st.keyHint+') · model '+st.model+(st.updatedAt?' · updated '+new Date(st.updatedAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+(st.updatedBy?' by '+st.updatedBy:''):''))
        :React.createElement('span',{style:{color:'var(--orange)'}},'No key saved yet.')),
      React.createElement('div',{className:'form-row cols2'},
        React.createElement('div',{className:'form-group'},React.createElement('label',null,st.configured?'Replace key (leave blank to keep the current one)':'Claude API key *'),
          React.createElement('div',{style:{position:'relative'}},
            React.createElement('input',{className:'form-control',type:showKey?'text':'password',autoComplete:'off',spellCheck:false,value:key,onChange:e=>setKey(e.target.value),placeholder:'sk-ant-…',style:{paddingRight:40}}),
            React.createElement('button',{type:'button',onClick:()=>setShowKey(s=>!s),'aria-label':showKey?'Hide key':'Show key',style:{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:14}},showKey?'🙈':'👁'))),
        React.createElement('div',{className:'form-group'},React.createElement('label',null,'Model'),
          React.createElement('select',{className:'form-control',value:model,onChange:e=>setModel(e.target.value)},(st.models||Object.keys(MODEL_LABELS)).map(m=>React.createElement('option',{key:m,value:m},MODEL_LABELS[m]||m))))),
      React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        React.createElement('button',{className:'btn btn-primary btn-sm',disabled:!!busy||(!key.trim()&&(!st.configured||model===st.model)),onClick:save},busy==='save'?'Checking key…':(key.trim()?'Save & check key':'Save model')),
        st.configured&&React.createElement('button',{className:'btn btn-ghost btn-sm',disabled:!!busy,onClick:test},busy==='test'?'Testing…':'Test connection'),
        st.configured&&React.createElement('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},disabled:!!busy,onClick:remove},'Remove key')))
  );
}
// ── Automatic reports (Super Admin) — who gets the nightly summary (22:00 IST) and the monthly
// summary (1st, 09:00 IST), sent by the salonos-reports cloud function. Stored in a
// salonos_secret_* record, which only Super Admins can read or change. The email/WhatsApp
// sending keys never live in the app — they're added as Supabase Edge Function secrets. ──
const REPORT_SETTINGS_KEY='salonos_secret_report_settings';
function ReportSettingsCard(){
  const {success,error:toastError,info}=useToast();
  const saved=(()=>{try{return JSON.parse(cachedLocalGet(REPORT_SETTINGS_KEY)||'{}')||{};}catch(e){return{};}})();
  const [emails,setEmails]=useState((saved.emails||[]).join(', '));
  const [phones,setPhones]=useState((saved.whatsapp||[]).join(', '));
  const [daily,setDaily]=useState(saved.daily!==false);
  const [monthly,setMonthly]=useState(saved.monthly!==false);
  const [busy,setBusy]=useState(false);
  const [lastResult,setLastResult]=useState(null);
  const split=s=>s.split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean);
  const save=()=>{
    const em=split(emails),ph=split(phones);
    const badE=em.filter(e=>!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if(badE.length)return toastError('Not a valid email: '+badE.join(', '));
    const badP=ph.filter(p=>p.replace(/[^\d]/g,'').length<10);
    if(badP.length)return toastError('WhatsApp numbers need the country code, e.g. 91 98xxxxxxxx: '+badP.join(', '));
    safeLocalSet(REPORT_SETTINGS_KEY,JSON.stringify({emails:em,whatsapp:ph,daily,monthly}));
    success('Report settings saved');
  };
  const test=async(kind)=>{
    setBusy(true);setLastResult(null);
    try{
      const supa=await getSupabaseClient();
      const{data,error}=await supa.functions.invoke('salonos-reports',{body:{kind,test:true}});
      if(error)throw error;
      if(data&&data.error)throw new Error(data.error);
      setLastResult(data&&data.results||{});
      const r=(data&&data.results)||{};
      const problems=Object.values(r).filter(x=>x&&!x.ok).map(x=>x.error);
      if(problems.length)toastError(problems.join(' '));else success('Test report sent — check the inbox / WhatsApp');
    }catch(e){
      const msg=(e&&e.message)||String(e);
      toastError(/not found|404|Failed to send a request/i.test(msg)?'The report service isn\'t installed in Supabase yet.':'Test failed: '+msg);
    }
    setBusy(false);
  };
  const row={display:'flex',alignItems:'center',gap:8,fontSize:13,color:'var(--text2)',marginRight:18};
  return React.createElement('div',{className:'card',style:{marginBottom:16}},
    React.createElement('div',{className:'card-title'},'📬 Automatic reports'),
    React.createElement('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:12,lineHeight:1.6}},
      'A nightly summary at 10 PM (each outlet\'s sales, expenses and attendance for the day, plus month-to-date sales) and a monthly summary on the 1st at 9 AM. Needs a one-time setup in Supabase (see the SalonOS setup notes) before anything is sent.'),
    React.createElement('div',{className:'form-group',style:{marginBottom:10}},
      React.createElement('label',null,'Email to (comma separated)'),
      React.createElement('input',{className:'form-control',value:emails,onChange:e=>setEmails(e.target.value),placeholder:'owner@example.com, accounts@example.com'})),
    React.createElement('div',{className:'form-group',style:{marginBottom:10}},
      React.createElement('label',null,'WhatsApp to (with country code, comma separated)'),
      React.createElement('input',{className:'form-control',value:phones,onChange:e=>setPhones(e.target.value),placeholder:'91 98xxxxxxxx'})),
    React.createElement('div',{style:{display:'flex',flexWrap:'wrap',marginBottom:12}},
      React.createElement('label',{style:row},React.createElement('input',{type:'checkbox',checked:daily,onChange:e=>setDaily(e.target.checked)}),'Nightly summary'),
      React.createElement('label',{style:row},React.createElement('input',{type:'checkbox',checked:monthly,onChange:e=>setMonthly(e.target.checked)}),'Monthly summary')),
    React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
      React.createElement('button',{className:'btn btn-primary btn-sm',onClick:save},'Save'),
      React.createElement('button',{className:'btn btn-ghost btn-sm'+(busy?' btn-loading':''),disabled:busy,onClick:()=>test('daily')},'Send test nightly report'),
      React.createElement('button',{className:'btn btn-ghost btn-sm',disabled:busy,onClick:()=>test('monthly')},'Send test monthly report')),
    lastResult&&React.createElement('div',{style:{fontSize:12,color:'var(--text3)',marginTop:10}},
      Object.keys(lastResult).map(k=>k+': '+(lastResult[k].ok?'sent ✓':lastResult[k].error)).join(' · ')||'Nothing to send — add recipients and save first.')
  );
}
// ── Two-step login (authenticator app, TOTP) for the signed-in account. Once it's on, sign-in
// asks for the app's 6-digit code, and the database only grants Super Admin powers to a
// session that has passed that step. ──
function TwoStepLoginCard(){
  const {success,error:toastError}=useToast();
  const [factors,setFactors]=useState(null);
  const [enroll,setEnroll]=useState(null); // {id,qr,secret} while setting up
  const [code,setCode]=useState('');
  const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    try{const supa=await getSupabaseClient();const{data,error}=await supa.auth.mfa.listFactors();if(error)throw error;setFactors((data&&data.all)||[]);}
    catch(e){setFactors([]);}
  },[]);
  useEffect(()=>{load();},[load]);
  const verified=(factors||[]).filter(f=>f.factor_type==='totp'&&f.status==='verified');
  const start=async()=>{
    setBusy(true);
    try{
      const supa=await getSupabaseClient();
      for(const f of (factors||[]).filter(f=>f.status!=='verified'))await supa.auth.mfa.unenroll({factorId:f.id}); // abandoned earlier setups
      const{data,error}=await supa.auth.mfa.enroll({factorType:'totp',friendlyName:'SalonOS '+new Date().toISOString().slice(0,16)});
      if(error)throw error;
      setEnroll({id:data.id,qr:data.totp.qr_code,secret:data.totp.secret});setCode('');
    }catch(e){toastError('Could not start setup: '+(e.message||'network error'));}
    setBusy(false);
  };
  const confirm=async()=>{
    setBusy(true);
    try{
      const supa=await getSupabaseClient();
      const{error}=await supa.auth.mfa.challengeAndVerify({factorId:enroll.id,code:code.replace(/\s/g,'')});
      if(error)throw error;
      setEnroll(null);success('Two-step login is on — you\'ll be asked for a code from the app each time you sign in.');await load();
    }catch(e){toastError('That code didn\'t work — enter the current 6-digit code shown in the app.');}
    setBusy(false);
  };
  const turnOff=async(f)=>{
    if(!window.confirm('Turn off two-step login for your account? Your account will be protected by the password only.'))return;
    setBusy(true);
    try{const supa=await getSupabaseClient();const{error}=await supa.auth.mfa.unenroll({factorId:f.id});if(error)throw error;success('Two-step login turned off');await load();}
    catch(e){toastError('Could not turn it off: '+(e.message||'network error'));}
    setBusy(false);
  };
  return React.createElement('div',{className:'card',style:{marginBottom:16}},
    React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap',marginBottom:8}},
      React.createElement('div',{className:'card-title',style:{marginBottom:0}},'🔐 Two-step login (your account)'),
      factors===null?null:verified.length
        ?React.createElement('span',{className:'badge badge-green'},'ON')
        :React.createElement('span',{className:'badge',style:{background:'rgba(255,159,67,0.15)',color:'var(--orange)'}},'OFF — recommended for Super Admins')
    ),
    React.createElement('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:12,lineHeight:1.6}},
      'Adds a 6-digit code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, Authy) to every sign-in, so a stolen password alone can\'t open your account.'),
    verified.length
      ?React.createElement('button',{className:'btn btn-ghost btn-sm',disabled:busy,onClick:()=>turnOff(verified[0])},'Turn off')
      :enroll
        ?React.createElement('div',{style:{display:'flex',gap:16,flexWrap:'wrap',alignItems:'flex-start'}},
          React.createElement('img',{src:enroll.qr,alt:'QR code for your authenticator app',style:{width:170,height:170,background:'#fff',borderRadius:8,padding:6}}),
          React.createElement('div',{style:{flex:1,minWidth:200}},
            React.createElement('div',{style:{fontSize:12.5,color:'var(--text2)',lineHeight:1.7,marginBottom:10}},
              '1. Open your authenticator app and scan this QR code.',React.createElement('br'),
              '2. Can\'t scan? Add it manually with this key: ',React.createElement('code',{style:{userSelect:'all',fontSize:11.5}},enroll.secret),React.createElement('br'),
              '3. Enter the 6-digit code the app shows:'),
            React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
              React.createElement('input',{className:'form-control',style:{maxWidth:160,letterSpacing:'0.25em',textAlign:'center'},inputMode:'numeric',autoComplete:'one-time-code',maxLength:8,placeholder:'123456',value:code,onChange:e=>setCode(e.target.value.replace(/[^\d\s]/g,'')),onKeyDown:e=>e.key==='Enter'&&confirm()}),
              React.createElement('button',{className:'btn btn-primary btn-sm'+(busy?' btn-loading':''),disabled:busy||code.replace(/\s/g,'').length<6,onClick:confirm},'Turn on'),
              React.createElement('button',{className:'btn btn-ghost btn-sm',disabled:busy,onClick:()=>setEnroll(null)},'Cancel'))))
        :React.createElement('button',{className:'btn btn-primary btn-sm'+(busy?' btn-loading':''),disabled:busy||factors===null,onClick:start},'Set up two-step login')
  );
}
function MasterSettings({autoBackupOn,setAutoBackupOn,lastAutoBackup}={}){
  const {success,error:toastError,warn}=useToast();
  const [importMsg,setImportMsg]=useState('');
  const backupFileRef=useRef(null);
  const doTakeBackup=()=>{
    const n=downloadSalonOSBackup();
    success('Backup downloaded — '+n+' data key'+(n===1?'':'s')+' saved to a JSON file.');
  };
  // ── Storage management ──
  const storageUsage=useStorageUsage();
  const [storageBreakdown,setStorageBreakdown]=useState(()=>estimateStorageBreakdown());
  const [showBreakdown,setShowBreakdown]=useState(false);
  const [showClearAll,setShowClearAll]=useState(false);
  const [clearAllConfirmText,setClearAllConfirmText]=useState('');
  const [clearAllBackedUp,setClearAllBackedUp]=useState(false);
  const refreshBreakdown=()=>setStorageBreakdown(estimateStorageBreakdown());
  const autoBackupSnapshotBytes=(storageBreakdown.items.find(i=>i.label.indexOf('Auto-backup snapshot')===0)||{bytes:0}).bytes;
  const doClearAutoBackupSnapshot=()=>{
    clearAutoBackupSnapshot();
    refreshBreakdown();
    success('Auto-backup snapshot cleared'+(autoBackupSnapshotBytes?' — freed '+formatBytes(autoBackupSnapshotBytes):'')+'. Your real data is untouched.');
  };
  const openClearAll=()=>{setClearAllConfirmText('');setClearAllBackedUp(false);setShowClearAll(true);};
  const doClearAllData=()=>{
    const n=clearAllSalonOSData();
    warn(n+' data key'+(n===1?'':'s')+' cleared from this browser. Reloading…');
    setShowClearAll(false);
    setTimeout(()=>window.location.reload(),1000);
  };
  const doImportBackup=async(file)=>{
    setImportMsg('');
    try{
      const text=await file.text();
      const n=restoreSalonOSBackup(text);
      setImportMsg('Restored '+n+' data key'+(n===1?'':'s')+' from "'+file.name+'". Reloading…');
      setTimeout(()=>window.location.reload(),1200);
    }catch(err){
      toastError('Import failed: '+err.message);
      setImportMsg('');
    }
  };
  const [toggles,setToggles]=useState({pf:true,esic:true,pt:true,tds:true,lwf:false,gratuity:true});
  const Toggle=({k,label})=>React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',borderBottom:'1px solid var(--border)'}},
    React.createElement('span',{style:{fontSize:13,color:'var(--text2)'}},label),
    React.createElement('div',{className:`toggle-switch ${toggles[k]?'on':''}`,onClick:()=>setToggles(t=>({...t,[k]:!t[k]}))})
  );
  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'page-title'},'Master Settings'),
    React.createElement('div',{className:'page-sub'},'Global configuration and statutory applicability'),
    CLOUD_SYNC_ENABLED&&React.createElement(TwoStepLoginCard,null),
    CLOUD_SYNC_ENABLED&&React.createElement(CloudBackupsCard,null),
    CLOUD_SYNC_ENABLED&&React.createElement(ReportSettingsCard,null),
    CLOUD_SYNC_ENABLED&&React.createElement(AiSettingsCard,null),
    CLOUD_SYNC_ENABLED&&React.createElement(ChangeHistoryCard,null),
    CLOUD_SYNC_ENABLED&&React.createElement(AppErrorsCard,null),
    React.createElement('div',{className:'card',style:{marginBottom:16}},
      React.createElement('div',{className:'card-title'},'💾 Backup & Restore'),
      React.createElement('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:14,lineHeight:1.6}},'Every outlet\'s data — employees, attendance, salary, bank statements, collections, vendors and invoices — lives in this browser\'s local storage. Take a backup regularly, and before clearing browser data or switching devices.'),
      React.createElement('div',{style:{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14}},
        React.createElement('button',{className:'btn btn-primary btn-sm',onClick:doTakeBackup},'⬇ Take Backup (JSON)'),
        React.createElement('input',{type:'file',accept:'.json',ref:backupFileRef,style:{display:'none'},onChange:e=>{const f=e.target.files[0];if(f)doImportBackup(f);e.target.value='';}}),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>backupFileRef.current&&backupFileRef.current.click()},'⬆ Import Backup (JSON)')
      ),
      importMsg&&React.createElement('div',{style:{fontSize:12,color:'var(--green)',marginBottom:14}},importMsg),
      React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',borderTop:'1px solid var(--border)'}},
        React.createElement('div',null,
          React.createElement('div',{style:{fontSize:13,color:'var(--text2)',fontWeight:500}},'Auto-backup every 1 minute'),
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:2}},
            'Saves a snapshot in this browser automatically — doesn\'t download a file each time. '+
            (autoBackupOn?(lastAutoBackup?'Last snapshot: '+new Date(lastAutoBackup).toLocaleTimeString():'Waiting for the first snapshot…'):'Currently off.')
          )
        ),
        React.createElement('div',{className:`toggle-switch ${autoBackupOn?'on':''}`,onClick:()=>setAutoBackupOn&&setAutoBackupOn(v=>!v)})
      )
    ),
    React.createElement('div',{className:'card',style:{marginBottom:16}},
      React.createElement('div',{className:'card-title'},'🗄 Storage'),
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:14,marginBottom:12}},
        React.createElement('div',{style:{flex:1}},
          React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--text2)',marginBottom:5}},
            React.createElement('span',null,formatBytes(storageUsage.bytes)+' used of ~5 MB'),
            React.createElement('span',{style:{fontWeight:700,color:storageUsage.pct>=90?'var(--red)':storageUsage.pct>=70?'#e0a530':'var(--green)'}},storageUsage.pct+'%')
          ),
          React.createElement('div',{style:{height:7,borderRadius:4,background:'var(--bg4)',overflow:'hidden'}},
            React.createElement('div',{style:{height:'100%',width:storageUsage.pct+'%',borderRadius:4,transition:'width .3s ease',background:storageUsage.pct>=90?'var(--red)':storageUsage.pct>=70?'#e0a530':'var(--green)'}})
          )
        ),
        React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>{refreshBreakdown();setShowBreakdown(v=>!v);}},showBreakdown?'Hide breakdown':'What\'s using space?')
      ),
      storageUsage.pct>=70&&React.createElement('div',{style:{fontSize:12,color:storageUsage.pct>=90?'var(--red)':'#e0a530',marginBottom:12,lineHeight:1.6}},
        storageUsage.pct>=90?'Storage is nearly full — new entries may fail to save. Take a backup above, then clear space below.':'Storage is getting full. Worth clearing some space soon.'
      ),
      showBreakdown&&React.createElement('div',{style:{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:12,maxHeight:220,overflowY:'auto'}},
        storageBreakdown.items.length===0?React.createElement('div',{style:{fontSize:12,color:'var(--text3)'}},'Nothing stored yet.')
        :storageBreakdown.items.map((it,i)=>React.createElement('div',{key:i,style:{display:'flex',justifyContent:'space-between',gap:10,padding:'6px 0',borderBottom:i<storageBreakdown.items.length-1?'1px solid var(--border)':'none',fontSize:12}},
            React.createElement('span',{style:{color:'var(--text2)'}},it.label),
            React.createElement('span',{style:{color:'var(--text3)',flexShrink:0}},formatBytes(it.bytes))
          ))
      ),
      React.createElement('div',{style:{display:'flex',gap:10,flexWrap:'wrap',paddingTop:12,borderTop:'1px solid var(--border)'}},
        React.createElement('button',{
          className:'btn btn-sm',
          style:{background:'rgba(255,159,67,0.1)',border:'1px solid rgba(255,159,67,0.3)',color:'var(--orange)',padding:'6px 14px',borderRadius:'var(--r)',cursor:'pointer',fontSize:12},
          title:'Removes the in-browser snapshot the auto-backup timer keeps — safe, since it only duplicates data that\'s already saved elsewhere.',
          onClick:doClearAutoBackupSnapshot
        },'🧹 Clear Auto-Backup Snapshot'+(autoBackupSnapshotBytes?' ('+formatBytes(autoBackupSnapshotBytes)+')':'')),
        React.createElement('button',{
          className:'btn btn-sm',
          style:{background:'rgba(255,107,107,0.1)',border:'1px solid rgba(255,107,107,0.3)',color:'var(--red)',padding:'6px 14px',borderRadius:'var(--r)',cursor:'pointer',fontSize:12},
          onClick:openClearAll
        },'🗑 Clear All Local Data')
      )
    ),
    showClearAll&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowClearAll(false)},
      React.createElement('div',{className:'modal',style:{width:480},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title',style:{color:'var(--red)'}},'Clear All Local Data'),
        React.createElement('div',{style:{fontSize:13,color:'var(--text2)',marginBottom:14,lineHeight:1.7}},
          'This permanently deletes ',
          React.createElement('b',{style:{color:'var(--text)'}},'every salon, employee, invoice, bank statement row, and every other record'),
          ' stored in this browser — everything covered by Backup & Restore above. ',
          React.createElement('strong',{style:{color:'var(--red)'}},'This cannot be undone.')
        ),
        React.createElement('label',{style:{display:'flex',alignItems:'flex-start',gap:8,cursor:'pointer',marginBottom:14,fontSize:12.5,color:'var(--text2)',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 12px'}},
          React.createElement('input',{type:'checkbox',checked:clearAllBackedUp,onChange:e=>setClearAllBackedUp(e.target.checked),style:{marginTop:2}}),
          React.createElement('span',null,'I\'ve downloaded a backup (or don\'t need one) and understand this data can\'t be recovered afterward.')
        ),
        React.createElement('div',{className:'form-group',style:{marginBottom:16}},
          React.createElement('label',null,'Type DELETE to confirm'),
          React.createElement('input',{className:'form-control',value:clearAllConfirmText,onChange:e=>setClearAllConfirmText(e.target.value),placeholder:'DELETE'})
        ),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowClearAll(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary btn-sm',onClick:doTakeBackup,style:{marginRight:'auto'}},'⬇ Take Backup First'),
          React.createElement('button',{
            className:'btn btn-danger',
            disabled:!(clearAllBackedUp&&clearAllConfirmText.trim().toUpperCase()==='DELETE'),
            style:{opacity:(clearAllBackedUp&&clearAllConfirmText.trim().toUpperCase()==='DELETE')?1:0.5,cursor:(clearAllBackedUp&&clearAllConfirmText.trim().toUpperCase()==='DELETE')?'pointer':'not-allowed'},
            onClick:doClearAllData
          },'Yes, Delete Everything')
        )
      )
    ),
    React.createElement('div',{className:'grid2'},
      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'card-title'},'⚖ Statutory Provisions'),
        React.createElement(Toggle,{k:'pf',label:'Provident Fund (PF) — 12% of Basic'}),
        React.createElement(Toggle,{k:'esic',label:'ESIC — Applicable below ₹21,000 gross'}),
        React.createElement(Toggle,{k:'pt',label:'Professional Tax (PT) — State-wise slabs'}),
        React.createElement(Toggle,{k:'tds',label:'TDS on Salary — Section 192'}),
        React.createElement(Toggle,{k:'lwf',label:'Labour Welfare Fund (LWF)'}),
        React.createElement(Toggle,{k:'gratuity',label:'Gratuity — 4.81% of Basic+DA'})
      ),
      React.createElement('div',null,
        React.createElement('div',{className:'card',style:{marginBottom:16}},
          React.createElement('div',{className:'card-title'},'💰 Salary Configuration'),
          React.createElement('div',{className:'form-row cols2'},
            React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-2'},'Salary Cycle'),React.createElement('select',{id:'f-2',className:'form-control'},React.createElement('option',null,'Monthly — Last working day'),React.createElement('option',null,'Monthly — 5th of next month'))),
            React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-3'},'Financial Year Start'),React.createElement('select',{id:'f-3',className:'form-control'},React.createElement('option',null,'April'),React.createElement('option',null,'January')))
          ),
          React.createElement('div',{className:'form-row cols2'},
            React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-4'},'PF Wage Ceiling (₹)'),React.createElement('input',{id:'f-4',className:'form-control',defaultValue:'15000'})),
            React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-5'},'ESIC Wage Ceiling (₹)'),React.createElement('input',{id:'f-5',className:'form-control',defaultValue:'21000'}))
          ),
          React.createElement('button',{className:'btn btn-primary btn-sm'},'Save Changes')
        ),
        React.createElement('div',{className:'card'},
          React.createElement('div',{className:'card-title'},'📋 Leave Policy'),
          React.createElement('div',{className:'form-row cols3'},
            React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-6'},'Earned Leave (days/yr)'),React.createElement('input',{id:'f-6',className:'form-control',defaultValue:'15'})),
            React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-7'},'Casual Leave'),React.createElement('input',{id:'f-7',className:'form-control',defaultValue:'12'})),
            React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-8'},'Sick Leave'),React.createElement('input',{id:'f-8',className:'form-control',defaultValue:'7'}))
          ),
          React.createElement('button',{className:'btn btn-primary btn-sm'},'Save Changes')
        )
      )
    )
  );
}

function UserManagement(){
  const {toast}=useToast();
  // Cloud mode: the account list IS the `profiles` table (real Supabase logins) — mutated only
  // through Supabase calls (create-user Edge Function / direct profile updates), never written
  // straight to local state, then re-pulled with refreshCloudUsers() so the table always reflects
  // what's actually in the database. Local mode keeps the original plaintext-list behavior as-is.
  const [localUsers,setLocalUsers]=useState(()=>loadUserAccounts());
  useEffect(()=>{if(!CLOUD_SYNC_ENABLED)saveUserAccounts(localUsers);},[localUsers]);
  const [cloudUsers,setCloudUsers]=useState([]);
  const [cloudBusy,setCloudBusy]=useState(false);
  const refreshCloudUsers=useCallback(async()=>{
    if(!CLOUD_SYNC_ENABLED)return;
    const supa=await getSupabaseClient();
    const{data:{session}}=await supa.auth.getSession();
    if(!session){notifyCloudSessionLost();return;}
    const{data,error}=await supa.from('profiles').select('*').order('created_at',{ascending:true});
    if(error){toast('Could not load users: '+(error.message||'unknown error'),'error');return;}
    if(data)setCloudUsers(data.map(p=>({
      id:p.id,name:p.name,email:p.email,role:p.role,access:p.access,
      outletIds:p.outlet_ids||[],
      // outlet_access / sheet_access_by_outlet are real jsonb columns on profiles (see
      // supabase_schema.sql) — fall back to "every granted outlet is full Edit, no sheet-level
      // restriction" only for a profile saved before these columns existed.
      outletAccess:(p.outlet_access&&Object.keys(p.outlet_access).length)?p.outlet_access:Object.fromEntries((p.outlet_ids||[]).map(oid=>[oid,'View and Edit'])),
      sheetAccessByOutlet:p.sheet_access_by_outlet||{},status:p.status
    })));
  },[]);
  useEffect(()=>{refreshCloudUsers();},[refreshCloudUsers]);
  const users=CLOUD_SYNC_ENABLED?cloudUsers:localUsers;
  const setUsers=CLOUD_SYNC_ENABLED?(()=>{}):setLocalUsers;
  const [showModal,setShowModal]=useState(false);
  const [editId,setEditId]=useState(null);
  const [showDelete,setShowDelete]=useState(null);
  // Fixed role list — Super Admin always keeps full access everywhere regardless of the
  // per-sheet matrix below (there has to be an account nobody can lock themselves out with).
  // Salon Owner/Salon Manager/ASM/Accountant are business-facing roles distinct from Reviewer
  // (approves submissions, see Review Centre) and Data Entry User (day-to-day entry, typically
  // outlet-level). None of these get hardcoded permissions the way Super Admin/Reviewer do —
  // what they can actually see and edit is entirely set by the per-sheet, per-outlet matrix
  // below, same as every other non-special-cased role.
  const ROLE_OPTIONS=['Super Admin','Salon Owner','Salon Manager','ASM','Data Entry User','Accountant','Reviewer'];
  // Every sheet a permission can be granted for — kept in sync with SALON_TABS in the main App
  // shell; if a new module is ever added there, add it here too or it'll silently default to
  // whatever level is chosen as the fallback rather than showing up in the matrix.
  const PERMISSION_SHEETS=[
    {id:'outlet-dashboard',label:'Dashboard'},{id:'appointments',label:'Appointments'},{id:'billing',label:'Billing'},
    {id:'clients',label:'Clients'},{id:'inventory',label:'Inventory'},{id:'master-salary',label:'Master Salary'},
    {id:'daily-sales',label:'Daily Sales & Exp.'},{id:'daily-incentive',label:'Daily Incentive'},{id:'attendance',label:'Attendance'},
    {id:'salary-working',label:'Salary Working'},{id:'incentive-working',label:'Incentive Working'},{id:'advance',label:'Advances'},
    {id:'penalty',label:'Penalties'},{id:'vendors',label:'Vendors'},{id:'due-dates',label:'Due Dates'},
    {id:'outlet-pnl',label:'P&L (Monthly)'},{id:'collection',label:'Collection Summary'},{id:'collection-sheet',label:'Collection Reco'},{id:'bank-statement',label:'Bank Statement'},
    {id:'bank-payment',label:'Bank Payment'},{id:'tally-export',label:'Tally Export'},{id:'reports',label:'Reports'},{id:'recurring-expenses',label:'Recurring Expenses'},
    {id:'previous-pnl',label:'Previous Months P&L'},{id:'fixed-assets',label:'Fixed Assets'},{id:'audit-log',label:'Audit Log'},{id:'import-center',label:'Import Center'}
  ];
  const PERMISSION_LEVELS=['No Access','View Only','Edit'];
  const OUTLET_ACCESS_LEVELS=['No Access','View Only','View and Edit'];
  const BLANK={name:'',email:'',password:'',role:'Salon Manager',access:'Viewer',status:'Active',sheetAccessByOutlet:{},outletAccess:{}};
  const salonsList=loadSalonsFromStorage();
  const setOutletLevel=(outletId,level)=>setForm(f=>({...f,outletAccess:{...f.outletAccess,[outletId]:level}}));
  const bulkSetOutlets=(level)=>setForm(f=>({...f,outletAccess:Object.fromEntries(salonsList.map(s=>[s.id,level]))}));
  // outletIds is what the rest of the app (outlet switcher, Review Centre) actually checks —
  // derived here so both models stay in sync without touching that existing enforcement code:
  // anything not explicitly "No Access" counts as an outlet this user can enter.
  const outletIdsFromAccess=(outletAccess)=>salonsList.filter(s=>(outletAccess[s.id]||'No Access')!=='No Access').map(s=>s.id);
  const [form,setForm]=useState(BLANK);
  const [showFormPass,setShowFormPass]=useState(false); // 👁 on the password box
  const fc=k=>e=>setForm(f=>({...f,[k]:e.target.value}));
  // Sheet-wise Access is now set separately FOR EACH outlet this user has been granted — the
  // same person can be full Edit access at one outlet and View Only (or nothing) at another.
  // selectedSheetOutlet tracks which outlet's matrix is currently showing in the editor below.
  const [selectedSheetOutlet,setSelectedSheetOutlet]=useState(null);
  const grantedOutletIds=outletIdsFromAccess(form.outletAccess);
  useEffect(()=>{
    if(!grantedOutletIds.includes(selectedSheetOutlet))setSelectedSheetOutlet(grantedOutletIds[0]||null);
    // eslint-disable-next-line
  },[JSON.stringify(grantedOutletIds)]);
  const sheetAccessForSelected=()=>(selectedSheetOutlet!=null&&form.sheetAccessByOutlet[selectedSheetOutlet])||{};
  const setSheetLevel=(sheetId,level)=>setForm(f=>{
    if(selectedSheetOutlet==null)return f;
    const current=f.sheetAccessByOutlet[selectedSheetOutlet]||{};
    return{...f,sheetAccessByOutlet:{...f.sheetAccessByOutlet,[selectedSheetOutlet]:{...current,[sheetId]:level}}};
  });
  const bulkSetAll=(level,onlyIds)=>setForm(f=>{
    if(selectedSheetOutlet==null)return f;
    const current=f.sheetAccessByOutlet[selectedSheetOutlet]||{};
    const targetIds=onlyIds||PERMISSION_SHEETS.map(s=>s.id);
    const patch=Object.fromEntries(targetIds.map(id=>[id,level]));
    return{...f,sheetAccessByOutlet:{...f.sheetAccessByOutlet,[selectedSheetOutlet]:{...current,...patch}}};
  });
  // Checkbox multi-select, for "apply this level to just these sheets" instead of all-or-nothing.
  const [checkedSheets,setCheckedSheets]=useState(new Set());
  useEffect(()=>{setCheckedSheets(new Set());},[selectedSheetOutlet]);
  const toggleSheetChecked=(sheetId)=>setCheckedSheets(prev=>{const n=new Set(prev);if(n.has(sheetId))n.delete(sheetId);else n.add(sheetId);return n;});
  const allSheetsChecked=checkedSheets.size>0&&checkedSheets.size===PERMISSION_SHEETS.length;
  const toggleAllSheetsChecked=()=>setCheckedSheets(allSheetsChecked?new Set():new Set(PERMISSION_SHEETS.map(s=>s.id)));

  const openAdd=()=>{setForm(BLANK);setEditId(null);setShowFormPass(false);setShowModal(true);};
  const openEdit=(u)=>{
    const outletAccess=u.outletAccess||Object.fromEntries((u.outletIds||[]).map(id=>[id,'View and Edit']));
    let sheetAccessByOutlet=u.sheetAccessByOutlet;
    if(!sheetAccessByOutlet){
      // Legacy: one flat sheetAccess applied everywhere. Copy it onto every outlet this user
      // currently has access to, so their effective permissions don't change just from opening
      // this form — only diverges once an admin picks a specific outlet and edits it.
      const legacyFlat=u.sheetAccess||{};
      const ids=outletIdsFromAccess(outletAccess);
      sheetAccessByOutlet=Object.fromEntries(ids.map(id=>[id,{...legacyFlat}]));
    }
    setForm({name:u.name,email:u.email,password:'',role:u.role,access:u.access,status:u.status,sheetAccessByOutlet,outletAccess});
    setEditId(u.id);setShowFormPass(false);setShowModal(true);
  };
  const save=async()=>{
    if(!form.name.trim())return toast('Name is required','error');
    if(!form.email.trim()||!form.email.includes('@'))return toast('Enter a valid email','error');
    if(!editId&&!form.password.trim())return toast('Set a password for this new user','error');
    if(form.password&&form.password.length<8)return toast('Password must be at least 8 characters','error');
    const emailTaken=users.some(u=>u.email.toLowerCase()===form.email.trim().toLowerCase()&&u.id!==editId);
    if(emailTaken)return toast('A user with that email already exists','error');

    if(CLOUD_SYNC_ENABLED){
      setCloudBusy(true);
      try{
        const supa=await getSupabaseClient();
        if(editId){
          // Role/access/outlets only — changing another person's password needs the same admin
          // privileges as creating one, which stays server-side (see create-user). They reset
          // their own via "Forgot password?" on the login screen instead.
          const{error}=await supa.from('profiles').update({
            name:form.name.trim(),role:form.role.trim()||'Data Entry User',access:form.access,
            outlet_ids:outletIdsFromAccess(form.outletAccess),status:form.status,
            outlet_access:form.outletAccess,sheet_access_by_outlet:form.sheetAccessByOutlet
          }).eq('id',editId);
          if(error){toast(error.message||'Could not update user','error');setCloudBusy(false);return;}
          if(form.password){
            const{data:pw,error:pwErr}=await supa.functions.invoke('set-user-password',{body:{user_id:editId,password:form.password}});
            const pe=pwErr||(pw&&pw.error);
            if(pe){
              let msg=(pe.message||pe)||'Could not change the password';
              try{const b=pwErr&&pwErr.context&&await pwErr.context.json();if(b&&b.error)msg=b.error;}catch(e2){}
              toast('User details saved, but the password was NOT changed: '+msg,'error',9000);await refreshCloudUsers();setCloudBusy(false);return;
            }
            toast('User updated — new password set. Share it with them privately.','success',7000);
          }else toast('User updated','success');
        }else{
          const{data,error}=await supa.functions.invoke('create-user',{body:{
            email:form.email.trim(),password:form.password.trim(),name:form.name.trim(),
            role:form.role.trim()||'Data Entry User',access:form.access,outlet_ids:outletIdsFromAccess(form.outletAccess),
            outlet_access:form.outletAccess,sheet_access_by_outlet:form.sheetAccessByOutlet
          }});
          const fnErr=error||(data&&data.error);
          if(fnErr){toast((fnErr.message||fnErr)||'Could not create user','error');setCloudBusy(false);return;}
          toast('User added — they can log in now with the email and password just set','success');
        }
        await refreshCloudUsers();
        setShowModal(false);
      }catch(err){
        toast(err.message||'Could not save — check your internet connection','error');
      }
      setCloudBusy(false);
      return;
    }

    if(editId){
      setUsers(prev=>prev.map(u=>u.id===editId?{...u,name:form.name.trim(),email:form.email.trim(),role:form.role.trim()||u.role,access:form.access,status:form.status,sheetAccessByOutlet:form.sheetAccessByOutlet,outletAccess:form.outletAccess,outletIds:outletIdsFromAccess(form.outletAccess),password:form.password.trim()?form.password.trim():u.password}:u));
      toast('User updated','success');
    }else{
      const nextId=Math.max(0,...users.map(u=>u.id))+1;
      setUsers(prev=>[...prev,{id:nextId,name:form.name.trim(),email:form.email.trim(),password:form.password.trim(),role:form.role.trim()||'Manager',access:form.access,outletAccess:form.outletAccess,outletIds:outletIdsFromAccess(form.outletAccess),sheetAccessByOutlet:form.sheetAccessByOutlet,status:'Active'}]);
      toast('User added — they can log in now with the email and password just set','success');
    }
    setShowModal(false);
  };
  const toggleStatus=async(u)=>{
    if(CLOUD_SYNC_ENABLED){
      // Unlike save() above, this had no try/catch — if the Supabase CDN script failed to load
      // (getSupabaseClient's loadScript call), the rejection went unhandled: the button looked
      // like it did nothing, no toast, no error, nothing to tell the admin the deactivation
      // never happened.
      try{
        const supa=await getSupabaseClient();
        const nextStatus=u.status==='Active'?'Inactive':'Active';
        const{error}=await supa.from('profiles').update({status:nextStatus}).eq('id',u.id);
        if(error){toast(error.message||'Could not update status','error');return;}
        await refreshCloudUsers();
        toast('User '+(u.status==='Active'?'deactivated — they can no longer log in':'reactivated'),'info');
      }catch(err){
        toast(err.message||'Could not update status — check your internet connection','error');
      }
      return;
    }
    setUsers(prev=>prev.map(x=>x.id===u.id?{...x,status:x.status==='Active'?'Inactive':'Active'}:x));
    toast('User '+(u.status==='Active'?'deactivated — they can no longer log in':'reactivated'),'info');
  };
  const removeUser=async(id,permanent)=>{
    if(users.length<=1){toast('Can\'t remove the last account — that would lock everyone out','error');setShowDelete(null);return;}
    if(CLOUD_SYNC_ENABLED){
      const me=(()=>{try{return JSON.parse(sessionStorage.getItem('salonos_user'))||{};}catch(e){return{};}})();
      if(id===me.id){toast('You can\'t remove your own account while signed in to it','error');setShowDelete(null);return;}
      setCloudBusy(true);
      try{
        const supa=await getSupabaseClient();
        if(permanent){
          // Deleting a login needs admin rights the browser doesn't have — admin_delete_user is a
          // SECURITY DEFINER function in Supabase that only an active Super Admin may call (it
          // checks that server-side). Deactivate stays available as the reversible option.
          const{error}=await supa.rpc('admin_delete_user',{target:id});
          if(error){
            const missing=error.code==='PGRST202'||/could not find the function|does not exist/i.test(error.message||'');
            toast(missing?'Permanent delete needs a one-time setup in Supabase (the admin_delete_user function). Until then, use Deactivate.':(error.message||'Could not delete user'),'error',9000);
            return;
          }
          toast('User permanently deleted — their login no longer exists','warning');
        }else{
          const{error}=await supa.from('profiles').update({status:'Inactive'}).eq('id',id);
          if(error){toast(error.message||'Could not deactivate user','error');return;}
          toast('User deactivated — they can no longer log in. Use the status toggle to reactivate.','info');
        }
        setShowDelete(null);
        await refreshCloudUsers();
      }catch(err){
        toast(err.message||'Could not update user — check your internet connection','error');
      }finally{setCloudBusy(false);}
      return;
    }
    setUsers(prev=>prev.filter(u=>u.id!==id));
    setShowDelete(null);
    toast('User removed','info');
  };

  const total=users.length,active=users.filter(u=>u.status==='Active').length,
    superAdmins=users.filter(u=>u.role==='Super Admin').length,
    withSheetAccess=users.filter(u=>u.role==='Super Admin'||Object.values(u.sheetAccess||{}).some(v=>v!=='No Access')).length;
  return React.createElement('div',{className:'fade-in'},
    React.createElement('div',{className:'section-header'},
      React.createElement('div',null,
        React.createElement('div',{className:'page-title'},'User Management'),
        React.createElement('div',{className:'page-sub'},'Manage access roles and permissions — this is the same account list used to log in')
      ),
      React.createElement('button',{className:'btn btn-primary',onClick:openAdd},'+ Add User')
    ),
    React.createElement('div',{className:'card',style:{marginBottom:16}},
      React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}},
        [{label:'Total Users',val:String(total),color:'blue'},{label:'Active',val:String(active),color:'green'},{label:'Super Admins',val:String(superAdmins),color:'amber'},{label:'With Sheet Access',val:String(withSheetAccess),color:'purple'}].map(m=>
          React.createElement('div',{key:m.label,className:`metric-card ${m.color}`},
            React.createElement('div',{className:'metric-label'},m.label),
            React.createElement('div',{className:'metric-value'},m.val)
          )
        )
      )
    ),
    React.createElement('div',{className:'card'},
      React.createElement('div',{className:'table-wrap'},
        React.createElement('table',null,
          React.createElement('thead',null,React.createElement('tr',null,
            ['Name','Email','Role','Outlets','Sheets','Status','Last Login','Actions'].map(hh=>React.createElement('th',{key:hh},hh))
          )),
          React.createElement('tbody',null,users.map(u=>
            React.createElement('tr',{key:u.id},
              React.createElement('td',null,React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10}},
                React.createElement('div',{style:{width:30,height:30,borderRadius:'50%',background:'linear-gradient(135deg,var(--accent),var(--purple))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:'#fff',flexShrink:0}},u.name.slice(0,2).toUpperCase()),
                React.createElement('span',{style:{fontWeight:500,color:'var(--text)'}},u.name)
              )),
              React.createElement('td',null,u.email),React.createElement('td',null,u.role),
              React.createElement('td',null,(u.role==='Super Admin'||u.role==='Reviewer')?React.createElement('span',{className:'badge badge-amber'},'All Outlets'):(()=>{
                const oa=u.outletAccess||Object.fromEntries((u.outletIds||[]).map(id=>[id,'View and Edit']));
                const editCount=Object.values(oa).filter(v=>v==='View and Edit').length;
                const viewCount=Object.values(oa).filter(v=>v==='View Only').length;
                if(!editCount&&!viewCount)return React.createElement('span',{className:'badge badge-gray'},'None');
                return React.createElement('span',{style:{fontSize:12,color:'var(--text2)'}},(editCount?editCount+' Edit':'')+(editCount&&viewCount?' · ':'')+(viewCount?viewCount+' View':''));
              })()),
              React.createElement('td',null,u.role==='Super Admin'?React.createElement('span',{className:'badge badge-amber'},'All (Super Admin)'):(()=>{
                const byOutlet=u.sheetAccessByOutlet||(u.sheetAccess?{_legacy:u.sheetAccess}:{});
                const allLevels=Object.values(byOutlet).flatMap(m=>Object.values(m||{}));
                const editCount=allLevels.filter(v=>v==='Edit').length;
                const viewCount=allLevels.filter(v=>v==='View Only').length;
                if(!editCount&&!viewCount)return React.createElement('span',{className:'badge badge-gray'},'No sheets granted');
                const outletCount=Object.keys(byOutlet).length;
                return React.createElement('span',{style:{fontSize:12,color:'var(--text2)'}},(editCount?editCount+' Edit':'')+(editCount&&viewCount?' · ':'')+(viewCount?viewCount+' View':'')+' (across '+outletCount+' outlet'+(outletCount===1?'':'s')+')');
              })()),
              React.createElement('td',null,React.createElement('span',{className:`badge ${u.status==='Active'?'badge-green':'badge-gray'}`,style:{cursor:'pointer'},onClick:()=>toggleStatus(u),title:'Click to toggle'},u.status)),
              React.createElement('td',null,u.lastLogin?new Date(u.lastLogin).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):React.createElement('span',{style:{color:'var(--text3)'}},'Never')),
              React.createElement('td',null,React.createElement('div',{style:{display:'flex',gap:6}},
                React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>openEdit(u)},'Edit'),
                React.createElement('button',{'aria-label':'Delete',className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>setShowDelete(u)},React.createElement(IconTrash,{size:14}))
              ))
            )
          ))
        )
      )
    ),
    showModal&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowModal(false)},
      React.createElement('div',{className:'modal',style:{width:640},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},editId?'Edit User':'Create New User'),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-9'},'Full Name *'),React.createElement('input',{id:'f-9',className:'form-control',placeholder:'Full name',value:form.name,onChange:fc('name')})),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-10'},'Email *'),React.createElement('input',{id:'f-10',className:'form-control',placeholder:'email@company.com',value:form.email,onChange:fc('email')}),form.email&&!isValidEmailFormat(form.email)&&fieldWarning('Doesn\u2019t look like a valid email address.'))
        ),
        React.createElement('div',{className:'form-row cols2'},
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-11'},'Role'),React.createElement('select',{id:'f-11',className:'form-control',value:form.role,onChange:fc('role')},ROLE_OPTIONS.map(r=>React.createElement('option',{key:r},r)))),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-12'},'Access Level'),React.createElement('select',{id:'f-12',className:'form-control',value:form.access,onChange:fc('access')},['Full','Editor','Viewer','No Access'].map(a=>React.createElement('option',{key:a},a))))
        ),
        React.createElement('div',{className:'form-row cols2'},
          // Existing passwords can't be shown — they are stored only as one-way hashes. 👁 shows what
          // is being typed here; on Edit, a new password replaces the old one (set-user-password).
          React.createElement('div',{className:'form-group'},React.createElement('label',null,editId?'New Password (leave blank to keep current)':'Password *'),
            React.createElement('div',{style:{position:'relative'}},
              React.createElement('input',{type:showFormPass?'text':'password',className:'form-control',autoComplete:'new-password',placeholder:editId?'Type a new password to change it':'At least 8 characters',value:form.password,onChange:fc('password'),style:{paddingRight:40}}),
              React.createElement('button',{type:'button',title:showFormPass?'Hide password':'Show password','aria-label':showFormPass?'Hide password':'Show password',onClick:()=>setShowFormPass(s=>!s),style:{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:14}},showFormPass?'🙈':'👁')
            ),
            editId&&React.createElement('div',{style:{fontSize:11,color:'var(--text3)',marginTop:4}},'Current passwords can\'t be viewed (stored encrypted). Set a new one here and share it with the user.')),
          React.createElement('div',{className:'form-group'},React.createElement('label',{htmlFor:'f-13'},'Status'),React.createElement('select',{id:'f-13',className:'form-control',value:form.status,onChange:fc('status')},['Active','Inactive'].map(s=>React.createElement('option',{key:s},s))))
        ),
        React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'18px 0 10px',paddingTop:14,borderTop:'1px solid var(--border)'}},'Outlet Access'),
        form.role==='Super Admin'
          ?React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',background:'var(--bg3)',padding:'10px 14px',borderRadius:'var(--r)',marginBottom:14}},'Super Admin always sees every outlet — the table below doesn\'t apply to this role.')
          :React.createElement(React.Fragment,null,
              React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10,lineHeight:1.5}},'Choose how much access this user gets, outlet by outlet. "View Only" lets them see that outlet\'s data; "View and Edit" lets them add, change, or delete it; "No Access" hides that outlet from them entirely — they won\'t be able to switch into it at all. This is separate from Sheet-wise Access below, which controls what they can do once inside whichever outlet they\'re in.'),
              salonsList.length===0
                ?React.createElement('div',{style:{fontSize:12,color:'var(--text3)'}},'No outlets exist yet — add one under Master Sheet first.')
                :React.createElement(React.Fragment,null,
                    React.createElement('div',{style:{display:'flex',gap:8,marginBottom:10}},
                      React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:()=>bulkSetOutlets('View and Edit')},'Grant Edit to All'),
                      React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:()=>bulkSetOutlets('View Only')},'Grant View Only to All'),
                      React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:()=>bulkSetOutlets('No Access')},'Clear All')
                    ),
                    React.createElement('div',{style:{maxHeight:200,overflowY:'auto',border:'1px solid var(--border)',borderRadius:'var(--r)'}},
                      React.createElement('table',null,
                        React.createElement('thead',null,React.createElement('tr',null,
                          React.createElement('th',{style:{position:'sticky',top:0}},'Outlet'),
                          React.createElement('th',{style:{position:'sticky',top:0}},'Access Level')
                        )),
                        React.createElement('tbody',null,salonsList.map(s=>{
                          const level=form.outletAccess[s.id]||'No Access';
                          return React.createElement('tr',{key:s.id},
                            React.createElement('td',null,s.name),
                            React.createElement('td',null,React.createElement('select',{className:'form-control',style:{fontSize:12,padding:'4px 8px'},value:level,onChange:e=>setOutletLevel(s.id,e.target.value)},
                              OUTLET_ACCESS_LEVELS.map(l=>React.createElement('option',{key:l},l))
                            ))
                          );
                        }))
                      )
                    )
                  ),
              outletIdsFromAccess(form.outletAccess).length===0&&salonsList.length>0&&React.createElement('div',{style:{fontSize:11,color:'var(--orange)',marginTop:8}},'⚠ No outlets granted — this user won\'t be able to enter any outlet until at least one is set to View Only or View and Edit.')
            ),
        form.role==='Super Admin'
          ?React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',background:'var(--bg3)',padding:'10px 14px',borderRadius:'var(--r)',marginBottom:14}},'Super Admin always has Edit access to every sheet — the matrix below doesn\'t apply to this role.')
          :grantedOutletIds.length===0
          ?React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',background:'var(--bg3)',padding:'10px 14px',borderRadius:'var(--r)',marginBottom:14}},'Grant this user access to at least one outlet above first — sheet access is set separately for each outlet.')
          :React.createElement(React.Fragment,null,
              React.createElement('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:10,lineHeight:1.5}},'Choose how much access this user gets, sheet by sheet — set independently for each outlet, so the same person can be full Edit at one outlet and View Only (or nothing) at another. "View Only" lets them see the data; "Edit" lets them add, change, or delete it; "No Access" hides that sheet from them entirely.'),
              React.createElement('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}},
                grantedOutletIds.map(id=>{
                  const s=salonsList.find(x=>x.id===id);
                  const count=Object.values(form.sheetAccessByOutlet[id]||{}).filter(v=>v&&v!=='No Access').length;
                  return React.createElement('button',{key:id,type:'button',
                    className:'btn btn-sm '+(selectedSheetOutlet===id?'btn-primary':'btn-ghost'),
                    onClick:()=>setSelectedSheetOutlet(id)
                  },(s?s.name:'Outlet '+id)+(count?' ('+count+')':''));
                })
              ),
              React.createElement('div',{style:{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}},
                React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:()=>bulkSetAll('Edit')},'Grant Edit to All'),
                React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:()=>bulkSetAll('View Only')},'Grant View Only to All'),
                React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:()=>bulkSetAll('No Access')},'Clear All'),
                checkedSheets.size>0&&React.createElement(React.Fragment,null,
                  React.createElement('span',{style:{fontSize:11,color:'var(--text3)',alignSelf:'center'}},'|  '+checkedSheets.size+' selected:'),
                  React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:()=>bulkSetAll('Edit',[...checkedSheets])},'→ Edit'),
                  React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:()=>bulkSetAll('View Only',[...checkedSheets])},'→ View Only'),
                  React.createElement('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:()=>bulkSetAll('No Access',[...checkedSheets])},'→ No Access')
                )
              ),
              React.createElement('div',{style:{maxHeight:260,overflowY:'auto',border:'1px solid var(--border)',borderRadius:'var(--r)'}},
                React.createElement('table',null,
                  React.createElement('thead',null,React.createElement('tr',null,
                    React.createElement('th',{style:{position:'sticky',top:0,width:36}},React.createElement('input',{type:'checkbox',checked:allSheetsChecked,onChange:toggleAllSheetsChecked})),
                    React.createElement('th',{style:{position:'sticky',top:0}},'Sheet'),
                    React.createElement('th',{style:{position:'sticky',top:0}},'Access Level')
                  )),
                  React.createElement('tbody',null,PERMISSION_SHEETS.map(s=>{
                    const level=sheetAccessForSelected()[s.id]||'No Access';
                    return React.createElement('tr',{key:s.id},
                      React.createElement('td',null,React.createElement('input',{type:'checkbox',checked:checkedSheets.has(s.id),onChange:()=>toggleSheetChecked(s.id)})),
                      React.createElement('td',null,s.label),
                      React.createElement('td',null,React.createElement('select',{className:'form-control',style:{fontSize:12,padding:'4px 8px'},value:level,onChange:e=>setSheetLevel(s.id,e.target.value)},
                        PERMISSION_LEVELS.map(l=>React.createElement('option',{key:l},l))
                      ))
                    );
                  }))
                )
              )
            ),

        React.createElement('div',{style:{fontSize:11,color:'var(--text3)',margin:'14px 0',lineHeight:1.5}},'This is a real account — it can log in with the email and password set here, and shows up on the Login screen immediately.'),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowModal(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary'+(cloudBusy?' btn-loading':''),disabled:cloudBusy,onClick:save},editId?'Save Changes':'Create User')
        )
      )
    ),
    showDelete&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShowDelete(null)},
      React.createElement('div',{className:'modal',style:{width:420},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Remove User'),
        CLOUD_SYNC_ENABLED
          ?React.createElement('div',{style:{fontSize:13,color:'var(--text2)',marginBottom:16,lineHeight:1.6}},
            'Remove "'+showDelete.name+'" ('+showDelete.email+')?',React.createElement('br'),
            React.createElement('b',null,'Deactivate'),' — they can\'t log in, but the account stays and can be reactivated any time.',React.createElement('br'),
            React.createElement('b',{style:{color:'var(--red)'}},'Delete permanently'),' — the login is erased and can\'t be undone. The data they entered stays.')
          :React.createElement('div',{style:{fontSize:13,color:'var(--text2)',marginBottom:16}},'Remove "'+showDelete.name+'" ('+showDelete.email+')? They\'ll no longer be able to log in.'),
        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowDelete(null)},'Cancel'),
          CLOUD_SYNC_ENABLED&&React.createElement('button',{className:'btn btn-ghost',disabled:cloudBusy,onClick:()=>removeUser(showDelete.id,false)},'Deactivate'),
          React.createElement('button',{className:'btn btn-sm'+(cloudBusy?' btn-loading':''),disabled:cloudBusy,style:{background:'rgba(255,107,107,0.15)',border:'1px solid rgba(255,107,107,0.4)',color:'var(--red)',padding:'8px 16px',borderRadius:'var(--r)',cursor:'pointer',fontWeight:600},onClick:()=>removeUser(showDelete.id,true)},CLOUD_SYNC_ENABLED?'Delete permanently':'Remove')
        )
      )
    )
  );
}

// ── Data-gap alerts — what's missing in the last 7 days (up to yesterday, this month only):
// days where attendance isn't marked for every active employee, and days with no daily sales
// entered. Shown per outlet (with a button to the sheet) and summarised on the Master Dashboard. ──
function dataGapsFor(salon){
  const sid=Number(salon&&salon.id);
  const gaps=[];
  if(!sid)return gaps;
  const today=new Date();
  const days=[];
  for(let back=1;back<=7;back++){
    const d=new Date(today.getFullYear(),today.getMonth(),today.getDate()-back);
    if(d.getMonth()!==today.getMonth())break;
    days.push(d);
  }
  if(!days.length)return gaps;
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const fmt=d=>d.getDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  const list=ds=>ds.length>3?ds.length+' days ('+fmt(ds[ds.length-1])+' – '+fmt(ds[0])+')':ds.map(fmt).reverse().join(', ');
  // Attendance
  try{
    const emps=getEmployeesForMonth(today.getFullYear(),today.getMonth(),sid).filter(e=>e.status==='Active');
    if(emps.length){
      const att=loadAttendance(sid);
      const missing=days.filter(d=>emps.some(e=>{
        if(e.doj&&new Date(e.doj)>d)return false; // not joined yet
        const rec=att[attMonthKey(e.id,d.getFullYear(),d.getMonth())];
        return !(rec&&Array.isArray(rec.days)&&rec.days[d.getDate()-1]);
      }));
      if(missing.length)gaps.push({kind:'attendance',tab:'attendance',text:'Attendance not fully marked: '+list(missing)});
    }
  }catch(e){}
  // Daily sales
  try{
    const sales=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',sid))||'{}')||{}; // sales & collection (the other daily record is expenses)
    const missing=days.filter(d=>{const v=sales[iso(d)];return !(v&&typeof v==='object'&&Object.keys(v).length);});
    if(missing.length)gaps.push({kind:'sales',tab:'daily-sales',text:'No daily sales entered: '+list(missing)});
  }catch(e){}
  return gaps;
}
function DataGapsCard({salon,onNavTab}){
  const gaps=dataGapsFor(salon);
  if(!gaps.length)return null;
  return React.createElement('div',{className:'card',style:{marginBottom:16,borderColor:'var(--orange)'}},
    React.createElement('div',{className:'card-title'},'⚠️ Needs attention'),
    gaps.map((g,i)=>React.createElement('div',{key:i,style:{display:'flex',alignItems:'center',gap:12,padding:'8px 0',borderTop:i?'1px solid var(--border)':'none'}},
      React.createElement('div',{style:{flex:1,fontSize:13,color:'var(--text)'}},g.text),
      onNavTab&&React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>onNavTab(g.tab)},g.kind==='sales'?'Enter sales':'Mark attendance')))
  );
}
// ── "Get this outlet ready" checklist on the outlet dashboard — each step is detected from the
// outlet's real data, links straight to the sheet that completes it, and the card disappears
// once everything's done (or when dismissed on this device). ──
function OutletSetupChecklist({salon,onNavTab}){
  const sid=Number(salon&&salon.id)||1;
  const dismissKey='sos_setup_dismissed_'+sid; // device-only preference, deliberately not synced
  const [dismissed,setDismissed]=useState(()=>{try{return localStorage.getItem(dismissKey)==='1';}catch(e){return false;}});
  const readJson=(k,d)=>{try{return JSON.parse(cachedLocalGet(k)||'null')||d;}catch(e){return d;}};
  const emps=loadEmployees(sid)||[];
  const att=readJson(attKeyFor(sid),{});
  const sales=readJson(outletKey('salonos_daily_sales_collection_data',sid),{}); // sales & collection, not expenses
  // Weekly offs / holidays can be filled in automatically, so only a real mark counts.
  const hasAttendance=Object.values(att).some(r=>r&&Array.isArray(r.days)&&r.days.some(d=>d&&d!=='off'&&d!=='holiday'));
  const hasSales=Object.values(sales).some(day=>day&&typeof day==='object'&&Object.keys(day).length>0);
  const steps=[
    {done:emps.length>0,label:'Add your staff',hint:'Name, designation, joining date and Aadhaar for each employee.',tab:'master-salary',cta:'Add staff'},
    {done:emps.some(e=>Number(e.gross)>0),label:'Set salary structures',hint:'Basic, HRA and allowances — used for salary working and P&L.',tab:'master-salary',cta:'Set salaries'},
    {done:hasAttendance,label:'Start marking attendance',hint:'Mark each day as it happens; salary working uses it.',tab:'attendance',cta:'Open attendance'},
    {done:hasSales,label:'Enter daily sales & expenses',hint:'Daily sales and cash drive the dashboard and P&L.',tab:'daily-sales',cta:'Enter sales'}
  ];
  const doneCount=steps.filter(s=>s.done).length;
  if(dismissed||doneCount===steps.length)return null;
  const next=steps.find(s=>!s.done);
  return React.createElement('div',{className:'card',style:{marginBottom:16,borderColor:'var(--accent)'}},
    React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:10}},
      React.createElement('div',{className:'card-title',style:{marginBottom:0}},'🚀 Get this outlet ready — '+doneCount+' of '+steps.length+' done'),
      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>{try{localStorage.setItem(dismissKey,'1');}catch(e){}setDismissed(true);}},'Hide')),
    React.createElement('div',{style:{height:6,background:'var(--bg3)',borderRadius:3,marginBottom:12,overflow:'hidden'}},
      React.createElement('div',{style:{height:'100%',width:(doneCount/steps.length*100)+'%',background:'var(--green)',transition:'width .3s'}})),
    steps.map((s,i)=>React.createElement('div',{key:i,style:{display:'flex',alignItems:'center',gap:12,padding:'8px 0',borderTop:i?'1px solid var(--border)':'none'}},
      React.createElement('span',{style:{width:22,height:22,borderRadius:'50%',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,
        background:s.done?'var(--green)':'var(--bg3)',color:s.done?'#fff':'var(--text3)'}},s.done?'✓':String(i+1)),
      React.createElement('div',{style:{flex:1,minWidth:0}},
        React.createElement('div',{style:{fontSize:13.5,color:s.done?'var(--text3)':'var(--text)',textDecoration:s.done?'line-through':'none',fontWeight:500}},s.label),
        !s.done&&React.createElement('div',{style:{fontSize:12,color:'var(--text3)'}},s.hint)),
      !s.done&&onNavTab&&React.createElement('button',{className:'btn btn-sm '+(s===next?'btn-primary':'btn-ghost'),onClick:()=>onNavTab(s.tab)},s.cta)))
  );
}