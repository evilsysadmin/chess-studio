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

## 2. Reconciliar partidas históricas por propietario (sin acceso a red)

Una vez que un proceso **autorizado y validado por separado** haya copiado los
saves al destino independiente de Chronicles, exportar su colección
`chronicles_runs` con **permisos de lectura** a otro archivo privado, desde
el URI/DB de destino aprobado (no confundir con `chess_study` ni con la base
intermedia `chess_study_staging`). No ejecutar `mongoimport` ni borrar nada
mediante este paso:

```bash
umask 077
# CHRONICLES_DB debe ser la base independiente aprobada, no chess_study.
mongoexport --uri "$CHRONICLES_MONGODB_URI" --db "$CHRONICLES_DB" \
  --collection chronicles_runs --jsonFormat canonical \
  --out /ruta/privada/chronicles-target.jsonl
python3 scripts/legacy_chronicles_archive_doctor.py \
  /ruta/privada/chronicles-before.jsonl \
  --reconcile-target /ruta/privada/chronicles-target.jsonl
```

El doctor compara **cada documento fuente completo**, incluida su identidad
`_id` y `owner`, contra su correspondiente en el destino. Informa **solo
contadores agregados**: partidas iguales, ausentes, modificadas, conflictos de
propietario, propietarios afectados y partidas adicionales creadas
legítimamente en el juego independiente. Las partidas nuevas del destino no
se consideran pérdida de información. Rechaza fuente vacía y cualquier `_id`
BSON ObjectId heredado: el importador Go actual exige identificadores
`_id` de texto. Soporta BSON Int32/Int64 exportados mediante
`{"$numberInt":"3"}` y `{"$numberLong":"3"}` en `worldVersion`.

Códigos de salida: **0** si todos los documentos fuente son idénticos y
conservan propietario; **1** si faltan, difieren, hay conflictos o hay
identidades fuente incompatibles; **2** si el archivo es inválido o corrupto.
Este cotejo es offline, sin red ni escrituras, y **no imprime IDs ni nombres**.
Los archivos fuente y destino pueden contener información privada; conservar
ambos fuera de Git, artifacts de Actions y chats.

**Importante:** una reconciliación satisfactoria no prueba que la copia
proceda de un run oficial, que la snapshot no esté obsoleta, que el login
autorice a cada propietario ni que el juego pueda recuperar esas partidas.
Verificar por separado: ventana de exportación sin escrituras concurrentes,
origen y destino autenticados, proceso autorizado de transferencia,
restauración jugable y rollback. Tampoco autoriza retirar las rutas heredadas
ni la purga por propietario de `chronicles_runs`.

## 3. Restore drill fuera de la colección real

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
