/**
 * Bridge Socket.IO ↔ WebSocket - Adaptateur de protocoles
 * 
 * Adaptateur permettant la communication entre clients Socket.IO (web)
 * et modules ESP32 WebSocket natif avec compatibilité totale.
 * 
 * @module SocketWSBridge
 * @description Bridge pour communication entre Socket.IO et WebSocket natif ESP32
 */

const Logger = require('../utils/logger');

/**
 * Bridge adaptateur entre Socket.IO et WebSocket natif
 * Permet la communication transparente entre les deux protocoles
 * @class SocketWSBridge
 */
class SocketWSBridge {
  /**
   * Crée une instance du bridge
   * @param {RealTimeAPI} realTimeAPI - API temps réel
   * @param {ESP32WebSocketServer} esp32Server - Serveur ESP32
   */
  constructor(realTimeAPI, esp32Server) {
    this.realTimeAPI = realTimeAPI;
    this.esp32Server = esp32Server;
    this.initialize();
  }

  /**
   * Initialise le bridge entre les deux protocoles
   * Configure les écouteurs pour la communication bidirectionnelle
   * @returns {void}
   * @private
   */
  initialize() {
    Logger.app.info('🌉 Socket.IO ↔ WebSocket Bridge initialized');

    this.setupSocketIOListeners();
  }

  /**
   * Configure les listeners Socket.IO pour capturer les commandes ESP32
   * Établit la passerelle entre clients web et modules IoT
   * @returns {void}
   * @private
   */
  setupSocketIOListeners() {
  }

  /**
   * Envoie une commande d'un client Socket.IO vers un ESP32 WebSocket
   * Fait le pont entre l'interface web et les modules IoT
   * @param {string} moduleId - ID du module ESP32 cible
   * @param {string} command - Commande à exécuter (ex: 'move', 'stop')
   * @param {Object} [params={}] - Paramètres de la commande
   * @param {string} [userId=null] - ID de l'utilisateur émetteur pour audit
   * @returns {boolean} True si commande envoyée, false si module déconnecté
   * @public
   */
  sendCommandToESP(moduleId, command, params = {}, userId = null) {
    try {
      // Vérifier que l'ESP32 est connecté via WebSocket natif
      if (!this.esp32Server.isESPConnected(moduleId)) {
        Logger.esp.warn(`❌ Bridge: ESP32 ${moduleId} not connected via WebSocket`);
        return false;
      }

      Logger.esp.info(`🌉 Bridge: Forwarding command to ESP32 ${moduleId}: ${command}`);

      const success = this.esp32Server.sendCommandToESP(moduleId, command, params);

      if (success) {
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
   * Permet aux événements des modules d'être diffusés aux clients web
   * @param {string} event - Nom de l'événement (ex: 'telemetry', 'status')
   * @param {Object} data - Données à transmettre aux clients
   * @returns {void}
   * @public
   */
  forwardESPEventToWeb(event, data) {
    try {
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
   * Obtient les statistiques globales de toutes les connexions
   * Compile les données du serveur ESP32 WebSocket
   * @returns {Object} Statistiques globales
   * @returns {Object} returns.esp32WebSocket - Stats serveur ESP32
   * @returns {number} returns.totalESPConnections - Nombre total d'ESP32 connectés
   * @public
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
   * Traite les commandes web et les transmet aux ESP32 (remplace sendSecureCommand)
   * @param {Socket} socketIOClient - Client Socket.IO émetteur
   * @param {string} moduleId - ID du module ESP32 cible
   * @param {string} command - Commande à exécuter
   * @param {Object} [params={}] - Paramètres de la commande
   * @returns {boolean} True si commande transmise, false sinon
   * @public
   */
  handleWebCommand(socketIOClient, moduleId, command, params = {}) {
    if (!moduleId || !command) {
      Logger.esp.warn('🚨 Bridge: Invalid command parameters');
      return false;
    }

    Logger.esp.info(`🌐 Bridge: Web command received for ${moduleId}: ${command}`);

    return this.sendCommandToESP(moduleId, command, params, socketIOClient.userId);
  }

  /**
   * Nettoie les ressources du bridge
   * Ferme proprement les connexions et libère la mémoire
   * @returns {void}
   * @public
   */
  cleanup() {
    Logger.app.info('🧹 Bridge: Cleaning up resources');
  }
}

module.exports = SocketWSBridge;