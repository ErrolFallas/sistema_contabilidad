// Cargar variables de entorno antes de cualquier import del codigo de la app.
require('dotenv').config();

// Silenciar pino en tests (evita ruido en la salida de vitest).
process.env.LOG_LEVEL = 'silent';

// afterAll esta disponible como global porque vitest.config.js tiene
// globals: true. Lo usamos para cerrar el pool MySQL al terminar el archivo
// de tests; sin esto, vitest queda colgado.
const { pool } = require('../src/db/pool');
afterAll(async () => {
  await pool.end();
});
