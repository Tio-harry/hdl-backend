function parseEventoDateLocal(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function startOfDayLocal(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function addDaysLocal(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function toSafeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function parseEventoChecklist(checklist) {
  if (!checklist) return {};
  if (typeof checklist === 'object') return checklist;
  if (typeof checklist === 'string') {
    try {
      const parsed = JSON.parse(checklist);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeDashboardText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseHoraToMinutes(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return hour * 60 + minute;
}

function formatCurrencyBr(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function enrichItemCatalogSummaryRow(row) {
  if (!row) return row;
  const emRaw = row.quantidade_em_posse;
  const emPosse =
    typeof emRaw === 'bigint'
      ? Number(emRaw)
      : typeof emRaw === 'number' && Number.isFinite(emRaw)
        ? Math.max(0, Math.floor(emRaw))
        : Math.max(0, parseInt(String(emRaw ?? '0'), 10) || 0);
  const total = row.quantidade_total;
  let disponivel = null;
  if (total != null && Number.isFinite(Number(total)) && Number.isInteger(Number(total)) && Number(total) >= 0) {
    disponivel = Math.max(0, Number(total) - emPosse);
  }
  return { ...row, quantidade_em_posse: emPosse, quantidade_disponivel: disponivel };
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  );
}

function buildSummaryItem(base) {
  return compactObject({
    id: base.id,
    tipo: base.tipo,
    titulo: base.titulo,
    descricao: base.descricao,
    quantidade: base.quantidade,
    valor: base.valor,
    valorFormatado: base.valorFormatado,
    prioridade: base.prioridade,
    origem: base.origem,
    origemModulo: base.origemModulo,
    rotaDestino: base.rotaDestino,
    tipoDestino: base.tipoDestino,
    eventoId: base.eventoId,
    eventoIds: base.eventoIds,
    filtro: base.filtro,
    itemCatalogId: base.itemCatalogId,
    dataReferencia: base.dataReferencia,
  });
}

function buildEventoLabel(evento) {
  const nome = String(evento?.contratante_nome || 'Evento').trim() || 'Evento';
  const data = String(evento?.data_evento || '').trim();
  return data ? `${nome} em ${data}` : nome;
}

function buildEventoNavigation(eventoId, extra = {}) {
  return compactObject({
    rotaDestino: '/eventos',
    tipoDestino: 'evento_especifico',
    eventoId,
    origemModulo: 'agenda',
    filtro: compactObject({
      eventoId,
      ...(extra.filtro || {}),
    }),
  });
}

function buildEventosRelacionadosNavigation(eventoIds, extra = {}) {
  return compactObject({
    rotaDestino: '/eventos',
    tipoDestino: 'eventos_relacionados',
    eventoIds,
    origemModulo: 'agenda',
    filtro: compactObject({
      eventoIds,
      ...(extra.filtro || {}),
    }),
  });
}

function buildListNavigation(rotaDestino, origemModulo, filtro) {
  return compactObject({
    rotaDestino,
    tipoDestino: filtro ? 'lista_filtrada' : 'lista_geral',
    origemModulo,
    filtro,
  });
}

function createSortKeyFromDate(date, fallbackId) {
  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    return `${String(date.getTime()).padStart(20, '0')}:${fallbackId}`;
  }
  return `99999999999999999999:${fallbackId}`;
}

function finalizeSummaryItems(items) {
  return items
    .slice()
    .sort((a, b) => String(a._sortKey || '').localeCompare(String(b._sortKey || '')))
    .map(({ _sortKey, ...item }) => item);
}

module.exports = {
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
};
