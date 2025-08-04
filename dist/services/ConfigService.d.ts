import { BrowserWindow } from 'electron';
import { ConfigData } from '../types';
export declare class ConfigService {
    private configData;
    constructor();
    private createDefaultConfig;
    getConfig(): ConfigData;
    updateConfig(newConfig: Partial<ConfigData>): ConfigData;
    resetConfig(): ConfigData;
    saveConfigFile(mainWindow: BrowserWindow): Promise<{
        success: boolean;
        path?: string;
        message?: string;
    }>;
    loadConfigFile(mainWindow: BrowserWindow): Promise<{
        success: boolean;
        path?: string;
        message?: string;
    }>;
    validateConfig(): {
        isValid: boolean;
        errors: string[];
    };
    private isValidIP;
    private isValidUrl;
}
//# sourceMappingURL=ConfigService.d.ts.map