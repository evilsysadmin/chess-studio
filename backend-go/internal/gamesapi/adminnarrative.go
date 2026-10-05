package gamesapi

// Admin's Workers AI tools, served by AdminUsersHandler with the narrative
// gateway the /api/narrative routes use (one breaker, one metrics window):
//
//	POST /api/admin/player-portrait
//	POST /api/admin/matthias/personality-preview

import (
	"context"
	_ "embed"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

const (
	AdminPlayerPortraitPattern  = "POST /api/admin/player-portrait"
	AdminMatthiasPreviewPattern = "POST /api/admin/matthias/personality-preview"
)

func init() {
	adminUserPaths["/api/admin/player-portrait"] = AdminPlayerPortraitPattern
	adminUserPaths["/api/admin/matthias/personality-preview"] = AdminMatthiasPreviewPattern
}

// matthias_preview_presets.json is admin_api.MATTHIAS_PREVIEW_PRESETS.
//
//go:embed matthias_preview_presets.json
var matthiasPreviewPresets []byte

// AdminPortraitMemory is the Matthias memory a portrait observes and reads:
// memory_store.context only, without the episodic block the player routes add.
type AdminPortraitMemory interface {
	ObserveFacts(ctx context.Context, username string, facts bson.D, now time.Time) error
	MemoryContext(ctx context.Context, username string, facts bson.D, now time.Time) (bson.D, error)
}

func narrativeAnswer(doc bson.D) bson.D {
	out := bson.D{}
	for _, key := range []string{"text", "provider", "latencyMs"} {
		v, _ := pydoc.Get(doc, key)
		out = append(out, bson.E{Key: key, Value: v})
	}
	return out
}

// portraitBody is AdminPlayerPortraitRequest: username (max 64), facts dict.
func portraitBody(body any) (string, bson.D, bson.A) {
	object, problems := modelObject(body)
	if problems != nil {
		return "", nil, problems
	}
	username, problem := stringField(object, "username", 0, 64)
	if problem != nil {
		problems = append(problems, problem)
	}
	facts := bson.D{}
	if raw, present := pydoc.Get(object, "facts"); present {
		if d, ok := raw.(bson.D); ok {
			facts = d
		} else {
			problems = append(problems, problemDoc("dict_type", bson.A{"body", "facts"}, "Input should be a valid dictionary", raw, nil))
		}
	}
	return username, facts, problems
}

// previewBody is AdminMatthiasPreviewRequest: preset (max 32, "veteran").
func previewBody(body any) (string, bson.A) {
	object, problems := modelObject(body)
	if problems != nil {
		return "", problems
	}
	raw, present := pydoc.Get(object, "preset")
	if !present {
		return "veteran", nil
	}
	preset, problem := strField(bson.A{"body", "preset"}, raw, 0, 32)
	if problem != nil {
		return "", bson.A{problem}
	}
	return preset, nil
}

func (h *AdminUsersHandler) portrait(ctx context.Context, raw string, facts bson.D) (bson.D, error) {
	target, err := h.resolveTarget(ctx, raw)
	if err != nil {
		return nil, err
	}
	portraitFacts := facts
	now := h.base.now()
	if err := h.cfg.Memory.ObserveFacts(ctx, target, facts, now); err == nil {
		if memory, err := h.cfg.Memory.MemoryContext(ctx, target, facts, now); err == nil {
			portraitFacts = pydoc.Set(pydoc.Copy(facts), "matthias_memory", memory)
		}
	}
	tone, locale := "friendly_sarcastic", "es-ES"
	result := h.cfg.Gateway.Generate(ctx, "player_portrait", portraitFacts, &tone, &locale, "portrait_admin", nil)
	return append(bson.D{{Key: "username", Value: target}}, narrativeAnswer(result.Doc())...), nil
}

func (h *AdminUsersHandler) preview(ctx context.Context, preset string) (bson.D, error) {
	key := strings.ToLower(pyval.Strip(pyval.Str(pyval.Or(preset, "veteran"))))
	presets, err := pydoc.Decode(matthiasPreviewPresets)
	if err != nil {
		return nil, err
	}
	facts, ok := pydoc.Get(presets.(bson.D), key)
	if !ok {
		return nil, fail(400, "Preset de Matthias no válido.")
	}
	synthetic := pydoc.Set(pydoc.Copy(facts.(bson.D)), "preview_synthetic", true)
	tone, locale := "friendly_sarcastic", "es-ES"
	result := h.cfg.Gateway.Generate(ctx, "matthias_daily", synthetic, &tone, &locale, "matthias_preview_"+preset, nil)
	return append(append(bson.D{{Key: "preset", Value: preset}}, narrativeAnswer(result.Doc())...), bson.E{Key: "synthetic", Value: true}), nil
}
