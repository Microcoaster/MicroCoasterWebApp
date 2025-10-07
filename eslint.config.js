const js = require('@eslint/js');
const prettier = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  // Configuration de base recommandée
  js.configs.recommended,

  // Configuration Prettier
  prettierConfig,

  // Configuration globale pour tous les fichiers
  {
    plugins: {
      prettier: prettier,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Variables globales pour le navigateur
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        $: 'readonly',
        jQuery: 'readonly',
        io: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        Image: 'readonly',
        CustomEvent: 'readonly',
        ResizeObserver: 'readonly',
        navigator: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',

        // Variables globales pour Node.js
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
      },
    },
    rules: {
      'prettier/prettier': 'error',
      'no-unused-vars': 'warn',
      // Console autorisé en dev, interdit en production
      'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
      'no-undef': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      'no-empty': 'warn',
      // Désactiver comma-dangle car Prettier le gère
      'comma-dangle': 'off',
    },
  },

  // Configuration spécifique pour les fichiers Node.js (CommonJS)
  {
    files: ['**/*.cjs', 'app.js'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },

  // Configuration spécifique pour les fichiers frontend JavaScript
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      globals: {
        // Variables spécifiques au projet (définies ailleurs)
        urlImg: 'readonly',
        preload: 'readonly',
        // Fonction de traduction
        t: 'readonly',
        // Objet de locales
        locales: 'readonly',
        // APIs du navigateur
        cancelAnimationFrame: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        FileReader: 'readonly',
        // Librairies externes
        bootstrap: 'readonly',
      },
    },
  },

  // Configuration spécifique pour les fichiers de test
  {
    files: ['tests/**/*.test.js', '**/*.test.js', 'tests/setup.js'],
    languageOptions: {
      globals: {
        // Globals Jest
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        // Variables globales pour le navigateur dans les tests
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        $: 'readonly',
        jQuery: 'readonly',
        io: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        Image: 'readonly',
        CustomEvent: 'readonly',
        ResizeObserver: 'readonly',
        navigator: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
      },
    },
    rules: {
      'no-console': 'off', // Autoriser console.log dans les tests
    },
  },
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      '*.log',
      '.env*',
      'package-lock.json',
      'public/css/bootstrap-grid.min.css',
    ],
  },
];
