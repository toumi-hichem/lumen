import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { useSettingsStore } from '@/store/settingsStore'
import { App } from './App'
import './index.css'
import './ui/ui.css'

// Hydrate persisted settings before first paint of themed UI. Once hydrated,
// make Supertonic the default engine when its assets are already installed and
// the user hasn't deliberately chosen a different engine.
void useSettingsStore
  .getState()
  .hydrate()
  .then(async () => {
    const { tts, setTts } = useSettingsStore.getState()
    if (tts.engineChosen || tts.engineId !== 'web-speech') return
    const { isSupertonicDownloaded } = await import('@/tts/supertonic/assets')
    if (await isSupertonicDownloaded()) setTts({ engineId: 'supertonic' })
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
