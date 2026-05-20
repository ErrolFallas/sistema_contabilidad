import { useState, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api.js';
import { useAuth } from '../auth/AuthContext.jsx';

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

const INVOICE_FIELDS = [
  { key: 'proveedor_nombre',      label: 'Proveedor',           type: 'text' },
  { key: 'proveedor_cedula',      label: 'Cedula',              type: 'text' },
  { key: 'proveedor_tipo_cedula', label: 'Tipo cedula',         type: 'enum', values: ['FISICA', 'JURIDICA', 'DIMEX', 'NITE'] },
  { key: 'numero_factura',        label: 'No. Factura',         type: 'text' },
  { key: 'fecha_emision',         label: 'Fecha emision',       type: 'date' },
  { key: 'moneda',                label: 'Moneda',              type: 'enum', values: ['CRC', 'USD', 'EUR'] },
  { key: 'subtotal',              label: 'Subtotal',            type: 'number' },
  { key: 'descuento',             label: 'Descuento',           type: 'number' },
  { key: 'impuesto_total',        label: 'Impuesto total',      type: 'number' },
  { key: 'total',                 label: 'Total',               type: 'number' },
  { key: 'descripcion',           label: 'Descripcion',         type: 'textarea', span2: true },
  { key: 'actividad_economica',   label: 'Actividad economica', type: 'text' },
  { key: 'estado_extraccion',     label: 'Estado extraccion',   type: 'enum', values: ['OK', 'FALTANTE', 'REVISION'] },
];

const LINE_FIELDS = [
  { key: 'linea_num',        type: 'number' },
  { key: 'producto',         type: 'text' },
  { key: 'categoria_fiscal', type: 'text' },
  { key: 'cantidad',         type: 'number' },
  { key: 'precio_unitario',  type: 'number' },
  { key: 'base_gravable',    type: 'number' },
  { key: 'tarifa_iva',       type: 'enum', values: ['0', '1', '2', '4', '13', 'EXENTO', 'REVISION'] },
  { key: 'porcentaje_iva',   type: 'number' },
  { key: 'monto_iva',        type: 'number' },
  { key: 'subtotal',         type: 'number' },
  { key: 'total',            type: 'number' },
];

function toInputValue(field, raw) {
  if (raw === null || raw === undefined) return '';
  if (field.type === 'date') return String(raw).slice(0, 10);
  return String(raw);
}

function fromInputValue(field, str) {
  if (str === '') return null;
  if (field.type === 'number') {
    const n = parseFloat(String(str).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return str;
}

function computeDiff(fields, original, draft) {
  const diff = {};
  for (const f of fields) {
    const orig = toInputValue(f, original?.[f.key]);
    const next = draft[f.key] ?? '';
    if (orig !== next) diff[f.key] = fromInputValue(f, next);
  }
  return diff;
}

function EditableField({ field, value, onChange, disabled }) {
  if (field.type === 'enum') {
    return (
      <select
        className="border rounded px-2 py-1 text-sm w-full"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">(sin valor)</option>
        {field.values.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    );
  }
  if (field.type === 'textarea') {
    return (
      <textarea
        className="border rounded px-2 py-1 text-sm w-full"
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    );
  }
  return (
    <input
      type={field.type === 'date' ? 'date' : field.type === 'number' ? 'text' : 'text'}
      className="border rounded px-2 py-1 text-sm w-full"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      inputMode={field.type === 'number' ? 'decimal' : undefined}
    />
  );
}

export default function DocumentDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const { data, isLoading } = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.get(`/api/documents/${id}`).then((r) => r.data),
  });
  const { data: traceData } = useQuery({
    queryKey: ['document', id, 'trace'],
    queryFn: () => api.get(`/api/documents/${id}/trace`).then((r) => r.data),
    refetchInterval: 4000,
  });
  const { data: editsData } = useQuery({
    queryKey: ['document', id, 'edits'],
    queryFn: () => api.get(`/api/documents/${id}/edits`).then((r) => r.data),
  });

  const inv = data?.invoices?.[0];

  const [editingInvoice, setEditingInvoice] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState({});
  const [invoiceReason, setInvoiceReason] = useState('');
  const [invoiceError, setInvoiceError] = useState(null);

  const [editingLines, setEditingLines] = useState(false);
  const [lineDrafts, setLineDrafts] = useState({});
  const [linesReason, setLinesReason] = useState('');
  const [linesError, setLinesError] = useState(null);

  const invoiceMutation = useMutation({
    mutationFn: (payload) => api.patch(`/api/invoices/${inv.id}`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document', id] });
      qc.invalidateQueries({ queryKey: ['document', id, 'edits'] });
      setEditingInvoice(false);
      setInvoiceReason('');
      setInvoiceError(null);
    },
    onError: (err) => setInvoiceError(err?.response?.data?.message || err.message),
  });

  const reprocessMutation = useMutation({
    mutationFn: () => api.post(`/api/documents/${id}/reprocess`).then((r) => r.data),
    onSuccess: (out) => {
      qc.invalidateQueries({ queryKey: ['document', id] });
      qc.invalidateQueries({ queryKey: ['document', id, 'trace'] });
      qc.invalidateQueries({ queryKey: ['document', id, 'edits'] });
      alert(`Reprocesado. Status final: ${out.status}. Lineas extraidas: ${out.lines_count}.`);
    },
    onError: (err) => alert(err?.response?.data?.message || err.message),
  });

  function handleReprocess() {
    if (!confirm(
      'Reprocesar este documento?\n\n' +
      'Borra OCR, extraccion IA, factura, lineas, mapeo Excel y trazabilidad anterior.\n' +
      'El archivo fisico y el documento (id, hash) se preservan.\n' +
      'El pipeline se vuelve a correr (OCR -> Gemini -> Validacion -> Excel).\n' +
      'Si Gemini esta caido o saturado, podes recibir el mismo error.\n\n' +
      'Continuar?'
    )) return;
    reprocessMutation.mutate();
  }

  const lineMutation = useMutation({
    mutationFn: async ({ lineId, changes, reason }) => {
      const r = await api.patch(`/api/invoice-lines/${lineId}`, { changes, reason });
      return r.data;
    },
  });

  const linesDiffPreview = useMemo(() => {
    if (!editingLines || !data?.lines) return {};
    const out = {};
    for (const l of data.lines) {
      const draft = lineDrafts[l.id];
      if (!draft) continue;
      const diff = computeDiff(LINE_FIELDS, l, draft);
      if (Object.keys(diff).length) out[l.id] = diff;
    }
    return out;
  }, [lineDrafts, editingLines, data?.lines]);

  function startEditingInvoice() {
    if (!inv) return;
    const draft = {};
    for (const f of INVOICE_FIELDS) draft[f.key] = toInputValue(f, inv[f.key]);
    setInvoiceDraft(draft);
    setInvoiceReason('');
    setInvoiceError(null);
    setEditingInvoice(true);
  }

  function saveInvoice() {
    const diff = computeDiff(INVOICE_FIELDS, inv, invoiceDraft);
    if (!Object.keys(diff).length) {
      setInvoiceError('No hay cambios');
      return;
    }
    if (!invoiceReason.trim()) {
      setInvoiceError('Razon es obligatoria');
      return;
    }
    invoiceMutation.mutate({ changes: diff, reason: invoiceReason.trim() });
  }

  function startEditingLines() {
    if (!data?.lines?.length) return;
    const drafts = {};
    for (const l of data.lines) {
      const d = {};
      for (const f of LINE_FIELDS) d[f.key] = toInputValue(f, l[f.key]);
      drafts[l.id] = d;
    }
    setLineDrafts(drafts);
    setLinesReason('');
    setLinesError(null);
    setEditingLines(true);
  }

  async function saveLines() {
    const toSave = Object.entries(linesDiffPreview);
    if (!toSave.length) {
      setLinesError('No hay cambios en las lineas');
      return;
    }
    if (!linesReason.trim()) {
      setLinesError('Razon es obligatoria');
      return;
    }
    try {
      for (const [lineId, changes] of toSave) {
        await lineMutation.mutateAsync({ lineId: Number(lineId), changes, reason: linesReason.trim() });
      }
      qc.invalidateQueries({ queryKey: ['document', id] });
      qc.invalidateQueries({ queryKey: ['document', id, 'edits'] });
      setEditingLines(false);
      setLinesReason('');
      setLinesError(null);
    } catch (err) {
      setLinesError(err?.response?.data?.message || err.message);
    }
  }

  if (isLoading) return <div className="p-6 text-slate-500">Cargando...</div>;
  if (!data?.document) return <div className="p-6 text-red-600">Documento no encontrado.</div>;

  const d = data.document;
  const edits = editsData?.edits || [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/documents" className="text-sm text-brand-700 hover:underline">&larr; Volver</Link>
        <h1 className="text-xl font-semibold text-slate-800">Documento #{d.id}</h1>
        <span className="text-sm text-slate-500 flex-1">{d.original_filename}</span>
        {isAdmin && (
          <button
            onClick={handleReprocess}
            disabled={reprocessMutation.isPending}
            className="text-xs px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            title="Vuelve a correr OCR + Gemini + validacion + Excel sobre el mismo archivo"
          >
            {reprocessMutation.isPending ? 'Reprocesando...' : 'Reprocesar'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {inv && (
            <div className="bg-white shadow rounded p-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-sm font-semibold text-slate-700">Factura extraida</h2>
                {isAdmin && !editingInvoice && (
                  <button
                    onClick={startEditingInvoice}
                    className="text-xs text-brand-700 hover:underline"
                  >
                    Editar
                  </button>
                )}
              </div>

              {editingInvoice ? (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {INVOICE_FIELDS.map((f) => (
                      <div key={f.key} className={f.span2 ? 'col-span-2' : ''}>
                        <div className="text-xs text-slate-500 uppercase mb-1">{f.label}</div>
                        <EditableField
                          field={f}
                          value={invoiceDraft[f.key] ?? ''}
                          onChange={(v) => setInvoiceDraft((s) => ({ ...s, [f.key]: v }))}
                          disabled={invoiceMutation.isPending}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <label className="text-xs text-slate-500 uppercase">Razon del cambio (obligatorio)</label>
                    <input
                      type="text"
                      className="border rounded px-2 py-1 text-sm w-full mt-1"
                      value={invoiceReason}
                      onChange={(e) => setInvoiceReason(e.target.value)}
                      placeholder="Ej: OCR confundio el nombre; corrijo proveedor segun documento fisico"
                      disabled={invoiceMutation.isPending}
                    />
                  </div>
                  {invoiceError && (
                    <div className="mt-2 text-sm text-red-600 bg-red-50 rounded p-2">{invoiceError}</div>
                  )}
                  <div className="mt-3 flex gap-2 justify-end">
                    <button
                      onClick={() => { setEditingInvoice(false); setInvoiceError(null); }}
                      className="text-xs px-3 py-1 rounded border text-slate-700"
                      disabled={invoiceMutation.isPending}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={saveInvoice}
                      className="text-xs px-3 py-1 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
                      disabled={invoiceMutation.isPending}
                    >
                      {invoiceMutation.isPending ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {INVOICE_FIELDS.map((f) => (
                    <Field
                      key={f.key}
                      label={f.label}
                      value={f.type === 'date' ? inv[f.key]?.slice(0, 10) : inv[f.key]}
                      span2={f.span2}
                    />
                  ))}
                  {inv.tipo_cambio && (
                    <>
                      <Field label="Tipo cambio aplicado" value={Number(inv.tipo_cambio).toFixed(2)} />
                      <Field
                        label="Total en colones"
                        value={inv.total_colones ? Number(inv.total_colones).toLocaleString('es-CR', { minimumFractionDigits: 2 }) : null}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {data.validation && (
            <ValidationCard validation={data.validation} />
          )}

          {data.lines?.length > 0 && (
            <div className="bg-white shadow rounded p-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-sm font-semibold text-slate-700">Lineas ({data.lines.length})</h2>
                {isAdmin && !editingLines && (
                  <button
                    onClick={startEditingLines}
                    className="text-xs text-brand-700 hover:underline"
                  >
                    Editar
                  </button>
                )}
              </div>
              {!editingLines ? (
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
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[900px]">
                      <thead className="text-slate-500">
                        <tr>
                          <th className="text-left py-1 w-12">#</th>
                          <th className="text-left py-1">Producto</th>
                          <th className="text-left py-1">Categoria</th>
                          <th className="text-right py-1">Cant</th>
                          <th className="text-right py-1">P.Unit</th>
                          <th className="text-right py-1">Base</th>
                          <th className="text-center py-1">Tarifa</th>
                          <th className="text-right py-1">% IVA</th>
                          <th className="text-right py-1">Monto IVA</th>
                          <th className="text-right py-1">Subtotal</th>
                          <th className="text-right py-1">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.lines.map((l) => {
                          const draft = lineDrafts[l.id] || {};
                          const diff = linesDiffPreview[l.id] || {};
                          const dirty = Object.keys(diff).length > 0;
                          const setField = (k, v) => setLineDrafts((s) => ({ ...s, [l.id]: { ...s[l.id], [k]: v } }));
                          const cellCls = (k) => `py-1 ${diff[k] !== undefined ? 'bg-amber-50' : ''}`;
                          return (
                            <tr key={l.id} className={dirty ? 'border-l-2 border-amber-400' : ''}>
                              <td className="py-1 text-slate-400">{l.id}</td>
                              {LINE_FIELDS.map((f) => (
                                <td key={f.key} className={cellCls(f.key)}>
                                  <EditableField
                                    field={f}
                                    value={draft[f.key] ?? ''}
                                    onChange={(v) => setField(f.key, v)}
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3">
                    <label className="text-xs text-slate-500 uppercase">Razon del cambio (obligatorio)</label>
                    <input
                      type="text"
                      className="border rounded px-2 py-1 text-sm w-full mt-1"
                      value={linesReason}
                      onChange={(e) => setLinesReason(e.target.value)}
                      placeholder="Ej: ajusto cantidad y tarifa de IVA en linea 2 segun factura impresa"
                      disabled={lineMutation.isPending}
                    />
                  </div>
                  {linesError && (
                    <div className="mt-2 text-sm text-red-600 bg-red-50 rounded p-2">{linesError}</div>
                  )}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {Object.keys(linesDiffPreview).length} linea(s) con cambios
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingLines(false); setLinesError(null); }}
                        className="text-xs px-3 py-1 rounded border text-slate-700"
                        disabled={lineMutation.isPending}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={saveLines}
                        className="text-xs px-3 py-1 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
                        disabled={lineMutation.isPending}
                      >
                        {lineMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {edits.length > 0 && (
            <div className="bg-white shadow rounded p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">
                Historial de cambios ({edits.length})
              </h2>
              <p className="text-xs text-slate-500 mb-3">
                Cada edicion queda registrada. El Excel se sigue mostrando con los valores originales hasta que se reinicie y se vuelva a generar.
              </p>
              <ul className="divide-y text-sm">
                {edits.map((e) => (
                  <li key={e.id} className="py-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium text-slate-700">
                        {e.field_name}
                        {e.line_id != null && <span className="text-xs text-slate-400"> (linea #{e.line_id})</span>}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(e.created_at).toLocaleString('es-CR')} - {e.user_email || `user #${e.user_id}`}
                      </span>
                    </div>
                    <div className="text-xs mt-1 flex flex-wrap gap-2">
                      <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded line-through">
                        {e.original_value === null ? '(vacio)' : e.original_value}
                      </span>
                      <span className="text-slate-400">&rarr;</span>
                      <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded">
                        {e.new_value === null ? '(vacio)' : e.new_value}
                      </span>
                    </div>
                    {e.reason && (
                      <div className="text-xs text-slate-500 italic mt-1">"{e.reason}"</div>
                    )}
                  </li>
                ))}
              </ul>
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
                <div className={`mt-2 text-xs rounded p-2 ${
                  d.status === 'REVIEW'
                    ? 'text-amber-700 bg-amber-50'
                    : 'text-red-600 bg-red-50'
                }`}>
                  {d.error_message}
                </div>
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

function ValidationCard({ validation }) {
  const result = validation.result || {};
  const ok = result.ok === true;
  const issues = Array.isArray(result.issues) ? result.issues : [];
  const tone = ok
    ? { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-800',  dot: 'bg-green-500' }
    : { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-800',  dot: 'bg-amber-500' };
  return (
    <div className={`shadow rounded border ${tone.border} ${tone.bg} p-4`}>
      <div className="flex justify-between items-baseline mb-2">
        <h2 className={`text-sm font-semibold flex items-center gap-2 ${tone.text}`}>
          <span className={`w-2 h-2 rounded-full ${tone.dot}`} />
          Validaciones cruzadas
        </h2>
        <span className="text-xs text-slate-500">
          {validation.created_at ? new Date(validation.created_at).toLocaleString('es-CR') : ''}
        </span>
      </div>
      <p className={`text-sm ${tone.text}`}>{validation.summary}</p>
      {issues.length > 0 && (
        <ul className="mt-3 space-y-2">
          {issues.map((it, idx) => (
            <li key={idx} className="bg-white rounded border border-amber-200 p-2 text-xs">
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium text-slate-700">
                  {it.scope === 'line' ? `Linea ${it.line_num || `#${it.line_id}`}` : 'Factura'}
                  {' · '}{it.check}
                </span>
                <span className={`font-mono ${Math.abs(it.diff) > 100 ? 'text-red-600' : 'text-amber-700'}`}>
                  diff {it.diff > 0 ? '+' : ''}{it.diff} CRC
                </span>
              </div>
              <div className="text-slate-600">{it.message}</div>
              <div className="text-slate-400 mt-1">
                Esperado: <span className="font-mono">{it.expected}</span> · Declarado: <span className="font-mono">{it.actual}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!ok && (
        <div className="mt-3 text-xs text-slate-500 italic">
          La factura quedo marcada como REVISION. Los valores extraidos NO se modificaron - se requiere revision manual o edicion auditada.
        </div>
      )}
    </div>
  );
}
