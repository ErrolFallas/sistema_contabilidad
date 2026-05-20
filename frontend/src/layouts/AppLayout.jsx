import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const linkBase = 'block px-4 py-2 rounded text-sm font-medium transition';
const linkInactive = 'text-slate-300 hover:bg-slate-700 hover:text-white';
const linkActive = 'bg-brand-600 text-white';

export default function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-slate-900 text-white flex flex-col">
        <div className="px-4 py-5 border-b border-slate-700">
          <div className="text-lg font-semibold">DocScan Finance CR</div>
          <div className="text-xs text-slate-400">v0.1 - Fase 1</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
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
            <>
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
            </>
          )}
        </nav>
        <div className="p-3 border-t border-slate-700 text-sm">
          <NavLink
            to="/profile"
            className={({isActive}) => `block hover:bg-slate-800 rounded p-2 -m-2 transition ${isActive ? 'bg-slate-800' : ''}`}
            title="Mi cuenta (cambiar password)"
          >
            <div className="text-slate-300">{user?.full_name || user?.email}</div>
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
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
