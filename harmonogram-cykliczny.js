// ===== HARMONOGRAM CYKLICZNY =====
// Jak Harmonogram codzienny, ale zadania mają częstotliwość: co określoną
// liczbę dni, albo w konkretne dni tygodnia. Widok "Do wykonania" pokazuje
// tylko te zadania, których termin (wg cyklu) już nadszedł.
// Funkcje renderHarmZadanieRow/attachHarmPHListener/harmZapiszWpis/
// currentUserDisplayName są WSPÓLNE z harmonogram-codzienny.js (ten plik
// ładuje się jako pierwszy z dwóch, patrz komentarz tam) — nie duplikujemy.

const harmCyklState = {
  obszary: [],
  zadania: [],
  wpisy: [],
  editingObszarId: null,
  editingZadanieId: null
};

const HARM_DNI_TYGODNIA_NAZWY = ['Nd', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'];

async function initHarmCykliczny() {
  harmCyklState.obszary = await DB.getHarmCyklObszary();
  harmCyklState.zadania = await DB.getHarmCyklZadania();
  harmCyklState.wpisy = await DB.getHarmCyklWpisy();
  renderHarmCyklDniTygodniaWybor();
  renderHarmCyklDzien();
  renderHarmCyklObszaryList();
  renderHarmCyklZadaniaList();
  fillHarmCyklObszarSelect();
}

// Dodaje N dni do daty w formacie YYYY-MM-DD, zwraca w tym samym formacie.
function harmDodajDni(dataStr, dni) {
  const d = new Date(dataStr + 'T00:00:00');
  d.setDate(d.getDate() + dni);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Czy zadanie jest wymagane na dany dzień, wg jego typu cyklu.
// - dni_tygodnia: wymagane, jeśli dzisiejszy dzień tygodnia jest na liście.
// - interwal: wymagane, jeśli nigdy nie wykonane, albo minęło >= interwalDni
//   dni od ostatniego wykonania.
function harmCyklZadanieWymagane(zadanie, data, wpisy) {
  if (zadanie.cyklTyp === 'dni_tygodnia') {
    const dzienTyg = new Date(data + 'T00:00:00').getDay();
    return (zadanie.dniTygodnia || []).includes(dzienTyg);
  }
  const wpisyZadania = wpisy.filter(w => w.zadanieId === zadanie.id).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  if (!wpisyZadania.length) return true;
  const nastepnyTermin = harmDodajDni(wpisyZadania[0].data, zadanie.interwalDni || 1);
  return data >= nastepnyTermin;
}

function harmCyklOpisCyklu(zadanie) {
  if (zadanie.cyklTyp === 'dni_tygodnia') {
    return (zadanie.dniTygodnia || []).map(d => HARM_DNI_TYGODNIA_NAZWY[d]).join(', ') || '(brak dni)';
  }
  return `co ${zadanie.interwalDni || 1} dni`;
}

// ===== OBSZARY CRUD =====
function renderHarmCyklObszaryList() {
  const container = document.getElementById('harmCyklObszaryList');
  if (!container) return;
  const aktywne = harmCyklState.obszary.filter(o => o.active !== 0);
  if (!aktywne.length) {
    container.innerHTML = '<div class="hint">Brak obszarów — dodaj pierwszy poniżej.</div>';
    return;
  }
  container.innerHTML = aktywne.map(o => `
    <div class="picked-items-row">
      <span>${escapeHtml(o.nazwa)}</span>
      <div class="row" style="gap:6px;">
        <button class="icon-btn" data-edit-harmcykl-obszar="${o.id}">✏️</button>
        <button class="icon-btn" data-del-harmcykl-obszar="${o.id}">🗑️</button>
      </div>
    </div>
  `).join('');
}

function fillHarmCyklObszarSelect() {
  const sel = document.getElementById('harmCyklNewZadanieObszar');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = harmCyklState.obszary.filter(o => o.active !== 0).map(o => `<option value="${o.id}">${escapeHtml(o.nazwa)}</option>`).join('');
  if (current) sel.value = current;
}

document.getElementById('harmCyklAddObszarBtn') && document.getElementById('harmCyklAddObszarBtn').addEventListener('click', async () => {
  const input = document.getElementById('harmCyklNewObszarNazwa');
  const nazwa = input.value.trim();
  if (!nazwa) { showToast('Podaj nazwę obszaru'); return; }
  if (harmCyklState.editingObszarId) {
    const o = harmCyklState.obszary.find(x => x.id === harmCyklState.editingObszarId);
    if (o) { o.nazwa = nazwa; await DB.saveHarmCyklObszar(o); }
    harmCyklState.editingObszarId = null;
    document.getElementById('harmCyklAddObszarBtn').textContent = 'Dodaj obszar';
    document.getElementById('harmCyklCancelObszarEditBtn').style.display = 'none';
  } else {
    const o = { nazwa, active: 1 };
    await DB.saveHarmCyklObszar(o);
    harmCyklState.obszary.push(o);
  }
  input.value = '';
  renderHarmCyklObszaryList();
  fillHarmCyklObszarSelect();
  showToast('Zapisano');
});

document.getElementById('harmCyklCancelObszarEditBtn') && document.getElementById('harmCyklCancelObszarEditBtn').addEventListener('click', () => {
  harmCyklState.editingObszarId = null;
  document.getElementById('harmCyklNewObszarNazwa').value = '';
  document.getElementById('harmCyklAddObszarBtn').textContent = 'Dodaj obszar';
  document.getElementById('harmCyklCancelObszarEditBtn').style.display = 'none';
});

document.getElementById('harmCyklObszaryList') && document.getElementById('harmCyklObszaryList').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('[data-edit-harmcykl-obszar]');
  const delBtn = e.target.closest('[data-del-harmcykl-obszar]');
  if (editBtn) {
    const id = editBtn.dataset.editHarmcyklObszar;
    const o = harmCyklState.obszary.find(x => x.id === id);
    if (!o) return;
    harmCyklState.editingObszarId = id;
    document.getElementById('harmCyklNewObszarNazwa').value = o.nazwa;
    document.getElementById('harmCyklAddObszarBtn').textContent = 'Zapisz zmiany';
    document.getElementById('harmCyklCancelObszarEditBtn').style.display = 'inline-block';
  } else if (delBtn) {
    const id = delBtn.dataset.delHarmcyklObszar;
    const zadaniaWObszarze = harmCyklState.zadania.filter(z => z.obszarId === id && z.active !== 0);
    if (zadaniaWObszarze.length) {
      if (!confirm(`Ten obszar ma ${zadaniaWObszarze.length} przypisanych zadań. Same zadania nie zostaną usunięte, ale stracą widoczny obszar. Kontynuować?`)) return;
    }
    const o = harmCyklState.obszary.find(x => x.id === id);
    if (o) { o.active = 0; await DB.saveHarmCyklObszar(o); }
    renderHarmCyklObszaryList();
    fillHarmCyklObszarSelect();
    renderHarmCyklDzien();
  }
});

// ===== ZADANIA CRUD =====
function renderHarmCyklDniTygodniaWybor() {
  const container = document.getElementById('harmCyklNewZadanieDniTygodniaWybor');
  if (!container || container.children.length) return; // już wygenerowane
  container.innerHTML = HARM_DNI_TYGODNIA_NAZWY.map((nazwa, idx) => `
    <label style="display:flex;align-items:center;gap:4px;padding:6px 10px;background:var(--card2);border-radius:8px;cursor:pointer;">
      <input type="checkbox" value="${idx}" data-harmcykl-dzien-checkbox style="width:16px;height:16px;">
      <span style="font-size:13px;">${nazwa}</span>
    </label>
  `).join('');
}

document.getElementById('harmCyklNewZadanieCyklTyp') && document.getElementById('harmCyklNewZadanieCyklTyp').addEventListener('change', (e) => {
  const interwal = e.target.value === 'interwal';
  const poleInterwal = document.getElementById('harmCyklNewZadanieInterwalPole');
  const poleDni = document.getElementById('harmCyklNewZadanieDniTygodniaPole');
  if (poleInterwal) poleInterwal.style.display = interwal ? 'block' : 'none';
  if (poleDni) poleDni.style.display = interwal ? 'none' : 'block';
});

function renderHarmCyklZadaniaList() {
  const container = document.getElementById('harmCyklZadaniaList');
  if (!container) return;
  const aktywne = harmCyklState.zadania.filter(z => z.active !== 0);
  if (!aktywne.length) {
    container.innerHTML = '<div class="hint">Brak zadań — dodaj pierwsze poniżej.</div>';
    return;
  }
  container.innerHTML = aktywne.map(z => {
    const obszar = harmCyklState.obszary.find(o => o.id === z.obszarId);
    return `
    <div class="picked-items-row">
      <span>${escapeHtml(obszar ? obszar.nazwa : '(brak obszaru)')} — ${escapeHtml(z.nazwa)} <span class="badge">${escapeHtml(harmCyklOpisCyklu(z))}</span>${z.wymagaPH ? ' <span class="badge">pH</span>' : ''}</span>
      <div class="row" style="gap:6px;">
        <button class="icon-btn" data-edit-harmcykl-zadanie="${z.id}">✏️</button>
        <button class="icon-btn" data-del-harmcykl-zadanie="${z.id}">🗑️</button>
      </div>
    </div>
  `;
  }).join('');
}

function harmCyklResetFormularzZadania() {
  document.getElementById('harmCyklNewZadanieNazwa').value = '';
  document.getElementById('harmCyklNewZadanieWymagaPH').checked = false;
  document.getElementById('harmCyklNewZadanieCyklTyp').value = 'interwal';
  document.getElementById('harmCyklNewZadanieInterwalDni').value = '';
  document.getElementById('harmCyklNewZadanieInterwalPole').style.display = 'block';
  document.getElementById('harmCyklNewZadanieDniTygodniaPole').style.display = 'none';
  document.querySelectorAll('[data-harmcykl-dzien-checkbox]').forEach(cb => { cb.checked = false; });
}

document.getElementById('harmCyklAddZadanieBtn') && document.getElementById('harmCyklAddZadanieBtn').addEventListener('click', async () => {
  const obszarId = document.getElementById('harmCyklNewZadanieObszar').value;
  const nazwaInput = document.getElementById('harmCyklNewZadanieNazwa');
  const nazwa = nazwaInput.value.trim();
  const wymagaPH = document.getElementById('harmCyklNewZadanieWymagaPH').checked;
  const cyklTyp = document.getElementById('harmCyklNewZadanieCyklTyp').value;
  const interwalDni = Number(document.getElementById('harmCyklNewZadanieInterwalDni').value) || 0;
  const dniTygodnia = Array.from(document.querySelectorAll('[data-harmcykl-dzien-checkbox]:checked')).map(cb => Number(cb.value));

  if (!obszarId) { showToast('Najpierw dodaj obszar'); return; }
  if (!nazwa) { showToast('Podaj nazwę zadania'); return; }
  if (cyklTyp === 'interwal' && interwalDni < 1) { showToast('Podaj poprawną liczbę dni (co najmniej 1)'); return; }
  if (cyklTyp === 'dni_tygodnia' && !dniTygodnia.length) { showToast('Wybierz przynajmniej jeden dzień tygodnia'); return; }

  const dane = {
    obszarId, nazwa, wymagaPH, cyklTyp,
    interwalDni: cyklTyp === 'interwal' ? interwalDni : null,
    dniTygodnia: cyklTyp === 'dni_tygodnia' ? dniTygodnia : []
  };

  if (harmCyklState.editingZadanieId) {
    const z = harmCyklState.zadania.find(x => x.id === harmCyklState.editingZadanieId);
    if (z) { Object.assign(z, dane); await DB.saveHarmCyklZadanie(z); }
    harmCyklState.editingZadanieId = null;
    document.getElementById('harmCyklAddZadanieBtn').textContent = 'Dodaj zadanie';
    document.getElementById('harmCyklCancelZadanieEditBtn').style.display = 'none';
  } else {
    const z = { ...dane, active: 1 };
    await DB.saveHarmCyklZadanie(z);
    harmCyklState.zadania.push(z);
  }
  harmCyklResetFormularzZadania();
  renderHarmCyklZadaniaList();
  renderHarmCyklDzien();
  showToast('Zapisano');
});

document.getElementById('harmCyklCancelZadanieEditBtn') && document.getElementById('harmCyklCancelZadanieEditBtn').addEventListener('click', () => {
  harmCyklState.editingZadanieId = null;
  harmCyklResetFormularzZadania();
  document.getElementById('harmCyklAddZadanieBtn').textContent = 'Dodaj zadanie';
  document.getElementById('harmCyklCancelZadanieEditBtn').style.display = 'none';
});

document.getElementById('harmCyklZadaniaList') && document.getElementById('harmCyklZadaniaList').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('[data-edit-harmcykl-zadanie]');
  const delBtn = e.target.closest('[data-del-harmcykl-zadanie]');
  if (editBtn) {
    const id = editBtn.dataset.editHarmcyklZadanie;
    const z = harmCyklState.zadania.find(x => x.id === id);
    if (!z) return;
    harmCyklState.editingZadanieId = id;
    document.getElementById('harmCyklNewZadanieObszar').value = z.obszarId;
    document.getElementById('harmCyklNewZadanieNazwa').value = z.nazwa;
    document.getElementById('harmCyklNewZadanieWymagaPH').checked = !!z.wymagaPH;
    document.getElementById('harmCyklNewZadanieCyklTyp').value = z.cyklTyp || 'interwal';
    const interwal = (z.cyklTyp || 'interwal') === 'interwal';
    document.getElementById('harmCyklNewZadanieInterwalPole').style.display = interwal ? 'block' : 'none';
    document.getElementById('harmCyklNewZadanieDniTygodniaPole').style.display = interwal ? 'none' : 'block';
    document.getElementById('harmCyklNewZadanieInterwalDni').value = z.interwalDni || '';
    document.querySelectorAll('[data-harmcykl-dzien-checkbox]').forEach(cb => {
      cb.checked = (z.dniTygodnia || []).includes(Number(cb.value));
    });
    document.getElementById('harmCyklAddZadanieBtn').textContent = 'Zapisz zmiany';
    document.getElementById('harmCyklCancelZadanieEditBtn').style.display = 'inline-block';
  } else if (delBtn) {
    const id = delBtn.dataset.delHarmcyklZadanie;
    if (!confirm('Usunąć to zadanie? Historia wcześniejszych potwierdzeń zostanie zachowana.')) return;
    const z = harmCyklState.zadania.find(x => x.id === id);
    if (z) { z.active = 0; await DB.saveHarmCyklZadanie(z); }
    renderHarmCyklZadaniaList();
    renderHarmCyklDzien();
  }
});

// ===== WIDOK "DO WYKONANIA" =====
function renderHarmCyklDzien() {
  const container = document.getElementById('harmCyklDzienList');
  const empty = document.getElementById('harmCyklDzienEmpty');
  if (!container) return;
  const data = todayStr();

  const zadania = harmCyklState.zadania.filter(z => z.active !== 0 && harmCyklZadanieWymagane(z, data, harmCyklState.wpisy));
  if (!zadania.length) {
    container.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  const obszary = harmCyklState.obszary.filter(o => o.active !== 0);
  const html = obszary.map(obszar => {
    const zadaniaObszaru = zadania.filter(z => z.obszarId === obszar.id);
    if (!zadaniaObszaru.length) return '';
    const wiersze = zadaniaObszaru.map(z => {
      const wpis = harmCyklState.wpisy.find(w => w.zadanieId === z.id && w.data === data);
      return renderHarmZadanieRow(z, wpis);
    }).join('');
    return `<div class="card"><h3 style="margin-bottom:8px;">${escapeHtml(obszar.nazwa)}</h3>${wiersze}</div>`;
  }).join('');
  container.innerHTML = html || '<div class="hint">Wszystkie wymagane dziś zadania są w obszarach, które nie mają jeszcze nazwy — sprawdź zakładkę "Obszary".</div>';
  attachHarmPHListener(container);
}

document.getElementById('harmCyklDzienList') && document.getElementById('harmCyklDzienList').addEventListener('click', async (e) => {
  const saveBtn = e.target.closest('[data-harm-save]');
  if (!saveBtn) return;
  const zadanieId = saveBtn.dataset.harmSave;
  const zadanie = harmCyklState.zadania.find(z => z.id === zadanieId);
  if (!zadanie) return;
  const data = todayStr();
  const ok = await harmZapiszWpis(zadanie, data, document.getElementById('harmCyklDzienList'), {
    getWpis: (zid, d) => harmCyklState.wpisy.find(w => w.zadanieId === zid && w.data === d),
    saveWpis: async (wpis) => {
      await DB.saveHarmCyklWpis(wpis);
      if (!harmCyklState.wpisy.includes(wpis)) harmCyklState.wpisy.push(wpis);
    }
  });
  if (ok) renderHarmCyklDzien();
});

// ===== HISTORIA =====
function renderHarmCyklHistoria() {
  const container = document.getElementById('harmCyklHistoriaList');
  if (!container) return;
  const od = document.getElementById('harmCyklHistOd').value;
  const doD = document.getElementById('harmCyklHistDo').value;
  let wpisy = [...harmCyklState.wpisy].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  if (od) wpisy = wpisy.filter(w => (w.data || '') >= od);
  if (doD) wpisy = wpisy.filter(w => (w.data || '') <= doD);
  if (!wpisy.length) {
    container.innerHTML = '<div class="hint">Brak potwierdzeń w wybranym okresie.</div>';
    return;
  }
  container.innerHTML = wpisy.map(w => {
    const zadanie = harmCyklState.zadania.find(z => z.id === w.zadanieId);
    const obszar = zadanie ? harmCyklState.obszary.find(o => o.id === zadanie.obszarId) : null;
    const phInfo = (w.phWartosc !== undefined && w.phWartosc !== null)
      ? `pH: ${w.phWartosc}${Number(w.phWartosc) !== 7 ? ` — ${escapeHtml(w.phOpis || '')}` : ''}`
      : '';
    return `
      <div class="card" style="padding:12px 14px;margin-bottom:8px;">
        <div style="font-weight:600;">${escapeHtml(w.data)} — ${escapeHtml(obszar ? obszar.nazwa : '?')} — ${escapeHtml(zadanie ? zadanie.nazwa : '(usunięte zadanie)')}</div>
        <div class="hint" style="margin-top:4px;">Potwierdził: ${escapeHtml(w.wykonawca || '—')}${phInfo ? ' · ' + phInfo : ''}</div>
      </div>
    `;
  }).join('');
}

document.getElementById('harmCyklHistFilterBtn') && document.getElementById('harmCyklHistFilterBtn').addEventListener('click', renderHarmCyklHistoria);
