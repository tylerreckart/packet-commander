"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscoveryService = void 0;
const dgram = __importStar(require("dgram"));
const os = __importStar(require("os"));
const events_1 = require("events");
class DiscoveryService extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this.discoverySocket = null;
        this.configSocket = null;
        this.discoveredDevices = new Map();
        this.DISCOVERY_PORT = 12345;
        this.CONFIG_PORT = 12346;
    }
    initialize() {
        this.setupDiscoveryService();
    }
    setupDiscoveryService() {
        this.discoverySocket = dgram.createSocket('udp4');
        this.configSocket = dgram.createSocket('udp4');
        this.discoverySocket.on('message', (msg, rinfo) => {
            try {
                const message = JSON.parse(msg.toString());
                this.handleDiscoveryMessage(message, rinfo);
            }
            catch (error) {
                console.error('Error parsing discovery message:', error);
            }
        });
        this.configSocket.on('message', (msg, rinfo) => {
            try {
                const message = JSON.parse(msg.toString());
                this.handleConfigMessage(message, rinfo);
            }
            catch (error) {
                console.error('Error parsing config message:', error);
            }
        });
        this.discoverySocket.bind(this.DISCOVERY_PORT, () => {
            console.log('Discovery service listening on port', this.DISCOVERY_PORT);
            this.discoverySocket.setBroadcast(true);
        });
        this.configSocket.bind(this.CONFIG_PORT, () => {
            console.log('Config service listening on port', this.CONFIG_PORT);
        });
    }
    handleDiscoveryMessage(message, rinfo) {
        if (message.type === 'device_discovery' || message.type === 'device_response') {
            const device = {
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
    handleConfigMessage(message, rinfo) {
        if (message.type === 'config_response') {
            this.emit('device-config-received', {
                deviceId: message.device_id,
                config: message,
                source: rinfo.address
            });
        }
        else if (message.type === 'config_update_response') {
            this.emit('config-update-ack', {
                deviceId: message.device_id || 'unknown',
                success: message.success,
                message: message.message,
                configHash: message.config_hash
            });
        }
    }
    discoverDevices() {
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
                    this.discoverySocket.send(request, this.DISCOVERY_PORT, broadcast, (err) => {
                        if (err) {
                            console.error('Discovery broadcast error:', err);
                        }
                        else {
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
    getDiscoveredDevices() {
        return Array.from(this.discoveredDevices.values());
    }
    syncConfigToDevice(deviceId, configData) {
        const device = this.discoveredDevices.get(deviceId);
        if (!device) {
            throw new Error('Device not found');
        }
        const configRequest = JSON.stringify({
            type: 'set_config',
            device_id: device.deviceId,
            ...configData
        });
        this.configSocket.send(configRequest, this.CONFIG_PORT, device.ip, (err) => {
            if (err) {
                console.error('Config sync error for', device.deviceName, ':', err);
            }
            else {
                console.log('Config synced to', device.deviceName);
            }
        });
    }
    syncAllDevices(configData) {
        console.log('Syncing configuration to all discovered devices...');
        for (const [deviceId] of this.discoveredDevices) {
            this.syncConfigToDevice(deviceId, configData);
        }
    }
    async getDeviceConfig(deviceId) {
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
            const handler = (data) => {
                if (data.deviceId === deviceId) {
                    clearTimeout(timeout);
                    this.off('device-config-received', handler);
                    resolve(data.config);
                }
            };
            this.on('device-config-received', handler);
            this.configSocket.send(request, this.CONFIG_PORT, device.ip, (err) => {
                if (err) {
                    clearTimeout(timeout);
                    this.off('device-config-received', handler);
                    reject(err);
                }
            });
        });
    }
    cleanup() {
        if (this.discoverySocket) {
            this.discoverySocket.close();
        }
        if (this.configSocket) {
            this.configSocket.close();
        }
    }
}
exports.DiscoveryService = DiscoveryService;
//# sourceMappingURL=DiscoveryService.js.map