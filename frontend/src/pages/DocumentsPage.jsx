import { useState, useRef } from 'react';
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

function StatusBadge({ status }) {
  const cls = STATUS_COLORS[status] || 'bg-slate-100 text-slate-700';
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{status}</span>;
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

  const { data, isLoading } = useQuery({
    queryKey: ['documents', 'list'],
    queryFn: () => api.get('/api/documents?limit=50').then((r) => r.data),
    refetchInterval: 5000,
  });

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
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Gestion documental</h1>
        <div className="flex gap-2">
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

      <div className="mt-6 bg-white rounded-lg shadow">
        <div className="px-4 py-2 border-b flex justify-between items-center">
          <span className="text-sm font-medium text-slate-700">
            Documentos ({data?.total || 0})
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
