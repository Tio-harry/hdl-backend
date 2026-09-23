const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseContractText } = require('../src/services/contractTextParser');
const { normalizeContractContact } = require('../src/services/contractContact');
const { organizeContractTextWithAI } = require('../src/services/aiContractOrganizerService');

const base = 'Contratante: Maria Silva\nLocal: Rua das Flores, 12\nData: 12/09/2026\nHorario: 13h\n03 recreadores R$ 790,00';
const cases = [
  ['Contato', '81999999999'],
  ['Contato', '81 99999-9999'],
  ['Contato', '(81) 99999-9999'],
  ['Contato', '(83) 99999-9999'],
  ['Telefone', '+55 85 99999-9999'],
  ['Celular', '+55 87 99999-9999'],
  ['WhatsApp', '+1 305 555 1234'],
  ['Contato', '+351 912 345 678'],
];

for (const [label, phone] of cases) {
  test(`preserves labeled phone: ${phone}`, () => {
    const original = parseContractText(base).extracted;
    for (const text of [
      `${label} da contratante: ${phone}\n${base}`,
      base.replace('\nLocal:', `\n${label} da contratante: ${phone}\nLocal:`),
      `${base}\n${label.toUpperCase()}  DA CONTRATANTE:\n${phone}`,
    ]) {
      const actual = parseContractText(text).extracted;
      assert.equal(actual.contato_contratante, phone);
      assert.equal(actual.texto_original, text);
      for (const key of Object.keys(original).filter((k) => !['texto_original', 'contato_contratante'].includes(k))) {
        assert.deepEqual(actual[key], original[key], key);
      }
    }
  });
}

test('does not guess from company contact, documents, dates or money', () => {
  const noise = '\nCPF: 123.456.789-00\nCNPJ: 17.403.980/0001-76\nCEP: 50800-220\nContato Hora do Lazer: (81) 99761-7476\nValor total: R$ 790,00';
  assert.equal(parseContractText(base + noise).extracted.contato_contratante, null);
  assert.equal(parseContractText(base + noise + '\nContato da contratante: (83) 99999-9999').extracted.contato_contratante, '(83) 99999-9999');
});

test('normalizes absence and whitespace without destroying international format', () => {
  for (const value of [null, undefined, '', '   ', 'Não informado', 'Nao informado', '-']) {
    assert.equal(normalizeContractContact(value), null);
  }
  assert.equal(normalizeContractContact('  +351   912 345 678  '), '+351 912 345 678');
  assert.equal(normalizeContractContact(81999999999), '81999999999');
});

test('structured contract also preserves customer phone', () => {
  const text = 'CONTRATANTE: Maria Silva\nContato da Contratante: +1 305 555 1234\nDADOS DO EVENTO\nLocal: Rua das Flores, 12\nData: 12/09/2026\nHorario: 13:00\nDETALHES DO EVENTO\nServico: 03 recreadores\nVALORES\nValor total: R$ 790,00';
  const result = parseContractText(text).extracted;
  assert.equal(result.contato_contratante, '+1 305 555 1234');
  assert.equal(result.nome_contratante, 'Maria Silva');
});

test('AI output schema and guardrail preserve only the explicitly labeled source phone', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-not-a-real-key';
  global.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    if (request.text) {
      assert.ok(request.text.format.schema.properties.dados.required.includes('contato_contratante'));
    }
    const model = { dados: { ...parseContractText(base).extracted, contato_contratante: '(81) 99761-7476' }, faltantes: [], incertos: [], alertas: [], confianca: 1 };
    return { ok: true, text: async () => JSON.stringify({ output_text: JSON.stringify(model) }) };
  };
  try {
    for (const [label, phone] of cases) {
      const result = await organizeContractTextWithAI({ texto_bruto: `${base}\n${label} da contratante: ${phone}` });
      assert.equal(result.dados.contato_contratante, phone);
    }
    const absent = await organizeContractTextWithAI({ texto_bruto: `${base}\nContato Hora do Lazer: (81) 99761-7476` });
    assert.equal(absent.dados.contato_contratante, null);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
