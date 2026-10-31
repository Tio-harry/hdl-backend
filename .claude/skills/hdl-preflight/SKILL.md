---
name: hdl-preflight
description: "Diagnóstico somente leitura antes de implementar, corrigir ou publicar nos sistemas HDL: estado do Git, trabalho alheio, testes disponíveis e risco. Use no início de qualquer tarefa que vá alterar arquivos."
argument-hint: "[tarefa em uma frase]"
---
# hdl-preflight — entender antes de mexer

Somente leitura: não edite, não instale, não faça add/commit/push/deploy/migration. Não leia .env, chaves, tokens, cookies nem dumps.
Tarefa: $ARGUMENTS

1. **Git** (um único Bash, só comandos de leitura):
   `git rev-parse --show-toplevel; git branch --show-current; git rev-parse --abbrev-ref '@{u}'; git log -1 --format='%h %s (%cr)'; git status -sb; git diff --stat; git diff --cached --name-only`
2. **Regras do projeto**: confirme que o CLAUDE.md (e o AGENTS.md, se houver) está no contexto. Se faltar, use `grep -n '^## '` e leia só as seções necessárias.
3. **Testes**: `grep -nE '"(test|lint|build|check|migrate)[^"]*"' package.json` e a seção de testes do CLAUDE.md. Escolha o teste focado primeiro; regressão completa só antes do commit.
4. **Trabalho alheio**: tudo no `git status` que não é desta tarefa (alterações antigas, `.codex_portal_tmp`, arquivos no stage) deve ser preservado e nunca entrar no commit. Stage inesperado: pare e informe.
5. **Risco**: *alto* = migration estrutural ou irreversível, autenticação/autorização, regra financeira central, exclusão ou movimentação de dados, infraestrutura (Nginx/systemd), mudança em vários sistemas; *médio* = regra de negócio, API ou banco sem migration; *baixo* = texto, estilo, documentação, configuração local.
6. **VPS** (`ssh hdl-vps`): só se for indispensável e só consultas (status, logs, SELECT). Nunca escrever.

## Saída (máx. 12 linhas)
Estado (repo, branch, upstream, último commit, limpo ou sujo) · Alheio a preservar · Risco (baixo/médio/alto + motivo) · Áreas e arquivos relevantes (achados por grep) · Testes (focado → regressão) · Estratégia proposta.

Economia: busque com grep/Glob antes de abrir arquivos, leia só trechos, não releia o que já entendeu, não use navegador visual nem screenshots se API/headless resolver e pare após duas falhas iguais de ambiente.
