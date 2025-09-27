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
// connectedModules/espById maintenant gérés par ModuleEvents pour éviter les doublons
const codeByModuleId = new Map(); // moduleId -> code (après "claim" par le web)

/* ===================== AUTHENTIFICATION ESP SÉCURISÉE ===================== */

/**
 * Valide l'authentification d'un message ESP
 * @param {Object} socket - Socket ESP
 * @param {Object} data - Données du message
 * @returns {boolean} true si valide, false sinon
 */
async function validateESPMessage(socket, data) {
  // Vérifier que le socket est authentifié
  if (!socket.moduleAuth || !socket.moduleId) {
    Logger.modules.warn('🚨 Message ESP depuis socket non authentifié');
    return false;
  }

  // Vérifier que les credentials sont présents dans le message
  if (!data.moduleId || !data.password) {
    Logger.modules.warn(`🚨 Message ESP sans credentials depuis ${socket.moduleId}`);
    return false;
  }

  // Vérifier que les credentials correspondent à ceux du socket
  if (data.moduleId !== socket.moduleId) {
    Logger.modules.warn(
      `🚨 Tentative d'usurpation: ${data.moduleId} depuis socket ${socket.moduleId}`
    );
    return false;
  }

  // Valider le password à nouveau (sécurité renforcée)
  try {
    const moduleAuth = await databaseManager.modules.validateModuleAuth(
      data.moduleId,
      data.password
    );
    if (!moduleAuth) {
      Logger.modules.warn(`🚨 Password invalide pour module ${data.moduleId}`);
      return false;
    }
    return true;
  } catch (error) {
    Logger.modules.error('Erreur validation message ESP:', error);
    return false;
  }
}

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
      Logger.esp(`[RX] ${who(socket, session)} ${event}`, { data: redact(data) });
    } else {
      // Si c'est un module ESP, utiliser le logger ESP
      if (who(socket, session).includes('unknown')) {
        Logger.esp(`[RX] ${who(socket, session)} ${event}`);
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
      Logger.esp(`[TX] ${who(socket, session)} ${event}`, { data: redact(data) });
    } else if (event === 'modules_state' || event === 'module_presence') {
      Logger.modules.debug(`[TX] ${who(socket, session)} ${event}`); // Événements fréquents en debug
    } else {
      // Si c'est une transmission vers un module ESP, utiliser le logger ESP
      if (
        who(socket, session).includes('esp') ||
        event.includes('esp') ||
        who(socket, session).includes('MC-')
      ) {
        Logger.esp(`[TX] ${who(socket, session)} ${event}`);
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

module.exports = function (io) {
  Logger.app.info('🔌 WebSocket handler initialized (Socket.io)');

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
      Logger.esp(
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

        // Retirer les listeners module pour éviter les conflits
        socket.removeAllListeners('module_identify');
        if (socket._moduleTimeout) {
          clearTimeout(socket._moduleTimeout);
        }

        // Rediriger vers le handler client
        handleClientConnection(socket, fakeSession);
      });

      // Sinon c'est probablement un module ESP32
      handleModuleConnection(socket);
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

    // Écouter l'enregistrement de page par le client (pour mettre à jour la page)
    socket.on('register_page', data => {
      const page = data?.page || 'unknown';
      Logger.activity.debug('Client updating page', { page, socketId: socket.id });

      if (realTimeAPI && socket.isRegisteredWithEventsManager) {
        // Mettre à jour la page dans EventsManager
        const client = realTimeAPI.events.connectedClients.get(socket.id);
        if (client) {
          client.page = page;
          Logger.activity.info(`Client page updated: ${socket.id} -> ${page}`);
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
        socket.emit('module_presence', { moduleId: mid, online });
      }
    }

    // ===== WEB -> ESP COMMANDES SÉCURISÉES =====
    socket.on('send_module_command', data => {
      const { moduleId, command } = data;

      if (!moduleId || !command) {
        socket.emit('error', { message: 'moduleId et command requis' });
        return;
      }

      Logger.activity.info(`🎮 Commande reçue de ${userName}: ${command} -> ${moduleId}`);

      const realTimeAPI = getRealTimeAPI(socket);
      if (realTimeAPI?.modules) {
        const result = realTimeAPI.modules.sendSecureCommand(moduleId, command, userId);

        if (!result.success) {
          Logger.activity.warn(`🚫 Commande refusée pour ${userName}: ${result.error}`);
          socket.emit('command_error', {
            moduleId,
            command,
            error: result.error,
          });
        } else {
          Logger.activity.info(`✅ Commande envoyée: ${command} -> ${moduleId}`);
          socket.emit('command_sent', {
            moduleId,
            command,
            timestamp: new Date(),
          });
        }
      } else {
        socket.emit('error', { message: 'Service modules indisponible' });
      }
    });

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
      const realTimeAPI = getRealTimeAPI(socket);
      const online = realTimeAPI?.modules?.isModuleConnected(mid) || false;
      broadcastToWebByCode(realTimeAPI, userCode, 'module_presence', { moduleId: mid, online });
    });

    // ===== ANCIEN SYSTÈME SUPPRIMÉ =====
    // L'ancien handler 'module_command' a été supprimé
    // Toutes les commandes doivent maintenant utiliser 'send_module_command' (sécurisé)

    // Nettoyage à la déconnexion
    socket.on('disconnect', () => {
      Logger.activity.debug(`👤 ${userName} disconnected`);

      // La désinscription de l'EventsManager est maintenant gérée automatiquement
      // par le handler 'disconnect' dans api/index.js pour éviter la double gestion
      // webByCode supprimé - plus besoin de nettoyage manuel
    });
  }

  // Gestionnaire pour les modules ESP32
  function handleModuleConnection(socket) {
    Logger.esp(`🤖 Module attempting connection: ${socket.id}`);

    // Timeout pour identifier le module (éviter les connexions zombies)
    const identificationTimeout = setTimeout(() => {
      if (!socket.moduleId) {
        Logger.esp(`Module ${socket.id} failed to identify within 10 seconds - disconnecting`);
        socket.emit('error', { message: 'Identification timeout' });
        socket.disconnect();
      }
    }, 10000);

    // Stocker le timeout sur le socket pour pouvoir l'annuler
    socket._moduleTimeout = identificationTimeout;

    // ===== ESP -> REGISTER ===== (le module doit s'identifier avec auth)
    socket.on('module_identify', async data => {
      clearTimeout(identificationTimeout); // Annuler le timeout

      logRx(socket, 'module_identify', data);
      const { moduleId, password, type, uptime, position } = data;

      // Validation des données requises
      if (!moduleId || !password) {
        Logger.modules.warn(
          `🚨 Tentative d'identification sans credentials: ${moduleId || 'NO_ID'}`
        );
        socket.emit('error', { message: 'Module ID et password requis' });
        return socket.disconnect();
      }

      try {
        // AUTHENTIFICATION SÉCURISÉE
        const moduleAuth = await databaseManager.modules.validateModuleAuth(moduleId, password);

        if (!moduleAuth) {
          Logger.modules.warn(`🚨 SÉCURITÉ: Authentification échouée pour ${moduleId}`);
          socket.emit('error', { message: 'Authentification échouée' });
          return socket.disconnect();
        }

        Logger.modules.info(`🔒 Module authentifié: ${moduleId} (${type || 'Unknown'})`);

        // Stocker les infos d'auth sur le socket pour validation future
        socket.moduleId = moduleId;
        socket.moduleAuth = moduleAuth;
        socket.moduleType = type || 'Unknown';

        // NOUVEAU: Utiliser ModuleEvents pour la gestion unifiée
        const realTimeAPI = getRealTimeAPI(socket);
        if (realTimeAPI?.modules) {
          // Enregistrer via ModuleEvents avec données d'auth
          const moduleInfo = realTimeAPI.modules.registerESP(socket, moduleId, type);

          // Mettre à jour le statut en cache
          databaseManager.modules.updateStatus(moduleId, 'online').catch(Logger.modules.error);

          // Confirmer l'authentification avec état initial
          socket.emit('connected', {
            status: 'authenticated',
            initialState: { uptime, position },
          });

          Logger.modules.info(
            `✅ Module ${moduleId} connecté avec état initial: ${position || 'unknown'}`
          );
        } else {
          Logger.modules.error('RealTimeAPI or ModuleEvents not available for ESP registration');
          socket.emit('error', { message: 'Erreur serveur' });
          socket.disconnect();
        }

        // Si déjà claimé par un dashboard, annoncer présence
        const c = codeByModuleId.get(moduleId);
        if (c) {
          broadcastToWebByCode(realTimeAPI, c, 'module_online', {
            moduleId,
            type,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        Logger.modules.error("Erreur lors de l'authentification ESP:", error);
        socket.emit('error', { message: 'Erreur authentification' });
        socket.disconnect();
      }

      // Connected event already sent in auth success block above
    });

    // ===== ESP -> TELEMETRY ===== (télémétrie sécurisée depuis les modules)
    socket.on('telemetry', async data => {
      // VALIDATION SÉCURISÉE
      const isValid = await validateESPMessage(socket, data);
      if (!isValid) {
        Logger.modules.warn(`🚨 Message telemetry non autorisé depuis ${socket.id}`);
        socket.disconnect();
        return;
      }

      const c = codeByModuleId.get(socket.moduleId);
      if (!c) return; // pas encore claimé par un web -> on ignore

      logRx(socket, 'telemetry', data);

      // Extraire les données utiles (sécurisé)
      const telemetryData = {
        uptime: data.uptime,
        position: data.position,
        timestamp: new Date(),
      };

      // Émettre événement temps réel : télémétrie mise à jour
      const realTimeAPI = getRealTimeAPI(socket);
      if (realTimeAPI) {
        realTimeAPI.emitTelemetryUpdate(socket.moduleId, telemetryData);
      }

      broadcastToWebByCode(realTimeAPI, c, 'module_telemetry', {
        moduleId: socket.moduleId,
        ...telemetryData,
      });

      // Mettre à jour le statut "last seen" en base
      databaseManager.modules.updateStatus(socket.moduleId, 'online').catch(Logger.modules.error);
    });

    // Nettoyage à la déconnexion
    socket.on('disconnect', reason => {
      const moduleId = socket.moduleId;

      if (moduleId) {
        Logger.esp(`🤖 Module disconnected: ${moduleId} (reason: ${reason})`);

        // NOUVEAU: Utiliser ModuleEvents pour la gestion unifiée
        const realTimeAPI = getRealTimeAPI(socket);
        if (realTimeAPI?.modules) {
          const moduleInfo = realTimeAPI.modules.unregisterESP(socket);

          // Mettre à jour le statut BDD seulement si c'était la connexion active
          if (moduleInfo && !realTimeAPI.modules.isModuleConnected(moduleId)) {
            databaseManager.modules.updateStatus(moduleId, 'offline').catch(Logger.modules.error);
          }

          // Notifier les clients web via le système de codes
          const c = codeByModuleId.get(moduleId);
          if (c) {
            broadcastToWebByCode(realTimeAPI, c, 'module_offline', {
              moduleId,
              timestamp: new Date(),
            });
          }
        }
      } else {
        // Socket non identifié
        Logger.modules.info(
          `🤖 Unidentified module socket disconnected: ${socket.id} (reason: ${reason})`
        );
      }

      // Nettoyer tous les listeners pour éviter les fuites mémoire
      socket.removeAllListeners();
    });
  }

  // ===== ANCIENNE FONCTION SUPPRIMÉE =====
  // handleModuleCommand() supprimée - remplacée par le système sécurisé sendSecureCommand()

  // Debug endpoint pour voir les connexions actives (uniquement pour les logs)
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
