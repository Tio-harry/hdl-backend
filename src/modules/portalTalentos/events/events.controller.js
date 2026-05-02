const {
  createEvent,
  deleteEvent,
  getEventById,
  getEventsHealth,
  listEvents,
  updateEvent,
  updateStatus,
} = require('./events.service');
const { PortalTalentosError } = require('../shared/errors');

function handleError(res, error, fallbackMessage) {
  if (error instanceof PortalTalentosError || error.statusCode) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      message: error.message,
      details: error.details || undefined,
    });
  }

  console.error(fallbackMessage, error);
  return res.status(500).json({
    ok: false,
    message: fallbackMessage,
  });
}

function handleEventsHealth(_req, res) {
  res.json(getEventsHealth());
}

async function handleListEvents(req, res) {
  try {
    const events = await listEvents(req.query);
    return res.json({ ok: true, dados: events });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao listar eventos.');
  }
}

async function handleGetEvent(req, res) {
  try {
    const event = await getEventById(req.params.id);
    return res.json({ ok: true, dados: event });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao consultar evento.');
  }
}

async function handleCreateEvent(req, res) {
  try {
    const event = await createEvent(req.body);
    return res.status(201).json({ ok: true, dados: event });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao criar evento.');
  }
}

async function handleUpdateEvent(req, res) {
  try {
    const event = await updateEvent(req.params.id, req.body);
    return res.json({ ok: true, dados: event });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao atualizar evento.');
  }
}

async function handleUpdateStatus(req, res) {
  try {
    const event = await updateStatus(req.params.id, req.body);
    return res.json({ ok: true, dados: event });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao atualizar status do evento.');
  }
}

async function handleDeleteEvent(req, res) {
  try {
    const result = await deleteEvent(req.params.id);
    return res.json(result);
  } catch (error) {
    return handleError(res, error, 'Erro interno ao excluir evento.');
  }
}

module.exports = {
  handleCreateEvent,
  handleDeleteEvent,
  handleEventsHealth,
  handleGetEvent,
  handleListEvents,
  handleUpdateEvent,
  handleUpdateStatus,
};
