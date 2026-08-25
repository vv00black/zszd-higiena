// ===== FIREBASE: AUTOMATYCZNA SYNCHRONIZACJA Z CENTRALĄ (DODATKOWA, OPCJONALNA) =====
// WAŻNE: to NIE zastępuje dotychczasowego mechanizmu (eksport/import pliku JSON) —
// to jest DRUGA, alternatywna droga wysyłania TYCH SAMYCH paczek danych, tym razem
// automatycznie przez internet zamiast ręcznie przez WhatsApp/e-mail. Jeśli internet
// akurat nie działa, dotychczasowy sposób z plikiem zawsze pozostaje dostępny.

const firebaseConfig = {
  apiKey: "AIzaSyAw1I1qbjL8GdblfkNO0fQtHqGQp1cw4FE",
  authDomain: "higiena-centrala.firebaseapp.com",
  projectId: "higiena-centrala",
  storageBucket: "higiena-centrala.firebasestorage.app",
  messagingSenderId: "662870194141",
  appId: "1:662870194141:web:2d0098a09bd870f6192834",
  measurementId: "G-47ERRHQDPN"
};

let fbApp = null;
let fbDb = null;

// Inicjalizuje połączenie z Firebase — dopiero przy pierwszej faktycznej
// potrzebie (nie od razu przy starcie aplikacji), i tylko jeśli biblioteka
// Firebase w ogóle zdążyła się załadować (może się nie udać np. bez internetu
// przy pierwszym otwarciu strony — wtedy po prostu nic z tego nie korzysta).
function fbInit() {
  if (fbApp) return true;
  if (typeof firebase === 'undefined') return false;
  try {
    fbApp = firebase.initializeApp(firebaseConfig);
    fbDb = firebase.firestore();
    return true;
  } catch (e) {
    console.error('Firebase: błąd inicjalizacji', e);
    return false;
  }
}

// NAPRAWA (Aug 24): pomocnik do ograniczania czasu oczekiwania na próbę sieciową.
// Firestore SDK bez włączonej trwałości offline potrafi "wisieć" długo zanim
// sam zgłosi błąd, gdy naprawdę nie ma internetu — ten limit gwarantuje szybką,
// przewidywalną odpowiedź (sukces albo kolejkowanie) niezależnie od tego.
function fbWithTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Przekroczono limit czasu')), ms))
  ]);
}

// Wysyła JEDNĄ paczkę (dokładnie ten sam kształt co plik JSON) do Firestore.
// Zwraca true przy powodzeniu, false przy jakimkolwiek błędzie (brak
// internetu, błąd Firebase, itp.) — wywołujący decyduje, co dalej.
// WAŻNE (naprawa v157): _uploadedAt zapisywany jako znacznik czasu SERWERA
// Firestore (serverTimestamp), NIE Date.now() z urządzenia — zegar telefonu
// bywa niedokładny, co wcześniej powodowało CICHE gubienie zgłoszeń (patrz
// fbFetchNewSubmissions poniżej).
// KRYTYCZNA NAPRAWA (Aug 24): USUNIĘTO sprawdzanie `navigator.onLine` przed
// próbą wysyłki. Ta flaga przeglądarki jest notorycznie zawodna na urządzeniach
// mobilnych (zwłaszcza Android) — potrafi fałszywie zgłaszać "offline" mimo
// realnie działającego internetu (typowe przy niektórych sieciach Wi-Fi,
// przełączaniu Wi-Fi/LTE). Zgłoszenie usera: "wyskakuje błąd brak internetu,
// internet jest dostępny, sprawdzałem pod każdym względem" — dokładnie ten
// scenariusz. Teraz aplikacja ZAWSZE faktycznie próbuje wysłać (z limitem
// czasu poniżej), zamiast ufać samej flagi.
// NAPRAWA (Aug 24, trzecia): user zgłosił KONSEKWENTNE, każdorazowe
// niepowodzenie wysyłki mimo potwierdzonego internetu — po odsłonięciu
// prawdziwego błędu (patrz fbLastSendErrorMessage) potwierdzone: paczka
// przekracza twardy limit Firestore (1 MiB na dokument), bo
// buildSubmissionPackage wysyła CAŁĄ historię danych za każdym razem (nie
// tylko nowe rzeczy) — po tygodniach użytkowania to naturalnie rośnie
// ponad limit. User poprosił o dokładnie ten sam mechanizm, którego już
// używa w innej swojej aplikacji ("wiadomości"): dzielenie dużej paczki na
// kilka mniejszych dokumentów, sklejanych z powrotem po stronie odbioru.
//
// Dzieli PO CAŁYCH store'ach, gdy to możliwe (mniej dokumentów); jeśli
// pojedynczy store SAM w sobie przekracza limit (może się zdarzyć np. dla
// magReceipts/magIssues po miesiącach użycia) — dzieli TEN store wierszowo,
// zachowując resztę store'ów w normalnych, całych kawałkach.
const FB_DOC_SIZE_LIMIT = 700000; // bezpieczny margines pod twardym limitem Firestore (1 MiB ≈ 1 048 576 B)

function fbByteSize(obj) {
  return new TextEncoder().encode(JSON.stringify(obj)).length;
}

function fbSplitIntoChunks(pkg) {
  const { stores, ...meta } = pkg;
  const storeNames = Object.keys(stores || {});
  const metaOverhead = fbByteSize(meta) + 200; // margines na pola chunkIndex/chunkCount/chunkGroupId
  const chunks = [];
  let current = {};
  let currentSize = metaOverhead;

  function flushCurrent() {
    if (Object.keys(current).length > 0) {
      chunks.push(current);
      current = {};
      currentSize = metaOverhead;
    }
  }

  for (const name of storeNames) {
    const rows = stores[name];
    const storeSize = fbByteSize({ [name]: rows });

    if (metaOverhead + storeSize <= FB_DOC_SIZE_LIMIT) {
      if (currentSize + storeSize > FB_DOC_SIZE_LIMIT) flushCurrent();
      current[name] = rows;
      currentSize += storeSize;
    } else {
      // Ten JEDEN store sam przekracza limit nawet w osobnym dokumencie —
      // dzielimy go na kawałki PO REKORDACH zamiast po całych store'ach.
      flushCurrent();
      let bucket = [];
      let bucketSize = metaOverhead;
      for (const row of rows) {
        const rowSize = fbByteSize(row) + 2;
        if (bucket.length > 0 && bucketSize + rowSize > FB_DOC_SIZE_LIMIT) {
          chunks.push({ [name]: bucket });
          bucket = [];
          bucketSize = metaOverhead;
        }
        bucket.push(row);
        bucketSize += rowSize;
      }
      if (bucket.length > 0) chunks.push({ [name]: bucket });
    }
  }
  flushCurrent();
  if (chunks.length === 0) chunks.push({});

  const chunkGroupId = genId();
  return chunks.map((storesChunk, i) => ({
    ...meta,
    chunkGroupId,
    chunkIndex: i,
    chunkCount: chunks.length,
    stores: storesChunk
  }));
}

let fbLastSendErrorMessage = '';

// NAPRAWA (Aug 24, piąta): user zobaczył (dzięki v164's error-surfacing)
// prawdziwy błąd Firestore: "[invalid-argument] Property stores contains
// an invalid nested entity." Firestore NIE akceptuje: (1) wartości
// `undefined` w polach obiektu (IndexedDB je akceptuje bez problemu, więc
// mogły się tam cicho zakraść), (2) tablicy zagnieżdżonej bezpośrednio w
// innej tablicy (np. siatka harmonogramu jako [[...],[...]]). Ta funkcja
// rekurencyjnie "odkaża" dane tuż przed wysyłką: usuwa klucze z wartością
// undefined, opakowuje zagnieżdżone tablice w obiekt {nestedArrayItems:[...]}
// — bez utraty żadnych rzeczywistych danych, tylko w formacie, który
// Firestore akceptuje.
// NAPRAWA (Aug 24, szósta): user wciąż widział IDENTYCZNY komunikat błędu
// ("Property stores contains an invalid nested entity") mimo zainstalowanej
// naprawy z poprzedniej wersji. Przyczyna: Firestore REZERWUJE nazwy pól
// zaczynające się od podwójnego podkreślenia ("__...") do własnego użytku
// wewnętrznego i ODRZUCA dokumenty, które ich używają — a poprzednia naprawa
// jako nazwę "opakowania" dla zagnieżdżonych tablic wybrała właśnie taką
// nazwę ("__nestedArray"), tworząc NOWE naruszenie tego samego typu, z tym
// samym ogólnym komunikatem błędu. Zmieniono na "nestedArrayItems" (bez
// wiodących podkreśleń) — potwierdzone testem, że to usuwa naruszenie.
function fbSanitizeForFirestore(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    return value.map(v => {
      const s = fbSanitizeForFirestore(v);
      return Array.isArray(s) ? { nestedArrayItems: s } : s;
    });
  }
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = fbSanitizeForFirestore(v);
    }
    return out;
  }
  return value;
}

// Odwrotność powyższego — rozpakowuje {nestedArrayItems:[...]} z powrotem do
// zwykłej zagnieżdżonej tablicy. BRAKOWAŁO tego wcześniej: bez tego kroku
// dane odebrane w Centrali zostałyby po cichu uszkodzone (zagnieżdżone
// tablice na stałe zamieniłyby się w opakowane obiekty). Wywoływane zaraz
// po sklejeniu części paczki, zanim trafi do saveCentralSubmission/scalania.
function fbDesanitizeFromFirestore(value) {
  if (value === null) return value;
  if (Array.isArray(value)) return value.map(fbDesanitizeFromFirestore);
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === 'nestedArrayItems' && Array.isArray(value.nestedArrayItems)) {
      return value.nestedArrayItems.map(fbDesanitizeFromFirestore);
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = fbDesanitizeFromFirestore(v);
    return out;
  }
  return value;
}

// Wysyła paczkę do Firestore — dzieląc ją na mniejsze dokumenty, jeśli
// przekracza bezpieczny limit rozmiaru. Zwraca true TYLKO jeśli WSZYSTKIE
// części wysłały się poprawnie (jeśli któraś zawiedzie w trakcie, część już
// wysłanych dokumentów zostaje "osierocona" w Firestore — nieszkodliwe,
// nigdy nie zostaną przetworzone bez kompletu, patrz fbFetchNewSubmissions).
async function fbSendSubmission(pkg) {
  if (!fbInit()) { fbLastSendErrorMessage = 'Firebase nie jest skonfigurowany.'; return false; }
  try {
    const totalSize = fbByteSize(pkg);
    const parts = totalSize > FB_DOC_SIZE_LIMIT ? fbSplitIntoChunks(pkg) : [pkg];
    for (const part of parts) {
      const clean = fbSanitizeForFirestore(part);
      await fbWithTimeout(
        fbDb.collection('submissions').add({
          ...clean,
          _uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
        }),
        12000
      );
    }
    fbLastSendErrorMessage = '';
    return true;
  } catch (e) {
    console.error('Firebase: błąd wysyłki', e);
    fbLastSendErrorMessage = (e && e.code ? '[' + e.code + '] ' : '') + (e && e.message ? e.message : 'nieznany błąd');
    return false;
  }
}

// Główna funkcja wywoływana z przycisku w Centrali: próbuje wysłać od razu,
// a jeśli się nie uda (offline albo błąd) — zapisuje w lokalnej kolejce do
// automatycznej, późniejszej próby. Zwraca 'sent' | 'queued'.
async function fbSendOrQueue(pkg) {
  const ok = await fbSendSubmission(pkg);
  if (ok) return 'sent';
  await DB.queueForFirebase(pkg);
  return 'queued';
}

let fbFlushInProgress = false;

// Opróżnia kolejkę oczekujących paczek — wywoływane automatycznie przy
// starcie aplikacji i za każdym razem, gdy przeglądarka zgłosi powrót
// internetu. Wysyła po kolei, najstarsze najpierw; przerywa przy pierwszym
// niepowodzeniu (nie ma sensu próbować reszty, jeśli internet znowu zniknął).
async function fbFlushQueue() {
  if (fbFlushInProgress) return;
  // NAPRAWA (Aug 24): usunięto blokadę `if (!navigator.onLine) return;` —
  // ta sama zawodna flaga co w fbSendSubmission. Każde wywołanie fbSendSubmission
  // ma teraz własny limit czasu (12s), więc próba w najgorszym razie kosztuje
  // te kilkanaście sekund zamiast nigdy nie następować.
  fbFlushInProgress = true;
  try {
    const queue = await DB.getFirebaseQueue();
    for (const item of queue) {
      const ok = await fbSendSubmission(item.pkg);
      if (!ok) break;
      await DB.removeFirebaseQueueItem(item.id);
    }
    if (queue.length && typeof renderPendingUploadBanner === 'function') {
      await renderPendingUploadBanner();
    }
  } finally {
    fbFlushInProgress = false;
  }
}

window.addEventListener('online', () => { fbFlushQueue(); });
// Spróbuj też krótko po starcie aplikacji — na wypadek gdyby coś czekało
// z poprzedniej sesji, a urządzenie już ma internet.
setTimeout(() => { fbFlushQueue(); }, 4000);

// Dla admina: przy każdym starcie aplikacji sprawdź automatycznie, czy nie
// ma nowych zgłoszeń — nie trzeba klikać "Pobierz", żeby dane się pojawiły.
// WAŻNE: czekamy jawnie na window.__authReady (ten sam mechanizm co reszta
// aplikacji) zamiast zgadywać, czy currentUser jest już ustawione — to
// dokładnie ta lekcja, którą boleśnie wyciągnęliśmy przy check-liście dla
// roli "Stanowisko".
(async () => {
  if (typeof window.__authReady !== 'undefined') await window.__authReady;
  if (typeof currentUser !== 'undefined' && currentUser && typeof userCanAccessModule === 'function' && userCanAccessModule('centrala')) {
    const wynik = await fbFetchNewSubmissions();
    if (wynik.pobrane > 0) {
      if (typeof renderCentrala === 'function') await renderCentrala();
      if (typeof renderLeaveApprovalList === 'function') await renderLeaveApprovalList();
      if (typeof showToast === 'function') showToast(`Pobrano ${wynik.pobrane} nowych zgłoszeń przez internet`);
    }
  }
})();

// ===== NAPRAWA v158: AUTOMATYCZNE, SELEKTYWNE SCALANIE ZMIAN MAGAZYNOWYCH =====
// Zgłoszenie usera: "remanent musi zmieniać stany i w PWA, i w Centrali" —
// samo dotarcie przesyłki do Centrali (v157) tylko ją archiwizowało; zmiana
// stanów wymagała ręcznego "Wczytaj do bazy roboczej", które nadpisuje CAŁĄ
// bazę (nie tylko magazyn) danymi z jednej przesyłki — ryzykowne i niewygodne
// do rutynowego używania po każdym remanencie.
//
// Ta funkcja dolicza NOWE zdarzenia magazynowe (przyjęcia, wydania, w tym
// korekty remanentowe, oraz historię zatwierdzonych remanentów) z przesyłki
// do lokalnej bazy Centrali — WYŁĄCZNIE dopisując rekordy, których jeszcze
// nie ma (po ID), NIGDY nie nadpisując istniejących. To bezpieczne, bo te
// magazynowe store'y są z natury "tylko-dopisz" (zdarzenie raz zapisane nigdy
// nie jest edytowane) — więc scalenie nie może zgubić ani nadpisać niczego,
// co ktoś inny zrobił niezależnie w międzyczasie, i jest bezpieczne do
// wielokrotnego uruchomienia (nie duplikuje przy ponownym pobraniu).
// CELOWO pomija magProducts (katalog produktów) — to pole EDYTOWALNE, więc
// automatyczne nadpisanie mogłoby zgubić zmiany zrobione niezależnie gdzie
// indziej; produkty synchronizuje się nadal przez zwykły eksport/import.
const MAGAZYN_DELTA_STORES = ['magReceipts', 'magIssues', 'magRemanenty'];

async function mergeMagazynDeltaFromSubmission(pkg) {
  if (!pkg || !pkg.stores) return { dodane: 0 };
  let dodane = 0;
  for (const storeName of MAGAZYN_DELTA_STORES) {
    const records = pkg.stores[storeName];
    if (!Array.isArray(records)) continue;
    for (const rec of records) {
      if (!rec || !rec.id) continue;
      const istniejacy = await DB.get(storeName, rec.id);
      if (istniejacy) continue; // już mamy — nigdy nie nadpisujemy
      await DB.put(storeName, rec);
      dodane++;
    }
  }
  return { dodane };
}

// Jeśli akurat patrzysz na zakładkę Magazynu, gdy przyjdzie nowa przesyłka —
// odśwież widoczne dane, żeby nie trzeba było ręcznie przełączać zakładek.
function odswiezAktywnaZakladkeMagazynu() {
  const aktywny = document.querySelector('.tab-btn.active');
  const tab = aktywny ? aktywny.dataset.view : null;
  if (tab && tab.indexOf('mag') === 0 && typeof switchTab === 'function') switchTab(tab);
}

// Ręczna, jednorazowa synchronizacja WSZYSTKICH już zarchiwizowanych w
// Centrali przesyłek — dla przesyłek odebranych PRZED tą aktualizacją, które
// nikt nigdy nie "wczytał do bazy roboczej" ręcznie. Bezpieczne (patrz wyżej
// — tylko dopisuje brakujące), można kliknąć wielokrotnie bez ryzyka.
async function synchronizujMagazynZeWszystkichPrzeslek() {
  const all = await DB.getCentralSubmissions();
  let dodanoLacznie = 0;
  for (const s of all) {
    const { dodane } = await mergeMagazynDeltaFromSubmission(s.payload);
    dodanoLacznie += dodane;
  }
  return { dodanoLacznie, sprawdzonoPrzeslek: all.length };
}


// NAPRAWA v157 — KRYTYCZNY BŁĄD: poprzednia wersja filtrowała zgłoszenia po
// znaczniku czasu USTAWIONYM PRZEZ URZĄDZENIE WYSYŁAJĄCE (Date.now() na
// telefonie). Jeśli zegar telefonu był niedokładny (częste — zła strefa
// czasowa, brak synchronizacji), nowe zgłoszenia mogły mieć _uploadedAt
// NIŻSZY niż już zapisany próg — i były CICHO pomijane na zawsze, mimo że
// telefon poprawnie zgłaszał "wysłano". Objaw zgłoszony przez usera:
// pierwsza wysyłka dotarła, kolejne "wychodziły z telefonu" ale nigdy nie
// pojawiały się w Centrali.
//
// Naprawa: zamiast progu czasowego, śledzimy ZBIÓR ID dokumentów Firestore,
// które już zaimportowaliśmy (`fbFetchedDocIds`) — całkowicie niezależne od
// jakiegokolwiek zegara. Pobieramy całą kolekcję i pomijamy tylko te ID,
// które już mamy — odporne na dowolne przesunięcie zegara na dowolnym
// urządzeniu, teraz i w przyszłości.
//
// JEDNORAZOWA MIGRACJA (pierwsze uruchomienie tej wersji): żeby nie
// zdublować zgłoszeń poprawnie odebranych starym mechanizmem, porównujemy
// z tym, co już jest lokalnie w Centrali (po brygadzista.id+exportedAt) —
// a jednocześnie faktycznie ODZYSKUJEMY zgłoszenia, które stary mechanizm
// po cichu zgubił.
// NAPRAWA v158 (Aug 24, czwarta): duże paczki są teraz dzielone na wiele
// dokumentów po stronie wysyłki (patrz fbSplitIntoChunks wyżej) — trzeba je
// tutaj rozpoznać (po wspólnym `chunkGroupId`) i skleić z powrotem PRZED
// przetworzeniem. Grupa jest przetwarzana TYLKO gdy WSZYSTKIE jej części są
// obecne w bieżącym pobraniu (chunkCount się zgadza) — niekompletne grupy
// (np. część jeszcze nie dotarła) zostają nietknięte i sprawdzone ponownie
// przy następnym pobraniu, ich ID nie trafiają jeszcze do fbFetchedDocIds.
function fbGroupAndReassemble(rawDocs) {
  const singles = [];
  const groups = new Map();
  for (const { id, data } of rawDocs) {
    const { _uploadedAt, ...pkg } = data;
    if (!pkg.chunkGroupId) { singles.push({ ids: [id], pkg }); continue; }
    if (!groups.has(pkg.chunkGroupId)) groups.set(pkg.chunkGroupId, []);
    groups.get(pkg.chunkGroupId).push({ id, pkg });
  }
  const complete = [...singles];
  for (const parts of groups.values()) {
    const expected = parts[0].pkg.chunkCount;
    if (parts.length !== expected) continue; // niekompletna — pomiń na razie
    parts.sort((a, b) => a.pkg.chunkIndex - b.pkg.chunkIndex);
    const mergedStores = {};
    for (const { pkg } of parts) {
      for (const [storeName, rows] of Object.entries(pkg.stores || {})) {
        if (!mergedStores[storeName]) mergedStores[storeName] = [];
        mergedStores[storeName] = mergedStores[storeName].concat(rows);
      }
    }
    const { chunkGroupId, chunkIndex, chunkCount, stores, ...meta } = parts[0].pkg;
    complete.push({ ids: parts.map(p => p.id), pkg: { ...meta, stores: mergedStores } });
  }
  // Rozpakuj zagnieżdżone tablice z powrotem do normalnej postaci (patrz
  // fbDesanitizeFromFirestore wyżej) — bez tego dane zostałyby po cichu
  // uszkodzone w Centrali.
  return complete.map(({ ids, pkg }) => ({ ids, pkg: fbDesanitizeFromFirestore(pkg) }));
}

async function fbFetchNewSubmissions() {
  // NAPRAWA (Aug 24): usunięto blokadę navigator.onLine (patrz fbSendSubmission
  // wyżej — ta sama zawodna flaga). .get() poniżej i tak ma naturalny limit
  // przez samą naturę żądania sieciowego; błąd zostanie złapany normalnie.
  if (!fbInit()) return { pobrane: 0, blad: 'firebase' };
  try {
    let fetchedIds = await DB.getSetting('fbFetchedDocIds', null);
    const pierwszeUruchomienieNowegoSystemu = fetchedIds === null;
    fetchedIds = fetchedIds || [];
    const fetchedSet = new Set(fetchedIds);

    let lokalneKlucze = new Set();
    if (pierwszeUruchomienieNowegoSystemu) {
      const istniejace = await DB.getCentralSubmissions();
      lokalneKlucze = new Set(istniejace.map(e => `${e.brygadzistaId}::${e.submittedAt}`));
    }

    const snap = await fbWithTimeout(fbDb.collection('submissions').get(), 15000);
    const noweSurowe = [];
    for (const doc of snap.docs) {
      if (fetchedSet.has(doc.id)) continue;
      noweSurowe.push({ id: doc.id, data: doc.data() });
    }

    const gotowe = fbGroupAndReassemble(noweSurowe);

    let pobrane = 0;
    let dodanoMagazyn = 0;
    const noweId = [];
    for (const { ids, pkg } of gotowe) {
      const klucz = `${pkg.brygadzista && pkg.brygadzista.id}::${pkg.exportedAt}`;
      noweId.push(...ids);
      // Scalenie zmian magazynowych (patrz mergeMagazynDeltaFromSubmission
      // wyżej) — bezpieczne (tylko-dopisz), więc wykonujemy je dla KAŻDEJ
      // przesyłki napotkanej po raz pierwszy w tej sesji, niezależnie czy to
      // faktycznie nowe zgłoszenie, czy odzyskane podczas migracji — może
      // zawierać korekty, których stary mechanizm jeszcze nie zdążył scalić.
      const wynikMag = await mergeMagazynDeltaFromSubmission(pkg);
      dodanoMagazyn += wynikMag.dodane;
      if (pierwszeUruchomienieNowegoSystemu && lokalneKlucze.has(klucz)) {
        // Już mamy to zgłoszenie z poprzedniego systemu — nie duplikuj,
        // tylko odnotuj jako już obsłużone.
        continue;
      }
      await DB.saveCentralSubmission(pkg);
      pobrane++;
    }
    if (noweId.length) {
      await DB.setSetting('fbFetchedDocIds', fetchedIds.concat(noweId));
    }
    if (dodanoMagazyn > 0) odswiezAktywnaZakladkeMagazynu();
    return { pobrane, dodanoMagazyn };
  } catch (e) {
    console.error('Firebase: błąd pobierania', e);
    return { pobrane: 0, blad: 'firebase' };
  }
}

// Wspólna logika kliknięcia "wyślij przez internet" — używana zarówno przez
// przycisk w sekcji "🆘 Pomoc", jak i ten wyraźny, samodzielny na górze
// ekranu głównego. `hintElId` jest opcjonalny (przycisk na górze nie ma
// własnego miejsca na tekst statusu — wtedy liczy się tylko showToast).
async function handleQuickSendClick(hintElId) {
  const built = await buildCentralaSubmissionPackage();
  if (!built) return;
  const hint = hintElId ? document.getElementById(hintElId) : null;
  if (hint) hint.textContent = 'Wysyłanie...';
  const wynik = await fbSendOrQueue(built.pkg);
  if (wynik === 'sent') {
    if (hint) hint.textContent = '✅ Wysłano automatycznie przez internet.';
    if (typeof showToast === 'function') showToast('Dane wysłane przez internet');
  } else {
    const detail = fbLastSendErrorMessage ? (' (' + fbLastSendErrorMessage + ')') : '';
    if (hint) hint.textContent = '📶 Nie udało się wysłać w tej chwili — dane poczekają i wyślą się same, gdy spróbujesz ponownie.' + detail;
    if (typeof showToast === 'function') showToast('Nie udało się wysłać — dane zapisane' + detail);
  }
}

// ===== PRZYCISK W SEKCJI "🆘 POMOC" =====
document.getElementById('homeSendToCentralaFirebaseBtn') && document.getElementById('homeSendToCentralaFirebaseBtn').addEventListener('click', () => handleQuickSendClick('homeFirebaseStatusHint'));

// ===== WYRAŹNY PRZYCISK NA GÓRZE EKRANU GŁÓWNEGO =====
document.getElementById('homeQuickSendBtn') && document.getElementById('homeQuickSendBtn').addEventListener('click', () => handleQuickSendClick(null));

// ===== PRZYCISK W CENTRALI (STRONA ADMINA): POBIERZ NOWE ZGŁOSZENIA =====
document.getElementById('fbFetchSubmissionsBtn') && document.getElementById('fbFetchSubmissionsBtn').addEventListener('click', async () => {
  const hint = document.getElementById('fbFetchStatusHint');
  if (hint) hint.textContent = 'Sprawdzanie nowych zgłoszeń...';
  const wynik = await fbFetchNewSubmissions();
  if (wynik.blad === 'offline') {
    if (hint) hint.textContent = '📶 Brak internetu — spróbuj ponownie, gdy będziesz online.';
  } else if (wynik.blad) {
    if (hint) hint.textContent = '⚠️ Nie udało się połączyć z internetową bazą — spróbuj ponownie za chwilę.';
  } else if (wynik.pobrane === 0 && !wynik.dodanoMagazyn) {
    if (hint) hint.textContent = 'Brak nowych zgłoszeń — wszystko już aktualne.';
  } else {
    const magInfo = wynik.dodanoMagazyn ? ` (w tym ${wynik.dodanoMagazyn} zmian magazynowych doliczonych do stanu)` : '';
    if (hint) hint.textContent = `✅ Pobrano ${wynik.pobrane} nowych zgłoszeń${magInfo}.`;
    if (typeof showToast === 'function') showToast(`Pobrano ${wynik.pobrane} nowych zgłoszeń${magInfo}`);
    if (typeof renderCentrala === 'function') await renderCentrala();
    if (typeof renderLeaveApprovalList === 'function') await renderLeaveApprovalList();
  }
});

// ===== PRZYCISK W CENTRALI: RĘCZNA SYNCHRONIZACJA MAGAZYNU Z HISTORII =====
// Jednorazowy "nadganiacz" dla przesyłek odebranych PRZED naprawą v158,
// których nikt nigdy ręcznie nie wczytał do bazy roboczej — bezpieczny do
// wielokrotnego klikania (tylko dopisuje brakujące, patrz komentarz wyżej).
document.getElementById('fbSyncMagazynBtn') && document.getElementById('fbSyncMagazynBtn').addEventListener('click', async () => {
  const hint = document.getElementById('fbFetchStatusHint');
  if (hint) hint.textContent = 'Synchronizowanie stanów magazynowych z historii przesyłek...';
  const { dodanoLacznie, sprawdzonoPrzeslek } = await synchronizujMagazynZeWszystkichPrzeslek();
  if (hint) hint.textContent = dodanoLacznie > 0
    ? `✅ Doliczono ${dodanoLacznie} zmian magazynowych z ${sprawdzonoPrzeslek} przesyłek.`
    : `Sprawdzono ${sprawdzonoPrzeslek} przesyłek — stany magazynowe już aktualne.`;
  if (typeof showToast === 'function') showToast(dodanoLacznie > 0 ? `Doliczono ${dodanoLacznie} zmian magazynowych` : 'Stany już aktualne');
  odswiezAktywnaZakladkeMagazynu();
});
