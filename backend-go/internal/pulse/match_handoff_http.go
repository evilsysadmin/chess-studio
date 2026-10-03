package pulse

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type cancelMatchResult string

const (
	cancelMatchOK               cancelMatchResult = "ok"
	cancelMatchNotFound         cancelMatchResult = "not_found"
	cancelMatchWrongState       cancelMatchResult = "wrong_state"
	cancelMatchRevisionConflict cancelMatchResult = "revision_conflict"
)

type readyMatchResult string

const (
	readyMatchOK               readyMatchResult = "ok"
	readyMatchNotFound         readyMatchResult = "not_found"
	readyMatchWrongState       readyMatchResult = "wrong_state"
	readyMatchRevisionConflict readyMatchResult = "revision_conflict"
)

func (s *MongoStore) CancelStartingMatch(ctx context.Context, matchID, username string, now time.Time) (cancelMatchRow, cancelMatchResult, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	participant := bson.M{
		"_id": matchID,
		"$or": bson.A{bson.M{"white": username}, bson.M{"black": username}},
	}
	var current cancelMatchRow
	err := s.db.Collection("pvp_matches").FindOne(queryCtx, participant).Decode(&current)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return cancelMatchRow{}, cancelMatchNotFound, nil
	}
	if err != nil {
		return cancelMatchRow{}, "", err
	}
	if current.Status == "cancelled" {
		return current, cancelMatchOK, nil
	}
	if current.Status != "starting" {
		return current, cancelMatchWrongState, nil
	}

	endReason := "handoff_cancelled"
	var updated cancelMatchRow
	err = s.db.Collection("pvp_matches").FindOneAndUpdate(
		queryCtx,
		bson.M{
			"_id":      matchID,
			"revision": current.Revision,
			"status":   "starting",
			"$or":      bson.A{bson.M{"white": username}, bson.M{"black": username}},
		},
		bson.M{
			"$set": bson.M{
				"status":          "cancelled",
				"result":          nil,
				"end_reason":      endReason,
				"turn_started_at": nil,
				"updated_at":      now,
			},
			"$inc": bson.M{"revision": 1},
		},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&updated)
	if err == nil {
		return updated, cancelMatchOK, nil
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		return cancelMatchRow{}, "", err
	}

	err = s.db.Collection("pvp_matches").FindOne(queryCtx, participant).Decode(&current)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return cancelMatchRow{}, cancelMatchNotFound, nil
	}
	if err != nil {
		return cancelMatchRow{}, "", err
	}
	if current.Status == "cancelled" {
		return current, cancelMatchOK, nil
	}
	return current, cancelMatchRevisionConflict, nil
}

func (s *MongoStore) ReadyMatch(ctx context.Context, matchID, username string, now time.Time, virtual virtualPlayerConfig) (cancelMatchRow, readyMatchResult, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	matches := s.db.Collection("pvp_matches")
	participant := bson.M{
		"_id":              matchID,
		"acceptance_state": bson.M{"$ne": "staged"},
		"$or":              bson.A{bson.M{"white": username}, bson.M{"black": username}},
	}

	for attempt := 0; attempt < 4; attempt++ {
		var row cancelMatchRow
		if err := matches.FindOne(queryCtx, participant).Decode(&row); errors.Is(err, mongo.ErrNoDocuments) {
			return cancelMatchRow{}, readyMatchNotFound, nil
		} else if err != nil {
			return cancelMatchRow{}, "", err
		}

		playerField, seenField, graceField := "white", "white_seen_at", "white_disconnect_grace_started_at"
		if row.Black == username {
			playerField, seenField, graceField = "black", "black_seen_at", "black_disconnect_grace_started_at"
		}
		if err := matches.FindOneAndUpdate(
			queryCtx,
			bson.M{"_id": matchID, playerField: username, "acceptance_state": bson.M{"$ne": "staged"}},
			bson.M{"$set": bson.M{seenField: now}, "$unset": bson.M{graceField: ""}},
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&row); errors.Is(err, mongo.ErrNoDocuments) {
			continue
		} else if err != nil {
			return cancelMatchRow{}, "", err
		}

		if virtualUsername := virtualOpponentUsername(row, username, virtual); virtualUsername != "" && row.Status == "starting" {
			virtualField, virtualSeen, virtualGrace, virtualReady := "white", "white_seen_at", "white_disconnect_grace_started_at", "white_ready"
			alreadyReady := row.WhiteReady
			if row.Black == virtualUsername {
				virtualField, virtualSeen, virtualGrace, virtualReady = "black", "black_seen_at", "black_disconnect_grace_started_at", "black_ready"
				alreadyReady = row.BlackReady
			}
			if !alreadyReady {
				if err := matches.FindOneAndUpdate(
					queryCtx,
					bson.M{"_id": matchID, "revision": row.Revision, "status": "starting", virtualField: virtualUsername},
					bson.M{
						"$set":   bson.M{virtualReady: true, virtualSeen: now, "updated_at": now},
						"$unset": bson.M{virtualGrace: ""},
						"$inc":   bson.M{"revision": 1},
					},
					options.FindOneAndUpdate().SetReturnDocument(options.After),
				).Decode(&row); errors.Is(err, mongo.ErrNoDocuments) {
					continue
				} else if err != nil {
					return cancelMatchRow{}, "", err
				}
			}
		}

		if row.Status == "starting" && !row.ReadyDeadline.IsZero() && !now.Before(row.ReadyDeadline) {
			endReason := "handoff_timeout"
			var timedOut cancelMatchRow
			if err := matches.FindOneAndUpdate(
				queryCtx,
				bson.M{"_id": matchID, "revision": row.Revision, "status": "starting"},
				bson.M{
					"$set": bson.M{
						"status": "cancelled", "result": nil, "end_reason": endReason,
						"turn_started_at": nil, "updated_at": now,
					},
					"$inc": bson.M{"revision": 1},
				},
				options.FindOneAndUpdate().SetReturnDocument(options.After),
			).Decode(&timedOut); err == nil {
				return timedOut, readyMatchOK, nil
			} else if !errors.Is(err, mongo.ErrNoDocuments) {
				return cancelMatchRow{}, "", err
			}
			continue
		}

		switch row.Status {
		case "cancelled", "active":
			return row, readyMatchOK, nil
		case "starting":
			// continue below
		default:
			return row, readyMatchWrongState, nil
		}

		isWhite := row.White == username
		ownReady, otherReady := row.BlackReady, row.WhiteReady
		ownReadyField := "black_ready"
		if isWhite {
			ownReady, otherReady = row.WhiteReady, row.BlackReady
			ownReadyField = "white_ready"
		}
		if ownReady && !otherReady {
			return row, readyMatchOK, nil
		}

		set := bson.M{ownReadyField: true, "updated_at": now}
		if otherReady {
			startAt := now.Add(handoffDelay)
			set["status"] = "active"
			set["start_at"] = startAt
			set["turn_started_at"] = startAt
		}
		var updated cancelMatchRow
		if err := matches.FindOneAndUpdate(
			queryCtx,
			bson.M{"_id": matchID, "revision": row.Revision, "status": "starting", playerField: username},
			bson.M{"$set": set, "$inc": bson.M{"revision": 1}},
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&updated); err == nil {
			return updated, readyMatchOK, nil
		} else if !errors.Is(err, mongo.ErrNoDocuments) {
			return cancelMatchRow{}, "", err
		}
	}

	return cancelMatchRow{}, readyMatchRevisionConflict, nil
}

func residentIdentity(username string, enabled bool) (string, any, any) {
	if !enabled {
		return username, nil, nil
	}
	switch strings.ToLower(strings.TrimSpace(username)) {
	case "otto_falk":
		return "Otto Falk", "resident", "RESIDENTE · IA"
	case "marta_stein":
		return "Marta Stein", "resident", "RESIDENTE · IA"
	case "viktor_kraus":
		return "Viktor Kraus", "resident", "RESIDENTE · IA"
	default:
		return username, nil, nil
	}
}

func isResidentUsername(username string) bool {
	switch strings.ToLower(strings.TrimSpace(username)) {
	case "otto_falk", "marta_stein", "viktor_kraus":
		return true
	default:
		return false
	}
}

func virtualOpponentUsername(row cancelMatchRow, viewer string, cfg virtualPlayerConfig) string {
	if !cfg.Enabled || !strings.EqualFold(strings.TrimSpace(viewer), strings.TrimSpace(cfg.Owner)) {
		return ""
	}
	opponent := row.White
	if row.White == viewer {
		opponent = row.Black
	} else if row.Black != viewer {
		return ""
	}
	normalized := strings.ToLower(strings.TrimSpace(opponent))
	if normalized == strings.ToLower(strings.TrimSpace(cfg.SparringUsername)) || isResidentUsername(normalized) {
		return opponent
	}
	return ""
}

func publicHandoffMatch(row cancelMatchRow, username string, now time.Time, virtual virtualPlayerConfig) map[string]any {
	isWhite := row.White == username
	turn := row.Turn
	if turn == "" {
		turn = "w"
	}
	whiteDisplay, whiteKind, whiteLabel := residentIdentity(row.White, virtual.Enabled)
	blackDisplay, blackKind, blackLabel := residentIdentity(row.Black, virtual.Enabled)

	opponentSeen := row.WhiteSeenAt
	opponentGrace := row.WhiteDisconnectGraceStarted
	if isWhite {
		opponentSeen = row.BlackSeenAt
		opponentGrace = row.BlackDisconnectGraceStarted
	}
	opponentPresence := "disconnected"
	var opponentSeenAt any
	if virtualOpponentUsername(row, username, virtual) != "" {
		opponentPresence = "online"
		opponentSeenAt = stamp(now)
	} else if !opponentSeen.IsZero() {
		opponentSeenAt = stamp(opponentSeen)
		age := now.Sub(opponentSeen)
		if age < 0 {
			age = 0
		}
		if age <= presenceOnline {
			opponentPresence = "online"
		} else if age <= presenceReconnecting {
			opponentPresence = "reconnecting"
		}
	}

	whiteClock := pointerInt64(row.WhiteClockMS, pvpInitialClockMS)
	blackClock := pointerInt64(row.BlackClockMS, pvpInitialClockMS)
	if whiteClock < 0 {
		whiteClock = 0
	}
	if blackClock < 0 {
		blackClock = 0
	}

	var runningColor any
	if row.Status == "active" && !row.TurnStartedAt.IsZero() && !now.Before(row.TurnStartedAt) {
		runningColor = turn
		elapsed := now.Sub(row.TurnStartedAt).Milliseconds()
		if elapsed < 0 {
			elapsed = 0
		}
		if turn == "w" {
			whiteClock -= elapsed
			if whiteClock < 0 {
				whiteClock = 0
			}
		} else {
			blackClock -= elapsed
			if blackClock < 0 {
				blackClock = 0
			}
		}
	}

	var opponentDisconnectDeadline any
	if row.Status == "active" && opponentPresence == "disconnected" && !opponentGrace.IsZero() {
		opponentDisconnectDeadline = stamp(opponentGrace.Add(disconnectGrace))
	}

	history := row.History
	if history == nil {
		history = []bson.M{}
	}

	youReady := row.BlackReady
	opponentReady := row.WhiteReady
	youAre := "b"
	if isWhite {
		youReady = row.WhiteReady
		opponentReady = row.BlackReady
		youAre = "w"
	}
	yourTurn := row.Status == "active" && ((turn == "w") == isWhite)

	return map[string]any{
		"id":                         row.ID,
		"white":                      row.White,
		"black":                      row.Black,
		"whiteDisplayName":           whiteDisplay,
		"blackDisplayName":           blackDisplay,
		"whiteActorKind":             whiteKind,
		"blackActorKind":             blackKind,
		"whiteActorLabel":            whiteLabel,
		"blackActorLabel":            blackLabel,
		"whiteRating":                pointerInt64(row.WhiteRating, 400),
		"blackRating":                pointerInt64(row.BlackRating, 400),
		"fen":                        row.FEN,
		"turn":                       turn,
		"status":                     row.Status,
		"result":                     pointerString(row.Result),
		"endReason":                  pointerString(row.EndReason),
		"startsAt":                   nullableStamp(row.StartAt),
		"readyDeadline":              nullableStamp(row.ReadyDeadline),
		"youReady":                   youReady,
		"opponentReady":              opponentReady,
		"opponentPresence":           opponentPresence,
		"opponentSeenAt":             opponentSeenAt,
		"opponentDisconnectDeadline": opponentDisconnectDeadline,
		"ratingChange":               ratingChangePayload(row, username),
		"clock": map[string]any{
			"id":           pvpTimeControlID,
			"whiteMs":      whiteClock,
			"blackMs":      blackClock,
			"incrementMs":  int64(0),
			"runningColor": runningColor,
		},
		"history":   history,
		"revision":  row.Revision,
		"youAre":    youAre,
		"yourTurn":  yourTurn,
		"createdAt": nullableStamp(row.CreatedAt),
		"updatedAt": nullableStamp(row.UpdatedAt),
	}
}

func (h *Handler) serveMatchHandoffCancel(w http.ResponseWriter, r *http.Request, username string, matchID string, now time.Time) {
	w.Header().Set("X-Chess-Pvp-Native", "match-handoff-cancel")
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST, OPTIONS")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Método no permitido."})
		return
	}
	row, result, err := h.store.CancelStartingMatch(r.Context(), matchID, username, now)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo actualizar la partida 1v1."})
		return
	}
	switch result {
	case cancelMatchNotFound:
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida 1v1 no encontrada."})
		return
	case cancelMatchWrongState:
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "El duelo ya ha empezado y no puede cancelarse como entrada."})
		return
	case cancelMatchRevisionConflict:
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "El duelo cambió mientras cancelábamos la entrada."})
		return
	case cancelMatchOK:
		writeJSON(w, http.StatusOK, map[string]any{"match": publicHandoffMatch(row, username, now, virtualPlayerConfig{Enabled: h.virtualPlayersEnabled, Owner: h.virtualOwner, SparringUsername: h.sparringUsername})})
		return
	default:
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo actualizar la partida 1v1."})
		return
	}
}

func (h *Handler) serveMatchReady(w http.ResponseWriter, r *http.Request, username string, matchID string, now time.Time) {
	w.Header().Set("X-Chess-Pvp-Native", "match-ready")
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST, OPTIONS")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Método no permitido."})
		return
	}
	virtual := virtualPlayerConfig{
		Enabled:          h.virtualPlayersEnabled,
		Owner:            h.virtualOwner,
		SparringUsername: h.sparringUsername,
	}
	var row cancelMatchRow
	var result readyMatchResult
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		row, result, err = h.store.ReadyMatch(r.Context(), matchID, username, now, virtual)
		if err == nil {
			break
		}
		if attempt < 2 {
			time.Sleep(time.Duration(attempt+1) * 120 * time.Millisecond)
		}
	}
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo actualizar la partida 1v1."})
		return
	}
	switch result {
	case readyMatchNotFound:
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida 1v1 no encontrada."})
		return
	case readyMatchWrongState:
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "La partida ya no está preparando el arranque."})
		return
	case readyMatchRevisionConflict:
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "El duelo cambió mientras sincronizábamos a los jugadores."})
		return
	case readyMatchOK:
		if row.Status == "active" {
			_ = h.store.LeaveRoster(r.Context(), row.White, now)
			_ = h.store.LeaveRoster(r.Context(), row.Black, now)
		}
		writeJSON(w, http.StatusOK, map[string]any{"match": publicHandoffMatch(row, username, now, virtual)})
		return
	default:
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo actualizar la partida 1v1."})
		return
	}
}
