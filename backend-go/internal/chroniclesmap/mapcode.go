package chroniclesmap

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

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

var sizePattern = regexp.MustCompile("^[0-9]{1,2}x[0-9]{1,2}$")

func parseDecimal(raw string, field string) (int, error) {
	if raw == "" {
		return 0, fmt.Errorf("%s must be an integer", field)
	}
	for _, char := range raw {
		if char < '0' || char > '9' {
			return 0, fmt.Errorf("%s must be an integer", field)
		}
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer", field)
	}
	return value, nil
}

func validate(recipe Recipe) (Recipe, error) {
	recipe.Theme = strings.ToLower(strings.TrimSpace(recipe.Theme))
	if !allowedThemes[recipe.Theme] {
		return Recipe{}, fmt.Errorf("unsupported theme: %s", recipe.Theme)
	}
	if recipe.Width < 7 || recipe.Width > 19 {
		return Recipe{}, fmt.Errorf("width must be between 7 and 19")
	}
	if recipe.Height < 7 || recipe.Height > 15 {
		return Recipe{}, fmt.Errorf("height must be between 7 and 15")
	}
	if recipe.Enemies < 2 || recipe.Enemies > 8 {
		return Recipe{}, fmt.Errorf("enemies must be between 2 and 8")
	}
	if recipe.Treasures < 0 || recipe.Treasures > 4 {
		return Recipe{}, fmt.Errorf("treasures must be between 0 and 4")
	}
	if recipe.Secrets < 0 || recipe.Secrets > 3 {
		return Recipe{}, fmt.Errorf("secrets must be between 0 and 3")
	}
	if recipe.Difficulty < 1 || recipe.Difficulty > 5 {
		return Recipe{}, fmt.Errorf("difficulty must be between 1 and 5")
	}
	if recipe.Seed < 0 || recipe.Seed > MapCodeMaxSeed {
		return Recipe{}, fmt.Errorf("seed must be between 0 and %d", MapCodeMaxSeed)
	}
	if len(recipe.Verbs) == 0 || len(recipe.Verbs) > 4 {
		return Recipe{}, fmt.Errorf("verbs count invalid")
	}

	seen := map[string]bool{}
	verbs := make([]string, 0, len(recipe.Verbs))
	for _, verb := range recipe.Verbs {
		verb = strings.ToLower(strings.TrimSpace(verb))
		if verb == "" || !allowedVerbs[verb] {
			return Recipe{}, fmt.Errorf("unsupported verb: %s", verb)
		}
		if seen[verb] {
			return Recipe{}, fmt.Errorf("verbs must be unique")
		}
		seen[verb] = true
		verbs = append(verbs, verb)
	}
	recipe.Verbs = verbs
	return recipe, nil
}

func Encode(recipe Recipe) (string, error) {
	recipe, err := validate(recipe)
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

func Parse(raw string) (Recipe, error) {
	code := strings.TrimSpace(raw)
	if len(code) < 1 || len(code) > MapCodeMaxLength {
		return Recipe{}, fmt.Errorf("MapCode length must be 1..%d", MapCodeMaxLength)
	}

	parts := strings.Split(code, "|")
	if len(parts) == 0 || strings.ToUpper(parts[0]) != MapCodePrefix {
		return Recipe{}, fmt.Errorf("MapCode must start with %s", MapCodePrefix)
	}

	fields := map[string]string{}
	required := map[string]bool{}
	for _, key := range fieldOrder {
		required[key] = true
	}
	for _, token := range parts[1:] {
		keyValue := strings.SplitN(token, "=", 2)
		if len(keyValue) != 2 {
			return Recipe{}, fmt.Errorf("MapCode fields must use key=value")
		}
		key := strings.ToLower(strings.TrimSpace(keyValue[0]))
		value := strings.TrimSpace(keyValue[1])
		if !required[key] {
			return Recipe{}, fmt.Errorf("unknown MapCode field: %s", key)
		}
		if _, exists := fields[key]; exists {
			return Recipe{}, fmt.Errorf("duplicate MapCode field: %s", key)
		}
		fields[key] = value
	}
	for _, key := range fieldOrder {
		if _, exists := fields[key]; !exists {
			return Recipe{}, fmt.Errorf("missing MapCode field: %s", key)
		}
	}

	sizeValue := strings.ToLower(fields["size"])
	if !sizePattern.MatchString(sizeValue) {
		return Recipe{}, fmt.Errorf("size must use WIDTHxHEIGHT")
	}
	size := strings.SplitN(sizeValue, "x", 2)
	width, err := parseDecimal(size[0], "width")
	if err != nil {
		return Recipe{}, err
	}
	height, err := parseDecimal(size[1], "height")
	if err != nil {
		return Recipe{}, err
	}

	enemies, err := parseDecimal(fields["enemies"], "enemies")
	if err != nil {
		return Recipe{}, err
	}
	treasures, err := parseDecimal(fields["treasures"], "treasures")
	if err != nil {
		return Recipe{}, err
	}
	secrets, err := parseDecimal(fields["secrets"], "secrets")
	if err != nil {
		return Recipe{}, err
	}
	difficulty, err := parseDecimal(fields["difficulty"], "difficulty")
	if err != nil {
		return Recipe{}, err
	}
	seed, err := parseDecimal(fields["seed"], "seed")
	if err != nil {
		return Recipe{}, err
	}

	rawVerbs := strings.Split(fields["verbs"], ",")
	verbs := make([]string, 0, len(rawVerbs))
	for _, verb := range rawVerbs {
		if strings.TrimSpace(verb) != "" {
			verbs = append(verbs, strings.TrimSpace(verb))
		}
	}

	return validate(Recipe{
		Theme: fields["theme"], Width: width, Height: height, Verbs: verbs,
		Enemies: enemies, Treasures: treasures, Secrets: secrets,
		Difficulty: difficulty, Seed: seed,
	})
}
