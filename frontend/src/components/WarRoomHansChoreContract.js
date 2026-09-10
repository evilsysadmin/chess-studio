export const WAR_ROOM_HANS_CHORE_CONTRACT_VERSION = 'hans-chore-contract-v2-armor-polish';

export const WAR_ROOM_HANS_CHORE_EVENTS = Object.freeze([
  'dust-armor',
  'dust-board',
  'bring-book',
  'mail',
  'straighten-room',
  'sweep-ashes',
  'polish-brass',
]);

export const WAR_ROOM_HANS_CHORES = Object.freeze({
  // Keep the historical event id so deterministic per-game event selection is
  // stable, but the canonical visual action is now a real armor polish.
  'dust-armor': Object.freeze({ targetNames: ['war-room-teutonic-armor-right', 'war-room-teutonic-armor-left'], offsetX: -0.68, offsetZ: 0.18, actionMs: 10500, prop: 'cloth', pose: 'polish-armor' }),
  'dust-board': Object.freeze({ targetNames: ['war-room-command-desk-top'], offsetX: -1.72, offsetZ: 0.78, actionMs: 11200, prop: 'duster' }),
  'bring-book': Object.freeze({ targetNames: ['war-room-command-desk-top'], offsetX: -1.78, offsetZ: 0.72, actionMs: 9000, prop: 'book', leavesProp: true }),
  mail: Object.freeze({ targetNames: ['war-room-command-desk-top'], offsetX: -1.80, offsetZ: 0.70, actionMs: 8600, prop: 'letters', leavesProp: true }),
  'straighten-room': Object.freeze({ targetNames: ['war-room-teutonic-command-chair', 'war-room-command-carpet'], offsetX: 0.78, offsetZ: 0.42, actionMs: 9200, prop: '' }),
  'sweep-ashes': Object.freeze({ targetNames: ['war-room-fireplace'], offsetX: 0.92, offsetZ: 0.70, actionMs: 12500, prop: 'ash-brush' }),
  'polish-brass': Object.freeze({ targetNames: ['war-room-command-desk-brass-rim'], offsetX: -1.68, offsetZ: 0.76, actionMs: 10800, prop: 'cloth', pose: 'polish-brass' }),
});

const DIALOGUE_PHASES = Object.freeze({
  'dust-board': Object.freeze([
    [0, 4400, 'matthias-dust-board'],
    [4400, 9200, 'hans-dust-board'],
  ]),
  'bring-book': Object.freeze([
    [0, 4200, 'hans-bring-book'],
    [4200, 8000, 'matthias-bring-book'],
  ]),
  mail: Object.freeze([
    [0, 4000, 'hans-mail'],
    [4000, 7600, 'matthias-mail'],
  ]),
});

export const WAR_ROOM_HANS_CHORE_DIALOGUE = Object.freeze({
  'matthias-dust-board': Object.freeze({ speaker: 'MATTHIAS', text: 'Hans… las piezas no.', aria: 'Matthias advierte a Hans sobre las piezas' }),
  'hans-dust-board': Object.freeze({ speaker: 'HANS', text: 'No pensaba tocarlas, señor.', aria: 'Hans responde a Matthias' }),
  'hans-bring-book': Object.freeze({ speaker: 'HANS', text: 'El libro que pidió, señor.', aria: 'Hans trae un libro' }),
  'matthias-bring-book': Object.freeze({ speaker: 'MATTHIAS', text: 'Danke, Hans.', aria: 'Matthias agradece el libro' }),
  'hans-mail': Object.freeze({ speaker: 'HANS', text: 'La correspondencia, señor.', aria: 'Hans trae correspondencia' }),
  'matthias-mail': Object.freeze({ speaker: 'MATTHIAS', text: 'Déjela ahí, Hans.', aria: 'Matthias recibe la correspondencia' }),
});

export function warRoomHansChoreForEvent(eventName) {
  return WAR_ROOM_HANS_CHORES[String(eventName || '')] || null;
}

export function warRoomHansChoreDialoguePhase(eventName, elapsedMs) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const phases = DIALOGUE_PHASES[String(eventName || '')] || [];
  for (const [start, end, phase] of phases) {
    if (elapsed >= start && elapsed < end) return phase;
  }
  return '';
}

export function warRoomHansChoreDialogueSpec(phase) {
  return WAR_ROOM_HANS_CHORE_DIALOGUE[String(phase || '')] || null;
}
