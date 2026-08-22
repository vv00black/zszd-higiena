# Zakładanie bazy danych Firebase (jednorazowo)

Ta część jest **jednorazowa** — zajmie około 10 minut. Wykonaj to, a potem prześlij mi jedną rzecz, o którą poproszę na końcu — dopiero wtedy będę mógł dopisać nową opcję do Centrali.

Interfejs jest po angielsku — nazwy przycisków po angielsku w **pogrubieniu**.

---

## Krok 1: Wejdź na konsolę Firebase

1. Wejdź na **console.firebase.google.com**
2. Zaloguj się swoim kontem Google (tym samym co np. Gmail/Dysk Google)

## Krok 2: Utwórz nowy projekt

1. Kliknij **Create a Firebase project** (lub **Add project**)
2. Wpisz nazwę, np. `zszd-higiena` — kliknij **Continue**
3. Możesz wyłączyć Google Analytics (przełącznik) — nie jest nam potrzebny do niczego. Kliknij **Continue** / **Create project**
4. Poczekaj chwilę, aż Google przygotuje projekt, kliknij **Continue** na koniec

## Krok 3: Włącz bazę danych (Firestore)

1. Po lewej stronie znajdź menu i kliknij **Build** → **Firestore Database**
2. Kliknij **Create database**
3. Wybierz lokalizację najbliżej Polski, np. `eur3 (europe-west)` — kliknij **Next**
4. Wybierz tryb **Start in test mode** — kliknij **Create**

**Ważne:** "test mode" oznacza, że na razie każdy z linkiem może czytać/zapisywać dane. To wystarczy na start (i tak nikt poza Wami nie zna adresu Waszej bazy) — o prawdziwe zabezpieczenie zadbamy razem w kolejnym kroku po mojej stronie, w kodzie aplikacji.

## Krok 4: Dodaj aplikację webową do projektu

1. Wróć na stronę główną projektu (ikona domku albo nazwa projektu w lewym górnym rogu)
2. Kliknij ikonę **`</>`** (Web) — to dodaje "aplikację webową" do Twojego projektu
3. Wpisz nazwę, np. `zszd-web` — **NIE** zaznaczaj "Also set up Firebase Hosting" (tego nie potrzebujemy, hosting już masz gdzie indziej)
4. Kliknij **Register app**

## Krok 5: Skopiuj dane konfiguracyjne — TO jest to, czego potrzebuję

Po zarejestrowaniu zobaczysz fragment kodu wyglądający mniej więcej tak:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "zszd-higiena.firebaseapp.com",
  projectId: "zszd-higiena",
  storageBucket: "zszd-higiena.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

**Skopiuj ten cały fragment (od `const firebaseConfig` do zamykającego `};`) i wyślij mi go** w wiadomości — na tej podstawie dopiszę nową opcję do Centrali.

To nie jest hasło ani nic tajnego w tym sensie, że ktoś mógłby się nim od razu zalogować na Twoje konto Google — ale traktuj to jako dane techniczne Twojej firmy, nie publikuj ich publicznie poza tą rozmową.

## Krok 6: Kliknij "Continue to console"

To już wszystko z Twojej strony na razie — resztę (dopisanie nowej opcji w Centrali, korzystającej z tej bazy) zrobię ja, gdy dostanę dane z Kroku 5.
