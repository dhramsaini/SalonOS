

// ── Small consistent line-icon set for the topbar (Feather-style, 24x24, stroke=currentColor) —
// replaces mismatched emoji so every action reads at the same visual weight. ──
function TopIcon({children,size=15}){
  return React.createElement('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round',strokeLinejoin:'round'},children);
}
const IconRefresh=(p)=>React.createElement(TopIcon,p,
  React.createElement('polyline',{points:'23 4 23 10 17 10'}),
  React.createElement('polyline',{points:'1 20 1 14 7 14'}),
  React.createElement('path',{d:'M3.51 9a9 9 0 0114.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0020.49 15'})
);
const IconSave=(p)=>React.createElement(TopIcon,p,
  React.createElement('path',{d:'M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z'}),
  React.createElement('polyline',{points:'17 21 17 13 7 13 7 21'}),
  React.createElement('polyline',{points:'7 3 7 8 15 8'})
);
const IconSun=(p)=>React.createElement(TopIcon,p,
  React.createElement('circle',{cx:12,cy:12,r:5}),
  React.createElement('path',{d:'M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42'})
);
const IconMoon=(p)=>React.createElement(TopIcon,p,React.createElement('path',{d:'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z'}));
const IconSearch=(p)=>React.createElement(TopIcon,p,
  React.createElement('circle',{cx:11,cy:11,r:8}),
  React.createElement('line',{x1:21,y1:21,x2:16.65,y2:16.65})
);
const IconLogOut=(p)=>React.createElement(TopIcon,p,
  React.createElement('path',{d:'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4'}),
  React.createElement('polyline',{points:'16 17 21 12 16 7'}),
  React.createElement('line',{x1:21,y1:12,x2:9,y2:12})
);
const IconDatabase=(p)=>React.createElement(TopIcon,p,
  React.createElement('ellipse',{cx:12,cy:5,rx:9,ry:3}),
  React.createElement('path',{d:'M21 12c0 1.66-4 3-9 3s-9-1.34-9-3'}),
  React.createElement('path',{d:'M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5'})
);
const IconTrash=(p)=>React.createElement(TopIcon,p,
  React.createElement('polyline',{points:'3 6 5 6 21 6'}),
  React.createElement('path',{d:'M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2'}),
  React.createElement('line',{x1:10,y1:11,x2:10,y2:17}),
  React.createElement('line',{x1:14,y1:11,x2:14,y2:17})
);

// ── Shared dynamic chart primitives ─────────────────────────────────────────────────────
// Grouped/animated bar chart with gridlines and a hover tooltip. `data` is an array of
// {[labelKey]:string, [key]:number,...}; `series` (optional) lets multiple keys render as
// grouped bars side by side, e.g. Revenue vs Expense. Bars grow in from 0 on mount and each
// bar reports its exact value on hover instead of forcing the user to eyeball bar height.
function DynamicBarChart({data,series,height=160,color,color2,formatValue,highlightLast,valueKey='value',labelKey='label'}){
  const ser=(series&&series.length)?series:[{key:valueKey,label:'',color:color||'var(--accent)',color2:color2||color||'var(--accent2)'}];
  const [hover,setHover]=useState(null);
  const [mounted,setMounted]=useState(false);
  const wrapRef=useRef(null);
  useEffect(()=>{const t=setTimeout(()=>setMounted(true),30);return()=>clearTimeout(t);},[]);
  const max=Math.max(1,...data.flatMap(d=>ser.map(s=>d[s.key]||0)));
  const fmt=formatValue||(v=>'₹'+Math.round(v).toLocaleString('en-IN'));
  const onEnter=(e,d,s,val)=>{
    const r=e.currentTarget.getBoundingClientRect();
    const pr=wrapRef.current.getBoundingClientRect();
    setHover({x:r.left-pr.left+r.width/2,y:r.top-pr.top,label:d[labelKey],sLabel:s.label,val});
  };
  return React.createElement('div',{className:'dchart-wrap',ref:wrapRef},
    ser.length>1&&React.createElement('div',{style:{display:'flex',gap:14,marginBottom:8,flexWrap:'wrap'}},
      ser.map(s=>React.createElement('div',{key:s.key,style:{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--text2)'}},
        React.createElement('span',{style:{width:9,height:9,borderRadius:3,background:s.color,display:'inline-block'}}),
        s.label
      ))
    ),
    React.createElement('div',{style:{position:'relative',height}},
      [0,0.25,0.5,0.75,1].map(g=>React.createElement('div',{key:g,className:'dchart-grid-line',style:{bottom:g*100+'%'}})),
      React.createElement('div',{className:'dchart-bars',style:{height:'100%'}},
        data.map((d,i)=>React.createElement('div',{key:i,className:'dchart-bar-col'},
          React.createElement('div',{className:'dchart-bar-group'},
            ser.map((s,si)=>{
              const val=d[s.key]||0;
              const pct=mounted?(val>0?Math.max(1.5,(val/max)*100):0):0;
              const isLast=highlightLast&&si===0&&i===data.length-1;
              const grad=isLast?'linear-gradient(to top,var(--accent),var(--accent2))':`linear-gradient(to top,${s.color},${s.color2||s.color})`;
              return React.createElement('div',{
                key:s.key,className:'dchart-bar',
                style:{height:pct+'%',background:grad,transitionDelay:Math.min(i*0.02,0.4)+'s'},
                onMouseEnter:(e)=>onEnter(e,d,s,val),
                onMouseLeave:()=>setHover(null)
              });
            })
          )
        ))
      )
    ),
    React.createElement('div',{style:{display:'flex',gap:6,marginTop:6}},
      data.map((d,i)=>React.createElement('div',{key:i,className:'dchart-xlabel',style:{flex:1}},d[labelKey]))
    ),
    hover&&React.createElement('div',{className:'dchart-tooltip show',style:{left:hover.x,top:hover.y}},
      React.createElement('div',{className:'dt-label'},hover.label+(hover.sLabel?' · '+hover.sLabel:'')),
      React.createElement('div',{className:'dt-val'},fmt(hover.val))
    )
  );
}

// Animated SVG donut chart — replaces flat horizontal "mix" bars with a real ring chart.
// Segments sweep in on mount, hovering a slice (or its legend row) highlights it and swaps
// the center label for that slice's share of the total.
function DynamicDonutChart({segments,size=150,thickness=20,formatValue,centerLabel}){
  const [hover,setHover]=useState(null);
  const [mounted,setMounted]=useState(false);
  useEffect(()=>{const t=setTimeout(()=>setMounted(true),30);return()=>clearTimeout(t);},[]);
  // realTotal is what's actually shown (so an empty chart honestly reads ₹0, not a fake ₹1);
  // total stays floored to 1 only to keep the arc-angle and percentage math below from dividing by zero.
  const realTotal=segments.reduce((s,x)=>s+(x.value||0),0);
  const total=Math.max(1,realTotal);
  const r=(size-thickness)/2,C=2*Math.PI*r;
  const fmt=formatValue||(v=>'₹'+Math.round(v).toLocaleString('en-IN'));
  let acc=0;
  return React.createElement('div',{className:'dchart-wrap',style:{display:'flex',gap:20,alignItems:'center',flexWrap:'wrap'}},
    React.createElement('div',{style:{position:'relative',width:size,height:size,flexShrink:0}},
      React.createElement('svg',{width:size,height:size,viewBox:`0 0 ${size} ${size}`,style:{transform:'rotate(-90deg)'}},
        React.createElement('circle',{cx:size/2,cy:size/2,r,fill:'none',stroke:'var(--bg3)',strokeWidth:thickness}),
        segments.map((seg,i)=>{
          const val=seg.value||0,frac=val/total,len=mounted?frac*C:0,off=acc;
          acc+=frac*C;
          return React.createElement('circle',{
            key:i,className:'donut-seg',cx:size/2,cy:size/2,r,fill:'none',
            stroke:seg.color,strokeWidth:hover===i?thickness+3:thickness,
            strokeDasharray:`${len} ${C-len}`,strokeDashoffset:-off,
            strokeLinecap:segments.length>1?'butt':'round',
            opacity:hover!==null&&hover!==i?0.4:1,
            onMouseEnter:()=>setHover(i),onMouseLeave:()=>setHover(null)
          });
        })
      ),
      React.createElement('div',{style:{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center',pointerEvents:'none'}},
        hover!==null?React.createElement(React.Fragment,null,
          React.createElement('div',{style:{fontSize:11,color:'var(--text3)'}},segments[hover].label),
          React.createElement('div',{style:{fontSize:16,fontWeight:700,fontFamily:'var(--font2)',color:segments[hover].color}},Math.round(segments[hover].value/total*100)+'%')
        ):React.createElement(React.Fragment,null,
          centerLabel&&React.createElement('div',{style:{fontSize:10,color:'var(--text3)'}},centerLabel),
          React.createElement('div',{style:{fontSize:15,fontWeight:700,fontFamily:'var(--font2)',color:'var(--text)'}},fmt(realTotal))
        )
      )
    ),
    React.createElement('div',{style:{flex:1,minWidth:140}},
      segments.map((seg,i)=>React.createElement('div',{key:i,className:'donut-legend-item',onMouseEnter:()=>setHover(i),onMouseLeave:()=>setHover(null),style:{opacity:hover!==null&&hover!==i?0.5:1}},
        React.createElement('div',{className:'donut-legend-dot',style:{background:seg.color}}),
        React.createElement('div',{style:{flex:1,fontSize:12,color:'var(--text2)'}},seg.label),
        React.createElement('div',{style:{fontSize:12,fontWeight:600,color:'var(--text)'}},Math.round((seg.value/total)*100)+'%')
      ))
    )
  );
}


// data getters (getBodyHtml for PDF/Word, getSheetRows for Excel — a plain array-of-arrays,
// header row first) and it opens one clean modal: pick a format (PDF/Word/Excel), then pick how
// to send it — WhatsApp, Email, or the device's own share sheet. WhatsApp/Email ask for an
// optional recipient and open that exact chat or draft with the file downloaded and ready to
// attach — no browser lets a website attach a file to a specific recipient automatically, that's
// a hard OS/browser restriction, so this gets the person as close to "done" as the platform
// allows rather than pretending otherwise. ──
// ── Draft / Final watermark — a faint repeating diagonal word over a working sheet (pointer
// events pass through). Draft until the month is marked final (locked), then Final. ──
function WatermarkOverlay({text,final}){
  const col=final?'rgba(22,163,74,0.10)':'rgba(220,38,38,0.09)';
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240"><text x="180" y="130" text-anchor="middle" font-family="Arial,sans-serif" font-size="64" font-weight="700" fill="'+col+'" transform="rotate(-28 180 120)">'+text+'</text></svg>';
  return React.createElement('div',{'aria-hidden':true,style:{position:'absolute',inset:0,pointerEvents:'none',zIndex:3,
    backgroundImage:'url("data:image/svg+xml;utf8,'+encodeURIComponent(svg)+'")',backgroundRepeat:'repeat'}});
}
// P&L (Monthly) "final" per outlet and month: {'<fy>|<mi>':{final:true,by,at}}.
function loadPnlFinal(sid){try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_pnl_final',sid))||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}}
function isPnlFinal(sid,fy,mi){return !!(loadPnlFinal(sid)[fy+'|'+mi]||{}).final;}
function setPnlFinal(sid,fy,mi,final){
  const all=loadPnlFinal(sid),u=currentSessionUser();
  if(final)all[fy+'|'+mi]={final:true,by:(u&&(u.name||u.email))||'',at:new Date().toISOString()};else delete all[fy+'|'+mi];
  safeLocalSet(outletKey('salonos_pnl_final',sid),JSON.stringify(all));
}
function WatermarkBadge({final,hint}){
  return React.createElement('span',{className:'badge '+(final?'badge-green':'badge-red'),title:hint||'',style:{fontSize:11,marginLeft:8,verticalAlign:'middle'}},final?'FINAL':'DRAFT');
}
// watermark: 'DRAFT' | 'FINAL' (optional) — stamped on every format and added to the file name.
function ShareReportButton({title,subtitle,getBodyHtml,getSheetRows,execSummary,landscape,buildExcelBlob,buildPdfBlob,watermark}){
  const {toast}=useToast();
  if(watermark)title=title+' ('+(watermark==='FINAL'?'Final':'Draft')+')';
  const [show,setShow]=useState(false);
  const [busy,setBusy]=useState(false);
  const [format,setFormat]=useState('pdf');
  const [channel,setChannel]=useState('device'); // 'device' | 'wa' | 'email'
  const [recipient,setRecipient]=useState('');
  const printOpts={execSummary,landscape,watermark};

  const safeName=title.replace(/[^a-z0-9]+/gi,'_').replace(/^_+|_+$/g,'')||'Report';
  const openModal=()=>{setShow(true);setFormat('pdf');setChannel('device');setRecipient('');loadScript(CDN_XLSX_URL).catch(()=>{});loadScript(CDN_JSPDF_URL).then(()=>loadScript(CDN_JSPDF_AUTOTABLE_URL)).catch(()=>{});};
  // One real file per format, usable everywhere — Device Share, Download, WhatsApp, or Email.
  // PDF used to be a special case (print-dialog only, no real file, silently downgraded to Word
  // whenever sent to WhatsApp/Email) — now it's a real Blob like the other two, built straight
  // from the same sheetRows data Excel already uses. If the caller passes buildExcelBlob and/or
  // buildPdfBlob (e.g. Salary Working / Incentive Working / Collection Sheet, which export live
  // formulas or per-cell colour-coding the generic static-values exporter can't do), those are
  // used instead of the generic exporter for that format.
  const buildBlobFor=async(fmt)=>{
    if(fmt==='excel'){const b=buildExcelBlob?await buildExcelBlob():await exportReportExcelBlob(title,getSheetRows());return{blob:watermark?await stampExcelBlob(b,watermark):b,filename:safeName+'.xlsx'};}
    if(fmt==='pdf')return{blob:buildPdfBlob?await buildPdfBlob():await exportReportPdfBlob(title,subtitle,getSheetRows(),{landscape,watermark}),filename:safeName+'.pdf'};
    if(fmt==='html')return{blob:exportReportHtmlBlob(title,subtitle,getBodyHtml(),printOpts),filename:safeName+'.html'};
    return{blob:exportReportWordBlob(title,subtitle,getBodyHtml(),printOpts),filename:safeName+'.doc'};
  };
  const downloadBlob=(blob,filename)=>{
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
  };

  const go=async()=>{
    // Reserve the popup window SYNCHRONOUSLY, before any await — this is the one thing that
    // actually matters here. Calling window.open() after an await (even a fast one, like
    // building a blob) loses the browser's "this came directly from a click" status, and every
    // major browser then silently blocks it. No error, no toast, it just never opens. Reserving
    // a blank tab right now, then pointing it at the real URL once the file's ready, is the
    // standard fix and the only reliable one — there is no way to "ask" the browser to allow a
    // delayed popup once that window has closed.
    let reservedWaTab=null;
    if(channel==='wa'){
      reservedWaTab=window.open('','_blank');
      if(!reservedWaTab){
        toast('Your browser is blocking pop-ups for this site — allow pop-ups here, then try again','error');
        return;
      }
    }
    setBusy(true);
    try{
      const{blob,filename}=await buildBlobFor(format);
      if(channel==='download'){
        if(reservedWaTab)reservedWaTab.close();
        downloadBlob(blob,filename);
        toast(filename+' downloaded','success');
        setShow(false);setBusy(false);return;
      }
      const digits=recipient.replace(/[^\d+]/g,'').replace(/^\+/,'');
      if(channel==='wa'&&digits){
        downloadBlob(blob,filename);
        const waUrl='https://wa.me/'+digits+'?text='+encodeURIComponent(title+' — attaching '+filename);
        if(reservedWaTab&&!reservedWaTab.closed)reservedWaTab.location.href=waUrl;
        else window.open(waUrl,'_blank','noopener,noreferrer'); // reservation failed (e.g. popup blocker already on) — try anyway
        toast(filename+' downloaded — attach it in the WhatsApp chat that just opened','success');
      }else if(channel==='email'&&recipient.trim()){
        if(reservedWaTab)reservedWaTab.close();
        downloadBlob(blob,filename);
        window.location.href='mailto:'+encodeURIComponent(recipient.trim())+'?subject='+encodeURIComponent(title)+'&body='+encodeURIComponent('Attaching '+filename+' — please attach the file just downloaded.');
        toast(filename+' downloaded — attach it in the email draft that just opened','success');
      }else{
        if(reservedWaTab)reservedWaTab.close();
        const result=await shareOrDownload(blob,filename,{whatsappText:'Sharing: '+title,emailSubject:title});
        if(result==='shared')toast('Shared successfully','success');
        else if(result&&result.fallback){
          if(channel==='wa')window.open(result.waUrl,'_blank','noopener,noreferrer');
          else if(channel==='email')window.location.href=result.mailUrl;
          toast(filename+' downloaded','success');
        }
      }
      setShow(false);
    }catch(e){
      if(reservedWaTab)reservedWaTab.close();
      toast(e.message||'Could not prepare the file — please try again','error');
    }
    setBusy(false);
  };

  const FORMATS=[['pdf','📄','PDF'],['word','📝','Word'],['excel','📊','Excel'],['html','🌐','HTML']];
  const CHANNELS=[['download','⬇','Download'],['device','📱','Device Share'],['wa','💬','WhatsApp'],['email','📧','Email']];
  const primaryLabel=channel==='wa'?'Send on WhatsApp':channel==='email'?'Send by Email':channel==='download'?'Download':'Download & Share';

  return React.createElement(React.Fragment,null,
    React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:openModal},'📤 Share'),
    show&&React.createElement('div',{className:'modal-overlay',onClick:()=>setShow(false)},
      React.createElement('div',{className:'modal',style:{width:460},onClick:e=>e.stopPropagation()},
        React.createElement('div',{className:'modal-title'},'Share Report'),
        React.createElement('div',{style:{fontSize:12.5,color:'var(--text2)',marginTop:-12,marginBottom:18}},title),

        React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}},'Format'),
        React.createElement('div',{style:{display:'flex',gap:8,marginBottom:20}},
          FORMATS.map(([k,icon,label])=>React.createElement('button',{key:k,
            onClick:()=>setFormat(k),
            style:{flex:1,padding:'12px 8px',borderRadius:10,border:'1.5px solid '+(format===k?'var(--accent)':'var(--border2)'),background:format===k?'rgba(47,95,224,0.12)':'var(--bg3)',cursor:'pointer',textAlign:'center',transition:'all 0.15s'}},
            React.createElement('div',{style:{fontSize:20,marginBottom:4}},icon),
            React.createElement('div',{style:{fontSize:11.5,fontWeight:format===k?700:500,color:format===k?'var(--accent)':'var(--text2)'}},label)
          ))
        ),

        React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}},'Send via'),
        React.createElement('div',{style:{display:'flex',gap:8,marginBottom:channel==='device'?20:14}},
          CHANNELS.map(([k,icon,label])=>React.createElement('button',{key:k,
            onClick:()=>setChannel(k),
            style:{flex:1,padding:'12px 8px',borderRadius:10,border:'1.5px solid '+(channel===k?'var(--accent)':'var(--border2)'),background:channel===k?'rgba(47,95,224,0.12)':'var(--bg3)',cursor:'pointer',textAlign:'center',transition:'all 0.15s'}},
            React.createElement('div',{style:{fontSize:20,marginBottom:4}},icon),
            React.createElement('div',{style:{fontSize:11.5,fontWeight:channel===k?700:500,color:channel===k?'var(--accent)':'var(--text2)'}},label)
          ))
        ),

        (channel==='wa'||channel==='email')&&React.createElement('div',{style:{marginBottom:16}},
          React.createElement('label',null,channel==='wa'?'Phone number (with country code)':'Email address',
            React.createElement('span',{style:{color:'var(--text3)',fontWeight:400}},' — optional')),
          React.createElement('input',{className:'form-control',value:recipient,onChange:e=>setRecipient(e.target.value),autoFocus:true,
            placeholder:channel==='wa'?'e.g. 919876543210':'e.g. client@example.com'}),
          React.createElement('div',{style:{fontSize:10.5,color:'var(--text3)',marginTop:6,lineHeight:1.5}},
            recipient.trim()
              ?'Downloads the file and opens '+(channel==='wa'?'that WhatsApp chat':'a draft to that address')+' — attach it there.'
              :'Leave blank to use your device\'s share sheet instead.')
        ),

        React.createElement('div',{className:'modal-actions'},
          React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShow(false)},'Cancel'),
          React.createElement('button',{className:'btn btn-primary',disabled:busy,onClick:go},busy?'Working…':primaryLabel)
        )
      )
    )
  );
}

// SALONS is the one real, shared list of outlets — every outlet selector in the app reads this
// same array. It used to be a frozen const seeded with 4 demo outlets, and the "Master Sheet"
// Add/Edit/Delete UI actually mutated a completely separate, disconnected, unpersisted copy —
// meaning adding a salon there never actually added a usable outlet anywhere else in the app,
// and reloading always reset back to the same 4 demo entries. Fixed: SALONS now persists to
// localStorage, starts empty (no demo data), and is kept in sync with the Master Sheet UI via
// setSalonsAndSync() in the App component below — mutating this array in place (not
// reassigning) so every place that already holds a reference to it sees updates immediately.
// Government-portal logins (GST / PF / ESIC / TDS / PT login IDs and passwords) are kept out of
// the outlet list, which every user can read, in a separate record the database lets only Super
// Admins read or change (salonos_secret_*). They're merged back in here for whoever can see them.
const PORTAL_SECRETS_KEY='salonos_secret_portal_logins';
const isPortalSecretField=k=>/(Password|LoginId)$/.test(k);
function loadSalonsFromStorage(){
  try{
    const v=JSON.parse(cachedLocalGet('salonos_salons')||'[]');
    if(Array.isArray(v)){
      let sec={};try{sec=JSON.parse(cachedLocalGet(PORTAL_SECRETS_KEY)||'{}')||{};}catch(e){}
      return v.map(s=>sec[s.id]?{...s,...sec[s.id]}:s);
    }
  }catch(e){}
  return[];
}
function saveSalonsToStorage(list){
  const pub=[],sec={};
  list.forEach(s=>{
    const p={};
    Object.keys(s).forEach(k=>{if(isPortalSecretField(k)){if(String(s[k]||'')!==''){(sec[s.id]=sec[s.id]||{})[k]=s[k];}}else p[k]=s[k];});
    pub.push(p);
  });
  safeLocalSet('salonos_salons',JSON.stringify(pub));
  if(Object.keys(sec).length||cachedLocalGet(PORTAL_SECRETS_KEY)!=null)safeLocalSet(PORTAL_SECRETS_KEY,JSON.stringify(sec));
}
const SALONS=loadSalonsFromStorage();
// Which outlets a login may open — the same rule the database enforces (salonos_key_access):
// Super Admin sees every outlet; everyone else (Reviewer included) only the outlets User
// Management gives them ("View Only" or "View and Edit"), falling back to outlet_ids for
// accounts saved before outlet-wise access existed.
function userCanSeeOutlet(u,outletId){
  if(!u)return false;
  if(u.role==='Super Admin')return true;
  const oa=u.outletAccess&&Object.keys(u.outletAccess).length?u.outletAccess:null;
  if(oa){const lvl=oa[String(outletId)];return !!lvl&&lvl!=='No Access';}
  return(u.outletIds||[]).map(String).includes(String(outletId));
}
// Can this user change this sheet on this outlet? Same rule as the database's write check
// (salonos_key_access): outlet level must be View and Edit, never for Reviewer / Owner roles, and
// the sheet itself not set below Edit in User Management.
function userCanEditSheet(u,outletId,sheetId){
  if(!u)return false;
  if(u.role==='Super Admin')return true;
  if(['Reviewer','Owner'].includes(u.role))return false; // Salon Owner follows the outlet/sheet access set in User Management
  const oa=u.outletAccess&&Object.keys(u.outletAccess).length?u.outletAccess:null;
  if(oa?oa[String(outletId)]!=='View and Edit':!(u.outletIds||[]).map(String).includes(String(outletId)))return false;
  const sa=u.sheetAccessByOutlet&&u.sheetAccessByOutlet[outletId];
  return !(sa&&sa[sheetId]&&sa[sheetId]!=='Edit');
}
// Approval rule (automation phase 5; outlet setting invoiceApprovalLimit, Master Sheet → outlet →
// Vendor Invoices). A bill above the limit, dated on/after the day the limit was set
// (invoiceApprovalFrom), can't be paid until a Super Admin approves it. PIs and automatic recurring
// invoices are exempt. The server's nightly check uses the same rule (supabase/functions/automation).
function invoiceNeedsApproval(inv,salonId){
  const o=outletSettings(salonId);
  const lim=Number(o.invoiceApprovalLimit)||0;
  if(!inv||lim<=0||inv.docNature==='Performa Invoice'||inv.autoCreated)return false;
  if((Number(inv.amount)||0)<=lim||(inv.approval&&inv.approval.status==='Approved'))return false;
  const from=o.invoiceApprovalFrom||'';const d=toISO(inv.bookingDate||inv.invoiceDate);
  return !from||!d||d>=from;
}
// Temporary users (automation phase 5): profiles.access_until = last day they may use SalonOS
// (IST calendar date). The database turns them Inactive just after midnight; this covers the gap.
function accessEnded(profile,asOf){
  if(!profile||!profile.access_until||profile.role==='Super Admin')return false;
  const d=new Date((asOf||new Date()).getTime()+5.5*3600e3).toISOString().slice(0,10);
  return String(profile.access_until).slice(0,10)<d;
}
// Can this user see this sheet on this outlet (same rule as the sheet tabs: anything but No Access)?
function userCanViewSheet(u,outletId,sheetId){
  if(!u||!userCanSeeOutlet(u,outletId))return false;
  if(u.role==='Super Admin')return true;
  const sa=(u.sheetAccessByOutlet&&u.sheetAccessByOutlet[outletId])||u.sheetAccess||null;
  return !sa||(sa[sheetId]||'View Only')!=='No Access';
}
// An outlet's current settings (Master Sheet saves update SALONS in place; the salon object a
// screen was opened with can be an older copy).
function outletSettings(salonId){return SALONS.find(s=>String(s.id)===String(salonId))||{};}
// Line of business, per outlet (Master Sheet → Line of Business). Salon is the default for every
// outlet saved before restaurants existed. Restaurant outlets get their own sheets, expense rows,
// P&L lines and departments (js/15-restaurant.js).
function isRestaurantOutlet(salonId){return outletSettings(salonId).businessType==='Restaurant';}
function bizKeyOf(salonId){return isRestaurantOutlet(salonId)?'restaurant':'salon';}
const RESTAURANT_VENDOR_CATEGORIES=['Food & Raw Material Purchase','Liquor Purchase','Packaging Material','Gas / LPG','Pest Control','Licences & Fees'];
// A vendor category list with the restaurant categories added (before "Other") for a restaurant
// outlet — or, with no outlet given, whenever any restaurant outlet exists.
function withBizCategories(list,salonId){
  const rest=salonId!=null&&salonId!==''?isRestaurantOutlet(salonId):SALONS.some(s=>s.businessType==='Restaurant');
  if(!rest)return list;
  const i=list.indexOf('Other');const extra=RESTAURANT_VENDOR_CATEGORIES.filter(c=>!list.includes(c));
  return i<0?[...list,...extra]:[...list.slice(0,i),...extra,...list.slice(i)];
}
function currentSessionUser(){try{return JSON.parse(sessionStorage.getItem('salonos_user')||'null');}catch(e){return null;}}
// The outlets the signed-in user may see, out of `list` (default: every outlet).
function salonsForCurrentUser(list){const u=currentSessionUser();return(list||SALONS).filter(s=>userCanSeeOutlet(u,s.id));}
// Builds the app's user object from a profiles row — used at login and whenever a Super Admin
// changes this person's access while they're signed in (see the access refresh in App).
function userFromProfile(profile,email,extra){
  return{id:profile.id,name:profile.name,email,role:profile.role,access:profile.access,outletIds:profile.outlet_ids||[],status:profile.status,
    outletAccess:(profile.outlet_access&&Object.keys(profile.outlet_access).length)?profile.outlet_access:Object.fromEntries((profile.outlet_ids||[]).map(oid=>[oid,'View and Edit'])),
    sheetAccessByOutlet:profile.sheet_access_by_outlet||{},
    isDemo:!!profile.is_demo,...(extra||{})};
}
const EMP_STORE_KEY='salonos_master_employees';
function empKeyFor(salonId){
  return salonId!=null?EMP_STORE_KEY+'_outlet_'+salonId:EMP_STORE_KEY;
}
function loadEmployees(salonId){
  try{
    const raw=cachedLocalGet(empKeyFor(salonId));
    if(raw!==null){const parsed=JSON.parse(raw);if(Array.isArray(parsed))return parsed;}
    // One-time recovery: outlet 1 previously shared a single unscoped list with every
    // other outlet (that was the bug). If it has never been scoped yet, recover it here
    // once so existing work for the default outlet isn't lost; every other outlet starts clean.
    if(salonId===1){
      const oldRaw=cachedLocalGet(EMP_STORE_KEY);
      if(oldRaw!==null){const oldParsed=JSON.parse(oldRaw);if(Array.isArray(oldParsed))return oldParsed;}
    }
  }catch(e){}
  return[];
}
function saveEmployees(list,salonId){
  safeLocalSet(empKeyFor(salonId),JSON.stringify(list));
}
// The fixed designation display order used consistently across every employee list in the app
// (Attendance, Salary Working, Master Salary, etc.) — not alphabetical, a specific business order.
const DESIGNATION_ORDER=['Unisex Hairdresser','Ladies Hairdresser','Men Hairdresser','Beautician','Pedicurist','Salon Manager','Manager','Assist Manager','Helper','Housekeeper'];
function sortByDesignation(list){
  return [...list].sort((a,b)=>{
    const ai=DESIGNATION_ORDER.indexOf(a.desig);
    const bi=DESIGNATION_ORDER.indexOf(b.desig);
    const aRank=ai===-1?DESIGNATION_ORDER.length:ai; // unrecognized designations sort last, not first
    const bRank=bi===-1?DESIGNATION_ORDER.length:bi;
    if(aRank!==bRank)return aRank-bRank;
    return (a.name||'').localeCompare(b.name||''); // alphabetical within the same designation
  });
}
function getEmployeesForMonth(year,month,salonId){
  const filtered=loadEmployees(salonId).filter(e=>{
    if(e.status==='Active')return true;
    if(e.status==='Resigned'&&e.dol){
      const dol=new Date(e.dol+'T00:00:00');
      return dol.getFullYear()===year&&dol.getMonth()===month;
    }
    return false;
  });
  return sortByDesignation(filtered);
}

// ── Shared Attendance storage + summary math (used by Attendance sheet & Salary Working) ──
const ATT_STORE_KEY='salonos_attendance';
function attKeyFor(salonId){return salonId!=null?ATT_STORE_KEY+'_outlet_'+salonId:ATT_STORE_KEY;}
// Old saves used the status code 'hd' for Holiday (easily misread as "half day"); newer code
// uses 'holiday'. Migrate on read so attendance marked before this rename still displays right.
function migrateAttendanceHdCode(map){
  let changed=false;
  const next={};
  Object.keys(map).forEach(k=>{
    const rec=map[k];
    if(rec&&Array.isArray(rec.days)&&rec.days.some(d=>d==='hd')){
      next[k]={...rec,days:rec.days.map(d=>d==='hd'?'holiday':d)};
      changed=true;
    }else{
      next[k]=rec;
    }
  });
  return changed?next:map;
}
function loadAttendance(salonId){
  try{const raw=cachedLocalGet(attKeyFor(salonId));if(raw!==null){const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')return migrateAttendanceHdCode(parsed);}}catch(e){}
  return {};
}
function saveAttendance(map,salonId){
  safeLocalSet(attKeyFor(salonId),JSON.stringify(map));
}
// ── Attendance Register attachment — a scanned copy of the physical register for a given
// month, filename only (no backend to store real bytes). Keyed by "year_month". ──
function attRegisterFileKey(salonId){return outletKey('salonos_attendance_register_files',salonId);}
function loadAttendanceRegisterFiles(salonId){
  try{const v=JSON.parse(cachedLocalGet(attRegisterFileKey(salonId))||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}
}
function saveAttendanceRegisterFiles(salonId,v){return safeLocalSet(attRegisterFileKey(salonId),JSON.stringify(v));}
// ── Cash Register attachment — a scanned/photographed copy of the physical cash register for a
// given day, filename only. Keyed by ISO date, same granularity as Daily Sales & Exp itself. ──
function cashRegisterFileKey(salonId){return outletKey('salonos_cash_register_files',salonId);}
function loadCashRegisterFiles(salonId){
  try{const v=JSON.parse(cachedLocalGet(cashRegisterFileKey(salonId))||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}
}
function saveCashRegisterFiles(salonId,v){return safeLocalSet(cashRegisterFileKey(salonId),JSON.stringify(v));}
const ATT_WEEKLY_OFFS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function countWeekdayInRange(year,month,dow,fromDate,toDate){
  let count=0;const dim=new Date(year,month+1,0).getDate();
  for(let d=1;d<=dim;d++){const cur=new Date(year,month,d);if(cur<fromDate||cur>toDate)continue;if(cur.getDay()===dow)count++;}
  return count;
}
function allowedWeekoffFor(e,year,month,dim){
  const offDow=ATT_WEEKLY_OFFS.indexOf(e.weeklyOff);
  if(offDow<0)return 0;
  const monthStart=new Date(year,month,1);
  const monthEnd=new Date(year,month,dim);
  const dojDate=e.doj?new Date((toISO(e.doj)||e.doj)+'T00:00:00'):null;
  const dolDate=e.dol?new Date((toISO(e.dol)||e.dol)+'T00:00:00'):null;
  const rangeStart=dojDate&&dojDate>monthStart?dojDate:monthStart;
  const rangeEnd=dolDate&&dolDate<monthEnd?dolDate:monthEnd;
  if(rangeEnd<rangeStart)return 0;
  return countWeekdayInRange(year,month,offDow,rangeStart,rangeEnd);
}
function attMonthKey(empId,year,month){return empId+'_'+year+'_'+month;}
// Structural-only day array: notjoined / left / weekoff are auto-derived; every other
// (working) day starts blank (null) so the manager marks it manually.
function genAttDay(e,year,month){
  const dim=new Date(year,month+1,0).getDate();
  const dojDate=e.doj?new Date((toISO(e.doj)||e.doj)+'T00:00:00'):null;
  const dolDate=e.dol?new Date((toISO(e.dol)||e.dol)+'T00:00:00'):null;
  const offDow=ATT_WEEKLY_OFFS.indexOf(e.weeklyOff);
  return Array.from({length:31},(_,i)=>{
    const day=i+1;if(day>dim)return null;
    const cellDate=new Date(year,month,day);
    if(dojDate&&cellDate<dojDate)return 'notjoined';
    if(dolDate&&cellDate>dolDate)return 'left';
    if(offDow>-1&&cellDate.getDay()===offDow)return 'off';
    return null;
  });
}
// A day can be FIRST marked only once the previous day already has some status (auto or
// manual) — this stops the register from being filled out of order. But once a day already
// has a status of its own (including an auto Weekoff/Not Joined/Left), it can always be
// overridden — so a Present day can be changed to Weekoff (took the day off instead) and an
// auto Weekoff can be changed to Present (worked that day), without needing to touch every
// day in between first.
function attDayMarkable(daysArr,dayIdx){
  return dayIdx===0||daysArr[dayIdx-1]!=null||daysArr[dayIdx]!=null;
}
// Single source of truth for the Attendance Summary math — also used by Salary Working
// so "Total Days" always matches what Attendance computes.
function attSummaryFor(e,year,month,record){
  const dim=new Date(year,month+1,0).getDate();
  const days=(record&&record.days)||genAttDay(e,year,month);
  const adjustment=Number(record&&record.adjustment)||0;
  const sl=days.slice(0,dim);
  const c=(k)=>sl.filter(d=>d===k).length;
  const notMarked=sl.filter(d=>d===null||d===undefined).length; // blank working days — not yet marked, so not paid
  const allowedWeekoff=allowedWeekoffFor(e,year,month,dim);
  // Not-marked days are excluded from Working Days too — an unmarked day is not an assumed-present day.
  const workingDaysRaw=dim-c('left')-c('notjoined')-c('absent')-c('half')*0.5-notMarked;
  const workingDays=workingDaysRaw-adjustment;
  const extraDays=allowedWeekoff-c('off');
  const totalDaysPayable=workingDays+extraDays;
  return{days:sl,present:c('present'),off:c('off'),holiday:c('holiday'),half:c('half'),absent:c('absent'),notjoined:c('notjoined'),left:c('left'),notMarked,
    allowedWeekoff,adjustment,daysInMonth:dim,workingDaysRaw,workingDays,extraDays,totalDaysPayable};
}
// ── Salary Working row meta (Status / Payment Status / Mode) — persisted per outlet ──
const SW_META_STORE_KEY='salonos_salary_working_meta';
function swMetaKeyFor(salonId){return salonId!=null?SW_META_STORE_KEY+'_outlet_'+salonId:SW_META_STORE_KEY;}
function loadSWMeta(salonId){
  try{const raw=cachedLocalGet(swMetaKeyFor(salonId));if(raw!==null){const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')return parsed;}}catch(e){}
  return {};
}
function saveSWMeta(map,salonId){
  safeLocalSet(swMetaKeyFor(salonId),JSON.stringify(map));
}
// ── Incentive Working row meta (Status / Payment Status / Mode) — same pattern as Salary
// Working's own meta above, but tracked independently since incentive payout can be approved/
// paid on its own schedule, separate from the base salary run. ──
const IW_META_STORE_KEY='salonos_incentive_working_meta';
function iwMetaKeyFor(salonId){return salonId!=null?IW_META_STORE_KEY+'_outlet_'+salonId:IW_META_STORE_KEY;}
function loadIWMeta(salonId){
  try{const raw=cachedLocalGet(iwMetaKeyFor(salonId));if(raw!==null){const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')return parsed;}}catch(e){}
  return {};
}
function saveIWMeta(map,salonId){
  safeLocalSet(iwMetaKeyFor(salonId),JSON.stringify(map));
}
// ── Month Lock — per-outlet, per-calendar-month lock flags. Set two ways: manually, from a
// checklist under Master Sheet ("🔒 Months"), or automatically the moment every employee's
// Salary Working row for that outlet+month is marked Approved. Once locked, Attendance, Salary
// Working and Incentive Working all refuse further edits for that month until it's unlocked. ──
const MONTH_LOCK_STORE_KEY='salonos_month_locks';
function monthLockKeyFor(salonId){return salonId!=null?MONTH_LOCK_STORE_KEY+'_outlet_'+salonId:MONTH_LOCK_STORE_KEY;}
function monthLockCode(year,month){return year+'-'+String(month+1).padStart(2,'0');} // month is 0-11
function loadMonthLocks(salonId){
  try{const raw=cachedLocalGet(monthLockKeyFor(salonId));if(raw!==null){const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')return parsed;}}catch(e){}
  return {};
}
function saveMonthLocks(map,salonId){
  safeLocalSet(monthLockKeyFor(salonId),JSON.stringify(map));
}
function isMonthLockedFor(salonId,year,month){
  const rec=loadMonthLocks(salonId)[monthLockCode(year,month)];
  return !!(rec&&rec.locked);
}
function monthLockRecordFor(salonId,year,month){
  return loadMonthLocks(salonId)[monthLockCode(year,month)]||null;
}
// source: 'manual' (toggled from Master Sheet) or 'auto' (every employee's Salary Working
// row was Approved). by: display name of whoever triggered it, for the tooltip.
function setMonthLockFor(salonId,year,month,locked,source,by){
  const map=loadMonthLocks(salonId);
  const k=monthLockCode(year,month);
  if(locked)map[k]={locked:true,source:source||'manual',by:by||'',at:new Date().toISOString()};
  else delete map[k];
  saveMonthLocks(map,salonId);
  return map;
}
// Called after any Salary Working status change — if every employee on the outlet now has this
// month's row Approved, the month locks itself automatically. Does nothing if already locked, if
// there are no employees, or if any employee still isn't Approved. Returns true if it just locked.
// This is the Salary Working side of Approval — it still locks Attendance along with itself
// (Attendance feeds Salary, so once Salary is Approved that month's Attendance shouldn't change
// either), same as before. Incentive Working has its own, fully independent auto-lock below, so
// Salary Working and Incentive Working can each be approved and locked on their own schedule
// without forcing the other sheet read-only. ──
function autoLockMonthIfAllApproved(salonId,year,month,employees,metaMap,by){
  if(!employees||!employees.length)return false;
  if(isMonthLockedFor(salonId,year,month))return false;
  const allApproved=employees.every(e=>{
    const rec=metaMap[attMonthKey(e.id,year,month)];
    return rec&&rec.status==='Approved';
  });
  if(!allApproved)return false;
  setMonthLockFor(salonId,year,month,true,'auto',by);
  return true;
}
// ── Incentive Working Auto-Lock — a separate store from the Month Lock above, so approving every
// employee on Incentive Working locks Incentive Working (and only Incentive Working) without
// touching Attendance or Salary Working. The Master Sheet's manual "Lock Months" toggle still
// locks all three sheets together (an explicit admin override) — only the two sheets' own
// auto-lock-on-full-approval is independent. ──
const IW_LOCK_STORE_KEY='salonos_iw_auto_locks';
function iwLockKeyFor(salonId){return salonId!=null?IW_LOCK_STORE_KEY+'_outlet_'+salonId:IW_LOCK_STORE_KEY;}
function loadIWLocks(salonId){
  try{const raw=cachedLocalGet(iwLockKeyFor(salonId));if(raw!==null){const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')return parsed;}}catch(e){}
  return {};
}
function saveIWLocks(map,salonId){safeLocalSet(iwLockKeyFor(salonId),JSON.stringify(map));}
function isIWAutoLockedFor(salonId,year,month){
  const rec=loadIWLocks(salonId)[monthLockCode(year,month)];
  return !!(rec&&rec.locked);
}
function iwAutoLockRecordFor(salonId,year,month){
  return loadIWLocks(salonId)[monthLockCode(year,month)]||null;
}
// Generic setter behind Incentive Working's own lock store — source is 'auto' (every employee
// Approved) or 'manual' (an admin locked it directly from the Incentive Working sheet, without
// waiting for full approval and without touching Attendance or Salary Working).
function setIWLockFor(salonId,year,month,locked,source,by){
  const map=loadIWLocks(salonId);
  const k=monthLockCode(year,month);
  if(locked)map[k]={locked:true,source:source||'manual',by:by||'',at:new Date().toISOString()};
  else delete map[k];
  saveIWLocks(map,salonId);
  return map;
}
function setIWAutoLockFor(salonId,year,month,locked,by){
  return setIWLockFor(salonId,year,month,locked,'auto',by);
}
function autoLockIWIfAllApproved(salonId,year,month,employees,metaMap,by){
  if(!employees||!employees.length)return false;
  if(isMonthLockedFor(salonId,year,month))return false; // already covered by a manual/master lock
  if(isIWAutoLockedFor(salonId,year,month))return false;
  const allApproved=employees.every(e=>{
    const rec=metaMap[attMonthKey(e.id,year,month)];
    return rec&&rec.status==='Approved';
  });
  if(!allApproved)return false;
  setIWAutoLockFor(salonId,year,month,true,by);
  return true;
}
// Effective read-only state for Incentive Working = a manual/master lock from Master Sheet (which
// still overrides everything, all three sheets), OR Incentive Working's own auto-lock. Salary
// Working's own auto-lock (source:'auto' in the shared Month Lock store) deliberately does NOT
// affect this — that's exactly the independence Approve-individually relies on.
function iwEffectiveLockRecordFor(salonId,year,month){
  const manual=monthLockRecordFor(salonId,year,month);
  if(manual&&manual.locked&&manual.source==='manual')return{...manual,scope:'all'};
  const iw=iwAutoLockRecordFor(salonId,year,month);
  return iw?{...iw,scope:'incentive'}:null;
}
function isIWEffectiveLockedFor(salonId,year,month){
  const manual=monthLockRecordFor(salonId,year,month);
  if(manual&&manual.locked&&manual.source==='manual')return true;
  return isIWAutoLockedFor(salonId,year,month);
}
// ── Manager Final Month — a lighter, per-month (not whole-team Month Lock) self-lock that the
// outlet Manager sets on themselves: tick "Mark Month Final" once a month's Attendance or Daily
// Sales & Exp. entries are done, and that ENTIRE month becomes read-only from the Manager's own
// side. Unlike Month Lock (which blocks everyone, including Super Admin), this only restricts
// non-admin roles — Super Admin and Reviewer can still correct a finalized month, or un-tick it
// to hand it back to the Manager. Two independent stores (one per sheet) since a month can be
// finalized on one sheet but not the other. Keyed 'YYYY-MM' per outlet+sheet. ──
const MANAGER_FINAL_STORE_KEY='salonos_manager_final_months';
function managerFinalKeyFor(salonId,sheet){return (salonId!=null?MANAGER_FINAL_STORE_KEY+'_'+sheet+'_outlet_'+salonId:MANAGER_FINAL_STORE_KEY+'_'+sheet);}
function loadManagerFinalMonths(salonId,sheet){
  try{const raw=cachedLocalGet(managerFinalKeyFor(salonId,sheet));if(raw!==null){const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')return parsed;}}catch(e){}
  return {};
}
function saveManagerFinalMonths(map,salonId,sheet){
  safeLocalSet(managerFinalKeyFor(salonId,sheet),JSON.stringify(map));
}
function isManagerFinalMonth(salonId,sheet,year,month){
  const rec=loadManagerFinalMonths(salonId,sheet)[monthLockCode(year,month)];
  return !!(rec&&rec.final);
}
function setManagerFinalMonth(salonId,sheet,year,month,final,by){
  const map=loadManagerFinalMonths(salonId,sheet);
  const k=monthLockCode(year,month);
  if(final)map[k]={final:true,by:by||'',at:new Date().toISOString()};
  else delete map[k];
  saveManagerFinalMonths(map,salonId,sheet);
  return map;
}
// Admin roles can always see/edit past a Manager Final Month — only non-admin, non-reviewer
// users (Outlet Manager, Data Entry User, etc.) are actually restricted by it.
function isManagerSideRole(user){
  return !!user&&!['Super Admin','Reviewer'].includes(user.role);
}
// ── Salary/Incentive Summary Approval — a deliberately separate, lightweight workflow from the
// working sheets' own row-level "Approved" status. Salon Manager and ASM never get sheet access
// (Edit or even View Only) to Salary Working / Incentive Working itself — instead, whoever DOES
// have edit access there sends a point-in-time summary snapshot (figures + a short breakdown per
// employee, not the full working sheet) straight to them for a simple Approve/Return decision.
// Two independent stores (one per sheet) since a month can be approved on one and not the other,
// keyed 'YYYY-MM' per outlet. The snapshot is captured at send-time and never mutates afterward —
// if the underlying working sheet changes later, a fresh summary has to be sent (see status
// resetting to 'Sent' below), so an approval can never silently drift out of sync with numbers
// that changed after the fact. ──
function isSummaryApproverRole(user){
  return !!user&&(user.role==='Salon Manager'||user.role==='ASM');
}
// Salon Manager / ASM get only the Summary Approval screen for Salary / Incentive Working —
// unless a Super Admin has given them "Edit" on that sheet for this outlet in User Management,
// in which case they get the real sheet too (with Summary Approval as an extra tab).
function summaryApprovalOnly(user,salonId,sheetId){
  if(!isSummaryApproverRole(user))return false;
  const oa=user.sheetAccessByOutlet&&salonId!=null&&user.sheetAccessByOutlet[salonId];
  return !(oa&&oa[sheetId]==='Edit');
}
function summaryApprovalKeyFor(salonId,sheet){return outletKey('salonos_summary_approval_'+sheet,salonId);}
function loadSummaryApprovals(salonId,sheet){
  try{const raw=cachedLocalGet(summaryApprovalKeyFor(salonId,sheet));if(raw!==null){const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')return parsed;}}catch(e){}
  return {};
}
function saveSummaryApprovals(map,salonId,sheet){safeLocalSet(summaryApprovalKeyFor(salonId,sheet),JSON.stringify(map));}
function summaryApprovalFor(salonId,sheet,year,month){
  return loadSummaryApprovals(salonId,sheet)[monthLockCode(year,month)]||null;
}
// rows: [{empId,name,desig,...display fields specific to salary or incentive...}], total: number
function sendSummaryForApproval(salonId,sheet,year,month,rows,total,by){
  const map=loadSummaryApprovals(salonId,sheet);
  const k=monthLockCode(year,month);
  map[k]={status:'Sent',rows,total,sentBy:by||'',sentAt:new Date().toISOString(),
    approvedBy:'',approvedAt:'',remarks:''};
  saveSummaryApprovals(map,salonId,sheet);
  return map[k];
}
function decideSummaryApproval(salonId,sheet,year,month,decision,by,remarks){
  const map=loadSummaryApprovals(salonId,sheet);
  const k=monthLockCode(year,month);
  const rec=map[k];
  if(!rec)return null;
  map[k]={...rec,status:decision,approvedBy:decision==='Approved'?(by||''):'',approvedAt:decision==='Approved'?new Date().toISOString():'',remarks:remarks||''};
  saveSummaryApprovals(map,salonId,sheet);
  return map[k];
}

// ── Deterministic per-employee seed (stable across renders/components) ──
function empSeed(id){let h=0;const s=String(id);for(let i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0;}return h;}

// ── Dedicated CSV parser (used instead of SheetJS for .csv uploads) ──
// SheetJS's own CSV ingestion tries to guess which cells "look like" dates or numbers and
// silently converts them — and for an ambiguous string like "01/06/26" it assumes US MM/DD/YY,
// turning 1-June into 6-January before any of our own DD/MM parsing ever runs. Parsing CSV text
// ourselves keeps every cell as the exact original string, so date interpretation stays entirely
// in our control (see fmtDate/normalizeDate's day-first-with-file-wide-inference logic).
function parseCSVToRows(text){
  if(text.charCodeAt(0)===0xFEFF)text=text.slice(1); // strip BOM
  const rows=[];let row=[],field='',inQuotes=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(inQuotes){
      if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else inQuotes=false;}
      else field+=c;
    }else{
      if(c==='"')inQuotes=true;
      else if(c===','){row.push(field);field='';}
      else if(c==='\r'){/* ignore — \n (or \r\n) ends the row */}
      else if(c==='\n'){row.push(field);rows.push(row);row=[];field='';}
      else field+=c;
    }
  }
  if(field.length||row.length){row.push(field);rows.push(row);}
  return rows.filter(r=>!(r.length===1&&r[0].trim()===''));
}
function isCSVFile(file){
  return /\.csv$/i.test(file.name||'')||file.type==='text/csv';
}

// ── Every per-outlet storage key in the app should go through this, so data from one outlet
// never leaks into another via a shared/unscoped localStorage or IndexedDB key. ──
// Playfair Display (the serif font used for page titles) has a quite ornate, swash-style
// ampersand that looks visually out of place against plain text — salon names like "Cut & Style"
// end up with a mismatched "&". This renders just the ampersand in the plain body font instead,
// leaving the rest of the heading in the serif font untouched.
function fixAmp(text){
  if(!text||typeof text!=='string'||text.indexOf('&')===-1)return text;
  const parts=text.split('&');
  const out=[];
  parts.forEach((p,i)=>{
    out.push(p);
    if(i<parts.length-1)out.push(React.createElement('span',{key:'amp'+i,style:{fontFamily:'var(--font)',fontWeight:500,fontStyle:'normal'}},'&'));
  });
  return out;
}
function outletKey(base,salonId){
  return salonId!=null?base+'_outlet_'+salonId:base;
}

// ── Audit Log — a basic who/what/when trail for the highest-stakes data in this app: Master
// Salary (pay figures), Vendor invoices (money owed to outside parties), and P&L manual
// overrides (numbers that don't come from any automatic source). Reads the logged-in user
// straight from sessionStorage rather than needing every save function up and down the
// component tree to accept and pass along a `user` prop. Capped at 500 entries per outlet so it
// can't grow without bound — this is a working trail for "who touched this recently", not a
// permanent legal audit record. ──
function logAuditEvent(salonId,entry){
  try{
    const raw=sessionStorage.getItem('salonos_user');
    const u=raw?JSON.parse(raw):null;
    const key=outletKey('salonos_audit_log',salonId);
    const existing=JSON.parse(cachedLocalGet(key)||'[]');
    const next=[{ts:new Date().toISOString(),user:(u&&u.name)||'Unknown',role:(u&&u.role)||'',...entry},...existing].slice(0,500);
    safeLocalSet(key,JSON.stringify(next));
  }catch(e){}
}
function loadAuditLog(salonId){
  try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_audit_log',salonId))||'[]');if(Array.isArray(v))return v;}catch(e){}
  return[];
}

// Every base storage key that gets suffixed with '_outlet_<id>' anywhere in this app — used to
// fully clean up an outlet's data when it's deleted. If a new base key is ever added for a new
// per-outlet feature, add it here too, or its data will survive a delete and can leak into a
// future outlet that happens to reuse the same numeric id.
const SALON_SCOPED_KEY_BASES=[
  'bankStatementDir','cradleeDir','staffReportDir',
  'salonos_advances','salonos_bank_last_auto','salonos_bank_statement_rows','salonos_billing_invoices',
  'salonos_clients','salonos_collection_reason_diff','salonos_cradlee_collection_rows','salonos_cradlee_last_auto',
  'salonos_daily_incentive_entries',
  'salonos_daily_sales_collection_data','salonos_daily_sales_data','salonos_daily_sales_empdata','salonos_due_dates',
  'salonos_incentive_actuals','salonos_inventory_items','salonos_penalties','salonos_recurring_expenses',
  'salonos_staffreport_last_auto','salonos_vendor_invoices','salonos_vendors',
  'salonos_master_employees','salonos_attendance','salonos_salary_working_meta','salonos_period_default',
  'salonos_sw_cols','salonos_iw_cols','salonos_audit_log','salonos_bank_payment_layout','salonos_bank_payment_bank','salonos_tally_pushed',
  // ── Added in a later review pass — these per-outlet stores existed already but were never
  // added here when they were introduced, so "Delete Outlet" was silently leaving all of this
  // behind (stale data that could bleed into a future outlet reusing the same numeric id). ──
  'salonos_attendance_register_files','salonos_cash_register_files','salonos_cf_manual_overrides',
  'salonos_daily_sales_collection_entrydata','salonos_daily_sales_descdata','salonos_due_auto_overrides',
  'salonos_fixed_asset_blocks','salonos_fixed_assets','salonos_inc_times_format',
  'salonos_incentive_applicability','salonos_incentive_calc_mode','salonos_incentive_rates',
  'salonos_incentive_target_multipliers','salonos_incentive_working_meta','salonos_iw_auto_locks',
  'salonos_manager_incentive_collection_items','salonos_manager_incentive_inputs','salonos_manager_incentive_tiers',
  'salonos_mem_incentive_rule_type','salonos_mem_rule_a_rows','salonos_mem_rule_a_settings',
  'salonos_mem_rule_b_rows','salonos_mem_rule_b_settings','salonos_mem_rule_c_rows','salonos_mem_rule_c_settings',
  'salonos_mgr_incentive_rule_b','salonos_mgr_incentive_rule_type','salonos_month_locks',
  'salonos_pl_manual_overrides','salonos_previous_pnl','salonos_product_incentive_entries',
  'salonos_product_incentive_flat_rule','salonos_product_incentive_rule','salonos_product_incentive_rule_type',
  'salonos_pt_slabs','salonos_service_incentive_slabs','salonos_staff_report_selected_month',
  'salonos_staff_work_reports','salonos_tally_ledger_map','salonos_tally_synced_ledgers','salonos_tea_config',
  // Manager Final Month uses its own '<base>_<sheet>_outlet_<id>' pattern (see managerFinalKeyFor)
  // — passing these as bases still resolves to the exact same keys via outletKey below.
  'salonos_manager_final_months_attendance','salonos_manager_final_months_dse'
];
function deleteAllSalonScopedData(salonId){
  SALON_SCOPED_KEY_BASES.forEach(base=>{cachedLocalRemove(outletKey(base,salonId));});
  // The list above has fallen behind before (billing, clients, advances, bank rows… were missing),
  // so also sweep every key that ends in this outlet's suffix — and delete them in the cloud too,
  // or the outlet's data kept coming back on every other login.
  try{
    const suffix='_outlet_'+salonId,stray=[];
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.indexOf('salonos_')===0&&k.endsWith(suffix))stray.push(k);}
    stray.forEach(k=>cachedLocalRemove(k));
  }catch(e){}
  cloudDeleteOutletData(salonId);
  // Appointment Book stores every outlet's bookings inside ONE shared key (composite "sid|date"
  // keys within it), not a separate localStorage key per outlet — strip just this outlet's
  // entries out of it rather than deleting the whole thing.
  try{
    const raw=cachedLocalGet('salonos_appointments_book');
    if(raw){
      const book=JSON.parse(raw);
      const prefix=salonId+'|';
      Object.keys(book).forEach(k=>{if(k.startsWith(prefix))delete book[k];});
      safeLocalSet('salonos_appointments_book',JSON.stringify(book));
    }
  }catch(e){}
}

// A persistent, ever-incrementing id counter for new salons — NEVER reused, even after a salon
// is deleted. Before this, new-salon ids were computed as Math.max(current salon ids)+1, which
// meant deleting your only salon and adding a new one handed the new salon the exact same id the
// deleted one had — and since deleting never cleaned up that old salon's data (see above), the
// "new" salon would immediately inherit every leftover employee, vendor, invoice, bank
// statement row, everything, making a brand-new outlet look like it already had data in it.
function nextSalonId(currentSalons){
  let n;
  try{n=Number(cachedLocalGet('salonos_next_salon_id'));}catch(e){n=null;}
  if(!n||isNaN(n)||n<1)n=Math.max(0,...currentSalons.map(s=>Number(s.id)||0))+1;
  safeLocalSet('salonos_next_salon_id',String(n+1));
  return n;
}

// Shared id generator for every other prefixed record id in the app (employees, advances,
// penalties, vendors, recurring expenses, invoices, ...). Always derived from the highest
// existing numeric id in the current list, NEVER from list.length — length-based ids collide
// the moment a record is deleted and a new one added (the "new" record silently reuses an old
// id and can inherit/overwrite whatever the old id's data pointed to). One shared function here
// instead of a copy in every module, so this bug class can't quietly reappear in a new screen.
function nextPrefixedId(list,prefix,pad){
  const n=Math.max(0,...list.map(item=>Number(String(item.id).replace(/\D/g,''))||0))+1;
  return prefix+String(n).padStart(pad,'0');
}

// ── Backup & Restore — every piece of data this app saves goes through localStorage keys
// prefixed "salonos_", so a full backup is just every such key/value pair, and a restore is
// writing them straight back. Used by Master Settings' Take/Import Backup and by the login
// screen's "back up before you exit" prompt, and by the auto-backup timer. ──
function collectSalonOSData(){
  const data={};
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k&&k.indexOf('salonos_')===0&&k!=='salonos_autobackup_snapshot')data[k]=localStorage.getItem(k);
    }
  }catch(e){}
  return data;
}
function downloadSalonOSBackup(){
  const data=collectSalonOSData();
  const payload={__salonosBackup:true,version:1,exportedAt:new Date().toISOString(),data};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const ts=new Date().toISOString().replace(/[:T]/g,'-').slice(0,19);
  a.href=url;a.download='SalonOS_Backup_'+ts+'.json';a.click();
  URL.revokeObjectURL(url);
  // Tracked separately from the in-memory auto-backup snapshot (salonos_autobackup_snapshot) —
  // that snapshot lives in the same localStorage a cleared cache or lost device would wipe too,
  // so it doesn't count as a real backup for the overdue-reminder banner. Only an actual
  // downloaded file, which survives independently of this browser, resets the reminder.
  try{localStorage.setItem('salonos_last_backup_downloaded',new Date().toISOString());}catch(e){}
  return Object.keys(data).length;
}
// Days since the last real downloaded backup — null if one has never been downloaded at all.
function daysSinceLastBackup(){
  try{
    const raw=cachedLocalGet('salonos_last_backup_downloaded');
    if(!raw)return null;
    const d=new Date(raw);
    if(isNaN(d))return null;
    return Math.floor((Date.now()-d.getTime())/86400000);
  }catch(e){return null;}
}
function restoreSalonOSBackup(jsonText){
  const payload=JSON.parse(jsonText);
  if(!payload||typeof payload!=='object'||!payload.data||typeof payload.data!=='object')
    throw new Error('This doesn\'t look like a SalonOS backup file.');
  const keys=Object.keys(payload.data);
  if(!keys.length)throw new Error('That backup file has no data in it.');
  keys.forEach(k=>{safeLocalSet(k,payload.data[k]);});
  return keys.length;
}

// ── Vendors — shared across Vendor Sheet and Bank Statement's auto-classification (rule 8:
// unmatched debit narrations get checked against the vendor list). Persisted per outlet. ──
const DEFAULT_VENDORS=[
  {id:'V001',name:"L'Oreal India Pvt Ltd",address:'Plot 12, Andheri East, Mumbai 400069',gst:'27AABCL1234R1ZP',cat:'Purchase of Cosmetic',contact:'Rohit Sharma',phone:'9811234567',terms:'30 days',status:'Active'},
  {id:'V002',name:'Wella Professional',address:'45 Connaught Place, New Delhi 110001',gst:'07AABCW5678R1ZP',cat:'Purchase of Cosmetic',contact:'Nisha Patel',phone:'9822345678',terms:'45 days',status:'Active'},
  {id:'V003',name:'SparkleClean Services',address:'23 Lajpat Nagar, New Delhi 110024',gst:'07AABCS9012R1ZP',cat:'Housekeeping',contact:'Ramesh Gupta',phone:'9833456789',terms:'15 days',status:'Active'},
  {id:'V004',name:'TechFix Equipment Co',address:'78 Nehru Place, New Delhi 110019',gst:'07AABCT3456R1ZP',cat:'Equipment',contact:'Ajay Kapoor',phone:'9844567890',terms:'60 days',status:'Active'},
];
function loadVendors(salonId){
  try{
    const raw=cachedLocalGet(outletKey('salonos_vendors',salonId));
    if(raw!==null){const parsed=JSON.parse(raw);if(Array.isArray(parsed))return parsed;}
  }catch(e){}
  return[];
}
// Standalone loader for Penalties data — the Penalty screen itself loads this inline, but Daily
// Sales & Exp's linked Penalty row (and Daily Incentive's linked sub-sheets) need the same data
// without duplicating the storage key/parsing logic in three different places.
function loadPenalties(salonId){
  try{
    const raw=cachedLocalGet(outletKey('salonos_penalties',salonId));
    if(raw!==null){const parsed=JSON.parse(raw);if(Array.isArray(parsed))return parsed;}
  }catch(e){}
  return[];
}
// Daily Sales & Exp's own data store, read standalone — needed by Daily Incentive's linked
// Tip to Employee / Staff Overtime views, which display (not duplicate) figures already entered
// in Daily Sales & Exp rather than asking for the same numbers twice.
function loadDseDataFor(salonId){
  try{return JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_data',salonId))||'{}');}catch(e){return{};}
}
// Same idea, but for the per-employee entry breakdown (name, amount, and — for Tip To Employee /
// Staff Over Time — mode of payment) behind an employee-linked Daily Sales & Exp row, instead of
// just the day's numeric total.
function loadDseEmpDataFor(salonId){
  try{return JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_empdata',salonId))||'{}');}catch(e){return{};}
}
// Every individual employee entry (not just the day total) for a named employee-linked row in a
// given month, flattened one row per entry and sorted by date. Falls back to a single unnamed
// entry from the plain numeric store for any date that has an old-style total but no matching
// per-employee breakdown (e.g. data saved before this row became employee-linked).
function dseRowEmpEntriesForMonth(salonId,rowName,year,month){
  const empData=loadDseEmpDataFor(salonId);
  const data=loadDseDataFor(salonId);
  const ri=EXPENSE_ROWS.findIndex(r=>r.name===rowName);
  if(ri<0)return[];
  const prefix=year+'-'+String(month+1).padStart(2,'0')+'-';
  const out=[];
  Object.keys(data).filter(iso=>iso.startsWith(prefix)).sort().forEach(iso=>{
    const total=data[iso]&&data[iso][ri]!=null&&data[iso][ri]!==''?Number(data[iso][ri])||0:0;
    if(total<=0)return;
    const entries=(empData[iso]&&empData[iso][ri])||[];
    if(entries.length){
      entries.forEach(e=>out.push({date:iso,empName:e.empName||'—',mode:e.mode||'Cash',amount:Number(e.amount)||0}));
    }else{
      out.push({date:iso,empName:'—',mode:'Cash',amount:total});
    }
  });
  return out;
}
// Every day in a given month that has a non-blank value for a named Daily Sales & Exp row (e.g.
// 'Tip To Employee' or 'Staff Over Time'), sorted by date. Looks the row up by NAME rather than
// a hardcoded index, so it keeps working correctly if EXPENSE_ROWS is ever reordered.
function dseRowEntriesForMonth(salonId,rowName,year,month){
  const data=loadDseDataFor(salonId);
  const ri=EXPENSE_ROWS.findIndex(r=>r.name===rowName);
  if(ri<0)return[];
  const prefix=year+'-'+String(month+1).padStart(2,'0')+'-';
  return Object.keys(data).filter(iso=>iso.startsWith(prefix)&&data[iso]&&data[iso][ri]!=null&&data[iso][ri]!=='')
    .sort()
    .map(iso=>({date:iso,amount:Number(data[iso][ri])||0}));
}
function saveVendors(list,salonId){
  safeLocalSet(outletKey('salonos_vendors',salonId),JSON.stringify(list));
}
// Significant words from a vendor's name (drops common corporate suffixes) used for fuzzy
// matching against bank narration text, which rarely spells a vendor's full registered name.
function vendorNameTokens(name){
  const stop=new Set(['pvt','ltd','llp','private','limited','services','solutions','solution','co','company','and','the','inc','india']);
  return String(name||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>=4&&!stop.has(w));
}
function findVendorMatch(description,vendors){
  const descNorm=String(description||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ');
  for(const v of (vendors||[])){
    const tokens=vendorNameTokens(v.name);
    if(tokens.length&&tokens.some(t=>descNorm.includes(t)))return v;
  }
  return null;
}
function findEmployeeMatch(description,employees){
  const descNorm=String(description||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ');
  for(const e of (employees||[])){
    const tokens=vendorNameTokens(e.name);
    if(tokens.length&&tokens.some(t=>descNorm.includes(t)))return e;
  }
  return null;
}

// ── Bank Statement rows & Vendor Invoices — read/write helpers shared between the Bank
// Statement and Vendor Sheet tabs, so each can link a debit transaction to an invoice payment
// regardless of which tab is currently open. Both tabs expose a "Refresh" action to re-pull
// the other side's latest data, since these are separate mounted components. ──
function loadBankStatementRows(salonId){
  try{const raw=JSON.parse(cachedLocalGet(outletKey('salonos_bank_statement_rows',salonId))||'[]');if(Array.isArray(raw))return raw;}catch(e){}
  return [];
}
function saveBankStatementRows(rows,salonId){
  safeLocalSet(outletKey('salonos_bank_statement_rows',salonId),JSON.stringify(rows));
}
function loadVendorInvoices(salonId){
  try{const raw=JSON.parse(cachedLocalGet(outletKey('salonos_vendor_invoices',salonId))||'[]');if(Array.isArray(raw))return ensureVendorInvoiceIds(raw);}catch(e){}
  return [];
}
function saveVendorInvoices(invoices,salonId){
  safeLocalSet(outletKey('salonos_vendor_invoices',salonId),JSON.stringify(invoices));
}
// ── Advances (salonos_advances) read/write helpers — same store the Advances sheet itself
// reads/writes via its own advKey()/setAdvances, exposed here as plain functions so Bank
// Statement can create a new Advance record (a Bank Transfer disbursement, already given) and
// delete it again on unlink, without needing the Advances screen mounted.
function loadAdvances(salonId){
  try{const raw=JSON.parse(cachedLocalGet(outletKey('salonos_advances',salonId))||'[]');if(Array.isArray(raw))return raw;}catch(e){}
  return [];
}
function saveAdvances(list,salonId){
  safeLocalSet(outletKey('salonos_advances',salonId),JSON.stringify(list));
}
function invoiceKeyFor(inv){return inv.vendorId+'|'+inv.invoiceNo;}
// Records a Cash payment directly against whichever outstanding invoice matches this Category —
// same matching rule Vendor Sheet's own auto-open used to use, but skips the extra "Record
// Payment" confirmation screen entirely, since amount/date/mode are already fully known from the
// Daily Sales & Exp entry that triggered this; there's nothing left for the person to confirm.
// Returns the matched invoice's {invoiceNo, vendorId} on success, or null if no outstanding
// invoice was found for that category (shouldn't normally happen — the row would still be locked).
function recordCashPaymentAgainstInvoiceFor(salonId,category,amount,date){
  const invoices=loadVendorInvoices(salonId);
  const match=invoices.find(inv=>inv.docNature!=='Performa Invoice'&&!invoiceNeedsApproval(inv,salonId)&&(inv.category||'')===category&&(Number(inv.amount)-(inv.payments||[]).reduce((s,p)=>s+Number(p.paidAmount||0),0))>0);
  if(!match)return null;
  const entry={id:nextPrefixedId(match.payments||[],'PMT-',3),paidAmount:Number(amount)||0,paidDate:date,mode:'Cash',ref:'',note:'Auto-recorded from Daily Sales & Exp'};
  saveVendorInvoices(invoices.map(inv=>inv.id===match.id?{...inv,payments:[...(inv.payments||[]),entry]}:inv),salonId);
  return{invoiceNo:match.invoiceNo,vendorId:match.vendorId};
}
// Keeps the linked invoice payment in sync when a Daily Sales & Exp cell that auto-recorded a
// payment is later edited — finds the payment this same flow created (matched by category, date,
// and its distinctive note) and updates its amount to match. Returns true if a match was found
// and updated, false if not (the cell itself still gets updated either way — this is just keeping
// Vendor Sheet's own copy of the number in sync, not the source of truth for the DSE side).
function syncInvoicePaymentFor(salonId,category,date,newAmount){
  const invoices=loadVendorInvoices(salonId);
  for(const inv of invoices){
    if((inv.category||'')!==category)continue;
    const payments=inv.payments||[];
    const idx=payments.findIndex(p=>p.paidDate===date&&p.note==='Auto-recorded from Daily Sales & Exp');
    if(idx>=0){
      const nextPayments=payments.map((p,i)=>i===idx?{...p,paidAmount:Number(newAmount)||0}:p);
      saveVendorInvoices(invoices.map(x=>x.id===inv.id?{...x,payments:nextPayments}:x),salonId);
      return true;
    }
  }
  return false;
}
// Reverses what an auto-recorded payment added to Daily Sales & Exp — used when the invoice or
// payment it came from gets deleted in Vendor Sheet, so a deleted payment doesn't leave a stale
// amount sitting on Daily Sales & Exp with nothing behind it anymore. Subtracts (never overwrites)
// since the day's cell may hold more than just this one payment.
function clearDsePaymentAmountFor(salonId,category,date,amount){
  if(!date||!(Number(amount)>0))return;
  const ri=EXPENSE_ROWS.findIndex(r=>r.name===category);
  if(ri<0)return;
  const key=outletKey('salonos_daily_sales_data',salonId);
  let dseData={};try{dseData=JSON.parse(cachedLocalGet(key)||'{}');}catch(e){}
  const existing=Number((dseData[date]&&dseData[date][ri])||0);
  if(existing<=0)return;
  const nextVal=Math.max(0,existing-Number(amount));
  const nextDay={...(dseData[date]||{})};
  if(nextVal>0)nextDay[ri]=nextVal;else delete nextDay[ri];
  safeLocalSet(key,JSON.stringify({...dseData,[date]:nextDay}));
}
// Vendor invoice dates are stored as DD/MM/YYYY, but invoices saved by an older version of this
// app (before dates were made consistent across every entry point) may still be sitting in
// storage as ISO YYYY-MM-DD. Reads either format and returns {y,m,d} (m is 1-12), or null.
function parseInvoiceDateFlexible(str){
  const s=String(str||'').trim();
  if(!s)return null;
  if(s.indexOf('/')!==-1){
    const p=s.split('/');
    if(p.length===3&&p[2].length===4){const d=Number(p[0]),m=Number(p[1]),y=Number(p[2]);if(d&&m&&y)return{y,m,d};}
  }
  if(s.indexOf('-')!==-1){
    const p=s.split('-');
    if(p.length===3&&p[0].length===4){const y=Number(p[0]),m=Number(p[1]),d=Number(p[2]);if(d&&m&&y)return{y,m,d};}
  }
  return null;
}
// Vendor invoices used to have no id at all — every screen addressed them by their position in
// the array (editInvoiceIdx, payForm.invoiceIdx, "realIdx"...), which breaks the moment that
// position shifts under a filtered/sorted view. This backfills a stable id ('VI-0001', ...) onto
// any invoice that doesn't already have one — old records loaded from storage included — so
// every screen can address an invoice by identity instead of position. Safe to call repeatedly:
// invoices that already have an id are left untouched.
function ensureVendorInvoiceIds(list){
  if(!Array.isArray(list)||!list.length)return list;
  let n=Math.max(0,...list.map(inv=>Number(String(inv&&inv.id||'').replace(/\D/g,''))||0));
  return list.map(inv=>{
    const withId=(inv&&inv.id)?inv:{...inv,id:'VI-'+String(++n).padStart(4,'0')};
    return{...withId,payments:ensurePaymentIds(withId.payments)};
  });
}
// Payments nested inside an invoice used to be addressed purely by their position in the array
// (paymentIdx) — same failure mode as the invoice-level bug above, one level down: delete payment
// 0, and whatever used to be payment 1 silently becomes the new payment 0. Ids only need to be
// unique within one invoice's own payments list, since every consumer already looks the invoice
// up first.
function ensurePaymentIds(payments){
  if(!Array.isArray(payments)||!payments.length)return payments||[];
  let n=Math.max(0,...payments.map(p=>Number(String(p&&p.id||'').replace(/\D/g,''))||0));
  return payments.map(p=>(p&&p.id)?p:{...p,id:'PMT-'+String(++n).padStart(3,'0')});
}
// Outstanding (unpaid balance, not a Performa Invoice) vendor invoices matching a given Category —
// used to gate certain Daily Sales & Exp rows (e.g. DG Rent) so a cash payment can only be entered
// when there's a real invoice behind it to justify the expense.
function outstandingVendorInvoicesFor(salonId,category){
  return loadVendorInvoices(salonId).filter(inv=>{
    if(inv.docNature==='Performa Invoice')return false;
    if((inv.category||'')!==category)return false;
    const paid=(inv.payments||[]).reduce((s,p)=>s+(Number(p.paidAmount)||0),0);
    return(Number(inv.amount)||0)-paid>0;
  });
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// TALLY EXPORT — generates Tally's own native XML import format (Gateway of Tally → Import
// Data → Masters, then Vouchers). This is the format Tally itself uses for import/export, the
// same one every paid "Excel-to-Tally" connector ultimately produces under the hood — free, and
// far more reliable than an XLS template, since Tally's XLS-based import is limited and versions
// inconsistently between releases whereas XML import has been stable for over a decade.
// A live, always-on two-way connector (like the paid ODBC-based products) isn't something a
// browser page can be — it would need to run alongside a locally-installed Tally and stay
// connected, which is outside what a single downloadable HTML file can do. What IS offered below
// is the complete, working half of that: one click produces the exact file Tally expects.
// ══════════════════════════════════════════════════════════════════════════════════════════

function escapeTallyXml(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// Vendor invoice dates are DD/MM/YYYY (or legacy ISO on very old records) — Tally's XML wants
// a bare YYYYMMDD with no separators, regardless of which format the source date is in.
function toTallyDate(dateStr){
  const p=parseInvoiceDateFlexible(dateStr);
  if(!p)return '';
  return String(p.y)+String(p.m).padStart(2,'0')+String(p.d).padStart(2,'0');
}
function tallyEnvelope(reportName,messagesXml){
  return '<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA>'
    +'<REQUESTDESC><REPORTNAME>'+reportName+'</REPORTNAME></REQUESTDESC>'
    +'<REQUESTDATA>'+messagesXml+'</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>';
}
// ── Which ledgers this outlet has already pushed to Tally — purely local bookkeeping, so it
// works reliably regardless of whether Tally is even reachable. Marked synced whenever a Masters
// export (full or "new only") is downloaded, on the assumption it gets imported; a brand new
// Vendor or a Category seen for the first time shows up as unsynced until the next export. ──
function loadTallySyncedLedgers(salonId){
  try{const raw=cachedLocalGet(outletKey('salonos_tally_synced_ledgers',salonId));if(raw!==null){const p=JSON.parse(raw);if(p&&typeof p==='object')return p;}}catch(e){}
  return{vendors:{},categories:{},bank:false};
}
function saveTallySyncedLedgers(synced,salonId){safeLocalSet(outletKey('salonos_tally_synced_ledgers',salonId),JSON.stringify(synced));}
// ── Tally XML *export* request (not import) — asks Tally itself for its current list of ledger
// names, via the same TDL Collection mechanism every Tally integration tool uses. Reading the
// response requires a real (non-opaque) fetch, unlike the existing Direct Push feature which
// deliberately uses no-cors — Tally's built-in XML/HTTP server doesn't send CORS headers by
// default, so this will often be blocked by the browser even when Tally is running and
// reachable. Treat it the same way as Direct Push: worth trying, not guaranteed. ──
function buildTallyLedgerListRequestXml(company){
  return '<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>List of Ledgers</ID></HEADER>'
    +'<BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>'+(company?escapeTallyXml(company):'##SVCurrentCompany')+'</SVCURRENTCOMPANY></STATICVARIABLES>'
    +'<TDL><TDLMESSAGE><COLLECTION NAME="List of Ledgers" ISINITIALIZE="Yes"><TYPE>Ledger</TYPE><FETCH>NAME, PARENT</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>';
}
// Ledgers with their Tally group — [{name,parent}].
function parseTallyLedgersDetailed(xmlText){
  try{
    const doc=new DOMParser().parseFromString(xmlText,'text/xml');
    if(doc.querySelector('parsererror'))return[];
    const seen=new Set(),out=[];
    Array.from(doc.getElementsByTagName('LEDGER')).forEach(el=>{
      const name=(el.getAttribute('NAME')||'').trim()||((el.getElementsByTagName('NAME')[0]||{}).textContent||'').trim();
      if(!name||seen.has(name))return;seen.add(name);
      out.push({name,parent:((el.getElementsByTagName('PARENT')[0]||{}).textContent||'').trim()});
    });
    return out.sort((a,b)=>a.name.localeCompare(b.name));
  }catch(e){return[];}
}

// ── SalonOS Tally Connector (tally-connector/SalonOS-Tally-Connector.ps1) ────────────────────────
// Browsers may not read Tally's XML-server replies, so a small relay runs next to the browser and
// forwards requests to Tally (local PC, office server via -TallyHost, or inside a cloud desktop).
// Its address/token/company are this browser's own settings (not synced — they're per computer).
const TALLY_CONNECTOR_DEFAULT='http://localhost:9123';
function loadTallyConnectorCfg(){try{const c=JSON.parse(localStorage.getItem('sos_tally_connector')||'null');if(c&&typeof c==='object')return{url:TALLY_CONNECTOR_DEFAULT,token:'',company:'',...c,autoCreate:false};}catch(e){}return{url:TALLY_CONNECTOR_DEFAULT,token:'',company:'',autoCreate:false};}
function saveTallyConnectorCfg(cfg){try{localStorage.setItem('sos_tally_connector',JSON.stringify(cfg));}catch(e){}}
async function tallyConnectorCall(cfg,path,xml){
  // "Disconnect" on Tally Integration: SalonOS doesn't talk to Tally at all on this computer.
  if(cfg&&cfg.disconnected){const err=new Error('Tally is disconnected in SalonOS on this computer — click Connect on Tally Integration.');err.disconnected=true;throw err;}
  const base=String(cfg.url||TALLY_CONNECTOR_DEFAULT).replace(/\/+$/,'');
  const headers={};if(cfg.token)headers['X-SalonOS-Token']=cfg.token;
  let res;
  try{
    res=await fetch(base+path,xml==null?{headers,cache:'no-store'}:{method:'POST',headers:{...headers,'Content-Type':'text/xml'},body:xml,cache:'no-store'});
  }catch(e){
    const err=new Error('The SalonOS Tally Connector is not running on this computer — install it once (Settings below) or restart the computer, then it is found automatically.');
    err.notRunning=true;throw err;
  }
  const text=await res.text();
  if(!res.ok){let msg='Connector error '+res.status;try{const j=JSON.parse(text);if(j.error)msg=j.error;}catch(e){}const err=new Error(msg);if(res.status===401)err.needsToken=true;throw err;}
  return text;
}
async function tallyConnectorStatus(cfg){return JSON.parse(await tallyConnectorCall(cfg,'/status'));}
// Finds the connector on this computer without anyone typing its address: the saved address first,
// then localhost ports 9123–9126. Returns {url,status} or throws the
// first address's error (e.g. notRunning, needsToken).
async function tallyFindConnector(cfg){
  const saved=String(cfg.url||TALLY_CONNECTOR_DEFAULT).replace(/\/+$/,'');
  try{return{url:saved,status:await tallyConnectorStatus({...cfg,url:saved})};}
  catch(first){
    if(!first.notRunning)throw first;
    const tries=[];
    for(let port=9123;port<=9126;port++){const u='http://localhost:'+port;if(u!==saved)tries.push(u);} // the connector only listens on localhost
    const probe=async u=>{
      const ctl=typeof AbortController!=='undefined'?new AbortController():null;
      const t=setTimeout(()=>ctl&&ctl.abort(),2500);
      try{const r=await fetch(u+'/status',{cache:'no-store',signal:ctl&&ctl.signal,headers:cfg.token?{'X-SalonOS-Token':cfg.token}:{}});
        const j=await r.json();if(j&&j.connector)return{url:u,status:j};}catch(e){}finally{clearTimeout(t);}
      return null;
    };
    const found=(await Promise.all(tries.map(probe))).find(Boolean);
    if(found)return found;
    throw first;
  }
}
// Tally works on the company chosen in SalonOS (when several are open) — added to every request.
function withTallyCompany(xml,company){
  if(!company)return xml;
  const sv='<STATICVARIABLES><SVCURRENTCOMPANY>'+escapeTallyXml(company)+'</SVCURRENTCOMPANY></STATICVARIABLES>';
  if(xml.indexOf('</REPORTNAME>')>=0&&xml.indexOf('<SVCURRENTCOMPANY>')<0)return xml.replace('</REPORTNAME>','</REPORTNAME>'+sv);
  return xml.replace('##SVCurrentCompany',escapeTallyXml(company));
}
async function tallySend(cfg,xml){return tallyConnectorCall(cfg,'/tally',withTallyCompany(xml,cfg.company));}
function buildTallyCompanyListXml(){
  return '<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>SalonOS Companies</ID></HEADER>'
    +'<BODY><DESC><TDL><TDLMESSAGE><COLLECTION NAME="SalonOS Companies" ISINITIALIZE="Yes"><TYPE>Company</TYPE><FETCH>NAME</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>';
}
function parseTallyCompanies(xmlText){
  try{const doc=new DOMParser().parseFromString(xmlText,'text/xml');
    return Array.from(new Set(Array.from(doc.getElementsByTagName('COMPANY')).map(el=>(el.getAttribute('NAME')||((el.getElementsByTagName('NAME')[0]||{}).textContent)||'').trim()).filter(Boolean)));
  }catch(e){return[];}
}
// Tally's reply to an Import: counts plus any line errors.
function parseTallyImportResult(xmlText){
  const num=tag=>{const m=new RegExp('<'+tag+'>\\s*(-?\\d+)\\s*</'+tag+'>','i').exec(xmlText||'');return m?Number(m[1]):0;};
  const errs=[];const re=/<LINEERROR>([\s\S]*?)<\/LINEERROR>/gi;let m;while((m=re.exec(xmlText||''))&&errs.length<20)errs.push(m[1].trim());
  return{created:num('CREATED'),altered:num('ALTERED'),deleted:num('DELETED'),ignored:num('IGNORED'),errors:num('ERRORS'),exceptions:num('EXCEPTIONS'),lineErrors:errs};
}
function tallyResultText(r){
  return(r.created?r.created+' created':'')+(r.altered?(r.created?', ':'')+r.altered+' updated':'')+((!r.created&&!r.altered)?'nothing new':'')
    +(r.errors||r.exceptions?' · '+(r.errors+r.exceptions)+' rejected'+(r.lineErrors.length?' ('+r.lineErrors.slice(0,3).join('; ')+')':''):'');
}
// Ledger list last fetched from Tally for this outlet — shared with everyone who uses the outlet.
function loadTallyLedgerCache(salonId){try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_tally_ledgers',salonId))||'null');if(v&&Array.isArray(v.ledgers))return v;}catch(e){}return null;}
function saveTallyLedgerCache(salonId,v){safeLocalSet(outletKey('salonos_tally_ledgers',salonId),JSON.stringify(v));}
function parseTallyLedgerListResponse(xmlText){
  try{
    const doc=new DOMParser().parseFromString(xmlText,'text/xml');
    if(doc.querySelector('parsererror'))return[];
    const names=Array.from(doc.getElementsByTagName('LEDGER')).map(el=>el.getAttribute('NAME')||el.textContent.trim()).filter(Boolean);
    return Array.from(new Set(names)).sort();
  }catch(e){return[];}
}
function downloadTextFile(content,filename,mime){
  const blob=new Blob([content],{type:mime||'text/xml;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}

// ── Ledger name mapping — Tally matches purely by ledger NAME, so whatever name is used here
// must be an exact character-for-character match to what's created in Tally. Persisted per
// outlet so it only needs setting up once. ──
function loadTallyLedgerMap(salonId){
  try{const raw=cachedLocalGet(outletKey('salonos_tally_ledger_map',salonId));if(raw!==null){const p=JSON.parse(raw);if(p&&typeof p==='object')return p;}}catch(e){}
  return{bankLedger:'',vendors:{},categories:{}};
}
function saveTallyLedgerMap(map,salonId){safeLocalSet(outletKey('salonos_tally_ledger_map',salonId),JSON.stringify(map));}

// Sensible default Tally group for each invoice category — used both to suggest a Ledger Parent
// group when creating masters, and to decide whether an amount is Capex (Fixed Assets) vs a P&L
// expense (Purchase/Indirect Expense) for anyone reconciling against Tally afterwards.
function tallyGroupForCategory(category){
  if(category==='Fixed Assets')return'Fixed Assets';
  if(category==='Purchase of Cosmetic')return'Purchase Accounts';
  return'Indirect Expenses';
}

// ── Masters (Ledgers) XML — creates one LEDGER per vendor (under Sundry Creditors), one per
// unique invoice category (under the group implied by tallyGroupForCategory), the GST ledgers
// actually used (CGST/SGST/IGST Input, only if any invoice has that tax), and the Bank ledger.
// Import this FIRST — vouchers referencing a ledger that doesn't exist in Tally will be
// rejected, so masters have to land before any Purchase/Payment/Receipt voucher does. ──
function buildTallyMastersXml(vendors,categories,gstTypesUsed,bankLedgerName,vendorLedgerNameFor,categoryLedgerNameFor,gstInputBlocked,extraLedgers){
  const msgs=[];
  vendors.forEach(v=>{
    const name=vendorLedgerNameFor(v.id);
    if(!name)return;
    msgs.push('<LEDGER NAME="'+escapeTallyXml(name)+'" ACTION="Create"><PARENT>Sundry Creditors</PARENT>'
      +(v.gst?'<PARTYGSTIN>'+escapeTallyXml(v.gst)+'</PARTYGSTIN><GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>':'<GSTREGISTRATIONTYPE>Unregistered</GSTREGISTRATIONTYPE>')
      +'<ISBILLWISEON>Yes</ISBILLWISEON></LEDGER>');
  });
  categories.forEach(cat=>{
    const name=categoryLedgerNameFor(cat);
    if(!name)return;
    msgs.push('<LEDGER NAME="'+escapeTallyXml(name)+'" ACTION="Create"><PARENT>'+escapeTallyXml(tallyGroupForCategory(cat))+'</PARENT></LEDGER>');
  });
  // No GST Input ledgers at all when Input is blocked — there's no recoverable GST asset to book,
  // so Purchase Vouchers debit the category ledger with the full invoice amount instead (see
  // buildTallyPurchaseVouchersXml), and these ledgers would simply never be used.
  if(!gstInputBlocked){
    if(gstTypesUsed.igst)msgs.push('<LEDGER NAME="IGST Input" ACTION="Create"><PARENT>Duties &amp; Taxes</PARENT><TAXTYPE>GST</TAXTYPE></LEDGER>');
    if(gstTypesUsed.cgst)msgs.push('<LEDGER NAME="CGST Input" ACTION="Create"><PARENT>Duties &amp; Taxes</PARENT><TAXTYPE>GST</TAXTYPE></LEDGER>');
    if(gstTypesUsed.sgst)msgs.push('<LEDGER NAME="SGST Input" ACTION="Create"><PARENT>Duties &amp; Taxes</PARENT><TAXTYPE>GST</TAXTYPE></LEDGER>');
  }
  if(bankLedgerName)msgs.push('<LEDGER NAME="'+escapeTallyXml(bankLedgerName)+'" ACTION="Create"><PARENT>Bank Accounts</PARENT></LEDGER>');
  (extraLedgers||[]).forEach(l=>msgs.push('<LEDGER NAME="'+escapeTallyXml(l.name)+'" ACTION="Create"><PARENT>'+escapeTallyXml(l.parent)+'</PARENT></LEDGER>'));
  const tallyMsg='<TALLYMESSAGE xmlns:UDF="TallyUDF">'+msgs.join('')+'</TALLYMESSAGE>';
  return tallyEnvelope('All Masters',tallyMsg);
}
// Same ledger list buildTallyMastersXml would create, but as plain data for an on-screen preview
// table rather than XML — so the person can see exactly what's about to be created in Tally
// before downloading anything.
function tallyMastersPreviewRows(vendors,categories,gstTypesUsed,bankLedgerName,vendorLedgerNameFor,categoryLedgerNameFor,gstInputBlocked,extraLedgers){
  const rows=[];
  vendors.forEach(v=>{
    const name=vendorLedgerNameFor(v.id);
    if(!name)return;
    rows.push({name,parent:'Sundry Creditors',type:'Vendor',note:v.gst?'GSTIN: '+v.gst:'Unregistered'});
  });
  categories.forEach(cat=>{
    const name=categoryLedgerNameFor(cat);
    if(!name)return;
    rows.push({name,parent:tallyGroupForCategory(cat),type:'Category',note:cat});
  });
  if(!gstInputBlocked){
    if(gstTypesUsed.igst)rows.push({name:'IGST Input',parent:'Duties & Taxes',type:'GST',note:'Recoverable input credit'});
    if(gstTypesUsed.cgst)rows.push({name:'CGST Input',parent:'Duties & Taxes',type:'GST',note:'Recoverable input credit'});
    if(gstTypesUsed.sgst)rows.push({name:'SGST Input',parent:'Duties & Taxes',type:'GST',note:'Recoverable input credit'});
  }
  if(bankLedgerName)rows.push({name:bankLedgerName,parent:'Bank Accounts',type:'Bank',note:''});
  (extraLedgers||[]).forEach(l=>rows.push({name:l.name,parent:l.parent,type:l.type||'Other',note:l.note||''}));
  return rows;
}

// ── Purchase Vouchers XML — one VOUCHER per Vendor invoice (Performa Invoices are excluded;
// they aren't a real transaction until converted to a Tax Invoice).
//  • GST Input available: Dr the category ledger with the Taxable Value, Dr the GST ledgers
//    (IGST/CGST/SGST) with their own amounts as recoverable input credit, Cr the vendor for the
//    full invoice amount.
//  • GST Input blocked: no recoverable input exists, so the whole invoice Amount (Taxable + GST)
//    is debited to the category ledger directly — no separate GST ledger entries at all.
// Amount sign convention: ISDEEMEDPOSITIVE=Yes → Debit (positive), No → Credit (negative) —
// this is Tally's own convention, not a guess. ──
function buildTallyPurchaseVouchersXml(invoices,vendorLedgerNameFor,categoryLedgerNameFor,gstInputBlocked){
  const msgs=invoices.filter(inv=>inv.docNature!=='Performa Invoice').map(inv=>{
    const vendorLedger=vendorLedgerNameFor(inv.vendorId);
    const catLedger=categoryLedgerNameFor(inv.category)||'Purchase Accounts';
    const taxable=Number(inv.taxable)||0;
    const total=Number(inv.amount)||0;
    const entries=[];
    if(gstInputBlocked){
      entries.push('<ALLLEDGERENTRIES.LIST><LEDGERNAME>'+escapeTallyXml(catLedger)+'</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>'+total.toFixed(2)+'</AMOUNT></ALLLEDGERENTRIES.LIST>');
    }else{
      entries.push('<ALLLEDGERENTRIES.LIST><LEDGERNAME>'+escapeTallyXml(catLedger)+'</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>'+taxable.toFixed(2)+'</AMOUNT></ALLLEDGERENTRIES.LIST>');
      if(Number(inv.igst))entries.push('<ALLLEDGERENTRIES.LIST><LEDGERNAME>IGST Input</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>'+Number(inv.igst).toFixed(2)+'</AMOUNT></ALLLEDGERENTRIES.LIST>');
      if(Number(inv.cgst))entries.push('<ALLLEDGERENTRIES.LIST><LEDGERNAME>CGST Input</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>'+Number(inv.cgst).toFixed(2)+'</AMOUNT></ALLLEDGERENTRIES.LIST>');
      if(Number(inv.sgst))entries.push('<ALLLEDGERENTRIES.LIST><LEDGERNAME>SGST Input</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>'+Number(inv.sgst).toFixed(2)+'</AMOUNT></ALLLEDGERENTRIES.LIST>');
      if(Number(inv.roundOff))entries.push('<ALLLEDGERENTRIES.LIST><LEDGERNAME>Round Off</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>'+Number(inv.roundOff).toFixed(2)+'</AMOUNT></ALLLEDGERENTRIES.LIST>');
    }
    entries.push('<ALLLEDGERENTRIES.LIST><LEDGERNAME>'+escapeTallyXml(vendorLedger)+'</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>-'+total.toFixed(2)+'</AMOUNT></ALLLEDGERENTRIES.LIST>');
    return '<VOUCHER VCHTYPE="Purchase" ACTION="Create">'
      +'<DATE>'+toTallyDate(inv.bookingDate||inv.invoiceDate)+'</DATE>'
      +'<VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>'
      +'<REFERENCE>'+escapeTallyXml(inv.invoiceNo)+'</REFERENCE>'
      +'<NARRATION>'+escapeTallyXml((inv.desc||inv.category||'')+' — Invoice '+(inv.invoiceNo||''))+'</NARRATION>'
      +'<PARTYLEDGERNAME>'+escapeTallyXml(vendorLedger)+'</PARTYLEDGERNAME>'
      +entries.join('')
      +'</VOUCHER>';
  });
  return tallyEnvelope('Vouchers','<TALLYMESSAGE xmlns:UDF="TallyUDF">'+msgs.join('')+'</TALLYMESSAGE>');
}

// ── Bank Statement Vouchers XML — a debit row (money out) becomes a Payment voucher, a credit
// row (money in) becomes a Receipt voucher. The counterparty ledger is guessed via the same
// vendor-name-matching Bank Statement already uses for reconciliation; anything that can't be
// matched falls back to a generic ledger so the voucher still balances, clearly named so it's
// obvious in Tally that it needs manual reclassification. ──
// Where the other side of a bank line goes in Tally, in this order:
//  1. the supplier of the bill it is linked to (or the vendor chosen for it) — its MAPPED ledger name;
//  2. the ledger for its Nature on Bank Statement (Salary, UPI Settlement, TDS, Bank Charges…), from
//     the Tally Export mapping or TALLY_NATURE_LEDGERS;
//  3. a supplier named in the narration;
//  4. the Suspense ledger, to be reclassified in Tally.
// {ledger, parent, kind:'vendor'|'nature'|'suspense', nature, contra}
const TALLY_SUSPENSE_LEDGER='Suspense Account (Review in Tally)';
const TALLY_NATURE_LEDGERS={
  'Collection':['Collections Receivable','Current Assets'],
  'Cash Deposit':['Cash','Cash-in-Hand'],
  'Card Settlement':['Card Settlement Receivable','Current Assets'],
  'UPI Settlement':['UPI Settlement Receivable','Current Assets'],
  'Swiggy Settlement':['Swiggy Receivable','Current Assets'],
  'Zomato Settlement':['Zomato Receivable','Current Assets'],
  'EazyDiner Settlement':['EazyDiner Receivable','Current Assets'],
  'Bank Charges':['Bank Charges','Indirect Expenses'],
  'Interest':['Bank Interest','Indirect Incomes'],
  'Salary':['Salaries & Wages','Indirect Expenses'],
  'Incentive':['Staff Incentive','Indirect Expenses'],
  'Daily Incentive':['Staff Incentive','Indirect Expenses'],
  'Advance Salary':['Staff Advances','Loans & Advances (Asset)'],
  'TDS':['TDS Payable','Duties & Taxes'],
  'GST':['GST Payable','Duties & Taxes'],
  'ESIC Payment':['ESIC Payable','Current Liabilities'],
  'Electricity Expenses':['Electricity Expenses','Indirect Expenses'],
  'Drycleaning Expenses':['Drycleaning Expenses','Indirect Expenses'],
  'Telephone & Internet Expenses':['Telephone & Internet Expenses','Indirect Expenses'],
  'DG Rent':['DG Rent','Indirect Expenses'],
  'Royalty':['Royalty','Indirect Expenses'],
  'Rent':['Rent','Indirect Expenses'],
  'Tax Payment':['Tax Payments','Duties & Taxes'],
};
// The bank and account number of the last imported bank statement (read from the statement's own
// header lines) — {bank, accountNo, file, at}. Used to pick this outlet's bank ledger in Tally.
function loadBankStatementInfo(salonId){try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_bank_statement_info',salonId))||'null');return v&&typeof v==='object'?v:null;}catch(e){return null;}}
function saveBankStatementInfo(salonId,info){safeLocalSet(outletKey('salonos_bank_statement_info',salonId),JSON.stringify({...info,at:new Date().toISOString()}));}
// Account number written in a statement's header lines ("Account No : 50200012345678", "A/C NO. XXXX5678").
function bankAccountNoFromHeader(rows){
  const text=(rows||[]).slice(0,40).map(r=>(Array.isArray(r)?r:[r]).map(c=>String(c==null?'':c)).join(' ')).join('\n');
  const m=text.match(/(?:a\/?c|account)\s*(?:no\.?|number|num)?\s*[:.\-]?\s*([0-9xX*]{6,20})/i);
  return m?m[1]:'';
}
// Tally bank ledgers (under Bank Accounts / Bank OD / OCC) ranked for this outlet, from the outlet's
// bank details (Master Sheet) and the last imported statement: account number's last 4 digits in
// the ledger name weigh most, then the bank's name (HDFC, SBI, ICICI…). {name, parent, score, why}.
function tallyBankLedgerSuggestions(salonId,ledgers,statementBank){
  const o=outletSettings(salonId)||{},info=loadBankStatementInfo(salonId)||{};
  const accts=[o.bankAccountNo,info.accountNo].map(a=>String(a||'').replace(/[^0-9]/g,'')).filter(a=>a.length>=4);
  const names=[o.bankName,info.bank,statementBank].filter(Boolean).map(String);
  const STOP=new Set(['bank','of','the','ltd','limited','india','co','and','corporation','cooperative','co-operative','small','finance']);
  const ALIAS={'state bank of india':['sbi','state bank'],'bank of baroda':['bob','baroda'],'punjab national bank':['pnb','punjab national'],'bank of india':['boi'],'union bank of india':['union bank','ubi'],'indian overseas bank':['iob'],'central bank of india':['cbi','central bank'],'kotak mahindra bank':['kotak'],'au small finance bank':['au bank','au sfb'],'idfc first bank':['idfc'],'axis bank':['axis'],'yes bank':['yes bank'],'indusind bank':['indusind'],'icici bank':['icici'],'hdfc bank':['hdfc'],'canara bank':['canara'],'federal bank':['federal'],'rbl bank':['rbl']};
  const norm=x=>String(x||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
  const keys=new Set();
  names.forEach(n=>{const nn=norm(n);if(!nn)return;(ALIAS[nn]||[]).forEach(k=>keys.add(k));
    nn.split(' ').filter(w=>w.length>1&&!STOP.has(w)).forEach(w=>keys.add(w));
    const acr=nn.split(' ').filter(w=>w&&w!=='of'&&w!=='the').map(w=>w[0]).join('');if(acr.length>=2&&acr.length<=4)keys.add(acr);});
  const bankLedgers=(ledgers||[]).filter(l=>/bank|o\.?d\b|occ|cash credit|\bcc\b/i.test(String(l.parent||''))&&!/cash-in-hand/i.test(String(l.parent||'')));
  return bankLedgers.map(l=>{
    const n=norm(l.name),digits=String(l.name).replace(/[^0-9]/g,'');
    let score=0;const why=[];
    if(accts.some(a=>digits.length>=4&&(digits.includes(a.slice(-4))))){score+=0.6;why.push('account no. ends '+accts.find(a=>digits.includes(a.slice(-4))).slice(-4));}
    const k=[...keys].find(k=>(' '+n+' ').includes(' '+k+' '));
    if(k){score+=0.35;why.push('bank name “'+k.toUpperCase()+'”');}
    if(bankLedgers.length===1){score+=0.3;why.push('the only bank ledger in Tally');}
    return{name:l.name,parent:l.parent,score:Math.min(1,score),why:why.join(' · ')};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
}
function tallyNatureLedgerName(map,nature){return(map&&map.natures&&map.natures[nature])||(TALLY_NATURE_LEDGERS[nature]||[])[0]||'';}
function tallyBankCounterparty(r,vendors,vendorLedgerNameFor,map){
  const vName=vendorLedgerNameFor||(id=>{const v=vendors.find(x=>x.id===id);return v?v.name:id;});
  let v=null;
  const k=String(r.linkedInvoice||'');
  if(k&&k.indexOf('due|')!==0){const vid=k.split(/[|,]/)[0];v=vendors.find(x=>String(x.id)===vid)||null;}
  if(!v&&r.vendorOverride)v=vendors.find(x=>x.name===r.vendorOverride)||null;
  if(v)return{ledger:vName(v.id),parent:'Sundry Creditors',kind:'vendor',vendorId:v.id};
  if(r.nature&&TALLY_NATURE_LEDGERS[r.nature]){
    const parent=TALLY_NATURE_LEDGERS[r.nature][1];
    return{ledger:tallyNatureLedgerName(map,r.nature),parent,kind:'nature',nature:r.nature,contra:parent==='Cash-in-Hand'||parent==='Bank Accounts'};
  }
  const m=findVendorMatch(r.description,vendors);
  if(m)return{ledger:vName(m.id),parent:'Sundry Creditors',kind:'vendor',vendorId:m.id};
  return{ledger:TALLY_SUSPENSE_LEDGER,parent:'Suspense A/c',kind:'suspense'};
}
// Tally voucher type for a bank line: Contra between bank and cash, else Payment (money out) / Receipt (in).
function tallyBankVoucherType(r,cp){return cp.contra?'Contra':(Number(r.debit)>0?'Payment':'Receipt');}
// opts: {vendorLedgerNameFor, map} — without them (older callers) vendors keep their own names.
function buildTallyBankVouchersXml(rows,bankLedgerName,vendors,opts){
  const o=opts||{};
  const msgs=rows.filter(r=>r.debit||r.credit).map(r=>{
    const isDebit=Number(r.debit)>0;
    const amt=isDebit?Number(r.debit):Number(r.credit);
    const cp=tallyBankCounterparty(r,vendors,o.vendorLedgerNameFor,o.map);
    const counterparty=cp.ledger;
    const vtype=tallyBankVoucherType(r,cp);
    const p=String(r.transactionDate||'').split('/');
    const iso=p.length===3?p[2]+'-'+p[1]+'-'+p[0]:'';
    const entries=isDebit
      ?[ '<ALLLEDGERENTRIES.LIST><LEDGERNAME>'+escapeTallyXml(counterparty)+'</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>'+amt.toFixed(2)+'</AMOUNT></ALLLEDGERENTRIES.LIST>',
         '<ALLLEDGERENTRIES.LIST><LEDGERNAME>'+escapeTallyXml(bankLedgerName)+'</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>-'+amt.toFixed(2)+'</AMOUNT></ALLLEDGERENTRIES.LIST>' ]
      :[ '<ALLLEDGERENTRIES.LIST><LEDGERNAME>'+escapeTallyXml(bankLedgerName)+'</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>'+amt.toFixed(2)+'</AMOUNT></ALLLEDGERENTRIES.LIST>',
         '<ALLLEDGERENTRIES.LIST><LEDGERNAME>'+escapeTallyXml(counterparty)+'</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>-'+amt.toFixed(2)+'</AMOUNT></ALLLEDGERENTRIES.LIST>' ];
    return '<VOUCHER VCHTYPE="'+vtype+'" ACTION="Create">'
      +'<DATE>'+iso.replace(/-/g,'')+'</DATE>'
      +'<VOUCHERTYPENAME>'+vtype+'</VOUCHERTYPENAME>'
      +'<NARRATION>'+escapeTallyXml(r.description||'')+(r.refNo?' (Ref: '+escapeTallyXml(r.refNo)+')':'')+'</NARRATION>'
      +'<PARTYLEDGERNAME>'+escapeTallyXml(counterparty)+'</PARTYLEDGERNAME>'
      +entries.join('')
      +'</VOUCHER>';
  });
  return tallyEnvelope('Vouchers','<TALLYMESSAGE xmlns:UDF="TallyUDF">'+msgs.join('')+'</TALLYMESSAGE>');
}
// Ledgers the vouchers need besides vendors / categories / GST / bank: Round Off (purchase round-off),
// the bank-Nature ledgers actually used, and Suspense — so Tally never rejects a voucher for a missing
// ledger that SalonOS itself chose. Names already covered by another row are left out.
function tallyExtraLedgers(invoices,bankRows,vendors,vendorLedgerNameFor,map,gstInputBlocked,taken){
  const out=[],seen=new Set((taken||[]).map(n=>String(n).toLowerCase()));
  const add=(name,parent,type,note)=>{const k=String(name||'').toLowerCase();if(!name||seen.has(k))return;seen.add(k);out.push({name,parent,type,note});};
  if(!gstInputBlocked&&invoices.some(i=>i.docNature!=='Performa Invoice'&&Number(i.roundOff)))add('Round Off','Indirect Expenses','System','Purchase round-off');
  bankRows.filter(r=>r.debit||r.credit).forEach(r=>{
    const cp=tallyBankCounterparty(r,vendors,vendorLedgerNameFor,map);
    if(cp.kind==='nature')add(cp.ledger,cp.parent,'Bank type','Bank Statement: '+cp.nature);
    else if(cp.kind==='suspense')add(cp.ledger,cp.parent,'System','Bank lines with no supplier or type — reclassify in Tally');
  });
  return out;
}

// ── Shared: Card/UPI Settlement credit totals from Bank Statement, grouped by Date as per
// Cradlee — used by both Bank Statement's Settlement Reconciliation and Collection Reco's
// Collection Sheet, so the two tabs always agree on the same linked figures. ──
function loadBankSettlementsByDate(salonId){
  let bankRows=[];
  try{bankRows=JSON.parse(cachedLocalGet(outletKey('salonos_bank_statement_rows',salonId))||'[]');}catch(e){}
  const map={};
  bankRows.forEach(r=>{
    if(!r.cradleeDate||(r.nature!=='Card Settlement'&&r.nature!=='UPI Settlement'))return;
    if(!map[r.cradleeDate])map[r.cradleeDate]={card:0,upi:0};
    if(r.nature==='Card Settlement')map[r.cradleeDate].card+=r.credit;
    else map[r.cradleeDate].upi+=r.credit;
  });
  return map;
}

// Real penalty total for one employee in one calendar month, from Penalty Sheet's own records
// (matched by employee name, same as Penalty Sheet's own data model).
function penaltySumFor(salonId,empName,year,month){
  let list=[];
  try{list=JSON.parse(cachedLocalGet(outletKey('salonos_penalties',salonId))||'[]');}catch(e){}
  return list.filter(p=>p.emp===empName&&p.date).filter(p=>{
    const d=new Date(p.date+'T00:00:00');
    return!isNaN(d)&&d.getFullYear()===year&&d.getMonth()===month;
  }).reduce((s,p)=>s+(Number(p.amount)||0),0);
}
// Real monthly advance deduction for one employee, from Advance Sheet's own Active records.
// If an advance has a month-wise deduction schedule (set when the advance was recorded), the
// exact amount planned for THIS year/month is used — so an installment that was manually
// amended for a particular month (e.g. skipped, or reduced) is honored here instead of always
// re-applying the flat monthly figure. Advances recorded before scheduling existed have no
// schedule, so they still fall back to the flat "repayment" amount, capped at what's outstanding.
function scheduledAmountFor(adv,year,month){
  if(!Array.isArray(adv.schedule)||!adv.schedule.length)return null;
  const key=year+'-'+String(month+1).padStart(2,'0');
  const row=adv.schedule.find(s=>s.month===key);
  return row?Number(row.amount)||0:0; // has a schedule but nothing planned for this month → 0, not the flat fallback
}
function advanceDeductionFor(salonId,empName,source,year,month){
  let list=[];
  try{list=JSON.parse(cachedLocalGet(outletKey('salonos_advances',salonId))||'[]');}catch(e){}
  return list.filter(a=>a.emp===empName&&a.status==='Active'&&(a.deductFrom||'Salary')===(source||'Salary')).reduce((s,a)=>{
    const scheduled=(year!=null&&month!=null)?scheduledAmountFor(a,year,month):null;
    const planned=scheduled!==null?scheduled:(Number(a.repayment)||0);
    const rep=Math.min(planned,Number(a.outstanding)||0);
    return s+Math.max(0,rep);
  },0);
}
// Op./Curr/Next Month Advance — splits an employee's outstanding advance balance (for the given
// recovery source) across the three ledger columns by each advance's own disbursal date, instead
// of lumping every active advance into "Op. Advance" regardless of when it was actually given.
// An advance dated in the selected month is "Curr Month Adv"; dated the month right after is
// "Next Month Adv" (given ahead of time); anything else (earlier, or further out) falls into
// "Op. Advance" as the pre-existing balance carried in. Advances with no date on record (very
// old data, predating this field) also fall into Op. Advance — the safest default, since treating
// an undated advance as "this month's" would be a guess with no basis.
// nextCutoffDate (optional) narrows "Next Month Adv" down to just the advances dated on or before
// that date — once "Adjust now" has picked a cutoff for pulling a Next Month Advance forward, the
// column shows the amount that cutoff actually covers, rather than the whole month's balance
// regardless of what's genuinely being adjusted.
function advanceBalanceSplitFor(salonId,empName,source,year,month,nextCutoffDate){
  let list=[];
  try{list=JSON.parse(cachedLocalGet(outletKey('salonos_advances',salonId))||'[]');}catch(e){}
  const nextY=month===11?year+1:year,nextM=month===11?0:month+1;
  let prev=0,curr=0,next=0;
  list.filter(a=>a.emp===empName&&a.status==='Active'&&(a.deductFrom||'Salary')===(source||'Salary')).forEach(a=>{
    const outstanding=Math.max(0,Number(a.outstanding)||0);
    if(outstanding<=0)return;
    const d=a.date?new Date(a.date+'T00:00:00'):null;
    if(d&&!isNaN(d)&&d.getFullYear()===year&&d.getMonth()===month)curr+=outstanding;
    else if(d&&!isNaN(d)&&d.getFullYear()===nextY&&d.getMonth()===nextM){
      if(nextCutoffDate&&a.date>nextCutoffDate)return; // dated after the chosen cutoff — not part of what's being adjusted, so leave it out
      next+=outstanding;
    }
    else prev+=outstanding;
  });
  return{prev,curr,next};
}

// ── Professional Tax — states that levy PT under their own Professional Tax Act, with default
// monthly slabs (₹ Gross Salary → ₹ PT). States not in this list don't levy PT at all. These
// default figures are commonly-cited amounts, kept EDITABLE per outlet from Salary Working —
// state governments revise PT slabs by notification from time to time, so always verify against
// the current Act for that state before relying on these for actual statutory filings. Tamil Nadu
// and Kerala legally charge PT half-yearly rather than monthly — the figures below are a monthly
// equivalent for payroll convenience; adjust manually around their September/March due dates.
const PT_APPLICABLE_STATES=['Andhra Pradesh','Assam','Bihar','Chhattisgarh','Gujarat','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Puducherry','Sikkim','Tamil Nadu','Telangana','Tripura','West Bengal'];
// Full list for the Outlet's State dropdown — includes states with no PT (Delhi, UP, Rajasthan,
// etc.) too, so ptAppliesToState() can reliably match against a fixed, unambiguous value.
const INDIA_STATES_UTS=['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'];
// ── Bank Details — common Indian banks for the dropdown, and a live IFSC lookup. A true
// "IFSC dropdown per bank" isn't practical to embed offline (100,000+ branch codes across all
// banks, and new branches open/close/merge regularly), so instead: pick the Bank Name, type or
// paste the IFSC off a chequebook/passbook, and Branch (and Bank Name, if it doesn't already
// match) auto-fills from Razorpay's free public IFSC lookup — the same real RBI-sourced data a
// dropdown would have had to be built from anyway, just looked up live instead of going stale. ──
const INDIAN_BANKS=['State Bank of India','HDFC Bank','ICICI Bank','Axis Bank','Kotak Mahindra Bank','Punjab National Bank','Bank of Baroda','Canara Bank','Union Bank of India','IDFC FIRST Bank','Yes Bank','IndusInd Bank','Bank of India','Central Bank of India','Indian Bank','Indian Overseas Bank','UCO Bank','Bank of Maharashtra','Punjab & Sind Bank','Federal Bank','South Indian Bank','Karnataka Bank','City Union Bank','RBL Bank','Bandhan Bank','IDBI Bank','AU Small Finance Bank','Equitas Small Finance Bank','Ujjivan Small Finance Bank','Karur Vysya Bank','Tamilnad Mercantile Bank','Dhanlaxmi Bank','DCB Bank','Jammu & Kashmir Bank','Other'];
// The standard 4-letter bank code every IFSC starts with (position 1-4, before the mandatory
// '0' at position 5) — lets Bank Name and IFSC be cross-checked even when the live lookup above
// didn't run (offline, lookup failed) or the person changed the Bank Name dropdown afterward
// without re-entering the IFSC. Covers the banks in INDIAN_BANKS above.
const IFSC_BANK_CODES={
  SBIN:'State Bank of India',HDFC:'HDFC Bank',ICIC:'ICICI Bank',UTIB:'Axis Bank',KKBK:'Kotak Mahindra Bank',
  PUNB:'Punjab National Bank',BARB:'Bank of Baroda',CNRB:'Canara Bank',UBIN:'Union Bank of India',IDFB:'IDFC FIRST Bank',
  YESB:'Yes Bank',INDB:'IndusInd Bank',BKID:'Bank of India',CBIN:'Central Bank of India',IDIB:'Indian Bank',
  IOBA:'Indian Overseas Bank',UCBA:'UCO Bank',MAHB:'Bank of Maharashtra',PSIB:'Punjab & Sind Bank',FDRL:'Federal Bank',
  SIBL:'South Indian Bank',KARB:'Karnataka Bank',CIUB:'City Union Bank',RATN:'RBL Bank',BDBL:'Bandhan Bank',
  IBKL:'IDBI Bank',AUBL:'AU Small Finance Bank',ESFB:'Equitas Small Finance Bank',UJVN:'Ujjivan Small Finance Bank',
  KVBL:'Karur Vysya Bank',TMBL:'Tamilnad Mercantile Bank',DLXB:'Dhanlaxmi Bank',DCBL:'DCB Bank',JAKA:'Jammu & Kashmir Bank'
};
// Returns null if either field is empty/not-yet-valid (nothing to check yet), or a short message
// if the IFSC's own bank code doesn't match the selected Bank Name — e.g. Bank Name says HDFC
// Bank but the IFSC is a Punjab National Bank code. 'Other' never mismatches (no code to compare).
function bankIfscMismatch(bankName,ifscCode){
  if(!bankName||bankName==='Other'||!isValidIfscFormat(ifscCode))return null;
  const code=String(ifscCode).trim().toUpperCase().slice(0,4);
  const expected=IFSC_BANK_CODES[code];
  if(!expected)return null; // an unrecognized/newer bank code — not flagged as a mismatch, just unverifiable
  if(expected!==bankName)return'This IFSC belongs to '+expected+', not '+bankName+' — check which one is correct.';
  return null;
}
function isValidIfscFormat(code){return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(code||'').trim().toUpperCase());}
// ── GSTIN / PAN / mobile format checks — used across Master Sheet (Outlet), Employee Master,
// and Vendors to flag an obviously malformed entry right where it's typed, since a typo here
// quietly corrupts every statutory export and filing that reads it later. These are warning
// hints only, never a hard stop on saving — a business can have a real, unusual reason a field
// doesn't fit the expected pattern, and blocking save over a false positive would be worse than
// not validating at all. gstValid (checksum digit, not just shape) is the same function already
// used to verify GSTINs picked up from OCR'd vendor bills elsewhere in this file.
function isValidGSTINFormat(v){
  const s=String(v||'').trim().toUpperCase();
  return !s||gstValid(s);
}
// ── Official 2-digit GST jurisdiction codes (first 2 characters of every GSTIN) — used to cross-
// check a GSTIN against the State selected elsewhere on the same form, e.g. Edit Salon. This is
// the same code list GSTN itself assigns per state/UT; it never changes, so no lookup is needed.
const GST_STATE_CODES={'01':'Jammu and Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh',
  '05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh','10':'Bihar',
  '11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur','15':'Mizoram','16':'Tripura',
  '17':'Meghalaya','18':'Assam','19':'West Bengal','20':'Jharkhand','21':'Odisha','22':'Chhattisgarh',
  '23':'Madhya Pradesh','24':'Gujarat','25':'Daman and Diu','26':'Dadra and Nagar Haveli and Daman and Diu',
  '27':'Maharashtra','28':'Andhra Pradesh (Old)','29':'Karnataka','30':'Goa','31':'Lakshadweep',
  '32':'Kerala','33':'Tamil Nadu','34':'Puducherry','35':'Andaman and Nicobar Islands','36':'Telangana',
  '37':'Andhra Pradesh','38':'Ladakh'};
// GSTIN characters 3–12 are always the taxpayer's PAN verbatim — a cheap, offline way to catch a
// GST Number / PAN Number mismatch typo without calling anything.
function panFromGstin(g){const s=String(g||'').trim().toUpperCase();return s.length>=12?s.slice(2,12):'';}
function gstStateNameFor(g){const s=String(g||'').trim().toUpperCase();return s.length>=2?(GST_STATE_CODES[s.slice(0,2)]||''):'';}
// Opens the government's own public "Search Taxpayer" page (services.gst.gov.in) and copies the
// GSTIN to the clipboard first, since that page is captcha-protected and has no API/CORS access —
// there's no legitimate free API that can return live registration status/name from inside the
// browser, so the honest version of "validate against the GST website" is: catch every offline-
// checkable mismatch automatically (format, checksum, PAN, state — all below), and make the one
// check that genuinely requires the government's own database (is it live, active, cancelled,
// and under what registered name) one click away with the number already in the clipboard.
async function openGstPortalLookup(gstin,toast){
  const g=String(gstin||'').trim().toUpperCase();
  try{await navigator.clipboard.writeText(g);toast&&toast('GSTIN copied — paste it into the portal search box','info');}
  catch(e){toast&&toast('Opening GST portal — copy the GSTIN manually, clipboard access was blocked','info');}
  window.open('https://services.gst.gov.in/services/searchtp','_blank','noopener');
}
function isValidPANFormat(v){
  const s=String(v||'').trim().toUpperCase();
  return !s||/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(s);
}
function isValidIndianMobile(v){
  let digits=String(v||'').replace(/\D/g,'');
  if(!digits)return true;
  if(digits.length===12&&digits.startsWith('91'))digits=digits.slice(2);
  else if(digits.length===11&&digits.startsWith('0'))digits=digits.slice(1);
  return /^[6-9][0-9]{9}$/.test(digits);
}
// Email — deliberately permissive (this is a format sanity-check, not a spec-compliant RFC 5322
// validator); catches the common "forgot the @" / "forgot the domain" typos without rejecting
// anything a real mail server would actually accept.
function isValidEmailFormat(v){
  const s=String(v||'').trim();
  return !s||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
// Small inline warning shown right under a field when it's non-empty but fails one of the checks
// above — same visual convention as the existing IFSC-lookup hint (10px, muted/amber/red, 3px
// gap under the input) so it reads as part of the same app, not a bolted-on validation library.
function fieldWarning(msg){
  return React.createElement('div',{style:{fontSize:10,marginTop:3,color:'var(--orange)'}},'⚠ '+msg);
}
// Positive counterpart to fieldWarning — same slot, same size, green instead of amber, for
// confirming a value actually checks out instead of only ever flagging problems.
function fieldOk(msg){
  return React.createElement('div',{style:{fontSize:10,marginTop:3,color:'var(--green)'}},'✓ '+msg);
}
async function fetchIfscDetails(ifsc){
  try{
    const res=await fetch('https://ifsc.razorpay.com/'+encodeURIComponent(String(ifsc).trim().toUpperCase()));
    if(!res.ok)return null;
    return await res.json(); // {BANK, BRANCH, ADDRESS, CITY, STATE, ...}
  }catch(e){return null;}
}
const PT_DEFAULT_SLABS={
  'Andhra Pradesh':[{upto:15000,amount:0},{upto:20000,amount:150},{upto:null,amount:200}],
  'Telangana':[{upto:15000,amount:0},{upto:20000,amount:150},{upto:null,amount:200}],
  'Assam':[{upto:10000,amount:0},{upto:15000,amount:150},{upto:25000,amount:180},{upto:null,amount:208}],
  'Bihar':[{upto:25000,amount:0},{upto:41666,amount:83},{upto:83333,amount:167},{upto:null,amount:208}],
  'Chhattisgarh':[{upto:20000,amount:0},{upto:30000,amount:130},{upto:40000,amount:150},{upto:null,amount:208}],
  'Gujarat':[{upto:12000,amount:0},{upto:null,amount:200}],
  'Jharkhand':[{upto:25000,amount:0},{upto:41666,amount:100},{upto:66666,amount:150},{upto:83333,amount:175},{upto:null,amount:208}],
  'Karnataka':[{upto:24999,amount:0},{upto:null,amount:200}],
  'Kerala':[{upto:11999,amount:0},{upto:17999,amount:120},{upto:29999,amount:180},{upto:44999,amount:300},{upto:99999,amount:450},{upto:124999,amount:600},{upto:null,amount:1250}],
  'Madhya Pradesh':[{upto:18750,amount:0},{upto:25000,amount:125},{upto:33333,amount:167},{upto:null,amount:208}],
  'Maharashtra':[{upto:7500,amount:0},{upto:10000,amount:175},{upto:null,amount:200}],
  'Manipur':[{upto:4250,amount:0},{upto:6250,amount:100},{upto:8333,amount:167},{upto:10417,amount:200},{upto:null,amount:208}],
  'Meghalaya':[{upto:4166,amount:0},{upto:6250,amount:16.5},{upto:8333,amount:25},{upto:12500,amount:41.67},{upto:16666,amount:62.5},{upto:20833,amount:83.33},{upto:null,amount:208}],
  'Mizoram':[{upto:5000,amount:0},{upto:8000,amount:75},{upto:10000,amount:120},{upto:12000,amount:150},{upto:15000,amount:180},{upto:null,amount:208}],
  'Nagaland':[{upto:4000,amount:0},{upto:5000,amount:35},{upto:7000,amount:75},{upto:9000,amount:110},{upto:12000,amount:180},{upto:null,amount:208}],
  'Odisha':[{upto:13304,amount:0},{upto:25000,amount:125},{upto:null,amount:200}],
  'Puducherry':[{upto:16666,amount:0},{upto:33333,amount:41.67},{upto:50000,amount:83.33},{upto:66666,amount:125},{upto:null,amount:208.33}],
  'Sikkim':[{upto:20000,amount:0},{upto:30000,amount:125},{upto:40000,amount:150},{upto:null,amount:200}],
  'Tamil Nadu':[{upto:21000,amount:0},{upto:30000,amount:135},{upto:45000,amount:315},{upto:60000,amount:690},{upto:75000,amount:1025},{upto:null,amount:1250}],
  'Tripura':[{upto:5000,amount:0},{upto:7000,amount:45},{upto:9000,amount:90},{upto:12000,amount:130},{upto:15000,amount:170},{upto:null,amount:208}],
  'West Bengal':[{upto:10000,amount:0},{upto:15000,amount:110},{upto:25000,amount:130},{upto:40000,amount:150},{upto:null,amount:200}],
};
function ptAppliesToState(state){return PT_APPLICABLE_STATES.includes(String(state||'').trim());}
// Whether this outlet can claim GST Input Tax Credit as of a given date. If a W.e.f. date is set,
// the outlet's current gstInputBlocked setting only applies from that date onward — dates before
// it default to allowed (true), preserving how every invoice before this feature existed was
// already being treated (GST tracked but never assumed non-recoverable). No W.e.f. date set means
// the current setting has always applied.
function gstInputAllowedAsOf(salon,dateIso){
  if(!salon)return true;
  const iso=toISO(dateIso)||dateIso;
  if(salon.gstInputWef&&iso){
    const wefIso=toISO(salon.gstInputWef)||salon.gstInputWef;
    if(iso<wefIso)return true;
  }
  return salon.gstInputBlocked!==true;
}
function getSalonRecordById(salonId){
  try{return loadSalonsFromStorage().find(s=>s.id===salonId)||null;}catch(e){return null;}
}
function ptSlabsKey(salonId){return outletKey('salonos_pt_slabs',salonId);}
function loadPtSlabs(salonId,state){
  try{
    const v=JSON.parse(cachedLocalGet(ptSlabsKey(salonId)));
    if(Array.isArray(v)&&v.length)return v;
  }catch(e){}
  return (PT_DEFAULT_SLABS[state]||[]).map(t=>({...t}));
}
function savePtSlabs(salonId,slabs){safeLocalSet(ptSlabsKey(salonId),JSON.stringify(slabs));}
// PT deduction for a given monthly Gross Salary, using the outlet's own (possibly edited) slabs
// for its state — the highest slab whose "upto" the salary doesn't exceed wins; null upto = the
// top/open-ended slab. `month` (0-11, Jan=0) is optional and only used for Karnataka's February
// top-up below — every other state's slab is flat all year.
function ptAmountFor(salonId,state,grossSalary,month){
  if(!ptAppliesToState(state))return 0;
  const slabs=loadPtSlabs(salonId,state);
  if(!slabs.length)return 0;
  const g=Number(grossSalary)||0;
  let amt=0;
  let matched=false;
  for(const t of slabs){
    if(t.upto==null||g<=Number(t.upto)){amt=Number(t.amount)||0;matched=true;break;}
  }
  if(!matched)amt=Number(slabs[slabs.length-1].amount)||0;
  // Karnataka charges ₹200/month for 11 months plus ₹300 in February — ₹2,200+₹300 = ₹2,500/year,
  // the maximum allowed under Article 276(2) of the Constitution. Only applied when the matched
  // slab is still the standard ₹200 (i.e. these are the unedited default Karnataka slabs) — an
  // outlet that has customized its own PT slabs is left exactly as it configured them.
  if(state==='Karnataka'&&month===1&&amt===200)amt=300;
  return amt;
}

// ── Column-applicability toggles, persisted ──────────────────────────────────────────────────
// Previously these lived only as local React state inside SalaryWorkingCore/IncentiveWorkingCore
// — they controlled which columns were SHOWN, but the underlying Net Salary / Total Incentive
// calculation always included every term regardless of the toggle, and the toggle state itself
// reset to defaults on every navigation (never persisted). Now they're saved per outlet, and the
// calculation functions below read them directly — so switching a toggle off genuinely removes
// that term from Net Salary / Total Incentive (not just from the displayed column), and that
// exclusion is honored consistently everywhere: the sheet's own screen, P&L's Employee Cost, and
// every export (CSV/Word/PDF/Excel), since they all call these same shared functions.
const SW_COLS_DEFAULT={tea:true,serviceInc:true,memInc:true,prodInc:true,mgrInc:true,nonPerfPenalty:true,totalInc:true,advAdj:true,penalties:true,prevMonthAdv:true,currMonthAdv:true,nextMonthAdv:false,pfEmp:true,esic:true,pt:true,tds:true,bankDetails:false};
function loadSWCols(salonId){
  try{const raw=JSON.parse(cachedLocalGet(outletKey('salonos_sw_cols',salonId))||'null');if(raw&&typeof raw==='object')return{...SW_COLS_DEFAULT,...raw};}catch(e){}
  return{...SW_COLS_DEFAULT};
}
function saveSWCols(cols,salonId){safeLocalSet(outletKey('salonos_sw_cols',salonId),JSON.stringify(cols));}
// Tea Allowance — configurable as either a flat monthly amount, or a rate × Working Days (Total
// Days Payable, straight from the Attendance Sheet summary, same figure Gross Salary is prorated
// against). Defaults to the flat ₹800 this always used to be, so anyone who hasn't touched this
// setting sees no change.
const TEA_CONFIG_DEFAULT={mode:'fixed',rate:800};
function loadTeaConfig(salonId){
  try{const raw=JSON.parse(cachedLocalGet(outletKey('salonos_tea_config',salonId))||'null');
    if(raw&&typeof raw==='object')return{mode:raw.mode==='perDay'?'perDay':'fixed',rate:Number(raw.rate)||0};
  }catch(e){}
  return{...TEA_CONFIG_DEFAULT};
}
function saveTeaConfig(cfg,salonId){safeLocalSet(outletKey('salonos_tea_config',salonId),JSON.stringify(cfg));}
const IW_COLS_DEFAULT={svcTarget:true,membership:true,product:true,svcPct:true,memPct:true,prodPct:true,amounts:true,penalty:true,advAdj:true,bankDetails:false,ot:false};
function loadIWCols(salonId){
  try{const raw=JSON.parse(cachedLocalGet(outletKey('salonos_iw_cols',salonId))||'null');if(raw&&typeof raw==='object')return{...IW_COLS_DEFAULT,...raw};}catch(e){}
  return{...IW_COLS_DEFAULT};
}
function saveIWCols(cols,salonId){safeLocalSet(outletKey('salonos_iw_cols',salonId),JSON.stringify(cols));}

// ── Shared Salary Working computation — single source of truth so Salary Working,
// Incentive Working and P&L's Employee Cost always agree on the same numbers ──
function swWorkingsFor(salonId,year,month){
  const EMPLOYEES=getEmployeesForMonth(year,month,salonId);
  const attStore=loadAttendance(salonId);
  const cols=loadSWCols(salonId);
  const teaCfg=loadTeaConfig(salonId);
  const swMeta=loadSWMeta(salonId);
  // Fetched once here (not just later, inline, for PT) so PF/ESIC below can also honor it —
  // Master Salary's own CTC card already refuses to show employer PF/ESIC once an outlet is
  // de-registered (see epfEmployerContributionFor), but this sheet used to keep deducting and
  // booking both regardless, checking only the employee's own pf/esic flag. An outlet turning
  // PF or ESIC off should stop it everywhere, not just on one screen.
  const salonRec=getSalonRecordById(salonId);
  const pfApplicableAtSalon=!!(salonRec&&salonRec.pfApplicable);
  const esicApplicableAtSalon=!!(salonRec&&salonRec.esicApplicable);
  // Mem Inc / Prod Inc shown here are pulled straight from Incentive Working's own calculation
  // (incWorkingsFor) — never recomputed separately — so the two sheets can never disagree on the
  // same employee's incentive figures. Employees Incentive Working excludes (Helper,
  // Housekeeper) simply have no entry here and correctly show ₹0.
  const incByEmp={};
  incWorkingsFor(salonId,year,month).forEach(w=>{incByEmp[w.id]=w;});
  return EMPLOYEES.map(e=>{
    const rec=attStore[attMonthKey(e.id,year,month)];
    const s=attSummaryFor(e,year,month,rec);
    const totalDays=s.totalDaysPayable;
    const daysInMonth=s.daysInMonth;
    const lop=s.absent+s.half*0.5; // shown for reference (e.g. "LOP Days" elsewhere) — not what Gross Salary is actually built from below
    const grossAfterLop=Math.round((e.gross/daysInMonth)*totalDays); // Salary ÷ Days in Month × Total Days — the exact requested formula
    const lopAmt=Math.max(0,e.gross-grossAfterLop); // recomputed so the displayed LOP amount stays consistent with Gross Salary above
    // Svc Inc — same Incentive Working source as Mem/Prod Inc below (incWorkingsFor's own
    // target/achieved-based Service Incentive), never a separately-recomputed figure, so Salary
    // Working and Incentive Working can never show two different "Service Incentive" numbers for
    // the same employee the way this column used to (a flat, unrelated 3%-of-Basic calculation).
    const svcIncAmt=cols.serviceInc&&incByEmp[e.id]?(incByEmp[e.id].svcIncAmt||0):0;
    const memIncAmt=cols.memInc&&incByEmp[e.id]?(incByEmp[e.id].memIncAmt||0):0;
    const prodIncAmt=cols.prodInc&&incByEmp[e.id]?(incByEmp[e.id].prodIncAmt||0):0;
    // MGR Inc / Non-Performance Penalty / Total Inc — same Incentive Working source as Mem Inc /
    // Prod Inc above (never recomputed separately, so the two sheets can't disagree). incDetail
    // carries the whole Incentive Working row through for the "🔍 working" drill-down popup on
    // any of these incentive-related cells, so it can show the full target/achieved/rate detail
    // behind whichever figure was clicked, not just the one number.
    const incDetail=incByEmp[e.id]||null;
    const mgrIncAmt=cols.mgrInc&&incDetail?(incDetail.mgrIncAmt||0):0;
    const nonPerfPenalty=cols.nonPerfPenalty&&incDetail?(incDetail.penaltyAmt||0):0;
    const totalIncSW=cols.totalInc&&incDetail?(incDetail.totalInc||0):0;
    const tea=cols.tea&&e.status==='Active'?Math.round(teaCfg.mode==='perDay'?teaCfg.rate*totalDays:teaCfg.rate):0;
    // Employee's and Employer's EPF contribution share the SAME wage base under the EPF Act — 12%
    // of Basic, capped at the ₹15,000 statutory PF wage ceiling unless this employee record has
    // pfOnActualBasic set (same toggle as Master Salary's Employment & Salary tab). Previously the
    // employee side ignored this cap and always used the full uncapped Basic — a real correctness
    // bug, since it made the employee's own deduction disagree with the employer's contribution
    // for the exact same wage base.
    const pfWageBase=e.pfOnActualBasic?e.basic:Math.min(e.basic,15000);
    const pfAutoAmt=(pfApplicableAtSalon&&e.pf)?Math.round(pfWageBase*0.12):0;
    // PF (Emp) can be manually overridden per employee per month, same pattern as ESIC below —
    // e.g. to match a slightly different rounding the EPFO portal itself produced. Falls back to
    // the standard 12%-of-wage-base calculation whenever no override is set.
    const swMForPf=swMeta[attMonthKey(e.id,year,month)];
    const pfOverridden=swMForPf&&swMForPf.pfOverride!=null&&swMForPf.pfOverride!=='';
    const pfEmp=cols.pfEmp?(pfOverridden?Number(swMForPf.pfOverride)||0:pfAutoAmt):0;
    // Employer's EPF contribution — same wage base as pfEmp above (see comment there). Gated on
    // pfApplicableAtSalon same as pfAutoAmt: previously only checked e.pf, so an employee whose
    // record still had pf:true from before their outlet turned PF off kept being deducted and
    // costed here even though Master Salary's own CTC card (epfEmployerContributionFor) already
    // correctly showed ₹0 for them — the two screens could permanently disagree.
    const pfEr=(pfApplicableAtSalon&&e.pf)?Math.round(pfWageBase*0.12):0;
    const esicAutoAmt=(esicApplicableAtSalon&&e.esic&&e.gross<=21000)?Math.round(e.gross*0.0075):0;
    // ESIC (Emp) can be manually overridden per employee per month — e.g. to match a slightly
    // different rounding the actual ESIC portal produced — via the click-to-edit popup on Salary
    // Working. Falls back to the standard 0.75%-of-Gross calculation whenever no override is set.
    const swMForEsic=swMeta[attMonthKey(e.id,year,month)];
    const esicOverridden=swMForEsic&&swMForEsic.esicOverride!=null&&swMForEsic.esicOverride!=='';
    const esicEmp=cols.esic?(esicOverridden?Number(swMForEsic.esicOverride)||0:esicAutoAmt):0;
    const esicEr=(esicApplicableAtSalon&&e.esic&&e.gross<=21000)?Math.round(e.gross*0.0325):0;
    // Professional Tax — auto-applied whenever the outlet's own state levies PT (see
    // PT_APPLICABLE_STATES), computed from that state's slabs against Gross Salary. Employee's
    // own `pt` flag is forced true/false to match state applicability (see Master Salary and
    // Outlet forms), so this doesn't re-check e.pt — the state alone decides it.
    const ptAutoAmt=ptAmountFor(salonId,salonRec?.state,e.gross,month);
    // PT (Professional Tax) can be manually overridden per employee per month, same pattern as
    // ESIC/PF above — e.g. for an employee whose actual PT differs from the standard state slab
    // for some reason specific to them. Falls back to the standard state-slab calculation
    // whenever no override is set.
    const swMForPt=swMeta[attMonthKey(e.id,year,month)];
    const ptOverridden=swMForPt&&swMForPt.ptOverride!=null&&swMForPt.ptOverride!=='';
    const ptAmt=cols.pt?(ptOverridden?Number(swMForPt.ptOverride)||0:ptAutoAmt):0;
    // TDS (Tax Deducted at Source, Section 192) — manual entry only, unlike PF/ESIC/PT above.
    // Those three have a single, well-defined monthly formula (a flat rate or a state slab); TDS
    // on salary depends on the employee's *projected annual* income, exemptions, and old-vs-new
    // regime choice — none of which this sheet has any basis to estimate responsibly. So there's
    // no "auto-calculated" figure here at all, just whatever's entered via the click-to-edit popup.
    const swMForTds=swMeta[attMonthKey(e.id,year,month)];
    const tdsAmt=cols.tds&&swMForTds&&swMForTds.tdsAmount!=null&&swMForTds.tdsAmount!==''?Number(swMForTds.tdsAmount)||0:0;
    const penAmt=cols.penalties?penaltySumFor(salonId,e.name,year,month):0;
    // Adv Adj — once this row has been Approved (and the advance actually settled), the deduction
    // that ACTUALLY happened is frozen in swMeta's advanceSettledBreakdown, and is used here
    // instead of recomputing live. Recomputing live would be wrong post-settlement: settling
    // reduces the advance's own outstanding balance, so a fresh calculation would show less (often
    // ₹0) than what was genuinely deducted from this month's Net Salary — making it look like the
    // deduction never happened, right after it did. Unapproved rows still compute live, same as
    // always, so the figure stays current while there's still something to approve.
    const swM=swMeta[attMonthKey(e.id,year,month)];
    const advAdj=cols.advAdj
      ?(swM&&swM.advanceSettled&&Array.isArray(swM.advanceSettledBreakdown)
          ?swM.advanceSettledBreakdown.reduce((s,b)=>s+(Number(b.amount)||0),0)
          :advanceDeductionFor(salonId,e.name,'Salary',year,month))
      :0;
    // Op./Curr/Next Month Advance — same freeze-on-settlement fix as Adv Adj above. These are
    // live balance splits from the Advance Sheet, so once settlement pays an advance down to ₹0
    // (or fully off it, flipping it to Recovered), a fresh calculation correctly shows nothing
    // left — but that makes it look like the balance just vanished, right after the approval that
    // paid it off, instead of showing what was actually there going into that approval. Frozen
    // from a snapshot taken at the moment of settlement (see setMetaField/approveAll) once
    // Approved; still live for any row that hasn't been approved yet.
    const advSplit=(swM&&swM.advanceSettled&&swM.advanceSplitSnapshot)
      ?swM.advanceSplitSnapshot
      :((cols.prevMonthAdv||cols.currMonthAdv||cols.nextMonthAdv)?advanceBalanceSplitFor(salonId,e.name,'Salary',year,month,swM&&swM.nextAdvPull?swM.nextAdvPullDate:null):{prev:0,curr:0,next:0});
    const prevAdv=cols.prevMonthAdv?advSplit.prev:0; // real balance from Advance Sheet — informational (Op. Advance / Closing Advance ledger), NOT a pay deduction
    const currAdv=cols.currMonthAdv?advSplit.curr:0;
    const nextAdv=cols.nextMonthAdv?advSplit.next:0;
    // BUGFIX: previously subtracted both advAdj (this month's actual installment) AND prevAdv
    // (the employee's entire outstanding advance balance) from Net Salary — e.g. gross ₹20,000
    // with a ₹2,000/month installment against a ₹15,000 balance came out to ₹3,000 net instead
    // of the correct ₹18,000. prevAdv/currAdv only belong in the Op./Closing Advance ledger
    // columns below, never in the pay calculation itself.
    // Net Salary = Gross Salary + Tea − PF Emp − ESIC − Prof. Tax − TDS − Advance Adj. − Penalty.
    // Service Incentive is intentionally NOT part of this figure — it's shown in its own column
    // for reference but isn't folded into Net Salary here.
    const net=grossAfterLop+tea-pfEmp-esicEmp-ptAmt-tdsAmt-penAmt-advAdj;
    const closingAdvance=Math.max(0,prevAdv+currAdv-advAdj);
    return{...e,totalDays,daysInMonth,lop,lopAmt,grossAfterLop,svcIncAmt,memIncAmt,prodIncAmt,mgrIncAmt,nonPerfPenalty,totalIncSW,incDetail,tea,pfEmp,pfEr,pfAutoAmt,pfOverridden,esicEmp,esicEr,esicAutoAmt,esicOverridden,ptAmt,ptAutoAmt,ptOverridden,tdsAmt,penAmt,advAdj,prevAdv,currAdv,nextAdv,closingAdvance,net:Math.max(0,net)};
  });
}

// ── Statutory deduction figures (PF/ESIC/PT/TDS) for every employee, one calendar month —
// computed directly from the same auto-formula + manual-override logic swWorkingsFor uses, but
// WITHOUT going through that sheet's column-visibility toggles (loadSWCols) — those toggles only
// control what's shown on the Salary Working screen day-to-day, and shouldn't cause a compliance
// report to silently show ₹0 for a deduction whose column happens to be hidden there. ──
function statutoryDeductionsFor(salonId,year,month){
  const EMPLOYEES=getEmployeesForMonth(year,month,salonId);
  const swMeta=loadSWMeta(salonId);
  const salonRec=getSalonRecordById(salonId);
  // Same outlet-level gate as swWorkingsFor (see its comment) — an outlet with PF/ESIC turned
  // off should show ₹0 here too, not just keep reporting whatever an employee's own leftover
  // pf/esic flag says.
  const pfApplicableAtSalon=!!(salonRec&&salonRec.pfApplicable);
  const esicApplicableAtSalon=!!(salonRec&&salonRec.esicApplicable);
  return EMPLOYEES.map(e=>{
    const swM=swMeta[attMonthKey(e.id,year,month)]||{};
    const pfWageBase=e.pfOnActualBasic?e.basic:Math.min(e.basic,15000);
    const pfAutoAmt=(pfApplicableAtSalon&&e.pf)?Math.round(pfWageBase*0.12):0;
    const pfEmp=(swM.pfOverride!=null&&swM.pfOverride!=='')?Number(swM.pfOverride)||0:pfAutoAmt;
    const pfEr=(pfApplicableAtSalon&&e.pf)?Math.round(pfWageBase*0.12):0; // employer side isn't separately overridden
    // EPS (Pension), EDLI, and Admin Charges all use the ₹15,000 statutory wage ceiling
    // regardless of pfOnActualBasic — that election only raises the EPF contribution itself,
    // never these three, per EPFO's own "pay" definition for Accounts 2/10/21/22.
    const epsWageBase=Math.min(e.basic,15000);
    const pfOn=pfApplicableAtSalon&&e.pf;
    const eps=pfOn?Math.round(epsWageBase*0.0833):0; // EPS = 8.33% of wage, capped ₹15,000 (≈₹1,250 max)
    const pfErEpf=Math.max(0,pfEr-eps); // Employer's EPF share = Employer 12% − EPS diverted out of it (≈3.67%)
    const edli=pfOn?Math.round(epsWageBase*0.005):0; // EDLI — 0.5% of wage, capped ₹15,000, employer-only
    const adminChargeRaw=pfOn?Math.round(epsWageBase*0.005):0; // Admin Charges — 0.5%, capped ₹15,000; the ₹500/month establishment minimum is applied once, across all employees, in statutoryCellsForMonth below, not per employee
    const esicAutoAmt=(esicApplicableAtSalon&&e.esic&&e.gross<=21000)?Math.round(e.gross*0.0075):0;
    const esicEmp=(swM.esicOverride!=null&&swM.esicOverride!=='')?Number(swM.esicOverride)||0:esicAutoAmt;
    const esicEr=(esicApplicableAtSalon&&e.esic&&e.gross<=21000)?Math.round(e.gross*0.0325):0;
    const ptAutoAmt=ptAmountFor(salonId,salonRec?.state,e.gross,month);
    const ptAmt=(swM.ptOverride!=null&&swM.ptOverride!=='')?Number(swM.ptOverride)||0:ptAutoAmt;
    const tdsAmt=(swM.tdsAmount!=null&&swM.tdsAmount!=='')?Number(swM.tdsAmount)||0:0;
    return{id:e.id,name:e.name,desig:e.desig,pfEmp,pfEr,eps,pfErEpf,edli,adminChargeRaw,esicEmp,esicEr,ptAmt,tdsAmt};
  });
}
// A TDS section/payment code's full descriptive label, looked up across BOTH the old (1961 Act)
// and new (2025 Act) lists — a saved record could carry either depending on when it was set.
function tdsSectionFullLabel(code){
  if(!code)return'—';
  const m=[...TDS_SECTIONS_OLD,...TDS_SECTIONS_NEW].find(s=>s.code===code);
  return m?m.label:code;
}

// in Incentive Working, not fabricated. Stored separately from the employee record since it's a
// month-by-month figure, same pattern as attendance.
function loadIncentiveActuals(salonId){
  try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_incentive_actuals',salonId))||'{}');if(v&&typeof v==='object')return v;}catch(e){}
  return{};
}
function saveIncentiveActuals(actuals,salonId){
  safeLocalSet(outletKey('salonos_incentive_actuals',salonId),JSON.stringify(actuals));
}
function incActualKey(empId,year,month){return empId+'_'+year+'_'+month;}

// Staff Work Report — the same store StaffReportSheet writes to, keyed by "YYYY-MM".
function loadStaffWorkReports(salonId){
  try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_staff_work_reports',salonId))||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}
}
// Matches by Billing Software ID (employee's own `billingId` field) against the report's own
// "EmpId" column — the two systems' employee IDs are rarely the same, that's the whole reason
// this field exists on the employee record.
function staffWorkReportRowFor(salonId,year,month,billingId){
  const bid=String(billingId||'').trim();
  if(!bid)return null;
  const key=year+'-'+String(month+1).padStart(2,'0');
  const rows=loadStaffWorkReports(salonId)[key]||[];
  return rows.find(r=>String(r['EmpId']||'').trim()===bid)||null;
}

// Incentive rates — one editable number per category (Service/Membership/Product), not the old
// hardcoded 100%/80%-threshold tiers. Defaults to 5%/4%/3%, per employee per month, but every
// employee starts on the same default until someone changes one.
function loadIncentiveRates(salonId){
  try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_incentive_rates',salonId))||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}
}
function saveIncentiveRate(salonId,empId,year,month,field,value){
  const all=loadIncentiveRates(salonId);
  const key=incActualKey(empId,year,month);
  all[key]={...(all[key]||{}),[field]:value};
  safeLocalSet(outletKey('salonos_incentive_rates',salonId),JSON.stringify(all));
}
const INCENTIVE_RATE_DEFAULTS={svcRate:5,memRate:4,prodRate:3};

// ── Incentive Plans by Designation — Service/Membership/Product/Manager Incentive can each
// either use ONE shared plan for every employee (the original behaviour, still the default) or a
// separate plan per designation group, toggled independently per category so — for example —
// Service can be split while Membership stays one shared plan. Splitting changes RATES/AMOUNTS/
// TARGETS per group; which rule TYPE (A/B/C) is active stays one choice for the whole outlet,
// same as before, just applied with each employee's own group's numbers. ──
const INCENTIVE_DESIGNATION_GROUPS=['Hairdresser','Beautician','Pedicurist','Manager'];
const INCENTIVE_DESIGNATION_GROUP_MAP={
  'Unisex Hairdresser':'Hairdresser','Ladies Hairdresser':'Hairdresser','Men Hairdresser':'Hairdresser',
  'Beautician':'Beautician','Pedicurist':'Pedicurist',
  'Salon Manager':'Manager','Manager':'Manager','Assist Manager':'Manager'
};
// ── Custom Incentive Plans — beyond the 4 built-in designation groups above, an outlet can add
// its own named plans (e.g. "Hairdresser - Senior") for cases where two employees who share the
// same Designation still need genuinely different incentive rules. A custom plan is just another
// "group" string as far as every slab/rate store below is concerned (they're all keyed generically
// by withGroupSuffix) — the only two things that make it usable are: it shows up in the same
// tab lists the 4 built-in groups do (see allIncentivePlans), and an employee can be assigned to
// it directly (see loadIncentivePlanOverrides), overriding what their Designation would otherwise
// map to. ──
function incentiveCustomPlansKey(salonId){return outletKey('salonos_incentive_custom_plans',salonId);}
function loadIncentiveCustomPlans(salonId){
  try{const v=JSON.parse(cachedLocalGet(incentiveCustomPlansKey(salonId))||'[]');if(Array.isArray(v))return v.filter(Boolean);}catch(e){}
  return[];
}
function saveIncentiveCustomPlans(salonId,list){safeLocalSet(incentiveCustomPlansKey(salonId),JSON.stringify(list));}
// Every plan an employee could be assigned to or a slab/rate table could exist for — the 4
// built-in designation groups, plus whatever custom plans this outlet has added, de-duplicated.
function allIncentivePlans(salonId){
  return Array.from(new Set([...INCENTIVE_DESIGNATION_GROUPS,...loadIncentiveCustomPlans(salonId)]));
}
// ── Per-Employee Plan Override — lets a specific employee follow a DIFFERENT plan than their own
// Designation would normally map to (an existing group, or a custom one) — covers two employees
// sharing one Designation who need separate incentive plans. Blank/missing = no override, falls
// through to the Designation map as before. ──
function incentivePlanOverridesKey(salonId){return outletKey('salonos_incentive_plan_overrides',salonId);}
function loadIncentivePlanOverrides(salonId){
  try{const v=JSON.parse(cachedLocalGet(incentivePlanOverridesKey(salonId))||'{}');if(v&&typeof v==='object')return v;}catch(e){}
  return{};
}
function saveIncentivePlanOverrides(salonId,map){safeLocalSet(incentivePlanOverridesKey(salonId),JSON.stringify(map));}
// The plan actually in effect for one employee: their own override (if set, and still a plan
// that exists) takes priority over their Designation's default group. Any designation not in the
// map below (e.g. a custom one added later) falls back to Hairdresser's plan, so it's never
// silently zeroed out just for not matching a known label.
function incentiveGroupFor(emp,salonId){
  if(emp&&salonId){
    const override=loadIncentivePlanOverrides(salonId)[emp.id];
    if(override&&allIncentivePlans(salonId).includes(override))return override;
  }
  return INCENTIVE_DESIGNATION_GROUP_MAP[emp?.desig]||'Hairdresser';
}

function incSplitModeKey(salonId){return outletKey('salonos_incentive_split_by_designation',salonId);}
const INCENTIVE_SPLIT_MODE_DEFAULTS={service:false,membership:false,product:false,manager:false};
function loadIncentiveSplitMode(salonId){
  try{const v=JSON.parse(cachedLocalGet(incSplitModeKey(salonId)));if(v&&typeof v==='object')return{...INCENTIVE_SPLIT_MODE_DEFAULTS,...v};}catch(e){}
  return{...INCENTIVE_SPLIT_MODE_DEFAULTS};
}
function saveIncentiveSplitMode(salonId,v){safeLocalSet(incSplitModeKey(salonId),JSON.stringify(v));}

// Appends a designation-group suffix to a base storage key, only when a group is actually passed
// — every category's settings store below uses this, so switching "Split by Designation" off
// never loses the original shared-plan data (it just stops being read while split mode is off).
function withGroupSuffix(baseKey,group){return group?baseKey+'__grp_'+group:baseKey;}

// ── Manager Levels — Manager Incentive's own per-level split (Salon Manager / Manager / Assist
// Manager), kept separate from the four groups above since Manager Incentive already only ever
// applies to Manager-type designations; splitting it further means splitting BY those designations
// themselves rather than grouping them together under one "Manager" bucket. ──
const MANAGER_LEVEL_GROUPS=['Salon Manager','Manager','Assist Manager'];
function managerLevelFor(emp){return MANAGER_LEVEL_GROUPS.includes(emp?.desig)?emp.desig:'Manager';}

// ── Rate/Amount Source — per category (Service/Membership/Product), per outlet: 'auto' links the
// Incentive % and Incentive Amount straight to that category's rule under Incentive Rules &
// Settings (Service Incentive Rate Slabs / Membership Incentive Rules A-B-C / Product Incentive
// Rule's flat rate) — nothing to hand-enter. 'manualRate' re-enables a hand-entered % per employee
// on the Incentive Working sheet (the old behaviour). 'manualAmt' skips rate entirely and lets the
// ₹ Incentive Amount itself be typed straight in, per employee. Defaults to 'auto' for all three.
function incCalcModeKey(salonId){return outletKey('salonos_incentive_calc_mode',salonId);}
const INCENTIVE_CALC_MODE_DEFAULTS={svc:'auto',mem:'auto',prod:'auto'};
function loadIncentiveCalcMode(salonId){
  try{const v=JSON.parse(cachedLocalGet(incCalcModeKey(salonId)));if(v&&typeof v==='object')return{...INCENTIVE_CALC_MODE_DEFAULTS,...v};}catch(e){}
  return{...INCENTIVE_CALC_MODE_DEFAULTS};
}
function saveIncentiveCalcMode(salonId,v){safeLocalSet(incCalcModeKey(salonId),JSON.stringify(v));}

// ── Per-Employee Manual Override — the Rate & Amount Source above is an outlet-wide switch per
// category (Automatic/Manual Rate/Manual Amount for EVERY employee). This is the finer-grained
// complement: pull one or two specific employees OUT of the plan-based calculation for just the
// categories that need it, while everyone else keeps using the outlet's plan as normal. An
// employee with e.g. {svc:true} has their Service Incentive typed in directly on the sheet each
// month — Membership/Product/Manager stay plan-driven for them unless separately overridden.
// Manager Incentive never had an outlet-wide manual mode to begin with (it's always been
// Share %-of-pool based) — this is the only way to hand-type a Manager Incentive amount for a
// specific employee. ──
function incManualOverrideKey(salonId){return outletKey('salonos_incentive_manual_override',salonId);}
function loadIncentiveManualOverrides(salonId){
  try{const v=JSON.parse(cachedLocalGet(incManualOverrideKey(salonId))||'{}');if(v&&typeof v==='object')return v;}catch(e){}
  return{};
}
function saveIncentiveManualOverrides(salonId,map){safeLocalSet(incManualOverrideKey(salonId),JSON.stringify(map));}
function incentiveManualOverrideFor(salonId,empId){
  return loadIncentiveManualOverrides(salonId)[empId]||{svc:false,mem:false,prod:false,mgr:false};
}

// ── Incentive calculation — Models 2–5 removed; Model 1's Rate % of Achieved formula is now the
// only calculation method for this outlet. loadActiveIncentiveModel is kept (always returns 1)
// so incWorkingsFor and the per-employee record's `activeModel` field don't need to change. ──
function loadActiveIncentiveModel(salonId){return 1;}

// ── Applicability — master on/off checks for each incentive category, per outlet. Switching one
// off zeroes that category's amount in the Incentive Working grid below and hides its rule
// section, without losing any of the figures/rates already entered in it. ──
function incApplicabilityKey(salonId){return outletKey('salonos_incentive_applicability',salonId);}
const INCENTIVE_APPLICABILITY_DEFAULTS={service:true,membership:true,product:true,manager:true};
function loadIncentiveApplicability(salonId){
  try{const v=JSON.parse(cachedLocalGet(incApplicabilityKey(salonId)));if(v&&typeof v==='object')return{...INCENTIVE_APPLICABILITY_DEFAULTS,...v};}catch(e){}
  return{...INCENTIVE_APPLICABILITY_DEFAULTS};
}
function saveIncentiveApplicability(salonId,v){safeLocalSet(incApplicabilityKey(salonId),JSON.stringify(v));}

// ── Target Multipliers — how many ×Times of Salary each category's Target is, editable per
// outlet (was hardcoded 5×/3×/2× for Service/Membership/Product). Drives svcTarget/memTarget/
// prodTarget in incWorkingsFor below and the "Service (N Times Target)" column headers. ──
function incTargetMultKey(salonId){return outletKey('salonos_incentive_target_multipliers',salonId);}
const INCENTIVE_TARGET_MULT_DEFAULTS={svc:5,mem:3,prod:2};
function loadTargetMultipliers(salonId){
  try{const v=JSON.parse(cachedLocalGet(incTargetMultKey(salonId)));if(v&&typeof v==='object')return{...INCENTIVE_TARGET_MULT_DEFAULTS,...v};}catch(e){}
  return{...INCENTIVE_TARGET_MULT_DEFAULTS};
}
function saveTargetMultipliers(salonId,v){safeLocalSet(incTargetMultKey(salonId),JSON.stringify(v));}
// Per-designation-group override of the above, only read when that category's Split by
// Designation toggle is on — otherwise the shared outlet-wide multiplier above still applies.
function targetMultGroupKey(salonId,group){return incTargetMultKey(salonId)+'__grp_'+group;}
function loadTargetMultipliersForGroup(salonId,group){
  try{const v=JSON.parse(cachedLocalGet(targetMultGroupKey(salonId,group)));if(v&&typeof v==='object')return{...INCENTIVE_TARGET_MULT_DEFAULTS,...v};}catch(e){}
  return{...INCENTIVE_TARGET_MULT_DEFAULTS};
}
function saveTargetMultipliersForGroup(salonId,group,v){safeLocalSet(targetMultGroupKey(salonId,group),JSON.stringify(v));}
// The multiplier actually in effect for one employee, one category ('svc'/'mem'/'prod') — the
// group override when that category is split, else the shared outlet-wide default.
function targetMultFor(cat,salonId,emp,splitMode){
  if(splitMode&&splitMode[cat==='svc'?'service':cat==='mem'?'membership':'product'])
    return loadTargetMultipliersForGroup(salonId,incentiveGroupFor(emp,salonId))[cat];
  return loadTargetMultipliers(salonId)[cat];
}


// ── Model 1's Service Incentive Rate Slabs — rate tier based on how many ×times of salary was
// achieved in Service. 6 tiers: tier 0 is "below tier 1's threshold"; tiers 1-5 each have their
// own editable threshold (×times) and rate (%), defaulting to 5/6/7/8/9 times all at 5% — edit
// either number for any tier from the Incentive Working screen. The highest tier whose threshold
// the employee has reached wins.
const SERVICE_SLAB_DEFAULTS=[
  {rate:5}, // tier 0 — below tier 1's threshold
  {threshold:5,rate:5},
  {threshold:6,rate:5},
  {threshold:7,rate:5},
  {threshold:8,rate:5},
  {threshold:9,rate:5},
];
function svcSlabKey(salonId,group){return withGroupSuffix(outletKey('salonos_service_incentive_slabs',salonId),group);}
function loadServiceSlabs(salonId,group){
  try{const v=JSON.parse(cachedLocalGet(svcSlabKey(salonId,group)));if(Array.isArray(v)&&v.length===6)return v;}catch(e){}
  return SERVICE_SLAB_DEFAULTS.map(t=>({...t}));
}
function saveServiceSlabs(salonId,slabs,group){safeLocalSet(svcSlabKey(salonId,group),JSON.stringify(slabs));}
function serviceSlabRateFor(salonId,timesAchieved,group){
  const slabs=loadServiceSlabs(salonId,group);
  let bestRate=Number(slabs[0]?.rate)||0,bestThreshold=-Infinity;
  for(let i=1;i<slabs.length;i++){
    const th=Number(slabs[i].threshold);
    if(!isNaN(th)&&timesAchieved>=th&&th>=bestThreshold){bestThreshold=th;bestRate=Number(slabs[i].rate)||0;}
  }
  return bestRate;
}

// The model function receives a context object and must return
// {svcIncAmt, memIncAmt, prodIncAmt, totalInc}. Context fields available to build with:
//   salonId, year, month, salary, svcActual/memActual/prodActual, svcTarget/memTarget/prodTarget,
//   svcRate/memRate/prodRate (the per-employee editable % from the Incentive % column),
//   svcPct/memPct/prodPct (achievement %, capped at 100), svcTimesRaw/memTimesRaw/prodTimesRaw
//   (achievement in ×times of salary, uncapped), totalActual, totalTarget, employee (full
//   employee record — desig, dept, gross, basic, etc.)
// The raw Membership Achieved figure for one employee (Staff Work Report if imported, else the
// manual Incentive Actuals entry) — same source incWorkingsFor uses for its own "Mem Actual"
// column. Kept as its own function (rather than reading it off incWorkingsFor's output) so Rule
// A/B/C's Membership Incentive maps below can use it without calling back into incWorkingsFor,
// which would otherwise be a circular call (incWorkingsFor → modelFn → this map → incWorkingsFor).
function rawMemActualFor(salonId,year,month,emp){
  const reportRow=staffWorkReportRowFor(salonId,year,month,emp.billingId);
  if(reportRow)return Number(reportRow['MemberShipSale'])||0;
  const actuals=loadIncentiveActuals(salonId);
  const a=actuals[incActualKey(emp.id,year,month)]||{};
  return Number(a.memActual)||0;
}
// ── Membership Incentive, as actually paid, is driven by whichever of Rule A/B/C is the active
// rule under Membership Incentive Rules — not a separate flat-rate calculation. Each of these
// three mirrors its matching MemRuleA/B/C UI component's own pass1/pass2 math exactly, so the
// number shown in Incentive Working's "Mem Inc" column always matches what the active rule's own
// table shows for that employee. ──
function memRuleAIncentiveMapFor(salonId,year,month,EMPLOYEES,splitMode){
  const split=!!(splitMode&&splitMode.membership);
  const rows=loadMemRuleARows(salonId,year,month);
  const pass1=EMPLOYEES.map(e=>{
    const s=loadMemRuleASettings(salonId,split?incentiveGroupFor(e,salonId):undefined);
    const mgrRate=Number(s.mgrRate)||0,staffRate=Number(s.staffRate)||0,mgrShareRate=Number(s.mgrShareRate)||0;
    const membershipSold=Math.round(rawMemActualFor(salonId,year,month,e));
    const isManager=MANAGER_DESIGNATIONS.has(e.desig);
    const staffIncentive=isManager?0:Math.round(membershipSold*staffRate/100);
    const mgrIncOnOwnSold=isManager?Math.round(membershipSold*mgrRate/100):0;
    const poolContribution=isManager?0:Math.round(membershipSold*mgrShareRate/100);
    const r=rows[e.id]||{};
    return{id:e.id,isManager,staffIncentive,mgrIncOnOwnSold,poolContribution,mgrSharePct:r.mgrSharePct};
  });
  const pool=pass1.reduce((s,e)=>s+e.poolContribution,0);
  const map={};
  pass1.forEach(e=>{
    map[e.id]=e.isManager?(Math.round(pool*(Number(e.mgrSharePct)||0)/100)+e.mgrIncOnOwnSold):e.staffIncentive;
  });
  return map;
}
function memRuleBIncentiveMapFor(salonId,year,month,EMPLOYEES,splitMode){
  const split=!!(splitMode&&splitMode.membership);
  const rows=loadMemRuleBRows(salonId,year,month);
  const pass1=EMPLOYEES.map(e=>{
    const s=loadMemRuleBSettings(salonId,split?incentiveGroupFor(e,salonId):undefined);
    const staffRate=Number(s.staffRate)||0,mgrRate=Number(s.mgrRate)||0,mgrShareRate=Number(s.mgrShareRate)||0;
    const valuePerCard=Number(s.valuePerCard)||0,incPerCard=Number(s.incPerCard)||0;
    const r=rows[e.id]||{};
    const cards=Number(r.cards)||0;
    const totalMembership=Math.round(rawMemActualFor(salonId,year,month,e));
    const cardTotalValue=cards*valuePerCard;
    const eliteCardIncentive=cards*incPerCard;
    const membershipAfterElite=Math.max(0,totalMembership-cardTotalValue);
    const isManager=MANAGER_DESIGNATIONS.has(e.desig);
    const staffIncentive=isManager?0:Math.round(membershipAfterElite*staffRate/100);
    const mgrIncentive=isManager?Math.round(membershipAfterElite*mgrRate/100):0;
    const mgrShareOnStaff=isManager?0:Math.round(membershipAfterElite*mgrShareRate/100);
    return{id:e.id,isManager,eliteCardIncentive,staffIncentive,mgrIncentive,mgrShareOnStaff,mgrSharePct:r.mgrSharePct};
  });
  const pool=pass1.reduce((s,e)=>s+e.mgrShareOnStaff,0);
  const map={};
  pass1.forEach(e=>{
    map[e.id]=e.isManager?(e.eliteCardIncentive+e.mgrIncentive+Math.round(pool*(Number(e.mgrSharePct)||0)/100)):(e.eliteCardIncentive+e.staffIncentive);
  });
  return map;
}
function memRuleCIncentiveMapFor(salonId,year,month,EMPLOYEES,splitMode){
  const split=!!(splitMode&&splitMode.membership);
  const rows=loadMemRuleCRows(salonId,year,month);
  const pass1=EMPLOYEES.map(e=>{
    const s=loadMemRuleCSettings(salonId,split?incentiveGroupFor(e,salonId):undefined);
    const newMemRate=Number(s.newMemRate)||0,walletRate=Number(s.walletRate)||0,mgrRate=Number(s.mgrRate)||0;
    const r=rows[e.id]||{};
    const newMembership=Number(r.newMembership)||0;
    const walletRecharge=Number(r.walletRecharge)||0;
    const incNewMem=Math.round(newMembership*newMemRate/100);
    const incWallet=Math.round(walletRecharge*walletRate/100);
    const isManager=MANAGER_DESIGNATIONS.has(e.desig);
    const poolContribution=isManager?0:Math.round((newMembership+walletRecharge)*mgrRate/100);
    return{id:e.id,isManager,incNewMem,incWallet,poolContribution,mgrSharePct:r.mgrSharePct};
  });
  const pool=pass1.reduce((s,e)=>s+e.poolContribution,0);
  const map={};
  pass1.forEach(e=>{
    map[e.id]=e.incNewMem+e.incWallet+(e.isManager?Math.round(pool*(Number(e.mgrSharePct)||0)/100):0);
  });
  return map;
}
// Picks the active rule (loadMemRuleType, default 'A') and returns {empId: membershipIncentiveAmt}
// for the whole outlet in one pass — computed once per incWorkingsFor call, not per employee.
// Rule TYPE (A/B/C) is one choice for the whole outlet; splitMode.membership only changes whose
// RATE settings each employee's own figures are computed with (their own designation group's).
function membershipIncentiveMapFor(salonId,year,month,EMPLOYEES,splitMode){
  const ruleType=loadMemRuleType(salonId);
  if(ruleType==='B')return memRuleBIncentiveMapFor(salonId,year,month,EMPLOYEES,splitMode);
  if(ruleType==='C')return memRuleCIncentiveMapFor(salonId,year,month,EMPLOYEES,splitMode);
  return memRuleAIncentiveMapFor(salonId,year,month,EMPLOYEES,splitMode);
}

// The Membership rate actually in effect for one employee under whichever of Rule A/B/C is
// active — a Manager's own rate vs a Staff's own rate, per that rule's settings. Used only to
// *display* a linked "Mem %" on the Incentive Working sheet in Automatic mode; the amount itself
// still comes from membershipIncentiveMapFor's full pass (pool shares etc.), not from this number.
function membershipRateUsedFor(salonId,employee,splitMode){
  const isManager=MANAGER_DESIGNATIONS.has(employee?.desig);
  const split=!!(splitMode&&splitMode.membership);
  const group=split?incentiveGroupFor(employee,salonId):undefined;
  const ruleType=loadMemRuleType(salonId);
  if(ruleType==='B'){const s=loadMemRuleBSettings(salonId,group);return isManager?(Number(s.mgrRate)||0):(Number(s.staffRate)||0);}
  if(ruleType==='C'){const s=loadMemRuleCSettings(salonId,group);return isManager?(Number(s.mgrRate)||0):(Number(s.newMemRate)||0);}
  const s=loadMemRuleASettings(salonId,group);return isManager?(Number(s.mgrRate)||0):(Number(s.staffRate)||0);
}

function incentiveModel1(ctx){
  const appl=loadIncentiveApplicability(ctx.salonId);
  const calcMode=ctx.calcMode||INCENTIVE_CALC_MODE_DEFAULTS;

  // Service — Automatic: rate comes from the Service Incentive Rate Slabs above (based on ×times
  // of salary achieved) — this employee's own designation group's slabs when Service is split by
  // Designation, else the one shared outlet slab table. Manual Rate %: the per-employee "Svc %"
  // column drives it instead. Manual Amount: the ₹ figure is typed straight in, rate skipped.
  let svcRateUsed=calcMode.svc==='manualRate'?ctx.svcRate:serviceSlabRateFor(ctx.salonId,ctx.svcTimesRaw,ctx.svcGroup);
  let svcIncAmt=appl.service?Math.round(ctx.svcActual*svcRateUsed/100):0;
  if(calcMode.svc==='manualAmt'){svcIncAmt=appl.service?(Number(ctx.svcManualAmt)||0):0;}

  // Membership — Automatic: driven by whichever of Rule A/B/C is active under Membership
  // Incentive Rules (see membershipIncentiveMapFor above); the displayed rate mirrors that rule's
  // own Manager/Staff rate (membershipRateUsedFor), from this employee's own designation group's
  // settings when Membership is split. Manual Rate %/Manual Amount work the same as Service above,
  // overriding the rule-based figure per employee.
  let memRateUsed=membershipRateUsedFor(ctx.salonId,ctx.employee,ctx.splitMode);
  let memIncAmt=appl.membership?(ctx.membershipIncentiveMap?.[ctx.employee?.id]||0):0;
  if(calcMode.mem==='manualRate'){memRateUsed=ctx.memRate;memIncAmt=appl.membership?Math.round(ctx.memActual*ctx.memRate/100):0;}
  else if(calcMode.mem==='manualAmt'){memIncAmt=appl.membership?(Number(ctx.memManualAmt)||0):0;}

  // Product — Automatic: Rule A applies the Product Incentive Rule's flat % rate to each
  // employee's own Product Achieved. Rule B pays the same flat ₹ amount to every employee with
  // Product Incentive switched on, irrespective of how much product they actually sold. Both the
  // rule and its rate/amount are this employee's own designation group's when Product is split
  // by Designation (ctx.prodRuleType/prodGlobalRate/prodFlatAmount already resolved per employee
  // by incWorkingsFor below). Manual Rate %/Manual Amount override either rule per employee, same
  // as Service/Membership.
  let prodRateUsed=null;
  let prodIncAmt;
  if(calcMode.prod==='manualRate'){
    prodRateUsed=ctx.prodRate;
    prodIncAmt=appl.product?Math.round(ctx.prodActual*ctx.prodRate/100):0;
  }else if(calcMode.prod==='manualAmt'){
    prodIncAmt=appl.product?(Number(ctx.prodManualAmt)||0):0;
  }else if(ctx.prodRuleType==='B'){
    prodIncAmt=appl.product?(Number(ctx.prodFlatAmount)||0):0;
  }else{
    prodRateUsed=Number(ctx.prodGlobalRate)||0;
    prodIncAmt=appl.product?Math.round(ctx.prodActual*prodRateUsed/100):0;
  }

  // Manager Incentive — a Salon Manager/Manager/Assist Manager's own Share Amount from the
  // Manager Incentive panel (salon-wide collection vs target, split by each manager's Share %)
  // folds straight into their own Total Incentive here. A per-employee manual override (see
  // incentiveManualOverrideFor) replaces this with a hand-typed ₹ amount for just that employee —
  // Manager Incentive never had an outlet-wide manual mode, so this is the only way to override
  // it for one or two managers without changing the Share %-of-pool calculation for everyone else.
  const mgrIncAmt=!(appl.manager&&MANAGER_DESIGNATIONS.has(ctx.employee?.desig))?0
    :ctx.mgrManualOverride?(Number(ctx.mgrManualAmt)||0)
    :managerShareAmountFor(ctx.salonId,ctx.year,ctx.month,ctx.employee.id);
  return{svcIncAmt,memIncAmt,prodIncAmt,mgrIncAmt,totalInc:svcIncAmt+memIncAmt+prodIncAmt+mgrIncAmt,svcRateUsed,memRateUsed,prodRateUsed};
}
const INCENTIVE_MODEL_FNS={1:incentiveModel1};



// ── Model 1's Manager Incentive — a separate rule, based on the whole salon's collection vs
// target rather than any individual employee's Achieved figures. A rate tier applies to Net
// Collection to get one incentive pool, which is then split between Managers by an editable
// Share % each. ──
const MGR_INCENTIVE_TIER_DEFAULTS=[{threshold:95,rate:0.5},{threshold:100,rate:1.0},{threshold:110,rate:1.25}];
function mgrTierKey(salonId){return outletKey('salonos_manager_incentive_tiers',salonId);}
function loadMgrIncentiveTiers(salonId){
  try{const v=JSON.parse(cachedLocalGet(mgrTierKey(salonId)));if(Array.isArray(v)&&v.length)return v;}catch(e){}
  return MGR_INCENTIVE_TIER_DEFAULTS.map(t=>({...t}));
}
function saveMgrIncentiveTiers(salonId,tiers){safeLocalSet(mgrTierKey(salonId),JSON.stringify(tiers));}
function mgrIncentiveRateFor(salonId,achievementPct){
  const tiers=loadMgrIncentiveTiers(salonId);
  let bestRate=0,bestThreshold=-Infinity;
  tiers.forEach(t=>{
    const th=Number(t.threshold);
    if(!isNaN(th)&&achievementPct>=th&&th>=bestThreshold){bestThreshold=th;bestRate=Number(t.rate)||0;}
  });
  return bestRate;
}
function mgrIncMonthKey(year,month){return year+'_'+month;}
// ── Carry-forward for Manager Share % — a manager's split of a pooled incentive (Membership
// Rule A/B/C's mgrSharePct per manager, and Manager Incentive Rule A's `shares` map) is a rule
// that's set once and rarely changes, not a fresh monthly figure — unlike actual sale/collection
// amounts, which genuinely differ every month and must stay blank until entered. When a brand-new
// month has no saved record yet in one of these month-keyed stores, these helpers copy forward
// just the Share % from the most recent earlier month that has some, so it doesn't need
// re-entering every month. Runs once per month (the very first time it's read); if the month
// already has any record — even a blank one someone saved on purpose — it's left untouched. ──
function mgrIncMonthKeyToParts(key){
  const parts=String(key).split('_');
  return{y:Number(parts[0]),m:Number(parts[1])};
}
function mostRecentPriorMonthKey(all,year,month){
  let bestKey=null,bestY=-Infinity,bestM=-Infinity;
  Object.keys(all).forEach(k=>{
    const p=mgrIncMonthKeyToParts(k);
    if(isNaN(p.y)||isNaN(p.m))return;
    if(p.y>year||(p.y===year&&p.m>=month))return; // only strictly earlier months
    if(p.y>bestY||(p.y===bestY&&p.m>bestM)){bestY=p.y;bestM=p.m;bestKey=k;}
  });
  return bestKey;
}
// Used by Membership Incentive Rule A/B/C — each row is {..., mgrSharePct}; only mgrSharePct
// carries forward, everything else (Cards Sold, New Membership, Wallet Recharge, etc.) is a fresh
// monthly actual and stays out of what's carried.
function carryForwardMgrSharePct(all,year,month){
  const priorKey=mostRecentPriorMonthKey(all,year,month);
  if(!priorKey)return{};
  const prior=all[priorKey]||{};
  const carried={};
  Object.keys(prior).forEach(empId=>{
    const pct=prior[empId]&&prior[empId].mgrSharePct;
    if(pct!==undefined&&pct!==''&&pct!==null)carried[empId]={mgrSharePct:pct};
  });
  return carried;
}
function mgrIncInputsKey(salonId){return outletKey('salonos_manager_incentive_inputs',salonId);}
function loadMgrIncentiveInputsAll(salonId){
  try{const v=JSON.parse(cachedLocalGet(mgrIncInputsKey(salonId))||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}
}
function saveMgrIncentiveInputsAll(salonId,all){safeLocalSet(mgrIncInputsKey(salonId),JSON.stringify(all));}
function loadMgrIncentiveInputs(salonId,year,month){
  const all=loadMgrIncentiveInputsAll(salonId);
  const curKey=mgrIncMonthKey(year,month);
  if(all[curKey])return all[curKey];
  // targetCollection is a genuine fresh monthly figure and always starts blank; only the
  // Managers' own Share % split of the pool carries forward.
  const priorKey=mostRecentPriorMonthKey(all,year,month);
  const priorShares=priorKey&&all[priorKey]&&all[priorKey].shares;
  if(priorShares&&Object.keys(priorShares).length){
    const carried={targetCollection:'',shares:{...priorShares}};
    all[curKey]=carried;
    saveMgrIncentiveInputsAll(salonId,all);
    return carried;
  }
  return{targetCollection:'',shares:{}};
}
function saveMgrIncentiveInputs(salonId,year,month,rec){
  const all=loadMgrIncentiveInputsAll(salonId);
  all[mgrIncMonthKey(year,month)]=rec;
  saveMgrIncentiveInputsAll(salonId,all);
}
// ── Total Collection is linked straight from Collection Reco (Cash+Card+UPI+District+Luzo+
// Online — Wallet is deliberately excluded), with a checkbox per item to include/exclude it from
// the total. The checkbox selection is a per-outlet preference, not tied to any one month. ──
const MGR_COLLECTION_ITEMS=[{key:'cash',label:'Cash'},{key:'card',label:'Card'},{key:'upi',label:'UPI'},{key:'district',label:'District'},{key:'luzo',label:'Luzo'},{key:'online',label:'Online'}];
function mgrCollectionItemsKey(salonId){return outletKey('salonos_manager_incentive_collection_items',salonId);}
function loadMgrCollectionItems(salonId){
  const defaults={};MGR_COLLECTION_ITEMS.forEach(it=>{defaults[it.key]=true;});
  try{const v=JSON.parse(cachedLocalGet(mgrCollectionItemsKey(salonId)));if(v&&typeof v==='object')return{...defaults,...v};}catch(e){}
  return defaults;
}
function saveMgrCollectionItems(salonId,items){safeLocalSet(mgrCollectionItemsKey(salonId),JSON.stringify(items));}
// Cash/Card/UPI/District/Luzo/Online totals for a calendar month, straight from Collection
// Reco's Imported Data Preview — same source and month-matching as collectionSalesSumFor, just
// with the extra payment modes Manager Incentive's Total Collection needs.
function mgrCollectionSumFor(salonId,year,month){
  let rows=[];
  try{rows=JSON.parse(cachedLocalGet(outletKey('salonos_cradlee_collection_rows',salonId))||'[]');}catch(e){}
  let cash=0,card=0,upi=0,district=0,luzo=0,online=0;
  rows.forEach(r=>{
    const iso=toISO(r.invoiceDate);
    if(!iso)return;
    const d=new Date(iso+'T00:00:00');
    if(isNaN(d)||d.getFullYear()!==year||d.getMonth()!==month)return;
    cash+=Number(r.cash)||0;card+=Number(r.card)||0;upi+=Number(r.upi)||0;
    district+=Number(r.district)||0;luzo+=Number(r.luzo)||0;online+=Number(r.online)||0;
  });
  return{cash,card,upi,district,luzo,online};
}
// Total Collection = sum of whichever of Cash/Card/UPI/District/Luzo/Online are checked on for
// this outlet. Net of GST = Total Collection × 1.05 (per the rule as given).
function mgrTotalCollectionFor(salonId,year,month){
  const sum=mgrCollectionSumFor(salonId,year,month);
  const items=loadMgrCollectionItems(salonId);
  return MGR_COLLECTION_ITEMS.reduce((s,it)=>s+(items[it.key]?(sum[it.key]||0):0),0);
}
const MANAGER_DESIGNATIONS=new Set(['Salon Manager','Manager','Assist Manager']);
function managerIncentivePoolFor(salonId,year,month){
  const rec=loadMgrIncentiveInputs(salonId,year,month);
  const total=mgrTotalCollectionFor(salonId,year,month);
  const net=total/1.05;
  const target=Number(rec.targetCollection)||0;
  const achievementPct=target?(net/target*100):0;
  const rate=mgrIncentiveRateFor(salonId,achievementPct);
  return Math.round(net*rate/100);
}
function managerShareAmountFor(salonId,year,month,empId){
  const rec=loadMgrIncentiveInputs(salonId,year,month);
  const sharePct=Number(rec.shares?.[empId])||0;
  if(!sharePct)return 0;
  return Math.round(managerIncentivePoolFor(salonId,year,month)*sharePct/100);
}

// ── Manager Incentive Rules (A/B) — Rule A is the collection-vs-target tiered model above; Rule
// B is a simpler quarterly worksheet, entirely hand-entered (3-month sale, target, achievement %,
// commission %, commission amount, what's already been paid out, and what's still payable) — no
// figure here is derived from anything else in the app, matching how this rule is actually used.
// Only one rule is active per outlet at a time, same pattern as Membership Incentive's A/B/C. ──
function mgrRuleTypeKey(salonId,group){return withGroupSuffix(outletKey('salonos_mgr_incentive_rule_type',salonId),group);}
function loadMgrRuleType(salonId,group){
  let v=null;try{v=cachedLocalGet(mgrRuleTypeKey(salonId,group));}catch(e){}
  return v==='B'?'B':'A';
}
function saveMgrRuleType(salonId,type,group){safeLocalSet(mgrRuleTypeKey(salonId,group),type);}
const MGR_RULE_B_BLANK={months:'3',totalSale3mo:'',mgrTarget:'',commissionPct:'',commissionAmt:'',alreadyPaid:''};
function mgrRuleBKey(salonId,group){return withGroupSuffix(outletKey('salonos_mgr_incentive_rule_b',salonId),group);}
function loadMgrRuleBAll(salonId,group){
  try{const v=JSON.parse(cachedLocalGet(mgrRuleBKey(salonId,group))||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}
}
function saveMgrRuleBAll(salonId,all,group){safeLocalSet(mgrRuleBKey(salonId,group),JSON.stringify(all));}
function loadMgrRuleBInputs(salonId,year,month,group){
  const all=loadMgrRuleBAll(salonId,group);
  return{...MGR_RULE_B_BLANK,...(all[mgrIncMonthKey(year,month)]||{})};
}
function saveMgrRuleBInputs(salonId,year,month,rec,group){
  const all=loadMgrRuleBAll(salonId,group);
  all[mgrIncMonthKey(year,month)]=rec;
  saveMgrRuleBAll(salonId,all,group);
}

// ── Model 1 — Membership Incentive Rules (A/B/C) — three alternate ways to compute Membership
// Incentive, selectable per outlet. Only one is "active" at a time; each rule keeps its own
// settings/entries in separate storage so switching between them never loses data. ──
function memRuleTypeKey(salonId){return outletKey('salonos_mem_incentive_rule_type',salonId);}
function loadMemRuleType(salonId){
  let v=null;try{v=cachedLocalGet(memRuleTypeKey(salonId));}catch(e){}
  return v==='A'||v==='B'||v==='C'?v:'A';
}
function saveMemRuleType(salonId,type){safeLocalSet(memRuleTypeKey(salonId),type);}

// Rule A — flat rate on Membership Sale, employee-wise: a Manager's own sale earns the Manager a
// straight rate; a Staff (non-Manager)'s sale earns the Staff their own rate, plus a separate
// Manager Share rate on top that flows to the Manager pool.
function memRuleAKey(salonId,group){return withGroupSuffix(outletKey('salonos_mem_rule_a_settings',salonId),group);}
function loadMemRuleASettings(salonId,group){
  try{const v=JSON.parse(cachedLocalGet(memRuleAKey(salonId,group)));if(v&&typeof v==='object')return v;}catch(e){}
  return{mgrRate:3,staffRate:2,mgrShareRate:1};
}
function saveMemRuleASettings(salonId,s,group){safeLocalSet(memRuleAKey(salonId,group),JSON.stringify(s));}
function memRuleARowsKey(salonId){return outletKey('salonos_mem_rule_a_rows',salonId);}
function loadMemRuleARowsAll(salonId){
  try{const v=JSON.parse(cachedLocalGet(memRuleARowsKey(salonId))||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}
}
function loadMemRuleARows(salonId,year,month){
  const all=loadMemRuleARowsAll(salonId);
  const curKey=mgrIncMonthKey(year,month);
  if(all[curKey]&&Object.keys(all[curKey]).length)return all[curKey];
  const carried=carryForwardMgrSharePct(all,year,month);
  if(Object.keys(carried).length){
    all[curKey]=carried;
    safeLocalSet(memRuleARowsKey(salonId),JSON.stringify(all));
  }
  return all[curKey]||{};
}
function saveMemRuleARows(salonId,year,month,rows){
  const all=loadMemRuleARowsAll(salonId);all[mgrIncMonthKey(year,month)]=rows;
  safeLocalSet(memRuleARowsKey(salonId),JSON.stringify(all));
}

// Rule B — Elite Card Incentive stacked on top of Membership Incentive, employee-wise. Elite Card
// sales are netted out of Total Membership before Staff/Manager % apply, so the same rupee of
// sale isn't incentivized twice under both the card rule and the membership rule.
function memRuleBKey(salonId,group){return withGroupSuffix(outletKey('salonos_mem_rule_b_settings',salonId),group);}
function loadMemRuleBSettings(salonId,group){
  try{const v=JSON.parse(cachedLocalGet(memRuleBKey(salonId,group)));if(v&&typeof v==='object')return v;}catch(e){}
  return{staffRate:2,mgrRate:3,mgrShareRate:1,valuePerCard:0,incPerCard:0};
}
function saveMemRuleBSettings(salonId,s,group){safeLocalSet(memRuleBKey(salonId,group),JSON.stringify(s));}
function memRuleBRowsKey(salonId){return outletKey('salonos_mem_rule_b_rows',salonId);}
function loadMemRuleBRowsAll(salonId){
  try{const v=JSON.parse(cachedLocalGet(memRuleBRowsKey(salonId))||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}
}
function loadMemRuleBRows(salonId,year,month){
  const all=loadMemRuleBRowsAll(salonId);
  const curKey=mgrIncMonthKey(year,month);
  if(all[curKey]&&Object.keys(all[curKey]).length)return all[curKey];
  const carried=carryForwardMgrSharePct(all,year,month);
  if(Object.keys(carried).length){
    all[curKey]=carried;
    safeLocalSet(memRuleBRowsKey(salonId),JSON.stringify(all));
  }
  return all[curKey]||{};
}
function saveMemRuleBRows(salonId,year,month,rows){
  const all=loadMemRuleBRowsAll(salonId);all[mgrIncMonthKey(year,month)]=rows;
  safeLocalSet(memRuleBRowsKey(salonId),JSON.stringify(all));
}

// Rule C — Membership Incentive split between New Membership sold and Wallet Recharge, each at
// its own rate, plus a Manager override rate on top. Employee-wise, with an optional CSV import
// from the billing software's own export format (see MemRuleC's downloadTemplate/handleFile).
function memRuleCKey(salonId,group){return withGroupSuffix(outletKey('salonos_mem_rule_c_settings',salonId),group);}
function loadMemRuleCSettings(salonId,group){
  try{const v=JSON.parse(cachedLocalGet(memRuleCKey(salonId,group)));if(v&&typeof v==='object')return v;}catch(e){}
  return{newMemRate:1,walletRate:2,mgrRate:1};
}
function saveMemRuleCSettings(salonId,s,group){safeLocalSet(memRuleCKey(salonId,group),JSON.stringify(s));}
function memRuleCRowsKey(salonId){return outletKey('salonos_mem_rule_c_rows',salonId);}
function loadMemRuleCRowsAll(salonId){
  try{const v=JSON.parse(cachedLocalGet(memRuleCRowsKey(salonId))||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}
}
function loadMemRuleCRows(salonId,year,month){
  const all=loadMemRuleCRowsAll(salonId);
  const curKey=mgrIncMonthKey(year,month);
  if(all[curKey]&&Object.keys(all[curKey]).length)return all[curKey];
  const carried=carryForwardMgrSharePct(all,year,month);
  if(Object.keys(carried).length){
    all[curKey]=carried;
    safeLocalSet(memRuleCRowsKey(salonId),JSON.stringify(all));
  }
  return all[curKey]||{};
}
function saveMemRuleCRows(salonId,year,month,rows){
  const all=loadMemRuleCRowsAll(salonId);all[mgrIncMonthKey(year,month)]=rows;
  safeLocalSet(memRuleCRowsKey(salonId),JSON.stringify(all));
}

// ── Model 1 — Product Incentive Rule — Rule A: a single flat rate on total Sale of Product for
// the month, applied to each employee's own Product Achieved (same pattern as Membership Rule A).
// Rule B: a flat ₹ amount, paid the same to every employee with Product Incentive switched on,
// irrespective of how much product they actually sold. Only one rule active per outlet at a
// time, same A/B/C pattern used by Membership and Manager Incentive above. ──
function prodIncRuleKey(salonId,group){return withGroupSuffix(outletKey('salonos_product_incentive_rule',salonId),group);}
function loadProductIncentiveRule(salonId,group){
  try{const v=JSON.parse(cachedLocalGet(prodIncRuleKey(salonId,group)));if(v&&typeof v==='object')return v;}catch(e){}
  return{rate:5};
}
function saveProductIncentiveRule(salonId,s,group){safeLocalSet(prodIncRuleKey(salonId,group),JSON.stringify(s));}
function prodRuleTypeKey(salonId,group){return withGroupSuffix(outletKey('salonos_product_incentive_rule_type',salonId),group);}
function loadProdRuleType(salonId,group){
  let v=null;try{v=cachedLocalGet(prodRuleTypeKey(salonId,group));}catch(e){}
  return v==='B'?'B':'A';
}
function saveProdRuleType(salonId,type,group){safeLocalSet(prodRuleTypeKey(salonId,group),type);}
function prodFlatRuleKey(salonId,group){return withGroupSuffix(outletKey('salonos_product_incentive_flat_rule',salonId),group);}
function loadProductFlatRule(salonId,group){
  try{const v=JSON.parse(cachedLocalGet(prodFlatRuleKey(salonId,group)));if(v&&typeof v==='object')return v;}catch(e){}
  return{amount:0};
}
function saveProductFlatRule(salonId,s,group){safeLocalSet(prodFlatRuleKey(salonId,group),JSON.stringify(s));}
function prodIncEntryKey(salonId){return outletKey('salonos_product_incentive_entries',salonId);}
function loadProductIncentiveEntryAll(salonId){
  try{const v=JSON.parse(cachedLocalGet(prodIncEntryKey(salonId))||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}
}
function loadProductIncentiveEntry(salonId,year,month){
  return loadProductIncentiveEntryAll(salonId)[mgrIncMonthKey(year,month)]||{saleAmt:''};
}
function saveProductIncentiveEntry(salonId,year,month,rec){
  const all=loadProductIncentiveEntryAll(salonId);all[mgrIncMonthKey(year,month)]=rec;
  safeLocalSet(prodIncEntryKey(salonId),JSON.stringify(all));
}

// ── Times formatting preference — decimal places and rounding mode, shared across the whole
// Incentive Working sheet, persisted per outlet. ──
function loadIncTimesFormat(salonId){
  try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_inc_times_format',salonId)));if(v&&typeof v==='object')return v;}catch(e){}
  return{decimals:2,mode:'round'}; // mode: 'round' | 'up' | 'down'
}
function saveIncTimesFormat(salonId,fmt){safeLocalSet(outletKey('salonos_inc_times_format',salonId),JSON.stringify(fmt));}
function formatTimes(n,fmt){
  const mult=Math.pow(10,fmt.decimals);
  let v;
  if(fmt.mode==='up')v=Math.ceil(n*mult)/mult;
  else if(fmt.mode==='down')v=Math.floor(n*mult)/mult;
  else v=Math.round(n*mult)/mult;
  return v.toFixed(fmt.decimals)+' Times';
}

// ── Shared Incentive Working computation ──
function incWorkingsFor(salonId,year,month){
  const EMPLOYEES=getEmployeesForMonth(year,month,salonId).filter(e=>e.desig!=='Helper'&&e.desig!=='Housekeeper');
  const actuals=loadIncentiveActuals(salonId);
  const rates=loadIncentiveRates(salonId);
  const activeModel=loadActiveIncentiveModel(salonId);
  const modelFn=INCENTIVE_MODEL_FNS[activeModel]||incentiveModel1;
  const cols=loadIWCols(salonId);
  const iwMeta=loadIWMeta(salonId);
  // Incentive Plans by Designation — per-category toggle; when a category is split, that
  // category's rate/rule/target-multiplier settings are read per employee from their own
  // designation group (Hairdresser/Beautician/Pedicurist/Manager) instead of one outlet default.
  const splitMode=loadIncentiveSplitMode(salonId);
  // Built once for the whole outlet/month — not per employee — since Rule A/B/C's Manager pool
  // distribution needs every employee's figures together anyway. splitMode is threaded through so
  // each employee's own group's rate settings are used when Membership is split.
  const membershipIncentiveMap=cols.membership?membershipIncentiveMapFor(salonId,year,month,EMPLOYEES,splitMode):{};
  // Rate/Amount Source (Automatic/Manual Rate/Manual Amount) per category.
  const calcMode=loadIncentiveCalcMode(salonId);
  return EMPLOYEES.map(e=>{
    const salary=e.gross;
    // Product Incentive's active rule/rate — this employee's own designation group's when Product
    // is split by Designation, else the one shared outlet rule (same as before).
    const prodGroup=splitMode.product?incentiveGroupFor(e,salonId):undefined;
    const prodRuleType=loadProdRuleType(salonId,prodGroup);
    const prodGlobalRate=Number(loadProductIncentiveRule(salonId,prodGroup).rate)||0;
    const prodFlatAmount=Number(loadProductFlatRule(salonId,prodGroup).amount)||0;
    const svcGroup=splitMode.service?incentiveGroupFor(e,salonId):undefined;
    let svcTarget=salary*targetMultFor('svc',salonId,e,splitMode);
    let memTarget=salary*targetMultFor('mem',salonId,e,splitMode);
    let prodTarget=salary*targetMultFor('prod',salonId,e,splitMode);
    const reportRow=staffWorkReportRowFor(salonId,year,month,e.billingId);
    let svcActual,memActual,prodActual;
    const fromReport=!!reportRow;
    if(reportRow){
      svcActual=(Number(reportRow['ServiceSale'])||0)+(Number(reportRow['PackageSale'])||0)+0.5*(Number(reportRow['ComplementarySale'])||0);
      memActual=Number(reportRow['MemberShipSale'])||0;
      prodActual=Number(reportRow['ProductSale'])||0;
    }else{
      const a=actuals[incActualKey(e.id,year,month)]||{};
      svcActual=Number(a.svcActual)||0;
      memActual=Number(a.memActual)||0;
      prodActual=Number(a.prodActual)||0;
    }
    // A category toggled off is excluded entirely — Achieved AND Target both go to 0, so every
    // derived figure (×times, %, incentive amount) is consistently 0 too, not just the final
    // incentive sum left non-zero with stray achievement stats still showing.
    if(!cols.svcTarget){svcActual=0;svcTarget=0;}
    if(!cols.membership){memActual=0;memTarget=0;}
    if(!cols.product){prodActual=0;prodTarget=0;}
    // Penalty — a manual deduction from this employee's Incentive, entered directly on the
    // Incentive Working sheet (independent of Salary Working's own separate Penalty Sheet).
    const penaltyAmt=cols.penalty?(Number((actuals[incActualKey(e.id,year,month)]||{}).penaltyAmt)||0):0;
    const totalTarget=svcTarget+memTarget+prodTarget;
    const totalActual=svcActual+memActual+prodActual;
    const svcTimesRaw=salary?svcActual/salary:0;
    const memTimesRaw=salary?memActual/salary:0;
    const prodTimesRaw=salary?prodActual/salary:0;
    const totalTimesRaw=salary?totalActual/salary:0; // combined achievement in ×times of salary — compares against combined target (svc+mem+prod multipliers)
    const svcPct=svcTarget?Math.min(100,Math.round((svcActual/svcTarget)*100)):0;
    const memPct=memTarget?Math.min(100,Math.round((memActual/memTarget)*100)):0;
    const prodPct=prodTarget?Math.min(100,Math.round((prodActual/prodTarget)*100)):0;
    const r=rates[incActualKey(e.id,year,month)]||{};
    const svcRate=r.svcRate!=null?Number(r.svcRate):INCENTIVE_RATE_DEFAULTS.svcRate;
    const memRate=r.memRate!=null?Number(r.memRate):INCENTIVE_RATE_DEFAULTS.memRate;
    const prodRate=r.prodRate!=null?Number(r.prodRate):INCENTIVE_RATE_DEFAULTS.prodRate;
    // Manual Amount overrides — only read/used when that category's Rate/Amount Source is set to
    // "Manual Amount ₹" under Incentive Rules & Settings; ignored (but preserved) otherwise.
    const svcManualAmt=r.svcAmt!=null?Number(r.svcAmt):0;
    const memManualAmt=r.memAmt!=null?Number(r.memAmt):0;
    const prodManualAmt=r.prodAmt!=null?Number(r.prodAmt):0;
    const mgrManualAmt=r.mgrAmt!=null?Number(r.mgrAmt):0;
    // Per-employee manual override — forces that ONE employee's category into manual-amount
    // treatment regardless of the outlet-wide calcMode above, without touching anyone else's.
    const manualOv=incentiveManualOverrideFor(salonId,e.id);
    const effCalcMode={
      svc:manualOv.svc?'manualAmt':calcMode.svc,
      mem:manualOv.mem?'manualAmt':calcMode.mem,
      prod:manualOv.prod?'manualAmt':calcMode.prod
    };
    const {svcIncAmt,memIncAmt,prodIncAmt,totalInc,svcRateUsed,memRateUsed,prodRateUsed,mgrIncAmt}=modelFn({
      salonId,year,month,salary,svcActual,memActual,prodActual,svcTarget,memTarget,prodTarget,
      svcRate,memRate,prodRate,svcPct,memPct,prodPct,svcTimesRaw,memTimesRaw,prodTimesRaw,
      totalActual,totalTarget,employee:e,membershipIncentiveMap,calcMode:effCalcMode,prodGlobalRate,
      prodRuleType,prodFlatAmount,svcManualAmt,memManualAmt,prodManualAmt,svcGroup,splitMode,
      mgrManualOverride:!!manualOv.mgr,mgrManualAmt
    });
    // Advance Adj. — this month's installment for any advance the employee has flagged to be
    // recovered from Incentive rather than Salary (see "Recover Against" on the Advances sheet).
    // Netted out of totalInc here, exactly like Penalty above, so it flows through to every
    // consumer of incWorkingsFor automatically: Incentive Working's own table, Incentive
    // Payment, and P&L's Employee Cost all see the same, already-adjusted figure.
    // Adv Adj — same fix as Salary Working's own: once Approved and settled, use the frozen
    // amount actually deducted (from iwMeta's advanceSettledBreakdown) rather than recomputing
    // live, which would show less (often ₹0) after settlement reduces the advance's balance.
    const iwM=iwMeta[attMonthKey(e.id,year,month)];
    const advAdj=cols.advAdj
      ?(iwM&&iwM.advanceSettled&&Array.isArray(iwM.advanceSettledBreakdown)
          ?iwM.advanceSettledBreakdown.reduce((s,b)=>s+(Number(b.amount)||0),0)
          :advanceDeductionFor(salonId,e.name,'Incentive',year,month))
      :0;
    // Overtime (OT) — Column Groups → "Overtime (OT)" on, and the employee's OT box ticked:
    // Total Monthly Salary ÷ days in the month ÷ normal working hours × OT hours. Normal working hours
    // carry forward from the employee's previous month until changed.
    const otA=actuals[incActualKey(e.id,year,month)]||{};
    const prevOt=actuals[incActualKey(e.id,month===0?year-1:year,month===0?11:month-1)]||{};
    const otApplicable=otA.otApplicable!==undefined?otA.otApplicable!==false&&otA.otApplicable!==0:(prevOt.otApplicable!==undefined?prevOt.otApplicable!==false&&prevOt.otApplicable!==0:true);
    const otNormalHours=Number(otA.otNormalHours)||Number(prevOt.otNormalHours)||0;
    const otHours=Number(otA.otHours)||0;
    const otDays=new Date(year,month+1,0).getDate();
    const otAmt=cols.ot&&otApplicable&&otNormalHours>0&&otHours>0?Math.round(salary/otDays/otNormalHours*otHours):0;
    return{...e,salary,svcTarget,svcActual:Math.round(svcActual),memTarget,memActual:Math.round(memActual),prodTarget,prodActual:Math.round(prodActual),
      otApplicable,otNormalHours,otHours,otDays,otAmt,
      totalTarget:Math.round(totalTarget),totalActual:Math.round(totalActual),svcTimesRaw,memTimesRaw,prodTimesRaw,totalTimesRaw,svcPct,memPct,prodPct,
      svcRate,memRate,prodRate,svcRateUsed:svcRateUsed!=null?svcRateUsed:svcRate,
      memRateUsed:memRateUsed!=null?memRateUsed:memRate,prodRateUsed:prodRateUsed!=null?prodRateUsed:prodRate,
      svcManualAmt,memManualAmt,prodManualAmt,mgrManualAmt,calcMode:effCalcMode,manualOv,prodRuleType,prodFlatAmount,
      svcIncAmt,memIncAmt,prodIncAmt,mgrIncAmt:mgrIncAmt||0,
      penaltyAmt,advAdj,totalInc:Math.max(0,totalInc+otAmt-penaltyAmt-advAdj),fromReport,activeModel};
  });
}

// ── Salary/Incentive/Daily Incentive Outstanding for one employee, one calendar month — used by
// Bank Statement's O/S Invoices column when a debit row is classified Salary, Incentive, or
// Daily Incentive and an employee is resolved. Salary/Incentive mirror Salary Working's /
// Incentive Working's own Payment Status for that employee/month (set from those sheets
// themselves, or by settling it from here — see settleEmployeePayFor below). Daily Incentive has
// no Payment Status field of its own on its sheet (it's a running list of per-day entries, not
// one monthly figure) — worse, it's really FOUR separate payable buckets (Membership/Product/
// Service/Target Commission), so a small dedicated meta store — salonos_daily_incentive_meta,
// keyed per employee/month/category — tracks each bucket's Payment Status independently once
// it's been settled from here. Either way, there's exactly one source of truth for whether an
// employee's been paid, never reconstructed by scanning Bank Statement rows.
function employeeSalaryOutstandingFor(salonId,employeeId,year,month){
  const meta=loadSWMeta(salonId);
  const m=meta[attMonthKey(employeeId,year,month)];
  if(m&&m.paymentStatus==='Paid')return 0;
  const w=swWorkingsFor(salonId,year,month).find(x=>x.id===employeeId);
  return w?Math.max(0,w.net):0;
}
function employeeIncentiveOutstandingFor(salonId,employeeId,year,month){
  const meta=loadIWMeta(salonId);
  const m=meta[attMonthKey(employeeId,year,month)];
  if(m&&m.paymentStatus==='Paid')return 0;
  const w=incWorkingsFor(salonId,year,month).find(x=>x.id===employeeId);
  return w?Math.max(0,w.totalInc||0):0;
}
// The four DSE-synced "M.Ship Pro. And Daily Incentive" categories, plus "Other" for any Daily
// Incentive entry whose Service Type was typed in free-hand and doesn't match one of the four
// (entries added directly on the Daily Incentive Sheet, not synced from Daily Sales & Exp).
const DAILY_INCENTIVE_CATEGORIES=['Membership Commission/Incentives','Product Commission/Incentives','Service Commission/Incentives','Target Commission/Incentives'];
const DAILY_INCENTIVE_CATEGORIES_ALL=[...DAILY_INCENTIVE_CATEGORIES,'Other'];
function loadDailyIncentiveEntries(salonId){
  try{const raw=JSON.parse(cachedLocalGet(outletKey('salonos_daily_incentive_entries',salonId))||'[]');if(Array.isArray(raw))return raw;}catch(e){}
  return [];
}
function saveDailyIncentiveEntries(entries,salonId){
  safeLocalSet(outletKey('salonos_daily_incentive_entries',salonId),JSON.stringify(entries));
}
// Each Daily Incentive entry carries its own Mode of Payment — "Cash" (the default, and what
// every DSE-synced entry gets) or "Bank" — same field as the Cash/Bank badge on the Daily
// Incentive Sheet itself. Only "Bank" entries are actually awaiting a bank settlement; anything
// still marked "Cash" was already paid out in cash at the time, so it must never show up here as
// something Bank Statement still needs to settle. An entry that's already been pushed straight
// into a Bank Statement row from the Daily Incentive Sheet's own "Add to Bank Statement" action
// (see DailyIncentiveCore) carries a bankRowId — that one's already accounted for on that row, so
// it's excluded here too rather than being offered again as still-outstanding.
function dailyIncentiveCategoryTotalFor(salonId,employeeId,year,month,category){
  return loadDailyIncentiveEntries(salonId).filter(r=>{
    if(r.empId!==employeeId)return false;
    if(r.mode!=='Bank')return false;
    if(r.bankRowId)return false;
    if(category==='Other'){if(DAILY_INCENTIVE_CATEGORIES.includes(r.service))return false;}
    else if(r.service!==category)return false;
    const d=r.date?new Date(r.date+'T00:00:00'):null;
    return d&&!isNaN(d)&&d.getFullYear()===year&&d.getMonth()===month;
  }).reduce((s,r)=>s+(Number(r.incentive)||0),0);
}
// Unlike Salary/Incentive (which have one Payment Status per employee/month to settle against),
// Daily Incentive doesn't behave like a running balance — each entry is its own day's commission,
// and paying it doesn't leave a shrinking "outstanding" figure the way an unpaid salary does. So
// this deliberately does NOT check or reduce for anything already settled from Bank Statement —
// every Bank-mode entry's full amount always shows here, and every Settle Pay against it is a
// fresh payment record rather than paying down a balance. What actually happened lives on the
// bank row's own linkedEmployeePay entry (and the Salary Working/Incentive Working meta stores
// for Salary/Incentive still work exactly as before — this only changes Daily Incentive).
// dailyIncentiveCategoryTotalFor above already excludes anything still marked Cash — that was
// paid out directly, not through a bank transfer, so it was never "outstanding" here to begin
// with, regardless of anything settled from this screen.
function employeeDailyIncentiveCategoryOutstandingFor(salonId,employeeId,year,month,category){
  return Math.max(0,dailyIncentiveCategoryTotalFor(salonId,employeeId,year,month,category));
}
// Total across all four categories + Other — the headline figure shown on the O/S Invoices
// button before it's broken down category-by-category in the Settle Pay modal.
function employeeDailyIncentiveOutstandingFor(salonId,employeeId,year,month){
  return DAILY_INCENTIVE_CATEGORIES_ALL.reduce((s,cat)=>s+employeeDailyIncentiveCategoryOutstandingFor(salonId,employeeId,year,month,cat),0);
}
// Marks Salary Working's / Incentive Working's own Payment Status as "Paid" (mode "Bank
// Transfer") for one employee/month — so settling a payment from Bank Statement is reflected
// back on whichever sheet it actually belongs to, not just noted locally on the bank row. Only
// marks a component Paid when its amount covers that component's outstanding figure (within ₹1);
// a smaller, partial amount still gets recorded on the bank row for traceability but leaves the
// status untouched, since Payment Status has no partial state to represent that in. Silently
// no-ops for a locked month, same as the sheets themselves would refuse to change it. Daily
// Incentive has no such status to set (see the note above) — every ticked category with an
// amount just counts as settled, recorded on the bank row itself.
function settleEmployeePayFor(salonId,employeeId,year,month,{salaryAmt,incentiveAmt,dailyIncentiveByCat}){
  const locked=!!(monthLockRecordFor(salonId,year,month)||{}).locked;
  if(locked)return{salarySettled:false,incentiveSettled:false,dailyIncentiveSettled:{}};
  let salarySettled=false,incentiveSettled=false;
  const dailyIncentiveSettled={};
  if(salaryAmt>0){
    const outstanding=employeeSalaryOutstandingFor(salonId,employeeId,year,month);
    if(salaryAmt>=outstanding-1){
      const meta=loadSWMeta(salonId);
      const key=attMonthKey(employeeId,year,month);
      meta[key]={...(meta[key]||{status:'Draft',paymentStatus:'Not Paid',mode:''}),paymentStatus:'Paid',mode:'Bank Transfer'};
      saveSWMeta(meta,salonId);
      salarySettled=true;
    }
  }
  if(incentiveAmt>0){
    const outstanding=employeeIncentiveOutstandingFor(salonId,employeeId,year,month);
    if(incentiveAmt>=outstanding-1){
      const meta=loadIWMeta(salonId);
      const key=attMonthKey(employeeId,year,month);
      meta[key]={...(meta[key]||{status:'Draft',paymentStatus:'Not Paid',mode:''}),paymentStatus:'Paid',mode:'Bank Transfer'};
      saveIWMeta(meta,salonId);
      incentiveSettled=true;
    }
  }
  Object.entries(dailyIncentiveByCat||{}).forEach(([cat,amt])=>{
    if(amt>0)dailyIncentiveSettled[cat]=true; // logged on the bank row only — no balance to reduce
  });
  return{salarySettled,incentiveSettled,dailyIncentiveSettled};
}
// Reverses settleEmployeePayFor — sets Payment Status back to "Not Paid" for whichever Salary/
// Incentive component(s) this bank row had actually settled, used when the row is unlinked.
// Nothing to reverse for Daily Incentive, since it never wrote a status anywhere to begin with.
function unsettleEmployeePayFor(salonId,employeeId,year,month,{salary,incentive}){
  if(salary){
    const meta=loadSWMeta(salonId);
    const key=attMonthKey(employeeId,year,month);
    if(meta[key])meta[key]={...meta[key],paymentStatus:'Not Paid',mode:''};
    saveSWMeta(meta,salonId);
  }
  if(incentive){
    const meta=loadIWMeta(salonId);
    const key=attMonthKey(employeeId,year,month);
    if(meta[key])meta[key]={...meta[key],paymentStatus:'Not Paid',mode:''};
    saveIWMeta(meta,salonId);
  }
}

// ── Employee Cost for P&L — built directly from Salary Working + Incentive Working ──
// Six front-line roles the P&L breaks Employee Cost down by, matched against each employee's
// Master Salary "dept" field. A role with no employees this month just shows ₹0 — real absence,
// not a placeholder.
const PL_ROLE_MAP=[
  {dept:'Hairdresser',salaryLabel:'Hairdresser Salary',incLabel:'Hairdresser Monthly Incentive',biz:'salon'},
  {dept:'Beautician',salaryLabel:'Beautician Salary',incLabel:'Beautician Monthly Incentive',biz:'salon'},
  {dept:'Pedicurist',salaryLabel:'Pedicurist Salary',incLabel:'Pedicurist Monthly Incentive',biz:'salon'},
  {dept:'Manager',salaryLabel:'Manager Salary',incLabel:'Manager Monthly Incentive'},
  {dept:'Helper',salaryLabel:'Helper Salary',incLabel:null},
  {dept:'Housekeeper',salaryLabel:'Housekeeper Salary',incLabel:null},
  {dept:'Kitchen',salaryLabel:'Kitchen Staff Salary',incLabel:null,biz:'restaurant'},
  {dept:'Service',salaryLabel:'Service Staff Salary',incLabel:null,biz:'restaurant'},
  {dept:'Bar',salaryLabel:'Bar Staff Salary',incLabel:null,biz:'restaurant'},
  {dept:'Accounts / Admin',salaryLabel:'Accounts & Admin Salary',incLabel:null,biz:'restaurant'},
];
function employeeCostFor(salonId,year,month){
  const sw=swWorkingsFor(salonId,year,month);
  const inc=incWorkingsFor(salonId,year,month);
  const incByEmp={};inc.forEach(e=>{incByEmp[e.id]=e.totalInc;});
  // "Salary" here is Gross Salary + Tea, matching Salary Working's own "Gross Salary" and "Tea"
  // columns — not just the base gross-after-LOP figure.
  const roleMap=PL_ROLE_MAP.filter(r=>!r.biz||r.biz===bizKeyOf(salonId));
  const salaryLines=roleMap.map(r=>({name:r.salaryLabel,amt:sw.filter(e=>e.dept===r.dept).reduce((s,e)=>s+e.grossAfterLop+e.tea,0),group:'Employee Salary'}));
  const incentiveLines=roleMap.filter(r=>r.incLabel&&!isRestaurantOutlet(salonId)).map(r=>({name:r.incLabel,amt:sw.filter(e=>e.dept===r.dept).reduce((s,e)=>s+(incByEmp[e.id]||0),0),group:'Employee Monthly Incentive'}));
  const pfEr=sw.reduce((s,e)=>s+e.pfEr,0);
  const esicEr=sw.reduce((s,e)=>s+e.esicEr,0);
  // Employee Daily Incentive — real per-day commission entries from Daily Sales & Exp, paid out
  // to front-line staff, broken out by the same 4 rows Daily Sales & Exp itself tracks them under
  // (Membership/Product/Service/Target Commission), rather than one bundled figure. Its own
  // subgroup, separate from Employee Monthly Incentive (that's Salary Working's role-wise
  // incentive, a different figure entirely) — sits right after it and before PF/ESIC Employer
  // Contribution. Belongs under Employee Cost, not Operating Expenses, since it's a staff payout.
  const DAILY_INCENTIVE_ROWS=[
    {label:'Membership Commission/Incentives',row:'Membership Commission/Incentives'},
    {label:'Product Commission/Incentives',row:'Product Commission/Incentives'},
    {label:'Service Commission/Incentives',row:'Service Commission/Incentives'},
    {label:'Target Commission/Incentives',row:'Target Commission/Incentives'},
  ];
  const dailyIncentiveLines=DAILY_INCENTIVE_ROWS.map(r=>({name:r.label,amt:dailySalesRowSumFor(salonId,year,month,r.row),group:'Employee Daily Incentive'}));
  const lines=[
    ...salaryLines,
    ...incentiveLines,
    ...dailyIncentiveLines,
    ...(isRestaurantOutlet(salonId)&&outletSettings(salonId).serviceChargeApplicable&&typeof serviceChargeDistributedFor==='function'
      ?[{name:'Service Charge to Staff',amt:serviceChargeDistributedFor(salonId,year,month),group:'Employee Service Charge'}]:[]),
    {name:'PF Employer Contribution',amt:pfEr},
    {name:'ESIC Employer Contribution',amt:esicEr}
  ];
  const detail=sw.map(e=>({id:e.id,name:e.name,desig:e.desig,dept:e.dept,totalDays:e.totalDays,grossAfterLop:e.grossAfterLop,tea:e.tea,pfEr:e.pfEr,esicEr:e.esicEr,incentive:incByEmp[e.id]||0,total:e.grossAfterLop+e.tea+e.pfEr+e.esicEr+(incByEmp[e.id]||0)}));
  const tot=lines.reduce((s,l)=>s+l.amt,0);
  return{lines,tot,detail};
}
// (removed: unused legacy demo-data arrays — VENDORS, ATT_DATA, SALES_DATA, DUE_DATES,
// ADVANCES, PENALTIES, INCENTIVES, COLLECTION, plus the module-level EMPLOYEES/DAYS used
// only to build them. Every screen now reads real data from localStorage; these hardcoded
// arrays were confirmed unreferenced anywhere else in the file.)

// User accounts — real and persisted. Seeded once with the working demo credentials already
// documented and in use for logging into this app; unlike salons/employees/vendors, these are
// NOT cleared to empty, because clearing login credentials would lock everyone out with no way
// back in. Both the Login screen and User Management read/write this same list, so an account
// added or edited in User Management genuinely changes who can log in — before this fix, User
// Management showed a completely different, disconnected, unpersisted set of fake names that
// had nothing to do with the real accounts used to sign in.
const USER_ACCOUNTS_KEY='salonos_user_accounts';
function loadUserAccounts(){
  try{
    const raw=cachedLocalGet(USER_ACCOUNTS_KEY);
    if(raw!==null){const v=JSON.parse(raw);if(Array.isArray(v)&&v.length)return v;}
  }catch(e){}
  return[
    {id:1,name:'Rajesh Gupta',email:'admin@salonos.in',password:'Admin@2024',role:'Super Admin',access:'All Outlets',outletIds:[1,2,3,4],status:'Active'},
    {id:2,name:'Priya Sharma',email:'priya@salonos.in',password:'Priya@2024',role:'Salon Manager',access:'Assigned Outlet',outletIds:[1],status:'Active'},
    {id:3,name:'Rahul Mehta',email:'rahul@salonos.in',password:'Rahul@2024',role:'Data Entry User',access:'Assigned Outlet',outletIds:[2],status:'Active'},
    {id:4,name:'Amit Verma',email:'amit@salonos.in',password:'Amit@2024',role:'Reviewer',access:'All Outlets',outletIds:[1,2,3,4],status:'Active'},
  ];
}
function saveUserAccounts(list){safeLocalSet(USER_ACCOUNTS_KEY,JSON.stringify(list));}

// Password overrides — set via "Forgot password?" on the login screen. There's no email/backend
// in this environment, so recovery works locally: it looks the account up by email and lets the
// user set a new password right there, stored per-email and checked ahead of the account's
// original default on every login.
const PW_OVERRIDE_KEY='salonos_password_overrides';
function loadPasswordOverrides(){try{const v=JSON.parse(cachedLocalGet(PW_OVERRIDE_KEY));return v&&typeof v==='object'?v:{};}catch(e){return{};}}
function savePasswordOverride(email,password){
  try{
    const all=loadPasswordOverrides();
    all[email.toLowerCase()]=password;
    safeLocalSet(PW_OVERRIDE_KEY,JSON.stringify(all));
  }catch(e){}
}
// ── Cloud password-reset landing page — Supabase's "Send password recovery" email links back to
// this same site with a one-time recovery token in the URL. Without a screen that actually reads
// that token, the app has no way to know it should be asking for a new password at all — it would
// just show the ordinary login page, silently ignoring the whole reason the person is here. App()
// below detects the recovery link (isPasswordRecoveryLink()) and renders this instead of the
// normal login gate; supabase-js consumes the token from the URL automatically once its client is
// created, so submitting here just needs a plain auth.updateUser() call.
function isPasswordRecoveryLink(){
  return typeof window!=='undefined' && /type=recovery/.test(window.location.hash);
}
// ── Alerts centre (automation phase 2). The nightly server check (edge function "automation",
// settings in Master Settings → Automation) writes public.alerts; the 🔔 bell reads the open ones
// the signed-in person may see (database rule = same as the outlet's data). Between nightly runs
// an alert whose problem has already been fixed on this device is hidden straight away
// (alertFixedLocally) — the next run closes it for good. ──
const AUTOMATION_SETTINGS_KEY='salonos_secret_automation_settings';
const AUTOMATION_DEFAULTS={enabled:true,salesCheck:true,attendanceCheck:true,dueReminders:true,dueDaysAhead:3,
  recurringReminders:true,monthEndChecklist:true,autoLock:false,autoLockDay:10,digest:false,anomalyChecks:true,loginWatch:true,backupReminder:true,errorWatch:true};
async function loadOpenAlerts(){
  const supa=await getSupabaseClient();
  const{data,error}=await supa.from('alerts').select('id,akey,outlet_id,kind,severity,title,body,tab,due_date,auto,created_at')
    .is('resolved_at',null).order('created_at',{ascending:false}).limit(300);
  if(error)throw error;
  return data||[];
}
async function resolveAlert(id){
  const supa=await getSupabaseClient();
  const{error}=await supa.rpc('salonos_resolve_alert',{alert_id:id});
  if(error)throw error;
}
function alertFixedLocally(a){
  try{
    const p=String(a.akey||'').split(':');const sid=Number(p[1]);
    if(a.kind==='sales'){
      const rec=JSON.parse(cachedLocalGet(outletKey('salonos_daily_sales_collection_data',sid))||'{}')[p[2]];
      return !!rec&&Object.values(rec).some(v=>String(v==null?'':v)!=='');
    }
    if(a.kind==='attendance'){
      const [y,m,d]=p[2].split('-').map(Number);
      const dow=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(y,m-1,d).getDay()];
      const att=JSON.parse(cachedLocalGet(outletKey('salonos_attendance',sid))||'{}');
      const emps=JSON.parse(cachedLocalGet(outletKey('salonos_master_employees',sid))||'[]').filter(e=>e&&e.status==='Active'&&e.weeklyOff!==dow);
      return emps.length>0&&emps.every(e=>{const r=att[e.id+'_'+y+'_'+(m-1)];return !!(r&&r.days&&r.days[d-1]);});
    }
    if(a.kind==='due'){
      const inv=loadVendorInvoices(sid).find(x=>x.id===p[2]);
      if(!inv)return false;
      return Number(inv.amount)-(inv.payments||[]).reduce((s,x)=>s+(Number(x.paidAmount)||0),0)<=0.5;
    }
    if(a.kind==='backup'){
      const dl=JSON.parse(cachedLocalGet('salonos_secret_backup_downloaded')||'null');
      if(!dl||!dl.at)return false;
      const d=new Date(new Date(dl.at).getTime()+5.5*3600e3).toISOString().slice(0,10);
      return d>=p[1]; // downloaded on/after this week's Monday
    }
    if(a.kind==='approval'){
      const ids=String(p.slice(2).join(':')).split(',');
      const inv=loadVendorInvoices(sid);
      return !ids.some(id=>{const i=inv.find(x=>x.id===id);return i&&invoiceNeedsApproval(i,sid);});
    }
    if(a.kind==='recurring_bill'&&typeof variableRecurringMissingPeriod==='function'){
      const it=loadRecurringExpenses(sid).find(x=>x.id===p[2]);
      if(!it)return true;
      const miss=variableRecurringMissingPeriod(it,sid);
      if(!miss)return true;
      const code=Math.floor(miss.first/12)+'-'+String(miss.first%12+1).padStart(2,'0');
      return code!==p[3];
    }
  }catch(e){}
  return false;
}

// ── Evening Tally sync (automation phase 3). Runs in the app, on the computer that has the SalonOS
// Tally Connector (Tally Export → 🌙 Evening auto-sync; switched on per computer in the connector
// settings, localStorage sos_tally_connector: autoSync {outletId: {company, from}}, syncTime).
// Sends only vouchers dated on/after `from` (the day it was switched on, so nothing already
// imported by hand goes twice) that it hasn't sent before (kv salonos_tally_pushed_outlet_<id>,
// shared). First creates any ledger those vouchers need that Tally doesn't have, then sends each
// voucher on its own so Tally's answer can be recorded per voucher; a rejected one is retried next
// evening and listed with Tally's reason. An item edited after it was sent is NOT re-sent (that
// would duplicate it in Tally) — it's listed as "changed after sending" for a manual check. ──
function loadTallyPushed(salonId){try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_tally_pushed',salonId))||'null');if(v&&typeof v==='object')return{inv:v.inv||{},bank:v.bank||{}};}catch(e){}return{inv:{},bank:{}};}
function saveTallyPushed(salonId,v){safeLocalSet(outletKey('salonos_tally_pushed',salonId),JSON.stringify(v));}
function tallyItemSig(o){const s=JSON.stringify(o);let h=0;for(let i=0;i<s.length;i++){h=((h<<5)-h+s.charCodeAt(i))|0;}return String(h);}
function tallyInvSig(inv){return tallyItemSig([inv.vendorId,inv.invoiceNo,inv.invoiceDate,inv.bookingDate,inv.amount,inv.taxable,inv.igst,inv.cgst,inv.sgst,inv.roundOff,inv.category]);}
function tallyBankSig(r){return tallyItemSig([r.transactionDate,r.description,r.debit,r.credit,r.refNo]);}
function tallyIsoOf(d){const p=parseInvoiceDateFlexible(d);return p?p.y+'-'+String(p.m).padStart(2,'0')+'-'+String(p.d).padStart(2,'0'):'';}
// What would go in the next sync: {invs, rows, changed:[labels]}.
function tallyAutoSyncPending(salonId,from){
  const pushed=loadTallyPushed(salonId);
  const changed=[];
  const invs=loadVendorInvoices(salonId).filter(inv=>{
    if(inv.docNature==='Performa Invoice')return false;
    const iso=tallyIsoOf(inv.bookingDate||inv.invoiceDate);
    if(!iso||iso<from)return false;
    const p=pushed.inv[inv.id];
    if(p){if(p.sig!==tallyInvSig(inv))changed.push('Invoice '+(inv.invoiceNo||inv.id));return false;}
    return true;
  });
  const rows=loadBankStatementRows(salonId).filter(r=>{
    if(!(r.debit||r.credit))return false;
    const iso=tallyIsoOf(r.transactionDate);
    if(!iso||iso<from)return false;
    const p=pushed.bank[r.id];
    if(p){if(p.sig!==tallyBankSig(r))changed.push('Bank '+r.transactionDate+' '+String(r.description||'').slice(0,30));return false;}
    return true;
  });
  return{invs,rows,changed};
}
// Sends vouchers not sent before (kv salonos_tally_pushed_outlet_<id>): {from, to} ISO period (to optional),
// company, only {inv:Set, bank:Set} to send just those ids. First creates every ledger they need that
// Tally lacks, then sends each voucher on its own so Tally's answer is recorded per voucher.
async function tallySyncVouchers(salonId,cfg,opts){
  const o=opts||{};
  const salon=outletSettings(salonId);
  const map=loadTallyLedgerMap(salonId);
  if(!map.bankLedger)throw new Error('Enter the Bank ledger name on Tally Export first.');
  const c={...cfg,company:o.company||cfg.company||''};
  const vendors=loadVendors(salonId);
  const vName=id=>{const v=vendors.find(x=>x.id===id);return(map.vendors&&map.vendors[id])||(v?v.name:id);};
  const cName=cat=>(map.categories&&map.categories[cat])||cat;
  const gstBlocked=!gstInputAllowedAsOf(salon,localTodayIso());
  const pend=tallyAutoSyncPending(salonId,o.from||'0000');
  const inTo=d=>!o.to||tallyIsoOf(d)<=o.to;
  let invs=pend.invs.filter(i=>inTo(i.bookingDate||i.invoiceDate));
  let rows=pend.rows.filter(r=>inTo(r.transactionDate));
  if(o.only){invs=invs.filter(i=>o.only.inv&&o.only.inv.has(i.id));rows=rows.filter(r=>o.only.bank&&o.only.bank.has(r.id));}
  const out={sent:0,failed:[],ledgersCreated:0,changed:pend.changed,at:new Date().toISOString()};
  if(!invs.length&&!rows.length)return out;
  // 1 · Ledgers the vouchers need.
  const ledgers=parseTallyLedgersDetailed(await tallySend(c,buildTallyLedgerListRequestXml(c.company)));
  // Every Tally company has ledgers (Cash, Profit & Loss A/c) — none means no company is open.
  if(!ledgers.length)throw new Error(c.company?'Tally answered, but the company “'+c.company+'” is not open — open it in Tally.':'Tally answered, but no company is open — open your company in Tally.');
  const have=new Set(ledgers.map(l=>String(l.name).toLowerCase()));
  const cats=Array.from(new Set(invs.map(i=>i.category).filter(Boolean)));
  const gst={igst:invs.some(i=>Number(i.igst)>0),cgst:invs.some(i=>Number(i.cgst)>0),sgst:invs.some(i=>Number(i.sgst)>0)};
  const base=tallyMastersPreviewRows(vendors,cats,gst,map.bankLedger,vName,cName,gstBlocked);
  const extra=tallyExtraLedgers(invs,rows,vendors,vName,map,gstBlocked,base.map(r=>r.name));
  const miss=base.concat(extra).filter(r=>!have.has(String(r.name).toLowerCase()));
  if(miss.length){
    const names=new Set(miss.map(r=>r.name));
    const xml=buildTallyMastersXml(vendors.filter(v=>names.has(vName(v.id))),cats.filter(x=>names.has(cName(x))),
      {igst:names.has('IGST Input'),cgst:names.has('CGST Input'),sgst:names.has('SGST Input')},names.has(map.bankLedger)?map.bankLedger:'',vName,cName,gstBlocked,
      extra.filter(l=>names.has(l.name)));
    const r=parseTallyImportResult(await tallySend(c,xml));
    out.ledgersCreated=r.created||0;
  }
  // 2 · Vouchers, one at a time; each accepted one is recorded straight away (a stop half-way —
  // connector closed, page shut — must never lead to it being sent again as a duplicate).
  const pushed=loadTallyPushed(salonId);
  const ok=r=>!r.errors&&!r.exceptions&&(r.created||r.altered);
  for(const inv of invs){
    const r=parseTallyImportResult(await tallySend(c,buildTallyPurchaseVouchersXml([inv],vName,cName,gstBlocked)));
    if(ok(r)){pushed.inv[inv.id]={at:out.at,sig:tallyInvSig(inv)};out.sent++;saveTallyPushed(salonId,pushed);}
    else out.failed.push('Invoice '+(inv.invoiceNo||inv.id)+': '+(r.lineErrors[0]||tallyResultText(r)));
    if(o.onProgress)o.onProgress(out.sent+out.failed.length,invs.length+rows.length);
  }
  for(const row of rows){
    const r=parseTallyImportResult(await tallySend(c,buildTallyBankVouchersXml([row],map.bankLedger,vendors,{vendorLedgerNameFor:vName,map})));
    if(ok(r)){pushed.bank[row.id]={at:out.at,sig:tallyBankSig(row)};out.sent++;saveTallyPushed(salonId,pushed);}
    else out.failed.push('Bank '+row.transactionDate+' '+String(row.description||'').slice(0,30)+': '+(r.lineErrors[0]||tallyResultText(r)));
    if(o.onProgress)o.onProgress(out.sent+out.failed.length,invs.length+rows.length);
  }
  saveTallyPushed(salonId,pushed);
  return out;
}
async function runTallyAutoSync(salonId,cfg,setting){
  const res=await tallySyncVouchers(salonId,cfg,{from:(setting&&setting.from)||'9999',company:setting&&setting.company});
  if(res.sent||res.failed.length||res.ledgersCreated)addTallyLog(salonId,{action:'Evening auto-sync',period:'from '+String((setting&&setting.from)||'').split('-').reverse().join('/'),sent:res.sent,created:res.ledgersCreated,errors:res.failed.length,detail:res.failed.slice(0,10)});
  return res;
}
// History of what was sent to Tally (Tally Export → History), newest first, 200 kept. Shared per outlet.
function loadTallyLog(salonId){try{const v=JSON.parse(cachedLocalGet(outletKey('salonos_tally_log',salonId))||'[]');return Array.isArray(v)?v:[];}catch(e){return[];}}
function addTallyLog(salonId,entry){
  const u=currentSessionUser();
  const list=[{id:'L'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),at:new Date().toISOString(),by:(u&&(u.name||u.email))||'',...entry},...loadTallyLog(salonId)].slice(0,200);
  safeLocalSet(outletKey('salonos_tally_log',salonId),JSON.stringify(list));
}

// ── Weekly backup file (automation phase 5) — a copy of a cloud backup on the Super Admin's own
// computer. Records the download (salonos_secret_backup_downloaded) so the weekly reminder in 🔔
// closes. The file can be uploaded back (salonos_import_backup) and restored like any backup. ──
async function downloadCloudBackupFile(backupId){
  const supa=await getSupabaseClient();
  let q=supa.from('kv_backups').select('id,taken_at,kind,rows_count,data');
  q=backupId?q.eq('id',backupId):q.neq('kind','archive').order('taken_at',{ascending:false}).limit(1);
  const{data,error}=await q;
  if(error)throw error;
  const b=data&&data[0];
  if(!b)throw new Error('No backup found yet — click "Back up now" first.');
  const file={salonos_backup:1,taken_at:b.taken_at,kind:b.kind,rows:b.data};
  downloadTextFile(JSON.stringify(file),'SalonOS-backup-'+String(b.taken_at).slice(0,10)+'.json','application/json');
  const u=currentSessionUser();
  safeLocalSet('salonos_secret_backup_downloaded',JSON.stringify({at:new Date().toISOString(),by:(u&&u.name)||'',backupId:b.id,takenAt:b.taken_at}));
  return b;
}
async function uploadCloudBackupFile(file){
  let parsed;
  try{parsed=JSON.parse(await file.text());}catch(e){throw new Error('This isn’t a SalonOS backup file.');}
  const rows=parsed&&parsed.salonos_backup===1&&Array.isArray(parsed.rows)?parsed.rows:null;
  if(!rows)throw new Error('This isn’t a SalonOS backup file.');
  const supa=await getSupabaseClient();
  const{data,error}=await supa.rpc('salonos_import_backup',{p_data:rows});
  if(error)throw error;
  return data;
}
