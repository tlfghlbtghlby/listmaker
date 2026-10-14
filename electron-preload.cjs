const { contextBridge, ipcRenderer } = require('electron');

const api = {
  printSilent: (format) => ipcRenderer.invoke('print-silent', format),
  printDirect: (options) => ipcRenderer.invoke('print-direct', options),
};

// إتاحة الجسر تحت الاسمين ليعمل مع أي استدعاء في الواجهة
contextBridge.exposeInMainWorld('electronAPI', api);
contextBridge.exposeInMainWorld('electron', api);
