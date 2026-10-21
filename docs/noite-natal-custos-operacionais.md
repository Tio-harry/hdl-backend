# Noite de Natal: acabamento e custos por visita

## Preflight e decisao de arquitetura

- Bases: backend `6d360c9c62cb90c5bd81c44250de2d1b518c803b`; frontend `686d1b7f87cf75699a8ac12d1ff98635521988c0`.
- Ambos em main. Backend inicialmente limpo; frontend com apenas `.codex_portal_tmp/` preexistente, preservado e fora dos commits.
- Regra confirmada pelo usuario: cada escala/evento e uma unidade de cache. Nao deduplicar valores por pessoa na rota.
- Fonte: `escala_eventos.valor_recreador`, `NUMERIC(10,2)`, opcional. Gravado no POST `/eventos/:id/escalas` e PUT `/escalas-evento/:id`.
- O valor e persistido por escala, nao consultado dinamicamente nas referencias. Referencias regionais e parcerias sao apenas consulta; testes alteram ambas e comprovam que escalas historicas permanecem intactas.
- `syncEventoPagamentoColaboradorFromEscalaSum` soma os caches por evento e atualiza os custos oficiais. Essa funcao NAO foi alterada.
- `status_pagamento` e os lancamentos de `pagamentos_escala_colaborador` continuam separados do valor combinado. Este resumo mostra custos definidos, NAO dinheiro efetivamente recebido pelo profissional.
- `natalService.readOperation` ja entrega as escalas reais, incluindo valor, funcao, identificadores e status. Nenhum endpoint novo e nenhuma mudanca no backend de producao foram necessarios.
- Nao existe nova tabela, copia de equipe, cache persistido, financeiro paralelo ou nova migration. As migrations 001/002 continuam como estavam.

## Calculo e historico

- Soma em centavos inteiros de todas as escalas das visitas elegiveis da rota.
- Agrupamento de apresentacao: colaborador_id + funcao. Para legado, id_recreador; sem ambos, identidade da escala, nunca somente nome (evita unir homonimos).
- Mesma pessoa em funcoes diferentes: linhas separadas. Mesma pessoa em rotas diferentes: conta seus caches em cada rota.
- Quantidade exibida por integrante: numero de visitas distintas em que aparece. Cada linha de escala contribui com seu valor.
- Caches diferentes sao validos: 100 + 120 + 150 = 370. Sem media/minimo/maximo e sem alerta por diferenca.
- Equipe divergente continua bloqueando copia por motivo operacional, mas NAO bloqueia a soma dos caches reais.
- Nulo, vazio, negativo, formato invalido ou nao finito: custo pendente, nao zero silencioso. Zero explicitamente salvo e valido.
- Visita sem escala: aviso de custo a definir. Rota vazia nao gera pendencia artificial nem expande custos.
- Total superior soma todas as rotas; com pendencias mostra somente subtotal confirmado e quantidade de rotas/custos a revisar. Visitas ainda nao alocadas aparecem separadamente, fora desse total, com seu subtotal e aviso.
- Custos recolhidos por padrao. Expandir mostra nome, funcao, visitas, total individual e pendencias. Correcao continua exclusivamente na Agenda.
- Alteracao manual do cache invalida a consulta da Noite de Natal. Consulta tambem atualiza ao retornar a janela, ao clicar Atualizar e pelo intervalo existente. Offline/erro informa que os dados sao de cache.
- Valores de 2026 continuam vindo das escalas de 2026, mesmo que referencias futuras mudem. Nao se cria fechamento imutavel: edicoes oficiais da escala ou da alocacao historica continuam refletidas na consulta, conforme solicitado.

## Permissoes e privacidade

- `natalRoutes.js` ja restringe consulta/mutacao a gestor e operador autenticados; sao os dois perfis existentes. Ambos ja recebem valores e visualizam o campo na Equipe Escalada. Sem ampliacao de acesso.
- Teste HTTP: gestor e operador recebem os valores; anonimo recebe 401. Nenhuma mudanca na autenticacao global.
- Tela nao marca pagamentos, registra datas ou altera adiantamentos/saldo. Status permanece na fonte oficial.
- Mensagem continua usando lista explicita de campos logisticos, sem importar o helper de custo nem passar seus resultados para a copia.
- Regressao verifica ausencia de R$, total, custo, valor, pagamento, recebido, saldo e contatos. Protecao de texto livre agora inclui "valor" isolado e plurais financeiros.
- Bloqueio conservador de texto livre pode rejeitar um nome/observacao contendo palavra financeira. Nao remove texto silenciosamente; pede revisao. A equipe deve revisar o clipboard antes do envio manual. Nenhum envio automatico/WhatsApp implementado.

## Acabamento visual

- Equipe da rota em itens compactos: funcao, nome destacado e badges de aceite. Aceites diferentes entre visitas aparecem separadamente, sem mudar status.
- Titulos de rota com peso/tamanho maiores; Copiar rota para equipe como botao principal. Renomear/subir/descer/remover permanecem visiveis e secundarios.
- Rotas vazias e nao alocadas vazias mais baixas; area de drop preservada e testada com ponteiro real.
- Cards das visitas permanecem brancos/texto escuro em ambos os temas. Divisor discreto separa financeiro; no mobile fica horizontal, no desktop vertical.
- Containers claros em cinza azulado suave; containers escuros mantidos. CSS limitado a Noite de Natal.
- Equipe Escalada na Agenda: funcao/nome mais fortes, divisao visual dos controles de valores/pagamento, quebra responsiva. Nenhum handler de QR/pagamento/busca/praca foi reescrito.

## Validacao automatizada e real

Backend (somente PostgreSQL local descartavel, com estrutura sem dados copiada do banco local):

```powershell
cd C:/Users/Pichau/Desktop/Projetos/hdl-backend
node --check src/index.js
node --check src/services/natalService.js
node --check src/routes/natalRoutes.js
node --check src/services/funcoesEquipeService.js
node --check src/routes/funcoesEquipeRoutes.js
node scripts/testNoiteNatal.js
node scripts/testFuncoesEquipe.js
node scripts/testContractParserCases.js
npm.cmd run test:contract-parser
git diff --check
```

- `testCustosNatal.js` e chamado pelo harness `testNoiteNatal.js`: prova historico, atualizacao via Agenda, pagamentos intactos ao alterar rotas e permissoes.
- `testFuncoesEquipe.js` agora tem entrada executavel: quando chamado diretamente roda o mesmo harness isolado. Antes somente exportava a funcao.
- Parser: 8/8. Relatorio gerado atualizado, sem modificar parser.
- Migrations existentes testadas novamente como aditivas/idempotentes somente em banco descartavel. Nenhuma migration nova para aplicar.

Frontend:

```powershell
cd C:/Users/Pichau/Desktop/Projetos/gest-o-operacional-hora-do-lazer
node scripts/testNoiteNatal.mjs
node scripts/testMensagemRota.mjs
node scripts/testCustosNatal.mjs
npm.cmd run build
git diff --check
```

- Custos: 3 visitas x 3 x 100 = 900; 5 visitas = 1500; 100/120/150 por visita = 1110; grupos por funcao; equipe mista; nulo/invalido; zero explicito; centavos; duas rotas; nao alocadas; nenhuma mutacao dos objetos de entrada.
- QA Chrome real via Playwright, servidor Vite local e backend isolado. Sem mocks de respostas financeiras.
- Rotas: 3 visitas = 900; quarta = 1200; campo da Agenda alterado para 150 = 1250; nulo = subtotal1100 + pendencia; restaurado = 1200.
- DND real para rota vazia e F5: 900 na primeira + 300 na segunda; equipe/posicao/mensagem preservadas.
- Equipe diferente mantem total e bloqueia copia. Mesma pessoa em outra funcao aparece separadamente.
- Escala: alterar aceite, marcar pagamento e restaurar somente fixture; abrir Pendencias sem baixa; gerar QR com/sem valor (chave ficticia, sem banco/pagamento real); consultar pagamentos parciais.
- Agenda outubro/novembro/dezembro: expandir/recolher, cards/estados, filtros, detalhes, classificacao, contato e navegacao ida/volta.
- Configuracoes: listar/criar/editar/ordenar/desativar/reativar funcoes; historico preservado.
- Cenarios 1/3/6 rotas, mais rota vazia; 5 visitas por rota (30 visitas), total9000. Desktop1440, tablet820 e mobile390; claro/escuro; sem overflow horizontal. Screenshots temporarios fora dos repositorios.
- Sem pageerror ou console.error da aplicacao no fluxo final.
- Build com avisos preexistentes de base Browserslist/baseline antiga; nenhuma dependencia atualizada. Diff check sem erros; avisos de conversao LF/CRLF nao sao erros.

Para repetir QA, abrir dois terminais PowerShell:

1. Backend: `node scripts/testNoiteNatal.js --serve`. Ele cria banco descartavel e exibe credenciais ficticias. Nao usar servidor operacional.
2. Frontend: definir `QA_PLAYWRIGHT_MODULE` para o Playwright instalado no ambiente e executar `node scripts/qaNoiteNatal.mjs`. O harness abre/fecha Vite na porta5179, Chrome e proxy exclusivamente para localhost3109.
3. Ao terminar, pressionar Enter no terminal backend para encerrar servidor e remover somente seu banco descartavel.

## Arquivos desta rodada

Frontend:
- src/pages/NoiteNatal.jsx
- src/styles/noiteNatal.css
- src/utils/custosNatal.js (novo)
- src/utils/noiteNatal.js
- src/components/eventos/EventoDetalhes.jsx
- scripts/testCustosNatal.mjs (novo)
- scripts/testMensagemRota.mjs
- scripts/qaCustosNatal.mjs (novo)
- scripts/qaNoiteNatal.mjs

Backend (apenas testes/documentacao, nao runtime):
- scripts/testCustosNatal.js (novo)
- scripts/testNoiteNatal.js
- scripts/testFuncoesEquipe.js
- tests/contract-parser-report.md (resultado do teste)
- docs/noite-natal-custos-operacionais.md (este relatorio)

Nao alterados: package.json/lock, parser, PDF, calculos financeiros oficiais, endpoints, schema, player/Portal Talentos, CRM, regras de pagamentos, QR, praca, modelo de rotas. Nenhum teste usa/edita evento199; nenhuma conexao de producao ou deploy nesta execucao.

## Publicacao futura (NAO executada)

Somente quando decidir publicar, abrir o terminal SSH da VPS. Os caminhos seguem o runbook existente. Se git status mostrar alteracoes locais ou qualquer comando falhar, parar e revisar; nao usar reset/force.

```bash
cd /var/www/hdl-app/hdl-backend
git status --short
git pull --ff-only origin main
git log -1 --oneline

cd /var/www/hdl-app/gest-o-operacional-hora-do-lazer
git status --short
git pull --ff-only origin main
npm run build
git log -1 --oneline
```

Nao executar migrateFuncoesEquipe/migrateNoiteNatal novamente por causa deste bloco: 001/002 ja aplicadas segundo contexto do usuario; nao existe003. Nao e necessario reiniciar backend para esta alteracao (somente testes/docs no backend). Nenhuma nova aplicacao de migration ou backup extraordinario de banco exigido; manter rotina normal de backup.

Depois, no navegador, atualizar sem cache e abrir Agenda > Noite de Natal. Conferir resumo por rota e total, expandir custo, comparar com escalas da Agenda; testar temas e celular. Usar somente evento de teste para edicoes. Copiar uma rota e revisar o texto antes de enviar. Nao alterar evento199 para validacao.

Commits e hashes remotos finais sao informados no fechamento da tarefa, apos push e comparacao de HEAD/origin/main/ls-remote. Nao se registra o hash deste proprio commit dentro dele.
