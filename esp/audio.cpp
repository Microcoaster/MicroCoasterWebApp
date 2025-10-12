
  /*
  * MicroCoaster - Module Audio Player ESP32
  *
  * Module de lecture audio MP3 avec gestionnaire WiFi automatique et communication WebSocket
  * Support contrôles de lecture et stockage sur carte microSD
  *
  * Auteurs: CyberSpaceRS, Yamakajump
  * Version: 0.0.0
  */

  #include <Arduino.h>          // Bibliothèque principale Arduino pour ESP32
  #include <AyresWiFiManager.h> // Gestionnaire WiFi avec portail captif
  #include <WebSocketsClient.h> // Client WebSocket pour communication serveur
  #include <ArduinoJson.h>      // Manipulation des données JSON
  #include <SD.h>           // Gestionnaire carte SD
  #include <Audio.h>            // Bibliothèque audio ESP32-audioI2S pour WAV

  // ========================================
  // CONFIGURATION PRINCIPALE
  // ========================================

  // Configuration WiFi (identifiants du point d'accès de secours)
  #define ESP_WIFI_SSID "WifiManager-MicroCoaster"
  #define ESP_WIFI_PASSWORD "123456789"

  // Instance du gestionnaire WiFi intelligent avec portail captif
  AyresWiFiManager wifi;

  // Configuration serveur WebSocket - Basculez entre ws (local) et wss (production)
  #define SERVER_USE_SSL false                       // true = wss (SSL/TLS), false = ws (plain)
  const char* server_host = "192.168.1.15";        // Adresse IP/domaine du serveur (192.168.1.16 pour local, app.microcoaster.com pour production)
  const uint16_t server_port = 3000;                 // Port du serveur (3000 pour ws, 443 pour wss)
  const char* websocket_path = "/esp32";             // Endpoint WebSocket dédié aux modules ESP32
  // Empreinte SSL optionnelle (fingerprint SHA1) - laissez vide "" pour ne pas vérifier
  const char* server_fingerprint = "";               // Ex: "AA BB CC DD EE FF 00 11 22 33 44 55 66 77 88 99 AA BB CC DD"

  // Identifiants uniques du module Audio Player
  const String MODULE_ID = "MC-0001-AP";                        // ID unique du module (MicroCoaster-Audio Player)
  const String MODULE_PASSWORD = "KKRBR8uOcijWdIxd3IbMU5BOF6kVFRIW"; // Mot de passe sécurisé pour authentification

  // ========================================
  // VARIABLES GLOBALES
  // ========================================

  // Client WebSocket pour communication avec le serveur
  WebSocketsClient webSocket;

  // Instance du lecteur audio
  Audio audio;

  // Variables de monitoring
  unsigned long uptimeStart = 0;   // Timestamp du démarrage pour calcul uptime
  bool isAuthenticated = false;     // État d'authentification avec le serveur

  // Variables audio
  String currentAudioFile = "";     // Fichier audio en cours de lecture
  bool isPlaying = false;           // État de lecture
  bool isPaused = false;            // État de pause
  int volumeLevel = 50;             // Niveau de volume (0-100)
  unsigned long playDelay = 0;      // Délai avant lecture en ms
  bool sdCardMounted = false;       // État de la carte SD

  // CONFIGURATION HARDWARE
  // ========================================

  // Pins I2S pour l'amplificateur MAX98357
  const int I2S_BCLK_PIN = 26;      // GPIO 26 - Bit Clock I2S
  const int I2S_LRC_PIN = 25;       // GPIO 25 - Word Select (WS) I2S
  const int I2S_DIN_PIN = 27;       // GPIO 27 - Data In I2S

  // Pins SPI pour la carte SD
  const int SD_CS_PIN = 5;          // GPIO 5 - Chip Select SD
  const int SD_MOSI_PIN = 23;       // GPIO 23 - Master Out Slave In
  const int SD_MISO_PIN = 19;       // GPIO 19 - Master In Slave Out
  const int SD_SCK_PIN = 18;        // GPIO 18 - Serial Clock

  // LED d'indication de statut
  const int STATUS_LED_PIN = 2;     // GPIO 2 - LED de statut audio

  // ========================================
  // FONCTIONS DE CONTRÔLE
  // ========================================

  // Déclarations des fonctions
  void connectSocket();
  void webSocketEvent(WStype_t type, uint8_t * payload, size_t length);
  void authenticateModule();
  void handleConnected(const char* payload);
  void handleCommand(const char* payload);
  void handlePing(const char* payload);
  void handleError(const char* payload);
  void sendCommandResponse(const String& command, const String& status, const String& message = "");
  void sendHeartbeat();
  void sendTelemetry();
void sendAudioStatusUpdate();
void sendAudioVolumeUpdate();
// void sendAudioUploadProgress(int progress); - SUPPRIMÉ
// void sendAudioUploadComplete(const String& filename); - SUPPRIMÉ
// void sendAudioUploadError(const String& error); - SUPPRIMÉ  // Fonctions audio
  bool initSDCard();
  bool initAudio();
  void scanAudioFiles();
  void analyzeMp3File(const String& filename);
  void analyzeWavFile(const String& filename);
  void sendAudioFileList();
  bool playAudioFile(const String& filename, unsigned long delay_ms = 0);
  void pauseAudio();
  void stopAudio();
  void setVolume(int volume);
  void updateStatusLED();

// Fonctions upload - SUPPRIMÉES
// void handleAudioUploadStart(const char* payload);
// void handleAudioUploadChunk(const char* payload);
// void handleAudioUploadEnd();
// String base64Decode(const String& input);  // ========================================
  // FONCTION DE DÉMARRAGE (SETUP)
  // ========================================

  void setup() {
    // Initialisation de la communication série pour debug
    Serial.begin(115200);
    Serial.println();
    Serial.println("=========================================");
    Serial.println("🚀 MicroCoaster - Audio v0.0.0");
    Serial.println("=========================================");
    Serial.println();

    // Enregistrement du timestamp de démarrage pour calcul uptime
    uptimeStart = millis();
    
    // *** CONFIGURATION DES PINS ***
    
    // Configuration de la LED de statut en sortie
    pinMode(STATUS_LED_PIN, OUTPUT);
    digitalWrite(STATUS_LED_PIN, LOW); // Éteint au démarrage
    
    Serial.println("[AUDIO] 📍 Configuration hardware...");
    Serial.println("   ├─ LED statut: GPIO " + String(STATUS_LED_PIN));
    Serial.println("   ├─ I2S BCLK: GPIO " + String(I2S_BCLK_PIN));
    Serial.println("   ├─ I2S LRC: GPIO " + String(I2S_LRC_PIN));
    Serial.println("   ├─ I2S DIN: GPIO " + String(I2S_DIN_PIN));
    Serial.println("   ├─ SD CS: GPIO " + String(SD_CS_PIN));
    Serial.println("   └─ SD SPI: MOSI=" + String(SD_MOSI_PIN) + ", MISO=" + String(SD_MISO_PIN) + ", SCK=" + String(SD_SCK_PIN));

    // *** INITIALISATION CARTE SD ***
    
    Serial.println("[AUDIO] 💾 Initialisation carte SD...");
    if (initSDCard()) {
      Serial.println("[AUDIO] ✅ Carte SD initialisée");
      scanAudioFiles();
    } else {
      Serial.println("[AUDIO] ❌ Échec initialisation carte SD");
    }

    // *** INITIALISATION AUDIO I2S ***
    
    Serial.println("[AUDIO] 🔊 Initialisation système audio...");
    if (initAudio()) {
      Serial.println("[AUDIO] ✅ Système audio initialisé");
      setVolume(volumeLevel);
    } else {
      Serial.println("[AUDIO] ❌ Échec initialisation système audio");
    }

    // *** CONFIGURATION DU GESTIONNAIRE WIFI ***
    
    // Configuration du point d'accès de secours (fallback)
    Serial.println("📡 Configuration du point d'accès de secours...");
    wifi.setAPCredentials(ESP_WIFI_SSID, ESP_WIFI_PASSWORD);
    Serial.print("   ├─ SSID: ");
    Serial.println(ESP_WIFI_SSID);
    Serial.print("   └─ Mot de passe: ");
    Serial.println(ESP_WIFI_PASSWORD);
    
    // Configuration des timeouts du portail captif
    Serial.println("⏱️  Configuration des timeouts...");
    wifi.setPortalTimeout(3600);     // 60 minutes (très long pour debug)
    wifi.setAPClientCheck(true);     // Ne pas fermer si des clients sont connectés
    wifi.setWebClientCheck(true);    // Chaque requête HTTP remet à zéro le timer
    Serial.println("   ├─ Timeout portail: 60 minutes");
    Serial.println("   ├─ Vérification clients: activée");
    Serial.println("   └─ Vérification requêtes web: activée");
    
    // Configuration avancée du portail captif
    Serial.println("🔧 Configuration avancée...");
    wifi.setCaptivePortal(true);      // Activer les redirections pour portail captif
    Serial.println("   ├─ Portail captif: activé");
    
    // Configuration hybride : première connexion + production
    wifi.setFallbackPolicy(AyresWiFiManager::FallbackPolicy::ON_FAIL);
    wifi.setAutoReconnect(true);      // Reconnexion automatique en cas de déconnexion
    Serial.println("   ├─ Politique de secours: ON_FAIL");
    Serial.println("   └─ Reconnexion automatique: activée");
    
    // Protection des fichiers critiques (empêche leur suppression accidentelle)
    wifi.setProtectedJsons({"/wifi.json"});  // Protège le fichier de configuration WiFi
    Serial.println("🛡️  Protection fichiers: /wifi.json");
    
    // ear*** INITIALISATION DU WIFI MANAGER ***
    
    Serial.println();
    Serial.println("🔄 Initialisation du WiFi Manager...");
    wifi.begin();  // Monte le système de fichiers, charge /wifi.json si présent
    Serial.println("💾 Système de fichiers LittleFS monté");
    Serial.println("📁 Recherche du fichier de configuration /wifi.json...");
    
    Serial.println("🌐 Tentative de connexion WiFi...");
    wifi.run();    // Essaie de se connecter en STA; si ça échoue, applique la politique de fallback
    
    // Vérification du statut après initialisation
    delay(2000); // Attendre un peu pour que la connexion se stabilise
    
    // *** VÉRIFICATION ÉTAT CONNEXION ***
    
    if (wifi.isConnected()) {
      Serial.println("✅ Connexion WiFi réussie !");
      Serial.println("📡 IP: " + WiFi.localIP().toString());
      Serial.println("🌐 Mode: Client WiFi (STA)");
      
      // Connexion WebSocket automatique après succès WiFi
      connectSocket();
    } else {
      Serial.println("⚠️  Connexion WiFi échouée");
      Serial.println("🔧 Ouverture du portail de configuration...");
      Serial.println("📡 Point d'accès: WifiManager-MicroCoaster");
      Serial.println("🌐 IP du portail: 192.168.4.1");
      Serial.println("🔗 Connectez-vous au WiFi puis allez sur http://192.168.4.1");
    }
    
    Serial.println();
    Serial.println("✅ Initialisation terminée !");
    Serial.println("=========================================");
  }

  // ========================================
  // BOUCLE PRINCIPALE (LOOP)
  // ========================================

  void loop() {
    // Mise à jour du gestionnaire WiFi (portail web, DNS, timeouts)
    wifi.update(); 
    
    // Variables statiques pour le monitoring périodique
    static unsigned long lastStatusCheck = 0;     // Dernier check de statut WiFi
    static unsigned long lastConnectionState = false; // Dernier état de connexion
    static unsigned long lastHeartbeat = 0;       // Dernier heartbeat envoyé
    static unsigned long lastTelemetry = 0;       // Dernière télémétrie envoyée
    unsigned long now = millis();                 // Timestamp actuel
    
    // *** MONITORING WIFI PÉRIODIQUE ***
    // Vérification du statut WiFi toutes les 15 secondes (plus fréquent)
    
    if (millis() - lastStatusCheck > 15000) {
      lastStatusCheck = millis();
      bool currentState = wifi.isConnected();
      
      // Affichage du statut de connexion
      if (currentState) {
        Serial.println("🟢 WiFi connecté - IP: " + WiFi.localIP().toString() + 
                      " | Signal: " + String(WiFi.RSSI()) + " dBm");
      } else {
        Serial.println("🔴 WiFi déconnecté - Portail de configuration actif sur 192.168.4.1");
      }
      
      // Détection des changements d'état WiFi pour actions automatiques
      if (currentState != lastConnectionState) {
        if (currentState) {
          Serial.println("🎉 Connexion WiFi établie !");
          // Reconnexion WebSocket automatique après retour WiFi
          connectSocket();
        } else {
          Serial.println("⚠️  Connexion WiFi perdue, basculement en mode portail...");
          // Reset de l'authentification et arrêt audio
          isAuthenticated = false;
          stopAudio();
          digitalWrite(STATUS_LED_PIN, LOW);
        }
        lastConnectionState = currentState;
      }
    }
    
    // *** GESTION AUDIO ***
    // Gestion des délais de lecture et mise à jour de l'état audio
    
    if (sdCardMounted && playDelay > 0 && millis() >= playDelay) {
      // Démarrer la lecture après le délai
      String filepath = "/" + currentAudioFile;
      Serial.println("[AUDIO] 🔄 Tentative de connexion à l'audio après délai...");
      if (audio.connecttoFS(SD, filepath.c_str())) {
        Serial.println("[AUDIO] ✅ Lecture démarrée après délai");
        Serial.println("[AUDIO] ▶️ Démarrage de la lecture...");
        isPlaying = true;
        updateStatusLED();
        sendAudioStatusUpdate();

        // Attendre un peu et vérifier l'état
        ::delay(100);
        Serial.printf("[AUDIO] 📊 État après délai - isPlaying: %s\n", isPlaying ? "true" : "false");
      } else {
        Serial.println("[AUDIO] ❌ Échec démarrage lecture après délai");
        currentAudioFile = "";
      }
      playDelay = 0;
    }
    
    // Mise à jour continue du système audio
    audio.loop();

    // Debug audio - vérifier l'état périodiquement
    static unsigned long lastAudioDebug = 0;
    if (millis() - lastAudioDebug > 2000) {  // Toutes les 2 secondes
      lastAudioDebug = millis();
      if (isPlaying) {
        Serial.println("[AUDIO] 🔊 Audio en cours - vérification...");
      }
    }
    
    // Mise à jour du client WebSocket (obligatoire pour traiter les messages)
    webSocket.loop();
    
    // Vérification de l'état de la connexion WebSocket
    static unsigned long lastWebSocketCheck = 0;
    if (millis() - lastWebSocketCheck > 10000) {  // Toutes les 10 secondes
      lastWebSocketCheck = millis();
      if (!webSocket.isConnected() && isAuthenticated) {
        Serial.println("[AUDIO] ⚠️  Connexion WebSocket perdue - Reset de l'authentification");
        isAuthenticated = false;
        digitalWrite(STATUS_LED_PIN, LOW);
        connectSocket();
      }
    }
    
    // Envoi périodique de heartbeat (keepalive) - toutes les 60 secondes (réduit pour éviter conflits)
    if (isAuthenticated && now - lastHeartbeat > 60000) {
      sendHeartbeat();
      lastHeartbeat = now;
    }
    
    // Envoi périodique de télémétrie - toutes les 10 secondes
    if (isAuthenticated && now - lastTelemetry > 10000) {
      sendTelemetry();
      lastTelemetry = now;
    }
    
    // Pause pour éviter la saturation CPU
    delay(100);
  }

  // ========================================
  // FONCTIONS DE COMMUNICATION WEBSOCKET
  // ========================================

  // Établit la connexion WebSocket avec le serveur (ws ou wss selon configuration)
  void connectSocket() {
    Serial.println("[WEBSOCKET] 🔗 Connexion WebSocket...");

    // Vérification préalable de la connexion WiFi
    if (!wifi.isConnected()) {
      Serial.println("[WEBSOCKET] ⚠️  WiFi non connecté - Annulation connexion WebSocket");
      return;
    }

    Serial.println("[WEBSOCKET] 📍 Module ID: " + MODULE_ID);
    Serial.println("[WEBSOCKET] 🔑 Password: " + MODULE_PASSWORD.substring(0, 8) + "...");

    // Configuration de la connexion WebSocket selon le flag SSL
    #if SERVER_USE_SSL
      Serial.println("[WEBSOCKET] 🔒 Mode: WSS (SSL/TLS activé)");
      if (strlen(server_fingerprint) > 0) {
        Serial.println("[WEBSOCKET] 🔐 Vérification empreinte SSL activée");
        webSocket.beginSSL(server_host, server_port, websocket_path, server_fingerprint);
      } else {
        Serial.println("[WEBSOCKET] ⚠️  Vérification empreinte SSL désactivée (non recommandé en production)");
        webSocket.beginSSL(server_host, server_port, websocket_path);
      }
      Serial.printf("[WEBSOCKET] 🤖 WebSocket: wss://%s:%d%s\n", server_host, server_port, websocket_path);
    #else
      Serial.println("[WEBSOCKET] 🔓 Mode: WS (plain, sans SSL)");
      webSocket.begin(server_host, server_port, websocket_path);
      Serial.printf("[WEBSOCKET] 🤖 WebSocket: ws://%s:%d%s\n", server_host, server_port, websocket_path);
    #endif

    webSocket.onEvent(webSocketEvent);           // Gestionnaire d'événements
    webSocket.setReconnectInterval(3000);        // Reconnexion automatique toutes les 3s (réduit)
    webSocket.enableHeartbeat(30000, 10000, 3);  // Heartbeat WebSocket: 30s interval, 10s timeout, 3 essais (plus long)

    Serial.println("[WEBSOCKET] ✅ ESP32 Audio prêt (Configuration optimisée)!");
  }

  void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
      case WStype_CONNECTED:
        Serial.println("[AUDIO] 🟢 Connecté au serveur WebSocket");
        authenticateModule();
        break;
        
      case WStype_DISCONNECTED:
        Serial.println("[AUDIO] 🔴 Déconnexion du serveur - Tentative de reconnexion immédiate");
        isAuthenticated = false;
        stopAudio();
        digitalWrite(STATUS_LED_PIN, LOW);
        // Tentative de reconnexion immédiate
        delay(1000);
        connectSocket();
        break;
        
      case WStype_TEXT: {
        Serial.println("[AUDIO] 📡 Message reçu: " + String((char*)payload));
        
        JsonDocument doc;
        deserializeJson(doc, (char*)payload);
        
        String msgType = doc["type"].as<String>();
        
        if (msgType == "connected") {
          handleConnected((char*)payload);
        } else if (msgType == "ping") {
          handlePing((char*)payload);
        } else if (msgType == "command") {
          handleCommand((char*)payload);
        } else if (msgType == "error") {
          handleError((char*)payload);
        } else {
          Serial.println("[AUDIO] ⚠️ Événement non géré: '" + msgType + "'");
          Serial.println("[AUDIO] 🔍 Message complet: " + String((char*)payload));
        }
        break;
      }
      
      default:
        break;
    }
  }

  void authenticateModule() {
    Serial.println("[AUDIO] 🔐 Authentification WebSocket natif...");
    
    // Format WebSocket natif
    JsonDocument authData;
    authData["type"] = "module_identify";
    authData["moduleId"] = MODULE_ID;
    authData["password"] = MODULE_PASSWORD;
    authData["moduleType"] = "audio-player";
    authData["uptime"] = millis() - uptimeStart;
    authData["isPlaying"] = isPlaying;
    authData["isPaused"] = isPaused;
    authData["currentFile"] = currentAudioFile;
    authData["volume"] = volumeLevel;
    authData["sdCardMounted"] = sdCardMounted;
    
    String authMessage;
    serializeJson(authData, authMessage);
    webSocket.sendTXT(authMessage);
    
    Serial.println("[AUDIO] 📤 Authentification envoyée: " + authMessage);
  }

  void handleConnected(const char* payload) {
    Serial.println("[AUDIO] ✅ Module authentifié WebSocket natif");
    
    isAuthenticated = true;
    updateStatusLED();
    
    // Envoyer la liste des fichiers audio disponibles
    sendAudioFileList();
    
    // Envoyer télémétrie initiale
    delay(1000);
    sendTelemetry();
  }

  void handleCommand(const char* payload) {
    if (!isAuthenticated) {
      Serial.println("[AUDIO] ⚠️ Commande refusée - non authentifié");
      return;
    }
    
    // Parse du JSON WebSocket natif
    JsonDocument doc;
    deserializeJson(doc, payload);
    
    String command = doc["data"]["command"];
    Serial.println("[AUDIO] 🎮 Commande reçue: " + command);
    
    String status = "success";
    String message = "";
    
    // Traitement des commandes audio
    if (command == "audio_list_request") {
      sendAudioFileList();
      
    } else if (command == "audio_play") {
      if (!doc["data"]["params"]["filename"].is<String>()) {
        Serial.println("[AUDIO] ❌ Filename manquant ou invalide");
        status = "error";
        message = "Nom de fichier manquant";
      } else {
        String filename = doc["data"]["params"]["filename"];
        Serial.println("[AUDIO] 📁 Filename reçu: '" + filename + "'");
        unsigned long delay_ms = doc["data"]["params"]["delay"].is<unsigned long>() ? doc["data"]["params"]["delay"].as<unsigned long>() : 0;
        if (filename.length() == 0) {
          Serial.println("[AUDIO] ❌ Filename vide");
          status = "error";
          message = "Nom de fichier vide";
        } else if (playAudioFile(filename, delay_ms)) {
          message = "Lecture démarrée: " + filename;
        } else {
          status = "error";
          message = "Erreur lors de la lecture: " + filename;
        }
      }
      
    } else if (command == "audio_pause") {
      pauseAudio();
      message = "Lecture mise en pause";
      
    } else if (command == "audio_stop") {
      stopAudio();
      message = "Lecture arrêtée";
      
    } else if (command == "audio_volume") {
      if (!doc["data"]["params"]["level"].is<int>()) {
        Serial.println("[AUDIO] ❌ Level de volume manquant ou invalide");
        status = "error";
        message = "Niveau de volume manquant";
      } else {
        int level = doc["data"]["params"]["level"];
        setVolume(level);
        message = "Volume réglé à " + String(level) + "%";
      }
      
    // Commandes upload supprimées - fichiers directement sur SD
    // } else if (command == "audio_upload_start") {
    //   handleAudioUploadStart(payload);
    //   return; // Ne pas envoyer de réponse pour l'upload
      
    // } else if (command == "audio_upload_chunk") {
    //   handleAudioUploadChunk(payload);
    //   return; // Ne pas envoyer de réponse pour l'upload
      
    // } else if (command == "audio_upload_end") {
    //   handleAudioUploadEnd();
    //   return; // Ne pas envoyer de réponse pour l'upload
      
    } else {
      Serial.println("[AUDIO] ❌ Commande inconnue: " + command);
      status = "unknown_command";
      message = "Commande inconnue: " + command;
    }

    updateStatusLED();
    
    // Envoyer la réponse de commande
    sendCommandResponse(command, status, message);
    
    Serial.println("[AUDIO] ✅ Commande exécutée: " + message);
  }

  void handlePing(const char* payload) {
    Serial.println("[AUDIO] 🏓 Ping reçu du serveur - Envoi du pong");

    // Parse du ping pour récupérer le timestamp
    JsonDocument doc;
    deserializeJson(doc, payload);

    // Répondre avec un pong contenant le même timestamp
    JsonDocument pongDoc;
    pongDoc["type"] = "pong";
    pongDoc["moduleId"] = MODULE_ID;
    pongDoc["password"] = MODULE_PASSWORD;
    pongDoc["timestamp"] = doc["timestamp"];

    String pongMessage;
    serializeJson(pongDoc, pongMessage);
    webSocket.sendTXT(pongMessage);

    Serial.println("[AUDIO] 🏓 Pong envoyé: " + pongMessage);
  }

  void handleError(const char* payload) {
    Serial.println("[AUDIO] ❌ Erreur reçue du serveur");
    
    isAuthenticated = false;
    stopAudio();
    digitalWrite(STATUS_LED_PIN, LOW);
  }

  void updateStatusLED() {
    if (isPlaying && isAuthenticated) {
      digitalWrite(STATUS_LED_PIN, HIGH); // LED allumée pendant la lecture
    } else {
      digitalWrite(STATUS_LED_PIN, LOW);  // LED éteinte sinon
    }
  }

  // ========================================
  // FONCTIONS AUDIO
  // ========================================

  bool initSDCard() {
    Serial.println("[AUDIO] 💾 Initialisation SD card...");
    
    // Configuration des pins SPI pour la SD
    SPI.begin(SD_SCK_PIN, SD_MISO_PIN, SD_MOSI_PIN);
    
    if (!SD.begin(SD_CS_PIN)) {
      Serial.println("[AUDIO] ❌ Échec montage SD");
      sdCardMounted = false;
      return false;
    }
    
    // Vérifier si la carte est accessible
    uint8_t cardType = SD.cardType();
    if (cardType == CARD_NONE) {
      Serial.println("[AUDIO] ❌ Aucune carte SD détectée");
      SD.end();
      sdCardMounted = false;
      return false;
    }
    
    // Afficher les informations de la carte
    uint64_t cardSize = SD.cardSize() / (1024 * 1024);
    Serial.printf("[AUDIO] ✅ Carte SD détectée - Taille: %llu MB\n", cardSize);
    
    sdCardMounted = true;
    return true;
  }

  bool initAudio() {
    Serial.println("[AUDIO] 🔊 Initialisation système audio I2S...");

    // Configuration I2S pour MAX98357 avec paramètres optimaux
    audio.setPinout(I2S_BCLK_PIN, I2S_LRC_PIN, I2S_DIN_PIN);

    // MAX98357 ne nécessite pas de MCLK - laisser par défaut (pas de pin MCLK)

    // Volume initial (0-100 vers 0-63 pour meilleure résolution)
    int initialAudioVolume = map(volumeLevel, 0, 100, 0, 63);
    audio.setVolume(initialAudioVolume);

    Serial.printf("[AUDIO] ✅ Système audio I2S configuré - Volume initial: %d%% (audio: %d/63)\n", volumeLevel, initialAudioVolume);
    Serial.println("[AUDIO] 📊 Configuration: Pas de MCLK (MAX98357)");
    return true;
  }

  void scanAudioFiles() {
    if (!sdCardMounted) {
      Serial.println("[AUDIO] ⚠️ Scan annulé - SD non montée");
      return;
    }

    Serial.println("[AUDIO] 🔍 Scan des fichiers audio...");

    File root = SD.open("/");
    if (!root) {
      Serial.println("[AUDIO] ❌ Impossible d'ouvrir le répertoire racine");
      return;
    }

    File file = root.openNextFile();
    int audioCount = 0;

    while (file) {
      if (!file.isDirectory()) {
        String filename = file.name();
        if (filename.endsWith(".mp3") || filename.endsWith(".MP3") ||
            filename.endsWith(".wav") || filename.endsWith(".WAV")) {
          Serial.println("[AUDIO] 📁 Fichier audio trouvé: " + filename);

          // Analyser les propriétés du fichier selon le type
          if (filename.endsWith(".mp3") || filename.endsWith(".MP3")) {
            analyzeMp3File(filename);
          } else if (filename.endsWith(".wav") || filename.endsWith(".WAV")) {
            analyzeWavFile(filename);
          }

          audioCount++;
        }
      }
      file = root.openNextFile();
    }

    Serial.printf("[AUDIO] ✅ Scan terminé - %d fichiers audio trouvés\n", audioCount);

    // Conseils pour la qualité audio
    if (audioCount > 0) {
      Serial.println("[AUDIO] 💡 Conseils qualité audio:");
      Serial.println("   ├─ MP3: Utilisez des MP3 encodés en haute qualité (320kbps)");
      Serial.println("   ├─ WAV: 16-bit PCM, 44.1kHz ou 48kHz recommandés");
      Serial.println("   ├─ Privilégiez les fichiers stéréo");
      Serial.println("   └─ Vérifiez l'alimentation stable pour éviter le bruit");
    }
  }

  void analyzeWavFile(const String& filename) {
    File wavFile = SD.open("/" + filename, FILE_READ);
    if (!wavFile) {
      Serial.println("[AUDIO] ⚠️ Impossible d'analyser: " + filename);
      return;
    }

    // Lire l'en-tête WAV (44 octets)
    uint8_t header[44];
    if (wavFile.read(header, 44) != 44) {
      Serial.println("[AUDIO] ⚠️ En-tête WAV invalide: " + filename);
      wavFile.close();
      return;
    }

    // Vérifier le format WAV
    if (header[0] != 'R' || header[1] != 'I' || header[2] != 'F' || header[3] != 'F') {
      Serial.println("[AUDIO] ⚠️ Pas un fichier WAV valide: " + filename);
      wavFile.close();
      return;
    }

    // Extraire les informations importantes
    uint32_t sampleRate = (header[24] | (header[25] << 8) | (header[26] << 16) | (header[27] << 24));
    uint16_t bitsPerSample = (header[34] | (header[35] << 8));
    uint16_t numChannels = (header[22] | (header[23] << 8));

    Serial.printf("[AUDIO] 📊 %s: %dHz, %d-bit, %d canal(s)\n",
                 filename.c_str(), sampleRate, bitsPerSample, numChannels);

    // Vérifications de qualité
    if (bitsPerSample != 16) {
      Serial.println("[AUDIO] ⚠️ Recommandé: 16-bit PCM pour une meilleure qualité");
    }
    if (sampleRate < 44100) {
      Serial.println("[AUDIO] ⚠️ Faible fréquence d'échantillonnage détectée");
    }
    if (numChannels != 2) {
      Serial.println("[AUDIO] ℹ️ Fichier mono détecté (stéréo recommandé)");
    }

    wavFile.close();
  }

  void analyzeMp3File(const String& filename) {
    File mp3File = SD.open("/" + filename, FILE_READ);
    if (!mp3File) {
      Serial.println("[AUDIO] ⚠️ Impossible d'analyser: " + filename);
      return;
    }

    // Lire l'en-tête MP3 (premiers 10 octets pour vérifier le format)
    uint8_t header[10];
    if (mp3File.read(header, 10) != 10) {
      Serial.println("[AUDIO] ⚠️ En-tête MP3 invalide: " + filename);
      mp3File.close();
      return;
    }

    // Vérifier si c'est un fichier MP3 valide (commence par ID3 ou frame sync)
    bool isValidMp3 = false;
    if (header[0] == 'I' && header[1] == 'D' && header[2] == '3') {
      // Fichier avec tag ID3
      isValidMp3 = true;
      Serial.println("[AUDIO] 📊 " + filename + ": MP3 avec tag ID3 détecté");
    } else if ((header[0] & 0xFF) == 0xFF && (header[1] & 0xE0) == 0xE0) {
      // Frame sync MP3 direct
      isValidMp3 = true;
      Serial.println("[AUDIO] 📊 " + filename + ": MP3 sans tag ID3 détecté");
    }

    if (!isValidMp3) {
      Serial.println("[AUDIO] ⚠️ Format MP3 non reconnu: " + filename);
    }

    // Obtenir la taille du fichier
    uint32_t fileSize = mp3File.size();
    Serial.printf("[AUDIO] 📊 Taille: %d bytes\n", fileSize);

    mp3File.close();
  }

  void sendAudioFileList() {
    if (!isAuthenticated || !sdCardMounted) {
      Serial.println("[AUDIO] ⚠️ Envoi liste annulé - non authentifié ou SD non montée");
      return;
    }
    
    Serial.println("[AUDIO] 📤 Envoi liste des fichiers audio...");
    
    JsonDocument doc;
    doc["type"] = "audio_list_response";
    doc["moduleId"] = MODULE_ID;
    doc["password"] = MODULE_PASSWORD;
    
    JsonArray files = doc["files"].to<JsonArray>();
    
    File root = SD.open("/");
    if (root) {
      File file = root.openNextFile();
      while (file) {
        if (!file.isDirectory()) {
          String filename = file.name();
          if (filename.endsWith(".mp3") || filename.endsWith(".MP3") ||
              filename.endsWith(".wav") || filename.endsWith(".WAV")) {
            files.add(filename);
          }
        }
        file = root.openNextFile();
      }
    }
    
    String message;
    serializeJson(doc, message);
    webSocket.sendTXT(message);
    
    Serial.printf("[AUDIO] 📤 Liste envoyée - %d fichiers\n", files.size());
  }

  bool playAudioFile(const String& filename, unsigned long delay_ms) {
    if (!sdCardMounted) {
      Serial.println("[AUDIO] ❌ Lecture annulée - SD non montée");
      return false;
    }

    // Arrêter la lecture en cours si nécessaire
    if (isPlaying) {
      stopAudio();
    }

    String filepath = "/" + filename;
    Serial.println("[AUDIO] 🎵 Démarrage lecture: " + filepath);

    if (delay_ms > 0) {
      Serial.printf("[AUDIO] ⏱️ Délai avant lecture: %lu ms\n", delay_ms);
      playDelay = millis() + delay_ms;
      currentAudioFile = filename;
      return true;
    }

    // Démarrer la lecture immédiatement
    Serial.println("[AUDIO] 🔄 Tentative de connexion à l'audio...");
    if (audio.connecttoFS(SD, filepath.c_str())) {
      Serial.println("[AUDIO] ✅ Connexion audio réussie");
      Serial.println("[AUDIO] ▶️ Démarrage de la lecture...");
      isPlaying = true;
      isPaused = false;
      currentAudioFile = filename;
      sendAudioStatusUpdate();

      // Attendre un peu et vérifier l'état
      ::delay(100);
      Serial.printf("[AUDIO] 📊 État après connexion - isPlaying: %s\n", isPlaying ? "true" : "false");

      return true;
    } else {
      Serial.println("[AUDIO] ❌ Échec connexion audio");
      Serial.println("[AUDIO] 🔍 Vérifiez que le fichier existe et est au bon format");
      return false;
    }
  }

  void pauseAudio() {
    if (!isPlaying) return;
    
    Serial.println("[AUDIO] ⏸️ Mise en pause");
    audio.pauseResume();
    isPlaying = false;
    isPaused = true;
    sendAudioStatusUpdate();
  }

  void stopAudio() {
    if (!isPlaying && currentAudioFile == "") return;
    
    Serial.println("[AUDIO] 🛑 Arrêt lecture");
    audio.stopSong();
    isPlaying = false;
    isPaused = false;
    currentAudioFile = "";
    playDelay = 0;
    sendAudioStatusUpdate();
  }

  void setVolume(int volume) {
    volumeLevel = constrain(volume, 0, 100);
    // Convertir 0-100 vers 0-63 pour une meilleure résolution de volume
    int audioVolume = map(volumeLevel, 0, 100, 0, 63);
    audio.setVolume(audioVolume);
    Serial.printf("[AUDIO] 🔊 Volume réglé à %d%% (audio: %d/63)\n", volumeLevel, audioVolume);

    // Envoyer la mise à jour du volume
    sendAudioVolumeUpdate();
  }

// ========================================
// FONCTIONS UPLOAD - SUPPRIMÉES
// ========================================

// Toutes les fonctions d'upload ont été supprimées
// Les fichiers audio sont maintenant directement sur la carte SD  // Fonctions WebSocket natif
  void sendCommandResponse(const String& command, const String& status, const String& message) {
    if (!isAuthenticated) return;
    
    JsonDocument doc;
    doc["type"] = "command_response";
    doc["moduleId"] = MODULE_ID;
    doc["password"] = MODULE_PASSWORD;
    doc["command"] = command;
    doc["status"] = status;
    doc["message"] = message;
    
    String responseMessage;
    serializeJson(doc, responseMessage);
    webSocket.sendTXT(responseMessage);
    
    Serial.printf("[AUDIO] 📤 Réponse: %s -> %s\n", command.c_str(), status.c_str());
  }

  void sendHeartbeat() {
    if (!isAuthenticated) return;

    // Vérification de la mémoire disponible
    uint32_t freeHeap = ESP.getFreeHeap();
    Serial.printf("[AUDIO] 💾 Mémoire libre: %d bytes\n", freeHeap);

    // Alerte si mémoire faible
    if (freeHeap < 50000) {  // Moins de 50KB libre
      Serial.println("[AUDIO] ⚠️  Mémoire faible détectée !");
    }

    JsonDocument doc;
    doc["type"] = "heartbeat";
    doc["moduleId"] = MODULE_ID;
    doc["password"] = MODULE_PASSWORD;
    doc["uptime"] = millis() - uptimeStart;
    doc["isPlaying"] = isPlaying;
    doc["isPaused"] = isPaused;
    doc["currentFile"] = currentAudioFile;
    doc["volume"] = volumeLevel;
    doc["sdCardMounted"] = sdCardMounted;
    doc["wifiRSSI"] = WiFi.RSSI();
    doc["freeHeap"] = freeHeap;

    String message;
    serializeJson(doc, message);
    webSocket.sendTXT(message);

    Serial.println("[AUDIO] 💓 Heartbeat envoyé");
  }void sendTelemetry() {
    if (!isAuthenticated) return;
    
    JsonDocument doc;
    doc["type"] = "telemetry";
    doc["moduleId"] = MODULE_ID;
    doc["password"] = MODULE_PASSWORD;
    doc["uptime"] = millis() - uptimeStart;
    doc["isPlaying"] = isPlaying;
    doc["isPaused"] = isPaused;
    doc["currentFile"] = currentAudioFile;
    doc["volume"] = volumeLevel;
    doc["sdCardMounted"] = sdCardMounted;
    doc["status"] = "operational";
    
    String message;
    serializeJson(doc, message);
    webSocket.sendTXT(message);
    
    Serial.println("[AUDIO] 📊 Télémétrie envoyée");
  }

  void sendAudioStatusUpdate() {
    if (!isAuthenticated) return;
    
    JsonDocument doc;
    doc["type"] = "audio_status_update";
    doc["moduleId"] = MODULE_ID;
    doc["password"] = MODULE_PASSWORD;
    doc["playing"] = isPlaying;
    doc["paused"] = isPaused;
    doc["stopped"] = !isPlaying && !isPaused;
    doc["current_file"] = currentAudioFile;
    
    String message;
    serializeJson(doc, message);
    webSocket.sendTXT(message);
    
    Serial.println("[AUDIO] 📊 Statut audio mis à jour");
  }

  void sendAudioVolumeUpdate() {
    if (!isAuthenticated) return;
    
    JsonDocument doc;
    doc["type"] = "audio_volume_update";
    doc["moduleId"] = MODULE_ID;
    doc["password"] = MODULE_PASSWORD;
    doc["volume"] = volumeLevel;
    
    String message;
    serializeJson(doc, message);
    webSocket.sendTXT(message);
    
    Serial.println("[AUDIO] 📊 Volume mis à jour");
  }