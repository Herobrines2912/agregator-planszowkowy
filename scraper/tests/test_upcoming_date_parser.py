from utils.upcoming_date_parser import parse_release_date


class TestParseReleaseDate:
    def test_ale_planszowki_day_month_year(self):
        text = (
            "PLANOWANA WYSYŁKA - w dniu premiery (ok. 9 października 2026r.)"
            " UWAGA! Data premiery może ulec zmianie."
        )
        exact, approx = parse_release_date(text)
        assert exact is None
        assert approx == "ok. 9 października 2026r."

    def test_3trolle_month_year_no_day(self):
        text = (
            "PRZEDSPRZEDAŻ: Ten przedmiot jest w przedsprzedaży i nie mamy go w "
            "magazynie gotowego do wysyłki. Przewidywana data dostawy to ok. "
            "wrzesień 2026 (termin może ulec zmianie)."
        )
        exact, approx = parse_release_date(text)
        assert exact is None
        assert approx == "ok. wrzesień 2026"

    def test_3trolle_numeric_ddmmyyyy(self):
        text = (
            "Przewidywana data dostawy to ok. 16.09.2026 (termin może ulec zmianie)."
        )
        exact, approx = parse_release_date(text)
        assert exact is None
        assert approx == "ok. 16.09.2026"

    def test_ale_planszowki_month_year_no_day(self):
        text = "PLANOWANA WYSYŁKA - w dniu premiery (ok. październik 2026r.)"
        exact, approx = parse_release_date(text)
        assert exact is None
        assert approx == "ok. październik 2026r."

    def test_ale_planszowki_second_day_month_year_sample(self):
        text = "PLANOWANA WYSYŁKA - w dniu premiery (ok. 25 września 2026r.)"
        exact, approx = parse_release_date(text)
        assert exact is None
        assert approx == "ok. 25 września 2026r."

    def test_day_month_year_with_trailing_comma_instead_of_period(self):
        text = "Przewidywana data dostawy to ok. 9 października 2026, ale termin może się zmienić."
        exact, approx = parse_release_date(text)
        assert exact is None
        assert approx == "ok. 9 października 2026,"

    def test_day_month_year_with_no_trailing_punctuation(self):
        text = "Data premiery ok. 9 października 2026 do potwierdzenia"
        exact, approx = parse_release_date(text)
        assert exact is None
        assert approx == "ok. 9 października 2026"

    def test_no_match_returns_none_none(self):
        text = "Ten produkt jest dostępny od ręki, wysyłka w 24 godziny."
        assert parse_release_date(text) == (None, None)

    def test_empty_string(self):
        assert parse_release_date("") == (None, None)

    def test_none_input(self):
        assert parse_release_date(None) == (None, None)
