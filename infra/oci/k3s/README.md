# K3s bootstrap bundle · OCI staging

Esta carpeta define los inputs y el instalador **offline** del futuro K3s single-node de staging. Todavía no hace cutover del backend actual.

## Contrato zero-cost

- No se usan OCI Custom Images ni builders A1 temporales.
- CI descarga artefactos oficiales ARM64 de K3s, verifica SHA-256 y tamaño exactos, y produce un tar reproducible.
- La versión queda fijada en `versions.env`; un bump es un cambio explícito y revisable.
- El bundle no contiene secretos, tokens de cluster, kubeconfig, credenciales OCI/GitHub/Cloudflare ni configuración de aplicación.
- `install-k3s-airgap.sh` sólo materializa el binario y el archive de imágenes en sus rutas de K3s. No usa red, no crea identidad de nodo y no inicia `k3s`.
- El staging Docker actual sigue siendo la ruta de fallback hasta que K3s + Flux superen destroy/recreate y smoke de extremo a extremo.

## Versión inicial

Se fija `v1.36.4+k3s1`. Sus hashes y tamaños se fijan junto al código para que una mutación upstream o descarga incompleta falle cerrada.

El bundle contiene:

```text
bin/k3s
images/k3s-airgap-images-arm64.tar.zst
bootstrap/install-k3s-airgap.sh
manifest.json
```

El empaquetado normaliza orden, timestamps, UID/GID y modos para que los mismos inputs produzcan los mismos bytes.

## Publicación privada e idempotente

La publicación de assets **no es un side effect de mergear a `main`**. `OCI readiness` queda limitado a validación. Cuando se invoca explícitamente `OCI staging · service control → k3s-start`, esa única operación toma el mutex de mutaciones y, antes de arrancar K3s, ejecuta:

```text
scripts/oci_k3s_bundle_publish.py reconcile
scripts/oci_k3s_bundle_probe.py install
scripts/oci_k3s_control.py start
```

La publicación reutiliza el bucket privado y no versionado `chess-studio-staging-runtime`; **no crea un tercer bucket**. El publisher reserva únicamente dos nombres estables:

```text
k3s/bootstrap/k3s-airgap-arm64.tar.gz
k3s/bootstrap/manifest.json
```

Primero lee `manifest.json`. Si el `contract_id` y la metadata del bundle remoto coinciden con los inputs versionados del repositorio, termina sin descargar ni reconstruir K3s. Cuando cambia el contrato, fabrica el bundle verificado y sobreescribe las mismas dos claves; el manifiesto se escribe el último como commit pointer.

Guardarraíles:

- bundle <= 300 MiB;
- prefijo completo `k3s/bootstrap/` <= 350 MiB;
- cualquier objeto inesperado bajo ese prefijo hace fallar cerrado;
- el bucket debe seguir `NoPublicAccess`, `Standard` y con versioning `Disabled`;
- no existe retención histórica implícita: rollback significa reconciliar de nuevo un contrato Git anterior, no acumular blobs.

## Instalación verificada desde la A1

Tras reconciliar Object Storage, `scripts/oci_k3s_bundle_probe.py install` usa **instance principal**, no credenciales transportadas por Run Command, para leer `manifest.json` y el bundle privado.

La ruta de instalación:

- exige el OCI SDK pinneado que ya mantiene el runtime actual; no hace `pip install` ni descarga dependencias arbitrarias;
- descarga el bundle únicamente a un fichero temporal;
- verifica `Content-Length`, SHA-256, arquitectura, versión, layout exacto del tar y coherencia del manifiesto embebido;
- usa la capacidad root estrecha ya provisionada para materializar sólo los assets revisados;
- elimina el fichero temporal incluso si falla;
- no inicia K3s por sí misma: el start guardado sigue siendo una fase posterior y separada.

Así la operación explícita demuestra `Git -> Object Storage privado -> A1 -> assets exactos` inmediatamente antes del lifecycle start que los necesita, sin mantener una automatización mutante paralela en cada merge.

## Secuencia

`workflow_dispatch k3s-start -> OCI Object Storage privado reconcile -> A1 install verificado -> guarded K3s start -> status -> Docker fallback smoke`.

Con K3s ya activo, el backend shadow se itera exclusivamente mediante el mismo front-door manual:

`k3s-staging2-deploy <SHA exacto> -> staging2 status/diagnóstico -> k3s-staging2-rollback`.

Estas operaciones usan el namespace privado `chess-studio-staging2`, mantienen `ClusterIP` + port-forward loopback para la acreditación y no forman parte del release canónico. `deploy` y `rollback` comparten el mutex de mutaciones OCI; `status` es observación read-only. El workflow automático shadow retirado no se resucita.

Tras demostrar deploy/rollback repetible y smoke estable, el siguiente escalón sigue siendo Flux reconciliando workloads y, después, Headlamp mediante Cloudflare Tunnel/Access. Hasta entonces, el runtime Docker actual continúa intacto como fallback.
