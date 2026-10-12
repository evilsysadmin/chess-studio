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
