# Co jest w tej paczce

Wszystkie cztery foldery zmienione (tylko plik graficzny, zero zmian w kodzie):
- `zszd-higiena-admin-PWA-v135`
- `zszd-higiena-admin-desktop-v86` (package.json 2.6.3)
- `zszd-higiena-brygadzista-PWA-v93`
- `zszd-higiena-brygadzista-desktop-v15` (package.json 2.6.3 — nadal bajt-w-bajt identyczny kod z Admin desktop)

---

## ZMIANA: logo "Perła" zastąpione logiem "WBLACK"

Podmieniony plik `assets/logo.png` we wszystkich czterech wersjach (dokładnie ten sam plik graficzny wszędzie).

**Jak dopasowałem tło:** sprawdziłem, że dotychczasowe logo miało przezroczyste tło (dzięki temu pasowało automatycznie do każdego miejsca w interfejsie, bez sztywno ustawionego koloru) — zastosowałem to samo podejście do nowego logo. Usunąłem czarne tło z Twojego pliku i zastąpiłem je przezroczystością, więc nowe logo też będzie pasować wszędzie, niezależnie od tła danego ekranu.

**Dolna dekoracja (kreski + kropka pod napisem "WBLACK"):** usunięta, zgodnie z prośbą.

Sam symbol "W3" na górze i napis "WBLACK" pod spodem zostały bez zmian — tylko wycięte z oryginalnego tła i przycięte do właściwej zawartości.

### Jak sprawdzić
Otwórz ekran logowania — nowe logo powinno być widoczne na górze, z przezroczystym tłem (bez czarnego prostokąta wokół), bez dolnych kresek.
