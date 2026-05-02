const pool = require('../../../db');

const OPPORTUNITY_COLUMNS = `
  id,
  legacy_id,
  title,
  internal_name,
  category,
  location,
  start_date,
  end_date,
  status,
  public_visibility,
  summary,
  training,
  schedule,
  operation_description,
  rules,
  structure,
  benefits,
  desired_profile,
  alert_message,
  payment_info,
  group_link,
  internal_notes,
  raw_payload,
  created_at,
  updated_at
`;

function getDb(dbClient) {
  return dbClient || pool;
}

async function listOpportunities(filters = {}, dbClient = null) {
  const db = getDb(dbClient);
  const where = [];
  const values = [];

  if (filters.search) {
    values.push(`%${filters.search}%`);
    where.push(`(
      title ILIKE $${values.length}
      OR internal_name ILIKE $${values.length}
      OR category ILIKE $${values.length}
      OR location ILIKE $${values.length}
      OR summary ILIKE $${values.length}
    )`);
  }

  if (filters.category) {
    values.push(filters.category);
    where.push(`category = $${values.length}`);
  }

  if (filters.status) {
    values.push(filters.status);
    where.push(`status = $${values.length}`);
  }

  if (filters.publicVisibility) {
    values.push(filters.publicVisibility);
    where.push(`public_visibility = $${values.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await db.query(
    `
    SELECT ${OPPORTUNITY_COLUMNS}
    FROM portal_talentos_opportunities
    ${whereClause}
    ORDER BY created_at DESC, title ASC
    `,
    values
  );

  return result.rows;
}

async function listPublicOpportunities(dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    SELECT ${OPPORTUNITY_COLUMNS}
    FROM portal_talentos_opportunities
    WHERE status = 'inscricoes_abertas'
      AND public_visibility = 'visivel'
    ORDER BY created_at DESC, title ASC
    `
  );

  return result.rows;
}

async function findOpportunityById(id, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    SELECT ${OPPORTUNITY_COLUMNS}
    FROM portal_talentos_opportunities
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function findOpportunityByLegacyId(legacyId, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    SELECT ${OPPORTUNITY_COLUMNS}
    FROM portal_talentos_opportunities
    WHERE legacy_id = $1
    LIMIT 1
    `,
    [legacyId]
  );

  return result.rows[0] || null;
}

async function createOpportunity(opportunity, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    INSERT INTO portal_talentos_opportunities (
      legacy_id,
      title,
      internal_name,
      category,
      location,
      start_date,
      end_date,
      status,
      public_visibility,
      summary,
      training,
      schedule,
      operation_description,
      rules,
      structure,
      benefits,
      desired_profile,
      alert_message,
      payment_info,
      group_link,
      internal_notes,
      raw_payload
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      COALESCE($8, 'inscricoes_abertas'),
      COALESCE($9, 'visivel'),
      $10, $11, $12::jsonb, $13, $14::jsonb, $15::jsonb, $16::jsonb,
      $17::jsonb, $18, $19::jsonb, $20, $21, $22::jsonb
    )
    RETURNING ${OPPORTUNITY_COLUMNS}
    `,
    [
      opportunity.legacyId,
      opportunity.title,
      opportunity.internalName,
      opportunity.category,
      opportunity.location,
      opportunity.startDate,
      opportunity.endDate,
      opportunity.status,
      opportunity.publicVisibility,
      opportunity.summary,
      opportunity.training,
      JSON.stringify(opportunity.schedule || {}),
      opportunity.operationDescription,
      JSON.stringify(opportunity.rules || []),
      JSON.stringify(opportunity.structure || []),
      JSON.stringify(opportunity.benefits || []),
      JSON.stringify(opportunity.desiredProfile || []),
      opportunity.alertMessage,
      JSON.stringify(opportunity.paymentInfo || {}),
      opportunity.groupLink,
      opportunity.internalNotes,
      JSON.stringify(opportunity.rawPayload || {}),
    ]
  );

  return result.rows[0];
}

async function updateOpportunity(id, opportunity, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    UPDATE portal_talentos_opportunities
    SET
      legacy_id = $1,
      title = $2,
      internal_name = $3,
      category = $4,
      location = $5,
      start_date = $6,
      end_date = $7,
      status = COALESCE($8, 'inscricoes_abertas'),
      public_visibility = COALESCE($9, 'visivel'),
      summary = $10,
      training = $11,
      schedule = $12::jsonb,
      operation_description = $13,
      rules = $14::jsonb,
      structure = $15::jsonb,
      benefits = $16::jsonb,
      desired_profile = $17::jsonb,
      alert_message = $18,
      payment_info = $19::jsonb,
      group_link = $20,
      internal_notes = $21,
      raw_payload = $22::jsonb,
      updated_at = NOW()
    WHERE id = $23
    RETURNING ${OPPORTUNITY_COLUMNS}
    `,
    [
      opportunity.legacyId,
      opportunity.title,
      opportunity.internalName,
      opportunity.category,
      opportunity.location,
      opportunity.startDate,
      opportunity.endDate,
      opportunity.status,
      opportunity.publicVisibility,
      opportunity.summary,
      opportunity.training,
      JSON.stringify(opportunity.schedule || {}),
      opportunity.operationDescription,
      JSON.stringify(opportunity.rules || []),
      JSON.stringify(opportunity.structure || []),
      JSON.stringify(opportunity.benefits || []),
      JSON.stringify(opportunity.desiredProfile || []),
      opportunity.alertMessage,
      JSON.stringify(opportunity.paymentInfo || {}),
      opportunity.groupLink,
      opportunity.internalNotes,
      JSON.stringify(opportunity.rawPayload || {}),
      id,
    ]
  );

  return result.rows[0] || null;
}

async function updateOpportunityStatus(id, status, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    UPDATE portal_talentos_opportunities
    SET status = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING ${OPPORTUNITY_COLUMNS}
    `,
    [status, id]
  );

  return result.rows[0] || null;
}

async function updateOpportunityVisibility(id, publicVisibility, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    UPDATE portal_talentos_opportunities
    SET public_visibility = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING ${OPPORTUNITY_COLUMNS}
    `,
    [publicVisibility, id]
  );

  return result.rows[0] || null;
}

async function countApplicationsByOpportunityId(opportunityId, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    SELECT COUNT(*)::int AS total
    FROM portal_talentos_applications
    WHERE opportunity_id = $1
    `,
    [opportunityId]
  );

  return result.rows[0]?.total || 0;
}

async function deleteOpportunityById(id, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    DELETE FROM portal_talentos_opportunities
    WHERE id = $1
    RETURNING id
    `,
    [id]
  );

  return result.rows[0] || null;
}

module.exports = {
  countApplicationsByOpportunityId,
  createOpportunity,
  deleteOpportunityById,
  findOpportunityById,
  findOpportunityByLegacyId,
  listOpportunities,
  listPublicOpportunities,
  updateOpportunity,
  updateOpportunityStatus,
  updateOpportunityVisibility,
};
