# Roadmap de ideas — siguiente nivel de maldad ajedrecística

No son compromisos de implementación. Es una reserva de ideas priorizadas para
seguir ampliando Chess Studio sin convertir el menú en un bazar.

## Prioridad alta

### 1. ✅ Autopsia de la partida — quick win implementado en V6

Pantalla final con el **punto de inflexión**, mejor jugada, peor jugada, mate
omitido, material regalado y una mini cronología de 3-5 momentos decisivos. La
CPU puede rematar el informe con una sola frase sarcástica según el desastre o la obra
de arte.

### 2. Puzzles nacidos de tus propias cagadas

Cuando el análisis detecte una posición donde el usuario tuvo una táctica o una
defensa clara, guardar esa posición como puzzle personal. Días después aparece
en entrenamiento: "La otra vez aquí incendiaste el tablero. Inténtalo de nuevo."

### 3. Némesis adaptativa

Perfil de debilidades persistente: piezas que más cuelgas, mates de última fila,
horquillas sufridas, tendencia a mover demasiado la dama, aperturas con peor
resultado, etc. La CPU no hace trampas: usa esos datos para elegir tipos de
posiciones/retos y para contextualizar sus comentarios.

### 4. ✅ Replay táctico / cámara del crimen — quick win implementado en V6

Tras un blunder grande, botón para reproducir 2-4 jugadas de la refutación de
forma animada. Mucho más pedagógico que decir únicamente "-620 cp".

### 5. Relojes y modos rápidos

Rapid / Blitz / Bullet con incrementos configurables. Estadísticas separadas por
ritmo para no mezclar una partida pensada de 20 minutos con una carnicería de
60 segundos.

## Prioridad media

### 6. Expediente de aperturas

Winrate, rating y errores por apertura; árbol pequeño de las variantes que más
juega el usuario y aquellas donde suele salir de la teoría en llamas.

### 7. Mapa de pecados

Heatmaps del tablero: casillas desde las que más se pierden piezas, dónde se
reciben mates, qué pieza genera más blunders y contra qué pieza se pierde más
material.

### 8. ✅ Identidad única de CPU — consolidado en V8

Se descartó el selector de personalidades. Hay una única CPU, con sarcasmo bestia, elegante y memoria persistente. No lleva nombre de personalidad ni modo especial: ese carácter forma parte del juego; la fuerza sigue dependiendo sólo de la dificultad.

### 9. Memoria de rivalidad

La CPU recuerda hitos contra ese usuario: "segunda dama que me regalas hoy",
"la última vez en esta apertura duraste 19 jugadas", rachas cara a cara y
revancha. Sólo usar datos del propio perfil, sin inventar recuerdos.

### 10. Desafío diario reproducible

Una posición/CPU/condición generada con semilla diaria. Todos reciben el mismo
reto y se puede comparar puntuación: material, precisión, tiempo y resultado.

### 11. Modo supervivencia táctica

Cadena de posiciones cortas; cada error quita una vida. Dificultad creciente y
racha persistente. Puede reutilizar el motor y parte de la infraestructura de
puzzles ya existente.

### 12. Entrenamiento sin ayudas visuales

Opciones independientes para ocultar casillas legales, último movimiento,
jaques visuales y/o coordenadas. Buena forma de escalar dificultad sin tocar la
fuerza del motor.

## Admin / observabilidad

### 13. Última actividad y uso

En "Ver detalles": último acceso, número de requests, última partida, errores
5xx recientes y versión de frontend/perfil cuando esté disponible. Muy útil al
depurar a distancia.

### 14. Actividad de partidas

Panel de partidas activas/recientes con usuario, modo, dificultad, nº de jugadas
y resultado. No hace falta mostrar el tablero en vivo de entrada; primero basta
con trazabilidad.

### 15. ✅ ID de request correlacionable — implementado en V6

Generar un `request_id` corto por petición, devolverlo en header y escribirlo en
logs. Si un usuario reporta "me falló al mover", el frontend puede enseñar ese
ID y el backend se encuentra en segundos.

## Caprichos que pueden quedar gloriosos

### 16. ✅ Trofeos de vergüenza — implementado en V6

Logros especiales por eventos raros: perder dama contra peón, ahogar con gran
ventaja, ignorar mate en 1, recibir tres horquillas en una partida. Deben ser
humorísticos y claramente separados de los logros de habilidad.

### 17. Mesa temática por modo

Pequeños cambios ambientales según torneo, combate, puzzle o espectador:
fondo, textura y tema musical asociado. Sin tocar tamaño/legibilidad del tablero.

### 18. Compartir una posición

Enlace que abra directamente una FEN/posición de análisis o puzzle. Ideal para
mandar una atrocidad concreta a otra persona sin compartir toda la cuenta.
