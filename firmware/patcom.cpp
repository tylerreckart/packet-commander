/*
 * Packet Commander - Universal Programmable Button Matrix Controller
 */
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WebServer.h>

// Configuration constants
const char* DEVICE_NAME = "PATCOM";
const char* VERSION = "2.1.0";
const int CONFIG_SIZE = 8192;
// Heartbeat removed for simplification
const unsigned long BUTTON_DEBOUNCE = 50;   // Reduced for better responsiveness
const unsigned long BUTTON_HOLD_TIME = 100; // Minimum hold time for reliable detection
const unsigned long STATUS_LED_BLINK = 500;

// Pin assignments
const int buttonPins[8] = {2, 3, 4, 5, 6, 7, 8, 9};
const int ledPins[8] = {A0, A1, A2, A3, A4, A5, A6, A7};
const int BATTERY_PIN = 17;
const int STATUS_LED_PIN = 13;

// Action types
enum ActionType {
  ACTION_NONE = 0,
  ACTION_HTTP = 1,
  ACTION_WEBHOOK = 2
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

// Global variables
ButtonConfig buttonConfigs[8];
NetworkConfig networkConfig;
DeviceConfig deviceConfig;
ApiKeyEntry apiKeys[MAX_API_KEYS];
Preferences preferences;
WebServer server(80);

// State tracking
bool buttonStates[8] = {true, true, true, true, true, true, true, true};  // Start as released (HIGH)
bool buttonPressed[8] = {false, false, false, false, false, false, false, false}; // Track if button is currently pressed
unsigned long buttonPressStart[8] = {0}; // When button press started
bool ledStates[8] = {false};
unsigned long lastButtonPress[8] = {0};
unsigned long lastStatusBlink = 0;
bool statusLedState = false;
float batteryVoltage = 3.3;  // 3.3V power supply
bool wifiConnected = false;
bool configMode = false;
bool pinsStabilized = false;  // Flag to prevent early button detection

// Power monitoring state (sleep management removed)
bool criticalBattery = false;  // Keep name for compatibility but it's really critical power
int bootCount = 0;  // Removed RTC_DATA_ATTR since no sleep

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
void handleButtonPress(int buttonIndex);
void executeAction(int buttonIndex);
void executeHttpAction(int buttonIndex, const char* actionData);
void executeWebhookAction(int buttonIndex, const char* actionData);
void updateLEDs();
void handleSerialCommands();
void processSerialCommand(String command);
void sendJsonResponse(const char* type, const char* message, bool success = true);
void sendDeviceInfo();
void handleConfigUpload();
void handleConfigUpload(String configJson);
void validateConfiguration();
bool isValidIP(const char* ip);
bool isValidUrl(const char* url);
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
  for (int i = 0; i < 3; i++) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    delay(100);
    digitalWrite(STATUS_LED_PIN, LOW);
    delay(100);
  }
  
  // Brief LED initialization test and set initial states
  for (int i = 0; i < 8; i++) {
    ledStates[i] = false;  // Ensure all LEDs start OFF
    analogWrite(ledPins[i], 255);  // Full brightness test
    delay(50);
    analogWrite(ledPins[i], 0);    // Turn off
    delay(10);
  }
  
  // Final initialization - ensure all LEDs are OFF
  for (int i = 0; i < 8; i++) {
    ledStates[i] = false;  // Force OFF state
    analogWrite(ledPins[i], 0);    // Force OFF
  }
  delay(100);  // Allow PWM to settle
  
  Serial.println("All LEDs should now be OFF");
  
  // Print pin mapping for debugging
  Serial.println("=== PIN MAPPING DEBUG ===");
  for (int i = 0; i < 8; i++) {
    Serial.println("Button " + String(i) + ": GPIO " + String(buttonPins[i]) + " -> LED pin " + String(ledPins[i]) + " (A" + String(i) + " = " + String(A0 + i) + ")");
  }
  Serial.println("========================");
  
  // Enable button checking after LED test is complete
  pinsStabilized = true;
  Serial.println("Button detection enabled");
  
  // Sleep wakeup detection removed
  Serial.println("Fresh start - sleep functions disabled");
  
  
  // Optimize CPU frequency for 3.3V operation and power efficiency
  setCpuFrequencyMhz(80);  // Reduced frequency for power savings
  Serial.println("Running at optimized frequency for power efficiency");
  
  // Load configuration from flash
  loadConfiguration();
  
  // Validate configuration
  validateConfiguration();
  
  // Power monitoring initialization
  Serial.println("Sleep functions disabled - device will stay awake");
  
  // Set status LED to connecting mode before WiFi
  setStatusLED(STATUS_CONNECTING);
  
  // Connect to WiFi
  connectWiFi();
  
  // Setup web server for configuration
  setupWebServer();
  
  
  // Set final status LED state
  if (wifiConnected) {
    setStatusLED(STATUS_ACTIVE);
  } else {
    setStatusLED(STATUS_ERROR);
  }
  
  Serial.println("Setup complete!");
  Serial.println("");
  Serial.println("");
  Serial.println("Commands: CONFIG, STATUS, WIFI, POWER, BATTERY, HELP, RESET_WIFI");
  if (configMode) {
    Serial.println("*** DEVICE IN CONFIG MODE ***");
    Serial.println("*** Connect to WiFi: PATCOM-Config ***");
    Serial.println("*** Password: patcom123 ***");
    Serial.println("*** Open browser to: 192.168.4.1 ***");
  }
  sendDeviceInfo();
}

void loop() {
  // Handle web server requests
  server.handleClient();
  
  // Check button presses (only after pins are stabilized)
  if (pinsStabilized) {
    for (int i = 0; i < 8; i++) {
      bool currentState = digitalRead(buttonPins[i]);
      unsigned long currentTime = millis();
      
      // Button pressed: transition from HIGH to LOW (with pullup)
      if (buttonStates[i] == true && currentState == false) {
        // Start tracking the press
        if (!buttonPressed[i]) {
          buttonPressed[i] = true;
          buttonPressStart[i] = currentTime;
        }
      }
      // Button released: transition from LOW to HIGH  
      else if (buttonStates[i] == false && currentState == true) {
        buttonStates[i] = true;  // Update state
        
        // If we were tracking a press, check if it was valid
        if (buttonPressed[i]) {
          unsigned long pressDuration = currentTime - buttonPressStart[i];
          if (pressDuration >= BUTTON_HOLD_TIME && 
              (currentTime - lastButtonPress[i]) > BUTTON_DEBOUNCE) {
            lastButtonPress[i] = currentTime;
            handleButtonPress(i);
          }
          buttonPressed[i] = false;
        }
      }
      
      // Update button state based on current reading
      if (currentState == false && buttonPressed[i]) {
        // Check if we've held the button long enough
        unsigned long pressDuration = currentTime - buttonPressStart[i];
        if (pressDuration >= BUTTON_HOLD_TIME && buttonStates[i] == true &&
            (currentTime - lastButtonPress[i]) > BUTTON_DEBOUNCE) {
          buttonStates[i] = false;  // Update state
          lastButtonPress[i] = currentTime;
          handleButtonPress(i);
          buttonPressed[i] = false; // Prevent multiple triggers
        }
      }
      
      // Reset press tracking if button has been held too long (prevent stuck buttons)
      if (buttonPressed[i] && (currentTime - buttonPressStart[i]) > 2000) {
        buttonPressed[i] = false;
      }
    }
  }
  
  // Update status LED
  updateStatusLED();
  
  // Handle serial commands
  handleSerialCommands();
  
  
  // Update LEDs
  updateLEDs();
  
  // Reduced delay for better button responsiveness
  delay(10);  // Faster polling for reliable button detection
}

void setupPins() {
  Serial.println("Setting up pins...");
  
  // Set global PWM frequency and resolution for ESP32
  analogWriteFrequency(5000);  // 5kHz PWM frequency
  analogWriteResolution(8);    // 8-bit resolution (0-255)
  
  // Configure LED pins first (safe state)  
  for (int i = 0; i < 8; i++) {
    pinMode(ledPins[i], OUTPUT);
    analogWrite(ledPins[i], 0);  // Set to off initially
    Serial.println("LED " + String(i) + " pin " + String(ledPins[i]) + " configured");
  }
  
  // Configure other pins
  pinMode(BATTERY_PIN, INPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);
  
  // Wait for pins to stabilize
  delay(500);
  
  // Configure buttons with internal pullup - LAST
  for (int i = 0; i < 8; i++) {
    pinMode(buttonPins[i], INPUT_PULLUP);
    // Read initial state to stabilize
    digitalRead(buttonPins[i]);
    buttonStates[i] = true;  // Assume released (HIGH with pullup)
    lastButtonPress[i] = millis();  // Initialize timing
    Serial.println("Button " + String(i) + " pin " + String(buttonPins[i]) + " configured, initial state: " + String(digitalRead(buttonPins[i])));
  }
  
  Serial.println("Pin setup complete - waiting for stabilization...");
  delay(1000);  // Give pins time to stabilize
}

void loadConfiguration() {
  preferences.begin("patcom", true);
  
  // Load device config
  strcpy(deviceConfig.deviceName, preferences.getString("deviceName", "PATCOM").c_str());
  strcpy(deviceConfig.deviceId, preferences.getString("deviceId", "PATCOM-" + String(ESP.getEfuseMac(), HEX)).c_str());
  deviceConfig.deviceType = (DeviceType)preferences.getInt("deviceType", DEVICE_TYPE_BUTTON_MATRIX);
  deviceConfig.brightness = preferences.getInt("brightness", 255);
  deviceConfig.discoverable = preferences.getBool("discoverable", true);
  // heartbeatInterval removed
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
    strcpy(apiKeys[i].name, preferences.getString((prefix + "name").c_str(), "").c_str());
    strcpy(apiKeys[i].value, preferences.getString((prefix + "value").c_str(), "").c_str());
    apiKeys[i].active = strlen(apiKeys[i].name) > 0;
  }
  
  
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
    strcpy(buttonConfigs[i].name, preferences.getString((prefix + "name").c_str(), ("Button " + String(i)).c_str()).c_str());
    buttonConfigs[i].action = (ActionType)preferences.getInt((prefix + "action").c_str(), ACTION_NONE);
    strcpy(buttonConfigs[i].actionData, preferences.getString((prefix + "data").c_str(), "{}").c_str());
    buttonConfigs[i].enabled = preferences.getBool((prefix + "enabled").c_str(), true);
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
  // heartbeat setting removed
  preferences.putBool("autoSync", deviceConfig.autoSync);
  preferences.putString("configServer", deviceConfig.configServerUrl);
  
  // Save API keys
  int activeApiKeyCount = 0;
  for (int i = 0; i < MAX_API_KEYS; i++) {
    if (apiKeys[i].active) {
      String prefix = "apiKey" + String(activeApiKeyCount) + "_";
      preferences.putString((prefix + "name").c_str(), apiKeys[i].name);
      preferences.putString((prefix + "value").c_str(), apiKeys[i].value);
      activeApiKeyCount++;
    }
  }
  preferences.putInt("apiKeyCount", activeApiKeyCount);
  
  
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
    preferences.putString((prefix + "name").c_str(), buttonConfigs[i].name);
    preferences.putInt((prefix + "action").c_str(), buttonConfigs[i].action);
    preferences.putString((prefix + "data").c_str(), buttonConfigs[i].actionData);
    preferences.putBool((prefix + "enabled").c_str(), buttonConfigs[i].enabled);
  }
  
  preferences.end();
  Serial.println("Configuration saved to flash");
}

void connectWiFi() {
  Serial.println("=== WiFi Connection Debug ===");
  Serial.println("SSID length: " + String(strlen(networkConfig.ssid)));
  Serial.println("SSID: '" + String(networkConfig.ssid) + "'");
  
  if (strlen(networkConfig.ssid) == 0) {
    Serial.println("No WiFi credentials - entering config mode");
    configMode = true;
    setStatusLED(STATUS_ERROR);
    
    // Start AP mode immediately when no credentials
    WiFi.mode(WIFI_AP);
    bool apResult = WiFi.softAP("PATCOM-Config", "patcom123");
    Serial.println("AP creation result: " + String(apResult ? "SUCCESS" : "FAILED"));
    Serial.println("AP started: PATCOM-Config");
    Serial.println("AP IP: " + WiFi.softAPIP().toString());
    Serial.println("Connect to PATCOM-Config with password: patcom123");
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
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(1000);  // Longer delay to reduce power consumption
    Serial.print(".");
    attempts++;
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
    delay(100);  // Give time for mode switch
    bool apResult = WiFi.softAP("PATCOM-Config", "patcom123");
    Serial.println("AP creation result: " + String(apResult ? "SUCCESS" : "FAILED"));
    Serial.println("AP started: PATCOM-Config");
    Serial.println("AP IP: " + WiFi.softAPIP().toString());
    Serial.println("Connect to PATCOM-Config with password: patcom123");
    
    // Print available networks for debugging
    Serial.println("Scanning for networks...");
    int n = WiFi.scanNetworks();
    if (n == 0) {
      Serial.println("No networks found");
    } else {
      Serial.println(String(n) + " networks found:");
      for (int i = 0; i < n; ++i) {
        Serial.println(String(i + 1) + ": " + WiFi.SSID(i) + " (" + WiFi.RSSI(i) + "dBm)");
      }
    }
  }
}

void setupWebServer() {
  // Serve configuration page
  server.on("/", HTTP_GET, []() {
    String html = "<!DOCTYPE html><html><head><title>PATCOM Config</title></head><body>";
    html += "<h1>PATCOM Configuration</h1>";
    html += "<p>Device: " + String(deviceConfig.deviceName) + "</p>";
    html += "<p>Version: " + String(VERSION) + "</p>";
    html += "<p>WiFi: " + String(wifiConnected ? "Connected" : "Disconnected") + "</p>";
    html += "<p>Power: " + String(batteryVoltage, 2) + "V</p>";
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
  server.on("/api/config", HTTP_POST, []() {
    handleConfigUpload();
  });
  
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
  
  Serial.println("=== BUTTON " + String(buttonIndex) + " PRESSED ===");
  Serial.println("Button name: " + String(buttonConfigs[buttonIndex].name));
  Serial.println("Pin: " + String(buttonPins[buttonIndex]) + " -> LED: " + String(ledPins[buttonIndex]));
  
  // Toggle LED state for visual feedback
  ledStates[buttonIndex] = !ledStates[buttonIndex];
  
  // Debug output for buttons 5-7 LED state
  if (buttonIndex >= 5) {
    int brightness = map(deviceConfig.brightness, 0, 255, 0, 255);
    Serial.println("LED " + String(buttonIndex) + " pin " + String(ledPins[buttonIndex]) + " (A" + String(buttonIndex) + ") new state: " + String(ledStates[buttonIndex]) + " brightness: " + String(brightness));
    Serial.println("Pin value: " + String(ledPins[buttonIndex]) + " (expected A" + String(buttonIndex) + " = " + String(A0 + buttonIndex) + ")");
  }
  
  // Apply the state immediately
  updateLEDs();
  
  // Brief visual confirmation flash
  delay(50);
  if (buttonIndex >= 5) {
    digitalWrite(ledPins[buttonIndex], HIGH);  // Flash for buttons 5-7
  } else {
    analogWrite(ledPins[buttonIndex], 255);   // Full brightness flash for 0-4
  }
  delay(100);
  // Restore the toggled state
  if (buttonIndex >= 5) {
    digitalWrite(ledPins[buttonIndex], ledStates[buttonIndex] ? HIGH : LOW);
  } else {
    int brightness = map(deviceConfig.brightness, 0, 255, 0, 255);
    analogWrite(ledPins[buttonIndex], ledStates[buttonIndex] ? brightness : 0);
  }
  
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
  Serial.println("========================");
}

void executeAction(int buttonIndex) {
  ActionType action = buttonConfigs[buttonIndex].action;
  const char* actionData = buttonConfigs[buttonIndex].actionData;
  
  switch (action) {
    case ACTION_HTTP:
      executeHttpAction(buttonIndex, actionData);
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
    if (httpCode >= 200 && httpCode < 300) {
      // Success - brief confirmation flash but keep current LED state
      int brightness = map(deviceConfig.brightness, 0, 255, 0, 255);
      analogWrite(ledPins[buttonIndex], 255);  // Flash bright
      delay(50);
      analogWrite(ledPins[buttonIndex], ledStates[buttonIndex] ? brightness : 0);  // Restore state
    }
  } else {
    Serial.println("HTTP request failed: " + String(httpCode));
    // Flash LED to indicate error without changing state
    int brightness = map(deviceConfig.brightness, 0, 255, 0, 255);
    for (int i = 0; i < 3; i++) {
      analogWrite(ledPins[buttonIndex], 255);  // Error flash
      delay(100);
      analogWrite(ledPins[buttonIndex], 0);
      delay(100);
    }
    // Restore original state
    analogWrite(ledPins[buttonIndex], ledStates[buttonIndex] ? brightness : 0);
  }
  
  http.end();
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
      // Success - brief confirmation flash but keep current LED state
      int brightness = map(deviceConfig.brightness, 0, 255, 0, 255);
      analogWrite(ledPins[buttonIndex], 255);  // Flash bright
      delay(50);
      analogWrite(ledPins[buttonIndex], ledStates[buttonIndex] ? brightness : 0);  // Restore state
    }
  } else {
    Serial.println("Webhook failed: " + String(httpCode));
    // Flash LED to indicate error without changing state
    int brightness = map(deviceConfig.brightness, 0, 255, 0, 255);
    for (int i = 0; i < 3; i++) {
      analogWrite(ledPins[buttonIndex], 255);  // Error flash
      delay(100);
      analogWrite(ledPins[buttonIndex], 0);
      delay(100);
    }
    // Restore original state
    analogWrite(ledPins[buttonIndex], ledStates[buttonIndex] ? brightness : 0);
  }
  
  http.end();
}

void updateLEDs() {
  for (int i = 0; i < 8; i++) {
    int brightness = map(deviceConfig.brightness, 0, 255, 0, 255);
    int ledValue = ledStates[i] ? brightness : 0;
    
    // For buttons 5-7, try digitalWrite instead of analogWrite as fallback
    if (i >= 5) {
      if (ledStates[i]) {
        digitalWrite(ledPins[i], HIGH);
      } else {
        digitalWrite(ledPins[i], LOW);
      }
    } else {
      analogWrite(ledPins[i], ledValue);
    }
  }
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
  } else if (command == "POWER" || command == "BATTERY") {
    sendJsonResponse("power", (String(batteryVoltage, 2) + "V").c_str());
  } else if (command == "RESET_WIFI") {
    Serial.println("Clearing WiFi credentials and restarting...");
    preferences.begin("patcom", false);
    preferences.putString("ssid", "");
    preferences.putString("password", "");
    preferences.end();
    delay(1000);
    ESP.restart();
  } else if (command == "IDENTIFY") {
    // Send device identification for electron configurator
    StaticJsonDocument<256> doc;
    doc["type"] = "device_identification";
    doc["device_name"] = deviceConfig.deviceName;
    doc["device_id"] = deviceConfig.deviceId;
    doc["version"] = VERSION;
    doc["device_type"] = "PATCOM";
    doc["connection"] = "USB";
    
    String response;
    serializeJson(doc, response);
    Serial.println("IDENTIFY:" + response);
  } else if (command == "HELP") {
    Serial.println("=== PATCOM Commands ===");
    Serial.println("STATUS     - Device information");
    Serial.println("CONFIG     - Get configuration");
    Serial.println("SET_CONFIG:<json> - Upload configuration");
    Serial.println("TEST:<n>   - Test button n");
    Serial.println("WIFI       - WiFi status");
    Serial.println("POWER      - Power supply voltage");
    Serial.println("BATTERY    - Power supply voltage (alias)");
    Serial.println("IDENTIFY   - Device identification for configurator");
    Serial.println("RESET_WIFI - Clear WiFi and enter config mode");
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
  doc["power"] = batteryVoltage;  // Keep 'batteryVoltage' variable name for compatibility
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
        analogWrite(ledPins[i], 255);
      }
      delay(200);
      for (int i = 0; i < 8; i++) {
        analogWrite(ledPins[i], 0);
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

// Power saving configuration removed for testing

// Activity tracking removed for testing

// Power management functions removed for testing

// Deep sleep function removed for testing

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