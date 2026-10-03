// Package gamestore ports backend-python/game_store.py: the "games"
// collection of savegames vs the CPU. Python and Go share the collection
// while both serve games, so documents keep the exact Python shape, unknown
// fields survive a Go rewrite, and every mutation keeps Python's guarantees
// (idempotent create on a deterministic id, CAS on the SAN history, delete
// scoped to the owner).
package gamestore

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/gameops"
)

// Collection mirrors game_store.COLLECTION.
const Collection = "games"

const (
	DefaultSummaryLimit = 20
	maxSummaryLimit     = 50
	defaultTimeout      = 3 * time.Second
)

// ErrUnavailable mirrors PersistentStorageUnavailable: the API turns it into
// a 503 instead of pretending the game does not exist.
var ErrUnavailable = errors.New("MongoDB is unavailable for games")

// LastMove is the move shown as highlighted on the board.
type LastMove struct {
	From      string  `bson:"from" json:"from"`
	To        string  `bson:"to" json:"to"`
	By        string  `bson:"by" json:"by"`
	Captured  bool    `bson:"captured" json:"captured"`
	Piece     *string `bson:"piece" json:"piece"`
	Promotion *string `bson:"promotion" json:"promotion"`
}

// CreateOperation marks a game created by an idempotent request.
type CreateOperation struct {
	Key         string `bson:"key" json:"key"`
	Fingerprint string `bson:"fingerprint" json:"fingerprint"`
}

// Game is one savegame document. Difficulty stays untyped so an int written
// by Python (round() -> int) or a legacy float round-trips with its BSON type.
type Game struct {
	ID              string              `bson:"_id"`
	Owner           *string             `bson:"owner"`
	Moves           []string            `bson:"moves"`
	Difficulty      any                 `bson:"difficulty"`
	HumanColor      string              `bson:"humanColor"`
	Handicap        *string             `bson:"handicap"`
	InitialFEN      *string             `bson:"initialFen"`
	LastMove        *LastMove           `bson:"lastMove"`
	CreateOperation *CreateOperation    `bson:"createOperation"`
	OperationLedger []gameops.Operation `bson:"operationLedger,omitempty"`
	UpdatedAt       time.Time           `bson:"updatedAt"`
	// Extra keeps fields this port does not know about, so a Go rewrite never
	// drops something a newer Python wrote.
	Extra bson.M `bson:",inline"`
}

// Summary mirrors _game_summary.
type Summary struct {
	ID         string    `json:"id"`
	UpdatedAt  *string   `json:"updatedAt"`
	Difficulty any       `json:"difficulty"`
	HumanColor *string   `json:"humanColor"`
	Ply        int       `json:"ply"`
	LastMove   *LastMove `json:"lastMove"`
}

type Store struct {
	col     *mongo.Collection
	timeout time.Duration
	now     func() time.Time
}

func New(db *mongo.Database, timeout time.Duration) *Store {
	if timeout <= 0 {
		timeout = defaultTimeout
	}
	return &Store{col: db.Collection(Collection), timeout: timeout, now: time.Now}
}

func (s *Store) ctx(parent context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, s.timeout)
}

func unavailable(err error) error {
	return fmt.Errorf("%w: %v", ErrUnavailable, err)
}

// stamp prepares a document for writing the way Python builds
// {"_id": id, **data, "updatedAt": now}: BSON dates carry milliseconds, and
// moves is always an array (a nil slice would encode as null and break the
// CAS filter, which compares against an array).
func (s *Store) stamp(id string, game Game) Game {
	game.ID = id
	game.UpdatedAt = s.now().UTC().Truncate(time.Millisecond)
	if game.Moves == nil {
		game.Moves = []string{}
	}
	return game
}

// Create mirrors create_game.
func (s *Store) Create(ctx context.Context, id string, game Game) (Game, error) {
	doc := s.stamp(id, game)
	c, cancel := s.ctx(ctx)
	defer cancel()
	if _, err := s.col.InsertOne(c, doc); err != nil {
		return Game{}, unavailable(err)
	}
	return doc, nil
}

// CreateOnce mirrors create_game_once: concurrent retries share the
// deterministic id and the loser of the insert race reads the winner.
func (s *Store) CreateOnce(ctx context.Context, id string, game Game) (Game, bool, error) {
	doc := s.stamp(id, game)
	c, cancel := s.ctx(ctx)
	defer cancel()
	_, err := s.col.InsertOne(c, doc)
	if err == nil {
		return doc, true, nil
	}
	if !mongo.IsDuplicateKeyError(err) {
		return Game{}, false, unavailable(err)
	}
	existing, found, err := s.findOne(ctx, bson.D{{Key: "_id", Value: id}})
	if err != nil {
		return Game{}, false, err
	}
	if !found {
		return Game{}, false, fmt.Errorf("%w: idempotent create could not read the concurrent game", ErrUnavailable)
	}
	return existing, false, nil
}

func (s *Store) findOne(ctx context.Context, filter bson.D) (Game, bool, error) {
	c, cancel := s.ctx(ctx)
	defer cancel()
	var game Game
	err := s.col.FindOne(c, filter).Decode(&game)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return Game{}, false, nil
	}
	if err != nil {
		return Game{}, false, unavailable(err)
	}
	return game, true, nil
}

// Get mirrors get_game.
func (s *Store) Get(ctx context.Context, id string) (Game, bool, error) {
	return s.findOne(ctx, bson.D{{Key: "_id", Value: id}})
}

// GetForOwner mirrors get_game_for_owner: a null/missing owner still matches
// so the API can return the explicit legacy conflict.
func (s *Store) GetForOwner(ctx context.Context, id, owner string) (Game, bool, error) {
	return s.findOne(ctx, bson.D{
		{Key: "_id", Value: id},
		{Key: "$or", Value: bson.A{bson.D{{Key: "owner", Value: owner}}, bson.D{{Key: "owner", Value: nil}}}},
	})
}

// GetDocumentForOwner is GetForOwner without the typed decode: reads must see
// a damaged document as Python does (a 409 from load_board), not fail to
// decode it into Game and look like an unavailable database.
func (s *Store) GetDocumentForOwner(ctx context.Context, id, owner string) (bson.M, bool, error) {
	c, cancel := s.ctx(ctx)
	defer cancel()
	var doc bson.M
	err := s.col.FindOne(c, bson.D{
		{Key: "_id", Value: id},
		{Key: "$or", Value: bson.A{bson.D{{Key: "owner", Value: owner}}, bson.D{{Key: "owner", Value: nil}}}},
	}).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, unavailable(err)
	}
	return doc, true, nil
}

// summaryRow decodes only the projected fields; difficulty and humanColor
// keep Python's row.get() semantics (missing -> null).
type summaryRow struct {
	ID         any            `bson:"_id"`
	UpdatedAt  *bson.DateTime `bson:"updatedAt"`
	Difficulty any            `bson:"difficulty"`
	HumanColor *string        `bson:"humanColor"`
	Moves      []string       `bson:"moves"`
	LastMove   *LastMove      `bson:"lastMove"`
}

// ListSummariesByOwner mirrors list_game_summaries_by_owner (callers pass
// DefaultSummaryLimit as Python's default).
func (s *Store) ListSummariesByOwner(ctx context.Context, owner string, limit int) ([]Summary, error) {
	limit = max(1, min(limit, maxSummaryLimit))
	c, cancel := s.ctx(ctx)
	defer cancel()
	cursor, err := s.col.Find(c, bson.D{{Key: "owner", Value: owner}}, options.Find().
		SetProjection(bson.D{
			{Key: "_id", Value: 1}, {Key: "updatedAt", Value: 1}, {Key: "difficulty", Value: 1},
			{Key: "humanColor", Value: 1}, {Key: "moves", Value: 1}, {Key: "lastMove", Value: 1},
		}).
		SetSort(bson.D{{Key: "updatedAt", Value: -1}}).
		SetLimit(int64(limit)))
	if err != nil {
		return nil, unavailable(err)
	}
	var rows []summaryRow
	if err := cursor.All(c, &rows); err != nil {
		return nil, unavailable(err)
	}
	out := make([]Summary, 0, len(rows))
	for _, row := range rows {
		summary := Summary{
			ID:         fmt.Sprint(row.ID),
			Difficulty: row.Difficulty,
			HumanColor: row.HumanColor,
			Ply:        len(row.Moves),
			LastMove:   row.LastMove,
		}
		if row.UpdatedAt != nil {
			iso := PyNaiveISOFormat(row.UpdatedAt.Time())
			summary.UpdatedAt = &iso
		}
		out = append(out, summary)
	}
	return out, nil
}

// PyNaiveISOFormat is datetime.isoformat() of the naive UTC datetime pymongo
// returns (its client is not tz_aware): no offset, and microseconds only
// when non-zero.
func PyNaiveISOFormat(t time.Time) string {
	t = t.UTC()
	base := t.Format("2006-01-02T15:04:05")
	if us := t.Nanosecond() / 1000; us != 0 {
		return fmt.Sprintf("%s.%06d", base, us)
	}
	return base
}

// Update mirrors update_game (replace with upsert).
func (s *Store) Update(ctx context.Context, id string, game Game) (Game, error) {
	doc := s.stamp(id, game)
	c, cancel := s.ctx(ctx)
	defer cancel()
	if _, err := s.col.ReplaceOne(c, bson.D{{Key: "_id", Value: id}}, doc, options.Replace().SetUpsert(true)); err != nil {
		return Game{}, unavailable(err)
	}
	return doc, nil
}

// UpdateIfMoves mirrors update_game_if_moves: the write only lands when the
// SAN history is still exactly what the caller read.
func (s *Store) UpdateIfMoves(ctx context.Context, id string, game Game, expectedMoves []string) (bool, error) {
	doc := s.stamp(id, game)
	if expectedMoves == nil {
		expectedMoves = []string{}
	}
	c, cancel := s.ctx(ctx)
	defer cancel()
	result, err := s.col.ReplaceOne(c, bson.D{{Key: "_id", Value: id}, {Key: "moves", Value: expectedMoves}}, doc)
	if err != nil {
		return false, unavailable(err)
	}
	return result.MatchedCount > 0, nil
}

// DeleteForOwner mirrors delete_game_for_owner.
func (s *Store) DeleteForOwner(ctx context.Context, id, owner string) (bool, error) {
	c, cancel := s.ctx(ctx)
	defer cancel()
	result, err := s.col.DeleteOne(c, bson.D{{Key: "_id", Value: id}, {Key: "owner", Value: owner}})
	if err != nil {
		return false, unavailable(err)
	}
	return result.DeletedCount > 0, nil
}

// Delete mirrors delete_game.
func (s *Store) Delete(ctx context.Context, id string) (bool, error) {
	c, cancel := s.ctx(ctx)
	defer cancel()
	result, err := s.col.DeleteOne(c, bson.D{{Key: "_id", Value: id}})
	if err != nil {
		return false, unavailable(err)
	}
	return result.DeletedCount > 0, nil
}

// DeleteByOwner mirrors delete_games_by_owner (account deletion).
func (s *Store) DeleteByOwner(ctx context.Context, owner string) (int64, error) {
	c, cancel := s.ctx(ctx)
	defer cancel()
	result, err := s.col.DeleteMany(c, bson.D{{Key: "owner", Value: owner}})
	if err != nil {
		return 0, unavailable(err)
	}
	return result.DeletedCount, nil
}
