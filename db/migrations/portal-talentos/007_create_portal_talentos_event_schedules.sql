-- Migration: 007_create_portal_talentos_event_schedules
-- Objetivo: criar a tabela de escalas diarias dos membros de equipe em eventos.
-- Status: arquivo para revisao; nao executar automaticamente no startup.

CREATE TABLE IF NOT EXISTS portal_talentos_event_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES portal_talentos_events(id) ON DELETE RESTRICT,
  team_member_id UUID NOT NULL REFERENCES portal_talentos_event_team_members(id) ON DELETE RESTRICT,
  work_date DATE NOT NULL,
  role TEXT,
  scheduled_status TEXT DEFAULT 'escalado',
  expected_arrival_time TEXT,
  expected_start_time TEXT,
  expected_end_time TEXT,
  expected_exit_time TEXT,
  is_paid_day BOOLEAN DEFAULT TRUE,
  notes TEXT,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT portal_talentos_event_schedules_event_member_date_unique UNIQUE (event_id, team_member_id, work_date)
);
