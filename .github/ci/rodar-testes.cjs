'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const postgres = process.argv[2] === '--postgres';
const root = path.resolve(__dirname, '../..');
const preload = path.join(__dirname, 'preparar-testes.cjs').replaceAll('\\', '/');
const env = {
  NODE_OPTIONS: '--require "' + preload + '"',
  CI: 'true',
  EMAIL_ENABLED: 'false',
};

// Inherit only OS variables needed to run Node and PostgreSQL clients.
for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) {
  if (process.env[key]) env[key] = process.env[key];
}

if (postgres) {
  let source;
  try {
    source = new URL(process.env.HDL_TEST_DATABASE_URL);
  } catch {
    source = null;
  }
  if (source?.protocol !== 'postgresql:' ||
      source.hostname !== '127.0.0.1' ||
      source.pathname !== '/hdl_ci_source' ||
      source.search || source.hash || !process.env.PG_BIN) {
    console.error('Use HDL_TEST_DATABASE_URL com PostgreSQL descartável em 127.0.0.1/hdl_ci_source e defina PG_BIN.');
    process.exit(1);
  }
  env.DATABASE_URL = source.href;
  env.PG_BIN = process.env.PG_BIN;
}

const pattern = postgres ? 'tests/**/*.integration.js' : 'tests/**/*.test.js';
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', pattern], {
  cwd: root, env, stdio: 'inherit',
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
