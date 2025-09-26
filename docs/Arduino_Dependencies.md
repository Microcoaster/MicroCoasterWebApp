# 📚 Dépendances Arduino pour ESP32 MicroCoaster

## Libraries requises

Pour faire fonctionner le code ESP32 avec Socket.io, vous devez installer ces libraries dans l'IDE Arduino :

### 1. **SocketIOclient** (obligatoire)

- **Nom :** `SocketIOclient`
- **Auteur :** Links2004
- **Version :** >= 2.3.6
- **Installation :** Aller dans `Outils > Gestionnaire de bibliothèques` et chercher "SocketIOclient"

### 2. **ArduinoJson** (obligatoire)

- **Nom :** `ArduinoJson`
- **Auteur :** Benoit Blanchon
- **Version :** >= 6.19.4
- **Installation :** Aller dans `Outils > Gestionnaire de bibliothèques` et chercher "ArduinoJson"

### 3. **WiFi** (intégrée ESP32)

- **Nom :** `WiFi`
- **Statut :** Intégrée avec le core ESP32
- **Version :** Automatique avec le board ESP32

## Configuration Arduino IDE

### 1. Installation du support ESP32

1. Ouvrir Arduino IDE
2. Aller dans `Fichier > Préférences`
3. Dans "URLs de gestionnaire de cartes supplémentaires", ajouter :
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
4. Aller dans `Outils > Type de carte > Gestionnaire de cartes`
5. Chercher "ESP32" par Espressif Systems
6. Installer la dernière version

### 2. Sélection de la carte

- **Type de carte :** ESP32 Dev Module (ou votre modèle spécifique)
- **Vitesse de téléversement :** 921600
- **CPU Frequency :** 240MHz (WiFi/BT)
- **Flash Frequency :** 80MHz
- **Flash Mode :** QIO
- **Flash Size :** 4MB (32Mb)
- **Partition Scheme :** Default 4MB with spiffs
- **Core Debug Level :** None (ou "Info" pour debug)
- **PSRAM :** Disabled (sauf si votre carte en a)

### 3. Installation des libraries

#### Via le gestionnaire de bibliothèques (recommandé) :

1. `Outils > Gestionnaire de bibliothèques`
2. Chercher et installer :
   - `SocketIOclient` par Links2004
   - `ArduinoJson` par Benoit Blanchon

#### Via GitHub (alternative) :

```bash
# Dans le dossier libraries de Arduino
git clone https://github.com/Links2004/arduinoWebSockets.git
git clone https://github.com/bblanchon/ArduinoJson.git
```

## Code minimal de test

```cpp
#include <WiFi.h>
#include <SocketIOclient.h>
#include <ArduinoJson.h>

const char* ssid = "VOTRE_WIFI";
const char* password = "VOTRE_PASSWORD";

SocketIOclient socketIO;

void setup() {
  Serial.begin(115200);

  // Test WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  Serial.println("WiFi OK!");

  // Test Socket.io
  socketIO.begin("192.168.1.100", 3000);
  Serial.println("Socket.io initialized");
}

void loop() {
  socketIO.loop();
  delay(1000);
}
```

## Dépannage courant

### Erreur de compilation "SocketIOclient.h not found"

**Solution :** Installer la library `SocketIOclient` via le gestionnaire

### Erreur "ArduinoJson.h not found"

**Solution :** Installer la library `ArduinoJson` via le gestionnaire

### Erreur "WiFi.h not found"

**Solution :** Vérifier que le core ESP32 est bien installé

### Problème de connexion WiFi

**Solutions :**

- Vérifier SSID/password
- Vérifier que le WiFi est en 2.4GHz (ESP32 ne supporte pas 5GHz)
- Augmenter le timeout de connexion

### Problème Socket.io "Connection failed"

**Solutions :**

- Vérifier l'IP du serveur
- Vérifier que le port 3000 est ouvert
- Tester avec le simulateur Node.js d'abord

### Erreur mémoire "Out of memory"

**Solutions :**

- Réduire la taille des buffers JSON
- Utiliser `StaticJsonDocument` au lieu de `DynamicJsonDocument`
- Optimiser le code pour utiliser moins de RAM

## Versions testées

- **Arduino IDE :** 1.8.19 ou 2.x
- **ESP32 Core :** 2.0.5+
- **SocketIOclient :** 2.3.6+
- **ArduinoJson :** 6.19.4+

## Support hardware

Le code fonctionne sur tous les modules ESP32 :

- ESP32 DevKitV1
- ESP32 WROOM-32
- ESP32-S2
- ESP32-S3
- ESP32-C3
