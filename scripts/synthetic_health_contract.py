#!/usr/bin/env python3
"""Cheap no-network contract for the production synthetic probe."""
from synthetic_health_check import api_base

assert api_base("https://api.example.test") == "https://api.example.test/api"
assert api_base("https://api.example.test/api/") == "https://api.example.test/api"
assert api_base("api.example.test") == "https://api.example.test/api"

try:
    api_base("")
except ValueError:
    pass
else:
    raise AssertionError("empty synthetic base URL must fail")

print("synthetic-health-contract OK")
