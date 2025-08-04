import { dialog, BrowserWindow } from 'electron';
import * as fs from 'fs';
import { ConfigData, ButtonConfig, ActionType } from '../types';

export class ConfigService {
  private configData: ConfigData;

  constructor() {
    this.configData = this.createDefaultConfig();
  }

  private createDefaultConfig(): ConfigData {
    return {
      buttons: Array(8).fill(null).map((_, i) => ({
        id: i,
        name: `Button ${i}`,
        action: 'none' as ActionType,
        config: {},
        enabled: true
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
  }

  getConfig(): ConfigData {
    return { ...this.configData };
  }

  updateConfig(newConfig: Partial<ConfigData>): ConfigData {
    this.configData = { ...this.configData, ...newConfig };
    return this.getConfig();
  }

  resetConfig(): ConfigData {
    this.configData = this.createDefaultConfig();
    return this.getConfig();
  }

  async saveConfigFile(mainWindow: BrowserWindow): Promise<{ success: boolean; path?: string; message?: string }> {
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
        const configJson = JSON.stringify(this.configData, null, 2);
        fs.writeFileSync(result.filePath, configJson);
        return { success: true, path: result.filePath };
      }
      
      return { success: false, message: 'Save cancelled' };
    } catch (error) {
      throw error;
    }
  }

  async loadConfigFile(mainWindow: BrowserWindow): Promise<{ success: boolean; path?: string; message?: string }> {
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
        this.configData = { ...this.configData, ...loadedConfig };
        
        return { success: true, path: result.filePaths[0] };
      }
      
      return { success: false, message: 'Load cancelled' };
    } catch (error) {
      throw error;
    }
  }

  validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Validate network settings
    if (this.configData.network.staticIP) {
      if (!this.isValidIP(this.configData.network.ip)) {
        errors.push('Invalid static IP address');
      }
      if (!this.isValidIP(this.configData.network.gateway)) {
        errors.push('Invalid gateway address');
      }
    }
    
    // Validate button configurations
    this.configData.buttons.forEach((button, index) => {
      if (button.action === 'http' || button.action === 'webhook') {
        if (button.config.url && !this.isValidUrl(button.config.url)) {
          errors.push(`Invalid URL for button ${index}`);
        }
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private isValidIP(ip: string): boolean {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return url.startsWith('http://') || url.startsWith('https://');
    } catch {
      return false;
    }
  }
}