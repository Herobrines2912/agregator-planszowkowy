from unittest.mock import MagicMock, patch

import pytest

from scripts.cleanup_gameupc_contamination import POISONED_BGG_IDS, main


def _make_conn_mock(select_rows=None, update_rowcount=0, unfinished=0):
    mock_cursor = MagicMock()
    mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
    mock_cursor.__exit__ = MagicMock(return_value=False)
    mock_cursor.fetchall.return_value = select_rows or []
    # unfinished_scrape_count() reads fetchone()[0]
    mock_cursor.fetchone.return_value = (unfinished,)
    mock_cursor.rowcount = update_rowcount

    mock_conn = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    mock_conn.get_dsn_parameters.return_value = {"host": "test-host", "dbname": "test-db"}
    return mock_conn, mock_cursor


def _baseline_rows():
    """31 rows matching the confirmed 23/8 baseline."""
    rows = []
    pid = 1
    for bgg_id, count in ((232420, 23), (178255, 8)):
        for _ in range(count):
            rows.append((pid, f"Product {pid}", f"http://example.com/{pid}", bgg_id, 59, "3trolle"))
            pid += 1
    return rows


@pytest.fixture(autouse=True)
def _no_dotenv(monkeypatch):
    # main() calls load_dotenv(); stop it reloading the real local scraper/.env so tests
    # don't depend on (or trigger, e.g. ISR revalidation via) real secrets.
    monkeypatch.setattr(
        "scripts.cleanup_gameupc_contamination.load_dotenv", lambda *a, **k: None
    )
    monkeypatch.setenv("DATABASE_URL", "postgresql://test")


def _update_calls(mock_cursor):
    return [c for c in mock_cursor.execute.call_args_list if "UPDATE" in c.args[0]]


@patch("scripts.cleanup_gameupc_contamination.psycopg2.connect")
def test_dry_run_issues_select_only_no_writes(mock_connect):
    mock_conn, mock_cursor = _make_conn_mock(
        select_rows=[(1, "Some Product", "http://example.com/1", 232420, 59, "3trolle")]
    )
    mock_connect.return_value = mock_conn

    with patch("sys.argv", ["cleanup_gameupc_contamination.py"]):
        main()

    mock_cursor.fetchall.assert_called_once()
    assert not _update_calls(mock_cursor)
    mock_conn.commit.assert_not_called()


@patch("scripts.cleanup_gameupc_contamination.psycopg2.connect")
def test_select_predicate_also_covers_game_id_orphans(mock_connect):
    mock_conn, mock_cursor = _make_conn_mock(select_rows=[])
    mock_connect.return_value = mock_conn

    with patch("sys.argv", ["cleanup_gameupc_contamination.py"]):
        main()

    select_sql = mock_cursor.execute.call_args_list[0].args[0]
    assert "p.bgg_id = ANY(%s)" in select_sql
    assert "game_id IN (SELECT id FROM games WHERE bgg_id = ANY(%s))" in select_sql


@patch("scripts.cleanup_gameupc_contamination.psycopg2.connect")
def test_execute_baseline_match_resets_audits_and_commits(mock_connect, monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)  # backup CSV lands in tmp, not the repo
    mock_conn, mock_cursor = _make_conn_mock(
        select_rows=_baseline_rows(), update_rowcount=31, unfinished=0
    )
    mock_connect.return_value = mock_conn

    with patch("sys.argv", ["cleanup_gameupc_contamination.py", "--execute"]):
        main()

    update_calls = _update_calls(mock_cursor)
    assert len(update_calls) == 1
    sql, params = update_calls[0].args
    assert "bgg_id = NULL" in sql
    assert "game_id = NULL" in sql
    assert params == (POISONED_BGG_IDS, POISONED_BGG_IDS)

    audit_calls = [c for c in mock_cursor.execute.call_args_list if "data_retention_log" in c.args[0]]
    assert len(audit_calls) == 1
    mock_conn.commit.assert_called_once()
    mock_conn.rollback.assert_not_called()
    # a pre-state backup CSV was written
    assert list(tmp_path.glob("cleanup_gameupc_backup_*.csv"))


@patch("scripts.cleanup_gameupc_contamination.psycopg2.connect")
def test_execute_aborts_on_baseline_mismatch_without_force(mock_connect):
    mock_conn, mock_cursor = _make_conn_mock(
        select_rows=[
            (1, "P1", "http://example.com/1", 232420, 59, "3trolle"),
            (2, "P2", "http://example.com/2", 178255, 61, "aleplanszowki"),
        ],
        update_rowcount=2,
    )
    mock_connect.return_value = mock_conn

    with patch("sys.argv", ["cleanup_gameupc_contamination.py", "--execute"]):
        with pytest.raises(RuntimeError, match="baseline"):
            main()

    assert not _update_calls(mock_cursor)
    mock_conn.commit.assert_not_called()


@patch("scripts.cleanup_gameupc_contamination.psycopg2.connect")
def test_execute_proceeds_on_baseline_mismatch_with_force(mock_connect, monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    mock_conn, mock_cursor = _make_conn_mock(
        select_rows=[
            (1, "P1", "http://example.com/1", 232420, 59, "3trolle"),
            (2, "P2", "http://example.com/2", 178255, 61, "aleplanszowki"),
        ],
        update_rowcount=2,
        unfinished=0,
    )
    mock_connect.return_value = mock_conn

    with patch("sys.argv", ["cleanup_gameupc_contamination.py", "--execute", "--force"]):
        main()

    assert len(_update_calls(mock_cursor)) == 1
    mock_conn.commit.assert_called_once()


@patch("scripts.cleanup_gameupc_contamination.psycopg2.connect")
def test_execute_refuses_while_scrape_in_flight(mock_connect):
    mock_conn, mock_cursor = _make_conn_mock(
        select_rows=_baseline_rows(), update_rowcount=31, unfinished=1
    )
    mock_connect.return_value = mock_conn

    with patch("sys.argv", ["cleanup_gameupc_contamination.py", "--execute"]):
        with pytest.raises(RuntimeError, match="unfinished"):
            main()

    assert not _update_calls(mock_cursor)
    mock_conn.commit.assert_not_called()


@patch("scripts.cleanup_gameupc_contamination.psycopg2.connect")
def test_execute_rolls_back_on_rowcount_divergence(mock_connect, monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    # SELECT audited 31 rows, but the UPDATE reports 30 → concurrent write → rollback.
    mock_conn, mock_cursor = _make_conn_mock(
        select_rows=_baseline_rows(), update_rowcount=30, unfinished=0
    )
    mock_connect.return_value = mock_conn

    with patch("sys.argv", ["cleanup_gameupc_contamination.py", "--execute"]):
        with pytest.raises(RuntimeError, match="rolled back"):
            main()

    mock_conn.rollback.assert_called_once()
    mock_conn.commit.assert_not_called()


@patch("scripts.cleanup_gameupc_contamination.psycopg2.connect")
def test_no_affected_rows_dry_run_logs_nothing_to_reset(mock_connect):
    mock_conn, _ = _make_conn_mock(select_rows=[])
    mock_connect.return_value = mock_conn

    with patch("sys.argv", ["cleanup_gameupc_contamination.py"]):
        main()

    mock_conn.commit.assert_not_called()


@patch("scripts.cleanup_gameupc_contamination.psycopg2.connect")
def test_missing_database_url_raises_runtime_error(mock_connect, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with patch("sys.argv", ["cleanup_gameupc_contamination.py"]):
        with pytest.raises(RuntimeError, match="DATABASE_URL"):
            main()

    mock_connect.assert_not_called()
