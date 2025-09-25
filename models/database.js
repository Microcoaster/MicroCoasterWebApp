const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const fs = require('fs').promises;
const path = require('path');

// ===== CONFIGURATION =====

// Configuration de la base de données depuis les variables d'environnement
const DB_CONFIG = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: process.env.DB_CHARSET,
  connectTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT)
};

// Pool de connexions pour de meilleures performances
const pool = mysql.createPool({
  ...DB_CONFIG,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0
});

// Cache en mémoire pour les statuts des modules
const moduleStatusCache = new Map(); // moduleId -> { status, lastSeen, userId }

// ===== UTILITAIRES SQL =====

/**
 * Exécute un fichier SQL avec remplacement de variables
 * @param {string} filename - Nom du fichier SQL
 * @param {Object} variables - Variables à remplacer (optionnel)
 */
async function executeSQLFile(filename, variables = {}) {
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
        await pool.execute(query);
      }
    }
    
    console.log(`✅ SQL file executed: ${filename}`);
    return true;
  } catch (error) {
    console.error(`❌ Error executing SQL file ${filename}:`, error);
    throw error;
  }
}

/**
 * Initialise la base de données avec les tables et données par défaut
 */
async function initializeDatabase() {
  try {
    console.log('🔄 Initializing database...');
    
    // Créer les tables
    await executeSQLFile('001_create_tables.sql');
    
    // Insérer les données par défaut
    await executeSQLFile('002_default_data.sql');
    
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

// ===== GESTION DES UTILISATEURS =====

/**
 * Vérifie les identifiants de connexion
 * @param {string} email - Email de l'utilisateur
 * @param {string} password - Mot de passe
 * @returns {Object|null} Utilisateur connecté ou null
 */
async function verifyLogin(email, password) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, email, name, password, is_admin FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    
    if (rows.length > 0) {
      const user = rows[0];
      const isValid = await bcrypt.compare(password, user.password);
      
      if (isValid) {
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          isAdmin: user.is_admin
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Database error in verifyLogin:', error);
    throw error;
  }
}

/**
 * Crée un nouveau compte utilisateur
 * @param {string} email - Email de l'utilisateur
 * @param {string} password - Mot de passe en clair
 * @param {string} name - Nom de l'utilisateur
 * @returns {Object} Nouvel utilisateur créé
 */
async function createUser(email, password, name) {
  try {
    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const [result] = await pool.execute(
      'INSERT INTO users (email, password, name, is_admin, created_at) VALUES (?, ?, ?, FALSE, NOW())',
      [email, hashedPassword, name]
    );
    
    return {
      id: result.insertId,
      email: email,
      name: name,
      isAdmin: false
    };
  } catch (error) {
    console.error('Database error in createUser:', error);
    throw error;
  }
}

/**
 * Récupère un utilisateur par son ID
 * @param {number} userId - ID de l'utilisateur
 * @returns {Object|null} Utilisateur ou null si non trouvé
 */
async function getUserById(userId) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, email, name, is_admin, last_login, created_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    
    if (rows.length > 0) {
      const user = rows[0];
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.is_admin,
        lastLogin: user.last_login,
        createdAt: user.created_at
      };
    }
    
    return null;
  } catch (error) {
    console.error('Database error in getUserById:', error);
    throw error;
  }
}

/**
 * Récupère tous les utilisateurs (admin seulement)
 * @returns {Array} Liste de tous les utilisateurs
 */
async function getAllUsers(options = {}) {
  try {
    const { 
      limit = 10, 
      offset = 0, 
      sortBy = 'last_login', 
      sortOrder = 'DESC', 
      search = '',
      filters = {}
    } = options;
    
    // S'assurer que limit et offset sont des entiers
    const limitInt = parseInt(limit, 10) || 10;
    const offsetInt = parseInt(offset, 10) || 0;
    
    let query = `
      SELECT u.id, u.email, u.name, u.is_admin, u.last_login, u.created_at,
             COUNT(m.id) as module_count
      FROM users u 
      LEFT JOIN modules m ON u.id = m.user_id 
    `;
    
    let params = [];
    let whereConditions = [];
    
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
    let havingConditions = [];
    let havingParams = [];
    
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
    
    query += ` GROUP BY u.id `;
    
    if (havingConditions.length > 0) {
      query += ` HAVING ${havingConditions.join(' AND ')} `;
      params.push(...havingParams);
    }
    
    // Tri
    const validSortFields = ['name', 'email', 'last_login', 'created_at', 'module_count'];
    const validSortOrders = ['ASC', 'DESC'];
    
    if (validSortFields.includes(sortBy) && validSortOrders.includes(sortOrder.toUpperCase())) {
      if (sortBy === 'module_count') {
        query += ` ORDER BY module_count ${sortOrder.toUpperCase()}, u.created_at DESC `;
      } else if (sortBy === 'last_login') {
        query += ` ORDER BY COALESCE(u.last_login, u.created_at) ${sortOrder.toUpperCase()}, u.created_at DESC `;
      } else {
        query += ` ORDER BY u.${sortBy} ${sortOrder.toUpperCase()}, u.created_at DESC `;
      }
    } else {
      query += ` ORDER BY COALESCE(u.last_login, u.created_at) DESC, u.created_at DESC `;
    }
    
    // Pagination - utiliser des valeurs directes au lieu de paramètres pour éviter l'erreur MySQL2
    query += ` LIMIT ${limitInt} OFFSET ${offsetInt} `;
    
    const [rows] = await pool.execute(query, params);
    
    // Compter le total pour la pagination
    let countQuery = `SELECT COUNT(DISTINCT u.id) as total FROM users u LEFT JOIN modules m ON u.id = m.user_id`;
    let countParams = [];
    let countWhereConditions = [];
    
    // Recherche globale
    if (search && search.trim() !== '') {
      countWhereConditions.push('(u.name LIKE ? OR u.email LIKE ?)');
      countParams.push(`%${search}%`, `%${search}%`);
    }
    
    // Filtres par colonne pour le count
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
    
    if (filters.module_count && filters.module_count.trim() !== '') {
      const count = parseInt(filters.module_count);
      if (!isNaN(count)) {
        countQuery = `SELECT COUNT(*) as total FROM (SELECT u.id FROM users u LEFT JOIN modules m ON u.id = m.user_id`;
        if (countWhereConditions.length > 0) {
          countQuery += ` WHERE ${countWhereConditions.join(' AND ')} `;
        }
        countQuery += ` GROUP BY u.id HAVING COUNT(m.id) = ?) subquery`;
        countParams.push(count);
      }
    } else {
      if (countWhereConditions.length > 0) {
        countQuery += ` WHERE ${countWhereConditions.join(' AND ')} `;
      }
      countQuery += ` GROUP BY u.id`;
    }
    
    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult && countResult[0] ? countResult[0].total : 0;
    
    return { users: rows, total, limit: limitInt, offset: offsetInt };
  } catch (error) {
    console.error('Database error in getAllUsers:', error);
    throw error;
  }
}

/**
 * Met à jour le profil d'un utilisateur
 * @param {number} userId - ID de l'utilisateur
 * @param {Object} updates - Champs à mettre à jour
 * @returns {boolean} True si mis à jour avec succès
 */
async function updateUserProfile(userId, updates) {
  try {
    const { name, email, password } = updates;
    const fields = [];
    const values = [];
    
    if (name !== undefined) {
      fields.push('name = ?');
      values.push(name);
    }
    
    if (email !== undefined) {
      fields.push('email = ?');
      values.push(email);
    }
    
    if (password !== undefined) {
      const hashedPassword = await bcrypt.hash(password, 12);
      fields.push('password = ?');
      values.push(hashedPassword);
    }
    
    if (fields.length === 0) {
      return false;
    }
    
    values.push(userId);
    const [result] = await pool.execute(
      `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
      values
    );
    
    return result.affectedRows > 0;
  } catch (error) {
    console.error('Database error in updateUserProfile:', error);
    throw error;
  }
}

// ===== GESTION DES MODULES =====

/**
 * Récupère les modules d'un utilisateur
 * @param {number} userId - ID de l'utilisateur
 * @returns {Array} Liste des modules de l'utilisateur
 */
async function getUserModules(userId) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, module_id, module_code, name, type FROM modules WHERE user_id = ? ORDER BY name ASC',
      [userId]
    );
    
    return rows.map(module => {
      const moduleId = module.module_id;
      const cached = moduleStatusCache.get(moduleId);
      const isOnline = cached && cached.status === 'online';
      
      return {
        ...module,
        status: isOnline ? 'online' : 'offline',
        isOnline: isOnline,
        lastSeen: cached ? cached.lastSeen : null,
        type: module.type || 'Unknown'
      };
    });
  } catch (error) {
    console.error('Database error in getUserModules:', error);
    throw error;
  }
}

/**
 * Récupère tous les modules (admin seulement)
 * @returns {Array} Liste de tous les modules
 */
async function getAllModules(options = {}) {
  try {
    const { 
      limit = 10, 
      offset = 0, 
      sortBy = 'last_seen', 
      sortOrder = 'DESC', 
      search = '',
      filters = {}
    } = options;
    
    // S'assurer que limit et offset sont des entiers
    const limitInt = parseInt(limit, 10) || 10;
    const offsetInt = parseInt(offset, 10) || 0;
    
    let query = `
      SELECT m.*, u.name as user_name, u.email as user_email 
      FROM modules m 
      LEFT JOIN users u ON m.user_id = u.id 
    `;
    
    let params = [];
    let whereConditions = [];
    
    // Recherche globale (ancienne méthode pour compatibilité)
    if (search && search.trim() !== '') {
      whereConditions.push('(m.module_id LIKE ? OR m.name LIKE ? OR m.type LIKE ? OR u.name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
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
    
    if (filters.status && filters.status.trim() !== '') {
      whereConditions.push('m.status = ?');
      params.push(filters.status);
    }
    
    if (whereConditions.length > 0) {
      query += ` WHERE ${whereConditions.join(' AND ')} `;
    }
    
    // Tri
    const validSortFields = ['module_id', 'name', 'type', 'user_name', 'status', 'last_seen', 'created_at'];
    const validSortOrders = ['ASC', 'DESC'];
    
    if (validSortFields.includes(sortBy) && validSortOrders.includes(sortOrder.toUpperCase())) {
      if (sortBy === 'user_name') {
        query += ` ORDER BY u.name ${sortOrder.toUpperCase()}, COALESCE(m.last_seen, m.created_at) DESC `;
      } else if (sortBy === 'last_seen') {
        query += ` ORDER BY COALESCE(m.last_seen, m.created_at) ${sortOrder.toUpperCase()}, m.created_at DESC `;
      } else {
        query += ` ORDER BY m.${sortBy} ${sortOrder.toUpperCase()}, COALESCE(m.last_seen, m.created_at) DESC `;
      }
    } else {
      query += ` ORDER BY COALESCE(m.last_seen, m.created_at) DESC, m.created_at DESC `;
    }
    
    // Pagination - utiliser des valeurs directes au lieu de paramètres pour éviter l'erreur MySQL2
    query += ` LIMIT ${limitInt} OFFSET ${offsetInt} `;
    
    const [rows] = await pool.execute(query, params);
    
    // Compter le total pour la pagination
    let countQuery = `SELECT COUNT(m.id) as total FROM modules m LEFT JOIN users u ON m.user_id = u.id`;
    let countParams = [];
    let countWhereConditions = [];
    
    // Recherche globale
    if (search && search.trim() !== '') {
      countWhereConditions.push('(m.module_id LIKE ? OR m.name LIKE ? OR m.type LIKE ? OR u.name LIKE ?)');
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    // Filtres par colonne pour le count
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
    
    if (filters.status && filters.status.trim() !== '') {
      countWhereConditions.push('m.status = ?');
      countParams.push(filters.status);
    }
    
    if (countWhereConditions.length > 0) {
      countQuery += ` WHERE ${countWhereConditions.join(' AND ')} `;
    }
    
    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult && countResult[0] ? countResult[0].total : 0;
    
    const mappedModules = rows.map(module => {
      const moduleId = module.module_id;
      const cached = moduleStatusCache.get(moduleId);
      const isOnline = cached && cached.status === 'online';
      
      return {
        ...module,
        status: isOnline ? 'online' : 'offline',
        isOnline: isOnline,
        lastSeen: cached ? cached.lastSeen : module.last_seen,
        type: module.type || 'Unknown'
      };
    });
    
    return { modules: mappedModules, total, limit: limitInt, offset: offsetInt };
  } catch (error) {
    console.error('Database error in getAllModules:', error);
    throw error;
  }
}

/**
 * Récupère les modules non assignés (disponibles)
 * @returns {Array} Liste des modules disponibles
 */
async function getAvailableModules() {
  try {
    const [rows] = await pool.execute(
      'SELECT id, module_id, module_code, name, type FROM modules WHERE user_id IS NULL AND claimed = FALSE ORDER BY name ASC'
    );
    
    return rows.map(module => ({
      ...module,
      status: 'offline',
      isOnline: false,
      lastSeen: null,
      type: module.type || 'Unknown'
    }));
  } catch (error) {
    console.error('Database error in getAvailableModules:', error);
    throw error;
  }
}

/**
 * Assigne un module disponible à un utilisateur
 * @param {string} moduleId - ID du module
 * @param {number} userId - ID de l'utilisateur
 * @returns {boolean} True si l'assignation a réussi
 */
async function claimModule(moduleId, userId) {
  try {
    const [result] = await pool.execute(
      'UPDATE modules SET user_id = ?, claimed = TRUE, updated_at = CURRENT_TIMESTAMP WHERE module_id = ? AND (user_id IS NULL OR claimed = FALSE)',
      [userId, moduleId]
    );
    
    return result.affectedRows > 0;
  } catch (error) {
    console.error('Database error in claimModule:', error);
    throw error;
  }
}

/**
 * Libère un module (le rend disponible)
 * @param {string} moduleId - ID du module
 * @param {number} userId - ID de l'utilisateur (pour vérification)
 * @returns {boolean} True si la libération a réussi
 */
async function releaseModule(moduleId, userId) {
  try {
    const [result] = await pool.execute(
      'UPDATE modules SET user_id = NULL, claimed = FALSE, updated_at = CURRENT_TIMESTAMP WHERE module_id = ? AND user_id = ?',
      [moduleId, userId]
    );
    
    return result.affectedRows > 0;
  } catch (error) {
    console.error('Database error in releaseModule:', error);
    throw error;
  }
}

/**
 * Récupère un module par son ID
 * @param {string} moduleId - ID du module
 * @returns {Object|null} Module ou null si non trouvé
 */
async function getModuleById(moduleId) {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM modules WHERE module_id = ? LIMIT 1',
      [moduleId]
    );
    
    if (rows.length > 0) {
      return rows[0];
    }
    
    return null;
  } catch (error) {
    console.error('Database error in getModuleById:', error);
    throw error;
  }
}

/**
 * Met à jour la dernière connexion d'un utilisateur
 * @param {number} userId - ID de l'utilisateur
 */
async function updateLastLogin(userId) {
  try {
    await pool.execute(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
      [userId]
    );
  } catch (error) {
    console.error('Database error in updateLastLogin:', error);
    throw error;
  }
}

// ===== GESTION DU STATUT DES MODULES =====

/**
 * Met à jour le statut d'un module en temps réel
 * @param {string} moduleId - ID du module
 * @param {string} status - Nouveau statut (online/offline)
 * @param {number} userId - ID du propriétaire du module (optionnel)
 */
async function updateModuleStatus(moduleId, status, userId = null) {
  try {
    const now = new Date();
    
    if (status === 'online') {
      // Récupérer le userId depuis la DB si pas fourni
      if (!userId) {
        const [rows] = await pool.execute(
          'SELECT user_id FROM modules WHERE module_id = ? LIMIT 1',
          [moduleId]
        );
        userId = rows.length > 0 ? rows[0].user_id : null;
      }
      
      if (userId) {
        moduleStatusCache.set(moduleId, {
          status: 'online',
          lastSeen: now,
          userId: userId
        });
      }
    } else {
      // Marquer comme offline ou supprimer du cache
      const cached = moduleStatusCache.get(moduleId);
      if (cached) {
        moduleStatusCache.set(moduleId, {
          ...cached,
          status: 'offline',
          lastSeen: now
        });
      }
    }
  } catch (error) {
    console.error('Database error in updateModuleStatus:', error);
    // Ne pas throw pour éviter de casser les connexions WebSocket
  }
}

/**
 * Nettoie les statuts anciens (modules déconnectés il y a plus de X minutes)
 * @param {number} maxAgeMinutes - Âge maximum en minutes (défaut: 5 minutes)
 */
function cleanupModuleStatus(maxAgeMinutes = 5) {
  const now = new Date();
  const maxAge = maxAgeMinutes * 60 * 1000;
  
  for (const [moduleId, data] of moduleStatusCache.entries()) {
    if (data.status === 'offline' && (now - data.lastSeen) > maxAge) {
      moduleStatusCache.delete(moduleId);
    }
  }
}

// Nettoyage automatique toutes les 5 minutes
setInterval(() => cleanupModuleStatus(), 5 * 60 * 1000);

// ===== UTILITAIRES =====

/**
 * Teste la connexion à la base de données
 */
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connection successful');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Fermeture propre du pool
process.on('SIGINT', async () => {
  console.log('Closing database pool...');
  await pool.end();
  process.exit(0);
});

// ===== EXPORTS =====

module.exports = {
  // Configuration et utilitaires
  pool,
  initializeDatabase,
  executeSQLFile,
  testConnection,
  
  // Gestion des utilisateurs
  verifyLogin,
  createUser,
  getUserById,
  getAllUsers,
  updateUserProfile,
  updateLastLogin,
  
  // Gestion des modules
  getUserModules,
  getAllModules,
  getAvailableModules,
  claimModule,
  releaseModule,
  getModuleById,
  
  // Gestion du statut
  updateModuleStatus,
  cleanupModuleStatus,
  moduleStatusCache
};