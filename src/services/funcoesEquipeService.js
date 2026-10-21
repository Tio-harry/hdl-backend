const crypto = require('node:crypto');
function fail(message, status = 400) { const error = new Error(message); error.statusCode = status; throw error; }
function nomeValido(value) {
  if (typeof value !== 'string') fail('Informe o nome da funcao.');
  const nome = value.trim().replace(/\s+/g, ' ');
  if (!nome || nome.length > 120) fail('Nome deve ter entre 1 e 120 caracteres.');
  return nome;
}
async function validarFuncaoEscala(db, value, atual) {
  // An unchanged historical snapshot remains valid, including inactive/renamed roles.
  if (value === atual && atual != null) return atual;
  const nome = nomeValido(value);
  const { rows } = await db.query('SELECT nome FROM funcoes_equipe WHERE ativo=true AND nome_normalizado=lower($1)', [nome]);
  if (!rows.length) fail('Escolha uma funcao ativa no catalogo da equipe.');
  return rows[0].nome;
}
async function listarFuncoes(db, todas = false) {
  return (await db.query(`SELECT id,nome,ativo,ordem FROM funcoes_equipe ${todas ? '' : 'WHERE ativo=true'} ORDER BY ordem,nome,id`)).rows;
}
async function salvarFuncao(pool, id, body, ordenar = false) {
  body = body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('hdl_funcoes_equipe'))");
    if (ordenar) {
      const ids = body?.ids;
      const current = await listarFuncoes(client, true);
      if (!Array.isArray(ids) || ids.length !== current.length || new Set(ids).size !== ids.length || ids.some((v) => !current.some((r) => r.id === v))) fail('Atualize o catalogo antes de ordenar.', 409);
      for (const [i, key] of ids.entries()) await client.query('UPDATE funcoes_equipe SET ordem=$1,updated_at=now() WHERE id=$2', [i + 1, key]);
    } else if (id) {
      const { rows: [old] } = await client.query('SELECT * FROM funcoes_equipe WHERE id=$1 FOR UPDATE', [id]);
      if (!old) fail('Funcao nao encontrada.', 404);
      if (body.nome === undefined && body.ativo === undefined) fail('Nenhuma alteracao informada.');
      if (body.ativo !== undefined && typeof body.ativo !== 'boolean') fail('Status invalido.');
      await client.query('UPDATE funcoes_equipe SET nome=$1,ativo=$2,updated_at=now() WHERE id=$3', [body.nome === undefined ? old.nome : nomeValido(body.nome), body.ativo ?? old.ativo, id]);
    } else {
      await client.query('INSERT INTO funcoes_equipe(id,nome,ordem) SELECT $1,$2,coalesce(max(ordem),0)+1 FROM funcoes_equipe', [crypto.randomUUID(), nomeValido(body?.nome)]);
    }
    const result = await listarFuncoes(client, true);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') fail('Ja existe uma funcao com esse nome.', 409);
    throw error;
  } finally { client.release(); }
}
module.exports = { listarFuncoes, salvarFuncao, validarFuncaoEscala };
