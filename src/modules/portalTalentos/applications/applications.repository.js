const pool = require('../../../db');

const APPLICATION_COLUMNS = `
  id,
  legacy_id,
  opportunity_id,
  candidate_id,
  candidate_cpf,
  candidate_cpf_normalized,
  status,
  current_stage,
  accepted_terms,
  virtual_selection,
  evaluation,
  communication,
  status_history,
  ready_for_event,
  internal_notes,
  raw_payload,
  created_at,
  updated_at
`;

function getDb(dbClient) {
  return dbClient || pool;
}

async function listApplications(filters = {}, dbClient = null) {
  const db = getDb(dbClient);
  const where = [];
  const values = [];

  if (filters.status) {
    values.push(filters.status);
    where.push(`status = $${values.length}`);
  }

  if (filters.opportunityId) {
    values.push(filters.opportunityId);
    where.push(`opportunity_id = $${values.length}`);
  }

  if (filters.candidateId) {
    values.push(filters.candidateId);
    where.push(`candidate_id = $${values.length}`);
  }

  if (filters.cpfNormalized) {
    values.push(filters.cpfNormalized);
    where.push(`candidate_cpf_normalized = $${values.length}`);
  }

  if (filters.readyForEvent !== null && filters.readyForEvent !== undefined) {
    values.push(filters.readyForEvent);
    where.push(`ready_for_event = $${values.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await db.query(
    `
    SELECT ${APPLICATION_COLUMNS}
    FROM portal_talentos_applications
    ${whereClause}
    ORDER BY created_at DESC, id DESC
    `,
    values
  );

  return result.rows;
}

async function findApplicationById(id, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    SELECT ${APPLICATION_COLUMNS}
    FROM portal_talentos_applications
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function listApplicationsByCandidate(candidateId, dbClient = null) {
  return listApplications({ candidateId }, dbClient);
}

async function listApplicationsByOpportunity(opportunityId, dbClient = null) {
  return listApplications({ opportunityId }, dbClient);
}

async function findApplicationByOpportunityAndCandidate(opportunityId, candidateId, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    SELECT ${APPLICATION_COLUMNS}
    FROM portal_talentos_applications
    WHERE opportunity_id = $1
      AND candidate_id = $2
    LIMIT 1
    `,
    [opportunityId, candidateId]
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

async function candidateExists(candidateId, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    'SELECT id FROM portal_talentos_candidates WHERE id = $1 LIMIT 1',
    [candidateId]
  );
  return result.rowCount > 0;
}

async function createApplication(application, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    INSERT INTO portal_talentos_applications (
      legacy_id,
      opportunity_id,
      candidate_id,
      candidate_cpf,
      candidate_cpf_normalized,
      status,
      current_stage,
      accepted_terms,
      virtual_selection,
      evaluation,
      communication,
      status_history,
      ready_for_event,
      internal_notes,
      raw_payload
    )
    VALUES (
      $1, $2, $3, $4, $5, COALESCE($6, 'candidatura_iniciada'), $7,
      COALESCE($8, false), $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb,
      COALESCE($13, false), $14, $15::jsonb
    )
    RETURNING ${APPLICATION_COLUMNS}
    `,
    [
      application.legacyId,
      application.opportunityId,
      application.candidateId,
      application.candidateCpf,
      application.candidateCpfNormalized,
      application.status,
      application.currentStage,
      application.acceptedTerms,
      JSON.stringify(application.virtualSelection || {}),
      JSON.stringify(application.evaluation || {}),
      JSON.stringify(application.communication || {}),
      JSON.stringify(application.statusHistory || []),
      application.readyForEvent,
      application.internalNotes,
      JSON.stringify(application.rawPayload || {}),
    ]
  );

  return result.rows[0];
}

async function updateApplication(id, application, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    UPDATE portal_talentos_applications
    SET
      legacy_id = $1,
      candidate_cpf = $2,
      candidate_cpf_normalized = $3,
      status = COALESCE($4, 'candidatura_iniciada'),
      current_stage = $5,
      accepted_terms = COALESCE($6, false),
      virtual_selection = $7::jsonb,
      evaluation = $8::jsonb,
      communication = $9::jsonb,
      status_history = $10::jsonb,
      ready_for_event = COALESCE($11, false),
      internal_notes = $12,
      raw_payload = $13::jsonb,
      updated_at = NOW()
    WHERE id = $14
    RETURNING ${APPLICATION_COLUMNS}
    `,
    [
      application.legacyId,
      application.candidateCpf,
      application.candidateCpfNormalized,
      application.status,
      application.currentStage,
      application.acceptedTerms,
      JSON.stringify(application.virtualSelection || {}),
      JSON.stringify(application.evaluation || {}),
      JSON.stringify(application.communication || {}),
      JSON.stringify(application.statusHistory || []),
      application.readyForEvent,
      application.internalNotes,
      JSON.stringify(application.rawPayload || {}),
      id,
    ]
  );

  return result.rows[0] || null;
}

async function deleteApplicationById(id, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    DELETE FROM portal_talentos_applications
    WHERE id = $1
    RETURNING id
    `,
    [id]
  );

  return result.rows[0] || null;
}

module.exports = {
  candidateExists,
  createApplication,
  deleteApplicationById,
  findApplicationById,
  findApplicationByOpportunityAndCandidate,
  listApplications,
  listApplicationsByCandidate,
  listApplicationsByOpportunity,
  opportunityExists,
  updateApplication,
};
