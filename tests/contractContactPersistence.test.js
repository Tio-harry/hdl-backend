const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { normalizeContractContact } = require('../src/services/contractContact');
const pool = require('../src/db');

// Exercise the real route handlers against temporary copies, never real records.
async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE contracts (LIKE public.contracts INCLUDING DEFAULTS) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE eventos (LIKE public.eventos INCLUDING DEFAULTS) ON COMMIT DROP');
    const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
    const routes = {};
    const query = (sql, values) => /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())
      ? Promise.resolve({ rows: [] }) : client.query(sql, values);
    const context = {
      pool: { query, connect: async () => ({ query, release() {} }) },
      app: Object.fromEntries(['get', 'post', 'put'].map((method) => [method, (route, fn) => { routes[`${method} ${route}`] = fn; }])),
      crypto, normalizeContractContact,
    };
    const constants = source.slice(source.indexOf('const CONTRACT_INSERT_FIELDS'), source.indexOf('const ORCAMENTO_FIELDS'));
    const helpers = source.slice(source.indexOf('function getProvidedFields'), source.indexOf('function normalizeOrcamentoValue'));
    const schema = source.slice(source.indexOf('async function ensureContractContactColumn'), source.indexOf('(async function startServer'));
    const get = source.slice(source.indexOf("app.get('/contracts',"), source.indexOf("app.get('/contracts',") + source.slice(source.indexOf("app.get('/contracts',")).indexOf('\n});') + 5);
    const mutations = source.slice(source.indexOf("app.post('/contracts',"), source.indexOf("app.delete('/contracts/:id',"));
    vm.createContext(context);
    vm.runInContext(`${constants}\n${helpers}\n${schema}\n${get}\n${mutations}`, context);
    await vm.runInContext('ensureContractContactColumn()', context);
    await vm.runInContext('ensureContractContactColumn()', context);
    const invoke = async (route, body = {}, id) => {
      let result;
      let status = 200;
      const res = { status(code) { status = code; return this; }, json(value) { result = value; } };
      await routes[route]({ body, params: { id } }, res);
      assert.equal(status, 200, JSON.stringify(result));
      assert.equal(result.ok, true);
      return result.dados;
    };
    const base = { nome_contratante: 'Teste Contato', local: 'Rua Teste, 12', data_evento: '12/09/2026', horario_inicio: '13:00', servico_contratado: '03 recreadores', valor_total: 790, entrada: 395, saldo: 395 };
    const created = await invoke('post /contracts', { ...base, contato_contratante: '  (83)  99999-9999  ' });
    assert.equal(created.contato_contratante, '(83) 99999-9999');
    const loaded = (await invoke('get /contracts')).find((c) => c.id === created.id);
    assert.equal(loaded.contato_contratante, created.contato_contratante);
    const changed = await invoke('put /contracts/:id', { contato_contratante: '+351 912 345 678' }, created.id);
    assert.equal(changed.contato_contratante, '+351 912 345 678');
    const regenerated = await invoke('put /contracts/:id', { pdf_filename: 'teste.pdf' }, created.id);
    assert.equal(regenerated.contato_contratante, '+351 912 345 678');
    const events = (await client.query('SELECT * FROM eventos WHERE contract_id = $1', [created.id])).rows;
    assert.equal(events.length, 1);
    assert.ok(!JSON.stringify(events).includes('+351'));
    assert.ok(!JSON.stringify(events).includes('99999-9999'));
    assert.ok(!Object.hasOwn(events[0], 'contato_contratante'));
    assert.equal((await invoke('put /contracts/:id', { contato_contratante: '' }, created.id)).contato_contratante, null);
    assert.equal((await invoke('put /contracts/:id', { contato_contratante: 'Não informado' }, created.id)).contato_contratante, null);
    const legacy = await invoke('post /contracts', base);
    assert.equal(legacy.contato_contratante, null);
    assert.equal((await invoke('put /contracts/:id', { pdf_filename: 'antigo.pdf' }, legacy.id)).contato_contratante, null);
    console.log('OK: schema idempotent; POST/GET/PUT; edit/clear; PDF metadata preserves phone; old contracts; no phone in Eventos. Temporary tables only.');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
