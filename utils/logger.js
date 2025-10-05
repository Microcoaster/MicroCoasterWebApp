/**
 * ================================================================================
 * MICROCOASTER WEBAPP - SYSTÈME DE JOURNALISATION
 * ================================================================================
 *
 * @description Système de logs centralisé utilisant Winston avec séparation par domaines
 * @author Équipe MicroCoaster
 * @version 2.0
 *
 * Fonctionnalités :
 * - Logs séparés par domaine (app, activity, modules, esp, system)
 * - Format console avec emojis pour une lecture facile
 * - Format JSON structuré pour les fichiers
 * - Anti-spam pour les statistiques système
 * - Support des métadonnées et stack traces
 *
 * Domaines de logs :
 * - app : Démarrage, arrêt, erreurs critiques de l'application
 * - activity : Connexions utilisateurs, navigation, actions utilisateur
 * - modules : Communications ESP32, télémétrie, états modules
 * - esp : Logs dédiés WebSocket natif ESP32
 * - system : Statistiques, monitoring, nettoyage système
 *
 * ================================================================================
 */

const winston = require('winston');
const fs = require('fs');

// Créer le répertoire logs s'il n'existe pas
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Format de base pour tous les fichiers de logs
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Format console épuré - timestamp + emoji + message
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message }) => {
    const cleanMessage =
      typeof message === 'string' ? message.replace(/\{.*?\}/g, '').trim() : String(message);

    // Emoji selon le niveau de log
    let emoji = '';
    switch (level) {
      case 'error':
        emoji = '❌';
        break;
      case 'warn':
        emoji = '⚠️';
        break;
      case 'info':
        emoji = 'ℹ️';
        break;
      case 'debug':
        emoji = '🔍';
        break;
      default:
        emoji = 'ℹ️';
    }

    return ` ${emoji}  ${timestamp} : ${cleanMessage}`;
  })
);

// ============================================================================
// LOGGERS SPÉCIALISÉS PAR DOMAINE
// ============================================================================

/**
 * Logger principal de l'application
 * @description Gère le démarrage, arrêt, erreurs critiques et état général
 * @console Niveau info et plus élevé affiché en console
 * @file logs/app.log - Tous les niveaux sauvegardés
 */
const appLogger = winston.createLogger({
  level: 'debug',
  transports: [
    new winston.transports.Console({
      level: 'info', // Logs d'info importants en console
      format: consoleFormat, // Format clean (juste le message)
    }),
    new winston.transports.File({
      filename: 'logs/app.log',
      format: fileFormat,
    }),
  ],
});

/**
 * Logger d'activité utilisateur
 * @description Trace les connexions, déconnexions, navigation et actions utilisateur
 * @console Niveau info et plus élevé affiché en console
 * @file logs/activity.log - Tous les niveaux sauvegardés
 */
const activityLogger = winston.createLogger({
  level: 'debug',
  transports: [
    new winston.transports.Console({
      level: 'info', // Activité utilisateur importante en console
      format: consoleFormat,
    }),
    new winston.transports.File({
      filename: 'logs/activity.log',
      format: fileFormat,
    }),
  ],
});

/**
 * Logger des modules IoT
 * @description Gère les communications ESP32, télémétrie et états des modules
 * @console Aucun affichage console (évite le spam)
 * @file logs/modules.log - Tous les niveaux sauvegardés
 */
const modulesLogger = winston.createLogger({
  level: 'debug',
  transports: [
    new winston.transports.File({
      filename: 'logs/modules.log',
      format: fileFormat,
    }),
  ],
});

/**
 * Logger ESP32 dédié
 * @description Spécialisé pour les connexions WebSocket natives des modules ESP32
 * @console Aucun affichage console
 * @file logs/esp.log - Communications WebSocket ESP32 uniquement
 */
const espLogger = winston.createLogger({
  level: 'debug',
  transports: [
    new winston.transports.File({
      filename: 'logs/esp.log',
      format: fileFormat,
    }),
  ],
});

/**
 * Logger système et monitoring
 * @description Statistiques avec anti-spam, nettoyage et monitoring système
 * @console Aucun affichage console
 * @file logs/system.log - Monitoring et statistiques système
 */
const systemLogger = winston.createLogger({
  level: 'debug',
  transports: [
    new winston.transports.File({
      filename: 'logs/system.log',
      format: fileFormat,
    }),
  ],
});

// ============================================================================
// SYSTÈME ANTI-SPAM POUR STATISTIQUES
// ============================================================================

/**
 * Dernières statistiques système enregistrées
 * @type {Object|null}
 */
let lastSystemStats = null;

/**
 * Détermine si les statistiques système ont changé et méritent d'être loggées
 * @param {Object} currentStats - Statistiques actuelles du système
 * @param {number} currentStats.users - Nombre d'utilisateurs connectés
 * @param {number} currentStats.modules - Nombre de modules connectés
 * @param {number} currentStats.clients - Nombre de clients WebSocket
 * @param {number} currentStats.esp - Nombre de modules ESP32 connectés
 * @returns {boolean} True si les stats ont changé, false sinon
 */
function shouldLogSystemStats(currentStats) {
  if (!lastSystemStats) {
    lastSystemStats = currentStats;
    return true;
  }

  // Comparer les statistiques pour détecter un changement
  const hasChanged =
    lastSystemStats.users !== currentStats.users ||
    lastSystemStats.modules !== currentStats.modules ||
    lastSystemStats.clients !== currentStats.clients ||
    lastSystemStats.esp !== currentStats.esp;

  if (hasChanged) {
    lastSystemStats = currentStats;
    return true;
  }

  return false;
}

// ============================================================================
// LOGGER PRINCIPAL UNIFIÉ
// ============================================================================

/**
 * Objet logger principal avec méthodes spécialisées par domaine
 * @namespace Logger
 * @description Interface unifiée pour tous les types de logs de l'application
 */
const logger = {
  /**
   * Logger de l'application principale
   * @namespace Logger.app
   * @description Logs de démarrage, arrêt, erreurs critiques
   */
  app: {
    info: (msg, meta) => appLogger.info(msg, meta),
    warn: (msg, meta) => appLogger.warn(msg, meta),
    error: (msg, meta) => appLogger.error(msg, meta),
    debug: (msg, meta) => appLogger.debug(msg, meta),
  },

  /**
   * Logger d'activité utilisateur
   * @namespace Logger.activity
   * @description Logs des connexions, navigation et actions utilisateur
   */
  activity: {
    /**
     * Log d'information d'activité
     * @param {string} msg - Message à logger
     * @param {Object} [meta] - Métadonnées supplémentaires
     */
    info: (msg, meta) => activityLogger.info(msg, meta),

    /**
     * Log d'avertissement d'activité
     * @param {string} msg - Message d'avertissement
     * @param {Object} [meta] - Métadonnées supplémentaires
     */
    warn: (msg, meta) => activityLogger.warn(msg, meta),

    /**
     * Log d'erreur d'activité
     * @param {string} msg - Message d'erreur
     * @param {Object} [meta] - Métadonnées supplémentaires
     */
    error: (msg, meta) => activityLogger.error(msg, meta),

    /**
     * Log de débogage d'activité
     * @param {string} msg - Message de debug
     * @param {Object} [meta] - Métadonnées supplémentaires
     */
    debug: (msg, meta) => activityLogger.debug(msg, meta),
  },

  /**
   * Logger des modules IoT
   * @namespace Logger.modules
   * @description Logs des communications ESP32 et télémétrie
   */
  modules: {
    /**
     * Log d'information de module
     * @param {string} msg - Message à logger
     * @param {Object} [meta] - Métadonnées (moduleId, command, etc.)
     */
    info: (msg, meta) => modulesLogger.info(msg, meta),

    /**
     * Log d'avertissement de module
     * @param {string} msg - Message d'avertissement
     * @param {Object} [meta] - Métadonnées supplémentaires
     */
    warn: (msg, meta) => modulesLogger.warn(msg, meta),

    /**
     * Log d'erreur de module
     * @param {string} msg - Message d'erreur
     * @param {Object} [meta] - Métadonnées supplémentaires
     */
    error: (msg, meta) => modulesLogger.error(msg, meta),

    /**
     * Log de débogage de module
     * @param {string} msg - Message de debug
     * @param {Object} [meta] - Métadonnées supplémentaires
     */
    debug: (msg, meta) => modulesLogger.debug(msg, meta),
  },

  /**
   * Logger système et monitoring
   * @namespace Logger.system
   * @description Logs des statistiques et monitoring système
   */
  system: {
    /**
     * Log d'information système
     * @param {string} msg - Message à logger
     * @param {Object} [meta] - Métadonnées supplémentaires
     */
    info: (msg, meta) => systemLogger.info(msg, meta),

    /**
     * Log d'avertissement système
     * @param {string} msg - Message d'avertissement
     * @param {Object} [meta] - Métadonnées supplémentaires
     */
    warn: (msg, meta) => systemLogger.warn(msg, meta),

    /**
     * Log d'erreur système
     * @param {string} msg - Message d'erreur
     * @param {Object} [meta] - Métadonnées supplémentaires
     */
    error: (msg, meta) => systemLogger.error(msg, meta),

    /**
     * Log de débogage système
     * @param {string} msg - Message de debug
     * @param {Object} [meta] - Métadonnées supplémentaires
     */
    debug: (msg, meta) => systemLogger.debug(msg, meta),

    /**
     * Log des statistiques avec système anti-spam
     * @param {string} msg - Message de statistiques
     * @param {Object} stats - Statistiques actuelles pour comparaison
     * @description Ne log que si les statistiques ont changé depuis le dernier appel
     */
    statsIfChanged: (msg, stats) => {
      if (shouldLogSystemStats(stats)) {
        systemLogger.info(msg);
      }
    },
  },

  /**
   * Logger ESP32 dédié
   * @namespace Logger.esp
   * @description Logs spécifiques aux connexions WebSocket ESP32 natives
   */
  esp: {
    /**
     * Log d'information ESP32
     * @param {string} msg - Message à logger
     * @param {Object} [meta] - Métadonnées (socketId, moduleId, etc.)
     */
    info: (msg, meta) => espLogger.info(msg, meta),

    /**
     * Log d'avertissement ESP32
     * @param {string} msg - Message d'avertissement
     * @param {Object} [meta] - Métadonnées supplémentaires
     */
    warn: (msg, meta) => espLogger.warn(msg, meta),

    /**
     * Log d'erreur ESP32
     * @param {string} msg - Message d'erreur
     * @param {Object} [meta] - Métadonnées supplémentaires
     */
    error: (msg, meta) => espLogger.error(msg, meta),

    /**
     * Log de débogage ESP32
     * @param {string} msg - Message de debug
     * @param {Object} [meta] - Métadonnées supplémentaires
     */
    debug: (msg, meta) => espLogger.debug(msg, meta),
  },
};

/**
 * Export du logger principal
 * @module Logger
 * @description Système de journalisation centralisé pour l'application MicroCoaster
 *
 * @example
 * // Utilisation recommandée avec domaines spécifiques
 * const Logger = require('./utils/logger');
 *
 * Logger.app.info('Application démarrée');
 * Logger.activity.info('Utilisateur connecté', { userId: 123 });
 * Logger.modules.debug('Commande envoyée', { moduleId: 'MC-001', command: 'start' });
 * Logger.esp.warn('Connexion instable', { socketId: 'ws123' });
 * Logger.system.statsIfChanged('Stats mises à jour', { users: 5, modules: 3 });
 */
module.exports = logger;
