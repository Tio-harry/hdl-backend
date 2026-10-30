/* Teste integrado somente em PostgreSQL local e banco descartavel. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
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
    const pendentesLote = await request('/colaboradores/fin-c1/pagamentos-pendentes');
    const restantes = Object.fromEntries(pendentesLote.map((row) => [row.escala_evento_id, Number(row.valor_restante)]));
    assert.equal(restantes['fin-lote-1'], 100);
    assert.equal(restantes['fin-lote-2'], 80);
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

    // Perfil de leitura: nenhuma escrita passa, por rota financeira ou geral; leitura segue.
    const escritasBloqueadas = [
      ['/eventos/fin-novo', 'PUT', { valor_total: 1, sinal: 1 }],
      ['/eventos/fin-novo/escalas', 'POST', { colaborador_id: 'fin-c1', valor_recreador: 1 }],
      ['/escalas-evento/fin-scale-1', 'PUT', { status_pagamento: 'Pago' }],
      ['/escalas-evento/fin-scale-1', 'DELETE'],
      ['/escalas-evento/fin-scale-1/pagamentos', 'POST', { valor: 1 }],
      ['/pagamentos-escala-colaborador/fin-pay-1', 'PUT', { valor: 1 }],
      ['/pagamentos-escala-colaborador/fin-pay-1/cancelar', 'PATCH'],
      ['/ciclos-financeiros', 'POST', { ano: 2026, mes: 1, tipo: 'A' }],
      ['/contracts', 'POST', { nome_contratante: 'x' }],
    ];
    const fotografia = async () => JSON.stringify((await db.query(`
      SELECT (SELECT json_agg(e ORDER BY id) FROM eventos e) AS eventos,
             (SELECT json_agg(e ORDER BY id) FROM escala_eventos e) AS escalas,
             (SELECT json_agg(p ORDER BY id) FROM pagamentos_escala_colaborador p) AS pagamentos
    `)).rows[0]);
    const antesLeitura = await fotografia();
    for (const [rota, metodo, corpo] of escritasBloqueadas) {
      assert.equal(await statusCom(leitura, rota, metodo, corpo), 403, `${metodo} ${rota}`);
    }
    assert.equal(await fotografia(), antesLeitura);
    for (const rota of ['/eventos', '/custos-operacionais', '/ciclos-financeiros', '/cofrinhos-config', '/auth/me']) {
      assert.equal(await statusCom(leitura, rota), 200, rota);
    }
    // Gestor e operador seguem escrevendo em rotas gerais.
    assert.equal(await statusCom(cookie, '/eventos/fin-novo', 'PUT', { observacoes: 'gestor salva' }), 200);
    assert.equal(await statusCom(operador, '/eventos/fin-novo', 'PUT', { observacoes: 'operador salva' }), 200);
    console.log('PASS perfil de leitura: 403 em toda escrita, 200 em leitura, gestor e operador preservados');

    // Escala paga com valor aumentado: acrescimo vira obrigacao e exige novo pagamento datado.
    await db.query(`
      INSERT INTO eventos (id,identificador_interno,contratante_nome,data_evento,valor_total,status_financeiro)
      VALUES ('fin-aumento','ID 310','Aumento','05/10/2026',900,'Em andamento')
    `);
    await db.query(`
      INSERT INTO escala_eventos(id,evento_id,colaborador_id,colaborador_nome,valor_recreador,status_pagamento,status_aceite)
      VALUES ('fin-aum-mov','fin-aumento','fin-c1','Pessoa 1',100,'Pendente','Confirmado'),
             ('fin-aum-antiga','fin-aumento','fin-c2','Pessoa 2',100,'Pago','Confirmado')
    `);
    await request('/escalas-evento/fin-aum-mov', { method: 'PUT', body: { status_pagamento: 'Pago', data_pagamento: '2026-10-05' } });
    const resumoAumento = async () => {
      const row = (await request('/eventos')).find((item) => item.id === 'fin-aumento');
      return [Number(row.soma_valor_recreador), Number(row.soma_valor_recreador_pago), Number(row.soma_valor_recreador_pendente)];
    };
    assert.deepEqual(await resumoAumento(), [200, 200, 0]);
    const aumentada = await request('/escalas-evento/fin-aum-mov', { method: 'PUT', body: { valor_recreador: 150 } });
    assert.equal(aumentada.status_pagamento, 'Pendente');
    assert.deepEqual(await resumoAumento(), [250, 200, 50]);
    await request('/escalas-evento/fin-aum-mov', { method: 'PUT', body: { status_pagamento: 'Pago', data_pagamento: '2026-11-03' } });
    const movimentosAumento = await db.query(`
      SELECT valor,to_char(data_pagamento,'YYYY-MM-DD') AS data FROM pagamentos_escala_colaborador
      WHERE escala_evento_id='fin-aum-mov' AND status='ativo' ORDER BY data_pagamento
    `);
    assert.deepEqual(movimentosAumento.rows.map((row) => [Number(row.valor), row.data]), [[100, '2026-10-05'], [50, '2026-11-03']]);
    assert.deepEqual(await resumoAumento(), [250, 250, 0]);
    // Reverter a segunda quitacao mantem a primeira.
    await request('/escalas-evento/fin-aum-mov', { method: 'PUT', body: { status_pagamento: 'Pendente' } });
    assert.deepEqual(await resumoAumento(), [250, 200, 50]);
    // Escala antiga, paga sem movimento: 100 seguem pagos sem data e so 40 ficam devidos.
    await request('/escalas-evento/fin-aum-antiga', { method: 'PUT', body: { valor_recreador: 140 } });
    assert.deepEqual(await resumoAumento(), [290, 200, 90]);
    assert.equal((await db.query("SELECT valor_pago_sem_data FROM escala_eventos WHERE id='fin-aum-antiga'")).rows[0].valor_pago_sem_data, '100.00');
    assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM pagamentos_escala_colaborador WHERE escala_evento_id='fin-aum-antiga'")).rows[0].total, 0);
    await request('/escalas-evento/fin-aum-antiga', { method: 'PUT', body: { status_pagamento: 'Pago', data_pagamento: '2026-11-04' } });
    const pagoAntiga = await db.query("SELECT valor,to_char(data_pagamento,'YYYY-MM-DD') AS data FROM pagamentos_escala_colaborador WHERE escala_evento_id='fin-aum-antiga'");
    assert.deepEqual(pagoAntiga.rows.map((row) => [Number(row.valor), row.data]), [[40, '2026-11-04']]);
    const ajustes = await db.query("SELECT valor_recreador_anterior,valor_recreador_novo FROM escala_pagamento_historico WHERE escala_evento_id='fin-aum-antiga' AND acao='AJUSTE_VALOR'");
    assert.deepEqual(ajustes.rows.map((row) => [Number(row.valor_recreador_anterior), Number(row.valor_recreador_novo)]), [[100, 140]]);
    // Reduzir valor de escala paga nao reabre.
    const reduzida = await request('/escalas-evento/fin-aum-antiga', { method: 'PUT', body: { valor_recreador: 120 } });
    assert.equal(reduzida.status_pagamento, 'Pago');
    console.log('PASS escala paga com aumento: diferenca pendente, novo movimento datado, sem data inventada');

    // Snapshot com liberacao de obrigacao precisa fechar.
    const snapshotLiberacao = {
      ...snapshotBase,
      ciclo: { ano: 2026, mes: 10, tipo: 'B', inicio: '2026-10-15', fim: '2026-10-28' },
      totais: { ...snapshotBase.totais, caixaLivre: 260, liberacoesObrigacao: 60 },
      liberacoes: [{ eventoId: 'fin-modern', valor: 60 }],
      cofrinhos: [{ key: 'gestor', nome: 'Gestor', percentual: 1, valor: 260 }],
    };
    await request('/ciclos-financeiros/travar', { method: 'POST', body: { ano: 2026, mes: 10, tipo: 'B', snapshot: { ...snapshotLiberacao, liberacoes: [] } }, expected: 400 });
    await request('/ciclos-financeiros/travar', { method: 'POST', body: { ano: 2026, mes: 10, tipo: 'B', snapshot: snapshotLiberacao }, expected: 201 });
    console.log('PASS snapshot valida liberacao de obrigacao');

    // Backup automatico inclui as tabelas financeiras e grava so na pasta temporaria.
    const pastaBackup = fs.mkdtempSync(path.join(os.tmpdir(), 'hdl-backup-teste-'));
    try {
      const backup = spawnSync(process.execPath, ['-e', `
        require('./src/services/automaticBackupService').generateAutomaticBackup()
          .then((r) => { console.log(JSON.stringify(r)); process.exit(0); })
          .catch((e) => { console.error(e); process.exit(1); });
      `], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: source.href, BACKUP_AUTOMATIC_ROOT_DIR: pastaBackup },
        encoding: 'utf8',
      });
      assert.equal(backup.status, 0, backup.stderr);
      const gerado = JSON.parse(backup.stdout.trim().split('\n').pop());
      assert.ok(gerado.arquivo.caminho.startsWith(pastaBackup));
      const tabelas = await db.query(`
        SELECT t.tabela, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I', t.tabela), false, true, '')))[1]::text::int AS total
        FROM unnest(ARRAY['custos_operacionais_evento','custos_operacionais_historico','custos_operacionais_movimentos',
          'escala_pagamento_historico','ciclos_financeiros_historico','pagamentos_escala_colaborador']) AS t(tabela)
      `);
      const zip = fs.readFileSync(gerado.arquivo.caminho).toString('latin1');
      for (const { tabela, total } of tabelas.rows) {
        assert.ok(total > 0, tabela);
        assert.equal(gerado.contagens[`financeiro_${tabela}.json`], total, tabela);
        assert.ok(zip.includes(`financeiro_${tabela}.json`), tabela);
      }
    } finally {
      fs.rmSync(pastaBackup, { recursive: true, force: true });
    }
    console.log('PASS backup automatico inclui todas as tabelas financeiras novas, com contagens corretas');

    // Sem sessao, nenhuma rota de escrita do codigo passa; so /auth continua aberto.
    const pastaSrc = path.join(__dirname, '../src');
    const fontes = [path.join(pastaSrc, 'index.js'), ...fs.readdirSync(path.join(pastaSrc, 'routes')).map((nome) => path.join(pastaSrc, 'routes', nome))];
    const rotasEscrita = new Set();
    for (const fonte of fontes) {
      for (const [, metodo, rota] of fs.readFileSync(fonte, 'utf8').matchAll(/(?:app|router)\.(post|put|patch|delete)\(\s*'([^']+)'/g)) {
        rotasEscrita.add(`${metodo.toUpperCase()} ${rota}`);
      }
    }
    assert.ok(rotasEscrita.size >= 80, `rotas encontradas: ${rotasEscrita.size}`);
    const antesAnonimo = await fotografia();
    const semLogin = async (metodo, rota, cabecalhos = {}) => (await fetch(`${base}${rota.replace(/:[A-Za-z]+/g, 'fin-novo')}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...cabecalhos },
      body: JSON.stringify({ observacoes: 'anonimo', valor_total: 1 }),
    })).status;
    for (const item of rotasEscrita) {
      const [metodo, rota] = item.split(' ');
      if (rota.startsWith('/auth/')) continue;
      assert.equal(await semLogin(metodo, rota), 401, item);
    }
    assert.equal(await semLogin('PUT', '/eventos/fin-novo', { Cookie: 'hdl_session=token-invalido' }), 401);
    assert.equal(await fotografia(), antesAnonimo);
    const loginErrado = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fin-test@example.invalid', senha: 'senha-errada' }),
    });
    assert.notEqual((await loginErrado.json()).message, undefined);
    const esqueci = await fetch(`${base}/auth/forgot-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nao-existe@example.invalid' }),
    });
    assert.equal(esqueci.status, 200);
    assert.equal(await statusCom(cookie, '/eventos/fin-novo', 'PUT', { observacoes: 'gestor apos protecao' }), 200);
    console.log(`PASS sem sessao: ${rotasEscrita.size} rotas de escrita auditadas, 401 fora de /auth, dados intactos`);

    // Leitura: toda GET do codigo exige sessao, exceto a allowlist explicita abaixo.
    const rotasLeitura = new Set();
    for (const fonte of fontes) {
      for (const [, rota] of fs.readFileSync(fonte, 'utf8').matchAll(/(?:app|router)\.get\(\s*'([^']+)'/g)) rotasLeitura.add(rota);
    }
    assert.ok(rotasLeitura.size >= 40, `rotas GET encontradas: ${rotasLeitura.size}`);
    const publicasGet = { '/': 200, '/auth/reset-password/:token': 400 };
    const urlDe = (rota) => `${base}${rota.replace(/:[A-Za-z]+/g, 'fin-novo')}`;
    for (const rota of rotasLeitura) {
      const esperado = publicasGet[rota] ?? 401;
      assert.equal((await fetch(urlDe(rota))).status, esperado, `sem sessao GET ${rota}`);
      assert.equal((await fetch(urlDe(rota), { headers: { Cookie: 'hdl_session=token-invalido' } })).status, esperado, `token invalido GET ${rota}`);
    }
    assert.deepEqual(Object.keys(await (await fetch(`${base}/`)).json()).sort(), ['mensagem', 'ok']);
    assert.equal((await fetch(`${base}/eventos`, { method: 'HEAD' })).status, 401);
    assert.equal((await fetch(`${base}/EVENTOS`)).status, 401);
    assert.equal((await fetch(`${base}/rota-inexistente`)).status, 401);
    assert.equal((await fetch(`${base}/auth/nova-rota-futura`)).status, 401);
    for (const [id, nome] of [['noel', 'Papai Noel'], ['duende', 'Papai Noel com Duende'], ['visita', 'Visita Noite de Natal']]) {
      await db.query('INSERT INTO servicos(id,nome_servico) VALUES($1,$2)', [id, nome]);
    }
    for (const migration of ['001_noite_natal.sql', '002_funcoes_equipe.sql']) {
      await db.query(fs.readFileSync(path.join(__dirname, '../db/migrations', migration), 'utf8'));
    }
    const matriz = { gestor: {}, leitura: {}, operador: {} };
    for (const rota of rotasLeitura) {
      if (rota in publicasGet) continue;
      for (const [nome, sessao] of [['gestor', cookie], ['leitura', leitura], ['operador', operador]]) {
        const status = await statusCom(sessao, rota.replace(/:[A-Za-z]+/g, 'fin-novo'));
        matriz[nome][rota] = status;
        assert.ok(status !== 401 && status < 500, `${nome} GET ${rota}: ${status}`);
      }
      assert.notEqual(matriz.gestor[rota], 403, `gestor GET ${rota}`);
    }
    for (const rota of ['/eventos', '/contracts', '/colaboradores', '/escalas-evento', '/ciclos-financeiros', '/cofrinhos-config', '/custos-operacionais']) {
      assert.equal(matriz.gestor[rota], 200, `gestor ${rota}`);
      assert.equal(matriz.leitura[rota], 200, `leitura ${rota}`);
    }
    for (const rota of ['/admin/usuarios', '/textos-rapidos-contrato', '/funcoes-equipe/admin']) assert.equal(matriz.leitura[rota], 403, `leitura ${rota}`);
    for (const rota of ['/ciclos-financeiros', '/cofrinhos-config', '/custos-operacionais', '/admin/usuarios']) assert.equal(matriz.operador[rota], 403, `operador ${rota}`);
    const bloqueadas = (nome) => Object.entries(matriz[nome]).filter(([, status]) => status === 403).map(([rota]) => rota);
    console.log(`AUDITORIA GET: ${rotasLeitura.size} rotas; ${rotasLeitura.size - Object.keys(publicasGet).length} exigem sessao; publicas: ${Object.keys(publicasGet).join(', ')}`);
    console.log(`AUDITORIA GET 403 leitura: ${bloqueadas('leitura').join(', ')}`);
    console.log(`AUDITORIA GET 403 operador: ${bloqueadas('operador').join(', ')}`);
    console.log('PASS leitura: 401 sem sessao e com token invalido, allowlist exata, 200/403 por perfil');

    // Lote com pagamento parcial: a pendencia e o movimento mostram somente o restante.
    await db.query(`
      INSERT INTO colaboradores(id,nome_colaborador) VALUES ('fin-modal-l','Lote parcial'),('fin-modal','Pessoa Modal');
      INSERT INTO eventos (id,identificador_interno,contratante_nome,data_evento,valor_total,status_financeiro)
      VALUES ('fin-modal-ev','ID 410','Lote parcial','01/10/2026',500,'Em andamento'),
             ('fin-modal','ID 411','Modal parcial','01/10/2026',500,'Em andamento');
      INSERT INTO escala_eventos(id,evento_id,colaborador_id,colaborador_nome,valor_recreador,status_pagamento,status_aceite,valor_pago_sem_data)
      VALUES ('fin-modal-a','fin-modal-ev','fin-modal-l','Lote parcial',200,'Pendente','Confirmado',0),
             ('fin-modal-b','fin-modal-ev','fin-modal-l','Lote parcial',300,'Pendente','Confirmado',100),
             ('fin-modal-esc','fin-modal','fin-modal','Pessoa Modal',200,'Pendente','Confirmado',0);
      INSERT INTO pagamentos_escala_colaborador (id,escala_evento_id,evento_id,colaborador_id,valor,data_pagamento,status)
      VALUES ('fin-modal-a1','fin-modal-a','fin-modal-ev','fin-modal-l',50,'2026-10-01','ativo'),
             ('fin-modal-a2','fin-modal-a','fin-modal-ev','fin-modal-l',10,'2026-10-02','cancelado'),
             ('fin-modal-b1','fin-modal-b','fin-modal-ev','fin-modal-l',50,'2026-10-01','ativo'),
             ('fin-modal-p','fin-modal-esc','fin-modal','fin-modal',50,'2026-10-01','ativo');
    `);
    const parciais = await request('/colaboradores/fin-modal-l/pagamentos-pendentes');
    const porEscala = Object.fromEntries(parciais.map((row) => [row.escala_evento_id, [Number(row.valor_recreador), Number(row.valor_ja_pago), Number(row.valor_restante)]]));
    assert.deepEqual(porEscala, { 'fin-modal-a': [200, 50, 150], 'fin-modal-b': [300, 150, 150] });
    await request('/escalas-evento/pagamento-lote', { method: 'PATCH', body: { colaborador_id: 'fin-modal-l', escala_evento_ids: ['fin-modal-a', 'fin-modal-b'] } });
    const movimentosParciais = await db.query("SELECT escala_evento_id,valor FROM pagamentos_escala_colaborador WHERE evento_id='fin-modal-ev' AND origem='lote' ORDER BY escala_evento_id");
    assert.deepEqual(movimentosParciais.rows.map((row) => [row.escala_evento_id, Number(row.valor)]), [['fin-modal-a', 150], ['fin-modal-b', 150]]);
    assert.deepEqual(await request('/colaboradores/fin-modal-l/pagamentos-pendentes'), []);
    console.log('PASS lote parcial: escala 200 com 50 pago mostra e registra 150; cancelado nao conta');

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
