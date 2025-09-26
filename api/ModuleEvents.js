const Logger = require('../utils/logger');

/**
 * Gestionnaire des événements liés aux modules
 * Émet des événements temps réel pour les changements d'état des modules
 */
class ModuleEvents {
  constructor(eventsManager) {
    this.events = eventsManager;
    this.Logger = Logger;
    this.moduleStates = new Map(); // moduleId -> { online, lastSeen, telemetry }
  }

  /**
   * Module passe en ligne
   * @param {string} moduleId - ID du module
   * @param {object} moduleInfo - Informations du module (type, nom, propriétaire)
   */
  moduleOnline(moduleId, moduleInfo = {}) {
    const previousState = this.moduleStates.get(moduleId);
    const wasOnline = previousState?.online || false;
    const currentTime = new Date();

    // Mettre à jour l'état local
    this.moduleStates.set(moduleId, {
      ...previousState,
      online: true,
      lastSeen: currentTime,
      moduleInfo,
    });

    // Émettre seulement si changement d'état
    if (!wasOnline) {
      Logger.info(`[ModuleEvents] Module ${moduleId} is now ONLINE`);
      
      const eventData = {
        moduleId,
        online: true,
        lastSeen: currentTime,
        lastSeenFormatted: currentTime.toLocaleString('fr-FR'),
        ...moduleInfo,
      };

      // Émettre vers la page modules
      this.events.emitToPage('modules', 'rt_module_online', eventData);
      
      // Émettre vers les admins
      this.events.emitToAdmins('rt_module_online', eventData);
      
      // Si le module appartient à un utilisateur spécifique
      if (moduleInfo.userId) {
        this.events.emitToUser(moduleInfo.userId, 'user:module:online', eventData);
      }
      
      // Mettre à jour les statistiques globales
      setTimeout(() => {
        if (this.events.io.app && this.events.io.app.locals && this.events.io.app.locals.realTimeAPI) {
          this.events.io.app.locals.realTimeAPI.admin.updateGlobalStats().catch(console.error);
        }
      }, 500);
    }

    // Toujours émettre un événement de mise à jour de lastSeen, même si pas de changement d'état
    this.emitLastSeenUpdate(moduleId, currentTime, moduleInfo);
  }

  /**
   * Module passe hors ligne
   * @param {string} moduleId - ID du module
   * @param {object} moduleInfo - Informations du module
   */
  moduleOffline(moduleId, moduleInfo = {}) {
    const previousState = this.moduleStates.get(moduleId);
    const wasOnline = previousState?.online || false;
    const currentTime = new Date();

    // Mettre à jour l'état local
    this.moduleStates.set(moduleId, {
      ...previousState,
      online: false,
      lastSeen: currentTime,
      moduleInfo,
    });

    // Émettre seulement si changement d'état
    if (wasOnline) {
      Logger.info(`[ModuleEvents] Module ${moduleId} is now OFFLINE`);
      
      const eventData = {
        moduleId,
        online: false,
        lastSeen: currentTime,
        lastSeenFormatted: currentTime.toLocaleString('fr-FR'),
        ...moduleInfo,
      };

      // Émettre vers la page modules
      this.events.emitToPage('modules', 'rt_module_offline', eventData);
      
      // Émettre vers les admins
      this.events.emitToAdmins('rt_module_offline', eventData);
      
      // Si le module appartient à un utilisateur spécifique
      if (moduleInfo.userId) {
        this.events.emitToUser(moduleInfo.userId, 'user:module:offline', eventData);
      }
      
      // Mettre à jour les statistiques globales
      setTimeout(() => {
        if (this.events.io.app && this.events.io.app.locals && this.events.io.app.locals.realTimeAPI) {
          this.events.io.app.locals.realTimeAPI.admin.updateGlobalStats().catch(console.error);
        }
      }, 500);
    }

    // Toujours émettre un événement de mise à jour de lastSeen, même si pas de changement d'état
    this.emitLastSeenUpdate(moduleId, currentTime, moduleInfo);
  }

  /**
   * Nouveau module ajouté
   * @param {object} moduleData - Données complètes du module
   */
  moduleAdded(moduleData) {
    Logger.info(`[ModuleEvents] New module added: ${moduleData.module_id}`);
    
    const eventData = {
      action: 'added',
      module: moduleData,
      timestamp: new Date(),
    };

    // Émettre vers la page modules du propriétaire
    if (moduleData.userId) {
      this.events.emitToUser(moduleData.userId, 'user:module:added', eventData);
    }

    // Émettre vers les admins
    this.events.emitToAdmins('rt_module_added', eventData);
    
    // Mettre à jour les statistiques globales
    setTimeout(() => {
      if (this.events.io.app && this.events.io.app.locals && this.events.io.app.locals.realTimeAPI) {
        this.events.io.app.locals.realTimeAPI.admin.updateGlobalStats().catch(console.error);
      }
    }, 500);
  }

  /**
   * Module supprimé
   * @param {object} moduleData - Données du module supprimé
   */
  moduleRemoved(moduleData) {
    Logger.info(`[ModuleEvents] Module removed: ${moduleData.module_id}`);
    
    const eventData = {
      action: 'removed',
      module: moduleData,
      timestamp: new Date(),
    };

    // Supprimer de l'état local
    this.moduleStates.delete(moduleData.module_id);

    // Émettre vers la page modules du propriétaire
    if (moduleData.userId) {
      this.events.emitToUser(moduleData.userId, 'user:module:removed', eventData);
    }

    // Émettre vers les admins
    this.events.emitToAdmins('rt_module_removed', eventData);
    
    // Mettre à jour les statistiques globales
    setTimeout(() => {
      if (this.events.io.app && this.events.io.app.locals && this.events.io.app.locals.realTimeAPI) {
        this.events.io.app.locals.realTimeAPI.admin.updateGlobalStats().catch(console.error);
      }
    }, 500);
  }

  /**
   * Module mis à jour
   * @param {object} moduleData - Nouvelles données du module
   */
  moduleUpdated(moduleData) {
    Logger.info(`[ModuleEvents] Module updated: ${moduleData.module_id}`);
    
    const eventData = {
      action: 'updated',
      module: moduleData,
      timestamp: new Date(),
    };

    // Émettre vers la page modules du propriétaire
    if (moduleData.userId) {
      this.events.emitToUser(moduleData.userId, 'user:module:updated', eventData);
    }

    // Émettre vers les admins
    this.events.emitToAdmins('rt_module_updated', eventData);
  }

  /**
   * Télémétrie de module mise à jour
   * @param {string} moduleId - ID du module
   * @param {object} telemetryData - Données de télémétrie
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

    // Émettre vers la page modules (pour mise à jour en temps réel des contrôles)
    this.events.emitToPage('modules', 'rt_telemetry_updated', eventData);

    // Émettre aussi vers les admins pour qu'ils voient l'activité
    this.events.emitToAdmins('rt_telemetry_updated', eventData);

    // Toujours émettre un événement de mise à jour de lastSeen
    this.emitLastSeenUpdate(moduleId, currentTime, moduleInfo);
  }

  /**
   * Commande envoyée vers un module
   * @param {string} moduleId - ID du module
   * @param {object} command - Commande envoyée
   * @param {number} userId - ID de l'utilisateur qui a envoyé la commande
   */
  commandSent(moduleId, command, userId) {
    const eventData = {
      moduleId,
      command,
      userId,
      timestamp: new Date(),
    };

    // Émettre vers les autres clients de l'utilisateur (synchronisation multi-onglets)
    this.events.emitToUser(userId, 'user:command:sent', eventData);
    
    // Émettre vers les admins pour monitoring
    this.events.emitToAdmins('admin:command:sent', eventData);
  }

  /**
   * Obtient l'état actuel de tous les modules
   */
  getCurrentStates() {
    const states = {};
    this.moduleStates.forEach((state, moduleId) => {
      states[moduleId] = state;
    });
    return states;
  }

  /**
   * Obtient l'état d'un module spécifique
   * @param {string} moduleId - ID du module
   */
  getModuleState(moduleId) {
    return this.moduleStates.get(moduleId) || { online: false, lastSeen: null };
  }

  /**
   * Émet un événement de mise à jour de la dernière activité d'un module
   * @param {string} moduleId - ID du module
   * @param {Date} lastSeen - Timestamp de la dernière activité
   * @param {object} moduleInfo - Informations du module
   */
  emitLastSeenUpdate(moduleId, lastSeen, moduleInfo = {}) {
    const eventData = {
      moduleId,
      lastSeen,
      lastSeenFormatted: lastSeen.toLocaleString('fr-FR'),
      timestamp: lastSeen,
      ...moduleInfo,
    };

    // Émettre vers les admins pour mise à jour de l'interface
    this.events.emitToAdmins('rt_module_last_seen_updated', eventData);

    // Émettre vers la page modules si l'utilisateur possède le module
    if (moduleInfo.userId) {
      this.events.emitToUser(moduleInfo.userId, 'user:module:last_seen_updated', eventData);
    }

    Logger.info(`[ModuleEvents] LastSeen updated for module ${moduleId}: ${lastSeen.toLocaleString('fr-FR')}`);
  }
}

module.exports = ModuleEvents;