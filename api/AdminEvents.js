/**
 * Événements administratifs - Gestion temps réel
 *
 * Gestionnaire des événements administratifs incluant les statistiques système,
 * actions de gestion utilisateurs, contrôles de maintenance et monitoring.
 *
 * @module AdminEvents
 * @description Gestionnaire temps réel pour les opérations administratives et surveillance système
 */

const Logger = require('../utils/logger');

// ================================================================================
// ADMIN EVENTS CLASS
// ================================================================================

class AdminEvents {
  // ================================================================================
  // INITIALIZATION
  // ================================================================================

  constructor(eventsManager, databaseManager) {
    this.events = eventsManager;
    this.db = databaseManager;
    this.Logger = Logger;
  }

  // ================================================================================
  // ADMINISTRATIVE ACTIONS
  // ================================================================================

  adminAction(adminUserId, action, details = {}) {
    Logger.activity.info(`[AdminEvents] Admin action: ${action} by user ${adminUserId}`);

    const eventData = {
      adminUserId,
      action,
      details,
      timestamp: new Date(),
    };

    const clients = Array.from(this.events.connectedClients.values()).filter(
      client => client.userType === 'admin' && client.userId !== adminUserId
    );

    clients.forEach(client => {
      client.socket.emit('admin:action:performed', eventData);
    });

    if (
      ['user_deleted', 'user_promoted', 'user_demoted', 'module_force_disconnect'].includes(action)
    ) {
      Logger.activity.info(`Critical admin action performed: ${action}`);
    }
  }

  // ================================================================================
  // SYSTEM MONITORING EVENTS
  // ================================================================================

  userListChanged(changeType, userData) {
    const eventData = {
      changeType,
      user: userData,
      timestamp: new Date(),
    };

    this.events.emitToPage('admin', 'admin:users:list_changed', eventData);
  }

  moduleListChanged(changeType, moduleData) {
    const eventData = {
      changeType,
      module: moduleData,
      timestamp: new Date(),
    };

    this.events.emitToPage('admin', 'admin:modules:list_changed', eventData);
  }

  // ================================================================================
  // SYSTEM ALERTS & MAINTENANCE
  // ================================================================================

  maintenanceMode(inMaintenance, reason = '', adminUserId) {
    Logger.activity.info(
      `[AdminEvents] Maintenance mode: ${inMaintenance ? 'ON' : 'OFF'} by admin ${adminUserId}`
    );

    const eventData = {
      inMaintenance,
      reason,
      adminUserId,
      timestamp: new Date(),
    };

    this.events.broadcast('system:maintenance', eventData);
  }

  systemAlert(level, message, details = {}) {
    Logger.app.warn(`[AdminEvents] System alert (${level}): ${message}`);

    const eventData = {
      level,
      message,
      details,
      timestamp: new Date(),
    };

    if (level === 'critical' || level === 'error') {
      this.events.emitToAdmins('system:alert', eventData);
    } else {
      this.events.emitToPage('admin', 'system:alert', eventData);
    }
  }

  serverPerformance(performanceData) {
    const eventData = {
      performance: performanceData,
      timestamp: new Date(),
    };

    this.events.emitToPage('admin', 'admin:performance:updated', eventData);
  }
}

module.exports = AdminEvents;
