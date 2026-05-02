const pool = require('../../../db');

const EVENT_COLUMNS = `
  id,
  opportunity_id,
  legacy_id,
  name,
  internal_name,
  category,
  location,
  start_date,
  end_date,
  status,
  default_role,
  default_arrival_time,
  default_start_time,
  default_end_time,
  default_exit_time,
  default_break_minutes,
  description,
  rules,
  settings,
  internal_notes,
  raw_payload,
  created_at,
  updated_at
`;

function getDb(dbClient) {
  return dbClient || pool;
}

async function listEvents(filters = {}, dbClient = null) {
  const db = getDb(dbClient);
  const where = [];
  const values = [];

  if (filters.search) {
    values.push(`%${filters.search}%`);
    where.push(`(
      name ILIKE $${values.length}
      OR internal_name ILIKE $${values.length}
      OR category ILIKE $${values.length}
      OR location ILIKE $${values.length}
      OR description ILIKE $${values.length}
    )`);
  }

  if (filters.status) {
    values.push(filters.status);
    where.push(`status = $${values.length}`);
  }

  if (filters.category) {
    values.push(filters.category);
    where.push(`category = $${values.length}`);
  }

  if (filters.opportunityId) {
    values.push(filters.opportunityId);
    where.push(`opportunity_id = $${values.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await db.query(
    `
    SELECT ${EVENT_COLUMNS}
    FROM portal_talentos_events
    ${whereClause}
    ORDER BY start_date ASC NULLS LAST, created_at DESC, name ASC
    `,
    values
  );

  return result.rows;
}

async function findEventById(id, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    SELECT ${EVENT_COLUMNS}
    FROM portal_talentos_events
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function findEventByLegacyId(legacyId, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    SELECT ${EVENT_COLUMNS}
    FROM portal_talentos_events
    WHERE legacy_id = $1
    LIMIT 1
    `,
    [legacyId]
  );

  return result.rows[0] || null;
}

async function opportunityExists(opportunityId, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    'SELECT id FROM portal_talentos_opportunities WHERE id = $1 LIMIT 1',
    [opportunityId]
  );
  return result.rowCount > 0;
}

async function createEvent(event, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    INSERT INTO portal_talentos_events (
      opportunity_id,
      legacy_id,
      name,
      internal_name,
      category,
      location,
      start_date,
      end_date,
      status,
      default_role,
      default_arrival_time,
      default_start_time,
      default_end_time,
      default_exit_time,
      default_break_minutes,
      description,
      rules,
      settings,
      internal_notes,
      raw_payload
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7::date, $8::date, COALESCE($9, 'planejamento'),
      $10, $11, $12, $13, $14, COALESCE($15, 60), $16, $17::jsonb, $18::jsonb, $19, $20::jsonb
    )
    RETURNING ${EVENT_COLUMNS}
    `,
    [
      event.opportunityId,
      event.legacyId,
      event.name,
      event.internalName,
      event.category,
      event.location,
      event.startDate,
      event.endDate,
      event.status,
      event.defaultRole,
      event.defaultArrivalTime,
      event.defaultStartTime,
      event.defaultEndTime,
      event.defaultExitTime,
      event.defaultBreakMinutes,
      event.description,
      JSON.stringify(event.rules || []),
      JSON.stringify(event.settings || {}),
      event.internalNotes,
      JSON.stringify(event.rawPayload || {}),
    ]
  );

  return result.rows[0];
}

async function updateEvent(id, event, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    UPDATE portal_talentos_events
    SET
      opportunity_id = $1,
      legacy_id = $2,
      name = $3,
      internal_name = $4,
      category = $5,
      location = $6,
      start_date = $7::date,
      end_date = $8::date,
      status = COALESCE($9, 'planejamento'),
      default_role = $10,
      default_arrival_time = $11,
      default_start_time = $12,
      default_end_time = $13,
      default_exit_time = $14,
      default_break_minutes = COALESCE($15, 60),
      description = $16,
      rules = $17::jsonb,
      settings = $18::jsonb,
      internal_notes = $19,
      raw_payload = $20::jsonb,
      updated_at = NOW()
    WHERE id = $21
    RETURNING ${EVENT_COLUMNS}
    `,
    [
      event.opportunityId,
      event.legacyId,
      event.name,
      event.internalName,
      event.category,
      event.location,
      event.startDate,
      event.endDate,
      event.status,
      event.defaultRole,
      event.defaultArrivalTime,
      event.defaultStartTime,
      event.defaultEndTime,
      event.defaultExitTime,
      event.defaultBreakMinutes,
      event.description,
      JSON.stringify(event.rules || []),
      JSON.stringify(event.settings || {}),
      event.internalNotes,
      JSON.stringify(event.rawPayload || {}),
      id,
    ]
  );

  return result.rows[0] || null;
}

async function updateEventStatus(id, status, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    UPDATE portal_talentos_events
    SET status = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING ${EVENT_COLUMNS}
    `,
    [status, id]
  );

  return result.rows[0] || null;
}

async function countOperationalLinks(eventId, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    SELECT
      (SELECT COUNT(*)::int FROM portal_talentos_event_team_members WHERE event_id = $1) AS team_members,
      (SELECT COUNT(*)::int FROM portal_talentos_event_schedules WHERE event_id = $1) AS schedules,
      (SELECT COUNT(*)::int FROM portal_talentos_event_attendance WHERE event_id = $1) AS attendance
    `,
    [eventId]
  );

  return result.rows[0] || { team_members: 0, schedules: 0, attendance: 0 };
}

async function deleteEventById(id, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    DELETE FROM portal_talentos_events
    WHERE id = $1
    RETURNING id
    `,
    [id]
  );

  return result.rows[0] || null;
}

module.exports = {
  countOperationalLinks,
  createEvent,
  deleteEventById,
  findEventById,
  findEventByLegacyId,
  listEvents,
  opportunityExists,
  updateEvent,
  updateEventStatus,
};
