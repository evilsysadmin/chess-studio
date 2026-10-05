package narrative

import (
	"math"
	"strconv"
	"strings"
	"unicode"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyjson"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

// Python's re module is Unicode-aware: \w is any letter, number or "_",
// and \b sits between \w and anything else. Go's \b is ASCII-only, so the
// word-bounded patterns are matched here by hand.
func isWord(r rune) bool { return unicode.IsLetter(r) || unicode.IsNumber(r) || r == '_' }

type token struct {
	start, end int // rune offsets
	text       string
}

func tokens(runes []rune) []token {
	var out []token
	for i := 0; i < len(runes); {
		if !isWord(runes[i]) {
			i++
			continue
		}
		j := i
		for j < len(runes) && isWord(runes[j]) {
			j++
		}
		out = append(out, token{start: i, end: j, text: string(runes[i:j])})
		i = j
	}
	return out
}

// containsBounded is re.search(r"\bLITERAL\b", text) for a literal that
// starts and ends with word characters.
func containsBounded(text, literal string) bool {
	runes, lit := []rune(text), []rune(literal)
	for i := 0; i+len(lit) <= len(runes); i++ {
		if (i > 0 && isWord(runes[i-1])) || (i+len(lit) < len(runes) && isWord(runes[i+len(lit)])) {
			continue
		}
		if string(runes[i:i+len(lit)]) == literal {
			return true
		}
	}
	return false
}

var groundingOutputTerms = []struct {
	concept string
	terms   []string
}{
	{"mate", []string{"mate", "jaque mate", "checkmate"}},
	{"jaque", []string{"jaque", "check"}},
	{"captura", []string{"captur"}},
	{"dama", []string{"dama", "reina"}},
	{"torre", []string{"torre"}},
	{"alfil", []string{"alfil"}},
	{"caballo", []string{"caballo"}},
	{"peon", []string{"peón", "peon"}},
	{"promocion", []string{"promoc"}},
	{"enroque", []string{"enroque"}},
	{"ahogado", []string{"ahog"}},
	{"apertura", []string{"apertura"}},
	{"rating", []string{" elo", "rating"}},
	{"racha", []string{"racha"}},
	{"victoria", []string{"victoria"}},
	{"derrota", []string{"derrota"}},
	{"tablas", []string{"tablas"}},
}

var groundedConcepts = map[string][]string{
	"mate":      {"mate", "checkmate", "#"},
	"jaque":     {"jaque", "check", "+"},
	"captura":   {"captur", "capture", "takes", "x"},
	"dama":      {"dama", "queen", `"q"`},
	"torre":     {"torre", "rook", `"r"`},
	"alfil":     {"alfil", "bishop", `"b"`},
	"caballo":   {"caballo", "knight", `"n"`},
	"peon":      {"peón", "peon", "pawn", `"p"`},
	"promocion": {"promoc", "promotion", "promote"},
	"enroque":   {"enroque", "castle", "castling", "o-o"},
	"ahogado":   {"ahog", "stalemate"},
	"apertura":  {"apertura", "opening"},
	"rating":    {"elo", "rating"},
	"racha":     {"racha", "streak"},
	"victoria":  {"victoria", "win", "won"},
	"derrota":   {"derrota", "loss", "lost"},
	"tablas":    {"tablas", "draw"},
}

func containsAny(text string, terms []string) bool {
	for _, t := range terms {
		if strings.Contains(text, t) {
			return true
		}
	}
	return false
}

// Grounded is validate_grounded_output: a strong chess claim needs a signal
// for it in the event type or the facts.
func Grounded(text, eventType string, facts bson.D) (bool, string) {
	candidate := strings.ToLower(text)
	dossier, err := pydoc.EncodeSorted(sanitizedFacts(facts), true)
	if err != nil {
		dossier = []byte("{}")
	}
	if eventType == "" {
		eventType = "generic"
	}
	haystack := strings.ToLower(eventType + " " + string(dossier))
	for _, c := range groundingOutputTerms {
		if !containsAny(candidate, c.terms) {
			continue
		}
		if !containsAny(haystack, groundedConcepts[c.concept]) {
			return false, c.concept
		}
	}
	return true, ""
}

func isTerminator(r rune) bool { return strings.ContainsRune(".!?…", r) }

// sentenceParts is _sentence_parts.
func sentenceParts(text string) []string {
	clean := []rune(normalizeSpaces(text))
	var parts []string
	start := 0
	for i := 0; i < len(clean); i++ {
		if pyval.IsSpace(clean[i]) && i > 0 && isTerminator(clean[i-1]) {
			parts = append(parts, string(clean[start:i]))
			for i < len(clean) && pyval.IsSpace(clean[i]) {
				i++
			}
			start = i
			i--
		}
	}
	parts = append(parts, string(clean[start:]))
	out := parts[:0]
	for _, p := range parts {
		if p = pyval.Strip(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// digitValue is the value of a Unicode decimal digit (Nd blocks are runs
// of ten starting at zero).
func digitValue(r rune) int {
	if r >= '0' && r <= '9' {
		return int(r - '0')
	}
	start := r
	for start > 0 && unicode.IsDigit(start-1) {
		start--
	}
	return int(r-start) % 10
}

// normalizeNumber is `str(int(n)) if n.is_integer() else str(n).rstrip("0").rstrip(".")`.
func normalizeNumber(n float64) string {
	switch {
	case math.IsInf(n, 1):
		return "inf"
	case math.IsInf(n, -1):
		return "-inf"
	case math.IsNaN(n):
		return "nan"
	case n == math.Trunc(n):
		return pyIntString(n)
	}
	return strings.TrimRight(strings.TrimRight(pyjson.FloatRepr(n), "0"), ".")
}

// parseNumberToken is float(token.replace(",", ".")) for a digit token.
func parseNumberToken(token []rune) float64 {
	var b strings.Builder
	for _, r := range token {
		switch {
		case r == ',' || r == '.':
			b.WriteByte('.')
		default:
			b.WriteByte(byte('0' + digitValue(r)))
		}
	}
	n, err := strconv.ParseFloat(b.String(), 64)
	if err != nil && !math.IsInf(n, 0) {
		return math.NaN()
	}
	return n
}

// outputNumbers is re.findall(r"(?<![\w])\d+(?:[.,]\d+)?", text), normalized.
func outputNumbers(text string) map[string]bool {
	runes := []rune(text)
	out := map[string]bool{}
	for i := 0; i < len(runes); {
		if !unicode.IsDigit(runes[i]) || (i > 0 && isWord(runes[i-1])) {
			i++
			continue
		}
		j := i
		for j < len(runes) && unicode.IsDigit(runes[j]) {
			j++
		}
		if j+1 < len(runes) && (runes[j] == '.' || runes[j] == ',') && unicode.IsDigit(runes[j+1]) {
			j++
			for j < len(runes) && unicode.IsDigit(runes[j]) {
				j++
			}
		}
		out[normalizeNumber(parseNumberToken(runes[i:j]))] = true
		i = j
	}
	return out
}

// numericFacts is _numeric_facts.
func numericFacts(facts bson.D) map[string]bool {
	values := map[string]bool{}
	var walk func(v any, depth int)
	walk = func(v any, depth int) {
		if depth > maxFactDepth {
			return
		}
		switch x := v.(type) {
		case nil, bool:
			return
		case int32:
			values[normalizeNumber(float64(x))] = true
		case int64:
			values[normalizeNumber(float64(x))] = true
		case float64:
			if !math.IsNaN(x) && !math.IsInf(x, 0) {
				values[normalizeNumber(x)] = true
			}
		case bson.D:
			for _, e := range x {
				walk(e.Value, depth+1)
			}
		case bson.A:
			for _, item := range x {
				walk(item, depth+1)
			}
		}
	}
	walk(sanitizedFacts(facts), 0)
	return values
}

// openingNames is _opening_names.
func openingNames(facts bson.D) []string {
	clean := sanitizedFacts(facts)
	var names []string
	if fav, _ := get(clean, "favorite_opening"); fav != nil {
		if d, ok := fav.(bson.D); ok {
			if name, ok := mustGet(d, "name").(string); ok {
				names = append(names, pyval.Strip(name))
			}
		}
	}
	if rows, ok := mustGet(clean, "openings").(bson.A); ok {
		for _, row := range rows {
			if d, ok := row.(bson.D); ok {
				if name, ok := mustGet(d, "name").(string); ok {
					names = append(names, pyval.Strip(name))
				}
			}
		}
	}
	out := names[:0]
	for _, n := range names {
		if n != "" {
			out = append(out, n)
		}
	}
	return out
}

func mustGet(d bson.D, key string) any {
	v, _ := get(d, key)
	return v
}

func hasEvidenceAnchor(clean, lowered string, facts bson.D) bool {
	numbers := outputNumbers(clean)
	for n := range numericFacts(facts) {
		if numbers[n] {
			return true
		}
	}
	for _, name := range openingNames(facts) {
		if strings.Contains(lowered, strings.ToLower(name)) {
			return true
		}
	}
	return false
}

var portraitForbidden = []string{
	"saludo", "saludos", "estimado", "estimada", "estimados", "estimadas", "atentamente", "cordialmente",
	"quedo a la espera", "a sus pies", "a tus pies", "verá usted", "by the way", "como ia", "la ia dice",
}

var portraitActionTerms = append([]string{
	"entrena", "entrenar", "practica", "practicar", "revisa", "revisar",
	"trabaja", "trabajar", "céntrate", "centrate", "centrarte",
	"prioriza", "priorizar", "evita", "evitar", "comprueba", "comprobar",
	"vigila", "vigilar", "busca", "buscar", "intenta", "intentar",
	"mejora", "mejorar", "corrige", "corregir", "refuerza", "reforzar",
	"dedica", "dedicar", "repasa", "repasar", "fíjate", "fijate",
	"deberías", "deberias", "te conviene", "procura", "mantén", "manten", "haz",
	"en las próximas", "en las proximas", "próximas partidas",
	"proximas partidas", "la próxima partida", "la proxima partida", "antes de",
}, ustedActionTerms...)

var ustedActionTerms = []string{
	"entrene", "practique", "revise", "trabaje", "céntrese", "centrese", "priorice",
	"evite", "compruebe", "vigile", "busque", "intente", "mejore", "corrija",
	"refuerce", "dedique", "repase", "fíjese", "fijese", "debería", "deberia",
	"le conviene", "procure", "mantenga", "haga",
}

func formatViolation(clean, lowered string) bool {
	return strings.HasPrefix(clean, "-") || strings.HasPrefix(clean, "*") || strings.HasPrefix(clean, "#") || strings.Contains(clean, "```")
}

// Portrait is validate_player_portrait_contract.
func Portrait(text string, facts bson.D) (bool, string) {
	clean := normalizeSpaces(text)
	lowered := strings.ToLower(clean)
	length := len([]rune(clean))
	if length < 70 {
		return false, "too_short"
	}
	if length > PlayerPortraitMaxChars {
		return false, "too_long"
	}
	if formatViolation(clean, lowered) || strings.HasPrefix(lowered, "cpu:") || strings.HasPrefix(lowered, "narrador:") {
		return false, "format"
	}
	for _, p := range portraitForbidden {
		if containsBounded(lowered, p) {
			return false, "formal_or_meta"
		}
	}
	sentences := sentenceParts(clean)
	if len(sentences) != 3 {
		return false, "sentence_count"
	}
	if !hasEvidenceAnchor(clean, lowered, facts) {
		return false, "missing_evidence_anchor"
	}
	if !containsAny(strings.ToLower(sentences[len(sentences)-1]), portraitActionTerms) {
		return false, "missing_action"
	}
	return true, ""
}

// Daily is validate_matthias_daily_contract.
func Daily(text string, facts bson.D) (bool, string) {
	clean := normalizeSpaces(text)
	length := len([]rune(clean))
	if length < 70 || length > richAnalysisMaxOutputChars {
		return false, "length"
	}
	if formatViolation(clean, "") {
		return false, "format"
	}
	if n := len(sentenceParts(clean)); n != 2 && n != 3 {
		return false, "sentence_count"
	}
	if !hasEvidenceAnchor(clean, strings.ToLower(clean), facts) {
		return false, "missing_evidence_anchor"
	}
	return true, ""
}

func foreignScript(r rune) bool {
	return (r >= 0x0370 && r <= 0x052F) || (r >= 0x0600 && r <= 0x06FF) || (r >= 0x3040 && r <= 0x30FF) ||
		(r >= 0x3400 && r <= 0x4DBF) || (r >= 0x4E00 && r <= 0x9FFF) || (r >= 0xAC00 && r <= 0xD7AF)
}

func unbalancedMarks(text string) bool {
	var pending []rune
	for _, r := range text {
		switch {
		case r == '¡':
			pending = append(pending, '!')
		case r == '¿':
			pending = append(pending, '?')
		case len(pending) > 0 && r == pending[len(pending)-1]:
			pending = pending[:len(pending)-1]
		}
	}
	return len(pending) > 0
}

func isCalibrated(game bson.D) bool {
	source, _ := get(game, "difficulty_source")
	return source == "calibration"
}

func expectedLevel(game bson.D) (int64, bool) {
	d, _ := get(game, "difficulty")
	if _, isBool := d.(bool); isBool {
		return 0, false
	}
	n, ok := isNumber(d)
	if !ok || math.IsNaN(n) || math.IsInf(n, 0) {
		return 0, false
	}
	return int64(math.RoundToEven(n)), true
}

var levelWords = map[string]bool{"nivel": true, "niveles": true, "nivelito": true, "dificultad": true, "dificultades": true, "difficulty": true}

func lowerRunes(runes []rune) []rune {
	out := make([]rune, len(runes))
	for i, r := range runes {
		out[i] = unicode.ToLower(r)
	}
	return out
}

func hasPrefixAt(runes []rune, i int, prefix string) bool {
	p := []rune(prefix)
	if i+len(p) > len(runes) {
		return false
	}
	for k, r := range p {
		if runes[i+k] != r {
			return false
		}
	}
	return true
}

// levelMentions is LEVEL_RE.finditer: the numbers that follow "nivel",
// "dificultad" or "difficulty" (optionally "de"), 1 to 3 ASCII digits.
func levelMentions(text string) []int64 {
	runes := []rune(text)
	lower := lowerRunes(runes)
	var out []int64
	for i := 0; i < len(runes); {
		if i > 0 && isWord(runes[i-1]) {
			i++
			continue
		}
		keyword := ""
		for _, k := range []string{"nivel", "dificultad", "difficulty"} {
			if hasPrefixAt(lower, i, k) {
				keyword = k
				break
			}
		}
		if keyword == "" {
			i++
			continue
		}
		j := i + len([]rune(keyword))
		for j < len(runes) && pyval.IsSpace(runes[j]) {
			j++
		}
		digitsAt := func(k int) (int, int) {
			e := k
			for e < len(runes) && runes[e] >= '0' && runes[e] <= '9' {
				e++
			}
			return k, e
		}
		start, end := digitsAt(j)
		if start == end && hasPrefixAt(lower, j, "de") {
			k := j + 2
			for k < len(runes) && pyval.IsSpace(runes[k]) {
				k++
			}
			start, end = digitsAt(k)
		}
		if n := end - start; n >= 1 && n <= 3 && (end == len(runes) || !isWord(runes[end])) {
			value, _ := strconv.ParseInt(string(runes[start:end]), 10, 64)
			out = append(out, value)
			i = end
			continue
		}
		i++
	}
	return out
}

// openingNumbers is NUMBER_RE.finditer (digits with an optional fraction,
// neither preceded nor followed by a word character).
func openingNumbers(text string) []string {
	runes := []rune(text)
	ascii := func(r rune) bool { return r >= '0' && r <= '9' }
	var out []string
	for i := 0; i < len(runes); {
		if !ascii(runes[i]) || (i > 0 && isWord(runes[i-1])) {
			i++
			continue
		}
		j := i
		for j < len(runes) && ascii(runes[j]) {
			j++
		}
		end := -1
		if j+1 < len(runes) && (runes[j] == '.' || runes[j] == ',') && ascii(runes[j+1]) {
			k := j + 1
			for k < len(runes) && ascii(runes[k]) {
				k++
			}
			if k == len(runes) || !isWord(runes[k]) {
				end = k
			}
		}
		if end < 0 && (j == len(runes) || !isWord(runes[j])) {
			end = j
		}
		if end < 0 {
			i = j
			continue
		}
		out = append(out, string(runes[i:end]))
		i = end
	}
	return out
}

// OpeningBanter is validate_opening_banter_contract.
func OpeningBanter(text string, facts bson.D) (bool, string) {
	clean := normalizeSpaces(text)
	if clean == "" {
		return false, "empty"
	}
	game := bson.D{}
	if g, ok := mustGet(sanitizedFacts(facts), "game").(bson.D); ok {
		game = g
	}
	for _, r := range clean {
		if foreignScript(r) {
			return false, "foreign_script"
		}
	}
	if unbalancedMarks(clean) {
		return false, "unbalanced_marks"
	}
	if isCalibrated(game) {
		for _, t := range tokens([]rune(clean)) {
			if levelWords[strings.ToLower(t.text)] {
				return false, "calibrated_level"
			}
		}
	}
	level, hasLevel := expectedLevel(game)
	for _, mention := range levelMentions(clean) {
		if !hasLevel || mention != level {
			return false, "difficulty"
		}
	}
	allowed := numericFacts(facts)
	for _, raw := range openingNumbers(clean) {
		n, err := strconv.ParseFloat(strings.ReplaceAll(raw, ",", "."), 64)
		if err != nil && !math.IsInf(n, 0) {
			return false, "number"
		}
		if !allowed[normalizeNumber(n)] {
			return false, "invented_number"
		}
	}
	return true, ""
}

var registerExempt = map[string]bool{"chronicles_planner": true, "personal_puzzle_batch": true, "unit_bio": true, "observability_summary": true}

var tuteoWordPatterns = []struct {
	name  string
	words map[string]bool
}{
	{"pronombre", set("tú", "contigo", "ti")},
	{"posesivo", set("tu", "tus")},
	{"clitico", set("te")},
	{"verbo_2sg", set("tienes", "puedes", "quieres", "eres", "estás", "sabes", "haces", "juegas", "vas", "debes", "deberías",
		"necesitas", "sigues", "llevas", "empiezas", "pierdes", "mueves", "cometes", "repites", "conviertes",
		"entrenas", "revisas", "piensas", "crees", "recuerdas", "consigues", "vuelves", "acabas")},
	{"perfecto_2sg", nil},
	{"imperativo_pronominal", set("céntrate", "fíjate", "tómate", "olvídate", "acuérdate", "date", "mírate", "ponte", "vete")},
}

func set(words ...string) map[string]bool {
	out := map[string]bool{}
	for _, w := range words {
		out[w] = true
	}
	return out
}

var participleSuffixes = []string{"ado", "ido", "to", "cho", "sto", "lto", "rto"}

func inParticipleClass(r rune) bool {
	r = unicode.ToLower(r)
	return (r >= 'a' && r <= 'z') || strings.ContainsRune("áéíóúñ", r)
}

// perfectMarker is the first r"\bhas\s+[a-záéíóúñ]+(?:ado|...)\b" match.
func perfectMarker(runes []rune, toks []token) string {
	for i, t := range toks {
		if strings.ToLower(t.text) != "has" || i+1 >= len(toks) {
			continue
		}
		next := toks[i+1]
		gap := runes[t.end:next.start]
		if len(gap) == 0 {
			continue
		}
		allSpace := true
		for _, r := range gap {
			if !pyval.IsSpace(r) {
				allSpace = false
			}
		}
		if !allSpace {
			continue
		}
		word := []rune(next.text)
		ok := true
		for _, r := range word {
			if !inParticipleClass(r) {
				ok = false
				break
			}
		}
		lowered := strings.ToLower(next.text)
		if !ok {
			continue
		}
		for _, suffix := range participleSuffixes {
			if strings.HasSuffix(lowered, suffix) && len(word) > len([]rune(suffix)) {
				return strings.ToLower(string(runes[t.start:next.end]))
			}
		}
	}
	return ""
}

// Register is validate_matthias_register: Matthias always says "usted".
func Register(text, eventType string) (bool, string) {
	if registerExempt[eventType] {
		return true, ""
	}
	runes := []rune(normalizeSpaces(text))
	toks := tokens(runes)
	for _, p := range tuteoWordPatterns {
		if p.words == nil {
			if m := perfectMarker(runes, toks); m != "" {
				return false, p.name + ":" + m
			}
			continue
		}
		for _, t := range toks {
			if lowered := strings.ToLower(t.text); p.words[lowered] {
				return false, p.name + ":" + lowered
			}
		}
	}
	return true, ""
}
