const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Diets
  getDiets: () => ipcRenderer.invoke('db-get-diets'),
  saveDiet: (d) => ipcRenderer.invoke('db-save-diet', d),
  deleteDiet: (id) => ipcRenderer.invoke('db-delete-diet', id),
  // Custom feeds
  getCustomFeeds: (spId) => ipcRenderer.invoke('db-get-custom-feeds', spId),
  saveCustomFeed: (spId, data) => ipcRenderer.invoke('db-save-custom-feed', spId, data),
  updateCustomFeed: (dbId, data) => ipcRenderer.invoke('db-update-custom-feed', dbId, data),
  deleteCustomFeed: (dbId) => ipcRenderer.invoke('db-delete-custom-feed', dbId),
  // State
  saveState: (key, val) => ipcRenderer.invoke('db-save-state', key, val),
  getState: (key) => ipcRenderer.invoke('db-get-state', key),
  // Dialogs
  exportJSON: (data, name) => ipcRenderer.invoke('dialog-save-json', data, name),
  importJSON: () => ipcRenderer.invoke('dialog-open-json'),
  // Updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
});
