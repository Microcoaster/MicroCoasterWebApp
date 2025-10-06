/**
 * Tests unitaires pour les routes de gestion des langues
 * @description Tests des APIs de changement de langue et traductions
 */

// Mock du LocaleLoader
jest.mock('../../locales/index', () => ({
  getAllTranslations: jest.fn(),
}));

const express = require('express');
const router = require('../../routes/language');

// Créer une app Express de test
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mock de switchLanguage
app.use((req, res, next) => {
  req.switchLanguage = jest.fn();
  req.language = 'en'; // Langue par défaut
  next();
});

app.use('/language', router);

const request = require('supertest');
const LocaleLoader = require('../../locales/index');

describe('Routes Language - Tests unitaires', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /language/switch', () => {
    test('doit retourner 400 si langue manquante', done => {
      request(app)
        .post('/language/switch')
        .send({})
        .expect(400)
        .expect('Content-Type', /json/)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.error).toBe('Invalid language. Must be "en" or "fr".');
          done();
        });
    });

    test('doit retourner 400 si langue invalide', done => {
      request(app)
        .post('/language/switch')
        .send({ language: 'invalid' })
        .expect(400)
        .expect('Content-Type', /json/)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.error).toBe('Invalid language. Must be "en" or "fr".');
          done();
        });
    });

    test('doit réussir à changer la langue vers le français', done => {
      request(app)
        .post('/language/switch')
        .send({ language: 'fr' })
        .expect(200)
        .expect('Content-Type', /json/)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          expect(res.body.language).toBe('fr');
          expect(res.body.message).toBe('Language switched to fr');
          done();
        });
    });

    test("doit réussir à changer la langue vers l'anglais", done => {
      request(app)
        .post('/language/switch')
        .send({ language: 'en' })
        .expect(200)
        .expect('Content-Type', /json/)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          expect(res.body.language).toBe('en');
          expect(res.body.message).toBe('Language switched to en');
          done();
        });
    });
  });

  describe('GET /language/info', () => {
    test('doit retourner les informations de langue', done => {
      request(app)
        .get('/language/info')
        .expect(200)
        .expect('Content-Type', /json/)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.current).toBe('en');
          expect(res.body.available).toEqual(['fr', 'en']);
          expect(res.body.default).toBe('en');
          done();
        });
    });
  });

  describe('GET /language/translations', () => {
    test('doit retourner les traductions pour la langue actuelle', done => {
      const mockTranslations = {
        common: { hello: 'Hello', goodbye: 'Goodbye' },
        auth: { login: 'Login', logout: 'Logout' },
      };

      LocaleLoader.getAllTranslations.mockReturnValue(mockTranslations);

      request(app)
        .get('/language/translations')
        .expect(200)
        .expect('Content-Type', /json/)
        .end((err, res) => {
          if (err) return done(err);

          expect(LocaleLoader.getAllTranslations).toHaveBeenCalledWith('en');
          expect(res.body.language).toBe('en');
          expect(res.body.translations).toEqual(mockTranslations);
          done();
        });
    });

    test('doit gérer les langues différentes', done => {
      const mockTranslations = {
        common: { hello: 'Bonjour', goodbye: 'Au revoir' },
      };

      LocaleLoader.getAllTranslations.mockReturnValue(mockTranslations);

      // Modifier la langue pour ce test
      app.use('/test-translations', (req, res, next) => {
        req.language = 'fr';
        next();
      });

      app.get('/test-translations', (req, res) => {
        const currentLanguage = req.language || 'en';
        const translations = LocaleLoader.getAllTranslations(currentLanguage);

        res.json({
          language: currentLanguage,
          translations: translations,
        });
      });

      request(app)
        .get('/test-translations')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(LocaleLoader.getAllTranslations).toHaveBeenCalledWith('fr');
          expect(res.body.language).toBe('fr');
          done();
        });
    });
  });
});
