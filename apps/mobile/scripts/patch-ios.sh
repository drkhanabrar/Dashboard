#!/usr/bin/env bash
set -euo pipefail
PROJECT="ios/App/App.xcodeproj/project.pbxproj"
PLIST="ios/App/App/Info.plist"
if [[ ! -f "$PROJECT" || ! -f "$PLIST" ]]; then echo "Capacitor iOS project files not found." >&2; exit 1; fi
# Set the oldest deployment target supported by the Capacitor 5 app shell.
/usr/bin/perl -0pi -e 's/IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+;/IPHONEOS_DEPLOYMENT_TARGET = 13.0;/g' "$PROJECT"
if ! /usr/libexec/PlistBuddy -c 'Print :NSAppTransportSecurity:NSAllowsArbitraryLoads' "$PLIST" >/dev/null 2>&1; then
  if ! /usr/libexec/PlistBuddy -c 'Print :NSAppTransportSecurity' "$PLIST" >/dev/null 2>&1; then
    /usr/libexec/PlistBuddy -c 'Add :NSAppTransportSecurity dict' "$PLIST"
  fi
  /usr/libexec/PlistBuddy -c 'Add :NSAppTransportSecurity:NSAllowsArbitraryLoads bool true' "$PLIST"
fi
# Allows a display owner to connect to a chosen HTTP LAN address. Use HTTPS for public access.
echo "Set iOS deployment target to 13.0 and allowed HTTP for explicitly chosen local server URLs."
