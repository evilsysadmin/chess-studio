# Music — criterio de composición, instrumentos e interpretación

Este documento conserva el **criterio musical duradero** aprendido al iterar la música de Chess Studio y, especialmente, Pawn Slug.

No sustituye a los skills operativos. Su objetivo es recordar **qué decisiones musicales e instrumentales funcionan, cuáles producen resultados artificiales y qué pipeline conviene usar**.

Para Pawn Slug, leer también `skills/pawn-slug-synthwave/SKILL.md`.

---

## 1. Principio general

Una pieza no debe sonar a “capas correctas” ni a “MIDI bien producido”. Debe sentirse **compuesta e interpretada como un tema**.

Orden de prioridades:

1. identidad melódica;
2. movimiento armónico;
3. fraseo;
4. interpretación;
5. arreglo;
6. mezcla;
7. loudness.

No intentar arreglar con mezcla una idea musical que todavía no funciona.

---

## 2. Instrumentos: renderizar la interpretación, no montar un collage

Cuando un instrumento realista disponga de sampler, articulaciones, keyswitches, round-robin y controladores expresivos, **renderizar la frase dentro del instrumento original**.

Pipeline preferido:

**MIDI expresivo → sampler/instrumento → DI o stem limpio → amp/FX → mezcla.**

Conservar siempre que sea posible:

- MIDI;
- keyswitches;
- CC/controladores;
- DI;
- stems;
- preset/programa;
- cadena amp/cab/FX;
- tempo;
- mapa de acentos.

### Anti-patrón: reconstruir un instrumento desde WAVs de notas

Sirve para prototipar, pero como solución final suele delatarse por:

- ataques repetidos;
- misma envolvente;
- sustain congelado;
- transitorios idénticos;
- cambios de nota sin comportamiento físico;
- sensación de “sample disparado”.

Los efectos posteriores pueden ocultarlo parcialmente, pero no arreglan la causa.

---

# GUITARRA

## 3. Baseline de guitarra validado

Para rock/synthwave de Pawn Slug, la base preferida actual es:

- **Unreal Instruments Metal GTX**;
- sampler **sfizz offline**;
- izquierda: programa **Full**;
- derecha: **XTracking**;
- dos interpretaciones independientes;
- ampli izquierdo: **JCM2000 NAM**;
- ampli derecho: **5150 Block Letter Boosted NAM**;
- cabinet mediante **IR real 4×12**;
- salida 48 kHz / 24-bit.

El estéreo debe nacer de dos tomas distintas, no de copiar una toma y retrasarla.

Variar entre L/R:

- microtiming;
- velocity;
- picking/micro-picking;
- round-robin;
- pequeñas diferencias de articulación permitidas por el instrumento.

---

## 4. Articulaciones de guitarra: función antes que variedad

### Sustain

Articulación por defecto para:

- notas principales;
- chord tones;
- objetivos melódicos;
- notas largas sin gesto especial.

### Palm mute / mute

Bueno para:

- pickups;
- notas de arranque;
- pulsos;
- contraste antes de abrir el sonido.

No convertir todo el riff en mute si se busca una línea épica o cantable.

### Hammer-on

Conexión ascendente. Debe sonar como continuación de una frase, no como otro ataque fuerte.

### Pull-off

Conexión descendente. Especialmente útil para pequeñas resoluciones.

### Slide

Recurso de transición. Usarlo con moderación.

Funciona cuando cambia realmente la posición o conduce a un objetivo. Si aparece en cada salto, empieza a sonar artificial.

### Bend

**Recurso excepcional.**

Lección importante: usar `bend_full` como nota objetivo repetida produjo una guitarra que “maullaba”.

Síntomas:

- vocalización excesiva;
- cada resolución parece un gesto extremo;
- sensación caricaturesca;
- el riff pierde claridad.

Regla:

- sustain como norma;
- bend sólo en picos concretos;
- evitar bend frecuente + vibrato fuerte + bend speed agresivo.

### Vibrato

Debe depender de duración e importancia.

- casi ninguno en notas cortas;
- discreto en sustain normal;
- algo más en objetivos largos;
- entrar después del ataque, no desde el primer milisegundo.

Vibrato uniforme en todas las notas largas también suena a sampler.

---

## 5. Controladores expresivos

Cuando el instrumento los exponga, la expresividad debe nacer **antes de renderizar audio**.

En Metal GTX han resultado útiles:

- vibrato;
- vibrato rate;
- mute time;
- duración/release;
- picking;
- picking micro;
- bend timing;
- bend start;
- bend speed;
- tensión;
- resonancia;
- long/extra sustain.

Principio:

> Interpretación primero, ampli después.

No renderizar una ejecución rígida y confiar en chorus/reverb/delay para hacerla humana.

---

## 6. Round-robin y humanización

No disparar siempre el mismo sample para la misma nota.

Usar:

- round-robin;
- variaciones pequeñas de velocity;
- picking/micro-picking;
- microtiming;
- dos tomas reales para doble tracking.

La humanización debe ser **jerárquica**, no ruido aleatorio.

### Nivel frase

- una frase puede sentarse un poco detrás;
- la siguiente puede empujar más;
- la intensidad puede crecer en 4–8 compases.

### Nivel compás

- pequeñas variaciones coherentes;
- no mover cada nota sin relación con las demás.

### Nivel nota

- microtiming pequeño;
- velocity contextual;
- duración ligeramente variable;
- articulación por función.

---

## 7. Sustain artificial

Evitar alargar una nota corta con un loop fijo como solución principal.

Problemas:

- periodicidad;
- textura congelada;
- decay inexistente;
- vibrato falso;
- timbre que no evoluciona.

Preferencia:

1. render largo desde el instrumento;
2. articulación sustain/long real;
3. dejar cola a amp/cab/room;
4. sólo como último recurso, tail synthesis aperiódica.

---

# RIFFS

## 8. Qué NO es un riff

Un riff no es:

- ataques sueltos;
- la misma célula de alturas pegada sobre todos los acordes;
- una escala continua;
- una melodía con notas simplemente más separadas;
- el mismo acorde atacado repetidamente;
- un patrón nuevo cada compás;
- tocar más rápido para “hacerlo intenso”.

Espaciar notas puede dar aire, pero no crea identidad.

---

## 9. Identidad del riff

Debe existir una célula que el oído recuerde:

- ritmo;
- contorno;
- intervalo;
- respuesta;
- resolución.

Arquitectura útil:

**motivo → repetición → respuesta → variación → resolución.**

Demasiada variación demasiado pronto = frase deslavazada.

Prueba rápida:

> ¿Se puede tararear después de escucharlo dos veces?

Si no, probablemente hay demasiadas notas, demasiadas ideas o falta una nota objetivo clara.

---

## 10. De menos a más

Un riff épico no empieza en el clímax.

### Semilla

- pocas notas;
- registro medio;
- bastante aire;
- un objetivo claro;
- articulación simple.

### Desarrollo

- misma identidad;
- alguna nota de enlace;
- más movimiento armónico;
- ligera subida dinámica.

### Lift

- registro más alto;
- objetivos más largos;
- formas más abiertas;
- más presencia, no necesariamente más velocidad.

### Clímax

- misma gramática;
- mayor amplitud;
- alguna armonía;
- una carrera corta si aporta;
- no convertir el riff en una escala permanente.

La intensidad debe crecer mediante:

- registro;
- armonía;
- densidad;
- dinámica;
- anchura;
- repetición acumulativa.

No mediante velocidad por defecto.

---

## 11. Movimiento armónico: el riff también mueve formas

Una línea monofónica puede ser melódica y seguir sin sentirse como un riff de guitarra.

Para dar sensación de guitarra real, usar cuando corresponda:

- dyadas;
- power-shapes;
- terceras/sextas diatónicas;
- octavas;
- pequeñas inversiones;
- notas comunes entre formas.

Pensar en **formas que suben y bajan por el mástil**.

Ejemplo conceptual:

- forma baja;
- forma media;
- forma alta;
- caída;
- resolución.

### Micro-strum

Para dyadas/acordes:

- no disparar todas las cuerdas en el mismo sample exacto;
- introducir un pequeño desfase entre cuerdas;
- como referencia, ~8–14 ms funciona bien en formas lentas/medias;
- mantener la percepción de bloque armónico, no convertirlo en arpegio largo.

---

## 12. Riffs chord-aware

Mantener identidad de ritmo/contorno, pero adaptar alturas a la armonía.

No usar una única célula de notas sobre todos los acordes.

Usar:

- chord tones;
- passing tones;
- common tones;
- voice leading;
- inversiones.

El patrón puede seguir siendo “sube → objetivo → cae”, pero cada acorde debe sentirse realmente distinto.

---

## 13. Subidas y bajadas

Evitar zig-zag en cada nota.

Pensar en arcos grandes:

- compás 1: subida;
- compás 2: caída;
- compás 3: nueva subida;
- compás 4: resolución descendente.

El oído entiende mejor una dirección mantenida durante un compás o dos que diez cambios pequeños.

---

# BATERÍA Y PERCUSIÓN

## 14. El sonido que queremos conservar

La percusión que ha empezado a funcionar bien tiene estas características:

- **drums sampleados**, no percusión procedural como base;
- kick y snare sólidos;
- hats con movimiento pero sin metralleta;
- fills ligados a frase;
- room corto y controlado;
- transient claro sin sonar plástico;
- batería presente cuando entra la guitarra;
- groove que apoya el riff sin copiar cada ataque.

TimGM6mb puede servir como baseline/mockup cuando no haya un kit mejor, pero no convertir “GM” en dogma. Si existe un kit sampleado superior, usarlo.

---

## 15. Kick

El kick es un **ancla**, no una sombra de la guitarra.

Preferir:

- golpes principales firmes;
- timing muy estable en los anclajes;
- velocity relativamente consistente en golpes estructurales;
- variación sólo donde tiene sentido musical.

Durante riff:

- reforzar algunos acentos;
- no pegar un kick por cada nota de guitarra.

En huecos:

- puede recuperar patrón synthwave más regular.

### Sonido

Buscar equilibrio entre:

- cuerpo grave;
- punch;
- click/ataque suficiente para atravesar la mezcla.

No hacer el kick “más grande” sólo añadiendo subgrave. Debe seguir siendo legible junto al bajo.

---

## 16. Snare / clap

La caja funciona bien como **ancla de backbeat**, normalmente 2/4 cuando el arreglo lo pide.

Humanizar principalmente:

- velocity;
- ghost notes;
- pequeñas variaciones de sample/round-robin.

No desplazar agresivamente el snare principal fuera de grid.

Una capa de clap/noise puede aportar carácter synthwave, pero debe apoyar a la caja, no convertir cada golpe en una explosión idéntica.

---

## 17. Hi-hats y platos

Aquí sí hay espacio para humanización perceptible.

Variar:

- velocity;
- apertura;
- densidad;
- acentos;
- algún microtiming pequeño.

Regla importante:

**cuando la guitarra se vuelve densa, simplificar hats antes de bajar toda la batería.**

Los hats pueden dar sensación de nerviosismo aunque el riff no cambie.

Evitar:

- 16ths idénticos durante toda la canción;
- misma velocity en cada golpe;
- crash por calendario;
- open hat en cada final de compás.

---

## 18. Ghost notes y percusión secundaria

Sirven para dar vida sin cambiar el groove principal.

Usar con moderación:

- ghost snare;
- pequeños toms;
- percusión metálica;
- claps;
- noise hits;
- elementos electrónicos discretos.

Deben ocupar huecos, no competir con riff, bajo y vocalidad de leads.

---

## 19. Fills

Los fills deben **cerrar una frase o anunciar una sección**.

No añadir fill cada 4/8 compases sólo porque toca matemáticamente.

Un buen fill responde a:

- fin de motivo;
- cambio de armonía;
- entrada/salida de guitarra;
- lift;
- clímax;
- outro.

Mantenerlos más sencillos cuanto más cargado esté el resto del arreglo.

---

## 20. Humanización de batería

Lección clave:

> No humanizar kick/snare principales de la misma forma que hats y ghosts.

### Anclas

Kick/snare principales:

- cerca de grid;
- dinámica controlada;
- consistencia.

### Elementos secundarios

Hats/ghosts/fills:

- más libertad de velocity;
- microtiming pequeño;
- round-robin;
- articulaciones distintas.

La batería convincente nace de **estabilidad abajo + vida alrededor**.

No aplicar jitter aleatorio global a todos los golpes.

---

## 21. Room y bus de batería

El room ha funcionado mejor cuando es **corto y discreto**.

Objetivo:

- cohesión;
- profundidad;
- sensación de kit;
- no lavar transitorios.

Preferir:

- room/early reflections cortas;
- send moderado;
- HP en el retorno si ensucia el grave;
- LP si el room vuelve ásperos hats/cymbals.

Evitar una reverb larga de batería que convierta cada golpe en una nube.

### Compresión

No depender de compresión agresiva.

Si se usa bus compression:

- suave;
- ataque suficientemente lento para conservar transient;
- release musical;
- poca reducción.

El master no debe “bombear” cada vez que entra kick + guitarra.

---

## 22. Batería y riff

La percusión debe reaccionar a la **estructura** del riff.

Buena relación:

- kick refuerza inicio/pico/resolución;
- snare mantiene el suelo;
- hats dejan hueco a ataques importantes;
- fill aparece al final de la frase;
- crash marca un cambio real.

Mala relación:

- kick calca todas las notas;
- fill compite con carrera de guitarra;
- hats siguen igual aunque cambie densidad;
- batería baja de volumen entera al entrar guitarra.

---

## 23. Percusión y dinámica de sección

La batería también debe crecer de menos a más.

### Intro

- textura;
- hat parcial;
- percusión incompleta;
- quizá sin kick completo.

### Desarrollo

- groove reconocible;
- backbeat claro;
- hats todavía contenidos.

### Lift

- más apertura;
- algún crash;
- fills más visibles;
- kick algo más afirmativo.

### Clímax

- kit completo;
- mayor ancho/percepción de room;
- no necesariamente más golpes por segundo.

### Outro

- retirar elementos deliberadamente;
- no limitarse a hacer fade del master.

---

# BAJO Y SINTES

## 24. Bajo

El bajo une riff y batería.

Durante riffs:

- apoyar acentos principales;
- reforzar raíz/movimiento armónico;
- no doblar mecánicamente todas las notas de guitarra;
- no desaparecer.

En huecos:

- recuperar movimiento propio;
- conducir hacia la siguiente frase.

---

## 25. Pads, arps y strings

### Pads

- sostener armonía;
- sustain/release largo;
- movimientos lentos;
- no cortar al final exacto del compás.

### Arps

- más activos en huecos;
- más simples bajo guitarra;
- no desaparecer por completo.

### Strings

- masa y dirección;
- ataques no idénticos;
- solape;
- evitar sensación de orquesta MIDI cuadrada.

Cuando entra guitarra, el tema debe seguir sonando synthwave.

---

# MEZCLA Y VALIDACIÓN

## 26. Instrumento mejor interpretado = menos maquillaje

Preferir:

- buena fuente;
- articulación correcta;
- balance de stems;
- room discreto;
- EQ razonable.

Evitar:

- chorus pesado para esconder toma artificial;
- reverb enorme para disimular ataques repetidos;
- compresión master para arreglar balance;
- ducking global del backing cuando entra guitarra.

---

## 27. Comparación A/B

Toda iteración importante debe compararse a volumen equivalente.

Ideal:

- misma sección;
- misma duración;
- RMS/LUFS comparable;
- A → pequeño silencio → B;
- instrumento solo;
- instrumento en contexto.

No confundir “más fuerte” con “mejor”.

---

## 28. Método de iteración

Cambiar **una familia de variables por pasada**.

Ejemplos:

- articulación;
- movimiento armónico;
- registro;
- groove;
- drum kit;
- room;
- amp/cab;
- balance.

No cambiar a la vez riff, tempo, batería, guitarra y mezcla si luego queremos aprender algo de la comparación.

---

## 29. Diagnóstico rápido

### Todas las notas suenan iguales

- misma articulación;
- misma velocity;
- mismo sample;
- sin round-robin;
- mismo transient.

### Guitarra nerviosa

- demasiados ataques;
- demasiados cambios de dirección;
- objetivos demasiado cortos;
- hats/kick reforzando cada ataque.

### Guitarra deslavazada

- variación excesiva;
- no hay célula;
- cada compás introduce una idea;
- no hay resolución.

### Guitarra “maúlla”

- demasiado bend;
- demasiado vibrato;
- slides excesivos;
- bend speed/start agresivo.

### Batería robótica

- velocity idéntica;
- hats idénticos;
- fill por calendario;
- todo perfectamente igual al grid.

### Batería borracha

- jitter aleatorio en kick/snare;
- ghost notes demasiado altas;
- fills sin relación con la frase.

### Batería nerviosa

- hats demasiado densos;
- kick persiguiendo cada nota;
- crashes frecuentes;
- fills demasiado largos.

---

## 30. Anti-regresiones

No volver a:

- montar la guitarra principal con recortes de WAV si el SFZ está disponible;
- sustain cíclico como solución principal;
- `bend_full` sistemático;
- vibrato fuerte uniforme;
- doble tracking clonado;
- riffs basados sólo en ataques sueltos;
- confundir “más notas” con “más intensidad”;
- ignorar movimiento armónico de dyadas/acordes;
- kick siguiendo todas las notas del riff;
- hats idénticos durante toda la pieza;
- jitter aleatorio en los anclajes de batería;
- fills por calendario;
- reverb grande para esconder una percusión pobre;
- silenciar pads/arps al entrar guitarra;
- usar el master para ocultar problemas de arreglo.

---

## 31. Regla de actualización

Cuando una iteración produzca una mejora musical **claramente validada al oído**, actualizar este documento si la lección es reutilizable.

No registrar aquí cada versión del tema. Registrar únicamente:

- principios duraderos;
- técnicas que funcionaron;
- anti-patrones;
- pipelines instrumentales;
- criterios de aceptación.
