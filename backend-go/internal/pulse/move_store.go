package pulse

import (
	"context"
	"errors"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchmove"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MoveStore struct {
	store *MongoStore
}

func NewMoveStore(store *MongoStore) *MoveStore {
	return &MoveStore{store: store}
}

func (s *MoveStore) GetMatch(ctx context.Context, matchID string) (matchmove.Match, bool, error) {
	if s == nil || s.store == nil {
		return matchmove.Match{}, false, errors.New("move store is not configured")
	}
	row, found, err := s.store.GetHandoffMatch(ctx, matchID)
	if err != nil || !found {
		return matchmove.Match{}, found, err
	}
	return moveDomainMatch(row), true, nil
}

func (s *MoveStore) Commit(
	ctx context.Context,
	matchID string,
	update matchmove.Update,
) (cancelMatchRow, bool, error) {
	if s == nil || s.store == nil {
		return cancelMatchRow{}, false, errors.New("move store is not configured")
	}
	queryCtx, cancel := context.WithTimeout(ctx, s.store.timeout)
	defer cancel()

	var row cancelMatchRow
	err := s.store.db.Collection("pvp_matches").FindOneAndUpdate(
		queryCtx,
		moveCommitFilter(matchID, update.ExpectedRevision),
		moveUpdateDocument(update),
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return cancelMatchRow{}, false, nil
	}
	if err != nil {
		return cancelMatchRow{}, false, err
	}
	return row, true, nil
}

func moveDomainMatch(row cancelMatchRow) matchmove.Match {
	return matchmove.Match{
		ID:            row.ID,
		White:         row.White,
		Black:         row.Black,
		FEN:           row.FEN,
		Turn:          row.Turn,
		Status:        row.Status,
		Result:        cloneStringPointer(row.Result),
		EndReason:     cloneStringPointer(row.EndReason),
		StartAt:       row.StartAt,
		WhiteClockMS:  pointerInt64(row.WhiteClockMS, matchmove.InitialClockMS),
		BlackClockMS:  pointerInt64(row.BlackClockMS, matchmove.InitialClockMS),
		TurnStartedAt: row.TurnStartedAt,
		History:       moveDomainHistory(row.History),
		Revision:      row.Revision,
	}
}

func moveDomainHistory(rows []bson.M) []matchmove.HistoryEntry {
	if len(rows) == 0 {
		return nil
	}
	history := make([]matchmove.HistoryEntry, 0, len(rows))
	for _, row := range rows {
		history = append(history, matchmove.HistoryEntry{
			Ply: intFromBSON(row["ply"]),
			UCI: stringFromBSON(row["uci"]),
			SAN: stringFromBSON(row["san"]),
			By:  stringFromBSON(row["by"]),
			At:  timeFromBSON(row["at"]),
		})
	}
	return history
}

func moveHistoryBSON(rows []matchmove.HistoryEntry) []bson.M {
	if len(rows) == 0 {
		return []bson.M{}
	}
	history := make([]bson.M, 0, len(rows))
	for _, row := range rows {
		history = append(history, bson.M{
			"ply": row.Ply,
			"uci": row.UCI,
			"san": row.SAN,
			"by":  row.By,
			"at":  row.At,
		})
	}
	return history
}

func moveCommitFilter(matchID string, expectedRevision int64) bson.M {
	return bson.M{
		"_id": matchID,
		"revision": expectedRevision,
		"acceptance_state": bson.M{"$ne": "staged"},
	}
}

func moveUpdateDocument(update matchmove.Update) bson.M {
	var turnStarted any
	if !update.TurnStartedAt.IsZero() {
		turnStarted = update.TurnStartedAt
	}
	return bson.M{
		"$set": bson.M{
			"fen": update.FEN,
			"turn": update.Turn,
			"status": update.Status,
			"result": stringPointerValue(update.Result),
			"end_reason": stringPointerValue(update.EndReason),
			"history": moveHistoryBSON(update.History),
			"white_clock_ms": update.WhiteClockMS,
			"black_clock_ms": update.BlackClockMS,
			"turn_started_at": turnStarted,
			"updated_at": update.UpdatedAt,
		},
		"$inc": bson.M{"revision": 1},
	}
}

func stringPointerValue(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func intFromBSON(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	default:
		return 0
	}
}

func stringFromBSON(value any) string {
	text, _ := value.(string)
	return text
}

func timeFromBSON(value any) time.Time {
	switch typed := value.(type) {
	case time.Time:
		return typed
	case bson.DateTime:
		return typed.Time()
	default:
		return time.Time{}
	}
}
