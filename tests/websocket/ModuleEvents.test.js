/**
 * Tests unitaires pour ModuleEvents
 * @description Tests des événements de modules IoT et gestion des connexions ESP32
 */

const ModuleEvents = require('../../api/ModuleEvents');

// Mock du Logger
jest.mock('../../utils/logger', () => ({
  modules: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  esp: {
    info: jest.fn(),
    debug: jest.fn(),
  },
  system: {
    debug: jest.fn(),
  },
}));

describe('ModuleEvents - Tests unitaires', () => {
  let moduleEvents;
  let mockEventsManager;

  beforeEach(() => {
    // Mock du gestionnaire d'événements
    mockEventsManager = {
      emitToPage: jest.fn(),
      emitToAdmins: jest.fn(),
      emitToUser: jest.fn(),
      getStats: jest.fn(() => ({ uniqueUsers: 5 })),
    };

    moduleEvents = new ModuleEvents(mockEventsManager);
    jest.clearAllMocks();
  });

  describe('moduleOnline', () => {
    test('doit marquer un module comme en ligne et émettre les événements', () => {
      const moduleInfo = { userId: 123, name: 'Test Module', type: 'Station' };

      moduleEvents.moduleOnline('MC-001', moduleInfo);

      // Vérifier l'état du module
      const state = moduleEvents.moduleStates.get('MC-001');
      expect(state.online).toBe(true);
      expect(state.moduleInfo).toEqual(moduleInfo);

      // Vérifier les émissions d'événements
      expect(mockEventsManager.emitToPage).toHaveBeenCalledWith('modules', 'rt_module_online', expect.objectContaining({
        moduleId: 'MC-001',
        online: true,
      }));
      expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('rt_module_online', expect.objectContaining({
        moduleId: 'MC-001',
        online: true,
      }));
      expect(mockEventsManager.emitToUser).toHaveBeenCalledWith(123, 'user:module:online', expect.any(Object));
    });

    test('ne doit pas émettre si le module était déjà en ligne', () => {
      // Premier appel - module devient en ligne
      moduleEvents.moduleOnline('MC-001', { userId: 123 });
      jest.clearAllMocks();

      // Deuxième appel - module déjà en ligne
      moduleEvents.moduleOnline('MC-001', { userId: 123 });

      // Les événements de changement d'état ne devraient pas être émis
      expect(mockEventsManager.emitToPage).not.toHaveBeenCalledWith('modules', 'rt_module_online');
      expect(mockEventsManager.emitToAdmins).not.toHaveBeenCalledWith('rt_module_online');
      // Mais emitLastSeenUpdate peut être appelé
    });

    test('doit mettre à jour les statistiques lors du passage en ligne', () => {
      const moduleInfo = { userId: 123, name: 'Test Module' };

      moduleEvents.moduleOnline('MC-001', moduleInfo);

      // Cette méthode utilise setTimeout, donc on doit attendre
      return new Promise(resolve => {
        setTimeout(() => {
          // Vérifier que les statistiques sont mises à jour
          expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('simple_stats_update', expect.any(Object));
          resolve();
        }, 250);
      });
    });
  });

  describe('moduleOffline', () => {
    test('doit marquer un module comme hors ligne et émettre les événements', () => {
      // Mettre le module en ligne d'abord
      moduleEvents.moduleOnline('MC-001', { userId: 123 });

      // Puis le mettre hors ligne
      moduleEvents.moduleOffline('MC-001', { userId: 123 });

      // Vérifier l'état
      const state = moduleEvents.moduleStates.get('MC-001');
      expect(state.online).toBe(false);

      // Vérifier les émissions
      expect(mockEventsManager.emitToPage).toHaveBeenCalledWith('modules', 'rt_module_offline', expect.objectContaining({
        moduleId: 'MC-001',
        online: false,
      }));
      expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('rt_module_offline', expect.any(Object));
      expect(mockEventsManager.emitToUser).toHaveBeenCalledWith(123, 'user:module:offline', expect.any(Object));
    });

    test('ne doit pas émettre si le module était déjà hors ligne', () => {
      moduleEvents.moduleOffline('MC-001', { userId: 123 });

      // Les événements de changement d'état ne devraient pas être émis
      expect(mockEventsManager.emitToPage).not.toHaveBeenCalledWith('modules', 'rt_module_offline');
      expect(mockEventsManager.emitToAdmins).not.toHaveBeenCalledWith('rt_module_offline');
      // Mais emitLastSeenUpdate peut être appelé
    });

    test('doit mettre à jour les statistiques lors du passage hors ligne', () => {
      // Mettre le module en ligne d'abord
      moduleEvents.moduleOnline('MC-001', { userId: 123 });
      jest.clearAllMocks();

      // Puis le mettre hors ligne
      moduleEvents.moduleOffline('MC-001', { userId: 123 });

      // Cette méthode utilise setTimeout, donc on doit attendre
      return new Promise(resolve => {
        setTimeout(() => {
          // Vérifier que les statistiques sont mises à jour
          expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('simple_stats_update', expect.any(Object));
          resolve();
        }, 250);
      });
    });
  });

  describe('moduleAdded', () => {
    test('doit émettre l\'ajout d\'un module', () => {
      const moduleData = { module_id: 'MC-001', userId: 123, name: 'New Module' };

      moduleEvents.moduleAdded(moduleData);

      expect(mockEventsManager.emitToUser).toHaveBeenCalledWith(123, 'user:module:added', expect.objectContaining({
        action: 'added',
        module: moduleData,
      }));
      expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('rt_module_added', expect.any(Object));
    });
  });

  describe('moduleRemoved', () => {
    test('doit supprimer l\'état du module et émettre la suppression', () => {
      // Ajouter un état de module
      moduleEvents.moduleStates.set('MC-001', { online: true });

      const moduleData = { module_id: 'MC-001', userId: 123 };

      moduleEvents.moduleRemoved(moduleData);

      // Vérifier que l'état est supprimé
      expect(moduleEvents.moduleStates.has('MC-001')).toBe(false);

      // Vérifier les émissions
      expect(mockEventsManager.emitToUser).toHaveBeenCalledWith(123, 'user:module:removed', expect.any(Object));
      expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('rt_module_removed', expect.any(Object));
    });
  });

  describe('telemetryUpdated', () => {
    test('doit mettre à jour la télémétrie et émettre les événements', () => {
      // Créer d'abord un état pour le module
      moduleEvents.moduleStates.set('MC-001', { online: true, moduleInfo: {} });

      const telemetryData = { temperature: 25, humidity: 60 };

      moduleEvents.telemetryUpdated('MC-001', telemetryData);

      // Vérifier que la télémétrie est stockée
      const state = moduleEvents.moduleStates.get('MC-001');
      expect(state.telemetry).toEqual(telemetryData);

      // Vérifier les émissions
      expect(mockEventsManager.emitToPage).toHaveBeenCalledWith('modules', 'rt_telemetry_updated', expect.objectContaining({
        moduleId: 'MC-001',
        telemetry: telemetryData,
      }));
      expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('rt_telemetry_updated', expect.any(Object));
    });

    test('doit gérer la télémétrie pour un module sans état existant', () => {
      const telemetryData = { temperature: 25, humidity: 60 };

      moduleEvents.telemetryUpdated('MC-001', telemetryData);

      // Pour un module sans état existant, telemetryUpdated ne crée pas d'état
      // Il ne fait que mettre à jour s'il existe
      const state = moduleEvents.moduleStates.get('MC-001');
      expect(state).toBeUndefined(); // Aucun état n'est créé

      // Vérifier que les événements sont quand même émis
      expect(mockEventsManager.emitToPage).toHaveBeenCalledWith('modules', 'rt_telemetry_updated', expect.objectContaining({
        moduleId: 'MC-001',
        telemetry: telemetryData,
      }));
      expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('rt_telemetry_updated', expect.any(Object));
    });
  });

  describe('commandSent', () => {
    test('doit émettre l\'envoi d\'une commande', () => {
      moduleEvents.commandSent('MC-001', 'start', 123);

      expect(mockEventsManager.emitToUser).toHaveBeenCalledWith(123, 'user:command:sent', expect.objectContaining({
        moduleId: 'MC-001',
        command: 'start',
        userId: 123,
      }));
      expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('admin:command:sent', expect.any(Object));
    });

    test('doit gérer les erreurs lors de l\'envoi de commande', () => {
      const mockSocket = {
        id: 'socket123',
        moduleAuth: { userId: 123 },
        moduleId: 'MC-001',
        emit: jest.fn(() => { throw new Error('Socket error'); }),
      };

      // Enregistrer le module
      moduleEvents.registerESP(mockSocket, 'MC-001');

      const result = moduleEvents.sendSecureCommand('MC-001', 'start', 123);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erreur envoi');
    });
  });

  describe('registerESP', () => {
    test('doit enregistrer un ESP avec authentification valide', () => {
      const mockSocket = {
        id: 'socket123',
        moduleAuth: { userId: 123 },
        moduleId: 'MC-001',
        removeAllListeners: jest.fn(),
        disconnect: jest.fn(),
      };

      const result = moduleEvents.registerESP(mockSocket, 'MC-001', 'Switch Track');

      expect(result).not.toBeNull();
      expect(result.moduleId).toBe('MC-001');
      expect(result.moduleType).toBe('Switch Track');
      expect(moduleEvents.connectedESPs.has('MC-001')).toBe(true);
    });

    test('doit refuser l\'enregistrement sans authentification', () => {
      const mockSocket = {
        id: 'socket123',
        moduleAuth: null,
      };

      const result = moduleEvents.registerESP(mockSocket, 'MC-001');

      expect(result).toBeNull();
      expect(moduleEvents.connectedESPs.has('MC-001')).toBe(false);
    });

    test('doit gérer la reconnexion en déconnectant l\'ancien socket', () => {
      const oldSocket = {
        id: 'oldSocket',
        removeAllListeners: jest.fn(),
        disconnect: jest.fn(),
      };
      const newSocket = {
        id: 'newSocket',
        moduleAuth: { userId: 123 },
        moduleId: 'MC-001',
        removeAllListeners: jest.fn(),
        disconnect: jest.fn(),
      };

      // Enregistrer l'ancien socket
      moduleEvents.connectedESPs.set('MC-001', oldSocket);
      moduleEvents.modulesBySocket.set('oldSocket', { moduleId: 'MC-001' });

      // Enregistrer le nouveau socket
      moduleEvents.registerESP(newSocket, 'MC-001');

      expect(oldSocket.disconnect).toHaveBeenCalled();
      expect(moduleEvents.connectedESPs.get('MC-001')).toBe(newSocket);
    });

    test('doit gérer les erreurs lors de la déconnexion du socket précédent', () => {
      const oldSocket = {
        id: 'oldSocket',
        removeAllListeners: jest.fn(() => { throw new Error('Disconnect error'); }),
        disconnect: jest.fn(),
      };
      const newSocket = {
        id: 'newSocket',
        moduleAuth: { userId: 123 },
        moduleId: 'MC-001',
        removeAllListeners: jest.fn(),
        disconnect: jest.fn(),
      };

      // Enregistrer l'ancien socket
      moduleEvents.connectedESPs.set('MC-001', oldSocket);
      moduleEvents.modulesBySocket.set('oldSocket', { moduleId: 'MC-001' });

      // Enregistrer le nouveau socket (devrait gérer l'erreur)
      moduleEvents.registerESP(newSocket, 'MC-001');

      expect(oldSocket.removeAllListeners).toHaveBeenCalled();
      expect(moduleEvents.connectedESPs.get('MC-001')).toBe(newSocket);
    });

    test('doit mettre à jour les statistiques lors de l\'enregistrement', () => {
      const mockSocket = {
        id: 'socket123',
        moduleAuth: { userId: 123 },
        moduleId: 'MC-001',
        removeAllListeners: jest.fn(),
        disconnect: jest.fn(),
      };

      moduleEvents.registerESP(mockSocket, 'MC-001', 'Station');

      // Cette méthode utilise setTimeout dans moduleOnline, donc on doit attendre
      return new Promise(resolve => {
        setTimeout(() => {
          // Vérifier que les statistiques sont mises à jour
          expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('simple_stats_update', expect.any(Object));
          resolve();
        }, 250);
      });
    });
  });

  describe('unregisterESP', () => {
    test('doit désenregistrer un ESP et marquer le module hors ligne', () => {
      const mockSocket = {
        id: 'socket123',
        moduleAuth: { userId: 123 },
        moduleId: 'MC-001',
      };

      // Enregistrer d'abord
      moduleEvents.registerESP(mockSocket, 'MC-001');
      expect(moduleEvents.connectedESPs.has('MC-001')).toBe(true);

      // Désenregistrer
      const result = moduleEvents.unregisterESP(mockSocket);

      expect(result).not.toBeNull();
      expect(moduleEvents.connectedESPs.has('MC-001')).toBe(false);
    });

    test('doit gérer la déconnexion d\'un socket qui n\'est plus actif', () => {
      const oldSocket = { id: 'oldSocket' };
      const newSocket = {
        id: 'newSocket',
        moduleAuth: { userId: 123 },
        moduleId: 'MC-001',
      };

      // Enregistrer le nouveau socket comme actif
      moduleEvents.registerESP(newSocket, 'MC-001');

      // Tenter de désenregistrer l'ancien socket (qui n'est plus actif)
      const result = moduleEvents.unregisterESP(oldSocket);

      expect(result).toBeNull(); // Ancien socket non trouvé
      expect(moduleEvents.connectedESPs.has('MC-001')).toBe(true); // Le nouveau reste actif
    });

    test('doit gérer la déconnexion d\'un socket remplacé par une reconnexion', () => {
      const oldSocket = {
        id: 'oldSocket',
        moduleAuth: { userId: 123 },
        moduleId: 'MC-001',
      };
      const newSocket = {
        id: 'newSocket',
        moduleAuth: { userId: 123 },
        moduleId: 'MC-001',
      };

      // Simuler une situation où l'ancien socket est encore dans modulesBySocket
      // mais n'est plus le socket actif (situation anormale mais possible)
      moduleEvents.modulesBySocket.set('oldSocket', {
        socket: oldSocket,
        moduleId: 'MC-001',
        moduleType: 'Unknown',
        userId: 123,
        connectedAt: new Date(),
        authenticated: true,
      });
      moduleEvents.connectedESPs.set('MC-001', newSocket); // Le nouveau socket est actif

      // Maintenant essayer de désenregistrer l'ancien socket
      const result = moduleEvents.unregisterESP(oldSocket);

      expect(result).not.toBeNull(); // L'ancien socket est nettoyé mais retourne quand même les infos
      expect(result.moduleId).toBe('MC-001');
      expect(moduleEvents.connectedESPs.get('MC-001')).toBe(newSocket); // Le nouveau reste actif
      expect(moduleEvents.modulesBySocket.has('oldSocket')).toBe(false); // L'ancien est nettoyé

      // Vérifier le logging du else if
      const Logger = require('../../utils/logger');
      expect(Logger.modules.debug).toHaveBeenCalledWith(
        'Socket oldSocket déconnecté mais MC-001 est maintenant géré par newSocket'
      );
    });
  });

  describe('sendSecureCommand', () => {
    test('doit envoyer une commande à un module connecté et authentifié', () => {
      const mockSocket = {
        id: 'socket123',
        moduleAuth: { userId: 123 },
        moduleId: 'MC-001',
        emit: jest.fn(),
      };

      // Enregistrer le module
      moduleEvents.registerESP(mockSocket, 'MC-001');

      const result = moduleEvents.sendSecureCommand('MC-001', 'start', 123);

      expect(result.success).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith('command', { command: 'start' });
    });

    test('doit refuser l\'envoi à un module hors ligne', () => {
      const result = moduleEvents.sendSecureCommand('MC-001', 'start', 123);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Module hors ligne');
    });

    test('doit refuser l\'envoi à un utilisateur non autorisé', () => {
      const mockSocket = {
        id: 'socket123',
        moduleAuth: { userId: 123 },
        moduleId: 'MC-001',
        emit: jest.fn(),
      };

      moduleEvents.registerESP(mockSocket, 'MC-001');

      const result = moduleEvents.sendSecureCommand('MC-001', 'start', 456); // Mauvais userId

      expect(result.success).toBe(false);
      expect(result.error).toBe('Accès non autorisé');
      expect(mockSocket.emit).not.toHaveBeenCalled();

      // Vérifier le logging d'avertissement
      const Logger = require('../../utils/logger');
      expect(Logger.modules.warn).toHaveBeenCalledWith(
        '🚨 Tentative d\'accès non autorisé au module MC-001 par utilisateur 456'
      );
    });

    test('doit gérer les erreurs lors de l\'envoi de commande', () => {
      const mockSocket = {
        id: 'socket123',
        moduleAuth: { userId: 123 },
        moduleId: 'MC-001',
        emit: jest.fn(() => { throw new Error('Socket error'); }),
      };

      // Enregistrer le module
      moduleEvents.registerESP(mockSocket, 'MC-001');

      const result = moduleEvents.sendSecureCommand('MC-001', 'start', 123);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erreur envoi');
    });

    test('doit refuser l\'envoi à un module non authentifié', () => {
      const mockSocket = {
        id: 'socket123',
        emit: jest.fn(),
      };

      // Ajouter le socket à connectedESPs sans passer par registerESP
      // pour simuler un état incohérent
      moduleEvents.connectedESPs.set('MC-001', mockSocket);

      const result = moduleEvents.sendSecureCommand('MC-001', 'start', 123);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Module non authentifié');
      expect(mockSocket.emit).not.toHaveBeenCalled();

      // Vérifier le logging d'avertissement
      const Logger = require('../../utils/logger');
      expect(Logger.modules.warn).toHaveBeenCalledWith(
        'Tentative d\'envoi de commande à module non authentifié : MC-001'
      );
    });
  });

  describe('getConnectionStats', () => {
    test('doit retourner les statistiques de connexion correctes', () => {
      // Ajouter quelques états de modules
      moduleEvents.moduleStates.set('MC-001', { online: true });
      moduleEvents.moduleStates.set('MC-002', { online: false });
      moduleEvents.moduleStates.set('MC-003', { online: true });

      // Ajouter des connexions ESP
      moduleEvents.connectedESPs.set('MC-001', {});
      moduleEvents.connectedESPs.set('MC-003', {});

      const stats = moduleEvents.getConnectionStats();

      expect(stats.connectedModules).toBe(2); // 2 ESP connectés
      expect(stats.totalStates).toBe(3); // 3 états en cache
      expect(stats.onlineModules).toBe(2); // 2 modules en ligne
    });
  });

  describe('getModuleState', () => {
    test('doit retourner l\'état d\'un module existant', () => {
      const state = { online: true, lastSeen: new Date() };
      moduleEvents.moduleStates.set('MC-001', state);

      const result = moduleEvents.getModuleState('MC-001');
      expect(result).toEqual(state);
    });

    test('doit retourner un état par défaut pour un module inexistant', () => {
      const result = moduleEvents.getModuleState('MC-999');
      expect(result).toEqual({ online: false, lastSeen: null });
    });
  });

  describe('moduleUpdated', () => {
    test('doit émettre la mise à jour d\'un module', () => {
      const moduleData = { module_id: 'MC-001', userId: 123, name: 'Updated Module' };

      moduleEvents.moduleUpdated(moduleData);

      expect(mockEventsManager.emitToUser).toHaveBeenCalledWith(123, 'user:module:updated', expect.objectContaining({
        action: 'updated',
        module: moduleData,
      }));
      expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('rt_module_updated', expect.any(Object));
    });
  });

  describe('emitLastSeenUpdate', () => {
    test('doit émettre la mise à jour de dernière activité avec logging', () => {
      const lastSeen = new Date();
      const moduleInfo = { userId: 123, type: 'Station' };

      moduleEvents.emitLastSeenUpdate('MC-001', lastSeen, moduleInfo);

      expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('rt_module_last_seen_updated', expect.objectContaining({
        moduleId: 'MC-001',
        lastSeen,
        userId: 123,
        type: 'Station',
      }));

      expect(mockEventsManager.emitToUser).toHaveBeenCalledWith(123, 'user:module:last_seen_updated', expect.any(Object));
    });

    test('doit émettre la mise à jour sans notification utilisateur si pas de userId', () => {
      const lastSeen = new Date();
      const moduleInfo = { type: 'Station' }; // Pas de userId

      moduleEvents.emitLastSeenUpdate('MC-001', lastSeen, moduleInfo);

      expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('rt_module_last_seen_updated', expect.objectContaining({
        moduleId: 'MC-001',
        lastSeen,
        type: 'Station',
      }));

      // Ne doit pas émettre vers un utilisateur spécifique
      expect(mockEventsManager.emitToUser).not.toHaveBeenCalled();
    });
  });

  describe('emitStatsToAdmins', () => {
    test('doit émettre les statistiques mises à jour aux administrateurs', () => {
      // Cette méthode utilise setTimeout, donc on doit attendre
      moduleEvents.emitStatsToAdmins();

      return new Promise(resolve => {
        setTimeout(() => {
          // Vérifier que les statistiques sont émises
          expect(mockEventsManager.emitToAdmins).toHaveBeenCalledWith('simple_stats_update', expect.objectContaining({
            users: { online: 5 },
            modules: { online: 0 },
            timestamp: expect.any(Date),
          }));

          // Vérifier le logging
          const Logger = require('../../utils/logger');
          expect(Logger.system.debug).toHaveBeenCalledWith(
            '[ModuleEvents] Stats mises à jour émises: 5 utilisateurs, 0 modules'
          );
          resolve();
        }, 250);
      });
    });

    test('doit gérer les erreurs lors de l\'émission des statistiques', () => {
      // Simuler une erreur dans getStats
      mockEventsManager.getStats.mockImplementation(() => {
        throw new Error('Stats error');
      });

      // Cette méthode utilise setTimeout, donc on doit attendre
      moduleEvents.emitStatsToAdmins();

      // Attendre que le setTimeout s'exécute
      return new Promise(resolve => {
        setTimeout(() => {
          // Vérifier que l'erreur est loggée
          const Logger = require('../../utils/logger');
          expect(Logger.modules.error).toHaveBeenCalledWith('[ModuleEvents] Erreur émission stats :', expect.any(Error));
          resolve();
        }, 250);
      });
    });
  });

  describe('getCurrentStates', () => {
    test('doit retourner tous les états actuels des modules', () => {
      moduleEvents.moduleStates.set('MC-001', { online: true, lastSeen: new Date() });
      moduleEvents.moduleStates.set('MC-002', { online: false, lastSeen: new Date() });

      const states = moduleEvents.getCurrentStates();

      expect(states['MC-001']).toBeDefined();
      expect(states['MC-002']).toBeDefined();
      expect(states['MC-001'].online).toBe(true);
      expect(states['MC-002'].online).toBe(false);
    });
  });

  describe('getModuleBySocket', () => {
    test('doit retourner les informations du module par socket', () => {
      const mockSocket = { id: 'socket123' };
      const moduleInfo = { moduleId: 'MC-001', userId: 123 };

      moduleEvents.modulesBySocket.set('socket123', moduleInfo);

      const result = moduleEvents.getModuleBySocket(mockSocket);
      expect(result).toEqual(moduleInfo);
    });

    test('doit retourner undefined pour un socket inconnu', () => {
      const mockSocket = { id: 'unknown' };

      const result = moduleEvents.getModuleBySocket(mockSocket);
      expect(result).toBeUndefined();
    });
  });

  describe('isModuleConnected', () => {
    test('doit vérifier si un module est connecté', () => {
      moduleEvents.connectedESPs.set('MC-001', {});

      expect(moduleEvents.isModuleConnected('MC-001')).toBe(true);
      expect(moduleEvents.isModuleConnected('MC-002')).toBe(false);
    });
  });
});