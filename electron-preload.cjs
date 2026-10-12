const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  printSilent: (format) => ipcRenderer.invoke('print-silent', format),
});
