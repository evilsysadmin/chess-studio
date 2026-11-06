# Retirada de Chronicles · evidencia de archivo de partidas

Objetivo: preservar los documentos históricos de la colección **Chess Studio**
`chronicles_runs` antes de quitar el motor Python de Chronicles. La API actual
del juego independiente no es prueba de que pueda importar estos saves antiguos.

## 1. Exportar sin modificar producción

Usar credenciales de lectura aprobadas y almacenar el archivo **fuera de Git,
artifacts de CI y chats**. Contiene identificadores de propietarios e inventarios.

```bash
umask 077
# La fuente histórica de producción es chess_study, NO chess_study_staging.
# Confirmar URI/identidad con el operador; el export jamás debe escribir.
mongoexport --uri "$MONGODB_URI" --db chess_study \
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

### Estado real del importador y fuentes de datos

El importador Go del repositorio `evilsysadmin/chronicles-of-matthias`
(`api/internal/legacyimport/legacyimport.go`) **ya no limita el número total
de runs por propietario a 200**: usa `SetBatchSize(200)` para transferencias de
red y recorre el cursor hasta el final con comprobaciones de errores. Los tests
`TestReadRunCursorNeverTruncatesAtBatchSize` ejercitan 201 y 431 registros y
verifican que el import siga siendo idempotente. Por tanto, **no añadir
`--importer-cap 200` al archivo canónico**: generaría falsos bloqueos. La
opción `--importer-cap` del doctor permanece para auditar versiones antiguas
u otros importadores si se ha verificado un límite total auténtico.

**El bloqueo actual es la base fuente y la compatibilidad, no 200 filas.**
El importador Go fija `SourceDatabase = "chess_study_staging"` y rechaza
expresamente leer desde `chess_study` mediante
`ValidateDistinctDatabases`. Esta restricción es intencionada: no permitir
que una migración acceda accidentalmente a producción ni relajarla para
saltarse un paso. El export de arriba preserva el archivo histórico de
`chess_study`; **no demuestra** que esos registros estén presentes en
`chess_study_staging` ni que el importador los haya copiado.

Antes de retirar rutas Python o purga de cuentas, verificar un plan aprobado
de transferencia de datos por propietario desde un archivo privado íntegro
hacia un staging aislado, con autorización, evidencia de conteos/hash,
compatibilidad de esquema, acceso limitado, rollback y pruebas de recuperación
sin escribir ni borrar la colección histórica de producción. Ningún
`--importer-cap` sustituye estas pruebas.

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
