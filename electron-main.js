import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron-preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, 'dist/index.html'));
}

// معالج أمر الطباعة التلقائية الصامتة بدون نافذة حوار ويندوز
ipcMain.handle('print-silent', async (event, format = 'thermal') => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;

  let printOptions = {
    silent: true,            // طباعة صامتة وتلقائية بدون إظهار نافذة الحوار
    printBackground: true,   // طباعة التصاميم والألوان
    margins: { marginType: 'none' }
  };

  // تحديد مقاس الورقة بدقة بحسب خيار المستخدم في الإعدادات
  if (format === 'thermal' || format === 'roll80' || format === 'receipt') {
    printOptions.pageSize = { width: 80000, height: 297000 }; // ورق كاشير حراري 80mm
  } else if (format === 'a5') {
    printOptions.pageSize = 'A5';
  } else {
    printOptions.pageSize = 'A4';
  }

  return new Promise((resolve) => {
    win.webContents.print(printOptions, (success, failureReason) => {
      if (!success) {
        console.warn('تنبيه فشل الطباعة الصامتة:', failureReason);
      }
      resolve(success);
    });
  });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
