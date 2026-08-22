// ZSZD Higiena BRYGADZISTA — wersja desktopowa (Windows)
// Opakowuje tę samą aplikację co wersja PWA, ale z dostępem do dysku:
// paczki danych zapisują się AUTOMATYCZNIE do wybranego folderu (np. synchronizowanego z Dyskiem Google).

const { app, BrowserWindow, ipcMain, dialog, shell, Notification, Menu, MenuItem } = require('electron');
const path = require('path');
const fs = require('fs');

// Ustawienia desktopowe trzymamy w pliku obok danych użytkownika,
// niezależnie od bazy IndexedDB aplikacji.
const settingsPath = () => path.join(app.getPath('userData'), 'desktop-settings.json');

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch (e) {
    return {};
  }
}

function writeSettings(obj) {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(obj, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'ZSZD Higiena BRYGADZISTA',
    icon: path.join(__dirname, 'app', 'icons', 'icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));

  // Elektron, w przeciwieństwie do zwykłej przeglądarki, NIE pokazuje domyślnie
  // menu "Kopiuj/Wklej/Wytnij" po prawym kliknięciu — trzeba je zbudować ręcznie.
  // Bez tego kopiowanie/wklejanie tekstu w polach formularzy było możliwe tylko
  // skrótami klawiszowymi (Ctrl+C/Ctrl+V), nie prawym przyciskiem myszy.
  mainWindow.webContents.on('context-menu', (event, params) => {
    const menu = new Menu();
    if (params.isEditable) {
      menu.append(new MenuItem({ label: 'Wytnij', role: 'cut', enabled: params.editFlags.canCut }));
      menu.append(new MenuItem({ label: 'Kopiuj', role: 'copy', enabled: params.editFlags.canCopy }));
      menu.append(new MenuItem({ label: 'Wklej', role: 'paste', enabled: params.editFlags.canPaste }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ label: 'Zaznacz wszystko', role: 'selectAll', enabled: params.editFlags.canSelectAll }));
    } else if (params.selectionText) {
      menu.append(new MenuItem({ label: 'Kopiuj', role: 'copy' }));
    }
    if (menu.items.length > 0) menu.popup({ window: mainWindow });
  });

  // Linki zewnętrzne (np. folder Dysku Google) otwieraj w przeglądarce, nie w oknie aplikacji
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ===== OKNA DIALOGOWE (confirm / alert) =====
// Electron nie pokazuje okien confirm()/alert() wywołanych z kodu strony — wywołanie
// blokuje wykonanie i interfejs wygląda na zawieszony. Podstawiamy własną obsługę
// (patrz preload.js), która pokazuje prawdziwe okno systemowe Windows.
// Synchronicznie, bo confirm() musi zwrócić wynik natychmiast.
ipcMain.on('zszd:confirmSync', (event, message) => {
  const wynik = dialog.showMessageBoxSync(mainWindow, {
    type: 'question',
    buttons: ['Tak', 'Anuluj'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    title: 'Potwierdzenie',
    message: String(message || '')
  });
  event.returnValue = (wynik === 0);
});

ipcMain.on('zszd:alertSync', (event, message) => {
  dialog.showMessageBoxSync(mainWindow, {
    type: 'info',
    buttons: ['OK'],
    noLink: true,
    title: 'ZSZD Higiena',
    message: String(message || '')
  });
  event.returnValue = true;
});

// ===== MOSTEK DO APLIKACJI (wywoływane z preload.js) =====

// Prawdziwa wersja aplikacji z package.json — jedno źródło prawdy dla
// etykiety wersji pokazywanej w tytule okna i w Ustawieniach.
ipcMain.handle('zszd:getVersion', async () => app.getVersion());

// Wybór folderu, do którego automatycznie zapisują się paczki
ipcMain.handle('zszd:chooseSyncFolder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Wybierz folder na paczki danych (np. folder Dysku Google)',
    properties: ['openDirectory', 'createDirectory']
  });
  if (res.canceled || !res.filePaths.length) return null;
  const folder = res.filePaths[0];
  const s = readSettings();
  s.syncFolder = folder;
  writeSettings(s);
  return folder;
});

ipcMain.handle('zszd:getSyncFolder', async () => readSettings().syncFolder || null);

ipcMain.handle('zszd:clearSyncFolder', async () => {
  const s = readSettings();
  delete s.syncFolder;
  writeSettings(s);
  return true;
});

// Zapis paczki wprost do folderu — to jest ta funkcja, której przeglądarka nie potrafi
ipcMain.handle('zszd:savePackage', async (_evt, { filename, content, notify }) => {
  const folder = readSettings().syncFolder;
  if (!folder) return { ok: false, error: 'Nie wybrano folderu na paczki danych.' };
  try {
    if (!fs.existsSync(folder)) {
      return { ok: false, error: 'Wybrany folder nie istnieje. Wskaż folder ponownie.' };
    }
    const target = path.join(folder, filename);
    fs.writeFileSync(target, content, 'utf8');
    if (notify && Notification.isSupported()) {
      new Notification({
        title: 'Paczka danych zapisana',
        body: `${filename} — zapisano w folderze centrali.`
      }).show();
    }
    return { ok: true, path: target };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Otwórz folder paczek w Eksploratorze Windows
ipcMain.handle('zszd:openSyncFolder', async () => {
  const folder = readSettings().syncFolder;
  if (!folder) return { ok: false, error: 'Nie wybrano folderu.' };
  shell.openPath(folder);
  return { ok: true };
});

// Lista paczek w folderze — żeby Centrala mogła je wczytać jednym kliknięciem
ipcMain.handle('zszd:listPackages', async () => {
  const folder = readSettings().syncFolder;
  if (!folder || !fs.existsSync(folder)) return [];
  try {
    return fs.readdirSync(folder)
      .filter(f => f.toLowerCase().endsWith('.json'))
      .map(f => {
        const full = path.join(folder, f);
        const st = fs.statSync(full);
        return { name: f, size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch (e) {
    return [];
  }
});

// Odczyt konkretnej paczki z folderu
ipcMain.handle('zszd:readPackage', async (_evt, filename) => {
  const folder = readSettings().syncFolder;
  if (!folder) return { ok: false, error: 'Nie wybrano folderu.' };
  try {
    const content = fs.readFileSync(path.join(folder, filename), 'utf8');
    return { ok: true, content };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== FOLDER NA PACZKI STARTOWE (dla brygadzisty / koordynatora / admina) =====
// Osobny od folderu synchronizacji powyżej (ten jest na paczki PRZYCHODZĄCE od
// brygadzistów; ten poniżej na paczki WYCHODZĄCE, które Centrala przygotowuje
// dla nowych użytkowników) — różne kierunki, różne foldery.
ipcMain.handle('zszd:chooseStarterFolder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Wybierz folder na wygenerowane paczki startowe',
    properties: ['openDirectory', 'createDirectory']
  });
  if (res.canceled || !res.filePaths.length) return null;
  const folder = res.filePaths[0];
  const s = readSettings();
  s.starterFolder = folder;
  writeSettings(s);
  return folder;
});

ipcMain.handle('zszd:getStarterFolder', async () => readSettings().starterFolder || null);

ipcMain.handle('zszd:openStarterFolder', async () => {
  const folder = readSettings().starterFolder;
  if (!folder) return { ok: false, error: 'Nie wybrano folderu.' };
  shell.openPath(folder);
  return { ok: true };
});

// Zapis paczki startowej — okno "Zapisz jako" z podpowiedzianą lokalizacją
// (folder startowy + podfolder wg roli), tak żeby pliki same się porządkowały,
// ale użytkownik nadal może zmienić miejsce/nazwę w oknie dialogowym.
ipcMain.handle('zszd:saveStarterPackage', async (_evt, { filename, content, roleSubfolder }) => {
  const baseFolder = readSettings().starterFolder;
  let defaultPath = filename;
  if (baseFolder) {
    const targetDir = path.join(baseFolder, roleSubfolder || '');
    try {
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      defaultPath = path.join(targetDir, filename);
    } catch (e) {
      defaultPath = path.join(baseFolder, filename);
    }
  }
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Zapisz paczkę startową',
    defaultPath,
    filters: [{ name: 'Pliki JSON', extensions: ['json'] }]
  });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(res.filePath, content, 'utf8');
    return { ok: true, path: res.filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Pokaż zapisany plik w Eksploratorze Windows, zaznaczony — gotowy do
// przeciągnięcia np. do okna WhatsApp Desktop.
ipcMain.handle('zszd:showItemInFolder', async (_evt, filePath) => {
  if (!filePath) return { ok: false, error: 'Brak ścieżki pliku.' };
  shell.showItemInFolder(filePath);
  return { ok: true };
});

// Natywny "dymek" Windows przy zablokowaniu konta po zbyt wielu nieudanych
// próbach logowania — żeby admin od razu widział, nawet nie patrząc akurat
// na okno aplikacji.
ipcMain.handle('zszd:showSecurityNotification', async (_evt, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title: title || 'ZSZD Higiena', body: body || '' }).show();
    return { ok: true };
  }
  return { ok: false, error: 'Powiadomienia systemowe niedostępne na tym urządzeniu.' };
});
