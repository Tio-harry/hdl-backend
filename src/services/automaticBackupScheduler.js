const {
  BACKUP_TIMEZONE,
  generateAutomaticBackup,
} = require('./automaticBackupService');

const SCHEDULE_HOUR = 3;
const SCHEDULE_MINUTE = 15;

let currentTimer = null;
let schedulerStarted = false;

function msUntilNextRun(now = new Date()) {
  const next = new Date(now);
  next.setHours(SCHEDULE_HOUR, SCHEDULE_MINUTE, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

async function runScheduledBackup() {
  try {
    const result = await generateAutomaticBackup();
    console.log(
      `[backup automatico] Backup gerado em ${result.arquivo.caminho} (${result.arquivo.bytes} bytes)`
    );
  } catch (error) {
    console.error('[backup automatico] Falha ao gerar backup automático:', error);
  } finally {
    scheduleNextAutomaticBackup();
  }
}

function scheduleNextAutomaticBackup() {
  if (currentTimer) {
    clearTimeout(currentTimer);
  }
  const delay = msUntilNextRun();
  const nextRun = new Date(Date.now() + delay);
  console.log(
    `[backup automatico] Próxima execução agendada para ${nextRun.toLocaleString('pt-BR', {
      timeZone: BACKUP_TIMEZONE,
    })} (${BACKUP_TIMEZONE})`
  );
  currentTimer = setTimeout(() => {
    runScheduledBackup();
  }, delay);
}

function startAutomaticBackupScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  scheduleNextAutomaticBackup();
}

module.exports = {
  SCHEDULE_HOUR,
  SCHEDULE_MINUTE,
  msUntilNextRun,
  startAutomaticBackupScheduler,
};
