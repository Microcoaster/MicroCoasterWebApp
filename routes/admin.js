/**
 * Routes d'administration - Interface de gestion système
 *
 * Gère les routes d'administration incluant l'interface principale,
 * les APIs de statistiques, et la gestion des utilisateurs et modules.
 *
 * @module admin
 * @description Routes d'administration avec contrôle d'accès et APIs temps réel
 */

const express = require('express');
const { requireAdmin } = require('./auth');
const databaseManager = require('../bdd/DatabaseManager');
const Logger = require('../utils/logger');
const router = express.Router();

router.use(requireAdmin);

/**
 * Route de la page principale d'administration
 * Récupère tous les utilisateurs et modules pour affichage avec pagination côté client
 * @param {Request} req - Requête Express avec session admin
 * @param {Response} res - Réponse Express pour rendu de vue
 * @returns {Promise<void>}
 */
router.get('/', async (req, res) => {
  try {
    const [allUsersResult, allModulesResult] = await Promise.all([
      databaseManager.users.findAll({
        limit: 999999,
        offset: 0,
        sortBy: 'created_at',
        sortOrder: 'DESC',
      }),
      databaseManager.modules.findAll({
        limit: 999999,
        offset: 0,
        sortBy: 'created_at',
        sortOrder: 'DESC',
      }),
    ]);

    const user = await databaseManager.users.findById(req.session.user_id);

    const stats = {
      totalUsers: allUsersResult.users.length,
      onlineUsers: 0,
      totalModules: allModulesResult.modules.length,
      onlineModules: allModulesResult.modules.filter(m => m.status === 'online').length,
    };

    res.render('admin', {
      currentPage: 'admin',
      users: allUsersResult.users,
      modules: allModulesResult.modules,
      stats,
      error: null,
      success: null,
      user: user,
      nickname: req.session.nickname,
    });
  } catch (error) {
    Logger.app.error('Admin page error:', error);
    res.status(500).render('error', { message: 'Erreur interne du serveur' });
  }
});

/**
 * API de récupération des statistiques système en temps réel
 * Fournit les métriques d'utilisateurs et modules connectés
 * @param {Request} req - Requête Express avec session admin
 * @param {Response} res - Réponse JSON avec statistiques
 * @returns {Promise<void>}
 */
router.get('/api/stats', async (req, res) => {
  try {
    const [usersResult, modulesResult] = await Promise.all([
      databaseManager.users.findAll({ limit: 10000, offset: 0 }),
      databaseManager.modules.findAll({ limit: 10000, offset: 0 }),
    ]);

    const stats = {
      totalUsers: usersResult.total,
      onlineUsers: 0, // Sera fourni par WebSocket en temps réel
      totalModules: modulesResult.total,
      onlineModules: modulesResult.modules.filter(m => m.status === 'online').length,
      offlineModules: modulesResult.modules.filter(m => m.status === 'offline').length,
      adminUsers: usersResult.users.filter(u => u.is_admin).length,
      regularUsers: usersResult.users.filter(u => !u.is_admin).length,
    };

    res.json(stats);
  } catch (error) {
    Logger.system.error('Admin stats error:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

/**
 * API de récupération de la liste des utilisateurs
 * Fournit la liste complète des utilisateurs pour l'interface d'administration
 * @param {Request} req - Requête Express avec session admin
 * @param {Response} res - Réponse JSON avec liste utilisateurs
 * @returns {Promise<void>}
 */
router.get('/api/users', async (req, res) => {
  try {
    const usersResult = await databaseManager.users.findAll({ limit: 1000, offset: 0 });
    res.json(usersResult);
  } catch (error) {
    Logger.app.error('Admin users API error:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

/**
 * API de récupération de la liste des modules
 * Fournit la liste complète des modules pour l'interface d'administration
 * @param {Request} req - Requête Express avec session admin
 * @param {Response} res - Réponse JSON avec liste modules
 * @returns {Promise<void>}
 */
router.get('/api/modules', async (req, res) => {
  try {
    const modulesResult = await databaseManager.modules.findAll({ limit: 1000, offset: 0 });
    res.json(modulesResult);
  } catch (error) {
    Logger.app.error('Admin modules API error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des modules' });
  }
});

module.exports = router;
