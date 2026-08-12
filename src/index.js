const multer = require("multer");
const upload = multer();
const { extractTextFromPDFBuffer } = require("./services/pdfTextExtractor");
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();
const { parseContractText } = require("./services/contractTextParser");
const {
  AIContractOrganizerError,
  organizeContractTextWithAI,
} = require('./services/aiContractOrganizerService');
const { parseTextosRapidosContratoImport } = require("./services/textosRapidosContratoImportParser");
const {
  ACCESS_PERMISSIONS,
  ACCESS_PROFILES,
  requireMutationPermission,
  requirePermission,
  requireRole,
} = require('./middleware/authMiddleware');
const { createAuthRouter } = require('./routes/authRoutes');
const { createAdminUsersRouter } = require('./routes/adminUsersRoutes');
const { createHomeSummaryRouter } = require('./routes/homeSummaryRoutes');
const { createAutomaticBackupRouter } = require('./routes/automaticBackupRoutes');
const { startAutomaticBackupScheduler } = require('./services/automaticBackupScheduler');
const { bootstrapInitialGestor, ensureAuthSchema } = require('./services/authService');
const { sendMail } = require('./services/emailService');
const { buildEscalaConfirmacaoEmail } = require('./services/escalaConfirmacaoEmailTemplate');
const { tryBuildEscalaCalendarInvite } = require('./services/calendarInviteService');
const pool = require('./db');

const app = express();

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());
app.use(createAuthRouter());
app.use(createAdminUsersRouter());
app.use(createHomeSummaryRouter());
app.use(createAutomaticBackupRouter());

const CONTRACT_INSERT_FIELDS = [
  'nome_contratante',
  'local',
  'data_evento',
  'horario_inicio',
  'servico_contratado',
  'dia_semana',
  'horario_fim',
  'horario_chegada',
  'qtd_criancas',
  'faixa_etaria',
  'aniversariante',
  'tema',
  'espaco',
  'extras',
  'itens_valores',
  'valor_total',
  'entrada',
  'saldo',
  'empresa_nome',
  'empresa_cnpj',
  'empresa_atendimento',
  'empresa_contato',
  'cidade_emissao',
  'data_emissao',
  'texto_original',
  'pdf_filename',
  'data_geracao'
];

const CONTRACT_UPDATE_FIELDS = CONTRACT_INSERT_FIELDS;
const CONTRACT_JSON_FIELDS = ['itens_valores'];
const CONTRACT_NUMERIC_FIELDS = ['valor_total', 'entrada', 'saldo'];

const ORCAMENTO_FIELDS = [
  'nome_cliente',
  'cliente_nome',
  'nome_contratante',
  'local',
  'data_evento',
  'horario_inicio',
  'servico_contratado',
  'descricao',
  'observacoes',
  'itens_valores',
  'valor_total',
  'entrada',
  'saldo',
  'status',
  'texto_original'
];
const ORCAMENTO_JSON_FIELDS = ['itens_valores', 'dados'];
const ORCAMENTO_NUMERIC_FIELDS = ['valor_total', 'entrada', 'saldo'];

const RECIBO_FIELDS = [
  'numero_recibo',
  'data_emissao',
  'valor',
  'valor_extenso',
  'forma_pagamento',
  'data_recebimento',
  'nome_pagante',
  'cpf_cnpj',
  'telefone',
  'referente',
  'data_evento',
  'cidade_emissao',
  'descricao_servico',
  'observacoes',
  'texto_original'
];
const RECIBO_NUMERIC_FIELDS = ['valor'];

const EVENTO_UPDATE_FIELDS = [
  'sinal_confirmado',
  'checklist',
  'observacoes',
  'status_financeiro',
  'pagamento_colaborador',
  'deslocamento',
  'extras',
  'custo_total',
  'lucro_evento',
  'saldo_pago',
  'resta',
  'valor_total',
  'sinal',
  'status_aceite_praca',
  'qtd_recreadores',
  'servicos_adicionais',
  'servico_contratado',
  'contratante_nome',
  'endereco_evento',
  'data_evento',
  'hora_inicio',
  'hora_fim',
  'cidade',
  'bairro',
  'dia_semana',
  'detalhes_evento',
  'metodo_pagamento_sinal',
  'metodo_pagamento_saldo',
  'dt_pagamento_sinal',
  'dt_pagamento_saldo',
  'pagamento_pos_evento',
  'dt_prevista_pagamento',
  'saldo_confirmado'
];
const EVENTO_JSON_FIELDS = ['checklist'];
const EVENTO_BOOLEAN_FIELDS = ['pagamento_pos_evento', 'saldo_confirmado'];
const EVENTO_NUMERIC_FIELDS = [
  'pagamento_colaborador',
  'deslocamento',
  'extras',
  'custo_total',
  'lucro_evento',
  'saldo_pago',
  'resta',
  'valor_total',
  'sinal',
  'qtd_recreadores'
];

const CICLO_FINANCEIRO_NUMERIC_FIELDS = [
  'total_recebido',
  'retencao_total',
  'caixa_livre',
  'cofrinho_gestor',
  'cofrinho_expansao',
  'cofrinho_reserva',
  'cofrinho_custos_fixos',
  'cofrinho_estoque',
];
const CICLO_FINANCEIRO_INT_FIELDS = ['ano', 'mes', 'qtd_eventos'];
const CICLO_FINANCEIRO_UPDATE_FIELDS = [
  'ano',
  'mes',
  'tipo',
  'status',
  'data_inicio',
  'data_fim',
  ...CICLO_FINANCEIRO_NUMERIC_FIELDS,
  'qtd_eventos',
  'observacoes',
];

const COFRINHO_CONFIG_KEYS = ['gestor', 'expansao', 'reserva', 'custos_fixos', 'estoque'];
const COFRINHO_CONFIG_DEFAULTS = [
  { key: 'gestor', nome: 'Gestor / Pró-labore', percentual: 0.6, ordem: 0 },
  { key: 'expansao', nome: 'Expansão', percentual: 0.16, ordem: 1 },
  { key: 'reserva', nome: 'Reserva', percentual: 0.05, ordem: 2 },
  { key: 'custos_fixos', nome: 'Custos Fixos', percentual: 0.1, ordem: 3 },
  { key: 'estoque', nome: 'Estoque', percentual: 0.09, ordem: 4 },
];

const COLABORADOR_FIELDS = ['nome_colaborador', 'ativo'];
const SERVICO_FIELDS = ['nome_servico', 'ativo'];
const SERVICO_MATERIAL_REQUISITO_UPDATE_FIELDS = [
  'servico_id',
  'item_catalog_id',
  'quantidade_min',
  'obrigatorio',
  'observacao',
  'ativo'
];
const REGION_FIELDS = ['nome_regiao', 'ativa', 'sigla_regiao'];
const VALOR_REFERENCIA_REGIAO_FIELDS = [
  'region_id',
  'nome_servico_funcao',
  'valor_referencia',
  'base_duracao',
  'observacoes',
  'ativo',
];
const PARCERIA_COLABORADOR_FIELDS = [
  'region_id',
  'titulo_parceria',
  'nome_servico_funcao',
  'valor_referencia_especifico',
  'disponibilidade',
  'prioridade_envio',
  'observacoes',
  'ativo',
];
const NATUREZA_ITEM_CATALOG_VALUES = [
  'Permanente em posse',
  'Retornável',
  'Consumível',
];
const ITEM_CATALOG_FIELDS = ['nome_item', 'categoria', 'descricao', 'natureza_item', 'quantidade_total', 'ativo'];
const PERFIL_EQUIPE_UPDATE_FIELDS = [
  'nome_completo',
  'ativo_na_equipe',
  'cpf',
  'rg',
  'email',
  'telefone_contato',
  'telefone_recado',
  'instagram',
  'cep',
  'rua',
  'numero',
  'complemento',
  'bairro',
  'cidade',
  'estado',
  'endereco_completo',
  'quantidade_fardas',
  'material_proprio',
  'possui_materiais_extras',
  'descricao_materiais_extras',
  'nivel_recreacao',
  'nivel_pintura_pele',
  'nivel_escultura_baloes',
  'habilidade_veste_personagem',
  'habilidade_faz_locucao',
  'habilidade_animador_promocional',
  'diferenciais',
  'observacoes',
  'observacoes_gerais',
  'pix_tipo',
  'pix_chave',
];
const PERFIL_EQUIPE_BOOLEAN_FIELDS = new Set([
  'ativo_na_equipe',
  'material_proprio',
  'possui_materiais_extras',
  'habilidade_veste_personagem',
  'habilidade_faz_locucao',
  'habilidade_animador_promocional',
]);
const CATEGORIAS_TEXTO_RAPIDO_CONTRATO = ['Serviços', 'Extras', 'Valores'];
const TEXTOS_RAPIDOS_CONTRATO_FIELDS = ['nome_botao', 'categoria', 'texto', 'ativo', 'ordem'];
const ESCALA_EVENTO_FIELDS = [
  'evento_id',
  'colaborador_id',
  'valor_recreador',
  'funcao',
  'status_pagamento',
  'status_aceite',
  'observacao_escala'
];
const ESCALA_EVENTO_NUMERIC_FIELDS = ['valor_recreador'];
const PAGAMENTOS_ESCALA_COLABORADOR_TIPOS = ['adiantamento', 'pagamento_parcial', 'pagamento_final', 'ajuste'];
const PAGAMENTOS_ESCALA_COLABORADOR_STATUS = ['ativo', 'cancelado'];
const SERVICO_EVENTO_FIELDS = [
  'evento_id',
  'servico_id',
  'servico_nome',
  'nome_servico',
  'status_aceite',
  'valor',
  'quantidade'
];
const SERVICO_EVENTO_NUMERIC_FIELDS = ['valor'];
const EVENTO_LOG_JSON_FIELDS = ['metadata'];

function getProvidedFields(body, fields) {
  return fields.filter((field) => Object.prototype.hasOwnProperty.call(body, field));
}

function normalizeJsonValue(value, fieldName) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      const error = new Error(`JSON invalido no campo ${fieldName}`);
      error.statusCode = 400;
      throw error;
    }
  }

  return JSON.stringify(value);
}

function normalizeContractValue(field, value) {
  if (CONTRACT_JSON_FIELDS.includes(field)) {
    return normalizeJsonValue(value, field);
  }

  if (CONTRACT_NUMERIC_FIELDS.includes(field)) {
    return normalizeNumericValue(value, field);
  }

  return value;
}

function normalizeNumericValue(value, fieldName) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const cleaned = trimmed.includes(',')
      ? trimmed.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
      : trimmed.replace(/[^\d.-]/g, '');
    const number = Number(cleaned);

    if (Number.isFinite(number)) return number;
  }

  const error = new Error(`Numero invalido no campo ${fieldName}`);
  error.statusCode = 400;
  throw error;
}

function moneyOrZero(value) {
  const normalized = normalizeNumericValue(value, 'valor financeiro');
  return normalized === null ? 0 : normalized;
}

function calculateContractResta(contract) {
  if (contract.saldo !== null && contract.saldo !== undefined && contract.saldo !== '') {
    return moneyOrZero(contract.saldo);
  }

  return moneyOrZero(contract.valor_total) - moneyOrZero(contract.entrada);
}

/** Extrai quantidade de recreadores do texto do serviço (ex.: "2 recreadores"). Retorna inteiro ou null. */
function extractQtdRecreadoresFromServico(servicoContratado) {
  const s = servicoContratado == null ? '' : String(servicoContratado).trim();
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s*recreador(?:es)?/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

function normalizeOrcamentoValue(field, value) {
  if (ORCAMENTO_JSON_FIELDS.includes(field)) {
    return normalizeJsonValue(value, field);
  }

  if (ORCAMENTO_NUMERIC_FIELDS.includes(field)) {
    return normalizeNumericValue(value, field);
  }

  return value;
}

function normalizeReciboValue(field, value) {
  if (RECIBO_NUMERIC_FIELDS.includes(field)) {
    return normalizeNumericValue(value, field);
  }

  return value;
}

function normalizeEventoValue(field, value) {
  if (EVENTO_JSON_FIELDS.includes(field)) {
    return normalizeJsonValue(value, field);
  }

  if (EVENTO_BOOLEAN_FIELDS.includes(field)) {
    const b = normalizeBooleanValue(value);
    return b === null ? false : b;
  }

  if (EVENTO_NUMERIC_FIELDS.includes(field)) {
    return normalizeNumericValue(value, field);
  }

  return value;
}

function getEventoFinanceiroNormalizado(evento) {
  const valorTotal = Number(evento?.valor_total) || 0;
  const sinal = Number(evento?.sinal) || 0;
  const saldoPago = Number(evento?.saldo_pago) || 0;
  const sinalConfirmado = evento?.sinal_confirmado ? sinal : 0;
  const resta = Math.max(valorTotal - sinalConfirmado - saldoPago, 0);
  const pagamentoColaborador = Number(evento?.pagamento_colaborador) || 0;
  const deslocamento = Number(evento?.deslocamento) || 0;
  const extras = Number(evento?.extras) || 0;
  const custoTotal = pagamentoColaborador + deslocamento + extras;
  const lucroEvento = valorTotal - custoTotal;

  return {
    valorTotal,
    sinal,
    saldoPago,
    sinalConfirmado,
    resta,
    custoTotal,
    lucroEvento,
  };
}

function normalizePracaDiagnostico(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPracaStatusAceiteFromRegion(region) {
  const nomeBase = String(region?.nome_regiao ?? '').trim();
  const sigla = String(region?.sigla_regiao ?? '').trim().toUpperCase();
  if (!nomeBase) return '';
  const nomeSemUf = nomeBase.replace(/\s*-\s*([A-Z]{2})$/i, '').trim();
  const nome = nomeSemUf || nomeBase;
  if (sigla && !(new RegExp(`\\b${sigla}$`, 'i')).test(nome)) {
    return `${nome} ${sigla}`.trim();
  }
  return nome.trim();
}

async function diagnosticarPracaEquipeEvento(eventoId) {
  await ensureEscalaEventosTable();
  await ensureGestaoEquipeSchema();

  const eventoResult = await pool.query(
    'SELECT id, status_aceite_praca FROM eventos WHERE id = $1',
    [eventoId]
  );

  if (!eventoResult.rowCount) {
    return {
      evento_id: String(eventoId ?? '').trim(),
      praca_ativa_atual: '',
      praca_identificada_equipe: '',
      region_id_identificado: '',
      pode_corrigir: false,
      motivo: 'evento_nao_encontrado',
      quantidade_escalados: 0,
      pracas_encontradas: [],
      colaboradores_sem_praca: [],
      colaboradores_por_praca: [],
    };
  }

  const evento = eventoResult.rows[0];
  const pracaAtivaAtual = String(evento?.status_aceite_praca ?? '').trim();

  const escalasResult = await pool.query(
    `
    SELECT
      ee.id,
      ee.colaborador_id,
      ee.colaborador_nome,
      ee.id_recreador,
      p.region_id,
      r.nome_regiao,
      r.sigla_regiao
    FROM escala_eventos ee
    LEFT JOIN colaborador_perfil_equipe p ON p.colaborador_id = ee.colaborador_id
    LEFT JOIN regions r ON r.id = p.region_id
    WHERE ee.evento_id = $1
    ORDER BY ee.created_at ASC, ee.colaborador_nome ASC
    `,
    [eventoId]
  );

  const escalas = Array.isArray(escalasResult.rows) ? escalasResult.rows : [];
  const quantidadeEscalados = escalas.length;

  if (!quantidadeEscalados) {
    return {
      evento_id: String(evento.id),
      praca_ativa_atual: pracaAtivaAtual,
      praca_identificada_equipe: '',
      region_id_identificado: '',
      pode_corrigir: false,
      motivo: 'sem_equipe_escalada',
      quantidade_escalados: 0,
      pracas_encontradas: [],
      colaboradores_sem_praca: [],
      colaboradores_por_praca: [],
    };
  }

  const colaboradoresSemPraca = [];
  const pracasMap = new Map();

  for (const escala of escalas) {
    const colaboradorId = String(escala?.colaborador_id ?? '').trim();
    const colaboradorNome = String(escala?.colaborador_nome ?? '').trim() || 'Colaborador sem nome';
    const regionId = String(escala?.region_id ?? '').trim();
    const pracaEquipe = buildPracaStatusAceiteFromRegion(escala);

    if (!regionId || !pracaEquipe) {
      colaboradoresSemPraca.push({
        colaborador_id: colaboradorId,
        colaborador_nome: colaboradorNome,
      });
      continue;
    }

    const existente = pracasMap.get(pracaEquipe) || {
      praca: pracaEquipe,
      region_id: regionId,
      quantidade: 0,
      colaboradores: [],
    };

    existente.quantidade += 1;
    existente.colaboradores.push({
      colaborador_id: colaboradorId,
      colaborador_nome: colaboradorNome,
      escala_id: String(escala?.id ?? '').trim(),
      id_recreador: escala?.id_recreador != null ? String(escala.id_recreador).trim() : '',
    });

    pracasMap.set(pracaEquipe, existente);
  }

  const pracasEncontradas = Array.from(pracasMap.keys());
  const colaboradoresPorPraca = Array.from(pracasMap.values());

  if (colaboradoresSemPraca.length > 0) {
    return {
      evento_id: String(evento.id),
      praca_ativa_atual: pracaAtivaAtual,
      praca_identificada_equipe: '',
      region_id_identificado: '',
      pode_corrigir: false,
      motivo: 'colaboradores_sem_praca',
      quantidade_escalados: quantidadeEscalados,
      pracas_encontradas: pracasEncontradas,
      colaboradores_sem_praca: colaboradoresSemPraca,
      colaboradores_por_praca: colaboradoresPorPraca,
    };
  }

  if (pracasEncontradas.length !== 1) {
    return {
      evento_id: String(evento.id),
      praca_ativa_atual: pracaAtivaAtual,
      praca_identificada_equipe: '',
      region_id_identificado: '',
      pode_corrigir: false,
      motivo: 'equipe_mista',
      quantidade_escalados: quantidadeEscalados,
      pracas_encontradas: pracasEncontradas,
      colaboradores_sem_praca: [],
      colaboradores_por_praca: colaboradoresPorPraca,
    };
  }

  const pracaUnica = colaboradoresPorPraca[0] || null;
  const pracaIdentificadaEquipe = String(pracaUnica?.praca ?? '').trim();
  const regionIdIdentificado = String(pracaUnica?.region_id ?? '').trim();
  const mesmaPraca =
    normalizePracaDiagnostico(pracaAtivaAtual) !== '' &&
    normalizePracaDiagnostico(pracaAtivaAtual) === normalizePracaDiagnostico(pracaIdentificadaEquipe);

  return {
    evento_id: String(evento.id),
    praca_ativa_atual: pracaAtivaAtual,
    praca_identificada_equipe: pracaIdentificadaEquipe,
    region_id_identificado: regionIdIdentificado,
    pode_corrigir: !mesmaPraca,
    motivo: mesmaPraca ? 'praca_ja_confere' : 'praca_divergente',
    quantidade_escalados: quantidadeEscalados,
    pracas_encontradas: pracasEncontradas,
    colaboradores_sem_praca: [],
    colaboradores_por_praca: colaboradoresPorPraca,
  };
}

function getMensagemDiagnosticoPracaEquipe(motivo) {
  if (motivo === 'sem_equipe_escalada') {
    return 'Nao foi possivel corrigir porque o evento nao possui equipe escalada.';
  }
  if (motivo === 'colaboradores_sem_praca') {
    return 'Nao foi possivel corrigir porque um ou mais colaboradores nao possuem praca identificada no perfil da equipe.';
  }
  if (motivo === 'equipe_mista') {
    return 'Nao foi possivel corrigir porque a Equipe Escalada possui colaboradores de mais de uma praca.';
  }
  if (motivo === 'praca_ja_confere') {
    return 'A praca ativa ja confere com a praca da Equipe Escalada.';
  }
  return 'Nao foi possivel corrigir a praca pela equipe escalada.';
}

function normalizeCicloFinanceiroValue(field, value) {
  if (CICLO_FINANCEIRO_INT_FIELDS.includes(field)) {
    if (value === null || value === undefined || value === '') {
      const error = new Error(`Valor invalido no campo ${field}`);
      error.statusCode = 400;
      throw error;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) {
      const error = new Error(`Numero invalido no campo ${field}`);
      error.statusCode = 400;
      throw error;
    }
    return Math.trunc(n);
  }

  if (CICLO_FINANCEIRO_NUMERIC_FIELDS.includes(field)) {
    const normalized = normalizeNumericValue(value, field);
    return normalized === null ? 0 : normalized;
  }

  if (field === 'tipo' || field === 'status') {
    return String(value ?? '').trim();
  }

  return value;
}

function normalizeCofrinhoConfigValue(field, value) {
  if (field === 'nome') {
    return String(value ?? '').trim();
  }

  if (field === 'ordem') {
    if (value === null || value === undefined || value === '') return 0;
    const n = Number(value);
    if (!Number.isFinite(n)) {
      const error = new Error(`Numero invalido no campo ${field}`);
      error.statusCode = 400;
      throw error;
    }
    return Math.trunc(n);
  }

  if (field === 'percentual') {
    const normalized = normalizeNumericValue(value, field);
    if (normalized === null) {
      const error = new Error('Percentual do cofrinho é obrigatório');
      error.statusCode = 400;
      throw error;
    }
    if (normalized < 0) {
      const error = new Error('Percentual do cofrinho não pode ser negativo');
      error.statusCode = 400;
      throw error;
    }
    return normalized;
  }

  return value;
}

function normalizeCofrinhoConfigItems(items) {
  if (!Array.isArray(items) || !items.length) {
    const error = new Error('Lista de cofrinhos é obrigatória');
    error.statusCode = 400;
    throw error;
  }

  const normalized = items.map((item, index) => {
    const key = String(item?.key ?? '').trim();
    if (!COFRINHO_CONFIG_KEYS.includes(key)) {
      const error = new Error(`Cofrinho inválido: ${key || 'sem chave'}`);
      error.statusCode = 400;
      throw error;
    }

    const nome = normalizeCofrinhoConfigValue('nome', item?.nome);
    if (!nome) {
      const error = new Error('Todos os cofrinhos precisam ter nome');
      error.statusCode = 400;
      throw error;
    }

    return {
      key,
      nome,
      percentual: normalizeCofrinhoConfigValue('percentual', item?.percentual),
      ordem: normalizeCofrinhoConfigValue('ordem', item?.ordem ?? index),
    };
  });

  const keys = new Set(normalized.map((item) => item.key));
  if (keys.size !== COFRINHO_CONFIG_KEYS.length || COFRINHO_CONFIG_KEYS.some((key) => !keys.has(key))) {
    const error = new Error('A configuração precisa conter exatamente os cinco cofrinhos padrão');
    error.statusCode = 400;
    throw error;
  }

  const total = normalized.reduce((sum, item) => sum + item.percentual, 0);
  if (Math.abs(total - 1) > 0.0001) {
    const error = new Error('A soma dos percentuais precisa fechar em 100%');
    error.statusCode = 400;
    throw error;
  }

  return normalized.sort((a, b) => a.ordem - b.ordem);
}

function normalizeBooleanValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'sim', 'ativo', 'ativa'].includes(normalized)) return true;
    if (['false', '0', 'nao', 'não', 'inativo', 'inativa'].includes(normalized)) return false;
  }

  return Boolean(value);
}

function assertSmrBoolean(value, nomeCampo) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 0) return false;
    if (value === 1) return true;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'sim', 'ativo', 'ativa'].includes(normalized)) return true;
    if (['false', '0', 'nao', 'não', 'inativo', 'inativa'].includes(normalized)) return false;
  }
  const err = new Error(`${nomeCampo} deve ser booleano (true/false)`);
  err.statusCode = 400;
  throw err;
}

function normalizeSmrQuantidadeMin(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    const err = new Error('quantidade_min deve ser inteiro >= 0');
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function normalizeSmrObservacao(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function normalizeCadastroBaseValue(field, value) {
  if (field === 'ativo') return normalizeBooleanValue(value);
  return value;
}

function normalizeRegionValue(field, value) {
  if (field === 'ativa') return normalizeBooleanValue(value);
  if (field === 'nome_regiao') return String(value ?? '').trim();
  if (field === 'sigla_regiao') {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    return s ? s.toUpperCase() : null;
  }
  return value;
}

function normalizeValorReferenciaRegiaoValue(field, value) {
  if (field === 'region_id') {
    const id = String(value ?? '').trim();
    return id || null;
  }

  if (field === 'nome_servico_funcao') {
    return String(value ?? '').trim();
  }

  if (field === 'valor_referencia') {
    const normalized = normalizeNumericValue(value, field);
    if (normalized === null || normalized < 0) {
      const err = new Error('valor_referencia deve ser um numero maior ou igual a zero');
      err.statusCode = 400;
      throw err;
    }
    return normalized;
  }

  if (field === 'base_duracao' || field === 'observacoes') {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text || null;
  }

  if (field === 'ativo') {
    const normalized = normalizeBooleanValue(value);
    return normalized == null ? true : normalized;
  }

  return value;
}

function normalizeParceriaColaboradorValue(field, value) {
  if (field === 'region_id') {
    const id = String(value ?? '').trim();
    return id || null;
  }

  if (field === 'titulo_parceria') {
    return String(value ?? '').trim();
  }

  if (field === 'nome_servico_funcao' || field === 'disponibilidade' || field === 'observacoes') {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text || null;
  }

  if (field === 'valor_referencia_especifico') {
    const normalized = normalizeNumericValue(value, field);
    if (normalized === null || normalized < 0) {
      const err = new Error('valor_referencia_especifico deve ser um numero maior ou igual a zero');
      err.statusCode = 400;
      throw err;
    }
    return normalized;
  }

  if (field === 'prioridade_envio' || field === 'ativo') {
    const normalized = normalizeBooleanValue(value);
    if (field === 'ativo') return normalized == null ? true : normalized;
    return normalized == null ? false : normalized;
  }

  return value;
}

function normalizeItemCatalogValue(field, value) {
  if (field === 'ativo') return normalizeBooleanValue(value);
  if (field === 'nome_item') return String(value ?? '').trim();
  if (field === 'categoria' || field === 'descricao') {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    return s || null;
  }
  if (field === 'natureza_item') {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    if (!s) return null;
    if (!NATUREZA_ITEM_CATALOG_VALUES.includes(s)) {
      const err = new Error(
        `natureza_item invalida. Valores permitidos: ${NATUREZA_ITEM_CATALOG_VALUES.join(', ')}`
      );
      err.statusCode = 400;
      throw err;
    }
    return s;
  }
  if (field === 'quantidade_total') {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      const err = new Error('quantidade_total deve ser um inteiro maior ou igual a zero');
      err.statusCode = 400;
      throw err;
    }
    return n;
  }
  return value;
}

function enrichItemCatalogRow(row) {
  if (!row) return row;
  const emRaw = row.quantidade_em_posse;
  const emPosse =
    typeof emRaw === 'bigint'
      ? Number(emRaw)
      : typeof emRaw === 'number' && Number.isFinite(emRaw)
        ? Math.max(0, Math.floor(emRaw))
        : Math.max(0, parseInt(String(emRaw ?? '0'), 10) || 0);
  const total = row.quantidade_total;
  let disponivel = null;
  if (total != null && Number.isFinite(Number(total)) && Number.isInteger(Number(total)) && Number(total) >= 0) {
    disponivel = Math.max(0, Number(total) - emPosse);
  }
  return { ...row, quantidade_em_posse: emPosse, quantidade_disponivel: disponivel };
}

/** Compara natureza_item do catalogo tolerando acentos/espacos (alinhado a devolucao assistida). */
function normalizeNaturezaItemCatalogCompare(value) {
  if (value == null || value === '') return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isNaturezaRetornavelCatalog(value) {
  return normalizeNaturezaItemCatalogCompare(value) === 'retornavel';
}

function isNaturezaConsumivelCatalog(value) {
  return normalizeNaturezaItemCatalogCompare(value) === 'consumivel';
}

const EQUIPE_ITEM_VINCULO_UPDATE_FIELDS = [
  'item_catalog_id',
  'quantidade',
  'status_item',
  'data_entrega',
  'data_envio',
  'observacoes',
  'descricao_complementar',
];

const EQUIPE_ITEM_STATUS_CANONICAL = {
  reservado: 'Reservado',
  enviado: 'Enviado',
  'em posse': 'Em posse',
};

function normalizeEquipeItemVinculoStatusItem(value) {
  const s = String(value ?? '').trim();
  if (!s) {
    const err = new Error('status_item invalido. Valores permitidos: Reservado, Enviado, Em posse');
    err.statusCode = 400;
    throw err;
  }
  const key = s.toLowerCase().replace(/\s+/g, ' ');
  if (EQUIPE_ITEM_STATUS_CANONICAL[key]) {
    return EQUIPE_ITEM_STATUS_CANONICAL[key];
  }
  if (key.replace(/\s/g, '') === 'emposse') {
    return 'Em posse';
  }
  const err = new Error('status_item invalido. Valores permitidos: Reservado, Enviado, Em posse');
  err.statusCode = 400;
  throw err;
}

function normalizeEquipeItemVinculoDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const err = new Error('Datas devem estar no formato YYYY-MM-DD');
    err.statusCode = 400;
    throw err;
  }
  return s;
}

function normalizeEquipeItemVinculoQuantidade(value, allowDefaultOne) {
  if (value === null || value === undefined || value === '') {
    if (allowDefaultOne) return 1;
    const err = new Error('quantidade e obrigatoria');
    err.statusCode = 400;
    throw err;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    const err = new Error('quantidade deve ser inteiro maior ou igual a 1');
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function normalizeEquipeItemVinculoOptionalText(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function normalizeEquipeItemVinculoCatalogId(value) {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * Garante que a soma das quantidades em colaborador_item_catalog para o item
 * (excluindo excludeVinculoId, se informado) mais quantidadeLinha nao ultrapassa quantidade_total.
 * Trava a linha do item_catalog para concorrencia.
 */
async function assertEstoqueItemCatalogDisponivel(client, itemCatalogId, quantidadeLinha, excludeVinculoId) {
  const cat = await client.query(
    'SELECT id, quantidade_total, ativo FROM item_catalog WHERE id = $1 FOR UPDATE',
    [itemCatalogId]
  );
  if (!cat.rowCount) {
    const err = new Error('Item do catalogo nao encontrado');
    err.statusCode = 404;
    throw err;
  }
  const row = cat.rows[0];
  if (row.ativo === false) {
    const err = new Error('Item do catalogo inativo');
    err.statusCode = 400;
    throw err;
  }
  const total = row.quantidade_total;
  if (total == null) return;

  let sql =
    'SELECT COALESCE(SUM(quantidade), 0) AS s FROM colaborador_item_catalog WHERE item_catalog_id = $1';
  const params = [itemCatalogId];
  if (excludeVinculoId) {
    sql += ' AND id != $2';
    params.push(excludeVinculoId);
  }
  const sumRes = await client.query(sql, params);
  const used = Number(sumRes.rows[0].s) || 0;
  const after = used + quantidadeLinha;
  if (after > Number(total)) {
    const err = new Error(
      `Estoque insuficiente para este item (em posse: ${used}, limite no catalogo: ${total}).`
    );
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Como assertEstoqueItemCatalogDisponivel, mas exclui varias linhas da soma (ex.: fundir dois vinculos).
 */
async function assertEstoqueItemCatalogDisponivelExcluindoIds(client, itemCatalogId, quantidadeLinha, excludeIds) {
  const cat = await client.query(
    'SELECT id, quantidade_total, ativo FROM item_catalog WHERE id = $1 FOR UPDATE',
    [itemCatalogId]
  );
  if (!cat.rowCount) {
    const err = new Error('Item do catalogo nao encontrado');
    err.statusCode = 404;
    throw err;
  }
  const row = cat.rows[0];
  if (row.ativo === false) {
    const err = new Error('Item do catalogo inativo');
    err.statusCode = 400;
    throw err;
  }
  const total = row.quantidade_total;
  if (total == null) return;

  let sql =
    'SELECT COALESCE(SUM(quantidade), 0) AS s FROM colaborador_item_catalog WHERE item_catalog_id = $1';
  const params = [itemCatalogId];
  const ids = (excludeIds || []).filter(Boolean);
  for (let i = 0; i < ids.length; i++) {
    sql += ` AND id != $${params.length + 1}`;
    params.push(ids[i]);
  }
  const sumRes = await client.query(sql, params);
  const used = Number(sumRes.rows[0].s) || 0;
  const after = used + quantidadeLinha;
  if (after > Number(total)) {
    const err = new Error(
      `Estoque insuficiente para este item (em posse: ${used}, limite no catalogo: ${total}).`
    );
    err.statusCode = 400;
    throw err;
  }
}

function normalizeEquipeItemVinculoUpdateField(field, value) {
  if (field === 'item_catalog_id') return normalizeEquipeItemVinculoCatalogId(value);
  if (field === 'quantidade') return normalizeEquipeItemVinculoQuantidade(value, false);
  if (field === 'data_entrega' || field === 'data_envio') return normalizeEquipeItemVinculoDate(value);
  if (field === 'status_item') {
    const t = normalizeEquipeItemVinculoOptionalText(value);
    if (t == null) {
      const err = new Error('status_item invalido. Valores permitidos: Reservado, Enviado, Em posse');
      err.statusCode = 400;
      throw err;
    }
    return normalizeEquipeItemVinculoStatusItem(t);
  }
  if (field === 'observacoes' || field === 'descricao_complementar') {
    return normalizeEquipeItemVinculoOptionalText(value);
  }
  return value;
}

function normalizePerfilEquipeValue(field, value) {
  if (PERFIL_EQUIPE_BOOLEAN_FIELDS.has(field)) {
    return normalizeBooleanValue(value);
  }

  if (field === 'quantidade_fardas') {
    if (value === null || value === undefined || value === '') return null;
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) {
      const error = new Error('Numero invalido no campo quantidade_fardas');
      error.statusCode = 400;
      throw error;
    }
    return n;
  }

  if (field === 'region_id') {
    const s = String(value ?? '').trim();
    return s || null;
  }

  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    return t || null;
  }

  return value;
}

function normalizeTextoRapidoContratoValue(field, value) {
  if (field === 'ativo') return normalizeBooleanValue(value);
  if (field === 'ordem') {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : 0;
  }
  if (field === 'nome_botao') return String(value ?? '').trim();
  if (field === 'categoria') return String(value ?? '').trim();
  if (field === 'texto') return String(value ?? '').trimEnd();
  return value;
}

function normalizeServicoEventoValue(field, value) {
  if (field === 'quantidade') {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      const err = new Error('quantidade deve ser inteiro maior ou igual a 1');
      err.statusCode = 400;
      throw err;
    }
    return n;
  }
  if (SERVICO_EVENTO_NUMERIC_FIELDS.includes(field)) {
    return normalizeNumericValue(value, field);
  }

  return value;
}

function normalizeEscalaEventoValue(field, value) {
  if (ESCALA_EVENTO_NUMERIC_FIELDS.includes(field)) {
    const normalized = normalizeNumericValue(value, field);
    if (normalized !== null && normalized < 0) {
      const err = new Error(`${field} deve ser maior ou igual a zero`);
      err.statusCode = 400;
      throw err;
    }
    return normalized;
  }

  if (field === 'observacao_escala') {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized || null;
  }

  return value;
}

function normalizePagamentoEscalaColaboradorValue(field, value) {
  if (field === 'valor') {
    const normalized = normalizeNumericValue(value, field);
    if (normalized === null || normalized <= 0) {
      const err = new Error('valor deve ser maior que zero');
      err.statusCode = 400;
      throw err;
    }
    return normalized;
  }

  if (field === 'tipo_pagamento') {
    const normalized = String(value || 'adiantamento').trim().toLowerCase();
    if (!PAGAMENTOS_ESCALA_COLABORADOR_TIPOS.includes(normalized)) {
      const err = new Error('tipo_pagamento invalido');
      err.statusCode = 400;
      throw err;
    }
    return normalized;
  }

  if (field === 'status') {
    const normalized = String(value || 'ativo').trim().toLowerCase();
    if (!PAGAMENTOS_ESCALA_COLABORADOR_STATUS.includes(normalized)) {
      const err = new Error('status invalido');
      err.statusCode = 400;
      throw err;
    }
    return normalized;
  }

  if (field === 'observacao') {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized || null;
  }

  if (field === 'data_pagamento') {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const normalized = String(value).trim();
    const dateOnlyMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const parsed = dateOnlyMatch ? new Date(`${normalized}T12:00:00`) : new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      const err = new Error('data_pagamento invalida');
      err.statusCode = 400;
      throw err;
    }
    return parsed;
  }

  return value;
}

const DATA_EVENTO_BR_QUERY_RE = /^\d{2}\/\d{2}\/\d{4}$/;

/** Query string opcional: vazio -> null; senao exige DD/MM/AAAA. */
function parseOptionalFiltroDataEventoBR(queryValue, nomeParam) {
  if (queryValue === undefined || queryValue === null) {
    return { ok: true, value: null };
  }
  const s = String(queryValue).trim();
  if (!s) return { ok: true, value: null };
  if (!DATA_EVENTO_BR_QUERY_RE.test(s)) {
    return { ok: false, erro: `${nomeParam} invalido. Use o formato DD/MM/AAAA.` };
  }
  return { ok: true, value: s };
}

function compareDataEventoBR(a, b) {
  const [da, ma, ya] = a.split('/').map(Number);
  const [db, mb, yb] = b.split('/').map(Number);
  return ya * 10000 + ma * 100 + da - (yb * 10000 + mb * 100 + db);
}

function isValidCalendarDataEventoBR(s) {
  const [d, m, y] = s.split('/').map(Number);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function parseCadastroLines(text, fieldName) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line
      .replace(/^[\s\d.)\-–—•*]+/, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)
    .map((name) => ({ [fieldName]: name, ativo: true }));
}

function normalizeReciboText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function cleanReciboValue(value) {
  return String(value || '')
    .replace(/^[\s:;\-–—]+/, '')
    .replace(/[\s;|]+$/g, '')
    .trim();
}

function splitReciboLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function pickReciboByLabels(text, labels) {
  const lines = splitReciboLines(text);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const normalizedLine = normalizeReciboText(line);

    for (const label of labels) {
      const normalizedLabel = normalizeReciboText(label);

      if (normalizedLine === normalizedLabel) {
        return cleanReciboValue(lines[i + 1] || '');
      }

      if (normalizedLine.startsWith(`${normalizedLabel}:`)) {
        return cleanReciboValue(line.slice(line.indexOf(':') + 1));
      }

      if (normalizedLine.startsWith(`${normalizedLabel} - `)) {
        return cleanReciboValue(line.slice(label.length + 3));
      }

      if (normalizedLine.startsWith(`${normalizedLabel} `)) {
        return cleanReciboValue(line.slice(label.length));
      }
    }
  }

  return '';
}

function pickReciboByRegex(text, regex) {
  const match = String(text || '').match(regex);
  return match && match[1] ? cleanReciboValue(match[1]) : '';
}

function pickFirstUsefulReciboLine(text) {
  const blockedPrefixes = /^(?:cpf|cnpj|rua|avenida|av\.?|evento|servi[cÃ§]o|servico|data|valor|telefone|contato|observa[cÃ§][aÃ£]o|observacao|obs)\b/i;

  for (const line of splitReciboLines(text)) {
    const cleaned = cleanReciboValue(line);
    if (!cleaned) continue;
    if (blockedPrefixes.test(normalizeReciboText(cleaned))) continue;
    return cleaned;
  }

  return '';
}

function parseReciboValor(text) {
  const preferred =
    pickReciboByLabels(text, ['valor pago/recebido', 'valor pago', 'valor recebido', 'sinal', 'entrada']) ||
    pickReciboByRegex(text, /(?:valor\s+pago\s*\/\s*recebido(?:\s*\([^)]*\))?|valor pago|valor recebido|sinal|entrada)\s*:?\s*(r\$\s*[\d.,]+|[\d.,]+)/i);

  const fallback =
    pickReciboByLabels(text, ['valor total', 'valor']) ||
    pickReciboByRegex(text, /(?:valor total|valor)\s*:?\s*(r\$\s*[\d.,]+|[\d.,]+)/i) ||
    pickReciboByRegex(text, /(r\$\s*[\d.,]+)/i);

  const rawValue = preferred || fallback;
  if (!rawValue) return null;

  try {
    return normalizeNumericValue(rawValue, 'valor');
  } catch {
    return null;
  }
}

function parseReciboText(text) {
  const numeroRaw = pickReciboByLabels(text, ['numero recibo', 'número recibo', 'recibo numero', 'recibo nº', 'recibo n']) ||
    pickReciboByRegex(text, /recibo\s*(?:n[ºo.]?|numero|número)?\s*:?\s*(\d+)/i);
  const numeroMatch = String(numeroRaw || '').match(/\d+/);
  const looseNumeroMatch = numeroMatch ? null : String(text || '').match(/recibo\s*n\D{0,5}(\d+)/i);

  return {
    numero_recibo: numeroMatch ? Number(numeroMatch[0]) : (looseNumeroMatch ? Number(looseNumeroMatch[1]) : null),
    nome_pagante:
      pickReciboByLabels(text, ['cliente', 'pagante', 'recebemos de', 'recebi de', 'nome']) ||
      pickReciboByRegex(text, /(?:recebemos|recebi)\s+de\s+([^\n\r,.;]+)/i),
    cpf_cnpj_pagante:
      pickReciboByLabels(text, ['cpf/cnpj', 'cpf cnpj', 'cpf', 'cnpj']) ||
      pickReciboByRegex(text, /\b(?:cpf\/cnpj|cpf|cnpj)\s*:?\s*([0-9.\-/]+)/i),
    telefone_pagante:
      pickReciboByLabels(text, ['telefone', 'contato', 'celular']) ||
      pickReciboByRegex(text, /\b(?:telefone|contato|celular)\s*:?\s*([()+\-\s\d]{8,})/i),
    valor: parseReciboValor(text),
    valor_extenso: pickReciboByLabels(text, ['valor por extenso', 'valor extenso']),
    forma_pagamento: pickReciboByLabels(text, ['forma de pagamento', 'pagamento', 'forma pagamento']),
    data_recebimento:
      pickReciboByLabels(text, ['data recebimento', 'data de recebimento', 'data do recebimento', 'recebido em']),
    referente_a: pickReciboByLabels(text, ['referente a', 'referente', 'serviço', 'servico']),
    data_evento: pickReciboByLabels(text, ['data do evento', 'data evento']),
    descricao: pickReciboByLabels(text, ['descrição do serviço', 'descricao do servico', 'descrição', 'descricao']),
    observacoes: pickReciboByLabels(text, ['observações', 'observacoes', 'obs'])
  };
}

function completeReciboExtraction(extracted, text) {
  const looseNumeroMatch = extracted.numero_recibo ? null : String(text || '').match(/recibo\s*n\D{0,5}(\d+)/i);

  return {
    ...extracted,
    numero_recibo: extracted.numero_recibo || (looseNumeroMatch ? Number(looseNumeroMatch[1]) : null),
    nome_pagante: extracted.nome_pagante || pickFirstUsefulReciboLine(text),
    descricao: extracted.descricao || pickReciboByRegex(text, /descri\S*\s*:?\s*([^\n\r]+)/i)
  };
}

function isReciboPdfLabel(line, labels) {
  const normalizedLine = normalizeReciboText(line);
  return labels.some((label) => {
    const normalizedLabel = normalizeReciboText(label);
    return (
      normalizedLine === normalizedLabel ||
      normalizedLine.startsWith(`${normalizedLabel}:`) ||
      normalizedLine.startsWith(`${normalizedLabel} `) ||
      normalizedLine.startsWith(`${normalizedLabel} - `)
    );
  });
}

function extractReciboPdfSection(text, startLabels, endLabels) {
  const lines = splitReciboLines(text);
  const section = [];
  let collecting = false;

  for (const line of lines) {
    if (!collecting && isReciboPdfLabel(line, startLabels)) {
      collecting = true;
      continue;
    }

    if (collecting && isReciboPdfLabel(line, endLabels)) {
      break;
    }

    if (collecting) section.push(line);
  }

  return section.join('\n');
}

function pickReciboPdfByLabels(text, labels) {
  return pickReciboByLabels(text, labels);
}

function parseReciboPdfMoney(value) {
  const moneyMatch = String(value || '').match(/r\$\s*[\d.,]+/i);
  if (!moneyMatch) return null;

  try {
    return normalizeNumericValue(moneyMatch[0], 'valor');
  } catch {
    return null;
  }
}

function pickReciboPdfMoneyByLabels(text, labels) {
  const lines = splitReciboLines(text);

  for (let i = 0; i < lines.length; i++) {
    if (!isReciboPdfLabel(lines[i], labels)) continue;

    const current = parseReciboPdfMoney(lines[i]);
    if (current !== null) return current;

    const next = parseReciboPdfMoney(lines[i + 1]);
    if (next !== null) return next;
  }

  return null;
}

function buildReciboPdfDescricao({ servicoContratado, informacoes, extras, local }) {
  return [
    servicoContratado ? `Servi\u00e7o contratado: ${servicoContratado}.` : '',
    informacoes ? `Informa\u00e7\u00f5es: ${informacoes}.` : '',
    extras ? `Extras: ${extras}.` : '',
    local ? `Local: ${local}.` : ''
  ].filter(Boolean).join(' ');
}

function parseReciboPdfText(text) {
  const eventSection = extractReciboPdfSection(text, ['dados do evento'], ['detalhes do evento', 'valores', 'contratante', 'contratada']);
  const detailsSection = extractReciboPdfSection(text, ['detalhes do evento'], ['valores', 'contratante', 'contratada']);
  const nomePagante = pickReciboPdfByLabels(text, ['contratante']);
  const servicoContratado = pickReciboPdfByLabels(detailsSection || text, ['servi\u00e7o contratado', 'servico contratado']);
  const informacoes = pickReciboPdfByLabels(detailsSection || text, ['informa\u00e7\u00f5es', 'informacoes']);
  const extras = pickReciboPdfByLabels(detailsSection || text, ['extras']);
  const local = pickReciboPdfByLabels(eventSection || text, ['local']);
  const dataEvento = pickReciboPdfByLabels(eventSection || text, ['data']);

  return {
    numero_recibo: null,
    nome_pagante: nomePagante,
    cpf_cnpj_pagante: '',
    telefone_pagante: '',
    valor: pickReciboPdfMoneyByLabels(text, ['entrada (50%)', 'entrada']),
    valor_extenso: '',
    forma_pagamento: '',
    data_recebimento: '',
    referente_a: servicoContratado,
    data_evento: dataEvento,
    descricao: buildReciboPdfDescricao({ servicoContratado, informacoes, extras, local }),
    observacoes: ''
  };
}

function getOrcamentoCliente(body) {
  return body.nome_cliente || body.cliente_nome || body.nome_contratante || null;
}

function buildOrcamentoDados(body) {
  return normalizeJsonValue(body || {}, 'dados');
}

function getEmbeddedDados(body) {
  if (!body || body.dados === null || body.dados === undefined || body.dados === '') {
    return {};
  }

  if (typeof body.dados === 'string') {
    try {
      return JSON.parse(body.dados);
    } catch {
      return {};
    }
  }

  if (typeof body.dados === 'object' && !Array.isArray(body.dados)) {
    return body.dados;
  }

  return {};
}

function normalizeOrcamentoBody(body) {
  return {
    ...getEmbeddedDados(body),
    ...body
  };
}

function formatOrcamento(row) {
  const dados = row.dados || {};

  return {
    ...dados,
    id: row.id,
    nome_cliente: row.nome_cliente ?? dados.nome_cliente ?? dados.cliente_nome ?? dados.nome_contratante,
    cliente_nome: dados.cliente_nome ?? row.nome_cliente ?? dados.nome_cliente ?? dados.nome_contratante,
    nome_contratante: dados.nome_contratante ?? row.nome_cliente ?? dados.nome_cliente ?? dados.cliente_nome,
    local: row.local ?? dados.local,
    data_evento: row.data_evento ?? dados.data_evento,
    horario_inicio: row.horario_inicio ?? dados.horario_inicio,
    servico_contratado: row.servico_contratado ?? dados.servico_contratado,
    descricao: row.descricao ?? dados.descricao,
    observacoes: row.observacoes ?? dados.observacoes,
    itens_valores: row.itens_valores ?? dados.itens_valores,
    valor_total: row.valor_total ?? dados.valor_total,
    entrada: row.entrada ?? dados.entrada,
    saldo: row.saldo ?? dados.saldo,
    status: row.status ?? dados.status,
    texto_original: row.texto_original ?? dados.texto_original,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function normalizeOrcamentoPdfText(text) {
  return String(text || '')
    .replace(/([a-záàâãéêíóôõúç])([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/g, '$1\n$2')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      const normalized = line
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

      if (!normalized) return false;
      if (/^-*\s*\d+\s+of\s+\d+\s*-*$/i.test(normalized)) return false;
      if (/\bcnpj\b/i.test(normalized)) return false;
      if (normalized.startsWith('nome fantasia')) return false;
      if (normalized.startsWith('nome empresarial')) return false;
      if (normalized.startsWith('atendimento:')) return false;

      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseOrcamentoMoney(value) {
  const raw = String(value || '');
  const moneyMatch = raw.match(/r\$\s*[\d.,]+/i);
  if (moneyMatch) return normalizeNumericValue(moneyMatch[0], 'valor financeiro');

  const numberMatch = raw.match(/\b\d[\d.]*,\d{2}\b|\b\d+(?:[.,]\d{2})?\b/);
  return numberMatch ? normalizeNumericValue(numberMatch[0], 'valor financeiro') : null;
}

function cleanOrcamentoItemDescription(value) {
  return String(value || '')
    .replace(/^[\s•\-–—]+/, '')
    .replace(/^\d+\s*[\).]\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[:\-–—]\s*$/, '')
    .trim();
}

function normalizeOrcamentoLine(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatOrcamentoDescription(value) {
  const cleaned = cleanOrcamentoItemDescription(value);
  const normalized = normalizeOrcamentoLine(cleaned);

  if (/\btaxa\b/.test(normalized) && /\bgest/.test(normalized)) {
    return cleaned
      .toLocaleLowerCase('pt-BR')
      .replace(/(^|[\s([{])(\p{L})/gu, (_, prefix, char) => prefix + char.toLocaleUpperCase('pt-BR'))
      .replace(/\b(De|Da|Do|E)\b/g, (word) => word.toLocaleLowerCase('pt-BR'));
  }

  return cleaned;
}

function isPendingInvestmentTitle(line) {
  const normalized = normalizeOrcamentoLine(line);

  if (!normalized || /r\$\s*[\d.,]+/i.test(line)) return false;
  if (/^valor\b/.test(normalized) || /^total\b/.test(normalized)) return false;

  return (
    /\btaxa\b/.test(normalized) ||
    /\bgest/.test(normalized) ||
    /\boper/.test(normalized)
  );
}

function parseOrcamentoOptionTitle(line) {
  const normalized = normalizeOrcamentoLine(line);
  const match =
    normalized.match(/^opcao\s*0?(\d+)\b/) ||
    normalized.match(/^op\S*o\s*0?(\d+)\b/) ||
    normalized.match(/^op\S*\s+0?(\d+)\b/);

  if (!match) return null;

  return {
    numero: Number(match[1]),
    titulo: cleanOrcamentoItemDescription(line)
  };
}

function extractMoneyFromCurrentOrNextLine(lines, index) {
  const current = parseOrcamentoMoney(lines[index]);
  if (current !== null) return { valor: current, nextIndex: index };

  const next = lines[index + 1] ? parseOrcamentoMoney(lines[index + 1]) : null;
  if (next !== null) return { valor: next, nextIndex: index + 1 };

  return { valor: null, nextIndex: index };
}

function extractOrcamentoInvestment(text) {
  const lines = normalizeOrcamentoPdfText(text).split(/\r?\n/).filter(Boolean);
  const itens = [];
  const opcoes = [];
  let currentOption = null;
  let pendingDescricao = '';
  let valorTotal = 0;

  function addItem(item) {
    if (currentOption) {
      currentOption.itens_valores.push(item);
      return;
    }

    itens.push(item);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const normalized = normalizeOrcamentoLine(line);
    const optionTitle = parseOrcamentoOptionTitle(line);

    if (optionTitle) {
      currentOption = {
        ...optionTitle,
        itens_valores: [],
        valor_total: 0
      };
      opcoes.push(currentOption);
      pendingDescricao = '';
      continue;
    }

    if (/\b(?:valor|investimento)\s+total\b/.test(normalized)) {
      const { valor: total, nextIndex } = extractMoneyFromCurrentOrNextLine(lines, i);
      if (total !== null) {
        if (currentOption) {
          currentOption.valor_total = total;
        } else {
          valorTotal = total;
        }
      }
      i = nextIndex;
      continue;
    }

    if (isPendingInvestmentTitle(line)) {
      pendingDescricao = formatOrcamentoDescription(line);
      continue;
    }

    if (pendingDescricao && (/^valor\b/.test(normalized) || /^r\$\s*[\d.,]+/i.test(line))) {
      const { valor, nextIndex } = extractMoneyFromCurrentOrNextLine(lines, i);
      if (valor !== null) {
        addItem({ descricao: pendingDescricao, valor });
      }
      pendingDescricao = '';
      i = nextIndex;
      continue;
    }

    const itemMatch = line.match(/^(.+?)\s*:?\s*r\$\s*[\d.,]+/i);
    if (!itemMatch) continue;

    const descricao = formatOrcamentoDescription(itemMatch[1]);
    if (!descricao || /^total\b/i.test(descricao) || /^valor\s+total\b/i.test(descricao)) continue;

    const valor = parseOrcamentoMoney(line);
    if (valor !== null) addItem({ descricao, valor });
  }

  for (const opcao of opcoes) {
    if (!opcao.valor_total && opcao.itens_valores.length) {
      opcao.valor_total = opcao.itens_valores.reduce((total, item) => total + Number(item.valor || 0), 0);
    }
  }

  if (opcoes.length > 1) {
    return {
      itens_valores: [],
      valor_total: null,
      multiplas_opcoes: true,
      opcoes_investimento: opcoes
    };
  }

  if (opcoes.length === 1) {
    return {
      itens_valores: opcoes[0].itens_valores,
      valor_total: opcoes[0].valor_total,
      multiplas_opcoes: false,
      opcoes_investimento: opcoes
    };
  }

  if (!valorTotal && itens.length) {
    valorTotal = itens.reduce((total, item) => total + Number(item.valor || 0), 0);
  }

  return {
    itens_valores: itens,
    valor_total: valorTotal,
    multiplas_opcoes: false,
    opcoes_investimento: []
  };
}

async function ensureOrcamentosTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orcamentos (
      id TEXT PRIMARY KEY,
      nome_cliente TEXT,
      local TEXT,
      data_evento TEXT,
      horario_inicio TEXT,
      servico_contratado TEXT,
      descricao TEXT,
      observacoes TEXT,
      itens_valores JSONB,
      valor_total NUMERIC(10,2),
      entrada NUMERIC(10,2),
      saldo NUMERIC(10,2),
      status TEXT DEFAULT 'Em aberto',
      texto_original TEXT,
      dados JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function ensureRecibosTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recibos (
      id TEXT PRIMARY KEY,
      numero_recibo INTEGER,
      data_emissao TEXT,
      valor NUMERIC(10,2),
      valor_extenso TEXT,
      forma_pagamento TEXT,
      data_recebimento TEXT,
      nome_pagante TEXT,
      cpf_cnpj TEXT,
      telefone TEXT,
      referente TEXT,
      data_evento TEXT,
      cidade_emissao TEXT,
      descricao_servico TEXT,
      observacoes TEXT,
      texto_original TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function ensureColaboradoresTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS colaboradores (
      id TEXT PRIMARY KEY,
      nome_colaborador TEXT NOT NULL,
      id_recreador TEXT,
      ativo BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS id_recreador TEXT`);
  await pool.query(`ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE`);
  await pool.query(`ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
}

async function ensureServicosTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS servicos (
      id TEXT PRIMARY KEY,
      nome_servico TEXT NOT NULL,
      ativo BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE servicos ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE`);
  await pool.query(`ALTER TABLE servicos ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`ALTER TABLE servicos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
}

async function ensureTextosRapidosContratoTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS textos_rapidos_contrato (
      id TEXT PRIMARY KEY,
      nome_botao TEXT NOT NULL,
      categoria TEXT NOT NULL,
      texto TEXT NOT NULL,
      ativo BOOLEAN DEFAULT TRUE,
      ordem INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE textos_rapidos_contrato ADD COLUMN IF NOT EXISTS nome_botao TEXT`);
  await pool.query(`ALTER TABLE textos_rapidos_contrato ADD COLUMN IF NOT EXISTS categoria TEXT`);
  await pool.query(`ALTER TABLE textos_rapidos_contrato ADD COLUMN IF NOT EXISTS texto TEXT`);
  await pool.query(`ALTER TABLE textos_rapidos_contrato ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE`);
  await pool.query(`ALTER TABLE textos_rapidos_contrato ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE textos_rapidos_contrato ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`ALTER TABLE textos_rapidos_contrato ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
}

async function ensureEscalaEventosTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS escala_eventos (
      id TEXT PRIMARY KEY,
      evento_id TEXT NOT NULL,
      colaborador_id TEXT,
      colaborador_nome TEXT,
      id_recreador TEXT,
      valor_recreador NUMERIC(10,2),
      funcao TEXT DEFAULT 'Recreador',
      status_pagamento TEXT DEFAULT 'Pendente',
      status_aceite TEXT DEFAULT 'Pendente',
      observacao_escala TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE escala_eventos ADD COLUMN IF NOT EXISTS evento_id TEXT`);
  await pool.query(`ALTER TABLE escala_eventos ADD COLUMN IF NOT EXISTS colaborador_id TEXT`);
  await pool.query(`ALTER TABLE escala_eventos ADD COLUMN IF NOT EXISTS colaborador_nome TEXT`);
  await pool.query(`ALTER TABLE escala_eventos ADD COLUMN IF NOT EXISTS id_recreador TEXT`);
  await pool.query(`ALTER TABLE escala_eventos ADD COLUMN IF NOT EXISTS valor_recreador NUMERIC(10,2)`);
  await pool.query(`ALTER TABLE escala_eventos ADD COLUMN IF NOT EXISTS funcao TEXT DEFAULT 'Recreador'`);
  await pool.query(`ALTER TABLE escala_eventos ADD COLUMN IF NOT EXISTS status_pagamento TEXT DEFAULT 'Pendente'`);
  await pool.query(`ALTER TABLE escala_eventos ADD COLUMN IF NOT EXISTS status_aceite TEXT DEFAULT 'Pendente'`);
  await pool.query(`ALTER TABLE escala_eventos ADD COLUMN IF NOT EXISTS observacao_escala TEXT`);
  await pool.query(`ALTER TABLE escala_eventos ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`ALTER TABLE escala_eventos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
}

async function ensurePagamentosEscalaColaboradorTable() {
  await ensureEscalaEventosTable();
  await ensureColaboradoresTable();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pagamentos_escala_colaborador (
      id TEXT PRIMARY KEY,
      escala_evento_id TEXT NOT NULL REFERENCES escala_eventos(id),
      evento_id TEXT NOT NULL REFERENCES eventos(id),
      colaborador_id TEXT NOT NULL REFERENCES colaboradores(id),
      tipo_pagamento TEXT NOT NULL DEFAULT 'adiantamento',
      valor NUMERIC(10,2) NOT NULL DEFAULT 0,
      data_pagamento TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      observacao TEXT,
      status TEXT NOT NULL DEFAULT 'ativo',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE pagamentos_escala_colaborador ADD COLUMN IF NOT EXISTS escala_evento_id TEXT`);
  await pool.query(`ALTER TABLE pagamentos_escala_colaborador ADD COLUMN IF NOT EXISTS evento_id TEXT`);
  await pool.query(`ALTER TABLE pagamentos_escala_colaborador ADD COLUMN IF NOT EXISTS colaborador_id TEXT`);
  await pool.query(`ALTER TABLE pagamentos_escala_colaborador ADD COLUMN IF NOT EXISTS tipo_pagamento TEXT DEFAULT 'adiantamento'`);
  await pool.query(`ALTER TABLE pagamentos_escala_colaborador ADD COLUMN IF NOT EXISTS valor NUMERIC(10,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE pagamentos_escala_colaborador ADD COLUMN IF NOT EXISTS data_pagamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`ALTER TABLE pagamentos_escala_colaborador ADD COLUMN IF NOT EXISTS observacao TEXT`);
  await pool.query(`ALTER TABLE pagamentos_escala_colaborador ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo'`);
  await pool.query(`ALTER TABLE pagamentos_escala_colaborador ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`ALTER TABLE pagamentos_escala_colaborador ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pagamentos_escala_colaborador_escala_evento_id ON pagamentos_escala_colaborador (escala_evento_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pagamentos_escala_colaborador_evento_id ON pagamentos_escala_colaborador (evento_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pagamentos_escala_colaborador_colaborador_id ON pagamentos_escala_colaborador (colaborador_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pagamentos_escala_colaborador_status ON pagamentos_escala_colaborador (status)`);
}

/**
 * Total da equipe no evento: soma dos valor_recreador da escala.
 * Sem linhas ou soma NULL (ex.: todos null) -> 0, alinhado ao DEFAULT do schema em eventos.pagamento_colaborador.
 */
async function syncEventoPagamentoColaboradorFromEscalaSum(client, eventoId) {
  await client.query(
    `
    UPDATE eventos
    SET pagamento_colaborador = COALESCE(
      (SELECT SUM(valor_recreador) FROM escala_eventos WHERE evento_id = $1),
      0
    )
    WHERE id = $1
    `,
    [eventoId]
  );

  await client.query(
    `
    UPDATE eventos
    SET
      custo_total = COALESCE(pagamento_colaborador, 0) + COALESCE(deslocamento, 0) + COALESCE(extras, 0),
      lucro_evento = COALESCE(valor_total, 0) - (
        COALESCE(pagamento_colaborador, 0) + COALESCE(deslocamento, 0) + COALESCE(extras, 0)
      )
    WHERE id = $1
    `,
    [eventoId]
  );
}

async function ensureServicoEventosTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS servico_eventos (
      id TEXT PRIMARY KEY,
      evento_id TEXT NOT NULL,
      servico_id TEXT,
      servico_nome TEXT,
      status_aceite TEXT DEFAULT 'Pendente',
      valor NUMERIC(10,2),
      quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade >= 1),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE servico_eventos ADD COLUMN IF NOT EXISTS evento_id TEXT`);
  await pool.query(`ALTER TABLE servico_eventos ADD COLUMN IF NOT EXISTS servico_id TEXT`);
  await pool.query(`ALTER TABLE servico_eventos ADD COLUMN IF NOT EXISTS servico_nome TEXT`);
  await pool.query(`ALTER TABLE servico_eventos ADD COLUMN IF NOT EXISTS status_aceite TEXT DEFAULT 'Pendente'`);
  await pool.query(`ALTER TABLE servico_eventos ADD COLUMN IF NOT EXISTS valor NUMERIC(10,2)`);
  await pool.query(`ALTER TABLE servico_eventos ADD COLUMN IF NOT EXISTS quantidade INTEGER DEFAULT 1`);
  await pool.query(`UPDATE servico_eventos SET quantidade = 1 WHERE quantidade IS NULL OR quantidade < 1`);
  await pool.query(`ALTER TABLE servico_eventos ALTER COLUMN quantidade SET DEFAULT 1`);
  await pool.query(`ALTER TABLE servico_eventos ALTER COLUMN quantidade SET NOT NULL`);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'servico_eventos_quantidade_check'
          AND conrelid = 'servico_eventos'::regclass
      ) THEN
        ALTER TABLE servico_eventos
        ADD CONSTRAINT servico_eventos_quantidade_check CHECK (quantidade >= 1);
      END IF;
    END $$;
  `);
  await pool.query(`ALTER TABLE servico_eventos ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`ALTER TABLE servico_eventos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
}

async function ensureServicoMaterialRequisitoTable() {
  await ensureServicosTable();
  await ensureItemCatalogTable();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS servico_material_requisito (
      id TEXT PRIMARY KEY,
      servico_id TEXT NOT NULL REFERENCES servicos(id) ON DELETE CASCADE,
      item_catalog_id TEXT NOT NULL REFERENCES item_catalog(id) ON DELETE CASCADE,
      quantidade_min INTEGER NOT NULL DEFAULT 1,
      obrigatorio BOOLEAN NOT NULL DEFAULT TRUE,
      observacao TEXT,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE servico_material_requisito ADD COLUMN IF NOT EXISTS servico_id TEXT`);
  await pool.query(`ALTER TABLE servico_material_requisito ADD COLUMN IF NOT EXISTS item_catalog_id TEXT`);
  await pool.query(
    `ALTER TABLE servico_material_requisito ADD COLUMN IF NOT EXISTS quantidade_min INTEGER NOT NULL DEFAULT 1`
  );
  await pool.query(
    `ALTER TABLE servico_material_requisito ADD COLUMN IF NOT EXISTS obrigatorio BOOLEAN NOT NULL DEFAULT TRUE`
  );
  await pool.query(`ALTER TABLE servico_material_requisito ADD COLUMN IF NOT EXISTS observacao TEXT`);
  await pool.query(
    `ALTER TABLE servico_material_requisito ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE`
  );
  await pool.query(
    `ALTER TABLE servico_material_requisito ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  );
  await pool.query(
    `ALTER TABLE servico_material_requisito ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  );
}

async function ensureEventoLogsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS evento_logs (
      id TEXT PRIMARY KEY,
      evento_id TEXT NOT NULL,
      tipo TEXT DEFAULT 'manual',
      descricao TEXT NOT NULL,
      autor TEXT,
      created_by TEXT,
      metadata JSONB,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE evento_logs ADD COLUMN IF NOT EXISTS evento_id TEXT`);
  await pool.query(`ALTER TABLE evento_logs ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'manual'`);
  await pool.query(`ALTER TABLE evento_logs ADD COLUMN IF NOT EXISTS descricao TEXT`);
  await pool.query(`ALTER TABLE evento_logs ADD COLUMN IF NOT EXISTS autor TEXT`);
  await pool.query(`ALTER TABLE evento_logs ADD COLUMN IF NOT EXISTS created_by TEXT`);
  await pool.query(`ALTER TABLE evento_logs ADD COLUMN IF NOT EXISTS metadata JSONB`);
  await pool.query(`ALTER TABLE evento_logs ADD COLUMN IF NOT EXISTS created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`ALTER TABLE evento_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
}

async function ensureEventosOperacionalPagamentoColumns() {
  await pool.query(
    `ALTER TABLE eventos ADD COLUMN IF NOT EXISTS pagamento_pos_evento BOOLEAN DEFAULT FALSE`
  );
  await pool.query(
    `ALTER TABLE eventos ADD COLUMN IF NOT EXISTS dt_prevista_pagamento TEXT`
  );
  await pool.query(
    `ALTER TABLE eventos ADD COLUMN IF NOT EXISTS saldo_confirmado BOOLEAN DEFAULT FALSE`
  );
}

async function ensureCiclosFinanceirosTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ciclos_financeiros (
      id TEXT PRIMARY KEY,
      ano INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'travado',
      data_inicio TEXT,
      data_fim TEXT,
      total_recebido NUMERIC(14,2) DEFAULT 0,
      retencao_total NUMERIC(14,2) DEFAULT 0,
      caixa_livre NUMERIC(14,2) DEFAULT 0,
      cofrinho_gestor NUMERIC(14,2) DEFAULT 0,
      cofrinho_expansao NUMERIC(14,2) DEFAULT 0,
      cofrinho_reserva NUMERIC(14,2) DEFAULT 0,
      cofrinho_custos_fixos NUMERIC(14,2) DEFAULT 0,
      cofrinho_estoque NUMERIC(14,2) DEFAULT 0,
      qtd_eventos INTEGER DEFAULT 0,
      observacoes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ciclos_financeiros_ano_mes_tipo_unique
    ON ciclos_financeiros (ano, mes, tipo)
  `);
}

async function ensureCofrinhosConfigTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cofrinhos_config (
      key TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      percentual NUMERIC(10,4) NOT NULL DEFAULT 0,
      ordem INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE cofrinhos_config ADD COLUMN IF NOT EXISTS nome TEXT`);
  await pool.query(`ALTER TABLE cofrinhos_config ADD COLUMN IF NOT EXISTS percentual NUMERIC(10,4) NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE cofrinhos_config ADD COLUMN IF NOT EXISTS ordem INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE cofrinhos_config ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`ALTER TABLE cofrinhos_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);

  for (const item of COFRINHO_CONFIG_DEFAULTS) {
    await pool.query(
      `
      INSERT INTO cofrinhos_config (key, nome, percentual, ordem)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (key) DO UPDATE
      SET
        nome = COALESCE(cofrinhos_config.nome, EXCLUDED.nome),
        percentual = COALESCE(cofrinhos_config.percentual, EXCLUDED.percentual),
        ordem = COALESCE(cofrinhos_config.ordem, EXCLUDED.ordem)
      `,
      [item.key, item.nome, item.percentual, item.ordem]
    );
  }
}

async function ensureRegionsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS regions (
      id TEXT PRIMARY KEY,
      nome_regiao TEXT NOT NULL,
      sigla_regiao TEXT,
      ativa BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE regions ADD COLUMN IF NOT EXISTS nome_regiao TEXT`);
  await pool.query(`ALTER TABLE regions ADD COLUMN IF NOT EXISTS sigla_regiao TEXT`);
  await pool.query(`ALTER TABLE regions ADD COLUMN IF NOT EXISTS ativa BOOLEAN DEFAULT TRUE`);
  await pool.query(`ALTER TABLE regions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`ALTER TABLE regions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
}

async function ensureValoresReferenciaRegiaoTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS valores_referencia_regiao (
      id TEXT PRIMARY KEY,
      region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
      nome_servico_funcao TEXT NOT NULL,
      valor_referencia NUMERIC(10,2) NOT NULL DEFAULT 0,
      base_duracao TEXT,
      observacoes TEXT,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE valores_referencia_regiao ADD COLUMN IF NOT EXISTS region_id TEXT`);
  await pool.query(`ALTER TABLE valores_referencia_regiao ADD COLUMN IF NOT EXISTS nome_servico_funcao TEXT`);
  await pool.query(`ALTER TABLE valores_referencia_regiao ADD COLUMN IF NOT EXISTS valor_referencia NUMERIC(10,2) NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE valores_referencia_regiao ADD COLUMN IF NOT EXISTS base_duracao TEXT`);
  await pool.query(`ALTER TABLE valores_referencia_regiao ADD COLUMN IF NOT EXISTS observacoes TEXT`);
  await pool.query(`ALTER TABLE valores_referencia_regiao ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE`);
  await pool.query(`ALTER TABLE valores_referencia_regiao ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`ALTER TABLE valores_referencia_regiao ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_valores_referencia_regiao_region_id
    ON valores_referencia_regiao(region_id)
  `);
}

async function ensureParceriasColaboradorTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS parcerias_colaborador (
      id TEXT PRIMARY KEY,
      colaborador_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
      region_id TEXT REFERENCES regions(id) ON DELETE SET NULL,
      titulo_parceria TEXT NOT NULL,
      nome_servico_funcao TEXT,
      valor_referencia_especifico NUMERIC(10,2) NOT NULL DEFAULT 0,
      disponibilidade TEXT,
      prioridade_envio BOOLEAN NOT NULL DEFAULT FALSE,
      observacoes TEXT,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE parcerias_colaborador ADD COLUMN IF NOT EXISTS colaborador_id TEXT`);
  await pool.query(`ALTER TABLE parcerias_colaborador ADD COLUMN IF NOT EXISTS region_id TEXT`);
  await pool.query(`ALTER TABLE parcerias_colaborador ADD COLUMN IF NOT EXISTS titulo_parceria TEXT`);
  await pool.query(`ALTER TABLE parcerias_colaborador ADD COLUMN IF NOT EXISTS nome_servico_funcao TEXT`);
  await pool.query(`ALTER TABLE parcerias_colaborador ADD COLUMN IF NOT EXISTS valor_referencia_especifico NUMERIC(10,2) NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE parcerias_colaborador ADD COLUMN IF NOT EXISTS disponibilidade TEXT`);
  await pool.query(`ALTER TABLE parcerias_colaborador ADD COLUMN IF NOT EXISTS prioridade_envio BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE parcerias_colaborador ADD COLUMN IF NOT EXISTS observacoes TEXT`);
  await pool.query(`ALTER TABLE parcerias_colaborador ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE`);
  await pool.query(`ALTER TABLE parcerias_colaborador ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`ALTER TABLE parcerias_colaborador ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_parcerias_colaborador_colaborador_id
    ON parcerias_colaborador(colaborador_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_parcerias_colaborador_region_id
    ON parcerias_colaborador(region_id)
  `);
}

async function ensureItemCatalogTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS item_catalog (
      id TEXT PRIMARY KEY,
      nome_item TEXT NOT NULL,
      categoria TEXT,
      descricao TEXT,
      natureza_item TEXT,
      quantidade_total INTEGER,
      ativo BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE item_catalog ADD COLUMN IF NOT EXISTS nome_item TEXT`);
  await pool.query(`ALTER TABLE item_catalog ADD COLUMN IF NOT EXISTS categoria TEXT`);
  await pool.query(`ALTER TABLE item_catalog ADD COLUMN IF NOT EXISTS descricao TEXT`);
  await pool.query(`ALTER TABLE item_catalog ADD COLUMN IF NOT EXISTS natureza_item TEXT`);
  await pool.query(`ALTER TABLE item_catalog ADD COLUMN IF NOT EXISTS quantidade_total INTEGER`);
  await pool.query(
    `ALTER TABLE item_catalog ADD COLUMN IF NOT EXISTS quantidade_consumida_acumulada INTEGER NOT NULL DEFAULT 0`
  );
  await pool.query(
    `UPDATE item_catalog SET quantidade_consumida_acumulada = 0 WHERE quantidade_consumida_acumulada IS NULL`
  );
  /** Legado: consumo passou a baixar quantidade_total; consolida acumulador antigo no total e zera. */
  await pool.query(`
    UPDATE item_catalog
    SET
      quantidade_total = GREATEST(0, quantidade_total - COALESCE(quantidade_consumida_acumulada, 0)),
      quantidade_consumida_acumulada = 0,
      updated_at = CURRENT_TIMESTAMP
    WHERE quantidade_total IS NOT NULL
      AND COALESCE(quantidade_consumida_acumulada, 0) > 0
  `);
  await pool.query(`ALTER TABLE item_catalog ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE`);
  await pool.query(`ALTER TABLE item_catalog ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`ALTER TABLE item_catalog ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
}

async function ensureColaboradorPerfilEquipeTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS colaborador_perfil_equipe (
      colaborador_id TEXT PRIMARY KEY REFERENCES colaboradores(id) ON DELETE CASCADE,
      region_id TEXT REFERENCES regions(id) ON DELETE SET NULL,
      id_recreador TEXT,
      nome_completo TEXT,
      ativo_na_equipe BOOLEAN DEFAULT TRUE,
      cpf TEXT,
      rg TEXT,
      email TEXT,
      telefone_contato TEXT,
      telefone_recado TEXT,
      instagram TEXT,
      cep TEXT,
      rua TEXT,
      numero TEXT,
      complemento TEXT,
      bairro TEXT,
      cidade TEXT,
      estado TEXT,
      endereco_completo TEXT,
      quantidade_fardas INTEGER,
      material_proprio BOOLEAN DEFAULT FALSE,
      possui_materiais_extras BOOLEAN DEFAULT FALSE,
      descricao_materiais_extras TEXT,
      nivel_recreacao TEXT,
      nivel_pintura_pele TEXT,
      nivel_escultura_baloes TEXT,
      habilidade_veste_personagem BOOLEAN DEFAULT FALSE,
      habilidade_faz_locucao BOOLEAN DEFAULT FALSE,
      habilidade_animador_promocional BOOLEAN DEFAULT FALSE,
      diferenciais TEXT,
      observacoes TEXT,
      observacoes_gerais TEXT,
      pix_tipo TEXT,
      pix_chave TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS region_id TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS id_recreador TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS nome_completo TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS ativo_na_equipe BOOLEAN DEFAULT TRUE`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS cpf TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS rg TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS email TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS telefone_contato TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS telefone_recado TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS instagram TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS cep TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS rua TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS numero TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS complemento TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS bairro TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS cidade TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS estado TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS endereco_completo TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS quantidade_fardas INTEGER`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS material_proprio BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS possui_materiais_extras BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS descricao_materiais_extras TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS nivel_recreacao TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS nivel_pintura_pele TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS nivel_escultura_baloes TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS habilidade_veste_personagem BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS habilidade_faz_locucao BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS habilidade_animador_promocional BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS diferenciais TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS observacoes TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS observacoes_gerais TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS pix_tipo TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS pix_chave TEXT`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`ALTER TABLE colaborador_perfil_equipe ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS colaborador_perfil_equipe_region_id_recreador_uq
    ON colaborador_perfil_equipe (region_id, id_recreador)
    WHERE id_recreador IS NOT NULL AND region_id IS NOT NULL
  `);
}

/**
 * Próximo id_recreador no formato SIGLA + 3 dígitos para a região (ex.: REC001).
 * Considera apenas linhas com mesmo region_id e sufixo numérico de 3 dígitos após o prefixo.
 */
async function allocateNextIdRecreadorForRegion(client, regionId, siglaUpper) {
  const r = await client.query(
    `
    SELECT id_recreador
    FROM colaborador_perfil_equipe
    WHERE region_id = $1 AND id_recreador IS NOT NULL
    `,
    [regionId]
  );
  const prefix = siglaUpper;
  let maxNum = 0;
  for (const row of r.rows) {
    const id = row.id_recreador;
    if (typeof id !== 'string') continue;
    if (!id.startsWith(prefix)) continue;
    const suffix = id.slice(prefix.length);
    if (!/^\d{3}$/.test(suffix)) continue;
    const n = parseInt(suffix, 10);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  }
  const next = maxNum + 1;
  if (next > 999) {
    const err = new Error('Limite de 999 recreadores por sigla de regiao atingido');
    err.statusCode = 400;
    throw err;
  }
  return `${prefix}${String(next).padStart(3, '0')}`;
}

const COLABORADOR_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resolve colaborador_id do body para o id canonico em colaboradores.id.
 * Nunca usa nome. Corrige ambiguidade quando o cliente envia numero e existem ids so com digitos
 * (ex.: JSON 12 vs id "012" no banco).
 */
async function resolveColaboradorIdParaEquipePerfil(client, raw) {
  if (raw === undefined || raw === null) {
    return { ok: false, status: 400, erro: 'colaborador_id nao informado' };
  }
  const trimmed = String(raw).trim();
  if (!trimmed) {
    return { ok: false, status: 400, erro: 'colaborador_id nao informado' };
  }

  const exato = await client.query('SELECT id FROM colaboradores WHERE id = $1', [trimmed]);
  if (exato.rowCount) {
    return { ok: true, colaboradorId: exato.rows[0].id };
  }

  if (COLABORADOR_ID_UUID_RE.test(trimmed)) {
    return { ok: false, status: 404, erro: 'Colaborador nao encontrado' };
  }

  const somenteDigitos = /^[0-9]+$/.test(trimmed);
  const fromIntegerNumber = typeof raw === 'number' && Number.isFinite(raw) && Number.isInteger(raw);
  if (!somenteDigitos && !fromIntegerNumber) {
    return { ok: false, status: 404, erro: 'Colaborador nao encontrado' };
  }

  const comparador = somenteDigitos ? trimmed : String(raw);
  const candidatos = await client.query(
    `
    SELECT id
    FROM colaboradores
    WHERE id ~ '^[0-9]+$'
      AND id::bigint = $1::bigint
    `,
    [comparador]
  );
  if (candidatos.rowCount > 1) {
    return {
      ok: false,
      status: 400,
      erro:
        'Varios colaboradores coincidem com este identificador numerico (ex.: zeros a esquerda). Envie colaborador_id como texto exatamente como no cadastro.',
    };
  }
  if (candidatos.rowCount === 1) {
    return { ok: true, colaboradorId: candidatos.rows[0].id };
  }

  return { ok: false, status: 404, erro: 'Colaborador nao encontrado' };
}

/**
 * Copia id_recreador do perfil da equipe para colaboradores quando vazio ou igual ao do perfil.
 * Lanca 409 se o colaborador ja tiver outro id_recreador diferente do perfil.
 */
async function syncColaboradorIdRecreadorFromPerfilEquipe(client, colaboradorId, idRecreadorPerfil) {
  const n =
    idRecreadorPerfil != null && String(idRecreadorPerfil).trim() !== ''
      ? String(idRecreadorPerfil).trim()
      : null;
  if (!n) return;

  const res = await client.query(
    'SELECT id_recreador FROM colaboradores WHERE id = $1 FOR UPDATE',
    [colaboradorId]
  );
  if (!res.rowCount) {
    const err = new Error('Colaborador nao encontrado para sincronizar id_recreador');
    err.statusCode = 500;
    throw err;
  }
  const atual =
    res.rows[0].id_recreador != null && String(res.rows[0].id_recreador).trim() !== ''
      ? String(res.rows[0].id_recreador).trim()
      : null;
  if (atual != null && atual !== n) {
    const err = new Error(
      `Conflito de id_recreador: cadastro do colaborador possui "${atual}" e o perfil da equipe define "${n}". Resolva antes de continuar.`
    );
    err.statusCode = 409;
    throw err;
  }
  await client.query(
    'UPDATE colaboradores SET id_recreador = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [n, colaboradorId]
  );
}

async function ensureColaboradorItemCatalogTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS colaborador_item_catalog (
      id TEXT PRIMARY KEY,
      colaborador_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
      item_catalog_id TEXT NOT NULL REFERENCES item_catalog(id) ON DELETE CASCADE,
      quantidade INTEGER,
      descricao_complementar TEXT,
      data_entrega DATE,
      data_envio DATE,
      status_item TEXT,
      observacoes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE colaborador_item_catalog ADD COLUMN IF NOT EXISTS colaborador_id TEXT`);
  await pool.query(`ALTER TABLE colaborador_item_catalog ADD COLUMN IF NOT EXISTS item_catalog_id TEXT`);
  await pool.query(`ALTER TABLE colaborador_item_catalog ADD COLUMN IF NOT EXISTS quantidade INTEGER`);
  await pool.query(`ALTER TABLE colaborador_item_catalog ADD COLUMN IF NOT EXISTS descricao_complementar TEXT`);
  await pool.query(`ALTER TABLE colaborador_item_catalog ADD COLUMN IF NOT EXISTS data_entrega DATE`);
  await pool.query(`ALTER TABLE colaborador_item_catalog ADD COLUMN IF NOT EXISTS data_envio DATE`);
  await pool.query(`ALTER TABLE colaborador_item_catalog ADD COLUMN IF NOT EXISTS status_item TEXT`);
  await pool.query(`ALTER TABLE colaborador_item_catalog ADD COLUMN IF NOT EXISTS observacoes TEXT`);
  await pool.query(`ALTER TABLE colaborador_item_catalog ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`ALTER TABLE colaborador_item_catalog ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
}

/** Legado: mantido no arquivo para DBs que ja criaram estas tabelas; nao faz parte de ensureGestaoEquipeSchema. */
async function ensureRecreatorsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recreators (
      id TEXT PRIMARY KEY,
      region_id TEXT REFERENCES regions(id) ON DELETE SET NULL,
      nome_recreador TEXT NOT NULL,
      ativo BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE recreators ADD COLUMN IF NOT EXISTS region_id TEXT`);
  await pool.query(`ALTER TABLE recreators ADD COLUMN IF NOT EXISTS nome_recreador TEXT`);
  await pool.query(`ALTER TABLE recreators ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE`);
  await pool.query(`ALTER TABLE recreators ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`ALTER TABLE recreators ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
}

/** Legado: mantido no arquivo para DBs que ja criaram esta tabela; nao faz parte de ensureGestaoEquipeSchema. */
async function ensureRecreatorItemsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recreator_items (
      id TEXT PRIMARY KEY,
      recreator_id TEXT NOT NULL REFERENCES recreators(id) ON DELETE CASCADE,
      item_catalog_id TEXT NOT NULL REFERENCES item_catalog(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE recreator_items ADD COLUMN IF NOT EXISTS recreator_id TEXT`);
  await pool.query(`ALTER TABLE recreator_items ADD COLUMN IF NOT EXISTS item_catalog_id TEXT`);
  await pool.query(`ALTER TABLE recreator_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`ALTER TABLE recreator_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
}

async function ensureGestaoEquipeSchema() {
  await ensureRegionsTable();
  await ensureValoresReferenciaRegiaoTable();
  await ensureParceriasColaboradorTable();
  await ensureItemCatalogTable();
  await ensureColaboradoresTable();
  await ensureColaboradorPerfilEquipeTable();
  await ensureColaboradorItemCatalogTable();
}

function parseOrcamentoText(text, options = {}) {
  const sourceText = options.fromPdf ? normalizeOrcamentoPdfText(text) : text;
  const parsed = parseContractText(sourceText).extracted;
  const investimento = options.fromPdf ? extractOrcamentoInvestment(sourceText) : { itens_valores: [], valor_total: 0 };
  const hasMultipleOptions = Boolean(investimento.multiplas_opcoes);
  const valorTotal = hasMultipleOptions ? null : (investimento.valor_total || parsed.valor_total);

  return {
    ...parsed,
    itens_valores: hasMultipleOptions
      ? []
      : (investimento.itens_valores.length ? investimento.itens_valores : parsed.itens_valores),
    valor_total: valorTotal,
    multiplas_opcoes: hasMultipleOptions,
    opcoes_investimento: investimento.opcoes_investimento || [],
    nome_cliente: parsed.nome_contratante,
    cliente_nome: parsed.nome_contratante,
    status: 'Em aberto',
    texto_original: sourceText
  };
}

app.get('/', (req, res) => {
  res.json({ ok: true, mensagem: 'Backend HDL funcionando' });
});

app.get('/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ ok: true, agora: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get('/contracts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM contracts
      ORDER BY created_at DESC
    `);
    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get('/eventos', async (req, res) => {
  try {
    await ensureEscalaEventosTable();
    const result = await pool.query(`
      SELECT
        e.*,
        COALESCE(esc.qtd_escalas, 0) AS qtd_escalas,
        COALESCE(esc.qtd_escalas_pagas, 0) AS qtd_escalas_pagas,
        COALESCE(esc.qtd_escalas_pendentes, 0) AS qtd_escalas_pendentes,
        COALESCE(esc.soma_valor_recreador, 0) AS soma_valor_recreador
      FROM eventos e
      LEFT JOIN (
        SELECT
          evento_id,
          COUNT(*) AS qtd_escalas,
          SUM(CASE WHEN LOWER(TRIM(COALESCE(status_pagamento, ''))) = 'pago' THEN 1 ELSE 0 END) AS qtd_escalas_pagas,
          SUM(CASE WHEN LOWER(TRIM(COALESCE(status_pagamento, ''))) <> 'pago' THEN 1 ELSE 0 END) AS qtd_escalas_pendentes,
          COALESCE(SUM(COALESCE(valor_recreador, 0)), 0) AS soma_valor_recreador
        FROM escala_eventos
        GROUP BY evento_id
      ) esc ON esc.evento_id = e.id
      ORDER BY
        CASE
          WHEN e.data_evento ~ '^\\d{2}/\\d{2}/\\d{4}$'
          THEN to_date(e.data_evento, 'DD/MM/YYYY')
        END ASC NULLS LAST,
        e.created_at DESC
    `);
    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.put('/eventos/:id', async (req, res) => {
  try {
    const updateFields = getProvidedFields(req.body, EVENTO_UPDATE_FIELDS);

    if (!updateFields.length) {
      return res.status(400).json({ ok: false, erro: 'Nenhum campo para atualizar' });
    }

    const existingEvento = await pool.query('SELECT * FROM eventos WHERE id = $1', [req.params.id]);
    if (!existingEvento.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Evento nao encontrado' });
    }

    if (updateFields.includes('status_aceite_praca')) {
      await ensureEscalaEventosTable();
      const valorAtual = String(existingEvento.rows[0]?.status_aceite_praca ?? '').trim();
      const valorNovo = String(normalizeEventoValue('status_aceite_praca', req.body.status_aceite_praca) ?? '').trim();

      if (valorNovo !== valorAtual) {
        const escalasRelacionadas = await pool.query(
          `
          SELECT COUNT(*)::int AS total
          FROM escala_eventos
          WHERE evento_id = $1
          `,
          [req.params.id]
        );
        const totalEscalas = Number(escalasRelacionadas.rows[0]?.total || 0);
        if (totalEscalas > 0) {
          return res.status(409).json({
            ok: false,
            erro: 'A praça não pode ser alterada enquanto houver equipe escalada. Remova primeiro os colaboradores da Equipe Escalada.',
          });
        }
      }
    }

    const normalizedPayload = Object.fromEntries(
      updateFields.map((field) => [field, normalizeEventoValue(field, req.body[field])])
    );
    const mergedEvento = { ...existingEvento.rows[0], ...normalizedPayload };
    const financeiroNormalizado = getEventoFinanceiroNormalizado(mergedEvento);
    normalizedPayload.resta = financeiroNormalizado.resta;
    normalizedPayload.custo_total = financeiroNormalizado.custoTotal;
    normalizedPayload.lucro_evento = financeiroNormalizado.lucroEvento;

    const fieldsToPersist = [...new Set([...updateFields, 'resta', 'custo_total', 'lucro_evento'])];
    const setClause = fieldsToPersist
      .map((field, index) => `${field} = $${index + 1}`)
      .join(', ');
    const values = fieldsToPersist.map((field) => normalizedPayload[field]);

    const result = await pool.query(`
      UPDATE eventos
      SET ${setClause}
      WHERE id = $${values.length + 1}
      RETURNING *
    `, [...values, req.params.id]);

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Evento nao encontrado' });
    }

    await ensureEscalaEventosTable();
    await syncEventoPagamentoColaboradorFromEscalaSum(pool, req.params.id);

    const refreshed = await pool.query('SELECT * FROM eventos WHERE id = $1', [req.params.id]);
    res.json({ ok: true, dados: refreshed.rows[0] || result.rows[0] });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.get('/eventos/:id/diagnostico-praca-equipe', async (req, res) => {
  try {
    const diagnostico = await diagnosticarPracaEquipeEvento(req.params.id);
    if (diagnostico.motivo === 'evento_nao_encontrado') {
      return res.status(404).json({ ok: false, erro: 'Evento nao encontrado' });
    }

    res.json({ ok: true, dados: diagnostico });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.patch('/eventos/:id/corrigir-praca-pela-equipe', async (req, res) => {
  try {
    const diagnostico = await diagnosticarPracaEquipeEvento(req.params.id);
    if (diagnostico.motivo === 'evento_nao_encontrado') {
      return res.status(404).json({ ok: false, erro: 'Evento nao encontrado' });
    }

    if (diagnostico.pode_corrigir !== true || diagnostico.motivo !== 'praca_divergente') {
      return res.status(409).json({ ok: false, erro: getMensagemDiagnosticoPracaEquipe(diagnostico.motivo) });
    }

    const pracaAnterior = String(diagnostico.praca_ativa_atual ?? '').trim();
    const pracaCorrigida = String(diagnostico.praca_identificada_equipe ?? '').trim();

    await pool.query(
      'UPDATE eventos SET status_aceite_praca = $1 WHERE id = $2',
      [pracaCorrigida, req.params.id]
    );

    res.json({
      ok: true,
      dados: {
        evento_id: String(req.params.id),
        praca_anterior: pracaAnterior,
        praca_corrigida: pracaCorrigida,
        motivo: diagnostico.motivo,
        quantidade_escalados: diagnostico.quantidade_escalados,
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.get('/ciclos-financeiros', requirePermission(ACCESS_PERMISSIONS.FINANCEIRO_VIEW), async (req, res) => {
  try {
    await ensureCiclosFinanceirosTable();
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const result = await pool.query(
      `
      SELECT *
      FROM ciclos_financeiros
      ORDER BY created_at DESC
      LIMIT $1
    `,
      [limit]
    );
    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.post('/ciclos-financeiros', requirePermission(ACCESS_PERMISSIONS.FINANCEIRO_VIEW), async (req, res) => {
  try {
    await ensureCiclosFinanceirosTable();

    const id = req.body.id || crypto.randomUUID();
    const ano = normalizeCicloFinanceiroValue('ano', req.body.ano);
    const mes = normalizeCicloFinanceiroValue('mes', req.body.mes);
    const tipo = String(req.body.tipo || '').trim();
    if (tipo !== 'A' && tipo !== 'B') {
      return res.status(400).json({ ok: false, erro: 'tipo deve ser A ou B' });
    }

    const status = String(req.body.status || 'travado').trim() || 'travado';
    const dataInicio = req.body.data_inicio != null ? String(req.body.data_inicio) : null;
    const dataFim = req.body.data_fim != null ? String(req.body.data_fim) : null;
    const observacoes = req.body.observacoes != null ? String(req.body.observacoes) : null;

    const numericPayload = {};
    for (const field of CICLO_FINANCEIRO_NUMERIC_FIELDS) {
      numericPayload[field] = normalizeCicloFinanceiroValue(field, req.body[field]);
    }
    const qtdEventos = normalizeCicloFinanceiroValue(
      'qtd_eventos',
      req.body.qtd_eventos ?? 0
    );

    const result = await pool.query(
      `
      INSERT INTO ciclos_financeiros (
        id, ano, mes, tipo, status, data_inicio, data_fim,
        total_recebido, retencao_total, caixa_livre,
        cofrinho_gestor, cofrinho_expansao, cofrinho_reserva,
        cofrinho_custos_fixos, cofrinho_estoque, qtd_eventos, observacoes
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      )
      RETURNING *
    `,
      [
        id,
        ano,
        mes,
        tipo,
        status,
        dataInicio,
        dataFim,
        numericPayload.total_recebido,
        numericPayload.retencao_total,
        numericPayload.caixa_livre,
        numericPayload.cofrinho_gestor,
        numericPayload.cofrinho_expansao,
        numericPayload.cofrinho_reserva,
        numericPayload.cofrinho_custos_fixos,
        numericPayload.cofrinho_estoque,
        qtdEventos,
        observacoes,
      ]
    );

    res.status(201).json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        ok: false,
        erro: 'Ja existe ciclo financeiro para este ano, mes e tipo',
      });
    }
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.put('/ciclos-financeiros/:id', requirePermission(ACCESS_PERMISSIONS.FINANCEIRO_VIEW), async (req, res) => {
  try {
    await ensureCiclosFinanceirosTable();

    const updateFields = getProvidedFields(req.body, CICLO_FINANCEIRO_UPDATE_FIELDS);
    if (!updateFields.length) {
      return res.status(400).json({ ok: false, erro: 'Nenhum campo para atualizar' });
    }

    if (updateFields.includes('tipo')) {
      const t = String(req.body.tipo || '').trim();
      if (t !== 'A' && t !== 'B') {
        return res.status(400).json({ ok: false, erro: 'tipo deve ser A ou B' });
      }
    }

    const setClause = updateFields
      .map((field, index) => `${field} = $${index + 1}`)
      .join(', ');
    const values = updateFields.map((field) => normalizeCicloFinanceiroValue(field, req.body[field]));

    const result = await pool.query(
      `
      UPDATE ciclos_financeiros
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${values.length + 1}
      RETURNING *
    `,
      [...values, req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Ciclo financeiro nao encontrado' });
    }

    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        ok: false,
        erro: 'Ja existe ciclo financeiro para este ano, mes e tipo',
      });
    }
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.get('/cofrinhos-config', requirePermission(ACCESS_PERMISSIONS.FINANCEIRO_VIEW), async (req, res) => {
  try {
    await ensureCofrinhosConfigTable();
    const result = await pool.query(`
      SELECT key, nome, percentual, ordem, created_at, updated_at
      FROM cofrinhos_config
      ORDER BY ordem ASC, key ASC
    `);
    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.put('/cofrinhos-config', requirePermission(ACCESS_PERMISSIONS.FINANCEIRO_VIEW), async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureCofrinhosConfigTable();
    const items = normalizeCofrinhoConfigItems(req.body?.items);

    await client.query('BEGIN');
    for (const item of items) {
      await client.query(
        `
        INSERT INTO cofrinhos_config (key, nome, percentual, ordem, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE
        SET
          nome = EXCLUDED.nome,
          percentual = EXCLUDED.percentual,
          ordem = EXCLUDED.ordem,
          updated_at = CURRENT_TIMESTAMP
        `,
        [item.key, item.nome, item.percentual, item.ordem]
      );
    }
    await client.query('COMMIT');

    const result = await pool.query(`
      SELECT key, nome, percentual, ordem, created_at, updated_at
      FROM cofrinhos_config
      ORDER BY ordem ASC, key ASC
    `);

    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  } finally {
    client.release();
  }
});

app.get('/colaboradores', async (req, res) => {
  try {
    await ensureColaboradoresTable();

    const where = req.query.ativo !== undefined ? 'WHERE ativo = $1' : '';
    const params = req.query.ativo !== undefined ? [normalizeBooleanValue(req.query.ativo)] : [];
    const result = await pool.query(`
      SELECT *
      FROM colaboradores
      ${where}
      ORDER BY nome_colaborador ASC, created_at DESC
    `, params);

    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get(
  '/colaboradores/:colaboradorId/pagamentos-pendentes',
  requirePermission(ACCESS_PERMISSIONS.FINANCEIRO_COLABORADOR_VIEW),
  async (req, res) => {
    try {
      await ensureColaboradoresTable();
      await ensureEscalaEventosTable();

      const colaboradorId = String(req.params.colaboradorId || '').trim();
      const eventoAtualId = String(req.query.eventoAtualId || '').trim();
      if (!colaboradorId) {
        return res.status(400).json({ ok: false, erro: 'colaboradorId nao informado' });
      }

      const colab = await pool.query('SELECT id FROM colaboradores WHERE id = $1', [colaboradorId]);
      if (!colab.rowCount) {
        return res.status(404).json({ ok: false, erro: 'Colaborador nao encontrado' });
      }

      const result = await pool.query(
        `
        WITH pendencias AS (
          SELECT
            esc.id AS escala_evento_id,
            esc.evento_id,
            ev.data_evento,
            ev.hora_inicio,
            ev.hora_fim,
            ev.contratante_nome,
            esc.funcao,
            esc.valor_recreador,
            esc.status_pagamento,
            CASE
              WHEN ev.data_evento ~ '^\\d{2}/\\d{2}/\\d{4}$'
              THEN to_date(ev.data_evento, 'DD/MM/YYYY')
              ELSE NULL
            END AS data_evento_date
          FROM escala_eventos esc
          INNER JOIN eventos ev ON ev.id = esc.evento_id
          WHERE esc.colaborador_id = $1
        )
        SELECT
          escala_evento_id,
          evento_id,
          data_evento,
          hora_inicio,
          hora_fim,
          contratante_nome,
          funcao,
          valor_recreador,
          status_pagamento,
          CASE WHEN $2::text <> '' AND evento_id = $2::text THEN true ELSE false END AS is_evento_atual
        FROM pendencias
        WHERE data_evento_date IS NOT NULL
          AND data_evento_date <= CURRENT_DATE
          AND LOWER(TRIM(COALESCE(status_pagamento, ''))) <> 'pago'
          AND COALESCE(valor_recreador, 0) > 0
        ORDER BY data_evento_date DESC, hora_inicio DESC NULLS LAST, evento_id DESC
        `,
        [colaboradorId, eventoAtualId]
      );

      res.json({ ok: true, dados: result.rows });
    } catch (error) {
      res.status(500).json({ ok: false, erro: error.message });
    }
  }
);

app.patch(
  '/escalas-evento/pagamento-lote',
  requirePermission(ACCESS_PERMISSIONS.FINANCEIRO_VIEW),
  async (req, res) => {
    const client = await pool.connect();
    try {
      await ensureColaboradoresTable();
      await ensureEscalaEventosTable();

      const colaboradorId = String(req.body?.colaborador_id || '').trim();
      const rawIds = Array.isArray(req.body?.escala_evento_ids) ? req.body.escala_evento_ids : [];
      const escalaEventoIds = [...new Set(rawIds.map((id) => String(id || '').trim()).filter(Boolean))];

      if (!colaboradorId) {
        return res.status(400).json({ ok: false, erro: 'colaborador_id nao informado' });
      }
      if (!escalaEventoIds.length) {
        return res.status(400).json({ ok: false, erro: 'escala_evento_ids nao informado' });
      }

      const colab = await client.query('SELECT id FROM colaboradores WHERE id = $1', [colaboradorId]);
      if (!colab.rowCount) {
        return res.status(404).json({ ok: false, erro: 'Colaborador nao encontrado' });
      }

      await client.query('BEGIN');

      const rowsResult = await client.query(
        `
        SELECT
          esc.id,
          esc.evento_id,
          esc.colaborador_id,
          esc.status_pagamento,
          esc.valor_recreador,
          ev.data_evento,
          CASE
            WHEN ev.data_evento ~ '^\\d{2}/\\d{2}/\\d{4}$'
            THEN to_date(ev.data_evento, 'DD/MM/YYYY')
            ELSE NULL
          END AS data_evento_date
        FROM escala_eventos esc
        INNER JOIN eventos ev ON ev.id = esc.evento_id
        WHERE esc.id = ANY($1::text[])
        FOR UPDATE
        `,
        [escalaEventoIds]
      );

      const byId = new Map(rowsResult.rows.map((row) => [String(row.id), row]));
      const skipped = [];
      const elegiveis = [];
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      for (const id of escalaEventoIds) {
        const row = byId.get(id);
        if (!row) {
          skipped.push({ id, reason: 'Registro nao encontrado' });
          continue;
        }
        if (String(row.colaborador_id || '').trim() !== colaboradorId) {
          skipped.push({ id, reason: 'Registro nao pertence ao colaborador informado' });
          continue;
        }
        if (!row.data_evento_date || new Date(row.data_evento_date) > hoje) {
          skipped.push({ id, reason: 'Evento ainda nao foi realizado' });
          continue;
        }
        if (Number(row.valor_recreador || 0) <= 0) {
          skipped.push({ id, reason: 'Registro sem valor elegivel para pagamento' });
          continue;
        }
        if (String(row.status_pagamento || '').trim().toLowerCase() === 'pago') {
          skipped.push({ id, reason: 'Pagamento ja estava marcado como pago' });
          continue;
        }
        elegiveis.push(row);
      }

      let updatedIds = [];
      if (elegiveis.length) {
        const idsToUpdate = elegiveis.map((row) => String(row.id));
        const updateResult = await client.query(
          `
          UPDATE escala_eventos
          SET status_pagamento = 'Pago', updated_at = CURRENT_TIMESTAMP
          WHERE id = ANY($1::text[])
          RETURNING id, evento_id
          `,
          [idsToUpdate]
        );
        updatedIds = updateResult.rows.map((row) => String(row.id));
        const eventoIds = [...new Set(updateResult.rows.map((row) => String(row.evento_id || '').trim()).filter(Boolean))];
        for (const eventoId of eventoIds) {
          await syncEventoPagamentoColaboradorFromEscalaSum(client, eventoId);
        }
      }

      await client.query('COMMIT');

      res.json({
        ok: true,
        success: skipped.length === 0,
        updated_count: updatedIds.length,
        updated_ids: updatedIds,
        skipped,
      });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      res.status(500).json({ ok: false, erro: error.message });
    } finally {
      client.release();
    }
  }
);

app.get('/escalas-evento/:id/pagamentos', requirePermission(ACCESS_PERMISSIONS.COLABORADORES_EDIT), async (req, res) => {
  try {
    await ensurePagamentosEscalaColaboradorTable();
    const escalaId = String(req.params.id || '').trim();
    if (!escalaId) {
      return res.status(400).json({ ok: false, erro: 'id da escala nao informado' });
    }

    const escalaResult = await pool.query(
      `
      SELECT id, evento_id, colaborador_id, valor_recreador
      FROM escala_eventos
      WHERE id = $1
      `,
      [escalaId]
    );
    if (!escalaResult.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Escala nao encontrada' });
    }

    const historicoResult = await pool.query(
      `
      SELECT *
      FROM pagamentos_escala_colaborador
      WHERE escala_evento_id = $1
      ORDER BY data_pagamento DESC, created_at DESC
      `,
      [escalaId]
    );

    const historico = historicoResult.rows;
    const resumo = historico.reduce(
      (acc, row) => {
        const valor = Number(row?.valor || 0);
        const status = String(row?.status || '').trim().toLowerCase();
        if (!Number.isFinite(valor)) return acc;
        if (status === 'ativo') {
          acc.total_ativo += valor;
          acc.quantidade_ativos += 1;
        } else if (status === 'cancelado') {
          acc.total_cancelado += valor;
        }
        return acc;
      },
      { total_ativo: 0, total_cancelado: 0, quantidade_ativos: 0 }
    );

    return res.json({
      ok: true,
      dados: {
        escala_evento_id: escalaResult.rows[0].id,
        evento_id: escalaResult.rows[0].evento_id,
        colaborador_id: escalaResult.rows[0].colaborador_id,
        valor_recreador: escalaResult.rows[0].valor_recreador,
        historico,
        resumo,
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.post('/escalas-evento/:id/pagamentos', requirePermission(ACCESS_PERMISSIONS.COLABORADORES_EDIT), async (req, res) => {
  try {
    await ensurePagamentosEscalaColaboradorTable();
    const escalaId = String(req.params.id || '').trim();
    if (!escalaId) {
      return res.status(400).json({ ok: false, erro: 'id da escala nao informado' });
    }

    const escalaResult = await pool.query(
      `
      SELECT id, evento_id, colaborador_id
      FROM escala_eventos
      WHERE id = $1
      `,
      [escalaId]
    );
    if (!escalaResult.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Escala nao encontrada' });
    }

    const escala = escalaResult.rows[0];
    const colaboradorId = String(escala.colaborador_id || '').trim();
    const eventoId = String(escala.evento_id || '').trim();
    if (!colaboradorId || !eventoId) {
      return res.status(400).json({ ok: false, erro: 'Escala sem colaborador_id ou evento_id valido' });
    }

    const novoPagamentoId = req.body?.id ? String(req.body.id).trim() : crypto.randomUUID();
    const tipoPagamento = normalizePagamentoEscalaColaboradorValue('tipo_pagamento', req.body?.tipo_pagamento);
    const valor = normalizePagamentoEscalaColaboradorValue('valor', req.body?.valor);
    const dataPagamento = normalizePagamentoEscalaColaboradorValue('data_pagamento', req.body?.data_pagamento);
    const observacao = normalizePagamentoEscalaColaboradorValue('observacao', req.body?.observacao);

    const result = await pool.query(
      `
      INSERT INTO pagamentos_escala_colaborador (
        id,
        escala_evento_id,
        evento_id,
        colaborador_id,
        tipo_pagamento,
        valor,
        data_pagamento,
        observacao,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamp, CURRENT_TIMESTAMP), $8, 'ativo')
      RETURNING *
      `,
      [novoPagamentoId, escalaId, eventoId, colaboradorId, tipoPagamento, valor, dataPagamento, observacao]
    );

    return res.status(201).json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.put('/pagamentos-escala-colaborador/:id', requirePermission(ACCESS_PERMISSIONS.COLABORADORES_EDIT), async (req, res) => {
  try {
    await ensurePagamentosEscalaColaboradorTable();
    const pagamentoId = String(req.params.id || '').trim();
    if (!pagamentoId) {
      return res.status(400).json({ ok: false, erro: 'id do pagamento nao informado' });
    }

    const existingResult = await pool.query(
      `
      SELECT *
      FROM pagamentos_escala_colaborador
      WHERE id = $1
      `,
      [pagamentoId]
    );

    if (!existingResult.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Pagamento da escala nao encontrado' });
    }

    const pagamentoAtual = existingResult.rows[0];
    if (String(pagamentoAtual?.status || '').trim().toLowerCase() === 'cancelado') {
      return res.status(409).json({ ok: false, erro: 'Pagamentos cancelados nao podem ser editados' });
    }

    const editableFields = ['tipo_pagamento', 'valor', 'data_pagamento', 'observacao'];
    const providedFields = getProvidedFields(req.body || {}, editableFields);
    if (!providedFields.length) {
      return res.status(400).json({ ok: false, erro: 'Nenhum campo valido informado para edicao' });
    }

    const values = [];
    const setParts = [];
    for (const field of providedFields) {
      const normalizedValue = normalizePagamentoEscalaColaboradorValue(field, req.body[field]);
      if (field === 'data_pagamento' && normalizedValue === null) {
        return res.status(400).json({ ok: false, erro: 'data_pagamento invalida' });
      }
      values.push(normalizedValue);
      setParts.push(`${field} = $${values.length}`);
    }

    const result = await pool.query(
      `
      UPDATE pagamentos_escala_colaborador
      SET ${setParts.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${values.length + 1}
      RETURNING *
      `,
      [...values, pagamentoId]
    );

    return res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.patch('/pagamentos-escala-colaborador/:id/cancelar', requirePermission(ACCESS_PERMISSIONS.COLABORADORES_TOGGLE), async (req, res) => {
  try {
    await ensurePagamentosEscalaColaboradorTable();
    const pagamentoId = String(req.params.id || '').trim();
    if (!pagamentoId) {
      return res.status(400).json({ ok: false, erro: 'id do pagamento nao informado' });
    }

    const result = await pool.query(
      `
      UPDATE pagamentos_escala_colaborador
      SET status = 'cancelado', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [pagamentoId]
    );
    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Pagamento da escala nao encontrado' });
    }

    return res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.get('/colaboradores/:colaboradorId/eventos', async (req, res) => {
  try {
    await ensureColaboradoresTable();
    await ensureEscalaEventosTable();

    const colaboradorId = String(req.params.colaboradorId || '').trim();
    if (!colaboradorId) {
      return res.status(400).json({ ok: false, erro: 'colaboradorId nao informado' });
    }

    const colab = await pool.query('SELECT id FROM colaboradores WHERE id = $1', [colaboradorId]);
    if (!colab.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Colaborador nao encontrado' });
    }

    const baseQuery = `
      WITH eventos_colaborador AS (
        SELECT
          ev.id AS evento_id,
          ev.data_evento,
          ev.hora_inicio,
          ev.hora_fim,
          ev.contratante_nome,
          ev.cidade,
          ev.bairro,
          esc.funcao,
          esc.status_pagamento,
          esc.status_aceite,
          esc.id_recreador,
          CASE
            WHEN ev.data_evento ~ '^\\d{2}/\\d{2}/\\d{4}$'
            THEN to_date(ev.data_evento, 'DD/MM/YYYY')
            ELSE NULL
          END AS data_evento_date
        FROM escala_eventos esc
        INNER JOIN eventos ev ON ev.id = esc.evento_id
        WHERE esc.colaborador_id = $1
      )
      SELECT
        evento_id,
        data_evento,
        hora_inicio,
        hora_fim,
        contratante_nome,
        cidade,
        bairro,
        funcao,
        status_pagamento,
        status_aceite,
        id_recreador
      FROM eventos_colaborador
    `;

    const proximos = await pool.query(
      `
      ${baseQuery}
      WHERE data_evento_date IS NOT NULL
        AND data_evento_date >= CURRENT_DATE
      ORDER BY data_evento_date ASC, hora_inicio ASC NULLS LAST, evento_id ASC
      `,
      [colaboradorId]
    );

    const realizados = await pool.query(
      `
      ${baseQuery}
      WHERE data_evento_date IS NOT NULL
        AND data_evento_date < CURRENT_DATE
      ORDER BY data_evento_date DESC, hora_inicio DESC NULLS LAST, evento_id DESC
      `,
      [colaboradorId]
    );

    res.json({
      ok: true,
      dados: {
        proximos: proximos.rows,
        realizados: realizados.rows,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get(
  '/colaboradores/:colaboradorId/financeiro',
  requirePermission(ACCESS_PERMISSIONS.FINANCEIRO_COLABORADOR_VIEW),
  async (req, res) => {
  try {
    await ensureColaboradoresTable();
    await ensureEscalaEventosTable();

    const colaboradorId = String(req.params.colaboradorId || '').trim();
    if (!colaboradorId) {
      return res.status(400).json({ ok: false, erro: 'colaboradorId nao informado' });
    }

    const colab = await pool.query('SELECT id FROM colaboradores WHERE id = $1', [colaboradorId]);
    if (!colab.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Colaborador nao encontrado' });
    }

    const rInicio = parseOptionalFiltroDataEventoBR(req.query.data_inicio, 'data_inicio');
    if (!rInicio.ok) {
      return res.status(400).json({ ok: false, erro: rInicio.erro });
    }
    const rFim = parseOptionalFiltroDataEventoBR(req.query.data_fim, 'data_fim');
    if (!rFim.ok) {
      return res.status(400).json({ ok: false, erro: rFim.erro });
    }
    const dataInicioBr = rInicio.value;
    const dataFimBr = rFim.value;
    if (dataInicioBr && !isValidCalendarDataEventoBR(dataInicioBr)) {
      return res.status(400).json({ ok: false, erro: 'data_inicio nao e uma data valida no calendario.' });
    }
    if (dataFimBr && !isValidCalendarDataEventoBR(dataFimBr)) {
      return res.status(400).json({ ok: false, erro: 'data_fim nao e uma data valida no calendario.' });
    }
    if (dataInicioBr && dataFimBr && compareDataEventoBR(dataInicioBr, dataFimBr) > 0) {
      return res.status(400).json({
        ok: false,
        erro: 'data_inicio nao pode ser maior que data_fim.',
      });
    }

    const baseCte = `
      WITH linhas_financeiro AS (
        SELECT
          ev.id AS evento_id,
          ev.data_evento,
          ev.hora_inicio,
          ev.hora_fim,
          ev.contratante_nome,
          ev.cidade,
          ev.bairro,
          esc.funcao,
          esc.status_pagamento,
          esc.status_aceite,
          esc.valor_recreador,
          esc.id_recreador,
          CASE
            WHEN ev.data_evento ~ '^\\d{2}/\\d{2}/\\d{4}$'
            THEN to_date(ev.data_evento, 'DD/MM/YYYY')
            ELSE NULL
          END AS data_evento_date
        FROM escala_eventos esc
        INNER JOIN eventos ev ON ev.id = esc.evento_id
        WHERE esc.colaborador_id = $1
      )
      SELECT
        evento_id,
        data_evento,
        hora_inicio,
        hora_fim,
        contratante_nome,
        cidade,
        bairro,
        funcao,
        status_pagamento,
        status_aceite,
        valor_recreador,
        id_recreador
      FROM linhas_financeiro
    `;

    const filtroPeriodoSql = `
        AND ($2::text IS NULL OR data_evento_date >= to_date($2::text, 'DD/MM/YYYY'))
        AND ($3::text IS NULL OR data_evento_date <= to_date($3::text, 'DD/MM/YYYY'))
    `;

    const pagosRealizados = await pool.query(
      `
      ${baseCte}
      WHERE data_evento_date IS NOT NULL
        AND data_evento_date < CURRENT_DATE
        AND LOWER(TRIM(COALESCE(status_pagamento, ''))) = 'pago'
        ${filtroPeriodoSql}
      ORDER BY data_evento_date DESC, hora_inicio DESC NULLS LAST, evento_id DESC
      `,
      [colaboradorId, dataInicioBr, dataFimBr]
    );

    const previstosFuturos = await pool.query(
      `
      ${baseCte}
      WHERE data_evento_date IS NOT NULL
        AND data_evento_date >= CURRENT_DATE
        ${filtroPeriodoSql}
      ORDER BY data_evento_date ASC, hora_inicio ASC NULLS LAST, evento_id ASC
      `,
      [colaboradorId, dataInicioBr, dataFimBr]
    );

    const somaValor = (rows) =>
      rows.reduce((acc, row) => {
        const v = row.valor_recreador;
        if (v == null || v === '') return acc;
        const n = Number(v);
        return acc + (Number.isFinite(n) ? n : 0);
      }, 0);

    const totalRecebido = somaValor(pagosRealizados.rows);
    const totalPrevisto = somaValor(previstosFuturos.rows);

    res.json({
      ok: true,
      dados: {
        pagos_realizados: pagosRealizados.rows,
        previstos_futuros: previstosFuturos.rows,
        total_recebido: totalRecebido,
        total_previsto: totalPrevisto,
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
  }
);

app.get('/colaboradores/:id/parcerias', async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const colaboradorId = String(req.params.id ?? '').trim();
    if (!colaboradorId) {
      return res.status(400).json({ ok: false, erro: 'colaborador_id invalido' });
    }

    const colaborador = await pool.query('SELECT id FROM colaboradores WHERE id = $1', [colaboradorId]);
    if (!colaborador.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Colaborador nao encontrado' });
    }

    const result = await pool.query(
      `
      SELECT
        pc.*,
        r.nome_regiao,
        r.sigla_regiao
      FROM parcerias_colaborador pc
      LEFT JOIN regions r ON r.id = pc.region_id
      WHERE pc.colaborador_id = $1
      ORDER BY pc.ativo DESC, pc.prioridade_envio DESC, pc.created_at DESC
      `,
      [colaboradorId]
    );

    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.post('/colaboradores/:id/parcerias', requirePermission(ACCESS_PERMISSIONS.COLABORADORES_EDIT), async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const colaboradorId = String(req.params.id ?? '').trim();
    if (!colaboradorId) {
      return res.status(400).json({ ok: false, erro: 'colaborador_id invalido' });
    }

    const colaborador = await pool.query('SELECT id FROM colaboradores WHERE id = $1', [colaboradorId]);
    if (!colaborador.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Colaborador nao encontrado' });
    }

    const id = req.body.id || crypto.randomUUID();
    const tituloParceria = normalizeParceriaColaboradorValue('titulo_parceria', req.body.titulo_parceria);
    if (!tituloParceria) {
      return res.status(400).json({ ok: false, erro: 'titulo_parceria e obrigatorio' });
    }

    const regionId = normalizeParceriaColaboradorValue('region_id', req.body.region_id);
    if (regionId) {
      const regionExists = await pool.query('SELECT id FROM regions WHERE id = $1', [regionId]);
      if (!regionExists.rowCount) {
        return res.status(400).json({ ok: false, erro: 'Regiao nao encontrada' });
      }
    }

    const nomeServicoFuncao = normalizeParceriaColaboradorValue(
      'nome_servico_funcao',
      req.body.nome_servico_funcao
    );
    const valorReferenciaEspecifico = normalizeParceriaColaboradorValue(
      'valor_referencia_especifico',
      req.body.valor_referencia_especifico ?? 0
    );
    const disponibilidade = normalizeParceriaColaboradorValue('disponibilidade', req.body.disponibilidade);
    const prioridadeEnvio = normalizeParceriaColaboradorValue('prioridade_envio', req.body.prioridade_envio);
    const observacoes = normalizeParceriaColaboradorValue('observacoes', req.body.observacoes);
    const ativo = normalizeParceriaColaboradorValue('ativo', req.body.ativo ?? true);

    const result = await pool.query(
      `
      INSERT INTO parcerias_colaborador (
        id,
        colaborador_id,
        region_id,
        titulo_parceria,
        nome_servico_funcao,
        valor_referencia_especifico,
        disponibilidade,
        prioridade_envio,
        observacoes,
        ativo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
      `,
      [
        id,
        colaboradorId,
        regionId,
        tituloParceria,
        nomeServicoFuncao,
        valorReferenciaEspecifico,
        disponibilidade,
        prioridadeEnvio,
        observacoes,
        ativo,
      ]
    );

    const enriched = await pool.query(
      `
      SELECT
        pc.*,
        r.nome_regiao,
        r.sigla_regiao
      FROM parcerias_colaborador pc
      LEFT JOIN regions r ON r.id = pc.region_id
      WHERE pc.id = $1
      `,
      [id]
    );

    res.status(201).json({ ok: true, dados: enriched.rows[0] || result.rows[0] });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.post('/colaboradores', requirePermission(ACCESS_PERMISSIONS.COLABORADORES_CREATE), async (req, res) => {
  try {
    await ensureColaboradoresTable();

    const id = req.body.id || crypto.randomUUID();
    const nome = String(req.body.nome_colaborador || '').trim();
    if (!nome) {
      return res.status(400).json({ ok: false, erro: 'Nome do colaborador nao informado' });
    }

    const result = await pool.query(`
      INSERT INTO colaboradores (id, nome_colaborador, ativo)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [id, nome, normalizeBooleanValue(req.body.ativo ?? true)]);

    res.status(201).json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.post('/colaboradores/sincronizar-ids-equipe', requireRole(ACCESS_PROFILES.GESTOR), async (req, res) => {
  try {
    await ensureColaboradoresTable();
    await ensureGestaoEquipeSchema();

    const list = await pool.query(`
      SELECT p.colaborador_id, p.id_recreador AS id_perfil, c.id_recreador AS id_colab, c.nome_colaborador
      FROM colaborador_perfil_equipe p
      INNER JOIN colaboradores c ON c.id = p.colaborador_id
      WHERE p.id_recreador IS NOT NULL AND TRIM(BOTH FROM p.id_recreador) <> ''
    `);

    let atualizados = 0;
    let ignorados = 0;
    const conflitos = [];

    for (const row of list.rows) {
      const idPerfil = String(row.id_perfil).trim();
      const atualColab =
        row.id_colab != null && String(row.id_colab).trim() !== ''
          ? String(row.id_colab).trim()
          : null;

      if (!atualColab) {
        await pool.query(
          'UPDATE colaboradores SET id_recreador = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [idPerfil, row.colaborador_id]
        );
        atualizados += 1;
      } else if (atualColab === idPerfil) {
        ignorados += 1;
      } else {
        conflitos.push({
          colaborador_id: row.colaborador_id,
          nome_colaborador: row.nome_colaborador,
          id_recreador_colaboradores: atualColab,
          id_recreador_perfil_equipe: idPerfil,
        });
      }
    }

    const resumo = `Sincronizacao concluida: ${atualizados} atualizado(s), ${ignorados} ja alinhado(s), ${conflitos.length} conflito(s) nao resolvido(s).`;

    res.json({
      ok: true,
      dados: {
        atualizados,
        ignorados,
        conflitos,
        resumo,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.put('/colaboradores/:id', requireMutationPermission({
  toggleField: 'ativo',
  togglePermission: ACCESS_PERMISSIONS.COLABORADORES_TOGGLE,
  defaultPermission: ACCESS_PERMISSIONS.COLABORADORES_EDIT,
}), async (req, res) => {
  try {
    await ensureColaboradoresTable();

    if (Object.prototype.hasOwnProperty.call(req.body, 'id_recreador')) {
      return res.status(400).json({
        ok: false,
        erro:
          'Campo id_recreador nao pode ser alterado por esta rota; e sincronizado automaticamente pela Gestao Equipe.',
      });
    }

    const updateFields = getProvidedFields(req.body, COLABORADOR_FIELDS);
    if (!updateFields.length) {
      return res.status(400).json({ ok: false, erro: 'Nenhum campo para atualizar' });
    }

    const setClause = updateFields
      .map((field, index) => `${field} = $${index + 1}`)
      .join(', ');
    const values = updateFields.map((field) => normalizeCadastroBaseValue(field, req.body[field]));

    const result = await pool.query(`
      UPDATE colaboradores
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${values.length + 1}
      RETURNING *
    `, [...values, req.params.id]);

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Colaborador nao encontrado' });
    }

    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.put('/parcerias-colaborador/:id', requireMutationPermission({
  toggleField: 'ativo',
  togglePermission: ACCESS_PERMISSIONS.COLABORADORES_TOGGLE,
  defaultPermission: ACCESS_PERMISSIONS.COLABORADORES_EDIT,
}), async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const updateFields = getProvidedFields(req.body, PARCERIA_COLABORADOR_FIELDS);
    if (!updateFields.length) {
      return res.status(400).json({ ok: false, erro: 'Nenhum campo para atualizar' });
    }

    if (updateFields.includes('titulo_parceria')) {
      const titulo = normalizeParceriaColaboradorValue('titulo_parceria', req.body.titulo_parceria);
      if (!titulo) {
        return res.status(400).json({ ok: false, erro: 'titulo_parceria e obrigatorio' });
      }
    }

    if (updateFields.includes('region_id')) {
      const regionId = normalizeParceriaColaboradorValue('region_id', req.body.region_id);
      if (regionId) {
        const regionExists = await pool.query('SELECT id FROM regions WHERE id = $1', [regionId]);
        if (!regionExists.rowCount) {
          return res.status(400).json({ ok: false, erro: 'Regiao nao encontrada' });
        }
      }
    }

    const values = updateFields.map((field) => normalizeParceriaColaboradorValue(field, req.body[field]));
    const setClause = updateFields.map((field, index) => `${field} = $${index + 1}`).join(', ');

    const result = await pool.query(
      `
      UPDATE parcerias_colaborador
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${values.length + 1}
      RETURNING *
      `,
      [...values, req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Parceria nao encontrada' });
    }

    const enriched = await pool.query(
      `
      SELECT
        pc.*,
        r.nome_regiao,
        r.sigla_regiao
      FROM parcerias_colaborador pc
      LEFT JOIN regions r ON r.id = pc.region_id
      WHERE pc.id = $1
      `,
      [req.params.id]
    );

    res.json({ ok: true, dados: enriched.rows[0] || result.rows[0] });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.patch('/parcerias-colaborador/:id/ativo', requirePermission(ACCESS_PERMISSIONS.COLABORADORES_TOGGLE), async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const ativo = normalizeParceriaColaboradorValue('ativo', req.body?.ativo);
    const result = await pool.query(
      `
      UPDATE parcerias_colaborador
      SET ativo = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
      `,
      [ativo, req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Parceria nao encontrada' });
    }

    const enriched = await pool.query(
      `
      SELECT
        pc.*,
        r.nome_regiao,
        r.sigla_regiao
      FROM parcerias_colaborador pc
      LEFT JOIN regions r ON r.id = pc.region_id
      WHERE pc.id = $1
      `,
      [req.params.id]
    );

    res.json({ ok: true, dados: enriched.rows[0] || result.rows[0] });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.delete('/colaboradores/:id', requirePermission(ACCESS_PERMISSIONS.COLABORADORES_DELETE), async (req, res) => {
  try {
    await ensureColaboradoresTable();

    const result = await pool.query(
      'DELETE FROM colaboradores WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Colaborador nao encontrado' });
    }

    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get('/regions', async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const where = req.query.ativa !== undefined ? 'WHERE ativa = $1' : '';
    const params = req.query.ativa !== undefined ? [normalizeBooleanValue(req.query.ativa)] : [];
    const result = await pool.query(`
      SELECT *
      FROM regions
      ${where}
      ORDER BY nome_regiao ASC, created_at DESC
    `, params);

    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get('/regions/:id', async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const result = await pool.query(
      'SELECT * FROM regions WHERE id = $1',
      [req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Regiao nao encontrada' });
    }

    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.post('/regions', requirePermission(ACCESS_PERMISSIONS.REGIONS_CREATE), async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const id = req.body.id || crypto.randomUUID();
    const nome = normalizeRegionValue('nome_regiao', req.body.nome_regiao);
    if (!nome) {
      return res.status(400).json({ ok: false, erro: 'Nome da regiao nao informado' });
    }

    const sigla = normalizeRegionValue('sigla_regiao', req.body.sigla_regiao);

    const result = await pool.query(`
      INSERT INTO regions (id, nome_regiao, ativa, sigla_regiao)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [id, nome, normalizeBooleanValue(req.body.ativa ?? true), sigla]);

    res.status(201).json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.put('/regions/:id', requireMutationPermission({
  toggleField: 'ativa',
  togglePermission: ACCESS_PERMISSIONS.REGIONS_TOGGLE,
  defaultPermission: ACCESS_PERMISSIONS.REGIONS_EDIT,
}), async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const updateFields = getProvidedFields(req.body, REGION_FIELDS);
    if (!updateFields.length) {
      return res.status(400).json({ ok: false, erro: 'Nenhum campo para atualizar' });
    }

    if (updateFields.includes('nome_regiao')) {
      const nome = normalizeRegionValue('nome_regiao', req.body.nome_regiao);
      if (!nome) {
        return res.status(400).json({ ok: false, erro: 'Nome da regiao nao informado' });
      }
    }

    const setClause = updateFields
      .map((field, index) => `${field} = $${index + 1}`)
      .join(', ');
    const values = updateFields.map((field) => normalizeRegionValue(field, req.body[field]));

    const result = await pool.query(`
      UPDATE regions
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${values.length + 1}
      RETURNING *
    `, [...values, req.params.id]);

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Regiao nao encontrada' });
    }

    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.delete('/regions/:id', requirePermission(ACCESS_PERMISSIONS.REGIONS_DELETE), async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const regionId = String(req.params.id ?? '').trim();
    if (!regionId) {
      return res.status(400).json({ ok: false, erro: 'ID da regiao nao informado' });
    }

    const vinculos = await pool.query(
      'SELECT 1 FROM colaborador_perfil_equipe WHERE region_id = $1 LIMIT 1',
      [regionId]
    );
    if (vinculos.rowCount > 0) {
      return res.status(409).json({
        ok: false,
        erro:
          'Nao e possivel excluir esta regiao: existem perfis da equipe vinculados. Remova ou realoque os recreadores antes de excluir.',
      });
    }

    const result = await pool.query('DELETE FROM regions WHERE id = $1 RETURNING *', [regionId]);

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Regiao nao encontrada' });
    }

    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get('/valores-referencia-regiao', async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const filters = [];
    const params = [];

    if (req.query.region_id != null && String(req.query.region_id).trim() !== '') {
      params.push(String(req.query.region_id).trim());
      filters.push(`vrr.region_id = $${params.length}`);
    }

    if (req.query.ativo !== undefined) {
      params.push(normalizeBooleanValue(req.query.ativo));
      filters.push(`vrr.ativo = $${params.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const result = await pool.query(
      `
      SELECT
        vrr.*,
        r.nome_regiao,
        r.sigla_regiao
      FROM valores_referencia_regiao vrr
      INNER JOIN regions r ON r.id = vrr.region_id
      ${where}
      ORDER BY r.nome_regiao ASC, vrr.nome_servico_funcao ASC, vrr.created_at DESC
      `,
      params
    );

    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.post('/valores-referencia-regiao', requirePermission(ACCESS_PERMISSIONS.REGIONS_EDIT), async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const id = req.body.id || crypto.randomUUID();
    const regionId = normalizeValorReferenciaRegiaoValue('region_id', req.body.region_id);
    const nomeServicoFuncao = normalizeValorReferenciaRegiaoValue(
      'nome_servico_funcao',
      req.body.nome_servico_funcao
    );
    const ativo = normalizeValorReferenciaRegiaoValue('ativo', req.body.ativo ?? true);

    if (!regionId) {
      return res.status(400).json({ ok: false, erro: 'region_id e obrigatorio' });
    }
    if (!nomeServicoFuncao) {
      return res.status(400).json({ ok: false, erro: 'nome_servico_funcao e obrigatorio' });
    }

    const regionExists = await pool.query('SELECT id FROM regions WHERE id = $1', [regionId]);
    if (!regionExists.rowCount) {
      return res.status(400).json({ ok: false, erro: 'Regiao nao encontrada' });
    }

    const valorReferencia = normalizeValorReferenciaRegiaoValue(
      'valor_referencia',
      req.body.valor_referencia
    );
    const baseDuracao = normalizeValorReferenciaRegiaoValue('base_duracao', req.body.base_duracao);
    const observacoes = normalizeValorReferenciaRegiaoValue('observacoes', req.body.observacoes);

    const result = await pool.query(
      `
      INSERT INTO valores_referencia_regiao (
        id,
        region_id,
        nome_servico_funcao,
        valor_referencia,
        base_duracao,
        observacoes,
        ativo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [id, regionId, nomeServicoFuncao, valorReferencia, baseDuracao, observacoes, ativo]
    );

    const enriched = await pool.query(
      `
      SELECT
        vrr.*,
        r.nome_regiao,
        r.sigla_regiao
      FROM valores_referencia_regiao vrr
      INNER JOIN regions r ON r.id = vrr.region_id
      WHERE vrr.id = $1
      `,
      [id]
    );

    res.status(201).json({ ok: true, dados: enriched.rows[0] || result.rows[0] });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.put('/valores-referencia-regiao/:id', requireMutationPermission({
  toggleField: 'ativo',
  togglePermission: ACCESS_PERMISSIONS.REGIONS_TOGGLE,
  defaultPermission: ACCESS_PERMISSIONS.REGIONS_EDIT,
}), async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const updateFields = getProvidedFields(req.body, VALOR_REFERENCIA_REGIAO_FIELDS).filter(
      (field) => field !== 'region_id'
    );

    if (!updateFields.length) {
      return res.status(400).json({ ok: false, erro: 'Nenhum campo para atualizar' });
    }

    if (updateFields.includes('nome_servico_funcao')) {
      const nome = normalizeValorReferenciaRegiaoValue('nome_servico_funcao', req.body.nome_servico_funcao);
      if (!nome) {
        return res.status(400).json({ ok: false, erro: 'nome_servico_funcao e obrigatorio' });
      }
    }

    const values = updateFields.map((field) => normalizeValorReferenciaRegiaoValue(field, req.body[field]));
    const setClause = updateFields.map((field, index) => `${field} = $${index + 1}`).join(', ');

    const result = await pool.query(
      `
      UPDATE valores_referencia_regiao
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${values.length + 1}
      RETURNING *
      `,
      [...values, req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Valor de referencia nao encontrado' });
    }

    const enriched = await pool.query(
      `
      SELECT
        vrr.*,
        r.nome_regiao,
        r.sigla_regiao
      FROM valores_referencia_regiao vrr
      INNER JOIN regions r ON r.id = vrr.region_id
      WHERE vrr.id = $1
      `,
      [req.params.id]
    );

    res.json({ ok: true, dados: enriched.rows[0] || result.rows[0] });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.patch('/valores-referencia-regiao/:id/ativo', requirePermission(ACCESS_PERMISSIONS.REGIONS_TOGGLE), async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const ativo = normalizeValorReferenciaRegiaoValue('ativo', req.body?.ativo);
    const result = await pool.query(
      `
      UPDATE valores_referencia_regiao
      SET ativo = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
      `,
      [ativo, req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Valor de referencia nao encontrado' });
    }

    const enriched = await pool.query(
      `
      SELECT
        vrr.*,
        r.nome_regiao,
        r.sigla_regiao
      FROM valores_referencia_regiao vrr
      INNER JOIN regions r ON r.id = vrr.region_id
      WHERE vrr.id = $1
      `,
      [req.params.id]
    );

    res.json({ ok: true, dados: enriched.rows[0] || result.rows[0] });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

const ITEM_CATALOG_LIST_SQL = `
  SELECT ic.*, COALESCE(pos.em_posse, 0)::integer AS quantidade_em_posse
  FROM item_catalog ic
  LEFT JOIN (
    SELECT item_catalog_id, SUM(COALESCE(quantidade, 0)) AS em_posse
    FROM colaborador_item_catalog
    GROUP BY item_catalog_id
  ) pos ON pos.item_catalog_id = ic.id
`;

app.get('/item-catalog', async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const where = req.query.ativo !== undefined ? 'WHERE ic.ativo = $1' : '';
    const params = req.query.ativo !== undefined ? [normalizeBooleanValue(req.query.ativo)] : [];
    const result = await pool.query(
      `
      ${ITEM_CATALOG_LIST_SQL}
      ${where}
      ORDER BY ic.nome_item ASC, ic.created_at DESC
    `,
      params
    );

    res.json({ ok: true, dados: result.rows.map(enrichItemCatalogRow) });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get('/item-catalog/:id', async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const result = await pool.query(
      `
      ${ITEM_CATALOG_LIST_SQL}
      WHERE ic.id = $1
    `,
      [req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Item do catalogo nao encontrado' });
    }

    res.json({ ok: true, dados: enrichItemCatalogRow(result.rows[0]) });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.post('/item-catalog', requirePermission(ACCESS_PERMISSIONS.CATALOG_ITEM_CREATE), async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const id = req.body.id || crypto.randomUUID();
    const nome = normalizeItemCatalogValue('nome_item', req.body.nome_item);
    if (!nome) {
      return res.status(400).json({ ok: false, erro: 'Nome do item nao informado' });
    }

    let categoria = null;
    let descricao = null;
    let natureza_item = null;
    let quantidade_total = null;
    try {
      categoria = normalizeItemCatalogValue('categoria', req.body.categoria);
      descricao = normalizeItemCatalogValue('descricao', req.body.descricao);
      if (Object.prototype.hasOwnProperty.call(req.body, 'natureza_item')) {
        natureza_item = normalizeItemCatalogValue('natureza_item', req.body.natureza_item);
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'quantidade_total')) {
        quantidade_total = normalizeItemCatalogValue('quantidade_total', req.body.quantidade_total);
      }
    } catch (e) {
      const status = e.statusCode || 400;
      return res.status(status).json({ ok: false, erro: e.message });
    }

    const result = await pool.query(
      `
      INSERT INTO item_catalog (id, nome_item, categoria, descricao, natureza_item, quantidade_total, ativo)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
      [id, nome, categoria, descricao, natureza_item, quantidade_total, normalizeBooleanValue(req.body.ativo ?? true)]
    );

    const row = result.rows[0];
    const agg = await pool.query(
      `
      ${ITEM_CATALOG_LIST_SQL}
      WHERE ic.id = $1
    `,
      [id]
    );

    res.status(201).json({ ok: true, dados: enrichItemCatalogRow(agg.rows[0] || row) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.put('/item-catalog/:id', requireMutationPermission({
  toggleField: 'ativo',
  togglePermission: ACCESS_PERMISSIONS.CATALOG_ITEM_TOGGLE,
  defaultPermission: ACCESS_PERMISSIONS.CATALOG_ITEM_EDIT,
}), async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const updateFields = getProvidedFields(req.body, ITEM_CATALOG_FIELDS);
    if (!updateFields.length) {
      return res.status(400).json({ ok: false, erro: 'Nenhum campo para atualizar' });
    }

    if (updateFields.includes('nome_item')) {
      const nome = normalizeItemCatalogValue('nome_item', req.body.nome_item);
      if (!nome) {
        return res.status(400).json({ ok: false, erro: 'Nome do item nao informado' });
      }
    }

    let values;
    try {
      values = updateFields.map((field) => normalizeItemCatalogValue(field, req.body[field]));
    } catch (e) {
      const status = e.statusCode || 400;
      return res.status(status).json({ ok: false, erro: e.message });
    }

    const setClause = updateFields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const result = await pool.query(
      `
      UPDATE item_catalog
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${values.length + 1}
      RETURNING *
    `,
      [...values, req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Item do catalogo nao encontrado' });
    }

    const agg = await pool.query(
      `
      ${ITEM_CATALOG_LIST_SQL}
      WHERE ic.id = $1
    `,
      [req.params.id]
    );

    res.json({ ok: true, dados: enrichItemCatalogRow(agg.rows[0] || result.rows[0]) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.get('/equipe-perfis/by-region/:regionId', async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const result = await pool.query(
      `
      SELECT p.*, c.nome_colaborador, r.nome_regiao
      FROM colaborador_perfil_equipe p
      INNER JOIN colaboradores c ON c.id = p.colaborador_id
      LEFT JOIN regions r ON r.id = p.region_id
      WHERE p.region_id = $1
      ORDER BY c.nome_colaborador ASC, p.created_at DESC
    `,
      [req.params.regionId]
    );

    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get('/equipe-perfis', async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const result = await pool.query(`
      SELECT p.*, c.nome_colaborador, r.nome_regiao
      FROM colaborador_perfil_equipe p
      INNER JOIN colaboradores c ON c.id = p.colaborador_id
      LEFT JOIN regions r ON r.id = p.region_id
      ORDER BY c.nome_colaborador ASC, p.created_at DESC
    `);

    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get('/equipe-perfis/:colaboradorId/itens', async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const colaboradorId = String(req.params.colaboradorId ?? '').trim();
    if (!colaboradorId) {
      return res.status(400).json({ ok: false, erro: 'colaborador_id invalido' });
    }

    const colab = await pool.query('SELECT id FROM colaboradores WHERE id = $1', [colaboradorId]);
    if (!colab.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Colaborador nao encontrado' });
    }

    const result = await pool.query(
      `
      SELECT cic.*, ic.nome_item, ic.categoria, ic.descricao, ic.natureza_item
      FROM colaborador_item_catalog cic
      INNER JOIN item_catalog ic ON ic.id = cic.item_catalog_id
      WHERE cic.colaborador_id = $1
      ORDER BY cic.created_at DESC
    `,
      [colaboradorId]
    );

    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.post('/equipe-perfis/:colaboradorId/itens', async (req, res) => {
  let client;
  try {
    await ensureGestaoEquipeSchema();

    const colaboradorId = String(req.params.colaboradorId ?? '').trim();
    if (!colaboradorId) {
      return res.status(400).json({ ok: false, erro: 'colaborador_id invalido' });
    }

    const itemCatalogId = normalizeEquipeItemVinculoCatalogId(req.body.item_catalog_id);
    if (!itemCatalogId) {
      return res.status(400).json({ ok: false, erro: 'item_catalog_id e obrigatorio' });
    }

    const hasBody = (k) => Object.prototype.hasOwnProperty.call(req.body, k);

    let quantidade;
    let status_item;
    let data_entrega;
    let data_envio;
    let observacoes;
    let descricao_complementar;
    try {
      quantidade = normalizeEquipeItemVinculoQuantidade(req.body.quantidade, true);
      status_item = hasBody('status_item') ? normalizeEquipeItemVinculoOptionalText(req.body.status_item) : null;
      data_entrega = hasBody('data_entrega') ? normalizeEquipeItemVinculoDate(req.body.data_entrega) : null;
      data_envio = hasBody('data_envio') ? normalizeEquipeItemVinculoDate(req.body.data_envio) : null;
      observacoes = hasBody('observacoes') ? normalizeEquipeItemVinculoOptionalText(req.body.observacoes) : null;
      descricao_complementar = hasBody('descricao_complementar')
        ? normalizeEquipeItemVinculoOptionalText(req.body.descricao_complementar)
        : null;
      if (status_item != null) {
        status_item = normalizeEquipeItemVinculoStatusItem(status_item);
      }
    } catch (e) {
      return res.status(e.statusCode || 400).json({ ok: false, erro: e.message });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const colab = await client.query('SELECT id FROM colaboradores WHERE id = $1', [colaboradorId]);
    if (!colab.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, erro: 'Colaborador nao encontrado' });
    }

    const dupe = await client.query(
      `
      SELECT * FROM colaborador_item_catalog
      WHERE colaborador_id = $1 AND item_catalog_id = $2 AND (status_item IS NOT DISTINCT FROM $3)
      FOR UPDATE
    `,
      [colaboradorId, itemCatalogId, status_item]
    );

    let vinculoId;
    let statusResposta = 201;

    if (dupe.rowCount) {
      const row = dupe.rows[0];
      vinculoId = row.id;
      const existingQty =
        row.quantidade != null && Number.isFinite(Number(row.quantidade))
          ? Math.max(1, Math.floor(Number(row.quantidade)))
          : 1;
      const newTotalQty = existingQty + quantidade;

      await assertEstoqueItemCatalogDisponivel(client, itemCatalogId, newTotalQty, vinculoId);

      let nextStatus = row.status_item;
      let nextDataEntrega = row.data_entrega;
      let nextDataEnvio = row.data_envio;
      let nextObs = row.observacoes;
      let nextDesc = row.descricao_complementar;
      try {
        if (hasBody('status_item')) {
          const st = normalizeEquipeItemVinculoOptionalText(req.body.status_item);
          nextStatus = st == null ? null : normalizeEquipeItemVinculoStatusItem(st);
        }
        if (hasBody('data_entrega')) nextDataEntrega = normalizeEquipeItemVinculoDate(req.body.data_entrega);
        if (hasBody('data_envio')) nextDataEnvio = normalizeEquipeItemVinculoDate(req.body.data_envio);
        if (hasBody('observacoes')) nextObs = normalizeEquipeItemVinculoOptionalText(req.body.observacoes);
        if (hasBody('descricao_complementar')) {
          nextDesc = normalizeEquipeItemVinculoOptionalText(req.body.descricao_complementar);
        }
      } catch (e) {
        await client.query('ROLLBACK');
        return res.status(e.statusCode || 400).json({ ok: false, erro: e.message });
      }

      await client.query(
        `
        UPDATE colaborador_item_catalog
        SET quantidade = $1,
            status_item = $2,
            data_entrega = $3,
            data_envio = $4,
            observacoes = $5,
            descricao_complementar = $6,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
      `,
        [newTotalQty, nextStatus, nextDataEntrega, nextDataEnvio, nextObs, nextDesc, vinculoId]
      );

      statusResposta = 200;
    } else {
      await assertEstoqueItemCatalogDisponivel(client, itemCatalogId, quantidade, null);

      vinculoId = crypto.randomUUID();
      await client.query(
        `
        INSERT INTO colaborador_item_catalog (
          id, colaborador_id, item_catalog_id, quantidade, status_item, data_entrega, data_envio, observacoes, descricao_complementar
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
        [
          vinculoId,
          colaboradorId,
          itemCatalogId,
          quantidade,
          status_item,
          data_entrega,
          data_envio,
          observacoes,
          descricao_complementar,
        ]
      );
    }

    await client.query('COMMIT');

    const enriched = await pool.query(
      `
      SELECT cic.*, ic.nome_item, ic.categoria, ic.descricao
      FROM colaborador_item_catalog cic
      INNER JOIN item_catalog ic ON ic.id = cic.item_catalog_id
      WHERE cic.id = $1
    `,
      [vinculoId]
    );

    res.status(statusResposta).json({ ok: true, dados: enriched.rows[0] });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
    }
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  } finally {
    if (client) client.release();
  }
});

app.put('/equipe-perfis/:colaboradorId/itens/:itemVinculoId', async (req, res) => {
  let client;
  try {
    await ensureGestaoEquipeSchema();

    const colaboradorId = String(req.params.colaboradorId ?? '').trim();
    const itemVinculoId = String(req.params.itemVinculoId ?? '').trim();
    if (!colaboradorId || !itemVinculoId) {
      return res.status(400).json({ ok: false, erro: 'Parametros invalidos' });
    }

    const updateFields = getProvidedFields(req.body, EQUIPE_ITEM_VINCULO_UPDATE_FIELDS);
    if (!updateFields.length) {
      return res.status(400).json({ ok: false, erro: 'Nenhum campo para atualizar' });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT * FROM colaborador_item_catalog WHERE id = $1 AND colaborador_id = $2 FOR UPDATE',
      [itemVinculoId, colaboradorId]
    );
    if (!existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, erro: 'Vinculo de item nao encontrado' });
    }

    const row = existing.rows[0];
    let finalItemId = row.item_catalog_id;
    let finalQty =
      row.quantidade != null && Number.isFinite(Number(row.quantidade))
        ? Math.max(1, Math.floor(Number(row.quantidade)))
        : 1;

    try {
      if (updateFields.includes('item_catalog_id')) {
        finalItemId = normalizeEquipeItemVinculoUpdateField('item_catalog_id', req.body.item_catalog_id);
      }
      if (updateFields.includes('quantidade')) {
        finalQty = normalizeEquipeItemVinculoUpdateField('quantidade', req.body.quantidade);
      }
    } catch (e) {
      await client.query('ROLLBACK');
      return res.status(e.statusCode || 400).json({ ok: false, erro: e.message });
    }

    if (!finalItemId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, erro: 'item_catalog_id invalido' });
    }

    let finalStatus = row.status_item;
    if (updateFields.includes('status_item')) {
      const t = normalizeEquipeItemVinculoOptionalText(req.body.status_item);
      if (t == null) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          ok: false,
          erro: 'status_item invalido. Valores permitidos: Reservado, Enviado, Em posse',
        });
      }
      try {
        finalStatus = normalizeEquipeItemVinculoStatusItem(t);
      } catch (e) {
        await client.query('ROLLBACK');
        return res.status(e.statusCode || 400).json({ ok: false, erro: e.message });
      }
    }

    if (updateFields.includes('status_item')) {
      const sibling = await client.query(
        `
        SELECT * FROM colaborador_item_catalog
        WHERE colaborador_id = $1 AND item_catalog_id = $2
          AND (status_item IS NOT DISTINCT FROM $3) AND id != $4
        FOR UPDATE
        LIMIT 1
      `,
        [colaboradorId, finalItemId, finalStatus, itemVinculoId]
      );

      if (sibling.rowCount) {
        const srow = sibling.rows[0];
        const sibQty =
          srow.quantidade != null && Number.isFinite(Number(srow.quantidade))
            ? Math.max(1, Math.floor(Number(srow.quantidade)))
            : 1;
        const mergedQty = sibQty + finalQty;

        try {
          await assertEstoqueItemCatalogDisponivelExcluindoIds(client, finalItemId, mergedQty, [
            srow.id,
            itemVinculoId,
          ]);
        } catch (e) {
          await client.query('ROLLBACK');
          return res.status(e.statusCode || 500).json({ ok: false, erro: e.message });
        }

        await client.query(
          `
          UPDATE colaborador_item_catalog
          SET quantidade = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 AND colaborador_id = $3
        `,
          [mergedQty, srow.id, colaboradorId]
        );

        await client.query('DELETE FROM colaborador_item_catalog WHERE id = $1 AND colaborador_id = $2', [
          itemVinculoId,
          colaboradorId,
        ]);

        await client.query('COMMIT');

        const enrichedMerge = await pool.query(
          `
          SELECT cic.*, ic.nome_item, ic.categoria, ic.descricao
          FROM colaborador_item_catalog cic
          INNER JOIN item_catalog ic ON ic.id = cic.item_catalog_id
          WHERE cic.id = $1
        `,
          [srow.id]
        );

        return res.json({ ok: true, dados: enrichedMerge.rows[0] });
      }
    }

    await assertEstoqueItemCatalogDisponivel(client, finalItemId, finalQty, itemVinculoId);

    const setClause = updateFields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    let values;
    try {
      values = updateFields.map((field) => normalizeEquipeItemVinculoUpdateField(field, req.body[field]));
    } catch (e) {
      await client.query('ROLLBACK');
      return res.status(e.statusCode || 400).json({ ok: false, erro: e.message });
    }

    await client.query(
      `
      UPDATE colaborador_item_catalog
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${values.length + 1} AND colaborador_id = $${values.length + 2}
    `,
      [...values, itemVinculoId, colaboradorId]
    );

    await client.query('COMMIT');

    const enriched = await pool.query(
      `
      SELECT cic.*, ic.nome_item, ic.categoria, ic.descricao
      FROM colaborador_item_catalog cic
      INNER JOIN item_catalog ic ON ic.id = cic.item_catalog_id
      WHERE cic.id = $1
    `,
      [itemVinculoId]
    );

    res.json({ ok: true, dados: enriched.rows[0] });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
    }
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  } finally {
    if (client) client.release();
  }
});

app.post('/equipe-perfis/:colaboradorId/itens/:itemVinculoId/devolver', async (req, res) => {
  let client;
  try {
    await ensureGestaoEquipeSchema();

    const colaboradorId = String(req.params.colaboradorId ?? '').trim();
    const itemVinculoId = String(req.params.itemVinculoId ?? '').trim();
    if (!colaboradorId || !itemVinculoId) {
      return res.status(400).json({ ok: false, erro: 'Parametros invalidos' });
    }

    const qdev = req.body?.quantidade_devolvida;
    const n = Number(qdev);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      return res.status(400).json({
        ok: false,
        erro: 'quantidade_devolvida deve ser um inteiro maior ou igual a 1',
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT * FROM colaborador_item_catalog WHERE id = $1 AND colaborador_id = $2 FOR UPDATE',
      [itemVinculoId, colaboradorId]
    );
    if (!existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, erro: 'Vinculo de item nao encontrado' });
    }

    const row = existing.rows[0];
    const currentQty =
      row.quantidade != null && Number.isFinite(Number(row.quantidade))
        ? Math.max(1, Math.floor(Number(row.quantidade)))
        : 1;

    if (n > currentQty) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        erro: 'quantidade_devolvida nao pode ser maior que a quantidade atual do vinculo',
      });
    }

    if (n === currentQty) {
      await client.query('DELETE FROM colaborador_item_catalog WHERE id = $1 AND colaborador_id = $2', [
        itemVinculoId,
        colaboradorId,
      ]);
      await client.query('COMMIT');
      return res.json({
        ok: true,
        dados: {
          removido: true,
          colaborador_id: colaboradorId,
          item_vinculo_id: itemVinculoId,
          item_catalog_id: row.item_catalog_id,
          quantidade_devolvida: n,
        },
      });
    }

    const newQty = currentQty - n;
    await client.query(
      `
      UPDATE colaborador_item_catalog
      SET quantidade = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND colaborador_id = $3
    `,
      [newQty, itemVinculoId, colaboradorId]
    );

    await client.query('COMMIT');

    const enriched = await pool.query(
      `
      SELECT cic.*, ic.nome_item, ic.categoria, ic.descricao
      FROM colaborador_item_catalog cic
      INNER JOIN item_catalog ic ON ic.id = cic.item_catalog_id
      WHERE cic.id = $1
    `,
      [itemVinculoId]
    );

    res.json({
      ok: true,
      dados: {
        ...enriched.rows[0],
        quantidade_devolvida: n,
      },
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
    }
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  } finally {
    if (client) client.release();
  }
});

app.post('/equipe-perfis/:colaboradorId/itens/:itemVinculoId/consumir', async (req, res) => {
  let client;
  try {
    await ensureGestaoEquipeSchema();

    const colaboradorId = String(req.params.colaboradorId ?? '').trim();
    const itemVinculoId = String(req.params.itemVinculoId ?? '').trim();
    if (!colaboradorId || !itemVinculoId) {
      return res.status(400).json({ ok: false, erro: 'Parametros invalidos' });
    }

    const qc = req.body?.quantidade_consumida;
    const n = Number(qc);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      return res.status(400).json({
        ok: false,
        erro: 'quantidade_consumida deve ser um inteiro maior ou igual a 1',
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const existing = await client.query(
      `
      SELECT cic.*, ic.natureza_item
      FROM colaborador_item_catalog cic
      INNER JOIN item_catalog ic ON ic.id = cic.item_catalog_id
      WHERE cic.id = $1 AND cic.colaborador_id = $2
      FOR UPDATE OF cic, ic
    `,
      [itemVinculoId, colaboradorId]
    );
    if (!existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, erro: 'Vinculo de item nao encontrado' });
    }

    const row = existing.rows[0];
    if (String(row.status_item || '').trim() !== 'Em posse') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        erro: 'Consumo assistido exige status_item = Em posse neste vinculo',
      });
    }
    if (!isNaturezaConsumivelCatalog(row.natureza_item)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        erro: 'Consumo assistido aplica-se somente a itens de natureza Consumivel no catalogo',
      });
    }

    const currentQty =
      row.quantidade != null && Number.isFinite(Number(row.quantidade))
        ? Math.max(1, Math.floor(Number(row.quantidade)))
        : 1;

    if (n > currentQty) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        erro: 'quantidade_consumida nao pode ser maior que a quantidade atual do vinculo',
      });
    }

    if (n === currentQty) {
      await client.query('DELETE FROM colaborador_item_catalog WHERE id = $1 AND colaborador_id = $2', [
        itemVinculoId,
        colaboradorId,
      ]);
      await client.query(
        `
        UPDATE item_catalog
        SET
          quantidade_total = CASE
            WHEN quantidade_total IS NULL THEN NULL
            ELSE GREATEST(0, quantidade_total - $1::int)
          END,
          quantidade_consumida_acumulada = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
        [n, row.item_catalog_id]
      );
      await client.query('COMMIT');
      return res.json({
        ok: true,
        dados: {
          removido: true,
          colaborador_id: colaboradorId,
          item_vinculo_id: itemVinculoId,
          item_catalog_id: row.item_catalog_id,
          quantidade_consumida: n,
        },
      });
    }

    const newQty = currentQty - n;
    await client.query(
      `
      UPDATE colaborador_item_catalog
      SET quantidade = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND colaborador_id = $3
    `,
      [newQty, itemVinculoId, colaboradorId]
    );

    await client.query(
      `
      UPDATE item_catalog
      SET
        quantidade_total = CASE
          WHEN quantidade_total IS NULL THEN NULL
          ELSE GREATEST(0, quantidade_total - $1::int)
        END,
        quantidade_consumida_acumulada = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `,
      [n, row.item_catalog_id]
    );

    await client.query('COMMIT');

    const enriched = await pool.query(
      `
      SELECT cic.*, ic.nome_item, ic.categoria, ic.descricao, ic.natureza_item
      FROM colaborador_item_catalog cic
      INNER JOIN item_catalog ic ON ic.id = cic.item_catalog_id
      WHERE cic.id = $1
    `,
      [itemVinculoId]
    );

    res.json({
      ok: true,
      dados: {
        ...enriched.rows[0],
        quantidade_consumida: n,
      },
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
    }
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  } finally {
    if (client) client.release();
  }
});

app.delete('/equipe-perfis/:colaboradorId/itens/:itemVinculoId', async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const colaboradorId = String(req.params.colaboradorId ?? '').trim();
    const itemVinculoId = String(req.params.itemVinculoId ?? '').trim();
    if (!colaboradorId || !itemVinculoId) {
      return res.status(400).json({ ok: false, erro: 'Parametros invalidos' });
    }

    const result = await pool.query(
      'DELETE FROM colaborador_item_catalog WHERE id = $1 AND colaborador_id = $2 RETURNING *',
      [itemVinculoId, colaboradorId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Vinculo de item nao encontrado' });
    }

    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get('/equipe-perfis/:colaboradorId', async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    const result = await pool.query(
      `
      SELECT p.*, c.nome_colaborador, r.nome_regiao
      FROM colaborador_perfil_equipe p
      INNER JOIN colaboradores c ON c.id = p.colaborador_id
      LEFT JOIN regions r ON r.id = p.region_id
      WHERE p.colaborador_id = $1
    `,
      [req.params.colaboradorId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Perfil da equipe nao encontrado' });
    }

    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.post('/equipe-perfis/:colaboradorId/mover-regiao', async (req, res) => {
  let client;
  try {
    await ensureGestaoEquipeSchema();

    const colaboradorId = String(req.params.colaboradorId ?? '').trim();
    if (!colaboradorId) {
      return res.status(400).json({ ok: false, erro: 'colaborador_id nao informado' });
    }

    const newRegionId = normalizePerfilEquipeValue('region_id', req.body?.region_id);
    if (!newRegionId) {
      return res.status(400).json({ ok: false, erro: 'region_id e obrigatorio no body' });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const perfilRes = await client.query(
      'SELECT * FROM colaborador_perfil_equipe WHERE colaborador_id = $1 FOR UPDATE',
      [colaboradorId]
    );
    if (!perfilRes.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, erro: 'Perfil da equipe nao encontrado' });
    }

    const perfilRow = perfilRes.rows[0];
    const currentRegionId = normalizePerfilEquipeValue('region_id', perfilRow.region_id);
    if (currentRegionId && currentRegionId === newRegionId) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        erro: 'O perfil ja esta vinculado a esta regiao.',
      });
    }

    const regionLock = await client.query(
      'SELECT id, sigla_regiao FROM regions WHERE id = $1 FOR UPDATE',
      [newRegionId]
    );
    if (!regionLock.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, erro: 'Regiao destino nao encontrada' });
    }

    const siglaUpper = normalizeRegionValue('sigla_regiao', regionLock.rows[0].sigla_regiao);
    if (!siglaUpper) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        erro:
          'Regiao destino sem sigla_regiao cadastrada. Defina a sigla antes de mover o perfil para esta regiao.',
      });
    }

    const idRecreador = await allocateNextIdRecreadorForRegion(client, newRegionId, siglaUpper);

    await client.query(
      `
      UPDATE colaborador_perfil_equipe
      SET region_id = $1, id_recreador = $2, updated_at = CURRENT_TIMESTAMP
      WHERE colaborador_id = $3
      `,
      [newRegionId, idRecreador, colaboradorId]
    );

    await syncColaboradorIdRecreadorFromPerfilEquipe(client, colaboradorId, idRecreador);

    await client.query('COMMIT');

    const enriched = await pool.query(
      `
      SELECT p.*, c.nome_colaborador, r.nome_regiao
      FROM colaborador_perfil_equipe p
      INNER JOIN colaboradores c ON c.id = p.colaborador_id
      LEFT JOIN regions r ON r.id = p.region_id
      WHERE p.colaborador_id = $1
    `,
      [colaboradorId]
    );

    res.json({ ok: true, dados: enriched.rows[0] });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
    }
    if (error.code === '23505') {
      return res.status(409).json({
        ok: false,
        erro: 'Conflito ao gerar id_recreador na regiao destino. Tente novamente.',
      });
    }
    if (error.code === '23503') {
      return res.status(400).json({ ok: false, erro: 'Referencia invalida (region_id)' });
    }
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  } finally {
    if (client) client.release();
  }
});

app.post('/equipe-perfis/:colaboradorId/atribuir-id', async (req, res) => {
  let client;
  try {
    await ensureGestaoEquipeSchema();

    const colaboradorId = String(req.params.colaboradorId ?? '').trim();
    if (!colaboradorId) {
      return res.status(400).json({ ok: false, erro: 'colaborador_id nao informado' });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const perfilRes = await client.query(
      'SELECT * FROM colaborador_perfil_equipe WHERE colaborador_id = $1 FOR UPDATE',
      [colaboradorId]
    );
    if (!perfilRes.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, erro: 'Perfil da equipe nao encontrado' });
    }

    const perfilRow = perfilRes.rows[0];
    const idAtual =
      perfilRow.id_recreador != null && String(perfilRow.id_recreador).trim() !== ''
        ? String(perfilRow.id_recreador).trim()
        : null;
    if (idAtual != null) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        ok: false,
        erro: `Este perfil ja possui id_recreador atribuido (${idAtual}). Nada a regularizar.`,
      });
    }

    const regionId = normalizePerfilEquipeValue('region_id', perfilRow.region_id);
    if (!regionId) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        erro:
          'Perfil sem region_id. Defina a regiao do perfil (ex.: mover de regiao) antes de atribuir id_recreador.',
      });
    }

    const regionLock = await client.query(
      'SELECT id, sigla_regiao FROM regions WHERE id = $1 FOR UPDATE',
      [regionId]
    );
    if (!regionLock.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        erro: 'Regiao do perfil nao encontrada. Verifique o region_id cadastrado.',
      });
    }

    const siglaUpper = normalizeRegionValue('sigla_regiao', regionLock.rows[0].sigla_regiao);
    if (!siglaUpper) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        erro:
          'Regiao sem sigla_regiao cadastrada. Defina a sigla da regiao antes de atribuir id_recreador.',
      });
    }

    const idRecreador = await allocateNextIdRecreadorForRegion(client, regionId, siglaUpper);

    await client.query(
      `
      UPDATE colaborador_perfil_equipe
      SET id_recreador = $1, updated_at = CURRENT_TIMESTAMP
      WHERE colaborador_id = $2
    `,
      [idRecreador, colaboradorId]
    );

    await syncColaboradorIdRecreadorFromPerfilEquipe(client, colaboradorId, idRecreador);

    await client.query('COMMIT');

    const enriched = await pool.query(
      `
      SELECT p.*, c.nome_colaborador, r.nome_regiao
      FROM colaborador_perfil_equipe p
      INNER JOIN colaboradores c ON c.id = p.colaborador_id
      LEFT JOIN regions r ON r.id = p.region_id
      WHERE p.colaborador_id = $1
    `,
      [colaboradorId]
    );

    res.json({ ok: true, dados: enriched.rows[0] });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
    }
    if (error.code === '23505') {
      return res.status(409).json({
        ok: false,
        erro: 'Conflito ao gerar id_recreador. Tente novamente.',
      });
    }
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  } finally {
    if (client) client.release();
  }
});

app.post('/equipe-perfis', async (req, res) => {
  let client;
  try {
    await ensureGestaoEquipeSchema();

    if (Object.prototype.hasOwnProperty.call(req.body, 'nome_colaborador')) {
      return res.status(400).json({
        ok: false,
        erro: 'Campo nome_colaborador nao pode ser enviado nesta rota',
      });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'id_recreador')) {
      return res.status(400).json({
        ok: false,
        erro: 'Campo id_recreador nao pode ser enviado nesta rota (gerado automaticamente pelo servidor)',
      });
    }

    const regionId = normalizePerfilEquipeValue('region_id', req.body.region_id);
    if (!regionId) {
      return res.status(400).json({
        ok: false,
        erro: 'region_id e obrigatorio para criar perfil da equipe',
      });
    }

    const optionalFields = getProvidedFields(req.body, PERFIL_EQUIPE_UPDATE_FIELDS)
      .filter((f) => f !== 'region_id')
      .sort();

    client = await pool.connect();
    await client.query('BEGIN');

    const resolved = await resolveColaboradorIdParaEquipePerfil(client, req.body.colaborador_id);
    if (!resolved.ok) {
      await client.query('ROLLBACK');
      return res.status(resolved.status).json({ ok: false, erro: resolved.erro });
    }
    const colaboradorId = resolved.colaboradorId;

    const existing = await client.query(
      'SELECT colaborador_id FROM colaborador_perfil_equipe WHERE colaborador_id = $1',
      [colaboradorId]
    );
    if (existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        ok: false,
        erro:
          'Este colaborador ja possui perfil na Gestao Equipe (regra: um perfil por colaborador_id em todo o sistema). Para mudar de regiao, use POST /equipe-perfis/:colaboradorId/mover-regiao.',
      });
    }

    const regionLock = await client.query(
      'SELECT id, sigla_regiao FROM regions WHERE id = $1 FOR UPDATE',
      [regionId]
    );
    if (!regionLock.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, erro: 'Regiao nao encontrada para o region_id informado' });
    }

    const siglaUpper = normalizeRegionValue('sigla_regiao', regionLock.rows[0].sigla_regiao);
    if (!siglaUpper) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        erro:
          'Regiao sem sigla_regiao cadastrada. Defina a sigla da regiao antes de vincular recreadores a ela na Gestao Equipe.',
      });
    }

    const idRecreador = await allocateNextIdRecreadorForRegion(client, regionId, siglaUpper);

    const columns = ['colaborador_id', 'region_id', 'id_recreador', ...optionalFields];
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const values = [
      colaboradorId,
      regionId,
      idRecreador,
      ...optionalFields.map((field) => normalizePerfilEquipeValue(field, req.body[field])),
    ];

    const result = await client.query(
      `
      INSERT INTO colaborador_perfil_equipe (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `,
      values
    );

    await syncColaboradorIdRecreadorFromPerfilEquipe(client, colaboradorId, idRecreador);

    await client.query('COMMIT');

    const row = result.rows[0];
    const enriched = await pool.query(
      `
      SELECT p.*, c.nome_colaborador, r.nome_regiao
      FROM colaborador_perfil_equipe p
      INNER JOIN colaboradores c ON c.id = p.colaborador_id
      LEFT JOIN regions r ON r.id = p.region_id
      WHERE p.colaborador_id = $1
    `,
      [colaboradorId]
    );

    res.status(201).json({ ok: true, dados: enriched.rows[0] || row });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
    }
    if (error.code === '23505') {
      const cst = String(error.constraint || '');
      if (
        cst === 'colaborador_perfil_equipe_region_id_recreador_uq' ||
        cst.includes('region_id_recreador')
      ) {
        return res.status(409).json({
          ok: false,
          erro: 'Conflito ao gerar id_recreador nesta regiao. Tente novamente.',
        });
      }
      if (cst.includes('pkey') || cst.toLowerCase().includes('primary')) {
        return res.status(409).json({
          ok: false,
          erro:
            'Ja existe perfil de equipe para este colaborador_id (chave primaria). Um colaborador so pode ter um perfil; para mudar de regiao use mover-regiao.',
        });
      }
      return res.status(409).json({
        ok: false,
        erro:
          'Conflito ao salvar perfil (indice unico no banco). Se nao for id_recreador na regiao, verifique duplicidade de colaborador_id.',
      });
    }
    if (error.code === '23503') {
      return res.status(400).json({ ok: false, erro: 'Referencia invalida (ex.: region_id)' });
    }
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  } finally {
    if (client) client.release();
  }
});

app.put('/equipe-perfis/:colaboradorId', async (req, res) => {
  try {
    await ensureGestaoEquipeSchema();

    if (Object.prototype.hasOwnProperty.call(req.body, 'nome_colaborador')) {
      return res.status(400).json({
        ok: false,
        erro: 'Campo nome_colaborador nao pode ser enviado nesta rota',
      });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'colaborador_id')) {
      return res.status(400).json({
        ok: false,
        erro: 'Campo colaborador_id nao pode ser alterado nesta rota',
      });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'id_recreador')) {
      return res.status(400).json({
        ok: false,
        erro: 'Campo id_recreador nao pode ser alterado nesta rota',
      });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'region_id')) {
      return res.status(400).json({
        ok: false,
        erro:
          'Use POST /equipe-perfis/:colaboradorId/mover-regiao com { "region_id": "..." } para alterar a regiao do perfil.',
      });
    }

    const updateFields = getProvidedFields(req.body, PERFIL_EQUIPE_UPDATE_FIELDS);
    if (!updateFields.length) {
      return res.status(400).json({ ok: false, erro: 'Nenhum campo para atualizar' });
    }

    const setClause = updateFields
      .map((field, index) => `${field} = $${index + 1}`)
      .join(', ');
    const values = updateFields.map((field) => normalizePerfilEquipeValue(field, req.body[field]));

    const result = await pool.query(
      `
      UPDATE colaborador_perfil_equipe
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE colaborador_id = $${values.length + 1}
      RETURNING *
    `,
      [...values, req.params.colaboradorId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Perfil da equipe nao encontrado' });
    }

    const enriched = await pool.query(
      `
      SELECT p.*, c.nome_colaborador, r.nome_regiao
      FROM colaborador_perfil_equipe p
      INNER JOIN colaboradores c ON c.id = p.colaborador_id
      LEFT JOIN regions r ON r.id = p.region_id
      WHERE p.colaborador_id = $1
    `,
      [req.params.colaboradorId]
    );

    res.json({ ok: true, dados: enriched.rows[0] || result.rows[0] });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({ ok: false, erro: 'Referencia invalida (ex.: region_id)' });
    }
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.post('/process-colaboradores-text', async (req, res) => {
  const text = req.body?.text;
  if (!text || !String(text).trim()) {
    return res.status(400).json({ ok: false, message: 'Texto nao enviado.' });
  }

  const itens = parseCadastroLines(text, 'nome_colaborador');
  res.json({ ok: true, data: { itens, texto: text } });
});

app.get('/servicos', async (req, res) => {
  try {
    await ensureServicosTable();

    const where = req.query.ativo !== undefined ? 'WHERE ativo = $1' : '';
    const params = req.query.ativo !== undefined ? [normalizeBooleanValue(req.query.ativo)] : [];
    const result = await pool.query(`
      SELECT *
      FROM servicos
      ${where}
      ORDER BY nome_servico ASC, created_at DESC
    `, params);

    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.post('/servicos', requirePermission(ACCESS_PERMISSIONS.SERVICOS_CREATE), async (req, res) => {
  try {
    await ensureServicosTable();

    const id = req.body.id || crypto.randomUUID();
    const nome = String(req.body.nome_servico || '').trim();
    if (!nome) {
      return res.status(400).json({ ok: false, erro: 'Nome do servico nao informado' });
    }

    const result = await pool.query(`
      INSERT INTO servicos (id, nome_servico, ativo)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [id, nome, normalizeBooleanValue(req.body.ativo ?? true)]);

    res.status(201).json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.put('/servicos/:id', requireMutationPermission({
  toggleField: 'ativo',
  togglePermission: ACCESS_PERMISSIONS.SERVICOS_TOGGLE,
  defaultPermission: ACCESS_PERMISSIONS.SERVICOS_EDIT,
}), async (req, res) => {
  try {
    await ensureServicosTable();

    const updateFields = getProvidedFields(req.body, SERVICO_FIELDS);
    if (!updateFields.length) {
      return res.status(400).json({ ok: false, erro: 'Nenhum campo para atualizar' });
    }

    const setClause = updateFields
      .map((field, index) => `${field} = $${index + 1}`)
      .join(', ');
    const values = updateFields.map((field) => normalizeCadastroBaseValue(field, req.body[field]));

    const result = await pool.query(`
      UPDATE servicos
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${values.length + 1}
      RETURNING *
    `, [...values, req.params.id]);

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Servico nao encontrado' });
    }

    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

const SERVICO_MATERIAL_REQUISITO_LIST_SQL = `
  SELECT
    smr.*,
    s.nome_servico,
    ic.nome_item,
    ic.categoria,
    ic.natureza_item
  FROM servico_material_requisito smr
  LEFT JOIN servicos s ON s.id = smr.servico_id
  LEFT JOIN item_catalog ic ON ic.id = smr.item_catalog_id
`;

app.get('/servico-material-requisitos', async (req, res) => {
  try {
    await ensureServicosTable();
    await ensureItemCatalogTable();
    await ensureServicoMaterialRequisitoTable();

    const whereParts = [];
    const params = [];
    if (req.query.ativo !== undefined) {
      params.push(normalizeBooleanValue(req.query.ativo));
      whereParts.push(`smr.ativo = $${params.length}`);
    }
    const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const result = await pool.query(
      `
      ${SERVICO_MATERIAL_REQUISITO_LIST_SQL}
      ${where}
      ORDER BY s.nome_servico ASC NULLS LAST, ic.nome_item ASC NULLS LAST, smr.created_at DESC
      `,
      params
    );

    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get('/servico-material-requisitos/:id', async (req, res) => {
  try {
    await ensureServicosTable();
    await ensureItemCatalogTable();
    await ensureServicoMaterialRequisitoTable();

    const result = await pool.query(
      `
      ${SERVICO_MATERIAL_REQUISITO_LIST_SQL}
      WHERE smr.id = $1
      `,
      [req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Regra nao encontrada' });
    }

    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.post('/servico-material-requisitos', async (req, res) => {
  try {
    await ensureServicosTable();
    await ensureItemCatalogTable();
    await ensureServicoMaterialRequisitoTable();

    const servicoId = String(req.body.servico_id ?? '').trim();
    const itemCatalogId = String(req.body.item_catalog_id ?? '').trim();
    if (!servicoId) {
      return res.status(400).json({ ok: false, erro: 'servico_id e obrigatorio' });
    }
    if (!itemCatalogId) {
      return res.status(400).json({ ok: false, erro: 'item_catalog_id e obrigatorio' });
    }

    const servOk = await pool.query(`SELECT id FROM servicos WHERE id = $1 LIMIT 1`, [servicoId]);
    if (!servOk.rowCount) {
      return res.status(400).json({ ok: false, erro: 'servico_id nao encontrado' });
    }
    const itemOk = await pool.query(`SELECT id FROM item_catalog WHERE id = $1 LIMIT 1`, [itemCatalogId]);
    if (!itemOk.rowCount) {
      return res.status(400).json({ ok: false, erro: 'item_catalog_id nao encontrado' });
    }

    let quantidadeMin = 1;
    try {
      const q = normalizeSmrQuantidadeMin(req.body.quantidade_min);
      quantidadeMin = q === null ? 1 : q;
    } catch (e) {
      return res.status(e.statusCode || 400).json({ ok: false, erro: e.message });
    }

    let obrigatorio = true;
    let ativo = true;
    try {
      if (Object.prototype.hasOwnProperty.call(req.body, 'obrigatorio')) {
        obrigatorio = assertSmrBoolean(req.body.obrigatorio, 'obrigatorio');
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'ativo')) {
        ativo = assertSmrBoolean(req.body.ativo, 'ativo');
      }
    } catch (e) {
      return res.status(e.statusCode || 400).json({ ok: false, erro: e.message });
    }

    const observacao = normalizeSmrObservacao(req.body.observacao);
    const id = req.body.id || crypto.randomUUID();

    await pool.query(
      `
      INSERT INTO servico_material_requisito (
        id, servico_id, item_catalog_id, quantidade_min, obrigatorio, observacao, ativo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [id, servicoId, itemCatalogId, quantidadeMin, obrigatorio, observacao, ativo]
    );

    const agg = await pool.query(
      `
      ${SERVICO_MATERIAL_REQUISITO_LIST_SQL}
      WHERE smr.id = $1
      `,
      [id]
    );

    res.status(201).json({ ok: true, dados: agg.rows[0] });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.put('/servico-material-requisitos/:id', async (req, res) => {
  try {
    await ensureServicosTable();
    await ensureItemCatalogTable();
    await ensureServicoMaterialRequisitoTable();

    const updateFields = getProvidedFields(req.body, SERVICO_MATERIAL_REQUISITO_UPDATE_FIELDS);
    if (!updateFields.length) {
      return res.status(400).json({ ok: false, erro: 'Nenhum campo para atualizar' });
    }

    const values = [];
    const setParts = [];
    let paramIndex = 1;

    for (const field of updateFields) {
      if (field === 'servico_id') {
        const sid = String(req.body.servico_id ?? '').trim();
        if (!sid) {
          return res.status(400).json({ ok: false, erro: 'servico_id invalido' });
        }
        const servOk = await pool.query(`SELECT id FROM servicos WHERE id = $1 LIMIT 1`, [sid]);
        if (!servOk.rowCount) {
          return res.status(400).json({ ok: false, erro: 'servico_id nao encontrado' });
        }
        setParts.push(`servico_id = $${paramIndex++}`);
        values.push(sid);
      } else if (field === 'item_catalog_id') {
        const iid = String(req.body.item_catalog_id ?? '').trim();
        if (!iid) {
          return res.status(400).json({ ok: false, erro: 'item_catalog_id invalido' });
        }
        const itemOk = await pool.query(`SELECT id FROM item_catalog WHERE id = $1 LIMIT 1`, [iid]);
        if (!itemOk.rowCount) {
          return res.status(400).json({ ok: false, erro: 'item_catalog_id nao encontrado' });
        }
        setParts.push(`item_catalog_id = $${paramIndex++}`);
        values.push(iid);
      } else if (field === 'quantidade_min') {
        let qm;
        try {
          qm = normalizeSmrQuantidadeMin(req.body.quantidade_min);
        } catch (e) {
          return res.status(e.statusCode || 400).json({ ok: false, erro: e.message });
        }
        if (qm === null) {
          return res.status(400).json({ ok: false, erro: 'quantidade_min deve ser informada (inteiro >= 0)' });
        }
        setParts.push(`quantidade_min = $${paramIndex++}`);
        values.push(qm);
      } else if (field === 'obrigatorio') {
        let v;
        try {
          v = assertSmrBoolean(req.body.obrigatorio, 'obrigatorio');
        } catch (e) {
          return res.status(e.statusCode || 400).json({ ok: false, erro: e.message });
        }
        setParts.push(`obrigatorio = $${paramIndex++}`);
        values.push(v);
      } else if (field === 'ativo') {
        let v;
        try {
          v = assertSmrBoolean(req.body.ativo, 'ativo');
        } catch (e) {
          return res.status(e.statusCode || 400).json({ ok: false, erro: e.message });
        }
        setParts.push(`ativo = $${paramIndex++}`);
        values.push(v);
      } else if (field === 'observacao') {
        setParts.push(`observacao = $${paramIndex++}`);
        values.push(normalizeSmrObservacao(req.body.observacao));
      }
    }

    const result = await pool.query(
      `
      UPDATE servico_material_requisito
      SET ${setParts.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING id
      `,
      [...values, req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Regra nao encontrada' });
    }

    const agg = await pool.query(
      `
      ${SERVICO_MATERIAL_REQUISITO_LIST_SQL}
      WHERE smr.id = $1
      `,
      [req.params.id]
    );

    res.json({ ok: true, dados: agg.rows[0] });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.delete('/servicos/:id', requirePermission(ACCESS_PERMISSIONS.SERVICOS_DELETE), async (req, res) => {
  try {
    await ensureServicosTable();

    const result = await pool.query(
      'DELETE FROM servicos WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Servico nao encontrado' });
    }

    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.post('/process-servicos-text', async (req, res) => {
  const text = req.body?.text;
  if (!text || !String(text).trim()) {
    return res.status(400).json({ ok: false, message: 'Texto nao enviado.' });
  }

  const itens = parseCadastroLines(text, 'nome_servico');
  res.json({ ok: true, data: { itens, texto: text } });
});

app.get('/textos-rapidos-contrato', requirePermission(ACCESS_PERMISSIONS.TEXTOS_RAPIDOS_VIEW), async (req, res) => {
  try {
    await ensureTextosRapidosContratoTable();
    const where = req.query.ativo !== undefined ? 'WHERE ativo = $1' : '';
    const params = req.query.ativo !== undefined ? [normalizeBooleanValue(req.query.ativo)] : [];
    const result = await pool.query(`
      SELECT *
      FROM textos_rapidos_contrato
      ${where}
      ORDER BY categoria ASC, ordem ASC, nome_botao ASC
    `, params);
    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.post('/textos-rapidos-contrato', requirePermission(ACCESS_PERMISSIONS.TEXTOS_RAPIDOS_MANAGE), async (req, res) => {
  try {
    await ensureTextosRapidosContratoTable();
    const id = req.body.id || crypto.randomUUID();
    const nomeBotao = String(req.body.nome_botao || '').trim();
    const categoria = String(req.body.categoria || '').trim();
    const texto = String(req.body.texto ?? '').trimEnd();
    if (!nomeBotao) {
      return res.status(400).json({ ok: false, erro: 'Nome do botao nao informado' });
    }
    if (!CATEGORIAS_TEXTO_RAPIDO_CONTRATO.includes(categoria)) {
      return res.status(400).json({ ok: false, erro: 'Categoria invalida' });
    }
    if (!texto) {
      return res.status(400).json({ ok: false, erro: 'Texto nao informado' });
    }
    const ordem = normalizeTextoRapidoContratoValue('ordem', req.body.ordem);
    const result = await pool.query(
      `INSERT INTO textos_rapidos_contrato (id, nome_botao, categoria, texto, ativo, ordem)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, nomeBotao, categoria, texto, normalizeBooleanValue(req.body.ativo ?? true), ordem],
    );
    res.status(201).json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

/** Importação em lote a partir do conteúdo de um .txt (parser linha a linha). */
app.post('/textos-rapidos-contrato/import-text', requirePermission(ACCESS_PERMISSIONS.TEXTOS_RAPIDOS_MANAGE), async (req, res) => {
  try {
    await ensureTextosRapidosContratoTable();
    const text = req.body?.text;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ ok: false, erro: 'Arquivo vazio ou texto nao enviado.' });
    }
    const { items, avisos } = parseTextosRapidosContratoImport(String(text));
    if (!items.length) {
      return res.status(400).json({
        ok: false,
        erro: 'Nenhum item valido encontrado. Confira o formato do arquivo.',
        avisos,
      });
    }
    const importados = [];
    const avisosInsert = [];
    for (const it of items) {
      try {
        const id = crypto.randomUUID();
        const result = await pool.query(
          `INSERT INTO textos_rapidos_contrato (id, nome_botao, categoria, texto, ativo, ordem)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [id, it.nome_botao, it.categoria, it.texto, true, it.ordem],
        );
        importados.push(result.rows[0]);
      } catch (err) {
        avisosInsert.push({
          tipo: 'insert',
          mensagem: `Nao foi possivel salvar "${it.nome_botao}": ${err.message}`,
          botao: it.nome_botao,
        });
      }
    }
    if (!importados.length) {
      return res.status(400).json({
        ok: false,
        erro: 'Nenhum registro foi gravado no banco.',
        avisos: [...avisos, ...avisosInsert],
      });
    }
    res.status(201).json({
      ok: true,
      dados: {
        importados,
        avisos: [...avisos, ...avisosInsert],
        total: importados.length,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.put('/textos-rapidos-contrato/:id', requirePermission(ACCESS_PERMISSIONS.TEXTOS_RAPIDOS_MANAGE), async (req, res) => {
  try {
    await ensureTextosRapidosContratoTable();
    const updateFields = getProvidedFields(req.body, TEXTOS_RAPIDOS_CONTRATO_FIELDS);
    if (!updateFields.length) {
      return res.status(400).json({ ok: false, erro: 'Nenhum campo para atualizar' });
    }
    if (updateFields.includes('categoria')) {
      const cat = String(req.body.categoria || '').trim();
      if (!CATEGORIAS_TEXTO_RAPIDO_CONTRATO.includes(cat)) {
        return res.status(400).json({ ok: false, erro: 'Categoria invalida' });
      }
    }
    const setClause = updateFields
      .map((field, index) => `${field} = $${index + 1}`)
      .join(', ');
    const values = updateFields.map((field) => normalizeTextoRapidoContratoValue(field, req.body[field]));
    const result = await pool.query(
      `UPDATE textos_rapidos_contrato
       SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${values.length + 1}
       RETURNING *`,
      [...values, req.params.id],
    );
    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Registro nao encontrado' });
    }
    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.delete('/textos-rapidos-contrato/:id', requirePermission(ACCESS_PERMISSIONS.TEXTOS_RAPIDOS_DELETE), async (req, res) => {
  try {
    await ensureTextosRapidosContratoTable();
    const result = await pool.query(
      'DELETE FROM textos_rapidos_contrato WHERE id = $1 RETURNING *',
      [req.params.id],
    );
    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Registro nao encontrado' });
    }
    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get('/escalas-evento', async (req, res) => {
  try {
    await ensureEscalaEventosTable();

    const result = await pool.query(`
      SELECT *
      FROM escala_eventos
      ORDER BY created_at ASC, colaborador_nome ASC
    `);

    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get('/eventos/:id/escalas', async (req, res) => {
  try {
    await ensureEscalaEventosTable();

    const result = await pool.query(`
      SELECT *
      FROM escala_eventos
      WHERE evento_id = $1
      ORDER BY created_at ASC, colaborador_nome ASC
    `, [req.params.id]);

    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.post('/eventos/:id/escalas', async (req, res) => {
  try {
    await ensureEscalaEventosTable();
    await ensureColaboradoresTable();

    const id = req.body.id || crypto.randomUUID();
    if (Object.prototype.hasOwnProperty.call(req.body, 'colaborador_nome')) {
      return res.status(400).json({
        ok: false,
        erro: 'Campo colaborador_nome e definido automaticamente pelo cadastro de colaboradores.',
      });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'id_recreador')) {
      return res.status(400).json({
        ok: false,
        erro: 'Campo id_recreador e definido automaticamente pelo cadastro de colaboradores.',
      });
    }

    const colaboradorId = String(req.body.colaborador_id || '').trim();
    if (!colaboradorId) {
      return res.status(400).json({ ok: false, erro: 'colaborador_id e obrigatorio' });
    }

    const colab = await pool.query(
      'SELECT id, nome_colaborador, id_recreador FROM colaboradores WHERE id = $1',
      [colaboradorId]
    );
    if (!colab.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Colaborador nao encontrado' });
    }
    const colaboradorNome = String(colab.rows[0].nome_colaborador || '').trim();
    const idRecreador =
      colab.rows[0].id_recreador != null && String(colab.rows[0].id_recreador).trim() !== ''
        ? String(colab.rows[0].id_recreador).trim()
        : null;
    const valorRecreador = normalizeEscalaEventoValue('valor_recreador', req.body.valor_recreador);

    const result = await pool.query(`
      INSERT INTO escala_eventos (
        id,
        evento_id,
        colaborador_id,
        colaborador_nome,
        id_recreador,
        valor_recreador,
        funcao,
        status_pagamento,
        status_aceite,
        observacao_escala
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      id,
      req.params.id,
      colaboradorId,
      colaboradorNome,
      idRecreador,
      valorRecreador,
      req.body.funcao || 'Recreador',
      req.body.status_pagamento || 'Pendente',
      req.body.status_aceite || 'Pendente',
      normalizeEscalaEventoValue('observacao_escala', req.body.observacao_escala)
    ]);

    await syncEventoPagamentoColaboradorFromEscalaSum(pool, req.params.id);

    res.status(201).json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.put('/escalas-evento/:id', async (req, res) => {
  try {
    await ensureEscalaEventosTable();
    await ensureColaboradoresTable();

    const existingEscala = await pool.query(
      `
      SELECT id, evento_id, colaborador_id, colaborador_nome, status_aceite
      FROM escala_eventos
      WHERE id = $1
      `,
      [req.params.id]
    );
    if (!existingEscala.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Escala nao encontrada' });
    }
    const escalaAnterior = existingEscala.rows[0];
    const eventoIdAnterior = escalaAnterior.evento_id;

    if (
      Object.prototype.hasOwnProperty.call(req.body, 'colaborador_nome') ||
      Object.prototype.hasOwnProperty.call(req.body, 'id_recreador')
    ) {
      return res.status(400).json({
        ok: false,
        erro:
          'Campos colaborador_nome e id_recreador sao sincronizados automaticamente a partir do colaborador.',
      });
    }

    const updateFields = getProvidedFields(req.body, ESCALA_EVENTO_FIELDS);
    if (!updateFields.length) {
      return res.status(400).json({ ok: false, erro: 'Nenhum campo para atualizar' });
    }

    let colaboradorNomeSync = null;
    let idRecreadorSync = null;
    let colaboradorIdSync = null;
    if (updateFields.includes('colaborador_id')) {
      colaboradorIdSync = String(req.body.colaborador_id || '').trim();
      if (!colaboradorIdSync) {
        return res.status(400).json({ ok: false, erro: 'colaborador_id invalido' });
      }
      const colab = await pool.query(
        'SELECT id, nome_colaborador, id_recreador FROM colaboradores WHERE id = $1',
        [colaboradorIdSync]
      );
      if (!colab.rowCount) {
        return res.status(404).json({ ok: false, erro: 'Colaborador nao encontrado' });
      }
      colaboradorNomeSync = String(colab.rows[0].nome_colaborador || '').trim();
      idRecreadorSync =
        colab.rows[0].id_recreador != null && String(colab.rows[0].id_recreador).trim() !== ''
          ? String(colab.rows[0].id_recreador).trim()
          : null;
    }

    const setFields = [];
    const values = [];
    for (const field of updateFields) {
      setFields.push(`${field} = $${values.length + 1}`);
      const nextValue = field === 'colaborador_id'
        ? colaboradorIdSync
        : normalizeEscalaEventoValue(field, req.body[field]);
      values.push(nextValue);
    }
    if (updateFields.includes('colaborador_id')) {
      setFields.push(`colaborador_nome = $${values.length + 1}`);
      values.push(colaboradorNomeSync);
      setFields.push(`id_recreador = $${values.length + 1}`);
      values.push(idRecreadorSync);
    }
    const setClause = setFields.join(', ');

    const result = await pool.query(`
      UPDATE escala_eventos
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${values.length + 1}
      RETURNING *
    `, [...values, req.params.id]);

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Escala nao encontrada' });
    }

    const eventoIdAtual = result.rows[0].evento_id;
    await syncEventoPagamentoColaboradorFromEscalaSum(pool, eventoIdAtual);
    if (String(eventoIdAnterior || '') !== String(eventoIdAtual || '')) {
      await syncEventoPagamentoColaboradorFromEscalaSum(pool, eventoIdAnterior);
    }

    const statusAnterior = String(escalaAnterior?.status_aceite || '').trim();
    const statusNovo = String(result.rows[0]?.status_aceite || '').trim();
    const mudouParaConfirmado = statusAnterior !== 'Confirmado' && statusNovo === 'Confirmado';

    if (mudouParaConfirmado) {
      try {
        const eventoId = String(result.rows[0]?.evento_id || '').trim();
        const colaboradorId = String(result.rows[0]?.colaborador_id || '').trim();
        const nomeEscala = String(result.rows[0]?.colaborador_nome || '').trim();

        const [eventoResult, perfilResult, equipeResult] = await Promise.all([
          pool.query('SELECT * FROM eventos WHERE id = $1 LIMIT 1', [eventoId]),
          pool.query(
            `
            SELECT nome_completo, email
            FROM colaborador_perfil_equipe
            WHERE colaborador_id = $1
            LIMIT 1
            `,
            [colaboradorId]
          ),
          pool.query(
            `
            SELECT colaborador_nome
            FROM escala_eventos
            WHERE evento_id = $1
            ORDER BY created_at ASC, colaborador_nome ASC
            `,
            [eventoId]
          ),
        ]);

        const evento = eventoResult.rows[0] || null;
        const perfil = perfilResult.rows[0] || null;
        const email = String(perfil?.email || '').trim();
        const nomeCompletoPerfil = String(perfil?.nome_completo || '').trim();
        const recreadorNome = nomeCompletoPerfil || nomeEscala || 'Recreador';
        const nomesEquipe = equipeResult.rows
          .map((row) => String(row?.colaborador_nome || '').trim())
          .filter(Boolean);

        if (!email) {
          console.info(
            `[escala-email] envio ignorado por ausência de e-mail (escala_id=${req.params.id}, colaborador_id=${colaboradorId})`
          );
        } else if (!evento) {
          console.error(
            `[escala-email] envio não realizado: evento não encontrado (escala_id=${req.params.id}, evento_id=${eventoId})`
          );
        } else {
          const template = buildEscalaConfirmacaoEmail({
            evento,
            recreadorNome,
            nomesEquipe,
          });

          let attachments;
          try {
            const icsResult = tryBuildEscalaCalendarInvite({
              evento,
              recreadorNome,
              recreadorEmail: email,
              nomesEquipe,
              escalaId: req.params.id,
              colaboradorId,
            });
            if (icsResult.ok) {
              attachments = [icsResult.attachment];
              console.info(
                `[escala-ics] convite anexado (escala_id=${req.params.id}, evento_id=${eventoId}, colaborador_id=${colaboradorId})`
              );
            } else {
              console.info(
                `[escala-ics] convite omitido: motivo=${icsResult.reason} (escala_id=${req.params.id}, evento_id=${eventoId})`
              );
            }
          } catch (icsErr) {
            console.error(
              `[escala-ics] convite omitido: motivo=erro_inesperado (escala_id=${req.params.id}, evento_id=${eventoId})`,
              icsErr
            );
          }

          const mailResult = await sendMail({
            to: email,
            subject: template.subject,
            text: template.text,
            ...(attachments?.length ? { attachments } : {}),
          });

          if (mailResult.ok && !mailResult.skipped) {
            console.info(
              `[escala-email] e-mail enviado com sucesso (escala_id=${req.params.id}, para=${email}, message_id=${mailResult.messageId || '-'})`
            );
          } else if (mailResult.skipped && mailResult.reason === 'email_disabled') {
            console.info(
              `[escala-email] envio ignorado por EMAIL_ENABLED false (escala_id=${req.params.id}, para=${email})`
            );
          } else if (!mailResult.ok && mailResult.reason === 'smtp_error') {
            console.error(
              `[escala-email] erro SMTP ao enviar confirmação (escala_id=${req.params.id}, para=${email})`,
              mailResult.error
            );
          } else {
            console.error(
              `[escala-email] envio não concluído (escala_id=${req.params.id}, para=${email}, reason=${mailResult.reason || 'unknown'})`
            );
          }
        }
      } catch (emailError) {
        console.error(
          `[escala-email] erro inesperado no fluxo de confirmação por e-mail (escala_id=${req.params.id})`,
          emailError
        );
      }
    }

    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.delete('/escalas-evento/:id', async (req, res) => {
  try {
    await ensureEscalaEventosTable();
    await ensurePagamentosEscalaColaboradorTable();

    const pagamentosRelacionados = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM pagamentos_escala_colaborador
      WHERE escala_evento_id = $1
      `,
      [req.params.id]
    );
    const totalRelacionados = Number(pagamentosRelacionados.rows[0]?.total || 0);
    if (totalRelacionados > 0) {
      return res.status(409).json({
        ok: false,
        erro: 'Esta escala possui adiantamentos/pagamentos registrados. Cancele ou revise o historico antes de excluir a escala.',
      });
    }

    const result = await pool.query(
      'DELETE FROM escala_eventos WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Escala nao encontrada' });
    }

    const eventoId = result.rows[0].evento_id;
    if (eventoId) {
      await syncEventoPagamentoColaboradorFromEscalaSum(pool, eventoId);
    }

    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.get('/servicos-evento', async (req, res) => {
  try {
    await ensureServicoEventosTable();

    const result = await pool.query(`
      SELECT *
      FROM servico_eventos
      ORDER BY created_at ASC, servico_nome ASC
    `);

    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get('/eventos/:id/servicos', async (req, res) => {
  try {
    await ensureServicoEventosTable();

    const result = await pool.query(`
      SELECT *
      FROM servico_eventos
      WHERE evento_id = $1
      ORDER BY created_at ASC, servico_nome ASC
    `, [req.params.id]);

    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

/**
 * Materiais operacionais exigidos pelos servicos adicionais do evento (regra servico -> material).
 * Fontes unificadas (sem duplicar materiais no resultado):
 * - servico_eventos: prioriza servico_id; se ausente, resolve por servico_nome em servicos ativos
 *   (mais recente em created_at em caso de homonimos).
 * - eventos.servicos_adicionais: texto com nomes (separados por virgula, ponto-e-virgula ou quebra de linha);
 *   cada token e casado com servicos.nome_servico (mesma regra de homonimos).
 */
async function fetchEventoItensRequeridosAgg(pool, eventoId) {
  await ensureServicosTable();
  await ensureServicoEventosTable();
  await ensureServicoMaterialRequisitoTable();
  return pool.query(
    `
    WITH evento_servicos AS (
      SELECT
        se.servico_id,
        se.servico_nome,
        GREATEST(COALESCE(se.quantidade, 1), 1)::int AS quantidade_servico
      FROM servico_eventos se
      WHERE se.evento_id = $1
    ),
    resolvido_se AS (
      SELECT
        COALESCE(
        NULLIF(BTRIM(es.servico_id), ''),
        (
          SELECT s.id
          FROM servicos s
          WHERE es.servico_nome IS NOT NULL
            AND BTRIM(es.servico_nome) <> ''
            AND LOWER(BTRIM(s.nome_servico)) = LOWER(BTRIM(es.servico_nome))
            AND COALESCE(s.ativo, TRUE) = TRUE
          ORDER BY s.created_at DESC NULLS LAST, s.id ASC
          LIMIT 1
        )
      ) AS servico_id_final,
        GREATEST(COALESCE(es.quantidade_servico, 1), 1)::int AS quantidade_servico
      FROM evento_servicos es
    ),
    servico_eventos_agregado AS (
      SELECT
        rse.servico_id_final,
        SUM(GREATEST(COALESCE(rse.quantidade_servico, 1), 1))::int AS quantidade_servico
      FROM resolvido_se rse
      WHERE rse.servico_id_final IS NOT NULL
      GROUP BY rse.servico_id_final
    ),
    evento_adicionais_nomes AS (
      SELECT DISTINCT NULLIF(BTRIM(u.token), '') AS nome_servico_extra
      FROM eventos e,
      LATERAL unnest(
        string_to_array(
          regexp_replace(COALESCE(e.servicos_adicionais, ''), E'[\r\n;]+', ',', 'g'),
          ','
        )
      ) AS u(token)
      WHERE e.id = $1
    ),
    resolvido_adicionais AS (
      SELECT DISTINCT ON (LOWER(BTRIM(ea.nome_servico_extra)))
        s.id AS servico_id_final
      FROM evento_adicionais_nomes ea
      INNER JOIN servicos s
        ON LOWER(BTRIM(s.nome_servico)) = LOWER(BTRIM(ea.nome_servico_extra))
        AND COALESCE(s.ativo, TRUE) = TRUE
      ORDER BY LOWER(BTRIM(ea.nome_servico_extra)), s.created_at DESC NULLS LAST, s.id ASC
    ),
    chaves AS (
      SELECT sea.servico_id_final, sea.quantidade_servico
      FROM servico_eventos_agregado sea
      UNION ALL
      SELECT ra.servico_id_final, 1::int AS quantidade_servico
      FROM resolvido_adicionais ra
      WHERE NOT EXISTS (SELECT 1 FROM servico_eventos_agregado)
    )
    SELECT
      ic.id AS item_catalog_id,
      ic.nome_item,
      ic.categoria,
      ic.natureza_item,
      SUM(
        GREATEST(COALESCE(smr.quantidade_min, 1), 0) *
        GREATEST(COALESCE(c.quantidade_servico, 1), 1)
      )::int AS quantidade_min,
      BOOL_OR(COALESCE(smr.obrigatorio, TRUE)) AS obrigatorio,
      MAX(NULLIF(BTRIM(smr.observacao), '')) AS observacao
    FROM servico_material_requisito smr
    INNER JOIN chaves c ON c.servico_id_final = smr.servico_id
    INNER JOIN item_catalog ic ON ic.id = smr.item_catalog_id
    WHERE COALESCE(smr.ativo, TRUE) = TRUE
    GROUP BY ic.id, ic.nome_item, ic.categoria, ic.natureza_item
    ORDER BY ic.nome_item ASC NULLS LAST, ic.id ASC
    `,
    [eventoId]
  );
}

app.get('/eventos/:id/materiais-operacionais', async (req, res) => {
  try {
    const eventoCheck = await pool.query(`SELECT id FROM eventos WHERE id = $1 LIMIT 1`, [req.params.id]);
    if (!eventoCheck.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Evento nao encontrado' });
    }

    const agg = await fetchEventoItensRequeridosAgg(pool, req.params.id);

    const itens_requeridos = agg.rows.map((row) => ({
      item_catalog_id: row.item_catalog_id,
      nome_item: row.nome_item,
      categoria: row.categoria,
      natureza_item: row.natureza_item,
      quantidade_min: Number(row.quantidade_min) || 0,
      obrigatorio: Boolean(row.obrigatorio),
      observacao: row.observacao || null
    }));

    res.json({
      ok: true,
      dados: {
        evento_id: req.params.id,
        exige_envio_material: itens_requeridos.length > 0,
        itens_requeridos
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get('/eventos/:id/materiais-operacionais/posse-equipe', async (req, res) => {
  try {
    await ensureEscalaEventosTable();
    await ensureColaboradoresTable();
    await ensureColaboradorItemCatalogTable();

    const eventoCheck = await pool.query(`SELECT id FROM eventos WHERE id = $1 LIMIT 1`, [req.params.id]);
    if (!eventoCheck.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Evento nao encontrado' });
    }

    const agg = await fetchEventoItensRequeridosAgg(pool, req.params.id);

    const itens_requeridos = agg.rows.map((row) => ({
      item_catalog_id: row.item_catalog_id,
      nome_item: row.nome_item,
      categoria: row.categoria,
      natureza_item: row.natureza_item,
      quantidade_min: Number(row.quantidade_min) || 0,
      obrigatorio: Boolean(row.obrigatorio),
      observacao: row.observacao || null
    }));

    const posseEquipe = await pool.query(
      `
      WITH equipe_escalada AS (
        SELECT DISTINCT ON (ee.colaborador_id)
          ee.colaborador_id,
          COALESCE(
            NULLIF(BTRIM(ee.colaborador_nome), ''),
            NULLIF(BTRIM(c.nome_colaborador), ''),
            ee.colaborador_id
          ) AS colaborador_nome
        FROM escala_eventos ee
        LEFT JOIN colaboradores c ON c.id = ee.colaborador_id
        WHERE ee.evento_id = $1
          AND ee.colaborador_id IS NOT NULL
          AND BTRIM(ee.colaborador_id) <> ''
        ORDER BY ee.colaborador_id, ee.created_at DESC NULLS LAST, ee.id DESC
      )
      SELECT
        eq.colaborador_id,
        eq.colaborador_nome,
        cic.item_catalog_id,
        SUM(GREATEST(COALESCE(cic.quantidade, 0), 0))::int AS quantidade_em_posse
      FROM equipe_escalada eq
      INNER JOIN colaborador_item_catalog cic ON cic.colaborador_id = eq.colaborador_id
      WHERE cic.status_item = 'Em posse'
      GROUP BY eq.colaborador_id, eq.colaborador_nome, cic.item_catalog_id
      HAVING SUM(GREATEST(COALESCE(cic.quantidade, 0), 0)) > 0
      ORDER BY cic.item_catalog_id ASC, eq.colaborador_nome ASC
      `,
      [req.params.id]
    );

    const possePorItem = new Map();
    for (const row of posseEquipe.rows) {
      const itemId = row.item_catalog_id;
      if (!itemId) continue;
      const entrada = {
        colaborador_id: row.colaborador_id,
        colaborador_nome: row.colaborador_nome,
        quantidade_em_posse: Number(row.quantidade_em_posse) || 0,
      };
      if (!possePorItem.has(itemId)) {
        possePorItem.set(itemId, []);
      }
      possePorItem.get(itemId).push(entrada);
    }

    const distribuicao_por_item = itens_requeridos.map((item) => {
      const recreadoresComPosse = possePorItem.get(item.item_catalog_id) || [];
      const totalEmPosse = recreadoresComPosse.reduce(
        (acc, curr) => acc + (Number(curr.quantidade_em_posse) || 0),
        0
      );
      const ninguemTem = totalEmPosse <= 0;
      const quantidadeExigida = Number(item.quantidade_min) || 0;
      const coberturaSuficiente = totalEmPosse >= quantidadeExigida;
      const quantidadeFaltante = Math.max(quantidadeExigida - totalEmPosse, 0);
      const posseParcial = !ninguemTem && !coberturaSuficiente && quantidadeFaltante > 0;
      return {
        item_catalog_id: item.item_catalog_id,
        nome_item: item.nome_item,
        categoria: item.categoria,
        natureza_item: item.natureza_item,
        quantidade_min: item.quantidade_min,
        quantidade_exigida: quantidadeExigida,
        recreadores_com_posse: recreadoresComPosse,
        total_em_posse: totalEmPosse,
        cobertura_suficiente: coberturaSuficiente,
        quantidade_faltante: quantidadeFaltante,
        ninguem_tem: ninguemTem,
        lembrete_envio_material: ninguemTem
          ? `Nenhum recreador escalado possui "${item.nome_item}" em posse. Envie este material para a equipe.`
          : null,
        lembrete_envio_complementar: posseParcial
          ? `Cobertura parcial: a equipe possui ${totalEmPosse} de ${quantidadeExigida} unidade(s) exigida(s) de "${item.nome_item}". Envie mais ${quantidadeFaltante} unidade(s) para completar.`
          : null,
      };
    });

    res.json({
      ok: true,
      dados: {
        evento_id: req.params.id,
        itens_requeridos,
        distribuicao_por_item
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

/**
 * Lista candidatos à devolução assistida no contexto do evento: mesma base de equipe/posse
 * que GET .../materiais-operacionais/posse-equipe; status_item = 'Em posse' no SQL;
 * natureza Retornável filtrada em JS (NFD) para tolerar grafias/acentos no catálogo.
 * A devolução em si continua em POST /equipe-perfis/:colaboradorId/itens/:itemVinculoId/devolver.
 */
app.get('/eventos/:id/materiais-devolucao-assistida', async (req, res) => {
  try {
    await ensureEscalaEventosTable();
    await ensureGestaoEquipeSchema();

    const eventoCheck = await pool.query(`SELECT id FROM eventos WHERE id = $1 LIMIT 1`, [req.params.id]);
    if (!eventoCheck.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Evento nao encontrado' });
    }

    const result = await pool.query(
      `
      WITH equipe_escalada AS (
        SELECT DISTINCT ON (ee.colaborador_id)
          ee.colaborador_id,
          COALESCE(
            NULLIF(BTRIM(ee.colaborador_nome), ''),
            NULLIF(BTRIM(c.nome_colaborador), ''),
            ee.colaborador_id
          ) AS colaborador_nome
        FROM escala_eventos ee
        LEFT JOIN colaboradores c ON c.id = ee.colaborador_id
        WHERE ee.evento_id = $1
          AND ee.colaborador_id IS NOT NULL
          AND BTRIM(ee.colaborador_id) <> ''
        ORDER BY ee.colaborador_id, ee.created_at DESC NULLS LAST, ee.id DESC
      )
      SELECT
        cic.id AS item_vinculo_id,
        eq.colaborador_id,
        eq.colaborador_nome,
        cic.item_catalog_id,
        ic.nome_item,
        ic.categoria,
        ic.natureza_item,
        GREATEST(COALESCE(cic.quantidade, 0), 0)::int AS quantidade_em_posse,
        cic.status_item
      FROM equipe_escalada eq
      INNER JOIN colaborador_item_catalog cic ON cic.colaborador_id = eq.colaborador_id
      INNER JOIN item_catalog ic ON ic.id = cic.item_catalog_id
      WHERE cic.status_item = 'Em posse'
      ORDER BY eq.colaborador_nome ASC NULLS LAST, ic.nome_item ASC NULLS LAST, cic.id ASC
      `,
      [req.params.id]
    );

    const candidatos = result.rows.filter((row) => isNaturezaRetornavelCatalog(row.natureza_item)).map((row) => ({
      colaborador_id: row.colaborador_id,
      colaborador_nome: row.colaborador_nome,
      item_vinculo_id: row.item_vinculo_id,
      item_catalog_id: row.item_catalog_id,
      nome_item: row.nome_item,
      categoria: row.categoria,
      natureza_item: row.natureza_item,
      quantidade_em_posse: Number(row.quantidade_em_posse) || 0,
      status_item: row.status_item,
    }));

    res.json({
      ok: true,
      dados: {
        evento_id: req.params.id,
        candidatos,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

/**
 * Lista candidatos ao consumo assistido no evento: Consumivel, Em posse, escalados
 * (mesma base SQL que materiais-devolucao-assistida). Opcional: exigencia do evento
 * e totais da equipe por item_catalog_id via fetchEventoItensRequeridosAgg.
 * Registro: POST /equipe-perfis/:colaboradorId/itens/:itemVinculoId/consumir
 */
app.get('/eventos/:id/materiais-consumo-assistido', async (req, res) => {
  try {
    await ensureEscalaEventosTable();
    await ensureGestaoEquipeSchema();

    const eventoCheck = await pool.query(`SELECT id FROM eventos WHERE id = $1 LIMIT 1`, [req.params.id]);
    if (!eventoCheck.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Evento nao encontrado' });
    }

    const aggEx = await fetchEventoItensRequeridosAgg(pool, req.params.id);
    const exigPorItem = new Map();
    for (const r of aggEx.rows) {
      exigPorItem.set(r.item_catalog_id, Number(r.quantidade_min) || 0);
    }

    const result = await pool.query(
      `
      WITH equipe_escalada AS (
        SELECT DISTINCT ON (ee.colaborador_id)
          ee.colaborador_id,
          COALESCE(
            NULLIF(BTRIM(ee.colaborador_nome), ''),
            NULLIF(BTRIM(c.nome_colaborador), ''),
            ee.colaborador_id
          ) AS colaborador_nome
        FROM escala_eventos ee
        LEFT JOIN colaboradores c ON c.id = ee.colaborador_id
        WHERE ee.evento_id = $1
          AND ee.colaborador_id IS NOT NULL
          AND BTRIM(ee.colaborador_id) <> ''
        ORDER BY ee.colaborador_id, ee.created_at DESC NULLS LAST, ee.id DESC
      )
      SELECT
        cic.id AS item_vinculo_id,
        eq.colaborador_id,
        eq.colaborador_nome,
        cic.item_catalog_id,
        ic.nome_item,
        ic.categoria,
        ic.natureza_item,
        GREATEST(COALESCE(cic.quantidade, 0), 0)::int AS quantidade_em_posse,
        cic.status_item
      FROM equipe_escalada eq
      INNER JOIN colaborador_item_catalog cic ON cic.colaborador_id = eq.colaborador_id
      INNER JOIN item_catalog ic ON ic.id = cic.item_catalog_id
      WHERE cic.status_item = 'Em posse'
      ORDER BY eq.colaborador_nome ASC NULLS LAST, ic.nome_item ASC NULLS LAST, cic.id ASC
      `,
      [req.params.id]
    );

    const consumivelRows = result.rows.filter((row) => isNaturezaConsumivelCatalog(row.natureza_item));

    const totalPosseEquipePorItem = new Map();
    for (const row of consumivelRows) {
      const k = row.item_catalog_id;
      const q = Number(row.quantidade_em_posse) || 0;
      totalPosseEquipePorItem.set(k, (totalPosseEquipePorItem.get(k) || 0) + q);
    }

    const candidatos = consumivelRows.map((row) => {
      const itemId = row.item_catalog_id;
      const quantidadeExigidaEvento = exigPorItem.has(itemId) ? exigPorItem.get(itemId) : 0;
      const totalEmPosseEquipe = totalPosseEquipePorItem.get(itemId) || 0;
      const coberturaSuficienteEquipe =
        quantidadeExigidaEvento <= 0 ? true : totalEmPosseEquipe >= quantidadeExigidaEvento;
      const quantidadeFaltanteEquipe =
        quantidadeExigidaEvento <= 0 ? 0 : Math.max(quantidadeExigidaEvento - totalEmPosseEquipe, 0);

      return {
        colaborador_id: row.colaborador_id,
        colaborador_nome: row.colaborador_nome,
        item_vinculo_id: row.item_vinculo_id,
        item_catalog_id: row.item_catalog_id,
        nome_item: row.nome_item,
        categoria: row.categoria,
        natureza_item: row.natureza_item,
        quantidade_em_posse: Number(row.quantidade_em_posse) || 0,
        status_item: row.status_item,
        quantidade_exigida_evento: quantidadeExigidaEvento,
        total_em_posse_equipe: totalEmPosseEquipe,
        cobertura_suficiente_equipe: coberturaSuficienteEquipe,
        quantidade_faltante_equipe: quantidadeFaltanteEquipe,
      };
    });

    res.json({
      ok: true,
      dados: {
        evento_id: req.params.id,
        candidatos,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.post('/eventos/:id/servicos', async (req, res) => {
  try {
    await ensureServicoEventosTable();

    const id = req.body.id || crypto.randomUUID();
    const servicoNome = String(req.body.servico_nome || req.body.nome_servico || '').trim();
    if (!servicoNome) {
      return res.status(400).json({ ok: false, erro: 'Nome do servico nao informado' });
    }

    const result = await pool.query(`
      INSERT INTO servico_eventos (
        id,
        evento_id,
        servico_id,
        servico_nome,
        status_aceite,
        valor,
        quantidade
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      id,
      req.params.id,
      req.body.servico_id || null,
      servicoNome,
      req.body.status_aceite || 'Pendente',
      normalizeServicoEventoValue('valor', req.body.valor ?? null),
      normalizeServicoEventoValue('quantidade', req.body.quantidade ?? null) ?? 1
    ]);

    res.status(201).json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.put('/servicos-evento/:id', async (req, res) => {
  try {
    await ensureServicoEventosTable();

    const updateFields = getProvidedFields(req.body, SERVICO_EVENTO_FIELDS);
    if (!updateFields.length) {
      return res.status(400).json({ ok: false, erro: 'Nenhum campo para atualizar' });
    }

    const normalizedFields = updateFields.map((field) => field === 'nome_servico' ? 'servico_nome' : field);
    const setClause = normalizedFields
      .map((field, index) => `${field} = $${index + 1}`)
      .join(', ');
    const values = updateFields.map((field) => normalizeServicoEventoValue(field, req.body[field]));

    const result = await pool.query(`
      UPDATE servico_eventos
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${values.length + 1}
      RETURNING *
    `, [...values, req.params.id]);

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Servico do evento nao encontrado' });
    }

    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.delete('/servicos-evento/:id', async (req, res) => {
  try {
    await ensureServicoEventosTable();

    const result = await pool.query(
      'DELETE FROM servico_eventos WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Servico do evento nao encontrado' });
    }

    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get('/eventos/:id/logs', async (req, res) => {
  try {
    await ensureEventoLogsTable();

    const result = await pool.query(`
      SELECT *
      FROM evento_logs
      WHERE evento_id = $1
      ORDER BY created_date DESC, created_at DESC
    `, [req.params.id]);

    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.post('/eventos/:id/logs', async (req, res) => {
  try {
    await ensureEventoLogsTable();

    const descricao = String(req.body.descricao || '').trim();
    if (!descricao) {
      return res.status(400).json({ ok: false, erro: 'Descricao do log nao informada' });
    }

    const id = req.body.id || crypto.randomUUID();
    const autor = req.body.autor || req.body.created_by || null;
    const metadata = EVENTO_LOG_JSON_FIELDS.includes('metadata')
      ? normalizeJsonValue(req.body.metadata ?? null, 'metadata')
      : null;

    const result = await pool.query(`
      INSERT INTO evento_logs (
        id,
        evento_id,
        tipo,
        descricao,
        autor,
        created_by,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      id,
      req.params.id,
      req.body.tipo || 'manual',
      descricao,
      autor,
      autor,
      metadata
    ]);

    res.status(201).json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.get('/orcamentos', async (req, res) => {
  try {
    await ensureOrcamentosTable();

    const result = await pool.query(`
      SELECT *
      FROM orcamentos
      ORDER BY created_at DESC
    `);

    res.json({ ok: true, dados: result.rows.map(formatOrcamento) });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.post('/orcamentos', async (req, res) => {
  try {
    await ensureOrcamentosTable();

    const body = normalizeOrcamentoBody(req.body);
    const id = body.id || crypto.randomUUID();
    const dados = buildOrcamentoDados({ ...body, id });

    const result = await pool.query(`
      INSERT INTO orcamentos (
        id,
        nome_cliente,
        local,
        data_evento,
        horario_inicio,
        servico_contratado,
        descricao,
        observacoes,
        itens_valores,
        valor_total,
        entrada,
        saldo,
        status,
        texto_original,
        dados
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      id,
      getOrcamentoCliente(body),
      body.local || null,
      body.data_evento || null,
      body.horario_inicio || null,
      body.servico_contratado || null,
      body.descricao || null,
      body.observacoes || null,
      normalizeOrcamentoValue('itens_valores', body.itens_valores),
      normalizeOrcamentoValue('valor_total', body.valor_total),
      normalizeOrcamentoValue('entrada', body.entrada),
      normalizeOrcamentoValue('saldo', body.saldo),
      body.status || 'Em aberto',
      body.texto_original || null,
      dados
    ]);

    res.json({ ok: true, dados: formatOrcamento(result.rows[0]) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.put('/orcamentos/:id', async (req, res) => {
  try {
    await ensureOrcamentosTable();

    const existing = await pool.query(
      'SELECT * FROM orcamentos WHERE id = $1',
      [req.params.id]
    );

    if (!existing.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Orcamento nao encontrado' });
    }

    const current = formatOrcamento(existing.rows[0]);
    const body = normalizeOrcamentoBody(req.body);
    const merged = { ...current, ...body, id: req.params.id };

    const result = await pool.query(`
      UPDATE orcamentos
      SET
        nome_cliente = $1,
        local = $2,
        data_evento = $3,
        horario_inicio = $4,
        servico_contratado = $5,
        descricao = $6,
        observacoes = $7,
        itens_valores = $8,
        valor_total = $9,
        entrada = $10,
        saldo = $11,
        status = $12,
        texto_original = $13,
        dados = $14,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $15
      RETURNING *
    `, [
      getOrcamentoCliente(merged),
      merged.local || null,
      merged.data_evento || null,
      merged.horario_inicio || null,
      merged.servico_contratado || null,
      merged.descricao || null,
      merged.observacoes || null,
      normalizeOrcamentoValue('itens_valores', merged.itens_valores),
      normalizeOrcamentoValue('valor_total', merged.valor_total),
      normalizeOrcamentoValue('entrada', merged.entrada),
      normalizeOrcamentoValue('saldo', merged.saldo),
      merged.status || 'Em aberto',
      merged.texto_original || null,
      buildOrcamentoDados(merged),
      req.params.id
    ]);

    res.json({ ok: true, dados: formatOrcamento(result.rows[0]) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.delete('/orcamentos/:id', requireRole(ACCESS_PROFILES.GESTOR), async (req, res) => {
  try {
    await ensureOrcamentosTable();

    const result = await pool.query(
      'DELETE FROM orcamentos WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Orcamento nao encontrado' });
    }

    res.json({ ok: true, dados: formatOrcamento(result.rows[0]) });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get('/recibos', async (req, res) => {
  try {
    await ensureRecibosTable();

    const result = await pool.query(`
      SELECT *
      FROM recibos
      ORDER BY created_at DESC
    `);

    res.json({ ok: true, dados: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.post('/recibos', async (req, res) => {
  try {
    await ensureRecibosTable();

    const id = req.body.id || crypto.randomUUID();
    const insertFields = getProvidedFields(req.body, RECIBO_FIELDS);
    const columns = ['id', ...insertFields];
    const values = [
      id,
      ...insertFields.map((field) => normalizeReciboValue(field, req.body[field]))
    ];
    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

    const result = await pool.query(`
      INSERT INTO recibos (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `, values);

    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.put('/recibos/:id', async (req, res) => {
  try {
    await ensureRecibosTable();

    const updateFields = getProvidedFields(req.body, RECIBO_FIELDS);

    if (!updateFields.length) {
      return res.status(400).json({ ok: false, erro: 'Nenhum campo para atualizar' });
    }

    const setClause = updateFields
      .map((field, index) => `${field} = $${index + 1}`)
      .concat(`updated_at = CURRENT_TIMESTAMP`)
      .join(', ');
    const values = updateFields.map((field) => normalizeReciboValue(field, req.body[field]));

    const result = await pool.query(`
      UPDATE recibos
      SET ${setClause}
      WHERE id = $${values.length + 1}
      RETURNING *
    `, [...values, req.params.id]);

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Recibo nao encontrado' });
    }

    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  }
});

app.delete('/recibos/:id', requireRole(ACCESS_PROFILES.GESTOR), async (req, res) => {
  try {
    await ensureRecibosTable();

    const result = await pool.query(
      'DELETE FROM recibos WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, erro: 'Recibo nao encontrado' });
    }

    res.json({ ok: true, dados: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.post('/process-recibo-text', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Texto nao enviado.'
      });
    }

    const extracted = completeReciboExtraction(parseReciboText(text), text);

    res.json({
      ok: true,
      data: {
        extracted,
        texto: text
      }
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: 'Erro interno ao processar texto.'
    });
  }
});

app.post('/process-recibo-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'Arquivo PDF nao enviado.'
      });
    }

    const extractedText = await extractTextFromPDFBuffer(req.file.buffer);

    if (!extractedText) {
      return res.status(400).json({
        success: false,
        message: 'Nao foi possivel extrair texto do PDF.'
      });
    }

    const extracted = parseReciboPdfText(extractedText);

    res.json({
      ok: true,
      data: {
        extracted,
        texto: extractedText
      }
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: 'Erro interno ao processar PDF.'
    });
  }
});

app.post('/process-orcamento-text', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Texto nao enviado.'
      });
    }

    const extracted = parseOrcamentoText(text);

    res.json({
      success: true,
      message: 'Texto processado com sucesso.',
      data: {
        extracted,
        preview: extracted
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno ao processar texto.'
    });
  }
});

app.post('/process-orcamento-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'Arquivo PDF nao enviado.'
      });
    }

    const extractedText = await extractTextFromPDFBuffer(req.file.buffer);

    if (!extractedText) {
      return res.status(400).json({
        success: false,
        message: 'Nao foi possivel extrair texto do PDF.'
      });
    }

    const extracted = parseOrcamentoText(extractedText, { fromPdf: true });

    res.json({
      success: true,
      message: 'PDF processado com sucesso.',
      data: {
        texto: extracted.texto_original,
        extracted,
        preview: extracted
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno ao processar PDF.'
    });
  }
});

app.post('/contracts', async (req, res) => {
  let client;

  try {
    const {
      nome_contratante,
      local,
      data_evento,
      horario_inicio,
      servico_contratado
    } = req.body;

    if (!nome_contratante || !local || !data_evento || !horario_inicio || !servico_contratado) {
      return res.status(400).json({
        ok: false,
        erro: 'Campos obrigatórios ausentes'
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const ultimo = await client.query(`
  SELECT identificador_interno
  FROM contracts
  WHERE identificador_interno IS NOT NULL
`);

let maxNumber = 0;

for (const row of ultimo.rows) {
  const match = row.identificador_interno?.match(/ID\s+(\d+)/i);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    if (num > maxNumber) maxNumber = num;
  }
}

    const nextIdNumber = maxNumber + 1;
    const identificador_interno = `ID ${String(nextIdNumber).padStart(2, '0')}`;
    const id = crypto.randomUUID();

    const insertFields = CONTRACT_INSERT_FIELDS.filter((field) =>
      ['nome_contratante', 'local', 'data_evento', 'horario_inicio', 'servico_contratado'].includes(field) ||
      Object.prototype.hasOwnProperty.call(req.body, field)
    );
    const columns = ['id', 'identificador_interno', ...insertFields];
    const values = [
      id,
      identificador_interno,
      ...insertFields.map((field) => normalizeContractValue(field, req.body[field]))
    ];
    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

    const result = await client.query(`
      INSERT INTO contracts (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `, values);

    const contract = result.rows[0];
    const eventoId = crypto.randomUUID();

    const localTrim = String(contract.local ?? '').trim();
    const eventoCidade = localTrim || null;
    const qtdExtraida = extractQtdRecreadoresFromServico(contract.servico_contratado);
    const eventoQtdRecreadores = qtdExtraida != null ? qtdExtraida : 0;

    await client.query(`
      INSERT INTO eventos (
        id,
        contract_id,
        identificador_interno,
        contratante_nome,
        endereco_evento,
        cidade,
        data_evento,
        dia_semana,
        hora_inicio,
        hora_fim,
        servico_contratado,
        servicos_adicionais,
        valor_total,
        sinal,
        resta,
        qtd_recreadores,
        status_financeiro
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    `, [
      eventoId,
      contract.id,
      contract.identificador_interno,
      contract.nome_contratante,
      contract.local,
      eventoCidade,
      contract.data_evento,
      contract.dia_semana,
      contract.horario_inicio,
      contract.horario_fim,
      contract.servico_contratado,
      contract.extras,
      moneyOrZero(contract.valor_total),
      moneyOrZero(contract.entrada),
      calculateContractResta(contract),
      eventoQtdRecreadores,
      'Em andamento'
    ]);

    await client.query('COMMIT');

    res.json({ ok: true, dados: contract });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  } finally {
    if (client) client.release();
  }
});

app.put('/contracts/:id', async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const updateFields = getProvidedFields(req.body, CONTRACT_UPDATE_FIELDS);

    if (!updateFields.length) {
      return res.status(400).json({ ok: false, erro: 'Nenhum campo para atualizar' });
    }

    const setClause = updateFields
      .map((field, index) => `${field} = $${index + 1}`)
      .join(', ');
    const values = updateFields.map((field) => normalizeContractValue(field, req.body[field]));

    await client.query('BEGIN');

    const result = await client.query(`
      UPDATE contracts
      SET ${setClause}
      WHERE id = $${values.length + 1}
      RETURNING *
    `, [...values, id]);

    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, erro: 'Contrato nao encontrado' });
    }

    const contract = result.rows[0];

    const localTrim = String(contract.local ?? '').trim();
    const cidadeParaUpdate = localTrim || null;
    const qtdExtraidaPut = extractQtdRecreadoresFromServico(contract.servico_contratado);
    const qtdParaUpdate = qtdExtraidaPut != null ? qtdExtraidaPut : 0;

    await client.query(`
      UPDATE eventos
      SET
        identificador_interno = $1,
        contratante_nome = $2,
        endereco_evento = $3,
        cidade = $4,
        data_evento = $5,
        dia_semana = $6,
        hora_inicio = $7,
        hora_fim = $8,
        servico_contratado = $9,
        servicos_adicionais = $10,
        valor_total = $11,
        sinal = $12,
        resta = $13,
        qtd_recreadores = $14
      WHERE contract_id = $15
    `, [
      contract.identificador_interno,
      contract.nome_contratante,
      contract.local,
      cidadeParaUpdate,
      contract.data_evento,
      contract.dia_semana,
      contract.horario_inicio,
      contract.horario_fim,
      contract.servico_contratado,
      contract.extras,
      moneyOrZero(contract.valor_total),
      moneyOrZero(contract.entrada),
      calculateContractResta(contract),
      qtdParaUpdate,
      contract.id
    ]);

    await client.query('COMMIT');

    res.json({ ok: true, dados: contract });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
  } finally {
    client.release();
  }
});

app.delete('/contracts/:id', requirePermission(ACCESS_PERMISSIONS.CONTRACTS_DELETE), async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT id FROM contracts WHERE id = $1',
      [id]
    );

    if (!existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, erro: 'Contrato nao encontrado' });
    }

    const eventos = await client.query(
      'DELETE FROM eventos WHERE contract_id = $1 RETURNING id',
      [id]
    );

    const result = await client.query(
      'DELETE FROM contracts WHERE id = $1 RETURNING *',
      [id]
    );

    await client.query('COMMIT');

    res.json({
      ok: true,
      dados: result.rows[0],
      eventos_removidos: eventos.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ ok: false, erro: error.message });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3001;

app.post('/ai/organizar-contrato', async (req, res) => {
  try {
    const textoBruto = typeof req.body?.texto_bruto === 'string' ? req.body.texto_bruto : '';
    const contexto = req.body?.contexto && typeof req.body.contexto === 'object'
      ? req.body.contexto
      : {};

    if (!textoBruto.trim()) {
      return res.status(400).json({
        ok: false,
        erro: 'Campo texto_bruto é obrigatório.',
      });
    }

    const result = await organizeContractTextWithAI({
      texto_bruto: textoBruto,
      contexto,
    });

    return res.json(result);
  } catch (error) {
    const statusCode = error instanceof AIContractOrganizerError
      ? error.statusCode
      : 500;
    return res.status(statusCode).json({
      ok: false,
      erro: error.message || 'Erro ao organizar contrato com IA.',
    });
  }
});

app.post("/process-contract-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: "Arquivo PDF não enviado."
      });
    }

    const extractedText = await extractTextFromPDFBuffer(req.file.buffer);

    if (!extractedText) {
      return res.status(400).json({
        success: false,
        message: "Não foi possível extrair texto do PDF."
      });
    }

    const result = parseContractText(extractedText);

    return res.json({
      success: true,
      message: "PDF processado com sucesso.",
      data: {
        texto: extractedText,
        ...result
      }
    });
  } catch (error) {
    console.error("Erro ao processar PDF do contrato:", error);

    return res.status(500).json({
      success: false,
      message: "Erro interno ao processar PDF."
    });
  }
});

app.post("/process-contract-text", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: "Texto não enviado."
      });
    }

    const result = parseContractText(text);

    return res.json({
      success: true,
      message: "Texto processado com sucesso.",
      data: result
    });
  } catch (error) {
    console.error("Erro ao processar texto do contrato:", error);

    return res.status(500).json({
      success: false,
      message: "Erro interno ao processar texto."
    });
  }
});

(async function startServer() {
  try {
    await ensureAuthSchema();
  } catch (e) {
    console.error('Falha ao garantir schema de autenticacao:', e);
  }
  try {
    await bootstrapInitialGestor();
  } catch (e) {
    console.error('Falha ao preparar gestor inicial:', e);
  }
  try {
    await ensureEventosOperacionalPagamentoColumns();
  } catch (e) {
    console.error('Falha ao garantir colunas do evento (pagamento operacional):', e);
  }
  try {
    await ensureEscalaEventosTable();
  } catch (e) {
    console.error('Falha ao garantir tabela escala_eventos:', e);
  }
  try {
    await ensurePagamentosEscalaColaboradorTable();
  } catch (e) {
    console.error('Falha ao garantir tabela pagamentos_escala_colaborador:', e);
  }
  try {
    await ensureGestaoEquipeSchema();
  } catch (e) {
    console.error('Falha ao garantir schema da Gestao Equipe:', e);
  }
  try {
    await ensureCiclosFinanceirosTable();
  } catch (e) {
    console.error('Falha ao garantir tabela ciclos_financeiros:', e);
  }
  try {
    await ensureCofrinhosConfigTable();
  } catch (e) {
    console.error('Falha ao garantir tabela cofrinhos_config:', e);
  }
  try {
    startAutomaticBackupScheduler();
  } catch (e) {
    console.error('Falha ao iniciar scheduler de backup automático:', e);
  }
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Servidor rodando em http://127.0.0.1:${PORT}`);
  });
})();
