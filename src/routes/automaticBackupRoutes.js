const express = require('express');
const { handleRunAutomaticBackup } = require('../controllers/automaticBackupController');
const { ACCESS_PROFILES, requireRole } = require('../middleware/authMiddleware');

function createAutomaticBackupRouter() {
  const router = express.Router();
  router.post('/backups/automaticos/run', requireRole(ACCESS_PROFILES.GESTOR), handleRunAutomaticBackup);
  return router;
}

module.exports = {
  createAutomaticBackupRouter,
};
