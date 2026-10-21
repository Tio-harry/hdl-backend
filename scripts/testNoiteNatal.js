/* Integration test against an isolated local database; never uses production data. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { Pool } = require('pg');
require('dotenv').config({ quiet: true });

async function main() {
  const source = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(source.hostname)) throw Error('Teste permitido somente em PostgreSQL local.');
  const admin = new Pool({ connectionString: source.href });
  const name = `hdl_natal_test_${Date.now()}`;
  const bin = process.env.PG_BIN || 'C:/Program Files/PostgreSQL/18/bin';
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(source.password) };
  const dump = spawnSync(path.join(bin, 'pg_dump'), ['-h', source.hostname, '-p', source.port || '5432', '-U', decodeURIComponent(source.username), '-d', source.pathname.slice(1), '--schema-only', '--no-owner', '--no-privileges'], { env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (dump.status) throw Error(dump.stderr);
  let db, server;
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    source.pathname = `/${name}`;
    db = new Pool({ connectionString: source.href });
    const restore = spawnSync(path.join(bin, 'psql'), ['-h', source.hostname, '-p', source.port || '5432', '-U', decodeURIComponent(source.username), '-d', name, '-v', 'ON_ERROR_STOP=1'], { env, input: dump.stdout, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    if (restore.status) throw Error(restore.stderr);
    for (const [id, label] of [['noel', 'Papai Noel'], ['duende', 'Papai Noel com Duende'], ['visita', 'Visita Noite de Natal'], ['comum', 'Recreacao']]) {
      await db.query('INSERT INTO servicos(id,nome_servico) VALUES($1,$2)', [id, label]);
    }
    const sql = fs.readFileSync(path.join(__dirname, '../db/migrations/001_noite_natal.sql'), 'utf8');
    await db.query(sql);
    await db.query(sql);
    console.log('PASS migration aditiva e idempotente em banco isolado');
    const salt = crypto.randomBytes(16).toString('hex');
    const password = 'Teste-Natal-Local-2026';
    const hash = ['scrypt', 16384, 8, 1, salt, crypto.scryptSync(password, salt, 64).toString('hex')].join('$');
    await db.query("INSERT INTO usuarios(id,nome,email,senha_hash,perfil) VALUES('natal-test','Operador de teste','natal-test@example.invalid',$1,'gestor')", [hash]);
    const port = Number(process.env.NATAL_TEST_PORT || 3109);
    server = spawn(process.execPath, ['src/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, DATABASE_URL: source.href, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let serverLog = '';
    server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
    server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { const response = await fetch(`${base}/auth/me`); if (response.status === 401) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    assert.ok(ready, serverLog);
    const anonymous = await fetch(`${base}/noite-de-natal/2026`);
    assert.equal(anonymous.status, 401);
    const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'natal-test@example.invalid', senha: password }) });
    assert.equal(login.status, 200, await login.text());
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const request = async (route, body, method = body ? 'PUT' : 'GET', expected = 200) => {
      const res = await fetch(`${base}${route}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await res.json();
      assert.equal(res.status, expected, JSON.stringify(result));
      return result.dados;
    };
    console.log('PASS HTTP sem sessao=401; login real e sessao valida');
    const create = (data_evento, servico_contratado = 'Visita Noite de Natal', more = {}) => request('/contracts', {
      nome_contratante: 'Familia de teste Natal', local: 'Rua de teste, 10, Recife', data_evento,
      horario_inicio: '20:00', horario_fim: '20:20', servico_contratado, valor_total: 500, entrada: 250, saldo: 250, ...more,
    }, 'POST');
    const c1 = await create('24/12/2026', undefined, { contato_contratante: '(81) 99999-0199' });
    assert.equal(c1.servico_principal_id, 'visita');
    const c2 = await create('24/12/2026', undefined, { horario_inicio: '21:00', horario_fim: '21:30' });
    const c3 = await create('24/12/2026', undefined, { horario_inicio: '22:00', horario_fim: '22:40' });
    await create('24/12/2026', 'Recreacao'); await create('23/12/2026', 'Papai Noel'); await create('24/12/2027');
    const legacyContract = await create('24/12/2026', 'Visita Noite de Natal com Papai Noel', { nome_contratante: 'Legado UAT - Delvany', servico_principal_id: null });
    for (const [text, expected] of [
      ['  VISITA Noite de Nátal. ', 'visita'], ['Visita Noite de Natal com Papai Noel', 'visita'],
      ['Noel', null], ['Video do Papai Noel', null], ['Papai Noel', 'noel'], ['Papai Noel com Duende', 'duende'],
    ]) {
      const c = await create('24/12/2031', text);
      assert.equal(c.servico_principal_id, expected, text);
      assert.equal((await db.query('SELECT servico_principal_id FROM eventos WHERE contract_id=$1', [c.id])).rows[0].servico_principal_id, expected);
    }
    const precedence = await create('24/12/2031', 'Visita Noite de Natal com Papai Noel', { servico_principal_id: 'duende' });
    assert.equal(precedence.servico_principal_id, 'duende');
    assert.equal((await request(`/contracts/${precedence.id}`, { servico_contratado: 'Papai Noel' })).servico_principal_id, 'duende');
    assert.equal((await request(`/contracts/${precedence.id}`, { servico_principal_id: 'noel' })).servico_principal_id, 'noel');
    assert.equal((await request(`/contracts/${precedence.id}`, { servico_principal_id: null })).servico_principal_id, null);
    assert.equal((await request(`/contracts/${precedence.id}`, { tema: 'Teste' })).servico_principal_id, 'noel');
    await db.query("INSERT INTO servicos(id,nome_servico,ativo) VALUES('duplicate-test','Papai Noel',true)");
    assert.equal((await create('24/12/2031', 'Papai Noel')).servico_principal_id, null);
    await db.query("DELETE FROM servicos WHERE id='duplicate-test'");
    console.log('PASS nomes normalizados, alias explicito, textos genericos excluidos, ambiguidade, precedencia explicito/existente/automatico');
    await request(`/contracts/${c2.id}`, { horario_fim: '21:40' });
    const events = await request('/eventos');
    const e1 = events.find((e) => e.contract_id === c1.id), e2 = events.find((e) => e.contract_id === c2.id), e3 = events.find((e) => e.contract_id === c3.id);
    assert.equal(e1.servico_principal_id, 'visita'); assert.equal(e2.hora_fim, '21:40');
    let state = await request('/noite-de-natal/2026');
    assert.equal(state.eventos.find((e) => e.id === e1.id).contato_contratante, '(81) 99999-0199');
    assert.equal(state.eventos.length, 3); assert.equal(state.revisao.length, 2);
    assert.equal((await request('/noite-de-natal/2027')).eventos.length, 1);
    const comum = events.find((e) => e.servico_principal_id === 'comum');
    await db.query("INSERT INTO servico_eventos(id,evento_id,servico_id,servico_nome) VALUES('adicional',$1,'visita','Visita Noite de Natal')", [comum.id]);
    state = await request('/noite-de-natal/2026'); assert.equal(state.eventos.length, 4);
    console.log('PASS contrato cria evento/vinculo; update; elegibilidade principal/adicional; isolamento anual; legado excluido');
    await db.query("INSERT INTO colaboradores(id,nome_colaborador) VALUES('noel-test','Noel teste')");
    for (const e of [e1, e2, e3]) await db.query("INSERT INTO escala_eventos(id,evento_id,colaborador_id,colaborador_nome,funcao,valor_recreador) VALUES($1,$2,'noel-test','Noel teste','Papai Noel',100)", [`scale-${e.id}`, e.id]);
    const officialBefore = JSON.stringify((await db.query('SELECT * FROM eventos ORDER BY id')).rows);
    const scalesBefore = JSON.stringify((await db.query('SELECT * FROM escala_eventos ORDER BY id')).rows);
    const paymentBefore = JSON.stringify((await db.query('SELECT * FROM pagamentos_escala_colaborador ORDER BY id')).rows);
    const payload = () => ({ ...state.operacao, rotas: state.rotas, visitas: state.visitas });
    const save = async (changes, expected = 200) => { const result = await request('/noite-de-natal/2026', { ...payload(), ...changes }, 'PUT', expected); if (result) state = result; };
    await save({ rotas: [{ id: 'rota-a', nome: 'Noel 1' }, { id: 'rota-b', nome: 'Noel 2' }] });
    await save({ rotas: [{ id: 'rota-b', nome: 'Noel Norte' }, { id: 'rota-a', nome: 'Noel Sul' }] });
    assert.equal(state.rotas[0].nome, 'Noel Norte');
    const v = (e, rota_id, posicao) => ({ evento_id: e.id, rota_id, posicao, deslocamento_minutos: null, margem_minutos: null, observacao: '' });
    await save({ visitas: [v(e1, 'rota-a', 0), v(e2, 'rota-a', 1), v(e3, 'rota-a', 2)] });
    await save({ visitas: state.visitas.map((x) => ({ ...x, deslocamento_minutos: 25 })) });
    assert.equal(state.visitas.find((x) => x.evento_id === e2.id).deslocamento_minutos, 25);
    await save({ visitas: [v(e1, 'rota-a', 0), v(e3, 'rota-a', 1), v(e2, 'rota-a', 2)] });
    assert.equal(state.visitas.find((x) => x.evento_id === e2.id).deslocamento_minutos, null);
    await save({ visitas: [v(e1, 'rota-a', 0), v(e3, 'rota-a', 1), v(e2, 'rota-b', 0)] });
    await save({ visitas: [v(e1, 'rota-a', 0), v(e3, 'rota-a', 1), v(e2, null, 0)] });
    await save({ rotas: state.rotas.filter((r) => r.id !== 'rota-b') });
    await save({ rotas: [] }, 400);
    await save({ visitas: [] }, 400);
    await save({ visitas: [...state.visitas, state.visitas[0]] }, 400);
    await save({ versao: 0 }, 409);
    const concurrent = payload();
    const replies = await Promise.all([1, 2].map(() => fetch(`${base}/noite-de-natal/2026`, { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(concurrent) })));
    assert.deepEqual(replies.map((r) => r.status).sort(), [200, 409]);
    assert.equal(JSON.stringify((await db.query('SELECT * FROM eventos ORDER BY id')).rows), officialBefore);
    assert.equal(JSON.stringify((await db.query('SELECT * FROM escala_eventos ORDER BY id')).rows), scalesBefore);
    assert.equal(JSON.stringify((await db.query('SELECT * FROM pagamentos_escala_colaborador ORDER BY id')).rows), paymentBefore);
    console.log('PASS rotas criar/renomear/reordenar/remover; alocar/mover; duplicidade; invalidacao de trecho; 409 concorrente; evento/financeiro/escala/pagamentos intactos');
    state = await request('/noite-de-natal/2026');
    await db.query("UPDATE eventos SET data_evento='25/12/2026' WHERE id=$1", [e3.id]);
    await save({ visitas: state.visitas.filter((v) => v.evento_id !== e3.id) }, 409);
    await save({ visitas: state.visitas.filter((v) => v.evento_id !== e3.id), remover_inelegiveis: true });
    assert.equal(state.visitas.some((v) => v.evento_id === e3.id), false);
    await db.query("UPDATE eventos SET data_evento='24/12/2026' WHERE id=$1", [e3.id]);
    console.log('PASS alocacao inelegivel exige confirmacao explicita; evento preservado');
    const legacy = (await db.query('SELECT * FROM eventos WHERE contract_id=$1', [legacyContract.id])).rows[0];
    const classificationPath = `/noite-de-natal/2026/eventos/${legacy.id}/classificar`;
    assert.equal((await fetch(`${base}${classificationPath}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmado: true }) })).status, 401);
    await request(classificationPath, {}, 'POST', 400);
    await request(`/noite-de-natal/2027/eventos/${legacy.id}/classificar`, { confirmado: true }, 'POST', 409);
    await db.query("UPDATE servicos SET ativo=false WHERE id='visita'");
    await request(classificationPath, { confirmado: true }, 'POST', 409);
    await db.query("UPDATE servicos SET ativo=true WHERE id='visita'");
    const legacyBefore = (await db.query('SELECT * FROM contracts WHERE id=$1', [legacyContract.id])).rows[0];
    const classified = await request(classificationPath, { confirmado: true }, 'POST');
    assert.ok(classified.eventos.some((e) => e.id === legacy.id));
    assert.ok(!classified.revisao.some((e) => e.id === legacy.id));
    const legacyAfter = (await db.query('SELECT * FROM eventos WHERE id=$1', [legacy.id])).rows[0];
    assert.deepEqual(legacyAfter, { ...legacy, servico_principal_id: 'visita' });
    assert.deepEqual((await db.query('SELECT * FROM contracts WHERE id=$1', [legacyContract.id])).rows[0], { ...legacyBefore, servico_principal_id: 'visita' });
    assert.equal(JSON.stringify((await db.query('SELECT * FROM escala_eventos ORDER BY id')).rows), scalesBefore);
    assert.equal(JSON.stringify((await db.query('SELECT * FROM pagamentos_escala_colaborador ORDER BY id')).rows), paymentBefore);
    await request(classificationPath, { confirmado: true }, 'POST');
    const manualPath = `/eventos/${legacy.id}/classificacao-servico`;
    assert.equal((await fetch(`${base}${manualPath}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ servico_principal_id: 'noel' }) })).status, 401);
    await request(manualPath, { servico_principal_id: 'missing' }, 'PATCH', 400);
    await request(manualPath, { servico_principal_id: 'noel', valor_total: 1, hora_inicio: '00:00', contato_contratante: 'NAO SALVAR' }, 'PATCH');
    assert.deepEqual((await db.query('SELECT * FROM eventos WHERE id=$1', [legacy.id])).rows[0], { ...legacy, servico_principal_id: 'noel' });
    assert.deepEqual((await db.query('SELECT * FROM contracts WHERE id=$1', [legacyContract.id])).rows[0], { ...legacyBefore, servico_principal_id: 'noel' });
    await request(`/contracts/${legacyContract.id}`, { tema: 'Preserva classificacao manual' });
    assert.equal((await db.query('SELECT servico_principal_id FROM eventos WHERE id=$1', [legacy.id])).rows[0].servico_principal_id, 'noel');
    state = await request('/noite-de-natal/2026');
    await save({ contato_contratante: 'NAO SALVAR', visitas: state.visitas.map((v) => ({ ...v, contato_contratante: 'NAO SALVAR' })) });
    assert.equal((await db.query('SELECT contato_contratante FROM contracts WHERE id=$1', [c1.id])).rows[0].contato_contratante, '(81) 99999-0199');
    assert.equal(JSON.stringify((await db.query('SELECT * FROM escala_eventos ORDER BY id')).rows), scalesBefore);
    assert.equal(JSON.stringify((await db.query('SELECT * FROM pagamentos_escala_colaborador ORDER BY id')).rows), paymentBefore);
    console.log('PASS correcao manual transacional sem mudar dados oficiais; contato somente leitura; edicao posterior preserva classificacao');
    console.log('PASS classificacao autenticada/confirmada/idempotente; mesmo evento; somente FK muda no evento e contrato; financeiro/horarios/endereco/escala intactos');
    if (process.argv.includes('--serve')) {
      // Restore only the synthetic legacy fixture for the browser confirmation flow.
      await db.query('UPDATE eventos SET servico_principal_id=NULL WHERE id=$1', [legacy.id]);
      await db.query('UPDATE contracts SET servico_principal_id=NULL WHERE id=$1', [legacyContract.id]);
      for (const month of ['10', '11']) {
        const a = await create(`24/${month}/2026`, 'Recreacao', { nome_contratante: `UAT ${month} equipe incompleta`, qtd_recreadores: 2 });
        const b = await create(`24/${month}/2026`, 'Recreacao', { nome_contratante: `UAT ${month} conflito`, qtd_recreadores: 1 });
        const c = await create(`25/${month}/2026`, 'Recreacao', { nome_contratante: `UAT ${month} completo`, qtd_recreadores: 1 });
        for (const contract of [a, b, c]) {
          const id = (await db.query('SELECT id FROM eventos WHERE contract_id=$1', [contract.id])).rows[0].id;
          await db.query('UPDATE eventos SET qtd_recreadores=$1 WHERE id=$2', [contract.id === a.id ? 2 : 1, id]);
          await db.query("INSERT INTO escala_eventos(id,evento_id,colaborador_id,colaborador_nome,funcao,valor_recreador,status_aceite,status_pagamento) VALUES($1,$2,'noel-test','Noel teste','Recreador',100,'Confirmado','Pago')", [`scale-${id}`, id]);
          if (contract.id === c.id) await db.query("UPDATE eventos SET status_financeiro='Finalizado',sinal=500,sinal_confirmado=true,dt_pagamento_sinal='20/10/2026',resta=0 WHERE id=$1", [id]);
        }
      }
      await db.query("UPDATE eventos SET qtd_recreadores=3,hora_inicio='20:30',hora_fim='20:50',valor_total=470,status_financeiro='Em andamento',sinal=470,sinal_confirmado=true,dt_pagamento_sinal='20/12/2026',resta=0 WHERE id=$1", [e1.id]);
      await db.query("UPDATE escala_eventos SET status_aceite='Confirmado' WHERE evento_id=$1", [e1.id]);
      for (const [id, nome, funcao] of [['duende-test','Pink teste','Assistente/Duende'], ['motorista-test','Carlos teste','Motorista']]) {
        await db.query('INSERT INTO colaboradores(id,nome_colaborador) VALUES($1,$2)', [id, nome]);
        await db.query("INSERT INTO escala_eventos(id,evento_id,colaborador_id,colaborador_nome,funcao,status_aceite) VALUES($1,$2,$3,$4,$5,'Pendente')", [`scale-${id}`, e1.id, id, nome, funcao]);
      }
      await db.query('UPDATE eventos SET qtd_recreadores=2 WHERE id=$1', [e2.id]);
      await db.query("UPDATE escala_eventos SET funcao='Recreador' WHERE evento_id=$1", [e2.id]);
      await db.query('UPDATE eventos SET qtd_recreadores=1 WHERE id=$1', [e3.id]);
      console.log(`QA local: ${base}; usuario natal-test@example.invalid; senha ${password}. Banco descartavel ${name}. Pressione Enter para encerrar e remover SOMENTE este banco.`);
      process.stdin.resume(); await new Promise((resolve) => process.stdin.once('data', resolve)); process.stdin.pause();
    }
  } finally {
    if (server && server.exitCode === null) { server.kill(); await new Promise((resolve) => server.once('exit', resolve)); }
    if (db) await db.end();
    if (!/^hdl_natal_test_\d+$/.test(name)) throw Error('Nome inseguro para limpeza.');
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
