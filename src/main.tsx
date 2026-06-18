import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { useSettingsStore } from '@/store/settingsStore'
import { isSupertonicDownloaded } from '@/tts/supertonic/assets'
import { App } from './App'
import './index.css'
import './ui/ui.css'

// Hydrate persisted settings, then pick the best default TTS engine if the
// user hasn't made an explicit choice yet.
void useSettingsStore
  .getState()
  .hydrate()
  .then(async () => {
    const { tts, setTts } = useSettingsStore.getState()
    if (tts.engineChosen) return
    // On Android/iOS prefer the native device TTS so we never hit the
    // "speechSynthesis not supported" error in restricted WebViews.
    if (Capacitor.isNativePlatform() && tts.engineId !== 'native-tts') {
      setTts({ engineId: 'native-tts' })
      return
    }
    // On web, upgrade to Supertonic when its assets are downloaded.
    if (tts.engineId === 'web-speech' && await isSupertonicDownloaded()) {
      setTts({ engineId: 'supertonic' })
    }
  })

// HashRouter keeps routing working from file:// and inside native WebViews
// where there is no server to handle deep paths.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </ThemeProvider>
  </StrictMode>,
)
