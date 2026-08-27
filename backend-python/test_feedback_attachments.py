import base64

import pytest

from feedback_attachments import validate_feedback_attachments


class Attachment:
    def __init__(self, name, mime_type, raw):
        self.name = name
        self.mime_type = mime_type
        self.data = base64.b64encode(raw).decode("ascii")


def test_accepts_png_jpeg_and_gif_by_magic_bytes():
    rows = validate_feedback_attachments([
        Attachment("screen.png", "image/png", b"\x89PNG\r\n\x1a\nbody"),
        Attachment("screen.jpg", "image/jpeg", b"\xff\xd8\xffbody"),
        Attachment("screen.gif", "image/gif", b"GIF89abody"),
    ])
    assert [row["mime_type"] for row in rows] == ["image/png", "image/jpeg", "image/gif"]
    assert all(isinstance(row["data"], bytes) for row in rows)


def test_rejects_disguised_or_unapproved_formats():
    with pytest.raises(ValueError, match="formato real"):
        validate_feedback_attachments([Attachment("fake.png", "image/png", b"GIF89abody")])

    with pytest.raises(ValueError, match="PNG"):
        validate_feedback_attachments([Attachment("vector.svg", "image/svg+xml", b"<svg></svg>")])


def test_sanitizes_filename_and_never_returns_base64_to_storage_layer():
    row = validate_feedback_attachments([
        Attachment('../../evil\n"name.png', "image/png", b"\x89PNG\r\n\x1a\nbody"),
    ])[0]
    assert "/" not in row["name"]
    assert "\\" not in row["name"]
    assert "\n" not in row["name"]
    assert '"' not in row["name"]
    assert row["data"].startswith(b"\x89PNG")
