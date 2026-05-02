const {
  createCandidate,
  deleteCandidate,
  getCandidateByCpf,
  getCandidateById,
  getCandidatesHealth,
  listCandidates,
  updateCandidate,
  updateOpportunityProfile,
} = require('./candidates.service');
const { PortalTalentosError } = require('../shared/errors');

function handleCandidatesHealth(_req, res) {
  res.json(getCandidatesHealth());
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

async function handleListCandidates(req, res) {
  try {
    const candidates = await listCandidates(req.query);
    return res.json({
      ok: true,
      dados: candidates,
    });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao listar candidatos.');
  }
}

async function handleGetCandidateById(req, res) {
  try {
    const candidate = await getCandidateById(req.params.id);
    return res.json({
      ok: true,
      dados: candidate,
    });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao consultar candidato.');
  }
}

async function handleGetCandidateByCpf(req, res) {
  try {
    const candidate = await getCandidateByCpf(req.params.cpf);
    return res.json({
      ok: true,
      dados: candidate,
    });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao consultar candidato por CPF.');
  }
}

async function handleCreateCandidate(req, res) {
  try {
    const candidate = await createCandidate(req.body);
    return res.status(201).json({
      ok: true,
      dados: candidate,
    });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao criar candidato.');
  }
}

async function handleUpdateCandidate(req, res) {
  try {
    const candidate = await updateCandidate(req.params.id, req.body);
    return res.json({
      ok: true,
      dados: candidate,
    });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao atualizar candidato.');
  }
}

async function handleUpdateOpportunityProfile(req, res) {
  try {
    const candidate = await updateOpportunityProfile(req.params.id, req.body);
    return res.json({
      ok: true,
      dados: candidate,
    });
  } catch (error) {
    return handleError(res, error, 'Erro interno ao atualizar perfil de oportunidades.');
  }
}

async function handleDeleteCandidate(req, res) {
  try {
    const result = await deleteCandidate(req.params.id);
    return res.json(result);
  } catch (error) {
    return handleError(res, error, 'Erro interno ao excluir candidato.');
  }
}

module.exports = {
  handleCreateCandidate,
  handleCandidatesHealth,
  handleDeleteCandidate,
  handleGetCandidateByCpf,
  handleGetCandidateById,
  handleListCandidates,
  handleUpdateCandidate,
  handleUpdateOpportunityProfile,
};
