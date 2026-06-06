# Agregator Cen Planszówek

> Agregator promocji gier planszowych z polskich sklepów internetowych. Rozumie planszówki — nie tylko ceny.

Polskie sklepy planszówkowe regularnie organizują flash-sale, które giną w szumie grup na Facebooku. i-szop.pl istnieje, ale traktuje planszówki jak każdy inny produkt — bez danych BGG, bez ostrzeżeń o dodatkach, bez domeny. Ten projekt to naprawia.

**Agregator Cen Planszówek** śledzi ceny w polskich sklepach, wzbogaca każdą grę o dane z BoardGameGeek i prezentuje okazje przez soczewki stworzone dla społeczności: feed gorących okazji, historię cen z wykresem, filtry specyficzne dla domeny i Flipper Mode dla kupujących do odsprzedaży.

Projekt open-source, hobbistyczny — zbudowany przez entuzjastę planszówek, dla entuzjastów planszówek.

---

## Funkcje

### Feed gorących okazji
Publiczna strona główna bez logowania. Aktualne promocje posortowane według procentu zniżki, odświeżane po każdym cyklu scrapowania. Widok kart i widok listy.

### Paszport planszówki
Dedykowana strona każdej gry (`/gra/{slug}`) łączy:
- Metadane BGG (mechaniki, liczba graczy, czas gry, złożoność)
- Porównanie cen ze wszystkich zintegrowanych sklepów
- Wykres historii cen
- Ostrzeżenie o wymaganiach DLC — "Ten dodatek wymaga [gry bazowej]"

### Historia cen
Wykres pełnej historii cenowej z podziałem na sklepy. Aktualny minimum, maksimum, średnia 30-dniowa. Weryfikujesz czy okazja jest prawdziwą okazją.

### Filtry domeny
- **Podstawka / Dodatek** — odfiltruj dodatki bez gry bazowej
- **Liczba graczy** — tylko gry wspierające Twój skład

### Alerty cenowe e-mail
Subskrypcja bez zakładania konta — tylko adres e-mail:
- **Typ A** — powiadom mnie gdy cena spadnie poniżej X zł
- **Typ B** — automatyczne wykrywanie drastycznych spadków (50%, 70%, 80%)
- Double opt-in zgodny z RODO/PKE 2024

### Flipper Mode
Dedykowany widok dla kupujących do odsprzedaży: cena aktualna, iskierka historii cen, wskaźnik marży i kierunek trendu (↑ rośnie / → stabilna / ↓ spada).

### Nadchodzi
Preordery i nowości ze sklepów z alertem "powiadom gdy dostępne".

---

## Zintegrowane sklepy

| Sklep | Status |
|---|---|
| 3Trolle | ✅ MVP |
| AlePlanszowki | ✅ MVP |
| Mepel | 🔬 Phase 1.5 (wymaga testu anty-bot) |
| Rebel | 🔜 Phase 2 |

---

## Dokumentacja projektu

Projekt przeszedł pełny proces planowania BMad Method. Artefakty dostępne w repozytorium:

| Dokument | Ścieżka |
|---|---|
| Brainstorming | `_bmad-output/brainstorming/` |
| Technical Research | `_bmad-output/planning-artifacts/research/` |
| PRD | `_bmad-output/planning-artifacts/prds/` |
| UX Design | `_bmad-output/planning-artifacts/ux-designs/` |

---

## Status projektu

```
✅ Brainstorming
✅ Technical Research
✅ PRD
✅ UX Design
🔜 Architektura
⬜ Epiki i Stories
⬜ Implementacja
```

---

## Ograniczenia MVP

- Brak kont użytkowników — całość przez tokeny e-mail
- Tylko polskie sklepy, ceny w PLN
- Brak aplikacji mobilnej (Phase 3, React Native)
- Margin Proxy w Flipper Mode oparty o historię cen, nie o dane Allegro/OLX (Phase 3)

---

## Wkład w projekt

Projekt jest we wczesnej fazie planowania. Jeśli chcesz pomóc lub masz pytania — otwórz Issue.

---

## Licencja

MIT
