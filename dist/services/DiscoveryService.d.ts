import { EventEmitter } from 'events';
import { DiscoveredDevice, ConfigData } from '../types';
export declare class DiscoveryService extends EventEmitter {
    private discoverySocket;
    private configSocket;
    private discoveredDevices;
    private readonly DISCOVERY_PORT;
    private readonly CONFIG_PORT;
    initialize(): void;
    private setupDiscoveryService;
    private handleDiscoveryMessage;
    private handleConfigMessage;
    discoverDevices(): void;
    getDiscoveredDevices(): DiscoveredDevice[];
    syncConfigToDevice(deviceId: string, configData: ConfigData): void;
    syncAllDevices(configData: ConfigData): void;
    getDeviceConfig(deviceId: string): Promise<any>;
    cleanup(): void;
}
//# sourceMappingURL=DiscoveryService.d.ts.map