/**
 * Gestionnaire de base de données - Manager principal
 *
 * Gestionnaire principal centralisant l'accès aux DAO, la gestion des connexions
 * et l'initialisation de la base de données avec création automatique des tables.
 *
 * @module DatabaseManager
 * @description Gestionnaire principal de la base de données et des DAO
 */

const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
const Logger = require('../utils/logger');

const UserDAO = require('./UserDAO');
const ModuleDAO = require('./ModuleDAO');

/**
 * Gestionnaire principal de la base de données
 * Centralise l'accès aux DAO et gère l'initialisation
 * @class DatabaseManager
 */
class DatabaseManager {
  /**
   * Crée une instance de DatabaseManager
   * Initialise les propriétés pour le pool de connexions et les DAO
   */
  constructor() {
    this.pool = null;
    this.userDAO = null;
    this.moduleDAO = null;
    this.isInitialized = false;
  }

  /**
   * Initialise la connexion à la base de données et les DAO
   * Configure le pool MySQL, crée les tables si nécessaire et initialise les DAO
   * @returns {Promise<void>}
   * @throws {Error} En cas d'échec de connexion ou d'initialisation
   */
  async initialize() {
    try {
      // Configuration de la base de données depuis les variables d'environnement
      const dbConfig = {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        charset: process.env.DB_CHARSET,
        connectTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT),
      };

      // Créer le pool de connexions
      this.pool = mysql.createPool({
        ...dbConfig,
        waitForConnections: true,
        connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
        queueLimit: 0,
      });

      // Tester la connexion
      await this.testConnection();

      // Initialiser les DAO
      this.userDAO = new UserDAO(this.pool);
      this.moduleDAO = new ModuleDAO(this.pool);

      this.isInitialized = true;
      Logger.app.info('✅ Database Manager initialized successfully');

      return true;
    } catch (error) {
      Logger.app.error('❌ Database Manager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Teste la connexion à la base de données
   * Exécute une requête de test pour vérifier la connexion
   * @returns {Promise<boolean>} True si la connexion est fonctionnelle
   * @throws {Error} En cas d'échec de connexion
   */
  async testConnection() {
    try {
      const [rows] = await this.pool.execute('SELECT 1 as test');
      if (rows[0]?.test === 1) {
        Logger.app.info('✅ Database connection successful');
        return true;
      } else {
        throw new Error('Test query failed');
      }
    } catch (error) {
      Logger.app.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  /**
   * Exécute un fichier SQL avec remplacement de variables
   * Lit et exécute un fichier SQL depuis le dossier sql/
   * @param {string} filename - Nom du fichier SQL (ex: '001_create_tables.sql')
   * @param {Object} [variables={}] - Variables à remplacer dans le SQL (format {{key}})
   * @returns {Promise<void>}
   * @throws {Error} En cas d'échec de lecture ou d'exécution
   */
  async executeSQLFile(filename, variables = {}) {
    try {
      const sqlPath = path.join(__dirname, '..', 'sql', filename);
      let sql = await fs.readFile(sqlPath, 'utf8');

      // Remplacer les variables si nécessaire
      for (const [key, value] of Object.entries(variables)) {
        sql = sql.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }

      // Séparer les requêtes par point-virgule et les exécuter une par une
      const queries = sql.split(';').filter(query => query.trim().length > 0);

      for (const query of queries) {
        if (query.trim()) {
          await this.pool.execute(query);
        }
      }

      Logger.app.info(`✅ SQL file executed: ${filename}`);
      return true;
    } catch (error) {
      Logger.app.error(`❌ Error executing SQL file ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Initialise la base de données avec les tables et données par défaut
   */
  /**
   * Initialise la base de données en créant les tables
   * Exécute les scripts SQL d'initialisation et de données par défaut
   * @returns {Promise<void>}
   * @throws {Error} En cas d'échec d'initialisation
   */
  async initializeDatabase() {
    try {
      Logger.app.info('🔄 Initializing database...');

      // Créer les tables
      await this.executeSQLFile('create_tables.sql');

      // Insérer les données par défaut
      await this.executeSQLFile('default_data.sql');

      Logger.app.info('✅ Database initialized successfully');
      return true;
    } catch (error) {
      Logger.app.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Démarre le nettoyage automatique des statuts des modules
   * @param {number} intervalMinutes - Intervalle en minutes
   * @param {number} maxAgeMinutes - Age maximum en minutes
   */
  startModuleStatusCleanup(intervalMinutes = 1, maxAgeMinutes = 5) {
    if (!this.moduleDAO) {
      Logger.app.error('❌ ModuleDAO not initialized');
      return;
    }

    setInterval(
      () => {
        try {
          this.moduleDAO.cleanupStatus(maxAgeMinutes);
        } catch (error) {
          Logger.system.error('❌ Error during module status cleanup:', error);
        }
      },
      intervalMinutes * 60 * 1000
    );

    Logger.system.info(
      `🧹 Module status cleanup started (every ${intervalMinutes}min, max age ${maxAgeMinutes}min)`
    );
  }

  /**
   * Obtient des statistiques globales
   * @returns {Object} Statistiques globales
   */
  /**
   * Récupère les statistiques globales de l'application
   * Compile les stats utilisateurs, modules et système
   * @returns {Promise<Object>} Statistiques globales
   * @returns {Object} returns.users - Statistiques des utilisateurs
   * @returns {Object} returns.modules - Statistiques des modules
   * @returns {Object} returns.system - Informations système
   */
  async getGlobalStats() {
    try {
      if (!this.isInitialized) {
        throw new Error('Database Manager not initialized');
      }

      const [totalUsers, totalModules, adminUsers] = await Promise.all([
        this.userDAO.count(),
        this.moduleDAO.count(),
        this.userDAO.countAdmins(),
      ]);

      const onlineModules = this.moduleDAO.countOnline();

      return {
        totalUsers,
        totalModules,
        onlineModules,
        adminUsers,
        regularUsers: totalUsers - adminUsers,
      };
    } catch (error) {
      Logger.system.error('Error getting global stats:', error);
      throw error;
    }
  }

  /**
   * Ferme proprement les connexions
   */
  /**
   * Ferme proprement les connexions à la base de données
   * Termine le pool de connexions MySQL
   * @returns {Promise<void>}
   */
  async close() {
    try {
      if (this.pool) {
        await this.pool.end();
        Logger.app.info('✅ Database connections closed');
      }
    } catch (error) {
      Logger.app.error('❌ Error closing database connections:', error);
      throw error;
    }
  }

  // Getters pour accéder aux DAO
  get users() {
    if (!this.userDAO) {
      throw new Error('Database Manager not initialized');
    }
    return this.userDAO;
  }

  get modules() {
    if (!this.moduleDAO) {
      throw new Error('Database Manager not initialized');
    }
    return this.moduleDAO;
  }
}

// Export d'une instance singleton
const databaseManager = new DatabaseManager();

// Fonctions de compatibilité pour l'ancien système
// Ces fonctions utilisent les DAO mais gardent la même signature

/**
 * Fonctions de compatibilité - Utilisateurs
 */
const verifyLogin = async (email, password) => databaseManager.users.verifyLogin(email, password);
const createUser = async (email, password, name) =>
  databaseManager.users.createUser(email, password, name);
const getUserById = async userId => databaseManager.users.findById(userId);
const getAllUsers = async options => databaseManager.users.findAll(options);
const updateUserProfile = async (userId, updates) =>
  databaseManager.users.updateProfile(userId, updates);
const updateLastLogin = async userId => databaseManager.users.updateLastLogin(userId);

/**
 * Fonctions de compatibilité - Modules
 */
const getUserModules = async userId => databaseManager.modules.findByUserId(userId);
const getAllModules = async options => databaseManager.modules.findAll(options);
const getAvailableModules = async () => databaseManager.modules.findAvailable();
const claimModule = async (moduleId, userId) => databaseManager.modules.claim(moduleId, userId);
const releaseModule = async (moduleId, userId) => databaseManager.modules.release(moduleId, userId);
const getModuleById = async moduleId => databaseManager.modules.findById(moduleId);
const updateModuleStatus = async (moduleId, status, userId) =>
  databaseManager.modules.updateStatus(moduleId, status, userId);
const cleanupModuleStatus = maxAgeMinutes => databaseManager.modules.cleanupStatus(maxAgeMinutes);

/**
 * Fonctions de compatibilité - Base de données
 */
const initializeDatabase = async () => databaseManager.initializeDatabase();
const testConnection = async () => databaseManager.testConnection();

// Export direct de l'instance pour faciliter l'utilisation dans les routes
module.exports = databaseManager;
