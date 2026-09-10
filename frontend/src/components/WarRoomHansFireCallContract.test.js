import { describe, expect, it } from 'vitest';
import {
  fireCallPhase,
  HANS_BOARD_DIALOGUE_GAP_MS,
  HANS_BOARD_PEEK_CHOREOGRAPHY_PHASE,
  HANS_BOARD_PEEK_ROUTE,
  HANS_FIRE_REPLY_LINE,
  MATTHIAS_FIRE_CALL_LINE,
  MATTHIAS_FIRE_CALL_MS,
  MATTHIAS_FIRE_EPILOGUE_LINE,
  hansBoardPeekHoldsMovement,
  hansBoardPeekPointReached,
  projectHansFireReplyAnchor,
  projectHansInitialReplyAnchor,
  resolveHansFireOpeningLatch,
  shouldStartHansBoardPeek,
  shouldStartHansFireEpilogue,
} from './WarRoomHansFireCallContract.js';
import {
  HANS_BOARD_PEEK_MAX_APPROACH_DISTANCE,
  HANS_BOARD_PEEK_MIN_BOARD_CENTER_DISTANCE,
  resolveHansBoardPeekApproachDistance,
} from './WarRoomHansBoardPeekPose.js';

describe('War Room Hans fire call contract', () => {
  it('usa el intercambio exacto y pone a Matthias primero', () => {
    expect(MATTHIAS_FIRE_CALL_LINE).toBe('HANS! El fuego, bitte.');
    expect(HANS_FIRE_REPLY_LINE).toBe('Sí, señor.');
    expect(fireCallPhase(0, false)).toBe('matthias');
    expect(fireCallPhase(MATTHIAS_FIRE_CALL_MS - 1, true)).toBe('matthias');
    expect(fireCallPhase(MATTHIAS_FIRE_CALL_MS + 1, false)).toBe('await-hans');
    expect(fireCallPhase(MATTHIAS_FIRE_CALL_MS + 1, true)).toBe('hans');
  });

  it('suelta la sugerencia al terminar el fuego antes de que Hans llegue al bypass de la armadura', () => {
    const suggestion = { line: 'Yo probaría caballo de g1 a f3.' };
    const before = {
      phase: 'await-exit-peek',
      route: 'none',
      choreographyPhase: 'return-poker',
      logicalX: -2.52,
    };
    const choreComplete = {
      phase: 'await-exit-peek',
      route: 'none',
      choreographyPhase: HANS_BOARD_PEEK_CHOREOGRAPHY_PHASE,
      logicalX: -2.52,
    };
    const firstExitLeg = {
      phase: 'await-exit-peek',
      route: HANS_BOARD_PEEK_ROUTE,
      choreographyPhase: '',
      logicalX: -2.1,
    };
    const armorBypass = {
      phase: 'await-exit-peek',
      route: 'leave-bypass',
      choreographyPhase: '',
      logicalX: 1.42,
    };

    expect(HANS_BOARD_PEEK_CHOREOGRAPHY_PHASE).toBe('satisfied');
    expect(HANS_BOARD_PEEK_ROUTE).toBe('leave-side');
    expect(hansBoardPeekPointReached(before)).toBe(false);
    expect(hansBoardPeekPointReached(choreComplete)).toBe(true);
    expect(hansBoardPeekPointReached(firstExitLeg)).toBe(true);
    expect(hansBoardPeekPointReached(armorBypass)).toBe(false);
    expect(shouldStartHansBoardPeek({ ...choreComplete, suggestion })).toBe(true);
    expect(shouldStartHansBoardPeek({ ...firstExitLeg, suggestion: null })).toBe(false);
    expect(hansBoardPeekHoldsMovement('await-exit-peek')).toBe(false);
    expect(hansBoardPeekHoldsMovement('peek')).toBe(true);
    expect(hansBoardPeekHoldsMovement('gap-after-peek')).toBe(true);
    expect(hansBoardPeekHoldsMovement('matthias-working')).toBe(true);
    expect(hansBoardPeekHoldsMovement('gap-after-matthias')).toBe(true);
    expect(hansBoardPeekHoldsMovement('hans-working-reply')).toBe(true);
    expect(hansBoardPeekHoldsMovement('grumble')).toBe(false);
  });

  it('limita el pasito de Hans para que nunca invada el tablero durante el cotilleo', () => {
    expect(HANS_BOARD_PEEK_MAX_APPROACH_DISTANCE).toBe(0.22);
    expect(HANS_BOARD_PEEK_MIN_BOARD_CENTER_DISTANCE).toBe(4.85);
    expect(resolveHansBoardPeekApproachDistance({ x: 5.7, z: 0 })).toBeCloseTo(0.22, 6);
    expect(resolveHansBoardPeekApproachDistance({ x: 4.95, z: 0 })).toBeCloseTo(0.1, 6);
    expect(resolveHansBoardPeekApproachDistance({ x: 4.7, z: 0 })).toBe(0);
    expect(resolveHansBoardPeekApproachDistance({ x: 'nope', z: 0 })).toBe(0);
  });

  it('deja exactamente tres segundos entre intervenciones del cotilleo', () => {
    expect(HANS_BOARD_DIALOGUE_GAP_MS).toBe(3000);
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

  it('mantiene los bocadillos de Hans por encima de su cabeza y el Sí, señor más centrado', () => {
    const generic = projectHansFireReplyAnchor({ ndcX: 0.82, ndcY: 0.1 });
    const initial = projectHansInitialReplyAnchor({ ndcX: 0.82, ndcY: 0.1 });
    const coarse = projectHansFireReplyAnchor({ ndcX: 0.82, ndcY: 0.1, coarsePointer: true });
    expect(generic.tailPercent).toBe(82);
    expect(initial.tailPercent).toBe(62);
    expect(Math.abs(initial.bubbleShiftPercent)).toBeLessThan(Math.abs(generic.bubbleShiftPercent));
    expect(generic.top).toBeLessThan(32);
    expect(initial.top).toBeLessThan(33);
    expect(coarse.top).toBeLessThan(generic.top);
    expect(projectHansInitialReplyAnchor({ ndcX: 'wat', ndcY: 0 })).toBeNull();
  });

  it('reserva altura para que los bocadillos de Hans no desaparezcan por arriba', () => {
    const genericNearTop = projectHansFireReplyAnchor({ ndcX: 0.6, ndcY: 0.75 });
    const initialNearTop = projectHansInitialReplyAnchor({ ndcX: 0.6, ndcY: 0.75 });
    const coarseNearTop = projectHansFireReplyAnchor({ ndcX: 0.6, ndcY: 0.75, coarsePointer: true });
    const coarseInitialNearTop = projectHansInitialReplyAnchor({ ndcX: 0.6, ndcY: 0.75, coarsePointer: true });

    expect(genericNearTop.top).toBe(18);
    expect(initialNearTop.top).toBe(16);
    expect(coarseNearTop.top).toBe(22);
    expect(coarseInitialNearTop.top).toBe(20);
  });
});