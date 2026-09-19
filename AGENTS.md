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
