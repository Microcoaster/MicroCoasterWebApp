const express = require('express');
const router = express.Router();

// Route pour afficher les documentations
router.get('/', async (req, res) => {
  try {
    // Vérifier que l'utilisateur est connecté
    if (!req.session.user_id) {
      return res.redirect('/');
    }

    res.render('documentations', {
      title: 'Documentations - MicroCoaster',
      user: {
        id: req.session.user_id,
        code: req.session.code,
        nickname: req.session.nickname
      }
    });

  } catch (error) {
    console.error('Erreur lors du chargement des documentations:', error);
    res.status(500).render('error', {
      title: 'Erreur - MicroCoaster',
      message: 'Une erreur est survenue lors du chargement des documentations',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
});

module.exports = router;
