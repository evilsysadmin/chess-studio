#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACTUAL_LANGUAGE_FORBIDDEN_ABSOLUTES } from '../frontend/src/factualLanguage.js';
import { peninsularCopyViolations } from './peninsular_copy_rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const game = read('frontend/src/components/GameScreen.jsx');
const chat = read('frontend/src/components/GameChat.jsx');
const voice = read('frontend/src/components/VoiceToggle.jsx');
const notation = read('frontend/src/components/NotationPanel.jsx');
const adminFeatureFiles = [
  'frontend/src/components/AdminScreen.jsx',
  'frontend/src/components/AdminDashboardContent.jsx',
  'frontend/src/components/AdminFeedbackSection.jsx',
  'frontend/src/components/AdminMatthiasStatusSection.jsx',
  'frontend/src/components/AdminUserDirectory.jsx',
];
const admin = adminFeatureFiles.map(read).join('\n');
const career = read('frontend/src/career.js');
const activityFormatting = read('frontend/src/adminFormatting.js');

function productionFrontendModules(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      productionFrontendModules(full, found);
      continue;
    }
    if (!/\.(?:js|jsx|mjs)$/.test(entry.name) || /\.test\./.test(entry.name)) continue;
    if (entry.name === 'factualLanguage.js') continue;
    found.push(full);
  }
  return found;
}

const frontendSrc = path.join(root, 'frontend', 'src');
const factualLanguageViolations = productionFrontendModules(frontendSrc).flatMap((file) => {
  const source = fs.readFileSync(file, 'utf8').toLocaleLowerCase('es');
  return FACTUAL_LANGUAGE_FORBIDDEN_ABSOLUTES
    .filter((phrase) => source.includes(phrase))
    .map((phrase) => `${path.relative(root, file).split(path.sep).join('/')}: ${JSON.stringify(phrase)}`);
});

// Ficheros que otras PRs abiertas están tocando: se retiran de aquí cuando esas PRs
// entren y el fichero quede limpio. No añadir ficheros para silenciar un fallo.
const PENINSULAR_PENDING_ELSEWHERE = new Set([
  'frontend/src/App.jsx', // #4301 / #4305 / #4307 / #4353
  'frontend/src/components/PostGameExperience.jsx', // #4385 / #4350
  'frontend/src/components/PvpGameScreen.jsx', // #4382
]);
// Notas de versión ya publicadas: histórico literal.
const PENINSULAR_HISTORICAL = new Set(['frontend/src/userReleaseNotesArchive.js']);
const peninsularViolations = productionFrontendModules(frontendSrc).flatMap((file) => {
  const relative = path.relative(root, file).split(path.sep).join('/');
  if (PENINSULAR_PENDING_ELSEWHERE.has(relative) || PENINSULAR_HISTORICAL.has(relative)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').flatMap((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return [];
    return peninsularCopyViolations(line).map(({ id, match }) => `${relative}:${index + 1} [${id}] «${match}»`);
  });
});

// Autotest de las reglas: deben cazar los casos reales que las motivaron y no
// marcar indefinido con marco temporal cerrado ni el perfecto peninsular.
const peninsularRuleSelfTest = [
  ['Todavía no se movió ninguna pieza.', true],
  ['Todavía no jugaste ninguna partida.', true],
  ["'¡Ganaste el combate!'", true],
  ["description: 'Ganaste 5 partidas'", true],
  ['errores que ya resolviste limpiamente', true],
  ['quedan todas acá', true],
  ['En esa posición jugaste Cxe5; el análisis prefería d4.', false],
  ['Todavía no se ha movido ninguna pieza.', false],
  ['¡Has ganado el combate!', false],
  ['ya existe una partida en curso', false],
].filter(([text, expected]) => (peninsularCopyViolations(text).length > 0) !== expected).map(([text]) => text);

const checks = [
  [game.includes("event: 'PRONÓSTICO DE PARTIDA'"), 'el pronóstico debe llamarse «Pronóstico de partida»'],
  [game.includes("event: 'RETO DE PARTIDA'"), 'el objetivo opcional normal debe llamarse «Reto de partida»'],
  [!game.includes("event: 'CONTRATO'"), 'no debe reaparecer «Contrato» como etiqueta del reto normal'],
  [chat.includes("title = 'Chat de partida'"), 'el chat visible debe usar copy castellano coherente'],
  [chat.includes('CPU_IDENTITY.name.toUpperCase()') && !chat.includes('CPU // EN DIRECTO') && !chat.includes('LIVE LOG'), 'el chat debe firmar como Matthias y no volver a una CPU anónima'],
  [voice.includes('VOZ') && !voice.includes('VOICE ON') && !voice.includes('VOICE OFF'), 'el control de voz no debe mezclar VOICE/VOZ'],
  [notation.includes('Matthias · {difficultyLabel(difficulty)}') && !notation.includes('CPU · nivel'), 'el cuaderno debe mostrar a Matthias con etiqueta humana, nunca el nivel técnico 0–100'],
  [admin.includes('>Retos</span>') && !admin.includes('>Contratos</span>'), 'Admin debe mostrar Retos para objetivos normales'],
  [career.includes("Reto superado ·") && career.includes('Contrato cumplido:'), 'Career debe normalizar hitos legacy al vocabulario de Retos'],
  [activityFormatting.includes("'contract-win': 'Reto superado'"), 'Actividad reciente debe etiquetar el reto completado como «Reto superado»'],
  [peninsularRuleSelfTest.length === 0, `reglas peninsulares mal calibradas para: ${peninsularRuleSelfTest.join(' · ')}`],
  [peninsularViolations.length === 0, `copy no peninsular (usar perfecto / tuteo peninsular): ${peninsularViolations.join(' · ')}`],
  [factualLanguageViolations.length === 0, `copy factual absoluto fuera del contrato: ${factualLanguageViolations.join(' · ')}`],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('product-copy-check FAIL');
  failed.forEach((message) => console.error(` - ${message}`));
  process.exit(1);
}
console.log('product-copy-check OK · Matthias + Retos + pronóstico + chat/voz + dificultad + lenguaje factual + español peninsular coherentes');
