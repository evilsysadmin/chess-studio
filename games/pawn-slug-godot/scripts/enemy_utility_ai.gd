extends RefCounted

const MEMORY_SECONDS := 1.60
const HEARD_MEMORY_SECONDS := 0.90
const DECISION_INTERVAL := 0.26
const INTENT_COMMIT_SECONDS := 0.44
const MIN_DECISION_INTERVAL := 0.16
const MAX_DECISION_INTERVAL := 0.38
const MIN_COMMIT_SECONDS := 0.28
const MAX_COMMIT_SECONDS := 0.66

const INTENT_HOLD := "hold"
const INTENT_SHOOT := "shoot"
const INTENT_ADVANCE := "advance"
const INTENT_TRAVERSE := "traverse"
const INTENT_RETREAT := "retreat"
const INTENT_EVADE := "evade"

static func score_intents(context: Dictionary) -> Dictionary:
    var scores := {
        INTENT_HOLD: 8.0,
        INTENT_SHOOT: -1000.0,
        INTENT_ADVANCE: -1000.0,
        INTENT_TRAVERSE: -1000.0,
        INTENT_RETREAT: -1000.0,
        INTENT_EVADE: -1000.0,
    }
    if not bool(context.get("target_known", false)):
        scores[INTENT_HOLD] = 64.0
        return scores

    var distance := maxf(0.0, float(context.get("distance", 0.0)))
    var standoff := maxf(1.0, float(context.get("standoff", 260.0)))
    var visible := bool(context.get("visible", false))
    var vertical_gap := absf(float(context.get("vertical_gap", 0.0)))
    var vertical_threshold := maxf(1.0, float(context.get("vertical_threshold", 64.0)))
    var blocked := bool(context.get("blocker_ahead", false))
    var pit_ahead := bool(context.get("pit_ahead", false))
    var ladder_route := bool(context.get("ladder_route", false))
    var grenade_evade := not is_zero_approx(float(context.get("grenade_evade", 0.0)))
    var role := String(context.get("role", ""))
    var enemy_type := String(context.get("enemy_type", "pawn"))
    var pressure_slot_available := bool(context.get("pressure_slot_available", true))

    if grenade_evade:
        scores[INTENT_EVADE] = 100.0

    if vertical_gap > vertical_threshold or blocked or pit_ahead or ladder_route:
        scores[INTENT_TRAVERSE] = 84.0
        if ladder_route and vertical_gap > vertical_threshold:
            scores[INTENT_TRAVERSE] += 8.0
        if pit_ahead:
            scores[INTENT_TRAVERSE] += 4.0

    var retreat_threshold := standoff * float(context.get("retreat_ratio", 0.64))
    if distance < retreat_threshold:
        scores[INTENT_RETREAT] = 68.0
        if role == "support":
            scores[INTENT_RETREAT] += 6.0

    if distance > standoff + float(context.get("comfort_margin", 24.0)):
        scores[INTENT_ADVANCE] = 46.0 + minf(24.0, (distance - standoff) / 18.0)
        if role == "assaulter":
            scores[INTENT_ADVANCE] += 8.0
        if not visible:
            scores[INTENT_ADVANCE] += 10.0

    if visible and distance >= retreat_threshold and distance <= standoff + float(context.get("advance_margin", 80.0)):
        scores[INTENT_SHOOT] = 72.0
        if role == "support":
            scores[INTENT_SHOOT] += 5.0

    # Keep arcade pressure legible: once enough nearby mobile enemies are
    # already committed to shooting, the rest should move or hold instead of
    # joining a synchronized firing wall.
    if not pressure_slot_available and float(scores[INTENT_SHOOT]) > -999.0:
        scores[INTENT_SHOOT] = -1000.0
        if role == "support":
            scores[INTENT_HOLD] = maxf(float(scores[INTENT_HOLD]), 56.0)
        elif distance > retreat_threshold + float(context.get("comfort_margin", 24.0)):
            scores[INTENT_ADVANCE] = maxf(float(scores[INTENT_ADVANCE]), 58.0)
        else:
            scores[INTENT_HOLD] = maxf(float(scores[INTENT_HOLD]), 44.0)

    match enemy_type:
        "scout":
            scores[INTENT_ADVANCE] += 12.0
            scores[INTENT_TRAVERSE] += 8.0
            scores[INTENT_SHOOT] -= 4.0
        "commando":
            scores[INTENT_ADVANCE] += 8.0
            scores[INTENT_TRAVERSE] += 10.0
        "shield":
            scores[INTENT_ADVANCE] += 14.0
            scores[INTENT_TRAVERSE] += 5.0
            scores[INTENT_RETREAT] -= 18.0
        "grenadier":
            scores[INTENT_RETREAT] += 12.0
            scores[INTENT_SHOOT] += 6.0
            scores[INTENT_ADVANCE] -= 8.0
        "queen":
            scores[INTENT_SHOOT] += 4.0
            scores[INTENT_TRAVERSE] += 6.0
        "knight":
            scores[INTENT_ADVANCE] += 10.0
            scores[INTENT_TRAVERSE] += 12.0
            scores[INTENT_RETREAT] -= 6.0

    if not visible:
        scores[INTENT_HOLD] = 12.0
    return scores

static func decision_interval_for(enemy_type: String, role: String = "") -> float:
    var interval := DECISION_INTERVAL
    match enemy_type:
        "scout":
            interval = 0.18
        "commando":
            interval = 0.21
        "knight":
            interval = 0.22
        "queen":
            interval = 0.24
        "shield":
            interval = 0.31
        "grenadier":
            interval = 0.34
    if role == "support":
        interval += 0.03
    return clampf(interval, MIN_DECISION_INTERVAL, MAX_DECISION_INTERVAL)

static func commit_seconds_for(enemy_type: String, intent: String, role: String = "") -> float:
    var seconds := INTENT_COMMIT_SECONDS
    match enemy_type:
        "scout":
            seconds = 0.30
        "commando":
            seconds = 0.37
        "knight":
            seconds = 0.36
        "queen":
            seconds = 0.42
        "shield":
            seconds = 0.58
        "grenadier":
            seconds = 0.61
    if role == "support":
        seconds += 0.04
    if intent == INTENT_TRAVERSE:
        seconds = maxf(seconds, 0.48)
    elif intent == INTENT_EVADE:
        seconds = 0.12
    return clampf(seconds, MIN_COMMIT_SECONDS, MAX_COMMIT_SECONDS) if intent != INTENT_EVADE else seconds

static func choose_intent(context: Dictionary) -> String:
    var scores := score_intents(context)
    var best_intent := INTENT_HOLD
    var best_score := float(scores[INTENT_HOLD])
    for intent in [
        INTENT_EVADE,
        INTENT_TRAVERSE,
        INTENT_RETREAT,
        INTENT_SHOOT,
        INTENT_ADVANCE,
    ]:
        var score := float(scores[intent])
        if score > best_score:
            best_score = score
            best_intent = intent
    return best_intent
