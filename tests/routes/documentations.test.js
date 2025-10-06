/**
 * Tests pour les routes de documentation
 * @description Tests des routes d'affichage de la documentation
 */

// Mock de console pour éviter les messages d'erreur pendant les tests
global.console = {
  ...console,
  error: jest.fn(),
};

// Mock de databaseManager
jest.mock('../../bdd/DatabaseManager', () => ({
  users: {
    findById: jest.fn(),
  },
}));

// Mock du logger
jest.mock('../../utils/logger', () => ({
  activity: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock des routes d'auth pour requireAuth
jest.mock('../../routes/auth', () => ({
  requireAuth: jest.fn((req, res, next) => {
    if (req.session.user_id) {
      next();
    } else {
      res.status(401).json({ error: 'Not authenticated' });
    }
  }),
}));

const express = require('express');
const session = require('express-session');
const router = require('../../routes/documentations');

// Créer une app Express de test
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration des sessions pour les tests
app.use(
  session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

// Mock de l'internationalisation
app.use((req, res, next) => {
  req.t = jest.fn(key => key);
  next();
});

// Configuration des vues pour les tests
app.set('view engine', 'ejs');
app.set('views', 'views');

// Mock du rendu de templates
app.use((req, res, next) => {
  res.render = jest.fn((view, data) => {
    if (view === 'documentations') {
      res.type('text/html');
      res
        .status(data.error ? 500 : 200)
        .send(`<html>Documentations page${data.error ? ` - Error: ${data.error}` : ''}</html>`);
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

app.use('/documentations', router);

const request = require('supertest');
const databaseManager = require('../../bdd/DatabaseManager');

describe('Routes Documentations - Tests unitaires', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /documentations/', () => {
    test('doit retourner 401 si utilisateur non connecté', done => {
      request(app).get('/documentations/').expect(401).end(done);
    });

    test('doit rediriger vers logout si utilisateur non trouvé', done => {
      databaseManager.users.findById.mockResolvedValue(null);

      const agent = request.agent(app);

      app.use((req, res, next) => {
        if (req.headers['x-test-user-id']) {
          req.session.user_id = parseInt(req.headers['x-test-user-id']);
        }
        next();
      });

      agent
        .get('/documentations/')
        .set('x-test-user-id', '123')
        .expect(302)
        .expect('Location', '/logout')
        .end(done);
    });

    test('doit afficher la page de documentation', done => {
      const mockUser = { id: 123, name: 'Test User', email: 'test@example.com', is_admin: false };

      databaseManager.users.findById.mockResolvedValue(mockUser);

      const agent = request.agent(app);

      app.use((req, res, next) => {
        if (req.headers['x-test-user-id']) {
          req.session.user_id = parseInt(req.headers['x-test-user-id']);
        }
        next();
      });

      agent
        .get('/documentations/')
        .set('x-test-user-id', '123')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(databaseManager.users.findById).toHaveBeenCalledWith(123);

          // Vérifier que la réponse contient du HTML
          expect(res.type).toMatch(/html/);
          done();
        });
    });

    test('doit gérer les erreurs de base de données', done => {
      databaseManager.users.findById.mockRejectedValue(new Error('Database error'));

      const agent = request.agent(app);

      app.use((req, res, next) => {
        if (req.headers['x-test-user-id']) {
          req.session.user_id = parseInt(req.headers['x-test-user-id']);
        }
        next();
      });

      agent
        .get('/documentations/')
        .set('x-test-user-id', '123')
        .expect(500)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.type).toMatch(/html/);
          done();
        });
    });
  });
});
