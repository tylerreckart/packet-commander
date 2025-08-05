import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { EventEmitter } from 'events';
import { SerialPortInfo, DeviceInfo, ConnectionResult, DeviceMessage, ConfigData, ArduinoConfig } from '../types';

export class SerialService extends EventEmitter {
  private serialPort: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private deviceConnected = false;

  async getSerialPorts(): Promise<SerialPortInfo[]> {
    console.log('[SERIAL-SERVICE] Getting serial ports...');
    try {
      const ports = await SerialPort.list();
      console.log('[SERIAL-SERVICE] Raw serial ports from system:', ports);
      
      const mappedPorts = ports.map(port => ({
        path: port.path,
        manufacturer: port.manufacturer || 'Unknown',
        vendorId: port.vendorId,
        productId: port.productId,
        isPATCOM: this.isPotentialPATCOM(port)
      }));
      
      console.log('[SERIAL-SERVICE] Mapped serial ports:', mappedPorts);
      console.log('[SERIAL-SERVICE] Found', mappedPorts.length, 'serial ports');
      
      return mappedPorts;
    } catch (error) {
      console.error('[SERIAL-SERVICE] Error listing serial ports:', error);
      console.error('[SERIAL-SERVICE] Error details:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack
      });
      return [];
    }
  }

  private isPotentialPATCOM(port: any): boolean {
    return (port.manufacturer && port.manufacturer.includes('Arduino')) ||
           (port.vendorId === '10c4' && port.productId === 'ea60') || // ESP32 USB-Serial chips
           (port.vendorId === '1a86' && port.productId === '7523');   // CH340 chip
  }

  async autoDetectPATCOM(): Promise<SerialPortInfo & { deviceInfo: DeviceInfo } | null> {
    const ports = await SerialPort.list();
    
    for (const port of ports) {
      try {
        const result = await this.testPortForPATCOM(port.path);
        if (result) {
          return { ...port, deviceInfo: result };
        }
      } catch (error) {
        continue;
      }
    }
    
    return null;
  }

  private async testPortForPATCOM(portPath: string): Promise<DeviceInfo | null> {
    return new Promise((resolve) => {
      let testPort: SerialPort;
      
      try {
        testPort = new SerialPort({ path: portPath, baudRate: 115200 });
        const testParser = testPort.pipe(new ReadlineParser({ delimiter: '\n' }));
        
        const timeout = setTimeout(() => {
          testPort.close();
          resolve(null);
        }, 2000);
        
        testParser.on('data', (data: string) => {
          if (data.startsWith('IDENTIFY:')) {
            clearTimeout(timeout);
            testPort.close();
            try {
              const deviceInfo = JSON.parse(data.substring(9));
              if (deviceInfo.device_type === 'PATCOM') {
                resolve(deviceInfo);
                return;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
          resolve(null);
        });
        
        testPort.on('open', () => {
          testPort.write('IDENTIFY\n');
        });
        
        testPort.on('error', () => {
          clearTimeout(timeout);
          resolve(null);
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  async connectDevice(portPath: string, baudRate: number = 115200): Promise<ConnectionResult> {
    console.log('[SERIAL-SERVICE] Attempting to connect to device');
    console.log('[SERIAL-SERVICE] Connection parameters:', { portPath, baudRate });
    
    if (this.serialPort && this.serialPort.isOpen) {
      console.log('[SERIAL-SERVICE] Closing existing connection');
      await this.serialPort.close();
    }

    return new Promise((resolve, reject) => {
      console.log('[SERIAL-SERVICE] Creating new SerialPort instance');
      this.serialPort = new SerialPort({ path: portPath, baudRate });
      this.parser = this.serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

      const timeout = setTimeout(() => {
        console.error('[SERIAL-SERVICE] Connection timeout after 5 seconds');
        reject(new Error('Connection timeout'));
      }, 5000);

      this.serialPort.on('open', () => {
        console.log('[SERIAL-SERVICE] Serial port opened successfully');
        clearTimeout(timeout);
        this.deviceConnected = true;
        
        // Request device identification first
        console.log('[SERIAL-SERVICE] Sending IDENTIFY command');
        this.serialPort!.write('IDENTIFY\n');
        setTimeout(() => {
          console.log('[SERIAL-SERVICE] Sending STATUS command');
          this.serialPort!.write('STATUS\n');
        }, 500);
        
        console.log('[SERIAL-SERVICE] Connection successful, resolving promise');
        resolve({ success: true, message: 'Connected successfully' });
      });

      this.serialPort.on('error', (err) => {
        console.error('[SERIAL-SERVICE] Serial port error:', err);
        console.error('[SERIAL-SERVICE] Error details:', {
          name: err.name,
          message: err.message,
          stack: err.stack
        });
        clearTimeout(timeout);
        this.deviceConnected = false;
        reject(err);
      });

      this.parser!.on('data', (data: string) => {
        console.log('[SERIAL-SERVICE] Received data from device:', data.trim());
        this.handleDeviceMessage(data.trim());
      });
    });
  }

  async disconnectDevice(): Promise<ConnectionResult> {
    if (this.serialPort && this.serialPort.isOpen) {
      await this.serialPort.close();
    }
    this.deviceConnected = false;
    this.serialPort = null;
    this.parser = null;
    return { success: true, message: 'Disconnected successfully' };
  }

  async uploadConfig(configData: ConfigData): Promise<DeviceMessage> {
    console.log('[SERIAL-SERVICE] Starting uploadConfig()');
    console.log('[SERIAL-SERVICE] Raw config data received:', configData);
    
    if (!this.serialPort || !this.serialPort.isOpen) {
      console.error('[SERIAL-SERVICE] Device not connected for upload');
      throw new Error('Device not connected');
    }

    console.log('[SERIAL-SERVICE] Device is connected, transforming config...');
    const arduinoConfig = this.transformConfigForArduino(configData);
    console.log('[SERIAL-SERVICE] Transformed Arduino config:', arduinoConfig);
    
    const configJson = JSON.stringify(arduinoConfig);
    console.log('[SERIAL-SERVICE] Config JSON string:', configJson);
    console.log('[SERIAL-SERVICE] Config JSON length:', configJson.length);
    
    // Check if the optimized config is still too large (>500 chars as safety margin)
    if (configJson.length > 500) {
      console.warn('[SERIAL-SERVICE] Optimized config still large, trying network-only upload');
      
      // Send only network configuration if it's the most important
      const networkOnlyConfig = {
        n: arduinoConfig.n || {}
      };
      
      const networkJson = JSON.stringify(networkOnlyConfig);
      console.log('[SERIAL-SERVICE] Network-only JSON:', networkJson);
      console.log('[SERIAL-SERVICE] Network-only JSON length:', networkJson.length);
      
      if (networkJson.length <= 200) {
        console.log('[SERIAL-SERVICE] Sending network-only configuration as fallback');
        return await this.sendConfigCommand(networkJson);
      }
    }
    
    // Send the full optimized configuration
    return await this.sendConfigCommand(configJson);
  }

  private async sendConfigCommand(configJson: string): Promise<DeviceMessage> {
    console.log('[SERIAL-SERVICE] Sending config command with JSON length:', configJson.length);
    console.log('[SERIAL-SERVICE] Config JSON first 100 chars:', configJson.substring(0, 100));
    console.log('[SERIAL-SERVICE] Config JSON last 100 chars:', configJson.substring(Math.max(0, configJson.length - 100)));
    console.log('[SERIAL-SERVICE] Config JSON contains quotes:', configJson.includes('"'));
    console.log('[SERIAL-SERVICE] Config JSON contains braces:', configJson.includes('{') && configJson.includes('}'));
    
    // Test JSON validity
    try {
      const testParse = JSON.parse(configJson);
      console.log('[SERIAL-SERVICE] JSON is valid - parsed successfully');
      console.log('[SERIAL-SERVICE] Parsed JSON keys:', Object.keys(testParse));
    } catch (parseError) {
      console.error('[SERIAL-SERVICE] JSON is INVALID - parse error:', parseError);
      throw new Error('Generated invalid JSON');
    }
    
    const command = `SET_CONFIG:${configJson}\n`;
    console.log('[SERIAL-SERVICE] Full command to send:', command);
    console.log('[SERIAL-SERVICE] Command length:', command.length);
    console.log('[SERIAL-SERVICE] Command starts with SET_CONFIG:', command.startsWith('SET_CONFIG:'));
    console.log('[SERIAL-SERVICE] Command ends with newline:', command.endsWith('\n'));
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('[SERIAL-SERVICE] Upload timeout after 10 seconds');
        reject(new Error('Upload timeout'));
      }, 10000);

      const responseHandler = (data: string) => {
        console.log('[SERIAL-SERVICE] Response handler received data:', data);
        if (data.startsWith('RESPONSE:')) {
          console.log('[SERIAL-SERVICE] Found RESPONSE message, parsing...');
          try {
            const response = JSON.parse(data.substring(9));
            console.log('[SERIAL-SERVICE] Parsed response:', response);
            if (response.type === 'config_upload') {
              console.log('[SERIAL-SERVICE] Config upload response received');
              clearTimeout(timeout);
              this.parser!.off('data', responseHandler);
              resolve(response);
            }
          } catch (parseError) {
            console.error('[SERIAL-SERVICE] Failed to parse response JSON:', parseError);
            console.error('[SERIAL-SERVICE] Raw response data:', data);
          }
        }
      };

      console.log('[SERIAL-SERVICE] Setting up response handler and sending command...');
      this.parser!.on('data', responseHandler);
      this.serialPort!.write(command);
      console.log('[SERIAL-SERVICE] Command sent to device');
    });
  }

  async testButton(buttonIndex: number): Promise<ConnectionResult> {
    if (!this.serialPort || !this.serialPort.isOpen) {
      throw new Error('Device not connected');
    }

    const command = `TEST:${buttonIndex}\n`;
    this.serialPort.write(command);
    return { success: true, message: `Button ${buttonIndex} test sent` };
  }

  isConnected(): boolean {
    return this.deviceConnected;
  }

  private handleDeviceMessage(message: string): void {
    console.log('Device:', message);
    
    try {
      if (message.startsWith('DEVICE_INFO:')) {
        const deviceInfo = JSON.parse(message.substring(12));
        this.emit('device-info', deviceInfo);
      } else if (message.startsWith('IDENTIFY:')) {
        const deviceId = JSON.parse(message.substring(9));
        this.emit('device-identified', deviceId);
      } else if (message.startsWith('EVENT:')) {
        const event = JSON.parse(message.substring(6));
        this.emit('device-event', event);
      } else if (message.startsWith('RESPONSE:')) {
        const response = JSON.parse(message.substring(9));
        this.emit('device-response', response);
      }
    } catch (error) {
      console.error('Error parsing device message:', error);
    }
  }

  private transformConfigForArduino(configData: ConfigData): any {
    console.log('[TRANSFORM] Starting transformConfigForArduino() with compatibility optimization');
    console.log('[TRANSFORM] Input configData:', configData);
    
    // Create optimized config maintaining Arduino firmware compatibility
    // Only include non-default values to reduce size
    const optimizedConfig: any = {};

    // Device section - only include non-default values
    const deviceSection: any = {};
    if (configData?.device?.name && configData.device.name !== 'PATCOM') {
      deviceSection.name = configData.device.name;
    }
    if (configData?.device?.brightness !== undefined && configData.device.brightness !== 255) {
      deviceSection.brightness = configData.device.brightness;
    }
    if (configData?.device?.discoverable === false) {
      deviceSection.discoverable = false;
    }
    
    // Only include device section if it has properties
    if (Object.keys(deviceSection).length > 0) {
      optimizedConfig.device = deviceSection;
    }

    // Network section - only include non-empty values  
    const networkSection: any = {};
    if (configData?.network?.ssid) {
      networkSection.ssid = configData.network.ssid;
    }
    if (configData?.network?.password) {
      networkSection.password = configData.network.password;
    }
    if (configData?.network?.staticIP) {
      networkSection.staticIP = true;
      if (configData.network.ip) networkSection.ip = configData.network.ip;
      if (configData.network.subnet) networkSection.subnet = configData.network.subnet;
      if (configData.network.gateway) networkSection.gateway = configData.network.gateway;
    }
    
    // Only include network section if it has properties
    if (Object.keys(networkSection).length > 0) {
      optimizedConfig.network = networkSection;
    }

    // Buttons section - only include buttons with non-default configuration
    const buttonsArray: any[] = [];
    if (configData?.buttons) {
      configData.buttons.forEach(button => {
        const actionType = this.getArduinoActionType(button.action);
        const hasCustomName = button.name !== `Button ${button.id}`;
        const hasAction = actionType !== 0;
        const isDisabled = button.enabled === false;
        const actionConfig = this.transformActionConfig(button.action, button.config);
        const hasActionConfig = Object.keys(actionConfig).length > 0;
        
        // Only include button if it has non-default configuration
        if (hasCustomName || hasAction || isDisabled || hasActionConfig) {
          const btnConfig: any = { id: button.id };
          
          if (hasCustomName) {
            btnConfig.name = button.name;
          }
          if (hasAction) {
            btnConfig.action = actionType;
          }
          if (isDisabled) {
            btnConfig.enabled = false;
          }
          if (hasActionConfig) {
            btnConfig.config = actionConfig;
          }
          
          buttonsArray.push(btnConfig);
        }
      });
    }
    
    // Only include buttons section if there are configured buttons
    if (buttonsArray.length > 0) {
      optimizedConfig.buttons = buttonsArray;
    }

    console.log('[TRANSFORM] Generated Arduino-compatible optimized config:', optimizedConfig);
    const optimizedJson = JSON.stringify(optimizedConfig);
    console.log('[TRANSFORM] Optimized JSON length:', optimizedJson.length);
    console.log('[TRANSFORM] Original would be ~683 chars, optimized is:', optimizedJson.length, 'chars');
    
    if (optimizedJson.length < 683) {
      console.log('[TRANSFORM] Size reduction:', Math.round((1 - optimizedJson.length / 683) * 100) + '%');
    } else {
      console.log('[TRANSFORM] Size increased by:', Math.round((optimizedJson.length / 683 - 1) * 100) + '%');
    }
    
    return optimizedConfig;
  }

  private getArduinoActionType(electronAction: string): number {
    console.log('[ACTION-MAP] Mapping electron action:', electronAction);
    const actionMap: Record<string, number> = {
      'none': 0,      // ACTION_NONE
      'http': 1,      // ACTION_HTTP
      'webhook': 2,   // ACTION_WEBHOOK
      'script': 0,    // Treat as none for now
    };
    const mappedValue = actionMap[electronAction] || 0;
    console.log('[ACTION-MAP] Mapped to Arduino action type:', mappedValue);
    return mappedValue;
  }

  private transformActionConfig(actionType: string, config: any): Record<string, any> {
    if (actionType === 'http' || actionType === 'webhook') {
      return {
        url: config.url || '',
        method: config.method || 'POST',
        body: config.body || '',
        secret: config.secret || ''
      };
    }
    return {};
  }
}