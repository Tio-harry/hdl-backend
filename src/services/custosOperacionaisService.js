const crypto = require('node:crypto');

const TIPOS = new Set(['deslocamento', 'extras']);
const SITUACOES_EDITAVEIS = new Set(['PENDENTE', 'PARCIAL', 'PAGO']);

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeTipo(value) {
  const tipo = String(value || '').trim().toLowerCase();
  if (!TIPOS.has(tipo)) throw httpError('Tipo de custo operacional invalido');
  return tipo;
}

function normalizeMoney(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw httpError(`${label} invalido`);
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function normalizeCivilDate(value, { required = false } = {}) {
  if (value === null || value === undefined || String(value).trim() === '') {
    if (required) throw httpError('Data real da quitacao e obrigatoria');
    return null;
  }
  const text = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw httpError('Data de quitacao invalida; use YYYY-MM-DD');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw httpError('Data de quitacao invalida');
  }
  return text;
}

const CUSTO_COLUMNS = `id,evento_id,tipo,situacao,valor_quitado,to_char(data_quitacao,'YYYY-MM-DD') AS data_quitacao,
       origem,created_at,updated_at`;

function getActor(req) {
  return req?.auth?.usuario?.id != null ? String(req.auth.usuario.id) : null;
}

async function insertHistory(client, payload) {
  await client.query(
    `
    INSERT INTO custos_operacionais_historico (
      id, obrigacao_id, evento_id, tipo, acao,
      situacao_anterior, situacao_nova, valor_previsto_snapshot,
      valor_quitado_anterior, valor_quitado_novo,
      data_quitacao_anterior, data_quitacao_nova,
      observacao, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    `,
    [
      crypto.randomUUID(), payload.obrigacaoId, payload.eventoId, payload.tipo, payload.acao,
      payload.situacaoAnterior, payload.situacaoNova, payload.valorPrevisto,
      payload.valorQuitadoAnterior, payload.valorQuitadoNovo,
      payload.dataAnterior, payload.dataNova, payload.observacao || null, payload.createdBy || null,
    ]
  );
}

async function getOrCreateForUpdate(client, evento, tipo) {
  const existing = await client.query(
    `SELECT ${CUSTO_COLUMNS} FROM custos_operacionais_evento WHERE evento_id=$1 AND tipo=$2 FOR UPDATE`,
    [evento.id, tipo]
  );
  if (existing.rowCount) return existing.rows[0];

  const valor = normalizeMoney(evento[tipo] || 0, 'Valor previsto');
  const situacao = valor > 0 ? 'PENDENTE' : 'NAO_INFORMADO';
  const result = await client.query(
    `
    INSERT INTO custos_operacionais_evento
      (id, evento_id, tipo, situacao, valor_quitado, data_quitacao, origem)
    VALUES ($1,$2,$3,$4,0,NULL,'agenda')
    RETURNING ${CUSTO_COLUMNS}
    `,
    [crypto.randomUUID(), evento.id, tipo, situacao]
  );
  await insertHistory(client, {
    obrigacaoId: result.rows[0].id,
    eventoId: evento.id,
    tipo,
    acao: valor > 0 ? 'CADASTRO' : 'INICIALIZACAO',
    situacaoAnterior: null,
    situacaoNova: situacao,
    valorPrevisto: valor,
    valorQuitadoAnterior: 0,
    valorQuitadoNovo: 0,
    dataAnterior: null,
    dataNova: null,
  });
  return result.rows[0];
}

async function listCustosOperacionais(pool, eventoId = null) {
  const params = eventoId ? [eventoId] : [];
  const where = eventoId ? 'WHERE c.evento_id = $1' : '';
  const [custos, movimentos, pagamentosEquipe] = await Promise.all([
    pool.query(
      `
      SELECT c.id,c.evento_id,c.tipo,c.situacao,c.valor_quitado,
             to_char(c.data_quitacao,'YYYY-MM-DD') AS data_quitacao,
             c.origem,c.created_at,c.updated_at
      FROM custos_operacionais_evento c
      ${where}
      ORDER BY c.evento_id,c.tipo
      `,
      params
    ),
    pool.query(
      `
      SELECT m.id,m.obrigacao_id,m.evento_id,m.tipo,m.valor,
             to_char(m.data_quitacao,'YYYY-MM-DD') AS data_quitacao,m.created_at
      FROM custos_operacionais_movimentos m
      WHERE m.status='ativo' ${eventoId ? 'AND m.evento_id = $1' : ''}
      ORDER BY m.evento_id,m.data_quitacao,m.created_at
      `,
      params
    ),
    pool.query(
      `
      SELECT p.id,p.escala_evento_id,p.evento_id,p.tipo_pagamento,p.valor,
             to_char(p.data_pagamento,'YYYY-MM-DD') AS data_pagamento,p.status
      FROM pagamentos_escala_colaborador p
      WHERE LOWER(TRIM(COALESCE(p.status,'')))='ativo'
        ${eventoId ? 'AND p.evento_id = $1' : ''}
      ORDER BY p.evento_id,p.data_pagamento,p.created_at
      `,
      params
    ),
  ]);
  return { custos: custos.rows, movimentos: movimentos.rows, pagamentos_equipe: pagamentosEquipe.rows };
}

async function getCustosOperacionaisEvento(pool, eventoId) {
  const eventoResult = await pool.query(
    'SELECT id,deslocamento,extras FROM eventos WHERE id=$1',
    [eventoId]
  );
  if (!eventoResult.rowCount) throw httpError('Evento nao encontrado', 404);
  const evento = eventoResult.rows[0];
  const [current, history] = await Promise.all([
    listCustosOperacionais(pool, eventoId),
    pool.query(
      `
      SELECT id,obrigacao_id,evento_id,tipo,acao,situacao_anterior,situacao_nova,
             valor_previsto_snapshot,valor_quitado_anterior,valor_quitado_novo,
             to_char(data_quitacao_anterior,'YYYY-MM-DD') AS data_quitacao_anterior,
             to_char(data_quitacao_nova,'YYYY-MM-DD') AS data_quitacao_nova,
             observacao,created_by,created_at
      FROM custos_operacionais_historico
      WHERE evento_id=$1
      ORDER BY created_at DESC,id DESC
      `,
      [eventoId]
    ),
  ]);
  const byType = new Map(current.custos.map((row) => [row.tipo, row]));
  const itens = ['deslocamento', 'extras'].map((tipo) => ({
    ...(byType.get(tipo) || {
      id: null,
      evento_id: eventoId,
      tipo,
      situacao: 'NAO_INFORMADO',
      valor_quitado: 0,
      data_quitacao: null,
      origem: 'sem_registro',
    }),
    valor_previsto: Number(evento[tipo] || 0),
  }));
  return {
    evento_id: eventoId,
    itens,
    historico: history.rows,
    movimentos: current.movimentos,
    pagamentos_equipe: current.pagamentos_equipe,
  };
}

async function updateCustoOperacional(pool, req) {
  const eventoId = String(req.params.id || '').trim();
  const tipo = normalizeTipo(req.params.tipo);
  const situacaoNova = String(req.body?.situacao || '').trim().toUpperCase();
  if (!SITUACOES_EDITAVEIS.has(situacaoNova)) throw httpError('Situacao invalida');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const eventResult = await client.query(
      'SELECT id,deslocamento,extras FROM eventos WHERE id=$1 FOR UPDATE',
      [eventoId]
    );
    if (!eventResult.rowCount) throw httpError('Evento nao encontrado', 404);
    const evento = eventResult.rows[0];
    const valorPrevisto = normalizeMoney(evento[tipo] || 0, 'Valor previsto');
    const current = await getOrCreateForUpdate(client, evento, tipo);
    const anterior = String(current.situacao || 'NAO_INFORMADO').toUpperCase();
    const valorAnterior = Number(current.valor_quitado || 0);
    const dataAnterior = current.data_quitacao || null;

    let valorNovo = 0;
    let dataNova = null;
    let acao = 'REGULARIZACAO_PENDENTE';
    let situacaoFinal = situacaoNova;
    const actor = getActor(req);
    if (situacaoNova === 'PENDENTE') {
      if (['PAGO', 'PARCIAL'].includes(anterior) && req.body?.confirmacao_reversao !== true) {
        throw httpError('Reversao para Pendente exige confirmacao explicita', 409);
      }
      acao = ['PAGO', 'PARCIAL'].includes(anterior) ? 'REVERSAO_QUITACAO' : 'REGULARIZACAO_PENDENTE';
      await client.query(
        `
        UPDATE custos_operacionais_movimentos
        SET status='estornado',estornado_em=now(),estornado_por=$2
        WHERE obrigacao_id=$1 AND status='ativo'
        `,
        [current.id, actor]
      );
    } else {
      if (valorPrevisto <= 0) throw httpError('Informe um valor de custo maior que zero antes da quitacao');
      const dataNaoInformada = req.body?.data_nao_informada === true;
      if (dataNaoInformada && (anterior !== 'LEGADO' || situacaoNova !== 'PAGO')) {
        throw httpError('Data nao informada so pode ser usada para regularizar custo legado');
      }
      dataNova = normalizeCivilDate(req.body?.data_quitacao, { required: !dataNaoInformada });
      const restante = Math.round((valorPrevisto - valorAnterior) * 100) / 100;
      if (restante <= 0) throw httpError('Este custo ja esta integralmente quitado', 409);
      let valorMovimento = restante;
      if (situacaoNova === 'PAGO') {
        acao = anterior === 'LEGADO' ? 'REGULARIZACAO_PAGO' : 'QUITACAO';
      } else {
        if (req.body?.valor_quitado !== undefined) {
          throw httpError('Use valor_pagamento: o valor informado e somado ao que ja foi quitado');
        }
        valorMovimento = normalizeMoney(req.body?.valor_pagamento, 'Valor do pagamento');
        if (!(valorMovimento > 0) || valorMovimento > restante) {
          throw httpError('O pagamento parcial deve ser maior que zero e nao pode superar o saldo restante');
        }
        acao = 'QUITACAO_PARCIAL';
        if (valorMovimento === restante) situacaoFinal = 'PAGO';
      }
      valorNovo = Math.round((valorAnterior + valorMovimento) * 100) / 100;
      await client.query(
        `
        INSERT INTO custos_operacionais_movimentos
          (id,obrigacao_id,evento_id,tipo,valor,data_quitacao,observacao,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [crypto.randomUUID(), current.id, eventoId, tipo, valorMovimento, dataNova, req.body?.observacao || null, actor]
      );
    }

    const updated = await client.query(
      `
      UPDATE custos_operacionais_evento
      SET situacao=$1,valor_quitado=$2,
          data_quitacao=(SELECT MAX(m.data_quitacao) FROM custos_operacionais_movimentos m WHERE m.obrigacao_id=$3 AND m.status='ativo'),
          origem='agenda',updated_at=now()
      WHERE id=$3
      RETURNING ${CUSTO_COLUMNS}
      `,
      [situacaoFinal, valorNovo, current.id]
    );
    await insertHistory(client, {
      obrigacaoId: current.id,
      eventoId,
      tipo,
      acao,
      situacaoAnterior: anterior,
      situacaoNova: situacaoFinal,
      valorPrevisto,
      valorQuitadoAnterior: valorAnterior,
      valorQuitadoNovo: valorNovo,
      dataAnterior,
      dataNova: updated.rows[0].data_quitacao,
      observacao: req.body?.observacao,
      createdBy: actor,
    });
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function syncCustosOperacionaisFromEvento(client, before, after, createdBy = null) {
  for (const tipo of TIPOS) {
    const previousValue = normalizeMoney(before?.[tipo] || 0, 'Valor anterior');
    const nextValue = normalizeMoney(after?.[tipo] || 0, 'Valor atualizado');
    if (previousValue === nextValue) continue;

    const current = await getOrCreateForUpdate(client, before || after, tipo);
    const previousStatus = String(current.situacao || 'NAO_INFORMADO').toUpperCase();
    const paid = Number(current.valor_quitado || 0);
    if (nextValue < paid) {
      throw httpError(`O valor de ${tipo} nao pode ficar abaixo do total ja quitado; reverta a quitacao primeiro`, 409);
    }

    let nextStatus = previousStatus;
    let nextDate = current.data_quitacao || null;
    if (nextValue === 0) {
      nextStatus = 'NAO_INFORMADO';
      nextDate = null;
    } else if (['LEGADO', 'NAO_INFORMADO'].includes(previousStatus)) {
      nextStatus = 'PENDENTE';
      nextDate = null;
    } else if (paid > 0 && paid < nextValue) {
      nextStatus = 'PARCIAL';
    } else if (paid > 0 && paid === nextValue) {
      nextStatus = 'PAGO';
    }

    const updated = await client.query(
      `
      UPDATE custos_operacionais_evento
      SET situacao=$1,data_quitacao=$2,origem='agenda',updated_at=now()
      WHERE id=$3
      RETURNING ${CUSTO_COLUMNS}
      `,
      [nextStatus, nextDate, current.id]
    );
    await insertHistory(client, {
      obrigacaoId: current.id,
      eventoId: after.id,
      tipo,
      acao: 'VALOR_ATUALIZADO',
      situacaoAnterior: previousStatus,
      situacaoNova: nextStatus,
      valorPrevisto: nextValue,
      valorQuitadoAnterior: paid,
      valorQuitadoNovo: Number(updated.rows[0].valor_quitado || 0),
      dataAnterior: current.data_quitacao || null,
      dataNova: updated.rows[0].data_quitacao || null,
      createdBy,
    });
  }
}

module.exports = {
  getCustosOperacionaisEvento,
  listCustosOperacionais,
  normalizeCivilDate,
  syncCustosOperacionaisFromEvento,
  updateCustoOperacional,
};
