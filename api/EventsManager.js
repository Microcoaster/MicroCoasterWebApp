const Logger = require('../utils/logger');

/**
 * Gestionnaire central des événements WebSocket temps réel
 * Permet d'émettre des événements vers tous les clients connectés ou des groupes spécifiques
 */
class EventsManager {
  constructor(io) {
    this.io = io;
    this.connectedClients = new Map(); // socketId -> { socket, userId, userType }
    this.Logger = Logger;
  }

  /**
   * Enregistre un client connecté
   * @param {Socket} socket - Socket.io client
   * @param {number} userId - ID utilisateur
   * @param {string} userType - Type d'utilisateur (admin, user)
   * @param {string} page - Page courante (modules, admin, dashboard)
   */
  registerClient(socket, userId, userType = 'user', page = 'unknown') {
    this.connectedClients.set(socket.id, {
      socket,
      userId,
      userType,
      page,
      connectedAt: new Date(),
    });

    Logger.info(`[Events] Client registered: ${socket.id} (User ${userId}, Type: ${userType}, Page: ${page})`);
  }

  /**
   * Supprime un client déconnecté
   * @param {string} socketId - ID du socket
   */
  unregisterClient(socketId) {
    const client = this.connectedClients.get(socketId);
    if (client) {
      Logger.info(`[Events] Client unregistered: ${socketId} (User ${client.userId})`);
      this.connectedClients.delete(socketId);
    }
  }

  /**
   * Émet un événement vers tous les clients connectés
   * @param {string} event - Nom de l'événement
   * @param {object} data - Données à envoyer
   */
  broadcast(event, data) {
    Logger.info(`[Events] Broadcasting '${event}' to ${this.connectedClients.size} clients`);
    this.io.emit(event, data);
  }

  /**
   * Émet un événement vers un utilisateur spécifique
   * @param {number} userId - ID de l'utilisateur
   * @param {string} event - Nom de l'événement
   * @param {object} data - Données à envoyer
   */
  emitToUser(userId, event, data) {
    const clients = Array.from(this.connectedClients.values())
      .filter(client => client.userId === userId);

    clients.forEach(client => {
      client.socket.emit(event, data);
    });

    if (clients.length > 0) {
      Logger.info(`[Events] Emitted '${event}' to user ${userId} (${clients.length} clients)`);
    }
  }

  /**
   * Émet un événement vers tous les admins
   * @param {string} event - Nom de l'événement
   * @param {object} data - Données à envoyer
   */
  emitToAdmins(event, data) {
    const adminClients = Array.from(this.connectedClients.values())
      .filter(client => client.userType === 'admin');

    adminClients.forEach(client => {
      client.socket.emit(event, data);
    });

    if (adminClients.length > 0) {
      Logger.info(`[Events] Emitted '${event}' to ${adminClients.length} admin(s)`);
    }
  }

  /**
   * Émet un événement vers tous les clients d'une page spécifique
   * @param {string} page - Page cible (modules, admin, dashboard)
   * @param {string} event - Nom de l'événement
   * @param {object} data - Données à envoyer
   */
  emitToPage(page, event, data) {
    const pageClients = Array.from(this.connectedClients.values())
      .filter(client => client.page === page);

    pageClients.forEach(client => {
      client.socket.emit(event, data);
    });

    if (pageClients.length > 0) {
      Logger.info(`[Events] Emitted '${event}' to page '${page}' (${pageClients.length} clients)`);
    }
  }

  /**
   * Obtient les statistiques des connexions
   */
  getStats() {
    const clientsByPage = {};
    const clientsByType = {};

    this.connectedClients.forEach(client => {
      // Par page
      if (!clientsByPage[client.page]) clientsByPage[client.page] = 0;
      clientsByPage[client.page]++;

      // Par type
      if (!clientsByType[client.userType]) clientsByType[client.userType] = 0;
      clientsByType[client.userType]++;
    });

    return {
      total: this.connectedClients.size,
      byPage: clientsByPage,
      byType: clientsByType,
    };
  }
}

module.exports = EventsManager;