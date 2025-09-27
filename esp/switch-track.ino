/*
 * MicroCoaster - Switch Track ESP32
 * Aiguillage sécurisé avec authentification
 */

#include <WiFi.h>
#include <SocketIOclient.h>
#include <ArduinoJson.h>

// Configuration WiFi
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Configuration serveur
const char* server_host = "192.168.1.100"; // IP du serveur
const uint16_t server_port = 3000;

// Configuration module
const String MODULE_ID = "MC-0001-ST";
const String MODULE_PASSWORD = "F674iaRftVsHGKOA8hq3TI93HQHUaYqZ";

// Variables globales
SocketIOclient socketIO;
String currentPosition = "left"; // Position initiale
unsigned long uptimeStart = 0;
bool isAuthenticated = false;

// Pins hardware
const int LED_LEFT_PIN  = 2;
const int LED_RIGHT_PIN = 4;

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
  socketIO.loop();
  
  // Pas de heartbeat - Socket.io gère automatiquement les déconnexions
  // L'ESP32 répond uniquement aux commandes et événements
  
  delay(100); // Petit délai pour éviter de surcharger le CPU
}

void connectWiFi() {
  Serial.print("[SWITCH TRACK] 🌐 Connexion WiFi à ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println();
  Serial.print("[SWITCH TRACK] ✅ WiFi connecté - IP: ");
  Serial.println(WiFi.localIP());
}

void connectSocket() {
  Serial.println("[SWITCH TRACK] 🔗 Connexion au serveur WebSocket...");
  Serial.println("[SWITCH TRACK] 📍 Module ID: " + MODULE_ID);
  Serial.println("[SWITCH TRACK] 🔑 Password: " + MODULE_PASSWORD.substring(0, 8) + "...");
  
  // Configuration Socket.io
  socketIO.begin(server_host, server_port, "/socket.io/?EIO=4");
  
  // Événements Socket.io
  socketIO.onEvent(socketIOEvent);
  
  Serial.println("[SWITCH TRACK] ✅ ESP32 Switch Track prêt!");
}

void socketIOEvent(socketIOmessageType_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case sIOtype_CONNECT:
      Serial.println("[SWITCH TRACK] 🟢 Connecté au serveur WebSocket");
      authenticateModule();
      break;
      
    case sIOtype_DISCONNECT:
      Serial.println("[SWITCH TRACK] 🔴 Déconnexion du serveur");
      isAuthenticated = false;
      // Éteindre toutes les LEDs lors de la déconnexion
      digitalWrite(LED_LEFT_PIN, LOW);
      digitalWrite(LED_RIGHT_PIN, LOW);
      break;
      
    case sIOtype_EVENT: {
      String eventName = getEventName((char*)payload);
      
      if (eventName == "connected") {
        handleConnected((char*)payload);
      } else if (eventName == "command") {
        handleCommand((char*)payload);
      } else if (eventName == "error") {
        handleError((char*)payload);
      }
      break;
    }
    
    default:
      break;
  }
}

void authenticateModule() {
  Serial.println("[SWITCH TRACK] 📤 Authentification...");
  
  // Création du payload d'authentification
  DynamicJsonDocument doc(1024);
  doc["moduleId"] = MODULE_ID;
  doc["password"] = MODULE_PASSWORD;
  doc["uptime"] = millis() - uptimeStart;
  doc["position"] = currentPosition;
  doc["type"] = "Switch Track";
  
  String payload;
  serializeJson(doc, payload);
  
  // Envoi de l'authentification
  socketIO.sendEVENT("module_identify", payload);
  
  Serial.println("[SWITCH TRACK] 📤 Authentification envoyée avec état initial: " + currentPosition);
}

void handleConnected(const char* payload) {
  Serial.println("[SWITCH TRACK] ✅ Module authentifié");
  
  isAuthenticated = true;
  updateLEDs(); // Mettre à jour les LEDs selon la position
  
  // Socket.io gère automatiquement la surveillance - pas de télémétrie nécessaire
}

void handleCommand(const char* payload) {
  if (!isAuthenticated) {
    Serial.println("[SWITCH TRACK] ⚠️ Commande refusée - non authentifié");
    return;
  }
  
  // Parse du JSON
  DynamicJsonDocument doc(512);
  deserializeJson(doc, payload);
  
  String command = doc["command"];
  Serial.println("[SWITCH TRACK] 📡 Commande reçue: " + command);
  
  // Traitement des commandes
  if (command == "switch_left" || command == "left") {
    currentPosition = "left";
    Serial.println("[SWITCH TRACK] 🔄 Aiguillage basculé vers la GAUCHE");
    updateLEDs(); // Allumer LED gauche
    
  } else if (command == "switch_right" || command == "right") {
    currentPosition = "right";
    Serial.println("[SWITCH TRACK] 🔄 Aiguillage basculé vers la DROITE");
    updateLEDs(); // Allumer LED droite
    
  } else {
    Serial.println("[SWITCH TRACK] ⚠️ Commande inconnue: " + command);
    return;
  }
  
  // Pas besoin d'envoyer de télémétrie - Socket.io surveille automatiquement
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

// Utilitaires JSON
String getEventName(const char* payload) {
  // Extraction simple du nom d'événement depuis le payload Socket.io
  String str = String(payload);
  int start = str.indexOf('[') + 2; // Après ["
  int end = str.indexOf('"', start);
  
  if (start > 1 && end > start) {
    return str.substring(start, end);
  }
  
  return "";
}
