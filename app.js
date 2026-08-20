// app.js — logika aplikacji Serwis Nadziewarek v1

const DEFAULT_CHECKLIST = [
  'Powoduje zwarcie',
  'Nie działa',
  'Uszkodzony włącznik',
  'Czujnik dozowania nie działa',
  'Elementy wewnętrzne nie kręcą się'
];

let state = {
  machines: [],
  reviews: [],
  durEntries: [],
  parts: [],
  checklist: [],
  currentMachineId: null,
  editingMachineId: null
};

// ===== Utility =====
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function fmtDate(iso) {
  if (!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===== Navigation =====
function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + viewId);
  if (target) target.classList.add('active');
}
function switchTab(tabName) {
  if (!tabName) return;  // przycisk bez data-view (np. przełącznik widoku kalendarza) — nie jest zakładką
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === tabName));
  switchView(tabName);

  // Odśwież zawartość zakładki przy każdym wejściu — inaczej po zmianie danych
  // w innym miejscu widać starą albo pustą listę.
  const odswiez = {
    magStock: 'renderMagStock',
    magProducts: 'renderMagProducts',
    magReceipts: 'renderMagReceipts',
    magIssues: 'renderMagIssues',
    magOrders: 'renderMagOrders',
    magZewnetrzny: 'renderMagZewnetrznyZakladka',
    magRemanent: 'renderMagRemanentZakladka',
    magZuzycie: 'initZuzycie',
    machines: 'renderMachineList',
    parts: 'renderPartsList',
    partsStock: 'renderPartsStockList',
    dur: 'renderDurList',
    devices: 'renderDeviceList',
    serviceReports: 'renderAllReportsList',
    settings: 'odswiezUstawieniaNadziewarki',
    settingsSatelity: 'odswiezUstawieniaSatelity',
    obsAttendance: 'initAttendanceView',
    obsEmployees: 'renderEmployeeList',
    obsLeave: 'renderLeaveList',
    obsStats: 'renderObsStats',
    obsCalView: 'renderCalendarActiveView',
    obsSettingsView: 'odswiezUstawieniaObecnosci',
    harmCodzDzien: 'renderHarmCodzDzien',
    harmCodzObszary: 'renderHarmCodzObszaryList',
    harmCodzZadania: 'renderHarmCodzZadaniaList',
    harmCodzHistoria: 'renderHarmCodzHistoria',
    harmCodzUstawienia: 'renderHarmCodzUstawienia',
    harmCyklDzien: 'renderHarmCyklDzien',
    harmCyklObszary: 'renderHarmCyklObszaryList',
    harmCyklZadania: 'renderHarmCyklZadaniaList',
    harmCyklHistoria: 'renderHarmCyklHistoria'
  }[tabName];
  if (odswiez && typeof window[odswiez] === 'function') window[odswiez]();
}

// Zakładki ustawień mają po kilka list — odświeżamy je razem
function odswiezUstawieniaNadziewarki() {
  if (typeof renderChecklistSettings === 'function') renderChecklistSettings();
  if (typeof renderMachineStats === 'function') renderMachineStats();
}

function odswiezUstawieniaSatelity() {
  if (typeof renderManufacturerSettings === 'function') renderManufacturerSettings();
  if (typeof renderSatFaultsSettings === 'function') renderSatFaultsSettings();
}

function odswiezUstawieniaObecnosci() {
  if (typeof renderObsSettings === 'function') renderObsSettings();
  if (typeof initObszaryBrygadzisci === 'function') initObszaryBrygadzisci();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  // Przyciski bez data-view mają własną obsługę — globalny handler ich nie dotyczy
  if (!btn.dataset.view) return;
  btn.addEventListener('click', () => switchTab(btn.dataset.view));
});

// ===== Home screen / moduły =====
const MODULES = ['moduleNadziewarki', 'moduleSatelity', 'moduleObecnosc', 'moduleUstawienia', 'moduleCentrala', 'moduleMagazyn', 'moduleSzkolenia'];

const MODULE_LABELS = {
  nadziewarki: '⚙️ Nadziewarki',
  satelity: '🚿 Satelity',
  obecnosc: '👥 Obecność',
  magazyn: '📦 Magazyn',
  szkolenia: '🎓 Szkolenia',
  harmCodzienny: '📅 Harmonogram codzienny',
  harmCykliczny: '🔄 Harmonogram cykliczny',
  centrala: '🏢 Centrala',
  ustawienia: '🔧 Ustawienia'
};

// ===== LOGOWANIE I UPRAWNIENIA =====
// currentUser = { id, username, displayName, isAdmin, allowedModules, createdAt } (bez hasła/soli)
let currentUser = null;

// Sygnał gotowości: inne pliki (np. obecnosc.js), ładowane PO tym pliku, ale
// wykonujące się WSPÓŁBIEŻNIE (oba są asynchroniczne, oba zaczynają się
// niemal jednocześnie) — nie mogą po prostu ZAKŁADAĆ, że currentUser jest już
// ustawiony w chwili, gdy do niego docierają. Muszą jawnie na to poczekać:
// `await window.__authReady;` — dopiero WTEDY currentUser ma swoją ostateczną
// wartość dla tego uruchomienia aplikacji.
let __authReadyResolve;
window.__authReady = new Promise(resolve => { __authReadyResolve = resolve; });

function userCanAccessModule(moduleKey) {
  if (!currentUser) return false;
  if (currentUser.isAdmin) return true;
  return (currentUser.allowedModules || []).includes(moduleKey);
}

function applyUserPermissions() {
  document.querySelectorAll('.home-tile[data-goto]').forEach(tile => {
    const key = tile.dataset.goto;
    tile.style.display = userCanAccessModule(key) ? '' : 'none';
  });
  const usersCard = document.getElementById('usersManagementCard');
  const pepperCard = document.getElementById('pepperCard');
  const securityLogCard = document.getElementById('securityLogCard');
  const homeHelpCard = document.getElementById('homeHelpCard');
  if (usersCard) usersCard.style.display = (currentUser && currentUser.isAdmin) ? 'block' : 'none';
  if (pepperCard) pepperCard.style.display = (currentUser && currentUser.isAdmin) ? 'block' : 'none';
  if (securityLogCard) securityLogCard.style.display = (currentUser && currentUser.isAdmin) ? 'block' : 'none';
  // Skrót "🆘 Pomoc" na ekranie głównym — tylko dla kogoś zalogowanego przez
  // wczytany plik konfiguracyjny (brygadzista/koordynator/admin-telefon).
  // To osoby często mniej obyte z telefonem/komputerem, więc te 3 najważniejsze
  // czynności muszą być na pierwszym ekranie, nie schowane w Ustawieniach.
  if (homeHelpCard) homeHelpCard.style.display = (currentUser && currentUser.role) ? 'block' : 'none';
  // Wyraźny, samodzielny przycisk wysyłki na samej górze — ta sama grupa osób
  // co karta Pomoc powyżej, ale bez przewijania w dół, żeby nie trzeba było
  // go szukać.
  const homeQuickSendBtn = document.getElementById('homeQuickSendBtn');
  if (homeQuickSendBtn) homeQuickSendBtn.style.display = (currentUser && currentUser.role) ? 'block' : 'none';
}

function renderUserBar() {
  const bar = document.getElementById('userBar');
  if (!bar || !currentUser) return;
  const rola = currentUser.isAdmin ? 'Administrator'
    : currentUser.role === 'admin' ? 'Admin (telefon)'
    : currentUser.role === 'koordynator' ? 'Koordynator'
    : currentUser.role === 'obszar' ? 'Stanowisko'
    : currentUser.role === 'brygadzista' ? 'Brygadzista'
    : 'Pracownik';
  bar.innerHTML = `Zalogowano jako: <strong>${escapeHtml(currentUser.displayName || currentUser.username)}</strong> (${rola}) &nbsp;·&nbsp; <button class="btn link" id="logoutBtn">Wyloguj</button>`;
  document.getElementById('logoutBtn').addEventListener('click', () => {
    document.getElementById('logoutConfirmModalOverlay').classList.add('active');
  });
}

async function performLogout() {
  // Ktoś zalogowany przez wczytany plik konfiguracyjny (rola ustawiona,
  // brak prawdziwego konta z hasłem) — samo czyszczenie sesji nic by nie
  // dało, bo initAuth() od razu znowu znajdzie tę samą tożsamość i wpuści
  // z powrotem. Trzeba wyczyścić samą tożsamość.
  if (currentUser && currentUser.role && !currentUser.isAdmin) {
    await DB.setBrygadzistaIdentity(null);
  }
  await DB.clearSession();
  currentUser = null;
  location.reload();
}

document.getElementById('closeLogoutConfirmModal').addEventListener('click', () => {
  document.getElementById('logoutConfirmModalOverlay').classList.remove('active');
});
document.getElementById('logoutCancelBtn').addEventListener('click', () => {
  document.getElementById('logoutConfirmModalOverlay').classList.remove('active');
});
document.getElementById('logoutOnlyBtn').addEventListener('click', performLogout);
document.getElementById('logoutSendBtn').addEventListener('click', async () => {
  showToast('Przygotowywanie kopii i wysyłki...');
  try {
    await DB.saveAutoBackup();
    await sendToCentrala(false);
  } catch (e) {
    showToast('Błąd podczas przygotowywania danych — wylogowuję mimo to');
  }
  await performLogout();
});

function renderModuleChecklist(containerId, checked = []) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = ALL_MODULE_KEYS.map(key => `
    <label><input type="checkbox" value="${key}" ${checked.includes(key) ? 'checked' : ''}> ${MODULE_LABELS[key] || key}</label>
  `).join('');
}

function readModuleChecklist(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return [];
  return Array.from(el.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
}

async function onLoginSuccess() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('homeScreen').style.display = '';
  applyUserPermissions();
  renderUserBar();
  await updateSendAsHint();
  await setupAutoSend();
  await setupShiftReminder();
  if (typeof renderPendingUploadBanner === 'function') await renderPendingUploadBanner();
  if (typeof initObszaryBrygadzisci === 'function') await initObszaryBrygadzisci();
  if (typeof renderChecklistSelectors === 'function') await renderChecklistSelectors();
  if (typeof initAttendanceView === 'function') initAttendanceView();
  if (typeof fillNewUserBrygadzistaSelect === 'function') await fillNewUserBrygadzistaSelect();
  if (currentUser.isAdmin) {
    await renderUsersList();
  }
}

async function initAuth() {
  // Czy to urządzenie ma już wczytany plik konfiguracyjny (rola: brygadzista/
  // koordynator/admin)? Jeśli tak, wejdź od razu — bez logowania, tak samo
  // jak w dawnej osobnej wersji dla telefonu (teraz to jedna aplikacja).
  const identity = await DB.getBrygadzistaIdentity();
  if (identity) {
    const allowedModules = await DB.getBrygadzistaAllowedModules();
    const role = identity.role || 'brygadzista';
    const displayName = `${identity.imie || ''} ${identity.nazwisko || ''}`.trim();
    currentUser = {
      id: role === 'obszar' ? 'obszar-' + identity.obszarId + '-' + identity.shift : 'brygadzista-' + (identity.brygadzistaEntryId || identity.koordynatorEntryId || 'admin'),
      username: displayName,
      displayName,
      isAdmin: false,
      role,
      allowedModules: role === 'admin' ? [...(allowedModules || []), 'centrala'] : (allowedModules || []).filter(m => m !== 'centrala'),
      brygadzistaEntryId: identity.brygadzistaEntryId || null,
      koordynatorEntryId: identity.koordynatorEntryId || null,
      obszarId: identity.obszarId || null,
      obszarShift: identity.shift || null
    };
    await onLoginSuccess();
    // Uwaga: pokazanie i zablokowanie check-listy dla roli 'obszar' NIE dzieje
    // się tutaj — obecnosc.js ładuje się i wykonuje PO tym pliku (kolejność
    // <script> tagów), więc w tym momencie dane obecności (obsState.employees
    // itd.) jeszcze nie są wczytane do pamięci, a funkcje typu
    // renderAttendanceForm jeszcze nie istnieją. Ta logika jest teraz na końcu
    // initObecnosc() w obecnosc.js, gdzie dane są już na pewno gotowe.
    return;
  }

  document.getElementById('starterImportCard').style.display = 'block';

  const users = await DB.getUsers();
  if (!users.length) {
    document.getElementById('firstRunCard').style.display = 'block';
    document.getElementById('loginCard').style.display = 'none';
    const pepperInput = document.getElementById('firstRunPepper');
    if (pepperInput) pepperInput.value = genId() + genId();
    return;
  }

  const sessionId = await DB.getSession();
  if (sessionId) {
    const user = users.find(u => u.id === sessionId);
    if (user && user.passwordHash) {
      currentUser = { ...user };
      delete currentUser.passwordHash;
      delete currentUser.salt;
      delete currentUser.totpSecret;
      delete currentUser.totpBackupCodes;
      document.getElementById('starterImportCard').style.display = 'none';
      await onLoginSuccess();
      return;
    }
  }
  document.getElementById('loginCard').style.display = 'block';
  document.getElementById('firstRunCard').style.display = 'none';
}

// Import pliku konfiguracyjnego — dokładnie ten sam mechanizm co dawniej
// wyłącznie w wersji dla telefonu, teraz dostępny też tutaj.
document.getElementById('importStarterBtn') && document.getElementById('importStarterBtn').addEventListener('click', () => {
  document.getElementById('importStarterFile').click();
});
document.getElementById('importStarterFile') && document.getElementById('importStarterFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const errEl = document.getElementById('starterImportError');
  errEl.style.display = 'none';

  const users = await DB.getUsers();
  const hasExistingData = users.length > 0 || (await DB.getBrygadzistaIdentity());
  if (hasExistingData) {
    if (!confirm('To urządzenie ma już skonfigurowane dane. Wczytanie pliku USUNIE wszystkie dotychczasowe dane robocze (konta z hasłem zostaną nietknięte) i zastąpi je danymi z pliku. Na pewno kontynuować?')) {
      e.target.value = '';
      return;
    }
  }

  try {
    const text = await file.text();
    const pkg = JSON.parse(text);
    const identity = await DB.importBrygadzistaStarter(pkg);
    showToast(`Witaj, ${identity.imie} ${identity.nazwisko}!`);
    document.getElementById('starterImportCard').style.display = 'none';
    document.getElementById('firstRunCard').style.display = 'none';
    document.getElementById('loginCard').style.display = 'none';
    await initAuth();
  } catch (err) {
    errEl.textContent = 'Błąd: ' + err.message;
    errEl.style.display = 'block';
  }
  e.target.value = '';
});

document.getElementById('firstRunPepperShow').addEventListener('change', (e) => {
  document.getElementById('firstRunPepper').type = e.target.checked ? 'text' : 'password';
});

renderModuleChecklist('firstRunModulesChecklist', []);

function updateFirstRunRoleUI() {
  const isBrygadzista = document.getElementById('firstRunRoleBrygadzista').checked;
  document.getElementById('firstRunModulesField').style.display = isBrygadzista ? 'block' : 'none';
  document.getElementById('firstRunSubmitBtn').textContent = isBrygadzista ? 'Utwórz konto brygadzisty' : 'Utwórz konto administratora';
  const roleHint = document.getElementById('firstRunRoleHint');
  roleHint.textContent = isBrygadzista
    ? 'Uwaga: jeśli to będzie jedyne konto na tym urządzeniu, nie będzie tu lokalnego administratora do zarządzania kontami. Wybierz to tylko, jeśli Ty sam(a) zarządzasz wszystkim z innego, głównego urządzenia.'
    : 'To konto będzie mieć pełny dostęp do wszystkich modułów oraz do zarządzania kolejnymi kontami na tym urządzeniu.';
}
document.getElementById('firstRunRoleAdmin').addEventListener('change', updateFirstRunRoleUI);
document.getElementById('firstRunRoleBrygadzista').addEventListener('change', updateFirstRunRoleUI);
updateFirstRunRoleUI();

document.getElementById('firstRunSubmitBtn').addEventListener('click', async () => {
  const errEl = document.getElementById('firstRunError');
  errEl.textContent = '';
  const isAdmin = document.getElementById('firstRunRoleAdmin').checked;
  const username = document.getElementById('firstRunUsername').value.trim();
  const p1 = document.getElementById('firstRunPassword').value;
  const p2 = document.getElementById('firstRunPassword2').value;
  const pepper = document.getElementById('firstRunPepper').value;
  const allowedModules = readModuleChecklist('firstRunModulesChecklist');

  if (!username) { errEl.textContent = 'Podaj nazwę użytkownika.'; return; }
  if (p1.length < 4) { errEl.textContent = 'Hasło musi mieć co najmniej 4 znaki.'; return; }
  if (p1 !== p2) { errEl.textContent = 'Hasła nie są identyczne.'; return; }
  if (!isAdmin && allowedModules.length === 0) { errEl.textContent = 'Zaznacz przynajmniej jeden moduł dla konta brygadzisty.'; return; }

  try {
    await DB.setAuthPepper(pepper);
    const user = await DB.createUser({ username, password: p1, isAdmin, allowedModules });
    await DB.setSession(user.id);
    currentUser = { ...user };
    delete currentUser.passwordHash;
    delete currentUser.salt;
    delete currentUser.totpSecret;
    delete currentUser.totpBackupCodes;
    await proceedAfterPasswordCheck(currentUser);
  } catch (e) {
    errEl.textContent = 'Błąd: ' + e.message;
  }
});

document.getElementById('loginSubmitBtn').addEventListener('click', async () => {
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!username || !password) { errEl.textContent = 'Podaj login i hasło.'; return; }
  const result = await DB.verifyLogin(username, password);
  if (result && result.locked) {
    const minutes = Math.max(1, Math.ceil((result.lockedUntil - Date.now()) / 60000));
    errEl.textContent = `Konto zablokowane po zbyt wielu nieudanych próbach logowania. Spróbuj ponownie za ${minutes} min, albo poproś administratora o pomoc.`;
    if (typeof notifySecurityLockout === 'function') notifySecurityLockout(username);
    return;
  }
  if (!result) {
    errEl.textContent = 'Nieprawidłowy login lub hasło (albo hasło zostało unieważnione po zmianie pieprzu — poproś administratora o reset).';
    return;
  }
  const user = result;
  await DB.setSession(user.id);
  currentUser = user;
  await proceedAfterPasswordCheck(currentUser);
});

['loginUsername', 'loginPassword'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('loginSubmitBtn').click(); });
});

// ===== 2FA (TOTP) — obowiązkowe dla kont administratora =====
function loadQRCodeLib() {
  return new Promise((resolve, reject) => {
    if (typeof QRCode !== 'undefined') return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function hideAllLoginCards() {
  ['firstRunCard', 'loginCard', 'totpSetupCard', 'totpBackupCodesCard', 'totpVerifyCard'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

let totpPendingUser = null;
let totpPendingSecret = null;
let totpVerifyUseBackup = false;

// Po sprawdzeniu hasła: konta admina wymagają 2FA (konfiguracji albo weryfikacji);
// pozostałe konta logują się od razu.
async function proceedAfterPasswordCheck(user) {
  hideAllLoginCards();
  if (user.isAdmin && !user.totpEnabled) {
    await startTotpSetup(user);
  } else if (user.isAdmin && user.totpEnabled) {
    showTotpVerify(user);
  } else {
    await onLoginSuccess();
  }
}

async function startTotpSetup(user) {
  totpPendingUser = user;
  totpPendingSecret = DB.generateTotpSecret();
  document.getElementById('totpSetupCard').style.display = 'block';
  document.getElementById('totpManualKey').value = totpPendingSecret.match(/.{1,4}/g).join(' ');
  document.getElementById('totpConfirmCode').value = '';
  document.getElementById('totpSetupError').textContent = '';

  const canvas = document.getElementById('totpQrCanvas');
  const fallbackHint = document.getElementById('totpQrFallbackHint');
  canvas.style.display = 'none';
  fallbackHint.style.display = 'none';
  try {
    await loadQRCodeLib();
    const uri = DB.otpAuthUri(user.username, totpPendingSecret);
    await QRCode.toCanvas(canvas, uri, { width: 220 });
    canvas.style.display = 'inline-block';
  } catch (e) {
    fallbackHint.style.display = 'block';
  }
}

document.getElementById('totpConfirmCode').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('totpConfirmBtn').click();
});

document.getElementById('totpConfirmBtn').addEventListener('click', async () => {
  const errEl = document.getElementById('totpSetupError');
  errEl.textContent = '';
  const code = document.getElementById('totpConfirmCode').value;
  const ok = await DB.verifyTotpCode(totpPendingSecret, code);
  if (!ok) { errEl.textContent = 'Nieprawidłowy kod — sprawdź, czy zeskanowałeś poprawny klucz i czy telefon ma dobrą godzinę.'; return; }

  const backupCodes = DB.generateBackupCodes(8);
  await DB.enableUserTotp(totpPendingUser.id, totpPendingSecret, backupCodes);

  document.getElementById('totpSetupCard').style.display = 'none';
  document.getElementById('totpBackupCodesList').innerHTML = backupCodes.map(c => `<div>${c}</div>`).join('');
  document.getElementById('totpBackupCodesCard').style.display = 'block';
});

document.getElementById('totpBackupCodesConfirmBtn').addEventListener('click', async () => {
  document.getElementById('totpBackupCodesCard').style.display = 'none';
  if (currentUser) currentUser.totpEnabled = true;
  totpPendingUser = null;
  totpPendingSecret = null;
  await onLoginSuccess();
});

function showTotpVerify(user) {
  totpPendingUser = user;
  totpVerifyUseBackup = false;
  document.getElementById('totpVerifyCard').style.display = 'block';
  document.getElementById('totpVerifyCode').value = '';
  document.getElementById('totpVerifyError').textContent = '';
  document.getElementById('totpVerifyLabel').textContent = 'Wpisz 6-cyfrowy kod z aplikacji Authenticator';
  document.getElementById('totpUseBackupToggle').textContent = 'Użyj kodu zapasowego zamiast tego';
}

document.getElementById('totpVerifyCode').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('totpVerifyBtn').click();
});

document.getElementById('totpUseBackupToggle').addEventListener('click', () => {
  totpVerifyUseBackup = !totpVerifyUseBackup;
  document.getElementById('totpVerifyLabel').textContent = totpVerifyUseBackup
    ? 'Wpisz jeden z kodów zapasowych (np. ABCD-1234)'
    : 'Wpisz 6-cyfrowy kod z aplikacji Authenticator';
  document.getElementById('totpUseBackupToggle').textContent = totpVerifyUseBackup
    ? 'Użyj kodu z aplikacji Authenticator zamiast tego'
    : 'Użyj kodu zapasowego zamiast tego';
  document.getElementById('totpVerifyCode').value = '';
  document.getElementById('totpVerifyError').textContent = '';
});

document.getElementById('totpVerifyBtn').addEventListener('click', async () => {
  const errEl = document.getElementById('totpVerifyError');
  errEl.textContent = '';
  const code = document.getElementById('totpVerifyCode').value;
  if (!totpPendingUser) return;

  let ok = false;
  if (totpVerifyUseBackup) {
    ok = await DB.verifyBackupCode(totpPendingUser.id, code);
  } else {
    const info = await DB.getUserTotpInfo(totpPendingUser.id);
    ok = info && await DB.verifyTotpCode(info.totpSecret, code);
  }
  if (!ok) { errEl.textContent = totpVerifyUseBackup ? 'Nieprawidłowy albo już wykorzystany kod zapasowy.' : 'Nieprawidłowy kod.'; return; }

  document.getElementById('totpVerifyCard').style.display = 'none';
  totpPendingUser = null;
  await onLoginSuccess();
});

// ===== ZARZĄDZANIE UŻYTKOWNIKAMI (TYLKO ADMINISTRATOR) =====
async function renderUsersList() {
  const wrap = document.getElementById('usersList');
  if (!wrap) return;
  const users = await DB.getUsers();
  wrap.innerHTML = users.map(u => `
    <div class="storage-row" style="margin-bottom:8px;flex-direction:column;align-items:flex-start;gap:6px;">
      <span>👤 <strong>${escapeHtml(u.displayName || u.username)}</strong> <span style="font-size:12px;color:var(--text-dim);">(login: ${escapeHtml(u.username)}${u.isAdmin ? ' · Administrator' : ''})</span></span>
      ${u.isAdmin ? `<span class="hint">Administrator ma zawsze dostęp do wszystkich modułów. 2FA: ${u.totpEnabled ? '✅ włączone' : '⚠️ wymaga konfiguracji przy następnym logowaniu'}</span>` : `
        <div class="module-checklist" id="modulesFor_${u.id}">
          ${ALL_MODULE_KEYS.map(key => `<label><input type="checkbox" value="${key}" ${(u.allowedModules||[]).includes(key) ? 'checked' : ''}> ${MODULE_LABELS[key] || key}</label>`).join('')}
        </div>
        <button class="btn secondary small" data-save-modules="${u.id}">Zapisz dostęp do modułów</button>
      `}
      <span>
        <button class="btn secondary" data-reset-password="${u.id}" style="margin-right:6px;">Zresetuj hasło</button>
        ${u.isAdmin && u.totpEnabled ? `<button class="btn secondary" data-reset-totp="${u.id}" style="margin-right:6px;">Resetuj 2FA</button>` : ''}
        ${u.id === currentUser.id ? '' : `<button class="btn danger" data-delete-user="${u.id}">Usuń</button>`}
      </span>
    </div>
  `).join('');
}

document.getElementById('usersList').addEventListener('click', async (e) => {
  const t = e.target;
  if (t.dataset.saveModules) {
    const id = t.dataset.saveModules;
    const checklist = document.getElementById('modulesFor_' + id);
    const modules = Array.from(checklist.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    await DB.updateUserModules(id, modules);
    showToast('Zapisano dostęp do modułów');
  } else if (t.dataset.resetPassword) {
    const newPass = prompt('Nowe hasło dla tego użytkownika (min. 4 znaki):');
    if (!newPass) return;
    if (newPass.length < 4) { alert('Hasło musi mieć co najmniej 4 znaki.'); return; }
    await DB.resetUserPassword(t.dataset.resetPassword, newPass);
    showToast('Hasło zresetowane');
  } else if (t.dataset.resetTotp) {
    if (!confirm('Zresetować 2FA tego administratora? Będzie musiał skonfigurować je od nowa (nowy kod QR i nowe kody zapasowe) przy następnym logowaniu.')) return;
    await DB.resetUserTotp(t.dataset.resetTotp);
    showToast('2FA zresetowane — zostanie poproszony o ponowną konfigurację przy następnym logowaniu');
    await renderUsersList();
  } else if (t.dataset.deleteUser) {
    if (!confirm('Usunąć to konto z tego urządzenia? Tej operacji nie można cofnąć.')) return;
    await DB.deleteUser(t.dataset.deleteUser);
    showToast('Konto usunięte');
    await renderUsersList();
  }
});

document.getElementById('newUserIsAdmin').addEventListener('change', (e) => {
  document.getElementById('newUserModulesField').style.display = e.target.checked ? 'none' : 'block';
  const brygField = document.getElementById('newUserBrygadzistaField');
  if (brygField) brygField.style.display = e.target.checked ? 'none' : 'block';
});
renderModuleChecklist('newUserModulesChecklist', []);

// Wypełnia dropdown brygadzistów w formularzu konta
async function fillNewUserBrygadzistaSelect() {
  const sel = document.getElementById('newUserBrygadzista');
  if (!sel) return;
  const list = await DB.getBrygadzisciList();
  const obszary = await DB.getObszary();
  const obszarNazwa = (id) => { const o = obszary.find(x => x.id === id); return o ? o.nazwa : '—'; };
  sel.innerHTML = '<option value="">— nie powiązano (widzi wszystkich / jak dotąd) —</option>' +
    list.map(b => `<option value="${b.id}">${escapeHtml(b.imie)} ${escapeHtml(b.nazwisko)} (${escapeHtml(obszarNazwa(b.obszarId))} • ${b.typ === 'etat' ? 'Etatowy' : 'Outsourcing'})</option>`).join('');
}
fillNewUserBrygadzistaSelect();

document.getElementById('addUserBtn').addEventListener('click', async () => {
  const errEl = document.getElementById('addUserError');
  errEl.textContent = '';
  const username = document.getElementById('newUserUsername').value.trim();
  const password = document.getElementById('newUserPassword').value;
  const isAdmin = document.getElementById('newUserIsAdmin').checked;
  const allowedModules = readModuleChecklist('newUserModulesChecklist');
  const brygadzistaEntryId = document.getElementById('newUserBrygadzista') ? document.getElementById('newUserBrygadzista').value : '';

  if (!username) { errEl.textContent = 'Podaj nazwę użytkownika.'; return; }
  if (password.length < 4) { errEl.textContent = 'Hasło musi mieć co najmniej 4 znaki.'; return; }

  try {
    await DB.createUser({ username, password, isAdmin, allowedModules, brygadzistaEntryId });
    document.getElementById('newUserUsername').value = '';
    document.getElementById('newUserPassword').value = '';
    document.getElementById('newUserIsAdmin').checked = false;
    document.getElementById('newUserModulesField').style.display = 'block';
    if (document.getElementById('newUserBrygadzista')) document.getElementById('newUserBrygadzista').value = '';
    renderModuleChecklist('newUserModulesChecklist', []);
    showToast('Użytkownik dodany');
    await renderUsersList();
  } catch (e) {
    errEl.textContent = 'Błąd: ' + e.message;
  }
});

document.getElementById('changePepperBtn').addEventListener('click', async () => {
  if (!confirm('To unieważni hasła WSZYSTKICH kont na tym urządzeniu (łącznie z Twoim). Każdy będzie musiał dostać nowe hasło przez "Zresetuj hasło". Kontynuować?')) return;
  const newPepper = prompt('Nowa wartość pieprzu:');
  if (newPepper === null) return;
  await DB.setAuthPepper(newPepper);
  await DB.invalidateAllPasswords();
  showToast('Pieprz zmieniony — zresetuj teraz hasła wszystkich kont (łącznie ze swoim), inaczej nikt się nie zaloguje ponownie po wylogowaniu.');
  await renderUsersList();
});

// ===== DZIENNIK ZDARZEŃ BEZPIECZEŃSTWA =====
// Wywoływana od razu w momencie zablokowania konta (na ekranie logowania,
// zanim ktokolwiek jest zalogowany). Jeśli to desktop, pokazuje natywny
// "dymek" systemowy Windows. Niezależnie od tego, jeśli skonfigurowano
// Telegram, wysyła wiadomość W PEŁNI AUTOMATYCZNIE i po cichu — bez
// klikania czegokolwiek (w przeciwieństwie do przycisku WhatsApp poniżej).
// Zdarzenie zawsze trafia też do dziennika, widocznego przy następnym wejściu.
async function notifySecurityLockout(username) {
  if (window.ZSZD_DESKTOP && window.ZSZD_DESKTOP.isDesktop && window.ZSZD_DESKTOP.showSecurityNotification) {
    window.ZSZD_DESKTOP.showSecurityNotification(
      '🔒 Możliwa próba włamania',
      `Konto "${username}" zostało zablokowane po 3 nieudanych próbach logowania.`
    );
  }
  await sendTelegramNotification(
    `🔒 ZSZD Higiena: konto "${username}" zablokowane po 3 nieudanych próbach logowania (${new Date().toLocaleString('pl')}).`
  );
}

// Wysyłka przez Telegram Bot API — działa identycznie w przeglądarce i w
// desktopie (zwykłe zapytanie sieciowe, bez potrzeby żadnej dodatkowej
// biblioteki). Zwraca {ok, error} zamiast rzucać wyjątek, żeby nigdy nie
// wywalić reszty logiki logowania, jeśli coś pójdzie nie tak z siecią.
async function sendTelegramNotification(text) {
  const token = await DB.getSetting('telegramBotToken', '');
  const chatId = await DB.getSetting('telegramChatId', '');
  if (!token || !chatId) return { ok: false, error: 'Telegram nie skonfigurowany' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    const data = await res.json();
    return data.ok ? { ok: true } : { ok: false, error: data.description || 'Błąd wysyłki' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

document.getElementById('saveTelegramBtn') && document.getElementById('saveTelegramBtn').addEventListener('click', async () => {
  await DB.setSetting('telegramBotToken', document.getElementById('telegramBotToken').value.trim());
  await DB.setSetting('telegramChatId', document.getElementById('telegramChatId').value.trim());
  showToast('Dane Telegram zapisane');
});

document.getElementById('testTelegramBtn') && document.getElementById('testTelegramBtn').addEventListener('click', async () => {
  // Zapisz od razu to, co jest w polach — żeby test sprawdzał to, co user właśnie wpisał
  await DB.setSetting('telegramBotToken', document.getElementById('telegramBotToken').value.trim());
  await DB.setSetting('telegramChatId', document.getElementById('telegramChatId').value.trim());
  const resultEl = document.getElementById('telegramTestResult');
  resultEl.textContent = 'Wysyłanie...';
  const result = await sendTelegramNotification('✅ ZSZD Higiena: to jest wiadomość testowa. Jeśli ją widzisz, powiadomienia działają poprawnie.');
  resultEl.textContent = result.ok
    ? '✅ Wysłano — sprawdź Telegram.'
    : `❌ Nie udało się wysłać: ${result.error}`;
});

function szdWhatsAppLink(number, text) {
  const digits = (number || '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

async function renderSecurityLog() {
  const wrap = document.getElementById('securityLogList');
  if (!wrap) return;
  const numberInput = document.getElementById('securityWhatsAppNumber');
  if (numberInput) numberInput.value = await DB.getSetting('securityWhatsAppNumber', '');
  const tokenInput = document.getElementById('telegramBotToken');
  const chatIdInput = document.getElementById('telegramChatId');
  if (tokenInput) tokenInput.value = await DB.getSetting('telegramBotToken', '');
  if (chatIdInput) chatIdInput.value = await DB.getSetting('telegramChatId', '');

  const log = (await DB.getSecurityLog()).slice().reverse(); // najnowsze na górze
  if (!log.length) {
    wrap.innerHTML = '<div class="hint">Brak zdarzeń — nic podejrzanego się nie działo.</div>';
    return;
  }
  const number = await DB.getSetting('securityWhatsAppNumber', '');
  wrap.innerHTML = log.slice(0, 50).map(ev => {
    const czas = new Date(ev.at).toLocaleString('pl');
    if (ev.type === 'lockout') {
      const tekst = `⚠️ ZSZD Higiena: konto "${ev.username}" zablokowane po 3 nieudanych próbach logowania (${czas}).`;
      const waBtn = number
        ? `<a class="btn secondary" style="padding:4px 10px;font-size:12px;" href="${szdWhatsAppLink(number, tekst)}" target="_blank" rel="noopener">📤 WhatsApp</a>`
        : '';
      return `<div class="storage-row" style="margin-bottom:4px;">
        <span>🔒 <strong>Blokada konta "${escapeHtml(ev.username)}"</strong><br><span style="font-size:12px;color:var(--text-dim);">${czas}</span></span>
        ${waBtn}
      </div>`;
    }
    return `<div class="storage-row" style="margin-bottom:4px;">
      <span>⚠️ Nieudana próba logowania — "${escapeHtml(ev.username)}" (próba ${ev.attempt}/3)<br><span style="font-size:12px;color:var(--text-dim);">${czas}</span></span>
    </div>`;
  }).join('');
}

document.getElementById('saveSecurityWhatsAppBtn') && document.getElementById('saveSecurityWhatsAppBtn').addEventListener('click', async () => {
  const raw = document.getElementById('securityWhatsAppNumber').value.trim();
  await DB.setSetting('securityWhatsAppNumber', raw);
  await renderSecurityLog();
  showToast(raw ? 'Numer zapisany' : 'Numer wyczyszczony');
});

document.getElementById('clearSecurityLogBtn') && document.getElementById('clearSecurityLogBtn').addEventListener('click', async () => {
  if (!confirm('Wyczyścić cały dziennik zdarzeń bezpieczeństwa?')) return;
  await DB.clearSecurityLog();
  await renderSecurityLog();
  showToast('Dziennik wyczyszczony');
});

function showHome() {
  document.getElementById('homeScreen').style.display = 'flex';
  MODULES.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.body.style.paddingBottom = '0';
}

function openModule(moduleName) {
  if (!userCanAccessModule(moduleName)) {
    showToast('Brak dostępu do tego modułu — zapytaj administratora.');
    return;
  }
  document.getElementById('homeScreen').style.display = 'none';
  MODULES.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.body.style.paddingBottom = '80px';

  if (moduleName === 'nadziewarki') {
    document.getElementById('moduleNadziewarki').style.display = 'block';
    switchTab('machines');
    document.getElementById('addMachineFab').style.display = 'flex';
    document.getElementById('addDeviceFab') && (document.getElementById('addDeviceFab').style.display = 'none');
    // Odśwież listy — dane mogły się zmienić w innym module albo po imporcie
    if (typeof renderMachineList === 'function') renderMachineList();
    if (typeof renderPartsList === 'function') renderPartsList();
    if (typeof renderDurList === 'function') renderDurList();
  } else if (moduleName === 'satelity') {
    document.getElementById('moduleSatelity').style.display = 'block';
    switchTab('devices');
    document.getElementById('addMachineFab').style.display = 'none';
    document.getElementById('addDeviceFab') && (document.getElementById('addDeviceFab').style.display = 'flex');
    if (typeof renderDeviceList === 'function') renderDeviceList();
  } else if (moduleName === 'obecnosc') {
    document.getElementById('moduleObecnosc').style.display = 'block';
    switchTab('obsAttendance');
    document.getElementById('addMachineFab').style.display = 'none';
    document.getElementById('addDeviceFab') && (document.getElementById('addDeviceFab').style.display = 'none');
    if (typeof initAttendanceView === 'function') initAttendanceView();
    if (typeof renderEmployeeList === 'function') renderEmployeeList();
    if (typeof renderLeaveList === 'function') renderLeaveList();
    if (typeof renderObsStats === 'function') renderObsStats();
    if (typeof renderCalendarActiveView === 'function') renderCalendarActiveView();
  } else if (moduleName === 'szkolenia') {
    document.getElementById('moduleSzkolenia').style.display = 'block';
    document.getElementById('addMachineFab').style.display = 'none';
    document.getElementById('addDeviceFab') && (document.getElementById('addDeviceFab').style.display = 'none');
    if (typeof initSzkolenia === 'function') initSzkolenia();
  } else if (moduleName === 'harmCodzienny') {
    document.getElementById('moduleHarmCodzienny').style.display = 'block';
    switchTab('harmCodzDzien');
    document.getElementById('addMachineFab').style.display = 'none';
    document.getElementById('addDeviceFab') && (document.getElementById('addDeviceFab').style.display = 'none');
    if (typeof initHarmCodzienny === 'function') initHarmCodzienny();
  } else if (moduleName === 'harmCykliczny') {
    document.getElementById('moduleHarmCykliczny').style.display = 'block';
    switchTab('harmCyklDzien');
    document.getElementById('addMachineFab').style.display = 'none';
    document.getElementById('addDeviceFab') && (document.getElementById('addDeviceFab').style.display = 'none');
    if (typeof initHarmCykliczny === 'function') initHarmCykliczny();
  } else if (moduleName === 'ustawienia') {
    document.getElementById('moduleUstawienia').style.display = 'block';
    document.getElementById('addMachineFab').style.display = 'none';
    document.getElementById('addDeviceFab') && (document.getElementById('addDeviceFab').style.display = 'none');
    // Ten moduł ma tylko jeden wewnętrzny "widok" (view-appSettings), ale switchView()
    // wywołane w KTÓRYMKOLWIEK innym module globalnie zdejmuje klasę "active" ze
    // WSZYSTKICH .view na stronie — bez poniższej linii, po dłuższej pracy w innym
    // module ten widok zostawał ukryty na zawsze (pusty ekran mimo widocznego modułu).
    switchView('appSettings');
    renderStorageInfo();
    renderAutoBackupsList();
    if (currentUser && currentUser.isAdmin && typeof renderUsersList === 'function') renderUsersList();
    if (typeof fillNewUserBrygadzistaSelect === 'function') fillNewUserBrygadzistaSelect();
    if (typeof loadDriveFolderSetting === 'function') loadDriveFolderSetting();
    if (typeof loadAppShareUrlSetting === 'function') loadAppShareUrlSetting();
    if (typeof renderSecurityLog === 'function') renderSecurityLog();
    if (typeof renderKategorieList === 'function') renderKategorieList();
    if (typeof renderMigrationStatus === 'function') renderMigrationStatus();
    if (typeof renderPendingUploadBanner === 'function') renderPendingUploadBanner();
  } else if (moduleName === 'centrala') {
    document.getElementById('moduleCentrala').style.display = 'block';
    document.getElementById('addMachineFab').style.display = 'none';
    document.getElementById('addDeviceFab') && (document.getElementById('addDeviceFab').style.display = 'none');
    // Ten sam powód co wyżej w Ustawieniach — bez tego wywołania widok Centrali
    // zostawał trwale ukryty po przełączeniu jakiejkolwiek zakładki gdzie indziej.
    switchView('centrala');
    centralaDetailBrygadzistaId = null;
    renderCentrala();
    if (typeof fillStarterBrygadzistaSelect === 'function') fillStarterBrygadzistaSelect();
    if (typeof loadDriveFolderSetting === 'function') loadDriveFolderSetting();
    renderLeaveApprovalList();
    renderDecisionsToSendList();
  } else if (moduleName === 'magazyn') {
    document.getElementById('moduleMagazyn').style.display = 'block';
    // Brygadzista (rola "Stanowisko") ma w Magazynie dostęp wyłącznie do
    // Zużycia — reszta zakładek (Stan magazynowy, Baza produktów, Przyjęcia,
    // Wydania, Zamówienia) to widok administracyjny, nie dla stanowiska w terenie.
    const ograniczDoZuzycia = currentUser && currentUser.role === 'obszar';
    document.querySelectorAll('#tabsMagazyn .tab-btn').forEach(btn => {
      btn.style.display = (ograniczDoZuzycia && btn.dataset.view !== 'magZuzycie') ? 'none' : '';
    });
    switchTab(ograniczDoZuzycia ? 'magZuzycie' : 'magStock');
    document.getElementById('addMachineFab').style.display = 'none';
    document.getElementById('addDeviceFab') && (document.getElementById('addDeviceFab').style.display = 'none');
    document.getElementById('addProductFab').style.display = 'flex';
    renderMagStock();
  }
}

// Kafelki ekranu powitalnego
document.querySelectorAll('.home-tile[data-goto]').forEach(tile => {
  tile.addEventListener('click', () => {
    if (tile.classList.contains('tile-soon')) return;
    openModule(tile.dataset.goto);
  });
});

// Przyciski powrotu do menu
document.querySelectorAll('.back-to-home').forEach(btn => {
  btn.addEventListener('click', () => showHome());
});

// ===== Etykieta wersji aplikacji (tytuł okna, stopka, hint w Ustawieniach) =====
// JEDNO źródło prawdy: stała poniżej. Aktualizowana automatycznie przy każdym
// pakowaniu paczki (skrypt wersjonujący), więc UI nigdy nie pokazuje starego
// numeru tak jak się to zdarzyło wcześniej przy ręcznej edycji w trzech miejscach.
const PWA_BUILD_VERSION = 'v144';
function applyBuildVersionLabel(label) {
  const title = document.getElementById('pageTitle');
  if (title) title.textContent = `ZSZD Higiena ADMIN ${label}`;
  const foot = document.getElementById('buildVersionLabel');
  if (foot) foot.textContent = `ADMIN ${label}`;
  const hint = document.getElementById('buildVersionHint');
  if (hint) hint.textContent = `ZSZD Higiena ADMIN ${label} — moduły: Nadziewarki, Satelity, Obecność, Magazyn, Centrala. Logowanie i uprawnienia na poziomie tego urządzenia. Aplikacja PWA, działa offline, instalowalna na Androidzie i Windows 11.`;
}
applyBuildVersionLabel(PWA_BUILD_VERSION);
// W wersji desktopowej etykieta jest dodatkowo nadpisywana prawdziwym numerem
// z package.json (przez ZSZD_DESKTOP.getVersion) — to jedyne źródło, które nie
// zależy od tego, czy ktoś zaktualizował stałą powyżej.
if (window.ZSZD_DESKTOP && typeof window.ZSZD_DESKTOP.getVersion === 'function') {
  window.ZSZD_DESKTOP.getVersion().then(v => {
    if (v) applyBuildVersionLabel(`${PWA_BUILD_VERSION} (desktop ${v})`);
  }).catch(() => {});
}

// Start z ekranem powitalnym
showHome();

// ===== Init =====
async function init() {
  state.machines = await DB.getMachines();
  state.reviews = await DB.getAllReviews();
  state.durEntries = await DB.getAllDur();
  state.parts = await DB.getAllParts();
  state.checklist = await DB.getSetting('checklist', null);
  if (!state.checklist) {
    state.checklist = DEFAULT_CHECKLIST.slice();
    await DB.setSetting('checklist', state.checklist);
  }

  document.getElementById('reviewDate').value = todayStr();
  document.getElementById('durDate').value = todayStr();

  renderMachineList();
  renderMachineSelects();
  renderDurList();
  renderPartsList();
  renderChecklistSettings();
  renderStorageInfo();
}

function machineLocationLabel(m) {
  const parts = [];
  if (m.hala) parts.push('Hala ' + m.hala);
  if (m.nrLinii) parts.push('Linia ' + m.nrLinii);
  if (m.nrStanowiska) parts.push('Stanowisko ' + m.nrStanowiska);
  return parts.length ? parts.join(' • ') : 'Brak danych lokalizacji';
}

// ===== MACHINES =====
function renderMachineStats() {
  const total = state.machines.length;
  const today = todayStr();
  const reviewedToday = new Set(state.reviews.filter(r => r.date === today).map(r => r.machineId)).size;
  const issuesToday = state.reviews.filter(r => r.date === today && reviewHasIssue(r)).length;

  document.getElementById('machineStats').innerHTML = `
    <div class="stat-box"><div class="num">${total}</div><div class="lbl">Nadziewarki</div></div>
    <div class="stat-box"><div class="num">${reviewedToday}</div><div class="lbl">Sprawdzone dziś</div></div>
    <div class="stat-box"><div class="num" style="color:${issuesToday>0?'var(--bad)':'var(--ok)'}">${issuesToday}</div><div class="lbl">Problemy dziś</div></div>
  `;

  updateHeaderCounter(total);
}

function updateHeaderCounter(total) {
  const counter = document.getElementById('headerCounter');
  if (!counter) return;
  counter.querySelector('.hc-num').textContent = total;
  counter.querySelector('.hc-lbl').textContent = total === 1 ? 'NADZIEWARKA' : 'NADZIEWAREK';
}

function reviewHasIssue(review) {
  return (review.faults || []).length > 0;
}

function lastReviewForMachine(machineId) {
  const list = state.reviews.filter(r => r.machineId === machineId).sort((a,b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  return list[0] || null;
}

function renderMachineList() {
  renderMachineStats();
  const container = document.getElementById('machineList');
  const empty = document.getElementById('machinesEmpty');

  if (state.machines.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const sorted = state.machines.slice().sort((a,b) => a.name.localeCompare(b.name, 'pl'));

  container.innerHTML = sorted.map(m => {
    const last = lastReviewForMachine(m.id);
    let badge = '<span class="badge neutral">Brak przeglądów</span>';
    if (last) {
      if (reviewHasIssue(last)) badge = `<span class="badge bad">Problem (${fmtDate(last.date)})</span>`;
      else badge = `<span class="badge ok">OK (${fmtDate(last.date)})</span>`;
    }
    return `
      <div class="machine-item" data-id="${m.id}">
        <div>
          <div class="mname">${escapeHtml(m.name)}${m.nrNadziewarki ? ' <span style="color:var(--text-dim);font-weight:500;">#' + escapeHtml(m.nrNadziewarki) + '</span>' : ''}</div>
          <div class="mmeta">${escapeHtml(machineLocationLabel(m))}</div>
        </div>
        ${badge}
      </div>
    `;
  }).join('');

  container.querySelectorAll('.machine-item').forEach(el => {
    el.addEventListener('click', () => openMachineDetail(el.dataset.id));
  });
}

function renderMachineSelects() {
  const selects = [document.getElementById('durMachine'), document.getElementById('partEventMachine')].filter(Boolean);
  const sorted = state.machines.slice().sort((a,b) => a.name.localeCompare(b.name, 'pl'));
  selects.forEach(sel => {
    const current = sel.value;
    sel.innerHTML = '<option value="">— nie przypisano —</option>' +
      sorted.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    sel.value = current;
  });
}

// Add machine modal
document.getElementById('addMachineFab').addEventListener('click', () => openMachineModal(null));

function openMachineModal(machineId) {
  state.editingMachineId = machineId;
  const titleEl = document.getElementById('machineModalTitle');
  const delBtn = document.getElementById('deleteMachineBtn');
  const qrBtn = document.getElementById('showQrBtn');

  if (machineId) {
    const m = state.machines.find(x => x.id === machineId);
    titleEl.textContent = 'Edytuj nadziewarkę';
    document.getElementById('machineName').value = m.name || '';
    document.getElementById('machineNr').value = m.nrNadziewarki || '';
    document.getElementById('machineHala').value = m.hala || '';
    document.getElementById('machineLinia').value = m.nrLinii || '';
    document.getElementById('machineStanowisko').value = m.nrStanowiska || '';
    document.getElementById('machineNote').value = m.note || '';
    delBtn.style.display = 'inline-block';
    qrBtn.style.display = 'inline-block';
  } else {
    titleEl.textContent = 'Nowa nadziewarka';
    document.getElementById('machineName').value = '';
    document.getElementById('machineNr').value = '';
    document.getElementById('machineHala').value = '';
    document.getElementById('machineLinia').value = '';
    document.getElementById('machineStanowisko').value = '';
    document.getElementById('machineNote').value = '';
    delBtn.style.display = 'none';
    qrBtn.style.display = 'none';
  }
  document.getElementById('machineModalOverlay').classList.add('active');
}
function closeMachineModal() {
  document.getElementById('machineModalOverlay').classList.remove('active');
  state.editingMachineId = null;
}
document.getElementById('closeMachineModal').addEventListener('click', closeMachineModal);
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. Zamykanie: closeMachineModal()
document.getElementById('showQrBtn').addEventListener('click', () => {
  if (state.editingMachineId) openQrModal(state.editingMachineId);
});

document.getElementById('saveMachineBtn').addEventListener('click', async () => {
  const name = document.getElementById('machineName').value.trim();
  if (!name) { showToast('Podaj nazwę nadziewarki'); return; }

  let machine;
  let isNew = false;
  if (state.editingMachineId) {
    machine = state.machines.find(m => m.id === state.editingMachineId);
  } else {
    machine = {};
    isNew = true;
  }
  machine.name = name;
  machine.nrNadziewarki = document.getElementById('machineNr').value.trim();
  machine.hala = document.getElementById('machineHala').value.trim();
  machine.nrLinii = document.getElementById('machineLinia').value.trim();
  machine.nrStanowiska = document.getElementById('machineStanowisko').value.trim();
  machine.note = document.getElementById('machineNote').value.trim();

  await DB.saveMachine(machine);

  if (isNew) {
    state.machines.push(machine);
  }
  renderMachineList();
  renderMachineSelects();
  if (isNew) {
    openMachineModal(null); // zostaw okno otwarte, gotowe na kolejną nadziewarkę
    showToast('Nadziewarka zapisana — możesz dodać kolejną');
  } else {
    closeMachineModal();
    showToast('Nadziewarka zapisana');
  }
});

document.getElementById('deleteMachineBtn').addEventListener('click', async () => {
  if (!state.editingMachineId) return;
  if (!confirm('Usunąć tę nadziewarkę? Powiązane przeglądy pozostaną w historii, ale bez aktywnego profilu maszyny.')) return;
  await DB.deleteMachine(state.editingMachineId);
  state.machines = state.machines.filter(m => m.id !== state.editingMachineId);
  closeMachineModal();
  renderMachineList();
  renderMachineSelects();
  switchTab('machines');
  showToast('Nadziewarka usunięta');
});

// ===== MACHINE DETAIL =====
function openMachineDetail(machineId) {
  state.currentMachineId = machineId;
  const m = state.machines.find(x => x.id === machineId);
  if (!m) return;

  document.getElementById('machineDetailHeader').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <h2 style="margin-bottom:4px;">${escapeHtml(m.name)}${m.nrNadziewarki ? ' <span style="color:var(--text-dim);font-weight:500;font-size:14px;">#' + escapeHtml(m.nrNadziewarki) + '</span>' : ''}</h2>
        <div class="hint">${escapeHtml(machineLocationLabel(m))}</div>
        ${m.note ? `<div class="hint" style="margin-top:6px;">${escapeHtml(m.note)}</div>` : ''}
      </div>
      <div style="display:flex;gap:8px;">
        <button class="icon-btn" id="qrMachineBtn" title="Kod QR">⊞</button>
        <button class="icon-btn" id="editMachineBtn" title="Edytuj">✏️</button>
      </div>
    </div>
  `;
  document.getElementById('editMachineBtn').addEventListener('click', () => openMachineModal(machineId));
  document.getElementById('qrMachineBtn').addEventListener('click', () => openQrModal(machineId));

  document.getElementById('reviewDate').value = todayStr();
  renderChecklistInputs();
  document.getElementById('reviewNote').value = '';
  renderReviewHistory(machineId);

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-machine-detail').classList.add('active');
}

document.getElementById('backToMachines').addEventListener('click', () => {
  switchTab('machines');
});

// ===== CHECKLIST (review form) =====
let currentFaults = new Set();

function renderChecklistInputs() {
  currentFaults = new Set();
  const container = document.getElementById('checklistContainer');

  if (state.checklist.length === 0) {
    container.innerHTML = '<div class="hint">Katalog usterek jest pusty. Dodaj pierwsze usterki w Ustawieniach.</div>';
    return;
  }

  container.innerHTML = state.checklist.map((item, idx) => `
    <label class="fault-checkbox-item" data-idx="${idx}">
      <input type="checkbox" data-fault-name="${escapeHtml(item)}">
      <div class="fctext">${escapeHtml(item)}</div>
    </label>
  `).join('');

  container.querySelectorAll('.fault-checkbox-item').forEach(el => {
    const checkbox = el.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => {
      const name = checkbox.dataset.faultName;
      if (checkbox.checked) {
        currentFaults.add(name);
        el.classList.add('checked');
      } else {
        currentFaults.delete(name);
        el.classList.remove('checked');
      }
    });
  });
}

document.getElementById('saveReviewBtn').addEventListener('click', async () => {
  const date = document.getElementById('reviewDate').value;
  if (!date) { showToast('Wybierz datę przeglądu'); return; }
  if (!state.currentMachineId) return;

  const review = {
    machineId: state.currentMachineId,
    date,
    faults: Array.from(currentFaults),
    note: document.getElementById('reviewNote').value.trim()
  };
  const saved = await DB.saveReview(review);
  state.reviews.push(saved);

  renderReviewHistory(state.currentMachineId);
  renderChecklistInputs();
  document.getElementById('reviewNote').value = '';
  showToast(review.faults.length ? 'Przegląd zapisany — odnotowano usterki' : 'Przegląd zapisany — bez usterek');
});

function renderReviewHistory(machineId) {
  const list = state.reviews
    .filter(r => r.machineId === machineId)
    .sort((a,b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  const container = document.getElementById('reviewHistory');
  const empty = document.getElementById('reviewsEmpty');

  if (list.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = list.map(r => {
    const faults = r.faults || [];
    const hasIssue = faults.length > 0;
    const faultsHtml = hasIssue
      ? faults.map(f => `<div style="font-size:12.5px;color:var(--bad);"><span style="font-weight:700;">✕</span> ${escapeHtml(f)}</div>`).join('')
      : `<div style="font-size:12.5px;color:var(--ok);"><span style="font-weight:700;">✓</span> Bez usterek</div>`;

    return `
      <div class="history-entry ${hasIssue ? 'has-issue' : 'all-ok'}">
        <div class="hdate">${fmtDate(r.date)} ${hasIssue ? '⚠️' : '✅'}</div>
        <div style="margin-top:6px;">${faultsHtml}</div>
        ${r.note ? `<div class="hsummary" style="margin-top:6px;">${escapeHtml(r.note)}</div>` : ''}
        <div style="margin-top:8px;">
          <button class="btn small danger" data-review-id="${r.id}">Usuń</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-review-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Usunąć ten przegląd?')) return;
      await DB.deleteReview(btn.dataset.reviewId);
      state.reviews = state.reviews.filter(r => r.id !== btn.dataset.reviewId);
      renderReviewHistory(machineId);
      renderMachineList();
    });
  });
}

// ===== CHECKLIST SETTINGS =====
function renderChecklistSettings() {
  const container = document.getElementById('checklistSettingsList');
  container.innerHTML = state.checklist.map((item, idx) => `
    <div class="checklist-item">
      <div class="ctext">${escapeHtml(item)}</div>
      <button class="btn small danger" data-remove-idx="${idx}">Usuń</button>
    </div>
  `).join('');

  container.querySelectorAll('[data-remove-idx]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.removeIdx);
      if (state.checklist.length <= 1) { showToast('Musi zostać przynajmniej 1 punkt'); return; }
      if (!confirm('Usunąć ten punkt checklisty? Nie wpłynie to na już zapisane przeglądy.')) return;
      state.checklist.splice(idx, 1);
      await DB.setSetting('checklist', state.checklist);
      renderChecklistSettings();
      showToast('Punkt usunięty');
    });
  });
}

document.getElementById('addChecklistItemBtn').addEventListener('click', async () => {
  const input = document.getElementById('newChecklistItem');
  const val = input.value.trim();
  if (!val) return;
  state.checklist.push(val);
  await DB.setSetting('checklist', state.checklist);
  input.value = '';
  renderChecklistSettings();
  showToast('Punkt dodany');
});

// ===== DUR REGISTRY =====
document.getElementById('saveDurBtn').addEventListener('click', async () => {
  const partName = document.getElementById('durPartName').value.trim();
  const date = document.getElementById('durDate').value;
  if (!partName) { showToast('Podaj nazwę części'); return; }
  if (!date) { showToast('Wybierz datę'); return; }

  const entry = {
    partName,
    qty: parseInt(document.getElementById('durQty').value) || 1,
    date,
    status: document.getElementById('durStatus').value,
    machineId: document.getElementById('durMachine').value || null,
    note: document.getElementById('durNote').value.trim()
  };
  const saved = await DB.saveDur(entry);
  state.durEntries.push(saved);

  document.getElementById('durPartName').value = '';
  document.getElementById('durQty').value = '1';
  document.getElementById('durNote').value = '';
  document.getElementById('durDate').value = todayStr();

  renderDurList();
  showToast('Wpis DUR zapisany');
});

function machineName(machineId) {
  if (!machineId) return null;
  const m = state.machines.find(x => x.id === machineId);
  return m ? m.name : null;
}

function renderDurList() {
  const statusFilter = document.getElementById('durFilterStatus').value;
  const search = document.getElementById('durFilterSearch').value.toLowerCase();

  let list = state.durEntries.slice().sort((a,b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  if (statusFilter) list = list.filter(d => d.status === statusFilter);
  if (search) list = list.filter(d => d.partName.toLowerCase().includes(search));

  const container = document.getElementById('durList');
  const empty = document.getElementById('durEmpty');

  if (list.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = list.map(d => {
    const statusLabel = d.status === 'naprawa' ? 'Do naprawy' : 'Do utylizacji';
    const statusClass = d.status === 'naprawa' ? 'warn' : 'bad';
    const mName = machineName(d.machineId);
    return `
      <div class="part-card">
        <div class="part-info">
          <div class="pname">${escapeHtml(d.partName)} <span class="badge ${statusClass}">${statusLabel}</span></div>
          <div class="pmeta">
            Ilość: ${d.qty} • ${fmtDate(d.date)}
            ${mName ? ' • ' + escapeHtml(mName) : ''}
            ${d.note ? '<br>' + escapeHtml(d.note) : ''}
          </div>
        </div>
        <button class="btn small danger" data-dur-id="${d.id}" style="align-self:flex-start;">Usuń</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-dur-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Usunąć ten wpis z rejestru DUR?')) return;
      await DB.deleteDur(btn.dataset.durId);
      state.durEntries = state.durEntries.filter(d => d.id !== btn.dataset.durId);
      renderDurList();
    });
  });
}

document.getElementById('durFilterStatus').addEventListener('change', renderDurList);
document.getElementById('durFilterSearch').addEventListener('input', renderDurList);

// ===== PARTS DATABASE =====
let pendingPartPhoto = null;
let editingPartId = null;
let currentPartHistoryId = null;

document.getElementById('partPhoto').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) { pendingPartPhoto = null; return; }
  const dataUrl = await fileToDataUrl(file);
  pendingPartPhoto = dataUrl;
  const preview = document.getElementById('partPhotoPreview');
  preview.src = dataUrl;
  preview.style.display = 'block';
});

function resetPartForm() {
  editingPartId = null;
  document.getElementById('partFormTitle').textContent = 'Nowa część w bazie';
  document.getElementById('savePartBtn').textContent = 'Zapisz część';
  document.getElementById('cancelPartEditBtn').style.display = 'none';
  document.getElementById('partName').value = '';
  document.getElementById('partNote').value = '';
  document.getElementById('partPhoto').value = '';
  document.getElementById('partPhotoPreview').style.display = 'none';
  pendingPartPhoto = null;
}

function openPartForEdit(partId) {
  const p = state.parts.find(x => x.id === partId);
  if (!p) return;
  editingPartId = partId;
  document.getElementById('partFormTitle').textContent = 'Edytuj część';
  document.getElementById('savePartBtn').textContent = 'Zapisz zmiany';
  document.getElementById('cancelPartEditBtn').style.display = 'inline-block';

  document.getElementById('partName').value = p.name || '';
  document.getElementById('partNote').value = p.note || '';
  document.getElementById('partPhoto').value = '';
  pendingPartPhoto = null;
  const preview = document.getElementById('partPhotoPreview');
  if (p.photo) {
    preview.src = p.photo;
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }

  document.getElementById('partFormTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('cancelPartEditBtn').addEventListener('click', resetPartForm);

document.getElementById('savePartBtn').addEventListener('click', async () => {
  const name = document.getElementById('partName').value.trim();
  if (!name) { showToast('Podaj nazwę części'); return; }

  let part;
  let isNew = false;
  if (editingPartId) {
    part = state.parts.find(p => p.id === editingPartId);
    if (!part) { resetPartForm(); return; }
  } else {
    part = {};
    isNew = true;
  }

  part.name = name;
  if (pendingPartPhoto) part.photo = pendingPartPhoto;
  part.note = document.getElementById('partNote').value.trim();

  const saved = await DB.savePart(part);
  if (isNew) state.parts.push(saved);

  const wasEditing = !!editingPartId;
  resetPartForm();
  renderPartsList();
  showToast(wasEditing ? 'Część zaktualizowana' : 'Część zapisana — dodaj teraz zdarzenia (zamówienie, przyjęcie...)');
});

// ----- Zdarzenia części (historia) -----
function partLatestMachineId(part) {
  const events = DB.sortedPartEvents(part).filter(e => e.type === 'installed' && e.machineId);
  return events.length ? events[events.length - 1].machineId : null;
}

function partLatestEventSummary(part) {
  const events = DB.sortedPartEvents(part);
  if (!events.length) return 'Brak zdarzeń';
  const last = events[events.length - 1];
  return `${DB.PART_EVENT_TYPES[last.type]} — ${fmtDate(last.date)}`;
}

function renderPartsList() {
  const search = document.getElementById('partFilterSearch').value.toLowerCase();
  const eventTypeFilter = document.getElementById('partFilterEventType').value;
  const dateFrom = document.getElementById('partFilterDateFrom').value;
  const dateTo = document.getElementById('partFilterDateTo').value;

  let list = state.parts.slice().sort((a,b) => b.createdAt - a.createdAt);

  // Wyszukiwanie po nazwie — zawsze działa niezależnie
  if (search) list = list.filter(p => p.name.toLowerCase().includes(search));

  // Filtr po typie zdarzenia LUB datach — ukrywa części bez pasujących zdarzeń
  // ale TYLKO gdy użytkownik aktywnie wybrał filtr (nie domyślne puste wartości)
  const hasEventFilter = eventTypeFilter !== '';
  const hasDateFilter = dateFrom !== '' || dateTo !== '';

  if (hasEventFilter || hasDateFilter) {
    list = list.filter(p => {
      const events = p.events || [];
      if (events.length === 0) return !hasEventFilter; // bez zdarzeń: ukryj tylko gdy filtr typu aktywny
      return events.some(e => {
        if (hasEventFilter && e.type !== eventTypeFilter) return false;
        if (dateFrom && e.date < dateFrom) return false;
        if (dateTo && e.date > dateTo) return false;
        return true;
      });
    });
  }

  const container = document.getElementById('partsList');
  const empty = document.getElementById('partsEmpty');

  if (list.length === 0) {
    container.innerHTML = '';
    const hasAnyFilter = search || eventTypeFilter !== '' || dateFrom || dateTo;
    const msgEl = document.getElementById('partsEmptyMsg');
    if (msgEl) msgEl.textContent = hasAnyFilter
      ? 'Brak części pasujących do filtrów. Kliknij "✕ Wyczyść filtry" aby zobaczyć wszystkie.'
      : 'Baza części jest pusta.';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = list.map(p => {
    const mId = partLatestMachineId(p);
    const mName = mId ? machineName(mId) : null;
    const leadTime = DB.calcLeadTimeDays(p);
    return `
      <div class="part-card">
        ${p.photo ? `<img src="${p.photo}" alt="">` : '<div class="no-photo">Brak zdjęcia</div>'}
        <div class="part-info">
          <div class="pname">${escapeHtml(p.name)}</div>
          <div class="pmeta">
            ${escapeHtml(partLatestEventSummary(p))}
            ${mName ? '<br>Ostatnio w: ' + escapeHtml(mName) : ''}
            ${leadTime !== null ? '<br>Czas realizacji zamówienia: ' + leadTime + ' dni' : ''}
            ${p.note ? '<br>' + escapeHtml(p.note) : ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-self:flex-start;">
          <button class="btn small secondary" data-part-history="${p.id}">Historia</button>
          <button class="btn small secondary" data-part-edit="${p.id}">Edytuj</button>
          <button class="btn small danger" data-part-id="${p.id}">Usuń</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-part-history]').forEach(btn => {
    btn.addEventListener('click', () => openPartHistory(btn.dataset.partHistory));
  });
  container.querySelectorAll('[data-part-edit]').forEach(btn => {
    btn.addEventListener('click', () => openPartForEdit(btn.dataset.partEdit));
  });
  container.querySelectorAll('[data-part-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Usunąć tę część z bazy? Usunie to również całą jej historię zdarzeń.')) return;
      await DB.deletePart(btn.dataset.partId);
      state.parts = state.parts.filter(p => p.id !== btn.dataset.partId);
      if (editingPartId === btn.dataset.partId) resetPartForm();
      renderPartsList();
    });
  });
}

document.getElementById('clearPartsFiltersBtn').addEventListener('click', () => {
  document.getElementById('partFilterSearch').value = '';
  document.getElementById('partFilterEventType').value = '';
  document.getElementById('partFilterDateFrom').value = '';
  document.getElementById('partFilterDateTo').value = '';
  renderPartsList();
});

document.getElementById('partFilterSearch').addEventListener('input', renderPartsList);
document.getElementById('partFilterEventType').addEventListener('change', renderPartsList);
document.getElementById('partFilterDateFrom').addEventListener('change', renderPartsList);
document.getElementById('partFilterDateTo').addEventListener('change', renderPartsList);

// ----- Part history modal -----
function openPartHistory(partId) {
  currentPartHistoryId = partId;
  const p = state.parts.find(x => x.id === partId);
  if (!p) return;

  document.getElementById('partHistoryTitle').textContent = 'Historia: ' + p.name;

  const leadTime = DB.calcLeadTimeDays(p);
  document.getElementById('partHistoryLeadTime').textContent = leadTime !== null
    ? `Czas realizacji ostatniego zamówienia: ${leadTime} dni (zamówienie → przyjęcie na stan)`
    : '';

  renderPartHistoryList();
  document.getElementById('partHistoryModalOverlay').classList.add('active');
}

function renderPartHistoryList() {
  const p = state.parts.find(x => x.id === currentPartHistoryId);
  if (!p) return;
  const events = DB.sortedPartEvents(p).slice().reverse(); // newest first

  const container = document.getElementById('partHistoryList');
  const empty = document.getElementById('partHistoryEmpty');

  if (events.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = events.map(e => {
    const mName = e.machineId ? machineName(e.machineId) : null;
    return `
      <div class="history-entry">
        <div class="hdate">${fmtDate(e.date)} — ${escapeHtml(DB.PART_EVENT_TYPES[e.type] || e.type)}${e.qty ? ' — <strong>' + e.qty + ' szt.</strong>' : ''}</div>
        ${mName ? `<div class="hsummary">Nadziewarka: ${escapeHtml(mName)}</div>` : ''}
        ${e.note ? `<div class="hsummary">${escapeHtml(e.note)}</div>` : ''}
        <div style="margin-top:6px;">
          <button class="btn small danger" data-event-id="${e.id}">Usuń zdarzenie</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-event-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Usunąć to zdarzenie z historii?')) return;
      p.events = (p.events || []).filter(e => e.id !== btn.dataset.eventId);
      await DB.savePart(p);
      renderPartHistoryList();
      renderPartsList();
    });
  });
}

document.getElementById('closePartHistoryModal').addEventListener('click', () => {
  document.getElementById('partHistoryModalOverlay').classList.remove('active');
});
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. (partHistoryModalOverlay)

// ----- Add part event modal -----
// Dynamiczna etykieta ilości zależna od typu zdarzenia (Nadziewarki)
function updatePartEventQtyLabel(type) {
  const label = document.getElementById('partEventQtyLabel');
  if (type === 'order') label.textContent = 'Ilość zamówiona (szt.)';
  else if (type === 'received') label.textContent = 'Ilość przyjęta na stan (szt.)';
  else if (type === 'installed') label.textContent = 'Ilość zamontowana (szt.)';
  else if (type === 'dur') label.textContent = 'Ilość przekazana do DUR (szt.)';
}

document.getElementById('partEventType').addEventListener('change', (e) => {
  updatePartEventQtyLabel(e.target.value);
});

function resetPartEventForm() {
  document.getElementById('partEventType').value = 'order';
  document.getElementById('partEventDate').value = todayStr();
  document.getElementById('partEventQty').value = '1';
  document.getElementById('partEventMachine').value = '';
  document.getElementById('partEventNote').value = '';
  updatePartEventQtyLabel('order');
}
document.getElementById('addPartEventBtn').addEventListener('click', () => {
  resetPartEventForm();
  document.getElementById('partEventModalOverlay').classList.add('active');
});
document.getElementById('closePartEventModal').addEventListener('click', () => {
  document.getElementById('partEventModalOverlay').classList.remove('active');
});
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. (partEventModalOverlay)

document.getElementById('savePartEventBtn').addEventListener('click', async () => {
  const p = state.parts.find(x => x.id === currentPartHistoryId);
  if (!p) return;
  const date = document.getElementById('partEventDate').value;
  if (!date) { showToast('Wybierz datę'); return; }

  const event = {
    type: document.getElementById('partEventType').value,
    date,
    qty: parseInt(document.getElementById('partEventQty').value) || 1,
    machineId: document.getElementById('partEventMachine').value || null,
    note: document.getElementById('partEventNote').value.trim()
  };
  DB.addPartEvent(p, event);
  await DB.savePart(p);

  renderPartHistoryList();
  renderPartsList();
  resetPartEventForm(); // zostaw okno otwarte, gotowe na kolejne zdarzenie
  showToast('Zdarzenie dodane — możesz dodać kolejne');
});

// ===== EXCEL EXPORT =====
document.getElementById('exportBtn').addEventListener('click', async () => {
  if (typeof XLSX === 'undefined') {
    showToast('Ładowanie modułu Excel...');
    await loadXLSXLib();
  }
  exportToExcel();
});

function loadXLSXLib() {
  return new Promise((resolve, reject) => {
    if (typeof XLSX !== 'undefined') return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function exportToExcel() {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Machines
  const machinesData = state.machines.map(m => ({
    'Nazwa': m.name,
    'Nr nadziewarki': m.nrNadziewarki || '',
    'Hala': m.hala || '',
    'Nr linii': m.nrLinii || '',
    'Nr stanowiska': m.nrStanowiska || '',
    'Notatka': m.note || ''
  }));
  const wsMachines = XLSX.utils.json_to_sheet(machinesData);
  XLSX.utils.book_append_sheet(wb, wsMachines, 'Nadziewarki');

  // Sheet 2: Reviews
  const reviewsData = state.reviews
    .sort((a,b) => b.date.localeCompare(a.date))
    .map(r => {
      const faults = r.faults || [];
      return {
        'Nadziewarka': machineName(r.machineId) || '(usunięta)',
        'Data': fmtDate(r.date),
        'Status': faults.length ? 'PROBLEM' : 'OK',
        'Stwierdzone usterki': faults.length ? faults.join('; ') : 'Bez usterek',
        'Notatka': r.note || ''
      };
    });
  const wsReviews = XLSX.utils.json_to_sheet(reviewsData);
  XLSX.utils.book_append_sheet(wb, wsReviews, 'Przeglądy');

  // Sheet 3: DUR
  const durData = state.durEntries
    .sort((a,b) => b.date.localeCompare(a.date))
    .map(d => ({
      'Część': d.partName,
      'Ilość': d.qty,
      'Data': fmtDate(d.date),
      'Status': d.status === 'naprawa' ? 'Do naprawy' : 'Do utylizacji',
      'Nadziewarka': machineName(d.machineId) || '',
      'Notatka': d.note || ''
    }));
  const wsDur = XLSX.utils.json_to_sheet(durData);
  XLSX.utils.book_append_sheet(wb, wsDur, 'Rejestr DUR');

  // Sheet 4: Parts events (jeden wiersz = jedno zdarzenie, dla pełnej filtrowalności w Excelu)
  const partsEventsData = [];
  state.parts.forEach(p => {
    const events = DB.sortedPartEvents(p);
    if (events.length === 0) {
      partsEventsData.push({
        'Część': p.name,
        'Typ zdarzenia': '(brak zdarzeń)',
        'Data': '',
        'Nadziewarka': '',
        'Notatka zdarzenia': '',
        'Notatka części': p.note || ''
      });
    } else {
      events.forEach(e => {
        partsEventsData.push({
          'Część': p.name,
          'Typ zdarzenia': DB.PART_EVENT_TYPES[e.type] || e.type,
          'Data': fmtDate(e.date),
          'Ilość': e.qty || 1,
          'Nadziewarka': e.machineId ? (machineName(e.machineId) || '') : '',
          'Notatka zdarzenia': e.note || '',
          'Notatka części': p.note || ''
        });
      });
    }
  });
  const wsParts = XLSX.utils.json_to_sheet(partsEventsData);
  XLSX.utils.book_append_sheet(wb, wsParts, 'Baza części');

  // ===== Moduł Satelity (jeśli załadowany) =====
  if (typeof satState !== 'undefined') {
    // Sheet 5: Devices (Satelity + Inżektory)
    const devicesData = satState.devices.map(d => ({
      'Typ': deviceTypeLabel(d.type),
      'Nazwa': d.name,
      'Numer': d.nr || '',
      'Producent': d.manufacturer || '',
      'Lokalizacja': d.location || '',
      'Notatka': d.note || ''
    }));
    const wsDevices = XLSX.utils.json_to_sheet(devicesData);
    XLSX.utils.book_append_sheet(wb, wsDevices, 'Satelity i Inżektory');

    // Sheet 6: Parts stock events (jeden wiersz = jedno zdarzenie)
    const stockEventsData = [];
    satState.partsStock.forEach(p => {
      const events = DB.sortedPartEvents(p);
      if (events.length === 0) {
        stockEventsData.push({
          'Część': p.name,
          'Stan aktualny': p.quantity,
          'Typ zdarzenia': '(brak zdarzeń)',
          'Data': '',
          'Urządzenie': '',
          'Notatka zdarzenia': '',
          'Notatka części': p.note || ''
        });
      } else {
        events.forEach(e => {
          const dev = e.deviceId ? satState.devices.find(x => x.id === e.deviceId) : null;
          stockEventsData.push({
            'Część': p.name,
            'Stan aktualny': p.quantity,
            'Typ zdarzenia': DB.PART_EVENT_TYPES[e.type] || e.type,
            'Data': fmtDate(e.date),
            'Ilość': e.qty || 1,
            'Urządzenie': dev ? deviceDisplayName(dev) : '',
            'Notatka zdarzenia': e.note || '',
            'Notatka części': p.note || ''
          });
        });
      }
    });
    const wsStock = XLSX.utils.json_to_sheet(stockEventsData);
    XLSX.utils.book_append_sheet(wb, wsStock, 'Części zamienne (Satelity)');

    // Sheet 7: Pre + Post service reports combined (raporty z bieżących napraw)
    const serviceReportsData = [];
    satState.preServiceReports.forEach(r => {
      const dev = satState.devices.find(d => d.id === r.deviceId);
      serviceReportsData.push({
        'Typ raportu': 'Przed-serwisowy',
        'Urządzenie': dev ? deviceDisplayName(dev) : '(usunięte)',
        'Data': fmtDate(r.date),
        'Firma serwisująca': '',
        'Stwierdzone usterki': (r.faults || []).join('; '),
        'Opis / szczegóły': r.problems || '',
        'Części': (r.partsToReplace || []).join('; '),
        'Notatka': r.note || ''
      });
    });
    satState.postServiceReports.forEach(r => {
      const dev = satState.devices.find(d => d.id === r.deviceId);
      const company = r.companyType === 'zewnetrzny' ? (r.companyName || 'Firma zewnętrzna') : 'Serwis wewnętrzny';
      serviceReportsData.push({
        'Typ raportu': 'Po-serwisowy',
        'Urządzenie': dev ? deviceDisplayName(dev) : '(usunięte)',
        'Data': fmtDate(r.date),
        'Firma serwisująca': company,
        'Opis / problemy': r.work || '',
        'Części': (r.parts || []).map(p => p.name + ' x' + p.qty).join('; '),
        'Notatka': r.note || ''
      });
    });
    serviceReportsData.sort((a, b) => b.Data.localeCompare(a.Data));
    const wsServiceReports = XLSX.utils.json_to_sheet(serviceReportsData);
    XLSX.utils.book_append_sheet(wb, wsServiceReports, 'Raporty serwisowe');

    // Sheet 8: Handover protocols
    const handoverData = satState.handoverProtocols.map(h => {
      const dev = satState.devices.find(d => d.id === h.deviceId);
      return {
        'Urządzenie': dev ? deviceDisplayName(dev) : '(usunięte)',
        'Data': fmtDate(h.date),
        'Firma przyjmująca': h.company || '',
        'Część': h.partName,
        'Powód przekazania': h.reason || '',
        'Przekazujący': h.fromPerson || '',
        'Przyjmujący': h.toPerson || ''
      };
    }).sort((a, b) => b.Data.localeCompare(a.Data));
    const wsHandover = XLSX.utils.json_to_sheet(handoverData);
    XLSX.utils.book_append_sheet(wb, wsHandover, 'Protokoły przekazania');
  }

  XLSX.writeFile(wb, `zszd-higieny-${todayStr()}.xlsx`);
  showToast('Eksport do Excel zakończony');
}

// ===== QR CODES =====
function loadQRLib() {
  return new Promise((resolve, reject) => {
    if (typeof qrcode !== 'undefined') return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Brak internetu — biblioteka QR wymaga jednorazowego połączenia, aby pobrać się do pamięci podręcznej.'));
    document.head.appendChild(script);
  });
}

function machineQrText(m) {
  // Czytelny tekst pod kodem QR + zakodowany w samym kodzie (link do profilu, jeśli appka jest online)
  const idLine = [m.name, m.nrNadziewarki ? '#' + m.nrNadziewarki : ''].filter(Boolean).join(' ');
  const locLine = machineLocationLabel(m);
  return { idLine, locLine };
}

async function openQrModal(machineId) {
  const m = state.machines.find(x => x.id === machineId);
  if (!m) return;

  const canvasContainer = document.getElementById('qrCodeCanvas');
  canvasContainer.innerHTML = '<div style="padding:30px;color:#64748b;font-size:13px;">Generowanie...</div>';
  document.getElementById('qrModalOverlay').classList.add('active');

  const { idLine, locLine } = machineQrText(m);
  document.getElementById('qrLabel').textContent = idLine;
  document.getElementById('qrSubLabel').textContent = locLine;

  try {
    await loadQRLib();
    // Link do profilu maszyny w aplikacji (działa po wdrożeniu na Netlify, gdy appka jest online)
    const payload = `${location.origin}${location.pathname}#machine=${encodeURIComponent(m.id)}`;
    const qr = qrcode(0, 'M'); // type 0 = auto-size, EC level M
    qr.addData(payload);
    qr.make();
    canvasContainer.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 4 });
  } catch (err) {
    canvasContainer.innerHTML = `<div style="padding:20px;color:#b91c1c;font-size:12.5px;">${escapeHtml(err.message)}</div>`;
  }
}

document.getElementById('closeQrModal').addEventListener('click', () => {
  document.getElementById('qrModalOverlay').classList.remove('active');
});
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. (qrModalOverlay)

document.getElementById('printQrBtn').addEventListener('click', () => {
  const printArea = document.getElementById('qrPrintArea').outerHTML;
  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>Naklejka - kod QR</title>
    <style>
      body{display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:-apple-system,Arial,sans-serif;}
      @media print { body{height:auto;padding:20px;} }
    </style>
    </head><body>${printArea}</body></html>
  `);
  w.document.close();
  setTimeout(() => { w.print(); }, 350);
});

// ===== STORAGE / PERSISTENCE / UPDATES =====
function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

async function renderStorageInfo() {
  // Storage usage estimate
  const usageText = document.getElementById('storageUsageText');
  const barFill = document.getElementById('storageBarFill');
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const { usage, quota } = await navigator.storage.estimate();
      const usageMB = formatMB(usage || 0);
      const quotaMB = formatMB(quota || 0);
      usageText.textContent = `${usageMB} MB / ${quotaMB} MB`;
      const pct = quota ? Math.min(100, (usage / quota) * 100) : 0;
      barFill.style.width = pct + '%';
    } catch (e) {
      usageText.textContent = 'niedostępne';
    }
  } else {
    usageText.textContent = 'niedostępne w tej przeglądarce';
  }

  // Persistent storage status
  await renderPersistButton();
}

async function renderPersistButton() {
  const btn = document.getElementById('persistBtn');
  const hint = document.getElementById('persistHint');
  if (!navigator.storage || !navigator.storage.persisted) {
    btn.textContent = '🔒 Trwałe przechowywanie: niedostępne w tej przeglądarce';
    btn.disabled = true;
    return;
  }
  const isPersisted = await navigator.storage.persisted();
  if (isPersisted) {
    btn.textContent = '🔒 Trwałe przechowywanie: WŁ';
    hint.textContent = 'Dane nie zostaną automatycznie usunięte przez system pod presją miejsca na dysku.';
    btn.disabled = true;
  } else {
    btn.textContent = '🔓 Trwałe przechowywanie: WYŁ — kliknij, aby włączyć';
    hint.textContent = 'Włączenie poprosi przeglądarkę o niezależne traktowanie danych tej aplikacji.';
    btn.disabled = false;
  }
}

document.getElementById('persistBtn').addEventListener('click', async () => {
  if (!navigator.storage || !navigator.storage.persist) {
    showToast('Funkcja niedostępna w tej przeglądarce');
    return;
  }
  const granted = await navigator.storage.persist();
  await renderPersistButton();
  showToast(granted ? 'Trwałe przechowywanie włączone' : 'Przeglądarka odmówiła — spróbuj zainstalować aplikację jako PWA');
});

document.getElementById('checkUpdateBtn').addEventListener('click', async () => {
  if (!('serviceWorker' in navigator)) {
    showToast('Service Worker niedostępny w tej przeglądarce');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      showToast('Brak zarejestrowanego Service Workera');
      return;
    }
    showToast('Sprawdzanie aktualizacji...');
    await reg.update();
    setTimeout(() => {
      showToast('Sprawdzono. Jeśli była aktualizacja, odśwież stronę.');
    }, 800);
  } catch (e) {
    showToast('Błąd sprawdzania aktualizacji');
  }
});

// ===== BACKUP / RESTORE (WSZYSTKIE MODUŁY, ŁĄCZNIE Z PRZYSZŁYMI) =====
function downloadBackupFile(backup, filename) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

document.getElementById('exportBackupBtn').addEventListener('click', async () => {
  const backup = await DB.exportAllData();
  downloadBackupFile(backup, `serwis-higieny-backup-${todayStr()}.json`);
  showToast('Kopia zapasowa (wszystkie moduły) wyeksportowana');
});

document.getElementById('importBackupBtn').addEventListener('click', () => {
  document.getElementById('importBackupFile').click();
});

document.getElementById('importBackupFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm('Import zastąpi aktualne dane WSZYSTKICH modułów (Nadziewarki, Satelity, Obecność) danymi z pliku. Kontynuować?')) return;

  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    await DB.importAllData(backup);
    showToast('Dane zaimportowane — odświeżanie...');
    setTimeout(() => location.reload(), 700);
  } catch (err) {
    alert('Błąd importu: ' + err.message);
  }
  e.target.value = '';
});

document.getElementById('wipeDataBtn').addEventListener('click', async () => {
  if (!confirm('Czy na pewno chcesz usunąć WSZYSTKIE dane wszystkich modułów (Nadziewarki, Satelity, Obecność)? Tej operacji nie można odwrócić.')) return;
  if (!confirm('To jest ostateczne potwierdzenie. Usunąć wszystko?')) return;

  await DB.wipeAllData();
  showToast('Wszystkie dane zostały usunięte — odświeżanie...');
  setTimeout(() => location.reload(), 700);
});

// ===== SKRÓT "🆘 POMOC" NA EKRANIE GŁÓWNYM (dla ról z importu pliku) =====
// Te same akcje co wyżej (importBackupBtn/wipeDataBtn), tylko dostępne od
// razu na pierwszym ekranie — dla kogoś, kto nie zna menu Ustawień.
document.getElementById('homeSendToCentralaBtn') && document.getElementById('homeSendToCentralaBtn').addEventListener('click', () => sendToCentrala(false));

document.getElementById('homeImportBackupBtn') && document.getElementById('homeImportBackupBtn').addEventListener('click', () => {
  document.getElementById('homeImportBackupFile').click();
});
document.getElementById('homeImportBackupFile') && document.getElementById('homeImportBackupFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm('To zastąpi wszystko, co jest teraz w tej aplikacji, danymi z pliku. Kontynuować?')) { e.target.value = ''; return; }

  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    await DB.importAllData(backup);
    showToast('Dane wczytane — odświeżanie...');
    setTimeout(() => location.reload(), 700);
  } catch (err) {
    alert('Nie udało się wczytać pliku: ' + err.message);
  }
  e.target.value = '';
});

document.getElementById('homeWipeDataBtn') && document.getElementById('homeWipeDataBtn').addEventListener('click', async () => {
  if (!confirm('Czy na pewno chcesz usunąć WSZYSTKO z tej aplikacji? Tej operacji nie można cofnąć.')) return;
  if (!confirm('To jest ostateczne potwierdzenie. Usunąć wszystko?')) return;

  await DB.wipeAllData();
  showToast('Wszystko usunięte — odświeżanie...');
  setTimeout(() => location.reload(), 700);
});

// ===== AUTOMATYCZNE KOPIE ZAPASOWE =====
let autoBackupTimer = null;

async function renderAutoBackupsList() {
  const wrap = document.getElementById('autoBackupsList');
  if (!wrap) return;
  const backups = await DB.getAutoBackups();
  if (!backups.length) {
    wrap.innerHTML = '<div class="hint">Brak automatycznych kopii — pojawią się po włączeniu automatycznego backupu.</div>';
    return;
  }
  wrap.innerHTML = backups.map(b => `
    <div class="storage-row" style="margin-bottom:6px;">
      <span>🕒 ${formatDateTime(b.createdAt)}</span>
      <span>
        <button class="btn secondary" data-restore-auto="${b.id}" style="margin-right:6px;">Przywróć</button>
        <button class="btn secondary" data-download-auto="${b.id}">Pobierz</button>
      </span>
    </div>
  `).join('');
}

document.getElementById('autoBackupsList').addEventListener('click', async (e) => {
  const restoreId = e.target.dataset.restoreAuto;
  const downloadId = e.target.dataset.downloadAuto;
  if (restoreId) {
    if (!confirm('Przywrócić tę automatyczną kopię? Nadpisze to aktualne dane wszystkich modułów.')) return;
    const backups = await DB.getAutoBackups();
    const entry = backups.find(b => b.id === restoreId);
    if (!entry) return;
    await DB.importAllData(entry.backup);
    showToast('Dane przywrócone — odświeżanie...');
    setTimeout(() => location.reload(), 700);
  } else if (downloadId) {
    const backups = await DB.getAutoBackups();
    const entry = backups.find(b => b.id === downloadId);
    if (!entry) return;
    const stamp = new Date(entry.createdAt).toISOString().slice(0, 16).replace(/[:T]/g, '-');
    downloadBackupFile(entry.backup, `auto-backup-${stamp}.json`);
  }
});

function updateAutoBackupHint(minutes) {
  const hint = document.getElementById('autoBackupHint');
  if (!hint) return;
  hint.textContent = minutes > 0
    ? `Kopia zapasowa wszystkich modułów będzie tworzona automatycznie co ${minutes} min, dopóki aplikacja jest otwarta w przeglądarce (przeglądarki nie pozwalają na backup w tle, gdy aplikacja jest zamknięta). Ostatnie 24 kopie są zachowywane lokalnie.`
    : 'Automatyczna kopia zapasowa jest wyłączona — możesz nadal wykonać kopię ręcznie przyciskiem powyżej.';
}

function scheduleAutoBackup(minutes) {
  if (autoBackupTimer) clearInterval(autoBackupTimer);
  autoBackupTimer = null;
  if (!minutes || minutes <= 0) return;
  autoBackupTimer = setInterval(async () => {
    await DB.saveAutoBackup();
    await renderAutoBackupsList();
  }, minutes * 60 * 1000);
}

async function setupAutoBackup() {
  const sel = document.getElementById('autoBackupIntervalSel');
  if (!sel) return;

  const savedMinutes = await DB.getSetting('autoBackupIntervalMinutes', 60);
  sel.value = String(savedMinutes);
  updateAutoBackupHint(savedMinutes);

  // Kopia "doganiająca" — jeśli minął interwał od ostatniej automatycznej kopii
  // (np. aplikacja była zamknięta), zrób jedną od razu.
  if (savedMinutes > 0) {
    const backups = await DB.getAutoBackups();
    const last = backups[0];
    const ageMinutes = last ? (Date.now() - last.createdAt) / 60000 : Infinity;
    if (!last || ageMinutes >= savedMinutes) {
      await DB.saveAutoBackup();
    }
  }
  scheduleAutoBackup(savedMinutes);

  sel.addEventListener('change', async () => {
    const minutes = parseInt(sel.value, 10);
    await DB.setSetting('autoBackupIntervalMinutes', minutes);
    updateAutoBackupHint(minutes);
    scheduleAutoBackup(minutes);
    showToast(minutes > 0 ? `Automatyczny backup ustawiony co ${minutes} min` : 'Automatyczny backup wyłączony');
  });

  await renderAutoBackupsList();
}

setupAutoBackup();

// ===== CENTRALA: WYSYŁKA DANYCH (STRONA BRYGADZISTY) =====
let autoSendTimer = null;

async function updateLastSentHint() {
  const hint = document.getElementById('lastSentHint');
  if (!hint) return;
  const lastSentAt = await DB.getSetting('lastSentAt', null);
  hint.textContent = lastSentAt
    ? `Ostatnia wysyłka: ${formatDateTime(new Date(lastSentAt).getTime())}`
    : 'Jeszcze nie wysłano żadnych danych do centrali.';
}

async function updateSendAsHint() {
  const hint = document.getElementById('sendAsHint');
  if (!hint || !currentUser) return;
  hint.textContent = `Wysyłasz jako: ${currentUser.displayName || currentUser.username} (login: ${currentUser.username})`;
}

// Buduje paczkę zgłoszenia do centrali (ten sam kształt niezależnie od tego,
// czy trafi do pliku, czy zostanie wysłana automatycznie przez internet) —
// wyodrębnione, żeby OBIE drogi wysyłki zawsze budowały IDENTYCZNE dane,
// bez ryzyka, że kiedyś zaczną się rozjeżdżać.
async function buildCentralaSubmissionPackage() {
  if (!currentUser) return null;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  let pkg, filename;

  if (currentUser.role) {
    // Zalogowany przez wczytany plik konfiguracyjny (brygadzista/koordynator/
    // admin-telefon) — wyślij dokładnie tak, jak robiła to dawna osobna
    // wersja dla telefonu, żeby Centrala poprawnie powiązała zgłoszenie z
    // właściwą osobą.
    pkg = await DB.buildSubmissionPackage(currentUser.username);
    if (currentUser.brygadzistaEntryId) pkg.brygadzista.entryId = currentUser.brygadzistaEntryId;
    if (currentUser.koordynatorEntryId) pkg.brygadzista.koordynatorEntryId = currentUser.koordynatorEntryId;
    if (currentUser.obszarId) pkg.brygadzista.obszarId = currentUser.obszarId;
    if (currentUser.obszarShift) pkg.brygadzista.shift = currentUser.obszarShift;
    pkg.brygadzista.role = currentUser.role;
    const safeId = pkg.brygadzista.id.replace(/[^a-z0-9]+/gi, '_');
    filename = `centrala-bryg-${safeId}-${stamp}.json`;
  } else {
    // Zalogowany przez prawdziwe konto z hasłem — to nadzór (koordynator/
    // kierownik/administrator).
    const senderRole = currentUser.isAdmin ? 'Administrator' : 'Nadzór';
    pkg = await DB.buildSubmissionPackage(currentUser.username, { senderType: 'nadzor', senderRole });
    const safeId = pkg.brygadzista.id.replace(/[^a-z0-9]+/gi, '_');
    filename = `centrala-nadzor-${safeId}-${stamp}.json`;
  }
  return { pkg, filename };
}

async function sendToCentrala(auto = false) {
  if (!currentUser) return;
  const built = await buildCentralaSubmissionPackage();
  const { pkg, filename } = built;

  if (auto) {
    // TRYB AUTOMATYCZNY: cicho zapisz plik (bez okna udostępniania) i powiadom,
    // żeby użytkownik wrzucił go do wspólnego folderu.
    downloadBackupFile(pkg, filename);
    await DB.setSetting('lastSentAt', new Date().toISOString());
    await DB.setSetting('pendingUploadFile', filename);
    await updateLastSentHint();
    await renderPendingUploadBanner();
    notifyPackageReady(filename);
    return;
  }

  // TRYB RĘCZNY: okno udostępniania (WhatsApp/e-mail/Drive) albo pobranie pliku
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  let shared = false;
  const file = new File([blob], filename, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Dane dla centrali — ZSZD Higieny',
        text: `Dane od nadzoru: ${pkg.brygadzista.name}`
      });
      shared = true;
    } catch (e) {
      if (e.name === 'AbortError') { shared = true; }
    }
  }
  if (!shared) {
    downloadBackupFile(pkg, filename);
  }

  await DB.setSetting('lastSentAt', new Date().toISOString());
  await DB.setSetting('pendingUploadFile', '');
  await updateLastSentHint();
  await renderPendingUploadBanner();
  showToast('Dane przygotowane do wysłania');
}

// Powiadomienie systemowe: paczka gotowa, wrzuć do wspólnego folderu
function notifyPackageReady(filename) {
  const body = 'Plik zapisany w Pobranych. Wrzuć go do wspólnego folderu centrali.';
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('Paczka danych gotowa', { body, icon: 'icons/icon-192.png' });
    } catch (e) {}
  }
  showToast('Paczka danych przygotowana — wrzuć plik do folderu centrali');
}

// Baner w Ustawieniach: przypomina o niewrzuconej paczce
async function renderPendingUploadBanner() {
  const el = document.getElementById('pendingUploadBanner');
  if (!el) return;
  const pending = await DB.getSetting('pendingUploadFile', '');
  if (!pending) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `
    <div style="font-weight:700;margin-bottom:4px;">📦 Paczka czeka na wrzucenie do folderu</div>
    <div style="font-size:12.5px;margin-bottom:8px;">Plik <strong>${escapeHtml(pending)}</strong> został zapisany automatycznie. Wrzuć go do wspólnego folderu centrali.</div>
    <div class="btn-row">
      <button class="btn" id="pendingOpenFolderBtn">📂 Otwórz folder</button>
      <button class="btn secondary" id="pendingDoneBtn">Zrobione</button>
    </div>
  `;
  document.getElementById('pendingOpenFolderBtn').addEventListener('click', async () => {
    const url = await DB.getSetting('driveFolderUrl', '');
    openDriveFolder(url);
  });
  document.getElementById('pendingDoneBtn').addEventListener('click', async () => {
    await DB.setSetting('pendingUploadFile', '');
    await renderPendingUploadBanner();
    showToast('Oznaczono jako wrzucone');
  });
}

document.getElementById('sendToCentralaBtn').addEventListener('click', () => sendToCentrala(false));

// ===== WSPÓLNY FOLDER CENTRALI (Google Drive) =====
async function loadAppShareUrlSetting() {
  const url = await DB.getSetting('appShareUrl', '');
  const input = document.getElementById('appShareUrl');
  if (input) input.value = url || '';
  const hint = document.getElementById('appShareUrlHint');
  if (hint) hint.textContent = url ? 'Adres zapisany — "Udostępnij aplikację" będzie wysyłać właśnie ten link.' : 'Nie ustawiono adresu — "Udostępnij aplikację" nie zadziała, dopóki go nie wpiszesz.';
}
document.getElementById('saveAppShareUrlBtn') && document.getElementById('saveAppShareUrlBtn').addEventListener('click', async () => {
  const raw = document.getElementById('appShareUrl').value.trim();
  await DB.setSetting('appShareUrl', raw);
  await loadAppShareUrlSetting();
  showToast(raw ? 'Adres zapisany' : 'Adres wyczyszczony');
});

async function loadDriveFolderSetting() {
  const url = await DB.getSetting('driveFolderUrl', '');
  const input = document.getElementById('driveFolderUrl');
  if (input) input.value = url || '';
  const hint = document.getElementById('driveFolderHint');
  if (hint) hint.textContent = url ? 'Folder zapisany — przycisk otwiera go w nowej karcie.' : 'Brak zapisanego linku do folderu.';
  const hintC = document.getElementById('driveFolderCentralaHint');
  if (hintC) hintC.textContent = url ? '' : 'Najpierw zapisz link do folderu w module Ustawienia.';
}

function openDriveFolder(url) {
  if (!url) {
    showToast('Najpierw zapisz link do folderu w Ustawieniach');
    return;
  }
  window.open(url, '_blank', 'noopener');
}

document.getElementById('saveDriveFolderBtn') && document.getElementById('saveDriveFolderBtn').addEventListener('click', async () => {
  const raw = document.getElementById('driveFolderUrl').value.trim();
  if (raw && !/^https?:\/\//i.test(raw)) {
    showToast('Link musi zaczynać się od https://');
    return;
  }
  await DB.setSetting('driveFolderUrl', raw);
  await loadDriveFolderSetting();
  showToast(raw ? 'Link do folderu zapisany' : 'Link do folderu wyczyszczony');
});

document.getElementById('openDriveFolderBtn') && document.getElementById('openDriveFolderBtn').addEventListener('click', async () => {
  const url = await DB.getSetting('driveFolderUrl', '');
  openDriveFolder(url);
});

document.getElementById('openDriveFolderCentralaBtn') && document.getElementById('openDriveFolderCentralaBtn').addEventListener('click', async () => {
  const url = await DB.getSetting('driveFolderUrl', '');
  openDriveFolder(url);
});

function updateAutoSendHint(minutes) {
  const hint = document.getElementById('autoSendHint');
  if (!hint) return;
  hint.textContent = minutes > 0
    ? 'Raz na dobę — dopóki aplikacja jest otwierana — plik z danymi zapisze się automatycznie w Pobranych, a Ty dostaniesz powiadomienie, żeby wrzucić go do wspólnego folderu centrali.'
    : 'Automatyczne przygotowywanie danych jest wyłączone — użyj przycisku "Wyślij dane do centrali teraz", gdy chcesz przesłać dane.';
}

function scheduleAutoSend(minutes) {
  if (autoSendTimer) clearInterval(autoSendTimer);
  autoSendTimer = null;
  if (!minutes || minutes <= 0) return;
  autoSendTimer = setInterval(() => sendToCentrala(true), minutes * 60 * 1000);
}

async function setupAutoSend() {
  const sel = document.getElementById('autoSendIntervalSel');
  if (!sel || !currentUser) return;

  const savedMinutes = await DB.getSetting('autoSendIntervalMinutes', 1440);
  sel.value = String(savedMinutes);
  updateAutoSendHint(savedMinutes);
  await updateLastSentHint();

  // Wysyłka "doganiająca" — jeśli minęło więcej niż interwał od ostatniej wysyłki
  // (np. aplikacja była zamknięta przez dłuższy czas), przygotuj paczkę od razu.
  if (savedMinutes > 0) {
    const lastSentAt = await DB.getSetting('lastSentAt', null);
    const ageMinutes = lastSentAt ? (Date.now() - new Date(lastSentAt).getTime()) / 60000 : Infinity;
    if (ageMinutes >= savedMinutes) await sendToCentrala(true);
  }
  scheduleAutoSend(savedMinutes);

  sel.addEventListener('change', async () => {
    const minutes = parseInt(sel.value, 10);
    await DB.setSetting('autoSendIntervalMinutes', minutes);
    updateAutoSendHint(minutes);
    scheduleAutoSend(minutes);
  });
}

// Uwaga: setupAutoSend() jest wywoływane z onLoginSuccess() (po zalogowaniu), nie tutaj —
// wysyłka do centrali wymaga znajomości zalogowanego użytkownika.

// ===== PRZYPOMNIENIE O KOŃCU ZMIANY (na bazie zmiany wybranej w module Obecność) =====
// Ograniczenie, o którym warto pamiętać: to działa tylko dopóki aplikacja jest otwarta
// (choćby w tle na tym samym telefonie) — przeglądarka nie "budzi się" sama, gdy karta
// jest całkowicie zamknięta od dłuższego czasu. To najlepsze, co da się zrobić bez
// własnego serwera z powiadomieniami push.
let shiftReminderTimer = null;

// Zwraca najbliższy w przeszłości moment, w którym zegar wskazywał godzinę końca danej
// zmiany (działa poprawnie też dla zmian nocnych przekraczających północ).
function mostRecentShiftEnd(shiftId, now = new Date()) {
  if (typeof shiftDef !== 'function') return null;
  const def = shiftDef(shiftId);
  if (!def || !def.end) return null;
  const [h, m] = def.end.split(':').map(Number);
  const candidate = new Date(now);
  candidate.setHours(h, m, 0, 0);
  if (candidate > now) candidate.setDate(candidate.getDate() - 1);
  return candidate;
}

function shiftEndKey(shiftId, endDateTime) {
  return `${shiftId}_${endDateTime.toISOString().slice(0, 13)}`;
}

async function checkShiftEndReminder() {
  if (!currentUser) return;
  const reminderOn = await DB.getSetting('shiftReminderEnabled', false);
  if (!reminderOn) return;
  const shiftId = (typeof obsState !== 'undefined') ? obsState.currentShift : '';
  if (!shiftId) return;

  const endDT = mostRecentShiftEnd(shiftId);
  if (!endDT) return;
  const minutesSinceEnd = (Date.now() - endDT.getTime()) / 60000;
  if (minutesSinceEnd < 0 || minutesSinceEnd > 180) return; // pokazuj tylko w rozsądnym oknie do 3h po końcu zmiany

  const key = shiftEndKey(shiftId, endDT);
  const handledKey = await DB.getSetting('shiftReminderHandledKey', '');
  if (handledKey === key) return;

  showShiftEndBanner(shiftId, endDT, key);
}

function showShiftEndBanner(shiftId, endDT, key) {
  const banner = document.getElementById('shiftEndBanner');
  const text = document.getElementById('shiftEndBannerText');
  if (!banner || banner.dataset.key === key) return; // już pokazany dla tej zmiany
  banner.dataset.key = key;
  const label = (typeof shiftLabel === 'function') ? shiftLabel(shiftId) : shiftId;
  const hh = String(endDT.getHours()).padStart(2, '0');
  const mm = String(endDT.getMinutes()).padStart(2, '0');
  text.textContent = `Zmiana (${label}) zakończyła się o ${hh}:${mm} — wyślij dane do centrali.`;
  banner.style.display = 'block';

  DB.getSetting('shiftReminderNotifEnabled', false).then(notifOn => {
    if (notifOn && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification('Koniec zmiany', { body: 'Wyślij dane do centrali w ZSZD Higieny.', icon: 'icons/icon-192.png' }); } catch (e) {}
    }
  });
}

document.getElementById('shiftEndSendBtn').addEventListener('click', async () => {
  const banner = document.getElementById('shiftEndBanner');
  const key = banner.dataset.key;
  await sendToCentrala(false);
  if (key) await DB.setSetting('shiftReminderHandledKey', key);
  banner.style.display = 'none';
});

document.getElementById('shiftEndDismissBtn').addEventListener('click', () => {
  // "Później" — chowa baner tylko na tę sesję, przy kolejnym sprawdzeniu (np. po ponownym
  // otwarciu apki w oknie 3h) przypomnienie może się pojawić ponownie.
  document.getElementById('shiftEndBanner').style.display = 'none';
});

async function setupShiftReminder() {
  const toggle = document.getElementById('shiftReminderToggle');
  const notifToggle = document.getElementById('shiftReminderNotifToggle');
  if (!toggle || !notifToggle) return;

  toggle.checked = await DB.getSetting('shiftReminderEnabled', false);
  notifToggle.checked = await DB.getSetting('shiftReminderNotifEnabled', false);

  toggle.addEventListener('change', async () => {
    await DB.setSetting('shiftReminderEnabled', toggle.checked);
    if (toggle.checked) checkShiftEndReminder();
  });

  notifToggle.addEventListener('change', async () => {
    if (notifToggle.checked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { notifToggle.checked = false; showToast('Przeglądarka nie dała zgody na powiadomienia'); }
    }
    await DB.setSetting('shiftReminderNotifEnabled', notifToggle.checked);
  });

  checkShiftEndReminder();
  if (shiftReminderTimer) clearInterval(shiftReminderTimer);
  shiftReminderTimer = setInterval(checkShiftEndReminder, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkShiftEndReminder();
  });
}

// ===== CENTRALA: ODBIÓR I PRZEGLĄD DANYCH BRYGADZISTÓW (STRONA SZEFA) =====
let centralaDetailBrygadzistaId = null; // null = widok listy, w przeciwnym razie widok szczegółów

document.getElementById('importSubmissionBtn').addEventListener('click', () => {
  document.getElementById('importSubmissionFile').click();
});

document.getElementById('importSubmissionFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const pkg = JSON.parse(text);
    if (!pkg || !pkg.stores || !pkg.brygadzista || !pkg.brygadzista.id) {
      alert('To nie jest prawidłowa paczka danych z brygadzisty (brak kodu brygadzisty w pliku).');
      return;
    }
    const entry = await DB.saveCentralSubmission(pkg);
    showToast(`Odebrano dane od: ${entry.brygadzistaName}`);
    await renderCentrala();
    await renderLeaveApprovalList();
  } catch (err) {
    alert('Błąd wczytywania pliku: ' + err.message);
  }
  e.target.value = '';
});

// Czytelne nazwy magazynów danych w podsumowaniu paczki
const STORE_LABELS = {
  attendanceRecords: 'obecność',
  employees: 'pracownicy',
  brygadzisciList: 'brygadziści',
  koordynatorzy: 'koordynatorzy',
  obszary: 'obszary',
  leaveRequests: 'urlopy',
  machines: 'maszyny',
  reviews: 'przeglądy',
  durEntries: 'DUR',
  parts: 'części',
  partsStock: 'stan części',
  devices: 'satelity',
  preServiceReports: 'raporty przed',
  postServiceReports: 'raporty po',
  handoverProtocols: 'protokoły',
  magProducts: 'towary',
  magReceipts: 'przyjęcia',
  magIssues: 'wydania',
  magOrders: 'zamówienia',
  szkolenia: 'szkolenia'
};

function storeCountsSummary(payload) {
  if (!payload || !payload.stores) return '';
  const parts = Object.keys(payload.stores)
    .filter(k => Array.isArray(payload.stores[k]) && payload.stores[k].length > 0)
    .map(k => `${STORE_LABELS[k] || k}: ${payload.stores[k].length}`);

  // Zużycie towarów to wydania ze znacznikiem zrodlo:'zuzycie' — pokaż osobno
  const issues = payload.stores.magIssues;
  if (Array.isArray(issues)) {
    const zuz = issues.filter(i => i && i.zrodlo === 'zuzycie').length;
    if (zuz) parts.push(`zużycie: ${zuz}`);
  }
  return parts.join(' · ');
}

async function renderCentrala() {
  if (typeof renderCentralaObecnosc === 'function') renderCentralaObecnosc();
  const wrap = document.getElementById('centralaContent');
  const empty = document.getElementById('centralaEmpty');
  if (!wrap) return;
  const all = await DB.getCentralSubmissions();

  if (!all.length) {
    wrap.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  if (centralaDetailBrygadzistaId === null) {
    // Widok listy — pogrupowane po nadawcy, z rozróżnieniem brygadzysta / nadzór
    const groups = {};
    for (const s of all) {
      if (!groups[s.brygadzistaId]) groups[s.brygadzistaId] = [];
      groups[s.brygadzistaId].push(s);
    }
    const rows = Object.keys(groups).map(bid => {
      const list = groups[bid];
      const latest = list[0];
      const isNadzor = latest.senderType === 'nadzor';
      const icon = isNadzor ? '🧭' : '👷';
      const roleLabel = latest.senderRole || (isNadzor ? 'Nadzór' : 'Brygadzista');
      const badgeColor = isNadzor ? 'var(--accent2)' : 'var(--accent)';
      return {
        isNadzor,
        html: `
        <div class="storage-row" style="margin-bottom:8px;">
          <span>${icon} <strong>${latest.brygadzistaName}</strong>
            <span style="font-size:11px;font-weight:700;color:${badgeColor};border:1px solid ${badgeColor};border-radius:4px;padding:1px 6px;margin-left:4px;">${escapeHtml(roleLabel)}</span>
            <br>
            <span style="font-size:12px;color:var(--text-dim);">${list.length} przesyłek · ostatnia: ${formatDateTime(latest.receivedAt)}</span>
          </span>
          <button class="btn secondary" data-open-brygadzista="${bid}">Szczegóły</button>
        </div>`
      };
    });
    // Nadzór na górze, brygadziści niżej
    const nadzorRows = rows.filter(r => r.isNadzor).map(r => r.html).join('');
    const brygRows = rows.filter(r => !r.isNadzor).map(r => r.html).join('');
    wrap.innerHTML =
      (nadzorRows ? `<div style="font-size:12px;font-weight:800;color:var(--accent2);text-transform:uppercase;letter-spacing:.5px;margin:4px 0 8px;">🧭 Nadzór (koordynatorzy / kierownicy)</div>${nadzorRows}` : '') +
      (brygRows ? `<div style="font-size:12px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:.5px;margin:14px 0 8px;">👷 Brygadziści</div>${brygRows}` : '');
  } else {
    // Widok szczegółów jednego brygadzisty
    const list = all.filter(s => s.brygadzistaId === centralaDetailBrygadzistaId);
    const name = list.length ? list[0].brygadzistaName : '';
    wrap.innerHTML = `
      <div style="margin-bottom:10px;">
        <button class="btn secondary" data-back-brygadzista="1">← Wróć do listy brygadzistów</button>
      </div>
      <div class="hint" style="margin-bottom:10px;"><strong>${name}</strong> <span style="font-size:12px;">[kod: ${centralaDetailBrygadzistaId}]</span> — historia przesyłek:</div>
      ${list.map(s => `
        <div class="storage-row" style="margin-bottom:6px;flex-direction:column;align-items:flex-start;gap:6px;">
          <span>🕒 ${formatDateTime(s.receivedAt)} <span style="font-size:12px;color:var(--text-dim);">(wysłano: ${formatDateTime(new Date(s.submittedAt).getTime())})</span></span>
          <span style="font-size:12px;color:var(--text-dim);">${storeCountsSummary(s.payload)}</span>
          <span>
            <button class="btn secondary" data-restore-submission="${s.id}" style="margin-right:6px;">Wczytaj do bazy roboczej</button>
            <button class="btn secondary" data-download-submission="${s.id}" style="margin-right:6px;">Pobierz</button>
            <button class="btn danger" data-delete-submission="${s.id}">Usuń</button>
          </span>
        </div>
      `).join('')}
    `;
  }
}

document.getElementById('centralaContent').addEventListener('click', async (e) => {
  const t = e.target;
  if (t.dataset.openBrygadzista) {
    centralaDetailBrygadzistaId = t.dataset.openBrygadzista;
    await renderCentrala();
  } else if (t.dataset.backBrygadzista) {
    centralaDetailBrygadzistaId = null;
    await renderCentrala();
  } else if (t.dataset.restoreSubmission) {
    if (!confirm('Wczytanie tej przesyłki NADPISZE Twoją obecną bazę roboczą (Nadziewarki, Satelity, Obecność) danymi z tej przesyłki. Kontynuować?')) return;
    const all = await DB.getCentralSubmissions();
    const entry = all.find(s => s.id === t.dataset.restoreSubmission);
    if (!entry) return;
    await DB.importAllData(entry.payload);
    showToast('Dane wczytane do bazy roboczej — odświeżanie...');
    setTimeout(() => location.reload(), 700);
  } else if (t.dataset.downloadSubmission) {
    const all = await DB.getCentralSubmissions();
    const entry = all.find(s => s.id === t.dataset.downloadSubmission);
    if (!entry) return;
    downloadBackupFile(entry.payload, `centrala-${entry.brygadzistaName}-${entry.id}.json`);
  } else if (t.dataset.deleteSubmission) {
    if (!confirm('Usunąć tę przesyłkę z bazy scentralizowanej? Danych brygadzisty na jego urządzeniu to nie dotyczy.')) return;
    await DB.deleteCentralSubmission(t.dataset.deleteSubmission);
    showToast('Przesyłka usunięta');
    await renderCentrala();
  }
});

renderCentrala();

// ===== PACZKA STARTOWA DLA BRYGADZISTY =====
async function fillStarterBrygadzistaSelect() {
  const sel = document.getElementById('starterObszar');
  if (!sel) return;
  const obszary = await DB.getObszary();
  sel.innerHTML = '<option value="">— wybierz obszar —</option>' +
    obszary.slice().sort((a, b) => (a.nazwa || '').localeCompare(b.nazwa || '', 'pl'))
      .map(o => `<option value="${o.id}">${escapeHtml(o.nazwa)}</option>`).join('');
  updateStarterObszarHint();

  const koordSel = document.getElementById('starterKoordynator');
  if (koordSel) {
    const koordList = await DB.getKoordynatorzy();
    koordSel.innerHTML = '<option value="">— wybierz koordynatora —</option>' +
      koordList.map(k => `<option value="${k.id}">${escapeHtml(k.imie)} ${escapeHtml(k.nazwisko)} (${k.typ === 'etat' ? 'Etatowy' : 'Outsourcing'})</option>`).join('');
  }

  updateStarterRoleUI();
}

// Zmiana jest teraz cechą samego obszaru (Ustawienia → Obszary) — tu tylko
// pokazujemy, jaka to zmiana, albo ostrzegamy, że jeszcze jej nie ustawiono.
function updateStarterObszarHint() {
  const hint = document.getElementById('starterObszarHint');
  const obszarSel = document.getElementById('starterObszar');
  if (!hint || !obszarSel) return;
  const obszarId = obszarSel.value;
  if (!obszarId) {
    hint.textContent = 'Paczka będzie zawierać dokładnie tę samą check-listę obecności, którą widzisz w panelu admina dla tego obszaru — brygadziści i pracownicy pojawią się automatycznie, bez wpisywania ich tutaj osobno.';
    hint.style.color = '';
    return;
  }
  const obszar = (obsState.obszary || []).find(o => o.id === obszarId);
  const shiftDef = obszar ? ALL_SHIFTS.find(s => s.id === obszar.shift) : null;
  if (shiftDef) {
    hint.textContent = `Zmiana tego obszaru: ${shiftDef.label}. Paczka automatycznie zbierze brygadzistów i pracowników tej zmiany.`;
    hint.style.color = '';
  } else {
    hint.textContent = '⚠️ Ten obszar nie ma jeszcze przypisanej zmiany — ustaw ją w Ustawieniach → Obszary, zanim wygenerujesz dla niego paczkę.';
    hint.style.color = 'var(--bad)';
  }
}
document.getElementById('starterObszar') && document.getElementById('starterObszar').addEventListener('change', updateStarterObszarHint);

function updateStarterRoleUI() {
  const role = document.getElementById('starterRole') ? document.getElementById('starterRole').value : 'obszar';
  const obszarField = document.getElementById('starterObszarField');
  const koordField = document.getElementById('starterKoordynatorField');
  const modField = document.getElementById('starterModulesField');
  const modWrap = document.getElementById('starterModulesChecklist');
  if (obszarField) obszarField.style.display = role === 'obszar' ? 'block' : 'none';
  if (koordField) koordField.style.display = role === 'koordynator' ? 'block' : 'none';
  if (modField) modField.style.display = role === 'admin' ? 'none' : 'block'; // admin dostaje wszystko bez wyboru
  if (modWrap) {
    // Bez Centrali dla stanowiska/koordynatora — admin i tak ją dostaje automatycznie
    const availableModules = ALL_MODULE_KEYS.filter(k => k !== 'centrala');
    // Dla koordynatora podpowiadamy jego zapisane, trwałe uprawnienia (Ustawienia →
    // Koordynatorzy) zamiast zawsze zaznaczać wszystko — nie każdy koordynator ma
    // mieć dostęp do wszystkiego. Wciąż można to na chwilę zmienić przy generowaniu.
    let preselected = availableModules;
    if (role === 'koordynator') {
      const koordId = document.getElementById('starterKoordynator') ? document.getElementById('starterKoordynator').value : '';
      const koord = koordId ? (obsState.koordynatorzy || []).find(k => k.id === koordId) : null;
      if (koord && Array.isArray(koord.allowedModules)) preselected = koord.allowedModules;
    }
    modWrap.innerHTML = availableModules.map(key =>
      `<label><input type="checkbox" value="${key}" ${preselected.includes(key) ? 'checked' : ''}> ${MODULE_LABELS[key] || key}</label>`
    ).join('');
  }
}
document.getElementById('starterRole') && document.getElementById('starterRole').addEventListener('change', updateStarterRoleUI);
document.getElementById('starterKoordynator') && document.getElementById('starterKoordynator').addEventListener('change', updateStarterRoleUI);

document.getElementById('generateStarterBtn') && document.getElementById('generateStarterBtn').addEventListener('click', async () => {
  const cel = document.getElementById('starterCel') ? document.getElementById('starterCel').value : 'nowa';
  const role = document.getElementById('starterRole') ? document.getElementById('starterRole').value : 'obszar';
  let entryId = null;
  if (role === 'obszar') {
    entryId = document.getElementById('starterObszar').value;
    if (!entryId) { showToast('Wybierz obszar'); return; }
  } else if (role === 'koordynator') {
    entryId = document.getElementById('starterKoordynator').value;
    if (!entryId) { showToast('Wybierz koordynatora'); return; }
  }
  const allowedModules = Array.from(document.querySelectorAll('#starterModulesChecklist input:checked')).map(cb => cb.value);
  try {
    const starter = await DB.buildBrygadzistaStarter(role, entryId, allowedModules);
    const prefix = cel === 'naprawa' ? 'naprawa' : 'paczka-startowa';
    let fname;
    if (role === 'obszar') {
      fname = `${prefix}-${starter.brygadzistaIdentity.imie}-${starter.brygadzistaIdentity.nazwisko}.json`.replace(/\s+/g, '-');
    } else if (role === 'koordynator') {
      const koord = (await DB.getKoordynatorzy()).find(k => k.id === entryId);
      fname = `${prefix}-koordynator-${koord.nazwisko}-${koord.imie}.json`.replace(/\s+/g, '-');
    } else {
      fname = `${prefix}-admin-telefon.json`;
    }
    const blob = new Blob([JSON.stringify(starter, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname; a.click();
    URL.revokeObjectURL(url);
    showToast('Plik gotowy');
    // Wyraźna instrukcja co dalej — inna dla nowej instalacji, inna dla naprawy.
    if (cel === 'naprawa') {
      alert('Plik zapisany.\n\nPrześlij go osobie na tym stanowisku (np. przez WhatsApp) i poproś, żeby na ekranie głównym aplikacji, w sekcji "🆘 Pomoc — coś nie działa?", wybrała "📥 Wczytaj dane naprawcze" i wskazała ten plik.');
    } else {
      alert('Plik zapisany.\n\nPrześlij go osobie na tym stanowisku (np. przez WhatsApp). Przy pierwszym uruchomieniu aplikacji zobaczy ekran z prośbą o wczytanie tego pliku.');
    }
  } catch (e) {
    alert('Błąd generowania paczki: ' + e.message);
  }
});

async function getPendingLeaveRequestsForReview() {
  const submissions = await DB.getCentralSubmissions();
  const latestPerPerson = {};
  submissions.forEach(s => {
    if (!latestPerPerson[s.brygadzistaId] || s.receivedAt > latestPerPerson[s.brygadzistaId].receivedAt) {
      latestPerPerson[s.brygadzistaId] = s;
    }
  });
  const decisions = await DB.getCentralDecisions();
  const decidedIds = new Set(decisions.map(d => d.leaveRequestId));

  const pending = [];
  Object.values(latestPerPerson).forEach(sub => {
    const stores = (sub.payload && sub.payload.stores) || {};
    const leaves = (stores.leaveRequests || []).filter(l => l.status === 'planned' && !decidedIds.has(l.id));
    const employees = stores.employees || [];
    leaves.forEach(l => {
      const emp = employees.find(e => e.id === l.employeeId);
      pending.push({
        ...l,
        brygadzistaId: sub.brygadzistaId,
        brygadzistaName: sub.brygadzistaName,
        employeeName: emp ? `${emp.lastName} ${emp.firstName}` : '(nieznany pracownik)'
      });
    });
  });
  return pending.sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
}

async function renderLeaveApprovalList() {
  const wrap = document.getElementById('leaveApprovalList');
  const empty = document.getElementById('leaveApprovalEmpty');
  if (!wrap) return;
  const pending = await getPendingLeaveRequestsForReview();
  if (!pending.length) {
    wrap.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  const typeLabel = (code) => (DB.ATTENDANCE_STATUSES[code] ? DB.ATTENDANCE_STATUSES[code].label : code);
  wrap.innerHTML = pending.map(l => `
    <div class="storage-row" style="margin-bottom:8px;flex-direction:column;align-items:flex-start;gap:6px;">
      <span><strong>${escapeHtml(l.employeeName)}</strong> <span style="font-size:12px;color:var(--text-dim);">(zgłosił: ${escapeHtml(l.brygadzistaName)})</span><br>
        <span style="font-size:12px;color:var(--text-dim);">${escapeHtml(typeLabel(l.type))} • ${l.dateFrom} — ${l.dateTo} • ${l.days} dni roboczych</span>
        ${l.note ? `<br><span style="font-size:12px;color:var(--text-dim);">${escapeHtml(l.note)}</span>` : ''}
      </span>
      <span>
        <button class="btn secondary" data-approve-leave="${l.id}" data-brygadzista="${l.brygadzistaId}" data-brygadzista-name="${escapeHtml(l.brygadzistaName)}" data-emp="${escapeHtml(l.employeeName)}" data-from="${l.dateFrom}" data-to="${l.dateTo}" data-type="${l.type}" style="margin-right:6px;">✅ Zatwierdź</button>
        <button class="btn danger" data-reject-leave="${l.id}" data-brygadzista="${l.brygadzistaId}" data-brygadzista-name="${escapeHtml(l.brygadzistaName)}" data-emp="${escapeHtml(l.employeeName)}" data-from="${l.dateFrom}" data-to="${l.dateTo}" data-type="${l.type}">❌ Odrzuć</button>
      </span>
    </div>
  `).join('');
}

document.getElementById('leaveApprovalList').addEventListener('click', async (e) => {
  const t = e.target;
  const leaveId = t.dataset.approveLeave || t.dataset.rejectLeave;
  if (!leaveId) return;
  const decision = t.dataset.approveLeave ? 'approved' : 'rejected';
  let note = '';
  if (decision === 'rejected') {
    note = prompt('Powód odrzucenia (opcjonalnie):') || '';
  }
  await DB.saveCentralDecision({
    leaveRequestId: leaveId,
    brygadzistaId: t.dataset.brygadzista,
    brygadzistaName: t.dataset.brygadzistaName,
    employeeName: t.dataset.emp,
    dateFrom: t.dataset.from,
    dateTo: t.dataset.to,
    type: t.dataset.type,
    decision,
    decidedBy: currentUser.username,
    decidedAt: Date.now(),
    note,
    sentAt: null
  });
  showToast(decision === 'approved' ? 'Wniosek zatwierdzony — pamiętaj, żeby wysłać decyzję niżej' : 'Wniosek odrzucony — pamiętaj, żeby wysłać decyzję niżej');
  await renderLeaveApprovalList();
  await renderDecisionsToSendList();
});

async function renderDecisionsToSendList() {
  const wrap = document.getElementById('decisionsToSendList');
  const empty = document.getElementById('decisionsToSendEmpty');
  if (!wrap) return;
  const decisions = await DB.getCentralDecisions();
  const unsent = decisions.filter(d => !d.sentAt);
  if (!unsent.length) {
    wrap.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const byPerson = {};
  unsent.forEach(d => {
    if (!byPerson[d.brygadzistaId]) byPerson[d.brygadzistaId] = { name: d.brygadzistaName, items: [] };
    byPerson[d.brygadzistaId].items.push(d);
  });

  wrap.innerHTML = Object.keys(byPerson).map(bid => {
    const group = byPerson[bid];
    const list = group.items.map(d => `<div style="font-size:12px;color:var(--text-dim);">${escapeHtml(d.employeeName)} • ${d.dateFrom} — ${d.dateTo} • ${d.decision === 'approved' ? '✅ Zatwierdzony' : '❌ Odrzucony'}</div>`).join('');
    return `
      <div class="storage-row" style="margin-bottom:8px;flex-direction:column;align-items:flex-start;gap:6px;">
        <span>👤 <strong>${escapeHtml(group.name)}</strong> — ${group.items.length} decyzji do wysłania</span>
        ${list}
        <button class="btn secondary" data-send-decisions="${bid}">📤 Wyślij decyzje do: ${escapeHtml(group.name)}</button>
      </div>
    `;
  }).join('');
}

document.getElementById('decisionsToSendList').addEventListener('click', async (e) => {
  const bid = e.target.dataset.sendDecisions;
  if (!bid) return;
  const decisions = await DB.getCentralDecisions();
  const toSend = decisions.filter(d => d.brygadzistaId === bid && !d.sentAt);
  if (!toSend.length) return;

  const pkg = {
    kind: 'centrala-decision',
    generatedAt: new Date().toISOString(),
    brygadzistaId: bid,
    decisions: toSend.map(d => ({ leaveRequestId: d.leaveRequestId, decision: d.decision, decidedBy: d.decidedBy, decidedAt: d.decidedAt, note: d.note }))
  };
  const filename = `decyzja-${bid}-${todayStr()}.json`;
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });

  if (typeof shareOrDownloadFile === 'function') {
    await shareOrDownloadFile(blob, filename, 'application/json', 'Decyzje z centrali', `Decyzje dla: ${toSend[0].brygadzistaName}`);
  } else {
    downloadBackupFile(pkg, filename);
  }

  await DB.markDecisionsSent(toSend.map(d => d.id));
  showToast('Decyzje wysłane — poczekaj, aż brygadzista wczyta je u siebie');
  await renderDecisionsToSendList();
});

renderLeaveApprovalList();
renderDecisionsToSendList();

// ===== WHATSAPP REPORT =====
document.getElementById('waReportDate').value = todayStr();

document.getElementById('genWaReportBtn').addEventListener('click', () => {
  const date = document.getElementById('waReportDate').value;
  if (!date) { showToast('Wybierz datę raportu'); return; }

  const text = generateWaReport(date);
  document.getElementById('waModalTitle').textContent = `Raport WhatsApp — ${fmtDate(date)}`;
  document.getElementById('waReportText').value = text;
  document.getElementById('waModalOverlay').classList.add('active');
});

document.getElementById('closeWaModal').addEventListener('click', () => {
  document.getElementById('waModalOverlay').classList.remove('active');
});
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. (waModalOverlay)

document.getElementById('copyWaReportBtn').addEventListener('click', () => {
  const text = document.getElementById('waReportText').value;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Skopiowano do schowka — wklej na WhatsApp');
  }).catch(() => {
    // Fallback dla starszych przeglądarek / ograniczeń uprawnień
    const ta = document.getElementById('waReportText');
    ta.select();
    document.execCommand('copy');
    showToast('Skopiowano do schowka');
  });
});

function generateWaReport(date) {
  const sorted = state.machines.slice().sort((a, b) => {
    // Sortuj po nr linii, potem stanowiska, potem nazwie
    const lineA = parseInt(a.nrLinii) || 999;
    const lineB = parseInt(b.nrLinii) || 999;
    if (lineA !== lineB) return lineA - lineB;
    const stA = parseInt(a.nrStanowiska) || 999;
    const stB = parseInt(b.nrStanowiska) || 999;
    if (stA !== stB) return stA - stB;
    return a.name.localeCompare(b.name, 'pl');
  });

  // Zbierz przeglądy z danego dnia
  const reviewsToday = state.reviews.filter(r => r.date === date);
  const reviewedIds = new Set(reviewsToday.map(r => r.machineId));

  // Dla każdej maszyny weź najnowszy przegląd z tego dnia
  const latestByMachine = {};
  reviewsToday.forEach(r => {
    if (!latestByMachine[r.machineId] || r.createdAt > latestByMachine[r.machineId].createdAt) {
      latestByMachine[r.machineId] = r;
    }
  });

  const checkedMachines = sorted.filter(m => reviewedIds.has(m.id));
  const uncheckedMachines = sorted.filter(m => !reviewedIds.has(m.id));

  if (checkedMachines.length === 0 && uncheckedMachines.length === 0) {
    return `🔧 Przegląd nadziewarek — ${fmtDate(date)}\n\nBrak maszyn w bazie.`;
  }
  if (checkedMachines.length === 0) {
    return `🔧 Przegląd nadziewarek — ${fmtDate(date)}\n\nBrak przeglądów zapisanych na ten dzień.`;
  }

  const withFaults = checkedMachines.filter(m => (latestByMachine[m.id].faults || []).length > 0);
  const withoutFaults = checkedMachines.filter(m => (latestByMachine[m.id].faults || []).length === 0);

  let lines = [];
  lines.push(`🔧 Przegląd nadziewarek — ${fmtDate(date)}`);
  lines.push('');

  // Najpierw maszyny z usterkami
  checkedMachines.forEach(m => {
    const review = latestByMachine[m.id];
    const faults = review.faults || [];

    // Buduj identyfikator maszyny
    const parts = [m.name];
    if (m.nrNadziewarki) parts.push(`#${m.nrNadziewarki}`);
    let location = [];
    if (m.nrLinii) location.push(`Linia ${m.nrLinii}`);
    if (m.nrStanowiska) location.push(`St. ${m.nrStanowiska}`);

    const id = parts.join(' ');
    const loc = location.join(' | ');

    if (faults.length > 0) {
      lines.push(`⚠️ ${id}${loc ? ' | ' + loc : ''}`);
      faults.forEach(f => lines.push(`   • ${f}`));
      if (review.note) lines.push(`   📝 ${review.note}`);
    } else {
      lines.push(`✅ ${id}${loc ? ' | ' + loc : ''} — OK`);
    }
  });

  lines.push('');
  lines.push(`Sprawdzono: ${checkedMachines.length}/${state.machines.length} maszyn | ` +
    `Usterki: ${withFaults.length}${uncheckedMachines.length > 0 ? ` | Niesprawdzone: ${uncheckedMachines.length}` : ''}`);

  return lines.join('\n');
}

// ===== START =====
init();
initAuth().finally(() => __authReadyResolve());
