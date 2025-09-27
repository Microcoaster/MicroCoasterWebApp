/*
 * ================================================================================
 * MICROCOASTER ESP32 - SWITCH TRACK FIRMWARE
 * ================================================================================
 * 
 * Purpose: Firmware pour module Switch Track (aiguillage)
 * Hardware: ESP32 + 2 LEDs + servomoteur/relais pour aiguillage
 * Author: MicroCoaster Development Team
 * Version: 1.0
 * 
 * Description:
 * Contrôle un aiguillage de train avec 2 positions exclusives (gauche/droite)
 * Communication sécurisée avec le serveur via WebSocket
 * Authentification par moduleId + password sur chaque message
 * 
 * Connexions hardware:
 * - LED_LEFT_PIN : LED indicatrice position gauche
 * - LED_RIGHT_PIN : LED indicatrice position droite  
 * - SERVO_PIN : Servo moteur pour l'aiguillage physique
 * 
 * ================================================================================
 */

#include <WiFi.h>
#include <SocketIOclient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <Preferences.h>

// ================================================================================
// CONFIGURATION HARDWARE
// ================================================================================

// Pins des LEDs
#define LED_LEFT_PIN    2
#define LED_RIGHT_PIN   4
#define SERVO_PIN      18

// Angles du servomoteur (ajustez selon votre hardware)
#define SERVO_LEFT_ANGLE   45
#define SERVO_RIGHT_ANGLE  135

// ================================================================================
// CONFIGURATION RÉSEAU ET AUTHENTIFICATION
// ================================================================================

// Configuration WiFi (à modifier selon votre réseau)
const char* WIFI_SSID = "VotreWiFi";
const char* WIFI_PASSWORD = "VotreMotDePasseWiFi";

// Configuration serveur
const char* SERVER_HOST = "192.168.1.100";  // IP de votre serveur
const int SERVER_PORT = 3000;

// Authentification module (UNIQUE PAR MODULE - gravé en usine)
const char* MODULE_ID = "MC-0001-ST";
const char* MODULE_PASSWORD = "F674iaRftVsHGKOA8hq3TI93HQHUaYqZ";

// ================================================================================
// VARIABLES GLOBALES
// ================================================================================

SocketIOclient socketIO;
Servo switchServo;
Preferences preferences;

// État du module
typedef enum {
  POSITION_LEFT,
  POSITION_RIGHT
} SwitchPosition;

SwitchPosition currentPosition = POSITION_LEFT;
unsigned long uptimeStart = 0;
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 10000; // 10 secondes

// États de connexion
bool wifiConnected = false;
bool serverConnected = false;

// ================================================================================
// FONCTIONS UTILITAIRES
// ================================================================================

void log(String message) {
  Serial.println("[SWITCH-TRACK] " + message);
}

void blinkLED(int pin, int times = 3) {
  for(int i = 0; i < times; i++) {
    digitalWrite(pin, HIGH);
    delay(200);
    digitalWrite(pin, LOW);
    delay(200);
  }
}

// ================================================================================
// GESTION HARDWARE
// ================================================================================

void initHardware() {
  log("Initialisation hardware...");
  
  // Configuration des LEDs
  pinMode(LED_LEFT_PIN, OUTPUT);
  pinMode(LED_RIGHT_PIN, OUTPUT);
  
  // Test des LEDs
  blinkLED(LED_LEFT_PIN);
  blinkLED(LED_RIGHT_PIN);
  
  // Configuration du servomoteur
  switchServo.attach(SERVO_PIN);
  
  // Lecture de la position sauvegardée
  preferences.begin("switch-track", false);
  int savedPosition = preferences.getInt("position", POSITION_LEFT);
  currentPosition = (SwitchPosition)savedPosition;
  
  // Appliquer la position sauvegardée
  applyPhysicalPosition();
  
  log("Hardware initialisé - Position: " + String(currentPosition == POSITION_LEFT ? "LEFT" : "RIGHT"));
}

void applyPhysicalPosition() {
  // Contrôler le servomoteur
  if(currentPosition == POSITION_LEFT) {
    switchServo.write(SERVO_LEFT_ANGLE);
    digitalWrite(LED_LEFT_PIN, HIGH);
    digitalWrite(LED_RIGHT_PIN, LOW);
  } else {
    switchServo.write(SERVO_RIGHT_ANGLE);
    digitalWrite(LED_LEFT_PIN, LOW);
    digitalWrite(LED_RIGHT_PIN, HIGH);
  }
  
  // Sauvegarder en mémoire non-volatile
  preferences.putInt("position", currentPosition);
  
  delay(500); // Laisser le temps au servo de bouger
}

void switchToPosition(SwitchPosition newPosition) {
  if(newPosition == currentPosition) {
    log("Position déjà correcte: " + String(currentPosition == POSITION_LEFT ? "LEFT" : "RIGHT"));
    return;
  }
  
  log("Basculement vers: " + String(newPosition == POSITION_LEFT ? "LEFT" : "RIGHT"));
  
  currentPosition = newPosition;
  applyPhysicalPosition();
  
  log("Basculement terminé");
}

// ================================================================================
// GESTION WIFI
// ================================================================================

void initWiFi() {
  log("Connexion WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while(WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(1000);
    log("Tentative WiFi " + String(attempts + 1) + "/20");
    attempts++;
  }
  
  if(WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    log("WiFi connecté - IP: " + WiFi.localIP().toString());
  } else {
    log("ERREUR: Impossible de se connecter au WiFi");
  }
}

// ================================================================================
// COMMUNICATION WEBSOCKET
// ================================================================================

String createAuthenticatedPayload() {
  DynamicJsonDocument doc(512);
  
  doc["moduleId"] = MODULE_ID;
  doc["password"] = MODULE_PASSWORD;
  doc["uptime"] = millis() - uptimeStart;
  doc["position"] = (currentPosition == POSITION_LEFT) ? "left" : "right";
  
  String payload;
  serializeJson(doc, payload);
  return payload;
}

void sendTelemetry() {
  if(!serverConnected) return;
  
  String payload = createAuthenticatedPayload();
  socketIO.sendEVENT("telemetry", payload);
  
  log("Télémétrie envoyée: " + String(currentPosition == POSITION_LEFT ? "LEFT" : "RIGHT"));
}

void handleCommand(String command) {
  log("Commande reçue: " + command);
  
  if(command == "switch_left") {
    switchToPosition(POSITION_LEFT);
  } else if(command == "switch_right") {
    switchToPosition(POSITION_RIGHT);
  } else {
    log("Commande inconnue: " + command);
    return;
  }
  
  // Envoyer immédiatement la télémétrie mise à jour
  sendTelemetry();
}

void socketIOEvent(socketIOmessageType_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case sIOtype_DISCONNECT:
      log("Déconnecté du serveur");
      serverConnected = false;
      break;
      
    case sIOtype_CONNECT:
      log("Connecté au serveur WebSocket");
      
      // Authentification avec état initial
      {
        DynamicJsonDocument authDoc(512);
        authDoc["moduleId"] = MODULE_ID;
        authDoc["password"] = MODULE_PASSWORD;
        authDoc["type"] = "Switch Track";
        authDoc["uptime"] = millis() - uptimeStart;
        authDoc["position"] = (currentPosition == POSITION_LEFT) ? "left" : "right";
        
        String authPayload;
        serializeJson(authDoc, authPayload);
        socketIO.sendEVENT("module_identify", authPayload);
        
        log("Authentification envoyée");
      }
      break;
      
    case sIOtype_EVENT:
      {
        DynamicJsonDocument doc(512);
        deserializeJson(doc, payload, length);
        
        String eventName = doc[0];
        
        if(eventName == "connected") {
          log("Module authentifié avec succès");
          serverConnected = true;
          
        } else if(eventName == "command") {
          JsonObject commandData = doc[1];
          String command = commandData["command"];
          handleCommand(command);
          
        } else {
          log("Événement inconnu: " + eventName);
        }
      }
      break;
      
    default:
      break;
  }
}

void initWebSocket() {
  log("Initialisation WebSocket...");
  
  socketIO.begin(SERVER_HOST, SERVER_PORT, "/socket.io/?EIO=4");
  socketIO.onEvent(socketIOEvent);
  
  log("WebSocket configuré");
}

// ================================================================================
// BOUCLE PRINCIPALE
// ================================================================================

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  log("=== MICROCOASTER SWITCH TRACK v1.0 ===");
  log("Module ID: " + String(MODULE_ID));
  
  uptimeStart = millis();
  
  // Initialisation
  initHardware();
  initWiFi();
  
  if(wifiConnected) {
    initWebSocket();
  }
  
  log("Système prêt!");
}

void loop() {
  // Maintenir la connexion WebSocket
  if(wifiConnected) {
    socketIO.loop();
    
    // Heartbeat toutes les 10 secondes
    unsigned long now = millis();
    if(serverConnected && (now - lastHeartbeat >= HEARTBEAT_INTERVAL)) {
      sendTelemetry();
      lastHeartbeat = now;
    }
  }
  
  // Vérification WiFi
  if(WiFi.status() != WL_CONNECTED && wifiConnected) {
    log("WiFi déconnecté - tentative de reconnexion");
    wifiConnected = false;
    serverConnected = false;
    initWiFi();
  }
  
  delay(100); // Éviter la surcharge CPU
}

// ================================================================================
// FONCTIONS DE DEBUG (optionnelles)
// ================================================================================

void printStatus() {
  log("=== STATUS ===");
  log("WiFi: " + String(wifiConnected ? "OK" : "NOK"));
  log("Serveur: " + String(serverConnected ? "OK" : "NOK"));
  log("Position: " + String(currentPosition == POSITION_LEFT ? "LEFT" : "RIGHT"));
  log("Uptime: " + String((millis() - uptimeStart) / 1000) + "s");
}

// Fonction appelable depuis le moniteur série pour debug
void handleSerialCommands() {
  if(Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    
    if(cmd == "status") {
      printStatus();
    } else if(cmd == "left") {
      handleCommand("switch_left");
    } else if(cmd == "right") {
      handleCommand("switch_right");
    } else if(cmd == "telemetry") {
      sendTelemetry();
    }
  }
}