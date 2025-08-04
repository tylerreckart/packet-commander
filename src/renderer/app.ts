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

class PatcomApp {
  private config: AppConfig = {};
  private currentTab = 'buttons';

  constructor() {
    this.init();
    this.setupTitleBar();
  }

  private async init(): Promise<void> {
    console.log('[APP] Initializing PatcomApp...');
    await this.loadConfiguration();
    console.log('[APP] Configuration loaded, setting up event listeners...');
    this.setupEventListeners();
    console.log('[APP] Event listeners set up, updating UI...');
    this.updateUI();
    console.log('[APP] PatcomApp initialization complete');
  }

  // Configuration Management
  private async loadConfiguration(): Promise<void> {
    try {
      if (window.electronAPI) {
        this.config = await window.electronAPI.getConfig() || {};
        console.log('Configuration loaded:', this.config);
      }
    } catch (error) {
      console.error('Failed to load configuration:', error);
      this.config = {};
    }
  }

  private async saveConfiguration(): Promise<void> {
    try {
      if (window.electronAPI) {
        await window.electronAPI.updateConfig(this.config);
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      throw error;
    }
  }

  // Event Listeners Setup
  private setupEventListeners(): void {
    this.setupTabSwitching();
    this.setupNetworkHandling();
    this.setupButtonHandling();
    this.setupDeviceHandling();
  }

  // Tab Management
  private setupTabSwitching(): void {
    const tabButtons = document.querySelectorAll('.tab-button');
    
    tabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement).closest('.tab-button') as HTMLElement;
        const tab = target?.dataset.tab;
        if (tab) {
          this.switchTab(tab);
        }
      });
    });
  }

  private switchTab(tabName: string): void {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
      button.classList.remove('active');
    });
    const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeButton) {
      activeButton.classList.add('active');
    }

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    const activeContent = document.getElementById(`${tabName}-tab`);
    if (activeContent) {
      activeContent.classList.add('active');
    }

    this.currentTab = tabName;
  }

  // Network Configuration
  private setupNetworkHandling(): void {
    console.log('[NETWORK] Setting up network handling...');
    
    const saveBtn = document.getElementById('save-network-config');
    const testBtn = document.getElementById('test-network-config');
    const uploadBtn = document.getElementById('upload-network-config');
    const staticIPCheckbox = document.getElementById('static-ip') as HTMLInputElement;

    console.log('[NETWORK] Button elements found:', {
      saveBtn: !!saveBtn,
      testBtn: !!testBtn,
      uploadBtn: !!uploadBtn,
      staticIPCheckbox: !!staticIPCheckbox
    });

    if (saveBtn) {
      console.log('[NETWORK] Adding save network config event listener');
      saveBtn.addEventListener('click', () => {
        console.log('[NETWORK] Save network config button clicked');
        this.saveNetworkConfiguration();
      });
    } else {
      console.error('[NETWORK] Save network config button not found!');
    }

    if (testBtn) {
      console.log('[NETWORK] Adding test network config event listener');
      testBtn.addEventListener('click', () => {
        console.log('[NETWORK] Test network config button clicked');
        this.testNetworkConfiguration();
      });
    } else {
      console.error('[NETWORK] Test network config button not found!');
    }

    if (uploadBtn) {
      console.log('[NETWORK] Adding upload network config event listener');
      uploadBtn.addEventListener('click', () => {
        console.log('[NETWORK] Upload network config button clicked');
        this.uploadNetworkConfiguration();
      });
    } else {
      console.error('[NETWORK] Upload network config button not found!');
    }

    if (staticIPCheckbox) {
      console.log('[NETWORK] Adding static IP checkbox event listener');
      staticIPCheckbox.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        console.log('[NETWORK] Static IP checkbox changed:', checked);
        this.toggleStaticIPConfig(checked);
      });
    } else {
      console.error('[NETWORK] Static IP checkbox not found!');
    }

    // Add change listeners to form fields
    const formFields = ['wifi-ssid', 'wifi-password', 'ip-address', 'subnet-mask', 'gateway'];
    console.log('[NETWORK] Adding change listeners to form fields:', formFields);
    formFields.forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (field) {
        console.log(`[NETWORK] Adding change listener to ${fieldId}`);
        field.addEventListener('change', () => {
          console.log(`[NETWORK] Form field ${fieldId} changed`);
          this.markNetworkConfigChanged();
        });
      } else {
        console.warn(`[NETWORK] Form field ${fieldId} not found`);
      }
    });
    
    console.log('[NETWORK] Network handling setup complete');
  }

  private toggleStaticIPConfig(show: boolean): void {
    const staticIPConfig = document.getElementById('static-ip-config');
    if (staticIPConfig) {
      staticIPConfig.style.display = show ? 'block' : 'none';
    }
  }

  private markNetworkConfigChanged(): void {
    const statusElement = document.getElementById('network-config-status');
    if (statusElement) {
      statusElement.textContent = 'Modified (Not Saved)';
      statusElement.className = 'value status-warning';
    }
  }

  private async saveNetworkConfiguration(): Promise<void> {
    console.log('[NETWORK-SAVE] Starting saveNetworkConfiguration()');
    
    const saveBtn = document.getElementById('save-network-config') as HTMLButtonElement;
    const statusElement = document.getElementById('network-config-status');
    const lastUpdatedElement = document.getElementById('network-last-updated');

    console.log('[NETWORK-SAVE] DOM elements found:', {
      saveBtn: !!saveBtn,
      statusElement: !!statusElement,
      lastUpdatedElement: !!lastUpdatedElement
    });

    try {
      if (saveBtn) {
        console.log('[NETWORK-SAVE] Disabling save button');
        saveBtn.disabled = true;
        saveBtn.textContent = 'SAVING...';
      }

      // Get form values
      const ssidInput = document.getElementById('wifi-ssid') as HTMLInputElement;
      const passwordInput = document.getElementById('wifi-password') as HTMLInputElement;
      const staticIPCheckbox = document.getElementById('static-ip') as HTMLInputElement;
      const ipInput = document.getElementById('ip-address') as HTMLInputElement;
      const subnetInput = document.getElementById('subnet-mask') as HTMLInputElement;
      const gatewayInput = document.getElementById('gateway') as HTMLInputElement;

      console.log('[NETWORK-SAVE] Form elements found:', {
        ssidInput: !!ssidInput,
        passwordInput: !!passwordInput,
        staticIPCheckbox: !!staticIPCheckbox,
        ipInput: !!ipInput,
        subnetInput: !!subnetInput,
        gatewayInput: !!gatewayInput
      });

      // Get form values
      const formValues = {
        ssid: ssidInput?.value || '',
        password: passwordInput?.value || '',
        staticIP: staticIPCheckbox?.checked || false,
        ip: ipInput?.value || '',
        subnet: subnetInput?.value || '',
        gateway: gatewayInput?.value || ''
      };

      console.log('[NETWORK-SAVE] Current form values:', formValues);

      // Update config object
      if (!this.config.network) {
        console.log('[NETWORK-SAVE] Creating new network config object');
        this.config.network = {
          ssid: '',
          password: '',
          staticIP: false,
          ip: '',
          subnet: '',
          gateway: ''
        };
      }

      console.log('[NETWORK-SAVE] Previous network config:', this.config.network);

      this.config.network.ssid = formValues.ssid;
      this.config.network.password = formValues.password;
      this.config.network.staticIP = formValues.staticIP;
      this.config.network.ip = formValues.ip;
      this.config.network.subnet = formValues.subnet;
      this.config.network.gateway = formValues.gateway;
      this.config.network.lastUpdated = new Date().toISOString();

      console.log('[NETWORK-SAVE] Updated network config:', this.config.network);
      console.log('[NETWORK-SAVE] Complete config object:', this.config);

      // Save to main process
      console.log('[NETWORK-SAVE] Saving configuration to main process...');
      await this.saveConfiguration();
      console.log('[NETWORK-SAVE] Configuration saved successfully');

      // Update UI
      if (statusElement) {
        console.log('[NETWORK-SAVE] Updating status element to success');
        statusElement.textContent = 'SAVED';
        statusElement.className = 'value text-terminal-green font-mono text-sm font-bold';
      }
      if (lastUpdatedElement) {
        console.log('[NETWORK-SAVE] Updating last updated timestamp');
        lastUpdatedElement.textContent = new Date().toLocaleString();
      }

      // Enable upload button
      const uploadBtn = document.getElementById('upload-network-config') as HTMLButtonElement;
      if (uploadBtn) {
        console.log('[NETWORK-SAVE] Enabling upload button');
        uploadBtn.disabled = false;
      }

      console.log('[NETWORK-SAVE] Network configuration saved successfully');

    } catch (error) {
      console.error('[NETWORK-SAVE] Failed to save network configuration:', error);
      console.error('[NETWORK-SAVE] Error details:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack
      });
      
      if (statusElement) {
        statusElement.textContent = 'SAVE_FAILED';
        statusElement.className = 'value status-error';
      }
    } finally {
      if (saveBtn) {
        console.log('[NETWORK-SAVE] Re-enabling save button');
        saveBtn.disabled = false;
        saveBtn.textContent = 'SAVE_CONFIG';
      }
      console.log('[NETWORK-SAVE] saveNetworkConfiguration() completed');
    }
  }

  private async testNetworkConfiguration(): Promise<void> {
    const testBtn = document.getElementById('test-network-config') as HTMLButtonElement;
    const testStatusElement = document.getElementById('network-test-status');

    try {
      if (testBtn) {
        testBtn.disabled = true;
        testBtn.textContent = 'Testing...';
      }
      if (testStatusElement) {
        testStatusElement.textContent = 'Testing...';
        testStatusElement.className = 'value status-pending';
      }

      const ssidInput = document.getElementById('wifi-ssid') as HTMLInputElement;
      const passwordInput = document.getElementById('wifi-password') as HTMLInputElement;

      if (!ssidInput?.value) {
        throw new Error('SSID is required for testing');
      }

      // Simulate network test
      const testResult = await this.simulateNetworkTest(ssidInput.value, passwordInput?.value || '');

      if (testStatusElement) {
        if (testResult.success) {
          testStatusElement.textContent = 'Test Passed';
          testStatusElement.className = 'value status-success';
        } else {
          testStatusElement.textContent = `Test Failed: ${testResult.error}`;
          testStatusElement.className = 'value status-error';
        }
      }

    } catch (error) {
      console.error('Network test failed:', error);
      if (testStatusElement) {
        testStatusElement.textContent = `Test Error: ${(error as Error).message}`;
        testStatusElement.className = 'value status-error';
      }
    } finally {
      if (testBtn) {
        testBtn.disabled = false;
        testBtn.textContent = 'Test Connection';
      }
    }
  }

  private async simulateNetworkTest(ssid: string, password: string): Promise<{success: boolean, error?: string}> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (ssid.length < 1) {
          resolve({ success: false, error: 'SSID cannot be empty' });
        } else if (password.length > 0 && password.length < 8) {
          resolve({ success: false, error: 'Password must be at least 8 characters' });
        } else {
          const success = Math.random() > 0.3; // 70% success rate for demo
          if (success) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: 'Network unreachable or invalid credentials' });
          }
        }
      }, 2000);
    });
  }

  private async uploadNetworkConfiguration(): Promise<void> {
    console.log('[NETWORK-UPLOAD] Starting uploadNetworkConfiguration()');
    
    const uploadBtn = document.getElementById('upload-network-config') as HTMLButtonElement;

    console.log('[NETWORK-UPLOAD] DOM elements found:', {
      uploadBtn: !!uploadBtn
    });

    try {
      if (uploadBtn) {
        console.log('[NETWORK-UPLOAD] Disabling upload button');
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'UPLOADING...';
      }

      console.log('[NETWORK-UPLOAD] Current complete config:', this.config);
      console.log('[NETWORK-UPLOAD] Network config to upload:', this.config.network);

      // Check if we have a network configuration to upload
      if (!this.config.network) {
        console.error('[NETWORK-UPLOAD] No network configuration found!');
        throw new Error('No network configuration found. Please save the configuration first.');
      }

      // Create the configuration object that will be sent to device
      const configToUpload = {
        type: 'network_config',
        wifi: {
          ssid: this.config.network.ssid,
          password: this.config.network.password
        },
        ip_config: {
          static: this.config.network.staticIP,
          ip: this.config.network.ip,
          subnet: this.config.network.subnet,
          gateway: this.config.network.gateway
        },
        timestamp: Date.now()
      };

      console.log('[NETWORK-UPLOAD] Config object to send to device:', configToUpload);
      console.log('[NETWORK-UPLOAD] Config JSON string:', JSON.stringify(configToUpload, null, 2));

      // Check if electronAPI is available
      console.log('[NETWORK-UPLOAD] ElectronAPI available:', !!window.electronAPI);
      console.log('[NETWORK-UPLOAD] uploadConfig method available:', !!window.electronAPI?.uploadConfig);

      if (window.electronAPI?.uploadConfig) {
        console.log('[NETWORK-UPLOAD] Calling electronAPI.uploadConfig()');
        const result = await window.electronAPI.uploadConfig();
        console.log('[NETWORK-UPLOAD] Upload result:', result);
        
        if (result.success) {
          console.log('[NETWORK-UPLOAD] Upload successful');
          alert('Network configuration uploaded to device successfully!');
        } else {
          console.error('[NETWORK-UPLOAD] Upload failed:', result.message);
          throw new Error(result.message || 'Upload failed');
        }
      } else {
        console.error('[NETWORK-UPLOAD] electronAPI.uploadConfig not available!');
        // For now, simulate upload for testing
        console.log('[NETWORK-UPLOAD] Simulating upload...');
        await new Promise(resolve => setTimeout(resolve, 1500));
        console.log('[NETWORK-UPLOAD] Simulated upload complete');
        alert('Network configuration uploaded to device successfully! (Simulated)');
      }

    } catch (error) {
      console.error('[NETWORK-UPLOAD] Upload failed:', error);
      console.error('[NETWORK-UPLOAD] Error details:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack
      });
      alert('Failed to upload network configuration: ' + (error as Error).message);
    } finally {
      if (uploadBtn) {
        console.log('[NETWORK-UPLOAD] Re-enabling upload button');
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'UPLOAD_TO_DEVICE';
      }
      console.log('[NETWORK-UPLOAD] uploadNetworkConfiguration() completed');
    }
  }

  // Button Configuration (placeholder for future implementation)
  private setupButtonHandling(): void {
    // Button configuration functionality would go here
    console.log('Button handling setup - placeholder');
  }

  // Device Connection
  private setupDeviceHandling(): void {
    console.log('[DEVICE] Setting up device handling...');
    
    const refreshPortsBtn = document.getElementById('refresh-ports');
    const autoDetectBtn = document.getElementById('auto-detect');
    const connectBtn = document.getElementById('connect-device');
    const disconnectBtn = document.getElementById('disconnect-device');
    const uploadConfigBtn = document.getElementById('upload-config');

    console.log('[DEVICE] Button elements found:', {
      refreshPortsBtn: !!refreshPortsBtn,
      autoDetectBtn: !!autoDetectBtn,
      connectBtn: !!connectBtn,
      disconnectBtn: !!disconnectBtn,
      uploadConfigBtn: !!uploadConfigBtn
    });

    // Refresh serial ports
    if (refreshPortsBtn) {
      console.log('[DEVICE] Adding refresh ports event listener');
      refreshPortsBtn.addEventListener('click', async () => {
        console.log('[DEVICE] Refresh ports button clicked');
        await this.refreshSerialPorts();
      });
    } else {
      console.error('[DEVICE] Refresh ports button not found!');
    }

    // Auto-detect PATCOM device
    if (autoDetectBtn) {
      console.log('[DEVICE] Adding auto-detect event listener');
      autoDetectBtn.addEventListener('click', async () => {
        console.log('[DEVICE] Auto-detect button clicked');
        await this.autoDetectDevice();
      });
    } else {
      console.error('[DEVICE] Auto-detect button not found!');
    }

    // Connect to device
    if (connectBtn) {
      console.log('[DEVICE] Adding connect device event listener');
      connectBtn.addEventListener('click', async () => {
        console.log('[DEVICE] Connect button clicked');
        const serialPortSelect = document.getElementById('serial-port') as HTMLSelectElement;
        const baudRateSelect = document.getElementById('baud-rate') as HTMLSelectElement;
        const port = serialPortSelect?.value;
        const baudRate = parseInt(baudRateSelect?.value || '115200');
        
        console.log('[DEVICE] Connection parameters:', { port, baudRate });
        
        if (!port) {
          console.warn('[DEVICE] No port selected');
          alert('Please select a serial port first');
          return;
        }
        
        await this.connectToDevice(port, baudRate);
      });
    } else {
      console.error('[DEVICE] Connect button not found!');
    }

    // Disconnect from device
    if (disconnectBtn) {
      console.log('[DEVICE] Adding disconnect event listener');
      disconnectBtn.addEventListener('click', async () => {
        console.log('[DEVICE] Disconnect button clicked');
        await this.disconnectFromDevice();
      });
    } else {
      console.error('[DEVICE] Disconnect button not found!');
    }

    // Upload configuration
    if (uploadConfigBtn) {
      console.log('[DEVICE] Adding upload config event listener');
      uploadConfigBtn.addEventListener('click', async () => {
        console.log('[DEVICE] Upload config button clicked');
        await this.uploadConfiguration();
      });
    } else {
      console.error('[DEVICE] Upload config button not found!');
    }

    // Check if electronAPI is available
    console.log('[DEVICE] ElectronAPI available:', !!window.electronAPI);
    console.log('[DEVICE] ElectronAPI methods:', window.electronAPI ? Object.keys(window.electronAPI) : 'None');

    // Load initial serial ports
    console.log('[DEVICE] Loading initial serial ports...');
    this.refreshSerialPorts();
  }

  private async refreshSerialPorts(): Promise<void> {
    console.log('[SERIAL] Starting refreshSerialPorts()');
    
    const refreshBtn = document.getElementById('refresh-ports') as HTMLButtonElement;
    const serialPortSelect = document.getElementById('serial-port') as HTMLSelectElement;

    console.log('[SERIAL] DOM elements found:', {
      refreshBtn: !!refreshBtn,
      serialPortSelect: !!serialPortSelect
    });

    try {
      if (refreshBtn) {
        console.log('[SERIAL] Disabling refresh button');
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'REFRESHING...';
      }

      console.log('[SERIAL] Checking electronAPI availability');
      console.log('[SERIAL] window.electronAPI exists:', !!window.electronAPI);
      console.log('[SERIAL] getSerialPorts method exists:', !!window.electronAPI?.getSerialPorts);

      if (window.electronAPI?.getSerialPorts) {
        console.log('[SERIAL] Calling electronAPI.getSerialPorts()');
        const ports = await window.electronAPI.getSerialPorts();
        console.log('[SERIAL] Received ports:', ports);
        console.log('[SERIAL] Number of ports found:', ports?.length || 0);
        
        if (serialPortSelect) {
          console.log('[SERIAL] Clearing existing options');
          // Clear existing options
          serialPortSelect.innerHTML = '<option value="">Select a port...</option>';
          
          // Add available ports
          console.log('[SERIAL] Adding port options to select');
          ports.forEach((port: any, index: number) => {
            console.log(`[SERIAL] Adding port ${index}:`, port);
            const option = document.createElement('option');
            option.value = port.path;
            option.textContent = `${port.path} ${port.manufacturer ? `(${port.manufacturer})` : ''}`;
            serialPortSelect.appendChild(option);
          });
          
          console.log('[SERIAL] Final select options count:', serialPortSelect.options.length);
        } else {
          console.error('[SERIAL] Serial port select element not found!');
        }
      } else {
        console.error('[SERIAL] electronAPI.getSerialPorts not available!');
        alert('Serial port functionality not available. Please check the application setup.');
      }
    } catch (error) {
      console.error('[SERIAL] Error in refreshSerialPorts:', error);
      console.error('[SERIAL] Error details:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack
      });
      alert('Failed to refresh serial ports: ' + (error as Error).message);
    } finally {
      if (refreshBtn) {
        console.log('[SERIAL] Re-enabling refresh button');
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'REFRESH';
      }
      console.log('[SERIAL] refreshSerialPorts() completed');
    }
  }

  private async autoDetectDevice(): Promise<void> {
    console.log('[AUTODETECT] Starting autoDetectDevice()');
    
    const autoDetectBtn = document.getElementById('auto-detect') as HTMLButtonElement;
    const serialPortSelect = document.getElementById('serial-port') as HTMLSelectElement;

    console.log('[AUTODETECT] DOM elements found:', {
      autoDetectBtn: !!autoDetectBtn,
      serialPortSelect: !!serialPortSelect
    });

    try {
      if (autoDetectBtn) {
        console.log('[AUTODETECT] Disabling auto-detect button');
        autoDetectBtn.disabled = true;
        autoDetectBtn.textContent = 'DETECTING...';
      }

      console.log('[AUTODETECT] Checking electronAPI.autoDetectPATCOM availability');
      if (window.electronAPI?.autoDetectPATCOM) {
        console.log('[AUTODETECT] Calling electronAPI.autoDetectPATCOM()');
        const result = await window.electronAPI.autoDetectPATCOM();
        console.log('[AUTODETECT] Auto-detect result:', result);
        
        if (result?.port) {
          console.log('[AUTODETECT] Device found on port:', result.port);
          if (serialPortSelect) {
            console.log('[AUTODETECT] Setting port select value to:', result.port);
            serialPortSelect.value = result.port;
          }
          alert(`PATCOM device detected on port: ${result.port}`);
        } else {
          console.log('[AUTODETECT] No device found');
          alert('No PATCOM device detected. Please select a port manually.');
        }
      } else {
        console.error('[AUTODETECT] electronAPI.autoDetectPATCOM not available!');
        alert('Auto-detect functionality not available. Please check the application setup.');
      }
    } catch (error) {
      console.error('[AUTODETECT] Error in autoDetectDevice:', error);
      console.error('[AUTODETECT] Error details:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack
      });
      alert('Failed to auto-detect device: ' + (error as Error).message);
    } finally {
      if (autoDetectBtn) {
        console.log('[AUTODETECT] Re-enabling auto-detect button');
        autoDetectBtn.disabled = false;
        autoDetectBtn.textContent = 'AUTO_DETECT';
      }
      console.log('[AUTODETECT] autoDetectDevice() completed');
    }
  }

  private async connectToDevice(port: string, baudRate: number): Promise<void> {
    console.log('[CONNECT] Starting connectToDevice()');
    console.log('[CONNECT] Connection parameters:', { port, baudRate });
    
    const connectBtn = document.getElementById('connect-device') as HTMLButtonElement;
    const disconnectBtn = document.getElementById('disconnect-device') as HTMLButtonElement;
    const deviceStatus = document.getElementById('device-status');
    const connectionStatus = document.getElementById('connection-status');

    console.log('[CONNECT] DOM elements found:', {
      connectBtn: !!connectBtn,
      disconnectBtn: !!disconnectBtn,
      deviceStatus: !!deviceStatus,
      connectionStatus: !!connectionStatus
    });

    try {
      if (connectBtn) {
        console.log('[CONNECT] Disabling connect button');
        connectBtn.disabled = true;
        connectBtn.textContent = 'CONNECTING...';
      }

      console.log('[CONNECT] Checking electronAPI.connectDevice availability');
      if (window.electronAPI?.connectDevice) {
        console.log('[CONNECT] Calling electronAPI.connectDevice()', { port, baudRate });
        const result = await window.electronAPI.connectDevice(port, baudRate);
        console.log('[CONNECT] Connection result:', result);
        
        if (result.success) {
          console.log('[CONNECT] Connection successful, updating UI');
          
          // Update UI for connected state
          if (connectBtn) {
            console.log('[CONNECT] Disabling connect button (connected state)');
            connectBtn.disabled = true;
          }
          if (disconnectBtn) {
            console.log('[CONNECT] Enabling disconnect button');
            disconnectBtn.disabled = false;
          }
          if (deviceStatus) {
            console.log('[CONNECT] Updating device status to CONNECTED');
            deviceStatus.textContent = 'CONNECTED';
          }
          if (connectionStatus) {
            console.log('[CONNECT] Updating connection status to CONNECTED');
            connectionStatus.textContent = 'CONNECTED';
            connectionStatus.className = 'status-connected font-mono text-sm text-terminal-green';
          }
          
          // Enable upload button
          const uploadBtn = document.getElementById('upload-config') as HTMLButtonElement;
          if (uploadBtn) {
            console.log('[CONNECT] Enabling upload config button');
            uploadBtn.disabled = false;
          }
          
          console.log('[CONNECT] All UI updates completed successfully');
          alert('Successfully connected to device!');
        } else {
          console.error('[CONNECT] Connection failed:', result.message);
          throw new Error(result.message || 'Connection failed');
        }
      } else {
        console.error('[CONNECT] electronAPI.connectDevice not available!');
        alert('Connection functionality not available. Please check the application setup.');
      }
    } catch (error) {
      console.error('[CONNECT] Error in connectToDevice:', error);
      console.error('[CONNECT] Error details:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack
      });
      alert('Failed to connect to device: ' + (error as Error).message);
    } finally {
      if (connectBtn) {
        console.log('[CONNECT] Re-enabling connect button');
        connectBtn.disabled = false;
        connectBtn.textContent = 'CONNECT';
      }
      console.log('[CONNECT] connectToDevice() completed');
    }
  }

  private async disconnectFromDevice(): Promise<void> {
    const connectBtn = document.getElementById('connect-device') as HTMLButtonElement;
    const disconnectBtn = document.getElementById('disconnect-device') as HTMLButtonElement;
    const deviceStatus = document.getElementById('device-status');
    const connectionStatus = document.getElementById('connection-status');

    try {
      if (disconnectBtn) {
        disconnectBtn.disabled = true;
        disconnectBtn.textContent = 'DISCONNECTING...';
      }

      if (window.electronAPI?.disconnectDevice) {
        await window.electronAPI.disconnectDevice();
        
        // Update UI for disconnected state
        if (connectBtn) {
          connectBtn.disabled = false;
        }
        if (disconnectBtn) {
          disconnectBtn.disabled = true;
        }
        if (deviceStatus) {
          deviceStatus.textContent = 'DISCONNECTED';
        }
        if (connectionStatus) {
          connectionStatus.textContent = 'DISCONNECTED';
          connectionStatus.className = 'status-disconnected font-mono text-sm text-terminal-green';
        }
        
        // Disable upload button
        const uploadBtn = document.getElementById('upload-config') as HTMLButtonElement;
        if (uploadBtn) {
          uploadBtn.disabled = true;
        }
        
        alert('Disconnected from device');
      }
    } catch (error) {
      console.error('Failed to disconnect from device:', error);
      alert('Failed to disconnect from device: ' + (error as Error).message);
    } finally {
      if (disconnectBtn) {
        disconnectBtn.disabled = false;
        disconnectBtn.textContent = 'DISCONNECT';
      }
    }
  }

  private async uploadConfiguration(): Promise<void> {
    const uploadBtn = document.getElementById('upload-config') as HTMLButtonElement;

    try {
      if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'UPLOADING...';
      }

      if (window.electronAPI?.uploadConfig) {
        const result = await window.electronAPI.uploadConfig();
        
        if (result.success) {
          alert('Configuration uploaded successfully!');
        } else {
          throw new Error(result.message || 'Upload failed');
        }
      }
    } catch (error) {
      console.error('Failed to upload configuration:', error);
      alert('Failed to upload configuration: ' + (error as Error).message);
    } finally {
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'UPLOAD_CONFIG';
      }
    }
  }

  // Title Bar Setup
  private setupTitleBar(): void {
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');

    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', async () => {
        if (window.electronAPI?.windowMinimize) {
          await window.electronAPI.windowMinimize();
        }
      });
    }

    if (maximizeBtn) {
      maximizeBtn.addEventListener('click', async () => {
        if (window.electronAPI?.windowMaximize) {
          await window.electronAPI.windowMaximize();
          this.updateMaximizeButton();
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', async () => {
        if (window.electronAPI?.windowClose) {
          await window.electronAPI.windowClose();
        }
      });
    }

    // Update maximize button icon on startup
    this.updateMaximizeButton();

    // Listen for window state changes (if needed)
    window.addEventListener('resize', () => {
      this.updateMaximizeButton();
    });
  }

  private async updateMaximizeButton(): Promise<void> {
    const maximizeBtn = document.getElementById('maximize-btn');
    if (!maximizeBtn || !window.electronAPI?.windowIsMaximized) return;

    try {
      const isMaximized = await window.electronAPI.windowIsMaximized();
      const svg = maximizeBtn.querySelector('svg');
      
      if (svg) {
        if (isMaximized) {
          // Show restore icon
          svg.innerHTML = `
            <rect x="2" y="4" width="6" height="6" stroke="currentColor" stroke-width="1" fill="none"/>
            <rect x="4" y="2" width="6" height="6" stroke="currentColor" stroke-width="1" fill="none"/>
          `;
          maximizeBtn.title = 'Restore';
        } else {
          // Show maximize icon
          svg.innerHTML = `
            <rect x="2" y="2" width="8" height="8" stroke="currentColor" stroke-width="1" fill="none"/>
          `;
          maximizeBtn.title = 'Maximize';
        }
      }
    } catch (error) {
      console.error('Failed to update maximize button:', error);
    }
  }

  // UI Updates
  private updateUI(): void {
    this.updateNetworkUI();
  }

  private updateNetworkUI(): void {
    if (!this.config?.network) return;

    const ssidInput = document.getElementById('wifi-ssid') as HTMLInputElement;
    const passwordInput = document.getElementById('wifi-password') as HTMLInputElement;
    const staticIPCheckbox = document.getElementById('static-ip') as HTMLInputElement;
    const ipInput = document.getElementById('ip-address') as HTMLInputElement;
    const subnetInput = document.getElementById('subnet-mask') as HTMLInputElement;
    const gatewayInput = document.getElementById('gateway') as HTMLInputElement;
    const lastUpdatedElement = document.getElementById('network-last-updated');
    const statusElement = document.getElementById('network-config-status');

    // Update form fields
    if (ssidInput) ssidInput.value = this.config.network.ssid || '';
    if (passwordInput) passwordInput.value = this.config.network.password || '';
    if (staticIPCheckbox) staticIPCheckbox.checked = this.config.network.staticIP || false;
    if (ipInput) ipInput.value = this.config.network.ip || '';
    if (subnetInput) subnetInput.value = this.config.network.subnet || '';
    if (gatewayInput) gatewayInput.value = this.config.network.gateway || '';

    // Update static IP visibility
    this.toggleStaticIPConfig(this.config.network.staticIP);

    // Update status
    if (lastUpdatedElement) {
      const lastUpdated = this.config.network.lastUpdated;
      lastUpdatedElement.textContent = lastUpdated ? new Date(lastUpdated).toLocaleString() : 'Never';
    }
    if (statusElement) {
      statusElement.textContent = this.config.network.ssid ? 'Loaded' : 'Not Configured';
      statusElement.className = 'value';
    }
  }
}

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Unhandled error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('PATCOM Configurator starting...');
  
  if (!window.electronAPI) {
    console.error('Electron API not available! Check preload script.');
    return;
  }

  new PatcomApp();
});