const mysql = require('mysql2/promise');

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

// Fonctions de base de données

/**
 * Vérifie les identifiants d'accès (remplace le code PHP)
 * @param {string} code - Code d'accès
 * @returns {Object|null} Utilisateur ou null si invalide
 */
async function verifyAccessCode(code) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, code, name FROM access_codes WHERE BINARY code = ? LIMIT 1',
      [code]
    );
    
    if (rows.length > 0) {
      return {
        id: rows[0].id,
        code: rows[0].code,
        name: rows[0].name
      };
    }
    
    return null;
  } catch (error) {
    console.error('Database error in verifyAccessCode:', error);
    throw error;
  }
}

/**
 * Ajoute un module pour un utilisateur (pour les tests)
 * @param {string} moduleId - ID du module
 * @param {string} name - Nom du module
 * @param {string} type - Type du module
 * @param {number} userId - ID de l'utilisateur
 */
async function addModule(moduleId, name, type, userId) {
  try {
    await pool.execute(
      'INSERT INTO modules (id, name, type, user_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), type = VALUES(type)',
      [moduleId, name, type, userId]
    );
    console.log(`✅ Module ${moduleId} added/updated for user ${userId}`);
  } catch (error) {
    console.error('Database error in addModule:', error);
    throw error;
  }
}

/**
 * Récupère les modules d'un utilisateur
 * @param {number} userId - ID de l'utilisateur
 * @returns {Array} Liste des modules
 */
async function getUserModules(userId) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, module_id, name, type FROM modules WHERE user_id = ? ORDER BY name ASC',
      [userId]
    );
    
    // Ajouter le statut depuis le cache ou offline par défaut
    return rows.map(module => {
      const moduleId = module.module_id;
      const cached = moduleStatusCache.get(moduleId);
      const isOnline = cached && cached.status === 'online' && cached.userId === userId;
      
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
 * Récupère un module spécifique
 * @param {string} moduleId - ID du module (module_id dans la BDD)
 * @param {number} userId - ID de l'utilisateur (pour sécurité)
 * @returns {Object|null} Module ou null si non trouvé
 */
async function getModule(moduleId, userId) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, module_id, name, type FROM modules WHERE module_id = ? AND user_id = ? LIMIT 1',
      [moduleId, userId]
    );
    
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('Database error in getModule:', error);
    throw error;
  }
}

/**
 * Met à jour le statut d'un module dans le cache mémoire
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
        console.log(`📊 Module ${moduleId} is online (cached)`);
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
        console.log(`📊 Module ${moduleId} is offline (cached)`);
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
      console.log(`🧹 Cleaned up old status for module ${moduleId}`);
    }
  }
}

// Nettoyage automatique toutes les 5 minutes
setInterval(() => cleanupModuleStatus(), 5 * 60 * 1000);

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

/**
 * Récupère un utilisateur par son ID
 * @param {number} userId - ID de l'utilisateur
 * @returns {Object|null} Utilisateur ou null si non trouvé
 */
async function getUserById(userId) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, code, name FROM access_codes WHERE id = ? LIMIT 1',
      [userId]
    );
    
    if (rows.length > 0) {
      return {
        id: rows[0].id,
        code: rows[0].code,
        name: rows[0].name,
        nickname: rows[0].name || rows[0].code // Utilise le nom ou le code comme nickname
      };
    }
    
    return null;
  } catch (error) {
    console.error('Database error in getUserById:', error);
    throw error;
  }
}

// Fermeture propre du pool
process.on('SIGINT', async () => {
  console.log('Closing database pool...');
  await pool.end();
  process.exit(0);
});

module.exports = {
  pool,
  verifyAccessCode,
  getUserModules,
  getModule,
  updateModuleStatus,
  testConnection,
  addModule,
  getUserById,
  moduleStatusCache // Exposer le cache pour debug si nécessaire
};