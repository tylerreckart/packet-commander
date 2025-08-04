export interface ButtonConfig {
    id: number;
    name: string;
    action: ActionType;
    config: ActionConfig;
    enabled?: boolean;
}
export interface NetworkConfig {
    ssid: string;
    password: string;
    staticIP: boolean;
    ip: string;
    subnet: string;
    gateway: string;
}
export interface DeviceConfig {
    serialPort: string;
    baudRate: number;
    name: string;
    brightness: number;
    deviceId: string;
    deviceType: number;
    discoverable: boolean;
    autoSync: boolean;
    configServerUrl: string;
}
export interface ConfigData {
    buttons: ButtonConfig[];
    network: NetworkConfig;
    device: DeviceConfig;
    apiKeys: Record<string, string>;
    customConfig: string;
}
export type ActionType = 'none' | 'http' | 'webhook' | 'midi' | 'osc' | 'script' | 'serial';
export interface ActionConfig {
    url?: string;
    method?: string;
    body?: string;
    secret?: string;
    note?: number;
    velocity?: number;
    channel?: number;
    host?: string;
    port?: number;
    address?: string;
    code?: string;
    command?: string;
}
export interface SerialPortInfo {
    path: string;
    manufacturer?: string;
    vendorId?: string;
    productId?: string;
    isPATCOM?: boolean;
}
export interface DeviceInfo {
    device_id: string;
    device_name: string;
    version: string;
    device_type: string;
    connection: string;
}
export interface DiscoveredDevice {
    deviceId: string;
    deviceName: string;
    deviceType: string;
    version: string;
    ip: string;
    mac?: string;
    battery?: number;
    uptime?: number;
    configHash?: string;
    rssi?: number;
    lastSeen: number;
}
export interface DeviceMessage {
    type: string;
    success?: boolean;
    message?: string;
    timestamp?: number;
    [key: string]: any;
}
export interface ConnectionResult {
    success: boolean;
    message: string;
}
export interface ArduinoConfig {
    device: {
        name: string;
        brightness: number;
        discoverable: boolean;
    };
    network: {
        ssid: string;
        password: string;
        staticIP: boolean;
        ip: string;
        subnet: string;
        gateway: string;
    };
    buttons: Array<{
        id: number;
        name: string;
        action: number;
        enabled: boolean;
        config: Record<string, any>;
    }>;
}
//# sourceMappingURL=index.d.ts.map