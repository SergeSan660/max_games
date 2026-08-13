#!/usr/bin/env python3
import base64
import gzip
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PARTS = [ROOT / "snapshot" / f"gz{i}.b64" for i in range(1, 5)]
EXPECTED_SHA256 = "79a6feffc0b94ccee7f68e1a56806b1d18a2d19af607831de8e9108bc02857a3"
EXPECTED_SIZE = 113937

encoded = "".join(p.read_text(encoding="utf-8").strip() for p in PARTS)
html = gzip.decompress(base64.b64decode(encoded))
sha256 = hashlib.sha256(html).hexdigest()

assert len(html) == EXPECTED_SIZE, f"size mismatch: {len(html)} != {EXPECTED_SIZE}"
assert sha256 == EXPECTED_SHA256, f"sha256 mismatch: {sha256} != {EXPECTED_SHA256}"
assert b"Rune//Caster" in html, "missing game title"
assert b"chain(" in html, "missing chain spell support"
assert b"spawn_attack" in html, "missing chained attack support"

print(f"Rune//Caster snapshot OK: {len(html)} bytes, sha256={sha256}")
