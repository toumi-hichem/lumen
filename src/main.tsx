import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { useSettingsStore } from '@/store/settingsStore'
import { isSupertonicInstalled } from '@/tts/supertonic/install'
import { isKokoroInstalled } from '@/tts/kokoro/install'
import { App } from './App'
import { registerServiceWorker } from './pwa'
import './theme/uiFonts'
import './index.css'
import './ui/ui.css'

// Register the SW early so it can take control and make the page cross-origin
// isolated (enables multi-threaded onnxruntime-web for Supertonic TTS).
registerServiceWorker()

// Hydrate persisted settings, then pick the best default TTS engine if the
// user hasn't made an explicit choice yet.
void useSettingsStore
  .getState()
  .hydrate()
  .then(async () => {
    const { tts, setTts } = useSettingsStore.getState()
    // If the user explicitly chose a working engine, respect it.
    if (tts.engineChosen && tts.engineId !== 'web-speech') return
    // Supertonic and Kokoro are both on-device options; prefer whichever is
    // already installed. Supertonic is the incumbent default when both (or
    // neither) are, so existing users never get silently switched.
    if (await isSupertonicInstalled()) {
      setTts({ engineId: 'supertonic' })
      return
    }
    if (await isKokoroInstalled()) {
      setTts({ engineId: 'kokoro' })
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
