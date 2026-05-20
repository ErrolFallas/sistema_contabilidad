import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, LineChart, Line,
} from 'recharts';
import api from '../services/api.js';

const STATUS_COLORS = {
  COMPLETED: 'bg-green-100 text-green-800',
  PERSISTED: 'bg-blue-100 text-blue-800',
  PROCESSING: 'bg-yellow-100 text-yellow-800',
  PENDING: 'bg-slate-100 text-slate-700',
  DUPLICATE: 'bg-purple-100 text-purple-800',
  REVIEW: 'bg-amber-100 text-amber-800',
  ERROR: 'bg-red-100 text-red-800',
};

const TARIFA_COLORS = {
  '0': '#94a3b8',
  '1': '#34d399',
  '2': '#60a5fa',
  '4': '#a78bfa',
  '13': '#f59e0b',
  'EXENTO': '#cbd5e1',
  'REVISION': '#ef4444',
  'SIN_DATO': '#e5e7eb',
};

function Card({ title, value, hint, tone = 'slate' }) {
  const toneCls = {
    slate: 'text-slate-800',
    green: 'text-emerald-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
    blue: 'text-blue-700',
    purple: 'text-purple-700',
  }[tone] || 'text-slate-800';
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className={`text-2xl font-semibold mt-1 ${toneCls}`}>{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

function ChartCard({ title, subtitle, children, empty }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex justify-between items-baseline mb-3">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
      </div>
      {empty ? (
        <div className="h-56 flex items-center justify-center text-sm text-slate-400">
          Sin datos aun
        </div>
      ) : (
        <div className="h-56">{children}</div>
      )}
    </div>
  );
}

function fmtCRC(n) {
  if (n == null) return '-';
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    maximumFractionDigits: 0,
  }).format(Number(n));
}

function fmtNum(n) {
  return new Intl.NumberFormat('es-CR').format(Number(n || 0));
}

function shortenProvider(name, max = 22) {
  if (!name) return '-';
  return name.length > max ? name.slice(0, max - 1) + '...' : name;
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => api.get('/api/dashboard/stats').then((r) => r.data),
    refetchInterval: 15000,
  });

  const { data: docs } = useQuery({
    queryKey: ['documents', 'recent'],
    queryFn: () => api.get('/api/documents?limit=8').then((r) => r.data),
    refetchInterval: 10000,
  });

  const totals = stats?.totals || {};
  const ivaData = stats?.by_iva_rate || [];
  const providerData = (stats?.top_providers || []).map((p) => ({
    ...p,
    proveedor_short: shortenProvider(p.proveedor),
  }));
  const monthlyData = stats?.monthly_evolution || [];

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap justify-between items-baseline gap-2 mb-1">
        <h1 className="text-xl font-semibold text-slate-800">Panel principal</h1>
        <span className="text-xs text-slate-400">
          {isLoading ? 'Cargando...' : `Actualizado: ${new Date(stats?.generated_at || Date.now()).toLocaleTimeString('es-CR')}`}
        </span>
      </div>
      <p className="text-sm text-slate-600 mb-4 max-w-3xl">
        Tu vista rapida del estado contable: cuantas facturas se procesaron, quienes son tus principales proveedores,
        cuanto IVA acumulaste por tarifa y como evoluciono el gasto mes a mes. Los numeros se actualizan solos cada
        pocos segundos sin que tengas que recargar.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
        <Card title="Procesadas" value={fmtNum(totals.procesadas)} hint={`Total: ${fmtNum(totals.all)}`} tone="green" />
        <Card title="Pendientes" value={fmtNum(totals.pendientes)} hint="en pipeline" />
        <Card title="Revision" value={fmtNum(totals.revision)} tone="amber" />
        <Card title="Duplicadas" value={fmtNum(totals.duplicadas)} tone="purple" />
        <Card title="Errores" value={fmtNum(totals.errores)} tone="red" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <Card
          title="Tipo de cambio USD"
          value={stats?.currency_usd ? fmtCRC(stats.currency_usd.valor) : '-'}
          hint={stats?.currency_usd ? `Venta - ${new Date(stats.currency_usd.fecha).toLocaleDateString('es-CR')}` : 'Sin datos aun'}
          tone="blue"
        />
        <Card title="Origen Drive" value={fmtNum(stats?.by_source?.DRIVE)} />
        <Card title="Origen Gmail" value={fmtNum(stats?.by_source?.GMAIL)} />
        <Card title="Carga Manual" value={fmtNum(stats?.by_source?.MANUAL)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <ChartCard
          title="IVA por tarifa"
          subtitle={`${ivaData.reduce((a, b) => a + b.lineas, 0)} lineas analizadas`}
          empty={!ivaData.length}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ivaData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="tarifa" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => fmtNum(v)} />
              <Tooltip
                formatter={(value, key) => {
                  if (key === 'iva_total') return [fmtCRC(value), 'IVA total'];
                  if (key === 'base_total') return [fmtCRC(value), 'Base gravable'];
                  return [value, key];
                }}
                labelFormatter={(label) => `Tarifa ${label}`}
              />
              <Bar dataKey="iva_total" radius={[4, 4, 0, 0]}>
                {ivaData.map((row) => (
                  <Cell key={row.tarifa} fill={TARIFA_COLORS[row.tarifa] || '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Top 5 proveedores"
          subtitle="por monto total facturado"
          empty={!providerData.length}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={providerData} layout="vertical" margin={{ top: 4, right: 24, left: 24, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => fmtNum(v)} />
              <YAxis
                type="category"
                dataKey="proveedor_short"
                tick={{ fontSize: 11, fill: '#334155' }}
                width={140}
              />
              <Tooltip
                formatter={(value) => [fmtCRC(value), 'Total CRC']}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.proveedor || ''}
              />
              <Bar dataKey="total_crc" fill="#2563eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-2">
          <ChartCard
            title="Evolucion mensual"
            subtitle="Ultimos 6 meses"
            empty={!monthlyData.length}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="docFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis yAxisId="docs" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis yAxisId="crc" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => fmtNum(v)} />
                <Tooltip
                  formatter={(value, key) => {
                    if (key === 'documentos') return [value, 'Documentos'];
                    if (key === 'total_crc') return [fmtCRC(value), 'Total facturado'];
                    return [value, key];
                  }}
                />
                <Area
                  yAxisId="docs"
                  type="monotone"
                  dataKey="documentos"
                  stroke="#2563eb"
                  fill="url(#docFill)"
                  strokeWidth={2}
                />
                <Line
                  yAxisId="crc"
                  type="monotone"
                  dataKey="total_crc"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="bg-white rounded-lg shadow p-4 flex flex-col">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Errores recientes</h2>
          {stats?.errors_recent?.length ? (
            <ul className="text-sm divide-y flex-1 overflow-y-auto">
              {stats.errors_recent.map((e) => (
                <li key={e.id} className="py-2">
                  <Link to={`/documents/${e.id}`} className="text-brand-700 hover:underline text-sm truncate block">
                    #{e.id} {e.original_filename}
                  </Link>
                  <div className="text-xs text-red-600 truncate" title={e.error_message}>
                    {e.error_message || 'sin mensaje'}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-slate-400 flex-1 flex items-center justify-center">
              Sin errores. Todo en orden.
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex justify-between items-baseline mb-2">
          <h2 className="text-sm font-semibold text-slate-700">Ultimos documentos</h2>
          <Link to="/documents" className="text-xs text-brand-700 hover:underline">Ver todos</Link>
        </div>
        {docs?.items?.length ? (
          <ul className="text-sm divide-y">
            {docs.items.map((d) => (
              <li key={d.id} className="py-2 flex justify-between items-center gap-3">
                <Link to={`/documents/${d.id}`} className="text-slate-700 hover:underline truncate flex-1">
                  #{d.id} {d.original_filename}
                </Link>
                <span className="text-xs text-slate-500 whitespace-nowrap">{d.proveedor_nombre || '-'}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[d.status] || 'bg-slate-100'}`}>
                  {d.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-slate-500">Sin documentos aun.</div>
        )}
      </div>
    </div>
  );
}
