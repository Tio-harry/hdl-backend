# Manifesto de Migrations - Portal Talentos HDL

Este manifesto lista as migrations planejadas para o modulo Portal Talentos. Nenhum script desta lista deve ser considerado executado apenas por estar documentado aqui.

## Criadas para revisao

1. `001_create_portal_talentos_candidates.sql`
   - Criar tabela base de candidatos do Portal Talentos.

2. `002_create_portal_talentos_opportunities.sql`
   - Criar tabela de oportunidades administraveis e publicas.

3. `003_create_portal_talentos_applications.sql`
   - Criar tabela de candidaturas a oportunidades.

4. `004_create_portal_talentos_application_indexes.sql`
   - Criar indices e constraints complementares para candidaturas.

5. `005_create_portal_talentos_events.sql`
   - Criar tabela base de eventos operacionais do Portal Talentos.

6. `006_create_portal_talentos_event_team_members.sql`
   - Criar tabela de equipe vinculada aos eventos.

7. `007_create_portal_talentos_event_schedules.sql`
   - Criar tabela de escalas diarias por membro de equipe.

8. `008_create_portal_talentos_event_attendance.sql`
   - Criar tabela de presenca e registros diarios.

9. `009_create_portal_talentos_event_indexes.sql`
   - Criar indices de apoio para eventos, equipe, escalas e presenca.

## Planejadas para fases futuras

10. `010_create_portal_talentos_courses_future.sql`
   - Reservada para cursos, matriculas, progresso e certificados.

## Observacoes

- Os arquivos SQL 001 a 004 foram criados para revisao no Bloco 43.
- Os arquivos SQL 005 a 009 foram criados para revisao no Bloco 60 e ainda nao foram executados.
- Em eventos, `start_date` e `end_date` usam DATE por necessidade operacional; oportunidades seguem com datas em TEXT nesta fase.
- Os valores tecnicos persistidos em banco/API devem usar keys sem acento.
- Labels amigaveis, como "Inscricoes abertas" e "Visivel", devem ser responsabilidade do front.
- Nenhuma migration deste manifesto deve ser considerada executada sem registro operacional separado.
- A criacao das tabelas deve acontecer somente apos revisao do modelo fisico.
- A execucao deve ser feita de forma manual/controlada, nunca pelo startup do Express.
