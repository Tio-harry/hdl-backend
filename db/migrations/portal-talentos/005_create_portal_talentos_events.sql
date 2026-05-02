-- Migration: 005_create_portal_talentos_events
-- Objetivo: criar a tabela base de eventos do Portal Talentos HDL.
-- Status: arquivo para revisao; nao executar automaticamente no startup.

CREATE TABLE IF NOT EXISTS portal_talentos_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID REFERENCES portal_talentos_opportunities(id) ON DELETE SET NULL,
  legacy_id TEXT UNIQUE,
  name TEXT NOT NULL,
  internal_name TEXT,
  category TEXT,
  location TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'planejamento',
  default_role TEXT,
  default_arrival_time TEXT,
  default_start_time TEXT,
  default_end_time TEXT,
  default_exit_time TEXT,
  default_break_minutes INTEGER DEFAULT 60,
  description TEXT,
  rules JSONB DEFAULT '[]'::jsonb,
  settings JSONB DEFAULT '{}'::jsonb,
  internal_notes TEXT,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
