
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
#include <Audio.h>            // Bibliothèque audio ESP32-audioI2S pour MP3
#include <freertos/FreeRTOS.h> // Système d'exploitation temps réel
#include <freertos/task.h>     // Gestion des tâches
#include <freertos/queue.h>    // Files d'attente inter-tâches
#include <freertos/semphr.h>   // Sémaphores et mutex  // ========================================
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
int delayedVolume = 50;           // Volume pour lectures différées
float delayedStartSeconds = 0.0;  // Position de départ pour lectures différées
unsigned long playDelay = 0;      // Délai avant lecture en ms
bool isDelayedTimeline = false;   // Flag pour savoir si c'est une timeline différée
unsigned long delayedTimelineDuration = 0; // Durée pour timeline différée
bool sdCardMounted = false;       // État de la carte SD

// Variables pour la timeline
unsigned long timelineStartTime = 0;      // Timestamp de début de la timeline
unsigned long timelineDuration = 0;       // Durée de lecture en ms
bool isTimelinePlaying = false;           // Flag pour mode timeline (basé sur paramètres)

// ========================================
// STRUCTURE DE PARAMÈTRES AUDIO UNIFIÉS
// ========================================

/**
 * Structure unifiée pour tous les paramètres audio
 * Remplace la séparation artificielle audio_play vs audio_timeline_play
 */
struct AudioParams {
  String filename;
  unsigned long delay_ms = 0;
  int volume = -1;              // -1 = utiliser volume global
  float start_seconds = 0.0;    // Position de départ dans le fichier
  unsigned long duration_ms = 0; // Durée de lecture (0 = jusqu'à la fin)
  bool timeline_mode = false;   // Mode timeline auto-détecté
  
  // Constructeur par défaut
  AudioParams() {}
  
  // Constructeur avec paramètres
  AudioParams(String f, unsigned long d = 0, int v = -1, float ss = 0.0, unsigned long dur = 0)
    : filename(f), delay_ms(d), volume(v), start_seconds(ss), duration_ms(dur) {
    // Auto-détection du mode timeline
    timeline_mode = (start_seconds > 0.0 || duration_ms > 0);
  }
};

// Configuration persistante
const String CONFIG_FILE = "/audio.json";  // CONFIGURATION DANS L'ESP32 (LittleFS) - comme wifi.json

// ========================================
// VARIABLES FREERTOS
// ========================================

// Structure pour les commandes audio
typedef struct {
  String command;           // Type de commande (play, pause, stop, volume)
  AudioParams params;       // Paramètres audio pour play
  int volumeLevel;          // Volume pour volume change
  String responseId;        // ID pour la réponse
} AudioCommand;

// Queue pour envoyer des commandes audio (taille 10 pour gérer le spam)
QueueHandle_t audioQueue = NULL;

// Mutex pour protéger les variables audio partagées
SemaphoreHandle_t audioMutex = NULL;

// Variables pour les tâches
volatile bool isAudioProcessing = false;  // Indique si l'audio est en traitement
TaskHandle_t audioTaskHandle = NULL;
TaskHandle_t websocketTaskHandle = NULL;
  // ========================================

  // Pins I2S pour l'amplificateur MAX98357
  const int I2S_BCLK_PIN = 26;      // GPIO 26 - Bit Clock I2S
  const int I2S_LRC_PIN = 25;       // GPIO 25 - Word Select (WS) I2S
  const int I2S_DIN_PIN = 22;       // GPIO 22 - Data In I2S

  // Pins SPI pour la carte SD2
  const int SD_CS_PIN = 13;          // GPIO 13 - Chip Select SD
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
// void sendAudioUploadError(const String& error); - SUPPRIMÉ

// Tâches FreeRTOS
void audioTask(void* parameter);
void websocketTask(void* parameter);

// Fonctions audio
  bool initSDCard();
  bool initAudio();
  void scanAudioFiles();
  void analyzeMp3File(const String& filename);
  void sendAudioFileList();
  bool playAudio(const AudioParams& params);  // FONCTION UNIFIÉE - REMPLACE playAudioFile et playTimelineAudio
  void pauseAudio();
  void resumeAudio();
  void stopAudio();
  void setVolume(int volume);
  void updateStatusLED();

// Fonctions timeline et configuration (MAINTENUES POUR COMPATIBILITÉ)
bool playTimelineAudio(const String& filename, unsigned long start_time_ms, unsigned long duration_ms, unsigned long delay_ms, float start_seconds = 0.0);
void saveAudioConfig();
void loadAudioConfig();
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

    // *** INITIALISATION FREERTOS ***
    
    Serial.println("🧵 Initialisation FreeRTOS...");
    
    // Créer le mutex pour protéger les variables audio partagées
    audioMutex = xSemaphoreCreateMutex();
    if (audioMutex == NULL) {
      Serial.println("❌ Échec création du mutex");
      ESP.restart();
    }
    Serial.println("   ✅ Mutex créé");
    
    // Créer la queue pour les commandes audio (taille 10)
    audioQueue = xQueueCreate(10, sizeof(AudioCommand));
    if (audioQueue == NULL) {
      Serial.println("❌ Échec création de la queue");
      ESP.restart();
    }
    Serial.println("   ✅ Queue créée (taille 10)");
    
    // Créer la tâche audio (haute priorité pour réactivité)
    xTaskCreatePinnedToCore(
      audioTask,           // Fonction de la tâche
      "AudioTask",         // Nom de la tâche
      8192,                // Taille de la pile (8KB pour audio)
      NULL,                // Paramètre
      2,                   // Priorité (2 = haute)
      &audioTaskHandle,    // Handle de la tâche
      0                    // Core 0
    );
    Serial.println("   ✅ Tâche audio créée (Core 0, priorité 2)");
    
    // Créer la tâche WebSocket (priorité moyenne)
    xTaskCreatePinnedToCore(
      websocketTask,       // Fonction de la tâche
      "WebSocketTask",     // Nom de la tâche
      8192,                // Taille de la pile (8KB pour JSON)
      NULL,                // Paramètre
      1,                   // Priorité (1 = moyenne)
      &websocketTaskHandle,// Handle de la tâche
      1                    // Core 1
    );
    Serial.println("   ✅ Tâche WebSocket créée (Core 1, priorité 1)");
    
    Serial.println("✅ FreeRTOS initialisé avec succès\n");

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
    wifi.setProtectedJsons({"/wifi.json", "/audio.json"});  // Protège les fichiers de configuration WiFi et Audio
    Serial.println("🛡️  Protection fichiers: /wifi.json, /audio.json");
    
    // ear*** INITIALISATION DU WIFI MANAGER ***
    
    Serial.println();
    Serial.println("🔄 Initialisation du WiFi Manager...");
    wifi.begin();  // Monte le système de fichiers, charge /wifi.json si présent
    Serial.println("💾 Système de fichiers LittleFS monté");
    Serial.println("📁 Recherche du fichier de configuration /wifi.json...");
    
    // Charger la configuration audio sauvegardée dans ESP32
    loadAudioConfig();
    
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
    // C'est le seul traitement dans loop() car FreeRTOS gère le reste
    wifi.update();
    
    // Petit délai pour ne pas saturer le CPU
    vTaskDelay(pdMS_TO_TICKS(100));
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
    
    // Traitement des commandes immédiates (sans queue)
    if (command == "audio_list_request") {
      sendAudioFileList();
      return;
    }
    
    // Créer la structure de commande pour la queue
    AudioCommand cmd;
    cmd.responseId = command;
    
    // Traitement des commandes audio via queue (non-bloquant)
    if (command == "audio_play") {
      if (!doc["data"]["filename"].is<String>()) {
        Serial.println("[AUDIO] ❌ Filename manquant ou invalide");
        sendCommandResponse(command, "error", "Nom de fichier manquant");
        return;
      }
      
      String filename = doc["data"]["filename"];
      unsigned long delay_ms = doc["data"]["delay"].is<unsigned long>() ? doc["data"]["delay"].as<unsigned long>() : 0;
      int volume = doc["data"]["volume"].is<int>() ? doc["data"]["volume"].as<int>() : volumeLevel;
      float start_seconds = doc["data"]["start_seconds"].is<float>() ? doc["data"]["start_seconds"].as<float>() : 0.0;
      unsigned long duration_ms = doc["data"]["duration"].is<unsigned long>() ? doc["data"]["duration"].as<unsigned long>() : 0;
      
      cmd.command = "play";
      cmd.params = AudioParams(filename, delay_ms, volume, start_seconds, duration_ms);
      
    } else if (command == "audio_pause" || command == "timeline_pause") {
      cmd.command = "pause";
      
    } else if (command == "audio_stop" || command == "timeline_stop") {
      cmd.command = "stop";
      
    } else if (command == "timeline_resume") {
      cmd.command = "resume";
      
    } else if (command == "audio_volume") {
      if (!doc["data"]["level"].is<int>()) {
        Serial.println("[AUDIO] ❌ Level de volume manquant ou invalide");
        sendCommandResponse(command, "error", "Niveau de volume manquant");
        return;
      }
      cmd.command = "volume";
      cmd.volumeLevel = doc["data"]["level"];
      
    } else if (command == "audio_timeline_play") {
      // COMMANDE DÉPRÉCIÉE - Rediriger vers play unifié
      if (!doc["data"]["filename"].is<String>()) {
        Serial.println("[AUDIO] ❌ Filename manquant ou invalide");
        sendCommandResponse(command, "error", "Nom de fichier manquant");
        return;
      }
      
      String filename = doc["data"]["filename"];
      unsigned long delay_ms = doc["data"]["delay_ms"].is<unsigned long>() ? doc["data"]["delay_ms"].as<unsigned long>() : 0;
      float start_seconds = doc["data"]["start_seconds"].is<float>() ? doc["data"]["start_seconds"].as<float>() : 0.0;
      unsigned long duration_ms = doc["data"]["duration_ms"].is<unsigned long>() ? doc["data"]["duration_ms"].as<unsigned long>() : 0;
      
      cmd.command = "play";
      cmd.params = AudioParams(filename, delay_ms, volumeLevel, start_seconds, duration_ms);
      cmd.params.timeline_mode = true;  // Forcer le mode timeline
      
    } else {
      Serial.println("[AUDIO] ❌ Commande inconnue: " + command);
      sendCommandResponse(command, "unknown_command", "Commande inconnue: " + command);
      return;
    }
    
    // Envoyer la commande à la queue (timeout 100ms)
    if (xQueueSend(audioQueue, &cmd, pdMS_TO_TICKS(100)) == pdTRUE) {
      Serial.println("[AUDIO] ✅ Commande ajoutée à la queue: " + cmd.command);
    } else {
      Serial.println("[AUDIO] ⚠️  Queue pleine, commande ignorée");
      sendCommandResponse(command, "error", "Queue audio pleine, réessayez");
    }
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
        if (filename.endsWith(".mp3") || filename.endsWith(".MP3")) {
          Serial.println("[AUDIO] 📁 Fichier audio trouvé: " + filename);

          // Analyser les propriétés du fichier selon le type
          if (filename.endsWith(".mp3") || filename.endsWith(".MP3")) {
            analyzeMp3File(filename);
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
      Serial.println("   ├─ Privilégiez les fichiers stéréo");
      Serial.println("   └─ Vérifiez l'alimentation stable pour éviter le bruit");
    }
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
      // Fichier avec tag ID3 - chercher le premier frame MP3
      isValidMp3 = true;
      Serial.println("[AUDIO] 📊 " + filename + ": MP3 avec tag ID3 détecté");

      // Sauter le tag ID3 pour trouver le premier frame
      uint8_t id3Header[10];
      if (mp3File.read(id3Header, 6) == 6) {
        // Calculer la taille du tag ID3 (bytes 6-9, big-endian, synchsafe)
        uint32_t id3Size = ((id3Header[0] & 0x7F) << 21) |
                          ((id3Header[1] & 0x7F) << 14) |
                          ((id3Header[2] & 0x7F) << 7) |
                          (id3Header[3] & 0x7F);
        mp3File.seek(id3Size + 10); // +10 pour l'en-tête ID3
      }

      // Lire le premier frame MP3
      if (mp3File.read(header, 4) != 4) {
        Serial.println("[AUDIO] ⚠️ Impossible de lire le premier frame MP3");
        mp3File.close();
        return;
      }
    } else if ((header[0] & 0xFF) == 0xFF && (header[1] & 0xE0) == 0xE0) {
      // Frame sync MP3 direct
      isValidMp3 = true;
      Serial.println("[AUDIO] 📊 " + filename + ": MP3 sans tag ID3 détecté");
    }

    if (!isValidMp3) {
      Serial.println("[AUDIO] ⚠️ Format MP3 non reconnu: " + filename);
      mp3File.close();
      return;
    }

    // Analyser le frame MP3 pour extraire le bitrate
    if ((header[0] & 0xFF) == 0xFF && (header[1] & 0xE0) == 0xE0) {
      // Extraire les informations du frame MP3
      uint8_t version = (header[1] >> 3) & 0x03;
      uint8_t layer = (header[1] >> 1) & 0x03;
      uint8_t bitrateIndex = (header[2] >> 4) & 0x0F;

      // Table des bitrates MP3 (kbps)
      const uint16_t bitrateTable[16] = {0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0};

      if (bitrateIndex > 0 && bitrateIndex < 15) {
        uint16_t bitrate = bitrateTable[bitrateIndex];
        uint32_t bytesPerSecond = (bitrate * 1000) / 8; // Convertir kbps en octets/seconde

        Serial.printf("[AUDIO] 📊 %s: MP3 %dkbps (%d octets/sec)\n",
                     filename.c_str(), bitrate, bytesPerSecond);

        // Stocker le bitrate pour utilisation future
        if (filename.endsWith(".mp3") || filename.endsWith(".MP3")) {
          // Ici on pourrait stocker dans une map ou structure globale
          // Pour l'instant, juste afficher l'info
        }
      } else {
        Serial.println("[AUDIO] ⚠️ Bitrate MP3 invalide détecté");
      }
    }

    // Obtenir la taille du fichier
    uint32_t fileSize = mp3File.size();
    Serial.printf("[AUDIO] 📊 Taille: %d bytes\n", fileSize);

    mp3File.close();
  }

  /**
   * Calcule le taux d'octets par seconde pour un fichier audio
   * Analyse le fichier pour déterminer le bitrate réel (MP3)
   */
  float getBytesPerSecond(const String& filename) {
    if (filename.endsWith(".mp3") || filename.endsWith(".MP3")) {
      // Analyser le bitrate réel du fichier MP3
      File mp3File = SD.open("/" + filename, FILE_READ);
      if (!mp3File) {
        Serial.println("[AUDIO] ⚠️ Impossible d'analyser bitrate MP3, utilisation valeur par défaut");
        return 24000.0; // Valeur par défaut plus réaliste (192kbps)
      }

      // Chercher le premier frame MP3
      uint8_t header[4];
      bool foundFrame = false;
      uint32_t fileSize = mp3File.size();

      // Limiter la recherche aux premiers 10KB pour éviter les scans trop longs
      for (uint32_t pos = 0; pos < min(fileSize, (uint32_t)10240) && !foundFrame; pos++) {
        if (mp3File.read(header, 4) != 4) break;

        if ((header[0] & 0xFF) == 0xFF && (header[1] & 0xE0) == 0xE0) {
          foundFrame = true;
        } else {
          // Reculer d'un octet pour le prochain test
          mp3File.seek(pos + 1);
        }
      }

      if (foundFrame) {
        // Extraire le bitrate du frame MP3
        uint8_t bitrateIndex = (header[2] >> 4) & 0x0F;
        const uint16_t bitrateTable[16] = {0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0};

        if (bitrateIndex > 0 && bitrateIndex < 15) {
          uint16_t bitrate = bitrateTable[bitrateIndex];
          float bytesPerSecond = (bitrate * 1000.0) / 8.0;
          mp3File.close();
          return bytesPerSecond;
        }
      }

      mp3File.close();
      Serial.println("[AUDIO] ⚠️ Bitrate MP3 non trouvé, utilisation valeur par défaut");
      return 24000.0; // Valeur par défaut plus réaliste (192kbps)
    }

    // Type de fichier non reconnu
    Serial.println("[AUDIO] ⚠️ Type de fichier non reconnu, utilisation valeur par défaut");
    return 16000.0; // Valeur de secours
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
          if (filename.endsWith(".mp3") || filename.endsWith(".MP3")) {
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

  /**
   * FONCTION AUDIO UNIFIÉE - Remplace playAudioFile() et playTimelineAudio()
   * Gère tous les types de lecture audio avec paramètres unifiés
   * @param params Structure AudioParams avec tous les paramètres
   * @return bool Succès de la lecture
   */
  bool playAudio(const AudioParams& params) {
    if (!sdCardMounted) {
      Serial.println("[AUDIO] ❌ Lecture annulée - SD non montée");
      return false;
    }

    // Utiliser le volume passé en paramètre ou le volume global par défaut
    int playbackVolume = (params.volume >= 0 && params.volume <= 100) ? params.volume : volumeLevel;
    
    // Déterminer automatiquement si c'est une timeline basée sur les paramètres
    bool isTimeline = params.timeline_mode || (params.start_seconds > 0.0) || (params.duration_ms > 0);
    
    // Arrêter la lecture en cours si nécessaire
    if (isPlaying || isTimelinePlaying) {
      stopAudio();
    }

    String filepath = "/" + params.filename;
    Serial.printf("[AUDIO] 🎵 Démarrage lecture unifiée: %s (timeline: %s)\n", 
                 filepath.c_str(), isTimeline ? "oui" : "non");

    // Calculer la position de départ en octets si start_seconds > 0
    unsigned long startPos = 0;
    if (params.start_seconds > 0.0) {
      // Utiliser la fonction d'analyse pour déterminer le taux d'octets par seconde réel
      float bytesPerSecond = getBytesPerSecond(params.filename);
      
      startPos = (unsigned long)(params.start_seconds * bytesPerSecond);
      Serial.printf("[AUDIO] 📍 Position de départ: %.1f secondes (%lu octets, %.0f octets/sec)\n", 
                   params.start_seconds, startPos, bytesPerSecond);
    }

    if (params.delay_ms > 0) {
      Serial.printf("[AUDIO] ⏱️ Délai avant lecture: %lu ms\n", params.delay_ms);
      playDelay = millis() + params.delay_ms;
      currentAudioFile = params.filename;
      
      // Stocker les paramètres pour la lecture différée
      delayedVolume = playbackVolume;
      delayedStartSeconds = params.start_seconds;
      delayedTimelineDuration = params.duration_ms;
      isDelayedTimeline = isTimeline;  // Utiliser le flag déterminé automatiquement
      
      return true;
    }

    // Démarrer la lecture immédiatement
    Serial.println("[AUDIO] 🔇 Démarrage silencieux (anti-pop)...");
    
    // Sauvegarder le volume original
    int originalVolume = playbackVolume;
    
    // Commencer à volume 0 pour éviter le pop
    audio.setVolume(0);
    
    Serial.println("[AUDIO] 🔄 Tentative de connexion à l'audio...");
    if (audio.connecttoFS(SD, filepath.c_str(), startPos)) {
      Serial.println("[AUDIO] ✅ Connexion audio réussie");
      
      isPlaying = true;
      isPaused = false;
      isTimelinePlaying = isTimeline;  // État basé sur les paramètres, pas sur la commande
      currentAudioFile = params.filename;
      
      // Configurer la timeline si nécessaire
      if (isTimeline) {
        timelineStartTime = millis();
        timelineDuration = params.duration_ms;
        Serial.printf("[TIMELINE] 🎬 Mode timeline activé - Durée: %lu ms\n", params.duration_ms);
      }
      
      // Laisser l'audio se stabiliser
      delay(50);
      
      // FADE-IN progressif pour éviter le pop
      Serial.println("[AUDIO] 🔊 Fade-in progressif...");
      for (int vol = 0; vol <= originalVolume; vol += 3) {
        int audioVolume = map(vol, 0, 100, 0, 63);
        audio.setVolume(audioVolume);
        delay(15);
      }
      
      // Volume final exact
      int finalVolume = map(originalVolume, 0, 100, 0, 63);
      audio.setVolume(finalVolume);
      
      Serial.printf("[AUDIO] ✅ Lecture démarrée - Volume: %d%%, Timeline: %s\n", 
                   originalVolume, isTimeline ? "oui" : "non");
      sendAudioStatusUpdate();

      return true;
    } else {
      Serial.println("[AUDIO] ❌ Échec connexion audio");
      // Restaurer le volume en cas d'échec
      int audioVolume = map(originalVolume, 0, 100, 0, 63);
      audio.setVolume(audioVolume);
      isTimelinePlaying = false;
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

  void resumeAudio() {
    if (!isPaused) return;
    
    Serial.println("[AUDIO] ▶️ Reprise de la lecture");
    audio.pauseResume();
    isPlaying = true;
    isPaused = false;
    sendAudioStatusUpdate();
  }

  void stopAudio() {
    if (!isPlaying && currentAudioFile == "") return;
    
    Serial.println("[AUDIO] 🛑 FADE-OUT anti-pop avant arrêt...");
    
    // Récupérer le volume actuel
    int currentVolume = volumeLevel;
    
    // FADE-OUT progressif pour éviter le pop
    for (int vol = currentVolume; vol >= 0; vol -= 5) {
      int audioVolume = map(vol, 0, 100, 0, 63);
      audio.setVolume(audioVolume);
      delay(10); // 10ms par step = fade-out rapide mais fluide
    }
    
    // Volume à 0 avant arrêt définitif
    audio.setVolume(0);
    delay(20);
    
    Serial.println("[AUDIO] 🛑 Arrêt lecture silencieux");
    audio.stopSong();
    isPlaying = false;
    isPaused = false;
    currentAudioFile = "";
    playDelay = 0;
    
    // RESET ÉTAT TIMELINE - IMPORTANT pour la nouvelle architecture
    isTimelinePlaying = false;
    timelineStartTime = 0;
    timelineDuration = 0;
    
    // Restaurer le volume pour la prochaine lecture
    int audioVolume = map(currentVolume, 0, 100, 0, 63);
    audio.setVolume(audioVolume);
    
    sendAudioStatusUpdate();
  }

  void setVolume(int volume) {
    int oldVolume = volumeLevel;
    volumeLevel = constrain(volume, 0, 100);
    
    Serial.printf("[AUDIO] 🔊 Changement volume %d%% → %d%%\n", oldVolume, volumeLevel);
    
    // Changement de volume progressif anti-crachement
    int oldAudioVolume = map(oldVolume, 0, 100, 0, 63);
    int newAudioVolume = map(volumeLevel, 0, 100, 0, 63);
    
    // Si la différence est importante, faire une transition douce
    if (abs(newAudioVolume - oldAudioVolume) > 5) {
      Serial.println("[AUDIO] 🎛️ Transition volume progressive...");
      
      if (newAudioVolume > oldAudioVolume) {
        // Volume UP progressif
        for (int vol = oldAudioVolume; vol <= newAudioVolume; vol += 2) {
          audio.setVolume(vol);
          delay(8);
        }
      } else {
        // Volume DOWN progressif
        for (int vol = oldAudioVolume; vol >= newAudioVolume; vol -= 2) {
          audio.setVolume(vol);
          delay(8);
        }
      }
    }
    
    // Volume final exact
    audio.setVolume(newAudioVolume);
    Serial.printf("[AUDIO] ✅ Volume final: %d%% (audio: %d/63)\n", volumeLevel, newAudioVolume);

    // Sauvegarder la configuration audio
    saveAudioConfig();

    // Envoyer la mise à jour du volume
    sendAudioVolumeUpdate();
  }

// ========================================
// FONCTIONS TIMELINE ET CONFIGURATION
// ========================================

void saveAudioConfig() {
  Serial.println("[CONFIG] 💾 Sauvegarde configuration audio...");

  // Créer le JSON de configuration
  JsonDocument doc;
  doc["volume"] = volumeLevel;

  // Générer timestamp ISO 8601
  char timestamp[25];
  time_t now = time(nullptr);
  struct tm* timeinfo = localtime(&now);
  strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%SZ", timeinfo);
  doc["last_updated"] = timestamp;

  // Ouvrir et sauvegarder dans LittleFS
  File configFile = LittleFS.open(CONFIG_FILE, "w");
  if (!configFile) {
    Serial.println("[CONFIG] ❌ Impossible de sauvegarder la configuration audio");
    return;
  }

  if (serializeJson(doc, configFile) == 0) {
    Serial.println("[CONFIG] ❌ Erreur sérialisation JSON");
  } else {
    Serial.printf("[CONFIG] ✅ Configuration sauvegardée - Volume: %d%%\n", volumeLevel);
  }

  configFile.close();
}

void loadAudioConfig() {
  Serial.println("[CONFIG] 📂 Chargement configuration audio...");

  if (!LittleFS.exists(CONFIG_FILE)) {
    Serial.println("[CONFIG] ℹ️ Configuration audio inexistante - valeurs par défaut");
    return;
  }

  File configFile = LittleFS.open(CONFIG_FILE, "r");
  if (!configFile) {
    Serial.println("[CONFIG] ❌ Impossible de lire la configuration audio");
    return;
  }

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, configFile);
  configFile.close();

  if (error) {
    Serial.printf("[CONFIG] ❌ Erreur parsing JSON: %s\n", error.c_str());
    return;
  }

  // Charger le volume
  if (doc["volume"].is<int>()) {
    int savedVolume = doc["volume"];
    volumeLevel = constrain(savedVolume, 0, 100);
    Serial.printf("[CONFIG] ✅ Volume chargé: %d%%\n", volumeLevel);

    // Appliquer au système audio
    int audioVolume = map(volumeLevel, 0, 100, 0, 63);
    audio.setVolume(audioVolume);
  }

  // Afficher timestamp si disponible
  if (doc["last_updated"].is<String>()) {
    String lastUpdated = doc["last_updated"];
    Serial.println("[CONFIG] 📅 Dernière sauvegarde: " + lastUpdated);
  }
}  // Fonctions WebSocket natif
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
  
  bool playTimelineAudio(const String& filename, unsigned long start_time_ms, unsigned long duration_ms, unsigned long delay_ms, float start_seconds) {
  if (!sdCardMounted) {
    Serial.println("[TIMELINE] ❌ Lecture annulée - SD non montée");
    return false;
  }

  // Arrêter la lecture en cours si nécessaire
  if (isPlaying || isTimelinePlaying) {
    stopAudio();
  }

  String filepath = "/" + filename;
  Serial.printf("[TIMELINE] 🎬 Démarrage timeline: %s (start: %lu ms, duration: %lu ms, delay: %lu ms)\n",
                filepath.c_str(), start_time_ms, duration_ms, delay_ms);
  if (start_seconds > 0.0) {
    Serial.printf("[TIMELINE] ⏰ Début fichier audio: %.1f secondes\n", start_seconds);
  }

  // Vérifier si le fichier existe
  if (!SD.exists(filepath)) {
    Serial.println("[TIMELINE] ❌ Fichier non trouvé: " + filepath);
    return false;
  }

  // Calculer la position de départ en octets (combinaison start_time_ms et start_seconds)
  // start_time_ms est pour la position dans la timeline globale
  // start_seconds est pour le début dans le fichier audio
  unsigned long startPos = 0;
  if (start_seconds > 0.0) {
    // Utiliser la fonction d'analyse pour déterminer le taux d'octets par seconde réel
    float bytesPerSecond = getBytesPerSecond(filename);
    
    startPos = (unsigned long)(start_seconds * bytesPerSecond);
    Serial.printf("[TIMELINE] 📍 Position de départ estimée: %lu octets (%.1f sec, %.0f octets/sec)\n", startPos, start_seconds, bytesPerSecond);
  }

  if (delay_ms > 0) {
    Serial.printf("[TIMELINE] ⏱️ Délai avant lecture: %lu ms\n", delay_ms);
    playDelay = millis() + delay_ms;
    currentAudioFile = filename;
    timelineStartTime = millis() + delay_ms;
    timelineDuration = duration_ms;
    isTimelinePlaying = true;
    isDelayedTimeline = true;
    // Stocker les paramètres pour la lecture différée
    delayedVolume = volumeLevel;
    delayedStartSeconds = start_seconds;
    delayedTimelineDuration = duration_ms;
    return true;
  }

  // Démarrer la lecture timeline immédiatement
  Serial.println("[TIMELINE] � Démarrage silencieux (anti-pop)...");

  // Sauvegarder le volume original
  int originalVolume = volumeLevel;

  // Commencer à volume 0 pour éviter le pop
  audio.setVolume(0);

  Serial.println("[TIMELINE] 🔄 Tentative de connexion à l'audio avec position...");
  if (audio.connecttoFS(SD, filepath.c_str(), startPos)) {
    Serial.println("[TIMELINE] ✅ Connexion audio réussie");

    isPlaying = true;
    isPaused = false;
    isTimelinePlaying = true;
    currentAudioFile = filename;
    timelineStartTime = millis();
    timelineDuration = duration_ms;

    // Laisser l'audio se stabiliser
    delay(50);

    // FADE-IN progressif pour éviter le pop
    Serial.println("[TIMELINE] 🔊 Fade-in progressif...");
    for (int vol = 0; vol <= originalVolume; vol += 3) {
      int audioVolume = map(vol, 0, 100, 0, 63);
      audio.setVolume(audioVolume);
      delay(15);
    }

    // Volume final exact
    int finalVolume = map(originalVolume, 0, 100, 0, 63);
    audio.setVolume(finalVolume);

    Serial.printf("[TIMELINE] ✅ Timeline démarrée - Volume: %d%%, Durée: %lu ms\n", originalVolume, duration_ms);
    sendAudioStatusUpdate();

    return true;
  } else {
    Serial.println("[TIMELINE] ❌ Échec connexion audio");
    // Restaurer le volume en cas d'échec
    int audioVolume = map(originalVolume, 0, 100, 0, 63);
    audio.setVolume(audioVolume);
    isTimelinePlaying = false;
    return false;
  }
}

// ========================================
// TÂCHES FREERTOS
// ========================================

// Tâche dédiée au traitement audio (exécution sur Core 0)
void audioTask(void* parameter) {
  Serial.println("[AUDIO TASK] 🚀 Tâche audio démarrée");
  
  AudioCommand cmd;
  
  while (true) {
    // Attendre une commande dans la queue (bloquant)
    if (xQueueReceive(audioQueue, &cmd, pdMS_TO_TICKS(100)) == pdTRUE) {
      Serial.println("[AUDIO TASK] 📥 Commande reçue: " + cmd.command);
      
      isAudioProcessing = true;
      String status = "success";
      String message = "";
      
      // Traiter la commande
      if (cmd.command == "play") {
        if (playAudio(cmd.params)) {
          message = "Lecture démarrée: " + cmd.params.filename;
        } else {
          status = "error";
          message = "Erreur lors de la lecture: " + cmd.params.filename;
        }
      } else if (cmd.command == "pause") {
        pauseAudio();
        message = "Lecture mise en pause";
      } else if (cmd.command == "resume") {
        resumeAudio();
        message = "Lecture reprise";
      } else if (cmd.command == "stop") {
        stopAudio();
        message = "Lecture arrêtée";
      } else if (cmd.command == "volume") {
        setVolume(cmd.volumeLevel);
        message = "Volume réglé à " + String(cmd.volumeLevel) + "%";
      }
      
      isAudioProcessing = false;
      
      // Envoyer la réponse si un ID est fourni
      if (cmd.responseId.length() > 0) {
        sendCommandResponse(cmd.responseId, status, message);
      }
      
      Serial.println("[AUDIO TASK] ✅ Commande traitée: " + message);
    }
    
    // Vérification de la durée timeline (si en mode timeline)
    if (xSemaphoreTake(audioMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
      if (isTimelinePlaying && timelineDuration > 0 && 
          millis() - timelineStartTime >= timelineDuration) {
        Serial.println("[TIMELINE] ⏰ Durée timeline écoulée - Arrêt automatique");
        stopAudio();
        isTimelinePlaying = false;
        timelineStartTime = 0;
        timelineDuration = 0;
        
        // Notification WebSocket
        JsonDocument doc;
        doc["type"] = "timeline_ended";
        doc["moduleId"] = MODULE_ID;
        doc["password"] = MODULE_PASSWORD;
        doc["filename"] = currentAudioFile;
        
        String timelineMessage;
        serializeJson(doc, timelineMessage);
        webSocket.sendTXT(timelineMessage);
        
        Serial.println("[TIMELINE] 📤 Notification timeline_ended envoyée");
      }
      xSemaphoreGive(audioMutex);
    }
    
    // Mise à jour continue du système audio
    audio.loop();
    
    // Pause pour éviter saturation CPU
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

// Tâche dédiée au WebSocket et monitoring (exécution sur Core 1)
void websocketTask(void* parameter) {
  Serial.println("[WEBSOCKET TASK] 🚀 Tâche WebSocket démarrée");
  
  unsigned long lastStatusCheck = 0;
  unsigned long lastConnectionState = false;
  unsigned long lastHeartbeat = 0;
  unsigned long lastTelemetry = 0;
  unsigned long lastWebSocketCheck = 0;
  
  while (true) {
    unsigned long now = millis();
    
    // *** MONITORING WIFI PÉRIODIQUE ***
    if (now - lastStatusCheck > 15000) {
      lastStatusCheck = now;
      bool currentState = wifi.isConnected();
      
      // Affichage du statut
      if (currentState) {
        Serial.println("🟢 WiFi connecté - IP: " + WiFi.localIP().toString() + 
                       " | Signal: " + String(WiFi.RSSI()) + " dBm");
      } else {
        Serial.println("🔴 WiFi déconnecté - Portail actif");
      }
      
      // Détection des changements d'état
      if (currentState != lastConnectionState) {
        if (currentState) {
          Serial.println("🎉 Connexion WiFi établie !");
          connectSocket();
        } else {
          Serial.println("⚠️  Connexion WiFi perdue");
          isAuthenticated = false;
          stopAudio();
          digitalWrite(STATUS_LED_PIN, LOW);
        }
        lastConnectionState = currentState;
      }
    }
    
    // *** GESTION WEBSOCKET ***
    if (wifi.isConnected()) {
      // Traitement des messages WebSocket
      webSocket.loop();
      
      // Vérification connexion WebSocket
      if (now - lastWebSocketCheck > 10000) {
        lastWebSocketCheck = now;
        if (!webSocket.isConnected() && isAuthenticated) {
          Serial.println("[WEBSOCKET TASK] ⚠️  Connexion WebSocket perdue");
          isAuthenticated = false;
          stopAudio();
          digitalWrite(STATUS_LED_PIN, LOW);
          connectSocket();
        }
      }
      
      // Heartbeat périodique
      if (isAuthenticated && now - lastHeartbeat > 60000) {
        sendHeartbeat();
        lastHeartbeat = now;
      }
      
      // Télémétrie périodique
      if (isAuthenticated && now - lastTelemetry > 10000) {
        sendTelemetry();
        lastTelemetry = now;
      }
    }
    
    // Pause pour éviter saturation CPU
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}