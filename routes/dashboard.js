const express = require('express');
const router = express.Router();
const database = require('../models/database');

// Route pour afficher le dashboard
router.get('/', async (req, res) => {
  try {
    // Vérifier que l'utilisateur est connecté
    if (!req.session.user_id) {
      return res.redirect('/');
    }

    // Récupérer les modules de l'utilisateur connecté
    const userModules = await database.getUserModules(req.session.user_id);
    
    // S'assurer que tous les modules sont offline par défaut
    userModules.forEach(module => {
      module.isOnline = false;
    });
    
    // Calculer les statistiques
    const stats = {
      totalModules: userModules.length,
      onlineModules: userModules.filter(m => m.isOnline).length,
      offlineModules: userModules.filter(m => !m.isOnline).length,
      moduleTypes: {}
    };

    // Compter les types de modules
    userModules.forEach(module => {
      const type = module.type || 'Unknown';
      stats.moduleTypes[type] = (stats.moduleTypes[type] || 0) + 1;
    });

    // Récupérer les informations utilisateur
    const user = await database.getUserById(req.session.user_id);

    res.render('dashboard', {
      title: 'Dashboard - MicroCoaster',
      currentPage: 'dashboard',
      user: user,
      stats: stats,
      modules: userModules
    });

  } catch (error) {
    console.error('Erreur lors du chargement du dashboard:', error);
    res.status(500).render('error', {
      title: 'Erreur - MicroCoaster',
      message: 'Une erreur est survenue lors du chargement du dashboard',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
});

module.exports = router;