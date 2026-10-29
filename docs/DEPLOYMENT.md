# Deployment guide

## 1. First run

The desktop release is the simplest path for a Windows PC. Install the generated `MirrorForge-1.0.2-win32-x64-setup.exe` installer or run `MirrorForge-1.0.2-win32-x64-portable.exe` (use the matching ARM64 artifact on Windows ARM devices). It starts an embedded HTTP server and opens the administration UI. On first launch, create the administrator account on the PC itself; first-run setup rejects requests that do not originate from the local browser.

For source runs:

```bash
npm install
npm start
```

For direct server development:

```bash
npm run server
```

Default listener is `0.0.0.0:4173`; if the port is occupied, ports 4174–4187 are tried in order. The desktop window uses `127.0.0.1` and the LAN URL is printed in the console.

## 2. Devices on the same Wi-Fi

1. Open **Server settings** or the desktop startup log and note the PC's LAN IPv4 address and actual port.
2. Permit the app in the OS firewall for a trusted private network only.
3. In **Screens**, create a display layout.
4. Open **Display devices**, register a device, and assign it to the screen.
5. Copy its display URL, then open that link on a tablet, phone, Android TV browser, or mirror kiosk browser.

The display URL is a bearer credential: anyone who has the full link can view its screen. Revoke a device if the URL is exposed. The URL is not an administration credential.

## 3. Internet access

Use a secure HTTPS tunnel or a properly configured reverse proxy. A tunnel is appropriate when the ISP uses CGNAT or a private WAN address and inbound port forwarding is unavailable. Complete initial setup locally before connecting the tunnel. Put an access policy in front of the administration route if the instance is reachable publicly; use separate device display links for unattended screens.

Example quick tunnel test (not a production configuration):

```bash
cloudflared tunnel --url http://127.0.0.1:4173
```

For continuing use, create a named tunnel, map a hostname, configure access control, run it as a service, and verify TLS externally. Do not publish the dashboard through plain HTTP or directly forward its port to the internet. The dashboard service does not terminate TLS itself.

## 4. Data and backups

The packaged desktop application stores data in Electron's per-user application data directory, followed by `data/`. A direct server run uses `DATA_DIR`, `MIRRORFORGE_DATA_DIR`, or `~/.mirrorforge`. Contents include:

- `mirrorforge.sqlite`: users, screens, widgets, device links and active licence state.
- `media/`: uploaded image assets.

Close MirrorForge before making a simple file-level backup so SQLite WAL changes are checkpointed. Back up both the database and media folder and keep at least one copy off the PC. For a production deployment, use scheduled backups and test restore procedures.

## 5. Operating system builds

The desktop build matrix produces:

- Windows x64 and ARM64: one-click NSIS installer plus portable executable for each architecture.
- Linux x64 and ARM64: AppImage and DEB.
- macOS Intel x64 and Apple Silicon ARM64: DMG and ZIP (macOS 13 Ventura or later with the current Electron runtime).

Installers run the server locally without asking the end user to install Node.js or a separate database. Windows code signing and macOS Developer ID signing/notarization require publisher credentials and are not configured in V1.

## 6. Mobile and TV clients

The APK and IPA are thin native launchers. On first open, enter the PC's LAN URL or HTTPS hostname; enter a device display URL to open a dedicated screen directly. They do not host the main dashboard database on the phone. The Android build advertises itself to Android TV launchers; test D-pad focus on the target TV.

The Android APK built by CI is debug-signed for private sideloading. CI produces two unsigned iOS artifacts: the modern Capacitor client (iOS 13+) and a display-only legacy client (iOS 9+ arm64). Ordinary iPhones require valid Apple signing/provisioning; jailbreak workflows vary and are not guaranteed by this repository. The legacy IPA does not include the armv7 architecture used by 32-bit hardware such as iPad 2; those devices can open `/legacy-display/<token>` in Safari on a trusted LAN, or require a separate build made with an older Xcode toolchain.
