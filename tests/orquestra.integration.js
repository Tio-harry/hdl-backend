const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const { Pool } = require('pg');
const { mountOrquestraRouter } = require('../src/routes/orquestraRoutes');

test('contrato HTTP da Orquestra com Agenda, recreadores e escala do PostgreSQL descartável', async (t) => {
  const url = URL.parse(process.env.DATABASE_URL ?? '');
  assert.ok(url?.protocol === 'postgresql:' && url.hostname === '127.0.0.1' &&
    url.pathname === '/hdl_ci_source' && !url.search && !url.hash, 'Use npm run test:ci:postgres com banco descartável.');
  const pool = new Pool({ connectionString: url.href });
  t.after(() => pool.end());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const table of ['regions', 'colaboradores', 'colaborador_perfil_equipe', 'eventos', 'servicos', 'escala_eventos']) {
      await client.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
    }
    await client.query(`
      INSERT INTO regions (id, nome_regiao) VALUES ('r-norte', 'Região Norte Fictícia'), ('r-sul', 'Região Sul Fictícia');
      INSERT INTO colaboradores (id, nome_colaborador, ativo, id_recreador)
        VALUES ('col-101', 'Pessoa A', true, 'CODIGO-MUTAVEL'), ('col-202', 'Pessoa B', false, null),
               ('col-303', 'Pessoa C', null, null);
      INSERT INTO colaborador_perfil_equipe (colaborador_id, region_id, cpf)
        VALUES ('col-101', 'r-norte', 'CPF-SINTETICO'), ('col-202', 'r-sul', null);
      INSERT INTO servicos (id, nome_servico) VALUES ('s-teste', 'Serviço Fictício');
      INSERT INTO eventos (id, identificador_interno, contratante_nome, endereco_evento, cidade, data_evento,
                           hora_inicio, hora_fim, status_aceite_praca, qtd_recreadores, servico_principal_id, valor_total)
        VALUES ('evt-001', 'EX-01', 'Cliente Fictício', 'Endereço Sintético', 'Cidade Teste', '30/04/2026',
                '9:05', '11:10:30', 'OK Praça Teste', 2, 's-teste', 1000),
               ('evt-002', null, 'Cliente Fictício', null, null, '2026-05-01',
                '23:30', null, 'Pendente Praça Teste', null, null, null),
               ('evt-003', null, 'Cliente Fictício', null, null, '02/05/2026', null, null, null, null, null, null),
               ('evt-data-invalida', null, 'Cliente Fictício', null, null, '31/04/2026', null, null, null, null, null, null);
      INSERT INTO escala_eventos (id, evento_id, colaborador_id, colaborador_nome, funcao, status_aceite, valor_recreador)
        VALUES ('esc-1', 'evt-001', 'col-101', 'Nome de snapshot', 'Líder', 'Confirmado', 120),
               ('esc-2', 'evt-001', 'col-202', 'Pessoa B', 'Recreador', 'Pendente', 90);
    `);

    const app = express();
    mountOrquestraRouter(app, { query(sql, params) {
      assert.match(sql.trim(), /^SELECT\b/);
      return client.query(sql, params);
    } }, 'fixture-orquestra-postgres');
    const server = await new Promise((resolve, reject) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
      listener.once('error', reject);
    });
    try {
      async function get(suffix, status = 200) {
        const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/integracao/v1' + suffix, {
          headers: { Authorization: 'Bearer fixture-orquestra-postgres' },
        });
        const body = await response.json();
        assert.equal(response.status, status, JSON.stringify(body));
        return status === 200 ? body.dados : body;
      }
      const norte = { id: 'r-norte', nome: 'Região Norte Fictícia' };
      const sul = { id: 'r-sul', nome: 'Região Sul Fictícia' };
      const a = { id: 'col-101', nome: 'Pessoa A', regiao: norte, ativo: true };
      const b = { id: 'col-202', nome: 'Pessoa B', regiao: sul, ativo: false };
      const c = { id: 'col-303', nome: 'Pessoa C', regiao: null, ativo: null };
      assert.deepEqual(await get('/recreadores'), [a, b, c]);
      assert.deepEqual(await get('/recreadores?regiao=r-norte'), [a]);
      assert.deepEqual(await get('/recreadores?ativo=false&regiao=r-sul'), [b]);
      assert.deepEqual(await get('/recreadores?ativo=true&regiao=r-sul'), []);
      assert.deepEqual(await get('/recreadores?regiao=' + encodeURIComponent("' OR 1=1 --")), []);
      assert.deepEqual(await get('/recreadores/col-101'), a);
      assert.deepEqual(await get('/recreadores/CODIGO-MUTAVEL', 404), { ok: false, erro: 'NAO_ENCONTRADO' });

      const evento = {
        id: 'evt-001', identificador: 'EX-01', data: '2026-04-30', hora_inicio: '09:05:00',
        hora_fim: '11:10:30', cidade: 'Cidade Teste', status_aceite_praca: 'OK Praça Teste',
        qtd_recreadores: 2, qtd_escalados: 2, servico: 'Serviço Fictício',
      };
      const outro = {
        id: 'evt-002', identificador: null, data: '2026-05-01', hora_inicio: '23:30:00',
        hora_fim: null, cidade: null, status_aceite_praca: 'Pendente Praça Teste',
        qtd_recreadores: null, qtd_escalados: 0, servico: null,
      };
      const periodo = '/eventos?inicio=2026-04-30&fim=2026-05-01';
      assert.deepEqual(await get(periodo), [evento, outro]);
      assert.deepEqual(await get(periodo + '&status=' + encodeURIComponent('OK Praça Teste')), [evento]);
      assert.deepEqual(await get('/eventos/evt-001'), evento);
      assert.equal((await get('/eventos/evt-data-invalida')).data, null);
      const aEscala = { recreador_id: a.id, nome: a.nome, regiao: norte, funcao: 'Líder', status_aceite: 'Confirmado' };
      const bEscala = { recreador_id: b.id, nome: b.nome, regiao: sul, funcao: 'Recreador', status_aceite: 'Pendente' };
      assert.deepEqual(await get('/eventos/evt-001/equipe'), [aEscala, bEscala]);
      assert.deepEqual(await get('/eventos/evt-002/equipe'), []);
      assert.deepEqual(await get('/eventos/inexistente', 404), { ok: false, erro: 'NAO_ENCONTRADO' });
      assert.deepEqual(await get('/eventos/inexistente/equipe', 404), { ok: false, erro: 'NAO_ENCONTRADO' });
      await client.query("UPDATE escala_eventos SET status_aceite = 'Recusado' WHERE id = 'esc-1'");
      await client.query("DELETE FROM escala_eventos WHERE id = 'esc-2'");
      assert.deepEqual(await get('/eventos/evt-001/equipe'), [{ ...aEscala, status_aceite: 'Recusado' }]);
      assert.equal((await get('/eventos/evt-001')).qtd_escalados, 1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    try {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }
});
