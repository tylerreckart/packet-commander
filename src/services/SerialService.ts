import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { EventEmitter } from 'events';
import { SerialPortInfo, DeviceInfo, ConnectionResult, DeviceMessage, ConfigData, ArduinoConfig } from '../types';

export class SerialService extends EventEmitter {
  private serialPort: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private deviceConnected = false;

  async getSerialPorts(): Promise<SerialPortInfo[]> {
    try {
      const ports = await SerialPort.list();
      return ports.map(port => ({
        path: port.path,
        manufacturer: port.manufacturer || 'Unknown',
        vendorId: port.vendorId,
        productId: port.productId,
        isPATCOM: this.isPotentialPATCOM(port)
      }));
    } catch (error) {
      console.error('Error listing serial ports:', error);
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
    if (this.serialPort && this.serialPort.isOpen) {
      await this.serialPort.close();
    }

    return new Promise((resolve, reject) => {
      this.serialPort = new SerialPort({ path: portPath, baudRate });
      this.parser = this.serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);

      this.serialPort.on('open', () => {
        clearTimeout(timeout);
        this.deviceConnected = true;
        
        // Request device identification first
        this.serialPort!.write('IDENTIFY\n');
        setTimeout(() => {
          this.serialPort!.write('STATUS\n');
        }, 500);
        
        resolve({ success: true, message: 'Connected successfully' });
      });

      this.serialPort.on('error', (err) => {
        clearTimeout(timeout);
        this.deviceConnected = false;
        reject(err);
      });

      this.parser!.on('data', (data: string) => {
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
    if (!this.serialPort || !this.serialPort.isOpen) {
      throw new Error('Device not connected');
    }

    const arduinoConfig = this.transformConfigForArduino(configData);
    const configJson = JSON.stringify(arduinoConfig);
    const command = `SET_CONFIG:${configJson}\n`;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Upload timeout'));
      }, 10000);

      const responseHandler = (data: string) => {
        if (data.startsWith('RESPONSE:')) {
          const response = JSON.parse(data.substring(9));
          if (response.type === 'config_upload') {
            clearTimeout(timeout);
            this.parser!.off('data', responseHandler);
            resolve(response);
          }
        }
      };

      this.parser!.on('data', responseHandler);
      this.serialPort!.write(command);
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

  private transformConfigForArduino(configData: ConfigData): ArduinoConfig {
    return {
      device: {
        name: configData.device.name,
        brightness: configData.device.brightness || 255,
        discoverable: configData.device.discoverable !== false
      },
      network: {
        ssid: configData.network.ssid || '',
        password: configData.network.password || '',
        staticIP: configData.network.staticIP || false,
        ip: configData.network.ip || '',
        subnet: configData.network.subnet || '',
        gateway: configData.network.gateway || ''
      },
      buttons: configData.buttons.map(button => ({
        id: button.id,
        name: button.name,
        action: this.getArduinoActionType(button.action),
        enabled: button.enabled !== false,
        config: this.transformActionConfig(button.action, button.config)
      }))
    };
  }

  private getArduinoActionType(electronAction: string): number {
    const actionMap: Record<string, number> = {
      'none': 0,      // ACTION_NONE
      'http': 1,      // ACTION_HTTP
      'webhook': 2,   // ACTION_WEBHOOK
      'midi': 1,      // Treat as HTTP for now
      'osc': 1,       // Treat as HTTP for now
      'script': 0,    // Treat as none for now
      'serial': 0     // Treat as none for now
    };
    return actionMap[electronAction] || 0;
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