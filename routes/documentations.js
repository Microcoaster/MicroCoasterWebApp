const express = require('express');
const { requireAuth } = require('./auth');
const databaseManager = require('../bdd/DatabaseManager');
const Logger = require('../utils/logger');
const router = express.Router();

// Route pour afficher les documentations
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user_id;

    // Récupérer les informations utilisateur
    const user = await databaseManager.users.findById(userId);
    if (!user) {
      return res.redirect('/logout');
    }

    res.render('documentations', {
      title: 'Documentations - MicroCoaster',
      currentPage: 'documentations',
      user: user, // Passer l'objet utilisateur complet avec isAdmin
    });
  } catch (error) {
    Logger.error('Erreur lors du chargement des documentations:', error);
    res.status(500).render('error', {
      title: 'Erreur - MicroCoaster',
      message: 'Une erreur est survenue lors du chargement des documentations',
      error: process.env.NODE_ENV === 'development' ? error : {},
    });
  }
});

module.exports = router;
