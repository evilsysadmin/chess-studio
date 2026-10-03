# PvP · Sala de Duelos

Contrato de producto/UX para la presentación del 1v1 humano.

## Tesis

El matchmaking humano pertenece al castillo. No debe sentirse como un dashboard, una tabla administrativa ni un modal de settings. La superficie canónica es la **Sala de Duelos**: una estancia donde el jugador entiende físicamente cuatro cosas y nada más:

1. **Tu puesto** — si estás recibiendo retos, tu Elo y cómo retirarte/minimizar.
2. **Tablón de rivales** — quién está disponible y a quién puedes retar.
3. **Mesa del Heraldo** — retos entrantes/salientes y su acción inmediata.
4. **Murmullos de la sala** — conversación secundaria que nunca compite con concertar el duelo.

La Sala de Duelos de lobby sólo concierta y prepara la entrada. Una vez aceptado el reto, la partida se juega en la **Duel Room 3D dedicada**, no en una War Room contra CPU.

## Authority

No nace un segundo dominio PvP.

- roster, challenges, activeMatch, rating, cooldowns y clocks siguen siendo autoridad del backend/hook PvP existente;
- la Sala de Duelos sólo proyecta ese estado y emite intents existentes;
- F5, reconnect, handoff, cancelación y recovery conservan los contratos actuales;
- la futura escena 3D no contiene lógica de matchmaking.

## Jerarquía

El usuario debe poder contestar en segundos:

- ¿estoy disponible?
- ¿hay alguien a quien retar?
- ¿me han retado?
- ¿hay ya un duelo listo?

Rivales y retos dominan. Chat, historial y metadata son secundarios.

En la jerarquía del lobby:
- retos pendientes, especialmente entrantes, aparecen antes que el resto de la sala;
- sin retos pendientes no se reserva un panel vacío para ellos;
- rivales disponibles son la superficie principal de elección;
- disponibilidad propia se presenta compacta;
- conversación permanece plegada por defecto y sólo se considera leída cuando el jugador la abre.

## Lenguaje visual

Misma familia del castillo: piedra/hierro oscuro, madera, latón envejecido, pergamino/marfil y borgoña muy medido.

- Tablón de rivales: madera/placas, lectura inmediata.
- Reto entrante: pergamino/sello, estado ceremonial pero accionable.
- Reto saliente: mensajero/espera, menos énfasis que un reto entrante.
- Tu puesto: pequeño, estable y reconocible.
- Chat: ambiente, no panel protagonista.

No usar glow masivo, dashboards de tarjetas homogéneas ni texto ornamental que esconda acciones.

## Transición a War Room

Cuando ambos jugadores aceptan:

`reto concertado → sincronización autoritativa → cuenta atrás breve → Duel Room`

La presentación puede ser ceremonial, pero nunca retrasar o sustituir el estado real. Cualquier error/recovery debe seguir gobernado por el match autoritativo.

La ceremonia de entrada proyecta exclusivamente el match existente:
- `starting` → portón cerrado / “Sellando el duelo”;
- `active + startsAt` → portón abriendo y cuenta atrás del timestamp autoritativo;
- `cancelled` → portón cerrado, sin resultado ni cambio de Elo;
- nombres, color, Elo y reloj salen del snapshot de match, nunca de estado visual paralelo;
- animación y decoración pueden desaparecer con reduced-motion sin alterar timings ni transición.

Mientras el duelo esté `active`, la Duel Room no se minimiza al lobby: el reloj humano sigue corriendo y salir de la sala debe ser una acción explícita de rendición. El CTA superior muestra **Salir**, abre la confirmación de rendición y sólo después de un estado terminal se habilita **Volver al lobby**. Nunca debe existir el ciclo `Lobby → activeMatch → reentrada inmediata a Duel Room`.

## Móvil

Viewports mínimos: 360×800, 390×844, 430×932.

- sin scroll horizontal;
- sin scroll heredado al reabrir;
- targets táctiles >=44×44 para acciones primarias;
- reto entrante y CTA principal visibles sin atravesar contenido irrelevante;
- no duplicar empty states;
- reducir decoración antes que legibilidad;
- portrait debe ser plenamente usable; landscape puede mostrar una estancia más rica.
- la Duel Room de partida entra en apaisado en móvil igual que la War Room: el navegador sólo deja girar (fullscreen + `screen.orientation.lock`) dentro de un gesto, así que el giro se pide en el toque de **Retar** o **Aceptar**, no en la cuenta atrás. Si el reto acaba sin duelo (rechazado, cancelado o caducado) se libera, como una partida contra CPU que no llega a empezar. iOS no tiene API de giro: allí, como en la War Room, queda la pastilla «Apaisado».

## Evolución 3D

La escena 3D propia se introduce después de validar la jerarquía y el flujo con una shell barata/reversible.

La sala 3D debe:
- ser distinta de Home y War Room;
- conservar los mismos cuatro hotspots semánticos;
- lazy-load al entrar y liberar canvas/RAF/listeners al salir;
- usar el mismo contrato óptico que War Room también en móvil; las adaptaciones por dispositivo se limitan a distancia/target/crop para preservar tablero, HUD y targets táctiles;
- permitir fallback 2D funcional si WebGL/asset falla;
- producir PNG desktop+móvil y compararse con un golden aprobado antes de promoción.

La escena no justifica un renderer paralelo ni una segunda fuente de verdad.

## Criterio de cierre

La superficie está lista cuando entrar al 1v1 se siente como **visitar una estancia del castillo para concertar un duelo**, y un jugador nuevo entiende sin explicación adicional dónde está él, dónde están los rivales, qué retos requieren atención y cómo entra en combate.


## Canon visual de la Duel Room

La Duel Room de partida usa como canon una **mazmorra/fortaleza teutona densa pero jugable**.

- tablero protagonista, usando el mismo contrato canónico de cámara de War Room v4 (22° de lente y ≈43.9° de pitch); desktop y móvil apaisado comparten esa óptica y sólo adaptan distancia/target/crop al viewport;
- sin grandes barras, vigas o nervios claros atravesando el encuadre;
- muros de piedra oscura, hierro, madera, latón envejecido y luz cálida de fuego;
- rastrillo central con profundidad y maquinaria de izado legible;
- cadenas, rejillas de suelo, armaduras centinela, armas, barriles/cajas y utilería de fortaleza en la periferia;
- braseros laterales y traseros como prácticos cálidos, con luz fría secundaria de luna/piedra;
- heraldry red/blue muy medida para identidad PvP; no estética esports;
- ningún elemento decorativo puede invadir el cono interactivo ni competir con piezas, HUD o selección táctil;
- en móvil se recorta decoración antes que tablero o controles.
- las armaduras centinela usan full plate gótico articulado con silueta legible a distancia — grebas/cuisse, poleyn alado, fauld laminado, peto fluted, gorget, couters/gauntlets y armet — con acero pulido envejecido y latón contenido; sus pedestales viven adosados a los muros laterales, fuera del perímetro de combate y centrados en un vano libre entre pilares;
- las butacas son piezas premium de roble oscuro + cuero + latón/heráldica, apoyadas visualmente contra el muro pero sin atravesarlo, giradas físicamente hacia el tablero y a escala subordinada al juego;
- butacas y centinelas no comparten vano ni línea de cámara: las butacas ocupan el vano lateral delantero y los centinelas el vano central, de modo que ambos sean visibles sin invadir la plataforma; ocluir la armadura con la butaca es regresión visual.
- el runtime consume el logical ID R2 `pvp.duelRoom.runtime`, promovido a un objeto content-addressed e inmutable; `runtime/current.glb` puede existir como alias de publicación/fallback, pero no es la autoridad de consumo de la app.

El objetivo es que parezca una estancia ocupada y funcional del castillo, no un escenario vacío ni una sala genérica con tablero.
