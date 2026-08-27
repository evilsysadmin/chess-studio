"""Validation helpers for optional feedback screenshots.

Feedback images are kept inside Mongo alongside the feedback item so Render's
filesystem never becomes part of the persistence contract. Validation is based
on decoded magic bytes, not the browser-provided extension/MIME alone.
"""
from __future__ import annotations

import base64
import binascii
from pathlib import PurePath

MAX_FEEDBACK_ATTACHMENTS = 3
MAX_FEEDBACK_ATTACHMENT_BYTES = 3 * 1024 * 1024
MAX_FEEDBACK_ATTACHMENTS_TOTAL_BYTES = 6 * 1024 * 1024
ALLOWED_FEEDBACK_IMAGE_MIMES = frozenset({"image/png", "image/jpeg", "image/gif"})


def _detected_mime(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    return None


def _safe_name(value: str | None, index: int, mime_type: str) -> str:
    fallback_ext = {"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif"}[mime_type]
    raw = PurePath(str(value or "").replace("\\", "/")).name.strip()
    if not raw:
        return f"captura-{index + 1}{fallback_ext}"
    clean = "".join(char for char in raw if char.isalnum() or char in "._- ()[]").strip(" .")[:120]
    return clean or f"captura-{index + 1}{fallback_ext}"


def validate_feedback_attachments(attachments) -> list[dict]:
    rows = list(attachments or [])
    if len(rows) > MAX_FEEDBACK_ATTACHMENTS:
        raise ValueError(f"Puedes adjuntar como máximo {MAX_FEEDBACK_ATTACHMENTS} imágenes.")

    total = 0
    result: list[dict] = []
    for index, item in enumerate(rows):
        declared = str(getattr(item, "mime_type", None) or getattr(item, "mimeType", None) or "").strip().lower()
        if declared == "image/jpg":
            declared = "image/jpeg"
        if declared not in ALLOWED_FEEDBACK_IMAGE_MIMES:
            raise ValueError("Sólo se admiten imágenes PNG, JPG/JPEG o GIF.")
        encoded = str(getattr(item, "data", "") or "").strip()
        try:
            raw = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("Una de las imágenes adjuntas no es válida.") from exc
        if not raw:
            raise ValueError("Una de las imágenes adjuntas está vacía.")
        if len(raw) > MAX_FEEDBACK_ATTACHMENT_BYTES:
            raise ValueError("Cada imagen de feedback puede ocupar como máximo 3 MiB.")
        total += len(raw)
        if total > MAX_FEEDBACK_ATTACHMENTS_TOTAL_BYTES:
            raise ValueError("Los adjuntos de feedback no pueden superar 6 MiB en total.")
        detected = _detected_mime(raw)
        if detected != declared:
            raise ValueError("El formato real de una imagen no coincide con PNG, JPG/JPEG o GIF.")
        name = _safe_name(getattr(item, "name", None), index, detected)
        result.append({"name": name, "mime_type": detected, "size": len(raw), "data": raw})
    return result
