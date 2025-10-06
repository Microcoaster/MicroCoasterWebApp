/**
 * Tests pour le système de localisation
 *
 * Tests unitaires pour le chargeur de langues et le middleware de langue
 * qui gèrent l'internationalisation de l'application.
 */

// Mocks globaux pour éviter l'initialisation automatique
jest.mock('fs', () => ({
  readFileSync: jest.fn(() => '{}'), // Retourne un JSON vide par défaut
}));

jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
}));

const LocaleLoader = require('../../locales/index.js');
const {
  languageMiddleware,
  switchLanguage,
  getLanguageInfo,
  detectLanguage,
} = require('../../middleware/language');

describe('LocaleLoader', () => {
  let mockFs;
  let mockPath;

  beforeEach(() => {
    jest.clearAllMocks();

    // Récupérer les mocks
    mockFs = require('fs');
    mockPath = require('path');

    // Reset le singleton pour chaque test
    LocaleLoader.languages.clear();
    // Ne pas appeler loadAllLanguages() automatiquement
  });

  describe('Initialisation', () => {
    test('devrait initialiser avec les langues supportées', () => {
      expect(LocaleLoader.supportedLanguages).toEqual(['fr', 'en']);
      expect(LocaleLoader.defaultLanguage).toBe('en');
    });

    test('devrait gérer les erreurs de chargement de fichiers', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Configurer les mocks pour retourner des erreurs
      mockPath.join.mockReturnValueOnce('/path/to/fr.json').mockReturnValueOnce('/path/to/en.json');

      mockFs.readFileSync
        .mockImplementationOnce(() => {
          throw new Error('File not found');
        })
        .mockReturnValueOnce(JSON.stringify({ common: { hello: 'Hello' } }));

      LocaleLoader.loadAllLanguages();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[LocaleLoader] Error loading language fr:',
        'File not found'
      );
      expect(LocaleLoader.languages.has('fr')).toBe(false);
      expect(LocaleLoader.languages.has('en')).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('Traduction', () => {
    beforeEach(() => {
      // Setup mock data
      LocaleLoader.languages.set('fr', {
        common: {
          hello: 'Bonjour',
          goodbye: 'Au revoir {{name}}',
        },
        navbar: {
          dashboard: 'Tableau de bord',
        },
      });

      LocaleLoader.languages.set('en', {
        common: {
          hello: 'Hello',
          goodbye: 'Goodbye {{name}}',
        },
        navbar: {
          dashboard: 'Dashboard',
        },
      });
    });

    test('devrait traduire une clé simple', () => {
      const result = LocaleLoader.translate('fr', 'common.hello');
      expect(result).toBe('Bonjour');
    });

    test("devrait traduire avec paramètres d'interpolation", () => {
      const result = LocaleLoader.translate('fr', 'common.goodbye', { name: 'Alice' });
      expect(result).toBe('Au revoir Alice');
    });

    test('devrait utiliser la langue par défaut pour une langue non supportée', () => {
      const result = LocaleLoader.translate('es', 'common.hello');
      expect(result).toBe('Hello');
    });

    test("devrait utiliser le fallback vers la langue par défaut si la clé n'existe pas", () => {
      const result = LocaleLoader.translate('fr', 'nonexistent.key');
      expect(result).toBe('nonexistent.key');
    });

    test("devrait utiliser le fallback vers la langue par défaut si la traduction n'existe pas dans la langue demandée", () => {
      LocaleLoader.languages.set('fr', {
        common: { hello: 'Bonjour' },
      });

      const result = LocaleLoader.translate('fr', 'navbar.dashboard');
      expect(result).toBe('Dashboard');
    });

    test("devrait retourner la clé si aucune traduction n'est trouvée", () => {
      const result = LocaleLoader.translate('fr', 'completely.unknown.key');
      expect(result).toBe('completely.unknown.key');
    });
  });

  describe('Navigation dans les objets imbriqués', () => {
    test('devrait obtenir une valeur imbriquée', () => {
      const obj = {
        level1: {
          level2: {
            value: 'test',
          },
        },
      };

      const result = LocaleLoader.getNestedValue(obj, 'level1.level2.value');
      expect(result).toBe('test');
    });

    test('devrait retourner undefined pour un chemin inexistant', () => {
      const obj = { level1: {} };
      const result = LocaleLoader.getNestedValue(obj, 'level1.level2.value');
      expect(result).toBeUndefined();
    });
  });

  describe('Interpolation', () => {
    test('devrait interpoler les variables dans le template', () => {
      const template = 'Hello {{name}}, you have {{count}} messages';
      const params = { name: 'Alice', count: 5 };

      const result = LocaleLoader.interpolate(template, params);
      expect(result).toBe('Hello Alice, you have 5 messages');
    });

    test('devrait laisser les placeholders non remplacés', () => {
      const template = 'Hello {{name}}, you have {{count}} messages';
      const params = { name: 'Alice' };

      const result = LocaleLoader.interpolate(template, params);
      expect(result).toBe('Hello Alice, you have {{count}} messages');
    });

    test("devrait retourner la valeur originale si ce n'est pas une chaîne", () => {
      const result = LocaleLoader.interpolate(123, {});
      expect(result).toBe(123);
    });
  });

  describe('Support des langues', () => {
    test('devrait vérifier si une langue est supportée', () => {
      expect(LocaleLoader.isLanguageSupported('fr')).toBe(true);
      expect(LocaleLoader.isLanguageSupported('en')).toBe(true);
      expect(LocaleLoader.isLanguageSupported('es')).toBe(false);
    });

    test('devrait retourner toutes les langues supportées', () => {
      const result = LocaleLoader.getSupportedLanguages();
      expect(result).toEqual(['fr', 'en']);
    });

    test('devrait retourner les informations des langues', () => {
      const result = LocaleLoader.getLanguagesInfo();
      expect(result).toEqual([
        { code: 'fr', name: 'Français', flag: '🇫🇷' },
        { code: 'en', name: 'English', flag: '🇺🇸' },
      ]);
    });

    test('devrait retourner la langue par défaut', () => {
      expect(LocaleLoader.getDefaultLanguage()).toBe('en');
    });
  });

  describe('Gestion des traductions complètes', () => {
    beforeEach(() => {
      LocaleLoader.languages.set('fr', { common: { hello: 'Bonjour' } });
      LocaleLoader.languages.set('en', { common: { hello: 'Hello' } });
    });

    test('devrait retourner toutes les traductions pour une langue', () => {
      const result = LocaleLoader.getAllTranslations('fr');
      expect(result).toEqual({ common: { hello: 'Bonjour' } });
    });

    test('devrait utiliser la langue par défaut pour une langue non supportée', () => {
      const result = LocaleLoader.getAllTranslations('es');
      expect(result).toEqual({ common: { hello: 'Hello' } });
    });

    test("devrait retourner un objet vide si la langue par défaut n'existe pas", () => {
      LocaleLoader.languages.clear();
      const result = LocaleLoader.getAllTranslations('fr');
      expect(result).toEqual({});
    });
  });

  describe('Rechargement', () => {
    test('devrait recharger toutes les langues', () => {
      LocaleLoader.languages.set('fr', { old: 'data' });

      const mockData = { common: { hello: 'Bonjour' } };
      mockPath.join.mockReturnValueOnce('/path/to/fr.json').mockReturnValueOnce('/path/to/en.json');
      mockFs.readFileSync
        .mockReturnValueOnce(JSON.stringify(mockData))
        .mockReturnValueOnce(JSON.stringify(mockData));

      LocaleLoader.reload();

      expect(LocaleLoader.languages.get('fr')).toEqual(mockData);
      expect(LocaleLoader.languages.get('en')).toEqual(mockData);
    });
  });
});

describe('Language Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      cookies: {},
      get: jest.fn(),
      language: null,
      t: null,
    };

    mockRes = {
      locals: {},
      cookie: jest.fn(),
      json: jest.fn(),
      status: jest.fn(() => mockRes),
    };

    mockNext = jest.fn();
  });

  describe('Détection de langue', () => {
    test('devrait détecter la langue depuis le cookie', () => {
      mockReq.cookies.language = 'fr';

      const result = detectLanguage(mockReq);
      expect(result).toBe('fr');
    });

    test('devrait ignorer un cookie avec une langue non supportée', () => {
      mockReq.cookies.language = 'es';

      const result = detectLanguage(mockReq);
      expect(result).toBe('en'); // langue par défaut
    });

    test("devrait détecter la langue depuis l'en-tête Accept-Language", () => {
      mockReq.get.mockReturnValue('fr-FR, en-US;q=0.9');

      const result = detectLanguage(mockReq);
      expect(result).toBe('fr');
    });

    test('devrait utiliser la première langue supportée dans Accept-Language', () => {
      mockReq.get.mockReturnValue('es-ES, fr-FR;q=0.9, en-US;q=0.8');

      const result = detectLanguage(mockReq);
      expect(result).toBe('fr');
    });

    test("devrait utiliser la langue par défaut si aucune n'est supportée", () => {
      mockReq.get.mockReturnValue('es-ES, de-DE');

      const result = detectLanguage(mockReq);
      expect(result).toBe('en');
    });

    test("devrait utiliser la langue par défaut si pas de cookie ni d'en-tête", () => {
      const result = detectLanguage(mockReq);
      expect(result).toBe('en');
    });
  });

  describe('Middleware de langue', () => {
    test('devrait configurer les propriétés de langue dans la requête et la réponse', () => {
      mockReq.cookies.language = 'fr';

      languageMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.language).toBe('fr');
      expect(typeof mockReq.t).toBe('function');
      expect(mockRes.locals.language).toBe('fr');
      expect(typeof mockRes.locals.t).toBe('function');
      expect(mockRes.locals.availableLanguages).toEqual([
        { code: 'fr', name: 'Français', flag: '🇫🇷' },
        { code: 'en', name: 'English', flag: '🇺🇸' },
      ]);
      expect(typeof mockRes.locals.isCurrentLanguage).toBe('function');
      expect(typeof mockReq.switchLanguage).toBe('function');
      expect(mockNext).toHaveBeenCalled();
    });

    test("devrait utiliser la langue par défaut si aucune n'est détectée", () => {
      languageMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.language).toBe('en');
      expect(mockRes.locals.language).toBe('en');
    });

    test('devrait permettre de changer de langue via switchLanguage', () => {
      languageMiddleware(mockReq, mockRes, mockNext);

      const result = mockReq.switchLanguage('fr');

      expect(result).toBe(true);
      expect(mockRes.cookie).toHaveBeenCalledWith('language', 'fr', {
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: false,
        secure: false,
        sameSite: 'lax',
      });
    });

    test('devrait refuser de changer vers une langue non supportée', () => {
      languageMiddleware(mockReq, mockRes, mockNext);

      const result = mockReq.switchLanguage('es');

      expect(result).toBe(false);
      expect(mockRes.cookie).not.toHaveBeenCalled();
    });

    test('devrait vérifier si une langue est la langue actuelle', () => {
      mockReq.cookies.language = 'fr';
      languageMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.locals.isCurrentLanguage('fr')).toBe(true);
      expect(mockRes.locals.isCurrentLanguage('en')).toBe(false);
    });
  });

  describe('Fonction de traduction', () => {
    beforeEach(() => {
      // Setup mock data
      LocaleLoader.languages.set('fr', {
        common: { hello: 'Bonjour {{name}}' },
      });
      LocaleLoader.languages.set('en', {
        common: { hello: 'Hello {{name}}' },
      });
    });

    test('devrait traduire avec la langue actuelle', () => {
      mockReq.cookies.language = 'fr';
      languageMiddleware(mockReq, mockRes, mockNext);

      const result = mockReq.t('common.hello', { name: 'Alice' });
      expect(result).toBe('Bonjour Alice');
    });

    test('devrait fonctionner dans les templates EJS', () => {
      mockReq.cookies.language = 'en';
      languageMiddleware(mockReq, mockRes, mockNext);

      const result = mockRes.locals.t('common.hello', { name: 'Bob' });
      expect(result).toBe('Hello Bob');
    });
  });

  describe('Changement de langue', () => {
    test('devrait changer la langue avec succès', () => {
      mockReq.body = { lang: 'fr' };
      mockReq.get.mockReturnValue('/dashboard');

      switchLanguage(mockReq, mockRes);

      expect(mockRes.cookie).toHaveBeenCalledWith('language', 'fr', {
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: false,
        secure: false,
        sameSite: 'lax',
      });

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        language: 'fr',
        message: 'Language changed successfully',
      });
    });

    test('devrait refuser une langue non supportée', () => {
      mockReq.body = { lang: 'es' };

      switchLanguage(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Language not supported',
      });
    });

    test('devrait gérer le mode production pour les cookies sécurisés', () => {
      process.env.NODE_ENV = 'production';
      mockReq.body = { lang: 'fr' };

      switchLanguage(mockReq, mockRes);

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'language',
        'fr',
        expect.objectContaining({
          secure: true,
        })
      );

      delete process.env.NODE_ENV;
    });
  });

  describe('Informations de langue', () => {
    test('devrait retourner les informations de langue actuelles', () => {
      mockReq.language = 'fr';

      getLanguageInfo(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        currentLanguage: 'fr',
        availableLanguages: [
          { code: 'fr', name: 'Français', flag: '🇫🇷' },
          { code: 'en', name: 'English', flag: '🇺🇸' },
        ],
        supportedLanguages: ['fr', 'en'],
      });
    });
  });
});
