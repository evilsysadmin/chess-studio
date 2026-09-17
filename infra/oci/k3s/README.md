# K3s bootstrap bundle · OCI staging

Esta carpeta define los inputs y el instalador **offline** del futuro K3s single-node de staging. Todavía no cambia `cloud-init`, no arranca K3s y no hace cutover del backend actual.

## Contrato zero-cost

- No se usan OCI Custom Images ni builders A1 temporales.
- CI descarga artefactos oficiales ARM64 de K3s, verifica SHA-256 y tamaño exactos, y produce un tar reproducible.
- La versión queda fijada en `versions.env`; un bump es un cambio explícito y revisable.
- El bundle no contiene secretos, tokens de cluster, kubeconfig, credenciales OCI/GitHub/Cloudflare ni configuración de aplicación.
- `install-k3s-airgap.sh` sólo materializa el binario y el archive de imágenes en sus rutas de K3s. No usa red, no crea identidad de nodo y no inicia `k3s`.
- El staging actual sigue siendo la ruta de fallback hasta que K3s + Flux superen destroy/recreate y smoke de extremo a extremo.

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

Tras mergear a `main` un cambio en la superficie K3s, `OCI readiness` ejecuta `scripts/oci_k3s_bundle_publish.py reconcile` con las credenciales OCI de staging.

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
- no existe retención histórica implícita: rollback significa reconciliar de nuevo un contrato Git anterior, no acumular blobs;
- publicar el bundle **no toca la A1**.

## Secuencia

`CI bundle -> OCI Object Storage privado -> [siguiente fase] first boot descarga 1 bundle + verifica hash -> instala assets -> inicializa K3s -> bootstrap Flux -> Flux reconcilia workloads -> Headlamp/Cloudflare Tunnel`.

El consumo desde `cloud-init` sigue siendo una fase separada y reversible. Hasta que esa ruta demuestre destroy/recreate + smoke, el runtime Docker actual continúa intacto como fallback.