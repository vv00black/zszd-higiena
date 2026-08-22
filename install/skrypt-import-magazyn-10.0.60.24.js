// ===== SKRYPT POBIERANIA DANYCH Z SYSTEMU MAGAZYNOWEGO 10.0.60.24 =====
// Wklej ten CAŁY tekst do konsoli przeglądarki (F12 → zakładka Console),
// będąc ZALOGOWANYM na stronie 10.0.60.24. Naciśnij Enter.
//
// Co robi: pobiera stronę "Stan magazynu" i listę ostatnich operacji z TEJ
// SAMEJ strony (więc nie napotyka żadnych blokad przeglądarki), pokazuje Ci
// podgląd znalezionych danych i pyta o potwierdzenie, a dopiero potem
// wysyła je do ZSZD (przez Firebase — to samo konto, którego już używamy).

(async function () {
  const firebaseConfig = {
    apiKey: "AIzaSyAw1I1qbjL8GdblfkNO0fQtHqGQp1cw4FE",
    authDomain: "higiena-centrala.firebaseapp.com",
    projectId: "higiena-centrala",
    storageBucket: "higiena-centrala.firebasestorage.app",
    messagingSenderId: "662870194141",
    appId: "1:662870194141:web:2d0098a09bd870f6192834",
    measurementId: "G-47ERRHQDPN"
  };

  function wczytajSkrypt(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // Parsuje stronę "Stan magazynu" — szuka bezpośrednio elementów
  // <div class="karta"> (dokładnie tak, jak zbudowana jest ta strona) i
  // czyta pola z ich kodu HTML. To jest niezawodne niezależnie od tego, czy
  // przeglądarka "wyrenderowała" dokument, w przeciwieństwie do wcześniejszej
  // wersji opartej na widocznym tekście (innerText), która na dokumencie
  // pobranym przez fetch (nigdy nie wyświetlonym na ekranie) nie działała.
  function sparsujJednaKarte(innerHtml) {
    const wzorzec = /<b>([A-Z]+(?:-[A-Z0-9]+)+)\s+([^<]+?)<\/b>\s*<br>\s*Stan:\s*([\d.]+)\s*<br>\s*Zużycie:\s*([\d.]+|-)\s*\/\s*dzień\s*<br>\s*Zapas:\s*([\d.]+|-)\s*dni/;
    const m = wzorzec.exec(innerHtml);
    if (!m) return null;
    return {
      kod: m[1],
      nazwa: m[2].trim(),
      stan: Number(m[3]),
      zuzycieDzien: m[4] === '-' ? null : Number(m[4]),
      zapasDni: m[5] === '-' ? null : Number(m[5])
    };
  }
  function sparsujStan(dokument) {
    const produkty = [];
    dokument.querySelectorAll('.karta').forEach(karta => {
      const p = sparsujJednaKarte(karta.innerHTML);
      if (p) produkty.push(p);
    });
    return produkty;
  }

  // Parsuje "Ostatnie operacje" (format: "RRRR-MM-DD GG:MM | KOD NAZWA | ILOŚĆ | POWÓD")
  function sparsujOperacje(tekst) {
    const wzorzec = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*\|\s*([A-Z]+(?:-[A-Z0-9]+)+)\s+([^|]+?)\s*\|\s*(\d+)\s*\|\s*(.+)/g;
    const operacje = [];
    let m;
    while ((m = wzorzec.exec(tekst)) !== null) {
      operacje.push({
        data: m[1],
        kod: m[2],
        nazwa: m[3].trim(),
        ilosc: Number(m[4]),
        powod: m[5].trim()
      });
    }
    return operacje;
  }

  console.log('[ZSZD] Pobieranie strony /stan...');
  let produkty = [];
  try {
    const stanResp = await fetch('/stan', { credentials: 'include' });
    const stanTekst = await stanResp.text();
    const stanDom = new DOMParser().parseFromString(stanTekst, 'text/html');
    produkty = sparsujStan(stanDom);
  } catch (e) {
    console.error('[ZSZD] Błąd pobierania /stan:', e);
  }

  console.log('[ZSZD] Pobieranie strony głównej (ostatnie operacje)...');
  let operacje = [];
  try {
    const homeResp = await fetch('/', { credentials: 'include' });
    const homeTekst = await homeResp.text();
    const homeDom = new DOMParser().parseFromString(homeTekst, 'text/html');
    operacje = sparsujOperacje(homeDom.body.innerText);
  } catch (e) {
    console.error('[ZSZD] Błąd pobierania strony głównej:', e);
  }

  console.log(`[ZSZD] Znaleziono ${produkty.length} produktów i ${operacje.length} operacji.`);
  console.log('[ZSZD] Podgląd produktów:', produkty);
  console.log('[ZSZD] Podgląd operacji:', operacje);

  if (!produkty.length) {
    alert('ZSZD: Nie udało się rozpoznać żadnych produktów na stronie /stan. Otwórz konsolę (F12) i wyślij Wojtkowi zrzut tego, co tam widać (czerwone błędy albo listę "Podgląd produktów").');
    return;
  }

  const potwierdz = confirm(
    `ZSZD — podgląd danych do wysłania:\n\n` +
    `Produkty: ${produkty.length}\n` +
    `Operacje: ${operacje.length}\n\n` +
    `Szczegóły są w konsoli (F12).\n\nWysłać te dane do ZSZD?`
  );
  if (!potwierdz) { console.log('[ZSZD] Anulowano — nic nie wysłano.'); return; }

  if (typeof firebase === 'undefined') {
    await wczytajSkrypt('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
    await wczytajSkrypt('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js');
  }
  const app = firebase.initializeApp(firebaseConfig, 'zszd-magazyn-import-' + Date.now());
  const db = app.firestore();
  await db.collection('magazynZewnetrzny').add({
    pobranoO: new Date().toISOString(),
    zrodlo: '10.0.60.24',
    produkty,
    operacje
  });

  alert('ZSZD: Gotowe! Dane wysłane. W ZSZD, w Magazynie, kliknij "☁️ Pobierz dane z systemu magazynowego", żeby je zobaczyć.');
  console.log('[ZSZD] Wysłano pomyślnie.');
})();
