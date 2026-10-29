import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mirrorforge.dashboard',
  appName: 'MirrorForge',
  webDir: 'apps/mobile/www',
  bundledWebRuntime: false,
  server: {
    // The user enters the URL of their own server in the launcher screen.
    // Navigation is intentionally user-selected; install APK/IPA files only from trusted sources.
    allowNavigation: ['*']
  },
  ios: { contentInset: 'automatic', preferredContentMode: 'mobile' },
  android: { allowMixedContent: false }
};
export default config;
