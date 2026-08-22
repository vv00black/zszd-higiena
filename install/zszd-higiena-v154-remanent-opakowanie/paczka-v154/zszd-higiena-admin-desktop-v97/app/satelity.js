// satelity.js — logika modułu Satelity (satelity CSM + inżektory)

const DEFAULT_MANUFACTURERS = ['FOAMICO', 'RADEX'];
const DEFAULT_SAT_FAULTS = [
  'Brak ciśnienia',
  'Nieszczelność / wyciek',
  'Nie reaguje na sygnał CSM',
  'Uszkodzona dysza',
  'Uszkodzony zawór'
];

let satState = {
  devices: [],
  partsStock: [],
  preServiceReports: [],
  postServiceReports: [],
  handoverProtocols: [],
  manufacturers: [],
  faultsList: [],
  currentDeviceId: null,
  editingDeviceId: null,
  pendingCloseupPhoto: null,
  pendingContextPhoto: null,
  pendingStockPartPhoto: null,
  postServicePartRows: 0,
  currentPreServiceFaults: new Set(),
  currentDocView: null // { type, id } for delete/print actions
};

// ===== Init =====
async function initSatelity() {
  satState.devices = await DB.getDevices();
  satState.partsStock = await DB.getAllPartsStock();
  satState.preServiceReports = await DB.getAllPreServiceReports();
  satState.postServiceReports = await DB.getAllPostServiceReports();
  satState.handoverProtocols = await DB.getAllHandoverProtocols();

  satState.manufacturers = await DB.getSetting('manufacturers', null);
  if (!satState.manufacturers) {
    satState.manufacturers = DEFAULT_MANUFACTURERS.slice();
    await DB.setSetting('manufacturers', satState.manufacturers);
  }

  satState.faultsList = await DB.getSetting('satFaultsList', null);
  if (!satState.faultsList) {
    satState.faultsList = DEFAULT_SAT_FAULTS.slice();
    await DB.setSetting('satFaultsList', satState.faultsList);
  }

  document.getElementById('preServiceDate').value = todayStr();
  document.getElementById('postServiceDate').value = todayStr();
  document.getElementById('handoverDate').value = todayStr();

  renderDeviceList();
  renderManufacturerSelect();
  renderManufacturerSettings();
  renderSatFaultsSettings();
  renderPartsStockList();
  renderAllReportsList();
}

// ===== DEVICES (Satelity + Inżektory) =====
function deviceTypeLabel(type) {
  return type === 'inzektor' ? 'Inżektor' : 'Satelita';
}

function renderDeviceStats() {
  const total = satState.devices.length;
  const satelity = satState.devices.filter(d => d.type === 'satelita').length;
  const inzektory = satState.devices.filter(d => d.type === 'inzektor').length;

  document.getElementById('deviceStats').innerHTML = `
    <div class="stat-box"><div class="num">${total}</div><div class="lbl">Wszystkie urządzenia</div></div>
    <div class="stat-box"><div class="num">${satelity}</div><div class="lbl">Satelity</div></div>
    <div class="stat-box"><div class="num">${inzektory}</div><div class="lbl">Inżektory</div></div>
  `;
}

function deviceDisplayName(d) {
  const parts = [d.name];
  if (d.nr) parts.push('#' + d.nr);
  return parts.join(' ');
}

function renderDeviceList() {
  renderDeviceStats();
  const typeFilter = document.getElementById('deviceFilterType').value;
  const search = document.getElementById('deviceFilterSearch').value.toLowerCase();

  let list = satState.devices.slice().sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  if (typeFilter) list = list.filter(d => d.type === typeFilter);
  if (search) list = list.filter(d =>
    d.name.toLowerCase().includes(search) ||
    (d.nr || '').toLowerCase().includes(search) ||
    (d.location || '').toLowerCase().includes(search)
  );

  const container = document.getElementById('deviceList');
  const empty = document.getElementById('devicesEmpty');

  if (list.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = list.map(d => {
    const typeBadgeClass = d.type === 'inzektor' ? 'warn' : 'neutral';
    return `
      <div class="machine-item" data-id="${d.id}">
        <div>
          <div class="mname">${escapeHtml(deviceDisplayName(d))}</div>
          <div class="mmeta">${escapeHtml(d.manufacturer || 'Brak producenta')} • ${escapeHtml(d.location || 'Brak lokalizacji')}</div>
        </div>
        <span class="badge ${typeBadgeClass}">${deviceTypeLabel(d.type)}</span>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.machine-item').forEach(el => {
    el.addEventListener('click', () => openDeviceDetail(el.dataset.id));
  });
}

document.getElementById('deviceFilterType').addEventListener('change', renderDeviceList);
document.getElementById('deviceFilterSearch').addEventListener('input', renderDeviceList);

document.getElementById('addDeviceFab').addEventListener('click', () => openDeviceModal(null));

function renderManufacturerSelect() {
  const sel = document.getElementById('deviceManufacturer');
  const current = sel.value;
  sel.innerHTML = satState.manufacturers.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('') +
    '<option value="__inny__">Inny (wpisz)...</option>';
  sel.value = current || satState.manufacturers[0] || '__inny__';
}

document.getElementById('deviceManufacturer').addEventListener('change', (e) => {
  const wrap = document.getElementById('deviceManufacturerCustomWrap');
  wrap.style.display = e.target.value === '__inny__' ? 'block' : 'none';
});

function openDeviceModal(deviceId) {
  satState.editingDeviceId = deviceId;
  const titleEl = document.getElementById('deviceModalTitle');
  const delBtn = document.getElementById('deleteDeviceBtn');
  renderManufacturerSelect();

  if (deviceId) {
    const d = satState.devices.find(x => x.id === deviceId);
    titleEl.textContent = 'Edytuj urządzenie';
    document.getElementById('deviceType').value = d.type || 'satelita';
    document.getElementById('deviceName').value = d.name || '';
    document.getElementById('deviceNr').value = d.nr || '';
    document.getElementById('deviceLocation').value = d.location || '';
    document.getElementById('deviceNote').value = d.note || '';

    const isKnownManufacturer = satState.manufacturers.includes(d.manufacturer);
    if (d.manufacturer && !isKnownManufacturer) {
      document.getElementById('deviceManufacturer').value = '__inny__';
      document.getElementById('deviceManufacturerCustomWrap').style.display = 'block';
      document.getElementById('deviceManufacturerCustom').value = d.manufacturer;
    } else {
      document.getElementById('deviceManufacturer').value = d.manufacturer || satState.manufacturers[0];
      document.getElementById('deviceManufacturerCustomWrap').style.display = 'none';
      document.getElementById('deviceManufacturerCustom').value = '';
    }
    delBtn.style.display = 'inline-block';
  } else {
    titleEl.textContent = 'Nowe urządzenie';
    document.getElementById('deviceType').value = 'satelita';
    document.getElementById('deviceName').value = '';
    document.getElementById('deviceNr').value = '';
    document.getElementById('deviceLocation').value = '';
    document.getElementById('deviceNote').value = '';
    document.getElementById('deviceManufacturerCustomWrap').style.display = 'none';
    document.getElementById('deviceManufacturerCustom').value = '';
    delBtn.style.display = 'none';
  }
  document.getElementById('deviceModalOverlay').classList.add('active');
}
function closeDeviceModal() {
  document.getElementById('deviceModalOverlay').classList.remove('active');
  satState.editingDeviceId = null;
}
document.getElementById('closeDeviceModal').addEventListener('click', closeDeviceModal);
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. Zamykanie: closeDeviceModal()

document.getElementById('saveDeviceBtn').addEventListener('click', async () => {
  const name = document.getElementById('deviceName').value.trim();
  if (!name) { showToast('Podaj nazwę urządzenia'); return; }

  let manufacturer = document.getElementById('deviceManufacturer').value;
  if (manufacturer === '__inny__') {
    manufacturer = document.getElementById('deviceManufacturerCustom').value.trim();
    if (manufacturer && !satState.manufacturers.includes(manufacturer)) {
      satState.manufacturers.push(manufacturer);
      await DB.setSetting('manufacturers', satState.manufacturers);
      renderManufacturerSettings();
    }
  }

  let device;
  let isNew = false;
  if (satState.editingDeviceId) {
    device = satState.devices.find(d => d.id === satState.editingDeviceId);
  } else {
    device = {};
    isNew = true;
  }
  device.type = document.getElementById('deviceType').value;
  device.name = name;
  device.manufacturer = manufacturer;
  device.nr = document.getElementById('deviceNr').value.trim();
  device.location = document.getElementById('deviceLocation').value.trim();
  device.note = document.getElementById('deviceNote').value.trim();

  await DB.saveDevice(device);
  if (isNew) satState.devices.push(device);

  renderDeviceList();
  renderManufacturerSelect();
  if (isNew) {
    openDeviceModal(null); // zostaw okno otwarte, gotowe na kolejne urządzenie
    showToast('Urządzenie zapisane — możesz dodać kolejne');
  } else {
    closeDeviceModal();
    showToast('Urządzenie zapisane');
  }
});

document.getElementById('deleteDeviceBtn').addEventListener('click', async () => {
  if (!satState.editingDeviceId) return;
  if (!confirm('Usunąć to urządzenie? Powiązane raporty serwisowe pozostaną w historii.')) return;
  await DB.deleteDevice(satState.editingDeviceId);
  satState.devices = satState.devices.filter(d => d.id !== satState.editingDeviceId);
  closeDeviceModal();
  renderDeviceList();
  switchTab('devices');
  showToast('Urządzenie usunięte');
});

// ===== DEVICE DETAIL =====
function openDeviceDetail(deviceId) {
  satState.currentDeviceId = deviceId;
  const d = satState.devices.find(x => x.id === deviceId);
  if (!d) return;

  const typeBadgeClass = d.type === 'inzektor' ? 'warn' : 'neutral';
  document.getElementById('deviceDetailHeader').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <h2 style="margin-bottom:4px;">${escapeHtml(deviceDisplayName(d))} <span class="badge ${typeBadgeClass}">${deviceTypeLabel(d.type)}</span></h2>
        <div class="hint">${escapeHtml(d.manufacturer || 'Brak producenta')} • ${escapeHtml(d.location || 'Brak lokalizacji')}</div>
        ${d.note ? `<div class="hint" style="margin-top:6px;">${escapeHtml(d.note)}</div>` : ''}
      </div>
      <button class="icon-btn" id="editDeviceBtn" title="Edytuj">✏️</button>
    </div>
  `;
  document.getElementById('editDeviceBtn').addEventListener('click', () => openDeviceModal(deviceId));

  // Photos
  const closeupPreview = document.getElementById('deviceCloseupPreview');
  const contextPreview = document.getElementById('deviceContextPreview');
  satState.pendingCloseupPhoto = null;
  satState.pendingContextPhoto = null;
  document.getElementById('deviceCloseupPhoto').value = '';
  document.getElementById('deviceContextPhoto').value = '';

  if (d.closeupPhoto) {
    closeupPreview.src = d.closeupPhoto;
    closeupPreview.style.display = 'block';
  } else {
    closeupPreview.style.display = 'none';
  }
  if (d.contextPhoto) {
    contextPreview.src = d.contextPhoto;
    contextPreview.style.display = 'block';
  } else {
    contextPreview.style.display = 'none';
  }

  renderDeviceDocsHistory(deviceId);

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-device-detail').classList.add('active');
}

document.getElementById('backToDevices').addEventListener('click', () => switchTab('devices'));

document.getElementById('deviceCloseupPhoto').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await fileToDataUrl(file);
  satState.pendingCloseupPhoto = dataUrl;
  const preview = document.getElementById('deviceCloseupPreview');
  preview.src = dataUrl;
  preview.style.display = 'block';
});
document.getElementById('deviceContextPhoto').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await fileToDataUrl(file);
  satState.pendingContextPhoto = dataUrl;
  const preview = document.getElementById('deviceContextPreview');
  preview.src = dataUrl;
  preview.style.display = 'block';
});

document.getElementById('saveDevicePhotosBtn').addEventListener('click', async () => {
  if (!satState.currentDeviceId) return;
  const d = satState.devices.find(x => x.id === satState.currentDeviceId);
  if (!d) return;

  if (satState.pendingCloseupPhoto) d.closeupPhoto = satState.pendingCloseupPhoto;
  if (satState.pendingContextPhoto) d.contextPhoto = satState.pendingContextPhoto;

  await DB.saveDevice(d);
  showToast('Zdjęcia zapisane');
});

// ===== MANUFACTURER SETTINGS =====
function renderManufacturerSettings() {
  const container = document.getElementById('manufacturerSettingsList');
  container.innerHTML = satState.manufacturers.map((m, idx) => `
    <div class="checklist-item">
      <div class="ctext">${escapeHtml(m)}</div>
      <button class="btn small danger" data-remove-mfr-idx="${idx}">Usuń</button>
    </div>
  `).join('');

  container.querySelectorAll('[data-remove-mfr-idx]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.removeMfrIdx);
      if (!confirm('Usunąć tego producenta z listy? Istniejące urządzenia zachowają przypisaną nazwę.')) return;
      satState.manufacturers.splice(idx, 1);
      await DB.setSetting('manufacturers', satState.manufacturers);
      renderManufacturerSettings();
      renderManufacturerSelect();
      showToast('Producent usunięty z listy');
    });
  });
}

function renderSatFaultsSettings() {
  const container = document.getElementById('satFaultsSettingsList');
  if (!container) return;
  container.innerHTML = satState.faultsList.map((f, idx) => `
    <div class="checklist-item">
      <div class="ctext">${escapeHtml(f)}</div>
      <button class="btn small danger" data-remove-fault-idx="${idx}">Usuń</button>
    </div>
  `).join('');

  container.querySelectorAll('[data-remove-fault-idx]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.removeFaultIdx);
      if (!confirm('Usunąć tę usterkę z katalogu? Nie wpłynie to na już zapisane raporty.')) return;
      satState.faultsList.splice(idx, 1);
      await DB.setSetting('satFaultsList', satState.faultsList);
      renderSatFaultsSettings();
      showToast('Usterka usunięta z katalogu');
    });
  });
}

document.getElementById('addSatFaultBtn').addEventListener('click', async () => {
  const input = document.getElementById('newSatFault');
  const val = input.value.trim();
  if (!val) return;
  if (satState.faultsList.includes(val)) { showToast('Ta usterka już jest na liście'); return; }
  satState.faultsList.push(val);
  await DB.setSetting('satFaultsList', satState.faultsList);
  input.value = '';
  renderSatFaultsSettings();
  showToast('Usterka dodana do katalogu');
});

document.getElementById('addManufacturerBtn').addEventListener('click', async () => {
  const input = document.getElementById('newManufacturer');
  const val = input.value.trim();
  if (!val) return;
  if (satState.manufacturers.includes(val)) { showToast('Ten producent już jest na liście'); return; }
  satState.manufacturers.push(val);
  await DB.setSetting('manufacturers', satState.manufacturers);
  input.value = '';
  renderManufacturerSettings();
  renderManufacturerSelect();
  showToast('Producent dodany');
});

// ===== PARTS STOCK (baza części zamiennych) =====
let editingStockPartId = null;
let currentStockPartHistoryId = null;

document.getElementById('stockPartPhoto').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) { satState.pendingStockPartPhoto = null; return; }
  const dataUrl = await fileToDataUrl(file);
  satState.pendingStockPartPhoto = dataUrl;
  const preview = document.getElementById('stockPartPhotoPreview');
  preview.src = dataUrl;
  preview.style.display = 'block';
});

function resetStockPartForm() {
  editingStockPartId = null;
  document.getElementById('stockPartFormTitle').textContent = 'Nowa część w bazie';
  document.getElementById('saveStockPartBtn').textContent = 'Zapisz część';
  document.getElementById('cancelStockPartEditBtn').style.display = 'none';
  document.getElementById('stockPartName').value = '';
  document.getElementById('stockPartQty').value = '1';
  document.getElementById('stockPartNote').value = '';
  document.getElementById('stockPartPhoto').value = '';
  document.getElementById('stockPartPhotoPreview').style.display = 'none';
  satState.pendingStockPartPhoto = null;
}

function openStockPartForEdit(partId) {
  const p = satState.partsStock.find(x => x.id === partId);
  if (!p) return;
  editingStockPartId = partId;
  document.getElementById('stockPartFormTitle').textContent = 'Edytuj część';
  document.getElementById('saveStockPartBtn').textContent = 'Zapisz zmiany';
  document.getElementById('cancelStockPartEditBtn').style.display = 'inline-block';

  document.getElementById('stockPartName').value = p.name || '';
  document.getElementById('stockPartQty').value = p.quantity != null ? p.quantity : 0;
  document.getElementById('stockPartNote').value = p.note || '';
  document.getElementById('stockPartPhoto').value = '';
  satState.pendingStockPartPhoto = null;
  const preview = document.getElementById('stockPartPhotoPreview');
  if (p.photo) {
    preview.src = p.photo;
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }

  document.getElementById('stockPartFormTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('cancelStockPartEditBtn').addEventListener('click', resetStockPartForm);

document.getElementById('saveStockPartBtn').addEventListener('click', async () => {
  const name = document.getElementById('stockPartName').value.trim();
  if (!name) { showToast('Podaj nazwę części'); return; }

  let part;
  let isNew = false;
  if (editingStockPartId) {
    part = satState.partsStock.find(p => p.id === editingStockPartId);
    if (!part) { resetStockPartForm(); return; }
  } else {
    part = {};
    isNew = true;
  }

  part.name = name;
  part.quantity = parseInt(document.getElementById('stockPartQty').value) || 0;
  if (satState.pendingStockPartPhoto) part.photo = satState.pendingStockPartPhoto;
  part.note = document.getElementById('stockPartNote').value.trim();

  const saved = await DB.savePartStock(part);
  if (isNew) satState.partsStock.push(saved);

  const wasEditing = !!editingStockPartId;
  resetStockPartForm();
  renderPartsStockList();
  showToast(wasEditing ? 'Część zaktualizowana' : 'Część zapisana — dodaj teraz zdarzenia (zamówienie, przyjęcie...)');
});

function stockPartLatestEventSummary(part) {
  const events = DB.sortedPartEvents(part);
  if (!events.length) return 'Brak zdarzeń';
  const last = events[events.length - 1];
  return `${DB.PART_EVENT_TYPES[last.type]} — ${fmtDate(last.date)}`;
}

function renderPartsStockList() {
  const search = document.getElementById('stockFilterSearch').value.toLowerCase();
  const eventTypeFilter = document.getElementById('stockFilterEventType').value;
  const dateFrom = document.getElementById('stockFilterDateFrom').value;
  const dateTo = document.getElementById('stockFilterDateTo').value;

  let list = satState.partsStock.slice().sort((a, b) => b.createdAt - a.createdAt);

  // Wyszukiwanie po nazwie — zawsze działa niezależnie
  if (search) list = list.filter(p => p.name.toLowerCase().includes(search));

  // Filtr zdarzeń i dat — osobno od wyszukiwania
  const hasEventFilter = eventTypeFilter !== '';
  const hasDateFilter = dateFrom !== '' || dateTo !== '';

  if (hasEventFilter || hasDateFilter) {
    list = list.filter(p => {
      const events = p.events || [];
      if (events.length === 0) return !hasEventFilter;
      return events.some(e => {
        if (hasEventFilter && e.type !== eventTypeFilter) return false;
        if (dateFrom && e.date < dateFrom) return false;
        if (dateTo && e.date > dateTo) return false;
        return true;
      });
    });
  }

  const container = document.getElementById('partsStockList');
  const empty = document.getElementById('partsStockEmpty');

  if (list.length === 0) {
    container.innerHTML = '';
    const hasAnyFilter = search || eventTypeFilter !== '' || dateFrom || dateTo;
    const msgEl = document.getElementById('partsStockEmptyMsg');
    if (msgEl) msgEl.textContent = hasAnyFilter
      ? 'Brak części pasujących do filtrów. Kliknij "✕ Wyczyść filtry" aby zobaczyć wszystkie.'
      : 'Baza części zamiennych jest pusta.';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = list.map(p => {
    const qtyColor = p.quantity === 0 ? 'var(--bad)' : p.quantity <= 2 ? 'var(--warn)' : 'var(--ok)';
    const leadTime = DB.calcLeadTimeDays(p);
    return `
      <div class="part-card">
        ${p.photo ? `<img src="${p.photo}" alt="">` : '<div class="no-photo">Brak zdjęcia</div>'}
        <div class="part-info">
          <div class="pname">${escapeHtml(p.name)}</div>
          <div class="pmeta">
            Stan: <span style="color:${qtyColor};font-weight:700;">${p.quantity}</span> szt.
            <br>${escapeHtml(stockPartLatestEventSummary(p))}
            ${leadTime !== null ? '<br>Czas realizacji zamówienia: ' + leadTime + ' dni' : ''}
            ${p.note ? '<br>' + escapeHtml(p.note) : ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-self:flex-start;">
          <button class="btn small secondary" data-stock-adjust="${p.id}" data-delta="1">+1</button>
          <button class="btn small secondary" data-stock-adjust="${p.id}" data-delta="-1">−1</button>
          <button class="btn small secondary" data-stock-history="${p.id}">Historia</button>
          <button class="btn small secondary" data-stock-edit="${p.id}">Edytuj</button>
          <button class="btn small danger" data-stock-delete="${p.id}">Usuń</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-stock-adjust]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.stockAdjust;
      const delta = parseInt(btn.dataset.delta);
      const updated = await DB.adjustPartStockQuantity(id, delta);
      if (updated) {
        const idx = satState.partsStock.findIndex(p => p.id === id);
        if (idx >= 0) satState.partsStock[idx] = updated;
        renderPartsStockList();
      }
    });
  });
  container.querySelectorAll('[data-stock-history]').forEach(btn => {
    btn.addEventListener('click', () => openStockPartHistory(btn.dataset.stockHistory));
  });
  container.querySelectorAll('[data-stock-edit]').forEach(btn => {
    btn.addEventListener('click', () => openStockPartForEdit(btn.dataset.stockEdit));
  });
  container.querySelectorAll('[data-stock-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Usunąć tę część z bazy? Usunie to również całą jej historię zdarzeń.')) return;
      await DB.deletePartStock(btn.dataset.stockDelete);
      satState.partsStock = satState.partsStock.filter(p => p.id !== btn.dataset.stockDelete);
      if (editingStockPartId === btn.dataset.stockDelete) resetStockPartForm();
      renderPartsStockList();
    });
  });
}

document.getElementById('stockFilterSearch').addEventListener('input', renderPartsStockList);
document.getElementById('stockFilterEventType').addEventListener('change', renderPartsStockList);
document.getElementById('stockFilterDateFrom').addEventListener('change', renderPartsStockList);
document.getElementById('stockFilterDateTo').addEventListener('change', renderPartsStockList);

document.getElementById('clearStockFiltersBtn').addEventListener('click', () => {
  document.getElementById('stockFilterSearch').value = '';
  document.getElementById('stockFilterEventType').value = '';
  document.getElementById('stockFilterDateFrom').value = '';
  document.getElementById('stockFilterDateTo').value = '';
  renderPartsStockList();
});

// ----- Stock part history modal -----
function renderStockPartEventDeviceSelect() {
  const sel = document.getElementById('stockPartEventDevice');
  const current = sel.value;
  const sorted = satState.devices.slice().sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  sel.innerHTML = '<option value="">— nie przypisano —</option>' +
    sorted.map(d => `<option value="${d.id}">${escapeHtml(deviceDisplayName(d))}</option>`).join('');
  sel.value = current;
}

function openStockPartHistory(partId) {
  currentStockPartHistoryId = partId;
  const p = satState.partsStock.find(x => x.id === partId);
  if (!p) return;

  document.getElementById('stockPartHistoryTitle').textContent = 'Historia: ' + p.name;

  const leadTime = DB.calcLeadTimeDays(p);
  document.getElementById('stockPartHistoryLeadTime').textContent = leadTime !== null
    ? `Czas realizacji ostatniego zamówienia: ${leadTime} dni (zamówienie → przyjęcie na stan)`
    : '';

  renderStockPartHistoryList();
  document.getElementById('stockPartHistoryModalOverlay').classList.add('active');
}

function renderStockPartHistoryList() {
  const p = satState.partsStock.find(x => x.id === currentStockPartHistoryId);
  if (!p) return;
  const events = DB.sortedPartEvents(p).slice().reverse();

  const container = document.getElementById('stockPartHistoryList');
  const empty = document.getElementById('stockPartHistoryEmpty');

  if (events.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = events.map(e => {
    const dev = e.deviceId ? satState.devices.find(d => d.id === e.deviceId) : null;
    return `
      <div class="history-entry">
        <div class="hdate">${fmtDate(e.date)} — ${escapeHtml(DB.PART_EVENT_TYPES[e.type] || e.type)}${e.qty ? ' — <strong>' + e.qty + ' szt.</strong>' : ''}</div>
        ${dev ? `<div class="hsummary">Urządzenie: ${escapeHtml(deviceDisplayName(dev))}</div>` : ''}
        ${e.note ? `<div class="hsummary">${escapeHtml(e.note)}</div>` : ''}
        <div style="margin-top:6px;">
          <button class="btn small danger" data-stock-event-id="${e.id}">Usuń zdarzenie</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-stock-event-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Usunąć to zdarzenie z historii?')) return;
      p.events = (p.events || []).filter(e => e.id !== btn.dataset.stockEventId);
      await DB.savePartStock(p);
      renderStockPartHistoryList();
      renderPartsStockList();
    });
  });
}

document.getElementById('closeStockPartHistoryModal').addEventListener('click', () => {
  document.getElementById('stockPartHistoryModalOverlay').classList.remove('active');
});
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. (stockPartHistoryModalOverlay)

// Dynamiczna etykieta ilości zależna od typu zdarzenia
function updateStockEventQtyLabel(type) {
  const wrap = document.getElementById('stockPartEventQtyWrap');
  const label = document.getElementById('stockPartEventQtyLabel');
  if (type === 'order') {
    wrap.style.display = 'block';
    label.textContent = 'Ilość zamówiona (szt.)';
  } else if (type === 'received') {
    wrap.style.display = 'block';
    label.textContent = 'Ilość przyjęta na stan (szt.)';
  } else if (type === 'installed') {
    wrap.style.display = 'block';
    label.textContent = 'Ilość zamontowana (szt.)';
  } else if (type === 'dur') {
    wrap.style.display = 'block';
    label.textContent = 'Ilość przekazana do DUR (szt.)';
  }
}

document.getElementById('stockPartEventType').addEventListener('change', (e) => {
  updateStockEventQtyLabel(e.target.value);
});

function resetStockPartEventForm() {
  renderStockPartEventDeviceSelect();
  document.getElementById('stockPartEventType').value = 'order';
  document.getElementById('stockPartEventDate').value = todayStr();
  document.getElementById('stockPartEventQty').value = '1';
  document.getElementById('stockPartEventDevice').value = '';
  document.getElementById('stockPartEventNote').value = '';
  updateStockEventQtyLabel('order');
}
document.getElementById('addStockPartEventBtn').addEventListener('click', () => {
  resetStockPartEventForm();
  document.getElementById('stockPartEventModalOverlay').classList.add('active');
});
document.getElementById('closeStockPartEventModal').addEventListener('click', () => {
  document.getElementById('stockPartEventModalOverlay').classList.remove('active');
});
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. (stockPartEventModalOverlay)

document.getElementById('saveStockPartEventBtn').addEventListener('click', async () => {
  const p = satState.partsStock.find(x => x.id === currentStockPartHistoryId);
  if (!p) return;
  const date = document.getElementById('stockPartEventDate').value;
  if (!date) { showToast('Wybierz datę'); return; }

  const type = document.getElementById('stockPartEventType').value;
  const qty = parseInt(document.getElementById('stockPartEventQty').value) || 1;

  const event = {
    type,
    date,
    qty,
    deviceId: document.getElementById('stockPartEventDevice').value || null,
    note: document.getElementById('stockPartEventNote').value.trim()
  };
  DB.addPartEvent(p, event);

  // Automatyczna aktualizacja stanu quantity
  if (type === 'received') {
    p.quantity = (p.quantity || 0) + qty;
  } else if (type === 'installed' || type === 'dur') {
    p.quantity = Math.max(0, (p.quantity || 0) - qty);
  }

  await DB.savePartStock(p);

  renderStockPartHistoryList();
  renderPartsStockList();
  resetStockPartEventForm(); // zostaw okno otwarte, gotowe na kolejne zdarzenie
  showToast('Zdarzenie dodane, stan zaktualizowany — możesz dodać kolejne');
});

// Find or create a stock part by name (used when post-service report references a part not yet in stock)
async function findOrCreateStockPartByName(name) {
  let part = satState.partsStock.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (part) return part;
  part = { name, quantity: 0, note: 'Dodano automatycznie z raportu serwisowego' };
  const saved = await DB.savePartStock(part);
  satState.partsStock.push(saved);
  return saved;
}


// ===== PRE-SERVICE REPORT =====
function renderPreServiceFaultsCheckboxes() {
  satState.currentPreServiceFaults = new Set();
  const container = document.getElementById('preServiceFaultsContainer');

  if (satState.faultsList.length === 0) {
    container.innerHTML = '<div class="hint">Katalog usterek jest pusty. Dodaj pierwsze usterki w Ustawieniach.</div>';
    return;
  }

  container.innerHTML = satState.faultsList.map(item => `
    <label class="fault-checkbox-item">
      <input type="checkbox" data-fault-name="${escapeHtml(item)}">
      <div class="fctext">${escapeHtml(item)}</div>
    </label>
  `).join('');

  container.querySelectorAll('.fault-checkbox-item').forEach(el => {
    const checkbox = el.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => {
      const name = checkbox.dataset.faultName;
      if (checkbox.checked) {
        satState.currentPreServiceFaults.add(name);
        el.classList.add('checked');
      } else {
        satState.currentPreServiceFaults.delete(name);
        el.classList.remove('checked');
      }
    });
  });
}

function resetPreServiceForm() {
  document.getElementById('preServiceDate').value = todayStr();
  document.getElementById('preServiceProblems').value = '';
  document.getElementById('preServiceParts').value = '';
  document.getElementById('preServiceNote').value = '';
  renderPreServiceFaultsCheckboxes();
}
document.getElementById('newPreServiceBtn').addEventListener('click', () => {
  resetPreServiceForm();
  document.getElementById('preServiceModalOverlay').classList.add('active');
});
document.getElementById('closePreServiceModal').addEventListener('click', () => {
  document.getElementById('preServiceModalOverlay').classList.remove('active');
});
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. (preServiceModalOverlay)

document.getElementById('savePreServiceBtn').addEventListener('click', async () => {
  const date = document.getElementById('preServiceDate').value;
  if (!date) { showToast('Wybierz datę'); return; }
  if (!satState.currentDeviceId) return;

  const partsLines = document.getElementById('preServiceParts').value.split('\n').map(s => s.trim()).filter(Boolean);

  const report = {
    deviceId: satState.currentDeviceId,
    date,
    faults: Array.from(satState.currentPreServiceFaults),
    problems: document.getElementById('preServiceProblems').value.trim(),
    partsToReplace: partsLines,
    note: document.getElementById('preServiceNote').value.trim()
  };
  const saved = await DB.savePreServiceReport(report);
  satState.preServiceReports.push(saved);

  renderDeviceDocsHistory(satState.currentDeviceId);
  resetPreServiceForm(); // zostaw okno otwarte, gotowe na kolejny raport
  showToast('Raport przed-serwisowy zapisany — możesz dodać kolejny');
});

// ===== POST-SERVICE REPORT =====
document.getElementById('postServiceCompanyType').addEventListener('change', (e) => {
  document.getElementById('postServiceCompanyNameWrap').style.display = e.target.value === 'zewnetrzny' ? 'block' : 'none';
});

function addPostServicePartRow(prefillName) {
  const idx = satState.postServicePartRows++;
  const container = document.getElementById('postServicePartsContainer');
  const row = document.createElement('div');
  row.className = 'row';
  row.dataset.rowIdx = idx;
  row.innerHTML = `
    <div class="field" style="flex:2;">
      <input type="text" class="ps-part-name" placeholder="Nazwa części" value="${escapeHtml(prefillName || '')}">
    </div>
    <div class="field" style="flex:1;min-width:80px;">
      <input type="number" class="ps-part-qty" placeholder="Ilość" min="1" value="1">
    </div>
    <button class="btn small danger" data-remove-row="${idx}" style="align-self:flex-start;margin-top:2px;">✕</button>
  `;
  container.appendChild(row);
  row.querySelector('[data-remove-row]').addEventListener('click', () => row.remove());
}

document.getElementById('addPostServicePartRow').addEventListener('click', () => addPostServicePartRow());

function resetPostServiceForm() {
  document.getElementById('postServiceDate').value = todayStr();
  document.getElementById('postServiceCompanyType').value = 'wewnetrzny';
  document.getElementById('postServiceCompanyNameWrap').style.display = 'none';
  document.getElementById('postServiceCompanyName').value = '';
  document.getElementById('postServiceWork').value = '';
  document.getElementById('postServiceNote').value = '';
  document.getElementById('postServicePartsContainer').innerHTML = '';
  satState.postServicePartRows = 0;

  // Prefill from the latest pre-service report's planned parts, if any
  const latestPre = satState.preServiceReports
    .filter(r => r.deviceId === satState.currentDeviceId)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (latestPre && latestPre.partsToReplace && latestPre.partsToReplace.length) {
    latestPre.partsToReplace.forEach(line => {
      // Strip trailing "xN" quantity hints from the free-text line for the name field
      const match = line.match(/^(.*?)(?:\s*x(\d+))?$/i);
      addPostServicePartRow(match ? match[1].trim() : line);
    });
  } else {
    addPostServicePartRow();
  }
}
document.getElementById('newPostServiceBtn').addEventListener('click', () => {
  resetPostServiceForm();
  document.getElementById('postServiceModalOverlay').classList.add('active');
});
document.getElementById('closePostServiceModal').addEventListener('click', () => {
  document.getElementById('postServiceModalOverlay').classList.remove('active');
});
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. (postServiceModalOverlay)

document.getElementById('savePostServiceBtn').addEventListener('click', async () => {
  const date = document.getElementById('postServiceDate').value;
  if (!date) { showToast('Wybierz datę'); return; }
  if (!satState.currentDeviceId) return;

  const companyType = document.getElementById('postServiceCompanyType').value;
  const companyName = companyType === 'zewnetrzny' ? document.getElementById('postServiceCompanyName').value.trim() : '';

  const partRows = Array.from(document.querySelectorAll('#postServicePartsContainer .row')).map(row => ({
    name: row.querySelector('.ps-part-name').value.trim(),
    qty: parseInt(row.querySelector('.ps-part-qty').value) || 1
  })).filter(r => r.name);

  const report = {
    deviceId: satState.currentDeviceId,
    date,
    companyType,
    companyName,
    work: document.getElementById('postServiceWork').value.trim(),
    parts: partRows,
    note: document.getElementById('postServiceNote').value.trim()
  };
  const saved = await DB.savePostServiceReport(report);
  satState.postServiceReports.push(saved);

  // Connect to parts stock: decrease quantity for each replaced part
  for (const row of partRows) {
    const stockPart = await findOrCreateStockPartByName(row.name);
    const updated = await DB.adjustPartStockQuantity(stockPart.id, -row.qty);
    if (updated) {
      const idx = satState.partsStock.findIndex(p => p.id === stockPart.id);
      if (idx >= 0) satState.partsStock[idx] = updated;
    }
  }
  renderPartsStockList();

  renderDeviceDocsHistory(satState.currentDeviceId);
  resetPostServiceForm(); // zostaw okno otwarte, gotowe na kolejny raport
  showToast('Raport po-serwisowy zapisany, stan części zaktualizowany — możesz dodać kolejny');
});

// ===== HANDOVER PROTOCOL =====
document.getElementById('newHandoverBtn').addEventListener('click', () => {
  document.getElementById('handoverDate').value = todayStr();
  document.getElementById('handoverCompany').value = '';
  document.getElementById('handoverPartName').value = '';
  document.getElementById('handoverReason').value = '';
  document.getElementById('handoverFromPerson').value = '';
  document.getElementById('handoverToPerson').value = '';
  document.getElementById('handoverModalOverlay').classList.add('active');
});
document.getElementById('closeHandoverModal').addEventListener('click', () => {
  document.getElementById('handoverModalOverlay').classList.remove('active');
});
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. (handoverModalOverlay)

document.getElementById('saveHandoverBtn').addEventListener('click', async () => {
  const date = document.getElementById('handoverDate').value;
  const partName = document.getElementById('handoverPartName').value.trim();
  if (!date) { showToast('Wybierz datę'); return; }
  if (!partName) { showToast('Podaj nazwę przekazywanej części'); return; }
  if (!satState.currentDeviceId) return;

  const protocol = {
    deviceId: satState.currentDeviceId,
    date,
    company: document.getElementById('handoverCompany').value.trim(),
    partName,
    reason: document.getElementById('handoverReason').value.trim(),
    fromPerson: document.getElementById('handoverFromPerson').value.trim(),
    toPerson: document.getElementById('handoverToPerson').value.trim()
  };
  const saved = await DB.saveHandoverProtocol(protocol);
  satState.handoverProtocols.push(saved);

  document.getElementById('handoverModalOverlay').classList.remove('active');
  renderDeviceDocsHistory(satState.currentDeviceId);
  showToast('Protokół zapisany');
  openDocView('handover', saved.id);
});

// ===== DOCUMENT HISTORY (per device) =====
function getAllDocsForDevice(deviceId) {
  const pre = satState.preServiceReports.filter(r => r.deviceId === deviceId).map(r => ({ ...r, docType: 'pre' }));
  const post = satState.postServiceReports.filter(r => r.deviceId === deviceId).map(r => ({ ...r, docType: 'post' }));
  const handover = satState.handoverProtocols.filter(r => r.deviceId === deviceId).map(r => ({ ...r, docType: 'handover' }));
  return [...pre, ...post, ...handover].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

function docTypeLabel(docType) {
  if (docType === 'pre') return 'Raport przed-serwisowy';
  if (docType === 'post') return 'Raport po-serwisowy';
  if (docType === 'handover') return 'Protokół przekazania';
  return 'Dokument';
}
function docTypeBadgeClass(docType) {
  if (docType === 'pre') return 'warn';
  if (docType === 'post') return 'ok';
  return 'neutral';
}

function renderDeviceDocsHistory(deviceId) {
  const docs = getAllDocsForDevice(deviceId);
  const container = document.getElementById('deviceDocsHistory');
  const empty = document.getElementById('deviceDocsEmpty');

  if (docs.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = docs.map(doc => {
    let summary = '';
    if (doc.docType === 'pre') {
      const f = doc.faults || [];
      summary = f.length ? f.join(', ') : (doc.problems ? doc.problems.slice(0, 90) : 'Brak usterek');
    }
    if (doc.docType === 'post') summary = doc.work ? doc.work.slice(0, 90) : 'Brak opisu prac';
    if (doc.docType === 'handover') summary = `Część: ${doc.partName}`;

    return `
      <div class="history-entry" data-doc-type="${doc.docType}" data-doc-id="${doc.id}" style="cursor:pointer;">
        <div class="hdate">${fmtDate(doc.date)} <span class="badge ${docTypeBadgeClass(doc.docType)}">${docTypeLabel(doc.docType)}</span></div>
        <div class="hsummary">${escapeHtml(summary)}</div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-doc-id]').forEach(el => {
    el.addEventListener('click', () => openDocView(el.dataset.docType, el.dataset.docId));
  });
}

// ===== ALL REPORTS VIEW (across all devices) =====
function renderAllReportsList() {
  const typeFilter = document.getElementById('reportsFilterType').value;
  const search = document.getElementById('reportsFilterSearch').value.toLowerCase();

  let docs = [
    ...satState.preServiceReports.map(r => ({ ...r, docType: 'pre' })),
    ...satState.postServiceReports.map(r => ({ ...r, docType: 'post' })),
    ...satState.handoverProtocols.map(r => ({ ...r, docType: 'handover' }))
  ];
  if (typeFilter) docs = docs.filter(d => d.docType === typeFilter);
  docs.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  if (search) {
    docs = docs.filter(d => {
      const dev = satState.devices.find(x => x.id === d.deviceId);
      const devName = dev ? deviceDisplayName(dev).toLowerCase() : '';
      return devName.includes(search) ||
        (d.problems || '').toLowerCase().includes(search) ||
        (d.work || '').toLowerCase().includes(search) ||
        (d.partName || '').toLowerCase().includes(search);
    });
  }

  const container = document.getElementById('allReportsList');
  const empty = document.getElementById('allReportsEmpty');

  if (docs.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = docs.map(doc => {
    const dev = satState.devices.find(x => x.id === doc.deviceId);
    const devName = dev ? deviceDisplayName(dev) : '(usunięte urządzenie)';
    let summary = '';
    if (doc.docType === 'pre') {
      const f = doc.faults || [];
      summary = f.length ? f.slice(0, 3).join(', ') : (doc.problems ? doc.problems.slice(0, 80) : '');
    }
    if (doc.docType === 'post') summary = doc.work ? doc.work.slice(0, 80) : '';
    if (doc.docType === 'handover') summary = `Część: ${doc.partName}`;

    return `
      <div class="history-entry" data-doc-type="${doc.docType}" data-doc-id="${doc.id}" style="cursor:pointer;">
        <div class="hdate">${fmtDate(doc.date)} <span class="badge ${docTypeBadgeClass(doc.docType)}">${docTypeLabel(doc.docType)}</span></div>
        <div class="hsummary"><strong>${escapeHtml(devName)}</strong>${summary ? ' — ' + escapeHtml(summary) : ''}</div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-doc-id]').forEach(el => {
    el.addEventListener('click', () => openDocView(el.dataset.docType, el.dataset.docId));
  });
}
document.getElementById('reportsFilterType').addEventListener('change', renderAllReportsList);
document.getElementById('reportsFilterSearch').addEventListener('input', renderAllReportsList);

// ===== DOCUMENT VIEW / PRINT =====
function findDoc(docType, id) {
  if (docType === 'pre') return satState.preServiceReports.find(d => d.id === id);
  if (docType === 'post') return satState.postServiceReports.find(d => d.id === id);
  if (docType === 'handover') return satState.handoverProtocols.find(d => d.id === id);
  return null;
}

function openDocView(docType, id) {
  const doc = findDoc(docType, id);
  if (!doc) return;
  satState.currentDocView = { type: docType, id };

  const dev = satState.devices.find(x => x.id === doc.deviceId);
  const devName = dev ? deviceDisplayName(dev) : '(usunięte urządzenie)';
  const devManufacturer = dev ? (dev.manufacturer || '—') : '—';

  let title = docTypeLabel(docType);
  let html = '';

  if (docType === 'pre') {
    const faultsList = (doc.faults || []);
    const faultsHtml = faultsList.length
      ? faultsList.map(f => `<span style="display:inline-block;background:#fbe4dd;color:#963118;border-radius:5px;padding:2px 8px;margin:2px;font-size:13px;">${escapeHtml(f)}</span>`).join(' ')
      : '—';
    html = `
      <h2 style="margin-top:0;">Raport przed-serwisowy</h2>
      <p><strong>Urządzenie:</strong> ${escapeHtml(devName)} (${escapeHtml(devManufacturer)})</p>
      <p><strong>Data:</strong> ${fmtDate(doc.date)}</p>
      <p><strong>Stwierdzone usterki:</strong><br>${faultsHtml}</p>
      <p><strong>Opis / szczegóły diagnozy:</strong><br>${escapeHtml(doc.problems || '—').replace(/\n/g, '<br>')}</p>
      <p><strong>Części do wymiany:</strong><br>${doc.partsToReplace && doc.partsToReplace.length ? doc.partsToReplace.map(escapeHtml).join('<br>') : '—'}</p>
      ${doc.note ? `<p><strong>Notatka:</strong><br>${escapeHtml(doc.note).replace(/\n/g, '<br>')}</p>` : ''}
    `;
  } else if (docType === 'post') {
    const companyLabel = doc.companyType === 'zewnetrzny' ? `Firma zewnętrzna: ${escapeHtml(doc.companyName || '—')}` : 'Serwis wewnętrzny';
    html = `
      <h2 style="margin-top:0;">Raport po-serwisowy</h2>
      <p><strong>Urządzenie:</strong> ${escapeHtml(devName)} (${escapeHtml(devManufacturer)})</p>
      <p><strong>Data:</strong> ${fmtDate(doc.date)}</p>
      <p><strong>Wykonawca:</strong> ${companyLabel}</p>
      <p><strong>Wykonane prace:</strong><br>${escapeHtml(doc.work || '—').replace(/\n/g, '<br>')}</p>
      <p><strong>Wymienione / naprawione części:</strong><br>${doc.parts && doc.parts.length ? doc.parts.map(p => escapeHtml(p.name) + ' — ' + p.qty + ' szt.').join('<br>') : '—'}</p>
      ${doc.note ? `<p><strong>Notatka:</strong><br>${escapeHtml(doc.note).replace(/\n/g, '<br>')}</p>` : ''}
    `;
  } else if (docType === 'handover') {
    html = `
      <h2 style="margin-top:0;text-align:center;">PROTOKÓŁ PRZEKAZANIA CZĘŚCI DO SERWISU</h2>
      <p><strong>Data przekazania:</strong> ${fmtDate(doc.date)}</p>
      <p><strong>Urządzenie:</strong> ${escapeHtml(devName)} (${escapeHtml(devManufacturer)})</p>
      <p><strong>Firma przyjmująca:</strong> ${escapeHtml(doc.company || '—')}</p>
      <p><strong>Przekazywana część / podzespół:</strong> ${escapeHtml(doc.partName)}</p>
      <p><strong>Opis usterki / powód przekazania:</strong><br>${escapeHtml(doc.reason || '—').replace(/\n/g, '<br>')}</p>
      <div style="display:flex;justify-content:space-between;margin-top:50px;">
        <div style="text-align:center;width:45%;">
          <div style="border-top:1px solid #333;padding-top:6px;">${escapeHtml(doc.fromPerson || '.....................')}</div>
          <div style="font-size:11px;color:#555;">Przekazujący (podpis)</div>
        </div>
        <div style="text-align:center;width:45%;">
          <div style="border-top:1px solid #333;padding-top:6px;">${escapeHtml(doc.toPerson || '.....................')}</div>
          <div style="font-size:11px;color:#555;">Przyjmujący (podpis)</div>
        </div>
      </div>
    `;
  }

  document.getElementById('docViewTitle').textContent = title;
  document.getElementById('docViewContent').innerHTML = html;
  document.getElementById('docViewModalOverlay').classList.add('active');
}

document.getElementById('closeDocViewModal').addEventListener('click', () => {
  document.getElementById('docViewModalOverlay').classList.remove('active');
});
// Kliknięcie poza oknem NIE zamyka go (aby nie tracić wpisanych danych) — zamykanie tylko przez przycisk X / Anuluj. (docViewModalOverlay)

document.getElementById('printDocBtn').addEventListener('click', () => {
  const content = document.getElementById('docViewContent').innerHTML;
  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>Dokument serwisowy</title>
    <style>
      body{font-family:-apple-system,Arial,sans-serif;color:#1a1a1a;padding:30px;max-width:700px;margin:0 auto;}
      p{line-height:1.5;}
    </style>
    </head><body>${content}</body></html>
  `);
  w.document.close();
  setTimeout(() => { w.print(); }, 350);
});

document.getElementById('deleteDocBtn').addEventListener('click', async () => {
  if (!satState.currentDocView) return;
  if (!confirm('Usunąć ten dokument? Tej operacji nie można odwrócić.')) return;

  const { type, id } = satState.currentDocView;
  if (type === 'pre') {
    await DB.deletePreServiceReport(id);
    satState.preServiceReports = satState.preServiceReports.filter(d => d.id !== id);
  } else if (type === 'post') {
    await DB.deletePostServiceReport(id);
    satState.postServiceReports = satState.postServiceReports.filter(d => d.id !== id);
  } else if (type === 'handover') {
    await DB.deleteHandoverProtocol(id);
    satState.handoverProtocols = satState.handoverProtocols.filter(d => d.id !== id);
  }

  document.getElementById('docViewModalOverlay').classList.remove('active');
  if (satState.currentDeviceId) renderDeviceDocsHistory(satState.currentDeviceId);
  renderAllReportsList();
  showToast('Dokument usunięty');
});

// ===== START SATELITY MODULE =====
initSatelity();



