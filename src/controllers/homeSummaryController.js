const { getHomeSummary } = require('../services/homeSummaryService');

async function handleGetHomeSummary(req, res) {
  try {
    const dados = await getHomeSummary();
    res.json({ ok: true, dados });
  } catch (error) {
    res.status(500).json({
      ok: false,
      erro: error.message || 'Erro ao montar resumo da home.',
    });
  }
}

module.exports = {
  handleGetHomeSummary,
};
