const {
  countApplicationsByCandidateId,
  createCandidate: insertCandidate,
  deleteCandidateById,
  findCandidateByCpfNormalized,
  findCandidateById,
  listCandidates: selectCandidates,
  updateCandidate: updateCandidateRow,
  updateCandidateOpportunityProfile,
} = require('./candidates.repository');
const { PortalTalentosError } = require('../shared/errors');
const {
  normalizeCpf,
  normalizeJsonObject,
  normalizeOptionalText,
  toCandidateResponse,
} = require('../shared/normalize');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getCandidatesHealth() {
  return {
    ok: true,
    module: 'portal-talentos',
    submodule: 'candidates',
  };
}

function assertValidId(id) {
  if (!UUID_RE.test(String(id || ''))) {
    throw new PortalTalentosError(400, 'ID de candidato invalido.');
  }
}

function normalizeCandidatePayload(payload = {}, { partial = false } = {}) {
  const fullName = normalizeOptionalText(payload.fullName);

  if (!partial && !fullName) {
    throw new PortalTalentosError(400, 'fullName e obrigatorio.');
  }

  const cpf = normalizeOptionalText(payload.cpf);

  return {
    fullName,
    cpf,
    cpfNormalized: normalizeCpf(cpf),
    whatsapp: normalizeOptionalText(payload.whatsapp),
    email: normalizeOptionalText(payload.email),
    city: normalizeOptionalText(payload.city),
    neighborhood: normalizeOptionalText(payload.neighborhood),
    category: normalizeOptionalText(payload.category),
    status: normalizeOptionalText(payload.status) || 'novo',
    priority: normalizeOptionalText(payload.priority),
    opportunityProfile: normalizeJsonObject(payload.opportunityProfile, 'opportunityProfile'),
    rawPayload: normalizeJsonObject(payload.rawPayload, 'rawPayload'),
  };
}

async function listCandidates(filters = {}) {
  const rows = await selectCandidates({
    search: normalizeOptionalText(filters.search),
    cpfNormalized: normalizeCpf(filters.cpf),
    category: normalizeOptionalText(filters.category),
    status: normalizeOptionalText(filters.status),
  });

  return rows.map(toCandidateResponse);
}

async function getCandidateById(id) {
  assertValidId(id);

  const row = await findCandidateById(id);
  if (!row) {
    throw new PortalTalentosError(404, 'Candidato nao encontrado.');
  }

  return toCandidateResponse(row);
}

async function getCandidateByCpf(cpf) {
  const cpfNormalized = normalizeCpf(cpf);
  if (!cpfNormalized) {
    throw new PortalTalentosError(400, 'CPF invalido.');
  }

  const row = await findCandidateByCpfNormalized(cpfNormalized);
  if (!row) {
    throw new PortalTalentosError(404, 'Candidato nao encontrado.');
  }

  return toCandidateResponse(row);
}

async function ensureCpfAvailable(cpfNormalized, currentCandidateId = null) {
  if (!cpfNormalized) return;

  const existing = await findCandidateByCpfNormalized(cpfNormalized);
  if (existing && existing.id !== currentCandidateId) {
    throw new PortalTalentosError(409, 'Ja existe candidato cadastrado com este CPF.');
  }
}

async function createCandidate(payload = {}) {
  const candidate = normalizeCandidatePayload(payload);

  await ensureCpfAvailable(candidate.cpfNormalized);

  try {
    const row = await insertCandidate(candidate);
    return toCandidateResponse(row);
  } catch (error) {
    if (error.code === '23505') {
      throw new PortalTalentosError(409, 'Ja existe candidato cadastrado com dados unicos informados.');
    }
    throw error;
  }
}

async function updateCandidate(id, payload = {}) {
  assertValidId(id);

  const current = await findCandidateById(id);
  if (!current) {
    throw new PortalTalentosError(404, 'Candidato nao encontrado.');
  }

  const candidate = normalizeCandidatePayload({
    fullName: Object.prototype.hasOwnProperty.call(payload, 'fullName') ? payload.fullName : current.full_name,
    cpf: Object.prototype.hasOwnProperty.call(payload, 'cpf') ? payload.cpf : current.cpf,
    whatsapp: Object.prototype.hasOwnProperty.call(payload, 'whatsapp') ? payload.whatsapp : current.whatsapp,
    email: Object.prototype.hasOwnProperty.call(payload, 'email') ? payload.email : current.email,
    city: Object.prototype.hasOwnProperty.call(payload, 'city') ? payload.city : current.city,
    neighborhood: Object.prototype.hasOwnProperty.call(payload, 'neighborhood') ? payload.neighborhood : current.neighborhood,
    category: Object.prototype.hasOwnProperty.call(payload, 'category') ? payload.category : current.category,
    status: Object.prototype.hasOwnProperty.call(payload, 'status') ? payload.status : current.status,
    priority: Object.prototype.hasOwnProperty.call(payload, 'priority') ? payload.priority : current.priority,
    opportunityProfile: Object.prototype.hasOwnProperty.call(payload, 'opportunityProfile')
      ? payload.opportunityProfile
      : current.opportunity_profile,
    rawPayload: Object.prototype.hasOwnProperty.call(payload, 'rawPayload') ? payload.rawPayload : current.raw_payload,
  });

  await ensureCpfAvailable(candidate.cpfNormalized, id);

  try {
    const row = await updateCandidateRow(id, candidate);
    return toCandidateResponse(row);
  } catch (error) {
    if (error.code === '23505') {
      throw new PortalTalentosError(409, 'Ja existe candidato cadastrado com dados unicos informados.');
    }
    throw error;
  }
}

async function updateOpportunityProfile(id, payload = {}) {
  assertValidId(id);

  if (!Object.prototype.hasOwnProperty.call(payload, 'opportunityProfile')) {
    throw new PortalTalentosError(400, 'opportunityProfile e obrigatorio.');
  }

  const opportunityProfile = normalizeJsonObject(payload.opportunityProfile, 'opportunityProfile');
  const row = await updateCandidateOpportunityProfile(id, opportunityProfile);

  if (!row) {
    throw new PortalTalentosError(404, 'Candidato nao encontrado.');
  }

  return toCandidateResponse(row);
}

async function deleteCandidate(id, dbClient = null) {
  assertValidId(id);

  const current = await findCandidateById(id, dbClient);
  if (!current) {
    throw new PortalTalentosError(404, 'Candidato nao encontrado.');
  }

  const linkedApplications = await countApplicationsByCandidateId(id, dbClient);
  if (linkedApplications > 0) {
    throw new PortalTalentosError(
      409,
      'Não é possível excluir este candidato porque existem candidaturas vinculadas. Remova as candidaturas primeiro.'
    );
  }

  const deleted = await deleteCandidateById(id, dbClient);
  if (!deleted) {
    throw new PortalTalentosError(404, 'Candidato nao encontrado.');
  }

  return {
    ok: true,
    deleted: true,
    id: deleted.id,
  };
}

module.exports = {
  createCandidate,
  deleteCandidate,
  getCandidateByCpf,
  getCandidateById,
  getCandidatesHealth,
  listCandidates,
  updateCandidate,
  updateOpportunityProfile,
};
