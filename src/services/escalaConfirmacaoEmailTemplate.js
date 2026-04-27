function strField(value) {
  if (value == null || value === '') return '';
  return String(value).trim();
}

function parseServicosAdicionais(value) {
  const raw = strField(value);
  if (!raw) return [];
  return raw
    .split(/[\r\n;,]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeNomesEquipe(nomesEquipe) {
  if (!Array.isArray(nomesEquipe)) return [];
  return nomesEquipe
    .map((nome) => strField(nome))
    .filter(Boolean);
}

function buildModeloEventoTexto(evento, nomesEquipe = []) {
  const contratante = strField(evento?.contratante_nome).toUpperCase() || 'NÃO INFORMADO';
  const local = strField(evento?.endereco_evento) || 'Não informado';
  const dataEvento = strField(evento?.data_evento) || 'Não informado';
  const diaSemana = strField(evento?.dia_semana);
  const horaInicio = strField(evento?.hora_inicio) || 'Não informado';
  const horaFim = strField(evento?.hora_fim) || 'Não informado';
  const servicoContratado = strField(evento?.servico_contratado) || 'Não informado';
  const adicionais = parseServicosAdicionais(evento?.servicos_adicionais);
  const equipe = normalizeNomesEquipe(nomesEquipe);
  const observacoes = strField(evento?.observacoes);

  const linhas = [
    contratante,
    `Local: ${local}`,
    `Data: ${dataEvento}${diaSemana ? ` (${diaSemana})` : ''}`,
    `Horário: ${horaInicio} às ${horaFim}`,
    '',
    `Serviço: ${servicoContratado}${adicionais.length ? `\nAdicionais: ${adicionais.join(', ')}` : ''}${equipe.length ? `\nEquipe: ${equipe.join(', ')}` : ''}${observacoes ? `\nObs: ${observacoes}` : ''}`,
  ];

  return linhas.join('\n');
}

function buildEscalaConfirmacaoEmail({ evento, recreadorNome, nomesEquipe }) {
  const nome = strField(recreadorNome) || 'Recreador';
  const assunto = 'Confirmação de escala - Hora do Lazer';
  const eventoTexto = buildModeloEventoTexto(evento, nomesEquipe);
  const text = `${nome}, você está escalado para este evento.\n\n${eventoTexto}`;
  return {
    subject: assunto,
    text,
  };
}

module.exports = {
  buildEscalaConfirmacaoEmail,
  buildModeloEventoTexto,
};
