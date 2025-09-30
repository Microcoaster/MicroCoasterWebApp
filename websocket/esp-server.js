/**
 * ========================================    Logger.esp.info(`🤖 New ESP32 connection from ${clientIP}`);===================================
 * ESP32 WEBSOCKET NATIF SERVER
 * ============================================================================
 * Serveur WebSocket    Logger.esp.debug(`📈 Telemetry from ${ws.moduleId}: ${position || 'unknown'}`);natif dédié aux modules ESP32
 * Fonctionne en parallèle avec Socket.IO pour le web
 * ============================================================================
 */

const WebSocket = require('ws');
const Logger = require('../utils/logger');
const databaseManager = require('../bdd/DatabaseManager');

class ESP32WebSocketServer {
  constructor(server, realTimeAPI) {
    this.server = server;
    this.realTimeAPI = realTimeAPI;
    this.wss = null;
    this.connectedESPs = new Map(); // moduleId -> ws
    this.modulesBySocket = new Map(); // ws -> moduleInfo
  }

  /**
   * Initialise le serveur WebSocket natif pour ESP32
   */
  initialize() {
    // Créer serveur WebSocket sur le path /esp32
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
   */
  handleESPConnection(ws, req) {
    const clientIP = req.socket.remoteAddress;
    Logger.esp.info(`🤖 New ESP32 connection from ${clientIP}`);

    // Timeout d'identification (10 secondes)
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

    // Heartbeat pour détecter les déconnexions
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
  }

  /**
   * Traite un message reçu d'un ESP32
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

      default:
        Logger.esp.warn(`Unknown message type from ESP32: ${type}`);
    }
  }

  /**
   * Authentification ESP32
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

      // Déconnecter ancienne session si elle existe
      const existingWS = this.connectedESPs.get(moduleId);
      if (existingWS && existingWS !== ws) {
        Logger.esp.warn(`⚠️ Disconnecting previous ESP32 session: ${moduleId}`);
        existingWS.close(1000, 'New session');
        this.modulesBySocket.delete(existingWS);
      }

      // Enregistrer la nouvelle connexion
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

      // Notifier le système via RealTimeAPI
      if (this.realTimeAPI?.modules) {
        // Créer un pseudo-socket compatible avec l'API existante
        const pseudoSocket = {
          id: `esp32-${moduleId}`,
          moduleId,
          moduleAuth,
          moduleType: ws.moduleType
        };

        this.realTimeAPI.modules.registerESP(pseudoSocket, moduleId, ws.moduleType);
      }

      // Réponse d'authentification
      this.sendToESP(ws, {
        type: 'connected',
        status: 'authenticated',
        initialState: { uptime, position }
      });

      // Mettre à jour le statut en base
      await databaseManager.modules.updateStatus(moduleId, 'online');

      Logger.esp.info(`✅ ESP32 authenticated: ${moduleId} (${ws.moduleType})`);

    } catch (error) {
      Logger.esp.error('❌ ESP32 authentication error:', error);
      ws.close(1011, 'Server error');
    }
  }

  /**
   * Gère la télémétrie ESP32
   */
  async handleTelemetry(ws, message) {
    if (!ws.moduleId || !ws.moduleAuth) {
      Logger.esp.warn('🚨 Unauthenticated telemetry attempt');
      ws.close(1008, 'Not authenticated');
      return;
    }

    const { uptime, position, status } = message;
    const telemetryData = {
      uptime,
      position,
      status,
      timestamp: new Date()
    };

    // Transmettre aux clients web via RealTimeAPI
    if (this.realTimeAPI?.events) {
      this.realTimeAPI.events.broadcast('module_telemetry', {
        moduleId: ws.moduleId,
        ...telemetryData
      });
    }

    // Mettre à jour le statut
    await databaseManager.modules.updateStatus(ws.moduleId, 'online');

    Logger.esp.debug(`📊 Telemetry from ${ws.moduleId}: ${position || 'unknown'}`);
  }

  /**
   * Gère les heartbeats ESP32
   */
  async handleHeartbeat(ws, message) {
    if (!ws.moduleId) return;

    const { uptime, position, wifiRSSI, freeHeap } = message;

    // Optionnel : transmettre les heartbeats au web (moins fréquent que télémétrie)
    Logger.esp.debug(`💓 Heartbeat from ${ws.moduleId}`);

    // Mettre à jour le "last seen"
    await databaseManager.modules.updateStatus(ws.moduleId, 'online');
  }

  /**
   * Gère les réponses aux commandes
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
   * Gère la déconnexion ESP32
   */
  handleESPDisconnection(ws, code, reason) {
    const moduleInfo = this.modulesBySocket.get(ws);
    
    if (moduleInfo) {
      const { moduleId } = moduleInfo;
      
      // Nettoyer les maps
      this.connectedESPs.delete(moduleId);
      this.modulesBySocket.delete(ws);

      // Notifier le système
      if (this.realTimeAPI?.modules) {
        const pseudoSocket = { id: `esp32-${moduleId}`, moduleId };
        this.realTimeAPI.modules.unregisterESP(pseudoSocket);
      }

      // Notifier les clients web
      if (this.realTimeAPI?.events) {
        this.realTimeAPI.events.broadcast('module_offline', {
          moduleId,
          timestamp: new Date()
        });
      }

      // Mettre à jour le statut
      databaseManager.modules.updateStatus(moduleId, 'offline').catch(Logger.esp.error);

      Logger.esp.info(`🔴 ESP32 disconnected: ${moduleId} (code: ${code})`);
    } else {
      Logger.esp.info(`🔴 Unidentified ESP32 disconnected (code: ${code})`);
    }
  }

  /**
   * Envoie une commande à un ESP32 spécifique
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
   * Envoie un message à un ESP32
   */
  sendToESP(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      Logger.esp.debug(`[TX ESP32] -> ${ws.moduleId || 'unidentified'}: ${message.type}`);
    }
  }

  /**
   * Vérifie si un module ESP32 est connecté
   */
  isESPConnected(moduleId) {
    const ws = this.connectedESPs.get(moduleId);
    return ws && ws.readyState === WebSocket.OPEN;
  }

  /**
   * Obtient les statistiques de connexion ESP32
   */
  getStats() {
    return {
      connectedESPs: this.connectedESPs.size,
      authenticatedModules: Array.from(this.modulesBySocket.values()).filter(info => info.authenticated).length
    };
  }

  /**
   * Heartbeat checker pour détecter les connexions mortes
   */
  startHeartbeatChecker() {
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          Logger.esp.warn(`💔 ESP32 heartbeat timeout: ${ws.moduleId || 'unidentified'}`);
          return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // Toutes les 30 secondes
  }
}

module.exports = ESP32WebSocketServer;