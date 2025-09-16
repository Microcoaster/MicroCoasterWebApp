<?php
session_start();
if (!isset($_SESSION['user_id'])) { header('Location: index.php'); exit; }
?>

<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MicroCoaster Dashboard</title>
  <style>
    :root{
      --bg-900:#0f1115; /* app background */
      --bg-800:#151821; /* main panels */
      --bg-700:#1b1f2a; /* sidebar */
      --bg-650:#202534; /* cards */
      --line:#2a3142;   /* borders */
      --text:#e5e7eb;   /* primary text */
      --muted:#a1a6b3;  /* secondary text */
      --accent:#22c55e; /* subtle green (no blue) */
      --accent-2:#10b981;
      --danger:#ef4444;
      --warn:#f59e0b;
      --ok:#22c55e;
      --radius:14px;
      --shadow:0 10px 30px rgba(0,0,0,.25);
    }
    *{box-sizing:border-box}
    html,body{height:100%}
    body{
      margin:0; background:var(--bg-900); color:var(--text);
      font: 15px/1.5 system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans", Ubuntu, Cantarell, Arial, sans-serif;
      -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
    }

    .app{display:grid; grid-template-columns: 260px 1fr; min-height:100vh}
    .sidebar{
      background:linear-gradient(180deg, var(--bg-700), #171a23 65%);
      border-right:1px solid var(--line);
      display:flex; flex-direction:column; gap:16px; padding:16px;
    }
    .brand{display:flex; align-items:center; gap:12px; padding:4px 8px 12px}
    .brand .logo{width:28px; height:28px; border-radius:8px; background:#0b0d13; border:1px solid var(--line); display:grid; place-items:center; font-weight:700}
    .brand .name{font-weight:700; letter-spacing:.2px}

    .nav{display:flex; flex-direction:column; gap:6px; margin-top:8px}
    .nav a{
      display:flex; align-items:center; gap:10px; padding:10px 12px; text-decoration:none; color:var(--text);
      border-radius:10px; border:1px solid transparent;
    }
    .nav a:hover{background:rgba(255,255,255,.035); border-color:var(--line)}
    .nav a.active{background:rgba(34,197,94,.08); border-color:#2a3a2f}
    .nav svg{width:18px;height:18px;opacity:.9}

    .sidebar .spacer{flex:1}

    .me{display:flex; align-items:center; gap:10px; padding:10px; border:1px solid var(--line); border-radius:12px; background:#141825}
    .me .avatar{width:36px;height:36px;border-radius:50%; background:#0b0d13; border:1px solid var(--line)}
    .me .who{display:flex; flex-direction:column; line-height:1.2}
    .me .who .nick{font-weight:600}
    .me .who .status{font-size:12px;color:var(--muted)}

    .main{display:flex; flex-direction:column}
    .topbar{position:sticky; top:0; z-index:5; background:linear-gradient(180deg, #12161f, #10131b);
      border-bottom:1px solid var(--line); padding:10px 18px; display:flex; align-items:center; gap:14px; justify-content:space-between}
    .topbar .title{font-weight:700; letter-spacing:.2px}
    .topbar .actions{display:flex; align-items:center; gap:10px}
    .search{background:var(--bg-800); border:1px solid var(--line); color:var(--text);
      padding:10px 12px; border-radius:10px; min-width:240px; outline:none}
    .btn{background:var(--accent); color:#0a0f0d; border:0; padding:10px 14px; border-radius:10px; font-weight:700; cursor:pointer}
    .btn.ghost{background:transparent; color:var(--text); border:1px solid var(--line)}

    .content{padding:20px; display:grid; gap:16px}

    .grid{display:grid; gap:16px}
    .grid.stats{grid-template-columns: repeat(4, minmax(0,1fr))}
    .card{
      background:var(--bg-650); border:1px solid var(--line); border-radius:var(--radius); padding:16px; box-shadow:var(--shadow)
    }
    .stat .label{color:var(--muted); font-size:12px}
    .stat .value{font-size:26px; font-weight:800; margin-top:6px}
    .stat .delta{font-size:12px; margin-top:6px}
    .delta.ok{color:var(--ok)}
    .delta.warn{color:var(--warn)}

    .two-col{grid-template-columns: 1.4fr 1fr}

    .list{display:flex; flex-direction:column; gap:10px; margin:0; padding:0; list-style:none}
    .row{display:flex; align-items:center; gap:12px; justify-content:space-between; padding:10px; background:rgba(0,0,0,.15); border:1px solid var(--line); border-radius:10px}
    .row .left{display:flex; align-items:center; gap:10px}
    .chip{font-size:12px; padding:4px 8px; border-radius:999px; border:1px solid var(--line); background:#121621}
    .chip.ok{border-color:rgba(34,197,94,.35); background:rgba(34,197,94,.08); color:#a7f3d0}
    .chip.off{background:rgba(239,68,68,.08); border-color:rgba(239,68,68,.3); color:#fecaca}

    .timeline{display:flex; flex-direction:column; gap:12px}
    .event{display:grid; grid-template-columns: 16px 1fr; gap:12px}
    .dot{width:10px;height:10px; border-radius:50%; background:var(--accent); margin-top:6px}
    .event .bubble{background:rgba(255,255,255,.03); border:1px solid var(--line); border-radius:10px; padding:10px}
    .event time{font-size:12px; color:var(--muted)}

    .table{width:100%; border-collapse:separate; border-spacing:0 8px}
    .table th{font-size:12px; color:var(--muted); text-align:left; padding:0 10px}
    .table td{background:rgba(0,0,0,.15); border:1px solid var(--line); padding:10px; }
    .table tr td:first-child{border-top-left-radius:10px; border-bottom-left-radius:10px}
    .table tr td:last-child{border-top-right-radius:10px; border-bottom-right-radius:10px}

    /* Mobile */
    @media (max-width: 980px){
      .app{grid-template-columns: 72px 1fr}
      .brand .name, .nav .txt, .me .who{display:none}
      .grid.stats{grid-template-columns: repeat(2, minmax(0,1fr))}
      .two-col{grid-template-columns: 1fr}
    }
  </style>
</head>
<body>
  <div class="app">
    <!-- Sidebar (Discord-like) -->
    <aside class="sidebar">
      <div class="brand">
        <div> <img src="logo.png" alt="MicroCoaster logo" class="logo"> </div>
        <div class="name">MicroCoaster</div>
      </div>
      <nav class="nav">
        <a class="active" href="dashboard.php" title="Dashboard">
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
        <div class="title">Dashboard</div>
        <div class="actions">
          <input class="search" type="search" placeholder="Search modules, events…" />
          <button class="btn" onclick="alert('Create module (hook to /modules.php)')">+ New Module</button>
          <a class="btn ghost" href="logout.php">Logout</a>
        </div>
      </div>

      <div class="content">
        <!-- Stats -->
        <div class="grid stats">
          <div class="card stat">
            <div class="label">Modules</div>
            <div class="value">5</div>
            <div class="delta ok">▲ 1 new</div>
          </div>
          <div class="card stat">
            <div class="label">Devices</div>
            <div class="value">0</div>
            <div class="delta">—</div>
          </div>
        </div>

        <!-- Two columns: Modules + Timeline -->

        <div class="grid two-col">
        <div class="card">
            <h3 style="margin:0 0 10px">My Modules</h3>
            <ul class="list">
            <!-- Launch -->
            <li class="row">
                <div class="left">
                <span class="chip ok">online</span>
                <div>
                    <div style="font-weight:600">Launch</div>
                    <div style="color:var(--muted); font-size:12px">ESP32 • v1.2.0 • chipID 7C:DF:08</div>
                </div>
                </div>
                <div style="display:flex; gap:8px">
                <a class="btn ghost" href="modules.php">Open</a>
                </div>
            </li>

            <!-- Smoke Machine -->
            <li class="row">
                <div class="left">
                <span class="chip off">offline</span>
                <div>
                    <div style="font-weight:600">Smoke Machine</div>
                    <div style="color:var(--muted); font-size:12px">ESP32 • last seen 2h ago</div>
                </div>
                </div>
                <div><a class="btn ghost" href="modules.php">Open</a></div>
            </li>

            <!-- Switch Track -->
            <li class="row">
                <div class="left">
                <span class="chip ok">online</span>
                <div>
                    <div style="font-weight:600">Switch Track</div>
                    <div style="color:var(--muted); font-size:12px">ESP32 • relay board • v1.0.3</div>
                </div>
                </div>
                <div><a class="btn ghost" href="modules.php">Open</a></div>
            </li>

            <!-- Station -->
            <li class="row">
                <div class="left">
                <span class="chip ok">online</span>
                <div>
                    <div style="font-weight:600">Station</div>
                    <div style="color:var(--muted); font-size:12px">ESP32 • gates controller</div>
                </div>
                </div>
                <div><a class="btn ghost" href="modules.php">Open</a></div>
            </li>

            <!-- Sound System -->
            <li class="row">
                <div class="left">
                <span class="chip ok">online</span>
                <div>
                    <div style="font-weight:600">Sound System</div>
                    <div style="color:var(--muted); font-size:12px">ESP32 • audio amp • v0.9.2</div>
                </div>
                </div>
                <div><a class="btn ghost" href="modules.php">Open</a></div>
            </li>
            </ul>
        </div>

        <div class="card">
            <h3 style="margin:0 0 10px">Timeline</h3>
            <div class="timeline">
            <div class="event">
                <div class="dot"></div>
                <div class="bubble">
                <time>00:12</time>
                <div style="font-weight:600">Launch sequence started</div>
                <div style="color:var(--muted); font-size:13px">by <strong>User</strong> • module <em>Launch</em></div>
                </div>
            </div>
            <div class="event">
                <div class="dot"></div>
                <div class="bubble">
                <time>00:10</time>
                <div style="font-weight:600">Smoke Machine</div>
                <div style="color:var(--muted); font-size:13px">Preheat</div>
                </div>
            </div>
            <div class="event">
                <div class="dot"></div>
                <div class="bubble">
                <time>00:05</time>
                <div style="font-weight:600">Start Station</div>
                <div style="color:var(--muted); font-size:13px">Boarding gates</div>
                </div>
            </div>
            </div>
        </div>
        </div>

        <!-- Recent activity table -->
        <div class="card">
  <h3 style="margin:0 0 12px">Recent Events</h3>
  <table class="table">
    <thead>
      <tr>
        <th style="width:160px">Time</th>
        <th>Event</th>
        <th style="width:180px">Module</th>
        <th style="width:120px">Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>2025-09-11 22:15:12</td>
        <td>Launch started</td>
        <td>Launch</td>
        <td><span class="chip ok">ok</span></td>
      </tr>
      <tr>
        <td>2025-09-11 22:14:03</td>
        <td>Smoke 10 secondes</td>
        <td>Smoke Machine</td>
        <td><span class="chip ok">ok</span></td>
      </tr>
      <tr>
        <td>2025-09-11 22:11:55</td>
        <td>Boarding gates closed</td>
        <td>Station</td>
        <td><span class="chip">info</span></td>
      </tr>
    </tbody>
  </table>
</div>


  <!-- Minimal JS for demo-only (replace with real actions) -->
  <script>
    // You can hook buttons and search input here.
  </script>
</body>
</html>
