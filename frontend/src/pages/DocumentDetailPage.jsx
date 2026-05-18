import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api.js';

const STAGE_LABEL = {
  FILE_RECEIVED: 'Archivo recibido',
  HASH_CHECK: 'Verificacion duplicado',
  OCR_START: 'OCR (inicio)',
  OCR_DONE: 'OCR (fin)',
  XML_PARSE: 'XML parser',
  GEMINI_START: 'Gemini (inicio)',
  GEMINI_DONE: 'Gemini (fin)',
  IVA_CLASSIFY: 'Clasificacion IVA',
  VALIDATION_DONE: 'Validacion',
  MYSQL_DONE: 'MySQL persistido',
  EXCEL_START: 'Excel (inicio)',
  EXCEL_DONE: 'Excel (fin)',
  ERROR: 'Error',
};
const STATUS_DOT = {
  OK: 'bg-green-500',
  STARTED: 'bg-yellow-400',
  ERROR: 'bg-red-500',
  SKIPPED: 'bg-slate-400',
};

export default function DocumentDetailPage() {
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.get(`/api/documents/${id}`).then((r) => r.data),
  });
  const { data: traceData } = useQuery({
    queryKey: ['document', id, 'trace'],
    queryFn: () => api.get(`/api/documents/${id}/trace`).then((r) => r.data),
    refetchInterval: 4000,
  });

  if (isLoading) return <div className="p-6 text-slate-500">Cargando...</div>;
  if (!data?.document) return <div className="p-6 text-red-600">Documento no encontrado.</div>;

  const d = data.document;
  const inv = data.invoices?.[0];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/documents" className="text-sm text-brand-700 hover:underline">&larr; Volver</Link>
        <h1 className="text-xl font-semibold text-slate-800">Documento #{d.id}</h1>
        <span className="text-sm text-slate-500">{d.original_filename}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {inv && (
            <div className="bg-white shadow rounded p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Factura extraida</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Field label="Proveedor" value={inv.proveedor_nombre} />
                <Field label="Cedula" value={inv.proveedor_cedula} />
                <Field label="No. Factura" value={inv.numero_factura} />
                <Field label="Fecha" value={inv.fecha_emision?.slice(0, 10)} />
                <Field label="Moneda" value={inv.moneda} />
                <Field label="Subtotal" value={inv.subtotal} />
                <Field label="Impuesto" value={inv.impuesto_total} />
                <Field label="Total" value={inv.total} />
                <Field label="Descripcion" value={inv.descripcion} span2 />
                <Field label="Estado extraccion" value={inv.estado_extraccion} />
              </div>
            </div>
          )}

          {data.lines?.length > 0 && (
            <div className="bg-white shadow rounded p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Lineas ({data.lines.length})</h2>
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-left py-1">#</th>
                    <th className="text-left py-1">Producto</th>
                    <th className="text-left py-1">Categoria</th>
                    <th className="text-right py-1">Cant</th>
                    <th className="text-right py-1">Base</th>
                    <th className="text-center py-1">Tarifa</th>
                    <th className="text-right py-1">IVA</th>
                    <th className="text-right py-1">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="py-1">{l.linea_num || '-'}</td>
                      <td className="py-1 max-w-[14rem] truncate">{l.producto || '-'}</td>
                      <td className="py-1">{l.categoria_fiscal || '-'}</td>
                      <td className="py-1 text-right">{l.cantidad ?? '-'}</td>
                      <td className="py-1 text-right">{l.base_gravable ?? '-'}</td>
                      <td className="py-1 text-center">{l.tarifa_iva || '-'}</td>
                      <td className="py-1 text-right">{l.monto_iva ?? '-'}</td>
                      <td className="py-1 text-right">{l.total ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.excel_mapping?.length > 0 && (
            <div className="bg-white shadow rounded p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Ubicacion en Excel</h2>
              <div className="text-xs text-slate-500 mb-2">
                {data.excel_mapping[0].template_type} - {data.excel_mapping[0].sheet_name} - fila {data.excel_mapping[0].row_num}
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {data.excel_mapping.map((m) => (
                  <span key={m.id} className="bg-slate-100 rounded px-2 py-1">
                    <span className="font-mono text-slate-700">{m.cell_ref}</span>
                    <span className="text-slate-400"> </span>
                    <span className="text-slate-600">{m.field_name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.ocr?.ocr_text && (
            <div className="bg-white shadow rounded p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">
                Texto OCR (motor: {data.ocr.engine})
              </h2>
              <pre className="text-xs bg-slate-50 rounded p-3 max-h-72 overflow-auto whitespace-pre-wrap">
                {data.ocr.ocr_text}
              </pre>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white shadow rounded p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Metadatos</h2>
            <div className="text-sm space-y-1">
              <Field label="Hash" value={d.document_hash?.slice(0, 16) + '...'} />
              <Field label="Origen" value={d.source_type} />
              <Field label="Tipo" value={d.doc_kind} />
              <Field label="Estado" value={d.status} />
              <Field label="MIME" value={d.mime_type} />
              <Field label="Recibido" value={new Date(d.received_at).toLocaleString('es-CR')} />
              {d.completed_at && <Field label="Completado" value={new Date(d.completed_at).toLocaleString('es-CR')} />}
              {d.error_message && (
                <div className="mt-2 text-xs text-red-600 bg-red-50 rounded p-2">{d.error_message}</div>
              )}
            </div>
          </div>

          <div className="bg-white shadow rounded p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Trazabilidad</h2>
            <ol className="space-y-2">
              {(traceData?.trace || []).map((t) => (
                <li key={t.id} className="flex gap-2 text-sm">
                  <span className={`mt-1 w-2 h-2 rounded-full ${STATUS_DOT[t.status] || 'bg-slate-300'}`} />
                  <div className="flex-1">
                    <div className="text-slate-700">{STAGE_LABEL[t.stage] || t.stage}</div>
                    <div className="text-xs text-slate-500">
                      {t.status}
                      {t.duration_ms != null ? ` - ${t.duration_ms} ms` : ''}
                    </div>
                    {t.message && <div className="text-xs text-slate-400 mt-0.5 break-all">{t.message}</div>}
                  </div>
                </li>
              ))}
              {!traceData?.trace?.length && <li className="text-xs text-slate-500">Sin eventos.</li>}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, span2 }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <div className="text-xs text-slate-500 uppercase">{label}</div>
      <div className="text-slate-800 break-words">{value ?? <span className="text-slate-300">null</span>}</div>
    </div>
  );
}
