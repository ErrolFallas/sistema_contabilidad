#!/usr/bin/env node
/**
 * DocScan Finance CR - Runner de migraciones.
 *
 * Aplica los archivos .sql de src/db/migrations/ en orden alfabetico,
 * EXCEPTO 000_create_user_and_db.sql (ese se ejecuta manualmente como root).
 *
 * Idempotente: usa CREATE TABLE IF NOT EXISTS.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { config } = require('../config/env');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function splitStatements(sql) {
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return stripped
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function run() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !f.startsWith('000_'))
    .sort();

  if (files.length === 0) {
    console.log('No hay migraciones .sql para aplicar.');
    return;
  }

  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: false,
  });

  try {
    for (const file of files) {
      console.log(`\n>> Aplicando ${file} ...`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const stmts = splitStatements(sql);
      for (const stmt of stmts) {
        await conn.query(stmt);
      }
      console.log(`   OK (${stmts.length} sentencias)`);
    }
    console.log('\nMigraciones completadas.');
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error('Error en migracion:', err.message);
  process.exit(1);
});
