from datetime import datetime, timedelta, timezone

import matthias_episodes as episodes


def _at(days_ago=0):
    return (datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc) - timedelta(days=days_ago)).isoformat()


def test_measured_incident_delta_becomes_grounded_episode_and_callback():
    previous = episodes.episodic_observation_snapshot({
        "noteworthy_incidents": [{"key": "human:MISSED_MATE", "count": 1}],
    })
    created, snapshot = episodes.derive_episodes(
        previous,
        {"noteworthy_incidents": [{"key": "human:MISSED_MATE", "count": 2}]},
        at=_at(),
    )

    assert snapshot["noteworthy_incidents"] == {"human:MISSED_MATE": 2}
    assert len(created) == 1
    episode = created[0]
    assert episode["fingerprint"] == "incident:human:MISSED_MATE:2"
    assert episode["polarity"] == "shame"
    assert episode["evidence"] == {
        "source": "noteworthy_incidents",
        "key": "human:MISSED_MATE",
        "previous_count": 1,
        "count": 2,
        "delta": 1,
    }

    callbacks = episodes.eligible_callbacks(created, now=_at())
    assert callbacks[0]["episode"]["fingerprint"] == episode["fingerprint"]
    assert {"recent", "severe"}.issubset(set(callbacks[0]["reasons"]))


def test_same_or_decreasing_aggregate_never_invents_a_new_incident():
    previous = episodes.episodic_observation_snapshot({
        "noteworthy_incidents": [{"key": "cpu:KNIGHT_FORK", "count": 4}],
    })

    same, _ = episodes.derive_episodes(
        previous,
        {"noteworthy_incidents": [{"key": "cpu:KNIGHT_FORK", "count": 4}]},
        at=_at(),
    )
    lower, _ = episodes.derive_episodes(
        previous,
        {"noteworthy_incidents": [{"key": "cpu:KNIGHT_FORK", "count": 3}]},
        at=_at(),
    )

    assert same == []
    assert lower == []


def test_unknown_incident_is_kept_in_snapshot_but_not_promoted_to_biography():
    created, snapshot = episodes.derive_episodes(
        {},
        {"noteworthy_incidents": [{"key": "future:SOMETHING_UNDEFINED", "count": 7}]},
        at=_at(),
    )

    assert snapshot["noteworthy_incidents"]["future:SOMETHING_UNDEFINED"] == 7
    assert created == []


def test_exact_single_rivalry_result_is_reconstructible_but_aggregate_jump_is_not():
    previous = episodes.episodic_observation_snapshot({
        "cpu_rivalry": {"games": 9, "wins": 3, "draws": 1, "losses": 5},
    })
    one_game, _ = episodes.derive_episodes(
        previous,
        {"cpu_rivalry": {"games": 10, "wins": 4, "draws": 1, "losses": 5}},
        at=_at(),
    )
    two_games, _ = episodes.derive_episodes(
        previous,
        {"cpu_rivalry": {"games": 11, "wins": 4, "draws": 1, "losses": 6}},
        at=_at(),
    )

    rivalry = [row for row in one_game if row["kind"] == "rivalry_result"]
    assert rivalry[0]["evidence"]["outcome"] == "win"
    assert rivalry[0]["evidence"]["game_number"] == 10
    assert not any(row["kind"] == "rivalry_result" for row in two_games)


def test_repeated_opening_loss_becomes_episode_only_when_one_exact_loss_is_proven():
    previous = episodes.episodic_observation_snapshot({
        "openings": [{"name": "Siciliana", "games": 3, "wins": 1, "draws": 0, "losses": 2}],
    })
    created, _ = episodes.derive_episodes(
        previous,
        {"openings": [{"name": "Siciliana", "games": 4, "wins": 1, "draws": 0, "losses": 3}]},
        at=_at(),
    )

    setback = [row for row in created if row["kind"] == "opening_setback"]
    assert len(setback) == 1
    assert setback[0]["label"] == "Nueva derrota con Siciliana"
    assert setback[0]["evidence"]["losses"] == 3
    callback = episodes.eligible_callbacks(setback, now=_at())[0]
    assert "recurring" in callback["reasons"]


def test_merge_deduplicates_equivalent_evidence_and_caps_history():
    rows = []
    for index in range(episodes.MAX_EPISODES + 5):
        rows.append({
            "schema_version": 1,
            "fingerprint": f"incident:human:MISSED_MATE:{index + 1}",
            "kind": "incident",
            "label": "Mate disponible ignorado",
            "polarity": "shame",
            "severity": 92,
            "evidence": {
                "source": "noteworthy_incidents",
                "key": "human:MISSED_MATE",
                "previous_count": index,
                "count": index + 1,
                "delta": 1,
            },
            "at": (datetime(2026, 8, 1, tzinfo=timezone.utc) + timedelta(days=index)).isoformat(),
        })

    duplicate = dict(rows[-1])
    duplicate["label"] = "Mate disponible ignorado"
    merged = episodes.merge_episodes(rows, [duplicate])

    assert len(merged) == episodes.MAX_EPISODES
    assert len({row["fingerprint"] for row in merged}) == episodes.MAX_EPISODES
    assert merged[-1]["fingerprint"] == rows[-1]["fingerprint"]


def test_retrieval_prefers_severe_recent_or_recurring_and_allows_silence():
    recent_severe = {
        "fingerprint": "incident:human:ALLOWED_MATE:1",
        "kind": "incident",
        "label": "Mate permitido",
        "polarity": "shame",
        "severity": 94,
        "evidence": {
            "source": "noteworthy_incidents",
            "key": "human:ALLOWED_MATE",
            "previous_count": 0,
            "count": 1,
            "delta": 1,
        },
        "at": _at(1),
    }
    old_recurring = {
        "fingerprint": "incident:cpu:KNIGHT_FORK:5",
        "kind": "incident",
        "label": "Horquilla de caballo sufrida",
        "polarity": "shame",
        "severity": 72,
        "evidence": {
            "source": "noteworthy_incidents",
            "key": "cpu:KNIGHT_FORK",
            "previous_count": 4,
            "count": 5,
            "delta": 1,
        },
        "at": _at(30),
    }
    ordinary_draw = {
        "fingerprint": "rivalry:12:draw",
        "kind": "rivalry_result",
        "label": "Tablas contra Matthias",
        "polarity": "neutral",
        "severity": 45,
        "evidence": {
            "source": "cpu_rivalry",
            "outcome": "draw",
            "game_number": 12,
            "record": {"games": 12, "wins": 4, "draws": 2, "losses": 6},
        },
        "at": _at(1),
    }

    selected = episodes.eligible_callbacks([ordinary_draw, old_recurring, recent_severe], now=_at())
    assert selected[0]["episode"]["fingerprint"] == recent_severe["fingerprint"]
    assert any(row["episode"]["fingerprint"] == old_recurring["fingerprint"] for row in selected)
    assert not any(row["episode"]["fingerprint"] == ordinary_draw["fingerprint"] for row in selected)
    assert episodes.eligible_callbacks([ordinary_draw], now=_at()) == []


def test_observation_snapshot_cannot_accidentally_store_raw_game_or_secret_fields():
    snapshot = episodes.episodic_observation_snapshot({
        "noteworthy_incidents": [{"key": "human:MISSED_MATE", "count": 2}],
        "cpu_rivalry": {"games": 4, "wins": 1, "draws": 1, "losses": 2, "secret": "no"},
        "openings": [{"name": "Italiana", "games": 4, "wins": 2, "draws": 1, "losses": 1, "moves": ["e4", "e5"]}],
        "fen": "private-position",
        "moves": ["e4", "e5"],
        "password": "NO-DEBE-SALIR",
        "prompt": "NO-DEBE-SALIR",
    })

    serialized = str(snapshot)
    assert "private-position" not in serialized
    assert "NO-DEBE-SALIR" not in serialized
    assert "moves" not in serialized
    assert "secret" not in serialized
