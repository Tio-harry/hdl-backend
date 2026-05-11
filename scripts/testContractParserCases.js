const fs = require('fs');
const path = require('path');
const { parseContractText } = require('../src/services/contractTextParser');

const ROOT = path.resolve(__dirname, '..');
const CASES_DIR = path.join(ROOT, 'tests', 'contract-parser-cases');
const REPORT_PATH = path.join(ROOT, 'tests', 'contract-parser-report.md');

const FIELDS_TO_COMPARE = [
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
  'valor_total',
  'entrada',
  'saldo'
];

const NUMERIC_FIELDS = new Set(['valor_total', 'entrada', 'saldo']);
const EMPTY_TOKENS = new Set(['', 'nao informado', 'não informado', 'null', 'undefined']);

function removeBom(value) {
  return String(value || '').replace(/^\uFEFF/, '');
}

function removeAccents(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeText(value) {
  return normalizeSpaces(removeAccents(removeBom(value)).toLowerCase());
}

function isEmptyEquivalent(value) {
  if (value === null || value === undefined) return true;
  return EMPTY_TOKENS.has(normalizeText(value));
}

function formatValue(value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'number') return String(value);
  if (String(value).trim() === '') return '(vazio)';
  return String(value);
}

function canBeNumeric(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'number') return Number.isFinite(value);
  const normalized = String(value).replace(/\./g, '').replace(',', '.').trim();
  return normalized !== '' && !Number.isNaN(Number(normalized));
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  return Number(String(value).replace(/\./g, '').replace(',', '.').trim());
}

function compareField(field, expected, received) {
  if (expected === undefined) {
    return { skipped: true };
  }

  if (NUMERIC_FIELDS.has(field) || (canBeNumeric(expected) && canBeNumeric(received))) {
    if (isEmptyEquivalent(expected) && isEmptyEquivalent(received)) {
      return { ok: true, reason: 'empty-equivalent' };
    }

    if (!canBeNumeric(expected) || !canBeNumeric(received)) {
      return {
        ok: false,
        expected: formatValue(expected),
        received: formatValue(received),
        reason: 'numeric-mismatch'
      };
    }

    const expectedNumber = toNumber(expected);
    const receivedNumber = toNumber(received);
    const diff = Math.abs(expectedNumber - receivedNumber);

    return diff <= 0.01
      ? { ok: true, reason: 'numeric-match' }
      : {
          ok: false,
          expected: formatValue(expectedNumber),
          received: formatValue(receivedNumber),
          reason: 'numeric-diff'
        };
  }

  if (isEmptyEquivalent(expected) && isEmptyEquivalent(received)) {
    return { ok: true, reason: 'empty-equivalent' };
  }

  const normalizedExpected = normalizeText(expected);
  const normalizedReceived = normalizeText(received);

  if (!isEmptyEquivalent(expected) && isEmptyEquivalent(received)) {
    return {
      ok: false,
      expected: formatValue(expected),
      received: formatValue(received),
      reason: 'received-empty'
    };
  }

  return normalizedExpected === normalizedReceived
    ? { ok: true, reason: 'text-match' }
    : {
        ok: false,
        expected: formatValue(expected),
        received: formatValue(received),
        reason: 'text-diff'
      };
}

function loadCases() {
  return fs
    .readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(removeBom(raw));
}

function runCase(caseName) {
  const caseDir = path.join(CASES_DIR, caseName);
  const inputPath = path.join(caseDir, 'entrada.txt');
  const expectedPath = path.join(caseDir, 'esperado.json');
  const inputText = removeBom(fs.readFileSync(inputPath, 'utf8'));
  const expected = readJson(expectedPath);
  const parsed = parseContractText(inputText);
  const extracted = parsed && parsed.extracted ? parsed.extracted : {};

  const okFields = [];
  const failedFields = [];
  const comparedFields = [];

  for (const field of FIELDS_TO_COMPARE) {
    if (!(field in expected)) continue;
    comparedFields.push(field);
    const result = compareField(field, expected[field], extracted[field]);
    if (result.ok) {
      okFields.push(field);
    } else if (!result.skipped) {
      failedFields.push({
        field,
        expected: result.expected,
        received: result.received,
        reason: result.reason
      });
    }
  }

  return {
    caseName,
    status: failedFields.length ? 'FALHOU' : 'OK',
    okFields,
    failedFields,
    comparedFields,
    extracted
  };
}

function buildMarkdown(results, fieldFailures) {
  const total = results.length;
  const okCount = results.filter((item) => item.status === 'OK').length;
  const failedCount = total - okCount;

  const lines = [
    '# Relatório de testes do parser sem IA',
    '',
    `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
    '',
    '## Resumo final',
    '',
    `- Total de casos: ${total}`,
    `- Quantidade OK: ${okCount}`,
    `- Quantidade com falha: ${failedCount}`,
    ''
  ];

  const sortedFailures = Object.entries(fieldFailures).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  lines.push('### Campos que mais falharam', '');
  if (sortedFailures.length === 0) {
    lines.push('- Nenhum campo falhou.');
  } else {
    for (const [field, count] of sortedFailures) {
      lines.push(`- ${field}: ${count}`);
    }
  }

  for (const result of results) {
    lines.push('', `## ${result.caseName}`, '', `- Status geral: **${result.status}**`, `- Campos comparados: ${result.comparedFields.join(', ') || 'nenhum'}`);

    lines.push('- Campos OK:');
    if (result.okFields.length === 0) {
      lines.push('  - Nenhum');
    } else {
      for (const field of result.okFields) {
        lines.push(`  - ${field}`);
      }
    }

    lines.push('- Campos com erro:');
    if (result.failedFields.length === 0) {
      lines.push('  - Nenhum');
    } else {
      for (const failure of result.failedFields) {
        lines.push(`  - campo: ${failure.field}`);
        lines.push(`    - esperado: ${failure.expected}`);
        lines.push(`    - recebido: ${failure.received}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

function printTerminalReport(results, fieldFailures) {
  console.log('=== Testes do parser sem IA ===');
  for (const result of results) {
    console.log(`\n[${result.status}] ${result.caseName}`);
    console.log(`Campos OK (${result.okFields.length}): ${result.okFields.join(', ') || 'nenhum'}`);
    if (result.failedFields.length) {
      console.log('Campos com erro:');
      for (const failure of result.failedFields) {
        console.log(`- ${failure.field}`);
        console.log(`  esperado: ${failure.expected}`);
        console.log(`  recebido: ${failure.received}`);
      }
    } else {
      console.log('Campos com erro: nenhum');
    }
  }

  const total = results.length;
  const okCount = results.filter((item) => item.status === 'OK').length;
  const failedCount = total - okCount;
  console.log('\n=== Resumo final ===');
  console.log(`Total de casos: ${total}`);
  console.log(`Quantidade OK: ${okCount}`);
  console.log(`Quantidade com falha: ${failedCount}`);
  console.log('Campos que mais falharam:');
  const sortedFailures = Object.entries(fieldFailures).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!sortedFailures.length) {
    console.log('- Nenhum campo falhou');
  } else {
    for (const [field, count] of sortedFailures) {
      console.log(`- ${field}: ${count}`);
    }
  }
}

function main() {
  const caseNames = loadCases();
  const results = caseNames.map(runCase);
  const fieldFailures = {};

  for (const result of results) {
    for (const failure of result.failedFields) {
      fieldFailures[failure.field] = (fieldFailures[failure.field] || 0) + 1;
    }
  }

  printTerminalReport(results, fieldFailures);
  const markdown = buildMarkdown(results, fieldFailures);
  fs.writeFileSync(REPORT_PATH, markdown, 'utf8');
  console.log(`\nRelatório Markdown gerado em: ${REPORT_PATH}`);
}

main();
