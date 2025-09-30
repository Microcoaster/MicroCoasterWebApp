/**
 * Routes du tableau de bord - Interface utilisateur principale
 *
 * Gère l'affichage du dashboard utilisateur avec statistiques personnalisées,
 * métriques de modules et APIs de données temps réel.
 *
 * @module dashboard
 * @description Routes du dashboard avec statistiques utilisateur et APIs de données
 */

const express = require('express');
const router = express.Router();
const databaseManager = require('../bdd/DatabaseManager');
const Logger = require('../utils/logger');

/**
 * Calcule les statistiques personnalisées pour un utilisateur
 * Génère les métriques de modules et types pour le dashboard
 * @param {number} userId - ID de l'utilisateur
 * @returns {Promise<Object>} Statistiques calculées
 * @returns {number} returns.totalModules - Nombre total de modules
 * @returns {number} returns.onlineModules - Nombre de modules en ligne
 * @returns {number} returns.offlineModules - Nombre de modules hors ligne
 * @returns {Object} returns.moduleTypes - Répartition par types de modules
 * @private
 */
async function calculateStats(userId) {
  const userModules = await databaseManager.modules.findByUserId(userId);

  // Récupérer les statuts en ligne depuis la base de données
  const onlineModules = userModules.filter(m => m.status === 'online').length;

  const stats = {
    totalModules: userModules.length,
    onlineModules: onlineModules,
    offlineModules: userModules.length - onlineModules,
    moduleTypes: {},
  };

  // Compter les types de modules
  userModules.forEach(module => {
    const type = module.type || 'Unknown';
    stats.moduleTypes[type] = (stats.moduleTypes[type] || 0) + 1;
  });

  return stats;
}

/**
 * Route principale d'affichage du tableau de bord
 * Affiche le dashboard personnalisé avec statistiques utilisateur et métriques modules
 * @param {Request} req - Requête Express avec session utilisateur
 * @param {Response} res - Réponse Express pour rendu de vue dashboard
 * @returns {Promise<void>}
 */
router.get('/', async (req, res) => {
  try {
    if (!req.session.user_id) {
      return res.redirect('/');
    }

    // Calculer les statistiques
    const stats = await calculateStats(req.session.user_id);

    // Récupérer les informations utilisateur
    const user = await databaseManager.users.findById(req.session.user_id);

    res.render('dashboard', {
      title: req.t('dashboard.title'),
      currentPage: 'dashboard',
      user: user,
      stats: stats,
    });
  } catch (error) {
    Logger.app.error('Erreur lors du chargement du dashboard:', error);
    res.status(500).render('error', {
      title: req.t('common.error') + ' - ' + req.t('common.app_name'),
      message: 'Une erreur est survenue lors du chargement du dashboard',
      error: process.env.NODE_ENV === 'development' ? error : {},
    });
  }
});

/**
 * API de récupération des statistiques temps réel
 * Fournit les métriques actualisées pour le dashboard utilisateur
 * @param {Request} req - Requête Express avec session utilisateur
 * @param {Response} res - Réponse JSON avec statistiques
 * @returns {Promise<void>}
 */
router.get('/stats', async (req, res) => {
  try {
    if (!req.session.user_id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const stats = await calculateStats(req.session.user_id);
    res.json(stats);
  } catch (error) {
    Logger.system.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
