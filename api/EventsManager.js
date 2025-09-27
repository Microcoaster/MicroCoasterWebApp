/**
 * ============================================================================
 * EVENTS MANAGER - WEBSOCKET EVENT ORCHESTRATOR
 * ============================================================================
 * Central hub for WebSocket event emission and client management
 *
 * @module EventsManager
 * @description Manages connected clients and provides targeted event emission
 * ============================================================================
 */

const Logger = require('../utils/logger');

/**
 * Central WebSocket events manager
 */
class EventsManager {
  constructor(io) {
    this.io = io;
    this.connectedClients = new Map();
    this.Logger = Logger;
  }

  // ========================================================================
  // CLIENT MANAGEMENT
  // ========================================================================

  /**
   * Register connected client
   * @param {Socket} socket - Socket.io client
   * @param {number} userId - User ID
   * @param {string} userType - User type (admin, user)
   * @param {string} page - Current page (modules, admin, dashboard)
   */
  registerClient(socket, userId, userType = 'user', page = 'unknown') {
    // Vérifier s'il y a déjà des connexions pour cet utilisateur
    const existingClients = Array.from(this.connectedClients.values()).filter(
      client => client.userId === userId
    );

    if (existingClients.length > 0) {
      Logger.activity.warn(
        `User ${userId} already has ${existingClients.length} connection(s), replacing older ones...`
      );

      // Déconnecter les anciennes connexions
      existingClients.forEach(existingClient => {
        if (existingClient.socket !== socket && existingClient.socket.connected) {
          Logger.activity.info(
            `Disconnecting previous session for user ${userId}: ${existingClient.socket.id}`
          );
          existingClient.socket.emit('session_replaced', {
            message: 'New session started',
            newSocketId: socket.id,
          });
          existingClient.socket.disconnect();
          // Supprimer de la Map
          this.connectedClients.delete(existingClient.socket.id);
        }
      });
    }

    this.connectedClients.set(socket.id, {
      socket,
      userId,
      userType,
      page,
      connectedAt: new Date(),
    });

    Logger.activity.debug(
      `Client registered: ${socket.id} (User ${userId}, Type: ${userType}, Page: ${page})`
    );
  }

  /**
   * Remove disconnected client
   * @param {string} socketId - Socket ID
   */
  unregisterClient(socketId) {
    const client = this.connectedClients.get(socketId);
    if (client) {
      Logger.activity.debug(`Client unregistered: ${socketId} (User ${client.userId})`);
      this.connectedClients.delete(socketId);
    }
  }

  // ========================================================================
  // EVENT EMISSION
  // ========================================================================

  /**
   * Broadcast event to all connected clients
   * @param {string} event - Event name
   * @param {object} data - Data to send
   */
  broadcast(event, data) {
    Logger.system.info(`Broadcasting '${event}' to ${this.connectedClients.size} clients`);
    this.io.emit(event, data);
  }

  /**
   * Emit event to specific user
   * @param {number} userId - User ID
   * @param {string} event - Event name
   * @param {object} data - Data to send
   */
  emitToUser(userId, event, data) {
    const clients = Array.from(this.connectedClients.values()).filter(
      client => client.userId === userId
    );

    clients.forEach(client => {
      client.socket.emit(event, data);
    });

    if (clients.length > 0) {
      Logger.system.debug(`Emitted '${event}' to user ${userId} (${clients.length} clients)`);
    }
  }

  /**
   * Emit event to all admins
   * @param {string} event - Event name
   * @param {object} data - Data to send
   */
  emitToAdmins(event, data) {
    const adminClients = Array.from(this.connectedClients.values()).filter(
      client => client.userType === 'admin'
    );

    adminClients.forEach(client => {
      client.socket.emit(event, data);
    });

    if (adminClients.length > 0) {
      // Log émissions fréquentes en debug seulement pour éviter spam
      if (event.includes('telemetry') || event.includes('last_seen')) {
        Logger.system.debug(`Emitted '${event}' to ${adminClients.length} admin(s)`);
      } else {
        Logger.system.debug(`Emitted '${event}' to ${adminClients.length} admin(s)`);
      }
    }
  }

  /**
   * Emit event to specific page clients
   * @param {string} page - Target page (modules, admin, dashboard)
   * @param {string} event - Event name
   * @param {object} data - Data to send
   */
  emitToPage(page, event, data) {
    const pageClients = Array.from(this.connectedClients.values()).filter(
      client => client.page === page
    );

    pageClients.forEach(client => {
      client.socket.emit(event, data);
    });

    if (pageClients.length > 0) {
      Logger.system.debug(`Emitted '${event}' to page '${page}' (${pageClients.length} clients`);
    }
  }

  // ========================================================================
  // STATISTICS
  // ========================================================================

  /**
   * Get connection statistics
   */
  getStats() {
    const clientsByPage = {};
    const clientsByType = {};
    const uniqueUsers = new Set();

    this.connectedClients.forEach(client => {
      if (!clientsByPage[client.page]) clientsByPage[client.page] = 0;
      clientsByPage[client.page]++;

      if (!clientsByType[client.userType]) clientsByType[client.userType] = 0;
      clientsByType[client.userType]++;

      uniqueUsers.add(client.userId);
    });

    return {
      total: this.connectedClients.size,
      uniqueUsers: uniqueUsers.size,
      byPage: clientsByPage,
      byType: clientsByType,
    };
  }
}

module.exports = EventsManager;
