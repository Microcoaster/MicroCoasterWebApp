/**
 * Configuration globale pour les tests Jest
 * @description Setup des mocks et environnement de test
 */

// Mock de winston pour éviter les logs réels pendant les tests
jest.mock('winston', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  return {
    createLogger: jest.fn(() => mockLogger),
    transports: {
      Console: jest.fn(),
      File: jest.fn(),
    },
    format: {
      combine: jest.fn(),
      timestamp: jest.fn(),
      errors: jest.fn(),
      json: jest.fn(),
      printf: jest.fn(),
    },
  };
});

// Mock de fs pour éviter les opérations sur le système de fichiers
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
}));

// Mock de mysql2 pour éviter les connexions réelles à la base de données
jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(() => ({
    execute: jest.fn(),
    end: jest.fn(),
  })),
}));

// Mock de bcrypt pour éviter le hachage réel des mots de passe
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

// Variables d'environnement pour les tests
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'testdb';
process.env.DB_CHARSET = 'utf8mb4';
process.env.DB_CONNECTION_TIMEOUT = '60000';
process.env.DB_CONNECTION_LIMIT = '10';

// Middleware global pour transformer les headers de test en sessions
global.testAuthMiddleware = (req, res, next) => {
  // Transformer x-test-user-id en session utilisateur
  if (req.headers['x-test-user-id']) {
    req.session = req.session || {};
    req.session.user_id = parseInt(req.headers['x-test-user-id']);
    req.session.email = 'test@example.com';
    req.session.nickname = 'Test User';
    req.session.is_admin = false;
  }

  // Transformer x-test-admin en session admin
  if (req.headers['x-test-admin']) {
    req.session = req.session || {};
    req.session.user_id = 999;
    req.session.email = 'admin@example.com';
    req.session.nickname = 'Admin User';
    req.session.is_admin = true;
  }

  // Si aucun header d'authentification n'est présent, s'assurer que la session est vide
  if (!req.headers['x-test-user-id'] && !req.headers['x-test-admin']) {
    req.session = req.session || {};
    // Ne pas définir user_id pour simuler un utilisateur non connecté
  }

  next();
};
