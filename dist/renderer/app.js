"use strict";
class PatcomApp {
    constructor() {
        this.config = {};
        this.currentTab = 'buttons';
        this.init();
    }
    async init() {
        await this.loadConfiguration();
        this.setupEventListeners();
        this.updateUI();
    }
    // Configuration Management
    async loadConfiguration() {
        try {
            if (window.electronAPI) {
                this.config = await window.electronAPI.getConfig() || {};
                console.log('Configuration loaded:', this.config);
            }
        }
        catch (error) {
            console.error('Failed to load configuration:', error);
            this.config = {};
        }
    }
    async saveConfiguration() {
        try {
            if (window.electronAPI) {
                await window.electronAPI.updateConfig(this.config);
            }
        }
        catch (error) {
            console.error('Failed to save configuration:', error);
            throw error;
        }
    }
    // Event Listeners Setup
    setupEventListeners() {
        this.setupTabSwitching();
        this.setupNetworkHandling();
        this.setupButtonHandling();
        this.setupDeviceHandling();
    }
    // Tab Management
    setupTabSwitching() {
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const target = e.target.closest('.tab-button');
                const tab = target?.dataset.tab;
                if (tab) {
                    this.switchTab(tab);
                }
            });
        });
    }
    switchTab(tabName) {
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
    setupNetworkHandling() {
        const saveBtn = document.getElementById('save-network-config');
        const testBtn = document.getElementById('test-network-config');
        const uploadBtn = document.getElementById('upload-network-config');
        const staticIPCheckbox = document.getElementById('static-ip');
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
                const checked = e.target.checked;
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
    toggleStaticIPConfig(show) {
        const staticIPConfig = document.getElementById('static-ip-config');
        if (staticIPConfig) {
            staticIPConfig.style.display = show ? 'block' : 'none';
        }
    }
    markNetworkConfigChanged() {
        const statusElement = document.getElementById('network-config-status');
        if (statusElement) {
            statusElement.textContent = 'Modified (Not Saved)';
            statusElement.className = 'value status-warning';
        }
    }
    async saveNetworkConfiguration() {
        const saveBtn = document.getElementById('save-network-config');
        const statusElement = document.getElementById('network-config-status');
        const lastUpdatedElement = document.getElementById('network-last-updated');
        try {
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';
            }
            // Get form values
            const ssidInput = document.getElementById('wifi-ssid');
            const passwordInput = document.getElementById('wifi-password');
            const staticIPCheckbox = document.getElementById('static-ip');
            const ipInput = document.getElementById('ip-address');
            const subnetInput = document.getElementById('subnet-mask');
            const gatewayInput = document.getElementById('gateway');
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
            const uploadBtn = document.getElementById('upload-network-config');
            if (uploadBtn) {
                uploadBtn.disabled = false;
            }
        }
        catch (error) {
            console.error('Failed to save network configuration:', error);
            if (statusElement) {
                statusElement.textContent = 'Save Failed';
                statusElement.className = 'value status-error';
            }
        }
        finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Configuration';
            }
        }
    }
    async testNetworkConfiguration() {
        const testBtn = document.getElementById('test-network-config');
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
            const ssidInput = document.getElementById('wifi-ssid');
            const passwordInput = document.getElementById('wifi-password');
            if (!ssidInput?.value) {
                throw new Error('SSID is required for testing');
            }
            // Simulate network test
            const testResult = await this.simulateNetworkTest(ssidInput.value, passwordInput?.value || '');
            if (testStatusElement) {
                if (testResult.success) {
                    testStatusElement.textContent = 'Test Passed';
                    testStatusElement.className = 'value status-success';
                }
                else {
                    testStatusElement.textContent = `Test Failed: ${testResult.error}`;
                    testStatusElement.className = 'value status-error';
                }
            }
        }
        catch (error) {
            console.error('Network test failed:', error);
            if (testStatusElement) {
                testStatusElement.textContent = `Test Error: ${error.message}`;
                testStatusElement.className = 'value status-error';
            }
        }
        finally {
            if (testBtn) {
                testBtn.disabled = false;
                testBtn.textContent = 'Test Connection';
            }
        }
    }
    async simulateNetworkTest(ssid, password) {
        return new Promise((resolve) => {
            setTimeout(() => {
                if (ssid.length < 1) {
                    resolve({ success: false, error: 'SSID cannot be empty' });
                }
                else if (password.length > 0 && password.length < 8) {
                    resolve({ success: false, error: 'Password must be at least 8 characters' });
                }
                else {
                    const success = Math.random() > 0.3; // 70% success rate for demo
                    if (success) {
                        resolve({ success: true });
                    }
                    else {
                        resolve({ success: false, error: 'Network unreachable or invalid credentials' });
                    }
                }
            }, 2000);
        });
    }
    async uploadNetworkConfiguration() {
        const uploadBtn = document.getElementById('upload-network-config');
        try {
            if (uploadBtn) {
                uploadBtn.disabled = true;
                uploadBtn.textContent = 'Uploading...';
            }
            // Simulate upload
            await new Promise(resolve => setTimeout(resolve, 1500));
            alert('Network configuration uploaded to device successfully!');
        }
        catch (error) {
            console.error('Upload failed:', error);
            alert('Failed to upload network configuration: ' + error.message);
        }
        finally {
            if (uploadBtn) {
                uploadBtn.disabled = false;
                uploadBtn.textContent = 'Upload to Device';
            }
        }
    }
    // Button Configuration (placeholder for future implementation)
    setupButtonHandling() {
        // Button configuration functionality would go here
        console.log('Button handling setup - placeholder');
    }
    // Device Connection (placeholder for future implementation)
    setupDeviceHandling() {
        // Device connection functionality would go here
        console.log('Device handling setup - placeholder');
    }
    // UI Updates
    updateUI() {
        this.updateNetworkUI();
    }
    updateNetworkUI() {
        if (!this.config?.network)
            return;
        const ssidInput = document.getElementById('wifi-ssid');
        const passwordInput = document.getElementById('wifi-password');
        const staticIPCheckbox = document.getElementById('static-ip');
        const ipInput = document.getElementById('ip-address');
        const subnetInput = document.getElementById('subnet-mask');
        const gatewayInput = document.getElementById('gateway');
        const lastUpdatedElement = document.getElementById('network-last-updated');
        const statusElement = document.getElementById('network-config-status');
        // Update form fields
        if (ssidInput)
            ssidInput.value = this.config.network.ssid || '';
        if (passwordInput)
            passwordInput.value = this.config.network.password || '';
        if (staticIPCheckbox)
            staticIPCheckbox.checked = this.config.network.staticIP || false;
        if (ipInput)
            ipInput.value = this.config.network.ip || '';
        if (subnetInput)
            subnetInput.value = this.config.network.subnet || '';
        if (gatewayInput)
            gatewayInput.value = this.config.network.gateway || '';
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
//# sourceMappingURL=app.js.map