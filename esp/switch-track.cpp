/*
 * MicroCoaster - Module Switch Track ESP32
 * 
 * Module intelligent d'aiguillage sécurisé pour montagnes russes miniatures
 * Combine gestion WiFi automatique, contrôle d'aiguillage physique et communication WebSocket
 * 
 * Auteurs: CyberSpaceRS, Yamakajump
 * Version: 2.0.0
 * 
 * Modifications: Contrôle du vérin électrique via DRV8871 au lieu des LEDs.
 * - Pins IN1 et IN2 connectés à GPIO 26 et 27.
 * - Déplacement du vérin pendant 2 secondes pour changer de position (ajustez la durée selon vos besoins).
 * - Arrêt du vérin après mouvement ou en cas d'erreur/déconnexion.
 */

#include <Arduino.h>          // Bibliothèque principale Arduino pour ESP32
#include <AyresWiFiManager.h> // Gestionnaire WiFi avec portail captif
#include <WebSocketsClient.h> // Client WebSocket pour communication serveur
#include <ArduinoJson.h>      // Manipulation des données JSON
#include <LittleFS.h>         // Système de fichiers LittleFS pour ESP32
#include <freertos/FreeRTOS.h> // Système d'exploitation temps réel
#include <freertos/task.h>     // Gestion des tâches
#include <freertos/queue.h>    // Files d'attente inter-tâches
#include <freertos/semphr.h>   // Sémaphores et mutex

// ========================================
// CONFIGURATION PRINCIPALE
// ========================================

// Identifiants du portail de secours et du module.
// Voir include/env.h.example du depot Switch-Track : env.h n'est pas versionne.
#include "env.h"

// Instance du gestionnaire WiFi intelligent avec portail captif
AyresWiFiManager wifi;

// Configuration serveur WebSocket - Basculez entre ws (local) et wss (production)
#define SERVER_USE_SSL false                       // true = wss (SSL/TLS), false = ws (plain)
const char* server_host = "192.168.1.15";        // Adresse IP/domaine du serveur (192.168.1.16 pour local, app.microcoaster.com pour production)
const uint16_t server_port = 3000;                 // Port du serveur (3000 pour ws, 443 pour wss)
const char* websocket_path = "/esp32";             // Endpoint WebSocket dédié aux modules ESP32
// Empreinte SSL optionnelle (fingerprint SHA1) - laissez vide "" pour ne pas vérifier
const char* server_fingerprint = "";               // Ex: "AA BB CC DD EE FF 00 11 22 33 44 55 66 77 88 99 AA BB CC DD"

// Identifiants uniques du module Switch Track
const String MODULE_ID = MC_MODULE_ID;
const String MODULE_PASSWORD = MC_MODULE_PASSWORD;

// ========================================
// VARIABLES GLOBALES
// ========================================

// Client WebSocket pour communication avec le serveur
WebSocketsClient webSocket;

// État actuel de l'aiguillage ("left" ou "right")
String currentPosition = "left"; // Position initiale au démarrage

// Variables de monitoring
unsigned long uptimeStart = 0;   // Timestamp du démarrage pour calcul uptime
bool isAuthenticated = false;     // État d'authentification avec le serveur

// Configuration persistante
const String CONFIG_FILE = "/switch_track.json";
int moveCount = 0;  // Compteur de mouvements pour monitoring

// ========================================
// VARIABLES FREERTOS
// ========================================

// Structure pour les commandes de mouvement
typedef struct {
  String targetPosition;  // "left" ou "right"
  String command;         // Commande originale pour la réponse
} MoveCommand;

// Queue pour envoyer des commandes au vérin (taille 5 pour gérer le spam)
QueueHandle_t moveQueue = NULL;

// Mutex pour protéger currentPosition (accès concurrent)
SemaphoreHandle_t positionMutex = NULL;

// Variables pour la tâche vérin
volatile bool isMoving = false;  // Indique si le vérin est en mouvement
TaskHandle_t verinTaskHandle = NULL;
TaskHandle_t websocketTaskHandle = NULL;

// ========================================
// CONFIGURATION HARDWARE
// ========================================

// Pins pour le DRV8871 (contrôle du vérin)
const int VERIN_IN1_PIN = 26;     // GPIO 26 - IN1 du DRV8871
const int VERIN_IN2_PIN = 27;     // GPIO 27 - IN2 du DRV8871

// Durée de mouvement du vérin (en ms ; ajustez selon la course réelle du vérin)
const int MOVE_DURATION = 2000;   // 2 secondes pour changer de position

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
void updatePositionAsync(const String& newPosition, const String& command);
void moveVerin(const String& position);
void stopVerin();
void sendCommandResponse(const String& command, const String& status, const String& position);
void sendHeartbeat();
void sendTelemetry();
void saveSwitchConfig();
void loadSwitchConfig();
String getTimestamp();
String getCurrentPosition();
void setCurrentPosition(const String& pos);

// Tâches FreeRTOS
void verinTask(void* parameter);
void websocketTask(void* parameter);

// ========================================
// FONCTION DE DÉMARRAGE (SETUP)
// ========================================

void setup() {
  // Initialisation de la communication série pour debug
  Serial.begin(115200);
  Serial.println();
  Serial.println("=========================================");
  Serial.println("🚀 MicroCoaster - Switch Track v2.0.0");
  Serial.println("=========================================");
  Serial.println();

  // Enregistrement du timestamp de démarrage pour calcul uptime
  uptimeStart = millis();

  // *** CONFIGURATION DES PINS ***

  // Configuration des pins pour le DRV8871 en sortie
  pinMode(VERIN_IN1_PIN, OUTPUT);   // GPIO 26 - IN1
  pinMode(VERIN_IN2_PIN, OUTPUT);   // GPIO 27 - IN2

  // Arrêt initial du vérin
  stopVerin();

  // *** INITIALISATION FREERTOS ***

  Serial.println("🧵 Initialisation FreeRTOS...");
  
  // Créer le mutex pour protéger currentPosition
  positionMutex = xSemaphoreCreateMutex();
  if (positionMutex == NULL) {
    Serial.println("❌ Échec création du mutex");
    ESP.restart();
  }
  Serial.println("   ✅ Mutex créé");

  // Créer la queue pour les commandes de mouvement (taille 5)
  moveQueue = xQueueCreate(5, sizeof(MoveCommand));
  if (moveQueue == NULL) {
    Serial.println("❌ Échec création de la queue");
    ESP.restart();
  }
  Serial.println("   ✅ Queue créée (taille 5)");

  // Créer la tâche du vérin (haute priorité pour réactivité)
  xTaskCreatePinnedToCore(
    verinTask,           // Fonction de la tâche
    "VerinTask",         // Nom de la tâche
    4096,                // Taille de la pile (4KB)
    NULL,                // Paramètre
    2,                   // Priorité (2 = haute)
    &verinTaskHandle,    // Handle de la tâche
    0                    // Core 0
  );
  Serial.println("   ✅ Tâche vérin créée (Core 0, priorité 2)");

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
  wifi.setProtectedJsons({"/wifi.json"});  // Protège le fichier de configuration WiFi
  Serial.println("🛡️  Protection fichiers: /wifi.json");

  // *** INITIALISATION DU WIFI MANAGER ***

  Serial.println();
  Serial.println("🔄 Initialisation du WiFi Manager...");
  wifi.begin();  // Monte le système de fichiers, charge /wifi.json si présent
  Serial.println("💾 Système de fichiers LittleFS monté");
  Serial.println("📁 Recherche du fichier de configuration /wifi.json...");

  // *** CHARGEMENT CONFIGURATION PERSISTANTE ***
  loadSwitchConfig();

  // Appliquer la position chargée au vérin
  moveVerin(currentPosition);
  Serial.println("[SWITCH TRACK] 📍 Position initiale appliquée: " + currentPosition);

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

  Serial.println("[WEBSOCKET] ✅ ESP32 Switch Track prêt (Configuration optimisée)!");
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_CONNECTED:
      Serial.println("[SWITCH TRACK] 🟢 Connecté au serveur WebSocket");
      authenticateModule();
      break;

    case WStype_DISCONNECTED:
      Serial.println("[SWITCH TRACK] 🔴 Déconnexion du serveur - Tentative de reconnexion immédiate");
      isAuthenticated = false;
      stopVerin();
      // Tentative de reconnexion immédiate
      delay(1000);
      connectSocket();
      break;

    case WStype_TEXT: {
      Serial.println("[SWITCH TRACK] 📡 Message reçu: " + String((char*)payload));

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
        Serial.println("[SWITCH TRACK] ⚠️ Événement non géré: '" + msgType + "'");
        Serial.println("[SWITCH TRACK] 🔍 Message complet: " + String((char*)payload));
      }
      break;
    }

    default:
      break;
  }
}

void authenticateModule() {
  Serial.println("[SWITCH TRACK] 🔐 Authentification WebSocket natif...");

  // Format WebSocket natif
  JsonDocument authData;
  authData["type"] = "module_identify";
  authData["moduleId"] = MODULE_ID;
  authData["password"] = MODULE_PASSWORD;
  authData["moduleType"] = "switch-track";
  authData["uptime"] = millis() - uptimeStart;
  authData["position"] = currentPosition;

  String authMessage;
  serializeJson(authData, authMessage);
  webSocket.sendTXT(authMessage);

  Serial.println("[SWITCH TRACK] 📤 Authentification envoyée: " + authMessage);
}

void handleConnected(const char* payload) {
  Serial.println("[SWITCH TRACK] ✅ Module authentifié WebSocket natif");

  isAuthenticated = true;
  // Position déjà appliquée au démarrage, pas besoin de updatePosition ici

  // Envoyer télémétrie initiale
  delay(1000);
  sendTelemetry();
}

void handleCommand(const char* payload) {
  if (!isAuthenticated) {
    Serial.println("[SWITCH TRACK] ⚠️ Commande refusée - non authentifié");
    return;
  }

  // Parse du JSON WebSocket natif
  JsonDocument doc;
  deserializeJson(doc, payload);

  String command = doc["data"]["command"];
  Serial.println("[SWITCH TRACK] 🎮 Commande reçue: " + command);

  String newPosition = currentPosition;
  String status = "success";

  // Traitement des commandes
  if (command == "switch_left" || command == "left" || command == "switch_to_A") {
    newPosition = "left";
    Serial.println("[SWITCH TRACK] 🔄 Aiguillage vers la GAUCHE");

  } else if (command == "switch_right" || command == "right" || command == "switch_to_B") {
    newPosition = "right";
    Serial.println("[SWITCH TRACK] 🔄 Aiguillage vers la DROITE");

  } else if (command == "get_position") {
    // Pas de changement de position, juste retourner l'état
    Serial.println("[SWITCH TRACK] 📍 Position actuelle: " + currentPosition);

  } else {
    Serial.println("[SWITCH TRACK] ❌ Commande inconnue: " + command);
    status = "unknown_command";
  }

  // Envoyer la commande de mouvement à la tâche vérin (non-bloquant)
  if (newPosition != getCurrentPosition()) {
    updatePositionAsync(newPosition, command);
  }

  // Envoyer la réponse de commande immédiatement (WebSocket natif)
  sendCommandResponse(command, status, newPosition);

  Serial.println("[SWITCH TRACK] ✅ Commande exécutée: " + currentPosition);
}

void handlePing(const char* payload) {
  Serial.println("[SWITCH TRACK] 🏓 Ping reçu du serveur - Envoi du pong");

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

  Serial.println("[SWITCH TRACK] 🏓 Pong envoyé: " + pongMessage);
}

void handleError(const char* payload) {
  Serial.println("[SWITCH TRACK] ❌ Erreur reçue du serveur");

  isAuthenticated = false;
  // Arrêter le vérin en cas d'erreur
  stopVerin();
}

// Fonction thread-safe pour lire currentPosition
String getCurrentPosition() {
  String pos;
  if (xSemaphoreTake(positionMutex, portMAX_DELAY) == pdTRUE) {
    pos = currentPosition;
    xSemaphoreGive(positionMutex);
  }
  return pos;
}

// Fonction thread-safe pour écrire currentPosition
void setCurrentPosition(const String& pos) {
  if (xSemaphoreTake(positionMutex, portMAX_DELAY) == pdTRUE) {
    currentPosition = pos;
    xSemaphoreGive(positionMutex);
  }
}

// Envoyer une commande de mouvement à la tâche vérin (non-bloquant)
void updatePositionAsync(const String& newPosition, const String& command) {
  MoveCommand cmd;
  cmd.targetPosition = newPosition;
  cmd.command = command;
  
  // Envoyer dans la queue (timeout 100ms)
  if (xQueueSend(moveQueue, &cmd, pdMS_TO_TICKS(100)) == pdTRUE) {
    Serial.println("[SWITCH TRACK] ✅ Commande ajoutée à la queue: " + newPosition);
  } else {
    Serial.println("[SWITCH TRACK] ⚠️  Queue pleine, commande ignorée");
  }
}

// Fonction bloquante de mouvement du vérin (appelée par la tâche dédiée)
void moveVerin(const String& position) {
  String currentPos = getCurrentPosition();
  
  // Si déjà dans la bonne position, ne rien faire
  if (currentPos == position) {
    Serial.println("[SWITCH TRACK] ℹ️  Déjà en position " + position);
    return;
  }
  
  isMoving = true;
  
  if (position == "left") {
    // Mouvement vers "left" (ex. : rétraction)
    digitalWrite(VERIN_IN1_PIN, LOW);
    digitalWrite(VERIN_IN2_PIN, HIGH);
    Serial.println("[SWITCH TRACK] 🔄 Vérin en mouvement vers GAUCHE");
    vTaskDelay(pdMS_TO_TICKS(MOVE_DURATION));  // Délai non-bloquant FreeRTOS
    stopVerin();
    Serial.println("[SWITCH TRACK] ✅ Vérin en position GAUCHE");
  } else if (position == "right") {
    // Mouvement vers "right" (ex. : extension)
    digitalWrite(VERIN_IN1_PIN, HIGH);
    digitalWrite(VERIN_IN2_PIN, LOW);
    Serial.println("[SWITCH TRACK] 🔄 Vérin en mouvement vers DROITE");
    vTaskDelay(pdMS_TO_TICKS(MOVE_DURATION));  // Délai non-bloquant FreeRTOS
    stopVerin();
    Serial.println("[SWITCH TRACK] ✅ Vérin en position DROITE");
  }
  
  isMoving = false;
  
  // Mettre à jour la position (thread-safe)
  setCurrentPosition(position);
  
  // Incrémenter le compteur de mouvements et sauvegarder
  moveCount++;
  saveSwitchConfig();
}

void stopVerin() {
  digitalWrite(VERIN_IN1_PIN, LOW);
  digitalWrite(VERIN_IN2_PIN, LOW);
  Serial.println("[SWITCH TRACK] 🛑 Vérin arrêté");
}

// Fonctions WebSocket natif
void sendCommandResponse(const String& command, const String& status, const String& position) {
  if (!isAuthenticated) return;

  JsonDocument doc;
  doc["type"] = "command_response";
  doc["moduleId"] = MODULE_ID;
  doc["password"] = MODULE_PASSWORD;
  doc["command"] = command;
  doc["status"] = status;
  doc["position"] = position;

  String message;
  serializeJson(doc, message);
  webSocket.sendTXT(message);

  Serial.printf("[SWITCH TRACK] 📤 Réponse: %s -> %s\n", command.c_str(), status.c_str());
}

void sendHeartbeat() {
  if (!isAuthenticated) return;

  // Vérification de la mémoire disponible
  uint32_t freeHeap = ESP.getFreeHeap();
  Serial.printf("[SWITCH TRACK] 💾 Mémoire libre: %d bytes\n", freeHeap);

  // Alerte si mémoire faible
  if (freeHeap < 50000) {  // Moins de 50KB libre
    Serial.println("[SWITCH TRACK] ⚠️  Mémoire faible détectée !");
  }

  JsonDocument doc;
  doc["type"] = "heartbeat";
  doc["moduleId"] = MODULE_ID;
  doc["password"] = MODULE_PASSWORD;
  doc["uptime"] = millis() - uptimeStart;
  doc["position"] = getCurrentPosition();
  doc["wifiRSSI"] = WiFi.RSSI();
  doc["freeHeap"] = freeHeap;
  doc["move_count"] = moveCount;
  doc["is_moving"] = isMoving;

  String message;
  serializeJson(doc, message);
  webSocket.sendTXT(message);

  Serial.println("[SWITCH TRACK] 💓 Heartbeat envoyé");
}

void sendTelemetry() {
  if (!isAuthenticated) return;

  JsonDocument doc;
  doc["type"] = "telemetry";
  doc["moduleId"] = MODULE_ID;
  doc["password"] = MODULE_PASSWORD;
  doc["uptime"] = millis() - uptimeStart;
  doc["position"] = getCurrentPosition();
  doc["status"] = isMoving ? "moving" : "operational";
  doc["move_count"] = moveCount;

  String message;
  serializeJson(doc, message);
  webSocket.sendTXT(message);

  Serial.println("[SWITCH TRACK] 📊 Télémétrie envoyée");
}

// ========================================
// FONCTIONS DE CONFIGURATION PERSISTANTE
// ========================================

String getTimestamp() {
  // Retourne un timestamp au format ISO 8601 approximatif
  // Utilise la date du contexte (2025-10-17) et l'uptime pour HH:MM:SS
  unsigned long seconds = (millis() - uptimeStart) / 1000;
  char buf[25];
  sprintf(buf, "2025-10-17T%02lu:%02lu:%02luZ", (seconds / 3600) % 24, (seconds / 60) % 60, seconds % 60);
  return String(buf);
}

void saveSwitchConfig() {
  // Ouvrir fichier en écriture
  File configFile = LittleFS.open(CONFIG_FILE, "w");
  if (!configFile) {
    Serial.println("[SWITCH TRACK] ❌ Impossible d'ouvrir le fichier config en écriture");
    return;
  }

  // Créer JSON
  JsonDocument doc;
  doc["position"] = currentPosition;
  doc["last_updated"] = getTimestamp();
  doc["move_count"] = moveCount;

  // Sérialiser et écrire
  if (serializeJson(doc, configFile) == 0) {
    Serial.println("[SWITCH TRACK] ❌ Erreur sérialisation config");
  } else {
    Serial.println("[SWITCH TRACK] 💾 Configuration sauvegardée");
  }

  configFile.close();
}

// ========================================
// TÂCHES FREERTOS
// ========================================

// Tâche dédiée au contrôle du vérin (exécution sur Core 0)
void verinTask(void* parameter) {
  Serial.println("[VERIN TASK] 🚀 Tâche vérin démarrée");
  
  MoveCommand cmd;
  
  while (true) {
    // Attendre une commande dans la queue (bloquant)
    if (xQueueReceive(moveQueue, &cmd, portMAX_DELAY) == pdTRUE) {
      Serial.println("[VERIN TASK] 📥 Commande reçue: " + cmd.targetPosition);
      
      // Exécuter le mouvement (bloquant pour cette tâche uniquement)
      moveVerin(cmd.targetPosition);
      
      // Envoyer la réponse après le mouvement
      sendCommandResponse(cmd.command, "success", cmd.targetPosition);
      
      Serial.println("[VERIN TASK] ✅ Mouvement terminé");
    }
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
          stopVerin();
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
          stopVerin();
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

void loadSwitchConfig() {
  if (!LittleFS.exists(CONFIG_FILE)) {
    Serial.println("[SWITCH TRACK] ℹ️ Pas de fichier config, utilisation valeur par défaut");
    currentPosition = "left";
    moveCount = 0;
    return;
  }

  File configFile = LittleFS.open(CONFIG_FILE, "r");
  if (!configFile) {
    Serial.println("[SWITCH TRACK] ❌ Impossible d'ouvrir le fichier config");
    currentPosition = "left";
    moveCount = 0;
    return;
  }

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, configFile);
  configFile.close();

  if (error) {
    Serial.println("[SWITCH TRACK] ❌ Erreur lecture config JSON, utilisation défaut");
    currentPosition = "left";
    moveCount = 0;
    return;
  }

  // Validation et application
  String savedPosition = doc["position"] | "left";
  if (savedPosition != "left" && savedPosition != "right") {
    savedPosition = "left";
  }

  currentPosition = savedPosition;
  moveCount = doc["move_count"] | 0;

  Serial.printf("[SWITCH TRACK] 📂 Configuration chargée - Position: %s, Mouvements: %d\n",
               currentPosition.c_str(), moveCount);
}
