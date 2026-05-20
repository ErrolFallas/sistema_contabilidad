import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function UsersAdminPage() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [editing, setEditing] = useState(null); // {id, full_name, role, activo, password}

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/api/users').then((r) => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => api.patch(`/api/users/${id}`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setEditing(null);
    },
    onError: (err) => alert(err?.response?.data?.message || err.message),
  });

  function startEdit(u) {
    setEditing({
      id: u.id,
      email: u.email,
      full_name: u.full_name || '',
      role: u.role,
      activo: !!u.activo,
      password: '',
    });
  }

  function saveEdit() {
    const payload = {};
    const original = data.items.find((u) => u.id === editing.id);
    if (editing.full_name !== (original.full_name || '')) payload.full_name = editing.full_name;
    if (editing.role !== original.role) payload.role = editing.role;
    if (!!editing.activo !== !!original.activo) payload.activo = !!editing.activo;
    if (editing.password && editing.password.length >= 8) payload.password = editing.password;

    if (Object.keys(payload).length === 0) {
      setEditing(null);
      return;
    }
    if (editing.password && editing.password.length > 0 && editing.password.length < 8) {
      alert('La contrasena nueva debe tener al menos 8 caracteres.');
      return;
    }
    updateMutation.mutate({ id: editing.id, payload });
  }

  const adminCount = data?.admin_count ?? 0;
  const adminLimit = data?.admin_limit ?? 3;
  const adminFull = adminCount >= adminLimit;

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-1">
        <h1 className="text-xl font-semibold text-slate-800">Gestionar usuarios</h1>
        <Link
          to="/admin/users/new"
          className="bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded text-sm"
        >
          + Registrar usuario
        </Link>
      </div>
      <p className="text-sm text-slate-600 mb-4 max-w-3xl">
        Administra las cuentas del equipo: agrega o desactiva usuarios y cambia quien tiene permisos de
        administrador. Por seguridad, solo puede haber hasta 3 administradores activos al mismo tiempo, y
        ningun administrador puede sacarse a si mismo del rol ni desactivarse.
      </p>

      <div className={`rounded-lg p-3 mb-4 text-sm ${adminFull ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-slate-50 text-slate-700 border border-slate-200'}`}>
        Administradores: <strong>{adminCount} / {adminLimit}</strong>
        {adminFull && ' — limite alcanzado. Para promover otro USUARIO a ADMIN debe degradar uno existente primero.'}
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">#</th>
              <th className="text-left px-4 py-2">Correo</th>
              <th className="text-left px-4 py-2">Nombre</th>
              <th className="text-left px-4 py-2">Rol</th>
              <th className="text-left px-4 py-2">Activo</th>
              <th className="text-left px-4 py-2">Ultimo login</th>
              <th className="text-right px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan={7} className="p-6 text-slate-500">Cargando...</td></tr>
            ) : data?.items?.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-500">{u.id}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{u.full_name || '-'}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${u.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${u.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {u.activo ? 'si' : 'no'}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString('es-CR') : '-'}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => startEdit(u)}
                    className="text-xs text-brand-700 hover:text-brand-900"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-5">
            <h2 className="text-lg font-semibold mb-3">Editar usuario #{editing.id}</h2>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-slate-700">Correo</label>
                <input
                  value={editing.email}
                  disabled
                  className="mt-1 w-full border border-slate-200 bg-slate-50 rounded px-3 py-2 text-slate-500"
                />
              </div>
              <div>
                <label className="text-slate-700">Nombre completo</label>
                <input
                  value={editing.full_name}
                  onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="text-slate-700">Rol</label>
                <select
                  value={editing.role}
                  onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                  disabled={me?.id === editing.id}
                  className="mt-1 w-full border border-slate-300 rounded px-3 py-2 disabled:bg-slate-50 disabled:text-slate-500"
                >
                  <option value="USUARIO">USUARIO</option>
                  <option value="ADMIN" disabled={editing.role !== 'ADMIN' && adminFull}>
                    ADMIN {editing.role !== 'ADMIN' && adminFull ? '(limite alcanzado)' : ''}
                  </option>
                </select>
                {me?.id === editing.id && (
                  <p className="text-xs text-slate-400 mt-1">No puede cambiar su propio rol.</p>
                )}
              </div>
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editing.activo}
                    onChange={(e) => setEditing({ ...editing, activo: e.target.checked })}
                    disabled={me?.id === editing.id}
                  />
                  <span className="text-slate-700">Activo</span>
                </label>
                {me?.id === editing.id && (
                  <p className="text-xs text-slate-400">No puede desactivar su propia cuenta.</p>
                )}
              </div>
              <div>
                <label className="text-slate-700">Nueva contrasena (opcional)</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={editing.password}
                  onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                  placeholder="Dejar vacio para no cambiar"
                  className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
                />
                <p className="text-xs text-slate-400 mt-1">Si la completa, debe tener al menos 8 caracteres.</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={saveEdit}
                disabled={updateMutation.isPending}
                className="bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-60"
              >
                {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
