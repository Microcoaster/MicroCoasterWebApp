// sim-esp-socketio.cjs - Simulateur ESP32 adapté pour Socket.io
/* eslint-disable no-console */
const { io } = require('socket.io-client');

const SERVER_URL = process.env.SERVER_URL || 'http://127.0.0.1:3000';
const MODULE_ID = process.env.MODULE_ID || 'MC-0001-AP';

let socket;
let uptimeStart = Date.now();
let tmHandle = null;

// -------- Helpers --------
const log  = (...a) => console.log('[SIM ESP]', ...a);

const typeFromId = (mid) => {
  const up = String(mid).toUpperCase();
  if (up.endsWith('-STN')) return 'Station';
  if (up.endsWith('-ST'))  return 'Switch Track';
  if (up.endsWith('-LFX')) return 'Light FX';
  if (up.endsWith('-LT'))  return 'Launch Track';
  if (up.endsWith('-SM'))  return 'Smoke Machine';
  if (up.endsWith('-AP'))  return 'Audio Player';
  return 'Unknown';
};

const TYPE = typeFromId(MODULE_ID);

// -------- États par type --------
const state = {
  common: { uptime_ms: 0 },

  // Station
  station: { gates:false, harness:false, nsf:true, estop:false, inDispatch:false },

  // Switch Track
  swt: { transfer:false, left:false, right:false },

  // Light FX
  lfx: { on:false },

  // Launch Track
  lt: { ready:true, speed:60, duration:5, dir:1, running:false },

  // Smoke Machine
  sm: { ready:true, duration:8, running:false },

  // Audio Player
  ap: {
    playlist: [
      { file:'001.mp3', title:'Taron'  },
      { file:'002.mp3', title:'Klugheim Ambience' },
      { file:'003.mp3', title:'Baron 1898' },
      { file:'004.mp3', title:'The Smiler' },
      { file:'005.mp3', title:'Voltron' }
    ],
    current: 0
  }
};

// -------- Télémétrie --------
function sendTelemetry() {
  if (!socket || !socket.connected) return;
  
  state.common.uptime_ms = Date.now() - uptimeStart;
  
  let payload = { ...state.common };
  
  switch(TYPE) {
    case 'Station':
      payload = { ...payload, ...state.station };
      break;
    case 'Switch Track':
      payload = { ...payload, ...state.swt };
      break;
    case 'Light FX':
      payload = { ...payload, ...state.lfx };
      break;
    case 'Launch Track':
      payload = { ...payload, ...state.lt };
      break;
    case 'Smoke Machine':
      payload = { ...payload, ...state.sm };
      break;
    case 'Audio Player':
      payload = { ...payload, ...state.ap };
      break;
  }
  
  socket.emit('telemetry', payload);
}

// -------- Commandes par type --------
function handleCommand(cmd, params = {}) {
  log(`Received command: ${cmd}`, params);
  
  switch(TYPE) {
    case 'Station':
      handleStationCommand(cmd, params);
      break;
    case 'Switch Track':
      handleSwitchTrackCommand(cmd, params);
      break;
    case 'Light FX':
      handleLightFXCommand(cmd, params);
      break;
    case 'Launch Track':
      handleLaunchTrackCommand(cmd, params);
      break;
    case 'Smoke Machine':
      handleSmokeCommand(cmd, params);
      break;
    case 'Audio Player':
      handleAudioCommand(cmd, params);
      break;
  }
  
  // Envoyer immédiatement la télémétrie mise à jour
  sendTelemetry();
}

function handleStationCommand(cmd, params) {
  switch(cmd) {
    case 'gates_open':
      state.station.gates = false;
      log('Gates opened');
      break;
    case 'gates_close':
      state.station.gates = true;
      log('Gates closed');
      break;
    case 'start': // dispatch
      state.station.inDispatch = true;
      log('Dispatch started');
      setTimeout(() => {
        state.station.inDispatch = false;
        sendTelemetry();
      }, 3000);
      break;
    case 'harness_lock':
      state.station.harness = true;
      log('Harness locked');
      break;
    case 'harness_unlock':
      state.station.harness = false;
      log('Harness unlocked');
      break;
  }
}

function handleSwitchTrackCommand(cmd, params) {
  switch(cmd) {
    case 'left':
      state.swt.transfer = true;
      state.swt.left = true;
      state.swt.right = false;
      log('Switch left');
      break;
    case 'right':
      state.swt.transfer = true;
      state.swt.left = false;
      state.swt.right = true;
      log('Switch right');
      break;
  }
}

function handleLightFXCommand(cmd, params) {
  if (cmd === 'led') {
    state.lfx.on = !!params.value;
    log(`Light ${state.lfx.on ? 'ON' : 'OFF'}`);
  }
}

function handleLaunchTrackCommand(cmd, params) {
  switch(cmd) {
    case 'forward':
    case 'backward':
      state.lt.dir = cmd === 'forward' ? 1 : -1;
      if (params.speed) state.lt.speed = params.speed;
      state.lt.running = true;
      log(`Launch ${cmd} at ${state.lt.speed}% speed`);
      setTimeout(() => {
        state.lt.running = false;
        sendTelemetry();
      }, (params.duration || state.lt.duration) * 1000);
      break;
    case 'speed':
      state.lt.speed = params.value || 60;
      log(`Speed set to ${state.lt.speed}%`);
      break;
  }
}

function handleSmokeCommand(cmd, params) {
  if (cmd === 'smoke_start') {
    state.sm.running = true;
    const duration = params.duration || state.sm.duration;
    log(`Smoke started for ${duration}s`);
    setTimeout(() => {
      state.sm.running = false;
      sendTelemetry();
    }, duration * 1000);
  }
}

function handleAudioCommand(cmd, params) {
  if (cmd === 'play' && params.track) {
    const track = state.ap.playlist.find(t => t.file === params.track);
    if (track) {
      state.ap.current = state.ap.playlist.indexOf(track);
      log(`Playing: ${track.title}`);
    }
  }
}

// -------- Connexion Socket.io --------
function connect() {
  log(`Connecting ESP32 simulator ${MODULE_ID} (${TYPE}) to ${SERVER_URL}...`);
  
  socket = io(SERVER_URL, {
    transports: ['websocket'], // Force WebSocket
    timeout: 5000
  });
  
  socket.on('connect', () => {
    log('🟢 Connected to server');
    
    // S'identifier comme module ESP32
    socket.emit('module_identify', {
      moduleId: MODULE_ID,
      type: TYPE
    });
  });
  
  socket.on('connected', (data) => {
    log('✅ Module registered:', data.message);
    
    // Démarrer l'envoi de télémétrie périodique
    tmHandle = setInterval(sendTelemetry, 2000);
    
    // Envoyer immédiatement la télémétrie initiale
    sendTelemetry();
  });
  
  socket.on('command', (data) => {
    if (data.payload && data.payload.command) {
      handleCommand(data.payload.command, data.payload.params);
    }
  });
  
  socket.on('disconnect', () => {
    log('🔴 Disconnected from server');
    if (tmHandle) {
      clearInterval(tmHandle);
      tmHandle = null;
    }
  });
  
  socket.on('error', (error) => {
    log('❌ Socket error:', error);
  });
}

// -------- Simulation de variations d'état --------
function simulateRandomChanges() {
  // Simuler des changements d'état aléatoires pour rendre la démo plus vivante
  switch(TYPE) {
    case 'Station':
      // Simuler Next Section Free qui change aléatoirement
      if (Math.random() > 0.8) {
        state.station.nsf = !state.station.nsf;
        sendTelemetry();
      }
      break;
    case 'Light FX':
      // Clignotement aléatoire occasionnel
      if (Math.random() > 0.95) {
        state.lfx.on = !state.lfx.on;
        setTimeout(() => {
          state.lfx.on = !state.lfx.on;
          sendTelemetry();
        }, 200);
      }
      break;
  }
}

// -------- Démarrage --------
log(`🤖 ESP32 Simulator starting...`);
log(`Module ID: ${MODULE_ID}`);
log(`Type: ${TYPE}`);
log(`Server: ${SERVER_URL}`);

connect();

// Variations aléatoires toutes les 5 secondes
setInterval(simulateRandomChanges, 5000);

// Graceful shutdown
process.on('SIGINT', () => {
  log('🛑 Shutting down...');
  if (tmHandle) clearInterval(tmHandle);
  if (socket) socket.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('🛑 Shutting down...');
  if (tmHandle) clearInterval(tmHandle);
  if (socket) socket.disconnect();
  process.exit(0);
});

log('🚀 Simulator ready! Press Ctrl+C to stop.');