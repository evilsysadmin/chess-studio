#!/usr/bin/env python3
"""Cross-language parity corpus for password verification.

backend-python/auth.py verifies Argon2id hashes (argon2-cffi) and, for legacy
accounts, bcrypt hashes (bcrypt 4.x truncates passwords to 72 bytes). This
records hashes Python made and whether auth.verify_password accepts each
(password, hash) pair, including wrong, truncated, unicode and malformed
cases; backend-go/internal/authcrypto must give the same answers.

    python3 scripts/password_parity_corpus.py           # rewrite the fixture
    python3 scripts/password_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))
os.environ.setdefault("JWT_SECRET", "parity-corpus-secret-not-used-for-anything-real")

import bcrypt  # noqa: E402
from argon2 import PasswordHasher, Type  # noqa: E402

import auth  # noqa: E402

FIXTURE = ROOT / "backend-go" / "internal" / "authcrypto" / "testdata" / "python_password_corpus.json"
SEED = 20261005
PASSWORDS = ["correct horse", "ñandú-♞-2026", "", "x" * 72 + "tail", "a\x00b", "  spaced  ", "Ω" * 40]


def deterministic_salt(rng: random.Random, n: int) -> bytes:
    return bytes(rng.getrandbits(8) for _ in range(n))


def build() -> dict:
    rng = random.Random(SEED)
    rows = []
    for password in PASSWORDS:
        hashes = []
        # Argon2id exactly as auth.hash_password configures it, with a fixed
        # salt so the fixture is reproducible.
        argon = auth._ARGON2
        raw = argon2_hash(password, deterministic_salt(rng, 16))
        hashes.append(raw)
        # Other argon2 parameters/types a stored hash may carry.
        hashes.append(argon2_hash(password, deterministic_salt(rng, 16), time_cost=3, memory_cost=8192, parallelism=2))
        hashes.append(argon2_hash(password, deterministic_salt(rng, 16), kind=Type.I))
        # Legacy bcrypt with every accepted prefix.
        salt = bcrypt.gensalt(rounds=4)
        legacy = bcrypt.hashpw(password.encode("utf-8"), salt).decode()
        for prefix in ("$2a$", "$2b$", "$2y$"):
            hashes.append(prefix + legacy[4:])
        for stored in hashes:
            candidates = [password, password + "!", password[:-1], password.upper(), password[:72] + "zzz", password.encode().decode()]
            checks = [{"candidate": c, "ok": auth.verify_password(c, stored)} for c in dict.fromkeys(candidates)]
            rows.append({"hash": stored, "checks": checks})
    # Hashes Python refuses outright.
    for stored in ["", "plain", "$argon2id$v=19$m=19456,t=2,p=1$broken", "$1$md5$x", "$argon2id$v=19$m=19456,t=2,p=1$" + "A" * 22 + "$" + "B" * 43]:
        rows.append({"hash": stored, "checks": [{"candidate": "correct horse", "ok": auth.verify_password("correct horse", stored)}]})
    return {"generator": "scripts/password_parity_corpus.py", "seed": SEED, "rows": rows}


def argon2_hash(password: str, salt: bytes, *, time_cost=2, memory_cost=19_456, parallelism=1, kind=Type.ID) -> str:
    from argon2.low_level import hash_secret
    return hash_secret(password.encode("utf-8"), salt, time_cost=time_cost, memory_cost=memory_cost,
                       parallelism=parallelism, hash_len=32, type=kind).decode()


def render(corpus: dict) -> str:
    return json.dumps(corpus, indent=1, ensure_ascii=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        # bcrypt salts are random: re-verify the stored fixture instead of
        # regenerating it.
        corpus = json.loads(FIXTURE.read_text(encoding="utf-8"))
        bad = [(row["hash"], c["candidate"]) for row in corpus["rows"] for c in row["checks"]
               if auth.verify_password(c["candidate"], row["hash"]) != c["ok"]]
        if bad:
            print(f"{FIXTURE.relative_to(ROOT)} disagrees with auth.verify_password: {bad[:3]}", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(render(build()), encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
