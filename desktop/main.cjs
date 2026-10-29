'use strict';
const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { startServer } = require('../apps/server/src/server.cjs');

let mainWindow;
let serverHandle;

function localIPv4() {
  for (const rows of Object.values(os.networkInterfaces())) {
    for (const row of rows || []) {
      if (row && row.family === 'IPv4' && !row.internal) return row.address;
    }
  }
  return 'your-PC-IP';
}

async function createWindow() {
  app.setAppUserModelId('com.mirrorforge.dashboard');
  process.env.NODE_ENV = app.isPackaged ? 'production' : 'development';
  process.env.DATA_DIR = process.env.DATA_DIR || path.join(app.getPath('userData'), 'data');
  process.env.HOST = process.env.HOST || '0.0.0.0';
  process.env.PORT = process.env.PORT || '4173';

  serverHandle = await startServer({ host: process.env.HOST, port: Number(process.env.PORT), dataDir: process.env.DATA_DIR });
  const localUrl = `http://127.0.0.1:${serverHandle.port}`;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'MirrorForge',
    backgroundColor: '#07111f',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(localUrl);
  console.log(`MirrorForge local console: ${localUrl}`);
  console.log(`MirrorForge LAN URL: http://${localIPv4()}:${serverHandle.port}`);
  console.log('To enable internet access, configure a secure tunnel to the local server port.');
}

app.whenReady().then(createWindow).catch(async (err) => {
  console.error('MirrorForge could not start:', err);
  await dialog.showMessageBox({ type: 'error', title: 'MirrorForge startup failed', message: 'MirrorForge could not start its local server.', detail: err.message });
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(console.error);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { try { serverHandle?.server?.close(); } catch {} });
