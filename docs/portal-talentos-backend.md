# Portal Talentos HDL - Backend

Documento tecnico inicial para registrar as decisoes de arquitetura do modulo Portal Talentos no backend existente da Hora do Lazer.

## Modulo criado no Bloco 41

O modulo foi criado em:

```text
src/modules/portalTalentos/
```

Estrutura inicial:

```text
src/modules/portalTalentos/
  index.js
  portalTalentos.routes.js
  candidates/
  opportunities/
  applications/
```

O modulo foi registrado no Express principal com prefixo:

```text
/api/portal-talentos
```

## Health checks existentes

Rotas criadas no Bloco 41:

```text
GET /api/portal-talentos/health
GET /api/portal-talentos/candidates/health
GET /api/portal-talentos/opportunities/health
GET /api/portal-talentos/applications/health
```

Essas rotas validam apenas a arquitetura do modulo. Elas nao acessam banco e nao implementam regras de negocio.

## Decisao sobre migrations

Para o Portal Talentos, a decisao e usar SQL versionado e revisavel, em vez de criar tabelas automaticamente no runtime.

As migrations ficam em:

```text
db/migrations/portal-talentos/
```

Arquivos principais:

```text
README.md
MANIFEST.md
```

## Migrations SQL do Portal Talentos

Arquivos criados para revisao no Bloco 43:

```text
db/migrations/portal-talentos/001_create_portal_talentos_candidates.sql
db/migrations/portal-talentos/002_create_portal_talentos_opportunities.sql
db/migrations/portal-talentos/003_create_portal_talentos_applications.sql
db/migrations/portal-talentos/004_create_portal_talentos_application_indexes.sql
```

Esses arquivos sao a base oficial do modulo e ja podem estar aplicados conforme o ambiente. A confirmacao de aplicacao deve ser feita via tabela `portal_talentos_migrations` (runner abaixo), e nao apenas por leitura deste documento.

## Migrations SQL iniciais de Eventos

Arquivos criados para revisao no Bloco 60:

```text
db/migrations/portal-talentos/005_create_portal_talentos_events.sql
db/migrations/portal-talentos/006_create_portal_talentos_event_team_members.sql
db/migrations/portal-talentos/007_create_portal_talentos_event_schedules.sql
db/migrations/portal-talentos/008_create_portal_talentos_event_attendance.sql
db/migrations/portal-talentos/009_create_portal_talentos_event_indexes.sql
```

Essas migrations ainda nao foram executadas. Elas iniciam o eixo Eventos ja pelo backend, com base revisavel antes de qualquer rota ou tela.

Eventos sera o centro operacional diario. O funil de Oportunidades continua separado; candidatos em candidaturas com `ready_for_event = true` poderao ser vinculados aos eventos como membros de equipe.

O Painel do Dia dependera principalmente de:

```text
portal_talentos_event_schedules
portal_talentos_event_attendance
```

Financeiro, intervalos, substituicoes, relatorios e automacoes entram em ondas posteriores.

## Datas em oportunidades e eventos

Oportunidades mantem `start_date` e `end_date` como `TEXT` nesta fase para preservar compatibilidade com dados vindos do prototipo e do funil de selecao.

Eventos usa `DATE` em `start_date` e `end_date`, porque sera um eixo operacional. Essas datas serao base para gerar escala diaria, presenca, relatorios e financeiro por dia de operacao.

## Keys tecnicas

Valores salvos no banco e expostos pela API devem usar keys tecnicas sem acento. Textos amigaveis devem ser mapeados pelo front.

Status tecnicos de oportunidades:

```text
inscricoes_abertas
em_analise
selecao_virtual
selecao_presencial
equipe_em_formacao
equipe_fechada
encerrada
```

Visibilidade publica:

```text
visivel
ocultada
```

Exemplos de labels futuras no front:

```text
inscricoes_abertas = Inscricoes abertas
visivel = Visivel
```

Nesta fase, `start_date` e `end_date` permanecem como `TEXT` para preservar compatibilidade com dados do prototipo. A migration 001 mantem `CREATE EXTENSION IF NOT EXISTS pgcrypto` para suporte a `gen_random_uuid()`.

## Runner simples de migrations

O Bloco 44 adicionou um runner controlado em:

```text
scripts/runPortalTalentosMigrations.js
```

Para listar migrations pendentes:

```bash
npm run migrate:portal-talentos
```

Comando manual equivalente:

```bash
node scripts/runPortalTalentosMigrations.js
```

Para executar migrations pendentes:

```bash
npm run migrate:portal-talentos:apply
```

Comando manual equivalente:

```bash
node scripts/runPortalTalentosMigrations.js --apply
```

Sem `--apply`, o runner nao executa migrations. Com `--apply`, ele cria a tabela de controle `portal_talentos_migrations`, executa apenas arquivos ainda nao aplicados e envolve cada migration em transacao individual.

Execute primeiro em ambiente local/desenvolvimento. Nunca execute em producao sem backup validado e janela operacional aprovada.

## Diretrizes

- Nao usar funcoes `ensure...` no startup para tabelas do Portal Talentos.
- Nao adicionar criacao de tabelas do Portal diretamente em `src/index.js`.
- Revisar scripts SQL antes da execucao.
- Executar migrations de forma manual/controlada nesta fase inicial.
- Manter o modulo isolado do backend operacional existente.

## Estado atual de integracao com frontend

No frontend `portal-talentos-hdl`, os modulos abaixo ja estao integrados com a API deste backend:

1. `candidates`
2. `opportunities`
3. `applications`

O frontend ainda mantem fallback para `localStorage` para cenarios de contingencia.

## Robustez pre-Eventos

- Operacoes criticas no frontend nao devem usar fallback silencioso quando `VITE_API_BASE_URL` estiver ativa e a chamada da API falhar.
- Eventos ainda nao foi iniciado neste eixo; o foco atual permanece em estabilidade de candidates/opportunities/applications.

## Proximos passos

1. Consolidar monitoramento e logs operacionais dos endpoints do modulo.
2. Manter evolucao do eixo Eventos em modulo separado, sem quebrar o contrato atual.
