const Logger = require('../utils/logger');

/**
 * Classe de base pour tous les DAO
 * Gère la connexion à la base de données et les opérations communes
 */
class BaseDAO {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Exécute une requête SQL avec des paramètres
   * @param {string} query - Requête SQL
   * @param {Array} params - Paramètres de la requête
   * @returns {Array} Résultat de la requête
   */
  async execute(query, params = []) {
    try {
      const [rows] = await this.pool.execute(query, params);
      return rows;
    } catch (error) {
      Logger.app.error(`❌ Database error in ${this.constructor.name}:`, error);
      throw error;
    }
  }

  /**
   * Exécute une requête et retourne le premier résultat
   * @param {string} query - Requête SQL
   * @param {Array} params - Paramètres de la requête
   * @returns {Object|null} Premier résultat ou null
   */
  async findOne(query, params = []) {
    const rows = await this.execute(query, params);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Exécute une requête et retourne tous les résultats
   * @param {string} query - Requête SQL
   * @param {Array} params - Paramètres de la requête
   * @returns {Array} Tous les résultats
   */
  async findAll(query, params = []) {
    return await this.execute(query, params);
  }

  /**
   * Insère un nouvel enregistrement
   * @param {string} query - Requête INSERT
   * @param {Array} params - Paramètres de la requête
   * @returns {Object} Résultat avec insertId
   */
  async insert(query, params = []) {
    const [result] = await this.pool.execute(query, params);
    return result;
  }

  /**
   * Met à jour des enregistrements
   * @param {string} query - Requête UPDATE
   * @param {Array} params - Paramètres de la requête
   * @returns {Object} Résultat avec affectedRows
   */
  async update(query, params = []) {
    const [result] = await this.pool.execute(query, params);
    return result;
  }

  /**
   * Supprime des enregistrements
   * @param {string} query - Requête DELETE
   * @param {Array} params - Paramètres de la requête
   * @returns {Object} Résultat avec affectedRows
   */
  async delete(query, params = []) {
    const [result] = await this.pool.execute(query, params);
    return result;
  }

  /**
   * Construit une clause WHERE dynamique à partir d'un objet de filtres
   * @param {Object} filters - Objet des filtres
   * @returns {Object} { whereClause, params }
   */
  buildWhereClause(filters) {
    const conditions = [];
    const params = [];

    for (const [key, value] of Object.entries(filters)) {
      if (value !== null && value !== undefined && value !== '') {
        conditions.push(`${key} LIKE ?`);
        params.push(`%${value}%`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  /**
   * Construit une clause ORDER BY
   * @param {string} sortBy - Champ de tri
   * @param {string} sortOrder - Ordre de tri (ASC/DESC)
   * @param {Array} validFields - Champs valides pour le tri
   * @returns {string} Clause ORDER BY
   */
  buildOrderByClause(sortBy, sortOrder, validFields) {
    if (!validFields.includes(sortBy)) {
      sortBy = validFields[0]; // Valeur par défaut
    }

    if (!['ASC', 'DESC'].includes(sortOrder.toUpperCase())) {
      sortOrder = 'DESC'; // Valeur par défaut
    }

    return `ORDER BY ${sortBy} ${sortOrder}`;
  }

  /**
   * Construit une clause LIMIT avec pagination
   * @param {number} limit - Nombre d'éléments par page
   * @param {number} offset - Décalage
   * @returns {string} Clause LIMIT
   */
  buildLimitClause(limit, offset) {
    return `LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}`;
  }
}

module.exports = BaseDAO;
