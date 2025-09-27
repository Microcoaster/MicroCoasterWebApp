const BaseDAO = require('./BaseDAO');
const bcrypt = require('bcrypt');
const Logger = require('../utils/logger');

/**
 * DAO pour la gestion des utilisateurs
 */
class UserDAO extends BaseDAO {
  constructor(pool) {
    super(pool);
  }

  /**
   * Vérifie les identifiants de connexion
   * @param {string} email - Email de l'utilisateur
   * @param {string} password - Mot de passe
   * @returns {Object|null} Utilisateur connecté ou null
   */
  async verifyLogin(email, password) {
    try {
      const user = await this.findOne(
        'SELECT id, email, name, password, is_admin FROM users WHERE email = ? LIMIT 1',
        [email]
      );

      if (user) {
        const isValid = await bcrypt.compare(password, user.password);
        if (isValid) {
          // Ne pas retourner le mot de passe hashé
          const { password: _, ...userWithoutPassword } = user;
          return userWithoutPassword;
        }
      }

      return null;
    } catch (error) {
      Logger.error('Erreur lors de la vérification des identifiants:', error);
      throw error;
    }
  }

  /**
   * Crée un nouvel utilisateur
   * @param {string} email - Email de l'utilisateur
   * @param {string} password - Mot de passe en clair
   * @param {string} name - Nom de l'utilisateur
   * @returns {Object} Utilisateur créé
   */
  async createUser(email, password, name) {
    try {
      // Vérifier si l'email existe déjà
      const existingUser = await this.findOne('SELECT id FROM users WHERE email = ?', [email]);

      if (existingUser) {
        throw new Error('Un utilisateur avec cet email existe déjà');
      }

      // Hasher le mot de passe
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Insérer le nouvel utilisateur
      const result = await this.insert(
        'INSERT INTO users (email, password, name, is_admin, created_at) VALUES (?, ?, ?, 0, NOW())',
        [email, hashedPassword, name]
      );

      // Retourner l'utilisateur créé (sans le mot de passe)
      return await this.findById(result.insertId);
    } catch (error) {
      Logger.error("Erreur lors de la création de l'utilisateur:", error);
      throw error;
    }
  }

  /**
   * Récupère un utilisateur par son ID
   * @param {number} userId - ID de l'utilisateur
   * @returns {Object|null} Utilisateur trouvé ou null
   */
  async findById(userId) {
    try {
      const user = await this.findOne(
        'SELECT id, email, name, is_admin, last_login, created_at FROM users WHERE id = ?',
        [userId]
      );
      return user;
    } catch (error) {
      Logger.error("Erreur lors de la récupération de l'utilisateur:", error);
      throw error;
    }
  }

  /**
   * Récupère tous les utilisateurs avec options de filtrage et pagination
   * @param {Object} options - Options de requête
   * @returns {Object} { users: Array, total: number }
   */
  async findAll(options = {}) {
    try {
      const {
        limit = 10,
        offset = 0,
        sortBy = 'last_login',
        sortOrder = 'DESC',
        search = '',
        filters = {},
      } = options;

      // Assurer que limit et offset sont des entiers
      const limitInt = parseInt(limit, 10) || 10;
      const offsetInt = parseInt(offset, 10) || 0;

      let query = `
        SELECT u.id, u.email, u.name, u.is_admin, u.last_login, u.created_at,
               COUNT(m.id) as module_count
        FROM users u 
        LEFT JOIN modules m ON u.id = m.user_id 
      `;

      const params = [];
      const whereConditions = [];

      // Recherche globale (ancienne méthode pour compatibilité)
      if (search && search.trim() !== '') {
        whereConditions.push('(u.name LIKE ? OR u.email LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
      }

      // Filtres par colonne
      if (filters.name && filters.name.trim() !== '') {
        whereConditions.push('u.name LIKE ?');
        params.push(`%${filters.name}%`);
      }

      if (filters.email && filters.email.trim() !== '') {
        whereConditions.push('u.email LIKE ?');
        params.push(`%${filters.email}%`);
      }

      if (filters.role && filters.role.trim() !== '') {
        if (filters.role === 'admin') {
          whereConditions.push('u.is_admin = 1');
        } else if (filters.role === 'user') {
          whereConditions.push('u.is_admin = 0');
        }
      }

      // Traiter le filtre module_count séparément car il nécessite HAVING
      const havingConditions = [];
      const havingParams = [];

      if (filters.module_count && filters.module_count.trim() !== '') {
        const count = parseInt(filters.module_count);
        if (!isNaN(count)) {
          havingConditions.push('COUNT(m.id) = ?');
          havingParams.push(count);
        }
      }

      if (whereConditions.length > 0) {
        query += ` WHERE ${whereConditions.join(' AND ')} `;
      }

      query += ' GROUP BY u.id ';

      if (havingConditions.length > 0) {
        query += ` HAVING ${havingConditions.join(' AND ')} `;
        params.push(...havingParams);
      }

      // Tri
      const validSortFields = ['name', 'email', 'last_login', 'created_at', 'module_count'];
      const orderBy = this.buildOrderByClause(sortBy, sortOrder, validSortFields);
      query += ` ${orderBy} `;

      // Pagination
      const limitClause = this.buildLimitClause(limitInt, offsetInt);
      const paginatedQuery = query + limitClause;
      params.push(limitInt, offsetInt);

      // Exécuter la requête paginée
      const users = await this.execute(paginatedQuery, params);

      // Compter le total (même requête sans LIMIT)
      let countQuery = `
        SELECT COUNT(DISTINCT u.id) as total
        FROM users u 
        LEFT JOIN modules m ON u.id = m.user_id 
      `;

      const countParams = [];

      // Reprendre les mêmes conditions WHERE pour le count
      if (search && search.trim() !== '') {
        countQuery += ' WHERE (u.name LIKE ? OR u.email LIKE ?)';
        countParams.push(`%${search}%`, `%${search}%`);
      }

      // Ajouter les autres filtres
      const countWhereConditions = [];

      if (filters.name && filters.name.trim() !== '') {
        countWhereConditions.push('u.name LIKE ?');
        countParams.push(`%${filters.name}%`);
      }

      if (filters.email && filters.email.trim() !== '') {
        countWhereConditions.push('u.email LIKE ?');
        countParams.push(`%${filters.email}%`);
      }

      if (filters.role && filters.role.trim() !== '') {
        if (filters.role === 'admin') {
          countWhereConditions.push('u.is_admin = 1');
        } else if (filters.role === 'user') {
          countWhereConditions.push('u.is_admin = 0');
        }
      }

      if (countWhereConditions.length > 0) {
        const hasExistingWhere = countQuery.includes('WHERE');
        const connector = hasExistingWhere ? ' AND ' : ' WHERE ';
        countQuery += connector + countWhereConditions.join(' AND ');
      }

      // Pour le count avec module_count, on doit grouper et compter
      if (filters.module_count && filters.module_count.trim() !== '') {
        const count = parseInt(filters.module_count);
        if (!isNaN(count)) {
          countQuery = `
            SELECT COUNT(*) as total FROM (
              SELECT u.id
              FROM users u 
              LEFT JOIN modules m ON u.id = m.user_id 
              ${countQuery.replace('SELECT COUNT(DISTINCT u.id) as total FROM users u LEFT JOIN modules m ON u.id = m.user_id', '').replace('WHERE', 'WHERE')}
              GROUP BY u.id
              HAVING COUNT(m.id) = ?
            ) as filtered_users
          `;
          countParams.push(count);
        }
      }

      const totalResult = await this.findOne(countQuery, countParams);
      const total = totalResult ? totalResult.total : 0;

      return {
        users,
        total,
      };
    } catch (error) {
      Logger.error('Erreur lors de la récupération des utilisateurs:', error);
      throw error;
    }
  }

  /**
   * Met à jour le profil d'un utilisateur
   * @param {number} userId - ID de l'utilisateur
   * @param {Object} updates - Données à mettre à jour
   * @returns {boolean} Succès de la mise à jour
   */
  async updateProfile(userId, updates) {
    try {
      const allowedFields = ['name', 'email'];
      const fields = [];
      const values = [];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key) && value !== undefined) {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      }

      if (fields.length === 0) {
        throw new Error('Aucun champ valide à mettre à jour');
      }

      values.push(userId);

      const result = await this.update(
        `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      return result.affectedRows > 0;
    } catch (error) {
      Logger.error('Erreur lors de la mise à jour du profil:', error);
      throw error;
    }
  }

  /**
   * Met à jour la dernière connexion d'un utilisateur
   * @param {number} userId - ID de l'utilisateur
   * @returns {boolean} Succès de la mise à jour
   */
  async updateLastLogin(userId) {
    try {
      const result = await this.update('UPDATE users SET last_login = NOW() WHERE id = ?', [
        userId,
      ]);

      return result.affectedRows > 0;
    } catch (error) {
      Logger.error('Erreur lors de la mise à jour de la dernière connexion:', error);
      throw error;
    }
  }

  /**
   * Vérifie si un email existe déjà
   * @param {string} email - Email à vérifier
   * @returns {boolean} True si l'email existe
   */
  async emailExists(email) {
    try {
      const user = await this.findOne('SELECT id FROM users WHERE email = ?', [email]);
      return !!user;
    } catch (error) {
      Logger.error("Erreur lors de la vérification de l'email:", error);
      throw error;
    }
  }

  /**
   * Compte le nombre total d'utilisateurs
   * @returns {number} Nombre total d'utilisateurs
   */
  async count() {
    try {
      const result = await this.findOne('SELECT COUNT(*) as total FROM users');
      return result ? result.total : 0;
    } catch (error) {
      Logger.error('Erreur lors du comptage des utilisateurs:', error);
      throw error;
    }
  }

  /**
   * Compte le nombre d'administrateurs
   * @returns {number} Nombre d'administrateurs
   */
  async countAdmins() {
    try {
      const result = await this.findOne('SELECT COUNT(*) as total FROM users WHERE is_admin = 1');
      return result ? result.total : 0;
    } catch (error) {
      Logger.error('Erreur lors du comptage des administrateurs:', error);
      throw error;
    }
  }

  /**
   * Change le mot de passe d'un utilisateur
   * @param {number} userId - ID de l'utilisateur
   * @param {string} currentPassword - Mot de passe actuel
   * @param {string} newPassword - Nouveau mot de passe
   * @returns {boolean} True si le changement a réussi
   */
  async changePassword(userId, currentPassword, newPassword) {
    try {
      // Vérifier l'utilisateur et son mot de passe actuel
      const user = await this.findOne('SELECT id, password FROM users WHERE id = ?', [userId]);
      if (!user) {
        throw new Error('Utilisateur non trouvé');
      }

      // Vérifier le mot de passe actuel
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        throw new Error('Mot de passe actuel incorrect');
      }

      // Hasher le nouveau mot de passe
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Mettre à jour le mot de passe
      const result = await this.update(
        'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [hashedPassword, userId]
      );

      return result.affectedRows > 0;
    } catch (error) {
      Logger.error('Erreur lors du changement de mot de passe:', error);
      throw error;
    }
  }

  /**
   * Récupère les statistiques des utilisateurs pour l'administration
   * @returns {Object} Statistiques des utilisateurs
   */
  async getStats() {
    try {
      const [totalResult, adminResult, recentResult] = await Promise.all([
        this.findOne('SELECT COUNT(*) as total FROM users'),
        this.findOne('SELECT COUNT(*) as total FROM users WHERE is_admin = 1'),
        this.findOne(
          'SELECT COUNT(*) as total FROM users WHERE last_login > DATE_SUB(NOW(), INTERVAL 30 DAY)'
        ),
      ]);

      return {
        total: totalResult?.total || 0,
        admins: adminResult?.total || 0,
        active: recentResult?.total || 0,
        regular: (totalResult?.total || 0) - (adminResult?.total || 0),
      };
    } catch (error) {
      Logger.error('Erreur lors du calcul des statistiques utilisateurs:', error);
      return {
        total: 0,
        admins: 0,
        active: 0,
        regular: 0,
      };
    }
  }
}

module.exports = UserDAO;
