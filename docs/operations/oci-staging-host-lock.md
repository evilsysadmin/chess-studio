# OCI staging: triaje seguro de deploy.lock

Este procedimiento es **para el host OCI real**, no para el contenedor ni el
namespace del agente OCI Run Command. No es una orden de reiniciar ni liberar
un lock.

## Incidente reproducido · 23-10-2026

Varias generaciones exact-SHA publicaron Pages, Worker e imágenes GHCR, pero
`Backend · exact OCI generation` devolvió `exit 75` tras esperar 420 segundos
por `/var/lib/chess-studio/deploy.lock`. El backend conservó
`ad86073037f313ae7a2226f6561dddc3ac511bc8` y respondió HTTP 200 en
`/health` y `/ready`, **sin acreditar** las releases nuevas.

Una sonda de OCI solo lectura observó:

```text
OCI_BACKEND_LOCK state=held
OCI_BACKEND_LOCK_CANDIDATE pid=789948 age_s=unknown proc=no
```

Ese PID **no es propietario verificado**. `proc=no` indica que no está visible
en el espacio de procesos del agente. No usarlo con `kill`, ni eliminar el
fichero lock.

## Toma de evidencia desde el host (sin mutaciones)

Desde una copia local verificada de Chess Studio, materializar **solo**
`scripts/oci_host_lock_triage.py` del commit revisado y copiarlo a la VM
por el canal SSH ya autorizado. Ejemplo; sustituir los marcadores de posición:

```bash
git show <SHA_verificado>:scripts/oci_host_lock_triage.py > /tmp/oci_host_lock_triage.py
python3 -S /tmp/oci_host_lock_triage.py --self-test
scp /tmp/oci_host_lock_triage.py <usuario_ssh>@<host_oci>:/tmp/oci_host_lock_triage.py
ssh <usuario_ssh>@<host_oci> 'sudo python3 -S /tmp/oci_host_lock_triage.py'
```

No ejecutar código descargado en remoto sin revisar el SHA y el contenido.
El checkout del host puede estar obsoleto: **no** usar su copia para asumir que
el diagnóstico nuevo existe.

La herramienta:

- Abre el lock en solo lectura, sin seguir symlinks, y prueba `flock` sin esperar.
- Busca registros **FLOCK** activos por dispositivo mayor/menor **e inodo** exactos;
  ignora esperas, locks POSIX y colisiones de inodo en otros dispositivos.
- Publica únicamente `state`, conteo, PID, visibilidad y antigüedad si la puede
  obtener de `/proc/<pid>/stat`; no lee `cmdline`, `environ` ni secretos.
- Si el lock está retenido, inspecciona **solo metadatos** `stat()` de los FD
  expuestos en `/proc/<pid>/fd`, con límite de 4096 procesos. Busca el **mismo
  dispositivo e inodo**, incluso si el PID original del `FLOCK` desapareció y
  otro proceso heredó su descriptor. Emite PID y **conteo** de FD coincidentes,
  nunca sus rutas, contenidos ni nombres de procesos. `coverage=partial`
  significa que hubo permisos insuficientes, carreras o límite alcanzado:
  la ausencia de coincidencias **no demuestra** ausencia de herederos.
- Nunca ejecuta `kill`, `rm`, `systemctl restart`, operaciones de Docker,
  modificaciones de Git ni cambios de despliegue.

## Decisión posterior

Si muestra `held` con PID visible o `OCI_HOST_LOCK_FD_HOLDER` con
`matching_fds>0`, identificar **desde la misma VM y namespace** su unidad de
systemd, descriptores heredados y actividad real, también en modo lectura. No intervenir hasta descartar un despliegue legítimo en curso. Si
muestra `held` con `records=0`, `proc_visible=no` o `age_s=unknown`, registrar
la limitación y examinar namespaces/FDs con un operador autorizado. Un lock
retenido no demuestra por sí solo un proceso colgado.

**Nunca** quitar `deploy.lock` para resolverlo: `flock` bloquea el *open file
description*, no el nombre; recrear el fichero permitiría dos exclusiones
incompatibles. Después de cualquier recuperación manual documentada, solo
acreditar staging cuando Pages, Worker, backend **y ambos browser smokes**
demuestren el mismo SHA exacto. Un workflow global `success` con
`Staging generation complete` omitido no acredita ese SHA.

Incidente y evidencias: [#5984](https://github.com/evilsysadmin/chess-studio/issues/5984).
