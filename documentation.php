<?php
session_start();
if (!isset($_SESSION['user_id'])) { header('Location: index.php'); exit; }
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MicroCoaster — Documentation</title>
<style>
  :root{
    --bg-900:#0f1115; --bg-800:#151821; --bg-700:#1b1f2a; --bg-650:#202534;
    --line:#2a3142; --text:#e5e7eb; --muted:#a1a6b3;
    --accent:#22c55e; --accent-2:#10b981; --danger:#ef4444; --warn:#f59e0b; --ok:#22c55e;
    --radius:14px; --shadow:0 10px 30px rgba(0,0,0,.25);
    --mono: ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  html{scroll-behavior:smooth}
  body{
    margin:0; background:var(--bg-900); color:var(--text);
    font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,"Noto Sans",Ubuntu,Cantarell,Arial,sans-serif;
    -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
  }

  /* App layout */
  .app{display:grid; grid-template-columns:260px 1fr; min-height:100vh}
  .sidebar{
    background:linear-gradient(180deg,var(--bg-700),#171a23 65%);
    border-right:1px solid var(--line); display:flex; flex-direction:column; gap:16px; padding:16px;
  }
  .brand{display:flex; align-items:center; gap:12px; padding:4px 8px 12px}
  .brand .logo{width:28px;height:28px;border-radius:8px;background:#0b0d13;border:1px solid var(--line);display:grid;place-items:center}
  .brand .name{font-weight:700; letter-spacing:.2px}

  .nav{display:flex; flex-direction:column; gap:6px; margin-top:8px}
  .nav a{display:flex; align-items:center; gap:10px; padding:10px 12px; text-decoration:none; color:var(--text); border-radius:10px; border:1px solid transparent}
  .nav a:hover{background:rgba(255,255,255,.035); border-color:var(--line)}
  .nav a.active{background:rgba(34,197,94,.08); border-color:#2a3a2f}
  .nav svg{width:18px;height:18px;opacity:.9}
  .sidebar .spacer{flex:1}
  .me{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--line);border-radius:12px;background:#141825}
  .me .avatar{width:36px;height:36px;border-radius:50%;background:#0b0d13;border:1px solid var(--line)}
  .me .who{display:flex;flex-direction:column;line-height:1.2}
  .me .who .nick{font-weight:600}
  .me .who .status{font-size:12px;color:var(--muted)}

  .main{display:flex;flex-direction:column}
  .topbar{
    position:sticky; top:0; z-index:5;
    background:linear-gradient(180deg,#12161f,#10131b);
    border-bottom:1px solid var(--line);
    padding:10px 18px; display:flex; align-items:center; gap:14px; justify-content:space-between;
  }
  .topbar .title{font-weight:700; letter-spacing:.2px}
  .topbar .actions{display:flex; align-items:center; gap:10px}
  .search{background:var(--bg-800); border:1px solid var(--line); color:var(--text); padding:10px 12px; border-radius:10px; min-width:260px; outline:none}

  .content{padding:20px; display:grid; gap:16px}

  /* Docs layout */
  .docs{display:grid; gap:16px; grid-template-columns: 280px 1fr}
  .card{background:var(--bg-650); border:1px solid var(--line); border-radius:var(--radius); padding:16px; box-shadow:var(--shadow)}
  .muted{color:var(--muted)}
  .toc a{display:block; color:var(--text); text-decoration:none; padding:8px 10px; border-radius:10px}
  .toc a:hover{background:rgba(255,255,255,.04)}
  .toc a.active{background:rgba(34,197,94,.08); border:1px solid #2a3a2f}
  .toc .small{font-size:12px; color:var(--muted); margin:8px 0 0}
  .section{scroll-margin-top:80px}
  .section h2{margin:0 0 6px; font-size:20px}
  .section h3{margin:14px 0 8px; font-size:16px}
  .kv{display:grid; grid-template-columns: 160px 1fr; gap:8px 12px; font-size:14px}
  .kv div:nth-child(odd){color:var(--muted)}
  .badge{font-size:12px; padding:2px 8px; border-radius:999px; border:1px solid var(--line); background:#121621}
  .table{width:100%; border-collapse:separate; border-spacing:0 8px}
  .table th{font-size:12px; color:var(--muted); text-align:left; padding:0 10px}
  .table td{background:rgba(0,0,0,.15); border:1px solid var(--line); padding:10px}
  .table tr td:first-child{border-top-left-radius:10px; border-bottom-left-radius:10px}
  .table tr td:last-child{border-top-right-radius:10px; border-bottom-right-radius:10px}

  /* Code blocks + copy */
  pre.code{position:relative; margin:8px 0; padding:12px 12px 14px; background:#141923; border:1px solid var(--line); border-radius:10px; overflow:auto; font-family:var(--mono); font-size:13px}
  .copy{position:absolute; top:8px; right:8px; font-size:12px; padding:4px 8px; border-radius:8px; border:1px solid var(--line); background:#111723; color:#e5e7eb; cursor:pointer}
  .copy.ok{background:#1a2a1f; border-color:#2f5a3e}

  details{border:1px solid var(--line); border-radius:10px; background:#161b26; padding:10px}
  details[open]{background:#141a24}
  summary{cursor:pointer; font-weight:600}

  @media (max-width: 1100px){
    .docs{grid-template-columns:1fr}
    .toc{position:static}
  }
</style>
</head>
<body>
<div class="app">
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="brand">
      <div><img src="logo.png" alt="MicroCoaster logo" class="logo"></div>
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
      <a href="timeline.php" title="Timeline">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6l3 3"/></svg>
        <span class="txt">Timeline</span>
      </a>
      <a class="active" href="documentation.php" title="Documentation">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V4a2 2 0 0 1 2-2h9.5a2 2 0 0 1 2 2V20l-4-2-4 2-4-2z"/></svg>
        <span class="txt">Documentation</span>
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
      <div class="title">Documentation</div>
      <div class="actions">
        <input id="docSearch" class="search" type="search" placeholder="Search in documentation…" />
      </div>
    </div>

    <main class="content">
      <div class="docs">
        <!-- TOC -->
        <aside class="card toc" id="toc">
          <strong>Modules</strong>
          <a href="#switch-track">Switch Track</a>
          <a href="#smoke-machine">Smoke Machine</a>
          <a href="#station">Station</a>
          <a href="#audio-player">Audio Player</a>
          <a href="#light-fx">Light FX</a>
          <div class="small">Astuce : tape “mqtt” ou “json” pour filtrer les sections.</div>
        </aside>

        <!-- DOCS -->
        <section id="docsArea" class="card">

          <!-- SWITCH TRACK -->
          <article id="switch-track" class="section" data-keywords="switch track aiguille turnout LEFT RIGHT mqtt http">
            <h2>Switch Track <span class="badge">Type: actuator</span></h2>
            <p class="muted">Aiguille motorisée: bascule Gauche/Droite et renvoie son état.</p>

            <h3>Configuration</h3>
            <table class="table">
              <thead><tr><th>Champ</th><th>Description</th></tr></thead>
              <tbody>
                <tr><td>name</td><td>Nom affiché dans l’UI (ex. <code>SwitchTrack-A</code>).</td></tr>
                <tr><td>deviceId</td><td>Identifiant unique (ex. <code>st-a</code>).</td></tr>
                <tr><td>host</td><td>IP/hostname de l’ESP/contrôleur (ex. <code>192.168.1.41</code>).</td></tr>
                <tr><td>leftPin / rightPin</td><td>GPIO pour piloter le servo/relais (option si pilotage via MQTT natif).</td></tr>
              </tbody>
            </table>

            <h3>Actions</h3>
            <div class="kv">
              <div>LEFT / RIGHT</div><div>Bascule l’aiguille.</div>
              <div>STOP</div><div>Stoppe un mouvement en cours (si supporté).</div>
              <div>STATE</div><div>Demande l’état au contrôleur (retour <code>left|right|unknown</code>).</div>
            </div>

            <h3>HTTP</h3>
            <pre class="code"><button class="copy">Copy</button><code>POST /api/modules/{id}/command
Content-Type: application/json

{ "action": "LEFT" }</code></pre>

            <h3>MQTT</h3>
            <pre class="code"><button class="copy">Copy</button><code>// Commande
Topic: microcoaster/{deviceId}/cmd
Payload: {"action":"RIGHT"}

// État publié par le module
Topic: microcoaster/{deviceId}/state
Payload: {"position":"left","ts":1712231123}</code></pre>

            <h3>Timeline JSON</h3>
            <pre class="code"><button class="copy">Copy</button><code>[
  { "module":"SwitchTrack-A", "action":"LEFT",  "start_s": 2.0, "duration_s": 0.5 },
  { "module":"SwitchTrack-A", "action":"RIGHT", "start_s": 8.0, "duration_s": 0.5 }
]</code></pre>

            <details><summary>Troubleshooting</summary>
              <ul>
                <li>Si l’aiguille ne bouge pas : vérifier l’alimentation du servo/relais et la masse commune.</li>
                <li>Via MQTT, contrôle que le device souscrit bien au topic <code>.../cmd</code>.</li>
              </ul>
            </details>
          </article>

          <hr style="border:0;border-top:1px solid var(--line);margin:16px 0"/>

          <!-- SMOKE -->
          <article id="smoke-machine" class="section" data-keywords="smoke machine fumee fog ON OFF burst mqtt http">
            <h2>Smoke Machine <span class="badge">Type: effect</span></h2>
            <p class="muted">Machine à fumée : impulsion/burst avec durée et cooldown.</p>

            <h3>Configuration</h3>
            <table class="table">
              <thead><tr><th>Champ</th><th>Description</th></tr></thead>
              <tbody>
                <tr><td>name</td><td><code>Smoke-01</code></td></tr>
                <tr><td>deviceId</td><td>ex. <code>esp32-smk01</code></td></tr>
                <tr><td>host</td><td>IP réseau du relais/driver.</td></tr>
                <tr><td>maxDuration</td><td>Durée max d’un burst (s) pour sécurité.</td></tr>
                <tr><td>cooldown</td><td>Délai mini entre deux déclenchements (s).</td></tr>
              </tbody>
            </table>

            <h3>Actions</h3>
            <div class="kv">
              <div>ON / OFF</div><div>Force l’état.</div>
              <div>BURST</div><div>Déclenche une impulsion réglée (clé <code>duration</code> en secondes).</div>
            </div>

            <h3>HTTP</h3>
            <pre class="code"><button class="copy">Copy</button><code>POST /api/modules/{id}/command
Content-Type: application/json

{ "action":"BURST", "duration": 3 }</code></pre>

            <h3>MQTT</h3>
            <pre class="code"><button class="copy">Copy</button><code>Topic: microcoaster/{deviceId}/cmd
Payload: {"action":"ON"}  // ou {"action":"BURST","duration":2}</code></pre>

            <h3>Timeline JSON</h3>
            <pre class="code"><button class="copy">Copy</button><code>[
  { "module":"Smoke-01", "action":"BURST", "start_s": 12.0, "duration_s": 2.0 }
]</code></pre>

            <details><summary>Troubleshooting</summary>
              <ul>
                <li>Respecte <code>cooldown</code> et <code>maxDuration</code> pour éviter la surchauffe.</li>
                <li>Contrôle le relais (LED témoin) et l’alim de la machine.</li>
              </ul>
            </details>
          </article>

          <hr style="border:0;border-top:1px solid var(--line);margin:16px 0"/>

          <!-- STATION -->
          <article id="station" class="section" data-keywords="station train speed set_speed start stop e-stop">
            <h2>Station <span class="badge">Type: controller</span></h2>
            <p class="muted">Contrôle de station : vitesses, départ/arrêt, E-STOP.</p>

            <h3>Configuration</h3>
            <table class="table">
              <thead><tr><th>Champ</th><th>Description</th></tr></thead>
              <tbody>
                <tr><td>name</td><td><code>Station</code></td></tr>
                <tr><td>deviceId</td><td><code>station-main</code></td></tr>
                <tr><td>host</td><td>IP/host du contrôleur</td></tr>
                <tr><td>minSpeed / maxSpeed</td><td>Bornes de sécurité (0–100).</td></tr>
              </tbody>
            </table>

            <h3>Actions</h3>
            <div class="kv">
              <div>SET_SPEED</div><div>Valeur 0–100 (clé <code>value</code>).</div>
              <div>START / STOP</div><div>Démarre/arrête la station.</div>
              <div>E_STOP</div><div>Achat d’urgence.</div>
            </div>

            <h3>HTTP</h3>
            <pre class="code"><button class="copy">Copy</button><code>POST /api/modules/{id}/command
Content-Type: application/json

{ "action":"SET_SPEED", "value": 60 }</code></pre>

            <h3>MQTT</h3>
            <pre class="code"><button class="copy">Copy</button><code>Topic: microcoaster/{deviceId}/cmd
Payload: {"action":"START"}</code></pre>

            <h3>Timeline JSON</h3>
            <pre class="code"><button class="copy">Copy</button><code>[
  { "module":"Station", "action":"SET_SPEED", "start_s": 0.0, "duration_s": 0.0, "value": 30 },
  { "module":"Station", "action":"START",     "start_s": 1.5, "duration_s": 0.0 }
]</code></pre>
          </article>

          <hr style="border:0;border-top:1px solid var(--line);margin:16px 0"/>

          <!-- AUDIO -->
          <article id="audio-player" class="section" data-keywords="audio player play pause stop volume file track">
            <h2>Audio Player <span class="badge">Type: media</span></h2>
            <p class="muted">Lecture de pistes audio (fichiers locaux ou URL).</p>

            <h3>Configuration</h3>
            <table class="table">
              <thead><tr><th>Champ</th><th>Description</th></tr></thead>
              <tbody>
                <tr><td>name</td><td><code>Audio-Main</code></td></tr>
                <tr><td>deviceId</td><td><code>audio-main</code></td></tr>
                <tr><td>host</td><td>IP/host du player</td></tr>
                <tr><td>basePath</td><td>Racine des médias (ex. <code>/sdcard/sounds</code>).</td></tr>
              </tbody>
            </table>

            <h3>Actions</h3>
            <div class="kv">
              <div>PLAY</div><div>Clé <code>track</code> (chemin ou ID).</div>
              <div>PAUSE / RESUME / STOP</div><div>Contrôles de transport.</div>
              <div>VOLUME</div><div>Clé <code>value</code> (0–100).</div>
            </div>

            <h3>HTTP</h3>
            <pre class="code"><button class="copy">Copy</button><code>POST /api/modules/{id}/command
Content-Type: application/json

{ "action":"PLAY", "track":"launch_theme.mp3" }</code></pre>

            <h3>MQTT</h3>
            <pre class="code"><button class="copy">Copy</button><code>Topic: microcoaster/{deviceId}/cmd
Payload: {"action":"VOLUME","value":70}</code></pre>

            <h3>Timeline JSON</h3>
            <pre class="code"><button class="copy">Copy</button><code>[
  { "module":"Audio-Main", "action":"PLAY",   "start_s": 0.0, "duration_s": 0.0, "track":"intro.wav" },
  { "module":"Audio-Main", "action":"VOLUME", "start_s": 3.0, "duration_s": 0.0, "value": 60 }
]</code></pre>
          </article>

          <hr style="border:0;border-top:1px solid var(--line);margin:16px 0"/>

          <!-- LIGHT FX -->
          <article id="light-fx" class="section" data-keywords="light fx led rgb scene brightness color">
            <h2>Light FX <span class="badge">Type: lighting</span></h2>
            <p class="muted">Contrôle d’éclairage : scènes, niveaux et couleurs.</p>

            <h3>Configuration</h3>
            <table class="table">
              <thead><tr><th>Champ</th><th>Description</th></tr></thead>
              <tbody>
                <tr><td>name</td><td><code>Light-FX</code></td></tr>
                <tr><td>deviceId</td><td><code>light-01</code></td></tr>
                <tr><td>host</td><td>IP/host du contrôleur LED</td></tr>
                <tr><td>universe</td><td>DMX/ArtNet (si applicable).</td></tr>
              </tbody>
            </table>

            <h3>Actions</h3>
            <div class="kv">
              <div>SET_SCENE</div><div>Clé <code>scene</code> (ex. <code>strobe</code>, <code>idle</code>).</div>
              <div>BRIGHTNESS</div><div>Clé <code>value</code> (0–100).</div>
              <div>COLOR</div><div>Clé <code>hex</code> (ex. <code>#FF8800</code>).</div>
            </div>

            <h3>HTTP</h3>
            <pre class="code"><button class="copy">Copy</button><code>POST /api/modules/{id}/command
Content-Type: application/json

{ "action":"COLOR", "hex":"#00ffcc" }</code></pre>

            <h3>MQTT</h3>
            <pre class="code"><button class="copy">Copy</button><code>Topic: microcoaster/{deviceId}/cmd
Payload: {"action":"SET_SCENE","scene":"idle"}</code></pre>

            <h3>Timeline JSON</h3>
            <pre class="code"><button class="copy">Copy</button><code>[
  { "module":"Light-FX", "action":"SET_SCENE", "start_s": 0.0, "duration_s": 0.0, "scene":"idle" },
  { "module":"Light-FX", "action":"BRIGHTNESS", "start_s": 1.0, "duration_s": 0.0, "value": 80 }
]</code></pre>

            <details><summary>Notes</summary>
              <ul>
                <li>Si DMX : vérifier l’adressage, l’univers et le débit.</li>
                <li>Si LED adressables : vérifier l’alimentation et le niveau logique.</li>
              </ul>
            </details>
          </article>

        </section>
      </div>
    </main>
  </div>
</div>

<script>
  // ——— Sommaire actif selon le scroll
  const tocLinks = Array.from(document.querySelectorAll('#toc a'));
  const sections = Array.from(document.querySelectorAll('.section'));
  const byId = id => document.querySelector(id);

  const io = new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        tocLinks.forEach(a=>a.classList.toggle('active', a.getAttribute('href').slice(1) === e.target.id));
      }
    });
  }, { rootMargin:'-40% 0px -55% 0px', threshold:0.01 });
  sections.forEach(s=>io.observe(s));

  // ——— Recherche plein texte (titre + data-keywords + code)
  const search = document.getElementById('docSearch');
  search.addEventListener('input', ()=>{
    const q = search.value.toLowerCase().trim();
    sections.forEach(sec=>{
      const text = (sec.innerText + ' ' + (sec.dataset.keywords||'')).toLowerCase();
      sec.style.display = text.includes(q) ? '' : 'none';
      // Masque aussi le lien TOC si caché
      const link = document.querySelector(`#toc a[href="#${sec.id}"]`);
      if(link) link.style.display = sec.style.display==='none' ? 'none' : '';
    });
  });

  // ——— Boutons "Copy"
  document.querySelectorAll('pre.code .copy').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const code = btn.parentElement.querySelector('code').innerText;
      navigator.clipboard.writeText(code).then(()=>{
        btn.classList.add('ok'); btn.textContent = 'Copied';
        setTimeout(()=>{ btn.classList.remove('ok'); btn.textContent='Copy'; }, 900);
      });
    });
  });
</script>
</body>
</html>
