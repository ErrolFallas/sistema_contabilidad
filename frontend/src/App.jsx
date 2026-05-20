import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import DocumentsPage from './pages/DocumentsPage.jsx';
import DocumentDetailPage from './pages/DocumentDetailPage.jsx';
import UsersAdminPage from './pages/UsersAdminPage.jsx';
import RegisterUserPage from './pages/RegisterUserPage.jsx';
import GoogleAdminPage from './pages/GoogleAdminPage.jsx';
import TraceabilityPage from './pages/TraceabilityPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import RagPage from './pages/RagPage.jsx';
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
        <Route path="rag" element={<RagPage />} />
        <Route path="chatbot" element={<Placeholder title="Asistente contable" description="Un chat para preguntarle al sistema cosas como 'cuanto gaste este mes', 'IVA acumulado por tarifa' o 'facturas vencidas'. La diferencia con la Consulta inteligente es que aca la IA usa los datos contables ya estructurados en lugar del texto de las facturas. Modulo aun no implementado." />} />
        <Route path="traceability" element={<TraceabilityPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route
          path="admin/users"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <UsersAdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/users/new"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <RegisterUserPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/google"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <GoogleAdminPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
