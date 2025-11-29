# Journal des modifications

Tous les changements notables de ce projet seront documentés dans ce fichier.

## [Unreleased]

### Ajouté

- **Navbar responsive avec menu hamburger**
  - Affichage d’un bouton hamburger sur mobile et tablette (≤ 1024px)
  - Menu mobile complet avec liens (Dashboard, Modules, Timelines, Admin), profil, langue et déconnexion
  - Fermeture automatique du menu lors du clic sur un lien ou en dehors de la zone de menu

- **Système d’overlay mobile unifié**
  - Partial EJS `partials/mobile-overlays` inclus sur toutes les pages principales (dashboard, modules, admin, profil)
  - Overlay de rotation du téléphone avec nouvelle icône SVG centrée et animée
  - Détection d’orientation mobile (portrait/paysage) avec blocage du scroll en mode portrait
  - Désactivation spécifique de l’overlay de rotation sur la page Timelines (overlay de blocage dédié)

- **Responsive page de login**
  - Amélioration complète du responsive pour tablettes et mobiles (portrait & paysage)
  - Ajustement des tailles de titres, champs, boutons et marges suivant la taille d’écran
  - Meilleure lisibilité et utilisation sur petits écrans

- **Responsive page « Mes modules »**
  - Mise en page adaptée pour mobile et tablette avec titre centré
  - Barre de recherche pleine largeur sous le titre
  - Deux boutons alignés côte à côte sous la barre de recherche (`En ligne seulement` et `+ Ajouter un module`)
  - Comportement cohérent entre mobile et tablette (même layout)

### Modifié

- **Navbar globale**
  - Passage en `position: fixed` avec animation de masquage/affichage via `transform: translateY()`
  - Unification du style mobile et tablette (seuil 1024px) pour simplifier l’interface
  - Suppression du lien vers la page « Documentation » dans la navbar desktop et mobile

- **Comportement de la navbar au scroll**
  - Ajout d’un système de masquage automatique de la navbar au scroll (auto-hide)
  - La navbar se cache lors du scroll vers le bas et réapparaît lors du scroll vers le haut
  - Protection contre le masquage lorsque le menu mobile est ouvert
  - Ajustement des seuils de scroll et optimisation avec `requestAnimationFrame`

- **Overlay mobile timelines**
  - Amélioration du style et du responsive de l’overlay de blocage sur mobile pour la page Timelines
  - Meilleure compatibilité avec les petites résolutions et textes traduits

### Supprimé

- **Fonctionnalité Documentation**
  - Suppression du lien « Documentation » de la navbar (desktop et mobile)
  - Suppression complète de la route Express, de la vue `documentations.ejs`, des styles `documentations.css` et des tests associés

## [1.0.0] - 21-11-2025

### Ajouté

- **Système de chronologies (Timelines) complet** : Éditeur visuel de séquences temporelles avec support du drag & drop, zoom dynamique, lecture/pause/reprise et sauvegarde automatique
- **Éditeur de timeline interactif** : Placement de modules sur plusieurs pistes (8 lanes), redimensionnement des blocs, snapping intelligent, et détection de conflits temporels
- **Contrôle de lecture timeline** : Lecture, pause, reprise et arrêt avec synchronisation WebSocket temps réel des modules physiques (Audio Player et Switch Track)
- **Arrêt automatique des blocs audio** : Programmation automatique de `audio_stop` à la fin de la durée de chaque bloc Audio Player pour éviter que la musique continue indéfiniment
- **Système de pause/reprise intelligent** : Gestion correcte des timeouts lors de la pause, reprogrammation des arrêts audio pour les actions en cours lors de la reprise
- **Optimisation des commandes timeline** : Envoi de `timeline_pause`, `timeline_resume` et `timeline_stop` uniquement aux modules Audio Player (dédoublonnage pour éviter le spam aux Switch Track)
- **Auto-sauvegarde intelligente** : Détection des changements avant sauvegarde, indicateur visuel de statut, sauvegarde différée de 2 secondes après modification
- **Sélection intelligente des timelines** : Chargement automatique de la dernière timeline utilisée, gestion du cas "une seule timeline" vs "plusieurs timelines"
- **Menu contextuel sur clic droit** : Accès rapide aux actions (configurer, dupliquer, supprimer) sur les blocs de timeline
- **Validation de suppression de timeline** : Confirmation avant suppression pour éviter les pertes accidentelles
- **Support avancé de l'audio** : Démarrage à une position spécifique dans le fichier (`start_seconds`), contrôle du volume par bloc, durée limitée de lecture
- **Architecture WebSocket unifiée pour audio** : Fonction `playAudio()` unique remplaçant `playAudioFile()` et `playTimelineAudio()`, auto-détection du mode timeline
- **Module Audio Player ESP32 complet** : Nouveau firmware pour module audio avec support MP3/WAV, gestionnaire WiFi intelligent, communication WebSocket native et stockage sur carte SD
- **Support MP3 étendu** : Ajout du support complet des fichiers MP3 (en plus du WAV existant) avec analyse des métadonnées ID3 et frame sync
- **Interface utilisateur audio interactive** : Contrôles complets de lecture (play/pause/stop), liste de pistes, contrôle du volume, et affichage du statut en temps réel
- **Communication WebSocket audio native** : Protocole de communication dédié pour les commandes audio (lecture, pause, arrêt, volume) avec gestion des réponses et télémétrie
- **Gestionnaire de fichiers audio intelligent** : Scan automatique des fichiers MP3/WAV sur carte SD avec analyse des propriétés (fréquence, bitrate, canaux) et conseils qualité
- **Configuration I2S optimisée** : Configuration avancée pour MAX98357 avec mapping de volume 0-100 vers 0-63 pour meilleure résolution
- **Télémétrie audio temps réel** : Suivi continu de l'état de lecture, volume, fichier courant et statut de la carte SD
- **Clés de traduction manquantes** : Ajout des clés `module_status` et `online_status` dans les fichiers de localisation français et anglais

### Modifié

- **Amélioration de la gestion de la pause timeline** : Sauvegarde correcte du `currentTime` lors de la pause, reprogrammation intelligente des actions restantes avec calcul du temps relatif
- **Optimisation de l'architecture audio ESP32** : Refonte de `playAudio()` avec structure `AudioParams` unifiée, élimination de la duplication de code entre modes standard et timeline
- **Suppression de l'animation de déplacement des blocs** : Interface plus réactive lors du drag & drop de modules sur la timeline
- **Désactivation du resize pour les durées fixes** : Impossibilité de redimensionner les blocs Switch Track (durée fixe de 3 secondes) pour éviter les erreurs utilisateur
- **Correction des traductions de statut de module** : Le statut "Hors ligne" s'affiche désormais correctement en français pour tous les états de connexion du module

### Corrigé

- **Spam de commandes aux modules Switch Track** : Correction de `sendTimelineControlCommand()` pour n'envoyer `timeline_pause/resume/stop` qu'aux modules Audio Player (les Switch Track n'en ont pas besoin)
- **Dédoublonnage des commandes timeline** : Utilisation d'un `Set` pour envoyer chaque commande une seule fois par module unique, même si le module apparaît plusieurs fois dans la timeline
- **Conflits temporels détectés** : Vérification de `hasModuleTimeConflict()` empêchant le placement de deux actions du même module qui se chevauchent dans le temps
- **Musique qui continue après la fin du bloc** : Ajout d'un système d'arrêt automatique programmé pour les Audio Player à la fin de la durée de chaque bloc
- **Gestion de la pause/reprise défaillante** : Correction du calcul de `startTime` lors de la reprise, reprogrammation correcte des actions restantes avec `scheduleActionsFromTime()`

### Refactorisé

- **Uniformisation des fonctions de scheduling** : Création de `scheduleActionsFromTime()` pour gérer la reprogrammation après pause avec calcul du temps relatif
- **Centralisation de la logique d'arrêt audio** : Programmation des arrêts audio directement dans `executeAction()` et `scheduleActionsFromTime()` pour éviter la duplication
- **Architecture multi-threading FreeRTOS pour Audio Player** : Refonte complète du firmware audio.cpp avec architecture FreeRTOS robuste (tâche audio sur Core 0, tâche WebSocket sur Core 1), queue de commandes non-bloquantes, mutex pour protection des variables partagées, et élimination totale des `delay()` bloquants

### Note importante sur le module audio

⚠️ **Le module audio prend en charge toutes les commandes de lecture (play/pause/stop/volume) et la communication WebSocket fonctionne parfaitement**, mais **le son ne sort pas du module**. Cela indique un problème matériel au niveau de la configuration I2S ou du circuit audio (amplificateur MAX98357). Le firmware traite correctement les fichiers audio et les commandes, mais l'audio n'est pas audible en sortie. Investigation matérielle requise pour résoudre ce problème.

## [0.2.0] - 08-10-2025

### Ajouté

- **Système de notifications personnalisables complet** : Interface utilisateur dans le profil pour gérer les préférences de notification avec cases à cocher organisées par catégories (utilisateur/administrateur)
- **Support multilingue avancé** : Colonne `language` dans la base de données, sélecteur de langue dans le profil, détection automatique de la langue préférée de l'utilisateur
- **Gestionnaire de notifications intelligent** (`NotificationManager.js`) : Filtrage automatique des notifications toast selon les préférences utilisateur avec support des types `module_status`, `system_errors`, `admin_user_activity`, `admin_module_activity`
- **Notifications toast contextuelles** : Événements temps réel pour les connexions/déconnexions de modules, activités utilisateur, changements de profil, avec exclusion automatique des propriétaires des notifications admin
- **Refonte complète de l'interface profil** : Mise en page moderne avec sections distinctes pour informations personnelles, changement de mot de passe et préférences de notification
- **API de notifications intégrée** : Intégration complète du NotificationManager dans tous les gestionnaires d'événements (ModuleEvents, UserEvents) pour une gestion centralisée des notifications
- **Système de notifications multilingues côté client** : Traduction automatique des notifications selon la langue préférée de l'utilisateur, utilisation de clés de traduction spécifiques pour chaque type de notification

### Modifié

- **Correction des notifications dupliquées** : Suppression du toast côté serveur pour les actions de modules, utilisation exclusive du toast côté client avec traduction pour éviter les doublons
- **Amélioration de l'exclusion des notifications admin** : Utilisation de `emitToAdminsExcludingUser` pour empêcher les administrateurs de recevoir leurs propres notifications d'activité
- **Optimisation de l'initialisation temps réel** : Initialisation anticipée de l'API temps réel pour une meilleure stabilité des WebSocket
- **Sécurisation des formulaires de profil** : Validation stricte des champs et gestion séparée des formulaires de profil/notifications
- **Notifications toast simplifiées** : affichage des messages uniquement avec traduction côté client
- **Clés de traduction spécifiques pour les statuts de module** : Remplacement des clés génériques par des clés dédiées (`module_connected`/`module_disconnected`) pour une meilleure traduction multilingue

### Corrigé

- **Élimination des toasts dupliqués** : Un seul toast "Module supprimé avec succès" affiché côté client au lieu de deux toasts (serveur + client)
- **Gestion correcte des préférences de notification** : Valeurs par défaut TRUE pour toutes les préférences, conversion automatique des valeurs checkbox (`on` → `true`)

## [0.1.0] - 07-10-2025

### Corrigé

- Correction des doubles notifications pour les propriétaires de modules administrateurs
- Les propriétaires reçoivent désormais des notifications personnalisées au lieu de recevoir à la fois les notifications générales et propriétaires
- Correction de la mise à jour des compteurs de modules en ligne/hors ligne sur le dashboard lors des connexions/déconnexions WebSocket
- Correction de tous les avertissements ESLint identifiés par `npm run lint` (2000 erreurs éliminés)
- Remplacement des instructions `console` par le système de logging structuré approprié
- Suppression des variables, fonctions et paramètres inutilisés dans tout le code source
- Nettoyage du code mort et amélioration de la maintenabilité
- Correction des traductions toast pour les messages de modules
- Amélioration de l'affichage des états vides dans l'interface modules

### Refactorisé

- Refactorisation complète de la suite de tests avec ajout de nombreux tests unitaires et d'intégration
- Amélioration de la configuration Jest pour une meilleure couverture de test
- Renommage de `emitToPage` en `emitToPageExcludingUser` avec fonctionnalité d'exclusion d'utilisateur
- Ajout de `emitToAdminsExcludingUser` pour éviter les doubles notifications
- Conversion complète des concaténations de chaînes classiques (`+`) en template literals ES6+ (`${}`) pour améliorer la lisibilité et maintenabilité du code
- **Refactorisation majeure de la base de données : suppression de la colonne redondante `claimed`**
- Remplacement de toutes les vérifications `claimed = 0/1` par des requêtes optimisées `user_id IS NULL/IS NOT NULL`
- Suppression de la route `/add` dépréciée qui permettait la création arbitraire de modules
- Nettoyage du ModuleDAO et suppression des références au champ `claimed`
- Simplification des événements WebSocket en supprimant les propriétés `claimed`
- Suppression du support des anciens types de modules non fonctionnels (Station, Light FX, Smoke Machine, Launch Track)
- Conservation uniquement des modules Audio Player (AP) et Switch Track (ST) opérationnels

### Supprimé

- Suppression de la colonne BOOLEAN `claimed` et de son index inefficace dans la table modules
- Suppression de la route `POST /modules/add` qui permettait la création dangereuse de modules virtuels
- Suppression du support des types de modules non implémentés : Station (STN), Light FX (LFX), Smoke Machine (SM), Launch Track (LT)
- Suppression des propriétés `claimed` et `unclaimed` des statistiques de modules
- Suppression des références `claimed` dans tous les événements WebSocket et objets module

### Optimisé

- Amélioration significative des performances de base de données en supprimant l'index boolean inefficace
- Utilisation optimisée de l'index existant sur `user_id` pour les requêtes de modules
- Réduction de la redondance de données et simplification du schéma de base de données
- Requêtes plus rapides pour la gestion des modules (claim/unclaim)
- Validation plus stricte des formats de modules ID pour éviter les erreurs

### Sécurité

- Suppression de la route `POST /modules/add` qui permettait la création non contrôlée de modules
- Renforcement de la sécurité en limitant les actions utilisateurs aux modules pré-enregistrés uniquement
- Validation obligatoire des codes de sécurité pour toute opération de claim de module

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

[unreleased]: https://github.com/Microcoaster/MicroCoasterWebApp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Microcoaster/MicroCoasterWebApp/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/Microcoaster/MicroCoasterWebApp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Microcoaster/MicroCoasterWebApp/compare/v0.0.0...v0.1.0
[0.0.0]: https://github.com/Microcoaster/MicroCoasterWebApp/releases/tag/v0.0.0
