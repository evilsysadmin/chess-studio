package matthiasmem

import (
	"fmt"
	"math"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

const briefingLimit = 420

// FallbackBriefing is the route's text when the memory cannot be read.
const FallbackBriefing = "Briefing corto: revise jaques, capturas y amenazas antes de mover. El archivo está momentáneamente cerrado, pero sus piezas siguen teniendo obligaciones."

// Briefing mirrors briefing_text_from_summary.
func (s *Summary) Briefing() string {
	clip := func(t string) string { return pyval.Prefix(t, briefingLimit) }
	if s.reunion != nil && s.reunion.days >= returnAfterDays {
		if s.nemesis != nil && s.nemesis.games >= 3 {
			return clip(fmt.Sprintf("Ha vuelto usted después de %d días. %s seguía en el expediente; compruebe si también sigue cobrando peaje, bitte.", s.reunion.days, s.nemesis.name))
		}
		return clip(fmt.Sprintf("Ha vuelto usted después de %d días. El expediente no se ha borrado por aburrimiento: calcule dos candidatas antes de cada decisión crítica.", s.reunion.days))
	}
	if ch := s.challenge; ch != nil {
		if remaining := max(0, ch.baselineGames+ch.target-ch.currentGames); remaining > 0 {
			left := fmt.Sprintf("Le quedan %d partidas limpias", remaining)
			if remaining == 1 {
				left = "Le queda 1 partida limpia"
			}
			return clip(fmt.Sprintf("Reto pendiente · %s. %s para que retire oficialmente la acusación.", ch.label, left))
		}
	}
	if s.debt != nil && (s.debt.status == "struggling" || s.debt.status == "mixed") {
		return "Mi consejo anterior sigue abierto. Los datos nuevos todavía no me permiten archivarlo, así que hoy no vamos a fingir que el problema se evaporó."
	}
	if len(s.goals) > 0 {
		return clip(fmt.Sprintf("Achtung. Mi obsesión actual sigue siendo: %s. Hoy no hace falta inventar otro problema; con ése ya tiene usted trabajo.", s.goals[0].label))
	}
	if n := s.nemesis; n != nil && n.games >= 3 && n.winPct < 50 {
		return clip(fmt.Sprintf("Su expediente señala %s: %d%% de victorias en %d partidas. Si aparece, juegue despierto, bitte.", n.name, int64(math.RoundToEven(n.winPct)), n.games))
	}
	switch s.mood {
	case "annoyed":
		return "Ach. El expediente reciente es bastante feo y mi paciencia estadística también tiene límites. Hoy calcule dos candidatas antes de mover y no me obligue a archivar otra autopsia."
	case "pleased":
		return "Sehr gut. Los datos recientes por fin apuntan en la dirección correcta. Disfrútelo cinco segundos y vuelva al trabajo: dos candidatas antes de cada jugada crítica."
	case "skeptical":
		return "Le estoy mirando con bastante poca fe estadística. Demuéstreme lo contrario: revise jaques, capturas y amenazas antes de cada decisión crítica."
	case "impressed":
		return "Viene mejorando desde la última vez que miré el expediente. Eso ha sido bueno. Muy bueno. No se acostumbre a oírlo: dos candidatas antes de cada jugada crítica."
	}
	if s.respectTier == "respected" || s.respectTier == "formidable" {
		return "Ya no necesita ceremonia de recluta. Juegue, calcule y deme una partida digna de un rival al que ya tengo que tomar en serio."
	}
	if s.relationTier == "veteran" {
		return "Ya nos conocemos demasiado bien. Nada de calentamiento ceremonial: juegue, calcule y deme menos material para el Hall of Shame."
	}
	return "Briefing corto: antes de mover, revise jaques, capturas y amenazas. Si hoy no me entrega una tragedia nueva que archivar, lo consideraré progreso."
}
