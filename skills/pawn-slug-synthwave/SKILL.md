# Pawn Slug Synthwave — skill de composición, mezcla y entrega

Este skill define cómo generar e iterar música original de **synthwave / outrun / rock electrónico** para Pawn Slug con calidad suficiente para runtime, evitando regresiones hacia demos MIDI, loops planos o mezclas donde la guitarra tape al resto.

El objetivo no es imitar melodías concretas de artistas existentes. Se pueden usar referencias de alto nivel —energía, arquitectura de riff, instrumentación, contraste, tratamiento tímbrico—, pero la melodía, riffs, armonías y arreglo deben ser originales.

## Fuente y alcance

- La música de Pawn Slug debe sentirse compuesta como un tema, no como un loop con capas añadidas.
- Preferir una estructura explícita: **intro → desarrollo → clímax → outro**.
- La guitarra es una voz importante, no el único elemento. Pads, arpegios, bajo y batería deben mantener identidad y presencia.
- Trabajar con stems siempre que sea posible: drums, bass, pads, arps/leads, guitar y FX. Evitar mezclar toda la canción demasiado pronto.
- Entrega runtime: WAV master a 48 kHz / 24-bit y OGG para Godot.

## Referencia sonora actual

Hasta que una iteración validada lo sustituya:

- guitarra fuente: **Unreal Instruments Metal GTX**;
- sampler: **sfizz offline**;
- amp dual preferido: **JCM2000 NAM izquierda + 5150 Block Letter Boosted NAM derecha**;
- cabinet: IR real de 4×12, preferiblemente con licencia explícita y trazable;
- batería: sampled drums; TimGM6mb es aceptable como baseline si no hay un kit mejor;
- no volver a guitarra TimGM, Karplus/physical modeling, osciladores ni timbres sintéticos que recuerden a piano/flauta;
- conservar DI, MIDI, mapa de acentos y stems para poder reamplificar o remezclar sin recomponer.

Si un banco/modelo grande se descarga desde un origen externo inestable, cachearlo o publicarlo mediante el flujo de assets adecuado; no depender de descargar 1+ GB en cada iteración.

## Tempo

No fijar 158 BPM por costumbre.

Para temas synthwave con guitarra melódica:

- probar primero **148 / 152 / 156 BPM**;
- usar **152 BPM** como punto de partida cuando el tema necesite más respiración;
- subir tempo sólo si kick, bajo, riffs y colas de pads siguen respirando;
- bajar tempo antes de intentar arreglar una sensación de prisa mediante cuantización extrema o silencios artificiales.

La comparación de tempo debe mantener la misma frase musical para que el juicio sea útil.

## Arquitectura del tema

### Intro

La intro no debe ser "strings y ya".

Construirla por capas, normalmente:

1. pad/strings largos;
2. pulso grave o bass drone discreto;
3. arpegio lento o incompleto;
4. textura/ruido/riser;
5. percusión parcial o hats antes del kick completo.

Los strings/pads deben usar **sustain largo y release/fade solapado**. Evitar notas que corten en seco al terminar el compás.

La intro debe anticipar el tema sin revelar inmediatamente el riff completo.

### Desarrollo

Alternar protagonismo:

- frase de guitarra;
- hueco real;
- arpegio/pad/lead synth tomando el relevo;
- respuesta de guitarra distinta;
- crecimiento de batería/bajo.

No mantener todos los elementos al máximo todo el tiempo.

### Clímax

El clímax puede usar:

- guitarra dual más abierta;
- armonía a dos voces sólo en picos;
- pads más anchos;
- arpegio más brillante;
- batería más completa;
- bajo siguiendo los acentos fuertes.

El clímax debe sentirse mayor por **arreglo y densidad**, no sólo por subir el volumen de guitarra.

### Outro

Retirar elementos deliberadamente:

1. guitarra;
2. kick o parte de batería;
3. arp;
4. dejar pads/strings/texturas con cola.

Evitar simplemente hacer fade del master desde el clímax.

## Riffs y fraseo de guitarra

El riff debe tener arco propio:

**motivo escaso → respuesta → desarrollo → carrera/escala puntual → clímax/armonía**.

Reglas:

- usar notas largas y objetivos melódicos;
- dejar silencios de 1–2 beats cuando la frase lo pida;
- bends, slides, hammer-on/pull-off y vibrato sólo donde aporten;
- las escalas sirven de enlace, no de relleno permanente;
- la armonía a terceras/sextas debe ser diatónica/chord-aware, nunca un intervalo fijo aplicado a todo;
- resolver picos a chord tones, octavas o unísonos cuando tenga sentido;
- evitar patrones de ataque repetidos que conviertan el riff en "martillo neumático";
- no recortar stems en bloques arbitrarios si eso rompe fraseo o colas;
- si la guitarra se compuso sobre Em–G–D–C, el backing debe usar exactamente esa progresión durante ese material.

## Batería

La batería no debe tocar "en paralelo" al riff.

Durante guitarra:

- el **kick sigue los acentos reales del riff**;
- la caja puede mantener 2/4 como ancla;
- hats y ghost notes se simplifican cuando compiten con ataques importantes;
- fills cierran frases, no aparecen por calendario;
- mantener los golpes de anclaje exactamente en grid; humanizar primero velocidad, no desplazar kick/snare indiscriminadamente.

En huecos de guitarra:

- volver a un groove synthwave más regular;
- introducir hats abiertos, fills o pulso adicional;
- usar el contraste para que la siguiente entrada de guitarra tenga impacto.

## Bajo

El bajo debe funcionar con kick y guitarra:

- en riffs: atacar con los acentos principales;
- en huecos: recuperar movimiento propio;
- no desaparecer cuando entra guitarra;
- evitar que todo el movimiento sea octavas mecánicas;
- mantener el centro grave estable de sección a sección.

## Pads, arpegios y leads synth

Pads y arps son parte de la composición, no decoración.

- pads: sostener armonía y profundidad; usar releases largos y solape;
- arps: más activos cuando la guitarra calla; simplificarse cuando la guitarra habla, pero **no desaparecer**;
- leads synth: respuestas cortas, no una segunda melodía continua que pelee con la guitarra;
- preservar ancho estéreo de pads/arps durante riffs;
- automatizar densidad, filtro y registro antes que simplemente volumen.

Una sección con guitarra debe seguir sonando a synthwave, no convertirse de repente en "rock con los sintes silenciados".

## Mezcla y normalización

### Regla principal

**Cuando entra la guitarra, el backing no debe bajar de volumen.**

No usar compresión/limitación del master para "pegar" una mezcla que aún no está balanceada. Un bus master que ve la energía extra de la guitarra puede reducir batería, bajo y synths y crear ducking audible.

Preferir:

- controlar guitarra en su propio bus;
- EQ estática o dinámica sólo en bandas en conflicto;
- side/M-S EQ para conservar pads/arps;
- compresión suave por stem;
- peak safety uniforme al final.

### Targets prácticos

No imponer un LUFS fijo como sustituto del juicio, pero validar:

- peak final seguro, normalmente alrededor de **−1 dBFS**;
- loudness comparable entre iteraciones A/B;
- comparar bloques con guitarra vs bloques sin guitarra por bandas:
  - 38–520 Hz: bajo/bombo no deben caer perceptiblemente;
  - 1.2–6.5 kHz: caja/presencia/synth no deben desaparecer;
  - 4.8–12.5 kHz: hats/aire no deben hundirse al entrar guitarra;
- si el backing cae > ~1 dB de forma sistemática en una banda al entrar guitarra, investigarlo antes de aceptar;
- no "corregir" una caída del backing subiendo globalmente esa banda en toda la canción.

Normalizar el master entero puede igualar loudness general, pero **no corrige masking ni ducking interno**. Primero balancear stems; después normalizar/limitar con suavidad.

## Pipeline de iteración

1. elegir tempo y progresión;
2. componer estructura y armonía sin guitarra protagonista;
3. renderizar stems;
4. componer riff original y exportar también MIDI + mapa de acentos;
5. renderizar DI;
6. reamp con NAM + IR;
7. cablear kick/bajo al mapa de acentos;
8. mezclar por stems;
9. renderizar WAV + OGG;
10. generar preview que incluya transición **antes/durante/después** de la entrada de guitarra;
11. medir picos, RMS/loudness y bandas;
12. escuchar A/B a loudness comparable;
13. iterar una preocupación musical coherente por pasada.

No aceptar una mejora sólo porque "el riff suena mejor" aislado. Debe funcionar dentro del tema.

## Acceptance gate

Una iteración está terminada cuando:

- estructura intro/desarrollo/clímax/outro se percibe;
- tempo deja respirar fraseo y colas;
- batería y bajo reaccionan al riff en vez de ignorarlo;
- pads/arps siguen presentes durante guitarra;
- strings/pads de intro tienen sustain/release natural;
- guitarra no domina el master ni provoca caída audible del backing;
- no hay clipping;
- WAV 48 kHz / 24-bit y OGG cargable por Godot están generados;
- preview y master fueron escuchados/validados;
- MIDI, stems y mapa de acentos se conservan cuando existan;
- cualquier asset externo usado tiene procedencia/licencia trazable.

## Anti-regresiones

No volver a:

- guitarra procedural/Karplus/physical modeling;
- guitarra GM que suene a flauta/piano;
- riffs continuos de escala sin fraseo;
- repetir el mismo patrón de ataque durante 16 compases;
- backing con progresión distinta a la guitarra;
- batería quantizada genérica que no dialogue con el riff;
- cortar strings/pads al final exacto de cada compás;
- silenciar arps/pads al entrar guitarra;
- usar compresión master para esconder una mezcla no resuelta;
- comparar iteraciones a volúmenes distintos y confundir "más fuerte" con "mejor".
