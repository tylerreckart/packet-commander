"use strict";
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
exports.ConfigService = void 0;
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
class ConfigService {
    constructor() {
        this.configData = this.createDefaultConfig();
    }
    createDefaultConfig() {
        return {
            buttons: Array(8).fill(null).map((_, i) => ({
                id: i,
                name: `Button ${i}`,
                action: 'none',
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
    getConfig() {
        return { ...this.configData };
    }
    updateConfig(newConfig) {
        this.configData = { ...this.configData, ...newConfig };
        return this.getConfig();
    }
    resetConfig() {
        this.configData = this.createDefaultConfig();
        return this.getConfig();
    }
    async saveConfigFile(mainWindow) {
        try {
            const result = await electron_1.dialog.showSaveDialog(mainWindow, {
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
        }
        catch (error) {
            throw error;
        }
    }
    async loadConfigFile(mainWindow) {
        try {
            const result = await electron_1.dialog.showOpenDialog(mainWindow, {
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
        }
        catch (error) {
            throw error;
        }
    }
    validateConfig() {
        const errors = [];
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
    isValidIP(ip) {
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
    }
    isValidUrl(url) {
        try {
            new URL(url);
            return url.startsWith('http://') || url.startsWith('https://');
        }
        catch {
            return false;
        }
    }
}
exports.ConfigService = ConfigService;
//# sourceMappingURL=ConfigService.js.map