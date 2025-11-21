/**
 * TimelineDAO - Gestionnaire d'accès aux données des timelines
 * Gère la persistance des séquences temporelles dans la base de données
 */

const BaseDAO = require('./BaseDAO');

class TimelineDAO extends BaseDAO {
  /**
   * Crée une nouvelle timeline pour un utilisateur
   * @param {number} userId - ID de l'utilisateur
   * @param {string} name - Nom de la timeline
   * @param {Object} data - Données JSON de la timeline
   * @returns {Promise<number>} ID de la timeline créée
   */
  async create(userId, name, data) {
    const query = `
      INSERT INTO timelines (user_id, name, data, created_at, updated_at)
      VALUES (?, ?, ?, NOW(), NOW())
    `;
    const result = await this.execute(query, [userId, name, JSON.stringify(data)]);
    return result.insertId;
  }

  /**
   * Récupère toutes les timelines d'un utilisateur
   * @param {number} userId - ID de l'utilisateur
   * @returns {Promise<Array>} Liste des timelines
   */
  async findByUserId(userId) {
    const query = `
      SELECT id, name, data, created_at, updated_at
      FROM timelines
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `;
    const results = await this.execute(query, [userId]);
    return results.map(row => ({
      id: row.id,
      name: row.name,
      data: row.data, // Déjà parsé par mysql2 car colonne JSON
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  /**
   * Récupère une timeline par son ID
   * @param {number} timelineId - ID de la timeline
   * @param {number} userId - ID de l'utilisateur (pour sécurité)
   * @returns {Promise<Object|null>} Timeline ou null si non trouvée
   */
  async findById(timelineId, userId) {
    const query = `
      SELECT id, name, data, created_at, updated_at
      FROM timelines
      WHERE id = ? AND user_id = ?
    `;
    const results = await this.execute(query, [timelineId, userId]);
    if (results.length === 0) return null;

    const row = results[0];
    return {
      id: row.id,
      name: row.name,
      data: row.data, // Déjà parsé par mysql2 car colonne JSON
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Met à jour une timeline existante
   * @param {number} timelineId - ID de la timeline
   * @param {number} userId - ID de l'utilisateur (pour sécurité)
   * @param {string} name - Nouveau nom (optionnel)
   * @param {Object} data - Nouvelles données (optionnel)
   * @returns {Promise<boolean>} True si mise à jour réussie
   */
  async update(timelineId, userId, name = null, data = null) {
    const updates = [];
    const params = [];

    if (name !== null) {
      updates.push('name = ?');
      params.push(name);
    }

    if (data !== null) {
      updates.push('data = ?');
      params.push(JSON.stringify(data));
    }

    if (updates.length === 0) return false;

    updates.push('updated_at = NOW()');
    params.push(timelineId, userId);

    const query = `
      UPDATE timelines
      SET ${updates.join(', ')}
      WHERE id = ? AND user_id = ?
    `;

    const result = await this.execute(query, params);
    return result.affectedRows > 0;
  }

  /**
   * Supprime une timeline
   * @param {number} timelineId - ID de la timeline
   * @param {number} userId - ID de l'utilisateur (pour sécurité)
   * @returns {Promise<boolean>} True si suppression réussie
   */
  async delete(timelineId, userId) {
    const query = 'DELETE FROM timelines WHERE id = ? AND user_id = ?';
    const result = await this.execute(query, [timelineId, userId]);
    return result.affectedRows > 0;
  }

  /**
   * Compte le nombre de timelines d'un utilisateur
   * @param {number} userId - ID de l'utilisateur
   * @returns {Promise<number>} Nombre de timelines
   */
  async countByUserId(userId) {
    const query = 'SELECT COUNT(*) as count FROM timelines WHERE user_id = ?';
    const results = await this.execute(query, [userId]);
    return results[0].count;
  }
}

module.exports = TimelineDAO;
