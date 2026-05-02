const express = require('express');
const { createCandidatesRouter } = require('./candidates/candidates.routes');
const { createOpportunitiesRouter } = require('./opportunities/opportunities.routes');
const { createApplicationsRouter } = require('./applications/applications.routes');
const { createEventsRouter } = require('./events/events.routes');

function createPortalTalentosRouter() {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      module: 'portal-talentos',
    });
  });

  router.use('/candidates', createCandidatesRouter());
  router.use('/opportunities', createOpportunitiesRouter());
  router.use('/applications', createApplicationsRouter());
  router.use('/events', createEventsRouter());

  return router;
}

module.exports = {
  createPortalTalentosRouter,
};
