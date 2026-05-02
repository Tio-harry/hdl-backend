const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const SHOULD_APPLY = process.argv.includes('--apply');
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'db', 'migrations', 'portal-talentos');
const CONTROL_TABLE = 'portal_talentos_migrations';

function log(message) {
  console.log(`[portal-talentos:migrations] ${message}`);
}

function getMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((filename) => filename.toLowerCase().endsWith('.sql'))
    .sort((a, b) => {
      const numberA = Number(a.match(/^(\d+)/)?.[1] || Number.MAX_SAFE_INTEGER);
      const numberB = Number(b.match(/^(\d+)/)?.[1] || Number.MAX_SAFE_INTEGER);
      return numberA - numberB || a.localeCompare(b);
    });
}

async function getAppliedMigrations(client) {
  const tableCheck = await client.query(
    "SELECT to_regclass($1) AS table_name",
    [CONTROL_TABLE]
  );

  if (!tableCheck.rows[0]?.table_name) {
    return new Set();
  }

  const result = await client.query(
    `SELECT filename FROM ${CONTROL_TABLE} ORDER BY filename ASC`
  );

  return new Set(result.rows.map((row) => row.filename));
}

async function ensureControlTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${CONTROL_TABLE} (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function applyMigration(pool, filename) {
  const migrationPath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    log(`Executando ${filename}...`);
    await client.query(sql);
    await client.query(
      `INSERT INTO ${CONTROL_TABLE} (filename) VALUES ($1)`,
      [filename]
    );
    await client.query('COMMIT');
    log(`Concluida ${filename}.`);
  } catch (error) {
    await client.query('ROLLBACK');
    log(`Falha em ${filename}. Rollback executado.`);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nao configurada.');
  }

  const migrationFiles = getMigrationFiles();
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const client = await pool.connect();
    let appliedMigrations;

    try {
      appliedMigrations = await getAppliedMigrations(client);
    } finally {
      client.release();
    }

    const pendingMigrations = migrationFiles.filter(
      (filename) => !appliedMigrations.has(filename)
    );

    if (!pendingMigrations.length) {
      log('Nenhuma migration pendente encontrada.');
      return;
    }

    log('Migrations pendentes:');
    for (const filename of pendingMigrations) {
      log(`- ${filename}`);
    }

    if (!SHOULD_APPLY) {
      log('Nenhuma migration foi executada. Use --apply para executar.');
      return;
    }

    const setupClient = await pool.connect();
    try {
      await ensureControlTable(setupClient);
    } finally {
      setupClient.release();
    }

    for (const filename of pendingMigrations) {
      await applyMigration(pool, filename);
    }

    log('Todas as migrations pendentes foram aplicadas com sucesso.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[portal-talentos:migrations] Erro:', error.message);
  process.exitCode = 1;
});
