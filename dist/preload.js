"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Validate that we're in the correct context
if (!process.contextIsolated) {
    console.error('Context isolation is not enabled!');
}
// Create the secure API bridge
const electronAPIImpl = {
    // Configuration operations
    getConfig: () => electron_1.ipcRenderer.invoke('get-config'),
    updateConfig: (config) => electron_1.ipcRenderer.invoke('update-config', config),
    onConfigUpdated: (callback) => electron_1.ipcRenderer.on('config-updated', callback),
    // Device operations
    getSerialPorts: () => electron_1.ipcRenderer.invoke('get-serial-ports'),
    connectDevice: (port, baudRate) => electron_1.ipcRenderer.invoke('connect-device', port, baudRate),
    disconnectDevice: () => electron_1.ipcRenderer.invoke('disconnect-device'),
    uploadConfig: () => electron_1.ipcRenderer.invoke('upload-config'),
    autoDetectPATCOM: () => electron_1.ipcRenderer.invoke('auto-detect-patcom'),
    getDeviceStatus: () => electron_1.ipcRenderer.invoke('get-device-status'),
    onDeviceIdentified: (callback) => electron_1.ipcRenderer.on('device-identified', callback),
    onDeviceInfo: (callback) => electron_1.ipcRenderer.on('device-info', callback),
    // Discovery operations
    discoverDevices: () => electron_1.ipcRenderer.invoke('discover-devices'),
    getDiscoveredDevices: () => electron_1.ipcRenderer.invoke('get-discovered-devices'),
    syncAllDevices: () => electron_1.ipcRenderer.invoke('sync-all-devices'),
    syncToDevice: (deviceId) => electron_1.ipcRenderer.invoke('sync-to-device', deviceId),
    getDeviceConfig: (deviceId) => electron_1.ipcRenderer.invoke('get-device-config', deviceId),
    onDeviceDiscovered: (callback) => electron_1.ipcRenderer.on('device-discovered', callback),
    onConfigUpdateAck: (callback) => electron_1.ipcRenderer.on('config-update-ack', callback),
    // App utilities
    getAppVersion: () => electron_1.ipcRenderer.invoke('get-app-version'),
    showMessageBox: (options) => electron_1.ipcRenderer.invoke('show-message-box', options)
};
// Expose the secure API to the renderer process
electron_1.contextBridge.exposeInMainWorld('electronAPI', electronAPIImpl);
// Add version info for debugging
electron_1.contextBridge.exposeInMainWorld('versions', {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
});
// Development utilities (only in dev mode)
if (process.argv.includes('--dev')) {
    electron_1.contextBridge.exposeInMainWorld('devTools', {
        reload: () => window.location.reload(),
        toggleDevTools: () => electron_1.ipcRenderer.invoke('toggle-dev-tools')
    });
}
console.log('Preload script loaded successfully');
//# sourceMappingURL=preload.js.map