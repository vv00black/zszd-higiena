// ===== HARMONOGRAM CODZIENNY =====
// Obszary (np. Antipasti, Hummus) → zadania w nich → codzienne potwierdzenia
// wykonania, z opcjonalnym pomiarem pH. W pełni edytowalne przez admina.

const harmCodzState = {
  obszary: [],
  zadania: [],
  wpisy: [],
  statusy: [],
  phMiejsca: [],
  phZakres: { min: 6, max: 8 },
  editingObszarId: null,
  editingZadanieId: null,
  editingStatusId: null
};

// Domyślna legenda statusów — zasiewana TYLKO raz, gdy lista jest pusta (pierwsze
// uruchomienie modułu). Od tej chwili w pełni edytowalna — admin może dowolnie
// zmieniać, dodawać, usuwać, to nie jest lista na sztywno wpisana w kod.
const HARM_CODZ_DOMYSLNE_STATUSY = [
  { kod: 'PZ', opis: 'Mycie zasadowe zostało przeprowadzone prawidłowo, bez zastrzeżeń', kolor: '#d4d94f', wymagaKomentarza: false },
  { kod: 'PK', opis: 'Mycie kwaśne zostało przeprowadzone prawidłowo, bez zastrzeżeń', kolor: '#8b3a3a', wymagaKomentarza: false },
  { kod: 'PM', opis: 'Weryfikacja mycia wykazała konieczność powtórnego mycia', kolor: '#e8a33d', wymagaKomentarza: true },
  { kod: 'N', opis: 'Weryfikacja wykazała brak możliwości dopuszczenia linii do produkcji', kolor: '#f2b9b9', wymagaKomentarza: true },
  { kod: 'X', opis: 'Brak mycia w obszarze', kolor: '#e05c5c', wymagaKomentarza: true }
];

async function harmCodzZasiejDomyslneStatusy() {
  const istniejace = await DB.getHarmCodzStatusy();
  if (istniejace.length) return istniejace;
  const zasiane = [];
  for (const s of HARM_CODZ_DOMYSLNE_STATUSY) {
    const zapisany = { ...s, active: 1 };
    await DB.saveHarmCodzStatus(zapisany);
    zasiane.push(zapisany);
  }
  return zasiane;
}

async function initHarmCodzienny() {
  harmCodzState.obszary = await DB.getHarmCodzObszary();
  harmCodzState.zadania = await DB.getHarmCodzZadania();
  harmCodzState.wpisy = await DB.getHarmCodzWpisy();
  harmCodzState.statusy = await harmCodzZasiejDomyslneStatusy();
  harmCodzState.phMiejsca = await DB.getSetting('harmCodzPHMiejsca', ['stół', 'lej nadziewarki', 'korpus nadziewarki', 'taśma transportowa', 'szalka wagi']);
  harmCodzState.phZakres = await DB.getSetting('harmCodzPHZakres', { min: 6, max: 8 });
  const dateInput = document.getElementById('harmCodzDzienData');
  if (dateInput && !dateInput.value) dateInput.value = todayStr();
  renderHarmCodzDzien();
  renderHarmCodzObszaryList();
  renderHarmCodzZadaniaList();
  fillHarmCodzObszarSelect();
  renderHarmCodzStatusyList();
  renderHarmCodzPHMiejscaList();
  renderHarmCodzPHZakresForm();
}

// ===== FUNKCJE WSPÓLNE (używane też przez harmonogram-cykliczny.js) =====
// Trzymane tutaj, bo ten plik ładuje się pierwszy z dwóch — oba moduły
// zawsze są dostarczane razem, w tej samej paczce.

function currentUserDisplayName() {
  if (!currentUser) return '(nieznany)';
  if (currentUser.role) {
    const pelne = `${currentUser.imie || ''} ${currentUser.nazwisko || ''}`.trim();
    return pelne || currentUser.username || '(nieznany)';
  }
  return currentUser.displayName || currentUser.username || '(nieznany)';
}

// Renderuje jeden wiersz zadania z formularzem potwierdzenia (checkbox +
// opcjonalne pole pH + opcjonalny, wymagany przy pH≠7 opis korekty).
function renderHarmZadanieRow(zadanie, wpis) {
  const zapisane = !!wpis;
  const phValue = (wpis && wpis.phWartosc !== undefined && wpis.phWartosc !== null) ? wpis.phWartosc : '';
  const phOpis = (wpis && wpis.phOpis) ? wpis.phOpis : '';
  const pokazOpis = zadanie.wymagaPH && phValue !== '' && Number(phValue) !== 7;
  return `
    <div class="checklist-row" data-harm-row="${zadanie.id}" style="flex-wrap:wrap;align-items:flex-start;max-width:none;">
      <div style="flex:1;min-width:200px;">
        <div style="font-weight:600;">${escapeHtml(zadanie.nazwa)}${zapisane ? ' <span class="badge">✅ potwierdzone</span>' : ''}</div>
        ${zadanie.wymagaPH ? `
          <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <label style="font-size:13px;">pH:</label>
            <input type="number" step="0.1" data-harm-ph="${zadanie.id}" value="${phValue}" style="width:90px;padding:6px;">
          </div>
          <div data-harm-opis-wrap="${zadanie.id}" style="display:${pokazOpis ? 'block' : 'none'};margin-top:6px;">
            <div class="hint" style="color:#c0392b;margin-bottom:4px;">pH różne od 7 — opisz, co wdrożono, żeby poprawić wynik:</div>
            <textarea data-harm-opis="${zadanie.id}" rows="2" style="width:100%;">${escapeHtml(phOpis)}</textarea>
          </div>
        ` : ''}
        ${wpis ? `<div class="hint" style="margin-top:6px;">Potwierdził: ${escapeHtml(wpis.wykonawca || '—')} · ${wpis.godzina ? new Date(wpis.godzina).toLocaleString('pl-PL') : ''}</div>` : ''}
      </div>
      <button class="btn ${zapisane ? 'secondary' : ''} full-width" data-harm-save="${zadanie.id}" style="margin-top:4px;max-width:160px;">${zapisane ? 'Zaktualizuj' : '✅ Potwierdź'}</button>
    </div>
  `;
}

// Nasłuch na zmianę pola pH — pokazuje/chowa pole opisu korekty na bieżąco,
// bez przeładowania całej listy. Delegacja na wspólnym kontenerze.
function attachHarmPHListener(containerEl) {
  if (!containerEl) return;
  containerEl.addEventListener('input', (e) => {
    const phInput = e.target.closest('[data-harm-ph]');
    if (!phInput) return;
    const id = phInput.dataset.harmPh;
    const wrap = containerEl.querySelector(`[data-harm-opis-wrap="${id}"]`);
    if (!wrap) return;
    const val = phInput.value;
    wrap.style.display = (val !== '' && Number(val) !== 7) ? 'block' : 'none';
  });
}

// Zapisuje potwierdzenie wykonania zadania — z walidacją: jeśli zadanie
// wymaga pH, wartość jest wymagana; jeśli pH≠7, opis korekty jest wymagany
// (blokuje zapis, zgodnie z ustaleniem).
async function harmZapiszWpis(zadanie, data, containerEl, config) {
  const phInput = containerEl.querySelector(`[data-harm-ph="${zadanie.id}"]`);
  const opisInput = containerEl.querySelector(`[data-harm-opis="${zadanie.id}"]`);
  const phWartosc = (zadanie.wymagaPH && phInput && phInput.value !== '') ? Number(phInput.value) : null;
  const phOpis = opisInput ? opisInput.value.trim() : '';

  if (zadanie.wymagaPH && phWartosc === null) {
    showToast('Podaj wynik pomiaru pH');
    return false;
  }
  if (zadanie.wymagaPH && phWartosc !== 7 && !phOpis) {
    showToast('pH różne od 7 — opisz, co wdrożono, żeby poprawić wynik');
    return false;
  }

  const istniejacy = config.getWpis(zadanie.id, data);
  const wpis = istniejacy || { zadanieId: zadanie.id, data };
  wpis.wykonawca = currentUserDisplayName();
  wpis.godzina = new Date().toISOString();
  if (zadanie.wymagaPH) {
    wpis.phWartosc = phWartosc;
    wpis.phOpis = phOpis;
  }
  await config.saveWpis(wpis);
  showToast('Zapisano potwierdzenie');
  return true;
}

// ===== NOWY MODEL POTWIERDZENIA (legenda statusów + zakres pH + miejsce
// pomiaru) — funkcje WŁASNE dla Harmonogramu codziennego, celowo NIE
// zastępują renderHarmZadanieRow/harmZapiszWpis powyżej, bo tamte są nadal
// używane przez Harmonogram cykliczny (prostszy model — dotyczy go tylko
// codzienny, zgodnie z ustaleniem).

function harmCodzStatusBadge(status) {
  if (!status) return '';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:6px;background:${status.kolor};font-weight:600;font-size:12px;">${escapeHtml(status.kod)}</span>`;
}

function renderHarmCodzZadanieRow(zadanie, wpis) {
  const statusyAktywne = harmCodzState.statusy.filter(s => s.active !== 0);
  const statusOpcje = '<option value="">— wybierz status —</option>' + statusyAktywne.map(s =>
    `<option value="${s.id}" ${wpis && wpis.statusId === s.id ? 'selected' : ''}>${escapeHtml(s.kod)} — ${escapeHtml(s.opis)}</option>`
  ).join('');
  const wybranyStatus = (wpis && wpis.statusId) ? harmCodzState.statusy.find(s => s.id === wpis.statusId) : null;
  const pokazKomentarzStatusu = wybranyStatus && wybranyStatus.wymagaKomentarza;
  const komentarzStatusu = (wpis && wpis.komentarzStatusu) ? wpis.komentarzStatusu : '';

  const phWartosc = (wpis && wpis.phWartosc !== undefined && wpis.phWartosc !== null) ? wpis.phWartosc : '';
  const phMiejsceOpcje = '<option value="">— wybierz miejsce —</option>' + harmCodzState.phMiejsca.map(m =>
    `<option value="${escapeHtml(m)}" ${wpis && wpis.phMiejsce === m ? 'selected' : ''}>${escapeHtml(m)}</option>`
  ).join('');
  const phOpis = (wpis && wpis.phOpis) ? wpis.phOpis : '';
  const { min, max } = harmCodzState.phZakres;
  const pokazOpisPH = zadanie.wymagaPH && phWartosc !== '' && (Number(phWartosc) < min || Number(phWartosc) > max);

  return `
    <div class="checklist-row" data-harmcodz-row="${zadanie.id}" style="flex-wrap:wrap;align-items:flex-start;max-width:none;">
      <div style="flex:1;min-width:220px;">
        <div style="font-weight:600;">${escapeHtml(zadanie.nazwa)}${wybranyStatus ? ' ' + harmCodzStatusBadge(wybranyStatus) : ''}</div>

        <div style="margin-top:8px;">
          <label style="font-size:13px;">Status potwierdzenia:</label>
          <select data-harmcodz-status="${zadanie.id}" style="width:100%;max-width:360px;padding:6px;margin-top:2px;">${statusOpcje}</select>
        </div>
        <div data-harmcodz-komentarz-wrap="${zadanie.id}" style="display:${pokazKomentarzStatusu ? 'block' : 'none'};margin-top:6px;">
          <div class="hint" style="color:#c0392b;margin-bottom:4px;">Ten status wymaga komentarza:</div>
          <textarea data-harmcodz-komentarz="${zadanie.id}" rows="2" style="width:100%;">${escapeHtml(komentarzStatusu)}</textarea>
        </div>

        ${zadanie.wymagaPH ? `
          <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <label style="font-size:13px;">pH:</label>
            <input type="number" step="0.1" data-harmcodz-ph="${zadanie.id}" value="${phWartosc}" style="width:90px;padding:6px;">
            <label style="font-size:13px;">Miejsce pomiaru:</label>
            <select data-harmcodz-ph-miejsce="${zadanie.id}" style="padding:6px;">${phMiejsceOpcje}</select>
          </div>
          <div class="hint" style="margin-top:4px;">Akceptowalny zakres: ${min}–${max}</div>
          <div data-harmcodz-ph-opis-wrap="${zadanie.id}" style="display:${pokazOpisPH ? 'block' : 'none'};margin-top:6px;">
            <div class="hint" style="color:#c0392b;margin-bottom:4px;">pH poza zakresem ${min}–${max} — opisz, co wdrożono, żeby poprawić wynik:</div>
            <textarea data-harmcodz-ph-opis="${zadanie.id}" rows="2" style="width:100%;">${escapeHtml(phOpis)}</textarea>
          </div>
        ` : ''}

        ${wpis ? `<div class="hint" style="margin-top:6px;">Potwierdził: ${escapeHtml(wpis.wykonawca || '—')} · ${wpis.godzina ? new Date(wpis.godzina).toLocaleString('pl-PL') : ''}</div>` : ''}
      </div>
      <button class="btn ${wpis ? 'secondary' : ''} full-width" data-harmcodz-save="${zadanie.id}" style="margin-top:4px;max-width:160px;">${wpis ? 'Zaktualizuj' : '✅ Potwierdź'}</button>
    </div>
  `;
}

// Nasłuch na zmianę statusu i pola pH — pokazuje/chowa pola komentarza na
// bieżąco, bez przeładowania całej listy. Delegacja na wspólnym kontenerze.
function attachHarmCodzListeners(containerEl) {
  if (!containerEl) return;
  containerEl.addEventListener('change', (e) => {
    const statusSelect = e.target.closest('[data-harmcodz-status]');
    if (statusSelect) {
      const id = statusSelect.dataset.harmcodzStatus;
      const wrap = containerEl.querySelector(`[data-harmcodz-komentarz-wrap="${id}"]`);
      if (!wrap) return;
      const status = harmCodzState.statusy.find(s => s.id === statusSelect.value);
      wrap.style.display = (status && status.wymagaKomentarza) ? 'block' : 'none';
    }
  });
  containerEl.addEventListener('input', (e) => {
    const phInput = e.target.closest('[data-harmcodz-ph]');
    if (!phInput) return;
    const id = phInput.dataset.harmcodzPh;
    const wrap = containerEl.querySelector(`[data-harmcodz-ph-opis-wrap="${id}"]`);
    if (!wrap) return;
    const val = phInput.value;
    const { min, max } = harmCodzState.phZakres;
    wrap.style.display = (val !== '' && (Number(val) < min || Number(val) > max)) ? 'block' : 'none';
  });
}

// Zapisuje potwierdzenie: status jest zawsze wymagany; komentarz statusu
// wymagany jeśli wybrany status tego żąda; pomiar pH (wartość+miejsce)
// wymagany jeśli zadanie tego wymaga; opis korekty wymagany jeśli pH poza
// skonfigurowanym zakresem — blokuje zapis, zgodnie z ustaleniem.
async function harmCodzZapiszWpis(zadanie, data, containerEl) {
  const statusSelect = containerEl.querySelector(`[data-harmcodz-status="${zadanie.id}"]`);
  const statusId = statusSelect ? statusSelect.value : '';
  if (!statusId) { showToast('Wybierz status potwierdzenia'); return false; }
  const status = harmCodzState.statusy.find(s => s.id === statusId);

  const komentarzInput = containerEl.querySelector(`[data-harmcodz-komentarz="${zadanie.id}"]`);
  const komentarzStatusu = komentarzInput ? komentarzInput.value.trim() : '';
  if (status && status.wymagaKomentarza && !komentarzStatusu) {
    showToast(`Status ${status.kod} wymaga komentarza`);
    return false;
  }

  let phWartosc = null, phMiejsce = '', phOpis = '';
  if (zadanie.wymagaPH) {
    const phInput = containerEl.querySelector(`[data-harmcodz-ph="${zadanie.id}"]`);
    const phMiejsceSelect = containerEl.querySelector(`[data-harmcodz-ph-miejsce="${zadanie.id}"]`);
    const phOpisInput = containerEl.querySelector(`[data-harmcodz-ph-opis="${zadanie.id}"]`);
    phWartosc = (phInput && phInput.value !== '') ? Number(phInput.value) : null;
    phMiejsce = phMiejsceSelect ? phMiejsceSelect.value : '';
    phOpis = phOpisInput ? phOpisInput.value.trim() : '';
    if (phWartosc === null) { showToast('Podaj wynik pomiaru pH'); return false; }
    if (!phMiejsce) { showToast('Wybierz miejsce pomiaru pH'); return false; }
    const { min, max } = harmCodzState.phZakres;
    if ((phWartosc < min || phWartosc > max) && !phOpis) {
      showToast(`pH poza zakresem ${min}–${max} — opisz, co wdrożono, żeby poprawić wynik`);
      return false;
    }
  }

  const istniejacy = harmCodzState.wpisy.find(w => w.zadanieId === zadanie.id && w.data === data);
  const wpis = istniejacy || { zadanieId: zadanie.id, data };
  wpis.statusId = statusId;
  wpis.komentarzStatusu = komentarzStatusu;
  if (zadanie.wymagaPH) {
    wpis.phWartosc = phWartosc;
    wpis.phMiejsce = phMiejsce;
    wpis.phOpis = phOpis;
  }
  wpis.wykonawca = currentUserDisplayName();
  wpis.godzina = new Date().toISOString();
  await DB.saveHarmCodzWpis(wpis);
  if (!harmCodzState.wpisy.includes(wpis)) harmCodzState.wpisy.push(wpis);
  showToast('Zapisano potwierdzenie');
  return true;
}

// ===== OBSZARY CRUD =====
function renderHarmCodzObszaryList() {
  const container = document.getElementById('harmCodzObszaryList');
  if (!container) return;
  const aktywne = harmCodzState.obszary.filter(o => o.active !== 0);
  if (!aktywne.length) {
    container.innerHTML = '<div class="hint">Brak obszarów — dodaj pierwszy poniżej.</div>';
    return;
  }
  container.innerHTML = aktywne.map(o => `
    <div class="picked-items-row">
      <span>${escapeHtml(o.nazwa)}</span>
      <div class="row" style="gap:6px;">
        <button class="icon-btn" data-edit-harmcodz-obszar="${o.id}">✏️</button>
        <button class="icon-btn" data-del-harmcodz-obszar="${o.id}">🗑️</button>
      </div>
    </div>
  `).join('');
}

function fillHarmCodzObszarSelect() {
  const sel = document.getElementById('harmCodzNewZadanieObszar');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = harmCodzState.obszary.filter(o => o.active !== 0).map(o => `<option value="${o.id}">${escapeHtml(o.nazwa)}</option>`).join('');
  if (current) sel.value = current;
}

document.getElementById('harmCodzAddObszarBtn') && document.getElementById('harmCodzAddObszarBtn').addEventListener('click', async () => {
  const input = document.getElementById('harmCodzNewObszarNazwa');
  const nazwa = input.value.trim();
  if (!nazwa) { showToast('Podaj nazwę obszaru'); return; }
  if (harmCodzState.editingObszarId) {
    const o = harmCodzState.obszary.find(x => x.id === harmCodzState.editingObszarId);
    if (o) { o.nazwa = nazwa; await DB.saveHarmCodzObszar(o); }
    harmCodzState.editingObszarId = null;
    document.getElementById('harmCodzAddObszarBtn').textContent = 'Dodaj obszar';
    document.getElementById('harmCodzCancelObszarEditBtn').style.display = 'none';
  } else {
    const o = { nazwa, active: 1 };
    await DB.saveHarmCodzObszar(o);
    harmCodzState.obszary.push(o);
  }
  input.value = '';
  renderHarmCodzObszaryList();
  fillHarmCodzObszarSelect();
  showToast('Zapisano');
});

document.getElementById('harmCodzCancelObszarEditBtn') && document.getElementById('harmCodzCancelObszarEditBtn').addEventListener('click', () => {
  harmCodzState.editingObszarId = null;
  document.getElementById('harmCodzNewObszarNazwa').value = '';
  document.getElementById('harmCodzAddObszarBtn').textContent = 'Dodaj obszar';
  document.getElementById('harmCodzCancelObszarEditBtn').style.display = 'none';
});

document.getElementById('harmCodzObszaryList') && document.getElementById('harmCodzObszaryList').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('[data-edit-harmcodz-obszar]');
  const delBtn = e.target.closest('[data-del-harmcodz-obszar]');
  if (editBtn) {
    const id = editBtn.dataset.editHarmcodzObszar;
    const o = harmCodzState.obszary.find(x => x.id === id);
    if (!o) return;
    harmCodzState.editingObszarId = id;
    document.getElementById('harmCodzNewObszarNazwa').value = o.nazwa;
    document.getElementById('harmCodzAddObszarBtn').textContent = 'Zapisz zmiany';
    document.getElementById('harmCodzCancelObszarEditBtn').style.display = 'inline-block';
  } else if (delBtn) {
    const id = delBtn.dataset.delHarmcodzObszar;
    const zadaniaWObszarze = harmCodzState.zadania.filter(z => z.obszarId === id && z.active !== 0);
    if (zadaniaWObszarze.length) {
      if (!confirm(`Ten obszar ma ${zadaniaWObszarze.length} przypisanych zadań. Same zadania nie zostaną usunięte, ale stracą widoczny obszar. Kontynuować?`)) return;
    }
    const o = harmCodzState.obszary.find(x => x.id === id);
    if (o) { o.active = 0; await DB.saveHarmCodzObszar(o); }
    renderHarmCodzObszaryList();
    fillHarmCodzObszarSelect();
    renderHarmCodzDzien();
  }
});

// ===== ZADANIA CRUD =====
function renderHarmCodzZadaniaList() {
  const container = document.getElementById('harmCodzZadaniaList');
  if (!container) return;
  const aktywne = harmCodzState.zadania.filter(z => z.active !== 0);
  if (!aktywne.length) {
    container.innerHTML = '<div class="hint">Brak zadań — dodaj pierwsze poniżej.</div>';
    return;
  }
  container.innerHTML = aktywne.map(z => {
    const obszar = harmCodzState.obszary.find(o => o.id === z.obszarId);
    return `
    <div class="picked-items-row">
      <span>${escapeHtml(obszar ? obszar.nazwa : '(brak obszaru)')} — ${escapeHtml(z.nazwa)}${z.wymagaPH ? ' <span class="badge">pH</span>' : ''}</span>
      <div class="row" style="gap:6px;">
        <button class="icon-btn" data-edit-harmcodz-zadanie="${z.id}">✏️</button>
        <button class="icon-btn" data-del-harmcodz-zadanie="${z.id}">🗑️</button>
      </div>
    </div>
  `;
  }).join('');
}

document.getElementById('harmCodzAddZadanieBtn') && document.getElementById('harmCodzAddZadanieBtn').addEventListener('click', async () => {
  const obszarId = document.getElementById('harmCodzNewZadanieObszar').value;
  const nazwaInput = document.getElementById('harmCodzNewZadanieNazwa');
  const nazwa = nazwaInput.value.trim();
  const wymagaPH = document.getElementById('harmCodzNewZadanieWymagaPH').checked;
  if (!obszarId) { showToast('Najpierw dodaj obszar'); return; }
  if (!nazwa) { showToast('Podaj nazwę zadania'); return; }
  if (harmCodzState.editingZadanieId) {
    const z = harmCodzState.zadania.find(x => x.id === harmCodzState.editingZadanieId);
    if (z) { z.obszarId = obszarId; z.nazwa = nazwa; z.wymagaPH = wymagaPH; await DB.saveHarmCodzZadanie(z); }
    harmCodzState.editingZadanieId = null;
    document.getElementById('harmCodzAddZadanieBtn').textContent = 'Dodaj zadanie';
    document.getElementById('harmCodzCancelZadanieEditBtn').style.display = 'none';
  } else {
    const z = { obszarId, nazwa, wymagaPH, active: 1 };
    await DB.saveHarmCodzZadanie(z);
    harmCodzState.zadania.push(z);
  }
  nazwaInput.value = '';
  document.getElementById('harmCodzNewZadanieWymagaPH').checked = false;
  renderHarmCodzZadaniaList();
  renderHarmCodzDzien();
  showToast('Zapisano');
});

document.getElementById('harmCodzCancelZadanieEditBtn') && document.getElementById('harmCodzCancelZadanieEditBtn').addEventListener('click', () => {
  harmCodzState.editingZadanieId = null;
  document.getElementById('harmCodzNewZadanieNazwa').value = '';
  document.getElementById('harmCodzNewZadanieWymagaPH').checked = false;
  document.getElementById('harmCodzAddZadanieBtn').textContent = 'Dodaj zadanie';
  document.getElementById('harmCodzCancelZadanieEditBtn').style.display = 'none';
});

document.getElementById('harmCodzZadaniaList') && document.getElementById('harmCodzZadaniaList').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('[data-edit-harmcodz-zadanie]');
  const delBtn = e.target.closest('[data-del-harmcodz-zadanie]');
  if (editBtn) {
    const id = editBtn.dataset.editHarmcodzZadanie;
    const z = harmCodzState.zadania.find(x => x.id === id);
    if (!z) return;
    harmCodzState.editingZadanieId = id;
    document.getElementById('harmCodzNewZadanieObszar').value = z.obszarId;
    document.getElementById('harmCodzNewZadanieNazwa').value = z.nazwa;
    document.getElementById('harmCodzNewZadanieWymagaPH').checked = !!z.wymagaPH;
    document.getElementById('harmCodzAddZadanieBtn').textContent = 'Zapisz zmiany';
    document.getElementById('harmCodzCancelZadanieEditBtn').style.display = 'inline-block';
  } else if (delBtn) {
    const id = delBtn.dataset.delHarmcodzZadanie;
    if (!confirm('Usunąć to zadanie? Historia wcześniejszych potwierdzeń zostanie zachowana.')) return;
    const z = harmCodzState.zadania.find(x => x.id === id);
    if (z) { z.active = 0; await DB.saveHarmCodzZadanie(z); }
    renderHarmCodzZadaniaList();
    renderHarmCodzDzien();
  }
});

// ===== WIDOK "DZIŚ" =====
function renderHarmCodzDzien() {
  const container = document.getElementById('harmCodzDzienList');
  const empty = document.getElementById('harmCodzDzienEmpty');
  if (!container) return;
  const dateInput = document.getElementById('harmCodzDzienData');
  const data = (dateInput && dateInput.value) || todayStr();

  const zadania = harmCodzState.zadania.filter(z => z.active !== 0);
  if (!zadania.length) {
    container.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  const obszary = harmCodzState.obszary.filter(o => o.active !== 0);
  const html = obszary.map(obszar => {
    const zadaniaObszaru = zadania.filter(z => z.obszarId === obszar.id);
    if (!zadaniaObszaru.length) return '';
    const wiersze = zadaniaObszaru.map(z => {
      const wpis = harmCodzState.wpisy.find(w => w.zadanieId === z.id && w.data === data);
      return renderHarmCodzZadanieRow(z, wpis);
    }).join('');
    return `<div class="card"><h3 style="margin-bottom:8px;">${escapeHtml(obszar.nazwa)}</h3>${wiersze}</div>`;
  }).join('');
  container.innerHTML = html || '<div class="hint">Wszystkie zadania są w obszarach, które nie mają jeszcze nazwy — sprawdź zakładkę "Obszary".</div>';
  attachHarmCodzListeners(container);
}

document.getElementById('harmCodzDzienData') && document.getElementById('harmCodzDzienData').addEventListener('change', renderHarmCodzDzien);

document.getElementById('harmCodzDzienList') && document.getElementById('harmCodzDzienList').addEventListener('click', async (e) => {
  const saveBtn = e.target.closest('[data-harmcodz-save]');
  if (!saveBtn) return;
  const zadanieId = saveBtn.dataset.harmcodzSave;
  const zadanie = harmCodzState.zadania.find(z => z.id === zadanieId);
  if (!zadanie) return;
  const dateInput = document.getElementById('harmCodzDzienData');
  const data = (dateInput && dateInput.value) || todayStr();
  const ok = await harmCodzZapiszWpis(zadanie, data, document.getElementById('harmCodzDzienList'));
  if (ok) renderHarmCodzDzien();
});

// ===== HISTORIA =====
function renderHarmCodzHistoria() {
  const container = document.getElementById('harmCodzHistoriaList');
  if (!container) return;
  const od = document.getElementById('harmCodzHistOd').value;
  const doD = document.getElementById('harmCodzHistDo').value;
  let wpisy = [...harmCodzState.wpisy].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  if (od) wpisy = wpisy.filter(w => (w.data || '') >= od);
  if (doD) wpisy = wpisy.filter(w => (w.data || '') <= doD);
  if (!wpisy.length) {
    container.innerHTML = '<div class="hint">Brak potwierdzeń w wybranym okresie.</div>';
    return;
  }
  container.innerHTML = wpisy.map(w => {
    const zadanie = harmCodzState.zadania.find(z => z.id === w.zadanieId);
    const obszar = zadanie ? harmCodzState.obszary.find(o => o.id === zadanie.obszarId) : null;
    const status = w.statusId ? harmCodzState.statusy.find(s => s.id === w.statusId) : null;
    const { min, max } = harmCodzState.phZakres;
    const phPozaZakresem = zadanie && zadanie.wymagaPH && w.phWartosc !== undefined && w.phWartosc !== null && (Number(w.phWartosc) < min || Number(w.phWartosc) > max);
    const phInfo = (zadanie && zadanie.wymagaPH && w.phWartosc !== undefined && w.phWartosc !== null)
      ? `pH: ${w.phWartosc} (${escapeHtml(w.phMiejsce || '?')})${phPozaZakresem ? ` — ${escapeHtml(w.phOpis || '')}` : ''}`
      : '';
    return `
      <div class="card" style="padding:12px 14px;margin-bottom:8px;">
        <div style="font-weight:600;">${escapeHtml(w.data)} — ${escapeHtml(obszar ? obszar.nazwa : '?')} — ${escapeHtml(zadanie ? zadanie.nazwa : '(usunięte zadanie)')} ${status ? harmCodzStatusBadge(status) : ''}</div>
        <div class="hint" style="margin-top:4px;">Potwierdził: ${escapeHtml(w.wykonawca || '—')}${phInfo ? ' · ' + phInfo : ''}</div>
        ${w.komentarzStatusu ? `<div class="hint" style="margin-top:4px;">Komentarz: ${escapeHtml(w.komentarzStatusu)}</div>` : ''}
      </div>
    `;
  }).join('');
}

document.getElementById('harmCodzHistFilterBtn') && document.getElementById('harmCodzHistFilterBtn').addEventListener('click', renderHarmCodzHistoria);

// ===== USTAWIENIA: LEGENDA STATUSÓW =====
function renderHarmCodzStatusyList() {
  const container = document.getElementById('harmCodzStatusyList');
  if (!container) return;
  const aktywne = harmCodzState.statusy.filter(s => s.active !== 0);
  if (!aktywne.length) {
    container.innerHTML = '<div class="hint">Brak statusów — dodaj pierwszy poniżej.</div>';
    return;
  }
  container.innerHTML = aktywne.map(s => `
    <div class="picked-items-row">
      <span>${harmCodzStatusBadge(s)} ${escapeHtml(s.opis)}${s.wymagaKomentarza ? ' <span class="badge">wymaga komentarza</span>' : ''}</span>
      <div class="row" style="gap:6px;">
        <button class="icon-btn" data-edit-harmcodz-status="${s.id}">✏️</button>
        <button class="icon-btn" data-del-harmcodz-status="${s.id}">🗑️</button>
      </div>
    </div>
  `).join('');
}

document.getElementById('harmCodzAddStatusBtn') && document.getElementById('harmCodzAddStatusBtn').addEventListener('click', async () => {
  const kodInput = document.getElementById('harmCodzNewStatusKod');
  const opisInput = document.getElementById('harmCodzNewStatusOpis');
  const kolorInput = document.getElementById('harmCodzNewStatusKolor');
  const wymagaInput = document.getElementById('harmCodzNewStatusWymagaKomentarza');
  const kod = kodInput.value.trim();
  const opis = opisInput.value.trim();
  const kolor = kolorInput.value;
  const wymagaKomentarza = wymagaInput.checked;
  if (!kod) { showToast('Podaj kod statusu (np. PZ)'); return; }
  if (!opis) { showToast('Podaj opis statusu'); return; }
  if (harmCodzState.editingStatusId) {
    const s = harmCodzState.statusy.find(x => x.id === harmCodzState.editingStatusId);
    if (s) { s.kod = kod; s.opis = opis; s.kolor = kolor; s.wymagaKomentarza = wymagaKomentarza; await DB.saveHarmCodzStatus(s); }
    harmCodzState.editingStatusId = null;
    document.getElementById('harmCodzAddStatusBtn').textContent = 'Dodaj status';
    document.getElementById('harmCodzCancelStatusEditBtn').style.display = 'none';
  } else {
    const s = { kod, opis, kolor, wymagaKomentarza, active: 1 };
    await DB.saveHarmCodzStatus(s);
    harmCodzState.statusy.push(s);
  }
  kodInput.value = '';
  opisInput.value = '';
  kolorInput.value = '#c9d94f';
  wymagaInput.checked = false;
  renderHarmCodzStatusyList();
  renderHarmCodzDzien();
  showToast('Zapisano');
});

document.getElementById('harmCodzCancelStatusEditBtn') && document.getElementById('harmCodzCancelStatusEditBtn').addEventListener('click', () => {
  harmCodzState.editingStatusId = null;
  document.getElementById('harmCodzNewStatusKod').value = '';
  document.getElementById('harmCodzNewStatusOpis').value = '';
  document.getElementById('harmCodzNewStatusWymagaKomentarza').checked = false;
  document.getElementById('harmCodzAddStatusBtn').textContent = 'Dodaj status';
  document.getElementById('harmCodzCancelStatusEditBtn').style.display = 'none';
});

document.getElementById('harmCodzStatusyList') && document.getElementById('harmCodzStatusyList').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('[data-edit-harmcodz-status]');
  const delBtn = e.target.closest('[data-del-harmcodz-status]');
  if (editBtn) {
    const id = editBtn.dataset.editHarmcodzStatus;
    const s = harmCodzState.statusy.find(x => x.id === id);
    if (!s) return;
    harmCodzState.editingStatusId = id;
    document.getElementById('harmCodzNewStatusKod').value = s.kod;
    document.getElementById('harmCodzNewStatusOpis').value = s.opis;
    document.getElementById('harmCodzNewStatusKolor').value = s.kolor;
    document.getElementById('harmCodzNewStatusWymagaKomentarza').checked = !!s.wymagaKomentarza;
    document.getElementById('harmCodzAddStatusBtn').textContent = 'Zapisz zmiany';
    document.getElementById('harmCodzCancelStatusEditBtn').style.display = 'inline-block';
  } else if (delBtn) {
    const id = delBtn.dataset.delHarmcodzStatus;
    if (!confirm('Usunąć ten status? Wcześniejsze potwierdzenia z tym statusem zachowają historię.')) return;
    const s = harmCodzState.statusy.find(x => x.id === id);
    if (s) { s.active = 0; await DB.saveHarmCodzStatus(s); }
    renderHarmCodzStatusyList();
    renderHarmCodzDzien();
  }
});

// ===== USTAWIENIA: MIEJSCA POMIARU PH =====
function renderHarmCodzPHMiejscaList() {
  const container = document.getElementById('harmCodzPHMiejscaList');
  if (!container) return;
  if (!harmCodzState.phMiejsca.length) {
    container.innerHTML = '<div class="hint">Brak miejsc — dodaj pierwsze poniżej.</div>';
    return;
  }
  container.innerHTML = harmCodzState.phMiejsca.map((m, idx) => `
    <div class="picked-items-row">
      <span>${escapeHtml(m)}</span>
      <button class="icon-btn" data-del-harmcodz-ph-miejsce="${idx}">🗑️</button>
    </div>
  `).join('');
}

document.getElementById('harmCodzAddPHMiejsceBtn') && document.getElementById('harmCodzAddPHMiejsceBtn').addEventListener('click', async () => {
  const input = document.getElementById('harmCodzNewPHMiejsce');
  const nazwa = input.value.trim();
  if (!nazwa) { showToast('Podaj nazwę miejsca'); return; }
  if (harmCodzState.phMiejsca.includes(nazwa)) { showToast('To miejsce już jest na liście'); return; }
  harmCodzState.phMiejsca.push(nazwa);
  await DB.setSetting('harmCodzPHMiejsca', harmCodzState.phMiejsca);
  input.value = '';
  renderHarmCodzPHMiejscaList();
  showToast('Zapisano');
});

document.getElementById('harmCodzPHMiejscaList') && document.getElementById('harmCodzPHMiejscaList').addEventListener('click', async (e) => {
  const delBtn = e.target.closest('[data-del-harmcodz-ph-miejsce]');
  if (!delBtn) return;
  const idx = Number(delBtn.dataset.delHarmcodzPhMiejsce);
  harmCodzState.phMiejsca.splice(idx, 1);
  await DB.setSetting('harmCodzPHMiejsca', harmCodzState.phMiejsca);
  renderHarmCodzPHMiejscaList();
});

// ===== USTAWIENIA: ZAKRES PH =====
function renderHarmCodzPHZakresForm() {
  const minInput = document.getElementById('harmCodzPHZakresMin');
  const maxInput = document.getElementById('harmCodzPHZakresMax');
  if (minInput) minInput.value = harmCodzState.phZakres.min;
  if (maxInput) maxInput.value = harmCodzState.phZakres.max;
}

document.getElementById('harmCodzSavePHZakresBtn') && document.getElementById('harmCodzSavePHZakresBtn').addEventListener('click', async () => {
  const min = Number(document.getElementById('harmCodzPHZakresMin').value);
  const max = Number(document.getElementById('harmCodzPHZakresMax').value);
  if (isNaN(min) || isNaN(max) || min >= max) { showToast('Podaj poprawny zakres (min musi być mniejsze niż max)'); return; }
  harmCodzState.phZakres = { min, max };
  await DB.setSetting('harmCodzPHZakres', harmCodzState.phZakres);
  showToast('Zapisano zakres pH');
  renderHarmCodzDzien();
});

// Wywoływana przez switchTab/odswiez przy wejściu w zakładkę "Ustawienia" —
// odświeża wszystkie trzy sekcje naraz (legenda, miejsca pH, zakres pH).
function renderHarmCodzUstawienia() {
  renderHarmCodzStatusyList();
  renderHarmCodzPHMiejscaList();
  renderHarmCodzPHZakresForm();
}
