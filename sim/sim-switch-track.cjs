// sim-switch-track.cjs - S// Fonction sendTelemetry supprimée - pas nécessaire avec Socket.io
// Socket.io gère auto// -------- Pas de simulation d'activité physique --------
// L'aiguillage ESP32 réel n'a pas de bouton physique
// Il ne change de position que via les commandes WebSocket la détection de déconnexionur ESP32 Switch Track sécurisé
/* eslint-disable no-console */
const { io } = require('socket.io-client');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://127.0.0.1:3000';
const MODULE_ID = process.env.MODULE_ID || 'MC-0001-ST';
const MODULE_PASSWORD = process.env.MODULE_PASSWORD || 'F674iaRftVsHGKOA8hq3TI93HQHUaYqZ';

let socket;
const uptimeStart = Date.now();
let currentPosition = 'left'; // Position initiale

// -------- Helpers --------
const log = (...args) => console.log('[SWITCH TRACK]', ...args);

// -------- Télémétrie sécurisée --------
function createAuthenticatedPayload(additionalData = {}) {
  return {
    moduleId: MODULE_ID,
    password: MODULE_PASSWORD,
    uptime: Date.now() - uptimeStart,
    position: currentPosition,
    ...additionalData,
  };
}

function sendTelemetry() {
  if (!socket || !socket.connected) return;

  const payload = createAuthenticatedPayload();
  socket.emit('telemetry', payload);
  log(`� Télémétrie envoyée: ${currentPosition}`);
}

// -------- Gestion des commandes --------
function handleCommand(cmd) {
  log(`📡 Commande reçue: ${cmd}`);

  switch (cmd) {
    case 'switch_left':
    case 'left':
      currentPosition = 'left';
      log('🔄 Aiguillage basculé vers la GAUCHE');
      break;
    case 'switch_right':
    case 'right':
      currentPosition = 'right';
      log('🔄 Aiguillage basculé vers la DROITE');
      break;
    default:
      log(`⚠️ Commande inconnue: ${cmd}`);
      return;
  }

  // Pas besoin d'envoyer de télémétrie - Socket.io surveille automatiquement
  log(`✅ Commande exécutée: ${currentPosition}`);
}

// -------- Connexion Socket.io sécurisée --------
function connect() {
  log(`🔗 Connexion au serveur ${SERVER_URL}...`);
  log(`📍 Module ID: ${MODULE_ID}`);
  log(`🔑 Password: ${MODULE_PASSWORD.substring(0, 8)}...`);

  socket = io(SERVER_URL, {
    transports: ['websocket'],
    timeout: 20000,
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => {
    log('🟢 Connecté au serveur WebSocket');

    // Authentification avec état initial
    const authPayload = createAuthenticatedPayload({
      type: 'Switch Track',
    });

    socket.emit('module_identify', authPayload);
    log(`📤 Authentification envoyée avec état initial: ${currentPosition}`);
  });

  socket.on('connected', data => {
    log('✅ Module authentifié:', data?.status || 'OK');
    if (data?.initialState) {
      log(`📍 État initial confirmé: ${data.initialState.position}`);
    }

    // Socket.io gère automatiquement les déconnexions - pas de télémétrie nécessaire
    log('🔗 Connexion établie - Socket.io surveille automatiquement');
  });

  socket.on('command', data => {
    if (data && data.command) {
      handleCommand(data.command);
    } else {
      log('⚠️ Commande reçue sans payload valide:', data);
    }
  });

  socket.on('disconnect', reason => {
    // En réalité, l'ESP32 ne peut pas notifier sa déconnexion (coupure courant/wifi)
    // Socket.io gère automatiquement la détection de déconnexion
  });

  socket.on('connect_error', error => {
    log('❌ Erreur de connexion:', error.message);
  });

  socket.on('error', error => {
    log('❌ Erreur socket:', error);
  });
}

// -------- Démarrage --------
function main() {
  log('🚀 Simulateur Switch Track démarrant...');
  log(`📡 Type: Switch Track`);
  log(`🆔 Module ID: ${MODULE_ID}`);
  log(`📍 Position initiale: ${currentPosition}`);
  log(`🌐 Serveur: ${SERVER_URL}`);

  // Connexion au serveur
  connect();

  // Pas de simulation d'activité - l'ESP32 réel n'a pas de bouton physique
}

// -------- Arrêt propre --------
function shutdown(signal) {
  // En réalité, l'ESP32 s'arrête brutalement (coupure courant)
  // Pas de log de déconnexion - simulation réaliste

  if (socket) {
    socket.disconnect();
  }

  process.exit(0);
}

// -------- Gestion des signaux système --------
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Gestion des erreurs non capturées
process.on('uncaughtException', error => {
  // ESP32 en panne - arrêt brutal sans log
  shutdown('ERROR');
});

process.on('unhandledRejection', (reason, promise) => {
  // ESP32 en panne - arrêt brutal sans log
  shutdown('ERROR');
});

// -------- Point d'entrée --------
main();

log('✅ Simulateur Switch Track prêt! Ctrl+C pour arrêter.');
