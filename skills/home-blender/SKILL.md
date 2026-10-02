Contrato transversal de aceptación visual: `docs/operations/visual-evidence.md`.

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
8. cargar la aplicación real con GPU cuando sea posible (comandos y trampas en `skills/local-gpu-rendering/SKILL.md`);
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

## Shell global y overlays

Home 3D no posee ni puede sustituir los overlays globales de la aplicación.

- RetroPlayer, Usuarios online y cualquier overlay equivalente siguen perteneciendo al shell global y deben quedar visibles e interactivos por encima de Home.
- Canvas, hotspots, hit-areas fullscreen, transforms, filters, masks, stacking contexts u `overflow` de Home no pueden ocultarlos, recortarlos ni interceptar sus eventos.
- No arreglar solapes a base de subir `z-index` ad hoc hasta tapar otro control; la jerarquía escena < overlays globales debe ser explícita y estable.
- Home no cambia montaje, visibilidad, posición, `pointer-events` o z-index de esos controles como efecto lateral de entrar/salir.
- Teclado/foco no puede quedar secuestrado por la escena 3D ni por hotspots invisibles.
- El contrato aplica igual a desktop y móvil.

Cuando una iteración toque fullscreen/layout/stacking, la validación runtime debe abrir y operar los overlays reales —no basta con comprobar que existen en DOM— y revisar al menos un viewport desktop y uno móvil.

## Matthias diegético en Home 3D

Matthias debe sentirse **habitante de la Home canónica**, no un avatar superpuesto. La escena, cámara y composición canónicas mandan; no rediseñar la Home alrededor del personaje.

Orden recomendado de implementación:

1. de pie, leyendo informes con café;
2. atizando una chimenea;
3. sentado leyendo;
4. dormido en sofá como idle infrecuente.

Contrato visual obligatorio:

- Matthias toca físicamente el mundo: pies en suelo o cuerpo apoyado en silla/sofá, con sombras de contacto y escala coherente;
- nada de pies, manos, faldón o props atravesando geometría, ni cuerpo suspendido sobre el asiento;
- brazos y piernas siguen siendo cortos, simples y subordinados a la silueta de **peón antropomórfico**; no convertirlo en humano disfrazado;
- en poses sentadas/reclinadas, el cuerpo de peón puede usar una variante/deformación específica: es preferible adaptar el mesh a conservar un faldón rígido visualmente absurdo;
- props de acción (informes/libro, taza, atizador) deben leerse a la distancia real de la Home y estar agarrados/apoyados de forma creíble;
- Matthias recibe la misma lógica de iluminación/materiales que la sala; evitar cualquier apariencia de elemento pegado;
- no tapar hotspots, CTA principales ni overlays globales.

### Implementación runtime (actor en escena)

Con el runtime Blender listo, Matthias **no** es un retrato superpuesto: `HomeBlenderMatthiasActor.js` carga el GLB canónico dentro de la misma escena, cámara y luces de `HomeBlenderScene3D`, anclado a mobiliario real en coordenadas de mundo (marco Blender de `build_home_v2_blockout.py`):

| Rutina | Estación | Postura |
| --- | --- | --- |
| café, bocata, idle, hablando | `table-coffee` (suelo, delante de la esquina izquierda de la mesa; la derecha es del hotspot de Mazmorras) | de pie |
| expedientes | `hearth-files` (suelo, extremo izquierdo) | de pie |
| partida / emboscada | `chess-chair` (silla izquierda, mirando al tablero) | sentado |
| lectura, notas, «dormido sobre el manual» | `reading-chair` (silla izquierda) | sentado |
| dormir | `sofa-nap` (diván, cabeza en el brazo, manta de lana) | tumbado |

- El cuerpo de peón se adapta por postura (faldón corto y estrecho sentado, peón estilizado tumbado); de pie, las caderas se recogen dentro del faldón para que no quede hueco bajo la campana.
- Los brazos reales sujetan taza/libro y los props se anclan a la mano (`HOME_MATTHIAS_PROP_ANCHORS`); las «manos falsas» de los props se ocultan.
- El botón `.illustrated-home__matthias` pasa a `is-in-scene`: hit-area transparente sobre los bounds proyectados del actor; el retrato `HomeMatthias3D` sólo se monta como fallback (Home 2D, vestíbulo móvil o GLB de Matthias no disponible).
- La mitad inferior derecha de la sala (escalera) es el hit-area del hotspot de Mazmorras: ninguna estación puede proyectarse ahí, o su hotspot taparía a Matthias. El test lo fija.
- Cambiar una estación = editar `HOME_MATTHIAS_ACTOR_STATIONS` y revisar el PNG runtime; los tests de `HomeBlenderMatthiasActor.test.js` fijan holguras contra mesa, sillas, Klaus y diván.

### Loop de pose y aceptación

Para cada pose, cambiar una preocupación principal cada vez y producir al menos un PNG desde la **cámara Home canónica**. Revisar primero apoyo/escala/silueta; después materiales y microdetalle. Cuando exista consumo runtime, validar además el GLB exacto dentro de la aplicación.

Rechazar inmediatamente una iteración si Matthias flota, clippea de forma evidente, tiene escala incoherente, la acción no se entiende de un vistazo, el cuerpo sentado parece un cilindro rígido, la iluminación no pertenece a la sala o el render deja de parecer la Home canónica.

La prueba de éxito es simple: **debe parecer que Matthias vive allí**.

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

**La promoción de `home.scene.runtime` es automática** desde `home-blender-v2-runtime.yml`: al mergear a `main`, el job `build` publica el GLB, el job `gate` carga la app real (Playwright + Chromium, `e2e/home-scene-runtime-gate.spec.js`) contra ese GLB recién publicado y falla si la escena no monta con `compositor=blender-runtime`, si hay errores de consola, o si una fracción grande del frame sale casi blanca (textura horneada rota/perdida). Sólo si el gate pasa, el job `promote` commitea el manifest + el test que fija el hash y abre una PR (rama `chore/auto-promote-home-scene-runtime-<hash>`) con auto-merge activado.

Esa PR se abre con el secreto `CI_PR_BOT_PAT` (un fine-grained PAT de una cuenta real, permisos Contents+Pull requests sólo en este repo), no con el `GITHUB_TOKEN` por defecto: `main` exige PR + checks obligatorios (repository rule), y GitHub además suprime los workflows que dispararía una PR/push hecho con el `GITHUB_TOKEN` propio de un job — con un PAT normal, la PR corre los checks igual que cualquier PR humana y el auto-merge real funciona. El export de Blender **no es determinista** (dos builds del mismo commit pueden dar hashes distintos), por eso la promoción sólo puede pasar después de publicar, nunca fijarse de antemano como con los sprites deterministas de Pawn Slug.

Si esa automatización falla o se necesita promover a mano (otro asset R2 de Home, o un rollback puntual), usar `scripts/promote_home_scene_runtime.py --key ... --sha256 ... --bytes ...` con los valores exactos que publicó el job `build`, revisando antes de commitear:

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
