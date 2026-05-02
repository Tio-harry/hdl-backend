-- Migration: 008_create_portal_talentos_event_attendance
-- Objetivo: criar a tabela de presenca diaria dos membros de equipe em eventos.
-- Status: arquivo para revisao; nao executar automaticamente no startup.

CREATE TABLE IF NOT EXISTS portal_talentos_event_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES portal_talentos_events(id) ON DELETE RESTRICT,
  schedule_id UUID REFERENCES portal_talentos_event_schedules(id) ON DELETE SET NULL,
  team_member_id UUID NOT NULL REFERENCES portal_talentos_event_team_members(id) ON DELETE RESTRICT,
  work_date DATE NOT NULL,
  attendance_status TEXT DEFAULT 'aguardando',
  expected_arrival_time TEXT,
  actual_arrival_time TEXT,
  checked_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  absence_reason TEXT,
  absence_type TEXT,
  quick_note TEXT,
  recorded_by TEXT,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT portal_talentos_event_attendance_event_member_date_unique UNIQUE (event_id, team_member_id, work_date)
);
