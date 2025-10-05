/**
 * Tests unitaires pour les routes de gestion des modules
 * @description Tests des routes CRUD modules avec claim, inférence de types et APIs
 */

// Mock de databaseManager
jest.mock('../../bdd/DatabaseManager', () => ({
  users: {
    findById: jest.fn(),
  },
  modules: {
    findByUserId: jest.fn(),
  },
  execute: jest.fn(),
}));

// Mock du logger
jest.mock('../../utils/logger', () => ({
  app: {
    error: jest.fn(),
  },
  modules: {
    error: jest.fn(),
  },
  activity: {
    info: jest.fn(),
  },
}));

// Mock des routes d'auth pour requireAuth
jest.mock('../../routes/auth', () => ({
  requireAuth: jest.fn((req, res, next) => {
    if (req.session && req.session.user_id) {
      next();
    } else {
      res.redirect('/login');
    }
  }),
}));

const express = require('express');
const session = require('express-session');
const router = require('../../routes/modules');

// Créer une app Express de test
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration des sessions pour les tests
app.use(session({
  secret: 'test-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Middleware d'authentification pour les tests
app.use(global.testAuthMiddleware);

// Mock du realTimeAPI
app.locals.realTimeAPI = {
  emitModuleAdded: jest.fn(),
  emitModuleRemoved: jest.fn(),
  emitModuleUpdated: jest.fn(),
};

// Configuration des vues pour les tests
app.set('view engine', 'ejs');
app.set('views', 'views');

// Mock du rendu de templates EJS
app.use((req, res, next) => {
  res.render = jest.fn((view, data) => {
    res.type('text/html');
    res.status(200).send(`<html>Mocked ${view} page</html>`);
  });
  next();
});

app.use('/modules', router);

const request = require('supertest');
const databaseManager = require('../../bdd/DatabaseManager');
const Logger = require('../../utils/logger');
const { requireAuth } = require('../../routes/auth');

describe('Routes Modules - Tests unitaires', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /modules/', () => {
    test('doit retourner 401 si utilisateur non connecté', (done) => {
      request(app)
        .get('/modules/')
        .expect(302)
        .expect('Location', '/login')
        .end(done);
    });

    test('doit rediriger vers logout si utilisateur non trouvé', (done) => {
      databaseManager.users.findById.mockResolvedValue(null);

      request(app)
        .get('/modules/')
        .set('x-test-user-id', '123')
        .expect(302)
        .expect('Location', '/logout')
        .end(done);
    });

    test('doit afficher la page des modules avec inférence de types', (done) => {
      const mockUser = { id: 123, name: 'Test User', email: 'test@example.com' };
      const mockModules = [
        { id: 1, module_id: 'MC-0001-STN', name: 'Station 1', type: null },
        { id: 2, module_id: 'MC-0002-ST', name: 'Switch Track', type: null },
        { id: 3, module_id: 'MC-0003-UNK', name: 'Unknown Module', type: null },
      ];

      databaseManager.users.findById.mockResolvedValue(mockUser);
      databaseManager.modules.findByUserId.mockResolvedValue(mockModules);

      request(app)
        .get('/modules/')
        .set('x-test-user-id', '123')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(databaseManager.users.findById).toHaveBeenCalledWith(123);
          expect(databaseManager.modules.findByUserId).toHaveBeenCalledWith(123);

          // Vérifier que la réponse contient du HTML
          expect(res.type).toMatch(/html/);
          done();
        });
    });

    test('doit gérer les erreurs de base de données', (done) => {
      databaseManager.users.findById.mockRejectedValue(new Error('Database error'));

      request(app)
        .get('/modules/')
        .set('x-test-user-id', '123')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(Logger.app.error).toHaveBeenCalled();
          expect(res.type).toMatch(/html/);
          done();
        });
    });
  });

  describe('GET /modules/api', () => {
    test('doit retourner 401 si utilisateur non connecté', (done) => {
      request(app)
        .get('/modules/api')
        .expect(302)
        .expect('Location', '/login')
        .end(done);
    });

    test('doit retourner les modules au format JSON avec inférence de types', (done) => {
      const mockModules = [
        { id: 1, module_id: 'MC-0001-STN', name: 'Station 1', type: null },
        { id: 2, module_id: 'MC-0002-ST', name: 'Switch Track', type: null },
      ];

      databaseManager.modules.findByUserId.mockResolvedValue(mockModules);

      request(app)
        .get('/modules/api')
        .set('x-test-user-id', '123')
        .expect(200)
        .expect('Content-Type', /json/)
        .end((err, res) => {
          if (err) return done(err);

          expect(databaseManager.modules.findByUserId).toHaveBeenCalledWith(123);
          expect(res.body.success).toBe(true);
          expect(res.body.modules).toHaveLength(2);
          done();
        });
    });

    test('doit gérer les erreurs de base de données dans l\'API', (done) => {
      databaseManager.modules.findByUserId.mockRejectedValue(new Error('Database error'));

      request(app)
        .get('/modules/api')
        .set('x-test-user-id', '123')
        .expect(500)
        .expect('Content-Type', /json/)
        .end((err, res) => {
          if (err) return done(err);
          expect(Logger.modules.error).toHaveBeenCalled();
          expect(res.body.success).toBe(false);
          expect(res.body.error).toBe('Database error');
          done();
        });
    });
  });

  describe('POST /modules/claim', () => {
    test('doit retourner 401 si utilisateur non connecté', (done) => {
      request(app)
        .post('/modules/claim')
        .expect(302)
        .expect('Location', '/login')
        .end(done);
    });

    test('doit retourner une erreur si module_id manquant', (done) => {
      request(app)
        .post('/modules/claim')
        .set('x-test-user-id', '123')
        .send({ module_code: 'ABCD-1234', name: 'Test Module' })
        .expect(302)
        .expect('Location', /\/modules\?flash=/)
        .end(done);
    });

    test('doit retourner une erreur si module_code manquant', (done) => {
      request(app)
        .post('/modules/claim')
        .set('x-test-user-id', '123')
        .send({ module_id: 'MC-0001-STN', name: 'Test Module' })
        .expect(302)
        .expect('Location', /\/modules\?flash=/)
        .end(done);
    });

    test('doit réussir à claimer un module avec des données valides', (done) => {
      databaseManager.execute
        .mockResolvedValueOnce([[{ id: 1, user_id: null, claimed: 0, module_code: 'ABCD-1234' }]]) // Vérification
        .mockResolvedValueOnce(); // Update

      request(app)
        .post('/modules/claim')
        .set('x-test-user-id', '123')
        .send({ module_id: 'MC-0001-STN', module_code: 'ABCD-1234', name: 'Test Module' })
        .expect(302)
        .expect('Location', /\/modules\?flash=.*Module%20added%20successfully/)
        .end((err, res) => {
          if (err) return done(err);
          expect(Logger.activity.info).toHaveBeenCalledWith('✅ Module claimed: MC-0001-STN (Station) by user 123');
          done();
        });
    });
  });

  describe('POST /modules/add', () => {
    test('doit retourner 401 si utilisateur non connecté', (done) => {
      request(app)
        .post('/modules/add')
        .expect(302)
        .expect('Location', '/login')
        .end(done);
    });

    test('doit réussir à ajouter un module', (done) => {
      databaseManager.execute.mockResolvedValue();

      request(app)
        .post('/modules/add')
        .set('x-test-user-id', '123')
        .send({ module_id: 'MC-0002-ST', name: 'Switch Track' })
        .expect(302)
        .expect('Location', /\/modules\?flash=.*Module%20added%20successfully/)
        .end((err, res) => {
          if (err) return done(err);
          expect(Logger.activity.info).toHaveBeenCalledWith('➕ Module added: MC-0002-ST (Switch Track) by user 123');
          done();
        });
    });
  });

  describe('POST /modules/delete/:moduleId', () => {
    test('doit retourner 401 si utilisateur non connecté', (done) => {
      request(app)
        .post('/modules/delete/MC-0001-STN')
        .expect(302)
        .expect('Location', '/login')
        .end(done);
    });

    test('doit réussir à supprimer (unclaim) un module', (done) => {
      databaseManager.execute
        .mockResolvedValueOnce([{ id: 1, module_id: 'MC-0001-STN', user_id: 123 }]) // Vérification
        .mockResolvedValueOnce(); // Update

      request(app)
        .post('/modules/delete/MC-0001-STN')
        .set('x-test-user-id', '123')
        .expect(200)
        .expect('Content-Type', /json/)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          expect(res.body.message).toBe('Module deleted successfully');
          expect(Logger.activity.info).toHaveBeenCalledWith('🗑️ Module unclaimed: MC-0001-STN by user 123');
          done();
        });
    });
  });

  describe('POST /modules/update/:moduleId', () => {
    test('doit retourner 401 si utilisateur non connecté', (done) => {
      request(app)
        .post('/modules/update/MC-0001-STN')
        .expect(302)
        .expect('Location', '/login')
        .end(done);
    });

    test('doit réussir à mettre à jour un module', (done) => {
      databaseManager.execute
        .mockResolvedValueOnce([{ id: 1, module_id: 'MC-0001-STN', user_id: 123 }]) // Vérification
        .mockResolvedValueOnce(); // Update

      request(app)
        .post('/modules/update/MC-0001-STN')
        .set('x-test-user-id', '123')
        .send({ name: 'Updated Station', type: 'Station' })
        .expect(200)
        .expect('Content-Type', /json/)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          expect(res.body.message).toBe('Module updated successfully');
          expect(Logger.activity.info).toHaveBeenCalledWith('📝 Module updated: MC-0001-STN by user 123');
          done();
        });
    });
  });
});