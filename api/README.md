# API WebSocket Temps Réel - MicroCoaster

## 📋 Vue d'ensemble

Cette API permet les mises à jour en temps réel via WebSockets (Socket.io) pour :
- **Page Modules** : État des modules (online/offline), télémétrie, nouveaux modules
- **Page Admin** : Statistiques, nouvelles connexions, actions administratives
- **Synchronisation multi-appareils** : Mises à jour sur tous les onglets/appareils connectés

## 🏗️ Architecture

```
api/
├── index.js           # Point d'entrée principal (RealTimeAPI)
├── EventsManager.js   # Gestionnaire central WebSocket
├── ModuleEvents.js    # Événements spécifiques aux modules
├── UserEvents.js      # Événements utilisateurs
└── AdminEvents.js     # Événements administration
```

## 🔄 Flux des événements

### 1. Connexion client
```javascript
// Client se connecte et s'authentifie
socket.emit('client:authenticate', {
  userId: 123,
  userType: 'admin', // 'user' ou 'admin'
  page: 'modules',   // 'modules', 'admin', 'dashboard'
  sessionId: 'abc123'
});
```

### 2. Événements modules
```javascript
// Module passe en ligne
realTimeAPI.emitModuleOnline('MC-1234-STN', {
  type: 'Station',
  name: 'Station principale',
  userId: 123
});

// Module passe hors ligne
realTimeAPI.emitModuleOffline('MC-1234-STN', { ... });

// Nouveau module ajouté
realTimeAPI.emitModuleAdded(moduleData);

// Module supprimé
realTimeAPI.emitModuleRemoved(moduleData);

// Télémétrie mise à jour
realTimeAPI.emitTelemetryUpdate('MC-1234-STN', telemetryData);
```

### 3. Événements utilisateurs
```javascript
// Connexion utilisateur
realTimeAPI.emitUserLoggedIn(userData, sessionId);

// Déconnexion
realTimeAPI.emitUserLoggedOut(userData, sessionId);

// Profil modifié
realTimeAPI.emitUserProfileUpdated(oldData, newData);

// Nouveau compte créé
realTimeAPI.emitUserRegistered(userData);
```

### 4. Événements admin
```javascript
// Mise à jour des statistiques
await realTimeAPI.emitStatsUpdate();

// Action administrative
realTimeAPI.emitAdminAction(adminId, 'user_promoted', details);

// Mode maintenance
realTimeAPI.emitMaintenanceMode(true, 'Mise à jour', adminId);
```

## 📡 Événements côté client

### Page Modules (`/js/modules.js`)
```javascript
// Écouter les changements d'état des modules
socket.on('module:status:changed', (data) => {
  updateModuleStatus(data.moduleId, data.online);
});

// Nouveau module ajouté
socket.on('user:module:added', (data) => {
  addModuleToUI(data.module);
});

// Télémétrie en temps réel
socket.on('module:telemetry:updated', (data) => {
  updateModuleTelemetry(data.moduleId, data.telemetry);
});
```

### Page Admin (`/js/admin.js`)
```javascript
// Statistiques mises à jour
socket.on('admin:stats:updated', (data) => {
  updateStatsUI(data.stats);
});

// Nouveau module dans le système
socket.on('admin:module:added', (data) => {
  addModuleToAdminTable(data.module);
});

// Nouvel utilisateur
socket.on('admin:user:registered', (data) => {
  addUserToAdminTable(data.user);
});
```

## 🔧 Intégration dans le code existant

### 1. Dans `app.js`
```javascript
const RealTimeAPI = require('./api');

// Après création du serveur Socket.io
const realTimeAPI = new RealTimeAPI(io, databaseManager);
realTimeAPI.initialize();

// Rendre disponible globalement
app.locals.realTimeAPI = realTimeAPI;
```

### 2. Dans `websocket/handlers.js`
```javascript
// Quand un module ESP se connecte
function onEspRegister(socket, data) {
  // ... logique existante ...
  
  // Émettre l'événement
  const realTimeAPI = socket.server.app.locals.realTimeAPI;
  realTimeAPI.emitModuleOnline(moduleId, moduleInfo);
}

// Quand un module ESP se déconnecte
function onEspDisconnect(socket) {
  // ... logique existante ...
  
  realTimeAPI.emitModuleOffline(moduleId, moduleInfo);
}
```

### 3. Dans `routes/auth.js`
```javascript
// Lors de la connexion
router.post('/login', async (req, res) => {
  // ... logique existante ...
  
  if (user) {
    req.app.locals.realTimeAPI.emitUserLoggedIn(user, req.sessionID);
  }
});

// Lors de la déconnexion
router.get('/logout', (req, res) => {
  // ... logique existante ...
  
  req.app.locals.realTimeAPI.emitUserLoggedOut(userData, req.sessionID);
});
```

## 📈 Avantages

### ✅ **Mises à jour instantanées**
- Module s'allume → Tous les clients voient le changement immédiatement
- Nouvel utilisateur → Page admin mise à jour automatiquement
- Statistiques → Recalculées et diffusées en temps réel

### ✅ **Évite les mises à jour inutiles**
- Cache intelligent : ne met à jour que si changement réel
- Filtrage par page : seuls les clients concernés reçoivent les événements
- Optimisations : regroupement des événements similaires

### ✅ **Synchronisation multi-appareils**
- Utilisateur connecté sur plusieurs onglets/appareils
- Action sur un appareil → visible sur tous les autres
- Session partagée en temps réel

### ✅ **Monitoring avancé**
- Admins voient toutes les activités en temps réel
- Alertes système instantanées
- Performance serveur en direct

## 🔒 Sécurité

- **Authentification obligatoire** : Clients doivent s'authentifier
- **Filtrage par rôle** : Admins vs utilisateurs normaux
- **Isolation par utilisateur** : Chacun ne voit que ses modules
- **Logs complets** : Toutes les actions sont loggées

## 🚀 Utilisation recommandée

Votre idée est **parfaite** ! Le principe `socket.on('message')` est exactement la bonne approche :

```javascript
// ✅ PARFAIT : Mise à jour seulement si changement
if (module.wasOffline && module.isNowOnline) {
  realTimeAPI.emitModuleOnline(moduleId, moduleInfo);
}

// ✅ OPTIMAL : Évite le spam d'événements
if (user.profileChanged) {
  realTimeAPI.emitUserProfileUpdated(oldData, newData);
}
```

Cette architecture respecte vos exigences :
- ✅ Mise à jour quand module s'allume
- ✅ Pas de mise à jour si déjà allumé  
- ✅ Mise à jour quand passe hors ligne
- ✅ Mise à jour profils utilisateurs
- ✅ Nouveaux utilisateurs/modules
- ✅ Performance optimisée