---
name: hdl-handoff
description: "Retomar o trabalho de outro agente (Codex ou Claude) sem recomeçar: lê o Git, relatórios e commits e informa o que foi concluído, o que falta, testes e próximo passo. Use ao receber uma tarefa iniciada por outro agente ou após uma interrupção."
argument-hint: "[o que o agente anterior estava fazendo]"
---
# hdl-handoff — continuar de onde o outro agente parou

Nesta etapa é somente leitura: não edite nem refaça nada e não leia segredos (.env, chaves, tokens, dumps).
Contexto informado: $ARGUMENTS

1. **Estado**: `git rev-parse --show-toplevel; git branch --show-current; git rev-parse --abbrev-ref '@{u}'; git status -sb; git diff --stat; git diff --cached --name-only; git log -6 --stat --format='%h %s (%cr)'`
2. **Não commitado**: `git diff --stat` e, só dos arquivos relevantes, `git diff -- <arquivo>`. Separe o que é da tarefa do que é antigo ou alheio; o alheio é preservado.
3. **Relatórios e docs**: Glob em `docs/**/*.md` e nos `*.md` da raiz; faça grep pelo tema e leia só o trecho que descreve a tarefa.
4. **Concluído × pendente**: confirme cada item por evidência (commit, arquivo, teste), não só pelo texto de um relatório. Não recomece o que já está feito.
5. **Testes**: o que já rodou (relatório ou commit) e o que falta. Rode apenas o teste focado se precisar confirmar algo.
6. Se for autorizado a continuar, siga a partir desse estado e do fluxo de commit/push do CLAUDE.md.

## Saída obrigatória
Estado atual · Trabalho concluído · Trabalho pendente · Testes já executados · Testes faltantes · Blockers · Próximo passo recomendado.

Economia: busque com grep/Glob antes de abrir arquivos, leia só trechos, não releia o que já entendeu, não use navegador visual nem screenshots se API/headless resolver e pare após duas falhas iguais de ambiente.
