const express = require('express');
const router = express.Router();
const databaseManager = require('../bdd/DatabaseManager');
const Logger = require('../utils/logger');

// Fonction helper pour calculer les statistiques
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

// Route pour afficher le dashboard
router.get('/', async (req, res) => {
  try {
    // Vérifier que l'utilisateur est connecté
    if (!req.session.user_id) {
      return res.redirect('/');
    }

    // Calculer les statistiques
    const stats = await calculateStats(req.session.user_id);

    // Récupérer les informations utilisateur
    const user = await databaseManager.users.findById(req.session.user_id);

    res.render('dashboard', {
      title: 'Dashboard - MicroCoaster',
      currentPage: 'dashboard',
      user: user,
      stats: stats,
    });
  } catch (error) {
    Logger.error('Erreur lors du chargement du dashboard:', error);
    res.status(500).render('error', {
      title: 'Erreur - MicroCoaster',
      message: 'Une erreur est survenue lors du chargement du dashboard',
      error: process.env.NODE_ENV === 'development' ? error : {},
    });
  }
});

// Route API pour récupérer les statistiques en temps réel
router.get('/stats', async (req, res) => {
  try {
    // Vérifier que l'utilisateur est connecté
    if (!req.session.user_id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const stats = await calculateStats(req.session.user_id);
    res.json(stats);
  } catch (error) {
    Logger.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
