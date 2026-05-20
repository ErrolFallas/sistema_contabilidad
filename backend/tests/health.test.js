const { getApp, request } = require('./helpers');

describe('GET /api/health', () => {
  it('responde 200 con la estructura esperada', async () => {
    const res = await request(getApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      service: 'docscan-finance-backend',
      checks: expect.objectContaining({
        mysql: expect.any(String),
        gemini: expect.any(String),
        google_oauth: expect.any(String),
        n8n_token: expect.any(String),
      }),
    });
  });

  it('emite header X-Request-Id en cualquier request', async () => {
    const res = await request(getApp()).get('/api/health');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
