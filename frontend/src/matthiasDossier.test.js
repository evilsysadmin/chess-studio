import { describe, expect, it } from 'vitest';
import { buildMatthiasDeskArtifacts, buildMatthiasDossierEntries, formatMatthiasDossierDate } from './matthiasDossier.js';

describe('Matthias dossier presentation', () => {
  it('muestra sólo objetos respaldados por memoria real y limita el despacho', () => {
    const artifacts = buildMatthiasDeskArtifacts({
      activeChallenge: { label: 'Tres partidas sin horquillas' },
      hallOfFame: [{ fingerprint: 'f1', label: 'Primera victoria contra Matthias' }],
      hallOfShame: [{ fingerprint: 's1', label: 'Dama entregada a un peón' }],
      respect: { tier: 'formidable', label: 'Rival respetado' },
    });
    expect(artifacts).toHaveLength(3);
    expect(artifacts.map((item) => item.id)).toEqual(['challenge', 'fame', 'shame']);
    expect(artifacts.map((item) => item.label)).toEqual(['Orden', 'Medalla', 'Expediente']);
    expect(artifacts[1].title).toMatch(/Primera victoria/);
  });

  it('mantiene etiquetas compactas para que el escritorio no se trunque en móvil', () => {
    const formidable = buildMatthiasDeskArtifacts({ respect: { tier: 'formidable', label: 'Rival respetado' } });
    const veteran = buildMatthiasDeskArtifacts({ relationship: { tier: 'veteran', games_seen: 42 } });
    expect(formidable[0]).toMatchObject({ label: 'Rival', title: 'Rival respetado' });
    expect(veteran[0]).toMatchObject({ label: 'Veterano', title: '42 partidas observadas' });
    expect([...formidable, ...veteran].every((item) => item.label.length <= 10)).toBe(true);
  });

  it('no inventa decoración para un expediente vacío', () => {
    expect(buildMatthiasDeskArtifacts({ relationship: { tier: 'newcomer' } })).toEqual([]);
  });

  it('ordena el expediente reciente de nuevo a antiguo conservando fecha y polaridad', () => {
    const rows = buildMatthiasDossierEntries({ recentMilestones: [
      { fingerprint: 'old', polarity: 'shame', label: 'Viejo agravio', at: '2026-08-01T10:00:00Z' },
      { fingerprint: 'new', polarity: 'fame', label: 'Mérito nuevo', at: '2026-08-28T10:00:00Z' },
    ] });
    expect(rows.map((row) => row.id)).toEqual(['new', 'old']);
    expect(rows[0]).toMatchObject({ polarity: 'fame', label: 'Mérito nuevo' });
    expect(formatMatthiasDossierDate(rows[0].at)).toBeTruthy();
  });
});
