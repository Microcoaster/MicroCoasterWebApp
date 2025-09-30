/**
 * Gestionnaire d'événements - Orchestrateur WebSocket
 * 
 * Hub central pour l'émission d'événements WebSocket et la gestion des clients.
 * Gère les connexions, sessions multiples et émissions ciblées.
 * 
 * @module EventsManager
 * @description Hub central pour l'émission d'événements WebSocket et la gestion des clients
 */

const Logger = require('../utils/logger');

/**
 * Gestionnaire central des événements WebSocket
 * @class EventsManager
 * @description Gère les clients connectés et fournit l'émission d'événements ciblés
 */
class EventsManager {
  /**
   * Constructeur du gestionnaire d'événements
   * @param {SocketIO.Server} io - Instance Socket.IO du serveur
   */
  constructor(io) {
    /**
     * Instance Socket.IO du serveur
     * @type {SocketIO.Server}
     */
    this.io = io;
    
    /**
     * Clients connectés indexés par socket.id
     * @type {Map<string, Object>} socketId -> {socket, userId, userType, page, connectedAt}
     */
    this.connectedClients = new Map();
    
    /**
     * Logger pour les opérations
     * @type {Logger}
     */
    this.Logger = Logger;
  }

  // ========================================================================
  // GESTION DES CLIENTS
  // ========================================================================

  /**
   * Enregistre un client connecté et gère les sessions multiples
   * @param {Socket} socket - Client Socket.io
   * @param {number} userId - Identifiant de l'utilisateur
   * @param {string} [userType='user'] - Type d'utilisateur (admin, user)
   * @param {string} [page='unknown'] - Page actuelle (modules, admin, dashboard)
   */
  registerClient(socket, userId, userType = 'user', page = 'unknown') {
    const existingClients = Array.from(this.connectedClients.values()).filter(
      client => client.userId === userId
    );

    if (existingClients.length > 0) {
      Logger.activity.warn(
        `User ${userId} already has ${existingClients.length} connection(s), replacing older ones...`
      );

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
   * Supprime un client déconnecté
   * @param {string} socketId - Identifiant du socket
   */
  unregisterClient(socketId) {
    const client = this.connectedClients.get(socketId);
    if (client) {
      Logger.activity.debug(`Client désenregistré : ${socketId} (Utilisateur ${client.userId})`);
      this.connectedClients.delete(socketId);
    }
  }

  // ========================================================================
  // ÉMISSION D'ÉVÉNEMENTS
  // ========================================================================

  /**
   * Diffuse un événement à tous les clients connectés
   * @param {string} event - Nom de l'événement
   * @param {Object} data - Données à envoyer
   */
  broadcast(event, data) {
    Logger.system.info(`Diffusion '${event}' à ${this.connectedClients.size} clients`);
    this.io.emit(event, data);
  }

  /**
   * Émet un événement à un utilisateur spécifique
   * @param {number} userId - Identifiant de l'utilisateur
   * @param {string} event - Nom de l'événement
   * @param {Object} data - Données à envoyer
   */
  emitToUser(userId, event, data) {
    const clients = Array.from(this.connectedClients.values()).filter(
      client => client.userId === userId
    );

    clients.forEach(client => {
      client.socket.emit(event, data);
    });

    if (clients.length > 0) {
      Logger.system.debug(`Émission '${event}' vers utilisateur ${userId} (${clients.length} clients)`);
    }
  }

  /**
   * Émet un événement à tous les administrateurs
   * @param {string} event - Nom de l'événement
   * @param {Object} data - Données à envoyer
   */
  emitToAdmins(event, data) {
    const adminClients = Array.from(this.connectedClients.values()).filter(
      client => client.userType === 'admin'
    );

    adminClients.forEach(client => {
      client.socket.emit(event, data);
    });

    if (adminClients.length > 0) {
      if (event.includes('telemetry') || event.includes('last_seen')) {
        Logger.system.debug(`Émission '${event}' vers ${adminClients.length} admin(s)`);
      } else {
        Logger.system.debug(`Émission '${event}' vers ${adminClients.length} admin(s)`);
      }
    }
  }

  /**
   * Émet un événement aux clients d'une page spécifique
   * @param {string} page - Page cible (modules, admin, dashboard)
   * @param {string} event - Nom de l'événement
   * @param {Object} data - Données à envoyer
   */
  emitToPage(page, event, data) {
    const pageClients = Array.from(this.connectedClients.values()).filter(
      client => client.page === page
    );

    pageClients.forEach(client => {
      client.socket.emit(event, data);
    });

    if (pageClients.length > 0) {
      Logger.system.debug(`Émission '${event}' vers page '${page}' (${pageClients.length} clients)`);
    }
  }

  // ========================================================================
  // STATISTIQUES
  // ========================================================================

  /**
   * Récupère les statistiques de connexion
   * @returns {Object} Statistiques détaillées des connexions
   * @returns {number} returns.total - Nombre total de clients connectés
   * @returns {number} returns.uniqueUsers - Nombre d'utilisateurs uniques
   * @returns {Object} returns.byPage - Répartition par page
   * @returns {Object} returns.byType - Répartition par type d'utilisateur
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

/**
 * Export du gestionnaire d'événements
 * @module EventsManager
 * @description Gestionnaire centralisé pour l'émission d'événements WebSocket ciblés
 * 
 * @example
 * const EventsManager = require('./api/EventsManager');
 * const events = new EventsManager(io);
 * 
 * // Enregistrer un client
 * events.registerClient(socket, userId, 'admin', 'dashboard');
 * 
 * // Émettre des événements ciblés
 * events.emitToUser(123, 'notification', { message: 'Hello!' });
 * events.emitToAdmins('system:alert', { level: 'warning', message: 'Alerte' });
 * events.emitToPage('modules', 'module:update', moduleData);
 */
module.exports = EventsManager;
