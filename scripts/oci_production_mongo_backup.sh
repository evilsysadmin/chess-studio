#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo 'run as root (sudo)' >&2
  exit 77
fi

env_file="${CHESS_STUDIO_PRODUCTION_ENV_FILE:-/etc/chess-studio/production/backend.env}"
backup_root="${CHESS_STUDIO_MONGO_BACKUP_ROOT:-/var/lib/chess-studio-production/backups/mongo}"
backup_image="${CHESS_STUDIO_MONGO_BACKUP_IMAGE:-mongo:8.0.14}"
keep_count=2
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
cleanup() {
  rm -f "$runtime_env"
  [[ -z "$incoming" ]] || rm -rf -- "$incoming"
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

docker run --rm --pull=never \
  --env-file "$runtime_env" \
  -v "$incoming:/backup" \
  "$backup_image" \
  sh -ec 'mongodump --uri="$MONGO_URL" --db="$MONGO_DB_NAME" --archive=/backup/dump.archive.gz --gzip'

[[ -s "$incoming/dump.archive.gz" ]] || { echo 'mongodump produced an empty archive' >&2; exit 65; }

docker run --rm --pull=never \
  --env-file "$runtime_env" \
  -v "$incoming:/backup:ro" \
  "$backup_image" \
  sh -ec 'mongorestore --archive=/backup/dump.archive.gz --gzip --dryRun --nsInclude="$MONGO_DB_NAME.*" >/dev/null'

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

printf 'CHESS_STUDIO_MONGO_BACKUP_OK timestamp=%s bytes=%s retained=%s sha256=%s\n' \
  "$stamp" "$bytes" "${#remaining[@]}" "$checksum"
