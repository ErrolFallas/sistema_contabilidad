import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const linkBase = 'block px-4 py-2 rounded text-sm font-medium transition';
const linkInactive = 'text-slate-300 hover:bg-slate-700 hover:text-white';
const linkActive = 'bg-brand-600 text-white';

const COLLAPSE_KEY = 'docscan_sidebar_collapsed';

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

function IconChevronLeft(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconChevronRight(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; }
    catch { return false; }
  });
  const location = useLocation();

  // Cerrar overlay mobile al cambiar de ruta.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Bloquear scroll del body cuando el overlay esta abierto.
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  // Persistir colapso desktop.
  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, sidebarCollapsed ? '1' : '0'); }
    catch { /* ignore quota */ }
  }, [sidebarCollapsed]);

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

      {/* Boton flotante para reabrir sidebar en desktop cuando esta colapsado.
          Pegado al borde izquierdo a media altura como pestana sutil para
          no tapar titulos ni botones del contenido. Mobile usa el hamburger
          del top bar; este se oculta en mobile. */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          aria-label="Mostrar menu lateral"
          title="Mostrar menu lateral"
          className="hidden lg:flex fixed top-1/2 -translate-y-1/2 left-0 z-40 bg-slate-700/30 hover:bg-slate-900/90 text-white py-3 pr-1.5 pl-1 rounded-r-md shadow-sm transition-all duration-200 hover:translate-x-0"
        >
          <IconChevronRight />
        </button>
      )}

      {/* Backdrop overlay mobile */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar:
          - Mobile: fixed con overlay, controlado por sidebarOpen
          - Desktop: static por default. Si sidebarCollapsed, se oculta con lg:hidden. */}
      <aside
        className={`
          bg-slate-900 text-white flex flex-col
          fixed lg:static inset-y-0 left-0 z-50
          w-64 lg:w-60
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${sidebarCollapsed ? 'lg:hidden' : ''}
        `}
      >
        <div className="px-4 py-5 border-b border-slate-700 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-lg font-semibold truncate">DocScan Finance CR</div>
            <div className="text-xs text-slate-400">v0.1 - Fase 1</div>
          </div>
          <div className="flex items-center gap-1">
            {/* Mobile: cerrar overlay */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded hover:bg-slate-700"
              aria-label="Cerrar menu"
              title="Cerrar menu"
            >
              <IconClose />
            </button>
            {/* Desktop: colapsar sidebar */}
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="hidden lg:flex p-1 rounded hover:bg-slate-700"
              aria-label="Ocultar menu lateral"
              title="Ocultar menu lateral"
            >
              <IconChevronLeft />
            </button>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <NavLink to="/" end className={({isActive}) => `${linkBase} ${isActive ? linkActive : linkInactive}`}>
            Panel principal
          </NavLink>
          <NavLink to="/documents" className={({isActive}) => `${linkBase} ${isActive ? linkActive : linkInactive}`}>
            Gestion documental
          </NavLink>
          <NavLink to="/rag" className={({isActive}) => `${linkBase} ${isActive ? linkActive : linkInactive}`}>
            Consulta inteligente
          </NavLink>
          {/* Chatbot contable: oculto del sidebar hasta que el modulo se implemente.
              La ruta /chatbot sigue existiendo con un placeholder informativo. */}
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
