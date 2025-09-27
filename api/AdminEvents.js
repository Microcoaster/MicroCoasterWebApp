/**
 * ================================================================================
 * MICROCOASTER WEBAPP - ADMIN EVENTS HANDLER
 * ================================================================================
 *
 * Purpose: Real-time event management for administrative operations and system monitoring
 * Author: MicroCoaster Development Team
 * Created: 2024
 *
 * Description:
 * Manages administrative events including system statistics, user management actions,
 * maintenance mode controls, system alerts, and performance monitoring. Provides
 * real-time administrative notifications and system health monitoring.
 *
 * Dependencies:
 * - EventsManager (for targeted event emission)
 * - DatabaseManager (for statistics calculation)
 * - Logger utility (for operation logging)
 *
 * ================================================================================
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
  // STATISTICS MANAGEMENT - SUPPRIMÉ
  // ================================================================================

  // Ancien système complexe supprimé - utiliser les stats WebSocket directement

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

  // ================================================================================
  // ANCIEN SYSTÈME DE STATS SUPPRIMÉ
  // ================================================================================

  // Utiliser les stats WebSocket directement comme dans le log qui fonctionne
}

module.exports = AdminEvents;
