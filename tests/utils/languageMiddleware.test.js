/**
 * Tests unitaires pour le middleware de langue
 * @description Tests de la détection de langue, traduction et gestion des cookies
 */

const {
  detectLanguage,
  languageMiddleware,
  switchLanguage,
  getLanguageInfo,
} = require('../../middleware/language');

// Mock du localeLoader
jest.mock('../../locales', () => ({
  isLanguageSupported: jest.fn(),
  getDefaultLanguage: jest.fn(),
  translate: jest.fn(),
  getLanguagesInfo: jest.fn(),
  getSupportedLanguages: jest.fn(),
}));

const localeLoader = require('../../locales');

describe('Language Middleware - Tests unitaires', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Configuration par défaut des mocks
    localeLoader.isLanguageSupported.mockReturnValue(true);
    localeLoader.getDefaultLanguage.mockReturnValue('en');
    localeLoader.translate.mockReturnValue('Translated text');
    localeLoader.getLanguagesInfo.mockReturnValue([{ code: 'en', name: 'English' }]);
    localeLoader.getSupportedLanguages.mockReturnValue(['en', 'fr']);
  });

  describe('detectLanguage', () => {
    test('doit détecter la langue depuis le cookie', () => {
      const req = {
        cookies: { language: 'fr' },
        get: jest.fn(),
      };

      const result = detectLanguage(req);
      expect(result).toBe('fr');
      expect(localeLoader.isLanguageSupported).toHaveBeenCalledWith('fr');
    });

    test("doit ignorer le cookie si la langue n'est pas supportée", () => {
      localeLoader.isLanguageSupported.mockReturnValueOnce(false).mockReturnValueOnce(true);

      const req = {
        cookies: { language: 'invalid' },
        get: jest.fn().mockReturnValue('en;q=0.9'),
      };

      const result = detectLanguage(req);
      expect(result).toBe('en');
    });

    test('doit détecter la langue depuis Accept-Language', () => {
      const req = {
        cookies: {},
        get: jest.fn().mockReturnValue('fr-FR;q=0.9,en;q=0.8'),
      };

      const result = detectLanguage(req);
      expect(result).toBe('fr');
    });

    test("doit utiliser la langue par défaut si aucune n'est détectée", () => {
      const req = {
        cookies: {},
        get: jest.fn().mockReturnValue(null),
      };

      const result = detectLanguage(req);
      expect(result).toBe('en');
      expect(localeLoader.getDefaultLanguage).toHaveBeenCalled();
    });

    test('doit gérer les langues avec pays dans Accept-Language', () => {
      const req = {
        cookies: {},
        get: jest.fn().mockReturnValue('fr-FR;q=0.9,en-US;q=0.8'),
      };

      const result = detectLanguage(req);
      expect(result).toBe('fr');
    });
  });

  describe('languageMiddleware', () => {
    test('doit configurer la langue et les helpers dans la requête et la réponse', () => {
      const req = {
        cookies: { language: 'fr' },
        get: jest.fn(),
      };
      const res = {
        locals: {},
        cookie: jest.fn(),
      };
      const next = jest.fn();

      languageMiddleware(req, res, next);

      expect(req.language).toBe('fr');
      expect(typeof req.t).toBe('function');
      expect(typeof req.switchLanguage).toBe('function');
      expect(res.locals.language).toBe('fr');
      expect(typeof res.locals.t).toBe('function');
      expect(typeof res.locals.isCurrentLanguage).toBe('function');
      expect(next).toHaveBeenCalled();
    });

    test('doit créer la fonction de traduction', () => {
      const req = { cookies: {}, get: jest.fn() };
      const res = { locals: {}, cookie: jest.fn() };
      const next = jest.fn();

      languageMiddleware(req, res, next);

      const translated = req.t('test.key', { param: 'value' });
      expect(localeLoader.translate).toHaveBeenCalledWith('en', 'test.key', { param: 'value' });
      expect(translated).toBe('Translated text');
    });

    test('doit vérifier si une langue est la langue actuelle', () => {
      const req = { cookies: { language: 'fr' }, get: jest.fn() };
      const res = { locals: {}, cookie: jest.fn() };
      const next = jest.fn();

      languageMiddleware(req, res, next);

      expect(res.locals.isCurrentLanguage('fr')).toBe(true);
      expect(res.locals.isCurrentLanguage('en')).toBe(false);
    });
  });

  describe('switchLanguage', () => {
    test('doit changer la langue et définir le cookie', () => {
      const req = {
        body: { lang: 'fr' },
        get: jest.fn().mockReturnValue('/dashboard'),
      };
      const res = {
        cookie: jest.fn(),
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      switchLanguage(req, res);

      expect(res.cookie).toHaveBeenCalledWith(
        'language',
        'fr',
        expect.objectContaining({
          maxAge: 365 * 24 * 60 * 60 * 1000,
          httpOnly: false,
          secure: false, // car NODE_ENV n'est pas 'production'
          sameSite: 'lax',
        })
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        language: 'fr',
        message: 'Language changed successfully',
      });
    });

    test('doit retourner une erreur pour une langue non supportée', () => {
      localeLoader.isLanguageSupported.mockReturnValue(false);

      const req = {
        body: { lang: 'invalid' },
        get: jest.fn().mockReturnValue('/dashboard'),
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      switchLanguage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Language not supported',
      });
    });

    test('doit gérer le mode production pour le cookie sécurisé', () => {
      process.env.NODE_ENV = 'production';

      const req = {
        body: { lang: 'fr' },
        get: jest.fn().mockReturnValue('/dashboard'),
      };
      const res = {
        cookie: jest.fn(),
        json: jest.fn(),
      };

      switchLanguage(req, res);

      expect(res.cookie).toHaveBeenCalledWith(
        'language',
        'fr',
        expect.objectContaining({
          secure: true,
        })
      );

      delete process.env.NODE_ENV; // Reset
    });
  });

  describe('getLanguageInfo', () => {
    test('doit retourner les informations de langue actuelles', () => {
      const req = { language: 'fr' };
      const res = { json: jest.fn() };

      getLanguageInfo(req, res);

      expect(res.json).toHaveBeenCalledWith({
        currentLanguage: 'fr',
        availableLanguages: [{ code: 'en', name: 'English' }],
        supportedLanguages: ['en', 'fr'],
      });
    });
  });
});
