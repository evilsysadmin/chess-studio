import { describe, expect, it } from 'vitest';
import { MATTHIAS_BASE_AVATAR, matthiasMoodAvatar, matthiasTimeVisual } from './matthiasVisuals.js';

describe('Matthias visual identity', () => {
  it('mantiene cara de pocos amigos incluso satisfecho o contento', () => {
    expect(matthiasMoodAvatar('satisfied')).toBe(MATTHIAS_BASE_AVATAR);
    expect(matthiasMoodAvatar('pleased')).toBe(MATTHIAS_BASE_AVATAR);
    expect(matthiasMoodAvatar('annoyed')).not.toBe(MATTHIAS_BASE_AVATAR);
    expect(matthiasMoodAvatar('impressed')).not.toBe(MATTHIAS_BASE_AVATAR);
  });

  it('usa las escenas de café completas en mañana y turno nocturno', () => {
    expect(matthiasTimeVisual(6).key).toBe('morning-coffee');
    expect(matthiasTimeVisual(21).key).toBe('night-coffee');
    expect(matthiasTimeVisual(6).avatar).not.toBe(MATTHIAS_BASE_AVATAR);
    expect(matthiasTimeVisual(21).avatar).not.toBe(MATTHIAS_BASE_AVATAR);
  });
});
