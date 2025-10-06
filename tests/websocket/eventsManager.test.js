/**
 * Tests unitaires pour EventsManager
 * @description Tests de la gestion des clients WebSocket et émissions d'événements
 */

const EventsManager = require('../../api/EventsManager');

// Mock du logger pour éviter les logs réels
jest.mock('../../utils/logger', () => ({
  activity: {
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
  system: {
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('EventsManager - Tests unitaires', () => {
  let eventsManager;
  let mockIo;
  let mockSocket1;
  let mockSocket2;

  beforeEach(() => {
    // Mock de Socket.IO
    mockIo = {
      emit: jest.fn(),
    };

    // Mocks des sockets
    mockSocket1 = {
      id: 'socket1',
      emit: jest.fn(),
      connected: true,
      disconnect: jest.fn(),
    };

    mockSocket2 = {
      id: 'socket2',
      emit: jest.fn(),
      connected: true,
      disconnect: jest.fn(),
    };

    eventsManager = new EventsManager(mockIo);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerClient', () => {
    test('doit enregistrer un nouveau client', () => {
      eventsManager.registerClient(mockSocket1, 123, 'user', 'dashboard');

      expect(eventsManager.connectedClients.size).toBe(1);
      expect(eventsManager.connectedClients.get('socket1')).toEqual({
        socket: mockSocket1,
        userId: 123,
        userType: 'user',
        page: 'dashboard',
        connectedAt: expect.any(Date),
      });
    });

    test('doit gérer les sessions multiples en déconnectant les anciennes', () => {
      // Premier client
      eventsManager.registerClient(mockSocket1, 123, 'user', 'dashboard');

      // Deuxième client pour le même utilisateur
      eventsManager.registerClient(mockSocket2, 123, 'user', 'modules');

      expect(eventsManager.connectedClients.size).toBe(1);
      expect(eventsManager.connectedClients.has('socket1')).toBe(false);
      expect(eventsManager.connectedClients.has('socket2')).toBe(true);
      expect(mockSocket1.emit).toHaveBeenCalledWith('session_replaced', {
        message: 'New session started',
        newSocketId: 'socket2',
      });
      expect(mockSocket1.disconnect).toHaveBeenCalled();
    });

    test('doit utiliser les valeurs par défaut pour userType et page', () => {
      eventsManager.registerClient(mockSocket1, 456);

      const client = eventsManager.connectedClients.get('socket1');
      expect(client.userType).toBe('user');
      expect(client.page).toBe('unknown');
    });
  });

  describe('unregisterClient', () => {
    test('doit supprimer un client enregistré', () => {
      eventsManager.registerClient(mockSocket1, 123);
      expect(eventsManager.connectedClients.size).toBe(1);

      eventsManager.unregisterClient('socket1');
      expect(eventsManager.connectedClients.size).toBe(0);
    });

    test("ne doit rien faire si le client n'existe pas", () => {
      eventsManager.registerClient(mockSocket1, 123);
      eventsManager.unregisterClient('socket_inexistant');

      expect(eventsManager.connectedClients.size).toBe(1);
    });
  });

  describe('broadcast', () => {
    test('doit diffuser un événement à tous les clients', () => {
      eventsManager.registerClient(mockSocket1, 123);
      eventsManager.registerClient(mockSocket2, 456);

      const data = { message: 'Hello all' };
      eventsManager.broadcast('notification', data);

      expect(mockIo.emit).toHaveBeenCalledWith('notification', data);
    });

    test('doit fonctionner même sans clients connectés', () => {
      eventsManager.broadcast('test', {});
      expect(mockIo.emit).toHaveBeenCalledWith('test', {});
    });
  });

  describe('emitToUser', () => {
    test('doit émettre vers un utilisateur spécifique', () => {
      eventsManager.registerClient(mockSocket1, 123, 'user', 'dashboard');
      eventsManager.registerClient(mockSocket2, 456, 'user', 'modules'); // Utilisateur différent

      const data = { message: 'Hello user 123' };
      eventsManager.emitToUser(123, 'personal', data);

      expect(mockSocket1.emit).toHaveBeenCalledWith('personal', data);
      expect(mockSocket2.emit).not.toHaveBeenCalled();
    });

    test('doit émettre vers plusieurs sockets du même utilisateur', () => {
      // Créer des sockets pour le même utilisateur sans déclencher la déconnexion
      const mockSocket3 = {
        id: 'socket3',
        emit: jest.fn(),
        connected: true,
        disconnect: jest.fn(),
      };

      eventsManager.registerClient(mockSocket1, 123, 'user', 'dashboard');
      // Ajouter manuellement un autre socket pour le même utilisateur (simulant une connexion existante)
      eventsManager.connectedClients.set('socket3', {
        socket: mockSocket3,
        userId: 123,
        userType: 'user',
        page: 'modules',
        connectedAt: new Date(),
      });

      const data = { message: 'Hello user 123' };
      eventsManager.emitToUser(123, 'personal', data);

      expect(mockSocket1.emit).toHaveBeenCalledWith('personal', data);
      expect(mockSocket3.emit).toHaveBeenCalledWith('personal', data);
    });

    test("ne doit rien émettre si l'utilisateur n'est pas connecté", () => {
      eventsManager.emitToUser(999, 'test', {});
      expect(mockSocket1.emit).not.toHaveBeenCalled();
    });
  });

  describe('emitToAdmins', () => {
    test('doit émettre seulement vers les administrateurs', () => {
      eventsManager.registerClient(mockSocket1, 123, 'user', 'dashboard');
      eventsManager.registerClient(mockSocket2, 456, 'admin', 'admin');

      const data = { alert: 'System alert' };
      eventsManager.emitToAdmins('admin_alert', data);

      expect(mockSocket1.emit).not.toHaveBeenCalled();
      expect(mockSocket2.emit).toHaveBeenCalledWith('admin_alert', data);
    });

    test("ne doit rien émettre s'il n'y a pas d'administrateurs", () => {
      eventsManager.registerClient(mockSocket1, 123, 'user');
      eventsManager.emitToAdmins('test', {});

      expect(mockSocket1.emit).not.toHaveBeenCalled();
    });

    test('doit logger différemment pour les événements telemetry et last_seen', () => {
      const Logger = require('../../utils/logger');
      eventsManager.registerClient(mockSocket2, 456, 'admin');

      // Tester avec un événement contenant 'telemetry'
      eventsManager.emitToAdmins('rt_telemetry_updated', { data: 'test' });

      // Tester avec un événement contenant 'last_seen'
      eventsManager.emitToAdmins('rt_module_last_seen_updated', { data: 'test' });

      // Les deux branches du if devraient être couvertes
      expect(Logger.system.debug).toHaveBeenCalledWith(
        "Émission 'rt_telemetry_updated' vers 1 admin(s)"
      );
      expect(Logger.system.debug).toHaveBeenCalledWith(
        "Émission 'rt_module_last_seen_updated' vers 1 admin(s)"
      );
    });
  });

  describe('emitToPageExcludingUser', () => {
    test("doit émettre vers les clients d'une page en excluant un utilisateur spécifique", () => {
      eventsManager.registerClient(mockSocket1, 123, 'user', 'modules');
      eventsManager.registerClient(mockSocket2, 456, 'admin', 'modules'); // Même page, utilisateur différent

      const data = { update: 'Module updated' };
      eventsManager.emitToPageExcludingUser('modules', 'module_update', data, 123);

      expect(mockSocket1.emit).not.toHaveBeenCalled(); // Exclu
      expect(mockSocket2.emit).toHaveBeenCalledWith('module_update', data); // Inclus
    });

    test('ne doit rien émettre si tous les clients de la page sont exclus', () => {
      eventsManager.registerClient(mockSocket1, 123, 'user', 'modules');
      eventsManager.emitToPageExcludingUser('modules', 'test', {}, 123);

      expect(mockSocket1.emit).not.toHaveBeenCalled();
    });

    test("doit logger correctement avec l'utilisateur exclu", () => {
      const Logger = require('../../utils/logger');
      eventsManager.registerClient(mockSocket1, 123, 'user', 'modules');
      eventsManager.registerClient(mockSocket2, 456, 'admin', 'modules');

      eventsManager.emitToPageExcludingUser('modules', 'test_event', {}, 123);

      expect(Logger.system.debug).toHaveBeenCalledWith(
        "Émission 'test_event' vers page 'modules' (1 clients, exclu: 123)"
      );
    });
  });

  describe('emitToAdminsExcludingUser', () => {
    test('doit émettre vers les admins en excluant un utilisateur spécifique', () => {
      eventsManager.registerClient(mockSocket1, 123, 'admin', 'dashboard');
      eventsManager.registerClient(mockSocket2, 456, 'admin', 'admin');

      const data = { alert: 'System alert' };
      eventsManager.emitToAdminsExcludingUser('admin_alert', data, 123);

      expect(mockSocket1.emit).not.toHaveBeenCalled(); // Exclu
      expect(mockSocket2.emit).toHaveBeenCalledWith('admin_alert', data); // Inclus
    });

    test('ne doit rien émettre si tous les admins sont exclus', () => {
      eventsManager.registerClient(mockSocket1, 123, 'admin');
      eventsManager.emitToAdminsExcludingUser('test', {}, 123);

      expect(mockSocket1.emit).not.toHaveBeenCalled();
    });

    test('ne doit pas émettre vers les utilisateurs non-admin même si exclus', () => {
      eventsManager.registerClient(mockSocket1, 123, 'user', 'dashboard');
      eventsManager.registerClient(mockSocket2, 456, 'admin', 'admin');

      const data = { alert: 'System alert' };
      eventsManager.emitToAdminsExcludingUser('admin_alert', data, 123);

      expect(mockSocket1.emit).not.toHaveBeenCalled(); // Non-admin
      expect(mockSocket2.emit).toHaveBeenCalledWith('admin_alert', data); // Admin
    });
  });

  describe('getStats', () => {
    test('doit retourner les statistiques correctes', () => {
      eventsManager.registerClient(mockSocket1, 123, 'user', 'dashboard');
      eventsManager.registerClient(mockSocket2, 456, 'admin', 'admin');

      // Ajouter un troisième client avec un utilisateur différent
      const mockSocket3 = { id: 'socket3', emit: jest.fn() };
      eventsManager.registerClient(mockSocket3, 789, 'user', 'modules');

      const stats = eventsManager.getStats();

      expect(stats.total).toBe(3);
      expect(stats.uniqueUsers).toBe(3);
      expect(stats.byPage).toEqual({
        dashboard: 1,
        admin: 1,
        modules: 1,
      });
      expect(stats.byType).toEqual({
        user: 2,
        admin: 1,
      });
    });

    test('doit retourner des statistiques vides si aucun client', () => {
      const stats = eventsManager.getStats();

      expect(stats.total).toBe(0);
      expect(stats.uniqueUsers).toBe(0);
      expect(stats.byPage).toEqual({});
      expect(stats.byType).toEqual({});
    });
  });
});
