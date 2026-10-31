// Hook leve do Claude Code para os projetos HDL. SOMENTE LEITURA: nao edita arquivos do repositorio,
// nao faz commit/push/deploy, nao usa rede nem chama o Claude. Uso: node hdl-hook.mjs post|stop
// post: depois de Write/Edit, roda `git diff --check` so no arquivo editado.
// stop: antes de encerrar, avisa/bloqueia se houver arquivo proibido no stage.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Unicos comandos git que este hook pode executar (todos de leitura).
const GIT_LEITURA = new Set(['rev-parse', 'status', 'diff']);
const SEM_VERIFICACAO = new Set(['.md', '.mdx', '.txt', '.csv', '.svg', '.map', '.lock']);
const SENSIVEL = /^(\.env(\..*)?|.*\.(pem|key|p12|pfx|jks|keystore|ppk|dump)|id_(rsa|ed25519|ecdsa|dsa)|credentials\.json|\.netrc|\.pgpass|\.git-credentials)$/i;
const PROIBIDO_NO_STAGE = [
  /(^|\/)\.env(\.(?!example$)[^/]*)?$/i,
  /\.(pem|key|p12|pfx|jks|keystore|ppk|dump)$/i,
  /(^|\/)(id_rsa|id_ed25519|id_ecdsa|id_dsa|credentials\.json|\.netrc|\.pgpass|\.git-credentials)$/,
  /(^|\/)(service-account|client_secret)[^/]*\.json$/i,
  /(^|\/)\.claude\/settings\.local\.json$/,
  /(^|\/)\.codex_portal_tmp(\/|$)/,
  /(^|\/)node_modules\//,
  /(^|\/)(auth_cookie_test\.txt|auth_server_[^/]*|authz_server_[^/]*)$/,
  /(^|\/)(backups|uploads)\/(?!\.gitkeep$)/,
  /\.log$/i,
];

function git(cwd, sub, args = []) {
  if (!GIT_LEITURA.has(sub)) throw new Error(`git ${sub} nao permitido neste hook`);
  try {
    const out = execFileSync('git', ['-c', 'core.quotepath=off', '-c', 'core.whitespace=cr-at-eol', sub, ...args], {
      cwd, encoding: 'utf8', timeout: 4000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat' }, maxBuffer: 4 * 1024 * 1024,
    });
    return { ok: true, out };
  } catch (e) {
    if (e.code === 'ENOENT') return { ok: false, semGit: true, out: '' };
    return { ok: false, out: String(e.stdout || ''), code: e.status };
  }
}

const sha = (t) => createHash('sha1').update(t).digest('hex').slice(0, 12);
const emit = (obj) => { process.stdout.write(JSON.stringify(obj)); };

function estado(sessao) {
  const arq = path.join(tmpdir(), 'hdl-claude-hooks', `${String(sessao || 'sem-sessao').replace(/[^\w-]/g, '_')}.json`);
  let dados = {};
  try { dados = JSON.parse(readFileSync(arq, 'utf8')); } catch { /* primeira vez */ }
  return {
    vezes: (k) => dados[k] || 0,
    somar: (k) => {
      dados[k] = (dados[k] || 0) + 1;
      try { mkdirSync(path.dirname(arq), { recursive: true }); writeFileSync(arq, JSON.stringify(dados)); } catch { /* sem estado: segue */ }
    },
  };
}

function aposEdicao(entrada) {
  const alvo = entrada?.tool_input?.file_path;
  if (typeof alvo !== 'string' || !alvo) return;
  const abs = path.resolve(alvo);
  if (SENSIVEL.test(path.basename(abs)) && path.basename(abs).toLowerCase() !== '.env.example') return;
  if (SEM_VERIFICACAO.has(path.extname(abs).toLowerCase())) return;
  let st;
  try { st = statSync(abs); } catch { return; }
  if (!st.isFile() || st.size > 1_500_000) return;

  const topo = git(path.dirname(abs), 'rev-parse', ['--show-toplevel']);
  if (topo.semGit) {
    emit({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'Hook HDL: git nao encontrado; verificacao de espacos em branco ignorada.' } });
    return;
  }
  if (!topo.ok) return; // fora de repositorio
  const raiz = path.resolve(topo.out.trim());
  const rel = path.relative(raiz, abs).split(path.sep).join('/');
  if (rel.startsWith('..')) return;

  const situacao = git(raiz, 'status', ['--porcelain=v1', '--', rel]);
  if (!situacao.ok || !situacao.out.trim()) return; // sem mudanca ou ignorado pelo git
  const novo = situacao.out.startsWith('??');
  const diff = novo
    ? git(raiz, 'diff', ['--no-index', '--check', '--', '/dev/null', rel])
    : git(raiz, 'diff', ['--check', 'HEAD', '--', rel]);
  // Mostra so "arquivo:linha: tipo"; nunca o conteudo da linha.
  const problemas = diff.out.split(/\r?\n/).filter((l) => /^.+?:\d+: /.test(l)).slice(0, 6);
  if (!problemas.length) return;

  const ctl = estado(entrada.session_id);
  const chave = `post:${rel}:${sha(problemas.join('|'))}`;
  if (ctl.vezes(chave) >= 2) return; // ja avisado duas vezes: evita repeticao
  ctl.somar(chave);
  emit({ decision: 'block', reason: `[HDL] git diff --check encontrou problemas em ${rel}:\n${problemas.join('\n')}\nCorrija so essas linhas, sem reformatar o arquivo.` });
}

function aoEncerrar(entrada) {
  if (entrada?.stop_hook_active === true) return; // ja continuou uma vez por causa deste hook
  const cwd = entrada?.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const topo = git(cwd, 'rev-parse', ['--show-toplevel']);
  if (topo.semGit) { emit({ systemMessage: 'Hook HDL: git nao encontrado; verificacao final ignorada.' }); return; }
  if (!topo.ok) return;
  const raiz = path.resolve(topo.out.trim());
  const status = git(raiz, 'status', ['--porcelain=v1', '-z']);
  if (!status.ok) return;

  const partes = status.out.split('\0');
  const staged = [];
  for (let i = 0; i < partes.length; i += 1) {
    const e = partes[i];
    if (e.length < 4) continue;
    const x = e[0];
    if (x === 'R' || x === 'C') i += 1; // o proximo item e o nome de origem
    if (x !== ' ' && x !== '?' && x !== '!') staged.push(e.slice(3));
  }
  const proibidos = staged.filter((f) => PROIBIDO_NO_STAGE.some((r) => r.test(f)));
  const outros = staged.filter((f) => !proibidos.includes(f));

  const irmaos = [];
  try {
    const pai = path.dirname(raiz);
    for (const d of readdirSync(pai, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name === path.basename(raiz) || !existsSync(path.join(pai, d.name, '.git'))) continue;
      if (irmaos.length >= 8) break;
      const r = git(path.join(pai, d.name), 'diff', ['--cached', '--name-only']);
      const n = r.ok ? r.out.split('\n').filter(Boolean).length : 0;
      if (n) irmaos.push(`${d.name}: ${n}`);
    }
  } catch { /* sem pasta pai legivel */ }

  const avisos = [];
  if (outros.length) avisos.push(`${outros.length} arquivo(s) no stage aguardando commit: ${outros.slice(0, 5).join(', ')}${outros.length > 5 ? '...' : ''}`);
  if (irmaos.length) avisos.push(`stage em outro repositorio (fora deste projeto): ${irmaos.join(', ')}`);

  const resposta = {};
  if (proibidos.length) {
    const ctl = estado(entrada.session_id);
    const chave = `stop:${sha(proibidos.join('|'))}`;
    if (ctl.vezes(chave) < 1) {
      ctl.somar(chave);
      resposta.decision = 'block';
      resposta.reason = `[HDL] Antes de encerrar: arquivo(s) proibido(s) no stage: ${proibidos.slice(0, 6).join(', ')}. O hook nao alterou nada. Avise o usuario, nao faca commit e remova do stage so com autorizacao (git restore --staged -- <arquivo>).`;
    } else {
      avisos.push(`ainda ha arquivo proibido no stage: ${proibidos.slice(0, 6).join(', ')}`);
    }
  }
  if (avisos.length) resposta.systemMessage = `[HDL] ${avisos.join(' | ')}`;
  if (Object.keys(resposta).length) emit(resposta);
}

try {
  let entrada = {};
  try { entrada = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* sem entrada */ }
  const modo = process.argv[2];
  if (modo === 'post') aposEdicao(entrada);
  else if (modo === 'stop') aoEncerrar(entrada);
} catch (erro) {
  emit({ systemMessage: `Hook HDL falhou e foi ignorado: ${String(erro?.message || erro).slice(0, 120)}` });
}
process.exit(0);
