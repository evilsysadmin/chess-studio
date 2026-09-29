// copyPeninsular.test.js — Guardarraíl de copy: la UI habla español peninsular con tuteo.
//
// No intenta prohibir el pretérito indefinido en general: "En esa posición jugaste Cxe5"
// es correcto en España cuando el marco temporal está cerrado (una partida concreta ya
// terminada). Sólo bloquea construcciones que en peninsular piden pretérito perfecto
// ("Todavía no has jugado", "ya has resuelto", "¡Has ganado!") y marcas rioplatenses
// inequívocas (voseo verbal, "acá").
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = new URL('.', import.meta.url).pathname;

// Ficheros que otras PRs abiertas están tocando ahora mismo. Se retiran de aquí en cuanto
// esas PRs se mergeen y el fichero quede limpio. No añadir ficheros nuevos para "silenciar"
// un fallo: corregir el copy.
const PENDING_ELSEWHERE = new Set([
  'App.jsx', // #4301 / #4305 / #4307 / #4353
  'components/PostGameExperience.jsx', // #4385 / #4350
  'components/PvpGameScreen.jsx', // #4382
]);
// Histórico de notas de versión ya publicadas: se conserva literal.
const HISTORICAL = new Set(['userReleaseNotesArchive.js']);

const L = '\\p{L}';
const RULES = [
  { id: 'todavia-indefinido', re: new RegExp(`Todavía no (?:se |te |lo |la )?[${L}]+(?:aste|iste|ó)(?![${L}])`, 'gu') },
  { id: 'ya-indefinido', re: new RegExp(`(?<![${L}])ya [${L}]+(?:aste|(?<![sx])iste)(?![${L}])`, 'gu') },
  { id: 'victoria-indefinido', re: /(?:¡|['"`>]\s*)(?:Ganaste|Perdiste|Empataste)(?![\p{L}])/gu },
  { id: 'voseo', re: new RegExp(`(?<![${L}])(?:tenés|podés|querés|sabés|sos|acá|fijate)(?![${L}])`, 'gu') },
];

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'assets') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (/\.(jsx?|tsx?)$/.test(name) && !/\.test\.|\.spec\./.test(name)) yield full;
  }
}

function findViolations() {
  const out = [];
  for (const file of sourceFiles(SRC)) {
    const rel = relative(SRC, file);
    if (PENDING_ELSEWHERE.has(rel) || HISTORICAL.has(rel)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return; // comentarios de código
      for (const { id, re } of RULES) {
        re.lastIndex = 0;
        for (const m of line.matchAll(re)) out.push(`${rel}:${i + 1} [${id}] «${m[0].trim()}»`);
      }
    });
  }
  return out;
}

describe('copy en español peninsular', () => {
  it('no usa pretérito indefinido donde peninsular pide perfecto ni marcas rioplatenses', () => {
    expect(findViolations()).toEqual([]);
  });

  it('las reglas detectan los casos que motivaron el guardarraíl', () => {
    const hit = (text) => RULES.some(({ re }) => { re.lastIndex = 0; return re.test(text); });
    expect(hit('Todavía no se movió ninguna pieza.')).toBe(true);
    expect(hit('Todavía no jugaste ninguna partida.')).toBe(true);
    expect(hit("'¡Ganaste el combate!'")).toBe(true);
    expect(hit("description: 'Ganaste 5 partidas'")).toBe(true);
    expect(hit('errores que ya resolviste limpiamente')).toBe(true);
    expect(hit('quedan todas acá')).toBe(true);
    // Indefinido con marco cerrado: correcto en peninsular, no debe saltar.
    expect(hit('En esa posición jugaste Cxe5; el análisis prefería d4.')).toBe(false);
    expect(hit('Todavía no se ha movido ninguna pieza.')).toBe(false);
    expect(hit('¡Has ganado el combate!')).toBe(false);
    expect(hit('ya existe una partida en curso')).toBe(false);
  });
});
