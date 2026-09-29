const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseContractText } = require('../src/services/contractTextParser');
const { organizeContractTextWithAI } = require('../src/services/aiContractOrganizerService');

const realText = `Dados:
• Nome completo do contratante: Conceição de Moura Diniz Teixeira
• Contato da Contratante: 81 98151-5374
• Endereço da festa: Av. Conselho Aguiar, 196 - Pina
• Data da festa: 08/10/2026
• Horário que inicia: 15hrs
• Quantidade de crianças e faixa etária: 14
Até 12 anos
• Espaço da recreação: Auditório
• Qual o serviço contratado: 01 Recreador com brincadeiras, pintura na pele e parabéns animado R$ 300,00
Escultura em balões R$ 45,00`;

const formats = [
  ['15hrs', '15:00'], ['15hr', '15:00'], ['15h', '15:00'], ['15 horas', '15:00'],
  ['15:00', '15:00'], ['15h00', '15:00'], ['15h30', '15:30'], ['15:30', '15:30'],
  ['08hrs', '08:00'], ['8hrs', '08:00'], ['8hr', '08:00'], ['8h', '08:00'],
  ['8 horas', '08:00'], ['08:00', '08:00'], ['8:00', '08:00'], ['8h30', '08:30'], ['08h30', '08:30'],
];
const labels = ['Horário que inicia', 'Horario que inicia', 'Horário de início', 'Horario de inicio',
  'Horário inicial', 'Horario inicial', 'Hora que inicia', 'Hora de início', 'Início', 'Inicio', 'HORA  DE  INÍCIO'];

for (const [token, expected] of formats) {
  test(`recognizes ${token} with every start label, without leaking into the address`, () => {
    for (const label of labels) {
      const result = parseContractText(`Contratante: Maria Silva\nLocal: Rua das Flores, 12\n${label}: ${token}\nData: 08/10/2026\n01 Recreador R$ 300,00`).extracted;
      assert.equal(result.horario_inicio, expected, label);
      assert.doesNotMatch(result.local, /in[ií]cio|inicia|hrs|horas/i);
      assert.equal(result.nome_contratante, 'Maria Silva');
    }
  });
}

test('real Conceicao input preserves adjacent fields and existing end/arrival calculations', () => {
  const actual = parseContractText(realText).extracted;
  const knownFormat = parseContractText(realText.replace('15hrs', '15:00')).extracted;
  assert.deepEqual({ ...actual, texto_original: '' }, { ...knownFormat, texto_original: '' });
  assert.equal(actual.horario_inicio, '15:00');
  assert.equal(actual.horario_fim, '18:00');
  assert.equal(actual.horario_chegada, '14:40');
  assert.equal(actual.contato_contratante, '81 98151-5374');
  assert.equal(actual.data_evento, '08/10/2026');
  assert.match(actual.nome_contratante, /Conceição/i);
  assert.match(actual.local, /Conselho Aguiar/);
  assert.equal(actual.qtd_criancas, '14');
  assert.match(actual.espaco, /Auditório/i);
  assert.equal(actual.valor_total, 345);
});

test('preserves explicit end and recreation time instead of invitation', () => {
  const explicit = parseContractText(realText.replace('15hrs', 'das 13h às 17h')).extracted;
  assert.equal(explicit.horario_inicio, '13:00');
  assert.equal(explicit.horario_fim, '17:00');
  const invitation = parseContractText(realText.replace('Horário que inicia: 15hrs', '15:00 no convite - recreadores começam às 15h30')).extracted;
  assert.equal(invitation.horario_inicio, '15:30');
  assert.equal(invitation.horario_fim, '18:30');
});

test('does not extract hours from ordinary numeric fields or invalid minutes', () => {
  for (const value of ['Contato: 81 98151-5374', 'CPF: 123.456.789-00', 'CNPJ: 17.403.980/0001-76',
    'CEP: 50800-220', 'Data: 08/10/2026', 'Valor: R$ 300,00', 'Crianças: 14', 'Horário: 15h99',
    'Duração: 3 horas', '01 Recreador por 3hrs R$ 300,00', '3 horas de serviço']) {
    assert.equal(parseContractText(value).extracted.horario_inicio, 'Não informado', value);
  }
});

test('AI normalizes the requested formats using a mocked response, without external calls', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-not-a-real-key';
  try {
    for (const [token, expected] of formats) {
      global.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ output_text: JSON.stringify({
        dados: { ...parseContractText(realText).extracted, horario_inicio: token, horario_fim: '' },
        faltantes: [], incertos: [], alertas: [], confianca: 1,
      }) }) });
      const result = await organizeContractTextWithAI({ texto_bruto: realText.replace('15hrs', token) });
      assert.equal(result.dados.horario_inicio, expected, token);
    }
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
