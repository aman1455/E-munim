const { app, BrowserWindow, shell, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { fork } = require('child_process');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.AmanNegi.emunim');
}

let mainWindow = null;
let serverProcess = null;
const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

// Persist user data in %APPDATA%/E-Munim/data
const dataDir = isDev
  ? path.join(__dirname, '..', 'data')
  : path.join(app.getPath('userData'), 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function getActivePort() {
  try {
    const portFile = path.join(dataDir, 'port.txt');
    if (fs.existsSync(portFile)) {
      const n = parseInt(fs.readFileSync(portFile, 'utf-8').trim(), 10);
      if (isFinite(n) && n >= 1024 && n <= 65535) return n;
    }
  } catch { /* ignore */ }
  return 47371;
}

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const activeUrl = `http://127.0.0.1:${getActivePort()}`;
      const req = http.get(activeUrl, (res) => {
        resolve(activeUrl);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Server start timed out after ${timeoutMs / 1000}s on ${activeUrl}`));
        } else {
          setTimeout(check, 300);
        }
      });
      req.end();
    };
    check();
  });
}

function startBackendServer() {
  const serverPath = path.join(__dirname, '..', 'server.js');
  const env = {
    ...process.env,
    DATA_DIR: dataDir,
    DIST_PATH: path.join(__dirname, '..', 'dist'),
    PORT: '47371'
  };

  // Use utilityProcess if available (Electron 22+), fallback to fork
  if (utilityProcess && typeof utilityProcess.fork === 'function') {
    serverProcess = utilityProcess.fork(serverPath, [], {
      env,
      stdio: 'pipe'
    });
    serverProcess.stdout?.on('data', (data) => {
      console.log(`[backend] ${data}`);
    });
    serverProcess.stderr?.on('data', (data) => {
      console.error(`[backend error] ${data}`);
    });
  } else {
    serverProcess = fork(serverPath, [], { env });
  }

  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Backend server exited with code ${code}`);
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1000,
    minHeight: 650,
    title: 'E-Munim',
    icon: path.join(__dirname, '..', 'release-templates', '_system-scripts', 'app-icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const fallbackUrl = `http://127.0.0.1:${getActivePort()}`;

  waitForServer(fallbackUrl)
    .then((readyUrl) => {
      mainWindow.loadURL(readyUrl || fallbackUrl);
    })
    .catch((err) => {
      console.error('Failed to load backend:', err);
      const errorHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>E-Munim - Starting Server</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 2rem; max-width: 480px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h2 { margin-top: 0; color: #ef4444; }
    p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
    button { background: #2563eb; color: #fff; border: 0; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 600; cursor: pointer; margin-top: 1rem; }
    button:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <h2>E-Munim Backend Not Responding</h2>
    <p>${err.message || 'The local billing server could not be started.'}</p>
    <button onclick="location.reload()">Retry Connection</button>
  </div>
</body>
</html>`;
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
    });

  // Open external links (e.g. documentation, help) in default system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    startBackendServer();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch (e) {
      // ignore
    }
  }
});
