const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Configuration
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (config) => ipcRenderer.invoke('update-config', config),
  saveConfigFile: () => ipcRenderer.invoke('save-config-file'),
  loadConfigFile: () => ipcRenderer.invoke('load-config-file'),
  
  // Device communication
  getSerialPorts: () => ipcRenderer.invoke('get-serial-ports'),
  connectDevice: (portPath, baudRate) => ipcRenderer.invoke('connect-device', portPath, baudRate),
  disconnectDevice: () => ipcRenderer.invoke('disconnect-device'),
  uploadConfig: () => ipcRenderer.invoke('upload-config'),
  testButton: (buttonIndex) => ipcRenderer.invoke('test-button', buttonIndex),
  getDeviceStatus: () => ipcRenderer.invoke('get-device-status'),
  
  // Device discovery and management
  discoverDevices: () => ipcRenderer.invoke('discover-devices'),
  getDiscoveredDevices: () => ipcRenderer.invoke('get-discovered-devices'),
  syncToDevice: (deviceId) => ipcRenderer.invoke('sync-to-device', deviceId),
  syncAllDevices: () => ipcRenderer.invoke('sync-all-devices'),
  getDeviceConfig: (deviceId) => ipcRenderer.invoke('get-device-config', deviceId),
  
  // Event listeners
  onConfigUpdated: (callback) => {
    ipcRenderer.on('config-updated', callback);
  },
  
  onDeviceInfo: (callback) => {
    ipcRenderer.on('device-info', callback);
  },
  
  onDeviceHeartbeat: (callback) => {
    ipcRenderer.on('device-heartbeat', callback);
  },
  
  onDeviceEvent: (callback) => {
    ipcRenderer.on('device-event', callback);
  },
  
  onBatteryStatus: (callback) => {
    ipcRenderer.on('battery-status', callback);
  },
  
  onDeviceResponse: (callback) => {
    ipcRenderer.on('device-response', callback);
  },
  
  onDeviceDiscovered: (callback) => {
    ipcRenderer.on('device-discovered', callback);
  },
  
  onConfigUpdateAck: (callback) => {
    ipcRenderer.on('config-update-ack', callback);
  },
  
  onDeviceConfigReceived: (callback) => {
    ipcRenderer.on('device-config-received', callback);
  },
  
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});