import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const linkBase = 'block px-4 py-2 rounded text-sm font-medium transition';
const linkInactive = 'text-slate-300 hover:bg-slate-700 hover:text-white';
const linkActive = 'bg-brand-600 text-white';

function IconMenu(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function IconClose(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Cerrar sidebar al cambiar de ruta (UX mobile: tras clickear un link
  // queremos que el menu se oculte y se vea el contenido).
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Bloquear scroll del body cuando el sidebar overlay esta abierto en mobile.
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen lg:flex">
      {/* Top bar mobile-only */}
      <header className="lg:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow">
        <div className="text-base font-semibold">DocScan Finance CR</div>
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Abrir menu"
          className="p-1 rounded hover:bg-slate-700"
        >
          <IconMenu />
        </button>
      </header>

      {/* Backdrop cuando el sidebar overlay esta abierto en mobile */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          bg-slate-900 text-white flex flex-col
          fixed lg:static inset-y-0 left-0 z-50
          w-64 lg:w-60
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="px-4 py-5 border-b border-slate-700 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">DocScan Finance CR</div>
            <div className="text-xs text-slate-400">v0.1 - Fase 1</div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded hover:bg-slate-700"
            aria-label="Cerrar menu"
          >
            <IconClose />
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <NavLink to="/" end className={({isActive}) => `${linkBase} ${isActive ? linkActive : linkInactive}`}>
            Dashboard
          </NavLink>
          <NavLink to="/documents" className={({isActive}) => `${linkBase} ${isActive ? linkActive : linkInactive}`}>
            Gestion documental
          </NavLink>
          <NavLink to="/rag" className={({isActive}) => `${linkBase} ${isActive ? linkActive : linkInactive}`}>
            Consulta RAG
          </NavLink>
          <NavLink to="/chatbot" className={({isActive}) => `${linkBase} ${isActive ? linkActive : linkInactive}`}>
            Chatbot contable
          </NavLink>
          <NavLink to="/traceability" className={({isActive}) => `${linkBase} ${isActive ? linkActive : linkInactive}`}>
            Trazabilidad
          </NavLink>
          {user?.role === 'ADMIN' && (
            <div className="pt-3 mt-3 border-t border-slate-700">
              <div className="px-4 text-[10px] uppercase tracking-wide text-slate-500 mb-1">Administracion</div>
              <NavLink to="/admin/users/new" className={({isActive}) => `${linkBase} ${isActive ? linkActive : linkInactive}`}>
                Registrar usuario
              </NavLink>
              <NavLink to="/admin/users" end className={({isActive}) => `${linkBase} ${isActive ? linkActive : linkInactive}`}>
                Gestionar usuarios
              </NavLink>
              <NavLink to="/admin/google" className={({isActive}) => `${linkBase} ${isActive ? linkActive : linkInactive}`}>
                Conexion Google
              </NavLink>
            </div>
          )}
        </nav>
        <div className="p-3 border-t border-slate-700 text-sm">
          <NavLink
            to="/profile"
            className={({isActive}) => `block hover:bg-slate-800 rounded p-2 -m-2 transition ${isActive ? 'bg-slate-800' : ''}`}
            title="Mi cuenta (cambiar password)"
          >
            <div className="text-slate-300 truncate">{user?.full_name || user?.email}</div>
            <div className="text-xs text-slate-500">{user?.role} - Mi cuenta</div>
          </NavLink>
          <button
            onClick={logout}
            className="mt-2 w-full text-left text-xs text-red-300 hover:text-red-200"
          >
            Cerrar sesion
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
