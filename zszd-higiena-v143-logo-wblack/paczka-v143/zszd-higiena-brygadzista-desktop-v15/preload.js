// Mostek między aplikacją (index.html) a systemem plików.
// Aplikacja widzi tylko te funkcje, nic więcej — dlatego jest bezpiecznie.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ZSZD_DESKTOP', {
  // Znacznik: aplikacja może sprawdzić, czy działa w wersji desktopowej
  isDesktop: true,

  // Prawdziwa wersja aplikacji z package.json — używana do etykiety wersji w UI.
  getVersion: () => ipcRenderer.invoke('zszd:getVersion'),

  // Electron nie obsługuje okien confirm()/alert() wywołanych z kodu strony —
  // zamiast pokazać okno, blokuje wykonanie i aplikacja wygląda na zawieszoną.
  // Te dwie funkcje pokazują prawdziwe okna systemowe Windows; podmiana globalnego
  // confirm/alert następuje w index.html (contextBridge nie pozwala nadpisać
  // wbudowanych właściwości window bezpośrednio).
  confirmSync: (message) => ipcRenderer.sendSync('zszd:confirmSync', message),
  alertSync: (message) => { ipcRenderer.sendSync('zszd:alertSync', message); },

  chooseSyncFolder: () => ipcRenderer.invoke('zszd:chooseSyncFolder'),
  getSyncFolder: () => ipcRenderer.invoke('zszd:getSyncFolder'),
  clearSyncFolder: () => ipcRenderer.invoke('zszd:clearSyncFolder'),
  openSyncFolder: () => ipcRenderer.invoke('zszd:openSyncFolder'),

  savePackage: (filename, content, notify = true) =>
    ipcRenderer.invoke('zszd:savePackage', { filename, content, notify }),

  listPackages: () => ipcRenderer.invoke('zszd:listPackages'),
  readPackage: (filename) => ipcRenderer.invoke('zszd:readPackage', filename),

  chooseStarterFolder: () => ipcRenderer.invoke('zszd:chooseStarterFolder'),
  getStarterFolder: () => ipcRenderer.invoke('zszd:getStarterFolder'),
  openStarterFolder: () => ipcRenderer.invoke('zszd:openStarterFolder'),
  saveStarterPackage: (filename, content, roleSubfolder) =>
    ipcRenderer.invoke('zszd:saveStarterPackage', { filename, content, roleSubfolder }),
  showItemInFolder: (filePath) => ipcRenderer.invoke('zszd:showItemInFolder', filePath),
  showSecurityNotification: (title, body) => ipcRenderer.invoke('zszd:showSecurityNotification', { title, body })
});
