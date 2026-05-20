const { getApp, loginAsAdmin, request } = require('./helpers');

describe('GET /api/traceability', () => {
  it('requiere autenticacion', async () => {
    const res = await request(getApp()).get('/api/traceability');
    expect(res.status).toBe(401);
  });

  it('devuelve items + stats con la estructura esperada', async () => {
    const { headers } = await loginAsAdmin();
    const res = await request(getApp()).get('/api/traceability?limit=5').set(headers);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: expect.any(Number),
      items: expect.any(Array),
      stats: expect.objectContaining({
        by_status: expect.any(Object),
        by_current_stage: expect.any(Object),
        stage_durations: expect.any(Array),
      }),
    });
    expect(res.body.items.length).toBeLessThanOrEqual(5);
    if (res.body.items.length > 0) {
      const it = res.body.items[0];
      expect(it).toMatchObject({
        id: expect.any(Number),
        original_filename: expect.any(String),
        status: expect.any(String),
        stages_total: expect.any(Number),
      });
    }
  });

  it('filtra por status correctamente', async () => {
    const { headers } = await loginAsAdmin();
    const res = await request(getApp()).get('/api/traceability?status=COMPLETED').set(headers);
    expect(res.status).toBe(200);
    for (const it of res.body.items) {
      expect(it.status).toBe('COMPLETED');
    }
  });

  it('ignora valores de status invalidos sin fallar', async () => {
    const { headers } = await loginAsAdmin();
    const res = await request(getApp()).get('/api/traceability?status=NO_TAL_COSA').set(headers);
    expect(res.status).toBe(200);
  });
});
