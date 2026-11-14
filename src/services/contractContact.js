const { normalizeContractLines } = require('./contractInput');

const CONTACT_LABEL = '\\b(?:contato|telefone|whats\\s*app|celular)(?: +d[ao] +contratante|(?= *[:\\-]| +[+(\\d]| *$)) *[:\\-]?\\s*';
const standalonePhone = /^(?:\(\d{2}\)|[1-9]\d) ?(?:9 ?\d{4}|[2-5]\d{3})[- ]?\d{4}$/;
const possibleName = /^\p{L}+(?:[ '-]+\p{L}+)+$/u;

function normalizeContractContact(value) {
  if (value == null) return null;
  const text = String(value).trim().replace(/\s+/g, ' ');
  if (!text || /^(?:n[aã]o informad[oa]|null|undefined|[-–—]+)$/i.test(text)) return null;
  return text;
}

function contactPattern() {
  return new RegExp(`${CONTACT_LABEL}(\\+?\\(?\\d[\\d() \\t+\\-]*\\d|n[aã]o\\s+informad[oa])?`, 'gim');
}

function extractContractContact(text) {
  const lines = normalizeContractLines(text);
  for (const match of lines.join('\n').matchAll(contactPattern())) {
    const value = normalizeContractContact(match[1]);
    const digits = value?.replace(/\D/g, '') || '';
    if (digits.length >= 7 && digits.length <= 15) return value;
  }
  // In the free-form template, a standalone phone immediately follows the customer's name.
  const first = lines[0]?.replace(/^dados(?: para o contrato)?\s*:?$/i, '');
  const [name, phone] = first ? lines : lines.slice(1);
  return possibleName.test(name || '') && standalonePhone.test(phone || '') ? phone : null;
}

// Remove the contact before legacy heuristics inspect names and addresses.
function withoutContractContact(text, contact) {
  return String(text || '').replace(contactPattern(), '').split('\n')
    .filter((line) => !contact || line.trim() !== contact).join('\n');
}

module.exports = { normalizeContractContact, extractContractContact, withoutContractContact };
