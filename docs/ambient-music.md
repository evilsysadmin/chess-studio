# Música ambiental — cómo se llegó al diseño final

Cuatro capas sintetizadas (sin archivos de audio), solo en el menú
principal, en `frontend/src/sound.js`. Todo generado con Web Audio API en
tiempo real — ningún `.mp3`/`.wav` en el repo.

## Las capas

- **Pad**: grave y sostenido, tónica/quinta/séptima.
- **Punteo de laúd/guitarra española**: mismo motor de frases melódicas
  cortas, timbre distinto entre las dos — la guitarra usa dos
  osciladores levemente desafinados entre sí, el "chorus" natural de una
  cuerda de nylon vibrando.
- **Saxofón**: voz solista ocasional, con vibrato real — un oscilador de
  baja frecuencia modulando el parámetro `frequency` del oscilador
  principal (así se hace vibrato de forma nativa en Web Audio API, no es
  un efecto simulado).
- **Percusión**: patrones de 16 pasos estilo breakbeat (bombo/caja en
  posiciones sincopadas), con dos timbres genuinamente distintos —
  pasa-bajos grave y pasa-banda agudo — y un bombo con cuerpo tonal real
  (ver más abajo).

Todo sobre una escala **Phrygian dominant** en Do — la segunda aumentada
entre el 2° y 3er grado (Db→E) es la sustitución más reconocible en
temperamento igual de 12 tonos para sonoridad "oriental". Un maqam real
usa cuartos de tono que Web Audio API no puede producir de forma nativa,
así que no se simula un microtono falso — se usa la escala occidental más
cercana, con honestidad sobre esa limitación.

## Iteración por iteración — los problemas reales, no solo features nuevas

**"Deslabazado"**: la primera versión con punteo elegía una nota suelta al
azar de toda la escala en cada tick, sin relación con la anterior. Se
corrigió con **frases** armadas (3-5 notas con forma melódica real:
descendente, ascendente, un giro ornamental) en vez de notas sueltas — la
aleatoriedad decide qué frase suena y cuándo, no nota por nota.

**Percusión con un solo timbre, en loop fijo**: la primera versión de
percusión repetía siempre el mismo patrón de 4 pasos para siempre —
mecánico. Se corrigió con 5 frases rítmicas distintas (incluido un ciclo
de silencio total, un respiro real), elegidas al azar cada vez que
termina la anterior — mismo criterio que las frases melódicas.

**"Rata dándole bastonazos a otra"**: el "dum" grave sonaba a puro ruido
filtrado, sin peso real. Se le sumó un oscilador con caída de tono (150Hz
a 45Hz en 0.09s, la síntesis clásica de bombo tipo 808) sonando junto al
ruido de siempre — el tono da el cuerpo grave, el ruido sigue dando la
definición del golpe.

**Sonaba a banda sonora de terror**: no era casualidad — Phrygian
dominant es la misma escala que usa mucho cine de tensión, y encima venía
con pad grave sostenido y silencios largos entre frases (los mismos
recursos de suspenso). Se le bajó el filo sin cambiar de escala: menos
frases que enfatizan el color de tensión (de 2 de 5 a 1 de 6), dos frases
nuevas que salen de la tríada mayor (más cálidas), silencios más cortos,
y el pad una octava más arriba con ataque más corto.

**Seguía sonando fijo/estancado**: aun con la escala más cálida, todo
giraba siempre sobre el mismo centro tonal para siempre — tensión que
nunca se mueve ni se resuelve, otro recurso clásico de música de tensión.
Se agregó rotación del centro tonal cada 6 compases entre tres posiciones
(Do/tónica, Fa/subdominante, Reb/el color "frigio-español" que le da
nombre a la escala) — pad, cuerdas y saxo se transponen juntos al
cambiar. Verificado con timers reales: las frecuencias antes y después
del cambio coinciden exacto con `freq × 2^(semitonos/12)`.

**"Orquesta de monos entrenados"**: aun compartiendo un reloj de pasos
único (140ms, ~107 BPM, en vez de cada capa con su propio intervalo
suelto — el problema de fondo original), el saxo entraba cada 20 pasos,
que **no es múltiplo** de los 16 pasos de un compás. Tardaba 4 compases
enteros en volver a alinearse con el patrón de percusión, entrando en un
punto distinto cada vez — sonaba a "cada voz por su lado" aunque
compartieran el reloj. Corregido a 32 pasos (2 compases exactos).

## Estado actual

Pendiente de una escucha real y feedback de "¿ya suena bien?" — todo lo
de arriba se pudo verificar *mecánicamente* (timers reales, matemática de
frecuencias, tipos de filtro), pero el resultado estético en sí nunca se
confirmó de la misma forma que el pixel art (no hay forma de "escuchar"
audio generado desde este entorno, a diferencia de poder renderizar y
mirar una imagen).

## Quinta capa: contrabajo (walking bass)

Después de un "guay" sobre el resultado, se pidió más variedad — otro
instrumento y otra tonalidad, para sumar color. Dos cambios:

- **Contrabajo**: una octava por debajo de `OUD_SCALE`, walking bass de 4
  notas por compás (tónica, quinta, tónica, séptima bemol) — un patrón
  clásico de jazz, no una nota sostenida. Timbre con dos capas: un cuerpo
  en `triangle` (más redondo que sine, menos brillante que sawtooth) y un
  toque corto de `sawtooth` filtrado solo en el ataque, para simular el
  "mordiente" de una cuerda grave punteada de verdad en vez de sonar a
  tono de sintetizador puro. Usa `barStep` (la posición dentro del
  compás), no el contador absoluto de pasos — misma lección aprendida del
  desajuste del saxo en una vuelta anterior, para que el patrón nunca se
  desalinee del resto. Verificado con timers reales: 5 eventos en 2.5s,
  frecuencias exactas (C2/G2/C2/Bb2/C2), gaps de ~562ms (4 pasos × 140ms
  esperados), y el patrón se reinicia limpio al cruzar cada compás.
- **Cuarto centro tonal**: Sol (+7 semitonos, dominante) se suma a
  Do/Fa/Reb en la rotación — un color más cálido/familiar en contraste
  con el giro "frigio-español" de Reb, para variar más el recorrido
  armónico sin perder la identidad de la escala.

## Análisis técnico de una referencia (librosa, no la melodía)

El usuario compartió un mix de referencia (~2.5 horas, "Arabic Jazz Mix")
como ejemplo del estilo que le gusta. No hay forma honesta de "escuchar"
la pieza y replicarla — eso implicaría reproducir contenido con derechos
de otra persona. Lo que sí se puede hacer, y se hizo: análisis técnico
objetivo con `librosa` sobre 5 segmentos de 60s repartidos a lo largo del
mix (tempo, centroide espectral, distribución de clases de altura,
balance armónico/percusivo) — datos estadísticos sobre el audio, no la
composición en sí. Nada de esto se transcribió ni se copió; se usó como
parámetros de ajuste sobre el sistema propio ya existente.

Hallazgos (promedio de los 5 segmentos):
- **Tempo**: mediana 129 BPM (rango 89-172, normal en un mix que combina
  varias pistas a tempos distintos).
- **Balance armónico/percusivo**: 22.78 — la energía armónica domina muy
  por encima de la percusiva. Percusión discreta, no protagonista.
- **Centroide espectral**: ~1055Hz — tímbrica cálida/oscura, no brillante.
- **Densidad rítmica**: ~3.6 eventos/segundo — moderada.
- **Distribución tonal** (croma): Do domina, seguido de Sol y Re —
  coincide con la tónica que ya se venía usando (Do), sin haberla tomado
  de acá.

Ajustes aplicados, todos parámetros de síntesis, no melodía:
- **Tempo**: `STEP_MS` de 140 a 130 (de ~107 a ~115 BPM) — se acerca a la
  mediana de la referencia sin llegar (129 BPM sería demasiado vivo para
  música de fondo de menú).
- **Timbre más cálido**: los filtros pasa-bajos del laúd/oud, la guitarra
  y el saxo bajaron su frecuencia de corte (menos brillo, más calidez),
  en línea con el centroide espectral bajo que salió en el análisis.

## Voz de la CPU (Web Speech API, no Web Audio)

Distinto sistema, mismo criterio de "nada de archivos externos": la CPU
ahora puede *hablar* en capturas, jaque y jaque mate, usando
`SpeechSynthesisUtterance` — la API de síntesis de voz nativa del
navegador, sin librerías ni servicios externos. Vive en
`voiceCommentary.js`, separado de `sound.js` porque es un mecanismo de
audio completamente distinto (voz sintetizada por el sistema operativo,
no osciladores generados a mano).

Apagado por defecto (opt-in, no opt-out) — narrar cada jugada puede
cansar rápido si no se pidió a propósito. Varias frases por evento
(3-4 variantes para capturas, jaque, y cada resultado de jaque mate),
elegidas al azar para no repetir siempre lo mismo. Cancela cualquier
frase pendiente antes de hablar una nueva (`speechSynthesis.cancel()`) —
sin esto, en jugadas rápidas las frases se acumulan en cola y la CPU
termina hablando de una jugada de hace rato.
