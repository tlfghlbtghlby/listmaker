const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printDirect: (options) => ipcRenderer.invoke('print-direct', options),
});
