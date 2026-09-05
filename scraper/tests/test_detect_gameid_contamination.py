from unittest.mock import MagicMock, patch

import pytest

from scripts.detect_gameid_contamination import (
    KNOWN_LEGITIMATE_CLUSTERS,
    find_candidates,
    log_candidates,
    main,
)


def _make_conn_mock(candidate_rows=None, game_name_rows=None):
    mock_cursor = MagicMock()
    mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
    mock_cursor.__exit__ = MagicMock(return_value=False)
    mock_cursor.fetchall.return_value = candidate_rows or []
    mock_cursor.fetchone.side_effect = game_name_rows or None

    mock_conn = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    mock_conn.get_dsn_parameters.return_value = {"host": "test-host", "dbname": "test-db"}
    return mock_conn, mock_cursor


@pytest.fixture(autouse=True)
def _no_dotenv(monkeypatch):
    monkeypatch.setattr(
        "scripts.detect_gameid_contamination.load_dotenv", lambda *a, **k: None
    )
    monkeypatch.setenv("DATABASE_URL", "postgresql://test")


def test_find_candidates_uses_min_distinct_names_threshold():
    mock_conn, mock_cursor = _make_conn_mock(candidate_rows=[(736, 61, 66)])
    result = find_candidates(mock_conn)
    assert result == [(736, 61, 66)]
    sql = mock_cursor.execute.call_args.args[0]
    assert "HAVING COUNT(DISTINCT p.name) >= %s" in sql


def test_known_legitimate_clusters_are_excluded_from_operator_review_output(caplog):
    mock_conn, mock_cursor = _make_conn_mock(
        candidate_rows=[(12, 35, 35), (736, 61, 66)],
        game_name_rows=[("Smart",)],
    )
    with caplog.at_level("INFO"):
        log_candidates(mock_conn, [(12, 35, 35), (736, 61, 66)])
    messages = "\n".join(caplog.messages)
    assert "excluded, known-legitimate] game_id=12" in messages
    assert "game_id=736 name='Smart'" in messages


def test_no_candidates_logs_clean_message(caplog):
    mock_conn, mock_cursor = _make_conn_mock(candidate_rows=[])
    with caplog.at_level("INFO"):
        log_candidates(mock_conn, [])
    assert "No game_id clusters meet the contamination heuristic" in caplog.text


@patch("scripts.detect_gameid_contamination.psycopg2.connect")
def test_main_dry_run_never_writes(mock_connect):
    mock_conn, mock_cursor = _make_conn_mock(candidate_rows=[])
    mock_connect.return_value = mock_conn

    with patch("sys.argv", ["detect_gameid_contamination.py"]):
        main()

    mock_conn.commit.assert_not_called()


@patch("scripts.detect_gameid_contamination.psycopg2.connect")
def test_main_detail_mode_queries_single_game_id(mock_connect):
    mock_conn, mock_cursor = _make_conn_mock()
    mock_cursor.fetchall.return_value = [(1, "Product A", "3trolle")]
    mock_connect.return_value = mock_conn

    with patch("sys.argv", ["detect_gameid_contamination.py", "--detail", "736"]):
        main()

    select_sql = mock_cursor.execute.call_args_list[0].args[0]
    assert "WHERE p.game_id = %s" in select_sql
    assert mock_cursor.execute.call_args_list[0].args[1] == (736,)


@patch("scripts.detect_gameid_contamination.psycopg2.connect")
def test_missing_database_url_raises_runtime_error(mock_connect, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with patch("sys.argv", ["detect_gameid_contamination.py"]):
        with pytest.raises(RuntimeError, match="DATABASE_URL"):
            main()

    mock_connect.assert_not_called()


def test_known_legitimate_clusters_documents_investigated_ids():
    """Guards against silently losing the pre-verified exclusions during a refactor."""
    assert 12 in KNOWN_LEGITIMATE_CLUSTERS
    assert 714 in KNOWN_LEGITIMATE_CLUSTERS
