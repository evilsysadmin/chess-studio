# Retirada de Chronicles · evidencia de archivo de partidas

Objetivo: preservar los documentos históricos de la colección **Chess Studio**
`chronicles_runs` antes de quitar el motor Python de Chronicles. La API actual
del juego independiente no es prueba de que pueda importar estos saves antiguos.

## 1. Exportar sin modificar producción

Usar credenciales de lectura aprobadas y almacenar el archivo **fuera de Git,
artifacts de CI y chats**. Contiene identificadores de propietarios e inventarios.

```bash
umask 077
mongoexport --uri "$MONGODB_URI" \
  --collection chronicles_runs \
  --jsonFormat canonical \
  --out /ruta/privada/chronicles-before.jsonl
python3 scripts/legacy_chronicles_archive_doctor.py \
  /ruta/privada/chronicles-before.jsonl
```

El comprobador requiere un `_id` y `owner` válidos por documento, detecta
duplicados y verifica formatos elementales de campos de progreso presentes.
Calcula una huella SHA-256 de **todos** los campos persistidos, independiente
del orden de filas/llaves JSON. La salida muestra solo contadores y un hash
agregado, nunca partidas ni identificadores individuales.

## 2. Restore drill fuera de la colección real

Importar la copia **solo a una colección aislada de pruebas**, usando una base
scratch separada de producción. Verificar que `SCRATCH_MONGO_URI` **no**
apunta al cluster productivo. No usar `--drop` ni importar en
`chronicles_runs` real. Reexportar con el mismo formato JSON canónico:

```bash
mongoimport --uri "$SCRATCH_MONGO_URI" \
  --db chess_studio_restore_drill --collection chronicles_runs_legacy \
  --file /ruta/privada/chronicles-before.jsonl --stopOnError
mongoexport --uri "$SCRATCH_MONGO_URI" \
  --db chess_studio_restore_drill --collection chronicles_runs_legacy \
  --jsonFormat canonical --out /ruta/privada/chronicles-restored.jsonl
python3 scripts/legacy_chronicles_archive_doctor.py \
  /ruta/privada/chronicles-restored.jsonl \
  --baseline /ruta/privada/chronicles-before.jsonl
```

Resultado: código 0 si los documentos originales y restaurados son idénticos
de forma canónica; 1 si hay IDs añadidos, ausentes o documentos modificados;
2 si la entrada es inválida, está corrupta o contiene IDs duplicados.

**Limitación importante:** una huella de exportación/restore prueba integridad
documental, **no** que la versión independiente sepa reconstruir y jugar las
partidas. Antes de retirar las rutas Python aún hay que comprobar compatibilidad
real del esquema, autorización por propietario, un importador de legado y una
estrategia de recuperación/retención aprobada.

El mecanismo de borrado por propietario de `chronicles_runs` debe permanecer
en Chess Studio mientras existan documentos históricos. Nunca convertir una
caída de Mongo en borrado de cuenta "exitoso". Issue #5632.
