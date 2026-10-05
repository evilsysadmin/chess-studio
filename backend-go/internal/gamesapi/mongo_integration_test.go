package gamesapi

import (
	"context"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/accountstore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/chroniclesrun"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/feedbackstore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/matthiasmem"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/profilestore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

// Against a disposable MongoDB (integrationDB: PVP_MONGO_TEST_URL, required
// in Quality's Go lane) the corpora replay through the Mongo stores, so the
// queries and updates are Mongo's own, and must still answer Python's bytes.

func TestChroniclesRunsMatchesPythonCorpusInMongo(t *testing.T) {
	replayRunsCorpus(t, chroniclesrun.NewMongo(integrationDB(t), 5*time.Second))
}

// Admin's user tools through the real stores: the overview projection, the
// batched profile read with data.<key> projections, the profile CAS patch
// and the Matthias memory documents.
func TestAdminUsersMatchesPythonCorpusInMongo(t *testing.T) {
	db := integrationDB(t)
	replayAdminUsersCorpus(t, func(users, profiles, memories []bson.D) adminUsersStores {
		ctx := context.Background()
		for name, docs := range map[string][]bson.D{"users": users, profilestore.CollectionName: profiles, "matthias_memory": memories} {
			for _, doc := range docs {
				if _, err := db.Collection(name).InsertOne(ctx, doc); err != nil {
					t.Fatal(err)
				}
			}
		}
		profileCol := profilestore.NewMongo(db, 5*time.Second)
		return adminUsersStores{
			users: accountstore.New(db, 5*time.Second), profiles: profilestore.New(profileCol),
			matthias: matthiasmem.New(db, 5*time.Second),
			stored: func(name string) bson.D {
				doc, _, err := profileCol.FindOne(ctx, name)
				if err != nil {
					t.Fatal(err)
				}
				data, _ := pydoc.Get(doc, "data")
				d, _ := data.(bson.D)
				return d
			},
		}
	})
}

func TestAdminFeedbackMatchesPythonCorpusInMongo(t *testing.T) {
	replayAdminFeedbackCorpus(t, feedbackstore.New(integrationDB(t), 5*time.Second))
}
