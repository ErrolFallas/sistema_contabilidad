/**
 * Helpers compartidos por los tests.
 *  - buildAppForTests(): construye la app Express sin abrir puerto.
 *  - loginAsAdmin(app): hace login con las credenciales del bootstrap admin
 *    y devuelve el header Authorization listo para usar con supertest.
 */
const request = require('supertest');
const { buildApp } = require('../src/app');

let _app = null;

function getApp() {
  if (!_app) _app = buildApp();
  return _app;
}

async function loginAsAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL/PASSWORD no definidos en .env');
  }
  const res = await request(getApp())
    .post('/api/auth/login')
    .send({ email, password });
  if (res.status !== 200 || !res.body.token) {
    throw new Error(`Login admin fallo: status ${res.status}, body ${JSON.stringify(res.body)}`);
  }
  return {
    token: res.body.token,
    user: res.body.user,
    headers: { Authorization: `Bearer ${res.body.token}` },
  };
}

module.exports = { getApp, loginAsAdmin, request };
