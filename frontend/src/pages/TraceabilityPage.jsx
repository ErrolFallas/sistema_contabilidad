import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api.js';

const STATUSES = ['PENDING', 'PROCESSING', 'PERSISTED', 'COMPLETED', 'DUPLICATE', 'REVIEW', 'ERROR'];
const SOURCES = ['DRIVE', 'GMAIL', 'MANUAL'];
const STAGES = [
  'FILE_RECEIVED', 'HASH_CHECK', 'OCR_START', 'OCR_DONE',
  'GEMINI_START', 'GEMINI_DONE', 'VALIDATION_DONE',
  'MYSQL_DONE', 'EXCEL_START', 'EXCEL_DONE', 'ERROR',
];

const STAGE_LABEL = {
  FILE_RECEIVED: 'Archivo',
  HASH_CHECK: 'Dedup',
  OCR_START: 'OCR (ini)',
  OCR_DONE: 'OCR (fin)',
  XML_PARSE: 'XML',
  GEMINI_START: 'Gemini (ini)',
  GEMINI_DONE: 'Gemini (fin)',
  IVA_CLASSIFY: 'IVA',
  VALIDATION_DONE: 'Validacion',
  MYSQL_DONE: 'MySQL',
  EXCEL_START: 'Excel (ini)',
  EXCEL_DONE: 'Excel (fin)',
  ERROR: 'Error',
};

const STATUS_COLORS = {
  COMPLETED: 'bg-green-100 text-green-800',
  PERSISTED: 'bg-blue-100 text-blue-800',
  PROCESSING: 'bg-yellow-100 text-yellow-800',
  PENDING: 'bg-slate-100 text-slate-700',
  DUPLICATE: 'bg-purple-100 text-purple-800',
  REVIEW: 'bg-amber-100 text-amber-800',
  ERROR: 'bg-red-100 text-red-800',
};

const STAGE_DOT = {
  OK: 'bg-green-500',
  STARTED: 'bg-yellow-400',
  ERROR: 'bg-red-500',
  SKIPPED: 'bg-slate-400',
};

function fmtDuration(ms) {
  if (!ms || ms < 0) return '-';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function toggleInList(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function MultiSelect({ label, options, value, onChange, getLabel }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 uppercase mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = value.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(toggleInList(value, opt))}
              className={`text-xs px-2 py-1 rounded border ${
                active ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {getLabel ? getLabel(opt) : opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function TraceabilityPage() {
  const [statuses, setStatuses] = useState([]);
  const [sources, setSources] = useState([]);
  const [stages, setStages] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (statuses.length) p.set('status', statuses.join(','));
    if (sources.length) p.set('source', sources.join(','));
    if (stages.length) p.set('current_stage', stages.join(','));
    if (dateFrom) p.set('from', dateFrom);
    if (dateTo) p.set('to', dateTo);
    p.set('limit', '200');
    return p.toString();
  }, [statuses, sources, stages, dateFrom, dateTo]);

  const { data, isLoading } = useQuery({
    queryKey: ['traceability', queryString],
    queryFn: () => api.get(`/api/traceability?${queryString}`).then((r) => r.data),
    refetchInterval: 5000,
  });

  const items = data?.items || [];
  const stats = data?.stats;
  const anyFilter = statuses.length || sources.length || stages.length || dateFrom || dateTo;

  function clearFilters() {
    setStatuses([]);
    setSources([]);
    setStages([]);
    setDateFrom('');
    setDateTo('');
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap justify-between items-baseline gap-2 mb-1">
        <h1 className="text-xl font-semibold text-slate-800">Trazabilidad</h1>
        <span className="text-xs text-slate-400">
          {isLoading ? 'Cargando...' : `${data?.total || 0} documento(s) - refresca cada 5s`}
        </span>
      </div>
      <p className="text-sm text-slate-600 mb-4 max-w-3xl">
        Sigue paso a paso que paso con cada factura desde que entro al sistema: si se leyo bien, si la IA
        logro extraer todos los datos, si quedo pendiente de revision o si tuvo algun error. Si una factura
        no aparece en tu Reintegro y queres saber por que, aca lo ves.
      </p>

      <div className="bg-white shadow rounded-lg p-4 mb-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <MultiSelect label="Estado" options={STATUSES} value={statuses} onChange={setStatuses} />
          <MultiSelect label="Origen" options={SOURCES} value={sources} onChange={setSources} />
          <MultiSelect
            label="Etapa actual"
            options={STAGES}
            value={stages}
            onChange={setStages}
            getLabel={(s) => STAGE_LABEL[s] || s}
          />
        </div>
        <div className="flex flex-wrap items-end gap-4 mt-3">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Desde</div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Hasta</div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
          {anyFilter && (
            <button
              onClick={clearFilters}
              className="text-xs px-3 py-1 rounded border text-slate-700 hover:bg-slate-50"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className="xl:col-span-3 bg-white shadow rounded-lg">
          <div className="px-4 py-2 border-b text-sm font-medium text-slate-700">
            Documentos
          </div>
          {items.length === 0 ? (
            <div className="p-6 text-slate-500 text-sm">
              {anyFilter ? 'Sin resultados con los filtros aplicados.' : 'Sin documentos aun.'}
            </div>
          ) : (
            <div className="overflow-auto max-h-[calc(100vh-22rem)] rounded-b-lg">
              <table className="w-full text-sm min-w-[1100px] border-separate border-spacing-0">
                <thead className="text-slate-600 text-xs uppercase">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 border-b text-left px-3 py-2">#</th>
                    <th className="sticky top-0 z-10 bg-slate-50 border-b text-left px-3 py-2">Archivo</th>
                    <th className="sticky top-0 z-10 bg-slate-50 border-b text-left px-3 py-2">Origen</th>
                    <th className="sticky top-0 z-10 bg-slate-50 border-b text-left px-3 py-2">Estado</th>
                    <th className="sticky top-0 z-10 bg-slate-50 border-b text-left px-3 py-2">Etapa actual</th>
                    <th className="sticky top-0 z-10 bg-slate-50 border-b text-right px-3 py-2">Etapas OK</th>
                    <th className="sticky top-0 z-10 bg-slate-50 border-b text-right px-3 py-2">Duracion</th>
                    <th className="sticky top-0 z-10 bg-slate-50 border-b text-left px-3 py-2">Recibido</th>
                    <th className="sticky top-0 right-0 z-20 bg-slate-50 border-b border-l px-3 py-2 shadow-[-6px_0_6px_-4px_rgba(0,0,0,0.08)]">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => (
                    <tr key={d.id} className="group">
                      <td className="bg-white group-hover:bg-slate-50 border-b px-3 py-2 text-slate-500">{d.id}</td>
                      <td className="bg-white group-hover:bg-slate-50 border-b px-3 py-2 truncate max-w-[18rem]">
                        <Link to={`/documents/${d.id}`} className="text-brand-700 hover:underline">
                          {d.original_filename}
                        </Link>
                        {d.numero_factura && (
                          <div className="text-xs text-slate-400">Factura: {d.numero_factura}</div>
                        )}
                      </td>
                      <td className="bg-white group-hover:bg-slate-50 border-b px-3 py-2 text-xs">{d.source_type}</td>
                      <td className="bg-white group-hover:bg-slate-50 border-b px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[d.status] || 'bg-slate-100'}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="bg-white group-hover:bg-slate-50 border-b px-3 py-2 text-xs">
                        {d.current_stage ? (
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${STAGE_DOT[d.current_stage_status] || 'bg-slate-300'}`} />
                            <span className="text-slate-700">{STAGE_LABEL[d.current_stage] || d.current_stage}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                        {d.current_stage_message && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[14rem]" title={d.current_stage_message}>
                            {d.current_stage_message}
                          </div>
                        )}
                      </td>
                      <td className="bg-white group-hover:bg-slate-50 border-b px-3 py-2 text-right text-xs">
                        {d.stages_ok}/{d.stages_total}
                      </td>
                      <td className="bg-white group-hover:bg-slate-50 border-b px-3 py-2 text-right text-xs font-mono">
                        {fmtDuration(d.total_duration_ms)}
                      </td>
                      <td className="bg-white group-hover:bg-slate-50 border-b px-3 py-2 text-xs text-slate-500">
                        {new Date(d.received_at).toLocaleString('es-CR')}
                      </td>
                      <td className="sticky right-0 z-10 bg-white group-hover:bg-slate-50 border-b border-l px-3 py-2 whitespace-nowrap shadow-[-6px_0_6px_-4px_rgba(0,0,0,0.08)]">
                        <Link to={`/documents/${d.id}`} className="text-xs font-medium text-brand-700 hover:underline">
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {stats?.by_status && Object.keys(stats.by_status).length > 0 && (
            <div className="bg-white shadow rounded-lg p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Por estado</h2>
              <ul className="space-y-1">
                {Object.entries(stats.by_status)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => (
                    <li key={k} className="flex justify-between text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[k] || 'bg-slate-100'}`}>{k}</span>
                      <span className="text-slate-600 font-mono">{v}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {stats?.by_current_stage && Object.keys(stats.by_current_stage).length > 0 && (
            <div className="bg-white shadow rounded-lg p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Por etapa actual</h2>
              <ul className="space-y-1">
                {Object.entries(stats.by_current_stage)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => (
                    <li key={k} className="flex justify-between text-sm">
                      <span className="text-slate-700">{STAGE_LABEL[k] || k}</span>
                      <span className="text-slate-600 font-mono">{v}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {stats?.stage_durations?.length > 0 && (
            <div className="bg-white shadow rounded-lg p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-1">Duracion por etapa</h2>
              <p className="text-xs text-slate-400 mb-3">Promedio sobre todos los registros (global, no filtrado)</p>
              <ul className="space-y-2">
                {stats.stage_durations.map((s) => (
                  <li key={s.stage} className="text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-700">{STAGE_LABEL[s.stage] || s.stage}</span>
                      <span className="text-slate-600 font-mono text-xs">
                        avg {fmtDuration(s.avg_duration_ms)} - max {fmtDuration(s.max_duration_ms)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">{s.occurrences} corridas</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
