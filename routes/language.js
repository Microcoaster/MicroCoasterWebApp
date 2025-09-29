/**
 * ================================================================================
 * MICROCOASTER WEBAPP - LANGUAGE ROUTES
 * ================================================================================
 *
 * Purpose: Handle language switching API endpoints
 * Author: MicroCoaster Development Team
 * Created: 2024
 *
 * Description:
 * Provides REST API endpoints for:
 * - Language switching (POST /api/language/switch)
 * - Language information retrieval (GET /api/language/info)
 * - Client-side translations (GET /api/language/translations)
 *
 * Dependencies:
 * - middleware/language.js (switchLanguage function)
 * - locales/ (translation files)
 *
 * ================================================================================
 */

const express = require('express');
const router = express.Router();
const LocaleLoader = require('../locales/index');

/**
 * POST /api/language/switch
 * Switch user's language preference
 */
router.post('/switch', (req, res) => {
  const { language } = req.body;

  if (!language || !['en', 'fr'].includes(language)) {
    return res.status(400).json({
      error: 'Invalid language. Must be "en" or "fr".',
    });
  }

  // Use middleware function to switch language
  req.switchLanguage(language);

  res.json({
    success: true,
    language,
    message: `Language switched to ${language}`,
  });
});

/**
 * GET /api/language/info
 * Get current language information
 */
router.get('/info', (req, res) => {
  res.json({
    current: req.language,
    available: ['fr', 'en'],
    default: 'en',
  });
});

/**
 * GET /api/language/translations
 * Get all translations for current language for client-side use
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
