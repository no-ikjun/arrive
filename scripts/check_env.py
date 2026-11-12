#!/usr/bin/env python3
"""Report presence/format only; never print configuration values or secrets."""
import argparse
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit

KEYS = ("PLEOS_PROJECT_ID", "PLEOS_CLIENT_ID", "PLEOS_CLIENT_SECRET",
        "ARRIVAL_API_BASE_URL", "ARRIVAL_COMPANION_BASE_URL")


def read_settings(path):
    settings = {}
    if not path.exists():
        return settings
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError(f"Line {number}: expected KEY=VALUE (value hidden)")
        key, value = (part.strip() for part in line.split("=", 1))
        if key not in KEYS:
            continue
        if value.startswith(("'", '"')):
            if len(value) < 2 or value[-1] != value[0]:
                raise ValueError(f"Line {number}: unmatched quotes (value hidden)")
            value = value[1:-1]
        if key in settings:
            raise ValueError(f"Line {number}: duplicate setting {key} (value hidden)")
        settings[key] = value
    return settings


def valid_url(value):
    try:
        parsed = urlsplit(value)
        return (parsed.scheme in ("http", "https") and bool(parsed.hostname)
                and parsed.username is None and parsed.password is None
                and not parsed.query and not parsed.fragment
                and (parsed.port is None or 1 <= parsed.port <= 65535)
                and not any(ch.isspace() for ch in value))
    except ValueError:
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, default=Path(__file__).resolve().parents[1] / ".env.local")
    parser.add_argument("--require-project", action="store_true")
    args = parser.parse_args()
    try:
        settings = read_settings(args.file)
    except (OSError, UnicodeError, ValueError) as error:
        # Exception text from malformed file content must not expose any values.
        print(str(error) if isinstance(error, ValueError) and not isinstance(error, UnicodeError)
              else "Cannot read configuration file (details hidden)", file=sys.stderr)
        return 1
    ok = True
    for key in KEYS:
        # The shell can override file values without exporting the local file.
        value = os.environ.get(key, settings.get(key, ""))
        status = "SET" if value else "EMPTY"
        if key.endswith("BASE_URL") and value:
            if not valid_url(value):
                status = "INVALID URL (value hidden)"
                ok = False
        if key == "PLEOS_PROJECT_ID" and args.require_project and not value:
            ok = False
        if key.startswith("PLEOS_"):
            status += " / local only; not embedded in APK"
        print(f"{key}: {status}")
    print("This checks presence/format only, not Pleos credentials or server connectivity.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
