import { describe, expect, it } from 'vitest';
import { chroniclesBookOneEpilogue } from './chroniclesOfMatthiasEpilogue.js';
import { createChroniclesState } from './chroniclesOfMatthias.js';

function escapedState(overrides = {}) {
  return {
    ...createChroniclesState(),
    phase: 'escaped',
    blackGateKey: true,
    enemyHp: 0,
    jailerHp: 0,
    scavengerHp: 0,
    ...overrides,
  };
}

describe('Chronicles of Matthias Book I epilogue', () => {
  it('reports a clean extraction without inventing losses or optional relics', () => {
    const epilogue = chroniclesBookOneEpilogue(escapedState());

    expect(epilogue.title).toBe('La compañía completa');
    expect(epilogue.survivors.map((member) => member.name)).toEqual(['Matthias', 'Hildegard', 'Aziz', 'Faust']);
    expect(epilogue.fallen).toEqual([]);
    expect(epilogue.hasLantern).toBe(false);
    expect(epilogue.hasKey).toBe(true);
    expect(epilogue.fallenLine).toMatch(/Nadie queda atrás/i);
    expect(epilogue.lanternLine).toMatch(/permanece/i);
    expect(epilogue.verdict).toMatch(/Cuatro entramos\. Cuatro salimos/i);
  });

  it('names real casualties and the spectral lantern only when they exist in state', () => {
    const base = escapedState({ spectralLantern: true });
    const party = base.party.map((member) => member.id === 'rook' ? { ...member, hp: 0 } : member);
    const epilogue = chroniclesBookOneEpilogue({ ...base, party });

    expect(epilogue.title).toBe('Una silla queda vacía');
    expect(epilogue.fallen.map((member) => member.name)).toEqual(['Hildegard']);
    expect(epilogue.survivors.map((member) => member.name)).not.toContain('Hildegard');
    expect(epilogue.hasLantern).toBe(true);
    expect(epilogue.lanternLine).toMatch(/Farol Espectral sale/i);
    expect(epilogue.fallenLine).toMatch(/Hildegard/i);
    expect(epilogue.verdict).toMatch(/Hildegard no cruza/i);
  });

  it('changes the closing line for a heavily damaged expedition without fabricating scoring', () => {
    const base = escapedState();
    const party = base.party.map((member) => ['rook', 'bishop'].includes(member.id) ? { ...member, hp: 0 } : member);
    const epilogue = chroniclesBookOneEpilogue({ ...base, party });

    expect(epilogue.title).toBe('La cripta cobra su peaje');
    expect(epilogue.survivors).toHaveLength(2);
    expect(epilogue.fallen.map((member) => member.name)).toEqual(['Hildegard', 'Aziz']);
    expect(epilogue.verdict).toMatch(/^2 salimos de pie/i);
    expect(epilogue).not.toHaveProperty('score');
    expect(epilogue).not.toHaveProperty('rating');
    expect(epilogue).not.toHaveProperty('xp');
  });
});
