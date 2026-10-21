const nameLabel = /^(?:nome\s+completo\s+do\s+contratante|nome\s+do\s+cliente|nome\s+cliente|nome|cliente|contratante)\s*:\s*/i;
const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function extractLabeledContractName(text) {
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (nameLabel.test(trimmed)) {
      const name = trimmed.replace(nameLabel, '').trim();
      if (name) return name;
    }
  }
  return '';
}

function isChristmasNightVisit(service) {
  return /\bvisita noite de natal\b/.test(normalize(service).replace(/[^a-z0-9]+/g, ' ').trim());
}

function time(value) {
  const match = String(value || '').match(/^(\d{1,2})(?::|h)(\d{2})?$/i);
  if (!match || +match[1] > 23 || +(match[2] || 0) > 59) return null;
  return +match[1] * 60 + +(match[2] || 0);
}
function formatTime(minutes) {
  const value = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

// Extraction only: never call on save/reopen, where the user's edited end wins.
function applyContractExtractionRules(fields, source) {
  const result = { ...fields };
  result.nome_contratante = extractLabeledContractName(source)
    || String(fields.nome_contratante || '').replace(nameLabel, '').trim();
  const originalName = String(source || '').split(/\r?\n/).find((line) => line.trim().toLowerCase() === result.nome_contratante.toLowerCase());
  if (originalName) result.nome_contratante = originalName.trim();
  const text = normalize(source);
  const token = '(\\d{1,2}(?::\\d{2}|h(?:\\d{2})?))';
  const range = text.match(new RegExp(`\\b${token}\\s*(?:as|a|ate|[-\\u2013\\u2014])\\s*${token}\\b`));
  const endLabel = text.match(new RegExp(`(?:horario\\s+(?:final|fim|de termino)|termino|fim)\\s*:\\s*${token}\\b`));
  if (range && time(range[1]) !== null && time(range[2]) !== null) {
    result.horario_inicio = formatTime(time(range[1]));
    result.horario_fim = formatTime(time(range[2]));
    return result;
  }
  if (endLabel && time(endLabel[1]) !== null) {
    result.horario_fim = formatTime(time(endLabel[1]));
    return result;
  }
  const start = time(fields.horario_inicio);
  if (start === null) return result;
  const duration = text.match(/\bduracao\s*(?:de\s*|:\s*)?(\d+)\s*(minutos?|min\b|horas?|h\b)(?:\s*(?:e\s*)?(\d+)\s*(?:minutos?|min\b))?/);
  const minutes = duration ? +duration[1] * (/^(hora|h)/.test(duration[2]) ? 60 : 1) + +(duration[3] || 0) : null;
  if (minutes > 0) result.horario_fim = formatTime(start + minutes);
  else if (isChristmasNightVisit(fields.servico_contratado)) result.horario_fim = formatTime(start + 20);
  return result;
}

module.exports = { applyContractExtractionRules, extractLabeledContractName, isChristmasNightVisit };
