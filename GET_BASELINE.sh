#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/evilsysadmin/chess-studio"
ARCHIVE="$REPO/archive/refs/heads/main.zip"
DEST="${1:-chess-studio-recovered}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Descargando baseline pública de $REPO ..."
curl -fL --retry 3 --retry-delay 2 "$ARCHIVE" -o "$tmp/main.zip"

echo "Extrayendo..."
python3 - "$tmp/main.zip" "$DEST" <<'PY'
import sys, zipfile, shutil
from pathlib import Path

archive = Path(sys.argv[1])
dest = Path(sys.argv[2])
if dest.exists():
    raise SystemExit(f"El destino ya existe: {dest}")

with zipfile.ZipFile(archive) as z:
    roots = {n.split("/", 1)[0] for n in z.namelist() if "/" in n}
    if len(roots) != 1:
        raise SystemExit(f"ZIP inesperado: roots={roots}")
    root = next(iter(roots))
    z.extractall(dest.parent / (dest.name + ".tmp"))
    extracted = dest.parent / (dest.name + ".tmp") / root
    shutil.move(str(extracted), str(dest))
    shutil.rmtree(dest.parent / (dest.name + ".tmp"), ignore_errors=True)

print(dest)
PY

cp "$(dirname "$0")/RECOVERY.md" "$DEST/RECOVERY-dm43.md"
echo
echo "Baseline recuperada en: $DEST"
echo "Lee: $DEST/RECOVERY-dm43.md"
