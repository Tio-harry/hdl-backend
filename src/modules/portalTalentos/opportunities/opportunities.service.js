const {
  countApplicationsByOpportunityId,
  createOpportunity: insertOpportunity,
  deleteOpportunityById,
  findOpportunityById,
  findOpportunityByLegacyId,
  listOpportunities: selectOpportunities,
  listPublicOpportunities: selectPublicOpportunities,
  updateOpportunity: updateOpportunityRow,
  updateOpportunityStatus: updateOpportunityStatusRow,
  updateOpportunityVisibility: updateOpportunityVisibilityRow,
} = require('./opportunities.repository');
const { PortalTalentosError } = require('../shared/errors');
const {
  normalizeJsonValue,
  normalizeOptionalText,
  toOpportunityResponse,
} = require('../shared/normalize');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_STATUS = 'inscricoes_abertas';
const DEFAULT_VISIBILITY = 'visivel';

const ALLOWED_STATUSES = new Set([
  'inscricoes_abertas',
  'em_analise',
  'selecao_virtual',
  'selecao_presencial',
  'equipe_em_formacao',
  'equipe_fechada',
  'encerrada',
]);

const ALLOWED_VISIBILITIES = new Set(['visivel', 'ocultada']);

function getOpportunitiesHealth() {
  return {
    ok: true,
    module: 'portal-talentos',
    submodule: 'opportunities',
  };
}

function normalizeStatus(value) {
  const status = normalizeOptionalText(value) || DEFAULT_STATUS;
  if (!ALLOWED_STATUSES.has(status)) {
    throw new PortalTalentosError(400, 'Status de oportunidade invalido.');
  }
  return status;
}

function normalizeVisibility(value) {
  const publicVisibility = normalizeOptionalText(value) || DEFAULT_VISIBILITY;
  if (!ALLOWED_VISIBILITIES.has(publicVisibility)) {
    throw new PortalTalentosError(400, 'Visibilidade publica invalida.');
  }
  return publicVisibility;
}

function normalizeOpportunityPayload(payload = {}, { partial = false } = {}) {
  const title = normalizeOptionalText(payload.title);

  if (!partial && !title) {
    throw new PortalTalentosError(400, 'title e obrigatorio.');
  }

  return {
    legacyId: normalizeOptionalText(payload.legacyId),
    title,
    internalName: normalizeOptionalText(payload.internalName),
    category: normalizeOptionalText(payload.category),
    location: normalizeOptionalText(payload.location),
    startDate: normalizeOptionalText(payload.startDate),
    endDate: normalizeOptionalText(payload.endDate),
    status: normalizeStatus(payload.status),
    publicVisibility: normalizeVisibility(payload.publicVisibility),
    summary: normalizeOptionalText(payload.summary),
    training: normalizeOptionalText(payload.training),
    schedule: normalizeJsonValue(payload.schedule, {}, 'schedule'),
    operationDescription: normalizeOptionalText(payload.operationDescription),
    rules: normalizeJsonValue(payload.rules, [], 'rules'),
    structure: normalizeJsonValue(payload.structure, [], 'structure'),
    benefits: normalizeJsonValue(payload.benefits, [], 'benefits'),
    desiredProfile: normalizeJsonValue(payload.desiredProfile, [], 'desiredProfile'),
    alertMessage: normalizeOptionalText(payload.alertMessage),
    paymentInfo: normalizeJsonValue(payload.paymentInfo, {}, 'paymentInfo'),
    groupLink: normalizeOptionalText(payload.groupLink),
    internalNotes: normalizeOptionalText(payload.internalNotes),
    rawPayload: normalizeJsonValue(payload.rawPayload, {}, 'rawPayload'),
  };
}

async function listOpportunities(filters = {}) {
  const rows = await selectOpportunities({
    search: normalizeOptionalText(filters.search),
    category: normalizeOptionalText(filters.category),
    status: normalizeOptionalText(filters.status),
    publicVisibility: normalizeOptionalText(filters.publicVisibility),
  });

  return rows.map(toOpportunityResponse);
}

async function listPublicOpportunities() {
  const rows = await selectPublicOpportunities();
  return rows.map(toOpportunityResponse);
}

async function getOpportunityByIdentifier(identifier) {
  const normalizedIdentifier = normalizeOptionalText(identifier);
  if (!normalizedIdentifier) {
    throw new PortalTalentosError(400, 'Identificador de oportunidade invalido.');
  }

  const row = UUID_RE.test(normalizedIdentifier)
    ? await findOpportunityById(normalizedIdentifier)
    : await findOpportunityByLegacyId(normalizedIdentifier);

  if (!row) {
    throw new PortalTalentosError(404, 'Oportunidade nao encontrada.');
  }

  return toOpportunityResponse(row);
}

async function ensureLegacyIdAvailable(legacyId, currentOpportunityId = null) {
  if (!legacyId) return;

  const existing = await findOpportunityByLegacyId(legacyId);
  if (existing && existing.id !== currentOpportunityId) {
    throw new PortalTalentosError(409, 'Ja existe oportunidade cadastrada com este legacyId.');
  }
}

async function createOpportunity(payload = {}) {
  const opportunity = normalizeOpportunityPayload(payload);

  await ensureLegacyIdAvailable(opportunity.legacyId);

  try {
    const row = await insertOpportunity(opportunity);
    return toOpportunityResponse(row);
  } catch (error) {
    if (error.code === '23505') {
      throw new PortalTalentosError(409, 'Ja existe oportunidade cadastrada com dados unicos informados.');
    }
    throw error;
  }
}

async function updateOpportunity(id, payload = {}) {
  if (!UUID_RE.test(String(id || ''))) {
    throw new PortalTalentosError(400, 'ID de oportunidade invalido.');
  }

  const current = await findOpportunityById(id);
  if (!current) {
    throw new PortalTalentosError(404, 'Oportunidade nao encontrada.');
  }

  const opportunity = normalizeOpportunityPayload({
    legacyId: Object.prototype.hasOwnProperty.call(payload, 'legacyId') ? payload.legacyId : current.legacy_id,
    title: Object.prototype.hasOwnProperty.call(payload, 'title') ? payload.title : current.title,
    internalName: Object.prototype.hasOwnProperty.call(payload, 'internalName') ? payload.internalName : current.internal_name,
    category: Object.prototype.hasOwnProperty.call(payload, 'category') ? payload.category : current.category,
    location: Object.prototype.hasOwnProperty.call(payload, 'location') ? payload.location : current.location,
    startDate: Object.prototype.hasOwnProperty.call(payload, 'startDate') ? payload.startDate : current.start_date,
    endDate: Object.prototype.hasOwnProperty.call(payload, 'endDate') ? payload.endDate : current.end_date,
    status: Object.prototype.hasOwnProperty.call(payload, 'status') ? payload.status : current.status,
    publicVisibility: Object.prototype.hasOwnProperty.call(payload, 'publicVisibility')
      ? payload.publicVisibility
      : current.public_visibility,
    summary: Object.prototype.hasOwnProperty.call(payload, 'summary') ? payload.summary : current.summary,
    training: Object.prototype.hasOwnProperty.call(payload, 'training') ? payload.training : current.training,
    schedule: Object.prototype.hasOwnProperty.call(payload, 'schedule') ? payload.schedule : current.schedule,
    operationDescription: Object.prototype.hasOwnProperty.call(payload, 'operationDescription')
      ? payload.operationDescription
      : current.operation_description,
    rules: Object.prototype.hasOwnProperty.call(payload, 'rules') ? payload.rules : current.rules,
    structure: Object.prototype.hasOwnProperty.call(payload, 'structure') ? payload.structure : current.structure,
    benefits: Object.prototype.hasOwnProperty.call(payload, 'benefits') ? payload.benefits : current.benefits,
    desiredProfile: Object.prototype.hasOwnProperty.call(payload, 'desiredProfile')
      ? payload.desiredProfile
      : current.desired_profile,
    alertMessage: Object.prototype.hasOwnProperty.call(payload, 'alertMessage') ? payload.alertMessage : current.alert_message,
    paymentInfo: Object.prototype.hasOwnProperty.call(payload, 'paymentInfo') ? payload.paymentInfo : current.payment_info,
    groupLink: Object.prototype.hasOwnProperty.call(payload, 'groupLink') ? payload.groupLink : current.group_link,
    internalNotes: Object.prototype.hasOwnProperty.call(payload, 'internalNotes') ? payload.internalNotes : current.internal_notes,
    rawPayload: Object.prototype.hasOwnProperty.call(payload, 'rawPayload') ? payload.rawPayload : current.raw_payload,
  });

  await ensureLegacyIdAvailable(opportunity.legacyId, id);

  try {
    const row = await updateOpportunityRow(id, opportunity);
    return toOpportunityResponse(row);
  } catch (error) {
    if (error.code === '23505') {
      throw new PortalTalentosError(409, 'Ja existe oportunidade cadastrada com dados unicos informados.');
    }
    throw error;
  }
}

async function updateStatus(id, payload = {}) {
  if (!UUID_RE.test(String(id || ''))) {
    throw new PortalTalentosError(400, 'ID de oportunidade invalido.');
  }

  if (!Object.prototype.hasOwnProperty.call(payload, 'status')) {
    throw new PortalTalentosError(400, 'status e obrigatorio.');
  }

  const status = normalizeStatus(payload.status);
  const row = await updateOpportunityStatusRow(id, status);

  if (!row) {
    throw new PortalTalentosError(404, 'Oportunidade nao encontrada.');
  }

  return toOpportunityResponse(row);
}

async function updateVisibility(id, payload = {}) {
  if (!UUID_RE.test(String(id || ''))) {
    throw new PortalTalentosError(400, 'ID de oportunidade invalido.');
  }

  if (!Object.prototype.hasOwnProperty.call(payload, 'publicVisibility')) {
    throw new PortalTalentosError(400, 'publicVisibility e obrigatorio.');
  }

  const publicVisibility = normalizeVisibility(payload.publicVisibility);
  const row = await updateOpportunityVisibilityRow(id, publicVisibility);

  if (!row) {
    throw new PortalTalentosError(404, 'Oportunidade nao encontrada.');
  }

  return toOpportunityResponse(row);
}

async function deleteOpportunity(id, dbClient = null) {
  if (!UUID_RE.test(String(id || ''))) {
    throw new PortalTalentosError(400, 'ID de oportunidade invalido.');
  }

  const current = await findOpportunityById(id, dbClient);
  if (!current) {
    throw new PortalTalentosError(404, 'Oportunidade nao encontrada.');
  }

  const linkedApplications = await countApplicationsByOpportunityId(id, dbClient);
  if (linkedApplications > 0) {
    throw new PortalTalentosError(
      409,
      'Não é possível excluir esta oportunidade porque existem candidaturas vinculadas. Remova as candidaturas primeiro ou oculte a oportunidade da área pública.'
    );
  }

  const deleted = await deleteOpportunityById(id, dbClient);
  if (!deleted) {
    throw new PortalTalentosError(404, 'Oportunidade nao encontrada.');
  }

  return {
    ok: true,
    deleted: true,
    id: deleted.id,
  };
}

module.exports = {
  createOpportunity,
  deleteOpportunity,
  getOpportunitiesHealth,
  getOpportunityByIdentifier,
  listOpportunities,
  listPublicOpportunities,
  updateOpportunity,
  updateStatus,
  updateVisibility,
};
