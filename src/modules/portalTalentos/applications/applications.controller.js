const {
  createApplication,
  deleteApplication,
  getApplicationById,
  getApplicationsHealth,
  listApplications,
  listByCandidate,
  listByOpportunity,
  updateApplication,
  updateCommunication,
  updateEvaluation,
  updateStatus,
  updateVirtualSelection,
} = require('./applications.service');
const { PortalTalentosError } = require('../shared/errors');

function handleApplicationsHealth(_req, res) {
  res.json(getApplicationsHealth());
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

async function handleListApplications(req, res) {
  try {
    const applications = await listApplications(req.query);
    return res.json({ ok: true, dados: applications });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao listar candidaturas.');
  }
}

async function handleGetApplication(req, res) {
  try {
    const application = await getApplicationById(req.params.id);
    return res.json({ ok: true, dados: application });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao consultar candidatura.');
  }
}

async function handleListByCandidate(req, res) {
  try {
    const applications = await listByCandidate(req.params.candidateId);
    return res.json({ ok: true, dados: applications });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao listar candidaturas do candidato.');
  }
}

async function handleListByOpportunity(req, res) {
  try {
    const applications = await listByOpportunity(req.params.opportunityId);
    return res.json({ ok: true, dados: applications });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao listar candidaturas da oportunidade.');
  }
}

async function handleCreateApplication(req, res) {
  try {
    const application = await createApplication(req.body);
    return res.status(201).json({ ok: true, dados: application });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao criar candidatura.');
  }
}

async function handleUpdateApplication(req, res) {
  try {
    const application = await updateApplication(req.params.id, req.body);
    return res.json({ ok: true, dados: application });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao atualizar candidatura.');
  }
}

async function handleUpdateStatus(req, res) {
  try {
    const application = await updateStatus(req.params.id, req.body);
    return res.json({ ok: true, dados: application });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao atualizar status da candidatura.');
  }
}

async function handleUpdateVirtualSelection(req, res) {
  try {
    const application = await updateVirtualSelection(req.params.id, req.body);
    return res.json({ ok: true, dados: application });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao atualizar processo virtual.');
  }
}

async function handleUpdateEvaluation(req, res) {
  try {
    const application = await updateEvaluation(req.params.id, req.body);
    return res.json({ ok: true, dados: application });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao atualizar avaliacao.');
  }
}

async function handleUpdateCommunication(req, res) {
  try {
    const application = await updateCommunication(req.params.id, req.body);
    return res.json({ ok: true, dados: application });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao atualizar comunicacao.');
  }
}

async function handleDeleteApplication(req, res) {
  try {
    const result = await deleteApplication(req.params.id);
    return res.json(result);
  } catch (error) {
    return handleError(res, error, 'Erro interno ao excluir candidatura.');
  }
}

module.exports = {
  handleApplicationsHealth,
  handleCreateApplication,
  handleDeleteApplication,
  handleGetApplication,
  handleListApplications,
  handleListByCandidate,
  handleListByOpportunity,
  handleUpdateApplication,
  handleUpdateCommunication,
  handleUpdateEvaluation,
  handleUpdateStatus,
  handleUpdateVirtualSelection,
};
