function normalizeCpf(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/\D/g, '');
  return normalized || null;
}

function normalizeOptionalText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeJsonObject(value, fieldName) {
  if (value === null || value === undefined || value === '') return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;

  const error = new Error(`${fieldName} deve ser um objeto JSON.`);
  error.statusCode = 400;
  throw error;
}

function normalizeJsonValue(value, defaultValue, fieldName) {
  if (value === null || value === undefined || value === '') return defaultValue;
  if (typeof value === 'object') return value;

  const error = new Error(`${fieldName} deve ser JSON valido.`);
  error.statusCode = 400;
  throw error;
}

function toCandidateResponse(row) {
  if (!row) return null;

  return {
    id: row.id,
    fullName: row.full_name,
    cpf: row.cpf,
    cpfNormalized: row.cpf_normalized,
    whatsapp: row.whatsapp,
    email: row.email,
    city: row.city,
    neighborhood: row.neighborhood,
    category: row.category,
    status: row.status,
    priority: row.priority,
    opportunityProfile: row.opportunity_profile || {},
    rawPayload: row.raw_payload || {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

function toOpportunityResponse(row) {
  if (!row) return null;

  return {
    id: row.id,
    legacyId: row.legacy_id,
    title: row.title,
    internalName: row.internal_name,
    category: row.category,
    location: row.location,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    publicVisibility: row.public_visibility,
    summary: row.summary,
    training: row.training,
    schedule: row.schedule || {},
    operationDescription: row.operation_description,
    rules: row.rules || [],
    structure: row.structure || [],
    benefits: row.benefits || [],
    desiredProfile: row.desired_profile || [],
    alertMessage: row.alert_message,
    paymentInfo: row.payment_info || {},
    groupLink: row.group_link,
    internalNotes: row.internal_notes,
    rawPayload: row.raw_payload || {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

function toApplicationResponse(row) {
  if (!row) return null;

  return {
    id: row.id,
    legacyId: row.legacy_id,
    opportunityId: row.opportunity_id,
    candidateId: row.candidate_id,
    candidateCpf: row.candidate_cpf,
    candidateCpfNormalized: row.candidate_cpf_normalized,
    status: row.status,
    currentStage: row.current_stage,
    acceptedTerms: Boolean(row.accepted_terms),
    virtualSelection: row.virtual_selection || {},
    evaluation: row.evaluation || {},
    communication: row.communication || {},
    statusHistory: row.status_history || [],
    readyForEvent: Boolean(row.ready_for_event),
    internalNotes: row.internal_notes,
    rawPayload: row.raw_payload || {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

function formatDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toEventResponse(row) {
  if (!row) return null;

  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    legacyId: row.legacy_id,
    name: row.name,
    internalName: row.internal_name,
    category: row.category,
    location: row.location,
    startDate: formatDateOnly(row.start_date),
    endDate: formatDateOnly(row.end_date),
    status: row.status,
    defaultRole: row.default_role,
    defaultArrivalTime: row.default_arrival_time,
    defaultStartTime: row.default_start_time,
    defaultEndTime: row.default_end_time,
    defaultExitTime: row.default_exit_time,
    defaultBreakMinutes: row.default_break_minutes,
    description: row.description,
    rules: row.rules || [],
    settings: row.settings || {},
    internalNotes: row.internal_notes,
    rawPayload: row.raw_payload || {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

module.exports = {
  normalizeCpf,
  normalizeJsonObject,
  normalizeJsonValue,
  normalizeOptionalText,
  toApplicationResponse,
  toCandidateResponse,
  toEventResponse,
  toOpportunityResponse,
};
