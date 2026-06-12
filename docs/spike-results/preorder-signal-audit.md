# Spike: Store Preorder Signal Audit

**Story:** 1.7  
**Date:** 2026-06-12  
**Dev:** Dev A  
**Gate for:** Epic 8 (Upcoming / Preorders)

---

## Wynik

**GO — Epic 8 proceeds with preorder section for AlePlanszowki; "new releases last 30 days" fallback for 3Trolle.**

---

## AlePlanszowki — WYSOKA wiarygodność

**URL:** https://aleplanszowki.pl/

### Sygnał preorder

Badge SVG + label tekstowy widoczny bezpośrednio na karcie produktu:

```html
<img src="https://aleplanszowki.pl/themes/aleplanszowki/assets/img/available-presale.svg"
     alt="Przedsprzedaż"/>
<span>Przedsprzedaż</span>
```

Selektor do scrapera:
```python
# Sprawdzenie: czy img[src] zawiera 'available-presale'
availability = response.css('img[src*="available-presale"]')
```

### Wszystkie stany dostępności

| Stan | Plik SVG | Tekst etykiety | Klasa CSS |
|------|----------|----------------|-----------|
| Dostępne | `available-all.svg` | "Dostępne" | `.available-all` |
| Przedsprzedaż | `available-presale.svg` | "Przedsprzedaż" | `.available-presale` |
| Ostatnie sztuki | `available-last.svg` | "Ostatnie sztuki" | `.available-last` |

### Struktura HTML produktu

```html
<div class="product-item">
  <a href="[url]"><img src="[cover]" alt="[tytuł]"></a>
  <span class="product-category">Gry Planszowe / Gry Karciane</span>
  <h3><a href="[url]">[tytuł]</a></h3>
  <div class="product-pricing">
    <span class="base-price">69,95 zł</span>
    <span class="sale-price">56,95 zł</span>
  </div>
  <button class="add-to-cart">Dodaj do koszyka</button>
  <img src=".../available-presale.svg" alt="Przedsprzedaż"/>
  <span>Przedsprzedaż</span>
</div>
```

### Data premiery

Nie widoczna na stronie listingu. Może być na stronie produktu — wymaga osobnego fetcha w razie potrzeby. **Nie blokuje Epic 8 MVP.**

### Obsługa "brak w magazynie"

Produkty niedostępne nie pojawiają się na listingach. Brak stanu "Niedostępne" — produkty znikają z katalogu. Sprawdzenie out-of-stock: brak `available-*.svg` + brak przycisku koszyka.

### Ocena spójności

Sprawdzono 5+ kart produktów. Pattern SVG + tekst jest spójny na wszystkich kartach. **Spójność: WYSOKA.**

---

## 3Trolle — ŚREDNIA wiarygodność

**URL:** https://www.3trolle.pl/

### Brak explicitnego sygnału preorder

Sklep **nie używa etykiet "Przedsprzedaż"** na stronach listingów. Jedynym sygnałem dostępności jest tekst czasu wysyłki w sekcji `.shipping-info`.

### Stany dostępności przez czas wysyłki

| Tekst | Interpretacja | Pewność |
|-------|---------------|---------|
| "Wysyłka w 24 godzin" | W magazynie | WYSOKA |
| "Wysyłka w ciągu 3–5 dni roboczych" | W magazynie | WYSOKA |
| "Wysyłka w ciągu 7–14 dni" | Przedsprzedaż lub uzupełnianie | NISKA |
| "Wysyłka w ciągu 7–21 dni roboczych" | Przedsprzedaż lub zamówienie specjalne | NISKA |

### Struktura HTML produktu

```html
<div class="product-miniature js-product-miniature" data-id-product="37851">
  <span class="badge">Nowy</span>
  <span class="badge free-shipping">Darmowa Dostawa</span>
  <h2>[tytuł]</h2>
  <span class="price">[cena]</span>
  <button class="add-to-cart">Dodaj do koszyka</button>
  <div class="shipping-info">Wysyłka w 24 godzin</div>
</div>
```

Selektor czasu wysyłki:
```python
shipping_text = response.css('.shipping-info::text').get()
# np. "Wysyłka w 24 godzin" → in_stock=True
# np. "Wysyłka w ciągu 7-14 dni" → niejednoznaczne
```

### Problem: brak rozróżnienia preorder vs. restocking

Okno 7–21 dni może oznaczać:
- Przedsprzedaż przed premierą
- Produkt chwilowo niedostępny (czeka na dostawę)
- Zamówienie u wydawcy

Bez daty premiery i bez explicitnej etykiety nie ma pewnego sposobu odróżnienia preorder od restocking.

### Obsługa "brak w magazynie"

Produkty wyczerpane nie pojawiają się na standardowych listingach. Brak stanu "Niedostępne" widoczny na kartach.

### Ocena spójności

`.shipping-info` pojawia się konsekwentnie. Jednak **semantyka wartości jest niejednoznaczna** — ta sama klasa CSS obsługuje zarówno "w magazynie" jak i "w przedsprzedaży". **Spójność: ŚREDNIA.**

---

## Decyzja Epic 8

| Kryterium | AlePlanszowki | 3Trolle |
|-----------|--------------|---------|
| Explicitny sygnał preorder | ✅ SVG badge `.available-presale` | ❌ brak |
| Explicitny sygnał dostępności | ✅ 3 stany SVG | ⚠️ tylko czas wysyłki |
| Data premiery na listingu | ❌ niedostępna | ❌ niedostępna |
| Spójność HTML | WYSOKA | ŚREDNIA |
| Możliwość scrapowania | Pewna | Heurystyczna |

**Decyzja:**

> **GO — Epic 8 proceeds with preorder section for AlePlanszowki.**
> **Epic 8 for 3Trolle: "new releases last 30 days" only** (brak wiarygodnego preorder signal).

Konkretnie dla scrapera:
- `AlePlanszowkiSpider`: zbiera `is_preorder = True` gdy `img[src*="available-presale"]` — bezpośrednio do tabeli `upcoming_games`
- `ThreeTrolleSpider`: brak `is_preorder` — `upcoming_games` zasilany tylko grami z `price_history.scraped_at >= now() - 30 days` które mają `bgg_sync_status = 'synced'`

---

## Do zrobienia przed Epic 8

- [ ] Zweryfikować czy data premiery jest na stronach produktów AlePlanszowki (fetch 1 produktu "Przedsprzedaż")
- [ ] Sprawdzić czy URL produktów AlePlanszowki zawiera slug `-przedsprzedaz` — dodatkowy sygnał dla deduplikacji
- [ ] 3Trolle: sprawdzić czy istnieje `/przedsprzedaz/` podstrona z osobną strukturą (może mieć inny HTML niż listing główny)
