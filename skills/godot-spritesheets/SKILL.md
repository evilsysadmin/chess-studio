# Godot 2D spritesheets — canonical skill

Este documento es el contrato operativo para **generar, completar, normalizar, validar e integrar sprites y spritesheets 2D de Pawn Slug en Godot**.

Se aplica a Matthias, enemigos y cualquier nuevo actor animado que use la misma pipeline. Es obligatorio leer también [`scripts/art/README.md`](../../scripts/art/README.md) y, cuando el resultado se publique por CDN, [`docs/visual-assets-r2-flow.md`](../../docs/visual-assets-r2-flow.md).

## 1. Principio rector

El objetivo no es producir una imagen bonita. El objetivo es producir una **secuencia animable estable y determinista que Godot pueda consumir sin sorpresas**.

Pipeline canónica:

`master/worksheet aprobado → frames 2D → normalización por script → atlas PNG + manifest → validadores → Godot headless → artifact PNG/contact sheet → revisión visual → runtime/staging`

Pawn Slug es **2D puro**:

- no usar Blender para sprites;
- Blender queda reservado para Home 3D y War Room v2;
- no montar el atlas final manualmente en Krita/Aseprite;
- no usar packers libres que reordenen o compacten celdas de forma no determinista.

## 2. Autoridad visual y generación

### 2.1. Preservar el canon

- El master/worksheet aprobado es la autoridad visual.
- No rediseñar un personaje aprobado para “mejorarlo” durante una iteración técnica.
- Si existe un frame bueno, reutilizarlo; no regenerarlo porque sí.
- Si sólo faltan algunos frames, generar **únicamente los frames ausentes** y encajarlos en la secuencia existente.
- Mantener el último worksheet validado en la cache/área de proyecto para poder reanudar después de un corte de chat o sesión.

### 2.2. Uso de generación de imagen

La generación de imagen se usa sólo para obtener **frames 2D aislados** o pequeñas tandas coherentes.

Debe conservar:

- diseño canónico;
- proporciones;
- volumen corporal;
- silueta;
- equipamiento;
- arma y mano correctas;
- dirección de mirada;
- iluminación/contraste compatible;
- pose previa y siguiente de la animación.

No debe producir:

- una composición final “artística” que luego haya que adivinar cómo trocear;
- fondos;
- textos;
- varias escalas mezcladas;
- armas duplicadas;
- extremidades adicionales;
- un segundo objeto en la mano libre salvo que el diseño lo exija;
- sprites con perspectiva incompatible entre frames.

### 2.3. Rebuild completo de un banco animado

Cuando el objetivo sea rehacer un framesheet completo, **no generar el atlas entero como una sola imagen de presentación**.

El flujo obligatorio es **animación por animación**:

1. una animación concreta;
2. exactamente los frames que exige su contrato (para Matthias actual: 8);
3. fondo transparente;
4. sin títulos, números, paneles, flechas, leyendas ni muestras ampliadas;
5. misma dirección base, escala corporal, vestuario, arma y agarre que el resto del banco;
6. normalización por script a la celda runtime;
7. contact strip PNG de esa animación;
8. revisión visual explícita frame a frame;
9. aceptar o regenerar esa animación antes de pasar a la siguiente.

Una generación que produzca un póster, tablero UI, ficha técnica o composición con sprites fuera de una rejilla técnica **se considera referencia visual, nunca source runtime**.

En un rebuild completo no se mezclan silenciosamente filas legacy sólo porque ya existan. Cada animación debe quedar marcada como una de estas tres categorías en el worksheet/manifest:

- `regenerated`;
- `retained-reviewed`;
- `rejected`.

Si el usuario pide rehacer **todo** el framesheet, la categoría `retained-reviewed` sólo puede usarse si se ha revisado explícitamente esa animación y se ha justificado conservarla.


## 3. Contrato visual por frame

Todos los frames de una misma familia deben tener:

- canvas/celda idénticos;
- misma escala corporal percibida;
- misma línea de pies;
- mismo pivote lógico;
- centro de masa estable;
- continuidad de volumen y silueta;
- transparencia real;
- margen transparente suficiente;
- ausencia de recortes accidentales;
- orientación inequívoca;
- arma consistente en forma, tamaño, mano y punto de agarre.

### 3.1. Jitter y desplazamiento

La animación puede mover el cuerpo, pero el movimiento tiene que ser **intencional**. No confundir movimiento animado con jitter de alineación.

El normalizador debe detectar o facilitar la detección de:

- pies que saltan varios píxeles sin motivo;
- personaje que cambia de tamaño entre frames;
- arma que flota respecto a la mano;
- cabeza/casco que cambia de volumen;
- pivote que deriva;
- bounding box que se desplaza por recorte automático inconsistente.

### 3.2. Semántica de Matthias

Para Matthias canónico:

- la pose armada por defecto debe ser consistente;
- una animación `hurt` representa un **flinch/queja todavía en pie**, no una caída al suelo;
- el gesto de dolor puede cerrar/guiñar un ojo y contraer la pose, siguiendo el canon aprobado;
- una caída/prone pertenece a una animación explícita que la requiera, no a `hurt`;
- no introducir una segunda arma aparente en la mano libre;
- disparar no puede hacer que el arma cambie de mano entre frames.

## 4. Cobertura de animación

La cobertura exacta depende del actor y del manifest, pero para Matthias/armas soportadas debe contemplar cuando aplique:

- idle;
- locomoción;
- jump/fall;
- hurt;
- death si existe;
- disparo horizontal;
- disparo arriba;
- disparo abajo;
- diagonal arriba;
- diagonal abajo;
- crouch fire;
- variantes por arma realmente soportada.

Usar **mínimo 8 frames por pose/animación cuando aplique** y cuando el contrato actual de esa animación no especifique otra cosa. No inflar artificialmente una secuencia estática duplicando frames sólo para alcanzar un número.

Las animaciones direccionales deben mantener continuidad entre sí: cambiar de horizontal a diagonal no puede transformar súbitamente el cuerpo, arma o escala.

## 5. Montaje determinista

El atlas final se monta por script.

El packer/normalizador debe fijar explícitamente:

- ancho/alto de celda;
- número de columnas y filas;
- orden de animaciones;
- orden de frames;
- pivote;
- línea de pies;
- escala;
- padding/margen transparente;
- reglas de recorte;
- transparencia;
- nombre lógico;
- versión/quality contract;
- hash final.

No usar heurísticas no deterministas ni aleatoriedad. El mismo input debe producir el mismo output byte a byte siempre que las dependencias fijadas sean las mismas.

## 6. Contrato PNG

El PNG final debe cumplir:

- RGBA de 8 bits;
- alpha recta, no premultiplicada;
- sin entrelazado;
- sin chunks de color `iCCP`, `gAMA`, `sRGB` o `cHRM`;
- RGB limpio bajo píxeles con `alpha=0`, evitando halos;
- sin fondos residuales;
- celdas en rejilla fija;
- al menos el margen transparente que exija el validador alrededor del contenido;
- ancho y alto `<= 16384 px`.

El runtime actual usa filtrado lineal para sprites hi-res reducidos. Por eso el padding entre celdas es obligatorio: un atlas “apretado” puede sangrar visualmente entre frames aunque el slicing sea matemáticamente correcto.

`oxipng` puede optimizar sin pérdida el PNG final **antes** de calcular/publicar su hash. No usar `pngquant` para estos assets porque cuantiza.

## 7. Manifest obligatorio

Cada atlas debe ir acompañado por un manifest JSON determinista que describa, como mínimo:

- dimensiones de atlas;
- dimensiones de celda;
- columnas/filas;
- padding;
- pivote;
- línea de pies;
- animaciones;
- orden de frames;
- FPS/duración cuando proceda;
- loop/no-loop;
- regiones/celdas;
- hash SHA-256 del PNG;
- versión del contrato de calidad si existe.

Godot y los validadores deben consumir el manifest. No hardcodear regiones nuevas directamente en GDScript si pueden derivarse del contrato publicado.

## 8. Import y consumo en Godot

Contrato de import:

- `compress/mode=0` / lossless;
- `mipmaps/generate=false`;
- `fix_alpha_border=true`;
- sin premultiplicar alpha;
- mantener el filtro runtime esperado (`linear`) salvo cambio deliberado validado visualmente.

Godot headless debe:

1. importar/cargar el atlas;
2. construir o validar `SpriteFrames` / `AtlasTexture`;
3. comprobar que cada región del manifest cabe dentro del PNG;
4. comprobar que el frame count coincide;
5. comprobar que las animaciones esperadas existen;
6. fallar si una región pisa padding, se sale del atlas o no coincide con la rejilla.

La versión de Godot y su checksum deben seguir la configuración del repo/CI. No declarar validación Godot si el binario requerido no pudo ejecutarse.

## 9. Toolchain canónico

Preferir el entorno fijado por el repositorio:

- Python del `.venv`;
- Pillow;
- NumPy;
- OpenCV;
- ImageMagick para inspección;
- `oxipng` para optimización lossless;
- Godot headless para validación real;
- Krita/Aseprite sólo para retoques puntuales si están disponibles.

Aseprite es opcional. La ausencia de Aseprite no debe bloquear una pipeline que ya puede normalizarse y validarse por script.

Los validadores existentes bajo `scripts/art/` y sus tests son parte del contrato. Antes de crear un validador paralelo, extender el existente si el dominio es el mismo.

## 10. Artifact visual obligatorio

Cada iteración que cambie frames/atlas debe producir un artifact PNG revisable.

Como mínimo generar:

- atlas final;
- contact sheet/worksheet con los frames ordenados;
- cuando sea útil, preview animada o captura runtime;
- metadata/manifest correspondiente.

La revisión visual debe buscar específicamente:

- armas duplicadas o fantasma;
- cambios de mano;
- frames con proporciones distintas;
- pies/pivote que bailan;
- recortes;
- halos;
- frame fuera de orden;
- saltos de iluminación;
- `hurt`/`death` semánticamente incorrectos;
- poses de disparo que no encajan con la dirección;
- desalineación entre celda y región real.

**CI verde no sustituye esta revisión.** Si el PNG se ve mal, la iteración está mal aunque todos los checks estructurales pasen.

### 10.1. Revisión pose a pose obligatoria

Para Matthias, el artifact visual debe permitir revisar **cada animación del manifest**, no sólo una muestra representativa.

En un banco 18×8 deben existir como mínimo:

- un contact strip por fila/animación con sus 8 frames;
- un overview global del atlas;
- close-ups runtime de `idle`, `walk/run`, `run+fire`, `shoot`, direccionales, `crouch/crouch_fire`, `reload`, `hurt` y `die`;
- captura runtime de cualquier transición que haya sido motivo de una regresión previa.

La revisión humana debe registrar explícitamente, por animación, `PASS` o `REJECT`. No basta con revisar un frame de `run+fire` y asumir que `idle` o `hurt` están bien.

Antes de Ready/merge, revisar siempre:

- frame 0 y frame intermedio de cada fila;
- todos los frames de las filas que cambian agarre/arma;
- primer/último frame de transiciones no-loop;
- silueta a escala real del juego, además del contact sheet.


### 10.2. Fluidez de locomoción: validar fases, no sólo unicidad

Una fila de `run` puede contener 8 hashes distintos y seguir percibiéndose como una animación de 2 poses. Por tanto, **`N frames distintos` no equivale a `N fases de zancada perceptibles`**.

Para locomoción rápida:

- revisar la secuencia como ciclo completo, no sólo como contact sheet estático;
- comprobar que piernas, cadera, torso y arma avanzan por fases intermedias legibles;
- comprobar explícitamente el cierre último→primero para evitar un salto al repetir;
- no crear fluidez duplicando frames;
- si los keyframes buenos son escasos, preferir **in-betweens motion-compensated** derivados de las poses aprobadas antes que cross-fades de dos sprites;
- un in-between debe deformar una sola silueta hacia la siguiente pose; no mezclar dos cuerpos, dos armas ni dos pares de piernas;
- conservar X/centro de masa de la animación salvo que exista deriva real: no recentrar cada frame automáticamente porque puede introducir jitter lateral artificial;
- sí reanclar verticalmente cuando haga falta para conservar la footline contractual;
- limpiar RGB bajo alpha cero y revalidar guard/pivote/footline después de interpolar.

Para Matthias, si una carrera de 8 keyframes sigue leyéndose como 2–4 poses, la solución preferida es un **run strip suplementario de 16 frames**:

`K0, I0→1, K1, I1→2, …, K7, I7→0`

donde `K` son keyframes revisados e `I` son in-betweens motion-compensated.

El runtime debe preservar la **frecuencia de ciclo** al aumentar el frame count. La velocidad efectiva de animación debe derivarse como:

`desired_fps = frame_count × cycle_hz`

y no como un FPS fijo heredado del banco de 8 frames. Doblar muestras no debe hacer que Matthias corra a cámara lenta ni que doble la cadencia.

Gates mínimos para un run strip ampliado:

- todos los frames son distintos;
- footline constante;
- cierre 7→0/último→primero sin salto visual;
- no aparece arma/miembro fantasma;
- no hay drift horizontal inducido por el interpolador;
- preview/contact strip de los 16 frames;
- captura runtime corriendo y, si aplica, corriendo+disparando;
- revisión humana explícita `PASS` antes de Ready.

### 10.3. Lecciones de la iteración P99 full-bank

Cuando una regresión visual existe en varias poses (por ejemplo, segunda arma aparente, `hurt` cayendo al suelo o `run+fire` incoherente), **dejar de parchear filas legacy una a una** y reconstruir el banco completo desde una fuente saneada.

Proceso que funcionó y debe reutilizarse:

1. congelar image generation cuando ya existe material suficiente;
2. sanear la fuente y convertirla en input técnico sin UI/textos;
3. reconstruir las 18 acciones respetando el orden runtime;
4. normalizar todas a la misma escala, pivot y footline;
5. generar contact strip por cada acción;
6. revisar todas las filas, no una muestra;
7. verificar close-ups runtime de `idle`, `run`, `run+fire`, `crouch`, `hurt` y direccionales;
8. si una pose falla visualmente, corregir la fuente/normalización correspondiente y repetir;
9. sólo después publicar el asset inmutable y promover runtime.

Especialmente:

- `hurt` debe ser un flinch de pie;
- `die` es la única fila que puede terminar tumbada;
- `crouch`, `crouch_walk` y `shoot_crouch` deben leerse realmente agachados a escala de juego;
- una P99 debe leerse como **una sola pistola** con agarre a dos manos, no como arma + bulto ambiguo;
- el smoke funcional del navegador no sustituye estas comprobaciones visuales.

## 11. Secuencia de trabajo

1. Identificar master/worksheet canónico y último artifact validado.
2. Inventariar qué frames ya son válidos y cuáles faltan o están rotos.
3. Generar sólo lo necesario.
4. Limpiar/normalizar frames por script.
5. Montar atlas determinista.
6. Emitir manifest.
7. Ejecutar validadores de PNG/atlas.
8. Ejecutar tests de arte.
9. Ejecutar Godot headless.
10. Generar artifact/contact sheet.
11. Revisar visualmente contra baseline.
12. Corregir cualquier regresión y repetir.
13. Integrar runtime.
14. Validar captura real.
15. Publicar en R2/CDN cuando corresponda.
16. Validar staging antes de dar la iteración por terminada.

No saltar del paso “generé frames” directamente a “deployado”.

## 12. Gates de aceptación

Una iteración sólo está terminada si:

- mantiene el canon;
- mejora o conserva calidad visual;
- mantiene continuidad de animación;
- cubre las poses requeridas;
- no introduce arma/miembros fantasma;
- mantiene pivote, línea de pies y escala;
- PNG cumple contrato;
- manifest y atlas coinciden;
- validadores pasan;
- Godot consume el atlas correctamente;
- artifact PNG fue revisado;
- runtime no presenta regresiones;
- staging fue validado cuando el cambio llega a deploy.

### 10.4. Artefactos fantasma alrededor de armas

La revisión visual debe buscar **componentes alpha aislados o geometría fantasma** alrededor del arma y de las manos.

Rechazar una pose si aparecen:

- píxeles o islotes desconectados cerca del cañón, culata, cargador o manos;
- un segundo cañón aparente;
- una segunda empuñadura o arma fantasma;
- residuos de una pose/arma anterior;
- trazos oscuros que no pertenecen claramente al cuerpo ni al arma;
- pequeños componentes alpha separados que sólo aparecen en algunos frames;
- flashes o proyectiles baked dentro del sprite cuando el runtime ya los genera proceduralmente.

El gate técnico debe complementar la inspección humana con análisis de componentes conectados cuando sea viable:

- identificar el componente principal cuerpo+arma;
- contar componentes secundarios con alpha significativo;
- rechazar islotes por encima de un umbral de área/distancia;
- permitir únicamente efectos intencionados documentados.

**Regresión conocida:** el banco SMG/machinegun de Matthias ha mostrado artefactos fantasma alrededor del arma en runtime. Antes de volver a promover esa variante, revisar explícitamente `idle`, `walk`, `run`, `run+fire`, `shoot`, diagonales, `crouch_fire` y `reload` con close-up runtime y contact strips.

## 13. Enemigos

Los enemigos siguen el mismo contrato técnico.

Además:

- compartir una familia visual coherente con el mundo de Pawn Slug;
- mantener paleta/contraste y escala compatibles;
- permitir siluetas, cascos, armaduras y armas propias;
- no depender de un fondo para comunicar la identidad;
- conservar worksheet validado;
- evitar que una variante cambie de tamaño arbitrariamente respecto a otras de la misma clase.

El atlas enemigo también se genera desde frames 2D + packer determinista. No aceptar composiciones finales manuales como fuente runtime.

## 14. CI y publicación

Los workflows de sprites existentes son parte de la red de seguridad y no deben eliminarse sólo porque una iteración se haya generado localmente.

El CI debe seguir pudiendo:

- montar/validar el atlas;
- ejecutar el contrato PNG;
- ejecutar tests de arte;
- ejecutar validación Godot cuando corresponda;
- producir artifacts de revisión;
- publicar/smoke-testear según el flujo definido.

Para R2:

- publicar objetos inmutables/content-addressed;
- actualizar el logical ID/manifest después;
- calcular hash tras cualquier optimización final;
- mantener fallback local sólo durante la migración que lo necesite;
- no meter blobs pesados nuevos en Git si el flujo R2 ya es la autoridad.

## 15. Qué hacer cuando algo “parece bien” pero la trituradora falla

No desactivar el gate.

Determinar primero si falla:

- el arte;
- la normalización;
- el manifest;
- el slicing;
- el contrato PNG;
- la semántica de animación;
- la importación Godot;
- el runtime.

Corregir la capa responsable. Sólo cambiar un gate si el contrato anterior era objetivamente incorrecto y la PR documenta el nuevo contrato con una prueba que evite relajarlo accidentalmente.
