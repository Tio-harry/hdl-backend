-- Migration: 004_create_portal_talentos_application_indexes
-- Objetivo: criar indices de apoio para consultas do Portal Talentos HDL.
-- Status: arquivo para revisao; nao executar automaticamente no startup.

-- Observacao: portal_talentos_candidates.cpf_normalized ja possui UNIQUE,
-- portanto o PostgreSQL cria indice unico automaticamente para esse campo.

CREATE INDEX IF NOT EXISTS idx_portal_talentos_candidates_email
ON portal_talentos_candidates(email);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_candidates_category
ON portal_talentos_candidates(category);

-- Observacao: portal_talentos_opportunities.legacy_id ja possui UNIQUE,
-- portanto o PostgreSQL cria indice unico automaticamente para esse campo.

CREATE INDEX IF NOT EXISTS idx_portal_talentos_opportunities_status
ON portal_talentos_opportunities(status);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_opportunities_public_visibility
ON portal_talentos_opportunities(public_visibility);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_opportunities_category
ON portal_talentos_opportunities(category);

-- Observacao: portal_talentos_applications.legacy_id ja possui UNIQUE,
-- portanto o PostgreSQL cria indice unico automaticamente para esse campo.

CREATE INDEX IF NOT EXISTS idx_portal_talentos_applications_opportunity_id
ON portal_talentos_applications(opportunity_id);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_applications_candidate_id
ON portal_talentos_applications(candidate_id);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_applications_status
ON portal_talentos_applications(status);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_applications_ready_for_event
ON portal_talentos_applications(ready_for_event);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_applications_candidate_cpf_normalized
ON portal_talentos_applications(candidate_cpf_normalized);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_applications_opportunity_status
ON portal_talentos_applications(opportunity_id, status);
