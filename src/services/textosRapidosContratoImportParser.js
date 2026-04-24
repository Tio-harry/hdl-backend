/**
 * Parser para importação em lote de textos rápidos do gerador de contrato (.txt).
 *
 * Formato:
 * [CATEGORIA: Serviços]
 * BOTAO: Nome
 * ORDEM: 1        (opcional)
 * TEXTO: conteúdo… (pode ter várias linhas até o próximo BOTAO:, ORDEM: ou [CATEGORIA:])
 */

const CATEGORIAS = new Set(['Serviços', 'Extras', 'Valores']);

function parseTextosRapidosContratoImport(raw) {
  const avisos = [];
  const items = [];
  const lines = String(raw ?? '').split(/\r?\n/);
  let i = 0;
  let categoriaAtual = null;
  /** @type {{ nome_botao: string, ordem: number | null, texto?: string } | null} */
  let atual = null;

  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t) {
      i += 1;
      continue;
    }

    const mCat = t.match(/^\[CATEGORIA:\s*(.+?)\]\s*$/i);
    if (mCat) {
      const nomeCat = mCat[1].trim();
      if (!CATEGORIAS.has(nomeCat)) {
        avisos.push({
          tipo: 'categoria',
          mensagem: `Categoria desconhecida "${nomeCat}" — use Serviços, Extras ou Valores. Bloco ignorado até próxima categoria válida.`,
        });
        categoriaAtual = null;
      } else {
        categoriaAtual = nomeCat;
      }
      i += 1;
      continue;
    }

    const mBotao = t.match(/^BOTAO:\s*(.*)$/i);
    if (mBotao) {
      atual = {
        nome_botao: (mBotao[1] ?? '').trim(),
        ordem: null,
      };
      i += 1;
      continue;
    }

    if (atual && /^ORDEM:\s*/i.test(t)) {
      const rest = t.replace(/^ORDEM:\s*/i, '').trim();
      const n = parseInt(rest, 10);
      if (rest !== '' && !Number.isFinite(n)) {
        avisos.push({
          tipo: 'ordem',
          mensagem: `ORDEM inválida "${rest}" para o botão "${atual.nome_botao || '(sem nome)'}". Usando 0.`,
          botao: atual.nome_botao,
        });
        atual.ordem = 0;
      } else {
        atual.ordem = Number.isFinite(n) ? n : 0;
      }
      i += 1;
      continue;
    }

    if (atual && /^TEXTO:\s*/i.test(t)) {
      let primeira = t.replace(/^TEXTO:\s*/i, '');
      const partes = primeira ? [primeira] : [];
      i += 1;
      while (i < lines.length) {
        const u = lines[i];
        const uTrim = u.trim();
        if (/^(BOTAO:|ORDEM:|\[CATEGORIA:)/i.test(uTrim)) break;
        partes.push(u);
        i += 1;
      }
      const texto = partes.join('\n').trimEnd();
      const nome = (atual.nome_botao || '').trim();

      if (!categoriaAtual || !CATEGORIAS.has(categoriaAtual)) {
        avisos.push({
          tipo: 'item',
          mensagem: 'Item ignorado: nenhuma categoria válida ativa antes deste TEXTO.',
          botao: nome || '(sem nome)',
        });
      } else if (!nome) {
        avisos.push({
          tipo: 'item',
          mensagem: 'Item ignorado: BOTAO vazio.',
        });
      } else if (!texto) {
        avisos.push({
          tipo: 'item',
          mensagem: 'Item ignorado: TEXTO vazio.',
          botao: nome,
        });
      } else {
        const ordem = atual.ordem != null && Number.isFinite(atual.ordem) ? atual.ordem : 0;
        items.push({
          nome_botao: nome,
          categoria: categoriaAtual,
          texto,
          ordem,
          ativo: true,
        });
      }
      atual = null;
      continue;
    }

    avisos.push({
      tipo: 'linha',
      mensagem: 'Linha não reconhecida (ignorada).',
      linha: t.length > 120 ? `${t.slice(0, 120)}…` : t,
    });
    i += 1;
  }

  if (atual) {
    avisos.push({
      tipo: 'item',
      mensagem: 'Item incompleto no fim do arquivo (faltou TEXTO). Ignorado.',
      botao: (atual.nome_botao || '').trim() || '(sem nome)',
    });
  }

  return { items, avisos };
}

module.exports = {
  parseTextosRapidosContratoImport,
  CATEGORIAS_TEXTO_RAPIDO: [...CATEGORIAS],
};
