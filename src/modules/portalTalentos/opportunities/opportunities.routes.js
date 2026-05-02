const express = require('express');
const {
  handleCreateOpportunity,
  handleDeleteOpportunity,
  handleGetOpportunity,
  handleListOpportunities,
  handleListPublicOpportunities,
  handleOpportunitiesHealth,
  handleUpdateOpportunity,
  handleUpdateStatus,
  handleUpdateVisibility,
} = require('./opportunities.controller');

function createOpportunitiesRouter() {
  const router = express.Router();

  router.get('/health', handleOpportunitiesHealth);
  router.get('/', handleListOpportunities);
  router.get('/public', handleListPublicOpportunities);
  router.get('/:id', handleGetOpportunity);
  router.post('/', handleCreateOpportunity);
  router.put('/:id', handleUpdateOpportunity);
  router.patch('/:id/status', handleUpdateStatus);
  router.patch('/:id/visibility', handleUpdateVisibility);
  router.delete('/:id', handleDeleteOpportunity);

  return router;
}

module.exports = {
  createOpportunitiesRouter,
};
