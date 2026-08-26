import { describe, expect, it, vi } from 'vitest';
import { createBackNavigationStack } from './backNavigationStack.js';

describe('pila global de volver/cerrar', () => {
  it('un Escape sólo llega al modal superior, nunca también a la pantalla padre', () => {
    const stack = createBackNavigationStack();
    const parent = vi.fn();
    const modal = vi.fn();
    stack.push({ id: 'screen', callbackRef: { current: parent } });
    stack.push({ id: 'modal', callbackRef: { current: modal } });

    expect(stack.dispatch({ type: 'keydown', key: 'Escape', stopPropagation: vi.fn() })).toBe(true);
    expect(modal).toHaveBeenCalledTimes(1);
    expect(parent).not.toHaveBeenCalled();

    stack.remove('modal');
    stack.dispatch({ type: 'keydown', key: 'Escape', stopPropagation: vi.fn() });
    expect(parent).toHaveBeenCalledTimes(1);
  });

  it('ignora teclas distintas de Escape y clic derecho dentro de campos editables', () => {
    const stack = createBackNavigationStack();
    const close = vi.fn();
    stack.push({ id: 'screen', callbackRef: { current: close } });

    expect(stack.dispatch({ type: 'keydown', key: 'Enter' })).toBe(false);
    expect(stack.dispatch({ type: 'contextmenu' }, { editableTarget: true })).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });

  it('clic derecho fuera de inputs consume el menú nativo y ejecuta un único back', () => {
    const stack = createBackNavigationStack();
    const close = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    stack.push({ id: 'screen', callbackRef: { current: close } });

    expect(stack.dispatch({ type: 'contextmenu', preventDefault, stopPropagation })).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('retirar un handler inexistente no desordena la pila', () => {
    const stack = createBackNavigationStack();
    const first = { id: 'first', callbackRef: { current: vi.fn() } };
    const second = { id: 'second', callbackRef: { current: vi.fn() } };
    stack.push(first);
    stack.push(second);
    expect(stack.remove('fantasma')).toBe(2);
    expect(stack.current()).toBe(second);
  });
});
