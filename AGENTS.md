** FLUJO GLOBAL DE PULL REQUESTS

- Toda PR nueva debe abrirse inicialmente en **Draft**.
- No marcar una PR como **Ready for review** mientras haya checks requeridos pendientes, cancelados o en rojo.
- Iterar y corregir la misma PR mientras CI esté fallando; no abrir una PR nueva para esquivar un fallo.
- Cuando una PR Draft queda funcionalmente terminada y sus checks están corriendo, **no quedarse esperando GitHub Actions**: buscar e iterar otra tarea pendiente, relacionada o naturalmente contigua al trabajo recién hecho, preferiblemente en una segunda PR también abierta como Draft.
- Mientras esa segunda PR se prepara, dejar que la primera siga ejecutando CI en paralelo. El objetivo es solapar trabajo útil con las esperas de GitHub y evitar tiempo muerto.
- Sólo cuando la segunda PR haya quedado también funcionalmente lista en Draft y con sus propios checks en marcha, volver a revisar la(s) PR(s) Draft anteriores.
- Este patrón puede encadenarse hasta un máximo de **5 PRs por chat** en rotación simultánea. No abrir una sexta PR en el mismo chat mientras sigan ocupados esos cinco huecos.
- Al alcanzar 5 PRs, hacer una pasada obligatoria sobre las anteriores: pasar a **Ready for review** las que tengan todos los required checks verdes, corregir las que estén rojas y mantener en Draft las que sigan pendientes. Sólo cuando se libere al menos un hueco se abre otra PR.
- Para cada PR anterior: si todos sus required checks están verdes, cambiarla a **Ready for review**; si alguno sigue pendiente o rojo, mantenerla en Draft y continuar iterando trabajo útil sin bloquearse esperando.
- Cuando todos los required checks de una PR estén verdes, cambiarla a **Ready for review**.
- Sólo después de estar en Ready for review debe permitirse que GitHub complete el **automerge**; comprobar que automerge está habilitado y dejar que fusione cuando cumpla las protecciones de rama.
- El objetivo de este orden es impedir merges prematuros mientras aún se están empujando fixes o mientras CI sigue ejecutándose, y a la vez aprovechar las esperas para avanzar trabajo relacionado.
- Tras el merge, revisar los workflows posteriores relevantes (main admission, deploy, staging/live checks, etc.) y corregir cualquier fallo derivado antes de dar la iteración por cerrada.

** ITERACON DE SPRITES DE PAWN SLUG 
 
Itera los sprites en Pawn Slug Godot hasta tener la siguiente generación de spritesheet deployada en staging, validada sin regresiones y con mejora visual y funcional clara.

Contexto de proyecto:
- Pawn Slug Godot es pure 2D.
- No usar Blender para sprites.
- Blender queda reservado para Home 3D y War Room v2.
- Para Pawn Slug, la pipeline correcta de Matthias es:
  image_gen → frames 2D → montaje/normalización por script → spritesheet/atlas PNG → Godot.

Objetivo:
Generar una nueva iteración seria, consistente y utilizable en runtime, apta para importación y animación en Godot, preservando continuidad visual y mejorando calidad sin romper nada.

Restricciones visuales obligatorias:
- han de respetar el peon matthias canonico
- mismo tamaño visual corporal
- misma línea de pies
- mismo pivote
- mismas proporciones
- locomoción estable
- pose de pistola por defecto consistente
- continuidad entre frames
- lectura clara de silueta
- consistencia de volumen, extremidades y arma entre animaciones

Cobertura mínima obligatoria:
- todas las poses relevantes
- todas las armas soportadas
- disparo horizontal
- disparo arriba
- disparo abajo
- disparo diagonal arriba
- disparo diagonal abajo
- crouch fire
- mínimo 8 frames por pose cuando aplique

Reglas de pipeline:
- image_gen se usa solo para producir frames 2D
- no usar el generador para fabricar una composición final “artística” difícil de trocear
- el montaje final del atlas debe hacerse por script
- el script debe fijar estrictamente:
  - canvas consistente por frame
  - pivote consistente
  - línea de pies consistente
  - escala corporal consistente
  - transparencia correcta
  - separación entre frames consistente
  - layout del atlas determinista
  - atlas/spritesheet PNG compatible con Godot

Compatibilidad Godot requerida:
- frames alineados a rejilla clara
- sin recortes accidentales
- sin jitter de pies
- sin cambio de escala entre frames
- sin desplazamientos arbitrarios del arma o del cuerpo
- atlas fácil de consumir por AnimatedSprite2D / SpriteFrames / slicing equivalente

Proceso de iteración:
1. Generar nueva tanda de frames 2D
2. Montar/normalizar por script
3. Producir artifact PNG
4. Revisar visualmente el artifact
5. Comparar con la iteración anterior
6. Detectar regresiones visuales o funcionales
7. Corregir e iterar. Guarda en cache de proyecto el ultimo worksheet validado, por si se cuelga el chat, poder continuar desde ahi
8. Dejar la mejor versión deployada en staging

Criterios de aceptación:
- mejora visual clara
- continuidad de animación mejor o igual
- cobertura completa exigida
- mínimo 8 frames por pose cuando aplique
- sin regresiones
- compatibilidad real con Godot
- artifact PNG validado
- staging validado

Modo de trabajo:
- iterar PR a PR sin pedir input salvo bloqueo real
- no esperes a que acaben los workflows de la PR/merge. Acabas pr y sigues con otra cosa. y cuando vayas a psuhear nueva pr ,
- revisas el estado de la anterior PR
- revisar los PNG artifacts en cada tanda
- comparar siempre contra el baseline/canónico
- priorizar estabilidad, claridad y compatibilidad antes que florituras

Stack visual aprobada para esta iteración:
- Image Generation con referencia canónica se usa únicamente para producir frames 2D aislados.
- Krita o Aseprite solo se usan para retoques puntuales de frames, nunca para montar el atlas final.
- Python + Pillow, NumPy y OpenCV hacen recorte, transparencia, normalización, validación y montaje determinista.
- ImageMagick se usa para inspección de dimensiones, alpha y hashes.
- Godot 4 headless valida AnimatedSprite2D, SpriteFrames y consumo real del atlas.
- GitHub Actions ejecuta los gates, artefactos de revisión y smoke tests.
- Cloudflare R2 se publica con scripts/r2_asset_publisher.py y versionado inmutable.
- Playwright valida la captura visual del juego desplegado en staging.
- Blender está prohibido para sprites de Pawn Slug; queda reservado para Home 3D y War Room v2.

Tooling de compatibilidad Godot:
- Entorno local: ejecutar los scripts de arte con `.venv/bin/python` (versiones fijadas de scripts/art/requirements.txt más `pytest`; el Python del sistema tiene otra versión de NumPy). Godot 4.7.2 está en `.godot-ci/4.7.2/godot` (misma versión y sha256 que CI, ignorado por git). oxipng por dnf y Krita por Flatpak de usuario (`flatpak run org.kde.krita`). Aseprite no está instalado (licencia de pago y compilación desde fuente); es opcional. No dar por validado lo que no se ha podido ejecutar.
- Aseprite CLI (`aseprite -b`), si está disponible, solo para retoques puntuales y para exportar tags/frames como referencia; nunca monta el atlas final.
- Prohibidos los packers de empaquetado libre (TexturePacker, Free Texture Packer, etc.): el layout es rejilla fija y determinista, emitida por nuestro packer.
- Formato del PNG: RGBA de 8 bits, alpha recta (sin premultiplicar), sin perfil `iCCP`, gamma ni cambios de color. El RGB bajo píxeles con alpha=0 debe ser limpio (sin halos). Ancho y alto ≤ 16384 px (límite duro por textura en el export web). Los atlas actuales miden 3328x7488 (Matthias) y 1024x14976 (enemigos), así que superan 4096 y 8192; en GPU móvil con límite de 4096 o 8192 fallarían, y si eso aparece hay que partir el atlas por filas de animación.
- Celdas de tamaño fijo, con margen transparente entre frames para que el filtrado no sangre entre celdas.
- Manifest JSON determinista junto al atlas (celda, columnas, filas, pivote, línea de pies, frames por animación y sha256 del PNG). Godot y los validadores consumen ese manifest; no se hardcodean regiones en GDScript.
- Import en Godot: `compress/mode=0` (lossless), `mipmaps/generate=false` y `fix_alpha_border=true`, sin premultiplicar. El juego dibuja los sprites con filtro `linear` (`TEXTURE_FILTER_LINEAR`), porque las celdas son hi-res reducidas; por eso el margen transparente entre celdas es obligatorio. No cambiar a `nearest` sin rehacer la comparación visual.
- Godot headless (`--headless --import`) carga el atlas, construye `SpriteFrames`/`AtlasTexture` y comprueba que cada `region` coincide con el manifest y cabe dentro del PNG. Tests en games/pawn-slug-godot/tests/.
- Validadores actuales: scripts/art/validate_pawn_slug_godot_atlas_v10.py (Matthias) y scripts/art/validate_pawn_slug_enemy_v2.py (enemigos). Los dos usan scripts/art/png_contract.py (solo Pillow, porque el CI de arte solo instala Pillow), que exige PNG RGBA sin entrelazar, sin chunks de color (`iCCP`, `gAMA`, `sRGB`, `cHRM`), sin RGB bajo alpha=0 y con lado ≤ 16384 px. Sus tests están en scripts/art/test_png_contract.py (`.venv/bin/python -m pytest scripts/art`). El margen entre celdas lo aplica el chequeo de desborde de celda de cada validador (2 px por lado).
- `oxipng` (sin pérdida) se permite para optimizar el PNG final, siempre antes de calcular el sha256 publicado. `pngquant` queda prohibido porque cuantiza y rompe la paleta.
- Pillow, NumPy y OpenCV se ejecutan con versiones fijadas y sin aleatoriedad, para que el mismo input produzca el mismo PNG byte a byte.

Workflows de CI de sprites (v6, v9, v10, godot-web, sprite-smoke y los de Blender de Pawn Slug):
- No borrar ni "limpiar" estos workflows aunque la generación se haga en local con el CLI de Claude. Se conservan como respaldo para cuando no haya tokens de Claude y la iteración pase al chat de GPT, que casi no tiene ancho de banda con el conector git y necesita que CI monte, valide y publique el artefacto.
- Los packers y validadores deben seguir siendo ejecutables por CI sin pasos manuales, y sus dependencias (solo Pillow en el CI de arte, salvo donde el job instale más) deben instalarse dentro del propio workflow.

Contrato adicional de enemigos:
- Las variantes militares deben mantener una familia visual común con Matthias: paleta, contraste, línea de pies, pivote y escala de celda estables.
- Cada tipo puede tener silueta, protección, casco y arma propios, pero no puede depender de un fondo vectorial para comunicar su identidad principal.
- El atlas enemigo se genera desde frames 2D y un packer; no se aceptan composiciones finales generadas manualmente.
- El worksheet validado de enemigos se conserva dentro de games/pawn-slug-godot/art/ para reanudar la iteración.
- Si trabajas en local y tienes buen hardware, puedes generar sprites y blender artifacts, pero ojo con saturar la cpu/gpu

** WAR ROOM V2 — CONTRATO DE ITERACION VISUAL Y RUNTIME

Contexto y fuente canónica:
- War Room v2 es la nueva generación visual de la War Room y su pipeline visual canónica es Blender.
- Blender está reservado para Home 3D y War Room v2; no reutilizar esta pipeline para sprites 2D de Pawn Slug.
- La War Room actual se conserva como baseline funcional y visual de rollback hasta que War Room v2 esté validada de extremo a extremo.
- No eliminar, sobrescribir de forma irreversible ni hacer depender el rollback de assets exclusivos de v2 antes de completar la validación.

Objetivo de cada iteración:
- mejorar de forma visible materiales, iluminación, composición, escala, profundidad, legibilidad del tablero y coherencia del espacio
- evitar el aspecto artificial/plástico o de maqueta generado por geometría, iluminación o materiales demasiado uniformes
- mantener la War Room reconocible, premium, sobria y jugable; la mejora visual nunca justifica degradar lectura o interacción

Pipeline obligatoria:
1. Trabajar en la escena/pipeline Blender reproducible existente; preferir scripts y generación determinista frente a retoques manuales irrepetibles.
2. Renderizar la iteración desde las cámaras y encuadres reales objetivo.
3. Generar artifacts PNG de revisión para cada iteración visual relevante.
4. Revisar visualmente los PNG antes de integrar o dar por buena la iteración.
5. Comparar contra el último artifact validado y contra la War Room baseline para detectar regresiones.
6. Corregir iluminación, materiales, clipping, escalas, perspectiva, composición y legibilidad antes de pasar a runtime.
7. Integrar en la app y validar de nuevo con captura real del frontend; un render correcto en Blender no demuestra por sí solo que la War Room funciona bien en runtime.
8. Validar en staging antes de considerar v2 apta para sustituir a la War Room actual.

Validación visual mínima:
- revisar al menos composición desktop y móvil cuando el cambio pueda afectar encuadre o responsive
- tablero y piezas deben seguir siendo el foco jugable y conservar contraste suficiente
- evitar clipping, z-fighting, objetos flotantes, escalas incoherentes, sombras rotas, texturas estiradas, ruido visual y zonas quemadas u oscuras
- comprobar consistencia de materiales y luz entre objetos; no aceptar superficies con apariencia de plástico genérico salvo decisión artística explícita
- mantener profundidad y atmósfera sin sacrificar la lectura de piezas, casillas, overlays o interacciones
- cualquier cambio visual debe poder justificarse comparando artifacts PNG antes/después

Contrato funcional y de integración:
- War Room v2 debe preservar las capacidades funcionales de la War Room actual mientras se sustituye la presentación visual.
- No romper selección de piezas, destinos legales, movimientos, cámaras, overlays, diálogos, comentarios de Matthias, secuencias diegéticas ni controles existentes por introducir la nueva escena.
- La integración debe ser incremental y reversible; si v2 falla visualmente, en móvil, rendimiento o funcionamiento real, restaurar el baseline sin reconstrucciones de emergencia.
- El tutorial de primera entrada de War Room debe seguir siendo diegético y estar guiado por Matthias: selección de pieza, visualización de destinos legales y uno o dos movimientos guiados, conciso, skippable y recuperable desde ayuda.
- Las secuencias ambientales, incluido Hans, deben dispararse sólo cuando la War Room esté realmente cargada y visible para evitar perder frames o diálogo durante renders/cargas tardías.

Artifacts y regresión:
- conservar el último render/worksheet visual validado en cache de proyecto para poder reanudar tras cortes del chat
- cada PR visual relevante debe producir o enlazar artifacts PNG suficientes para revisar la iteración
- revisar esos artifacts y no basarse únicamente en que Blender, CI o el build hayan terminado correctamente
- cuando exista captura de runtime, compararla también con el render de Blender para detectar diferencias de framing, escalado, overlays o carga

Rendimiento y seguridad de trabajo:
- no saturar CPU/GPU local con renders innecesariamente caros; usar previews razonables durante iteración y calidad final para el gate visual
- no introducir assets pesados o duplicados sin necesidad; mantener reproducibilidad y trazabilidad de la pipeline
- no degradar tiempos de carga, memoria o fluidez de la War Room sin medirlo y justificarlo

Criterios de aceptación de War Room v2:
- mejora visual clara frente al baseline
- artifacts PNG revisados sin regresiones obvias
- captura/runtime real validado
- desktop y móvil razonables
- interacción ajedrecística intacta
- rendimiento aceptable
- rollback a la War Room anterior sigue siendo posible
- staging validado antes de retirar el baseline

