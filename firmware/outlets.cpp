/*
 * Controls 8 Govee H5083 outlets with illuminated switches
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// Configuration
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* API_KEY = "YOUR_GOVEE_API_KEY";

// Timing constants
const unsigned long API_RATE_LIMIT = 500;      // Minimum ms between API calls
const unsigned long POLL_INTERVAL = 30000;     // Status check every 30 seconds
const unsigned long DEBOUNCE_TIME = 200;       // Button debounce time
const unsigned long BATTERY_CHECK_INTERVAL = 60000;  // Check battery every minute

// Pin assignments - Using standard digital pins
const int buttonPins[8] = {2, 3, 4, 5, 6, 7, 8, 9};
const int ledPins[8] = {A0, A1, A2, A3, A4, A5, A6, A7};
const int BATTERY_PIN = A8;  // Voltage divider input

// Device MACs
const char* deviceMacs[8] = {
  "",  // Device 1
  "",  // Device 2
  "",  // Device 3
  "",  // Device 4
  "",  // Device 5
  "",  // Device 6
  "",  // Device 7
  ""   // Device 8
};

// Optional: Friendly names for serial output
const char* deviceNames[8] = {
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  ""
};

// State tracking
bool outletStates[8] = {false};
bool ledStates[8] = {false};
unsigned long lastButtonPress[8] = {0};
unsigned long lastApiCall = 0;
unsigned long lastPollTime = 0;
unsigned long lastBatteryCheck = 0;
int pollIndex = 0;
float batteryVoltage = 9.0;
bool wifiConnected = false;

// For non-volatile storage
Preferences preferences;

// LED brightness levels (using digitalWrite for simplicity)
enum LedMode {
  LED_OFF,
  LED_ON,
  LED_BLINK
};

void setup() {
  Serial.begin(115200);
  delay(100);
  
  Serial.println("\n=== PATCOM Starting ===");
  Serial.println("Packet Commander- Outlet Control v1.0");
  
  // Initialize pins
  setupPins();
  
  // Load saved states
  loadStates();
  
  // Connect to WiFi
  connectWiFi();
  
  // Get initial status if connected
  if (wifiConnected) {
    Serial.println("Getting initial outlet states...");
    for (int i = 0; i < 8; i++) {
      pollOutletStatus(i);
      delay(API_RATE_LIMIT);
    }
  }
  
  // Update LEDs to match states
  updateAllLEDs();
  
  Serial.println("Setup complete!\n");
  printHelp();
}

void loop() {
  // Check buttons
  checkButtons();
  
  // Periodic status polling
  if (wifiConnected && (millis() - lastPollTime > POLL_INTERVAL)) {
    pollOutletStatus(pollIndex);
    pollIndex = (pollIndex + 1) % 8;
    lastPollTime = millis();
  }
  
  // Battery monitoring
  if (millis() - lastBatteryCheck > BATTERY_CHECK_INTERVAL) {
    checkBattery();
    lastBatteryCheck = millis();
  }
  
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED && wifiConnected) {
    Serial.println("WiFi disconnected!");
    wifiConnected = false;
    setAllLEDs(LED_BLINK);  // Blink all LEDs to indicate WiFi issue
  } else if (WiFi.status() == WL_CONNECTED && !wifiConnected) {
    Serial.println("WiFi reconnected!");
    wifiConnected = true;
    updateAllLEDs();
  }
  
  // Handle serial commands
  handleSerialCommands();
  
  // Update blinking LEDs if needed
  updateBlinkingLEDs();
  
  // Update status LED
  updateStatusLED();
  
  delay(10);  // Small delay for stability
}

void setupPins() {
  // Configure buttons with internal pullup
  for (int i = 0; i < 8; i++) {
    pinMode(buttonPins[i], INPUT_PULLUP);
  }
  
  // Configure LED pins as outputs
  for (int i = 0; i < 8; i++) {
    pinMode(ledPins[i], OUTPUT);
    digitalWrite(ledPins[i], LOW);
  }
  
  // Configure battery monitoring pin
  pinMode(BATTERY_PIN, INPUT);
}

void loadStates() {
  preferences.begin("govee", false);
  
  // Load saved outlet states
  for (int i = 0; i < 8; i++) {
    String key = "outlet" + String(i);
    outletStates[i] = preferences.getBool(key.c_str(), false);
    ledStates[i] = outletStates[i];
  }
  
  preferences.end();
  Serial.println("Loaded saved states from memory");
}

void saveStates() {
  preferences.begin("govee", false);
  
  for (int i = 0; i < 8; i++) {
    String key = "outlet" + String(i);
    preferences.putBool(key.c_str(), outletStates[i]);
  }
  
  preferences.end();
}

void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
    
    // Blink all LEDs during connection
    for (int i = 0; i < 8; i++) {
      digitalWrite(ledPins[i], (attempts % 2) ? HIGH : LOW);
    }
    
    // Fast blink status LED during WiFi connection
    digitalWrite(STATUS_LED_PIN, (attempts % 2) ? HIGH : LOW);
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\nWiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    Serial.println("PATCOM ready for operation");
    
    // Turn off all LEDs
    for (int i = 0; i < 8; i++) {
      digitalWrite(ledPins[i], LOW);
    }
    
    // Solid status LED to show system is ready
    digitalWrite(STATUS_LED_PIN, HIGH);
  } else {
    wifiConnected = false;
    Serial.println("\nWiFi connection failed!");
    Serial.println("Check SSID and password in code");
    
    // Flash error pattern
    for (int j = 0; j < 3; j++) {
      for (int i = 0; i < 8; i++) {
        digitalWrite(ledPins[i], HIGH);
      }
      digitalWrite(STATUS_LED_PIN, HIGH);
      delay(100);
      for (int i = 0; i < 8; i++) {
        digitalWrite(ledPins[i], LOW);
      }
      digitalWrite(STATUS_LED_PIN, LOW);
      delay(100);
    }
    
    // Leave status LED on dimly (PWM if needed) to show system is on but no WiFi
    digitalWrite(STATUS_LED_PIN, HIGH);
  }
}

void checkButtons() {
  for (int i = 0; i < 8; i++) {
    if (digitalRead(buttonPins[i]) == LOW) {
      // Debounce check
      if (millis() - lastButtonPress[i] > DEBOUNCE_TIME) {
        lastButtonPress[i] = millis();
        
        Serial.print("\nButton ");
        Serial.print(i);
        Serial.print(" (");
        Serial.print(deviceNames[i]);
        Serial.println(") pressed");
        
        // Give immediate visual feedback
        digitalWrite(ledPins[i], !digitalRead(ledPins[i]));
        
        if (wifiConnected) {
          // Toggle the outlet
          toggleOutlet(i);
        } else {
          Serial.println("No WiFi - cannot control outlet");
          // Just toggle local state for tracking
          outletStates[i] = !outletStates[i];
          updateAllLEDs();
        }
      }
    }
  }
}

void toggleOutlet(int index) {
  // Rate limiting
  if (millis() - lastApiCall < API_RATE_LIMIT) {
    delay(API_RATE_LIMIT - (millis() - lastApiCall));
  }
  
  Serial.print("Toggling ");
  Serial.print(deviceNames[index]);
  Serial.print(" to ");
  Serial.println(outletStates[index] ? "OFF" : "ON");
  
  HTTPClient http;
  http.begin("https://openapi.api.govee.com/router/api/v1/device/control");
  http.addHeader("Govee-API-Key", API_KEY);
  http.addHeader("Content-Type", "application/json");
  
  // Build JSON payload
  StaticJsonDocument<256> doc;
  doc["requestId"] = String(millis());
  doc["payload"]["sku"] = "H5083";
  doc["payload"]["device"] = deviceMacs[index];
  
  JsonObject cmd = doc["payload"]["capabilities"].createNestedArray().createNestedObject();
  cmd["type"] = "devices.capabilities.on_off";
  cmd["instance"] = "powerSwitch";
  cmd["value"] = outletStates[index] ? 0 : 1;  // Toggle to opposite state
  
  String payload;
  serializeJson(doc, payload);
  
  int httpCode = http.POST(payload);
  lastApiCall = millis();
  
  if (httpCode == 200) {
    String response = http.getString();
    StaticJsonDocument<512> responseDoc;
    deserializeJson(responseDoc, response);
    
    if (responseDoc["code"] == 200) {
      // Success - update state
      outletStates[index] = !outletStates[index];
      ledStates[index] = outletStates[index];
      digitalWrite(ledPins[index], ledStates[index] ? HIGH : LOW);
      
      Serial.print("Success! ");
      Serial.print(deviceNames[index]);
      Serial.println(outletStates[index] ? " is ON" : " is OFF");
      
      saveStates();  // Save to flash
    } else {
      Serial.print("API error: ");
      Serial.println(response);
      flashError(index);
    }
  } else {
    Serial.print("HTTP error: ");
    Serial.println(httpCode);
    flashError(index);
  }
  
  http.end();
}

void pollOutletStatus(int index) {
  if (!wifiConnected) return;
  
  // Rate limiting
  if (millis() - lastApiCall < API_RATE_LIMIT) {
    return;
  }
  
  HTTPClient http;
  String url = "https://openapi.api.govee.com/router/api/v1/device/state";
  url += "?sku=H5083&device=";
  url += deviceMacs[index];
  
  http.begin(url);
  http.addHeader("Govee-API-Key", API_KEY);
  
  int httpCode = http.GET();
  lastApiCall = millis();
  
  if (httpCode == 200) {
    String response = http.getString();
    StaticJsonDocument<1024> doc;
    deserializeJson(doc, response);
    
    // Find power state in capabilities array
    JsonArray capabilities = doc["payload"]["capabilities"];
    for (JsonObject cap : capabilities) {
      if (cap["type"] == "devices.capabilities.on_off") {
        bool newState = cap["state"]["value"]["value"] == 1;
        
        if (outletStates[index] != newState) {
          Serial.print("Status update: ");
          Serial.print(deviceNames[index]);
          Serial.println(newState ? " is ON" : " is OFF");
          
          outletStates[index] = newState;
          ledStates[index] = newState;
          digitalWrite(ledPins[index], newState ? HIGH : LOW);
          saveStates();
        }
        break;
      }
    }
  }
  
  http.end();
}

void updateAllLEDs() {
  for (int i = 0; i < 8; i++) {
    digitalWrite(ledPins[i], ledStates[i] ? HIGH : LOW);
  }
}

void setAllLEDs(LedMode mode) {
  for (int i = 0; i < 8; i++) {
    if (mode == LED_OFF) {
      ledStates[i] = false;
      digitalWrite(ledPins[i], LOW);
    } else if (mode == LED_ON) {
      ledStates[i] = true;
      digitalWrite(ledPins[i], HIGH);
    } else if (mode == LED_BLINK) {
      ledStates[i] = true;  // Mark for blinking
    }
  }
}

void updateBlinkingLEDs() {
  if (!wifiConnected) {
    // Blink all LEDs when WiFi is disconnected
    static unsigned long lastBlink = 0;
    static bool blinkState = false;
    
    if (millis() - lastBlink > 500) {
      blinkState = !blinkState;
      for (int i = 0; i < 8; i++) {
        digitalWrite(ledPins[i], blinkState ? HIGH : LOW);
      }
      lastBlink = millis();
    }
  }
}

void updateStatusLED() {
  // Status LED behavior:
  // - Solid ON: System awake and normal operation
  // - Fast blink: WiFi connecting
  // - Slow blink: Low battery warning
  // - OFF: System sleeping (if we implement sleep mode)
  
  if (!wifiConnected) {
    // Already handled in connectWiFi() with fast blink
    return;
  }
  
  if (batteryVoltage < 6.5 && batteryVoltage > 0) {
    // Low battery - slow blink (handled in checkBattery())
    return;
  }
  
  // Normal operation - solid on
  digitalWrite(STATUS_LED_PIN, HIGH);
}

void flashError(int index) {
  // Flash LED to indicate error
  for (int i = 0; i < 3; i++) {
    digitalWrite(ledPins[index], LOW);
    delay(100);
    digitalWrite(ledPins[index], HIGH);
    delay(100);
  }
  digitalWrite(ledPins[index], ledStates[index] ? HIGH : LOW);
}

void checkBattery() {
  // Read battery voltage through voltage divider
  // Assuming 100k + 33k divider: Vout = Vin * 33k / 133k
  int adcValue = analogRead(BATTERY_PIN);
  batteryVoltage = (adcValue / 4095.0) * 3.3 * 4.03;  // 4.03 = 133k/33k
  
  Serial.print("Battery: ");
  Serial.print(batteryVoltage, 2);
  Serial.print("V");
  
  if (batteryVoltage < 6.0) {
    Serial.println(" - CRITICAL!");
    // Flash all LEDs as warning
    for (int j = 0; j < 5; j++) {
      setAllLEDs(LED_ON);
      digitalWrite(STATUS_LED_PIN, HIGH);
      delay(200);
      setAllLEDs(LED_OFF);
      digitalWrite(STATUS_LED_PIN, LOW);
      delay(200);
    }
  } else if (batteryVoltage < 6.5) {
    Serial.println(" - Low");
    // Slow blink status LED for low battery
    static unsigned long lastBatteryBlink = 0;
    if (millis() - lastBatteryBlink > 2000) {
      digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
      lastBatteryBlink = millis();
    }
  } else if (batteryVoltage < 7.0) {
    Serial.println(" - Fair");
  } else {
    Serial.println(" - Good");
  }
}

void handleSerialCommands() {
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    command.toUpperCase();
    
    if (command == "STATUS") {
      printStatus();
    } else if (command == "POLL") {
      Serial.println("Polling all outlets...");
      for (int i = 0; i < 8; i++) {
        pollOutletStatus(i);
        delay(API_RATE_LIMIT);
      }
    } else if (command.startsWith("TOGGLE ")) {
      int index = command.substring(7).toInt();
      if (index >= 0 && index < 8) {
        toggleOutlet(index);
      } else {
        Serial.println("Invalid outlet number (0-7)");
      }
    } else if (command == "ON ALL") {
      Serial.println("Turning all outlets ON...");
      for (int i = 0; i < 8; i++) {
        if (!outletStates[i]) {
          toggleOutlet(i);
          delay(API_RATE_LIMIT);
        }
      }
    } else if (command == "OFF ALL") {
      Serial.println("Turning all outlets OFF...");
      for (int i = 0; i < 8; i++) {
        if (outletStates[i]) {
          toggleOutlet(i);
          delay(API_RATE_LIMIT);
        }
      }
    } else if (command == "BATTERY") {
      checkBattery();
    } else if (command == "WIFI") {
      Serial.print("WiFi Status: ");
      Serial.println(wifiConnected ? "Connected" : "Disconnected");
      if (wifiConnected) {
        Serial.print("RSSI: ");
        Serial.print(WiFi.RSSI());
        Serial.println(" dBm");
      }
    } else if (command == "HELP") {
      printHelp();
    } else {
      Serial.println("Unknown command. Type HELP for commands.");
    }
  }
}

void printStatus() {
  Serial.println("\n=== PATCOM Status ===");
  for (int i = 0; i < 8; i++) {
    Serial.print(i);
    Serial.print(": ");
    Serial.print(deviceNames[i]);
    Serial.print(" - ");
    Serial.println(outletStates[i] ? "ON" : "OFF");
  }
  Serial.print("\nBattery: ");
  Serial.print(batteryVoltage, 2);
  Serial.println("V");
  Serial.print("WiFi: ");
  Serial.println(wifiConnected ? "Connected" : "Disconnected");
}

void printHelp() {
  Serial.println("\n=== PATCOM Serial Commands ===");
  Serial.println("STATUS      - Show all outlet states");
  Serial.println("POLL        - Poll all outlets for current state");
  Serial.println("TOGGLE n    - Toggle outlet n (0-7)");
  Serial.println("ON ALL      - Turn all outlets on");
  Serial.println("OFF ALL     - Turn all outlets off");
  Serial.println("BATTERY     - Check battery voltage");
  Serial.println("WIFI        - Show WiFi status");
  Serial.println("HELP        - Show this help");
  Serial.println("==========================\n");
}