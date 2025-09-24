/* =========================================================
 * MicroCoaster - Modules UI (multi-cartes, animations OK)
 * Adapted for Socket.io instead of native WebSocket
 * =======================================================*/

/* =============== Utils spécifiques aux modules =============== */
// Envoi Socket.io (défini après init), mais on expose une no-op au cas où
window.ws_sendCommand = window.ws_sendCommand || function(){};

/* =============== Map des contrôleurs par module =============== */
const controllersByMid = new Map();

/* =========================================================
 * CONTROLLERS PAR TYPE (une instance par .panel[data-mid])
 * =======================================================*/

/* --------------------- Station --------------------- */
function makeStationController(panel){
  const IMG = {
    ON:  urlImg('button_green_on.png'),
    OFF: urlImg('button_green_off.png'),
    SW_A:urlImg('switch_0.png'),
    SW_B:urlImg('switch_1.png'),
    LED_ON: urlImg('led_on.png'),
    LED_OFF:urlImg('led_off.png'),
    ESTOP: urlImg('emergency_button.png'),
    RESET: urlImg('reset_button.png'),
  };
  preload(Object.values(IMG));

  // Elements (par data-role)
  const estopImg    = panel.querySelector('[data-role="st_estop"]');
  const nsfImg      = panel.querySelector('[data-role="st_nsf"]');
  const dispatchImg = panel.querySelector('[data-role="st_dispatch"]');
  const gatesImg    = panel.querySelector('[data-role="st_gates"]');
  const harnessImg  = panel.querySelector('[data-role="st_harness"]');

  // State
  let gatesClosed=false, harnessLocked=false, nextSectionFree=true;
  let inDispatch=false, dispatchTmr=null;
  let blinkTmr=null, blinkOn=false;
  let gatesCooldown=false, harnessCooldown=false;
  let estop=false;

  const setSwitch = (img,isB)=>{ if(img) img.src = isB ? IMG.SW_B : IMG.SW_A; };
  const setNSF    = (on)=>{ if(nsfImg) nsfImg.src = on ? IMG.LED_ON : IMG.LED_OFF; };

  function updateDisabled(){
    const lock = estop || inDispatch;
    panel.classList.toggle('locked', lock);
    const isOffline = panel.classList.contains('offline');
    if (estopImg) estopImg.style.pointerEvents = isOffline ? 'none' : 'auto';
  }

  function applyDispatchLamp(){ if (dispatchImg) dispatchImg.src = blinkOn ? IMG.ON : IMG.OFF; }
  function startBlink(){
    if (blinkTmr || inDispatch || estop) return;
    blinkOn=false; applyDispatchLamp();
    blinkTmr = setInterval(()=>{ blinkOn=!blinkOn; applyDispatchLamp(); }, 800);
  }
  function stopBlink(forceOff=true){
    if (blinkTmr){ clearInterval(blinkTmr); blinkTmr=null; }
    blinkOn = !forceOff; applyDispatchLamp();
  }

  const canDispatch = () =>
    !estop && nextSectionFree && gatesClosed && harnessLocked && !inDispatch;

  function reevaluate(){
    setNSF(nextSectionFree && !estop);
    setSwitch(gatesImg,   gatesClosed);
    setSwitch(harnessImg, harnessLocked);
    if (canDispatch()) startBlink(); else stopBlink(true);
  }

  // Events
  estopImg?.addEventListener('click', ()=>{
    estop = !estop;
    estopImg.src = estop ? IMG.RESET : IMG.ESTOP;
    if (estop) stopBlink(true);
    updateDisabled();
    reevaluate();
  });

  gatesImg?.addEventListener('click', ()=>{
    if (estop || inDispatch || gatesCooldown) return;
    gatesClosed = !gatesClosed;
    gatesCooldown = true; setTimeout(()=>gatesCooldown=false, 3000);
    reevaluate();
    window.ws_sendCommand(panel, gatesClosed ? 'gates_close' : 'gates_open', {}, gatesImg);
  });

  harnessImg?.addEventListener('click', ()=>{
    if (estop || inDispatch || harnessCooldown) return;
    harnessLocked = !harnessLocked;
    harnessCooldown = true; setTimeout(()=>harnessCooldown=false, 3000);
    reevaluate();
  });

  dispatchImg?.addEventListener('click', ()=>{
    if (!canDispatch()) return;
    inDispatch = true;
    updateDisabled();
    stopBlink(false);
    nextSectionFree = false;
    reevaluate();
    window.ws_sendCommand(panel, 'start', {}, dispatchImg);

    clearTimeout(dispatchTmr);
    dispatchTmr = setTimeout(()=>{
      inDispatch = false;
      nextSectionFree = true;
      updateDisabled();
      reevaluate();
    }, 10000);
  });

  function onPresenceOnline(){ updateDisabled(); reevaluate(); }
  function onPresenceOffline(){
    stopBlink(true);
    setNSF(false);
    updateDisabled();
  }

  function updateTelemetry(t={}){
    if ('gates'   in t) gatesClosed      = !!t.gates;
    if ('harness' in t) harnessLocked    = !!t.harness;
    if ('nsf'     in t) nextSectionFree  = !!t.nsf;
    if ('estop'   in t) estop            = !!t.estop;
    updateDisabled();
    reevaluate();
  }

  // Init
  updateDisabled(); reevaluate();

  return { onPresenceOnline, onPresenceOffline, updateTelemetry, destroy(){
    clearInterval(blinkTmr); blinkTmr=null; clearTimeout(dispatchTmr);
  }};
}

/* --------------------- Switch Track --------------------- */
function makeSwitchController(root){
  const transfer = root.querySelector('[data-role="swt_transfer"]');
  const ledL     = root.querySelector('[data-role="swt_left"]');
  const ledR     = root.querySelector('[data-role="swt_right"]');
  let left=true, lock=false;

  const setLED=(img,on)=>{ if(img) img.src = on? urlImg('led_on.png') : urlImg('led_off.png'); };
  const setSW = (isB)=>{ if(transfer) transfer.src = isB ? urlImg('switch_1.png') : urlImg('switch_0.png'); };
  const update=()=>{ setLED(ledL,left); setLED(ledR,!left); setSW(!left); };

  transfer?.addEventListener('click', ()=>{
    if(lock) return;
    left=!left; update();
    window.ws_sendCommand(root, left ? 'left' : 'right', {}, transfer);
    lock=true; setTimeout(()=>lock=false,3000);
  });

  function onPresenceOnline(){ update(); }
  function onPresenceOffline(){ setLED(ledL,false); setLED(ledR,false); }
  function updateTelemetry(payload){
    if (payload.position){
      left = (String(payload.position).toLowerCase()==='left');
      update();
    }
  }

  update();
  return { onPresenceOnline, onPresenceOffline, updateTelemetry, destroy(){} };
}

/* --------------------- Light FX --------------------- */
function makeLightController(panel){
  const IMG = { A:urlImg('switch_0.png'), B:urlImg('switch_1.png'), LED_ON:urlImg('led_on.png'), LED_OFF:urlImg('led_off.png') };
  preload(Object.values(IMG));
  let lightOn=false, cooldown=false;
  const sw  = panel.querySelector('[data-role="light_sw"]');
  const led = panel.querySelector('[data-role="light_led"]');

  const setLED=on=> { if(led) led.src = on ? IMG.LED_ON : IMG.LED_OFF; };
  const setSW =on=> { if(sw)  sw.src  = on ? IMG.B : IMG.A; };
  const apply=()=>{ setSW(lightOn); setLED(lightOn); };

  sw?.addEventListener('click', ()=>{
    if (cooldown) return;
    lightOn=!lightOn; apply();
    window.ws_sendCommand(panel, 'led', { pin: 23, value: lightOn }, sw);
    cooldown=true; setTimeout(()=>cooldown=false, 3000);
  });

  function onPresenceOnline(){ apply(); }
  function onPresenceOffline(){ lightOn=false; apply(); }
  function updateTelemetry(payload){
    const on = (payload.led ?? payload.light ?? payload.on);
    if (on !== undefined){ lightOn = !!on; apply(); }
  }

  apply();
  return { onPresenceOnline, onPresenceOffline, updateTelemetry, destroy(){} };
}

/* --------------------- Launch Track --------------------- */
function makeLaunchController(panel){
  const IMG = {
    BTN_ON:urlImg('button_green_on.png'), BTN_OFF:urlImg('button_green_off.png'),
    LED_ON:urlImg('led_on.png'), LED_OFF:urlImg('led_off.png'),
    SW_A:urlImg('switch_0.png'), SW_B:urlImg('switch_1.png'),
  };
  preload(Object.values(IMG));

  let direction='forward', speed=60;
  let inLaunch=false, blinkOn=false, blinkTmr=null, dirCooldown=false;

  const MIN_LDUR=2, MAX_LDUR=10;
  let lDuration=5;
  let LN_STEP=36, LN_BASE=0;

  const ledImg  = panel.querySelector('[data-role="ln_ready"]');
  const btnImg  = panel.querySelector('[data-role="ln_btn"]');
  const dirImg  = panel.querySelector('[data-role="ln_dir"]');
  const dirLbl  = panel.querySelector('[data-role="ln_dir_lbl"]');
  const gauge   = panel.querySelector('[data-role="ln_gauge"]');
  const spVal   = panel.querySelector('[data-role="ln_speed_val"]');
  const plusBtn = panel.querySelector('[data-role="ln_plus"]');
  const minusBtn= panel.querySelector('[data-role="ln_minus"]');

  const lnRoll  = panel.querySelector('[data-role="ln_roll"]');
  const lnTrack = panel.querySelector('[data-role="ln_track"]');
  const lnPlus  = panel.querySelector('[data-role="ln_dur_plus"]');
  const lnMinus = panel.querySelector('[data-role="ln_dur_minus"]');

  const setLocked = on => panel.classList.toggle('locked', on);
  const setLED=on=> { if(ledImg) ledImg.src = on ? IMG.LED_ON : IMG.LED_OFF; };

  function setDirUI(){
    if (!dirImg || !dirLbl) return;
    dirImg.src = (direction==='forward')? IMG.SW_A : IMG.SW_B;
    dirLbl.textContent = (direction==='forward')? 'Forward' : 'Backward';
  }
  function setSpeedUI(){
    if (spVal) spVal.textContent = speed;
    if (gauge) gauge.style.setProperty('--p', speed);
  }

  function applyLamp(){ if (btnImg) btnImg.src = blinkOn ? IMG.BTN_ON : IMG.BTN_OFF; }
  function startBlink(){ if(blinkTmr || inLaunch) return; blinkOn=false; applyLamp(); blinkTmr=setInterval(()=>{blinkOn=!blinkOn; applyLamp();},800); }
  function stopBlink(forceOff=true){ if(blinkTmr){clearInterval(blinkTmr);blinkTmr=null;} blinkOn=!forceOff; applyLamp(); }

  const computeReady=()=> speed>0 && !inLaunch;
  function reevaluate(){ const ok=computeReady(); setLED(ok); ok?startBlink():stopBlink(true); }

  dirImg?.addEventListener('click', ()=>{
    if (inLaunch || dirCooldown) return;
    direction = (direction==='forward')?'backward':'forward';
    setDirUI();
    window.ws_sendCommand(panel, direction, { speed }, dirImg);
    dirCooldown=true; setTimeout(()=>dirCooldown=false, 3000);
  });

  function stepSpeed(d){
    speed=Math.max(0,Math.min(100,speed+d)); setSpeedUI(); reevaluate();
    window.ws_sendCommand(panel, 'speed', { value: speed });
  }

  function pressControl(el,onTap,onHoldStep){
    if(!el) return;
    let pressed=false, holdT=null, repT=null, holding=false;
    const start=(e)=>{ if(e.pointerType && e.pointerType!=='mouse') e.preventDefault();
      if(pressed) return; pressed=true; holding=false;
      holdT=setTimeout(()=>{ if(!pressed) return; holding=true; repT=setInterval(onHoldStep,90); },300);
    };
    const end=()=>{ if(!pressed) return; clearTimeout(holdT); clearInterval(repT); if(!holding) onTap(); pressed=false; holding=false; holdT=repT=null; };
    el.addEventListener('pointerdown', start);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }
  pressControl(plusBtn,  ()=>stepSpeed(+10), ()=>stepSpeed(+1));
  pressControl(minusBtn, ()=>stepSpeed(-10), ()=>stepSpeed(-1));
  gauge?.addEventListener('click', ()=>stepSpeed(+10));

  const lnClamp=v=>Math.max(MIN_LDUR,Math.min(MAX_LDUR,v));

  function ensureNumbers(){
    if(!lnTrack || lnTrack.children.length) return;
    const frag=document.createDocumentFragment();
    for(let i=MIN_LDUR;i<=MAX_LDUR;i++){
      const d=document.createElement('div');
      d.className='num';
      d.style.cssText='height:36px;line-height:36px;font-weight:900;font-size:26px;';
      d.textContent=i;
      frag.appendChild(d);
    }
    lnTrack.appendChild(frag);
  }

  function lnCalibrate(){
    if(!lnRoll || !lnTrack || !lnTrack.firstElementChild) return;
    lnTrack.style.transform='translateY(0px)';
    LN_STEP = lnTrack.firstElementChild.offsetHeight || 36;
    const center = lnRoll.clientHeight/2;
    const rFirst = lnTrack.firstElementChild.getBoundingClientRect();
    const rTrack = lnTrack.getBoundingClientRect();
    const firstCenter = (rFirst.top - rTrack.top) + LN_STEP/2;
    LN_BASE = Math.round(center - firstCenter);
  }

  function lnSetUI(){
    if(!lnRoll || !lnTrack) return;
    lDuration = lnClamp(lDuration);
    const idx = lDuration - MIN_LDUR;
    const offset = Math.round(LN_BASE - idx*LN_STEP);
    lnTrack.style.transform=`translateY(${offset}px)`;
    [...lnTrack.children].forEach((el,i)=>el.classList.toggle('active', i===idx));
    lnRoll.setAttribute('aria-label', `${lDuration} seconds`);
    if (lnPlus)  lnPlus.disabled  = lDuration>=MAX_LDUR;
    if (lnMinus) lnMinus.disabled = lDuration<=MIN_LDUR;
  }

  function lnNudge(d){
    const next=lnClamp(lDuration+d);
    if(next===lDuration) return false;
    lDuration=next; lnSetUI(); reevaluate();
  }

  pressControl(lnPlus,  ()=>{ lnNudge(+1); }, ()=>{ lnNudge(+1); });
  pressControl(lnMinus, ()=>{ lnNudge(-1); }, ()=>{ lnNudge(-1); });
  if (lnRoll){
    lnRoll.addEventListener('wheel', e=>{ if(inLaunch) return; e.preventDefault(); lnNudge(e.deltaY>0?-1:+1); }, {passive:false});
    lnRoll.addEventListener('click', e=>{ if(inLaunch) return; const r=lnRoll.getBoundingClientRect(); const mid=r.top+r.height/2; lnNudge(e.clientY<mid?-1:+1); });
  }

  btnImg?.addEventListener('click', ()=>{
    if (!computeReady()) return;
    inLaunch=true; setLocked(true); setLED(false); stopBlink(true);
    window.ws_sendCommand(panel, direction, { speed, duration: lnClamp(lDuration) }, btnImg);
    const runSec = (lnRoll && lnTrack) ? lnClamp(lDuration) : 10;
    setTimeout(()=>{ inLaunch=false; setLocked(false); reevaluate(); }, runSec*1000);
  });

  function onPresenceOnline(){ setLocked(false); reevaluate(); }
  function onPresenceOffline(){ stopBlink(true); setLED(false); setLocked(true); }
  function updateTelemetry(payload){
    if ('speed'     in payload){ const val = Math.max(0,Math.min(100, Number(payload.speed)||0)); speed = val; setSpeedUI(); }
    if ('direction' in payload){ const d = String(payload.direction).toLowerCase(); direction = (d==='backward')?'backward':'forward'; setDirUI(); }
    if ('ready'     in payload){ setLED(!!payload.ready); }
    reevaluate();
  }

  // Init
  setDirUI(); setSpeedUI();
  if (lnRoll && lnTrack) {
    ensureNumbers();
    const refreshRoller = () => { lnCalibrate(); lnSetUI(); };
    // calibrage quand visible
    const tryWhenVisible = () => {
      const vis = (lnRoll.offsetParent !== null) && (lnRoll.getBoundingClientRect().height > 0);
      if (vis) refreshRoller(); else requestAnimationFrame(tryWhenVisible);
    };
    tryWhenVisible();

    // recalibre sur resize/visible/online
    window.addEventListener('resize', refreshRoller);
    panel.addEventListener('mc:visible', refreshRoller);
    panel.addEventListener('mc:online',  refreshRoller);

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(refreshRoller);
      ro.observe(lnRoll);
    }
  }
  reevaluate();

  return { onPresenceOnline, onPresenceOffline, updateTelemetry, destroy(){
    clearInterval(blinkTmr);
  }};
}

/* --------------------- Smoke Machine --------------------- */
function makeSmokeController(panel){
  const IMG={ BTN_ON:urlImg('button_green_on.png'), BTN_OFF:urlImg('button_green_off.png'), LED_ON:urlImg('led_on.png'), LED_OFF:urlImg('led_off.png') };
  preload(Object.values(IMG));

  const MIN=5, MAX=20;
  let duration=8, inRun=false, ready=true, blinkOn=false, blinkTmr=null;
  let STEP=36, BASE=0;

  const led   = panel.querySelector('[data-role="sm_ready"]');
  const btn   = panel.querySelector('[data-role="sm_btn"]');
  const roll  = panel.querySelector('[data-role="sm_roll"]');
  const track = panel.querySelector('[data-role="sm_track"]');
  const plus  = panel.querySelector('[data-role="sm_plus"]');
  const minus = panel.querySelector('[data-role="sm_minus"]');

  const clamp=v=>Math.max(MIN,Math.min(MAX,v));
  const setLocked=on=>panel.classList.toggle('locked', on);
  const setLED=on=> { if(led) led.src = on ? IMG.LED_ON : IMG.LED_OFF; };

  function applyBtn(){ if(btn) btn.src = blinkOn ? IMG.BTN_ON : IMG.BTN_OFF; }
  function startBlink(){ if(blinkTmr || inRun) return; blinkOn=false; applyBtn(); blinkTmr=setInterval(()=>{blinkOn=!blinkOn; applyBtn();},800); }
  function stopBlink(forceOff=true){ if(blinkTmr){clearInterval(blinkTmr);blinkTmr=null;} blinkOn=!forceOff; applyBtn(); }
  const computeReady=()=> !inRun && ready && duration>0;
  function reevaluate(){ const ok=computeReady(); setLED(ok); ok?startBlink():stopBlink(true); }

  // build track
  if (track){
    for(let i=MIN;i<=MAX;i++){ const d=document.createElement('div'); d.className='num'; d.textContent=i; track.appendChild(d); }
  }

  function calibrate(){
    if (!roll || !track || !track.firstElementChild) return;
    track.style.transform='translateY(0px)';
    STEP = track.firstElementChild.offsetHeight || 36;
    const center = roll.clientHeight/2;
    const rFirst=track.firstElementChild.getBoundingClientRect();
    const rTrack=track.getBoundingClientRect();
    const firstCenter=(rFirst.top - rTrack.top) + STEP/2;
    BASE = Math.round(center - firstCenter);
  }
  function setRollUI(){
    if (!roll || !track) return;
    duration=clamp(duration);
    const idx=duration-MIN;
    const offset=Math.round(BASE - idx*STEP);
    track.style.transform=`translateY(${offset}px)`;
    [...track.children].forEach((el,i)=>el.classList.toggle('active', i===idx));
    roll.setAttribute('aria-label', `${duration} seconds`);
    if (plus)  plus.disabled = duration>=MAX;
    if (minus) minus.disabled= duration<=MIN;
  }
  function nudge(d){
    const next=clamp(duration+d);
    if(next===duration) return false;
    duration=next; setRollUI(); reevaluate(); return true;
  }

  function bindHold(el,delta){
    if(!el) return;
    let pressed=false, holdT=null, repT=null, holding=false;
    const tap=()=>{ nudge(delta); };
    const rep=()=>{ if(!nudge(delta)) clearInterval(repT); };
    const start=(e)=>{ if(e.pointerType && e.pointerType!=='mouse') e.preventDefault();
      if(pressed||inRun) return; pressed=true; holding=false;
      holdT=setTimeout(()=>{ if(!pressed) return; holding=true; repT=setInterval(rep,90); },300);
    };
    const end=()=>{ if(!pressed) return; clearTimeout(holdT); clearInterval(repT); if(!holding) tap(); pressed=false; holding=false; };
    el.addEventListener('pointerdown', start);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }
  bindHold(plus,+1); bindHold(minus,-1);

  roll?.addEventListener('wheel',e=>{ if(inRun) return; e.preventDefault(); nudge(e.deltaY>0?-1:+1); },{passive:false});
  roll?.addEventListener('click',e=>{ if(inRun) return; const r=roll.getBoundingClientRect(); const mid=r.top+r.height/2; nudge(e.clientY<mid?-1:+1); });

  btn?.addEventListener('click', ()=>{
    if(!computeReady()) return;
    inRun=true; setLocked(true); setLED(false); stopBlink(true);
    window.ws_sendCommand(panel, 'smoke_start', { duration }, btn);
    setTimeout(()=>{ inRun=false; setLocked(false); reevaluate(); }, duration*1000);
  });

  function onPresenceOnline(){ setLocked(false); reevaluate(); }
  function onPresenceOffline(){ stopBlink(true); setLED(false); setLocked(true); }
  function updateTelemetry(payload){
    if ('ready' in payload){ ready=!!payload.ready; reevaluate(); }
  }

  const refreshSmoke = () => { calibrate(); setRollUI(); };

  calibrate(); setRollUI(); reevaluate();
  window.addEventListener('resize', refreshSmoke);
  panel.addEventListener('mc:visible', refreshSmoke);
  panel.addEventListener('mc:online',  refreshSmoke);
  if (window.ResizeObserver && roll) {
    const ro = new ResizeObserver(refreshSmoke);
    ro.observe(roll);
  }

  return { onPresenceOnline, onPresenceOffline, updateTelemetry, destroy(){
    clearInterval(blinkTmr);
  }};
}

/* --------------------- Audio Player --------------------- */
function makeAudioController(panel){
  // Éléments liés par data-role
  const list = panel.querySelector('[data-role="au_list"]');
  const btn  = panel.querySelector('[data-role="au_play"]');

  // <audio> facultatif dans le DOM : on le crée si absent (hidden)
  let tag = panel.querySelector('[data-role="au_tag"]');
  if (!tag){
    tag = document.createElement('audio');
    tag.preload = 'metadata';
    tag.hidden = true;
    tag.dataset.role = 'au_tag';
    panel.appendChild(tag);
  }

  // Assets (chemins via urlImg/IMG_BASE)
  const IMG = { ON: urlImg('button_green_on.png'), OFF: urlImg('button_green_off.png') };
  preload(Object.values(IMG));

  // Playlist par défaut (peut être remplacée via télémétrie)
  let tracks = [
    { file:'001.mp3', title:'Taron'  },
    { file:'002.mp3', title:'Fenrir' },
    { file:'003.mp3', title:'Veloci' },
  ];

  let index = 0;
  let cooldown = false;
  let blinkTimer = null, lampOn = false;

  const setLamp = (on)=>{ if (btn) btn.src = on ? IMG.ON : IMG.OFF; };

  function startBlink(){
    if (blinkTimer || cooldown) return;
    lampOn = false; setLamp(false);
    blinkTimer = setInterval(()=>{ lampOn = !lampOn; setLamp(lampOn); }, 800);
  }
  function stopBlink(forceOff = true){
    if (blinkTimer){ clearInterval(blinkTimer); blinkTimer = null; }
    lampOn = !forceOff;
    setLamp(!forceOff);
  }

  function render(){
    if (!list) return;
    list.innerHTML = '';
    tracks.forEach((t,i)=>{
      const el = document.createElement('div');
      el.className = 'track clickable' + (i===index ? ' active' : '');
      el.innerHTML = `<span>${t.title || t.file}</span><small>${t.file}</small>`;
      el.addEventListener('click', ()=>{ if (cooldown) return; index = i; mark(); load(false); });
      list.appendChild(el);
    });
  }
  function mark(){ if (!list) return; [...list.children].forEach((el,i)=>el.classList.toggle('active', i===index)); }

  function load(autoplay){
    const t = tracks[index]; if (!t) return;
    tag.src = t.file;
    if (autoplay && !cooldown){
      const p = tag.play(); if (p && p.catch) p.catch(()=>{});
      stopBlink(false);
    } else {
      startBlink();
    }
  }

  function beginCooldown(){
    cooldown = true;
    panel.classList.add('locked');      // bloque .clickable
    stopBlink(true);                     // éteint la lampe pendant le cooldown
    setTimeout(()=>{
      cooldown = false;
      panel.classList.remove('locked');
      if (tag.paused) startBlink();
    }, 30000);
  }

  // Interactions
  btn?.addEventListener('click', ()=>{
    if (cooldown) return;
    beginCooldown();

    if (!tag.src) load(false);
    const t = tracks[index];
    if (t) window.ws_sendCommand(panel, 'play', { track: t.file }, btn);

    const p = tag.play(); if (p && p.catch) p.catch(()=>{});
  });

  // États audio -> lampe
  tag.addEventListener('play',  ()=>{ if(!cooldown) stopBlink(false); });
  tag.addEventListener('pause', ()=>{ if(!cooldown) startBlink();     });
  tag.addEventListener('ended', ()=>{ if(!cooldown) startBlink();     });

  // Présence
  function onPresenceOnline(){ panel.classList.remove('locked'); if(tag.paused) startBlink(); }
  function onPresenceOffline(){ panel.classList.add('locked'); stopBlink(true); }

  // Télémétrie (optionnelle) pour mettre à jour la playlist / sélection / état
  function updateTelemetry(payload = {}){
    if (payload.playlist){
      const arr = Array.isArray(payload.playlist) ? payload.playlist : [];
      if (arr.length){
        tracks = arr.map(x => {
          if (typeof x === 'string'){
            const [file, title] = x.split('|');
            return { file, title: title || (file.split('/').pop() || file) };
          }
          return {
            file:  x.file || '',
            title: x.title || (x.file ? x.file.split('/').pop() : '')
          };
        }).filter(t => t.file);
        index = Math.min(index, Math.max(0, tracks.length - 1));
        render(); mark();
      }
    }
    if ('current' in payload){
      const i = Number(payload.current);
      if (Number.isInteger(i) && tracks[i]){ index = i; mark(); }
    }
    if ('track' in payload){
      const f = String(payload.track);
      const i = tracks.findIndex(t => t.file === f);
      if (i >= 0){ index = i; mark(); }
    }
    if ('playing' in payload){
      const playing = !!payload.playing;
      if (playing) stopBlink(false); else startBlink();
    }
  }

  // Init
  render();
  load(false);
  startBlink();

  return {
    onPresenceOnline,
    onPresenceOffline,
    updateTelemetry,
    destroy(){ if (blinkTimer) clearInterval(blinkTimer); }
  };
}


/* =========================================================
 * BOOTSTRAP : instancie un contrôleur par .panel[data-mid]
 * =======================================================*/
(function bootstrapPanels(){
  const panels = document.querySelectorAll('.panel[data-mid]');
  panels.forEach(panel=>{
    const type = panel.dataset.type || 'Unknown';
    const mid  = (panel.dataset.mid || '').trim();
    if (!mid) return;

    let controller = null;
    switch(type){
      case 'Station':       controller = makeStationController(panel); break;
      case 'Switch Track':  controller = makeSwitchController(panel);  break;
      case 'Light FX':      controller = makeLightController(panel);   break;
      case 'Launch Track':  controller = makeLaunchController(panel);  break;
      case 'Smoke Machine': controller = makeSmokeController(panel);   break;
      case 'Audio Player':  controller = makeAudioController(panel);   break;
      default:
        // fallback: rien
        controller = {
          onPresenceOnline(){}, onPresenceOffline(){}, updateTelemetry(){}, destroy(){}
        };
    }
    controllersByMid.set(mid, controller);
  });
})();

/* =========================================================
 * Copy MID chip
 * =======================================================*/
document.querySelectorAll('.midchip[role="button"]').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    const id = chip.querySelector('.mid')?.textContent?.trim();
    if (!id || id === '—') return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(id).then(()=>{
        chip.classList.add('copied');
        setTimeout(()=>chip.classList.remove('copied'), 900);
      });
    }
  });
});


/* =========================================================
 * Bouton "désactiver Online only" (si présent)
 * =======================================================*/
document.getElementById('disableOnlineFilter')?.addEventListener('click', () => {
  const cb = document.getElementById('filterOnlineOnly');
  if (cb) {
    cb.checked = false;
    localStorage.setItem('mc:onlineOnly', '0');
    window.applyOnlineFilter?.();
  }
});

/* =========================================================
 * FILTRES (online + recherche)
 * =======================================================*/
(function () {
  const KEY_ONLINE = 'mc:onlineOnly';
  const KEY_QUERY  = 'mc:moduleSearch';

  const cb      = document.getElementById('filterOnlineOnly');
  const qInp    = document.getElementById('moduleSearch');
  const empty   = document.getElementById('emptyState');
  const clrBtn  = document.querySelector('.searchbar .search-clear') || document.querySelector('.search-clear');

  function applyFilters() {
    const only       = !!cb?.checked;
    const q          = (qInp?.value || '').trim().toLowerCase();
    const serverDown = !!window.__serverDown;

    let visibleCount = 0;
    let totalModules = 0;

    document.querySelectorAll('.panel[data-mid], .mod[data-id]').forEach(panel => {
      totalModules++;
      let show = true;

      // Online only (strict)
      if (only) {
        show = serverDown ? false : panel.classList.contains('online');
      }

      // Recherche texte
      if (show && q) {
        const title = panel.querySelector('.h1')?.textContent || '';
        const alias = panel.querySelector('.alias--type')?.textContent || '';
        const type  = panel.dataset.type || '';
        const mid   = panel.dataset.mid || '';
        const hay   = (title + ' ' + alias + ' ' + type + ' ' + mid).toLowerCase();
        show = hay.includes(q);
      }

      // Trouver le conteneur Bootstrap Grid parent (.col-12.col-lg-6)
      const gridContainer = panel.closest('.col-12, .col-lg-6') || panel;
      
      const wasHidden = (gridContainer.style.display === 'none');
      gridContainer.style.display = show ? '' : 'none';
      
      if (show) {
        visibleCount++;
        if (wasHidden) {
          panel.dispatchEvent(new CustomEvent('mc:visible'));
        }
      }
    });

    // Empty-state: visible seulement si Online only + 0 carte + serveur UP ET il y a des modules en base
    if (empty) {
      // Si pas de modules du tout, on cache l'empty state (le message "No modules yet" sera géré par le serveur)
      if (totalModules === 0) {
        empty.hidden = true;
      } else {
        // Sinon, on affiche l'empty state seulement si Online only + 0 visible + serveur UP
        empty.hidden = serverDown || !(only && visibleCount === 0);
      }
    }

    if (qInp) localStorage.setItem(KEY_QUERY, q);
  }

  // Expose pour WS/bannière
  window.applyOnlineFilter = applyFilters;

  // État mémorisé du toggle
  if (cb) {
    const savedOnline = localStorage.getItem(KEY_ONLINE);
    cb.checked = (savedOnline !== null) ? (savedOnline === '1') : true;
    cb.addEventListener('change', () => {
      localStorage.setItem(KEY_ONLINE, cb.checked ? '1' : '0');
      applyFilters();
    });
  }

  // Recherche + ESC + bouton clear
  if (qInp) {
    const savedQ = localStorage.getItem(KEY_QUERY) || '';
    if (savedQ) qInp.value = savedQ;
    
    // Fonction pour afficher/masquer le bouton clear
    function updateClearButton() {
      if (clrBtn) {
        clrBtn.classList.toggle('show', qInp.value.length > 0);
      }
    }
    
    // Mettre à jour le bouton au chargement
    updateClearButton();

    qInp.addEventListener('input', () => {
      updateClearButton();
      applyFilters();
    });
    qInp.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && qInp.value) {
        qInp.value = '';
        updateClearButton();
        applyFilters();
      }
    });
  }
  if (clrBtn && qInp) {
    clrBtn.addEventListener('click', () => {
      qInp.value = '';
      qInp.focus();
      if (clrBtn) clrBtn.classList.remove('show');
      applyFilters();
    });
  }

  requestAnimationFrame(applyFilters);
})();

/* =========================================================
 * Socket.io : présence + télémétrie + commandes  
 * Adapted from WebSocket to Socket.io
 * =======================================================*/
(() => {
  let socket;

  // banner helpers
  function setServerBanner(show){
    const el = document.getElementById('serverState');
    if (el) el.hidden = !show;
    window.__serverDown = !!show;
    window.applyOnlineFilter?.();
  }
  let showDownTimer = null;
  function scheduleDownBanner(){ if (showDownTimer) return; showDownTimer = setTimeout(()=>{ showDownTimer=null; setServerBanner(true); }, 8000); }
  function hideDownBanner(){ if (showDownTimer){ clearTimeout(showDownTimer); showDownTimer=null; } setServerBanner(false); }

  function markAllOffline(){
    document.querySelectorAll('.panel[data-mid]').forEach(p=>{
      p.classList.remove('online');
      p.classList.add('offline','disabled');
      const badge = p.querySelector('.state');
      if (badge){
        badge.textContent = 'offline';
        badge.classList.remove('online');
        badge.classList.add('offline');
      }
      p.dispatchEvent(new CustomEvent('mc:offline'));
      // notifie le controller
      const mid = (p.dataset.mid || '').trim();
      const ctl = controllersByMid.get(mid);
      ctl?.onPresenceOffline?.();
    });
    window.applyOnlineFilter?.();
  }

  // Par défaut, offline
  document.querySelectorAll('.panel[data-mid]').forEach(p => {
    p.classList.add('offline', 'disabled');
  });

  const panels = () => Array.from(document.querySelectorAll('.panel[data-mid]'))
                            .filter(p => (p.dataset.mid||'').trim() && (p.dataset.mid!=='—'));

  function setPresence(moduleId, online) {
    const panels = document.querySelectorAll(`.panel[data-mid="${moduleId}"]`);
    panels.forEach(p => {
      p.classList.toggle('online', online);
      p.classList.toggle('offline', !online);
      p.classList.toggle('disabled', !online);
      
      const badge = p.querySelector('.state');
      if (badge) {
        badge.textContent = online ? 'online' : 'offline';
        badge.classList.toggle('online', online);
        badge.classList.toggle('offline', !online);
      }
      
      p.dispatchEvent(new CustomEvent(online ? 'mc:online' : 'mc:offline'));
      
      // Notifier le contrôleur
      const ctl = controllersByMid.get(moduleId);
      if (online) {
        ctl?.onPresenceOnline?.();
      } else {
        ctl?.onPresenceOffline?.();
      }
    });
    window.applyOnlineFilter?.();
  }

  function updateTelemetry(moduleId, payload) {
    const panels = document.querySelectorAll(`.panel[data-mid="${moduleId}"]`);
    panels.forEach(p => {
      const ctl = controllersByMid.get(moduleId);
      ctl?.updateTelemetry?.(payload);
    });
  }

  function connectSocket(){
    try{
      // Socket.io se connecte automatiquement avec les sessions
      socket = io();

      socket.on('connect', () => {
        setServerBanner(false);
        // Plus besoin d'authentification, les sessions sont partagées !
        window.applyOnlineFilter?.();
      });

      socket.on('disconnect', () => {
        markAllOffline();
        setServerBanner(true);
      });

      // Réception des états de modules
      socket.on('modules_state', (states) => {
        states.forEach(state => {
          setPresence(state.moduleId, state.online);
        });
      });

      // Module en ligne
      socket.on('module_online', (data) => {
        setPresence(data.moduleId, true);
      });

      // Module hors ligne  
      socket.on('module_offline', (data) => {
        setPresence(data.moduleId, false);
      });

      // Télémétrie des modules
      socket.on('module_telemetry', (data) => {
        updateTelemetry(data.moduleId, data);
      });

      // Confirmation de commande
      socket.on('command_sent', (data) => {
        // Commande envoyée avec succès
      });

      // Erreur de commande
      socket.on('command_error', (error) => {
        console.error('❌ Command error:', error);
        window.showToast?.(error.message || 'Command failed', 'error', 3000);
      });

      socket.on('error', (error) => {
        console.error('🔌 Socket.io error:', error);
      });

    }catch(e){
      console.error('🔌 Socket.io connection failed:', e);
      scheduleDownBanner();
      setTimeout(connectSocket, 2000);
    }
  }

  // Fonction pour envoyer des commandes (remplace l'ancienne ws_sendCommand)
  window.ws_sendCommand = function(panel, command, params = {}, buttonElement = null) {
    if (!socket || !socket.connected) {
      console.warn('🔌 Socket.io not connected');
      window.showToast?.('Server not connected', 'error', 2000);
      return;
    }

    const moduleId = panel.dataset.mid;
    if (!moduleId) {
      console.error('❌ No module ID found');
      return;
    }


    
    // Effet visuel sur le bouton (cooldown)
    if (buttonElement) {
      buttonElement.style.opacity = '0.6';
      buttonElement.style.pointerEvents = 'none';
      setTimeout(() => {
        buttonElement.style.opacity = '';
        buttonElement.style.pointerEvents = '';
      }, 500);
    }

    // Envoi de la commande via Socket.io
    socket.emit('module_command', {
      moduleId,
      command,
      params
    });
  };

  // Connexion automatique
  connectSocket();

  // expose reconnect pour debug
  window.mc_socketReconnect = () => {
    hideDownBanner();
    if (socket) {
      socket.disconnect();
      socket.connect();
    } else {
      connectSocket();
    }
  };
})();

/* =========================================================
 * Modal Add module (open/close)
 * =======================================================*/
const modalAdd    = document.getElementById('modalAdd');
const openAddBtn  = document.getElementById('openModal');
const cancelAdd   = document.getElementById('btnCancelAdd');
const idField     = document.getElementById('f_mod_id');
const codeField   = document.getElementById('f_mod_code');

// Auto-formatage du Module ID (MC-XXXX-XXX)
if (idField) {
  idField.addEventListener('input', (e) => {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Ajouter MC- au début si pas présent
    if (!value.startsWith('MC')) {
      if (value.length > 0) {
        value = 'MC' + value;
      }
    }
    
    // Formater MC-XXXX-XXX
    let formatted = '';
    if (value.length > 0) {
      formatted = value.substring(0, 2); // MC
      if (value.length > 2) {
        formatted += '-' + value.substring(2, 6); // -XXXX
        if (value.length > 6) {
          formatted += '-' + value.substring(6, 9); // -XXX
        }
      }
    }
    
    e.target.value = formatted;
  });

  // Placer le curseur à la fin
  idField.addEventListener('focus', (e) => {
    setTimeout(() => {
      e.target.setSelectionRange(e.target.value.length, e.target.value.length);
    }, 0);
  });
}

// Auto-formatage du Module Code (XXXX-XXXX)
if (codeField) {
  codeField.addEventListener('input', (e) => {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Formater XXXX-XXXX
    let formatted = '';
    if (value.length > 0) {
      formatted = value.substring(0, 4); // XXXX
      if (value.length > 4) {
        formatted += '-' + value.substring(4, 8); // -XXXX
      }
    }
    
    e.target.value = formatted;
  });

  // Placer le curseur à la fin
  codeField.addEventListener('focus', (e) => {
    setTimeout(() => {
      e.target.setSelectionRange(e.target.value.length, e.target.value.length);
    }, 0);
  });
}

function openAddModal(){
  modalAdd?.classList.add('open');
  modalAdd?.setAttribute('aria-hidden','false');
  setTimeout(()=> idField?.focus(), 50);
}
function closeAddModal(){
  modalAdd?.classList.remove('open');
  modalAdd?.setAttribute('aria-hidden','true');
  const form = modalAdd?.querySelector('form');
  form && form.reset();
}

openAddBtn?.addEventListener('click', openAddModal);
cancelAdd?.addEventListener('click', closeAddModal);
modalAdd?.addEventListener('click', (e)=>{ if (e.target === modalAdd) closeAddModal(); });
window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeAddModal(); });

/* =========================================================
 * Modal Delete module (claim/unclaim system)
 * =======================================================*/
const modalDel  = document.getElementById('modalDelete');
const delText   = document.getElementById('dlgDelText');
const delForm   = document.getElementById('deleteForm');
const delModuleIdInp = document.getElementById('del_moduleId');

// Gestion du clic sur les boutons de suppression
document.addEventListener('click', (e) => {
  const kill = e.target.closest('.kill');
  if (!kill) return;
  const panel = kill.closest('.panel[data-mid]');
  if (!panel) return;

  const moduleId = panel.dataset.mid || '';
  const title = (panel.querySelector('.h1')?.childNodes?.[0]?.textContent || panel.dataset.name || '').trim() || 'this module';

  delText.textContent = `Delete "${title}" (${moduleId}) ? This action cannot be undone.`;
  delModuleIdInp.value = moduleId;

  modalDel?.classList.add('open');
  modalDel?.setAttribute('aria-hidden','false');
});

// Annulation de la suppression
document.getElementById('btnCancelDel')?.addEventListener('click', () => {
  modalDel?.classList.remove('open');
  modalDel?.setAttribute('aria-hidden','true');
});

// Fermeture par clic sur l'overlay
modalDel?.addEventListener('click', (e) => {
  if (e.target === modalDel) {
    modalDel?.classList.remove('open');
    modalDel?.setAttribute('aria-hidden','true');
  }
});

// Gestion de la soumission du formulaire de suppression
delForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const moduleId = delModuleIdInp.value;
  if (!moduleId) return;

  try {
    const response = await fetch(`/modules/delete/${moduleId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const result = await response.json();
    
    if (result.success) {
      // Fermer le modal
      modalDel?.classList.remove('open');
      modalDel?.setAttribute('aria-hidden','true');
      
      // Supprimer l'élément du DOM
      const panel = document.querySelector(`.panel[data-mid="${moduleId}"]`);
      const gridContainer = panel?.closest('.col-12, .col-lg-6');
      if (gridContainer) {
        gridContainer.remove();
      }
      
      // Nettoyer le contrôleur
      const controller = controllersByMid.get(moduleId);
      if (controller?.destroy) {
        controller.destroy();
      }
      controllersByMid.delete(moduleId);
      
      // Afficher un message de succès
      window.showToast?.('Module deleted successfully', 'success', 2200);
      
      // Rafraîchir les filtres
      window.applyOnlineFilter?.();
      
    } else {
      window.showToast?.(result.error || 'Failed to delete module', 'error', 3000);
    }
  } catch (error) {
    console.error('Delete error:', error);
    window.showToast?.('Network error', 'error', 3000);
  }
});

/* =========================================================
 * Toasts
 * =======================================================*/
(function(){
  function ensureWrap(){
    return document.getElementById('toasts') || (()=>{
      const d=document.createElement('div');
      d.id='toasts'; d.className='toasts';
      document.body.appendChild(d);
      return d;
    })();
  }
  
  function getToastIcon(type) {
    switch(type) {
      case 'success':
        return `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
        </svg>`;
      case 'error':
        return `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
        </svg>`;
      case 'info':
        return `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
        </svg>`;
      case 'warning':
        return `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>`;
      default:
        return `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
        </svg>`;
    }
  }
  
  window.showToast = function(message, type='success', duration=2400){
    const wrap = ensureWrap();
    const el = document.createElement('div');
    el.className = 'toast '+type;
    el.innerHTML = `
      ${getToastIcon(type)}
      <span class="toast-message">${message}</span>
      <button class="toast-close" aria-label="Close">
        <svg viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
      </button>
    `;
    wrap.appendChild(el);
    const close = ()=>{ el.classList.add('hide'); setTimeout(()=>el.remove(), 180); };
    el.querySelector('.toast-close').addEventListener('click', close);
    if (duration>0) setTimeout(close, duration);
  };
})();
