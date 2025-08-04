import { contextBridge, ipcRenderer } from 'electron';

// Define the API interface for type safety
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

// Validate that we're in the correct context
if (!process.contextIsolated) {
  console.error('Context isolation is not enabled!');
}

// Create the secure API bridge
const electronAPIImpl: ElectronAPI = {
  // Configuration operations
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (config) => ipcRenderer.invoke('update-config', config),
  onConfigUpdated: (callback) => ipcRenderer.on('config-updated', callback),

  // Device operations
  getSerialPorts: () => ipcRenderer.invoke('get-serial-ports'),
  connectDevice: (port, baudRate) => ipcRenderer.invoke('connect-device', port, baudRate),
  disconnectDevice: () => ipcRenderer.invoke('disconnect-device'),
  uploadConfig: () => ipcRenderer.invoke('upload-config'),
  autoDetectPATCOM: () => ipcRenderer.invoke('auto-detect-patcom'),
  getDeviceStatus: () => ipcRenderer.invoke('get-device-status'),
  onDeviceIdentified: (callback) => ipcRenderer.on('device-identified', callback),
  onDeviceInfo: (callback) => ipcRenderer.on('device-info', callback),

  // Discovery operations
  discoverDevices: () => ipcRenderer.invoke('discover-devices'),
  getDiscoveredDevices: () => ipcRenderer.invoke('get-discovered-devices'),
  syncAllDevices: () => ipcRenderer.invoke('sync-all-devices'),
  syncToDevice: (deviceId) => ipcRenderer.invoke('sync-to-device', deviceId),
  getDeviceConfig: (deviceId) => ipcRenderer.invoke('get-device-config', deviceId),
  onDeviceDiscovered: (callback) => ipcRenderer.on('device-discovered', callback),
  onConfigUpdateAck: (callback) => ipcRenderer.on('config-update-ack', callback),

  // App utilities
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),

  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized')
};

// Expose the secure API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPIImpl);

// Add version info for debugging
contextBridge.exposeInMainWorld('versions', {
  node: process.versions.node,
  chrome: process.versions.chrome,
  electron: process.versions.electron,
});

// Development utilities (only in dev mode)
if (process.argv.includes('--dev')) {
  contextBridge.exposeInMainWorld('devTools', {
    reload: () => window.location.reload(),
    toggleDevTools: () => ipcRenderer.invoke('toggle-dev-tools')
  });
}

console.log('Preload script loaded successfully');