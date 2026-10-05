package gamesapi

import (
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/chroniclesrun"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/feedbackstore"
)

// Against a disposable MongoDB (integrationDB: PVP_MONGO_TEST_URL, required
// in Quality's Go lane) the corpora replay through the Mongo stores, so the
// queries and updates are Mongo's own, and must still answer Python's bytes.

func TestChroniclesRunsMatchesPythonCorpusInMongo(t *testing.T) {
	replayRunsCorpus(t, chroniclesrun.NewMongo(integrationDB(t), 5*time.Second))
}

func TestAdminFeedbackMatchesPythonCorpusInMongo(t *testing.T) {
	replayAdminFeedbackCorpus(t, feedbackstore.New(integrationDB(t), 5*time.Second))
}
