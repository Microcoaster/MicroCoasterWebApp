/**
 * ============================================================================
 * LANGUAGE LOADER - MULTILINGUAL SUPPORT
 * ============================================================================
 * Manages loading and caching of language files for internationalization
 *
 * @module LocaleLoader
 * @description Provides language loading, fallback, and translation utilities
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

class LocaleLoader {
  constructor() {
    this.languages = new Map();
    this.supportedLanguages = ['fr', 'en'];
    this.defaultLanguage = 'fr';
    this.loadAllLanguages();
  }

  /**
   * Load all language files into memory
   */
  loadAllLanguages() {
    this.supportedLanguages.forEach(lang => {
      try {
        const filePath = path.join(__dirname, `${lang}.json`);
        const content = fs.readFileSync(filePath, 'utf8');
        this.languages.set(lang, JSON.parse(content));
      } catch (error) {
        console.error(`[LocaleLoader] Error loading language ${lang}:`, error.message);
      }
    });
  }

  /**
   * Get translation for a specific key and language
   * @param {string} lang - Language code (fr, en)
   * @param {string} key - Translation key (e.g., "navbar.dashboard")
   * @param {object} params - Optional parameters for string interpolation
   * @returns {string} Translated text or fallback
   */
  translate(lang, key, params = {}) {
    // Validate language
    if (!this.isLanguageSupported(lang)) {
      lang = this.defaultLanguage;
    }

    const langData = this.languages.get(lang);
    if (!langData) {
      return key; // Fallback to key if language not loaded
    }

    // Navigate through nested object using dot notation
    const translation = this.getNestedValue(langData, key);

    if (translation === undefined) {
      // Try fallback language
      const fallbackData = this.languages.get(this.defaultLanguage);
      const fallbackTranslation = this.getNestedValue(fallbackData, key);

      if (fallbackTranslation !== undefined) {
        return this.interpolate(fallbackTranslation, params);
      }

      return key; // Ultimate fallback
    }

    return this.interpolate(translation, params);
  }

  /**
   * Get nested value from object using dot notation
   * @param {object} obj - Object to search in
   * @param {string} path - Dot-separated path (e.g., "navbar.dashboard")
   * @returns {string|undefined} Value or undefined if not found
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Simple string interpolation
   * @param {string} template - Template string with {{variable}} placeholders
   * @param {object} params - Parameters to replace
   * @returns {string} Interpolated string
   */
  interpolate(template, params) {
    if (typeof template !== 'string') {
      return template;
    }

    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return params[key] !== undefined ? params[key] : match;
    });
  }

  /**
   * Check if language is supported
   * @param {string} lang - Language code
   * @returns {boolean} True if supported
   */
  isLanguageSupported(lang) {
    return this.supportedLanguages.includes(lang);
  }

  /**
   * Get all supported languages
   * @returns {Array} Array of language codes
   */
  getSupportedLanguages() {
    return [...this.supportedLanguages];
  }

  /**
   * Get language info for UI
   * @returns {Array} Array of language objects with code and name
   */
  getLanguagesInfo() {
    return [
      { code: 'fr', name: 'Français', flag: '🇫🇷' },
      { code: 'en', name: 'English', flag: '🇺🇸' },
    ];
  }

  /**
   * Get default language
   * @returns {string} Default language code
   */
  getDefaultLanguage() {
    return this.defaultLanguage;
  }

  /**
   * Reload languages (useful for development)
   */
  reload() {
    this.languages.clear();
    this.loadAllLanguages();
  }
}

// Singleton instance
const localeLoader = new LocaleLoader();

module.exports = localeLoader;
