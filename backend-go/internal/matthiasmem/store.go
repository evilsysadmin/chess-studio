package matthiasmem

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"time"
	_ "time/tzdata" // Europe/Madrid must resolve in scratch images.

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

var madrid = func() *time.Location {
	loc, err := time.LoadLocation("Europe/Madrid")
	if err != nil {
		panic(err)
	}
	return loc
}()

// MadridDay mirrors matthias_daily_store.madrid_day.
func MadridDay(now time.Time) string { return now.In(madrid).Format("2006-01-02") }

// Store reads matthias_memory and matthias_daily.
type Store struct {
	memory, daily *mongo.Collection
	timeout       time.Duration
}

func New(db *mongo.Database, timeout time.Duration) *Store {
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	return &Store{memory: db.Collection("matthias_memory"), daily: db.Collection("matthias_daily"), timeout: timeout}
}

func (s *Store) find(ctx context.Context, col *mongo.Collection, username string) (bson.D, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	var doc bson.D
	err := col.FindOne(ctx, bson.D{{Key: "_id", Value: username}}).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	normalized, _ := pydoc.Normalize(doc).(bson.D)
	return normalized, nil
}

// Memory is the user's matthias_memory document (nil when there is none).
func (s *Store) Memory(ctx context.Context, username string) (bson.D, error) {
	return s.find(ctx, s.memory, username)
}

// Daily is the user's matthias_daily ledger row (nil when there is none).
func (s *Store) Daily(ctx context.Context, username string) (bson.D, error) {
	return s.find(ctx, s.daily, username)
}

// DeleteMemory mirrors delete_user_memory (episodes live in the same
// document, so they go too; the daily ledger stays on purpose).
func (s *Store) DeleteMemory(ctx context.Context, username string) error {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	_, err := s.memory.DeleteOne(ctx, bson.D{{Key: "_id", Value: username}})
	return err
}

// DailyStatus mirrors matthias_daily_store._public_status.
func DailyStatus(row bson.D, day string) bson.D {
	sameDay := len(row) > 0 && pydoc.Equal(get(row, "day"), day)
	used := sameDay && pydoc.Equal(get(row, "state"), "used")
	pending := sameDay && pydoc.Equal(get(row, "state"), "pending")
	var kind, answer any
	if used {
		kind, answer = get(row, "question_kind"), get(row, "text")
	}
	return bson.D{
		{Key: "day", Value: day},
		{Key: "used", Value: used},
		{Key: "pending", Value: pending},
		{Key: "questionKind", Value: kind},
		{Key: "text", Value: answer},
	}
}

// MemorySummary mirrors matthias_daily_api._memory_summary over one read:
// the summary fails as a whole, the episodic part falls back on its own.
func MemorySummary(row bson.D, now time.Time) (*Summary, bson.D, error) {
	summary, err := UserSummary(row, now)
	if err != nil {
		return nil, nil, err
	}
	episodic, epErr := EpisodicSummary(row, now)
	if epErr != nil {
		episodic = EmptyEpisodic()
	}
	return summary, append(pydoc.Copy(summary.Doc), bson.E{Key: "episodicMemory", Value: episodic}), nil
}

// EmptyMemorySummary is daily_status' fallback when the memory cannot be read.
func EmptyMemorySummary() bson.D {
	return bson.D{
		{Key: "consultations", Value: int64(0)},
		{Key: "lastConsultedAt", Value: nil},
		{Key: "mainAdvice", Value: nil},
		{Key: "episodicMemory", Value: EmptyEpisodic()},
	}
}

func (s *Store) findProjected(ctx context.Context, username string, fields ...string) (bson.D, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	projection := bson.D{}
	for _, f := range fields {
		projection = append(projection, bson.E{Key: f, Value: 1})
	}
	var doc bson.D
	err := s.memory.FindOne(ctx, bson.D{{Key: "_id", Value: username}}, options.FindOne().SetProjection(projection)).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	normalized, _ := pydoc.Normalize(doc).(bson.D)
	return normalized, nil
}

func (s *Store) upsert(ctx context.Context, username string, update bson.D) error {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	_, err := s.memory.UpdateOne(ctx, bson.D{{Key: "_id", Value: username}}, update, options.UpdateOne().SetUpsert(true))
	return err
}

// ObserveFacts mirrors observe_facts (read the document, $set the derived
// coaching state).
func (s *Store) ObserveFacts(ctx context.Context, username string, facts bson.D, now time.Time) error {
	row, err := s.Memory(ctx, username)
	if err != nil {
		return err
	}
	if row == nil {
		row = bson.D{{Key: "_id", Value: username}}
	}
	update, err := ObserveFacts(row, facts, now)
	if err != nil {
		return err
	}
	return s.upsert(ctx, username, update)
}

// ObserveEpisodes mirrors matthias_episode_store.observe.
func (s *Store) ObserveEpisodes(ctx context.Context, username string, facts bson.D, now time.Time) (bson.D, error) {
	row, err := s.findProjected(ctx, username, "episodic_snapshot", "episodes")
	if err != nil {
		return nil, err
	}
	update, result, err := ObserveEpisodes(row, facts, now)
	if err != nil {
		return nil, err
	}
	return result, s.upsert(ctx, username, update)
}

// MemoryContext mirrors memory_store.context alone (Admin's portrait).
func (s *Store) MemoryContext(ctx context.Context, username string, facts bson.D, now time.Time) (bson.D, error) {
	row, err := s.Memory(ctx, username)
	if err != nil {
		return nil, err
	}
	return Context(row, facts, now)
}

// Context mirrors memory_store.context plus episode_store.context, merged
// the way the routes hand them to the model ({..., "episodic": ...}).
func (s *Store) Context(ctx context.Context, username string, facts bson.D, now time.Time) (bson.D, error) {
	memory, err := s.MemoryContext(ctx, username, facts, now)
	if err != nil {
		return nil, err
	}
	episodes, err := s.findProjected(ctx, username, "episodes")
	if err != nil {
		return nil, err
	}
	episodic, err := EpisodicContext(episodes, now)
	if err != nil {
		return nil, err
	}
	return pydoc.Set(memory, "episodic", episodic), nil
}

// Replay mirrors replay_consultation.
func (s *Store) Replay(ctx context.Context, username string, consultationID any) (bson.D, error) {
	if CleanConsultationID(consultationID) == "" {
		return nil, nil
	}
	row, err := s.findProjected(ctx, username, "recent_advice")
	if err != nil {
		return nil, err
	}
	return Replay(row, consultationID), nil
}

// RecordConsultation mirrors record_consultation: true only when a new
// consultation was stored (a replayed id is idempotent).
func (s *Store) RecordConsultation(ctx context.Context, username string, questionKind, adviceText any, facts bson.D, consultationID any, now time.Time) (bool, error) {
	c := NewConsultation(questionKind, adviceText, facts, consultationID, now)
	if c == nil {
		return false, nil
	}
	existing, err := s.findProjected(ctx, username, "recent_consultation_ids")
	if err != nil {
		return false, err
	}
	update := func() (bool, error) {
		uctx, cancel := context.WithTimeout(ctx, s.timeout)
		defer cancel()
		result, err := s.memory.UpdateOne(uctx, c.Filter(username), c.Update())
		if err != nil {
			return false, err
		}
		return result.ModifiedCount > 0, nil
	}
	if existing != nil {
		if c.Known(get(existing, "recent_consultation_ids")) {
			return false, nil
		}
		return update()
	}
	ictx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	if _, err := s.memory.InsertOne(ictx, c.NewRow(username)); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			// Another request created the row between find and insert.
			return update()
		}
		return false, err
	}
	return true, nil
}

// RecordEmblematicPosition mirrors record_emblematic_position.
func (s *Store) RecordEmblematicPosition(ctx context.Context, username string, facts bson.D, now time.Time) (bool, error) {
	if username == "" {
		return false, nil
	}
	row, err := s.findProjected(ctx, username, "emblematic_positions")
	if err != nil {
		return false, err
	}
	update, err := EmblematicUpdate(get(row, "emblematic_positions"), facts, now)
	if err != nil || update == nil {
		return false, err
	}
	return true, s.upsert(ctx, username, update)
}

// ErrReservationLost is commit's "the reservation stopped being valid".
var ErrReservationLost = errors.New("matthias daily reservation is no longer valid")

// Claim is matthias_daily_store.reserve's answer.
type Claim struct {
	Claimed     bool
	Reservation string
	Status      bson.D
}

// Reserve mirrors matthias_daily_store.reserve: today's audience, once.
func (s *Store) Reserve(ctx context.Context, username string, now time.Time) (Claim, error) {
	day := MadridDay(now)
	token := make([]byte, 18)
	if _, err := rand.Read(token); err != nil {
		return Claim{}, err
	}
	reservation := base64.RawURLEncoding.EncodeToString(token)
	rctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	result, err := s.daily.UpdateOne(rctx,
		bson.D{{Key: "_id", Value: username}, {Key: "day", Value: bson.D{{Key: "$ne", Value: day}}}},
		bson.D{
			{Key: "$set", Value: bson.D{{Key: "day", Value: day}, {Key: "state", Value: "pending"}, {Key: "reservation", Value: reservation}, {Key: "question_kind", Value: nil}, {Key: "text", Value: nil}}},
			{Key: "$setOnInsert", Value: bson.D{{Key: "_id", Value: username}}},
		},
		options.UpdateOne().SetUpsert(true))
	if err != nil && !mongo.IsDuplicateKeyError(err) {
		return Claim{}, err
	}
	if err != nil || (result.MatchedCount == 0 && result.UpsertedID == nil) {
		row, readErr := s.Daily(ctx, username)
		if readErr != nil {
			return Claim{}, readErr
		}
		return Claim{Status: DailyStatus(row, day)}, nil
	}
	return Claim{Claimed: true, Reservation: reservation}, nil
}

// Release mirrors release: only our still-pending reservation goes, and a
// storage failure is swallowed (a stale reservation beats a lost answer).
func (s *Store) Release(ctx context.Context, username, reservation string, now time.Time) {
	rctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	_, _ = s.daily.DeleteOne(rctx, bson.D{{Key: "_id", Value: username}, {Key: "day", Value: MadridDay(now)}, {Key: "state", Value: "pending"}, {Key: "reservation", Value: reservation}})
}

// Commit mirrors commit: the answer replaces our reservation.
func (s *Store) Commit(ctx context.Context, username, reservation, questionKind, answer string, now time.Time) (bson.D, error) {
	day := MadridDay(now)
	answer = pyval.Prefix(answer, 900)
	cctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	result, err := s.daily.UpdateOne(cctx,
		bson.D{{Key: "_id", Value: username}, {Key: "day", Value: day}, {Key: "state", Value: "pending"}, {Key: "reservation", Value: reservation}},
		bson.D{{Key: "$set", Value: bson.D{{Key: "state", Value: "used"}, {Key: "question_kind", Value: questionKind}, {Key: "text", Value: answer}, {Key: "reservation", Value: nil}}}})
	if err != nil {
		return nil, err
	}
	if result.MatchedCount != 1 {
		return nil, ErrReservationLost
	}
	return bson.D{{Key: "day", Value: day}, {Key: "used", Value: true}, {Key: "pending", Value: false}, {Key: "questionKind", Value: questionKind}, {Key: "text", Value: answer}}, nil
}

// AdminRows mirrors admin_status' read (at most 5000 documents).
func (s *Store) AdminRows(ctx context.Context) ([]bson.D, error) {
	ctx, cancel := context.WithTimeout(ctx, 4*s.timeout)
	defer cancel()
	cursor, err := s.memory.Find(ctx, bson.D{}, options.Find().SetProjection(AdminProjection).SetLimit(5000))
	if err != nil {
		return nil, err
	}
	var rows []bson.D
	if err := cursor.All(ctx, &rows); err != nil {
		return nil, err
	}
	for i := range rows {
		rows[i], _ = pydoc.Normalize(rows[i]).(bson.D)
	}
	return rows, nil
}
