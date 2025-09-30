/**
 * Routes de gestion des langues - APIs de changement de langue
 * 
 * Gère les APIs de changement de langue incluant la commutation,
 * la récupération d'informations et les traductions côté client.
 * 
 * @module language
 * @description APIs de gestion des langues avec changement dynamique et traductions
 */

const express = require('express');
const router = express.Router();
const LocaleLoader = require('../locales/index');

/**
 * API de changement de langue utilisateur
 * Permet de basculer entre les langues disponibles (fr/en)
 * @param {Request} req - Requête Express avec paramètre language
 * @param {Response} res - Réponse JSON avec confirmation de changement
 * @returns {void}
 */
router.post('/switch', (req, res) => {
  const { language } = req.body;

  if (!language || !['en', 'fr'].includes(language)) {
    return res.status(400).json({
      error: 'Invalid language. Must be "en" or "fr".',
    });
  }

  req.switchLanguage(language);

  res.json({
    success: true,
    language,
    message: `Language switched to ${language}`,
  });
});

/**
 * API d'informations sur la langue actuelle
 * Fournit la langue courante et les langues disponibles
 * @param {Request} req - Requête Express avec langue actuelle
 * @param {Response} res - Réponse JSON avec informations de langue
 * @returns {void}
 */
router.get('/info', (req, res) => {
  res.json({
    current: req.language,
    available: ['fr', 'en'],
    default: 'en',
  });
});

/**
 * API de récupération des traductions côté client
 * Fournit toutes les traductions de la langue actuelle pour utilisation JavaScript
 * @param {Request} req - Requête Express avec langue actuelle
 * @param {Response} res - Réponse JSON avec traductions complètes
 * @returns {void}
 */
router.get('/translations', (req, res) => {
  const currentLanguage = req.language || 'en';
  const translations = LocaleLoader.getAllTranslations(currentLanguage);

  res.json({
    language: currentLanguage,
    translations: translations,
  });
});

module.exports = router;
