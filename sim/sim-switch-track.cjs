// sim-switch-track.cjs - Simulateur ESP32 Switch Track sécurisé
/* eslint-disable no-console */
const { io } = require('socket.io-client');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://127.0.0.1:3000';
const MODULE_ID = process.env.MODULE_ID || 'MC-0001-ST';
const MODULE_PASSWORD = process.env.MODULE_PASSWORD || 'F674iaRftVsHGKOA8hq3TI93HQHUaYqZ';

let socket;
const uptimeStart = Date.now();
let heartbeatInterval = null;
let currentPosition = "left"; // Position initiale
let lastSentPosition = null; // Pour éviter le spam de télémétrie

// -------- Helpers --------
const log = (...args) => console.log('[SWITCH TRACK]', ...args);

// -------- Télémétrie sécurisée --------
function createAuthenticatedPayload(additionalData = {}) {
  return {
    moduleId: MODULE_ID,
    password: MODULE_PASSWORD,
    uptime: Date.now() - uptimeStart,
    position: currentPosition,
    ...additionalData
  };
}

function sendTelemetry(force = false) {
  if (!socket || !socket.connected) return;

  // Éviter le spam - n'envoyer que si l'état a changé ou si c'est forcé
  if (!force && lastSentPosition === currentPosition) {
    return;
  }

  const payload = createAuthenticatedPayload();
  socket.emit('telemetry', payload);
  lastSentPosition = currentPosition;
  log(`💓 Télémétrie envoyée: ${currentPosition}`);
}

// -------- Gestion des commandes --------
function handleCommand(cmd) {
  log(`📡 Commande reçue: ${cmd}`);

  switch (cmd) {
    case 'switch_left':
    case 'left':
      currentPosition = "left";
      log('🔄 Aiguillage basculé vers la GAUCHE');
      break;
    case 'switch_right':
    case 'right':
      currentPosition = "right";
      log('🔄 Aiguillage basculé vers la DROITE');
      break;
    default:
      log(`⚠️ Commande inconnue: ${cmd}`);
      return;
  }

  // Réponse immédiate avec authentification
  sendTelemetry(true); // Forcer l'envoi
  log(`✅ Nouvel état envoyé: ${currentPosition}`);
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
      type: "Switch Track"
    });
    
    socket.emit('module_identify', authPayload);
    log(`📤 Authentification envoyée avec état initial: ${currentPosition}`);
  });

  socket.on('connected', (data) => {
    log('✅ Module authentifié:', data?.status || 'OK');
    if (data?.initialState) {
      log(`📍 État initial confirmé: ${data.initialState.position}`);
    }
    
    // Envoyer la télémétrie initiale
    sendTelemetry(true);
    
    // Démarrer le heartbeat toutes les 10 secondes
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
      // Heartbeat périodique - envoyer même si pas de changement
      const payload = createAuthenticatedPayload();
      socket.emit('telemetry', payload);
      log(`💓 Heartbeat télémétrie: ${currentPosition}`);
    }, 10000);
    
    log('💓 Heartbeat démarré (10s)');
  });

  socket.on('command', (data) => {
    if (data && data.command) {
      handleCommand(data.command);
    } else {
      log('⚠️ Commande reçue sans payload valide:', data);
    }
  });

  socket.on('disconnect', (reason) => {
    // En réalité, l'ESP32 ne peut pas notifier sa déconnexion (coupure courant/wifi)
    // On nettoie juste silencieusement les timers
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  });

  socket.on('connect_error', (error) => {
    log('❌ Erreur de connexion:', error.message);
  });

  socket.on('error', (error) => {
    log('❌ Erreur socket:', error);
  });
}

// -------- Simulation d'activité physique --------
function simulatePhysicalActivity() {
  // Simulation légère d'activité pour les tests
  if (Math.random() > 0.50) { // 50% de chance toutes les 30s
    const newPosition = currentPosition === "left" ? "right" : "left";
    log(`🔧 Simulation: Aiguillage manuel vers ${newPosition}`);
    currentPosition = newPosition;
    
    // Envoyer la mise à jour
    if (socket && socket.connected) {
      sendTelemetry(true);
    }
  }
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
  
  // Simulation d'activité toutes les 30 secondes
  setInterval(simulatePhysicalActivity, 30000);
}

// -------- Arrêt propre --------
function shutdown(signal) {
  // En réalité, l'ESP32 s'arrête brutalement (coupure courant)
  // Pas de log de déconnexion - simulation réaliste
  
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  
  if (socket) {
    socket.disconnect();
  }
  
  process.exit(0);
}

// -------- Gestion des signaux système --------
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
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