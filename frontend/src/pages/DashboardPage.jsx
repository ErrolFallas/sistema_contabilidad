import { useQuery } from '@tanstack/react-query';
import api from '../services/api.js';

function Card({ title, value, hint }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="text-2xl font-semibold text-slate-800 mt-1">{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get('/api/health').then((r) => r.data),
    refetchInterval: 10000,
  });

  const { data: docs } = useQuery({
    queryKey: ['documents', 'recent'],
    queryFn: () => api.get('/api/documents?limit=10').then((r) => r.data),
  });

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-800 mb-4">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card title="Procesadas" value="0" hint="Total" />
        <Card title="Duplicadas" value="0" />
        <Card title="Errores" value="0" />
        <Card title="Revision" value="0" />
        <Card title="Pendientes" value="0" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Estado del sistema</h2>
          <pre className="text-xs bg-slate-50 rounded p-3 overflow-x-auto">
            {JSON.stringify(health || { loading: true }, null, 2)}
          </pre>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Ultimos documentos</h2>
          {docs?.items?.length ? (
            <ul className="text-sm divide-y">
              {docs.items.map((d) => (
                <li key={d.id} className="py-2 flex justify-between">
                  <span className="text-slate-700 truncate">{d.original_filename}</span>
                  <span className="text-xs text-slate-500">{d.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-slate-500">Sin documentos aun. n8n los ingresara cuando se configure el workflow.</div>
          )}
        </div>
      </div>
    </div>
  );
}
