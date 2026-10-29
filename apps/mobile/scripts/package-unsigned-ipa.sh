#!/usr/bin/env bash
set -euo pipefail
APP_PATH="${1:-}"
OUT_PATH="${2:-MirrorForge-legacy-unsigned.ipa}"
if [[ -z "$APP_PATH" || ! -d "$APP_PATH" ]]; then echo "Usage: $0 /path/to/App.app [output.ipa]" >&2; exit 1; fi
mkdir -p "$(dirname "$OUT_PATH")"
OUT_PATH="$(cd "$(dirname "$OUT_PATH")" && pwd)/$(basename "$OUT_PATH")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/Payload"
cp -R "$APP_PATH" "$TMP/Payload/MirrorForge.app"
# Do not add or retain a signature; this artifact is intended for testing/re-signing on supported devices.
rm -rf "$TMP/Payload/MirrorForge.app/_CodeSignature"
find "$TMP/Payload/MirrorForge.app" -name 'embedded.mobileprovision' -delete
(cd "$TMP" && /usr/bin/zip -qr "$OUT_PATH" Payload)
echo "Created unsigned IPA package at $OUT_PATH. This is not installable on ordinary iOS devices until properly signed; actual jailbreak compatibility depends on iOS version and device."
