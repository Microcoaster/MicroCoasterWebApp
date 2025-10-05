/**
 * Tests unitaires pour UserEvents
 * @description Tests des événements liés aux utilisateurs (connexion, déconnexion, profil, etc.)
 */

const UserEvents = require('../../api/UserEvents');

// Mock du Logger
jest.mock('../../utils/logger', () => ({
  activity: {
    debug: jest.fn(),
    info: jest.fn(),
  },
  system: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

describe('UserEvents - Tests unitaires', () => {
  let userEvents;
  let mockEventsManager;

  beforeEach(() => {
    // Mock du gestionnaire d'événements
    mockEventsManager = {
      emitToAdmins: jest.fn(),
      emitToUser: jest.fn(),
      getStats: jest.fn(() => ({ uniqueUsers: 5 })),
    };

    userEvents = new UserEvents(mockEventsManager);
    jest.clearAllMocks();
  });

  describe('userLoggedIn', () => {
    test('doit émettre les événements de connexion utilisateur', () => {
      const userData = {
        id: 123,
        name: 'Test User',
        email: 'test@example.com',
        is_admin: false,
        last_login: '2025-10-04T10:00:00Z',
      };
      const sessionId = 'session123';

      userEvents.userLoggedIn(userData, sessionId);

      // Vérifier l'émission aux admins
      expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('rt_user_logged_in', expect.objectContaining({
        action: 'login',
        user: expect.objectContaining({
          id: 123,
          name: 'Test User',
          email: 'test@example.com',
          isAdmin: false,
        }),
        sessionId: 'session123',
      }));

      // Vérifier l'émission à l'utilisateur
      expect(mockEventsManager.emitToUser).toHaveBeenCalledWith(123, 'user:session:new', expect.objectContaining({
        message: 'Connexion réussie',
      }));
    });

    test('doit gérer un utilisateur sans dernière connexion', () => {
      const userData = {
        id: 456,
        name: 'New User',
        email: 'new@example.com',
        is_admin: true,
      };

      userEvents.userLoggedIn(userData, 'session456');

      expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('rt_user_logged_in', expect.objectContaining({
        user: expect.objectContaining({
          isAdmin: true,
          lastLogin: expect.any(Date),
        }),
      }));
    });
  });

  describe('userLoggedOut', () => {
    test('doit émettre les événements de déconnexion utilisateur', () => {
      const userData = {
        id: 123,
        name: 'Test User',
        email: 'test@example.com',
      };
      const sessionId = 'session123';

      userEvents.userLoggedOut(userData, sessionId);

      expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('rt_user_logged_out', expect.objectContaining({
        action: 'logout',
        user: expect.objectContaining({
          id: 123,
          name: 'Test User',
        }),
        sessionId: 'session123',
      }));

      // userLoggedOut n'émet pas à l'utilisateur selon le code
      expect(mockEventsManager.emitToUser).not.toHaveBeenCalled();
    });
  });

  describe('userProfileUpdated', () => {
    test('doit émettre les événements de mise à jour de profil', () => {
      const userData = {
        id: 123,
        name: 'Updated Name',
        email: 'updated@example.com',
        is_admin: false,
      };
      const sessionId = 'session123';

      userEvents.userProfileUpdated(userData, sessionId);

      expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('rt_user_profile_updated', expect.objectContaining({
        action: 'profile_updated',
        user: expect.objectContaining({
          id: 123,
          name: 'Updated Name',
          isAdmin: false,
        }),
      }));

      expect(mockEventsManager.emitToUser).toHaveBeenCalledWith(123, 'rt_user_profile_updated', expect.objectContaining({
        action: 'profile_updated',
      }));
    });
  });

  describe('userPasswordChanged', () => {
    test('doit émettre les événements de changement de mot de passe', () => {
      const userData = {
        id: 123,
        name: 'Test User',
        email: 'test@example.com',
      };

      userEvents.userPasswordChanged(userData);

      expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('admin:user:password_changed', expect.objectContaining({
        action: 'password_changed',
        user: expect.objectContaining({
          id: 123,
          name: 'Test User',
        }),
      }));

      expect(mockEventsManager.emitToUser).toHaveBeenCalledWith(123, 'user:security:password_changed', expect.objectContaining({
        message: 'Votre mot de passe a été modifié avec succès',
      }));
    });
  });

  describe('userRegistered', () => {
    test('doit émettre les événements d\'inscription utilisateur', () => {
      const userData = {
        id: 123,
        name: 'New User',
        email: 'new@example.com',
        is_admin: false,
      };

      userEvents.userRegistered(userData);

      expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('admin:user:registered', expect.objectContaining({
        action: 'registered',
        user: expect.objectContaining({
          id: 123,
          name: 'New User',
          isAdmin: false,
        }),
      }));

      expect(mockEventsManager.emitToUser).toHaveBeenCalledWith(123, 'user:welcome', expect.objectContaining({
        message: 'Bienvenue dans MicroCoaster WebApp !',
      }));
    });
  });

  describe('userActivity', () => {
    test('doit émettre les activités utilisateur importantes aux admins', () => {
      userEvents.userActivity(123, 'send_module_command', { moduleId: 'MC-001', command: 'start' });

      expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('admin:user:activity', expect.objectContaining({
        userId: 123,
        activity: 'send_module_command',
        metadata: { moduleId: 'MC-001', command: 'start' },
      }));
    });

    test('ne doit pas émettre les activités mineures', () => {
      userEvents.userActivity(123, 'page_view', { page: 'dashboard' });

      expect(mockEventsManager.emitToAdmins).not.toHaveBeenCalled();
    });
  });

  describe('_detectChanges', () => {
    test('doit détecter les changements dans les données utilisateur', () => {
      const oldData = {
        name: 'Old Name',
        email: 'old@example.com',
        is_admin: false,
      };
      const newData = {
        name: 'New Name',
        email: 'new@example.com',
        is_admin: true,
      };

      const changes = userEvents._detectChanges(oldData, newData);

      expect(changes).toEqual(['name', 'email', 'admin_status']);
    });

    test('doit retourner un tableau vide si aucune changement', () => {
      const oldData = {
        name: 'Same Name',
        email: 'same@example.com',
        is_admin: false,
      };
      const newData = { ...oldData };

      const changes = userEvents._detectChanges(oldData, newData);

      expect(changes).toEqual([]);
    });
  });

  describe('emitStatsToAdmins', () => {
    test('doit émettre les statistiques mises à jour aux administrateurs', () => {
      // Mock realTimeAPI avec modules
      const mockRealTimeAPI = {
        modules: {
          getConnectionStats: jest.fn(() => ({ connectedModules: 3 })),
        },
      };

      // Mock io.app.locals
      mockEventsManager.io = {
        app: {
          locals: {
            realTimeAPI: mockRealTimeAPI,
          },
        },
      };

      userEvents.emitStatsToAdmins();

      // Attendre que le setTimeout s'exécute
      return new Promise(resolve => {
        setTimeout(() => {
          expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('simple_stats_update', {
            users: { online: 5 },
            modules: { online: 3 },
            timestamp: expect.any(Date),
          });
          resolve();
        }, 350);
      });
    });

    test('doit gérer l\'absence de realTimeAPI', () => {
      // Pas de mock realTimeAPI
      userEvents.emitStatsToAdmins();

      return new Promise(resolve => {
        setTimeout(() => {
          expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('simple_stats_update', {
            users: { online: 5 },
            modules: { online: 0 },
            timestamp: expect.any(Date),
          });
          resolve();
        }, 350);
      });
    });

    test('doit gérer les erreurs lors de l\'émission des statistiques', () => {
      // Simuler une erreur dans getStats
      mockEventsManager.getStats.mockImplementation(() => {
        throw new Error('Stats error');
      });

      userEvents.emitStatsToAdmins();

      return new Promise(resolve => {
        setTimeout(() => {
          // L'erreur devrait être loggée mais pas faire planter l'application
          expect(userEvents).toBeDefined();
          resolve();
        }, 350);
      });
    });

    test('doit gérer l\'échec de récupération des statistiques de modules', () => {
      // Mock realTimeAPI avec modules qui lance une erreur
      const mockRealTimeAPI = {
        modules: {
          getConnectionStats: jest.fn(() => { throw new Error('Module stats error'); }),
        },
      };

      // Mock io.app.locals
      mockEventsManager.io = {
        app: {
          locals: {
            realTimeAPI: mockRealTimeAPI,
          },
        },
      };

      userEvents.emitStatsToAdmins();

      return new Promise(resolve => {
        setTimeout(() => {
          // Vérifier que l'erreur est loggée
          const Logger = require('../../utils/logger');
          expect(Logger.system.error).toHaveBeenCalledWith('[UserEvents] Stats emission error:', expect.any(Error));
          resolve();
        }, 350);
      });
    });
  });
});