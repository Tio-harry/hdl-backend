const express = require('express');
const { ACCESS_PERMISSIONS, requirePermission } = require('../middleware/authMiddleware');
const {
  getCustosOperacionaisEvento,
  listCustosOperacionais,
  updateCustoOperacional,
} = require('../services/custosOperacionaisService');

function handler(fn) {
  return async (req, res) => {
    try {
      const dados = await fn(req, res);
      if (!res.headersSent) res.json({ ok: true, dados });
    } catch (error) {
      res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
    }
  };
}

function createCustosOperacionaisRouter(pool) {
  const router = express.Router();
  router.use(
    ['/custos-operacionais', '/eventos/:id/custos-operacionais', '/eventos/:id/custos-operacionais/:tipo'],
    requirePermission(ACCESS_PERMISSIONS.FINANCEIRO_VIEW)
  );
  router.get('/custos-operacionais', handler(() => listCustosOperacionais(pool)));
  router.get('/eventos/:id/custos-operacionais', handler((req) => getCustosOperacionaisEvento(pool, req.params.id)));
  router.patch(
    '/eventos/:id/custos-operacionais/:tipo',
    requirePermission(ACCESS_PERMISSIONS.FINANCEIRO_EDIT),
    handler((req) => updateCustoOperacional(pool, req))
  );
  return router;
}

module.exports = { createCustosOperacionaisRouter };
