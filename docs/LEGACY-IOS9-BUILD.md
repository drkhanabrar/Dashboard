# Building the iOS 9+ legacy IPA

The legacy client is an Objective-C `WKWebView` display-only launcher. It is separate from the Capacitor client and targets iOS 9 for 64-bit devices. It does not support 32-bit devices such as iPad 2.

## Why this job is optional

The current GitHub-hosted macOS/Xcode 16.4 environment is not suitable for a true iOS 9 deployment target. Apple documents iOS 9-era on-device support in Xcode 12.5. A newer SDK can reject or produce an unsupported target for iOS 9, so the workflow does not pretend that an iOS 15+ build is an iOS 9 build.

## Requirements

1. A self-hosted macOS GitHub Actions runner with Xcode 12.5.1 and the iOS SDK installed.
2. Register the runner for this repository and add the custom label `ios9-xcode12`.
3. In **Repository → Settings → Secrets and variables → Actions → Variables**, create:
   - Name: `MIRRORFORGE_IOS9_RUNNER_READY`
   - Value: `true`
4. Run the release workflow on a version tag or manually. The `ios-legacy` job will then target the self-hosted runner and verify the Xcode version before building.

If that runner is not configured, the `ios-legacy` job is skipped and the normal Windows/Linux/macOS, Android, and modern iOS artifacts can still be released. The legacy display renderer remains available from Safari on older devices through `/legacy-display/<token>` on a trusted network.

The output IPA is unsigned. It still requires a device-compatible signing/install path; the workflow does not bypass Apple's code-signing rules.
