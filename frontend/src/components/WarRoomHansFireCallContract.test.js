import { describe, expect, it } from 'vitest';
import {
  fireCallPhase,
  HANS_BOARD_DIALOGUE_GAP_MS,
  HANS_FIRE_REPLY_LINE,
  HANS_BOARD_PEEK_TIMELINE_T,
  MATTHIAS_FIRE_CALL_LINE,
  MATTHIAS_FIRE_CALL_MS,
  MATTHIAS_FIRE_EPILOGUE_LINE,
  hansBoardPeekHoldsMovement,
  projectHansFireReplyAnchor,
  projectHansInitialReplyAnchor,
  resolveHansFireOpeningLatch,
  shouldStartHansBoardPeek,
  shouldStartHansFireEpilogue,
} from './WarRoomHansFireCallContract.js';

describe('War Room Hans fire call contract', () => {
  it('usa el intercambio exacto y pone a Matthias primero', () => {
    expect(MATTHIAS_FIRE_CALL_LINE).toBe('HANS! El fuego, bitte.');
    expect(HANS_FIRE_REPLY_LINE).toBe('Sí, señor.');
    expect(fireCallPhase(0, false)).toBe('matthias');
    expect(fireCallPhase(MATTHIAS_FIRE_CALL_MS - 1, true)).toBe('matthias');
    expect(fireCallPhase(MATTHIAS_FIRE_CALL_MS + 1, false)).toBe('await-hans');
    expect(fireCallPhase(MATTHIAS_FIRE_CALL_MS + 1, true)).toBe('hans');
  });

  it('cotillea sólo durante la salida junto al tablero y congela la marcha mientras conversa', () => {
    const suggestion = { line: 'Yo probaría caballo de g1 a f3.' };
    expect(shouldStartHansBoardPeek({
      phase: 'await-exit-peek',
      hansPhase: 'leave',
      timelineT: HANS_BOARD_PEEK_TIMELINE_T - 0.01,
      suggestion,
    })).toBe(false);
    expect(shouldStartHansBoardPeek({
      phase: 'await-exit-peek',
      hansPhase: 'leave',
      timelineT: HANS_BOARD_PEEK_TIMELINE_T,
      suggestion,
    })).toBe(true);
    expect(hansBoardPeekHoldsMovement('peek')).toBe(true);
    expect(hansBoardPeekHoldsMovement('gap-after-peek')).toBe(true);
    expect(hansBoardPeekHoldsMovement('matthias-working')).toBe(true);
    expect(hansBoardPeekHoldsMovement('gap-after-matthias')).toBe(true);
    expect(hansBoardPeekHoldsMovement('hans-working-reply')).toBe(true);
    expect(hansBoardPeekHoldsMovement('grumble')).toBe(false);
  });

  it('deja entre cinco y seis segundos de silencio entre los bocadillos del cotilleo', () => {
    expect(HANS_BOARD_DIALOGUE_GAP_MS).toBeGreaterThanOrEqual(5000);
    expect(HANS_BOARD_DIALOGUE_GAP_MS).toBeLessThanOrEqual(6000);
  });

  it('mantiene armada la entrada de Hans aunque la partida empiece a mover mientras carga la sala', () => {
    const armed = resolveHansFireOpeningLatch(null, {
      gameId: 'g-live',
      eligible: true,
      historyLength: 0,
      alreadySeen: false,
    });
    expect(armed.enabled).toBe(true);

    const afterMoves = resolveHansFireOpeningLatch(armed, {
      gameId: 'g-live',
      eligible: true,
      historyLength: 6,
      alreadySeen: false,
    });
    expect(afterMoves).toBe(armed);
    expect(afterMoves.enabled).toBe(true);

    expect(resolveHansFireOpeningLatch(armed, {
      gameId: 'g-old',
      eligible: true,
      historyLength: 3,
      alreadySeen: false,
    }).enabled).toBe(false);
    expect(resolveHansFireOpeningLatch(armed, {
      gameId: 'g-seen',
      eligible: true,
      historyLength: 0,
      alreadySeen: true,
    }).enabled).toBe(false);
  });

  it('espera a que Hans haya entrado y desaparecido por la puerta antes del epílogo', () => {
    expect(MATTHIAS_FIRE_EPILOGUE_LINE).toBe('En fin. ¿Por dónde íbamos?');
    expect(shouldStartHansFireEpilogue({
      phase: 'await-exit',
      hansSeenOnscreen: false,
      hansScreen: 'hidden',
    })).toBe(false);
    expect(shouldStartHansFireEpilogue({
      phase: 'await-exit',
      hansSeenOnscreen: true,
      hansScreen: 'onscreen',
    })).toBe(false);
    expect(shouldStartHansFireEpilogue({
      phase: 'await-exit',
      hansSeenOnscreen: true,
      hansScreen: 'hidden',
    })).toBe(true);
  });

  it('mantiene el Sí, señor más pegado a Hans que los bocadillos de salida', () => {
    const generic = projectHansFireReplyAnchor({ ndcX: 0.82, ndcY: 0.1 });
    const initial = projectHansInitialReplyAnchor({ ndcX: 0.82, ndcY: 0.1 });
    expect(generic.tailPercent).toBe(82);
    expect(initial.tailPercent).toBe(62);
    expect(Math.abs(initial.bubbleShiftPercent)).toBeLessThan(Math.abs(generic.bubbleShiftPercent));
    expect(projectHansInitialReplyAnchor({ ndcX: 'wat', ndcY: 0 })).toBeNull();
  });
});