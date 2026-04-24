const {
  AuthError,
  createUser,
  listUsers,
  resetUserPassword,
  setUserStatus,
  updateUser,
} = require('../services/authService');

function handleAuthAdminError(res, error, fallbackMessage) {
  if (error instanceof AuthError) {
    return res.status(error.status || 500).json({
      ok: false,
      message: error.message,
    });
  }

  console.error(fallbackMessage, error);
  return res.status(500).json({
    ok: false,
    message: fallbackMessage,
  });
}

async function handleListAdminUsers(_req, res) {
  try {
    const dados = await listUsers();
    return res.json({ ok: true, dados });
  } catch (error) {
    return handleAuthAdminError(res, error, 'Erro interno ao listar usuarios.');
  }
}

async function handleCreateAdminUser(req, res) {
  try {
    const usuario = await createUser({
      nome: req.body?.nome,
      email: req.body?.email,
      senha: req.body?.senha,
      perfil: req.body?.perfil,
      ativo: req.body?.ativo,
    });

    return res.status(201).json({
      ok: true,
      dados: usuario,
    });
  } catch (error) {
    return handleAuthAdminError(res, error, 'Erro interno ao criar usuario.');
  }
}

async function handleUpdateAdminUser(req, res) {
  try {
    const usuario = await updateUser(req.params.id, {
      nome: req.body?.nome,
      email: req.body?.email,
      perfil: req.body?.perfil,
      ativo: req.body?.ativo,
    });

    return res.json({
      ok: true,
      dados: usuario,
    });
  } catch (error) {
    return handleAuthAdminError(res, error, 'Erro interno ao atualizar usuario.');
  }
}

async function handleUpdateAdminUserStatus(req, res) {
  try {
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'ativo')) {
      return res.status(400).json({
        ok: false,
        message: 'Campo ativo e obrigatorio.',
      });
    }

    const usuario = await setUserStatus(req.params.id, req.body.ativo);
    return res.json({
      ok: true,
      dados: usuario,
    });
  } catch (error) {
    return handleAuthAdminError(res, error, 'Erro interno ao atualizar status do usuario.');
  }
}

async function handleResetAdminUserPassword(req, res) {
  try {
    const novaSenha = req.body?.nova_senha ?? req.body?.senha;
    if (!novaSenha) {
      return res.status(400).json({
        ok: false,
        message: 'Nova senha e obrigatoria.',
      });
    }

    const usuario = await resetUserPassword(req.params.id, novaSenha);
    return res.json({
      ok: true,
      dados: usuario,
      message: 'Senha redefinida com sucesso.',
    });
  } catch (error) {
    return handleAuthAdminError(res, error, 'Erro interno ao redefinir senha do usuario.');
  }
}

module.exports = {
  handleCreateAdminUser,
  handleListAdminUsers,
  handleResetAdminUserPassword,
  handleUpdateAdminUser,
  handleUpdateAdminUserStatus,
};
