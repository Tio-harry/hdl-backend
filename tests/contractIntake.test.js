const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { parseContractText } = require('../src/services/contractTextParser');
const { organizeContractTextWithAI } = require('../src/services/aiContractOrganizerService');

function fixture(name) {
  return readFileSync(path.join(__dirname, 'contract-parser-cases', name, 'entrada.txt'), 'utf8').trim();
}

test('form variants preserve labels, names, addresses, times and money', () => {
  for (const [separator, bullet, colon, price, time] of [
    ['\r\n', '▪ ', ': ', 'R$500', '18:00'],
    ['\\\n', '◦ ', '\n', '500 reais', '18h'],
    ['\n', '', ' ', '500', '18h'],
    ['\n', '●\u00a0', ':\u202f', 'R$ 500', '18h'],
  ]) {
    const text = [
      'Dados para o contrato:',
      `${bullet}Nome completo do contratante${colon}Cliente Teste`,
      `${bullet}Local e ponto de referência${colon}Clube de Teste`,
      `${bullet}Data${colon}13/12`,
      `${bullet}Horário entrada do Papai Noel${colon}${time}`,
      `${bullet}Qual a opção contratada?${colon}Papai Noel ${price}`,
    ].join(separator);
    const fields = parseContractText(text).extracted;
    assert.equal(fields.nome_contratante, 'Cliente Teste');
    assert.equal(fields.local, 'Clube de Teste');
    assert.equal(fields.data_evento, `13/12/${new Date().getFullYear()}`);
    assert.equal(fields.horario_inicio, '18:00');
    assert.equal(fields.horario_fim, 'Não informado');
    assert.equal(fields.servico_contratado, 'Papai Noel');
    assert.equal(fields.extras, 'Sem extras');
    assert.equal(fields.valor_total, 500);
    assert.deepEqual(fields.itens_valores, [{ descricao: 'Papai Noel', valor: 500 }]);
  }
});

test('recognizes formatted, unformatted and labeled phones while preserving prices', () => {
  for (const phone of ['81 9 0000 0414', '(81) 90000-0414', '81900000414', '81 90000-0414']) {
    for (const prefix of ['', 'Contato ', 'Contato:\n']) {
      const text = fixture('ex12-casamento-contato-e-valores-compostos').replace('81 9 0000 0414', prefix + phone);
      const result = parseContractText(text).extracted;
      assert.equal(result.contato_contratante, phone);
      assert.equal(result.valor_total, 425);
    }
  }
});

test('ordinary plus expressions and unrelated digit strings are not charges or contact', () => {
  const result = parseContractText('Cliente Teste\n12345678900\nRua Teste, 20\n8 crianças + 2 adultos\nEquipe A 20 + Equipe B 30').extracted;
  assert.equal(result.contato_contratante, null);
  assert.equal(result.valor_total, 0);
  assert.deepEqual(result.itens_valores, []);
});

test('AI ignores unsupported end and removes intake labels from the model response', async (t) => {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'synthetic-test-key';
  t.after(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });
  const model = {
    dados: {
      nome_contratante: 'Dados para o contrato:',
      local: 'e ponto de referência: Clube de Golfe do Recife',
      horario_inicio: '18:00',
      horario_fim: '18:20',
      servico_contratado: 'Qual a opção contratada? Visita Noite de Natal com Papai Noel',
      extras: 'Qual a opção contratada? Papai Noel',
    },
    itens_discriminados: [{ descricao: 'Qual a opção contratada? Papai Noel', valor: 500 }],
  };
  t.mock.method(global, 'fetch', async () => ({
    ok: true,
    text: async () => JSON.stringify({ output_text: JSON.stringify(model) }),
  }));
  const text = fixture('ex11-papai-noel-rotulos-separados');
  for (const [extra, expectedEnd] of [['', ''], ['\nDuração: 40 minutos', '18:40'], ['\nHorário fim: 18:50', '18:50']]) {
    const result = await organizeContractTextWithAI({ texto_bruto: text + extra });
    assert.equal(result.dados.horario_fim, expectedEnd);
    assert.equal(result.dados.nome_contratante, 'Dalva cavalcanti de Santana lima');
    assert.equal(result.dados.local, 'Clube de Golfe do Recife');
    assert.equal(result.dados.servico_contratado, 'Papai Noel');
    assert.doesNotMatch(result.dados.extras, /opção contratada/i);
    assert.deepEqual(result.itens_discriminados, [{ descricao: 'Papai Noel', valor: 500 }]);
  }
});
