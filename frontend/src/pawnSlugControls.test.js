import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_CONTROL_ACTIONS,
  PAWN_SLUG_DEFAULT_KEYMAP,
  normalizePawnSlugKeymap,
  normalizePawnSlugSettings,
  pawnSlugControlActionForCode,
  pawnSlugEngineAction,
  pawnSlugKeyLabel,
  remapPawnSlugKey,
} from './pawnSlugControls.js';

describe('Pawn Slug control settings', () => {
  it('ships the requested keyboard defaults without legacy jump/fire aliases', () => {
    expect(PAWN_SLUG_DEFAULT_KEYMAP).toEqual({
      moveLeft: 'ArrowLeft',
      moveRight: 'ArrowRight',
      crouch: 'ArrowDown',
      fire: 'Space',
      jump: 'ShiftLeft',
      usePowerup: 'ControlLeft',
      pause: 'Escape',
    });
    expect(new Set(Object.values(PAWN_SLUG_DEFAULT_KEYMAP)).size)
      .toBe(PAWN_SLUG_CONTROL_ACTIONS.length);
  });

  it('maps UI controls to the engine vocabulary while keeping pause outside gameplay input', () => {
    expect(pawnSlugEngineAction('moveLeft')).toBe('left');
    expect(pawnSlugEngineAction('moveRight')).toBe('right');
    expect(pawnSlugEngineAction('crouch')).toBe('crouch');
    expect(pawnSlugEngineAction('fire')).toBe('fire');
    expect(pawnSlugEngineAction('jump')).toBe('jump');
    expect(pawnSlugEngineAction('usePowerup')).toBe('grenade');
    expect(pawnSlugEngineAction('pause')).toBe('pause');
  });

  it('clamps audio settings and repairs malformed keymaps', () => {
    const settings = normalizePawnSlugSettings({
      masterVolume: 4,
      musicVolume: -1,
      sfxVolume: '0.35',
      keymap: { fire: '', jump: 'KeyV' },
    });
    expect(settings.masterVolume).toBe(1);
    expect(settings.musicVolume).toBe(0);
    expect(settings.sfxVolume).toBe(0.35);
    expect(settings.keymap.fire).toBe('Space');
    expect(settings.keymap.jump).toBe('KeyV');
  });

  it('does not accept duplicate configured keys', () => {
    const normalized = normalizePawnSlugKeymap({
      ...PAWN_SLUG_DEFAULT_KEYMAP,
      fire: 'KeyF',
      jump: 'KeyF',
    });
    expect(normalized.fire).toBe('Space');
    expect(normalized.jump).toBe('ShiftLeft');

    const conflict = remapPawnSlugKey(PAWN_SLUG_DEFAULT_KEYMAP, 'fire', 'ShiftLeft');
    expect(conflict.ok).toBe(false);
    expect(conflict.conflictAction).toBe('jump');
    expect(conflict.keymap).toEqual(PAWN_SLUG_DEFAULT_KEYMAP);
  });

  it('repairs collisions introduced by falling back to default keys', () => {
    const normalized = normalizePawnSlugKeymap({
      ...PAWN_SLUG_DEFAULT_KEYMAP,
      moveLeft: 'KeyA',
      moveRight: 'ArrowLeft',
      fire: 'KeyA',
    });

    expect(normalized.moveLeft).toBe('ArrowLeft');
    expect(normalized.moveRight).toBe('ArrowRight');
    expect(normalized.fire).toBe('Space');
    expect(new Set(Object.values(normalized)).size).toBe(PAWN_SLUG_CONTROL_ACTIONS.length);
  });

  it('supports conflict-free swaps and explicit remaps', () => {
    const swapped = normalizePawnSlugKeymap({
      ...PAWN_SLUG_DEFAULT_KEYMAP,
      fire: 'ShiftLeft',
      jump: 'Space',
    });
    expect(swapped.fire).toBe('ShiftLeft');
    expect(swapped.jump).toBe('Space');

    const remapped = remapPawnSlugKey(PAWN_SLUG_DEFAULT_KEYMAP, 'fire', 'KeyF');
    expect(remapped.ok).toBe(true);
    expect(remapped.keymap.fire).toBe('KeyF');
    expect(pawnSlugControlActionForCode(remapped.keymap, 'KeyF')).toBe('fire');
  });

  it('renders compact human key labels for the settings UI', () => {
    expect(pawnSlugKeyLabel('ArrowLeft')).toBe('←');
    expect(pawnSlugKeyLabel('Space')).toBe('ESPACIO');
    expect(pawnSlugKeyLabel('ShiftLeft')).toBe('SHIFT IZQ');
    expect(pawnSlugKeyLabel('ControlLeft')).toBe('CTRL IZQ');
    expect(pawnSlugKeyLabel('KeyR')).toBe('R');
    expect(pawnSlugKeyLabel('Digit4')).toBe('4');
  });
});
