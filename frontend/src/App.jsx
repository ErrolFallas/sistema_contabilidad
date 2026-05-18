import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import DocumentsPage from './pages/DocumentsPage.jsx';
import DocumentDetailPage from './pages/DocumentDetailPage.jsx';
import Placeholder from './pages/Placeholder.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="documents/:id" element={<DocumentDetailPage />} />
        <Route path="rag" element={<Placeholder title="Consulta RAG" description="Busqueda semantica sobre OCR y XML." />} />
        <Route path="chatbot" element={<Placeholder title="Chatbot contable" description="Asistente conversacional NLP -> SQL parametrizado." />} />
        <Route path="traceability" element={<Placeholder title="Trazabilidad" description="Timeline por documento (OCR -> IA -> BD -> Excel)." />} />
        <Route
          path="admin"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <Placeholder title="Administracion" description="Usuarios, carpetas Drive, plantillas Excel." />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
