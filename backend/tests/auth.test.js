const { getApp, loginAsAdmin, request } = require('./helpers');

describe('POST /api/auth/login', () => {
  it('rechaza email no registrado', async () => {
    const res = await request(getApp())
      .post('/api/auth/login')
      .send({ email: 'no-existe@test.local', password: 'whatever' });
    expect(res.status).toBe(401);
  });

  it('rechaza password incorrecta', async () => {
    const res = await request(getApp())
      .post('/api/auth/login')
      .send({ email: process.env.BOOTSTRAP_ADMIN_EMAIL, password: 'definitivamente-no-es' });
    expect(res.status).toBe(401);
  });

  it('rechaza body invalido (sin email)', async () => {
    const res = await request(getApp())
      .post('/api/auth/login')
      .send({ password: 'x' });
    expect(res.status).toBe(400);
  });

  it('devuelve token JWT con credenciales correctas', async () => {
    const { token, user, headers } = await loginAsAdmin();
    expect(token).toBeTruthy();
    expect(token.split('.').length).toBe(3);
    expect(user).toMatchObject({
      email: process.env.BOOTSTRAP_ADMIN_EMAIL,
      role: expect.stringMatching(/^(ADMIN|USUARIO)$/),
    });
    expect(headers.Authorization).toMatch(/^Bearer /);
  });
});

describe('GET /api/auth/me', () => {
  it('responde 401 sin token', async () => {
    const res = await request(getApp()).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('responde 401 con token invalido', async () => {
    const res = await request(getApp())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('responde con los datos del usuario al usar token valido', async () => {
    const { headers } = await loginAsAdmin();
    const res = await request(getApp()).get('/api/auth/me').set(headers);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      email: process.env.BOOTSTRAP_ADMIN_EMAIL,
      role: expect.any(String),
    });
  });
});

describe('PATCH /api/auth/password', () => {
  it('requiere autenticacion', async () => {
    const res = await request(getApp())
      .patch('/api/auth/password')
      .send({ current_password: 'x', new_password: 'newpassword123' });
    expect(res.status).toBe(401);
  });

  it('rechaza password actual incorrecta', async () => {
    const { headers } = await loginAsAdmin();
    const res = await request(getApp())
      .patch('/api/auth/password')
      .set(headers)
      .send({ current_password: 'not-the-real-one', new_password: 'reasonable-new-pass' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/incorrecta?/i);
  });

  it('rechaza password nueva muy corta', async () => {
    const { headers } = await loginAsAdmin();
    const res = await request(getApp())
      .patch('/api/auth/password')
      .set(headers)
      .send({ current_password: process.env.BOOTSTRAP_ADMIN_PASSWORD, new_password: 'abc' });
    expect(res.status).toBe(400);
  });

  it('rechaza si nueva == actual', async () => {
    const { headers } = await loginAsAdmin();
    const res = await request(getApp())
      .patch('/api/auth/password')
      .set(headers)
      .send({
        current_password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
        new_password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
      });
    expect(res.status).toBe(400);
  });

  // Nota: no se prueba el happy path de cambio porque pisaria la password del
  // admin bootstrap usada por todos los demas tests. El path exitoso se cubre
  // implicitamente por la validacion bcrypt arriba y por el smoke test manual.
});
