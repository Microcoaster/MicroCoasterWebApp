/**
 * ============================================================================
 * BRIDGE ADAPTATEUR SOCKET.IO ↔ WEBSOCKET NATIF
 * ============================================================================
 * Permet la communication entre clients Socket.IO (web) et ESP32 WebSocket natif
 * Maintient la compatibilité totale avec l'API existante
 * ============================================================================
 */

const Logger = require('../utils/logger');

class SocketWSBridge {
  constructor(realTimeAPI, esp32Server) {
    this.realTimeAPI = realTimeAPI;
    this.esp32Server = esp32Server;
    this.initialize();
  }

  /**
   * Initialise le bridge entre les deux protocoles
   */
  initialize() {
    Logger.app.info('🌉 Socket.IO ↔ WebSocket Bridge initialized');

    // Écouter les événements Socket.IO pour les retransmettre aux ESP32
    this.setupSocketIOListeners();
  }

  /**
   * Configure les listeners Socket.IO pour capturer les commandes destinées aux ESP32
   */
  setupSocketIOListeners() {
    // Cette méthode sera appelée par les handlers Socket.IO
    // pour transmettre les commandes aux ESP32 via WebSocket natif
  }

  /**
   * Envoie une commande d'un client Socket.IO vers un ESP32 WebSocket
   * @param {string} moduleId - ID du module ESP32
   * @param {string} command - Commande à exécuter
   * @param {object} params - Paramètres additionnels
   * @param {string} userId - ID de l'utilisateur qui envoie la commande
   */
  sendCommandToESP(moduleId, command, params = {}, userId = null) {
    try {
      // Vérifier que l'ESP32 est connecté via WebSocket natif
      if (!this.esp32Server.isESPConnected(moduleId)) {
        Logger.esp.warn(`❌ Bridge: ESP32 ${moduleId} not connected via WebSocket`);
        return false;
      }

      // Log de la transmission
      Logger.esp.info(`🌉 Bridge: Forwarding command to ESP32 ${moduleId}: ${command}`);

      // Envoyer la commande via WebSocket natif
      const success = this.esp32Server.sendCommandToESP(moduleId, command, params);

      if (success) {
        // Notifier les clients Socket.IO du succès
        this.realTimeAPI.events.broadcast('command_sent', {
          moduleId,
          command,
          status: 'sent',
          timestamp: new Date()
        });
      }

      return success;

    } catch (error) {
      Logger.esp.error('❌ Bridge: Error forwarding command:', error);
      return false;
    }
  }

  /**
   * Retransmet un événement ESP32 vers les clients Socket.IO
   * @param {string} event - Nom de l'événement
   * @param {object} data - Données à transmettre
   */
  forwardESPEventToWeb(event, data) {
    try {
      // Retransmettre via Socket.IO aux clients web
      this.realTimeAPI.events.broadcast(event, data);
      
      Logger.esp.debug(`🌉 Bridge: Forwarded ESP32 event to web: ${event}`);

    } catch (error) {
      Logger.esp.error('❌ Bridge: Error forwarding ESP32 event:', error);
    }
  }

  /**
   * Vérifie si un module est accessible (via Socket.IO legacy ou WebSocket natif)
   * @param {string} moduleId - ID du module
   * @returns {object} État de la connexion
   */
  getModuleConnectionStatus(moduleId) {
    const isWebSocketConnected = this.esp32Server.isESPConnected(moduleId);
    
    return {
      moduleId,
      connected: isWebSocketConnected,
      protocol: isWebSocketConnected ? 'websocket' : 'none',
      lastSeen: new Date()
    };
  }

  /**
   * Obtient les statistiques globales de connexions
   */
  getGlobalStats() {
    const esp32Stats = this.esp32Server.getStats();
    
    return {
      esp32WebSocket: esp32Stats,
      totalESPConnections: esp32Stats.connectedESPs
    };
  }

  /**
   * Méthode helper pour les handlers Socket.IO
   * Remplace l'ancienne méthode sendSecureCommand
   */
  handleWebCommand(socketIOClient, moduleId, command, params = {}) {
    // Validation de sécurité (réutilise la logique existante)
    if (!moduleId || !command) {
      Logger.esp.warn('🚨 Bridge: Invalid command parameters');
      return false;
    }

    // Log de la requête web
    Logger.esp.info(`🌐 Bridge: Web command received for ${moduleId}: ${command}`);

    // Transmettre via WebSocket natif
    return this.sendCommandToESP(moduleId, command, params, socketIOClient.userId);
  }

  /**
   * Méthode de nettoyage
   */
  cleanup() {
    Logger.app.info('🧹 Bridge: Cleaning up resources');
    // Cleanup logic si nécessaire
  }
}

module.exports = SocketWSBridge;