// magazyn.js — logika modułu Magazyn (gospodarka magazynowa)
// Odwzorowuje logikę arkusza "Gospodarka magazynowa – chemia":
// stan bieżący = stan początkowy + suma przyjęć − suma wydań
// status: DO ZAMÓWIENIA gdy stan <= 0, albo gdy stan <= stan minimalny (o ile > 0), inaczej OK

let magState = {
  products: [],
  receipts: [],
  issues: [],
  orders: [],
  editingProductId: null,
  editingReceiptId: null,
  editingIssueId: null,
  editingOrderId: null,
  currentOrderItems: [], // [{ productId, ilosc }] — pozycje edytowanego zamówienia
  pendingReceiptItems: [], // pozycje dodawane wsadowo w oknie "Nowe przyjęcia" przed zapisem
  pendingIssueItems: [],   // jw. dla "Nowe wydania"
  blokadaUjemnych: true,   // domyślnie WŁĄCZONA — nadpisywana ustawieniem z bazy w initMagazyn()
  zewnetrzne: null          // ostatnia pobrana paczka danych z systemu 10.0.60.24 (patrz initMagazyn)
};

// ===== Ustawienie: blokada wydań schodzących poniżej zera =====
async function magLoadBlokadaSetting() {
  magState.blokadaUjemnych = await DB.getSetting('magazynBlokadaUjemnych', true);
  const cb = document.getElementById('magBlokadaUjemnychInput');
  if (cb) cb.checked = magState.blokadaUjemnych;
}
document.getElementById('magBlokadaUjemnychInput') && document.getElementById('magBlokadaUjemnychInput').addEventListener('change', async (e) => {
  magState.blokadaUjemnych = e.target.checked;
  await DB.setSetting('magazynBlokadaUjemnych', magState.blokadaUjemnych);
});

// Ile z danego produktu jest już zaplanowane w bieżącym, jeszcze niezapisanym
// koszyku wydania — trzeba to doliczyć przy sprawdzaniu limitu, bo user może
// dodać ten sam produkt kilka razy przed jednym zapisem.
function magPendingQtyForProduct(productId, excludeIdx = -1) {
  return (magState.pendingIssueItems || [])
    .filter((it, idx) => it.productId === productId && idx !== excludeIdx)
    .reduce((s, it) => s + (Number(it.iloscWydana) || 0), 0);
}

// ===== Init =====
async function initMagazyn() {
  magState.products = await DB.getMagProducts();
  magState.receipts = await DB.getMagReceipts();
  magState.issues = await DB.getMagIssues();
  magState.orders = await DB.getMagOrders();
  await magLoadBlokadaSetting();
  magState.zewnetrzne = await DB.getSetting('magZewnetrzneCache', null);

  document.getElementById('magIssueData').value = todayStr();
  document.getElementById('magOrderData').value = todayStr();

  renderMagOrderProductSelects();
  renderMagStock();
  renderMagProducts();
  renderMagReceipts();
  renderMagIssues();
  renderMagOrders();
}

// ===== Obliczenia stanu magazynowego =====
function computeStock(product) {
  const przyjecia = magState.receipts.filter(r => r.productId === product.id).reduce((s, r) => s + (Number(r.iloscRazem) || 0), 0);
  const wydania = magState.issues.filter(i => i.productId === product.id).reduce((s, i) => s + (Number(i.iloscWydana) || 0), 0);
  const stanPoczatkowy = Number(product.stanPoczatkowy) || 0;
  const stanBiezacy = stanPoczatkowy + przyjecia - wydania;
  const stanMin = Number(product.stanMinimalny) || 0;

  let status;
  if (stanBiezacy <= 0) status = 'DO ZAMÓWIENIA';
  else if (stanMin === 0) status = 'OK';
  else if (stanBiezacy <= stanMin) status = 'DO ZAMÓWIENIA';
  else status = 'OK';

  const sugerowana = stanBiezacy < stanMin ? (stanMin - stanBiezacy) : 0;
  return { przyjecia, wydania, stanPoczatkowy, stanBiezacy, stanMin, status, sugerowana };
}

function findProduct(id) {
  return magState.products.find(p => p.id === id) || null;
}

function productShortLabel(p) {
  if (!p) return '(usunięty produkt)';
  const nazwa = p.nazwa || '(bez nazwy)';
  return p.wielkoscOpak ? `${nazwa} (${p.wielkoscOpak})` : nazwa;
}

function productFullLabel(p) {
  if (!p) return '(usunięty produkt)';
  const opak = p.wielkoscOpak ? `opak. ${p.wielkoscOpak} ${p.jm || ''}`.trim() : '';
  return [p.nazwa, opak, p.dostawca].filter(Boolean).join('  |  ');
}

// ===== RENDER: Stan magazynowy =====
function renderMagStock() {
  const search = (document.getElementById('magStockSearch').value || '').toLowerCase();
  let list = magState.products.slice().sort((a, b) => (a.nazwa || '').localeCompare(b.nazwa || '', 'pl'));
  if (search) list = list.filter(p =>
    (p.nazwa || '').toLowerCase().includes(search) ||
    (p.indeks || '').toLowerCase().includes(search) ||
    (p.dostawca || '').toLowerCase().includes(search)
  );

  const container = document.getElementById('magStockList');
  const empty = document.getElementById('magStockEmpty');
  if (!list.length) { container.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  container.innerHTML = list.map(p => {
    const s = computeStock(p);
    const badgeClass = s.status === 'OK' ? 'ok' : 'bad';
    const sugerowanaTxt = s.sugerowana > 0 ? ` • Zamów: ${s.sugerowana} ${escapeHtml(p.jm || '')}` : '';

    let packInfo = '';
    if (p.wielkoscOpak && p.wielkoscOpak > 0) {
      const packCount = s.stanBiezacy / p.wielkoscOpak;
      const packDisplay = Number.isInteger(packCount) ? packCount : packCount.toFixed(1);
      packInfo = ` (${packDisplay} szt. × ${p.wielkoscOpak} ${escapeHtml(p.jm || '')})`;
    }

    return `
      <div class="machine-item" data-id="${p.id}">
        <div>
          <div class="mname">${escapeHtml(p.nazwa || '')}</div>
          <div class="mmeta">${escapeHtml(p.indeks || '—')} • ${escapeHtml(p.dostawca || '—')} • Stan: ${s.stanBiezacy} ${escapeHtml(p.jm || '')}${packInfo}${sugerowanaTxt}</div>
        </div>
        <span class="badge ${badgeClass}">${s.status}</span>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.machine-item').forEach(el => {
    el.addEventListener('click', () => openMagProductModal(el.dataset.id));
  });
}
document.getElementById('magStockSearch').addEventListener('input', renderMagStock);

function magStanMinLabel(p) {
  const stored = Number(p.stanMinimalny) || 0;
  if (p.wielkoscOpak && p.wielkoscOpak > 0) {
    const opak = stored / p.wielkoscOpak;
    const disp = Number.isInteger(opak) ? opak : opak.toFixed(2);
    return `min. ${disp} szt.`;
  }
  return `min. ${stored} ${p.jm || ''}`.trim();
}

// ===== RENDER: Baza produktów =====
function renderMagProducts() {
  const search = (document.getElementById('magProductsSearch').value || '').toLowerCase();
  let list = magState.products.slice().sort((a, b) => (a.nazwa || '').localeCompare(b.nazwa || '', 'pl'));
  if (search) list = list.filter(p =>
    (p.nazwa || '').toLowerCase().includes(search) ||
    (p.indeks || '').toLowerCase().includes(search) ||
    (p.dostawca || '').toLowerCase().includes(search)
  );

  const container = document.getElementById('magProductsList');
  const empty = document.getElementById('magProductsEmpty');
  if (!list.length) { container.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  container.innerHTML = list.map(p => `
    <div class="machine-item" data-id="${p.id}">
      <div>
        <div class="mname">${escapeHtml(p.nazwa || '')}</div>
        <div class="mmeta">${escapeHtml(p.indeks || '—')} • ${escapeHtml(p.dostawca || '—')} • opak. ${p.wielkoscOpak || '—'} ${escapeHtml(p.jm || '')}</div>
      </div>
      <span class="badge neutral">${magStanMinLabel(p)}</span>
    </div>
  `).join('');

  container.querySelectorAll('.machine-item').forEach(el => {
    el.addEventListener('click', () => openMagProductModal(el.dataset.id));
  });
}
document.getElementById('magProductsSearch').addEventListener('input', renderMagProducts);
document.getElementById('addProductFab').addEventListener('click', () => openMagProductModal(null));

// ===== MODAL: Produkt =====
// Lista gotowych jednostek miary — żeby nie trzeba było pamiętać, czy dana
// jednostka bierze kropkę (np. "szt." tak, ale "kg" nie).
const MAG_JM_OPTIONS = ['szt.', 'kg', 'g', 'l', 'ml', 'opak.', 'but.', 'kpl.', 'm', 'para'];

// Ustawia select + (jeśli trzeba) pole "własna jednostka" na podstawie zapisanej
// wartości. Stare produkty mogły mieć jm wpisane ręcznie w dowolnym formacie —
// jeśli nie pasuje do żadnej gotowej opcji, ląduje w "Inna", żeby nic nie zgubić.
function setMagProductJmValue(value) {
  const sel = document.getElementById('magProductJm');
  const wrap = document.getElementById('magProductJmInnaWrap');
  const inna = document.getElementById('magProductJmInna');
  if (!value) {
    sel.value = '';
    wrap.style.display = 'none';
    inna.value = '';
  } else if (MAG_JM_OPTIONS.includes(value)) {
    sel.value = value;
    wrap.style.display = 'none';
    inna.value = '';
  } else {
    sel.value = '__inna__';
    wrap.style.display = 'block';
    inna.value = value;
  }
}
function getMagProductJmValue() {
  const sel = document.getElementById('magProductJm');
  if (sel.value === '__inna__') return document.getElementById('magProductJmInna').value.trim();
  return sel.value;
}
document.getElementById('magProductJm').addEventListener('change', (e) => {
  document.getElementById('magProductJmInnaWrap').style.display = e.target.value === '__inna__' ? 'block' : 'none';
});

// Stan minimalny/początkowy są wpisywane w SZTUKACH OPAKOWAŃ, jeśli produkt ma
// ustawioną "Wielkość opakowania" (np. wpisanie 5 przy opak. 25 kg oznacza
// 5 opakowań = 125 kg). Wewnętrznie (i wszędzie indziej w aplikacji — stan
// bieżący, raporty, CSV) wartości te są przeliczane i przechowywane w
// jednostce miary produktu, żeby porównania ze stanem bieżącym (liczonym z
// przyjęć/wydań, zawsze w JM) działały poprawnie bez zmian gdzie indziej.
// Bez ustawionej wielkości opakowania nic się nie przelicza — pole jest
// wtedy wprost w JM produktu (np. "szt." bez podziału na opakowania).
function magOpakToStored(opakValue, wielkoscOpak) {
  const n = parseFloat(opakValue) || 0;
  return (wielkoscOpak && wielkoscOpak > 0) ? n * wielkoscOpak : n;
}
function magStoredToOpak(storedValue, wielkoscOpak) {
  const n = Number(storedValue) || 0;
  return (wielkoscOpak && wielkoscOpak > 0) ? +(n / wielkoscOpak).toFixed(3) : n;
}
function magUpdateStanUnitHints() {
  const wielkoscOpak = parseFloat(document.getElementById('magProductWielkoscOpak').value) || 0;
  const jm = getMagProductJmValue() || 'jednostkach miary';
  const text = wielkoscOpak > 0
    ? `W sztukach opakowań (1 opak. = ${wielkoscOpak} ${jm}) — NIE w ${jm}.`
    : `W jednostce miary produktu (${jm}).`;
  const hintMin = document.getElementById('magProductStanMinHint');
  const hintPocz = document.getElementById('magProductStanPoczHint');
  if (hintMin) hintMin.textContent = text;
  if (hintPocz) hintPocz.textContent = text;
}
document.getElementById('magProductWielkoscOpak').addEventListener('input', magUpdateStanUnitHints);
document.getElementById('magProductJm').addEventListener('change', magUpdateStanUnitHints);
document.getElementById('magProductJmInna').addEventListener('input', magUpdateStanUnitHints);

function openMagProductModal(productId) {
  magState.editingProductId = productId;
  const titleEl = document.getElementById('magProductModalTitle');
  const delBtn = document.getElementById('deleteMagProductBtn');

  if (productId) {
    const p = findProduct(productId);
    titleEl.textContent = 'Edytuj produkt';
    document.getElementById('magProductNazwa').value = p.nazwa || '';
    document.getElementById('magProductIndeks').value = p.indeks || '';
    document.getElementById('magProductDostawca').value = p.dostawca || '';
    document.getElementById('magProductWielkoscOpak').value = p.wielkoscOpak ?? '';
    setMagProductJmValue(p.jm || '');
    document.getElementById('magProductStanMin').value = magStoredToOpak(p.stanMinimalny, p.wielkoscOpak);
    document.getElementById('magProductStanPocz').value = magStoredToOpak(p.stanPoczatkowy, p.wielkoscOpak);
    document.getElementById('magProductUwagi').value = p.uwagi || '';
    delBtn.style.display = 'inline-block';
  } else {
    titleEl.textContent = 'Nowy produkt';
    document.getElementById('magProductNazwa').value = '';
    document.getElementById('magProductIndeks').value = '';
    document.getElementById('magProductDostawca').value = '';
    document.getElementById('magProductWielkoscOpak').value = '';
    setMagProductJmValue('');
    document.getElementById('magProductStanMin').value = 0;
    document.getElementById('magProductStanPocz').value = 0;
    document.getElementById('magProductUwagi').value = '';
    delBtn.style.display = 'none';
  }
  magUpdateStanUnitHints();
  document.getElementById('magProductModalOverlay').classList.add('active');
}
// Ustawiane, gdy formularz "Nowy produkt" jest otwierany "w locie" z innego
// miejsca (Przyjęcia/Wydania/Zamówienia/Zużycie) — po zapisaniu nowego produktu
// wracamy tam z automatycznie wybranym produktem, zamiast zostawiać okno otwarte.
let magProductQuickAddCallback = null;
function magOpenQuickAddProduct(prefillName, callback) {
  magProductQuickAddCallback = callback;
  openMagProductModal(null);
  document.getElementById('magProductNazwa').value = prefillName || '';
}
function closeMagProductModal() {
  document.getElementById('magProductModalOverlay').classList.remove('active');
  magState.editingProductId = null;
  magProductQuickAddCallback = null;
}
document.getElementById('closeMagProductModal').addEventListener('click', closeMagProductModal);
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. Zamykanie: closeMagProductModal()

document.getElementById('saveMagProductBtn').addEventListener('click', async () => {
  const nazwa = document.getElementById('magProductNazwa').value.trim();
  if (!nazwa) { showToast('Podaj nazwę produktu'); return; }

  // Ochrona przed dublowaniem katalogu — literówki i ta sama nazwa z inną pojemnością
  if (typeof zuzFindSimilarProducts === 'function') {
    const wielkosc = document.getElementById('magProductWielkoscOpak').value.trim();
    const podobne = zuzFindSimilarProducts(nazwa, wielkosc, magState.editingProductId);
    if (podobne.length) {
      const lista = podobne.map(s =>
        `• ${s.product.nazwa}${s.product.wielkoscOpak ? ' (' + s.product.wielkoscOpak + ')' : ''} — ${s.powod}`
      ).join('\n');
      const ok = confirm(
        `W katalogu są już podobne towary:\n\n${lista}\n\n` +
        `Czy na pewno dodać "${nazwa}" jako osobną pozycję?\n\n` +
        `(Anuluj = wróć i popraw nazwę)`
      );
      if (!ok) return;
    }
  }

  let product;
  let isNew = false;
  if (magState.editingProductId) {
    product = findProduct(magState.editingProductId);
  } else {
    product = {};
    isNew = true;
  }
  product.nazwa = nazwa;
  product.indeks = document.getElementById('magProductIndeks').value.trim();
  product.dostawca = document.getElementById('magProductDostawca').value.trim();
  product.wielkoscOpak = parseFloat(document.getElementById('magProductWielkoscOpak').value) || 0;
  product.jm = getMagProductJmValue();
  // Stan minimalny/początkowy wpisujemy w sztukach opakowań (patrz podpowiedź
  // pod polami) — przeliczamy na jednostkę miary przed zapisem, żeby stan
  // bieżący (liczony z przyjęć/wydań, zawsze w JM) porównywał się poprawnie.
  product.stanMinimalny = magOpakToStored(document.getElementById('magProductStanMin').value, product.wielkoscOpak);
  product.stanPoczatkowy = magOpakToStored(document.getElementById('magProductStanPocz').value, product.wielkoscOpak);
  product.uwagi = document.getElementById('magProductUwagi').value.trim();

  await DB.saveMagProduct(product);
  if (isNew) magState.products.push(product);

  renderMagStock();
  renderMagProducts();
  renderMagOrderProductSelects();
  if (isNew && magProductQuickAddCallback) {
    // Produkt dodany "w locie" z innego formularza (np. z Przyjęć) — zamykamy
    // i wracamy tam, z automatycznie wybranym nowym produktem.
    const cb = magProductQuickAddCallback;
    magProductQuickAddCallback = null;
    closeMagProductModal();
    cb(product);
    showToast('Produkt dodany i wybrany');
  } else if (isNew) {
    openMagProductModal(null); // zostaw okno otwarte, wyczyszczone, gotowe na kolejny produkt
    showToast('Produkt zapisany — możesz dodać kolejny');
  } else {
    closeMagProductModal();
    showToast('Produkt zapisany');
  }
});

document.getElementById('deleteMagProductBtn').addEventListener('click', async () => {
  if (!magState.editingProductId) return;
  if (!confirm('Usunąć ten produkt z bazy? Historia przyjęć/wydań powiązanych z nim zostanie (ale nie będzie już przypisana do nazwy produktu).')) return;
  await DB.deleteMagProduct(magState.editingProductId);
  magState.products = magState.products.filter(p => p.id !== magState.editingProductId);
  closeMagProductModal();
  renderMagStock();
  renderMagProducts();
  renderMagReceipts();
  renderMagIssues();
  showToast('Produkt usunięty');
});

// ===== Wspólne: select produktu (zamówienia - nadal dropdown, zostaje bez zmian) =====
function fillProductSelect(selectEl, selectedId) {
  const sorted = magState.products.slice().sort((a, b) => (a.nazwa || '').localeCompare(b.nazwa || '', 'pl'));
  selectEl.innerHTML = sorted.map(p => `<option value="${p.id}">${escapeHtml(productFullLabel(p))}</option>`).join('');
  if (selectedId) selectEl.value = selectedId;
}
// Jak fillProductSelect, ale z opcją "Wszystkie towary" na początku — do pól filtra.
function fillFilterProductSelect(selectEl) {
  if (!selectEl) return;
  const current = selectEl.value;
  const sorted = magState.products.slice().sort((a, b) => (a.nazwa || '').localeCompare(b.nazwa || '', 'pl'));
  selectEl.innerHTML = '<option value="">Wszystkie towary</option>' +
    sorted.map(p => `<option value="${p.id}">${escapeHtml(productFullLabel(p))}</option>`).join('');
  selectEl.value = current;
}
function renderMagOrderProductSelects() {
  document.querySelectorAll('.mag-order-item-product').forEach(sel => {
    const current = sel.value;
    fillProductSelect(sel, current);
  });
  fillFilterProductSelect(document.getElementById('magReceiptsFilterProdukt'));
  fillFilterProductSelect(document.getElementById('magIssuesFilterProdukt'));
}

// ===== Wspólne: grupowanie długich list historii (przyjęcia/wydania/zamówienia/zużycie)
// po dniu, żeby lista nie zamieniała się w nieczytelną ścianę wpisów. Tylko
// najnowszy dzień jest domyślnie rozwinięty — starsze to same nagłówki, klik
// żeby rozwinąć. `items` musi być posortowane malejąco wg daty.
function renderGroupedByDate(container, items, dateOf, rowRenderer, groupPrefix) {
  if (!items.length) { container.innerHTML = ''; return; }
  const groups = [];
  let currentKey = null;
  for (const it of items) {
    const key = dateOf(it) || '';
    if (key !== currentKey || !groups.length) {
      currentKey = key;
      groups.push({ key, items: [] });
    }
    groups[groups.length - 1].items.push(it);
  }
  container.innerHTML = groups.map((g, idx) => {
    const expanded = idx === 0;
    const label = g.key ? formatDatePl(g.key) : 'Brak daty';
    const groupId = `${groupPrefix}-g${idx}`;
    return `
      <div class="date-group" style="margin-bottom:6px;">
        <div class="date-group-header" data-target="${groupId}" style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:var(--card2);border-radius:9px;cursor:pointer;font-weight:700;font-size:13.5px;">
          <span>${escapeHtml(label)}</span>
          <span style="font-weight:400;color:var(--text-dim);">${g.items.length} poz. <span class="dg-arrow">${expanded ? '▲' : '▼'}</span></span>
        </div>
        <div class="date-group-body" id="${groupId}" style="display:${expanded ? 'block' : 'none'};margin-top:6px;">
          ${g.items.map(rowRenderer).join('')}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.date-group-header').forEach(h => {
    h.addEventListener('click', () => {
      const body = document.getElementById(h.dataset.target);
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      h.querySelector('.dg-arrow').textContent = open ? '▼' : '▲';
    });
  });
}

// ===== Wspólne: wyszukiwarka produktu z podpowiedziami (przyjęcia / wydania / zamówienia) =====
// query — wpisany tekst, containerId — element na podpowiedzi, onPick(product) — callback po kliknięciu.
function renderProductSuggestions(query, containerId, onPick) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const q = (query || '').trim().toLowerCase();
  if (!q) { container.innerHTML = ''; container.style.display = 'none'; return; }

  const matches = magState.products.filter(p =>
    (p.nazwa || '').toLowerCase().includes(q) ||
    (p.indeks || '').toLowerCase().includes(q) ||
    (p.dostawca || '').toLowerCase().includes(q)
  ).slice(0, 8);

  const addRow = `<div class="search-suggestion-item search-suggestion-add" data-add="1">➕ Nie ma na liście? Dodaj nowy produkt „${escapeHtml(query.trim())}"</div>`;

  if (!matches.length) {
    container.innerHTML = `<div class="search-suggestion-empty">Brak wyników — sprawdź pisownię, albo dodaj nowy produkt.</div>${addRow}`;
  } else {
    container.innerHTML = matches.map(p => `<div class="search-suggestion-item" data-id="${p.id}">${escapeHtml(productFullLabel(p))}</div>`).join('') + addRow;
  }
  container.style.display = 'block';
  container.querySelectorAll('.search-suggestion-item[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      container.innerHTML = '';
      container.style.display = 'none';
      onPick(findProduct(el.dataset.id));
    });
  });
  const addEl = container.querySelector('.search-suggestion-add');
  if (addEl) {
    addEl.addEventListener('click', () => {
      const typed = query.trim();
      container.innerHTML = '';
      container.style.display = 'none';
      magOpenQuickAddProduct(typed, onPick);
    });
  }
}

// ===== RENDER: Przyjęcia =====
function renderMagReceipts() {
  const container = document.getElementById('magReceiptsList');
  const empty = document.getElementById('magReceiptsEmpty');
  const summary = document.getElementById('magReceiptsSummary');
  const od = document.getElementById('magReceiptsFilterOd').value;
  const doD = document.getElementById('magReceiptsFilterDo').value;
  const productId = document.getElementById('magReceiptsFilterProdukt').value;

  let list = magState.receipts.slice();
  if (od) list = list.filter(r => (r.data || '') >= od);
  if (doD) list = list.filter(r => (r.data || '') <= doD);
  if (productId) list = list.filter(r => r.productId === productId);
  list.sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.createdAt - a.createdAt);

  if (summary) summary.textContent = list.length ? `Wpisów: ${list.length}` : '';

  if (!list.length) { container.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  renderGroupedByDate(container, list, r => r.data, (r) => {
    const p = findProduct(r.productId);
    const rodzajLabel = { opak: 'opak.', l: 'l', kg: 'kg' }[r.rodzaj] || '';
    const partiaBits = [];
    if (r.nrPartii) partiaBits.push(`partia: ${r.nrPartii}`);
    if (r.dataPrzydatnosci) partiaBits.push(`przydatność do: ${formatDatePl(r.dataPrzydatnosci)}`);
    const partiaLine = partiaBits.length ? `<div class="mmeta">${escapeHtml(partiaBits.join(' · '))}</div>` : '';
    return `
      <div class="machine-item" data-id="${r.id}">
        <div>
          <div class="mname">${escapeHtml(productShortLabel(p))}</div>
          <div class="mmeta">${r.ilosc || ''} ${rodzajLabel} → razem ${r.iloscRazem} ${escapeHtml(p ? p.jm || '' : '')}</div>
          ${partiaLine}
        </div>
        <span class="badge ok">+${r.iloscRazem}</span>
      </div>
    `;
  }, 'receipts');

  container.querySelectorAll('.machine-item').forEach(el => {
    el.addEventListener('click', () => openMagReceiptModal(el.dataset.id));
  });
}

document.getElementById('addReceiptBtn').addEventListener('click', () => openMagReceiptModal(null));

['magReceiptsFilterOd', 'magReceiptsFilterDo', 'magReceiptsFilterProdukt'].forEach(id => {
  document.getElementById(id).addEventListener('change', renderMagReceipts);
});
document.getElementById('magReceiptsClearFiltersBtn').addEventListener('click', () => {
  document.getElementById('magReceiptsFilterOd').value = '';
  document.getElementById('magReceiptsFilterDo').value = '';
  document.getElementById('magReceiptsFilterProdukt').value = '';
  renderMagReceipts();
});

// ===== Wczytaj z PDF/skanu WZ (pdf.js do odczytu tekstu, Tesseract OCR jako fallback dla skanów) =====
function loadPdfJsLib() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function loadTesseractLib() {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Zwraca { text, usedOcr }. Najpierw próbuje odczytać warstwę tekstową PDF-a (szybkie,
// dokładne — działa gdy dokument NIE jest czystym skanem). Jeśli tekstu jest za mało
// (typowy skan telefonem bez warstwy tekstowej), renderuje pierwszą stronę jako obraz
// i uruchamia OCR (Tesseract, PL+EN) — wolniejsze i mniej pewne.
async function extractTextFromPdf(file) {
  await loadPdfJsLib();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  const numPages = Math.min(pdf.numPages, 3);
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map(it => it.str).join(' ') + '\n';
  }

  if (fullText.trim().length >= 25) {
    return { text: fullText, usedOcr: false };
  }

  await loadTesseractLib();
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  const result = await window.Tesseract.recognize(canvas, 'pol+eng');
  return { text: result.data.text, usedOcr: true };
}

// Dopasowuje rozpoznany tekst do nazw produktów w bazie i próbuje znaleźć ilość w
// pobliżu dopasowanej nazwy. To zgadywanie, nie pewność — zawsze wymaga sprawdzenia.
function matchProductsInText(text) {
  const normalize = (s) => stripPolishDiacritics(String(s || '')).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const normText = normalize(text);
  const matches = [];

  magState.products.forEach(p => {
    const normName = normalize(p.nazwa);
    if (!normName || normName.length < 3) return;
    const idx = normText.indexOf(normName);
    if (idx === -1) return;

    const windowStart = Math.max(0, idx - 40);
    const windowEnd = Math.min(normText.length, idx + normName.length + 40);
    const windowText = normText.slice(windowStart, windowEnd);
    const numMatch = windowText.match(/\b(\d{1,4}(?:[.,]\d{1,2})?)\b/);
    const ilosc = numMatch ? parseFloat(numMatch[1].replace(',', '.')) : null;

    matches.push({ product: p, ilosc });
  });

  return matches;
}

document.getElementById('magReceiptScanBtn').addEventListener('click', () => {
  document.getElementById('magReceiptScanFile').click();
});

document.getElementById('magReceiptScanFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById('magReceiptScanStatus');
  statusEl.style.display = 'block';
  statusEl.textContent = 'Rozpoznawanie tekstu z dokumentu... przy skanach może to potrwać do minuty.';

  try {
    const { text, usedOcr } = await extractTextFromPdf(file);
    const matches = matchProductsInText(text);

    if (!matches.length) {
      statusEl.textContent = 'Nie rozpoznano żadnych znanych produktów w dokumencie. Dodaj pozycje ręcznie przez wyszukiwarkę poniżej.';
      showToast('Brak dopasowań — sprawdź, czy nazwy w bazie pasują do dokumentu');
      e.target.value = '';
      return;
    }

    matches.forEach(m => {
      const iloscRazem = (m.ilosc && m.product.wielkoscOpak)
        ? +(m.ilosc * m.product.wielkoscOpak).toFixed(3)
        : (m.ilosc || 1);
      magState.pendingReceiptItems.push({
        productId: m.product.id,
        ilosc: m.ilosc || 1,
        rodzaj: 'opak',
        iloscRazem
      });
    });
    renderPendingReceiptItems();

    statusEl.textContent = `Rozpoznano ${matches.length} ${matches.length === 1 ? 'pozycję' : 'pozycji'} (${usedOcr ? 'ze skanu przez OCR' : 'z tekstu PDF'}) — SPRAWDŹ ilości i rodzaj na liście niżej przed zapisem, rozpoznawanie nie jest w 100% dokładne.`;
    showToast(`Rozpoznano ${matches.length} pozycji — koniecznie sprawdź przed zapisem`);
  } catch (err) {
    statusEl.textContent = 'Nie udało się przetworzyć pliku: ' + err.message;
    showToast('Błąd rozpoznawania dokumentu');
  }
  e.target.value = '';
});

function openMagReceiptModal(receiptId) {
  magState.editingReceiptId = receiptId;
  const addMode = document.getElementById('magReceiptAddMode');
  const editMode = document.getElementById('magReceiptEditMode');
  const title = document.getElementById('magReceiptModalTitle');

  if (receiptId) {
    // Tryb edycji pojedynczej, już zapisanej pozycji
    title.textContent = 'Edytuj przyjęcie';
    addMode.style.display = 'none';
    editMode.style.display = 'block';
    const r = magState.receipts.find(x => x.id === receiptId);
    const p = findProduct(r.productId);
    document.getElementById('magReceiptEditProductName').textContent = productFullLabel(p);
    magReceiptEditProduct = p;
    document.getElementById('magReceiptEditData').value = r.data || todayStr();
    document.getElementById('magReceiptEditIlosc').value = r.ilosc ?? '';
    recalcMagReceiptEditRazem();
    document.getElementById('magReceiptEditNrPartii').value = r.nrPartii || '';
    document.getElementById('magReceiptEditDataProdukcji').value = r.dataProdukcji || '';
    document.getElementById('magReceiptEditDataPrzydatnosci').value = r.dataPrzydatnosci || '';
    document.getElementById('magReceiptEditUwagi').value = r.uwagi || '';
  } else {
    // Tryb dodawania: szukaj → wybierz → ilość → pozycja na liście, powtarzalnie
    title.textContent = 'Nowe przyjęcia';
    addMode.style.display = 'block';
    editMode.style.display = 'none';
    magState.pendingReceiptItems = [];
    document.getElementById('magReceiptData').value = todayStr();
    document.getElementById('magReceiptSearch').value = '';
    document.getElementById('magReceiptSuggestions').style.display = 'none';
    document.getElementById('magReceiptQtyField').style.display = 'none';
    document.getElementById('magReceiptUwagi').value = '';
    document.getElementById('magReceiptScanStatus').style.display = 'none';
    renderPendingReceiptItems();
  }
  document.getElementById('magReceiptModalOverlay').classList.add('active');
}
function closeMagReceiptModal() {
  document.getElementById('magReceiptModalOverlay').classList.remove('active');
  magState.editingReceiptId = null;
}
document.getElementById('closeMagReceiptModal').addEventListener('click', closeMagReceiptModal);
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. Zamykanie: closeMagReceiptModal()

// ----- Tryb dodawania (wyszukiwarka + lista pozycji) -----
let magReceiptPickedProduct = null;
// ----- Tryb edycji pojedynczej, już zapisanej pozycji -----
let magReceiptEditProduct = null;
function recalcMagReceiptEditRazem() {
  const ilosc = parseFloat(document.getElementById('magReceiptEditIlosc').value);
  if (isNaN(ilosc)) { document.getElementById('magReceiptEditRazem').value = ''; return; }
  document.getElementById('magReceiptEditRazem').value = magOpakToStored(ilosc, magReceiptEditProduct && magReceiptEditProduct.wielkoscOpak);
}
document.getElementById('magReceiptEditIlosc').addEventListener('input', recalcMagReceiptEditRazem);

document.getElementById('magReceiptSearch').addEventListener('input', (e) => {
  renderProductSuggestions(e.target.value, 'magReceiptSuggestions', (product) => {
    magReceiptPickedProduct = product;
    document.getElementById('magReceiptSearch').value = product.nazwa;
    document.getElementById('magReceiptSelectedProduct').textContent = `Wybrano: ${productFullLabel(product)}`;
    document.getElementById('magReceiptIlosc').value = '';
    document.getElementById('magReceiptRazem').value = '';
    document.getElementById('magReceiptNrPartii').value = '';
    document.getElementById('magReceiptDataProdukcji').value = '';
    document.getElementById('magReceiptDataPrzydatnosci').value = '';
    document.getElementById('magReceiptQtyField').style.display = 'block';
    document.getElementById('magReceiptIlosc').focus();
  });
});

function recalcMagReceiptRazem() {
  const ilosc = parseFloat(document.getElementById('magReceiptIlosc').value);
  if (isNaN(ilosc)) { document.getElementById('magReceiptRazem').value = ''; return; }
  document.getElementById('magReceiptRazem').value = magOpakToStored(ilosc, magReceiptPickedProduct && magReceiptPickedProduct.wielkoscOpak);
}
document.getElementById('magReceiptIlosc').addEventListener('input', recalcMagReceiptRazem);

document.getElementById('cancelMagReceiptItemBtn').addEventListener('click', () => {
  magReceiptPickedProduct = null;
  document.getElementById('magReceiptSearch').value = '';
  document.getElementById('magReceiptQtyField').style.display = 'none';
});

document.getElementById('confirmMagReceiptItemBtn').addEventListener('click', () => {
  const iloscRazem = parseFloat(document.getElementById('magReceiptRazem').value);
  if (!magReceiptPickedProduct) { showToast('Najpierw znajdź i wybierz produkt'); return; }
  if (isNaN(iloscRazem) || iloscRazem <= 0) { showToast('Podaj poprawną ilość razem'); return; }

  magState.pendingReceiptItems.push({
    productId: magReceiptPickedProduct.id,
    ilosc: parseFloat(document.getElementById('magReceiptIlosc').value) || 0,
    rodzaj: 'opak',
    iloscRazem,
    nrPartii: document.getElementById('magReceiptNrPartii').value.trim(),
    dataProdukcji: document.getElementById('magReceiptDataProdukcji').value,
    dataPrzydatnosci: document.getElementById('magReceiptDataPrzydatnosci').value
  });
  renderPendingReceiptItems();

  // Reset do kolejnego wyszukiwania — dokładnie ten sam krok od nowa
  magReceiptPickedProduct = null;
  document.getElementById('magReceiptSearch').value = '';
  document.getElementById('magReceiptNrPartii').value = '';
  document.getElementById('magReceiptDataProdukcji').value = '';
  document.getElementById('magReceiptDataPrzydatnosci').value = '';
  document.getElementById('magReceiptQtyField').style.display = 'none';
  document.getElementById('magReceiptSearch').focus();
});

function renderPendingReceiptItems() {
  const wrap = document.getElementById('magReceiptItemsList');
  const empty = document.getElementById('magReceiptItemsEmpty');
  const items = magState.pendingReceiptItems || [];
  if (!items.length) {
    wrap.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  const rodzajLabel = { opak: 'opak.', l: 'l', kg: 'kg' };
  wrap.innerHTML = items.map((item, idx) => {
    const p = findProduct(item.productId);
    const partiaInfo = item.nrPartii ? ` <span style="font-size:12px;color:var(--text-dim);">· partia: ${escapeHtml(item.nrPartii)}</span>` : '';
    return `
      <div class="picked-items-row">
        <span>${escapeHtml(productShortLabel(p))} — ${item.ilosc} ${rodzajLabel[item.rodzaj] || ''} → razem ${item.iloscRazem} ${escapeHtml(p ? p.jm || '' : '')}${partiaInfo}</span>
        <button class="btn danger" data-remove-pending-receipt="${idx}">✕</button>
      </div>
    `;
  }).join('');
  wrap.querySelectorAll('[data-remove-pending-receipt]').forEach(btn => {
    btn.addEventListener('click', () => {
      magState.pendingReceiptItems.splice(+btn.dataset.removePendingReceipt, 1);
      renderPendingReceiptItems();
    });
  });
}

document.getElementById('saveMagReceiptBtn').addEventListener('click', async () => {
  const items = magState.pendingReceiptItems || [];
  if (!items.length) { showToast('Dodaj przynajmniej jedną pozycję'); return; }
  const uwagi = document.getElementById('magReceiptUwagi').value.trim();
  const data = document.getElementById('magReceiptData').value || todayStr();

  for (const item of items) {
    const receipt = {
      data, productId: item.productId, ilosc: item.ilosc, rodzaj: item.rodzaj, iloscRazem: item.iloscRazem, uwagi,
      nrPartii: item.nrPartii || '', dataProdukcji: item.dataProdukcji || '', dataPrzydatnosci: item.dataPrzydatnosci || ''
    };
    await DB.saveMagReceipt(receipt);
    magState.receipts.push(receipt);
  }

  magState.pendingReceiptItems = [];
  closeMagReceiptModal();
  renderMagReceipts();
  renderMagStock();
  showToast(`Zapisano ${items.length} ${items.length === 1 ? 'przyjęcie' : 'przyjęć'}`);
});

// ----- Tryb edycji pojedynczej pozycji -----
document.getElementById('saveMagReceiptEditBtn').addEventListener('click', async () => {
  const iloscRazem = parseFloat(document.getElementById('magReceiptEditRazem').value);
  if (isNaN(iloscRazem) || iloscRazem <= 0) { showToast('Podaj poprawną ilość razem'); return; }

  const receipt = magState.receipts.find(r => r.id === magState.editingReceiptId);
  if (!receipt) return;
  receipt.data = document.getElementById('magReceiptEditData').value || todayStr();
  receipt.ilosc = parseFloat(document.getElementById('magReceiptEditIlosc').value) || 0;
  receipt.rodzaj = 'opak';
  receipt.iloscRazem = iloscRazem;
  receipt.nrPartii = document.getElementById('magReceiptEditNrPartii').value.trim();
  receipt.dataProdukcji = document.getElementById('magReceiptEditDataProdukcji').value;
  receipt.dataPrzydatnosci = document.getElementById('magReceiptEditDataPrzydatnosci').value;
  receipt.uwagi = document.getElementById('magReceiptEditUwagi').value.trim();

  await DB.saveMagReceipt(receipt);
  closeMagReceiptModal();
  renderMagReceipts();
  renderMagStock();
  showToast('Przyjęcie zaktualizowane');
});

document.getElementById('deleteMagReceiptBtn').addEventListener('click', async () => {
  if (!magState.editingReceiptId) return;
  if (!confirm('Usunąć to przyjęcie?')) return;
  await DB.deleteMagReceipt(magState.editingReceiptId);
  magState.receipts = magState.receipts.filter(r => r.id !== magState.editingReceiptId);
  closeMagReceiptModal();
  renderMagReceipts();
  renderMagStock();
  showToast('Przyjęcie usunięte');
});

// ===== RENDER: Wydania =====
function renderMagIssues() {
  const container = document.getElementById('magIssuesList');
  const empty = document.getElementById('magIssuesEmpty');
  const summary = document.getElementById('magIssuesSummary');
  const od = document.getElementById('magIssuesFilterOd').value;
  const doD = document.getElementById('magIssuesFilterDo').value;
  const productId = document.getElementById('magIssuesFilterProdukt').value;

  let list = magState.issues.slice();
  if (od) list = list.filter(i => (i.data || '') >= od);
  if (doD) list = list.filter(i => (i.data || '') <= doD);
  if (productId) list = list.filter(i => i.productId === productId);
  list.sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.createdAt - a.createdAt);

  if (summary) summary.textContent = list.length ? `Wpisów: ${list.length}` : '';

  if (!list.length) { container.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  renderGroupedByDate(container, list, i => i.data, (i) => {
    const p = findProduct(i.productId);
    const opakInfo = i.iloscOpak != null ? `${i.iloscOpak} opak. → ` : '';
    return `
      <div class="machine-item" data-id="${i.id}">
        <div>
          <div class="mname">${escapeHtml(productShortLabel(p))}</div>
          <div class="mmeta">−${opakInfo}${i.iloscWydana} ${escapeHtml(p ? p.jm || '' : '')}${i.dzialCel ? ' • ' + escapeHtml(i.dzialCel) : ''}</div>
        </div>
        <span class="badge bad">−${i.iloscWydana}</span>
      </div>
    `;
  }, 'issues');

  container.querySelectorAll('.machine-item').forEach(el => {
    el.addEventListener('click', () => openMagIssueModal(el.dataset.id));
  });
}

document.getElementById('addIssueBtn').addEventListener('click', () => openMagIssueModal(null));

['magIssuesFilterOd', 'magIssuesFilterDo', 'magIssuesFilterProdukt'].forEach(id => {
  document.getElementById(id).addEventListener('change', renderMagIssues);
});
document.getElementById('magIssuesClearFiltersBtn').addEventListener('click', () => {
  document.getElementById('magIssuesFilterOd').value = '';
  document.getElementById('magIssuesFilterDo').value = '';
  document.getElementById('magIssuesFilterProdukt').value = '';
  renderMagIssues();
});

function openMagIssueModal(issueId) {
  magState.editingIssueId = issueId;
  const addMode = document.getElementById('magIssueAddMode');
  const editMode = document.getElementById('magIssueEditMode');
  const title = document.getElementById('magIssueModalTitle');

  if (issueId) {
    title.textContent = 'Edytuj wydanie';
    addMode.style.display = 'none';
    editMode.style.display = 'block';
    const i = magState.issues.find(x => x.id === issueId);
    const p = findProduct(i.productId);
    document.getElementById('magIssueEditProductName').textContent = productFullLabel(p);
    magIssueEditProduct = p;
    document.getElementById('magIssueEditData').value = i.data || todayStr();
    document.getElementById('magIssueEditIlosc').value = (i.iloscOpak != null) ? i.iloscOpak : magStoredToOpak(i.iloscWydana, p && p.wielkoscOpak);
    recalcMagIssueEditRazem();
    document.getElementById('magIssueEditDzial').value = i.dzialCel || '';
    document.getElementById('magIssueEditWydal').value = i.wydal || '';
    document.getElementById('magIssueEditUwagi').value = i.uwagi || '';
  } else {
    title.textContent = 'Nowe wydania';
    addMode.style.display = 'block';
    editMode.style.display = 'none';
    magState.pendingIssueItems = [];
    document.getElementById('magIssueData').value = todayStr();
    document.getElementById('magIssueDzial').value = '';
    document.getElementById('magIssueWydal').value = currentUser ? (currentUser.displayName || currentUser.username) : '';
    document.getElementById('magIssueSearch').value = '';
    document.getElementById('magIssueSuggestions').style.display = 'none';
    document.getElementById('magIssueQtyField').style.display = 'none';
    document.getElementById('magIssueUwagi').value = '';
    renderPendingIssueItems();
  }
  document.getElementById('magIssueModalOverlay').classList.add('active');
}
function closeMagIssueModal() {
  document.getElementById('magIssueModalOverlay').classList.remove('active');
  magState.editingIssueId = null;
}
let magIssueEditProduct = null;
function recalcMagIssueEditRazem() {
  const ilosc = parseFloat(document.getElementById('magIssueEditIlosc').value);
  if (isNaN(ilosc)) { document.getElementById('magIssueEditRazem').value = ''; return; }
  document.getElementById('magIssueEditRazem').value = magOpakToStored(ilosc, magIssueEditProduct && magIssueEditProduct.wielkoscOpak);
}
document.getElementById('magIssueEditIlosc').addEventListener('input', recalcMagIssueEditRazem);
document.getElementById('closeMagIssueModal').addEventListener('click', closeMagIssueModal);
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. Zamykanie: closeMagIssueModal()

// ----- Tryb dodawania -----
let magIssuePickedProduct = null;

document.getElementById('magIssueSearch').addEventListener('input', (e) => {
  renderProductSuggestions(e.target.value, 'magIssueSuggestions', (product) => {
    magIssuePickedProduct = product;
    document.getElementById('magIssueSearch').value = product.nazwa;
    document.getElementById('magIssueSelectedProduct').textContent = `Wybrano: ${productFullLabel(product)}`;
    document.getElementById('magIssueIlosc').value = '';
    document.getElementById('magIssueRazem').value = '';
    document.getElementById('magIssueQtyField').style.display = 'block';
    document.getElementById('magIssueIlosc').focus();
  });
});

function recalcMagIssueRazem() {
  const ilosc = parseFloat(document.getElementById('magIssueIlosc').value);
  if (isNaN(ilosc)) { document.getElementById('magIssueRazem').value = ''; return; }
  document.getElementById('magIssueRazem').value = magOpakToStored(ilosc, magIssuePickedProduct && magIssuePickedProduct.wielkoscOpak);
}
document.getElementById('magIssueIlosc').addEventListener('input', recalcMagIssueRazem);

document.getElementById('cancelMagIssueItemBtn').addEventListener('click', () => {
  magIssuePickedProduct = null;
  document.getElementById('magIssueSearch').value = '';
  document.getElementById('magIssueQtyField').style.display = 'none';
});

document.getElementById('confirmMagIssueItemBtn').addEventListener('click', () => {
  const ilosc = parseFloat(document.getElementById('magIssueIlosc').value);
  const razem = magOpakToStored(ilosc, magIssuePickedProduct && magIssuePickedProduct.wielkoscOpak);
  if (!magIssuePickedProduct) { showToast('Najpierw znajdź i wybierz produkt'); return; }
  if (isNaN(ilosc) || ilosc <= 0) { showToast('Podaj poprawną ilość wydaną'); return; }

  if (magState.blokadaUjemnych) {
    const dostepny = computeStock(magIssuePickedProduct).stanBiezacy - magPendingQtyForProduct(magIssuePickedProduct.id);
    if (razem > dostepny) {
      showToast(`Za mało na stanie — dostępne: ${dostepny} ${magIssuePickedProduct.jm || ''} (blokada stanów ujemnych jest włączona w Ustawieniach Magazynu)`);
      return;
    }
  }

  magState.pendingIssueItems.push({ productId: magIssuePickedProduct.id, iloscOpak: ilosc, iloscWydana: razem });
  renderPendingIssueItems();

  magIssuePickedProduct = null;
  document.getElementById('magIssueSearch').value = '';
  document.getElementById('magIssueQtyField').style.display = 'none';
  document.getElementById('magIssueSearch').focus();
});

function renderPendingIssueItems() {
  const wrap = document.getElementById('magIssueItemsList');
  const empty = document.getElementById('magIssueItemsEmpty');
  const items = magState.pendingIssueItems || [];
  if (!items.length) {
    wrap.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  wrap.innerHTML = items.map((item, idx) => {
    const p = findProduct(item.productId);
    return `
      <div class="picked-items-row">
        <span>${escapeHtml(productShortLabel(p))} — ${item.iloscOpak ?? item.iloscWydana} opak. → razem ${item.iloscWydana} ${escapeHtml(p ? p.jm || '' : '')}</span>
        <button class="btn danger" data-remove-pending-issue="${idx}">✕</button>
      </div>
    `;
  }).join('');
  wrap.querySelectorAll('[data-remove-pending-issue]').forEach(btn => {
    btn.addEventListener('click', () => {
      magState.pendingIssueItems.splice(+btn.dataset.removePendingIssue, 1);
      renderPendingIssueItems();
    });
  });
}

document.getElementById('saveMagIssueBtn').addEventListener('click', async () => {
  const items = magState.pendingIssueItems || [];
  if (!items.length) { showToast('Dodaj przynajmniej jedną pozycję'); return; }
  const data = document.getElementById('magIssueData').value || todayStr();
  const dzialCel = document.getElementById('magIssueDzial').value.trim();
  const wydal = document.getElementById('magIssueWydal').value.trim();
  const uwagi = document.getElementById('magIssueUwagi').value.trim();

  for (const item of items) {
    const issue = { data, productId: item.productId, iloscWydana: item.iloscWydana, iloscOpak: item.iloscOpak, dzialCel, wydal, uwagi };
    await DB.saveMagIssue(issue);
    magState.issues.push(issue);
  }

  magState.pendingIssueItems = [];
  closeMagIssueModal();
  renderMagIssues();
  renderMagStock();
  showToast(`Zapisano ${items.length} ${items.length === 1 ? 'wydanie' : 'wydań'}`);
});

// ----- Tryb edycji pojedynczej pozycji -----
document.getElementById('saveMagIssueEditBtn').addEventListener('click', async () => {
  const ilosc = parseFloat(document.getElementById('magIssueEditIlosc').value);
  if (isNaN(ilosc) || ilosc <= 0) { showToast('Podaj poprawną ilość wydaną'); return; }

  const issue = magState.issues.find(i => i.id === magState.editingIssueId);
  if (!issue) return;
  const nowaIloscWydana = magOpakToStored(ilosc, magIssueEditProduct && magIssueEditProduct.wielkoscOpak);

  if (magState.blokadaUjemnych && magIssueEditProduct) {
    // computeStock() już ma odjętą STARĄ wartość tego wydania (bo wciąż jest
    // w magState.issues) — trzeba ją doliczyć z powrotem, żeby sprawdzić ile
    // faktycznie jest dostępne dla NOWEJ wartości.
    const dostepny = computeStock(magIssueEditProduct).stanBiezacy + (Number(issue.iloscWydana) || 0);
    if (nowaIloscWydana > dostepny) {
      showToast(`Za mało na stanie — dostępne: ${dostepny} ${magIssueEditProduct.jm || ''} (blokada stanów ujemnych jest włączona w Ustawieniach Magazynu)`);
      return;
    }
  }

  issue.data = document.getElementById('magIssueEditData').value || todayStr();
  issue.iloscOpak = ilosc;
  issue.iloscWydana = nowaIloscWydana;
  issue.dzialCel = document.getElementById('magIssueEditDzial').value.trim();
  issue.wydal = document.getElementById('magIssueEditWydal').value.trim();
  issue.uwagi = document.getElementById('magIssueEditUwagi').value.trim();

  await DB.saveMagIssue(issue);
  closeMagIssueModal();
  renderMagIssues();
  renderMagStock();
  showToast('Wydanie zaktualizowane');
});

document.getElementById('deleteMagIssueBtn').addEventListener('click', async () => {
  if (!magState.editingIssueId) return;
  if (!confirm('Usunąć to wydanie?')) return;
  await DB.deleteMagIssue(magState.editingIssueId);
  magState.issues = magState.issues.filter(i => i.id !== magState.editingIssueId);
  closeMagIssueModal();
  renderMagIssues();
  renderMagStock();
  showToast('Wydanie usunięte');
});


const ORDER_STATUS_BADGE = {
  'Do akceptacji': 'warn',
  'Zaakceptowane': 'ok',
  'Odrzucone': 'bad'
};

function renderMagOrders() {
  const container = document.getElementById('magOrdersList');
  const empty = document.getElementById('magOrdersEmpty');
  const summary = document.getElementById('magOrdersSummary');
  const od = document.getElementById('magOrdersFilterOd').value;
  const doD = document.getElementById('magOrdersFilterDo').value;

  let list = magState.orders.slice();
  if (od) list = list.filter(o => (o.dataZamowienia || '') >= od);
  if (doD) list = list.filter(o => (o.dataZamowienia || '') <= doD);
  list.sort((a, b) => (b.dataZamowienia || '').localeCompare(a.dataZamowienia || '') || b.createdAt - a.createdAt);

  if (summary) summary.textContent = list.length ? `Zamówień: ${list.length}` : '';

  if (!list.length) { container.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  renderGroupedByDate(container, list, o => o.dataZamowienia, (o) => {
    const itemsCount = (o.items || []).length;
    const badgeClass = ORDER_STATUS_BADGE[o.status] || 'neutral';
    return `
      <div class="machine-item" data-id="${o.id}">
        <div>
          <div class="mname">${escapeHtml(o.nrZamowienia || 'Zamówienie bez numeru')}</div>
          <div class="mmeta">${escapeHtml(o.dostawca || 'brak dostawcy')} • ${itemsCount} poz.</div>
        </div>
        <span class="badge ${badgeClass}">${escapeHtml(o.status || 'Do akceptacji')}</span>
      </div>
    `;
  }, 'orders');

  container.querySelectorAll('.machine-item').forEach(el => {
    el.addEventListener('click', () => openMagOrderModal(el.dataset.id));
  });
}

document.getElementById('addOrderBtn').addEventListener('click', () => openMagOrderModal(null));

['magOrdersFilterOd', 'magOrdersFilterDo'].forEach(id => {
  document.getElementById(id).addEventListener('change', renderMagOrders);
});
document.getElementById('magOrdersClearFiltersBtn').addEventListener('click', () => {
  document.getElementById('magOrdersFilterOd').value = '';
  document.getElementById('magOrdersFilterDo').value = '';
  renderMagOrders();
});

function renderOrderItemsList() {
  const wrap = document.getElementById('magOrderItemsList');
  if (!magState.currentOrderItems.length) {
    wrap.innerHTML = '<div class="hint">Brak pozycji — znajdź produkt poniżej, żeby dodać pierwszą.</div>';
    return;
  }
  wrap.innerHTML = magState.currentOrderItems.map((item, idx) => {
    const p = findProduct(item.productId);
    const razem = magOpakToStored(item.ilosc, p && p.wielkoscOpak);
    const razemInfo = (p && p.wielkoscOpak > 0) ? ` <span style="font-size:12px;color:var(--text-dim);">(razem ${razem} ${escapeHtml(p.jm || '')})</span>` : '';
    const uzasadnienie = item.uzasadnienie
      ? `<div style="font-size:11.5px;color:var(--text-dim);margin-top:2px;">🧮 ${escapeHtml(item.uzasadnienie)}</div>`
      : '';
    return `
      <div class="picked-items-row" data-idx="${idx}" style="flex-direction:column;align-items:stretch;gap:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span>${escapeHtml(productShortLabel(p))}${razemInfo}</span>
          <span style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <input type="number" step="any" class="mag-order-item-ilosc" data-idx="${idx}" value="${item.ilosc ?? ''}" style="width:70px;padding:6px;border:1px solid var(--border);border-radius:7px;">
            <span style="font-size:12px;color:var(--text-dim);">opak.</span>
            <button class="btn danger" data-remove-item="${idx}">✕</button>
          </span>
        </div>
        ${uzasadnienie}
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('.mag-order-item-ilosc').forEach(inp => {
    inp.addEventListener('input', () => {
      magState.currentOrderItems[+inp.dataset.idx].ilosc = parseFloat(inp.value) || 0;
    });
    inp.addEventListener('change', renderOrderItemsList);
  });
  wrap.querySelectorAll('[data-remove-item]').forEach(btn => {
    btn.addEventListener('click', () => {
      magState.currentOrderItems.splice(+btn.dataset.removeItem, 1);
      renderOrderItemsList();
    });
  });
}

let magOrderPickedProduct = null;

document.getElementById('magOrderSearch').addEventListener('input', (e) => {
  renderProductSuggestions(e.target.value, 'magOrderSuggestions', (product) => {
    magOrderPickedProduct = product;
    document.getElementById('magOrderSearch').value = product.nazwa;
    document.getElementById('magOrderSelectedProduct').textContent = `Wybrano: ${productFullLabel(product)}`;
    document.getElementById('magOrderItemIlosc').value = '';
    document.getElementById('magOrderQtyField').style.display = 'block';
    document.getElementById('magOrderItemIlosc').focus();
  });
});

document.getElementById('cancelMagOrderItemBtn').addEventListener('click', () => {
  magOrderPickedProduct = null;
  document.getElementById('magOrderSearch').value = '';
  document.getElementById('magOrderQtyField').style.display = 'none';
});

document.getElementById('confirmMagOrderItemBtn').addEventListener('click', () => {
  const ilosc = parseFloat(document.getElementById('magOrderItemIlosc').value);
  if (!magOrderPickedProduct) { showToast('Najpierw znajdź i wybierz produkt'); return; }
  if (isNaN(ilosc) || ilosc <= 0) { showToast('Podaj poprawną ilość'); return; }

  magState.currentOrderItems.push({ productId: magOrderPickedProduct.id, ilosc });
  renderOrderItemsList();

  magOrderPickedProduct = null;
  document.getElementById('magOrderSearch').value = '';
  document.getElementById('magOrderQtyField').style.display = 'none';
  document.getElementById('magOrderSearch').focus();
});

function openMagOrderModal(orderId) {
  magState.editingOrderId = orderId;
  const delBtn = document.getElementById('deleteMagOrderBtn');

  if (orderId) {
    const o = magState.orders.find(x => x.id === orderId);
    document.getElementById('magOrderData').value = o.dataZamowienia || todayStr();
    document.getElementById('magOrderNr').value = o.nrZamowienia || '';
    document.getElementById('magOrderZamawiajacy').value = o.zamawiajacy || '';
    document.getElementById('magOrderDlaKogo').value = o.dlaKogo || '';
    document.getElementById('magOrderDostawca').value = o.dostawca || '';
    document.getElementById('magOrderTermin').value = o.terminRealizacji || '';
    document.getElementById('magOrderStatus').value = o.status || 'Do akceptacji';
    magState.currentOrderItems = (o.items || []).map(it => ({ ...it }));
    delBtn.style.display = 'inline-block';
  } else {
    document.getElementById('magOrderData').value = todayStr();
    document.getElementById('magOrderNr').value = '';
    document.getElementById('magOrderZamawiajacy').value = currentUser ? (currentUser.displayName || currentUser.username) : '';
    document.getElementById('magOrderDlaKogo').value = '';
    document.getElementById('magOrderDostawca').value = '';
    document.getElementById('magOrderTermin').value = '';
    document.getElementById('magOrderStatus').value = 'Do akceptacji';
    magState.currentOrderItems = [];
    delBtn.style.display = 'none';
  }
  renderOrderItemsList();
  magOrderPickedProduct = null;
  document.getElementById('magOrderSearch').value = '';
  document.getElementById('magOrderSuggestions').style.display = 'none';
  document.getElementById('magOrderQtyField').style.display = 'none';
  document.getElementById('magOrderModalOverlay').classList.add('active');
}
function closeMagOrderModal() {
  document.getElementById('magOrderModalOverlay').classList.remove('active');
  magState.editingOrderId = null;
  magState.currentOrderItems = [];
}
document.getElementById('closeMagOrderModal').addEventListener('click', closeMagOrderModal);
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. Zamykanie: closeMagOrderModal()

document.getElementById('saveMagOrderBtn').addEventListener('click', async () => {
  const validItems = magState.currentOrderItems.filter(it => it.productId && it.ilosc > 0);
  if (!validItems.length) { showToast('Dodaj przynajmniej jedną pozycję z ilością większą od zera'); return; }

  let order;
  let isNew = false;
  if (magState.editingOrderId) {
    order = magState.orders.find(o => o.id === magState.editingOrderId);
  } else {
    order = {};
    isNew = true;
  }
  order.dataZamowienia = document.getElementById('magOrderData').value || todayStr();
  order.nrZamowienia = document.getElementById('magOrderNr').value.trim();
  order.zamawiajacy = document.getElementById('magOrderZamawiajacy').value.trim();
  order.dlaKogo = document.getElementById('magOrderDlaKogo').value.trim();
  order.dostawca = document.getElementById('magOrderDostawca').value.trim();
  order.terminRealizacji = document.getElementById('magOrderTermin').value;
  order.status = document.getElementById('magOrderStatus').value;
  order.items = validItems;

  await DB.saveMagOrder(order);
  if (isNew) magState.orders.push(order);

  renderMagOrders();
  if (isNew) {
    openMagOrderModal(null); // zostaw okno otwarte, gotowe na kolejne zamówienie
    showToast('Zamówienie zapisane — możesz dodać kolejne');
  } else {
    closeMagOrderModal();
    showToast('Zamówienie zapisane');
  }
});

document.getElementById('deleteMagOrderBtn').addEventListener('click', async () => {
  if (!magState.editingOrderId) return;
  if (!confirm('Usunąć to zamówienie?')) return;
  await DB.deleteMagOrder(magState.editingOrderId);
  magState.orders = magState.orders.filter(o => o.id !== magState.editingOrderId);
  closeMagOrderModal();
  renderMagOrders();
  showToast('Zamówienie usunięte');
});

// ===== Zamów braki automatycznie =====
document.getElementById('quickOrderBtn').addEventListener('click', () => {
  const toOrder = magState.products
    .map(p => ({ p, s: computeStock(p) }))
    .filter(x => x.s.status === 'DO ZAMÓWIENIA');

  if (!toOrder.length) {
    showToast('Wszystkie produkty mają wystarczający stan — nic do zamówienia.');
    return;
  }

  magState.editingOrderId = null;
  document.getElementById('magOrderData').value = todayStr();
  document.getElementById('magOrderNr').value = '';
  document.getElementById('magOrderZamawiajacy').value = currentUser ? (currentUser.displayName || currentUser.username) : '';
  document.getElementById('magOrderDlaKogo').value = '';
  document.getElementById('magOrderDostawca').value = '';
  document.getElementById('magOrderTermin').value = '';
  document.getElementById('magOrderStatus').value = 'Do akceptacji';
  magState.currentOrderItems = toOrder.map(x => {
    const brakujaco = x.s.sugerowana || 1;
    const ilosc = (x.p.wielkoscOpak && x.p.wielkoscOpak > 0) ? Math.ceil(brakujaco / x.p.wielkoscOpak) : brakujaco;
    return { productId: x.p.id, ilosc };
  });
  document.getElementById('deleteMagOrderBtn').style.display = 'none';
  magOrderPickedProduct = null;
  document.getElementById('magOrderSearch').value = '';
  document.getElementById('magOrderSuggestions').style.display = 'none';
  document.getElementById('magOrderQtyField').style.display = 'none';
  renderOrderItemsList();
  document.getElementById('magOrderModalOverlay').classList.add('active');
  showToast(`Wypełniono ${toOrder.length} pozycji na podstawie stanów poniżej minimum`);
});

// ===== Sugestia zamówienia na podstawie zużycia =====
// Nie jest to "uczenie maszynowe" — to prosta, przejrzysta statystyka policzona
// z rzeczywistej historii Wydań/Zużycia i ustawionego Stanu minimalnego: średnie
// dzienne zużycie w wybranym okresie × zadany zapas na przód, minus to, co jest
// obecnie na stanie. Produkty bez ŻADNEJ podstawy liczbowej (zerowy stan, brak
// zużycia w okresie, brak ustawionego minimum) trafiają do osobnej listy "do
// sprawdzenia" zamiast być pomijane w ciszy albo dostawać zgadywaną ilość.
document.getElementById('forecastOrderBtn').addEventListener('click', () => {
  const dzisiaj = todayStr();
  const data30dniTemu = new Date();
  data30dniTemu.setDate(data30dniTemu.getDate() - 30);
  document.getElementById('magForecastDo').value = dzisiaj;
  // Formatowanie datą lokalną (nie toISOString, które przez konwersję na UTC
  // potrafiło przesunąć datę o jeden dzień wstecz w naszej strefie czasowej).
  document.getElementById('magForecastOd').value = `${data30dniTemu.getFullYear()}-${String(data30dniTemu.getMonth() + 1).padStart(2, '0')}-${String(data30dniTemu.getDate()).padStart(2, '0')}`;
  document.getElementById('magForecastZapas').value = '14';
  document.getElementById('magForecastZapasInnaWrap').style.display = 'none';
  document.getElementById('magForecastZapasInna').value = '';
  document.getElementById('magForecastParamsStage').style.display = 'block';
  document.getElementById('magForecastResultsStage').style.display = 'none';
  document.getElementById('magForecastModalOverlay').classList.add('active');
});
document.getElementById('closeMagForecastModal').addEventListener('click', () => {
  document.getElementById('magForecastModalOverlay').classList.remove('active');
});
// Kliknięcie poza oknem NIE zamyka go — zamykanie tylko przez przycisk X.
document.getElementById('magForecastZapas').addEventListener('change', (e) => {
  document.getElementById('magForecastZapasInnaWrap').style.display = e.target.value === '__inna__' ? 'block' : 'none';
});
document.getElementById('magForecastBackBtn').addEventListener('click', () => {
  document.getElementById('magForecastResultsStage').style.display = 'none';
  document.getElementById('magForecastParamsStage').style.display = 'block';
});

function magForecastLiczDni(od, doD) {
  const a = new Date(od + 'T00:00:00');
  const b = new Date(doD + 'T00:00:00');
  const dni = Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1; // włącznie z obu dat
  return Math.max(1, dni);
}

// Zwraca { pewne, doSprawdzenia } — obie listy elementów { p, ilosc (w opak.
// — puste dla "do sprawdzenia"), uzasadnienie, dniPokrycia }.
// pewne: albo policzone z tempa zużycia w okresie, albo (gdy brak zużycia w
//   okresie, ale ustawiony jest Stan minimalny) z prostego progu — dokładnie
//   tak jak "Zamów braki automatycznie", więc te produkty nigdy nie znikają
//   tylko dlatego, że akurat nie było ruchu w wybranym okresie.
// doSprawdzenia: zerowy stan + brak zużycia w okresie + brak Stanu minimalnego
//   — nie ma żadnej liczby do policzenia, ale zerowy stan sam w sobie wart jest
//   uwagi, więc trafia do przeglądu zamiast zniknąć bez śladu.
function magComputeForecastSuggestions(od, doD, zapasDni, zrodloZuzycia) {
  const dniOkresu = magForecastLiczDni(od, doD);
  const pewne = [];
  const doSprawdzenia = [];
  const uzywajZewnetrznego = zrodloZuzycia === 'zewnetrzne';
  // Mapa indeks → dane zewnętrzne, budowana raz na start (nie w pętli produktów).
  const zewnMapa = new Map();
  if (uzywajZewnetrznego && magState.zewnetrzne && magState.zewnetrzne.produkty) {
    magState.zewnetrzne.produkty.forEach(z => zewnMapa.set(z.kod, z));
  }
  // Do informacji w uzasadnieniu "do sprawdzenia": czy towar był ostatnio
  // przyjmowany (30 dni wstecz od końca wybranego okresu).
  const przyjeciaOd = new Date(doD + 'T00:00:00');
  przyjeciaOd.setDate(przyjeciaOd.getDate() - 30);
  // Formatowanie datą lokalną (nie toISOString) — z tego samego powodu co wyżej.
  const przyjeciaOdStr = `${przyjeciaOd.getFullYear()}-${String(przyjeciaOd.getMonth() + 1).padStart(2, '0')}-${String(przyjeciaOd.getDate()).padStart(2, '0')}`;

  for (const p of magState.products) {
    const stock = computeStock(p);
    const jm = p.jm || '';
    let srDzienne = null;
    let zrodloOpis = '';

    if (uzywajZewnetrznego) {
      // Stan magazynowy ZAWSZE nasz (computeStock powyżej) — tylko tempo
      // zużycia bierzemy z zewnątrz, i tylko gdy jest jednoznaczne dopasowanie
      // po polu "Indeks".
      const zewn = p.indeks ? zewnMapa.get(p.indeks) : null;
      if (zewn && zewn.zuzycieDzien !== null && zewn.zuzycieDzien !== undefined && zewn.zuzycieDzien > 0) {
        srDzienne = zewn.zuzycieDzien;
        zrodloOpis = `zużycie z systemu 10.0.60.24 (indeks ${p.indeks}): ${srDzienne} ${jm}/dzień`;
      }
      // Brak dopasowania albo brak zużycia tam — spada do sekcji "do sprawdzenia" niżej.
    } else {
      const sumaZuzycia = magState.issues
        .filter(i => i.productId === p.id && i.data >= od && i.data <= doD)
        .reduce((s, i) => s + (Number(i.iloscWydana) || 0), 0);
      if (sumaZuzycia > 0) {
        srDzienne = sumaZuzycia / dniOkresu;
        zrodloOpis = `śr. zużycie: ${srDzienne.toFixed(2)} ${jm}/dzień (${sumaZuzycia} ${jm} w ${dniOkresu} dn.)`;
      }
    }

    if (srDzienne !== null) {
      const potrzebne = srDzienne * zapasDni;
      const brakuje = potrzebne - stock.stanBiezacy;
      if (brakuje <= 0) continue; // obecny stan i tak pokryje zadany zapas

      const iloscOpak = (p.wielkoscOpak && p.wielkoscOpak > 0) ? Math.ceil(brakuje / p.wielkoscOpak) : Math.ceil(brakuje);
      if (iloscOpak <= 0) continue;

      const dniPokrycia = Math.floor(stock.stanBiezacy / srDzienne);
      const uzasadnienie = `${zrodloOpis} · obecny zapas (nasz) starczy na ~${dniPokrycia} dni · cel: ${zapasDni} dni`;
      pewne.push({ p, ilosc: iloscOpak, uzasadnienie, dniPokrycia });
      continue;
    }

    // Brak zużycia (z wybranego źródła) — nie pomijamy w ciszy, sprawdzamy dalej.
    if (stock.stanMin > 0 && stock.stanBiezacy <= stock.stanMin) {
      // Nic nie było zużyte w tym oknie czasu, ale stan i tak jest poniżej
      // ustawionego minimum — to samo kryterium co "Zamów braki automatycznie".
      const brakuje = stock.stanMin - stock.stanBiezacy;
      const iloscOpak = (p.wielkoscOpak && p.wielkoscOpak > 0) ? Math.ceil(brakuje / p.wielkoscOpak) : Math.ceil(brakuje);
      if (iloscOpak > 0) {
        const uzasadnienie = `brak zużycia w wybranym źródle — sugestia wg ustawionego Stanu minimalnego (obecnie: ${stock.stanBiezacy} ${jm}, próg: ${stock.stanMin} ${jm})`;
        pewne.push({ p, ilosc: iloscOpak, uzasadnienie, dniPokrycia: 0 });
      }
      continue;
    }

    if (stock.stanBiezacy <= 0) {
      // Zerowy stan, brak zużycia w okresie, brak (albo zerowy) Stan minimalny
      // — nie ma żadnej liczby do wyliczenia ilości. Zamiast zgadywać albo
      // milczeć, pytamy: czy w ogóle uwzględnić ten towar w zamówieniu.
      const maOstatniePrzyjecia = magState.receipts.some(r => r.productId === p.id && r.data >= przyjeciaOdStr && r.data <= doD);
      const powodBrakuZuzycia = uzywajZewnetrznego
        ? (p.indeks ? 'brak dopasowania w danych z 10.0.60.24 albo brak tam wartości zużycia' : 'brak wypełnionego pola "Indeks" — nie da się dopasować do systemu zewnętrznego')
        : 'brak zużycia w wybranym okresie';
      const uzasadnienie = maOstatniePrzyjecia
        ? `stan: 0 ${jm}, ${powodBrakuZuzycia}, ale towar był ostatnio przyjmowany — sprawdź, czy dane są poprawne`
        : `stan: 0 ${jm}, ${powodBrakuZuzycia} i brak przyjęć w ostatnich 30 dniach — możliwe, że towar nie jest już potrzebny, a może po prostu zabrakło`;
      doSprawdzenia.push({ p, uzasadnienie });
    }
  }
  pewne.sort((a, b) => a.dniPokrycia - b.dniPokrycia); // najpilniejsze na górze
  doSprawdzenia.sort((a, b) => productShortLabel(a.p).localeCompare(productShortLabel(b.p), 'pl'));
  return { pewne, doSprawdzenia };
}

function magForecastRenderPewneRow(item, idx) {
  const jm = item.p.jm || '';
  return `
    <div class="picked-items-row" style="flex-direction:column;align-items:stretch;gap:4px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" class="magf-pewne-check" data-idx="${idx}" checked style="width:18px;height:18px;flex-shrink:0;">
        <span style="flex:1;">${escapeHtml(productShortLabel(item.p))}</span>
        <input type="number" step="any" class="magf-pewne-ilosc" data-idx="${idx}" value="${item.ilosc}" style="width:60px;padding:6px;border:1px solid var(--border);border-radius:7px;">
        <span style="font-size:12px;color:var(--text-dim);">opak.</span>
      </div>
      <div style="font-size:11.5px;color:var(--text-dim);margin-left:26px;">🧮 ${escapeHtml(item.uzasadnienie)}</div>
    </div>
  `;
}
function magForecastRenderSprawdzRow(item, idx) {
  const jm = item.p.jm || '';
  return `
    <div class="picked-items-row" style="flex-direction:column;align-items:stretch;gap:4px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" class="magf-sprawdz-check" data-idx="${idx}" style="width:18px;height:18px;flex-shrink:0;">
        <span style="flex:1;">${escapeHtml(productShortLabel(item.p))}</span>
        <input type="number" step="any" class="magf-sprawdz-ilosc" data-idx="${idx}" placeholder="ile?" style="width:60px;padding:6px;border:1px solid var(--border);border-radius:7px;">
        <span style="font-size:12px;color:var(--text-dim);">opak.</span>
      </div>
      <div style="font-size:11.5px;color:var(--text-dim);margin-left:26px;">⚠️ ${escapeHtml(item.uzasadnienie)}</div>
    </div>
  `;
}

let magForecastWyniki = { pewne: [], doSprawdzenia: [] };

document.getElementById('magForecastGenerateBtn').addEventListener('click', () => {
  const od = document.getElementById('magForecastOd').value;
  const doD = document.getElementById('magForecastDo').value;
  if (!od || !doD) { showToast('Podaj zakres dat'); return; }
  if (od > doD) { showToast('Data "od" musi być wcześniejsza niż "do"'); return; }

  const zapasWybor = document.getElementById('magForecastZapas').value;
  const zapasDni = zapasWybor === '__inna__'
    ? parseInt(document.getElementById('magForecastZapasInna').value)
    : parseInt(zapasWybor);
  if (!zapasDni || zapasDni <= 0) { showToast('Podaj poprawną liczbę dni zapasu'); return; }

  const zrodloZuzycia = document.getElementById('magForecastZrodloZuzycia').value;
  if (zrodloZuzycia === 'zewnetrzne' && (!magState.zewnetrzne || !magState.zewnetrzne.produkty || !magState.zewnetrzne.produkty.length)) {
    showToast('Brak jeszcze danych z systemu zewnętrznego — wejdź w zakładkę "Zewnętrzny" i pobierz je najpierw');
    return;
  }

  magForecastWyniki = magComputeForecastSuggestions(od, doD, zapasDni, zrodloZuzycia);
  const { pewne, doSprawdzenia } = magForecastWyniki;

  document.getElementById('magForecastPewneSection').style.display = pewne.length ? 'block' : 'none';
  document.getElementById('magForecastPewneList').innerHTML = pewne.map((it, idx) => magForecastRenderPewneRow(it, idx)).join('');
  document.getElementById('magForecastSprawdzSection').style.display = doSprawdzenia.length ? 'block' : 'none';
  document.getElementById('magForecastSprawdzList').innerHTML = doSprawdzenia.map((it, idx) => magForecastRenderSprawdzRow(it, idx)).join('');
  document.getElementById('magForecastEmptyHint').style.display = (!pewne.length && !doSprawdzenia.length) ? 'block' : 'none';

  document.getElementById('magForecastParamsStage').style.display = 'none';
  document.getElementById('magForecastResultsStage').style.display = 'block';
});

document.getElementById('magForecastCreateOrderBtn').addEventListener('click', () => {
  const items = [];
  document.querySelectorAll('.magf-pewne-check').forEach(cb => {
    if (!cb.checked) return;
    const idx = +cb.dataset.idx;
    const it = magForecastWyniki.pewne[idx];
    const iloscInput = document.querySelector(`.magf-pewne-ilosc[data-idx="${idx}"]`);
    const ilosc = parseFloat(iloscInput.value) || 0;
    if (ilosc > 0) items.push({ productId: it.p.id, ilosc, uzasadnienie: it.uzasadnienie });
  });
  document.querySelectorAll('.magf-sprawdz-check').forEach(cb => {
    if (!cb.checked) return;
    const idx = +cb.dataset.idx;
    const it = magForecastWyniki.doSprawdzenia[idx];
    const iloscInput = document.querySelector(`.magf-sprawdz-ilosc[data-idx="${idx}"]`);
    const ilosc = parseFloat(iloscInput.value) || 0;
    if (ilosc > 0) items.push({ productId: it.p.id, ilosc, uzasadnienie: 'dodane ręcznie z listy "do sprawdzenia" — ' + it.uzasadnienie });
  });

  if (!items.length) { showToast('Nie zaznaczono żadnej pozycji z ilością większą od zera'); return; }

  document.getElementById('magForecastModalOverlay').classList.remove('active');

  magState.editingOrderId = null;
  document.getElementById('magOrderData').value = todayStr();
  document.getElementById('magOrderNr').value = '';
  document.getElementById('magOrderZamawiajacy').value = currentUser ? (currentUser.displayName || currentUser.username) : '';
  document.getElementById('magOrderDlaKogo').value = '';
  document.getElementById('magOrderDostawca').value = '';
  document.getElementById('magOrderTermin').value = '';
  document.getElementById('magOrderStatus').value = 'Do akceptacji';
  magState.currentOrderItems = items;
  document.getElementById('deleteMagOrderBtn').style.display = 'none';
  magOrderPickedProduct = null;
  document.getElementById('magOrderSearch').value = '';
  document.getElementById('magOrderSuggestions').style.display = 'none';
  document.getElementById('magOrderQtyField').style.display = 'none';
  renderOrderItemsList();
  document.getElementById('magOrderModalOverlay').classList.add('active');
  showToast(`Wypełniono ${items.length} ${items.length === 1 ? 'pozycję' : 'pozycji'} — sprawdź i popraw przed zapisem`);
});

// ===== Eksport do Excel =====
document.getElementById('magExportBtn').addEventListener('click', async () => {
  if (typeof XLSX === 'undefined') {
    showToast('Ładowanie modułu Excel...');
    await loadXLSXLib();
  }
  exportMagazynToExcel();
});

function exportMagazynToExcel() {
  const wb = XLSX.utils.book_new();

  const stanData = magState.products.map(p => {
    const s = computeStock(p);
    const packCount = (p.wielkoscOpak && p.wielkoscOpak > 0) ? s.stanBiezacy / p.wielkoscOpak : '';
    return {
      'Produkt': p.nazwa || '',
      'Indeks': p.indeks || '',
      'Dostawca': p.dostawca || '',
      'JM': p.jm || '',
      'Wielkość opak.': p.wielkoscOpak || '',
      'Stan początkowy': s.stanPoczatkowy,
      'Przyjęcia (suma)': s.przyjecia,
      'Wydania (suma)': s.wydania,
      'Stan bieżący': s.stanBiezacy,
      'Ilość opakowań (szt.)': packCount === '' ? '' : Number.isInteger(packCount) ? packCount : +packCount.toFixed(1),
      'Stan minimalny': s.stanMin,
      'Status': s.status,
      'Sugerowana ilość do zamówienia': s.sugerowana
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stanData), 'Stan magazynowy');

  const produktyData = magState.products.map(p => ({
    'Indeks magazynowy': p.indeks || '',
    'Nazwa produktu': p.nazwa || '',
    'Dostawca': p.dostawca || '',
    'Wielkość opakowania': p.wielkoscOpak || '',
    'JM': p.jm || '',
    'Stan minimalny': p.stanMinimalny || 0,
    'Stan początkowy': p.stanPoczatkowy || 0,
    'Uwagi': p.uwagi || ''
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(produktyData), 'Baza produktów');

  const przyjeciaData = magState.receipts.map(r => {
    const p = findProduct(r.productId);
    const rodzajLabel = { opak: 'Opakowania', l: 'Litry', kg: 'Kilogramy' }[r.rodzaj] || '';
    return {
      'Data przyjęcia': r.data || '',
      'Produkt': productShortLabel(p),
      'Indeks': p ? p.indeks || '' : '',
      'Dostawca': p ? p.dostawca || '' : '',
      'Ilość (opak.)': r.ilosc || 0,
      'Rodzaj': rodzajLabel,
      'Razem': r.iloscRazem || 0,
      'JM': p ? p.jm || '' : '',
      'Nr partii': r.nrPartii || '',
      'Data produkcji': r.dataProdukcji || '',
      'Data przydatności': r.dataPrzydatnosci || '',
      'Uwagi': r.uwagi || ''
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(przyjeciaData), 'Przyjęcia');

  const wydaniaData = magState.issues.map(i => {
    const p = findProduct(i.productId);
    return {
      'Data wydania': i.data || '',
      'Produkt': productShortLabel(p),
      'Indeks': p ? p.indeks || '' : '',
      'JM': p ? p.jm || '' : '',
      'Ilość wydana': i.iloscWydana || 0,
      'Ilość (opak.)': i.iloscOpak ?? '',
      'Dział / Cel wydania': i.dzialCel || '',
      'Wydał': i.wydal || '',
      'Uwagi': i.uwagi || ''
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wydaniaData), 'Wydania');

  const zamowieniaRows = [];
  magState.orders.forEach(o => {
    (o.items || []).forEach(it => {
      const p = findProduct(it.productId);
      zamowieniaRows.push({
        'Nr zamówienia': o.nrZamowienia || '',
        'Data zamówienia': o.dataZamowienia || '',
        'Zamawiający': o.zamawiajacy || '',
        'Dla kogo / Dział': o.dlaKogo || '',
        'Dostawca': o.dostawca || '',
        'Termin realizacji': o.terminRealizacji || '',
        'Status': o.status || '',
        'Produkt': productShortLabel(p),
        'Ilość (opak.)': it.ilosc || 0,
        'Razem': magOpakToStored(it.ilosc, p && p.wielkoscOpak),
        'JM': p ? p.jm || '' : ''
      });
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(zamowieniaRows), 'Zamówienia');

  XLSX.writeFile(wb, `magazyn-${todayStr()}.xlsx`);
  showToast('Wyeksportowano do Excela');
}

// ===== PDF: formularz zamówienia (do wysłania mailem / WhatsApp itp.) =====
function loadJsPDFLib() {
  return new Promise((resolve, reject) => {
    if (window.jspdf && window.jspdf.jsPDF) return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Współdzielony z db.js/app.js wzorzec: spróbuj systemowego "Udostępnij" (maile, WhatsApp itp.),
// w razie braku wsparcia przeglądarki po prostu pobierz plik.
async function shareOrDownloadFile(blob, filename, mimeType, shareTitle, shareText) {
  const file = new File([blob], filename, { type: mimeType });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: shareTitle, text: shareText });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return true; // użytkownik świadomie anulował
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return false;
}

// jsPDF w domyślnej czcionce (Helvetica) nie obsługuje polskich znaków diakrytycznych —
// bez tego renderują się jako rozjechane/urwane znaki (widoczne np. w "Zamawiający",
// "Dział", "Ilość"). Zamieniamy je na najbliższe odpowiedniki ASCII przed wydrukiem.
function stripPolishDiacritics(str) {
  const map = {
    'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z',
    'Ą':'A','Ć':'C','Ę':'E','Ł':'L','Ń':'N','Ó':'O','Ś':'S','Ź':'Z','Ż':'Z'
  };
  return String(str == null ? '' : str).replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, ch => map[ch] || ch);
}

function buildOrderPdfBlob() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const t = (s) => stripPolishDiacritics(s); // skrót używany przy każdym doc.text(...)

  const nr = t(document.getElementById('magOrderNr').value.trim()) || '(bez numeru)';
  const data = document.getElementById('magOrderData').value || '';
  const zamawiajacy = t(document.getElementById('magOrderZamawiajacy').value.trim());
  const dlaKogo = t(document.getElementById('magOrderDlaKogo').value.trim());
  const dostawca = t(document.getElementById('magOrderDostawca').value.trim());
  const termin = document.getElementById('magOrderTermin').value || '';
  const status = t(document.getElementById('magOrderStatus').value);

  let y = 18;
  doc.setFontSize(16);
  doc.text(t('Formularz zamowienia'), 14, y);
  doc.setFontSize(10);
  doc.text('ZSZD Higieny', 196, y, { align: 'right' });
  y += 10;

  doc.setFontSize(11);
  const fields = [
    [t('Nr zamowienia'), nr],
    [t('Data zamowienia'), data],
    [t('Zamawiajacy'), zamawiajacy || '—'],
    [t('Dla kogo / Dzial'), dlaKogo || '—'],
    [t('Dostawca'), dostawca || '—'],
    [t('Termin realizacji'), termin || '—'],
    [t('Status'), status]
  ];
  fields.forEach(([label, value]) => {
    doc.setFont(undefined, 'bold');
    doc.text(`${label}:`, 14, y);
    doc.setFont(undefined, 'normal');
    doc.text(t(String(value)), 65, y);
    y += 7;
  });

  y += 4;
  doc.setDrawColor(180);
  doc.line(14, y, 196, y);
  y += 8;

  doc.setFont(undefined, 'bold');
  doc.text('Lp.', 14, y);
  doc.text('Produkt', 24, y);
  doc.text('Indeks', 120, y);
  doc.text(t('Ilosc'), 160, y);
  doc.text('JM', 180, y);
  y += 3;
  doc.line(14, y, 196, y);
  y += 6;
  doc.setFont(undefined, 'normal');

  magState.currentOrderItems.forEach((item, idx) => {
    if (y > 275) { doc.addPage(); y = 18; }
    const p = findProduct(item.productId);
    doc.text(String(idx + 1), 14, y);
    doc.text(t(p ? p.nazwa : '(usuniety produkt)').slice(0, 45), 24, y);
    doc.text(t(p ? (p.indeks || '—') : '—'), 120, y);
    doc.text(String(item.ilosc ?? ''), 160, y);
    doc.text(t(p ? (p.jm || '') : ''), 180, y);
    y += 7;
  });

  return doc.output('blob');
}

document.getElementById('sendMagOrderPdfBtn').addEventListener('click', async () => {
  if (!magState.currentOrderItems.length) { showToast('Dodaj przynajmniej jedną pozycję przed wysłaniem'); return; }
  showToast('Przygotowywanie PDF...');
  try {
    await loadJsPDFLib();
  } catch (e) {
    showToast('Nie udało się załadować generatora PDF — sprawdź połączenie z internetem');
    return;
  }
  const blob = buildOrderPdfBlob();
  const nr = document.getElementById('magOrderNr').value.trim() || 'bez-numeru';
  const filename = `zamowienie-${nr.replace(/[^a-z0-9]+/gi, '_')}-${todayStr()}.pdf`;
  const shared = await shareOrDownloadFile(blob, filename, 'application/pdf', 'Formularz zamówienia', `Zamówienie ${nr}`);
  showToast(shared ? 'Gotowe do wysłania' : 'PDF pobrany — załącz go w mailu ręcznie');
});

initMagazyn();

// ===== DANE Z SYSTEMU MAGAZYNOWEGO 10.0.60.24 (tylko-do-odczytu podgląd) =====
// Dane trafiają tu przez Firebase — skrypt uruchamiany raz w tygodniu na
// komputerze z dostępem do 10.0.60.24 wysyła je do kolekcji
// `magazynZewnetrzny`. Tutaj tylko pobieramy NAJNOWSZY wpis i pokazujemy —
// świadomie NIE scalamy z lokalnymi magProducts/computeStock, bo to jest
// osobny, równoległy system (patrz ustalenia z userem).
async function magPobierzDaneZewnetrzne() {
  if (!navigator.onLine) { showToast('Brak internetu'); return; }
  if (typeof fbInit !== 'function' || !fbInit()) { showToast('Brak połączenia z Firebase'); return; }
  try {
    const snap = await fbDb.collection('magazynZewnetrzny').orderBy('pobranoO', 'desc').limit(1).get();
    if (snap.empty) { showToast('Brak jeszcze żadnych danych — uruchom najpierw skrypt na 10.0.60.24'); return; }
    const dane = snap.docs[0].data();
    magState.zewnetrzne = dane;
    await DB.setSetting('magZewnetrzneCache', dane);
    renderMagZewnetrzny();
    renderMagPorownanie();
    showToast(`Pobrano dane z ${new Date(dane.pobranoO).toLocaleString('pl-PL')}`);
  } catch (e) {
    console.error('Błąd pobierania danych zewnętrznych:', e);
    showToast('Błąd pobierania — spróbuj ponownie');
  }
}

document.getElementById('magFetchZewnetrznyBtn') && document.getElementById('magFetchZewnetrznyBtn').addEventListener('click', magPobierzDaneZewnetrzne);

function renderMagZewnetrzny() {
  const container = document.getElementById('magZewnetrznyList');
  const empty = document.getElementById('magZewnetrznyEmpty');
  const info = document.getElementById('magZewnetrznyInfo');
  if (!container) return;
  const dane = magState.zewnetrzne;

  if (!dane || !dane.produkty || !dane.produkty.length) {
    container.innerHTML = '';
    if (empty) empty.style.display = 'block';
    if (info) info.textContent = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  if (info) info.textContent = `Ostatnio pobrano: ${new Date(dane.pobranoO).toLocaleString('pl-PL')}${dane.operacje ? ` · ${dane.operacje.length} ostatnich operacji` : ''}`;

  const filtrInput = document.getElementById('magZewnetrznyFiltr');
  const filtr = filtrInput ? filtrInput.value.trim().toLowerCase() : '';

  // Sortuj wg zapasu dni rosnąco — to, co się kończy najszybciej, na górze.
  let produkty = [...dane.produkty].sort((a, b) => {
    const za = (a.zapasDni === null || a.zapasDni === undefined) ? Infinity : a.zapasDni;
    const zb = (b.zapasDni === null || b.zapasDni === undefined) ? Infinity : b.zapasDni;
    return za - zb;
  });
  if (filtr) {
    produkty = produkty.filter(p =>
      (p.nazwa || '').toLowerCase().includes(filtr) || (p.kod || '').toLowerCase().includes(filtr)
    );
  }

  if (!produkty.length) {
    container.innerHTML = '<div class="hint">Brak wyników dla tego wyszukiwania.</div>';
    return;
  }

  container.innerHTML = produkty.map(p => {
    let kolor = 'inherit';
    if (p.zapasDni !== null && p.zapasDni !== undefined) {
      if (p.zapasDni < 7) kolor = '#c0392b';
      else if (p.zapasDni < 14) kolor = '#e08a3d';
    }
    const zapasTekst = (p.zapasDni !== null && p.zapasDni !== undefined) ? `${p.zapasDni} dni` : '—';
    const zuzycieTekst = (p.zuzycieDzien !== null && p.zuzycieDzien !== undefined) ? `, zużycie: ${p.zuzycieDzien}/dzień` : '';
    return `
      <div class="picked-items-row">
        <span><strong>${escapeHtml(p.kod)}</strong> ${escapeHtml(p.nazwa)} — stan: ${p.stan}${zuzycieTekst}</span>
        <span style="color:${kolor};font-weight:600;">${zapasTekst}</span>
      </div>
    `;
  }).join('');
}

document.getElementById('magZewnetrznyFiltr') && document.getElementById('magZewnetrznyFiltr').addEventListener('input', renderMagZewnetrzny);

// Wywoływane przez switchTab przy wejściu w zakładkę "Zewnętrzny" — odświeża
// listę i porównywarkę razem, jednym wywołaniem (odswiez mapping przyjmuje
// tylko jedną nazwę funkcji na zakładkę).
function renderMagZewnetrznyZakladka() {
  renderMagZewnetrzny();
  renderMagPorownanie();
}

// ===== PORÓWNYWARKA: NASZ STAN VS SYSTEM ZEWNĘTRZNY =====
// Dopasowanie po p.indeks (Baza produktów) ↔ zewn.kod (system 10.0.60.24).
// Stan magazynowy liczony ZAWSZE z computeStock() (nasze dane) — to jest
// tylko podgląd/porównanie, nie zmienia niczego lokalnie.
function magZewnetrznyOpisRoznicy(roznica) {
  if (roznica === 0) return { tekst: 'zgadza się', kolor: 'inherit' };
  if (roznica > 0) return { tekst: `u nas o ${roznica} więcej`, kolor: '#e08a3d' };
  return { tekst: `u nas o ${Math.abs(roznica)} mniej`, kolor: '#c0392b' };
}

function magZewnetrznyBudujPorownanie() {
  const dane = magState.zewnetrzne;
  const wynik = { dopasowane: [], lokalneBezDopasowania: [], zewnetrzneBezDopasowania: [] };
  if (!dane || !dane.produkty || !dane.produkty.length) return wynik;

  const zewnMapa = new Map();
  dane.produkty.forEach(z => zewnMapa.set(z.kod, z));
  const uzyteKody = new Set();

  magState.products.filter(p => p.active !== 0).forEach(p => {
    if (!p.indeks) return; // brak indeksu — nie próbujemy dopasować, pomijamy w porównaniu
    const zewn = zewnMapa.get(p.indeks);
    if (!zewn) { wynik.lokalneBezDopasowania.push(p); return; }
    uzyteKody.add(p.indeks);
    // WAŻNE: computeStock() liczy w jednostce ROZŁOŻONEJ (np. kg — ilość
    // opakowań razy rozmiar opakowania), a system 10.0.60.24 liczy w
    // sztukach/opakowaniach. Bez tego przeliczenia porównywaliśmy kg do
    // sztuk, co dawało bezsensowne, ogromne "różnice".
    const naszRozlozony = computeStock(p).stanBiezacy;
    const nasz = p.wielkoscOpak ? magStoredToOpak(naszRozlozony, p.wielkoscOpak) : naszRozlozony;
    const roznica = Math.round((nasz - zewn.stan) * 100) / 100;
    wynik.dopasowane.push({ p, zewn, nasz, roznica });
  });

  wynik.zewnetrzneBezDopasowania = dane.produkty.filter(z => !uzyteKody.has(z.kod));
  // Najbardziej rozbieżne pary na górze — to jest to, co warto sprawdzić najpierw.
  wynik.dopasowane.sort((a, b) => Math.abs(b.roznica) - Math.abs(a.roznica));
  return wynik;
}

function renderMagPorownanie() {
  const listaContainer = document.getElementById('magPorownanieList');
  const empty = document.getElementById('magPorownanieEmpty');
  const niedopasowaneContainer = document.getElementById('magPorownanieNiedopasowane');
  if (!listaContainer) return;

  const { dopasowane, lokalneBezDopasowania, zewnetrzneBezDopasowania } = magZewnetrznyBudujPorownanie();

  if (!dopasowane.length) {
    listaContainer.innerHTML = '';
    if (empty) empty.style.display = 'block';
  } else {
    if (empty) empty.style.display = 'none';
    listaContainer.innerHTML = dopasowane.map(({ p, zewn, nasz, roznica }) => {
      const { tekst, kolor } = magZewnetrznyOpisRoznicy(roznica);
      return `
        <div class="picked-items-row">
          <span><strong>${escapeHtml(p.nazwa)}</strong> <span class="hint">(${escapeHtml(p.indeks)})</span></span>
          <span>Nasz: ${nasz} szt · Ich: ${zewn.stan} szt — <span style="color:${kolor};font-weight:600;">${tekst}</span></span>
        </div>
      `;
    }).join('');
  }

  const razemNiedopasowane = lokalneBezDopasowania.length + zewnetrzneBezDopasowania.length;
  if (!niedopasowaneContainer) return;
  if (!razemNiedopasowane) {
    niedopasowaneContainer.innerHTML = '';
    return;
  }
  const listaLokalne = lokalneBezDopasowania.map(p =>
    `<div class="hint">• ${escapeHtml(p.nazwa)} (indeks: ${escapeHtml(p.indeks)}) — nie znaleziono takiego kodu w danych z 10.0.60.24</div>`
  ).join('');
  const listaZewnetrzne = zewnetrzneBezDopasowania.map(z =>
    `<div class="hint">• ${escapeHtml(z.kod)} ${escapeHtml(z.nazwa)} — brak u nas produktu z takim Indeksem</div>`
  ).join('');
  niedopasowaneContainer.innerHTML = `
    <div class="card">
      <h3 style="margin-bottom:8px;">Niedopasowane (${razemNiedopasowane})</h3>
      ${listaLokalne}
      ${listaZewnetrzne}
    </div>
  `;
}
