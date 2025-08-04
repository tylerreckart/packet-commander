import { EventEmitter } from 'events';
import { SerialPortInfo, DeviceInfo, ConnectionResult, DeviceMessage, ConfigData } from '../types';
export declare class SerialService extends EventEmitter {
    private serialPort;
    private parser;
    private deviceConnected;
    getSerialPorts(): Promise<SerialPortInfo[]>;
    private isPotentialPATCOM;
    autoDetectPATCOM(): Promise<SerialPortInfo & {
        deviceInfo: DeviceInfo;
    } | null>;
    private testPortForPATCOM;
    connectDevice(portPath: string, baudRate?: number): Promise<ConnectionResult>;
    disconnectDevice(): Promise<ConnectionResult>;
    uploadConfig(configData: ConfigData): Promise<DeviceMessage>;
    testButton(buttonIndex: number): Promise<ConnectionResult>;
    isConnected(): boolean;
    private handleDeviceMessage;
    private transformConfigForArduino;
    private getArduinoActionType;
    private transformActionConfig;
}
//# sourceMappingURL=SerialService.d.ts.map