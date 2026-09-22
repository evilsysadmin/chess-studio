# Ownership de estado y fronteras de arquitectura

Este contrato evita que una misma verdad de producto termine implementada dos veces en capas distintas.

## Regla principal

Cada estado semántico tiene un único owner autoritativo. Otras capas pueden proyectarlo, cachearlo o renderizarlo, pero no reinterpretarlo como una segunda fuente de verdad.

Ejemplos:
- legalidad/FEN/clocks: dominio de partida, no renderer;
- posición actual de entidad Chronicles: runtime state, no spawn authored;
- gameplay Pawn Slug: Godot, no React host;
- asset activo: manifest/logical ID promovido, no “último archivo publicado”;
- comentarios/reacciones: evento real consumido, no condición recalculada en cada render;
- persistence server-owned: backend/Mongo, no localStorage como única autoridad.

## Renderer vs dominio

Un renderer puede:
- dibujar;
- mapear input a intents;
- mostrar selección/highlights derivados;
- adaptar cámara, framing, materiales y accesibilidad;
- mantener estado efímero puramente visual.

Un renderer no puede:
- decidir legalidad;
- mutar clocks/resultados por su cuenta;
- mantener un FEN/world state autoritativo paralelo;
- inventar colisiones/pathing distintos del dominio;
- producir estadísticas/coaching desde señales que sólo existen visualmente.

## Estado authored vs estado runtime

Datos authored inicializan o describen identidad/escenario. Una vez que el runtime muta una entidad, la posición/estado actual del runtime reemplaza al authored para decisiones vivas.

No volver a consultar spawn/origen como si siguiera siendo ubicación actual después de movimiento, revive, metamorfosis o progresión.

## Host vs embedded runtime

Cuando una superficie tiene runtime propio:
- el host monta, autentica, pasa configuración y recibe eventos;
- el runtime posee gameplay/interacción interna;
- no reimplementar una versión parcial en el host para “facilitar” UI;
- los bridges intercambian intents/eventos explícitos, no dumps opacos de estado si puede evitarse.

Pawn Slug es el ejemplo principal: Godot posee gameplay; React no duplica movimiento, combate o animación.

## Side effects

Side effects nacen de transiciones/eventos, no de render.

Comentarios, audio contextual, recompensas, persistencia, analytics aprobada o beats narrativos deben consumir un evento identificable/deduplicable. Rerender, F5 o remount no vuelven a disparar el mismo efecto live.

## Assets

Separar:
- authored: source/generator produjo un binario;
- published: R2 contiene ese objeto;
- promoted: manifest apunta al objeto;
- consumed: runtime real demuestra que cargó ese hash/revision.

No inferir una fase de la anterior.

## Caches y snapshots

Un cache/snapshot es aceleración o recovery, no autoridad rival.

- debe declarar de qué owner deriva;
- debe poder invalidarse/reconciliarse;
- respuestas stale no pisan estado más nuevo;
- fallback local temporal no se convierte silenciosamente en source of truth permanente.

## Refactors

Antes de añadir otro helper/state machine/resolver preguntar:
1. ¿ya existe un owner de esta verdad?
2. ¿estoy duplicando una regla para evitar atravesar una frontera?
3. ¿puedo exponer un selector/helper compartido desde el owner real?
4. ¿el nuevo código reduce o aumenta estados imposibles?

Preferir refactors que eliminan resolvers paralelos y centralizan políticas antes que añadir sincronización entre copias.

## Acceptance

Un cambio arquitectónico está listo cuando:
- cada dato mutable tiene owner claro;
- renderers/hosts no duplican reglas;
- caches tienen invalidación/reconcile;
- side effects son event-driven y deduplicables;
- tests cubren la frontera entre owner y consumidor;
- recovery/reconnect no produce dos autoridades;
- el cambio reduce, no aumenta, estados divergentes posibles.
