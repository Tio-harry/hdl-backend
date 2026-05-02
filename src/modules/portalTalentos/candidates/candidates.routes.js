const express = require('express');
const {
  handleCandidatesHealth,
  handleCreateCandidate,
  handleDeleteCandidate,
  handleGetCandidateByCpf,
  handleGetCandidateById,
  handleListCandidates,
  handleUpdateCandidate,
  handleUpdateOpportunityProfile,
} = require('./candidates.controller');

function createCandidatesRouter() {
  const router = express.Router();

  router.get('/health', handleCandidatesHealth);
  router.get('/', handleListCandidates);
  router.get('/by-cpf/:cpf', handleGetCandidateByCpf);
  router.get('/:id', handleGetCandidateById);
  router.post('/', handleCreateCandidate);
  router.put('/:id', handleUpdateCandidate);
  router.patch('/:id/opportunity-profile', handleUpdateOpportunityProfile);
  router.delete('/:id', handleDeleteCandidate);

  return router;
}

module.exports = {
  createCandidatesRouter,
};
