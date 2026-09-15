import { describe, expect, it } from 'vitest';

import { shouldShowChroniclesNarration } from './ChroniclesNarratorOverlay.jsx';

describe('ChroniclesNarratorOverlay', () => {
  it('suppresses obvious navigation and low-signal feedback', () => {
    expect(shouldShowChroniclesNarration('Giras a la izquierda.')).toBe(false);
    expect(shouldShowChroniclesNarration('Giras a la derecha.')).toBe(false);
    expect(shouldShowChroniclesNarration('Piedra, polvo y la sospecha de que algo respira detrás del muro.')).toBe(false);
    expect(shouldShowChroniclesNarration('Hay una pared. Incluso Matthias concede que atravesarla sería excesivo.')).toBe(false);
    expect(shouldShowChroniclesNarration('Matthias ejecuta estocada contra absolutamente nada. La nada resiste.')).toBe(false);
  });

  it('keeps milestones, actionable advice and threats', () => {
    expect(shouldShowChroniclesNarration('El sello despierta. Arriba, metal contra piedra.')).toBe(true);
    expect(shouldShowChroniclesNarration('La puerta negra no cede. El sello de la cripta sigue dormido.')).toBe(true);
    expect(shouldShowChroniclesNarration('El peón corrompido bloquea el corredor. Convéncelo con violencia reglamentaria.')).toBe(true);
    expect(shouldShowChroniclesNarration('Salida encontrada. Matthias anota que sobrevivir cuenta como excelencia operativa.')).toBe(true);
  });
});
