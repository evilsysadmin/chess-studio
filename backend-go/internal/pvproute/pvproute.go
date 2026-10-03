// Package pvproute is the single routing table for the native PvP routes.
//
// The edge uses it to decide whether a request goes to Go or to the Python
// upstream, and the native handler uses the same answer to dispatch, so the
// two can never disagree about which route a path is.
package pvproute

import "strings"

type Kind int

const (
	// None means the path is not a native route; the edge proxies it.
	None Kind = iota
	LobbyRead
	LobbyPulse
	LobbyChat
	Roster
	ChallengeCreate
	ChallengeAccept
	ChallengeCancel
	ChallengeDecline
	MatchPulse
	MatchHandoffCancel
	MatchReady
	MatchResign
	MatchMove
	MatchRead
)

var kindNames = [...]string{
	None:               "none",
	LobbyRead:          "lobby-read",
	LobbyPulse:         "lobby-pulse",
	LobbyChat:          "lobby-chat",
	Roster:             "roster",
	ChallengeCreate:    "challenge-create",
	ChallengeAccept:    "challenge-accept",
	ChallengeCancel:    "challenge-cancel",
	ChallengeDecline:   "challenge-decline",
	MatchPulse:         "match-pulse",
	MatchHandoffCancel: "match-handoff-cancel",
	MatchReady:         "match-ready",
	MatchResign:        "match-resign",
	MatchMove:          "match-move",
	MatchRead:          "match-read",
}

func (k Kind) String() string {
	if k < 0 || int(k) >= len(kindNames) {
		return "unknown"
	}
	return kindNames[k]
}

// Route is a matched native route. ID is the match or challenge id, if any.
type Route struct {
	Kind Kind
	ID   string
}

const (
	matchesPrefix    = "/api/pvp/matches/"
	challengesPrefix = "/api/pvp/challenges/"
)

var exactRoutes = map[string]Kind{
	"/api/pvp/lobby":       LobbyRead,
	"/api/pvp/lobby/pulse": LobbyPulse,
	"/api/pvp/lobby/chat":  LobbyChat,
	"/api/pvp/roster":      Roster,
	"/api/pvp/challenges":  ChallengeCreate,
}

var matchActions = []struct {
	suffix string
	kind   Kind
}{
	{"/pulse", MatchPulse},
	{"/cancel-starting", MatchHandoffCancel},
	{"/ready", MatchReady},
	{"/resign", MatchResign},
	{"/move", MatchMove},
}

// Match resolves a request path (r.URL.Path, already unescaped). It keeps the
// exact semantics of the per-route parsers it replaced, including trimming
// stray slashes around an action's id and rejecting ids containing "/".
func Match(path string) Route {
	if kind, ok := exactRoutes[path]; ok {
		return Route{Kind: kind}
	}
	if rest, ok := strings.CutPrefix(path, matchesPrefix); ok {
		for _, action := range matchActions {
			if strings.HasSuffix(path, action.suffix) {
				if id, ok := actionID(rest, action.suffix); ok {
					return Route{Kind: action.kind, ID: id}
				}
				return Route{}
			}
		}
		if rest != "" && !strings.Contains(rest, "/") {
			return Route{Kind: MatchRead, ID: rest}
		}
		return Route{}
	}
	if rest, ok := strings.CutPrefix(path, challengesPrefix); ok {
		if strings.HasSuffix(path, "/accept") {
			if id, ok := actionID(rest, "/accept"); ok {
				return Route{Kind: ChallengeAccept, ID: id}
			}
		}
		parts := strings.Split(rest, "/")
		if len(parts) == 2 && parts[0] != "" {
			switch parts[1] {
			case "cancel":
				return Route{Kind: ChallengeCancel, ID: parts[0]}
			case "decline":
				return Route{Kind: ChallengeDecline, ID: parts[0]}
			}
		}
	}
	return Route{}
}

func actionID(rest, suffix string) (string, bool) {
	id := strings.Trim(strings.TrimSuffix(rest, suffix), "/")
	if id == "" || strings.Contains(id, "/") {
		return "", false
	}
	return id, true
}
