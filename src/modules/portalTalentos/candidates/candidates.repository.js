const pool = require('../../../db');

const CANDIDATE_COLUMNS = `
  id,
  full_name,
  cpf,
  cpf_normalized,
  whatsapp,
  email,
  city,
  neighborhood,
  category,
  status,
  priority,
  opportunity_profile,
  raw_payload,
  created_at,
  updated_at
`;

function getDb(dbClient) {
  return dbClient || pool;
}

async function listCandidates(filters = {}, dbClient = null) {
  const db = getDb(dbClient);
  const where = [];
  const values = [];

  if (filters.search) {
    values.push(`%${filters.search}%`);
    where.push(`(
      full_name ILIKE $${values.length}
      OR email ILIKE $${values.length}
      OR whatsapp ILIKE $${values.length}
      OR city ILIKE $${values.length}
    )`);
  }

  if (filters.cpfNormalized) {
    values.push(filters.cpfNormalized);
    where.push(`cpf_normalized = $${values.length}`);
  }

  if (filters.category) {
    values.push(filters.category);
    where.push(`category = $${values.length}`);
  }

  if (filters.status) {
    values.push(filters.status);
    where.push(`status = $${values.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await db.query(
    `
    SELECT ${CANDIDATE_COLUMNS}
    FROM portal_talentos_candidates
    ${whereClause}
    ORDER BY created_at DESC, full_name ASC
    `,
    values
  );

  return result.rows;
}

async function findCandidateById(id, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    SELECT ${CANDIDATE_COLUMNS}
    FROM portal_talentos_candidates
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function findCandidateByCpfNormalized(cpfNormalized, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    SELECT ${CANDIDATE_COLUMNS}
    FROM portal_talentos_candidates
    WHERE cpf_normalized = $1
    LIMIT 1
    `,
    [cpfNormalized]
  );

  return result.rows[0] || null;
}

async function createCandidate(candidate, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    INSERT INTO portal_talentos_candidates (
      full_name,
      cpf,
      cpf_normalized,
      whatsapp,
      email,
      city,
      neighborhood,
      category,
      status,
      priority,
      opportunity_profile,
      raw_payload
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'novo'), $10, $11::jsonb, $12::jsonb)
    RETURNING ${CANDIDATE_COLUMNS}
    `,
    [
      candidate.fullName,
      candidate.cpf,
      candidate.cpfNormalized,
      candidate.whatsapp,
      candidate.email,
      candidate.city,
      candidate.neighborhood,
      candidate.category,
      candidate.status,
      candidate.priority,
      JSON.stringify(candidate.opportunityProfile || {}),
      JSON.stringify(candidate.rawPayload || {}),
    ]
  );

  return result.rows[0];
}

async function updateCandidate(id, candidate, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    UPDATE portal_talentos_candidates
    SET
      full_name = $1,
      cpf = $2,
      cpf_normalized = $3,
      whatsapp = $4,
      email = $5,
      city = $6,
      neighborhood = $7,
      category = $8,
      status = COALESCE($9, 'novo'),
      priority = $10,
      opportunity_profile = $11::jsonb,
      raw_payload = $12::jsonb,
      updated_at = NOW()
    WHERE id = $13
    RETURNING ${CANDIDATE_COLUMNS}
    `,
    [
      candidate.fullName,
      candidate.cpf,
      candidate.cpfNormalized,
      candidate.whatsapp,
      candidate.email,
      candidate.city,
      candidate.neighborhood,
      candidate.category,
      candidate.status,
      candidate.priority,
      JSON.stringify(candidate.opportunityProfile || {}),
      JSON.stringify(candidate.rawPayload || {}),
      id,
    ]
  );

  return result.rows[0] || null;
}

async function updateCandidateOpportunityProfile(id, opportunityProfile, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    UPDATE portal_talentos_candidates
    SET
      opportunity_profile = $1::jsonb,
      updated_at = NOW()
    WHERE id = $2
    RETURNING ${CANDIDATE_COLUMNS}
    `,
    [JSON.stringify(opportunityProfile || {}), id]
  );

  return result.rows[0] || null;
}

async function countApplicationsByCandidateId(candidateId, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    SELECT COUNT(*)::int AS total
    FROM portal_talentos_applications
    WHERE candidate_id = $1
    `,
    [candidateId]
  );

  return result.rows[0]?.total || 0;
}

async function deleteCandidateById(id, dbClient = null) {
  const db = getDb(dbClient);
  const result = await db.query(
    `
    DELETE FROM portal_talentos_candidates
    WHERE id = $1
    RETURNING id
    `,
    [id]
  );

  return result.rows[0] || null;
}

module.exports = {
  countApplicationsByCandidateId,
  createCandidate,
  deleteCandidateById,
  findCandidateByCpfNormalized,
  findCandidateById,
  listCandidates,
  updateCandidate,
  updateCandidateOpportunityProfile,
};
