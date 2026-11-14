# Gestão Operacional HDL — backend

Use somente fixtures e PostgreSQL descartável para testes. Preserve as rotas, a autenticação e os contratos existentes. Consulte docs/CI.md para rodar as suítes.

## Regressão e revisão
- Em bugfix, use $hdl-bugfix-regression. Uma correção testável exige regressão permanente na CI. Se um teste útil for inviável, registre o motivo e a validação alternativa.
- Na revisão, sinalize segredos ou logs sensíveis, regra financeira central sem testes, quebra de contrato de API sem autorização e migration destrutiva sem estratégia segura.
