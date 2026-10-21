# Noite de Natal

## Preflight de 20/10/2026

Producao: PostgreSQL 16.15, banco `hdl_db`, schema `public`. Local: PostgreSQL
18.3, `hdl_app`. Foram comparados colunas, tipos, nulabilidade, defaults,
constraints, FKs e indexes de contracts, eventos, servicos, servico_eventos,
escala_eventos, colaboradores e pagamentos_escala_colaborador. IDs sao TEXT.
Nao foi encontrada incompatibilidade impeditiva. A diferenca de catalogacao de
NOT NULL entre PG16 e PG18 nao altera a modelagem. SQL compativel com PG16.
Os tres nomes natalinos existem uma unica vez em producao e no ambiente local.

Backup integral de producao executado pelo mecanismo existente, sem reinicio:
`/usr/local/sbin/hdl-postgres-backup.sh` como postgres, a partir de `/tmp`.
Arquivo confirmado: `/var/backups/hdl-postgres/hdl_db_20261020_120633.dump`.
Checksum `.sha256` passou; `pg_restore -l` leu o arquivo custom (116 entradas).
Isso verifica integridade e legibilidade, nao equivale a teste de restauracao.
Nenhuma migration ou deploy foi executado em producao.
Backup local integral antes da migration: `%TEMP%/hdl_app_before_natal_20261020.dump`.

## Modelagem e classificacao

Migration explicita: `db/migrations/001_noite_natal.sql`, transacional no runner,
aditiva e idempotente. Nao roda em GET nem no startup. Adiciona:
- `servicos.codigo_operacional` com indice unico para codigos nao nulos.
- `contracts.servico_principal_id` e `eventos.servico_principal_id`, FKs opcionais.
- `natal_operacoes`: ano unico, margem padrao, observacao e versao.
- `natal_rotas`: nome e ordem na operacao.
- `natal_visitas`: evento unico, rota/posicao e metadados logisticos.

Nao replica cliente, horario, valores ou escala. A tabela de visitas referencia
o evento; se o evento oficial for excluido, sua alocacao e excluida por cascade.
Excluir uma rota ocupada exige mover as visitas antes. Nenhuma rota em uso e
excluida silenciosamente. Uma visita inelegivel apos edicao exige confirmacao
explicita para remover sua alocacao. Mudar o ano do evento exige liberar a
alocacao no ano anterior antes de alocar no novo.

Codigos: `natal_papai_noel`, `natal_papai_noel_duende`, `natal_noite_visita`.
A migration aborta se os nomes seed estiverem ausentes, duplicados ou em conflito.
Novos contratos resolvem nome normalizado EXATO contra catalogo ativo, somente
se unico, ou alias explicito versionado; descricao livre nao e adivinhada. ID explicito e validado. Texto de
contrato/PDF e preservado. Legados nao sao classificados em massa. O detalhe
do evento oferece selecao manual do servico principal para revisao.

Elegibilidade: 24/12 do ano + codigo `natal_noite_visita` no principal ou adicional.
Os demais eventos do dia aparecem numa lista de revisao, fora das rotas.
Noel 01-23/12 recebe apenas selo discreto na Agenda.

## API e concorrencia

`GET /noite-de-natal/:ano`: leitura consistente (repeatable read, read only).
`PUT /noite-de-natal/:ano`: snapshot logistico completo com `versao`,
`margem_minutos`, `observacao`, `rotas` e `visitas`. Cada visita envia evento_id,
rota_id (null para nao alocada), posicao, observacao, deslocamento_minutos e
margem_minutos (null usa padrao). Rotas sao ordenadas pela ordem no array.
`remover_inelegiveis: true` confirma limpeza das alocacoes que deixaram de ser elegiveis.

Ambos exigem sessao real e perfil gestor/operador. Ano 2000-2100. Mutações sao
serializable, com advisory lock anual e versao. Conflitos retornam 409 e a tela
recarrega. IDs, duplicidade, nomes, posicoes e minutos sao validados. Todos os
campos oficiais sao ignorados pelo PUT logistico. GET ausente nao cria operacao.
Lista de conflitos inclui apenas identidade/data/horarios dos eventos de 24/12;
nenhum financeiro de outros anos e retornado pela nova API.

Deslocamento pertence ao par anterior/destino na mesma rota. Mudanca desse par
invalida a estimativa para NULL; primeira visita nao guarda deslocamento.
Inicio/fim oficiais determinam duracao. Fim menor que inicio cruza meia-noite;
a proxima visita elegivel ainda comeca no dia 24, sem supor um dia extra.
Sem estimativa ou horario valido, alerta explicito. Equipes divergentes alertam,
sem alterar escala. Funcao da escala aceita Noel, Assistente/Duende e Motorista.

Financeiro apenas leitura por helpers oficiais. Nenhum pagamento/recebimento e
criado. Estado visual compartilha helper com Agenda, incluindo precedencia das
cores existente. Atualizacao a cada 30s, foco e botao; offline bloqueia escrita.
Cache offline e apenas da sessao aberta; nao ha fila de mutacoes offline.

## Testes locais

Backend (PowerShell ou Git Bash, pasta hdl-backend):
```
node --check src/index.js
node --check src/services/natalService.js
node --check src/routes/natalRoutes.js
node scripts/testNoiteNatal.js
node scripts/testContractParserCases.js
npm run test:contract-parser
git diff --check
```
`testNoiteNatal.js` exige PostgreSQL LOCAL com permissao CREATE DATABASE. Clona
somente schema para `hdl_natal_test_<timestamp>`, cria dados ficticios e apaga
somente esse banco no final. `PG_BIN` permite indicar pasta de pg_dump/psql.
Nao executa testes em URL remota. Sobe o backend real temporario na porta3109.
Cobertura: migration duas vezes, login/cookie real, 401, contrato/evento, adicional,
ano, CRUD de rotas, movimentos, duplicidade, invalidacao, concorrencia 409 e
comparacao integral de eventos/escalas/pagamentos antes/depois.

Frontend (pasta gest-o-operacional-hora-do-lazer):
```
node scripts/testNoiteNatal.mjs
npm run build
git diff --check
```
Equivalencia visual compara 32 combinacoes com o codigo real anterior ao bloco.
Teste navegador: primeiro abrir terminal interativo no backend e executar
`node scripts/testNoiteNatal.js --serve`; depois, em outro terminal no frontend,
`node scripts/qaNoiteNatal.mjs`. O script usa Playwright ja disponivel externamente
(variavel `QA_PLAYWRIGHT_MODULE` com caminho do modulo se nao estiver instalado).
Nao exige alterar package.json. Porta5179 exclusiva, proxy para3109. Faz login
de teste, DND real, edicao/persistencia, screenshots desktop/tablet/mobile,
verifica overflow, bloqueio offline e link de dezembro. Pressionar Enter no
terminal backend ao terminar para encerrar e remover o banco descartavel.

## Aplicacao futura em producao (NAO executada nesta rodada)

Abrir terminal SSH da VPS. Confirmar janela de manutencao, repositorios limpos,
backup e ausencia de trabalhos concorrentes. Nao usar reset --hard.
```
cd /tmp
sudo -u postgres /usr/local/sbin/hdl-postgres-backup.sh
cd /var/backups/hdl-postgres
sha256sum -c "$(ls -t hdl_db_*.dump.sha256 | head -1)"
sudo -u postgres pg_restore -l "$(ls -t hdl_db_*.dump | head -1)" >/dev/null
cd /var/www/hdl-app/hdl-backend
git status --short
git pull --ff-only origin main
sudo -u hdlbackend /usr/bin/node scripts/migrateNoiteNatal.js --apply --database=hdl_db
sudo systemctl restart hdl-backend.service
sudo systemctl status hdl-backend.service --no-pager
cd /var/www/hdl-app/gest-o-operacional-hora-do-lazer
git status --short
git pull --ff-only origin main
npm run build
```
O runner usa DATABASE_URL/.env do backend, sem imprimir credenciais, e aborta
se o banco conectado nao for o informado. Se qualquer etapa falhar, parar;
nao reiniciar backend nem publicar frontend antes da migration bem-sucedida.
Validar login, Agenda, contrato de teste com catalogo, rota por ano, duas sessoes,
movimento, refresh e retorno ao evento. Nao executar comandos de outro projeto.
Rollback logico: voltar aos commits anteriores da aplicacao pelo processo de
release habitual; manter tabelas/colunas/dados aditivos. Nao fazer DROP nem
restaurar backup sobre producao sem plano especifico e confirmacao.

## Deliberadamente fora

Padrao de20min nao aplicado: o parser determina o fim ANTES da resolucao do
catalogo. Preservado default3h e duracao explicitamente contratada. Revisar o
horario na origem antes da operacao. Maps, distancia automatica, PDFs natalinos,
videos, snapshots financeiros e historico detalhado de custos ficam fora.

## Correcao e UAT posterior a publicacao

Reproduzido antes de editar, em navegador Chrome com API/banco descartavel:
`ReferenceError: alertaColaboradorObrigatorio is not defined`.
Stack: `renderEventoCard (AgendaEventos.jsx:798:13)` no modulo transformado
pelo Vite, chamado por `children -> Draggable -> renderWithHooks`.
No fonte publicado, o uso sem declaracao estava em `AgendaEventos.jsx:878`.
O commit 22854ea removeu a declaracao local, mas manteve o badge Custo equipe.
Meses recolhidos nao chamavam renderEventoCard, por isso so expandir disparava
o erro e deixava body vazio. Corrigido recuperando o mesmo campo do helper.
As regras/cores do helper nao mudaram. O QA anterior nao expandia meses;
o QA atualizado expande outubro/novembro/dezembro, verifica cards e cores,
abre detalhe, testa filtros e falha em pageerror e console.error apos login.
O 401 inicial de sessao anonima e esperado; nao sao ignorados erros React.

Nova acao: `POST /noite-de-natal/:ano/eventos/:eventoId/classificar`, body
`{ "confirmado": true }`. Exige a mesma sessao/perfil gestor ou operador.
Resolve exclusivamente codigo `natal_noite_visita` ativo, nunca substring.
Transacao SERIALIZABLE bloqueia contrato e evento e altera apenas
`servico_principal_id` em ambos. Nao muda texto, identidade, valores, endereco,
horarios, escala ou pagamentos. Evento deve pertencer a 24/12 do ano.
Catalogo indisponivel ou conflito concorrente retorna 409, sem alteracao parcial.
Confirmacao cancelavel na area de revisao; offline bloqueia a acao.
Teste usa legado sintetico semelhante ao caso relatado, nao o dado de producao.

### Publicar SOMENTE esta correcao (migration 001 ja aplicada)

No terminal SSH da VPS, conferir working trees limpos antes de prosseguir:
```
cd /var/www/hdl-app/hdl-backend
git status --short
git pull --ff-only origin main
node --check src/index.js
node --check src/services/natalService.js
node --check src/routes/natalRoutes.js
sudo systemctl restart hdl-backend.service
sudo systemctl status hdl-backend.service --no-pager
cd /var/www/hdl-app/gest-o-operacional-hora-do-lazer
git status --short
git pull --ff-only origin main
npm run build
```
Parar se qualquer comando falhar; nao executar migration novamente para esta
correcao. Nao houve acesso/mudanca de banco de producao nesta rodada.
No navegador, atualizar a pagina e validar outubro/novembro/dezembro, detalhe
de evento e filtros. Em Noite de Natal, revisar o evento legado e somente entao
confirmar sua classificacao. Conferir mesmo evento, texto/horarios/valores e
persistencia apos refresh. Testar os temas claro/escuro e mobile.

## Refinamento de classificacao e leitura operacional

Preflight local confirmou as bases 24fedfed (backend) e 10bf476 (frontend),
sem alteracoes preexistentes alem de .codex_portal_tmp/ no frontend.
Nao exige schema: utiliza os vinculos da migration 001 ja existente.
Nenhuma migration foi criada ou aplicada ao banco operacional neste bloco;
a suite reaplica a migration existente apenas ao banco descartavel de testes.

Resolver central em natalService: ID explicito vence (null explicito limpa);
sem ID enviado, preserva ID existente; somente se ausente tenta catalogo ativo.
Normaliza caixa, acentos, espacos e pontuacao. Nome oficial ambiguo nao resolve.
Unico alias aprovado: `Visita Noite de Natal com Papai Noel` -> codigo
`natal_noite_visita`. Nao usa substring Noel/Natal nem inclui videos.
POST contrato usa a transacao existente. PUT bloqueia o contrato antes de
resolver e preserva classificacao manual, propagando o mesmo ID ao evento.
Nao reclassifica registros antigos em massa.

O select do detalhe anteriormente enviava todo o formulario ao PUT geral,
que recalculava financeiro e nao sincronizava a classificacao do contrato.
Agora usa PATCH /eventos/:eventoId/classificacao-servico (gestor/operador),
body { servico_principal_id: ID ou null }, com a mesma transacao segura da
acao de revisao. Altera apenas as duas FKs, sem calculos financeiros.
Salvamentos gerais deste componente nao reenviam mais uma classificacao antiga.
Label: Classificacao do servico; ajuda: Usada pelo sistema para automacoes e
organizacao operacional. Estilo local branco/preto e color-scheme light,
inclusive no tema escuro, sem CSS global.

API Natal le contracts.contato_contratante por consulta vinculada, sem copiar
ou persistir o contato nas tabelas logisticas. Card revela/copia o numero e
mostra ausencia quando vazio. Ver evento usa /eventos?eventoId=ID e abre o
detalhe oficial, nao outra tela. Sem integracao WhatsApp.
Card prioriza horario/cliente/endereco e chips com funcao/aceite da escala.
Contagem representa escalados/necessarios, nao aceites confirmados.
Um estado operacional; financeiro usa getRecebidoOficial/getAReceberOficial:
total e Pago integralmente quando recebido cobre o total e saldo oficial <=0;
nos demais casos, total/recebido/saldo. Sem novas formulas ou lancamentos.

QA usa dados sinteticos: 24/12/2026 20:30-20:50, 470 integralmente recebido,
3/3 escalados com aceites mistos; outros cards com saldo e funcao Recreador.
Inclui aliases/ambiguidade/precedencia, PATCH manual, persistencia, contato
read-only, copiar numero, temas, responsividade, Agenda e DND+refresh.
O teste de mouse espera o limiar de inicio do arraste antes de mover ao destino.
Os comandos de publicacao da secao anterior continuam validos: atualizar
backend, checks e restart; atualizar frontend e build. Sem migration/deploy
executados aqui. Validar o evento 199 real somente apos publicacao autorizada.
