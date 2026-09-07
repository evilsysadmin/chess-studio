import { describe, expect, it } from 'vitest';
import {
  fireCallPhase,
  HANS_FIRE_REPLY_LINE,
  MATTHIAS_FIRE_CALL_LINE,
  MATTHIAS_FIRE_CALL_MS,
  MATTHIAS_FIRE_EPILOGUE_LINE,
  projectHansFireReplyAnchor,
  resolveHansFireOpeningLatch,
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

  it('ancla la respuesta de Hans a su posición proyectada y sesga la cola al entrar por un lateral', () => {
    const right = projectHansFireReplyAnchor({ ndcX: 0.82, ndcY: 0.1 });
    const left = projectHansFireReplyAnchor({ ndcX: -0.82, ndcY: 0.1 });
    const center = projectHansFireReplyAnchor({ ndcX: 0, ndcY: 0.1 });

    expect(right.left).toBeGreaterThan(80);
    expect(right.tailPercent).toBe(82);
    expect(left.left).toBeLessThan(20);
    expect(left.tailPercent).toBe(18);
    expect(center.tailPercent).toBe(50);
    expect(projectHansFireReplyAnchor({ ndcX: 'wat', ndcY: 0 })).toBeNull();
  });
});
