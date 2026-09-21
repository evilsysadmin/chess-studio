# Home 3D — contrato de composición y overlays globales

Este documento es el contrato canónico de integración de **Home 3D** con el shell global de Chess Studio. Cualquier iteración visual, Blender, canvas/WebGL, layout responsive o refactor de Home debe respetarlo.

## Regla no negociable

Home 3D **no posee** ni puede sustituir, ocultar, recortar, tapar o inutilizar los overlays globales de la aplicación.

En particular, mientras Home 3D esté activa deben seguir visibles y plenamente interactivos:

- los controles de **RetroPlayer**;
- el acceso, panel y/o modal de **Usuarios online**;
- cualquier otro overlay global equivalente que viva en el shell de aplicación.

Si una iteración de Home 3D hace desaparecer uno de estos elementos o impide usarlo, la iteración está rota aunque la escena 3D renderice correctamente.

## Contrato de capas

- Home 3D debe vivir **por debajo** de la capa de overlays globales.
- Los overlays globales deben renderizarse fuera de cualquier subtree con transformaciones 3D/canvas que cree un stacking context capaz de encerrarlos.
- Un canvas, backdrop, hotspot, hit-area o contenedor fullscreen de Home 3D no puede interceptar eventos de puntero destinados a RetroPlayer o Usuarios online.
- No se permite arreglar un solape subiendo z-index de forma ad hoc hasta tapar otro control. La jerarquía de capas debe ser deliberada y estable.
- `overflow: hidden`, masks, transforms, filters, opacity u otras propiedades de Home 3D no pueden recortar los overlays globales.
- Home 3D no debe cambiar la visibilidad, montaje, posición, `pointer-events` o z-index de RetroPlayer/Usuarios online como efecto lateral de entrar o salir de la Home.

## Responsive y accesibilidad

El contrato aplica por igual a desktop y móvil:

- RetroPlayer debe permanecer accesible en los tamaños soportados.
- Usuarios online debe poder abrirse, cerrarse y operarse sin quedar por debajo de la escena.
- El orden de foco por teclado no debe quedar secuestrado por la capa 3D.
- Los hotspots diegéticos de Home no pueden ocupar de forma invisible el área interactiva de los overlays globales.

## Gate de regresión obligatorio

Antes de aceptar una iteración relevante de Home 3D:

1. cargar la Home runtime real, no sólo el render Blender;
2. verificar visualmente que RetroPlayer está presente;
3. abrir Usuarios online y comprobar que el modal queda por encima de Home 3D;
4. comprobar interacción real de ambos con ratón/touch y teclado cuando aplique;
5. revisar al menos un viewport desktop y uno móvil soportado;
6. capturar/revisar PNG runtime cuando la pipeline visual de la iteración ya produzca artefactos de validación.

Este comportamiento debe quedar cubierto por smoke/E2E cuando se toque la composición, stacking, shell o fullscreen de Home 3D. Un test que sólo compruebe que el canvas existe no cubre este contrato.

## Ownership

Home 3D controla su escena, cámara, hotspots y presentación diegética. El shell global controla RetroPlayer, Usuarios online y overlays equivalentes.

**Nunca mover ownership de esos controles dentro de Home 3D para resolver un problema visual.** La solución debe preservar la separación entre escena y shell.
