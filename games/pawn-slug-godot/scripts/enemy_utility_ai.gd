extends RefCounted

const MEMORY_SECONDS := 1.60
const HEARD_MEMORY_SECONDS := 0.90
const DECISION_INTERVAL := 0.26
const INTENT_COMMIT_SECONDS := 0.44

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
