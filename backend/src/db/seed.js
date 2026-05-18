#!/usr/bin/env node
/**
 * Seed inicial: usuario ADMIN bootstrap.
 * Idempotente: si el email ya existe, no hace nada.
 */
const bcrypt = require('bcryptjs');
const { pool } = require('./pool');
const { config } = require('../config/env');

async function run() {
  const email = config.bootstrapAdmin.email;
  const password = config.bootstrapAdmin.password;

  if (!email || !password) {
    console.log('BOOTSTRAP_ADMIN_EMAIL o BOOTSTRAP_ADMIN_PASSWORD vacios. Skip.');
    return;
  }

  const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (rows.length > 0) {
    console.log(`Usuario ${email} ya existe. Skip.`);
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role, activo)
     VALUES (?, ?, ?, 'ADMIN', 1)`,
    [email, hash, 'Administrador']
  );
  console.log(`Usuario ADMIN creado: ${email}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error en seed:', err.message);
    process.exit(1);
  });
