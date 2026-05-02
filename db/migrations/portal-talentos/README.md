# Migrations SQL - Portal Talentos HDL

Esta pasta concentra os scripts SQL versionados do modulo Portal Talentos HDL.

## Objetivo

Manter a evolucao do banco do Portal Talentos de forma explicita, revisavel e independente das funcoes `ensure...` usadas historicamente no startup do backend principal.

## Convencao de nomenclatura

Use arquivos numerados, com tres digitos e uma descricao curta em snake_case:

```text
001_create_portal_talentos_candidates.sql
002_create_portal_talentos_opportunities.sql
003_create_portal_talentos_applications.sql
```

O numero define a ordem de execucao planejada. Novas migrations devem sempre receber o proximo numero disponivel.

## Regras

- Scripts devem ser revisados antes da execucao.
- Scripts nao devem ser executados automaticamente no startup da aplicacao.
- O modulo Portal Talentos nao deve criar ou alterar tabelas por funcoes `ensure...` dentro de `src/index.js`.
- A execucao em producao deve ser manual e controlada nesta fase inicial.
- Cada script deve ser pequeno o suficiente para revisao objetiva.
- Cada migration deve registrar claramente a entidade, indices e constraints criados.

## Futuro

Quando o fluxo estiver estabilizado, pode ser adotada uma ferramenta formal de migrations, como node-pg-migrate, Knex migrations, Prisma Migrate ou outra solucao compativel com o padrao do backend.
