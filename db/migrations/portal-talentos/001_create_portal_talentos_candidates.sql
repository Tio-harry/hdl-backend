-- Migration: 001_create_portal_talentos_candidates
-- Objetivo: criar a tabela base de candidatos do Portal Talentos HDL.
-- Status: arquivo para revisao; nao executar automaticamente no startup.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS portal_talentos_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  cpf TEXT,
  cpf_normalized TEXT UNIQUE,
  whatsapp TEXT,
  email TEXT,
  city TEXT,
  neighborhood TEXT,
  category TEXT,
  status TEXT DEFAULT 'novo',
  priority TEXT,
  opportunity_profile JSONB DEFAULT '{}'::jsonb,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
