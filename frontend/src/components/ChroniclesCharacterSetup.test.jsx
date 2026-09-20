import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createCanonicalChroniclesCharacterBuild } from '../chronicles/chroniclesCharacterBuilds.js';
import { CHRONICLES_PARTY } from '../chroniclesOfMatthias.js';
import ChroniclesCharacterSetup from './ChroniclesCharacterSetup.jsx';

describe('ChroniclesCharacterSetup', () => {
  it('keeps the canonical party as a one-click path', () => {
    const onConfirm = vi.fn();
    render(
      <ChroniclesCharacterSetup
        currentBuild={createCanonicalChroniclesCharacterBuild(CHRONICLES_PARTY)}
        onConfirm={onConfirm}
        onExit={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Entrar con grupo canónico' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].mode).toBe('canonical');
  });

  it('creates a custom PJ with bounded attributes and a mechanical starting skill', () => {
    const onConfirm = vi.fn();
    render(
      <ChroniclesCharacterSetup
        currentBuild={createCanonicalChroniclesCharacterBuild(CHRONICLES_PARTY)}
        onConfirm={onConfirm}
        onExit={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Crear PJs' }));
    const name = screen.getByLabelText('Nombre de matthias');
    fireEvent.change(name, { target: { value: 'Greta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Subir Potencia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Subir Potencia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Punta afilada' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar compañía' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const build = onConfirm.mock.calls[0][0];
    expect(build.mode).toBe('custom');
    expect(build.characters[0]).toEqual(expect.objectContaining({
      name: 'Greta',
      startingSkillId: 'matthias-keen-point',
    }));
    expect(build.characters[0].attributes.power).toBe(2);
  });
});
