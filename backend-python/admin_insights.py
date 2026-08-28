"""Pure admin/profile aggregation helpers.

No FastAPI app, stores, or network access live here.  Keeping these transforms
pure makes them cheap to unit-test and prevents ``main.py`` from becoming the
repository for every reporting concern.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Optional

def _history_mover_color(record: dict, index: int) -> str:
    """Derive mover colour from the saved starting FEN, including black-to-move labs."""
    start = "w"
    fen = record.get("initialFen") if isinstance(record, dict) else None
    if isinstance(fen, str):
        parts = fen.strip().split()
        if len(parts) >= 2 and parts[1] in {"w", "b"}:
            start = parts[1]
    return start if max(0, int(index)) % 2 == 0 else ("b" if start == "w" else "w")


def _profile_json(data: dict, key: str, default):
    raw = data.get(key)
    if not isinstance(raw, str):
        return default
    try:
        value = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return default
    return value


def _normalize_career_activity_text(text) -> str | None:
    if not isinstance(text, str):
        return None
    value = text.strip()
    replacements = (
        ("Contrato cumplido:", "Reto superado ·"),
        ("Contrato fallido:", "Reto fallido ·"),
        ("Reto cumplido:", "Reto superado ·"),
        ("Reto cumplido ·", "Reto superado ·"),
        ("Reto fallido:", "Reto fallido ·"),
    )
    lower = value.lower()
    for prefix, replacement in replacements:
        if lower.startswith(prefix.lower()):
            return f"{replacement} {value[len(prefix):].strip()}"
    return value


def _difficulty_label(value) -> str | None:
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        return None
    return f"CPU · nivel {number}"


def _longest_win_streak(records: list[dict]) -> int:
    ordered = sorted(
        (r for r in records if isinstance(r, dict)),
        key=lambda r: str(r.get("date") or ""),
    )
    best = current = 0
    for record in ordered:
        if record.get("outcome") == "win":
            current += 1
            best = max(best, current)
        else:
            current = 0
    return best


def _extract_summary_stats(profile: Optional[dict]) -> dict:
    """Resumen enriquecido para el panel de admin.

    Todo sale de la foto de perfil que ya sincroniza el frontend: abrir el
    panel NO dispara análisis del motor ni recorre partidas activas. Si un
    dato todavía no existe (por ejemplo, nunca se buscó la peor jugada), se
    devuelve None y la UI muestra un guion.
    """
    data = (profile or {}).get("data") or {}

    tournament = _profile_json(data, "chess-study-tournament", {})
    if not isinstance(tournament, dict):
        tournament = {}

    rating_data = _profile_json(data, "chess-study-player-rating", {})
    if not isinstance(rating_data, dict):
        rating_data = {}

    rating_history = _profile_json(data, "chess-study-rating-history", [])
    if not isinstance(rating_history, list):
        rating_history = []

    game_history = _profile_json(data, "chess-study-game-history", [])
    if not isinstance(game_history, list):
        game_history = []

    game_activity = _profile_json(data, "chess-study-game-activity", [])
    if not isinstance(game_activity, list):
        game_activity = []
    adaptive_started_ids = {
        str(row.get("gameId")) for row in game_activity
        if isinstance(row, dict) and row.get("state") == "started" and row.get("detail") == "adaptive-difficulty" and row.get("gameId")
    }

    combat_history = _profile_json(data, "chess-study-combat-history", [])
    if not isinstance(combat_history, list):
        combat_history = []

    worst_cache = _profile_json(data, "chess-study-worst-move-cache", {})
    if not isinstance(worst_cache, dict):
        worst_cache = {}

    achievements = _profile_json(data, "chess-study-achievements", [])
    if not isinstance(achievements, list):
        achievements = []

    puzzles_solved = _profile_json(data, "chess-study-puzzles-solved", 0)
    puzzle_best_streak = _profile_json(data, "chess-study-puzzle-best-streak", 0)

    personal_puzzles = _profile_json(data, "chess-study-personal-puzzles", [])
    if not isinstance(personal_puzzles, list):
        personal_puzzles = []

    rivalry = _profile_json(data, "chess-study-cpu-rivalry", {})
    if not isinstance(rivalry, dict):
        rivalry = {}

    daily_challenge = _profile_json(data, "chess-study-daily-challenge", {})
    if not isinstance(daily_challenge, dict):
        daily_challenge = {}

    series_history = _profile_json(data, "chess-study-series-history", [])
    if not isinstance(series_history, list):
        series_history = []

    # V13: "chess-study-career". Conservamos lectura del prototipo
    # "career-meta" por compatibilidad con alguna build intermedia.
    career_meta = _profile_json(data, "chess-study-career", None)
    if not isinstance(career_meta, dict):
        career_meta = _profile_json(data, "chess-study-career-meta", {})
    if not isinstance(career_meta, dict):
        career_meta = {}
    career_activity = career_meta.get("milestones") if isinstance(career_meta.get("milestones"), list) else career_meta.get("activity") if isinstance(career_meta.get("activity"), list) else []
    current_season = career_meta.get("season") if isinstance(career_meta.get("season"), dict) else None
    puzzle_rush = career_meta.get("puzzleRush") if isinstance(career_meta.get("puzzleRush"), dict) else {}
    run_records = career_meta.get("runRecords") if isinstance(career_meta.get("runRecords"), dict) else {}
    career_records = career_meta.get("records") if isinstance(career_meta.get("records"), dict) else {}
    contract_stats = career_meta.get("contracts") if isinstance(career_meta.get("contracts"), dict) else career_meta.get("contractStats") if isinstance(career_meta.get("contractStats"), dict) else {}
    analysis_archive = _profile_json(data, "chess-study-analysis-archive", {})
    if not isinstance(analysis_archive, dict):
        analysis_archive = {}
    analysis_rows = [row for row in analysis_archive.values() if isinstance(row, dict)]
    accuracy_values = []
    pressure_moves = pressure_incidents = missed_conversions = desperate_saves = 0
    for row in analysis_rows:
        try:
            acc = float(row.get("accuracy"))
            if math.isfinite(acc): accuracy_values.append(acc)
        except (TypeError, ValueError):
            pass
        try: pressure_moves += int(row.get("pressureMoves") or 0)
        except (TypeError, ValueError): pass
        try: pressure_incidents += int(row.get("pressureIncidents") or 0)
        except (TypeError, ValueError): pass
        try:
            peak = float(row.get("peakPerspectiveEval"))
            if math.isfinite(peak) and peak >= 300 and row.get("outcome") not in {None, "win"}: missed_conversions += 1
        except (TypeError, ValueError):
            pass
        try:
            trough = float(row.get("troughPerspectiveEval"))
            if math.isfinite(trough) and trough <= -300 and row.get("outcome") in {"win", "draw"}: desperate_saves += 1
        except (TypeError, ValueError):
            pass
    series_won = sum(1 for row in series_history if isinstance(row, dict) and row.get("winner") == "human")
    series_lost = sum(1 for row in series_history if isinstance(row, dict) and row.get("winner") == "cpu")

    all_records = [r for r in [*game_history, *combat_history] if isinstance(r, dict)]
    wins = sum(1 for r in all_records if r.get("outcome") == "win")
    draws = sum(1 for r in all_records if r.get("outcome") == "draw")
    losses = sum(1 for r in all_records if r.get("outcome") == "loss")
    total_games = len(all_records)

    best_difficulty_win = None
    for record in all_records:
        if record.get("outcome") != "win":
            continue
        try:
            difficulty = int(round(float(record.get("difficulty"))))
        except (TypeError, ValueError):
            continue
        best_difficulty_win = difficulty if best_difficulty_win is None else max(best_difficulty_win, difficulty)

    human_captures = queens_captured = queens_lost = 0
    material_donated = 0
    piece_values = {"p": 1, "n": 3, "b": 3, "r": 5, "q": 9, "k": 0}
    white_games = black_games = 0
    for record in game_history:
        if not isinstance(record, dict):
            continue
        human_color = record.get("humanColor")
        if human_color == "w":
            white_games += 1
        elif human_color == "b":
            black_games += 1
        for index, move in enumerate(record.get("moves") or []):
            if not isinstance(move, dict):
                continue
            mover = _history_mover_color(record, index)
            if not move.get("captured"):
                continue
            captured_piece = move.get("capturedPiece") or move.get("captured")
            if mover == human_color:
                human_captures += 1
                if captured_piece == "q":
                    queens_captured += 1
            else:
                material_donated += piece_values.get(captured_piece or move.get("captured"), 0)
                if captured_piece == "q" or move.get("captured") == "q":
                    queens_lost += 1

    worst_move = None
    analyzed_games = 0
    for game_id, cached in worst_cache.items():
        if not isinstance(cached, dict):
            continue
        worst = cached.get("worst")
        if not isinstance(worst, dict):
            continue
        analyzed_games += 1
        try:
            loss = int(worst.get("loss"))
        except (TypeError, ValueError):
            continue
        candidate = {
            "gameId": game_id,
            "index": worst.get("index"),
            "played": worst.get("played"),
            "playedFrom": worst.get("playedFrom"),
            "playedTo": worst.get("playedTo"),
            "playedPiece": worst.get("playedPiece"),
            "suggested": worst.get("suggested"),
            "suggestedFrom": worst.get("suggestedFrom"),
            "suggestedTo": worst.get("suggestedTo"),
            "suggestedPiece": worst.get("suggestedPiece"),
            "loss": loss,
            "moveNumber": worst.get("moveNumber"),
            "severity": worst.get("severity"),
            "evalAfterSuggested": worst.get("evalAfterSuggested"),
            "evalAfterPlayed": worst.get("evalAfterPlayed"),
            "analyzedAt": cached.get("analyzedAt"),
        }
        if worst_move is None or loss > worst_move["loss"]:
            worst_move = candidate

    rating_values = []
    for point in rating_history:
        if not isinstance(point, dict):
            continue
        try:
            rating_values.append(int(round(float(point.get("rating")))))
        except (TypeError, ValueError):
            pass
    current_rating = rating_data.get("rating")
    try:
        current_rating = int(round(float(current_rating))) if current_rating is not None else None
    except (TypeError, ValueError):
        current_rating = None
    if current_rating is not None:
        rating_values.append(current_rating)

    def recent_mode_label(row: dict) -> tuple[str, str]:
        # Historial estándar y Combat comparten el feed, pero no la estructura.
        # Etiquetamos solo con metadatos ya persistidos; nunca inferimos contenido privado.
        if row.get("variant") in {"combat", "roguelike"} or row.get("roguelikeMode") is not None:
            if row.get("roguelikeMode") == "campaign":
                return "Combat Chess · Campaña", "combat"
            if row.get("roguelikeMode") in {"tower", "endless"}:
                return "Combat Chess · Torre", "combat"
            return "Combat Chess", "combat"
        mode = str(row.get("mode") or "casual")
        labels = {
            "tournament": "Torneo",
            "practice": "Partida de práctica",
            "ghost": "Rival fantasma",
            "nemesis-training": "Némesis",
            "sudden": "Muerte súbita",
            "casual": "Rápida",
        }
        return labels.get(mode, "Rápida"), mode

    recent = sorted(all_records, key=lambda r: str(r.get("date") or ""), reverse=True)[:5]
    recent_game_activity = []
    history_by_game_id = {}
    for record in game_history:
        if not isinstance(record, dict):
            continue
        source_id = record.get("sourceGameId") or record.get("gameId")
        if source_id:
            history_by_game_id[str(source_id)] = record

    # Builds nuevas guardan el ciclo de vida explícito de cada partida. Si
    # existe ese journal, es la fuente preferida para Admin porque permite
    # distinguir iniciada/cancelada/finalizada sin inventarlo a partir del
    # historial final. Builds antiguas caen al historial tradicional de abajo.
    lifecycle_rows = [row for row in game_activity if isinstance(row, dict)]
    lifecycle_started = {str(row.get("gameId")) for row in lifecycle_rows if row.get("gameId") and row.get("state") == "started"}
    lifecycle_finished = {str(row.get("gameId")) for row in lifecycle_rows if row.get("gameId") and row.get("state") == "finished"}
    lifecycle_cancelled = {str(row.get("gameId")) for row in lifecycle_rows if row.get("gameId") and row.get("state") == "cancelled"}
    for row in sorted(lifecycle_rows, key=lambda r: str(r.get("date") or ""), reverse=True)[:12]:
        state = str(row.get("state") or "").lower()
        if state not in {"started", "cancelled", "finished"}:
            continue
        mode_label = row.get("modeLabel")
        if not isinstance(mode_label, str) or not mode_label.strip():
            mode_label, _ = recent_mode_label({"mode": row.get("mode")})
        activity_type = "combat" if str(mode_label).startswith("Combat Chess") else str(row.get("mode") or "casual")
        outcome = row.get("outcome")
        if state == "started":
            text = "Partida iniciada"
        elif state == "cancelled":
            text = "Partida cancelada"
        else:
            result = {"win": "Victoria", "loss": "Derrota", "draw": "Tablas"}.get(outcome)
            text = f"Partida finalizada · {result}" if result else "Partida finalizada"
        matched_record = history_by_game_id.get(str(row.get("gameId") or ""), {})
        detail_parts = []
        level_detail = _difficulty_label(row.get("difficulty") if row.get("difficulty") is not None else matched_record.get("difficulty"))
        if level_detail:
            detail_parts.append(level_detail)
        tc = matched_record.get("timeControl") if isinstance(matched_record, dict) and isinstance(matched_record.get("timeControl"), dict) else {}
        if tc.get("label"):
            detail_parts.append(str(tc.get("label")))
        raw_detail = row.get("detail")
        if isinstance(raw_detail, str) and raw_detail.strip() and raw_detail != "adaptive-difficulty":
            detail_parts.append(raw_detail.strip())
        recent_game_activity.append({
            "date": row.get("date"),
            "text": text,
            "detail": " · ".join(detail_parts) or None,
            "type": activity_type,
            "modeLabel": mode_label,
        })

    if not recent_game_activity:
        for row in recent:
            outcome = row.get("outcome")
            result_label = {"win": "victoria", "loss": "derrota", "draw": "tablas"}.get(outcome, outcome or "partida")
            mode_label, activity_type = recent_mode_label(row)
            details = []
            if row.get("difficulty") is not None:
                level_detail = _difficulty_label(row.get("difficulty"))
                if level_detail:
                    details.append(level_detail)
            tc = row.get("timeControl") if isinstance(row.get("timeControl"), dict) else {}
            if tc.get("label"):
                details.append(str(tc.get("label")))
            elif tc.get("id") and tc.get("id") != "none":
                details.append(str(tc.get("id")))
            recent_game_activity.append({
                "date": row.get("date"),
                "text": result_label.capitalize(),
                "detail": " · ".join(details) or None,
                "type": activity_type,
                "modeLabel": mode_label,
            })

    rivalry_games = 0
    rivalry_record = rivalry.get("record")
    if isinstance(rivalry_record, dict):
        try:
            rivalry_games = int(rivalry_record.get("games") or rivalry.get("totalGames") or 0)
        except (TypeError, ValueError):
            rivalry_games = 0
    else:
        # Compatibilidad con perfiles V7: antes había un marcador por personalidad.
        for row in (rivalry.get("byPersona") or {}).values():
            if isinstance(row, dict):
                try:
                    rivalry_games += int(row.get("games") or 0)
                except (TypeError, ValueError):
                    pass

    sin_labels = {
        "human:MISSED_MATE": "mates ignorados",
        "human:ALLOWED_MATE": "mates regalados",
        "human:QUEEN_EN_PRISE_TO_PAWN": "damas expuestas a peón",
        "human:STALEMATE_BLUNDER": "ahogados criminales",
        "cpu:PAWN_TAKES_QUEEN": "damas perdidas contra peón",
        "cpu:KNIGHT_FORK": "horquillas de caballo sufridas",
        "cpu:PAWN_FORK": "horquillas de peón sufridas",
    }
    incidents = rivalry.get("incidents") or {}
    most_common_sin = None
    if isinstance(incidents, dict):
        candidates = []
        for key, value in incidents.items():
            if key not in sin_labels:
                continue
            try:
                count = int(value)
            except (TypeError, ValueError):
                continue
            candidates.append((count, key))
        if candidates:
            count, key = max(candidates)
            most_common_sin = {"label": sin_labels[key], "count": count}

    return {
        "tournamentPoints": tournament.get("points"),
        "tournamentWins": tournament.get("wins"),
        "rating": current_rating,
        "ratingGames": rating_data.get("games"),
        "ratingPeak": max(rating_values) if rating_values else current_rating,
        # Compatibilidad con la columna que ya existía: partidas normales
        # guardadas en game-history, sin mezclar Combate.
        "gamesPlayed": len(game_history),
        "combatBattles": len(combat_history),
        "totalGames": total_games,
        "funnelStarted": len(lifecycle_started),
        "funnelFinished": len(lifecycle_finished),
        "funnelCancelled": len(lifecycle_cancelled),
        "funnelCompletionPct": round((len(lifecycle_finished) / len(lifecycle_started)) * 100) if lifecycle_started else None,
        "adaptiveStarted": len(adaptive_started_ids),
        "adaptiveFinished": len(lifecycle_finished & adaptive_started_ids),
        "wins": wins,
        "draws": draws,
        "losses": losses,
        "winPct": round((wins / total_games) * 100) if total_games else None,
        "longestWinStreak": _longest_win_streak(all_records),
        "bestDifficultyWin": best_difficulty_win,
        "humanCaptures": human_captures,
        "queensCaptured": queens_captured,
        "queensLost": queens_lost,
        "whiteGames": white_games,
        "blackGames": black_games,
        "analyzedGames": analyzed_games,
        "worstMove": worst_move,
        "achievements": len(achievements),
        "puzzlesSolved": puzzles_solved if isinstance(puzzles_solved, (int, float)) else 0,
        "puzzleBestStreak": puzzle_best_streak if isinstance(puzzle_best_streak, (int, float)) else 0,
        "personalPuzzles": len(personal_puzzles),
        "rivalryGames": rivalry_games,
        "mostCommonSin": most_common_sin,
        "dailyBestStreak": daily_challenge.get("bestStreak", 0) if isinstance(daily_challenge, dict) else 0,
        "seriesPlayed": len(series_history),
        "seriesWon": series_won,
        "seriesLost": series_lost,
        "recentForm": [r.get("outcome") for r in recent if r.get("outcome") in {"win", "draw", "loss"}],
        "recentActivity": sorted([
            *recent_game_activity,
            *[
                {"date": row.get("date"), "text": _normalize_career_activity_text(row.get("text")), "detail": row.get("detail"), "type": row.get("type")}
                for row in career_activity[:8] if isinstance(row, dict)
            ],
        ], key=lambda row: str(row.get("date") or ""), reverse=True)[:8],
        "currentSeason": {
            "number": current_season.get("id") or current_season.get("number"),
            "games": current_season.get("games", 0) if isinstance(current_season.get("games"), (int, float)) else len(current_season.get("games") or []),
            "target": current_season.get("targetGames", 20),
        } if current_season else None,
        "puzzleRushBest": career_records.get("puzzleRushBest", puzzle_rush.get("bestScore", 0)),
        "streakRunBest": career_records.get("bestStreakRun", run_records.get("streakBest", 0)),
        "bossBestStage": career_records.get("bestBossStage", run_records.get("bossBestStage", 0)),
        "cupBestScore": career_records.get("bestCupScore", 0),
        "suddenDeathWins": career_records.get("suddenDeathWins", 0),
        "avgAccuracy": round(sum(accuracy_values) / len(accuracy_values)) if accuracy_values else None,
        "analysisArchiveGames": len(analysis_rows),
        "pressureMoves": pressure_moves,
        "pressureIncidents": pressure_incidents,
        "pressureIncidentPct": round((pressure_incidents / pressure_moves) * 100) if pressure_moves else None,
        "missedConversions": missed_conversions,
        "desperateSaves": desperate_saves,
        "materialDonated": material_donated,
        "contractsCompleted": contract_stats.get("completed", 0),
        "contractsOffered": contract_stats.get("offered", 0),
    }


def _extract_admin_insights_payload(profile: Optional[dict]) -> dict:
    """Datos necesarios para reutilizar en Admin el mismo ``Así juegas``.

    Se entrega sólo bajo una ruta admin autenticada y sólo al pedir los
    detalles de un usuario. No se devuelve el perfil entero ni secretos de
    sesión: únicamente historiales/estadísticas que la propia pantalla
    ``Así juegas`` consume en el navegador del dueño de la cuenta.
    """
    data = (profile or {}).get("data") or {}

    game_history = _profile_json(data, "chess-study-game-history", [])
    if not isinstance(game_history, list):
        game_history = []

    combat_history = _profile_json(data, "chess-study-combat-history", [])
    if not isinstance(combat_history, list):
        combat_history = []

    rating_history = _profile_json(data, "chess-study-rating-history", [])
    if not isinstance(rating_history, list):
        rating_history = []

    rivalry = _profile_json(data, "chess-study-cpu-rivalry", {})
    if not isinstance(rivalry, dict):
        rivalry = {}

    achievements = _profile_json(data, "chess-study-achievements", [])
    if not isinstance(achievements, list):
        achievements = []

    personal_puzzles = _profile_json(data, "chess-study-personal-puzzles", [])
    if not isinstance(personal_puzzles, list):
        personal_puzzles = []

    puzzles_solved = _profile_json(data, "chess-study-puzzles-solved", 0)
    if not isinstance(puzzles_solved, (int, float)):
        puzzles_solved = 0

    summary = _extract_summary_stats(profile)
    return {
        "gameHistory": game_history,
        "combatHistory": combat_history,
        "ratingHistory": rating_history,
        "rivalry": rivalry,
        "extras": {
            "achievementsUnlocked": len(achievements),
            "puzzlesSolved": puzzles_solved,
            "personalPuzzles": len(personal_puzzles),
            "worstMove": summary.get("worstMove"),
        },
    }


def _foreground_summary(user_doc: dict, *, freshness_seconds: int = 150) -> dict:
    """Estado aproximado de pestaña visible, sin fingir tiempo real.

    El cliente reporta como máximo cada dos minutos y además en cambios de
    visibilidad. Si la pestaña muere sin poder enviar el último evento, el
    estado visible caduca solo tras un pequeño margen.
    """
    raw = user_doc.get("foreground_updated_at")
    reported = user_doc.get("is_foreground")
    if raw is None or not isinstance(reported, bool):
        return {"foreground": None, "foregroundAgeSeconds": None}
    try:
        parsed = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        age = max(0, int((datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)).total_seconds()))
    except (TypeError, ValueError):
        return {"foreground": None, "foregroundAgeSeconds": None}
    active = bool(reported) and age <= max(1, int(freshness_seconds))
    return {"foreground": active, "foregroundAgeSeconds": age}


def _presence_summary(last_activity, presence_online=None) -> dict:
    if not last_activity:
        return {"lastActivity": None, "presence": "never", "presenceAgeSeconds": None}
    try:
        parsed = datetime.fromisoformat(str(last_activity).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        age = max(0, int((datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)).total_seconds()))
    except (TypeError, ValueError):
        return {"lastActivity": str(last_activity), "presence": "offline", "presenceAgeSeconds": None}

    if presence_online is False:
        presence = "offline"
    elif age <= 150:
        presence = "online"
    elif age <= 5 * 60:
        presence = "idle"
    elif age <= 15 * 60:
        presence = "recent"
    else:
        presence = "offline"
    return {"lastActivity": parsed.astimezone(timezone.utc).isoformat(), "presence": presence, "presenceAgeSeconds": age}
