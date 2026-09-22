# Presence / Admin — contrato operativo

Este documento fija el contrato de presencia de Chess Studio. Presencia es una señal gruesa de disponibilidad/área actual, no telemetría de comportamiento fino.

## Cadencia

El contrato actual usa:

- heartbeat de cliente autenticado: **120 s** mientras corresponde reportar;
- cambios de visibilidad pueden emitir una actualización adicional;
- Admin puede refrescar su lectura cada **30 s** cuando la pestaña Admin está visible;
- aumentar la frecuencia de lectura de Admin **no** autoriza aumentar la frecuencia de escritura de todos los clientes.

Si cambian estas constantes, actualizar tests y este documento en la misma PR.

## Sesiones y lifecycle

- Cada pestaña/documento autenticado mantiene una identidad de presencia propia; no compartir una única session id entre pestañas.
- Una pestaña clonada/reload no debe adoptar ciegamente una identidad copiada desde otro documento.
- Login explícito rota/inicializa la sesión de presencia.
- Logout intenta cerrar su sesión de presencia, pero un backend caído no puede impedir cerrar sesión; el TTL es el fallback.
- En pagehide/F5, rotar la identidad antes de enviar el cierre del documento viejo evita que una request retrasada apague el documento nuevo.
- Múltiples pestañas de la misma cuenta se agregan como presencia de usuario sin hacer que el cierre de una desconecte las demás.

## Foreground y aging

El estado foreground/background es aproximado, nunca una afirmación de tiempo real.

- `foreground_updated_at` + `is_foreground` sólo se consideran frescos durante **150 s**.
- Pasado ese TTL, foreground se vuelve **desconocido**, no se inventa `background`.
- Presencia derivada por edad:
  - `online`: hasta 150 s;
  - `idle`: >150 s y hasta 5 min;
  - `recent`: >5 min y hasta 15 min;
  - `offline`: >15 min o cierre explícito válido.
- Un activity label viejo no debe mostrarse como actividad actual cuando la presencia ya está stale/offline.

## Payload permitido

El heartbeat puede transportar únicamente información gruesa ya aprobada:

- actividad/área general sanitizada, por ejemplo Home, Combat Chess, Torneo, Así juegas;
- foreground boolean;
- release/frontend version informativa;
- timestamp/identidad técnica necesaria para aging y multi-tab.

No añadir al heartbeat/presencia:

- FEN, jugadas o contenido de partida;
- texto de chat/comentarios;
- clicks, scroll, ratón, teclado o coordenadas;
- rutas sensibles, payloads privados o contenido de formularios;
- tokens, secretos, headers de autorización;
- polling de alta frecuencia para fabricar sensación de tiempo real.

## Admin

- Admin puede derivar filtros/contadores desde la foto de presencia existente sin pedir más telemetría al cliente.
- El admin actual se excluye de los contadores públicos/operativos cuando así lo establezca el contrato de UI.
- Clasificación de release del cliente es informativa; no convierte una versión distinta en error de usuario.
- Respuestas Admin stale/out-of-order no deben pisar una lectura/mutación más nueva.
- La autorización Admin se valida en servidor. Ocultar controles en frontend no concede ni retira permisos.

## Acceptance

Al tocar presencia/admin:

- prueba multi-tab y cierre de una sola pestaña;
- prueba login/logout/reload/pagehide;
- prueba aging en valores no fronterizos para evitar tests dependientes del reloj;
- prueba foreground stale → unknown;
- conserva la cadencia de cliente salvo cambio deliberado;
- verifica que no se amplió el payload con telemetría fina;
- mobile/background/suspensión deben degradar a estado desconocido/stale, no a una mentira precisa.
