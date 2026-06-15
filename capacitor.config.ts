import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'org.wikisubmission.lumen',
  appName: 'Lumen',
  // Vite builds to dist/. This same directory is served on web, Android, and iOS.
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
