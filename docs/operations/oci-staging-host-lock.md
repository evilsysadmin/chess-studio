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

### Prevención adicional: timeout del watcher

La investigación del código encontró un riesgo independiente de la causa del
incidente: el watcher Python envolvía `sudo chess-studio-deploy` en
`subprocess.run(timeout=900)`. Al vencer, Python termina **solo el proceso
inmediato**; el wrapper raíz o sus descendientes pueden continuar reteniendo
`deploy.lock` después de desaparecer `sudo`.

El watcher ahora espera el resultado del wrapper raíz sin matar solamente a
`sudo`; sigue siendo secuencial, y la verificación exact-SHA y el lock
permanecen bajo autoridad del propio wrapper. Esto **no identifica ni libera**
los holders del lock anterior, y puede mantener bloqueado al watcher si el
wrapper nunca concluye. En ese caso se debe inspeccionar el host antes de
cualquier parada controlada del servicio o recuperación. No cancelar una
mutación de despliegue a medias para forzar el progreso.

### Candidato de fuga de FD8: túnel cloudflared desacoplado

La auditoría del código ha encontrado una ruta **concreta** de herencia del
descriptor: el deploy mantiene `deploy.lock` en FD8 y ejecuta
`scripts/oci_staging_tunnel_connector.sh`, que lanza `cloudflared` como
daemon con `runuser` + `nohup setsid ... &`. Ni `nohup` ni `setsid` cierran
automáticamente los descriptores arbitrarios heredados; un proceso del túnel
puede conservar FD8 después de terminar el deploy, perpetuando el `flock`.

El conector actualizado cierra **FD8 solo en la rama hija** al ejecutar
`runuser` y otra vez en el lanzamiento desacoplado de `cloudflared`; el
deploy padre **no** pierde su exclusión mutua. El test de contrato crea un
lock temporal real: verifica que un daemon sin cierre mantiene el lock
ocupado y que con `8>&-` queda libre mientras el daemon sigue vivo.

Esto es una **causa plausible documentada por código**, no una atribución
confirmada al proceso actualmente activo en la VM. Un `cloudflared` viejo
podría seguir teniendo FD8 aun después del merge. Usar el triaje desde el
**host real** para correlacionar inodo, FD y servicio; solo después de
identificar inequívocamente al holder y excluir una mutación legítima,
planificar una intervención manual controlada que preserve el túnel de acceso.
**No reiniciar el túnel automáticamente, matar PIDs a ciegas ni borrar el
fichero lock**.

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
- Si el lock está retenido, inspecciona metadatos `stat()` de los FD
  expuestos en `/proc/<pid>/fd`, con límite de 4096 procesos. Busca el **mismo
  dispositivo e inodo**, incluso si el PID original del `FLOCK` desapareció y
  otro proceso heredó su descriptor. Para los FD coincidentes, consulta
  únicamente el metadato del kernel `/proc/<pid>/fdinfo/<fd>` y cuenta los
  registros `lock: ... FLOCK` que coinciden con ese dispositivo e inodo.
  Publica `matching_fds` (candidatos) y `flock_witness_fds` (testigos
  del kernel); no publica rutas, datos del FD ni nombres de procesos.
  `coverage=partial` significa permisos insuficientes, carreras o límite
  alcanzado, incluidos `fdinfo` inaccesibles: **un cero no demuestra ausencia
  de propietarios**. Tampoco un testigo demuestra que sea seguro terminarlo.
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
