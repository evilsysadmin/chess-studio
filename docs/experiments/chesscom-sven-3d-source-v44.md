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
