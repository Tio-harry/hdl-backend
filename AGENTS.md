# Gestão Operacional HDL — backend

Use somente fixtures e PostgreSQL descartável para testes. Preserve as rotas, a autenticação e os contratos existentes. Consulte docs/CI.md para rodar as suítes.

## Regressão e revisão
- Em bugfix, use $hdl-bugfix-regression. Uma correção testável exige regressão permanente na CI. Se um teste útil for inviável, registre o motivo e a validação alternativa.
- Na revisão, sinalize segredos ou logs sensíveis, regra financeira central sem testes, quebra de contrato de API sem autorização e migration destrutiva sem estratégia segura.

## Finalização pelo Codex
- Em tarefas que alteram código da Gestão Operacional HDL, a política permanente do usuário autoriza o Codex a fazer commit/push após testes, regressão, checks e revisão do diff, e a usar $hdl-release-deploy após CI verde do commit exato. Deploy de baixo/médio risco é o padrão dentro dos gates da skill. Respeite a instrução da tarefa para parar antes e pare antes de produção se houver gate pendente ou blocker de alto risco. Veja [CI e deploy](docs/CI.md#finalização-e-deploy-pelo-codex).
