#!/usr/bin/env bash
set -euo pipefail

backup_phase="bootstrap"
on_backup_error() {
  local rc=$?
  printf 'CHESS_STUDIO_MONGO_BACKUP_FAIL phase=%s line=%s rc=%s\n' "$backup_phase" "${BASH_LINENO[0]:-unknown}" "$rc" >&2
  exit "$rc"
}
trap on_backup_error ERR

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo 'run as root (sudo)' >&2
  exit 77
fi

env_file="${CHESS_STUDIO_PRODUCTION_ENV_FILE:-/etc/chess-studio/production/backend.env}"
backup_root="${CHESS_STUDIO_MONGO_BACKUP_ROOT:-/var/lib/chess-studio-production/backups/mongo}"
backup_image="${CHESS_STUDIO_MONGO_BACKUP_IMAGE:-mongo:8.0.14}"
backup_bucket="${CHESS_STUDIO_MONGO_BACKUP_BUCKET:-chess-studio-production-backups}"
keep_count=2
remote_keep_count=8
expected_db=chess_study

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing required command: $1" >&2; exit 69; }
}

require docker
require python3
require sha256sum
require flock
require df
require du
require getent

[[ -f "$env_file" && ! -L "$env_file" ]] || { echo "production runtime env missing" >&2; exit 42; }
[[ "$(stat -c '%a' "$env_file")" == "600" ]] || { echo "production runtime env must be mode 0600" >&2; exit 42; }

install -d -o root -g root -m 0700 "$backup_root"
[[ ! -L "$backup_root" ]] || { echo "backup root must not be a symlink" >&2; exit 66; }

lock_file="/var/lib/chess-studio-production/mongo-backup.lock"
install -d -o root -g root -m 0755 "$(dirname "$lock_file")"
exec 8>"$lock_file"
if ! flock -n 8; then
  echo 'another production Mongo backup is already running' >&2
  exit 75
fi

runtime_env="$(mktemp /tmp/chess-studio-mongo-backup-env.XXXXXX)"
incoming=''
scratch_container=''
scratch_network=''
remote_restore_archive=''
cleanup() {
  local rc=$?
  if [[ -n "$scratch_container" ]]; then
    backup_phase="scratch-cleanup"
docker rm -f "$scratch_container" >/dev/null 2>&1 || rc=71
  fi
  if [[ -n "$scratch_network" ]]; then
    docker network rm "$scratch_network" >/dev/null 2>&1 || rc=71
  fi
  [[ -z "$remote_restore_archive" ]] || rm -f -- "$remote_restore_archive"
  rm -f "$runtime_env"
  [[ -z "$incoming" ]] || rm -rf -- "$incoming"
  exit "$rc"
}
trap cleanup EXIT
chmod 0600 "$runtime_env"

python3 - "$env_file" "$runtime_env" "$expected_db" <<'PY'
import pathlib
import sys

source = pathlib.Path(sys.argv[1])
target = pathlib.Path(sys.argv[2])
expected_db = sys.argv[3]
values = {}
for raw in source.read_text(encoding="utf-8").splitlines():
    if not raw or "=" not in raw:
        continue
    key, value = raw.split("=", 1)
    if key in {"MONGO_URL", "MONGO_DB_NAME", "ENVIRONMENT"}:
        values[key] = value
if not values.get("MONGO_URL"):
    raise SystemExit("production runtime missing MONGO_URL")
if values.get("MONGO_DB_NAME") != expected_db:
    raise SystemExit("production Mongo database guard failed")
if values.get("ENVIRONMENT", "").strip().lower() != "production":
    raise SystemExit("production environment guard failed")
target.write_text(
    f"MONGO_URL={values['MONGO_URL']}\nMONGO_DB_NAME={values['MONGO_DB_NAME']}\n",
    encoding="utf-8",
)
target.chmod(0o600)
PY

if ! docker image inspect "$backup_image" >/dev/null 2>&1; then
  docker pull --quiet "$backup_image" >/dev/null
fi

docker run --rm --pull=never "$backup_image" mongodump --version >/dev/null
docker run --rm --pull=never "$backup_image" mongorestore --version >/dev/null

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final_dir="$backup_root/backup-$stamp"
[[ ! -e "$final_dir" ]] || { echo "backup destination already exists" >&2; exit 73; }
incoming="$(mktemp -d "$backup_root/.incoming-$stamp.XXXXXX")"
chmod 0700 "$incoming"

largest_kb=0
while IFS= read -r existing; do
  [[ -f "$existing/dump.archive.gz" ]] || continue
  size_kb="$(du -k "$existing/dump.archive.gz" | awk '{print $1}')"
  if [[ "$size_kb" =~ ^[0-9]+$ && "$size_kb" -gt "$largest_kb" ]]; then
    largest_kb="$size_kb"
  fi
done < <(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' -print | sort)

available_kb="$(df -Pk "$backup_root" | awk 'NR==2 {print $4}')"
[[ "$available_kb" =~ ^[0-9]+$ ]] || { echo 'unable to determine backup disk free space' >&2; exit 74; }
minimum_kb=$((262144 + largest_kb * 2))
if (( available_kb < minimum_kb )); then
  echo "insufficient disk headroom for safe Mongo backup rotation: available_kb=$available_kb required_kb=$minimum_kb" >&2
  exit 74
fi

backup_phase="mongodump"
docker run --rm --pull=never \
  --env-file "$runtime_env" \
  -v "$incoming:/backup" \
  "$backup_image" \
  sh -ec 'log=/backup/.mongodump.log; if ! mongodump --uri="$MONGO_URL" --db="$MONGO_DB_NAME" --archive=/backup/dump.archive.gz --gzip >"$log" 2>&1; then cat "$log" >&2; exit 1; fi; rm -f "$log"'

[[ -s "$incoming/dump.archive.gz" ]] || { echo 'mongodump produced an empty archive' >&2; exit 65; }

validation_suffix="$(printf '%s-%s' "$stamp" "$" | tr '[:upper:]' '[:lower:]')"
scratch_network="chess-studio-validate-$validation_suffix"
scratch_container="chess-studio-validate-$validation_suffix"

backup_phase="dry-run-network"
docker network create "$scratch_network" >/dev/null
docker run -d --rm --pull=never \
  --name "$scratch_container" \
  --network "$scratch_network" \
  "$backup_image" --bind_ip_all --quiet >/dev/null

backup_phase="dry-run-ready"
scratch_ready=0
for _dry_run_wait in $(seq 1 30); do
  if docker run --rm --pull=never --network "$scratch_network" "$backup_image" \
      mongosh --quiet "mongodb://$scratch_container:27017/admin" \
      --eval 'quit(db.adminCommand({ping: 1}).ok === 1 ? 0 : 1)' >/dev/null 2>&1; then
    scratch_ready=1
    break
  fi
  sleep 1
done
[[ "$scratch_ready" -eq 1 ]] || { echo 'isolated Mongo dry-run target did not become ready' >&2; exit 68; }

backup_phase="dry-run"
docker run --rm --pull=never \
  --network "$scratch_network" \
  -e SCRATCH_HOST="$scratch_container" \
  -e EXPECTED_DB="$expected_db" \
  -v "$incoming:/backup:ro" \
  "$backup_image" \
  sh -ec 'mongorestore --host="$SCRATCH_HOST" --archive=/backup/dump.archive.gz --gzip --dryRun --nsInclude="$EXPECTED_DB.*" >/dev/null'

docker rm -f "$scratch_container" >/dev/null
scratch_container=''
docker network rm "$scratch_network" >/dev/null
scratch_network=''

checksum="$(sha256sum "$incoming/dump.archive.gz" | awk '{print $1}')"
bytes="$(stat -c '%s' "$incoming/dump.archive.gz")"
printf '%s  %s\n' "$checksum" dump.archive.gz >"$incoming/SHA256SUMS"
python3 - "$incoming/manifest.json" "$stamp" "$bytes" "$checksum" "$backup_image" <<'PY'
import json
import pathlib
import sys
path = pathlib.Path(sys.argv[1])
payload = {
    "schema": 1,
    "database": "chess_study",
    "created_at_utc": sys.argv[2],
    "archive_bytes": int(sys.argv[3]),
    "sha256": sys.argv[4],
    "tool_image": sys.argv[5],
    "validation": "mongorestore --dryRun",
}
path.write_text(json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
PY
chmod 0600 "$incoming/dump.archive.gz" "$incoming/SHA256SUMS" "$incoming/manifest.json"

mv "$incoming" "$final_dir"
incoming=''

runtime_user="${SUDO_USER:-ocarun}"
runtime_home="$(getent passwd "$runtime_user" | awk -F: 'NR == 1 {print $6}')"
[[ -n "$runtime_home" ]] || { echo "unable to resolve OCI runtime home for $runtime_user" >&2; exit 67; }
runtime_python="${runtime_home}/.cache/chess-studio-oci-runtime/bin/python"
[[ -x "$runtime_python" ]] || { echo "missing OCI runtime python: $runtime_python" >&2; exit 69; }
"$runtime_python" -c 'import oci' >/dev/null 2>&1 || { echo 'OCI SDK missing from runtime python' >&2; exit 69; }

backup_phase="offhost-upload-download"
CHESS_BACKUP_DIR="$final_dir" \
CHESS_BACKUP_BUCKET="$backup_bucket" \
CHESS_BACKUP_STAMP="$stamp" \
CHESS_BACKUP_SHA256="$checksum" \
CHESS_BACKUP_BYTES="$bytes" \
CHESS_BACKUP_REMOTE_KEEP="$remote_keep_count" \
"$runtime_python" - <<'PY'
import base64
import json
import os
from pathlib import Path
import re

import oci

root = Path(os.environ["CHESS_BACKUP_DIR"])
bucket = os.environ["CHESS_BACKUP_BUCKET"]
stamp = os.environ["CHESS_BACKUP_STAMP"]
expected_sha = os.environ["CHESS_BACKUP_SHA256"].lower()
expected_bytes = int(os.environ["CHESS_BACKUP_BYTES"])
remote_keep = int(os.environ["CHESS_BACKUP_REMOTE_KEEP"])
if not re.fullmatch(r"[0-9]{8}T[0-9]{6}Z", stamp):
    raise SystemExit("invalid backup stamp")
if not re.fullmatch(r"[0-9a-f]{64}", expected_sha):
    raise SystemExit("invalid backup sha256")
if remote_keep < 3:
    raise SystemExit("remote retention must preserve more than two generations")

signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
client = oci.object_storage.ObjectStorageClient(config={}, signer=signer)
retry = oci.retry.DEFAULT_RETRY_STRATEGY
namespace = str(client.get_namespace(retry_strategy=retry).data or "")
if not namespace:
    raise SystemExit("empty OCI Object Storage namespace")

prefix = f"mongo/backup-{stamp}/"
files = ("dump.archive.gz", "SHA256SUMS", "manifest.json")
for name in files:
    path = root / name
    if not path.is_file() or path.stat().st_size <= 0:
        raise SystemExit(f"missing backup artifact: {name}")
    kwargs = {
        "content_length": path.stat().st_size,
        "if_none_match": "*",
        "retry_strategy": retry,
    }
    if name == "dump.archive.gz":
        kwargs.update({
            "opc_checksum_algorithm": "SHA256",
            "opc_content_sha256": base64.b64encode(bytes.fromhex(expected_sha)).decode("ascii"),
            "opc_meta": {"sha256": expected_sha, "backup-stamp": stamp},
        })
    with path.open("rb") as handle:
        client.put_object(namespace, bucket, prefix + name, handle, **kwargs)

head = client.head_object(namespace, bucket, prefix + "dump.archive.gz", retry_strategy=retry)
remote_length = int(head.headers.get("content-length", "-1"))
remote_sha = str(head.headers.get("opc-meta-sha256", "")).lower()
if remote_length != expected_bytes:
    raise SystemExit(f"remote archive size mismatch: {remote_length} != {expected_bytes}")
if remote_sha != expected_sha:
    raise SystemExit("remote archive sha256 metadata mismatch")

manifest = client.get_object(namespace, bucket, prefix + "manifest.json", retry_strategy=retry).data.content
payload = json.loads(manifest.decode("utf-8"))
if int(payload.get("archive_bytes", -1)) != expected_bytes or str(payload.get("sha256", "")).lower() != expected_sha:
    raise SystemExit("remote manifest does not attest the uploaded archive")

restore_path = root / ".remote-restore.archive.gz"
remote = client.get_object(namespace, bucket, prefix + "dump.archive.gz", retry_strategy=retry)
with restore_path.open("wb") as handle:
    for chunk in iter(lambda: remote.data.raw.read(1024 * 1024), b""):
        handle.write(chunk)
if restore_path.stat().st_size != expected_bytes:
    raise SystemExit("downloaded remote archive size mismatch")
import hashlib
digest = hashlib.sha256()
with restore_path.open("rb") as handle:
    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
        digest.update(chunk)
if digest.hexdigest().lower() != expected_sha:
    raise SystemExit("downloaded remote archive sha256 mismatch")

versions = []
page = None
while True:
    response = client.list_object_versions(
        namespace,
        bucket,
        prefix="mongo/backup-",
        fields="name,size,timeCreated,timeModified",
        page=page,
        retry_strategy=retry,
    )
    versions.extend(getattr(response.data, "items", None) or getattr(response.data, "objects", None) or [])
    page = response.headers.get("opc-next-page")
    if not page:
        break

backup_re = re.compile(r"^mongo/backup-([0-9]{8}T[0-9]{6}Z)/")
stamps = sorted(
    {
        match.group(1)
        for item in versions
        if (match := backup_re.match(str(getattr(item, "name", "") or "")))
    },
    reverse=True,
)
print(
    "CHESS_STUDIO_MONGO_BACKUP_OFFHOST_STAGED "
    f"bucket={bucket} timestamp={stamp} generations={len(stamps)} "
    f"bytes={expected_bytes} sha256={expected_sha}"
)
PY

remote_restore_archive="$final_dir/.remote-restore.archive.gz"
[[ -s "$remote_restore_archive" ]] || { echo 'remote restore drill archive missing after download' >&2; exit 65; }
printf '%s  %s\n' "$checksum" "$remote_restore_archive" | sha256sum -c - >/dev/null

scratch_suffix="$(printf '%s-%s' "$stamp" "$$" | tr '[:upper:]' '[:lower:]')"
scratch_network="chess-studio-restore-$scratch_suffix"
scratch_container="chess-studio-restore-$scratch_suffix"
backup_phase="scratch-network"
docker network create "$scratch_network" >/dev/null
docker run -d --rm --pull=never \
  --name "$scratch_container" \
  --network "$scratch_network" \
  "$backup_image" --bind_ip_all --quiet >/dev/null

backup_phase="scratch-ready"
scratch_ready=0
for _restore_wait in $(seq 1 30); do
  if docker run --rm --pull=never --network "$scratch_network" "$backup_image" \
      mongosh --quiet "mongodb://$scratch_container:27017/admin" \
      --eval 'quit(db.adminCommand({ping: 1}).ok === 1 ? 0 : 1)' >/dev/null 2>&1; then
    scratch_ready=1
    break
  fi
  sleep 1
done
[[ "$scratch_ready" -eq 1 ]] || { echo 'isolated Mongo restore target did not become ready' >&2; exit 68; }

backup_phase="scratch-restore"
docker run --rm --pull=never \
  --network "$scratch_network" \
  -e SCRATCH_HOST="$scratch_container" \
  -v "$final_dir:/backup:ro" \
  "$backup_image" \
  sh -ec 'mongorestore --host="$SCRATCH_HOST" --archive=/backup/.remote-restore.archive.gz --gzip --nsInclude="chess_study.*" >/dev/null'

backup_phase="scratch-query"
restore_summary="$(docker run --rm --pull=never --network "$scratch_network" "$backup_image" \
  mongosh --quiet "mongodb://$scratch_container:27017/chess_study" --eval '
    const names = db.getCollectionNames();
    if (names.length === 0) quit(41);
    let documents = 0;
    for (const name of names) documents += db.getCollection(name).estimatedDocumentCount();
    print(JSON.stringify({collections: names.length, documents}));
  ')"
[[ "$restore_summary" == *'"collections":'* ]] || { echo 'isolated Mongo restore verification returned no collection summary' >&2; exit 65; }
printf 'CHESS_STUDIO_MONGO_RESTORE_DRILL_OK timestamp=%s source=oci-object-storage %s\n' "$stamp" "$restore_summary"

docker rm -f "$scratch_container" >/dev/null
scratch_container=''
docker network rm "$scratch_network" >/dev/null
scratch_network=''
rm -f -- "$remote_restore_archive"
remote_restore_archive=''

backup_phase="remote-prune"
CHESS_BACKUP_BUCKET="$backup_bucket" \
CHESS_BACKUP_REMOTE_KEEP="$remote_keep_count" \
"$runtime_python" - <<'PY'
import os
import re
import oci

bucket = os.environ["CHESS_BACKUP_BUCKET"]
remote_keep = int(os.environ["CHESS_BACKUP_REMOTE_KEEP"])
signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
client = oci.object_storage.ObjectStorageClient(config={}, signer=signer)
retry = oci.retry.DEFAULT_RETRY_STRATEGY
namespace = str(client.get_namespace(retry_strategy=retry).data or "")
if not namespace:
    raise SystemExit("empty OCI Object Storage namespace")

versions = []
page = None
while True:
    response = client.list_object_versions(
        namespace,
        bucket,
        prefix="mongo/backup-",
        fields="name,size,timeCreated,timeModified",
        page=page,
        retry_strategy=retry,
    )
    versions.extend(getattr(response.data, "items", None) or getattr(response.data, "objects", None) or [])
    page = response.headers.get("opc-next-page")
    if not page:
        break

backup_re = re.compile(r"^mongo/backup-([0-9]{8}T[0-9]{6}Z)/")
stamps = sorted(
    {
        match.group(1)
        for item in versions
        if (match := backup_re.match(str(getattr(item, "name", "") or "")))
    },
    reverse=True,
)
expired = set(stamps[remote_keep:])
for item in versions:
    name = str(getattr(item, "name", "") or "")
    match = backup_re.match(name)
    if not match or match.group(1) not in expired:
        continue
    version_id = str(getattr(item, "version_id", "") or "")
    if not version_id:
        raise SystemExit(f"versioned backup object missing version id: {name}")
    client.delete_object(namespace, bucket, name, version_id=version_id, retry_strategy=retry)

print(
    "CHESS_STUDIO_MONGO_BACKUP_OFFHOST_OK "
    f"bucket={bucket} retained={min(len(stamps), remote_keep)}"
)
PY

backup_phase="local-prune"
mapfile -t backups < <(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' -printf '%f\n' | sort -r)
retained=0
for name in "${backups[@]}"; do
  ((retained+=1))
  if (( retained > keep_count )); then
    rm -rf -- "$backup_root/$name"
  fi
done

mapfile -t remaining < <(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' -printf '%f\n' | sort -r)
[[ "${#remaining[@]}" -le "$keep_count" ]] || { echo 'backup retention pruning failed' >&2; exit 70; }
[[ -d "$final_dir" ]] || { echo 'new backup disappeared during retention pruning' >&2; exit 70; }

backup_phase="complete"
printf 'CHESS_STUDIO_MONGO_BACKUP_OK timestamp=%s bytes=%s retained=%s remote_retained=%s bucket=%s sha256=%s\n' \
  "$stamp" "$bytes" "${#remaining[@]}" "$remote_keep_count" "$backup_bucket" "$checksum"
