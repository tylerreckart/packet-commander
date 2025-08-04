interface AppConfig {
    buttons?: Array<{
        name: string;
        action: string;
        config: any;
    }>;
    network?: {
        ssid: string;
        password: string;
        staticIP: boolean;
        ip: string;
        subnet: string;
        gateway: string;
        lastUpdated?: string;
    };
    device?: {
        name?: string;
        deviceId?: string;
        serialPort?: string;
        baudRate?: number;
    };
}
declare class PatcomApp {
    private config;
    private currentTab;
    constructor();
    private init;
    private loadConfiguration;
    private saveConfiguration;
    private setupEventListeners;
    private setupTabSwitching;
    private switchTab;
    private setupNetworkHandling;
    private toggleStaticIPConfig;
    private markNetworkConfigChanged;
    private saveNetworkConfiguration;
    private testNetworkConfiguration;
    private simulateNetworkTest;
    private uploadNetworkConfiguration;
    private setupButtonHandling;
    private setupDeviceHandling;
    private updateUI;
    private updateNetworkUI;
}
//# sourceMappingURL=app.d.ts.map