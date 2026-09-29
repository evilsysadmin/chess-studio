// peninsular_copy_rules.mjs — Reglas de copy para español peninsular.
//
// No prohíbe el pretérito indefinido en general: "En esa posición jugaste Cxe5" es
// correcto en España cuando el marco temporal está cerrado (una partida concreta ya
// terminada). Sólo marca construcciones que en peninsular piden pretérito perfecto
// ("Todavía no has jugado", "ya has resuelto", "¡Has ganado!") y marcas rioplatenses
// inequívocas (voseo verbal, "acá").
//
// scripts/product_copy_check.mjs aplica estas reglas a frontend/src y autoverifica su calibración.

const L = '\\p{L}';

export const PENINSULAR_COPY_RULES = Object.freeze([
  { id: 'todavia-indefinido', re: new RegExp(`Todavía no (?:se |te |lo |la )?[${L}]+(?:aste|iste|ó)(?![${L}])`, 'gu') },
  // (?<![sx])iste evita "existe", "insiste", "consiste"...
  { id: 'ya-indefinido', re: new RegExp(`(?<![${L}])ya [${L}]+(?:aste|(?<![sx])iste)(?![${L}])`, 'gu') },
  { id: 'victoria-indefinido', re: /(?:¡|['"`>]\s*)(?:Ganaste|Perdiste|Empataste)(?![\p{L}])/gu },
  { id: 'voseo', re: new RegExp(`(?<![${L}])(?:tenés|podés|querés|sabés|sos|acá|fijate)(?![${L}])`, 'gu') },
]);

/** Devuelve [{ id, match }] por cada construcción no peninsular encontrada en `text`. */
export function peninsularCopyViolations(text) {
  const source = String(text || '');
  const found = [];
  for (const { id, re } of PENINSULAR_COPY_RULES) {
    re.lastIndex = 0;
    for (const m of source.matchAll(re)) found.push({ id, match: m[0].trim() });
  }
  return found;
}
