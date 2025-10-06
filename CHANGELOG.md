# Journal des modifications

Tous les changements notables de ce projet seront documentés dans ce fichier.

## [Unreleased]

### Corrigé

- Correction des doubles notifications pour les propriétaires de modules administrateurs
- Les propriétaires reçoivent désormais des notifications personnalisées au lieu de recevoir à la fois les notifications générales et propriétaires

### Refactorisé

- Refactorisation complète de la suite de tests avec ajout de nombreux tests unitaires et d'intégration
- Amélioration de la configuration Jest pour une meilleure couverture de test
- Renommage de `emitToPage` en `emitToPageExcludingUser` avec fonctionnalité d'exclusion d'utilisateur
- Ajout de `emitToAdminsExcludingUser` pour éviter les doubles notifications

### Ajouté

- Tests unitaires pour tous les modules DAO (UserDAO, ModuleDAO, BaseDAO, DatabaseManager)
- Tests pour les routes API (auth, admin, dashboard, modules, etc.)
- Tests pour les gestionnaires WebSocket et événements
- Tests pour les utilitaires (logger, middleware de langue, localisation)
- Tests pour le simulateur de switch-track
- Tests d'intégration pour les handlers WebSocket
- Configuration de test unifiée avec setup Jest personnalisé
- Notifications personnalisées `user:module:online/offline` pour les propriétaires de modules

### Modifié

- Mise à jour des dépendances de développement (Jest, Supertest)
- Amélioration du fichier .gitignore pour exclure les fichiers de test temporaires
- Mise à jour des événements toast pour utiliser les nouvelles notifications personnalisées
- Suppression des anciens événements `module_online/offline` pour éviter la duplication

## [0.0.0] - 03-10-2025

- Version initiale de MicroCoasterWebApp, une application web pour la gestion et le contrôle des microcoasters.

### Ajouté

- Ce fichier CHANGELOG pour suivre toute les prochaines modifications

[unreleased]: https://github.com/Microcoaster/MicroCoasterWebApp/compare/v0.0.0...HEAD
[0.0.0]: https://github.com/Microcoaster/MicroCoasterWebApp/releases/tag/v0.0.0
