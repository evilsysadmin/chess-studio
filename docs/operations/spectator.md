# Spectator / CPU vs CPU — contrato operativo

Modo Espectador es **ajedrez estándar automatizado**, no un motor ni una variante independiente.

## Ownership

- `SpectatorScreen` posee setup/presentación: niveles, ritmo, pausa, sonidos, board UI y estados visibles.
- `spectatorSessionRunner.js` posee el lifecycle async CPU-vs-CPU.
- `chess.js` + helpers de `chessRules.js` poseen legalidad y estados terminales.
- El backend/AI puede sugerir una jugada; nunca posee permiso para saltarse la legalidad local.

No volver a meter el loop completo dentro del componente ni crear un segundo runner paralelo para resolver el mismo lifecycle.

## Loop y legalidad

Cada iteración del runner:

1. comprueba terminal/stop;
2. respeta pausa mediante espera cancelable;
3. captura el FEN exacto solicitado al analizador;
4. analiza con `AbortSignal`;
5. descarta el resultado si la sesión fue cancelada o la posición ya cambió;
6. aplica la sugerencia sólo mediante el contrato compartido de jugada legal/fallback;
7. emite el movimiento visible;
8. vuelve a comprobar terminal y espera el pacing cancelable.

Si la sugerencia remota falla o es inválida, el fallback puede escoger una jugada **legal** disponible. Nunca aplicar una sugerencia ilegal sólo para mantener viva la demo.

## Cancelación y stale work

- Nueva partida, salida o unmount abortan el controller anterior e invalidan su generación.
- Un análisis de un FEN viejo no puede mover sobre una posición nueva.
- `thinking` vuelve a falso incluso en abort/error.
- Las esperas de pausa/pacing son abortables; no dejar timers/promises huérfanos tras salir.
- Error real vuelve a setup/estado recuperable; un `AbortError` esperado no se presenta como fallo de producto.

## Límites de producto

- Espectador no altera rating, historial, rivalidad, achievements o progreso salvo cambio de producto explícito.
- No introducir reglas Combat, HP, metamorfosis ni otra variante en este runner.
- Apertura/status/check/mate/tablas se derivan del mismo contrato estándar que el resto de Chess Studio.
- La velocidad de visualización cambia pacing, no el resultado legal de una posición.
- Pausar no crea un snapshot de partida persistente ni una segunda authority.

## Acceptance

Al tocar Espectador:

- test del runner con sugerencia válida;
- test de sugerencia inválida/fallo remoto → fallback legal;
- abort durante análisis y durante delay;
- nueva partida invalida la generación anterior;
- unmount/salida no deja movimientos tardíos;
- detección de terminal usa el contrato estándar;
- E2E crítico conserva setup → watching → pause/resume → final/salida sin errores ni jugadas duplicadas.
