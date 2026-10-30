const crypto = require('node:crypto');

const FUSO_OPERACIONAL = 'America/Recife';
const ORIGENS_AUTOMATICAS = ['status_pago', 'lote'];

function hojeCivilRecife(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_OPERACIONAL,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

function escalaEstaPaga(status) {
  return String(status || '').trim().toLowerCase() === 'pago';
}

async function registrarHistorico(client, payload) {
  await client.query(
    `
    INSERT INTO escala_pagamento_historico (
      id, escala_evento_id, evento_id, acao, status_anterior, status_novo,
      pagamento_id, valor, data_pagamento, origem, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `,
    [
      crypto.randomUUID(), payload.escalaId, payload.eventoId, payload.acao,
      payload.statusAnterior, payload.statusNovo, payload.pagamentoId || null,
      payload.valor || 0, payload.dataPagamento || null, payload.origem, payload.createdBy || null,
    ]
  );
}

/** Registra somente o restante da escala; adiantamentos ativos nao sao pagos de novo. */
async function registrarQuitacaoEscala(client, escala, { dataPagamento, origem, createdBy, statusAnterior }) {
  const data = dataPagamento || hojeCivilRecife();
  const { rows: [ativos] } = await client.query(
    `
    SELECT COALESCE(SUM(valor),0) AS total
    FROM pagamentos_escala_colaborador
    WHERE escala_evento_id=$1 AND LOWER(TRIM(COALESCE(status,'')))='ativo'
    `,
    [escala.id]
  );
  const restante = Math.round((Number(escala.valor_recreador || 0) - Number(ativos.total || 0)) * 100) / 100;
  let pagamentoId = null;
  if (restante > 0) {
    pagamentoId = crypto.randomUUID();
    await client.query(
      `
      INSERT INTO pagamentos_escala_colaborador (
        id, escala_evento_id, evento_id, colaborador_id, tipo_pagamento,
        valor, data_pagamento, status, origem, created_by
      ) VALUES ($1,$2,$3,$4,'pagamento_final',$5,$6::date::timestamp,'ativo',$7,$8)
      `,
      [pagamentoId, escala.id, escala.evento_id, escala.colaborador_id, restante, data, origem, createdBy || null]
    );
  }
  await registrarHistorico(client, {
    escalaId: escala.id,
    eventoId: escala.evento_id,
    acao: 'QUITACAO',
    statusAnterior: statusAnterior ?? escala.status_pagamento,
    statusNovo: 'Pago',
    pagamentoId,
    valor: Math.max(restante, 0),
    dataPagamento: data,
    origem,
    createdBy,
  });
  return { pagamentoId, valor: Math.max(restante, 0), dataPagamento: data };
}

/** Reverte so o que a marcacao de Pago gerou; adiantamentos reais continuam ativos. */
async function reverterQuitacaoEscala(client, escala, { createdBy, statusAnterior }) {
  const { rows } = await client.query(
    `
    UPDATE pagamentos_escala_colaborador
    SET status='cancelado',cancelado_em=now(),cancelado_por=$2,updated_at=CURRENT_TIMESTAMP
    WHERE escala_evento_id=$1
      AND LOWER(TRIM(COALESCE(status,'')))='ativo'
      AND origem = ANY($3::text[])
    RETURNING id,valor
    `,
    [escala.id, createdBy || null, ORIGENS_AUTOMATICAS]
  );
  await registrarHistorico(client, {
    escalaId: escala.id,
    eventoId: escala.evento_id,
    acao: 'REVERSAO',
    statusAnterior: statusAnterior ?? escala.status_pagamento,
    statusNovo: 'Pendente',
    valor: rows.reduce((sum, row) => sum + Number(row.valor || 0), 0),
    origem: 'status_pendente',
    createdBy,
  });
  return rows;
}

module.exports = {
  ORIGENS_AUTOMATICAS,
  escalaEstaPaga,
  hojeCivilRecife,
  registrarHistorico,
  registrarQuitacaoEscala,
  reverterQuitacaoEscala,
};
