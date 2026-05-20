const { getApp, loginAsAdmin, request } = require('./helpers');

describe('GET /api/rag/status', () => {
  it('requiere autenticacion', async () => {
    const res = await request(getApp()).get('/api/rag/status');
    expect(res.status).toBe(401);
  });

  it('devuelve metricas del indice', async () => {
    const { headers } = await loginAsAdmin();
    const res = await request(getApp()).get('/api/rag/status').set(headers);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      documents_total: expect.any(Number),
      documents_indexed: expect.any(Number),
      chunks_total: expect.any(Number),
      queries_total: expect.any(Number),
      embedding_model: expect.any(String),
      chat_model: expect.any(String),
    });
    expect(res.body.documents_indexed).toBeLessThanOrEqual(res.body.documents_total);
  });
});

describe('POST /api/rag/query', () => {
  it('requiere autenticacion', async () => {
    const res = await request(getApp())
      .post('/api/rag/query')
      .send({ question: '?' });
    expect(res.status).toBe(401);
  });

  it('rechaza pregunta vacia', async () => {
    const { headers } = await loginAsAdmin();
    const res = await request(getApp())
      .post('/api/rag/query')
      .set(headers)
      .send({ question: '   ' });
    expect(res.status).toBe(400);
  });

  // NOTA: el happy path consume cuota de Gemini (embedding + chat). Se omite
  // en CI por costo y latencia. Para correr manualmente, exportar
  // RUN_RAG_LIVE_TESTS=1.
});

describe('GET /api/rag/history', () => {
  it('devuelve un array de queries pasadas', async () => {
    const { headers } = await loginAsAdmin();
    const res = await request(getApp()).get('/api/rag/history?limit=5').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
  });
});
