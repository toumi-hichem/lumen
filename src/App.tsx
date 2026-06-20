import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { HomeScreen } from '@/screens/HomeScreen'
import { LibraryScreen } from '@/screens/LibraryScreen'
import { ReaderScreen } from '@/screens/ReaderScreen'
import { SettingsScreen } from '@/screens/SettingsScreen'
import { AnnotationsScreen } from '@/screens/AnnotationsScreen'
import { BookmarksScreen } from '@/screens/BookmarksScreen'
import { StatsScreen } from '@/screens/StatsScreen'

export function App() {
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
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/library" element={<LibraryScreen />} />
      <Route path="/read/:bookId" element={<ReaderScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />
      <Route path="/highlights" element={<AnnotationsScreen />} />
      <Route path="/bookmarks" element={<BookmarksScreen />} />
      <Route path="/stats" element={<StatsScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
