import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../services/api.js';

const schema = z.object({
  email: z.string().email('Correo invalido'),
  full_name: z.string().min(1, 'Nombre requerido').max(190),
  password: z.string().min(8, 'Minimo 8 caracteres'),
  role: z.enum(['ADMIN', 'USUARIO']),
});

export default function RegisterUserPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState(null);

  const { data: usersData } = useQuery({
    queryKey: ['users', 'count'],
    queryFn: () => api.get('/api/users').then((r) => r.data),
  });
  const adminLimit = usersData?.admin_limit ?? 3;
  const adminCount = usersData?.admin_count ?? 0;
  const adminFull = adminCount >= adminLimit;

  const { register, handleSubmit, watch, formState: { errors, isSubmitting }, reset } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { role: 'USUARIO' },
  });
  const selectedRole = watch('role');

  const mutation = useMutation({
    mutationFn: (values) => api.post('/api/users', values).then((r) => r.data),
    onSuccess: (newUser) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      reset();
      alert(`Usuario "${newUser.email}" creado con rol ${newUser.role}.`);
      navigate('/admin/users');
    },
    onError: (err) => setServerError(err?.response?.data?.message || err.message),
  });

  function onSubmit(values) {
    setServerError(null);
    if (values.role === 'ADMIN' && adminFull) {
      setServerError(`Limite de ${adminLimit} administradores alcanzado. Degrade uno antes de crear otro.`);
      return;
    }
    mutation.mutate(values);
  }

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-xl font-semibold text-slate-800 mb-4">Registrar usuario</h1>

      <div className="bg-white rounded-lg shadow p-5 mb-4">
        <div className="text-sm text-slate-600">
          Administradores en el sistema: <strong className={adminFull ? 'text-red-600' : 'text-slate-800'}>
            {adminCount} / {adminLimit}
          </strong>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow p-5 space-y-4">
        <div>
          <label className="text-sm text-slate-700">Correo</label>
          <input
            {...register('email')}
            type="email"
            autoComplete="off"
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
        </div>
        <div>
          <label className="text-sm text-slate-700">Nombre completo</label>
          <input
            {...register('full_name')}
            type="text"
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {errors.full_name && <p className="text-xs text-red-600 mt-1">{errors.full_name.message}</p>}
        </div>
        <div>
          <label className="text-sm text-slate-700">Contrasena temporal</label>
          <input
            {...register('password')}
            type="password"
            autoComplete="new-password"
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
          <p className="text-xs text-slate-400 mt-1">Minimo 8 caracteres. El usuario debera cambiarla en su primer login.</p>
        </div>
        <div>
          <label className="text-sm text-slate-700">Rol</label>
          <select
            {...register('role')}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="USUARIO">USUARIO</option>
            <option value="ADMIN" disabled={adminFull}>ADMIN {adminFull ? '(limite alcanzado)' : ''}</option>
          </select>
          {selectedRole === 'ADMIN' && adminFull && (
            <p className="text-xs text-red-600 mt-1">No se puede crear otro ADMIN. Limite: {adminLimit}.</p>
          )}
        </div>

        {serverError && <div className="text-sm text-red-600">{serverError}</div>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isSubmitting || (selectedRole === 'ADMIN' && adminFull)}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
          >
            {isSubmitting ? 'Creando...' : 'Crear usuario'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/users')}
            className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded text-sm"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
