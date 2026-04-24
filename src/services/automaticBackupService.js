const fs = require('fs/promises');
const path = require('path');
const pool = require('../db');
const { buildZip } = require('./zipBuilder');

const BACKUP_TIMEZONE = 'America/Sao_Paulo';
const BACKUP_ROOT_DIR = process.env.BACKUP_AUTOMATIC_ROOT_DIR
  ? path.resolve(process.env.BACKUP_AUTOMATIC_ROOT_DIR)
  : path.resolve(__dirname, '..', '..', 'backups', 'automaticos');
const BACKUP_RETENTION_COUNT = 30;
const BACKUP_FORMAT_VERSION = '1.0.0';

function pad(number) {
  return String(number).padStart(2, '0');
}

function getBackupDateParts(date) {
  return {
    year: String(date.getFullYear()),
    month: pad(date.getMonth() + 1),
    day: pad(date.getDate()),
    hour: pad(date.getHours()),
    minute: pad(date.getMinutes()),
    second: pad(date.getSeconds()),
  };
}

function buildBackupFileName(date) {
  const parts = getBackupDateParts(date);
  return `backup_automatico_${parts.year}${parts.month}${parts.day}_${parts.hour}${parts.minute}${parts.second}.zip`;
}

function buildBackupId(date) {
  const parts = getBackupDateParts(date);
  return `automatico-${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}

function serializeJsonFile(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

async function ensureBackupDirectory(date) {
  const parts = getBackupDateParts(date);
  const targetDir = path.join(BACKUP_ROOT_DIR, parts.year, parts.month);
  await fs.mkdir(targetDir, { recursive: true });
  return targetDir;
}

async function fetchAgendaEventosFuturos() {
  const result = await pool.query(`
    SELECT *
    FROM eventos
    WHERE data_evento ~ '^\\d{2}/\\d{2}/\\d{4}$'
      AND to_date(data_evento, 'DD/MM/YYYY') >= CURRENT_DATE
    ORDER BY to_date(data_evento, 'DD/MM/YYYY') ASC, hora_inicio ASC NULLS LAST, created_at DESC
  `);
  return result.rows || [];
}

async function fetchAgendaEscalasFuturas(eventoIds) {
  if (!eventoIds.length) return [];
  const result = await pool.query(`
    SELECT *
    FROM escala_eventos
    WHERE evento_id = ANY($1::text[])
    ORDER BY created_at ASC, colaborador_nome ASC
  `, [eventoIds]);
  return result.rows || [];
}

async function fetchAgendaServicosFuturos(eventoIds) {
  if (!eventoIds.length) return [];
  const result = await pool.query(`
    SELECT *
    FROM servico_eventos
    WHERE evento_id = ANY($1::text[])
    ORDER BY created_at ASC, servico_nome ASC
  `, [eventoIds]);
  return result.rows || [];
}

async function fetchFinanceiroEventosCriticos() {
  const result = await pool.query(`
    SELECT
      id,
      contract_id,
      identificador_interno,
      contratante_nome,
      data_evento,
      dia_semana,
      hora_inicio,
      hora_fim,
      valor_total,
      sinal,
      sinal_confirmado,
      saldo_pago,
      resta,
      status_financeiro,
      pagamento_colaborador,
      deslocamento,
      extras,
      custo_total,
      lucro_evento,
      pagamento_pos_evento,
      dt_prevista_pagamento,
      saldo_confirmado,
      metodo_pagamento_sinal,
      metodo_pagamento_saldo,
      created_at
    FROM eventos
    WHERE
      (COALESCE(sinal, 0) > 0 AND COALESCE(sinal_confirmado, FALSE) = FALSE)
      OR
      (COALESCE(resta, 0) > 0 AND COALESCE(LOWER(status_financeiro), '') <> 'finalizado')
      OR
      (COALESCE(pagamento_pos_evento, FALSE) = TRUE AND COALESCE(saldo_confirmado, FALSE) = FALSE)
    ORDER BY
      CASE
        WHEN data_evento ~ '^\\d{2}/\\d{2}/\\d{4}$'
        THEN to_date(data_evento, 'DD/MM/YYYY')
      END ASC NULLS LAST,
      created_at DESC
  `);
  return result.rows || [];
}

async function fetchFinanceiroCiclosTravados() {
  const result = await pool.query(`
    SELECT *
    FROM ciclos_financeiros
    WHERE LOWER(COALESCE(status, '')) = 'travado'
    ORDER BY ano DESC, mes DESC, tipo ASC, created_at DESC
  `);
  return result.rows || [];
}

async function fetchFinanceiroCofrinhosConfig() {
  const result = await pool.query(`
    SELECT *
    FROM cofrinhos_config
    ORDER BY ordem ASC, key ASC
  `);
  return result.rows || [];
}

async function collectAutomaticBackupData() {
  const agendaEventosFuturos = await fetchAgendaEventosFuturos();
  const eventoIds = agendaEventosFuturos.map((evento) => String(evento.id)).filter(Boolean);

  const [
    agendaEscalasFuturas,
    agendaServicosFuturos,
    financeiroEventosCriticos,
    financeiroCiclosTravados,
    financeiroCofrinhosConfig,
  ] = await Promise.all([
    fetchAgendaEscalasFuturas(eventoIds),
    fetchAgendaServicosFuturos(eventoIds),
    fetchFinanceiroEventosCriticos(),
    fetchFinanceiroCiclosTravados(),
    fetchFinanceiroCofrinhosConfig(),
  ]);

  return {
    agendaEventosFuturos,
    agendaEscalasFuturas,
    agendaServicosFuturos,
    financeiroEventosCriticos,
    financeiroCiclosTravados,
    financeiroCofrinhosConfig,
  };
}

function buildManifest({ backupId, generatedAt, fileName, targetDir, datasets }) {
  return {
    backupId,
    tipo: 'automatico',
    geradoEm: generatedAt.toISOString(),
    timezone: BACKUP_TIMEZONE,
    versaoFormato: BACKUP_FORMAT_VERSION,
    arquivoZip: fileName,
    diretorioDestino: targetDir,
    escopos: [
      'agenda_eventos_futuros',
      'agenda_escalas_futuras',
      'agenda_servicos_futuros',
      'financeiro_eventos_criticos',
      'financeiro_ciclos_travados',
      'financeiro_cofrinhos_config',
    ],
    contagens: {
      'agenda_eventos_futuros.json': datasets.agendaEventosFuturos.length,
      'agenda_escalas_futuras.json': datasets.agendaEscalasFuturas.length,
      'agenda_servicos_futuros.json': datasets.agendaServicosFuturos.length,
      'financeiro_eventos_criticos.json': datasets.financeiroEventosCriticos.length,
      'financeiro_ciclos_travados.json': datasets.financeiroCiclosTravados.length,
      'financeiro_cofrinhos_config.json': datasets.financeiroCofrinhosConfig.length,
    },
    retencao: {
      quantidadeMaxima: BACKUP_RETENTION_COUNT,
      politica: 'manter os 30 backups automaticos mais recentes',
    },
  };
}

async function listAllBackupZipFiles(rootDir) {
  let entries = [];
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listAllBackupZipFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.zip')) {
      const stats = await fs.stat(fullPath);
      files.push({ path: fullPath, mtimeMs: stats.mtimeMs });
    }
  }
  return files;
}

async function removeEmptyDirectories(rootDir) {
  let entries = [];
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(rootDir, entry.name);
    await removeEmptyDirectories(fullPath);
    const remaining = await fs.readdir(fullPath);
    if (remaining.length === 0) {
      await fs.rmdir(fullPath);
    }
  }
}

async function applyBackupRetention() {
  const allFiles = await listAllBackupZipFiles(BACKUP_ROOT_DIR);
  const filesToRemove = allFiles
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(BACKUP_RETENTION_COUNT);

  for (const file of filesToRemove) {
    await fs.unlink(file.path);
  }

  await removeEmptyDirectories(BACKUP_ROOT_DIR);

  return {
    totalEncontrado: allFiles.length,
    removidos: filesToRemove.map((file) => file.path),
  };
}

async function generateAutomaticBackup() {
  const generatedAt = new Date();
  const backupId = buildBackupId(generatedAt);
  const targetDir = await ensureBackupDirectory(generatedAt);
  const fileName = buildBackupFileName(generatedAt);
  const filePath = path.join(targetDir, fileName);

  const datasets = await collectAutomaticBackupData();
  const manifest = buildManifest({
    backupId,
    generatedAt,
    fileName,
    targetDir,
    datasets,
  });

  const zipBuffer = buildZip([
    { name: 'manifest.json', content: serializeJsonFile(manifest) },
    { name: 'agenda_eventos_futuros.json', content: serializeJsonFile(datasets.agendaEventosFuturos) },
    { name: 'agenda_escalas_futuras.json', content: serializeJsonFile(datasets.agendaEscalasFuturas) },
    { name: 'agenda_servicos_futuros.json', content: serializeJsonFile(datasets.agendaServicosFuturos) },
    { name: 'financeiro_eventos_criticos.json', content: serializeJsonFile(datasets.financeiroEventosCriticos) },
    { name: 'financeiro_ciclos_travados.json', content: serializeJsonFile(datasets.financeiroCiclosTravados) },
    { name: 'financeiro_cofrinhos_config.json', content: serializeJsonFile(datasets.financeiroCofrinhosConfig) },
  ], generatedAt);

  await fs.writeFile(filePath, zipBuffer);
  const retention = await applyBackupRetention();
  const stats = await fs.stat(filePath);

  return {
    backupId,
    geradoEm: generatedAt.toISOString(),
    timezone: BACKUP_TIMEZONE,
    arquivo: {
      nome: fileName,
      caminho: filePath,
      bytes: stats.size,
    },
    contagens: manifest.contagens,
    retencao: retention,
  };
}

module.exports = {
  BACKUP_ROOT_DIR,
  BACKUP_RETENTION_COUNT,
  BACKUP_TIMEZONE,
  applyBackupRetention,
  buildBackupFileName,
  collectAutomaticBackupData,
  generateAutomaticBackup,
};
