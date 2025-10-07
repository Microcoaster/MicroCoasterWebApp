/**
 * Tests pour ModuleDAO
 *
 * Tests unitaires pour le DAO spécialisé dans la gestion des modules IoT
 * avec cache en mémoire, gestion des statuts et authentification ESP32.
 */

const ModuleDAO = require('../../bdd/ModuleDAO');

// Mocks
jest.mock('../../utils/logger', () => ({
  modules: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  esp: {
    info: jest.fn(),
  },
  system: {
    error: jest.fn(),
    info: jest.fn(),
  },
  app: {
    error: jest.fn(),
  },
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

const Logger = require('../../utils/logger');
const bcrypt = require('bcrypt');

describe('ModuleDAO', () => {
  let mockPool;
  let moduleDAO;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock du pool de base de données
    mockPool = {
      execute: jest.fn(),
    };

    moduleDAO = new ModuleDAO(mockPool);
  });

  describe('Initialisation', () => {
    test('devrait créer une instance avec un cache vide', () => {
      expect(moduleDAO.pool).toBe(mockPool);
      expect(moduleDAO.moduleStatusCache).toBeInstanceOf(Map);
      expect(moduleDAO.moduleStatusCache.size).toBe(0);
    });
  });

  describe('Récupération des modules utilisateur', () => {
    test("devrait récupérer les modules d'un utilisateur", async () => {
      const mockModules = [
        { id: 1, module_id: 'MOD001', user_id: 1, name: 'Module 1', type: 'switch' },
        { id: 2, module_id: 'MOD002', user_id: 1, name: 'Module 2', type: 'sensor' },
      ];

      mockPool.execute = jest.fn().mockResolvedValue([mockModules]);

      const result = await moduleDAO.findByUserId(1);

      expect(mockPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('SELECT m.*, u.name as user_name'),
        [1]
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('status', 'offline');
      expect(result[0]).toHaveProperty('lastSeen', null);
    });

    test('devrait gérer les erreurs lors de la récupération', async () => {
      mockPool.execute.mockRejectedValue(new Error('Database error'));

      await expect(moduleDAO.findByUserId(1)).rejects.toThrow('Database error');
      expect(Logger.modules.error).toHaveBeenCalledWith(
        'Erreur lors de la récupération des modules utilisateur:',
        expect.any(Error)
      );
    });
  });

  describe('Récupération de tous les modules', () => {
    test('devrait récupérer tous les modules avec pagination', async () => {
      const mockModules = [{ id: 1, module_id: 'MOD001', name: 'Module 1' }];

      mockPool.execute
        .mockResolvedValueOnce([mockModules]) // Requête principale
        .mockResolvedValueOnce([[{ total: 1 }]]); // Requête de comptage

      const result = await moduleDAO.findAll({ limit: 10, offset: 0 });

      expect(result).toHaveProperty('modules');
      expect(result).toHaveProperty('total', 1);
      expect(result.modules).toHaveLength(1);
    });

    test('devrait appliquer les filtres de recherche', async () => {
      const mockModules = [];
      mockPool.execute.mockResolvedValueOnce([mockModules]).mockResolvedValueOnce([[{ total: 0 }]]);

      await moduleDAO.findAll({
        search: 'test',
        filters: { type: 'switch', name: 'Module' },
      });

      expect(mockPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE'),
        expect.arrayContaining(['%test%', '%test%', '%switch%', '%Module%'])
      );
    });

    test('devrait gérer le tri et la pagination', async () => {
      const mockModules = [];
      mockPool.execute.mockResolvedValueOnce([mockModules]).mockResolvedValueOnce([[{ total: 0 }]]);

      await moduleDAO.findAll({
        sortBy: 'name',
        sortOrder: 'ASC',
        limit: 5,
        offset: 10,
      });

      const query = mockPool.execute.mock.calls[0][0];
      expect(query).toMatch(/ORDER BY.*name.*ASC/i);
      expect(query).toMatch(/LIMIT.*5.*OFFSET.*10/i);
    });
  });

  describe('Modules disponibles', () => {
    test('devrait récupérer les modules disponibles', async () => {
      const mockModules = [{ id: 1, module_id: 'MOD001', user_id: null }];

      // Mock findAll pour retourner les modules disponibles
      moduleDAO.findAll = jest.fn().mockResolvedValue(mockModules);

      const result = await moduleDAO.findAvailable();

      expect(moduleDAO.findAll).toHaveBeenCalledWith(
        'SELECT * FROM modules WHERE user_id IS NULL ORDER BY created_at DESC'
      );
      expect(result).toBe(mockModules);
    });
  });

  describe('Récupération par ID', () => {
    test('devrait récupérer un module par son ID', async () => {
      const mockModule = { id: 1, module_id: 'MOD001', user_id: 1 };

      mockPool.execute = jest.fn().mockResolvedValue([[mockModule]]);

      const result = await moduleDAO.findById('MOD001');

      expect(result).toEqual({
        ...mockModule,
        status: 'offline',
        lastSeen: null,
      });
    });

    test("devrait retourner null si le module n'existe pas", async () => {
      mockPool.execute = jest.fn().mockResolvedValue([[]]);

      const result = await moduleDAO.findById('NONEXISTENT');

      expect(result).toBeNull();
    });
  });

  describe('Réclamation de modules', () => {
    test('devrait réclamer un module avec succès', async () => {
      const mockModule = { id: 1, user_id: null };

      mockPool.execute = jest
        .fn()
        .mockResolvedValueOnce([[mockModule]]) // Vérification
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Mise à jour

      const result = await moduleDAO.claim('MOD001', 1);

      expect(result).toBe(true);
      expect(mockPool.execute).toHaveBeenCalledWith(
        'UPDATE modules SET user_id = ? WHERE module_id = ? AND user_id IS NULL',
        [1, 'MOD001']
      );
    });

    test("devrait échouer si le module n'existe pas", async () => {
      mockPool.execute.mockResolvedValue([[]]);

      await expect(moduleDAO.claim('NONEXISTENT', 1)).rejects.toThrow('Module non trouvé');
    });

    test('devrait échouer si le module est déjà réclamé', async () => {
      const mockModule = { id: 1, user_id: 2 };

      mockPool.execute.mockResolvedValue([[mockModule]]);

      await expect(moduleDAO.claim('MOD001', 1)).rejects.toThrow(
        'Module déjà réclamé par un autre utilisateur'
      );
    });
  });

  describe('Libération de modules', () => {
    test('devrait libérer un module avec succès', async () => {
      const mockModule = { id: 1, user_id: 1 };

      mockPool.execute = jest
        .fn()
        .mockResolvedValueOnce([[mockModule]]) // Vérification
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Mise à jour

      const result = await moduleDAO.release('MOD001', 1);

      expect(result).toBe(true);
      expect(moduleDAO.moduleStatusCache.has('MOD001')).toBe(false);
    });

    test("devrait échouer si le module n'existe pas", async () => {
      mockPool.execute.mockResolvedValue([[]]);

      await expect(moduleDAO.release('NONEXISTENT', 1)).rejects.toThrow('Module non trouvé');
    });

    test("devrait échouer si l'utilisateur ne possède pas le module", async () => {
      const mockModule = { id: 1, user_id: 2 };

      mockPool.execute.mockResolvedValue([[mockModule]]);

      await expect(moduleDAO.release('MOD001', 1)).rejects.toThrow(
        'Vous ne pouvez pas libérer un module qui ne vous appartient pas'
      );
    });

    test('devrait gérer les erreurs lors de la vérification du module', async () => {
      mockPool.execute.mockRejectedValue(new Error('Database error'));

      await expect(moduleDAO.release('MOD001', 1)).rejects.toThrow('Database error');
      expect(Logger.modules.error).toHaveBeenCalled();
    });
  });

  describe('Mise à jour du statut', () => {
    test("devrait mettre à jour le statut d'un module", async () => {
      const mockModule = { id: 1, user_id: 1 };

      mockPool.execute = jest
        .fn()
        .mockResolvedValueOnce([[mockModule]]) // Vérification
        .mockResolvedValueOnce([{}]); // Mise à jour

      const result = await moduleDAO.updateStatus('MOD001', 'online', 1);

      expect(result).toBe(true);
      expect(moduleDAO.moduleStatusCache.get('MOD001')).toEqual({
        status: 'online',
        lastSeen: expect.any(Date),
        userId: 1,
      });
      expect(Logger.esp.info).toHaveBeenCalledWith('📡 Module MOD001 mis à jour: online');
    });

    test('devrait rejeter un statut invalide', async () => {
      await expect(moduleDAO.updateStatus('MOD001', 'invalid')).rejects.toThrow('Statut invalide');
    });

    test('devrait rejeter un module non certifié', async () => {
      mockPool.execute.mockResolvedValue([[]]);

      await expect(moduleDAO.updateStatus('INVALID', 'online')).rejects.toThrow(
        'Module non certifié - connexion refusée'
      );
      expect(Logger.modules.warn).toHaveBeenCalledWith(
        '🚨 SÉCURITÉ: Tentative de connexion avec module non certifié INVALID - REJETÉ'
      );
    });
  });

  describe('Nettoyage des statuts', () => {
    test('devrait nettoyer les statuts inactifs', () => {
      const now = Date.now();
      const oldDate = new Date(now - 10 * 60 * 1000); // 10 minutes ago
      const recentDate = new Date(now - 1 * 60 * 1000); // 1 minute ago

      moduleDAO.moduleStatusCache.set('OLD_MODULE', {
        status: 'online',
        lastSeen: oldDate,
        userId: 1,
      });
      moduleDAO.moduleStatusCache.set('RECENT_MODULE', {
        status: 'online',
        lastSeen: recentDate,
        userId: 1,
      });

      const cleaned = moduleDAO.cleanupStatus(5); // 5 minutes max age

      expect(cleaned).toBe(1);
      expect(moduleDAO.moduleStatusCache.get('OLD_MODULE').status).toBe('offline');
      expect(moduleDAO.moduleStatusCache.get('RECENT_MODULE').status).toBe('online');
      expect(Logger.system.info).toHaveBeenCalledWith(
        "🧹 1 modules marqués comme hors ligne après 5 minutes d'inactivité"
      );
    });

    test('devrait gérer les erreurs lors du nettoyage', () => {
      // Simuler une erreur dans le cache
      moduleDAO.moduleStatusCache.set('TEST', null);

      const cleaned = moduleDAO.cleanupStatus(5);

      expect(cleaned).toBe(0);
      expect(Logger.system.error).toHaveBeenCalledWith(
        'Erreur lors du nettoyage des statuts:',
        expect.any(Error)
      );
    });
  });

  describe('Gestion du cache de statut', () => {
    test("devrait obtenir le statut d'un module depuis le cache", () => {
      moduleDAO.moduleStatusCache.set('MOD001', {
        status: 'online',
        lastSeen: new Date(),
        userId: 1,
      });

      expect(moduleDAO.getModuleStatus('MOD001')).toBe('online');
    });

    test('devrait obtenir le statut depuis un objet module', () => {
      const mockModule = { module_id: 'MOD001' };
      moduleDAO.moduleStatusCache.set('MOD001', {
        status: 'online',
        lastSeen: new Date(),
        userId: 1,
      });

      expect(moduleDAO.getModuleStatus(mockModule)).toBe('online');
    });

    test('devrait marquer comme offline si le statut est trop ancien', () => {
      const oldDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

      moduleDAO.moduleStatusCache.set('MOD001', {
        status: 'online',
        lastSeen: oldDate,
        userId: 1,
      });

      expect(moduleDAO.getModuleStatus('MOD001')).toBe('offline');
    });

    test('devrait retourner offline par défaut', () => {
      expect(moduleDAO.getModuleStatus('UNKNOWN')).toBe('offline');
    });

    test('devrait gérer les erreurs dans getModuleStatus', () => {
      // Simuler une erreur
      moduleDAO.moduleStatusCache.get = jest.fn().mockImplementation(() => {
        throw new Error('Cache error');
      });

      const result = moduleDAO.getModuleStatus('MOD001');
      expect(result).toBe('offline');
      expect(Logger.modules.error).toHaveBeenCalled();
    });

    test('devrait obtenir la dernière activité', () => {
      const lastSeen = new Date();
      moduleDAO.moduleStatusCache.set('MOD001', {
        status: 'online',
        lastSeen,
        userId: 1,
      });

      expect(moduleDAO.getLastSeen('MOD001')).toBe(lastSeen);
      expect(moduleDAO.getLastSeen('UNKNOWN')).toBeNull();
    });

    test('devrait gérer les erreurs dans getLastSeen', () => {
      moduleDAO.moduleStatusCache.get = jest.fn().mockImplementation(() => {
        throw new Error('Cache error');
      });

      const result = moduleDAO.getLastSeen('MOD001');
      expect(result).toBeNull();
      expect(Logger.modules.error).toHaveBeenCalled();
    });
  });

  describe('Statistiques des modules', () => {
    test('devrait calculer les statistiques complètes', async () => {
      mockPool.execute = jest
        .fn()
        .mockResolvedValueOnce([[{ total: 10 }]]) // SELECT COUNT(*) as total FROM modules
        .mockResolvedValueOnce([
          [
            { type: 'switch', count: 5 },
            { type: 'sensor', count: 3 },
          ],
        ]); // SELECT type, COUNT(*) as count FROM modules GROUP BY type

      // Ajouter des données au cache
      moduleDAO.moduleStatusCache.set('MOD001', {
        status: 'online',
        lastSeen: new Date(),
        userId: 1,
      });
      moduleDAO.moduleStatusCache.set('MOD002', {
        status: 'offline',
        lastSeen: new Date(),
        userId: 1,
      });

      const stats = await moduleDAO.getStats();

      expect(stats).toEqual({
        total: 10,
        online: 1,
        offline: 9,
        byType: { switch: 5, sensor: 3 },
        inCache: 2,
      });
    });

    test('devrait gérer les erreurs et retourner des valeurs par défaut', async () => {
      mockPool.execute.mockRejectedValue(new Error('Database error'));

      const stats = await moduleDAO.getStats();

      expect(stats).toEqual({
        total: 0,
        online: 0,
        offline: 0,
        byType: {},
        inCache: 0,
      });
      expect(Logger.system.error).toHaveBeenCalledWith(
        "Erreur lors de l'obtention des statistiques:",
        expect.any(Error)
      );
    });

    test('devrait compter le nombre total de modules', async () => {
      mockPool.execute = jest.fn().mockResolvedValue([[{ total: 15 }]]);

      const count = await moduleDAO.count();

      expect(count).toBe(15);
    });

    test('devrait gérer les erreurs dans count', async () => {
      mockPool.execute.mockRejectedValue(new Error('Database error'));

      await expect(moduleDAO.count()).rejects.toThrow('Database error');
      expect(Logger.modules.error).toHaveBeenCalled();
    });

    test('devrait compter les modules en ligne', () => {
      moduleDAO.getStats = jest.fn().mockReturnValue({ online: 8 });

      const onlineCount = moduleDAO.countOnline();

      expect(onlineCount).toBe(8);
    });

    test('devrait gérer les erreurs dans countOnline', () => {
      moduleDAO.getStats = jest.fn().mockImplementation(() => {
        throw new Error('Stats error');
      });

      const result = moduleDAO.countOnline();

      expect(result).toBe(0);
      expect(Logger.modules.error).toHaveBeenCalled();
    });
  });

  describe('Authentification ESP32', () => {
    test('devrait récupérer un module avec hash de password', async () => {
      const mockModule = {
        id: 1,
        module_id: 'MOD001',
        module_password_hash: 'hashed_password',
      };

      mockPool.execute = jest.fn().mockResolvedValue([[mockModule]]);

      const result = await moduleDAO.findByModuleIdWithHash('MOD001');

      expect(result).toEqual(mockModule);
    });

    test('devrait gérer les erreurs dans findByModuleIdWithHash', async () => {
      mockPool.execute.mockRejectedValue(new Error('Database error'));

      await expect(moduleDAO.findByModuleIdWithHash('MOD001')).rejects.toThrow('Database error');
      expect(Logger.modules.error).toHaveBeenCalled();
    });

    test("devrait valider l'authentification avec succès", async () => {
      const mockModule = {
        id: 1,
        module_id: 'MOD001',
        user_id: 1,
        type: 'switch',
        module_password_hash: 'hashed_password',
      };

      mockPool.execute = jest.fn().mockResolvedValue([[mockModule]]);
      bcrypt.compare.mockResolvedValue(true);

      const result = await moduleDAO.validateModuleAuth('MOD001', 'password123');

      expect(result).toEqual({
        id: 1,
        moduleId: 'MOD001',
        userId: 1,
        type: 'switch',
      });
      expect(Logger.modules.info).toHaveBeenCalledWith(
        '✅ Authentification réussie pour module MOD001'
      );
    });

    test('devrait rejeter un module inexistant', async () => {
      mockPool.execute.mockResolvedValue([[]]);

      const result = await moduleDAO.validateModuleAuth('INVALID', 'password');

      expect(result).toBeNull();
      expect(Logger.modules.warn).toHaveBeenCalledWith(
        "🚨 Tentative d'authentification avec module inexistant: INVALID"
      );
    });

    test('devrait rejeter un module non couplé', async () => {
      const mockModule = {
        id: 1,
        module_id: 'MOD001',
        user_id: null,
        module_password_hash: 'hashed_password',
      };

      mockPool.execute.mockResolvedValue([[mockModule]]);

      const result = await moduleDAO.validateModuleAuth('MOD001', 'password');

      expect(result).toBeNull();
      expect(Logger.modules.warn).toHaveBeenCalledWith(
        "🚨 Tentative d'authentification avec module non couplé: MOD001"
      );
    });

    test('devrait rejeter un mot de passe incorrect', async () => {
      const mockModule = {
        id: 1,
        module_id: 'MOD001',
        user_id: 1,
        module_password_hash: 'hashed_password',
      };

      mockPool.execute.mockResolvedValue([[mockModule]]);
      bcrypt.compare.mockResolvedValue(false);

      const result = await moduleDAO.validateModuleAuth('MOD001', 'wrong_password');

      expect(result).toBeNull();
      expect(Logger.modules.warn).toHaveBeenCalledWith(
        '🚨 SÉCURITÉ: Échec authentification module MOD001 - Password invalide'
      );
    });

    test('devrait rejeter un module sans password configuré', async () => {
      const mockModule = {
        id: 1,
        module_id: 'MOD001',
        user_id: 1,
        module_password_hash: 'À_DÉFINIR',
      };

      mockPool.execute.mockResolvedValue([[mockModule]]);

      const result = await moduleDAO.validateModuleAuth('MOD001', 'password');

      expect(result).toBeNull();
      expect(Logger.modules.warn).toHaveBeenCalledWith(
        "🚨 Module MOD001 n'a pas de password configuré"
      );
    });

    test('devrait gérer les erreurs dans validateModuleAuth', async () => {
      mockPool.execute.mockRejectedValue(new Error('Database error'));

      const result = await moduleDAO.validateModuleAuth('MOD001', 'password');

      expect(result).toBeNull();
      expect(Logger.modules.error).toHaveBeenCalled();
    });
  });
});
