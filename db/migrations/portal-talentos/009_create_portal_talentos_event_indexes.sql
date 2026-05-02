-- Migration: 009_create_portal_talentos_event_indexes
-- Objetivo: criar indices de apoio para consultas operacionais de eventos.
-- Status: arquivo para revisao; nao executar automaticamente no startup.

CREATE INDEX IF NOT EXISTS idx_portal_talentos_events_opportunity_id
ON portal_talentos_events(opportunity_id);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_events_status
ON portal_talentos_events(status);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_events_start_date
ON portal_talentos_events(start_date);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_events_end_date
ON portal_talentos_events(end_date);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_event_team_members_event_id
ON portal_talentos_event_team_members(event_id);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_event_team_members_candidate_id
ON portal_talentos_event_team_members(candidate_id);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_event_team_members_application_id
ON portal_talentos_event_team_members(application_id);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_event_team_members_team_type
ON portal_talentos_event_team_members(team_type);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_event_team_members_status
ON portal_talentos_event_team_members(status);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_event_schedules_event_id
ON portal_talentos_event_schedules(event_id);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_event_schedules_team_member_id
ON portal_talentos_event_schedules(team_member_id);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_event_schedules_work_date
ON portal_talentos_event_schedules(work_date);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_event_schedules_scheduled_status
ON portal_talentos_event_schedules(scheduled_status);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_event_attendance_event_id
ON portal_talentos_event_attendance(event_id);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_event_attendance_team_member_id
ON portal_talentos_event_attendance(team_member_id);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_event_attendance_schedule_id
ON portal_talentos_event_attendance(schedule_id);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_event_attendance_work_date
ON portal_talentos_event_attendance(work_date);

CREATE INDEX IF NOT EXISTS idx_portal_talentos_event_attendance_status
ON portal_talentos_event_attendance(attendance_status);
