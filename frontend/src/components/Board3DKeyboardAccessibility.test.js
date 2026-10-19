import { describe, expect, it, vi } from 'vitest';
import { board3DKeyboardFocusAnnouncement, handleBoard3DKeyboardEvent } from './Board3DKeyboardAccessibility.js';

describe('War Room · exploración accesible del tablero 3D', () => {
  const pieces = [
    { square: 'e1', type: 'k', color: 'w' },
    { square: 'e2', type: 'p', color: 'w' },
    { square: 'd7', type: 'p', color: 'b' },
  ];

  it('identifica la casilla enfocada y su pieza sin inventar jugadas', () => {
    expect(board3DKeyboardFocusAnnouncement({ focusedSquare: 'e1', pieces })).toBe('Casilla e1: rey blanco.');
    expect(board3DKeyboardFocusAnnouncement({ focusedSquare: 'd7', pieces })).toBe('Casilla d7: peón negro.');
    expect(board3DKeyboardFocusAnnouncement({ focusedSquare: 'c4', pieces })).toBe('Casilla c4: vacía.');
    expect(board3DKeyboardFocusAnnouncement({ focusedSquare: null, pieces })).toBe('');
  });

  it('distingue selección de destinos legales que proporciona el estado común', () => {
    const selection = { pieces, selectedSquare: 'e2', legalTargets: [{ to: 'e3' }, { to: 'e4' }] };
    expect(board3DKeyboardFocusAnnouncement({ ...selection, focusedSquare: 'e2' }))
      .toBe('Casilla e2: peón blanco. Seleccionada.');
    expect(board3DKeyboardFocusAnnouncement({ ...selection, focusedSquare: 'e4' }))
      .toBe('Casilla e4: vacía. Destino legal.');
    expect(board3DKeyboardFocusAnnouncement({ ...selection, focusedSquare: 'c4' }))
      .toBe('Casilla c4: vacía.');
    expect(board3DKeyboardFocusAnnouncement({ ...selection, focusedSquare: 'e4', selectedSquare: null }))
      .toBe('Casilla e4: vacía.');
  });

  it('Escape cancela solo una selección real, sin mover ni bloquear Escape global', () => {
    const onSquareClick = vi.fn();
    const setFocusedSquare = vi.fn();
    const event = () => ({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() });
    const options = { focusedSquare: 'e4', selectedSquare: 'e2', orientation: 'white', onSquareClick, setFocusedSquare };
    const cancel = event();
    handleBoard3DKeyboardEvent(cancel, options);
    expect(onSquareClick).toHaveBeenCalledOnce();
    expect(onSquareClick).toHaveBeenCalledWith('e2');
    expect(cancel.preventDefault).toHaveBeenCalledOnce();
    expect(cancel.stopPropagation).toHaveBeenCalledOnce();
    expect(setFocusedSquare).not.toHaveBeenCalled();

    const nothingToCancel = event();
    handleBoard3DKeyboardEvent(nothingToCancel, { ...options, selectedSquare: null });
    expect(nothingToCancel.preventDefault).not.toHaveBeenCalled();
    expect(nothingToCancel.stopPropagation).not.toHaveBeenCalled();
    expect(onSquareClick).toHaveBeenCalledOnce();
  });

  it('conserva flechas y orientación negra sin modificar la legalidad', () => {
    const event = (key) => ({ key, preventDefault: vi.fn() });
    const onSquareClick = vi.fn();
    const setFocusedSquare = vi.fn();
    const options = { focusedSquare: 'e2', orientation: 'white', onSquareClick, setFocusedSquare };
    const right = event('ArrowRight');
    handleBoard3DKeyboardEvent(right, options);
    expect(setFocusedSquare).toHaveBeenCalledWith('f2');
    expect(right.preventDefault).toHaveBeenCalledOnce();
    handleBoard3DKeyboardEvent(event('ArrowRight'), { ...options, orientation: 'black' });
    expect(setFocusedSquare).toHaveBeenLastCalledWith('d2');
    for (const key of ['Enter', ' ']) {
      const action = event(key);
      handleBoard3DKeyboardEvent(action, options);
      expect(action.preventDefault).toHaveBeenCalledOnce();
    }
    expect(onSquareClick).toHaveBeenCalledTimes(2);
    expect(onSquareClick).toHaveBeenNthCalledWith(1, 'e2');
    const unrelated = event('Tab');
    handleBoard3DKeyboardEvent(unrelated, options);
    expect(unrelated.preventDefault).not.toHaveBeenCalled();
  });
});
