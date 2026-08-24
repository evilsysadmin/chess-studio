# Música ambiental — V11

Todo el audio sigue generado en tiempo real con Web Audio API: no hay MP3/WAV ni CDN. Música y FX tienen mute independiente y la selección se sincroniza con el perfil.

## Regla de V11

**Al-Ándalus se conserva tal cual**: sigue usando el generador original con oud, guitarra, saxo, pad, bajo y percusión, incluyendo su variación estocástica. Era el tema con identidad propia y no se reescribe.

Los otros once temas ya **no reutilizan ese motor como preset**. Usan un secuenciador estructurado por pasos y secciones, con melodía/acordes/bajo/percusión definidos y timbres propios sintetizados:

- **Nocturno de piezas blancas** — piano de fieltro + bajo de arco, sin batería.
- **Gambito de marfil** — clave + pizzicato + madera, contrapunto rápido.
- **Club de medianoche** — piano eléctrico + vibráfono + walking bass + escobillas.
- **Asedio** — metales sintéticos + marcha seca.
- **Relojería** — caja de música + campanas + clicks mecánicos.
- **Acero y terciopelo** — vibráfono + piano eléctrico + escobillas dispersas.
- **Neón sobre el tablero** — lead analógico + bajo pulsante + batería electrónica.
- **Catedral vacía** — órgano sostenido y registro grave, sin percusión.
- **Duelo al amanecer** — cuerda con tremolo + golpes de madera muy espaciados.
- **Tormenta táctica** — arpegiador + synth bass + síncopas rápidas.
- **Final de madrugada** — piano de fieltro + bajo de arco, muy minimalista.

La intención no es que suenen a “variantes” de Al-Ándalus sino a once piezas con gramática musical distinta.

## Layout

El selector de música ya no comparte fila con el título `Escuela de Ajedrez`. Los controles de audio viven en una fila propia, por lo que un nombre largo de tema no puede superponerse al título en desktop ni móvil.

## Limitación

La síntesis y la estructura se pueden validar mecánicamente en tests/parseo, pero la valoración estética final exige escucharlo en un navegador real. Por eso Al-Ándalus se preserva y los nuevos motores se mantienen aislados: si uno no funciona musicalmente, se puede retocar sin romper el tema original ni el resto.


## Estado actual — v16.6bu

El catálogo actual tiene **68 pistas** agrupadas en **12 familias**. A SPA/Zen, Rock, Clásica, Lo-Fi/Chill, Synthwave, Jazz/Mediterráneo, Electrónica/Experimental y Ambient/Otros se suman `Trip-Hop / Downtempo`, `Dark Ambient`, `Bossa / Latin Lounge` y `Piano / Minimal`, con dos temas originales por familia. El gate de personalidad exige una huella estructurada única, prohíbe `bell`/`musicbox` como voces de pista y mantiene `masterTrim` entre 0.76 y 1.12 para evitar saltos de volumen. Todo sigue siendo síntesis Web Audio original, sin archivos externos.

`make audio-check` permite validar offline que el catálogo conserva IDs/grupos coherentes, formas largas de al menos dos minutos y transiciones sin repetición inmediata.

### Audio UX 2.0 (v16.6bu)
La radio automática puede filtrarse por estilo, favoritos o modo Concentración. Las exclusiones nunca entran en la selección automática. La transición natural usa un fade breve y 700 ms de respiración.
