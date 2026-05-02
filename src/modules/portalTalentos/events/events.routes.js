const express = require('express');
const {
  handleCreateEvent,
  handleDeleteEvent,
  handleEventsHealth,
  handleGetEvent,
  handleListEvents,
  handleUpdateEvent,
  handleUpdateStatus,
} = require('./events.controller');

function createEventsRouter() {
  const router = express.Router();

  router.get('/health', handleEventsHealth);
  router.get('/', handleListEvents);
  router.get('/:id', handleGetEvent);
  router.post('/', handleCreateEvent);
  router.put('/:id', handleUpdateEvent);
  router.patch('/:id/status', handleUpdateStatus);
  router.delete('/:id', handleDeleteEvent);

  return router;
}

module.exports = {
  createEventsRouter,
};
