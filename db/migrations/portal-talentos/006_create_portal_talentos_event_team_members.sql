-- Migration: 006_create_portal_talentos_event_team_members
-- Objetivo: criar a tabela de equipe vinculada aos eventos do Portal Talentos HDL.
-- Status: arquivo para revisao; nao executar automaticamente no startup.

CREATE TABLE IF NOT EXISTS portal_talentos_event_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES portal_talentos_events(id) ON DELETE RESTRICT,
  candidate_id UUID NOT NULL REFERENCES portal_talentos_candidates(id) ON DELETE RESTRICT,
  application_id UUID REFERENCES portal_talentos_applications(id) ON DELETE SET NULL,
  role TEXT,
  team_type TEXT DEFAULT 'titular',
  status TEXT DEFAULT 'ativo',
  daily_rate NUMERIC(10,2),
  expected_work_days INTEGER,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  notes TEXT,
  uniform_items JSONB DEFAULT '[]'::jsonb,
  materials JSONB DEFAULT '[]'::jsonb,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT portal_talentos_event_team_members_event_candidate_unique UNIQUE (event_id, candidate_id)
);
