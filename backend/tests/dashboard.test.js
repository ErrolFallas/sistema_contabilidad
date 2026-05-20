const { getApp, loginAsAdmin, request } = require('./helpers');

describe('GET /api/dashboard/stats', () => {
  it('requiere autenticacion', async () => {
    const res = await request(getApp()).get('/api/dashboard/stats');
    expect(res.status).toBe(401);
  });

  it('devuelve totales, by_status, by_source, by_iva_rate y monthly_evolution', async () => {
    const { headers } = await loginAsAdmin();
    const res = await request(getApp()).get('/api/dashboard/stats').set(headers);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      generated_at: expect.any(String),
      totals: expect.objectContaining({
        all: expect.any(Number),
        procesadas: expect.any(Number),
        pendientes: expect.any(Number),
        duplicadas: expect.any(Number),
        errores: expect.any(Number),
        revision: expect.any(Number),
      }),
      by_source: expect.objectContaining({
        DRIVE: expect.any(Number),
        GMAIL: expect.any(Number),
        MANUAL: expect.any(Number),
      }),
      by_iva_rate: expect.any(Array),
      top_providers: expect.any(Array),
      monthly_evolution: expect.any(Array),
      errors_recent: expect.any(Array),
    });
  });

  it('la suma por estado es consistente con el total', async () => {
    const { headers } = await loginAsAdmin();
    const res = await request(getApp()).get('/api/dashboard/stats').set(headers);
    const sumByStatus = Object.values(res.body.by_status).reduce((a, b) => a + b, 0);
    expect(sumByStatus).toBe(res.body.totals.all);
  });
});
