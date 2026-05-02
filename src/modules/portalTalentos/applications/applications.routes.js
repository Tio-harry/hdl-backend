const express = require('express');
const {
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
} = require('./applications.controller');

function createApplicationsRouter() {
  const router = express.Router();

  router.get('/health', handleApplicationsHealth);
  router.get('/', handleListApplications);
  router.get('/by-candidate/:candidateId', handleListByCandidate);
  router.get('/by-opportunity/:opportunityId', handleListByOpportunity);
  router.get('/:id', handleGetApplication);
  router.post('/', handleCreateApplication);
  router.put('/:id', handleUpdateApplication);
  router.patch('/:id/status', handleUpdateStatus);
  router.patch('/:id/virtual-selection', handleUpdateVirtualSelection);
  router.patch('/:id/evaluation', handleUpdateEvaluation);
  router.patch('/:id/communication', handleUpdateCommunication);
  router.delete('/:id', handleDeleteApplication);

  return router;
}

module.exports = {
  createApplicationsRouter,
};
