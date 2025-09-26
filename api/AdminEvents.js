const Logger = require('../utils/logger');

/**
 * Gestionnaire des événements spécifiques à l'administration
 * Émet des événements temps réel pour les statistiques et actions admin
 */
class AdminEvents {
  constructor(eventsManager, databaseManager) {
    this.events = eventsManager;
    this.db = databaseManager;
    this.Logger = Logger;
    
    // Cache des statistiques pour éviter les requêtes répétées
    this.statsCache = {
      data: null,
      lastUpdate: null,
      ttl: 30000, // 30 secondes de cache
    };
  }

  /**
   * Met à jour et diffuse les statistiques générales
   */
  async updateGlobalStats() {
    try {
      const now = new Date();
      
      // Vérifier le cache
      if (this.statsCache.data && 
          this.statsCache.lastUpdate && 
          (now - this.statsCache.lastUpdate) < this.statsCache.ttl) {
        return this.statsCache.data;
      }

      // Calculer les nouvelles statistiques
      const stats = await this._calculateStats();
      
      // Mettre à jour le cache
      this.statsCache.data = stats;
      this.statsCache.lastUpdate = now;

      // Émettre vers tous les admins
      this.events.emitToAdmins('rt_global_stats_updated', {
        stats,
        timestamp: now,
      });

      Logger.info('[AdminEvents] Global stats updated and broadcasted');
      return stats;

    } catch (error) {
      Logger.error('[AdminEvents] Error updating global stats:', error);
      throw error;
    }
  }

  /**
   * Action administrative effectuée
   * @param {number} adminUserId - ID de l'admin qui effectue l'action
   * @param {string} action - Type d'action
   * @param {object} details - Détails de l'action
   */
  adminAction(adminUserId, action, details = {}) {
    Logger.info(`[AdminEvents] Admin action: ${action} by user ${adminUserId}`);
    
    const eventData = {
      adminUserId,
      action,
      details,
      timestamp: new Date(),
    };

    // Émettre vers tous les autres admins (pas l'auteur)
    const clients = Array.from(this.events.connectedClients.values())
      .filter(client => client.userType === 'admin' && client.userId !== adminUserId);

    clients.forEach(client => {
      client.socket.emit('admin:action:performed', eventData);
    });

    // Actions qui nécessitent une mise à jour des stats
    if (['user_deleted', 'user_promoted', 'user_demoted', 'module_force_disconnect'].includes(action)) {
      // Planifier une mise à jour des stats dans 1 seconde
      setTimeout(() => this.updateGlobalStats(), 1000);
    }
  }

  /**
   * Changement dans la liste des utilisateurs
   * @param {string} changeType - Type de changement (added, removed, updated)
   * @param {object} userData - Données utilisateur
   */
  userListChanged(changeType, userData) {
    const eventData = {
      changeType,
      user: userData,
      timestamp: new Date(),
    };

    // Émettre vers la page admin
    this.events.emitToPage('admin', 'admin:users:list_changed', eventData);
    
    // Mettre à jour les statistiques
    setTimeout(() => this.updateGlobalStats(), 500);
  }

  /**
   * Changement dans la liste des modules
   * @param {string} changeType - Type de changement (added, removed, updated, status_changed)
   * @param {object} moduleData - Données module
   */
  moduleListChanged(changeType, moduleData) {
    const eventData = {
      changeType,
      module: moduleData,
      timestamp: new Date(),
    };

    // Émettre vers la page admin
    this.events.emitToPage('admin', 'admin:modules:list_changed', eventData);
    
    // Mettre à jour les statistiques si changement de statut
    if (changeType === 'status_changed') {
      setTimeout(() => this.updateGlobalStats(), 500);
    }
  }

  /**
   * Système en maintenance
   * @param {boolean} inMaintenance - État maintenance
   * @param {string} reason - Raison de la maintenance
   * @param {number} adminUserId - ID de l'admin
   */
  maintenanceMode(inMaintenance, reason = '', adminUserId) {
    Logger.info(`[AdminEvents] Maintenance mode: ${inMaintenance ? 'ON' : 'OFF'} by admin ${adminUserId}`);
    
    const eventData = {
      inMaintenance,
      reason,
      adminUserId,
      timestamp: new Date(),
    };

    // Émettre vers tous les clients connectés
    this.events.broadcast('system:maintenance', eventData);
  }

  /**
   * Alerte système
   * @param {string} level - Niveau d'alerte (info, warning, error, critical)
   * @param {string} message - Message d'alerte
   * @param {object} details - Détails supplémentaires
   */
  systemAlert(level, message, details = {}) {
    Logger.warn(`[AdminEvents] System alert (${level}): ${message}`);
    
    const eventData = {
      level,
      message,
      details,
      timestamp: new Date(),
    };

    // Émettre selon le niveau
    if (level === 'critical' || level === 'error') {
      // Alertes critiques vers tous les admins
      this.events.emitToAdmins('system:alert', eventData);
    } else {
      // Autres alertes vers la page admin seulement
      this.events.emitToPage('admin', 'system:alert', eventData);
    }
  }

  /**
   * Performance du serveur
   * @param {object} performanceData - Données de performance
   */
  serverPerformance(performanceData) {
    const eventData = {
      performance: performanceData,
      timestamp: new Date(),
    };

    // Émettre vers la page admin
    this.events.emitToPage('admin', 'admin:performance:updated', eventData);
  }

  /**
   * Calcule les statistiques générales (privé)
   * @private
   */
  async _calculateStats() {
    try {
      // Statistiques utilisateurs
      const usersStats = await this.db.users.getStats();
      
      // Statistiques modules
      const modulesStats = await this.db.modules.getStats();
      
      // Statistiques connexions WebSocket
      const wsStats = this.events.getStats();
      
      // Statistiques système
      const systemStats = this._getSystemStats();

      return {
        users: usersStats,
        modules: modulesStats,
        websocket: wsStats,
        system: systemStats,
        lastUpdate: new Date(),
      };

    } catch (error) {
      Logger.error('[AdminEvents] Error calculating stats:', error);
      return {
        users: { total: 0, online: 0, admins: 0 },
        modules: { total: 0, online: 0, byType: {} },
        websocket: { total: 0, byPage: {}, byType: {} },
        system: { uptime: process.uptime(), memory: process.memoryUsage() },
        error: 'Failed to calculate stats',
        lastUpdate: new Date(),
      };
    }
  }

  /**
   * Obtient les statistiques système
   * @private
   */
  _getSystemStats() {
    const memUsage = process.memoryUsage();
    
    return {
      uptime: process.uptime(),
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024), // MB
      },
      cpu: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
      },
      timestamp: new Date(),
    };
  }

  /**
   * Invalide le cache des statistiques
   */
  invalidateStatsCache() {
    this.statsCache.data = null;
    this.statsCache.lastUpdate = null;
    Logger.info('[AdminEvents] Stats cache invalidated');
  }

  /**
   * Force la mise à jour des statistiques (ignorer le cache)
   */
  async forceStatsUpdate() {
    this.invalidateStatsCache();
    return await this.updateGlobalStats();
  }
}

module.exports = AdminEvents;