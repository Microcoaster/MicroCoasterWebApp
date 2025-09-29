/**
 * ============================================================================
 * LANGUAGE MIDDLEWARE - MULTILINGUAL SUPPORT
 * ============================================================================
 * Handles language detection, switching, and template integration
 *
 * @module LanguageMiddleware
 * @description Provides language detection from cookies/headers and EJS helpers
 * ============================================================================
 */

const localeLoader = require('../locales');

/**
 * Detect user's preferred language from various sources
 * @param {Request} req - Express request object
 * @returns {string} Detected language code
 */
function detectLanguage(req) {
  // 1. Check if language is explicitly set in cookie
  if (req.cookies && req.cookies.language) {
    const cookieLang = req.cookies.language;

    if (localeLoader.isLanguageSupported(cookieLang)) {
      return cookieLang;
    }
  }

  // 2. Check Accept-Language header
  const acceptLanguage = req.get('Accept-Language');
  if (acceptLanguage) {
    // Parse Accept-Language header (simplified)
    const languages = acceptLanguage
      .split(',')
      .map(lang => lang.split(';')[0].trim().toLowerCase())
      .map(lang => lang.split('-')[0]); // Take only language part (ignore country)

    // Find first supported language
    for (const lang of languages) {
      if (localeLoader.isLanguageSupported(lang)) {
        return lang;
      }
    }
  }

  // 3. Default fallback
  return localeLoader.getDefaultLanguage();
}

/**
 * Language detection and setup middleware
 */
function languageMiddleware(req, res, next) {
  // Detect current language
  const currentLang = detectLanguage(req);

  
  // Store in request for use in routes
  req.language = currentLang;
  
  // Create translation helper function
  req.t = function(key, params = {}) {
    return localeLoader.translate(currentLang, key, params);
  };

  // Make available in EJS templates
  res.locals.language = currentLang;
  res.locals.t = req.t;
  res.locals.availableLanguages = localeLoader.getLanguagesInfo();
  
  // Helper for checking current language
  res.locals.isCurrentLanguage = function(langCode) {
    return langCode === currentLang;
  };

  // Add switchLanguage helper to req
  req.switchLanguage = function(lang) {
    if (!lang || !localeLoader.isLanguageSupported(lang)) {
      return false;
    }
    
    res.cookie('language', lang, {
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
    
    return true;
  };

  next();
}

/**
 * Route handler for language switching
 */
function switchLanguage(req, res) {
  const { lang } = req.body;
  const referer = req.get('Referer') || '/dashboard';



  // Validate language
  if (!lang || !localeLoader.isLanguageSupported(lang)) {

    return res.status(400).json({
      success: false,
      message: 'Language not supported'
    });
  }

  // Set cookie (expires in 1 year)
  res.cookie('language', lang, {
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    httpOnly: false, // Allow JS access for frontend
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });



  // Return success response
  res.json({
    success: true,
    language: lang,
    message: 'Language changed successfully'
  });
}

/**
 * API endpoint to get current language info
 */
function getLanguageInfo(req, res) {
  res.json({
    currentLanguage: req.language,
    availableLanguages: localeLoader.getLanguagesInfo(),
    supportedLanguages: localeLoader.getSupportedLanguages()
  });
}

module.exports = {
  languageMiddleware,
  switchLanguage,
  getLanguageInfo,
  detectLanguage
};