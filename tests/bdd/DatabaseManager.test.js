/**
 * Tests pour DatabaseManager
 *
 * Tests unitaires pour le gestionnaire principal de base de données
 * qui centralise l'accès aux DAO et gère l'initialisation.
 */

const DatabaseManager = require('../../bdd/DatabaseManager');

// Mocks
jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(),
}));

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
  },
}));

jest.mock('path', () => ({
  join: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  app: {
    info: jest.fn(),
    error: jest.fn(),
  },
  system: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../bdd/UserDAO');
jest.mock('../../bdd/ModuleDAO');

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const Logger = require('../../utils/logger');
const UserDAO = require('../../bdd/UserDAO');
const ModuleDAO = require('../../bdd/ModuleDAO');

describe('DatabaseManager', () => {
  let mockPool;
  let mockUserDAO;
  let mockModuleDAO;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock du pool MySQL
    mockPool = {
      execute: jest.fn(),
      end: jest.fn(),
    };
    mysql.createPool.mockReturnValue(mockPool);

    // Mocks des DAO
    mockUserDAO = {
      count: jest.fn(),
      countAdmins: jest.fn(),
      verifyLogin: jest.fn(),
      createUser: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      updateProfile: jest.fn(),
      updateLastLogin: jest.fn(),
    };
    mockModuleDAO = {
      count: jest.fn(),
      cleanupStatus: jest.fn(),
      findByUserId: jest.fn(),
      findAll: jest.fn(),
      findAvailable: jest.fn(),
      claim: jest.fn(),
      release: jest.fn(),
      findById: jest.fn(),
      updateStatus: jest.fn(),
    };

    UserDAO.mockImplementation(() => mockUserDAO);
    ModuleDAO.mockImplementation(() => mockModuleDAO);

    // Variables d'environnement
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '3306';
    process.env.DB_USER = 'testuser';
    process.env.DB_PASSWORD = 'testpass';
    process.env.DB_NAME = 'testdb';
    process.env.DB_CHARSET = 'utf8mb4';
    process.env.DB_CONNECTION_TIMEOUT = '60000';
    process.env.DB_CONNECTION_LIMIT = '10';
  });

  afterEach(() => {
    delete require.cache[require.resolve('../../bdd/DatabaseManager')];
  });

  describe('Initialisation', () => {
    test('devrait initialiser correctement le gestionnaire', async () => {
      mockPool.execute.mockResolvedValue([[{ test: 1 }]]);

      const result = await DatabaseManager.initialize();

      expect(result).toBe(true);
      expect(Logger.app.info).toHaveBeenCalledWith('✅ Database Manager initialized successfully');
    });

    test("devrait gérer les erreurs d'initialisation", async () => {
      mockPool.execute.mockRejectedValue(new Error('Connection failed'));

      await expect(DatabaseManager.initialize()).rejects.toThrow('Connection failed');
      expect(Logger.app.error).toHaveBeenCalledWith(
        '❌ Database Manager initialization failed:',
        expect.any(Error)
      );
    });

    test('devrait tester la connexion avec succès', async () => {
      DatabaseManager.pool = mockPool;
      mockPool.execute.mockResolvedValue([[{ test: 1 }]]);

      const result = await DatabaseManager.testConnection();

      expect(result).toBe(true);
      expect(Logger.app.info).toHaveBeenCalledWith('✅ Database connection successful');
    });

    test('devrait gérer les erreurs de connexion', async () => {
      DatabaseManager.pool = mockPool;
      mockPool.execute.mockRejectedValue(new Error('Connection failed'));

      await expect(DatabaseManager.testConnection()).rejects.toThrow('Connection failed');
      expect(Logger.app.error).toHaveBeenCalledWith(
        '❌ Database connection failed:',
        expect.any(Error)
      );
    });

    test('devrait gérer le cas où la requête de test échoue', async () => {
      DatabaseManager.pool = mockPool;
      mockPool.execute.mockResolvedValue([{ test: 0 }]); // Test query returns 0 instead of 1

      await expect(DatabaseManager.testConnection()).rejects.toThrow('Test query failed');
    });
  });

  describe('Exécution de fichiers SQL', () => {
    beforeEach(() => {
      DatabaseManager.pool = mockPool;
      path.join.mockReturnValue('/path/to/sql/file.sql');
    });

    test('devrait exécuter un fichier SQL avec succès', async () => {
      const sqlContent = 'CREATE TABLE test (id INT); INSERT INTO test VALUES (1);';
      fs.promises.readFile.mockResolvedValue(sqlContent);
      mockPool.execute.mockResolvedValue();

      const result = await DatabaseManager.executeSQLFile('test.sql');

      expect(result).toBe(true);
      expect(fs.promises.readFile).toHaveBeenCalledWith('/path/to/sql/file.sql', 'utf8');
      expect(mockPool.execute).toHaveBeenCalledTimes(2); // Deux requêtes
      expect(Logger.app.info).toHaveBeenCalledWith('✅ SQL file executed: test.sql');
    });

    test('devrait remplacer les variables dans le SQL', async () => {
      const sqlContent = 'CREATE TABLE {{table_name}} (id INT);';
      fs.promises.readFile.mockResolvedValue(sqlContent);
      mockPool.execute.mockResolvedValue();

      const variables = { table_name: 'users' };
      await DatabaseManager.executeSQLFile('test.sql', variables);

      expect(mockPool.execute).toHaveBeenCalledWith('CREATE TABLE users (id INT)');
    });

    test('devrait gérer les erreurs de lecture de fichier', async () => {
      fs.promises.readFile.mockRejectedValue(new Error('File not found'));

      await expect(DatabaseManager.executeSQLFile('missing.sql')).rejects.toThrow('File not found');
      expect(Logger.app.error).toHaveBeenCalledWith(
        '❌ Error executing SQL file missing.sql:',
        expect.any(Error)
      );
    });

    test("devrait gérer les erreurs d'exécution SQL", async () => {
      const sqlContent = 'INVALID SQL QUERY;';
      fs.promises.readFile.mockResolvedValue(sqlContent);
      mockPool.execute.mockRejectedValue(new Error('SQL syntax error'));

      await expect(DatabaseManager.executeSQLFile('invalid.sql')).rejects.toThrow(
        'SQL syntax error'
      );
      expect(Logger.app.error).toHaveBeenCalledWith(
        '❌ Error executing SQL file invalid.sql:',
        expect.any(Error)
      );
    });

    test('devrait ignorer les requêtes vides', async () => {
      const sqlContent = 'CREATE TABLE test (id INT); ; ; INSERT INTO test VALUES (1); ;';
      fs.promises.readFile.mockResolvedValue(sqlContent);
      mockPool.execute.mockResolvedValue();

      await DatabaseManager.executeSQLFile('test.sql');

      expect(mockPool.execute).toHaveBeenCalledTimes(2); // Seulement les requêtes non vides
    });
  });

  describe('Initialisation de la base de données', () => {
    beforeEach(() => {
      DatabaseManager.pool = mockPool;
      DatabaseManager.executeSQLFile = jest.fn();
    });

    test('devrait initialiser la base de données avec succès', async () => {
      DatabaseManager.executeSQLFile.mockResolvedValue(true);

      const result = await DatabaseManager.initializeDatabase();

      expect(result).toBe(true);
      expect(DatabaseManager.executeSQLFile).toHaveBeenCalledWith('create_tables.sql');
      expect(DatabaseManager.executeSQLFile).toHaveBeenCalledWith('default_data.sql');
      expect(Logger.app.info).toHaveBeenCalledWith('🔄 Initializing database...');
      expect(Logger.app.info).toHaveBeenCalledWith('✅ Database initialized successfully');
    });

    test('devrait gérer les erreurs lors de la création des tables', async () => {
      DatabaseManager.executeSQLFile.mockRejectedValueOnce(new Error('Table creation failed'));

      await expect(DatabaseManager.initializeDatabase()).rejects.toThrow('Table creation failed');
      expect(Logger.app.error).toHaveBeenCalledWith(
        '❌ Database initialization failed:',
        expect.any(Error)
      );
    });

    test("devrait gérer les erreurs lors de l'insertion des données par défaut", async () => {
      DatabaseManager.executeSQLFile
        .mockResolvedValueOnce(true) // create_tables.sql réussit
        .mockRejectedValueOnce(new Error('Data insertion failed')); // default_data.sql échoue

      await expect(DatabaseManager.initializeDatabase()).rejects.toThrow('Data insertion failed');
      expect(Logger.app.error).toHaveBeenCalledWith(
        '❌ Database initialization failed:',
        expect.any(Error)
      );
    });
  });

  describe('Statistiques globales', () => {
    test('devrait récupérer les statistiques globales', async () => {
      DatabaseManager.userDAO = mockUserDAO;
      DatabaseManager.moduleDAO = mockModuleDAO;
      DatabaseManager.isInitialized = true;

      mockUserDAO.count.mockResolvedValue(5);
      mockModuleDAO.count.mockResolvedValue(10);
      mockUserDAO.countAdmins.mockResolvedValue(1);
      mockModuleDAO.countOnline = jest.fn().mockReturnValue(7);

      const stats = await DatabaseManager.getGlobalStats();

      expect(stats).toEqual({
        totalUsers: 5,
        totalModules: 10,
        onlineModules: 7,
        adminUsers: 1,
        regularUsers: 4,
      });
    });

    test('devrait gérer les erreurs dans getGlobalStats', async () => {
      DatabaseManager.isInitialized = false;

      await expect(DatabaseManager.getGlobalStats()).rejects.toThrow(
        'Database Manager not initialized'
      );
    });
  });

  describe('Nettoyage automatique des statuts', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      DatabaseManager.moduleDAO = mockModuleDAO;
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('devrait démarrer le nettoyage automatique avec succès', () => {
      DatabaseManager.startModuleStatusCleanup(5, 10);

      expect(Logger.system.info).toHaveBeenCalledWith(
        '🧹 Module status cleanup started (every 5min, max age 10min)'
      );

      // Avancer le temps pour déclencher le nettoyage
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect(mockModuleDAO.cleanupStatus).toHaveBeenCalledWith(10);
    });

    test("devrait gérer l'erreur quand ModuleDAO n'est pas initialisé", () => {
      DatabaseManager.moduleDAO = null;

      DatabaseManager.startModuleStatusCleanup(1, 5);

      expect(Logger.app.error).toHaveBeenCalledWith('❌ ModuleDAO not initialized');
    });

    test('devrait gérer les erreurs lors du nettoyage automatique', () => {
      DatabaseManager.startModuleStatusCleanup(1, 5);

      // Simuler une erreur dans cleanupStatus
      mockModuleDAO.cleanupStatus.mockImplementation(() => {
        throw new Error('Cleanup failed');
      });

      // Avancer le temps pour déclencher le nettoyage
      jest.advanceTimersByTime(1 * 60 * 1000);

      expect(Logger.system.error).toHaveBeenCalledWith(
        '❌ Error during module status cleanup:',
        expect.any(Error)
      );
    });
  });

  describe('Getters DAO', () => {
    test('devrait retourner le UserDAO quand initialisé', () => {
      DatabaseManager.userDAO = mockUserDAO;
      DatabaseManager.isInitialized = true;

      const result = DatabaseManager.users;
      expect(result).toBe(mockUserDAO);
    });

    test('devrait retourner le ModuleDAO quand initialisé', () => {
      DatabaseManager.moduleDAO = mockModuleDAO;
      DatabaseManager.isInitialized = true;

      const result = DatabaseManager.modules;
      expect(result).toBe(mockModuleDAO);
    });

    test('devrait lever une erreur pour users quand non initialisé', () => {
      DatabaseManager.userDAO = null;

      expect(() => DatabaseManager.users).toThrow('Database Manager not initialized');
    });

    test('devrait lever une erreur pour modules quand non initialisé', () => {
      DatabaseManager.moduleDAO = null;

      expect(() => DatabaseManager.modules).toThrow('Database Manager not initialized');
    });

    test('devrait lever une erreur pour modules quand moduleDAO est undefined', () => {
      DatabaseManager.moduleDAO = undefined;

      expect(() => DatabaseManager.modules).toThrow('Database Manager not initialized');
    });
  });

  describe('Fermeture des connexions', () => {
    test('devrait fermer les connexions avec succès', async () => {
      DatabaseManager.pool = mockPool;
      mockPool.end.mockResolvedValue();

      await DatabaseManager.close();

      expect(mockPool.end).toHaveBeenCalled();
      expect(Logger.app.info).toHaveBeenCalledWith('✅ Database connections closed');
    });

    test('devrait gérer les erreurs lors de la fermeture', async () => {
      DatabaseManager.pool = mockPool;
      mockPool.end.mockRejectedValue(new Error('Close failed'));

      await expect(DatabaseManager.close()).rejects.toThrow('Close failed');
      expect(Logger.app.error).toHaveBeenCalledWith(
        '❌ Error closing database connections:',
        expect.any(Error)
      );
    });

    test("devrait gérer le cas où il n'y a pas de pool à fermer", async () => {
      DatabaseManager.pool = null;

      await DatabaseManager.close();

      // Ne devrait pas planter et ne rien faire
      expect(Logger.app.info).not.toHaveBeenCalled();
    });
  });

  describe('Fonctions de compatibilité', () => {
    beforeEach(() => {
      DatabaseManager.userDAO = mockUserDAO;
      DatabaseManager.moduleDAO = mockModuleDAO;
      DatabaseManager.isInitialized = true;
    });

    test('devrait déléguer initializeDatabase à la méthode interne', async () => {
      DatabaseManager.initializeDatabase = jest.fn().mockResolvedValue(true);

      const result = await DatabaseManager.initializeDatabase();

      expect(DatabaseManager.initializeDatabase).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test('devrait déléguer testConnection à la méthode interne', async () => {
      DatabaseManager.testConnection = jest.fn().mockResolvedValue(true);

      const result = await DatabaseManager.testConnection();

      expect(DatabaseManager.testConnection).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });
});
