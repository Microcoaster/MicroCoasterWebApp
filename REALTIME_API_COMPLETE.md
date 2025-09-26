# API Real-Time WebSocket - Guide Complet

## 📡 Vue d'ensemble

L'API Real-Time WebSocket permet la mise à jour en temps réel des interfaces utilisateurs (pages modules et admin) sans rechargement de page. Elle utilise Socket.io pour la communication bidirectionnelle entre le serveur et les clients.

## 🏗️ Architecture

### Structure des fichiers

```
api/
├── index.js              # RealTimeAPI - Classe principale
├── EventsManager.js      # Gestionnaire central des événements WebSocket
├── ModuleEvents.js       # Événements spécifiques aux modules
├── UserEvents.js         # Événements spécifiques aux utilisateurs
└── AdminEvents.js        # Événements spécifiques aux administrateurs

public/js/
├── modules.js            # Client WebSocket pour la page modules
├── admin.js              # Client WebSocket pour la page admin
└── reconnection-manager.js # Gestionnaire de reconnexion automatique

websocket/
└── handlers.js           # Intégration avec les handlers WebSocket existants

routes/
├── auth.js              # Intégration événements d'authentification
└── modules.js           # Intégration événements de gestion des modules
```

### Classes principales

#### 1. RealTimeAPI (`api/index.js`)
- **Rôle** : Classe principale coordonnant tous les gestionnaires d'événements
- **Méthodes principales** :
  - `initialize(io)` : Initialise l'API avec le serveur Socket.io
  - `emitModuleOnline(moduleId, data)` : Émet un événement module en ligne
  - `emitUserLoggedIn(userId, data)` : Émet un événement de connexion utilisateur

#### 2. EventsManager (`api/EventsManager.js`)
- **Rôle** : Gestionnaire central des événements WebSocket
- **Fonctionnalités** :
  - Enregistrement des clients avec authentification
  - Broadcasting vers des groupes spécifiques (admins, utilisateurs d'une page)
  - Émission ciblée vers des utilisateurs individuels

#### 3. ModuleEvents (`api/ModuleEvents.js`)
- **Rôle** : Gestion des événements liés aux modules
- **Optimisations** :
  - Cache d'état pour éviter les mises à jour inutiles
  - Détection des changements d'état
- **Événements** :
  - `rt_module_online/offline` : Statut de connexion module
  - `rt_module_added/removed/updated` : Gestion CRUD des modules
  - `rt_telemetry_updated` : Mise à jour des données de télémétrie

#### 4. UserEvents (`api/UserEvents.js`)
- **Rôle** : Gestion des événements utilisateurs
- **Événements** :
  - `rt_user_logged_in/out` : Connexion/déconnexion utilisateur
  - `rt_user_profile_updated` : Mise à jour du profil

#### 5. AdminEvents (`api/AdminEvents.js`)
- **Rôle** : Gestion des événements administratifs
- **Événements** :
  - `rt_global_stats_updated` : Statistiques globales mises à jour

## 🚀 Utilisation

### Configuration côté serveur

```javascript
// app.js - Initialisation
const RealTimeAPI = require('./api');

// Après configuration Socket.io
const realTimeAPI = new RealTimeAPI();
await realTimeAPI.initialize(io);
app.locals.realTimeAPI = realTimeAPI;
```

### Émission d'événements côté serveur

```javascript
// Dans les routes ou handlers
if (req.app.locals.realTimeAPI) {
  // Module ajouté
  req.app.locals.realTimeAPI.emitModuleAdded(userId, {
    moduleId: 'MC-1001-STN',
    name: 'Station principale',
    type: 'Station',
    userId: userId
  });

  // Utilisateur connecté
  req.app.locals.realTimeAPI.emitUserLoggedIn(userId, {
    id: userId,
    name: 'John Doe',
    email: 'john@example.com',
    isAdmin: false
  });
}
```

### Écoute d'événements côté client

```javascript
// public/js/modules.js - Page modules
socket.on('rt_module_added', data => {
  console.log('Module ajouté:', data.moduleId);
  // Mise à jour interface utilisateur
});

socket.on('rt_telemetry_updated', data => {
  updateTelemetry(data.moduleId, data.telemetry);
});
```

```javascript
// public/js/admin.js - Page admin
socket.on('rt_user_logged_in', data => {
  showNotification(`${data.name} s'est connecté`);
});

socket.on('rt_global_stats_updated', data => {
  updateGlobalStats(data.stats);
});
```

## 📋 Événements disponibles

### Modules
| Événement | Direction | Description | Données |
|-----------|-----------|-------------|---------|
| `rt_module_online` | Server → Client | Module connecté | `{moduleId, lastSeen, ...}` |
| `rt_module_offline` | Server → Client | Module déconnecté | `{moduleId, disconnectedAt}` |
| `rt_module_added` | Server → Client | Nouveau module ajouté | `{moduleId, name, type, userId}` |
| `rt_module_removed` | Server → Client | Module supprimé | `{moduleId, userId}` |
| `rt_module_updated` | Server → Client | Module modifié | `{moduleId, name, type}` |
| `rt_telemetry_updated` | Server → Client | Télémétrie mise à jour | `{moduleId, telemetry}` |

### Utilisateurs
| Événement | Direction | Description | Données |
|-----------|-----------|-------------|---------|
| `rt_user_logged_in` | Server → Client | Utilisateur connecté | `{id, name, email, isAdmin}` |
| `rt_user_logged_out` | Server → Client | Utilisateur déconnecté | `{id, name, logoutTime}` |
| `rt_user_profile_updated` | Server → Client | Profil mis à jour | `{id, name, email}` |

### Administration
| Événement | Direction | Description | Données |
|-----------|-----------|-------------|---------|
| `rt_global_stats_updated` | Server → Client | Statistiques globales | `{stats: {totalUsers, activeUsers, ...}}` |

## 🔄 Reconnexion automatique

### Configuration
```javascript
// Gestionnaire de reconnexion avec options personnalisables
const reconnectionManager = new ReconnectionManager(socketInitializer, {
  maxReconnectAttempts: 15,    // Nombre max de tentatives
  reconnectDelay: 1000,        // Délai initial (ms)
  maxReconnectDelay: 15000,    // Délai maximum (ms)
  syncOnReconnect: true        // Synchroniser l'état après reconnexion
});
```

### Callbacks disponibles
```javascript
reconnectionManager.onReconnect((socket) => {
  console.log('Reconnecté avec succès');
});

reconnectionManager.onDisconnect(() => {
  console.log('Connexion perdue');
});

reconnectionManager.onSyncComplete((serverState, clientState) => {
  console.log('État synchronisé');
});
```

## 🛡️ Authentification et sécurité

### Authentification automatique
- L'authentification utilise les sessions Express existantes
- Pas besoin d'authentification WebSocket séparée
- Identification automatique des administrateurs

### Ciblage des événements
```javascript
// Vers tous les clients
eventsManager.broadcast('event_name', data);

// Vers les administrateurs uniquement
eventsManager.emitToAdmins('admin_event', data);

// Vers les utilisateurs d'une page spécifique
eventsManager.emitToPage('modules', 'module_event', data);

// Vers un utilisateur spécifique
eventsManager.emitToUser(userId, 'user_event', data);
```

## 🎯 Optimisations

### Cache d'état
```javascript
// ModuleEvents utilise un cache pour éviter les mises à jour inutiles
const lastState = this.moduleStates.get(moduleId);
if (JSON.stringify(lastState) === JSON.stringify(newData)) {
  return; // Pas de changement, skip l'événement
}
```

### Limitation de la bande passante
- Événements émis seulement en cas de changement d'état
- Données minimales transmises
- Groupement des clients par page/rôle

## 🧪 Tests

### Test d'intégration
```bash
# Exécuter les tests
node test_realtime_integration.js
```

### Test manuel
1. Ouvrir plusieurs onglets (modules + admin)
2. Effectuer des actions (connexion, ajout module, etc.)
3. Vérifier la mise à jour temps réel sur tous les onglets

## 📈 Monitoring

### Logs disponibles
```javascript
// Activés automatiquement avec Winston Logger
info: [Events] Client registered: user-123
info: [ModuleEvents] Module MC-1001-STN is now ONLINE
info: [UserEvents] User logged in: John Doe (ID: 456)
```

### Métriques recommandées
- Nombre de clients connectés
- Fréquence des événements émis
- Temps de reconnexion moyen
- Erreurs de connexion

## 🚨 Gestion d'erreurs

### Erreurs communes
1. **Socket non connecté** : Gestion automatique par le ReconnectionManager
2. **Événement non reçu** : Vérifier l'authentification et les filtres de page
3. **Boucle infinie** : Vérifier les optimisations de cache d'état

### Debug
```javascript
// Activer les logs détaillés côté client
localStorage.debug = 'socket.io-client:socket';

// Fonction de debug disponible
window.mc_socketReconnect(); // Forcer une reconnexion
```

## 🔧 Configuration avancée

### Variables d'environnement
```env
# Dans .env (optionnel)
REALTIME_MAX_RECONNECT_ATTEMPTS=15
REALTIME_RECONNECT_DELAY=1000
REALTIME_ENABLE_STATS=true
```

### Personnalisation
```javascript
// Ajouter de nouveaux types d'événements
class CustomEvents {
  constructor(eventsManager, logger) {
    this.eventsManager = eventsManager;
    this.logger = logger;
  }

  emitCustomEvent(data) {
    this.eventsManager.broadcast('rt_custom_event', data);
    this.logger.info('Custom event emitted', data);
  }
}
```

## 📚 Prochaines étapes

### Améliorations possibles
1. **Persistance des événements** : Queue des événements pour les clients déconnectés
2. **Compression** : Compression gzip des données WebSocket
3. **Sharding** : Répartition des connexions sur plusieurs serveurs
4. **Métriques temps réel** : Dashboard de monitoring intégré

### Migration
- L'API est rétrocompatible avec l'existant
- Migration progressive possible
- Rollback facile en cas de problème

---

## 🏁 Résumé

L'API Real-Time WebSocket est maintenant **entièrement fonctionnelle** et prête pour la production. Elle fournit :

✅ **Mises à jour temps réel** sur les pages modules et admin  
✅ **Reconnexion automatique** robuste  
✅ **Optimisations de performance** (cache, filtrage)  
✅ **Sécurité** (authentification par session)  
✅ **Extensibilité** (architecture modulaire)  

**Utilisation recommandée** : Déployer en production et monitorer les performances. L'API est stable et optimisée pour une utilisation intensive.