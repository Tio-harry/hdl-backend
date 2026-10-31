---
name: hdl-migration
description: "Procedimento seguro para migration de banco nos sistemas HDL (teste local descartável e, se autorizado, produção com backup validado). Invoque manualmente com /hdl-migration."
argument-hint: "[migration ou sistema]"
disable-model-invocation: true
---
# hdl-migration — banco com segurança

Este guia NÃO autoriza produção. Escrita em produção, migration na VPS e restart exigem autorização explícita na tarefa atual. Não mostre credenciais nem leia .env: para o banco alvo, extraia só host e nome, nunca a senha. Se o projeto tiver regra própria (CRM: docs/ENGINEERING.md e .agents/skills/crm-hdl-database-migration), siga a mais restritiva.
Alvo: $ARGUMENTS

## Local (sempre primeiro)
1. Identifique o banco do teste e confirme, no código do script, que é localhost/127.0.0.1 e descartável (nome de teste). Na dúvida, pare.
2. Aplique a migration em banco descartável (vazio e, quando fizer sentido, sobre o schema atual) e valide tabelas, índices, constraints e triggers por SELECT.
3. Rode duas vezes quando a idempotência for esperada; teste rollback ou forward-only conforme a arquitetura.
4. Rode os testes do projeto contra esse banco. Nunca edite migration já aplicada em produção.

## Produção (somente se autorizada)
1. Confirme o banco alvo (host e nome) e, por SELECT, que a migration ainda não foi aplicada.
2. Backup completo com `pg_dump -Fc` em /var/backups/<sistema>; gere o SHA-256 e valide com `pg_restore -l`; registre o caminho. Backup inválido: PARE.
3. Registre as contagens antes (tabelas afetadas e totais relevantes).
4. Aplique em transação quando possível, com conferência antes do COMMIT.
5. Valide por SELECT (tabelas, constraints, triggers, dados) e compare as contagens depois.
6. Só então reinicie ou publique as dependências, nesta ordem: backup → código → migration → backend → validação → frontend.

## Nunca
inventar dados históricos · rodar em banco incerto · continuar após backup inválido · mostrar credenciais · desfazer migration produtiva de forma destrutiva (corrija com nova migration).

Economia: busque com grep/Glob antes de abrir arquivos, leia só trechos, rode o teste focado antes da regressão e pare após duas falhas iguais de ambiente.
