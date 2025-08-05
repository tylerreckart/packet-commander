# Packet Commander
Complete 8-button WiFi IoT controller with hardware designs, firmware, and desktop configurator. Advanced configuration management, power optimization, and multi-protocol capabilities.

![PATCOM](./assets/patcom.png)

## Overview

Packet Commander is a complete IoT development platform featuring 8 programmable buttons with LED feedback, comprehensive WiFi connectivity, and intelligent power management. Includes hardware schematics, ESP32 firmware, and cross-platform Electron configurator for smart home automation, network testing, and custom IoT applications.

### Key Features
- **8 Programmable Buttons**: Directly supports HTTP and Webhook actions.
- **Smart Power Management**: Includes battery monitoring and optimized CPU frequency for power efficiency.
- **Desktop App**: Full-featured Electron configurator with device management.
- **Persistent Storage**: Configuration saved to flash memory on the device.
- **Multi-Protocol Support**: Firmware directly supports HTTP/HTTPS and Webhook.
- **Network Discovery**: Automatic device detection and configuration synchronization via the desktop application.

### Hardware Specs
- **MCU**: Arduino Nano ESP32 (Dual-core, 240MHz).
- **Inputs**: 8× illuminated tactile buttons (PB86).
- **Power**: 9V battery → 3.3V regulated (6-8 hour runtime).
- **Network**: 2.4GHz WiFi 802.11b/g/n.
- **Current**: 80-240mA.
- **Storage**: 4MB Flash, EEPROM for configuration.
- **Battery Monitor**: Real-time voltage sensing with low-battery alerts.

## Developer Quick Start

### For Configurator Development
```bash
# Install dependencies and run configurator
npm install
npm run build
npm run dev
```

### For Hardware Development
- Flash `firmware/patcom.cpp` to Arduino Nano ESP32
- Use configurator to connect and test device
- See [Circuit Assembly](#circuit-assembly) for complete build guide

### Prerequisites
- Node.js 18+ (for configurator)
- Arduino IDE 2.0+ (for firmware)
- KiCad (for hardware modifications)

## Quick Start

### 1. Hardware Setup
- Flash the firmware to your Arduino Nano ESP32.
- Connect 9V battery to power input.
- Power LED will indicate system status.

### 2. First Boot Configuration
1. Power on device - it will create "PATCOM-Config" WiFi hotspot.
2. Connect to hotspot (password: `patcom123`).
3. Open browser to `192.168.4.1`.
4. Configure your WiFi network and device settings.
5. Device will restart and connect to your network.

### 3. Desktop Configuration App

![PATCOM Configurator](./assets/configurator.png)

#### Development Commands
```bash
# Install dependencies
npm install

# Build all TypeScript
npm run build

# Run in development mode (with debug output)
npm run dev

# Run in production mode
npm start

# Build for distribution
npm run dist

# Type checking and linting
npm run type-check
npm run lint
```

#### Configurator Features
- **Device Auto-Detection**: USB serial and network discovery
- **Real-time Configuration**: Live button testing and LED control
- **Bulk Operations**: Configure multiple devices simultaneously
- **Configuration Backup**: Save/load device configurations as JSON
- **Debug Console**: Monitor device communication and troubleshoot issues

### 4. Device Discovery & Configuration
- Click "Discover Devices" to find controllers on your network
- Configure button actions: HTTP requests, webhooks.
- Upload configuration to device
- Test buttons and monitor activity

## Firmware Installation

### Arduino IDE Setup
- Download [Arduino IDE 2.0+](https://www.arduino.cc/en/software)
- Add ESP32 board URL in Preferences:
  ```
  https://espressif.github.io/arduino-esp32/package_esp32_index.json
  ```
- Install "Arduino ESP32 Boards" via Board Manager
- Install required libraries: ArduinoJson, AsyncUDP, ESPmDNS

### Firmware Upload
- Connect Arduino via USB-C
- Select: **Tools → Board → Arduino Nano ESP32**
- Select your port
- Open `firmware/patcom.cpp`
- Click Upload

## Configuration Management

### Button Action Types
- **HTTP/HTTPS**: Send GET/POST/PUT requests with custom headers and body
- **Webhook**: Secure webhook calls with device context and secrets
- **None**: Disable button (LED-only feedback)

### Device Settings
- **Network**: WiFi credentials, static IP configuration
- **Discovery**: Device name, auto-discovery, config sync settings
- **API Keys**: Secure storage for service credentials

### Configuration Storage
- Settings persisted to ESP32 flash memory
- Automatic backup during low battery
- Configuration hash verification
- Remote sync with desktop app

## Development & Debugging

### Device Communication
The configurator communicates with devices via:
- **USB Serial**: Direct connection for development (115200 baud)
- **Network Discovery**: UDP broadcast for deployed devices
- **HTTP API**: RESTful configuration on device port 80

### Debugging Tips
- Enable debug mode: `npm run dev` shows detailed console output
- Serial monitor: Built-in serial console for direct device communication
- Network scanner: "Discover Devices" shows all responsive controllers
- Configuration validation: Real-time validation with error highlighting

### File Structure
```
src/
├── main.ts              # Electron main process
├── preload.ts           # Secure IPC bridge  
├── renderer/            # UI components
├── services/            # Device communication
└── types/               # TypeScript definitions

firmware/
└── patcom.cpp           # ESP32 firmware

hardware/
└── *.kicad_*           # PCB design files
```

## Serial Commands (115200 baud)
- `STATUS` - Device information and battery status
- `CONFIG` - Display current configuration as JSON
- `SET_CONFIG:<json>` - Upload new configuration
- `TEST:<n>` - Test button n (0-7)
- `WIFI` - WiFi connection status
- `BATTERY` - Current battery voltage
- `HELP` - List all available commands

## Pin Connections

| Function | Pin | | Function | Pin |
|----------|-----|-|----------|-----|
| Button 0-7 | D2-D9 | | LED 0-7 | A0-A7 |
| Battery Monitor | A8 | | Status LED | D13 |
| Power In | 3V3 | | Ground | GND |
| USB Serial | USB-C | | Programming | BOOT + RESET |

## Circuit Assembly

### Parts List
- Packet Commander PCB
- Arduino Nano ESP32
- 8× PB86 switches
- RECOM R-78E3.3-1.0 regulator
- Capacitors: 100µF, 470µF, 10µF
- Resistors: 100kΩ, 33kΩ, 1kΩ
- 9V battery connector
- Terminal blocks

### Wiring
1. Battery → Regulator → Arduino 3V3 pin
2. Each button: terminal → Arduino pin, LED+ → analog pin
3. All grounds connected together
4. Battery monitor: voltage divider to D12

## Example Use Cases

### Smart Home Control
```json
{
  "action": "http",
  "config": {
    "url": "http://homeassistant.local:8123/api/services/light/toggle",
    "method": "POST",
    "headers": {"Authorization": "Bearer YOUR_TOKEN"},
    "body": "{\"entity_id\": \"light.living_room\"}"
  }
}
```

### Custom Webhook
```json
{
  "action": "webhook",
  "config": {
    "url": "https://api.example.com/webhook",
    "secret": "your-webhook-secret"
  }
}
```

## Troubleshooting

### Hardware Issues
| Issue | Solution |
|-------|----------|
| Upload fails | Hold RESET button during upload. Short GPIO0 to GND to reset the boot state. |
| No WiFi connection | Check 2.4GHz network, verify credentials |
| Short battery life | Normal: 6-8 hours, enable power saving |
| LEDs dim/flickering | Low battery or loose connections |
| Configuration not saving | Check flash memory, try factory reset |

### Configurator Issues  
| Issue | Solution |
|-------|----------|
| **Configurator won't start** | Run `npm run clean && npm install && npm run build` |
| **Device not detected** | Check USB drivers, try different cable, verify 115200 baud |
| **Network discovery fails** | Disable firewall, ensure same subnet, check UDP port 12345 |
| **Configuration upload fails** | Verify device connection, check JSON syntax, try smaller config |
| **Build errors** | Update Node.js to 18+, clear node_modules, reinstall |
| **TypeScript errors** | Run `npm run type-check` for detailed diagnostics |

## License

MIT License - Open source hardware and software.

## Contributing

Packet Commander is open source hardware and software. Contributions welcome for hardware, firmware, or configurator!

### Development Areas
- **Hardware**: PCB improvements, new form factors (`/hardware`)
- **Firmware**: ESP32 code, new protocols (`/firmware`) 
- **Configurator**: Electron app features (`/src`)

### Process
1. Fork the repository
2. Create a feature branch
3. Test with hardware if possible
4. Submit a pull request with detailed description
