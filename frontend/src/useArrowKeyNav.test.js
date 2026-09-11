import { describe, expect, it } from 'vitest';
import { shouldIgnoreArrowNavigation } from './useArrowKeyNav.js';

describe('arrow-key navigation editable targets', () => {
  it('cede las flechas a campos de formulario', () => {
    expect(shouldIgnoreArrowNavigation({ tagName: 'INPUT', isContentEditable: false })).toBe(true);
    expect(shouldIgnoreArrowNavigation({ tagName: 'TEXTAREA', isContentEditable: false })).toBe(true);
    expect(shouldIgnoreArrowNavigation({ tagName: 'SELECT', isContentEditable: false })).toBe(true);
  });

  it('cede las flechas a editores contenteditable y navega en controles normales', () => {
    expect(shouldIgnoreArrowNavigation({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(shouldIgnoreArrowNavigation({ tagName: 'BUTTON', isContentEditable: false })).toBe(false);
    expect(shouldIgnoreArrowNavigation(null)).toBe(false);
  });
});
