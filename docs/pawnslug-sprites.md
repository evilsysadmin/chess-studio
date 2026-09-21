# Pawn Slug Sprite Forge

Esta es la especificación canónica de authoring, validación y promoción de sprites 2D de Pawn Slug.

El objetivo no es conseguir que un generador produzca arte perfecto a la primera. El objetivo operativo es **cero frames incorrectos aceptados silenciosamente**. Toda imagen generada es un candidato hasta demostrar el contrato completo.

## 1. Autoridad y límites

- Pawn Slug runtime art es 2D puro. No usar Blender para generar sprites runtime.
- El master/worksheet aprobado conserva la autoridad visual. La generación no rediseña un personaje ya aceptado.
- El source autoritativo de authoring es atómico por frame: `actor/weapon/animation/frame.png`.
- Un spritesheet, contact sheet o worksheet generado por IA es material de entrada o revisión; nunca source runtime directo.
- Si sólo falla un frame, se regenera o corrige ese frame. No rehacer una animación completa salvo que el defecto sea sistémico.

## 2. Estados fail-closed

Cada frame atraviesa estados explícitos:

`generated -> quarantined -> validated -> reviewed -> accepted`

`accepted` exige validación estructural, geométrica, temporal y visual. Un PASS queda ligado al SHA-256 del frame; cualquier cambio invalida el PASS.

`retained-reviewed` sólo puede significar revisión humana explícita del mismo hash. Heredar una fila histórica no la convierte automáticamente en revisada.

## 3. Cuarentena raw

Antes de escalar, alinear, recortar o componer, cada candidato se valida en su forma raw.

Debe fallar ante:

- canvas o alpha incompatibles;
- contenido recortado por el borde;
- fondos residuales;
- texto, numeración, etiquetas o decoración de worksheet;
- componentes opacos huérfanos no permitidos por la animación;
- armas, manos, extremidades o volúmenes duplicados;
- frames vacíos o inesperadamente duplicados.

El incidente conocido de numeración `0..7` bajo Matthias durante la carrera debe existir como fixture permanente: una secuencia con dígitos opacos desconectados debe ser rechazada antes de normalización.

Las excepciones a componentes separados son data-driven por animación, por ejemplo muzzle flash o casquillo en una pose de disparo. Una excepción nunca es global.

## 4. Normalización multi-ancla

No usar una sola heurística como autoridad de escala o posición. La transformación se acepta sólo cuando existe consenso razonable entre señales como:

- footline;
- bounding box / silhouette envelope;
- centro de masa alpha;
- altura corporal;
- anchors de cabeza/torso cuando sean confiables;
- referencia canónica de la pose o familia.

Si las señales proponen transformaciones incompatibles, el frame falla. Nunca escoger silenciosamente la heurística que permita continuar.

Antes de componer, calcular el bbox transformado y exigir que quepa dentro del safe envelope. El normalizador no puede recortar botas, casco, arma o FX sin fallar.

## 5. QA geométrica

Por frame y por animación medir como mínimo:

- footline y pivote;
- centro de masa;
- bbox y margen de seguridad;
- altura/anchura percibida;
- escala relativa al canon;
- componentes conectados y distancia de huérfanos;
- footprint de arma/manos cuando aplique.

Los thresholds pertenecen al contrato de actor/animación, no a constantes duplicadas en packers versionados.

## 6. QA temporal

Una animación es una serie, no una colección de PNG independientes. Analizar cada transición `n -> n+1` para detectar:

- jitter de footline/pivote/centro de masa;
- saltos de escala o volumen;
- cambios de silueta incompatibles con la acción;
- duplicados accidentales;
- discontinuidades excesivas;
- drift o teleport de arma/manos;
- cambios de iluminación o perspectiva que rompan continuidad.

Los perfiles varían por animación: `idle` debe ser muy estable; `hurt` o `die` permiten cambios mayores.

## 7. Contrato data-driven único

Celda, grid, anchors, animaciones, FPS, loop, frame counts, authored frame counts, holds, safe envelope, excepciones y quality contract viven en un único schema versionado.

Distinguir siempre:

- `stored_frames`: slots físicos consumibles;
- `authored_frames`: poses realmente distintas creadas;
- `holds`: repetición deliberada de una pose.

No volver a codificar esas diferencias de forma implícita en el nombre del packer.

## 8. Compiler único

La dirección final es un único entrypoint:

`python scripts/art/sprite_forge.py build <actor> <weapon>`

Responsabilidades:

1. leer contrato + frames accepted;
2. verificar hashes y provenance;
3. normalizar determinísticamente;
4. ejecutar QA estructural/geométrica/temporal;
5. construir atlas/parts;
6. emitir manifest runtime completo;
7. emitir hashes;
8. generar artifacts de revisión.

Mismo input + mismo toolchain fijado = mismo output byte a byte. La versión pertenece al manifest/quality contract, no a scripts `pack_*_vNN.py` nuevos.

## 9. Manifest runtime

Debe describir al menos:

- actor y weapon/loadout;
- quality contract version;
- hashes de source frames;
- provenance;
- atlas/parts y SHA-256;
- cell/grid/padding/pivot/footline;
- animaciones, regions, frame order, FPS y loop;
- stored/authored frames y holds;
- logical IDs estables;
- resultados de gates relevantes.

Godot consume animaciones y manifest. No debe necesitar conocer nombres históricos como `strictV23`, `run13V23` o URLs versionadas hardcodeadas.

## 10. Review artifacts

Cada cambio visual produce:

- contact strip por animación;
- overview completo;
- debug overlay con bbox, anchors, footline, centroid, safe envelope y orphan components;
- captura runtime a escala real;
- cuando corresponda, preview animada/transiciones.

Las etiquetas viven fuera de las celdas runtime. Nunca introducir números o texto dentro del área que pueda terminar empaquetada.

La revisión visual cubre el 100% de frames modificados y, en rebuilds completos, el 100% del banco.

## 11. Godot y runtime

Tras los gates offline:

`accepted frames -> deterministic build -> PNG/manifest gates -> Godot headless -> SpriteFrames/AtlasTexture -> runtime capture -> visual review`

Una validación de slicing no sustituye captura real. Revisar al menos idle, locomoción, run+fire, jump/fall, crouch, hurt, die y transiciones/armas afectadas.

Los banks necesarios de Matthias se preparan al bootstrap de Pawn Slug; cambiar de arma en gameplay debe ser un swap de recursos ya listos, no una descarga/decode/repack.

## 12. CI y publicación

CI verifica; no hace authoring creativo.

En PR:

- reconstruir desde inputs/hashes declarados;
- ejecutar todos los gates;
- Godot headless;
- publicar artifacts de revisión;
- **no publicar assets runtime a R2**.

Tras merge a `main`:

- reconstruir desde los mismos hashes;
- verificar identidad;
- publicar objetos R2 inmutables/content-addressed;
- actualizar logical manifest estable;
- smoke de CDN/runtime/staging.

## 13. Migración desde la pipeline histórica

La migración se hace por cortes pequeños y reversibles:

1. core/schema/contrato Sprite Forge sin cambio visual;
2. cuarentena + orphan/text/number detection + fixture `0..7`;
3. migrar SMG v23 y su run de alta fidelidad;
4. migrar P99/SMG/shotgun/panzerfaust y bootstrap;
5. retirar del camino activo la arqueología `v17..v23`; después aplicar el mismo contrato a enemigos.

Los scripts históricos pueden permanecer temporalmente como fixtures/migradores, pero dejan de ser autoridades paralelas.

## 14. Gate de aceptación

Un asset no se promociona si falta cualquiera de estas pruebas:

- canon preservado;
- raw lint limpio;
- geometría dentro de contrato;
- continuidad temporal válida;
- arma/manos coherentes;
- atlas/manifest deterministas;
- PNG contract limpio;
- Godot headless verde;
- review visual registrada contra hashes;
- runtime capture sin regresión;
- publicación/staging verificados cuando corresponda.

Cuando un gate no puede decidir con seguridad, falla cerrado. La velocidad de generación es secundaria frente a la precisión de aceptación.
