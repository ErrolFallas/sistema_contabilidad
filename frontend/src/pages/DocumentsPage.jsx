import { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../services/api.js';
import { useAuth } from '../auth/AuthContext.jsx';

const STATUS_COLORS = {
  COMPLETED: 'bg-green-100 text-green-800',
  PERSISTED: 'bg-blue-100 text-blue-800',
  PROCESSING: 'bg-yellow-100 text-yellow-800',
  PENDING: 'bg-slate-100 text-slate-700',
  DUPLICATE: 'bg-purple-100 text-purple-800',
  REVIEW: 'bg-amber-100 text-amber-800',
  ERROR: 'bg-red-100 text-red-800',
};

const FILTER_STATUSES = ['COMPLETED', 'PROCESSING', 'PERSISTED', 'REVIEW', 'DUPLICATE', 'ERROR', 'PENDING'];
const FILTER_SOURCES = ['DRIVE', 'GMAIL', 'MANUAL'];

function StatusBadge({ status }) {
  const cls = STATUS_COLORS[status] || 'bg-slate-100 text-slate-700';
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{status}</span>;
}

function toggleInList(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function ChipMulti({ options, value, onChange }) {
  return (
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
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export default function DocumentsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  const [filterStatuses, setFilterStatuses] = useState([]);
  const [filterSources, setFilterSources] = useState([]);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  const filterQuery = useMemo(() => {
    const p = new URLSearchParams();
    p.set('limit', '50');
    if (filterStatuses.length) p.set('status', filterStatuses.join(','));
    if (filterSources.length) p.set('source', filterSources.join(','));
    if (filterFrom) p.set('from', filterFrom);
    if (filterTo) p.set('to', filterTo);
    if (filterSearch.trim()) p.set('search', filterSearch.trim());
    return p.toString();
  }, [filterStatuses, filterSources, filterFrom, filterTo, filterSearch]);

  const anyFilter = filterStatuses.length || filterSources.length || filterFrom || filterTo || filterSearch.trim();

  const { data, isLoading } = useQuery({
    queryKey: ['documents', 'list', filterQuery],
    queryFn: () => api.get(`/api/documents?${filterQuery}`).then((r) => r.data),
    refetchInterval: 5000,
  });

  function clearFilters() {
    setFilterStatuses([]);
    setFilterSources([]);
    setFilterFrom('');
    setFilterTo('');
    setFilterSearch('');
  }

  const mutation = useMutation({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/api/documents/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
      });
      return data;
    },
    onMutate: () => { setUploading(true); setUploadError(null); setLastResult(null); },
    onSuccess: (data) => { setLastResult(data); qc.invalidateQueries({ queryKey: ['documents', 'list'] }); },
    onError: (err) => { setUploadError(err?.response?.data?.message || err.message); },
    onSettled: () => setUploading(false),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/documents/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents', 'list'] }),
    onError: (err) => alert(err?.response?.data?.message || err.message),
  });

  const resetMutation = useMutation({
    mutationFn: () => api.delete('/api/documents/reintegro/reset').then((r) => r.data),
    onSuccess: () => alert('Reintegro reiniciado. El proximo upload empieza en fila 14.'),
    onError: (err) => alert(err?.response?.data?.message || err.message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: () => api.delete('/api/documents', {
      headers: { 'X-Confirm-Bulk-Delete': 'ELIMINAR' },
    }).then((r) => r.data),
    onSuccess: (data) => {
      alert(
        `Eliminados ${data.documents_deleted} documentos.\n` +
        `Archivos fisicos removidos: ${data.physical_files_removed}.\n` +
        `Reintegro reiniciado: ${data.reintegro_reset.xlsx ? 'si' : 'no'}.`
      );
      qc.invalidateQueries({ queryKey: ['documents', 'list'] });
    },
    onError: (err) => alert(err?.response?.data?.message || err.message),
  });

  function handleDelete(d) {
    if (!confirm(`Eliminar documento #${d.id} "${d.original_filename}"?\n\nEsto borra el archivo fisico y todos sus registros (factura, OCR, trazabilidad). Las celdas ya escritas en el Excel permanecen hasta que reinicies el Reintegro.`)) return;
    deleteMutation.mutate(d.id);
  }

  function handleResetReintegro() {
    if (!confirm('Reiniciar Reintegro?\n\nBorra el archivo Reintegro.xlsx actual. El proximo upload empezara en fila 14. La auditoria en base de datos se preserva.')) return;
    resetMutation.mutate();
  }

  function handleBulkDelete() {
    const total = data?.total || 0;
    if (total === 0) {
      alert('No hay documentos para eliminar.');
      return;
    }
    // Primera barrera: confirm grande con consecuencias.
    const ok1 = confirm(
      `ATENCION: vas a borrar ${total} documento(s) y todo su historial:\n\n` +
      `- Documentos, facturas, lineas, OCR completo.\n` +
      `- Trazabilidad, mapeo Excel, extracciones IA.\n` +
      `- Archivos fisicos en storage/uploads.\n` +
      `- El Reintegro_actualizado.xlsx (se reinicia).\n\n` +
      `Esta accion NO se puede deshacer.\n\nContinuar?`
    );
    if (!ok1) return;
    // Segunda barrera: el usuario debe escribir ELIMINAR exactamente.
    const typed = prompt('Para confirmar definitivamente, escriba la palabra ELIMINAR en mayusculas:');
    if (typed !== 'ELIMINAR') {
      alert('Confirmacion incorrecta. Operacion cancelada.');
      return;
    }
    bulkDeleteMutation.mutate();
  }

  function handleFiles(files) {
    if (!files || !files.length) return;
    mutation.mutate(files[0]);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function downloadExcel() {
    const token = localStorage.getItem('docscan_token');
    fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/documents/reintegro/download', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error('No hay Reintegro generado aun.');
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Reintegro_actualizado.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((e) => alert(e.message));
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-1">
        <h1 className="text-xl font-semibold text-slate-800">Gestion documental</h1>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleteMutation.isPending}
                className="bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 rounded text-sm disabled:opacity-60"
                title="Borra TODOS los documentos y reinicia el Reintegro"
              >
                {bulkDeleteMutation.isPending ? 'Eliminando...' : 'Eliminar todos'}
              </button>
              <button
                onClick={handleResetReintegro}
                disabled={resetMutation.isPending}
                className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-60"
              >
                {resetMutation.isPending ? 'Reiniciando...' : 'Nuevo Reintegro'}
              </button>
            </>
          )}
          <button
            onClick={downloadExcel}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-sm"
          >
            Descargar Reintegro.xlsx
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-600 mb-4 max-w-3xl">
        Sube tus facturas en PDF o foto, o deja que el sistema las traiga solo desde tu correo (Gmail) o tu
        carpeta de Drive. La IA lee cada factura, identifica proveedor, fecha, montos e IVA, y las va anotando
        en tu hoja de Reintegro de Caja Chica. Usa los filtros para encontrar una factura especifica, o abrila
        para revisarla, corregir un dato o volver a procesarla si algo salio mal.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition ${
          dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white'
        }`}
      >
        <p className="text-slate-600 mb-2">Arrastra un archivo aqui</p>
        <p className="text-xs text-slate-400 mb-4">o</p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
        >
          {uploading ? 'Procesando...' : 'Seleccionar archivo'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.xml,application/pdf,image/jpeg,image/png,application/xml"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p className="text-xs text-slate-400 mt-3">PDF, JPG, PNG, XML. Maximo 25 MB.</p>
      </div>

      {uploadError && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">
          Error: {uploadError}
        </div>
      )}

      {lastResult && (
        <div className="mt-4 bg-green-50 border border-green-200 text-green-800 rounded p-3 text-sm">
          <div className="font-medium">Procesado correctamente</div>
          <div className="mt-1 text-xs space-y-0.5">
            <div>Documento ID: {lastResult.document_id}</div>
            <div>Estado: {lastResult.status}</div>
            {lastResult.duplicate_of && <div>Duplicado de: #{lastResult.duplicate_of}</div>}
            {lastResult.invoice_id && <div>Invoice ID: {lastResult.invoice_id}</div>}
            <div>Lineas extraidas: {lastResult.lines_count}</div>
            {lastResult.excel && (
              <div>
                Excel: hoja "{lastResult.excel.sheet_name}", fila {lastResult.excel.row_num},
                {' '}{lastResult.excel.written?.length || 0} celdas escritas
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Estado</div>
            <ChipMulti options={FILTER_STATUSES} value={filterStatuses} onChange={setFilterStatuses} />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Origen</div>
            <ChipMulti options={FILTER_SOURCES} value={filterSources} onChange={setFilterSources} />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 mt-3">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Desde</div>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Hasta</div>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[14rem]">
            <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Buscar (archivo / proveedor / numero factura)</div>
            <input
              type="text"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              placeholder="Ej: Pacific, F-001, caja_chica.pdf"
              className="border rounded px-2 py-1 text-sm w-full"
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

      <div className="mt-4 bg-white rounded-lg shadow">
        <div className="px-4 py-2 border-b flex justify-between items-center">
          <span className="text-sm font-medium text-slate-700">
            Documentos ({data?.total || 0}{anyFilter ? ' filtrados' : ''})
          </span>
          <span className="text-xs text-slate-400">
            Mas recientes primero. El boton "Eliminar" queda fijo a la derecha.
          </span>
        </div>
        {isLoading ? (
          <div className="p-6 text-slate-500 text-sm">Cargando...</div>
        ) : data?.items?.length ? (
          <div className="overflow-auto max-h-[calc(100vh-22rem)] rounded-b-lg">
          <table className="w-full text-sm min-w-[1100px] border-separate border-spacing-0">
            <thead className="text-slate-600 text-xs uppercase">
              <tr>
                <th className="sticky top-0 z-10 bg-slate-50 border-b text-left px-4 py-2">#</th>
                <th className="sticky top-0 z-10 bg-slate-50 border-b text-left px-4 py-2">Archivo</th>
                <th className="sticky top-0 z-10 bg-slate-50 border-b text-left px-4 py-2">Origen</th>
                <th className="sticky top-0 z-10 bg-slate-50 border-b text-left px-4 py-2">Tipo</th>
                <th className="sticky top-0 z-10 bg-slate-50 border-b text-left px-4 py-2">Proveedor</th>
                <th className="sticky top-0 z-10 bg-slate-50 border-b text-left px-4 py-2">Factura</th>
                <th className="sticky top-0 z-10 bg-slate-50 border-b text-right px-4 py-2">Total</th>
                <th className="sticky top-0 z-10 bg-slate-50 border-b text-left px-4 py-2">Estado</th>
                <th className="sticky top-0 z-10 bg-slate-50 border-b text-left px-4 py-2">Recibido</th>
                {isAdmin && (
                  <th className="sticky top-0 right-0 z-20 bg-slate-50 border-b border-l px-4 py-2 shadow-[-6px_0_6px_-4px_rgba(0,0,0,0.08)]">
                    Acciones
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.items.map((d) => (
                <tr key={d.id} className="group">
                  <td className="bg-white group-hover:bg-slate-50 border-b px-4 py-2 text-slate-500">{d.id}</td>
                  <td className="bg-white group-hover:bg-slate-50 border-b px-4 py-2">
                    <Link to={`/documents/${d.id}`} className="text-brand-700 hover:underline truncate inline-block max-w-[16rem]">
                      {d.original_filename}
                    </Link>
                  </td>
                  <td className="bg-white group-hover:bg-slate-50 border-b px-4 py-2 text-xs">{d.source_type}</td>
                  <td className="bg-white group-hover:bg-slate-50 border-b px-4 py-2 text-xs">{d.doc_kind}</td>
                  <td className="bg-white group-hover:bg-slate-50 border-b px-4 py-2 truncate max-w-[12rem]">{d.proveedor_nombre || '-'}</td>
                  <td className="bg-white group-hover:bg-slate-50 border-b px-4 py-2">{d.numero_factura || '-'}</td>
                  <td className="bg-white group-hover:bg-slate-50 border-b px-4 py-2 text-right">
                    {d.total != null ? `${d.moneda || ''} ${Number(d.total).toLocaleString('es-CR', { minimumFractionDigits: 2 })}` : '-'}
                  </td>
                  <td className="bg-white group-hover:bg-slate-50 border-b px-4 py-2"><StatusBadge status={d.status} /></td>
                  <td className="bg-white group-hover:bg-slate-50 border-b px-4 py-2 text-xs text-slate-500">
                    {new Date(d.received_at).toLocaleString('es-CR')}
                  </td>
                  {isAdmin && (
                    <td className="sticky right-0 z-10 bg-white group-hover:bg-slate-50 border-b border-l px-4 py-2 text-right whitespace-nowrap shadow-[-6px_0_6px_-4px_rgba(0,0,0,0.08)]">
                      <button
                        onClick={() => handleDelete(d)}
                        disabled={deleteMutation.isPending}
                        className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                        title="Eliminar documento (libera hash para resubir)"
                      >
                        Eliminar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <div className="p-6 text-slate-500 text-sm">Sin documentos aun. Suba uno arriba.</div>
        )}
      </div>
    </div>
  );
}
