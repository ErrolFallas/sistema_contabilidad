import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../services/api.js';
import { useAuth } from '../auth/AuthContext.jsx';

const schema = z.object({
  current_password: z.string().min(1, 'Password actual obligatorio'),
  new_password: z.string().min(8, 'Minimo 8 caracteres').max(200),
  confirm_password: z.string().min(1, 'Confirmacion obligatoria'),
}).refine((data) => data.new_password === data.confirm_password, {
  message: 'Las passwords nuevas no coinciden',
  path: ['confirm_password'],
}).refine((data) => data.new_password !== data.current_password, {
  message: 'La nueva debe ser distinta a la actual',
  path: ['new_password'],
});

export default function ProfilePage() {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  });

  async function onSubmit(values) {
    setSubmitting(true);
    setServerError(null);
    setSuccess(false);
    try {
      await api.patch('/api/auth/password', {
        current_password: values.current_password,
        new_password: values.new_password,
      });
      setSuccess(true);
      reset();
    } catch (err) {
      setServerError(err?.response?.data?.message || 'Error al cambiar password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-800 mb-4">Mi cuenta</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white shadow rounded p-4 lg:col-span-1">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Datos</h2>
          <dl className="text-sm space-y-2">
            <div>
              <dt className="text-xs text-slate-500 uppercase">Email</dt>
              <dd className="text-slate-800">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 uppercase">Nombre</dt>
              <dd className="text-slate-800">{user?.full_name || <span className="text-slate-400">sin nombre</span>}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 uppercase">Rol</dt>
              <dd className="text-slate-800">{user?.role}</dd>
            </div>
          </dl>
          <p className="text-xs text-slate-400 mt-4">
            Para cambiar email o nombre, contacta a un administrador.
          </p>
        </div>

        <div className="bg-white shadow rounded p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Cambiar password</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 max-w-md">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">Password actual</label>
              <input
                type="password"
                autoComplete="current-password"
                {...register('current_password')}
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                disabled={submitting}
              />
              {errors.current_password && (
                <p className="text-xs text-red-600 mt-1">{errors.current_password.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">Password nueva</label>
              <input
                type="password"
                autoComplete="new-password"
                {...register('new_password')}
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                disabled={submitting}
              />
              {errors.new_password && (
                <p className="text-xs text-red-600 mt-1">{errors.new_password.message}</p>
              )}
              <p className="text-xs text-slate-400 mt-1">Minimo 8 caracteres.</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">Confirmar password nueva</label>
              <input
                type="password"
                autoComplete="new-password"
                {...register('confirm_password')}
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                disabled={submitting}
              />
              {errors.confirm_password && (
                <p className="text-xs text-red-600 mt-1">{errors.confirm_password.message}</p>
              )}
            </div>

            {serverError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
                {serverError}
              </div>
            )}

            {success && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
                Password cambiada con exito. La sesion actual sigue activa.
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-1.5 rounded text-sm disabled:opacity-60"
              >
                {submitting ? 'Guardando...' : 'Cambiar password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
