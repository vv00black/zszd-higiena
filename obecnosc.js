// obecnosc.js — Moduł Listy Obecności v1
// Działa lokalnie per brygadzista, sync przez export/import JSON

// ===== POLSKIE ŚWIĘTA =====
function isPolishHoliday(dateStr) {
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const fixed = ['01-01','06-01','01-05','03-05','15-08','01-11','11-11','25-12','26-12'];
  if (fixed.includes(mm + '-' + dd.slice(0,2) + dd.slice(-2))) return true;
  // Wielkanoc algorytm Gaussa (jak w VBA)
  const y = d.getFullYear();
  const a = y % 19, b = y % 4, c = y % 7;
  const p = Math.floor(y / 100);
  const q = Math.floor((13 + 8 * p) / 25);
  const M = (15 - q + p - Math.floor(p / 4)) % 30;
  const N = (4 + p - Math.floor(p / 4)) % 7;
  const D = (19 * a + M) % 30;
  const E = (2 * b + 4 * c + 6 * D + N) % 7;
  let eDay, eMon;
  if (D + E < 26) { eDay = D + E + 22; eMon = 3; }
  else if (D + E === 26 || (D + E === 35 && D === 28 && E === 6)) {
    eDay = D + E + 15; eMon = 3;
    if (eDay > 31) { eDay -= 31; eMon = 4; }
  } else { eDay = D + E - 9; eMon = 4; }
  const easter = new Date(y, eMon - 1, eDay);
  const easterMonday = new Date(y, eMon - 1, eDay + 1);
  const whitSunday = new Date(y, eMon - 1, eDay + 49);
  const corpusChristi = new Date(y, eMon - 1, eDay + 60);
  const targets = [easter, easterMonday, whitSunday, corpusChristi];
  return targets.some(t => t.toISOString().slice(0, 10) === dateStr);
}

function isWeekend(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.getDay() === 0 || d.getDay() === 6;
}

function daysInMonth(year, month) { // month 1-12
  return new Date(year, month, 0).getDate();
}

function dateStr(year, month, day) {
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

function countWorkingDays(dateFrom, dateTo) {
  let count = 0;
  const cur = new Date(dateFrom + 'T12:00:00');
  const end = new Date(dateTo + 'T12:00:00');
  while (cur <= end) {
    const ds = cur.toISOString().slice(0,10);
    if (!isWeekend(ds) && !isPolishHoliday(ds)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ===== STAN MODUŁU =====
const obsState = {
  employees: [],
  attendanceRecords: [],
  leaveRequests: [],
  obszary: [],
  brygadzisciList: [],
  editingObszarId: null,
  editingBrygId: null,
  checklistOverrides: {},
  currentMonth: new Date().getMonth() + 1,
  currentYear: new Date().getFullYear(),
  currentShift: '',
  editingEmployeeId: null,
  editingLeaveId: null,
  statsView: 'monthly', // 'daily' | 'monthly' | 'yearly'
};

const SHIFT_DEFS = {
  etat: [
    { id: 'zm1', label: 'Zmiana 1 (6:00-14:00)', hours: 8, start: '06:00', end: '14:00' },
    { id: 'zm2', label: 'Zmiana 2 (14:00-22:00)', hours: 8, start: '14:00', end: '22:00' },
    { id: 'zm3', label: 'Zmiana 3 (22:00-6:00)', hours: 8, start: '22:00', end: '06:00' },
  ],
  outsourcing: [
    { id: 'out1', label: 'Outsourcing zmiana dzienna (6:00-18:00)', hours: 12, start: '06:00', end: '18:00' },
    { id: 'out2', label: 'Outsourcing zmiana nocna (18:00-6:00)', hours: 12, start: '18:00', end: '06:00' },
  ]
};

const ALL_SHIFTS = [...SHIFT_DEFS.etat, ...SHIFT_DEFS.outsourcing];

function shiftLabel(shiftId) {
  const s = ALL_SHIFTS.find(x => x.id === shiftId);
  return s ? s.label : shiftId;
}

function shiftHours(shiftId) {
  const s = ALL_SHIFTS.find(x => x.id === shiftId);
  return s ? s.hours : 8;
}

function shiftDef(shiftId) {
  return ALL_SHIFTS.find(x => x.id === shiftId) || null;
}

// ===== INIT =====
// Pomocnicza: znajdź wpis obecności dla pracownika w danym dniu
// Nie filtruje po emp.shift — rekord może być zapisany z dowolną zmianą
function findEntryForEmployee(date, employeeId) {
  const recs = obsState.attendanceRecords.filter(r => r.date === date);
  for (const rec of recs) {
    const entry = rec.entries.find(e => e.employeeId === employeeId);
    if (entry && entry.status) return entry;
  }
  return null;
}

function findEntryForEmployeeInMonth(monthRecs, date, employeeId) {
  const recs = monthRecs.filter(r => r.date === date);
  for (const rec of recs) {
    const entry = rec.entries.find(e => e.employeeId === employeeId);
    if (entry && entry.status) return entry;
  }
  return null;
}
async function initObecnosc() {
  obsState.employees = await DB.getAllEmployees();
  obsState.attendanceRecords = await DB.getAllAttendance();
  obsState.leaveRequests = await DB.getAllLeaveRequests();
  obsState.currentShift = await DB.getSetting('brigadierShift', '');
  obsState.kategorie = await DB.getKategorie();
  // Obszary muszą być załadowane ZAWSZE, niezależnie od roli — dotąd ładowała
  // je WYŁĄCZNIE initObszaryBrygadzisci(), która celowo pomija (return) każdą
  // rolę inną niż pełny administrator. Dla tożsamości "Stanowisko" (obszar+
  // zmiana) — z definicji NIE administratora — obsState.obszary zostawałoby
  // więc puste przez cały czas działania aplikacji, mimo że to właśnie ta
  // lista jest potrzebna do poprawnego pokazania check-listy. Bezpieczne do
  // ponownego załadowania niżej dla adminów (idempotentne).
  obsState.obszary = await DB.getObszary();
  // Tak samo brygadzisciList (starszy magazyn danych) — używany jako
  // mechanizm zapasowy w check-liście niezależnie od roli, więc musi być
  // dostępny zawsze, nie tylko dla administratorów.
  obsState.brygadzisciList = await DB.getBrygadzisciList();
  // Koordynatorzy potrzebni od razu (nowa, osobna lista obecności koordynatorów
  // na głównym widoku) — wcześniej ładowani dopiero przy wizycie w zakładce
  // Ustawienia, co przy pierwszym wejściu do modułu dawałoby pustą listę.
  obsState.koordynatorzy = await DB.getKoordynatorzy();

  // Jednorazowa migracja: scal duplikaty brygadzistów z ręcznie dodanymi pracownikami
  await migrateMergeBrygadzistaDuplicates();

  // Telefon/urządzenie przypisane do JEDNEGO stanowiska (obszar+zmiana) — od
  // razu pokaż tę check-listę, zablokowaną, żeby nie dało się przypadkiem
  // przełączyć na inny obszar czy zmianę z tego samego urządzenia. Musi się
  // to dziać TUTAJ (nie w initAuth() w app.js) — dopiero w tym miejscu mamy
  // pewność, że obsState.employees/obszary są już wczytane z bazy, więc
  // check-lista faktycznie znajdzie ludzi, zamiast wyglądać na pustą.
  //
  // WAŻNE: initAuth() (app.js) i initObecnosc() (ten plik) to dwie osobne,
  // asynchroniczne sekwencje operacji na bazie, uruchamiane niemal równocześnie
  // — SAMA kolejność plików <script> NIE gwarantuje, że currentUser ma już
  // swoją ostateczną wartość w tym miejscu. Czekamy więc na to JAWNIE, zamiast
  // zgadywać — dopiero to naprawdę gwarantuje poprawną kolejność za każdym
  // razem, niezależnie od szybkości urządzenia czy ilości danych.
  if (typeof window !== 'undefined' && window.__authReady) await window.__authReady;
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'obszar' && currentUser.obszarId && currentUser.obszarShift) {
    // WAŻNE: renderChecklistSelectors() (wypełnia opcje selecta "Obszar")
    // jest normalnie wołana z onLoginSuccess() w app.js — ale w TYM miejscu
    // (app.js) obecnosc.js jeszcze się nie załadował, więc to wywołanie
    // zawsze cicho nic nie robi (zabezpieczenie typeof===function je pomija).
    // Bez tego attObszar miałby tylko domyślną, pustą opcję z HTML, a próba
    // ustawienia .value poniżej nic by nie dała (brak pasującej <option>).
    // Wywołujemy więc tutaj jawnie, teraz, gdy funkcja na pewno istnieje.
    renderChecklistSelectors();
    const obszarSel = document.getElementById('attObszar');
    const shiftSel = document.getElementById('attShift');
    if (obszarSel && shiftSel) {
      obszarSel.value = currentUser.obszarId;
      obszarSel.disabled = true;
      await fillShiftDropdownForObszar(currentUser.obszarId);
      shiftSel.value = currentUser.obszarShift;
      shiftSel.disabled = true;
      // WAŻNE: NIE wołamy openModule('obecnosc') — ta funkcja renderuje NARAZ
      // wszystkie zakładki modułu (Kalendarz, Statystyki, Urlopy, Pracownicy),
      // mimo że user widzi tylko zakładkę "Obecność". To wcale nie jest
      // potrzebne i ryzykowne — te pozostałe zakładki i tak renderują się
      // poprawnie same, świeżo, w momencie gdy user je faktycznie otworzy
      // (przez switchTab). Pokazujemy więc tylko sam moduł + jego pierwszą
      // zakładkę, tak jak robi to openModule, ale bez tego zbędnego kroku.
      document.getElementById('homeScreen').style.display = 'none';
      if (typeof MODULES !== 'undefined') MODULES.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      document.body.style.paddingBottom = '80px';
      const moduleEl = document.getElementById('moduleObecnosc');
      if (moduleEl) moduleEl.style.display = 'block';
      switchTab('obsAttendance');
      const fab1 = document.getElementById('addMachineFab');
      if (fab1) fab1.style.display = 'none';
      const fab2 = document.getElementById('addDeviceFab');
      if (fab2) fab2.style.display = 'none';
    }
  }

  renderEmployeeList();
  renderAttendanceForm();
  renderKoordAttendanceForm();
  renderCalendarActiveView();
  renderObsStats();
  renderLeaveList();
  renderObsSettings();
  updateObsHeaderCounter();
}

// Migracja: jeśli istnieje wpis auto (linkedBrygadzistaEntryId) I osobny wpis ręczny
// o tym samym nazwisku+imieniu, usuń auto-wpis i dodaj linkedBrygadzistaEntryId do ręcznego.
// Historia obecności z auto-wpisu zostaje zachowana przez migrację rekordów.
async function migrateMergeBrygadzistaDuplicates() {
  const autoEmps = obsState.employees.filter(e => e.linkedBrygadzistaEntryId);
  let changed = false;

  for (const autoEmp of autoEmps) {
    // Szukaj ręcznego wpisu o tym samym nazwisku i imieniu (bez linkedBrygadzistaEntryId)
    const manual = obsState.employees.find(e =>
      !e.linkedBrygadzistaEntryId &&
      e.id !== autoEmp.id &&
      e.firstName === autoEmp.firstName &&
      e.lastName === autoEmp.lastName
    );
    if (!manual) continue;

    // Scal: przenieś linkedBrygadzistaEntryId na wpis ręczny
    manual.linkedBrygadzistaEntryId = autoEmp.linkedBrygadzistaEntryId;
    await DB.saveEmployee(manual);

    // Zaktualizuj rekordy obecności: zamień autoEmp.id na manual.id
    for (const rec of obsState.attendanceRecords) {
      let recChanged = false;
      for (const entry of rec.entries) {
        if (entry.employeeId === autoEmp.id) {
          entry.employeeId = manual.id;
          recChanged = true;
        }
      }
      if (recChanged) await DB.saveAttendance(rec);
    }

    // Zaktualizuj urlopy
    for (const leave of obsState.leaveRequests) {
      if (leave.employeeId === autoEmp.id) {
        leave.employeeId = manual.id;
        await DB.saveLeaveRequest(leave);
      }
    }

    // Usuń auto-wygenerowany duplikat
    await DB.deleteEmployee(autoEmp.id);
    obsState.employees = obsState.employees.filter(e => e.id !== autoEmp.id);

    // Zaktualizuj ręczny wpis w stanie
    const idx = obsState.employees.findIndex(e => e.id === manual.id);
    if (idx >= 0) obsState.employees[idx] = manual;

    changed = true;
    console.log(`[migracja] Scalono duplikat: ${manual.lastName} ${manual.firstName}`);
  }

  if (changed) {
    // Odśwież stan z bazy żeby mieć pewność
    obsState.employees = await DB.getAllEmployees();
    obsState.attendanceRecords = await DB.getAllAttendance();
    obsState.leaveRequests = await DB.getAllLeaveRequests();
  }
}

function updateObsHeaderCounter() {
  const active = obsState.employees.filter(e => e.active !== 0).length;
  // Można dodać w nagłówku jeśli potrzeba
}

// ===== ZARZĄDZANIE PRACOWNIKAMI =====
function renderEmployeeList() {
  // Pokazujemy wszystkich pracowników łącznie z brygadzistami (scaleni w jeden wpis).
  // WYJĄTEK: "cień" konta koordynatora (linkedKoordynatorId) NIE pojawia się tutaj —
  // koordynator to osobna funkcja, niezależna od brygadzistów/pracowników, i nie ma
  // przypisanej zmiany ani brygadzisty. Zarządza się nim wyłącznie w sekcji
  // "Koordynatorzy" — jego wpis w employees istnieje tylko technicznie, żeby dało
  // się go zaznaczyć na check-liście obecności, i nie powinien być tu edytowalny.
  const searchInput = document.getElementById('empSearchInput');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const list = obsState.employees
    .filter(e => !e.linkedKoordynatorId)
    .filter(e => !query ||
      `${e.firstName || ''} ${e.lastName || ''}`.toLowerCase().includes(query) ||
      `${e.lastName || ''} ${e.firstName || ''}`.toLowerCase().includes(query))
    .slice()
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'pl'));
  const container = document.getElementById('empList');
  const empty = document.getElementById('empListEmpty');
  if (!container) return;

  const active = list.filter(e => e.active !== 0);
  const inactive = list.filter(e => e.active === 0);

  if (list.length === 0) {
    container.innerHTML = '';
    if (empty) {
      empty.style.display = 'block';
      empty.querySelector('div:last-child').textContent = query
        ? `Brak pracowników pasujących do "${searchInput.value.trim()}".`
        : 'Brak pracowników. Dodaj pierwszego pracownika.';
    }
    return;
  }
  if (empty) empty.style.display = 'none';

  const renderGroup = (arr, label, badgeClass) => arr.length === 0 ? '' : `
    <div class="section-title">${label}</div>
    ${arr.map(e => `
      <div class="machine-item" style="cursor:default;">
        <div>
          <div class="mname">${escapeHtml(e.lastName)} ${escapeHtml(e.firstName)}</div>
          <div class="mmeta">${e.kategoria ? escapeHtml(e.kategoria) + ' • ' : ''}${shiftLabel(e.shift)} • ${e.type === 'outsourcing' ? 'Outsourcing' : 'Etat'}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="badge ${badgeClass}">${e.active !== 0 ? 'Aktywny' : 'Nieaktywny'}</span>
          <button class="btn small secondary" data-emp-edit="${e.id}">✏️</button>
          <button class="btn small danger" data-emp-toggle="${e.id}">${e.active !== 0 ? 'Deaktywuj' : 'Aktywuj'}</button>
        </div>
      </div>
    `).join('')}
  `;

  container.innerHTML = renderGroup(active, 'Aktywni pracownicy', 'ok') + renderGroup(inactive, 'Nieaktywni', 'neutral');

  container.querySelectorAll('[data-emp-edit]').forEach(btn => {
    btn.addEventListener('click', () => openEmployeeModal(btn.dataset.empEdit));
  });
  container.querySelectorAll('[data-emp-toggle]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const emp = obsState.employees.find(e => e.id === btn.dataset.empToggle);
      if (!emp) return;
      const action = emp.active !== 0 ? 'deaktywować' : 'aktywować';
      if (!confirm(`Czy na pewno chcesz ${action} pracownika ${emp.lastName} ${emp.firstName}?`)) return;
      emp.active = emp.active !== 0 ? 0 : 1;
      await DB.saveEmployee(emp);
      renderEmployeeList();
      renderAttendanceForm();
      showToast(emp.active !== 0 ? 'Pracownik aktywowany' : 'Pracownik deaktywowany');
    });
  });
}

function openEmployeeModal(empId, prefillBrygId) {
  obsState.editingEmployeeId = empId || null;
  if (typeof prefillBrygId !== 'undefined') obsState.empModalPrefillBrygId = prefillBrygId || null;
  const titleEl = document.getElementById('empModalTitle');
  const delBtn = document.getElementById('deleteEmpBtn');
  fillEmpKategoriaSelect();
  fillEmpNadzorujeObszarSelect();

  if (empId) {
    const e = obsState.employees.find(x => x.id === empId);
    if (!e) return;
    titleEl.textContent = 'Edytuj pracownika';
    document.getElementById('empFirstName').value = e.firstName || '';
    document.getElementById('empLastName').value = e.lastName || '';
    document.getElementById('empType').value = e.type || 'etat';
    document.getElementById('empKategoria').value = e.kategoria || '';
    document.getElementById('empShift').value = e.shift || '';
    document.getElementById('empNote').value = e.note || '';
    updateEmpShiftOptions(e.type);
    document.getElementById('empShift').value = e.shift || '';
    updateEmpBrygadzistaOptions(e.shift, getEmpBrygadzistaIds(e));
    document.getElementById('empNadzorujeObszar').value = e.nadzorujeObszarId || '';
    updateEmpNadzorujeShiftsChecklist(e.nadzorujeShiftIds || []);
    toggleEmpNadzorujeField();
    delBtn.style.display = 'inline-block';
  } else {
    titleEl.textContent = 'Nowy pracownik';
    document.getElementById('empFirstName').value = '';
    document.getElementById('empLastName').value = '';
    document.getElementById('empType').value = 'etat';
    document.getElementById('empKategoria').value = 'Pracownik etatowy';
    document.getElementById('empNote').value = '';
    updateEmpShiftOptions('etat');
    const prefill = obsState.empModalPrefillBrygId ? [obsState.empModalPrefillBrygId] : [];
    updateEmpBrygadzistaOptions(document.getElementById('empShift').value, prefill);
    document.getElementById('empNadzorujeObszar').value = '';
    updateEmpNadzorujeShiftsChecklist([]);
    toggleEmpNadzorujeField();
    delBtn.style.display = 'none';
  }
  document.getElementById('empModalOverlay').classList.add('active');
}

// Lista kategorii jest edytowalna (Ustawienia), więc odczytujemy ją z cache
// wypełnianego przy starcie zamiast na sztywno — synchronicznie, bo modal
// otwiera się natychmiast po kliknięciu, bez czekania na bazę danych.
function fillEmpKategoriaSelect() {
  const sel = document.getElementById('empKategoria');
  if (!sel) return;
  const kategorie = obsState.kategorie || [];
  sel.innerHTML = kategorie.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
}

// Pole "Nadzoruje obszar i zmianę" ma sens TYLKO dla kategorii zaczynających
// się od "Brygadzista" — to ono decyduje, na czyjej check-liście ta osoba
// pojawi się jako opiekun (zastępuje dawny osobny formularz "Dodaj brygadzistę").
function toggleEmpNadzorujeField() {
  const field = document.getElementById('empNadzorujeField');
  const kategoria = document.getElementById('empKategoria').value;
  if (field) field.style.display = kategoria.startsWith('Brygadzista') ? 'block' : 'none';
}
document.getElementById('empKategoria') && document.getElementById('empKategoria').addEventListener('change', toggleEmpNadzorujeField);

function fillEmpNadzorujeObszarSelect() {
  const sel = document.getElementById('empNadzorujeObszar');
  if (!sel) return;
  const obszary = (obsState.obszary || []).slice().sort((a, b) => (a.nazwa || '').localeCompare(b.nazwa || '', 'pl'));
  sel.innerHTML = '<option value="">— wybierz obszar —</option>' +
    obszary.map(o => `<option value="${o.id}">${escapeHtml(o.nazwa)}</option>`).join('');
}

function updateEmpNadzorujeShiftsChecklist(selectedShiftIds) {
  const wrap = document.getElementById('empNadzorujeShiftsChecklist');
  if (!wrap) return;
  wrap.innerHTML = ALL_SHIFTS.map(s => `
    <label><input type="checkbox" value="${s.id}" ${selectedShiftIds.includes(s.id) ? 'checked' : ''}> ${escapeHtml(s.label)}</label>
  `).join('');
}

function updateEmpShiftOptions(type) {
  const sel = document.getElementById('empShift');
  const shifts = type === 'outsourcing' ? SHIFT_DEFS.outsourcing : SHIFT_DEFS.etat;
  sel.innerHTML = shifts.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');
}

// Zwraca listę ID brygadzistów przypisanych do pracownika, obsługując też stare
// dane sprzed wprowadzenia wielokrotnego przypisania (pojedyncze brygadzistaId).
function getEmpBrygadzistaIds(emp) {
  if (Array.isArray(emp.brygadzistaIds)) return emp.brygadzistaIds;
  return emp.brygadzistaId ? [emp.brygadzistaId] : [];
}

// Pokazuje checkboxy brygadzistów obejmujących wybraną zmianę (pracownik może być
// przypisany do kilku naraz — np. gdy na jednej zmianie dzielą nadzór dwie osoby).
function updateEmpBrygadzistaOptions(shiftId, selectedIds) {
  const wrap = document.getElementById('empBrygadzistaChecklist');
  const emptyHint = document.getElementById('empBrygadzistaEmpty');
  const hint = document.getElementById('empBrygadzistaHint');
  if (!wrap) return;
  // Ta sama, wspólna lista osób co wszędzie indziej — brygadzista to teraz
  // zwykła osoba z kategorią, nie osobny magazyn danych.
  let list = (obsState.employees || []).filter(e => e.active !== 0 && (e.kategoria || '').startsWith('Brygadzista'));
  // ZABEZPIECZENIE: jeśli migracja "Scal brygadzistów..." (Ustawienia) jeszcze
  // nie została uruchomiona na tym urządzeniu, powyższe będzie puste — sięgnij
  // po stary magazyn danych, żeby lista przypisania NIGDY nie znikała.
  if (!list.length) {
    list = (obsState.brygadzisciList || [])
      .map(b => obsState.employees.find(e => e.linkedBrygadzistaEntryId === b.id && e.active !== 0))
      .filter(Boolean);
  }
  // Pokazujemy WSZYSTKICH brygadzistów — pracownik może mieć brygadzistę
  // outsourcingu (swoja zmiana) I brygadzistę etatowego (inna zmiana, np. 6-14)
  const options = list;
  const sel = selectedIds || [];

  if (!options.length) {
    wrap.innerHTML = '';
    if (emptyHint) emptyHint.style.display = 'block';
    return;
  }
  if (emptyHint) emptyHint.style.display = 'none';

  // Zawsze checkboxy — dowolna liczba brygadzistów dla każdego typu pracownika
  if (hint) hint.textContent = 'Przypisz do brygadzisty/ów (można zaznaczyć kilku):';
  wrap.innerHTML = options.map(b => {
    const obszar = (obsState.obszary || []).find(o => o.id === b.nadzorujeObszarId);
    const checked = sel.includes(b.id) ? 'checked' : '';
    const typLabel = b.kategoria === 'Brygadzista outsourcing' ? 'Outsourcing' : 'Etatowy';
    return `<label style="display:block;margin-bottom:6px;padding:8px 10px;background:var(--bg2);border-radius:7px;cursor:pointer;">
      <input type="checkbox" value="${b.id}" ${checked} style="margin-right:8px;">
      ${escapeHtml(b.firstName)} ${escapeHtml(b.lastName)}
      <span style="font-size:11px;color:var(--text-dim);"> (${escapeHtml(obszar ? obszar.nazwa : '—')} • ${typLabel})</span>
    </label>`;
  }).join('');
  wrap.dataset.mode = 'checkbox';
}

document.getElementById('empType').addEventListener('change', (e) => {
  updateEmpShiftOptions(e.target.value);
  updateEmpBrygadzistaOptions(document.getElementById('empShift').value, []);
});
document.getElementById('empShift').addEventListener('change', (e) => {
  updateEmpBrygadzistaOptions(e.target.value, []);
});

document.getElementById('closeEmpModal').addEventListener('click', () => {
  document.getElementById('empModalOverlay').classList.remove('active');
});
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. (empModalOverlay)

document.getElementById('saveEmpBtn').addEventListener('click', async () => {
  const lastName = document.getElementById('empLastName').value.trim();
  const firstName = document.getElementById('empFirstName').value.trim();
  if (!lastName) { showToast('Podaj nazwisko pracownika'); return; }

  let emp;
  let isNew = false;
  if (obsState.editingEmployeeId) {
    emp = obsState.employees.find(e => e.id === obsState.editingEmployeeId);
    if (!emp) return;
  } else {
    // Sprawdź, czy taka osoba już nie istnieje na liście — łatwo przy pracy
    // "w pośpiechu" dodać kogoś po raz drugi. Sprawdzamy WSZYSTKICH (też
    // nieaktywnych — może ktoś wraca po przerwie i lepiej go aktywować niż
    // zdublować) po imieniu i nazwisku, bez rozróżniania wielkości liter.
    const lastNameL = lastName.toLowerCase();
    const firstNameL = firstName.toLowerCase();
    const duplikat = obsState.employees.find(e =>
      !e.linkedKoordynatorId &&
      (e.lastName || '').trim().toLowerCase() === lastNameL &&
      (e.firstName || '').trim().toLowerCase() === firstNameL
    );
    // Osobno: czy istnieje osoba z DOKŁADNIE ZAMIENIONYMI polami (np. ktoś
    // wpisał "Kowalski" jako imię, a "Jan" jako nazwisko) — inaczej wygląda
    // to na dwie różne osoby, mimo że to najpewniej ta sama, tylko odwrotnie
    // wpisana. Nie sprawdzamy tego, gdy imię i nazwisko są takie same
    // (np. "Maria Maria") — wtedy zamiana i tak niczego by nie zmieniła.
    const zamieniony = !duplikat && firstNameL !== lastNameL
      ? obsState.employees.find(e =>
          !e.linkedKoordynatorId &&
          (e.lastName || '').trim().toLowerCase() === firstNameL &&
          (e.firstName || '').trim().toLowerCase() === lastNameL
        )
      : null;

    if (duplikat) {
      const status = duplikat.active !== 0 ? 'aktywny' : 'nieaktywny';
      const kontynuowac = confirm(
        `Osoba "${firstName} ${lastName}" już jest na liście (${status}). ` +
        `Czy na pewno chcesz dodać drugą, osobną osobę o tym samym imieniu i nazwisku?\n\n` +
        `Jeśli to ta sama osoba — kliknij Anuluj i edytuj istniejący wpis zamiast dodawać nowy.`
      );
      if (!kontynuowac) return;
    } else if (zamieniony) {
      const status = zamieniony.active !== 0 ? 'aktywny' : 'nieaktywny';
      const kontynuowac = confirm(
        `Na liście jest już "${zamieniony.firstName} ${zamieniony.lastName}" (${status}) — te same imię i nazwisko, ` +
        `tylko zamienione miejscami z tym, co właśnie wpisujesz. To najpewniej ta sama osoba, wpisana odwrotnie do pola Imię/Nazwisko.\n\n` +
        `Czy na pewno chcesz dodać ją jako drugą, osobną osobę? Jeśli to pomyłka — kliknij Anuluj i popraw kolejność pól.`
      );
      if (!kontynuowac) return;
    }
    emp = {};
    isNew = true;
  }

  emp.lastName = lastName;
  emp.firstName = firstName;
  emp.type = document.getElementById('empType').value;
  emp.kategoria = document.getElementById('empKategoria').value;
  emp.shift = document.getElementById('empShift').value;

  if (emp.kategoria.startsWith('Brygadzista')) {
    emp.nadzorujeObszarId = document.getElementById('empNadzorujeObszar').value || null;
    const shiftsWrap = document.getElementById('empNadzorujeShiftsChecklist');
    emp.nadzorujeShiftIds = shiftsWrap
      ? Array.from(shiftsWrap.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value)
      : [];
  } else {
    emp.nadzorujeObszarId = null;
    emp.nadzorujeShiftIds = [];
  }

  // Zawsze checkboxy — dowolna liczba brygadzistów dla wszystkich typów
  const wrap = document.getElementById('empBrygadzistaChecklist');
  const selectedBrygIds = wrap
    ? Array.from(wrap.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value)
    : [];
  emp.brygadzistaIds = selectedBrygIds;
  emp.brygadzistaId = null;
  emp.note = document.getElementById('empNote').value.trim();
  if (typeof emp.active === 'undefined') emp.active = 1;

  await DB.saveEmployee(emp);
  if (isNew) obsState.employees.push(emp);

  renderEmployeeList();
  renderAttendanceForm();
  if (isNew) {
    openEmployeeModal(null, obsState.empModalPrefillBrygId); // zostaw okno otwarte, gotowe na kolejnego (ten sam brygadzista nadal zaznaczony)
    showToast('Pracownik dodany — możesz dodać kolejnego');
  } else {
    document.getElementById('empModalOverlay').classList.remove('active');
    showToast('Pracownik zaktualizowany');
  }
});

document.getElementById('deleteEmpBtn').addEventListener('click', async () => {
  if (!obsState.editingEmployeeId) return;
  if (!confirm('Usunąć tego pracownika? Historia obecności zostanie zachowana.')) return;
  await DB.deleteEmployee(obsState.editingEmployeeId);
  obsState.employees = obsState.employees.filter(e => e.id !== obsState.editingEmployeeId);
  document.getElementById('empModalOverlay').classList.remove('active');
  renderEmployeeList();
  renderAttendanceForm();
  showToast('Pracownik usunięty');
});

document.getElementById('addEmpBtn').addEventListener('click', () => openEmployeeModal(null, null));
document.getElementById('empSearchInput') && document.getElementById('empSearchInput').addEventListener('input', renderEmployeeList);

// ===== WPROWADZANIE OBECNOŚCI (widok dzienny) =====
// ===== CHECK-LISTA OBECNOŚCI =====
function shiftHoursBetween(from, to) {
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  let mins = (th * 60 + tm) - (fh * 60 + fm);
  if (mins < 0) mins += 24 * 60; // nocna zmiana
  return Math.round(mins / 60 * 10) / 10;
}

// Efektywny wpis dla pracownika: override wprowadzony w tej sesji (albo wczytany z już
// zapisanego rekordu) ma pierwszeństwo, w drugiej kolejności — zatwierdzony/planowany urlop
// pokrywający ten dzień, inaczej brak wpisu (pusty checkbox).
function getChecklistEffectiveEntry(emp, date, overrides) {
  overrides = overrides || obsState.checklistOverrides;
  const ov = overrides[emp.id];
  // Jawnie usunięty w tej sesji edycji (przycisk "Usuń wpis tej osoby") —
  // traktuj jak brak wpisu w samym widoku check-listy, tak jak osobę, której
  // jeszcze nikt nie tknął. Dopiero przy zapisie ma to inne znaczenie
  // (patrz saveAttBtn) — pomija ją całkowicie zamiast dawać domyślny NN.
  if (ov && ov.removed) return null;
  if (ov) return ov;
  const leave = obsState.leaveRequests.find(l =>
    l.status !== 'rejected' && l.employeeId === emp.id && l.dateFrom <= date && l.dateTo >= date);
  if (leave) return { status: leave.type, hoursFrom: '', hoursTo: '', hours: 0, note: '', fromLeave: true };
  return null;
}

function checklistRowHtml(emp, date) {
  const eff = getChecklistEffectiveEntry(emp, date);
  const isPresent = eff && DB.PRESENT_STATUSES.includes(eff.status);
  const isOtherStatus = eff && !DB.PRESENT_STATUSES.includes(eff.status);
  const statusDef = eff ? DB.ATTENDANCE_STATUSES[eff.status] : null;
  const brygBadge = emp.linkedBrygadzistaEntryId
    ? ' <span class="badge neutral" style="font-size:10px;">Brygadzista</span>'
    : '';

  return `
    <div class="checklist-row" data-emp="${emp.id}">
      <input type="checkbox" class="checklist-checkbox" data-emp="${emp.id}"
        ${isPresent ? 'checked' : ''} ${isOtherStatus ? 'style="visibility:hidden;"' : ''}>
      ${isOtherStatus
        ? `<span class="badge" style="background:${statusDef.color};color:${statusDef.textColor};min-width:38px;text-align:center;">${eff.status}</span>`
        : '<span style="min-width:38px;"></span>'}
      <span class="checklist-name">${escapeHtml(emp.lastName)} ${escapeHtml(emp.firstName)}${brygBadge}</span>
      <button class="checklist-expand" data-emp="${emp.id}" title="Szczegóły / zmień godziny">⋯</button>
    </div>
  `;
}

function wireChecklistRowEvents(date) {
  document.querySelectorAll('.checklist-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const empId = cb.dataset.emp;
      const emp = obsState.employees.find(e => e.id === empId);
      if (cb.checked) {
        const entry = { status: 'T', hoursFrom: '', hoursTo: '', hours: 0, note: '' };
        const shift = document.getElementById('attShift').value;
        if (emp.type === 'outsourcing') {
          // Outsourcing: 12h, domyślne godziny zmiany
          entry.hoursFrom = shift === 'out1' ? '06:00' : '18:00';
          entry.hoursTo   = shift === 'out1' ? '18:00' : '06:00';
          entry.hours = shiftHoursBetween(entry.hoursFrom, entry.hoursTo);
        } else {
          // Etat: standardowe godziny zmiany jako punkt startowy — można zmienić przez ⋯
          const sdef = SHIFT_DEFS.etat.find(s => s.id === emp.shift);
          if (sdef) {
            entry.hoursFrom = sdef.start || '';
            entry.hoursTo   = sdef.end   || '';
          }
          entry.hours = shiftHours(emp.shift);
        }
        obsState.checklistOverrides[empId] = entry;
      } else {
        delete obsState.checklistOverrides[empId];
      }
    });
  });
  document.querySelectorAll('.checklist-expand').forEach(btn => {
    btn.addEventListener('click', () => openChecklistDetailModal(btn.dataset.emp, date));
  });
}

function refreshChecklistRow(empId, date) {
  const emp = obsState.employees.find(e => e.id === empId);
  const row = document.querySelector(`.checklist-row[data-emp="${empId}"]`);
  if (row && emp) {
    row.outerHTML = checklistRowHtml(emp, date);
    wireChecklistRowEvents(date);
  }
}

let checklistDetailEmpId = null;
let checklistDetailDate = null;
let checklistDetailIsKoord = false;

function openChecklistDetailModal(empId, date, isKoord) {
  checklistDetailEmpId = empId;
  checklistDetailDate = date;
  checklistDetailIsKoord = !!isKoord;
  const emp = obsState.employees.find(e => e.id === empId);
  if (!emp) return;
  document.getElementById('checklistDetailName').textContent = `${emp.lastName} ${emp.firstName}`;

  const statusSel = document.getElementById('checklistDetailStatus');
  const statusKeys = Object.keys(DB.ATTENDANCE_STATUSES);
  statusSel.innerHTML = '<option value="">— brak wpisu (nieobecność) —</option>' +
    statusKeys.map(k => `<option value="${k}">${k} — ${DB.ATTENDANCE_STATUSES[k].label}</option>`).join('');

  const overrides = checklistDetailIsKoord ? (obsState.koordChecklistOverrides || {}) : obsState.checklistOverrides;
  const eff = getChecklistEffectiveEntry(emp, date, overrides) || {};
  statusSel.value = eff.status || '';
  document.getElementById('checklistDetailFrom').value = eff.hoursFrom || '';
  document.getElementById('checklistDetailTo').value = eff.hoursTo || '';
  document.getElementById('checklistDetailNote').value = eff.note || '';
  document.getElementById('checklistDetailHoursRow').style.display = 'flex'; // zawsze — etat też może mieć nadgodziny

  document.getElementById('checklistDetailModalOverlay').classList.add('active');
}

document.getElementById('closeChecklistDetailModal').addEventListener('click', () => {
  document.getElementById('checklistDetailModalOverlay').classList.remove('active');
});

document.getElementById('saveChecklistDetailBtn').addEventListener('click', () => {
  const emp = obsState.employees.find(e => e.id === checklistDetailEmpId);
  if (!emp) return;
  const status = document.getElementById('checklistDetailStatus').value;
  const overrides = checklistDetailIsKoord
    ? (obsState.koordChecklistOverrides || (obsState.koordChecklistOverrides = {}))
    : obsState.checklistOverrides;

  if (!status) {
    delete overrides[checklistDetailEmpId];
  } else {
    const hoursFrom = document.getElementById('checklistDetailFrom').value;
    const hoursTo = document.getElementById('checklistDetailTo').value;
    const note = document.getElementById('checklistDetailNote').value.trim();
    let hours = 0;
    if (DB.PRESENT_STATUSES.includes(status)) {
      if (hoursFrom && hoursTo) {
        // Jeśli wpisano godziny — użyj faktycznego czasu (działa dla obu typów)
        hours = shiftHoursBetween(hoursFrom, hoursTo);
      } else if (emp.type === 'etat') {
        // Brak godzin dla etatowego — użyj standardowych godzin zmiany
        hours = shiftHours(emp.shift);
      }
    }
    overrides[checklistDetailEmpId] = { status, hoursFrom, hoursTo, hours, note };
  }

  document.getElementById('checklistDetailModalOverlay').classList.remove('active');
  if (checklistDetailIsKoord) refreshKoordChecklistRow(checklistDetailEmpId, checklistDetailDate);
  else refreshChecklistRow(checklistDetailEmpId, checklistDetailDate);
});

document.getElementById('clearChecklistDetailBtn').addEventListener('click', () => {
  const overrides = checklistDetailIsKoord ? (obsState.koordChecklistOverrides || {}) : obsState.checklistOverrides;
  // WAŻNE: nie samo `delete` — to zostawiało osobę "niedotkniętą", więc przy
  // zapisie dostawała domyślny status "Nieobecny (NN)" zamiast faktycznie
  // zniknąć z zapisanego rekordu (i z kalendarza). Jawny znacznik `removed`
  // każe budowaniu wpisów przy zapisie CAŁKOWICIE pominąć tę osobę.
  overrides[checklistDetailEmpId] = { employeeId: checklistDetailEmpId, removed: true };
  document.getElementById('checklistDetailModalOverlay').classList.remove('active');
  if (checklistDetailIsKoord) refreshKoordChecklistRow(checklistDetailEmpId, checklistDetailDate);
  else refreshChecklistRow(checklistDetailEmpId, checklistDetailDate);
});

// ===== OBECNOŚĆ KOORDYNATORÓW (osobna, niezależna od obszaru/zmiany) =====
// Koordynator to nadzór globalny, bez stałej zmiany — może pracować w dowolnym
// systemie zmianowym (nawet 3-zmianowym), więc nie da się go na sztywno wpiąć
// w check-listę konkretnego obszaru/zmiany tak jak brygadzistów/pracowników.
// Zamiast tego ma własną, prostą listę obecności: jeden wpis na dzień.
function renderKoordAttendanceForm() {
  const container = document.getElementById('koordAttFormContainer');
  const empty = document.getElementById('koordAttEmpty');
  if (!container) return;
  const date = document.getElementById('koordAttDate').value || todayStr();

  const koordEmps = [];
  (obsState.koordynatorzy || []).forEach(k => {
    const emp = obsState.employees.find(e => e.linkedKoordynatorId === k.id && e.active !== 0);
    if (emp) koordEmps.push(emp);
  });

  if (!koordEmps.length) {
    container.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  const dateShift = date + '_koordynatorzy';
  const existing = obsState.attendanceRecords.find(r => r.dateShift === dateShift);
  obsState.koordChecklistOverrides = {};
  if (existing) {
    existing.entries.forEach(entry => { obsState.koordChecklistOverrides[entry.employeeId] = { ...entry }; });
  }

  const sorted = koordEmps.slice().sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '', 'pl'));
  container.innerHTML = `<div id="koordChecklistRowsWrap">${sorted.map(emp => koordChecklistRowHtml(emp, date)).join('')}</div>`;
  wireKoordChecklistRowEvents(date);
}

function koordChecklistRowHtml(emp, date) {
  const eff = getChecklistEffectiveEntry(emp, date, obsState.koordChecklistOverrides || {});
  const isPresent = eff && DB.PRESENT_STATUSES.includes(eff.status);
  const isOtherStatus = eff && !DB.PRESENT_STATUSES.includes(eff.status);
  const statusDef = eff ? DB.ATTENDANCE_STATUSES[eff.status] : null;
  return `
    <div class="checklist-row" data-koord-row="${emp.id}">
      <input type="checkbox" class="koord-checklist-checkbox" data-emp="${emp.id}"
        ${isPresent ? 'checked' : ''} ${isOtherStatus ? 'style="visibility:hidden;"' : ''}>
      ${isOtherStatus
        ? `<span class="badge" style="background:${statusDef.color};color:${statusDef.textColor};min-width:38px;text-align:center;">${eff.status}</span>`
        : '<span style="min-width:38px;"></span>'}
      <span class="checklist-name">${escapeHtml(emp.lastName)} ${escapeHtml(emp.firstName)}</span>
      <button class="checklist-expand" data-emp="${emp.id}" title="Szczegóły / zmień godziny">⋯</button>
    </div>
  `;
}

function wireKoordChecklistRowEvents(date) {
  document.querySelectorAll('.koord-checklist-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const empId = cb.dataset.emp;
      if (cb.checked) {
        obsState.koordChecklistOverrides[empId] = { status: 'T', hoursFrom: '', hoursTo: '', hours: 0, note: '' };
      } else {
        delete obsState.koordChecklistOverrides[empId];
      }
    });
  });
  document.querySelectorAll('#koordChecklistRowsWrap .checklist-expand').forEach(btn => {
    btn.addEventListener('click', () => openChecklistDetailModal(btn.dataset.emp, date, true));
  });
}

function refreshKoordChecklistRow(empId, date) {
  const emp = obsState.employees.find(e => e.id === empId);
  const row = document.querySelector(`[data-koord-row="${empId}"]`);
  if (row && emp) {
    row.outerHTML = koordChecklistRowHtml(emp, date);
    wireKoordChecklistRowEvents(date);
  }
}

document.getElementById('koordAttDate') && document.getElementById('koordAttDate').addEventListener('change', renderKoordAttendanceForm);

document.getElementById('saveKoordAttBtn') && document.getElementById('saveKoordAttBtn').addEventListener('click', async () => {
  const date = document.getElementById('koordAttDate').value;
  if (!date) { showToast('Wybierz datę'); return; }
  const dateShift = date + '_koordynatorzy';

  const koordEmps = [];
  (obsState.koordynatorzy || []).forEach(k => {
    const emp = obsState.employees.find(e => e.linkedKoordynatorId === k.id && e.active !== 0);
    if (emp) koordEmps.push(emp);
  });
  if (!koordEmps.length) { showToast('Brak koordynatorów do zapisania'); return; }

  const entries = koordEmps
    .map(emp => {
      const eff = (obsState.koordChecklistOverrides || {})[emp.id];
      if (eff && eff.removed) return null; // jawnie usunięty — pomiń całkowicie, nie dawaj domyślnego NN
      if (!eff || !eff.status) {
        return { employeeId: emp.id, status: 'NN', hoursFrom: '', hoursTo: '', hours: 0, note: '' };
      }
      return { employeeId: emp.id, status: eff.status, hoursFrom: eff.hoursFrom || '', hoursTo: eff.hoursTo || '', hours: eff.hours || 0, note: eff.note || '' };
    })
    .filter(Boolean);

  let record = obsState.attendanceRecords.find(r => r.dateShift === dateShift);
  if (!record) record = { date, shift: 'koordynatorzy', obszarId: null, dateShift, entries: [], note: '' };
  record.entries = entries;

  await DB.saveAttendance(record);
  const idx = obsState.attendanceRecords.findIndex(r => r.dateShift === record.dateShift);
  if (idx >= 0) obsState.attendanceRecords[idx] = record;
  else obsState.attendanceRecords.push(record);

  renderCalendarActiveView();
  renderObsStats();
  showToast('Obecność koordynatorów zapisana');
});

// ===== Tryb widoku: brygadzista (powiązane konto) vs admin/centrala =====
// Zwraca wpis brygadzisty powiązany z zalogowanym kontem, lub null (admin/niepowiązany)
function getLoggedBrygadzistaEntry() {
  if (typeof currentUser === 'undefined' || !currentUser) return null;
  if (currentUser.isAdmin) return null;
  const bid = currentUser.brygadzistaEntryId;
  if (!bid) return null;
  return (obsState.brygadzisciList || []).find(b => b.id === bid) || null;
}

// Zbiera "swoich" ludzi brygadzisty: pracownicy + inni brygadziści z jego obszaru.
// Zwraca { brygEtat: [...], brygOut: [...], pracownicy: [...] }
// WAŻNE: "swój obszar" to zawsze CAŁY obszar (wszyscy brygadziści i pracownicy
// w nim, niezależnie ilu tam jest brygadzistów) — nie tylko jedna, konkretna
// osoba, z którą powiązano konto. Konto jest powiązane z JEDNĄ osobą tylko po
// to, żeby wiedzieć, KTÓRY to obszar — od tego momentu widok pokazuje WSZYSTKICH.
function collectBrygadzistaPeople(brygEntry) {
  // Najpierw spróbuj ustalić obszar przez NOWY mechanizm (kategoria +
  // nadzorujeObszarId na osobie powiązanej z tym wpisem) — jeśli ta osoba
  // ma już uzupełnione te pola, są one bardziej aktualne niż stary wpis.
  const powiazanaOsoba = obsState.employees.find(e => e.linkedBrygadzistaEntryId === brygEntry.id);
  const obszarId = (powiazanaOsoba && powiazanaOsoba.nadzorujeObszarId) || brygEntry.obszarId;

  let brygEmps = obsState.employees.filter(e =>
    e.active !== 0 && (e.kategoria || '').startsWith('Brygadzista') && e.nadzorujeObszarId === obszarId
  );
  if (!brygEmps.length) {
    // Fallback do starego magazynu danych — dokładnie ten sam wzorzec co
    // w check-liście panelu admina.
    const brygInObszarLegacy = (obsState.brygadzisciList || []).filter(b => b.obszarId === obszarId);
    brygInObszarLegacy.forEach(b => {
      const emp = obsState.employees.find(e => e.linkedBrygadzistaEntryId === b.id && e.active !== 0);
      if (emp && !brygEmps.includes(emp)) brygEmps.push(emp);
    });
  }
  const brygIds = new Set(brygEmps.map(e => e.id));

  const pracownicy = obsState.employees.filter(e =>
    e.active !== 0 &&
    !(e.kategoria || '').startsWith('Brygadzista') && e.kategoria !== 'Koordynator' &&
    getEmpBrygadzistaIds(e).some(id => brygIds.has(id))
  );

  const brygEtat = brygEmps.filter(e => e.kategoria === 'Brygadzista etatowy' || e.type === 'etat');
  const brygOut = brygEmps.filter(e => e.kategoria === 'Brygadzista outsourcing' || (!e.kategoria && e.type === 'outsourcing'));

  return { brygEtat, brygOut, pracownicy };
}

// Konfiguruje widok Obecności zależnie od roli (wywoływane przy wejściu w moduł)
function initAttendanceView() {
  const brygEntry = getLoggedBrygadzistaEntry();
  const adminSelectors = document.getElementById('attSelectorsAdmin');
  const selfShiftField = document.getElementById('attSelfShiftField');
  const title = document.getElementById('attCardTitle');

  if (brygEntry) {
    // TRYB BRYGADZISTY — bez dropdownów obszar/brygadzista
    if (adminSelectors) adminSelectors.style.display = 'none';
    if (title) title.textContent = `Check-lista — ${brygEntry.imie} ${brygEntry.nazwisko}`;
    // Wybór zmiany brygadzisty (jeśli ma kilka)
    const shifts = brygEntry.shiftIds || [];
    if (selfShiftField && shifts.length > 1) {
      selfShiftField.style.display = 'block';
      const sel = document.getElementById('attSelfShift');
      sel.innerHTML = shifts.map(sid => `<option value="${sid}">${escapeHtml(shiftLabel(sid))}</option>`).join('');
    } else if (selfShiftField) {
      selfShiftField.style.display = 'none';
    }
  } else {
    // TRYB ADMIN/CENTRALA — pełne dropdowny
    if (adminSelectors) adminSelectors.style.display = 'block';
    if (selfShiftField) selfShiftField.style.display = 'none';
    if (title) title.textContent = 'Check-lista obecności';
  }
  renderAttendanceForm();
}

// ===== Kaskadowe selektory: Obszar → Brygadzista → Zmiana =====
function renderChecklistSelectors() {
  const obszarSel = document.getElementById('attObszar');
  if (!obszarSel) return;
  obszarSel.innerHTML = '<option value="">— wybierz obszar —</option>' +
    (obsState.obszary || []).map(o => `<option value="${o.id}">${escapeHtml(o.nazwa)}</option>`).join('');
  renderAttendanceForm();
}

// ===== ZMIANA TYGODNIOWA =====
// Klucz tygodnia (pon-nd) dla danej daty — ISO: rok + numer tygodnia
function weekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = (d.getDay() + 6) % 7; // pon=0
  d.setDate(d.getDate() - day + 3); // czwartek tego tygodnia
  const firstThu = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getDay() + 6) % 7)) / 7);
  return d.getFullYear() + '-W' + String(week).padStart(2, '0');
}

// Zapamiętana zmiana dla tygodnia+obszaru (obiekt w obsState, trwałe w settings)
async function getWeeklyShift(obszarId, dateStr) {
  const map = await DB.getSetting('weeklyShifts', {}) || {};
  return map[weekKey(dateStr) + '_' + obszarId] || '';
}
async function setWeeklyShift(obszarId, dateStr, shift) {
  const map = await DB.getSetting('weeklyShifts', {}) || {};
  map[weekKey(dateStr) + '_' + obszarId] = shift;
  await DB.setSetting('weeklyShifts', map);
}

// Wypełnia dropdown zmian WSZYSTKIMI zmianami (brygadziści rotują, więc bez filtra shiftIds)
// i ustawia zapamiętaną zmianę tygodniową jeśli jest.
async function fillShiftDropdownForObszar(obszarId) {
  const shiftSel = document.getElementById('attShift');
  const date = document.getElementById('attDate').value || todayStr();
  if (!obszarId) {
    shiftSel.innerHTML = '<option value="">— najpierw wybierz obszar —</option>';
    return;
  }
  shiftSel.innerHTML = '<option value="">— wybierz zmianę —</option>' +
    ALL_SHIFTS.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');
  // Ustaw zapamiętaną zmianę tygodniową
  const remembered = await getWeeklyShift(obszarId, date);
  if (remembered) shiftSel.value = remembered;
}

document.getElementById('attObszar').addEventListener('change', async () => {
  const obszarId = document.getElementById('attObszar').value;
  await fillShiftDropdownForObszar(obszarId);
  renderAttendanceForm();
});

document.getElementById('attSelfShift') && document.getElementById('attSelfShift').addEventListener('change', renderAttendanceForm);


async function renderAttendanceForm() {
  const container = document.getElementById('attFormContainer');
  const empty = document.getElementById('attFormEmpty');
  if (!container) return;

  const date = document.getElementById('attDate').value || todayStr();
  const brygEntry = getLoggedBrygadzistaEntry();

  if (brygEntry) {
    renderAttendanceFormBrygadzista(brygEntry, date, container, empty);
  } else {
    renderAttendanceFormAdmin(date, container, empty);
  }
}

// ===== TRYB BRYGADZISTY: 3 sekcje, tylko data =====
function renderAttendanceFormBrygadzista(brygEntry, date, container, empty) {
  const shifts = brygEntry.shiftIds || [];
  const shift = shifts.length > 1
    ? (document.getElementById('attSelfShift') ? document.getElementById('attSelfShift').value : shifts[0])
    : (shifts[0] || '');

  const { brygEtat, brygOut, pracownicy } = collectBrygadzistaPeople(brygEntry);
  const allPeople = [...brygEtat, ...brygOut, ...pracownicy];

  if (allPeople.length === 0) {
    container.innerHTML = '';
    if (empty) {
      empty.style.display = 'block';
      empty.querySelector('div:last-child').textContent = 'Brak przypisanych ludzi. Skontaktuj się z administratorem, aby przypisał pracowników do Twojego obszaru.';
    }
    return;
  }
  if (empty) empty.style.display = 'none';

  // Klucz rekordu: data + brygadzista powiązany + zmiana
  const dateShift = date + '_' + brygEntry.id + '_' + shift;
  const existing = obsState.attendanceRecords.find(r => r.dateShift === dateShift);
  obsState.checklistOverrides = {};
  if (existing) {
    existing.entries.forEach(entry => { obsState.checklistOverrides[entry.employeeId] = { ...entry }; });
  }
  const deleteBtnBryg = document.getElementById('deleteAttBtn');
  if (deleteBtnBryg) deleteBtnBryg.style.display = existing ? 'inline-block' : 'none';

  const sortByName = arr => arr.slice().sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '', 'pl'));

  container.innerHTML = `
    <div id="checklistRowsWrap">
      ${buildChecklistSection(sortByName(brygEtat), '👔 Brygadziści etatowi', 'var(--accent2)', date)}
      ${buildChecklistSection(sortByName(brygOut), '🏭 Brygadziści outsourcingu', 'var(--warn)', date)}
      ${buildChecklistSection(sortByName(pracownicy), '👷 Pracownicy', 'var(--accent)', date)}
    </div>
    <div style="margin-top:10px;">
      <textarea id="attDayNote" placeholder="Notatka ogólna do zmiany (opcjonalnie)..."
        style="width:100%;min-height:50px;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:9px;padding:10px;font-size:13.5px;font-family:inherit;box-sizing:border-box;">${existing ? escapeHtml(existing.note || '') : ''}</textarea>
    </div>
  `;
  wireChecklistRowEvents(date);
}

// ===== TRYB ADMIN/CENTRALA: wybór obszar+zmiana, wszyscy z obszaru w 3 sekcjach =====
function renderAttendanceFormAdmin(date, container, empty) {
  const obszarId = document.getElementById('attObszar') ? document.getElementById('attObszar').value : '';
  const shift = document.getElementById('attShift') ? document.getElementById('attShift').value : '';

  if (!obszarId || !shift) {
    container.innerHTML = '';
    if (empty) {
      empty.style.display = 'block';
      empty.querySelector('div:last-child').textContent = 'Wybierz obszar i zmianę, aby zobaczyć check-listę.';
    }
    return;
  }

  // Wszyscy brygadziści nadzorujący TEN obszar i TĘ zmianę — teraz zwykłe
  // osoby z jednej, wspólnej listy (kategoria zaczynająca się od "Brygadzista"),
  // zamiast osobnego magazynu danych jak dawniej. Kilka osób może nadzorować
  // tę samą zmianę naraz (np. nocna zmiana z dwoma brygadzistami) — dokładnie
  // tak samo traktowani jak pracownicy na tej samej check-liście.
  //
  // WAŻNE: typ zatrudnienia brygadzisty (etatowy/outsourcing) NIE decyduje o
  // tym, kogo może nadzorować — etatowy brygadzista może w pełni świadomie
  // nadzorować też pracowników outsourcingu na tej samej zmianie (i odwrotnie).
  // Jedynym wyznacznikiem jest jawne przypisanie (nadzorujeObszarId/ShiftIds
  // albo, w starszych danych, przypisanie w Pracownicy) — nie zgadujemy tego
  // po kategorii.
  let brygEmps = obsState.employees.filter(e =>
    e.active !== 0 &&
    (e.kategoria || '').startsWith('Brygadzista') &&
    e.nadzorujeObszarId === obszarId &&
    (e.nadzorujeShiftIds || []).includes(shift)
  );

  // ZABEZPIECZENIE: jeśli powyższe nic nie znalazło (np. migracja "Scal
  // brygadzistów..." w Ustawieniach jeszcze nie została uruchomiona na tym
  // urządzeniu, więc te nowe pola są jeszcze puste) — sięgnij po stary,
  // wcześniejszy sposób przypisania, żeby check-lista NIGDY nie wyglądała na
  // pustą tylko dlatego, że ktoś jeszcze nie kliknął migracji. Bez tego dane
  // wyglądały na "usunięte", choć w rzeczywistości wciąż tam były (widoczne
  // w Kalendarzu) — po prostu check-lista przestawała je pokazywać.
  if (!brygEmps.length) {
    const brygInObszarLegacy = (obsState.brygadzisciList || [])
      .filter(b => b.obszarId === obszarId && (b.shiftIds || []).includes(shift));
    brygInObszarLegacy.forEach(b => {
      const emp = obsState.employees.find(e => e.linkedBrygadzistaEntryId === b.id && e.active !== 0);
      if (emp && !brygEmps.includes(emp)) brygEmps.push(emp);
    });
  }

  const brygIds = new Set(brygEmps.map(e => e.id));

  // Pracownicy (nie-brygadziści, nie-koordynatorzy) przypisani do brygadzisty tego obszaru
  const pracownicy = obsState.employees.filter(e =>
    e.active !== 0 &&
    !(e.kategoria || '').startsWith('Brygadzista') && e.kategoria !== 'Koordynator' &&
    getEmpBrygadzistaIds(e).some(id => brygIds.has(id))
  );

  const allPeople = [...brygEmps, ...pracownicy];

  if (allPeople.length === 0) {
    container.innerHTML = '';
    if (empty) {
      empty.style.display = 'block';
      empty.querySelector('div:last-child').textContent = 'Brak brygadzistów i pracowników w tym obszarze. Dodaj ich w zakładce Ustawienia / Pracownicy.';
    }
    return;
  }
  if (empty) empty.style.display = 'none';

  // Klucz rekordu: data + obszar + zmiana (jeden rekord na cały obszar/zmianę)
  const dateShift = date + '_obszar-' + obszarId + '_' + shift;
  const existing = obsState.attendanceRecords.find(r => r.dateShift === dateShift);
  obsState.checklistOverrides = {};
  if (existing) {
    existing.entries.forEach(entry => { obsState.checklistOverrides[entry.employeeId] = { ...entry }; });
  }
  const deleteBtn = document.getElementById('deleteAttBtn');
  if (deleteBtn) deleteBtn.style.display = existing ? 'inline-block' : 'none';

  const sortByName = arr => arr.slice().sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '', 'pl'));
  const brygEtat = sortByName(brygEmps.filter(e => e.type !== 'outsourcing'));
  const brygOut = sortByName(brygEmps.filter(e => e.type === 'outsourcing'));
  const prac = sortByName(pracownicy);

  container.innerHTML = `
    <div id="checklistRowsWrap">
      ${buildChecklistSection(brygEtat, '👔 Brygadziści etatowi', 'var(--accent2)', date)}
      ${buildChecklistSection(brygOut, '🏭 Brygadziści outsourcingu', 'var(--warn)', date)}
      ${buildChecklistSection(prac, '👷 Pracownicy', 'var(--accent)', date)}
    </div>
    <div style="margin-top:10px;">
      <textarea id="attDayNote" placeholder="Notatka ogólna do zmiany (opcjonalnie)..."
        style="width:100%;min-height:50px;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:9px;padding:10px;font-size:13.5px;font-family:inherit;box-sizing:border-box;">${existing ? escapeHtml(existing.note || '') : ''}</textarea>
    </div>
  `;
  wireChecklistRowEvents(date);
}

// Wspólny builder sekcji check-listy — pokazuje też puste sekcje z napisem "brak"
function buildChecklistSection(sectionEmps, sectionTitle, sectionColor, date) {
  const body = sectionEmps.length
    ? sectionEmps.map(emp => checklistRowHtml(emp, date)).join('')
    : `<div style="padding:8px 4px;color:var(--text-dim);font-size:12.5px;font-style:italic;">— brak —</div>`;
  return `
    <div style="margin-bottom:6px;margin-top:10px;">
      <div style="font-size:11px;font-weight:800;color:${sectionColor};text-transform:uppercase;letter-spacing:.5px;padding:4px 0 6px;">${sectionTitle} (${sectionEmps.length})</div>
      ${body}
    </div>
  `;
}

document.getElementById('attDate').addEventListener('change', async () => {
  // Przy zmianie daty odśwież dropdown zmian (może być inny tydzień = inna zapamiętana zmiana)
  const obszarId = document.getElementById('attObszar').value;
  if (obszarId) await fillShiftDropdownForObszar(obszarId);
  renderAttendanceForm();
});
document.getElementById('attShift').addEventListener('change', async () => {
  // Zapamiętaj wybraną zmianę dla całego tygodnia tego obszaru
  const obszarId = document.getElementById('attObszar').value;
  const shift = document.getElementById('attShift').value;
  const date = document.getElementById('attDate').value || todayStr();
  if (obszarId && shift) await setWeeklyShift(obszarId, date, shift);
  renderAttendanceForm();
});

// Ustaw datę domyślną
document.getElementById('attDate').value = todayStr();
document.getElementById('koordAttDate') && (document.getElementById('koordAttDate').value = todayStr());

document.getElementById('saveAttBtn').addEventListener('click', async () => {
  const date = document.getElementById('attDate').value;
  if (!date) { showToast('Wybierz datę'); return; }

  const brygEntry = getLoggedBrygadzistaEntry();
  let emps, recordKey, recordMeta;

  if (brygEntry) {
    // TRYB BRYGADZISTY: zbierz wszystkich swoich ludzi (3 grupy), klucz z brygEntry.id
    const shifts = brygEntry.shiftIds || [];
    const shift = shifts.length > 1
      ? (document.getElementById('attSelfShift') ? document.getElementById('attSelfShift').value : shifts[0])
      : (shifts[0] || '');
    if (!shift) { showToast('Wybierz zmianę'); return; }
    const { brygEtat, brygOut, pracownicy } = collectBrygadzistaPeople(brygEntry);
    emps = [...brygEtat, ...brygOut, ...pracownicy];
    recordKey = date + '_' + brygEntry.id + '_' + shift;
    recordMeta = { date, shift, brygId: brygEntry.id, dateShift: recordKey };
  } else {
    // TRYB ADMIN: wszyscy z obszaru (brygadziści + pracownicy) — DOKŁADNIE ta
    // sama logika co w renderAttendanceFormAdmin (musi być identyczna, inaczej
    // to, co user WIDZI w formularzu, i to, co faktycznie się ZAPISUJE po
    // kliknięciu "Zapisz check-listę", to dwie różne listy osób).
    const obszarId = document.getElementById('attObszar').value;
    const shift = document.getElementById('attShift').value;
    if (!obszarId || !shift) { showToast('Wybierz obszar i zmianę'); return; }

    let brygEmps = obsState.employees.filter(e =>
      e.active !== 0 &&
      (e.kategoria || '').startsWith('Brygadzista') &&
      e.nadzorujeObszarId === obszarId &&
      (e.nadzorujeShiftIds || []).includes(shift)
    );
    if (!brygEmps.length) {
      const brygInObszarLegacy = (obsState.brygadzisciList || [])
        .filter(b => b.obszarId === obszarId && (b.shiftIds || []).includes(shift));
      brygInObszarLegacy.forEach(b => {
        const emp = obsState.employees.find(e => e.linkedBrygadzistaEntryId === b.id && e.active !== 0);
        if (emp && !brygEmps.includes(emp)) brygEmps.push(emp);
      });
    }
    const brygIds = new Set(brygEmps.map(e => e.id));
    const pracownicy = obsState.employees.filter(e =>
      e.active !== 0 &&
      !(e.kategoria || '').startsWith('Brygadzista') && e.kategoria !== 'Koordynator' &&
      getEmpBrygadzistaIds(e).some(id => brygIds.has(id))
    );
    emps = [...brygEmps, ...pracownicy];
    recordKey = date + '_obszar-' + obszarId + '_' + shift;
    recordMeta = { date, shift, obszarId, dateShift: recordKey };
  }

  if (!emps.length) { showToast('Brak ludzi do zapisania'); return; }

  const entries = emps
    .map(emp => {
      const eff = obsState.checklistOverrides[emp.id];
      if (eff && eff.removed) return null; // jawnie usunięty — pomiń całkowicie, nie dawaj domyślnego NN
      if (!eff || !eff.status) {
        return { employeeId: emp.id, status: 'NN', hoursFrom: '', hoursTo: '', hours: 0, note: '' };
      }
      return { employeeId: emp.id, status: eff.status, hoursFrom: eff.hoursFrom || '', hoursTo: eff.hoursTo || '', hours: eff.hours || 0, note: eff.note || '' };
    })
    .filter(Boolean);

  let record = obsState.attendanceRecords.find(r => r.dateShift === recordKey);
  if (!record) record = { ...recordMeta, entries: [], note: '' };
  record.entries = entries;
  record.note = document.getElementById('attDayNote') ? document.getElementById('attDayNote').value.trim() : '';

  await DB.saveAttendance(record);
  const idx = obsState.attendanceRecords.findIndex(r => r.dateShift === record.dateShift);
  if (idx >= 0) obsState.attendanceRecords[idx] = record;
  else obsState.attendanceRecords.push(record);

  const deleteBtnAfterSave = document.getElementById('deleteAttBtn');
  if (deleteBtnAfterSave) deleteBtnAfterSave.style.display = 'inline-block';

  renderCalendarActiveView();
  renderObsStats();
  showToast('Check-lista zapisana');
});

document.getElementById('deleteAttBtn') && document.getElementById('deleteAttBtn').addEventListener('click', async () => {
  const date = document.getElementById('attDate').value;
  if (!date) return;
  const brygEntry = getLoggedBrygadzistaEntry();
  let dateShift;
  if (brygEntry) {
    const shifts = brygEntry.shiftIds || [];
    const shift = shifts.length > 1
      ? (document.getElementById('attSelfShift') ? document.getElementById('attSelfShift').value : shifts[0])
      : (shifts[0] || '');
    if (!shift) return;
    dateShift = date + '_' + brygEntry.id + '_' + shift;
  } else {
    const obszarId = document.getElementById('attObszar') ? document.getElementById('attObszar').value : '';
    const shift = document.getElementById('attShift') ? document.getElementById('attShift').value : '';
    if (!obszarId || !shift) return;
    dateShift = date + '_obszar-' + obszarId + '_' + shift;
  }
  const existing = obsState.attendanceRecords.find(r => r.dateShift === dateShift);
  if (!existing) { showToast('Brak zapisanej check-listy do usunięcia'); return; }

  if (!confirm('Usunąć całą check-listę dla tego dnia i zmiany? Wpisy tych samych osób znikną też z WSZYSTKICH innych miejsc (np. wcześniej zaakceptowanych zgłoszeń z Centrali) dla tego dnia. Ta operacja jest nieodwracalna.')) return;

  // Osoby, które były w tej check-liście — ich wpisy trzeba usunąć WSZĘDZIE
  // dla tego dnia, nie tylko z tego jednego rekordu. Inaczej, jeśli ta sama
  // osoba ma wpis w INNYM rekordzie tego samego dnia (np. z zaakceptowanego
  // wcześniej zgłoszenia z Centrali, albo z osobnego wpisu sprzed naprawy
  // kluczy obszarów), Kalendarz nadal pokazywałby ją jako obecną — bo
  // Kalendarz sprawdza WSZYSTKIE rekordy danego dnia, nie tylko ten jeden.
  const usunieciEmployeeIds = new Set((existing.entries || []).map(e => e.employeeId));

  await DB.deleteAttendance(existing.id);
  obsState.attendanceRecords = obsState.attendanceRecords.filter(r => r.id !== existing.id);

  let wyczyszczonoDodatkowo = 0;
  const innePasujaceDnia = obsState.attendanceRecords.filter(r => r.date === date);
  for (const rec of innePasujaceDnia) {
    const przed = rec.entries.length;
    rec.entries = rec.entries.filter(e => !usunieciEmployeeIds.has(e.employeeId));
    if (rec.entries.length !== przed) {
      wyczyszczonoDodatkowo += (przed - rec.entries.length);
      if (rec.entries.length === 0) {
        await DB.deleteAttendance(rec.id);
        obsState.attendanceRecords = obsState.attendanceRecords.filter(r => r.id !== rec.id);
      } else {
        await DB.saveAttendance(rec);
      }
    }
  }

  obsState.checklistOverrides = {};

  renderAttendanceForm();
  renderCalendarActiveView();
  renderObsStats();
  showToast(wyczyszczonoDodatkowo > 0
    ? `Check-lista usunięta — dodatkowo wyczyszczono ${wyczyszczonoDodatkowo} wpis(ów) tych samych osób z innych miejsc tego dnia`
    : 'Check-lista usunięta');
});

// ===== KALENDARZ MIESIĘCZNY =====
function renderObsCalendar() {
  const container = document.getElementById('obsCalendar');
  if (!container) return;
  const y = obsState.currentYear;
  const m = obsState.currentMonth;
  const dim = daysInMonth(y, m);
  const shift = document.getElementById('calShiftFilter') ? document.getElementById('calShiftFilter').value : '';
  const emps = obsState.employees.filter(e => e.active !== 0 && (!shift || e.shift === shift));

  // Nagłówek miesiąca
  const monthNames = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec',
                      'Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
  document.getElementById('obsCalMonth').textContent = `${monthNames[m-1]} ${y}`;

  // Buduj nagłówek dni
  let daysHeader = '<div class="kal-emp-col"></div>';
  for (let d = 1; d <= dim; d++) {
    const ds = dateStr(y, m, d);
    const weekend = isWeekend(ds);
    const holiday = isPolishHoliday(ds);
    const dayObj = new Date(ds + 'T12:00:00');
    const dayNames = ['Nd','Pn','Wt','Śr','Cz','Pt','So'];
    const dn = dayNames[dayObj.getDay()];
    const cls = (weekend || holiday) ? 'kal-day-hdr holiday' : 'kal-day-hdr';
    daysHeader += `<div class="${cls}" title="${ds}"><div>${d}</div><div style="font-size:9px;">${dn}</div></div>`;
  }

  // Buduj wiersze pracowników
  const rows = emps.map(emp => {
    let cells = `<div class="kal-emp-col"><div class="kal-emp-name">${escapeHtml(emp.lastName)} ${escapeHtml(emp.firstName)}</div><div class="kal-emp-shift">${shiftLabel(emp.shift)}</div></div>`;
    for (let d = 1; d <= dim; d++) {
      const ds = dateStr(y, m, d);
      const weekend = isWeekend(ds);
      const holiday = isPolishHoliday(ds);
      if (weekend || holiday) {
        cells += `<div class="kal-cell weekend"></div>`;
        continue;
      }
      // Szukaj wpisu dla pracownika w tym dniu (niezależnie od zmiany)
      const entry = findEntryForEmployee(ds, emp.id);
      const status = entry ? entry.status : '';
      const statusDef = status ? DB.ATTENDANCE_STATUSES[status] : null;
      const bg = statusDef ? statusDef.color : '#fff';
      const fg = statusDef ? statusDef.textColor : '#333';
      const hours = entry && entry.hours ? entry.hours + 'h' : '';
      cells += `<div class="kal-cell" style="background:${bg};color:${fg};" title="${escapeHtml(emp.lastName)} ${ds}${statusDef ? ' — ' + statusDef.label : ''}">
        <span>${status || ''}</span>
        ${hours ? `<span style="font-size:8px;display:block;">${hours}</span>` : ''}
      </div>`;
    }
    // Podsumowanie wiersza
    const monthRecs = obsState.attendanceRecords.filter(r => r.date.startsWith(`${y}-${String(m).padStart(2,'0')}`));
    let present = 0, absent = 0, totalHours = 0;
    for (let d = 1; d <= dim; d++) {
      const ds = dateStr(y, m, d);
      if (isWeekend(ds) || isPolishHoliday(ds)) continue;
      const entry = findEntryForEmployeeInMonth(monthRecs, ds, emp.id);
      if (!entry || !entry.status) continue;
      if (DB.PRESENT_STATUSES.includes(entry.status)) { present++; totalHours += entry.hours || 0; }
      else absent++;
    }
    cells += `<div class="kal-sum-col ok"><div>${present}</div><div style="font-size:9px;">dni</div></div>`;
    cells += `<div class="kal-sum-col bad"><div>${absent}</div><div style="font-size:9px;">abs</div></div>`;
    cells += `<div class="kal-sum-col" style="background:#bdd7ee;color:#1f4e79;"><div>${totalHours}</div><div style="font-size:9px;">godz.</div></div>`;
    return `<div class="kal-row">${cells}</div>`;
  });

  container.innerHTML = `
    <div class="kal-row kal-header">${daysHeader}
      <div class="kal-sum-col" style="background:var(--ok);color:#fff;">Ob.</div>
      <div class="kal-sum-col" style="background:var(--bad);color:#fff;">Abs.</div>
      <div class="kal-sum-col" style="background:#bdd7ee;color:#1f4e79;">Godz.</div>
    </div>
    ${rows.join('')}
    ${emps.length === 0 ? '<div class="empty-state"><div class="icon">📅</div><div>Brak pracowników do wyświetlenia. Dodaj pracowników lub zmień filtr zmiany.</div></div>' : ''}
  `;
}

document.getElementById('obsCalPrev').addEventListener('click', () => {
  obsState.currentMonth--;
  if (obsState.currentMonth < 1) { obsState.currentMonth = 12; obsState.currentYear--; }
  renderCalendarActiveView();
});
document.getElementById('obsCalNext').addEventListener('click', () => {
  obsState.currentMonth++;
  if (obsState.currentMonth > 12) { obsState.currentMonth = 1; obsState.currentYear++; }
  renderCalendarActiveView();
});
document.getElementById('obsCalToday').addEventListener('click', () => {
  obsState.currentMonth = new Date().getMonth() + 1;
  obsState.currentYear = new Date().getFullYear();
  renderCalendarActiveView();
});
if (document.getElementById('calShiftFilter')) {
  document.getElementById('calShiftFilter').addEventListener('change', renderCalendarActiveView);
}

// ===== PEŁNY MIESIĄC — widok "ściennego" kalendarza z urlopami =====
let calActiveView = 'simple';

function renderCalendarActiveView() {
  const monthNames = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec',
                      'Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
  const hdr = document.getElementById('obsCalMonth');
  if (hdr) hdr.textContent = `${monthNames[obsState.currentMonth-1]} ${obsState.currentYear}`;

  if (calActiveView === 'full') renderFullMonthCalendar();
  else renderObsCalendar();
}

function renderFullMonthCalendar() {
  const container = document.getElementById('obsFullCalendar');
  if (!container) return;
  const y = obsState.currentYear;
  const m = obsState.currentMonth;
  const dim = daysInMonth(y, m);
  const today = todayStr();

  const firstDow = new Date(y, m - 1, 1).getDay(); // 0=Nd..6=Sb
  const startBlank = firstDow === 0 ? 6 : firstDow - 1; // tydzień zaczyna się od poniedziałku

  const dayNames = ['Pon','Wt','Śr','Czw','Pt','Sob','Nd'];
  let html = '<div class="fullcal-grid">';
  dayNames.forEach(dn => { html += `<div class="fullcal-hdr">${dn}</div>`; });
  for (let i = 0; i < startBlank; i++) html += '<div class="fullcal-cell empty"></div>';

  for (let d = 1; d <= dim; d++) {
    const ds = dateStr(y, m, d);
    const weekend = isWeekend(ds);
    const holiday = isPolishHoliday(ds);

    // Urlopy planowane i zatwierdzone obejmujące ten dzień (odrzucone się nie pokazują — nie dojdą do skutku)
    const dayLeaves = obsState.leaveRequests
      .filter(l => l.status !== 'rejected' && l.dateFrom <= ds && l.dateTo >= ds)
      .sort((a, b) => (a.status === b.status ? 0 : a.status === 'approved' ? -1 : 1));

    const items = dayLeaves.map(l => {
      const emp = obsState.employees.find(e => e.id === l.employeeId);
      const name = emp ? emp.lastName : '?';
      const approved = l.status === 'approved';
      const bg = approved ? '#e2f0d9' : '#ffeb9c';
      const color = approved ? '#375623' : '#9c6500';
      return `<div style="background:${bg};color:${color};border-radius:4px;padding:1px 4px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(name)} — ${escapeHtml(l.type)} (${approved ? 'zatwierdzony' : 'planowany'})">${escapeHtml(name)} ${escapeHtml(l.type)}</div>`;
    }).join('');

    let cls = 'fullcal-cell';
    if (weekend || holiday) cls += ' weekend';
    if (ds === today) cls += ' today';

    html += `<div class="${cls}"><div class="fullcal-daynum">${d}</div>${items}</div>`;
  }
  html += '</div>';
  container.innerHTML = html;
}

document.getElementById('calViewSimpleBtn').addEventListener('click', () => {
  calActiveView = 'simple';
  document.getElementById('calViewSimpleBtn').classList.add('active');
  document.getElementById('calViewFullBtn').classList.remove('active');
  document.getElementById('calSimpleWrap').style.display = 'block';
  document.getElementById('calFullWrap').style.display = 'none';
  renderCalendarActiveView();
});
document.getElementById('calViewFullBtn').addEventListener('click', () => {
  calActiveView = 'full';
  document.getElementById('calViewFullBtn').classList.add('active');
  document.getElementById('calViewSimpleBtn').classList.remove('active');
  document.getElementById('calSimpleWrap').style.display = 'none';
  document.getElementById('calFullWrap').style.display = 'block';
  renderCalendarActiveView();
});

// ===== URLOPY =====
function renderLeaveList() {
  const container = document.getElementById('leaveList');
  const empty = document.getElementById('leaveListEmpty');
  if (!container) return;

  const empFilter = document.getElementById('leaveEmpFilter') ? document.getElementById('leaveEmpFilter').value : '';
  let leaves = obsState.leaveRequests.slice().sort((a, b) => b.dateFrom.localeCompare(a.dateFrom));
  if (empFilter) leaves = leaves.filter(l => l.employeeId === empFilter);

  if (leaves.length === 0) {
    container.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  container.innerHTML = leaves.map(l => {
    const emp = obsState.employees.find(e => e.id === l.employeeId);
    const empName = emp ? `${emp.lastName} ${emp.firstName}` : '(usunięty)';
    const statusLabels = { planned: 'Do akceptacji', approved: 'Zatwierdzony', rejected: 'Odrzucony' };
    const statusClasses = { planned: 'warn', approved: 'ok', rejected: 'bad' };
    const typeLabel = DB.ATTENDANCE_STATUSES[l.type] ? DB.ATTENDANCE_STATUSES[l.type].label : l.type;
    return `
      <div class="part-card" style="align-items:flex-start;">
        <div class="part-info">
          <div class="pname">${escapeHtml(empName)} <span class="badge ${statusClasses[l.status] || 'neutral'}">${statusLabels[l.status] || l.status}</span></div>
          <div class="pmeta">
            ${escapeHtml(typeLabel)} • ${fmtDate(l.dateFrom)} — ${fmtDate(l.dateTo)} • ${l.days} dni roboczych
            ${l.note ? '<br>' + escapeHtml(l.note) : ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <button class="btn small secondary" data-leave-edit="${l.id}">Edytuj</button>
          <button class="btn small secondary" onclick="generateLeaveDocx('${l.id}')">📄 Wniosek .docx</button>
          <button class="btn small danger" data-leave-delete="${l.id}">Usuń</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-leave-edit]').forEach(btn => {
    btn.addEventListener('click', () => openLeaveModal(btn.dataset.leaveEdit));
  });
  container.querySelectorAll('[data-leave-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Usunąć ten wniosek urlopowy?')) return;
      await DB.deleteLeaveRequest(btn.dataset.leaveDelete);
      obsState.leaveRequests = obsState.leaveRequests.filter(l => l.id !== btn.dataset.leaveDelete);
      renderLeaveList();
      renderCalendarActiveView();
    });
  });
}

function openLeaveModal(leaveId) {
  obsState.editingLeaveId = leaveId || null;
  const titleEl = document.getElementById('leaveModalTitle');

  // Wypełnij select pracowników
  const empSel = document.getElementById('leaveEmployee');
  const emps = obsState.employees.filter(e => e.active !== 0).sort((a, b) => a.lastName.localeCompare(b.lastName, 'pl'));
  empSel.innerHTML = '<option value="">— wybierz pracownika —</option>' +
    emps.map(e => `<option value="${e.id}">${escapeHtml(e.lastName)} ${escapeHtml(e.firstName)}</option>`).join('');

  if (leaveId) {
    const l = obsState.leaveRequests.find(x => x.id === leaveId);
    if (!l) return;
    titleEl.textContent = 'Edytuj urlop';
    empSel.value = l.employeeId;
    document.getElementById('leaveType').value = l.type;
    document.getElementById('leaveFrom').value = l.dateFrom;
    document.getElementById('leaveTo').value = l.dateTo;
    document.getElementById('leaveStatus').value = l.status;
    document.getElementById('leaveNote').value = l.note || '';
    updateLeaveDays();
    updateLeaveStatusVisibility(l);
  } else {
    titleEl.textContent = 'Nowy wniosek urlopowy';
    empSel.value = '';
    document.getElementById('leaveType').value = 'UW';
    document.getElementById('leaveFrom').value = todayStr();
    document.getElementById('leaveTo').value = todayStr();
    document.getElementById('leaveStatus').value = 'planned';
    document.getElementById('leaveNote').value = '';
    updateLeaveDays();
    updateLeaveStatusVisibility(null);
  }
  document.getElementById('leaveModalOverlay').classList.add('active');
}

// Status wniosku może zmieniać wyłącznie administrator — brygadzista widzi tylko podgląd
// (żeby nie mógł sam sobie "zatwierdzić" urlopu). Decyzja przychodzi z centrali.
function updateLeaveStatusVisibility(l) {
  const adminField = document.getElementById('leaveStatusAdminField');
  const hint = document.getElementById('leaveStatusReadonlyHint');
  if (currentUser && currentUser.isAdmin) {
    adminField.style.display = 'block';
    hint.style.display = 'none';
  } else {
    adminField.style.display = 'none';
    const statusLabels = { planned: 'Do akceptacji — czeka na decyzję przełożonego', approved: 'Zatwierdzony', rejected: 'Odrzucony' };
    let txt = `Status: ${statusLabels[l ? l.status : 'planned']}`;
    if (l && l.decidedBy && l.status !== 'planned') {
      txt += ` (decyzja: ${l.decidedBy}, ${fmtDate(new Date(l.decidedAt).toISOString().slice(0,10))})`;
    }
    hint.textContent = txt;
    hint.style.display = 'block';
  }
}

function updateLeaveDays() {
  const from = document.getElementById('leaveFrom').value;
  const to = document.getElementById('leaveTo').value;
  const daysEl = document.getElementById('leaveDaysCount');
  if (from && to && from <= to) {
    const days = countWorkingDays(from, to);
    if (daysEl) daysEl.textContent = `Dni roboczych: ${days}`;
  } else {
    if (daysEl) daysEl.textContent = '';
  }
}

document.getElementById('leaveFrom').addEventListener('change', updateLeaveDays);
document.getElementById('leaveTo').addEventListener('change', updateLeaveDays);

document.getElementById('closeLeaveModal').addEventListener('click', () => {
  document.getElementById('leaveModalOverlay').classList.remove('active');
});
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. (leaveModalOverlay)

document.getElementById('addLeaveBtn').addEventListener('click', () => openLeaveModal(null));

document.getElementById('saveLeaveBtn').addEventListener('click', async () => {
  const empId = document.getElementById('leaveEmployee').value;
  const type = document.getElementById('leaveType').value;
  const dateFrom = document.getElementById('leaveFrom').value;
  const dateTo = document.getElementById('leaveTo').value;
  if (!empId) { showToast('Wybierz pracownika'); return; }
  if (!dateFrom || !dateTo) { showToast('Wybierz daty urlopu'); return; }
  if (dateFrom > dateTo) { showToast('Data "od" nie może być późniejsza niż "do"'); return; }

  const days = countWorkingDays(dateFrom, dateTo);
  let leave;
  let isNew = false;
  if (obsState.editingLeaveId) {
    leave = obsState.leaveRequests.find(l => l.id === obsState.editingLeaveId);
    if (!leave) return;
  } else {
    leave = {};
    isNew = true;
  }

  leave.employeeId = empId;
  leave.type = type;
  leave.dateFrom = dateFrom;
  leave.dateTo = dateTo;
  leave.days = days;
  // Status może zmienić tylko administrator — dla pozostałych wymuszamy "Do akceptacji"
  // (nowy wniosek) albo zachowujemy dotychczasowy status (edycja), niezależnie od tego,
  // co jest w ukrytym polu formularza.
  if (currentUser && currentUser.isAdmin) {
    leave.status = document.getElementById('leaveStatus').value;
  } else if (isNew) {
    leave.status = 'planned';
  } // przy edycji przez nie-admina leave.status zostaje bez zmian
  leave.note = document.getElementById('leaveNote').value.trim();

  await DB.saveLeaveRequest(leave);
  if (isNew) obsState.leaveRequests.push(leave);

  renderLeaveList();
  renderCalendarActiveView();
  if (isNew) {
    openLeaveModal(null); // zostaw okno otwarte, gotowe na kolejny wniosek
    showToast('Wniosek urlopowy zapisany — możesz dodać kolejny');
  } else {
    document.getElementById('leaveModalOverlay').classList.remove('active');
    showToast('Wniosek urlopowy zapisany');
  }
});

// Filtr pracownika w urlopach
if (document.getElementById('leaveEmpFilter')) {
  document.getElementById('leaveEmpFilter').addEventListener('change', renderLeaveList);
}

// ===== STATYSTYKI =====
function renderObsStats() {
  const container = document.getElementById('obsStatsContent');
  if (!container) return;

  const view = obsState.statsView;
  const now = new Date();

  if (view === 'daily') {
    const date = document.getElementById('statsDayPick') ? document.getElementById('statsDayPick').value : todayStr();
    renderStatsDailyView(container, date);
  } else if (view === 'monthly') {
    const y = obsState.currentYear;
    const m = obsState.currentMonth;
    renderStatsMonthlyView(container, y, m);
  } else if (view === 'yearly') {
    renderStatsYearlyView(container, now.getFullYear());
  }
}

function renderStatsDailyView(container, date) {
  const recs = obsState.attendanceRecords.filter(r => r.date === date);
  if (recs.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📊</div><div>Brak danych dla tego dnia.</div></div>';
    return;
  }

  let totalPresent = 0, totalAbsent = 0, totalHours = 0;
  const statusCounts = {};

  recs.forEach(rec => {
    rec.entries.forEach(entry => {
      if (!entry.status) return;
      statusCounts[entry.status] = (statusCounts[entry.status] || 0) + 1;
      if (DB.PRESENT_STATUSES.includes(entry.status)) { totalPresent++; totalHours += entry.hours || 0; }
      else totalAbsent++;
    });
  });

  const rows = Object.entries(statusCounts).map(([k, cnt]) => {
    const def = DB.ATTENDANCE_STATUSES[k];
    return `<tr><td style="padding:6px 10px;background:${def.color};color:${def.textColor};font-weight:700;">${k}</td>
      <td style="padding:6px 10px;">${def.label}</td>
      <td style="padding:6px 10px;font-weight:700;text-align:center;">${cnt}</td></tr>`;
  }).join('');

  container.innerHTML = `
    <div class="stat-grid" style="margin-bottom:14px;">
      <div class="stat-box"><div class="num" style="color:var(--ok);">${totalPresent}</div><div class="lbl">Obecnych</div></div>
      <div class="stat-box"><div class="num" style="color:var(--bad);">${totalAbsent}</div><div class="lbl">Nieobecnych</div></div>
      <div class="stat-box"><div class="num" style="color:var(--accent2);">${totalHours}</div><div class="lbl">Godziny pracy</div></div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:var(--card2);">
        <th style="padding:6px 10px;text-align:left;">Kod</th>
        <th style="padding:6px 10px;text-align:left;">Status</th>
        <th style="padding:6px 10px;text-align:center;">Liczba</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderStatsMonthlyView(container, year, month) {
  const prefix = `${year}-${String(month).padStart(2,'0')}`;
  const recs = obsState.attendanceRecords.filter(r => r.date.startsWith(prefix));
  const dim = daysInMonth(year, month);
  let workDays = 0;
  for (let d = 1; d <= dim; d++) {
    const ds = dateStr(year, month, d);
    if (!isWeekend(ds) && !isPolishHoliday(ds)) workDays++;
  }

  const empStats = {};
  obsState.employees.filter(e => e.active !== 0).forEach(emp => {
    empStats[emp.id] = { emp, present: 0, absent: 0, hours: 0, statuses: {} };
  });

  recs.forEach(rec => {
    rec.entries.forEach(entry => {
      if (!empStats[entry.employeeId] || !entry.status) return;
      const s = empStats[entry.employeeId];
      s.statuses[entry.status] = (s.statuses[entry.status] || 0) + 1;
      if (DB.PRESENT_STATUSES.includes(entry.status)) { s.present++; s.hours += entry.hours || 0; }
      else s.absent++;
    });
  });

  const monthNames = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec',
                      'Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];

  const rows = Object.values(empStats).filter(s => s.emp.active !== 0).map(s => {
    const absBreakdown = DB.ABSENCE_STATUSES
      .filter(k => s.statuses[k])
      .map(k => `${k}:${s.statuses[k]}`).join(', ');
    return `<tr>
      <td style="padding:6px 10px;font-weight:700;">${escapeHtml(s.emp.lastName)} ${escapeHtml(s.emp.firstName)}</td>
      <td style="padding:6px 10px;font-size:11px;">${escapeHtml(shiftLabel(s.emp.shift))}</td>
      <td style="padding:6px 10px;text-align:center;color:var(--ok);font-weight:700;">${s.present}</td>
      <td style="padding:6px 10px;text-align:center;color:var(--bad);font-weight:700;">${s.absent}</td>
      <td style="padding:6px 10px;text-align:center;color:var(--accent2);font-weight:700;">${s.hours}h</td>
      <td style="padding:6px 10px;font-size:11px;color:var(--text-dim);">${absBreakdown || '—'}</td>
    </tr>`;
  }).join('');

  const totalPresent = Object.values(empStats).reduce((s, x) => s + x.present, 0);
  const totalHours = Object.values(empStats).reduce((s, x) => s + x.hours, 0);

  container.innerHTML = `
    <div class="hint" style="margin-bottom:12px;">
      ${monthNames[month-1]} ${year} — Dni roboczych w miesiącu: <strong>${workDays}</strong>
    </div>
    <div class="stat-grid" style="margin-bottom:14px;">
      <div class="stat-box"><div class="num">${Object.keys(empStats).length}</div><div class="lbl">Pracownicy</div></div>
      <div class="stat-box"><div class="num" style="color:var(--ok);">${totalPresent}</div><div class="lbl">Obecności łącznie</div></div>
      <div class="stat-box"><div class="num" style="color:var(--accent2);">${totalHours}</div><div class="lbl">Godziny pracy łącznie</div></div>
    </div>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:var(--card2);">
          <th style="padding:6px 10px;text-align:left;">Pracownik</th>
          <th style="padding:6px 10px;text-align:left;">Zmiana</th>
          <th style="padding:6px 10px;text-align:center;">Obecny</th>
          <th style="padding:6px 10px;text-align:center;">Nieobecny</th>
          <th style="padding:6px 10px;text-align:center;">Godziny</th>
          <th style="padding:6px 10px;text-align:left;">Nieobecności</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderStatsYearlyView(container, year) {
  const monthNames = ['Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paź','Lis','Gru'];
  const rows = monthNames.map((mn, mi) => {
    const month = mi + 1;
    const prefix = `${year}-${String(month).padStart(2,'0')}`;
    const recs = obsState.attendanceRecords.filter(r => r.date.startsWith(prefix));
    let present = 0, absent = 0, hours = 0;
    recs.forEach(r => r.entries.forEach(e => {
      if (!e.status) return;
      if (DB.PRESENT_STATUSES.includes(e.status)) { present++; hours += e.hours || 0; }
      else absent++;
    }));
    return `<tr>
      <td style="padding:7px 10px;font-weight:700;">${mn}</td>
      <td style="padding:7px 10px;text-align:center;color:var(--ok);">${present}</td>
      <td style="padding:7px 10px;text-align:center;color:var(--bad);">${absent}</td>
      <td style="padding:7px 10px;text-align:center;color:var(--accent2);">${hours}h</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="hint" style="margin-bottom:12px;">Roczne podsumowanie — ${year}</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:var(--card2);">
        <th style="padding:7px 10px;text-align:left;">Miesiąc</th>
        <th style="padding:7px 10px;text-align:center;">Obecności</th>
        <th style="padding:7px 10px;text-align:center;">Nieobecności</th>
        <th style="padding:7px 10px;text-align:center;">Godziny pracy</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// Przełączniki widoków statystyk
document.querySelectorAll('.stats-view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.stats-view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    obsState.statsView = btn.dataset.statsView;
    const dayPicker = document.getElementById('statsDailyPicker');
    if (dayPicker) dayPicker.style.display = btn.dataset.statsView === 'daily' ? 'block' : 'none';
    renderObsStats();
  });
});

if (document.getElementById('statsDayPick')) {
  document.getElementById('statsDayPick').value = todayStr();
  document.getElementById('statsDayPick').addEventListener('change', renderObsStats);
}

// ===== USTAWIENIA MODUŁU OBECNOŚĆ =====
function renderObsSettings() {
  // Wypełnij select zmiany brygadzisty
  const sel = document.getElementById('brigadierShiftSel');
  if (!sel) return;
  sel.innerHTML = `
    <optgroup label="Etatowi (3 zmiany × 8h)">
      ${SHIFT_DEFS.etat.map(s => `<option value="${s.id}" ${obsState.currentShift === s.id ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
    </optgroup>
    <optgroup label="Outsourcing (2 zmiany × 12h)">
      ${SHIFT_DEFS.outsourcing.map(s => `<option value="${s.id}" ${obsState.currentShift === s.id ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
    </optgroup>
  `;
}

if (document.getElementById('saveBrigadierShiftBtn')) {
  document.getElementById('saveBrigadierShiftBtn').addEventListener('click', async () => {
    const shift = document.getElementById('brigadierShiftSel').value;
    obsState.currentShift = shift;
    await DB.setSetting('brigadierShift', shift);
    // Ustaw domyślnie w formularzu obecności
    const attShiftSel = document.getElementById('attShift');
    if (attShiftSel) attShiftSel.value = shift;
    renderAttendanceForm();
    renderCalendarActiveView();
    showToast('Zmiana brygadzisty zapisana');
  });
}

// ===== CHECK-LISTA: OBSZARY I BRYGADZIŚCI (admin) =====
async function initObszaryBrygadzisci() {
  const card = document.getElementById('obszaryBrygadzisciAdminCard');
  if (!card) return;
  if (!currentUser || !currentUser.isAdmin) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  obsState.obszary = await DB.getObszary();
  obsState.brygadzisciList = await DB.getBrygadzisciList();
  obsState.koordynatorzy = await DB.getKoordynatorzy();

  // Migracja: stare pojedyncze przypisanie (brygadzistaId) -> nowa tablica (brygadzistaIds)
  for (const emp of obsState.employees) {
    if (!Array.isArray(emp.brygadzistaIds)) {
      emp.brygadzistaIds = emp.brygadzistaId ? [emp.brygadzistaId] : [];
      await DB.saveEmployee(emp);
    }
  }

  // Domknięcie dla brygadzistów utworzonych przed wprowadzeniem powiązanego wpisu
  // pracownika — dogeneruj im go teraz, żeby mogli mieć zaznaczaną własną obecność.
  for (const bryg of obsState.brygadzisciList) {
    const hasLinked = obsState.employees.some(e => e.linkedBrygadzistaEntryId === bryg.id);
    if (!hasLinked) await syncBrygadzistaSelfEmployee(bryg);
  }

  renderObszaryList();
  if (typeof renderChecklistSelectors === 'function') renderChecklistSelectors();
  renderBrygObszarSelect();
  renderBrygShiftsChecklist();
  renderBrygadzisciAdminList();
  renderKoordynatorzyAdminList();
}

function renderObszaryList() {
  const wrap = document.getElementById('obszaryList');
  if (!wrap) return;
  if (!obsState.obszary.length) {
    wrap.innerHTML = '<div class="hint">Brak obszarów — dodaj pierwszy niżej.</div>';
    return;
  }
  wrap.innerHTML = obsState.obszary.map(o => {
    const shiftDef = ALL_SHIFTS.find(s => s.id === o.shift);
    return `
    <div class="storage-row" style="margin-bottom:6px;">
      <span>${escapeHtml(o.nazwa)}${shiftDef ? ` <span style="font-size:12px;color:var(--text-dim);">(${escapeHtml(shiftDef.label)})</span>` : ''}</span>
      <span>
        <button class="btn secondary" data-edit-obszar="${o.id}" style="margin-right:6px;">Edytuj</button>
        <button class="btn danger" data-del-obszar="${o.id}">Usuń</button>
      </span>
    </div>
  `;
  }).join('');
  wrap.querySelectorAll('[data-edit-obszar]').forEach(btn => {
    btn.addEventListener('click', () => {
      const o = obsState.obszary.find(x => x.id === btn.dataset.editObszar);
      if (!o) return;
      obsState.editingObszarId = o.id;
      document.getElementById('newObszarNazwa').value = o.nazwa;
      const shiftSel = document.getElementById('newObszarShift');
      if (shiftSel) shiftSel.value = o.shift || '';
      document.getElementById('addObszarBtn').textContent = 'Zapisz zmiany obszaru';
      document.getElementById('cancelObszarEditBtn').style.display = 'inline-block';
      document.getElementById('newObszarNazwa').focus();
    });
  });
  wrap.querySelectorAll('[data-del-obszar]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Usunąć ten obszar? Brygadziści przypisani do niego zostaną bez obszaru.')) return;
      await DB.deleteObszar(btn.dataset.delObszar);
      obsState.obszary = obsState.obszary.filter(o => o.id !== btn.dataset.delObszar);
      renderObszaryList();
      if (typeof renderChecklistSelectors === 'function') renderChecklistSelectors();
  if (typeof renderChecklistSelectors === 'function') renderChecklistSelectors();
      renderBrygObszarSelect();
      renderBrygadzisciAdminList();
      showToast('Obszar usunięty');
    });
  });
}

function resetObszarForm() {
  obsState.editingObszarId = null;
  document.getElementById('newObszarNazwa').value = '';
  const shiftSel = document.getElementById('newObszarShift');
  if (shiftSel) shiftSel.value = '';
  document.getElementById('addObszarBtn').textContent = 'Dodaj obszar';
  document.getElementById('cancelObszarEditBtn').style.display = 'none';
}

function fillNewObszarShiftSelect() {
  const sel = document.getElementById('newObszarShift');
  if (!sel) return;
  sel.innerHTML = '<option value="">— bez konkretnej zmiany —</option>' +
    ALL_SHIFTS.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');
}
fillNewObszarShiftSelect();

document.getElementById('cancelObszarEditBtn').addEventListener('click', resetObszarForm);

document.getElementById('addObszarBtn').addEventListener('click', async () => {
  const input = document.getElementById('newObszarNazwa');
  const nazwa = input.value.trim();
  if (!nazwa) { showToast('Podaj nazwę obszaru'); return; }
  const shift = document.getElementById('newObszarShift') ? document.getElementById('newObszarShift').value : '';

  if (obsState.editingObszarId) {
    const o = obsState.obszary.find(x => x.id === obsState.editingObszarId);
    if (o) {
      o.nazwa = nazwa;
      o.shift = shift || null;
      await DB.saveObszar(o);
      showToast('Obszar zaktualizowany');
    }
    resetObszarForm();
  } else {
    const obszar = { nazwa, shift: shift || null };
    await DB.saveObszar(obszar);
    obsState.obszary.push(obszar);
    input.value = '';
    showToast('Obszar dodany');
  }
  renderObszaryList();
  if (typeof renderChecklistSelectors === 'function') renderChecklistSelectors();
  renderBrygObszarSelect();
  renderBrygadzisciAdminList();
});

function renderBrygObszarSelect() {
  const sel = document.getElementById('newBrygObszar');
  if (!sel) return;
  sel.innerHTML = obsState.obszary.map(o => `<option value="${o.id}">${escapeHtml(o.nazwa)}</option>`).join('')
    || '<option value="">— brak obszarów —</option>';
}

function renderBrygShiftsChecklist() {
  const wrap = document.getElementById('newBrygShifts');
  if (!wrap) return;
  wrap.innerHTML = ALL_SHIFTS.map(s => `<label><input type="checkbox" value="${s.id}"> ${escapeHtml(s.label)}</label>`).join('');
}

function renderBrygadzisciAdminList() {
  const wrap = document.getElementById('brygadzisciAdminList');
  if (!wrap) return;
  if (!obsState.brygadzisciList.length) {
    wrap.innerHTML = '<div class="hint">Brak brygadzistów — dodaj pierwszego niżej.</div>';
    return;
  }

  // Grupuj wg obszaru, żeby było widać, że jeden obszar może mieć wielu brygadzistów
  const groups = {};
  obsState.brygadzisciList.forEach(b => {
    const key = b.obszarId || '__brak__';
    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
  });

  wrap.innerHTML = Object.keys(groups).map(obszarId => {
    const obszar = obsState.obszary.find(o => o.id === obszarId);
    const nazwaObszaru = obszar ? obszar.nazwa : '(bez obszaru)';
    const rows = groups[obszarId].map(b => {
      const shiftsLabel = (b.shiftIds || []).map(sid => shiftLabel(sid)).join(', ') || '—';
      return `
        <div class="storage-row" style="margin-bottom:6px;flex-direction:column;align-items:flex-start;gap:4px;">
          <span><strong>${escapeHtml(b.imie)} ${escapeHtml(b.nazwisko)}</strong> <span style="font-size:12px;color:var(--text-dim);">(${b.typ === 'etat' ? 'Etatowy' : 'Outsourcing'})</span></span>
          <span style="font-size:12px;color:var(--text-dim);">Zmiany: ${shiftsLabel}</span>
          <span>
            <button class="btn secondary" data-edit-bryg="${b.id}" style="margin-right:6px;">Edytuj</button>
            <button class="btn danger" data-del-bryg="${b.id}">Usuń</button>
          </span>
        </div>
      `;
    }).join('');
    return `
      <div style="margin-bottom:14px;">
        <div class="hint" style="font-weight:700;color:var(--text);margin-bottom:6px;">📍 ${escapeHtml(nazwaObszaru)} — ${groups[obszarId].length} ${groups[obszarId].length === 1 ? 'brygadzista' : 'brygadzistów'}</div>
        ${rows}
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('[data-edit-bryg]').forEach(btn => {
    btn.addEventListener('click', () => {
      const b = obsState.brygadzisciList.find(x => x.id === btn.dataset.editBryg);
      if (!b) return;
      obsState.editingBrygId = b.id;
      document.getElementById('newBrygName').value = `${b.imie} ${b.nazwisko}`.trim();
      document.getElementById('newBrygTyp').value = b.typ;
      document.getElementById('newBrygObszar').value = b.obszarId || '';
      document.querySelectorAll('#newBrygShifts input').forEach(cb => {
        cb.checked = (b.shiftIds || []).includes(cb.value);
      });
      document.getElementById('addBrygBtn').textContent = 'Zapisz zmiany brygadzisty';
      document.getElementById('cancelBrygEditBtn').style.display = 'inline-block';
      document.getElementById('brygEditingHint').style.display = 'block';
      document.getElementById('brygEditingHint').textContent = `Edytujesz: ${b.imie} ${b.nazwisko}`;
      document.getElementById('newBrygName').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
  wrap.querySelectorAll('[data-del-bryg]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Usunąć tego brygadzistę? Pracownicy przypisani do niego zostaną bez przypisania. Jego własny wpis w "Pracownicy" (do zaznaczania obecności) zostanie zachowany, tylko przestanie być z nim powiązany.')) return;
      await DB.deleteBrygadzistaEntry(btn.dataset.delBryg);
      obsState.brygadzisciList = obsState.brygadzisciList.filter(b => b.id !== btn.dataset.delBryg);

      const selfEmp = obsState.employees.find(e => e.linkedBrygadzistaEntryId === btn.dataset.delBryg);
      if (selfEmp) {
        selfEmp.linkedBrygadzistaEntryId = null;
        await DB.saveEmployee(selfEmp);
      }

      renderBrygadzisciAdminList();
      if (typeof renderChecklistSelectors === 'function') renderChecklistSelectors();
      showToast('Brygadzista usunięty');
    });
  });
}

function resetBrygForm() {
  obsState.editingBrygId = null;
  document.getElementById('newBrygName').value = '';
  document.querySelectorAll('#newBrygShifts input:checked').forEach(cb => cb.checked = false);
  document.getElementById('addBrygBtn').textContent = 'Dodaj brygadzistę';
  document.getElementById('cancelBrygEditBtn').style.display = 'none';
  document.getElementById('brygEditingHint').style.display = 'none';
}

document.getElementById('cancelBrygEditBtn').addEventListener('click', resetBrygForm);

document.getElementById('addBrygBtn').addEventListener('click', async () => {
  const name = document.getElementById('newBrygName').value.trim();
  if (!name) { showToast('Podaj imię i nazwisko'); return; }
  const parts = name.split(' ');
  const imie = parts.shift() || name;
  const nazwisko = parts.join(' ') || '';
  const typ = document.getElementById('newBrygTyp').value;
  const obszarId = document.getElementById('newBrygObszar').value;
  const shiftIds = Array.from(document.querySelectorAll('#newBrygShifts input:checked')).map(cb => cb.value);
  if (!shiftIds.length) { showToast('Zaznacz przynajmniej jedną zmianę'); return; }

  if (obsState.editingBrygId) {
    const b = obsState.brygadzisciList.find(x => x.id === obsState.editingBrygId);
    if (b) {
      b.imie = imie; b.nazwisko = nazwisko; b.typ = typ; b.obszarId = obszarId; b.shiftIds = shiftIds;
      await DB.saveBrygadzistaEntry(b);
      await syncBrygadzistaSelfEmployee(b);
      showToast('Brygadzista zaktualizowany');
    }
    resetBrygForm();
  } else {
    const bryg = { imie, nazwisko, typ, obszarId, shiftIds };
    await DB.saveBrygadzistaEntry(bryg);
    obsState.brygadzisciList.push(bryg);
    await syncBrygadzistaSelfEmployee(bryg);
    resetBrygForm();
    showToast('Brygadzista dodany');
  }
  renderBrygadzisciAdminList();
  if (typeof renderChecklistSelectors === 'function') renderChecklistSelectors();
});

// ===== KOORDYNATORZY =====
// Koordynator to globalny nadzór — nie przypisuje się go do obszarów.
// Wypełnia checklistę modułów w formularzu koordynatora. Bez argumentu = domyślnie
// wszystko zaznaczone (nowy koordynator); z listą modułów = tylko one zaznaczone
// (edycja istniejącego koordynatora — pokazuje jego zapisane uprawnienia).
function fillNewKoordModulesChecklist(selectedModules) {
  const wrap = document.getElementById('newKoordModulesChecklist');
  if (!wrap) return;
  const availableModules = ALL_MODULE_KEYS.filter(k => k !== 'centrala');
  const selected = Array.isArray(selectedModules) ? selectedModules : availableModules;
  wrap.innerHTML = availableModules.map(key =>
    `<label><input type="checkbox" value="${key}" ${selected.includes(key) ? 'checked' : ''}> ${MODULE_LABELS[key] || key}</label>`
  ).join('');
}

function renderKoordynatorzyAdminList() {
  const wrap = document.getElementById('koordynatorzyAdminList');
  if (!wrap) return;
  const list = obsState.koordynatorzy || [];
  if (!list.length) {
    wrap.innerHTML = '<div class="hint">Brak koordynatorów — dodaj pierwszego niżej.</div>';
  } else {
    wrap.innerHTML = list.map(k => {
      const availableModules = ALL_MODULE_KEYS.filter(m => m !== 'centrala');
      const allowed = Array.isArray(k.allowedModules) ? k.allowedModules : availableModules;
      const modLabel = allowed.length === availableModules.length
        ? 'Dostęp do wszystkich modułów'
        : (allowed.length ? 'Dostęp: ' + allowed.map(m => MODULE_LABELS[m] || m).join(', ') : 'Brak przyznanych modułów');
      return `
        <div class="storage-row" style="margin-bottom:6px;flex-direction:column;align-items:flex-start;gap:4px;">
          <span><strong>${escapeHtml(k.imie)} ${escapeHtml(k.nazwisko)}</strong> <span style="font-size:12px;color:var(--text-dim);">(${k.typ === 'etat' ? 'Etatowy' : 'Outsourcing'})</span></span>
          <span style="font-size:12px;color:var(--text-dim);">Nadzór globalny — wszystkie obszary • ${escapeHtml(modLabel)}</span>
          <span>
            <button class="btn secondary" data-edit-koord="${k.id}" style="margin-right:6px;">Edytuj</button>
            <button class="btn danger" data-del-koord="${k.id}">Usuń</button>
          </span>
        </div>
      `;
    }).join('');
  }

  wrap.querySelectorAll('[data-edit-koord]').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = obsState.koordynatorzy.find(x => x.id === btn.dataset.editKoord);
      if (!k) return;
      obsState.editingKoordId = k.id;
      document.getElementById('newKoordName').value = `${k.imie} ${k.nazwisko}`.trim();
      document.getElementById('newKoordTyp').value = k.typ;
      fillNewKoordModulesChecklist(k.allowedModules);
      document.getElementById('addKoordBtn').textContent = 'Zapisz zmiany koordynatora';
      document.getElementById('cancelKoordEditBtn').style.display = 'inline-block';
      document.getElementById('koordEditingHint').style.display = 'block';
      document.getElementById('koordEditingHint').textContent = `Edytujesz: ${k.imie} ${k.nazwisko}`;
      document.getElementById('newKoordName').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
  wrap.querySelectorAll('[data-del-koord]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Usunąć tego koordynatora? Jego wpis w "Pracownicy" (do zaznaczania obecności) zostanie zachowany.')) return;
      await DB.deleteKoordynator(btn.dataset.delKoord);
      obsState.koordynatorzy = obsState.koordynatorzy.filter(k => k.id !== btn.dataset.delKoord);
      const selfEmp = obsState.employees.find(e => e.linkedKoordynatorId === btn.dataset.delKoord);
      if (selfEmp) { selfEmp.linkedKoordynatorId = null; await DB.saveEmployee(selfEmp); }
      renderKoordynatorzyAdminList();
      showToast('Koordynator usunięty');
    });
  });

  // Formularz dodawania nowego koordynatora — checklista modułów gotowa od razu,
  // ale nie nadpisujemy jej, jeśli akurat trwa edycja kogoś innego.
  if (!obsState.editingKoordId) fillNewKoordModulesChecklist();
}

function resetKoordForm() {
  obsState.editingKoordId = null;
  document.getElementById('newKoordName').value = '';
  document.getElementById('newKoordTyp').value = 'etat';
  fillNewKoordModulesChecklist();
  document.getElementById('addKoordBtn').textContent = 'Dodaj koordynatora';
  document.getElementById('cancelKoordEditBtn').style.display = 'none';
  document.getElementById('koordEditingHint').style.display = 'none';
}

document.getElementById('cancelKoordEditBtn') && document.getElementById('cancelKoordEditBtn').addEventListener('click', resetKoordForm);

document.getElementById('addKoordBtn') && document.getElementById('addKoordBtn').addEventListener('click', async () => {
  const name = document.getElementById('newKoordName').value.trim();
  if (!name) { showToast('Podaj imię i nazwisko'); return; }
  const parts = name.split(' ');
  const imie = parts.shift() || name;
  const nazwisko = parts.join(' ') || '';
  const typ = document.getElementById('newKoordTyp').value;
  const allowedModules = Array.from(document.querySelectorAll('#newKoordModulesChecklist input:checked')).map(cb => cb.value);

  if (obsState.editingKoordId) {
    const k = obsState.koordynatorzy.find(x => x.id === obsState.editingKoordId);
    if (k) {
      k.imie = imie; k.nazwisko = nazwisko; k.typ = typ; k.allowedModules = allowedModules;
      await DB.saveKoordynator(k);
      await syncKoordynatorSelfEmployee(k);
      showToast('Koordynator zaktualizowany');
    }
    resetKoordForm();
  } else {
    const koord = { imie, nazwisko, typ, allowedModules };
    await DB.saveKoordynator(koord);
    obsState.koordynatorzy.push(koord);
    await syncKoordynatorSelfEmployee(koord);
    resetKoordForm();
    showToast('Koordynator dodany');
  }
  renderKoordynatorzyAdminList();
});

// Koordynator — jak brygadzista — dostaje powiązany wpis w "Pracownicy",
// żeby można było zaznaczać jego obecność na check-liście.
async function syncKoordynatorSelfEmployee(koord) {
  let selfEmp = obsState.employees.find(e => e.linkedKoordynatorId === koord.id);
  if (!selfEmp) {
    selfEmp = obsState.employees.find(e =>
      !e.linkedBrygadzistaEntryId && !e.linkedKoordynatorId &&
      e.firstName === koord.imie && e.lastName === koord.nazwisko
    );
    if (selfEmp) {
      selfEmp.linkedKoordynatorId = koord.id;
    } else {
      selfEmp = {
        firstName: koord.imie, lastName: koord.nazwisko, type: koord.typ,
        shift: '', brygadzistaId: null, brygadzistaIds: [],
        linkedKoordynatorId: koord.id, active: 1
      };
    }
  }
  selfEmp.firstName = koord.imie;
  selfEmp.lastName = koord.nazwisko;
  selfEmp.type = koord.typ;
  await DB.saveEmployee(selfEmp);
  const idx = obsState.employees.findIndex(e => e.id === selfEmp.id);
  if (idx >= 0) obsState.employees[idx] = selfEmp;
  else obsState.employees.push(selfEmp);
}

// Każdy brygadzista dostaje automatycznie powiązany wpis w "Pracownicy" — dzięki temu
// pojawia się na własnej check-liście i można zaznaczyć jego obecność, tak samo jak
// pozostałym. Jeśli brygadzista obejmuje więcej niż jedną zmianę, jego obecność jest
// śledzona na pierwszej z zaznaczonych (ograniczenie warte świadomości).
async function syncBrygadzistaSelfEmployee(bryg) {
  // 1. Szukaj już powiązanego wpisu (po linkedBrygadzistaEntryId)
  let selfEmp = obsState.employees.find(e => e.linkedBrygadzistaEntryId === bryg.id);

  if (!selfEmp) {
    // 2. Szukaj ręcznie dodanego pracownika o tym samym nazwisku i imieniu (duplikat)
    //    Ignoruj wpisy już powiązane z innym brygadzistą
    const firstName = bryg.imie;
    const lastName = bryg.nazwisko;
    selfEmp = obsState.employees.find(e =>
      !e.linkedBrygadzistaEntryId &&
      e.firstName === firstName &&
      e.lastName === lastName
    );

    if (selfEmp) {
      // Scalamy: dodajemy powiązanie do istniejącego wpisu pracownika
      selfEmp.linkedBrygadzistaEntryId = bryg.id;
    } else {
      // Nowy pracownik — brygadzista nie był wcześniej w systemie
      selfEmp = {
        firstName,
        lastName,
        type: bryg.typ,
        shift: bryg.shiftIds[0],
        brygadzistaId: null,
        linkedBrygadzistaEntryId: bryg.id,
        active: 1
      };
    }
  }

  // Zawsze aktualizuj dane z profilu brygadzisty
  selfEmp.firstName = bryg.imie;
  selfEmp.lastName = bryg.nazwisko;
  selfEmp.type = bryg.typ;
  selfEmp.shift = bryg.shiftIds[0];

  await DB.saveEmployee(selfEmp);
  const idx = obsState.employees.findIndex(e => e.id === selfEmp.id);
  if (idx >= 0) obsState.employees[idx] = selfEmp;
  else obsState.employees.push(selfEmp);
}

// ===== EXPORT / IMPORT JSON (synchronizacja między brygadzistami) =====
document.getElementById('obsExportBtn').addEventListener('click', () => {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: obsState.currentShift || 'nieznana zmiana',
    employees: obsState.employees,
    attendanceRecords: obsState.attendanceRecords,
    leaveRequests: obsState.leaveRequests
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `obecnosc-${obsState.currentShift || 'zmiana'}-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Dane wyeksportowane — prześlij plik administratorowi');
});

document.getElementById('obsImportBtn').addEventListener('click', () => {
  document.getElementById('obsImportFile').click();
});

document.getElementById('obsImportFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!confirm(`Importujesz dane ze zmiany: "${data.exportedBy || 'nieznana'}" (${data.exportedAt ? new Date(data.exportedAt).toLocaleString('pl') : ''}).\n\nDane zostaną scalone z obecnymi (nowe rekordy dodane, istniejące niezmienione). Kontynuować?`)) return;

    // Scal pracowników (dodaj nowych, nie nadpisuj istniejących)
    let addedEmps = 0;
    for (const emp of data.employees || []) {
      if (!obsState.employees.find(e => e.id === emp.id)) {
        await DB.put('employees', emp);
        obsState.employees.push(emp);
        addedEmps++;
      }
    }

    // Scal rekordy obecności (dodaj nowe date+shift kombinacje)
    let addedRecs = 0;
    for (const rec of data.attendanceRecords || []) {
      if (!obsState.attendanceRecords.find(r => r.dateShift === rec.dateShift)) {
        await DB.put('attendanceRecords', rec);
        obsState.attendanceRecords.push(rec);
        addedRecs++;
      }
    }

    // Scal urlopy
    let addedLeaves = 0;
    for (const leave of data.leaveRequests || []) {
      if (!obsState.leaveRequests.find(l => l.id === leave.id)) {
        await DB.put('leaveRequests', leave);
        obsState.leaveRequests.push(leave);
        addedLeaves++;
      }
    }

    renderEmployeeList();
    renderAttendanceForm();
    renderCalendarActiveView();
    renderObsStats();
    renderLeaveList();
    showToast(`Import zakończony: +${addedEmps} pracowników, +${addedRecs} dni obecności, +${addedLeaves} urlopów`);
  } catch (err) {
    alert('Błąd importu: ' + err.message);
  }
  e.target.value = '';
});

// ===== EKSPORT DO EXCEL =====
document.getElementById('obsExcelBtn').addEventListener('click', async () => {
  if (typeof XLSX === 'undefined') {
    showToast('Ładowanie modułu Excel...');
    await loadXLSXLib();
  }
  exportObsToExcel();
});

function exportObsToExcel() {
  const wb = XLSX.utils.book_new();
  const y = obsState.currentYear;
  const m = obsState.currentMonth;
  const dim = daysInMonth(y, m);
  const prefix = `${y}-${String(m).padStart(2,'0')}`;
  const monthNames = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec',
                      'Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];

  // Arkusz 1: Miesięczny raport obecności (format jak VBA)
  const emps = obsState.employees.filter(e => e.active !== 0).sort((a,b) => a.lastName.localeCompare(b.lastName,'pl'));
  const headers = ['Nazwisko i imię', 'Typ', 'Zmiana'];
  for (let d = 1; d <= dim; d++) {
    const ds = dateStr(y, m, d);
    const dayObj = new Date(ds + 'T12:00:00');
    const dayNames = ['Nd','Pn','Wt','Śr','Cz','Pt','So'];
    headers.push(`${d}\n${dayNames[dayObj.getDay()]}`);
  }
  headers.push('Obecny', 'Nieobecny', 'Godz.');

  const attRows = emps.map(emp => {
    const row = [
      `${emp.lastName} ${emp.firstName}`,
      emp.type === 'outsourcing' ? 'Outsourcing' : 'Etat',
      shiftLabel(emp.shift)
    ];
    let present = 0, absent = 0, hours = 0;
    for (let d = 1; d <= dim; d++) {
      const ds = dateStr(y, m, d);
      if (isWeekend(ds) || isPolishHoliday(ds)) { row.push('—'); continue; }
      const entry = findEntryForEmployee(ds, emp.id);
      const status = entry ? entry.status : '';
      row.push(status || '');
      if (DB.PRESENT_STATUSES.includes(status)) { present++; hours += entry.hours || 0; }
      else if (status) absent++;
    }
    row.push(present, absent, hours);
    return row;
  });

  const wsData = [headers, ...attRows];
  const wsAtt = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, wsAtt, `Obecność ${monthNames[m-1]} ${y}`);

  // Arkusz 2: Urlopy
  const leaveData = [['Pracownik','Typ urlopu','Data od','Data do','Dni roboczych','Status','Uwagi']];
  obsState.leaveRequests.forEach(l => {
    const emp = obsState.employees.find(e => e.id === l.employeeId);
    const statusLabels = { planned: 'Do akceptacji', approved: 'Zatwierdzony', rejected: 'Odrzucony' };
    leaveData.push([
      emp ? `${emp.lastName} ${emp.firstName}` : '(usunięty)',
      DB.ATTENDANCE_STATUSES[l.type] ? DB.ATTENDANCE_STATUSES[l.type].label : l.type,
      fmtDate(l.dateFrom), fmtDate(l.dateTo), l.days,
      statusLabels[l.status] || l.status, l.note || ''
    ]);
  });
  const wsLeave = XLSX.utils.aoa_to_sheet(leaveData);
  XLSX.utils.book_append_sheet(wb, wsLeave, 'Urlopy');

  // Arkusz 3: Statystyki miesięczne
  const absenceCols = DB.ABSENCE_STATUSES; // dynamicznie z aktualnej definicji statusów
  const statsData = [['Pracownik','Zmiana','Obecny','Nieobecny','Godziny pracy', ...absenceCols]];
  emps.forEach(emp => {
    const recs = obsState.attendanceRecords.filter(r => r.date.startsWith(prefix));
    let present = 0, absent = 0, hours = 0;
    const statCounts = {};
    recs.forEach(rec => {
      const entry = rec.entries.find(e => e.employeeId === emp.id);
      if (!entry || !entry.status) return;
      statCounts[entry.status] = (statCounts[entry.status] || 0) + 1;
      if (DB.PRESENT_STATUSES.includes(entry.status)) { present++; hours += entry.hours || 0; }
      else absent++;
    });
    statsData.push([
      `${emp.lastName} ${emp.firstName}`, shiftLabel(emp.shift),
      present, absent, hours,
      ...absenceCols.map(k => statCounts[k] || 0)
    ]);
  });
  const wsStats = XLSX.utils.aoa_to_sheet(statsData);
  XLSX.utils.book_append_sheet(wb, wsStats, `Statystyki ${monthNames[m-1]} ${y}`);

  XLSX.writeFile(wb, `lista-obecnosci-${y}-${String(m).padStart(2,'0')}.xlsx`);
  showToast('Eksport do Excel zakończony');
}

// ===== WNIOSEK URLOPOWY .DOCX =====
function loadDocxLib() {
  return new Promise((resolve, reject) => {
    if (typeof docx !== 'undefined') return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Brak połączenia — biblioteka .docx wymaga internetu przy pierwszym użyciu.'));
    document.head.appendChild(script);
  });
}

async function generateLeaveDocx(leaveId) {
  const leave = obsState.leaveRequests.find(l => l.id === leaveId);
  if (!leave) return;
  const emp = obsState.employees.find(e => e.id === leave.employeeId);
  if (!emp) { showToast('Nie znaleziono pracownika'); return; }

  showToast('Generowanie wniosku...');
  try {
    await loadDocxLib();
  } catch(e) {
    showToast(e.message);
    return;
  }

  const { Document, Packer, Paragraph, TextRun, AlignmentType,
          Table, TableRow, TableCell, WidthType, BorderStyle,
          convertInchesToTwip } = docx;

  const NONCELL = {
    top: { style: BorderStyle.NONE, size: 0 },
    bottom: { style: BorderStyle.NONE, size: 0 },
    left: { style: BorderStyle.NONE, size: 0 },
    right: { style: BorderStyle.NONE, size: 0 },
  };

  const today = new Date();
  const todayFmt = `${String(today.getDate()).padStart(2,'0')}.${String(today.getMonth()+1).padStart(2,'0')}.${today.getFullYear()}`;
  const fromFmt = fmtDate(leave.dateFrom);
  const toDtFmt = fmtDate(leave.dateTo);

  const TYPES = {
    UW:  'urlop wypoczynkowy*',
    UZ:  'urlop NA ŻĄDANIE',
    UO:  'urlop okolicznościowy z tytułu (np. ślubu, urodzenia, śmierci)\n.........................................',
    UD:  'urlop BEZPŁATNY',
    OI:  'opieki nad dzieckiem do lat 14',
    SW:  'urlop siły wyższej',
    D:   'odbioru za święto ...........................................',
  };

  const cb = (checked) => new TextRun({ text: checked ? '☑' : '☐', size: 22, font: 'Arial' });

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: convertInchesToTwip(1.2), right: convertInchesToTwip(1.2), bottom: convertInchesToTwip(1.2), left: convertInchesToTwip(1.2) } }
      },
      children: [
        new Paragraph({
          children: [new TextRun({ text: `${emp.lastName} ${emp.firstName}`, size: 22 })],
        }),
        new Paragraph({
          children: [new TextRun({ text: '(Nazwisko i imię pracownika)', size: 18, italics: true })],
          spacing: { after: 80 },
        }),
        new Table({
          width: { size: 9000, type: WidthType.DXA },
          borders: NONCELL,
          rows: [new TableRow({ children: [
            new TableCell({ width: { size: 5000, type: WidthType.DXA }, borders: NONCELL, children: [new Paragraph('')] }),
            new TableCell({ width: { size: 4000, type: WidthType.DXA }, borders: NONCELL, children: [
              new Paragraph({ children: [new TextRun({ text: `Słupsk, dnia ${todayFmt}`, size: 22 })] })
            ]})
          ]})],
        }),
        new Paragraph({ text: '', spacing: { after: 160 } }),
        new Paragraph({
          children: [new TextRun({ text: 'Wniosek o urlop', size: 28, bold: true })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Niniejszym składam wniosek o udzielenie w dniach od ', size: 22 }),
            new TextRun({ text: fromFmt, size: 22, bold: true }),
            new TextRun({ text: ' do ', size: 22 }),
            new TextRun({ text: toDtFmt, size: 22, bold: true }),
            new TextRun({ text: ` tj. `, size: 22 }),
            new TextRun({ text: String(leave.days), size: 22, bold: true }),
            new TextRun({ text: ' dni:', size: 22 }),
          ],
          spacing: { after: 160 },
        }),
        ...Object.entries(TYPES).map(([key, label]) =>
          new Paragraph({
            children: [cb(leave.type === key), new TextRun({ text: '  ' + label, size: 22 })],
            spacing: { before: 80, after: 80 },
            indent: { left: 360 },
          })
        ),
        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({
          children: [new TextRun({ text: '*) właściwe podkreślić', size: 18, italics: true })],
          spacing: { after: 560 },
        }),
        new Table({
          width: { size: 9000, type: WidthType.DXA },
          borders: NONCELL,
          rows: [new TableRow({ children: [
            new TableCell({ width: { size: 4500, type: WidthType.DXA }, borders: NONCELL, children: [
              new Paragraph({ children: [new TextRun({ text: '......................................', size: 22 })], alignment: AlignmentType.CENTER }),
              new Paragraph({ children: [new TextRun({ text: '(Podpis przełożonego)', size: 18, italics: true })], alignment: AlignmentType.CENTER }),
              new Paragraph({ children: [new TextRun({ text: 'Akceptuję w/w wniosek', size: 22 })], alignment: AlignmentType.CENTER, spacing: { before: 80 } }),
            ]}),
            new TableCell({ width: { size: 4500, type: WidthType.DXA }, borders: NONCELL, children: [
              new Paragraph({ children: [new TextRun({ text: '......................................', size: 22 })], alignment: AlignmentType.CENTER }),
              new Paragraph({ children: [new TextRun({ text: '(Podpis pracownika)', size: 18, italics: true })], alignment: AlignmentType.CENTER }),
            ]}),
          ]})],
        }),
      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wniosek-urlopowy-${emp.lastName}-${leave.dateFrom}.docx`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Wniosek urlopowy wygenerowany');
}

// Eksponuję globalnie bo jest wywołana z innerHTML
window.generateLeaveDocx = generateLeaveDocx;

// ===== START =====
// ===== ODBIÓR DECYZJI Z CENTRALI (zatwierdzenie/odrzucenie wniosku urlopowego) =====
document.getElementById('importDecisionBtn').addEventListener('click', () => {
  document.getElementById('importDecisionFile').click();
});

document.getElementById('importDecisionFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const pkg = JSON.parse(text);
    if (!pkg || pkg.kind !== 'centrala-decision' || !Array.isArray(pkg.decisions)) {
      alert('To nie jest prawidłowy plik z decyzją centrali.');
      return;
    }
    let approved = 0, rejected = 0, notFound = 0;
    for (const d of pkg.decisions) {
      const leave = obsState.leaveRequests.find(l => l.id === d.leaveRequestId);
      if (!leave) { notFound++; continue; }
      leave.status = d.decision;
      leave.decidedBy = d.decidedBy;
      leave.decidedAt = d.decidedAt;
      if (d.note) leave.note = (leave.note ? leave.note + ' | ' : '') + `Decyzja: ${d.note}`;
      await DB.saveLeaveRequest(leave);
      if (d.decision === 'approved') approved++; else rejected++;
    }
    renderLeaveList();
    renderCalendarActiveView();
    showToast(`Zaktualizowano wnioski: ${approved} zatwierdzonych, ${rejected} odrzuconych${notFound ? `, ${notFound} nie znaleziono lokalnie` : ''}`);
  } catch (err) {
    alert('Błąd wczytywania pliku: ' + err.message);
  }
  e.target.value = '';
});

// ===== CENTRALA: OBECNOŚĆ — WYKRYWANIE I ROZSTRZYGANIE KONFLIKTÓW =====
// Gdy kilku brygadzistów (osobne urządzenia, osobne zgłoszenia) zgłasza
// obecność dla tych samych ludzi tego samego dnia/zmiany (np. dzielą obszar
// albo wspomagają się nawzajem), trzeba to porównać PRZED wpisaniem do
// oficjalnych danych — inaczej któreś zgłoszenie po prostu zniknęłoby.
async function getCentralaObecnoscGroups() {
  const submissions = await DB.getCentralSubmissions();
  const groups = {}; // dateShift -> [{brygadzistaId, brygadzistaName, receivedAt, record, employeesById}]
  submissions.forEach(sub => {
    const stores = (sub.payload && sub.payload.stores) || {};
    const employeesById = {};
    (stores.employees || []).forEach(e => { employeesById[e.id] = e; });
    (stores.attendanceRecords || []).forEach(rec => {
      if (!groups[rec.dateShift]) groups[rec.dateShift] = [];
      groups[rec.dateShift].push({
        brygadzistaId: sub.brygadzistaId,
        brygadzistaName: sub.brygadzistaName,
        receivedAt: sub.receivedAt,
        record: rec,
        employeesById
      });
    });
  });
  // Interesują nas przypadki, gdzie WIĘCEJ NIŻ JEDNO zgłoszenie dotyczy tego
  // samego dnia+obszaru+zmiany — niezależnie, czy to różni brygadziści, czy
  // TA SAMA tożsamość zgłaszająca się z kilku urządzeń (np. telefon + desktop
  // tej samej osoby). W obu przypadkach dane mogą się różnić i wymagają
  // przejrzenia — pojedyncze, zgodne zgłoszenie z jednego urządzenia nadal
  // przechodzi bez pytania (dokładnie jak dotychczas).
  const multi = {};
  Object.keys(groups).forEach(ds => {
    if (groups[ds].length > 1) multi[ds] = groups[ds];
  });
  return multi;
}

// Rozbija grupę zgłoszeń na pracowników bez sporu (agreed) i spornych (conflicts)
function analyzeAttendanceGroup(entries) {
  const employeeMap = {}; // employeeId -> [{brygadzistaName, receivedAt, entry, employeesById}]
  entries.forEach(({ brygadzistaName, receivedAt, record, employeesById }) => {
    (record.entries || []).forEach(e => {
      if (!employeeMap[e.employeeId]) employeeMap[e.employeeId] = [];
      employeeMap[e.employeeId].push({ brygadzistaName, receivedAt, entry: e, employeesById });
    });
  });
  const conflicts = [];
  const agreed = [];
  Object.keys(employeeMap).forEach(empId => {
    const reports = employeeMap[empId];
    const statuses = new Set(reports.map(r => r.entry.status));
    if (statuses.size > 1) conflicts.push({ empId, reports });
    else agreed.push({ empId, entry: reports[0].entry });
  });
  return { conflicts, agreed };
}

function empNameFromReports(empId, reports) {
  for (const r of reports) {
    if (r.employeesById[empId]) {
      const e = r.employeesById[empId];
      return `${e.lastName || ''} ${e.firstName || ''}`.trim() || '(bez nazwiska)';
    }
  }
  return '(nieznany pracownik)';
}

async function renderCentralaObecnosc() {
  const wrap = document.getElementById('centralaObecnoscList');
  const empty = document.getElementById('centralaObecnoscEmpty');
  if (!wrap) return;

  const groups = await getCentralaObecnoscGroups();
  const resolved = await DB.getSetting('centralaObecnoscResolved', {});

  // Pokaż tylko grupy jeszcze nierozstrzygnięte (albo takie, gdzie od czasu
  // rozstrzygnięcia przyszło NOWSZE zgłoszenie — trzeba przejrzeć ponownie).
  const toShow = Object.keys(groups).filter(ds => {
    const newestReceivedAt = Math.max(...groups[ds].map(g => g.receivedAt));
    return !resolved[ds] || newestReceivedAt > resolved[ds];
  });

  if (!toShow.length) {
    wrap.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  wrap.innerHTML = toShow.map(dateShift => {
    const entries = groups[dateShift];
    const first = entries[0].record;
    const obszar = (obsState.obszary || []).find(o => o.id === first.obszarId);
    const shiftDef = ALL_SHIFTS.find(s => s.id === first.shift);
    const miejsce = obszar ? obszar.nazwa : (first.obszarId ? '(nieznany obszar)' : '—');
    const zmiana = shiftDef ? shiftDef.label : (first.shift || '—');
    const zglaszajacy = [...new Set(entries.map(e => e.brygadzistaName))].join(', ');
    // Czy WSZYSTKIE zgłoszenia pochodzą od tej samej tożsamości? (ta sama
    // osoba korzystająca z kilku urządzeń — telefon + desktop — nie różni
    // ludzie). Warto to jasno pokazać, żeby nie wyglądało na spór między
    // dwiema osobami, skoro to jedno konto zgłasza się z dwóch miejsc.
    const unikalneId = new Set(entries.map(e => e.brygadzistaId));
    const toSamoKonto = unikalneId.size === 1 && entries.length > 1;

    const { conflicts, agreed } = analyzeAttendanceGroup(entries);

    const naglowek = `
      <div style="font-weight:700;margin-bottom:4px;">${escapeHtml(first.date)} — ${escapeHtml(miejsce)} — ${escapeHtml(zmiana)}</div>
      <div class="hint" style="margin-bottom:8px;">${toSamoKonto
        ? `Zgłosiło: ${escapeHtml(zglaszajacy)} — to samo konto, ${entries.length} zgłoszenia z różnych urządzeń (np. telefon + desktop)`
        : `Zgłosili: ${escapeHtml(zglaszajacy)}`}</div>
    `;

    if (!conflicts.length) {
      return `
        <div class="storage-row" style="margin-bottom:10px;flex-direction:column;align-items:flex-start;gap:6px;">
          ${naglowek}
          <div class="hint" style="color:var(--good);margin-bottom:6px;">✅ Wszyscy zgłaszający zgadzają się co do każdej osoby.</div>
          <button class="btn secondary" data-approve-noconflict="${escapeHtml(dateShift)}">✅ Zatwierdź</button>
        </div>
      `;
    }

    const conflictRows = conflicts.map(c => {
      const nazwa = empNameFromReports(c.empId, c.reports);
      // Kiedy kilka raportów pochodzi od TEGO SAMEGO nadawcy (np. telefon +
      // desktop tej samej osoby), sam podpis nazwiskiem nie odróżnia ich —
      // dopisujemy godzinę odebrania zgłoszenia, żeby było wiadomo, które jest które.
      const powtarzajaceSieNazwy = c.reports.map(r => r.brygadzistaName).filter((n, i, arr) => arr.indexOf(n) !== i).length > 0;
      const options = c.reports.map((r, idx) => {
        const statusDef = DB.ATTENDANCE_STATUSES[r.entry.status];
        const label = statusDef ? `${r.entry.status} — ${statusDef.label}` : (r.entry.status || 'brak');
        const godzina = powtarzajaceSieNazwy ? ` (odebrano ${new Date(r.receivedAt).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})` : '';
        return `<label style="display:block;margin-bottom:2px;">
          <input type="radio" name="conflict-${escapeHtml(dateShift)}-${escapeHtml(c.empId)}" value="${idx}" ${idx === 0 ? 'checked' : ''}>
          ${escapeHtml(r.brygadzistaName)}${escapeHtml(godzina)}: <strong>${escapeHtml(label)}</strong>
        </label>`;
      }).join('');
      return `
        <div style="padding:8px;background:var(--card2);border-radius:8px;margin-bottom:6px;">
          <div style="font-weight:700;margin-bottom:4px;color:var(--bad);">⚠️ ${escapeHtml(nazwa)} — rozbieżne zgłoszenia</div>
          ${options}
        </div>
      `;
    }).join('');

    return `
      <div class="storage-row" style="margin-bottom:10px;flex-direction:column;align-items:flex-start;gap:6px;" data-conflict-group="${escapeHtml(dateShift)}">
        ${naglowek}
        <div class="hint" style="margin-bottom:6px;">${agreed.length} os. bez sporu, ${conflicts.length} os. wymaga wyboru poniżej:</div>
        ${conflictRows}
        <button class="btn" data-approve-resolved="${escapeHtml(dateShift)}">✅ Zatwierdź wybrane</button>
      </div>
    `;
  }).join('');

  // Bez konfliktów — po prostu scal wszystko, co zgodne, i zapisz
  wrap.querySelectorAll('[data-approve-noconflict]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const dateShift = btn.dataset.approveNoconflict;
      const entries = groups[dateShift];
      const { agreed } = analyzeAttendanceGroup(entries);
      await saveResolvedAttendanceGroup(dateShift, entries[0].record, agreed.map(a => a.entry));
      showToast('Zatwierdzono');
      await renderCentralaObecnosc();
    });
  });

  // Z konfliktami — zbierz wybory z radio, scal z bezspornymi, zapisz
  wrap.querySelectorAll('[data-approve-resolved]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const dateShift = btn.dataset.approveResolved;
      const entries = groups[dateShift];
      const { agreed, conflicts } = analyzeAttendanceGroup(entries);
      const finalEntries = agreed.map(a => a.entry);
      let missingChoice = false;
      conflicts.forEach(c => {
        const checked = document.querySelector(`input[name="conflict-${CSS.escape(dateShift)}-${CSS.escape(c.empId)}"]:checked`);
        if (!checked) { missingChoice = true; return; }
        finalEntries.push(c.reports[parseInt(checked.value, 10)].entry);
      });
      if (missingChoice) { showToast('Wybierz wersję dla każdej spornej osoby'); return; }
      await saveResolvedAttendanceGroup(dateShift, entries[0].record, finalEntries);
      showToast('Zatwierdzono');
      await renderCentralaObecnosc();
    });
  });
}

async function saveResolvedAttendanceGroup(dateShift, templateRecord, finalEntries) {
  let record = obsState.attendanceRecords.find(r => r.dateShift === dateShift);
  if (!record) {
    record = { date: templateRecord.date, shift: templateRecord.shift, obszarId: templateRecord.obszarId, dateShift, entries: [], note: '' };
  }
  record.entries = finalEntries;
  await DB.saveAttendance(record);
  const idx = obsState.attendanceRecords.findIndex(r => r.dateShift === record.dateShift);
  if (idx >= 0) obsState.attendanceRecords[idx] = record;
  else obsState.attendanceRecords.push(record);

  const resolved = await DB.getSetting('centralaObecnoscResolved', {});
  resolved[dateShift] = Date.now();
  await DB.setSetting('centralaObecnoscResolved', resolved);

  renderCalendarActiveView();
  renderObsStats();
}

// ===== KATEGORIE OSÓB (edytowalna lista) + MIGRACJA DO WSPÓLNEJ LISTY =====
async function renderKategorieList() {
  const wrap = document.getElementById('kategorieList');
  if (!wrap) return;
  const kategorie = await DB.getKategorie();
  wrap.innerHTML = kategorie.map((k, idx) => `
    <div class="storage-row" style="margin-bottom:6px;">
      <input type="text" value="${escapeHtml(k)}" data-kategoria-idx="${idx}" style="flex:1;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:6px 10px;">
      <button class="btn danger" data-delete-kategoria="${idx}" style="padding:4px 10px;font-size:12px;">🗑</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-kategoria-idx]').forEach(input => {
    input.addEventListener('change', async () => {
      const idx = parseInt(input.dataset.kategoriaIdx, 10);
      const list = await DB.getKategorie();
      const staraNazwa = list[idx];
      const nowaNazwa = input.value.trim();
      if (!nowaNazwa) { input.value = staraNazwa; return; }
      list[idx] = nowaNazwa;
      await DB.setKategorie(list);
      // Zaktualizuj też wszystkie osoby, które miały starą nazwę kategorii
      if (staraNazwa !== nowaNazwa) {
        const wszyscy = await DB.getAllEmployees();
        for (const e of wszyscy) {
          if (e.kategoria === staraNazwa) {
            e.kategoria = nowaNazwa;
            await DB.saveEmployee(e);
          }
        }
        obsState.employees = await DB.getAllEmployees();
      }
      showToast('Kategoria zaktualizowana');
    });
  });
  wrap.querySelectorAll('[data-delete-kategoria]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.deleteKategoria, 10);
      const list = await DB.getKategorie();
      if (!confirm(`Usunąć kategorię "${list[idx]}"? Osoby, które ją miały, zostaną bez kategorii — trzeba im będzie nadać nową ręcznie.`)) return;
      list.splice(idx, 1);
      await DB.setKategorie(list);
      await renderKategorieList();
      showToast('Kategoria usunięta');
    });
  });
}

document.getElementById('addKategoriaBtn') && document.getElementById('addKategoriaBtn').addEventListener('click', async () => {
  const input = document.getElementById('newKategoriaName');
  const nazwa = input.value.trim();
  if (!nazwa) { showToast('Podaj nazwę kategorii'); return; }
  const list = await DB.getKategorie();
  if (list.includes(nazwa)) { showToast('Taka kategoria już istnieje'); return; }
  list.push(nazwa);
  await DB.setKategorie(list);
  input.value = '';
  await renderKategorieList();
  showToast('Kategoria dodana');
});

async function renderMigrationStatus() {
  const hint = document.getElementById('migrationStatusHint');
  const btn = document.getElementById('runMigrationBtn');
  if (!hint || !btn) return;
  const done = await DB.isKategorieMigrationDone();
  if (done) {
    hint.textContent = '✅ Scalono już wcześniej. Możesz uruchomić ponownie bezpiecznie w każdej chwili (np. po dodaniu nowego brygadzisty/koordynatora) — nic nie zniknie, tylko dopisze brakujące.';
  } else {
    hint.textContent = '⚠️ Jeszcze nie uruchomione. Brygadziści i koordynatorzy wciąż żyją osobno od listy pracowników — kliknij poniżej, żeby ich scalić w jedną wspólną listę.';
  }
}

document.getElementById('runMigrationBtn') && document.getElementById('runMigrationBtn').addEventListener('click', async () => {
  if (!confirm('To scali brygadzistów i koordynatorów z listą pracowników, nadając każdej osobie kategorię. Nic nie zostanie usunięte — operacja jest bezpieczna i można ją powtórzyć. Kontynuować?')) return;
  const liczba = await DB.migrateToUnifiedKategorie();
  obsState.employees = await DB.getAllEmployees();
  await renderMigrationStatus();
  showToast(`Scalono — zaktualizowano ${liczba} osób.`);
});

initObecnosc();
