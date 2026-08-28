#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const game = read('frontend/src/components/GameScreen.jsx');
const chat = read('frontend/src/components/GameChat.jsx');
const voice = read('frontend/src/components/VoiceToggle.jsx');
const notation = read('frontend/src/components/NotationPanel.jsx');
const menu = read('frontend/src/components/Menu.jsx');
const admin = read('frontend/src/components/AdminScreen.jsx');

const checks = [
  [game.includes("event: 'PRONÓSTICO DE PARTIDA'"), 'el pronóstico debe llamarse «Pronóstico de partida»'],
  [game.includes("event: 'RETO DE PARTIDA'"), 'el objetivo opcional normal debe llamarse «Reto de partida»'],
  [!game.includes("event: 'CONTRATO'"), 'no debe reaparecer «Contrato» como etiqueta del reto normal'],
  [chat.includes("title = 'Chat de partida'"), 'el chat visible debe usar copy castellano coherente'],
  [chat.includes('CPU // EN DIRECTO') && !chat.includes('LIVE LOG'), 'el kicker del chat no debe volver a «LIVE LOG»'],
  [voice.includes('VOZ') && !voice.includes('VOICE ON') && !voice.includes('VOICE OFF'), 'el control de voz no debe mezclar VOICE/VOZ'],
  [notation.includes('CPU · nivel <b>{difficulty}</b>'), 'la ficha de dificultad debe decir «CPU · nivel»'],
  [menu.includes('¿Qué es un Reto de partida?') && menu.includes('home-onboarding-tip'), 'Retos debe explicarse en FAQ y onboarding'],
  [admin.includes('>Retos</span>') && !admin.includes('>Contratos</span>'), 'Admin debe mostrar Retos para objetivos normales'],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('product-copy-check FAIL');
  failed.forEach((message) => console.error(` - ${message}`));
  process.exit(1);
}
console.log('product-copy-check OK · Retos + pronóstico + chat/voz + dificultad coherentes');
