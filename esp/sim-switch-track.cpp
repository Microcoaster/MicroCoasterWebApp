/*
 * MicroCoaster - Switch Track ESP32
 * Aiguillage sécurisé avec authentification
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// Configuration WiFi
const char* ssid = "Freebox-73A72A";
const char* password = "ChezCatherineetVincent";

// Configuration serveur WebSocket natif
const char* server_host = "192.168.1.23";  // IP du serveur sur le réseau local
const uint16_t server_port = 3000;
const char* websocket_path = "/esp32"; // Path WebSocket dédié ESP32

// Configuration module
const String MODULE_ID = "MC-0001-ST";
const String MODULE_PASSWORD = "F674iaRftVsHGKOA8hq3TI93HQHUaYqZ";

// Variables globales
WebSocketsClient webSocket;
String currentPosition = "left"; // Position initiale
unsigned long uptimeStart = 0;
bool isAuthenticated = false;

// Pins hardware
const int LED_LEFT_PIN  = 2;
const int LED_RIGHT_PIN = 4;

// Déclarations des fonctions
void connectWiFi();
void connectSocket();
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length);
void authenticateModule();
void handleConnected(const char* payload);
void handleCommand(const char* payload);
void handleError(const char* payload);
void updateLEDs();
void sendCommandResponse(const String& command, const String& status, const String& position);
void sendHeartbeat();
void sendTelemetry();

void setup() {
  Serial.begin(115200);
  Serial.println("[SWITCH TRACK] 🚀 ESP32 Switch Track démarrant...");
  
  uptimeStart = millis();
  
  // Configuration pins LED
  pinMode(LED_LEFT_PIN, OUTPUT);
  pinMode(LED_RIGHT_PIN, OUTPUT);
  
  // Position initiale - LED gauche allumée
  updateLEDs();
  Serial.println("[SWITCH TRACK] 📍 Position initiale: " + currentPosition);
  
  // Connexion WiFi
  connectWiFi();
  
  // Connexion Socket.io
  connectSocket();
}

void loop() {
  static unsigned long lastWiFiCheck = 0;
  static unsigned long lastHeartbeat = 0;
  unsigned long now = millis();
  
  // Monitoring WiFi continu
  if (now - lastWiFiCheck > 10000) { // Vérifier toutes les 10 secondes
    lastWiFiCheck = now;
    Serial.printf("[SWITCH TRACK] 📶 WiFi: %d - RSSI: %d dBm\n", WiFi.status(), WiFi.RSSI());
  }
  
  // Vérifier la connexion WiFi avant WebSocket
  if (WiFi.status() == WL_CONNECTED) {
    webSocket.loop();
    
    // Envoyer heartbeat si authentifié
    if (isAuthenticated && now - lastHeartbeat > 30000) { // Toutes les 30 secondes
      sendHeartbeat();
      lastHeartbeat = now;
    }
    
  } else {
    Serial.println("[SWITCH TRACK] ⚠️ WiFi déconnecté - reconnexion...");
    isAuthenticated = false;
    digitalWrite(LED_LEFT_PIN, LOW);
    digitalWrite(LED_RIGHT_PIN, LOW);
    connectWiFi();
    if (WiFi.status() == WL_CONNECTED) {
      connectSocket();
    }
  }
  
  delay(100);
}

void connectWiFi() {
  Serial.print("[SWITCH TRACK] 🌐 Connexion WiFi à ");
  Serial.println(ssid);
  
  // Configuration WiFi pour stabilité
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false); // Désactiver le sleep WiFi
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("[SWITCH TRACK] ✅ WiFi connecté - IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("[SWITCH TRACK] 📶 Signal WiFi: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    Serial.println();
    Serial.println("[SWITCH TRACK] ❌ Échec connexion WiFi");
    delay(5000); // Attendre avant retry
  }
}

void connectSocket() {
  Serial.println("[SWITCH TRACK] 🔗 Connexion WebSocket natif...");
  Serial.println("[SWITCH TRACK] 📍 Module ID: " + MODULE_ID);
  Serial.println("[SWITCH TRACK] 🔑 Password: " + MODULE_PASSWORD.substring(0, 8) + "...");
  
  // Configuration WebSocket natif (Solution A)
  webSocket.begin(server_host, server_port, websocket_path);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
  webSocket.enableHeartbeat(15000, 3000, 2);
  
  Serial.printf("[SWITCH TRACK] 🤖 WebSocket: ws://%s:%d%s\n", server_host, server_port, websocket_path);
  Serial.println("[SWITCH TRACK] ✅ ESP32 Switch Track prêt (Architecture hybride)!");
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_CONNECTED:
      Serial.println("[SWITCH TRACK] 🟢 Connecté au serveur WebSocket");
      authenticateModule();
      break;
      
    case WStype_DISCONNECTED:
      Serial.println("[SWITCH TRACK] 🔴 Déconnexion du serveur");
      isAuthenticated = false;
      digitalWrite(LED_LEFT_PIN, LOW);
      digitalWrite(LED_RIGHT_PIN, LOW);
      break;
      
    case WStype_TEXT: {
      Serial.println("[SWITCH TRACK] 📡 Message reçu: " + String((char*)payload));
      
      JsonDocument doc;
      deserializeJson(doc, (char*)payload);
      
      String msgType = doc["type"].as<String>();
      
      if (msgType == "connected") {
        handleConnected((char*)payload);
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
  Serial.println("[SWITCH TRACK] � Authentification WebSocket natif...");
  
  // Format WebSocket natif pour Solution A
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
  updateLEDs(); // Mettre à jour les LEDs selon la position
  
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
    Serial.println("[SWITCH TRACK] 🔄 Aiguillage basculé vers la GAUCHE");
    updateLEDs(); // Allumer LED gauche
    
  } else if (command == "switch_right" || command == "right" || command == "switch_to_B") {
    newPosition = "right";
    Serial.println("[SWITCH TRACK] 🔄 Aiguillage basculé vers la DROITE");
    updateLEDs(); // Allumer LED droite
    
  } else if (command == "get_position") {
    // Pas de changement de position, juste retourner l'état
    Serial.println("[SWITCH TRACK] 📍 Position actuelle: " + currentPosition);
    
  } else {
    Serial.println("[SWITCH TRACK] ❌ Commande inconnue: " + command);
    status = "unknown_command";
  }
  
  currentPosition = newPosition;
  
  // Envoyer la réponse de commande (WebSocket natif)
  sendCommandResponse(command, status, currentPosition);
  
  Serial.println("[SWITCH TRACK] ✅ Commande exécutée: " + currentPosition);
}

void handleError(const char* payload) {
  Serial.println("[SWITCH TRACK] ❌ Erreur reçue du serveur");
  
  isAuthenticated = false;
  // Éteindre toutes les LEDs en cas d'erreur
  digitalWrite(LED_LEFT_PIN, LOW);
  digitalWrite(LED_RIGHT_PIN, LOW);
}

// Fonction sendTelemetry supprimée - pas nécessaire avec Socket.io
// Socket.io gère automatiquement la détection de déconnexion

void updateLEDs() {
  if (currentPosition == "left") {
    digitalWrite(LED_LEFT_PIN, HIGH);   // LED gauche ON
    digitalWrite(LED_RIGHT_PIN, LOW);   // LED droite OFF
    Serial.println("[SWITCH TRACK] 💡 LED GAUCHE allumée");
  } else if (currentPosition == "right") {
    digitalWrite(LED_LEFT_PIN, LOW);    // LED gauche OFF
    digitalWrite(LED_RIGHT_PIN, HIGH);  // LED droite ON
    Serial.println("[SWITCH TRACK] 💡 LED DROITE allumée");
  }
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
  
  JsonDocument doc;
  doc["type"] = "heartbeat";
  doc["moduleId"] = MODULE_ID;
  doc["password"] = MODULE_PASSWORD;
  doc["uptime"] = millis() - uptimeStart;
  doc["position"] = currentPosition;
  doc["wifiRSSI"] = WiFi.RSSI();
  doc["freeHeap"] = ESP.getFreeHeap();
  
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
  doc["position"] = currentPosition;
  doc["status"] = "operational";
  
  String message;
  serializeJson(doc, message);
  webSocket.sendTXT(message);
  
  Serial.println("[SWITCH TRACK] 📊 Télémétrie envoyée");
}