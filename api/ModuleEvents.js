/**
 * ================================================================================
 * MICROCOASTER WEBAPP - MODULE EVENTS HANDLER
 * ================================================================================
 *
 * Purpose: Real-time event management for IoT module status and telemetry
 * Author: MicroCoaster Development Team
 * Created: 2024
 *
 * Description:
 * Manages all module-related events including online/offline status changes,
 * telemetry updates, command tracking, and real-time state synchronization.
 * Provides centralized event emission to appropriate clients based on user
 * permissions and page contexts.
 *
 * Dependencies:
 * - EventsManager (for targeted event emission)
 * - Logger utility (for operation logging)
 *
 * ================================================================================
 */

const Logger = require('../utils/logger');

// ================================================================================
// MODULE EVENTS CLASS
// ================================================================================

class ModuleEvents {
  // ================================================================================
  // INITIALIZATION
  // ================================================================================

  constructor(eventsManager) {
    this.events = eventsManager;
    this.Logger = Logger;
    this.moduleStates = new Map();
    // NOUVEAU: Gestion unifiée des connexions ESP
    this.connectedESPs = new Map(); // moduleId -> socket
    this.modulesBySocket = new Map(); // socket.id -> moduleInfo
  }

  // ================================================================================
  // MODULE STATUS MANAGEMENT
  // ================================================================================

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

    if (!wasOnline) {
      Logger.modules.info(`[ModuleEvents] Module ${moduleId} is now ONLINE`);

      const eventData = {
        moduleId,
        online: true,
        lastSeen: currentTime,
        lastSeenFormatted: currentTime.toLocaleString('fr-FR'),
        ...moduleInfo,
      };

      this.events.emitToPage('modules', 'rt_module_online', eventData);
      this.events.emitToAdmins('rt_module_online', eventData);

      if (moduleInfo.userId) {
        this.events.emitToUser(moduleInfo.userId, 'user:module:online', eventData);
      }

      // Émettre les nouvelles stats aux admins après changement d'état module
      this.emitStatsToAdmins();
    }

    this.emitLastSeenUpdate(moduleId, currentTime, moduleInfo);
  }

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

    if (wasOnline) {
      Logger.modules.info(`[ModuleEvents] Module ${moduleId} is now OFFLINE`);

      const eventData = {
        moduleId,
        online: false,
        lastSeen: currentTime,
        lastSeenFormatted: currentTime.toLocaleString('fr-FR'),
        ...moduleInfo,
      };

      this.events.emitToPage('modules', 'rt_module_offline', eventData);
      this.events.emitToAdmins('rt_module_offline', eventData);

      if (moduleInfo.userId) {
        this.events.emitToUser(moduleInfo.userId, 'user:module:offline', eventData);
      }

      // Émettre les nouvelles stats aux admins après changement d'état module
      this.emitStatsToAdmins();
    }

    this.emitLastSeenUpdate(moduleId, currentTime, moduleInfo);
  }

  // ================================================================================
  // MODULE LIFECYCLE MANAGEMENT
  // ================================================================================

  moduleAdded(moduleData) {
    Logger.modules.info(`[ModuleEvents] New module added: ${moduleData.module_id}`);

    const eventData = {
      action: 'added',
      module: moduleData,
      timestamp: new Date(),
    };

    if (moduleData.userId) {
      this.events.emitToUser(moduleData.userId, 'user:module:added', eventData);
    }

    this.events.emitToAdmins('rt_module_added', eventData);

    // Stats automatiques via WebSocket handlers.js
  }

  moduleRemoved(moduleData) {
    Logger.modules.info(`[ModuleEvents] Module removed: ${moduleData.module_id}`);

    const eventData = {
      action: 'removed',
      module: moduleData,
      timestamp: new Date(),
    };

    this.moduleStates.delete(moduleData.module_id);

    if (moduleData.userId) {
      this.events.emitToUser(moduleData.userId, 'user:module:removed', eventData);
    }

    this.events.emitToAdmins('rt_module_removed', eventData);

    // Stats automatiques via WebSocket handlers.js
  }

  moduleUpdated(moduleData) {
    Logger.modules.info(`[ModuleEvents] Module updated: ${moduleData.module_id}`);

    const eventData = {
      action: 'updated',
      module: moduleData,
      timestamp: new Date(),
    };

    if (moduleData.userId) {
      this.events.emitToUser(moduleData.userId, 'user:module:updated', eventData);
    }

    this.events.emitToAdmins('rt_module_updated', eventData);
  }

  // ================================================================================
  // TELEMETRY & DATA MANAGEMENT
  // ================================================================================

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

    this.events.emitToPage('modules', 'rt_telemetry_updated', eventData);
    this.events.emitToAdmins('rt_telemetry_updated', eventData);
    this.emitLastSeenUpdate(moduleId, currentTime, moduleInfo);
  }

  // ================================================================================
  // COMMAND TRACKING
  // ================================================================================

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
  // ESP CONNECTION MANAGEMENT (UNIFIED)
  // ================================================================================

  /**
   * Register ESP module connection (sécurisé)
   */
  registerESP(socket, moduleId, moduleType = 'Unknown') {
    // Vérifier que le socket a une authentification valide
    if (!socket.moduleAuth || socket.moduleId !== moduleId) {
      Logger.modules.error(`🚨 Tentative d'enregistrement ESP sans auth valide: ${moduleId}`);
      return null;
    }

    // Gérer les reconnexions - déconnecter l'ancienne session
    const existingSocket = this.connectedESPs.get(moduleId);
    if (existingSocket && existingSocket !== socket) {
      Logger.modules.warn(
        `⚠️ ESP ${moduleId} already connected on different socket. Disconnecting previous socket ${existingSocket.id}`
      );

      try {
        this.modulesBySocket.delete(existingSocket.id);
        existingSocket.removeAllListeners();
        existingSocket.disconnect(true);
      } catch (error) {
        Logger.modules.error('Error disconnecting previous ESP socket:', error);
      }
    }

    // Enregistrer la nouvelle connexion
    const moduleInfo = {
      socket,
      moduleId,
      moduleType,
      userId: socket.moduleAuth.userId, // Ajouter l'ownership
      connectedAt: new Date(),
      authenticated: true,
    };

    this.connectedESPs.set(moduleId, socket);
    this.modulesBySocket.set(socket.id, moduleInfo);

    // Mettre à jour l'état du module
    this.moduleOnline(moduleId, {
      type: moduleType,
      lastSeen: new Date(),
      userId: socket.moduleAuth.userId,
    });

    Logger.esp.info(`ESP registered: ${moduleId} (${moduleType}) on socket ${socket.id}`);
    return moduleInfo;
  }

  /**
   * Unregister ESP module connection
   */
  unregisterESP(socket) {
    const moduleInfo = this.modulesBySocket.get(socket.id);
    if (!moduleInfo) return null;

    const { moduleId, moduleType } = moduleInfo;

    // Vérifier que c'est bien la connexion active (pas une ancienne)
    const currentSocket = this.connectedESPs.get(moduleId);
    if (currentSocket === socket) {
      this.connectedESPs.delete(moduleId);
      Logger.modules.debug(`Removed ${moduleId} from connectedESPs map`);

      // Marquer comme offline
      this.moduleOffline(moduleId, { moduleType, timestamp: new Date() });
    } else if (currentSocket) {
      Logger.modules.debug(
        `Socket ${socket.id} disconnected but ${moduleId} is now handled by ${currentSocket.id}`
      );
    }

    this.modulesBySocket.delete(socket.id);
    Logger.esp.info(`ESP unregistered: ${moduleId} (socket ${socket.id})`);
    return moduleInfo;
  }



  /**
   * Get module info by socket
   */
  getModuleBySocket(socket) {
    return this.modulesBySocket.get(socket.id);
  }

  /**
   * Check if module is connected
   */
  isModuleConnected(moduleId) {
    return this.connectedESPs.has(moduleId);
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    return {
      connectedModules: this.connectedESPs.size,
      totalStates: this.moduleStates.size,
      onlineModules: Array.from(this.moduleStates.values()).filter(state => state.online).length,
    };
  }

  // ================================================================================
  // STATE MANAGEMENT & UTILITIES
  // ================================================================================

  getCurrentStates() {
    const states = {};
    this.moduleStates.forEach((state, moduleId) => {
      states[moduleId] = state;
    });
    return states;
  }

  getModuleState(moduleId) {
    return this.moduleStates.get(moduleId) || { online: false, lastSeen: null };
  }

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

    // Log télémétrie ESP dans fichier séparé (pas de spam console)
    Logger.esp.debug(`LastSeen updated for module ${moduleId}`, {
      moduleId,
      lastSeen: lastSeen.toISOString(),
      lastSeenFormatted: lastSeen.toLocaleString('fr-FR'),
      ...moduleInfo,
    });
  }

  /**
   * Émettre les stats mises à jour aux admins (même logique que request_stats)
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
        Logger.modules.error('[ModuleEvents] Erreur émission stats:', error);
      }
    }, 200); // Petit délai pour éviter les appels trop fréquents
  }

  // ================================================================================
  // COMMANDES SÉCURISÉES
  // ================================================================================

  /**
   * Envoie une commande à un module ESP en vérifiant l'ownership
   */
  sendSecureCommand(moduleId, command, userId) {
    const socket = this.connectedESPs.get(moduleId);
    if (!socket) {
      Logger.modules.warn(`Tentative d'envoi de commande à module offline: ${moduleId}`);
      return { success: false, error: 'Module offline' };
    }

    const moduleInfo = this.modulesBySocket.get(socket.id);
    if (!moduleInfo || !moduleInfo.authenticated) {
      Logger.modules.warn(`Tentative d'envoi de commande à module non authentifié: ${moduleId}`);
      return { success: false, error: 'Module non authentifié' };
    }

    // Vérifier l'ownership
    if (moduleInfo.userId !== userId) {
      Logger.modules.warn(
        `🚨 Tentative d'accès non autorisé au module ${moduleId} par user ${userId}`
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
