# Serwis Nadziewarek + Satelity v5

Aplikacja PWA do prowadzenia bazy serwisowej dla dwóch obszarów produkcji:
1. **Nadziewarki** — przeglądy codzienne, rejestr DUR, baza części.
2. **Satelity** — satelity centralnego systemu mycia (CSM) i inżektory zapasowe, z pełną dokumentacją serwisową.

## Funkcje — moduł Nadziewarki

- Lista nadziewarek z profilem i historią (Nr nadziewarki, Hala, Nr linii, Nr stanowiska).
- Przeglądy codzienne — edytowalna checklista, notatka, status OK/Problem.
- Rejestr DUR — części przekazane do naprawy lub utylizacji.
- Baza części — kartoteka ze zdjęciem, datą otrzymania i montażu.
- Kody QR dla każdej nadziewarki (link do profilu + czytelny tekst), z opcją wydruku naklejki.
- Eksport do Excel (4 arkusze: nadziewarki, przeglądy, DUR, części).

## Funkcje — moduł Satelity

- **Urządzenia** — jedna lista z filtrem typu: Satelity (CSM) i Inżektory, każde z producentem (FOAMICO / RADEX / własny wpis), opcjonalnym numerem, opisem lokalizacji, dwoma zdjęciami (zbliżenie + szeroki kontekst).
- **Baza części zamiennych** — kartoteka ze stanem ilościowym (+1/−1), zdjęciem i notatką.
- **Raport przed-serwisowy** — zdiagnozowane problemy, lista części do wymiany.
- **Raport po-serwisowy** — wykonane prace, wymienione/naprawione części (z firmą wewnętrzną/zewnętrzną), **automatycznie zmniejsza stan w bazie części zamiennych**.
- **Protokół przekazania do serwisu zewnętrznego** — formalny dokument do wydruku z miejscem na podpisy przekazującego i przyjmującego.
- Historia wszystkich dokumentów per urządzenie oraz zbiorczy widok wszystkich raportów z filtrowaniem.
- Każdy dokument można wydrukować / zapisać jako PDF z menu drukowania przeglądarki.

## Funkcje — moduł Ustawienia

Osobny kafelek na ekranie głównym, wspólny dla całej aplikacji (obejmuje też moduły dodane w przyszłości):

- **Pamięć i przechowywanie** — zużycie IndexedDB, trwałe przechowywanie (`storage.persist()`).
- **Sprawdź aktualizacje** — ręczne wymuszenie aktualizacji Service Workera.
- **Kopie zapasowe** — eksport/import całej bazy (JSON) obejmujący wszystkie moduły, dynamicznie po nazwach store'ów IndexedDB (nowe moduły są automatycznie uwzględniane).
- **Automatyczna kopia zapasowa** — co 30/60/120/360 min (do wyboru), zapisywana lokalnie w IndexedDB (ostatnie 24 kopie), z możliwością przywrócenia lub pobrania każdej z nich. Działa tylko, gdy aplikacja jest otwarta w przeglądarce — przeglądarki nie pozwalają na prawdziwe zadania w tle po zamknięciu karty/aplikacji.
- **Usuń wszystkie dane** — czyści dane wszystkich modułów.
- **Instalacja i udostępnianie aplikacji** — instrukcja instalacji PWA, link do udostępnienia (Web Share API / schowek).

## Funkcje — moduł Magazyn

Odwzorowuje logikę arkusza kalkulacyjnego gospodarki magazynowej (baza produktów, przyjęcia, wydania, automatycznie liczony stan i zamówienia):

- **Baza produktów** — nazwa, indeks magazynowy, dostawca, wielkość opakowania, JM, stan minimalny (próg alarmowy), stan początkowy, uwagi.
- **Przyjęcia** — data, produkt, ilość opakowań (automatycznie przelicza "ilość razem" na podstawie wielkości opakowania — można nadpisać ręcznie), nr dokumentu/WZ, uwagi.
- **Wydania** — data, produkt, ilość wydana, dział/cel wydania, kto wydał, uwagi.
- **Stan magazynowy** — liczony automatycznie: `stan początkowy + suma przyjęć − suma wydań`. Status "OK" / "DO ZAMÓWIENIA" (gdy stan ≤ 0 albo ≤ stan minimalny) wraz z sugerowaną ilością do zamówienia — identyczna logika jak w oryginalnym arkuszu.
- **Zamówienia** — formularz zamówienia (dostawca, zamawiający, dla kogo/dział, termin realizacji, status: Do akceptacji / Zaakceptowane / Odrzucone) z dowolną liczbą pozycji produkt+ilość. Przycisk **"Zamów braki automatycznie"** sam wypełnia zamówienie produktami o statusie "DO ZAMÓWIENIA" z sugerowaną ilością. Przycisk **"Wyślij / pobierz PDF"** generuje formularz zamówienia jako plik PDF i otwiera systemowe okno udostępniania (można wysłać mailem, WhatsApp itp. jednym dotknięciem na telefonie) — z fallbackiem do pobrania pliku, jeśli przeglądarka nie wspiera udostępniania plików.
- **Eksport do Excela** — pełny eksport (Stan magazynowy, Baza produktów, Przyjęcia, Wydania, Zamówienia) w układzie zbliżonym do oryginalnego arkusza.
- Moduł w pełni uczestniczy w systemie kopii zapasowych, Centrali i uprawnień — dane magazynowe są automatycznie objęte globalnym backupem/wysyłką do centrali, a dostęp do modułu "Magazyn" można ograniczać per użytkownik tak samo jak do pozostałych modułów.

## Poprawki — v40

**Pracownik może być teraz przypisany do kilku brygadzistów naraz** (np. gdy na jednej zmianie dzielą nadzór dwie osoby) — pole "Brygadziści" w formularzu pracownika zamieniło się z pojedynczego wyboru na checkboxy z wielokrotnym zaznaczaniem. Stare, pojedyncze przypisania są automatycznie migrowane przy pierwszym logowaniu po aktualizacji — nic nie trzeba poprawiać ręcznie.

**Wzmocniona synchronizacja brygadzisty z jego wpisem w Pracownicy** — dodano migrację i dodatkowe zabezpieczenie, żeby powiązanie na pewno się utrzymywało nawet dla brygadzistów utworzonych w bardzo wczesnych wersjach.

## Poprawki — v39

**Brygadziści nie mieli jak zaznaczyć własnej obecności** — byli osobnym bytem (do organizacji check-listy), więc nie pojawiali się na liście do zaznaczenia obecności. Naprawione: każdy brygadzista dostaje teraz automatycznie powiązany wpis w "Pracownicy" i pojawia się na swojej własnej check-liście (oznaczony małą odznaką "Brygadzista"), obok podległych mu pracowników — może więc sam zaznaczyć swoją obecność tak samo jak reszcie. Dotyczy to też brygadzistów utworzonych wcześniej — dostają taki wpis automatycznie przy pierwszym logowaniu po aktualizacji.

Usunięcie brygadzisty **nie kasuje** jego wpisu w Pracownikach (i historii jego obecności) — tylko odłącza powiązanie.

**Uwaga:** jeśli brygadzista obejmuje więcej niż jedną zmianę, jego własna obecność jest śledzona tylko na pierwszej z zaznaczonych zmian — w praktyce dotyczy to głównie brygadzistów przypisanych do jednej, konkretnej zmiany, co jest najczęstszym przypadkiem.

## Poprawki — v38

**Naprawiono przyczynę "utykania" numeru wersji.** Znalazłem dwa realne problemy:
- Tag `<title>` strony (widoczny np. na karcie przeglądarki/w tytule okna) nigdy nie był aktualizowany przy kolejnych wersjach — utknął na "v18" od samego początku, mimo że reszta aplikacji poprawnie pokazywała aktualną wersję. Naprawione i dopisane na stałe do procedury wersjonowania.
- Service Worker w rzeczywistości **zawsze serwował z cache**, mimo że komentarz w kodzie mówił o "network-first dla nawigacji" — przy ponownym otwarciu aplikacji przeglądarka mogła więc nie sprawdzać w ogóle, czy na serwerze jest coś nowszego. Naprawione: otwarcie/odświeżenie aplikacji zawsze najpierw próbuje pobrać najnowszą wersję z sieci, z cache korzysta tylko offline. Dodatkowo appka sama się teraz przeładowuje, gdy nowa wersja przejmie kontrolę — bez potrzeby ręcznego zamykania/otwierania.

**Obszary i brygadziści — dodano edycję.** Wcześniej można było tylko dodawać i usuwać — teraz przy każdym obszarze i brygadziście jest przycisk "Edytuj", który wczytuje dane do formularza do poprawy (bez konieczności usuwania i tworzenia od nowa).

**Wielu brygadzistów na jeden obszar — to już działało, ale nie było tego widać.** Model danych od początku na to pozwalał (każdy brygadzista ma po prostu przypisany obszar, niezależnie od innych) — problem był w czytelności. Lista brygadzistów jest teraz **pogrupowana wg obszaru**, więc od razu widać, że np. "ANTIPASTI" ma pod sobą 2 brygadzistów outsourcing i 3 etatowych, każdego z osobna, z własnymi zmianami.

## Poprawki — v37

**Stan magazynowy — liczba opakowań obok ilości zbiorczej.** Teraz przy każdym produkcie widać np. "Stan: 250 kg (10 szt. × 25 kg)" zamiast samej zbiorczej liczby. Dotyczy to również eksportu do Excela (nowa kolumna "Ilość opakowań (szt.)"). Dotyczy tylko produktów z uzupełnioną "Wielkością opakowania" w bazie produktów.

## Poprawki — v36

**Wczytywanie dostawy z pliku PDF (skan WZ)** — Magazyn → Przyjęcia → "📷 Wczytaj z pliku PDF (skan WZ)". Próbuje najpierw odczytać warstwę tekstową PDF-a, a jeśli to czysty skan bez tekstu (typowe dla zdjęcia telefonem zapisanego jako PDF) — automatycznie uruchamia rozpoznawanie tekstu z obrazu (OCR, offline, PL+EN). Rozpoznane produkty i ilości trafiają na listę pozycji do zatwierdzenia — dokładnie tę samą, co przy ręcznym dodawaniu przez wyszukiwarkę.

**Ważne zastrzeżenie:** to działa w 100% offline, bez żadnego AI do "rozumienia" dokumentu — dopasowanie do bazy produktów i szukanie ilości opiera się na prostych regułach tekstowych, więc **nigdy nie jest w pełni pewne**. Rozpoznane pozycje zawsze trafiają najpierw na listę do sprawdzenia, nigdy nie zapisują się automatycznie — zawsze przejrzyj i popraw ilości przed kliknięciem "Zapisz wszystkie przyjęcia".

## Poprawki i nowe funkcje — v35: Check-lista obecności

**Pierwsza zakładka Obecności przebudowana na prostą check-listę**, zamiast gęstego formularza z rozwijaną listą 11 statusów przy każdym pracowniku:

- Wybór **Obszar → Brygadzista → Zmiana** na górze (np. ANTIPASTI → Jan Kowalski → Zmiana 1).
- Poniżej lista pracowników przypisanych do tego brygadzisty na tej zmianie — przy każdym duży checkbox.
  - **Obecny w pełnym wymiarze** → zaznaczasz checkbox, gotowe (godziny liczą się automatycznie z definicji zmiany).
  - **Spóźnienie / inne godziny / inny status** (urlop, L4, delegacja itd.) → przycisk "⋯" przy pracowniku otwiera szczegóły, gdzie można wybrać dowolny status i wpisać godziny.
  - **Nieobecność** → zostawiasz checkbox pusty, system przy zapisie sam wpisze "NN".
  - Jeśli pracownik ma już zatwierdzony lub planowany urlop obejmujący ten dzień, jego wiersz automatycznie pokazuje kolorowy kod urlopu zamiast checkboxa — nic nie trzeba klikać.
- Jeden przycisk "Zapisz check-listę" na dole zapisuje wszystko naraz.

**Nowa konfiguracja administracyjna** (Obecność → Ustawienia → "Obszary i brygadziści", widoczne tylko dla administratora):
- CRUD obszarów (np. ANTIPASTI i inne).
- CRUD brygadzistów: imię i nazwisko, typ zatrudnienia (Etatowy / Outsourcing), przypisany obszar, zmiany które obejmuje.
- W formularzu pracownika nowe pole "Brygadzista" — przypisujesz każdego pracownika do konkretnej osoby odpowiedzialnej (lista filtruje się do brygadzistów obejmujących zmianę pracownika).

To pozwala odwzorować rzeczywistą strukturę: brygadziści etatowi mogą mieć własnych pracowników tylko na wybranych zmianach (np. tylko nocnej), a reszta pracowników jest przypisana do brygadzistów zatrudnionych z outsourcingu — wystarczy tak skonfigurować zmiany przy każdym brygadziście w panelu administracyjnym.

## Poprawki — v34

**Wyszukiwarka produktu zamiast rozwijanej listy** (Magazyn → Przyjęcia, Wydania, Zamówienia): wpisujesz nazwę produktu, system pokazuje podpowiedzi, wybierasz, podajesz ilość, zatwierdzasz — pozycja ląduje na liście na dole, a wyszukiwarka czyści się do kolejnego wpisu. Można tak dodać dowolnie wiele pozycji w jednym oknie, zanim zapiszesz wszystko naraz jednym przyciskiem.

- **Przyjęcia i Wydania** — nowe okno "Nowe przyjęcia"/"Nowe wydania" działa teraz wsadowo (wiele pozycji naraz, wspólna data/uwagi). Edycja pojedynczego, już zapisanego wpisu z listy nadal działa jak dotychczas (osobny, prostszy tryb edycji).
- **Zamówienia** — ten sam sposób dodawania pozycji (szukaj → wybierz → ilość → zatwierdź), z możliwością edycji ilości wprost na liście i usuwania pozycji.

## Poprawki i nowe funkcje — v33

**Zdalna akceptacja wniosków urlopowych (pełny obieg w dwie strony):**
- Status wniosku (Do akceptacji / Zatwierdzony / Odrzucony) może zmienić **wyłącznie administrator** — brygadzista już nie może sam sobie zatwierdzić urlopu. Widzi tylko podgląd statusu (i kto/kiedy podjął decyzję, gdy już zapadła).
- W module Centrala nowa sekcja **"Wnioski urlopowe do akceptacji"** — pokazuje wnioski ze statusem "Do akceptacji" z najnowszej przesyłki każdego brygadzisty. Zatwierdzenie/odrzucenie zapisuje decyzję lokalnie u Ciebie.
- Sekcja **"Decyzje do wysłania"** — grupuje podjęte decyzje per brygadzista, z przyciskiem do wysyłki (ten sam mechanizm udostępniania co reszta wysyłek — WhatsApp/e-mail/dowolna aplikacja).
- Po stronie brygadzisty: nowy przycisk **"Odbierz decyzję z centrali"** w zakładce Urlopy — wczytuje przesłany plik i automatycznie aktualizuje status jego wniosków, informując o wyniku.
- **Uczciwe zastrzeżenie:** to wymiana plików, nie powiadomienie na żywo — decyzja dotrze do brygadzisty dopiero, gdy wyślesz mu plik, a on go wczyta.

**Kalendarz — dwa widoki:**
- Dotychczasowy widok (siatka: pracownicy × dni miesiąca) zostaje jako **"Uproszczony"**.
- Nowy widok **"Pełny miesiąc"** — prawdziwy kalendarz ścienny (tygodnie w rzędach, dni w kolumnach) z nawigacją między miesiącami, pokazujący wszystkie urlopy (planowane i zatwierdzone) rozłożone na konkretne dni. Odrzucone wnioski się nie pokazują, bo do nich nie dojdzie.

## Poprawki — v32

- **Naprawiono rozjeżdżające się polskie znaki w PDF zamówienia** (Magazyn → Zamówienia → "Wyślij / pobierz PDF"). Domyślna czcionka biblioteki jsPDF nie obsługuje polskich znaków diakrytycznych (ą, ć, ę, ł, ń, ó, ś, ź, ż) — renderowały się jako urwane/rozjechane znaki (np. "Zamawiający" → rozjechane litery, "Dział" → "DziaB", "Ilość" → "Ilo["). Teraz tekst w PDF jest transliterowany na najbliższe odpowiedniki ASCII (np. "Zamawiający" → "Zamawiajacy") przed wydrukiem — czytelne, bez błędów, kosztem utraty ogonków w samym pliku PDF (reszta aplikacji nadal używa pełnych polskich znaków normalnie).

## Poprawki — v31

- **Uproszczony formularz przyjęcia dostawy** (Magazyn → Przyjęcia): usunięto datę (ustawiana automatycznie w tle, bez pytania) i nr dokumentu/WZ. Zostały: Produkt, Ilość, Rodzaj (Opakowania / Litry / Kilogramy), Razem (liczone automatycznie z Ilości i Rodzaju, ale można nadpisać ręcznie), Uwagi.

## Poprawki — v30

- **Cofnięcie błędnej kolizji kodów.** Generator wniosku .docx jest w pełni niezależny i ma własny, stały zestaw kodów (UW, UZ, UO, UD, OI, SW, D) — nie był i nie jest w żaden sposób zmieniany. W v29 błędnie nadpisałem znaczenie kodu **D** (który we wniosku od zawsze oznacza "odbiór za święto") Delegacją. Naprawione: **D = Odbiór za święto** (zgodnie z wnioskiem, liczy się jako nieobecność), **Delegacja dostała nowy, osobny kod DL** (na liście obecności, liczy się jako czas pracy). System ma teraz pełny, poszerzony zestaw działających typów, zgodny z niezależnym wnioskiem.

## Poprawki i zmiany — v29 (dzień testów)

- **Naprawiono brak liczenia godzin dla pracowników etatowych (3 zmiany).** Dane były liczone poprawnie od razu, ale statystyki, kalendarz i eksport Excel sztucznie pokazywały godziny tylko dla outsourcingu. Teraz wszyscy pracownicy mają liczone godziny pracy.
- **Delegacja przeniesiona z urlopów do listy obecności** — liczy się teraz jako czas pracy (wlicza się w godziny), a nie jako nieobecność.
- **Przebudowane typy urlopów**, zgodnie z generowanym wnioskiem: UW (wypoczynkowy), UZ (na żądanie), UD (bezpłatny), OI (opieka nad dzieckiem do lat 14), SW (siła wyższa), UO (okolicznościowy — ślub/urodzenie/zgon), OS (odbiór za święto). Usunięto "wolną sobotę" i "urlop dodatkowy". Generowany dokument .docx wniosku pozostał bez zmian.
- **Grupowanie zmian w formularzach** (Etatowi 3×8h / Outsourcing 2×12h) — czytelniejszy wybór zamiast jednej wymieszanej listy.
- **Zawsze widoczny przycisk instalacji** na ekranie głównym (📲 Zainstaluj aplikację) — niezależny od uprawnień do modułu Ustawienia, więc konta brygadzistów z ograniczonym dostępem też mogą zainstalować aplikację na urządzeniu.
- **Przy wylogowaniu** pojawia się teraz wybór: zrobić kopię zapasową i wysłać dane do centrali przed wylogowaniem, wylogować się od razu, albo anulować.

## Funkcje — weryfikacja dwuetapowa (2FA) dla administratorów

**Obowiązkowa dla kont z rolą Administrator** (konta "Brygadzista" jej nie mają — nie są tego typu ryzykiem). Zbudowana w całości offline, bez żadnej biblioteki zewnętrznej do samego algorytmu — działa z Google Authenticator, Microsoft Authenticator, Authy i podobnymi aplikacjami (standard TOTP, RFC 6238).

- **Konfiguracja jest wymuszana automatycznie** — każde konto administratora bez włączonego 2FA zostaje poprowadzone przez ekran konfiguracji zaraz po podaniu poprawnego hasła (dotyczy to zarówno pierwszego konta zakładanego przy pierwszej konfiguracji urządzenia, jak i kolejnych kont administratora dodanych przez innego admina — każde z nich konfiguruje 2FA przy swoim pierwszym logowaniu).
- Ekran konfiguracji pokazuje kod QR do zeskanowania **oraz zawsze też klucz w postaci tekstu** do ręcznego wpisania (na wypadek braku internetu przy generowaniu QR) — trzeba wpisać jeden wygenerowany kod, żeby potwierdzić.
- Zaraz po włączeniu 2FA aplikacja pokazuje **8 jednorazowych kodów zapasowych** — trzeba je zapisać w bezpiecznym miejscu. Każdy działa tylko raz i pozwala zalogować się, jeśli zgubisz telefon z aplikacją Authenticator.
- Przy logowaniu: po haśle następuje drugi krok — 6-cyfrowy kod z aplikacji (albo, jeśli go nie masz, jeden z kodów zapasowych).
- Administrator może zresetować 2FA innemu administratorowi (Ustawienia → Użytkownicy tego urządzenia → "Resetuj 2FA") — przydatne przy zgubieniu telefonu; konto zostanie zmuszone do konfiguracji od nowa przy następnym logowaniu.
- **Ważne ograniczenie, takie samo jak przy hasłach i pieprzu:** sekret 2FA leży w tej samej bazie na urządzeniu co reszta danych. To realnie chroni przed odgadniętym, podpatrzonym albo współdzielonym hasłem — nie chroni przed kimś, kto ma bezpośredni dostęp do narzędzi deweloperskich na tym konkretnym urządzeniu.
- Sesja pozostaje zalogowana między otwarciami aplikacji (tak jak dotychczas) — 2FA jest wymagane tylko przy faktycznym logowaniu, nie przy każdym powrocie do już zalogowanej sesji.

## Funkcje — logowanie i uprawnienia

**Ważne ograniczenie, które musisz znać:** to NIE jest prawdziwe zabezpieczenie danych. Aplikacja nie ma serwera — cały kod (łącznie z wartością "pieprzu" użytą do haszowania haseł) działa w przeglądarce osoby, która się loguje. Ktoś z podstawową znajomością narzędzi deweloperskich w przeglądarce może odczytać dane wprost z IndexedDB albo ominąć ekran logowania. To co poniżej daje realny porządek organizacyjny i ogranicza przypadkowy dostęp do niewłaściwych modułów — nie chroni przed kimś naprawdę zdeterminowanym.

**Konta są ściśle przypisane do jednego urządzenia** — nie ma wspólnego serwera, więc nie ma jednej listy kont dla całej firmy. Każdy telefon/tablet ma swoją własną, niezależną listę kont, konfigurowaną fizycznie na tym urządzeniu.

- **Pierwsze uruchomienie na danym urządzeniu:** ekran logowania wykrywa brak kont i pokazuje formularz zakładania pierwszego konta — teraz z wyborem typu konta: **Administrator** (pełny dostęp) albo **Brygadzista** (od razu z wyborem modułów, tak jak przy dodawaniu kolejnych kont). To pozwala skonfigurować telefon brygadzisty w jednym kroku, zamiast najpierw zakładać admina i dopiero potem dodawać ograniczone konto. Przy wyborze "Brygadzista" aplikacja pokazuje ostrzeżenie, jeśli będzie to jedyne konto na urządzeniu — bo wtedy nie będzie tam lokalnego administratora do późniejszego zarządzania kontami. Przy okazji ustawia się tam wartość "pieprzu" (patrz niżej) — domyślnie losowa, można wpisać własną.
- **Logowanie standardowe:** login + hasło. Hasło jest haszowane (SHA-256) z solą (losową, unikalną dla każdego konta, generowaną automatycznie) i pieprzem (wspólną wartością dla całego urządzenia, ustawianą przez administratora) — nigdzie nie jest zapisywane w jawnej postaci.
- **Administrator** (moduł Ustawienia → "Użytkownicy tego urządzenia") może na tym konkretnym urządzeniu:
  - dodawać kolejne konta (login, hasło, rola: Administrator albo Pracownik z wybranymi modułami),
  - zmieniać, do których modułów dany pracownik ma dostęp (Nadziewarki / Satelity / Obecność / Centrala / Ustawienia),
  - resetować hasło dowolnego konta,
  - usuwać konta (poza swoim własnym, zalogowanym),
  - w sekcji zaawansowanej zmienić "pieprz" — unieważnia to hasła wszystkich kont na tym urządzeniu, każdy dostaje potem nowe hasło przez reset. **Aktualna wartość pieprzu nie jest nigdzie wyświetlana w interfejsie** (nawet administratorowi) — można ją tylko zmienić, nigdy podejrzeć, żeby nie pojawiła się przypadkowo na zrzucie ekranu.
- **Pracownik bez uprawnień admina** widzi na ekranie głównym wyłącznie kafelki modułów, do których dostał dostęp — pozostałe są ukryte. Próba otwarcia modułu spoza uprawnień (np. przez wcześniej zapamiętany stan) jest blokowana z komunikatem.
- **Login zastąpił wcześniejszy, osobny "kod brygadzisty"** używany przy wysyłce do centrali — to duże uproszczenie: tożsamość w module Centrala to teraz po prostu login danej osoby, nadany raz przez administratora zakładającego jej konto. Nie trzeba już nic dodatkowo wpisywać przy wysyłce.
- Konta (`users`) są celowo wykluczone z ogólnego backupu/importu/wysyłki do centrali — wczytanie paczki od brygadzisty albo przywrócenie backupu nigdy nie nadpisze Twoich własnych kont na Twoim urządzeniu.

## Funkcje — moduł Centrala (dane od brygadzistów)

Model pracy: Twoje urządzenie to centrala, a urządzenia brygadzistów działają autonomicznie (offline, własna lokalna baza). Raz na dobę (automatycznie) albo ręcznie brygadzista przygotowuje i wysyła paczkę swoich danych do Ciebie (WhatsApp/e-mail/dowolny kanał — aplikacja nie ma własnego serwera, więc transport pliku wykonuje człowiek). Ty wczytujesz paczkę w module Centrala, a aplikacja sama przypisuje ją do właściwego brygadzisty i dokłada do scentralizowanej bazy.

**Strona brygadzisty** (karta "Wysyłka do centrali" w Ustawieniach):
- **Przypomnienie o końcu zmiany** (opcjonalne) — na podstawie zmiany wybranej w module Obecność ("Moja zmiana") aplikacja liczy godzinę jej zakończenia i pokazuje na ekranie głównym baner z jednym przyciskiem "Wyślij teraz". Można dodatkowo włączyć próbę powiadomienia systemowego (wymaga zgody przeglądarki). **Ograniczenie:** to działa tylko, dopóki aplikacja jest otwarta (choćby w tle) — nie ma tu prawdziwych powiadomień push, które obudziłyby całkowicie zamkniętą aplikację; to wymagałoby własnego serwera.
- Tożsamość to **login konta**, którym się zalogował — nic dodatkowego nie trzeba wpisywać (patrz sekcja "Logowanie i uprawnienia" powyżej — to ona teraz odpowiada za trwałą identyfikację, zamiast wcześniejszego osobnego "kodu brygadzisty").
- Automatyczne przygotowanie paczki raz na dobę (działa tylko, gdy aplikacja jest otwarta — przeglądarki nie pozwalają na wysyłkę w tle) lub wysyłka ręczna na żądanie.
- Wysyłka używa Web Share API (bezpośredni wybór WhatsApp/e-mail na telefonie) z fallbackiem do pobrania pliku JSON.
- Wysyłka NIE usuwa i NIE zmienia niczego w lokalnej bazie brygadzisty.

**Strona centrali** (moduł "🏢 Centrala"):
- Wczytanie paczki JSON od brygadzisty — automatyczne przypisanie po loginie (widocznym też w interfejsie obok imienia, np. "[jkowalski]").
- Każda przesyłka to osobny, oznaczony zapis (nie nadpisuje danych roboczych centrali) — lista brygadzistów z historią przesyłek, podglądem liczby rekordów w każdej z nich, możliwością pobrania, usunięcia lub świadomego wczytania wybranej przesyłki do bazy roboczej centrali.
- **Ważne ograniczenie:** każde urządzenie generuje własne, niezależne identyfikatory rekordów. Wczytanie przesyłki do bazy roboczej *nadpisuje* bazę roboczą danymi z tej przesyłki (nie łączy automatycznie danych wielu brygadzistów w jedną wspólną tabelę) — to świadomy wybór, żeby uniknąć cichego nadpisywania niepowiązanych rekordów o tych samych ID z różnych urządzeń.
- **Loginy muszą być unikalne i nadawane centralnie przez administratora danego urządzenia** — skoro to administrator zakłada każde konto, nie ma ryzyka przypadkowego powielenia tożsamości tak jak przy wcześniejszym, ręcznie wpisywanym kodzie.

## Wspólne dla wszystkich modułów

- Działa offline (Service Worker), dane w IndexedDB (trwałe, nie cache przeglądarki).
- Instalowalna jako PWA na Androidzie i Windows 11.
- Licznik urządzeń w nagłówku.
- Logo "Perla Pełna Dobra" w nagłówku, stonowana jasna szata graficzna.

## Wdrożenie na Netlify

1. Wgraj zawartość tego folderu do repozytorium GitHub.
2. W Netlify: **Add new site → Import an existing project** → wybierz repozytorium.
3. Build command: (puste / brak), Publish directory: `.` (już ustawione w `netlify.toml`).
4. Deploy — od tej pory każdy push do repo automatycznie aktualizuje stronę.

## Instalacja na urządzeniu

- **Android (Chrome):** wejdź na adres Netlify → menu (⋮) → "Zainstaluj aplikację" / "Dodaj do ekranu głównego".
- **Windows 11 (Edge/Chrome):** wejdź na adres → ikona instalacji w adresowej pasku → "Zainstaluj".

## Struktura plików

```
index.html      - interfejs aplikacji (oba moduły)
app.js          - logika modułu Nadziewarki + nawigacja modułów
satelity.js     - logika modułu Satelity
db.js           - warstwa IndexedDB (wszystkie stores)
manifest.json   - manifest PWA
sw.js           - service worker (offline)
assets/         - logo
icons/          - ikony PWA
netlify.toml    - konfiguracja Netlify
```

## Wersjonowanie

Każda kolejna zmiana = nowy numer wersji w nazwie pliku/folderu oraz w `short_name` manifestu i `CACHE_NAME` w `sw.js`.
