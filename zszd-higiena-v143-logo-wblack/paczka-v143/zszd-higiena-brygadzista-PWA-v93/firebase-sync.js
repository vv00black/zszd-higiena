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

// Wysyła JEDNĄ paczkę (dokładnie ten sam kształt co plik JSON) do Firestore.
// Zwraca true przy powodzeniu, false przy jakimkolwiek błędzie (brak
// internetu, błąd Firebase, itp.) — wywołujący decyduje, co dalej.
async function fbSendSubmission(pkg) {
  if (!navigator.onLine) return false;
  if (!fbInit()) return false;
  try {
    await fbDb.collection('submissions').add({
      ...pkg,
      _uploadedAt: Date.now()
    });
    return true;
  } catch (e) {
    console.error('Firebase: błąd wysyłki', e);
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
  if (!navigator.onLine) return;
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

// ===== STRONA ADMINA: POBIERANIE NOWYCH ZGŁOSZEŃ Z FIRESTORE =====
// Pobiera WYŁĄCZNIE zgłoszenia nowsze niż ostatnio pobrane (znacznik czasu
// zapisany lokalnie) i zapisuje je do lokalnego magazynu centralSubmissions —
// dokładnie tak samo, jakby admin ręcznie zaimportował plik. Cała reszta
// Centrali (rozpoznawanie konfliktów, raporty zbiorcze) działa bez ŻADNYCH
// zmian, bo dostaje dokładnie taki sam kształt danych jak zawsze.
async function fbFetchNewSubmissions() {
  if (!navigator.onLine) return { pobrane: 0, blad: 'offline' };
  if (!fbInit()) return { pobrane: 0, blad: 'firebase' };
  try {
    const lastFetch = await DB.getSetting('fbLastFetchAt', 0);
    const snap = await fbDb.collection('submissions')
      .where('_uploadedAt', '>', lastFetch)
      .get();
    let pobrane = 0;
    let maxUploadedAt = lastFetch;
    for (const doc of snap.docs) {
      const data = doc.data();
      const { _uploadedAt, ...pkg } = data;
      await DB.saveCentralSubmission(pkg);
      if (_uploadedAt > maxUploadedAt) maxUploadedAt = _uploadedAt;
      pobrane++;
    }
    if (maxUploadedAt > lastFetch) await DB.setSetting('fbLastFetchAt', maxUploadedAt);
    return { pobrane };
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
    if (hint) hint.textContent = '📶 Brak internetu w tej chwili — dane poczekają i wyślą się same, gdy połączenie wróci.';
    if (typeof showToast === 'function') showToast('Brak internetu — dane zapisane, wyślą się same');
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
  } else if (wynik.pobrane === 0) {
    if (hint) hint.textContent = 'Brak nowych zgłoszeń — wszystko już aktualne.';
  } else {
    if (hint) hint.textContent = `✅ Pobrano ${wynik.pobrane} nowych zgłoszeń.`;
    if (typeof showToast === 'function') showToast(`Pobrano ${wynik.pobrane} nowych zgłoszeń`);
    if (typeof renderCentrala === 'function') await renderCentrala();
    if (typeof renderLeaveApprovalList === 'function') await renderLeaveApprovalList();
  }
});
