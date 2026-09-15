#!/usr/bin/env python3
"""Fail-fast validation for the OCI API signing credentials used by Actions."""
from __future__ import annotations

import os
import re
import sys


REQUIRED = (
    "OCI_TENANCY_OCID",
    "OCI_USER_OCID",
    "OCI_FINGERPRINT",
    "OCI_PRIVATE_KEY",
)

TENANCY_RE = re.compile(r"^ocid1\.tenancy\.")
USER_RE = re.compile(r"^ocid1\.user\.")
FINGERPRINT_RE = re.compile(r"^(?:[0-9a-fA-F]{2}:){5,}[0-9a-fA-F]{2}$")
REGION_RE = re.compile(r"^[a-z]{2}-[a-z0-9-]+-[1-9][0-9]*$")
PRIVATE_KEY_RE = re.compile(r"-----BEGIN [^-\n]*PRIVATE KEY-----")


def validate(values: dict[str, str]) -> list[str]:
    errors: list[str] = []
    missing = [name for name in REQUIRED if not values.get(name, "").strip()]
    if missing:
        errors.append("missing GitHub secrets: " + ", ".join(missing))
        return errors

    if TENANCY_RE.match(values["OCI_TENANCY_OCID"].strip()) is None:
        errors.append("OCI_TENANCY_OCID is not a tenancy OCID")
    if USER_RE.match(values["OCI_USER_OCID"].strip()) is None:
        errors.append("OCI_USER_OCID is not a user OCID")
    if FINGERPRINT_RE.fullmatch(values["OCI_FINGERPRINT"].strip()) is None:
        errors.append("OCI_FINGERPRINT is not a colon-separated hexadecimal fingerprint")
    if PRIVATE_KEY_RE.search(values["OCI_PRIVATE_KEY"].replace("\r\n", "\n")) is None:
        errors.append("OCI_PRIVATE_KEY is not PEM private-key material")

    region = values.get("OCI_REGION", "eu-frankfurt-1").strip()
    if REGION_RE.fullmatch(region) is None:
        errors.append("OCI_REGION is not a valid OCI region identifier")
    return errors


def self_test() -> None:
    valid = {
        "OCI_TENANCY_OCID": "ocid1.tenancy.oc1..test",
        "OCI_USER_OCID": "ocid1.user.oc1..test",
        "OCI_FINGERPRINT": "aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99",
        "OCI_PRIVATE_KEY": "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
        "OCI_REGION": "eu-frankfurt-1",
    }
    assert validate(valid) == []

    missing = validate({})
    assert len(missing) == 1
    for name in REQUIRED:
        assert name in missing[0]

    broken = dict(valid)
    broken["OCI_FINGERPRINT"] = "not-a-fingerprint"
    assert validate(broken) == [
        "OCI_FINGERPRINT is not a colon-separated hexadecimal fingerprint"
    ]

    broken = dict(valid)
    broken["OCI_REGION"] = "Frankfurt"
    assert validate(broken) == ["OCI_REGION is not a valid OCI region identifier"]
    print("OCI auth contract self-test: OK")


def main() -> int:
    if "--self-test" in sys.argv[1:]:
        self_test()
        return 0

    errors = validate(dict(os.environ))
    for error in errors:
        print(f"::error::{error}", file=sys.stderr)
    if errors:
        return 2
    print("OCI credential contract: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
