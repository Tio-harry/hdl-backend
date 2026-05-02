const {
  countOperationalLinks,
  createEvent: insertEvent,
  deleteEventById,
  findEventById,
  findEventByLegacyId,
  listEvents: selectEvents,
  opportunityExists,
  updateEvent: updateEventRow,
  updateEventStatus: updateEventStatusRow,
} = require('./events.repository');
const { PortalTalentosError } = require('../shared/errors');
const {
  normalizeJsonValue,
  normalizeOptionalText,
  toEventResponse,
} = require('../shared/normalize');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_STATUS = 'planejamento';

const ALLOWED_STATUSES = new Set([
  'planejamento',
  'equipe_em_formacao',
  'em_operacao',
  'encerrado',
  'cancelado',
]);

function getEventsHealth() {
  return {
    ok: true,
    module: 'portal-talentos',
    submodule: 'events',
  };
}

function assertValidUuid(value, fieldName) {
  if (!UUID_RE.test(String(value || ''))) {
    throw new PortalTalentosError(400, `${fieldName} invalido.`);
  }
}

function normalizeDate(value, fieldName) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  if (!DATE_RE.test(normalized)) {
    throw new PortalTalentosError(400, `${fieldName} deve estar no formato YYYY-MM-DD.`);
  }
  return normalized;
}

function normalizeStatus(value) {
  const status = normalizeOptionalText(value) || DEFAULT_STATUS;
  if (!ALLOWED_STATUSES.has(status)) {
    throw new PortalTalentosError(400, 'Status de evento invalido.');
  }
  return status;
}

function normalizeInteger(value, fieldName) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw new PortalTalentosError(400, `${fieldName} deve ser um numero inteiro.`);
  }
  return number;
}

function normalizeEventPayload(payload = {}, { requireName = false } = {}) {
  const name = normalizeOptionalText(payload.name);
  if (requireName && !name) {
    throw new PortalTalentosError(400, 'name e obrigatorio.');
  }

  const opportunityId = normalizeOptionalText(payload.opportunityId);
  if (opportunityId) {
    assertValidUuid(opportunityId, 'opportunityId');
  }

  const rules = normalizeJsonValue(payload.rules, [], 'rules');
  if (!Array.isArray(rules)) {
    throw new PortalTalentosError(400, 'rules deve ser um array.');
  }

  const settings = normalizeJsonValue(payload.settings, {}, 'settings');
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new PortalTalentosError(400, 'settings deve ser um objeto JSON.');
  }

  const rawPayload = normalizeJsonValue(payload.rawPayload, {}, 'rawPayload');
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    throw new PortalTalentosError(400, 'rawPayload deve ser um objeto JSON.');
  }

  return {
    opportunityId,
    legacyId: normalizeOptionalText(payload.legacyId),
    name,
    internalName: normalizeOptionalText(payload.internalName),
    category: normalizeOptionalText(payload.category),
    location: normalizeOptionalText(payload.location),
    startDate: normalizeDate(payload.startDate, 'startDate'),
    endDate: normalizeDate(payload.endDate, 'endDate'),
    status: normalizeStatus(payload.status),
    defaultRole: normalizeOptionalText(payload.defaultRole),
    defaultArrivalTime: normalizeOptionalText(payload.defaultArrivalTime),
    defaultStartTime: normalizeOptionalText(payload.defaultStartTime),
    defaultEndTime: normalizeOptionalText(payload.defaultEndTime),
    defaultExitTime: normalizeOptionalText(payload.defaultExitTime),
    defaultBreakMinutes: normalizeInteger(payload.defaultBreakMinutes, 'defaultBreakMinutes'),
    description: normalizeOptionalText(payload.description),
    rules,
    settings,
    internalNotes: normalizeOptionalText(payload.internalNotes),
    rawPayload,
  };
}

async function ensureOpportunityExistsIfProvided(opportunityId, dbClient = null) {
  if (!opportunityId) return;
  if (!(await opportunityExists(opportunityId, dbClient))) {
    throw new PortalTalentosError(404, 'Oportunidade nao encontrada.');
  }
}

async function ensureLegacyIdAvailable(legacyId, currentEventId = null, dbClient = null) {
  if (!legacyId) return;

  const existing = await findEventByLegacyId(legacyId, dbClient);
  if (existing && existing.id !== currentEventId) {
    throw new PortalTalentosError(409, 'Ja existe evento cadastrado com este legacyId.');
  }
}

async function listEvents(filters = {}, dbClient = null) {
  const opportunityId = normalizeOptionalText(filters.opportunityId);
  if (opportunityId) assertValidUuid(opportunityId, 'opportunityId');

  const status = normalizeOptionalText(filters.status);
  if (status && !ALLOWED_STATUSES.has(status)) {
    throw new PortalTalentosError(400, 'Status de evento invalido.');
  }

  const rows = await selectEvents({
    search: normalizeOptionalText(filters.search),
    status,
    category: normalizeOptionalText(filters.category),
    opportunityId,
  }, dbClient);

  return rows.map(toEventResponse);
}

async function getEventById(id, dbClient = null) {
  assertValidUuid(id, 'ID de evento');

  const row = await findEventById(id, dbClient);
  if (!row) {
    throw new PortalTalentosError(404, 'Evento nao encontrado.');
  }

  return toEventResponse(row);
}

async function createEvent(payload = {}, dbClient = null) {
  const event = normalizeEventPayload(payload, { requireName: true });

  await ensureOpportunityExistsIfProvided(event.opportunityId, dbClient);
  await ensureLegacyIdAvailable(event.legacyId, null, dbClient);

  try {
    const row = await insertEvent(event, dbClient);
    return toEventResponse(row);
  } catch (error) {
    if (error.code === '23505') {
      throw new PortalTalentosError(409, 'Ja existe evento cadastrado com dados unicos informados.');
    }
    throw error;
  }
}

function buildMergedPayload(current, payload) {
  return {
    opportunityId: Object.prototype.hasOwnProperty.call(payload, 'opportunityId')
      ? payload.opportunityId
      : current.opportunity_id,
    legacyId: Object.prototype.hasOwnProperty.call(payload, 'legacyId') ? payload.legacyId : current.legacy_id,
    name: Object.prototype.hasOwnProperty.call(payload, 'name') ? payload.name : current.name,
    internalName: Object.prototype.hasOwnProperty.call(payload, 'internalName')
      ? payload.internalName
      : current.internal_name,
    category: Object.prototype.hasOwnProperty.call(payload, 'category') ? payload.category : current.category,
    location: Object.prototype.hasOwnProperty.call(payload, 'location') ? payload.location : current.location,
    startDate: Object.prototype.hasOwnProperty.call(payload, 'startDate') ? payload.startDate : current.start_date,
    endDate: Object.prototype.hasOwnProperty.call(payload, 'endDate') ? payload.endDate : current.end_date,
    status: Object.prototype.hasOwnProperty.call(payload, 'status') ? payload.status : current.status,
    defaultRole: Object.prototype.hasOwnProperty.call(payload, 'defaultRole')
      ? payload.defaultRole
      : current.default_role,
    defaultArrivalTime: Object.prototype.hasOwnProperty.call(payload, 'defaultArrivalTime')
      ? payload.defaultArrivalTime
      : current.default_arrival_time,
    defaultStartTime: Object.prototype.hasOwnProperty.call(payload, 'defaultStartTime')
      ? payload.defaultStartTime
      : current.default_start_time,
    defaultEndTime: Object.prototype.hasOwnProperty.call(payload, 'defaultEndTime')
      ? payload.defaultEndTime
      : current.default_end_time,
    defaultExitTime: Object.prototype.hasOwnProperty.call(payload, 'defaultExitTime')
      ? payload.defaultExitTime
      : current.default_exit_time,
    defaultBreakMinutes: Object.prototype.hasOwnProperty.call(payload, 'defaultBreakMinutes')
      ? payload.defaultBreakMinutes
      : current.default_break_minutes,
    description: Object.prototype.hasOwnProperty.call(payload, 'description') ? payload.description : current.description,
    rules: Object.prototype.hasOwnProperty.call(payload, 'rules') ? payload.rules : current.rules,
    settings: Object.prototype.hasOwnProperty.call(payload, 'settings') ? payload.settings : current.settings,
    internalNotes: Object.prototype.hasOwnProperty.call(payload, 'internalNotes')
      ? payload.internalNotes
      : current.internal_notes,
    rawPayload: Object.prototype.hasOwnProperty.call(payload, 'rawPayload') ? payload.rawPayload : current.raw_payload,
  };
}

async function updateEvent(id, payload = {}, dbClient = null) {
  assertValidUuid(id, 'ID de evento');

  const current = await findEventById(id, dbClient);
  if (!current) {
    throw new PortalTalentosError(404, 'Evento nao encontrado.');
  }

  const event = normalizeEventPayload(buildMergedPayload(current, payload), { requireName: true });

  await ensureOpportunityExistsIfProvided(event.opportunityId, dbClient);
  await ensureLegacyIdAvailable(event.legacyId, id, dbClient);

  try {
    const row = await updateEventRow(id, event, dbClient);
    return toEventResponse(row);
  } catch (error) {
    if (error.code === '23505') {
      throw new PortalTalentosError(409, 'Ja existe evento cadastrado com dados unicos informados.');
    }
    throw error;
  }
}

async function updateStatus(id, payload = {}, dbClient = null) {
  assertValidUuid(id, 'ID de evento');

  if (!Object.prototype.hasOwnProperty.call(payload, 'status')) {
    throw new PortalTalentosError(400, 'status e obrigatorio.');
  }

  const status = normalizeStatus(payload.status);
  const row = await updateEventStatusRow(id, status, dbClient);

  if (!row) {
    throw new PortalTalentosError(404, 'Evento nao encontrado.');
  }

  return toEventResponse(row);
}

async function deleteEvent(id, dbClient = null) {
  assertValidUuid(id, 'ID de evento');

  const current = await findEventById(id, dbClient);
  if (!current) {
    throw new PortalTalentosError(404, 'Evento nao encontrado.');
  }

  const links = await countOperationalLinks(id, dbClient);
  const totalLinks = Number(links.team_members || 0) + Number(links.schedules || 0) + Number(links.attendance || 0);
  if (totalLinks > 0) {
    throw new PortalTalentosError(
      409,
      'Não é possível excluir este evento porque existem registros operacionais vinculados.'
    );
  }

  const deleted = await deleteEventById(id, dbClient);
  if (!deleted) {
    throw new PortalTalentosError(404, 'Evento nao encontrado.');
  }

  return {
    ok: true,
    deleted: true,
    id: deleted.id,
  };
}

module.exports = {
  createEvent,
  deleteEvent,
  getEventById,
  getEventsHealth,
  listEvents,
  updateEvent,
  updateStatus,
};
