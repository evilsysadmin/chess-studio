import { describe, expect, it } from 'vitest';

import { shouldShowChroniclesNarration } from './ChroniclesNarratorOverlay.jsx';

describe('ChroniclesNarratorOverlay', () => {
  it('suppresses obvious navigation and low-signal combat feedback', () => {
    expect(shouldShowChroniclesNarration('Giras a la izquierda.')).toBe(false);
    expect(shouldShowChroniclesNarration('Giras a la derecha.')).toBe(false);
    expect(shouldShowChroniclesNarration('Piedra, polvo y la sospecha de que algo respira detrás del muro.')).toBe(false);
    expect(shouldShowChroniclesNarration('Hay una pared. Incluso Matthias concede que atravesarla sería excesivo.')).toBe(false);
    expect(shouldShowChroniclesNarration('Matthias ejecuta estocada contra absolutamente nada. La nada resiste.')).toBe(false);
    expect(shouldShowChroniclesNarration('Hildegard impacta con embestida. Peón corrompido responde y alcanza a Hildegard.')).toBe(false);
    expect(shouldShowChroniclesNarration('Aziz alcanza al alfil espectral con rayo diagonal. Esta vez la diagonal del fantasma se queda corta.')).toBe(false);
  });

  it('leaves characterful milestones to the party bark layer', () => {
    expect(shouldShowChroniclesNarration('El sello despierta. Arriba, metal contra piedra.')).toBe(false);
    expect(shouldShowChroniclesNarration('Hildegard remata al peón corrompido con embestida. Matthias aprueba.')).toBe(false);
    expect(shouldShowChroniclesNarration('Aziz deshace al alfil espectral con rayo diagonal. Aziz recupera el Farol Espectral.')).toBe(false);
    expect(shouldShowChroniclesNarration('Hildegard derriba a la torre carcelero con embestida. La puerta parece libre.')).toBe(false);
    expect(shouldShowChroniclesNarration('Morcilla derriba al caballo carroñero con salto brutal. La Llave Negra rebota por el suelo.')).toBe(false);
    expect(shouldShowChroniclesNarration('Salida encontrada. Matthias anota que sobrevivir cuenta como excelencia operativa.')).toBe(false);
  });

  it('keeps actionable advice, threats and blockers', () => {
    expect(shouldShowChroniclesNarration('La puerta negra no cede. El sello de la cripta sigue dormido.')).toBe(true);
    expect(shouldShowChroniclesNarration('El peón corrompido bloquea el corredor. Convéncelo con violencia reglamentaria.')).toBe(true);
    expect(shouldShowChroniclesNarration('La puerta está libre, sí. La Llave Negra no: el caballo carroñero se la ha llevado.')).toBe(true);
    expect(shouldShowChroniclesNarration('La Cripta de las Ocho Casillas. Huele a humedad y a una decisión cuestionable.')).toBe(true);
  });
});
