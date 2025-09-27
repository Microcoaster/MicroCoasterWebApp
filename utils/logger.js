const winston = require('winston');
const fs = require('fs');

// Créer le dossier logs s'il n'existe pas
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Logger avec console épurée et fichier détaillé
const logger = winston.createLogger({
  level: 'debug',
  transports: [
    // Console : format simple et épuré
    new winston.transports.Console({
      level: 'info', // Moins de verbosité en console
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => {
          // Simplifier les messages pour la console
          const cleanMessage =
            typeof message === 'string' ? message.replace(/\{.*?\}/g, '').trim() : String(message);
          return `${timestamp} ${level}: ${cleanMessage}`;
        })
      ),
    }),
    // Fichier : format complet avec tous les détails JSON
    new winston.transports.File({
      filename: 'logs/app.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
    }),
  ],
});

// Logger spécifique pour la télémétrie ESP (fichier séparé, pas de console)
const espLogger = winston.createLogger({
  level: 'debug',
  transports: [
    new winston.transports.File({
      filename: 'logs/esp-telemetry.log',
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    }),
  ],
});

// Ajouter la méthode esp au logger principal
logger.esp = (message, data = {}) => {
  espLogger.info(message, data);
};

module.exports = logger;
