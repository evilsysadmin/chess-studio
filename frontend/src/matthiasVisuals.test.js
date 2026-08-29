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
    expect(matthiasTimeVisual(8).key).toBe('morning-coffee');
    expect(matthiasTimeVisual(22).key).toBe('night-coffee');
    expect(matthiasTimeVisual(8).avatar).not.toBe(MATTHIAS_BASE_AVATAR);
    expect(matthiasTimeVisual(22).avatar).not.toBe(MATTHIAS_BASE_AVATAR);
  });
});
