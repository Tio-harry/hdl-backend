-- Migration: 002_create_portal_talentos_opportunities
-- Objetivo: criar a tabela de oportunidades do Portal Talentos HDL.
-- Status: arquivo para revisao; nao executar automaticamente no startup.

CREATE TABLE IF NOT EXISTS portal_talentos_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id TEXT UNIQUE,
  title TEXT NOT NULL,
  internal_name TEXT,
  category TEXT,
  location TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT DEFAULT 'inscricoes_abertas',
  public_visibility TEXT DEFAULT 'visivel',
  summary TEXT,
  training TEXT,
  schedule JSONB DEFAULT '{}'::jsonb,
  operation_description TEXT,
  rules JSONB DEFAULT '[]'::jsonb,
  structure JSONB DEFAULT '[]'::jsonb,
  benefits JSONB DEFAULT '[]'::jsonb,
  desired_profile JSONB DEFAULT '[]'::jsonb,
  alert_message TEXT,
  payment_info JSONB DEFAULT '{}'::jsonb,
  group_link TEXT,
  internal_notes TEXT,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
