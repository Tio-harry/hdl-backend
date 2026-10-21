const fs = require('node:fs');
const path = require('node:path');
const pool = require('../src/db');
async function main() {
  const expected = process.argv.find((arg) => arg.startsWith('--database='))?.split('=')[1];
  if (!process.argv.includes('--apply') || !expected) throw new Error('Uso: node scripts/migrateFuncoesEquipe.js --apply --database=NOME. Execute backup integral antes.');
  const client = await pool.connect();
  try {
    const { rows: [database] } = await client.query('SELECT current_database() AS nome');
    if (database.nome !== expected) throw new Error('Banco conectado difere do banco informado.');
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('hdl_funcoes_equipe'))");
    await client.query(fs.readFileSync(path.join(__dirname, '../db/migrations/002_funcoes_equipe.sql'), 'utf8'));
    await client.query('COMMIT');
    console.log(`Migration 002_funcoes_equipe aplicada em ${database.nome}.`);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
