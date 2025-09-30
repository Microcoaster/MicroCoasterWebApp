/**
 * Routes de documentation - Affichage des guides utilisateur
 *
 * Gère l'affichage de la page de documentation et des guides
 * d'utilisation pour les utilisateurs de l'application.
 *
 * @module documentations
 * @description Routes de la page de documentation avec accès authentifié
 */

const express = require('express');
const { requireAuth } = require('./auth');
const databaseManager = require('../bdd/DatabaseManager');
const router = express.Router();

/**
 * Route d'affichage de la page de documentation
 * Affiche la page de documentation pour les utilisateurs authentifiés
 * @param {Request} req - Requête Express avec session utilisateur authentifiée
 * @param {Response} res - Réponse Express pour rendu de vue documentation
 * @returns {Promise<void>}
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user_id;

    // Récupérer les informations utilisateur
    const user = await databaseManager.users.findById(userId);
    if (!user) {
      return res.redirect('/logout');
    }

    res.render('documentations', {
      title: req.t('common.docs') + ' - ' + req.t('common.app_name'),
      currentPage: 'documentations',
      user: user, // Passer l'objet utilisateur complet avec isAdmin
    });
  } catch (error) {
    console.error('Erreur lors du chargement des documentations:', error);
    res.status(500).render('error', {
      title: req.t('common.error') + ' - ' + req.t('common.app_name'),
      message: 'Une erreur est survenue lors du chargement des documentations',
      error: process.env.NODE_ENV === 'development' ? error : {},
    });
  }
});

module.exports = router;
