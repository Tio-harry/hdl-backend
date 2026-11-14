const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const { mountOrquestraRouter } = require('../src/routes/orquestraRoutes');

const TOKEN = 'fixture-orquestra-sem-valor-real';
const PREFIX = '/api/integracao/v1';

async function servidor(t, pool, token = TOKEN) {
  const app = express();
  mountOrquestraRouter(app, pool, token);
  app.use((_req, res) => res.sendStatus(418));
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return (path, authorization = 'Bearer ' + TOKEN, method = 'GET') =>
    fetch('http://127.0.0.1:' + server.address().port + path, {
      method,
      headers: authorization ? { Authorization: authorization } : {},
    });
}

const semConsulta = { query() { assert.fail('A requisição não deveria consultar o banco.'); } };

test('integração exige Bearer e falha fechada sem configuração', async (t) => {
  const request = await servidor(t, semConsulta);
  for (const auth of [null, 'Bearer fixture-errada', 'Basic fixture', 'Bearer fixture , Bearer ' + TOKEN]) {
    const res = await request(PREFIX + '/status', auth);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer');
    assert.deepEqual(await res.json(), { ok: false, erro: 'NAO_AUTENTICADO' });
  }
  const desabilitado = await servidor(t, semConsulta, '');
  const res = await desabilitado(PREFIX + '/status');
  assert.equal(res.status, 401);
});

test('status autenticado, métodos bloqueados e rotas isoladas', async (t) => {
  const request = await servidor(t, semConsulta);
  const status = await request(PREFIX + '/status');
  assert.equal(status.status, 200);
  assert.equal(status.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await status.json(), { ok: true, service: 'gestao-operacional', version: 'v1' });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const res = await request(PREFIX + '/eventos/e-teste', undefined, method);
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'GET, HEAD');
  }
  assert.equal((await request(PREFIX + '/inexistente', null)).status, 401);
  const missing = await request(PREFIX + '/inexistente');
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { ok: false, erro: 'NAO_ENCONTRADO' });
  assert.equal((await request('/eventos')).status, 418);
});

test('rejeita filtros e IDs inválidos antes de consultar', async (t) => {
  const request = await servidor(t, semConsulta);
  for (const suffix of [
    '/recreadores?regiao=r1&regiao=r2', '/recreadores?regiao=%00', '/recreadores?ativo=1',
    '/eventos', '/eventos?inicio=2026-02-29&fim=2026-03-01',
    '/eventos?inicio=2026-05-31&fim=2026-05-01',
    '/eventos?inicio=2026-05-01&fim=2026-05-31&status=x&status=y',
    '/eventos/%00', '/recreadores/%E0%A4%A',
  ]) {
    const res = await request(PREFIX + suffix);
    assert.equal(res.status, 400, suffix);
    assert.equal((await res.json()).ok, false);
  }
});

test('erros internos retornam JSON genérico', async (t) => {
  const request = await servidor(t, { query() { throw new Error('detalhe sintético do PostgreSQL'); } });
  const res = await request(PREFIX + '/recreadores');
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { ok: false, erro: 'ERRO_INTERNO' });
});
