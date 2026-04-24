const {
  AuthError,
  SESSION_COOKIE_NAME,
  getAuthenticatedUserFromToken,
} = require('../services/authService');

const ACCESS_PROFILES = {
  GESTOR: 'gestor',
  OPERADOR: 'operador',
};

const ACCESS_PERMISSIONS = {
  FINANCEIRO_VIEW: 'financeiro.view',
  CONFIG_ADMIN_VIEW: 'config.admin.view',
  CONTRACTS_DELETE: 'contracts.delete',
  REGIONS_CREATE: 'regions.create',
  REGIONS_EDIT: 'regions.edit',
  REGIONS_TOGGLE: 'regions.toggle',
  REGIONS_DELETE: 'regions.delete',
  CATALOG_ITEM_CREATE: 'catalog.item.create',
  CATALOG_ITEM_EDIT: 'catalog.item.edit',
  CATALOG_ITEM_TOGGLE: 'catalog.item.toggle',
  CATALOG_ITEM_DELETE: 'catalog.item.delete',
  COLABORADORES_CREATE: 'colaboradores.create',
  COLABORADORES_EDIT: 'colaboradores.edit',
  COLABORADORES_TOGGLE: 'colaboradores.toggle',
  COLABORADORES_DELETE: 'colaboradores.delete',
  SERVICOS_CREATE: 'servicos.create',
  SERVICOS_EDIT: 'servicos.edit',
  SERVICOS_TOGGLE: 'servicos.toggle',
  SERVICOS_DELETE: 'servicos.delete',
  TEXTOS_RAPIDOS_VIEW: 'textos-rapidos.view',
  TEXTOS_RAPIDOS_MANAGE: 'textos-rapidos.manage',
  TEXTOS_RAPIDOS_DELETE: 'textos-rapidos.delete',
};

const GESTOR_PERMISSION_LIST = [
  ACCESS_PERMISSIONS.FINANCEIRO_VIEW,
  ACCESS_PERMISSIONS.CONFIG_ADMIN_VIEW,
  ACCESS_PERMISSIONS.CONTRACTS_DELETE,
  ACCESS_PERMISSIONS.REGIONS_CREATE,
  ACCESS_PERMISSIONS.REGIONS_EDIT,
  ACCESS_PERMISSIONS.REGIONS_TOGGLE,
  ACCESS_PERMISSIONS.REGIONS_DELETE,
  ACCESS_PERMISSIONS.CATALOG_ITEM_CREATE,
  ACCESS_PERMISSIONS.CATALOG_ITEM_EDIT,
  ACCESS_PERMISSIONS.CATALOG_ITEM_TOGGLE,
  ACCESS_PERMISSIONS.CATALOG_ITEM_DELETE,
  ACCESS_PERMISSIONS.COLABORADORES_CREATE,
  ACCESS_PERMISSIONS.COLABORADORES_EDIT,
  ACCESS_PERMISSIONS.COLABORADORES_TOGGLE,
  ACCESS_PERMISSIONS.COLABORADORES_DELETE,
  ACCESS_PERMISSIONS.SERVICOS_CREATE,
  ACCESS_PERMISSIONS.SERVICOS_EDIT,
  ACCESS_PERMISSIONS.SERVICOS_TOGGLE,
  ACCESS_PERMISSIONS.SERVICOS_DELETE,
  ACCESS_PERMISSIONS.TEXTOS_RAPIDOS_VIEW,
  ACCESS_PERMISSIONS.TEXTOS_RAPIDOS_MANAGE,
  ACCESS_PERMISSIONS.TEXTOS_RAPIDOS_DELETE,
];

const OPERADOR_PERMISSION_LIST = [
  ACCESS_PERMISSIONS.CATALOG_ITEM_CREATE,
  ACCESS_PERMISSIONS.CATALOG_ITEM_EDIT,
  ACCESS_PERMISSIONS.COLABORADORES_CREATE,
  ACCESS_PERMISSIONS.COLABORADORES_EDIT,
  ACCESS_PERMISSIONS.COLABORADORES_TOGGLE,
  ACCESS_PERMISSIONS.SERVICOS_CREATE,
  ACCESS_PERMISSIONS.SERVICOS_EDIT,
  ACCESS_PERMISSIONS.TEXTOS_RAPIDOS_VIEW,
];

function parseCookieHeader(cookieHeader) {
  const cookies = {};
  const rawHeader = String(cookieHeader || '');
  if (!rawHeader.trim()) {
    return cookies;
  }

  for (const part of rawHeader.split(';')) {
    const segment = String(part || '').trim();
    if (!segment) continue;
    const separatorIndex = segment.indexOf('=');
    if (separatorIndex < 0) continue;

    const key = segment.slice(0, separatorIndex).trim();
    const value = segment.slice(separatorIndex + 1).trim();
    if (!key) continue;

    try {
      cookies[key] = decodeURIComponent(value);
    } catch (_) {
      cookies[key] = value;
    }
  }

  return cookies;
}

function getSessionTokenFromRequest(req) {
  const cookies = parseCookieHeader(req?.headers?.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

async function attachOptionalAuth(req, _res, next) {
  try {
    const token = getSessionTokenFromRequest(req);
    if (!token) {
      req.auth = null;
      return next();
    }

    const authContext = await getAuthenticatedUserFromToken(token);
    req.auth = authContext || null;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function requireAuth(req, res, next) {
  try {
    const token = getSessionTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({
        ok: false,
        message: 'Nao autenticado.',
      });
    }

    const authContext = await getAuthenticatedUserFromToken(token);
    if (!authContext?.usuario) {
      return res.status(401).json({
        ok: false,
        message: 'Nao autenticado.',
      });
    }

    req.auth = authContext;
    return next();
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status || 500).json({
        ok: false,
        message: error.message,
      });
    }

    return next(error);
  }
}

function getPermissionsForProfile(profile) {
  const normalizedProfile = String(profile || '').trim().toLowerCase();
  return new Set(
    normalizedProfile === ACCESS_PROFILES.OPERADOR
      ? OPERADOR_PERMISSION_LIST
      : GESTOR_PERMISSION_LIST
  );
}

async function ensureAuthContext(req) {
  if (req.auth?.usuario) {
    return req.auth;
  }

  const token = getSessionTokenFromRequest(req);
  if (!token) {
    throw new AuthError(401, 'Nao autenticado.');
  }

  const authContext = await getAuthenticatedUserFromToken(token);
  if (!authContext?.usuario) {
    throw new AuthError(401, 'Nao autenticado.');
  }

  req.auth = authContext;
  return authContext;
}

function buildForbiddenResponse(res, message = 'Sem permissao para executar esta acao.') {
  return res.status(403).json({
    ok: false,
    message,
  });
}

function requirePermission(permission, options = {}) {
  const forbiddenMessage = options.message || 'Sem permissao para executar esta acao.';

  return async function permissionMiddleware(req, res, next) {
    try {
      const authContext = await ensureAuthContext(req);
      const permissions = getPermissionsForProfile(authContext.usuario?.perfil);

      if (!permissions.has(permission)) {
        return buildForbiddenResponse(res, forbiddenMessage);
      }

      return next();
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(error.status || 500).json({
          ok: false,
          message: error.message,
        });
      }

      return next(error);
    }
  };
}

function requireRole(allowedProfiles, options = {}) {
  const profiles = Array.isArray(allowedProfiles) ? allowedProfiles : [allowedProfiles];
  const allowed = new Set(profiles.map((profile) => String(profile || '').trim().toLowerCase()));
  const forbiddenMessage = options.message || 'Sem permissao para executar esta acao.';

  return async function roleMiddleware(req, res, next) {
    try {
      const authContext = await ensureAuthContext(req);
      const profile = String(authContext.usuario?.perfil || '').trim().toLowerCase();

      if (!allowed.has(profile)) {
        return buildForbiddenResponse(res, forbiddenMessage);
      }

      return next();
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(error.status || 500).json({
          ok: false,
          message: error.message,
        });
      }

      return next(error);
    }
  };
}

function requireMutationPermission({
  toggleField,
  togglePermission,
  defaultPermission,
  forbiddenMessage,
}) {
  return async function mutationPermissionMiddleware(req, res, next) {
    try {
      const authContext = await ensureAuthContext(req);
      const permissions = getPermissionsForProfile(authContext.usuario?.perfil);
      const targetPermission = Object.prototype.hasOwnProperty.call(req.body || {}, toggleField)
        ? togglePermission
        : defaultPermission;

      if (!permissions.has(targetPermission)) {
        return buildForbiddenResponse(
          res,
          forbiddenMessage || 'Sem permissao para executar esta acao.'
        );
      }

      return next();
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(error.status || 500).json({
          ok: false,
          message: error.message,
        });
      }

      return next(error);
    }
  };
}

module.exports = {
  ACCESS_PERMISSIONS,
  ACCESS_PROFILES,
  attachOptionalAuth,
  getPermissionsForProfile,
  getSessionTokenFromRequest,
  parseCookieHeader,
  requireMutationPermission,
  requireAuth,
  requirePermission,
  requireRole,
};
