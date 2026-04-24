const pool = require('../db');
const {
  addDaysLocal,
  buildEventoLabel,
  buildEventoNavigation,
  buildEventosRelacionadosNavigation,
  buildListNavigation,
  buildSummaryItem,
  createSortKeyFromDate,
  enrichItemCatalogSummaryRow,
  finalizeSummaryItems,
  formatCurrencyBr,
  normalizeDashboardText,
  parseEventoChecklist,
  parseEventoDateLocal,
  parseHoraToMinutes,
  startOfDayLocal,
  toSafeNumber,
} = require('./homeSummaryHelpers');

const ITEM_CATALOG_SUMMARY_SQL = `
  SELECT ic.*, COALESCE(pos.em_posse, 0)::integer AS quantidade_em_posse
  FROM item_catalog ic
  LEFT JOIN (
    SELECT item_catalog_id, SUM(COALESCE(quantidade, 0)) AS em_posse
    FROM colaborador_item_catalog
    GROUP BY item_catalog_id
  ) pos ON pos.item_catalog_id = ic.id
`;

async function fetchHomeSummaryBaseData() {
  const [eventosResult, escalasResult, itemCatalogResult, recentMovementsResult] = await Promise.all([
    pool.query(`
      SELECT
        id,
        contratante_nome,
        data_evento,
        hora_inicio,
        hora_fim,
        servico_contratado,
        servicos_adicionais,
        qtd_recreadores,
        sinal,
        sinal_confirmado,
        resta,
        status_financeiro,
        checklist
      FROM eventos
      ORDER BY
        CASE
          WHEN data_evento ~ '^\\d{2}/\\d{2}/\\d{4}$'
          THEN to_date(data_evento, 'DD/MM/YYYY')
        END ASC NULLS LAST,
        created_at DESC
    `),
    pool.query(`
      SELECT
        id,
        evento_id,
        colaborador_id,
        colaborador_nome,
        status_pagamento
      FROM escala_eventos
      ORDER BY created_at ASC, colaborador_nome ASC
    `),
    pool.query(`
      ${ITEM_CATALOG_SUMMARY_SQL}
      WHERE ic.ativo = TRUE
      ORDER BY ic.nome_item ASC
    `),
    pool.query(`
      SELECT COUNT(*)::int AS total
      FROM colaborador_item_catalog
      WHERE COALESCE(updated_at, created_at) >= NOW() - INTERVAL '7 days'
    `),
  ]);

  return {
    eventos: eventosResult.rows || [],
    escalas: escalasResult.rows || [],
    itensCatalogo: (itemCatalogResult.rows || []).map(enrichItemCatalogSummaryRow),
    recentMovementsCount: Number(recentMovementsResult.rows?.[0]?.total || 0),
  };
}

function buildHomeSummaryFromData({ eventos = [], escalas = [], itensCatalogo = [], recentMovementsCount = 0, now = new Date() }) {
  const dataReferencia = now.toISOString();
  const todayStart = startOfDayLocal(now);
  const weekEnd = addDaysLocal(todayStart, 6);
  const next15Days = addDaysLocal(todayStart, 15);
  const next72Hours = new Date(now.getTime() + 72 * 60 * 60 * 1000);

  const escalasPorEvento = new Map();
  for (const escala of escalas) {
    const key = String(escala?.evento_id ?? '').trim();
    if (!key) continue;
    if (!escalasPorEvento.has(key)) escalasPorEvento.set(key, []);
    escalasPorEvento.get(key).push(escala);
  }

  const eventosPorId = new Map(eventos.map((evento) => [String(evento.id), evento]));

  const criticas = [];
  const operacionais = [];
  const informativas = [];

  let eventosHoje = 0;
  let eventosSemana = 0;
  let pendenciasFinanceiras = 0;
  let materiaisAProvidenciar = 0;
  let extrasPendentes = 0;
  let equipeEscaladaSemana = 0;
  let recebimentosPrevistos = 0;
  let sinaisPendentes = 0;
  let eventosSemEquipe = 0;
  let eventosEquipeIncompleta = 0;
  let servicosNaoPreenchidos = 0;
  let colaboradoresSemPagamento = 0;
  let gruposCriar = 0;

  const alertasEquipeEventos = new Set();
  const pendenciasFinanceirasEventos = new Set();
  const eventosProximosComAcao = new Set();

  for (const evento of eventos) {
    const eventoId = String(evento?.id ?? '').trim();
    const dataEvento = parseEventoDateLocal(evento?.data_evento);
    const checklist = parseEventoChecklist(evento?.checklist);
    const escalasEvento = escalasPorEvento.get(eventoId) || [];
    const qtdNecessaria = Math.max(0, Math.floor(toSafeNumber(evento?.qtd_recreadores)));

    const isToday = dataEvento ? dataEvento.getTime() === todayStart.getTime() : false;
    const inWeek = dataEvento ? dataEvento >= todayStart && dataEvento <= weekEnd : false;
    const in15Days = dataEvento ? dataEvento >= todayStart && dataEvento <= next15Days : false;
    const in72Hours = dataEvento ? dataEvento >= todayStart && dataEvento <= next72Hours : false;
    const isUpcoming = dataEvento ? dataEvento >= todayStart : false;
    const isAfterEventoDate = dataEvento ? todayStart.getTime() > dataEvento.getTime() : false;
    const eventoLabel = buildEventoLabel(evento);
    const sortKey = createSortKeyFromDate(dataEvento, eventoId);

    if (isToday) eventosHoje += 1;
    if (inWeek) {
      eventosSemana += 1;
      equipeEscaladaSemana += escalasEvento.length;
    }

    const sinalPendente = inWeek && toSafeNumber(evento?.sinal) > 0 && !evento?.sinal_confirmado;
    const saldoPendente =
      inWeek &&
      isAfterEventoDate &&
      toSafeNumber(evento?.resta) > 0 &&
      normalizeDashboardText(evento?.status_financeiro) !== 'finalizado';

    if (sinalPendente || saldoPendente) {
      pendenciasFinanceirasEventos.add(eventoId);
    }

    if (sinalPendente) {
      sinaisPendentes += 1;
      criticas.push({
        _sortKey: sortKey,
        ...buildSummaryItem({
          id: `sinal-pendente-${eventoId}`,
          tipo: 'sinal_pendente_confirmacao',
          titulo: 'Sinal pendente de confirmacao',
          descricao: `${eventoLabel} ainda esta com sinal lancado e nao confirmado.`,
          prioridade: 'alta',
          origem: 'eventos',
          dataReferencia,
          ...buildEventoNavigation(eventoId, { filtro: { tipo: 'sinal_pendente_confirmacao' } }),
        }),
      });
    }

    if (saldoPendente) {
      recebimentosPrevistos += Math.max(toSafeNumber(evento?.resta), 0);
      criticas.push({
        _sortKey: sortKey,
        ...buildSummaryItem({
          id: `saldo-pendente-${eventoId}`,
          tipo: 'saldo_pendente',
          titulo: 'Saldo pendente de recebimento',
          descricao: `${eventoLabel} ainda possui saldo em aberto.`,
          prioridade: 'media',
          origem: 'eventos',
          dataReferencia,
          ...buildEventoNavigation(eventoId, { filtro: { tipo: 'saldo_pendente' } }),
        }),
      });
    }

    if (sinalPendente) {
      recebimentosPrevistos += Math.max(toSafeNumber(evento?.sinal), 0);
    }

    if (isUpcoming && escalasEvento.length === 0) {
      eventosSemEquipe += 1;
      alertasEquipeEventos.add(eventoId);
      criticas.push({
        _sortKey: sortKey,
        ...buildSummaryItem({
          id: `evento-sem-equipe-${eventoId}`,
          tipo: 'evento_sem_equipe',
          titulo: 'Evento sem equipe escalada',
          descricao: `${eventoLabel} ainda nao possui recreadores escalados.`,
          prioridade: 'alta',
          origem: 'escala_eventos',
          dataReferencia,
          ...buildEventoNavigation(eventoId, { filtro: { tipo: 'evento_sem_equipe' } }),
        }),
      });
    }

    if (isUpcoming && qtdNecessaria > 0 && escalasEvento.length < qtdNecessaria) {
      eventosEquipeIncompleta += 1;
      alertasEquipeEventos.add(eventoId);
      criticas.push({
        _sortKey: sortKey,
        ...buildSummaryItem({
          id: `equipe-incompleta-${eventoId}`,
          tipo: 'equipe_incompleta',
          titulo: 'Equipe incompleta',
          descricao: `${eventoLabel} possui ${escalasEvento.length} escalado(s) para ${qtdNecessaria} necessario(s).`,
          prioridade: 'alta',
          origem: 'escala_eventos',
          dataReferencia,
          ...buildEventoNavigation(eventoId, { filtro: { tipo: 'equipe_incompleta' } }),
        }),
      });
    }

    if (isUpcoming && !String(evento?.servico_contratado ?? '').trim()) {
      servicosNaoPreenchidos += 1;
      criticas.push({
        _sortKey: sortKey,
        ...buildSummaryItem({
          id: `servico-nao-preenchido-${eventoId}`,
          tipo: 'servico_nao_preenchido',
          titulo: 'Evento sem servico principal',
          descricao: `${eventoLabel} ainda nao possui servico principal preenchido.`,
          prioridade: 'media',
          origem: 'eventos',
          dataReferencia,
          ...buildEventoNavigation(eventoId, { filtro: { tipo: 'servico_nao_preenchido' } }),
        }),
      });
    }

    if (normalizeDashboardText(evento?.status_financeiro) === 'finalizado') {
      const temColaboradorNaoPago = escalasEvento.some(
        (escala) => normalizeDashboardText(escala?.status_pagamento) === 'pendente'
      );
      if (temColaboradorNaoPago) {
        colaboradoresSemPagamento += 1;
        criticas.push({
          _sortKey: sortKey,
          ...buildSummaryItem({
            id: `colaborador-pagamento-pendente-${eventoId}`,
            tipo: 'colaborador_sem_pagamento',
            titulo: 'Colaborador com pagamento pendente',
            descricao: `${eventoLabel} foi finalizado, mas ainda possui colaborador com pagamento pendente.`,
            prioridade: 'alta',
            origem: 'escala_eventos',
            dataReferencia,
            ...buildEventoNavigation(eventoId, { filtro: { tipo: 'colaborador_sem_pagamento' } }),
          }),
        });
      }
    }

    if (in15Days && String(evento?.servicos_adicionais ?? '').trim()) {
      extrasPendentes += 1;
      eventosProximosComAcao.add(eventoId);
      operacionais.push({
        _sortKey: sortKey,
        ...buildSummaryItem({
          id: `servicos-adicionais-${eventoId}`,
          tipo: 'servicos_adicionais_pendentes',
          titulo: 'Servico adicional para providenciar',
          descricao: `${eventoLabel} possui servicos adicionais cadastrados para os proximos 15 dias.`,
          prioridade: 'media',
          origem: 'eventos',
          dataReferencia,
          ...buildEventoNavigation(eventoId, { filtro: { tipo: 'servicos_adicionais_pendentes' } }),
        }),
      });
    }

    if (inWeek && checklist?.material_enviado !== true) {
      materiaisAProvidenciar += 1;
      eventosProximosComAcao.add(eventoId);
      operacionais.push({
        _sortKey: sortKey,
        ...buildSummaryItem({
          id: `materiais-providenciar-${eventoId}`,
          tipo: 'materiais_a_providenciar',
          titulo: 'Materiais para providenciar',
          descricao: `${eventoLabel} ainda nao tem material marcado como enviado no checklist.`,
          prioridade: 'media',
          origem: 'eventos',
          dataReferencia,
          ...buildEventoNavigation(eventoId, { filtro: { tipo: 'materiais_a_providenciar' } }),
        }),
      });
    }

    if (in72Hours && checklist?.grupo_criado !== true) {
      gruposCriar += 1;
      eventosProximosComAcao.add(eventoId);
      operacionais.push({
        _sortKey: sortKey,
        ...buildSummaryItem({
          id: `grupo-criar-${eventoId}`,
          tipo: 'grupos_para_criar',
          titulo: 'Grupo da equipe por criar',
          descricao: `${eventoLabel} esta nas proximas 72 horas e ainda nao tem grupo criado no checklist.`,
          prioridade: 'media',
          origem: 'eventos',
          dataReferencia,
          ...buildEventoNavigation(eventoId, { filtro: { tipo: 'grupos_para_criar' } }),
        }),
      });
    }
  }

  let conflitosHorario = 0;
  const conflitosRegistrados = new Set();
  for (let i = 0; i < escalas.length; i += 1) {
    for (let j = i + 1; j < escalas.length; j += 1) {
      const escalaA = escalas[i];
      const escalaB = escalas[j];
      if (!escalaA?.colaborador_id || !escalaB?.colaborador_id) continue;
      if (String(escalaA.colaborador_id) !== String(escalaB.colaborador_id)) continue;
      if (String(escalaA.evento_id) === String(escalaB.evento_id)) continue;

      const eventoA = eventosPorId.get(String(escalaA.evento_id));
      const eventoB = eventosPorId.get(String(escalaB.evento_id));
      if (!eventoA || !eventoB) continue;
      if (String(eventoA.data_evento || '') !== String(eventoB.data_evento || '')) continue;

      const inicioA = parseHoraToMinutes(eventoA.hora_inicio);
      const fimA = parseHoraToMinutes(eventoA.hora_fim);
      const inicioB = parseHoraToMinutes(eventoB.hora_inicio);
      const fimB = parseHoraToMinutes(eventoB.hora_fim);
      if (inicioA == null || fimA == null || inicioB == null || fimB == null) continue;

      const sobrepoe = inicioA < fimB && inicioB < fimA;
      if (!sobrepoe) continue;

      const eventoIdsOrdenados = [String(eventoA.id), String(eventoB.id)].sort();
      const conflitoKey = [String(escalaA.colaborador_id), ...eventoIdsOrdenados].join('|');
      if (conflitosRegistrados.has(conflitoKey)) continue;
      conflitosRegistrados.add(conflitoKey);
      conflitosHorario += 1;

      const sortDate = parseEventoDateLocal(eventoA.data_evento) || parseEventoDateLocal(eventoB.data_evento);
      criticas.push({
        _sortKey: createSortKeyFromDate(sortDate, conflitoKey),
        ...buildSummaryItem({
          id: `conflito-horario-${conflitoKey}`,
          tipo: 'conflito_horario',
          titulo: 'Conflito de horario na escala',
          descricao: `${String(escalaA.colaborador_nome || 'Colaborador').trim() || 'Colaborador'} foi escalado em eventos sobrepostos no mesmo dia.`,
          prioridade: 'alta',
          origem: 'escala_eventos',
          dataReferencia,
          ...buildEventosRelacionadosNavigation(eventoIdsOrdenados, {
            filtro: {
              tipo: 'conflito_horario',
              colaboradorId: String(escalaA.colaborador_id),
              dataEvento: eventoA.data_evento,
            },
          }),
        }),
      });
    }
  }

  const itensEstoqueZerado = itensCatalogo.filter((item) => Number(item.quantidade_disponivel ?? 0) <= 0);
  for (const item of itensEstoqueZerado) {
    criticas.push({
      _sortKey: `88888888888888888888:${String(item.id)}`,
      ...buildSummaryItem({
        id: `estoque-zerado-${item.id}`,
        tipo: 'estoque_zerado',
        titulo: 'Item com estoque zerado',
        descricao: `${String(item.nome_item || 'Item').trim() || 'Item'} esta sem disponibilidade no catalogo.`,
        prioridade: 'media',
        origem: 'item_catalog',
        dataReferencia,
        itemCatalogId: String(item.id),
        ...buildListNavigation('/gestao-equipe', 'gestao_equipe', {
          secao: 'catalogo',
          itemCatalogId: String(item.id),
          tipo: 'estoque_zerado',
        }),
      }),
    });
  }

  informativas.push(
    buildSummaryItem({
      id: 'total-eventos-semana',
      tipo: 'total_eventos_semana',
      titulo: 'Total de eventos na semana',
      descricao: 'Volume total de eventos do dia ate o fim da semana corrente.',
      quantidade: eventosSemana,
      prioridade: 'informativa',
      origem: 'eventos',
      dataReferencia,
      ...buildListNavigation('/eventos', 'agenda', { tipo: 'total_eventos_semana', periodo: 'semana_atual' }),
    }),
    buildSummaryItem({
      id: 'equipe-escalada-semana',
      tipo: 'equipe_escalada_semana',
      titulo: 'Equipe escalada na semana',
      descricao: 'Soma das linhas ja escaladas para os eventos da semana.',
      quantidade: equipeEscaladaSemana,
      prioridade: 'informativa',
      origem: 'escala_eventos',
      dataReferencia,
      ...buildListNavigation('/eventos', 'agenda', { tipo: 'equipe_escalada_semana', periodo: 'semana_atual' }),
    }),
    buildSummaryItem({
      id: 'recebimentos-previstos',
      tipo: 'recebimentos_previstos',
      titulo: 'Recebimentos previstos na semana',
      descricao: 'Estimativa baseada em sinais pendentes e saldos em aberto da semana.',
      valor: recebimentosPrevistos,
      valorFormatado: formatCurrencyBr(recebimentosPrevistos),
      prioridade: 'informativa',
      origem: 'eventos',
      dataReferencia,
      ...buildListNavigation('/financeiro', 'financeiro', { tipo: 'recebimentos_previstos', periodo: 'semana_atual' }),
    }),
    buildSummaryItem({
      id: 'movimentacoes-recentes',
      tipo: 'movimentacoes_recentes',
      titulo: 'Movimentacoes recentes de materiais',
      descricao: 'Quantidade de vinculos de materiais atualizados nos ultimos 7 dias.',
      quantidade: recentMovementsCount,
      prioridade: 'informativa',
      origem: 'colaborador_item_catalog',
      dataReferencia,
      ...buildListNavigation('/gestao-equipe', 'gestao_equipe', { secao: 'materiais', tipo: 'movimentacoes_recentes' }),
    })
  );

  return {
    dataReferencia,
    indicadoresRapidos: {
      eventosHoje,
      eventosSemana,
      pendenciasFinanceiras: pendenciasFinanceirasEventos.size,
      alertasEquipe: alertasEquipeEventos.size,
      materiaisAProvidenciar,
      extrasPendentes,
    },
    criticas: finalizeSummaryItems(criticas),
    operacionais: finalizeSummaryItems(operacionais),
    informativas,
  };
}

async function getHomeSummary() {
  const baseData = await fetchHomeSummaryBaseData();
  return buildHomeSummaryFromData(baseData);
}

module.exports = {
  buildHomeSummaryFromData,
  getHomeSummary,
};
