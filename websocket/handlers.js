const databaseManager = require('../bdd/DatabaseManager');
const Logger = require('../utils/logger');

// Helper pour accéder à l'API RealTime
function getRealTimeAPI(socket) {
  // Essayer socket.server.app.locals puis socket.nsp.server.app.locals
  const api =
    socket.server?.app?.locals?.realTimeAPI || socket.nsp?.server?.app?.locals?.realTimeAPI;
  if (!api) {
    Logger.app.warn('RealTimeAPI not found - WebSocket functionality may be limited');
    Logger.app.debug('RealTimeAPI debug info', {
      hasServer: !!socket.server,
      hasServerApp: !!socket.server?.app,
      hasServerAppLocals: !!socket.server?.app?.locals,
      hasNsp: !!socket.nsp,
      hasNspServer: !!socket.nsp?.server,
      hasNspServerApp: !!socket.nsp?.server?.app,
      serverAppKeys: socket.server?.app ? Object.keys(socket.server.app) : 'no server.app',
      nspServerKeys: socket.nsp?.server ? Object.keys(socket.nsp.server) : 'no nsp.server',
    });
  }
  return api;
}

// Maps pour stocker les connexions actives (adaptées du serveur WebSocket original)
// connectedClients géré par EventsManager
// Maps pour la gestion des claims web -> modules
const codeByModuleId = new Map(); // moduleId -> code (après "claim" par le web)

// ===== AUTHENTIFICATION ESP SUPPRIMÉE =====
// Les modules ESP32 n'utilisent plus Socket.IO - voir websocket/esp-server.js

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

function logRx(socket, event, data, session = null) {
  try {
    // Éviter le spam télémétrie en console
    if (event === 'telemetry') {
      Logger.esp.debug(`[RX] ${who(socket, session)} ${event}`, { data: redact(data) });
    } else {
      // Si c'est un module ESP, utiliser le logger ESP
      if (who(socket, session).includes('unknown')) {
        Logger.esp.info(`[RX] ${who(socket, session)} ${event}`);
      } else {
        Logger.modules.info(`[RX] ${who(socket, session)} ${event}`);
      }
      Logger.modules.debug(`[RX] ${who(socket, session)} ${event}`, { data: redact(data) });
    }
  } catch (error) {
    Logger.app.error('Erreur lors du logging RX:', error);
  }
}

function logTx(socket, event, data, session = null) {
  try {
    // Éviter le spam télémétrie et événements fréquents en console
    if (event.includes('telemetry') || event.includes('module_telemetry')) {
      Logger.esp.debug(`[TX] ${who(socket, session)} ${event}`, { data: redact(data) });
    } else if (event === 'modules_state' || event === 'module_presence') {
      Logger.modules.debug(`[TX] ${who(socket, session)} ${event}`); // Événements fréquents en debug
    } else {
      // Si c'est une transmission vers un module ESP, utiliser le logger ESP
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

function broadcastToWebByCode(realTimeAPI, userCode, event, data) {
  if (!realTimeAPI?.events) return;

  // Trouver tous les clients avec le code utilisateur donné
  const clients = Array.from(realTimeAPI.events.connectedClients.values()).filter(client => {
    // Générer le code pour ce client
    const clientCode = `USER-${client.userId}`;
    return clientCode === userCode;
  });

  clients.forEach(client => {
    logTx(client.socket, event, data);
    client.socket.emit(event, data);
  });

  if (clients.length > 0) {
    Logger.system.debug(
      `Broadcasted '${event}' to ${clients.length} client(s) with code ${userCode}`
    );
  }
}

function getUserSockets(realTimeAPI, userId) {
  if (!realTimeAPI?.events) return [];

  return Array.from(realTimeAPI.events.connectedClients.values()).filter(
    client => client.userId === userId
  );
}

module.exports = function (io, socketWSBridge) {
  Logger.app.info('🔌 WebSocket handler initialized (Socket.io for Web only)');

  io.on('connection', socket => {
    const session = socket.request.session;

    Logger.activity.debug(`New connection: ${socket.id}`, {
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
        `🔄 Connection without session - waiting for manual auth or module identification: ${socket.id}`
      );

      // Écouter l'authentification manuelle du client (prioritaire)
      socket.on('client:authenticate', data => {
        Logger.activity.info(`🔐 Manual client authentication attempt: ${socket.id}`, data);

        if (!data.userId) {
          Logger.activity.warn(`❌ Authentication failed - no userId: ${socket.id}`);
          socket.emit('client:auth:error', { message: 'User ID required' });
          return;
        }

        // Créer une session fictive pour le traitement
        const fakeSession = {
          user_id: data.userId,
          nickname: data.userName || `User${data.userId}`,
          is_admin: data.userType === 'admin',
          code: data.code || `USER-${data.userId}`,
        };

        Logger.activity.info(
          `✅ Processing manual authentication for user ${data.userId} (${data.userType})`
        );



        // Rediriger vers le handler client
        handleClientConnection(socket, fakeSession);
      });

      // Les ESP32 n'utilisent plus Socket.IO - seuls les clients web se connectent ici
      // Si aucune authentification client, déconnecter après timeout
      const clientTimeout = setTimeout(() => {
        Logger.activity.warn(`❌ Unauthenticated Socket.IO connection timeout: ${socket.id}`);
        socket.disconnect();
      }, 10000);

      // Nettoyer le timeout si authentification client reçue
      socket.once('client:authenticate', () => {
        clearTimeout(clientTimeout);
      });
    }

    // Gestion générale des erreurs de socket
    socket.on('error', error => {
      Logger.app.error(`Socket error on ${socket.id}:`, error);
    });
  });

  // Gestionnaire pour les clients web (interfaces utilisateur)
  async function handleClientConnection(socket, session) {
    const userId = session.user_id;
    const userName = session.nickname || 'User';
    const userCode = session.code || `USER-${userId}`; // Générer un code par défaut si undefined

    Logger.activity.debug(`👤 ${userName} connected (ID: ${userId}, Code: ${userCode})`);

    // 📡 NOUVEAU: Enregistrer avec l'EventsManager pour les événements temps réel
    const realTimeAPI = getRealTimeAPI(socket);
    const userType = session.is_admin ? 'admin' : 'user'; // Détecter si l'utilisateur est admin

    // Stocker les informations utilisateur pour utilisation ultérieure
    socket.userData = { userId, userType, userName };

    // Configurer les événements de l'API temps réel pour ce socket
    if (realTimeAPI) {
      realTimeAPI.handleClientEvents(socket);

      // FORCER l'enregistrement immédiat pour éviter d'attendre client:authenticate
      // Ceci corrige le bug des statistiques incorrectes
      realTimeAPI.events.registerClient(socket, userId, userType, 'unknown');
      socket.isRegisteredWithEventsManager = true;
      Logger.activity.debug(`Client auto-registered in EventsManager: ${socket.id} (${userType})`);

      // Stats désormais à la demande via 'request_stats'
    }

    // Gestionnaire de demande de stats (ton approche simple et efficace)
    socket.on('request_stats', () => {
      const realTimeAPI = getRealTimeAPI(socket);
      if (realTimeAPI?.events && realTimeAPI?.modules) {
        const clientStats = realTimeAPI.events.getStats();
        const moduleStats = realTimeAPI.modules.getConnectionStats();

        // Format simple et direct, comme le log qui fonctionne
        const simpleStats = {
          users: { online: clientStats.uniqueUsers },
          modules: { online: moduleStats.connectedModules },
          timestamp: new Date(),
        };

        socket.emit('simple_stats_update', simpleStats);
        Logger.system.debug(
          `Stats envoyées à ${socket.id}: ${clientStats.uniqueUsers} utilisateurs, ${moduleStats.connectedModules} modules`
        );
      }
    });

    // Gestionnaire pour synchronisation initiale des modules (page modules)
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

    // Écouter l'enregistrement de page par le client (pour mettre à jour la page)
    socket.on('register_page', data => {
      const page = data?.page || 'unknown';
      Logger.activity.debug('Client updating page', { page, socketId: socket.id });

      if (realTimeAPI && socket.isRegisteredWithEventsManager) {
        // Mettre à jour la page dans EventsManager
        const client = realTimeAPI.events.connectedClients.get(socket.id);
        if (client) {
          client.page = page;
        }
      }
    });

    // 🔄 NOUVEAU: Récupérer les modules depuis la base de données
    try {
      const userModules = await databaseManager.modules.findByUserId(userId);
      Logger.modules.debug(`📋 User ${userName} has ${userModules.length} modules in database`);

      // Auto-claim tous les modules de l'utilisateur
      const claimedModules = [];
      for (const module of userModules) {
        const moduleId = module.module_id;
        codeByModuleId.set(moduleId, userCode);
        claimedModules.push(moduleId);
        Logger.modules.debug(`🔗 Auto-claimed module: ${moduleId} for user ${userCode}`);
      }

      // Log dans fichier pour debug navigation
      if (claimedModules.length > 0) {
        Logger.modules.debug(`🔗 Auto-claimed ${claimedModules.length} modules for ${userName}`);
      }
    } catch (error) {
      Logger.modules.error('Error loading user modules:', error);
    }

    // Renvoyer la présence connue des modules déjà "claimés" par ce code
    const moduleStates = [];
    for (const [mid, c] of codeByModuleId.entries()) {
      if (c === userCode) {
        const realTimeAPI = getRealTimeAPI(socket);
        const online = realTimeAPI?.modules?.isModuleConnected(mid) || false;
        moduleStates.push({ moduleId: mid, online, lastSeen: new Date() });

      }
    }

    // ===== WEB -> ESP COMMANDES VIA BRIDGE =====
    socket.on('send_module_command', data => {
      const { moduleId, command } = data;

      if (!moduleId || !command) {
        socket.emit('error', { message: 'moduleId et command requis' });
        return;
      }

      Logger.activity.info(`🎮 Commande reçue de ${userName}: ${command} -> ${moduleId}`);

      // NOUVEAU: Utiliser le bridge pour envoyer vers ESP32 WebSocket natif
      const bridge = io.app?.locals?.socketWSBridge;
      if (bridge) {
        const success = bridge.handleWebCommand(socket, moduleId, command, data);

        if (success) {
          Logger.activity.info(`✅ Commande transmise via bridge: ${command} -> ${moduleId}`);
          socket.emit('command_sent', {
            moduleId,
            command,
            timestamp: new Date(),
          });
        } else {
          Logger.activity.warn(`🚫 Impossible d'envoyer commande à ${moduleId}: module non connecté`);
          socket.emit('command_error', {
            moduleId,
            command,
            error: 'Module not connected via WebSocket',
          });
        }
      } else {
        Logger.activity.error('❌ Bridge WebSocket non disponible');
        socket.emit('error', { message: 'Service WebSocket indisponible' });
      }
    });

    socket.on('module_claim', data => {
      logRx(socket, 'module_claim', data, session);
      const mid = String(data.moduleId || '').trim();
      if (!mid) return socket.emit('error', { message: 'missing_moduleId' });

      codeByModuleId.set(mid, userCode);
      socket.emit('claim_ack', { moduleId: mid, code: userCode });

      // Push présence immédiate
      const realTimeAPI = getRealTimeAPI(socket);
      const online = realTimeAPI?.modules?.isModuleConnected(mid) || false;
      broadcastToWebByCode(realTimeAPI, userCode, 'module_presence', { moduleId: mid, online });
    });

    // Nettoyage à la déconnexion
    socket.on('disconnect', () => {
      Logger.activity.debug(`👤 ${userName} disconnected`);
    });
  }

  setInterval(() => {
    // Statistiques simplifiées et claires
    const realTimeAPI = io.sockets?.server?.app?.locals?.realTimeAPI;
    if (realTimeAPI?.events && realTimeAPI?.modules) {
      const clientStats = realTimeAPI.events.getStats();
      const moduleStats = realTimeAPI.modules.getConnectionStats();

      // Statistiques avec anti-spam : seulement si changement
      const currentStats = {
        users: clientStats.uniqueUsers,
        modules: moduleStats.connectedModules,
        clients: clientStats.total,
        esp: moduleStats.onlineModules,
      };

      Logger.system.statsIfChanged(
        `📊 Connectés - ${clientStats.uniqueUsers} personne(s) sur le site, ${moduleStats.connectedModules} module(s) ESP connecté(s)`,
        currentStats
      );

      // Debug détaillé toujours disponible dans les fichiers
      Logger.system.debug(
        `📊 Stats détaillées - Users: ${clientStats.uniqueUsers}, Clients: ${clientStats.total}, ESP: ${moduleStats.connectedModules}, Modules BDD: ${moduleStats.onlineModules}`
      );
    } else {
      Logger.system.info(`📊 Connectés - (APIs indisponibles)`);
    }
  }, 30000); // Toutes les 30 secondes pour debug uniquement
};
