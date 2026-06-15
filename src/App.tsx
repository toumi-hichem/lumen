import { Navigate, Route, Routes } from 'react-router-dom'
import { LibraryScreen } from '@/screens/LibraryScreen'
import { ReaderScreen } from '@/screens/ReaderScreen'
import { SettingsScreen } from '@/screens/SettingsScreen'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LibraryScreen />} />
      <Route path="/read/:bookId" element={<ReaderScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
