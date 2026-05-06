function clean(value) {
  if (!value) return "";
  return String(value).replace(/\r/g, "").trim();
}

function normalizeText(value) {
  if (!value) return "";
  return String(value)
    .replace(/\r/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/�/g, "")
    .toLowerCase()
    .trim();
}

function titleCase(value) {
  if (!value) return value;
  return cleanExtractedValue(value)
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|[\s'([{])(\p{L})/gu, (_, prefix, char) => prefix + char.toLocaleUpperCase("pt-BR"))
    .replace(/\bAnos?\b/g, (word) => word.toLocaleLowerCase("pt-BR"));
}

function splitLines(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const NOT_INFORMED = "Não informado";
const NO_EXTRAS = "Sem extras";

const VALUE_SUMMARY_LABELS = ["valor total", "entrada", "saldo"];
const STRUCTURED_SECTION_ENDS = ["CONTRATANTE", "CONTRATADA"];
const EVENT_SECTION_ENDS = ["DETALHES DO EVENTO", "VALORES", ...STRUCTURED_SECTION_ENDS];
const DETAILS_SECTION_ENDS = ["VALORES", ...STRUCTURED_SECTION_ENDS];

const SERVICE_LABELS = ["serviço contratado", "servico contratado", "serviço", "servico"];
/** Rótulos mais longos primeiro para pickLooseByLabel não cortar em "espaço" antes de "espaço da recreação". */
const SPACE_LABELS = [
  "área da recreação",
  "area da recreacao",
  "tipo de espaço",
  "tipo de espaco",
  "espaço da recreação",
  "espaco da recreacao",
  "espaço",
  "espaco"
].sort((a, b) => normalizeText(b).length - normalizeText(a).length);
const SPACE_CANDIDATES = [
  "piscina",
  "quadra",
  "campo",
  "salão de festa",
  "salao de festa",
  "pequeno",
  "médio",
  "medio",
  "grande"
];
const EXTRA_DEFINITIONS = [
  {
    label: "escultura em balões",
    itemDescricao: "Escultura em balões",
    aliases: ["escultura em baloes", "escultura em balões"],
    valor: 45
  },
  {
    label: "caça ao tesouro",
    itemDescricao: "Caça ao Tesouro",
    aliases: ["caca ao tesouro", "caça ao tesouro"],
    valor: 80
  },
  { label: "quebra panela", itemDescricao: "Quebra Panela", aliases: ["quebra panela"], valor: 80 },
  { label: "torta na cara", itemDescricao: "Torta na Cara", aliases: ["torta na cara"], valor: 100 },
  {
    label: "caixa de som e microfone",
    itemDescricao: "Caixa de som e microfone",
    aliases: ["caixa de som e microfone", "som e microfone"],
    valor: 150
  }
];

const FORM_INSTRUCTION_PATTERNS = [
  /^dados$/,
  /^nome completo do contratante$/,
  /^local da festa/,
  /^data da festa$/,
  /^hor.?rio que inicia$/,
  /^detalhes que (?:seja|sejam|seria) importante mencionar/,
  /^quantidade de criancas,?\s*faixa etaria,?\s*nome d[oa] aniversariante/,
  /^opcao da recreacao$/,
  /^espaco da recreacao$/,
  /^servico contratado$/,
  /^valor total$/
];

const LOCAL_LABELS = [
  "local da festa e ponto de referência",
  "local da festa e ponto de referencia",
  "local da festa",
  "endereço",
  "endereco",
  "local"
];

const LOOSE_VALUE_STOP_LABELS = [
  "formato da acao",
  "formato da aÃ§Ã£o",
  "datas e horarios",
  "datas e horÃ¡rios",
  "servico contratado",
  "serviÃ§o contratado",
  "investimento",
  "investimento total",
  "investimento total da proposta",
  "observacoes",
  "observaÃ§Ãµes",
  "dados bancarios",
  "dados bancÃ¡rios",
  "forma de pagamento",
  "responsavel pela proposta",
  "responsÃ¡vel pela proposta",
  "valor total",
  "valor",
  "total"
];

const LOOSE_VALUE_STOP_PATTERNS = [
  /\bformato\s+da\s+a\W*o\b\s*:?/i,
  /\bdatas\s+e\s+hor/i,
  /\bservi\W*o\s+contratado\b\s*:?/i,
  /\binvestimento\b/i,
  /\bobserva\W*es\b\s*:?/i,
  /\bdados\s+banc/i,
  /\bforma\s+de\s+pagamento\b\s*:?/i,
  /\brespons\W*vel\s+pela\s+proposta\b\s*:?/i,
  /\bvalor\s+total\b\s*:?/i,
  /\bvalor\b\s*:?/i,
  /\btotal\b\s*:?/i,
  /\br\$\s*[\d\.\,]+/i
];

const LOOSE_LOCAL_LABEL_PATTERNS = [
  /\blocal\s+da\s+festa\s+e\s+ponto\s+de\s+refer(?:\w|\W)*?ncia\b\s*(?::|-)?\s*/i,
  /\blocal\s+da\s+festa\b\s*(?::|-)?\s*/i,
  /\bendere\W*o\b\s*(?::|-)?\s*/i,
  /\blocal\b\s*(?::|-)?\s*/i
];

const LOOSE_LOCAL_PREFIX_PATTERNS = [
  /^local\s+da\s+festa\s+e\s+ponto\s+de\s+refer(?:\w|\W)*?ncia\b\s*/i,
  /^e\s+ponto\s+de\s+refer(?:\w|\W)*?ncia\b\s*/i,
  /^ponto\s+de\s+refer(?:\w|\W)*?ncia\b\s*/i
];

const FORM_LABELS = [
  ...SERVICE_LABELS,
  ...SPACE_LABELS,
  "nome completo do contratante",
  "contratante",
  "cliente",
  ...LOCAL_LABELS,
  "data da festa",
  "data do evento",
  "data",
  "horário",
  "horario",
  "horário do evento",
  "horario do evento",
  "horário que inicia",
  "horario que inicia",
  "início",
  "inicio",
  "aniversariante",
  "tema",
  "extras",
  "quantidade de crianças",
  "quantidade de criancas",
  "número de crianças",
  "numero de criancas",
  "qtd crianças",
  "qtd criancas",
  "faixa etária",
  "faixa etaria",
  "idade",
  "detalhes"
];

function isNotInformed(value) {
  return value === NOT_INFORMED;
}

function emptyIfNotInformed(value) {
  return isNotInformed(value) ? "" : value;
}

function stripLineDecorations(value) {
  return clean(value)
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[\s;|]+$/g, "")
    .trim();
}

function cleanExtractedValue(value) {
  return stripLineDecorations(value)
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[\s;|]+$/g, "")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trimAtNextLooseLabel(value) {
  const current = cleanExtractedValue(value);
  const currentNormalized = normalizeText(current);
  let endIndex = current.length;

  for (const label of LOOSE_VALUE_STOP_LABELS) {
    const labelNormalized = normalizeText(label);
    const pattern = new RegExp(`\\b${escapeRegExp(labelNormalized)}\\b\\s*:?\\s*`, "i");
    const match = pattern.exec(currentNormalized);

    if (match && match.index > 0 && match.index < endIndex) {
      endIndex = match.index;
    }
  }

  for (const pattern of LOOSE_VALUE_STOP_PATTERNS) {
    const match = pattern.exec(currentNormalized);

    if (match && match.index > 0 && match.index < endIndex) {
      endIndex = match.index;
    }
  }

  return cleanExtractedValue(current.slice(0, endIndex));
}

function cleanLooseLocalValue(value) {
  const current = trimAtNextLooseLabel(value);
  const currentNormalized = normalizeText(current);

  for (const pattern of LOOSE_LOCAL_PREFIX_PATTERNS) {
    const match = pattern.exec(currentNormalized);

    if (match) {
      return cleanExtractedValue(current.slice(match[0].length));
    }
  }

  return current;
}

function normalizeFormLine(line) {
  const normalized = normalizeText(stripLineDecorations(line)).replace(/\s+/g, " ");
  return normalized.replace(/[:;.,]+$/g, "").trim();
}

function getInlineValueByLabel(line, labels) {
  const current = stripLineDecorations(line);
  const currentNormalized = normalizeText(current);

  if (labels.some((label) => currentNormalized === normalizeText(label))) {
    return "";
  }

  for (const label of labels) {
    const labelNormalized = normalizeText(label);

    if (currentNormalized.startsWith(labelNormalized + ":")) {
      return cleanExtractedValue(current.slice(current.indexOf(":") + 1));
    }

    if (currentNormalized.startsWith(labelNormalized + " - ")) {
      return cleanExtractedValue(current.slice(label.length + 3));
    }

    if (currentNormalized.startsWith(labelNormalized + " ")) {
      return cleanExtractedValue(current.slice(label.length));
    }
  }

  return "";
}

function getLooseInlineValueByLabel(line, labels) {
  const current = stripLineDecorations(line);
  const currentNormalized = normalizeText(current);

  if (labels === LOCAL_LABELS) {
    for (const pattern of LOOSE_LOCAL_LABEL_PATTERNS) {
      const match = pattern.exec(currentNormalized);

      if (match) {
        return cleanLooseLocalValue(current.slice(match.index + match[0].length));
      }
    }
  }

  for (const label of labels) {
    const labelNormalized = normalizeText(label);
    const pattern = new RegExp(`\\b${escapeRegExp(labelNormalized)}\\b\\s*(?::|-)?\\s+`, "i");
    const match = pattern.exec(currentNormalized);

    if (match) {
      const value = current.slice(match.index + match[0].length);
      return labels === LOCAL_LABELS ? cleanLooseLocalValue(value) : trimAtNextLooseLabel(value);
    }
  }

  return "";
}

function hasInlineLocalValue(line) {
  return Boolean(getInlineValueByLabel(line, LOCAL_LABELS));
}

function isFormInstructionLine(line) {
  if (hasInlineLocalValue(line)) return false;

  const normalized = normalizeFormLine(line);
  if (!normalized) return true;

  return FORM_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isFormLabelLine(line) {
  const normalized = normalizeFormLine(line);
  return FORM_LABELS.some((label) => normalized === normalizeText(label));
}

function isUsefulLooseValue(line) {
  const cleaned = cleanExtractedValue(line);
  return Boolean(cleaned) && !isFormInstructionLine(cleaned) && !isFormLabelLine(cleaned);
}

function normalizeLooseContractInput(text) {
  let current = String(text || "")
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, "")
    .replace(/[•◦‣⁃∙·\uFFFD]+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

  const labelPatterns = [
    /nome\s+completo\s+do\s+contratante(?:\s*:)?/gi,
    /local\s+da\s+festa\s+e\s+ponto\s+de\s+refer\S*ncia(?:\s*:)?/gi,
    /local\s+da\s+festa(?:\s*:)?/gi,
    /data\s+da\s+festa(?:\s*:)?/gi,
    /hor\S*rio\s+que\s+inicia(?:\s*:)?/gi,
    /detalhes\s+que\s+(?:seja|sejam|seria)\s+importante\s+mencionar[^:]*:/gi,
    /qual\s+o\s+servi\S*o\s+contratado\s*\??/gi,
    /\bvalor(?:\s*:)?/gi,
    /\btotal(?:\s*:)?(?=\s*(?:r\$|\d))/gi
  ];

  for (const pattern of labelPatterns) {
    current = current.replace(pattern, (match, offset, source) => {
      const previous = offset > 0 ? source[offset - 1] : "\n";
      const prefix = previous === "\n" ? "" : "\n";
      return `${prefix}${match.trim()}`;
    });
  }

  return current
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function sanitizeLooseText(text) {
  return String(text || "")
    .split("\n")
    .map(stripLineDecorations)
    .filter((line) => line && !isFormInstructionLine(line))
    .join("\n")
    .trim();
}

function normalizedIncludesAny(normalizedText, aliases) {
  return aliases.some((alias) => normalizedText.includes(normalizeText(alias)));
}

function isValueSummaryLine(line) {
  const normalizedLine = normalizeText(line);
  return VALUE_SUMMARY_LABELS.some((label) => normalizedLine.startsWith(label));
}

function findLineStartingWith(lines, label) {
  return lines.find((line) => normalizeText(line).startsWith(label)) || "";
}

function normalizeSpaceCandidate(value) {
  return value === "medio" ? "médio" : value;
}

function extractSpaceCandidate(text) {
  const normalized = normalizeText(text);

  for (const item of SPACE_CANDIDATES) {
    if (normalized.includes(normalizeText(item))) {
      return normalizeSpaceCandidate(item);
    }
  }

  return "";
}

function buildHorarioFromSource(source) {
  const times = extractTimes(source);
  const inicio = times[0] ? padTime(times[0]) : NOT_INFORMED;
  const fim = !isNotInformed(inicio) ? addHours(inicio, 3) : NOT_INFORMED;
  const chegada = !isNotInformed(inicio) ? subtractMinutes(inicio, 20) : NOT_INFORMED;

  return {
    horario_inicio: inicio,
    horario_fim: fim,
    horario_chegada: chegada
  };
}

function buildParsedResponse(fields) {
  const extracted = {
    ...fields,
    contratante: fields.nome_contratante,
    local_evento: fields.local,
    quantidade_criancas: fields.qtd_criancas,
    texto_original: fields.texto_original
  };

  return {
    extracted,
    preview: extracted
  };
}

function extractSection(text, startLabel, endLabels = []) {
  const rawLines = String(text || "").split("\n");
  const normalizedStart = normalizeText(startLabel);
  const normalizedEnds = endLabels.map(normalizeText);

  let startIndex = -1;
  let endIndex = rawLines.length;

  for (let i = 0; i < rawLines.length; i++) {
    const current = normalizeText(rawLines[i]);
    if (current === normalizedStart) {
      startIndex = i + 1;
      break;
    }
  }

  if (startIndex === -1) return "";

  for (let i = startIndex; i < rawLines.length; i++) {
    const current = normalizeText(rawLines[i]);
    if (normalizedEnds.includes(current)) {
      endIndex = i;
      break;
    }
  }

  return rawLines.slice(startIndex, endIndex).join("\n").trim();
}

function pickByLabel(text, labels) {
  const lines = splitLines(text);

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const currentNormalized = normalizeText(current);

    for (const label of labels) {
      const labelNormalized = normalizeText(label);

      if (currentNormalized === labelNormalized) {
        const nextLine = lines[i + 1];
        if (nextLine) return clean(nextLine);
      }

      if (currentNormalized.startsWith(labelNormalized + ":")) {
        const rest = current.slice(current.indexOf(":") + 1).trim();
        if (rest) return clean(rest);
      }

      if (currentNormalized.startsWith(labelNormalized + " ")) {
        const rest = current.slice(label.length).trim();
        if (rest) return clean(rest);
      }
    }
  }

  return "";
}

function pickLooseByLabel(text, labels) {
  const lines = splitLines(text).map(stripLineDecorations);

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    if (isFormInstructionLine(current)) continue;

    const currentNormalized = normalizeText(current);

    for (const label of labels) {
      const labelNormalized = normalizeText(label);

      if (currentNormalized === labelNormalized || currentNormalized === labelNormalized + ":") {
        for (let j = i + 1; j < lines.length; j++) {
          if (isUsefulLooseValue(lines[j])) return cleanExtractedValue(lines[j]);
          if (isFormLabelLine(lines[j])) break;
        }
      }

      if (currentNormalized.startsWith(labelNormalized + ":")) {
        const rest = current.slice(current.indexOf(":") + 1);
        if (isUsefulLooseValue(rest)) return cleanExtractedValue(rest);
      }

      if (currentNormalized.startsWith(labelNormalized + " ")) {
        const rest = current.slice(label.length);
        if (isUsefulLooseValue(rest)) return cleanExtractedValue(rest);
      }
    }
  }

  return "";
}

/** Meses por extenso (após normalizeText: março → marco). */
function monthNameToNumber(token) {
  const map = {
    janeiro: 1,
    fevereiro: 2,
    marco: 3,
    abril: 4,
    maio: 5,
    junho: 6,
    julho: 7,
    agosto: 8,
    setembro: 9,
    outubro: 10,
    novembro: 11,
    dezembro: 12
  };
  const k = normalizeText(String(token || ""));
  return map[k] || null;
}

/**
 * Extrai data no formato "26 de abril", "26 de abril de 2026", "3 de maio".
 * Retorna "DD/M/M" ou "DD/M/M/AAAA" para normalizeDate completar ano se faltar.
 */
function extractPortugueseExtendedDate(value) {
  if (!value) return "";
  const raw = String(value)
    .replace(/^[\s:–—\-]+/u, "")
    .trim();
  const monthRe =
    "(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)";
  const anchored = new RegExp(`^(\\d{1,2})\\s+de\\s+${monthRe}(?:\\s+de\\s+(\\d{4}))?`, "i");
  const embedded = new RegExp(`\\b(\\d{1,2})\\s+de\\s+${monthRe}(?:\\s+de\\s+(\\d{4}))?\\b`, "i");

  let m = raw.match(anchored);
  if (!m) m = raw.match(embedded);
  if (!m) m = String(value).match(embedded);
  if (!m) return "";

  const dia = Number(m[1]);
  const mesNum = monthNameToNumber(m[2]);
  if (!mesNum || dia < 1 || dia > 31) return "";

  const ano = m[3] ? String(m[3]) : "";
  const dd = String(dia);
  const mm = String(mesNum);
  if (ano) return `${dd}/${mm}/${ano}`;
  return `${dd}/${mm}`;
}

function extractFirstDate(value) {
  if (!value) return "";

  let match = String(value).match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (match) return `${match[1]}/${match[2]}/${match[3]}`;

  match = String(value).match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (match) return `${match[1]}/${match[2]}`;

  const ext = extractPortugueseExtendedDate(value);
  if (ext) return ext;

  return "";
}

function normalizeDate(value) {
  const dateStr = extractFirstDate(value);
  if (!dateStr) return NOT_INFORMED;

  const parts = dateStr.split("/");
  if (parts.length < 2) return NOT_INFORMED;

  let dia = parts[0] || "";
  let mes = parts[1] || "";
  let ano = parts[2] || "";

  const currentYear = new Date().getFullYear();

  dia = String(dia).padStart(2, "0");
  mes = String(mes).padStart(2, "0");

  if (!ano) {
    ano = String(currentYear);
  } else if (String(ano).length === 2) {
    ano = "20" + String(ano);
  } else {
    ano = String(ano);
  }

  return `${dia}/${mes}/${ano}`;
}

function calculateWeekday(value) {
  const dateStr = normalizeDate(value);
  if (isNotInformed(dateStr)) return NOT_INFORMED;

  try {
    const [dia, mes, ano] = dateStr.split("/");
    const data = new Date(Number(ano), Number(mes) - 1, Number(dia));

    const diasSemana = [
      "domingo",
      "segunda-feira",
      "terça-feira",
      "quarta-feira",
      "quinta-feira",
      "sexta-feira",
      "sábado"
    ];

    return diasSemana[data.getDay()] || NOT_INFORMED;
  } catch {
    return NOT_INFORMED;
  }
}
function normalizeHourToken(token, fullSourceText = "") {
  if (!token) return "";

  let raw = String(token).trim();
  let value = raw
    .toLowerCase()
    .replace(/\s/g, "")
    .replace("hrs", "h")
    .replace("hr", "h");

  const sourceNormalized = normalizeText(fullSourceText);

  const hasMorningHint =
    sourceNormalized.includes("manha") ||
    sourceNormalized.includes("manhã") ||
    sourceNormalized.includes("am");

  const hasAfternoonHint =
    sourceNormalized.includes("tarde") ||
    sourceNormalized.includes("noite") ||
    sourceNormalized.includes("pm");

  function adjustHour(hour) {
    let h = Number(hour);

    if (Number.isNaN(h)) return null;

    if (!hasMorningHint) {
      if (hasAfternoonHint && h >= 1 && h <= 11) {
        h += 12;
      } else if (h >= 1 && h <= 7) {
        h += 12;
      }
    }

    if (h < 0 || h > 23) return null;
    return h;
  }

  if (/^\d{1,2}h$/.test(value)) {
    const h = adjustHour(value.replace("h", ""));
    if (h === null) return "";
    return `${String(h).padStart(2, "0")}:00`;
  }

  if (/^\d{1,2}:\d{2}h$/.test(value)) {
    value = value.replace(/h$/, "");
  }

  if (/^\d{1,2}:\d{2}$/.test(value)) {
    const [hour, minute] = value.split(":");
    const h = adjustHour(hour);
    if (h === null) return "";
    return `${String(h).padStart(2, "0")}:${minute}`;
  }

  return "";
}

function extractTimes(value) {
  if (!value) return [];

  const normalized = String(value)
    .replace(/às/gi, " as ")
    .replace(/\s+/g, " ");

  const matches = normalized.match(/\b\d{1,2}(?::\d{2})?\s*h\b|\b\d{1,2}:\d{2}\b/gi) || [];

  return matches
    .map((item) => normalizeHourToken(item, value))
    .filter(Boolean);
}

function padTime(value) {
  const normalized = normalizeHourToken(value, value) || value;
  const parts = String(normalized || "").split(":");

  if (parts.length !== 2) return NOT_INFORMED;

  const hora = String(parts[0]).padStart(2, "0");
  const minuto = String(parts[1]).padStart(2, "0");

  if (Number.isNaN(Number(hora)) || Number.isNaN(Number(minuto))) {
    return NOT_INFORMED;
  }

  return `${hora}:${minuto}`;
}

function subtractMinutes(timeStr, minutesToSubtract) {
  const normalized = padTime(timeStr);
  if (isNotInformed(normalized)) return NOT_INFORMED;

  const [h, m] = normalized.split(":").map(Number);
  const total = h * 60 + m - minutesToSubtract;
  const adjusted = total < 0 ? total + 24 * 60 : total;

  const hour = Math.floor(adjusted / 60) % 24;
  const minute = adjusted % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function addHours(timeStr, hoursToAdd) {
  const normalized = padTime(timeStr);
  if (isNotInformed(normalized)) return NOT_INFORMED;

  const [h, m] = normalized.split(":").map(Number);
  const total = h * 60 + m + hoursToAdd * 60;

  const hour = Math.floor(total / 60) % 24;
  const minute = total % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeFaixaEtaria(value) {
  if (!value) return NOT_INFORMED;

  const str = String(value).trim();

  let match = str.match(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*anos?)?/i);
  if (match) return `${Number(match[1])} a ${Number(match[2])} anos`;

  match = str.match(/de\s*(\d{1,2})\s+e\s*(\d{1,2})(?:\s*anos?)?/i);
  if (match) return `${Number(match[1])} a ${Number(match[2])} anos`;

  match = str.match(/(\d{1,2})\s+e\s*(\d{1,2})(?:\s*anos?)?/i);
  if (match) return `${Number(match[1])} a ${Number(match[2])} anos`;

  match = str.match(/de\s*(\d{1,2})\s*a\s*(\d{1,2})(?:\s*anos?)?/i);
  if (match) return `${Number(match[1])} a ${Number(match[2])} anos`;

  match = str.match(/(\d{1,2})\s*a\s*(\d{1,2})(?:\s*anos?)?/i);
  if (match) return `${Number(match[1])} a ${Number(match[2])} anos`;

  match = str.match(/(\d{1,2})(?:\s*anos?)?/i);
  if (match) return `${Number(match[1])} anos`;

  return str;
}

function parseMoneyToNumber(value) {
  if (!value) return null;

  const cleaned = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const number = Number(cleaned);
  return Number.isNaN(number) ? null : number;
}

function extractMoneyFromLine(line) {
  if (!line) return null;
  const match = String(line).match(/r\$\s*([\d\.\,]+)/i);
  if (!match) return null;
  return parseMoneyToNumber(match[1]);
}

function extractLabeledMoneyFromLine(line) {
  if (!line) return null;

  const normalized = normalizeText(line).replace(/\s+/g, " ");
  if (!/^(?:valor(?:\s+total)?|total)\b/.test(normalized)) return null;

  const match = String(line).match(/\b(?:valor(?:\s+total)?|total)\b\s*:?\s*(?:r\$\s*)?(\d{1,6}(?:[.,]\d{2})?)(?:\s*reais?)?/i);
  return match ? parseMoneyToNumber(match[1]) : extractMoneyFromLine(line);
}

function extractTotalMoneyFromLine(line) {
  return extractMoneyFromLine(line) ?? extractLabeledMoneyFromLine(line);
}

function extractTrailingMoneyValue(value) {
  if (!value) return null;

  const match = String(value).match(
    /(?:\b(?:valor|total)\b\s*:?\s*(?:r\$\s*)?(\d{1,6}(?:[.,]\d{2})?)(?:\s*reais?)?|r\$\s*(\d{1,6}(?:[.,]\d{2})?)|(\d{1,6}[.,]\d{2})|(\d{1,6})\s*reais?)\s*$/i
  );

  if (!match) return null;
  return parseMoneyToNumber(match[1] || match[2] || match[3] || match[4]);
}

function extractIsolatedMoneyValue(line) {
  const cleaned = cleanExtractedValue(line);
  if (!/^\d{2,5}(?:[.,]\d{2})?$/.test(cleaned)) return null;
  return parseMoneyToNumber(cleaned);
}

function findServiceLineIndex(lines, servicoContratado) {
  const serviceNormalized = normalizeText(servicoContratado);
  if (!serviceNormalized || isNotInformed(servicoContratado)) return -1;

  return lines.findIndex((line) => {
    const normalizedLine = normalizeText(cleanExtractedValue(line));
    return normalizedLine === serviceNormalized || normalizedLine.includes(serviceNormalized);
  });
}

function inferDefaultItems(servicoContratado, extras, valorTotal) {
  if (valorTotal > 0) {
    return [
      {
        descricao:
          servicoContratado && !isNotInformed(servicoContratado)
            ? servicoContratado
            : "Serviço de recreação",
        valor: valorTotal
      }
    ];
  }

  const items = [];
  const servicoNormalizado = normalizeText(servicoContratado);
  const extrasNormalizado = normalizeText(extras);

  if (servicoNormalizado.includes("1 recreador") || servicoNormalizado.includes("01 recreador")) {
    items.push({ descricao: servicoContratado, valor: 300 });
  } else if (servicoNormalizado.includes("2 recreadores") || servicoNormalizado.includes("02 recreadores")) {
    items.push({ descricao: servicoContratado, valor: 500 });
  } else if (servicoNormalizado.includes("3 recreadores") || servicoNormalizado.includes("03 recreadores")) {
    items.push({ descricao: servicoContratado, valor: 710 });
  }

  for (const extra of EXTRA_DEFINITIONS) {
    if (normalizedIncludesAny(extrasNormalizado, extra.aliases)) {
      items.push({ descricao: extra.itemDescricao, valor: extra.valor });
    }
  }

  return items;
}

function extractQuantidadeCriancas(text) {
  const labeled = pickLooseByLabel(text, [
    "quantidade de crianças",
    "quantidade de criancas",
    "número de crianças",
    "numero de criancas",
    "qtd crianças",
    "qtd criancas",
    "qtd",
    "quantidade",
    "convidados",
    "participantes"
  ]);

  if (labeled) {
    const rangeMatch = normalizeText(labeled).match(/\b(\d{1,3})\s*a\s*(\d{1,3})\b/i);
    if (rangeMatch) return `${rangeMatch[1]} a ${rangeMatch[2]}`;

    const match = labeled.match(/\d+/);
    return match ? match[0] : labeled;
  }

  const normalized = normalizeText(text);
  let generic = normalized.match(/\b(\d{1,3})\s*a\s*(\d{1,3})\s+(?:crian.as?|convidados?|participantes?)\b/i);
  if (generic) return `${generic[1]} a ${generic[2]}`;

  generic = normalized.match(/\b(\d{1,3})\s+(?:crian.as?|convidados?|participantes?)\b/i);
  if (generic) return generic[1];

  generic = normalized.match(/\b(?:qtd|quantidade)\s*:?\s*(\d{1,3})(?:\s*a\s*(\d{1,3}))?\b/i);
  if (generic) return generic[2] ? `${generic[1]} a ${generic[2]}` : generic[1];

  generic = normalized.match(/\b(\d{1,3})\s+com\s+idade\b/i);
  return generic ? generic[1] : NOT_INFORMED;
}

function extractFaixaEtaria(detailsText) {
  const labeled = pickLooseByLabel(detailsText, [
    "faixa etária",
    "faixa etaria",
    "idade"
  ]);

  if (labeled) return normalizeFaixaEtaria(labeled);

  const info = pickByLabel(detailsText, ["informações", "informacoes"]) || detailsText;

  let match = info.match(/faixa\s+et[aá]ria\s*:?\s*([^.]+?)(?:\.|$)/i);
  if (match) return normalizeFaixaEtaria(match[1]);

  const infoWithoutFullDates = info
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, " ")
    .replace(/\b\d{1,3}\s*a\s*\d{1,3}\s+(?:crian.as?|convidados?|participantes?)\b/gi, " ")
    .replace(/\b\d{1,3}\s+(?:crian.as?|convidados?|participantes?)\b/gi, " ");

  match = infoWithoutFullDates.match(/idade\s+entre\s+(\d{1,2})\s*a\s*(\d{1,2})(?:\s*anos?)?.*demais\s+de\s+(\d{1,2})\s*a\s*(\d{1,2})(?:\s*anos?)?/i);
  if (match) return `${Number(match[1])} a ${Number(match[2])} anos e ${Number(match[3])} a ${Number(match[4])} anos`;

  match = infoWithoutFullDates.match(/(?:faixa\s+et[aá]ria|idade)?\s*:?\s*(?:de\s*)?(\d{1,2})\s*(?:a|\/)\s*(\d{1,2})\s*anos?\b/i);
  if (match) return `${Number(match[1])} a ${Number(match[2])} anos`;

  match = infoWithoutFullDates.match(/(?:faixa\s+et[aá]ria|idade)?\s*:?\s*(\d{1,2})\s*anos?\b/i);
  if (match) return `${Number(match[1])} anos`;

  return NOT_INFORMED;
}

function extractAniversariante(detailsText) {
  const labeled = pickByLabel(detailsText, ["aniversariante"]);
  if (labeled) return titleCase(labeled);

  const info = pickByLabel(detailsText, ["informações", "informacoes"]) || detailsText;
  const match = info.match(/aniversariante\s*:?\s*([^.]+?)(?:\.|$)/i);
  if (match) return titleCase(match[1].trim());

  return NOT_INFORMED;
}

function extractTema(detailsText) {
  const labeled = pickByLabel(detailsText, ["tema"]);
  if (labeled) return titleCase(labeled);

  const info = pickByLabel(detailsText, ["informações", "informacoes"]) || detailsText;
  const match = info.match(/tema\s*:?\s*([^.]+?)(?:\.|$)/i);
  if (match) return titleCase(match[1].trim());

  return NOT_INFORMED;
}

function extractEspaco(detailsText) {
  const labeled = pickByLabel(detailsText, SPACE_LABELS);

  if (labeled) return labeled;

  const info = pickByLabel(detailsText, ["informações", "informacoes"]) || detailsText;
  const match = info.match(/espa[çc]o\s*:?\s*([^.]+?)(?:\.|$)/i);
  if (match) return match[1].trim();

  return extractSpaceCandidate(detailsText) || NOT_INFORMED;
}

function extractExtras(detailsText) {
  const labeled = pickByLabel(detailsText, ["extras"]);
  if (labeled) return labeled;

  const normalized = normalizeText(detailsText);
  const encontrados = [];

  for (const extra of EXTRA_DEFINITIONS) {
    if (normalizedIncludesAny(normalized, extra.aliases)) {
      encontrados.push(extra.label);
    }
  }

  const oficinaMatch = String(detailsText).match(/oficina\s+de\s+([^\n\r,.;]+)/i);
  if (oficinaMatch) {
    encontrados.push(`oficina de ${oficinaMatch[1].trim()}`);
  }

  if (!encontrados.length) return NO_EXTRAS;
  return encontrados.join(", ");
}

function normalizeServico(value) {
  if (!value || isNotInformed(value)) return value;

  return String(value)
    .replace(/recriador/gi, "recreador")
    .replace(/recriação/gi, "recreação")
    .replace(/recriacao/gi, "recreação");
}

function stripServiceQuestionPrefix(value) {
  let current = cleanExtractedValue(value);
  const normalized = normalizeText(current).replace(/\s+/g, " ");
  const questionIndex = normalized.indexOf("contratado?");
  const prefixes = [
    "qual o servico contratado?",
    "qual servico contratado?",
    "servico contratado?",
    "qual o servico contratado",
    "qual servico contratado",
    "servico contratado"
  ];

  if (questionIndex >= 0 && questionIndex <= 40) {
    current = current.slice(questionIndex + "contratado?".length);
  } else {
    for (const prefix of prefixes) {
      if (normalized.startsWith(prefix)) {
        current = current.slice(prefix.length);
        break;
      }
    }
  }

  return trimAtNextLooseLabel(
    current
      .replace(/^\s*(?:qual\s+)?(?:o\s+)?servi\S*o(?:\s+contratado)?\s*[:?\-]?\s*/i, "")
      .replace(/^[:?\s-]+/, "")
  );
}

function stripTrailingMoneyFromService(value) {
  return cleanExtractedValue(
    String(value || "").replace(
      /\s+(?:\b(?:valor|total)\b\s*:?\s*(?:r\$\s*)?\d{1,6}(?:[.,]\d{2})?(?:\s*reais?)?|r\$\s*\d{1,6}(?:[.,]\d{2})?|\d{1,6}[.,]\d{2}|\d{1,6}\s*reais?)\s*$/i,
      ""
    )
  );
}

function cleanServico(value) {
  return normalizeServico(stripTrailingMoneyFromService(stripServiceQuestionPrefix(value)));
}

function extractValores(valuesText, servicoContratado, extras) {
  const lines = splitLines(valuesText);

  const valorTotalLine =
    findLineStartingWith(lines, "valor total") ||
    findLineStartingWith(lines, "valor") ||
    findLineStartingWith(lines, "total");
  const entradaLine = findLineStartingWith(lines, "entrada");
  const saldoLine = findLineStartingWith(lines, "saldo");

  const valorTotal = extractTotalMoneyFromLine(valorTotalLine) || 0;
  const entrada = extractMoneyFromLine(entradaLine) || (valorTotal > 0 ? valorTotal / 2 : 0);
  const saldo = extractMoneyFromLine(saldoLine) || (valorTotal > 0 ? valorTotal / 2 : 0);

  let itensValores = [];

  const itensHeaderIndex = lines.findIndex(
    (line) => normalizeText(line) === "itens discriminados"
  );

  if (itensHeaderIndex >= 0) {
    for (let i = itensHeaderIndex + 1; i < lines.length; i++) {
      const line = lines[i];

      if (!line.trim()) continue;

      if (isValueSummaryLine(line)) {
        break;
      }

      const valor = extractMoneyFromLine(line);
      if (valor === null) continue;

      let descricao = line
        .replace(/r\$\s*[\d\.\,]+/i, "")
        .replace(/[–—-]+/g, " ")
        .trim();

      if (!descricao) {
        descricao =
          servicoContratado && !isNotInformed(servicoContratado)
            ? servicoContratado
            : "Serviço de recreação";
      }

      itensValores.push({
        descricao,
        valor
      });
    }
  }

  if (!itensValores.length) {
    itensValores = inferDefaultItems(servicoContratado, extras, valorTotal);
  }

  return {
    itens_valores: itensValores,
    valor_total: valorTotal,
    entrada,
    saldo
  };
}

function hasStructuredSections(text) {
  const normalized = normalizeText(text);
  return (
    normalized.includes("dados do evento") &&
    normalized.includes("detalhes do evento")
  );
}

function extractLooseName(text) {
  const lines = splitLines(text);

  const labeled =
    pickLooseByLabel(text, [
      "nome completo do contratante",
      "contratante",
      "cliente"
    ]) || "";

  if (labeled) return titleCase(labeled);

  for (const line of lines) {
    const cleaned = cleanExtractedValue(line);
    const normalized = normalizeText(cleaned);

    if (
      isUsefulLooseValue(cleaned) &&
      !normalized.includes("local") &&
      !normalized.includes("data") &&
      !normalized.includes("horario") &&
      !normalized.includes("horário") &&
      !normalized.includes("servico") &&
      !normalized.includes("serviço") &&
      !normalized.includes("tema") &&
      !normalized.includes("aniversariante") &&
      !normalized.includes("criancas") &&
      !normalized.includes("crianças") &&
      !normalized.includes("faixa etaria") &&
      !normalized.includes("faixa etária") &&
      !normalized.includes("extras") &&
      !normalized.includes("r$")
    ) {
      if (cleaned.length >= 5 && cleaned.length <= 80) {
        return titleCase(cleaned);
      }
    }
  }

  return NOT_INFORMED;
}

/** Linha cujo rótulo é campo de espaço (evita confundir com serviço por conter "recreação"). */
function lineLooksLikeSpaceField(line) {
  const currentNormalized = normalizeText(stripLineDecorations(line));
  for (const label of SPACE_LABELS) {
    const labelNormalized = normalizeText(label);
    if (
      currentNormalized === labelNormalized ||
      currentNormalized === labelNormalized + ":" ||
      currentNormalized.startsWith(labelNormalized + ":") ||
      currentNormalized.startsWith(labelNormalized + " ")
    ) {
      return true;
    }
  }
  return false;
}

function extractLooseLocal(text) {
  const lines = splitLines(text);

  for (const line of lines) {
    const inlineLocal = getLooseInlineValueByLabel(line, LOCAL_LABELS) || getInlineValueByLabel(line, LOCAL_LABELS);
    if (inlineLocal && isUsefulLooseValue(inlineLocal)) return inlineLocal;
  }

  const labeled = pickLooseByLabel(text, LOCAL_LABELS) || "";

  if (labeled) return cleanLooseLocalValue(labeled);

  for (const line of lines) {
    const cleaned = cleanExtractedValue(line);
    const normalized = normalizeText(cleaned);

    if (
      normalized.includes("rua ") ||
      normalized.includes("avenida ") ||
      normalized.includes("av. ") ||
      normalized.includes("travessa ") ||
      normalized.includes("estrada ") ||
      normalized.includes("condominio ") ||
      normalized.includes("condomínio ")
    ) {
      return cleaned;
    }
  }

  return NOT_INFORMED;
}

function extractLooseService(text) {
  const labeled =
    pickLooseByLabel(text, SERVICE_LABELS) || "";

  if (labeled) return cleanServico(labeled);

  const lines = splitLines(text);
  for (let i = 0; i < lines.length; i++) {
    const cleaned = cleanExtractedValue(lines[i]);
    const normalized = normalizeText(cleaned);

    if (/^qual\s+(?:o\s+)?servico\s+contratado\??$/i.test(normalized)) {
      for (let j = i + 1; j < lines.length; j++) {
        const next = cleanExtractedValue(lines[j]);
        const nextNormalized = normalizeText(next);

        if (!isUsefulLooseValue(next)) continue;
        if (extractIsolatedMoneyValue(next) !== null || extractTrailingMoneyValue(next) !== null) break;
        if (nextNormalized.startsWith("valor") || nextNormalized.startsWith("total")) break;
        if (isFormLabelLine(next)) break;

        const service = cleanServico(next);
        if (service) return service;
      }
    }
  }

  for (const line of lines) {
    if (lineLooksLikeSpaceField(line)) continue;

    const cleaned = cleanExtractedValue(line);
    const normalized = normalizeText(cleaned);
    if (
      isUsefulLooseValue(cleaned) &&
      !normalized.includes("detalhes que") &&
      !normalized.includes("quantidade de criancas") &&
      !normalized.includes("faixa etaria") &&
      !normalized.includes("aniversariante") &&
      !normalized.includes("tema") &&
      (
        normalized.includes("contratado") ||
        normalized.includes("recreador") ||
        normalized.includes("recreacao") ||
        normalized.includes("recreação")
      )
    ) {
      const service = cleanServico(cleaned);
      if (service) return service;
    }
  }

  return NOT_INFORMED;
}

function extractLooseData(text) {
  const labeled =
    pickLooseByLabel(text, [
      "data da festa",
      "data do evento",
      "data"
    ]) || "";

  if (labeled) return normalizeDate(labeled);

  return normalizeDate(extractFirstDate(text));
}

function extractLooseHorario(text) {
  const labeled =
    pickLooseByLabel(text, [
      "horário",
      "horario",
      "horário do evento",
      "horario do evento",
      "horário que inicia",
      "horario que inicia",
      "início",
      "inicio"
    ]) || "";

  const source = labeled || text;
  return buildHorarioFromSource(source);
}

function extractLooseTemaAniversarianteEspaco(text) {
  const lines = splitLines(text);

  for (const line of lines) {
    const cleaned = cleanExtractedValue(line);
    const match = cleaned.match(
      /\btema\s*:?\s*([^\n\r.;]+?)\s*[-–—]\s*([^\n\r.;-]*?\b\d{1,2}\s*anos?)\s*[-–—]\s*espa\S*o\s*:?\s*([^\n\r.;]+)/iu
    );

    if (!match) continue;

    return {
      tema: titleCase(match[1]),
      aniversariante: titleCase(match[2]),
      espaco: titleCase(match[3])
    };
  }

  return {};
}

function extractLooseTema(text) {
  const labeled = pickLooseByLabel(text, ["tema"]);
  if (labeled) return titleCase(labeled);

  const match = text.match(/tema\s*:?\s*([^\n\r.]+)/i);
  if (match && isUsefulLooseValue(match[1])) return titleCase(match[1]);

  return NOT_INFORMED;
}

function extractLooseAniversariante(text) {
  const labeled = pickLooseByLabel(text, ["aniversariante"]);
  if (labeled) return titleCase(labeled);

  const match = text.match(/aniversariante\s*:?\s*([^\n\r.]+)/i);
  if (match && isUsefulLooseValue(match[1])) return titleCase(match[1]);

  const lines = splitLines(text);
  for (const line of lines) {
    const cleaned = cleanExtractedValue(line);
    const normalized = normalizeText(cleaned);

    if (
      isUsefulLooseValue(cleaned) &&
      /\p{L}{2,}.*\b\d{1,2}\s*anos?\b/iu.test(cleaned) &&
      /\b\d{1,2}\s*anos?\b/i.test(cleaned) &&
      !normalized.includes("idade entre") &&
      !normalized.includes("crianca") &&
      !normalized.includes("crian") &&
      !/^\d{1,2}\s*(?:a|\/)\s*\d{1,2}\s*anos?$/i.test(normalized) &&
      !normalized.includes("faixa")
    ) {
      return titleCase(cleaned);
    }
  }

  return NOT_INFORMED;
}

function extractLooseEspaco(text) {
  const labeled = pickLooseByLabel(text, SPACE_LABELS);

  if (labeled) return labeled;

  return extractSpaceCandidate(text) || NOT_INFORMED;
}

function extractLooseInformacoes(originalText, looseText) {
  const originalLines = splitLines(originalText);

  for (const line of originalLines) {
    const cleanedLine = stripLineDecorations(line);
    const normalized = normalizeText(cleanedLine);
    if (!normalized.startsWith("detalhes que")) continue;

    const parts = String(cleanedLine).split(":");
    const value = parts.length > 1 ? parts[parts.length - 1] : "";
    if (isUsefulLooseValue(value)) return cleanExtractedValue(value);
  }

  const lines = splitLines(looseText);
  for (const line of lines) {
    const cleaned = cleanExtractedValue(line);
    const normalized = normalizeText(cleaned);

    if (
      isUsefulLooseValue(cleaned) &&
      !normalized.includes("contratado") &&
      !normalized.includes("servico contratado") &&
      !normalized.includes("servico") &&
      !normalized.includes("local") &&
      !normalized.includes("endereco") &&
      !normalized.includes("data") &&
      !normalized.includes("horario") &&
      !normalized.includes("valor") &&
      !normalized.includes("total") &&
      !/^r\$\s*/i.test(cleaned) &&
      extractIsolatedMoneyValue(cleaned) === null &&
      (
        normalized.includes("evento") ||
        normalized.includes("corporativo") ||
        normalized.includes("adult") ||
        normalized.includes("pessoas") ||
        normalized.includes("crianca") ||
        normalized.includes("crian") ||
        normalized.includes("faixa") ||
        normalized.includes("idade") ||
        normalized.includes("tema") ||
        normalized.includes("espaco")
      )
    ) {
      return cleaned;
    }
  }

  return "";
}

function removeDuplicateEspacoFromInformacoes(informacoes, espaco) {
  if (!informacoes || !espaco || isNotInformed(espaco)) return informacoes;

  const espacoPattern = escapeRegExp(String(espaco).trim()).replace(/\s+/g, "\\s+");
  const cleaned = String(informacoes)
    .replace(
      new RegExp(`(?:\\s*[-–—,.;:]\\s*)?\\bespa\\S*o(?:\\s+da\\s+recrea\\S*o)?\\s*[:\\-]?\\s*${espacoPattern}\\b`, "iu"),
      ""
    )
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[-–—]\s*$/g, "")
    .trim();

  return cleanExtractedValue(cleaned);
}

function extractLooseValues(text, servicoContratado, extras) {
  const lines = splitLines(text);
  const valorTotalLine =
    findLineStartingWith(lines, "valor total") ||
    findLineStartingWith(lines, "valor") ||
    findLineStartingWith(lines, "total");
  const entradaLine = findLineStartingWith(lines, "entrada");
  const saldoLine = findLineStartingWith(lines, "saldo");

  let valorTotal = extractTotalMoneyFromLine(valorTotalLine) || 0;
  let entrada = extractMoneyFromLine(entradaLine) || 0;
  let saldo = extractMoneyFromLine(saldoLine) || 0;

  if (!valorTotal) {
    for (const line of lines) {
      const labeledValue = extractLabeledMoneyFromLine(line);
      if (labeledValue !== null) {
        valorTotal = labeledValue;
        break;
      }
    }
  }

  if (!valorTotal) {
    const moneyMatches = String(text).match(/r\$\s*[\d\.\,]+/gi) || [];
    if (moneyMatches.length > 0) {
      const values = moneyMatches
        .map((item) => parseMoneyToNumber(item))
        .filter((n) => n !== null);

      if (values.length > 0) {
        valorTotal = Math.max(...values);
      }
    }
  }

  if (!valorTotal) {
    const serviceLineIndex = findServiceLineIndex(lines, servicoContratado);
    if (serviceLineIndex >= 0) {
      const serviceLineValue = extractTrailingMoneyValue(lines[serviceLineIndex]);
      if (serviceLineValue !== null) {
        valorTotal = serviceLineValue;
      }

      const nearbyLines = lines.slice(serviceLineIndex + 1, serviceLineIndex + 3);
      for (const line of nearbyLines) {
        if (valorTotal) break;

        const isolatedValue = extractIsolatedMoneyValue(line);
        if (isolatedValue !== null) {
          valorTotal = isolatedValue;
          break;
        }
      }
    }
  }

  if (!entrada && valorTotal) entrada = valorTotal / 2;
  if (!saldo && valorTotal) saldo = valorTotal / 2;

  const itens = inferDefaultItems(servicoContratado, extras, valorTotal);

  return {
    itens_valores: itens,
    valor_total: valorTotal,
    entrada,
    saldo
  };
}

function parseLooseContractText(text) {
  const safeText = clean(text);
  const normalizedLooseText = normalizeLooseContractInput(safeText) || safeText;
  const looseText = sanitizeLooseText(normalizedLooseText) || normalizedLooseText;

  const nomeContratante = extractLooseName(looseText);
  const local = extractLooseLocal(looseText);
  const dataEvento = extractLooseData(looseText);
  const diaSemana = calculateWeekday(dataEvento);

  const horario = extractLooseHorario(looseText);

  const temaAniversarianteEspaco = extractLooseTemaAniversarianteEspaco(looseText);
  const qtdCriancas = emptyIfNotInformed(extractQuantidadeCriancas(looseText));
  const faixaEtaria = emptyIfNotInformed(extractFaixaEtaria(looseText));
  const aniversariante = emptyIfNotInformed(
    temaAniversarianteEspaco.aniversariante || extractLooseAniversariante(looseText)
  );
  const tema = emptyIfNotInformed(temaAniversarianteEspaco.tema || extractLooseTema(looseText));
  const espaco = emptyIfNotInformed(temaAniversarianteEspaco.espaco || extractLooseEspaco(looseText));
  const servicoContratado = extractLooseService(looseText);
  const extras = extractExtras(looseText);
  const informacoes = removeDuplicateEspacoFromInformacoes(
    extractLooseInformacoes(normalizedLooseText, looseText),
    espaco
  );

  const valores = extractLooseValues(looseText, servicoContratado, extras);

  return buildParsedResponse({
    nome_contratante: nomeContratante,
    local,
    data_evento: dataEvento,
    dia_semana: diaSemana,
    informacoes,
    horario_inicio: horario.horario_inicio,
    horario_fim: horario.horario_fim,
    horario_chegada: horario.horario_chegada,
    qtd_criancas: qtdCriancas,
    faixa_etaria: faixaEtaria,
    aniversariante,
    tema,
    espaco,
    servico_contratado: servicoContratado,
    extras,
    itens_valores: valores.itens_valores,
    valor_total: valores.valor_total,
    entrada: valores.entrada,
    saldo: valores.saldo,
    texto_original: safeText
  });
}

function parseContractText(text) {
  const safeText = clean(text);

  if (!hasStructuredSections(safeText)) {
    return parseLooseContractText(safeText);
  }

  const dadosEventoSection = extractSection(safeText, "DADOS DO EVENTO", EVENT_SECTION_ENDS);
  const detalhesSection = extractSection(safeText, "DETALHES DO EVENTO", DETAILS_SECTION_ENDS);
  const valoresSection = extractSection(safeText, "VALORES", STRUCTURED_SECTION_ENDS);

  const nomeContratante =
    pickByLabel(safeText, ["contratante"]) ||
    NOT_INFORMED;

  const local =
    pickByLabel(dadosEventoSection, ["local", "endereço", "endereco"]) ||
    NOT_INFORMED;

  const dataEventoRaw =
    pickByLabel(dadosEventoSection, ["data"]) ||
    extractFirstDate(dadosEventoSection) ||
    extractFirstDate(safeText);

  const dataEvento = normalizeDate(dataEventoRaw);
  const diaSemana = calculateWeekday(dataEvento);

  const horarioRaw =
    pickByLabel(dadosEventoSection, ["horário", "horario"]) ||
    "";

  const horario = buildHorarioFromSource(horarioRaw);

  const qtdCriancas = extractQuantidadeCriancas(detalhesSection || safeText);
  const faixaEtaria = extractFaixaEtaria(detalhesSection || safeText);
  const aniversariante = extractAniversariante(detalhesSection || safeText);
  const tema = extractTema(detalhesSection || safeText);
  const espaco = extractEspaco(detalhesSection || safeText);

  const servicoContratado = cleanServico(
    pickByLabel(detalhesSection, SERVICE_LABELS) ||
    NOT_INFORMED
  );

  const extras = extractExtras(detalhesSection || safeText);

  const valores = extractValores(valoresSection || "", servicoContratado, extras);

  return buildParsedResponse({
    nome_contratante: titleCase(nomeContratante),
    local,
    data_evento: dataEvento,
    dia_semana: diaSemana,
    horario_inicio: horario.horario_inicio,
    horario_fim: horario.horario_fim,
    horario_chegada: horario.horario_chegada,
    qtd_criancas: qtdCriancas,
    faixa_etaria: faixaEtaria,
    aniversariante,
    tema,
    espaco,
    servico_contratado: servicoContratado,
    extras,
    itens_valores: valores.itens_valores,
    valor_total: valores.valor_total,
    entrada: valores.entrada,
    saldo: valores.saldo,
    texto_original: safeText
  });
}

module.exports = {
  parseContractText
};
