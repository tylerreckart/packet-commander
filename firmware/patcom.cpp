/*
 * PATCOM - Universal Programmable Button Matrix Controller
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <SPIFFS.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <AsyncUDP.h>

// Configuration constants
const char* DEVICE_NAME = "PATCOM";
const char* VERSION = "2.1.0";
const int CONFIG_SIZE = 8192;
const unsigned long HEARTBEAT_INTERVAL = 5000;
const unsigned long BUTTON_DEBOUNCE = 200;
const unsigned long STATUS_LED_BLINK = 500;
const int DISCOVERY_PORT = 12345;
const int CONFIG_PORT = 12346;

// Power management constants
const unsigned long SLEEP_TIMEOUT = 300000;  // 5 minutes of inactivity before sleep
const unsigned long LOW_BATTERY_THRESHOLD = 6000;  // 6.0V threshold for low battery
const unsigned long CRITICAL_BATTERY_THRESHOLD = 5500;  // 5.5V critical battery
const unsigned long POWER_CHECK_INTERVAL = 30000;  // Check power every 30 seconds

// Pin assignments
const int buttonPins[8] = {2, 3, 4, 5, 6, 7, 8, 9};
const int ledPins[8] = {A0, A1, A2, A3, A4, A5, A6, A7};
const int BATTERY_PIN = A8;
const int STATUS_LED_PIN = 13;

// Action types
enum ActionType {
  ACTION_NONE = 0,
  ACTION_HTTP = 1,
  ACTION_SERIAL = 2,
  ACTION_MIDI = 3,
  ACTION_SCRIPT = 4,
  ACTION_OSC = 5,
  ACTION_WEBHOOK = 6,
  ACTION_OUTLET_TOGGLE = 7,
  ACTION_OUTLET_ON = 8,
  ACTION_OUTLET_OFF = 9
};

// Device types for multi-device support
enum DeviceType {
  DEVICE_TYPE_BUTTON_MATRIX = 0,
  DEVICE_TYPE_OUTLET_CONTROLLER = 1,
  DEVICE_TYPE_CUSTOM = 2
};

// Button configuration structure
struct ButtonConfig {
  char name[32];
  ActionType action;
  char actionData[256];  // JSON string for action parameters
  bool enabled;
};

// Network configuration structure
struct NetworkConfig {
  char ssid[64];
  char password[64];
  bool staticIP;
  char ip[16];
  char subnet[16];
  char gateway[16];
  char dns[16];
};

// Device configuration structure
struct DeviceConfig {
  char deviceName[32];
  char deviceId[16];
  DeviceType deviceType;
  int brightness;
  bool discoverable;
  int heartbeatInterval;
  char firmwareVersion[16];
  bool autoSync;
  char configServerUrl[128];
};

// API Keys configuration structure (universal key-value storage)
struct ApiKeyEntry {
  char name[32];
  char value[128];
  bool active;
};

const int MAX_API_KEYS = 16;

// API Keys configuration structure (universal key-value storage)
struct ApiKeyEntry {
  char name[32];
  char value[128];
  bool active;
};

const int MAX_API_KEYS = 16;

// Global variables
ButtonConfig buttonConfigs[8];
NetworkConfig networkConfig;
DeviceConfig deviceConfig;
ApiKeyEntry apiKeys[MAX_API_KEYS];
String customConfig = "{}";
Preferences preferences;
WebServer server(80);
AsyncUDP udpDiscovery;
AsyncUDP udpConfig;
bool configServerMode = false;
String lastConfigHash = "";

// State tracking
bool buttonStates[8] = {false};
bool ledStates[8] = {false};
unsigned long lastButtonPress[8] = {0};
unsigned long lastHeartbeat = 0;
unsigned long lastBatteryCheck = 0;
unsigned long lastStatusBlink = 0;
bool statusLedState = false;
float batteryVoltage = 9.0;
bool wifiConnected = false;
bool configMode = false;

// Power management state
unsigned long lastActivity = 0;
unsigned long lastPowerCheck = 0;
bool lowPowerMode = false;
bool criticalBattery = false;
RTC_DATA_ATTR int bootCount = 0;

// Status LED states
enum StatusLedMode {
  STATUS_OFF = 0,
  STATUS_CONNECTING,
  STATUS_ACTIVE,
  STATUS_LOW_POWER,
  STATUS_ERROR
};
StatusLedMode currentStatusMode = STATUS_OFF;

// Forward declarations
void setupPins();
void loadConfiguration();
void saveConfiguration();
void connectWiFi();
void setupWebServer();
void setupDiscoveryService();
void setupConfigService();
void handleButtonPress(int buttonIndex);
void executeAction(int buttonIndex);
void executeHttpAction(int buttonIndex, const char* actionData);
void executeSerialAction(int buttonIndex, const char* actionData);
void executeMidiAction(int buttonIndex, const char* actionData);
void executeScriptAction(int buttonIndex, const char* actionData);
void executeOscAction(int buttonIndex, const char* actionData);
void executeWebhookAction(int buttonIndex, const char* actionData);
void updateLEDs();
void checkBattery();
void sendHeartbeat();
void handleSerialCommands();
void processSerialCommand(String command);
void sendJsonResponse(const char* type, const char* message, bool success = true);
void sendDeviceInfo();
void handleConfigUpload();
void handleConfigUpload(String configJson);
void broadcastDiscovery();
void handleDiscoveryRequest(AsyncUDPPacket packet);
void handleConfigRequest(AsyncUDPPacket packet);
void syncConfigWithServer();
String generateConfigHash();
void validateConfiguration();
bool isValidIP(const char* ip);
bool isValidUrl(const char* url);
void checkPowerManagement();
void enterDeepSleep();
void updateActivity();
void configurePowerSaving();
void updateStatusLED();
void setStatusLED(StatusLedMode mode);

void setup() {
  Serial.begin(115200);
  delay(100);
  
  // Increment boot count for debugging
  ++bootCount;
  
  Serial.println("\n=== PATCOM CONFIGURABLE v" + String(VERSION) + " ===");
  Serial.println("Boot #" + String(bootCount));
  Serial.println("Initializing...");
  
  // Setup hardware first to control status LED
  setupPins();
  
  // Flash status LED to indicate wake/boot
  for (int i = 0; i < 6; i++) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    delay(100);
    digitalWrite(STATUS_LED_PIN, LOW);
    delay(100);
  }
  
  // Print wakeup reason
  esp_sleep_wakeup_cause_t wakeup_reason = esp_sleep_get_wakeup_cause();
  switch(wakeup_reason) {
    case ESP_SLEEP_WAKEUP_EXT0:
      Serial.println("Wakeup caused by button press");
      break;
    case ESP_SLEEP_WAKEUP_TIMER:
      Serial.println("Wakeup caused by timer");
      break;
    case ESP_SLEEP_WAKEUP_UNDEFINED:
    default:
      Serial.println("Fresh start or reset");
      break;
  }
  
  // Initialize SPIFFS for configuration storage
  if (!SPIFFS.begin(true)) {
    Serial.println("ERROR: SPIFFS Mount Failed");
    setStatusLED(STATUS_ERROR);
    delay(2000);
  }
  
  // Configure power saving features
  configurePowerSaving();
  
  // Load configuration from flash
  loadConfiguration();
  
  // Validate configuration
  validateConfiguration();
  
  // Initialize activity tracking
  lastActivity = millis();
  lastPowerCheck = millis();
  
  // Set status LED to connecting mode before WiFi
  setStatusLED(STATUS_CONNECTING);
  
  // Connect to WiFi
  connectWiFi();
  
  // Setup web server for configuration
  setupWebServer();
  
  // Setup discovery and config services
  setupDiscoveryService();
  setupConfigService();
  
  // Setup mDNS for device discovery
  if (wifiConnected) {
    if (MDNS.begin(deviceConfig.deviceName)) {
      MDNS.addService("patcom", "tcp", 80);
      MDNS.addService("patcom-discovery", "udp", DISCOVERY_PORT);
      MDNS.addService("patcom-config", "udp", CONFIG_PORT);
      MDNS.addServiceTxt("patcom", "tcp", "version", VERSION);
      MDNS.addServiceTxt("patcom", "tcp", "device_type", String(deviceConfig.deviceType).c_str());
      MDNS.addServiceTxt("patcom", "tcp", "device_id", deviceConfig.deviceId);
      Serial.println("mDNS responder started: " + String(deviceConfig.deviceName) + ".local");
    }
  }
  
  // Start broadcasting discovery if enabled
  if (deviceConfig.discoverable && wifiConnected) {
    broadcastDiscovery();
  }
  
  // Set final status LED state
  if (wifiConnected) {
    setStatusLED(STATUS_ACTIVE);
  } else {
    setStatusLED(STATUS_ERROR);
  }
  
  Serial.println("Setup complete!");
  Serial.println("Commands: CONFIG, STATUS, WIFI, BATTERY, HELP");
  sendDeviceInfo();
}

void loop() {
  // Handle web server requests
  server.handleClient();
  
  // Check button presses
  for (int i = 0; i < 8; i++) {
    if (digitalRead(buttonPins[i]) == LOW) {
      if (millis() - lastButtonPress[i] > BUTTON_DEBOUNCE) {
        lastButtonPress[i] = millis();
        updateActivity();  // Record activity for power management
        handleButtonPress(i);
      }
    }
  }
  
  // Send periodic heartbeat
  if (millis() - lastHeartbeat > deviceConfig.heartbeatInterval) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }
  
  // Check battery every minute
  if (millis() - lastBatteryCheck > 60000) {
    checkBattery();
    lastBatteryCheck = millis();
  }
  
  // Check power management
  if (millis() - lastPowerCheck > POWER_CHECK_INTERVAL) {
    checkPowerManagement();
    lastPowerCheck = millis();
  }
  
  // Update status LED
  updateStatusLED();
  
  // Handle serial commands
  handleSerialCommands();
  
  // Periodic discovery broadcast (every 30 seconds, disabled in low power mode)
  static unsigned long lastDiscoveryBroadcast = 0;
  if (deviceConfig.discoverable && wifiConnected && !lowPowerMode && (millis() - lastDiscoveryBroadcast > 30000)) {
    broadcastDiscovery();
    lastDiscoveryBroadcast = millis();
  }
  
  // Periodic config sync (every 60 seconds, disabled in low power mode)
  static unsigned long lastConfigSync = 0;
  if (deviceConfig.autoSync && wifiConnected && !lowPowerMode && (millis() - lastConfigSync > 60000)) {
    syncConfigWithServer();
    lastConfigSync = millis();
  }
  
  // Update LEDs
  updateLEDs();
  
  // Variable delay based on power mode
  if (criticalBattery) {
    delay(100);  // Minimal delay in critical mode
  } else if (lowPowerMode) {
    delay(50);   // Longer delay in low power mode
  } else {
    delay(10);   // Normal operation
  }
}

void setupPins() {
  // Configure buttons with internal pullup
  for (int i = 0; i < 8; i++) {
    pinMode(buttonPins[i], INPUT_PULLUP);
    pinMode(ledPins[i], OUTPUT);
    digitalWrite(ledPins[i], LOW);
  }
  
  // Configure other pins
  pinMode(BATTERY_PIN, INPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
}

void loadConfiguration() {
  preferences.begin("patcom", true);
  
  // Load device config
  strcpy(deviceConfig.deviceName, preferences.getString("deviceName", "PATCOM").c_str());
  strcpy(deviceConfig.deviceId, preferences.getString("deviceId", "PATCOM-" + String(ESP.getEfuseMac(), HEX)).c_str());
  deviceConfig.deviceType = (DeviceType)preferences.getInt("deviceType", DEVICE_TYPE_BUTTON_MATRIX);
  deviceConfig.brightness = preferences.getInt("brightness", 255);
  deviceConfig.discoverable = preferences.getBool("discoverable", true);
  deviceConfig.heartbeatInterval = preferences.getInt("heartbeat", 5000);
  strcpy(deviceConfig.firmwareVersion, VERSION);
  deviceConfig.autoSync = preferences.getBool("autoSync", false);
  strcpy(deviceConfig.configServerUrl, preferences.getString("configServer", "").c_str());
  
  // Load API keys
  int apiKeyCount = preferences.getInt("apiKeyCount", 0);
  for (int i = 0; i < MAX_API_KEYS; i++) {
    apiKeys[i].active = false;
    strcpy(apiKeys[i].name, "");
    strcpy(apiKeys[i].value, "");
  }
  
  for (int i = 0; i < apiKeyCount && i < MAX_API_KEYS; i++) {
    String prefix = "apiKey" + String(i) + "_";
    strcpy(apiKeys[i].name, preferences.getString(prefix + "name", "").c_str());
    strcpy(apiKeys[i].value, preferences.getString(prefix + "value", "").c_str());
    apiKeys[i].active = strlen(apiKeys[i].name) > 0;
  }
  
  // Load custom config
  customConfig = preferences.getString("customConfig", "{}");
  
  // Load network config
  strcpy(networkConfig.ssid, preferences.getString("ssid", "").c_str());
  strcpy(networkConfig.password, preferences.getString("password", "").c_str());
  networkConfig.staticIP = preferences.getBool("staticIP", false);
  strcpy(networkConfig.ip, preferences.getString("ip", "").c_str());
  strcpy(networkConfig.subnet, preferences.getString("subnet", "").c_str());
  strcpy(networkConfig.gateway, preferences.getString("gateway", "").c_str());
  strcpy(networkConfig.dns, preferences.getString("dns", "8.8.8.8").c_str());
  
  // Load button configs
  for (int i = 0; i < 8; i++) {
    String prefix = "btn" + String(i) + "_";
    strcpy(buttonConfigs[i].name, preferences.getString(prefix + "name", "Button " + String(i)).c_str());
    buttonConfigs[i].action = (ActionType)preferences.getInt(prefix + "action", ACTION_NONE);
    strcpy(buttonConfigs[i].actionData, preferences.getString(prefix + "data", "{}").c_str());
    buttonConfigs[i].enabled = preferences.getBool(prefix + "enabled", true);
  }
  
  preferences.end();
  Serial.println("Configuration loaded from flash");
}

void saveConfiguration() {
  preferences.begin("patcom", false);
  
  // Save device config
  preferences.putString("deviceName", deviceConfig.deviceName);
  preferences.putString("deviceId", deviceConfig.deviceId);
  preferences.putInt("deviceType", deviceConfig.deviceType);
  preferences.putInt("brightness", deviceConfig.brightness);
  preferences.putBool("discoverable", deviceConfig.discoverable);
  preferences.putInt("heartbeat", deviceConfig.heartbeatInterval);
  preferences.putBool("autoSync", deviceConfig.autoSync);
  preferences.putString("configServer", deviceConfig.configServerUrl);
  
  // Save API keys
  int activeApiKeyCount = 0;
  for (int i = 0; i < MAX_API_KEYS; i++) {
    if (apiKeys[i].active) {
      String prefix = "apiKey" + String(activeApiKeyCount) + "_";
      preferences.putString(prefix + "name", apiKeys[i].name);
      preferences.putString(prefix + "value", apiKeys[i].value);
      activeApiKeyCount++;
    }
  }
  preferences.putInt("apiKeyCount", activeApiKeyCount);
  
  // Save custom config
  preferences.putString("customConfig", customConfig);
  
  // Save network config
  preferences.putString("ssid", networkConfig.ssid);
  preferences.putString("password", networkConfig.password);
  preferences.putBool("staticIP", networkConfig.staticIP);
  preferences.putString("ip", networkConfig.ip);
  preferences.putString("subnet", networkConfig.subnet);
  preferences.putString("gateway", networkConfig.gateway);
  preferences.putString("dns", networkConfig.dns);
  
  // Save button configs
  for (int i = 0; i < 8; i++) {
    String prefix = "btn" + String(i) + "_";
    preferences.putString(prefix + "name", buttonConfigs[i].name);
    preferences.putInt(prefix + "action", buttonConfigs[i].action);
    preferences.putString(prefix + "data", buttonConfigs[i].actionData);
    preferences.putBool(prefix + "enabled", buttonConfigs[i].enabled);
  }
  
  preferences.end();
  Serial.println("Configuration saved to flash");
  
  // Update config hash
  lastConfigHash = generateConfigHash();
}

void connectWiFi() {
  if (strlen(networkConfig.ssid) == 0) {
    Serial.println("No WiFi credentials - entering config mode");
    configMode = true;
    setStatusLED(STATUS_ERROR);
    return;
  }
  
  Serial.print("Connecting to WiFi: " + String(networkConfig.ssid));
  
  // Configure static IP if enabled
  if (networkConfig.staticIP && strlen(networkConfig.ip) > 0) {
    IPAddress local_IP, gateway, subnet, dns;
    local_IP.fromString(networkConfig.ip);
    gateway.fromString(networkConfig.gateway);
    subnet.fromString(networkConfig.subnet);
    dns.fromString(networkConfig.dns);
    
    if (!WiFi.config(local_IP, gateway, subnet, dns)) {
      Serial.println("Static IP configuration failed");
    }
  }
  
  WiFi.begin(networkConfig.ssid, networkConfig.password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
    
    // Status LED will automatically blink in CONNECTING mode
    // Keep button LEDs off during connection
    for (int i = 0; i < 8; i++) {
      digitalWrite(ledPins[i], LOW);
    }
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\nWiFi connected!");
    Serial.println("IP address: " + WiFi.localIP().toString());
    
    // Status LED will be set to ACTIVE in setup()
  } else {
    wifiConnected = false;
    Serial.println("\nWiFi connection failed - entering config mode");
    configMode = true;
    setStatusLED(STATUS_ERROR);
    
    // Start AP mode for configuration
    WiFi.mode(WIFI_AP);
    WiFi.softAP("PATCOM-Config", "patcom123");
    Serial.println("AP started: PATCOM-Config");
    Serial.println("AP IP: " + WiFi.softAPIP().toString());
  }
}

void setupWebServer() {
  // Serve configuration page
  server.on("/", HTTP_GET, []() {
    String html = "<!DOCTYPE html><html><head><title>PATCOM Config</title></head><body>";
    html += "<h1>PATCOM Configuration</h1>";
    html += "<p>Device: " + String(deviceConfig.deviceName) + "</p>";
    html += "<p>Version: " + String(VERSION) + "</p>";
    html += "<p>WiFi: " + (wifiConnected ? "Connected" : "Disconnected") + "</p>";
    html += "<p>Battery: " + String(batteryVoltage, 2) + "V</p>";
    html += "</body></html>";
    server.send(200, "text/html", html);
  });
  
  // API endpoint for configuration
  server.on("/api/config", HTTP_GET, []() {
    StaticJsonDocument<2048> doc;
    doc["device"]["name"] = deviceConfig.deviceName;
    doc["device"]["version"] = VERSION;
    doc["device"]["brightness"] = deviceConfig.brightness;
    doc["device"]["discoverable"] = deviceConfig.discoverable;
    
    doc["network"]["ssid"] = networkConfig.ssid;
    doc["network"]["staticIP"] = networkConfig.staticIP;
    doc["network"]["ip"] = networkConfig.ip;
    doc["network"]["subnet"] = networkConfig.subnet;
    doc["network"]["gateway"] = networkConfig.gateway;
    
    JsonArray buttons = doc.createNestedArray("buttons");
    for (int i = 0; i < 8; i++) {
      JsonObject btn = buttons.createNestedObject();
      btn["id"] = i;
      btn["name"] = buttonConfigs[i].name;
      btn["action"] = buttonConfigs[i].action;
      btn["enabled"] = buttonConfigs[i].enabled;
      
      // Parse action data JSON
      StaticJsonDocument<256> actionDoc;
      deserializeJson(actionDoc, buttonConfigs[i].actionData);
      btn["config"] = actionDoc;
    }
    
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  });
  
  // API endpoint for uploading configuration
  server.on("/api/config", HTTP_POST, handleConfigUpload);
  
  // API endpoint for button testing
  server.on("/api/test", HTTP_POST, []() {
    if (server.hasArg("button")) {
      int buttonIndex = server.arg("button").toInt();
      if (buttonIndex >= 0 && buttonIndex < 8) {
        handleButtonPress(buttonIndex);
        server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Button " + String(buttonIndex) + " triggered\"}");
      } else {
        server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Invalid button index\"}");
      }
    } else {
      server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Missing button parameter\"}");
    }
  });
  
  server.begin();
  Serial.println("Web server started on port 80");
}

void handleButtonPress(int buttonIndex) {
  if (buttonIndex < 0 || buttonIndex >= 8) return;
  
  Serial.println("Button " + String(buttonIndex) + " (" + String(buttonConfigs[buttonIndex].name) + ") pressed");
  
  // Record activity for power management
  updateActivity();
  
  // Toggle LED for visual feedback
  ledStates[buttonIndex] = !ledStates[buttonIndex];
  
  // Execute configured action
  if (buttonConfigs[buttonIndex].enabled) {
    executeAction(buttonIndex);
  }
  
  // Send button press notification
  StaticJsonDocument<128> doc;
  doc["type"] = "button_press";
  doc["button"] = buttonIndex;
  doc["name"] = buttonConfigs[buttonIndex].name;
  doc["timestamp"] = millis();
  
  String message;
  serializeJson(doc, message);
  Serial.println("EVENT:" + message);
}

void executeAction(int buttonIndex) {
  ActionType action = buttonConfigs[buttonIndex].action;
  const char* actionData = buttonConfigs[buttonIndex].actionData;
  
  switch (action) {
    case ACTION_HTTP:
      executeHttpAction(buttonIndex, actionData);
      break;
    case ACTION_SERIAL:
      executeSerialAction(buttonIndex, actionData);
      break;
    case ACTION_MIDI:
      executeMidiAction(buttonIndex, actionData);
      break;
    case ACTION_SCRIPT:
      executeScriptAction(buttonIndex, actionData);
      break;
    case ACTION_OSC:
      executeOscAction(buttonIndex, actionData);
      break;
    case ACTION_WEBHOOK:
      executeWebhookAction(buttonIndex, actionData);
      break;
    case ACTION_NONE:
    default:
      Serial.println("No action configured for button " + String(buttonIndex));
      break;
  }
}

void executeHttpAction(int buttonIndex, const char* actionData) {
  if (!wifiConnected) {
    Serial.println("WiFi not connected - cannot execute HTTP action");
    return;
  }
  
  StaticJsonDocument<256> config;
  deserializeJson(config, actionData);
  
  const char* url = config["url"];
  const char* method = config["method"] | "POST";
  const char* body = config["body"] | "";
  
  if (strlen(url) == 0) {
    Serial.println("No URL configured for HTTP action");
    return;
  }
  
  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("User-Agent", "PATCOM/" + String(VERSION));
  
  int httpCode;
  if (strcmp(method, "GET") == 0) {
    httpCode = http.GET();
  } else if (strcmp(method, "POST") == 0) {
    httpCode = http.POST(body);
  } else if (strcmp(method, "PUT") == 0) {
    httpCode = http.PUT(body);
  } else {
    httpCode = http.POST(body);
  }
  
  if (httpCode > 0) {
    Serial.println("HTTP " + String(method) + " to " + String(url) + " - Response: " + String(httpCode));
    if (httpCode == 200) {
      ledStates[buttonIndex] = true;  // Success - LED on
    }
  } else {
    Serial.println("HTTP request failed: " + String(httpCode));
    // Flash LED to indicate error
    for (int i = 0; i < 3; i++) {
      digitalWrite(ledPins[buttonIndex], HIGH);
      delay(100);
      digitalWrite(ledPins[buttonIndex], LOW);
      delay(100);
    }
  }
  
  http.end();
}

void executeSerialAction(int buttonIndex, const char* actionData) {
  StaticJsonDocument<256> config;
  deserializeJson(config, actionData);
  
  const char* command = config["command"];
  if (strlen(command) > 0) {
    Serial.println("SERIAL_CMD:" + String(command));
  }
}

void executeMidiAction(int buttonIndex, const char* actionData) {
  StaticJsonDocument<256> config;
  deserializeJson(config, actionData);
  
  int note = config["note"] | 60;
  int velocity = config["velocity"] | 127;
  int channel = config["channel"] | 1;
  
  // Send MIDI note on
  Serial.println("MIDI_NOTE:" + String(channel) + "," + String(note) + "," + String(velocity));
  
  // Brief LED flash for MIDI feedback
  digitalWrite(ledPins[buttonIndex], HIGH);
  delay(100);
  digitalWrite(ledPins[buttonIndex], LOW);
}

void executeScriptAction(int buttonIndex, const char* actionData) {
  StaticJsonDocument<256> config;
  deserializeJson(config, actionData);
  
  const char* code = config["code"];
  if (strlen(code) > 0) {
    Serial.println("SCRIPT:" + String(code));
  }
}

void executeOscAction(int buttonIndex, const char* actionData) {
  StaticJsonDocument<256> config;
  deserializeJson(config, actionData);
  
  const char* address = config["address"];
  const char* host = config["host"];
  int port = config["port"] | 8000;
  
  if (strlen(address) > 0 && strlen(host) > 0) {
    Serial.println("OSC:" + String(host) + ":" + String(port) + " " + String(address));
    
    // Flash LED for OSC feedback
    digitalWrite(ledPins[buttonIndex], HIGH);
    delay(50);
    digitalWrite(ledPins[buttonIndex], LOW);
  }
}

void executeWebhookAction(int buttonIndex, const char* actionData) {
  if (!wifiConnected) {
    Serial.println("WiFi not connected - cannot execute webhook");
    return;
  }
  
  StaticJsonDocument<256> config;
  deserializeJson(config, actionData);
  
  const char* url = config["url"];
  const char* secret = config["secret"];
  
  if (strlen(url) == 0) {
    Serial.println("No webhook URL configured");
    return;
  }
  
  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("User-Agent", "PATCOM/" + String(VERSION));
  
  if (strlen(secret) > 0) {
    http.addHeader("X-Webhook-Secret", secret);
  }
  
  // Build webhook payload
  StaticJsonDocument<256> payload;
  payload["device_id"] = deviceConfig.deviceId;
  payload["device_name"] = deviceConfig.deviceName;
  payload["button"] = buttonIndex;
  payload["button_name"] = buttonConfigs[buttonIndex].name;
  payload["timestamp"] = millis();
  payload["battery"] = batteryVoltage;
  
  String payloadStr;
  serializeJson(payload, payloadStr);
  
  int httpCode = http.POST(payloadStr);
  
  if (httpCode > 0) {
    Serial.println("Webhook sent to " + String(url) + " - Response: " + String(httpCode));
    if (httpCode >= 200 && httpCode < 300) {
      ledStates[buttonIndex] = true;  // Success - LED on
    }
  } else {
    Serial.println("Webhook failed: " + String(httpCode));
    // Flash LED to indicate error
    for (int i = 0; i < 3; i++) {
      digitalWrite(ledPins[buttonIndex], HIGH);
      delay(100);
      digitalWrite(ledPins[buttonIndex], LOW);
      delay(100);
    }
  }
  
  http.end();
}

void updateLEDs() {
  for (int i = 0; i < 8; i++) {
    int brightness = map(deviceConfig.brightness, 0, 255, 0, 255);
    analogWrite(ledPins[i], ledStates[i] ? brightness : 0);
  }
}

void checkBattery() {
  int adcValue = analogRead(BATTERY_PIN);
  batteryVoltage = (adcValue / 4095.0) * 3.3 * 4.03;  // Voltage divider calculation
  
  // Convert to millivolts for threshold comparison
  unsigned long batteryMillivolts = (unsigned long)(batteryVoltage * 1000);
  
  if (batteryMillivolts < CRITICAL_BATTERY_THRESHOLD) {
    Serial.println("BATTERY:CRITICAL:" + String(batteryVoltage, 2));
    criticalBattery = true;
  } else if (batteryMillivolts < LOW_BATTERY_THRESHOLD) {
    Serial.println("BATTERY:LOW:" + String(batteryVoltage, 2));
    criticalBattery = false;
  } else {
    criticalBattery = false;
  }
}

void sendHeartbeat() {
  StaticJsonDocument<256> doc;
  doc["type"] = "heartbeat";
  doc["device"] = deviceConfig.deviceName;
  doc["version"] = VERSION;
  doc["uptime"] = millis();
  doc["battery"] = batteryVoltage;
  doc["wifi"] = wifiConnected;
  doc["ip"] = wifiConnected ? WiFi.localIP().toString() : "";
  
  String message;
  serializeJson(doc, message);
  Serial.println("HEARTBEAT:" + message);
}

void handleSerialCommands() {
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    processSerialCommand(command);
  }
}

void processSerialCommand(String command) {
  command.toUpperCase();
  
  if (command == "STATUS") {
    sendDeviceInfo();
  } else if (command == "CONFIG") {
    // Send current configuration as JSON
    StaticJsonDocument<2048> doc;
    doc["device"]["name"] = deviceConfig.deviceName;
    doc["device"]["brightness"] = deviceConfig.brightness;
    doc["network"]["ssid"] = networkConfig.ssid;
    doc["network"]["connected"] = wifiConnected;
    
    JsonArray buttons = doc.createNestedArray("buttons");
    for (int i = 0; i < 8; i++) {
      JsonObject btn = buttons.createNestedObject();
      btn["id"] = i;
      btn["name"] = buttonConfigs[i].name;
      btn["action"] = buttonConfigs[i].action;
      btn["enabled"] = buttonConfigs[i].enabled;
    }
    
    String response;
    serializeJson(doc, response);
    sendJsonResponse("config", response.c_str());
  } else if (command.startsWith("SET_CONFIG:")) {
    // Receive configuration JSON
    String configJson = command.substring(11);
    handleConfigUpload(configJson);
  } else if (command.startsWith("TEST:")) {
    int buttonIndex = command.substring(5).toInt();
    if (buttonIndex >= 0 && buttonIndex < 8) {
      handleButtonPress(buttonIndex);
      sendJsonResponse("test", ("Button " + String(buttonIndex) + " triggered").c_str());
    }
  } else if (command == "WIFI") {
    sendJsonResponse("wifi", wifiConnected ? "Connected" : "Disconnected");
  } else if (command == "BATTERY") {
    checkBattery();
    sendJsonResponse("battery", (String(batteryVoltage, 2) + "V").c_str());
  } else if (command == "HELP") {
    Serial.println("=== PATCOM Commands ===");
    Serial.println("STATUS     - Device information");
    Serial.println("CONFIG     - Get configuration");
    Serial.println("SET_CONFIG:<json> - Upload configuration");
    Serial.println("TEST:<n>   - Test button n");
    Serial.println("WIFI       - WiFi status");
    Serial.println("BATTERY    - Battery voltage");
    Serial.println("HELP       - This help");
  } else {
    sendJsonResponse("error", "Unknown command", false);
  }
}

void sendJsonResponse(const char* type, const char* message, bool success) {
  StaticJsonDocument<256> doc;
  doc["type"] = type;
  doc["success"] = success;
  doc["message"] = message;
  doc["timestamp"] = millis();
  
  String response;
  serializeJson(doc, response);
  Serial.println("RESPONSE:" + response);
}

void sendDeviceInfo() {
  StaticJsonDocument<512> doc;
  doc["type"] = "device_info";
  doc["device"] = deviceConfig.deviceName;
  doc["version"] = VERSION;
  doc["uptime"] = millis();
  doc["battery"] = batteryVoltage;
  doc["wifi"]["connected"] = wifiConnected;
  doc["wifi"]["ssid"] = networkConfig.ssid;
  doc["wifi"]["ip"] = wifiConnected ? WiFi.localIP().toString() : "";
  doc["wifi"]["rssi"] = wifiConnected ? WiFi.RSSI() : 0;
  doc["config_mode"] = configMode;
  
  String response;
  serializeJson(doc, response);
  Serial.println("DEVICE_INFO:" + response);
}

void handleConfigUpload() {
  String body = server.arg("plain");
  handleConfigUpload(body);
}

void handleConfigUpload(String configJson) {
  StaticJsonDocument<2048> doc;
  DeserializationError error = deserializeJson(doc, configJson);
  
  if (error) {
    Serial.println("Failed to parse configuration JSON");
    if (server.client()) {
      server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Invalid JSON\"}");
    } else {
      sendJsonResponse("config_upload", "Invalid JSON", false);
    }
    return;
  }
  
  // Update device configuration
  if (doc.containsKey("device")) {
    if (doc["device"].containsKey("name")) {
      strcpy(deviceConfig.deviceName, doc["device"]["name"]);
    }
    if (doc["device"].containsKey("brightness")) {
      deviceConfig.brightness = doc["device"]["brightness"];
    }
    if (doc["device"].containsKey("discoverable")) {
      deviceConfig.discoverable = doc["device"]["discoverable"];
    }
  }
  
  // Update network configuration
  if (doc.containsKey("network")) {
    if (doc["network"].containsKey("ssid")) {
      strcpy(networkConfig.ssid, doc["network"]["ssid"]);
    }
    if (doc["network"].containsKey("password")) {
      strcpy(networkConfig.password, doc["network"]["password"]);
    }
    if (doc["network"].containsKey("staticIP")) {
      networkConfig.staticIP = doc["network"]["staticIP"];
    }
    if (doc["network"].containsKey("ip")) {
      strcpy(networkConfig.ip, doc["network"]["ip"]);
    }
    if (doc["network"].containsKey("subnet")) {
      strcpy(networkConfig.subnet, doc["network"]["subnet"]);
    }
    if (doc["network"].containsKey("gateway")) {
      strcpy(networkConfig.gateway, doc["network"]["gateway"]);
    }
  }
  
  // Update button configurations
  if (doc.containsKey("buttons")) {
    JsonArray buttons = doc["buttons"];
    for (JsonObject button : buttons) {
      int id = button["id"];
      if (id >= 0 && id < 8) {
        strcpy(buttonConfigs[id].name, button["name"] | ("Button " + String(id)).c_str());
        buttonConfigs[id].action = (ActionType)(button["action"] | ACTION_NONE);
        buttonConfigs[id].enabled = button["enabled"] | true;
        
        // Serialize action config back to JSON string
        if (button.containsKey("config")) {
          String actionData;
          serializeJson(button["config"], actionData);
          strcpy(buttonConfigs[id].actionData, actionData.c_str());
        }
      }
    }
  }
  
  // Save configuration
  saveConfiguration();
  
  Serial.println("Configuration updated successfully");
  
  if (server.client()) {
    server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Configuration updated\"}");
  } else {
    sendJsonResponse("config_upload", "Configuration updated successfully");
  }
  
  // Restart if network config changed
  if (doc.containsKey("network")) {
    Serial.println("Network configuration changed - restarting in 3 seconds...");
    delay(3000);
    ESP.restart();
  }
}

void setupDiscoveryService() {
  if (!wifiConnected) return;
  
  if (udpDiscovery.listen(DISCOVERY_PORT)) {
    Serial.println("Discovery service started on port " + String(DISCOVERY_PORT));
    
    udpDiscovery.onPacket([](AsyncUDPPacket packet) {
      handleDiscoveryRequest(packet);
    });
  }
}

void setupConfigService() {
  if (!wifiConnected) return;
  
  if (udpConfig.listen(CONFIG_PORT)) {
    Serial.println("Config service started on port " + String(CONFIG_PORT));
    
    udpConfig.onPacket([](AsyncUDPPacket packet) {
      handleConfigRequest(packet);
    });
  }
}

void broadcastDiscovery() {
  if (!wifiConnected || !deviceConfig.discoverable) return;
  
  StaticJsonDocument<512> doc;
  doc["type"] = "device_discovery";
  doc["device_id"] = deviceConfig.deviceId;
  doc["device_name"] = deviceConfig.deviceName;
  doc["device_type"] = deviceConfig.deviceType;
  doc["version"] = VERSION;
  doc["ip"] = WiFi.localIP().toString();
  doc["mac"] = WiFi.macAddress();
  doc["battery"] = batteryVoltage;
  doc["uptime"] = millis();
  doc["config_hash"] = generateConfigHash();
  
  String message;
  serializeJson(doc, message);
  
  // Broadcast to subnet
  IPAddress broadcast = WiFi.localIP();
  broadcast[3] = 255;
  udpDiscovery.broadcastTo(message.c_str(), DISCOVERY_PORT, broadcast);
  
  Serial.println("Discovery broadcast sent");
}

void handleDiscoveryRequest(AsyncUDPPacket packet) {
  String request = packet.readString();
  
  StaticJsonDocument<256> requestDoc;
  deserializeJson(requestDoc, request);
  
  if (requestDoc["type"] == "discover_devices") {
    // Send device info response
    StaticJsonDocument<512> responseDoc;
    responseDoc["type"] = "device_response";
    responseDoc["device_id"] = deviceConfig.deviceId;
    responseDoc["device_name"] = deviceConfig.deviceName;
    responseDoc["device_type"] = deviceConfig.deviceType;
    responseDoc["version"] = VERSION;
    responseDoc["ip"] = WiFi.localIP().toString();
    responseDoc["mac"] = WiFi.macAddress();
    responseDoc["battery"] = batteryVoltage;
    responseDoc["uptime"] = millis();
    responseDoc["config_hash"] = generateConfigHash();
    responseDoc["wifi_rssi"] = WiFi.RSSI();
    
    String response;
    serializeJson(responseDoc, response);
    
    packet.printf(response.c_str());
    Serial.println("Discovery response sent to " + packet.remoteIP().toString());
  }
}

void handleConfigRequest(AsyncUDPPacket packet) {
  String request = packet.readString();
  
  StaticJsonDocument<1024> requestDoc;
  deserializeJson(requestDoc, request);
  
  String requestType = requestDoc["type"];
  
  if (requestType == "get_config") {
    // Send current configuration
    StaticJsonDocument<2048> responseDoc;
    responseDoc["type"] = "config_response";
    responseDoc["device_id"] = deviceConfig.deviceId;
    responseDoc["config_hash"] = generateConfigHash();
    
    // Device config
    responseDoc["device"]["name"] = deviceConfig.deviceName;
    responseDoc["device"]["type"] = deviceConfig.deviceType;
    responseDoc["device"]["brightness"] = deviceConfig.brightness;
    responseDoc["device"]["discoverable"] = deviceConfig.discoverable;
    responseDoc["device"]["auto_sync"] = deviceConfig.autoSync;
    
    // Network config (without password)
    responseDoc["network"]["ssid"] = networkConfig.ssid;
    responseDoc["network"]["staticIP"] = networkConfig.staticIP;
    responseDoc["network"]["ip"] = networkConfig.ip;
    
    // Button configs
    JsonArray buttons = responseDoc.createNestedArray("buttons");
    for (int i = 0; i < 8; i++) {
      JsonObject btn = buttons.createNestedObject();
      btn["id"] = i;
      btn["name"] = buttonConfigs[i].name;
      btn["action"] = buttonConfigs[i].action;
      btn["enabled"] = buttonConfigs[i].enabled;
      
      StaticJsonDocument<256> actionDoc;
      deserializeJson(actionDoc, buttonConfigs[i].actionData);
      btn["config"] = actionDoc;
    }
    
    String response;
    serializeJson(responseDoc, response);
    packet.printf(response.c_str());
    
  } else if (requestType == "set_config") {
    // Handle remote configuration update
    handleConfigUpload(request);
    
    StaticJsonDocument<128> responseDoc;
    responseDoc["type"] = "config_update_response";
    responseDoc["success"] = true;
    responseDoc["message"] = "Configuration updated";
    responseDoc["config_hash"] = generateConfigHash();
    
    String response;
    serializeJson(responseDoc, response);
    packet.printf(response.c_str());
  }
}

void syncConfigWithServer() {
  if (!wifiConnected || !deviceConfig.autoSync || strlen(deviceConfig.configServerUrl) == 0) {
    return;
  }
  
  String currentHash = generateConfigHash();
  if (currentHash == lastConfigHash) {
    return; // No changes
  }
  
  HTTPClient http;
  http.begin(deviceConfig.configServerUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-ID", deviceConfig.deviceId);
  http.addHeader("X-Config-Hash", currentHash);
  
  StaticJsonDocument<512> syncDoc;
  syncDoc["device_id"] = deviceConfig.deviceId;
  syncDoc["config_hash"] = currentHash;
  syncDoc["timestamp"] = millis();
  
  String syncPayload;
  serializeJson(syncDoc, syncPayload);
  
  int httpCode = http.POST(syncPayload);
  
  if (httpCode == 200) {
    lastConfigHash = currentHash;
    Serial.println("Config synced with server");
  } else {
    Serial.println("Config sync failed: " + String(httpCode));
  }
  
  http.end();
}

String generateConfigHash() {
  // Simple hash of configuration for change detection
  String configStr = "";
  configStr += deviceConfig.deviceName;
  configStr += String(deviceConfig.brightness);
  configStr += networkConfig.ssid;
  
  for (int i = 0; i < 8; i++) {
    configStr += buttonConfigs[i].name;
    configStr += String(buttonConfigs[i].action);
    configStr += buttonConfigs[i].actionData;
  }
  
  // Simple hash function
  uint32_t hash = 0;
  for (char c : configStr) {
    hash = hash * 31 + c;
  }
  
  return String(hash, HEX);
}

void validateConfiguration() {
  bool hasErrors = false;
  
  // Validate network settings
  if (networkConfig.staticIP) {
    if (!isValidIP(networkConfig.ip)) {
      Serial.println("ERROR: Invalid static IP address");
      hasErrors = true;
    }
    if (!isValidIP(networkConfig.gateway)) {
      Serial.println("ERROR: Invalid gateway address");
      hasErrors = true;
    }
  }
  
  // Validate button actions
  for (int i = 0; i < 8; i++) {
    if (buttonConfigs[i].action == ACTION_HTTP || buttonConfigs[i].action == ACTION_WEBHOOK) {
      StaticJsonDocument<256> config;
      deserializeJson(config, buttonConfigs[i].actionData);
      const char* url = config["url"];
      
      if (strlen(url) > 0 && !isValidUrl(url)) {
        Serial.println("ERROR: Invalid URL for button " + String(i));
        hasErrors = true;
      }
    }
  }
  
  if (hasErrors) {
    Serial.println("Configuration validation failed - some features may not work");
    // Flash all LEDs as warning
    for (int j = 0; j < 3; j++) {
      for (int i = 0; i < 8; i++) {
        digitalWrite(ledPins[i], HIGH);
      }
      delay(200);
      for (int i = 0; i < 8; i++) {
        digitalWrite(ledPins[i], LOW);
      }
      delay(200);
    }
  } else {
    Serial.println("Configuration validation passed");
  }
}

bool isValidIP(const char* ip) {
  IPAddress addr;
  return addr.fromString(ip);
}

bool isValidUrl(const char* url) {
  String urlStr = String(url);
  return urlStr.startsWith("http://") || urlStr.startsWith("https://");
}

// API Key helper functions
String getApiKey(const char* keyName) {
  for (int i = 0; i < MAX_API_KEYS; i++) {
    if (apiKeys[i].active && strcmp(apiKeys[i].name, keyName) == 0) {
      return String(apiKeys[i].value);
    }
  }
  return "";
}

void setApiKey(const char* keyName, const char* value) {
  // First try to update existing key
  for (int i = 0; i < MAX_API_KEYS; i++) {
    if (apiKeys[i].active && strcmp(apiKeys[i].name, keyName) == 0) {
      strcpy(apiKeys[i].value, value);
      return;
    }
  }
  
  // If not found, add new key
  for (int i = 0; i < MAX_API_KEYS; i++) {
    if (!apiKeys[i].active) {
      strcpy(apiKeys[i].name, keyName);
      strcpy(apiKeys[i].value, value);
      apiKeys[i].active = true;
      return;
    }
  }
}

void removeApiKey(const char* keyName) {
  for (int i = 0; i < MAX_API_KEYS; i++) {
    if (apiKeys[i].active && strcmp(apiKeys[i].name, keyName) == 0) {
      apiKeys[i].active = false;
      strcpy(apiKeys[i].name, "");
      strcpy(apiKeys[i].value, "");
      return;
    }
  }
}

// Power Management Functions

void configurePowerSaving() {
  // Configure CPU frequency scaling
  setCpuFrequencyMhz(80);  // Reduce CPU frequency to save power
  
  // Configure WiFi power save mode
  WiFi.setSleep(true);
  
  // Configure external wakeup on button press (any button can wake)
  esp_sleep_enable_ext0_wakeup(GPIO_NUM_2, 0);  // Wake on button 0 (GPIO 2)
  
  Serial.println("Power saving configured");
}

void updateActivity() {
  lastActivity = millis();
  
  // Exit low power mode if we were in it
  if (lowPowerMode) {
    lowPowerMode = false;
    setCpuFrequencyMhz(240);  // Return to full speed
    WiFi.setSleep(false);
    setStatusLED(STATUS_ACTIVE);
    Serial.println("Exiting low power mode");
  }
}

void checkPowerManagement() {
  unsigned long inactiveTime = millis() - lastActivity;
  
  // Check if we should enter low power mode
  if (!lowPowerMode && inactiveTime > 60000) {  // 1 minute of inactivity
    lowPowerMode = true;
    setCpuFrequencyMhz(80);   // Reduce CPU speed
    WiFi.setSleep(true);      // Enable WiFi sleep
    setStatusLED(STATUS_LOW_POWER);
    Serial.println("Entering low power mode");
  }
  
  // Check if we should enter deep sleep
  if (inactiveTime > SLEEP_TIMEOUT) {
    Serial.println("No activity for " + String(SLEEP_TIMEOUT / 1000) + " seconds. Entering deep sleep...");
    enterDeepSleep();
  }
  
  // Force deep sleep if battery is critically low
  if (criticalBattery) {
    Serial.println("Critical battery level. Entering deep sleep to preserve power...");
    enterDeepSleep();
  }
}

void enterDeepSleep() {
  // Save current state if needed
  saveConfiguration();
  
  // Turn off all LEDs including status LED
  setStatusLED(STATUS_OFF);
  for (int i = 0; i < 8; i++) {
    digitalWrite(ledPins[i], LOW);
  }
  
  // Disconnect WiFi
  if (wifiConnected) {
    WiFi.disconnect();
  }
  
  // Configure wake-up sources
  esp_sleep_enable_ext0_wakeup(GPIO_NUM_2, 0);  // Wake on button 0 press
  
  // Optional: Wake up periodically to check battery or send heartbeat
  esp_sleep_enable_timer_wakeup(30 * 60 * 1000000ULL);  // Wake every 30 minutes
  
  Serial.println("Entering deep sleep. Press any button to wake up.");
  Serial.flush();
  
  // Enter deep sleep
  esp_deep_sleep_start();
}

// Status LED Management Functions

void setStatusLED(StatusLedMode mode) {
  currentStatusMode = mode;
  lastStatusBlink = millis();
  
  // Set immediate state for solid modes
  switch (mode) {
    case STATUS_OFF:
      digitalWrite(STATUS_LED_PIN, LOW);
      break;
    case STATUS_ACTIVE:
      digitalWrite(STATUS_LED_PIN, HIGH);
      break;
    case STATUS_CONNECTING:
    case STATUS_LOW_POWER:
    case STATUS_ERROR:
      // These modes will blink, handled in updateStatusLED()
      break;
  }
}

void updateStatusLED() {
  unsigned long currentTime = millis();
  
  switch (currentStatusMode) {
    case STATUS_OFF:
      digitalWrite(STATUS_LED_PIN, LOW);
      break;
      
    case STATUS_ACTIVE:
      digitalWrite(STATUS_LED_PIN, HIGH);
      break;
      
    case STATUS_CONNECTING:
      // Fast blink during WiFi connection
      if (currentTime - lastStatusBlink > 250) {
        statusLedState = !statusLedState;
        digitalWrite(STATUS_LED_PIN, statusLedState ? HIGH : LOW);
        lastStatusBlink = currentTime;
      }
      break;
      
    case STATUS_LOW_POWER:
      // Slow blink in low power mode
      if (currentTime - lastStatusBlink > 2000) {
        statusLedState = !statusLedState;
        digitalWrite(STATUS_LED_PIN, statusLedState ? HIGH : LOW);
        lastStatusBlink = currentTime;
      }
      break;
      
    case STATUS_ERROR:
      // Double blink pattern for errors
      static int errorBlinkCount = 0;
      if (currentTime - lastStatusBlink > 200) {
        statusLedState = !statusLedState;
        digitalWrite(STATUS_LED_PIN, statusLedState ? HIGH : LOW);
        lastStatusBlink = currentTime;
        errorBlinkCount++;
        
        if (errorBlinkCount >= 4) {  // Two complete blinks
          errorBlinkCount = 0;
          lastStatusBlink = currentTime + 800;  // Longer pause before repeating
        }
      }
      break;
  }
}