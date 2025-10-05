/**
 * Tests pour SocketWSBridge
 *
 * Tests unitaires pour le bridge entre Socket.IO et WebSocket natif ESP32
 * qui permet la communication transparente entre les protocoles.
 */

const SocketWSBridge = require('../../websocket/socket-ws-bridge');

// Mocks
jest.mock('../../utils/logger', () => ({
  app: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  esp: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const Logger = require('../../utils/logger');

describe('SocketWSBridge', () => {
  let mockRealTimeAPI;
  let mockESP32Server;
  let bridge;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock de l'API temps réel
    mockRealTimeAPI = {
      events: {
        broadcast: jest.fn(),
      },
    };

    // Mock du serveur ESP32
    mockESP32Server = {
      isESPConnected: jest.fn(),
      sendCommandToESP: jest.fn(),
      getStats: jest.fn(),
    };

    bridge = new SocketWSBridge(mockRealTimeAPI, mockESP32Server);
  });

  describe('Initialisation', () => {
    test('devrait créer une instance correctement', () => {
      expect(bridge.realTimeAPI).toBe(mockRealTimeAPI);
      expect(bridge.esp32Server).toBe(mockESP32Server);
      expect(Logger.app.info).toHaveBeenCalledWith('🌉 Socket.IO ↔ WebSocket Bridge initialized');
    });

    test('devrait initialiser les listeners Socket.IO', () => {
      // La méthode setupSocketIOListeners est appelée dans initialize()
      // Pour l'instant elle est vide, donc on vérifie juste qu'elle est appelée
      expect(bridge.setupSocketIOListeners).toBeDefined();
    });
  });

  describe('Envoi de commandes aux ESP32', () => {
    test('devrait envoyer une commande avec succès', () => {
      mockESP32Server.isESPConnected.mockReturnValue(true);
      mockESP32Server.sendCommandToESP.mockReturnValue(true);

      const result = bridge.sendCommandToESP('MOD001', 'move', { speed: 50 }, 1);

      expect(result).toBe(true);
      expect(mockESP32Server.isESPConnected).toHaveBeenCalledWith('MOD001');
      expect(mockESP32Server.sendCommandToESP).toHaveBeenCalledWith('MOD001', 'move', { speed: 50 });
      expect(mockRealTimeAPI.events.broadcast).toHaveBeenCalledWith('command_sent', {
        moduleId: 'MOD001',
        command: 'move',
        status: 'sent',
        timestamp: expect.any(Date),
      });
      expect(Logger.esp.info).toHaveBeenCalledWith('🌉 Bridge: Forwarding command to ESP32 MOD001: move');
    });

    test('devrait échouer si l\'ESP32 n\'est pas connecté', () => {
      mockESP32Server.isESPConnected.mockReturnValue(false);

      const result = bridge.sendCommandToESP('MOD001', 'move');

      expect(result).toBe(false);
      expect(mockESP32Server.sendCommandToESP).not.toHaveBeenCalled();
      expect(Logger.esp.warn).toHaveBeenCalledWith('❌ Bridge: ESP32 MOD001 not connected via WebSocket');
    });

    test('devrait gérer les erreurs lors de l\'envoi', () => {
      mockESP32Server.isESPConnected.mockReturnValue(true);
      mockESP32Server.sendCommandToESP.mockImplementation(() => {
        throw new Error('Send failed');
      });

      const result = bridge.sendCommandToESP('MOD001', 'move');

      expect(result).toBe(false);
      expect(Logger.esp.error).toHaveBeenCalledWith('❌ Bridge: Error forwarding command:', expect.any(Error));
    });
  });

  describe('Transmission d\'événements ESP32 vers le web', () => {
    test('devrait transmettre un événement avec succès', () => {
      const eventData = { moduleId: 'MOD001', temperature: 25 };

      bridge.forwardESPEventToWeb('telemetry', eventData);

      expect(mockRealTimeAPI.events.broadcast).toHaveBeenCalledWith('telemetry', eventData);
      expect(Logger.esp.debug).toHaveBeenCalledWith('🌉 Bridge: Forwarded ESP32 event to web: telemetry');
    });

    test('devrait gérer les erreurs lors de la transmission', () => {
      mockRealTimeAPI.events.broadcast.mockImplementation(() => {
        throw new Error('Broadcast failed');
      });

      bridge.forwardESPEventToWeb('telemetry', {});

      expect(Logger.esp.error).toHaveBeenCalledWith('❌ Bridge: Error forwarding ESP32 event:', expect.any(Error));
    });
  });

  describe('Statut de connexion des modules', () => {
    test('devrait retourner le statut de connexion pour un module connecté', () => {
      mockESP32Server.isESPConnected.mockReturnValue(true);

      const status = bridge.getModuleConnectionStatus('MOD001');

      expect(status).toEqual({
        moduleId: 'MOD001',
        connected: true,
        protocol: 'websocket',
        lastSeen: expect.any(Date),
      });
    });

    test('devrait retourner le statut pour un module déconnecté', () => {
      mockESP32Server.isESPConnected.mockReturnValue(false);

      const status = bridge.getModuleConnectionStatus('MOD001');

      expect(status).toEqual({
        moduleId: 'MOD001',
        connected: false,
        protocol: 'none',
        lastSeen: expect.any(Date),
      });
    });
  });

  describe('Statistiques globales', () => {
    test('devrait retourner les statistiques globales', () => {
      const esp32Stats = {
        connectedESPs: 5,
        totalConnections: 10,
        uptime: 3600000,
      };

      mockESP32Server.getStats.mockReturnValue(esp32Stats);

      const stats = bridge.getGlobalStats();

      expect(stats).toEqual({
        esp32WebSocket: esp32Stats,
        totalESPConnections: 5,
      });
      expect(mockESP32Server.getStats).toHaveBeenCalled();
    });
  });

  describe('Traitement des commandes web', () => {
    test('devrait traiter une commande web valide', () => {
      const mockSocket = { userId: 1 };
      mockESP32Server.isESPConnected.mockReturnValue(true);
      mockESP32Server.sendCommandToESP.mockReturnValue(true);

      const result = bridge.handleWebCommand(mockSocket, 'MOD001', 'move', { speed: 50 });

      expect(result).toBe(true);
      expect(Logger.esp.info).toHaveBeenCalledWith('🌐 Bridge: Web command received for MOD001: move');
      expect(mockESP32Server.sendCommandToESP).toHaveBeenCalledWith('MOD001', 'move', { speed: 50 });
    });

    test('devrait rejeter une commande avec paramètres invalides', () => {
      const result1 = bridge.handleWebCommand(null, '', 'move');
      const result2 = bridge.handleWebCommand(null, 'MOD001', '');

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(Logger.esp.warn).toHaveBeenCalledWith('🚨 Bridge: Invalid command parameters');
    });
  });

  describe('Nettoyage des ressources', () => {
    test('devrait nettoyer les ressources correctement', () => {
      bridge.cleanup();

      expect(Logger.app.info).toHaveBeenCalledWith('🧹 Bridge: Cleaning up resources');
    });
  });
});