package narrative

import (
	"fmt"
	"math"
	"math/big"
	"strconv"
	"strings"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyjson"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

func get(doc bson.D, key string) (any, bool) { return pydoc.Get(doc, key) }

// isNumber is isinstance(value, (int, float)) — bools included.
func isNumber(value any) (float64, bool) {
	switch v := value.(type) {
	case bool:
		if v {
			return 1, true
		}
		return 0, true
	case int32:
		return float64(v), true
	case int64:
		return float64(v), true
	case int:
		return float64(v), true
	case float64:
		return v, true
	}
	return 0, false
}

// pyIntString is str(int(x)) for a finite float.
func pyIntString(x float64) string {
	if math.Abs(x) < 9e18 {
		return strconv.FormatInt(int64(x), 10)
	}
	return new(big.Float).SetFloat64(math.Trunc(x)).Text('f', 0)
}

func pyRound(x float64, digits int) float64 {
	v, _ := strconv.ParseFloat(strconv.FormatFloat(x, 'f', digits, 64), 64)
	return v
}

var dailyFallbacks = map[string]string{
	"tactics":   "Achtung: hoy no consigo audiencia con Workers AI. Revise sus últimos errores tácticos y, antes de mover, enumere jaques, capturas y amenazas; vuelva a preguntarme luego.",
	"strengths": "Hoy el enlace con mi despacho está caído. Quédese con lo medible: revise sus últimas victorias y conserve el patrón que más se repita; luego vuelva a pedirme el veredicto.",
	"action":    "Bitte, una sola tarea mientras vuelve la línea: en su próxima partida haga una pausa de diez segundos antes de cada jugada crítica y compare dos candidatas.",
	"openings":  "Sin Workers AI no voy a inventarme teoría. Revise la apertura que más ha jugado y localice el primer punto donde sus resultados empiezan a torcerse; luego vuelva a preguntarme.",
	"improve":   "Achtung: hoy la línea con Workers AI está de huelga. Revise su error recurrente más frecuente y entrene una posición relacionada antes de volver a jugar.",
}

func pyStrOr(value any, fallback string) string {
	if !pyval.Truthy(value) {
		return fallback
	}
	return pyval.Str(value)
}

// Fallback is _fallback: a local line built only from supplied facts.
func Fallback(eventType string, facts bson.D) string {
	clean := sanitizedFacts(facts)
	if san, _ := get(clean, "san"); san != nil {
		if s, ok := san.(string); ok && s != "" {
			switch eventType {
			case "blunder", "mistake", "catastrophic_blunder":
				return s + ". Una forma bastante ornamental de empeorar la posición."
			case "brilliant", "tactic", "great_move":
				return s + ". Eso sí merecía tocar una pieza."
			}
			return s + ". Queda registrado."
		}
	}
	if result, _ := get(clean, "result"); result != nil {
		if s, ok := result.(string); ok && s != "" {
			return "Resultado: " + s + ". El tablero ya ha presentado su informe."
		}
	}
	switch eventType {
	case "matthias_position":
		played, _ := get(clean, "played")
		suggested, _ := get(clean, "suggested")
		loss, _ := get(clean, "loss_cp")
		lossText := ""
		if n, ok := isNumber(loss); ok {
			lossText = " y perdió aproximadamente " + pyIntString(n) + " puntos de evaluación"
		}
		return pyStrOr(played, "esa jugada") + lossText + ". Compare esa decisión con " + pyStrOr(suggested, "la alternativa del motor") + " y revise qué amenaza o pieza cambia antes de volver a mover desde esta posición."
	case "matthias_daily":
		kind, _ := get(clean, "question_kind")
		if text, ok := dailyFallbacks[pyStrOr(kind, "improve")]; ok {
			return text
		}
		return dailyFallbacks["improve"]
	case "player_portrait":
		overall, present := get(clean, "overall")
		if !present {
			overall = bson.D{}
		}
		var losses, draws any = int64(0), int64(0)
		if d, ok := overall.(bson.D); ok {
			if v, ok := get(d, "losses"); ok {
				losses = v
			}
			if v, ok := get(d, "draws"); ok {
				draws = v
			}
		}
		if n, ok := isNumber(losses); ok && n > 0 {
			return "Objetivo para la próxima partida: antes de cada jugada rival, revise jaques, capturas y amenazas; anote la primera ocasión en que esa pausa evita perder material."
		}
		if n, ok := isNumber(draws); ok && n > 0 {
			return "Objetivo para la próxima partida: cuando tenga ventaja, simplifique una sola vez cambiando piezas y conserve los peones; compruebe después si el final fue más fácil de convertir."
		}
		return "Objetivo para la próxima partida: antes de mover, identifique la amenaza rival y compare dos jugadas candidatas; elija sólo después de esa comprobación."
	case "unit_bio":
		return "Expediente pendiente de redacción por el archivo de campaña."
	case "game_opening_banter":
		game, present := get(clean, "game")
		if !present {
			game = bson.D{}
		}
		gameDoc, isDoc := game.(bson.D)
		var difficulty any
		humanColor := "white"
		if isDoc {
			difficulty, _ = get(gameDoc, "difficulty")
			color, _ := get(gameDoc, "human_color")
			humanColor = pyStrOr(color, "white")
		}
		if isDoc && isCalibrated(gameDoc) {
			if humanColor == "white" {
				return "Le he calibrado yo mismo, así que hoy no tendrá coartada. Empieza usted."
			}
			return "Le he calibrado yo mismo y llevo blancas. Hoy no tendrá coartada."
		}
		if _, isBool := difficulty.(bool); !isBool {
			if n, ok := isNumber(difficulty); ok {
				level := ""
				if n == math.Trunc(n) {
					level = pyIntString(n)
				} else {
					level = pyjson.FloatRepr(pyRound(n, 1))
				}
				if humanColor == "white" {
					return fmt.Sprintf("Nivel %s y usted con blancas. Empieza usted; no malgaste el privilegio.", level)
				}
				return fmt.Sprintf("Nivel %s y yo con blancas. Qué detalle dejarme empezar el interrogatorio.", level)
			}
		}
		if humanColor == "white" {
			return "Usted lleva blancas. Empieza usted; la primera decisión cuestionable también le pertenece."
		}
		return "Yo llevo blancas. Qué detalle dejarme empezar el interrogatorio."
	}
	if RichAnalysisEvents[eventType] {
		return "Siguiente paso: revise la posición crítica, compare dos jugadas candidatas y practique una vez el patrón que decidió la partida."
	}
	return "Antes de su próxima jugada, revise jaques, capturas y amenazas; esa pausa de diez segundos evita más errores que mover por intuición."
}

func normalizeSpaces(text string) string {
	return strings.Join(pyval.Split(text), " ")
}

// TrimComplete is _trim_complete_output: whole sentences when possible,
// otherwise a word boundary and an ellipsis.
func TrimComplete(text string, maxChars int) string {
	clean := []rune(normalizeSpaces(text))
	if len(clean) <= maxChars {
		return string(clean)
	}
	head := clean[:min(len(clean), maxChars+1)]
	minimum := int(float64(maxChars) * 0.55)
	sentenceEnd := -1
	for i := minimum; i < min(len(head), maxChars); i++ {
		if strings.ContainsRune(".!?…", head[i]) && (i+1 >= len(head) || pyval.IsSpace(head[i+1])) {
			sentenceEnd = i
		}
	}
	if sentenceEnd >= minimum {
		return pyval.Strip(string(head[:sentenceEnd+1]))
	}
	limit := max(1, maxChars-1)
	window := head[:min(limit, len(head))]
	wordEnd := -1
	for i := len(window) - 1; i >= 0; i-- {
		if window[i] == ' ' {
			wordEnd = i
			break
		}
	}
	safeEnd := limit
	if wordEnd > 0 {
		safeEnd = wordEnd
	}
	return strings.TrimRightFunc(string(head[:min(safeEnd, len(head))]), pyval.IsSpace) + "…"
}
