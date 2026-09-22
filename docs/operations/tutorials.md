# Tutoriales de mecánicas no estándar — contrato transversal

Chess Studio enseña cualquier mecánica que no sea ajedrez estándar mediante tutorial contextual. El objetivo es que la profundidad no dependa de que el jugador haya leído documentación externa.

## Qué necesita tutorial

Toda mecánica/modo que cambie expectativas del ajedrez normal, por ejemplo:
- Combat Chess: HP de boss, revive/Memorial, metamorfosis, deployment, intel, ranks;
- War Room: interacción 3D/selección/movimiento/inspección;
- Chronicles/Tactics: controles, turnos, habilidades, mapa/progresión propia;
- modos/contratos especiales que introduzcan reglas o estados no obvios.

No hace falta tutorial para reglas estándar de ajedrez salvo que la UI de interacción sea distinta.

## Formato

- contextual: aparece donde se usa la mecánica;
- breve: enseña la decisión necesaria ahora;
- skippable desde el primer momento;
- reabrible desde Help/tutoriales de la superficie correspondiente;
- progressive disclosure: no descargar todo el manual al entrar;
- mouse, touch y teclado/focus cuando la superficie soporte esos inputs;
- reduced-motion compatible.

## Autoridad

Un tutorial nunca implementa una segunda versión de las reglas.

- destinos legales vienen del motor/estado real;
- constraints de deployment vienen del dominio real;
- costes de intel/revive vienen del estado real;
- objetivos/progreso vienen del runtime real.

El tutorial observa y guía; no falsifica estado para que el paso encaje.

## Persistencia

- first-run/completado/skipped se persiste por usuario/superficie con schema versionado cuando deba sobrevivir sesión.
- F5/remount no reinicia un tutorial completado ni duplica recompensas/efectos.
- Reabrir desde Help inicia una sesión tutorial explícita sin borrar progreso real.
- Un cambio sustancial de mecánica puede bump-ear la versión y volver a ofrecer el tutorial de forma deliberada.

## Narrador diegético

Cuando Matthias sea el guía establecido de una superficie, el tutorial usa su voz/identidad en vez de un narrador genérico paralelo.

El tono nunca debe entorpecer la instrucción: primero acción clara, después carácter.

## UX

- Señalar visualmente el objeto/casilla/control real que hay que usar.
- Evitar modales gigantes si la acción puede explicarse inline/diegéticamente.
- El jugador debe poder continuar jugando tras skip sin quedar en estado parcial.
- Cerrar/completar limpia overlays, highlights y estado efímero del tutorial.
- No bloquear una partida existente con onboarding no solicitado si el usuario ya está reanudando progreso.

## Acceptance

Para una mecánica no estándar nueva:
- tutorial first-run o explicación contextual equivalente;
- skip funcional;
- replay desde Help;
- F5/remount estable;
- inputs relevantes cubiertos;
- tutorial consume reglas reales;
- no deja estado efímero residual;
- test al menos del camino completar + skip/reabrir.
