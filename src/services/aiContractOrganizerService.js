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
  'extras',
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

/** Cidades reconhecidas no local → cabeçalho e cidade de emissão (padrão: Recife). */
const REGIAO_POR_CIDADE = [
  { test: (t) => /\bFortaleza\b/i.test(t), empresa_atendimento: 'Atendimento Fortaleza - CE', cidade_emissao: 'Fortaleza - CE' },
  { test: (t) => /\bNatal\b/i.test(t), empresa_atendimento: 'Atendimento Natal - RN', cidade_emissao: 'Natal - RN' },
  { test: (t) => /\bJoão\s+Pessoa\b/i.test(t) || /\bJoao\s+Pessoa\b/i.test(t), empresa_atendimento: 'Atendimento João Pessoa - PB', cidade_emissao: 'João Pessoa - PB' },
  { test: (t) => /\bCaruaru\b/i.test(t), empresa_atendimento: 'Atendimento Caruaru - PE', cidade_emissao: 'Caruaru - PE' },
];

const DEFAULT_EMPRESA_ATENDIMENTO = 'Atendimento Recife - PE';
const DEFAULT_CIDADE_EMISSAO = 'Recife - PE';

/** Limites pós-processamento (evita contaminação / texto bruto na resposta). */
const MAX_SERVICO_CONTRATADO_LEN = 180;
const MAX_ITEM_DESCRICAO_LEN = 100;

/** Linha típica de lista de crianças: "Nome - 8" ou "Maria – 10 anos". */
const RX_LINE_NOME_IDADE =
  /^\s*[\p{L}][\p{L}\s.'’-]{0,120}?\s*[-–—]\s*\d{1,2}(\s*anos?)?\s*$/iu;

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
    extras: '',
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

function normalizeTextForExtrasMatch(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

const EXTRA_NEEDLES_NORMALIZED = [
  'torta na cara',
  'caca ao tesouro',
  'quebra panela',
  'escultura em baloes',
  'kit futebol',
  'som e microfone',
  'hora extra',
  'pintura em tela',
  'pintura em gesso',
  'massinha de modelar',
  'oficina de slime',
  'oficina de culinaria',
  'oficina de bijuterias',
  'oficina bob goods',
].map((s) => normalizeTextForExtrasMatch(s));

/**
 * Indica serviço principal na linha (pacote). Se verdadeiro, a linha não é tratada como extra só por conter palavra de extra.
 */
function hasPrincipalServiceInLine(desc) {
  const key = normalizeTextForExtrasMatch(desc);
  if (!key.trim()) return false;
  if (/\b\d+\s+recreador/.test(key)) return true;
  if (/\brecreador(es)?\b/.test(key)) return true;
  if (key.includes('recreacao')) return true;
  if (key.includes('animacao')) return true;
  if (key.includes('pool party')) return true;
  if (key.includes('sensorial')) return true;
  if (key.includes('camarim kids')) return true;
  if (key.includes('papai noel')) return true;
  if (key.includes('promotor')) return true;
  if (key.includes('servico com ator')) return true;
  if (key.includes('personagem')) return true;
  return false;
}

function isExtraDescription(desc) {
  if (hasPrincipalServiceInLine(desc)) return false;
  const key = normalizeTextForExtrasMatch(desc);
  if (!key.trim()) return false;
  if (key.includes('oficina')) return true;
  return EXTRA_NEEDLES_NORMALIZED.some((needle) => key.includes(needle));
}

/** Padrões para retirar extras embutidos na mesma linha do pacote (ordem: mais específicos primeiro). */
const EMBEDDED_EXTRA_PATTERNS = [
  { re: /\boficina\s+de\s+bijuterias?\b/gi, label: 'Oficina de bijuterias' },
  { re: /\boficina\s+de\s+culin[aá]ria\b/gi, label: 'Oficina de culinária' },
  { re: /\boficina\s+de\s+slime\b/gi, label: 'Oficina de slime' },
  { re: /\boficina\s+bob\s+goods\b/gi, label: 'Oficina bob goods' },
  { re: /\bmassinha\s+de\s+modelar\b/gi, label: 'Massinha de modelar' },
  { re: /\bca[çc]a\s+ao\s+tesouro\b/gi, label: 'Caça ao tesouro' },
  { re: /\bsom\s+e\s+microfone\b/gi, label: 'Som e microfone' },
  { re: /\bescultura\s+em\s+bal(ões|oes)\b/gi, label: 'Escultura em balões' },
  { re: /\bpintura\s+em\s+tela\b/gi, label: 'Pintura em tela' },
  { re: /\bpintura\s+em\s+gesso\b/gi, label: 'Pintura em gesso' },
  { re: /\bquebra\s+panela\b/gi, label: 'Quebra panela' },
  { re: /\btorta\s+na\s+cara\b/gi, label: 'Torta na cara' },
  { re: /\bkit\s+futebol\b/gi, label: 'Kit futebol' },
  { re: /\bhora\s+extra\b/gi, label: 'Hora extra' },
  { re: /\boficina\b/gi, label: 'Oficina' },
];

function cleanupPrincipalAfterExtraRemoval(s) {
  let t = collapseWhitespaceSingleLine(s);
  t = t.replace(/\s*,\s*,+/g, ', ');
  t = t.replace(/,\s*e\s+/gi, ' e ');
  t = t.replace(/^\s*,\s*/, '');
  t = t.replace(/\s*,\s*$/, '');
  t = t.replace(/\s+e\s+e\s+/gi, ' e ');
  return collapseWhitespaceSingleLine(t);
}

/**
 * Em linha mista (ex.: recreadores + escultura em balões), devolve texto do serviço principal sem os trechos de extra e lista de rótulos dos extras retirados.
 */
function splitEmbeddedExtrasFromPrincipalDescription(desc) {
  const raw = cleanString(desc);
  if (!raw || !hasPrincipalServiceInLine(raw)) {
    return { principalText: raw, embeddedExtras: [] };
  }
  let work = raw;
  const embeddedExtras = [];
  for (const { re, label } of EMBEDDED_EXTRA_PATTERNS) {
    const rx = new RegExp(re.source, 'gi');
    if (!rx.test(work)) continue;
    embeddedExtras.push(label);
    work = work.replace(new RegExp(re.source, 'gi'), ' ');
  }
  work = cleanupPrincipalAfterExtraRemoval(work);
  return { principalText: work, embeddedExtras };
}

function uniqueExtrasCommaList(parts) {
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const t = cleanString(p);
    if (!t) continue;
    const k = normalizeTextForExtrasMatch(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.join(', ');
}

function applyMixedLineSplitFromPrincipalItem(dados, itensDiscriminados, alertas) {
  const idx = itensDiscriminados.findIndex((i) => i.descricao && !isExtraDescription(i.descricao));
  if (idx < 0) return;

  const full = cleanString(itensDiscriminados[idx].descricao);
  if (!full || !hasPrincipalServiceInLine(full)) return;

  const split = splitEmbeddedExtrasFromPrincipalDescription(full);
  if (!split.embeddedExtras.length) return;

  const prevServico = cleanString(dados.servico_contratado);
  const prevExtras = cleanString(dados.extras);

  dados.servico_contratado = split.principalText;

  const merged = uniqueExtrasCommaList([
    ...prevExtras.split(',').map((s) => s.trim()).filter(Boolean),
    ...split.embeddedExtras,
  ]);
  dados.extras = merged;

  const norm = (s) => normalizeTextForExtrasMatch(s);
  const changed =
    norm(split.principalText) !== norm(prevServico) || norm(merged) !== norm(prevExtras);
  if (changed) {
    alertas.push('Serviço principal e extras ajustados em linha mista (pacote + adicional).');
  }
}

/** Serviço principal (linha com valor) — não é extra. */
function isLikelyPrincipalLine(desc) {
  const key = normalizeTextForExtrasMatch(desc);
  if (!key.trim() || isExtraDescription(desc)) return false;
  if (/\b\d+\s+recreador/.test(key)) return true;
  if (key.includes('recreacao')) return true;
  if (key.includes('animacao')) return true;
  if (key.includes('pool party')) return true;
  if (key.includes('sensorial')) return true;
  if (key.includes('camarim kids')) return true;
  if (key.includes('papai noel')) return true;
  if (key.includes('promotor')) return true;
  if (key.includes('servico com ator')) return true;
  if (key.includes('personagem')) return true;
  return false;
}

function dedupeEspacoValue(value) {
  let t = cleanString(value);
  if (!t) return '';
  t = t.replace(/^espa[çc]o\s*:\s*/i, '').trim();
  t = t.replace(/^espa[çc]o\s+espa[çc]o\b/i, 'espaço');
  t = t.replace(/^espa[çc]o\s+/i, '');
  return t.trim();
}

function extractExplicitQtdCriancas(text) {
  const raw = String(text || '');
  const torno = raw.match(/em\s+torno\s+de\s+(\d+)\s*crian[çc]as?\b/i);
  if (torno) {
    const fullPhrase = raw.match(/em\s+torno\s+de\s+\d+\s*crian[çc]as?/i);
    return fullPhrase ? fullPhrase[0].trim() : String(Number(torno[1]));
  }
  const m = raw.match(/(\d+)\s*crian[çc]as?\b/i);
  return m ? String(Number(m[1])) : '';
}

function extractFaixaEtariaExplicita(text) {
  const m = String(text || '').match(/(\d+)\s*a\s*(\d+)\s*anos\b/i);
  if (!m) return '';
  return `${Number(m[1])} a ${Number(m[2])} anos`;
}

function stripFromDadosMarker(text) {
  const s = String(text || '');
  const idx = s.search(/\bDados:\s*/i);
  if (idx >= 0) return s.slice(0, idx).trim();
  return s.trim();
}

/** Remove linhas tipo lista/instrução (marcadores no início). */
function stripBulletAndInstructionLines(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (/^\s*(?:[-*•]|\d+\))\s+/.test(line)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

function stripNameAgeLines(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !RX_LINE_NOME_IDADE.test(line.trim()))
    .join('\n')
    .trim();
}

function collapseWhitespaceSingleLine(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove caracteres invisíveis, bullets, crases e normaliza espaços. */
function stripInvalidCharsAndMarks(text) {
  let s = String(text || '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/•/g, '')
    .replace(/`/g, '')
    .replace(/\r?\n+/g, ' ');
  return collapseWhitespaceSingleLine(s);
}

/**
 * Remove prefixos de formulário / pergunta no início (repete até estabilizar).
 */
function stripLeadingInstructionPrefixes(text) {
  const explicit = [
    /^[\s•`'"]*Qual\s+o\s+servi[çc]o\s+contratado\s*\??\s*/i,
    /^[\s•`'"]*Servi[çc]o\s*(contratado\s*)?:\s*/i,
    /^[\s•`'"]*Dados\s*:\s*/i,
    /^[\s•`'"]*Nome\s*(completo\s*)?(do\s*contratante\s*)?:\s*/i,
    /^[\s•`'"]*Local\s*(da\s*festa\s*)?:\s*/i,
    /^[\s•`'"]*Data\s*(da\s*festa\s*)?:\s*/i,
    /^[\s•`'"]*Hor[aá]rio\s*[^:]+:\s*/i,
  ];

  let s = collapseWhitespaceSingleLine(text);
  for (let round = 0; round < 14; round++) {
    let next = s;
    for (const rx of explicit) {
      next = next.replace(rx, '');
    }
    next = next.replace(/^[\s•`'"]{1,12}(?:[^\n?]{1,100}\?\s*)/, '');
    next = collapseWhitespaceSingleLine(next);
    if (next === s) break;
    s = next;
  }
  return s.trim();
}

/** Ajuste pontual: "01 recreador" → "01 Recreador" após limpeza. */
function capitalizeServicoPrincipalWord(s) {
  const t = cleanString(s);
  if (!t) return '';
  return t.replace(/^(\d+\s+)recreador\b/i, (_, pre) => `${pre}Recreador`);
}

/** Normaliza duplicidade óbvia em informacoes (ex.: "crianças crianças"). */
function normalizeInformacoesDuplicates(raw) {
  let s = cleanString(raw);
  if (!s) return '';
  s = collapseWhitespaceSingleLine(s.replace(/\s+/g, ' '));
  let t = s.replace(/\bcriancas\b/gi, 'crianças').replace(/\bcrianca\b/gi, 'criança');
  const rxPlural = /\b(crianças)\b(?:\s*[,.;:!?]+\s*)?\s*\1\b/giu;
  const rxSing = /\b(criança)\b(?:\s*[,.;:!?]+\s*)?\s*\1\b/giu;
  for (let i = 0; i < 8; i++) {
    const next = t.replace(rxPlural, '$1').replace(rxSing, '$1');
    if (next === t) break;
    t = next;
  }
  return collapseWhitespaceSingleLine(t);
}

/**
 * Remove contaminação comum de texto bruto em descrições de serviço/extra.
 */
function sanitizeContractFieldText(raw) {
  let s = cleanString(raw);
  if (!s) return '';
  s = stripInvalidCharsAndMarks(s);
  s = stripLeadingInstructionPrefixes(s);
  s = stripFromDadosMarker(s);
  s = stripBulletAndInstructionLines(s);
  s = stripNameAgeLines(s);
  s = s.replace(/\n+/g, ' ');
  s = collapseWhitespaceSingleLine(s);
  s = s.replace(/\s+Dados:\s+.*$/i, '').trim();
  s = stripInvalidCharsAndMarks(s);
  s = stripLeadingInstructionPrefixes(s);
  s = capitalizeServicoPrincipalWord(s);
  return collapseWhitespaceSingleLine(s);
}

function truncateRelevant(text, maxLen) {
  const s = cleanString(text);
  if (!s || s.length <= maxLen) return s;
  const slice = s.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > Math.floor(maxLen * 0.55)) return slice.slice(0, lastSpace).trim();
  return slice.trim();
}

/** Trecho do texto bruto usado só para detectar linha "serviço R$ + extra R$" (sem blocos colados). */
function preparaTextoBrutoParaParseServico(textoBruto) {
  let t = cleanString(textoBruto);
  if (!t) return '';
  t = stripFromDadosMarker(t);
  t = stripBulletAndInstructionLines(t);
  t = stripNameAgeLines(t);
  return collapseWhitespaceSingleLine(t.replace(/\n+/g, ' '));
}

function deepSanitizeServicoEItens(dados, itensDiscriminados, alertas) {
  if (Object.prototype.hasOwnProperty.call(dados, 'extras')) {
    dados.extras = sanitizeContractFieldText(dados.extras || '');
  }

  const beforeServico = dados.servico_contratado;
  dados.servico_contratado = sanitizeContractFieldText(dados.servico_contratado);

  let removedItem = false;
  const cleaned = [];
  for (const item of itensDiscriminados) {
    const d = sanitizeContractFieldText(item.descricao);
    if (!d) {
      removedItem = true;
      continue;
    }
    cleaned.push({ ...item, descricao: d });
  }
  itensDiscriminados.length = 0;
  itensDiscriminados.push(...cleaned);

  const dirtied =
    (beforeServico && sanitizeContractFieldText(beforeServico) !== beforeServico) ||
    /\bDados:\s*/i.test(String(beforeServico || '')) ||
    removedItem;

  if (dirtied) {
    alertas.push(
      'Descrições de serviço e itens foram higienizadas (removidos bloco "Dados:", listas de nomes ou instruções).'
    );
  }
}

function applyLengthLimitsServicoEItens(dados, itensDiscriminados) {
  dados.servico_contratado = truncateRelevant(dados.servico_contratado, MAX_SERVICO_CONTRATADO_LEN);
  for (let i = 0; i < itensDiscriminados.length; i++) {
    const it = itensDiscriminados[i];
    itensDiscriminados[i] = {
      ...it,
      descricao: truncateRelevant(it.descricao, MAX_ITEM_DESCRICAO_LEN),
    };
  }
}

function inferRegiaoAtendimento(localText, textoBruto) {
  const combined = `${cleanString(localText)}\n${cleanString(textoBruto)}`;
  if (!combined.trim()) {
    return {
      empresa_atendimento: DEFAULT_EMPRESA_ATENDIMENTO,
      cidade_emissao: DEFAULT_CIDADE_EMISSAO,
    };
  }
  for (const regiao of REGIAO_POR_CIDADE) {
    if (regiao.test(combined)) {
      return {
        empresa_atendimento: regiao.empresa_atendimento,
        cidade_emissao: regiao.cidade_emissao,
      };
    }
  }
  return {
    empresa_atendimento: DEFAULT_EMPRESA_ATENDIMENTO,
    cidade_emissao: DEFAULT_CIDADE_EMISSAO,
  };
}

function formatExtraDescricao(raw) {
  const t = cleanString(raw);
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** Linha inteira no formato descrição + R$ valor (determinístico). */
const RX_LINHA_COM_PRECO = /^(.+?)\s+R\$\s*([\d.,]+)\s*$/i;

function parseLinhasComValorPreco(textoBruto) {
  const lines = String(textoBruto || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out = [];
  for (const line of lines) {
    const m = line.match(RX_LINHA_COM_PRECO);
    if (!m) continue;
    const descricao = m[1].trim();
    const valor = normalizeMoneyOrNull(m[2]);
    if (!descricao || valor === null) continue;
    out.push({ descricao, valor });
  }
  return out;
}

/**
 * Monta serviço, extras, itens e valores apenas com linhas "… R$ X" do texto bruto (prioridade máxima).
 */
function extractDeterministicContractParts(textoBruto) {
  const parsedLines = parseLinhasComValorPreco(textoBruto);
  if (!parsedLines.length) return null;

  let principalIdx = parsedLines.findIndex((p) => isLikelyPrincipalLine(p.descricao));
  if (principalIdx < 0) {
    principalIdx = parsedLines.findIndex((p) => !isExtraDescription(p.descricao));
  }
  if (principalIdx < 0) principalIdx = 0;

  const principal = parsedLines[principalIdx];
  const principalDescRaw = principal.descricao.trim();
  const splitPrincipal = splitEmbeddedExtrasFromPrincipalDescription(principalDescRaw);
  const servico_contratado = splitPrincipal.principalText;

  const extrasParts = [...splitPrincipal.embeddedExtras];
  for (let i = 0; i < parsedLines.length; i++) {
    if (i === principalIdx) continue;
    if (isExtraDescription(parsedLines[i].descricao)) {
      extrasParts.push(formatExtraDescricao(parsedLines[i].descricao));
    }
  }

  const orderedItens = [
    parsedLines[principalIdx],
    ...parsedLines.filter((_, i) => i !== principalIdx),
  ].map((p) => ({
    descricao: p.descricao.trim(),
    valor: p.valor,
  }));

  const sum = parsedLines.reduce((acc, p) => acc + p.valor, 0);
  const valor_total = Number(sum.toFixed(2));
  const half = Number((valor_total / 2).toFixed(2));

  return {
    servico_contratado,
    extras: uniqueExtrasCommaList(extrasParts),
    itens_discriminados: orderedItens,
    valor_total,
    entrada: half,
    saldo: half,
    principalFallback: principalDescRaw,
  };
}

function isContaminatedContractDescription(desc) {
  const s = cleanString(desc);
  if (!s) return true;
  if (/\bDados:\s*/i.test(s)) return true;
  if (/nome\s+completo\s+do\s+contratante/i.test(s)) return true;
  if (/local\s+da\s+festa/i.test(s)) return true;
  if (/data\s+da\s+festa/i.test(s)) return true;
  if (/hor[aá]rio\s+que\s+inicia/i.test(s)) return true;
  if (/\bobserva[çc][aã]o\b/i.test(s) && s.length > 35) return true;
  if (/^\s*obs\.?\s*:?\s*/i.test(s)) return true;
  if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return true;
  if (/\bCEP\b|\bRua\b|\bAv\.?\b|\bAvenida\b/i.test(s) && s.length > 35) return true;
  if (RX_LINE_NOME_IDADE.test(s)) return true;
  const lines = s.split(/\r?\n/).filter(Boolean);
  if (lines.length >= 2 && lines.filter((ln) => RX_LINE_NOME_IDADE.test(ln.trim())).length >= 2) return true;
  return false;
}

function applyContaminationFinalGuard(dados, itensDiscriminados, ctx, alertas) {
  const { fromDeterministicExtract, principalFallback } = ctx;

  let serv = cleanString(dados.servico_contratado);
  const suspiciousLong = serv.length > MAX_SERVICO_CONTRATADO_LEN;
  const bad = isContaminatedContractDescription(serv);

  if (bad || suspiciousLong) {
    const fb = cleanString(principalFallback);
    if (fb && !isContaminatedContractDescription(fb)) {
      dados.servico_contratado = truncateRelevant(fb, MAX_SERVICO_CONTRATADO_LEN);
      alertas.push(
        'servico_contratado ajustado com base na linha de serviço com preço (texto suspeito, contaminado ou longo demais).'
      );
    } else {
      dados.servico_contratado = truncateRelevant(sanitizeContractFieldText(serv), MAX_SERVICO_CONTRATADO_LEN);
    }
  } else {
    dados.servico_contratado = truncateRelevant(serv, MAX_SERVICO_CONTRATADO_LEN);
  }

  const kept = [];
  for (const item of itensDiscriminados) {
    const d = cleanString(item.descricao);
    if (!d) continue;
    if (isContaminatedContractDescription(d)) continue;
    if (d.length > MAX_ITEM_DESCRICAO_LEN && !fromDeterministicExtract) continue;
    kept.push({
      ...item,
      descricao: truncateRelevant(d, MAX_ITEM_DESCRICAO_LEN),
    });
  }
  itensDiscriminados.length = 0;
  itensDiscriminados.push(...kept);

  const ex = cleanString(dados.extras);
  if (ex && isContaminatedContractDescription(ex)) {
    dados.extras = '';
  }
}

const RX_PRECO_FIM = /\s+R\$\s*([\d.,]+)\s*$/i;

/**
 * Interpreta linha tipo "serviço completo R$ 300 + extra R$ 45".
 * Retorna null se não houver padrão utilizável.
 */
function parseServicoEExtrasDoTextoBruto(textoBruto) {
  const full = cleanString(textoBruto);
  if (!full || !full.includes('+')) return null;

  const partes = full
    .split(/\s*\+\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length < 2) return null;

  const segmentos = [];
  for (const parte of partes) {
    const m = parte.match(RX_PRECO_FIM);
    const valor = m ? normalizeMoneyOrNull(m[1]) : null;
    const descricao = (m ? parte.slice(0, m.index) : parte).trim();
    if (!descricao) continue;
    segmentos.push({ descricao, valor });
  }
  if (segmentos.length < 2) return null;

  const principal = segmentos[0];
  if (isExtraDescription(principal.descricao)) return null;

  const itens = [
    { descricao: principal.descricao, valor: principal.valor },
    ...segmentos.slice(1).map((s) => ({
      descricao: formatExtraDescricao(s.descricao),
      valor: s.valor,
    })),
  ];

  return {
    servico_contratado: principal.descricao,
    itens_discriminados: itens,
  };
}

/**
 * Alinha serviço principal (campo dados) com o melhor texto disponível.
 * O 1º item discriminado fica como rótulo curto (≤80 caracteres); o frontend pode unir itens.
 */
function syncPrincipalServicoEItens(dados, itens) {
  const principalIdx = itens.findIndex((i) => i.descricao && !isExtraDescription(i.descricao));
  const idx = principalIdx >= 0 ? principalIdx : 0;

  const servico = cleanString(dados.servico_contratado);
  const itemPrincipal = itens[idx]?.descricao ? cleanString(itens[idx].descricao) : '';

  const preservePackageItem =
    hasPrincipalServiceInLine(itemPrincipal) &&
    servico &&
    itemPrincipal.length > servico.length + 5;

  if (preservePackageItem) {
    dados.servico_contratado = servico;
    return;
  }

  const escolhido =
    servico.length >= itemPrincipal.length ? servico : itemPrincipal || servico;
  if (!escolhido) return;

  dados.servico_contratado = escolhido;

  const rotuloPrincipal = truncateRelevant(escolhido, MAX_ITEM_DESCRICAO_LEN);

  if (!itens.length) {
    itens.push({ descricao: rotuloPrincipal, valor: null });
    return;
  }
  itens[idx] = { ...itens[idx], descricao: rotuloPrincipal };
}

function applyPostProcessingHeuristics(textoBruto, dados, itensDiscriminados, alertas) {
  const texto = cleanString(textoBruto);
  let deterministicFinanceApplied = false;
  let fromDeterministicExtract = false;
  let principalFallback = '';

  const qtdExplicita = extractExplicitQtdCriancas(texto);
  if (qtdExplicita) {
    dados.qtd_criancas = qtdExplicita;
    alertas.push('Quantidade de crianças definida pelo texto explícito no contrato (não por contagem de nomes).');
  }

  const faixaEx = extractFaixaEtariaExplicita(texto);
  if (faixaEx && !cleanString(dados.faixa_etaria)) {
    dados.faixa_etaria = faixaEx;
  }

  if (dados.espaco) {
    dados.espaco = dedupeEspacoValue(dados.espaco);
  }

  const regiao = inferRegiaoAtendimento(dados.local, texto);
  dados.empresa_atendimento = regiao.empresa_atendimento;
  dados.cidade_emissao = regiao.cidade_emissao;
  if (regiao.empresa_atendimento !== DEFAULT_EMPRESA_ATENDIMENTO) {
    alertas.push(`Região de atendimento ajustada automaticamente conforme local: ${regiao.cidade_emissao}.`);
  }

  const det = extractDeterministicContractParts(texto);
  if (det) {
    dados.servico_contratado = det.servico_contratado;
    dados.extras = det.extras;
    itensDiscriminados.length = 0;
    itensDiscriminados.push(...det.itens_discriminados);
    dados.valor_total = det.valor_total;
    dados.entrada = det.entrada;
    dados.saldo = det.saldo;
    deterministicFinanceApplied = true;
    fromDeterministicExtract = true;
    principalFallback = det.principalFallback;
    alertas.push('Serviços e valores definidos por extração determinística das linhas com R$ no texto bruto.');
  } else {
    const textoParaParse = preparaTextoBrutoParaParseServico(texto);
    const parsedLinha = parseServicoEExtrasDoTextoBruto(textoParaParse);
    if (parsedLinha && parsedLinha.itens_discriminados.length) {
      dados.servico_contratado = parsedLinha.servico_contratado;
      itensDiscriminados.length = 0;
      itensDiscriminados.push(...parsedLinha.itens_discriminados);
      principalFallback = parsedLinha.servico_contratado;
      alertas.push('Serviço principal e extras alinhados ao texto (trecho com "+" e preços).');
    }
  }

  deepSanitizeServicoEItens(dados, itensDiscriminados, alertas);
  applyContaminationFinalGuard(
    dados,
    itensDiscriminados,
    { fromDeterministicExtract, principalFallback },
    alertas
  );
  applyMixedLineSplitFromPrincipalItem(dados, itensDiscriminados, alertas);
  syncPrincipalServicoEItens(dados, itensDiscriminados);
  applyLengthLimitsServicoEItens(dados, itensDiscriminados);

  dados.informacoes = normalizeInformacoesDuplicates(dados.informacoes);

  return deterministicFinanceApplied;
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

function normalizeAndValidateModelPayload(payload, dateReference = getDateReference(), textoBruto = '') {
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
  if (diaSemanaCalculado) {
    const diaSemanaAnterior = cleanString(dados.dia_semana);
    dados.dia_semana = diaSemanaCalculado;
    if (!diaSemanaAnterior) {
      alertas.push(`Dia da semana calculado automaticamente: ${diaSemanaCalculado}.`);
    } else if (diaSemanaAnterior.toLowerCase() !== diaSemanaCalculado.toLowerCase()) {
      alertas.push(`Dia da semana ajustado conforme a data do evento: ${diaSemanaCalculado}.`);
    }
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
  const deterministicFinanceApplied = applyPostProcessingHeuristics(
    textoBruto,
    dados,
    normalizedItensDiscriminados,
    alertas
  );
  reconcileValorTotalFromItens(dados, normalizedItensDiscriminados, alertas);

  if (dados.valor_total !== null && dados.entrada === null && dados.saldo === null && !deterministicFinanceApplied) {
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
    'nome_contratante, local, data_evento, dia_semana, horario_inicio, horario_fim, horario_chegada, qtd_criancas, faixa_etaria, aniversariante, tema, espaco, servico_contratado, valor_total, entrada, saldo, informacoes;',
    'campo opcional em dados: extras (texto dos extras separados por vírgula).',
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
    '20) CRÍTICO — servico_contratado: somente a descrição do SERVIÇO PRINCIPAL (uma linha); máximo ~150 caracteres no backend;',
    'NUNCA incluir bloco "Dados:", listas de nomes de crianças, endereço, nem colar o texto bruto/instruções.',
    '21) CRÍTICO — itens_discriminados: descrições CURTAS por item (ex.: "1 recreador", "caça ao tesouro") + valor;',
    'nunca listas longas, nem texto bruto; máximo ~80 caracteres por descrição no backend.',
    '22) Classificação serviço principal vs EXTRA:',
    'EXTRAS — Torta na Cara; Caça ao Tesouro; Quebra Panela; Escultura em Balões; Kit Futebol; Som e Microfone; Hora Extra;',
    'oficinas: qualquer item com "oficina" ou equivalente; Pintura em Tela/Gesso; Massinha de Modelar; etc.',
    '23) Serviço PRINCIPAL (quando existir): Recreador/Recreadores; Recreação; Pool Party; Recreação Sensorial;',
    'Camarim Kids; personagens; Papai Noel; Promotor; Serviço com Ator.',
    '24) Quando houver "serviço principal + extra" no mesmo trecho (ex.: "… R$ 300 + escultura em balões R$ 45"):',
    'servico_contratado = só o trecho do serviço principal (sem extra); itens_discriminados = linhas curtas + valores;',
    'não repetir listas de crianças nem blocos "Dados:" em servico ou itens.',
    '25) valor_total = soma dos valores em itens_discriminados quando todos tiverem valor informado.',
    '26) Aceitar variações de escrita, plural, acentuação e caixa.',
    '27) Valores: R$ 600,00, 600 reais, entrada/sinal, saldo/restante, deslocamento e hora extra.',
    '28) Se valor_total existir e entrada/saldo não forem explícitos no texto, deixe entrada e saldo null (o backend pode calcular 50%/50%).',
    '29) CRÍTICO — qtd_criancas: se o texto disser explicitamente "N crianças" ou "N criancas", use exatamente N;',
    'não estime quantidade contando nomes de crianças (lista de nomes é só complemento).',
    '30) espaco: descrever o tipo de espaço sem redundância (ex.: "pequeno", "salão de festas");',
    'não usar "Espaço: Espaço pequeno" — evite repetir a palavra Espaço no início.',
    '31) Cidade no local: Fortaleza → atendimento/cabeçalho "Atendimento Fortaleza - CE" e emissão "Fortaleza - CE";',
    'Natal → "Atendimento Natal - RN" / "Natal - RN"; João Pessoa → "Atendimento João Pessoa - PB" / "João Pessoa - PB";',
    'Caruaru → "Atendimento Caruaru - PE" / "Caruaru - PE"; se não houver cidade clara, assumir região Recife - PE',
    '(o backend também normaliza isso; refletir no preenchimento de local quando fizer sentido).',
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
      temperature: 0,
      top_p: 1,
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
  const normalizedPayload = normalizeAndValidateModelPayload(modelPayload, dateReference, textoBruto);
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
