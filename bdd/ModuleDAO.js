/**
 * DAO modules - Gestion des modules IoT
 * 
 * DAO spécialisé pour la gestion des modules IoT incluant CRUD,
 * gestion des statuts en temps réel et cache en mémoire pour les performances.
 * 
 * @module ModuleDAO
 * @description DAO pour la gestion complète des modules IoT et leurs statuts
 */

const BaseDAO = require('./BaseDAO');
const Logger = require('../utils/logger');

/**
 * DAO pour la gestion des modules
 * Hérite de BaseDAO et ajoute des fonctionnalités spécifiques aux modules
 * @class ModuleDAO
 * @extends BaseDAO
 */
class ModuleDAO extends BaseDAO {
  /**
   * Crée une instance de ModuleDAO
   * @param {mysql.Pool} pool - Pool de connexions MySQL
   */
  constructor(pool) {
    super(pool);
    // Cache en mémoire pour les statuts des modules
    this.moduleStatusCache = new Map(); // moduleId -> { status, lastSeen, userId }
  }

  /**
   * Récupère les modules d'un utilisateur
   * @param {number} userId - ID de l'utilisateur
   * @returns {Array} Liste des modules de l'utilisateur
   */
  async findByUserId(userId) {
    try {
      // Utiliser la méthode execute directement avec une requête SQL spécifique
      const modules = await this.execute(
        `SELECT m.*, u.name as user_name, u.email as user_email 
         FROM modules m 
         LEFT JOIN users u ON m.user_id = u.id 
         WHERE m.user_id = ? 
         ORDER BY m.created_at DESC`,
        [userId]
      );

      // Ajouter les statuts depuis le cache
      return modules.map(module => ({
        ...module,
        status: this.getModuleStatus(module),
        lastSeen: this.getLastSeen(module.module_id),
      }));
    } catch (error) {
      Logger.modules.error('Erreur lors de la récupération des modules utilisateur:', error);
      throw error;
    }
  }

  /**
   * Récupère tous les modules avec options de filtrage et pagination
   * @param {Object} options - Options de requête
   * @returns {Object} { modules: Array, total: number }
   */
  async findAll(options = {}) {
    try {
      const {
        limit = 10,
        offset = 0,
        sortBy = 'last_seen',
        sortOrder = 'DESC',
        search = '',
        filters = {},
      } = options;

      // Assurer que limit et offset sont des entiers
      const limitInt = parseInt(limit, 10) || 10;
      const offsetInt = parseInt(offset, 10) || 0;

      let query = `
        SELECT m.*, u.name as user_name, u.email as user_email 
        FROM modules m 
        LEFT JOIN users u ON m.user_id = u.id 
      `;

      const params = [];
      const whereConditions = [];

      // Recherche globale (ancienne méthode pour compatibilité)
      if (search && search.trim() !== '') {
        whereConditions.push('(m.module_id LIKE ? OR m.name LIKE ? OR u.name LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      // Filtres par colonne
      if (filters.module_id && filters.module_id.trim() !== '') {
        whereConditions.push('m.module_id LIKE ?');
        params.push(`%${filters.module_id}%`);
      }

      if (filters.name && filters.name.trim() !== '') {
        whereConditions.push('m.name LIKE ?');
        params.push(`%${filters.name}%`);
      }

      if (filters.type && filters.type.trim() !== '') {
        whereConditions.push('m.type LIKE ?');
        params.push(`%${filters.type}%`);
      }

      if (filters.user_name && filters.user_name.trim() !== '') {
        whereConditions.push('u.name LIKE ?');
        params.push(`%${filters.user_name}%`);
      }

      if (whereConditions.length > 0) {
        query += ` WHERE ${whereConditions.join(' AND ')} `;
      }

      // Tri
      const validSortFields = ['module_id', 'name', 'type', 'user_name', 'last_seen', 'created_at'];
      const orderBy = this.buildOrderByClause(sortBy, sortOrder, validSortFields);
      query += ` ${orderBy} `;

      // Pagination
      const limitClause = this.buildLimitClause(limitInt, offsetInt);
      const paginatedQuery = query + limitClause;
      params.push(limitInt, offsetInt);

      // Exécuter la requête paginée
      const modules = await this.execute(paginatedQuery, params);

      // Ajouter les statuts depuis le cache
      const modulesWithStatus = modules.map(module => ({
        ...module,
        status: this.getModuleStatus(module),
        lastSeen: this.getLastSeen(module.module_id),
      }));

      // Compter le total (même requête sans LIMIT)
      let countQuery = `
        SELECT COUNT(m.id) as total
        FROM modules m 
        LEFT JOIN users u ON m.user_id = u.id 
      `;

      const countParams = [];
      const countWhereConditions = [];

      // Reprendre les mêmes conditions WHERE pour le count
      if (search && search.trim() !== '') {
        countWhereConditions.push('(m.module_id LIKE ? OR m.name LIKE ? OR u.name LIKE ?)');
        countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (filters.module_id && filters.module_id.trim() !== '') {
        countWhereConditions.push('m.module_id LIKE ?');
        countParams.push(`%${filters.module_id}%`);
      }

      if (filters.name && filters.name.trim() !== '') {
        countWhereConditions.push('m.name LIKE ?');
        countParams.push(`%${filters.name}%`);
      }

      if (filters.type && filters.type.trim() !== '') {
        countWhereConditions.push('m.type LIKE ?');
        countParams.push(`%${filters.type}%`);
      }

      if (filters.user_name && filters.user_name.trim() !== '') {
        countWhereConditions.push('u.name LIKE ?');
        countParams.push(`%${filters.user_name}%`);
      }

      if (countWhereConditions.length > 0) {
        countQuery += ` WHERE ${countWhereConditions.join(' AND ')} `;
      }

      const totalResult = await this.findOne(countQuery, countParams);
      const total = totalResult ? totalResult.total : 0;

      return {
        modules: modulesWithStatus,
        total,
      };
    } catch (error) {
      Logger.modules.error('Erreur lors de la récupération des modules:', error);
      throw error;
    }
  }

  /**
   * Récupère les modules disponibles (non réclamés)
   * @returns {Array} Liste des modules disponibles
   */
  async findAvailable() {
    try {
      const modules = await this.findAll(
        'SELECT * FROM modules WHERE user_id IS NULL ORDER BY created_at DESC'
      );
      return modules;
    } catch (error) {
      Logger.modules.error('Erreur lors de la récupération des modules disponibles:', error);
      throw error;
    }
  }

  /**
   * Récupère un module par son ID
   * @param {string} moduleId - ID du module
   * @returns {Object|null} Module trouvé ou null
   */
  async findById(moduleId) {
    try {
      const module = await this.findOne(
        `SELECT m.*, u.name as user_name, u.email as user_email 
         FROM modules m 
         LEFT JOIN users u ON m.user_id = u.id 
         WHERE m.module_id = ?`,
        [moduleId]
      );

      if (module) {
        return {
          ...module,
          status: this.getModuleStatus(module),
          lastSeen: this.getLastSeen(module.module_id),
        };
      }

      return null;
    } catch (error) {
      Logger.modules.error('Erreur lors de la récupération du module:', error);
      throw error;
    }
  }

  /**
   * Réclame un module pour un utilisateur
   * @param {string} moduleId - ID du module
   * @param {number} userId - ID de l'utilisateur
   * @returns {boolean} Succès de l'opération
   */
  async claim(moduleId, userId) {
    try {
      // Vérifier que le module existe et n'est pas déjà réclamé
      const module = await this.findOne('SELECT id, user_id FROM modules WHERE module_id = ?', [
        moduleId,
      ]);

      if (!module) {
        throw new Error('Module non trouvé');
      }

      if (module.user_id !== null) {
        throw new Error('Module déjà réclamé par un autre utilisateur');
      }

      // Réclamer le module
      const result = await this.update(
        'UPDATE modules SET user_id = ? WHERE module_id = ? AND user_id IS NULL',
        [userId, moduleId]
      );

      return result.affectedRows > 0;
    } catch (error) {
      Logger.modules.error('Erreur lors de la réclamation du module:', error);
      throw error;
    }
  }

  /**
   * Libère un module
   * @param {string} moduleId - ID du module
   * @param {number} userId - ID de l'utilisateur (pour vérification)
   * @returns {boolean} Succès de l'opération
   */
  async release(moduleId, userId) {
    try {
      // Vérifier que l'utilisateur possède bien ce module
      const module = await this.findOne('SELECT id, user_id FROM modules WHERE module_id = ?', [
        moduleId,
      ]);

      if (!module) {
        throw new Error('Module non trouvé');
      }

      if (module.user_id !== userId) {
        throw new Error('Vous ne pouvez pas libérer un module qui ne vous appartient pas');
      }

      // Libérer le module
      const result = await this.update(
        'UPDATE modules SET user_id = NULL WHERE module_id = ? AND user_id = ?',
        [moduleId, userId]
      );

      // Nettoyer le cache de statut
      this.moduleStatusCache.delete(moduleId);

      return result.affectedRows > 0;
    } catch (error) {
      Logger.modules.error('Erreur lors de la libération du module:', error);
      throw error;
    }
  }

  /**
   * Met à jour le statut d'un module
   * @param {string} moduleId - ID du module
   * @param {string} status - Nouveau statut ('online', 'offline')
   * @param {number|null} userId - ID de l'utilisateur (optionnel)
   * @returns {boolean} Succès de l'opération
   */
  async updateStatus(moduleId, status, userId = null) {
    try {
      const validStatuses = ['online', 'offline'];
      if (!validStatuses.includes(status)) {
        throw new Error('Statut invalide');
      }

      // Vérifier que le module existe
      const module = await this.findOne('SELECT id, user_id FROM modules WHERE module_id = ?', [
        moduleId,
      ]);

      if (!module) {
        Logger.modules.warn(
          `🚨 SÉCURITÉ: Tentative de connexion avec module non certifié ${moduleId} - REJETÉ`
        );
        throw new Error('Module non certifié - connexion refusée');
      }

      // Mettre à jour le cache de statut
      this.moduleStatusCache.set(moduleId, {
        status,
        lastSeen: new Date(),
        userId: userId || module?.user_id || null,
      });

      // Mettre à jour la base de données
      await this.update('UPDATE modules SET last_seen = NOW() WHERE module_id = ?', [moduleId]);

      Logger.esp.info(`📡 Module ${moduleId} mis à jour: ${status}`);
      return true;
    } catch (error) {
      Logger.modules.error('Erreur lors de la mise à jour du statut du module:', error);
      throw error;
    }
  }

  /**
   * Nettoie les statuts des modules inactifs
   * @param {number} maxAgeMinutes - Age maximum en minutes
   * @returns {number} Nombre de modules nettoyés
   */
  cleanupStatus(maxAgeMinutes = 5) {
    try {
      const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
      let cleanedCount = 0;

      for (const [, statusInfo] of this.moduleStatusCache.entries()) {
        if (statusInfo.lastSeen < cutoffTime) {
          // Marquer comme hors ligne
          statusInfo.status = 'offline';
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        Logger.system.info(
          `🧹 ${cleanedCount} modules marqués comme hors ligne après ${maxAgeMinutes} minutes d'inactivité`
        );
      }

      return cleanedCount;
    } catch (error) {
      Logger.system.error('Erreur lors du nettoyage des statuts:', error);
      return 0;
    }
  }

  /**
   * Obtient le statut d'un module
   * @param {string|Object} moduleIdOrObject - ID du module ou objet module
   * @returns {string} Statut du module ('online', 'offline')
   */
  getModuleStatus(moduleIdOrObject) {
    try {
      const moduleId =
        typeof moduleIdOrObject === 'string' ? moduleIdOrObject : moduleIdOrObject.module_id;

      const cached = this.moduleStatusCache.get(moduleId);
      if (cached) {
        // Vérifier si le statut n'est pas trop ancien
        const maxAge = 5 * 60 * 1000; // 5 minutes
        const isStale = Date.now() - cached.lastSeen.getTime() > maxAge;

        if (isStale && cached.status === 'online') {
          // Marquer comme hors ligne s'il est trop ancien
          cached.status = 'offline';
        }

        return cached.status;
      }

      // Par défaut, considérer comme hors ligne
      return 'offline';
    } catch (error) {
      Logger.modules.error("Erreur lors de l'obtention du statut du module:", error);
      return 'offline';
    }
  }

  /**
   * Obtient la dernière activité d'un module
   * @param {string} moduleId - ID du module
   * @returns {Date|null} Dernière activité ou null
   */
  getLastSeen(moduleId) {
    try {
      const cached = this.moduleStatusCache.get(moduleId);
      return cached ? cached.lastSeen : null;
    } catch (error) {
      Logger.modules.error("Erreur lors de l'obtention de la dernière activité:", error);
      return null;
    }
  }

  /**
   * Obtient les statistiques des modules
   * @returns {Object} Statistiques des modules
   */
  async getStats() {
    try {
      // Statistiques de la base de données
      const [totalResult, claimedResult] = await Promise.all([
        this.findOne('SELECT COUNT(*) as total FROM modules'),
        this.findOne('SELECT COUNT(*) as total FROM modules WHERE user_id IS NOT NULL'),
      ]);

      const dbTotal = totalResult?.total || 0;
      const claimed = claimedResult?.total || 0;

      // Statistiques en temps réel du cache
      let online = 0;
      let offline = 0;
      const byType = {};

      for (const [moduleId, statusInfo] of this.moduleStatusCache.entries()) {
        if (statusInfo.status === 'online') {
          online++;
        } else {
          offline++;
        }
      }

      // Statistiques par type depuis la base de données
      const typeResults = await this.execute(
        'SELECT type, COUNT(*) as count FROM modules GROUP BY type ORDER BY count DESC'
      );

      typeResults.forEach(row => {
        byType[row.type] = row.count;
      });

      return {
        total: dbTotal,
        online: online,
        offline: Math.max(0, dbTotal - online), // Modules en DB mais pas online
        claimed: claimed,
        unclaimed: Math.max(0, dbTotal - claimed),
        byType: byType,
        inCache: this.moduleStatusCache.size,
      };
    } catch (error) {
      Logger.system.error("Erreur lors de l'obtention des statistiques:", error);
      return {
        total: 0,
        online: 0,
        offline: 0,
        claimed: 0,
        unclaimed: 0,
        byType: {},
        inCache: 0,
      };
    }
  }

  /**
   * Compte le nombre total de modules
   * @returns {number} Nombre total de modules
   */
  async count() {
    try {
      const result = await this.findOne('SELECT COUNT(*) as total FROM modules');
      return result ? result.total : 0;
    } catch (error) {
      Logger.modules.error('Erreur lors du comptage des modules:', error);
      throw error;
    }
  }

  /**
   * Compte le nombre de modules en ligne
   * @returns {number} Nombre de modules en ligne
   */
  countOnline() {
    try {
      return this.getStats().online;
    } catch (error) {
      Logger.modules.error('Erreur lors du comptage des modules en ligne:', error);
      return 0;
    }
  }

  // ================================================================================
  // AUTHENTIFICATION ESP32 SÉCURISÉE
  // ================================================================================

  /**
   * Récupère un module avec son hash de password pour authentification
   * @param {string} moduleId - ID du module
   * @returns {Object|null} Module avec hash de password
   */
  async findByModuleIdWithHash(moduleId) {
    try {
      const module = await this.findOne(
        'SELECT id, user_id, module_id, module_password_hash, type, claimed FROM modules WHERE module_id = ?',
        [moduleId]
      );
      return module;
    } catch (error) {
      Logger.modules.error('Erreur lors de la récupération du module avec hash:', error);
      throw error;
    }
  }

  /**
   * Valide l'authentification d'un module ESP32
   * @param {string} moduleId - ID du module
   * @param {string} password - Mot de passe en clair
   * @returns {Object|null} Module si authentification réussie, null sinon
   */
  async validateModuleAuth(moduleId, password) {
    try {
      // Récupérer le module avec son hash
      const module = await this.findByModuleIdWithHash(moduleId);

      if (!module) {
        Logger.modules.warn(`🚨 Tentative d'authentification avec module inexistant: ${moduleId}`);
        return null;
      }

      if (!module.claimed) {
        Logger.modules.warn(`🚨 Tentative d'authentification avec module non couplé: ${moduleId}`);
        return null;
      }

      if (module.module_password_hash === 'À_DÉFINIR') {
        Logger.modules.warn(`🚨 Module ${moduleId} n'a pas de password configuré`);
        return null;
      }

      // Valider le password avec bcrypt
      const bcrypt = require('bcrypt');
      const isValid = await bcrypt.compare(password, module.module_password_hash);

      if (!isValid) {
        Logger.modules.warn(
          `🚨 SÉCURITÉ: Échec authentification module ${moduleId} - Password invalide`
        );
        return null;
      }

      Logger.modules.info(`✅ Authentification réussie pour module ${moduleId}`);
      return {
        id: module.id,
        moduleId: module.module_id,
        userId: module.user_id,
        type: module.type,
        claimed: module.claimed,
      };
    } catch (error) {
      Logger.modules.error("Erreur lors de la validation d'authentification:", error);
      return null;
    }
  }
}

module.exports = ModuleDAO;
