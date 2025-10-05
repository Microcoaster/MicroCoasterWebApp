# Journal des modifications

Tous les changements notables de ce projet seront documentés dans ce fichier.

## [Unreleased]

### Refactorisé

- Refactorisation complète de la suite de tests avec ajout de nombreux tests unitaires et d'intégration
- Amélioration de la configuration Jest pour une meilleure couverture de test

### Ajouté

- Tests unitaires pour tous les modules DAO (UserDAO, ModuleDAO, BaseDAO, DatabaseManager)
- Tests pour les routes API (auth, admin, dashboard, modules, etc.)
- Tests pour les gestionnaires WebSocket et événements
- Tests pour les utilitaires (logger, middleware de langue, localisation)
- Tests pour le simulateur de switch-track
- Tests d'intégration pour les handlers WebSocket
- Configuration de test unifiée avec setup Jest personnalisé

### Modifié

- Mise à jour des dépendances de développement (Jest, Supertest)
- Amélioration du fichier .gitignore pour exclure les fichiers de test temporaires

## [0.0.0] - 03-10-2025

- Version initiale de MicroCoasterWebApp, une application web pour la gestion et le contrôle des microcoasters.

### Ajouté

- Ce fichier CHANGELOG pour suivre toute les prochaines modifications

[unreleased]: https://github.com/Microcoaster/MicroCoasterWebApp/compare/v0.0.0...HEAD
[0.0.0]: https://github.com/Microcoaster/MicroCoasterWebApp/releases/tag/v0.0.0