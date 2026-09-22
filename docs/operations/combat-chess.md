# Combat Chess — contrato de dominio

Este dominio sigue también [`architecture-ownership.md`](architecture-ownership.md): Combat posee sus reglas persistentes; renderers y pantallas sólo las proyectan.

Combat Chess es el modo roguelike/táctico con ejército persistente. Sus reglas especiales son deliberadas y quedan aisladas del ajedrez estándar.

## Identidad persistente de unidad

Toda pieza de Combat nace con una identidad propia desde nivel 1:

- alias/nombre persistente;
- XP y rango;
- medallas/condecoraciones;
- técnicas/desbloqueos;
- metamorfosis disponibles;
- supervivencias, revives y bajas;
- historial de servicio.

La identidad sobrevive cambios de clase/loadout. Una pieza veterana sigue siendo la misma unidad aunque despliegue como otra clase permitida.

## Caída, revive y Memorial

- Al caer una unidad existe una ventana de revive antes de la siguiente batalla cuando el contrato lo permite.
- Revivir conserva exactamente la misma identidad e historia y registra el revive.
- Empezar la siguiente batalla sin revivir archiva permanentemente esa identidad en el Memorial de Caídos.
- El reemplazo es una unidad nueva de nivel 1, nuevo alias y cero herencia de XP/rango/medallas/técnicas.
- Reclutas nivel 1 sin inversión pueden no ser revivibles, pero su identidad caída igualmente pasa por Memorial antes del reemplazo.

No reciclar nombres/identidades para simular continuidad.

## Metamorfosis de veteranos

La metamorfosis rompe reglas normales sólo dentro de Combat Chess.

- Opciones desbloqueadas dependen del rango/progreso real de esa unidad.
- La forma/clase se elige antes de la batalla.
- Durante la batalla la pieza se mueve como la clase elegida.
- No existe free-switch arbitrario a mitad de combate.
- La identidad persistente no cambia por seleccionar otra forma.

## Ejército, barracas y despliegue

- Las barracas pueden superar las 16 unidades desplegadas.
- El jugador elige qué unidades lleva y cuáles protege en reserva.
- Las restricciones de slots/clases deben ser explícitas y comprensibles.
- La dificultad/amenaza compensa principalmente por la fuerza realmente desplegada, no por todo el inventario histórico del jugador.
- No aplicar penalizaciones ocultas por reservar un veterano.

## Inteligencia operacional

Reconocimiento usa una economía separada de XP de unidad.

Créditos se ganan por logros reales de campaña y se gastan antes del encuentro para revelar información progresivamente más precisa, por ejemplo:
- rango de amenaza;
- composición/tendencias;
- modificadores especiales;
- información de boss.

Nunca revelar la jugada exacta del motor ni inventar intel falsa para crear drama.

## Rangos, medallas e insignias

- Rango/medallas reflejan logros reales de Combat Chess.
- No conceder decoración por tiempo o grind arbitrario sin evento medido.
- Las insignias visibles preferidas son diegéticas y discretas sobre la propia pieza: base/plinto, collar/banda o chevrons metálicos/engraved.
- Deben leerse al zoom normal sin convertir la pieza en una unidad RPG recargada.

## Boss HP y aislamiento de reglas

HP empieza como experimento controlado para el rey/boss de Combat. Las piezas normales siguen siendo de una captura salvo contrato explícito posterior.

Ninguna de estas reglas puede filtrarse a:
- ajedrez estándar;
- torneo;
- puzzles;
- spectator;
- otros modos que no sean Combat.

## Persistencia y F5

Pre-battle deployment, roster persistente, identidad, revive window, Memorial y progreso deben sobrevivir F5/reconnect conforme al contrato de persistencia, sin cruzar usuarios.

Al iniciar una batalla, el roster desplegado queda congelado para ese encounter.

## UX y tutorial

Combat usa progressive disclosure:
- briefing muestra primero amenaza, ejército e intel esenciales;
- dossier profundo detrás de acción explícita;
- cualquier mecánica no estándar se explica de forma contextual, breve, skippable y reabrible.

## Acceptance

Una iteración Combat está lista cuando:
- identidad y service record sobreviven correctamente;
- revive vs muerte permanente no duplica ni recicla unidades;
- deployment legal/ilegal está probado;
- reserva no modifica identidad ni aplica penalización oculta;
- threat usa fuerza desplegada según contrato;
- intel no inventa ni filtra jugadas exactas;
- metamorfosis permanece Combat-only;
- F5/reconnect conserva el estado correcto;
- UI móvil no introduce overflow o decisiones incomprensibles.
