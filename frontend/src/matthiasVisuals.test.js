import { describe, expect, it } from 'vitest';
import {
  MATTHIAS_BASE_AVATAR,
  matthiasAmbientVisuals,
  matthiasMoodAvatar,
  matthiasTimeVisual,
} from './matthiasVisuals.js';

describe('Matthias visual identity', () => {
  it('mantiene cara de pocos amigos en todos los estados no-enfadado', () => {
    expect(matthiasMoodAvatar('observant')).toBe(MATTHIAS_BASE_AVATAR);
    expect(matthiasMoodAvatar('satisfied')).toBe(MATTHIAS_BASE_AVATAR);
    expect(matthiasMoodAvatar('pleased')).toBe(MATTHIAS_BASE_AVATAR);
    expect(matthiasMoodAvatar('skeptical')).toBe(MATTHIAS_BASE_AVATAR);
    expect(matthiasMoodAvatar('impressed')).toBe(MATTHIAS_BASE_AVATAR);
    expect(matthiasMoodAvatar('annoyed')).not.toBe(MATTHIAS_BASE_AVATAR);
  });

  it('usa las escenas de café completas en mañana y turno nocturno', () => {
    expect(matthiasTimeVisual(6).key).toBe('morning-coffee');
    expect(matthiasTimeVisual(21).key).toBe('night-coffee');
    expect(matthiasTimeVisual(6).avatar).not.toBe(MATTHIAS_BASE_AVATAR);
    expect(matthiasTimeVisual(21).avatar).not.toBe(MATTHIAS_BASE_AVATAR);
  });

  it('resuelve un avatar visible para todas las horas, incluida la escena de las 15', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      expect(matthiasTimeVisual(hour).avatar, `hour ${hour}`).toBeTruthy();
    }
    expect(matthiasTimeVisual(15).key).toBe('chess-inception');
    expect(matthiasTimeVisual(15).avatar).not.toBe(MATTHIAS_BASE_AVATAR);
  });

  it('bloquea Sobando durante toda la madrugada y no activa el carrusel sonámbulo', () => {
    for (let hour = 0; hour < 6; hour += 1) {
      const scenes = matthiasAmbientVisuals(hour);
      expect(scenes, `hour ${hour}`).toHaveLength(1);
      expect(scenes[0].key, `hour ${hour}`).toBe('time-late-sleep');
      expect(scenes[0].label, `hour ${hour}`).toBe('Sobando');
    }

    const reveille = matthiasAmbientVisuals(6);
    expect(reveille.length).toBeGreaterThan(1);
    expect(reveille[0].key).toBe('time-morning-coffee');
  });
});
