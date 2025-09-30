/**
 * ================================================================================
 * MICROCOASTER WEBAPP - GESTIONNAIRES WEBSOCKET
 * ================================================================================
 * 
 * @description Gestionnaires des connexions WebSocket pour les clients web (Socket.IO)
 * @author Équipe MicroCoaster
 * @version 2.0
 * 
 * Fonctionnalités :
 * - Gestion des connexions clients web via Socket.IO
 * - Authentification et enregistrement des clients
 * - Synchronisation des états de modules en temps réel
 * - Passerelle vers les modules ESP32 via WebSocket natif
 * - Gestion des commandes utilisateur vers les modules
 * - Statistiques et monitoring des connexions
 * 
 * Note : Les modules ESP32 utilisent WebSocket natif (esp-server.js),
 *        ce fichier gère uniquement les clients web.
 * 
 * Dépendances :
 * - DatabaseManager (accès aux données des modules)
 * - Logger (journalisation des opérations)
 * - EventsManager (via RealTimeAPI)
 * - ModuleEvents (via RealTimeAPI)
 * 
 * ================================================================================
 */

const databaseManager = require('../bdd/DatabaseManager');
const Logger = require('../utils/logger');

/**
 * Récupère l'instance RealTimeAPI depuis le socket
 * @param {Socket} socket - Socket Socket.IO
 * @returns {Object|null} Instance RealTimeAPI ou null si non trouvée
 */
function getRealTimeAPI(socket) {
  const api =
    socket.server?.app?.locals?.realTimeAPI || socket.nsp?.server?.app?.locals?.realTimeAPI;
  if (!api) {
    Logger.app.warn('RealTimeAPI introuvable - fonctionnalités WebSocket limitées');
  }
  return api;
}

/**
 * Map des modules revendiqués par code utilisateur
 * @type {Map<string, string>} moduleId -> userCode
 */
const codeByModuleId = new Map();

/**
 * Masque les données sensibles pour les logs
 * @param {*} val - Valeur à masquer
 * @returns {*} Valeur avec données sensibles masquées
 */
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

/**
 * Identifie le type de connexion pour les logs
 * @param {Socket} socket - Socket de connexion
 * @param {Object} [session=null] - Session utilisateur si applicable
 * @returns {string} Identifiant de connexion pour les logs
 */
function who(socket, session = null) {
  const parts = [];
  if (session && session.user_id) {
    parts.push('web');
    const code = session.code || `USER-${session.user_id}`;
    parts.push(`code=${code}`);
  } else if (socket.moduleId) {
    parts.push('esp');
    parts.push(`mid=${socket.moduleId}`);
  } else {
    parts.push('unknown');
  }
  return parts.join(' ');
}

/**
 * Log des événements reçus (RX)
 * @param {Socket} socket - Socket de connexion
 * @param {string} event - Nom de l'événement
 * @param {*} data - Données reçues
 * @param {Object} [session=null] - Session utilisateur
 */
function logRx(socket, event, data, session = null) {
  try {
    if (event === 'telemetry') {
      Logger.esp.debug(`[RX] ${who(socket, session)} ${event}`, { data: redact(data) });
    } else {
      if (who(socket, session).includes('unknown')) {
        Logger.esp.info(`[RX] ${who(socket, session)} ${event}`);
      } else {
        Logger.modules.info(`[RX] ${who(socket, session)} ${event}`);
      }
      Logger.modules.debug(`[RX] ${who(socket, session)} ${event}`, { data: redact(data) });
    }
  } catch (error) {
    Logger.app.error('Erreur lors du logging RX :', error);
  }
}

/**
 * Log des événements émis (TX)
 * @param {Socket} socket - Socket de connexion
 * @param {string} event - Nom de l'événement
 * @param {*} data - Données émises
 * @param {Object} [session=null] - Session utilisateur
 */
function logTx(socket, event, data, session = null) {
  try {
    if (event.includes('telemetry') || event.includes('module_telemetry')) {
      Logger.esp.debug(`[TX] ${who(socket, session)} ${event}`, { data: redact(data) });
    } else if (event === 'modules_state' || event === 'module_presence') {
      Logger.modules.debug(`[TX] ${who(socket, session)} ${event}`);
    } else {
      if (
        who(socket, session).includes('esp') ||
        event.includes('esp') ||
        who(socket, session).includes('MC-')
      ) {
        Logger.esp.info(`[TX] ${who(socket, session)} ${event}`);
      } else {
        Logger.modules.info(`[TX] ${who(socket, session)} ${event}`);
      }
      Logger.modules.debug(`[TX] ${who(socket, session)} ${event}`, { data: redact(data) });
    }
  } catch (error) {
    Logger.app.error('Erreur lors du logging TX:', error);
  }
}

/**
 * Diffuse un événement aux clients web par code utilisateur
 * @param {Object} realTimeAPI - Instance RealTimeAPI
 * @param {string} userCode - Code utilisateur cible
 * @param {string} event - Nom de l'événement
 * @param {Object} data - Données à diffuser
 */
function broadcastToWebByCode(realTimeAPI, userCode, event, data) {
  if (!realTimeAPI?.events) return;

  const clients = Array.from(realTimeAPI.events.connectedClients.values()).filter(client => {
    const clientCode = `USER-${client.userId}`;
    return clientCode === userCode;
  });

  clients.forEach(client => {
    logTx(client.socket, event, data);
    client.socket.emit(event, data);
  });

  if (clients.length > 0) {
    Logger.system.debug(
      `Diffusion '${event}' vers ${clients.length} client(s) avec code ${userCode}`
    );
  }
}

/**
 * Récupère tous les sockets d'un utilisateur
 * @param {Object} realTimeAPI - Instance RealTimeAPI
 * @param {number} userId - Identifiant de l'utilisateur
 * @returns {Array} Liste des clients connectés pour cet utilisateur
 */
function getUserSockets(realTimeAPI, userId) {
  if (!realTimeAPI?.events) return [];

  return Array.from(realTimeAPI.events.connectedClients.values()).filter(
    client => client.userId === userId
  );
}

/**
 * Gestionnaire principal des connexions WebSocket pour les clients web
 * @param {SocketIO.Server} io - Serveur Socket.IO
 * @param {Object} socketWSBridge - Passerelle vers WebSocket natif ESP32
 * @exports {Function} Gestionnaire de connexions WebSocket
 */
module.exports = function (io, socketWSBridge) {
  Logger.app.info('🔌 Gestionnaire WebSocket initialisé (Socket.io pour Web uniquement)');

  /**
   * Gestionnaire de nouvelle connexion Socket.IO
   */
  io.on('connection', socket => {
    const session = socket.request.session;

    Logger.activity.debug(`Nouvelle connexion : ${socket.id}`, {
      hasSession: !!session,
      hasUserId: !!session?.user_id,
      sessionKeys: session ? Object.keys(session) : 'no session',
      userId: session?.user_id,
      nickname: session?.nickname,
    });

    // Si l'utilisateur est authentifié (client web)
    if (session && session.user_id) {
      handleClientConnection(socket, session);
    } else {
      Logger.esp.debug(
        `🔄 Connection without session - waiting for manual auth: ${socket.id}`
      );

      socket.on('client:authenticate', data => {
        Logger.activity.info(`🔐 Manual client authentication attempt: ${socket.id}`, data);

        if (!data.userId) {
          Logger.activity.warn(`❌ Échec authentification - pas d'userId : ${socket.id}`);
          socket.emit('client:auth:error', { message: 'User ID requis' });
          return;
        }

        const fakeSession = {
          user_id: data.userId,
          nickname: data.userName || `User${data.userId}`,
          is_admin: data.userType === 'admin',
          code: data.code || `USER-${data.userId}`,
        };

        Logger.activity.info(
          `✅ Traitement authentification manuelle pour utilisateur ${data.userId} (${data.userType})`
        );

        handleClientConnection(socket, fakeSession);
      });

      const clientTimeout = setTimeout(() => {
        Logger.activity.warn(`❌ Timeout connexion Socket.IO non authentifiée : ${socket.id}`);
        socket.disconnect();
      }, 10000);

      socket.once('client:authenticate', () => {
        clearTimeout(clientTimeout);
      });
    }

    socket.on('error', error => {
      Logger.app.error(`Erreur socket sur ${socket.id} :`, error);
    });
  });

  /**
   * Gestion d'une connexion client web authentifiée
   * @param {Socket} socket - Socket Socket.IO du client
   * @param {Object} session - Session utilisateur
   * @param {number} session.user_id - ID de l'utilisateur
   * @param {string} [session.nickname] - Nom d'utilisateur
   * @param {boolean} [session.is_admin] - Si l'utilisateur est admin
   * @param {string} [session.code] - Code utilisateur personnalisé
   */
  async function handleClientConnection(socket, session) {
    const userId = session.user_id;
    const userName = session.nickname || 'User';
    const userCode = session.code || `USER-${userId}`;

    Logger.activity.debug(`👤 ${userName} connected (ID: ${userId}, Code: ${userCode})`);

    const realTimeAPI = getRealTimeAPI(socket);
    const userType = session.is_admin ? 'admin' : 'user';

    socket.userData = { userId, userType, userName };

    if (realTimeAPI) {
      realTimeAPI.handleClientEvents(socket);

      realTimeAPI.events.registerClient(socket, userId, userType, 'unknown');
      socket.isRegisteredWithEventsManager = true;
      Logger.activity.debug(`Client auto-registered in EventsManager: ${socket.id} (${userType})`);
    }

    socket.on('request_stats', () => {
      const realTimeAPI = getRealTimeAPI(socket);
      if (realTimeAPI?.events && realTimeAPI?.modules) {
        const clientStats = realTimeAPI.events.getStats();
        const moduleStats = realTimeAPI.modules.getConnectionStats();

        const simpleStats = {
          users: { online: clientStats.uniqueUsers },
          modules: { online: moduleStats.connectedModules },
          timestamp: new Date(),
        };

        socket.emit('simple_stats_update', simpleStats);
        Logger.system.debug(
          `Stats sent to ${socket.id}: ${clientStats.uniqueUsers} users, ${moduleStats.connectedModules} modules`
        );
      }
    });

    socket.on('request_module_states', () => {
      const realTimeAPI = getRealTimeAPI(socket);
      
      if (realTimeAPI?.modules) {
        const moduleStates = realTimeAPI.modules.getCurrentStates();
        
        socket.emit('module_states_sync', {
          states: moduleStates,
          timestamp: new Date()
        });
      }
    });

    socket.on('register_page', data => {
      const page = data?.page || 'unknown';
      Logger.activity.debug('Client updating page', { page, socketId: socket.id });

      if (realTimeAPI && socket.isRegisteredWithEventsManager) {
        const client = realTimeAPI.events.connectedClients.get(socket.id);
        if (client) {
          client.page = page;
        }
      }
    });

    try {
      const userModules = await databaseManager.modules.findByUserId(userId);
      Logger.modules.debug(`📋 User ${userName} has ${userModules.length} modules in database`);

      const claimedModules = [];
      for (const module of userModules) {
        const moduleId = module.module_id;
        codeByModuleId.set(moduleId, userCode);
        claimedModules.push(moduleId);
        Logger.modules.debug(`🔗 Auto-claimed module: ${moduleId} for user ${userCode}`);
      }

      if (claimedModules.length > 0) {
        Logger.modules.debug(`🔗 Auto-claimed ${claimedModules.length} modules for ${userName}`);
      }
    } catch (error) {
      Logger.modules.error('Error loading user modules:', error);
    }

    const moduleStates = [];
    for (const [mid, c] of codeByModuleId.entries()) {
      if (c === userCode) {
        const realTimeAPI = getRealTimeAPI(socket);
        const online = realTimeAPI?.modules?.isModuleConnected(mid) || false;
        moduleStates.push({ moduleId: mid, online, lastSeen: new Date() });
      }
    }

    socket.on('send_module_command', data => {
      const { moduleId, command } = data;

      if (!moduleId || !command) {
        socket.emit('error', { message: 'moduleId et command requis' });
        return;
      }

      Logger.activity.info(`🎮 Command received from ${userName}: ${command} -> ${moduleId}`);

      const bridge = io.app?.locals?.socketWSBridge;
      if (bridge) {
        const success = bridge.handleWebCommand(socket, moduleId, command, data);

        if (success) {
          Logger.activity.info(`✅ Command transmitted via bridge: ${command} -> ${moduleId}`);
          socket.emit('command_sent', {
            moduleId,
            command,
            timestamp: new Date(),
          });
        } else {
          Logger.activity.warn(`🚫 Cannot send command to ${moduleId}: module not connected`);
          socket.emit('command_error', {
            moduleId,
            command,
            error: 'Module not connected via WebSocket',
          });
        }
      } else {
        Logger.activity.error('❌ WebSocket bridge not available');
        socket.emit('error', { message: 'Service WebSocket indisponible' });
      }
    });

    socket.on('module_claim', data => {
      logRx(socket, 'module_claim', data, session);
      const mid = String(data.moduleId || '').trim();
      if (!mid) return socket.emit('error', { message: 'missing_moduleId' });

      codeByModuleId.set(mid, userCode);
      socket.emit('claim_ack', { moduleId: mid, code: userCode });

      const realTimeAPI = getRealTimeAPI(socket);
      const online = realTimeAPI?.modules?.isModuleConnected(mid) || false;
      broadcastToWebByCode(realTimeAPI, userCode, 'module_presence', { moduleId: mid, online });
    });

    socket.on('disconnect', () => {
      Logger.activity.debug(`👤 ${userName} disconnected`);
    });
  }

  setInterval(() => {
    const realTimeAPI = io.sockets?.server?.app?.locals?.realTimeAPI;
    if (realTimeAPI?.events && realTimeAPI?.modules) {
      const clientStats = realTimeAPI.events.getStats();
      const moduleStats = realTimeAPI.modules.getConnectionStats();

      const currentStats = {
        users: clientStats.uniqueUsers,
        modules: moduleStats.connectedModules,
        clients: clientStats.total,
        esp: moduleStats.onlineModules,
      };

      Logger.system.statsIfChanged(
        `📊 Connected - ${clientStats.uniqueUsers} user(s), ${moduleStats.connectedModules} ESP module(s)`,
        currentStats
      );

      Logger.system.debug(
        `📊 Detailed stats - Users: ${clientStats.uniqueUsers}, Clients: ${clientStats.total}, ESP: ${moduleStats.connectedModules}, Modules DB: ${moduleStats.onlineModules}`
      );
    } else {
      Logger.system.info(`📊 Connected - (APIs unavailable)`);
    }
  }, 30000);
};
