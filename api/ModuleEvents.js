/**
 * Événements modules - Gestionnaire IoT temps réel
 *
 * Gestionnaire d'événements temps réel pour les modules IoT incluant gestion
 * des états, télémétrie, synchronisation et monitoring des connexions ESP32.
 *
 * @module ModuleEvents
 * @description Gestionnaire d'événements temps réel pour les modules IoT
 */

const Logger = require('../utils/logger');

/**
 * Gestionnaire d'événements pour les modules IoT MicroCoaster
 * @class ModuleEvents
 * @description Gère tous les événements liés aux modules : connexions, déconnexions, télémétrie
 */
class ModuleEvents {
  /**
   * Constructeur du gestionnaire d'événements modules
   * @param {EventsManager} eventsManager - Gestionnaire d'événements centralisé
   */
  constructor(eventsManager) {
    /**
     * Gestionnaire d'événements centralisé
     * @type {EventsManager}
     */
    this.events = eventsManager;

    /**
     * Logger pour les opérations de modules
     * @type {Logger}
     */
    this.Logger = Logger;

    /**
     * États actuels de tous les modules
     * @type {Map<string, Object>} moduleId -> {online, lastSeen, moduleInfo}
     */
    this.moduleStates = new Map();

    /**
     * Connexions ESP32 actives
     * @type {Map<string, WebSocket>} moduleId -> socket WebSocket
     */
    this.connectedESPs = new Map();

    /**
     * Informations modules par socket
     * @type {Map<string, Object>} socket.id -> {moduleId, userId, ...}
     */
    this.modulesBySocket = new Map();
  }

  /**
   * Marque un module comme en ligne et émet les événements appropriés
   * @param {string} moduleId - Identifiant unique du module
   * @param {Object} [moduleInfo={}] - Informations supplémentaires du module
   * @param {number} [moduleInfo.userId] - ID de l'utilisateur propriétaire
   * @param {string} [moduleInfo.name] - Nom du module
   * @param {string} [moduleInfo.type] - Type de module (Station, Switch Track, etc.)
   */
  moduleOnline(moduleId, moduleInfo = {}) {
    const previousState = this.moduleStates.get(moduleId);
    const wasOnline = previousState?.online || false;
    const currentTime = new Date();

    this.moduleStates.set(moduleId, {
      ...previousState,
      online: true,
      lastSeen: currentTime,
      moduleInfo,
    });

    // Notifier uniquement si le module n'était pas déjà en ligne (changement d'état)
    if (!wasOnline) {
      Logger.modules.info(`[ModuleEvents] Module ${moduleId} maintenant EN LIGNE`);

      // Préparer les données d'événement
      const eventData = {
        moduleId,
        online: true,
        lastSeen: currentTime,
        lastSeenFormatted: currentTime.toLocaleString('fr-FR'),
        ...moduleInfo,
      };

      // Émettre aux utilisateurs sur la page modules UNIQUEMENT s'ils ne sont pas propriétaires du module
      this.events.emitToPageExcludingUser('modules', 'rt_module_online', eventData, moduleInfo.userId);
      
      // Émettre aux admins UNIQUEMENT s'ils ne sont pas propriétaires du module
      this.events.emitToAdminsExcludingUser('rt_module_online', eventData, moduleInfo.userId);

      // Notifier le propriétaire du module si défini
      if (moduleInfo.userId) {
        this.events.emitToUser(moduleInfo.userId, 'user:module:online', eventData);
      }

      // Mettre à jour les statistiques pour les admins
      this.emitStatsToAdmins();
    }

    this.emitLastSeenUpdate(moduleId, currentTime, moduleInfo);
  }

  /**
   * Marque un module comme hors ligne et émet les événements appropriés
   * @param {string} moduleId - Identifiant unique du module
   * @param {Object} [moduleInfo={}] - Informations supplémentaires du module
   * @param {number} [moduleInfo.userId] - ID de l'utilisateur propriétaire
   * @param {string} [moduleInfo.name] - Nom du module
   */
  moduleOffline(moduleId, moduleInfo = {}) {
    const previousState = this.moduleStates.get(moduleId);
    const wasOnline = previousState?.online || false;
    const currentTime = new Date();

    this.moduleStates.set(moduleId, {
      ...previousState,
      online: false,
      lastSeen: currentTime,
      moduleInfo,
    });

    // Notifier uniquement si le module était en ligne (changement d'état)
    if (wasOnline) {
      Logger.modules.info(`[ModuleEvents] Module ${moduleId} maintenant HORS LIGNE`);

      const eventData = {
        moduleId,
        online: false,
        lastSeen: currentTime,
        lastSeenFormatted: currentTime.toLocaleString('fr-FR'),
        ...moduleInfo,
      };

      this.events.emitToPageExcludingUser('modules', 'rt_module_offline', eventData, moduleInfo.userId);
      
      // Émettre aux admins UNIQUEMENT s'ils ne sont pas propriétaires du module
      this.events.emitToAdminsExcludingUser('rt_module_offline', eventData, moduleInfo.userId);

      if (moduleInfo.userId) {
        this.events.emitToUser(moduleInfo.userId, 'user:module:offline', eventData);
      }

      this.emitStatsToAdmins();
    }

    this.emitLastSeenUpdate(moduleId, currentTime, moduleInfo);
  }

  // ================================================================================
  // GESTION DU CYCLE DE VIE DES MODULES
  // ================================================================================

  /**
   * Traite l'ajout d'un nouveau module au système
   * @param {Object} moduleData - Données du nouveau module
   * @param {string} moduleData.module_id - Identifiant unique du module
   * @param {number} [moduleData.userId] - ID de l'utilisateur propriétaire
   * @param {string} [moduleData.name] - Nom du module
   * @param {string} [moduleData.type] - Type de module
   */
  moduleAdded(moduleData) {
    Logger.modules.info(`[ModuleEvents] Nouveau module ajouté : ${moduleData.module_id}`);

    const eventData = {
      action: 'added',
      module: moduleData,
      timestamp: new Date(),
    };

    if (moduleData.userId) {
      this.events.emitToUser(moduleData.userId, 'user:module:added', eventData);
    }

    this.events.emitToAdmins('rt_module_added', eventData);
  }

  /**
   * Traite la suppression d'un module du système
   * @param {Object} moduleData - Données du module à supprimer
   * @param {string} moduleData.module_id - Identifiant unique du module
   * @param {number} [moduleData.userId] - ID de l'utilisateur propriétaire
   */
  moduleRemoved(moduleData) {
    Logger.modules.info(`[ModuleEvents] Module supprimé : ${moduleData.module_id}`);

    // Préparer les données d'événement
    const eventData = {
      action: 'removed',
      module: moduleData,
      timestamp: new Date(),
    };

    // Nettoyer le cache d'état du module
    this.moduleStates.delete(moduleData.module_id);

    // Notifier le propriétaire du module
    if (moduleData.userId) {
      this.events.emitToUser(moduleData.userId, 'user:module:removed', eventData);
    }

    // Notifier tous les administrateurs
    this.events.emitToAdmins('rt_module_removed', eventData);

    // Les statistiques sont mises à jour automatiquement par handlers.js
  }

  /**
   * Traite la mise à jour des informations d'un module
   * @param {Object} moduleData - Nouvelles données du module
   * @param {string} moduleData.module_id - Identifiant unique du module
   * @param {number} [moduleData.userId] - ID de l'utilisateur propriétaire
   * @param {string} [moduleData.name] - Nouveau nom du module
   * @param {string} [moduleData.type] - Nouveau type du module
   */
  moduleUpdated(moduleData) {
    Logger.modules.info(`[ModuleEvents] Module mis à jour : ${moduleData.module_id}`);

    // Préparer les données d'événement
    const eventData = {
      action: 'updated',
      module: moduleData,
      timestamp: new Date(),
    };

    // Notifier le propriétaire du module
    if (moduleData.userId) {
      this.events.emitToUser(moduleData.userId, 'user:module:updated', eventData);
    }

    // Notifier tous les administrateurs
    this.events.emitToAdmins('rt_module_updated', eventData);
  }

  // ================================================================================
  // GESTION DE LA TÉLÉMÉTRIE ET DES DONNÉES
  // ================================================================================

  /**
   * Traite la mise à jour des données de télémétrie d'un module
   * @param {string} moduleId - Identifiant unique du module
   * @param {Object} telemetryData - Données de télémétrie reçues
   * @param {number} [telemetryData.temperature] - Température en °C
   * @param {number} [telemetryData.humidity] - Humidité en %
   * @param {number} [telemetryData.voltage] - Tension d'alimentation
   * @param {string} [telemetryData.status] - Statut du module
   */
  telemetryUpdated(moduleId, telemetryData) {
    const currentTime = new Date();
    const state = this.moduleStates.get(moduleId);
    const moduleInfo = state ? state.moduleInfo : {};

    if (state) {
      state.telemetry = telemetryData;
      state.lastSeen = currentTime;
    }
    const eventData = {
      moduleId,
      telemetry: telemetryData,
      lastSeen: currentTime,
      lastSeenFormatted: currentTime.toLocaleString('fr-FR'),
      timestamp: currentTime,
    };

    // Émettre la mise à jour de télémétrie aux pages concernées
    this.events.emitToPageExcludingUser('modules', 'rt_telemetry_updated', eventData, moduleInfo.userId);
    this.events.emitToAdmins('rt_telemetry_updated', eventData);
    this.emitLastSeenUpdate(moduleId, currentTime, moduleInfo);
  }

  // ================================================================================
  // SUIVI DES COMMANDES
  // ================================================================================

  /**
   * Enregistre l'envoi d'une commande à un module
   * @param {string} moduleId - Identifiant unique du module
   * @param {string} command - Commande envoyée
   * @param {number} userId - ID de l'utilisateur qui a envoyé la commande
   */
  commandSent(moduleId, command, userId) {
    const eventData = {
      moduleId,
      command,
      userId,
      timestamp: new Date(),
    };

    this.events.emitToUser(userId, 'user:command:sent', eventData);
    this.events.emitToAdmins('admin:command:sent', eventData);
  }

  // ================================================================================
  // GESTION DES CONNEXIONS ESP32 (UNIFIÉE)
  // ================================================================================

  /**
   * Enregistre une connexion de module ESP32 de manière sécurisée
   * @param {WebSocket} socket - Socket WebSocket du module ESP32
   * @param {string} moduleId - Identifiant unique du module
   * @param {string} [moduleType='Unknown'] - Type de module (Station, Switch Track, etc.)
   * @returns {Object|null} Informations du module enregistré ou null si échec
   */
  registerESP(socket, moduleId, moduleType = 'Unknown') {
    // Vérifier l'authentification valide du socket
    if (!socket.moduleAuth || socket.moduleId !== moduleId) {
      Logger.modules.error(
        `🚨 Tentative d'enregistrement ESP sans authentification valide : ${moduleId}`
      );
      return null;
    }

    // Gérer les reconnexions en déconnectant l'ancienne session
    const existingSocket = this.connectedESPs.get(moduleId);
    if (existingSocket && existingSocket !== socket) {
      Logger.modules.warn(
        `⚠️ ESP ${moduleId} déjà connecté sur un autre socket. Déconnexion du socket précédent ${existingSocket.id}`
      );

      try {
        this.modulesBySocket.delete(existingSocket.id);
        existingSocket.removeAllListeners();
        existingSocket.disconnect(true);
      } catch (error) {
        Logger.modules.error('Erreur lors de la déconnexion du socket ESP précédent :', error);
      }
    }

    // Créer et enregistrer les informations de la nouvelle connexion
    const moduleInfo = {
      socket,
      moduleId,
      moduleType,
      userId: socket.moduleAuth.userId, // ID du propriétaire du module
      connectedAt: new Date(),
      authenticated: true,
    };

    this.connectedESPs.set(moduleId, socket);
    this.modulesBySocket.set(socket.id, moduleInfo);

    // Notifier que le module est maintenant en ligne
    this.moduleOnline(moduleId, {
      type: moduleType,
      lastSeen: new Date(),
      userId: socket.moduleAuth.userId,
    });

    Logger.esp.info(`ESP registered: ${moduleId} (${moduleType}) on socket ${socket.id}`);
    return moduleInfo;
  }

  /**
   * Désenregistre une connexion de module ESP32
   * @param {WebSocket} socket - Socket WebSocket du module à déconnecter
   * @returns {Object|null} Informations du module déconnecté ou null si non trouvé
   */
  unregisterESP(socket) {
    // Récupérer les informations du module par son socket
    const moduleInfo = this.modulesBySocket.get(socket.id);
    if (!moduleInfo) return null;

    const { moduleId, moduleType } = moduleInfo;

    // Vérifier que c'est bien la connexion active (pas une ancienne session)
    const currentSocket = this.connectedESPs.get(moduleId);

    if (currentSocket && currentSocket.id === socket.id) {
      // Supprimer la connexion active
      this.connectedESPs.delete(moduleId);
      Logger.modules.debug(`Suppression de ${moduleId} de la carte des ESPs connectés`);

      // Marquer le module comme hors ligne avec toutes les informations
      this.moduleOffline(moduleId, {
        moduleType,
        userId: moduleInfo.userId,
        timestamp: new Date(),
      });
    } else if (currentSocket) {
      Logger.modules.debug(
        `Socket ${socket.id} déconnecté mais ${moduleId} est maintenant géré par ${currentSocket.id}`
      );
    }

    // Nettoyer les références du socket
    this.modulesBySocket.delete(socket.id);
    Logger.esp.info(`ESP désenregistré : ${moduleId} (socket ${socket.id})`);
    return moduleInfo;
  }

  /**
   * Récupère les informations d'un module par son socket
   * @param {WebSocket} socket - Socket WebSocket du module
   * @returns {Object|undefined} Informations du module ou undefined si non trouvé
   */
  getModuleBySocket(socket) {
    return this.modulesBySocket.get(socket.id);
  }

  /**
   * Vérifie si un module est actuellement connecté
   * @param {string} moduleId - Identifiant unique du module
   * @returns {boolean} True si le module est connecté, false sinon
   */
  isModuleConnected(moduleId) {
    return this.connectedESPs.has(moduleId);
  }

  /**
   * Récupère les statistiques de connexion des modules
   * @returns {Object} Statistiques de connexion
   * @returns {number} returns.connectedModules - Nombre de modules connectés
   * @returns {number} returns.totalStates - Nombre total d'états en cache
   * @returns {number} returns.onlineModules - Nombre de modules en ligne
   */
  getConnectionStats() {
    return {
      connectedModules: this.connectedESPs.size,
      totalStates: this.moduleStates.size,
      onlineModules: Array.from(this.moduleStates.values()).filter(state => state.online).length,
    };
  }

  // ================================================================================
  // GESTION D'ÉTAT ET UTILITAIRES
  // ================================================================================

  /**
   * Récupère tous les états actuels des modules
   * @returns {Object} Objet contenant tous les états indexés par moduleId
   */
  getCurrentStates() {
    const states = {};
    this.moduleStates.forEach((state, moduleId) => {
      states[moduleId] = state;
    });
    return states;
  }

  /**
   * Récupère l'état d'un module spécifique
   * @param {string} moduleId - Identifiant unique du module
   * @returns {Object} État du module ou état par défaut si non trouvé
   */
  getModuleState(moduleId) {
    return this.moduleStates.get(moduleId) || { online: false, lastSeen: null };
  }

  /**
   * Émet une mise à jour du "dernière activité" d'un module
   * @param {string} moduleId - Identifiant unique du module
   * @param {Date} lastSeen - Horodatage de la dernière activité
   * @param {Object} [moduleInfo={}] - Informations supplémentaires du module
   */
  emitLastSeenUpdate(moduleId, lastSeen, moduleInfo = {}) {
    const eventData = {
      moduleId,
      lastSeen,
      lastSeenFormatted: lastSeen.toLocaleString('fr-FR'),
      timestamp: lastSeen,
      ...moduleInfo,
    };

    this.events.emitToAdmins('rt_module_last_seen_updated', eventData);

    if (moduleInfo.userId) {
      this.events.emitToUser(moduleInfo.userId, 'user:module:last_seen_updated', eventData);
    }
    Logger.esp.debug(`LastSeen updated for module ${moduleId}`, {
      moduleId,
      lastSeen: lastSeen.toISOString(),
      lastSeenFormatted: lastSeen.toLocaleString('fr-FR'),
      ...moduleInfo,
    });
  }

  /**
   * Émet les statistiques mises à jour aux administrateurs
   * @description Utilise la même logique que le gestionnaire request_stats
   * @private
   */
  emitStatsToAdmins() {
    setTimeout(() => {
      try {
        const clientStats = this.events.getStats();
        const moduleStats = this.getConnectionStats();

        // Format simple et direct, comme le gestionnaire request_stats
        const simpleStats = {
          users: { online: clientStats.uniqueUsers },
          modules: { online: moduleStats.connectedModules },
          timestamp: new Date(),
        };

        this.events.emitToAdmins('simple_stats_update', simpleStats);
        Logger.system.debug(
          `[ModuleEvents] Stats mises à jour émises: ${clientStats.uniqueUsers} utilisateurs, ${moduleStats.connectedModules} modules`
        );
      } catch (error) {
        Logger.modules.error('[ModuleEvents] Erreur émission stats :', error);
      }
    }, 200); // Délai pour éviter les appels trop fréquents
  }

  // ================================================================================
  // COMMANDES SÉCURISÉES
  // ================================================================================

  /**
   * Envoie une commande sécurisée à un module ESP32
   * @param {string} moduleId - Identifiant unique du module
   * @param {string} command - Commande à envoyer
   * @param {number} userId - ID de l'utilisateur qui envoie la commande
   * @returns {Object} Résultat de l'opération {success: boolean, error?: string}
   */
  sendSecureCommand(moduleId, command, userId) {
    const socket = this.connectedESPs.get(moduleId);
    if (!socket) {
      Logger.modules.warn(`Tentative d'envoi de commande à module hors ligne : ${moduleId}`);
      return { success: false, error: 'Module hors ligne' };
    }

    const moduleInfo = this.modulesBySocket.get(socket.id);
    if (!moduleInfo || !moduleInfo.authenticated) {
      Logger.modules.warn(`Tentative d'envoi de commande à module non authentifié : ${moduleId}`);
      return { success: false, error: 'Module non authentifié' };
    }
    if (moduleInfo.userId !== userId) {
      Logger.modules.warn(
        `🚨 Tentative d'accès non autorisé au module ${moduleId} par utilisateur ${userId}`
      );
      return { success: false, error: 'Accès non autorisé' };
    }

    try {
      socket.emit('command', { command });
      Logger.modules.info(`Commande envoyée à ${moduleId}: ${command}`);
      return { success: true };
    } catch (error) {
      Logger.modules.error(`Erreur envoi commande à ${moduleId}:`, error);
      return { success: false, error: 'Erreur envoi' };
    }
  }
}

module.exports = ModuleEvents;
