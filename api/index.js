const EventsManager = require('./EventsManager');
const ModuleEvents = require('./ModuleEvents');
const UserEvents = require('./UserEvents');
const AdminEvents = require('./AdminEvents');
const Logger = require('../utils/logger');

/**
 * Point d'entrée principal pour l'API des événements temps réel
 * Initialise et coordonne tous les gestionnaires d'événements
 */
class RealTimeAPI {
  constructor(io, databaseManager) {
    this.io = io;
    this.db = databaseManager;
    this.Logger = Logger;

    // Initialiser les gestionnaires
    this.events = new EventsManager(io);
    this.modules = new ModuleEvents(this.events);
    this.users = new UserEvents(this.events);
    this.admin = new AdminEvents(this.events, databaseManager);

    this.initialized = false;
  }

  /**
   * Initialise l'API des événements temps réel
   */
  initialize() {
    if (this.initialized) {
      Logger.warn('[RealTimeAPI] Already initialized');
      return;
    }

    Logger.info('[RealTimeAPI] Initializing real-time events API');

    // Écouter les connexions Socket.io
    this.io.on('connection', (socket) => {
      this._handleClientConnection(socket);
    });

    this.initialized = true;
    Logger.info('[RealTimeAPI] Real-time events API initialized successfully');
  }

  /**
   * Gère une nouvelle connexion client
   * @private
   */
  _handleClientConnection(socket) {
    Logger.info(`[RealTimeAPI] New client connected: ${socket.id}`);

    // Écouter l'authentification du client
    socket.on('client:authenticate', (data) => {
      this._authenticateClient(socket, data);
    });

    // Écouter la déconnexion
    socket.on('disconnect', () => {
      this._handleClientDisconnection(socket);
    });

    // Écouter les demandes de synchronisation
    socket.on('client:sync:request', () => {
      this._handleSyncRequest(socket);
    });

    // Écouter les changements de page
    socket.on('client:page:changed', (data) => {
      this._handlePageChange(socket, data);
    });
  }

  /**
   * Authentifie un client et l'enregistre
   * @private
   */
  _authenticateClient(socket, data) {
    try {
      const { userId, userType = 'user', page = 'unknown', sessionId } = data;

      if (!userId) {
        socket.emit('client:auth:error', { message: 'User ID required' });
        return;
      }

      // Enregistrer le client
      this.events.registerClient(socket, userId, userType, page);

      // Confirmer l'authentification
      socket.emit('client:auth:success', {
        message: 'Authenticated successfully',
        timestamp: new Date(),
      });

      // Envoyer l'état actuel si nécessaire
      this._sendInitialState(socket, page);

      Logger.info(`[RealTimeAPI] Client authenticated: ${socket.id} (User ${userId}, Page ${page})`);

    } catch (error) {
      Logger.error('[RealTimeAPI] Error authenticating client:', error);
      socket.emit('client:auth:error', { message: 'Authentication failed' });
    }
  }

  /**
   * Gère la déconnexion d'un client
   * @private
   */
  _handleClientDisconnection(socket) {
    this.events.unregisterClient(socket.id);
    Logger.info(`[RealTimeAPI] Client disconnected: ${socket.id}`);
  }

  /**
   * Gère une demande de synchronisation
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
   * Gère un changement de page
   * @private
   */
  _handlePageChange(socket, data) {
    const client = this.events.connectedClients.get(socket.id);
    if (client) {
      client.page = data.page || 'unknown';
      Logger.info(`[RealTimeAPI] Client ${socket.id} changed to page: ${client.page}`);
      
      // Envoyer l'état initial de la nouvelle page
      this._sendInitialState(socket, client.page);
    }
  }

  /**
   * Envoie l'état initial selon la page
   * @private
   */
  async _sendInitialState(socket, page) {
    try {
      switch (page) {
        case 'modules':
          // Envoyer l'état actuel des modules
          const moduleStates = this.modules.getCurrentStates();
          socket.emit('modules:initial:state', moduleStates);
          break;

        case 'admin':
          // Envoyer les statistiques actuelles
          const stats = await this.admin.updateGlobalStats();
          socket.emit('admin:initial:stats', stats);
          break;

        case 'dashboard':
          // Envoyer un résumé général
          socket.emit('dashboard:initial:summary', {
            timestamp: new Date(),
            message: 'Dashboard synchronized',
          });
          break;
      }
    } catch (error) {
      Logger.error(`[RealTimeAPI] Error sending initial state for page ${page}:`, error);
    }
  }

  /**
   * Méthodes publiques pour émettre des événements
   */

  // Événements modules
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

  // Événements utilisateurs
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

  // Événements admin
  async emitStatsUpdate() {
    return await this.admin.updateGlobalStats();
  }

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

  /**
   * Utilitaires
   */
  getStats() {
    return {
      events: this.events.getStats(),
      users: this.users.getConnectedUsersStats(),
      initialized: this.initialized,
    };
  }

  isInitialized() {
    return this.initialized;
  }
}

module.exports = RealTimeAPI;