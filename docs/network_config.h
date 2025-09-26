/*
 * Configuration réseau pour ESP32 MicroCoaster
 * À adapter selon votre environnement
 */

#ifndef NETWORK_CONFIG_H
#define NETWORK_CONFIG_H

// ===========================================
// CONFIGURATION WIFI
// ===========================================

// Point d'accès WiFi principal
const char* WIFI_SSID = "VOTRE_WIFI_SSID";
const char* WIFI_PASSWORD = "VOTRE_WIFI_PASSWORD";

// Point d'accès WiFi de secours (optionnel)
const char* WIFI_SSID_BACKUP = "BACKUP_WIFI";
const char* WIFI_PASSWORD_BACKUP = "BACKUP_PASSWORD";

// ===========================================
// CONFIGURATION SERVEUR
// ===========================================

// Adresse IP du serveur MicroCoaster WebApp
// Option 1: IP fixe locale (recommandé pour développement)
const char* SERVER_HOST = "192.168.1.100";

// Option 2: Nom de domaine (pour production)
// const char* SERVER_HOST = "microcoaster.yourdomain.com";

// Port du serveur Socket.io
const int SERVER_PORT = 3000;

// ===========================================
// CONFIGURATION MODULE
// ===========================================

// ID unique du module (OBLIGATOIRE - doit être unique)
// Format recommandé: MC-XXXX-TYPE
// Types: STN (Station), ST (Switch Track), LFX (Light FX), 
//        LT (Launch Track), SM (Smoke Machine), AP (Audio Player)

// Exemples d'IDs par type de module:
const String MODULE_ID = "MC-0001-AP";        // Audio Player
// const String MODULE_ID = "MC-0001-STN";    // Station
// const String MODULE_ID = "MC-0001-ST";     // Switch Track
// const String MODULE_ID = "MC-0001-LFX";    // Light FX
// const String MODULE_ID = "MC-0001-LT";     // Launch Track
// const String MODULE_ID = "MC-0001-SM";     // Smoke Machine

// Type de module (doit correspondre au suffixe de l'ID)
const String MODULE_TYPE = "Audio Player";
// const String MODULE_TYPE = "Station";
// const String MODULE_TYPE = "Switch Track";
// const String MODULE_TYPE = "Light FX";
// const String MODULE_TYPE = "Launch Track";
// const String MODULE_TYPE = "Smoke Machine";

// ===========================================
// TIMEOUTS ET INTERVALLES
// ===========================================

// Intervalle d'envoi de télémétrie (en millisecondes)
const unsigned long TELEMETRY_INTERVAL = 5000;  // 5 secondes

// Timeout de connexion WiFi (en millisecondes)
const unsigned long WIFI_TIMEOUT = 30000;       // 30 secondes

// Timeout de reconnexion automatique (en millisecondes)
const unsigned long RECONNECT_INTERVAL = 10000; // 10 secondes

// ===========================================
// PINS MATÉRIEL (à adapter selon votre PCB)
// ===========================================

// LED de statut
const int STATUS_LED_PIN = 2;

// Bouton d'urgence
const int EMERGENCY_BUTTON_PIN = 4;

// Pins spécifiques par type de module
#if defined(AUDIO_PLAYER_MODULE)
  const int AUDIO_TX_PIN = 16;
  const int AUDIO_RX_PIN = 17;
  const int VOLUME_PIN = 25;
#elif defined(STATION_MODULE)
  const int GATE_SERVO_PIN = 18;
  const int HARNESS_SERVO_PIN = 19;
  const int NSF_SENSOR_PIN = 21;
  const int DISPATCH_BUTTON_PIN = 22;
#elif defined(SWITCH_TRACK_MODULE)
  const int TRANSFER_SERVO_PIN = 18;
  const int LEFT_SENSOR_PIN = 21;
  const int RIGHT_SENSOR_PIN = 22;
#endif

// ===========================================
// OPTIONS DE DÉBOGAGE
// ===========================================

// Activer les logs série détaillés
#define DEBUG_SERIAL true

// Activer les logs Socket.io
#define DEBUG_SOCKETIO true

// Activer les logs télémétrie
#define DEBUG_TELEMETRY true

// Vitesse du port série
#define SERIAL_BAUD_RATE 115200

#endif // NETWORK_CONFIG_H