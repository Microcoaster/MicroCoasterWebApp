/**
 * Routes des chronologies - Interface de planification séquentielle
 *
 * Gère l'affichage de l'interface de chronologies pour la planification
 * et la visualisation des séquences de modules dans le temps.
 *
 * @module timelines
 * @description Routes de l'interface de chronologies avec modules utilisateur
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('./auth');
const databaseManager = require('../bdd/DatabaseManager');
const Logger = require('../utils/logger');

/**
 * Vérifie si une chaîne se termine par un suffixe (insensible à la casse)
 * @param {string} haystack - Chaîne à vérifier
 * @param {string} needle - Suffixe recherché
 * @returns {boolean} True si la chaîne se termine par le suffixe
 * @private
 */
function endsWithCi(haystack, needle) {
  if (needle.length === 0) return true;
  return haystack.toLowerCase().endsWith(needle.toLowerCase());
}

/**
 * Infère automatiquement le type d'un module depuis son ID ou nom
 * Utilise les conventions de nommage MicroCoaster (dupliqué de modules.js)
 * @param {string} moduleId - ID du module (ex: MC-0001-STN)
 * @param {string} [name=''] - Nom optionnel du module
 * @returns {string} Type inféré (Station, Launch Track, Switch Track, etc.)
 * @private
 */
function mcInferType(moduleId, name = '') {
  const mid = moduleId?.toUpperCase().trim() || '';
  if (endsWithCi(mid, 'STN')) return 'Station';
  if (endsWithCi(mid, 'LFX')) return 'Light FX';
  if (endsWithCi(mid, 'AP')) return 'Audio Player';
  if (endsWithCi(mid, 'SM')) return 'Smoke Machine';
  if (endsWithCi(mid, 'ST')) return 'Switch Track';
  if (endsWithCi(mid, 'LT')) return 'Launch Track';

  const nm = name?.toUpperCase().trim() || '';
  if (endsWithCi(nm, ' STN')) return 'Station';
  if (endsWithCi(nm, ' LFX')) return 'Light FX';
  if (endsWithCi(nm, ' AP')) return 'Audio Player';
  if (endsWithCi(nm, ' SM')) return 'Smoke Machine';
  if (endsWithCi(nm, ' ST')) return 'Switch Track';
  if (endsWithCi(nm, ' LT')) return 'Launch Track';

  return 'Unknown';
}

/**
 * Route d'affichage de la page des chronologies
 * Affiche l'interface de planification temporelle avec les modules utilisateur
 * @param {Request} req - Requête Express avec session utilisateur authentifiée
 * @param {Response} res - Réponse Express pour rendu de vue chronologies
 * @returns {Promise<void>}
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user_id;

    const userModules = await databaseManager.modules.findByUserId(userId);

    const formattedModules = userModules.map(module => ({
      module_id: module.module_id,
      name: module.name || module.module_id,
      type: module.type || mcInferType(module.module_id, module.name),
      claimed: module.claimed || 0,
      isOnline: false,
    }));

    const user = await databaseManager.users.findById(userId);

    res.render('timelines', {
      title: req.t('common.timelines') + ' - ' + req.t('common.app_name'),
      currentPage: 'timelines',
      user: user,
      modules: formattedModules,
    });
  } catch (error) {
    Logger.app.error('Erreur lors du chargement des timelines:', error);
    res.status(500).render('error', {
      title: req.t('common.error') + ' - ' + req.t('common.app_name'),
      message: 'Une erreur est survenue lors du chargement des timelines',
      error: process.env.NODE_ENV === 'development' ? error : {},
    });
  }
});

module.exports = router;
