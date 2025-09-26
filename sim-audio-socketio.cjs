/* sim-audio.cjs — Audio minimal : présence + playlist + action unique "play(track)" */
/* eslint-disable no-console */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { io } = require('socket.io-client');

// 🔄 CHANGEMENTS POUR SOCKET.IO
const WS_URL = process.env.WS_URL || 'http://127.0.0.1:3000'; // HTTP au lieu de WS
const MODULE_ID = process.env.MODULE_ID || 'MC-0001-AP';
const AUDIO_DIR = process.env.AUDIO_DIR || path.resolve(__dirname, 'tracks');

let socket;
const log = (...a) => console.log('[SIM-AP]', ...a);

// 🔄 NOUVELLE FONCTION SEND POUR SOCKET.IO
const send = (event, data) => {
  try {
    if (socket && socket.connected) {
      socket.emit(event, data);
    }
  } catch (e) {
    log('Send error:', e.message);
  }
};

const ack = (ok, extra = {}) => {
  // 🔄 NOUVEL FORMAT POUR SOCKET.IO
  send('esp_ack', {
    moduleId: MODULE_ID,
    ok,
    ...extra,
  });
};

const exts = new Set(['.mp3', '.ogg', '.wav', '.m4a']);
let playlist = ['001.mp3', '002.mp3', '003.mp3']; // fallback

async function loadPlaylist() {
  try {
    const files = await fsp.readdir(AUDIO_DIR);
    const onlyAudio = files
      .filter(f => exts.has(path.extname(f).toLowerCase()))
      .sort()
      .map(f => String(f));
    if (onlyAudio.length) playlist = onlyAudio;
    log(`Playlist (${playlist.length}) : ${playlist.join(', ')}`);
  } catch (err) {
    log('No AUDIO_DIR or read error, using fallback:', err.message);
  }
}

function pushPlaylist() {
  // 🔄 NOUVEAU FORMAT POUR SOCKET.IO
  send('esp_telemetry', {
    moduleId: MODULE_ID,
    moduleType: 'Audio Player',
    playlist,
  });
}

function handleCommand(data) {
  const { command, params = {} } = data;

  if (command !== 'play') {
    return ack(false, { error: 'unknown_action', action: command });
  }

  const track = String(params.track || '');
  // Ici, sur un vrai firmware, tu lancerais la lecture locale (DFPlayer/SD/…).
  log('PLAY request for track:', track);
  ack(true, { event: 'play', track });
}

async function connect() {
  await loadPlaylist();

  log(`Connecting to ${WS_URL} as ${MODULE_ID} …`);

  // 🔄 CONNEXION SOCKET.IO AU LIEU DE WEBSOCKET
  socket = io(WS_URL, {
    transports: ['websocket', 'polling'],
    timeout: 5000,
  });

  // 🔄 NOUVEAUX EVENTS SOCKET.IO
  socket.on('connect', () => {
    log('Connected to Socket.io server');

    // 🔄 REGISTRATION AU NOUVEAU FORMAT
    send('esp_register', {
      moduleId: MODULE_ID,
      moduleType: 'Audio Player',
    });

    log('Registered. Sending playlist to web…');
    setTimeout(pushPlaylist, 150);
  });

  // 🔄 RECEPTION DES COMMANDES AU NOUVEAU FORMAT
  socket.on('esp_command', data => {
    if (data.moduleId === MODULE_ID) {
      handleCommand(data);
    }
  });

  // 🔄 NOUVEAUX EVENTS DE CONNEXION
  socket.on('disconnect', reason => {
    log('Disconnected:', reason, '- retrying…');
    setTimeout(() => {
      if (!socket.connected) {
        socket.connect();
      }
    }, 1500);
  });

  socket.on('connect_error', error => {
    log('Connection error:', error.message);
  });

  // 🔄 OPTIONNEL: ECOUTER LES CONFIRMATIONS
  socket.on('esp_ack_received', data => {
    if (data.moduleId === MODULE_ID) {
      log('Server acknowledged:', data);
    }
  });
}

connect().catch(e => log('Fatal:', e));
