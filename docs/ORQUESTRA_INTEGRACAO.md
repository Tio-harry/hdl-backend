# HDL Orquestra — API de integração v1

A Gestão Operacional é a fonte oficial de eventos, Agenda, recreadores, regiões e escalas. Consumidores como o CRM devem consultar esta API e manter o vínculo pelos IDs oficiais. O CRM não deve acessar diretamente o PostgreSQL da Gestão.

## Conexão

- URL base esperada: `https://<host-da-gestao>/api/integracao/v1`. O backend registra o mesmo prefixo internamente. Ao habilitar a integração, confirme que o proxy encaminha esse prefixo completo ao backend, inclusive se outras rotas hoje usarem um proxy que remove `/api`.
- Envie `Authorization: Bearer <TOKEN_CONFIGURADO>` pelo backend consumidor, via HTTPS. O serviço lê `HDL_ORQUESTRA_API_TOKEN` na inicialização. Ausência, valor vazio ou formato inválido mantém a integração fechada. Use um token opaco de alta entropia em formato Base64URL, gerado e mantido pelo operador em armazenamento protegido. Configure-o no ambiente privado do serviço `hdl-backend.service` e do futuro backend consumidor. Remova o cabeçalho de logs do proxy e do consumidor. Reinicie o backend apenas na janela de publicação aprovada.
- Depois da publicação autorizada, confira que `GET /status` responde `401` sem credencial e `200` com a credencial, pelo endereço HTTPS do consumidor. A resposta confirma autenticação e versão. Use uma leitura autorizada de Agenda para verificar a conexão com o banco.
- O namespace aceita `GET` e `HEAD` autenticados. Respostas usam `Cache-Control: no-store`. A versão é definida no caminho e mudanças incompatíveis devem usar um novo prefixo.

## Endpoints e filtros

| GET | Retorno em `dados` | Filtros e comportamento |
| --- | --- | --- |
| `/recreadores` | Lista de recreadores | `regiao` opcional, pelo ID oficial de `regions`. `ativo=true\|false` opcional, pelo estado do cadastro. |
| `/recreadores/:id` | Um recreador | ID de `colaboradores.id`. |
| `/eventos` | Lista de eventos | `inicio` e `fim` obrigatórios (inclusivos, `YYYY-MM-DD`). `status` opcional, valor exato de `status_aceite_praca`. |
| `/eventos/:id` | Um evento | ID de `eventos.id`. |
| `/eventos/:id/equipe` | Lista de integrantes | ID de `eventos.id`. Evento existente sem equipe retorna `[]`. |
| `/status` | Resposta direta | `{"ok":true,"service":"gestao-operacional","version":"v1"}`. |

As rotas de dados retornam `{"ok":true,"dados":...}`. As datas e horários representam o calendário civil de `America/Recife`, em `YYYY-MM-DD` e `HH:mm:ss`, sem conversão de fuso. Campos opcionais usam `null`. Datas legadas inválidas ficam fora das listas por período e aparecem como `null` no detalhe.

## Contrato para o CRM

Objetos sintéticos de exemplo, já com os nomes de campos do contrato:

```json
{
  "recreador": {
    "id": "col-teste-01",
    "nome": "Recreadora Teste",
    "regiao": { "id": "reg-teste", "nome": "Região Teste" },
    "ativo": true
  },
  "evento": {
    "id": "evt-teste-01",
    "identificador": "EX-001",
    "data": "2026-05-01",
    "hora_inicio": "14:00:00",
    "hora_fim": null,
    "cidade": "Cidade Teste",
    "status_aceite_praca": "Pendente Praça Teste",
    "qtd_recreadores": 3,
    "qtd_escalados": 1,
    "servico": "Serviço Teste"
  },
  "integrante": {
    "recreador_id": "col-teste-01",
    "nome": "Recreadora Teste",
    "regiao": { "id": "reg-teste", "nome": "Região Teste" },
    "funcao": "Recreador",
    "status_aceite": "Pendente"
  }
}
```

Guarde `evento.id` e `recreador.id` como strings opacas. `integrante.recreador_id` corresponde a `recreador.id` e vem de `escala_eventos.colaborador_id`. Use `identificador` para exibição. A região vem de `colaborador_perfil_equipe.region_id` e pode ser `null`. `ativo` usa o cadastro do colaborador e pode ser `null` em registros legados. `qtd_escalados` conta as linhas atuais da escala, inclusive pendências e recusas, seguindo a contagem da Agenda. `servico` vem do catálogo do serviço principal quando vinculado. A praça e o estado do aceite vêm juntos em `status_aceite_praca`, conforme o dado operacional existente.

A v1 limita o detalhe do evento aos mesmos campos do resumo. Cadastro do contratante, endereço, observações livres, documentos, contatos, dados bancários e valores ficam fora do contrato.

## Erros

Corpo JSON: `{"ok":false,"erro":"CODIGO"}`.

| HTTP | Código |
| --- | --- |
| 400 | `FILTRO_INVALIDO` ou `REQUISICAO_INVALIDA` |
| 401 | `NAO_AUTENTICADO` |
| 404 | `NAO_ENCONTRADO` |
| 405 | `METODO_NAO_PERMITIDO` |
| 500 | `ERRO_INTERNO` |
