/**
 * Tests pour les gestionnaires WebSocket
 *
 * Tests unitaires pour les gestionnaires d'événements Socket.IO
 * qui gèrent les connexions clients, l'authentification et la communication.
 */

const WebSocketHandlers = require('../../websocket/handlers');

// Mocks
jest.mock('../../utils/logger', () => ({
  app: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  websocket: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  activity: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  modules: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  esp: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  system: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    statsIfChanged: jest.fn(),
  },
}));

jest.mock('../../bdd/DatabaseManager', () => ({
  getInstance: jest.fn(() => ({
    getUserDAO: jest.fn(() => ({
      getUserById: jest.fn(),
      updateUserLastSeen: jest.fn(),
    })),
    getModuleDAO: jest.fn(() => ({
      getModuleById: jest.fn(),
      updateModuleStatus: jest.fn(),
      claimModule: jest.fn(),
      unclaimModule: jest.fn(),
    })),
    modules: {
      findByUserId: jest.fn(),
    },
  })),
}));

const Logger = require('../../utils/logger');
const DatabaseManager = require('../../bdd/DatabaseManager');

describe('WebSocket Handlers', () => {
  let mockIo;
  let mockSocket;
  let mockSocketWSBridge;
  let mockDBManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock Socket.IO
    mockSocket = {
      id: 'socket123',
      request: {
        session: {
          user_id: 1,
          nickname: 'testuser',
          is_admin: false,
          code: 'USER-1',
        },
      },
      nsp: {
        server: {
          app: {
            locals: {
              realTimeAPI: {
                handleClientEvents: jest.fn(),
                events: {
                  registerClient: jest.fn(),
                  connectedClients: new Map(),
                  getStats: jest.fn(() => ({
                    uniqueUsers: 1,
                    total: 1,
                  })),
                  broadcast: jest.fn(),
                },
                modules: {
                  isModuleConnected: jest.fn(),
                  getConnectionStats: jest.fn(() => ({
                    connectedModules: 2,
                    onlineModules: 1,
                  })),
                  getCurrentStates: jest.fn(() => []),
                },
              },
              socketWSBridge: {
                handleWebCommand: jest.fn(),
              },
            },
          },
        },
      },
      emit: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      disconnect: jest.fn(),
      userData: null,
      isRegisteredWithEventsManager: false,
    };

    mockIo = {
      on: jest.fn(),
      emit: jest.fn(),
      to: jest.fn(() => ({ emit: jest.fn() })),
      sockets: {
        server: {
          app: {
            locals: {
              realTimeAPI: {
                handleClientEvents: jest.fn(),
                events: {
                  registerClient: jest.fn(),
                  connectedClients: new Map(),
                  getStats: jest.fn(() => ({
                    uniqueUsers: 1,
                    total: 1,
                  })),
                  broadcast: jest.fn(),
                },
                modules: {
                  isModuleConnected: jest.fn(),
                  getConnectionStats: jest.fn(() => ({
                    connectedModules: 2,
                    onlineModules: 1,
                  })),
                  getCurrentStates: jest.fn(() => []),
                },
              },
              socketWSBridge: {
                handleWebCommand: jest.fn(),
              },
            },
          },
        },
      },
      app: {
        locals: {
          socketWSBridge: {
            handleWebCommand: jest.fn(),
          },
        },
      },
    };

    // Mock du bridge WebSocket
    mockSocketWSBridge = {
      handleWebCommand: jest.fn(),
    };

    mockDBManager = DatabaseManager.getInstance();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Initialisation du gestionnaire', () => {
    test('devrait configurer les écouteurs Socket.IO', () => {
      WebSocketHandlers(mockIo, mockSocketWSBridge);

      expect(mockIo.on).toHaveBeenCalledWith('connection', expect.any(Function));
      expect(Logger.app.info).toHaveBeenCalledWith('🔌 Gestionnaire WebSocket initialisé (Socket.io pour Web uniquement)');
    });

    test('devrait démarrer le timer de statistiques', () => {
      jest.useFakeTimers();

      WebSocketHandlers(mockIo, mockSocketWSBridge);

      // Avancer le temps pour déclencher le setInterval
      jest.advanceTimersByTime(30000);

      expect(Logger.system.statsIfChanged).toHaveBeenCalledWith(
        '📊 Connected - 1 user(s), 2 ESP module(s)',
        expect.any(Object)
      );

      jest.useRealTimers();
    });
  });

  describe('Gestion des connexions clients', () => {
    let connectionHandler;

    beforeEach(() => {
      WebSocketHandlers(mockIo, mockSocketWSBridge);
      connectionHandler = mockIo.on.mock.calls.find(call => call[0] === 'connection')[1];
    });

    test('devrait gérer une connexion avec session valide', () => {
      mockDBManager.modules.findByUserId.mockResolvedValue([
        { module_id: 'MOD001' },
        { module_id: 'MOD002' },
      ]);

      connectionHandler(mockSocket);

      expect(mockSocket.userData).toEqual({
        userId: 1,
        userType: 'user',
        userName: 'testuser',
      });
      expect(Logger.activity.debug).toHaveBeenCalledWith('👤 testuser connected (ID: 1, Code: USER-1)');
    });

    test('devrait gérer une connexion sans session (authentification manuelle)', () => {
      const socketWithoutSession = {
        ...mockSocket,
        request: { session: null },
        id: 'socket456',
        emit: jest.fn(),
        on: jest.fn(),
        once: jest.fn(),
        disconnect: jest.fn(),
      };

      connectionHandler(socketWithoutSession);

      expect(Logger.esp.debug).toHaveBeenCalledWith('🔄 Connection without session - waiting for manual auth: socket456');

      // Simuler l'authentification manuelle
      const authHandler = socketWithoutSession.on.mock.calls.find(call => call[0] === 'client:authenticate')[1];
      authHandler({ userId: 2, userName: 'manualuser', userType: 'user' });

      expect(Logger.activity.info).toHaveBeenCalledWith('🔐 Manual client authentication attempt: socket456', {
        userId: 2,
        userName: 'manualuser',
        userType: 'user',
      });
    });

    test('devrait rejeter l\'authentification manuelle sans userId', () => {
      const socketWithoutSession = {
        ...mockSocket,
        request: { session: null },
        emit: jest.fn(),
        on: jest.fn(),
        once: jest.fn(),
      };

      connectionHandler(socketWithoutSession);

      const authHandler = socketWithoutSession.on.mock.calls.find(call => call[0] === 'client:authenticate')[1];
      authHandler({ userName: 'manualuser' });

      expect(socketWithoutSession.emit).toHaveBeenCalledWith('client:auth:error', {
        message: 'User ID requis',
      });
    });

    test('devrait déconnecter après timeout d\'authentification', () => {
      jest.useFakeTimers();

      const socketWithoutSession = {
        ...mockSocket,
        request: { session: null },
        emit: jest.fn(),
        on: jest.fn(),
        once: jest.fn(),
        disconnect: jest.fn(),
      };

      connectionHandler(socketWithoutSession);

      jest.advanceTimersByTime(10000);

      expect(Logger.activity.warn).toHaveBeenCalledWith('❌ Timeout connexion Socket.IO non authentifiée : socket123');
      expect(socketWithoutSession.disconnect).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('Gestion des événements client', () => {
    let connectionHandler;
    let clientSocket;

    beforeEach(() => {
      WebSocketHandlers(mockIo, mockSocketWSBridge);
      connectionHandler = mockIo.on.mock.calls.find(call => call[0] === 'connection')[1];

      clientSocket = { ...mockSocket };
      mockDBManager.modules.findByUserId.mockResolvedValue([]);
    });

    test('devrait gérer la demande de statistiques', () => {
      connectionHandler(clientSocket);

      // Trouver le handler pour 'request_stats'
      const statsCall = clientSocket.on.mock.calls.find(call => call[0] === 'request_stats');
      expect(statsCall).toBeDefined();

      const statsHandler = statsCall[1];
      statsHandler();

      expect(clientSocket.emit).toHaveBeenCalledWith('simple_stats_update', expect.objectContaining({
        users: { online: 1 },
        modules: { online: 2 },
        timestamp: expect.any(Date),
      }));
    });

    test('devrait gérer la demande d\'états des modules', () => {
      connectionHandler(clientSocket);

      const statesCall = clientSocket.on.mock.calls.find(call => call[0] === 'request_module_states');
      expect(statesCall).toBeDefined();

      const statesHandler = statesCall[1];
      statesHandler();

      expect(clientSocket.emit).toHaveBeenCalledWith('module_states_sync', expect.objectContaining({
        states: [],
        timestamp: expect.any(Date),
      }));
    });

    test('devrait gérer l\'enregistrement de page', () => {
      connectionHandler(clientSocket);

      const pageHandler = clientSocket.on.mock.calls.find(call => call[0] === 'register_page')[1];
      pageHandler({ page: 'dashboard' });

      expect(Logger.activity.debug).toHaveBeenCalledWith('Client updating page', {
        page: 'dashboard',
        socketId: 'socket123',
      });
    });

    test('devrait gérer l\'envoi de commandes de module', () => {
      mockIo.app.locals.socketWSBridge.handleWebCommand.mockReturnValue(true);

      connectionHandler(clientSocket);

      const commandCall = clientSocket.on.mock.calls.find(call => call[0] === 'send_module_command');
      expect(commandCall).toBeDefined();

      const commandHandler = commandCall[1];
      commandHandler({ moduleId: 'MOD001', command: 'move', speed: 50 });

      expect(mockIo.app.locals.socketWSBridge.handleWebCommand).toHaveBeenCalledWith(
        clientSocket,
        'MOD001',
        'move',
        { moduleId: 'MOD001', command: 'move', speed: 50 }
      );
      expect(clientSocket.emit).toHaveBeenCalledWith('command_sent', expect.objectContaining({
        moduleId: 'MOD001',
        command: 'move',
        timestamp: expect.any(Date),
      }));
    });

    test('devrait gérer l\'échec d\'envoi de commande', () => {
      mockSocketWSBridge.handleWebCommand.mockReturnValue(false);

      connectionHandler(clientSocket);

      const commandHandler = clientSocket.on.mock.calls.find(call => call[0] === 'send_module_command')[1];
      commandHandler({ moduleId: 'MOD001', command: 'move' });

      expect(clientSocket.emit).toHaveBeenCalledWith('command_error', {
        moduleId: 'MOD001',
        command: 'move',
        error: 'Module not connected via WebSocket',
      });
    });

    test('devrait rejeter les commandes invalides', () => {
      connectionHandler(clientSocket);

      const commandHandler = clientSocket.on.mock.calls.find(call => call[0] === 'send_module_command')[1];
      commandHandler({ command: 'move' }); // Pas de moduleId

      expect(clientSocket.emit).toHaveBeenCalledWith('error', {
        message: 'moduleId et command requis',
      });
    });

    test('devrait gérer la réclamation de module', () => {
      connectionHandler(clientSocket);

      const claimHandler = clientSocket.on.mock.calls.find(call => call[0] === 'module_claim')[1];
      claimHandler({ moduleId: 'MOD001' });

      expect(clientSocket.emit).toHaveBeenCalledWith('claim_ack', {
        moduleId: 'MOD001',
        code: 'USER-1',
      });
    });
  });

  describe('Gestion des erreurs', () => {
    let connectionHandler;

    beforeEach(() => {
      WebSocketHandlers(mockIo, mockSocketWSBridge);
      connectionHandler = mockIo.on.mock.calls.find(call => call[0] === 'connection')[1];
    });

    test('devrait gérer les erreurs de socket', () => {
      connectionHandler(mockSocket);

      const errorHandler = mockSocket.on.mock.calls.find(call => call[0] === 'error')[1];
      const testError = new Error('Test socket error');

      errorHandler(testError);

      expect(Logger.app.error).toHaveBeenCalledWith('Erreur socket sur socket123 :', testError);
    });
  });
});