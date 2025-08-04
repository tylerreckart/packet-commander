/**
 * Type definitions for the Electron renderer process
 */

interface ElectronAPI {
  // Configuration management
  getConfig: () => Promise<any>;
  updateConfig: (config: any) => Promise<void>;
  onConfigUpdated: (callback: (event: any, config: any) => void) => void;

  // Device operations
  getSerialPorts: () => Promise<any[]>;
  connectDevice: (port: string, baudRate: number) => Promise<{ success: boolean; message?: string }>;
  disconnectDevice: () => Promise<void>;
  uploadConfig: () => Promise<{ success: boolean; message?: string }>;
  autoDetectPATCOM: () => Promise<any>;
  getDeviceStatus: () => Promise<{ connected: boolean }>;
  onDeviceIdentified: (callback: (event: any, deviceInfo: any) => void) => void;
  onDeviceInfo: (callback: (event: any, deviceInfo: any) => void) => void;

  // Network discovery operations
  discoverDevices: () => Promise<void>;
  getDiscoveredDevices: () => Promise<any[]>;
  syncAllDevices: () => Promise<void>;
  syncToDevice: (deviceId: string) => Promise<void>;
  getDeviceConfig: (deviceId: string) => Promise<any>;
  onDeviceDiscovered: (callback: (event: any, device: any) => void) => void;
  onConfigUpdateAck: (callback: (event: any, ack: any) => void) => void;

  // App info
  getAppVersion: () => Promise<string>;
  showMessageBox: (options: any) => Promise<any>;
}

interface Window {
  electronAPI: ElectronAPI;
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };
  devTools?: {
    reload: () => void;
    toggleDevTools: () => void;
  };
}

declare const window: Window;