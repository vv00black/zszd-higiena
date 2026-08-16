// ===== ZUŻYCIE TOWARÓW (zakładka w module Magazyn) =====
// Zużycie zapisuje się jako WYDANIE magazynowe (store 'magIssues'), więc stany
// magazynowe zawsze się zgadzają. Wpisy zużycia mają dodatkowo: powód, brygadzistę
// (autora) i znacznik zrodlo:'zuzycie', po którym je rozpoznajemy.

const zuzState = {
  reasons: [],
  dodatkoweOsoby: [],
  editingEntryId: null,
  selectedProductId: null,
  filterFrom: '',
  filterTo: '',
  filterProduct: '',
  filterReason: '',
  filterAuthor: ''
};

// Domyślne powody — używane przy pierwszym uruchomieniu
const ZUZ_DEFAULT_REASONS = [
  'Mycie bieżące',
  'Mycie okresowe',
  'Dezynfekcja',
  'Rozlanie / strata',
  'Uzupełnienie dozownika',
  'Inne'
];

// Data w formacie dd.mm.rrrr (w projekcie nie ma wspólnej funkcji do samej daty)
function formatDatePl(d) {
  if (!d) return '';
  const parts = String(d).split('-');
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return d;
}

// ---------- SŁOWNIK POWODÓW ----------
async function zuzLoadReasons() {
  const saved = await DB.getSetting('zuzycieReasons', null);
  zuzState.reasons = Array.isArray(saved) && saved.length ? saved : ZUZ_DEFAULT_REASONS.slice();
  if (!saved) await DB.setSetting('zuzycieReasons', zuzState.reasons);
  return zuzState.reasons;
}

async function zuzSaveReasons() {
  await DB.setSetting('zuzycieReasons', zuzState.reasons);
}

// ---------- DODATKOWE OSOBY (poza listą brygadzistów z Obecności) ----------
async function zuzLoadDodatkoweOsoby() {
  const saved = await DB.getSetting('zuzycieDodatkoweOsoby', null);
  zuzState.dodatkoweOsoby = Array.isArray(saved) ? saved : [];
  return zuzState.dodatkoweOsoby;
}
async function zuzSaveDodatkoweOsoby() {
  await DB.setSetting('zuzycieDodatkoweOsoby', zuzState.dodatkoweOsoby);
}

// ---------- WYKRYWANIE PODOBNYCH PRODUKTÓW ----------
// Chroni przed dublowaniem katalogu: literówki ("Iodex" / "Jodex") oraz ta sama
// nazwa z inną pojemnością ("Preparat X 5l" / "Preparat X 10l").

function zuzNormalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[ąàáâä]/g, 'a').replace(/[ćç]/g, 'c').replace(/[ęèéêë]/g, 'e')
    .replace(/[łl]/g, 'l').replace(/[ńñ]/g, 'n').replace(/[óòôö]/g, 'o')
    .replace(/[śş]/g, 's').replace(/[żź]/g, 'z')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function zuzLevenshtein(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

// Zwraca listę podobnych produktów z katalogu magazynu
function zuzFindSimilarProducts(nazwa, wielkoscOpak, excludeId) {
  const target = zuzNormalizeName(nazwa);
  if (!target) return [];
  const out = [];
  for (const p of (magState.products || [])) {
    if (excludeId && p.id === excludeId) continue;
    const cand = zuzNormalizeName(p.nazwa);
    if (!cand) continue;

    // Ta sama nazwa, inna wielkość opakowania
    if (cand === target) {
      const sameSize = String(p.wielkoscOpak || '').trim().toLowerCase()
                    === String(wielkoscOpak || '').trim().toLowerCase();
      out.push({ product: p, powod: sameSize ? 'identyczny' : 'ta sama nazwa, inna wielkość opakowania' });
      continue;
    }
    // Literówka — odległość edycyjna zależna od długości nazwy
    const dist = zuzLevenshtein(target, cand);
    const limit = target.length <= 6 ? 1 : (target.length <= 12 ? 2 : 3);
    if (dist <= limit) {
      out.push({ product: p, powod: 'bardzo podobna nazwa (możliwa literówka)' });
    }
  }
  return out;
}

// ---------- INICJALIZACJA ----------
async function initZuzycie() {
  await zuzLoadReasons();
  await zuzLoadDodatkoweOsoby();
  zuzFillReasonSelect();
  zuzFillProductSelect();
  zuzFillAuthorSelect();
  fillFilterProductSelect(document.getElementById('zuzRaportProdukt'));
  const dateInput = document.getElementById('zuzData');
  if (dateInput && !dateInput.value) dateInput.value = todayStr();
  renderZuzycieList();
  renderZuzTodayList();
}

function zuzFillReasonSelect() {
  const sel = document.getElementById('zuzPowod');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— wybierz powód —</option>' +
    zuzState.reasons.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
  if (current && zuzState.reasons.includes(current)) sel.value = current;

  const filterSel = document.getElementById('zuzFilterPowod');
  if (filterSel) {
    const cur = filterSel.value;
    filterSel.innerHTML = '<option value="">Wszystkie powody</option>' +
      zuzState.reasons.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
    filterSel.value = cur;
  }
}

function zuzFillProductSelect() {
  const sel = document.getElementById('zuzProdukt');
  if (!sel) return;
  const current = sel.value;
  const prods = (magState.products || []).slice()
    .sort((a, b) => (a.nazwa || '').localeCompare(b.nazwa || '', 'pl'));
  sel.innerHTML = '<option value="">— wybierz towar —</option>' +
    prods.map(p => {
      const opis = [p.nazwa, p.wielkoscOpak ? `(${p.wielkoscOpak})` : ''].filter(Boolean).join(' ');
      return `<option value="${p.id}">${escapeHtml(opis)}</option>`;
    }).join('');
  if (current) sel.value = current;

  const filterSel = document.getElementById('zuzFilterProdukt');
  if (filterSel) {
    const cur = filterSel.value;
    filterSel.innerHTML = '<option value="">Wszystkie towary</option>' +
      prods.map(p => {
        const opis = [p.nazwa, p.wielkoscOpak ? `(${p.wielkoscOpak})` : ''].filter(Boolean).join(' ');
        return `<option value="${p.id}">${escapeHtml(opis)}</option>`;
      }).join('');
    filterSel.value = cur;
  }
}

// Autor wpisu — brygadziści z modułu Obecność
function zuzFillAuthorSelect() {
  const sel = document.getElementById('zuzBrygadzista');
  if (!sel) return;
  const current = sel.value;
  const zBrygadzistow = (typeof obsState !== 'undefined' && obsState.brygadzisciList) ? obsState.brygadzisciList : [];
  const imionaBrygadzistow = zBrygadzistow.map(b => `${b.imie || ''} ${b.nazwisko || ''}`.trim()).filter(Boolean);
  // Dodatkowe osoby (dopisane ręcznie przez "Zarządzaj osobami") — scalone z
  // brygadzistami z Obecności i posortowane razem, bez duplikatów.
  const wszyscy = [...new Set([...imionaBrygadzistow, ...zuzState.dodatkoweOsoby])].sort((a, b) => a.localeCompare(b, 'pl'));
  sel.innerHTML = '<option value="">— wybierz osobę —</option>' +
    wszyscy.map(imie => `<option value="${escapeHtml(imie)}">${escapeHtml(imie)}</option>`).join('');
  // Jeśli zalogowany jest brygadzistą — podstaw jego dane
  if (!current && currentUser && currentUser.brygadzistaEntryId) {
    const me = zBrygadzistow.find(b => b.id === currentUser.brygadzistaEntryId);
    if (me) sel.value = `${me.imie || ''} ${me.nazwisko || ''}`.trim();
  } else if (current) {
    sel.value = current;
  }

  const filterSel = document.getElementById('zuzFilterAutor');
  if (filterSel) {
    const cur = filterSel.value;
    const autorzy = [...new Set((magState.issues || [])
      .filter(i => i.zrodlo === 'zuzycie' && i.wydal)
      .map(i => i.wydal))].sort((a, b) => a.localeCompare(b, 'pl'));
    filterSel.innerHTML = '<option value="">Wszyscy</option>' +
      autorzy.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
    filterSel.value = cur;
  }
}

// ---------- ZAPIS WPISU ZUŻYCIA ----------
function recalcZuzRazem() {
  const productId = document.getElementById('zuzProdukt').value;
  const ilosc = parseFloat(document.getElementById('zuzIlosc').value);
  const razemEl = document.getElementById('zuzRazem');
  if (!razemEl) return;
  if (isNaN(ilosc)) { razemEl.value = ''; return; }
  const p = (magState.products || []).find(x => x.id === productId);
  razemEl.value = magOpakToStored(ilosc, p && p.wielkoscOpak);
}
document.getElementById('zuzIlosc').addEventListener('input', recalcZuzRazem);
document.getElementById('zuzProdukt').addEventListener('change', recalcZuzRazem);
document.getElementById('zuzAddProductBtn').addEventListener('click', () => {
  magOpenQuickAddProduct('', (product) => {
    zuzFillProductSelect();
    document.getElementById('zuzProdukt').value = product.id;
    recalcZuzRazem();
  });
});

async function zuzSaveEntry() {
  const productId = document.getElementById('zuzProdukt').value;
  const ilosc = parseFloat(document.getElementById('zuzIlosc').value);
  const powod = document.getElementById('zuzPowod').value;
  const wydal = document.getElementById('zuzBrygadzista').value.trim();
  const data = document.getElementById('zuzData').value || todayStr();
  const uwagi = document.getElementById('zuzUwagi').value.trim();

  if (!productId) { showToast('Wybierz towar'); return; }
  if (isNaN(ilosc) || ilosc <= 0) { showToast('Podaj poprawną ilość'); return; }
  if (!powod) { showToast('Wybierz powód zużycia'); return; }

  const p = (magState.products || []).find(x => x.id === productId);
  const razem = magOpakToStored(ilosc, p && p.wielkoscOpak);

  if (magState.blokadaUjemnych && p) {
    let dostepny = computeStock(p).stanBiezacy;
    if (zuzState.editingEntryId) {
      // Edytowany wpis JEST wliczony w computeStock() (nadal w magState.issues)
      // — doliczamy z powrotem starą wartość, żeby sprawdzić limit dla nowej.
      const stary = (magState.issues || []).find(i => i.id === zuzState.editingEntryId);
      if (stary) dostepny += Number(stary.iloscWydana) || 0;
    }
    if (razem > dostepny) {
      showToast(`Za mało na stanie — dostępne: ${dostepny} ${p.jm || ''} (blokada stanów ujemnych jest włączona w Ustawieniach Magazynu)`);
      return;
    }
  }

  if (zuzState.editingEntryId) {
    const issue = (magState.issues || []).find(i => i.id === zuzState.editingEntryId);
    if (issue) {
      issue.data = data;
      issue.productId = productId;
      issue.iloscOpak = ilosc;
      issue.iloscWydana = razem;
      issue.powodZuzycia = powod;
      issue.wydal = wydal;
      issue.uwagi = uwagi;
      await DB.saveMagIssue(issue);
      showToast('Wpis zaktualizowany');
    }
    zuzState.editingEntryId = null;
    document.getElementById('zuzSaveBtn').textContent = '💾 Zapisz zużycie';
    document.getElementById('zuzCancelEditBtn').style.display = 'none';
  } else {
    // Zapisujemy jako wydanie magazynowe — stan magazynu zmniejszy się automatycznie
    const issue = {
      data,
      productId,
      iloscOpak: ilosc,
      iloscWydana: razem,
      dzialCel: 'Dział Higieny',
      wydal,
      uwagi,
      powodZuzycia: powod,
      zrodlo: 'zuzycie'
    };
    await DB.saveMagIssue(issue);
    magState.issues.push(issue);
    showToast('Zużycie zapisane — stan magazynu zaktualizowany');
  }

  document.getElementById('zuzProdukt').value = '';
  document.getElementById('zuzIlosc').value = '';
  document.getElementById('zuzRazem').value = '';
  document.getElementById('zuzUwagi').value = '';
  renderZuzycieList();
  renderZuzTodayList();
  zuzFillAuthorSelect();
  if (typeof renderMagStock === 'function') renderMagStock();
  if (typeof renderMagIssues === 'function') renderMagIssues();
}

// ---------- LISTA WPISÓW ----------
function zuzGetFilteredEntries() {
  let list = (magState.issues || []).filter(i => i.zrodlo === 'zuzycie');
  if (zuzState.filterFrom) list = list.filter(i => (i.data || '') >= zuzState.filterFrom);
  if (zuzState.filterTo) list = list.filter(i => (i.data || '') <= zuzState.filterTo);
  if (zuzState.filterProduct) list = list.filter(i => i.productId === zuzState.filterProduct);
  if (zuzState.filterReason) list = list.filter(i => i.powodZuzycia === zuzState.filterReason);
  if (zuzState.filterAuthor) list = list.filter(i => i.wydal === zuzState.filterAuthor);
  return list.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
}

function zuzProductName(productId) {
  const p = (magState.products || []).find(x => x.id === productId);
  if (!p) return '(usunięty towar)';
  return p.nazwa + (p.wielkoscOpak ? ` (${p.wielkoscOpak})` : '');
}

function zuzProductUnit(productId) {
  const p = (magState.products || []).find(x => x.id === productId);
  return p ? (p.jm || '') : '';
}

function zuzRenderEntryRow(i) {
  return `
    <div class="storage-row" style="margin-bottom:6px;flex-direction:column;align-items:flex-start;gap:3px;">
      <span style="width:100%;">
        <strong>${escapeHtml(zuzProductName(i.productId))}</strong>
        <span style="float:right;font-weight:800;color:var(--accent2);">${i.iloscOpak != null ? i.iloscOpak + ' opak. → ' : ''}${i.iloscWydana} ${escapeHtml(zuzProductUnit(i.productId))}</span>
      </span>
      <span style="font-size:12px;color:var(--text-dim);">
        ${escapeHtml(i.powodZuzycia || '—')}${i.wydal ? ' · ' + escapeHtml(i.wydal) : ''}
      </span>
      ${i.uwagi ? `<span style="font-size:12px;color:var(--text-dim);font-style:italic;">${escapeHtml(i.uwagi)}</span>` : ''}
      <span>
        <button class="btn secondary" data-zuz-edit="${i.id}" style="margin-right:4px;">Edytuj</button>
        <button class="btn danger" data-zuz-del="${i.id}">Usuń</button>
      </span>
    </div>
  `;
}
function zuzWireEntryRowButtons(wrap, afterDelete) {
  wrap.querySelectorAll('[data-zuz-edit]').forEach(btn => {
    btn.addEventListener('click', () => zuzOpenEdit(btn.dataset.zuzEdit));
  });
  wrap.querySelectorAll('[data-zuz-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Usunąć ten wpis zużycia? Stan magazynowy zostanie skorygowany.')) return;
      await DB.deleteMagIssue(btn.dataset.zuzDel);
      magState.issues = magState.issues.filter(i => i.id !== btn.dataset.zuzDel);
      renderZuzycieList();
      renderZuzTodayList();
      if (typeof renderMagStock === 'function') renderMagStock();
      if (typeof renderMagIssues === 'function') renderMagIssues();
      showToast('Wpis usunięty');
      if (afterDelete) afterDelete();
    });
  });
}

// Podgląd wpisów zapisanych na DATĘ WPISANĄ W FORMULARZU (pole "Data") — nie
// koniecznie dzisiejszą kalendarzowo. Dzięki temu, jeśli ktoś uzupełnia zaległe
// zużycie z poprzedniego dnia (zmieniając pole "Data" na wcześniejszą datę),
// ten podgląd pokazuje TĘ datę, a nie faktyczny dzień z zegara systemowego —
// żeby móc na bieżąco sprawdzić i poprawić to, co się właśnie wpisało, bez
// przechodzenia do pełnej Historii. Znikają stąd po kliknięciu "Zamknij dzień"
// (albo — jeśli nikt tego nie kliknie — same przestają pasować do pola "Data"
// z chwilą jego zmiany). W obu przypadkach nadal są w pełni dostępne
// i edytowalne w Historii zużycia.
function zuzRoboczaData() {
  const el = document.getElementById('zuzData');
  return (el && el.value) || todayStr();
}
function renderZuzTodayList() {
  const wrap = document.getElementById('zuzTodayList');
  if (!wrap) return;
  const dataRobocza = zuzRoboczaData();
  const naglowek = document.getElementById('zuzTodayHeading');
  if (naglowek) {
    naglowek.textContent = (dataRobocza === todayStr())
      ? '📋 Dzisiejsze wpisy'
      : `📋 Wpisy z dnia ${formatDatePl(dataRobocza)}`;
  }
  const list = (magState.issues || [])
    .filter(i => i.zrodlo === 'zuzycie' && (i.data || '') === dataRobocza && !i.zamkniety)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (!list.length) {
    wrap.innerHTML = '<div class="hint">Jeszcze nic nie zapisano na tę datę.</div>';
    return;
  }
  wrap.innerHTML = list.map(zuzRenderEntryRow).join('');
  zuzWireEntryRowButtons(wrap);
}
document.getElementById('zuzData') && document.getElementById('zuzData').addEventListener('change', renderZuzTodayList);

// "Zamknij dzień" — jawne przeniesienie wpisów z daty wpisanej w formularzu do
// archiwum (Historii). Wpisy same w sobie się nie zmieniają ani nie znikają
// z bazy — tylko przestają pokazywać się w tym podglądzie, zostając w pełni
// dostępne i edytowalne w Historii zużycia.
document.getElementById('zuzZamknijDzienBtn') && document.getElementById('zuzZamknijDzienBtn').addEventListener('click', async () => {
  const dataRobocza = zuzRoboczaData();
  const otwarte = (magState.issues || []).filter(i => i.zrodlo === 'zuzycie' && (i.data || '') === dataRobocza && !i.zamkniety);
  if (!otwarte.length) { showToast('Brak wpisów z tej daty do zamknięcia'); return; }
  if (!confirm(`Zamknąć dzień ${formatDatePl(dataRobocza)}? ${otwarte.length} ${otwarte.length === 1 ? 'wpis zniknie' : 'wpisów zniknie'} z tego podglądu i będzie dostępnych tylko w Historii zużycia (gdzie nadal można je poprawić).`)) return;

  for (const i of otwarte) {
    i.zamkniety = true;
    await DB.saveMagIssue(i);
  }
  renderZuzTodayList();
  showToast('Dzień zamknięty — wpisy przeniesione do historii');
});

function renderZuzycieList() {
  const wrap = document.getElementById('zuzyciaList');
  if (!wrap) return;
  const list = zuzGetFilteredEntries();

  const sumEl = document.getElementById('zuzSummary');
  if (sumEl) {
    sumEl.textContent = list.length
      ? `Wpisów: ${list.length}`
      : 'Brak wpisów dla wybranych filtrów.';
  }

  if (!list.length) {
    wrap.innerHTML = '<div class="hint">— brak wpisów —</div>';
    return;
  }

  renderGroupedByDate(wrap, list, i => i.data, zuzRenderEntryRow, 'zuzycie');
  zuzWireEntryRowButtons(wrap);
}

function zuzOpenEdit(id) {
  const i = (magState.issues || []).find(x => x.id === id);
  if (!i) return;
  // Formularz jest na osobnym widoku od v88 — bez tego, kliknięcie "Edytuj" z
  // Historii wypełniało pola niewidocznego ekranu i nic nie było widać.
  if (typeof switchView === 'function') switchView('magZuzycie');
  zuzState.editingEntryId = id;
  document.getElementById('zuzProdukt').value = i.productId || '';
  const p = (magState.products || []).find(x => x.id === i.productId);
  document.getElementById('zuzIlosc').value = (i.iloscOpak != null) ? i.iloscOpak : magStoredToOpak(i.iloscWydana, p && p.wielkoscOpak);
  recalcZuzRazem();
  document.getElementById('zuzPowod').value = i.powodZuzycia || '';
  document.getElementById('zuzBrygadzista').value = i.wydal || '';
  document.getElementById('zuzData').value = i.data || todayStr();
  document.getElementById('zuzUwagi').value = i.uwagi || '';
  document.getElementById('zuzSaveBtn').textContent = '💾 Zapisz zmiany';
  document.getElementById('zuzCancelEditBtn').style.display = 'inline-block';
  document.getElementById('zuzProdukt').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function zuzCancelEdit() {
  zuzState.editingEntryId = null;
  document.getElementById('zuzProdukt').value = '';
  document.getElementById('zuzIlosc').value = '';
  document.getElementById('zuzRazem').value = '';
  document.getElementById('zuzUwagi').value = '';
  document.getElementById('zuzSaveBtn').textContent = '💾 Zapisz zużycie';
  document.getElementById('zuzCancelEditBtn').style.display = 'none';
}

// ---------- RAPORTY ----------
function zuzIsoWeekRange(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = (d.getDay() + 6) % 7; // pon=0
  const start = new Date(d); start.setDate(d.getDate() - day);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  // Formatowanie datą lokalną (nie toISOString, które przez konwersję na UTC
  // potrafiło przesunąć obie daty o jeden dzień wstecz w naszej strefie czasowej).
  const fmt = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { from: fmt(start), to: fmt(end) };
}

function zuzMonthRange(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const fmt = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { from: fmt(start), to: fmt(end) };
}

function zuzYearRange(dateStr) {
  const y = new Date(dateStr + 'T00:00:00').getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

function zuzGenerateReport(okres, customRange) {
  const base = document.getElementById('zuzRaportData').value || todayStr();
  let range;
  if (customRange) range = customRange;
  else if (okres === 'dzien') range = { from: base, to: base };
  else if (okres === 'tydzien') range = zuzIsoWeekRange(base);
  else if (okres === 'miesiac') range = zuzMonthRange(base);
  else range = zuzYearRange(base);

  const produktSel = document.getElementById('zuzRaportProdukt');
  const productFilter = produktSel ? produktSel.value : '';

  const list = (magState.issues || []).filter(i =>
    i.zrodlo === 'zuzycie' && (i.data || '') >= range.from && (i.data || '') <= range.to &&
    (!productFilter || i.productId === productFilter)
  );

  // Sumowanie po produkcie
  const byProduct = {};
  for (const i of list) {
    if (!byProduct[i.productId]) byProduct[i.productId] = { ilosc: 0, wpisy: 0 };
    byProduct[i.productId].ilosc += Number(i.iloscWydana) || 0;
    byProduct[i.productId].wpisy++;
  }
  // Sumowanie po powodzie
  const byReason = {};
  for (const i of list) {
    const r = i.powodZuzycia || '(bez powodu)';
    byReason[r] = (byReason[r] || 0) + 1;
  }

  const wrap = document.getElementById('zuzRaportWynik');
  if (!wrap) return;

  const produktLabel = productFilter ? ` · towar: ${zuzProductName(productFilter)}` : '';

  if (!list.length) {
    wrap.innerHTML = `<div class="hint">Brak zużycia w okresie ${formatDatePl(range.from)} – ${formatDatePl(range.to)}${escapeHtml(produktLabel)}.</div>`;
    return;
  }

  const prodRows = Object.keys(byProduct)
    .map(pid => ({ pid, ...byProduct[pid] }))
    .sort((a, b) => b.ilosc - a.ilosc)
    .map(x => `
      <div class="storage-row" style="margin-bottom:4px;">
        <span>${escapeHtml(zuzProductName(x.pid))}<br>
          <span style="font-size:12px;color:var(--text-dim);">${x.wpisy} ${x.wpisy === 1 ? 'wpis' : 'wpisów'}</span>
        </span>
        <strong style="color:var(--accent2);">${x.ilosc.toFixed(2)} ${escapeHtml(zuzProductUnit(x.pid))}</strong>
      </div>`).join('');

  const reasonRows = Object.keys(byReason)
    .sort((a, b) => byReason[b] - byReason[a])
    .map(r => `<div class="storage-row" style="margin-bottom:4px;">
        <span>${escapeHtml(r)}</span><strong>${byReason[r]}</strong>
      </div>`).join('');

  wrap.innerHTML = `
    <div style="font-weight:700;margin-bottom:8px;">
      Okres: ${formatDatePl(range.from)} – ${formatDatePl(range.to)}${escapeHtml(produktLabel)} · wpisów: ${list.length}
    </div>
    <div style="font-size:12px;font-weight:800;color:var(--accent2);text-transform:uppercase;margin:10px 0 6px;">Zużycie wg towaru</div>
    ${prodRows}
    <div style="font-size:12px;font-weight:800;color:var(--accent);text-transform:uppercase;margin:12px 0 6px;">Wpisy wg powodu</div>
    ${reasonRows}
    <button class="btn secondary full-width" id="zuzExportCsvBtn" style="margin-top:12px;">📊 Eksportuj do CSV</button>
  `;

  document.getElementById('zuzExportCsvBtn').addEventListener('click', () => zuzExportCsv(list, range));
}

function zuzExportCsv(list, range) {
  const rows = [['Data', 'Towar', 'Wielkość opak.', 'Ilość (opak.)', 'Ilość razem', 'Jm', 'Powód', 'Osoba', 'Uwagi']];
  for (const i of list.slice().sort((a, b) => (a.data || '').localeCompare(b.data || ''))) {
    const p = (magState.products || []).find(x => x.id === i.productId);
    rows.push([
      i.data || '',
      p ? p.nazwa : '(usunięty)',
      p ? (p.wielkoscOpak || '') : '',
      String(i.iloscOpak ?? '').replace('.', ','),
      String(i.iloscWydana || '').replace('.', ','),
      p ? (p.jm || '') : '',
      i.powodZuzycia || '',
      i.wydal || '',
      (i.uwagi || '').replace(/[\r\n]+/g, ' ')
    ]);
  }
  const csv = '\uFEFF' + rows.map(r =>
    r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')
  ).join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zuzycie-${range.from}_${range.to}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Plik CSV pobrany');
}

// ---------- ZARZĄDZANIE POWODAMI ----------
function renderZuzReasonsList() {
  const wrap = document.getElementById('zuzReasonsList');
  if (!wrap) return;
  if (!zuzState.reasons.length) {
    wrap.innerHTML = '<div class="hint">— brak powodów —</div>';
    return;
  }
  wrap.innerHTML = zuzState.reasons.map((r, idx) => `
    <div class="storage-row" style="margin-bottom:4px;">
      <span>${escapeHtml(r)}</span>
      <button class="btn danger" data-zuz-del-reason="${idx}">Usuń</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-zuz-del-reason]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.zuzDelReason, 10);
      const usuwany = zuzState.reasons[idx];
      const uzywany = (magState.issues || []).some(i => i.zrodlo === 'zuzycie' && i.powodZuzycia === usuwany);
      if (uzywany && !confirm(`Powód "${usuwany}" jest użyty w istniejących wpisach. Usunąć go ze słownika? (wpisy zachowają swój powód)`)) return;
      zuzState.reasons.splice(idx, 1);
      await zuzSaveReasons();
      renderZuzReasonsList();
      zuzFillReasonSelect();
      showToast('Powód usunięty');
    });
  });
}

// ---------- ZARZĄDZANIE DODATKOWYMI OSOBAMI ----------
function renderZuzPeopleList() {
  const wrap = document.getElementById('zuzPeopleList');
  if (!wrap) return;
  if (!zuzState.dodatkoweOsoby.length) {
    wrap.innerHTML = '<div class="hint">— brak dodatkowych osób —</div>';
    return;
  }
  wrap.innerHTML = zuzState.dodatkoweOsoby.map((osoba, idx) => `
    <div class="storage-row" style="margin-bottom:4px;">
      <span>${escapeHtml(osoba)}</span>
      <button class="btn danger" data-zuz-del-osoba="${idx}">Usuń</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-zuz-del-osoba]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.zuzDelOsoba, 10);
      const usuwana = zuzState.dodatkoweOsoby[idx];
      const uzywana = (magState.issues || []).some(i => i.zrodlo === 'zuzycie' && i.wydal === usuwana);
      if (uzywana && !confirm(`Osoba "${usuwana}" jest użyta w istniejących wpisach. Usunąć ją z listy? (wpisy zachowają jej nazwisko)`)) return;
      zuzState.dodatkoweOsoby.splice(idx, 1);
      await zuzSaveDodatkoweOsoby();
      renderZuzPeopleList();
      zuzFillAuthorSelect();
      showToast('Osoba usunięta z listy');
    });
  });
}

// ---------- PODPIĘCIE ZDARZEŃ ----------
document.getElementById('zuzSaveBtn') && document.getElementById('zuzSaveBtn').addEventListener('click', zuzSaveEntry);
document.getElementById('zuzCancelEditBtn') && document.getElementById('zuzCancelEditBtn').addEventListener('click', zuzCancelEdit);

// Filtry historii
['zuzFilterOd', 'zuzFilterDo', 'zuzFilterProdukt', 'zuzFilterPowod', 'zuzFilterAutor'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', () => {
    zuzState.filterFrom = document.getElementById('zuzFilterOd').value;
    zuzState.filterTo = document.getElementById('zuzFilterDo').value;
    zuzState.filterProduct = document.getElementById('zuzFilterProdukt').value;
    zuzState.filterReason = document.getElementById('zuzFilterPowod').value;
    zuzState.filterAuthor = document.getElementById('zuzFilterAutor').value;
    renderZuzycieList();
  });
});

document.getElementById('zuzClearFiltersBtn') && document.getElementById('zuzClearFiltersBtn').addEventListener('click', () => {
  ['zuzFilterOd', 'zuzFilterDo', 'zuzFilterProdukt', 'zuzFilterPowod', 'zuzFilterAutor'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  zuzState.filterFrom = zuzState.filterTo = zuzState.filterProduct = zuzState.filterReason = zuzState.filterAuthor = '';
  renderZuzycieList();
});
document.getElementById('zuzSearchBtn') && document.getElementById('zuzSearchBtn').addEventListener('click', () => {
  zuzState.filterFrom = document.getElementById('zuzFilterOd').value;
  zuzState.filterTo = document.getElementById('zuzFilterDo').value;
  zuzState.filterProduct = document.getElementById('zuzFilterProdukt').value;
  zuzState.filterReason = document.getElementById('zuzFilterPowod').value;
  zuzState.filterAuthor = document.getElementById('zuzFilterAutor').value;
  renderZuzycieList();
});

// Nawigacja: formularz "Zapisz zużycie" (widok domyślny) ↔ Historia / Raporty
// (osobne widoki, żeby rosnąca historia wpisów nie wydłużała strony z formularzem)
document.getElementById('zuzGoHistoriaBtn') && document.getElementById('zuzGoHistoriaBtn').addEventListener('click', () => switchView('zuzHistoria'));
document.getElementById('zuzGoRaportyBtn') && document.getElementById('zuzGoRaportyBtn').addEventListener('click', () => switchView('zuzRaporty'));
document.getElementById('zuzBackFromHistoriaBtn') && document.getElementById('zuzBackFromHistoriaBtn').addEventListener('click', () => switchView('magZuzycie'));
document.getElementById('zuzBackFromRaportyBtn') && document.getElementById('zuzBackFromRaportyBtn').addEventListener('click', () => switchView('magZuzycie'));

// Raporty
document.getElementById('zuzRaportDzienBtn') && document.getElementById('zuzRaportDzienBtn').addEventListener('click', () => zuzGenerateReport('dzien'));
document.getElementById('zuzRaportTydzienBtn') && document.getElementById('zuzRaportTydzienBtn').addEventListener('click', () => zuzGenerateReport('tydzien'));
document.getElementById('zuzRaportMiesiacBtn') && document.getElementById('zuzRaportMiesiacBtn').addEventListener('click', () => zuzGenerateReport('miesiac'));
document.getElementById('zuzRaportRokBtn') && document.getElementById('zuzRaportRokBtn').addEventListener('click', () => zuzGenerateReport('rok'));
document.getElementById('zuzRaportZakresBtn') && document.getElementById('zuzRaportZakresBtn').addEventListener('click', () => {
  const od = document.getElementById('zuzRaportZakresOd').value;
  const doD = document.getElementById('zuzRaportZakresDo').value;
  if (!od || !doD) { showToast('Podaj obie daty zakresu'); return; }
  if (od > doD) { showToast('Data "od" musi być wcześniejsza niż "do"'); return; }
  zuzGenerateReport(null, { from: od, to: doD });
});

// Modal powodów
document.getElementById('zuzManageReasonsBtn') && document.getElementById('zuzManageReasonsBtn').addEventListener('click', () => {
  renderZuzReasonsList();
  document.getElementById('zuzReasonsModalOverlay').classList.add('active');
});
document.getElementById('closeZuzReasonsModal') && document.getElementById('closeZuzReasonsModal').addEventListener('click', () => {
  document.getElementById('zuzReasonsModalOverlay').classList.remove('active');
});
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. (zuzReasonsModalOverlay)
document.getElementById('zuzAddReasonBtn') && document.getElementById('zuzAddReasonBtn').addEventListener('click', async () => {
  const input = document.getElementById('zuzNewReason');
  const val = input.value.trim();
  if (!val) { showToast('Podaj nazwę powodu'); return; }
  if (zuzState.reasons.some(r => r.toLowerCase() === val.toLowerCase())) {
    showToast('Taki powód już istnieje');
    return;
  }
  zuzState.reasons.push(val);
  await zuzSaveReasons();
  input.value = '';
  renderZuzReasonsList();
  zuzFillReasonSelect();
  showToast('Powód dodany');
});

// Modal osób
document.getElementById('zuzManagePeopleBtn') && document.getElementById('zuzManagePeopleBtn').addEventListener('click', () => {
  renderZuzPeopleList();
  document.getElementById('zuzPeopleModalOverlay').classList.add('active');
});
document.getElementById('closeZuzPeopleModal') && document.getElementById('closeZuzPeopleModal').addEventListener('click', () => {
  document.getElementById('zuzPeopleModalOverlay').classList.remove('active');
});
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. (zuzPeopleModalOverlay)
document.getElementById('zuzAddPersonBtn') && document.getElementById('zuzAddPersonBtn').addEventListener('click', async () => {
  const input = document.getElementById('zuzNewPerson');
  const val = input.value.trim();
  if (!val) { showToast('Podaj imię i nazwisko'); return; }
  const zBrygadzistow = (typeof obsState !== 'undefined' && obsState.brygadzisciList) ? obsState.brygadzisciList : [];
  const jestBrygadzista = zBrygadzistow.some(b => `${b.imie || ''} ${b.nazwisko || ''}`.trim().toLowerCase() === val.toLowerCase());
  if (jestBrygadzista) { showToast('Ta osoba jest już na liście brygadzistów'); return; }
  if (zuzState.dodatkoweOsoby.some(o => o.toLowerCase() === val.toLowerCase())) {
    showToast('Ta osoba jest już dodana');
    return;
  }
  zuzState.dodatkoweOsoby.push(val);
  await zuzSaveDodatkoweOsoby();
  input.value = '';
  renderZuzPeopleList();
  zuzFillAuthorSelect();
  document.getElementById('zuzBrygadzista').value = val;
  showToast('Osoba dodana i wybrana');
});

// ===== CENTRALA: ZBIORCZE ZUŻYCIE ZE WSZYSTKICH PACZEK =====
// Scala wpisy zużycia z paczek odebranych od brygadzistów i nadzoru.
// Produkty rozpoznajemy po nazwie z katalogu w danej paczce, bo id-ki
// mogą się różnić między urządzeniami.

async function centralaZbiorczeZuzycie() {
  const od = document.getElementById('centZuzOd').value;
  const doD = document.getElementById('centZuzDo').value;
  const wrap = document.getElementById('centZuzWynik');
  if (!wrap) return;

  const submissions = await DB.getCentralSubmissions();
  if (!submissions.length) {
    wrap.innerHTML = '<div class="hint">Brak odebranych paczek.</div>';
    return;
  }

  // Zbieramy wpisy z każdej paczki, tłumacząc productId na nazwę towaru.
  // DEDUPLIKACJA: ta sama osoba może dziś wysyłać zgłoszenia z KILKU urządzeń
  // (np. telefon + desktop) — każde zgłoszenie to PEŁNA kopia danych tego
  // urządzenia, więc te same, niezmienione wpisy mogą pojawić się w więcej niż
  // jednym zgłoszeniu. Bez tego zabezpieczenia policzylibyśmy je kilka razy.
  // `DB.getCentralSubmissions()` zwraca zgłoszenia od najnowszego — pierwsze
  // napotkane wystąpienie danego ID (czyli z najnowszego zgłoszenia) wygrywa.
  const zebrane = [];
  const nadawcy = new Set();
  const widzianeId = new Set();

  for (const sub of submissions) {
    const stores = (sub.payload && sub.payload.stores) || {};
    const issues = Array.isArray(stores.magIssues) ? stores.magIssues : [];
    const produkty = Array.isArray(stores.magProducts) ? stores.magProducts : [];
    const mapaProduktow = {};
    produkty.forEach(p => { mapaProduktow[p.id] = p; });

    for (const i of issues) {
      if (!i || i.zrodlo !== 'zuzycie') continue;
      if (od && (i.data || '') < od) continue;
      if (doD && (i.data || '') > doD) continue;
      if (i.id) {
        if (widzianeId.has(i.id)) continue; // ten sam wpis już policzony z innego zgłoszenia
        widzianeId.add(i.id);
      }

      const p = mapaProduktow[i.productId];
      const nazwa = p ? p.nazwa : '(towar spoza katalogu)';
      const opak = p && p.wielkoscOpak ? ` (${p.wielkoscOpak})` : '';
      const jm = p ? (p.jm || '') : '';

      zebrane.push({
        klucz: zuzNormalizeName(nazwa) + '|' + jm,
        etykieta: nazwa + opak,
        jm,
        data: i.data || '',
        ilosc: Number(i.iloscWydana) || 0,
        powod: i.powodZuzycia || '(bez powodu)',
        osoba: i.wydal || sub.brygadzistaName || '(nieznany)',
        nadawca: sub.brygadzistaName || '(nieznany)'
      });
      nadawcy.add(sub.brygadzistaName || '(nieznany)');
    }
  }

  if (!zebrane.length) {
    wrap.innerHTML = '<div class="hint">Brak wpisów zużycia w wybranym okresie.</div>';
    return;
  }

  // Sumowanie po towarze
  const poTowarze = {};
  for (const z of zebrane) {
    if (!poTowarze[z.klucz]) poTowarze[z.klucz] = { etykieta: z.etykieta, jm: z.jm, ilosc: 0, wpisy: 0 };
    poTowarze[z.klucz].ilosc += z.ilosc;
    poTowarze[z.klucz].wpisy++;
  }
  // Sumowanie po osobie
  const poOsobie = {};
  for (const z of zebrane) {
    poOsobie[z.osoba] = (poOsobie[z.osoba] || 0) + 1;
  }
  // Sumowanie po powodzie
  const poPowodzie = {};
  for (const z of zebrane) {
    poPowodzie[z.powod] = (poPowodzie[z.powod] || 0) + 1;
  }

  const wierszeTowary = Object.values(poTowarze)
    .sort((a, b) => b.ilosc - a.ilosc)
    .map(x => `
      <div class="storage-row" style="margin-bottom:4px;">
        <span>${escapeHtml(x.etykieta)}<br>
          <span style="font-size:12px;color:var(--text-dim);">${x.wpisy} ${x.wpisy === 1 ? 'wpis' : 'wpisów'}</span>
        </span>
        <strong style="color:var(--accent2);">${x.ilosc.toFixed(2)} ${escapeHtml(x.jm)}</strong>
      </div>`).join('');

  const wierszeOsoby = Object.keys(poOsobie)
    .sort((a, b) => poOsobie[b] - poOsobie[a])
    .map(o => `<div class="storage-row" style="margin-bottom:4px;">
        <span>${escapeHtml(o)}</span><strong>${poOsobie[o]}</strong>
      </div>`).join('');

  const wierszePowody = Object.keys(poPowodzie)
    .sort((a, b) => poPowodzie[b] - poPowodzie[a])
    .map(r => `<div class="storage-row" style="margin-bottom:4px;">
        <span>${escapeHtml(r)}</span><strong>${poPowodzie[r]}</strong>
      </div>`).join('');

  const okres = (od || doD)
    ? `${od ? formatDatePl(od) : 'początek'} – ${doD ? formatDatePl(doD) : 'dziś'}`
    : 'cały okres';

  wrap.innerHTML = `
    <div style="font-weight:700;margin-bottom:8px;">
      ${okres} · wpisów: ${zebrane.length} · nadawców: ${nadawcy.size}
    </div>
    <div style="font-size:12px;font-weight:800;color:var(--accent2);text-transform:uppercase;margin:10px 0 6px;">Zużycie wg towaru</div>
    ${wierszeTowary}
    <div style="font-size:12px;font-weight:800;color:var(--accent);text-transform:uppercase;margin:12px 0 6px;">Wpisy wg osoby</div>
    ${wierszeOsoby}
    <div style="font-size:12px;font-weight:800;color:var(--warn);text-transform:uppercase;margin:12px 0 6px;">Wpisy wg powodu</div>
    ${wierszePowody}
    <button class="btn secondary full-width" id="centZuzCsvBtn" style="margin-top:12px;">📊 Eksportuj zbiorczo do CSV</button>
  `;

  document.getElementById('centZuzCsvBtn').addEventListener('click', () => {
    const rows = [['Data', 'Towar', 'Ilość', 'Jm', 'Powód', 'Osoba', 'Nadawca paczki']];
    for (const z of zebrane.slice().sort((a, b) => (a.data || '').localeCompare(b.data || ''))) {
      rows.push([z.data || '', z.etykieta, String(z.ilosc).replace('.', ','), z.jm, z.powod, z.osoba, z.nadawca]);
    }
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zuzycie-zbiorcze-${(od || 'od-poczatku')}_${(doD || 'do-dzis')}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Plik CSV pobrany');
  });
}

document.getElementById('centZuzRaportBtn') && document.getElementById('centZuzRaportBtn').addEventListener('click', centralaZbiorczeZuzycie);
