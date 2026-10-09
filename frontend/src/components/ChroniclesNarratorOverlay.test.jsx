import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import ChroniclesNarratorOverlay, { shouldShowChroniclesNarration } from './ChroniclesNarratorOverlay.jsx';

describe('ChroniclesNarratorOverlay', () => {
  it('starts as an accessible, compact, closed chronicle toggle instead of a permanent narration banner', () => {
    const html = renderToStaticMarkup(<ChroniclesNarratorOverlay message="Swordhaven: sol, calles empedradas y cinco puertas esperando viajeros." />);
    expect(html).toContain('<details class="chronicles-dm-overlay">');
    expect(html).toContain('<summary class="chronicles-dm-trigger" aria-label="Crónica de expedición">');
    expect(html).toContain('role="region"');
    expect(html).toContain('CRÓNICA DE EXPEDICIÓN');
    expect(html).not.toContain('CRÓNICA DE LA CRIPTA');
    expect(html).toContain('Swordhaven: sol, calles empedradas y cinco puertas esperando viajeros.');
    expect(html).toContain('aria-live="polite"');
  });

  it('keeps the chronicle trigger available even when movement is routine', () => {
    const empty = renderToStaticMarkup(<ChroniclesNarratorOverlay message="" />);
    const routine = renderToStaticMarkup(<ChroniclesNarratorOverlay message="Giras a la izquierda." />);
    expect(empty).toContain('class="chronicles-dm-trigger"');
    expect(routine).toContain('Todavía no hay anotaciones en la crónica.');
    expect(routine).not.toContain('Giras a la izquierda.');
  });

  it('deja el resumen rutinario del turno a la iniciativa y evita solapar overlays', () => {
    expect(shouldShowChroniclesNarration('Turno de las criaturas: un impacto encuentra carne, piedra o dignidad.')).toBe(false);
    expect(shouldShowChroniclesNarration('Combate por turnos · iniciativa = AGI + 1d8: Matthias 10 · Hildegard 9.')).toBe(false);
  });
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
    expect(shouldShowChroniclesNarration('Faust derriba al caballo carroñero con salto brutal. La Llave Negra rebota por el suelo.')).toBe(false);
    expect(shouldShowChroniclesNarration('Salida encontrada. Matthias anota que sobrevivir cuenta como excelencia operativa.')).toBe(false);
  });

  it('keeps actionable advice, threats and blockers available on demand', () => {
    expect(shouldShowChroniclesNarration('La puerta negra no cede. El sello de la cripta sigue dormido.')).toBe(true);
    expect(shouldShowChroniclesNarration('El peón corrompido bloquea el corredor. Convéncelo con violencia reglamentaria.')).toBe(true);
    expect(shouldShowChroniclesNarration('La puerta está libre, sí. La Llave Negra no: el caballo carroñero se la ha llevado.')).toBe(true);
    expect(shouldShowChroniclesNarration('La Cripta de las Ocho Casillas. Huele a humedad y a una decisión cuestionable.')).toBe(true);
  });
});
