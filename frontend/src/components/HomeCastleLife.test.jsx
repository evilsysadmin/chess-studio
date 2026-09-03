import { describe, expect, it } from 'vitest';
import { buildHomeCastleLifeModel } from './HomeCastleLife.jsx';

describe('HomeCastleLife', () => {
  it('no inventa logros cuando no existe evidencia', () => {
    const model = buildHomeCastleLifeModel({ rareRoll: 1 });
    expect(model.objects).toEqual([expect.objectContaining({ id: 'quiet-desk' })]);
    expect(model.rareSighting).toBeNull();
  });

  it('prioriza como máximo tres objetos derivados de estado real', () => {
    const model = buildHomeCastleLifeModel({
      hasSavedGame: true,
      combatProgress: { credits: 19, nextProgress: .4, rank: { label: 'Sargento' } },
      today: { streak: 4, dailySolvedCount: 2 },
      tournamentLevel: 3,
      tournamentProgress: 11,
      rivalry: { record: { wins: 7 } },
      rareRoll: 1,
    });
    expect(model.objects.map((entry) => entry.id)).toEqual(['saved-game', 'combat-map', 'daily-seal']);
    expect(model.objects[1].detail).toContain('19 créditos');
    expect(model.objects[2].detail).toContain('2/3');
  });

  it('los méritos de juego fuerte desplazan señales mundanas y colapsan ascensos de la misma familia', () => {
    const model = buildHomeCastleLifeModel({
      combatProgress: { credits: 36, nextProgress: .2, rank: { label: 'Recluta' } },
      tournamentLevel: 3,
      tournamentProgress: 9,
      rivalry: { record: { wins: 4 } },
      achievementIds: [
        'rating_intermediate',
        'rating_advanced',
        'rating_master',
        'tournament_level_5',
        'tournament_level_10',
        'rivalry_streak_3',
        'rivalry_hard_75',
        'feat_mate',
        'crime_queen_to_pawn',
      ],
      achievementLedger: {
        records: {
          rating_master: { legacy: false },
          tournament_level_10: { legacy: false },
          rivalry_hard_75: { legacy: false },
          feat_mate: { legacy: true },
          crime_queen_to_pawn: { legacy: false },
        },
      },
      rareRoll: 1,
    });

    expect(model.objects.map((entry) => entry.id)).toEqual(['master-crown', 'giantslayer-helm', 'imperial-cup']);
    expect(model.objects.every((entry) => entry.kind === 'honour')).toBe(true);
    expect(model.objects[0]).toEqual(expect.objectContaining({ prestige: 100, evidence: 'recorded' }));
    expect(model.objects.filter((entry) => entry.family === 'rating')).toHaveLength(1);
    expect(model.objects.filter((entry) => entry.family === 'tournament')).toHaveLength(1);
    expect(model.objects.filter((entry) => entry.family === 'rivalry')).toHaveLength(1);
    expect(model.objects.some((entry) => entry.id.includes('queen'))).toBe(false);
  });

  it('la rare sighting es ambiental y no se mezcla con los objetos de progreso', () => {
    const model = buildHomeCastleLifeModel({ rivalry: { record: { wins: 2 } }, rareRoll: .01 });
    expect(model.objects).toEqual([expect.objectContaining({ id: 'rivalry-plaque' })]);
    expect(model.rareSighting).toEqual(expect.objectContaining({ id: 'armour-glance' }));
  });
});
