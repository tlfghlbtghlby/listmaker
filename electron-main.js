import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    autoHideMenuBar: true,
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

// معالجة الطباعة الصامتة الحصرية للتطبيق المكتبي
ipcMain.handle('print-direct', async (event, options = {}) => {
  if (!mainWindow) return false;

  return new Promise((resolve) => {
    const printOptions = {
      silent: options.silent ?? true,
      printBackground: true,
      deviceName: options.deviceName || '',
      pageSize: options.pageSize || 'A4',
      margins: { marginType: 'none' },
    };

    mainWindow.webContents.print(printOptions, (success, failureReason) => {
      if (!success) {
        console.error('فشل أمر الطباعة في Electron:', failureReason);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
