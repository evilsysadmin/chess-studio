package chroniclesmap

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

// MapCode mirrors chronicles_map_code.py, error messages included (the
// preview route answers them as 400 details).
const (
	MapCodeVersion   = 1
	MapCodePrefix    = "CM1"
	MapCodeMaxLength = 256
	MapCodeMaxSeed   = 2147483647
)

type Recipe struct {
	Theme      string
	Width      int
	Height     int
	Verbs      []string
	Enemies    int
	Treasures  int
	Secrets    int
	Difficulty int
	Seed       int
}

// Equal is the frozen dataclass's ==.
func (r Recipe) Equal(o Recipe) bool {
	if r.Theme != o.Theme || r.Width != o.Width || r.Height != o.Height || r.Enemies != o.Enemies ||
		r.Treasures != o.Treasures || r.Secrets != o.Secrets || r.Difficulty != o.Difficulty ||
		r.Seed != o.Seed || len(r.Verbs) != len(o.Verbs) {
		return false
	}
	for i := range r.Verbs {
		if r.Verbs[i] != o.Verbs[i] {
			return false
		}
	}
	return true
}

var allowedThemes = map[string]bool{
	"crypt": true, "gallery": true, "ash": true, "archive": true, "iron": true,
	"basilica": true, "bell": true, "glass": true, "water": true,
}

var allowedVerbs = map[string]bool{
	"hunt": true, "patrol": true, "lever": true, "sluice": true, "keys": true,
	"traps": true, "treasure": true, "secret": true, "guardian": true, "puzzle": true,
}

var fieldOrder = []string{
	"theme", "size", "verbs", "enemies", "treasures", "secrets", "difficulty", "seed",
}

var sizePattern = regexp.MustCompile("^([0-9]{1,2})x([0-9]{1,2})$")

// Error is ChroniclesMapCodeError.
type Error struct{ msg string }

func (e *Error) Error() string { return e.msg }

func codeErr(format string, args ...any) error { return &Error{msg: fmt.Sprintf(format, args...)} }

func normalizeTheme(raw string) (string, error) {
	theme := strings.ToLower(pyval.Strip(raw))
	if !allowedThemes[theme] {
		if theme == "" {
			theme = "<empty>"
		}
		return "", codeErr("unsupported theme: %s", theme)
	}
	return theme, nil
}

func normalizeVerbs(raw string) ([]string, error) {
	var values []string
	for _, part := range strings.Split(raw, ",") {
		if v := pyval.Strip(part); v != "" {
			values = append(values, strings.ToLower(v))
		}
	}
	if len(values) == 0 {
		return nil, codeErr("verbs must contain at least one entry")
	}
	if len(values) > 4 {
		return nil, codeErr("verbs supports at most 4 entries")
	}
	seen := map[string]bool{}
	for _, v := range values {
		if seen[v] {
			return nil, codeErr("verbs must be unique")
		}
		seen[v] = true
	}
	for _, v := range values {
		if !allowedVerbs[v] {
			return nil, codeErr("unsupported verb: %s", v)
		}
	}
	return values, nil
}

// boundedInt is _bounded_int over an ASCII digit string.
func boundedInt(raw, field string, minimum, maximum int) (int, error) {
	if raw == "" || strings.Trim(raw, "0123456789") != "" {
		return 0, codeErr("%s must be an integer", field)
	}
	digits := strings.TrimLeft(raw, "0")
	value := maximum + 1
	if len(digits) <= 12 {
		value, _ = strconv.Atoi("0" + digits)
	}
	if value < minimum || value > maximum {
		return 0, codeErr("%s must be between %d and %d", field, minimum, maximum)
	}
	return value, nil
}

// Validate is validate_chronicles_map_code.
func Validate(recipe Recipe) (Recipe, error) {
	theme, err := normalizeTheme(recipe.Theme)
	if err != nil {
		return Recipe{}, err
	}
	verbs, err := normalizeVerbs(strings.Join(recipe.Verbs, ","))
	if err != nil {
		return Recipe{}, err
	}
	switch {
	case recipe.Width < 7 || recipe.Width > 19:
		return Recipe{}, codeErr("width must be between 7 and 19")
	case recipe.Height < 7 || recipe.Height > 15:
		return Recipe{}, codeErr("height must be between 7 and 15")
	case recipe.Enemies < 2 || recipe.Enemies > 8:
		return Recipe{}, codeErr("enemies must be between 2 and 8")
	case recipe.Treasures < 0 || recipe.Treasures > 4:
		return Recipe{}, codeErr("treasures must be between 0 and 4")
	case recipe.Secrets < 0 || recipe.Secrets > 3:
		return Recipe{}, codeErr("secrets must be between 0 and 3")
	case recipe.Difficulty < 1 || recipe.Difficulty > 5:
		return Recipe{}, codeErr("difficulty must be between 1 and 5")
	case recipe.Seed < 0 || recipe.Seed > MapCodeMaxSeed:
		return Recipe{}, codeErr("seed must be between 0 and %d", MapCodeMaxSeed)
	}
	recipe.Theme, recipe.Verbs = theme, verbs
	return recipe, nil
}

func Encode(recipe Recipe) (string, error) {
	recipe, err := Validate(recipe)
	if err != nil {
		return "", err
	}
	fields := map[string]string{
		"theme":      recipe.Theme,
		"size":       fmt.Sprintf("%dx%d", recipe.Width, recipe.Height),
		"verbs":      strings.Join(recipe.Verbs, ","),
		"enemies":    strconv.Itoa(recipe.Enemies),
		"treasures":  strconv.Itoa(recipe.Treasures),
		"secrets":    strconv.Itoa(recipe.Secrets),
		"difficulty": strconv.Itoa(recipe.Difficulty),
		"seed":       strconv.Itoa(recipe.Seed),
	}
	parts := []string{MapCodePrefix}
	for _, key := range fieldOrder {
		parts = append(parts, key+"="+fields[key])
	}
	return strings.Join(parts, "|"), nil
}

// Parse is parse_chronicles_map_code.
func Parse(raw string) (Recipe, error) {
	code := pyval.Strip(raw)
	if code == "" || utf8.RuneCountInString(code) > MapCodeMaxLength {
		return Recipe{}, codeErr("MapCode length must be 1..%d", MapCodeMaxLength)
	}
	parts := strings.Split(code, "|")
	if strings.ToUpper(parts[0]) != MapCodePrefix {
		return Recipe{}, codeErr("MapCode must start with %s", MapCodePrefix)
	}
	known := map[string]bool{}
	for _, key := range fieldOrder {
		known[key] = true
	}
	fields := map[string]string{}
	for _, token := range parts[1:] {
		key, value, found := strings.Cut(token, "=")
		if !found {
			return Recipe{}, codeErr("MapCode fields must use key=value")
		}
		key = strings.ToLower(pyval.Strip(key))
		if !known[key] {
			if key == "" {
				key = "<empty>"
			}
			return Recipe{}, codeErr("unknown MapCode field: %s", key)
		}
		if _, exists := fields[key]; exists {
			return Recipe{}, codeErr("duplicate MapCode field: %s", key)
		}
		fields[key] = pyval.Strip(value)
	}
	for _, key := range fieldOrder {
		if _, exists := fields[key]; !exists {
			return Recipe{}, codeErr("missing MapCode field: %s", key)
		}
	}
	size := sizePattern.FindStringSubmatch(strings.ToLower(fields["size"]))
	if size == nil {
		return Recipe{}, codeErr("size must use WIDTHxHEIGHT")
	}
	var recipe Recipe
	var err error
	if recipe.Theme, err = normalizeTheme(fields["theme"]); err != nil {
		return Recipe{}, err
	}
	for _, f := range []struct {
		raw, field string
		lo, hi     int
		dst        *int
	}{
		{size[1], "width", 7, 19, &recipe.Width},
		{size[2], "height", 7, 15, &recipe.Height},
	} {
		if *f.dst, err = boundedInt(f.raw, f.field, f.lo, f.hi); err != nil {
			return Recipe{}, err
		}
	}
	if recipe.Verbs, err = normalizeVerbs(fields["verbs"]); err != nil {
		return Recipe{}, err
	}
	for _, f := range []struct {
		field  string
		lo, hi int
		dst    *int
	}{
		{"enemies", 2, 8, &recipe.Enemies},
		{"treasures", 0, 4, &recipe.Treasures},
		{"secrets", 0, 3, &recipe.Secrets},
		{"difficulty", 1, 5, &recipe.Difficulty},
		{"seed", 0, MapCodeMaxSeed, &recipe.Seed},
	} {
		if *f.dst, err = boundedInt(fields[f.field], f.field, f.lo, f.hi); err != nil {
			return Recipe{}, err
		}
	}
	return Validate(recipe)
}
