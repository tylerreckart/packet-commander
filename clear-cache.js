#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

function clearElectronCache() {
  const platforms = {
    darwin: path.join(os.homedir(), 'Library', 'Caches', 'patcom-config'),
    win32: path.join(os.homedir(), 'AppData', 'Local', 'patcom-config'),
    linux: path.join(os.homedir(), '.cache', 'patcom-config')
  };

  const cachePath = platforms[process.platform];
  
  if (fs.existsSync(cachePath)) {
    console.log('Clearing Electron cache at:', cachePath);
    fs.rmSync(cachePath, { recursive: true, force: true });
    console.log('Cache cleared successfully');
  } else {
    console.log('Cache directory not found at:', cachePath);
  }

  // Also try the new app name cache
  const newCachePath = platforms[process.platform]?.replace('patcom-config', 'packet-commander');
  if (newCachePath && fs.existsSync(newCachePath)) {
    console.log('Clearing new cache at:', newCachePath);
    fs.rmSync(newCachePath, { recursive: true, force: true });
  }
}

clearElectronCache();