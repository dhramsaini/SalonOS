// ═════════════════════════════════════════════════════════════════════════════════════════════
// Final months can't change (Controls → Data entry → finalFreeze, on by default, outlet-wise).
// Once a month's Salary is approved/locked, its Incentive is approved/locked, its Daily Sales & Exp
// is marked Final, or its P&L is marked Final, nothing may change what those show:
//   1. Frozen results — the month's Salary Working, Incentive Working and P&L figures are saved at
//      the moment they become final (or the first time they're read after this release) and used
//      from then on, so a later change anywhere (Master Salary, incentive rules, a report import,
//      a recurring bill…) can't alter them. Unlocking / un-finalizing (Super Admin, with a reason)
//      drops the saved figures and they're worked out live again.
//   2. Blocked entries — billing, advances, posts into Daily Sales & Exp and salary changes dated in
//      a final month are refused for everyone, Super Admin included (unlock first).
// Store: salonos_final_snap_outlet_<id> = {'YYYY-MM':{sw:[rows],iw:[rows],pl:{…},at:{sw,iw,pl}}}.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const FF_MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
let FF_LIVE=0;
function ffOn(sid){return sid!=null&&typeof controlOn==='function'&&controlOn('finalFreeze',sid);}
function ffYm(y,m){return y+'-'+String(m+1).padStart(2,'0');}
function ffParts(v){const s=String(v||'');const x=s.match(/^(\d{4})-(\d{2})/);return x?{y:Number(x[1]),m:Number(x[2])-1}:null;}
// ── which parts of a month are final ──
function ffSalaryFinal(sid,y,m){const r=typeof monthLockRecordFor==='function'?monthLockRecordFor(sid,y,m):null;return !!(r&&r.locked);}
function ffIncFinal(sid,y,m){return typeof isIWEffectiveLockedFor==='function'&&isIWEffectiveLockedFor(sid,y,m);}
function ffDseFinal(sid,y,m){return typeof isManagerFinalMonth==='function'&&isManagerFinalMonth(sid,'dse',y,m);}
function ffPnlFinal(sid,y,m){try{const p=calToFYMI(y,m);return typeof isPnlFinal==='function'&&isPnlFinal(sid,p.fy,p.mi);}catch(e){return false;}}
function ffManualLock(sid,y,m){const r=typeof monthLockRecordFor==='function'?monthLockRecordFor(sid,y,m):null;return !!(r&&r.locked&&(r.source==='manual'||r.source==='pnl-final'));}
// letters: S salary approved/locked · M month locked by hand or by P&L Final · I incentive · D Daily Sales & Exp · P P&L
const FF_AREAS={billing:'MDP',advance:'SIDP',dsePost:'MDP',pay:'SIP'};
function ffWhy(sid,y,m,letters){
  const L=String(letters||'SIDP');const nm=FF_MON[m]+' '+y;
  if(L.includes('P')&&ffPnlFinal(sid,y,m))return'the P&L for '+nm+' is marked Final';
  if(L.includes('D')&&ffDseFinal(sid,y,m))return'Daily Sales & Exp for '+nm+' is marked Final';
  if(L.includes('S')&&ffSalaryFinal(sid,y,m))return'Salary for '+nm+' is approved and locked';
  if(L.includes('M')&&ffManualLock(sid,y,m))return nm+' is locked';
  if(L.includes('I')&&ffIncFinal(sid,y,m))return'Incentive for '+nm+' is approved and locked';
  return'';
}
// The message to show, or '' when allowed. dateOrYm: 'YYYY-MM-DD' or 'YYYY-MM'.
function ffBlock(sid,dateOrYm,area){
  if(!ffOn(sid))return'';const p=ffParts(dateOrYm);if(!p)return'';const why=ffWhy(sid,p.y,p.m,FF_AREAS[area]||'SIDP');if(!why)return'';
  if(typeof controlHit==='function')controlHit('finalFreeze',sid,'b');
  return'Not allowed — '+why+', so nothing that changes it can be entered or edited. To make a change, a Super Admin has to un-finalize / unlock '+FF_MON[p.m]+' first (with a reason).';
}

// ── frozen results ──
function ffKey(sid){return outletKey('salonos_final_snap',sid);}
const FF_CACHE={};
function ffAll(sid){const raw=cachedLocalGet(ffKey(sid))||'{}';const c=FF_CACHE[sid];if(c&&c.raw===raw)return c.v;let v={};try{v=JSON.parse(raw)||{};}catch(e){}FF_CACHE[sid]={raw,v};return v;}
function ffGet(sid,y,m,kind){const r=ffAll(sid)[ffYm(y,m)];return r&&r[kind]!=null?JSON.parse(JSON.stringify(r[kind])):null;}
function ffSet(sid,y,m,kind,val){const A=JSON.parse(JSON.stringify(ffAll(sid)));const k=ffYm(y,m);const r=A[k]=A[k]||{};r[kind]=val;r.at={...(r.at||{}),[kind]:new Date().toISOString()};safeLocalSet(ffKey(sid),JSON.stringify(A));}
function ffDrop(sid,y,m,kind){const A=JSON.parse(JSON.stringify(ffAll(sid)));const k=ffYm(y,m);if(!A[k]||A[k][kind]==null)return;delete A[k][kind];if(A[k].at)delete A[k].at[kind];if(!['sw','iw','pl'].some(x=>A[k][x]!=null))delete A[k];safeLocalSet(ffKey(sid),JSON.stringify(A));}
function ffLive(fn){FF_LIVE++;try{return fn();}finally{FF_LIVE--;}}
const FF_KIND={sw:ffSalaryFinal,iw:ffIncFinal,pl:ffPnlFinal};
// When it became final — the row approvals that go with a lock are written a moment after it, so
// the figures are saved only once the lock is a few seconds old.
const FF_SETTLE_MS=6000;
function ffFinalAt(kind,sid,y,m){try{
  if(kind==='sw'){const r=monthLockRecordFor(sid,y,m);return r&&r.at?Date.parse(r.at):0;}
  if(kind==='iw'){const a=monthLockRecordFor(sid,y,m),b=typeof iwAutoLockRecordFor==='function'?iwAutoLockRecordFor(sid,y,m):null;return Math.max(a&&a.locked&&a.at?Date.parse(a.at):0,b&&b.locked&&b.at?Date.parse(b.at):0);}
  const p=calToFYMI(y,m);const r=loadPnlFinal(sid)[p.fy+'|'+p.mi];return r&&r.at?Date.parse(r.at):0;}catch(e){return 0;}}
function ffSettled(kind,sid,y,m){const t=ffFinalAt(kind,sid,y,m);return !t||Date.now()-t>=FF_SETTLE_MS;}
function ffFrozen(kind,sid,y,m,live){
  if(FF_LIVE||!ffOn(sid)||!FF_KIND[kind](sid,y,m))return live();
  const s=ffGet(sid,y,m,kind);if(s!=null)return s;
  const v=ffLive(live);if(!ffSettled(kind,sid,y,m))return v;try{if(v!=null)ffSet(sid,y,m,kind,v);}catch(e){}return v;
}
function ffCaptureSoon(sid,y,m,kind){setTimeout(()=>{if(FF_KIND[kind](sid,y,m)&&!ffStatus(sid,y,m)[kind])ffCapture(sid,y,m,kind);},FF_SETTLE_MS+500);}
function ffCapture(sid,y,m,kind){if(!ffOn(sid))return;try{if(kind==='sw')ffSet(sid,y,m,'sw',ffLive(()=>_ffSW(sid,y,m)));else if(kind==='iw')ffSet(sid,y,m,'iw',ffLive(()=>_ffIW(sid,y,m)));else{const p=calToFYMI(y,m);ffSet(sid,y,m,'pl',ffLive(()=>_ffPL(sid,p.fy,p.mi)));}}catch(e){}}
// Has the month got saved figures? (shown on the Controls page / for checks)
function ffStatus(sid,y,m){const r=ffAll(sid)[ffYm(y,m)]||{};return{sw:!!r.sw,iw:!!r.iw,pl:!!r.pl,at:r.at||{}};}

const _ffSW=typeof swWorkingsFor==='function'?swWorkingsFor:null;
const _ffIW=typeof incWorkingsFor==='function'?incWorkingsFor:null;
const _ffPL=typeof plBuild==='function'?plBuild:null;
if(_ffSW)swWorkingsFor=function(sid,y,m){return ffFrozen('sw',sid,y,m,()=>_ffSW(sid,y,m));};
if(_ffIW)incWorkingsFor=function(sid,y,m){return ffFrozen('iw',sid,y,m,()=>_ffIW(sid,y,m));};
if(_ffPL)plBuild=function(sid,fy,mi){const c=typeof periodToCalendar==='function'?periodToCalendar({fy,mi}):null;if(!c)return _ffPL(sid,fy,mi);return ffFrozen('pl',sid,c.year,c.month,()=>_ffPL(sid,fy,mi));};

// Save the figures the moment a month becomes final; drop them when it is opened again.
if(typeof setMonthLockFor==='function'){const _o=setMonthLockFor;
  setMonthLockFor=function(sid,y,m,locked){const r=_o.apply(this,arguments);
    if(locked){ffCaptureSoon(sid,y,m,'sw');if(ffIncFinal(sid,y,m))ffCaptureSoon(sid,y,m,'iw');}
    else{ffDrop(sid,y,m,'sw');if(!ffIncFinal(sid,y,m))ffDrop(sid,y,m,'iw');}
    return r;};}
if(typeof setIWLockFor==='function'){const _o=setIWLockFor;
  setIWLockFor=function(sid,y,m,locked){const r=_o.apply(this,arguments);if(locked)ffCaptureSoon(sid,y,m,'iw');else if(!ffIncFinal(sid,y,m))ffDrop(sid,y,m,'iw');return r;};}
if(typeof setPnlFinal==='function'){const _o=setPnlFinal;
  setPnlFinal=function(sid,fy,mi,final){const r=_o.apply(this,arguments);const c=periodToCalendar({fy,mi});if(c){if(final)ffCaptureSoon(sid,c.year,c.month,'pl');else ffDrop(sid,c.year,c.month,'pl');}return r;};}

// ── Help & Guide topic ──
if(typeof HELP_TOPICS!=='undefined'&&Array.isArray(HELP_TOPICS)&&!HELP_TOPICS.some(t=>t.title==='Final months can’t change'))HELP_TOPICS.push({title:'Final months can’t change',body:[
  '<b>When a month is final</b>: its Salary is approved and locked, its Incentive is approved and locked, its Daily Sales & Exp is marked Final, or its P&L is marked Final.',
  '<b>Figures are frozen</b>: the month’s Salary Working, Incentive Working and P&L figures are saved a few seconds after it becomes final. A later change anywhere (Master Salary, incentive rules, a report import, a recurring bill) doesn’t alter them.',
  '<b>Entries are refused</b>: bills, advances, posts into Daily Sales & Exp and salary changes dated in a final month are refused for everyone, Super Admin included.',
  '<b>To correct a final month</b>: a Super Admin un-finalizes or unlocks it, with a reason that goes to the Audit Log. The saved figures are dropped and worked out again; finalize it again when done.',
  '<b>Switch</b>: Master Settings → 🎛 Controls → Data entry → Final months (all outlets or outlet-wise).'
]});
