# V12 — Rivalidad y memoria

## Relojes y ritmos

Partida rápida permite ahora:

- Sin reloj
- 1+0 Bullet
- 3+2
- 5+0
- 10+0
- 15+10

El reloj es deliberadamente cliente-side: Chess Studio es una aplicación casual y no pretende arbitrar competición anti-trampas. Los incrementos Fischer se aplican al terminar cada jugada y la caída de bandera cuenta como derrota/victoria.

## Series

Partida rápida permite partida única, mejor de 3 y mejor de 5. En una serie:

- se mantiene dificultad y ritmo;
- el color alterna;
- las tablas no cuentan como victoria: gana quien llegue primero a 2/3 victorias;
- el marcador se ve durante la partida;
- las series terminadas se guardan en el perfil y aparecen en "Así juegas".

## Compartir

Las partidas normales y de torneo pueden compartirse desde el final o el historial.

El enlace usa `#share=<payload>` y contiene únicamente un resumen explícito de esa partida: resultado, nivel, color, apertura, ritmo, marcador de serie y SAN de las jugadas. No contiene username, JWT, token, game_id de backend ni el perfil.

El hash no se envía al servidor HTTP. Una partida compartida puede abrirse sin login y muestra el acta de movimientos.

## Memoria contextual de la CPU

La rivalidad v3 guarda una ventana limitada de partidas recientes y algunos hitos reales:

- resultado;
- dificultad;
- color;
- apertura identificada;
- número de jugadas;
- ritmo;
- pertenencia a serie;
- rachas;
- victoria más rápida;
- partida más larga;
- mayor dificultad vencida.

La CPU usa esos datos de manera selectiva al empezar una partida, al reconocer una apertura repetida y al terminar. La reincidencia táctica de versiones anteriores sigue funcionando.

No se generan recuerdos sobre datos que no existan en el perfil.
