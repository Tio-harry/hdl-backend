function normalizeContractLines(text) {
  return String(text || '')
    .normalize('NFC')
    .replace(/\r\n?|[\u2028\u2029]/g, '\n')
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, '')
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/\\(?= *(?:\n|$))|\\n(?=\s|[•◦‣]|(?:nome|local|data|hor[aá]rio|contato|qual)\b)/giu, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/^(?:[•◦‣⁃∙·▪●○*]+ *|[-–—] +)+/, '').trim())
    .filter(Boolean);
}

const intakeLabels = [
  ['nome', 'Nome completo do contratante', /^nome completo do contratante\b/i],
  ['local', 'Local', /^local e ponto de refer[eê]ncia\b/i],
  ['local', 'Local', /^local(?= *:|$)/i],
  ['inicio', 'Horário que inicia', /^hor[aá]rio (?:de )?entrada do papai noel\b/i],
  ['opcao', 'Serviço contratado', /^qual a op[cç][aã]o contratada\b/i],
  ['data', 'Data', /^data(?= *:| +\d|$)/i],
  ['inicio', 'Horário', /^hor[aá]rio(?= *:| +\d|$)/i],
];
const heading = /^dados para o contrato\s*:?$/i;
const otherLabel = /^(?:(?:dados|nome|contratante|cliente|endere[cç]o|contato|telefone|servi[cç]o|extras|valor|total)(?:\s*[:?]|$)|qual (?:a|o)\b)/i;
const amount = String.raw`(?:\d{1,3}(?:\.\d{3})+|\d{1,6})(?:,\d{2}|\.\d{2})?`;
const pricedLine = new RegExp(`^(.+?)(?: *R\\$ *(${amount})| +(${amount})( *reais?)?)$`, 'i');
const knownCharge = /\b(?:recreador(?:es)?|recrea[cç][aã]o|papai noel|pool party|hora extra|horas? adicionais?|esculturas? (?:de|em) bal[oõ]es|som e microfone|ca[cç]a ao tesouro|quebra panela|torta na cara|taxa de deslocamento|oficina)\b|^\d+\s*h\s+adiciona(?:l|is)\b/i;

function normalizePrice(line, context) {
  const match = line.trim().match(pricedLine);
  if (!match) return '';
  const [, description, marked, bare, reais] = match;
  if (!/\p{L}/u.test(description) || (!marked && !reais && !context && !knownCharge.test(description))) return '';
  return `${description.trim()} R$ ${(marked || bare).replace(/\.(?=\d{2}$)/, ',')}`;
}

function prepareContractIntake(text) {
  const lines = normalizeContractLines(text);
  const fields = {};
  const normalized = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (heading.test(line)) continue;
    const label = intakeLabels.find(([, , pattern]) => pattern.test(line));
    if (label) {
      const [field, canonical, pattern] = label;
      let value = line.replace(pattern, '').replace(/^\s*(?::|\?|-\s)+\s*/, '').trim();
      const next = lines[i + 1];
      if (!value && next && !heading.test(next) && !otherLabel.test(next) && !intakeLabels.some(([, , rx]) => rx.test(next))) {
        value = lines[++i];
      }
      fields[field] ||= value;
      const option = field === 'opcao' ? normalizePrice(value, true) || value : value;
      if (value) normalized.push(`${canonical}: ${option}`);
      continue;
    }

    const parts = line.split('+');
    const pricedParts = parts.length > 1 ? parts.map((part) => normalizePrice(part, false)) : [];
    if (pricedParts.length && pricedParts.every(Boolean)) {
      normalized.push(...pricedParts);
    } else {
      normalized.push(line);
    }
  }

  return { text: normalized.join('\n'), fields };
}

module.exports = { normalizeContractLines, prepareContractIntake };
