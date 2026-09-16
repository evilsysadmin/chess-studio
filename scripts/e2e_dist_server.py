#!/usr/bin/env python3
from __future__ import annotations

import argparse
import posixpath
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


def normalize_base(raw: str) -> str:
    value = '/' + raw.strip('/')
    return value + '/'


def make_handler(root: Path, base: str):
    root = root.resolve()
    base = normalize_base(base)
    base_without_slash = base[:-1]

    class DistHandler(SimpleHTTPRequestHandler):
        def translate_path(self, path: str) -> str:
            request_path = unquote(urlsplit(path).path)
            spa_request = request_path == base_without_slash or request_path.startswith(base)
            if request_path == base_without_slash:
                relative = ''
            elif request_path.startswith(base):
                relative = request_path[len(base):]
            else:
                relative = request_path.lstrip('/')
                if not relative:
                    return str(root / '__outside_base__')

            raw_parts = [part for part in relative.split('/') if part]
            if '..' in raw_parts:
                return str(root / '__invalid_path__')

            relative = posixpath.normpath('/' + relative).lstrip('/')
            candidate = (root / relative).resolve()
            try:
                candidate.relative_to(root)
            except ValueError:
                return str(root / '__invalid_path__')

            if candidate.is_dir():
                candidate = candidate / 'index.html'
            if candidate.exists():
                return str(candidate)

            # Client-side routes under the configured base resolve to the SPA
            # shell. Root-level static URLs emitted by the production build
            # (for example /assets/* and /manifest.webmanifest) never fall back.
            if spa_request and not Path(relative).suffix:
                return str(root / 'index.html')
            return str(candidate)

        def log_message(self, format: str, *args: object) -> None:
            print(f'[e2e-dist] {self.address_string()} - {format % args}')

    return DistHandler


def main() -> int:
    parser = argparse.ArgumentParser(description='Serve a prebuilt frontend dist for Playwright without Vite.')
    parser.add_argument('--root', default='frontend/dist')
    parser.add_argument('--base', default='/chess-studio/')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=4173)
    args = parser.parse_args()

    root = Path(args.root).resolve()
    index = root / 'index.html'
    if not index.is_file():
        parser.error(f'prebuilt dist missing index.html: {index}')

    server = ThreadingHTTPServer((args.host, args.port), make_handler(root, args.base))
    print(f'[e2e-dist] serving {root} at http://{args.host}:{args.port}{normalize_base(args.base)}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
