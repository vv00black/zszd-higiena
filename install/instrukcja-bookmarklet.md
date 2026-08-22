# Skrót "jeden klik" do pobierania danych z 10.0.60.24

Zamiast otwierać konsolę i wklejać kod za każdym razem, dodajesz to raz jako zakładkę w przeglądarce — potem to już tylko jedno kliknięcie.

## Krok 1: Dodaj zakładkę (robisz to raz)

1. W Chrome/Edge naciśnij **Ctrl+Shift+O** — otworzy się Menedżer zakładek
2. Kliknij **trzy kropki** w prawym górnym rogu tego okna → **Dodaj nową zakładkę**
3. W polu **Nazwa** wpisz: `ZSZD - pobierz dane`
4. W polu **URL** — otwórz plik `bookmarklet-zszd-import.txt` (ten, który wysłałem), **zaznacz cały tekst, skopiuj** (zaczyna się od `javascript:...`), i **wklej** w to pole URL
5. Zapisz

## Krok 2: Pokaż pasek zakładek, żeby mieć do tego szybki dostęp (opcjonalnie, ale wygodne)

Naciśnij **Ctrl+Shift+B** — pod paskiem adresu pojawi się pasek z zakładkami. Nowa zakładka "ZSZD - pobierz dane" powinna tam być widoczna (jeśli nie — w Menedżerze zakładek przeciągnij ją do folderu "Pasek zakładek").

## Jak z tego korzystać (od teraz, raz w tygodniu)

1. Wejdź na `10.0.60.24`, zaloguj się
2. Kliknij zakładkę **"ZSZD - pobierz dane"** na pasku
3. To wszystko — pojawi się to samo okienko z podglądem i pytaniem "wysłać?", co poprzednio, tylko bez konieczności otwierania konsoli i wklejania tekstu

## Uwaga

Ten sposób robi dokładnie to samo, co poprzedni skrypt do konsoli — tylko wygodniej się go uruchamia. Nadal wymaga, żebyś **ręcznie** wszedł na 10.0.60.24 i kliknął — to nie dzieje się samo w tle. Jeśli kiedyś zechcesz pełnej automatyzacji (bez klikania czegokolwiek, raz w tygodniu samo), daj znać — to już osobny, większy projekt (wspominałem o nim jako "Opcja B").
