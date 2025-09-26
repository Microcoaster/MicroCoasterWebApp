# 📡 API Socket.io pour ESP32 MicroCoaster

## Vue d'ensemble

Cette documentation décrit le protocole de communication entre les modules ESP32 MicroCoaster et le serveur Node.js via Socket.io.

## 🔗 Connexion initiale

### 1. Connexion Socket.io

```cpp
socketIO.begin("192.168.1.100", 3000);
```

### 2. Identification du module (OBLIGATOIRE)

L'ESP32 doit s'identifier immédiatement après la connexion :

**Événement envoyé :** `module_identify`

```json
{
  "moduleId": "MC-0001-AP",
  "type": "Audio Player"
}
```

**Réponse attendue :** `connected`

```json
{
  "message": "Module registered successfully"
}
```

## 📊 Télémétrie

### Envoi périodique des données d'état

**Événement envoyé :** `telemetry`

**Fréquence recommandée :** Toutes les 5 secondes

**Format général :**

```json
{
  "uptime_ms": 125000
  // ... données spécifiques au type de module
}
```

### Données par type de module

#### 🎵 Audio Player (`*-AP`)

```json
{
  "uptime_ms": 125000,
  "playlist": [
    { "file": "001.mp3", "title": "Taron" },
    { "file": "002.mp3", "title": "Klugheim Ambience" }
  ],
  "current": 0,
  "ready": true
}
```

#### 🚉 Station (`*-STN`)

```json
{
  "uptime_ms": 125000,
  "gates": false,
  "harness": false,
  "nsf": true,
  "estop": false,
  "inDispatch": false
}
```

#### 🔄 Switch Track (`*-ST`)

```json
{
  "uptime_ms": 125000,
  "transfer": false,
  "left": false,
  "right": false
}
```

#### 💡 Light FX (`*-LFX`)

```json
{
  "uptime_ms": 125000,
  "on": false
}
```

#### 🚀 Launch Track (`*-LT`)

```json
{
  "uptime_ms": 125000,
  "ready": true,
  "speed": 60,
  "duration": 5,
  "dir": 1,
  "running": false
}
```

#### 💨 Smoke Machine (`*-SM`)

```json
{
  "uptime_ms": 125000,
  "ready": true,
  "duration": 8,
  "running": false
}
```

## 🎮 Commandes reçues

### Format des commandes

**Événement reçu :** `command`

```json
{
  "type": "command",
  "payload": {
    "command": "nom_commande",
    "params": {
      "param1": "valeur1",
      "param2": "valeur2"
    }
  }
}
```

### Commandes par type de module

#### 🎵 Audio Player

| Commande | Paramètres       | Description               |
| -------- | ---------------- | ------------------------- |
| `play`   | `track` (int)    | Jouer un track spécifique |
| `stop`   | -                | Arrêter la lecture        |
| `pause`  | -                | Mettre en pause           |
| `resume` | -                | Reprendre la lecture      |
| `next`   | -                | Track suivant             |
| `prev`   | -                | Track précédent           |
| `volume` | `volume` (0-100) | Régler le volume          |

#### 🚉 Station

| Commande         | Paramètres | Description               |
| ---------------- | ---------- | ------------------------- |
| `gates_open`     | -          | Ouvrir les portes         |
| `gates_close`    | -          | Fermer les portes         |
| `harness_lock`   | -          | Verrouiller les harnais   |
| `harness_unlock` | -          | Déverrouiller les harnais |
| `dispatch`       | -          | Lancer le dispatch        |
| `estop`          | -          | Arrêt d'urgence           |

#### 🔄 Switch Track

| Commande          | Paramètres | Description               |
| ----------------- | ---------- | ------------------------- |
| `transfer_left`   | -          | Transférer vers la gauche |
| `transfer_right`  | -          | Transférer vers la droite |
| `transfer_center` | -          | Position centrale         |

#### 💡 Light FX

| Commande  | Paramètres            | Description         |
| --------- | --------------------- | ------------------- |
| `on`      | -                     | Allumer les effets  |
| `off`     | -                     | Éteindre les effets |
| `pattern` | `pattern` (string)    | Motif d'éclairage   |
| `color`   | `r`, `g`, `b` (0-255) | Couleur RGB         |

#### 🚀 Launch Track

| Commande        | Paramètres                      | Description                  |
| --------------- | ------------------------------- | ---------------------------- |
| `launch`        | `speed` (int), `duration` (int) | Lancer avec vitesse et durée |
| `stop`          | -                               | Arrêter le launch            |
| `set_speed`     | `speed` (int)                   | Définir la vitesse           |
| `set_direction` | `dir` (1 ou -1)                 | Sens de rotation             |

#### 💨 Smoke Machine

| Commande | Paramètres       | Description                  |
| -------- | ---------------- | ---------------------------- |
| `start`  | `duration` (int) | Démarrer la fumée (secondes) |
| `stop`   | -                | Arrêter la fumée             |

## 🚨 Gestion des erreurs

### Erreurs possibles

**Événement reçu :** `error`

```json
{
  "message": "Module ID required"
}
```

### Types d'erreurs courantes

- `"Module ID required"` : ID de module manquant lors de l'identification
- `"Module disconnected"` : Perte de connexion
- `"Command not supported"` : Commande non reconnue
- `"Invalid parameters"` : Paramètres invalides

## 🔄 Reconnexion automatique

L'ESP32 doit implémenter une reconnexion automatique en cas de perte de connexion :

```cpp
void handleReconnection() {
  if (!socketIO.isConnected()) {
    Serial.println("Reconnecting to server...");
    socketIO.begin(SERVER_HOST, SERVER_PORT);
    delay(5000); // Attendre 5 secondes avant le prochain essai
  }
}
```

## 📝 Exemple complet d'implémentation

Voir le fichier `ESP32_Socket_Client.ino` pour un exemple complet d'implémentation avec :

- Connexion WiFi
- Identification automatique
- Envoi de télémétrie
- Gestion des commandes
- Reconnexion automatique

## 🛠️ Configuration réseau

Voir le fichier `network_config.h` pour la configuration :

- Paramètres WiFi
- Adresse serveur
- IDs et types de modules
- Pins matérielles
- Options de débogage

## 🧪 Test avec simulateur

Pour tester la communication sans ESP32 physique :

```bash
npm run sim-esp
```

Le simulateur se connecte automatiquement et envoie de la télémétrie de test.
