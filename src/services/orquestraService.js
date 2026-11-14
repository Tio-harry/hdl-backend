const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function civilDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value) || value.startsWith('0000')) return null;
  const date = new Date(value + 'T00:00:00Z');
  // UTC is used only to validate the calendar; no time zone conversion is applied.
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function horaCivil(value) {
  const match = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(value?.trim());
  if (!match || Number(match[1]) > 23) return null;
  return match[1].padStart(2, '0') + ':' + match[2] + ':' + (match[3] ?? '00');
}

function regiao(row) {
  return row.regiao_id === null ? null : { id: row.regiao_id, nome: row.regiao_nome };
}

function recreador(row) {
  return { id: row.id, nome: row.nome, regiao: regiao(row), ativo: row.ativo };
}

function evento(row) {
  return {
    id: row.id,
    identificador: row.identificador,
    data: civilDate(row.data_civil),
    hora_inicio: horaCivil(row.hora_inicio),
    hora_fim: horaCivil(row.hora_fim),
    cidade: row.cidade,
    status_aceite_praca: row.status_aceite_praca,
    qtd_recreadores: row.qtd_recreadores,
    qtd_escalados: Number(row.qtd_escalados),
    servico: row.servico,
  };
}

const RECREADORES = `
  SELECT c.id, c.nome_colaborador AS nome, c.ativo,
         r.id AS regiao_id, r.nome_regiao AS regiao_nome
  FROM colaboradores c
  LEFT JOIN colaborador_perfil_equipe p ON p.colaborador_id = c.id
  LEFT JOIN regions r ON r.id = p.region_id`;

async function listRecreadores(pool, regiaoId, ativo) {
  const { rows } = await pool.query(`
    ${RECREADORES}
    WHERE ($1::text IS NULL OR r.id = $1) AND ($2::boolean IS NULL OR c.ativo = $2)
    ORDER BY c.nome_colaborador, c.id
  `, [regiaoId, ativo]);
  return rows.map(recreador);
}

async function getRecreador(pool, id) {
  const { rows } = await pool.query(`${RECREADORES} WHERE c.id = $1`, [id]);
  return rows.length ? recreador(rows[0]) : null;
}

// Agenda dates are stored as text. Compare ISO civil days without a timestamp
// cast so malformed legacy rows cannot break a range query.
const EVENTOS = `
  SELECT e.id, NULLIF(BTRIM(e.identificador_interno), '') AS identificador,
         e.hora_inicio, e.hora_fim, NULLIF(BTRIM(e.cidade), '') AS cidade,
         NULLIF(BTRIM(e.status_aceite_praca), '') AS status_aceite_praca,
         e.qtd_recreadores, s.nome_servico AS servico,
         (SELECT COUNT(*) FROM escala_eventos ee WHERE ee.evento_id = e.id) AS qtd_escalados,
         CASE
           WHEN BTRIM(e.data_evento) ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
             THEN SUBSTR(BTRIM(e.data_evento), 7, 4) || '-' ||
                  SUBSTR(BTRIM(e.data_evento), 4, 2) || '-' ||
                  SUBSTR(BTRIM(e.data_evento), 1, 2)
           WHEN BTRIM(e.data_evento) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
             THEN BTRIM(e.data_evento)
         END AS data_civil
  FROM eventos e
  LEFT JOIN servicos s ON s.id = e.servico_principal_id`;

async function listEventos(pool, inicio, fim, status) {
  const { rows } = await pool.query(`
    SELECT * FROM (${EVENTOS}) agenda
    WHERE data_civil BETWEEN $1 AND $2
      AND ($3::text IS NULL OR status_aceite_praca = $3)
    ORDER BY data_civil, id
  `, [inicio, fim, status]);
  return rows.map(evento).filter((item) => item.data !== null);
}

async function getEvento(pool, id) {
  const { rows } = await pool.query(`${EVENTOS} WHERE e.id = $1`, [id]);
  return rows.length ? evento(rows[0]) : null;
}

async function getEquipe(pool, id) {
  const { rows } = await pool.query(`
    SELECT ee.colaborador_id AS recreador_id, COALESCE(c.nome_colaborador, ee.colaborador_nome) AS nome,
           r.id AS regiao_id, r.nome_regiao AS regiao_nome,
           NULLIF(BTRIM(ee.funcao), '') AS funcao, NULLIF(BTRIM(ee.status_aceite), '') AS status_aceite
    FROM eventos e
    LEFT JOIN escala_eventos ee ON ee.evento_id = e.id
    LEFT JOIN colaboradores c ON c.id = ee.colaborador_id
    LEFT JOIN colaborador_perfil_equipe p ON p.colaborador_id = c.id
    LEFT JOIN regions r ON r.id = p.region_id
    WHERE e.id = $1
    ORDER BY ee.created_at, ee.id
  `, [id]);
  if (!rows.length) return null;
  return rows.filter((row) => row.recreador_id !== null).map((row) => ({
    recreador_id: row.recreador_id,
    nome: row.nome,
    regiao: regiao(row),
    funcao: row.funcao,
    status_aceite: row.status_aceite,
  }));
}

module.exports = { civilDate, listRecreadores, getRecreador, listEventos, getEvento, getEquipe };
