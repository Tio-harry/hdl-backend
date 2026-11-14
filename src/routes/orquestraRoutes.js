const { createHash, timingSafeEqual } = require('node:crypto');
const { Router } = require('express');
const {
  civilDate, listRecreadores, getRecreador, listEventos, getEvento, getEquipe,
} = require('../services/orquestraService');

const PREFIX = '/api/integracao/v1';
const TOKEN_PATTERN = /^[A-Za-z0-9._~+/-]+=*$/;

function digest(token) {
  return createHash('sha256').update(token, 'utf8').digest();
}

function erro(res, status, codigo) {
  return res.status(status).json({ ok: false, erro: codigo });
}

function dados(res, value) {
  if (value === null) return erro(res, 404, 'NAO_ENCONTRADO');
  return res.json({ ok: true, dados: value });
}

function mountOrquestraRouter(app, pool, token = process.env.HDL_ORQUESTRA_API_TOKEN) {
  const router = Router();
  const expected = token && TOKEN_PATTERN.test(token) ? digest(token) : null;

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const received = /^Bearer +([^ ]+)$/i.exec(req.get('Authorization') || '')?.[1];
    if (!expected || !received || !timingSafeEqual(expected, digest(received))) {
      res.set('WWW-Authenticate', 'Bearer');
      return erro(res, 401, 'NAO_AUTENTICADO');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.set('Allow', 'GET, HEAD');
      return erro(res, 405, 'METODO_NAO_PERMITIDO');
    }
    return next();
  });

  router.param('id', (req, res, next, id) => {
    if (id.includes('\0')) return erro(res, 400, 'REQUISICAO_INVALIDA');
    return next();
  });

  router.get('/status', (_req, res) => {
    res.json({ ok: true, service: 'gestao-operacional', version: 'v1' });
  });

  router.get('/recreadores', async (req, res) => {
    const { regiao, ativo } = req.query;
    if ((regiao !== undefined && (typeof regiao !== 'string' || !regiao.trim() || regiao.includes('\0'))) ||
        (ativo !== undefined && ativo !== 'true' && ativo !== 'false')) {
      return erro(res, 400, 'FILTRO_INVALIDO');
    }
    return dados(res, await listRecreadores(pool, regiao ?? null, ativo === undefined ? null : ativo === 'true'));
  });

  router.get('/recreadores/:id', async (req, res) => {
    return dados(res, await getRecreador(pool, req.params.id));
  });

  router.get('/eventos', async (req, res) => {
    const { inicio, fim, status } = req.query;
    if (!civilDate(inicio) || !civilDate(fim) || inicio > fim ||
        (status !== undefined && (typeof status !== 'string' || !status.trim() || status.includes('\0')))) {
      return erro(res, 400, 'FILTRO_INVALIDO');
    }
    return dados(res, await listEventos(pool, inicio, fim, status ?? null));
  });

  router.get('/eventos/:id', async (req, res) => {
    return dados(res, await getEvento(pool, req.params.id));
  });

  router.get('/eventos/:id/equipe', async (req, res) => {
    return dados(res, await getEquipe(pool, req.params.id));
  });

  router.use((_req, res) => erro(res, 404, 'NAO_ENCONTRADO'));
  router.use((error, _req, res, _next) => {
    if (error instanceof URIError) return erro(res, 400, 'REQUISICAO_INVALIDA');
    return erro(res, 500, 'ERRO_INTERNO');
  });
  app.use(PREFIX, router);
}

module.exports = { mountOrquestraRouter };
