import { Navigate, Route, Routes } from 'react-router-dom'
import { HomeScreen } from '@/screens/HomeScreen'
import { LibraryScreen } from '@/screens/LibraryScreen'
import { ReaderScreen } from '@/screens/ReaderScreen'
import { SettingsScreen } from '@/screens/SettingsScreen'
import { AnnotationsScreen } from '@/screens/AnnotationsScreen'
import { BookmarksScreen } from '@/screens/BookmarksScreen'
import { StatsScreen } from '@/screens/StatsScreen'

export function App() {
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
