import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api.js';
import { useAuth } from '../auth/AuthContext.jsx';

const EJEMPLOS = [
  '¿Cuáles fueron los proveedores con mayor monto facturado?',
  '¿Qué facturas tienen IVA al 13%?',
  '¿Hay facturas en dólares? ¿Cuáles?',
  '¿Cuál fue la factura más reciente que llegó?',
  '¿Aparece el proveedor Pacific Tech en alguna factura?',
];

export default function RagPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [question, setQuestion] = useState('');
  const [lastResult, setLastResult] = useState(null);
  const [queryError, setQueryError] = useState(null);

  const { data: status } = useQuery({
    queryKey: ['rag', 'status'],
    queryFn: () => api.get('/api/rag/status').then((r) => r.data),
    refetchInterval: 15000,
  });

  const { data: historyData } = useQuery({
    queryKey: ['rag', 'history'],
    queryFn: () => api.get('/api/rag/history?limit=10').then((r) => r.data),
    refetchInterval: 15000,
  });

  const queryMutation = useMutation({
    mutationFn: (q) => api.post('/api/rag/query', { question: q }, { timeout: 90000 }).then((r) => r.data),
    onSuccess: (data) => {
      setLastResult(data);
      setQueryError(null);
      qc.invalidateQueries({ queryKey: ['rag', 'history'] });
      qc.invalidateQueries({ queryKey: ['rag', 'status'] });
    },
    onError: (err) => setQueryError(err?.response?.data?.message || err.message),
  });

  const reindexAllMutation = useMutation({
    mutationFn: () => api.post('/api/rag/reindex-all', null, { timeout: 600000 }).then((r) => r.data),
    onSuccess: (data) => {
      alert(
        `Preparación completa.\n\n` +
        `Facturas: ${data.indexed} listas para consulta, ${data.skipped} sin texto legible, ${data.errors} con error.`
      );
      qc.invalidateQueries({ queryKey: ['rag', 'status'] });
    },
    onError: (err) => alert(err?.response?.data?.message || err.message),
  });

  function onSubmit(e) {
    e.preventDefault();
    if (!question.trim()) return;
    queryMutation.mutate(question.trim());
  }

  function useExample(text) {
    setQuestion(text);
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-semibold text-slate-800 mb-1">Consulta inteligente</h1>
      <p className="text-sm text-slate-600 mb-4 max-w-3xl">
        Hacele preguntas a la IA sobre tus facturas en español, como si fuera un asistente. Por ejemplo:
        "¿cuáles fueron mis compras de ferretería en mayo?" o "¿qué facturas tengo del proveedor X?". La IA
        busca en todas las facturas cargadas y te responde citando los documentos exactos que usó.
        <strong> Nunca inventa cifras</strong>: si la información no está en tus facturas, te lo dice.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <form onSubmit={onSubmit} className="bg-white shadow rounded p-4">
            <label className="text-xs font-semibold text-slate-500 uppercase block mb-2">
              Tu pregunta
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Ej: ¿cuál es el total facturado por Walmart en mayo?"
              className="w-full border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
              disabled={queryMutation.isPending}
            />
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-slate-400">
                {question.length} / 1000 caracteres
              </span>
              <button
                type="submit"
                disabled={queryMutation.isPending || !question.trim()}
                className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-1.5 rounded text-sm disabled:opacity-60"
              >
                {queryMutation.isPending ? 'Consultando...' : 'Preguntar'}
              </button>
            </div>
            <div className="mt-3 pt-3 border-t">
              <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Ejemplos rápidos</div>
              <div className="flex flex-wrap gap-2">
                {EJEMPLOS.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => useExample(ex)}
                    disabled={queryMutation.isPending}
                    className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-60"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </form>

          {queryError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">
              Error: {queryError}
            </div>
          )}

          {lastResult && (
            <div className="bg-white shadow rounded p-4 space-y-4">
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Respuesta</div>
                <p className="text-slate-800 whitespace-pre-wrap">{lastResult.answer}</p>
                <div className="text-xs text-slate-400 mt-2">
                  Pregunta: "{lastResult.question}" · {lastResult.matches_count} fragmento(s) consultado(s) · {Math.round(lastResult.duration_ms / 100) / 10}s
                </div>
              </div>

              {lastResult.sources?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-2">
                    Fuentes usadas (orden por relevancia)
                  </div>
                  <ul className="space-y-2">
                    {lastResult.sources.map((s, idx) => (
                      <li key={`${s.document_id}-${s.chunk_index}-${idx}`} className="border rounded p-3">
                        <div className="flex justify-between items-baseline mb-1">
                          <Link
                            to={`/documents/${s.document_id}`}
                            className="text-sm text-brand-700 hover:underline font-medium"
                          >
                            doc #{s.document_id} - {s.original_filename}
                          </Link>
                          <span className="text-xs text-slate-500 font-mono">
                            relevancia {s.score}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-4">
                          {s.chunk_text.slice(0, 400)}{s.chunk_text.length > 400 ? '...' : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {historyData?.items?.length > 0 && (
            <div className="bg-white shadow rounded p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Consultas recientes</h2>
              <ul className="divide-y text-sm">
                {historyData.items.slice(0, 5).map((q) => (
                  <li key={q.id} className="py-2">
                    <div className="flex justify-between items-baseline gap-3">
                      <span className="text-slate-700 truncate flex-1">{q.question}</span>
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        {new Date(q.created_at).toLocaleString('es-CR')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{q.answer}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white shadow rounded p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Estado de búsqueda</h2>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between">
                <dt className="text-slate-500">Facturas totales</dt>
                <dd className="font-mono text-slate-800">{status?.documents_total ?? '...'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Listas para consulta</dt>
                <dd className="font-mono text-slate-800">{status?.documents_indexed ?? '...'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Fragmentos de texto</dt>
                <dd className="font-mono text-slate-800">{status?.chunks_total ?? '...'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Preguntas hechas</dt>
                <dd className="font-mono text-slate-800">{status?.queries_total ?? '...'}</dd>
              </div>
            </dl>
            {status && status.documents_total > status.documents_indexed && (
              <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                Hay {status.documents_total - status.documents_indexed} factura(s) sin preparar todavía para consulta.
                {isAdmin ? ' Presiona "Volver a preparar todas".' : ' Pedile a un administrador que las prepare.'}
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="bg-white shadow rounded p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Administración</h2>
              <p className="text-xs text-slate-500 mb-3">
                Esta acción vuelve a preparar todas las facturas cargadas para que la IA pueda buscarlas.
                Toma 1-3 segundos por factura. Las facturas nuevas se preparan solas en cuanto entran al
                sistema, así que normalmente no hace falta usar este botón.
              </p>
              <button
                onClick={() => { if (confirm('Volver a preparar todas las facturas para consulta? Puede tardar varios minutos.')) reindexAllMutation.mutate(); }}
                disabled={reindexAllMutation.isPending}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-60"
              >
                {reindexAllMutation.isPending ? 'Preparando...' : 'Volver a preparar todas'}
              </button>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs text-slate-600">
            <div className="font-semibold mb-1">¿Cómo funciona?</div>
            <ol className="list-decimal pl-4 space-y-1">
              <li>La IA entiende lo que estás preguntando.</li>
              <li>Busca los fragmentos de tus facturas más relacionados con la pregunta.</li>
              <li>Con esos fragmentos como base, redacta la respuesta.</li>
              <li>Te muestra qué facturas usó para que puedas verificar.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
