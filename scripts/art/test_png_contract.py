"""Negative and positive cases for the shared Godot PNG contract."""
from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import png_contract  # noqa: E402


def clean(path: Path) -> Path:
    Image.new("RGBA", (8, 8), (0, 0, 0, 0)).save(path)
    return path


def with_chunk(path: Path, name: bytes, payload: bytes) -> None:
    data = path.read_bytes()
    end = data.rindex(b"\x00\x00\x00\x00IEND")
    chunk = struct.pack(">I", len(payload)) + name + payload + struct.pack(">I", zlib.crc32(name + payload))
    path.write_bytes(data[:end] + chunk + data[end:])


def test_clean_png_passes(tmp_path):
    assert png_contract.png_contract_errors(clean(tmp_path / "a.png")) == []


def test_halo_under_alpha_zero_fails(tmp_path):
    path = tmp_path / "a.png"
    image = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
    image.putpixel((1, 1), (255, 0, 0, 0))
    image.save(path)
    assert any("halo" in e for e in png_contract.png_contract_errors(path))


@pytest.mark.parametrize("name,payload", [(b"gAMA", struct.pack(">I", 45455)), (b"sRGB", b"\x00")])
def test_colour_chunks_fail(tmp_path, name, payload):
    path = clean(tmp_path / "a.png")
    with_chunk(path, name, payload)
    assert any(name.decode() in e for e in png_contract.png_contract_errors(path))


def test_rgb_mode_fails(tmp_path):
    path = tmp_path / "a.png"
    Image.new("RGB", (8, 8)).save(path)
    assert any("RGBA" in e for e in png_contract.png_contract_errors(path))


def test_oversized_side_fails(tmp_path):
    path = tmp_path / "a.png"
    Image.new("RGBA", (8, png_contract.MAX_TEXTURE_SIDE + 1)).save(path)
    assert any("texture limit" in e for e in png_contract.png_contract_errors(path))
