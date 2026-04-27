const nodemailer = require('nodemailer');

function parseBoolEnvTrue(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function parseIntEnv(value, fallback) {
  const n = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function isEmailEnabled() {
  return parseBoolEnvTrue(process.env.EMAIL_ENABLED);
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = String(process.env.SMTP_HOST || '').trim();
  const port = parseIntEnv(process.env.SMTP_PORT, 587);
  const secure = parseBoolEnvTrue(process.env.SMTP_SECURE);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '');
  const connectTimeout = parseIntEnv(process.env.SMTP_CONNECT_TIMEOUT_MS, 10000);
  const socketTimeout = parseIntEnv(process.env.SMTP_SEND_TIMEOUT_MS, 15000);

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: connectTimeout,
    socketTimeout,
  });

  return transporter;
}

async function sendMail({ to, subject, text, html, attachments }) {
  if (!isEmailEnabled()) {
    return { ok: true, skipped: true, reason: 'email_disabled' };
  }

  const from = String(process.env.EMAIL_FROM || '').trim();
  if (!from) {
    return { ok: false, skipped: true, reason: 'missing_email_from' };
  }

  const safeTo = String(to || '').trim();
  if (!safeTo) {
    return { ok: false, skipped: true, reason: 'missing_recipient' };
  }

  try {
    const client = getTransporter();
    const mailOptions = {
      from,
      to: safeTo,
      subject: String(subject || '').trim(),
      text: text != null ? String(text) : '',
      ...(html != null ? { html: String(html) } : {}),
    };
    if (Array.isArray(attachments) && attachments.length > 0) {
      mailOptions.attachments = attachments;
    }
    const info = await client.sendMail(mailOptions);
    return { ok: true, skipped: false, messageId: info?.messageId || null };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      reason: 'smtp_error',
      error,
    };
  }
}

module.exports = {
  isEmailEnabled,
  sendMail,
};
