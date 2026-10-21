# Noite de Natal: rotas, comunicacao e funcoes da equipe

## Preflight e arquitetura

Bases locais: backend ab980c7c5b566ec028e7435a1960b2a5422053db e frontend
c9eb62a309eaf8fc91ac108d29fcaf667084c5f4, ambos main. Backend limpo;
frontend somente .codex_portal_tmp/ preexistente, excluido do versionamento.
Nenhum acesso a producao ou alteracao do evento 199 neste bloco.

Contrato -> eventos -> escala_eventos continuam oficiais. Noite de Natal
persiste somente logistica. natal_visitas.posicao e a ordem da mensagem,
nao os horarios. deslocamento_minutos pertence ao destino do trecho;
para dizer "ate a proxima visita", lemos o deslocamento da proxima visita.
Observacao geral pertence a natal_operacoes, nao possui publico definido e
pode conter administracao interna: deliberadamente nao vai para clipboard.
Observacao logistica individual e incluida, com verificacao de conteudo sensivel.

## Catalogo e historico

A lista hardcoded estava somente em EventoDetalhes.jsx, no select da escala.
O POST usava Recreador como padrao. Demais consumidores apenas leem a funcao
salva (pagamentos, comunicacao, perfil, copia, Natal); nao foram reescritos.

Nova migration 002_funcoes_equipe.sql, necessaria para persistir catalogo
administravel. IDs TEXT como no projeto; nome, ativo, ordem, timestamps e
nome_normalizado gerado pelo PostgreSQL. Indice unico normalizado impede
duplicidade com caixa/espacos diferentes inclusive sob concorrencia.
Indice ativo/ordem/id. Nao apaga nem altera escala_eventos.funcao.
Seeds: Recreador, Personagem, Promotor, Staff, Papai Noel,
Assistente/Duende, Motorista; importa tambem nomes distintos historicos.
Reexecucao nao sobrescreve cadastro existente nem reativa funcoes.

Configurar em Configuracoes > Funcoes da Equipe (accordion existente como
referencia visual): criar, editar, ativar/desativar e subir/descer.
Sem DELETE. Gerenciamento usa config.admin.view (gestor); listagem ativa
exige sessao autenticada e atende tambem operador. Sem mudar politica global.

GET /funcoes-equipe: ativas, ordenadas.
GET /funcoes-equipe/admin: todas, somente gestor.
POST /funcoes-equipe: {nome}.
PUT /funcoes-equipe/:id: {nome} e/ou {ativo}.
PUT /funcoes-equipe/ordem: {ids:[todos os IDs na ordem desejada]}.
Respostas seguem {ok,dados}; alteracoes serializadas por advisory lock.
Ordem incompleta/duplicada/desatualizada retorna 409.

Escala continua salvando o nome como snapshot. Renomear/desativar catalogo
nao reescreve evento antigo. Um snapshot que nao consta nas opcoes ativas
aparece como "registro atual", desabilitado para nova escolha. Atualizacao
que repete exatamente o snapshot historico e permitida. Nova escolha precisa
existir e estar ativa; texto livre via API tambem e rejeitado. Funcao para
nova escala tem select proprio; Recreador continua padrao se ativo. Se
desativado, exige escolher outra funcao, sem atribuir papel automaticamente.

## Navegacao e cards

Evento elegivel de 24/12 com codigo estruturado natal_noite_visita ganha
"Ir para Noite de Natal" no topo. Link /noite-de-natal?ano=AAAA&eventoId=ID.
A pagina localiza o artigo, rola e destaca por 4,5 segundos. ID desconhecido
nao quebra nem modifica dados. "Ver evento" retorna ao detalhe oficial.

Visitas com superficie branca e texto escuro em ambos temas; somente o card
tem excecao de tema. Mantidas bordas/alertas dos helpers oficiais. Campos,
acoes e badges legiveis. Pagina ao redor respeita tema global.
Equipe da rota e derivada de identidade + funcao de cada escala. Aceites
nao participam da composicao; exibidos separadamente e agregados por pessoa.
Equipe igual aparece no cabecalho; cada visita mantem contagem de escalados
e aceites confirmados. Equipe diferente mostra alerta e equipes individuais.
Nenhuma equipe e persistida na rota.

## Mensagem e privacidade

Helper central frontend mensagemRota em src/utils/noiteNatal.js.
Copiar rota para equipe exige visitas, equipe e composicao igual em todas.
Bloqueios explicitos para rota vazia, sem equipe ou equipes divergentes;
offline, edicao e salvamento tambem bloqueiam copia de estado intermediario.
Feedback de sucesso somente apos clipboard confirmar gravacao.

Formato: NOITE DE NATAL - nome da rota; data; EQUIPE (funcao:nome uma vez);
visitas numeradas na posicao salva; horario; cliente; endereco; servico;
duracao calculada pelos horarios (inclui travessia da meia-noite); estimativa
do proximo trecho e observacao logistica quando preenchidos.
Horario ausente/invalido mostra "conferir na Agenda", nunca supoe 20 minutos.

Whitelist de campos: nao seleciona dados financeiros, custo, aceite nem
contato. Tambem bloqueia a copia se os textos livres contiverem padroes de
valor/pagamento/telefone ou numero de contato conhecido. Nao tenta apagar
partes silenciosamente: usuario recebe pedido para revisar textos na Agenda
ou Logistica. Esta verificacao e conservadora e pode bloquear texto legitimo
com padrao numerico semelhante; textos livres devem ser revisados pela equipe.
Sem WhatsApp API/envio automatico. Contato continua disponivel apenas na UI.

## Testes e QA

Backend: scripts/testNoiteNatal.js executa testes HTTP/DB reais e inclui
testFuncoesEquipe.js. Banco hdl_natal_test_<timestamp>, somente localhost;
schema clonado sem dados operacionais, removido ao terminar. Migrations 001
e 002 apenas nesse banco. Verifica reexecucao, seeds/historicos, constraints,
indices, permissoes 401/403, CRUD, duplicidade, ordem, inativa, snapshots,
integridade dos demais eventos/contratos e fluxo Natal anterior.

Frontend: testNoiteNatal.mjs (32 estados), testMensagemRota.mjs (ordem C/A/B,
20/30/40min, equipe uma vez, notas, trechos, bloqueios e dados proibidos).
qaNoiteNatal.mjs inclui qaNatalRotas.mjs com login real, Agenda dos tres
meses, classificacao, filtros, DND, refresh, contato, tema, dimensoes,
catalogo na UI, funcao historica, navegacao ida/volta, mensagem no clipboard.
Dados sinteticos, nao evento 199. Build e diff --check obrigatorios.

## Publicacao futura (NAO executada neste bloco)

Abrir terminal SSH da VPS somente quando decidir publicar. Agendar janela
sem edicoes concorrentes. Executar um comando por vez. Se git status mostrar
alteracoes ou qualquer comando falhar, PARAR. Nao usar reset --hard.
Estes caminhos/banco/servico seguem o runbook existente da Gestao, nao do Portal.

```bash
cd /tmp
sudo -u postgres /usr/local/sbin/hdl-postgres-backup.sh
cd /var/backups/hdl-postgres
backup="$(ls -t hdl_db_*.dump | head -1)"
sha256sum -c "$backup.sha256"
sudo -u postgres pg_restore -l "$backup" >/dev/null
cd /var/www/hdl-app/hdl-backend
git status --short
git pull --ff-only origin main
node --check src/index.js
node --check src/services/funcoesEquipeService.js
node --check src/routes/funcoesEquipeRoutes.js
sudo -u hdlbackend /usr/bin/node scripts/migrateFuncoesEquipe.js --apply --database=hdl_db
sudo systemctl restart hdl-backend.service
sudo systemctl status hdl-backend.service --no-pager
cd /var/www/hdl-app/gest-o-operacional-hora-do-lazer
git status --short
git pull --ff-only origin main
npm run build
```

Nao reaplicar migration 001. O runner 002 confirma nome do banco, executa em
transacao, com lock; erro faz rollback. Nao publicar frontend antes da API
e migration. Backup deve ter checksum e catalogo legiveis; isso nao substitui
um teste de restauracao. Se falhar antes da migration, manter versao atual.
Nao fazer DROP ou restaurar backup sobre producao como rollback automatico.

No navegador apos publicacao: Configuracoes > Funcoes da Equipe; conferir
seeds/ordem, uma funcao de teste e sua desativacao. Agenda > evento elegivel >
Ir para Noite de Natal > Ver evento. Conferir superficie clara, equipe e
clipboard antes de enviar ao grupo. Mover visitas, F5 e conferir ordem no texto.
Validar financeiro/contato somente leitura e dados oficiais sem duplicacao.

## Resultado da rodada local

Backend syntax checks (index, natalService, natalRoutes, novos service/router
e runner): aprovados. testNoiteNatal.js e testFuncoesEquipe: aprovados.
Parser: 8/8 nos dois comandos. Frontend: 32 estados operacionais e testes da
mensagem aprovados; build aprovado, somente avisos preexistentes de base de
navegadores desatualizada. Nenhum pacote/dependency alterado, sem audit fix.
git diff --check sem erros (apenas avisos LF/CRLF).

QA real aprovado: Agenda outubro/novembro/dezembro, filtros e detalhes;
classificacao; contato; financeiro read-only; rotas criar/renomear/mover/remover;
DND e F5; C/A/B no clipboard; equipes diferentes bloqueiam, restaurar permite;
rota vazia/sem equipe bloqueiam; CRUD/ordem/reativacao no catalogo; funcao
historica preservada no select; link bidirecional, scroll/destaque, ID invalido;
temas claro/escuro, desktop/tablet/mobile, sem overflow, sem pageerror ou
console.error da aplicacao. Capturas revisadas; contraste do catalogo e quebra
dos controles no mobile corrigidos e retestados antes de versionar.
Nenhum dado de producao alterado. Bancos e servidores descartaveis encerrados.

Arquivos frontend:
- src/api/localApi.js
- src/components/config/FuncoesEquipeSection.jsx
- src/components/eventos/EventoDetalhes.jsx
- src/pages/Configuracoes.jsx
- src/pages/NoiteNatal.jsx
- src/styles/noiteNatal.css
- src/utils/noiteNatal.js
- scripts/qaNoiteNatal.mjs
- scripts/qaNatalRotas.mjs
- scripts/testMensagemRota.mjs

Arquivos backend:
- db/migrations/002_funcoes_equipe.sql
- src/services/funcoesEquipeService.js
- src/routes/funcoesEquipeRoutes.js
- src/index.js
- scripts/migrateFuncoesEquipe.js
- scripts/testFuncoesEquipe.js
- scripts/testNoiteNatal.js
- tests/contract-parser-report.md (resultado da regressao)
- docs/noite-natal-rotas-funcoes.md
