/**
 * Serveur WebSocket ESP32 - Communication IoT native
 * 
 * Serveur WebSocket natif dédié aux modules ESP32 fonctionnant en parallèle
 * avec Socket.IO pour assurer la communication directe avec les modules IoT.
 * 
 * @module ESP32WebSocketServer
 * @description Serveur WebSocket natif pour la communication avec les modules ESP32
 */

const WebSocket = require('ws');
const Logger = require('../utils/logger');
const databaseManager = require('../bdd/DatabaseManager');

/**
 * Serveur WebSocket natif pour modules ESP32
 * Gère les connexions directes et la communication avec les modules IoT
 * @class ESP32WebSocketServer
 */
class ESP32WebSocketServer {
  /**
   * Crée une instance du serveur ESP32
   * @param {Object} server - Serveur HTTP pour WebSocket
   * @param {RealTimeAPI} realTimeAPI - API temps réel pour événements
   */
  constructor(server, realTimeAPI) {
    this.server = server;
    this.realTimeAPI = realTimeAPI;
    this.wss = null;
    this.connectedESPs = new Map(); // moduleId -> ws
    this.modulesBySocket = new Map(); // ws -> moduleInfo
  }

  /**
   * Initialise le serveur WebSocket natif pour ESP32
   * Configure le serveur sur le path /esp32 et les gestionnaires d'événements
   * @returns {void}
   */
  initialize() {
    this.wss = new WebSocket.Server({
      server: this.server,
      path: '/esp32'
    });

    Logger.esp.info('🔌 ESP32 WebSocket Server initialized on path /esp32');

    this.wss.on('connection', (ws, req) => {
      this.handleESPConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      Logger.esp.error('❌ WebSocket Server error:', error);
    });
  }

  /**
   * Gère une nouvelle connexion ESP32
   * Configure les paramètres TCP, timeouts et gestionnaires d'événements
   * @param {WebSocket} ws - Socket WebSocket ESP32
   * @param {Object} req - Requête HTTP de connexion
   * @returns {void}
   * @private
   */
  handleESPConnection(ws, req) {
    const clientIP = req.socket.remoteAddress;
    Logger.esp.info(`🤖 New ESP32 connection from ${clientIP}`);

    if (req.socket.setKeepAlive) {
      req.socket.setKeepAlive(true, 10000);
      req.socket.setTimeout(15000);
    }

    req.socket.on('error', () => {
      Logger.esp.warn(`🔌 TCP socket error for ${ws.moduleId || clientIP}`);
      this.handleESPDisconnection(ws, 1006, 'TCP socket error');
    });

    req.socket.on('timeout', () => {
      Logger.esp.warn(`⏰ TCP socket timeout for ${ws.moduleId || clientIP}`);
      this.handleESPDisconnection(ws, 1006, 'TCP timeout');
      req.socket.destroy();
    });

    const identTimeout = setTimeout(() => {
      if (!ws.moduleId) {
        Logger.esp.warn('⏰ ESP32 identification timeout - disconnecting');
        ws.close(1008, 'Identification timeout');
      }
    }, 10000);

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleESPMessage(ws, message);
      } catch (error) {
        Logger.esp.error('❌ Invalid JSON from ESP32:', error);
        ws.close(1003, 'Invalid JSON');
      }
    });

    ws.on('close', (code, reason) => {
      clearTimeout(identTimeout);
      this.handleESPDisconnection(ws, code, reason);
    });

    ws.on('error', (error) => {
      Logger.esp.error('❌ ESP32 WebSocket error:', error);
    });

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
  }

  /**
   * Traite un message reçu d'un ESP32
   * Route les messages selon leur type (identify, telemetry, pong)
   * @param {WebSocket} ws - Socket WebSocket ESP32
   * @param {Object} message - Message JSON reçu
   * @param {string} message.type - Type de message
   * @returns {Promise<void>}
   * @private
   */
  async handleESPMessage(ws, message) {
    const { type, moduleId, password } = message;

    Logger.esp.debug(`[RX ESP32] ${ws.moduleId || 'unidentified'} -> ${type}`);

    switch (type) {
      case 'module_identify':
        await this.handleAuthentication(ws, message);
        break;

      case 'telemetry':
        await this.handleTelemetry(ws, message);
        break;

      case 'heartbeat':
        await this.handleHeartbeat(ws, message);
        break;

      case 'command_response':
        await this.handleCommandResponse(ws, message);
        break;

      case 'pong':
        if (ws.pingTimeout) {
          clearTimeout(ws.pingTimeout);
          ws.pingTimeout = null;
        }
        Logger.esp.debug(`🏓 Pong received from ${ws.moduleId}`);
        break;

      default:
        Logger.esp.warn(`Unknown message type from ESP32: ${type}`);
    }
  }

  /**
   * Gère l'authentification d'un module ESP32
   * Vérifie les identifiants et enregistre le module connecté
   * @param {WebSocket} ws - Socket WebSocket ESP32
   * @param {Object} message - Message d'identification
   * @param {string} message.moduleId - ID du module
   * @param {string} message.password - Mot de passe du module
   * @returns {Promise<void>}
   * @throws {Error} Si authentification échouée
   * @private
   */
  async handleAuthentication(ws, message) {
    const { moduleId, password, moduleType, uptime, position } = message;

    if (!moduleId || !password) {
      Logger.esp.warn('🚨 ESP32 authentication missing credentials');
      ws.close(1008, 'Missing credentials');
      return;
    }

    try {
      // Validation sécurisée via DatabaseManager
      const moduleAuth = await databaseManager.modules.validateModuleAuth(moduleId, password);

      if (!moduleAuth) {
        Logger.esp.warn(`🚨 ESP32 authentication failed: ${moduleId}`);
        ws.close(1008, 'Authentication failed');
        return;
      }

      const existingWS = this.connectedESPs.get(moduleId);
      if (existingWS && existingWS !== ws) {
        Logger.esp.warn(`⚠️ Disconnecting previous ESP32 session: ${moduleId}`);
        existingWS.close(1000, 'New session');
        this.modulesBySocket.delete(existingWS);
      }

      ws.moduleId = moduleId;
      ws.moduleAuth = moduleAuth;
      ws.moduleType = moduleType || 'Unknown';

      const moduleInfo = {
        moduleId,
        moduleType: ws.moduleType,
        userId: moduleAuth.userId,
        connectedAt: new Date(),
        authenticated: true
      };

      this.connectedESPs.set(moduleId, ws);
      this.modulesBySocket.set(ws, moduleInfo);

      if (this.realTimeAPI?.modules) {
        const pseudoSocket = {
          id: `esp32-${moduleId}`,
          moduleId,
          moduleAuth,
          moduleType: ws.moduleType
        };

        this.realTimeAPI.modules.registerESP(pseudoSocket, moduleId, ws.moduleType);
      }

      this.sendToESP(ws, {
        type: 'connected',
        status: 'authenticated',
        initialState: { uptime, position }
      });

      await databaseManager.modules.updateStatus(moduleId, 'online');

      this.startCustomPing(ws);

      Logger.esp.info(`✅ ESP32 authenticated: ${moduleId} (${ws.moduleType})`);

    } catch (error) {
      Logger.esp.error('❌ ESP32 authentication error:', error);
      ws.close(1011, 'Server error');
    }
  }

  /**
   * Traite les données de télémétrie d'un module
   * Met à jour la base de données et diffuse aux clients connectés
   * @param {WebSocket} ws - Socket WebSocket ESP32
   * @param {Object} message - Données de télémétrie
   * @param {number} [message.position] - Position du module
   * @param {Object} [message.sensors] - Données des capteurs
   * @returns {Promise<void>}
   * @private
   */
  async handleTelemetry(ws, message) {
    if (!ws.moduleId || !ws.moduleAuth) {
      Logger.esp.warn('🚨 Unauthenticated telemetry attempt');
      ws.close(1008, 'Not authenticated');
      return;
    }

    Logger.esp.info(`📊 [TELEMETRY] Received from ${ws.moduleId}`);
    
    const { uptime, position, status } = message;
    const telemetryData = {
      uptime,
      position,
      status,
      timestamp: new Date()
    };

    Logger.esp.info(`📊 [TELEMETRY] Data: ${JSON.stringify(telemetryData)}`);

    if (this.realTimeAPI?.events) {
      this.realTimeAPI.events.broadcast('module_telemetry', {
        moduleId: ws.moduleId,
        ...telemetryData
      });
      Logger.esp.info(`📊 [TELEMETRY] Broadcasted to web clients for ${ws.moduleId}`);
    } else {
      Logger.esp.error(`❌ [TELEMETRY] RealTimeAPI not available!`);
    }

    await databaseManager.modules.updateStatus(ws.moduleId, 'online');

    Logger.esp.debug(`📊 Telemetry from ${ws.moduleId}: ${position || 'unknown'}`);
  }

  /**
   * Gère les heartbeats ESP32
   * Maintient la connexion active et met à jour le statut du module
   * @param {WebSocket} ws - Socket WebSocket ESP32
   * @param {Object} message - Données de heartbeat
   * @param {number} [message.uptime] - Temps de fonctionnement du module
   * @param {number} [message.position] - Position actuelle
   * @param {number} [message.wifiRSSI] - Force du signal WiFi
   * @param {number} [message.freeHeap] - Mémoire libre disponible
   * @returns {Promise<void>}
   * @private
   */
  async handleHeartbeat(ws, message) {
    if (!ws.moduleId) return;

    const { uptime, position, wifiRSSI, freeHeap } = message;

    Logger.esp.debug(`💓 Heartbeat from ${ws.moduleId}`);

    await databaseManager.modules.updateStatus(ws.moduleId, 'online');
  }

  /**
   * Gère les réponses aux commandes ESP32
   * Diffuse les résultats de commandes aux clients web connectés
   * @param {WebSocket} ws - Socket WebSocket ESP32
   * @param {Object} message - Réponse de commande
   * @param {string} message.command - Commande exécutée
   * @param {string} message.status - Statut d'exécution (success/error)
   * @param {number} [message.position] - Position après exécution
   * @returns {Promise<void>}
   * @private
   */
  async handleCommandResponse(ws, message) {
    if (!ws.moduleId) return;

    const { command, status, position } = message;

    // Transmettre la réponse aux clients web
    if (this.realTimeAPI?.events) {
      this.realTimeAPI.events.broadcast('module_command_response', {
        moduleId: ws.moduleId,
        command,
        status,
        position,
        timestamp: new Date()
      });
    }

    Logger.esp.info(`✅ Command response from ${ws.moduleId}: ${command} -> ${status}`);
  }

  /**
   * Gère la déconnexion d'un module ESP32
   * Nettoie les ressources, timeouts et notifie le système
   * @param {WebSocket} ws - Socket WebSocket déconnecté
   * @param {number} code - Code de fermeture WebSocket
   * @param {string} reason - Raison de la déconnexion
   * @returns {void}
   * @private
   */
  handleESPDisconnection(ws, code, reason) {
    const moduleInfo = this.modulesBySocket.get(ws);
    
    if (!moduleInfo) {
      Logger.esp.debug(`🔴 Disconnection ignored - no module info for socket`);
      return;
    }
    
    const { moduleId } = moduleInfo;
    
    this.connectedESPs.delete(moduleId);
    this.modulesBySocket.delete(ws);

    if (ws.pingInterval) {
      clearInterval(ws.pingInterval);
      ws.pingInterval = null;
    }
    if (ws.pingTimeout) {
      clearTimeout(ws.pingTimeout);
      ws.pingTimeout = null;
    }

    if (this.realTimeAPI?.modules) {
      const pseudoSocket = { id: `esp32-${moduleId}`, moduleId };
      this.realTimeAPI.modules.unregisterESP(pseudoSocket);
    }

    databaseManager.modules.updateStatus(moduleId, 'offline').catch(Logger.esp.error);

    Logger.esp.info(`🔴 ESP32 disconnected: ${moduleId} (code: ${code})`);
  }

  /**
   * Envoie une commande à un ESP32 spécifique
   * Vérifie la connexion et transmet la commande au module
   * @param {string} moduleId - ID du module ESP32 cible
   * @param {string} command - Commande à exécuter
   * @param {Object} [params={}] - Paramètres de la commande
   * @returns {boolean} True si envoyé avec succès, false sinon
   * @public
   */
  sendCommandToESP(moduleId, command, params = {}) {
    const ws = this.connectedESPs.get(moduleId);
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      Logger.esp.warn(`❌ Cannot send command to ${moduleId}: not connected`);
      return false;
    }

    const message = {
      type: 'command',
      data: {
        command,
        ...params
      },
      timestamp: new Date().toISOString()
    };

    this.sendToESP(ws, message);
    Logger.esp.info(`📤 Command sent to ${moduleId}: ${command}`);
    return true;
  }

  /**
   * Envoie un message JSON à un ESP32
   * Vérifie l'état de la connexion avant l'envoi
   * @param {WebSocket} ws - Socket WebSocket ESP32
   * @param {Object} message - Message JSON à envoyer
   * @returns {void}
   * @private
   */
  sendToESP(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      Logger.esp.debug(`[TX ESP32] -> ${ws.moduleId || 'unidentified'}: ${message.type}`);
    }
  }

  /**
   * Vérifie si un module ESP32 est connecté et actif
   * Contrôle la présence et l'état de la connexion WebSocket
   * @param {string} moduleId - ID du module à vérifier
   * @returns {boolean} True si connecté et actif, false sinon
   * @public
   */
  isESPConnected(moduleId) {
    const ws = this.connectedESPs.get(moduleId);
    return ws && ws.readyState === WebSocket.OPEN;
  }

  /**
   * Obtient les statistiques de connexion ESP32
   * Retourne le nombre de modules connectés et authentifiés
   * @returns {Object} Statistiques des connexions
   * @returns {number} returns.connectedESPs - Nombre d'ESP32 connectés
   * @returns {number} returns.authenticatedModules - Nombre de modules authentifiés
   * @public
   */
  getStats() {
    return {
      connectedESPs: this.connectedESPs.size,
      authenticatedModules: Array.from(this.modulesBySocket.values()).filter(info => info.authenticated).length
    };
  }

  /**
   * Démarre le ping applicatif personnalisé pour un ESP32
   * Envoie des pings périodiques pour détecter les connexions mortes
   * @param {WebSocket} ws - Socket WebSocket ESP32
   * @returns {void}
   * @private
   */
  startCustomPing(ws) {
    ws.pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.lastPing = Date.now();
        this.sendToESP(ws, { type: 'ping', timestamp: ws.lastPing });
        
        ws.pingTimeout = setTimeout(() => {
          Logger.esp.warn(`💔 Custom ping timeout for ${ws.moduleId}`);
          this.handleESPDisconnection(ws, 1006, 'Custom ping timeout');
          ws.close();
        }, 10000);
      }
    }, 60000);
  }

  /**
   * Démarre le vérificateur de heartbeat global
   * Surveille toutes les connexions ESP32 et détecte les connexions mortes
   * @returns {void}
   * @public
   */
  startHeartbeatChecker() {
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          Logger.esp.warn(`💔 ESP32 heartbeat timeout: ${ws.moduleId || 'unidentified'}`);
          
          this.handleESPDisconnection(ws, 1006, 'Heartbeat timeout');
          
          return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }
}

module.exports = ESP32WebSocketServer;