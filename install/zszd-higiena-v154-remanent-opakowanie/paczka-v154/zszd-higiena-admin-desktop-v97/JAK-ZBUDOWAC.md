# ZSZD Higiena ADMIN — wersja na Windows

Instrukcja krok po kroku. Robisz to **raz**; kolejne wersje to już tylko jedna komenda.

---

## NAJSZYBSZA DROGA: ZBUDUJ.bat, potem ZAINSTALUJ.bat

Jeśli masz już zainstalowany (albo rozpakowany) Node.js — **kliknij dwukrotnie plik `ZBUDUJ.bat`** w tym folderze. Zrobi wszystko sam:

1. Znajdzie Node.js
2. Zainstaluje składniki
3. Zbuduje plik .exe
4. Otworzy folder z gotowym plikiem

Jeśli nie znajdzie Node.js, zapyta o ścieżkę do folderu z `node.exe` — wpisujesz raz, zapamiętuje na przyszłość.

Na końcu zapyta, czy od razu zainstalować aplikację. Jeśli odpowiesz tak, uruchomi `ZAINSTALUJ.bat` (opis niżej).

---

## INSTALACJA: plik ZAINSTALUJ.bat

Gotowy plik .exe działa od razu, ale wygodniej mieć go w stałym miejscu ze skrótem na pulpicie. Od tego jest `ZAINSTALUJ.bat`.

**Co robi:**

1. Pyta, gdzie zainstalować — do wyboru:
   - Twój folder domowy (`C:\Users\TwojaNazwa\ZSZD Higiena`) — zalecane
   - Ukryty folder aplikacji (`AppData\Local`)
   - Własna ścieżka, którą wpisujesz sam (np. `D:\Programy\ZSZD`)
2. Kopiuje tam aplikację
3. Tworzy **skrót na pulpicie** i w **Menu Start**
4. Pyta, czy uruchomić od razu

**Bez uprawnień administratora** — wszystko dzieje się w Twoim profilu użytkownika.

**Aktualizacja:** po zbudowaniu nowej wersji uruchom `ZAINSTALUJ.bat` ponownie i wskaż ten sam folder. Plik zostanie podmieniony, skróty zostają, dane też — leżą w `%AppData%\zszd-higiena-admin`, niezależnie od tego, gdzie jest sam program.

---

Poniżej opisana jest ta sama procedura ręcznie, gdyby coś poszło nie tak.

---

## Zanim zaczniesz — czy to na pewno potrzebne?

Wersja desktopowa daje trzy rzeczy, których przeglądarka nie potrafi:

1. **Paczki zapisują się same do folderu** — bez klikania, bez powiadomień „wrzuć plik"
2. **Centrala wczytuje paczki z folderu jednym kliknięciem** — bez szukania w Pobranych
3. Zwykłe okno na pulpicie, duży ekran

Jeśli te trzy rzeczy nie są dla Ciebie ważne — wersja PWA (przeglądarkowa) jest w paczce obok i działa bez żadnej instalacji.

---

## KROK 1 — Zainstaluj Node.js

1. Wejdź na **https://nodejs.org**
2. Pobierz wersję z napisem **LTS** (zalecana, po lewej)
3. Uruchom instalator, klikaj **Next** aż do końca (nic nie zmieniaj)
4. Zrestartuj komputer

**Sprawdzenie, czy się udało:**
- Naciśnij `Windows + R`, wpisz `cmd`, Enter
- Wpisz: `node --version` i Enter
- Powinno pokazać coś w stylu `v20.11.0`. Jeśli tak — gotowe.

---

## KROK 2 — Rozpakuj projekt

Rozpakuj folder `zszd-higiena-admin-desktop` w wygodne miejsce, na przykład:

```
C:\ZSZD\zszd-higiena-admin-desktop
```

Unikaj pulpitu i folderów z polskimi znakami w nazwie — czasem sprawiają problemy.

---

## KROK 3 — Zainstaluj składniki (raz)

1. Otwórz folder projektu w Eksploratorze
2. Kliknij w **pasek adresu** u góry (tam gdzie ścieżka), wpisz `cmd` i naciśnij Enter
   — otworzy się czarne okno już w tym folderze
3. Wpisz i zatwierdź:

```
npm.cmd install
```

Potrwa 2–5 minut, poleci dużo tekstu. To normalne.

Jeśli na końcu zobaczysz ostrzeżenie `allow-scripts ... electron@... (install scripts present)`, zatwierdź je i powtórz instalację:

```
npm.cmd approve-scripts electron
npm.cmd install
```

---

## KROK 4 — Sprawdź, czy działa (bez budowania)

W tym samym oknie:

```
npm start
```

Powinno otworzyć się okno aplikacji ZSZD Higiena ADMIN. Zamknij je, żeby wrócić do konsoli.

**Jeśli okno się otworzyło — wszystko jest dobrze.**

---

## KROK 5 — Zbuduj .exe

W PowerShell **najpierw** wyłącz szukanie certyfikatu (osobna linia, Enter):

```
$env:CSC_IDENTITY_AUTO_DISCOVERY="false"
```

Potem:

```
npm.cmd run build
```

> Uwaga: w PowerShell używaj `npm.cmd`, nie samego `npm` — inaczej zablokuje to polityka uruchamiania skryptów.

Potrwa 3–10 minut. Gotowy plik:

```
dist\ZSZD-Higiena-ADMIN-portable-1.6.3.exe
```

Jeden plik. **Nie wymaga instalacji ani uprawnień administratora** — po prostu go uruchamiasz. Możesz trzymać go na pendrive, w Dokumentach, gdziekolwiek.

Przy pierwszym uruchomieniu rozpakowuje się do folderu tymczasowego, więc startuje kilka sekund dłużej. To normalne.

Windows może pokazać ostrzeżenie SmartScreen (plik nie jest podpisany certyfikatem) — klikasz "Więcej informacji" → "Uruchom mimo to".

---

## Gdzie trzymane są dane

Dane zapisują się w profilu użytkownika Windows, **nie w pliku .exe**:

```
C:\Users\TwojaNazwa\AppData\Roaming\zszd-higiena-admin
```

To ważne w praktyce: możesz podmienić plik .exe na nowszą wersję, przenieść go w inne miejsce albo skopiować na pendrive — dane zostają nietknięte.

---

## PIERWSZE URUCHOMIENIE — ustaw folder na paczki

To jest ta funkcja, dla której warto było:

1. Otwórz aplikację, zaloguj się
2. Wejdź w **Ustawienia**
3. Znajdź panel **„💻 Folder na paczki danych (wersja desktopowa)"**
4. Kliknij **„📁 Wskaż folder"**
5. Wybierz folder synchronizowany z Dyskiem Google
   (np. `C:\Users\TwojaNazwa\Google Drive\Centrala ZSZD`)

Od tej pory paczki zapisują się tam **automatycznie**, a Dysk Google sam je synchronizuje.

W module **Centrala** pojawi się też panel **„💻 Paczki w folderze centrali"** — paczki od brygadzistów wczytasz jednym kliknięciem, bez szukania plików.

---

## PRZENIESIENIE DANYCH z wersji przeglądarkowej

Wersja desktopowa ma **własną, osobną bazę** — nie widzi danych z przeglądarki. Przeniesienie robisz raz:

1. W **przeglądarce**: Ustawienia → Kopie zapasowe → **Eksportuj wszystko** (zapisze plik .json)
2. W **aplikacji desktopowej**: Ustawienia → Kopie zapasowe → **Wczytaj kopię** → wskaż ten plik

Gotowe — wszystkie dane są w wersji desktopowej.

---

## AKTUALIZACJA do nowszej wersji

Gdy dostaniesz nową paczkę:

1. Rozpakuj ją obok starej (nie nadpisuj od razu — stara niech zostanie jako zapas)
2. W nowym folderze otwórz `cmd` (jak w kroku 3) i wpisz:
   ```
   npm.cmd install
   $env:CSC_IDENTITY_AUTO_DISCOVERY="false"
   npm.cmd run build
   ```
3. Podmień stary plik .exe na nowy z folderu `dist`

**Dane zostają** — są zapisane w profilu użytkownika, nie w pliku .exe.

---

## Gdyby coś nie zadziałało

**`npm` nie jest rozpoznawane jako polecenie**
→ Node.js nie zainstalował się poprawnie albo komputer nie był restartowany. Zrestartuj i sprawdź `node --version`.

**Błędy przy `npm.cmd install`**
→ Sprawdź połączenie z internetem (pobiera składniki z sieci). Spróbuj ponownie.

**Okno aplikacji jest białe**
→ Zamknij, uruchom `npm start` ponownie. Jeśli dalej białe — daj znać, sprawdzimy razem.

**Budowanie kończy się błędem o uprawnieniach**
→ Otwórz `cmd` jako administrator (prawy przycisk na „Wiersz polecenia" → „Uruchom jako administrator").

---

## Co zostaje bez zmian

- **Aplikacja BRYGADZISTA** — dalej PWA na telefonie, nic się nie zmienia
- **Wersja PWA aplikacji ADMIN** — dołączona w tej samej paczce, działa jak dotąd
- **Wszystkie moduły i dane** — ten sam kod, ta sama logika
