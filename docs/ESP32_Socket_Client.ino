/*
 * MicroCoaster ESP32 - Socket.io Client
 * Configuration pour communiquer avec le serveur Node.js
 */

#include <WiFi.h>
#include <SocketIOclient.h>
#include <ArduinoJson.h>

// Configuration WiFi
const char* ssid = "VOTRE_WIFI_SSID";
const char* password = "VOTRE_WIFI_PASSWORD";

// Configuration serveur
const char* server_host = "192.168.1.100";  // IP de votre serveur
const int server_port = 3000;

// Configuration module
const String MODULE_ID = "MC-0001-AP";     // ID unique du module
const String MODULE_TYPE = "Audio Player"; // Type de module

SocketIOclient socketIO;

// Variables d'état
unsigned long lastTelemetry = 0;
const unsigned long TELEMETRY_INTERVAL = 5000; // 5 secondes

void setup() {
  Serial.begin(115200);
  
  // Connexion WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  Serial.println("WiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  
  // Configuration Socket.io
  socketIO.begin(server_host, server_port);
  
  // Gestionnaires d'événements
  socketIO.onEvent(socketIOEvent);
  
  Serial.println("ESP32 ready to connect to MicroCoaster server");
}

void loop() {
  socketIO.loop();
  
  // Envoyer télémétrie régulièrement
  if (millis() - lastTelemetry > TELEMETRY_INTERVAL) {
    sendTelemetry();
    lastTelemetry = millis();
  }
}

void socketIOEvent(socketIOmessageType_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case sIOtype_DISCONNECT:
      Serial.println("[Socket.io] Disconnected");
      break;
      
    case sIOtype_CONNECT:
      Serial.println("[Socket.io] Connected to server");
      // S'identifier auprès du serveur
      identifyModule();
      break;
      
    case sIOtype_EVENT:
      handleSocketEvent((char*)payload, length);
      break;
      
    case sIOtype_ERROR:
      Serial.printf("[Socket.io] Error: %s\n", payload);
      break;
      
    default:
      break;
  }
}

void identifyModule() {
  DynamicJsonDocument doc(1024);
  doc["moduleId"] = MODULE_ID;
  doc["type"] = MODULE_TYPE;
  
  String output;
  serializeJson(doc, output);
  
  Serial.println("[Socket.io] Identifying module: " + output);
  socketIO.emit("module_identify", output.c_str());
}

void sendTelemetry() {
  DynamicJsonDocument doc(1024);
  
  // Données communes
  doc["uptime_ms"] = millis();
  
  // Données spécifiques au type de module (Audio Player)
  JsonArray playlist = doc.createNestedArray("playlist");
  JsonObject track1 = playlist.createNestedObject();
  track1["file"] = "001.mp3";
  track1["title"] = "Taron";
  
  JsonObject track2 = playlist.createNestedObject();
  track2["file"] = "002.mp3";
  track2["title"] = "Klugheim Ambience";
  
  doc["current"] = 0;
  doc["ready"] = true;
  
  String output;
  serializeJson(doc, output);
  
  socketIO.emit("telemetry", output.c_str());
  Serial.println("[Telemetry] Sent: " + output);
}

void handleSocketEvent(const char* payload, size_t length) {
  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, payload);
  
  if (error) {
    Serial.println("[Socket.io] JSON parse error");
    return;
  }
  
  String event = doc[0]; // Premier élément = nom de l'événement
  JsonObject data = doc[1]; // Deuxième élément = données
  
  Serial.println("[Socket.io] Event: " + event);
  
  if (event == "connected") {
    Serial.println("[Socket.io] Module registered successfully");
  }
  else if (event == "command") {
    handleCommand(data);
  }
  else if (event == "error") {
    Serial.println("[Socket.io] Server error: " + data["message"].as<String>());
  }
}

void handleCommand(JsonObject commandData) {
  String command = commandData["payload"]["command"];
  JsonObject params = commandData["payload"]["params"];
  
  Serial.println("[Command] Received: " + command);
  
  // Exemples de commandes pour Audio Player
  if (command == "play") {
    int track = params["track"] | 0;
    Serial.println("[Audio] Playing track: " + String(track));
    // Code pour jouer le track
  }
  else if (command == "stop") {
    Serial.println("[Audio] Stopping playback");
    // Code pour arrêter la lecture
  }
  else if (command == "volume") {
    int volume = params["volume"] | 50;
    Serial.println("[Audio] Setting volume: " + String(volume));
    // Code pour ajuster le volume
  }
  else if (command == "next") {
    Serial.println("[Audio] Next track");
    // Code pour passer au track suivant
  }
  else if (command == "prev") {
    Serial.println("[Audio] Previous track");
    // Code pour revenir au track précédent
  }
  else {
    Serial.println("[Command] Unknown command: " + command);
  }
}