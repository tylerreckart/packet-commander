class PatcomConfigApp {
    constructor() {
        this.config = null;
        this.currentTab = 'buttons';
        this.deviceConnected = false;
        this.deviceInfo = null;
        this.discoveredDevices = new Map();
        this.init();
    }

    async init() {
        await this.loadConfig();
        this.setupEventListeners();
        this.setupDeviceEventListeners();
        this.updateUI();
        this.refreshSerialPorts();
        await this.checkDeviceStatus();
    }

    async loadConfig() {
        try {
            this.config = await window.electronAPI.getConfig();
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Button configuration
        document.querySelectorAll('.button-config').forEach(buttonConfig => {
            const buttonId = parseInt(buttonConfig.dataset.button);
            
            // Button name input
            const nameInput = buttonConfig.querySelector('.button-name');
            nameInput.addEventListener('change', (e) => {
                this.updateButtonConfig(buttonId, 'name', e.target.value);
            });

            // Action selection
            const actionSelect = buttonConfig.querySelector('.button-action');
            actionSelect.addEventListener('change', (e) => {
                this.updateButtonAction(buttonId, e.target.value);
            });
        });

        // Network settings
        document.getElementById('wifi-ssid').addEventListener('change', (e) => {
            this.updateNetworkConfig('ssid', e.target.value);
        });

        document.getElementById('wifi-password').addEventListener('change', (e) => {
            this.updateNetworkConfig('password', e.target.value);
        });

        document.getElementById('static-ip').addEventListener('change', (e) => {
            this.updateNetworkConfig('staticIP', e.target.checked);
            this.toggleStaticIPConfig(e.target.checked);
        });

        document.getElementById('ip-address').addEventListener('change', (e) => {
            this.updateNetworkConfig('ip', e.target.value);
        });

        document.getElementById('subnet-mask').addEventListener('change', (e) => {
            this.updateNetworkConfig('subnet', e.target.value);
        });

        document.getElementById('gateway').addEventListener('change', (e) => {
            this.updateNetworkConfig('gateway', e.target.value);
        });

        // MIDI settings
        document.getElementById('midi-channel').addEventListener('change', (e) => {
            this.updateMIDIConfig('channel', parseInt(e.target.value));
        });

        document.getElementById('base-note').addEventListener('change', (e) => {
            this.updateMIDIConfig('baseNote', parseInt(e.target.value));
        });

        // Device settings
        document.getElementById('refresh-ports').addEventListener('click', () => {
            this.refreshSerialPorts();
        });

        document.getElementById('serial-port').addEventListener('change', (e) => {
            this.updateDeviceConfig('serialPort', e.target.value);
        });

        document.getElementById('baud-rate').addEventListener('change', (e) => {
            this.updateDeviceConfig('baudRate', parseInt(e.target.value));
        });

        // Connection controls
        document.getElementById('connect-device').addEventListener('click', () => {
            this.connectDevice();
        });

        document.getElementById('disconnect-device').addEventListener('click', () => {
            this.disconnectDevice();
        });

        // Device discovery controls
        document.getElementById('discover-devices').addEventListener('click', () => {
            this.discoverDevices();
        });

        document.getElementById('sync-all-devices').addEventListener('click', () => {
            this.syncAllDevices();
        });

        // API Keys controls
        document.getElementById('add-api-key').addEventListener('click', () => {
            this.addApiKey();
        });

        document.getElementById('custom-config').addEventListener('change', (e) => {
            this.updateCustomConfig(e.target.value);
        });

        document.getElementById('test-api-keys').addEventListener('click', () => {
            this.testApiKeys();
        });

        document.getElementById('save-api-config').addEventListener('click', () => {
            this.saveConfig();
        });

        // Listen for config updates from main process
        window.electronAPI.onConfigUpdated((event, newConfig) => {
            this.config = newConfig;
            this.updateUI();
        });
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        this.currentTab = tabName;
    }

    updateButtonConfig(buttonId, property, value) {
        if (!this.config) return;
        
        this.config.buttons[buttonId][property] = value;
        this.saveConfig();
    }

    updateButtonAction(buttonId, action) {
        if (!this.config) return;
        
        this.config.buttons[buttonId].action = action;
        this.config.buttons[buttonId].config = this.getDefaultActionConfig(action);
        
        this.renderActionConfig(buttonId, action);
        this.saveConfig();
    }

    getDefaultActionConfig(action) {
        const defaults = {
            'none': {},
            'http': {
                url: '',
                method: 'POST',
                headers: {},
                body: ''
            },
            'webhook': {
                url: '',
                secret: ''
            },
            'midi': {
                note: 60,
                velocity: 127,
                channel: 1
            },
            'osc': {
                host: '127.0.0.1',
                port: 8000,
                address: '/button'
            },
            'script': {
                code: '// Custom script\n// Available: apiKeys, outlets, config\nconsole.log("Button pressed");'
            },
            'serial': {
                command: '',
                baudRate: 115200
            },
        };
        return defaults[action] || {};
    }

    renderActionConfig(buttonId, action) {
        const buttonConfig = document.querySelector(`[data-button="${buttonId}"]`);
        const actionConfigDiv = buttonConfig.querySelector('.action-config');
        
        actionConfigDiv.innerHTML = '';
        
        if (action === 'none') return;
        
        const config = this.config.buttons[buttonId].config;
        
        switch (action) {
            case 'http':
                actionConfigDiv.innerHTML = `
                    <label>URL:</label>
                    <input type="text" class="http-url" value="${config.url || ''}" placeholder="http://example.com/api">
                    <label>Method:</label>
                    <select class="http-method">
                        <option value="GET" ${config.method === 'GET' ? 'selected' : ''}>GET</option>
                        <option value="POST" ${config.method === 'POST' ? 'selected' : ''}>POST</option>
                        <option value="PUT" ${config.method === 'PUT' ? 'selected' : ''}>PUT</option>
                        <option value="DELETE" ${config.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                    </select>
                    <label>Body (JSON):</label>
                    <textarea class="http-body" rows="3" placeholder='{"button": ${buttonId}}'>${config.body || ''}</textarea>
                `;
                
                actionConfigDiv.querySelector('.http-url').addEventListener('change', (e) => {
                    this.updateButtonActionConfig(buttonId, 'url', e.target.value);
                });
                
                actionConfigDiv.querySelector('.http-method').addEventListener('change', (e) => {
                    this.updateButtonActionConfig(buttonId, 'method', e.target.value);
                });
                
                actionConfigDiv.querySelector('.http-body').addEventListener('change', (e) => {
                    this.updateButtonActionConfig(buttonId, 'body', e.target.value);
                });
                break;
                
            case 'midi':
                actionConfigDiv.innerHTML = `
                    <label>MIDI Note:</label>
                    <input type="number" class="midi-note" min="0" max="127" value="${config.note || 60}">
                    <label>Velocity:</label>
                    <input type="number" class="midi-velocity" min="0" max="127" value="${config.velocity || 127}">
                    <label>Channel:</label>
                    <input type="number" class="midi-channel" min="1" max="16" value="${config.channel || 1}">
                `;
                
                actionConfigDiv.querySelector('.midi-note').addEventListener('change', (e) => {
                    this.updateButtonActionConfig(buttonId, 'note', parseInt(e.target.value));
                });
                
                actionConfigDiv.querySelector('.midi-velocity').addEventListener('change', (e) => {
                    this.updateButtonActionConfig(buttonId, 'velocity', parseInt(e.target.value));
                });
                
                actionConfigDiv.querySelector('.midi-channel').addEventListener('change', (e) => {
                    this.updateButtonActionConfig(buttonId, 'channel', parseInt(e.target.value));
                });
                break;
                
            case 'script':
                actionConfigDiv.innerHTML = `
                    <label>Custom Script:</label>
                    <textarea class="script-code" rows="6" placeholder="// Your custom JavaScript code here">${config.code || ''}</textarea>
                `;
                
                actionConfigDiv.querySelector('.script-code').addEventListener('change', (e) => {
                    this.updateButtonActionConfig(buttonId, 'code', e.target.value);
                });
                break;
                
            case 'serial':
                actionConfigDiv.innerHTML = `
                    <label>Serial Command:</label>
                    <input type="text" class="serial-command" value="${config.command || ''}" placeholder="TOGGLE ${buttonId}">
                `;
                
                actionConfigDiv.querySelector('.serial-command').addEventListener('change', (e) => {
                    this.updateButtonActionConfig(buttonId, 'command', e.target.value);
                });
                break;
                
            case 'webhook':
                actionConfigDiv.innerHTML = `
                    <label>Webhook URL:</label>
                    <input type="text" class="webhook-url" value="${config.url || ''}" placeholder="https://hooks.example.com/webhook">
                    <label>Secret (optional):</label>
                    <input type="text" class="webhook-secret" value="${config.secret || ''}" placeholder="webhook-secret">
                `;
                
                actionConfigDiv.querySelector('.webhook-url').addEventListener('change', (e) => {
                    this.updateButtonActionConfig(buttonId, 'url', e.target.value);
                });
                
                actionConfigDiv.querySelector('.webhook-secret').addEventListener('change', (e) => {
                    this.updateButtonActionConfig(buttonId, 'secret', e.target.value);
                });
                break;
                
            case 'osc':
                actionConfigDiv.innerHTML = `
                    <label>Host:</label>
                    <input type="text" class="osc-host" value="${config.host || '127.0.0.1'}" placeholder="127.0.0.1">
                    <label>Port:</label>
                    <input type="number" class="osc-port" min="1" max="65535" value="${config.port || 8000}">
                    <label>OSC Address:</label>
                    <input type="text" class="osc-address" value="${config.address || '/button'}" placeholder="/button">
                `;
                
                actionConfigDiv.querySelector('.osc-host').addEventListener('change', (e) => {
                    this.updateButtonActionConfig(buttonId, 'host', e.target.value);
                });
                
                actionConfigDiv.querySelector('.osc-port').addEventListener('change', (e) => {
                    this.updateButtonActionConfig(buttonId, 'port', parseInt(e.target.value));
                });
                
                actionConfigDiv.querySelector('.osc-address').addEventListener('change', (e) => {
                    this.updateButtonActionConfig(buttonId, 'address', e.target.value);
                });
                break;
                
        }
    }

    updateButtonActionConfig(buttonId, property, value) {
        if (!this.config) return;
        
        this.config.buttons[buttonId].config[property] = value;
        this.saveConfig();
    }

    updateNetworkConfig(property, value) {
        if (!this.config) return;
        
        this.config.network[property] = value;
        this.saveConfig();
    }

    updateMIDIConfig(property, value) {
        if (!this.config) return;
        
        if (!this.config.midi) {
            this.config.midi = {};
        }
        this.config.midi[property] = value;
        this.saveConfig();
    }

    updateDeviceConfig(property, value) {
        if (!this.config) return;
        
        this.config.device[property] = value;
        this.saveConfig();
    }

    toggleStaticIPConfig(show) {
        const staticIPConfig = document.getElementById('static-ip-config');
        staticIPConfig.style.display = show ? 'block' : 'none';
    }

    async refreshSerialPorts() {
        try {
            const ports = await window.electronAPI.getSerialPorts();
            const select = document.getElementById('serial-port');
            
            select.innerHTML = '<option value="">Select a port...</option>';
            
            ports.forEach(port => {
                const option = document.createElement('option');
                option.value = port.path;
                option.textContent = `${port.path} (${port.manufacturer || 'Unknown'})`;
                select.appendChild(option);
            });
            
            // Restore selected port if it exists
            if (this.config && this.config.device.serialPort) {
                select.value = this.config.device.serialPort;
            }
        } catch (error) {
            console.error('Failed to refresh serial ports:', error);
        }
    }

    connectDevice() {
        // TODO: Implement device connection
        console.log('Connecting to device...');
        
        // Simulate connection for UI testing
        setTimeout(() => {
            document.getElementById('connection-status').textContent = 'Connected';
            document.getElementById('connection-status').className = 'status-connected';
            document.getElementById('device-status').textContent = 'Connected';
            document.getElementById('connect-device').disabled = true;
            document.getElementById('disconnect-device').disabled = false;
        }, 1000);
    }

    disconnectDevice() {
        // TODO: Implement device disconnection
        console.log('Disconnecting from device...');
        
        document.getElementById('connection-status').textContent = 'Disconnected';
        document.getElementById('connection-status').className = 'status-disconnected';
        document.getElementById('device-status').textContent = 'Disconnected';
        document.getElementById('connect-device').disabled = false;
        document.getElementById('disconnect-device').disabled = true;
    }

    updateUI() {
        if (!this.config) return;
        
        // Update button configurations
        this.config.buttons.forEach((button, index) => {
            const buttonConfig = document.querySelector(`[data-button="${index}"]`);
            if (buttonConfig) {
                buttonConfig.querySelector('.button-name').value = button.name;
                buttonConfig.querySelector('.button-action').value = button.action;
                this.renderActionConfig(index, button.action);
            }
        });
        
        // Update network settings
        document.getElementById('wifi-ssid').value = this.config.network.ssid || '';
        document.getElementById('wifi-password').value = this.config.network.password || '';
        document.getElementById('static-ip').checked = this.config.network.staticIP || false;
        document.getElementById('ip-address').value = this.config.network.ip || '';
        document.getElementById('subnet-mask').value = this.config.network.subnet || '';
        document.getElementById('gateway').value = this.config.network.gateway || '';
        
        this.toggleStaticIPConfig(this.config.network.staticIP);
        
        // Update MIDI settings
        if (this.config.midi) {
            document.getElementById('midi-channel').value = this.config.midi.channel || 1;
            document.getElementById('base-note').value = this.config.midi.baseNote || 60;
        }
        
        // Update device settings
        document.getElementById('baud-rate').value = this.config.device.baudRate || 115200;
        
        // Update custom config
        document.getElementById('custom-config').value = this.config.customConfig || '{}';
        
        // Update API keys list
        this.updateApiKeysList();
    }

    async saveConfig() {
        try {
            await window.electronAPI.updateConfig(this.config);
        } catch (error) {
            console.error('Failed to save config:', error);
        }
    }

    async discoverDevices() {
        try {
            document.getElementById('discovery-status').textContent = 'Discovering...';
            document.getElementById('discover-devices').disabled = true;
            
            await window.electronAPI.discoverDevices();
            
            // Get current discovered devices
            const devices = await window.electronAPI.getDiscoveredDevices();
            this.updateDeviceList(devices);
            
            setTimeout(() => {
                document.getElementById('discovery-status').textContent = 'Ready';
                document.getElementById('discover-devices').disabled = false;
            }, 3000);
            
        } catch (error) {
            console.error('Discovery failed:', error);
            document.getElementById('discovery-status').textContent = 'Error';
            document.getElementById('discover-devices').disabled = false;
        }
    }

    async syncAllDevices() {
        try {
            document.getElementById('sync-all-devices').disabled = true;
            await window.electronAPI.syncAllDevices();
            
            setTimeout(() => {
                document.getElementById('sync-all-devices').disabled = false;
            }, 2000);
            
        } catch (error) {
            console.error('Sync failed:', error);
            document.getElementById('sync-all-devices').disabled = false;
        }
    }

    updateDeviceList(devices) {
        const deviceList = document.getElementById('device-list');
        
        if (devices.length === 0) {
            deviceList.innerHTML = '<div class="no-devices">No devices discovered. Click "Discover Devices" to scan.</div>';
            return;
        }
        
        deviceList.innerHTML = '';
        
        devices.forEach(device => {
            this.discoveredDevices.set(device.deviceId, device);
            
            const deviceCard = document.createElement('div');
            deviceCard.className = 'device-card';
            deviceCard.innerHTML = `
                <div class="device-header">
                    <h4>${device.deviceName}</h4>
                    <span class="device-type">${this.getDeviceTypeName(device.deviceType)}</span>
                </div>
                <div class="device-info">
                    <div class="info-row">
                        <span>IP:</span>
                        <span>${device.ip}</span>
                    </div>
                    <div class="info-row">
                        <span>Version:</span>
                        <span>${device.version}</span>
                    </div>
                    <div class="info-row">
                        <span>Battery:</span>
                        <span>${device.battery ? device.battery.toFixed(1) + 'V' : 'N/A'}</span>
                    </div>
                    <div class="info-row">
                        <span>Uptime:</span>
                        <span>${this.formatUptime(device.uptime)}</span>
                    </div>
                </div>
                <div class="device-actions">
                    <button class="btn-small sync-device" data-device-id="${device.deviceId}">Sync Config</button>
                    <button class="btn-small get-config" data-device-id="${device.deviceId}">Get Config</button>
                    <button class="btn-small test-device" data-device-id="${device.deviceId}">Test</button>
                </div>
            `;
            
            deviceList.appendChild(deviceCard);
        });
        
        // Add event listeners for device actions
        document.querySelectorAll('.sync-device').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const deviceId = e.target.dataset.deviceId;
                try {
                    e.target.disabled = true;
                    e.target.textContent = 'Syncing...';
                    await window.electronAPI.syncToDevice(deviceId);
                    setTimeout(() => {
                        e.target.disabled = false;
                        e.target.textContent = 'Sync Config';
                    }, 2000);
                } catch (error) {
                    console.error('Sync failed:', error);
                    e.target.disabled = false;
                    e.target.textContent = 'Sync Config';
                }
            });
        });
        
        document.querySelectorAll('.get-config').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const deviceId = e.target.dataset.deviceId;
                try {
                    e.target.disabled = true;
                    e.target.textContent = 'Getting...';
                    const config = await window.electronAPI.getDeviceConfig(deviceId);
                    console.log('Device config:', config);
                    // TODO: Show config in a modal or update current config
                    setTimeout(() => {
                        e.target.disabled = false;
                        e.target.textContent = 'Get Config';
                    }, 1000);
                } catch (error) {
                    console.error('Get config failed:', error);
                    e.target.disabled = false;
                    e.target.textContent = 'Get Config';
                }
            });
        });
    }

    getDeviceTypeName(deviceType) {
        const types = {
            0: 'Button Matrix',
            1: 'Outlet Controller',
            2: 'Custom Device'
        };
        return types[deviceType] || 'Unknown';
    }

    formatUptime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    updateApiKey(keyName, value) {
        if (!this.config) return;
        
        if (!this.config.apiKeys) {
            this.config.apiKeys = {};
        }
        this.config.apiKeys[keyName] = value;
        this.saveConfig();
    }

    updateCustomConfig(value) {
        if (!this.config) return;
        
        try {
            JSON.parse(value); // Validate JSON
            this.config.customConfig = value;
            this.saveConfig();
        } catch (error) {
            console.error('Invalid JSON configuration:', error);
            // TODO: Show error to user
        }
    }

    generateOutletOptions(selectedId) {
        if (!this.config || !this.config.outlets) return '<option value="0">Outlet 0</option>';
        
        return this.config.outlets.map((outlet, index) => {
            const selected = index === selectedId ? 'selected' : '';
            const name = outlet.enabled ? outlet.name : `Outlet ${index} (Not Configured)`;
            return `<option value="${index}" ${selected}>${name}</option>`;
        }).join('');
    }

    addOutlet() {
        const outletsGrid = document.getElementById('outlets-grid');
        const outletId = this.config.outlets ? this.config.outlets.length : 0;
        
        if (outletId >= 8) {
            alert('Maximum of 8 outlets supported');
            return;
        }
        
        this.renderOutletConfig(outletId);
    }

    updateOutletsGrid() {
        const outletsGrid = document.getElementById('outlets-grid');
        outletsGrid.innerHTML = '';
        
        if (this.config && this.config.outlets) {
            this.config.outlets.forEach((outlet, index) => {
                if (outlet.enabled || outlet.deviceMac) {
                    this.renderOutletConfig(index);
                }
            });
        }
    }

    renderOutletConfig(outletId) {
        const outletsGrid = document.getElementById('outlets-grid');
        
        const outletCard = document.createElement('div');
        outletCard.className = 'outlet-config';
        outletCard.dataset.outletId = outletId;
        
        const outlet = this.config.outlets[outletId] || {
            name: `Outlet ${outletId}`,
            deviceMac: '',
            deviceModel: 'H5083',
            enabled: false
        };
        
        outletCard.innerHTML = `
            <div class="outlet-header">
                <h5>Outlet ${outletId}</h5>
                <label class="outlet-enabled">
                    <input type="checkbox" ${outlet.enabled ? 'checked' : ''}> Enabled
                </label>
            </div>
            <div class="outlet-controls">
                <div class="form-group">
                    <label>Name:</label>
                    <input type="text" class="outlet-name" value="${outlet.name}">
                </div>
                <div class="form-group">
                    <label>Device MAC Address:</label>
                    <input type="text" class="outlet-mac" value="${outlet.deviceMac}" placeholder="AA:BB:CC:DD:EE:FF">
                </div>
                <div class="form-group">
                    <label>Device Model:</label>
                    <select class="outlet-model">
                        <option value="H5083" ${outlet.deviceModel === 'H5083' ? 'selected' : ''}>Govee H5083</option>
                        <option value="H5001" ${outlet.deviceModel === 'H5001' ? 'selected' : ''}>Govee H5001</option>
                        <option value="custom" ${outlet.deviceModel === 'custom' ? 'selected' : ''}>Custom</option>
                    </select>
                </div>
                <button class="btn-small remove-outlet">Remove</button>
            </div>
        `;
        
        // Add event listeners
        outletCard.querySelector('.outlet-enabled input').addEventListener('change', (e) => {
            this.updateOutletConfig(outletId, 'enabled', e.target.checked);
        });
        
        outletCard.querySelector('.outlet-name').addEventListener('change', (e) => {
            this.updateOutletConfig(outletId, 'name', e.target.value);
        });
        
        outletCard.querySelector('.outlet-mac').addEventListener('change', (e) => {
            this.updateOutletConfig(outletId, 'deviceMac', e.target.value);
        });
        
        outletCard.querySelector('.outlet-model').addEventListener('change', (e) => {
            this.updateOutletConfig(outletId, 'deviceModel', e.target.value);
        });
        
        outletCard.querySelector('.remove-outlet').addEventListener('click', () => {
            this.removeOutlet(outletId);
        });
        
        outletsGrid.appendChild(outletCard);
    }

    updateOutletConfig(outletId, property, value) {
        if (!this.config || !this.config.outlets) return;
        
        if (!this.config.outlets[outletId]) {
            this.config.outlets[outletId] = {
                id: outletId,
                name: `Outlet ${outletId}`,
                deviceMac: '',
                deviceModel: 'H5083',
                enabled: false
            };
        }
        
        this.config.outlets[outletId][property] = value;
        this.saveConfig();
    }

    removeOutlet(outletId) {
        const outletCard = document.querySelector(`[data-outlet-id="${outletId}"]`);
        if (outletCard) {
            outletCard.remove();
        }
        
        if (this.config && this.config.outlets && this.config.outlets[outletId]) {
            this.config.outlets[outletId] = {
                id: outletId,
                name: `Outlet ${outletId}`,
                deviceMac: '',
                deviceModel: 'H5083',
                enabled: false
            };
            this.saveConfig();
        }
    }

    async testApiKeys() {
        const button = document.getElementById('test-api-keys');
        button.disabled = true;
        button.textContent = 'Testing...';
        
        try {
            // Test Govee API if key is present
            if (this.config.apiKeys.govee) {
                console.log('Testing Govee API key...');
                // TODO: Implement actual API test
            }
            
            // Test other APIs as needed
            
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Test API Keys';
                // TODO: Show test results
            }, 2000);
            
        } catch (error) {
            console.error('API test failed:', error);
            button.disabled = false;
            button.textContent = 'Test API Keys';
        }
    }

    setupDeviceEventListeners() {
        // Listen for device discovery events
        window.electronAPI.onDeviceDiscovered((event, device) => {
            this.discoveredDevices.set(device.deviceId, device);
            this.updateDeviceList(Array.from(this.discoveredDevices.values()));
        });
        
        // Listen for config update acknowledgments
        window.electronAPI.onConfigUpdateAck((event, ack) => {
            console.log('Config update acknowledged:', ack);
            // TODO: Show notification or update UI
        });
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PatcomConfigApp();
});