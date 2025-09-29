const winston = require('winston');
const fs = require('fs');

// Créer le dossier logs s'il n'existe pas
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Format de base pour tous les fichiers
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
// LOGGERS SPÉCIALISÉS
// ============================================================================

// App Logger - Démarrage, arrêt, erreurs critiques
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

// Activity Logger - Connexions, navigation, actions utilisateur
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

// Modules Logger - ESP, communications, télémétrie (pas de console)
const modulesLogger = winston.createLogger({
  level: 'debug',
  transports: [
    new winston.transports.File({
      filename: 'logs/modules.log',
      format: fileFormat,
    }),
  ],
});

// System Logger - Stats (avec anti-spam), nettoyage, monitoring
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
// ANTI-SPAM POUR LOGS SYSTÈME
// ============================================================================

let lastSystemStats = null;

function shouldLogSystemStats(currentStats) {
  if (!lastSystemStats) {
    lastSystemStats = currentStats;
    return true;
  }

  // Vérifier si les stats ont changé
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

const logger = {
  // Méthodes spécialisées par domaine
  app: {
    info: (msg, meta) => appLogger.info(msg, meta),
    warn: (msg, meta) => appLogger.warn(msg, meta),
    error: (msg, meta) => appLogger.error(msg, meta),
    debug: (msg, meta) => appLogger.debug(msg, meta),
  },

  activity: {
    info: (msg, meta) => activityLogger.info(msg, meta),
    warn: (msg, meta) => activityLogger.warn(msg, meta),
    error: (msg, meta) => activityLogger.error(msg, meta),
    debug: (msg, meta) => activityLogger.debug(msg, meta),
  },

  modules: {
    info: (msg, meta) => modulesLogger.info(msg, meta),
    warn: (msg, meta) => modulesLogger.warn(msg, meta),
    error: (msg, meta) => modulesLogger.error(msg, meta),
    debug: (msg, meta) => modulesLogger.debug(msg, meta),
  },

  system: {
    info: (msg, meta) => systemLogger.info(msg, meta),
    warn: (msg, meta) => systemLogger.warn(msg, meta),
    error: (msg, meta) => systemLogger.error(msg, meta),
    debug: (msg, meta) => systemLogger.debug(msg, meta),
    // Méthode spéciale anti-spam pour les stats
    statsIfChanged: (msg, stats) => {
      if (shouldLogSystemStats(stats)) {
        systemLogger.info(msg);
      }
    },
  },

  // Rétrocompatibilité (déprécié - utilisera app par défaut)
  info: (msg, meta) => {
    console.warn('⚠️ Logger.info déprécié - utilisez Logger.app.info, Logger.activity.info, etc.');
    appLogger.info(msg, meta);
  },
  warn: (msg, meta) => {
    console.warn('⚠️ Logger.warn déprécié - utilisez Logger.app.warn, Logger.activity.warn, etc.');
    appLogger.warn(msg, meta);
  },
  error: (msg, meta) => {
    console.warn(
      '⚠️ Logger.error déprécié - utilisez Logger.app.error, Logger.activity.error, etc.'
    );
    appLogger.error(msg, meta);
  },
  debug: (msg, meta) => {
    console.warn(
      '⚠️ Logger.debug déprécié - utilisez Logger.app.debug, Logger.activity.debug, etc.'
    );
    appLogger.debug(msg, meta);
  },

  // Alias pour ESP (rétrocompatibilité)
  esp: (msg, meta) => modulesLogger.info(msg, meta),
};

module.exports = logger;
