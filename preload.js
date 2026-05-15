const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openHtml: () => ipcRenderer.invoke('dialog:openHtml'),
  openData: () => ipcRenderer.invoke('dialog:openData'),
  saveHtml: (payload) => ipcRenderer.invoke('dialog:saveHtml', payload),
  saveBatch: (payload) => ipcRenderer.invoke('dialog:saveBatch', payload),

  onMenuEvent: (channel, callback) => {
    const validChannels = [
      'menu:open-html',
      'menu:import-data',
      'menu:export-result',
      'menu:about'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  }
});
