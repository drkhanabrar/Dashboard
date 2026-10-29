# MirrorForge — Version 1.0.0

A self-hosted, multi-screen digital dashboard for smart mirrors, PCs, tablets, phones and Android TV. The desktop application bundles its own HTTP server and SQLite database; display devices connect to that server through a local network or a secure HTTPS tunnel.

> **V1 status:** This is a first deployable source baseline, not a claim of a fully certified commercial release. Build artifacts are produced by GitHub Actions. Validate the generated binaries on the actual target hardware before wider distribution.

## V1 capabilities

- **Standalone desktop app:** Electron packages the server and web interface into one installable application for Windows x64 and ARM64, Ubuntu/Linux x64 and ARM64, macOS Intel x64, and Apple Silicon ARM64 (macOS 13 Ventura or later).
- **Responsive dashboard:** desktop, tablet and mobile layouts; a dedicated full-screen display route; landscape and portrait behavior.
- **Screen management:** create and delete screens, configure screen metadata, add and edit widget configuration, and preview a screen.
- **Widget set:** clock, date, manually configured events/calendar, weather via Open-Meteo, announcement, photo and notes.
- **Display devices:** a distinct revocable URL for each registered display, tied to a screen; last-seen tracking.
- **Local media storage:** image uploads stored on the PC/server, with a 10 MB upload cap.
- **Server-side authentication:** first-run owner setup restricted to localhost, password hashing, HTTP-only session cookie, HMAC-signed session token, login rate limiting and security headers.
- **Tiered licensing scaffold:** Free, Home, Pro and Commercial tiers with server-enforced screen/widget/device quotas, a separate licence issuer, hashed licence keys, activation-seat limits, seat deactivation, issuer revalidation and Ed25519-signed licence payloads.
- **Mobile shell:** Capacitor source for Android and iOS that lets an owner connect to their own server URL. The Android workflow produces an installable debug-signed APK with Android TV launcher metadata. The iOS workflow produces an unsigned IPA intended for re-signing or compatible jailbreak workflows.
- **GitHub Actions:** CI tests and tagged release builds for the configured desktop architectures plus Android APK and iOS IPA artifacts.

## Quick start on Windows

1. Install Node.js 22 or newer (only needed for a source/developer run; the packaged desktop app includes its runtime).
2. Extract this repository, open PowerShell in the folder, then run:

   ```powershell
   npm install
   npm start
   ```

3. MirrorForge opens its local administration window. On first run, create an owner username and a password of at least 12 characters.
4. From another device on the same LAN, open the PC's LAN IP and the server port printed in the desktop console, then use a display URL created under **Display devices**.
5. Keep the PC awake and allow MirrorForge through the Windows firewall for **Private networks** only. For internet access, follow [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md); do not expose an HTTP port directly to the public internet.

The server normally starts on port `4173`; if that port is occupied it tries the next ports. The desktop application prints its selected port and LAN address to its launch log.

## Repository layout

```text
mirrorforge-v1/
├── apps/
│   ├── server/          Express server, SQLite schema, dashboard UI and display player
│   ├── license-api/     Separate licensing/activation issuer API
│   └── mobile/          Capacitor launcher shell and mobile build scripts
├── desktop/             Electron desktop server wrapper
├── docs/                Deployment, licensing and release notes
├── scripts/             Licence-key generation and issue CLI
├── tests/               Node test suite
├── .github/workflows/   CI and multi-platform release build
├── capacitor.config.ts  Capacitor app config
└── package.json         Build and development scripts
```

## Commands

| Command | Result |
|---|---|
| `npm install` | Install source dependencies |
| `npm start` | Launch the standalone desktop window and local server |
| `npm run server` | Run the server directly without Electron |
| `npm test` | Run the automated tests |
| `npm run license:api` | Run the separate licence issuer API |
| `npm run license:generate-keys` | Generate an Ed25519 issuer key pair |
| `npm run license:issue -- --tier pro --customer "Example" --seats 1` | Issue a Home/Pro/Commercial key through the issuer API |
| `npm run build:win` | Build Windows x64 installer and portable executable |
| `npm run build:win:arm64` | Build Windows ARM64 installer and portable executable |
| `npm run build:linux` | Build Linux x64 AppImage and DEB |
| `npm run build:linux:arm64` | Build Linux ARM64 AppImage and DEB |
| `npm run build:mac:intel` | Build Intel Mac DMG and ZIP |
| `npm run build:mac:arm` | Build Apple Silicon DMG and ZIP |

## GitHub release workflow

Push a version tag such as `v1.0.0` to run `.github/workflows/release.yml`. It builds desktop packages in a runner matrix, produces the Android APK and iOS IPA artifacts, and attaches the outputs to a GitHub Release. The workflow can also be run manually to inspect build artifacts without publishing a release.

GitHub-hosted runner availability and native toolchains can change. If an architecture's hosted runner is not enabled for a repository/account, switch that matrix row to an available runner or a self-hosted runner with the matching CPU architecture. macOS notarization and Windows publisher signing are not configured in V1; unsigned desktop builds may show operating-system security warnings.

## Licensing security

The desktop product contains only the **public** Ed25519 verification key at `apps/server/config/license-public-key.pem`. The issuer's private key belongs in `secrets/license-private.pem` on the issuer host (ignored by Git) or a secret manager. The issuer's admin token must be set as `LICENSE_ADMIN_TOKEN` and be at least 24 characters. Do not commit private key files, issuer tokens, Android keystores, Apple signing certificates or provisioning profiles.

The separate `MirrorForge-License-Private-Key.pem` file supplied with this source package matches the bundled public key. Copy it to `secrets/license-private.pem` on the issuer host and keep it out of Git. Do **not** run the key-generation command when using the supplied key. To create your own key pair instead, run `npm run license:generate-keys`; this changes the public key used by future builds, so rebuild all distributed server apps against the new key. If a production private key is lost or exposed, rotate it and issue a new application build.

Detailed steps: [`docs/LICENSING.md`](docs/LICENSING.md).

## Mobile distribution limitations

- **Android:** CI currently builds a debug-signed APK for private testing/sideloading. It is installable on compatible devices but is not a Play Store production-signed release. For public distribution, add a protected Android release keystore and signing stage.
- **Android TV:** the workflow adds the Leanback launcher category and marks touchscreen hardware optional. Actual TV navigation and rendering must be tested with the specific TV/remote.
- **iOS:** the workflow builds for an iOS 13.0 deployment target and packages an **unsigned** IPA. It is not installable on ordinary non-jailbroken iPhones as-is; normal distribution needs Apple signing/provisioning. Unsigned jailbreak install/re-sign processes vary by device, iOS version and jailbreak tools. This does not support iOS 8–12-era devices; the launcher is configured for iOS 13+, and actual compatibility must be verified on the target device.
- The mobile shell opens the server URL chosen by the device owner. Only connect to a server you trust. Use HTTPS over the internet. HTTP is allowed for local network compatibility and must not be considered secure on untrusted networks.

## V1 boundaries

This first release provides the server, dashboard foundation, widget configuration, display player, device links, local media, tier limits and automated build packaging. A committed npm lockfile is not included in this initial source drop; the included GitHub workflows install the pinned top-level dependency versions, and a `package-lock.json` should be committed after the first successful dependency installation for fully locked transitive dependencies. Full Google/Apple calendar OAuth, cloud photo providers, drag-and-drop canvas editor, user/tenant administration, subscription billing, app-store signing/notarization, auto-updaters, remote monitoring and certified legacy iOS builds are intentionally left for later updates.

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/LICENSING.md`](docs/LICENSING.md) and [`docs/RELEASES.md`](docs/RELEASES.md).
#   D a s h b o a r d  
 