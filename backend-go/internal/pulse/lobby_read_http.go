package pulse

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type lobbyReadStore interface {
	LobbySnapshot(context.Context, string, time.Time) (lobbySnapshot, error)
}

func (h *Handler) serveLobbyRead(
	w http.ResponseWriter,
	r *http.Request,
	username string,
	now time.Time,
) {
	w.Header().Set("X-Chess-Pvp-Native", "lobby-read")
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET, OPTIONS")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Método no permitido."})
		return
	}
	if allowed, retryAfter := h.allowLobbyRead(username, now); !allowed {
		w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfter))
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"detail": "Demasiadas consultas del lobby 1v1."})
		return
	}

	viewer := strings.ToLower(strings.TrimSpace(username))
	if h.virtualPlayersEnabled && viewer == h.virtualOwner {
		// Compatibility rows are useful for challenge/handoff, but display
		// authority for staging actors must not depend on the human 45 s TTL.
		_ = h.ensureSyntheticRoster(r.Context(), now)
	}

	snapshot, err := h.lobbyReadStore.LobbySnapshot(r.Context(), username, now)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo leer el lobby 1v1."})
		return
	}

	roster := make([]map[string]any, 0, len(snapshot.Roster)+4)
	seenRoster := make(map[string]struct{}, len(snapshot.Roster)+4)
	for _, row := range snapshot.Roster {
		if !h.lobbyRosterVisible(username, row.Username) {
			continue
		}
		normalized := strings.ToLower(strings.TrimSpace(row.Username))
		if normalized != "" {
			seenRoster[normalized] = struct{}{}
		}
		var headToHead *lobbyHeadToHead
		if summary, ok := snapshot.HeadToHead[row.Username]; ok {
			copy := summary
			headToHead = &copy
		}
		roster = append(roster, publicLobbyRoster(
			row,
			username,
			headToHead,
			snapshot.Cooldowns[row.Username],
			h.virtualPlayersEnabled,
		))
	}
	if h.virtualPlayersEnabled && viewer == h.virtualOwner {
		virtualProfiles := []syntheticRosterProfile{{
			username: strings.ToLower(strings.TrimSpace(h.sparringUsername)),
			rating:   400,
		}}
		virtualProfiles = append(virtualProfiles, residentRosterProfiles[:]...)
		for _, profile := range virtualProfiles {
			if profile.username == "" {
				continue
			}
			if _, exists := seenRoster[profile.username]; exists {
				continue
			}
			row := rosterRow{
				Username: profile.username,
				Rating:   profile.rating,
				Tier:     ratingTier(profile.rating),
				JoinedAt: now,
			}
			var headToHead *lobbyHeadToHead
			if summary, ok := snapshot.HeadToHead[profile.username]; ok {
				copy := summary
				headToHead = &copy
			}
			roster = append(roster, publicLobbyRoster(
				row,
				username,
				headToHead,
				snapshot.Cooldowns[profile.username],
				true,
			))
			seenRoster[profile.username] = struct{}{}
		}
	}

	challenges := make([]map[string]any, 0, len(snapshot.Challenges))
	for _, row := range snapshot.Challenges {
		challenges = append(challenges, publicChallenge(row, username))
	}

	messages := make([]map[string]any, 0, len(snapshot.Messages))
	for _, row := range snapshot.Messages {
		kind := row.Kind
		if kind == "" {
			kind = "message"
		}
		messages = append(messages, map[string]any{
			"id": row.ID,
			"username": row.Username,
			"text": row.Text,
			"kind": kind,
			"createdAt": stamp(row.CreatedAt),
			"isSelf": row.Username == username,
		})
	}

	var activeMatch any
	if snapshot.ActiveMatch != nil {
		virtual := virtualPlayerConfig{
			Enabled:          h.virtualPlayersEnabled,
			Owner:            h.virtualOwner,
			SparringUsername: h.sparringUsername,
		}
		activeMatch = publicHandoffMatch(*snapshot.ActiveMatch, username, now, virtual)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"roster": roster,
		"challenges": challenges,
		"activeMatch": activeMatch,
		"messages": messages,
		"pollAfterMs": int64(3000),
	})
}

func publicLobbyRoster(
	row rosterRow,
	username string,
	headToHead *lobbyHeadToHead,
	cooldownUntil time.Time,
	virtualEnabled bool,
) map[string]any {
	tier := row.Tier
	if tier == "" {
		tier = ratingTier(row.Rating)
	}
	payload := map[string]any{
		"username": row.Username,
		"rating": row.Rating,
		"tier": tier,
		"joinedAt": stamp(row.JoinedAt),
		"isSelf": row.Username == username,
	}

	if row.Username != username && !cooldownUntil.IsZero() {
		payload["challengeCooldownUntil"] = stamp(cooldownUntil)
	}
	if row.Username != username && headToHead != nil {
		payload["headToHead"] = map[string]any{
			"games": headToHead.Games,
			"wins": headToHead.Wins,
			"draws": headToHead.Draws,
			"losses": headToHead.Losses,
			"lastPlayedAt": nullableStamp(headToHead.LastPlayedAt),
		}
	}
	if virtualEnabled && isResidentUsername(row.Username) {
		display, kind, label := residentIdentity(row.Username, true)
		payload["displayName"] = display
		payload["actorKind"] = kind
		payload["actorLabel"] = label
	}
	return payload
}

func (h *Handler) lobbyRosterVisible(viewer, rosterUsername string) bool {
	if !h.virtualPlayersEnabled {
		return true
	}
	viewer = strings.ToLower(strings.TrimSpace(viewer))
	if viewer == h.virtualOwner {
		return true
	}
	candidate := strings.ToLower(strings.TrimSpace(rosterUsername))
	if candidate == h.sparringUsername || isResidentUsername(candidate) {
		return false
	}
	return true
}


func (h *Handler) allowLobbyRead(username string, now time.Time) (bool, int) {
	h.lobbyReadMu.Lock()
	defer h.lobbyReadMu.Unlock()
	window := h.lobbyReadWindows[username]
	if window.start.IsZero() || now.Sub(window.start) >= time.Minute {
		h.lobbyReadWindows[username] = rateWindow{start: now, count: 1}
		return true, 0
	}
	if window.count >= 40 {
		retry := int(time.Minute.Seconds() - now.Sub(window.start).Seconds())
		if retry < 1 {
			retry = 1
		}
		return false, retry
	}
	window.count++
	h.lobbyReadWindows[username] = window
	return true, 0
}
