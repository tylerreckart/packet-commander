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
  }

  private async init(): Promise<void> {
    await this.loadConfiguration();
    this.setupEventListeners();
    this.updateUI();
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
    const saveBtn = document.getElementById('save-network-config');
    const testBtn = document.getElementById('test-network-config');
    const uploadBtn = document.getElementById('upload-network-config');
    const staticIPCheckbox = document.getElementById('static-ip') as HTMLInputElement;

    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveNetworkConfiguration());
    }

    if (testBtn) {
      testBtn.addEventListener('click', () => this.testNetworkConfiguration());
    }

    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => this.uploadNetworkConfiguration());
    }

    if (staticIPCheckbox) {
      staticIPCheckbox.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        this.toggleStaticIPConfig(checked);
      });
    }

    // Add change listeners to form fields
    const formFields = ['wifi-ssid', 'wifi-password', 'ip-address', 'subnet-mask', 'gateway'];
    formFields.forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (field) {
        field.addEventListener('change', () => this.markNetworkConfigChanged());
      }
    });
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
    const saveBtn = document.getElementById('save-network-config') as HTMLButtonElement;
    const statusElement = document.getElementById('network-config-status');
    const lastUpdatedElement = document.getElementById('network-last-updated');

    try {
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }

      // Get form values
      const ssidInput = document.getElementById('wifi-ssid') as HTMLInputElement;
      const passwordInput = document.getElementById('wifi-password') as HTMLInputElement;
      const staticIPCheckbox = document.getElementById('static-ip') as HTMLInputElement;
      const ipInput = document.getElementById('ip-address') as HTMLInputElement;
      const subnetInput = document.getElementById('subnet-mask') as HTMLInputElement;
      const gatewayInput = document.getElementById('gateway') as HTMLInputElement;

      // Update config object
      if (!this.config.network) {
        this.config.network = {
          ssid: '',
          password: '',
          staticIP: false,
          ip: '',
          subnet: '',
          gateway: ''
        };
      }

      this.config.network.ssid = ssidInput?.value || '';
      this.config.network.password = passwordInput?.value || '';
      this.config.network.staticIP = staticIPCheckbox?.checked || false;
      this.config.network.ip = ipInput?.value || '';
      this.config.network.subnet = subnetInput?.value || '';
      this.config.network.gateway = gatewayInput?.value || '';
      this.config.network.lastUpdated = new Date().toISOString();

      // Save to main process
      await this.saveConfiguration();

      // Update UI
      if (statusElement) {
        statusElement.textContent = 'Saved';
        statusElement.className = 'value status-success';
      }
      if (lastUpdatedElement) {
        lastUpdatedElement.textContent = new Date().toLocaleString();
      }

      // Enable upload button
      const uploadBtn = document.getElementById('upload-network-config') as HTMLButtonElement;
      if (uploadBtn) {
        uploadBtn.disabled = false;
      }

    } catch (error) {
      console.error('Failed to save network configuration:', error);
      if (statusElement) {
        statusElement.textContent = 'Save Failed';
        statusElement.className = 'value status-error';
      }
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Configuration';
      }
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
    const uploadBtn = document.getElementById('upload-network-config') as HTMLButtonElement;

    try {
      if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Uploading...';
      }

      // Simulate upload
      await new Promise(resolve => setTimeout(resolve, 1500));
      alert('Network configuration uploaded to device successfully!');

    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload network configuration: ' + (error as Error).message);
    } finally {
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload to Device';
      }
    }
  }

  // Button Configuration (placeholder for future implementation)
  private setupButtonHandling(): void {
    // Button configuration functionality would go here
    console.log('Button handling setup - placeholder');
  }

  // Device Connection (placeholder for future implementation)
  private setupDeviceHandling(): void {
    // Device connection functionality would go here
    console.log('Device handling setup - placeholder');
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