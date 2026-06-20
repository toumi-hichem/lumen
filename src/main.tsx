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
    // If the user explicitly chose a working engine, respect it.
    if (tts.engineChosen && tts.engineId !== 'web-speech') return
    // Supertonic is the highest-quality option when its assets are present.
    if (await isSupertonicDownloaded()) {
      setTts({ engineId: 'supertonic' })
      return
    }
    // On Android/iOS use the native TTS — web-speech is unavailable in the WebView.
    if (Capacitor.isNativePlatform()) {
      setTts({ engineId: 'native-tts' })
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
