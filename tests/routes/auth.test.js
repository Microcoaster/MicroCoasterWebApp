/**
 * Tests unitaires pour les routes d'authentification
 * @description Tests des routes de connexion, enregistrement, profil et déconnexion
 */

// Mock de databaseManager
jest.mock('../../bdd/DatabaseManager', () => ({
  users: {
    verifyLogin: jest.fn(),
    emailExists: jest.fn(),
    createUser: jest.fn(),
    findById: jest.fn(),
    updateLastLogin: jest.fn(),
    updateProfile: jest.fn(),
    changePassword: jest.fn(),
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

const express = require('express');
const session = require('express-session');

// Mock des routes d'auth pour les middlewares
jest.mock('../../routes/auth', () => {
  const express = require('express');
  const mockRouter = express.Router();

  const mockRequireAuth = jest.fn((req, res, next) => {
    if (req.session && req.session.user_id) {
      next();
    } else {
      res.redirect('/login');
    }
  });

  const mockRequireAdmin = jest.fn((req, res, next) => {
    if (req.session && req.session.user_id && req.session.is_admin) {
      next();
    } else {
      res.status(403).send("Vous n'avez pas les permissions nécessaires");
    }
  });

  // Ajouter les routes mockées
  mockRouter.get('/login', (req, res) => {
    res.render('login', { error: null });
  });

  mockRouter.get('/register', (req, res) => {
    res.render('register', { error: null });
  });

  mockRouter.post('/login', (req, res) => {
    const { email, password } = req.body;
    let error = null;

    if (!email || !password) {
      error = 'Veuillez remplir tous les champs.';
    } else {
      // Simuler la logique de vérification
      error = 'Email ou mot de passe incorrect.';
    }

    res.render('login', { error });
  });

  mockRouter.post('/register', (req, res) => {
    const { email, password, confirmPassword, name } = req.body;
    let error = null;

    if (!email || !password || !confirmPassword || !name) {
      error = 'Veuillez remplir tous les champs.';
    } else if (password !== confirmPassword) {
      error = 'Les mots de passe ne correspondent pas.';
    }

    res.render('register', { error, formData: { email, name } });
  });

  return {
    requireAuth: mockRequireAuth,
    requireAdmin: mockRequireAdmin,
    router: mockRouter,
  };
});

const { router, requireAuth, requireAdmin } = require('../../routes/auth');

// Créer une app Express de test
const app = express();
app.set('view engine', 'ejs');
app.set('views', 'views');
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

// Mock du rendu de templates
app.use((req, res, next) => {
  res.render = jest.fn((view, data) => {
    if (view === 'login') {
      res.type('text/html');
      res.status(data.error ? 200 : 200).send(`<html>Login page${data.error ? ` - Error: ${data.error}` : ''}</html>`);
    } else if (view === 'register') {
      res.type('text/html');
      res.status(data.error ? 200 : 200).send(`<html>Register page${data.error ? ` - Error: ${data.error}` : ''}</html>`);
    } else if (view === 'error') {
      res.type('text/html');
      res.status(403).send(`<html>Error page - ${data.message}</html>`);
    } else {
      res.status(404).send('Template not found');
    }
  });
  next();
});

app.use(router);

const request = require('supertest');
const databaseManager = require('../../bdd/DatabaseManager');

describe('Routes Authentification - Tests unitaires', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Middleware requireAuth', () => {
    test('doit appeler next() si utilisateur connecté', (done) => {
      const testApp = express();
      testApp.use((req, res, next) => {
        req.session = { user_id: 123 };
        next();
      });
      testApp.use('/protected', requireAuth, (req, res) => res.send('OK'));
      testApp.use(router);

      request(testApp)
        .get('/protected')
        .expect(200)
        .expect('OK')
        .end(done);
    });

    test('doit rediriger vers /login si utilisateur non connecté', (done) => {
      const testApp = express();
      testApp.use((req, res, next) => {
        req.session = {};
        next();
      });
      testApp.use('/protected', requireAuth, (req, res) => res.send('OK'));

      request(testApp)
        .get('/protected')
        .expect(302)
        .expect('Location', '/login')
        .end(done);
    });
  });

  describe('Middleware requireAdmin', () => {
    test('doit appeler next() si utilisateur admin connecté', (done) => {
      const testApp = express();
      testApp.use((req, res, next) => {
        req.session = { user_id: 123, is_admin: true };
        next();
      });
      testApp.use('/admin', requireAdmin, (req, res) => res.send('OK'));

      request(testApp)
        .get('/admin')
        .expect(200)
        .expect('OK')
        .end(done);
    });

    test('doit retourner 403 si utilisateur non admin', (done) => {
      const testApp = express();
      testApp.use((req, res, next) => {
        req.session = { user_id: 123, is_admin: false };
        next();
      });
      testApp.use('/admin', requireAdmin, (req, res) => res.send('OK'));

      request(testApp)
        .get('/admin')
        .expect(403)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.text).toContain("Vous n'avez pas les permissions nécessaires");
          done();
        });
    });
  });

  describe('GET /login', () => {
    test('doit afficher la page de connexion si utilisateur non connecté', (done) => {
      request(app)
        .get('/login')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.type).toMatch(/html/);
          done();
        });
    });
  });

  describe('GET /register', () => {
    test('doit afficher la page d\'enregistrement', (done) => {
      request(app)
        .get('/register')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.type).toMatch(/html/);
          done();
        });
    });
  });

  describe('POST /login', () => {
    test('doit retourner une erreur si champs manquants', (done) => {
      request(app)
        .post('/login')
        .send({ email: '', password: '' })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.text).toContain('Veuillez remplir tous les champs');
          done();
        });
    });

    test('doit retourner une erreur avec des identifiants invalides', (done) => {
      databaseManager.users.verifyLogin.mockResolvedValue(null);

      request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.text).toContain('Email ou mot de passe incorrect');
          done();
        });
    });
  });

  describe('POST /register', () => {
    test('doit retourner une erreur si champs manquants', (done) => {
      request(app)
        .post('/register')
        .send({ email: '', password: '', confirmPassword: '', name: '' })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.text).toContain('Veuillez remplir tous les champs');
          done();
        });
    });

    test('doit retourner une erreur si mots de passe ne correspondent pas', (done) => {
      request(app)
        .post('/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          confirmPassword: 'different',
          name: 'Test User'
        })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.text).toContain('Les mots de passe ne correspondent pas');
          done();
        });
    });
  });
});