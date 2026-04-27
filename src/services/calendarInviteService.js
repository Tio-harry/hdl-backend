const { buildModeloEventoTexto } = require('./escalaConfirmacaoEmailTemplate');

const TZID = 'America/Recife';
const ORGANIZER_MAIL = 'horadolazer@gmail.com';
const ORGANIZER_CN = 'Hora do Lazer';
const ICS_FILENAME = 'Convite do evento - Hora do Lazer.ics';
const DEFAULT_DURATION_MIN = 180;
const DATA_BR_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const HORA_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

function strField(value) {
  if (value == null || value === '') return '';
  return String(value).trim();
}

function parseDataEventoBR(raw) {
  const s = strField(raw);
  if (!s) return null;
  const m = s.match(DATA_BR_RE);
  if (!m) return null;
  const d = Number.parseInt(m[1], 10);
  const mo = Number.parseInt(m[2], 10);
  const y = Number.parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const test = new Date(y, mo - 1, d);
  if (test.getFullYear() !== y || test.getMonth() !== mo - 1 || test.getDate() !== d) return null;
  return { y, m: mo, d };
}

function parseHora(raw) {
  const s = strField(raw);
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === 'não informado' || lower === 'nao informado') return null;
  const m = s.match(HORA_RE);
  if (!m) return null;
  const h = Number.parseInt(m[1], 10);
  const min = Number.parseInt(m[2], 10);
  const sec = m[3] != null ? Number.parseInt(m[3], 10) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(min) || !Number.isFinite(sec)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59 || sec < 0 || sec > 59) return null;
  return { h, min, sec };
}

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, mo) {
  const md = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mo === 2 && isLeapYear(y)) return 29;
  return md[mo - 1];
}

/** Adiciona dias a (y, mo, d), retornando novo triple. */
function addDays(y, mo, d, deltaDays) {
  let nd = d + deltaDays;
  let nmo = mo;
  let ny = y;
  while (nd > daysInMonth(ny, nmo)) {
    nd -= daysInMonth(ny, nmo);
    nmo += 1;
    if (nmo > 12) {
      nmo = 1;
      ny += 1;
    }
  }
  while (nd < 1) {
    nmo -= 1;
    if (nmo < 1) {
      nmo = 12;
      ny -= 1;
    }
    nd += daysInMonth(ny, nmo);
  }
  return { y: ny, m: nmo, d: nd };
}

/** minutos desde meia-noite + deltaMin; retorna { y,m,d,h,min,sec } no mesmo dia ou dias seguintes. */
function addMinutesToDateTime(y, mo, d, h, min, sec, deltaMin) {
  const startMin = h * 60 + min;
  const totalMin = startMin + deltaMin;
  const dayOff = Math.floor(totalMin / (24 * 60));
  const rem = ((totalMin % (24 * 60)) + 24 * 60) % (24 * 60);
  const nh = Math.floor(rem / 60);
  const nmin = rem % 60;
  const { y: y2, m: m2, d: d2 } = addDays(y, mo, d, dayOff);
  return { y: y2, m: m2, d: d2, h: nh, min: nmin, sec };
}

function toIcsDateTimeLocal(y, mo, d, h, min, sec) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(y, 4)}${pad(mo)}${pad(d)}T${pad(h)}${pad(min)}${pad(sec)}`;
}

function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Valor do parâmetro CN (entre aspas) para ORGANIZER/ATTENDEE. */
function quoteIcsCn(value) {
  const t = strField(value) || 'Recreador';
  return `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r\n|\r|\n/g, ' ')}"`;
}

function formatDtstampUtc() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  );
}

function computeEndDateTime(y, mo, d, sh, smin, ssec, horaFimRaw) {
  const startSec = sh * 3600 + smin * 60 + ssec;
  const endParsed = parseHora(horaFimRaw);

  if (!endParsed) {
    return addMinutesToDateTime(y, mo, d, sh, smin, ssec, DEFAULT_DURATION_MIN);
  }

  const endSec = endParsed.h * 3600 + endParsed.min * 60 + endParsed.sec;
  if (endSec <= startSec) {
    return addMinutesToDateTime(y, mo, d, sh, smin, ssec, DEFAULT_DURATION_MIN);
  }

  return { y, m: mo, d, h: endParsed.h, min: endParsed.min, sec: endParsed.sec };
}

/**
 * @returns {{ ok: true, attachment: object } | { ok: false, reason: string }}
 */
function tryBuildEscalaCalendarInvite({
  evento,
  recreadorNome,
  recreadorEmail,
  nomesEquipe,
  escalaId,
  colaboradorId,
}) {
  try {
    const dateParts = parseDataEventoBR(evento?.data_evento);
    const horaInicio = parseHora(evento?.hora_inicio);
    if (!dateParts || !horaInicio) {
      return { ok: false, reason: 'data_ou_hora_inicio_invalida' };
    }

    const { y, m: mo, d } = dateParts;
    const { h: sh, min: smin, sec: ssec } = horaInicio;
    const endParts = computeEndDateTime(y, mo, d, sh, smin, ssec, evento?.hora_fim);

    const dtStart = toIcsDateTimeLocal(y, mo, d, sh, smin, ssec);
    const dtEnd = toIcsDateTimeLocal(
      endParts.y,
      endParts.m,
      endParts.d,
      endParts.h,
      endParts.min,
      endParts.sec
    );

    const contratante = strField(evento?.contratante_nome) || 'Contratante';
    const summary = `Escala Hora do Lazer - ${contratante}`;
    const location = strField(evento?.endereco_evento) || 'Não informado';

    const nomeLinha = `${strField(recreadorNome) || 'Recreador'}, você está escalado para este evento.`;
    const eventoTexto = buildModeloEventoTexto(evento, nomesEquipe);
    const description = `${nomeLinha}\n\n${eventoTexto}`;

    const uid = `escala-${String(escalaId || '').trim()}-colaborador-${String(colaboradorId || '').trim()}@horadolazer.com.br`;
    const dtStamp = formatDtstampUtc();

    const attendeeMail = strField(recreadorEmail).toLowerCase();
    const attendeeName = strField(recreadorNome) || 'Recreador';

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Hora do Lazer//Gestao Operacional//PT-BR',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART;TZID=${TZID}:${dtStart}`,
      `DTEND;TZID=${TZID}:${dtEnd}`,
      `ORGANIZER;CN=${quoteIcsCn(ORGANIZER_CN)}:mailto:${ORGANIZER_MAIL}`,
      ...(attendeeMail
        ? [`ATTENDEE;CN=${quoteIcsCn(attendeeName)};RSVP=TRUE:mailto:${attendeeMail}`]
        : []),
      'SEQUENCE:0',
      'STATUS:TENTATIVE',
      `SUMMARY:${escapeIcsText(summary)}`,
      `LOCATION:${escapeIcsText(location)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(
        'Lembrete: você está escalado para um evento da Hora do Lazer amanhã.'
      )}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ];

    const content = lines.join('\r\n') + '\r\n';

    return {
      ok: true,
      attachment: {
        filename: ICS_FILENAME,
        content,
        contentType: 'text/calendar; charset=utf-8; method=REQUEST',
      },
    };
  } catch (e) {
    return { ok: false, reason: `erro_interno:${e?.message || 'unknown'}` };
  }
}

module.exports = {
  tryBuildEscalaCalendarInvite,
};
