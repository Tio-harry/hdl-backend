const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { readOperation, saveOperation, classifyVisit, changeEventPrincipal } = require('../services/natalService');

function createNatalRouter() {
  const router = express.Router();
  router.use('/noite-de-natal', requireAuth, requireRole(['gestor', 'operador']));
  router.patch('/eventos/:eventoId/classificacao-servico', requireAuth, requireRole(['gestor', 'operador']), async (req, res) => {
    try {
      const dados = await changeEventPrincipal(pool, req.params.eventoId, { explicit: req.body?.servico_principal_id });
      res.json({ ok: true, dados });
    } catch (error) {
      res.status(error.status || 500).json({ ok: false, message: error.status ? error.message : 'Nao foi possivel salvar a classificacao.' });
    }
  });
  const handle = (save) => async (req, res) => {
    try {
      const year = Number(req.params.ano);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) return res.status(400).json({ ok: false, message: 'Ano invalido.' });
      let dados;
      if (save === 'classify') dados = await classifyVisit(pool, year, req.params.eventoId, req.body?.confirmado);
      else if (save) dados = await saveOperation(pool, year, req.body);
      else {
        const client = await pool.connect();
        try {
          await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
          dados = await readOperation(client, year);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally { client.release(); }
      }
      return res.json({ ok: true, dados });
    } catch (error) {
      console.error('[noite-de-natal]', error.message);
      return res.status(error.status || 500).json({ ok: false,
        message: error.status ? error.message : 'Nao foi possivel carregar ou salvar a operacao. Verifique a migration.' });
    }
  };
  router.get('/noite-de-natal/:ano', handle(false));
  router.put('/noite-de-natal/:ano', handle(true));
  router.post('/noite-de-natal/:ano/eventos/:eventoId/classificar', handle('classify'));
  return router;
}
module.exports = { createNatalRouter };
