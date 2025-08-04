import * as dgram from 'dgram';
import * as os from 'os';
import { EventEmitter } from 'events';
import { DiscoveredDevice, ConfigData } from '../types';

export class DiscoveryService extends EventEmitter {
  private discoverySocket: dgram.Socket | null = null;
  private configSocket: dgram.Socket | null = null;
  private discoveredDevices = new Map<string, DiscoveredDevice>();
  private readonly DISCOVERY_PORT = 12345;
  private readonly CONFIG_PORT = 12346;

  initialize(): void {
    this.setupDiscoveryService();
  }

  private setupDiscoveryService(): void {
    this.discoverySocket = dgram.createSocket('udp4');
    this.configSocket = dgram.createSocket('udp4');
    
    this.discoverySocket.on('message', (msg, rinfo) => {
      try {
        const message = JSON.parse(msg.toString());
        this.handleDiscoveryMessage(message, rinfo);
      } catch (error) {
        console.error('Error parsing discovery message:', error);
      }
    });
    
    this.configSocket.on('message', (msg, rinfo) => {
      try {
        const message = JSON.parse(msg.toString());
        this.handleConfigMessage(message, rinfo);
      } catch (error) {
        console.error('Error parsing config message:', error);
      }
    });
    
    this.discoverySocket.bind(this.DISCOVERY_PORT, () => {
      console.log('Discovery service listening on port', this.DISCOVERY_PORT);
      this.discoverySocket!.setBroadcast(true);
    });
    
    this.configSocket.bind(this.CONFIG_PORT, () => {
      console.log('Config service listening on port', this.CONFIG_PORT);
    });
  }

  private handleDiscoveryMessage(message: any, rinfo: dgram.RemoteInfo): void {
    if (message.type === 'device_discovery' || message.type === 'device_response') {
      const device: DiscoveredDevice = {
        deviceId: message.device_id,
        deviceName: message.device_name,
        deviceType: message.device_type,
        version: message.version,
        ip: message.ip || rinfo.address,
        mac: message.mac,
        battery: message.battery,
        uptime: message.uptime,
        configHash: message.config_hash,
        rssi: message.wifi_rssi,
        lastSeen: Date.now()
      };
      
      this.discoveredDevices.set(device.deviceId, device);
      this.emit('device-discovered', device);
      
      console.log('Discovered device:', device.deviceName, 'at', device.ip);
    }
  }

  private handleConfigMessage(message: any, rinfo: dgram.RemoteInfo): void {
    if (message.type === 'config_response') {
      this.emit('device-config-received', {
        deviceId: message.device_id,
        config: message,
        source: rinfo.address
      });
    } else if (message.type === 'config_update_response') {
      this.emit('config-update-ack', {
        deviceId: message.device_id || 'unknown',
        success: message.success,
        message: message.message,
        configHash: message.config_hash
      });
    }
  }

  discoverDevices(): void {
    const request = JSON.stringify({
      type: 'discover_devices',
      timestamp: Date.now()
    });
    
    // Get all network interfaces to broadcast on all subnets
    const interfaces = os.networkInterfaces();
    
    Object.keys(interfaces).forEach(ifname => {
      interfaces[ifname]?.forEach(iface => {
        if (iface.family === 'IPv4' && !iface.internal) {
          const parts = iface.address.split('.');
          const broadcast = `${parts[0]}.${parts[1]}.${parts[2]}.255`;
          
          this.discoverySocket!.send(request, this.DISCOVERY_PORT, broadcast, (err) => {
            if (err) {
              console.error('Discovery broadcast error:', err);
            } else {
              console.log('Discovery request sent to', broadcast);
            }
          });
        }
      });
    });
    
    // Clear old devices (older than 2 minutes)
    const cutoff = Date.now() - 120000;
    for (const [deviceId, device] of this.discoveredDevices) {
      if (device.lastSeen < cutoff) {
        this.discoveredDevices.delete(deviceId);
      }
    }
    
    console.log('Device discovery initiated');
  }

  getDiscoveredDevices(): DiscoveredDevice[] {
    return Array.from(this.discoveredDevices.values());
  }

  syncConfigToDevice(deviceId: string, configData: ConfigData): void {
    const device = this.discoveredDevices.get(deviceId);
    if (!device) {
      throw new Error('Device not found');
    }

    const configRequest = JSON.stringify({
      type: 'set_config',
      device_id: device.deviceId,
      ...configData
    });
    
    this.configSocket!.send(configRequest, this.CONFIG_PORT, device.ip, (err) => {
      if (err) {
        console.error('Config sync error for', device.deviceName, ':', err);
      } else {
        console.log('Config synced to', device.deviceName);
      }
    });
  }

  syncAllDevices(configData: ConfigData): void {
    console.log('Syncing configuration to all discovered devices...');
    
    for (const [deviceId] of this.discoveredDevices) {
      this.syncConfigToDevice(deviceId, configData);
    }
  }

  async getDeviceConfig(deviceId: string): Promise<any> {
    const device = this.discoveredDevices.get(deviceId);
    if (!device) {
      throw new Error('Device not found');
    }
    
    const request = JSON.stringify({
      type: 'get_config',
      device_id: deviceId
    });
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Config request timeout'));
      }, 5000);
      
      const handler = (data: any) => {
        if (data.deviceId === deviceId) {
          clearTimeout(timeout);
          this.off('device-config-received', handler);
          resolve(data.config);
        }
      };
      
      this.on('device-config-received', handler);
      
      this.configSocket!.send(request, this.CONFIG_PORT, device.ip, (err) => {
        if (err) {
          clearTimeout(timeout);
          this.off('device-config-received', handler);
          reject(err);
        }
      });
    });
  }

  cleanup(): void {
    if (this.discoverySocket) {
      this.discoverySocket.close();
    }
    if (this.configSocket) {
      this.configSocket.close();
    }
  }
}