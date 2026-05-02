-- Migration: 003_create_portal_talentos_applications
-- Objetivo: criar a tabela de candidaturas a oportunidades do Portal Talentos HDL.
-- Status: arquivo para revisao; nao executar automaticamente no startup.

CREATE TABLE IF NOT EXISTS portal_talentos_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id TEXT UNIQUE,
  opportunity_id UUID REFERENCES portal_talentos_opportunities(id) ON DELETE RESTRICT,
  candidate_id UUID REFERENCES portal_talentos_candidates(id) ON DELETE RESTRICT,
  candidate_cpf TEXT,
  candidate_cpf_normalized TEXT,
  status TEXT DEFAULT 'candidatura_iniciada',
  current_stage TEXT,
  accepted_terms BOOLEAN DEFAULT FALSE,
  virtual_selection JSONB DEFAULT '{}'::jsonb,
  evaluation JSONB DEFAULT '{}'::jsonb,
  communication JSONB DEFAULT '{}'::jsonb,
  status_history JSONB DEFAULT '[]'::jsonb,
  ready_for_event BOOLEAN DEFAULT FALSE,
  internal_notes TEXT,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_talentos_applications_unique_candidate_opportunity
ON portal_talentos_applications(opportunity_id, candidate_id)
WHERE candidate_id IS NOT NULL;
