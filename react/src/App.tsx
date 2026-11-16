import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { AuthProvider } from './hooks/useAuth';
import { CalendarPage } from './pages/CalendarPage';
import { EventDetailPage } from './pages/EventDetailPage';

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<CalendarPage />} />
            <Route path="/events/:id" element={<EventDetailPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
