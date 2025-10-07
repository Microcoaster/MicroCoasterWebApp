/**
 * Tests pour le simulateur ESP32 Switch Track
 *
 * Tests unitaires pour le simulateur de module switch track ESP32
 * qui simule les fonctionnalités WebSocket et les commandes matérielles.
 */

const WebSocket = require('ws');
const {
  startSimulator,
  disconnect,
  moduleState,
  config,
  setMockWebSocket,
  createAuthenticatedMessage,
  sendMessage,
  sendTelemetry,
  sendHeartbeat,
  simulateMovement,
  handleCommand,
  handleMessage,
  startTelemetry,
  stopTelemetry,
  connect,
  attemptReconnect,
  gracefulShutdown,
} = require('../../sim/sim-switch-track.cjs');

// Mocks
jest.mock('ws');

const MockWebSocket = {
  OPEN: 1,
  CLOSED: 3,
  CONNECTING: 0,
  CLOSING: 2,
};

WebSocket.mockImplementation(() => ({
  readyState: MockWebSocket.CONNECTING,
  on: jest.fn(),
  send: jest.fn(),
  close: jest.fn(),
}));

describe('ESP32 Switch Track Simulator', () => {
  let mockWS;
  let originalConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // jest.resetModules(); // Retiré pour éviter les problèmes de références

    // Re-importer le module après reset
    const simulator = require('../../sim/sim-switch-track.cjs');
    Object.assign(config, simulator.config);
    Object.assign(moduleState, simulator.moduleState);

    // Sauvegarder la config originale
    originalConfig = { ...config };

    // Reset module state
    Object.assign(moduleState, {
      position: 'left',
      isMoving: false,
      uptime: Date.now(),
      lastCommand: null,
      commandCount: 0,
      telemetryCount: 0,
      reconnectAttempts: 0,
    });

    // Mock console
    jest.spyOn(process.stdout, 'write').mockImplementation(() => {});
    jest.spyOn(process.stderr, 'write').mockImplementation(() => {});

    // Créer une instance mock WebSocket
    mockWS = new WebSocket();
    WebSocket.mockClear();

    // Assigner le mock WebSocket au simulateur
    simulator.setMockWebSocket(mockWS);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();

    // Restaurer la config
    Object.assign(config, originalConfig);

    // Reset ws to null
    setMockWebSocket(null);

    // Restaurer les mocks de process
    jest.restoreAllMocks();
  });

  describe('Configuration', () => {
    test('devrait avoir la configuration par défaut', () => {
      expect(config.serverUrl).toBe('ws://127.0.0.1:3000/esp32');
      expect(config.moduleId).toBe('MC-0001-ST');
      expect(config.telemetryInterval).toBe(5000);
      expect(config.heartbeatInterval).toBe(30000);
      expect(config.reconnectDelay).toBe(3000);
      expect(config.maxReconnectAttempts).toBe(5);
    });

    test("devrait utiliser les variables d'environnement", () => {
      process.env.SERVER_URL = 'ws://test.com:8080/esp32';
      process.env.MODULE_ID = 'TEST-001';
      process.env.MODULE_PASSWORD = 'testpass';

      // Recharger le module pour prendre en compte les env vars
      jest.resetModules();
      const reloadedConfig = require('../../sim/sim-switch-track.cjs').config;

      expect(reloadedConfig.serverUrl).toBe('ws://test.com:8080/esp32');
      expect(reloadedConfig.moduleId).toBe('TEST-001');
      expect(reloadedConfig.modulePassword).toBe('testpass');

      delete process.env.SERVER_URL;
      delete process.env.MODULE_ID;
      delete process.env.MODULE_PASSWORD;
    });
  });

  describe('État du module', () => {
    test("devrait initialiser l'état du module", () => {
      expect(moduleState.position).toBe('left');
      expect(moduleState.isMoving).toBe(false);
      expect(moduleState.commandCount).toBe(0);
      expect(moduleState.telemetryCount).toBe(0);
      expect(moduleState.reconnectAttempts).toBe(0);
    });
  });

  describe('Messages authentifiés', () => {
    test('devrait créer un message avec authentification', () => {
      const message = createAuthenticatedMessage('test', { data: 'value' });

      expect(message).toEqual({
        type: 'test',
        moduleId: config.moduleId,
        password: config.modulePassword,
        timestamp: expect.any(String),
        data: 'value',
      });
    });
  });

  describe('Envoi de messages', () => {
    test('devrait envoyer un message quand WebSocket est ouvert', () => {
      setMockWebSocket(mockWS);
      mockWS.readyState = MockWebSocket.OPEN;
      mockWS.send.mockReturnValue(true);

      const result = sendMessage('test', { data: 'value' });

      expect(result).toBe(true);
      expect(mockWS.send).toHaveBeenCalledWith(expect.stringContaining('"type":"test"'));
    });

    test("devrait échouer si WebSocket n'est pas ouvert", () => {
      mockWS.readyState = MockWebSocket.CLOSED;

      const result = sendMessage('test');

      expect(result).toBe(false);
      expect(mockWS.send).not.toHaveBeenCalled();
    });

    test("devrait gérer les erreurs d'envoi", () => {
      mockWS.readyState = MockWebSocket.OPEN;
      mockWS.send.mockImplementation(() => {
        throw new Error('Send failed');
      });

      const result = sendMessage('test');

      expect(result).toBe(false);
    });
  });

  describe('Télémétrie', () => {
    test('devrait envoyer les données de télémétrie', () => {
      setMockWebSocket(mockWS);
      mockWS.readyState = MockWebSocket.OPEN;
      mockWS.send.mockReturnValue(true);

      moduleState.position = 'right';
      moduleState.commandCount = 5;
      moduleState.uptime = Date.now() - 10000; // 10 secondes

      sendTelemetry();

      expect(mockWS.send).toHaveBeenCalledWith(expect.stringContaining('"type":"telemetry"'));
      expect(mockWS.send).toHaveBeenCalledWith(expect.stringContaining('"position":"right"'));
      expect(mockWS.send).toHaveBeenCalledWith(expect.stringContaining('"commandCount":5'));
      expect(mockWS.send).toHaveBeenCalledWith(expect.stringContaining('"uptime":10'));
    });

    test('devrait incrémenter le compteur de télémétrie', () => {
      mockWS.readyState = MockWebSocket.OPEN;
      mockWS.send.mockReturnValue(true);

      const initialCount = moduleState.telemetryCount;

      sendTelemetry();

      expect(moduleState.telemetryCount).toBe(initialCount + 1);
    });
  });

  describe('Heartbeat', () => {
    test('devrait envoyer un heartbeat', () => {
      setMockWebSocket(mockWS);
      mockWS.readyState = MockWebSocket.OPEN;
      mockWS.send.mockReturnValue(true);

      sendHeartbeat();

      expect(mockWS.send).toHaveBeenCalledWith(expect.stringContaining('"type":"heartbeat"'));
      expect(mockWS.send).toHaveBeenCalledWith(expect.stringContaining('"status":"alive"'));
    });
  });

  describe('Simulation matérielle', () => {
    test('devrait simuler un mouvement vers la droite', () => {
      const result = simulateMovement('right');

      expect(result).toBe(true);
      expect(moduleState.isMoving).toBe(true);
      expect(moduleState.position).toBe('left'); // Pas encore changé

      // Avancer le temps suffisamment pour terminer le mouvement (max 1500ms)
      jest.advanceTimersByTime(2000);

      expect(moduleState.isMoving).toBe(false);
      expect(moduleState.position).toBe('right');
      expect(moduleState.lastCommand).toBe('right');
      expect(moduleState.commandCount).toBe(1);
    });

    test('devrait refuser un mouvement si déjà en mouvement', () => {
      moduleState.isMoving = true;

      const result = simulateMovement('right');

      expect(result).toBe(false);
    });

    test('devrait ignorer si déjà en position cible', () => {
      moduleState.position = 'right';

      const result = simulateMovement('right');

      expect(result).toBe(true);
      expect(moduleState.isMoving).toBe(false);
    });

    test('devrait simuler le toggle', () => {
      moduleState.position = 'left';

      handleCommand({ command: 'toggle' });

      expect(moduleState.isMoving).toBe(true);

      jest.advanceTimersByTime(2000);

      expect(moduleState.position).toBe('right');
    });
  });

  describe('Gestion des commandes', () => {
    test('devrait gérer la commande switch_left', () => {
      setMockWebSocket(mockWS);
      mockWS.readyState = MockWebSocket.OPEN;
      mockWS.send.mockReturnValue(true);

      // Changer la position initiale pour que switch_left ait un effet
      moduleState.position = 'right';

      handleCommand({ command: 'switch_left' });

      expect(moduleState.isMoving).toBe(true);

      jest.advanceTimersByTime(2000);

      expect(moduleState.position).toBe('left');
    });

    test('devrait gérer la commande switch_right', () => {
      setMockWebSocket(mockWS);
      mockWS.readyState = MockWebSocket.OPEN;
      mockWS.send.mockReturnValue(true);

      handleCommand({ command: 'switch_right' });

      expect(moduleState.isMoving).toBe(true);

      jest.advanceTimersByTime(2000);

      expect(moduleState.position).toBe('right');
    });

    test('devrait gérer la commande get_status', () => {
      setMockWebSocket(mockWS);
      mockWS.readyState = MockWebSocket.OPEN;
      mockWS.send.mockReturnValue(true);

      moduleState.commandCount = 3;
      moduleState.uptime = Date.now() - 5000;

      handleCommand({ command: 'get_status' });

      expect(mockWS.send).toHaveBeenCalledWith(expect.stringContaining('"type":"status_response"'));
      expect(mockWS.send).toHaveBeenCalledWith(expect.stringContaining('"position":"left"'));
      expect(mockWS.send).toHaveBeenCalledWith(expect.stringContaining('"commandCount":3'));
    });

    test('devrait gérer la commande reset', () => {
      setMockWebSocket(mockWS);
      mockWS.readyState = MockWebSocket.OPEN;
      mockWS.send.mockReturnValue(true);

      moduleState.commandCount = 5;
      moduleState.telemetryCount = 10;

      handleCommand({ command: 'reset' });

      expect(moduleState.commandCount).toBe(0);
      expect(moduleState.telemetryCount).toBe(0);
      expect(mockWS.send).toHaveBeenCalledWith(expect.stringContaining('"type":"reset_response"'));
    });

    test('devrait gérer les commandes inconnues', () => {
      setMockWebSocket(mockWS);
      mockWS.readyState = MockWebSocket.OPEN;
      mockWS.send.mockReturnValue(true);

      handleCommand({ command: 'unknown' });

      expect(mockWS.send).toHaveBeenCalledWith(expect.stringContaining('"type":"command_error"'));
      expect(mockWS.send).toHaveBeenCalledWith(
        expect.stringContaining('"error":"Unknown command"')
      );
    });

    test('devrait gérer les données imbriquées', () => {
      setMockWebSocket(mockWS);
      mockWS.readyState = MockWebSocket.OPEN;
      mockWS.send.mockReturnValue(true);

      handleCommand({ data: { command: 'switch_right' } });

      expect(moduleState.isMoving).toBe(true);
    });
  });

  describe('Gestion des messages', () => {
    test("devrait gérer l'authentification réussie", () => {
      setMockWebSocket(mockWS);
      mockWS.readyState = MockWebSocket.OPEN;
      mockWS.send.mockReturnValue(true);

      handleMessage(JSON.stringify({ type: 'auth_success' }));

      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('[SWITCH-TRACK] ✅ Authentifié')
      );
    });

    test("devrait gérer l'erreur d'authentification", () => {
      handleMessage(JSON.stringify({ type: 'auth_error', message: 'Invalid password' }));

      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining('[SWITCH-TRACK] ❌ ❌ Erreur auth: Invalid password')
      );
    });

    test('devrait gérer les commandes', () => {
      setMockWebSocket(mockWS);
      mockWS.readyState = MockWebSocket.OPEN;
      mockWS.send.mockReturnValue(true);

      handleMessage(JSON.stringify({ type: 'command', command: 'switch_right' }));

      expect(moduleState.isMoving).toBe(true);
    });

    test('devrait gérer les ping', () => {
      setMockWebSocket(mockWS);
      mockWS.readyState = MockWebSocket.OPEN;
      mockWS.send.mockReturnValue(true);

      handleMessage(JSON.stringify({ type: 'ping', timestamp: '2023-01-01T00:00:00Z' }));

      expect(mockWS.send).toHaveBeenCalledWith(expect.stringContaining('"type":"pong"'));
    });

    test('devrait gérer les messages inconnus', () => {
      handleMessage(JSON.stringify({ type: 'unknown' }));

      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('[SWITCH-TRACK] 📥 Message: unknown')
      );
    });

    test('devrait gérer les erreurs de parsing JSON', () => {
      handleMessage('invalid json');

      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining('[SWITCH-TRACK] ❌ Erreur parsing:')
      );
    });
  });

  describe('Télémétrie et heartbeat', () => {
    test('devrait démarrer la télémétrie', () => {
      setMockWebSocket(mockWS);
      mockWS.readyState = MockWebSocket.OPEN;
      mockWS.send.mockReturnValue(true);

      startTelemetry();

      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('[SWITCH-TRACK] 📡 Télémétrie démarrée')
      );

      // Avancer le temps pour déclencher la télémétrie
      jest.advanceTimersByTime(5000);

      expect(mockWS.send).toHaveBeenCalledWith(expect.stringContaining('"type":"telemetry"'));

      // Avancer pour le heartbeat
      jest.advanceTimersByTime(30000);

      expect(mockWS.send).toHaveBeenCalledWith(expect.stringContaining('"type":"heartbeat"'));
    });

    test('devrait arrêter la télémétrie', () => {
      startTelemetry();
      stopTelemetry();

      expect(process.stdout.write).toHaveBeenLastCalledWith(
        expect.stringContaining('[SWITCH-TRACK] 📡 Télémétrie arrêtée')
      );
    });
  });

  describe('Connexion WebSocket', () => {
    test('devrait établir une connexion WebSocket', () => {
      connect();

      expect(WebSocket).toHaveBeenCalledWith(config.serverUrl);
    });

    test('devrait gérer la fermeture de connexion', () => {
      connect();

      // Simuler la fermeture via les handlers
      const mockWSInstance = WebSocket.mock.results[WebSocket.mock.results.length - 1].value;
      const closeHandler = mockWSInstance.on.mock.calls.find(call => call[0] === 'close')[1];
      closeHandler(1000, 'Normal closure');

      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('[SWITCH-TRACK] 🔌 Connexion fermée')
      );
    });

    test('devrait gérer les erreurs WebSocket', () => {
      connect();

      const mockWSInstance = WebSocket.mock.results[WebSocket.mock.results.length - 1].value;
      const errorHandler = mockWSInstance.on.mock.calls.find(call => call[0] === 'error')[1];
      const testError = new Error('Connection failed');
      errorHandler(testError);

      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining('[SWITCH-TRACK] ❌ Erreur WebSocket: Connection failed')
      );
    });
  });

  describe('Reconnexion', () => {
    test('devrait tenter une reconnexion', () => {
      attemptReconnect();

      expect(moduleState.reconnectAttempts).toBe(1);

      // Avancer le temps pour déclencher la reconnexion
      jest.advanceTimersByTime(3000);

      expect(WebSocket).toHaveBeenCalledTimes(1);
    });

    test('devrait arrêter après le maximum de tentatives', () => {
      moduleState.reconnectAttempts = 5;

      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
      attemptReconnect();

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });
  });

  describe('Déconnexion', () => {
    test('devrait se déconnecter proprement', () => {
      // Simuler une connexion active
      setMockWebSocket(mockWS);
      mockWS.readyState = MockWebSocket.OPEN;

      disconnect();

      expect(mockWS.close).toHaveBeenCalled();
      expect(process.stdout.write).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('[SWITCH-TRACK] 🔌 Déconnexion...')
      );
    });
  });

  describe('Arrêt gracieux', () => {
    test('devrait gérer SIGINT', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

      gracefulShutdown();

      expect(process.stdout.write).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('[SWITCH-TRACK] 🛑 Arrêt du simulateur...')
      );
      expect(mockExit).toHaveBeenCalledWith(0);

      mockExit.mockRestore();
    });

    test('devrait gérer les exceptions non capturées', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

      process.emit('uncaughtException', new Error('Test error'));

      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining('[SWITCH-TRACK] ❌ Exception:')
      );
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('[SWITCH-TRACK] 🛑 Arrêt du simulateur...')
      );
      expect(mockExit).toHaveBeenCalledWith(0);

      mockExit.mockRestore();
    });
  });

  describe('Démarrage du simulateur', () => {
    test('devrait démarrer le simulateur', () => {
      startSimulator();

      expect(process.stdout.write).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('[SWITCH-TRACK] 🚀 Démarrage simulateur ESP32 Switch Track')
      );
      expect(WebSocket).toHaveBeenCalledWith(config.serverUrl);
    });
  });
});
