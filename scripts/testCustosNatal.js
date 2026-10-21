const assert = require('node:assert/strict');

// Executed only inside testNoiteNatal's disposable PostgreSQL database.
module.exports = async function testCustosNatal({ db, request, base }) {
  const eventId = 'custo-historico-teste';
  await db.query("INSERT INTO eventos(id,contratante_nome,data_evento,servico_principal_id) VALUES($1,'Historico custo','24/12/2030','visita')", [eventId]);
  const escala = await request(`/eventos/${eventId}/escalas`, { colaborador_id: 'noel-test', funcao: 'Papai Noel', valor_recreador: 100 }, 'POST', 201);
  const original = (await db.query('SELECT * FROM escala_eventos WHERE id=$1', [escala.id])).rows[0];
  await db.query("INSERT INTO regions(id,nome_regiao,sigla_regiao) VALUES('custo-regiao','Regiao teste','CT')");
  await db.query("INSERT INTO valores_referencia_regiao(id,region_id,nome_servico_funcao,valor_referencia) VALUES('custo-ref','custo-regiao','Papai Noel',100)");
  await db.query("INSERT INTO parcerias_colaborador(id,colaborador_id,region_id,titulo_parceria,valor_referencia_especifico) VALUES('custo-parceria','noel-test','custo-regiao','Teste',100)");
  await db.query("UPDATE valores_referencia_regiao SET valor_referencia=900 WHERE id='custo-ref'");
  await db.query("UPDATE parcerias_colaborador SET valor_referencia_especifico=800 WHERE id='custo-parceria'");
  assert.deepEqual((await db.query('SELECT * FROM escala_eventos WHERE id=$1', [escala.id])).rows[0], original);
  const state = await request('/noite-de-natal/2030');
  assert.equal(Number(state.escalas.find((e) => e.id === escala.id).valor_recreador), 100);
  await request(`/escalas-evento/${escala.id}`, { valor_recreador: 150 });
  assert.equal(Number((await request('/noite-de-natal/2030')).escalas.find((e) => e.id === escala.id).valor_recreador), 150);
  const before = (await db.query('SELECT * FROM escala_eventos WHERE id=$1', [escala.id])).rows;
  const payments = (await db.query('SELECT * FROM pagamentos_escala_colaborador ORDER BY id')).rows;
  await request('/noite-de-natal/2030', { ...state.operacao, rotas: [{ id: 'custo-rota', nome: 'Teste custo' }], visitas: [{ evento_id: eventId, rota_id: 'custo-rota', posicao: 0 }] });
  assert.deepEqual((await db.query('SELECT * FROM escala_eventos WHERE id=$1', [escala.id])).rows, before);
  assert.deepEqual((await db.query('SELECT * FROM pagamentos_escala_colaborador ORDER BY id')).rows, payments);
  assert.equal(Number((await db.query('SELECT pagamento_colaborador FROM eventos WHERE id=$1', [eventId])).rows[0].pagamento_colaborador), 150);
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'role-test@example.invalid', senha: 'Teste-Natal-Local-2026' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const operator = await fetch(`${base}/noite-de-natal/2030`, { headers: { Cookie: cookie } });
  assert.equal(operator.status, 200);
  assert.equal(Number((await operator.json()).dados.escalas.find((e) => e.id === escala.id).valor_recreador), 150);
  assert.equal((await fetch(`${base}/noite-de-natal/2030`)).status, 401);
  console.log('PASS custo historico: referencias/parcerias nao reescrevem escala; Agenda reflete na consulta; rota nao altera pagamentos; gestor/operador leem; anonimo401');
};
