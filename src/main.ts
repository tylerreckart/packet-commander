// Set app name BEFORE any imports to ensure it takes effect
import { app } from 'electron';
app.setName('Packet Commander');

// Set additional app properties for macOS before other imports
if (process.platform === 'darwin') {
  // These environment variables can affect the app name display
  process.env.npm_package_productName = 'Packet Commander';
  process.env.npm_package_name = 'packet-commander';
}

// Also try setting app user model id for Windows
if (process.platform === 'win32') {
  app.setAppUserModelId('com.patcom.packet-commander');
}

// Now import the rest
import { BrowserWindow, Menu, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { SerialService } from './services/SerialService';
import { ConfigService } from './services/ConfigService';
import { DiscoveryService } from './services/DiscoveryService';

class PatcomApp {
  private mainWindow: BrowserWindow | null = null;
  private serialService = new SerialService();
  private configService = new ConfigService();
  private discoveryService = new DiscoveryService();

  constructor() {
    // App name is already set at the top of the file before imports
    // Just set dock badge to force refresh on macOS if needed
    if (process.platform === 'darwin') {
      app.dock?.setBadge('');
    }
    
    this.setupApp();
    this.setupIpcHandlers();
  }

  private setupApp(): void {
    // Security: Enable secure defaults
    app.whenReady().then(() => {
      // Set dock icon for macOS (app name already set at startup)
      if (process.platform === 'darwin') {
        const iconPath = path.join(__dirname, '..', 'assets', 'icons', 'icon.icns');
        if (fs.existsSync(iconPath)) {
          try {
            app.dock?.setIcon(iconPath);
            console.log('App icon set in whenReady');
          } catch (error) {
            console.error('Failed to set app icon in whenReady:', error);
          }
        }
      }
      
      this.createWindow();
      this.createMenu();
      this.discoveryService.initialize();
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        this.cleanup();
        app.quit();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      }
    });

    // Security: Prevent new window creation
    app.on('web-contents-created', (_event, contents) => {
      contents.setWindowOpenHandler(() => {
        console.log('Blocked new window creation');
        return { action: 'deny' };
      });
    });
  }

  private createWindow(): void {
    // For BrowserWindow, use PNG icons as they're more reliable
    // Platform-specific dock/taskbar icons are handled separately
    let iconPath: string = path.join(__dirname, '..', 'assets', 'icons', 'icon-256.png');

    // Debug: Check if icon file exists
    console.log('Attempting to load icon from:', iconPath);
    console.log('Icon file exists:', fs.existsSync(iconPath));
    
    // Fallback to PNG if the platform-specific icon doesn't exist
    if (!fs.existsSync(iconPath)) {
      const fallbackPath = path.join(__dirname, '..', 'assets', 'patcom@1024.png');
      console.log('Falling back to:', fallbackPath);
      console.log('Fallback exists:', fs.existsSync(fallbackPath));
      if (fs.existsSync(fallbackPath)) {
        iconPath = fallbackPath;
      }
    }

    // Store iconPath as class property for later use
    (this as any).iconPath = iconPath;

    this.mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      minWidth: 800,
      minHeight: 600,
      maxWidth: 800,
      webPreferences: {
        // Modern security settings
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        preload: path.join(__dirname, 'preload.js'),
      },
      icon: iconPath,
      show: false, // Don't show until ready
      frame: false,
      titleBarStyle: 'hidden'
    });

    // Load the app
    this.mainWindow.loadFile(path.join(__dirname, '../src/renderer/index.html'));

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
      
      // Explicitly set the dock icon on macOS
      if (process.platform === 'darwin' && fs.existsSync((this as any).iconPath)) {
        try {
          app.dock?.setIcon((this as any).iconPath);
          console.log('Dock icon set successfully');
        } catch (error) {
          console.error('Failed to set dock icon:', error);
        }
      }
      
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
      } catch (error) {
        event.preventDefault();
        console.log('Blocked invalid navigation:', navigationUrl);
      }
    });
  }

  private createMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
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
              app.quit();
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

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  private setupIpcHandlers(): void {
    // Configuration handlers
    ipcMain.handle('get-config', async () => {
      try {
        return this.configService.getConfig();
      } catch (error) {
        console.error('Failed to get config:', error);
        return null;
      }
    });

    ipcMain.handle('update-config', async (_event, config) => {
      try {
        this.configService.updateConfig(config);
        this.mainWindow?.webContents.send('config-updated', config);
      } catch (error) {
        console.error('Failed to update config:', error);
        throw error;
      }
    });

    // Device handlers
    ipcMain.handle('get-serial-ports', async () => {
      console.log('[MAIN] IPC: get-serial-ports called');
      try {
        const ports = await this.serialService.getSerialPorts();
        console.log('[MAIN] IPC: get-serial-ports returning:', ports);
        return ports;
      } catch (error) {
        console.error('[MAIN] IPC: get-serial-ports error:', error);
        return [];
      }
    });

    ipcMain.handle('connect-device', async (_event, port, baudRate) => {
      console.log('[MAIN] IPC: connect-device called with:', { port, baudRate });
      try {
        const result = await this.serialService.connectDevice(port, baudRate);
        console.log('[MAIN] IPC: connect-device result:', result);
        return { success: result.success, message: result.message };
      } catch (error) {
        console.error('[MAIN] IPC: connect-device error:', error);
        const errorResult = { success: false, message: (error as Error).message };
        console.log('[MAIN] IPC: connect-device returning error result:', errorResult);
        return errorResult;
      }
    });

    ipcMain.handle('disconnect-device', async () => {
      await this.serialService.disconnectDevice();
    });

    ipcMain.handle('upload-config', async () => {
      console.log('[MAIN] IPC: upload-config called');
      try {
        console.log('[MAIN] Getting config from ConfigService...');
        const config = this.configService.getConfig();
        console.log('[MAIN] Config retrieved:', config);
        console.log('[MAIN] Config type:', typeof config);
        console.log('[MAIN] Config keys:', config ? Object.keys(config) : 'null/undefined');
        
        console.log('[MAIN] Calling SerialService.uploadConfig()...');
        const result = await this.serialService.uploadConfig(config);
        console.log('[MAIN] SerialService.uploadConfig() result:', result);
        
        console.log('[MAIN] Upload successful, returning success response');
        return { success: true, message: 'Configuration uploaded successfully' };
      } catch (error) {
        console.error('[MAIN] Upload error:', error);
        console.error('[MAIN] Error details:', {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack
        });
        const errorResult = { success: false, message: (error as Error).message };
        console.log('[MAIN] Returning error result:', errorResult);
        return errorResult;
      }
    });

    ipcMain.handle('auto-detect-patcom', async () => {
      console.log('[MAIN] IPC: auto-detect-patcom called');
      try {
        const result = await this.serialService.autoDetectPATCOM();
        console.log('[MAIN] IPC: auto-detect-patcom result:', result);
        return result;
      } catch (error) {
        console.error('[MAIN] IPC: auto-detect-patcom error:', error);
        return null;
      }
    });

    ipcMain.handle('get-device-status', async () => {
      return { connected: this.serialService.isConnected() };
    });

    // Discovery handlers
    ipcMain.handle('discover-devices', async () => {
      this.discoveryService.discoverDevices();
    });

    ipcMain.handle('get-discovered-devices', async () => {
      return this.discoveryService.getDiscoveredDevices();
    });

    ipcMain.handle('sync-all-devices', async () => {
      const config = this.configService.getConfig();
      this.discoveryService.syncAllDevices(config);
    });

    ipcMain.handle('sync-to-device', async (_event, deviceId) => {
      const config = this.configService.getConfig();
      this.discoveryService.syncConfigToDevice(deviceId, config);
    });

    ipcMain.handle('get-device-config', async (_event, deviceId) => {
      return await this.discoveryService.getDeviceConfig(deviceId);
    });

    // App utilities
    ipcMain.handle('get-app-version', () => {
      return app.getVersion();
    });

    ipcMain.handle('show-message-box', async (_event, options) => {
      if (this.mainWindow) {
        return await dialog.showMessageBox(this.mainWindow, options);
      }
      return null;
    });

    ipcMain.handle('toggle-dev-tools', () => {
      this.mainWindow?.webContents.toggleDevTools();
    });

    // Window control handlers
    ipcMain.handle('window-minimize', () => {
      this.mainWindow?.minimize();
    });

    ipcMain.handle('window-maximize', () => {
      if (this.mainWindow?.isMaximized()) {
        this.mainWindow.unmaximize();
      } else {
        this.mainWindow?.maximize();
      }
    });

    ipcMain.handle('window-close', () => {
      this.mainWindow?.close();
    });

    ipcMain.handle('window-is-maximized', () => {
      return this.mainWindow?.isMaximized() || false;
    });

    // Set up service event forwarding
    this.setupServiceEvents();
  }

  private setupServiceEvents(): void {
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
  private async newConfiguration(): Promise<void> {
    const result = await dialog.showMessageBox(this.mainWindow!, {
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

  private async openConfiguration(): Promise<void> {
    try {
      const result = await this.configService.loadConfigFile(this.mainWindow!);
      if (result.success) {
        const config = this.configService.getConfig();
        this.mainWindow?.webContents.send('config-updated', config);
      }
    } catch (error) {
      await dialog.showErrorBox('Error', `Failed to load configuration: ${(error as Error).message}`);
    }
  }

  private async saveConfiguration(): Promise<void> {
    try {
      await this.configService.saveConfigFile(this.mainWindow!);
    } catch (error) {
      await dialog.showErrorBox('Error', `Failed to save configuration: ${(error as Error).message}`);
    }
  }

  private async saveConfigurationAs(): Promise<void> {
    try {
      await this.configService.saveConfigFile(this.mainWindow!);
    } catch (error) {
      await dialog.showErrorBox('Error', `Failed to save configuration: ${(error as Error).message}`);
    }
  }

  private async showAbout(): Promise<void> {
    await dialog.showMessageBox(this.mainWindow!, {
      type: 'info',
      title: 'About Packet Commander',
      message: 'Packet Commander',
      detail: `Version: ${app.getVersion()}\n\nA modern configuration tool for Packet Commander devices.`,
      buttons: ['OK']
    });
  }

  private cleanup(): void {
    this.serialService.disconnectDevice();
    this.discoveryService.cleanup();
  }
}

// Initialize the application
new PatcomApp();