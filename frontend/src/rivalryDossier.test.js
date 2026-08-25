import { describe, expect, it } from 'vitest';
import { buildRivalryDossier } from './rivalryDossier.js';

describe('buildRivalryDossier', () => {
  it('resume marcador, racha y forma reciente sin inventar datos', () => {
    const dossier = buildRivalryDossier({ record: {
      games: 8, wins: 5, draws: 1, losses: 2, currentStreak: 2,
      bestHumanStreak: 3, bestCpuStreak: 2,
      recentGames: [{ outcome: 'win' }, { outcome: 'win' }, { outcome: 'draw' }, { outcome: 'loss' }],
    } });
    expect(dossier.leader).toMatchObject({ owner: 'human', margin: 3 });
    expect(dossier.streak.label).toContain('2 victorias');
    expect(dossier.recentForm).toBe('V · V · T · D');
  });

  it('sólo declara fortaleza/némesis de apertura con al menos 3 muestras', () => {
    const dossier = buildRivalryDossier({ record: { byOpening: {
      Siciliana: { games: 5, wins: 1, draws: 0, losses: 4 },
      Italiana: { games: 4, wins: 3, draws: 1, losses: 0 },
      Francesa: { games: 2, wins: 0, draws: 0, losses: 2 },
    } } });
    expect(dossier.strongestOpening).toMatchObject({ opening: 'Italiana', scorePct: 88 });
    expect(dossier.toughestOpening).toMatchObject({ opening: 'Siciliana', scorePct: 20 });
    expect(dossier.toughestOpening.opening).not.toBe('Francesa');
  });

  it('presenta recuerdos tácticos con etiquetas humanas, no claves internas', () => {
    const dossier = buildRivalryDossier({ record: { memories: [
      { type: 'incident', key: 'human:MISSED_MATE', count: 3, text: 'human:MISSED_MATE registrado 3 veces.' },
    ] } });
    expect(dossier.memories[0].text).toBe('Mates ignorados · 3× registrado');
  });

  it('prioriza el incidente realmente más repetido', () => {
    const dossier = buildRivalryDossier({ record: { incidents: {
      'human:MISSED_MATE': 2,
      'cpu:KNIGHT_FORK': 5,
    } } });
    expect(dossier.topIncident).toMatchObject({ count: 5, label: 'Horquillas de caballo sufridas' });
  });
});
