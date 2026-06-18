import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'org.wikisubmission.lumen',
  appName: 'Lumen',
  // Vite builds to dist/. This same directory is served on web, Android, and iOS.
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#F7F8FA',
  },
  ios: {
    backgroundColor: '#F7F8FA',
  },
}

export default config
