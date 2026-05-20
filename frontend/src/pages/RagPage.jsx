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
        `Reindexación completa.\n\n` +
        `Documentos: ${data.indexed} indexados, ${data.skipped} sin texto OCR, ${data.errors} errores.`
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
      <h1 className="text-xl font-semibold text-slate-800 mb-1">Consulta RAG</h1>
      <p className="text-sm text-slate-600 mb-4 max-w-3xl">
        Pregunta en lenguaje natural sobre el contenido de las facturas procesadas. El sistema busca
        fragmentos relevantes con búsqueda semántica (embeddings) y pide a Gemini que componga la respuesta
        citando los documentos consultados. <strong>Nunca inventa datos</strong>: si la información no está
        en los documentos indexados, lo dice explícitamente.
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
                  Pregunta: "{lastResult.question}" · {lastResult.matches_count} fragmento(s) consultado(s) · {lastResult.duration_ms} ms
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
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Estado del índice</h2>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between">
                <dt className="text-slate-500">Documentos totales</dt>
                <dd className="font-mono text-slate-800">{status?.documents_total ?? '...'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Indexados</dt>
                <dd className="font-mono text-slate-800">{status?.documents_indexed ?? '...'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Fragmentos</dt>
                <dd className="font-mono text-slate-800">{status?.chunks_total ?? '...'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Consultas hechas</dt>
                <dd className="font-mono text-slate-800">{status?.queries_total ?? '...'}</dd>
              </div>
            </dl>
            <div className="mt-3 pt-3 border-t text-xs text-slate-500 space-y-1">
              <div>Embeddings: <span className="font-mono">{status?.embedding_model}</span></div>
              <div>Respuesta: <span className="font-mono">{status?.chat_model}</span></div>
            </div>
            {status && status.documents_total > status.documents_indexed && (
              <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                {status.documents_total - status.documents_indexed} documento(s) sin indexar todavía.
                {isAdmin ? ' Pulsa "Reindexar todo".' : ' Pide a un administrador que reindexe.'}
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="bg-white shadow rounded p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Administración</h2>
              <p className="text-xs text-slate-500 mb-3">
                Reindexar regenera los embeddings de todos los documentos. Toma 1-3 segundos por
                documento. Los uploads nuevos se indexan solos en el pipeline.
              </p>
              <button
                onClick={() => { if (confirm('Reindexar todos los documentos? Puede tardar varios minutos.')) reindexAllMutation.mutate(); }}
                disabled={reindexAllMutation.isPending}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-60"
              >
                {reindexAllMutation.isPending ? 'Reindexando...' : 'Reindexar todo'}
              </button>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs text-slate-600">
            <div className="font-semibold mb-1">¿Cómo funciona?</div>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Tu pregunta se convierte en un vector con Gemini.</li>
              <li>Se comparan vectores contra todos los fragmentos guardados.</li>
              <li>Los 5 más parecidos se usan como contexto para que Gemini redacte la respuesta.</li>
              <li>La respuesta se acompaña con los documentos fuente para verificación.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
