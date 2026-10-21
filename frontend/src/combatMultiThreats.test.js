import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { annotateCombatCandidates, isLegalCombatCpuSuggestion, selectCombatAwareRemoteSuggestion } from './combatControllerSupport.js';
import { rankCombatCandidates } from './combatExpectedUtility.js';

// La dama negra puede capturar al veterano b7, pero en el tablero resultante
// DOS piezas blancas distintas pueden recapturarla. El motor profundo decide
// los centipeones; Combat sólo añade el valor real de XP entre casi-empates.
describe('Combat Chess · amenazas simultáneas verificadas', () => {
  const fen = 'q5k1/1P6/2B5/8/8/8/1R6/7K b - - 0 1';
  const registry = {
    a8: { id: 'b-q-a8', type: 'q', color: 'b', square: 'a8' },
    g8: { id: 'b-k-g8', type: 'k', color: 'b', square: 'g8' },
    b7: { id: 'w-p-b7', type: 'p', color: 'w', square: 'b7', identityId: 'veteran-b7', strengthPoints: 30 },
    c6: { id: 'w-b-c6', type: 'b', color: 'w', square: 'c6' },
    b2: { id: 'w-r-b2', type: 'r', color: 'w', square: 'b2' },
    h1: { id: 'w-k-h1', type: 'k', color: 'w', square: 'h1' },
  };
  const remote = {
    from: 'a8', to: 'a7',
    candidates: [
      { from: 'a8', to: 'a7', moveKey: 'a8a7', isLegal: true, chessScoreCp: 20 },
      { from: 'a8', to: 'b7', moveKey: 'a8b7', isLegal: true, chessScoreCp: -700 },
    ],
  };

  it('el propio FEN acredita las dos recapturas legales, no un aviso ficticio', () => {
    const board = new Chess(fen);
    expect(isLegalCombatCpuSuggestion(fen, { from: 'a8', to: 'a7' })).toBe(true);
    expect(isLegalCombatCpuSuggestion(fen, { from: 'a8', to: 'b7' })).toBe(true);
    board.move({ from: 'a8', to: 'b7' });
    const recaptures = board.moves({ verbose: true })
      .filter(({ to, captured }) => to === 'b7' && captured === 'q');
    expect(recaptures.map(({ from }) => from).sort()).toEqual(['b2', 'c6']);
  });

  it('ni mucha XP comprada permite ignorar una gran pérdida de dama reconocida por el motor', () => {
    const measured = annotateCombatCandidates(fen, registry, remote);
    expect(measured.candidates[1]).toMatchObject({
      combatReady: true, enemyValue: 1, enemyPersistentValue: 30,
    });
    expect(selectCombatAwareRemoteSuggestion(measured)).toMatchObject({ from: 'a8', to: 'a7' });
    expect(rankCombatCandidates(measured.candidates).map(({ moveKey }) => moveKey))
      .toEqual(['a8a7']);
    expect(registry.b7.strengthPoints).toBe(30);
  });

  it('sin puntuación verificable no se degrada el motor a un supuesto cero', () => {
    const corrupt = {
      ...remote,
      candidates: [
        { ...remote.candidates[0], chessScoreCp: null },
        remote.candidates[1],
      ],
    };
    const measured = annotateCombatCandidates(fen, registry, corrupt);
    expect(selectCombatAwareRemoteSuggestion(measured)).toBe(corrupt);
  });

  it('no transforma un registro de veterano desfasado en botín medido', () => {
    const inconsistent = { ...registry, b7: { ...registry.b7, square: 'b6' } };
    const measured = annotateCombatCandidates(fen, inconsistent, remote);
    expect(measured.candidates[1].combatReady).not.toBe(true);
    expect(selectCombatAwareRemoteSuggestion(measured)).toMatchObject({ from: 'a8', to: 'a7' });
  });
});
