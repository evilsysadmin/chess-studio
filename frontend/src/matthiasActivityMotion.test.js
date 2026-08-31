import { describe, expect, it } from 'vitest';
import { matthiasAmbientVisuals, matthiasTimeVisual } from './matthiasVisuals.js';
import { matthiasGestureName, matthiasGestureParts } from './components/MatthiasLayeredArt.jsx';

const HOURS = [
  [0, 'Lectura de medianoche', 'read-book'],
  [1, 'Sobando', 'doze'],
  [2, 'Sobando', 'doze'],
  [3, 'Sobando', 'doze'],
  [4, 'Sobando', 'doze'],
  [5, 'Sobando', 'doze'],
  [6, 'Primer café', 'sip'],
  [7, 'Desayuno y prensa', 'sip'],
  [8, 'Estudio matinal', 'read-book'],
  [9, 'Ajedrez dentro del ajedrez', 'board-move'],
  [10, 'Revisión de expedientes', 'read-dossier'],
  [11, 'Chess Weekly', 'read-book'],
  [12, 'Comida táctica', 'bite'],
  [13, 'Sobremesa administrativa', 'read-dossier'],
  [14, 'Manual de campaña', 'read-book'],
  [15, 'Partida privada', 'board-move'],
  [16, 'En plena operación', 'write-notes'],
  [17, 'Auditoría táctica', 'audit-dossier'],
  [18, 'Lectura de tarde', 'read-book'],
  [19, 'Cervezota reglamentaria', 'sip-night'],
  [20, 'Cena de campaña', 'bite'],
  [21, 'Turno nocturno', 'sip-night'],
  [22, 'Partida nocturna', 'board-move'],
  [23, 'Último estudio', 'read-book'],
];

describe('Matthias · contrato completo de actividad', () => {
  it.each(HOURS)('%02i:00 · %s usa %s', (hour, expectedLabel, expectedGesture) => {
    const visual = matthiasTimeVisual(hour);
    expect(visual.label).toBe(expectedLabel);
    expect(matthiasGestureName({ scene: visual.key, activity: visual.label })).toBe(expectedGesture);
    expect(matthiasGestureParts({ scene: visual.key, activity: visual.label }).length).toBeGreaterThan(0);
  });

  it('v2 mantiene la lectura de libro contenida y hace participar la cabeza en trabajo táctico y partidas', () => {
    for (const [hour, , gesture] of HOURS) {
      const visual = matthiasTimeVisual(hour);
      const parts = matthiasGestureParts({ scene: visual.key, activity: visual.label });
      if (gesture === 'read-book') {
        expect(parts).not.toContain('head');
      } else if (['read-dossier', 'audit-dossier', 'write-notes', 'board-move'].includes(gesture)) {
        expect(parts).toContain('head');
      }
    }
  });

  it('cada escena ambiental también tiene un gesto explícito y articulable', () => {
    const visuals = matthiasAmbientVisuals(12);
    expect(visuals.length).toBeGreaterThan(0);
    for (const visual of visuals) {
      const gesture = matthiasGestureName({ scene: visual.key, activity: visual.label });
      expect(gesture).toBeTruthy();
      expect(matthiasGestureParts({ scene: visual.key, activity: visual.label }).length).toBeGreaterThan(0);
    }
  });
});
