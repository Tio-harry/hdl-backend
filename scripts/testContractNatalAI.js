const assert = require('node:assert/strict');
const { organizeContractTextWithAI } = require('../src/services/aiContractOrganizerService');
// Deterministic regression of post-processing; qaContractNatal also calls the real API.
const originalFetch = global.fetch;
const originalKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = 'isolated-test';
async function main() {
  for (const [local, city, emptyItems] of [['Rua Teste, 10, Recife', 'Recife - PE', false], ['Rua Teste, Natal RN', 'Natal - RN', false], ['Rua Teste, Recife PE', 'Recife - PE', true]]) {
    global.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ output_text: JSON.stringify({
      dados: { nome_contratante: 'Nome: Cliente Teste Natal', local, data_evento: '24/12/2026', horario_inicio: '20:30', horario_fim: '23:30', servico_contratado: 'Visita Noite de Natal com Papai Noel', extras: 'Sem extras', valor_total: 470 },
      itens_discriminados: emptyItems ? [] : [{ descricao: 'Visita Noite de Natal com Papai Noel', valor: null }],
    }) }) });
    const result = await organizeContractTextWithAI({ texto_bruto: `Nome: Cliente Teste Natal\nLocal: ${local}\nData: 24/12/2026\nHorário: 20:30\nServiço: Visita Noite de Natal com Papai Noel\nValor: 470,00` });
    assert.equal(result.dados.nome_contratante, 'Cliente Teste Natal');
    assert.equal(result.dados.horario_fim, '20:50');
    assert.equal(result.dados.cidade_emissao, city);
    assert.equal(result.dados.valor_total, 470);
    assert.equal(result.itens_discriminados[0].valor, 470);
  }
  console.log('PASS pos-processamento IA: nome, horario, preco explicito e cidade do endereco (nao do servico)');
}
main().finally(() => { global.fetch = originalFetch; if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey; }).catch((error) => { console.error(error); process.exitCode = 1; });
