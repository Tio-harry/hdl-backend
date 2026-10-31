# CI (GitHub Actions)

Workflow: `.github/workflows/ci.yml`. Roda em push e pull request para `main` (ignora só `*.md`, `docs/`, `.claude/` e `.gitignore`) e também manualmente em Actions → CI → Run workflow.

**Não faz deploy, não usa SSH, não usa secrets e não acessa produção.** Os testes rodam em um PostgreSQL descartável do próprio job, e `.github/ci/bloquear-rede.cjs` recusa qualquer conexão que não seja para a própria máquina (se um teste tentar usar a internet, ele falha com `CI_REDE_BLOQUEADA`).

## O que verifica
1. `git diff --check` do que foi enviado (ignora `*.md`).
2. `npm ci` e sintaxe (`node --check`) de `src/` e `scripts/`.
3. Banco de teste carregado com `db/ci/base-schema-pre003.sql`.
4. `npm run test:contract-parser`.
5. `node scripts/testNoiteNatal.js`.
6. `npm run test:financeiro-fase1`.

## Como ler uma falha
- O primeiro passo vermelho é a causa; abra-o e leia a última mensagem.
- `git diff --check`: espaço sobrando no fim da linha ou marcador de conflito, no arquivo e linha indicados.
- Teste: a última linha `PASS` mostra até onde chegou; a mensagem seguinte é o defeito.
- `CI_REDE_BLOQUEADA`: o teste tentou acessar a internet (defeito do teste, não do CI).

## Fora do CI (continua local ou manual)
Deploy, migrations em produção, validação visual (UAT), `testCustosNatal`, `testFuncoesEquipe` e `testContractNatal*` (este chama IA externa).

## Banco base
`db/ci/base-schema-pre003.sql` é só estrutura (sem dados) do banco de produção antes da migration 003, extraída do backup de 30/10/2026. Os testes aplicam as migrations 001–003 por cima, como na produção. Se uma migration futura alterar o schema base, gere uma nova estrutura e atualize o arquivo.
