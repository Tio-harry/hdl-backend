const crypto = require('node:crypto');

const SNAPSHOT_VERSAO = 1;
const TOLERANCIA = 0.05;
const COFRINHO_COLUNAS = {
  gestor: 'cofrinho_gestor',
  expansao: 'cofrinho_expansao',
  reserva: 'cofrinho_reserva',
  custos_fixos: 'cofrinho_custos_fixos',
  estoque: 'cofrinho_estoque',
};

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function periodoDoCiclo(ano, mes, tipo) {
  const pad = (value) => String(value).padStart(2, '0');
  if (tipo === 'B') {
    return { inicio: `${ano}-${pad(mes)}-15`, fim: `${ano}-${pad(mes)}-28` };
  }
  const anoAnterior = mes === 1 ? ano - 1 : ano;
  const mesAnterior = mes === 1 ? 12 : mes - 1;
  return { inicio: `${anoAnterior}-${pad(mesAnterior)}-29`, fim: `${ano}-${pad(mes)}-14` };
}

function numero(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw httpError(`Snapshot invalido: ${label}`);
  return parsed;
}

function perto(a, b) {
  return Math.abs(a - b) <= TOLERANCIA;
}

function validarSnapshot(snapshot, { ano, mes, tipo }) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw httpError('Travamento exige o snapshot completo do ciclo');
  }
  if (snapshot.versao !== SNAPSHOT_VERSAO) throw httpError('Versao de snapshot nao suportada');
  if (snapshot.ciclo?.ano !== ano || snapshot.ciclo?.mes !== mes || snapshot.ciclo?.tipo !== tipo) {
    throw httpError('Snapshot nao corresponde ao ciclo informado');
  }
  const totais = snapshot.totais;
  if (!totais || !Array.isArray(snapshot.eventos) || !Array.isArray(snapshot.cofrinhos) || !Array.isArray(snapshot.custosQuitados)) {
    throw httpError('Snapshot incompleto');
  }
  const recebido = numero(totais.totalRecebido, 'total recebido');
  const retencao = numero(totais.retencaoTotal, 'retencao');
  const apropriado = numero(totais.custosApropriados, 'custo apropriado');
  const caixa = numero(totais.caixaLivre, 'caixa livre');
  const quitado = numero(totais.custosQuitadosNoPeriodo, 'custo quitado');
  const liberacoes = Array.isArray(snapshot.liberacoes) ? snapshot.liberacoes : [];
  const liberado = numero(totais.liberacoesObrigacao ?? 0, 'liberacao de obrigacao');
  if (!perto(liberacoes.reduce((sum, row) => sum + Number(row.valor || 0), 0), liberado)) {
    throw httpError('Snapshot incoerente: composicao das liberacoes difere do total');
  }
  if (!perto(recebido - retencao - apropriado + liberado, caixa)) {
    throw httpError('Snapshot incoerente: recebido, retencao, custos e caixa livre nao fecham');
  }
  const somaEventos = snapshot.eventos.reduce((sum, row) => sum + Number(row.recebido || 0), 0);
  if (!perto(somaEventos, recebido) || snapshot.eventos.length !== totais.qtd) {
    throw httpError('Snapshot incoerente: composicao dos eventos difere do total');
  }
  const somaQuitados = snapshot.custosQuitados.reduce((sum, row) => sum + Number(row.valor || 0), 0);
  if (!perto(somaQuitados, quitado)) {
    throw httpError('Snapshot incoerente: composicao dos custos difere do custo quitado');
  }
  const somaPct = snapshot.cofrinhos.reduce((sum, row) => sum + Number(row.percentual || 0), 0);
  if (Math.abs(somaPct - 1) > 0.0001) throw httpError('Os percentuais dos cofrinhos devem somar 100%');
  const somaCofrinhos = snapshot.cofrinhos.reduce((sum, row) => sum + Number(row.valor || 0), 0);
  if (!perto(somaCofrinhos, caixa)) throw httpError('Os cofrinhos devem distribuir todo o caixa livre');
}

function actorDe(req) {
  return req?.auth?.usuario?.id != null ? String(req.auth.usuario.id) : null;
}

function identificarCiclo(body) {
  const ano = Number(body?.ano);
  const mes = Number(body?.mes);
  const tipo = String(body?.tipo || '').trim();
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12 || !['A', 'B'].includes(tipo)) {
    throw httpError('Ciclo invalido');
  }
  return { ano, mes, tipo };
}

async function registrarHistorico(client, ciclo, acao, { motivo = null, actor = null } = {}) {
  await client.query(
    `
    INSERT INTO ciclos_financeiros_historico (id,ciclo_id,ano,mes,tipo,acao,registro,motivo,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
    `,
    [crypto.randomUUID(), ciclo.id, ciclo.ano, ciclo.mes, ciclo.tipo, acao, JSON.stringify(ciclo), motivo, actor]
  );
}

async function travarCiclo(pool, req) {
  const { ano, mes, tipo } = identificarCiclo(req.body);
  const snapshot = req.body?.snapshot;
  validarSnapshot(snapshot, { ano, mes, tipo });
  const { inicio, fim } = periodoDoCiclo(ano, mes, tipo);
  const cofrinhos = Object.fromEntries(Object.values(COFRINHO_COLUNAS).map((coluna) => [coluna, 0]));
  for (const item of snapshot.cofrinhos) {
    const coluna = COFRINHO_COLUNAS[item.key];
    if (coluna) cofrinhos[coluna] = Number(item.valor || 0);
  }
  const actor = actorDe(req);
  const valores = [
    inicio, fim, snapshot.totais.totalRecebido, snapshot.totais.retencaoTotal, snapshot.totais.caixaLivre,
    snapshot.totais.custosQuitadosNoPeriodo, cofrinhos.cofrinho_gestor, cofrinhos.cofrinho_expansao,
    cofrinhos.cofrinho_reserva, cofrinhos.cofrinho_custos_fixos, cofrinhos.cofrinho_estoque,
    snapshot.totais.qtd, JSON.stringify(snapshot), SNAPSHOT_VERSAO, actor,
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`ciclo:${ano}:${mes}:${tipo}`]);
    const { rows: [existente] } = await client.query(
      'SELECT id,status FROM ciclos_financeiros WHERE ano=$1 AND mes=$2 AND tipo=$3 FOR UPDATE',
      [ano, mes, tipo]
    );
    if (existente?.status === 'travado') throw httpError('Este ciclo ja esta travado', 409);
    const { rows: [ciclo] } = existente
      ? await client.query(
        `
        UPDATE ciclos_financeiros
        SET status='travado',data_inicio=$1,data_fim=$2,total_recebido=$3,retencao_total=$4,caixa_livre=$5,
            custo_quitado=$6,cofrinho_gestor=$7,cofrinho_expansao=$8,cofrinho_reserva=$9,
            cofrinho_custos_fixos=$10,cofrinho_estoque=$11,qtd_eventos=$12,snapshot=$13::jsonb,
            snapshot_versao=$14,travado_por=$15,travado_em=now(),updated_at=CURRENT_TIMESTAMP
        WHERE id=$16
        RETURNING *
        `,
        [...valores, existente.id]
      )
      : await client.query(
        `
        INSERT INTO ciclos_financeiros (
          data_inicio,data_fim,total_recebido,retencao_total,caixa_livre,custo_quitado,
          cofrinho_gestor,cofrinho_expansao,cofrinho_reserva,cofrinho_custos_fixos,cofrinho_estoque,
          qtd_eventos,snapshot,snapshot_versao,travado_por,id,ano,mes,tipo,status,travado_em
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19,'travado',now())
        RETURNING *
        `,
        [...valores, crypto.randomUUID(), ano, mes, tipo]
      );
    await registrarHistorico(client, ciclo, 'TRAVAMENTO', { actor });
    await client.query('COMMIT');
    return ciclo;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function destravarCiclo(pool, req) {
  const motivo = String(req.body?.motivo || '').trim();
  if (!motivo) throw httpError('Informe o motivo para destravar o ciclo');
  const actor = actorDe(req);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [atual] } = await client.query('SELECT * FROM ciclos_financeiros WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!atual) throw httpError('Ciclo financeiro nao encontrado', 404);
    if (atual.status !== 'travado') throw httpError('Este ciclo nao esta travado', 409);
    await registrarHistorico(client, atual, 'DESTRAVAMENTO', { motivo, actor });
    const { rows: [ciclo] } = await client.query(
      `
      UPDATE ciclos_financeiros
      SET status='aberto',snapshot=NULL,snapshot_versao=NULL,travado_em=NULL,travado_por=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE id=$1
      RETURNING *
      `,
      [atual.id]
    );
    await client.query('COMMIT');
    return ciclo;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { SNAPSHOT_VERSAO, destravarCiclo, periodoDoCiclo, travarCiclo, validarSnapshot };
