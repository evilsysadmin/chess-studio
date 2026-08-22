#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
frontend = root / 'frontend'
needles = {
    'CHESS_AI_SHARED_SECRET': 'shared secret must never reach browser code',
    'CLOUDFLARE_API_TOKEN': 'Cloudflare API token must never reach browser code',
    '.workers.dev': 'browser must call FastAPI, not Worker directly',
}
violations=[]
for base in (frontend/'src', frontend/'public'):
    if not base.exists(): continue
    for path in base.rglob('*'):
        if not path.is_file() or path.suffix.lower() not in {'.js','.jsx','.ts','.tsx','.html','.json','.css'}: continue
        text=path.read_text('utf-8', errors='ignore')
        for needle,why in needles.items():
            if needle.lower() in text.lower(): violations.append((path.relative_to(root), needle, why))
if violations:
    for path,needle,why in violations: print(f'FAIL {path}: {needle} — {why}')
    sys.exit(1)
print('AI security gate: PASS')
