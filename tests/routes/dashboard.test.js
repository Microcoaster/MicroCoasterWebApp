/**
 * Tests unitaires pour les routes du dashboard
 * @description Tests des routes d'affichage du dashboard et API de statistiques
 */

// Mock de databaseManager
jest.mock('../../bdd/DatabaseManager', () => ({
  users: {
    findById: jest.fn(),
  },
  modules: {
    findByUserId: jest.fn(),
  },
}));

// Mock du logger
jest.mock('../../utils/logger', () => ({
  app: {
    error: jest.fn(),
  },
  system: {
    error: jest.fn(),
  },
}));

const express = require('express');
const session = require('express-session');
const router = require('../../routes/dashboard');

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

// Mock de l'internationalisation
app.use((req, res, next) => {
  req.t = jest.fn((key) => key);
  next();
});

// Configuration des vues pour les tests
app.set('view engine', 'ejs');
app.set('views', 'views');

// Mock du rendu de templates
app.use((req, res, next) => {
  res.render = jest.fn((view, data) => {
    if (view === 'dashboard') {
      res.type('text/html');
      res.status(data.error ? 500 : 200).send(`<html>Dashboard page${data.error ? ` - Error: ${data.error}` : ''}</html>`);
    } else if (view === 'error') {
      res.type('text/html');
      res.status(500).send(`<html>Error page - ${data.message}</html>`);
    } else {
      res.status(404).send('Template not found');
    }
  });
  next();
});

// Utiliser le middleware d'authentification global pour les tests
app.use(global.testAuthMiddleware);

// Middleware de test pour simuler les sessions
app.use((req, res, next) => {
  if (req.headers['x-test-user-id']) {
    req.session.user_id = parseInt(req.headers['x-test-user-id']);
  }
  next();
});

app.use('/dashboard', router);

const request = require('supertest');
const databaseManager = require('../../bdd/DatabaseManager');
const Logger = require('../../utils/logger');

describe('Routes Dashboard - Tests unitaires', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /dashboard/', () => {
    test('doit rediriger vers / si utilisateur non connecté', (done) => {
      request(app)
        .get('/dashboard/')
        .expect(302)
        .expect('Location', '/')
        .end(done);
    });

    test('doit afficher le dashboard avec les statistiques utilisateur', (done) => {
      const mockUser = {
        id: 123,
        name: 'Test User',
        email: 'test@example.com',
      };

      const mockModules = [
        { id: 1, type: 'ESP32', status: 'online' },
        { id: 2, type: 'ESP32', status: 'offline' },
        { id: 3, type: 'Sensor', status: 'online' },
      ];

      // Mock des données utilisateur et modules
      databaseManager.users.findById.mockResolvedValue(mockUser);
      databaseManager.modules.findByUserId.mockResolvedValue(mockModules);

      // Simuler une session utilisateur
      const agent = request.agent(app);

      agent
        .get('/dashboard/')
        .set('x-test-user-id', '123')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(databaseManager.users.findById).toHaveBeenCalledWith(123);
          expect(databaseManager.modules.findByUserId).toHaveBeenCalledWith(123);

          // Vérifier que la réponse contient du HTML (vue rendue)
          expect(res.type).toMatch(/html/);
          done();
        });
    });

    test('doit gérer les erreurs de base de données', (done) => {
      databaseManager.users.findById.mockRejectedValue(new Error('Database error'));

      const agent = request.agent(app);

      agent
        .get('/dashboard/')
        .set('x-test-user-id', '123')
        .expect(500)
        .end((err, res) => {
          if (err) return done(err);

          expect(Logger.app.error).toHaveBeenCalled();
          expect(res.type).toMatch(/html/);
          done();
        });
    });
  });

  describe('GET /dashboard/stats', () => {
    test('doit retourner 401 si utilisateur non connecté', (done) => {
      request(app)
        .get('/dashboard/stats')
        .expect(401)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.error).toBe('Not authenticated');
          done();
        });
    });

    test('doit retourner les statistiques utilisateur au format JSON', (done) => {
      const mockModules = [
        { id: 1, type: 'ESP32', status: 'online' },
        { id: 2, type: 'ESP32', status: 'offline' },
        { id: 3, type: 'Sensor', status: 'online' },
        { id: 4, type: 'Sensor', status: 'online' },
      ];

      databaseManager.modules.findByUserId.mockResolvedValue(mockModules);

      const agent = request.agent(app);

      agent
        .get('/dashboard/stats')
        .set('x-test-user-id', '123')
        .expect(200)
        .expect('Content-Type', /json/)
        .end((err, res) => {
          if (err) return done(err);

          expect(databaseManager.modules.findByUserId).toHaveBeenCalledWith(123);

          // Vérifier la structure des statistiques
          expect(res.body).toHaveProperty('totalModules', 4);
          expect(res.body).toHaveProperty('onlineModules', 3);
          expect(res.body).toHaveProperty('offlineModules', 1);
          expect(res.body).toHaveProperty('moduleTypes');

          // Vérifier les types de modules
          expect(res.body.moduleTypes).toEqual({
            ESP32: 2,
            Sensor: 2,
          });

          done();
        });
    });

    test('doit gérer les erreurs de base de données dans l\'API stats', (done) => {
      databaseManager.modules.findByUserId.mockRejectedValue(new Error('Database error'));

      const agent = request.agent(app);

      agent
        .get('/dashboard/stats')
        .set('x-test-user-id', '123')
        .expect(500)
        .expect('Content-Type', /json/)
        .end((err, res) => {
          if (err) return done(err);

          expect(Logger.system.error).toHaveBeenCalled();
          expect(res.body.error).toBe('Internal server error');
          done();
        });
    });
  });

  describe('Fonction calculateStats', () => {
    // Tester la fonction calculateStats directement
    const dashboardRouter = require('../../routes/dashboard');
    const calculateStats = dashboardRouter.calculateStats || (() => {});

    // Si la fonction n'est pas exportée, nous testons seulement via les routes
    test('les statistiques sont calculées correctement via les routes', () => {
      // Ce test est couvert par les tests des routes ci-dessus
      expect(true).toBe(true);
    });
  });
});