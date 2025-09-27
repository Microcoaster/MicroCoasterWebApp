/**
 * ============================================================================
 * REAL-TIME API - MAIN ENTRY POINT
 * ============================================================================
 * Coordinates all real-time event handlers for the MicroCoaster application
 *
 * @module RealTimeAPI
 * @description Central orchestrator for WebSocket events and real-time features
 * ============================================================================
 */

const EventsManager = require('./EventsManager');
const ModuleEvents = require('./ModuleEvents');
const UserEvents = require('./UserEvents');
const AdminEvents = require('./AdminEvents');
const Logger = require('../utils/logger');

/**
 * Real-time API orchestrator class
 */
class RealTimeAPI {
  constructor(io, databaseManager) {
    this.io = io;
    this.db = databaseManager;
    this.Logger = Logger;
    this.initialized = false;

    this.events = new EventsManager(io);
    this.modules = new ModuleEvents(this.events);
    this.users = new UserEvents(this.events);
    this.admin = new AdminEvents(this.events, databaseManager);
  }

  // ========================================================================
  // INITIALIZATION
  // ========================================================================

  /**
   * Initialize the real-time events API
   */
  initialize() {
    if (this.initialized) {
      Logger.app.warn('RealTimeAPI already initialized');
      return;
    }

    Logger.app.info('Initializing real-time events API');

    // Les connexions sont gérées par websocket/handlers.js
    // qui redirige vers cette API via client:authenticate quand nécessaire

    this.initialized = true;
    Logger.app.info('Real-time events API initialized successfully');
  }

  // ========================================================================
  // CLIENT CONNECTION HANDLING
  // ========================================================================

  /**
   * Handle client events (called from websocket/handlers.js after auto-registration)
   * @public
   */
  handleClientEvents(socket) {
    // L'authentification est maintenant gérée automatiquement dans handlers.js
    // pour éviter la double gestion et les bugs de comptage

    socket.on('client:authenticate', data => {
      // Optionnel: permet toujours l'authentification manuelle si nécessaire
      this._authenticateClient(socket, data);
    });

    socket.on('disconnect', () => {
      this._handleClientDisconnection(socket);
    });

    socket.on('client:sync:request', () => {
      this._handleSyncRequest(socket);
    });

    socket.on('client:page:changed', data => {
      this._handlePageChange(socket, data);
    });
  }

  /**
   * Authenticate client and register (évite la double inscription)
   * @private
   */
  _authenticateClient(socket, data) {
    try {
      const { userId, userType = 'user', page = 'unknown' } = data;

      if (!userId) {
        socket.emit('client:auth:error', { message: 'User ID required' });
        return;
      }

      // Vérifier si déjà enregistré pour éviter la double inscription
      const existingClient = this.events.connectedClients.get(socket.id);

      if (!existingClient) {
        // Nouveau client - enregistrer
        this.events.registerClient(socket, userId, userType, page);
        socket.isRegisteredWithEventsManager = true;
        Logger.activity.info(`Client authenticated via API: ${socket.id} (User ${userId}, Page ${page})`);
      } else {
        // Client déjà enregistré - mettre à jour la page seulement
        const oldPage = existingClient.page;
        existingClient.page = page;
        if (oldPage !== page) {
              Logger.activity.debug(`📄 ${this.getUserName(socket)} navigated: ${oldPage} → ${page}`);
        }
      }

      socket.emit('client:auth:success', {
        message: 'Authenticated successfully',
        timestamp: new Date(),
      });

      this._sendInitialState(socket, page);
    } catch (error) {
      Logger.activity.error('Error authenticating client:', error);
      socket.emit('client:auth:error', { message: 'Authentication failed' });
    }
  }

  /**
   * Handle client disconnection
   * @private
   */
  _handleClientDisconnection(socket) {
    this.events.unregisterClient(socket.id);
    Logger.activity.debug(`Client disconnected: ${socket.id}`);
  }

  /**
   * Handle sync request
   * @private
   */
  _handleSyncRequest(socket) {
    const client = this.events.connectedClients.get(socket.id);
    if (!client) {
      socket.emit('client:sync:error', { message: 'Not authenticated' });
      return;
    }

    this._sendInitialState(socket, client.page);
    socket.emit('client:sync:success', { timestamp: new Date() });
  }

  /**
   * Handle page change
   * @private
   */
  _handlePageChange(socket, data) {
    const client = this.events.connectedClients.get(socket.id);
    if (client) {
      client.page = data.page || 'unknown';
      Logger.activity.info(`Client ${socket.id} changed to page: ${client.page}`);
      this._sendInitialState(socket, client.page);
    }
  }

  /**
   * Send initial state based on page
   * @private
   */
  async _sendInitialState(socket, page) {
    try {
      switch (page) {
        case 'modules': {
          const moduleStates = this.modules.getCurrentStates();
          socket.emit('modules:initial:state', moduleStates);
          break;
        }

        case 'dashboard':
          socket.emit('dashboard:initial:summary', {
            timestamp: new Date(),
            message: 'Dashboard synchronized',
          });
          break;
      }
    } catch (error) {
      Logger.app.error(`Error sending initial state for page ${page}:`, error);
    }
  }

  // ========================================================================
  // MODULE EVENTS
  // ========================================================================

  emitModuleOnline(moduleId, moduleInfo) {
    this.modules.moduleOnline(moduleId, moduleInfo);
  }

  emitModuleOffline(moduleId, moduleInfo) {
    this.modules.moduleOffline(moduleId, moduleInfo);
  }

  emitModuleAdded(moduleData) {
    this.modules.moduleAdded(moduleData);
  }

  emitModuleRemoved(moduleData) {
    this.modules.moduleRemoved(moduleData);
  }

  emitModuleUpdated(moduleData) {
    this.modules.moduleUpdated(moduleData);
  }

  emitTelemetryUpdate(moduleId, telemetryData) {
    this.modules.telemetryUpdated(moduleId, telemetryData);
  }

  emitCommandSent(moduleId, command, userId) {
    this.modules.commandSent(moduleId, command, userId);
  }

  // ========================================================================
  // USER EVENTS
  // ========================================================================

  emitUserLoggedIn(userData, sessionId) {
    this.users.userLoggedIn(userData, sessionId);
  }

  emitUserLoggedOut(userData, sessionId) {
    this.users.userLoggedOut(userData, sessionId);
  }

  emitUserProfileUpdated(userData, sessionId) {
    this.users.userProfileUpdated(userData, sessionId);
  }

  emitUserPasswordChanged(userData) {
    this.users.userPasswordChanged(userData);
  }

  emitUserRegistered(userData) {
    this.users.userRegistered(userData);
  }

  emitUserActivity(userId, activity, metadata) {
    this.users.userActivity(userId, activity, metadata);
  }

  // ========================================================================
  // ADMIN EVENTS
  // ========================================================================

  // Ancien système supprimé - stats via demande/réponse maintenant

  emitAdminAction(adminUserId, action, details) {
    this.admin.adminAction(adminUserId, action, details);
  }

  emitUserListChanged(changeType, userData) {
    this.admin.userListChanged(changeType, userData);
  }

  emitModuleListChanged(changeType, moduleData) {
    this.admin.moduleListChanged(changeType, moduleData);
  }

  emitMaintenanceMode(inMaintenance, reason, adminUserId) {
    this.admin.maintenanceMode(inMaintenance, reason, adminUserId);
  }

  emitSystemAlert(level, message, details) {
    this.admin.systemAlert(level, message, details);
  }

  emitServerPerformance(performanceData) {
    this.admin.serverPerformance(performanceData);
  }

  // ========================================================================
  // UTILITIES
  // ========================================================================

  getStats() {
    return {
      events: this.events.getStats(),
      modules: this.modules.getConnectionStats(),
      users: this.users.getConnectedUsersStats(),
      initialized: this.initialized,
    };
  }

  isInitialized() {
    return this.initialized;
  }

  // Helper method to get username from socket
  getUserName(socket) {
    return socket.session?.user?.username || 'Utilisateur Anonyme';
  }
}

module.exports = RealTimeAPI;
