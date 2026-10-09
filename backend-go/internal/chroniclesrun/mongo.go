package chroniclesrun

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

// Mongo is the production store over the "chronicles_runs" collection.
type Mongo struct {
	col     *mongo.Collection
	timeout time.Duration
}

func NewMongo(db *mongo.Database, timeout time.Duration) *Mongo {
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	return &Mongo{col: db.Collection(CollectionName), timeout: timeout}
}

func (s *Mongo) find(ctx context.Context, filter bson.D) (bson.D, error) {
	var row bson.D
	err := s.col.FindOne(ctx, filter).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, ErrUnavailable
	}
	return pydoc.Normalize(row).(bson.D), nil
}

func owned(runID, owner string) bson.D {
	return bson.D{{Key: "_id", Value: runID}, {Key: "owner", Value: owner}}
}

func (s *Mongo) Replay(ctx context.Context, runID, owner, fingerprint string) (bson.D, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	row, err := s.find(ctx, owned(runID, owner))
	if err != nil || row == nil {
		return nil, err
	}
	if get(row, "createFingerprint") != fingerprint {
		return nil, ErrIdempotencyConflict
	}
	return Public(row), nil
}

func (s *Mongo) Create(ctx context.Context, run NewRun) (bson.D, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	_, err := s.col.UpdateOne(ctx, bson.D{{Key: "_id", Value: run.RunID}},
		bson.D{{Key: "$setOnInsert", Value: document(run)}}, options.UpdateOne().SetUpsert(true))
	if err != nil {
		return nil, ErrUnavailable
	}
	stored, err := s.find(ctx, bson.D{{Key: "_id", Value: run.RunID}})
	if err != nil {
		return nil, err
	}
	if stored == nil || get(stored, "owner") != run.Owner || get(stored, "createFingerprint") != run.Fingerprint {
		return nil, ErrIdempotencyConflict
	}
	return Public(stored), nil
}

func (s *Mongo) Checkpoint(ctx context.Context, c Checkpoint) (bson.D, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	set := bson.D{
		{Key: "currentMapId", Value: c.MapID},
		{Key: "contentVersion", Value: pydoc.Int(c.ContentVersion)},
		{Key: "manifestRevision", Value: c.ManifestRevision},
		{Key: "worldFlags", Value: copyDoc(c.WorldFlags)},
		{Key: "inventory", Value: copyDoc(c.Inventory)},
		{Key: "quests", Value: copyDoc(c.Quests)},
		{Key: "updatedAt", Value: bson.NewDateTimeFromTime(c.Now)},
	}
	if c.TerminalStatus != nil {
		set = append(set, bson.E{Key: "status", Value: *c.TerminalStatus})
	}
	update := bson.D{{Key: "$set", Value: set}, {Key: "$inc", Value: bson.D{{Key: "worldVersion", Value: int32(1)}}}}
	if len(c.ConsumedContentIDs) > 0 || len(c.ClaimedRewards) > 0 {
		add := bson.D{}
		if len(c.ConsumedContentIDs) > 0 {
			add = append(add, bson.E{Key: "consumedContentIds", Value: bson.D{{Key: "$each", Value: strings(c.ConsumedContentIDs)}}})
		}
		if len(c.ClaimedRewards) > 0 {
			add = append(add, bson.E{Key: "claimedRewards", Value: bson.D{{Key: "$each", Value: strings(c.ClaimedRewards)}}})
		}
		update = append(update, bson.E{Key: "$addToSet", Value: add})
	}
	filter := append(owned(c.RunID, c.Owner),
		bson.E{Key: "worldVersion", Value: c.ExpectedWorldVersion},
		bson.E{Key: "$or", Value: bson.A{
			bson.D{{Key: "status", Value: "active"}},
			bson.D{{Key: "status", Value: bson.D{{Key: "$exists", Value: false}}}},
		}},
	)
	result, err := s.col.UpdateOne(ctx, filter, update)
	if err != nil {
		return nil, ErrUnavailable
	}
	if result.ModifiedCount != 1 {
		existing, err := s.find(ctx, owned(c.RunID, c.Owner))
		if err != nil || existing == nil {
			return nil, err
		}
		if statusOf(existing) != "active" {
			if terminalReplayMatches(existing, c) {
				return Public(existing), nil
			}
			return nil, ErrTerminal
		}
		return nil, ErrWorldVersion
	}
	row, err := s.find(ctx, owned(c.RunID, c.Owner))
	if err != nil {
		return nil, err
	}
	return Public(row), nil
}

func (s *Mongo) Get(ctx context.Context, runID, owner string) (bson.D, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	row, err := s.find(ctx, owned(runID, owner))
	if err != nil || row == nil {
		return nil, err
	}
	return Public(row), nil
}

func (s *Mongo) ListActive(ctx context.Context, owner string, limit int) ([]bson.D, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	if limit < 1 || limit > 30 {
		limit = 30
	}
	cursor, err := s.col.Find(ctx,
		bson.D{{Key: "owner", Value: owner}, {Key: "$or", Value: bson.A{
			bson.D{{Key: "status", Value: "active"}},
			bson.D{{Key: "status", Value: bson.D{{Key: "$exists", Value: false}}}},
		}}},
		options.Find().SetProjection(bson.D{
			{Key: "_id", Value: 1}, {Key: "currentMapId", Value: 1},
			{Key: "status", Value: 1}, {Key: "worldVersion", Value: 1}, {Key: "updatedAt", Value: 1},
		}).SetSort(bson.D{{Key: "updatedAt", Value: -1}}).SetLimit(int64(limit)),
	)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer cursor.Close(ctx)
	out := []bson.D{}
	for cursor.Next(ctx) {
		var row bson.D
		if err := cursor.Decode(&row); err != nil {
			return nil, ErrUnavailable
		}
		out = append(out, Summary(pydoc.Normalize(row).(bson.D)))
	}
	if err := cursor.Err(); err != nil {
		return nil, ErrUnavailable
	}
	return out, nil
}

func (s *Mongo) DeleteOwned(ctx context.Context, runID, owner string) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	result, err := s.col.DeleteOne(ctx, owned(runID, owner))
	if err != nil {
		return false, ErrUnavailable
	}
	return result.DeletedCount == 1, nil
}
