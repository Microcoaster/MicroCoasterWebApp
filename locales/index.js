/**
 * ============================================================================
 * CHARGEUR DE LANGUES - SUPPORT MULTILINGUE
 * ============================================================================
 * Gère le chargement et la mise en cache des fichiers de langues pour l'internationalisation
 *
 * @module LocaleLoader
 * @description Fournit le chargement des langues, les fallbacks et les utilitaires de traduction
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const Logger = require('../utils/logger');

class LocaleLoader {
  constructor() {
    this.languages = new Map();
    this.supportedLanguages = ['fr', 'en'];
    this.defaultLanguage = 'en';
  }

  /**
   * Initialise le chargeur de langues (charge tous les fichiers)
   */
  initialize() {
    if (this.languages.size === 0) {
      this.loadAllLanguages();
    }
  }

  /**
   * Charge tous les fichiers de langues en mémoire
   */
  loadAllLanguages() {
    this.supportedLanguages.forEach(lang => {
      try {
        const filePath = path.join(__dirname, `${lang}.json`);
        const content = fs.readFileSync(filePath, 'utf8');
        this.languages.set(lang, JSON.parse(content));
      } catch (error) {
        Logger.system.error(`[LocaleLoader] Error loading language ${lang}:`, error.message);
      }
    });
  }

  /**
   * Obtient la traduction pour une clé et une langue spécifiques
   * @param {string} lang - Code de langue (fr, en)
   * @param {string} key - Clé de traduction (ex: "navbar.dashboard")
   * @param {object} params - Paramètres optionnels pour l'interpolation de chaînes
   * @returns {string} Texte traduit ou fallback
   */
  translate(lang, key, params = {}) {
    // Valider la langue
    if (!this.isLanguageSupported(lang)) {
      lang = this.defaultLanguage;
    }

    const langData = this.languages.get(lang);
    if (!langData) {
      return key; // Fallback vers la clé si la langue n'est pas chargée
    }

    // Naviguer dans l'objet imbriqué en utilisant la notation pointée
    const translation = this.getNestedValue(langData, key);

    if (translation === undefined) {
      // Essayer la langue de fallback
      const fallbackData = this.languages.get(this.defaultLanguage);
      const fallbackTranslation = this.getNestedValue(fallbackData, key);

      if (fallbackTranslation !== undefined) {
        return this.interpolate(fallbackTranslation, params);
      }

      return key; // Fallback ultime
    }

    return this.interpolate(translation, params);
  }

  /**
   * Obtient une valeur imbriquée d'un objet en utilisant la notation pointée
   * @param {object} obj - Objet dans lequel chercher
   * @param {string} path - Chemin séparé par des points (ex: "navbar.dashboard")
   * @returns {string|undefined} Valeur ou undefined si non trouvée
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Interpolation simple de chaînes de caractères
   * @param {string} template - Chaîne modèle avec des placeholders {{variable}}
   * @param {object} params - Paramètres à remplacer
   * @returns {string} Chaîne interpolée
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
   * Vérifie si la langue est supportée
   * @param {string} lang - Code de langue
   * @returns {boolean} True si supportée
   */
  isLanguageSupported(lang) {
    return this.supportedLanguages.includes(lang);
  }

  /**
   * Obtient toutes les langues supportées
   * @returns {Array} Tableau des codes de langues
   */
  getSupportedLanguages() {
    return [...this.supportedLanguages];
  }

  /**
   * Obtient les informations des langues pour l'interface utilisateur
   * @returns {Array} Tableau d'objets de langues avec code et nom
   */
  getLanguagesInfo() {
    return [
      { code: 'fr', name: 'Français', flag: '🇫🇷' },
      { code: 'en', name: 'English', flag: '🇺🇸' },
    ];
  }

  /**
   * Obtient la langue par défaut
   * @returns {string} Code de la langue par défaut
   */
  getDefaultLanguage() {
    return this.defaultLanguage;
  }

  /**
   * Obtient toutes les traductions pour une langue donnée
   * @param {string} lang - Code de langue
   * @returns {Object} Toutes les traductions pour cette langue
   */
  getAllTranslations(lang) {
    if (!this.isLanguageSupported(lang)) {
      lang = this.defaultLanguage;
    }
    return this.languages.get(lang) || {};
  }

  /**
   * Recharge les langues (utile pour le développement)
   */
  reload() {
    this.languages.clear();
    this.loadAllLanguages();
  }
}

// Instance singleton - initialisation différée
let localeLoaderInstance = null;

function getLocaleLoader() {
  if (!localeLoaderInstance) {
    localeLoaderInstance = new LocaleLoader();
    localeLoaderInstance.initialize();
  }
  return localeLoaderInstance;
}

// Pour la compatibilité, exposer directement l'instance
module.exports = getLocaleLoader();
