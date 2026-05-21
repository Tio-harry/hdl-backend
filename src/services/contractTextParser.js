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
    .replace(/ï¿½/g, "")
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

const VALUE_SUMMARY_LABELS = ["valor total", "valor combinado", "valor", "total combinado", "total geral", "sub total", "subtotal", "total", "entrada", "saldo"];
const STRUCTURED_SECTION_ENDS = ["CONTRATANTE", "CONTRATADA"];
const EVENT_SECTION_ENDS = ["DETALHES DO EVENTO", "VALORES", ...STRUCTURED_SECTION_ENDS];
const DETAILS_SECTION_ENDS = ["VALORES", ...STRUCTURED_SECTION_ENDS];

const SERVICE_LABELS = ["serviÃ§o contratado", "servico contratado", "serviÃ§o", "servico"];
/** RÃ³tulos mais longos primeiro para pickLooseByLabel nÃ£o cortar em "espaÃ§o" antes de "espaÃ§o da recreaÃ§Ã£o". */
const SPACE_LABELS = [
  "Ã¡rea da recreaÃ§Ã£o",
  "area da recreacao",
  "tipo de espaÃ§o",
  "tipo de espaco",
  "espaÃ§o da recreaÃ§Ã£o",
  "espaco da recreacao",
  "espaÃ§o",
  "espaco"
].sort((a, b) => normalizeText(b).length - normalizeText(a).length);
const SPACE_CANDIDATES = [
  "piscina",
  "quadra",
  "campo",
  "salÃ£o de festa",
  "salao de festa",
  "pequeno",
  "mÃ©dio",
  "medio",
  "grande"
];
const EXTRA_DEFINITIONS = [
  {
    label: "Escultura em balões",
    itemDescricao: "Escultura em balões",
    aliases: ["escultura em baloes"],
    valor: 45
  },
  {
    label: "Caça ao Tesouro",
    itemDescricao: "Caça ao Tesouro",
    aliases: ["caca ao tesouro"],
    valor: 80
  },
  { label: "Quebra Panela", itemDescricao: "Quebra Panela", aliases: ["quebra panela"], valor: 80 },
  { label: "Torta na Cara", itemDescricao: "Torta na Cara", aliases: ["torta na cara"], valor: 130 },
  {
    label: "Som e Microfone",
    itemDescricao: "Som e Microfone",
    aliases: ["caixa de som e microfone", "som e microfone"],
    valor: 130
  },
  {
    label: "Taxa de deslocamento",
    itemDescricao: "Taxa de deslocamento",
    aliases: ["taxa de deslocamento", "deslocamento"],
    valor: 60
  },
  {
    label: "Futebol",
    itemDescricao: "Futebol",
    aliases: ["futebol"],
    valor: 80
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
  "local da festa e ponto de referÃªncia",
  "local da festa e ponto de referencia",
  "local da festa",
  "endereÃ§o",
  "endereco",
  "local"
];

const LOOSE_VALUE_STOP_LABELS = [
  "formato da acao",
  "formato da aÃƒÂ§ÃƒÂ£o",
  "datas e horarios",
  "datas e horÃƒÂ¡rios",
  "servico contratado",
  "serviÃƒÂ§o contratado",
  "investimento",
  "investimento total",
  "investimento total da proposta",
  "observacoes",
  "observaÃƒÂ§ÃƒÂµes",
  "dados bancarios",
  "dados bancÃƒÂ¡rios",
  "forma de pagamento",
  "responsavel pela proposta",
  "responsÃƒÂ¡vel pela proposta",
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
  "horÃ¡rio",
  "horario",
  "horÃ¡rio do evento",
  "horario do evento",
  "horÃ¡rio que inicia",
  "horario que inicia",
  "inÃ­cio",
  "inicio",
  "aniversariante",
  "tema",
  "extras",
  "quantidade de crianÃ§as",
  "quantidade de criancas",
  "nÃºmero de crianÃ§as",
  "numero de criancas",
  "qtd crianÃ§as",
  "qtd criancas",
  "faixa etÃ¡ria",
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
    .replace(/(?:•|◦|‣|⁃|∙|·|â€¢|â—¦|â€£|âƒ|âˆ™|Â·|\uFFFD)+/g, "\n")
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
  const normalizedLine = normalizeText(line).replace(/\s+/g, " ").trim();
  return VALUE_SUMMARY_LABELS.some((label) => normalizedLine.startsWith(label));
}

function findLineStartingWith(lines, label) {
  return lines.find((line) => normalizeText(line).startsWith(label)) || "";
}

function normalizeSpaceCandidate(value) {
  return value === "medio" ? "mÃ©dio" : value;
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

function normalizeLooseListSeparator(value) {
  return String(value || "")
    .replace(/[;|]+/g, ", ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function formatLooseLocalValue(value) {
  if (!value) return "";

  let current = cleanExtractedValue(value)
    .replace(/^(?:endere[cç]o(?:\s+da\s+festa)?|local(?:\s+da\s+festa(?:\s+e\s+ponto\s+de\s+refer[eê]ncia)?)?)\s*:?\s*/i, "")
    .replace(/^(?:ponto\s+de\s+refer[eê]ncia|refer[eê]ncia)\s*:?\s*/i, "")
    .replace(/^da\s+festa\b\s*/i, "")
    .replace(/\(([^)]+)\)/g, (_, inner) => `, ${titleCase(inner)}`)
    .replace(/(\d{1,4})\s+([A-ZÀ-Ý]{3,})(\s*)$/u, "$1, $2$3");

  current = current
    .replace(/\.\s*cep\s*:?\s*(\d{5}-\d{3})\.?/i, ", CEP $1")
    .replace(/\bcep\b\s*:?\s*(\d{5}-\d{3})/i, "CEP $1")
    .replace(/,\s*Casa\s+([^,]+?)\s*,?\s*CEP\s*(\d{5}-\d{3})/i, (_, bairro, cep) => `, casa, ${titleCase(bairro)}, CEP ${cep}`)
    .replace(/\s+-\s+CEP\s*(\d{5}-\d{3})/i, ", CEP $1")
    .replace(/\s*-\s*,\s*CEP\s*(\d{5}-\d{3})/i, ", CEP $1")
    .replace(/\s*-\s*(?=CEP\s*\d{5}-\d{3})/i, ", ")
    .replace(/,\s*(\d{1,4})\s+(.+?)\s+([A-ZÀ-Ý]{2,})\s*-\s*([A-Z]{2})\b/u, (_, numero, bairro, cidade, uf) => `, ${numero}, ${bairro.trim()}, ${cidade}-${uf}`);

  current = normalizeLooseListSeparator(current)
    .replace(/\s+,/g, ",")
    .replace(/,+/g, ",")
    .replace(/,\s*,/g, ", ")
    .replace(/,\s*([A-ZÀ-Ý]{2,})\s+([A-Z]{2})\b/u, ", $1-$2")
    .replace(/^\s*,\s*/, "")
    .trim();

  return current;
}

function isLikelyStopLineForLooseLocal(line) {
  const normalized = normalizeText(line);
  return (
    !normalized ||
    normalized.startsWith("data da festa") ||
    normalized.startsWith("data do evento") ||
    normalized === "data" ||
    normalized.startsWith("horario") ||
    normalized.startsWith("horÃƒÂ¡rio") ||
    normalized.startsWith("detalhes") ||
    normalized.startsWith("qual o servico contratado") ||
    normalized.startsWith("servico contratado") ||
    normalized.startsWith("valor total") ||
    normalized.startsWith("valor") ||
    normalized.startsWith("entrada") ||
    normalized.startsWith("saldo") ||
    normalized.startsWith("aniversariante") ||
    normalized.startsWith("tema")
  );
}

function lineLooksLikeServiceWithMoney(line) {
  const normalized = normalizeText(line);
  return (
    extractTrailingMoneyValue(line) !== null &&
    (
      normalized.includes("recreador") ||
      normalized.includes("recreacao") ||
      normalized.includes("recreaÃƒÂ§ÃƒÂ£o") ||
      normalized.includes("pool party") ||
      normalized.includes("som e microfone") ||
      normalized.includes("escultura em bal") ||
      normalized.includes("torta na cara")
    )
  );
}

function lineLooksLikeLocal(line) {
  const normalized = normalizeText(line);
  return (
    normalized.includes("rua ") ||
    normalized.includes("avenida ") ||
    normalized.includes("av. ") ||
    normalized.includes("travessa ") ||
    normalized.includes("estrada ") ||
    normalized.includes("condominio") ||
    normalized.includes("condomÃƒÂ­nio") ||
    normalized.includes("espaco ") ||
    normalized.includes("espaÃƒÂ§o ") ||
    normalized.includes("salao de festa") ||
    normalized.includes("salao de festas") ||
    normalized.includes("salÃƒÂ£o de festa") ||
    normalized.includes("salÃƒÂ£o de festas") ||
    normalized.includes("proximo") ||
    normalized.includes("prÃƒÂ³ximo") ||
    normalized.includes("bairro") ||
    normalized.includes("paulista") ||
    normalized.includes("piedade") ||
    normalized.includes("casa amarela") ||
    normalized.startsWith("no jardim")
  );
}

function collectLooseLocalParts(lines, startIndex, seedValue = "") {
  const parts = [];
  if (seedValue && isUsefulLooseValue(seedValue)) {
    parts.push(formatLooseLocalValue(seedValue));
  }

  for (let i = startIndex; i < lines.length; i++) {
    const current = cleanExtractedValue(lines[i]);
    if (!current) continue;
    if (isLikelyStopLineForLooseLocal(current) || isFormLabelLine(current)) break;
    if (extractFirstDate(current) || extractTimes(current).length) break;
    if (lineLooksLikeServiceWithMoney(current)) break;

    const referenceValue = cleanExtractedValue(
      current.replace(/^(?:ponto\s+de\s+refer[eê]ncia|refer[eê]ncia)\s*:?\s*/i, "")
    );
    const isReferenceLine = referenceValue !== current;

    if (lineLooksLikeLocal(current) || isReferenceLine || parts.length > 0) {
      parts.push(formatLooseLocalValue(isReferenceLine ? referenceValue : current));
    }
  }

  return normalizeLooseListSeparator(parts.filter(Boolean).join(", "));
}

function extractAgeNumbersFromText(text) {
  const source = String(text || "")
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, " ")
    .replace(/\br\$\s*[\d\.\,]+\b/gi, " ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/\b\d{1,2}h\b/gi, " ");

  const ages = [];
  let match;

  const rangeRegex = /(\d{1,2})\s*(?:a|\/)\s*(\d{1,2})\s*anos?\b/gi;
  while ((match = rangeRegex.exec(source))) {
    ages.push(Number(match[1]), Number(match[2]));
  }

  const compactRangeRegex = /\((\d{1,2})\s*-\s*(\d{1,2})\)/gi;
  while ((match = compactRangeRegex.exec(source))) {
    ages.push(Number(match[1]), Number(match[2]));
  }

  const betweenRegex = /(?:entre|de)\s*(\d{1,2})\s*(?:e|a)\s*(\d{1,2})\s*anos?\b/gi;
  while ((match = betweenRegex.exec(source))) {
    ages.push(Number(match[1]), Number(match[2]));
  }

  const singleRegex = /\b(\d{1,2})\s*anos?\b/gi;
  while ((match = singleRegex.exec(source))) {
    ages.push(Number(match[1]));
  }

  for (const line of splitLines(source)) {
    const normalized = normalizeText(line);
    if (!normalized.includes("maioria") && !normalized.includes("idade")) continue;

    const fallbackMatches =
      line.match(/\bde\s+(\d{1,2})(?!\s*\/)(?!:\d{2})(?!\s*(?:crian\S*|convidad\S*|participante\S*))\b/g) || [];
    for (const token of fallbackMatches) {
      const numeric = Number((token.match(/\d{1,2}/) || [])[0]);
      if (!Number.isNaN(numeric) && numeric <= 17) {
        ages.push(numeric);
      }
    }
  }

  return ages.filter((age) => Number.isFinite(age) && age >= 0 && age <= 17);
}

function buildFaixaEtariaFromAges(ages) {
  if (!ages.length) return "";
  const min = Math.min(...ages);
  const max = Math.max(...ages);
  return min === max ? `${min} anos` : `${min} a ${max} anos`;
}

function normalizeKnownTheme(value) {
  const normalized = normalizeText(value);
  if (normalized === "homem aranha") return "Homem-Aranha";
  return titleCase(value);
}

function cleanThemeValue(value) {
  return cleanExtractedValue(
    String(value || "").replace(/^(?:tema(?:\s+da\s+festa)?|da\s+festa)\s*:?\s*/i, "")
  );
}

function cleanEspacoValue(value) {
  let current = cleanExtractedValue(String(value || ""));
  if (!current) return "";

  current = current
    .replace(/\(([^)]+)\)/g, "")
    .replace(/,\s*(?:\d{1,3}\s+crian\S*|\d{1,2}\s*anos?|tema\b.*|aniversariante\b.*)$/i, "")
    .replace(/^local com\s+/i, "Local com ")
    .replace(/\balguns?\s+brinquedos\s+de\s+madeira\b/i, "brinquedos de madeira")
    .replace(/,\s*gramado$/i, " e gramado")
    .replace(/,\s*$/, "")
    .trim();

  const normalized = normalizeText(current);
  if (normalized.startsWith("espaco pequeno") || normalized.startsWith("espaÃ§o pequeno")) return "Espaco pequeno";
  if (normalized.startsWith("espaco medio") || normalized.startsWith("espaÃ§o medio") || normalized.startsWith("espaÃ§o mÃ©dio")) return "Espaco medio";
  if (normalized.startsWith("espaco grande") || normalized.startsWith("espaÃ§o grande")) return "Espaco grande";
  if (normalized.startsWith("pequeno")) return "Espaco pequeno";
  if (normalized.startsWith("medio") || normalized.startsWith("mÃƒÂ©dio")) return "Espaco medio";
  if (normalized.startsWith("grande")) return "Espaco grande";
  if (normalized.startsWith("salao de festa do condominio") || normalized.startsWith("salÃƒÂ£o de festa do condomÃƒÂ­nio")) {
    return "Salao de festa do condominio";
  }
  if (
    normalized.startsWith("salao de festa") ||
    normalized.startsWith("salao de festas") ||
    normalized.startsWith("salÃƒÂ£o de festa") ||
    normalized.startsWith("salÃƒÂ£o de festas")
  ) {
    return current.charAt(0).toLocaleUpperCase("pt-BR") + current.slice(1).toLocaleLowerCase("pt-BR");
  }
  if (normalized.startsWith("espaco ") || normalized.startsWith("espaÃƒÂ§o ")) {
    const nomeEspaco = titleCase(current.replace(/^espa[cç]o\s+/i, "").split(",")[0].trim());
    return `Espaço ${nomeEspaco}`;
  }

  return current;
}

function extractServiceMoneyItems(text) {
  const items = [];

  for (const rawLine of splitLines(text)) {
    const line = cleanExtractedValue(rawLine);
    if (!line || isValueSummaryLine(line)) continue;

    const value = extractTrailingMoneyValue(line);
    if (value === null) continue;

    const descricao = cleanExtractedValue(
      line
        .replace(/\s*(?:r\$\s*[\d\.\,]+|\d{1,6}[.,]\d{2}|\d{1,6}\s*reais?)\s*$/i, "")
        .replace(/[Ã¢â‚¬â€œÃ¢â‚¬â€-]+/g, " ")
    );

    if (!descricao || !/[A-Za-zÃƒâ‚¬-ÃƒÂ¿]/.test(descricao)) continue;

    items.push({
      descricao: cleanServico(descricao),
      valor: value
    });
  }

  return items;
}

function buildHorarioValues(inicio, fimOverride = NOT_INFORMED) {
  const inicioPad = inicio ? padTime(inicio) : NOT_INFORMED;
  const fim = !isNotInformed(inicioPad)
    ? (fimOverride && !isNotInformed(fimOverride) ? padTime(fimOverride) : addHours(inicioPad, 3))
    : NOT_INFORMED;
  const chegada = !isNotInformed(inicioPad) ? subtractMinutes(inicioPad, 20) : NOT_INFORMED;

  return {
    horario_inicio: inicioPad,
    horario_fim: fim,
    horario_chegada: chegada
  };
}

function extractExplicitTimeRange(source) {
  const times = extractTimes(source);
  if (times.length < 2) return null;

  const normalized = normalizeText(source).replace(/\s+/g, " ");
  const hasExplicitRange = /(das?\s*)?\d{1,2}(?::\d{2})?\s*h?\s*(?:as|a|ate|até|-)\s*\d{1,2}(?::\d{2})?\s*h?/.test(normalized);
  if (!hasExplicitRange) return null;

  return {
    inicio: times[0],
    fim: times[1]
  };
}

function buildHorarioFromSource(source) {
  const explicitRange = extractExplicitTimeRange(source);
  if (explicitRange) {
    return buildHorarioValues(explicitRange.inicio, explicitRange.fim);
  }

  const times = extractTimes(source);
  return buildHorarioValues(times[0] || NOT_INFORMED);
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

/** Meses por extenso (apÃ³s normalizeText: marÃ§o â†’ marco). */
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
    .replace(/^[\s:â€“â€”\-]+/u, "")
    .trim();
  const monthRe =
    "(janeiro|fevereiro|mar[cÃ§]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)";
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
    sourceNormalized.includes("manhÃ£") ||
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
    .replace(/Ã s/gi, " as ")
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
  if (!/^(?:valor(?:\s+total|\s+combinado)?|total(?:\s+combinado|\s+geral)?)\b/.test(normalized)) return null;

  const match = String(line).match(/\b(?:valor(?:\s+total|\s+combinado)?|total(?:\s+combinado|\s+geral)?)\b\s*:?\s*(?:r\$\s*)?(\d{1,6}(?:[.,]\d{2})?)(?:\s*reais?)?/i);
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
            : "ServiÃ§o de recreaÃ§Ã£o",
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
    "quantidade de crianÃ§as",
    "quantidade de criancas",
    "nÃºmero de crianÃ§as",
    "numero de criancas",
    "qtd crianÃ§as",
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
  let generic = normalized.match(/\bem\s+torno\s+de\s+(\d{1,3})\s+(?:crian.as?|convidados?|participantes?)\b/i);
  if (generic) return generic[1];

  generic = normalized.match(/\b(\d{1,3})\s*a\s*(\d{1,3})\s+(?:crian.as?|convidados?|participantes?)\b/i);
  if (generic) return `${generic[1]} a ${generic[2]}`;

  generic = normalized.match(/\b(\d{1,3})\s+(?:crian.as?|convidados?|participantes?)\b/i);
  if (generic) return generic[1];

  generic = normalized.match(/\b(?:qtd|quantidade)\s*:?\s*(\d{1,3})(?:\s*a\s*(\d{1,3}))?\b/i);
  if (generic) return generic[2] ? `${generic[1]} a ${generic[2]}` : generic[1];

  generic = normalized.match(/\b(\d{1,3})\s+com\s+idade\b/i);
  return generic ? generic[1] : NOT_INFORMED;
}

function extractFaixaEtaria(detailsText) {
  const info = pickByLabel(detailsText, ["informaÃ§Ãµes", "informacoes"]) || detailsText;
  const aggregatedAges = extractAgeNumbersFromText(info);
  const aggregatedRange = buildFaixaEtariaFromAges(aggregatedAges);
  if (aggregatedRange) return aggregatedRange;

  const labeled = pickLooseByLabel(detailsText, [
    "faixa etÃ¡ria",
    "faixa etaria",
    "idade"
  ]);

  if (labeled) {
    const labeledAges = extractAgeNumbersFromText(labeled);
    return buildFaixaEtariaFromAges(labeledAges) || normalizeFaixaEtaria(labeled);
  }

  let match = info.match(/faixa\s+et[aÃ¡]ria\s*:?\s*([^.]+?)(?:\.|$)/i);
  if (match) return normalizeFaixaEtaria(match[1]);

  const infoWithoutFullDates = info
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, " ")
    .replace(/\b\d{1,3}\s*a\s*\d{1,3}\s+(?:crian.as?|convidados?|participantes?)\b/gi, " ")
    .replace(/\b\d{1,3}\s+(?:crian.as?|convidados?|participantes?)\b/gi, " ");

  match = infoWithoutFullDates.match(/(?:faixa\s+et[aÃ¡]ria|idade)?\s*:?\s*(?:de\s*)?(\d{1,2})\s*(?:a|\/)\s*(\d{1,2})\s*anos?\b/i);
  if (match) return `${Number(match[1])} a ${Number(match[2])} anos`;

  match = infoWithoutFullDates.match(/(?:faixa\s+et[aÃ¡]ria|idade)?\s*:?\s*(\d{1,2})\s*anos?\b/i);
  if (match) return `${Number(match[1])} anos`;

  return NOT_INFORMED;
}

function extractAniversariante(detailsText) {
  const labeled = pickByLabel(detailsText, ["nome do aniversariante", "aniversariante"]);
  if (labeled) {
    return titleCase(
      cleanExtractedValue(
        String(labeled)
          .replace(/^nome\s+do\s+aniversariante\s*:?\s*/i, "")
          .replace(/^aniversariante\s*:?\s*/i, "")
      )
    );
  }

  const info = pickByLabel(detailsText, ["informaÃ§Ãµes", "informacoes"]) || detailsText;
  const match = info.match(/aniversariante\s*:?\s*([^.]+?)(?:\.|$)/i);
  if (match) {
    return titleCase(
      cleanExtractedValue(match[1].replace(/^nome\s+do\s+aniversariante\s*:?\s*/i, ""))
    );
  }

  return NOT_INFORMED;
}

function extractTema(detailsText) {
  const labeled = pickByLabel(detailsText, ["tema"]);
  if (labeled) return normalizeKnownTheme(cleanThemeValue(labeled));

  const info = pickByLabel(detailsText, ["informaÃ§Ãµes", "informacoes"]) || detailsText;
  let match = info.match(/tema(?:\s+da\s+festa)?\s*:?\s*([^\n\r.]+)/i);
  if (match) return normalizeKnownTheme(cleanThemeValue(match[1]));

  for (const line of splitLines(info)) {
    const parts = line
      .split(",")
      .map((part) => cleanExtractedValue(part))
      .filter(Boolean);

    for (let i = 0; i < parts.length - 1; i++) {
      if (!/\b\d{1,2}\s*anos?\b/i.test(parts[i])) continue;
      const candidate = parts[i + 1];
      const normalizedCandidate = normalizeText(candidate);
      if (
        candidate &&
        !normalizedCandidate.includes("vai chegar") &&
        !normalizedCandidate.includes("parabens") &&
        !normalizedCandidate.includes("parabÃ©ns") &&
        normalizedCandidate.split(" ").length <= 4
      ) {
        return normalizeKnownTheme(candidate);
      }
    }
  }

  return NOT_INFORMED;
}

function extractEspaco(detailsText) {
  const labeled = pickByLabel(detailsText, SPACE_LABELS);

  if (labeled) return cleanEspacoValue(labeled);

  const info = pickByLabel(detailsText, ["informaÃ§Ãµes", "informacoes"]) || detailsText;
  const match = info.match(/espa[Ã§c]o\s*:?\s*([^.]+?)(?:\.|$)/i);
  if (match) return cleanEspacoValue(match[1]);

  if (/local\s+com\s+espa/i.test(info)) {
    const localMatch = info.match(/(local\s+com\s+espa[^\n\r]+)/i);
    if (localMatch) return cleanEspacoValue(localMatch[1]);
  }

  if (/sal[aÃ£]o de festa do condom/i.test(info)) {
    return "Salao de festa do condominio";
  }

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
    .replace(/recriaÃ§Ã£o/gi, "recreaÃ§Ã£o")
    .replace(/recriacao/gi, "recreaÃ§Ã£o");
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

  const serviceMoneyItems = extractServiceMoneyItems(valuesText);
  let valorTotal = extractTotalMoneyFromLine(valorTotalLine) || 0;
  let entrada = extractMoneyFromLine(entradaLine) || 0;
  let saldo = extractMoneyFromLine(saldoLine) || 0;

  let itensValores = [];

  const itensHeaderIndex = lines.findIndex(
    (line) => normalizeText(line) === "itens discriminados"
  );

  if (itensHeaderIndex >= 0) {
    for (let i = itensHeaderIndex + 1; i < lines.length; i++) {
      const line = lines[i];

      if (!line.trim()) continue;
      if (isValueSummaryLine(line)) break;

      const valor = extractMoneyFromLine(line);
      if (valor === null) continue;

      let descricao = line
        .replace(/r\$\s*[\d\.\,]+/i, "")
        .replace(/[â€“â€”-]+/g, " ")
        .trim();

      if (!descricao) {
        descricao =
          servicoContratado && !isNotInformed(servicoContratado)
            ? servicoContratado
            : "ServiÃ§o de recreaÃ§Ã£o";
      }

      itensValores.push({ descricao, valor });
    }
  }

  if (!itensValores.length && serviceMoneyItems.length) {
    itensValores = serviceMoneyItems;
  }

  if (!valorTotal && itensValores.length) {
    valorTotal = itensValores.reduce((sum, item) => sum + item.valor, 0);
  }

  if (!entrada && valorTotal) entrada = valorTotal / 2;
  if (!saldo && valorTotal) saldo = valorTotal / 2;

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

const LOOSE_NAME_FORBIDDEN_LABELS = [
  "valor",
  "valor total",
  "total",
  "local",
  "data",
  "horario",
  "horário",
  "servico",
  "serviço",
  "servico contratado",
  "serviço contratado",
  "extras",
  "entrada",
  "saldo",
  "informacoes",
  "informações",
  "dados do evento"
];

function isForbiddenLooseNameValue(value) {
  const normalized = normalizeText(cleanExtractedValue(value)).replace(/[:\s]+$/g, "").trim();
  if (!normalized) return true;

  return LOOSE_NAME_FORBIDDEN_LABELS.some((label) => {
    const normalizedLabel = normalizeText(label);
    return (
      normalized === normalizedLabel ||
      normalized.startsWith(`${normalizedLabel}:`) ||
      normalized.startsWith(`${normalizedLabel} `)
    );
  });
}

function extractLooseName(text) {
  const lines = splitLines(text);

  const labeled =
    pickLooseByLabel(text, [
      "nome completo do contratante",
      "contratante",
      "cliente"
    ]) || "";

  if (labeled && !isForbiddenLooseNameValue(labeled)) return titleCase(labeled);

  for (const line of lines) {
    const cleaned = cleanExtractedValue(line);
    const normalized = normalizeText(cleaned);

    if (
      isUsefulLooseValue(cleaned) &&
      !isForbiddenLooseNameValue(cleaned) &&
      !normalized.includes("local") &&
      !normalized.includes("data") &&
      !normalized.includes("horario") &&
      !normalized.includes("horÃ¡rio") &&
      !normalized.includes("servico") &&
      !normalized.includes("serviÃ§o") &&
      !normalized.includes("tema") &&
      !normalized.includes("aniversariante") &&
      !normalized.includes("criancas") &&
      !normalized.includes("crianÃ§as") &&
      !normalized.includes("faixa etaria") &&
      !normalized.includes("faixa etÃ¡ria") &&
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

/** Linha cujo rÃ³tulo Ã© campo de espaÃ§o (evita confundir com serviÃ§o por conter "recreaÃ§Ã£o"). */
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

  for (let i = 0; i < lines.length; i++) {
    const line = cleanExtractedValue(lines[i]);
    const normalized = normalizeText(line);
    const inlineMatch = line.match(/^(?:endere[cç]o(?:\s+da\s+festa)?|local(?:\s+da\s+festa(?:\s+e\s+ponto\s+de\s+refer[eê]ncia)?)?)\s*:?\s*(.*)$/i);

    if (inlineMatch) {
      const seed = cleanExtractedValue(inlineMatch[1] || "");
      const collected = collectLooseLocalParts(lines, i + 1, seed && normalizeText(seed) !== "da festa" ? seed : "");
      if (collected) return collected;
    }

    const inlineLocal = getLooseInlineValueByLabel(line, LOCAL_LABELS) || getInlineValueByLabel(line, LOCAL_LABELS);
    if (inlineLocal && isUsefulLooseValue(inlineLocal) && normalizeText(inlineLocal) !== "da festa") {
      const collected = collectLooseLocalParts(lines, i + 1, inlineLocal);
      if (collected) return collected;
    }

    if (LOCAL_LABELS.some((label) => normalized === normalizeText(label) || normalized === `${normalizeText(label)}:`)) {
      const collected = collectLooseLocalParts(lines, i + 1);
      if (collected) return collected;
    }
  }

  const labeled = pickLooseByLabel(text, LOCAL_LABELS) || "";
  if (labeled && normalizeText(labeled) !== "da festa") return formatLooseLocalValue(cleanLooseLocalValue(labeled));

  for (let i = 0; i < lines.length; i++) {
    const cleaned = cleanExtractedValue(lines[i]);
    if (!lineLooksLikeLocal(cleaned)) continue;

    const collected = collectLooseLocalParts(lines, i + 1, cleaned);
    if (collected) return collected;
  }

  return NOT_INFORMED;
}

function extractLooseService(text) {
  const labeled =
    pickLooseByLabel(text, SERVICE_LABELS) || "";

  if (labeled) return cleanServico(labeled);

  const isHorarioNarrative = (normalized) =>
    normalized.includes("convite") ||
    normalized.includes("convidados") ||
    normalized.includes("recreacao comeca") ||
    normalized.includes("recreadores comecam") ||
    normalized.includes("equipe comeca") ||
    normalized.includes("inicio da recreacao");

  for (const line of splitLines(text)) {
    const cleaned = cleanExtractedValue(line);
    const normalized = normalizeText(cleaned);
    if (isHorarioNarrative(normalized)) continue;
    if (/^\d{1,2}\s+recreadores?$/i.test(normalized)) return cleaned;
    if (extractTrailingMoneyValue(cleaned) === null) continue;
    if (normalized.includes("pool party completo")) return "Pool Party Completo";
    if (normalized.includes("pool party")) return "Pool Party";
  }

  const lines = splitLines(text);
  for (let i = 0; i < lines.length; i++) {
    const cleaned = cleanExtractedValue(lines[i]);
    const normalized = normalizeText(cleaned);

    if (/^qual\s+(?:o\s+)?servico\s+contratado\??$/i.test(normalized)) {
      for (let j = i + 1; j < lines.length; j++) {
        const next = cleanExtractedValue(lines[j]);
        const nextNormalized = normalizeText(next);

        if (!isUsefulLooseValue(next)) continue;
        if (isHorarioNarrative(nextNormalized)) continue;
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
    if (isHorarioNarrative(normalized)) continue;
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
        normalized.includes("recreaÃ§Ã£o") ||
        normalized.includes("pool party") ||
        normalized.includes("personagem") ||
        normalized.includes("promotor")
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
  for (const line of splitLines(text)) {
    const cleaned = cleanExtractedValue(line);
    const normalized = normalizeText(cleaned);
    const compacted = normalized.replace(/[^a-z0-9]+/g, " ");
    const times = extractTimes(cleaned);

    if (!times.length) continue;

    if (
      /recreadores?\s+comec/.test(compacted) ||
      /recreacao\s+comec/.test(compacted) ||
      /equipe\s+comec/.test(compacted) ||
      /inicio\s+da\s+recreacao/.test(compacted) ||
      /recreadores?\s+as\b/.test(compacted)
    ) {
      return buildHorarioValues(times[times.length - 1]);
    }

    const explicitRange = extractExplicitTimeRange(cleaned);
    if (explicitRange) {
      return buildHorarioValues(explicitRange.inicio, explicitRange.fim);
    }
  }

  const labeled =
    pickLooseByLabel(text, [
      "horÃ¡rio",
      "horario",
      "horÃ¡rio do evento",
      "horario do evento",
      "horÃ¡rio da recreaÃ§Ã£o",
      "horario da recreacao",
      "horÃ¡rio que inicia",
      "horario que inicia",
      "inÃ­cio",
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
      /\btema\s*:?\s*([^\n\r.;]+?)\s*[-â€“â€”]\s*([^\n\r.;-]*?\b\d{1,2}\s*anos?)\s*[-â€“â€”]\s*espa\S*o\s*:?\s*([^\n\r.;]+)/iu
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
  if (labeled) return normalizeKnownTheme(cleanThemeValue(labeled));

  let match = text.match(/tema(?:\s+da\s+festa)?\s*:?\s*([^\n\r.]+)/i);
  if (match && isUsefulLooseValue(match[1])) return normalizeKnownTheme(cleanThemeValue(match[1]));

  match = text.match(/festa\s+(?:sera|ser[aá]|de)\s+de\s*([^\n\r(.,]+)/i);
  if (match && isUsefulLooseValue(match[1])) return normalizeKnownTheme(match[1]);

  for (const line of splitLines(text)) {
    const parts = line
      .split(",")
      .map((part) => cleanExtractedValue(part))
      .filter(Boolean);

    for (let i = 0; i < parts.length - 1; i++) {
      if (!/\b\d{1,2}\s*anos?\b/i.test(parts[i])) continue;
      const candidate = parts[i + 1];
      if (!candidate) continue;

      const normalizedCandidate = normalizeText(candidate);
      if (
        !normalizedCandidate.includes("vai chegar") &&
        !normalizedCandidate.includes("parabens") &&
        !normalizedCandidate.includes("parabÃ©ns") &&
        normalizedCandidate.split(" ").length <= 4
      ) {
        return normalizeKnownTheme(candidate);
      }
    }
  }

  return NOT_INFORMED;
}

function extractLooseAniversariante(text) {
  const labeled = pickLooseByLabel(text, ["nome do aniversariante", "aniversariante"]);
  if (labeled) {
    return titleCase(
      cleanExtractedValue(
        String(labeled)
          .replace(/^nome\s+do\s+aniversariante\s*:?\s*/i, '')
          .replace(/^aniversariante\s*:?\s*/i, '')
      )
    );
  }

  const split = splitLines(text);
  for (let index = 0; index < split.length; index++) {
    const line = split[index];
    const cleaned = cleanExtractedValue(line);
    const normalized = normalizeText(cleaned);

    if (normalized.startsWith("nome dele") || normalized.startsWith("nome dela") || normalized.startsWith("nome do aniversariante")) {
      const candidate = cleaned
        .replace(/^nome\s+dele\s*(?:é|e)?\s*/i, '')
        .replace(/^nome\s+dela\s*(?:é|e)?\s*/i, '')
        .replace(/^nome\s+do\s+aniversariante\s*:?\s*/i, '')
        .trim();
      if (candidate) return titleCase(candidate);
    }

    const previous = normalizeText(split[index - 1] || "");
    const currentWithoutNotes = cleaned.replace(/\([^)]*\)/g, "").trim();
    if (
      currentWithoutNotes &&
      /^\p{L}+(?:\s+\p{L}+){1,3}$/u.test(currentWithoutNotes) &&
      (previous.includes("anos") || previous.includes("criancas") || previous.includes("crianças")) &&
      !normalized.includes("recreador") &&
      !normalized.includes("valor") &&
      !normalized.includes("rua ") &&
      !normalized.includes("avenida ") &&
      !normalized.includes("tema")
    ) {
      return titleCase(currentWithoutNotes);
    }
  }

  let match = text.match(/aniversariante\s*:?\s*([^\n\r.]+)/i);
  if (match && isUsefulLooseValue(match[1])) {
    return titleCase(
      cleanExtractedValue(match[1].replace(/^nome\s+do\s+aniversariante\s*:?\s*/i, ''))
    );
  }

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
  const wholeTextMatch = String(text).match(/(?:espa[cç]o\s+da\s+recrea[cç][aã]o|[áa]rea\s+da\s+recrea[cç][aã]o)\s*:?\s*([^\n\r]+)/i);
  if (wholeTextMatch && isUsefulLooseValue(wholeTextMatch[1])) {
    return cleanEspacoValue(wholeTextMatch[1]);
  }

  for (const line of splitLines(text)) {
    const cleaned = cleanExtractedValue(line);
    const normalized = normalizeText(cleaned);
    const explicitMatch = cleaned.match(/^(?:espa[cç]o\s+da\s+recrea[cç][aã]o|[áa]rea\s+da\s+recrea[cç][aã]o)\s*:?\s*(.+)$/i);

    if (explicitMatch && isUsefulLooseValue(explicitMatch[1])) {
      return cleanEspacoValue(explicitMatch[1]);
    }

    if (normalized.startsWith("local com ")) {
      return cleanEspacoValue(cleaned);
    }

    if (normalized.startsWith("espaco ") || normalized.startsWith("espaço ")) {
      const withoutNotes = cleaned.replace(/\(([^)]+)\)/g, "").trim();
      if (/[,\-]/.test(withoutNotes) || /\b\d{1,2}\s*(?:crianc|anos?)\b/i.test(withoutNotes) || /\btema\b|\baniversariante\b|\bparabens\b/i.test(normalized)) {
        return cleanEspacoValue(withoutNotes);
      }
      return titleCase(withoutNotes);
    }
  }

  const labeled = pickLooseByLabel(text, SPACE_LABELS);
  if (labeled) return cleanEspacoValue(labeled);

  if (/sal[aÃ£]o de festa do condom/i.test(text)) {
    return "Salão de festa do condomínio";
  }

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
      new RegExp(`(?:\\s*[-â€“â€”,.;:]\\s*)?\\bespa\\S*o(?:\\s+da\\s+recrea\\S*o)?\\s*[:\\-]?\\s*${espacoPattern}\\b`, "iu"),
      ""
    )
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[-â€“â€”]\s*$/g, "")
    .trim();

  return cleanExtractedValue(cleaned);
}

function extractLooseValues(text, servicoContratado, extras) {
  const lines = splitLines(text);
  const valorTotalLine =
    findLineStartingWith(lines, "valor total") ||
    findLineStartingWith(lines, "valor combinado") ||
    findLineStartingWith(lines, "total combinado") ||
    findLineStartingWith(lines, "total geral") ||
    findLineStartingWith(lines, "valor") ||
    findLineStartingWith(lines, "total");
  const entradaLine = findLineStartingWith(lines, "entrada");
  const saldoLine = findLineStartingWith(lines, "saldo");

  let valorTotal = extractTotalMoneyFromLine(valorTotalLine) || 0;
  let entrada = extractMoneyFromLine(entradaLine) || 0;
  let saldo = extractMoneyFromLine(saldoLine) || 0;
  const serviceMoneyItems = extractServiceMoneyItems(text);
  const serviceMoneySum = serviceMoneyItems.reduce((sum, item) => sum + item.valor, 0);

  if (!valorTotal && serviceMoneySum > 0) {
    valorTotal = serviceMoneySum;
  }

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
        valorTotal = values.reduce((sum, value) => sum + value, 0);
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

  const itens = serviceMoneyItems.length ? serviceMoneyItems : inferDefaultItems(servicoContratado, extras, valorTotal);

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
  const local = extractLooseLocal(normalizedLooseText);
  const dataEvento = extractLooseData(looseText);
  const diaSemana = calculateWeekday(dataEvento);

  const horario = extractLooseHorario(looseText);

  const temaAniversarianteEspaco = extractLooseTemaAniversarianteEspaco(looseText);
  const qtdCriancas = emptyIfNotInformed(extractQuantidadeCriancas(normalizedLooseText));
  const faixaEtaria = emptyIfNotInformed(extractFaixaEtaria(normalizedLooseText));
  const aniversariante = emptyIfNotInformed(
    temaAniversarianteEspaco.aniversariante || extractLooseAniversariante(looseText)
  );
  const tema = emptyIfNotInformed(temaAniversarianteEspaco.tema || extractLooseTema(looseText));
  const espaco = emptyIfNotInformed(temaAniversarianteEspaco.espaco || extractLooseEspaco(looseText));
  const servicoContratado = extractLooseService(looseText);
  const extrasBase = extractExtras(looseText);
  const informacoes = removeDuplicateEspacoFromInformacoes(
    extractLooseInformacoes(normalizedLooseText, looseText),
    espaco
  );

  const valores = extractLooseValues(looseText, servicoContratado, extrasBase);
  const extras = extrasBase === NO_EXTRAS
    ? [...new Set((valores.itens_valores || [])
        .map((item) => cleanExtractedValue(item?.descricao || ""))
        .filter((descricao) => {
          const normalizedDescricao = normalizeText(descricao);
          return (
            descricao &&
            normalizedDescricao &&
            normalizedDescricao !== normalizeText(servicoContratado) &&
            !normalizedDescricao.includes("recreador") &&
            !normalizedDescricao.includes("recreacao") &&
            !normalizedDescricao.includes("pool party") &&
            !normalizedDescricao.includes("promotor")
          );
        }))].join(", ") || NO_EXTRAS
    : extrasBase;

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
    pickByLabel(dadosEventoSection, ["local", "endereÃ§o", "endereco"]) ||
    NOT_INFORMED;

  const dataEventoRaw =
    pickByLabel(dadosEventoSection, ["data"]) ||
    extractFirstDate(dadosEventoSection) ||
    extractFirstDate(safeText);

  const dataEvento = normalizeDate(dataEventoRaw);
  const diaSemana = calculateWeekday(dataEvento);

  const horarioRaw =
    pickByLabel(dadosEventoSection, ["horÃ¡rio", "horario"]) ||
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







