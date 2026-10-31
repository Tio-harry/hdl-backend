# Gestão Operacional — backend
Node + Express + PostgreSQL. Serviço: `hdl-backend`. Banco: `hdl_db`. Frontend: `../gest-o-operacional-hora-do-lazer`.

## Regras críticas
- Nunca exiba nem copie .env, chaves, tokens, cookies, senhas ou dumps; não use credenciais reais em testes.
- VPS: leitura permitida; qualquer alteração, deploy ou migration exige autorização explícita na tarefa atual.
- Não modifique outro repositório sem autorização. Adicione arquivos ao Git pelo nome; nunca force push.
- Commit e push: veja a seção "Commit e push" abaixo. Não invente dados financeiros nem trave ciclo sem autorização.
- Em conflito, prevalece a regra de segurança mais restritiva.

## Testes (PostgreSQL local descartável)
```
npm.cmd run test:financeiro-fase1
node scripts/testNoiteNatal.js
npm.cmd run test:contract-parser
```
O contract-parser reescreve `tests/contract-parser-report.md`: restaure só esse artefato se a mudança for apenas de data.

## Segurança
- API interna exige autenticação; rotas públicas só pela allowlist `ROTAS_PUBLICAS`.
- Não abra rota para facilitar teste nem enfraqueça a autenticação existente.
- `financeiro_leitura` nunca escreve.

## Migrations
Ficam em `db/migrations/`, sem tabela de controle: confirme o estado por SELECT antes de aplicar.

## Deploy
Só com autorização. Ordem quando necessária: backup → código → migration conforme a arquitetura → backend → validação → frontend dependente.

## Commit e push
Fluxo padrão sem perguntar: escopo ok, testes verdes, `git diff`/`git diff --check` limpos e nenhum arquivo inesperado →
`git add -- <arquivos>` → `git commit -F - <<'EOF'` → `git push origin main` → relatório.
Pare se a tarefa for só leitura ou disser NÃO COMMITAR/PUSH, ou se houver blocker, teste crítico falhando, arquivo
inesperado, alteração fora do escopo, conflito ou trabalho anterior de outra tarefa. Nunca `git add .`/`-A`/`--all`
nem push forçado. Commit/push não autoriza deploy: deploy só se a tarefa autorizar (alto risco: siga a regra da tarefa).

## CI (GitHub Actions)
Roda em todo push/PR para main (ignora só docs e `.claude`), com PostgreSQL descartável e rede externa bloqueada: `git diff --check`, `npm ci`, sintaxe, contract-parser, testNoiteNatal, financeiro fase 1. Detalhes e como ler falhas: `docs/CI.md`.
Não faz deploy nem usa secrets. Localmente rode só o teste focado; a regressão completa fica por conta do CI.
