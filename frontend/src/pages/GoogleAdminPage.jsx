import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api.js';

export default function GoogleAdminPage() {
  const qc = useQueryClient();
  const [lastPoll, setLastPoll] = useState(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ['google-status'],
    queryFn: () => api.get('/api/auth/google/status').then((r) => r.data),
    refetchInterval: 10000,
  });

  const connectMutation = useMutation({
    mutationFn: () => api.post('/api/auth/google/authorize').then((r) => r.data),
    onSuccess: (data) => {
      window.open(data.authorize_url, '_blank', 'noopener');
    },
    onError: (err) => alert(err?.response?.data?.message || err.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.post('/api/auth/google/disconnect').then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['google-status'] }),
    onError: (err) => alert(err?.response?.data?.message || err.message),
  });

  const ensureFoldersMutation = useMutation({
    mutationFn: () => api.post('/api/integrations/drive/ensure-folders', null, { timeout: 60000 }).then((r) => r.data),
    onSuccess: (data) => alert(`Estructura lista.\nRoot: ${data.rootId}\nSubcarpetas: ${Object.keys(data.subfolders).join(', ')}`),
    onError: (err) => alert(err?.response?.data?.message || err.message),
  });

  // Timeout 10 minutos: OCR escaneado + Gemini puede tardar mucho cuando hay
  // varios adjuntos en cola. El backend sigue trabajando aunque el cliente caiga;
  // un timeout amplio evita "perder" la respuesta detallada.
  const POLL_TIMEOUT = 10 * 60 * 1000;

  const pollDriveMutation = useMutation({
    mutationFn: () => api.post('/api/integrations/drive/poll', null, { timeout: POLL_TIMEOUT }).then((r) => r.data),
    onSuccess: (data) => setLastPoll({ source: 'DRIVE', data }),
    onError: (err) => alert(err?.response?.data?.message || err.message),
  });

  const pollGmailMutation = useMutation({
    mutationFn: () => api.post('/api/integrations/gmail/poll', null, { timeout: POLL_TIMEOUT }).then((r) => r.data),
    onSuccess: (data) => setLastPoll({ source: 'GMAIL', data }),
    onError: (err) => alert(err?.response?.data?.message || err.message),
  });

  const { data: orphans, refetch: refetchOrphans, isFetching: orphansLoading } = useQuery({
    queryKey: ['storage-orphans'],
    queryFn: () => api.get('/api/admin/storage/orphans').then((r) => r.data),
    enabled: false,
  });

  const cleanupMutation = useMutation({
    mutationFn: () => api.post('/api/admin/storage/cleanup', null, { timeout: 60000 }).then((r) => r.data),
    onSuccess: (data) => {
      alert(
        `Limpieza completada en ${data.result.duration_ms} ms.\n\n` +
        `Temp: ${data.result.temp.deleted} borrados / ${data.result.temp.scanned} escaneados.\n` +
        `Uploads: ${data.result.uploads.deleted} borrados, ${data.result.uploads.kept_referenced} en uso, ${data.result.uploads.kept_recent} aun no caducan.`
      );
      refetchOrphans();
    },
    onError: (err) => alert(err?.response?.data?.message || err.message),
  });

  const { data: rates } = useQuery({
    queryKey: ['currency', 'list'],
    queryFn: () => api.get('/api/integrations/currency?limit=10').then((r) => r.data),
    refetchInterval: 30000,
  });

  const fetchCurrencyMutation = useMutation({
    mutationFn: () => api.post('/api/integrations/currency/fetch', null, { timeout: 30000 }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['currency'] }),
    onError: (err) => alert(err?.response?.data?.message || err.message),
  });

  const connected = !!status?.connected;

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <h1 className="text-xl font-semibold text-slate-800 mb-4">Conexion con Google (Drive + Gmail)</h1>

      <div className="bg-white rounded-lg shadow p-5 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <span className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-slate-300'}`} />
          <div className="font-medium text-slate-800">
            {isLoading ? 'Verificando...' : connected ? 'Conectado' : 'No conectado'}
          </div>
        </div>

        {connected ? (
          <div className="space-y-2 text-sm">
            <div><span className="text-slate-500">Correo:</span> <span className="font-mono">{status.google_email}</span></div>
            <div><span className="text-slate-500">Drive Root Folder:</span> <span className="font-mono text-xs">{status.drive_folder_id || '(no inicializado)'}</span></div>
            <div><span className="text-slate-500">Ultima sync Drive:</span> {status.last_drive_sync ? new Date(status.last_drive_sync).toLocaleString('es-CR') : '-'}</div>
            <div><span className="text-slate-500">Ultima sync Gmail:</span> {status.last_gmail_sync ? new Date(status.last_gmail_sync).toLocaleString('es-CR') : '-'}</div>
            <div>
              <span className="text-slate-500">Scopes:</span>
              <ul className="mt-1 text-xs space-y-0.5 ml-4 list-disc text-slate-700">
                {(status.scopes || []).map((s) => <li key={s} className="font-mono">{s}</li>)}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Necesita conectar una cuenta Google con permisos de Drive y Gmail.
            Al hacer click se abrira el consentimiento de Google en una nueva ventana.
          </p>
        )}

        <div className="mt-4 flex gap-2">
          {!connected ? (
            <button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
              className="bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-60"
            >
              {connectMutation.isPending ? 'Abriendo...' : 'Conectar Google'}
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  if (confirm('Reconectar la cuenta Google? Se reemplazara la credencial actual.')) {
                    connectMutation.mutate();
                  }
                }}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded text-sm"
              >
                Reconectar
              </button>
              <button
                onClick={() => {
                  if (confirm('Desconectar Google? Los polls Drive y Gmail dejaran de funcionar.')) {
                    disconnectMutation.mutate();
                  }
                }}
                className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded text-sm"
              >
                Desconectar
              </button>
            </>
          )}
        </div>
      </div>

      {connected && (
        <>
          <div className="bg-white rounded-lg shadow p-5 mb-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Estructura Drive</h2>
            <p className="text-xs text-slate-500 mb-3">
              Crea la carpeta <code>/{status.drive_folder_id ? 'DocScanFinanceCR' : 'DocScanFinanceCR'}</code> con
              subcarpetas Facturas, Procesadas, Errores, PlantillasExcel, OCR, Temporal.
              Idempotente: si ya existe la reutiliza.
            </p>
            <button
              onClick={() => ensureFoldersMutation.mutate()}
              disabled={ensureFoldersMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-60"
            >
              {ensureFoldersMutation.isPending ? 'Creando...' : 'Crear / verificar estructura'}
            </button>
          </div>

          <div className="bg-white rounded-lg shadow p-5 mb-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Probar polls manualmente</h2>
            <p className="text-xs text-slate-500 mb-3">
              n8n llamara a estos endpoints automaticamente cada 40 segundos.
              Aqui puede dispararlos a mano para verificar.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => pollDriveMutation.mutate()}
                disabled={pollDriveMutation.isPending}
                className="bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-60"
              >
                {pollDriveMutation.isPending ? 'Procesando...' : 'Poll Drive ahora'}
              </button>
              <button
                onClick={() => pollGmailMutation.mutate()}
                disabled={pollGmailMutation.isPending}
                className="bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-60"
              >
                {pollGmailMutation.isPending ? 'Procesando...' : 'Poll Gmail ahora'}
              </button>
            </div>

            {lastPoll && (
              <div className="mt-4">
                <div className="text-xs text-slate-500 mb-1">Ultimo poll ({lastPoll.source}):</div>
                <pre className="text-xs bg-slate-50 rounded p-3 overflow-auto max-h-80">
                  {JSON.stringify(lastPoll.data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </>
      )}

      <div className="bg-white rounded-lg shadow p-5 mb-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm font-semibold text-slate-700">Tipo de cambio USD (Hacienda CR)</h2>
          <button
            onClick={() => fetchCurrencyMutation.mutate()}
            disabled={fetchCurrencyMutation.isPending}
            className="bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-60"
          >
            {fetchCurrencyMutation.isPending ? 'Consultando...' : 'Consultar tipo cambio'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Fuente: api.hacienda.go.cr (republica BCCR). n8n consultara este endpoint
          automaticamente cada dia a las 08:00 si activa el workflow TipoCambioBCCR.
        </p>
        {rates?.items?.length ? (
          <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left py-1">Fecha</th>
                <th className="text-left py-1">Moneda</th>
                <th className="text-left py-1">Tipo</th>
                <th className="text-right py-1">Valor</th>
                <th className="text-left py-1">Fuente</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rates.items.map((r, i) => (
                <tr key={`${r.fecha}-${r.moneda}-${r.tipo}-${i}`}>
                  <td className="py-1">{r.fecha}</td>
                  <td className="py-1">{r.moneda}</td>
                  <td className="py-1">{r.tipo}</td>
                  <td className="py-1 text-right font-mono">{Number(r.valor).toFixed(2)}</td>
                  <td className="py-1 text-slate-500">{r.fuente}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-500">Sin tipos de cambio aun. Click "Consultar tipo cambio" para iniciar.</p>
        )}
      </div>

      <div className="bg-white shadow rounded p-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm font-semibold text-slate-700">Mantenimiento de almacenamiento</h2>
          <div className="flex gap-2">
            <button
              onClick={() => refetchOrphans()}
              disabled={orphansLoading}
              className="text-xs px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {orphansLoading ? 'Escaneando...' : 'Escanear huerfanos'}
            </button>
            <button
              onClick={() => { if (confirm('Borrar archivos temporales >7 dias y uploads huerfanos >30 dias?')) cleanupMutation.mutate(); }}
              disabled={cleanupMutation.isPending}
              className="text-xs px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-60"
            >
              {cleanupMutation.isPending ? 'Limpiando...' : 'Ejecutar limpieza'}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          La limpieza tambien corre automaticamente todos los dias a las 03:15 (hora local del servidor).
          Solo se borran archivos: la base de datos no se toca.
        </p>

        {orphans ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-slate-50 rounded p-3">
                <div className="text-xs text-slate-500 uppercase">Documentos en BD</div>
                <div className="text-lg font-semibold text-slate-800">{orphans.scanned_documents}</div>
              </div>
              <div className="bg-slate-50 rounded p-3">
                <div className="text-xs text-slate-500 uppercase">Archivos en uploads/</div>
                <div className="text-lg font-semibold text-slate-800">{orphans.scanned_files}</div>
              </div>
              <div className={`rounded p-3 ${orphans.orphan_files.count > 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
                <div className="text-xs text-slate-500 uppercase">Huerfanos detectados</div>
                <div className={`text-lg font-semibold ${orphans.orphan_files.count > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                  {orphans.orphan_files.count}
                  <span className="text-xs font-normal text-slate-500 ml-2">
                    ({(orphans.orphan_files.total_size_bytes / 1024).toFixed(1)} KB)
                  </span>
                </div>
              </div>
            </div>

            {orphans.missing_files.count > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <div className="text-xs font-semibold text-red-700 uppercase mb-2">
                  Documentos cuyo archivo fisico no existe ({orphans.missing_files.count})
                </div>
                <ul className="text-xs space-y-1">
                  {orphans.missing_files.items.map((m) => (
                    <li key={m.document_id} className="text-red-700">
                      #{m.document_id} - {m.original_filename} - <span className="font-mono">{m.storage_path}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {orphans.orphan_files.count > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-600 uppercase mb-2">
                  Archivos sin documento asociado
                </div>
                <div className="max-h-64 overflow-auto bg-slate-50 rounded p-2">
                  <table className="w-full text-xs">
                    <thead className="text-slate-500 sticky top-0 bg-slate-50">
                      <tr>
                        <th className="text-left py-1">Archivo</th>
                        <th className="text-right py-1">Tamano</th>
                        <th className="text-right py-1">Edad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {orphans.orphan_files.items.map((f, i) => (
                        <tr key={i}>
                          <td className="py-1 font-mono">{f.file}</td>
                          <td className="py-1 text-right">{f.size_bytes ? `${(f.size_bytes / 1024).toFixed(1)} KB` : '-'}</td>
                          <td className="py-1 text-right">{f.age_days != null ? `${f.age_days} d` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Los archivos &gt; 30 dias se borran solos en el proximo cron. Para forzar ahora use "Ejecutar limpieza".
                </p>
              </div>
            )}

            {orphans.missing_files.count === 0 && orphans.orphan_files.count === 0 && (
              <p className="text-sm text-green-700">Todo en orden. No hay huerfanos ni archivos faltantes.</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Click "Escanear huerfanos" para revisar el estado del almacenamiento.</p>
        )}
      </div>
    </div>
  );
}
