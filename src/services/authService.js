const crypto = require('crypto');
const pool = require('../db');

const SESSION_COOKIE_NAME = 'hdl_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
const PASSWORD_RESET_DURATION_MS = 1000 * 60 * 30;
const PASSWORD_SCRYPT_PARAMS = {
  cost: 16384,
  blockSize: 8,
  parallelization: 1,
  keyLength: 64,
};
const USER_PROFILES = ['gestor', 'operador'];

class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeProfile(profile) {
  const value = String(profile || '').trim().toLowerCase();
  return USER_PROFILES.includes(value) ? value : null;
}

function normalizeUserName(nome) {
  return String(nome || '').trim();
}

function normalizeActiveValue(value, defaultValue = true) {
  if (value === undefined) return defaultValue;
  if (value === null) return false;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'sim', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'nao', 'não', 'no', 'n', 'off'].includes(normalized)) return false;
  return Boolean(value);
}

function parseDateSafe(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildSafeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    perfil: row.perfil,
    ativo: row.ativo === true,
    ultimo_login_em: row.ultimo_login_em || null,
    criado_em: row.criado_em || null,
    atualizado_em: row.atualizado_em || null,
  };
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function randomToken(size = 32) {
  return crypto.randomBytes(size).toString('base64url');
}

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      PASSWORD_SCRYPT_PARAMS.keyLength,
      {
        N: PASSWORD_SCRYPT_PARAMS.cost,
        r: PASSWORD_SCRYPT_PARAMS.blockSize,
        p: PASSWORD_SCRYPT_PARAMS.parallelization,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      }
    );
  });
}

async function hashPassword(password) {
  const rawPassword = String(password || '');
  if (rawPassword.length < 8) {
    throw new AuthError(400, 'Senha deve ter pelo menos 8 caracteres.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(rawPassword, salt);

  return [
    'scrypt',
    PASSWORD_SCRYPT_PARAMS.cost,
    PASSWORD_SCRYPT_PARAMS.blockSize,
    PASSWORD_SCRYPT_PARAMS.parallelization,
    salt,
    Buffer.from(derivedKey).toString('hex'),
  ].join('$');
}

async function verifyPassword(password, passwordHash) {
  const parts = String(passwordHash || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, costValue, blockSizeValue, parallelizationValue, salt, storedHashHex] = parts;
  const cost = Number(costValue);
  const blockSize = Number(blockSizeValue);
  const parallelization = Number(parallelizationValue);

  if (!cost || !blockSize || !parallelization || !salt || !storedHashHex) {
    return false;
  }

  const storedHash = Buffer.from(storedHashHex, 'hex');
  const derivedKey = await new Promise((resolve, reject) => {
    crypto.scrypt(
      String(password || ''),
      salt,
      storedHash.length,
      { N: cost, r: blockSize, p: parallelization },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      }
    );
  });

  if (!Buffer.isBuffer(derivedKey) || derivedKey.length !== storedHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(derivedKey, storedHash);
}

async function ensureAuthSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      perfil TEXT NOT NULL CHECK (perfil IN ('gestor', 'operador')),
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      ultimo_login_em TIMESTAMP NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessoes_usuario (
      id TEXT PRIMARY KEY,
      usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expira_em TIMESTAMP NOT NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ultimo_acesso_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      user_agent TEXT NULL,
      ip TEXT NULL,
      revogada_em TIMESTAMP NULL
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sessoes_usuario_usuario_id
    ON sessoes_usuario (usuario_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sessoes_usuario_expira_em
    ON sessoes_usuario (expira_em)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expira_em TIMESTAMP NOT NULL,
      usado_em TIMESTAMP NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ip TEXT NULL,
      user_agent TEXT NULL
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_usuario_id
    ON password_reset_tokens (usuario_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expira_em
    ON password_reset_tokens (expira_em)
  `);
}

async function createUser({ nome, email, senha, perfil = 'operador', ativo = true }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedProfile = normalizeProfile(perfil);
  const normalizedName = normalizeUserName(nome);

  if (!normalizedName) {
    throw new AuthError(400, 'Nome do usuario e obrigatorio.');
  }
  if (!normalizedEmail) {
    throw new AuthError(400, 'Email do usuario e obrigatorio.');
  }
  if (!normalizedProfile) {
    throw new AuthError(400, 'Perfil do usuario invalido.');
  }

  const passwordHash = await hashPassword(senha);
  const id = crypto.randomUUID();

  try {
    const result = await pool.query(
      `
        INSERT INTO usuarios (
          id,
          nome,
          email,
          senha_hash,
          perfil,
          ativo
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, nome, email, perfil, ativo, ultimo_login_em, criado_em, atualizado_em
      `,
      [id, normalizedName, normalizedEmail, passwordHash, normalizedProfile, ativo === true]
    );

    return buildSafeUser(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      throw new AuthError(409, 'Ja existe usuario com este email.');
    }
    throw error;
  }
}

async function listUsers() {
  const result = await pool.query(`
    SELECT id, nome, email, perfil, ativo, ultimo_login_em, criado_em, atualizado_em
    FROM usuarios
    ORDER BY criado_em ASC, nome ASC
  `);

  return (result.rows || []).map(buildSafeUser);
}

async function getUserById(userId) {
  const result = await pool.query(
    `
      SELECT *
      FROM usuarios
      WHERE id = $1
      LIMIT 1
    `,
    [String(userId || '').trim()]
  );

  return result.rows?.[0] || null;
}

async function ensureAnotherActiveGestorExists(excludedUserId) {
  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM usuarios
      WHERE perfil = 'gestor'
        AND ativo = TRUE
        AND id <> $1
    `,
    [excludedUserId]
  );

  return Number(result.rows?.[0]?.total || 0) > 0;
}

async function revokeSessionsByUserId(userId) {
  if (!userId) return 0;

  const result = await pool.query(
    `
      UPDATE sessoes_usuario
      SET revogada_em = CURRENT_TIMESTAMP
      WHERE usuario_id = $1
        AND revogada_em IS NULL
      RETURNING id
    `,
    [userId]
  );

  return result.rowCount || 0;
}

async function updateUser(userId, payload = {}) {
  const existingUser = await getUserById(userId);
  if (!existingUser) {
    throw new AuthError(404, 'Usuario nao encontrado.');
  }

  const updateFields = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(payload, 'nome')) {
    const nome = normalizeUserName(payload.nome);
    if (!nome) {
      throw new AuthError(400, 'Nome do usuario e obrigatorio.');
    }
    updateFields.push(`nome = $${values.length + 1}`);
    values.push(nome);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'email')) {
    const email = normalizeEmail(payload.email);
    if (!email) {
      throw new AuthError(400, 'Email do usuario e obrigatorio.');
    }
    updateFields.push(`email = $${values.length + 1}`);
    values.push(email);
  }

  let nextProfile = existingUser.perfil;
  if (Object.prototype.hasOwnProperty.call(payload, 'perfil')) {
    const perfil = normalizeProfile(payload.perfil);
    if (!perfil) {
      throw new AuthError(400, 'Perfil do usuario invalido.');
    }
    nextProfile = perfil;
    updateFields.push(`perfil = $${values.length + 1}`);
    values.push(perfil);
  }

  let nextActive = existingUser.ativo === true;
  if (Object.prototype.hasOwnProperty.call(payload, 'ativo')) {
    nextActive = normalizeActiveValue(payload.ativo, existingUser.ativo === true);
    updateFields.push(`ativo = $${values.length + 1}`);
    values.push(nextActive);
  }

  if (!updateFields.length) {
    throw new AuthError(400, 'Nenhum campo valido para atualizar.');
  }

  const currentIsActiveGestor = existingUser.perfil === 'gestor' && existingUser.ativo === true;
  const losingGestorRole = currentIsActiveGestor && nextProfile !== 'gestor';
  const disablingGestor = currentIsActiveGestor && nextActive !== true;

  if ((losingGestorRole || disablingGestor) && !(await ensureAnotherActiveGestorExists(existingUser.id))) {
    throw new AuthError(400, 'Nao e possivel remover ou inativar o ultimo gestor ativo do sistema.');
  }

  try {
    const result = await pool.query(
      `
        UPDATE usuarios
        SET ${updateFields.join(', ')}, atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $${values.length + 1}
        RETURNING id, nome, email, perfil, ativo, ultimo_login_em, criado_em, atualizado_em
      `,
      [...values, existingUser.id]
    );

    const updatedUser = buildSafeUser(result.rows[0]);

    if (existingUser.ativo === true && updatedUser.ativo !== true) {
      await revokeSessionsByUserId(existingUser.id);
    }

    return updatedUser;
  } catch (error) {
    if (error.code === '23505') {
      throw new AuthError(409, 'Ja existe usuario com este email.');
    }
    throw error;
  }
}

async function setUserStatus(userId, ativo) {
  return updateUser(userId, { ativo });
}

async function resetUserPassword(userId, novaSenha) {
  const existingUser = await getUserById(userId);
  if (!existingUser) {
    throw new AuthError(404, 'Usuario nao encontrado.');
  }

  const senhaHash = await hashPassword(novaSenha);

  await pool.query(
    `
      UPDATE usuarios
      SET senha_hash = $1,
          atualizado_em = CURRENT_TIMESTAMP
      WHERE id = $2
    `,
    [senhaHash, existingUser.id]
  );

  await revokeSessionsByUserId(existingUser.id);

  const updatedUser = await getUserById(existingUser.id);
  return buildSafeUser(updatedUser);
}

async function bootstrapInitialGestor() {
  const countResult = await pool.query(`
    SELECT COUNT(*)::int AS total
    FROM usuarios
    WHERE perfil = 'gestor'
  `);

  const totalGestores = Number(countResult.rows?.[0]?.total || 0);
  if (totalGestores > 0) {
    return { created: false, reason: 'gestor_exists' };
  }

  const email = normalizeEmail(process.env.AUTH_INITIAL_GESTOR_EMAIL);
  const senha = String(process.env.AUTH_INITIAL_GESTOR_PASSWORD || '');
  const nome = String(process.env.AUTH_INITIAL_GESTOR_NOME || '').trim() || 'Gestor Inicial';

  if (!email || !senha) {
    console.warn(
      '[auth] Nenhum gestor encontrado. Defina AUTH_INITIAL_GESTOR_EMAIL e AUTH_INITIAL_GESTOR_PASSWORD para criar o primeiro gestor.'
    );
    return { created: false, reason: 'missing_env' };
  }

  const existingUserResult = await pool.query(
    `
      SELECT id, perfil
      FROM usuarios
      WHERE email = $1
      LIMIT 1
    `,
    [email]
  );

  if (existingUserResult.rows?.length) {
    console.warn(
      `[auth] Nao foi criado gestor inicial porque o email ${email} ja existe com outro cadastro.`
    );
    return { created: false, reason: 'email_exists' };
  }

  const usuario = await createUser({
    nome,
    email,
    senha,
    perfil: 'gestor',
    ativo: true,
  });

  console.log(`[auth] Gestor inicial criado para ${usuario.email}.`);
  return { created: true, usuario };
}

async function findUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT *
      FROM usuarios
      WHERE email = $1
      LIMIT 1
    `,
    [normalizedEmail]
  );

  return result.rows?.[0] || null;
}

async function createUserSession({ userId, ip = null, userAgent = null }) {
  const sessionId = crypto.randomUUID();
  const rawToken = randomToken(32);
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await pool.query(
    `
      INSERT INTO sessoes_usuario (
        id,
        usuario_id,
        token_hash,
        expira_em,
        user_agent,
        ip
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [sessionId, userId, tokenHash, expiresAt, userAgent || null, ip || null]
  );

  return {
    sessionId,
    rawToken,
    expiresAt,
  };
}

async function authenticateUser({ email, senha, ip = null, userAgent = null }) {
  const user = await findUserByEmail(email);
  if (!user) {
    throw new AuthError(401, 'Credenciais invalidas.');
  }

  if (user.ativo !== true) {
    throw new AuthError(403, 'Usuario inativo.');
  }

  const passwordMatches = await verifyPassword(senha, user.senha_hash);
  if (!passwordMatches) {
    throw new AuthError(401, 'Credenciais invalidas.');
  }

  const session = await createUserSession({
    userId: user.id,
    ip,
    userAgent,
  });

  const updatedUserResult = await pool.query(
    `
      UPDATE usuarios
      SET ultimo_login_em = CURRENT_TIMESTAMP,
          atualizado_em = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, nome, email, perfil, ativo, ultimo_login_em, criado_em, atualizado_em
    `,
    [user.id]
  );

  return {
    usuario: buildSafeUser(updatedUserResult.rows[0]),
    session,
  };
}

async function getAuthenticatedUserFromToken(rawToken, { touchSession = true } = {}) {
  const tokenHash = hashSessionToken(rawToken);
  const result = await pool.query(
    `
      SELECT
        s.id AS session_id,
        s.usuario_id,
        s.expira_em,
        u.id,
        u.nome,
        u.email,
        u.perfil,
        u.ativo,
        u.ultimo_login_em,
        u.criado_em,
        u.atualizado_em
      FROM sessoes_usuario s
      INNER JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = $1
        AND s.revogada_em IS NULL
        AND s.expira_em > CURRENT_TIMESTAMP
      LIMIT 1
    `,
    [tokenHash]
  );

  const row = result.rows?.[0];
  if (!row || row.ativo !== true) {
    return null;
  }

  if (touchSession) {
    await pool.query(
      `
        UPDATE sessoes_usuario
        SET ultimo_acesso_em = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [row.session_id]
    );
  }

  return {
    sessionId: row.session_id,
    usuario: buildSafeUser(row),
    expira_em: parseDateSafe(row.expira_em),
  };
}

async function invalidateSessionByToken(rawToken) {
  if (!rawToken) {
    return false;
  }

  const tokenHash = hashSessionToken(rawToken);
  const result = await pool.query(
    `
      UPDATE sessoes_usuario
      SET revogada_em = CURRENT_TIMESTAMP
      WHERE token_hash = $1
        AND revogada_em IS NULL
      RETURNING id
    `,
    [tokenHash]
  );

  return (result.rowCount || 0) > 0;
}

function buildPasswordResetLink(rawToken) {
  const frontendBaseUrl = String(
    process.env.FRONTEND_URL ||
    process.env.APP_FRONTEND_URL ||
    'http://127.0.0.1:5173'
  ).replace(/\/+$/g, '');

  return `${frontendBaseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

function canExposePasswordResetToken() {
  return process.env.NODE_ENV !== 'production' && process.env.AUTH_EXPOSE_RESET_TOKEN === 'true';
}

async function createPasswordResetRequest({ email, ip = null, userAgent = null }) {
  const user = await findUserByEmail(email);
  if (!user || user.ativo !== true) {
    return {
      created: false,
      exposed: false,
    };
  }

  const rawToken = randomToken(32);
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_DURATION_MS);

  await pool.query(
    `
      UPDATE password_reset_tokens
      SET usado_em = CURRENT_TIMESTAMP
      WHERE usuario_id = $1
        AND usado_em IS NULL
    `,
    [user.id]
  );

  await pool.query(
    `
      INSERT INTO password_reset_tokens (
        id,
        usuario_id,
        token_hash,
        expira_em,
        ip,
        user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [crypto.randomUUID(), user.id, tokenHash, expiresAt, ip || null, userAgent || null]
  );

  const exposeToken = canExposePasswordResetToken();

  return {
    created: true,
    exposed: exposeToken,
    expiresAt,
    resetToken: exposeToken ? rawToken : null,
    resetLink: exposeToken ? buildPasswordResetLink(rawToken) : null,
  };
}

async function getValidPasswordResetToken(rawToken, client = pool) {
  const tokenHash = hashSessionToken(rawToken);
  const result = await client.query(
    `
      SELECT
        prt.id,
        prt.usuario_id,
        prt.expira_em,
        prt.usado_em,
        u.id AS user_id,
        u.nome,
        u.email,
        u.perfil,
        u.ativo,
        u.ultimo_login_em,
        u.criado_em,
        u.atualizado_em
      FROM password_reset_tokens prt
      INNER JOIN usuarios u ON u.id = prt.usuario_id
      WHERE prt.token_hash = $1
      LIMIT 1
    `,
    [tokenHash]
  );

  const row = result.rows?.[0];
  if (!row || row.usado_em || row.ativo !== true) {
    return null;
  }

  const expiresAt = parseDateSafe(row.expira_em);
  if (!expiresAt || expiresAt <= new Date()) {
    return null;
  }

  return {
    resetTokenId: row.id,
    usuario: buildSafeUser({
      id: row.user_id,
      nome: row.nome,
      email: row.email,
      perfil: row.perfil,
      ativo: row.ativo,
      ultimo_login_em: row.ultimo_login_em,
      criado_em: row.criado_em,
      atualizado_em: row.atualizado_em,
    }),
    expira_em: expiresAt,
  };
}

async function validatePasswordResetToken(rawToken) {
  if (!rawToken || !String(rawToken).trim()) {
    return null;
  }

  return getValidPasswordResetToken(rawToken);
}

async function resetPasswordWithToken({ token, novaSenha }) {
  if (!token || !String(token).trim()) {
    throw new AuthError(400, 'Token de recuperacao invalido ou expirado.');
  }

  const passwordHash = await hashPassword(novaSenha);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const validToken = await getValidPasswordResetToken(token, client);
    if (!validToken) {
      await client.query('ROLLBACK');
      throw new AuthError(400, 'Token de recuperacao invalido ou expirado.');
    }

    await client.query(
      `
        UPDATE usuarios
        SET senha_hash = $1,
            atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
      [passwordHash, validToken.usuario.id]
    );

    await client.query(
      `
        UPDATE password_reset_tokens
        SET usado_em = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [validToken.resetTokenId]
    );

    await client.query(
      `
        UPDATE password_reset_tokens
        SET usado_em = CURRENT_TIMESTAMP
        WHERE usuario_id = $1
          AND usado_em IS NULL
      `,
      [validToken.usuario.id]
    );

    await client.query(
      `
        UPDATE sessoes_usuario
        SET revogada_em = CURRENT_TIMESTAMP
        WHERE usuario_id = $1
          AND revogada_em IS NULL
      `,
      [validToken.usuario.id]
    );

    await client.query('COMMIT');

    const updatedUser = await getUserById(validToken.usuario.id);
    return buildSafeUser(updatedUser);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // rollback best effort
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  AuthError,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  PASSWORD_RESET_DURATION_MS,
  USER_PROFILES,
  authenticateUser,
  bootstrapInitialGestor,
  buildSafeUser,
  createPasswordResetRequest,
  createUser,
  ensureAuthSchema,
  getAuthenticatedUserFromToken,
  getUserById,
  invalidateSessionByToken,
  listUsers,
  normalizeEmail,
  resetUserPassword,
  resetPasswordWithToken,
  revokeSessionsByUserId,
  setUserStatus,
  updateUser,
  validatePasswordResetToken,
};
