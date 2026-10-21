const express = require('express');
const pool = require('../db');
const { requireAuth, requirePermission, ACCESS_PERMISSIONS } = require('../middleware/authMiddleware');
const { listarFuncoes, salvarFuncao } = require('../services/funcoesEquipeService');
function createFuncoesEquipeRouter() {
  const router = express.Router();
  router.use('/funcoes-equipe', requireAuth);
  const admin = requirePermission(ACCESS_PERMISSIONS.CONFIG_ADMIN_VIEW);
  const handler = (operation) => async (req, res) => {
    try { res.json({ ok: true, dados: await operation(req) }); }
    catch (error) { res.status(error.statusCode || 500).json({ ok: false, message: error.statusCode ? error.message : 'Nao foi possivel acessar o catalogo de funcoes.' }); }
  };
  router.get('/funcoes-equipe', handler(() => listarFuncoes(pool)));
  router.get('/funcoes-equipe/admin', admin, handler(() => listarFuncoes(pool, true)));
  router.post('/funcoes-equipe', admin, handler((req) => salvarFuncao(pool, null, req.body)));
  router.put('/funcoes-equipe/ordem', admin, handler((req) => salvarFuncao(pool, null, req.body, true)));
  router.put('/funcoes-equipe/:id', admin, handler((req) => salvarFuncao(pool, req.params.id, req.body)));
  return router;
}
module.exports = { createFuncoesEquipeRouter };
