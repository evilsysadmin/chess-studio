package matthiasmem

import (
	"context"
	"errors"
	"time"
	_ "time/tzdata" // Europe/Madrid must resolve in scratch images.

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
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
