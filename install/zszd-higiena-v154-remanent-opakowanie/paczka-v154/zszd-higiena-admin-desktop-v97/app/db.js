// db.js — warstwa IndexedDB dla Serwisu Nadziewarek + Satelity + Obecność
// Bazy: machines, reviews, durEntries, parts, settings,
//       devices, partsStock, preServiceReports, postServiceReports, handoverProtocols,
//       employees, attendanceRecords, leaveRequests

const DB_NAME = 'nadziewarki_serwis_db';
const DB_VERSION = 15;
let dbInstance = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('machines')) {
        const s = db.createObjectStore('machines', { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('reviews')) {
        const s = db.createObjectStore('reviews', { keyPath: 'id' });
        s.createIndex('machineId', 'machineId');
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('durEntries')) {
        const s = db.createObjectStore('durEntries', { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('status', 'status');
        s.createIndex('machineId', 'machineId');
      }
      if (!db.objectStoreNames.contains('parts')) {
        const s = db.createObjectStore('parts', { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
        s.createIndex('machineId', 'machineId');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      // Satelity (v2)
      if (!db.objectStoreNames.contains('devices')) {
        const s = db.createObjectStore('devices', { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
        s.createIndex('type', 'type');
      }
      if (!db.objectStoreNames.contains('partsStock')) {
        const s = db.createObjectStore('partsStock', { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('preServiceReports')) {
        const s = db.createObjectStore('preServiceReports', { keyPath: 'id' });
        s.createIndex('deviceId', 'deviceId');
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('postServiceReports')) {
        const s = db.createObjectStore('postServiceReports', { keyPath: 'id' });
        s.createIndex('deviceId', 'deviceId');
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('handoverProtocols')) {
        const s = db.createObjectStore('handoverProtocols', { keyPath: 'id' });
        s.createIndex('deviceId', 'deviceId');
        s.createIndex('date', 'date');
      }
      // Obecność (v3)
      if (!db.objectStoreNames.contains('employees')) {
        const s = db.createObjectStore('employees', { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
        s.createIndex('active', 'active');
        s.createIndex('shift', 'shift');
        s.createIndex('type', 'type'); // 'etat' | 'outsourcing'
      }
      if (!db.objectStoreNames.contains('attendanceRecords')) {
        // Jeden rekord = jeden dzień = jedna zmiana = lista statusów pracowników
        const s = db.createObjectStore('attendanceRecords', { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('shift', 'shift');
        s.createIndex('dateShift', 'dateShift'); // "2026-07-01_zm1"
      }
      if (!db.objectStoreNames.contains('leaveRequests')) {
        // Wnioski urlopowe
        const s = db.createObjectStore('leaveRequests', { keyPath: 'id' });
        s.createIndex('employeeId', 'employeeId');
        s.createIndex('dateFrom', 'dateFrom');
        s.createIndex('status', 'status');
      }
      // Ustawienia aplikacji (v4) — automatyczne kopie zapasowe
      if (!db.objectStoreNames.contains('autoBackups')) {
        const s = db.createObjectStore('autoBackups', { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
      }
      // Centrala (v5) — dane odebrane od brygadzistów z autonomicznych instalacji
      if (!db.objectStoreNames.contains('centralSubmissions')) {
        const s = db.createObjectStore('centralSubmissions', { keyPath: 'id' });
        s.createIndex('brygadzistaId', 'brygadzistaId');
        s.createIndex('submittedAt', 'submittedAt');
        s.createIndex('receivedAt', 'receivedAt');
      }
      // Logowanie i uprawnienia (v6) — konta na TYM urządzeniu (brak serwera → brak kont wspólnych między urządzeniami)
      if (!db.objectStoreNames.contains('users')) {
        const s = db.createObjectStore('users', { keyPath: 'id' });
        s.createIndex('username', 'username', { unique: true });
      }
      // Magazyn (v7) — gospodarka magazynowa (produkty, przyjęcia, wydania, zamówienia)
      if (!db.objectStoreNames.contains('magProducts')) {
        const s = db.createObjectStore('magProducts', { keyPath: 'id' });
        s.createIndex('indeks', 'indeks');
        s.createIndex('nazwa', 'nazwa');
      }
      if (!db.objectStoreNames.contains('magReceipts')) {
        const s = db.createObjectStore('magReceipts', { keyPath: 'id' });
        s.createIndex('productId', 'productId');
        s.createIndex('data', 'data');
      }
      if (!db.objectStoreNames.contains('magIssues')) {
        const s = db.createObjectStore('magIssues', { keyPath: 'id' });
        s.createIndex('productId', 'productId');
        s.createIndex('data', 'data');
      }
      if (!db.objectStoreNames.contains('magOrders')) {
        const s = db.createObjectStore('magOrders', { keyPath: 'id' });
        s.createIndex('status', 'status');
        s.createIndex('dataZamowienia', 'dataZamowienia');
      }
      // Centrala (v8) — decyzje w sprawie wniosków urlopowych, do odesłania brygadzistom
      if (!db.objectStoreNames.contains('centralDecisions')) {
        const s = db.createObjectStore('centralDecisions', { keyPath: 'id' });
        s.createIndex('brygadzistaId', 'brygadzistaId');
        s.createIndex('sentAt', 'sentAt');
      }
      // Check-lista obecności (v9) — obszary produkcyjne i brygadziści nimi kierujący
      if (!db.objectStoreNames.contains('obszary')) {
        db.createObjectStore('obszary', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('brygadzisciList')) {
        const s = db.createObjectStore('brygadzisciList', { keyPath: 'id' });
        s.createIndex('obszarId', 'obszarId');
      }
      // Koordynatorzy (v10) — globalny nadzór nad brygadzistami (bez przypisania do obszarów)
      if (!db.objectStoreNames.contains('koordynatorzy')) {
        db.createObjectStore('koordynatorzy', { keyPath: 'id' });
      }
      // Szkolenia (v11) — karty indywidualne i protokoły grupowe
      if (!db.objectStoreNames.contains('szkolenia')) {
        const s = db.createObjectStore('szkolenia', { keyPath: 'id' });
        s.createIndex('typ', 'typ');
        s.createIndex('data', 'data');
      }
      // Kolejka wysyłek do centrali przez internet (v12) — gdy urządzenie jest
      // offline w momencie próby wysyłki, paczka czeka tutaj do czasu powrotu
      // połączenia. Osobna od centralSubmissions (to jest strona ODBIORCY/admina;
      // ta kolejka to strona NADAWCY, zanim dane w ogóle dotrą do internetu).
      if (!db.objectStoreNames.contains('firebaseQueue')) {
        db.createObjectStore('firebaseQueue', { keyPath: 'id' });
      }
      // Harmonogram codzienny (v13) — osobny, w pełni edytowalny moduł: obszary
      // (np. Antipasti, Hummus) → zadania w nich → codzienne potwierdzenia
      // wykonania, z opcjonalnym pomiarem pH.
      if (!db.objectStoreNames.contains('harmCodzObszary')) {
        db.createObjectStore('harmCodzObszary', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('harmCodzZadania')) {
        const s = db.createObjectStore('harmCodzZadania', { keyPath: 'id' });
        s.createIndex('obszarId', 'obszarId');
      }
      if (!db.objectStoreNames.contains('harmCodzWpisy')) {
        const s = db.createObjectStore('harmCodzWpisy', { keyPath: 'id' });
        s.createIndex('zadanieId', 'zadanieId');
        s.createIndex('data', 'data');
      }
      // Legenda statusów potwierdzenia (v14) — np. PZ/PK/PM/N/X, w pełni
      // edytowalna przez admina (kod, opis, kolor, czy wymaga komentarza).
      // Dotyczy WYŁĄCZNIE Harmonogramu codziennego, nie cyklicznego.
      if (!db.objectStoreNames.contains('harmCodzStatusy')) {
        db.createObjectStore('harmCodzStatusy', { keyPath: 'id' });
      }
      // Historia zastosowanych remanentów (v15) — każdy wpis to jeden
      // zbiorczy remanent (data, kto wykonał, lista skorygowanych pozycji).
      // Roboczy, jeszcze-niezatwierdzony spis trzyma się osobno w
      // ustawieniach (magRemanentRoboczy), nie w tym store.
      if (!db.objectStoreNames.contains('magRemanenty')) {
        db.createObjectStore('magRemanenty', { keyPath: 'id' });
      }
      // Harmonogram cykliczny (v13) — ta sama idea, ale zadania mają
      // częstotliwość (co X dni albo konkretne dni tygodnia) zamiast "co dzień".
      if (!db.objectStoreNames.contains('harmCyklObszary')) {
        db.createObjectStore('harmCyklObszary', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('harmCyklZadania')) {
        const s = db.createObjectStore('harmCyklZadania', { keyPath: 'id' });
        s.createIndex('obszarId', 'obszarId');
      }
      if (!db.objectStoreNames.contains('harmCyklWpisy')) {
        const s = db.createObjectStore('harmCyklWpisy', { keyPath: 'id' });
        s.createIndex('zadanieId', 'zadanieId');
        s.createIndex('data', 'data');
      }
    };

    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function genId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

// Generic helpers
const DB = {
  async getAll(storeName) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },
  async get(storeName, id) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },
  async put(storeName, obj) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(obj);
      req.onsuccess = () => resolve(obj);
      req.onerror = () => reject(req.error);
    });
  },
  async delete(storeName, id) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },
  async getByIndex(storeName, indexName, value) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const idx = store.index(indexName);
      const req = idx.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },
  async clearStore(storeName) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },
  genId
};

// ===== Domain-specific functions =====

// MACHINES
DB.getMachines = () => DB.getAll('machines');
DB.getMachine = (id) => DB.get('machines', id);
DB.saveMachine = (m) => {
  if (!m.id) { m.id = genId(); m.createdAt = Date.now(); }
  return DB.put('machines', m);
};
DB.deleteMachine = (id) => DB.delete('machines', id);

// REVIEWS
DB.getReviewsForMachine = (machineId) => DB.getByIndex('reviews', 'machineId', machineId);
DB.getAllReviews = () => DB.getAll('reviews');
DB.saveReview = (r) => {
  if (!r.id) { r.id = genId(); r.createdAt = Date.now(); }
  return DB.put('reviews', r);
};
DB.deleteReview = (id) => DB.delete('reviews', id);

// DUR ENTRIES
DB.getAllDur = () => DB.getAll('durEntries');
DB.saveDur = (d) => {
  if (!d.id) { d.id = genId(); d.createdAt = Date.now(); }
  return DB.put('durEntries', d);
};
DB.deleteDur = (id) => DB.delete('durEntries', id);

// PARTS
DB.getAllParts = () => DB.getAll('parts');
DB.savePart = (p) => {
  if (!p.id) { p.id = genId(); p.createdAt = Date.now(); }
  return DB.put('parts', p);
};
DB.deletePart = (id) => DB.delete('parts', id);

// SETTINGS
DB.getSetting = async (key, fallback = null) => {
  const row = await DB.get('settings', key);
  return row ? row.value : fallback;
};
DB.setSetting = (key, value) => DB.put('settings', { key, value });

// ===== PART EVENT LOG (wspólne dla 'parts' i 'partsStock') =====
// Każda część ma pole .events = [{ id, type, date, machineId/deviceId, qty, note, createdAt }]
// Typy zdarzeń: 'order' (zamówienie), 'received' (przyjęcie na stan),
//               'installed' (montaż), 'dur' (zwrot do DUR)
const PART_EVENT_TYPES = {
  order: 'Złożenie zamówienia',
  received: 'Przyjęcie na stan',
  installed: 'Montaż w urządzeniu',
  dur: 'Zwrot do DUR'
};

function addPartEvent(part, event) {
  if (!part.events) part.events = [];
  event.id = genId();
  event.createdAt = Date.now();
  part.events.push(event);
  return part;
}

function sortedPartEvents(part) {
  return (part.events || []).slice().sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}

// Czas realizacji: różnica dni między ostatnim 'order' a następującym po nim 'received'
function calcLeadTimeDays(part) {
  const events = sortedPartEvents(part);
  const orders = events.filter(e => e.type === 'order');
  const received = events.filter(e => e.type === 'received');
  if (!orders.length || !received.length) return null;

  const lastOrder = orders[orders.length - 1];
  const matchingReceived = received.find(r => r.date >= lastOrder.date);
  if (!matchingReceived) return null;

  const d1 = new Date(lastOrder.date);
  const d2 = new Date(matchingReceived.date);
  const days = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  return days >= 0 ? days : null;
}

DB.PART_EVENT_TYPES = PART_EVENT_TYPES;
DB.addPartEvent = addPartEvent;
DB.sortedPartEvents = sortedPartEvents;
DB.calcLeadTimeDays = calcLeadTimeDays;

// ===== MODUŁ SATELITY =====

// DEVICES (satelity + inżektory)
DB.getDevices = () => DB.getAll('devices');
DB.getDevice = (id) => DB.get('devices', id);
DB.saveDevice = (d) => {
  if (!d.id) { d.id = genId(); d.createdAt = Date.now(); }
  return DB.put('devices', d);
};
DB.deleteDevice = (id) => DB.delete('devices', id);

// PARTS STOCK (baza części zamiennych ze stanem)
DB.getAllPartsStock = () => DB.getAll('partsStock');
DB.getPartStock = (id) => DB.get('partsStock', id);
DB.savePartStock = (p) => {
  if (!p.id) { p.id = genId(); p.createdAt = Date.now(); }
  if (typeof p.quantity !== 'number') p.quantity = 0;
  return DB.put('partsStock', p);
};
DB.deletePartStock = (id) => DB.delete('partsStock', id);
DB.adjustPartStockQuantity = async (id, delta) => {
  const part = await DB.getPartStock(id);
  if (!part) return null;
  part.quantity = Math.max(0, (part.quantity || 0) + delta);
  return DB.put('partsStock', part);
};

// PRE-SERVICE REPORTS (raport przed-serwisowy)
DB.getPreServiceReportsForDevice = (deviceId) => DB.getByIndex('preServiceReports', 'deviceId', deviceId);
DB.getAllPreServiceReports = () => DB.getAll('preServiceReports');
DB.savePreServiceReport = (r) => {
  if (!r.id) { r.id = genId(); r.createdAt = Date.now(); }
  return DB.put('preServiceReports', r);
};
DB.deletePreServiceReport = (id) => DB.delete('preServiceReports', id);

// POST-SERVICE REPORTS (raport po-serwisowy)
DB.getPostServiceReportsForDevice = (deviceId) => DB.getByIndex('postServiceReports', 'deviceId', deviceId);
DB.getAllPostServiceReports = () => DB.getAll('postServiceReports');
DB.savePostServiceReport = (r) => {
  if (!r.id) { r.id = genId(); r.createdAt = Date.now(); }
  return DB.put('postServiceReports', r);
};
DB.deletePostServiceReport = (id) => DB.delete('postServiceReports', id);

// HANDOVER PROTOCOLS
DB.getHandoverProtocolsForDevice = (deviceId) => DB.getByIndex('handoverProtocols', 'deviceId', deviceId);
DB.getAllHandoverProtocols = () => DB.getAll('handoverProtocols');
DB.saveHandoverProtocol = (h) => {
  if (!h.id) { h.id = genId(); h.createdAt = Date.now(); }
  return DB.put('handoverProtocols', h);
};
DB.deleteHandoverProtocol = (id) => DB.delete('handoverProtocols', id);

// ===== MODUŁ OBECNOŚĆ (v3) =====

// EMPLOYEES
DB.getAllEmployees = () => DB.getAll('employees');
DB.getEmployee = (id) => DB.get('employees', id);
DB.saveEmployee = (e) => {
  if (!e.id) { e.id = genId(); e.createdAt = Date.now(); }
  if (typeof e.active === 'undefined') e.active = 1;
  return DB.put('employees', e);
};
DB.deleteEmployee = (id) => DB.delete('employees', id);

// ===== KATEGORIE PRACOWNIKÓW (edytowalna lista) =====
// Zastępuje dotychczasowy podział "brygadziści osobno / koordynatorzy osobno /
// pracownicy osobno" — teraz to JEDNA lista osób (employees), a "kategoria"
// to zwykłe, edytowalne pole na każdej osobie (jak status czy typ zatrudnienia).
DB.getKategorie = () => DB.getSetting('kategoriePracownikow', [
  'Koordynator', 'Brygadzista etatowy', 'Brygadzista outsourcing', 'Pracownik outsourcing', 'Pracownik etatowy'
]);
DB.setKategorie = (list) => DB.setSetting('kategoriePracownikow', list);

// ===== MIGRACJA DO WSPÓLNEJ LISTY OSÓB =====
// Scala dotychczasowe osobne magazyny danych (brygadzisciList, koordynatorzy)
// do jednego, wspólnego store'a employees, nadając każdej osobie kategorię —
// tak żeby brygadziści i koordynatorzy byli zwykłymi wpisami na liście
// obecności, tak samo jak pracownicy. BEZPIECZNA do wielokrotnego
// uruchomienia (idempotentna) — nic nie usuwa, tylko dopisuje/uzupełnia.
DB.migrateToUnifiedKategorie = async () => {
  const employees = await DB.getAllEmployees();
  const brygList = await DB.getAll('brygadzisciList');
  const koordList = await DB.getAll('koordynatorzy');
  let migrated = 0;
  const staryBrygIdNaNowyEmpId = {}; // mapowanie: id z brygadzisciList -> id w employees

  for (const b of brygList) {
    let emp = employees.find(e => e.linkedBrygadzistaEntryId === b.id);
    if (!emp) {
      emp = employees.find(e => !e.linkedBrygadzistaEntryId && !e.linkedKoordynatorId &&
        e.firstName === b.imie && e.lastName === b.nazwisko);
    }
    if (!emp) {
      emp = { firstName: b.imie, lastName: b.nazwisko, type: b.typ, shift: (b.shiftIds || [])[0] || '', active: 1 };
      employees.push(emp);
    }
    emp.linkedBrygadzistaEntryId = b.id;
    emp.kategoria = b.typ === 'outsourcing' ? 'Brygadzista outsourcing' : 'Brygadzista etatowy';
    emp.nadzorujeObszarId = b.obszarId || null;
    emp.nadzorujeShiftIds = b.shiftIds || [];
    await DB.saveEmployee(emp);
    staryBrygIdNaNowyEmpId[b.id] = emp.id;
    migrated++;
  }

  for (const k of koordList) {
    let emp = employees.find(e => e.linkedKoordynatorId === k.id);
    if (!emp) {
      emp = employees.find(e => !e.linkedBrygadzistaEntryId && !e.linkedKoordynatorId &&
        e.firstName === k.imie && e.lastName === k.nazwisko);
    }
    if (!emp) {
      emp = { firstName: k.imie, lastName: k.nazwisko, type: 'etat', shift: '', active: 1 };
      employees.push(emp);
    }
    emp.linkedKoordynatorId = k.id;
    emp.kategoria = 'Koordynator';
    emp.allowedModules = k.allowedModules || [];
    await DB.saveEmployee(emp);
    migrated++;
  }

  // Zwykli pracownicy bez jeszcze nadanej kategorii — dobierz domyślną na
  // podstawie ich dotychczasowego typu zatrudnienia (etat/outsourcing).
  // Przy okazji: przemapuj ich przypisanie do brygadzisty ze STAREGO id
  // (z brygadzisciList) na NOWE, jednolite id osoby — inaczej przypisanie
  // "zerwałoby się" po migracji, bo lista obecności odtąd filtruje po
  // jednolitym id, nie po dawnym id brygadzisciList.
  for (const e of employees) {
    if (Array.isArray(e.brygadzistaIds) && e.brygadzistaIds.length) {
      const przemapowane = e.brygadzistaIds.map(id => staryBrygIdNaNowyEmpId[id] || id);
      if (JSON.stringify(przemapowane) !== JSON.stringify(e.brygadzistaIds)) {
        e.brygadzistaIds = przemapowane;
        await DB.saveEmployee(e);
      }
    }
    if (!e.kategoria && !e.linkedBrygadzistaEntryId && !e.linkedKoordynatorId) {
      e.kategoria = e.type === 'outsourcing' ? 'Pracownik outsourcing' : 'Pracownik etatowy';
      await DB.saveEmployee(e);
      migrated++;
    }
  }

  await DB.setSetting('kategorieMigrationDone', true);
  return migrated;
};
DB.isKategorieMigrationDone = () => DB.getSetting('kategorieMigrationDone', false);
DB.getActiveEmployees = () => DB.getByIndex('employees', 'active', 1);

// ATTENDANCE RECORDS
// Struktura rekordu:
// { id, date, shift, dateShift, entries: [{employeeId, status, hoursFrom, hoursTo, hours, note}], note, createdAt }
DB.getAllAttendance = () => DB.getAll('attendanceRecords');
DB.getAttendanceByDateShift = (dateShift) => DB.getByIndex('attendanceRecords', 'dateShift', dateShift);
DB.getAttendanceByDate = (date) => DB.getByIndex('attendanceRecords', 'date', date);
DB.saveAttendance = (r) => {
  if (!r.id) { r.id = genId(); r.createdAt = Date.now(); }
  // WAŻNE: przelicz dateShift TYLKO gdy wołający go jeszcze nie ustawił.
  // Wcześniej to pole było ZAWSZE nadpisywane uproszczonym "data_zmiana" —
  // gubiąc obszar (albo brygadzistę przy samodzielnym zapisie), przez co
  // dwa różne obszary na tej samej zmianie tego samego dnia zapisywały się
  // pod TYM SAMYM kluczem i nadpisywały swoje dane nawzajem.
  if (!r.dateShift) r.dateShift = r.date + '_' + r.shift;
  return DB.put('attendanceRecords', r);
};
DB.deleteAttendance = (id) => DB.delete('attendanceRecords', id);

// LEAVE REQUESTS (urlopy)
// Struktura: { id, employeeId, type, dateFrom, dateTo, days, note, status, createdAt }
// status: 'planned' | 'approved' | 'rejected'
DB.getAllLeaveRequests = () => DB.getAll('leaveRequests');
DB.getLeaveRequestsForEmployee = (employeeId) => DB.getByIndex('leaveRequests', 'employeeId', employeeId);
DB.saveLeaveRequest = (l) => {
  if (!l.id) { l.id = genId(); l.createdAt = Date.now(); }
  if (!l.status) l.status = 'planned';
  return DB.put('leaveRequests', l);
};
DB.deleteLeaveRequest = (id) => DB.delete('leaveRequests', id);

// Stałe statusów obecności (z VBA)
DB.ATTENDANCE_STATUSES = {
  'T':  { label: 'Obecny',                                              color: '#e2f0d9', textColor: '#375623' },
  'DL': { label: 'Delegacja',                                           color: '#bdd7ee', textColor: '#1f4e79' },
  'NN': { label: 'Nieobecny (NN)',                                      color: '#ffc7ce', textColor: '#9c0006' },
  'L4': { label: 'Zwolnienie L4',                                       color: '#ffc7ce', textColor: '#9c0006' },
  'UW': { label: 'Urlop wypoczynkowy',                                  color: '#ffeb9c', textColor: '#9c6500' },
  'UZ': { label: 'Urlop na żądanie',                                    color: '#ffeb9c', textColor: '#9c6500' },
  'UD': { label: 'Urlop bezpłatny',                                     color: '#dddddd', textColor: '#444444' },
  'OI': { label: 'Opieka nad dzieckiem do lat 14',                      color: '#ffe0b3', textColor: '#8a5000' },
  'SW': { label: 'Urlop z tytułu siły wyższej',                         color: '#ffd9b3', textColor: '#8a4b00' },
  'UO': { label: 'Urlop okolicznościowy (ślub, urodzenie, zgon itp.)',  color: '#ffeb9c', textColor: '#9c6500' },
  'D':  { label: 'Odbiór za święto',                                    color: '#cce5ff', textColor: '#004085' }
};

// Statusy, które liczą jako nieobecność (D = odbiór za święto, zgodnie z niezależnym wnioskiem .docx)
DB.ABSENCE_STATUSES = ['NN', 'L4', 'UW', 'UZ', 'UD', 'OI', 'SW', 'UO', 'D'];

// Statusy, które liczą jako obecność i wliczają się w godziny pracy (Delegacja = DL, to praca)
DB.PRESENT_STATUSES = ['T', 'DL'];

// Statusy urlopowe
DB.LEAVE_STATUSES = ['UW', 'UZ', 'UD', 'OI', 'SW', 'UO', 'D'];

// ===== BACKUP GLOBALNY (WSZYSTKIE MODUŁY, ŁĄCZNIE Z PRZYSZŁYMI) =====
// Nazwy store'ów są odczytywane dynamicznie z bazy danych, więc każdy nowy
// moduł, który doda własny objectStore, zostanie automatycznie objęty
// kopią zapasową bez konieczności zmian w tym miejscu.
const BACKUP_EXCLUDE_STORES = ['autoBackups', 'users', 'firebaseQueue']; // kopie zapasowe, konta użytkowników i kolejka wysyłek są ściśle per-urządzenie, nigdy nie wchodzą do backupu/importu/wysyłki do centrali

DB.getBackupStoreNames = async () => {
  const db = await openDB();
  return Array.from(db.objectStoreNames).filter(n => !BACKUP_EXCLUDE_STORES.includes(n));
};

// Zwraca pełną kopię danych wszystkich modułów: { version, exportedAt, stores: { nazwaStore: [...] } }
DB.exportAllData = async () => {
  const storeNames = await DB.getBackupStoreNames();
  const stores = {};
  for (const name of storeNames) {
    stores[name] = await DB.getAll(name);
  }
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    stores
  };
};

// Importuje kopię zapasową (nadpisuje dane danego store'a, jeśli występuje w pliku).
// Zachowuje kompatybilność ze starym formatem kopii (płaskie klucze zamiast "stores").
DB.importAllData = async (backup) => {
  const storeNames = await DB.getBackupStoreNames();
  const data = (backup && backup.stores) ? backup.stores : (backup || {});

  // "settings" zawiera oprócz zwykłej konfiguracji też rzeczy ściśle
  // PER-URZĄDZENIE (pieprz do haszowania haseł, aktywna sesja) — import NIE
  // MOŻE ich nadpisać, inaczej wczytanie JAKIEJKOLWIEK paczki (nawet zwykłej
  // paczki startowej) po cichu unieważniało wszystkie lokalne hasła admina,
  // bo pieprz się zmieniał, a te same hasła przestawały pasować bez ostrzeżenia.
  const preservedPepper = await DB.getAuthPepper();
  const preservedSession = await DB.getSession();

  for (const name of storeNames) {
    if (Array.isArray(data[name])) {
      await DB.clearStore(name);
      for (const row of data[name]) await DB.put(name, row);
    }
  }

  await DB.setAuthPepper(preservedPepper);
  await DB.setSession(preservedSession);
};

// Czyści dane wszystkich modułów (poza samymi automatycznymi kopiami zapasowymi)
DB.wipeAllData = async () => {
  const storeNames = await DB.getBackupStoreNames();
  // Tak samo jak w importAllData — pieprz i sesja są ściśle per-urządzenie,
  // czyszczenie danych roboczych nie może ich ruszać.
  const preservedPepper = await DB.getAuthPepper();
  const preservedSession = await DB.getSession();
  for (const name of storeNames) await DB.clearStore(name);
  await DB.setAuthPepper(preservedPepper);
  await DB.setSession(preservedSession);
};

// ===== AUTOMATYCZNE KOPIE ZAPASOWE =====
// Kopie są zapisywane lokalnie w IndexedDB (nie plik) — działa tylko, gdy
// aplikacja jest otwarta w przeglądarce (brak prawdziwego "tła" w PWA).
DB.saveAutoBackup = async () => {
  const backup = await DB.exportAllData();
  const entry = { id: genId(), createdAt: Date.now(), backup };
  await DB.put('autoBackups', entry);
  await DB.pruneAutoBackups();
  return entry;
};

DB.getAutoBackups = async () => {
  const all = await DB.getAll('autoBackups');
  return all.sort((a, b) => b.createdAt - a.createdAt);
};

// Zachowuje tylko ostatnie `keep` automatycznych kopii, żeby baza nie rosła w nieskończoność
DB.pruneAutoBackups = async (keep = 24) => {
  const all = await DB.getAutoBackups();
  const toRemove = all.slice(keep);
  for (const entry of toRemove) await DB.delete('autoBackups', entry.id);
};

DB.deleteAutoBackup = (id) => DB.delete('autoBackups', id);

// ===== 2FA (TOTP) — WYMAGANE DLA KONT ADMINISTRATORA =====
// Implementacja RFC 6238 (TOTP) w oparciu wyłącznie o Web Crypto (HMAC-SHA1) — bez
// żadnej biblioteki zewnętrznej, działa w pełni offline. Sekret jest kompatybilny
// z Google Authenticator / Microsoft Authenticator / Authy itp.
// To samo zastrzeżenie co przy hasłach: sekret leży w tej samej bazie na urządzeniu,
// więc 2FA broni przed odgadniętym/podpatrzonym/współdzielonym hasłem — nie przed
// kimś, kto ma dostęp do narzędzi deweloperskich na tym konkretnym urządzeniu.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes) {
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let output = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.substr(i, 5).padEnd(5, '0');
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return output;
}

function base32Decode(str) {
  const clean = (str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.substr(i, 8), 2));
  return new Uint8Array(bytes);
}

function secureRandomInt(max) {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % max;
}

DB.generateTotpSecret = () => {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
};

async function hmacSha1(keyBytes, msgBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, msgBytes);
  return new Uint8Array(sig);
}

function counterToBytes(counter) {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, 0, false);
  view.setUint32(4, counter, false);
  return new Uint8Array(buf);
}

function dynamicTruncate(hmacBytes) {
  const offset = hmacBytes[hmacBytes.length - 1] & 0xf;
  const code = ((hmacBytes[offset] & 0x7f) << 24) |
               ((hmacBytes[offset + 1] & 0xff) << 16) |
               ((hmacBytes[offset + 2] & 0xff) << 8) |
               (hmacBytes[offset + 3] & 0xff);
  return code % 1000000;
}

DB.computeTotpCode = async (secretBase32, forTimeMs = Date.now(), step = 30) => {
  const counter = Math.floor(forTimeMs / 1000 / step);
  const keyBytes = base32Decode(secretBase32);
  const msgBytes = counterToBytes(counter);
  const hmac = await hmacSha1(keyBytes, msgBytes);
  return String(dynamicTruncate(hmac)).padStart(6, '0');
};

// Sprawdza kod dopuszczając ±1 okno (30s) na drobne rozjazdy zegara telefonu.
DB.verifyTotpCode = async (secretBase32, submittedCode, window = 1) => {
  const clean = (submittedCode || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const now = Date.now();
  for (let w = -window; w <= window; w++) {
    const code = await DB.computeTotpCode(secretBase32, now + w * 30000);
    if (code === clean) return true;
  }
  return false;
};

DB.otpAuthUri = (username, secret) => {
  const label = encodeURIComponent(`ZSZD Higieny:${username}`);
  const issuer = encodeURIComponent('ZSZD Higieny');
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&digits=6&period=30`;
};

// ===== Kody zapasowe (jednorazowe, na wypadek zgubienia telefonu z Authenticatorem) =====
const BACKUP_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bez znaków mylących: 0/O, 1/I/L

function generateBackupCodePlain() {
  let s = '';
  for (let i = 0; i < 8; i++) s += BACKUP_CODE_CHARS[secureRandomInt(BACKUP_CODE_CHARS.length)];
  return s.slice(0, 4) + '-' + s.slice(4);
}

DB.generateBackupCodes = (count = 8) => {
  const codes = [];
  for (let i = 0; i < count; i++) codes.push(generateBackupCodePlain());
  return codes;
};

// Włącza 2FA na koncie: zapisuje sekret TOTP i zahaszowane kody zapasowe (sól+pieprz, jak hasła).
DB.enableUserTotp = async (userId, secret, backupCodesPlain) => {
  const user = await DB.get('users', userId);
  if (!user) return null;
  const pepper = await DB.getAuthPepper();
  const hashedCodes = [];
  for (const code of backupCodesPlain) {
    const salt = genId();
    const hash = await DB.hashPassword(code, salt, pepper);
    hashedCodes.push({ hash, salt, used: false });
  }
  user.totpSecret = secret;
  user.totpEnabled = true;
  user.totpBackupCodes = hashedCodes;
  return DB.put('users', user);
};

DB.verifyBackupCode = async (userId, codeInput) => {
  const user = await DB.get('users', userId);
  if (!user || !user.totpBackupCodes) return false;
  const pepper = await DB.getAuthPepper();
  const clean = (codeInput || '').trim().toUpperCase();
  for (const entry of user.totpBackupCodes) {
    if (entry.used) continue;
    const hash = await DB.hashPassword(clean, entry.salt, pepper);
    if (hash === entry.hash) {
      entry.used = true;
      await DB.put('users', user);
      return true;
    }
  }
  return false;
};

// Wyłącza 2FA na koncie — konto zostanie zmuszone do ponownej konfiguracji przy
// następnym logowaniu (jeśli to admin — 2FA jest dla adminów obowiązkowe).
DB.resetUserTotp = async (userId) => {
  const user = await DB.get('users', userId);
  if (!user) return null;
  user.totpEnabled = false;
  user.totpSecret = null;
  user.totpBackupCodes = [];
  return DB.put('users', user);
};

// Pobiera dane TOTP użytkownika (WŁĄCZNIE z sekretem) — używane tylko wewnętrznie
// podczas logowania/konfiguracji, nigdy nie trafia do currentUser.
DB.getUserTotpInfo = async (userId) => {
  const user = await DB.get('users', userId);
  if (!user) return null;
  return { totpEnabled: !!user.totpEnabled, totpSecret: user.totpSecret, hasBackupCodes: (user.totpBackupCodes || []).some(c => !c.used) };
};

// ===== CENTRALA: WYSYŁKA I ODBIÓR DANYCH OD BRYGADZISTÓW =====
// Tożsamość brygadzisty to teraz jego login (patrz sekcja LOGOWANIE poniżej) —
// nadawany przez administratora przy zakładaniu konta na danym urządzeniu.
// To rozwiązuje wcześniejszy problem trwałości identyfikatora: login jest
// czymś, co administrator świadomie nadaje i co brygadzista wpisuje przy każdym
// logowaniu, więc przetrwa reinstalację czy wyczyszczenie danych przeglądarki
// (o ile ktoś zapamięta swój login i hasło).
function normalizeUsername(u) {
  return (u || '').trim().toLowerCase();
}

// Buduje paczkę danych do wysłania do centrali: pełny eksport wszystkich modułów
// (patrz DB.exportAllData) + tożsamość nadawcy (login zalogowanego użytkownika).
DB.buildSubmissionPackage = async (username, senderInfo = {}) => {
  const base = await DB.exportAllData();
  const id = normalizeUsername(username);
  return {
    ...base,
    kind: 'centrala-submission',
    // senderType: 'brygadzista' | 'nadzor' (koordynator/kierownik). Domyślnie brygadzista
    // dla zgodności wstecznej ze starymi paczkami.
    senderType: senderInfo.senderType || 'brygadzista',
    senderRole: senderInfo.senderRole || '', // np. 'Koordynator', 'Kierownik' — opisowo
    brygadzista: { id, name: username || id || '(bez nazwy)' }
  };
};

// Buduje "paczkę startową" dla lekkiej aplikacji (dawniej tylko brygadzisty,
// teraz też koordynator/admin-na-telefonie) — konfigurację którą admin
// przygotowuje PRZED przekazaniem aplikacji użytkownikowi. Zawiera:
// - tożsamość i rolę (brygadzista/koordynator/admin),
// - dla brygadzisty: jego obszary + wszystkich brygadzistów tych obszarów,
//   jego pracowników; dla koordynatora/admina: wszystko (nadzór globalny),
// - wspólne dane modułów (katalogi usterek, maszyny, urządzenia, magazyn) do pracy,
// - nadane uprawnienia do modułów (admin zawsze dostaje wszystkie, w tym Centralę).
DB.buildBrygadzistaStarter = async (role, entryId, allowedModules = []) => {
  role = role || 'brygadzista';
  const base = await DB.exportAllData();

  if (role === 'brygadzista') {
    const brygadzisci = await DB.getBrygadzisciList();
    const obszary = await DB.getObszary();
    const employees = await DB.getAll('employees');

    const me = brygadzisci.find(b => b.id === entryId);
    if (!me) throw new Error('Nie znaleziono brygadzisty o podanym ID');

    const koordynatorzy = await DB.getKoordynatorzy();

    // Obszary tego brygadzisty (na razie jeden obszarId, ale trzymamy jako zbiór)
    const myObszarIds = new Set([me.obszarId].filter(Boolean));
    // Wszyscy brygadziści z tych obszarów
    const brygInObszary = brygadzisci.filter(b => myObszarIds.has(b.obszarId));
    const brygIds = new Set(brygInObszary.map(b => b.id));
    // Koordynatorzy to globalny nadzór — brygadzista dostaje wszystkich
    const koordInObszary = koordynatorzy;
    const koordIds = new Set(koordInObszary.map(k => k.id));
    // Pracownicy przypisani do tych brygadzistów + wpisy pracownicze brygadzistów i koordynatorów
    const relevantEmployees = employees.filter(e => {
      if (e.linkedBrygadzistaEntryId && brygIds.has(e.linkedBrygadzistaEntryId)) return true;
      if (e.linkedKoordynatorId && koordIds.has(e.linkedKoordynatorId)) return true;
      const ids = Array.isArray(e.brygadzistaIds) ? e.brygadzistaIds : (e.brygadzistaId ? [e.brygadzistaId] : []);
      return ids.some(id => brygIds.has(id));
    });
    const relevantObszary = obszary.filter(o => myObszarIds.has(o.id));

    base.stores.brygadzisciList = brygInObszary;
    base.stores.koordynatorzy = koordInObszary;
    base.stores.obszary = relevantObszary;
    base.stores.employees = relevantEmployees;

    return {
      kind: 'brygadzista-starter',
      version: 2,
      exportedAt: new Date().toISOString(),
      brygadzistaIdentity: {
        role: 'brygadzista',
        brygadzistaEntryId: me.id,
        imie: me.imie,
        nazwisko: me.nazwisko,
        typ: me.typ,
        obszarId: me.obszarId,
        shiftIds: me.shiftIds || []
      },
      allowedModules: allowedModules.filter(m => m !== 'centrala'), // brygadzista nigdy nie ma Centrali
      stores: base.stores
    };
  }

  if (role === 'obszar') {
    // Paczka przypisana do STANOWISKA — kto akurat pracuje na tej zmianie,
    // korzysta z tego telefonu. entryId to po prostu obszarId — zmiana jest
    // teraz cechą samego obszaru (Ustawienia → Obszary), nie osobnym wyborem,
    // żeby uniknąć niespójności między dwoma niezależnymi polami.
    const obszarId = entryId;
    const obszary = await DB.getObszary();
    const obszar = obszary.find(o => o.id === obszarId);
    if (!obszar) throw new Error('Nie wybrano obszaru');
    const shift = obszar.shift;
    if (!shift) throw new Error(`Obszar "${obszar.nazwa}" nie ma jeszcze przypisanej zmiany — ustaw ją w Ustawieniach → Obszary, zanim przygotujesz dla niego telefon.`);

    const employees = await DB.getAll('employees');
    const brygadzisci = await DB.getBrygadzisciList();

    // DOKŁADNIE ta sama logika (kategoria+nadzoruje, z fallbackiem do
    // starszych danych) co check-lista obecności w panelu admina — żeby
    // telefon pokazywał TĘ SAMĄ listę osób, którą admin widzi u siebie.
    // Typ zatrudnienia brygadzisty (etatowy/outsourcing) NIE musi się zgadzać
    // z typem zmiany — to jawne przypisanie decyduje, nie kategoria.
    let brygEmps = employees.filter(e =>
      e.active !== 0 && (e.kategoria || '').startsWith('Brygadzista') &&
      e.nadzorujeObszarId === obszarId && (e.nadzorujeShiftIds || []).includes(shift)
    );
    if (!brygEmps.length) {
      const legacy = brygadzisci.filter(b => b.obszarId === obszarId && (b.shiftIds || []).includes(shift));
      legacy.forEach(b => {
        const emp = employees.find(e => e.linkedBrygadzistaEntryId === b.id && e.active !== 0);
        if (emp && !brygEmps.includes(emp)) {
          // Ten brygadzista nie ma jeszcze uzupełnionego "Nadzoruje obszar i
          // zmianę" na swoim wpisie (kategoria/nadzorujeObszarId puste) —
          // znaleźliśmy go tylko dzięki starszemu magazynowi danych. Paczka
          // startowa NIE zawiera już tego starszego magazynu (świadomie
          // wyczyszczony niżej), więc telefon odbierający tę paczkę nie miałby
          // WCALE jak go rozpoznać jako brygadzistę — bez tego uzupełnienia
          // cała check-lista wyglądałaby na telefonie na pustą. Uzupełniamy
          // więc te pola NA KOPII wpisu, bezpośrednio w eksportowanej paczce
          // (nie modyfikujemy oryginalnego wpisu w bazie admina).
          const uzupelniony = {
            ...emp,
            kategoria: emp.kategoria || (b.typ === 'outsourcing' ? 'Brygadzista outsourcing' : 'Brygadzista etatowy'),
            nadzorujeObszarId: emp.nadzorujeObszarId || b.obszarId,
            nadzorujeShiftIds: (emp.nadzorujeShiftIds && emp.nadzorujeShiftIds.length) ? emp.nadzorujeShiftIds : (b.shiftIds || [])
          };
          brygEmps.push(uzupelniony);
        }
      });
    }
    const brygIds = new Set(brygEmps.map(e => e.id));
    const pracownicy = employees.filter(e =>
      e.active !== 0 &&
      !(e.kategoria || '').startsWith('Brygadzista') && e.kategoria !== 'Koordynator' &&
      getEmpBrygadzistaIds(e).some(id => brygIds.has(id))
    );
    const relevantEmployees = [...brygEmps, ...pracownicy];
    const shiftDef = ALL_SHIFTS.find(s => s.id === shift);

    base.stores.obszary = [obszar];
    base.stores.employees = relevantEmployees;
    base.stores.brygadzisciList = [];
    base.stores.koordynatorzy = [];

    return {
      kind: 'brygadzista-starter',
      version: 2,
      exportedAt: new Date().toISOString(),
      brygadzistaIdentity: {
        role: 'obszar',
        obszarId,
        shift,
        imie: obszar.nazwa,
        nazwisko: shiftDef ? shiftDef.label : shift
      },
      allowedModules: allowedModules.filter(m => m !== 'centrala'), // stanowisko nigdy nie ma Centrali
      stores: base.stores
    };
  }

  if (role === 'koordynator') {
    const koordynatorzy = await DB.getKoordynatorzy();
    const me = koordynatorzy.find(k => k.id === entryId);
    if (!me) throw new Error('Nie znaleziono koordynatora o podanym ID');
    // Koordynator to nadzór globalny — dostaje WSZYSTKIE dane (jak admin), bez filtrowania po obszarze.
    return {
      kind: 'brygadzista-starter',
      version: 2,
      exportedAt: new Date().toISOString(),
      brygadzistaIdentity: {
        role: 'koordynator',
        koordynatorEntryId: me.id,
        imie: me.imie,
        nazwisko: me.nazwisko,
        typ: me.typ
      },
      allowedModules: allowedModules.filter(m => m !== 'centrala'), // koordynator bez Centrali
      stores: base.stores
    };
  }

  // role === 'admin' — pełny dostęp, włącznie z Centralą; to po prostu Ty, na telefonie
  return {
    kind: 'brygadzista-starter',
    version: 2,
    exportedAt: new Date().toISOString(),
    brygadzistaIdentity: {
      role: 'admin',
      imie: 'Administrator',
      nazwisko: '(telefon)'
    },
    allowedModules: [...ALL_MODULE_KEYS],
    stores: base.stores
  };
};
DB.saveCentralSubmission = async (pkg) => {
  const entry = {
    id: genId(),
    brygadzistaId: (pkg.brygadzista && pkg.brygadzista.id) || 'nieznany',
    brygadzistaName: (pkg.brygadzista && pkg.brygadzista.name) || '(bez nazwy)',
    senderType: pkg.senderType || 'brygadzista',
    senderRole: pkg.senderRole || '',
    submittedAt: pkg.exportedAt || new Date().toISOString(),
    receivedAt: Date.now(),
    payload: pkg
  };
  await DB.put('centralSubmissions', entry);
  return entry;
};

DB.getCentralSubmissions = async () => {
  const all = await DB.getAll('centralSubmissions');
  return all.sort((a, b) => b.receivedAt - a.receivedAt);
};

DB.deleteCentralSubmission = (id) => DB.delete('centralSubmissions', id);

// ===== KOLEJKA WYSYŁEK DO CENTRALI PRZEZ INTERNET (dodatkowa, obok pliku) =====
// Gdy urządzenie próbuje wysłać dane automatycznie, ale nie ma w tym momencie
// internetu, paczka trafia tutaj i czeka do czasu powrotu połączenia — nic nie
// ginie, nic nie trzeba ręcznie ponawiać.
DB.queueForFirebase = async (pkg) => {
  const entry = { id: genId(), queuedAt: Date.now(), pkg };
  await DB.put('firebaseQueue', entry);
  return entry;
};
DB.getFirebaseQueue = async () => {
  const all = await DB.getAll('firebaseQueue');
  return all.sort((a, b) => a.queuedAt - b.queuedAt);
};
DB.removeFirebaseQueueItem = (id) => DB.delete('firebaseQueue', id);

// ===== LOGOWANIE I UPRAWNIENIA (KONTA NA TYM URZĄDZENIU) =====
// WAŻNE OGRANICZENIE: to nie jest prawdziwe zabezpieczenie danych. Cały kod (w tym
// wartość "pieprzu") działa w przeglądarce osoby logującej się, więc ktoś z dostępem
// do narzędzi deweloperskich może odczytać dane bezpośrednio z IndexedDB albo obejść
// ekran logowania. Sól (losowa, unikalna dla każdego konta) i pieprz (wspólny,
// ustawiany przez administratora) podnoszą poprzeczkę dla kogoś, kto przypadkiem
// zajrzy do bazy — nie chronią przed kimś naprawdę zdeterminowanym.
// Każde urządzenie ma WŁASNĄ, niezależną listę kont — nie ma wspólnego serwera,
// więc konta zakłada się fizycznie na każdym urządzeniu z osobna.

const ALL_MODULE_KEYS = ['nadziewarki', 'satelity', 'obecnosc', 'magazyn', 'szkolenia', 'harmCodzienny', 'harmCykliczny', 'centrala', 'ustawienia'];

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Liczba iteracji PBKDF2 — im więcej, tym wolniej (celowo!) da się sprawdzić
// jedno hasło, co utrudnia łamanie brute-force nawet przy skradzionej bazie.
// 210 000 to zalecenie OWASP (2023) dla PBKDF2-HMAC-SHA256.
const SZD_PBKDF2_ITERATIONS = 210000;

async function pbkdf2Hex(password, salt, pepper, iterations) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(`${salt}::${pepper}`), iterations, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Aktualny, właściwy algorytm haszowania haseł — PBKDF2 (celowo wolny).
DB.hashPassword = async (password, salt, pepper) => {
  return pbkdf2Hex(password, salt, pepper, SZD_PBKDF2_ITERATIONS);
};

// Stary, szybki hash (pojedynczy SHA-256) — zostawiony WYŁĄCZNIE do rozpoznania
// i cichej migracji kont założonych przed wprowadzeniem PBKDF2. Nowe konta i
// resety haseł już go nie używają.
DB.hashPasswordLegacySha256 = async (password, salt, pepper) => {
  return sha256Hex(`${salt}::${password}::${pepper}`);
};

DB.getAuthPepper = () => DB.getSetting('authPepper', '');
DB.setAuthPepper = (value) => DB.setSetting('authPepper', value || '');

DB.getUsers = () => DB.getAll('users');

DB.getUserByUsername = async (username) => {
  const uname = normalizeUsername(username);
  const all = await DB.getUsers();
  return all.find(u => u.username === uname) || null;
};

// Tworzy konto na TYM urządzeniu. allowedModules ignorowane, gdy isAdmin=true (admin ma zawsze pełny dostęp).
DB.createUser = async ({ username, password, isAdmin = false, allowedModules = [], brygadzistaEntryId = null }) => {
  const uname = normalizeUsername(username);
  if (!uname) throw new Error('Nazwa użytkownika nie może być pusta');
  const existing = await DB.getUserByUsername(uname);
  if (existing) throw new Error('Taki użytkownik już istnieje na tym urządzeniu');

  const salt = genId();
  const pepper = await DB.getAuthPepper();
  const passwordHash = await DB.hashPassword(password, salt, pepper);
  const user = {
    id: genId(),
    username: uname,
    displayName: (username || '').trim() || uname,
    salt,
    passwordHash,
    passwordAlgo: 'pbkdf2',
    failedAttempts: 0,
    lockedUntil: null,
    isAdmin: !!isAdmin,
    allowedModules: isAdmin ? [...ALL_MODULE_KEYS] : allowedModules,
    brygadzistaEntryId: isAdmin ? null : (brygadzistaEntryId || null),
    totpEnabled: false,
    totpSecret: null,
    totpBackupCodes: [],
    createdAt: Date.now()
  };
  await DB.put('users', user);
  return user;
};

DB.updateUserBrygadzista = (id, brygadzistaEntryId) => DB.get('users', id).then(u => {
  if (!u) return null;
  u.brygadzistaEntryId = brygadzistaEntryId || null;
  return DB.put('users', u);
});

DB.updateUserModules = (id, allowedModules) => DB.get('users', id).then(u => {
  if (!u) return null;
  u.allowedModules = allowedModules;
  return DB.put('users', u);
});

DB.resetUserPassword = async (id, newPassword) => {
  const u = await DB.get('users', id);
  if (!u) return null;
  const pepper = await DB.getAuthPepper();
  u.salt = genId();
  u.passwordHash = await DB.hashPassword(newPassword, u.salt, pepper);
  u.passwordAlgo = 'pbkdf2';
  u.failedAttempts = 0;
  u.lockedUntil = null;
  return DB.put('users', u);
};

DB.deleteUser = (id) => DB.delete('users', id);

// ===== DZIENNIK ZDARZEŃ BEZPIECZEŃSTWA =====
// Zapisuje nieudane próby logowania i blokady kont, żeby admin mógł je
// przejrzeć, wracając do aplikacji, nawet jeśli akurat nie patrzył na ekran.
DB.logSecurityEvent = async (event) => {
  const log = await DB.getSetting('securityLog', []);
  log.push({ ...event, at: Date.now() });
  if (log.length > 200) log.splice(0, log.length - 200); // nie rośnie w nieskończoność
  await DB.setSetting('securityLog', log);
  return log;
};
DB.getSecurityLog = () => DB.getSetting('securityLog', []);
DB.clearSecurityLog = () => DB.setSetting('securityLog', []);

// Limit prób logowania — po tylu NIEUDANYCH próbach z rzędu konto blokuje się
// czasowo, żeby utrudnić zgadywanie hasła.
const SZD_MAX_LOGIN_ATTEMPTS = 3;
const SZD_LOCKOUT_MS = 15 * 60 * 1000; // 15 minut

// Zwraca: null (zły login/hasło), { locked: true, lockedUntil, username } (konto
// zablokowane), albo dane użytkownika (sukces — BEZ hasha/soli/sekretu TOTP).
// WAŻNE: blokada czasowa ma utrudniać ZGADYWANIE hasła, a nie blokować
// właściciela konta, który zna poprawne hasło — dlatego hasło sprawdzamy
// NAJPIERW; jeśli jest poprawne, wpuszczamy od razu, nawet w trakcie blokady
// (i od razu ją znosimy). Blokada działa tylko przeciwko KOLEJNYM błędnym próbom.
DB.verifyLogin = async (username, password) => {
  const user = await DB.getUserByUsername(username);
  if (!user) return null;

  const pepper = await DB.getAuthPepper();
  let ok = false;

  if (user.passwordAlgo === 'pbkdf2') {
    ok = (await DB.hashPassword(password, user.salt, pepper)) === user.passwordHash;
  } else {
    // Konto założone przed wprowadzeniem PBKDF2 — sprawdź starym sposobem,
    // a jeśli hasło się zgadza, po cichu podnieś je do nowego, wolniejszego hasha.
    ok = (await DB.hashPasswordLegacySha256(password, user.salt, pepper)) === user.passwordHash;
    if (ok) {
      user.salt = genId();
      user.passwordHash = await DB.hashPassword(password, user.salt, pepper);
      user.passwordAlgo = 'pbkdf2';
    }
  }

  if (ok) {
    user.failedAttempts = 0;
    user.lockedUntil = null;
    await DB.put('users', user);
    const { passwordHash, salt, totpSecret, totpBackupCodes, ...safe } = user;
    return safe;
  }

  // Złe hasło. Jeśli konto jest AKTUALNIE zablokowane, poinformuj o tym i nie
  // licz tej próby ponownie do limitu (i tak już jest zablokowane).
  if (user.lockedUntil && user.lockedUntil > Date.now()) {
    return { locked: true, lockedUntil: user.lockedUntil, username: user.username };
  }

  user.failedAttempts = (user.failedAttempts || 0) + 1;
  if (user.failedAttempts >= SZD_MAX_LOGIN_ATTEMPTS) {
    user.lockedUntil = Date.now() + SZD_LOCKOUT_MS;
    user.failedAttempts = 0;
    await DB.put('users', user);
    await DB.logSecurityEvent({ type: 'lockout', username: user.username });
    return { locked: true, lockedUntil: user.lockedUntil, username: user.username };
  }
  await DB.put('users', user);
  await DB.logSecurityEvent({ type: 'failed', username: user.username, attempt: user.failedAttempts });
  return null;
};

DB.getSession = () => DB.getSetting('loggedInUserId', null);
DB.setSession = (userId) => DB.setSetting('loggedInUserId', userId);
DB.clearSession = () => DB.setSetting('loggedInUserId', null);

// ===== IMPORT PLIKU KONFIGURACYJNEGO (dawniej: tylko w wersji dla telefonu) =====
// Pozwala skonfigurować TO urządzenie (rolę: brygadzista/koordynator/admin)
// przez wczytanie pliku, zamiast zakładania konta z hasłem — dokładnie ten
// sam mechanizm co w wersji dla telefonu, teraz dostępny tu też, żeby była
// tylko JEDNA aplikacja i JEDEN sposób na przygotowanie dostępu dla kogoś.
// UWAGA: czyści WSZYSTKIE dotychczasowe dane robocze na tym urządzeniu przed
// wczytaniem nowych (konta z hasłem NIE są ruszane — to osobny, nietykalny
// store). Wywołujący w app.js MUSI wcześniej ostrzec użytkownika, jeśli
// urządzenie miało już jakiekolwiek dane.
DB.getBrygadzistaIdentity = () => DB.getSetting('brygadzistaIdentity', null);
DB.setBrygadzistaIdentity = (identity) => DB.setSetting('brygadzistaIdentity', identity);
DB.getBrygadzistaAllowedModules = () => DB.getSetting('brygadzistaAllowedModules', []);
DB.importBrygadzistaStarter = async (pkg) => {
  if (!pkg || pkg.kind !== 'brygadzista-starter' || !pkg.brygadzistaIdentity) {
    throw new Error('To nie jest prawidłowy plik konfiguracyjny.');
  }
  await DB.wipeAllData();
  await DB.importAllData({ stores: pkg.stores });
  await DB.setBrygadzistaIdentity(pkg.brygadzistaIdentity);
  await DB.setSetting('brygadzistaAllowedModules', pkg.allowedModules || []);
  return pkg.brygadzistaIdentity;
};

// Unieważnia hasła WSZYSTKICH kont na tym urządzeniu (używane przy zmianie pieprzu).
// Admin musi potem każdemu ręcznie nadać nowe hasło przez "Zresetuj hasło".
DB.invalidateAllPasswords = async () => {
  const all = await DB.getUsers();
  for (const u of all) {
    u.passwordHash = null; // konto istnieje, ale nie da się nim zalogować do czasu resetu hasła
  }
  for (const u of all) await DB.put('users', u);
};

window.DB = DB;

// ===== MAGAZYN =====
DB.getMagProducts = () => DB.getAll('magProducts');
DB.getMagProduct = (id) => DB.get('magProducts', id);
DB.saveMagProduct = (p) => {
  if (!p.id) { p.id = genId(); p.createdAt = Date.now(); }
  return DB.put('magProducts', p);
};
DB.deleteMagProduct = (id) => DB.delete('magProducts', id);

DB.getMagReceipts = () => DB.getAll('magReceipts');
DB.saveMagReceipt = (r) => {
  if (!r.id) { r.id = genId(); r.createdAt = Date.now(); }
  return DB.put('magReceipts', r);
};
DB.deleteMagReceipt = (id) => DB.delete('magReceipts', id);

DB.getMagIssues = () => DB.getAll('magIssues');
DB.saveMagIssue = (i) => {
  if (!i.id) { i.id = genId(); i.createdAt = Date.now(); }
  return DB.put('magIssues', i);
};
DB.deleteMagIssue = (id) => DB.delete('magIssues', id);

DB.getMagOrders = () => DB.getAll('magOrders');
DB.saveMagOrder = (o) => {
  if (!o.id) { o.id = genId(); o.createdAt = Date.now(); }
  return DB.put('magOrders', o);
};
DB.deleteMagOrder = (id) => DB.delete('magOrders', id);

// ===== CHECK-LISTA OBECNOŚCI: OBSZARY I BRYGADZIŚCI =====
DB.getObszary = () => DB.getAll('obszary');
DB.saveObszar = (o) => {
  if (!o.id) o.id = genId();
  return DB.put('obszary', o);
};
DB.deleteObszar = (id) => DB.delete('obszary', id);

DB.getBrygadzisciList = () => DB.getAll('brygadzisciList');
DB.saveBrygadzistaEntry = (b) => {
  if (!b.id) b.id = genId();
  return DB.put('brygadzisciList', b);
};
DB.deleteBrygadzistaEntry = (id) => DB.delete('brygadzisciList', id);

// ===== SZKOLENIA (karty indywidualne i protokoły grupowe) =====
DB.getSzkolenia = () => DB.getAll('szkolenia');
DB.saveSzkolenie = (s) => {
  if (!s.id) s.id = genId();
  if (!s.createdAt) s.createdAt = Date.now();
  s.updatedAt = Date.now();
  return DB.put('szkolenia', s);
};
DB.deleteSzkolenie = (id) => DB.delete('szkolenia', id);

// ===== KOORDYNATORZY (rola nad brygadzistami, ogarnia kilka obszarów) =====
DB.getKoordynatorzy = () => DB.getAll('koordynatorzy');
DB.saveKoordynator = (k) => {
  if (!k.id) k.id = genId();
  return DB.put('koordynatorzy', k);
};
DB.deleteKoordynator = (id) => DB.delete('koordynatorzy', id);

// ===== CENTRALA: DECYZJE O WNIOSKACH URLOPOWYCH (odsyłane do brygadzistów) =====
DB.saveCentralDecision = (decision) => {
  if (!decision.id) decision.id = genId();
  return DB.put('centralDecisions', decision);
};
DB.getCentralDecisions = () => DB.getAll('centralDecisions');
DB.markDecisionsSent = async (ids) => {
  const all = await DB.getCentralDecisions();
  for (const d of all) {
    if (ids.includes(d.id)) {
      d.sentAt = Date.now();
      await DB.put('centralDecisions', d);
    }
  }
};

// ===== HARMONOGRAM CODZIENNY (obszary → zadania → potwierdzenia wykonania) =====
DB.getHarmCodzObszary = () => DB.getAll('harmCodzObszary');
DB.saveHarmCodzObszar = (o) => {
  if (!o.id) o.id = genId();
  if (o.active === undefined) o.active = 1;
  return DB.put('harmCodzObszary', o);
};
DB.deleteHarmCodzObszar = (id) => DB.delete('harmCodzObszary', id);

DB.getHarmCodzZadania = () => DB.getAll('harmCodzZadania');
DB.saveHarmCodzZadanie = (z) => {
  if (!z.id) z.id = genId();
  if (z.active === undefined) z.active = 1;
  return DB.put('harmCodzZadania', z);
};
DB.deleteHarmCodzZadanie = (id) => DB.delete('harmCodzZadania', id);

DB.getHarmCodzWpisy = () => DB.getAll('harmCodzWpisy');
DB.saveHarmCodzWpis = (w) => {
  if (!w.id) w.id = genId();
  if (!w.createdAt) w.createdAt = Date.now();
  return DB.put('harmCodzWpisy', w);
};
DB.deleteHarmCodzWpis = (id) => DB.delete('harmCodzWpisy', id);

// Legenda statusów potwierdzenia (PZ/PK/PM/N/X itp.) — wyłącznie Harmonogram codzienny.
DB.getHarmCodzStatusy = () => DB.getAll('harmCodzStatusy');
DB.saveHarmCodzStatus = (s) => {
  if (!s.id) s.id = genId();
  if (s.active === undefined) s.active = 1;
  return DB.put('harmCodzStatusy', s);
};
DB.deleteHarmCodzStatus = (id) => DB.delete('harmCodzStatusy', id);

// Historia zastosowanych remanentów — zapisywane RAZ, zbiorczo, po kliknięciu
// "Zastosuj korekty" (nie edytowane później — to jest log, nie robocza dana).
DB.getMagRemanenty = () => DB.getAll('magRemanenty');
DB.saveMagRemanent = (r) => {
  if (!r.id) { r.id = genId(); r.createdAt = Date.now(); }
  return DB.put('magRemanenty', r);
};

// ===== HARMONOGRAM CYKLICZNY (jak wyżej, ale zadania mają częstotliwość) =====
DB.getHarmCyklObszary = () => DB.getAll('harmCyklObszary');
DB.saveHarmCyklObszar = (o) => {
  if (!o.id) o.id = genId();
  if (o.active === undefined) o.active = 1;
  return DB.put('harmCyklObszary', o);
};
DB.deleteHarmCyklObszar = (id) => DB.delete('harmCyklObszary', id);

DB.getHarmCyklZadania = () => DB.getAll('harmCyklZadania');
DB.saveHarmCyklZadanie = (z) => {
  if (!z.id) z.id = genId();
  if (z.active === undefined) z.active = 1;
  return DB.put('harmCyklZadania', z);
};
DB.deleteHarmCyklZadanie = (id) => DB.delete('harmCyklZadania', id);

DB.getHarmCyklWpisy = () => DB.getAll('harmCyklWpisy');
DB.saveHarmCyklWpis = (w) => {
  if (!w.id) w.id = genId();
  if (!w.createdAt) w.createdAt = Date.now();
  return DB.put('harmCyklWpisy', w);
};
DB.deleteHarmCyklWpis = (id) => DB.delete('harmCyklWpisy', id);
