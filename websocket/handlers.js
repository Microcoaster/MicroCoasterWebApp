const databaseManager = require('../bdd/DatabaseManager');
const Logger = require('../utils/logger');

// Helper pour accéder à l'API RealTime
function getRealTimeAPI(socket) {
  // Essayer socket.server.app.locals puis socket.nsp.server.app.locals
  const api = socket.server?.app?.locals?.realTimeAPI || socket.nsp?.server?.app?.locals?.realTimeAPI;
  if (!api) {
    console.warn('⚠️ [DEBUG] RealTimeAPI not found. Checking paths:', {
      hasServer: !!socket.server,
      hasServerApp: !!socket.server?.app,
      hasServerAppLocals: !!socket.server?.app?.locals,
      hasNsp: !!socket.nsp,
      hasNspServer: !!socket.nsp?.server,
      hasNspServerApp: !!socket.nsp?.server?.app,
      serverAppKeys: socket.server?.app ? Object.keys(socket.server.app) : 'no server.app',
      nspServerKeys: socket.nsp?.server ? Object.keys(socket.nsp.server) : 'no nsp.server'
    });
  }
  return api;
}

// Maps pour stocker les connexions actives (adaptées du serveur WebSocket original)
const connectedClients = new Map(); // socket.id -> client info
const connectedModules = new Map(); // socket.id -> module info
const espById = new Map(); // moduleId -> socket (ESP)
const webByCode = new Map(); // code -> Set<socket> (dashboards)
const codeByModuleId = new Map(); // moduleId -> code (après "claim" par le web)

/* ===================== Helpers log (portés du serveur original) ===================== */
function redact(val) {
  const secretKeys = new Set(['code', 'module_code', 'password', 'pwd', 'token']);
  if (Array.isArray(val)) return val.map(redact);
  if (val && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = secretKeys.has(k) ? '***' : redact(v);
    }
    return out;
  }
  return val;
}

function who(socket, session = null) {
  const parts = [];
  if (session && session.user_id) {
    parts.push('web');
    parts.push(`code=${session.code || '?'}`);
  } else if (socket.moduleId) {
    parts.push('esp');
    parts.push(`mid=${socket.moduleId}`);
  } else {
    parts.push('unknown');
  }
  return parts.join(' ');
}

function logRx(socket, event, data, session = null) {
  try {
    Logger.info(
      `[RX] ${who(socket, session)} ${event}\n${JSON.stringify(redact(data), null, 2)}\n`
    );
  } catch (error) {
    Logger.error('Erreur lors du logging RX:', error);
  }
}

function logTx(socket, event, data, session = null) {
  try {
    Logger.info(
      `[TX] ${who(socket, session)} ${event}\n${JSON.stringify(redact(data), null, 2)}\n`
    );
  } catch (error) {
    Logger.error('Erreur lors du logging TX:', error);
  }
}

function broadcastToWeb(code, event, data) {
  const set = webByCode.get(code);
  if (!set) return;
  for (const socket of set) {
    logTx(socket, event, data);
    socket.emit(event, data);
  }
}

module.exports = function (io) {
  Logger.info('🔌 WebSocket handler initialized (Socket.io)');

  io.on('connection', socket => {
    const session = socket.request.session;

    // Si l'utilisateur est authentifié (client web)
    if (session && session.user_id) {
      handleClientConnection(socket, session);
    } else {
      // Sinon c'est probablement un module ESP32
      handleModuleConnection(socket);
    }
  });

  // Gestionnaire pour les clients web (interfaces utilisateur)
  async function handleClientConnection(socket, session) {
    const userId = session.user_id;
    const userName = session.nickname || 'User';
    const userCode = session.code;

    Logger.info(`👤 Client connected: ${userName} (ID: ${userId}, Code: ${userCode})`);

    // Enregistrer le client web
    connectedClients.set(socket.id, {
      socket,
      userId,
      userName,
      userCode,
      connectedAt: new Date(),
    });

    // Ajouter au registre par code
    if (!webByCode.has(userCode)) webByCode.set(userCode, new Set());
    webByCode.get(userCode).add(socket);

    // 📡 NOUVEAU: Enregistrer avec l'EventsManager pour les événements temps réel
    const realTimeAPI = getRealTimeAPI(socket);
    const userType = session.is_admin ? 'admin' : 'user'; // Détecter si l'utilisateur est admin
    if (realTimeAPI) {
      // Par défaut on ne connaît pas la page, on va attendre que le client nous le dise
      realTimeAPI.events.registerClient(socket, userId, userType, 'unknown');
      console.log('📡 [DEBUG] Client registered with EventsManager:', socket.id, 'Type:', userType);
    }

    // Écouter l'enregistrement de page par le client
    socket.on('register_page', (data) => {
      const page = data?.page || 'unknown';
      console.log('📡 [DEBUG] Client registering page:', page, 'for socket:', socket.id);
      
      if (realTimeAPI) {
        realTimeAPI.events.registerClient(socket, userId, userType, page);
      }
    });

    // 🔄 NOUVEAU: Récupérer les modules depuis la base de données
    try {
      const userModules = await databaseManager.modules.findByUserId(userId);
      Logger.info(`📋 User ${userName} has ${userModules.length} modules in database`);

      // Auto-claim tous les modules de l'utilisateur
      for (const module of userModules) {
        const moduleId = module.module_id;
        codeByModuleId.set(moduleId, userCode);
        Logger.info(`🔗 Auto-claimed module: ${moduleId} for user ${userCode}`);
      }
    } catch (error) {
      Logger.error('Error loading user modules:', error);
    }

    // Renvoyer la présence connue des modules déjà "claimés" par ce code
    const moduleStates = [];
    for (const [mid, c] of codeByModuleId.entries()) {
      if (c === userCode) {
        const online = espById.has(mid);
        moduleStates.push({ moduleId: mid, online, lastSeen: new Date() });
        socket.emit('module_presence', { moduleId: mid, online });
      }
    }

    socket.emit('modules_state', moduleStates);
    logTx(socket, 'modules_state', moduleStates, session);

    // ===== WEB -> CLAIM ===== (automatique pour tous les modules visibles)
    socket.on('module_claim', data => {
      logRx(socket, 'module_claim', data, session);
      const mid = String(data.moduleId || '').trim();
      if (!mid) return socket.emit('error', { message: 'missing_moduleId' });

      codeByModuleId.set(mid, userCode);
      socket.emit('claim_ack', { moduleId: mid, code: userCode });

      // Push présence immédiate
      const online = espById.has(mid);
      broadcastToWeb(userCode, 'module_presence', { moduleId: mid, online });
    });

    // ===== WEB -> COMMAND ===== (gestion des commandes vers les modules)
    socket.on('module_command', data => {
      logRx(socket, 'module_command', data, session);
      handleModuleCommand(socket, data, session);
    });

    // Nettoyage à la déconnexion
    socket.on('disconnect', () => {
      Logger.info(`👤 Client disconnected: ${userName}`);
      connectedClients.delete(socket.id);

      // 📡 NOUVEAU: Désinscrire de l'EventsManager
      if (realTimeAPI) {
        realTimeAPI.events.unregisterClient(socket.id);
        console.log('📡 [DEBUG] Client unregistered from EventsManager:', socket.id);
      }

      // Supprimer du registre par code
      const set = webByCode.get(userCode);
      if (set) {
        set.delete(socket);
        if (set.size === 0) webByCode.delete(userCode);
      }
    });
  }

  // Gestionnaire pour les modules ESP32
  function handleModuleConnection(socket) {
    Logger.info(`🤖 Module attempting connection: ${socket.id}`);

    // ===== ESP -> REGISTER ===== (le module doit s'identifier)
    socket.on('module_identify', data => {
      logRx(socket, 'module_identify', data);
      const { moduleId, type } = data;

      if (!moduleId) {
        socket.emit('error', { message: 'Module ID required' });
        return socket.disconnect();
      }

      Logger.info(`🤖 Module identified: ${moduleId} (${type || 'Unknown'})`);

      // Remplacer ancienne session si reconnect
      const prev = espById.get(moduleId);
      if (prev && prev !== socket) {
        try {
          prev.disconnect();
        } catch (error) {
          Logger.error('Erreur lors de la déconnexion du socket précédent:', error);
        }
      }

      // Enregistrer le module
      socket.moduleId = moduleId;
      socket.moduleType = type || 'Unknown';
      connectedModules.set(socket.id, {
        socket,
        moduleId,
        type: type || 'Unknown',
        connectedAt: new Date(),
      });
      espById.set(moduleId, socket);

      // Mettre à jour le statut en cache
      databaseManager.modules.updateStatus(moduleId, 'online').catch(Logger.error);

  // Émettre événement temps réel : module en ligne
  const realTimeAPI = getRealTimeAPI(socket);
  if (realTimeAPI) {
    console.log('📡 [DEBUG] Emitting module online event for:', socket.moduleId);
    realTimeAPI.emitModuleOnline(socket.moduleId, {
      type: socket.moduleType,
      lastSeen: new Date()
    });
  } else {
    console.warn('⚠️ [DEBUG] RealTimeAPI not available for module online event');
  }      // Si déjà claimé par un dashboard, annoncer présence
      const c = codeByModuleId.get(moduleId);
      if (c) {
        broadcastToWeb(c, 'module_online', {
          moduleId,
          type,
          timestamp: new Date(),
        });
      }

      socket.emit('connected', { message: 'Module registered successfully' });
      logTx(socket, 'connected', { message: 'Module registered successfully' });
    });

    // ===== ESP -> TELEMETRY ===== (télémétrie depuis les modules)
    socket.on('telemetry', data => {
      if (!socket.moduleId) return;
      const c = codeByModuleId.get(socket.moduleId);
      if (!c) return; // pas encore claimé par un web -> on ignore

      logRx(socket, 'telemetry', data);
      
      // Émettre événement temps réel : télémétrie mise à jour
      const realTimeAPI = getRealTimeAPI(socket);
      if (realTimeAPI) {
        realTimeAPI.emitTelemetryUpdate(socket.moduleId, data);
      }
      
      broadcastToWeb(c, 'module_telemetry', {
        moduleId: socket.moduleId,
        ...data,
      });
    });

    // Nettoyage à la déconnexion
    socket.on('disconnect', () => {
      if (socket.moduleId) {
        Logger.info(`🤖 Module disconnected: ${socket.moduleId}`);

        espById.delete(socket.moduleId);
        connectedModules.delete(socket.id);

        // Mettre à jour le statut en cache
        databaseManager.modules.updateStatus(socket.moduleId, 'offline').catch(Logger.error);

        // Émettre événement temps réel : module offline
        const realTimeAPI = getRealTimeAPI(socket);
        if (realTimeAPI) {
          console.log('📡 [DEBUG] Emitting module offline event for:', socket.moduleId);
          realTimeAPI.emitModuleOffline(socket.moduleId, {
            moduleType: socket.moduleType || 'Unknown',
            timestamp: new Date(),
          });
        } else {
          console.warn('⚠️ [DEBUG] RealTimeAPI not available for module offline event');
        }

        // Notifier les clients web
        const c = codeByModuleId.get(socket.moduleId);
        if (c) {
          broadcastToWeb(c, 'module_offline', {
            moduleId: socket.moduleId,
            timestamp: new Date(),
          });
        }
      }
    });
  }

  // ===== WEB -> COMMAND ===== (gestion des commandes vers les modules)
  function handleModuleCommand(clientSocket, data, session) {
    const { moduleId, command, params } = data;

    if (!moduleId || !command) {
      return clientSocket.emit('command_error', {
        message: 'Module ID and command required',
      });
    }

    Logger.info(`📡 Command from user ${session.user_id}: ${command} -> ${moduleId}`, params);

    // Trouver le module cible dans le registre ESP
    const targetSocket = espById.get(moduleId);
    if (!targetSocket) {
      return clientSocket.emit('command_error', {
        message: `Module ${moduleId} not online`,
      });
    }

    // Vérifier les permissions (si le module a déjà un code associé)
    const targetCode = codeByModuleId.get(moduleId);
    if (targetCode && targetCode !== session.code) {
      return clientSocket.emit('command_error', {
        message: 'Forbidden for this access code',
      });
    }

    // Envoyer la commande au module ESP32
    const commandPayload = {
      type: 'command',
      payload: { command, params: params || {} },
    };

    logTx(targetSocket, 'command', commandPayload);
    targetSocket.emit('command', commandPayload);

    // Confirmer au client web
    clientSocket.emit('command_sent', {
      moduleId,
      command,
      timestamp: new Date(),
    });
    logTx(clientSocket, 'command_sent', { moduleId, command });
  }

  // Debug endpoint pour voir les connexions actives
  setInterval(() => {
    Logger.info(
      `📊 Connected - Clients: ${connectedClients.size}, Modules: ${connectedModules.size}, ESP: ${espById.size}`
    );
  }, 30000); // Toutes les 30 secondes
};
