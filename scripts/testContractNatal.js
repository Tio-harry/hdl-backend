const assert = require('node:assert/strict');
const { parseContractText } = require('../src/services/contractTextParser');
const { applyContractExtractionRules } = require('../src/services/contractExtractionRules');
const source = (name, service, hour = '20:30', extra = '') => `${name}\nEndereço: Rua Teste, 10, Recife\nData: 24/12/2026\nHorário: ${hour}\nServiço: ${service}\n${extra}\nValor: 470,00`;
for (const label of ['Nome:', 'Nome cliente:', 'Nome do cliente:', 'Cliente:', 'Contratante:', 'NOME :', 'nome :', 'Nome Cliente :']) {
  assert.equal(parseContractText(source(`  ${label} Maria da Silva`, 'Visita Noite de Natal')).extracted.nome_contratante, 'Maria da Silva');
}
assert.equal(parseContractText(source('João Nome da Silva', 'Recreação Infantil')).extracted.nome_contratante, 'João Nome da Silva');
for (const service of ['Visita Noite de Natal', 'Visita Noite de Natal com Papai Noel', 'Visita Noite de Natal Papai Noel e Duende', 'VISITA NOITE DE NATAL', 'Visita Noite-de-Natal']) {
  const fields = parseContractText(source('Nome: Maria', service)).extracted;
  assert.equal(fields.horario_fim, '20:50', service);
  assert.equal(fields.horario_chegada, '20:10');
}
for (const service of ['Papai Noel', 'Papai Noel com Duende', 'Chegada do Papai Noel', 'Recreação de Natal', 'Vídeo do Papai Noel', 'Recreação Infantil', 'Evento de Natal com Papai Noel']) {
  assert.equal(parseContractText(source('Nome: Maria', service)).extracted.horario_fim, '23:30', service);
}
for (const [hour, extra, end] of [['21:15', '', '21:35'], ['20:30 às 21:10', 'Duração: 40 minutos', '21:10'], ['20:30 às 21:00', 'Duração: 40 minutos', '21:00'], ['20:30', 'Duração 40 minutos', '21:10'], ['20:30', 'Duração: 1 hora', '21:30'], ['20:30', 'Horário fim: 21:10', '21:10'], ['23:50', '', '00:10']]) {
  assert.equal(parseContractText(source('Nome: Maria', 'Visita Noite de Natal', hour, extra)).extracted.horario_fim, end);
}
const ai = { nome_contratante: 'Nome cliente: Maria', servico_contratado: 'Visita Noite de Natal', horario_inicio: '20:30', horario_fim: '23:30', horario_chegada: '20:10' };
assert.equal(parseContractText('Nome: Maria\nVisita Noite de Natal\n20:30').extracted.horario_fim, '20:50');
assert.equal(parseContractText(source('Nome: Maria', 'Visita Noite de Natal', '20:30\u201321:10')).extracted.horario_fim, '21:10');
assert.equal(parseContractText(source('Nome: Maria', 'Recreação Infantil', '20:30', 'Tema: Visita Noite de Natal')).extracted.horario_fim, '23:30');
assert.equal(applyContractExtractionRules(ai, source('Nome: Maria', ai.servico_contratado)).horario_fim, '20:50');
assert.equal(applyContractExtractionRules(ai, source('Nome: Maria', ai.servico_contratado, '20:30 às 21:10')).horario_fim, '21:10');
console.log('PASS nomes, limites dos labels, visita Natal, exclusoes, precedencia, chegada, virada de dia e pos-processamento IA');
