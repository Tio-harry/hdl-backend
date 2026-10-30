const express = require('express');
const { ACCESS_PERMISSIONS, requirePermission } = require('../middleware/authMiddleware');
const { destravarCiclo, travarCiclo } = require('../services/ciclosFinanceirosService');

function createCiclosFinanceirosRouter(pool) {
  const router = express.Router();
  const responder = (fn, statusCode = 200) => async (req, res) => {
    try {
      res.status(statusCode).json({ ok: true, dados: await fn(pool, req) });
    } catch (error) {
      res.status(error.statusCode || 500).json({ ok: false, erro: error.message });
    }
  };
  const editar = requirePermission(ACCESS_PERMISSIONS.FINANCEIRO_EDIT);
  router.post('/ciclos-financeiros/travar', editar, responder(travarCiclo, 201));
  router.post('/ciclos-financeiros/:id/destravar', editar, responder(destravarCiclo));
  return router;
}

module.exports = { createCiclosFinanceirosRouter };
