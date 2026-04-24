const {
  AuthError,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  authenticateUser,
  createPasswordResetRequest,
  invalidateSessionByToken,
  resetPasswordWithToken,
  validatePasswordResetToken,
} = require('../services/authService');
const { getSessionTokenFromRequest } = require('../middleware/authMiddleware');

function buildSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}

function getRequestIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

async function handleLogin(req, res) {
  try {
    const email = req.body?.email;
    const senha = req.body?.senha ?? req.body?.password;

    if (!email || !senha) {
      return res.status(400).json({
        ok: false,
        message: 'Email e senha sao obrigatorios.',
      });
    }

    const result = await authenticateUser({
      email,
      senha,
      ip: getRequestIp(req),
      userAgent: req.headers['user-agent'] || null,
    });

    res.cookie(
      SESSION_COOKIE_NAME,
      result.session.rawToken,
      buildSessionCookieOptions()
    );

    return res.json({
      ok: true,
      usuario: result.usuario,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status || 500).json({
        ok: false,
        message: error.message,
      });
    }

    console.error('Erro ao realizar login:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro interno ao realizar login.',
    });
  }
}

async function handleLogout(req, res) {
  try {
    const sessionToken = getSessionTokenFromRequest(req);
    if (sessionToken) {
      await invalidateSessionByToken(sessionToken);
    }

    clearSessionCookie(res);

    return res.json({
      ok: true,
      message: 'Logout realizado com sucesso.',
    });
  } catch (error) {
    console.error('Erro ao realizar logout:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro interno ao realizar logout.',
    });
  }
}

async function handleMe(req, res) {
  try {
    const authContext = req.auth;
    if (!authContext?.usuario) {
      return res.status(401).json({
        ok: false,
        message: 'Nao autenticado.',
      });
    }

    return res.json({
      ok: true,
      usuario: authContext.usuario,
      sessao: {
        expira_em: authContext.expira_em
          ? new Date(authContext.expira_em).toISOString()
          : null,
        duracao_ms: SESSION_DURATION_MS,
      },
    });
  } catch (error) {
    console.error('Erro ao consultar usuario autenticado:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro interno ao consultar usuario autenticado.',
    });
  }
}

async function handleForgotPassword(req, res) {
  try {
    const email = req.body?.email;
    const resetRequest = await createPasswordResetRequest({
      email,
      ip: getRequestIp(req),
      userAgent: req.headers['user-agent'] || null,
    });

    const response = {
      ok: true,
      message: 'Se este email estiver cadastrado e ativo, as instrucoes de recuperacao serao enviadas.',
    };

    if (resetRequest.exposed) {
      response.dev = {
        resetToken: resetRequest.resetToken,
        resetLink: resetRequest.resetLink,
        expira_em: resetRequest.expiresAt ? resetRequest.expiresAt.toISOString() : null,
      };
    }

    return res.json(response);
  } catch (error) {
    console.error('Erro ao solicitar recuperacao de senha:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro interno ao solicitar recuperacao de senha.',
    });
  }
}

async function handleValidateResetPasswordToken(req, res) {
  try {
    const token = req.params.token;
    const validToken = await validatePasswordResetToken(token);

    if (!validToken) {
      return res.status(400).json({
        ok: false,
        valido: false,
        message: 'Token de recuperacao invalido ou expirado.',
      });
    }

    return res.json({
      ok: true,
      valido: true,
      expira_em: validToken.expira_em ? validToken.expira_em.toISOString() : null,
    });
  } catch (error) {
    console.error('Erro ao validar token de recuperacao:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro interno ao validar token de recuperacao.',
    });
  }
}

async function handleResetPassword(req, res) {
  try {
    const token = req.body?.token;
    const novaSenha = req.body?.nova_senha ?? req.body?.senha;

    if (!token || !novaSenha) {
      return res.status(400).json({
        ok: false,
        message: 'Token e nova senha sao obrigatorios.',
      });
    }

    await resetPasswordWithToken({ token, novaSenha });

    return res.json({
      ok: true,
      message: 'Senha redefinida com sucesso.',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status || 500).json({
        ok: false,
        message: error.message,
      });
    }

    console.error('Erro ao redefinir senha:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro interno ao redefinir senha.',
    });
  }
}

module.exports = {
  handleForgotPassword,
  handleLogin,
  handleLogout,
  handleMe,
  handleResetPassword,
  handleValidateResetPasswordToken,
};
