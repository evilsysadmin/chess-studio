// Capa narrativa desacoplada del motor. El juego calcula SIEMPRE los hechos;
// este proveedor sólo decide cómo contarlos. Por defecto es procedural y no
// necesita red, modelo ni dependencia externa. Un futuro LLM podrá implementar
// generate(event) sin recibir autoridad para cambiar XP, jugadas o estado.

function cleanText(value, max = 80) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

export function sanitizeNarrativeEvent(event = {}) {
  return {
    type: cleanText(event.type, 40),
    alias: cleanText(event.alias, 40),
    piece: cleanText(event.piece, 24),
    rank: cleanText(event.rank, 24),
    technique: cleanText(event.technique, 48),
    target: cleanText(event.target, 48),
    outcome: cleanText(event.outcome, 24),
    battles: Math.max(0, Math.floor(Number(event.battles) || 0)),
    survivals: Math.max(0, Math.floor(Number(event.survivals) || 0)),
  };
}

export function proceduralNarrative(event) {
  const e = sanitizeNarrativeEvent(event);
  const who = e.alias || e.piece || 'La unidad';
  switch (e.type) {
    case 'technique_hit':
      return `${who} gasta ${e.technique || 'su técnica'} y conecta contra ${e.target || 'el objetivo'}. Munición especial agotada.`;
    case 'technique_miss':
      return `${who} gasta ${e.technique || 'su técnica'} y falla. Magnífico momento para recordar que sólo había una.`;
    case 'technique_unlock':
      return `${who} desbloquea ${e.technique || 'una técnica especial'}. El reglamento acaba de perder otra página.`;
    case 'promotion':
      return `${who} asciende a ${e.rank || 'un nuevo rango'}. El alto mando sigue fingiendo que esto estaba previsto.`;
    case 'kia':
      return `${who} cae tras ${e.battles} batalla${e.battles === 1 ? '' : 's'}. El hueco tendrá reemplazo; el nombre, no.`;
    default:
      return `${who}: evento de combate registrado.`;
  }
}

export function createNarrativeProvider({ generate } = {}) {
  return {
    async generate(event) {
      const safeEvent = sanitizeNarrativeEvent(event);
      if (typeof generate === 'function') {
        try {
          const text = await generate(safeEvent);
          if (typeof text === 'string' && text.trim()) return text.trim().slice(0, 320);
        } catch {
          // El relato nunca puede romper una batalla. Fall back procedural.
        }
      }
      return proceduralNarrative(safeEvent);
    },
  };
}

export const defaultNarrativeProvider = createNarrativeProvider();
