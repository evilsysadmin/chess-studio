#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const entry = read('frontend/src/styles.css').trim().split(/\r?\n/);
const contractImport = "@import './styles/29-onboarding-game-actions.css';";
const css = read('frontend/src/styles/28-viewport-action-coherence.css');
const finalCss = read('frontend/src/styles/29-onboarding-game-actions.css');
const game = read('frontend/src/components/GameScreen.jsx');
const smoke = read('e2e/smoke.spec.js');

const checks = [
  [entry.at(-1) === contractImport, 'el contrato viewport/actions debe ser el último CSS importado'],
  [/calc\(100dvh - 15\.6rem\)/.test(css), 'partida desktop debe reservar chrome vertical real'],
  [/\.game-screen \.game-controls\s*\{[\s\S]*?position:\s*static;/.test(css), 'controles desktop no deben flotar sobre el tablero'],
  [/\.game-abandon-btn/.test(css) && /game-abandon-btn/.test(game), 'abandonar partida debe conservar jerarquía destructiva contenida'],
  [/\.game-screen \.game-controls > \.zen-mode-toggle,\s*\n\.game-screen \.game-controls > \.game-abandon-btn/.test(finalCss), 'Zen y abandonar deben compartir la misma familia visual base'],
  [/home-onboarding-target/.test(finalCss) && /home-onboarding-cue/.test(finalCss), 'el onboarding debe señalar visualmente el siguiente objetivo'],
  [/\.combat-battle-screen[\s\S]*?calc\(100dvh - 14\.5rem\)/.test(css), 'Combat debe presupuestar HUD y controles en altura'],
  [/desktop 1440x900 · Partida completa cabe en viewport/.test(smoke), 'falta regresión desktop 1440x900 de partida'],
  [/desktop 1366x768 · Partida compacta conserva tablero/.test(smoke), 'falta regresión portátil 1366x768 de partida'],
  [/desktop 1440x900 · Combat mantiene mesa y acciones coherentes/.test(smoke), 'falta regresión desktop de Combat'],
  [/Math\.max\(\.\.\.heights\) - Math\.min\(\.\.\.heights\)/.test(smoke), 'los E2E deben comprobar geometría coherente de botones'],
  [/Onboarding Home · el siguiente paso se señala/.test(smoke), 'falta E2E del recorrido visual de onboarding'],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('visual-ux-contract FAIL');
  for (const message of failed) console.error(` - ${message}`);
  process.exit(1);
}
console.log('visual-ux-contract OK · viewport + Combat + acciones coherentes + onboarding visual protegidos');
