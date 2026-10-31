---
name: hdl-finish
description: "Concluir um bloco de trabalho HDL de forma padronizada: testes, revisão do diff, add por nome, commit, push, deploy só se a tarefa autorizar, validação e relatório. Use quando a implementação estiver pronta."
---
# hdl-finish — concluir o bloco

Siga em ordem e pare no primeiro bloqueio.

1. Testes focados da área e, só então, a regressão necessária (comandos na seção de testes do CLAUDE.md).
2. `git diff` (revise) e `git diff --check`.
3. `git status -sb` e `git diff --cached --name-only`: só arquivos da tarefa; nada inesperado no stage.
4. `git add -- <arquivo> [<arquivo> ...]`, sempre por nome e depois de `--`. Nunca `.`, `-A`, `--all`, `-u`, `-f`, pastas ou curingas.
5. `git commit -F - <<'EOF'` com assunto claro, corpo curto e a linha de coautoria definida no ambiente. Nunca `-a`, `--amend` ou `--no-verify`.
6. `git push origin main` (ou a branch e o remoto esperados do projeto). Nunca push forçado.
7. Deploy **somente se a tarefa atual autorizar**. Baixo ou médio risco com testes verdes: siga sem perguntar. Alto risco (migration estrutural, autenticação, regra financeira central, exclusão ou movimentação de dados, infraestrutura, vários sistemas): siga a regra de parada da tarefa. Sem autorização na tarefa, não faça deploy.
8. Validação pós-deploy (se houve) e relatório.

## Pare e relate se
a tarefa for só leitura ou disser NÃO COMMITAR/PUSH · teste crítico falhar · houver arquivo inesperado, alteração fora do escopo ou trabalho anterior de outra tarefa no stage · houver conflito Git · a branch ou o remoto esperado não puderem ser confirmados.
Preserve sempre .env, segredos, `.claude/settings.local.json`, `.codex_portal_tmp`, backups e uploads.

## Relatório final (curto)
O que mudou · testes e resultados · commit (hash) · push · deploy/migration (feitos ou não) · `git status` final · não validado e pendências.

Economia: busque com grep/Glob antes de abrir arquivos, leia só trechos, não releia o que já entendeu, rode o teste focado antes da regressão, não repita screenshots e pare após duas falhas iguais de ambiente.
