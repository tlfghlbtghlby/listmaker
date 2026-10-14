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

// دالة موحدة لتنفيذ الطباعة الصامتة
const handlePrint = (event, optionsOrFormat = 'thermal') => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return Promise.resolve(false);

  // استخراج صيغة الورق سواء أُرسلت كنص مباشر أو داخل كائن
  const format = typeof optionsOrFormat === 'string' 
    ? optionsOrFormat 
    : (optionsOrFormat?.paperSize || optionsOrFormat?.pageSize || 'thermal');

  const printOptions = {
    silent: true,            // طباعة فورية صامتة دون نافذة حوار ويندوز
    printBackground: true,   // طباعة التصاميم والألوان
    margins: { marginType: 'none' }
  };

  // قياسات الورق بالميكرون (1mm = 1000 microns)
  if (format === 'thermal58' || format === 'roll58' || format === '58mm') {
    printOptions.pageSize = { width: 58000, height: 297000 }; // ورق كاشير 58mm
  } else if (format === 'thermal' || format === 'roll80' || format === 'receipt' || format === 'thermal80') {
    printOptions.pageSize = { width: 80000, height: 297000 }; // ورق كاشير 80mm
  } else if (format === 'a5' || format === 'A5') {
    printOptions.pageSize = 'A5';
  } else {
    printOptions.pageSize = 'A4';
  }

  return new Promise((resolve) => {
    win.webContents.print(printOptions, (success, failureReason) => {
      if (!success) {
        console.warn('فشل أمر الطباعة الصامتة:', failureReason);
      }
      resolve(success);
    });
  });
};

// الاستماع للقناتين لضمان عمل الطباعة مهما كان استدعاؤها في الواجهة
ipcMain.handle('print-silent', handlePrint);
ipcMain.handle('print-direct', handlePrint);

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
