/* Teste integrado somente em PostgreSQL local e banco descartavel. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { Pool } = require('pg');
require('dotenv').config({ quiet: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const source = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(source.hostname)) {
    throw new Error('Teste permitido somente em PostgreSQL local.');
  }

  if (/prod|vps|hostinger|railway|render|supabase|neon/i.test(`${source.hostname}${source.pathname}${source.username}`)) {
    throw new Error('Origem parece producao; teste abortado.');
  }

  const dbName = `hdl_financeiro_fase1_test_${Date.now()}`;
  const DESCARTAVEL = /^hdl_financeiro_fase1_test_\d+$/;
  if (!DESCARTAVEL.test(dbName)) throw new Error('Nome de banco descartavel invalido.');
  const admin = new Pool({ connectionString: source.href });
  const pgBin = process.env.PG_BIN || 'C:/Program Files/PostgreSQL/18/bin';
  const pgEnv = { ...process.env, PGPASSWORD: decodeURIComponent(source.password) };
  const dump = spawnSync(path.join(pgBin, 'pg_dump'), [
    '-h', source.hostname, '-p', source.port || '5432', '-U', decodeURIComponent(source.username),
    '-d', source.pathname.slice(1), '--schema-only', '--no-owner', '--no-privileges',
  ], { env: pgEnv, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (dump.status) throw new Error(dump.stderr || 'Falha no pg_dump local.');

  let db;
  let server;
  try {
    await admin.query(`CREATE DATABASE ${dbName}`);
    source.pathname = `/${dbName}`;
    db = new Pool({ connectionString: source.href });
    const restore = spawnSync(path.join(pgBin, 'psql'), [
      '-h', source.hostname, '-p', source.port || '5432', '-U', decodeURIComponent(source.username),
      '-d', dbName, '-v', 'ON_ERROR_STOP=1',
    ], { env: pgEnv, input: dump.stdout, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    if (restore.status) throw new Error(restore.stderr || 'Falha ao restaurar schema descartavel.');

    const { rows: [{ atual }] } = await db.query('SELECT current_database() AS atual');
    if (atual !== dbName || !DESCARTAVEL.test(atual)) throw new Error('Conexao fora do banco descartavel; teste abortado.');

    await db.query(`
      INSERT INTO eventos (
        id,identificador_interno,contratante_nome,data_evento,valor_total,sinal,sinal_confirmado,dt_pagamento_sinal,
        deslocamento,extras,status_financeiro
      ) VALUES ('fin-legacy','ID 215','Legado financeiro','20/10/2026',600,415,true,'29/10/2026',100,50,'Finalizado')
    `);

    // Falha no meio da migration nao deixa nada aplicado.
    const sqlMigration = fs.readFileSync(path.join(__dirname, '../db/migrations/003_integridade_financeira_fase1.sql'), 'utf8');
    const rollbackClient = await db.connect();
    try {
      await rollbackClient.query('BEGIN');
      await rollbackClient.query(sqlMigration);
      await assert.rejects(rollbackClient.query('SELECT 1/0'));
      await rollbackClient.query('ROLLBACK');
    } finally {
      rollbackClient.release();
    }
    const aposRollback = await db.query(`
      SELECT to_regclass('public.custos_operacionais_movimentos') AS movimentos,
             (SELECT COUNT(*)::int FROM information_schema.columns WHERE table_name='ciclos_financeiros' AND column_name='snapshot') AS snapshot,
             (SELECT COUNT(*)::int FROM pg_trigger WHERE tgname='eventos_inicializar_custos_operacionais') AS gatilhos
    `);
    assert.deepEqual(aposRollback.rows[0], { movimentos: null, snapshot: 0, gatilhos: 0 });
    console.log('PASS rollback transacional da migration');

    for (let run = 1; run <= 2; run += 1) {
      const migration = spawnSync(process.execPath, [
        'scripts/migrateIntegridadeFinanceiraFase1.js', '--apply', `--database=${dbName}`,
      ], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: source.href },
        encoding: 'utf8',
      });
      assert.equal(migration.status, 0, migration.stderr || migration.stdout);
    }

    const legacy = await db.query(`
      SELECT tipo,situacao,valor_quitado,data_quitacao,origem
      FROM custos_operacionais_evento WHERE evento_id='fin-legacy' ORDER BY tipo
    `);
    assert.deepEqual(legacy.rows.map((row) => row.tipo), ['deslocamento', 'extras']);
    assert.ok(legacy.rows.every((row) => row.situacao === 'LEGADO'));
    assert.ok(legacy.rows.every((row) => Number(row.valor_quitado) === 0 && row.data_quitacao === null));
    assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM custos_operacionais_historico WHERE evento_id='fin-legacy' AND acao='IMPORTACAO_LEGADO'")).rows[0].total, 2);
    console.log('PASS migration local, preservadora, idempotente e legado sem quitacao/data inventada');

    await db.query(`
      INSERT INTO eventos (
        id,identificador_interno,contratante_nome,data_evento,valor_total,sinal,sinal_confirmado,dt_pagamento_sinal,
        deslocamento,extras,status_financeiro
      ) VALUES ('fin-modern','ID 213','Evento financeiro','30/10/2026',600,490,true,'29/10/2026',0,0,'Em andamento')
    `);
    await db.query("INSERT INTO colaboradores(id,nome_colaborador) VALUES ('fin-c1','Pessoa 1'),('fin-c2','Pessoa 2')");
    await db.query(`
      INSERT INTO escala_eventos(id,evento_id,colaborador_id,colaborador_nome,valor_recreador,status_pagamento,status_aceite)
      VALUES
        ('fin-scale-1','fin-modern','fin-c1','Pessoa 1',200,'Pendente','Confirmado'),
        ('fin-scale-2','fin-modern','fin-c2','Pessoa 2',100,'Pago','Confirmado')
    `);
    await db.query(`
      INSERT INTO pagamentos_escala_colaborador
        (id,escala_evento_id,evento_id,colaborador_id,tipo_pagamento,valor,data_pagamento,status)
      VALUES ('fin-pay-1','fin-scale-1','fin-modern','fin-c1','adiantamento',50,'2026-10-29','ativo')
    `);

    const salt = crypto.randomBytes(16).toString('hex');
    const password = 'Financeiro-Fase1-Local-2026';
    const hash = ['scrypt', 16384, 8, 1, salt, crypto.scryptSync(password, salt, 64).toString('hex')].join('$');
    await db.query(
      "INSERT INTO usuarios(id,nome,email,senha_hash,perfil,ativo) VALUES('fin-user','Gestor financeiro','fin-test@example.invalid',$1,'gestor',true)",
      [hash]
    );

    const port = Number(process.env.FINANCEIRO_FASE1_TEST_PORT || 3110);
    server = spawn(process.execPath, ['src/index.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: source.href, PORT: String(port), EMAIL_ENABLED: 'false', TZ: process.env.FINANCEIRO_FASE1_TEST_TZ || 'America/Recife' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let serverLog = '';
    server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
    server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        if ((await fetch(`${base}/auth/me`)).status === 401) { ready = true; break; }
      } catch {}
      await wait(150);
    }
    assert.ok(ready, serverLog);
    assert.equal((await fetch(`${base}/custos-operacionais`)).status, 401);

    const login = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fin-test@example.invalid', senha: password }),
    });
    assert.equal(login.status, 200, await login.text());
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const request = async (route, { method = 'GET', body, expected = 200 } = {}) => {
      const response = await fetch(`${base}${route}`, {
        method,
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const payload = await response.json();
      assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(payload)}`);
      return payload.dados;
    };

    const events = await request('/eventos');
    const modernSummary = events.find((row) => row.id === 'fin-modern');
    assert.equal(Number(modernSummary.soma_valor_recreador), 300);
    assert.equal(Number(modernSummary.soma_valor_recreador_pago), 150);
    assert.equal(Number(modernSummary.soma_valor_recreador_pendente), 150);
    console.log('PASS equipe individual: pago, parcial por movimento e pendente sem depender do agregado legado');

    await request('/eventos/fin-modern', {
      method: 'PUT', body: { deslocamento: 80, extras: 40 },
    });
    let operational = await request('/eventos/fin-modern/custos-operacionais');
    assert.deepEqual(operational.itens.map((row) => row.situacao), ['PENDENTE', 'PENDENTE']);

    await request('/eventos/fin-modern/custos-operacionais/deslocamento', {
      method: 'PATCH', body: { situacao: 'PAGO', data_quitacao: '2026-10-29' },
    });
    await request('/eventos/fin-modern/custos-operacionais/extras', {
      method: 'PATCH', body: { situacao: 'PARCIAL', valor_pagamento: 10, data_quitacao: '2026-10-30' },
    });
    operational = await request('/eventos/fin-modern/custos-operacionais');
    assert.equal(operational.itens.find((row) => row.tipo === 'deslocamento').situacao, 'PAGO');
    assert.equal(operational.itens.find((row) => row.tipo === 'extras').situacao, 'PARCIAL');
    assert.ok(operational.historico.some((row) => row.acao === 'QUITACAO' && row.created_by === 'fin-user'));

    await request('/eventos/fin-modern/custos-operacionais/deslocamento', {
      method: 'PATCH', body: { situacao: 'PENDENTE' }, expected: 409,
    });
    await request('/eventos/fin-modern/custos-operacionais/deslocamento', {
      method: 'PATCH', body: { situacao: 'PENDENTE', confirmacao_reversao: true, observacao: 'Teste de reversao' },
    });
    assert.equal(
      (await db.query("SELECT situacao FROM custos_operacionais_evento WHERE evento_id='fin-modern' AND tipo='deslocamento'")).rows[0].situacao,
      'PENDENTE'
    );
    assert.equal(
      (await db.query("SELECT COUNT(*)::int AS total FROM custos_operacionais_historico WHERE evento_id='fin-modern' AND acao='REVERSAO_QUITACAO'")).rows[0].total,
      1
    );
    console.log('PASS deslocamento/extras: pendente, parcial, pago, data real, autor e reversao confirmada/auditada');

    await request('/eventos/fin-legacy/custos-operacionais/deslocamento', {
      method: 'PATCH', body: { situacao: 'PAGO', data_nao_informada: true },
    });
    const legacyPaid = await request('/eventos/fin-legacy/custos-operacionais');
    const legacyDisplacement = legacyPaid.itens.find((row) => row.tipo === 'deslocamento');
    assert.equal(legacyDisplacement.situacao, 'PAGO');
    assert.equal(legacyDisplacement.data_quitacao, null);

    await request('/eventos/fin-modern/custos-operacionais/deslocamento', {
      method: 'PATCH', body: { situacao: 'PAGO', data_quitacao: '2026-10-30' },
    });
    await request('/eventos/fin-modern', { method: 'PUT', body: { deslocamento: 100 } });
    assert.equal(
      (await db.query("SELECT situacao,valor_quitado FROM custos_operacionais_evento WHERE evento_id='fin-modern' AND tipo='deslocamento'")).rows[0].situacao,
      'PARCIAL'
    );
    await request('/eventos/fin-modern', { method: 'PUT', body: { deslocamento: 70 }, expected: 409 });
    console.log('PASS alteracao de valor: quitado vira parcial ao aumentar e nunca aceita previsto abaixo do ja pago');

    await assert.rejects(
      db.query("INSERT INTO custos_operacionais_evento(id,evento_id,tipo,situacao,valor_quitado) VALUES('invalid','fin-modern','combustivel','PENDENTE',0)"),
      /custos_operacionais_evento_tipo_check/
    );
    console.log('PASS constraints, indices e API autenticada no banco descartavel');

    // Datas de quitacao chegam como dia civil, independentemente do fuso do processo Node.
    const serializado = await request('/custos-operacionais');
    assert.ok(serializado.custos.filter((row) => row.data_quitacao).every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.data_quitacao)));
    assert.ok(serializado.movimentos.filter((row) => row.data_quitacao).every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.data_quitacao)));
    assert.ok(serializado.pagamentos_equipe.some((row) => row.data_pagamento === '2026-10-29'));
    console.log('PASS serializacao de DATE: YYYY-MM-DD sem horario nas APIs financeiras');

    // Dois pagamentos parciais acumulam; valor ambiguo e recusado; reversao preserva auditoria.
    await db.query(`
      INSERT INTO eventos (id,identificador_interno,contratante_nome,data_evento,valor_total,deslocamento,status_financeiro)
      VALUES ('fin-parcial','ID 300','Parciais','10/10/2026',500,100,'Em andamento')
    `);
    const tipoParcial = '/eventos/fin-parcial/custos-operacionais/deslocamento';
    await request(tipoParcial, { method: 'PATCH', body: { situacao: 'PARCIAL', valor_quitado: 30, data_quitacao: '2026-10-10' }, expected: 400 });
    await request(tipoParcial, { method: 'PATCH', body: { situacao: 'PARCIAL', valor_pagamento: 30, data_quitacao: '2026-10-10' } });
    const segundoParcial = await request(tipoParcial, { method: 'PATCH', body: { situacao: 'PARCIAL', valor_pagamento: 40, data_quitacao: '2026-10-20' } });
    assert.equal(Number(segundoParcial.valor_quitado), 70);
    assert.equal(segundoParcial.situacao, 'PARCIAL');
    assert.equal(segundoParcial.data_quitacao, '2026-10-20');
    await request(tipoParcial, { method: 'PATCH', body: { situacao: 'PARCIAL', valor_pagamento: 31, data_quitacao: '2026-10-21' }, expected: 400 });
    const parcialDetalhe = await request('/eventos/fin-parcial/custos-operacionais');
    assert.deepEqual(parcialDetalhe.movimentos.map((row) => [Number(row.valor), row.data_quitacao]), [[30, '2026-10-10'], [40, '2026-10-20']]);
    const quitadoFinal = await request(tipoParcial, { method: 'PATCH', body: { situacao: 'PAGO', data_quitacao: '2026-10-25' } });
    assert.equal(quitadoFinal.situacao, 'PAGO');
    assert.equal(Number(quitadoFinal.valor_quitado), 100);
    assert.equal((await db.query("SELECT valor FROM custos_operacionais_movimentos WHERE evento_id='fin-parcial' AND data_quitacao='2026-10-25'")).rows[0].valor, '30.00');
    await request(tipoParcial, { method: 'PATCH', body: { situacao: 'PAGO', data_quitacao: '2026-10-26' }, expected: 409 });
    await request(tipoParcial, { method: 'PATCH', body: { situacao: 'PENDENTE', confirmacao_reversao: true } });
    const estornos = await db.query("SELECT status,estornado_em FROM custos_operacionais_movimentos WHERE evento_id='fin-parcial'");
    assert.equal(estornos.rowCount, 3);
    assert.ok(estornos.rows.every((row) => row.status === 'estornado' && row.estornado_em));
    console.log('PASS parciais acumulados, valor ambiguo recusado, reversao com historico preservado');

    // Marcar escala como paga registra so o restante, com data civil de Recife e sem duplicar.
    const hojeRecife = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife' }).format(new Date());
    await request('/escalas-evento/fin-scale-1', { method: 'PUT', body: { status_pagamento: 'Pago' } });
    const movimentoPago = await db.query(`
      SELECT valor,origem,status,to_char(data_pagamento,'YYYY-MM-DD') AS data
      FROM pagamentos_escala_colaborador WHERE escala_evento_id='fin-scale-1' AND tipo_pagamento='pagamento_final'
    `);
    assert.equal(movimentoPago.rowCount, 1);
    assert.equal(Number(movimentoPago.rows[0].valor), 150);
    assert.equal(movimentoPago.rows[0].data, hojeRecife);
    assert.equal(movimentoPago.rows[0].origem, 'status_pago');
    await request('/escalas-evento/fin-scale-1', { method: 'PUT', body: { status_pagamento: 'Pago' } });
    assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM pagamentos_escala_colaborador WHERE escala_evento_id='fin-scale-1' AND tipo_pagamento='pagamento_final'")).rows[0].total, 1);
    let resumoEscala = (await request('/eventos')).find((row) => row.id === 'fin-modern');
    assert.equal(Number(resumoEscala.soma_valor_recreador_pendente), 0);

    // Reversao cancela a quitacao gerada, preserva adiantamento real e fica auditada.
    await request('/escalas-evento/fin-scale-1', { method: 'PUT', body: { status_pagamento: 'Pendente' } });
    const aposReversao = await db.query("SELECT tipo_pagamento,status,cancelado_em FROM pagamentos_escala_colaborador WHERE escala_evento_id='fin-scale-1' ORDER BY tipo_pagamento");
    assert.deepEqual(aposReversao.rows.map((row) => [row.tipo_pagamento, row.status]), [['adiantamento', 'ativo'], ['pagamento_final', 'cancelado']]);
    assert.ok(aposReversao.rows[1].cancelado_em);
    assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM escala_pagamento_historico WHERE escala_evento_id='fin-scale-1' AND acao='REVERSAO'")).rows[0].total, 1);
    resumoEscala = (await request('/eventos')).find((row) => row.id === 'fin-modern');
    assert.equal(Number(resumoEscala.soma_valor_recreador_pendente), 150);

    // Cancelar a quitacao automatica reabre a escala.
    await request('/escalas-evento/fin-scale-1', { method: 'PUT', body: { status_pagamento: 'Pago', data_pagamento: '2026-10-29' } });
    const quitacaoId = (await db.query("SELECT id FROM pagamentos_escala_colaborador WHERE escala_evento_id='fin-scale-1' AND status='ativo' AND tipo_pagamento='pagamento_final'")).rows[0].id;
    await request(`/pagamentos-escala-colaborador/${quitacaoId}/cancelar`, { method: 'PATCH' });
    assert.equal((await db.query("SELECT status_pagamento FROM escala_eventos WHERE id='fin-scale-1'")).rows[0].status_pagamento, 'Pendente');
    console.log('PASS escala paga cria movimento com data, nao duplica e reversao e auditavel');

    // Escala antiga paga sem movimento continua sem data; nada e inventado.
    assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM pagamentos_escala_colaborador WHERE escala_evento_id='fin-scale-2'")).rows[0].total, 0);

    // Pagamento em lote cria movimentos, respeitando adiantamentos.
    await db.query(`
      INSERT INTO eventos (id,identificador_interno,contratante_nome,data_evento,valor_total,status_financeiro)
      VALUES ('fin-lote','ID 301','Lote','01/10/2026',500,'Em andamento')
    `);
    await db.query(`
      INSERT INTO escala_eventos(id,evento_id,colaborador_id,colaborador_nome,valor_recreador,status_pagamento,status_aceite)
      VALUES ('fin-lote-1','fin-lote','fin-c1','Pessoa 1',120,'Pendente','Confirmado'),
             ('fin-lote-2','fin-lote','fin-c1','Pessoa 1',80,'Pendente','Confirmado')
    `);
    await db.query(`
      INSERT INTO pagamentos_escala_colaborador (id,escala_evento_id,evento_id,colaborador_id,valor,data_pagamento,status)
      VALUES ('fin-lote-adiant','fin-lote-1','fin-lote','fin-c1',20,'2026-10-01','ativo')
    `);
    const lote = await fetch(`${base}/escalas-evento/pagamento-lote`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ colaborador_id: 'fin-c1', escala_evento_ids: ['fin-lote-1', 'fin-lote-2'] }),
    });
    assert.equal(lote.status, 200, await lote.clone().text());
    assert.equal((await lote.json()).updated_count, 2);
    const movimentosLote = await db.query(`
      SELECT escala_evento_id,valor,origem,to_char(data_pagamento,'YYYY-MM-DD') AS data
      FROM pagamentos_escala_colaborador WHERE evento_id='fin-lote' AND origem='lote' ORDER BY escala_evento_id
    `);
    assert.deepEqual(movimentosLote.rows.map((row) => [row.escala_evento_id, Number(row.valor), row.data]), [
      ['fin-lote-1', 100, hojeRecife], ['fin-lote-2', 80, hojeRecife],
    ]);
    console.log('PASS pagamento em lote gera movimentos com data real e so o restante');

    // Evento sem escala preserva pagamento_colaborador ao salvar; com escala a soma manda.
    await db.query(`
      INSERT INTO eventos (id,identificador_interno,contratante_nome,data_evento,valor_total,pagamento_colaborador,status_financeiro)
      VALUES ('fin-sem-escala','ID 302','Sem escala','02/10/2026',500,200,'Em andamento')
    `);
    await request('/eventos/fin-sem-escala', { method: 'PUT', body: { observacoes: 'salvo' } });
    const semEscala = (await request('/eventos')).find((row) => row.id === 'fin-sem-escala');
    assert.equal(Number(semEscala.pagamento_colaborador), 200);
    assert.equal(Number(semEscala.qtd_escalas), 0);
    assert.equal(Number(semEscala.custo_total), 200);
    console.log('PASS evento sem escala nao perde pagamento_colaborador');

    // Evento novo nunca nasce LEGADO, por contrato ou insercao direta.
    await db.query(`
      INSERT INTO eventos (id,identificador_interno,contratante_nome,data_evento,valor_total,deslocamento,extras,status_financeiro)
      VALUES ('fin-novo','ID 303','Novo','03/10/2026',500,75,0,'Em andamento')
    `);
    const novoCustos = await db.query("SELECT tipo,situacao,origem FROM custos_operacionais_evento WHERE evento_id='fin-novo' ORDER BY tipo");
    assert.deepEqual(novoCustos.rows.map((row) => [row.tipo, row.situacao, row.origem]), [
      ['deslocamento', 'PENDENTE', 'evento_novo'], ['extras', 'NAO_INFORMADO', 'evento_novo'],
    ]);
    const contrato = await request('/contracts', { method: 'POST', body: {
      nome_contratante: 'Contrato novo', local: 'Recife', data_evento: '20/11/2026', horario_inicio: '10:00',
      servico_contratado: 'Recreacao', valor_total: 500, entrada: 100,
    } });
    const custosContrato = await db.query(`
      SELECT c.situacao FROM custos_operacionais_evento c
      JOIN eventos e ON e.id=c.evento_id WHERE e.contract_id=$1
    `, [contrato.id]);
    assert.equal(custosContrato.rowCount, 2);
    assert.ok(custosContrato.rows.every((row) => row.situacao === 'NAO_INFORMADO'));
    console.log('PASS evento novo inicia como PENDENTE/NAO_INFORMADO em todos os caminhos');

    // Travamento: snapshot congelado, responsavel gravado, trigger bloqueia alteracao.
    const snapshotBase = {
      versao: 1,
      ciclo: { ano: 2026, mes: 10, tipo: 'A', inicio: '2026-09-29', fim: '2026-10-14' },
      totais: {
        totalRecebido: 300, retencaoTotal: 100, caixaLivre: 200, custosApropriados: 0,
        custosPrevistos: 100, custosQuitadosNoPeriodo: 0, custosQuitadosSemData: 0, qtd: 1,
      },
      cofrinhos: [
        { key: 'gestor', nome: 'Gestor personalizado', percentual: 0.75, valor: 150 },
        { key: 'reserva', nome: 'Reserva', percentual: 0.25, valor: 50 },
      ],
      custosQuitados: [],
      eventos: [{ id: 'fin-modern', recebido: 300, retencao: 100, recebimentos: [] }],
    };
    await request('/ciclos-financeiros/travar', { method: 'POST', body: { ano: 2026, mes: 10, tipo: 'A', snapshot: { ...snapshotBase, totais: { ...snapshotBase.totais, caixaLivre: 150 } } }, expected: 400 });
    await request('/ciclos-financeiros/travar', { method: 'POST', body: { ano: 2026, mes: 10, tipo: 'A', snapshot: { ...snapshotBase, cofrinhos: [{ key: 'gestor', percentual: 0.5, valor: 200 }] } }, expected: 400 });
    await request('/ciclos-financeiros/travar', { method: 'POST', body: { ano: 2026, mes: 10, tipo: 'A' }, expected: 400 });
    const travado = await request('/ciclos-financeiros/travar', { method: 'POST', body: { ano: 2026, mes: 10, tipo: 'A', snapshot: snapshotBase }, expected: 201 });
    assert.equal(travado.status, 'travado');
    assert.equal(travado.travado_por, 'fin-user');
    assert.ok(travado.travado_em);
    assert.equal(travado.snapshot_versao, 1);
    assert.equal(travado.data_inicio, '2026-09-29');
    assert.equal(Number(travado.cofrinho_gestor), 150);
    await request('/ciclos-financeiros/travar', { method: 'POST', body: { ano: 2026, mes: 10, tipo: 'A', snapshot: snapshotBase }, expected: 409 });
    await request(`/ciclos-financeiros/${travado.id}`, { method: 'PUT', body: { caixa_livre: 1 }, expected: 409 });
    await request(`/ciclos-financeiros/${travado.id}`, { method: 'PUT', body: { status: 'aberto' }, expected: 400 });
    await assert.rejects(db.query(`UPDATE ciclos_financeiros SET caixa_livre=1 WHERE id=$1`, [travado.id]), /imutavel/);
    await assert.rejects(db.query(`DELETE FROM ciclos_financeiros WHERE id=$1`, [travado.id]), /excluido/);
    // Alteracao posterior na Agenda nao toca o fechamento.
    await request('/eventos/fin-modern', { method: 'PUT', body: { valor_total: 9000 } });
    const relido = (await request('/ciclos-financeiros')).find((row) => row.id === travado.id);
    assert.deepEqual(relido.snapshot, travado.snapshot);
    assert.equal(Number(relido.caixa_livre), 200);
    await request(`/ciclos-financeiros/${travado.id}/destravar`, { method: 'POST', body: {}, expected: 400 });
    const destravado = await request(`/ciclos-financeiros/${travado.id}/destravar`, { method: 'POST', body: { motivo: 'Teste de correcao' } });
    assert.equal(destravado.status, 'aberto');
    const historicoCiclo = await db.query("SELECT acao,motivo,registro FROM ciclos_financeiros_historico WHERE ciclo_id=$1 ORDER BY created_at", [travado.id]);
    assert.deepEqual(historicoCiclo.rows.map((row) => row.acao), ['TRAVAMENTO', 'DESTRAVAMENTO']);
    assert.equal(historicoCiclo.rows[1].motivo, 'Teste de correcao');
    assert.deepEqual(historicoCiclo.rows[1].registro.snapshot, travado.snapshot);
    console.log('PASS ciclo travado imutavel na API e no banco; destravamento exige motivo e guarda o fechamento');

    // Permissoes: leitura financeira ve mas nao edita; operador nao ve.
    const criarSessao = async (id, email, perfil) => {
      await db.query(
        'INSERT INTO usuarios(id,nome,email,senha_hash,perfil,ativo) VALUES($1,$2,$3,$4,$5,true)',
        [id, id, email, hash, perfil]
      );
      const resposta = await fetch(`${base}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha: password }),
      });
      assert.equal(resposta.status, 200);
      return resposta.headers.get('set-cookie').split(';')[0];
    };
    const statusCom = async (sessao, rota, method = 'GET', body) => (await fetch(`${base}${rota}`, {
      method,
      headers: { Cookie: sessao, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })).status;
    const leitura = await criarSessao('fin-leitura', 'fin-leitura@example.invalid', 'financeiro_leitura');
    const operador = await criarSessao('fin-operador', 'fin-operador@example.invalid', 'operador');
    const patchCusto = { situacao: 'PAGO', data_quitacao: '2026-10-30' };
    assert.equal(await statusCom(leitura, '/custos-operacionais'), 200);
    assert.equal(await statusCom(leitura, '/ciclos-financeiros'), 200);
    assert.equal(await statusCom(leitura, '/eventos/fin-novo/custos-operacionais/deslocamento', 'PATCH', patchCusto), 403);
    assert.equal(await statusCom(leitura, '/ciclos-financeiros/travar', 'POST', { ano: 2026, mes: 10, tipo: 'B', snapshot: snapshotBase }), 403);
    assert.equal(await statusCom(leitura, `/ciclos-financeiros/${travado.id}/destravar`, 'POST', { motivo: 'x' }), 403);
    assert.equal(await statusCom(leitura, '/escalas-evento/pagamento-lote', 'PATCH', { colaborador_id: 'fin-c1', escala_evento_ids: ['fin-scale-1'] }), 403);
    assert.equal(await statusCom(leitura, '/cofrinhos-config', 'PUT', { items: [] }), 403);
    assert.equal(await statusCom(operador, '/custos-operacionais'), 403);
    assert.equal(await statusCom(operador, '/eventos/fin-novo/custos-operacionais/deslocamento', 'PATCH', patchCusto), 403);
    assert.equal((await db.query("SELECT situacao FROM custos_operacionais_evento WHERE evento_id='fin-novo' AND tipo='deslocamento'")).rows[0].situacao, 'PENDENTE');
    console.log('PASS PATCH e travamento exigem financeiro.edit; leitura consulta e nao altera');

    // Concorrencia: duas quitacoes simultaneas nao pagam o custo duas vezes.
    const paralelas = await Promise.all([
      fetch(`${base}/eventos/fin-novo/custos-operacionais/deslocamento`, { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(patchCusto) }),
      fetch(`${base}/eventos/fin-novo/custos-operacionais/deslocamento`, { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(patchCusto) }),
    ]);
    assert.deepEqual(paralelas.map((row) => row.status).sort(), [200, 409]);
    assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM custos_operacionais_movimentos WHERE evento_id='fin-novo'")).rows[0].total, 1);
    console.log('PASS concorrencia: quitacao simultanea gera um unico movimento');

    // Rollback do PUT: valor abaixo do quitado nao deixa alteracao parcial.
    const antesRollback = (await db.query("SELECT observacoes,deslocamento FROM eventos WHERE id='fin-novo'")).rows[0];
    await request('/eventos/fin-novo', { method: 'PUT', body: { observacoes: 'nao salvar', deslocamento: 10 }, expected: 409 });
    assert.deepEqual((await db.query("SELECT observacoes,deslocamento FROM eventos WHERE id='fin-novo'")).rows[0], antesRollback);
    console.log('PASS PUT /eventos transacional');

    if (process.argv.includes('--serve')) {
      console.log(`QA local: ${base}; usuario fin-test@example.invalid; senha ${password}. Banco descartavel ${dbName}. Pressione Enter para encerrar e remover SOMENTE este banco.`);
      process.stdin.resume();
      await new Promise((resolve) => process.stdin.once('data', resolve));
      process.stdin.pause();
    }
  } finally {
    if (server && server.exitCode === null) {
      server.kill();
      await new Promise((resolve) => server.once('exit', resolve));
    }
    if (db) await db.end();
    if (!DESCARTAVEL.test(dbName)) throw new Error('Nome inseguro para limpeza.');
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
