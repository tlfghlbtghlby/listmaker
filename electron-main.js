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
      preload: path.join(__dirname, 'electron-preload.cjs'),
    },
  });

  win.loadFile(path.join(__dirname, 'dist/index.html'));
}

// دالة الطباعة الصامتة المعتمدة لطابعة Xprinter XP-80
const handlePrint = (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return Promise.resolve(false);

  const printOptions = {
    silent: true,            // طباعة صامتة فورية
    printBackground: true,   // طباعة الرسوم والتصميم بدقة
    margins: { marginType: 'none' },
    pageSize: { width: 72000, height: 297000 } // العرض الفعلي لرأس الطباعة 72mm لمنع خروج صفحات إضافية
  };

  return new Promise((resolve) => {
    win.webContents.print(printOptions, (success, failureReason) => {
      if (!success) {
        console.warn('فشل أمر الطباعة الصامتة:', failureReason);
      }
      resolve(success);
    });
  });
};

ipcMain.handle('print-silent', handlePrint);
ipcMain.handle('print-direct', handlePrint);

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
