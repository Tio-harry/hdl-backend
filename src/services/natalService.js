const crypto = require('node:crypto');

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.statusCode = status;
  throw error;
}
function dateParts(value) {
  const text = String(value || '').trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(text);
  if (match) return { year: +match[1], month: +match[2], day: +match[3] };
  match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  return match ? { year: +match[3], month: +match[2], day: +match[1] } : null;
}
function eligible(event, year) {
  const date = dateParts(event.data_evento);
  return date?.year === year && date.month === 12 && date.day === 24
    && event.codigos_operacionais?.includes('natal_noite_visita');
}
function normalizeName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}
async function resolvePrincipal(client, text, explicit) {
  if (explicit === null || explicit === '') return null;
  if (explicit !== undefined) {
    const { rows } = await client.query('SELECT id FROM servicos WHERE id=$1', [explicit]);
    if (!rows.length) fail('Servico principal inexistente.');
    return rows[0].id;
  }
  const { rows } = await client.query('SELECT id,nome_servico FROM servicos WHERE ativo=true');
  const matches = rows.filter((item) => normalizeName(item.nome_servico) === normalizeName(text));
  return matches.length === 1 ? matches[0].id : null;
}
const EVENT_CODES = `SELECT e.*,
  (SELECT count(*)::integer FROM escala_eventos es WHERE es.evento_id=e.id) AS qtd_escalas,
  (SELECT count(*)::integer FROM escala_eventos es WHERE es.evento_id=e.id AND lower(trim(coalesce(es.status_pagamento,'')))='pago') AS qtd_escalas_pagas,
  (SELECT count(*)::integer FROM escala_eventos es WHERE es.evento_id=e.id AND lower(trim(coalesce(es.status_pagamento,'')))<>'pago') AS qtd_escalas_pendentes,
  (SELECT coalesce(sum(es.valor_recreador),0) FROM escala_eventos es WHERE es.evento_id=e.id) AS soma_valor_recreador,
  ARRAY(SELECT DISTINCT s.codigo_operacional FROM servicos s WHERE s.codigo_operacional IS NOT NULL
    AND (s.id=e.servico_principal_id OR s.id IN
      (SELECT se.servico_id FROM servico_eventos se WHERE se.evento_id=e.id))) AS codigos_operacionais
  FROM eventos e`;

async function readOperation(client, year) {
  const { rows: [stored] } = await client.query('SELECT * FROM natal_operacoes WHERE ano=$1', [year]);
  const operation = stored || { ano: year, versao: 0, margem_minutos: 10, observacao: '' };
  const { rows: events } = await client.query(EVENT_CODES);
  const selected = events.filter((event) => eligible(event, year));
  const { rows: routes } = stored
    ? await client.query('SELECT * FROM natal_rotas WHERE operacao_id=$1 ORDER BY ordem,id', [stored.id]) : { rows: [] };
  const { rows: visits } = stored
    ? await client.query('SELECT * FROM natal_visitas WHERE operacao_id=$1 ORDER BY posicao,evento_id', [stored.id]) : { rows: [] };
  const relevant = events.filter((event) => {
    const date = dateParts(event.data_evento);
    return date?.year === year && date.month === 12 && date.day === 24;
  });
  const { rows: scales } = await client.query('SELECT * FROM escala_eventos WHERE evento_id=ANY($1::text[])', [relevant.map((e) => e.id)]);
  const review = events.filter((event) => {
    const date = dateParts(event.data_evento);
    return date?.year === year && date.month === 12 && date.day === 24 && !eligible(event, year);
  });
  return { operacao: operation, rotas: routes, visitas: visits, eventos: selected,
    escalas: scales, eventos_conflito: relevant.map(({ id, data_evento, hora_inicio, hora_fim }) => ({ id, data_evento, hora_inicio, hora_fim })), revisao: review };
}
function minutes(value, optional = false) {
  if (optional && (value === null || value === undefined || value === '')) return null;
  if (!Number.isInteger(value) || value < 0 || value > 1440) fail('Minutos invalidos.');
  return value;
}
function predecessors(visits) {
  const result = new Map();
  for (const route of new Set(visits.map((v) => v.rota_id))) {
    const items = visits.filter((v) => v.rota_id === route).sort((a, b) => a.posicao - b.posicao);
    items.forEach((v, i) => result.set(v.evento_id, route ? `${route}:${items[i - 1]?.evento_id || ''}` : null));
  }
  return result;
}
async function saveOperation(pool, year, body) {
  if (!body || !Array.isArray(body.rotas) || !Array.isArray(body.visitas) || !Number.isInteger(body.versao)
    || body.rotas.some((r) => !r || typeof r !== 'object') || body.visitas.some((v) => !v || typeof v !== 'object')) fail('Operacao invalida.');
  if (body.rotas.length > 500 || body.visitas.length > 10000) fail('Operacao excede limite seguro.');
  const routes = body.rotas.map((r, i) => ({
    id: String(r.id || ''), nome: String(r.nome || '').trim(), ordem: i,
  }));
  if (routes.some((r) => !/^[a-zA-Z0-9-]{1,80}$/.test(r.id) || !r.nome || r.nome.length > 100)
    || new Set(routes.map((r) => r.id)).size !== routes.length) fail('Rotas invalidas ou duplicadas.');
  const routeIds = new Set(routes.map((r) => r.id));
  const visits = body.visitas.map((v) => ({
    evento_id: String(v.evento_id || ''), rota_id: v.rota_id || null, posicao: v.posicao,
    observacao: String(v.observacao || '').slice(0, 4000),
    deslocamento_minutos: minutes(v.deslocamento_minutos, true), margem_minutos: minutes(v.margem_minutos, true),
  }));
  if (new Set(visits.map((v) => v.evento_id)).size !== visits.length
    || visits.some((v) => (v.rota_id && !routeIds.has(v.rota_id)) || !Number.isInteger(v.posicao) || v.posicao < 0)
    || new Set(visits.map((v) => `${v.rota_id}:${v.posicao}`)).size !== visits.length) fail('Visitas duplicadas ou posicoes invalidas.');
  const margin = minutes(body.margem_minutos);
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('hdl_natal_' || $1::text))", [year]);
    await client.query('INSERT INTO natal_operacoes(id,ano) VALUES($1,$2) ON CONFLICT(ano) DO NOTHING', [crypto.randomUUID(), year]);
    const { rows: [operation] } = await client.query('SELECT * FROM natal_operacoes WHERE ano=$1 FOR UPDATE', [year]);
    if (operation.versao !== body.versao) fail('Outra pessoa alterou esta operacao. Atualize antes de continuar.', 409);
    const { rows: events } = await client.query(EVENT_CODES);
    const ids = new Set(events.filter((e) => eligible(e, year)).map((e) => e.id));
    if (visits.some((v) => !ids.has(v.evento_id))) fail('Uma visita deixou de ser elegivel. Atualize a operacao.', 409);
    const { rows: old } = await client.query('SELECT * FROM natal_visitas WHERE operacao_id=$1', [operation.id]);
    if (old.some((v) => !ids.has(v.evento_id)) && body.remover_inelegiveis !== true) {
      fail('Existem alocacoes inelegiveis. Revise e confirme a remocao dessas alocacoes.', 409);
    }
    if (old.some((v) => ids.has(v.evento_id) && !visits.some((next) => next.evento_id === v.evento_id))) {
      fail('Nao remova visitas elegiveis: mova-as para nao alocadas.');
    }
    const before = predecessors(old);
    const after = predecessors(visits);
    // A travel estimate belongs to a specific edge, never to the destination alone.
    for (const visit of visits) {
      if (!visit.rota_id || after.get(visit.evento_id)?.endsWith(':') || before.get(visit.evento_id) !== after.get(visit.evento_id)) visit.deslocamento_minutos = null;
    }
    await client.query('DELETE FROM natal_visitas WHERE operacao_id=$1', [operation.id]);
    await client.query('DELETE FROM natal_rotas WHERE operacao_id=$1', [operation.id]);
    for (const route of routes) {
      await client.query('INSERT INTO natal_rotas(id,operacao_id,nome,ordem) VALUES($1,$2,$3,$4)',
        [route.id, operation.id, route.nome, route.ordem]);
    }
    for (const visit of visits) {
      await client.query(`INSERT INTO natal_visitas(evento_id,operacao_id,rota_id,posicao,observacao,deslocamento_minutos,margem_minutos)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [visit.evento_id, operation.id, visit.rota_id, visit.posicao, visit.observacao, visit.deslocamento_minutos, visit.margem_minutos]);
    }
    await client.query('UPDATE natal_operacoes SET margem_minutos=$1,observacao=$2,versao=versao+1,updated_at=now() WHERE id=$3',
      [margin, String(body.observacao || '').slice(0, 4000), operation.id]);
    const result = await readOperation(client, year);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '40001' || error.code === '23505') fail('A operacao mudou em outra sessao. Atualize antes de continuar.', 409);
    throw error;
  } finally { client.release(); }
}
module.exports = { dateParts, eligible, normalizeName, resolvePrincipal, EVENT_CODES, readOperation, saveOperation, predecessors };
