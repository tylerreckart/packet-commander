"use strict";
/**
 * PATCOM Configurator - Modern Main Process
 * Simplified architecture following Electron security best practices
 */
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
const electron_1 = require("electron");
const path = __importStar(require("path"));
const SerialService_1 = require("./services/SerialService");
const ConfigService_1 = require("./services/ConfigService");
const DiscoveryService_1 = require("./services/DiscoveryService");
class PatcomApp {
    constructor() {
        this.mainWindow = null;
        this.serialService = new SerialService_1.SerialService();
        this.configService = new ConfigService_1.ConfigService();
        this.discoveryService = new DiscoveryService_1.DiscoveryService();
        this.setupApp();
        this.setupIpcHandlers();
    }
    setupApp() {
        // Security: Enable secure defaults
        electron_1.app.whenReady().then(() => {
            this.createWindow();
            this.createMenu();
            this.discoveryService.initialize();
        });
        electron_1.app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                this.cleanup();
                electron_1.app.quit();
            }
        });
        electron_1.app.on('activate', () => {
            if (electron_1.BrowserWindow.getAllWindows().length === 0) {
                this.createWindow();
            }
        });
        // Security: Prevent new window creation
        electron_1.app.on('web-contents-created', (_event, contents) => {
            contents.setWindowOpenHandler(() => {
                console.log('Blocked new window creation');
                return { action: 'deny' };
            });
        });
    }
    createWindow() {
        this.mainWindow = new electron_1.BrowserWindow({
            width: 1400,
            height: 900,
            minWidth: 800,
            minHeight: 600,
            webPreferences: {
                // Modern security settings
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: true,
                allowRunningInsecureContent: false,
                experimentalFeatures: false,
                preload: path.join(__dirname, 'preload.js'),
            },
            icon: path.join(__dirname, '../assets/patcom.png'),
            show: false, // Don't show until ready
            titleBarStyle: 'default',
        });
        // Load the app
        this.mainWindow.loadFile(path.join(__dirname, '../src/renderer/index.html'));
        // Show window when ready
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow?.show();
            // Open dev tools in development
            if (process.argv.includes('--dev')) {
                this.mainWindow?.webContents.openDevTools();
            }
        });
        // Handle window closed
        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });
        // Security: Prevent navigation
        this.mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
            try {
                const parsedUrl = new URL(navigationUrl);
                if (parsedUrl.protocol !== 'file:') {
                    event.preventDefault();
                    console.log('Blocked navigation to:', navigationUrl);
                }
            }
            catch (error) {
                event.preventDefault();
                console.log('Blocked invalid navigation:', navigationUrl);
            }
        });
    }
    createMenu() {
        const template = [
            {
                label: 'File',
                submenu: [
                    {
                        label: 'New Configuration',
                        accelerator: 'CmdOrCtrl+N',
                        click: () => this.newConfiguration()
                    },
                    {
                        label: 'Open Configuration...',
                        accelerator: 'CmdOrCtrl+O',
                        click: () => this.openConfiguration()
                    },
                    {
                        label: 'Save Configuration',
                        accelerator: 'CmdOrCtrl+S',
                        click: () => this.saveConfiguration()
                    },
                    {
                        label: 'Save Configuration As...',
                        accelerator: 'CmdOrCtrl+Shift+S',
                        click: () => this.saveConfigurationAs()
                    },
                    { type: 'separator' },
                    {
                        label: 'Exit',
                        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                        click: () => {
                            electron_1.app.quit();
                        }
                    }
                ]
            },
            {
                label: 'Device',
                submenu: [
                    {
                        label: 'Connect Device',
                        accelerator: 'CmdOrCtrl+D',
                        click: () => this.mainWindow?.webContents.send('menu-connect-device')
                    },
                    {
                        label: 'Upload Configuration',
                        accelerator: 'CmdOrCtrl+U',
                        click: () => this.mainWindow?.webContents.send('menu-upload-config')
                    },
                    { type: 'separator' },
                    {
                        label: 'Discover Network Devices',
                        click: () => this.mainWindow?.webContents.send('menu-discover-devices')
                    }
                ]
            },
            {
                label: 'View',
                submenu: [
                    { role: 'reload' },
                    { role: 'forceReload' },
                    { role: 'toggleDevTools' },
                    { type: 'separator' },
                    { role: 'resetZoom' },
                    { role: 'zoomIn' },
                    { role: 'zoomOut' },
                    { type: 'separator' },
                    { role: 'togglefullscreen' }
                ]
            },
            {
                label: 'Help',
                submenu: [
                    {
                        label: 'About',
                        click: () => this.showAbout()
                    }
                ]
            }
        ];
        const menu = electron_1.Menu.buildFromTemplate(template);
        electron_1.Menu.setApplicationMenu(menu);
    }
    setupIpcHandlers() {
        // Configuration handlers
        electron_1.ipcMain.handle('get-config', async () => {
            try {
                return this.configService.getConfig();
            }
            catch (error) {
                console.error('Failed to get config:', error);
                return null;
            }
        });
        electron_1.ipcMain.handle('update-config', async (_event, config) => {
            try {
                this.configService.updateConfig(config);
                this.mainWindow?.webContents.send('config-updated', config);
            }
            catch (error) {
                console.error('Failed to update config:', error);
                throw error;
            }
        });
        // Device handlers
        electron_1.ipcMain.handle('get-serial-ports', async () => {
            return await this.serialService.getSerialPorts();
        });
        electron_1.ipcMain.handle('connect-device', async (_event, port, baudRate) => {
            try {
                const result = await this.serialService.connectDevice(port, baudRate);
                return { success: result.success, message: result.message };
            }
            catch (error) {
                return { success: false, message: error.message };
            }
        });
        electron_1.ipcMain.handle('disconnect-device', async () => {
            await this.serialService.disconnectDevice();
        });
        electron_1.ipcMain.handle('upload-config', async () => {
            try {
                const config = this.configService.getConfig();
                await this.serialService.uploadConfig(config);
                return { success: true, message: 'Configuration uploaded successfully' };
            }
            catch (error) {
                return { success: false, message: error.message };
            }
        });
        electron_1.ipcMain.handle('auto-detect-patcom', async () => {
            return await this.serialService.autoDetectPATCOM();
        });
        electron_1.ipcMain.handle('get-device-status', async () => {
            return { connected: this.serialService.isConnected() };
        });
        // Discovery handlers
        electron_1.ipcMain.handle('discover-devices', async () => {
            this.discoveryService.discoverDevices();
        });
        electron_1.ipcMain.handle('get-discovered-devices', async () => {
            return this.discoveryService.getDiscoveredDevices();
        });
        electron_1.ipcMain.handle('sync-all-devices', async () => {
            const config = this.configService.getConfig();
            this.discoveryService.syncAllDevices(config);
        });
        electron_1.ipcMain.handle('sync-to-device', async (_event, deviceId) => {
            const config = this.configService.getConfig();
            this.discoveryService.syncConfigToDevice(deviceId, config);
        });
        electron_1.ipcMain.handle('get-device-config', async (_event, deviceId) => {
            return await this.discoveryService.getDeviceConfig(deviceId);
        });
        // App utilities
        electron_1.ipcMain.handle('get-app-version', () => {
            return electron_1.app.getVersion();
        });
        electron_1.ipcMain.handle('show-message-box', async (_event, options) => {
            if (this.mainWindow) {
                return await electron_1.dialog.showMessageBox(this.mainWindow, options);
            }
            return null;
        });
        electron_1.ipcMain.handle('toggle-dev-tools', () => {
            this.mainWindow?.webContents.toggleDevTools();
        });
        // Set up service event forwarding
        this.setupServiceEvents();
    }
    setupServiceEvents() {
        // Forward device events to renderer
        this.serialService.on('device-identified', (deviceInfo) => {
            this.mainWindow?.webContents.send('device-identified', deviceInfo);
        });
        this.serialService.on('device-info', (deviceInfo) => {
            this.mainWindow?.webContents.send('device-info', deviceInfo);
        });
        // Forward discovery events to renderer
        this.discoveryService.on('device-discovered', (device) => {
            this.mainWindow?.webContents.send('device-discovered', device);
        });
        this.discoveryService.on('config-update-ack', (ack) => {
            this.mainWindow?.webContents.send('config-update-ack', ack);
        });
    }
    // Menu handlers
    async newConfiguration() {
        const result = await electron_1.dialog.showMessageBox(this.mainWindow, {
            type: 'warning',
            title: 'New Configuration',
            message: 'Create a new configuration? This will clear all current settings.',
            buttons: ['Cancel', 'Create New'],
            defaultId: 0,
            cancelId: 0
        });
        if (result.response === 1) {
            const newConfig = this.configService.resetConfig();
            this.mainWindow?.webContents.send('config-updated', newConfig);
        }
    }
    async openConfiguration() {
        try {
            const result = await this.configService.loadConfigFile(this.mainWindow);
            if (result.success) {
                const config = this.configService.getConfig();
                this.mainWindow?.webContents.send('config-updated', config);
            }
        }
        catch (error) {
            await electron_1.dialog.showErrorBox('Error', `Failed to load configuration: ${error.message}`);
        }
    }
    async saveConfiguration() {
        try {
            await this.configService.saveConfigFile(this.mainWindow);
        }
        catch (error) {
            await electron_1.dialog.showErrorBox('Error', `Failed to save configuration: ${error.message}`);
        }
    }
    async saveConfigurationAs() {
        try {
            await this.configService.saveConfigFile(this.mainWindow);
        }
        catch (error) {
            await electron_1.dialog.showErrorBox('Error', `Failed to save configuration: ${error.message}`);
        }
    }
    async showAbout() {
        await electron_1.dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: 'About PATCOM Configurator',
            message: 'PATCOM Configurator',
            detail: `Version: ${electron_1.app.getVersion()}\n\nA modern configuration tool for Packet Commander devices.`,
            buttons: ['OK']
        });
    }
    cleanup() {
        this.serialService.disconnectDevice();
        this.discoveryService.cleanup();
    }
}
// Initialize the application
new PatcomApp();
//# sourceMappingURL=main.js.map