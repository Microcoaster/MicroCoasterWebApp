/**
 * API temps réel - Point d'entrée principal
 *
 * Orchestrateur central pour tous les gestionnaires d'événements WebSocket
 * de l'application MicroCoaster (modules IoT, utilisateurs, administration).
 *
 * @module RealTimeAPI
 * @description Orchestrateur central pour les événements WebSocket et fonctionnalités temps réel
 */

const EventsManager = require('./EventsManager');
const ModuleEvents = require('./ModuleEvents');
const UserEvents = require('./UserEvents');
const AdminEvents = require('./AdminEvents');
const Logger = require('../utils/logger');

/**
 * Orchestrateur principal de l'API temps réel
 * Coordonne tous les gestionnaires d'événements WebSocket
 * @class RealTimeAPI
 */
class RealTimeAPI {
  /**
   * Crée une instance de RealTimeAPI
   * @param {Object} io - Instance Socket.IO pour la gestion des connexions WebSocket
   * @param {DatabaseManager} databaseManager - Gestionnaire de base de données
   */
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

  /**
   * Initialise l'API d'événements temps réel
   * Configure tous les gestionnaires d'événements et marque l'API comme prête
   * @returns {void}
   */
  initialize() {
    if (this.initialized) {
      Logger.app.warn('RealTimeAPI already initialized');
      return;
    }

    Logger.app.info('🚀 Initializing real-time events API');

    this.initialized = true;
    Logger.app.info('✅ Real-time events API initialized successfully');
  }

  /**
   * Gère les événements client après enregistrement automatique
   * Appelé depuis websocket/handlers.js après l'auto-registration
   * @param {Socket} socket - Socket client connecté
   * @public
   */
  handleClientEvents(socket) {
    socket.on('client:authenticate', data => {
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
   * Authentifie le client et l'enregistre (évite la double inscription)
   * @param {Socket} socket - Socket client à authentifier
   * @param {Object} data - Données d'authentification
   * @param {string} data.userId - ID de l'utilisateur
   * @param {string} [data.userType='user'] - Type d'utilisateur (user/admin)
   * @param {string} [data.page='unknown'] - Page courante du client
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
        Logger.activity.info(
          `Client authenticated via API: ${socket.id} (User ${userId}, Page ${page})`
        );
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
   * Gère la déconnexion d'un client
   * Désenregistre le client et nettoie les ressources
   * @param {Socket} socket - Socket client déconnecté
   * @private
   */
  _handleClientDisconnection(socket) {
    this.events.unregisterClient(socket.id);
    Logger.activity.debug(`Client disconnected: ${socket.id}`);
  }

  /**
   * Gère les demandes de synchronisation client
   * Renvoie l'état initial basé sur la page courante
   * @param {Socket} socket - Socket client demandant la synchronisation
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
   * Gère le changement de page d'un client
   * Met à jour la page courante et synchronise l'état
   * @param {Socket} socket - Socket client
   * @param {Object} data - Données du changement de page
   * @param {string} data.page - Nouvelle page
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
   * Envoie l'état initial basé sur la page courante
   * Synchronise les données spécifiques à chaque page
   * @param {Socket} socket - Socket client
   * @param {string} page - Page courante du client
   * @returns {Promise<void>}
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

  /**
   * Émet un événement de module en ligne
   * @param {string} moduleId - ID du module
   * @param {Object} moduleInfo - Informations du module
   */
  emitModuleOnline(moduleId, moduleInfo) {
    this.modules.moduleOnline(moduleId, moduleInfo);
  }

  /**
   * Émet un événement de module hors ligne
   * @param {string} moduleId - ID du module
   * @param {Object} moduleInfo - Informations du module
   */
  emitModuleOffline(moduleId, moduleInfo) {
    this.modules.moduleOffline(moduleId, moduleInfo);
  }

  /**
   * Émet un événement d'ajout de module
   * @param {Object} moduleData - Données du nouveau module
   */
  emitModuleAdded(moduleData) {
    this.modules.moduleAdded(moduleData);
  }

  /**
   * Émet un événement de suppression de module
   * @param {Object} moduleData - Données du module supprimé
   */
  emitModuleRemoved(moduleData) {
    this.modules.moduleRemoved(moduleData);
  }

  /**
   * Émet un événement de mise à jour de module
   * @param {Object} moduleData - Données du module mis à jour
   */
  emitModuleUpdated(moduleData) {
    this.modules.moduleUpdated(moduleData);
  }

  /**
   * Émet une mise à jour de télémétrie
   * @param {string} moduleId - ID du module
   * @param {Object} telemetryData - Données de télémétrie
   */
  emitTelemetryUpdate(moduleId, telemetryData) {
    this.modules.telemetryUpdated(moduleId, telemetryData);
  }

  /**
   * Émet un événement de commande envoyée
   * @param {string} moduleId - ID du module cible
   * @param {Object} command - Commande envoyée
   * @param {string} userId - ID de l'utilisateur émetteur
   */
  emitCommandSent(moduleId, command, userId) {
    this.modules.commandSent(moduleId, command, userId);
  }

  /**
   * Émet un événement de connexion utilisateur
   * @param {Object} userData - Données de l'utilisateur
   * @param {string} sessionId - ID de session
   */
  emitUserLoggedIn(userData, sessionId) {
    this.users.userLoggedIn(userData, sessionId);
  }

  /**
   * Émet un événement de déconnexion utilisateur
   * @param {Object} userData - Données de l'utilisateur
   * @param {string} sessionId - ID de session
   */
  emitUserLoggedOut(userData, sessionId) {
    this.users.userLoggedOut(userData, sessionId);
  }

  /**
   * Émet un événement de mise à jour de profil
   * @param {Object} userData - Données utilisateur mises à jour
   * @param {string} sessionId - ID de session
   */
  emitUserProfileUpdated(userData, sessionId) {
    this.users.userProfileUpdated(userData, sessionId);
  }

  /**
   * Émet un événement de changement de mot de passe
   * @param {Object} userData - Données de l'utilisateur
   */
  emitUserPasswordChanged(userData) {
    this.users.userPasswordChanged(userData);
  }

  /**
   * Émet un événement d'inscription d'utilisateur
   * @param {Object} userData - Données du nouvel utilisateur
   */
  emitUserRegistered(userData) {
    this.users.userRegistered(userData);
  }

  /**
   * Émet un événement d'activité utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @param {string} activity - Type d'activité
   * @param {Object} metadata - Métadonnées de l'activité
   */
  emitUserActivity(userId, activity, metadata) {
    this.users.userActivity(userId, activity, metadata);
  }

  /**
   * Émet un événement d'action administrative
   * @param {string} adminUserId - ID de l'administrateur
   * @param {string} action - Action effectuée
   * @param {Object} details - Détails de l'action
   */
  emitAdminAction(adminUserId, action, details) {
    this.admin.adminAction(adminUserId, action, details);
  }

  /**
   * Émet un événement de changement de liste utilisateurs
   * @param {string} changeType - Type de changement (added/removed/updated)
   * @param {Object} userData - Données utilisateur affectées
   */
  emitUserListChanged(changeType, userData) {
    this.admin.userListChanged(changeType, userData);
  }

  /**
   * Émet un événement de changement de liste modules
   * @param {string} changeType - Type de changement (added/removed/updated)
   * @param {Object} moduleData - Données module affectées
   */
  emitModuleListChanged(changeType, moduleData) {
    this.admin.moduleListChanged(changeType, moduleData);
  }

  /**
   * Émet un événement de mode maintenance
   * @param {boolean} inMaintenance - État du mode maintenance
   * @param {string} reason - Raison du changement
   * @param {string} adminUserId - ID de l'administrateur
   */
  emitMaintenanceMode(inMaintenance, reason, adminUserId) {
    this.admin.maintenanceMode(inMaintenance, reason, adminUserId);
  }

  /**
   * Émet une alerte système
   * @param {string} level - Niveau d'alerte (info/warning/error)
   * @param {string} message - Message d'alerte
   * @param {Object} details - Détails supplémentaires
   */
  emitSystemAlert(level, message, details) {
    this.admin.systemAlert(level, message, details);
  }

  /**
   * Émet des données de performance serveur
   * @param {Object} performanceData - Données de performance
   */
  emitServerPerformance(performanceData) {
    this.admin.serverPerformance(performanceData);
  }

  /**
   * Récupère les statistiques globales de l'API
   * @returns {Object} Statistiques complètes des événements, modules et utilisateurs
   * @returns {Object} returns.events - Statistiques des événements
   * @returns {Object} returns.modules - Statistiques des connexions modules
   * @returns {Object} returns.users - Statistiques des utilisateurs connectés
   * @returns {boolean} returns.initialized - État d'initialisation
   */
  getStats() {
    return {
      events: this.events.getStats(),
      modules: this.modules.getConnectionStats(),
      users: this.users.getConnectedUsersStats(),
      initialized: this.initialized,
    };
  }

  /**
   * Vérifie si l'API est initialisée
   * @returns {boolean} État d'initialisation
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Récupère le nom d'utilisateur depuis un socket
   * @param {Socket} socket - Socket client
   * @returns {string} Nom d'utilisateur ou 'Utilisateur Anonyme'
   * @private
   */
  getUserName(socket) {
    return socket.session?.user?.username || 'Utilisateur Anonyme';
  }
}

module.exports = RealTimeAPI;
