# Zabezpieczenie bazy Firestore (zamiast "trybu testowego")

Pamiętasz "tryb testowy" z Kroku 3 pierwszej instrukcji? Ten tryb jest **tymczasowy i wygasa po 30 dniach** — trzeba go zastąpić właściwymi regułami. To zajmie 2 minuty.

## Uczciwe wyjaśnienie, zanim zaczniesz

Ta aplikacja **nie ma systemu logowania po stronie Firebase** — telefony i komputery wysyłają dane bez podawania hasła do samej bazy (logowanie w aplikacji to zupełnie inna, osobna sprawa). To oznacza, że pełnej, "twardej" ochrony jak w banku tu nie zbudujemy bez znacznie większej przebudowy. Reguły poniżej robią to, co realnie możliwe przy tym podejściu: **pozwalają dopisywać nowe dane, ale nie pozwalają nikomu ich zmieniać ani kasować**, i sprawdzają, czy przesłane dane w ogóle wyglądają jak prawdziwa paczka z aplikacji (nie byle co).

Dla wewnętrznego narzędzia firmowego, z adresem strony nieznanym publicznie, to jest rozsądny, praktyczny kompromis. Gdybyś kiedyś chciał mocniejszego zabezpieczenia — da się to rozbudować, ale to już większy projekt.

## Jak wkleić reguły

1. Wejdź na **console.firebase.google.com**, otwórz swój projekt "Higiena Centrala"
2. Z menu po lewej: **Build** → **Firestore Database**
3. Kliknij zakładkę **Rules** (u góry, obok "Data")
4. **Zaznacz i usuń** całą obecną zawartość okna z regułami
5. **Wklej poniższy tekst w całości:**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /submissions/{docId} {
      allow create: if request.resource.data.keys().hasAll(['kind', 'brygadzista', 'stores'])
                    && request.resource.data.kind == 'centrala-submission'
                    && request.resource.size() < 5000000;
      allow read: if true;
      allow update, delete: if false;
    }
  }
}
```

6. Kliknij **Publish** (niebieski przycisk w prawym górnym rogu)

Gotowe — od tego momentu baza jest zabezpieczona regułami zamiast tymczasowego trybu testowego, bez żadnego limitu czasowego.
