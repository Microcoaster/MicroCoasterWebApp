/**
 * Tests unitaires pour le système de journalisation
 * @description Tests des fonctionnalités du logger (app, activity, modules, esp, system)
 */

// Mock de winston pour éviter les écritures réelles sur disque
jest.mock('winston', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  return {
    createLogger: jest.fn(() => mockLogger),
    transports: {
      Console: jest.fn(() => ({ log: jest.fn() })),
      File: jest.fn(() => ({ log: jest.fn() })),
    },
    format: {
      combine: jest.fn(() => 'combined-format'),
      timestamp: jest.fn(() => 'timestamp-format'),
      errors: jest.fn(() => 'errors-format'),
      json: jest.fn(() => 'json-format'),
      printf: jest.fn(config => config), // Retourner la config pour les tests
    },
  };
});

// Mock de fs pour éviter les opérations réelles sur le système de fichiers
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

const winston = require('winston');

// Importer le logger après les mocks
const logger = require('../../utils/logger');

// Stocker les instances mockées des loggers pour les tests
let mockAppLogger, mockActivityLogger, mockModulesLogger, mockEspLogger, mockSystemLogger;

describe('Logger - Tests unitaires', () => {
  beforeAll(() => {
    // Récupérer les instances mockées créées lors de l'importation du module
    [mockAppLogger, mockActivityLogger, mockModulesLogger, mockEspLogger, mockSystemLogger] =
      winston.createLogger.mock.results.map(result => result.value);
  });

  beforeEach(() => {
    // Réinitialiser les mocks avant chaque test
    jest.clearAllMocks();
  });

  describe('Logger.app', () => {
    test('doit exposer les méthodes de logging pour le domaine app', () => {
      expect(logger.app).toHaveProperty('info');
      expect(logger.app).toHaveProperty('warn');
      expect(logger.app).toHaveProperty('error');
      expect(logger.app).toHaveProperty('debug');
    });

    test('doit gérer les appels avec métadonnées undefined', () => {
      expect(() => {
        logger.app.info('Test message');
        logger.app.warn('Test warning');
        logger.app.error('Test error');
        logger.app.debug('Test debug');
      }).not.toThrow();
    });

    test('doit gérer les appels avec métadonnées null', () => {
      expect(() => {
        logger.app.info('Test message', null);
        logger.app.warn('Test warning', null);
        logger.app.error('Test error', null);
        logger.app.debug('Test debug', null);
      }).not.toThrow();
    });
  });

  describe('Logger.activity', () => {
    test('doit exposer les méthodes de logging pour les activités', () => {
      expect(logger.activity).toHaveProperty('info');
      expect(logger.activity).toHaveProperty('warn');
      expect(logger.activity).toHaveProperty('error');
      expect(logger.activity).toHaveProperty('debug');
    });

    test('doit pouvoir logger des activités utilisateur', () => {
      const meta = { userId: 123, action: 'login' };

      expect(() => {
        logger.activity.info('Utilisateur connecté', meta);
        logger.activity.warn('Action suspecte', meta);
        logger.activity.error('Erreur de connexion', meta);
        logger.activity.debug('Détails de débogage', meta);
      }).not.toThrow();
    });

    test('doit gérer les appels sans métadonnées', () => {
      expect(() => {
        logger.activity.info('Test info');
        logger.activity.warn('Test warn');
        logger.activity.error('Test error');
        logger.activity.debug('Test debug');
      }).not.toThrow();
    });
  });

  describe('Logger.modules', () => {
    test('doit exposer les méthodes de logging pour les modules', () => {
      expect(logger.modules).toHaveProperty('info');
      expect(logger.modules).toHaveProperty('warn');
      expect(logger.modules).toHaveProperty('error');
      expect(logger.modules).toHaveProperty('debug');
    });

    test('doit pouvoir logger les communications de module', () => {
      const meta = { moduleId: 'MC-001', command: 'start' };

      expect(() => {
        logger.modules.info('Commande envoyée', meta);
        logger.modules.warn('Module défaillant', meta);
        logger.modules.error('Erreur de communication', meta);
        logger.modules.debug('Télémétrie reçue', meta);
      }).not.toThrow();
    });

    test('doit gérer les appels avec différents types de métadonnées', () => {
      expect(() => {
        logger.modules.info('Test', { moduleId: 'ESP-001', sensor: 'temp', value: 25.5 });
        logger.modules.warn('Warning', { moduleId: 'MC-002', error: 'timeout' });
        logger.modules.error('Error', { moduleId: 'ESP-003', code: 500 });
        logger.modules.debug('Debug', { moduleId: 'MC-004', raw: '0xFF 0x00' });
      }).not.toThrow();
    });
  });

  describe('Logger.esp', () => {
    test('doit exposer les méthodes de logging pour ESP32', () => {
      expect(logger.esp).toHaveProperty('info');
      expect(logger.esp).toHaveProperty('warn');
      expect(logger.esp).toHaveProperty('error');
      expect(logger.esp).toHaveProperty('debug');
    });

    test('doit pouvoir logger les connexions ESP32', () => {
      const meta = { socketId: 'ws123', moduleId: 'ESP-001' };

      expect(() => {
        logger.esp.info('Connexion ESP32 établie', meta);
        logger.esp.warn('Connexion instable', meta);
        logger.esp.error('Déconnexion ESP32', meta);
        logger.esp.debug('Données reçues', meta);
      }).not.toThrow();
    });

    test('doit gérer les métadonnées WebSocket', () => {
      expect(() => {
        logger.esp.info('WebSocket ouvert', { socketId: 'ws456', ip: '192.168.1.100' });
        logger.esp.warn('Timeout WebSocket', { socketId: 'ws789', lastSeen: Date.now() });
        logger.esp.error('Erreur protocole', { socketId: 'ws101', error: 'INVALID_FRAME' });
        logger.esp.debug('Frame reçu', { socketId: 'ws202', size: 128 });
      }).not.toThrow();
    });
  });

  describe('Logger.system', () => {
    test('doit exposer les méthodes de logging système', () => {
      expect(logger.system).toHaveProperty('info');
      expect(logger.system).toHaveProperty('warn');
      expect(logger.system).toHaveProperty('error');
      expect(logger.system).toHaveProperty('debug');
      expect(logger.system).toHaveProperty('statsIfChanged');
    });

    test('doit pouvoir logger des statistiques système', () => {
      const meta = { uptime: '2h 30m', memory: '85%' };

      expect(() => {
        logger.system.info('Statistiques système', meta);
        logger.system.warn('Mémoire élevée', meta);
        logger.system.error('Erreur système critique', meta);
        logger.system.debug('Détails système', meta);
      }).not.toThrow();
    });

    test('statsIfChanged doit logger seulement si les stats ont changé', () => {
      // Premier appel - doit logger
      logger.system.statsIfChanged('Stats initiales', { users: 5, modules: 3, clients: 2, esp: 1 });
      expect(mockSystemLogger.info).toHaveBeenCalledWith('Stats initiales');

      // Deuxième appel avec mêmes stats - ne doit pas logger
      mockSystemLogger.info.mockClear();
      logger.system.statsIfChanged('Stats identiques', {
        users: 5,
        modules: 3,
        clients: 2,
        esp: 1,
      });
      expect(mockSystemLogger.info).not.toHaveBeenCalled();

      // Troisième appel avec stats différentes - doit logger
      logger.system.statsIfChanged('Stats changées', { users: 6, modules: 3, clients: 2, esp: 1 });
      expect(mockSystemLogger.info).toHaveBeenCalledWith('Stats changées');
    });

    test('statsIfChanged doit logger quand un seul champ change', () => {
      // Reset des stats précédentes
      mockSystemLogger.info.mockClear();

      // Changer seulement users
      logger.system.statsIfChanged('Users changés', { users: 10, modules: 3, clients: 2, esp: 1 });
      expect(mockSystemLogger.info).toHaveBeenCalledWith('Users changés');

      // Changer seulement modules
      mockSystemLogger.info.mockClear();
      logger.system.statsIfChanged('Modules changés', {
        users: 10,
        modules: 5,
        clients: 2,
        esp: 1,
      });
      expect(mockSystemLogger.info).toHaveBeenCalledWith('Modules changés');

      // Changer seulement clients
      mockSystemLogger.info.mockClear();
      logger.system.statsIfChanged('Clients changés', {
        users: 10,
        modules: 5,
        clients: 7,
        esp: 1,
      });
      expect(mockSystemLogger.info).toHaveBeenCalledWith('Clients changés');

      // Changer seulement esp
      mockSystemLogger.info.mockClear();
      logger.system.statsIfChanged('ESP changés', { users: 10, modules: 5, clients: 7, esp: 2 });
      expect(mockSystemLogger.info).toHaveBeenCalledWith('ESP changés');
    });

    test('statsIfChanged doit gérer les stats avec valeurs zéro', () => {
      mockSystemLogger.info.mockClear();

      logger.system.statsIfChanged('Stats à zéro', { users: 0, modules: 0, clients: 0, esp: 0 });
      expect(mockSystemLogger.info).toHaveBeenCalledWith('Stats à zéro');

      // Même stats à zéro - ne doit pas logger
      mockSystemLogger.info.mockClear();
      logger.system.statsIfChanged('Stats identiques zéro', {
        users: 0,
        modules: 0,
        clients: 0,
        esp: 0,
      });
      expect(mockSystemLogger.info).not.toHaveBeenCalled();
    });

    test('statsIfChanged doit gérer les changements de zéro à valeur', () => {
      mockSystemLogger.info.mockClear();

      logger.system.statsIfChanged('Changement depuis zéro', {
        users: 1,
        modules: 0,
        clients: 0,
        esp: 0,
      });
      expect(mockSystemLogger.info).toHaveBeenCalledWith('Changement depuis zéro');
    });
  });

  describe('Appels aux loggers winston', () => {
    test('Logger.app doit appeler les bonnes méthodes winston', () => {
      logger.app.info('Test info', { meta: true });
      logger.app.warn('Test warn', { meta: true });
      logger.app.error('Test error', { meta: true });
      logger.app.debug('Test debug', { meta: true });

      expect(mockAppLogger.info).toHaveBeenCalledWith('Test info', { meta: true });
      expect(mockAppLogger.warn).toHaveBeenCalledWith('Test warn', { meta: true });
      expect(mockAppLogger.error).toHaveBeenCalledWith('Test error', { meta: true });
      expect(mockAppLogger.debug).toHaveBeenCalledWith('Test debug', { meta: true });
    });

    test('Logger.activity doit appeler les bonnes méthodes winston', () => {
      logger.activity.info('Test activity info');
      logger.activity.warn('Test activity warn');
      logger.activity.error('Test activity error');
      logger.activity.debug('Test activity debug');

      expect(mockActivityLogger.info).toHaveBeenCalled();
      expect(mockActivityLogger.warn).toHaveBeenCalled();
      expect(mockActivityLogger.error).toHaveBeenCalled();
      expect(mockActivityLogger.debug).toHaveBeenCalled();
    });

    test('Logger.modules doit appeler les bonnes méthodes winston', () => {
      logger.modules.info('Test modules info');
      logger.modules.warn('Test modules warn');
      logger.modules.error('Test modules error');
      logger.modules.debug('Test modules debug');

      expect(mockModulesLogger.info).toHaveBeenCalled();
      expect(mockModulesLogger.warn).toHaveBeenCalled();
      expect(mockModulesLogger.error).toHaveBeenCalled();
      expect(mockModulesLogger.debug).toHaveBeenCalled();
    });

    test('Logger.esp doit appeler les bonnes méthodes winston', () => {
      logger.esp.info('Test esp info');
      logger.esp.warn('Test esp warn');
      logger.esp.error('Test esp error');
      logger.esp.debug('Test esp debug');

      expect(mockEspLogger.info).toHaveBeenCalled();
      expect(mockEspLogger.warn).toHaveBeenCalled();
      expect(mockEspLogger.error).toHaveBeenCalled();
      expect(mockEspLogger.debug).toHaveBeenCalled();
    });

    test('Logger.system doit appeler les bonnes méthodes winston', () => {
      logger.system.info('Test system info');
      logger.system.warn('Test system warn');
      logger.system.error('Test system error');
      logger.system.debug('Test system debug');

      expect(mockSystemLogger.info).toHaveBeenCalled();
      expect(mockSystemLogger.warn).toHaveBeenCalled();
      expect(mockSystemLogger.error).toHaveBeenCalled();
      expect(mockSystemLogger.debug).toHaveBeenCalled();
    });
  });

  describe('Gestion des messages et paramètres', () => {
    test('doit gérer les messages vides', () => {
      expect(() => {
        logger.app.info('');
        logger.activity.warn('');
        logger.modules.error('');
        logger.esp.debug('');
        logger.system.info('');
      }).not.toThrow();
    });

    test('doit gérer les messages avec seulement des espaces', () => {
      expect(() => {
        logger.app.info('   ');
        logger.activity.warn('   ');
        logger.modules.error('   ');
        logger.esp.debug('   ');
        logger.system.info('   ');
      }).not.toThrow();
    });

    test('doit gérer les messages très longs', () => {
      const longMessage = 'A'.repeat(1000);
      expect(() => {
        logger.app.info(longMessage);
        logger.activity.warn(longMessage);
        logger.modules.error(longMessage);
        logger.esp.debug(longMessage);
        logger.system.info(longMessage);
      }).not.toThrow();
    });

    test('doit gérer les objets complexes comme métadonnées', () => {
      const complexMeta = {
        user: { id: 123, name: 'Test User' },
        session: { id: 'abc123', startTime: new Date() },
        data: [1, 2, 3, { nested: 'object' }],
        error: new Error('Test error'),
      };

      expect(() => {
        logger.app.info('Complex metadata test', complexMeta);
        logger.activity.warn('Complex activity', complexMeta);
        logger.modules.error('Complex module error', complexMeta);
        logger.esp.debug('Complex ESP data', complexMeta);
        logger.system.info('Complex system info', complexMeta);
      }).not.toThrow();
    });

    test('doit gérer les appels multiples rapides', () => {
      expect(() => {
        for (let i = 0; i < 10; i++) {
          logger.app.info(`Message ${i}`, { index: i });
          logger.activity.warn(`Warning ${i}`, { index: i });
          logger.modules.error(`Error ${i}`, { index: i });
          logger.esp.debug(`Debug ${i}`, { index: i });
          logger.system.info(`System ${i}`, { index: i });
        }
      }).not.toThrow();
    });
  });

  describe('Export du module', () => {
    test("doit exporter l'objet logger complet", () => {
      expect(logger).toBeDefined();
      expect(typeof logger).toBe('object');

      // Vérifier la structure principale
      expect(logger).toHaveProperty('app');
      expect(logger).toHaveProperty('activity');
      expect(logger).toHaveProperty('modules');
      expect(logger).toHaveProperty('esp');
      expect(logger).toHaveProperty('system');
    });
  });
});
