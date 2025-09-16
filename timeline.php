<?php
session_start();
if (!isset($_SESSION['user_id'])) { header('Location: index.php'); exit; }
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MicroCoaster — Timeline</title>
<style>
  :root{
    --bg-900:#0f1115; --bg-800:#151821; --bg-700:#1b1f2a; --bg-650:#202534;
    --line:#2a3142; --text:#e5e7eb; --muted:#a1a6b3;
    --accent:#22c55e; --accent-2:#10b981; --danger:#ef4444; --warn:#f59e0b; --ok:#22c55e;
    --radius:14px; --shadow:0 10px 30px rgba(0,0,0,.25);
  }
  *{box-sizing:border-box} html,body{height:100%}
  body{
    margin:0; background:var(--bg-900); color:var(--text);
    font: 15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,"Noto Sans",Arial,sans-serif;
    -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
  }

  .app{display:grid; grid-template-columns:260px 1fr; min-height:100vh}
  .sidebar{
    background:linear-gradient(180deg, var(--bg-700), #171a23 65%);
    border-right:1px solid var(--line);
    display:flex; flex-direction:column; gap:16px; padding:16px;
  }
  .brand{display:flex; align-items:center; gap:12px; padding:4px 8px 12px}
  .brand .logo{width:28px;height:28px;border-radius:8px;background:#0b0d13;border:1px solid var(--line);display:grid;place-items:center}
  .brand .name{font-weight:700;letter-spacing:.2px}

  .nav{display:flex;flex-direction:column;gap:6px;margin-top:8px}
  .nav a{display:flex;align-items:center;gap:10px;padding:10px 12px;text-decoration:none;color:var(--text);border-radius:10px;border:1px solid transparent}
  .nav a:hover{background:rgba(255,255,255,.035);border-color:var(--line)}
  .nav a.active{background:rgba(34,197,94,.08);border-color:#2a3a2f}
  .nav svg{width:18px;height:18px;opacity:.9}
  .sidebar .spacer{flex:1}
  .me{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--line);border-radius:12px;background:#141825}
  .me .avatar{width:36px;height:36px;border-radius:50%;background:#0b0d13;border:1px solid var(--line)}
  .me .who{display:flex;flex-direction:column;line-height:1.2}
  .me .who .nick{font-weight:600}
  .me .who .status{font-size:12px;color:var(--muted)}

  .main{display:flex;flex-direction:column}
  .topbar{position:sticky;top:0;z-index:5;background:linear-gradient(180deg,#12161f,#10131b);
    border-bottom:1px solid var(--line);padding:10px 18px;display:flex;align-items:center;gap:14px;justify-content:space-between}
  .topbar .title{font-weight:700;letter-spacing:.2px}
  .topbar .actions{display:flex;align-items:center;gap:10px}
  .search{background:var(--bg-800);border:1px solid var(--line);color:var(--text);padding:10px 12px;border-radius:10px;min-width:240px;outline:none}
  .btn{background:var(--accent);color:#0a0f0d;border:0;padding:10px 14px;border-radius:10px;font-weight:700;cursor:pointer}
  .btn.ghost{background:transparent;color:var(--text);border:1px solid var(--line)}
  .btn.gray{background:#e7e7ea;color:#101112;border:1px solid #d7d7da}

  .content{padding:20px;display:grid;gap:16px}
  .grid{display:grid;gap:16px}
  .two-col{grid-template-columns:320px 1fr}
  .card{background:var(--bg-650);border:1px solid var(--line);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow)}
  .muted{color:var(--muted)}
  .list{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none}
  .pill{padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:#141825;display:flex;justify-content:space-between;align-items:center;gap:10px}
  .drag{cursor:grab}
  .badge{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);background:#121621}
  .badge.ok{border-color:rgba(34,197,94,.35);background:rgba(34,197,94,.08);color:#a7f3d0}

  /* === TIMELINE === */
  .tl-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
  .tl-toolbar input[type="number"], .tl-toolbar select{
    background:var(--bg-800);border:1px solid var(--line);color:var(--text);
    padding:8px 10px;border-radius:10px;outline:none;min-width:90px
  }
  .tl-wrap{
    background:#131722;border:1px solid var(--line);border-radius:12px;overflow:auto;position:relative;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.03);
  }
  .tl-canvas{position:relative; min-width:800px}
  .tl-ruler{
    position:sticky;top:0;z-index:2;height:28px;background:#111520;border-bottom:1px solid var(--line);
    display:flex;align-items:flex-end;font-size:12px;color:var(--muted)
  }
  .tl-ruler .tick{position:absolute;bottom:0;width:1px;background:#2a3142;height:10px}
  .tl-ruler .label{position:absolute;bottom:10px;transform:translateX(-50%);padding:0 4px}
  .tl-tracks{position:relative}
  .tl-lane{
    position:relative;height:60px;border-bottom:1px solid var(--line);
    background:
      repeating-linear-gradient(90deg, rgba(255,255,255,.03) 0 1px, transparent 1px 40px),
      linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.02));
  }
  .tl-lane:last-child{border-bottom:none}
  .tl-label{
    position:absolute;left:8px;top:6px;font-size:12px;color:var(--muted)
  }

  /* Event block */
  .tl-event{
    position:absolute;top:10px;height:40px;min-width:24px;
    background:rgba(34,197,94,.12);
    border:1px solid rgba(34,197,94,.45);
    color:#c7f9df;border-radius:8px;display:flex;align-items:center;gap:8px;padding:0 8px;cursor:grab;
    user-select:none;
  }
  .tl-event:focus{outline:2px solid rgba(34,197,94,.5)}
  .tl-event .label{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px}
  .tl-event .time{font-size:12px;color:#b7e9d0}
  .tl-event .handle{position:absolute;top:0;width:8px;height:100%;cursor:ew-resize;background:linear-gradient(180deg,rgba(255,255,255,.08),transparent)}
  .tl-event .handle.l{left:-1px;border-left:2px solid rgba(34,197,94,.45);border-top-left-radius:8px;border-bottom-left-radius:8px}
  .tl-event .handle.r{right:-1px;border-right:2px solid rgba(34,197,94,.45);border-top-right-radius:8px;border-bottom-right-radius:8px}

  .table{width:100%;border-collapse:separate;border-spacing:0 8px}
  .table th{font-size:12px;color:var(--muted);text-align:left;padding:0 10px}
  .table td{background:rgba(0,0,0,.15);border:1px solid var(--line);padding:10px}
  .table tr td:first-child{border-top-left-radius:10px;border-bottom-left-radius:10px}
  .table tr td:last-child{border-top-right-radius:10px;border-bottom-right-radius:10px}

  /* Mobile */
  @media (max-width:980px){
    .app{grid-template-columns:72px 1fr}
    .brand .name,.nav .txt,.me .who{display:none}
    .two-col{grid-template-columns:1fr}
  }
</style>
</head>
<body>
<div class="app">
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="brand">
      <div><img src="logo.png" alt="MicroCoaster" class="logo"></div>
      <div class="name">MicroCoaster</div>
    </div>
    <nav class="nav">
      <a href="dashboard.php" title="Dashboard">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z"/></svg>
        <span class="txt">Dashboard</span>
      </a>
      <a href="modules.php" title="Modules">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        <span class="txt">Modules</span>
      </a>
      <a class="active" href="timeline.php" title="Timeline">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6l3 3"/></svg>
        <span class="txt">Timeline</span>
      </a>
      <a href="settings.php" title="Settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09c.7 0 1.31-.4 1.51-1a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 3.3l.06.06c.51.51 1.25.66 1.9.4.53-.22 1.15-.09 1.51.33.27.31.49.68.49 1.1V3a2 2 0 1 1 4 0v.09c0 .42.22.79.49 1.1.36.42.98.55 1.51.33.65-.26 1.39-.11 1.9.4l.06.06a2 2 0 1 1 2.83 2.83l-.06.06c-.42.36-.55.98-.33 1.51.26.65.11 1.39-.4 1.9-.31.27-.68.49-1.1.49H21a2 2 0 1 1 0 4h-.09c-.42 0-.79.22-1.1.49-.51.51-.66 1.25-.4 1.9z"/></svg>
        <span class="txt">Settings</span>
      </a>
    </nav>
    <div class="spacer"></div>
    <div class="me">
      <div class="avatar"></div>
      <div class="who">
        <div class="nick"><?= htmlspecialchars($_SESSION['nickname'] ?? 'User') ?></div>
        <div class="status">● online</div>
      </div>
    </div>
  </aside>

  <!-- Main -->
  <div class="main">
    <div class="topbar">
      <div class="title">Timeline</div>
      <div class="actions">
        <input class="search" type="search" placeholder="Search modules, events…" />
        <a class="btn ghost" href="logout.php">Logout</a>
      </div>
    </div>

    <main class="content">
      <div class="grid two-col">
        <!-- Palette -->
        <section class="card">
          <h3 style="margin:0 0 10px">Modules</h3>
          <ul class="list" id="palette">
            <!-- exemples (tu peux générer depuis ta DB) -->
            <li class="pill drag" draggable="true" data-module="SwitchTrack-A" data-action="RIGHT">
              <span>SwitchTrack-A</span><span class="badge">Switch Track</span>
            </li>
            <li class="pill drag" draggable="true" data-module="Smoke-01" data-action="ON">
              <span>Smoke-01</span><span class="badge ok">Smoke</span>
            </li>
            <li class="pill drag" draggable="true" data-module="Audio-Main" data-action="PLAY">
              <span>Audio-Main</span><span class="badge">Audio</span>
            </li>
            <li class="pill drag" draggable="true" data-module="Station" data-action="SET_SPEED">
              <span>Station</span><span class="badge">Station</span>
            </li>
          </ul>
          <hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
          <div class="muted" style="font-size:13px">
            Glisse un module vers une lane → déplace / redimensionne → exporte en JSON.
          </div>
        </section>

        <!-- Timeline -->
        <section class="card">
          <div class="tl-toolbar">
            <button class="btn gray" id="zoomOut">−</button>
            <button class="btn gray" id="zoomIn">+</button>
            <label>Grid
              <select id="gridSnap">
                <option value="1">1.0s</option>
                <option value="0.5" selected>0.5s</option>
                <option value="0.1">0.1s</option>
              </select>
            </label>
            <label>Length (s)
              <input type="number" id="lengthSec" value="60" min="5" step="5">
            </label>
            <button class="btn" id="exportBtn">Export JSON</button>
          </div>

          <div class="tl-wrap" id="tlWrap">
            <div class="tl-canvas" id="tlCanvas">
              <div class="tl-ruler" id="tlRuler"></div>
              <div class="tl-tracks" id="tlTracks">
                <!-- 4 lanes par défaut -->
              </div>
            </div>
          </div>

          <h4 style="margin:14px 0 6px">Output</h4>
          <pre class="table" id="output" style="padding:12px;overflow:auto;max-height:220px">[]</pre>
        </section>
      </div>
    </main>
  </div>
</div>

<script>
/* ========== Timeline config ========== */
let pxPerSec = 40;         // zoom
let lengthSec = 60;        // durée totale
let snap = 0.5;            // pas d'accrochage
const lanesCount = 4;

const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);
const tlCanvas = $('#tlCanvas');
const tlRuler  = $('#tlRuler');
const tlTracks = $('#tlTracks');
const output   = $('#output');

/* ========== Helpers ========== */
const clamp = (v,min,max)=>Math.min(max,Math.max(min,v));
const fmt  = (s)=> {
  s = Math.max(0, s);
  const m = Math.floor(s/60), sec = (s%60).toFixed(2).padStart(5,'0');
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(5,'0')}`;
};
const snapTo = (v, step)=> Math.round(v/step)*step;

/* ========== Build lanes & ruler ========== */
function buildLanes(){
  tlTracks.innerHTML = '';
  for(let i=0;i<lanesCount;i++){
    const lane = document.createElement('div');
    lane.className = 'tl-lane';
    lane.dataset.lane = i;
    lane.innerHTML = `<div class="tl-label">Lane ${i+1}</div>`;
    // Drag target
    lane.addEventListener('dragover', e=>e.preventDefault());
    lane.addEventListener('drop', onDropModule);
    tlTracks.appendChild(lane);
  }
}
function buildRuler(){
  tlRuler.innerHTML = '';
  const width = lengthSec * pxPerSec;
  tlCanvas.style.width = width + 'px';

  // major ticks every 5s, label every 10s
  for(let t=0;t<=lengthSec;t+=1){
    const x = Math.round(t * pxPerSec);
    const tick = document.createElement('div');
    tick.className = 'tick';
    tick.style.left = x + 'px';
    tick.style.height = (t%5===0)? '14px' : '8px';
    tlRuler.appendChild(tick);

    if(t%10===0){
      const lab = document.createElement('div');
      lab.className = 'label';
      lab.style.left = x + 'px';
      lab.textContent = fmt(t);
      tlRuler.appendChild(lab);
    }
  }
}

/* ========== Palette drag ========== */
$('#palette').addEventListener('dragstart', (e)=>{
  const li = e.target.closest('[draggable="true"]');
  if(!li) return;
  e.dataTransfer.setData('text/plain', JSON.stringify({
    module: li.dataset.module,
    action: li.dataset.action || 'TRIGGER',
    duration: 2.0, // par défaut 2s
  }));
});

/* ========== Drop => create event block ========== */
function onDropModule(e){
  e.preventDefault();
  const laneEl = e.currentTarget;
  const laneIndex = parseInt(laneEl.dataset.lane, 10);

  let data = {};
  try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch(_) {}

  const rect = tlCanvas.getBoundingClientRect();
  const scrollX = $('#tlWrap').scrollLeft;
  // position dans le canvas:
  const x = e.clientX - rect.left + scrollX;
  let start = x / pxPerSec;
  start = snapTo(start, snap);
  start = clamp(start, 0, Math.max(0, lengthSec - data.duration));

  createEvent({
    lane: laneIndex,
    module: data.module || 'Module',
    action: data.action || 'TRIGGER',
    start,
    duration: data.duration || 2.0,
  });
  exportJSON(); // maj sortie
}

function createEvent(ev){
  const lane = tlTracks.children[ev.lane];
  const el = document.createElement('div');
  el.className = 'tl-event';
  el.tabIndex = 0;
  el.dataset.lane = ev.lane;
  el.dataset.module = ev.module;
  el.dataset.action = ev.action;
  el.dataset.start = ev.start;
  el.dataset.duration = ev.duration;

  function paint(){
    el.style.left = (parseFloat(el.dataset.start) * pxPerSec) + 'px';
    el.style.width = (parseFloat(el.dataset.duration) * pxPerSec) + 'px';
    el.innerHTML = `
      <span class="label">${el.dataset.module} • ${el.dataset.action}</span>
      <span class="time">${fmt(parseFloat(el.dataset.start))} → ${fmt(parseFloat(el.dataset.start)+parseFloat(el.dataset.duration))}</span>
      <span class="handle l"></span><span class="handle r"></span>`;
  }
  paint();

  // Drag move
  let dragging = false, resizing = null, startX = 0, startStart = 0, startDur = 0;
  el.addEventListener('mousedown', (e)=>{
    if(e.target.classList.contains('handle')){ // resize
      resizing = e.target.classList.contains('l') ? 'l' : 'r';
    }else{
      dragging = true;
    }
    startX = e.clientX;
    startStart = parseFloat(el.dataset.start);
    startDur = parseFloat(el.dataset.duration);
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e)=>{
    if(!dragging && !resizing) return;
    const dx = e.clientX - startX;
    const dSec = dx / pxPerSec;
    if(dragging){
      let newStart = snapTo(startStart + dSec, snap);
      newStart = clamp(newStart, 0, lengthSec - startDur);
      el.dataset.start = newStart;
      paint();
    }
    if(resizing === 'r'){
      let newDur = snapTo(startDur + dSec, snap);
      newDur = clamp(newDur, 0.2, lengthSec - startStart);
      el.dataset.duration = newDur;
      paint();
    }
    if(resizing === 'l'){
      let newStart = snapTo(startStart + dSec, snap);
      let newDur = clamp(startDur - (newStart - startStart), 0.2, lengthSec);
      if(newStart < 0){ newDur += newStart; newStart = 0; }
      el.dataset.start = clamp(newStart, 0, lengthSec);
      el.dataset.duration = newDur;
      paint();
    }
  });
  window.addEventListener('mouseup', ()=>{
    if(dragging || resizing){ dragging = false; resizing = null; exportJSON(); }
  });

  // Double-click pour changer l'action
  el.addEventListener('dblclick', ()=>{
    const next = prompt('Action (ON / OFF / LEFT / RIGHT / PLAY / SET_SPEED):', el.dataset.action) || el.dataset.action;
    el.dataset.action = next.toUpperCase();
    paint(); exportJSON();
  });

  lane.appendChild(el);
}

/* ========== Export JSON ========== */
function exportJSON(){
  const events = [];
  [...tlTracks.children].forEach((lane, laneIndex)=>{
    lane.querySelectorAll('.tl-event').forEach(el=>{
      const start = parseFloat(el.dataset.start);
      const duration = parseFloat(el.dataset.duration);
      events.push({
        lane: laneIndex,
        module: el.dataset.module,
        action: el.dataset.action,
        start_s: +start.toFixed(3),
        duration_s: +duration.toFixed(3),
        end_s: +(start+duration).toFixed(3)
      });
    });
  });
  // tri par start
  events.sort((a,b)=>a.start_s-b.start_s);
  output.textContent = JSON.stringify(events, null, 2);
  return events;
}

/* ========== Zoom / length / grid ========= */
function refresh(){
  buildRuler();
  // repaint all events
  $$('.tl-event').forEach(el=>{
    el.style.left  = (parseFloat(el.dataset.start) * pxPerSec) + 'px';
    el.style.width = (parseFloat(el.dataset.duration) * pxPerSec) + 'px';
  });
}
$('#zoomIn').onclick  = ()=>{ pxPerSec = Math.min(200, pxPerSec * 1.25); refresh(); };
$('#zoomOut').onclick = ()=>{ pxPerSec = Math.max(10,  pxPerSec / 1.25); refresh(); };
$('#lengthSec').onchange = (e)=>{ lengthSec = clamp(parseFloat(e.target.value||60), 5, 3600); refresh(); };
$('#gridSnap').onchange  = (e)=>{ snap = parseFloat(e.target.value)||0.5; };

/* init */
buildLanes(); buildRuler();

</script>
</body>
</html>
