const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('helloDarziPrint', {
  print: () => ipcRenderer.invoke('print-preview-print'),
  close: () => ipcRenderer.invoke('print-preview-close'),
});
