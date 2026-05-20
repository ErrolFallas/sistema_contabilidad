const { getApp, loginAsAdmin, request } = require('./helpers');

describe('GET /api/documents', () => {
  it('requiere autenticacion', async () => {
    const res = await request(getApp()).get('/api/documents');
    expect(res.status).toBe(401);
  });

  it('devuelve items y total con un token valido', async () => {
    const { headers } = await loginAsAdmin();
    const res = await request(getApp()).get('/api/documents?limit=3').set(headers);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: expect.any(Number),
      limit: expect.any(Number),
      offset: expect.any(Number),
      items: expect.any(Array),
    });
    expect(res.body.items.length).toBeLessThanOrEqual(3);
  });

  it('filtra correctamente por status', async () => {
    const { headers } = await loginAsAdmin();
    const full = await request(getApp()).get('/api/documents').set(headers);
    const completed = await request(getApp()).get('/api/documents?status=COMPLETED').set(headers);
    expect(completed.status).toBe(200);
    expect(completed.body.total).toBeLessThanOrEqual(full.body.total);
    for (const it of completed.body.items) {
      expect(it.status).toBe('COMPLETED');
    }
  });

  it('filtra multiples status separados por coma', async () => {
    const { headers } = await loginAsAdmin();
    const res = await request(getApp()).get('/api/documents?status=COMPLETED,REVIEW').set(headers);
    expect(res.status).toBe(200);
    for (const it of res.body.items) {
      expect(['COMPLETED', 'REVIEW']).toContain(it.status);
    }
  });

  it('ignora silenciosamente valores de status invalidos', async () => {
    const { headers } = await loginAsAdmin();
    const res = await request(getApp()).get('/api/documents?status=SOMETHING_FAKE').set(headers);
    expect(res.status).toBe(200);
    // Sin filtro aplicado, devuelve todo
  });
});

describe('GET /api/documents/:id', () => {
  it('responde 404 para id inexistente', async () => {
    const { headers } = await loginAsAdmin();
    const res = await request(getApp()).get('/api/documents/99999999').set(headers);
    expect(res.status).toBe(404);
  });

  it('devuelve estructura completa para un id existente', async () => {
    const { headers } = await loginAsAdmin();
    const list = await request(getApp()).get('/api/documents?limit=1').set(headers);
    if (!list.body.items.length) {
      // BD vacia: skip suave
      return;
    }
    const id = list.body.items[0].id;
    const res = await request(getApp()).get(`/api/documents/${id}`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      document: expect.objectContaining({ id }),
      invoices: expect.any(Array),
      lines: expect.any(Array),
      excel_mapping: expect.any(Array),
    });
    expect('validation' in res.body).toBe(true);
  });
});
