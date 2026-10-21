# Contratos e operacao Natal: extracao, navegacao e PDF

## Preflight e limites

- Backend base: 5cf800037da63ef494efdbedb9c07edd8d56baf9, main limpa.
- Frontend base: b02783208e29fc908bce97311fdc2f5eec506d18, main; somente .codex_portal_tmp/ preexistente e nao rastreada, preservada/excluida do commit.
- Nenhuma migration nova. As migrations 001/002 existentes foram usadas apenas pelo harness em banco local descartavel.
- Nenhum deploy, acesso a VPS ou alteracao no evento real 199. QA usa banco hdl_natal_test_* criado de schema local, sem copiar dados operacionais, e removido ao encerrar.

## Nome e duracao

O fallback de extractLooseName aceitava a linha inteira porque Nome/Nome cliente nao eram labels reconhecidos. contractExtractionRules agora extrai apenas labels no inicio da linha, seguidos por dois-pontos. Reconhece Nome, Nome cliente, Nome do cliente, Cliente, Contratante e Nome completo do contratante, com espacos/caixa tolerantes. Joao Nome da Silva nao sofre remocao de palavras. O nome estruturado chega ao preview, contrato, evento e PDF.

O parser atual continua calculando 3h em buildHorarioValues. A regra complementar e aplicada apenas na extracao, pelos processadores sem IA e com IA. Nao roda ao salvar/reabrir contrato.

Precedencia: intervalo explicito ou rotulo de termino > duracao explicita > Visita Noite de Natal com 20min > resultado geral existente. A expressao principal e reconhecida no servico normalizado (acentos, pontuacao, caixa e espacos), sem apagar sua descricao. Uma linha de servico sem rotulo iniciada pela expressao tambem e reconhecida.

Papai Noel, Duende, Chegada do Papai Noel, Recreacao de Natal, Video do Papai Noel e Evento de Natal com Papai Noel nao recebem 20min. Chegada permanece inicio menos20min. Edicao manual do fim para21:00 foi salva/reaberta e permaneceu21:00; teste unitario cobre21:10 explicito,40min e1h, alem da virada da meia-noite.

## Achados no QA real do gerador

- Editar somente horario recalculava todos os valores a partir dos itens, mesmo sem edicao financeira. Agora essa edicao preserva total/entrada/saldo; a regra existente de soma continua quando os itens sao efetivamente alterados.
- IA retornava unico item sem preco embora houvesse Valor:470,00. Apos normalizar itens, o total explicitamente informado pode preencher esse unico item sem preco, somente se nao houver extras e ele coincidir com valor_total. Nao inventa preco nem altera soma de itens precificados.
- O inferidor de cidade examinava nome e servico: Cliente Teste Natal/Visita Noite de Natal disparava Natal-RN apesar de endereco em Recife. Agora consulta local ou linha explicita de endereco, nao o texto inteiro. Natal-RN em endereco real continua funcionando.
- A pintura branca do texto CONTRATANTE contaminava a faixa seguinte CONTRATADA no jsPDF. A cor de preenchimento agora e restabelecida antes da segunda faixa. Nenhuma assinatura/clausula foi alterada.

## Navegacao e operacao

- Configuracoes antes: Home, Agenda(/AgendaEventos), Eventos(/eventos), Equipe.
- Depois: Home, Agenda(/eventos), Equipe.
- Causa: /AgendaEventos monta o componente standalone; /eventos monta Eventos com o encapsulamento/layout oficial e depois AgendaEventos. Nao era um problema para esconder com CSS.
- NoiteNatal recebeu Home(/), Contrato(/contratos) e o componente compartilhado GestaoEquipeEntryShortcut(/gestao-equipe). Voltar a Agenda(/eventos) foi preservado sem criar segundo atalho Agenda.
- Titulo alterado para Custo total da operacao, sem modificar calculos/permissoes.
- Removida a linha redundante de aceites no card quando a equipe compartilhada ja esta apresentada. Equipe N/N escalados permanece.

## PDF

- Mesmo ContractPDFGenerator/jsPDF. isDecemberContract considera data_evento em DD/MM/AAAA ou ISO, sem conversao de fuso; data de criacao/emissao nao decide o tema.
- Dezembro: faixas verde discreto, labels verdes e filete dourado na margem superior de cada pagina. Sem consumir altura do conteudo e sem nova pagina decorativa.
- Preview informa que o PDF tera detalhes natalinos e que o conteudo contratual permanece igual.
- Mesmo tema discreto para Papai Noel/Visita Noite de Natal e outros eventos de dezembro, sem adicionar textos comerciais. Nao foi criado segundo gerador.
- Novembro e janeiro continuam com tema azul, sem decoracao. Unica correcao comum adicional: faixa CONTRATADA legivel.
- Mantidos CNPJ, telefone, logo, textos legais, condicoes, assinaturas, margens, ordem e calculos. Nao houve redesign.

## Validacao executada

Backend:

```text
node --check src/index.js
node --check src/services/aiContractOrganizerService.js
node --check src/services/contractExtractionRules.js
node scripts/testContractParserCases.js
npm.cmd run test:contract-parser
node scripts/testContractNatal.js
node scripts/testContractNatalAI.js
node scripts/testNoiteNatal.js --serve
git diff --check
```

- Bancada 9/9: oito casos anteriores preservados e ex09-natal-nome-duracao novo.
- testContractNatal cobre labels, nome legitimo, variacoes de servico, exclusoes, duracao, termino explicito, chegada, meia-noite e regra compartilhada de IA.
- testContractNatalAI e teste deterministico com resposta simulada, sem chamada externa: valida pos-processamento inclusive item ausente/nulo e cidade Recife/Natal. Nao e apresentado como QA real da IA.
- testNoiteNatal --serve executa todos os testes de integracao antes de disponibilizar backend descartavel: sessao, classificacao, contrato/evento, rotas, conflitos, concorrencia, custos historicos e catalogo de funcoes.

Frontend:

```text
node scripts/testNoiteNatal.mjs
node scripts/testMensagemRota.mjs
node scripts/testCustosNatal.mjs
node scripts/testContractPdfTheme.mjs
node scripts/qaNoiteNatal.mjs
node scripts/qaContractNatal.mjs
npm.cmd run build
git diff --check
```

- QA Chrome/Playwright com Vite e backend reais em localhost, banco descartavel e conta ficticia. qaContractNatal usa tambem o botao Organizar com IA com resposta REAL do servico configurado.
- Ambos os botoes: nome limpo,20:30-20:50, chegada20:10; editar fim21:00, salvar, reabrir, baixar PDF; evento unico vinculado e servico_principal_id=visita. Total470, entrada235 e saldo235. No fluxo IA, item470 e cidadeRecife tambem verificados.
- Atalhos oficiais de Configuracoes/NoiteNatal testados por clique, sem pagina preta/pageerror/console.error.
- Agenda outubro/novembro/dezembro: expandir/recolher, filtros, detalhes, classificacao, equipe, aceite e pagamento/restauracao somente nas fixtures.
- Natal: DND real por ponteiro, F5, ordem persistida na copia, logistica, custos por visita,1/3/6 rotas+vazia,30visitas, claro/escuro e desktop/tablet/mobile sem overflow. Sem alteracao dos calculos financeiros ou das regras de rotas.
- O teste antigo de DND supunha ordem inicial fixa apos tres insercoes por coordenadas. Com cards menores isso nao era garantido. Agora calcula a ordem esperada a partir do DOM anterior ao movimento, exige alteracao real e confere persistencia e clipboard. Nao altera a implementacao do DND.
- PDF gerado em30/11,01/12,24/12,31/12,01/01 e com40itens. Revisao visual de paginas renderizadas, incluindo acentos, logo, assinatura, valores e clausulas, sem decoracao sobre texto.
- Limitacao explicita: os exemplos completos preservando o template/logo resultaram em2paginas, inclusive o curto. Nao foi forcada uma versao de1pagina reduzindo fontes/margens/conteudo. A paginacao original foi preservada.
- Artefatos PDF/screenshots somente em TEMP, fora dos commits. Poppler emitiu avisos locais de fontes auxiliares, mas renderizou os documentos; os acentos foram conferidos visualmente.
- Build aprovado com avisos de bases Browserslist/baseline antigas. Nao houve atualizacao de dependencias. Diff check sem erros reais; avisos LF/CRLF nao sao falhas.

## Arquivos da rodada

Backend:
- src/services/contractExtractionRules.js
- src/services/contractTextParser.js
- src/services/aiContractOrganizerService.js
- scripts/testContractNatal.js
- scripts/testContractNatalAI.js
- tests/contract-parser-cases/ex09-natal-nome-duracao/entrada.txt
- tests/contract-parser-cases/ex09-natal-nome-duracao/esperado.json
- tests/contract-parser-report.md
- docs/contratos-natal-gerador-qa.md

Frontend:
- src/pages/Configuracoes.jsx
- src/pages/NoiteNatal.jsx
- src/components/contract/ContractPDFGenerator.jsx
- src/components/contract/ExtractedDataPreview.jsx
- src/utils/contractPdfTheme.js
- scripts/testContractPdfTheme.mjs
- scripts/qaContractNatal.mjs
- scripts/qaNatalRotas.mjs

Nao alterados: schema/migrations, package.json/lock, financeiro da operacao, valores das escalas, pagamentos, QR, modelo das rotas, CRM, Portal Talentos e autenticacao. Nao ha atualizacao em massa de contratos/eventos. Commits e comparacao dos tres hashes de cada repositorio sao entregues no fechamento apos o push.

## Repetir localmente

Abrir PowerShell no backend e executar node scripts/testNoiteNatal.js --serve. Abrir outra janela no frontend e definir QA_PLAYWRIGHT_MODULE para o caminho do Playwright instalado. Executar primeiro qaNoiteNatal; reiniciar o harness para fixtures limpas antes de repetir esse teste. qaContractNatal pode ser executado no mesmo harness apos a regressao. Ao terminar, pressionar Enter na janela backend para desligar servidor e remover apenas o banco descartavel. Os scripts de QA fecham seus servidores Vite e Chrome automaticamente.

## Publicacao futura (nao executada)

Quando autorizar a publicacao, abrir o terminal SSH da VPS. Conferir working tree antes de prosseguir; se houver alteracoes locais ou falha, parar, sem reset/force. Caminhos e servico conforme runbook existente:

```bash
cd /var/www/hdl-app/hdl-backend
git status --short
git pull --ff-only origin main
node --check src/index.js
sudo systemctl restart hdl-backend.service
sudo systemctl status hdl-backend.service --no-pager
git log -1 --oneline

cd /var/www/hdl-app/gest-o-operacional-hora-do-lazer
git status --short
git pull --ff-only origin main
npm run build
git log -1 --oneline
```

Nao aplicar nova migration: nao existe migration deste bloco. No navegador, atualizar sem cache; abrir Contratos e testar com um contrato descartavel, nunca evento199. Conferir nome limpo,20min, editar fim e reabrir; comparar PDF de dezembro com novembro; conferir assinatura CONTRATADA. Em Configuracoes, Agenda deve abrir /eventos. Em NoiteNatal, conferir atalhos, titulo do custo e quantidade de escalados. Validar tambem no celular antes de uso operacional.
