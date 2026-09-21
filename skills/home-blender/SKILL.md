# Home Blender — skill de iteración y entrega

Este skill define cómo iterar la Home 3D desde Blender hasta el runtime real. La Home no se acepta por un render aislado: el contrato completo es **Blender → GLB → R2 → manifest → aplicación → PNG runtime**.

## Fuente y alcance

- La escena se genera desde la pipeline/script Blender versionado; preferir cambios reproducibles frente a retoques manuales irrepetibles.
- Home visual y Home runtime son dos capas distintas. Three.js puede alterar nombres, materiales, exposición, tone mapping, pivotes o comportamiento animado.
- Mantener la dirección del lenguaje visual y el progressive disclosure; no convertir la Home en un dashboard de props.

## Loop obligatorio

1. partir del último baseline visual aceptado;
2. modificar una preocupación visual coherente;
3. renderizar la escena completa y los recortes relevantes;
4. revisar PNG antes/después;
5. exportar el GLB runtime;
6. publicar el binario inmutable en R2;
7. promover el logical ID sólo cuando ese objeto haya sido validado;
8. cargar la aplicación real con GPU cuando sea posible;
9. generar PNG runtime desktop y móvil si cambia encuadre/composición;
10. corregir diferencias antes de cerrar.

El render de Blender **no demuestra** que el runtime cargue la misma escena ni que se vea igual.

## Evidencia visual

Eevee puede presentar pequeñas diferencias entre renders equivalentes; no usar un diff global pixel-perfect como única verdad cuando el renderer no sea determinista.

Preferir:

- comparación visual del frame completo;
- recortes de la zona realmente modificada;
- métricas de luma/contraste sólo como apoyo;
- capturas reales de Chromium/Three.js.

Una mejora local no debe lavar el tablero, cambiar sus colores ni destruir la jerarquía global.

## GLTF / runtime traps

Revisar explícitamente:

- nombres de nodos saneados por GLTFLoader;
- pivotes/orígenes de objetos animados;
- texturas embebidas y CSP necesaria para `blob:`;
- emissive/tone mapping: una llama correcta en Blender puede blanquearse/desaturarse en runtime;
- objetos que caen a fallback estático por no encontrar el nodo esperado;
- materiales PBR que se vuelven demasiado oscuros o plásticos bajo las luces reales.

Para geometría animada (llamas, telas u objetos diegéticos), el pivote debe estar donde la animación lo necesita en el GLB futuro. Un workaround runtime sólo se conserva como compatibilidad con assets ya publicados, no como excusa para seguir exportando mal.

## Rendimiento

No mantener la sala renderizando continuamente sólo porque haya una animación pequeña.

- Sombras estáticas caras deben recalcularse sólo cuando sea necesario.
- Respetar `prefers-reduced-motion`.
- Pausar trabajo animado cuando la pestaña esté oculta.
- Detectar software rendering/SwiftShader y degradar o apagar FX no esenciales.
- Un presupuesto adaptativo debe observar coste/cadencia real, no asumir que `requestAnimationFrame` implica GPU saludable.
- Medir el runtime real; los tiempos de Playwright y navegador son una señal de regresión aunque Blender renderice bien.

## R2 y promoción

La Home carga `home.scene.runtime` por manifest/hash. Un GLB nuevo publicado no llega a usuarios hasta que el manifest se promociona.

Antes de promover:

- objeto R2 existente;
- tamaño esperado;
- SHA-256 verificado;
- manifest cambia sólo lo previsto;
- integridad/test del logical ID actualizado;
- captura runtime posterior.

Mantener el objeto anterior permite rollback inmediato.

## Acceptance gate

Una iteración Home está terminada cuando:

- Blender genera/renderiza sin error;
- PNG/recortes fueron revisados;
- GLB runtime carga en la app real;
- el logical ID apunta al hash correcto si hubo promoción;
- no hay texturas blancas/missing, pivotes rotos ni fallback accidental;
- desktop y móvil siguen legibles;
- rendimiento y reduced-motion no empeoran;
- la mejora se ve en runtime, no sólo en Blender.
