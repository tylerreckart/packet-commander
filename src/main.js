const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const dgram = require('dgram');
const os = require('os');

let mainWindow;
let serialPort = null;
let parser = null;
let deviceConnected = false;
let discoverySocket = null;
let configSocket = null;
let discoveredDevices = new Map();
const DISCOVERY_PORT = 12345;
const CONFIG_PORT = 12346;

let configData = {
  buttons: Array(8).fill(null).map((_, i) => ({
    id: i,
    name: `Button ${i}`,
    action: 'none',
    config: {}
  })),
  network: {
    ssid: '',
    password: '',
    staticIP: false,
    ip: '',
    subnet: '',
    gateway: ''
  },
  device: {
    serialPort: '',
    baudRate: 115200,
    name: 'PATCOM',
    brightness: 255,
    deviceId: '',
    deviceType: 0,
    discoverable: true,
    autoSync: false,
    configServerUrl: ''
  },
  apiKeys: {},
  customConfig: '{}'
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../assets/patcom.png')
  });

  mainWindow.loadFile('src/index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  createMenu();
  setupDiscoveryService();
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Configuration',
          accelerator: 'CmdOrCtrl+N',
          click: () => resetConfig()
        },
        {
          label: 'Open Configuration',
          accelerator: 'CmdOrCtrl+O',
          click: () => loadConfig()
        },
        {
          label: 'Save Configuration',
          accelerator: 'CmdOrCtrl+S',
          click: () => saveConfig()
        },
        { type: 'separator' },
        {
          label: 'Upload to Device',
          accelerator: 'CmdOrCtrl+U',
          click: () => uploadToDevice()
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'Device',
      submenu: [
        {
          label: 'Discover Devices',
          click: () => discoverDevices()
        },
        {
          label: 'Connect',
          click: () => connectToDevice()
        },
        {
          label: 'Disconnect',
          click: () => disconnectFromDevice()
        },
        { type: 'separator' },
        {
          label: 'Test Button',
          click: () => testButton()
        },
        {
          label: 'Sync All Devices',
          click: () => syncAllDevices()
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About PATCOM Config',
          click: () => showAbout()
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('get-config', () => configData);

ipcMain.handle('update-config', (event, newConfig) => {
  configData = { ...configData, ...newConfig };
  return configData;
});

ipcMain.handle('get-serial-ports', async () => {
  try {
    const ports = await SerialPort.list();
    return ports.map(port => ({
      path: port.path,
      manufacturer: port.manufacturer || 'Unknown',
      vendorId: port.vendorId,
      productId: port.productId
    }));
  } catch (error) {
    console.error('Error listing serial ports:', error);
    return [];
  }
});

ipcMain.handle('connect-device', async (event, portPath, baudRate) => {
  try {
    if (serialPort && serialPort.isOpen) {
      await serialPort.close();
    }

    serialPort = new SerialPort({
      path: portPath,
      baudRate: baudRate || 115200
    });

    parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);

      serialPort.on('open', () => {
        clearTimeout(timeout);
        deviceConnected = true;
        configData.device.serialPort = portPath;
        configData.device.baudRate = baudRate;
        
        // Request device info
        serialPort.write('STATUS\n');
        
        resolve({ success: true, message: 'Connected successfully' });
      });

      serialPort.on('error', (err) => {
        clearTimeout(timeout);
        deviceConnected = false;
        reject(err);
      });

      // Handle incoming data
      parser.on('data', (data) => {
        handleDeviceMessage(data.trim());
      });
    });
  } catch (error) {
    deviceConnected = false;
    throw error;
  }
});

ipcMain.handle('disconnect-device', async () => {
  try {
    if (serialPort && serialPort.isOpen) {
      await serialPort.close();
    }
    deviceConnected = false;
    serialPort = null;
    parser = null;
    return { success: true, message: 'Disconnected successfully' };
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('upload-config', async () => {
  if (!serialPort || !serialPort.isOpen) {
    throw new Error('Device not connected');
  }

  try {
    const configJson = JSON.stringify(configData);
    const command = `SET_CONFIG:${configJson}\n`;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Upload timeout'));
      }, 10000);

      const responseHandler = (data) => {
        if (data.startsWith('RESPONSE:')) {
          const response = JSON.parse(data.substring(9));
          if (response.type === 'config_upload') {
            clearTimeout(timeout);
            parser.off('data', responseHandler);
            resolve(response);
          }
        }
      };

      parser.on('data', responseHandler);
      serialPort.write(command);
    });
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('test-button', async (event, buttonIndex) => {
  if (!serialPort || !serialPort.isOpen) {
    throw new Error('Device not connected');
  }

  try {
    const command = `TEST:${buttonIndex}\n`;
    serialPort.write(command);
    return { success: true, message: `Button ${buttonIndex} test sent` };
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('get-device-status', () => {
  return {
    connected: deviceConnected,
    port: configData.device.serialPort,
    baudRate: configData.device.baudRate
  };
});

ipcMain.handle('discover-devices', () => {
  discoverDevices();
  return { success: true, message: 'Discovery initiated' };
});

ipcMain.handle('get-discovered-devices', () => {
  return Array.from(discoveredDevices.values());
});

ipcMain.handle('sync-to-device', (event, deviceId) => {
  const device = discoveredDevices.get(deviceId);
  if (device) {
    syncConfigToDevice(device);
    return { success: true, message: 'Configuration sync initiated' };
  } else {
    throw new Error('Device not found');
  }
});

ipcMain.handle('sync-all-devices', () => {
  syncAllDevices();
  return { success: true, message: 'Syncing to all devices' };
});

ipcMain.handle('get-device-config', async (event, deviceId) => {
  const device = discoveredDevices.get(deviceId);
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
    
    const handler = (event, data) => {
      if (data.deviceId === deviceId) {
        clearTimeout(timeout);
        mainWindow.webContents.off('device-config-received', handler);
        resolve(data.config);
      }
    };
    
    mainWindow.webContents.on('device-config-received', handler);
    
    configSocket.send(request, CONFIG_PORT, device.ip, (err) => {
      if (err) {
        clearTimeout(timeout);
        mainWindow.webContents.off('device-config-received', handler);
        reject(err);
      }
    });
  });
});

// File operations
ipcMain.handle('save-config-file', async () => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save PATCOM Configuration',
      defaultPath: 'patcom-config.json',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePath) {
      const configJson = JSON.stringify(configData, null, 2);
      fs.writeFileSync(result.filePath, configJson);
      return { success: true, path: result.filePath };
    }
    
    return { success: false, message: 'Save cancelled' };
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('load-config-file', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Load PATCOM Configuration',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const configJson = fs.readFileSync(result.filePaths[0], 'utf8');
      const loadedConfig = JSON.parse(configJson);
      
      // Merge with current config to preserve any missing fields
      configData = { ...configData, ...loadedConfig };
      
      // Notify renderer of config update
      mainWindow.webContents.send('config-updated', configData);
      
      return { success: true, path: result.filePaths[0] };
    }
    
    return { success: false, message: 'Load cancelled' };
  } catch (error) {
    throw error;
  }
});

function handleDeviceMessage(message) {
  console.log('Device:', message);
  
  try {
    if (message.startsWith('DEVICE_INFO:')) {
      const deviceInfo = JSON.parse(message.substring(12));
      mainWindow.webContents.send('device-info', deviceInfo);
    } else if (message.startsWith('HEARTBEAT:')) {
      const heartbeat = JSON.parse(message.substring(10));
      mainWindow.webContents.send('device-heartbeat', heartbeat);
    } else if (message.startsWith('EVENT:')) {
      const event = JSON.parse(message.substring(6));
      mainWindow.webContents.send('device-event', event);
    } else if (message.startsWith('BATTERY:')) {
      const batteryInfo = message.substring(8);
      mainWindow.webContents.send('battery-status', batteryInfo);
    } else if (message.startsWith('RESPONSE:')) {
      const response = JSON.parse(message.substring(9));
      mainWindow.webContents.send('device-response', response);
    }
  } catch (error) {
    console.error('Error parsing device message:', error);
  }
}

function resetConfig() {
  configData = {
    buttons: Array(8).fill(null).map((_, i) => ({
      id: i,
      name: `Button ${i}`,
      action: 'none',
      config: {}
    })),
    network: {
      ssid: '',
      password: '',
      staticIP: false,
      ip: '',
      subnet: '',
      gateway: ''
    },
    device: {
      serialPort: '',
      baudRate: 115200
    }
  };
  mainWindow.webContents.send('config-updated', configData);
}

async function loadConfig() {
  try {
    const result = await ipcMain.emit('load-config-file');
    console.log('Configuration loaded');
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

async function saveConfig() {
  try {
    const result = await ipcMain.emit('save-config-file');
    console.log('Configuration saved');
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}

async function uploadToDevice() {
  try {
    if (!deviceConnected) {
      console.log('Device not connected');
      return;
    }
    const result = await ipcMain.emit('upload-config');
    console.log('Configuration uploaded to device');
  } catch (error) {
    console.error('Failed to upload config:', error);
  }
}

function connectToDevice() {
  // This will be handled by the renderer process UI
  console.log('Connect device - handled by UI');
}

function disconnectFromDevice() {
  // This will be handled by the renderer process UI
  console.log('Disconnect device - handled by UI');
}

function testButton() {
  // This will be handled by the renderer process UI
  console.log('Test button - handled by UI');
}

function showAbout() {
  // TODO: Show about dialog
  console.log('Show about - TODO');
}

function setupDiscoveryService() {
  // Setup UDP discovery service
  discoverySocket = dgram.createSocket('udp4');
  configSocket = dgram.createSocket('udp4');
  
  discoverySocket.on('message', (msg, rinfo) => {
    try {
      const message = JSON.parse(msg.toString());
      handleDiscoveryMessage(message, rinfo);
    } catch (error) {
      console.error('Error parsing discovery message:', error);
    }
  });
  
  configSocket.on('message', (msg, rinfo) => {
    try {
      const message = JSON.parse(msg.toString());
      handleConfigMessage(message, rinfo);
    } catch (error) {
      console.error('Error parsing config message:', error);
    }
  });
  
  discoverySocket.bind(DISCOVERY_PORT, () => {
    console.log('Discovery service listening on port', DISCOVERY_PORT);
  });
  
  configSocket.bind(CONFIG_PORT, () => {
    console.log('Config service listening on port', CONFIG_PORT);
  });
}

function handleDiscoveryMessage(message, rinfo) {
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
    
    discoveredDevices.set(device.deviceId, device);
    
    // Notify renderer
    if (mainWindow) {
      mainWindow.webContents.send('device-discovered', device);
    }
    
    console.log('Discovered device:', device.deviceName, 'at', device.ip);
  }
}

function handleConfigMessage(message, rinfo) {
  if (message.type === 'config_response') {
    // Handle configuration response from device
    if (mainWindow) {
      mainWindow.webContents.send('device-config-received', {
        deviceId: message.device_id,
        config: message,
        source: rinfo.address
      });
    }
  } else if (message.type === 'config_update_response') {
    // Handle config update acknowledgment
    if (mainWindow) {
      mainWindow.webContents.send('config-update-ack', {
        deviceId: message.device_id || 'unknown',
        success: message.success,
        message: message.message,
        configHash: message.config_hash
      });
    }
  }
}

function discoverDevices() {
  // Broadcast discovery request
  const request = JSON.stringify({
    type: 'discover_devices',
    timestamp: Date.now()
  });
  
  // Get all network interfaces to broadcast on all subnets
  const interfaces = os.networkInterfaces();
  
  Object.keys(interfaces).forEach(ifname => {
    interfaces[ifname].forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.');
        const broadcast = `${parts[0]}.${parts[1]}.${parts[2]}.255`;
        
        discoverySocket.send(request, DISCOVERY_PORT, broadcast, (err) => {
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
  for (const [deviceId, device] of discoveredDevices) {
    if (device.lastSeen < cutoff) {
      discoveredDevices.delete(deviceId);
    }
  }
  
  console.log('Device discovery initiated');
}

function syncAllDevices() {
  console.log('Syncing configuration to all discovered devices...');
  
  for (const [deviceId, device] of discoveredDevices) {
    syncConfigToDevice(device);
  }
}

function syncConfigToDevice(device) {
  const configRequest = JSON.stringify({
    type: 'set_config',
    device_id: device.deviceId,
    ...configData
  });
  
  configSocket.send(configRequest, CONFIG_PORT, device.ip, (err) => {
    if (err) {
      console.error('Config sync error for', device.deviceName, ':', err);
    } else {
      console.log('Config synced to', device.deviceName);
    }
  });
}