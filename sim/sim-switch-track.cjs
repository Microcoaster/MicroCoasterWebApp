/**
 * ESP32 Switch Track Simulator - WebSocket Native
 * Compatible with new MicroCoaster hybrid architecture
 */

const WebSocket = require('ws');

// Configuration
const config = {
  serverUrl: process.env.SERVER_URL || 'ws://127.0.0.1:3000/esp32',
  moduleId: process.env.MODULE_ID || 'MC-0001-ST',
  modulePassword: process.env.MODULE_PASSWORD || 'F674iaRftVsHGKOA8hq3TI93HQHUaYqZ',
  telemetryInterval: 5000,
  heartbeatInterval: 30000,
  reconnectDelay: 3000,
  maxReconnectAttempts: 5,
};

// Module state
let moduleState = {
  position: 'left',
  isMoving: false,
  uptime: Date.now(),
  lastCommand: null,
  commandCount: 0,
  telemetryCount: 0,
  reconnectAttempts: 0,
};

let ws = null;
let telemetryTimer = null;
let heartbeatTimer = null;
let reconnectTimer = null;

// Utilities
const log = (...args) => {
  const timestamp = new Date().toISOString().substr(11, 8);
  console.log(`[${timestamp}] [SWITCH-TRACK]`, ...args);
};

const error = (...args) => {
  const timestamp = new Date().toISOString().substr(11, 8);
  console.error(`[${timestamp}] [SWITCH-TRACK] ❌`, ...args);
};

// Message handling
function createAuthenticatedMessage(type, data = {}) {
  return {
    type,
    moduleId: config.moduleId,
    password: config.modulePassword,
    timestamp: new Date().toISOString(),
    ...data,
  };
}

function sendMessage(type, data = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    error(`Cannot send ${type}: WebSocket not connected`);
    return false;
  }

  const message = createAuthenticatedMessage(type, data);

  try {
    ws.send(JSON.stringify(message));
    return true;
  } catch (err) {
    error(`Failed to send ${type}:`, err.message);
    return false;
  }
}

function sendTelemetry() {
  const uptimeSeconds = Math.floor((Date.now() - moduleState.uptime) / 1000);

  const telemetryData = {
    position: moduleState.position,
    isMoving: moduleState.isMoving,
    uptime: uptimeSeconds,
    commandCount: moduleState.commandCount,
    telemetryCount: ++moduleState.telemetryCount,
    freeHeap: Math.floor(Math.random() * 50000) + 200000,
    signalStrength: Math.floor(Math.random() * 30) - 70,
    temperature: Math.floor(Math.random() * 15) + 20,
  };

  if (sendMessage('telemetry', telemetryData)) {
    log(`📡 Télémétrie: position=${moduleState.position}, uptime=${uptimeSeconds}s`);
  }
}

function sendHeartbeat() {
  if (sendMessage('heartbeat', { status: 'alive' })) {
    log('💓 Heartbeat');
  }
}

// Hardware simulation
function simulateMovement(targetPosition) {
  if (moduleState.isMoving) {
    log(`⚠️ Mouvement en cours, commande ignorée`);
    return false;
  }

  if (moduleState.position === targetPosition) {
    log(`ℹ️ Déjà en position ${targetPosition}`);
    return true;
  }

  moduleState.isMoving = true;
  log(`🔄 Mouvement: ${moduleState.position} → ${targetPosition}`);

  const movementDuration = Math.floor(Math.random() * 1000) + 500;

  setTimeout(() => {
    moduleState.position = targetPosition;
    moduleState.isMoving = false;
    moduleState.lastCommand = targetPosition;
    moduleState.commandCount++;

    log(`✅ Mouvement terminé: ${targetPosition}`);

    sendMessage('command_response', {
      command: 'switch',
      position: targetPosition,
      success: true,
      duration: movementDuration,
    });
  }, movementDuration);

  return true;
}

// Command handling
function handleCommand(data) {
  log(`🎮 Commande:`, data);

  // Extraire la commande du format reçu
  const command = data.data ? data.data.command : data.command;

  switch (command) {
    case 'left':
    case 'switch_left':
      simulateMovement('left');
      break;
    case 'right':
    case 'switch_right':
      simulateMovement('right');
      break;
    case 'toggle':
      const newPosition = moduleState.position === 'left' ? 'right' : 'left';
      simulateMovement(newPosition);
      break;
    case 'get_status':
      sendMessage('status_response', {
        position: moduleState.position,
        isMoving: moduleState.isMoving,
        uptime: Math.floor((Date.now() - moduleState.uptime) / 1000),
        commandCount: moduleState.commandCount,
      });
      break;
    case 'reset':
      log('🔄 Reset...');
      moduleState.commandCount = 0;
      moduleState.telemetryCount = 0;
      moduleState.uptime = Date.now();
      sendMessage('reset_response', { success: true });
      break;
    default:
      log(`⚠️ Commande inconnue: ${command}`);
      sendMessage('command_error', {
        command: command,
        error: 'Unknown command',
      });
  }
}

// WebSocket connection
function handleMessage(rawData) {
  try {
    const data = JSON.parse(rawData);

    switch (data.type) {
      case 'auth_success':
        log('✅ Authentifié');
        startTelemetry();
        break;
      case 'auth_error':
        error('❌ Erreur auth:', data.message);
        break;
      case 'command':
        handleCommand(data);
        break;
      case 'ping':
        sendMessage('pong', { timestamp: data.timestamp });
        log('🏓 Ping reçu, pong envoyé');
        break;
      default:
        log(`📥 Message:`, data.type);
    }
  } catch (err) {
    error('Erreur parsing:', err.message);
  }
}

function startTelemetry() {
  telemetryTimer = setInterval(() => {
    sendTelemetry();
  }, config.telemetryInterval);

  heartbeatTimer = setInterval(() => {
    sendHeartbeat();
  }, config.heartbeatInterval);

  setTimeout(() => sendTelemetry(), 100);
  log(`📡 Télémétrie démarrée (${config.telemetryInterval}ms)`);
}

function stopTelemetry() {
  if (telemetryTimer) {
    clearInterval(telemetryTimer);
    telemetryTimer = null;
  }

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  log('📡 Télémétrie arrêtée');
}

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    log('⚠️ Déjà connecté');
    return;
  }

  log(`🔌 Connexion à ${config.serverUrl}...`);

  ws = new WebSocket(config.serverUrl);

  ws.on('open', () => {
    log('🔌 WebSocket connecté, authentification...');
    moduleState.reconnectAttempts = 0;

    sendMessage('module_identify', {
      moduleType: 'SwitchTrack',
      version: '2.1.0',
      features: ['switch', 'telemetry', 'remote_control'],
    });
  });

  ws.on('message', handleMessage);

  ws.on('close', (code, reason) => {
    log(`🔌 Connexion fermée (${code}): ${reason || 'Aucune raison'}`);
    stopTelemetry();
    attemptReconnect();
  });

  ws.on('error', err => {
    error('Erreur WebSocket:', err.message);
  });
}

function attemptReconnect() {
  if (moduleState.reconnectAttempts >= config.maxReconnectAttempts) {
    error(`Max tentatives atteint (${config.maxReconnectAttempts})`);
    process.exit(1);
  }

  moduleState.reconnectAttempts++;

  log(
    `🔄 Reconnexion ${moduleState.reconnectAttempts}/${config.maxReconnectAttempts} dans ${config.reconnectDelay}ms...`
  );

  reconnectTimer = setTimeout(() => {
    connect();
  }, config.reconnectDelay);
}

function disconnect() {
  log('🔌 Déconnexion...');

  stopTelemetry();

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (ws) {
    ws.close();
    ws = null;
  }
}

// Process management
function gracefulShutdown() {
  log('🛑 Arrêt du simulateur...');
  disconnect();
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

process.on('uncaughtException', err => {
  error('Exception:', err);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  error('Promesse rejetée:', reason);
});

// Main function
function startSimulator() {
  log('🚀 Démarrage simulateur ESP32 Switch Track');
  log(`📍 Module: ${config.moduleId}`);
  log(`🔗 Serveur: ${config.serverUrl}`);
  log(`📍 Position initiale: ${moduleState.position}`);

  connect();
}

// Entry point
if (require.main === module) {
  startSimulator();
}

module.exports = {
  startSimulator,
  disconnect,
  moduleState,
  config,
};
