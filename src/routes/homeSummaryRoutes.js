const express = require('express');
const { handleGetHomeSummary } = require('../controllers/homeSummaryController');

function createHomeSummaryRouter() {
  const router = express.Router();
  router.get('/home/summary', handleGetHomeSummary);
  return router;
}

module.exports = {
  createHomeSummaryRouter,
};
