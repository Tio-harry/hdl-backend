const REQUIRED_OUTPUT_KEYS = [
  'nome_contratante',
  'local',
  'data_evento',
  'dia_semana',
  'horario_inicio',
  'horario_fim',
  'horario_chegada',
  'qtd_criancas',
  'faixa_etaria',
  'aniversariante',
  'tema',
  'espaco',
  'servico_contratado',
  'valor_total',
  'entrada',
  'saldo',
  'informacoes',
];

const STRING_KEYS = [
  'nome_contratante',
  'local',
  'data_evento',
  'dia_semana',
  'horario_inicio',
  'horario_fim',
  'horario_chegada',
  'qtd_criancas',
  'faixa_etaria',
  'aniversariante',
  'tema',
  'espaco',
  'servico_contratado',
  'informacoes',
];

const NUMBER_KEYS = ['valor_total', 'entrada', 'saldo'];
const MONTHS_PT = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  março: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};
const WEEK_DAYS_PT = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

class AIContractOrganizerError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AIContractOrganizerError';
    this.statusCode = statusCode;
  }
}

function buildEmptyDados() {
  return {
    nome_contratante: '',
    local: '',
    data_evento: '',
    dia_semana: '',
    horario_inicio: '',
    horario_fim: '',
    horario_chegada: '',
    qtd_criancas: '',
    faixa_etaria: '',
    aniversariante: '',
    tema: '',
    espaco: '',
    servico_contratado: '',
    valor_total: null,
    entrada: null,
    saldo: null,
    informacoes: '',
  };
}

function cleanString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeMoneyOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const raw = String(value).trim();
  if (!raw) return null;
  const cleaned = raw.includes(',')
    ? raw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
    : raw.replace(/[^\d.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeHora(value) {
  const raw = cleanString(value);
  if (!raw) return '';

  const direct = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (direct) {
    const hh = Number(direct[1]);
    const mm = Number(direct[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }

  const hourOnly = raw.match(/^(\d{1,2})\s*h?$/i);
  if (hourOnly) {
    const hh = Number(hourOnly[1]);
    if (hh >= 0 && hh <= 23) return `${String(hh).padStart(2, '0')}:00`;
  }

  const withMinutesByDot = raw.match(/^(\d{1,2})\.(\d{2})$/);
  if (withMinutesByDot) {
    const hh = Number(withMinutesByDot[1]);
    const mm = Number(withMinutesByDot[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }

  const withHsOrHours = raw.match(/^(\d{1,2})\s*(h|hs|hora|horas)$/i);
  if (withHsOrHours) {
    const hh = Number(withHsOrHours[1]);
    if (hh >= 0 && hh <= 23) return `${String(hh).padStart(2, '0')}:00`;
  }

  const loose = raw.match(/(?:^|\s)(\d{1,2})(?::|\.|h|hs|\s*horas?)?(\d{2})?(?:\s|$)/i);
  if (loose) {
    const hh = Number(loose[1]);
    const mm = loose[2] ? Number(loose[2]) : 0;
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }

  return '';
}

function computeHorarioChegada(horarioInicio) {
  const match = String(horarioInicio || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return '';
  const total = Number(match[1]) * 60 + Number(match[2]) - 20;
  const adjusted = total < 0 ? total + 24 * 60 : total;
  const hh = Math.floor(adjusted / 60) % 24;
  const mm = adjusted % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function getDateReference(now = new Date()) {
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return {
    currentDate: `${dd}/${mm}/${yyyy}`,
    currentYear: yyyy,
  };
}

function normalizeDateWithCurrentYear(value, alertas, currentYear = new Date().getFullYear()) {
  const raw = cleanString(value);
  if (!raw) return '';
  const normalizedText = raw
    .replace(/\bdia\s+/gi, '')
    .replace(
      /\b(segunda-feira|terca-feira|terça-feira|quarta-feira|quinta-feira|sexta-feira|sabado|sábado|domingo)\s*,?\s*/gi,
      ''
    )
    .trim();

  const slashLike = normalizedText.replace(/[.\-]/g, '/');

  const full = slashLike.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (full) {
    const dd = String(Number(full[1])).padStart(2, '0');
    const mm = String(Number(full[2])).padStart(2, '0');
    return `${dd}/${mm}/${full[3]}`;
  }

  const shortYear = slashLike.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (shortYear) {
    const yearNum = Number(shortYear[3]);
    const yyyy = yearNum >= 50 ? 1900 + yearNum : 2000 + yearNum;
    const dd = String(Number(shortYear[1])).padStart(2, '0');
    const mm = String(Number(shortYear[2])).padStart(2, '0');
    return `${dd}/${mm}/${yyyy}`;
  }

  const dayMonth = slashLike.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (dayMonth) {
    const dd = String(Number(dayMonth[1])).padStart(2, '0');
    const mm = String(Number(dayMonth[2])).padStart(2, '0');
    alertas.push(`Ano do evento não informado; assumido automaticamente como ${currentYear}.`);
    return `${dd}/${mm}/${currentYear}`;
  }

  const embeddedFull = slashLike.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (embeddedFull) {
    const dd = String(Number(embeddedFull[1])).padStart(2, '0');
    const mm = String(Number(embeddedFull[2])).padStart(2, '0');
    return `${dd}/${mm}/${embeddedFull[3]}`;
  }

  const embeddedDayMonth = slashLike.match(/(\d{1,2})\/(\d{1,2})/);
  if (embeddedDayMonth) {
    const dd = String(Number(embeddedDayMonth[1])).padStart(2, '0');
    const mm = String(Number(embeddedDayMonth[2])).padStart(2, '0');
    alertas.push(`Ano do evento não informado; assumido automaticamente como ${currentYear}.`);
    return `${dd}/${mm}/${currentYear}`;
  }

  const monthName = normalizedText.match(
    /^(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(\d{4}))?$/i
  );
  if (monthName) {
    const dd = String(Number(monthName[1])).padStart(2, '0');
    const mm = String(MONTHS_PT[monthName[2].toLowerCase()] || 0).padStart(2, '0');
    const yyyy = monthName[3] || String(currentYear);
    if (Number(mm) > 0) {
      if (!monthName[3]) {
        alertas.push(`Ano do evento não informado; assumido automaticamente como ${yyyy}.`);
      }
      return `${dd}/${mm}/${yyyy}`;
    }
  }

  return '';
}

function shouldKeepIncerto(item, flags) {
  const text = cleanString(item).toLowerCase();
  if (!text) return false;
  if (flags.hasReliableValorTotal && (text.includes('valor_total') || text.includes('valor total'))) {
    return false;
  }
  if (
    flags.autoCalculatedEntradaSaldo &&
    (text.includes('entrada') || text.includes('sinal') || text.includes('saldo') || text.includes('restante'))
  ) {
    return false;
  }
  return true;
}

function computeHorarioFimPadrao(horarioInicio) {
  const match = String(horarioInicio || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return '';
  const total = Number(match[1]) * 60 + Number(match[2]) + 180;
  const hh = Math.floor((total % (24 * 60)) / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function computeDiaSemana(dataEvento) {
  const match = String(dataEvento || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(match[3]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[1])
  ) {
    return '';
  }
  return WEEK_DAYS_PT[date.getDay()] || '';
}

function normalizeItensDiscriminados(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isPlainObject(item)) return null;
      const descricao = cleanString(item.descricao || item.item || item.nome);
      const valor = normalizeMoneyOrNull(item.valor);
      if (!descricao) return null;
      return { descricao, valor };
    })
    .filter(Boolean);
}

/** Quando todos os itens têm valor, alinha valor_total à soma (ajuda serviço + extras). */
function reconcileValorTotalFromItens(dados, itens, alertas) {
  if (!itens.length) return;
  const allHaveValue = itens.every(
    (i) => i.valor !== null && typeof i.valor === 'number' && Number.isFinite(i.valor)
  );
  if (!allHaveValue) return;
  const sum = Number(itens.reduce((acc, i) => acc + i.valor, 0).toFixed(2));
  if (dados.valor_total === null || Math.abs(Number(dados.valor_total) - sum) > 0.02) {
    dados.valor_total = sum;
    alertas.push('Valor total alinhado à soma dos itens discriminados.');
  }
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item))
    .filter(Boolean);
}

function uniqueList(items) {
  return [...new Set(normalizeList(items))];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractJsonStringFromText(text) {
  const raw = cleanString(text);
  if (!raw) return '';

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  return raw;
}

function extractResponseText(apiData) {
  if (!apiData || typeof apiData !== 'object') return '';

  if (typeof apiData.output_text === 'string' && apiData.output_text.trim()) {
    return apiData.output_text;
  }

  const output = Array.isArray(apiData.output) ? apiData.output : [];
  for (const item of output) {
    const contentList = Array.isArray(item?.content) ? item.content : [];
    for (const content of contentList) {
      if (typeof content?.text === 'string' && content.text.trim()) {
        return content.text;
      }
    }
  }

  return '';
}

function parseModelJson(text) {
  const candidate = extractJsonStringFromText(text);
  if (!candidate) {
    throw new AIContractOrganizerError('A IA não retornou conteúdo utilizável.', 502);
  }

  try {
    return JSON.parse(candidate);
  } catch {
    throw new AIContractOrganizerError('A IA retornou JSON inválido.', 502);
  }
}

function normalizeAndValidateModelPayload(payload, dateReference = getDateReference()) {
  if (!isPlainObject(payload)) {
    throw new AIContractOrganizerError('A IA retornou estrutura inválida.', 502);
  }

  if (!isPlainObject(payload.dados)) {
    payload.dados = {};
  }
  const rawDados = payload.dados;
  const dados = buildEmptyDados();
  const alertas = normalizeList(payload.alertas);
  const incertos = normalizeList(payload.incertos);
  const faltantes = normalizeList(payload.faltantes);
  let autoCalculatedEntradaSaldo = false;

  // Pós-processamento obrigatório aplicado diretamente em payload.dados.
  rawDados.data_evento = normalizeDateWithCurrentYear(rawDados.data_evento, alertas, dateReference.currentYear);
  rawDados.valor_total = normalizeMoneyOrNull(rawDados.valor_total);
  rawDados.entrada = normalizeMoneyOrNull(rawDados.entrada);
  rawDados.saldo = normalizeMoneyOrNull(rawDados.saldo);

  for (const key of STRING_KEYS) {
    dados[key] = cleanString(rawDados[key]);
  }

  for (const key of NUMBER_KEYS) {
    dados[key] = normalizeMoneyOrNull(rawDados[key]);
  }

  // Guardrail final: mantém data_evento no padrão DD/MM/AAAA ou vazio.
  dados.data_evento = normalizeDateWithCurrentYear(dados.data_evento, alertas, dateReference.currentYear);
  const diaSemanaCalculado = computeDiaSemana(dados.data_evento);
  if (diaSemanaCalculado && !cleanString(dados.dia_semana)) {
    dados.dia_semana = diaSemanaCalculado;
    alertas.push(`Dia da semana calculado automaticamente: ${diaSemanaCalculado}.`);
  }
  dados.horario_inicio = normalizeHora(dados.horario_inicio);
  dados.horario_fim = normalizeHora(dados.horario_fim);

  if (dados.horario_inicio && !dados.horario_fim) {
    dados.horario_fim = computeHorarioFimPadrao(dados.horario_inicio);
    if (dados.horario_fim) {
      alertas.push('Horário final não informado; assumida duração padrão de 3 horas.');
    }
  }

  dados.horario_chegada = dados.horario_inicio ? computeHorarioChegada(dados.horario_inicio) : '';
  if (dados.horario_chegada) {
    alertas.push('Horário de chegada calculado automaticamente (20 minutos antes do início).');
  }

  const normalizedItensDiscriminados = normalizeItensDiscriminados(payload.itens_discriminados);
  reconcileValorTotalFromItens(dados, normalizedItensDiscriminados, alertas);

  if (dados.valor_total !== null && dados.entrada === null && dados.saldo === null) {
    const metade = Number((dados.valor_total / 2).toFixed(2));
    dados.entrada = metade;
    dados.saldo = metade;
    autoCalculatedEntradaSaldo = true;
    alertas.push('Entrada e saldo calculados automaticamente em 50% do valor total.');
  }

  if (dados.valor_total !== null) {
    if (!(dados.entrada !== null && dados.saldo !== null)) {
      if (dados.entrada === null) {
        faltantes.push('entrada');
        incertos.push('entrada não identificada claramente no texto.');
      }
      if (dados.saldo === null) {
        faltantes.push('saldo');
        incertos.push('saldo não identificado claramente no texto.');
      }
    }
  }

  for (const key of REQUIRED_OUTPUT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(dados, key)) {
      throw new AIContractOrganizerError(`Campo obrigatório ausente no retorno da IA: ${key}`, 502);
    }
  }

  let confianca = Number(payload.confianca);
  if (!Number.isFinite(confianca)) confianca = 0;
  if (confianca < 0) confianca = 0;
  if (confianca > 1) confianca = 1;
  const hasReliableValorTotal = dados.valor_total !== null;
  const incertosFiltered = incertos.filter((item) =>
    shouldKeepIncerto(item, { hasReliableValorTotal, autoCalculatedEntradaSaldo })
  );

  // Garante que o objeto final use exatamente o payload já pós-processado.
  payload.dados = dados;
  payload.faltantes = uniqueList(faltantes);
  payload.incertos = uniqueList(incertosFiltered);
  payload.alertas = uniqueList(alertas);
  payload.confianca = confianca;

  const response = {
    ok: true,
    dados: payload.dados,
    faltantes: payload.faltantes,
    incertos: payload.incertos,
    alertas: payload.alertas,
    confianca: payload.confianca,
  };
  if (normalizedItensDiscriminados.length) {
    response.itens_discriminados = normalizedItensDiscriminados;
  }
  return response;
}

function buildSystemPrompt(dateReference = getDateReference()) {
  return [
    'Você é uma organizadora de dados para contratos da empresa Hora do Lazer.',
    'Tarefa: extrair dados estruturados de um texto bruto de contrato enviado por cliente.',
    'Regras obrigatórias:',
    `Data atual de referência do servidor: ${dateReference.currentDate}.`,
    `Ano atual de referência do servidor: ${dateReference.currentYear}.`,
    '1) Responder SOMENTE JSON válido (objeto).',
    '2) Não usar markdown, não usar crases, não adicionar texto fora do JSON.',
    '3) Não inventar dados.',
    '4) Quando não identificar um campo, deixar string vazia ("") ou null para números.',
    '5) Nunca preencher com "Não informado".',
    '6) Quando assumir algo por regra da empresa, registrar em alertas.',
    '7) Estrutura de saída obrigatória:',
    '{ "dados": { ... }, "faltantes": [], "incertos": [], "alertas": [], "confianca": 0.0 }',
    '8) Campos obrigatórios dentro de dados:',
    'nome_contratante, local, data_evento, dia_semana, horario_inicio, horario_fim, horario_chegada, qtd_criancas, faixa_etaria, aniversariante, tema, espaco, servico_contratado, valor_total, entrada, saldo, informacoes.',
    '9) Campo opcional de topo permitido: itens_discriminados (array de objetos { "descricao": string, "valor": number|null }).',
    '10) "confianca" deve ser número de 0 a 1.',
    '11) Contratante: reconhecer também como cliente, responsável, mãe, pai.',
    '12) local: preservar endereço completo com ponto de referência quando existir (ex.: próximo a, ao lado de, em frente a, por trás de).',
    '13) data_evento: aceitar 15/03, 15-03, 15.03, dia 15/03, 15/03/2026, 15 de março, sábado 15/03. Formato final DD/MM/AAAA.',
    '14) Se ano não vier na data, assumir ano atual e registrar alerta "Ano do evento não informado; assumido automaticamente como [ano].".',
    '15) dia_semana: calcular pela data_evento em português quando possível.',
    '16) horario_inicio e horario_fim: aceitar 15h, 15 hs, 15 horas, 15:00, 15.00, às 15, das 15 às 18, 15h às 18h; saída HH:MM.',
    '17) Se só existir horário inicial, horario_fim = +3h e registrar alerta "Horário final não informado; assumida duração padrão de 3 horas.".',
    '18) horario_chegada: sempre 20 minutos antes de horario_inicio.',
    '19) contato_hora_do_lazer, se existir no schema do contexto, deve ser sempre "(81) 99761-7476".',
    '20) Classificação serviço principal vs EXTRA (obrigatório):',
    '21) EXTRAS — sempre classificar como extra em itens_discriminados (nunca como único serviço principal), mesmo junto do pacote:',
    'Torta na Cara; Caça ao Tesouro; Quebra Panela; Escultura em Balões; Kit Futebol; Som e Microfone; Hora Extra.',
    '22) EXTRAS — oficinas e afins: qualquer item que contenha "oficina" ou equivalente é EXTRA, incluindo:',
    'Oficina de Slime; Oficina de Culinária; Oficina de Massinha de Modelar; Oficina de Bijuterias;',
    'Pintura em Tela; Pintura em Gesso; Oficina Bob Goods; Massinha de Modelar.',
    '23) Serviço PRINCIPAL (preferencial quando existir no texto): Recreador/Recreadores; Recreação;',
    'Pool Party (Básico ou Completo); Recreação Sensorial; Recreação para Adultos; Camarim Kids;',
    'personagens vivos (ex.: Mickey, Minnie, Patati e Patatá); Papai Noel; Papai Noel com Duende;',
    'Promotor de Evento; Serviço com Ator.',
    '24) Quando houver principal + um ou mais extras no mesmo texto,',
    'servico_contratado deve descrever preferencialmente só o serviço principal (ex.: "1 Recreador").',
    '25) itens_discriminados: um objeto por item cobrado com descricao e valor quando houver preço;',
    'listar primeiro o serviço principal, depois cada extra com nome padronizado (ex.: "Caça ao Tesouro").',
    '26) valor_total = soma dos valores em itens_discriminados quando todos tiverem valor informado.',
    '27) Aceitar variações de escrita, plural, acentuação e caixa para reconhecer os itens acima.',
    '28) Valores: reconhecer R$ 600,00, 600 reais, entrada/sinal, saldo/restante, deslocamento e hora extra.',
    '29) Se valor_total existir e entrada/saldo não forem informados no texto, o backend pode calcular 50%/50%;',
    'na saída da IA, deixe entrada e saldo como null quando não explícitos.',
    '30) Região/cidade/estado: quando conseguir inferir por local, registrar em alertas como metadado (sem quebrar o schema atual).',
  ].join('\n');
}

function buildUserPrompt(textoBruto, contexto) {
  return JSON.stringify(
    {
      instrucoes: 'Extraia os dados do contrato no formato solicitado.',
      texto_bruto: textoBruto,
      contexto: contexto || {},
    },
    null,
    2
  );
}

async function callOpenAI(textoBruto, contexto, dateReference) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AIContractOrganizerError(
      'OPENAI_API_KEY não configurada no ambiente. Defina a variável no .env do backend.',
      500
    );
  }

  if (typeof fetch !== 'function') {
    throw new AIContractOrganizerError(
      'Este ambiente Node não possui fetch nativo habilitado.',
      500
    );
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_CONTRACT_ORGANIZER_MODEL || 'gpt-4.1-mini',
      temperature: 0.1,
      max_output_tokens: 1200,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: buildSystemPrompt(dateReference) }] },
        { role: 'user', content: [{ type: 'input_text', text: buildUserPrompt(textoBruto, contexto) }] },
      ],
    }),
  });

  const rawText = await response.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    throw new AIContractOrganizerError('Resposta inválida da API de IA.', 502);
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      'Falha ao consultar serviço de IA para organizar contrato.';
    throw new AIContractOrganizerError(message, response.status || 502);
  }

  return data;
}

async function organizeContractTextWithAI({ texto_bruto, contexto }) {
  const textoBruto = cleanString(texto_bruto);
  if (!textoBruto) {
    throw new AIContractOrganizerError('Campo texto_bruto é obrigatório.', 400);
  }

  const dateReference = getDateReference();
  const apiData = await callOpenAI(textoBruto, isPlainObject(contexto) ? contexto : {}, dateReference);
  const responseText = extractResponseText(apiData);
  const modelPayload = parseModelJson(responseText);
  const normalizedPayload = normalizeAndValidateModelPayload(modelPayload, dateReference);
  const finalReturn = {
    ok: true,
    dados: normalizedPayload.dados,
    faltantes: normalizedPayload.faltantes,
    incertos: normalizedPayload.incertos,
    alertas: normalizedPayload.alertas,
    confianca: normalizedPayload.confianca,
    ...(Array.isArray(normalizedPayload.itens_discriminados) &&
    normalizedPayload.itens_discriminados.length
      ? { itens_discriminados: normalizedPayload.itens_discriminados }
      : {}),
  };
  return finalReturn;
}

module.exports = {
  AIContractOrganizerError,
  organizeContractTextWithAI,
};
