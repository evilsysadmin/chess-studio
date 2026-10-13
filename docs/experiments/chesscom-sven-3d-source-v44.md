# CHESSCOM · Sven V44 — fuente propia para un master 3D serio

## Tras V42 y V43

Los dos prototipos de Blender fueron **rechazados visualmente y cerrados sin
merge**: la geometría procedural no alcanza la referencia aprobada.
El contrato visual sigue siendo [Dust Veil V41](chesscom-golden-art-v41.json).

El PNG original sólo contiene a Sven de perfil, **parcialmente oculto tras
cobertura**, y un retrato pequeño incrustado en la interfaz. No contiene
las vistas trasera/lateral ni un humano entero de pie. Pretender que de esa
captura salen un sculpt fiel o 96 frames genuinos sería engañoso.

## Extraer las referencias sin inventar píxeles

```bash
python3 scripts/art/chesscom_sven_source_handoff_v44.py \
  --golden '/ruta/Operación Dust Veil: Chesscom.png' \
  --output-dir /tmp/chesscom-sven-3d-source
```

Verifica SHA-256 contra V41, recorta campo y retrato **sin reescalarlos** y
escribe `source-manifest.json`. No reconstruye regiones tapadas ni sube
nada. En V41, Sven de campo mide sólo **175×171 px**, el retrato
**162×142 px**; el estado esperado es `readiness=blocked`.

Para una prueba de imagen→3D primero hará falta **una lámina o imagen de
cuerpo entero original y aprobada**, con pies/manos visibles, pose neutra,
tamaño mínimo 512×768, y SHA verificable:

```bash
python3 scripts/art/chesscom_sven_source_handoff_v44.py \
  --golden '/ruta/Operación Dust Veil: Chesscom.png' \
  --output-dir /tmp/chesscom-sven-3d-source \
  --full-body '/ruta/sven-cuerpo-aprobado.png' \
  --full-body-sha256 SHA256_REAL --artist-approved
```

`ready-for-consented-manual-trial` es únicamente una admisión de fuente:
**no verifica anatomía inventada, no concede derechos para subir a terceros,
no produce un GLB y no constituye aprobación artística**.

## Ruta futura, no ejecutada

Un motor de imagen→3D con PBR y A-pose (por ejemplo
[Meshy Image to 3D](https://docs.meshy.ai/en/api/image-to-3d), modelo
`meshy-7.1`), seguido por
[rigging humanoide](https://docs.meshy.ai/en/api/rigging), es una vía
técnica posible. Su [API tiene costes por créditos](https://docs.meshy.ai/en/api/pricing).
No existe aquí una cuenta/API autorizada y **no se ha enviado material propio
ni cargado ningún importe**.

Cualquier candidato deberá superar auditoría GLB V40 y ocho vistas Blender
**visualmente comparadas** con V41, luego pruebas reales Babylon de
manos/fusil, cobertura, móvil y FPS. El runtime 3D y fallback actuales
permanecen intocados hasta una aceptación visual explícita.

## V47 — decisión de pipeline para personajes y enemigos

**Diagnóstico:** Dust Veil ya tiene un entorno convincente, pero los actores
V4 siguen siendo mallas humanas construidas en Babylon con geometría y
materiales procedurales. Los sucesivos parches de proporciones y accesorios
no sustituyen modelado, skinning y animaciones authored. V42/V43 ya fallaron
en comparación visual. El prototipo 2.5D V33/V45 es un recorte frontal
estático; aún no soporta movimiento, ocho direcciones ni iluminación 3D.

### Decisión

Conservar Babylon.js, la escena, posiciones de unidades, IA, balística,
cover, picking y gameplay. Cambiar la **fuente visual** de los actores a
modelos 3D originales con skeleton/skin, clips y sockets exportados a GLB
desde Blender u otra herramienta de authoring. Dejar V4 de fallback y
conservar 2.5D como experimento aislado, no como nueva pipeline principal.
No sustituir el canon propio con un soldado SWAT genérico ni dar por buena
una reconstrucción de cuerpo entero a partir de un recorte.

Priorizar **Sven como vertical slice**: primero referencia original aprobada
de cuerpo entero y vistas suficientes (la V41 solo enseña una figura parcial);
después master editable, rig con controles de manos y pies, arma parentada,
socket de salida del arma y animaciones reales (idle, walk, aim, fire,
damage, death, opcional reload). Producir turntable de ocho vistas y captura
de movimiento antes de escribir código de integración. El auditor V40 solo
valida estructura mínima, no acredita calidad artística o animación.

El importador Babylon debe conservar el mismo transform de unidad y la
autoridad del estado táctico. Los sockets authored, no offsets mágicos de
fusil, deberán gobernar manos, arma y efectos. La importación será A/B
opt-in, con retorno a V4 si falla GLB, hash, rig o animación; ningún modelo
nuevo sustituirá a todos los actores por defecto.

### Extensión al escuadrón y los enemigos

- **Sven:** explorador de silueta ágil, protección azul-negra y arma compacta
  según V41.
- **Dieter:** fusilero de equipamiento oliva, más pesado y con perfil
  inequívocamente distinto; usar el mismo rig base sólo si no borra identidad.
- **Matthias:** cabeza de peón marfil, gorra y uniforme oficiales propios.
  Nunca convertirlo en un humano genérico con otros colores.
- **Hostiles:** dos o tres arquetipos authored y variantes creíbles de
  equipamiento/rostro. No duplicar la geometría de Dieter y teñirla de gris.

### Condiciones para promocionar un solo personaje

1. Modelo propio con procedencia/permiso verificables y SHA de fuente.
2. Rig y clips exportados, pies apoyados, agarre convincente y arma alineada
   en todas las acciones; revisión del GLB real, no solo de sus nodos.
3. Evidencia authored (ocho vistas/animación) y runtime Babylon del **mismo
   asset y revisión** en 1600×900 y 390×844, incluyendo movimiento, giro,
   tiro, daño, muerte y oclusión tras cobertura.
4. Comparativa contra golden V41 a zoom táctico: siluetas, materiales,
   sombras, tamaño relativo y contraste. Revisar una secuencia temporal,
   no solo un fotograma.
5. Coste GPU medido en escritorio y móvil: batches/materiales compartidos,
   mallas/texturas razonables, precarga no bloqueante y fallback.
6. Sólo tras aceptación visual, promocionar por actor con asset versionado
   en R2 y mantener rollback reversible.

**Primer siguiente paso real:** obtener/aprobar la fuente completa de Sven
o crearla de forma controlada. Hasta entonces, más cilindros PBR o un
"GLB" improvisado no resuelven el defecto visible de la captura. Esta
decisión no cambia el runtime por sí sola.

### Preflight técnico V47 (sin promoción)

El primer corte de código acompaña a esta decisión con un gate **estructural
y manual**, que se ejecutará sobre el GLB propio una vez exista:

```bash
python3 scripts/art/test_chesscom_actor_rig_gate_v47.py
python3 scripts/art/chesscom_actor_rig_gate_v47.py \
  --master-glb /ruta/al/personaje-riggeado.glb --sha256 SHA256_EXACTO
```

Reutiliza la auditoría de skeleton/skin V40; exige clips con los nombres
`Idle/Walk/Fire/Damage/Death`, animación dirigida a huesos reales y un
`MuzzleSocket` asociado a la jerarquía del arma. Es *preflight*, no un
validador exhaustivo de bytes de animación ni un certificado de calidad:
Blender/GLB runtime y las capturas exact-SHA siguen siendo obligatorios.

## V48 — recuperadas ocho vistas originales de Sven (referencias, no 3D)

Se ha localizado en la Library del usuario `Operation Dust Veil: Sven Character Sheet.png`,
fuente de 1536×1024 verificada por SHA-256
`76a66453e9eb68179b25eb2b1e3a792c8c3b29b86cb6f7e20a2aa055b3de6694`.
Contiene **ocho perspectivas de cuerpo entero**, además de detalles de casco,
armas y poses. Complementa el golden V41; **no lo sustituye ni está aprobada
como master 3D**. Es más útil para modelar a mano que el recorte parcial V41.

`docs/experiments/chesscom-sven-turnaround-v48.json` fija la fuente y
las ocho regiones de 192×450 px sin inventar ángulos. El extractor
`scripts/art/chesscom_sven_turnaround_v48.py` verifica el SHA tanto del
golden V41 como de la lámina, genera recortes PNG **sin escalar, segmentar
ni rellenar píxeles** y escribe `reference-manifest.json` con sus hashes.

```bash
python3 scripts/art/chesscom_sven_turnaround_v48.py \
  --golden '/ruta/Operación Dust Veil: Chesscom.png' \
  --sheet '/ruta/Operation Dust Veil: Sven Character Sheet.png' \
  --output-dir /tmp/chesscom-sven-turnaround-v48
python3 -m unittest discover -s scripts/art -p 'test_chesscom_sven_turnaround_v48.py' -v
```

Revisión visual de los ocho recortes realizada: silueta de Sven reconocible,
armadura azul-negra, mochila y casco, pero **los recortes no tienen canal
alpha y hay pequeñas intrusiones laterales de figuras contiguas**. Son
referencias conceptuales, no sprites. La perspectiva entre dibujos puede
variar y la resolución efectiva es insuficiente para afirmar que un servicio
automático de imagen→3D reconstruiría fielmente manos, ropa o geometría.
No hay aquí GLB, huesos, animaciones, llamadas externas, costes ni alteración
del renderer V4.

**Siguiente puerta artística:** producir fuera del runtime un modelo completo
propio con base en estas referencias, comprobarlo con turntable Blender y
llevarlo al gate V47. Hasta que supere la revisión visual y la carga real
Babylon, no promocionar ningún actor ni fingir que la fuente 2D resuelve
el modelado. Las ocho vistas son una **referencia suficiente para arrancar
un proceso de modelado supervisado**, no una conversión 3D terminada.

## V49 — Babylon A/B para el futuro Sven authored GLB

La fuente de ocho vistas V48 es suficiente para iniciar authoring supervisado;
no es un modelo exportado, aunque una de las láminas lleve etiquetas
«3D MODEL», «UV» o «TEXTURES». **No hay ningún nuevo GLB en esta PR.**

El renderer Babylon opt-in `?chesscomSven=authored` sólo busca
`/chesscom/sven-authored-v1.json` después de pedirlo expresamente el usuario.
Sin manifiesto/GLB, vuelve a V4. Es independiente de los experimentos
`sprite`, `atlas` y `v45`; nunca cambia el renderer por defecto.

### Contrato del arte que se necesita producir

- Sven original V41/V48, armadura azul-negra y casco con balaclava.
  Pie de suelo en el origen; eje Y arriba, dirección local +X para
  apuntar y arma verdaderamente agarrada por manos. Escala objetivo
  **1,72 unidades Babylon** (metros de juego).
- GLB glTF 2.0 con skin/skeleton, una o más mallas skinned,
  `Idle`, `Walk`, `Fire`, `Damage`, `Death` completos; `Aim`
  y `Reload` opcionales. El nodo `MuzzleSocket` debe descender
  de la jerarquía `Weapon`/`Carbine`/`Rifle` o equivalente.
- Revisar el contacto de ambas manos con el arma y pies en suelo
  en todas las animaciones y ocho ángulos. Sin cruces de equipamiento
  ni rifle flotante. Esto requiere fuente 3D editable legítima;
  los PNG de concept no son geometría ni bake real.
- Preparar texturas/PBR optimizadas, visibilidad de silueta a
  zoom real, y presupuesto de malla/draw calls/memoria móvil.
  El GLB y su rig necesitan auditor V40/V47 y una importación
  Babylon comprobada; el validador sólo estructural no basta.

### Manifiesto del candidato (NO publicar hasta disponer del asset)

El futuro recurso local **exacto** bajo `frontend/public/chesscom/actors/`
tendrá un manifiesto de la siguiente forma:

```json
{
  "schema": 1,
  "actor": "sven",
  "review_only": true,
  "asset": {
    "src": "/chesscom/actors/sven/sven-v1.glb",
    "sha256": "REEMPLAZAR_POR_SHA256_REAL_DE_64_HEX",
    "bytes": 0
  }
}
```

El ejemplo NO pasa validación intencionadamente. En runtime se comprueba
ruta local, tamaño exacto, máximo 14 MiB y SHA-256 de los bytes antes
de cargar un Blob como GLB. Se exige la presencia de skeleton, las cinco
animaciones nombradas y un `MuzzleSocket` descendiente del arma. Si todo
pasa se cuelga del mismo `unit-sven`, conserva picking/estado táctico,
oculta mallas visuales antiguas **sólo para Sven** y usa el socket
real para la trayectoria visible del disparo. Errores mantienen V4.
No se altera Dieter, Matthias ni hostiles.

**Detalle técnico pendiente:** confirmar en el build final que el cargador
glTF de Babylon está registrado y funciona con GLB verificado; el
importador opt-in falla cerrado si ese plugin falta. Un preflight
estructural no equivale a un runtime funcional con un asset real.
También quedan por inspeccionar clips/luces/cover/picking/retorno y
capturas desktop y móvil del mismo SHA antes de cualquier promoción.

El camino de producción será: modelado 3D externo → master propio
auditable → GLB + manifiesto con hash → flag A/B → PNG runtime &
comparativa visual → aprobación → promoción reversible por actor.
