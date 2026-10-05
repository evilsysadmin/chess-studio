package obshistory

// deployment_annotations.py: one low-volume document per deployed build
// (keyed by release.DeploymentIdentity, so restarts of the same commit add
// nothing), drawn as markers on Admin's observability charts. Both runtimes
// upsert the same document with $setOnInsert: whichever sees the build first
// writes it.

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

// DeploymentsCollection mirrors deployment_annotations.COLLECTION_NAME.
const DeploymentsCollection = "deployment_annotations_v1"

// Deployment is the annotation of the running build.
type Deployment struct {
	ID         string
	Release    string
	Provider   string
	DeployedAt time.Time
}

// Provider is deployment_annotations._provider.
func Provider(getenv func(string) string) string {
	switch {
	case getenv("RENDER") != "" || getenv("RENDER_SERVICE_ID") != "":
		return "render"
	case getenv("OCI_RESOURCE_PRINCIPAL_VERSION") != "":
		return "oracle"
	}
	return "unknown"
}

// Deployments reads and writes the annotations.
type Deployments struct {
	collection *mongo.Collection
	current    Deployment
}

func NewDeployments(database *mongo.Database, current Deployment) *Deployments {
	return &Deployments{collection: database.Collection(DeploymentsCollection), current: current}
}

// EnsureCurrent is ensure_current_deployment_annotation: diagnostic only, so
// every failure is swallowed.
func (d *Deployments) EnsureCurrent(ctx context.Context) {
	_, err := d.collection.UpdateOne(ctx,
		bson.D{{Key: "deployment_id", Value: d.current.ID}},
		bson.D{{Key: "$setOnInsert", Value: bson.D{
			{Key: "deployment_id", Value: d.current.ID},
			{Key: "release", Value: d.current.Release},
			{Key: "provider", Value: d.current.Provider},
			{Key: "deployed_at", Value: d.current.DeployedAt.UTC()},
		}}},
		options.UpdateOne().SetUpsert(true),
	)
	if err != nil {
		return
	}
	_, _ = d.collection.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "deployment_id", Value: 1}}, Options: options.Index().SetUnique(true).SetName("deployment_id_unique")},
		{Keys: bson.D{{Key: "deployed_at", Value: 1}}, Options: options.Index().SetName("deployment_time")},
	})
}

// List is list_deployment_annotations(limit=30): newest first, and [] on any
// failure.
func (d *Deployments) List(ctx context.Context) bson.A {
	cursor, err := d.collection.Find(ctx, bson.D{},
		options.Find().SetProjection(bson.D{{Key: "_id", Value: 0}}).SetSort(bson.D{{Key: "deployed_at", Value: -1}}).SetLimit(30))
	if err != nil {
		return bson.A{}
	}
	defer cursor.Close(ctx)
	rows := bson.A{}
	for cursor.Next(ctx) {
		var raw bson.D
		if err := cursor.Decode(&raw); err != nil {
			return bson.A{}
		}
		rows = append(rows, AnnotationRow(raw))
	}
	if cursor.Err() != nil {
		return bson.A{}
	}
	return rows
}

// AnnotationRow is one list_deployment_annotations row.
func AnnotationRow(raw bson.D) bson.D {
	get := func(key string) any { v, _ := pydoc.Get(raw, key); return v }
	text := func(key, fallback string, limit int) string {
		return pyval.Prefix(pyval.Str(pyval.Or(pydoc.Normalize(get(key)), fallback)), limit)
	}
	var at string
	switch v := get("deployed_at").(type) {
	case bson.DateTime:
		at = naiveISO(v.Time())
	case time.Time:
		at = naiveISO(v)
	default:
		at = pyval.Str(pyval.Or(pydoc.Normalize(v), ""))
	}
	return bson.D{
		{Key: "release", Value: text("release", "unknown", 40)},
		{Key: "provider", Value: text("provider", "unknown", 24)},
		{Key: "deploymentId", Value: text("deployment_id", "", 80)},
		{Key: "at", Value: at},
	}
}

// naiveISO is isoformat() of the naive UTC datetime pymongo decodes.
func naiveISO(t time.Time) string {
	t = t.UTC()
	out := t.Format("2006-01-02T15:04:05")
	if us := t.Nanosecond() / 1000; us != 0 {
		out += fmt.Sprintf(".%06d", us)
	}
	return out
}
