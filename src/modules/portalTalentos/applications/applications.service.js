const {
  candidateExists,
  createApplication: insertApplication,
  deleteApplicationById,
  findApplicationById,
  findApplicationByOpportunityAndCandidate,
  listApplications: selectApplications,
  listApplicationsByCandidate: selectApplicationsByCandidate,
  listApplicationsByOpportunity: selectApplicationsByOpportunity,
  opportunityExists,
  updateApplication: updateApplicationRow,
} = require('./applications.repository');
const { PortalTalentosError } = require('../shared/errors');
const {
  normalizeCpf,
  normalizeJsonValue,
  normalizeOptionalText,
  toApplicationResponse,
} = require('../shared/normalize');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_STATUS = 'candidatura_iniciada';

const ALLOWED_STATUSES = new Set([
  'candidatura_iniciada',
  'detalhes_confirmados',
  'processo_virtual_enviado',
  'em_analise_virtual',
  'aprovado_virtual',
  'reprovado_virtual',
  'chamado_presencial',
  'aprovado_presencial',
  'reprovado_presencial',
  'banco_reserva',
  'aprovado_titular',
  'aprovado_reserva',
  'precisa_treinamento',
  'nao_compareceu_presencial',
  'desistente',
  'escalado',
]);

const VIRTUAL_SELECTION_CAN_ADVANCE_FROM = new Set([
  'candidatura_iniciada',
  'detalhes_confirmados',
  'processo_virtual_enviado',
]);

const FINAL_DECISION_STATUS = {
  aprovado_titular: { status: 'aprovado_presencial', readyForEvent: true },
  aprovado_reserva: { status: 'banco_reserva', readyForEvent: true },
  reprovado: { status: 'reprovado_presencial', readyForEvent: false },
  desistente: { status: 'desistente', readyForEvent: false },
  nao_compareceu: { status: 'nao_compareceu_presencial', readyForEvent: false },
  precisa_treinamento: { status: 'precisa_treinamento', readyForEvent: false },
};

function getApplicationsHealth() {
  return {
    ok: true,
    module: 'portal-talentos',
    submodule: 'applications',
  };
}

function assertValidUuid(value, fieldName) {
  if (!UUID_RE.test(String(value || ''))) {
    throw new PortalTalentosError(400, `${fieldName} invalido.`);
  }
}

function normalizeStatus(value) {
  const status = normalizeOptionalText(value) || DEFAULT_STATUS;
  if (!ALLOWED_STATUSES.has(status)) {
    throw new PortalTalentosError(400, 'Status de candidatura invalido.');
  }
  return status;
}

function normalizeBoolean(value, fieldName) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'sim', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'nao', 'não', 'no'].includes(normalized)) return false;
  }
  throw new PortalTalentosError(400, `${fieldName} deve ser booleano.`);
}

function normalizeStatusHistory(value) {
  const history = normalizeJsonValue(value, [], 'statusHistory');
  if (!Array.isArray(history)) {
    throw new PortalTalentosError(400, 'statusHistory deve ser um array.');
  }
  return history;
}

function appendStatusHistory(history, from, to) {
  if (!from || !to || from === to) return history;
  return [
    ...history,
    {
      from,
      to,
      changedAt: new Date().toISOString(),
      changedBy: 'api',
    },
  ];
}

function normalizeCommunication(value) {
  const communication = normalizeJsonValue(value, {}, 'communication');
  const normalized = { ...communication };

  if (!normalized.groupLink && normalized.groupOfficialLink) {
    normalized.groupLink = normalized.groupOfficialLink;
  }

  delete normalized.groupOfficialLink;
  return normalized;
}

function normalizeApplicationPayload(payload = {}, { requireRelations = false } = {}) {
  const opportunityId = normalizeOptionalText(payload.opportunityId);
  const candidateId = normalizeOptionalText(payload.candidateId);

  if (requireRelations) {
    if (!opportunityId) throw new PortalTalentosError(400, 'opportunityId e obrigatorio.');
    if (!candidateId) throw new PortalTalentosError(400, 'candidateId e obrigatorio.');
    assertValidUuid(opportunityId, 'opportunityId');
    assertValidUuid(candidateId, 'candidateId');
  }

  const candidateCpf = normalizeOptionalText(payload.candidateCpf);
  const acceptedTerms = normalizeBoolean(payload.acceptedTerms, 'acceptedTerms');
  const readyForEvent = normalizeBoolean(payload.readyForEvent, 'readyForEvent');

  return {
    legacyId: normalizeOptionalText(payload.legacyId),
    opportunityId,
    candidateId,
    candidateCpf,
    candidateCpfNormalized: normalizeCpf(candidateCpf),
    status: normalizeStatus(payload.status),
    currentStage: normalizeOptionalText(payload.currentStage),
    acceptedTerms: acceptedTerms === null ? false : acceptedTerms,
    virtualSelection: normalizeJsonValue(payload.virtualSelection, {}, 'virtualSelection'),
    evaluation: normalizeJsonValue(payload.evaluation, {}, 'evaluation'),
    communication: normalizeCommunication(payload.communication),
    statusHistory: normalizeStatusHistory(payload.statusHistory),
    readyForEvent: readyForEvent === null ? false : readyForEvent,
    internalNotes: normalizeOptionalText(payload.internalNotes),
    rawPayload: normalizeJsonValue(payload.rawPayload, {}, 'rawPayload'),
  };
}

async function listApplications(filters = {}, dbClient = null) {
  const opportunityId = normalizeOptionalText(filters.opportunityId);
  const candidateId = normalizeOptionalText(filters.candidateId);
  const readyForEvent = normalizeBoolean(filters.readyForEvent, 'readyForEvent');

  if (opportunityId) assertValidUuid(opportunityId, 'opportunityId');
  if (candidateId) assertValidUuid(candidateId, 'candidateId');

  const status = normalizeOptionalText(filters.status);
  if (status && !ALLOWED_STATUSES.has(status)) {
    throw new PortalTalentosError(400, 'Status de candidatura invalido.');
  }

  const rows = await selectApplications({
    status,
    opportunityId,
    candidateId,
    cpfNormalized: normalizeCpf(filters.cpf),
    readyForEvent,
  }, dbClient);

  return rows.map(toApplicationResponse);
}

async function getApplicationById(id, dbClient = null) {
  assertValidUuid(id, 'ID de candidatura');

  const row = await findApplicationById(id, dbClient);
  if (!row) {
    throw new PortalTalentosError(404, 'Candidatura nao encontrada.');
  }

  return toApplicationResponse(row);
}

async function listByCandidate(candidateId, dbClient = null) {
  assertValidUuid(candidateId, 'candidateId');
  const rows = await selectApplicationsByCandidate(candidateId, dbClient);
  return rows.map(toApplicationResponse);
}

async function listByOpportunity(opportunityId, dbClient = null) {
  assertValidUuid(opportunityId, 'opportunityId');
  const rows = await selectApplicationsByOpportunity(opportunityId, dbClient);
  return rows.map(toApplicationResponse);
}

async function createApplication(payload = {}, dbClient = null) {
  const application = normalizeApplicationPayload(payload, { requireRelations: true });

  if (!(await opportunityExists(application.opportunityId, dbClient))) {
    throw new PortalTalentosError(404, 'Oportunidade nao encontrada.');
  }

  if (!(await candidateExists(application.candidateId, dbClient))) {
    throw new PortalTalentosError(404, 'Candidato nao encontrado.');
  }

  const duplicate = await findApplicationByOpportunityAndCandidate(
    application.opportunityId,
    application.candidateId,
    dbClient
  );

  if (duplicate) {
    throw new PortalTalentosError(409, 'Ja existe candidatura para este candidato nesta oportunidade.');
  }

  try {
    const row = await insertApplication(application, dbClient);
    return toApplicationResponse(row);
  } catch (error) {
    if (error.code === '23505') {
      throw new PortalTalentosError(409, 'Ja existe candidatura cadastrada com dados unicos informados.');
    }
    throw error;
  }
}

function buildMergedPayload(current, payload) {
  return {
    legacyId: Object.prototype.hasOwnProperty.call(payload, 'legacyId') ? payload.legacyId : current.legacy_id,
    candidateCpf: Object.prototype.hasOwnProperty.call(payload, 'candidateCpf') ? payload.candidateCpf : current.candidate_cpf,
    status: Object.prototype.hasOwnProperty.call(payload, 'status') ? payload.status : current.status,
    currentStage: Object.prototype.hasOwnProperty.call(payload, 'currentStage') ? payload.currentStage : current.current_stage,
    acceptedTerms: Object.prototype.hasOwnProperty.call(payload, 'acceptedTerms')
      ? payload.acceptedTerms
      : current.accepted_terms,
    virtualSelection: Object.prototype.hasOwnProperty.call(payload, 'virtualSelection')
      ? payload.virtualSelection
      : current.virtual_selection,
    evaluation: Object.prototype.hasOwnProperty.call(payload, 'evaluation') ? payload.evaluation : current.evaluation,
    communication: Object.prototype.hasOwnProperty.call(payload, 'communication') ? payload.communication : current.communication,
    statusHistory: Object.prototype.hasOwnProperty.call(payload, 'statusHistory')
      ? payload.statusHistory
      : current.status_history,
    readyForEvent: Object.prototype.hasOwnProperty.call(payload, 'readyForEvent')
      ? payload.readyForEvent
      : current.ready_for_event,
    internalNotes: Object.prototype.hasOwnProperty.call(payload, 'internalNotes')
      ? payload.internalNotes
      : current.internal_notes,
    rawPayload: Object.prototype.hasOwnProperty.call(payload, 'rawPayload') ? payload.rawPayload : current.raw_payload,
  };
}

async function updateApplication(id, payload = {}, dbClient = null) {
  assertValidUuid(id, 'ID de candidatura');

  const current = await findApplicationById(id, dbClient);
  if (!current) {
    throw new PortalTalentosError(404, 'Candidatura nao encontrada.');
  }

  const application = normalizeApplicationPayload(buildMergedPayload(current, payload));
  application.statusHistory = appendStatusHistory(application.statusHistory, current.status, application.status);

  try {
    const row = await updateApplicationRow(id, application, dbClient);
    return toApplicationResponse(row);
  } catch (error) {
    if (error.code === '23505') {
      throw new PortalTalentosError(409, 'Ja existe candidatura cadastrada com dados unicos informados.');
    }
    throw error;
  }
}

async function updateStatus(id, payload = {}, dbClient = null) {
  assertValidUuid(id, 'ID de candidatura');

  if (!Object.prototype.hasOwnProperty.call(payload, 'status')) {
    throw new PortalTalentosError(400, 'status e obrigatorio.');
  }

  const current = await findApplicationById(id, dbClient);
  if (!current) {
    throw new PortalTalentosError(404, 'Candidatura nao encontrada.');
  }

  const nextStatus = normalizeStatus(payload.status);
  const application = normalizeApplicationPayload(buildMergedPayload(current, { status: nextStatus }));
  application.statusHistory = appendStatusHistory(application.statusHistory, current.status, nextStatus);

  const row = await updateApplicationRow(id, application, dbClient);
  return toApplicationResponse(row);
}

async function updateVirtualSelection(id, payload = {}, dbClient = null) {
  assertValidUuid(id, 'ID de candidatura');

  if (!Object.prototype.hasOwnProperty.call(payload, 'virtualSelection')) {
    throw new PortalTalentosError(400, 'virtualSelection e obrigatorio.');
  }

  const current = await findApplicationById(id, dbClient);
  if (!current) {
    throw new PortalTalentosError(404, 'Candidatura nao encontrada.');
  }

  const nextStatus = VIRTUAL_SELECTION_CAN_ADVANCE_FROM.has(current.status)
    ? 'em_analise_virtual'
    : current.status;
  const application = normalizeApplicationPayload(buildMergedPayload(current, {
    virtualSelection: payload.virtualSelection,
    currentStage: 'processo_virtual_enviado',
    status: nextStatus,
  }));
  application.statusHistory = appendStatusHistory(application.statusHistory, current.status, nextStatus);

  const row = await updateApplicationRow(id, application, dbClient);
  return toApplicationResponse(row);
}

function getEvaluationDecision(evaluation) {
  return evaluation?.presential?.finalDecision || null;
}

async function updateEvaluation(id, payload = {}, dbClient = null) {
  assertValidUuid(id, 'ID de candidatura');

  if (!Object.prototype.hasOwnProperty.call(payload, 'evaluation')) {
    throw new PortalTalentosError(400, 'evaluation e obrigatorio.');
  }

  const current = await findApplicationById(id, dbClient);
  if (!current) {
    throw new PortalTalentosError(404, 'Candidatura nao encontrada.');
  }

  const evaluation = normalizeJsonValue(payload.evaluation, {}, 'evaluation');
  const decision = getEvaluationDecision(evaluation);
  const decisionResult = decision ? FINAL_DECISION_STATUS[decision] : null;

  let nextStatus = current.status;
  let nextReadyForEvent = current.ready_for_event;

  if (decisionResult) {
    nextStatus = decisionResult.status;
    nextReadyForEvent = decisionResult.readyForEvent;
  } else if (Object.prototype.hasOwnProperty.call(payload, 'readyForEvent')) {
    nextReadyForEvent = normalizeBoolean(payload.readyForEvent, 'readyForEvent');
  }

  const application = normalizeApplicationPayload(buildMergedPayload(current, {
    evaluation,
    status: nextStatus,
    readyForEvent: nextReadyForEvent,
  }));
  application.statusHistory = appendStatusHistory(application.statusHistory, current.status, nextStatus);

  const row = await updateApplicationRow(id, application, dbClient);
  return toApplicationResponse(row);
}

async function updateCommunication(id, payload = {}, dbClient = null) {
  assertValidUuid(id, 'ID de candidatura');

  if (!Object.prototype.hasOwnProperty.call(payload, 'communication')) {
    throw new PortalTalentosError(400, 'communication e obrigatorio.');
  }

  const current = await findApplicationById(id, dbClient);
  if (!current) {
    throw new PortalTalentosError(404, 'Candidatura nao encontrada.');
  }

  const application = normalizeApplicationPayload(buildMergedPayload(current, {
    communication: payload.communication,
  }));

  const row = await updateApplicationRow(id, application, dbClient);
  return toApplicationResponse(row);
}

async function deleteApplication(id, dbClient = null) {
  assertValidUuid(id, 'ID de candidatura');

  const deleted = await deleteApplicationById(id, dbClient);
  if (!deleted) {
    throw new PortalTalentosError(404, 'Candidatura nao encontrada.');
  }

  return {
    ok: true,
    deleted: true,
    id: deleted.id,
  };
}

module.exports = {
  createApplication,
  deleteApplication,
  getApplicationById,
  getApplicationsHealth,
  listApplications,
  listByCandidate,
  listByOpportunity,
  updateApplication,
  updateCommunication,
  updateEvaluation,
  updateStatus,
  updateVirtualSelection,
};
