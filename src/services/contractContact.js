const CONTACT_LABEL = '\\b(?:contato|telefone|whats\\s*app|celular)\\s+d[ao]\\s+contratante\\s*[:\\-]?\\s*';

function normalizeContractContact(value) {
  if (value == null) return null;
  const text = String(value).trim().replace(/\s+/g, ' ');
  if (!text || /^(?:n[aã]o informad[oa]|null|undefined|[-–—]+)$/i.test(text)) return null;
  return text;
}

function contactPattern() {
  return new RegExp(`${CONTACT_LABEL}(\\+?\\(?\\d[\\d() \\t+\\-]*\\d|n[aã]o\\s+informad[oa])?`, 'gi');
}

function extractContractContact(text) {
  for (const match of String(text || '').matchAll(contactPattern())) {
    const value = normalizeContractContact(match[1]);
    const digits = value?.replace(/\D/g, '') || '';
    if (digits.length >= 7 && digits.length <= 15) return value;
  }
  return null;
}

// Remove the labeled field before legacy heuristics inspect names and addresses.
function withoutContractContact(text) {
  return String(text || '').replace(contactPattern(), '');
}

module.exports = { normalizeContractContact, extractContractContact, withoutContractContact };
