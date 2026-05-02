const {
  createOpportunity,
  deleteOpportunity,
  getOpportunitiesHealth,
  getOpportunityByIdentifier,
  listOpportunities,
  listPublicOpportunities,
  updateOpportunity,
  updateStatus,
  updateVisibility,
} = require('./opportunities.service');
const { PortalTalentosError } = require('../shared/errors');

function handleOpportunitiesHealth(_req, res) {
  res.json(getOpportunitiesHealth());
}

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

async function handleListOpportunities(req, res) {
  try {
    const opportunities = await listOpportunities(req.query);
    return res.json({
      ok: true,
      dados: opportunities,
    });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao listar oportunidades.');
  }
}

async function handleListPublicOpportunities(_req, res) {
  try {
    const opportunities = await listPublicOpportunities();
    return res.json({
      ok: true,
      dados: opportunities,
    });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao listar oportunidades publicas.');
  }
}

async function handleGetOpportunity(req, res) {
  try {
    const opportunity = await getOpportunityByIdentifier(req.params.id);
    return res.json({
      ok: true,
      dados: opportunity,
    });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao consultar oportunidade.');
  }
}

async function handleCreateOpportunity(req, res) {
  try {
    const opportunity = await createOpportunity(req.body);
    return res.status(201).json({
      ok: true,
      dados: opportunity,
    });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao criar oportunidade.');
  }
}

async function handleUpdateOpportunity(req, res) {
  try {
    const opportunity = await updateOpportunity(req.params.id, req.body);
    return res.json({
      ok: true,
      dados: opportunity,
    });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao atualizar oportunidade.');
  }
}

async function handleUpdateStatus(req, res) {
  try {
    const opportunity = await updateStatus(req.params.id, req.body);
    return res.json({
      ok: true,
      dados: opportunity,
    });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao atualizar status da oportunidade.');
  }
}

async function handleUpdateVisibility(req, res) {
  try {
    const opportunity = await updateVisibility(req.params.id, req.body);
    return res.json({
      ok: true,
      dados: opportunity,
    });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao atualizar visibilidade da oportunidade.');
  }
}

async function handleDeleteOpportunity(req, res) {
  try {
    const result = await deleteOpportunity(req.params.id);
    return res.json(result);
  } catch (error) {
    return handleError(res, error, 'Erro interno ao excluir oportunidade.');
  }
}

module.exports = {
  handleCreateOpportunity,
  handleDeleteOpportunity,
  handleGetOpportunity,
  handleListOpportunities,
  handleListPublicOpportunities,
  handleOpportunitiesHealth,
  handleUpdateOpportunity,
  handleUpdateStatus,
  handleUpdateVisibility,
};
