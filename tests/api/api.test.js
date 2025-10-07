/**
 * Tests pour l'API temps réel (RealTimeAPI)
 *
 * Tests unitaires pour l'orchestrateur principal de l'API WebSocket
 * qui coordonne tous les gestionnaires d'événements.
 */

const RealTimeAPI = require('../../api/index');

// Mocks
jest.mock('../../api/EventsManager');
jest.mock('../../api/ModuleEvents');
jest.mock('../../api/UserEvents');
jest.mock('../../utils/logger');

const EventsManager = require('../../api/EventsManager');
const ModuleEvents = require('../../api/ModuleEvents');
const UserEvents = require('../../api/UserEvents');
const Logger = require('../../utils/logger');

describe('RealTimeAPI', () => {
  let mockIo;
  let mockDatabaseManager;
  let mockEventsManager;
  let mockModuleEvents;
  let mockUserEvents;
  let api;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Socket.IO
    mockIo = {
      emit: jest.fn(),
      to: jest.fn(() => ({ emit: jest.fn() })),
    };

    // Mock DatabaseManager
    mockDatabaseManager = {
      getGlobalStats: jest.fn(),
    };

    // Mock EventsManager
    mockEventsManager = {
      registerClient: jest.fn(),
      unregisterClient: jest.fn(),
      connectedClients: new Map(),
      getStats: jest.fn().mockReturnValue({ clients: 5, events: 10 }),
    };

    // Mock ModuleEvents
    mockModuleEvents = {
      getCurrentStates: jest.fn().mockReturnValue({}),
      getConnectionStats: jest.fn().mockReturnValue({ online: 3, total: 5 }),
      moduleOnline: jest.fn(),
      moduleOffline: jest.fn(),
      moduleAdded: jest.fn(),
      moduleRemoved: jest.fn(),
      moduleUpdated: jest.fn(),
      telemetryUpdated: jest.fn(),
      commandSent: jest.fn(),
    };

    // Mock UserEvents
    mockUserEvents = {
      getConnectedUsersStats: jest.fn().mockReturnValue({ online: 2, total: 10 }),
      userLoggedIn: jest.fn(),
      userLoggedOut: jest.fn(),
      userProfileUpdated: jest.fn(),
      userPasswordChanged: jest.fn(),
      userRegistered: jest.fn(),
      userActivity: jest.fn(),
    };

    // Configuration des mocks
    EventsManager.mockImplementation(() => mockEventsManager);
    ModuleEvents.mockImplementation(() => mockModuleEvents);
    UserEvents.mockImplementation(() => mockUserEvents);

    // Créer l'instance API
    api = new RealTimeAPI(mockIo, mockDatabaseManager);
  });

  afterEach(() => {
    delete require.cache[require.resolve('../../api/index')];
  });

  describe('Initialisation', () => {
    test('devrait créer une instance avec les bonnes propriétés', () => {
      expect(api.io).toBe(mockIo);
      expect(api.db).toBe(mockDatabaseManager);
      expect(api.Logger).toBe(Logger);
      expect(api.initialized).toBe(false);
      expect(api.events).toBe(mockEventsManager);
      expect(api.modules).toBe(mockModuleEvents);
      expect(api.users).toBe(mockUserEvents);
    });

    test("devrait initialiser correctement l'API", () => {
      api.initialize();

      expect(api.initialized).toBe(true);
      expect(Logger.app.info).toHaveBeenCalledWith('🚀 Initializing real-time events API');
      expect(Logger.app.info).toHaveBeenCalledWith(
        '✅ Real-time events API initialized successfully'
      );
    });

    test('devrait éviter la double initialisation', () => {
      api.initialize();
      api.initialize(); // Deuxième appel

      expect(Logger.app.warn).toHaveBeenCalledWith('RealTimeAPI already initialized');
      expect(Logger.app.info).toHaveBeenCalledTimes(2); // Seulement les deux premiers appels
    });

    test("devrait retourner l'état d'initialisation", () => {
      expect(api.isInitialized()).toBe(false);
      api.initialize();
      expect(api.isInitialized()).toBe(true);
    });
  });

  describe('Gestion des événements client', () => {
    let mockSocket;

    beforeEach(() => {
      mockSocket = {
        id: 'socket123',
        emit: jest.fn(),
        on: jest.fn(),
        session: { user: { username: 'testuser' } },
      };
    });

    test("devrait enregistrer les gestionnaires d'événements client", () => {
      api.handleClientEvents(mockSocket);

      expect(mockSocket.on).toHaveBeenCalledWith('client:authenticate', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('client:sync:request', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('client:page:changed', expect.any(Function));
    });

    test("devrait gérer l'authentification client", () => {
      api.handleClientEvents(mockSocket);

      // Récupérer le handler d'authentification
      const authHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'client:authenticate'
      )[1];

      authHandler({ userId: 'user123', userType: 'user', page: 'dashboard' });

      expect(mockEventsManager.registerClient).toHaveBeenCalledWith(
        mockSocket,
        'user123',
        'user',
        'dashboard'
      );
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'client:auth:success',
        expect.objectContaining({
          message: 'Authenticated successfully',
          timestamp: expect.any(Date),
        })
      );
      expect(Logger.activity.info).toHaveBeenCalledWith(
        'Client authenticated via API: socket123 (User user123, Page dashboard)'
      );
    });

    test('devrait gérer la déconnexion client', () => {
      api.handleClientEvents(mockSocket);

      // Récupérer le handler de déconnexion
      const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')[1];

      disconnectHandler();

      expect(mockEventsManager.unregisterClient).toHaveBeenCalledWith('socket123');
      expect(Logger.activity.debug).toHaveBeenCalledWith('Client disconnected: socket123');
    });

    test('devrait gérer les demandes de synchronisation', () => {
      // Simuler un client enregistré
      mockEventsManager.connectedClients.set('socket123', { page: 'modules' });
      api.handleClientEvents(mockSocket);

      // Récupérer le handler de sync
      const syncHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'client:sync:request'
      )[1];

      syncHandler();

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'client:sync:success',
        expect.objectContaining({
          timestamp: expect.any(Date),
        })
      );
      // Vérifier que _sendInitialState a été appelée
      expect(mockModuleEvents.getCurrentStates).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('modules:initial:state', { modules: [] });
    });

    test('devrait gérer le changement de page', () => {
      // Simuler un client enregistré
      const client = { page: 'dashboard' };
      mockEventsManager.connectedClients.set('socket123', client);
      api.handleClientEvents(mockSocket);

      // Récupérer le handler de changement de page
      const pageChangeHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'client:page:changed'
      )[1];

      pageChangeHandler({ page: 'modules' });

      expect(client.page).toBe('modules');
      expect(Logger.activity.info).toHaveBeenCalledWith(
        'Client socket123 changed to page: modules'
      );
    });

    test('devrait ignorer le changement de page pour un client non enregistré', () => {
      // Ne pas enregistrer de client dans connectedClients
      api.handleClientEvents(mockSocket);

      // Récupérer le handler de changement de page
      const pageChangeHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'client:page:changed'
      )[1];

      pageChangeHandler({ page: 'modules' });

      // Rien ne devrait être appelé car il n'y a pas de client
      expect(Logger.activity.info).not.toHaveBeenCalled();
    });

    test('devrait gérer la synchronisation pour un client non authentifié', () => {
      // Ne pas enregistrer de client dans connectedClients
      api.handleClientEvents(mockSocket);

      // Récupérer le handler de synchronisation
      const syncHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'client:sync:request'
      )[1];

      syncHandler();

      // Devrait émettre une erreur car le client n'est pas authentifié
      expect(mockSocket.emit).toHaveBeenCalledWith('client:sync:error', {
        message: 'Not authenticated',
      });
      expect(mockSocket.emit).not.toHaveBeenCalledWith('client:sync:success');
    });
  });

  describe('Authentification client', () => {
    let mockSocket;

    beforeEach(() => {
      mockSocket = {
        id: 'socket123',
        emit: jest.fn(),
        session: { user: { username: 'testuser' } },
      };
    });

    test("devrait rejeter l'authentification sans userId", () => {
      api._authenticateClient(mockSocket, {});

      expect(mockSocket.emit).toHaveBeenCalledWith('client:auth:error', {
        message: 'User ID required',
      });
      expect(mockEventsManager.registerClient).not.toHaveBeenCalled();
    });

    test('devrait authentifier un nouveau client', () => {
      api._authenticateClient(mockSocket, {
        userId: 'user123',
        userType: 'admin',
        page: 'admin',
      });

      expect(mockEventsManager.registerClient).toHaveBeenCalledWith(
        mockSocket,
        'user123',
        'admin',
        'admin'
      );
      expect(mockSocket.isRegisteredWithEventsManager).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith('client:auth:success', expect.any(Object));
    });

    test("devrait mettre à jour la page d'un client existant", () => {
      // Simuler un client déjà enregistré
      const existingClient = { page: 'dashboard', userId: 'user123' };
      mockEventsManager.connectedClients.set('socket123', existingClient);

      api._authenticateClient(mockSocket, {
        userId: 'user123',
        page: 'modules',
      });

      expect(existingClient.page).toBe('modules');
      expect(mockEventsManager.registerClient).not.toHaveBeenCalled();
      expect(Logger.activity.debug).toHaveBeenCalledWith(
        '📄 testuser navigated: dashboard → modules'
      );
    });

    test("devrait gérer les erreurs d'authentification", () => {
      mockEventsManager.registerClient.mockImplementation(() => {
        throw new Error('Registration failed');
      });

      api._authenticateClient(mockSocket, { userId: 'user123' });

      expect(Logger.activity.error).toHaveBeenCalledWith(
        'Error authenticating client:',
        expect.any(Error)
      );
      expect(mockSocket.emit).toHaveBeenCalledWith('client:auth:error', {
        message: 'Authentication failed',
      });
    });

    test("doit gérer l'authentification avec changement de page", () => {
      const mockSocket = {
        id: 'socket1',
        emit: jest.fn(),
        isRegisteredWithEventsManager: true,
        session: { user: { username: 'testuser' } },
      };

      // Simuler un client déjà enregistré avec une page différente
      const existingClient = {
        socket: mockSocket,
        userId: 123,
        userType: 'user',
        page: 'dashboard', // Page actuelle
        connectedAt: new Date(),
      };
      mockEventsManager.connectedClients.set('socket1', existingClient);

      // Simuler un changement de page
      const authData = {
        userId: 123,
        page: 'modules', // Différent de la page actuelle
      };

      // Appeler _authenticateClient
      api._authenticateClient(mockSocket, authData);

      // Vérifier que la page a été mise à jour
      expect(existingClient.page).toBe('modules');
      // Vérifier que le log de navigation est appelé
      expect(Logger.activity.debug).toHaveBeenCalledWith(
        '📄 testuser navigated: dashboard → modules'
      );
    });
  });

  describe('État initial', () => {
    let mockSocket;

    beforeEach(() => {
      mockSocket = {
        id: 'socket123',
        emit: jest.fn(),
      };
    });

    test("devrait envoyer l'état initial pour la page modules", async () => {
      await api._sendInitialState(mockSocket, 'modules');

      expect(mockModuleEvents.getCurrentStates).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('modules:initial:state', { modules: [] });
    });

    test("devrait envoyer l'état initial pour la page dashboard", async () => {
      await api._sendInitialState(mockSocket, 'dashboard');

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'dashboard:initial:summary',
        expect.objectContaining({
          timestamp: expect.any(Date),
          message: 'Dashboard synchronized',
        })
      );
    });

    test("devrait gérer les erreurs lors de l'envoi de l'état initial", async () => {
      mockModuleEvents.getCurrentStates.mockImplementation(() => {
        throw new Error('Database error');
      });

      await api._sendInitialState(mockSocket, 'modules');

      expect(Logger.app.error).toHaveBeenCalledWith(
        'Error sending initial state for page modules:',
        expect.any(Error)
      );
    });
  });

  describe('Événements de modules', () => {
    test('devrait émettre un événement module ajouté', () => {
      const moduleData = { id: 'MC-001', name: 'New Module' };

      api.emitModuleAdded(moduleData);

      expect(mockModuleEvents.moduleAdded).toHaveBeenCalledWith(moduleData);
    });

    test('devrait émettre un événement module supprimé', () => {
      const moduleData = { id: 'MC-001', name: 'Removed Module' };

      api.emitModuleRemoved(moduleData);

      expect(mockModuleEvents.moduleRemoved).toHaveBeenCalledWith(moduleData);
    });

    test('devrait émettre un événement module mis à jour', () => {
      const moduleData = { id: 'MC-001', name: 'Updated Module' };

      api.emitModuleUpdated(moduleData);

      expect(mockModuleEvents.moduleUpdated).toHaveBeenCalledWith(moduleData);
    });
  });

  describe('Événements utilisateur', () => {
    test('devrait émettre un événement connexion utilisateur', () => {
      const userData = { id: 'user123', name: 'Test User' };

      api.emitUserLoggedIn(userData, 'session123');

      expect(mockUserEvents.userLoggedIn).toHaveBeenCalledWith(userData, 'session123');
    });

    test('devrait émettre un événement déconnexion utilisateur', () => {
      const userData = { id: 'user123', name: 'Test User' };

      api.emitUserLoggedOut(userData, 'session123');

      expect(mockUserEvents.userLoggedOut).toHaveBeenCalledWith(userData, 'session123');
    });

    test('devrait émettre un événement mise à jour profil', () => {
      const userData = { id: 'user123', name: 'Updated Name' };

      api.emitUserProfileUpdated(userData, 'session123');

      expect(mockUserEvents.userProfileUpdated).toHaveBeenCalledWith(userData, 'session123');
    });
  });

  describe('Statistiques', () => {
    test('devrait retourner les statistiques complètes', () => {
      api.initialize(); // Pour marquer comme initialisé

      const stats = api.getStats();

      expect(stats).toEqual({
        events: { clients: 5, events: 10 },
        modules: { online: 3, total: 5 },
        users: { online: 2, total: 10 },
        initialized: true,
      });

      expect(mockEventsManager.getStats).toHaveBeenCalled();
      expect(mockModuleEvents.getConnectionStats).toHaveBeenCalled();
      expect(mockUserEvents.getConnectedUsersStats).toHaveBeenCalled();
    });
  });

  describe('Utilitaires', () => {
    test("devrait retourner le nom d'utilisateur depuis la session", () => {
      const mockSocket = {
        session: { user: { username: 'testuser' } },
      };

      const result = api.getUserName(mockSocket);

      expect(result).toBe('testuser');
    });

    test('devrait retourner "Utilisateur Anonyme" si pas de session', () => {
      const mockSocket = {};

      const result = api.getUserName(mockSocket);

      expect(result).toBe('Utilisateur Anonyme');
    });

    test('devrait retourner "Utilisateur Anonyme" si pas d\'utilisateur dans la session', () => {
      const mockSocket = {
        session: {},
      };

      const result = api.getUserName(mockSocket);

      expect(result).toBe('Utilisateur Anonyme');
    });
  });

  describe('_handlePageChange', () => {
    let mockSocket;

    beforeEach(() => {
      mockSocket = {
        id: 'socket123',
        emit: jest.fn(),
        session: { user: { username: 'testuser' } },
      };
    });

    test("doit changer la page d'un client enregistré", () => {
      // Simuler un client enregistré
      const client = { page: 'dashboard', userId: 'user123' };
      mockEventsManager.connectedClients.set('socket123', client);

      api._handlePageChange(mockSocket, { page: 'modules' });

      expect(client.page).toBe('modules');
      expect(Logger.activity.info).toHaveBeenCalledWith(
        'Client socket123 changed to page: modules'
      );
    });

    test('doit gérer le changement de page avec un client non trouvé', () => {
      const mockSocket = {
        id: 'unknownSocket',
        emit: jest.fn(),
      };

      // Appeler _handlePageChange avec un socket dont le client n'existe pas
      api._handlePageChange(mockSocket, { page: 'modules' });

      // Vérifier que rien ne se passe (pas d'erreur, pas de log)
      expect(Logger.activity.info).not.toHaveBeenCalled();
    });
  });
});
