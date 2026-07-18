import { lazy, Suspense, useEffect, type ComponentType } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { HomeScreen } from '@/screens/HomeScreen'

// The home screen is the landing route and stays in the main bundle; every
// other screen is code-split so startup only parses what first paint needs.
const loadLibrary = () => import('@/screens/LibraryScreen')
const loadReader = () => import('@/screens/ReaderScreen')
const loadSettings = () => import('@/screens/SettingsScreen')
const loadAnnotations = () => import('@/screens/AnnotationsScreen')
const loadBookDetails = () => import('@/screens/BookDetailsScreen')
const loadBookmarks = () => import('@/screens/BookmarksScreen')
const loadStats = () => import('@/screens/StatsScreen')

function lazyScreen<T>(
  loader: () => Promise<T>,
  pick: (module: T) => ComponentType,
) {
  return lazy(() => loader().then((m) => ({ default: pick(m) })))
}

const LibraryScreen = lazyScreen(loadLibrary, (m) => m.LibraryScreen)
const ReaderScreen = lazyScreen(loadReader, (m) => m.ReaderScreen)
const SettingsScreen = lazyScreen(loadSettings, (m) => m.SettingsScreen)
const AnnotationsScreen = lazyScreen(loadAnnotations, (m) => m.AnnotationsScreen)
const BookDetailsScreen = lazyScreen(loadBookDetails, (m) => m.BookDetailsScreen)
const BookmarksScreen = lazyScreen(loadBookmarks, (m) => m.BookmarksScreen)
const StatsScreen = lazyScreen(loadStats, (m) => m.StatsScreen)

/** Warm the most likely next screens once the browser is idle. */
function prefetchLikelyScreens(): void {
  const idle: (cb: () => void) => unknown =
    'requestIdleCallback' in window
      ? (cb) => requestIdleCallback(cb, { timeout: 3000 })
      : (cb) => setTimeout(cb, 1500)
  idle(() => {
    void loadReader()
    void loadLibrary()
    void loadSettings()
  })
}

export function App() {
  useEffect(() => {
    prefetchLikelyScreens()
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const handle = CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back()
      } else {
        void CapApp.exitApp()
      }
    })
    return () => { void handle.then((h) => h.remove()) }
  }, [])

  return (
    // The empty-shell fallback keeps the themed background (pre-painted on
    // <html>) so a route chunk loading never flashes.
    <Suspense fallback={<div className="app" />}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/library" element={<LibraryScreen />} />
        <Route path="/read/:bookId" element={<ReaderScreen />} />
        <Route path="/book/:bookId" element={<BookDetailsScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/highlights" element={<AnnotationsScreen />} />
        <Route path="/bookmarks" element={<BookmarksScreen />} />
        <Route path="/stats" element={<StatsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
