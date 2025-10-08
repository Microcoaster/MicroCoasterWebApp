/**
 * ============================================================================
 * MIDDLEWARE DE LANGUE - SUPPORT MULTILINGUE
 * ============================================================================
 * Gère la détection de langue, le changement et l'intégration dans les templates
 *
 * @module LanguageMiddleware
 * @description Fournit la détection de langue depuis les cookies/headers et les helpers EJS
 * ============================================================================
 */

const localeLoader = require('../locales');

/**
 * Détecte la langue préférée de l'utilisateur depuis diverses sources
 * @param {Request} req - Objet de requête Express
 * @param {Object} [user] - Objet utilisateur optionnel avec préférence de langue
 * @returns {string} Code de langue détecté
 */
function detectLanguage(req, user = null) {
  // 1. Vérifier si la langue est explicitement définie dans le cookie
  if (req.cookies && req.cookies.language) {
    const cookieLang = req.cookies.language;

    if (localeLoader.isLanguageSupported(cookieLang)) {
      return cookieLang;
    }
  }

  // 2. Vérifier la langue préférée de l'utilisateur depuis la base de données (si utilisateur fourni)
  if (user && user.language && localeLoader.isLanguageSupported(user.language)) {
    return user.language;
  }

  // 3. Vérifier l'en-tête Accept-Language
  const acceptLanguage = req.get('Accept-Language');
  if (acceptLanguage) {
    // Analyser l'en-tête Accept-Language (simplifié)
    const languages = acceptLanguage
      .split(',')
      .map(lang => lang.split(';')[0].trim().toLowerCase())
      .map(lang => lang.split('-')[0]); // Prendre seulement la partie langue (ignorer le pays)

    // Trouver la première langue supportée
    for (const lang of languages) {
      if (localeLoader.isLanguageSupported(lang)) {
        return lang;
      }
    }
  }

  // 4. Valeur par défaut
  return localeLoader.getDefaultLanguage();
}

/**
 * Middleware de détection et configuration de langue
 * @param {Request} req - Objet de requête Express
 * @param {Response} res - Objet de réponse Express
 * @param {Function} next - Fonction de callback pour passer au middleware suivant
 */
function languageMiddleware(req, res, next) {
  // Détecter la langue actuelle
  const currentLang = detectLanguage(req);

  // Stocker dans la requête pour utilisation dans les routes
  req.language = currentLang;

  // Créer la fonction helper de traduction
  req.t = function (key, params = {}) {
    return localeLoader.translate(currentLang, key, params);
  };

  // Rendre disponible dans les templates EJS
  res.locals.language = currentLang;
  res.locals.t = req.t;
  res.locals.availableLanguages = localeLoader.getLanguagesInfo();

  // Helper pour vérifier la langue actuelle
  res.locals.isCurrentLanguage = function (langCode) {
    return langCode === currentLang;
  };

  // Ajouter le helper switchLanguage à req
  req.switchLanguage = function (lang) {
    if (!lang || !localeLoader.isLanguageSupported(lang)) {
      return false;
    }

    res.cookie('language', lang, {
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 an
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return true;
  };

  next();
}

/**
 * Gestionnaire de route pour le changement de langue
 * @param {Request} req - Objet de requête Express
 * @param {Response} res - Objet de réponse Express
 */
function switchLanguage(req, res) {
  const { lang } = req.body;

  // Valider la langue
  if (!lang || !localeLoader.isLanguageSupported(lang)) {
    return res.status(400).json({
      success: false,
      message: 'Language not supported',
    });
  }

  // Définir le cookie (expire dans 1 an)
  res.cookie('language', lang, {
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 an
    httpOnly: false, // Permettre l'accès JS pour le frontend
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  // Retourner la réponse de succès
  res.json({
    success: true,
    language: lang,
    message: 'Language changed successfully',
  });
}

/**
 * Point de terminaison API pour obtenir les informations de langue actuelles
 * @param {Request} req - Objet de requête Express
 * @param {Response} res - Objet de réponse Express
 */
function getLanguageInfo(req, res) {
  res.json({
    currentLanguage: req.language,
    availableLanguages: localeLoader.getLanguagesInfo(),
    supportedLanguages: localeLoader.getSupportedLanguages(),
  });
}

module.exports = {
  languageMiddleware,
  switchLanguage,
  getLanguageInfo,
  detectLanguage,
};
