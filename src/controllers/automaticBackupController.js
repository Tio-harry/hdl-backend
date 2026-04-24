const { generateAutomaticBackup } = require('../services/automaticBackupService');

async function handleRunAutomaticBackup(req, res) {
  try {
    const dados = await generateAutomaticBackup();
    res.json({ ok: true, dados });
  } catch (error) {
    res.status(500).json({
      ok: false,
      erro: error.message || 'Erro ao gerar backup automático.',
    });
  }
}

module.exports = {
  handleRunAutomaticBackup,
};
