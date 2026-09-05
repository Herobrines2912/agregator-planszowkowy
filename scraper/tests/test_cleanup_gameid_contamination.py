from unittest.mock import MagicMock, patch

import pytest

from scripts.cleanup_gameid_contamination import main


def _make_conn_mock(select_rows=None, update_rowcount=0, unfinished=0):
    mock_cursor = MagicMock()
    mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
    mock_cursor.__exit__ = MagicMock(return_value=False)
    mock_cursor.fetchall.return_value = select_rows or []
    mock_cursor.fetchone.return_value = (unfinished,)
    mock_cursor.rowcount = update_rowcount

    mock_conn = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    mock_conn.get_dsn_parameters.return_value = {"host": "test-host", "dbname": "test-db"}
    return mock_conn, mock_cursor


@pytest.fixture(autouse=True)
def _no_dotenv(monkeypatch):
    monkeypatch.setattr(
        "scripts.cleanup_gameid_contamination.load_dotenv", lambda *a, **k: None
    )
    monkeypatch.setenv("DATABASE_URL", "postgresql://test")


def _update_calls(mock_cursor):
    return [c for c in mock_cursor.execute.call_args_list if "UPDATE" in c.args[0]]


@patch("scripts.cleanup_gameid_contamination.psycopg2.connect")
def test_dry_run_issues_select_only_no_writes(mock_connect):
    mock_conn, mock_cursor = _make_conn_mock(
        select_rows=[(1, "Smart Games - Antywirus", "http://example.com/1", 3215, 736, "ale_planszowki")]
    )
    mock_connect.return_value = mock_conn

    with patch("sys.argv", ["cleanup_gameid_contamination.py", "--game-ids", "736"]):
        main()

    mock_cursor.fetchall.assert_called_once()
    assert not _update_calls(mock_cursor)
    mock_conn.commit.assert_not_called()


@patch("scripts.cleanup_gameid_contamination.psycopg2.connect")
def test_select_scopes_to_confirmed_game_ids(mock_connect):
    mock_conn, mock_cursor = _make_conn_mock(select_rows=[])
    mock_connect.return_value = mock_conn

    with patch("sys.argv", ["cleanup_gameid_contamination.py", "--game-ids", "736,958"]):
        main()

    select_sql, select_params = mock_cursor.execute.call_args_list[0].args
    assert "WHERE p.game_id = ANY(%s)" in select_sql
    assert select_params == ([736, 958],)


@patch("scripts.cleanup_gameid_contamination.psycopg2.connect")
def test_execute_resets_and_commits(mock_connect, monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    rows = [
        (1, "Smart Games - Antywirus", "http://example.com/1", 3215, 736, "ale_planszowki"),
        (2, "Smart Games - IQ Twist", "http://example.com/2", 3215, 736, "ale_planszowki"),
    ]
    mock_conn, mock_cursor = _make_conn_mock(select_rows=rows, update_rowcount=2, unfinished=0)
    mock_connect.return_value = mock_conn

    with patch("sys.argv", ["cleanup_gameid_contamination.py", "--game-ids", "736", "--execute"]):
        main()

    update_calls = _update_calls(mock_cursor)
    assert len(update_calls) == 1
    sql, params = update_calls[0].args
    assert "game_id = NULL" in sql
    assert "bgg_id = NULL" in sql
    assert params == ([736],)

    audit_calls = [c for c in mock_cursor.execute.call_args_list if "data_retention_log" in c.args[0]]
    assert len(audit_calls) == 1
    assert audit_calls[0].args[1] == ("reset_gameid_contamination", 2)
    mock_conn.commit.assert_called_once()
    mock_conn.rollback.assert_not_called()
    assert list(tmp_path.glob("cleanup_gameid_backup_*.csv"))


@patch("scripts.cleanup_gameid_contamination.psycopg2.connect")
def test_execute_refuses_while_scrape_in_flight(mock_connect):
    mock_conn, mock_cursor = _make_conn_mock(
        select_rows=[(1, "P1", "http://example.com/1", 3215, 736, "ale_planszowki")],
        update_rowcount=1,
        unfinished=1,
    )
    mock_connect.return_value = mock_conn

    with patch("sys.argv", ["cleanup_gameid_contamination.py", "--game-ids", "736", "--execute"]):
        with pytest.raises(RuntimeError, match="unfinished"):
            main()

    assert not _update_calls(mock_cursor)
    mock_conn.commit.assert_not_called()


@patch("scripts.cleanup_gameid_contamination.psycopg2.connect")
def test_execute_force_overrides_in_flight_guard(mock_connect, monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    mock_conn, mock_cursor = _make_conn_mock(
        select_rows=[(1, "P1", "http://example.com/1", 3215, 736, "ale_planszowki")],
        update_rowcount=1,
        unfinished=1,
    )
    mock_connect.return_value = mock_conn

    with patch("sys.argv", ["cleanup_gameid_contamination.py", "--game-ids", "736", "--execute", "--force"]):
        main()

    assert len(_update_calls(mock_cursor)) == 1
    mock_conn.commit.assert_called_once()


@patch("scripts.cleanup_gameid_contamination.psycopg2.connect")
def test_execute_rolls_back_on_rowcount_divergence(mock_connect, monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    rows = [
        (1, "Smart Games - Antywirus", "http://example.com/1", 3215, 736, "ale_planszowki"),
        (2, "Smart Games - IQ Twist", "http://example.com/2", 3215, 736, "ale_planszowki"),
    ]
    # SELECT audited 2 rows, but the UPDATE reports 1 → concurrent write → rollback.
    mock_conn, mock_cursor = _make_conn_mock(select_rows=rows, update_rowcount=1, unfinished=0)
    mock_connect.return_value = mock_conn

    with patch("sys.argv", ["cleanup_gameid_contamination.py", "--game-ids", "736", "--execute"]):
        with pytest.raises(RuntimeError, match="rolled back"):
            main()

    mock_conn.rollback.assert_called_once()
    mock_conn.commit.assert_not_called()


@patch("scripts.cleanup_gameid_contamination.psycopg2.connect")
def test_no_affected_rows_dry_run_logs_nothing_to_reset(mock_connect):
    mock_conn, _ = _make_conn_mock(select_rows=[])
    mock_connect.return_value = mock_conn

    with patch("sys.argv", ["cleanup_gameid_contamination.py", "--game-ids", "736"]):
        main()

    mock_conn.commit.assert_not_called()


@patch("scripts.cleanup_gameid_contamination.psycopg2.connect")
def test_execute_with_no_matching_rows_is_noop(mock_connect):
    mock_conn, mock_cursor = _make_conn_mock(select_rows=[])
    mock_connect.return_value = mock_conn

    with patch("sys.argv", ["cleanup_gameid_contamination.py", "--game-ids", "999999", "--execute"]):
        main()

    assert not _update_calls(mock_cursor)
    mock_conn.commit.assert_not_called()


@patch("scripts.cleanup_gameid_contamination.psycopg2.connect")
def test_missing_database_url_raises_runtime_error(mock_connect, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with patch("sys.argv", ["cleanup_gameid_contamination.py", "--game-ids", "736"]):
        with pytest.raises(RuntimeError, match="DATABASE_URL"):
            main()

    mock_connect.assert_not_called()


def test_game_ids_required():
    with patch("sys.argv", ["cleanup_gameid_contamination.py"]):
        with pytest.raises(SystemExit):
            main()
