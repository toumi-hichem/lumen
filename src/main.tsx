import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { useSettingsStore } from '@/store/settingsStore'
import { App } from './App'
import './index.css'
import './ui/ui.css'

// Hydrate persisted settings before first paint of themed UI.
void useSettingsStore.getState().hydrate()

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
