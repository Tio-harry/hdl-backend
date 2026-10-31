// Hook leve do Claude Code para os projetos HDL. SOMENTE LEITURA: nao edita arquivos do repositorio,
// nao faz commit/push/deploy, nao usa rede nem chama o Claude. Uso: node hdl-hook.mjs post|stop
// post: depois de Write/Edit, roda `git diff --check` so no arquivo editado.
// stop: antes de encerrar, avisa/bloqueia se houver arquivo proibido no stage.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Unicos comandos git que este hook pode executar (todos de leitura; config so com --get).
const GIT_LEITURA = new Set(['rev-parse', 'status', 'diff', 'config']);
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
  if (!GIT_LEITURA.has(sub) || (sub === 'config' && args[0] !== '--get')) throw new Error(`git ${sub} nao permitido neste hook`);
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

// ---------- PreToolUse: confere git add / commit / push antes de executar ----------
// Analisa o texto do comando (sem executa-lo). Bloqueia com exit 2 + mensagem em stderr.
const BLOQUEIO = (msg) => { const e = new Error(msg); e.bloqueio = true; return e; };
const DESCARTA_REDIR = /^(\d*)(<<<|<<-?|>>|<|>|&>>|&>)/;
const ENVOLTORIOS = new Set(['bash', 'sh', 'zsh', 'eval', 'powershell', 'pwsh', 'cmd', 'python', 'python3', 'node', 'npx', 'xargs']);
const GIT_ESCONDIDO = /(^|[\s;&|("'])git(\.exe)?\s+(-\S+\s+(\S+\s+)?)*(add|commit|push)\b/;

function semCorposDeTexto(cmd) {
  const saida = []; let fim = null;
  for (const linha of cmd.split(/\r?\n/)) {
    if (fim !== null) { if (linha.trim() === fim) fim = null; continue; }
    saida.push(linha);
    const m = linha.match(/<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/);
    if (m) fim = m[2];
  }
  return saida.join('\n').replace(/@'[\s\S]*?\n'@/g, "''").replace(/@"[\s\S]*?\n"@/g, '""');
}

function dividir(texto) {
  const comandos = []; let atual = []; let pal = ''; let tem = false; let q = null;
  const fechaPal = () => { if (tem || pal) { atual.push(pal); pal = ''; tem = false; } };
  const fechaCmd = () => { fechaPal(); if (atual.length) comandos.push(atual); atual = []; };
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (q) {
      if (c === q) q = null;
      else if (c === '\\' && q === '"' && i + 1 < texto.length) pal += texto[++i];
      else pal += c;
      continue;
    }
    if (c === "'" || c === '"') { q = c; tem = true; continue; }
    if (c === '`' && i + 1 < texto.length) { pal += texto[++i]; tem = true; continue; }
    if (/\s/.test(c)) { if (c === '\n') fechaCmd(); else fechaPal(); continue; }
    if (c === '&' && (texto[i - 1] === '>' || texto[i + 1] === '>')) { pal += c; continue; }
    if (c === '&' || c === '|' || c === ';') { fechaCmd(); if ((c === '&' || c === '|') && texto[i + 1] === c) i += 1; continue; }
    pal += c;
  }
  fechaCmd();
  return comandos.map((cmd) => {
    const limpo = [];
    for (let i = 0; i < cmd.length; i += 1) {
      const m = cmd[i].match(DESCARTA_REDIR);
      if (!m) { limpo.push(cmd[i]); continue; }
      if (cmd[i] === m[0]) i += 1; // operador sozinho: descarta tambem o alvo
    }
    return limpo;
  }).filter((c) => c.length);
}

const proibidoNoStage = (rel) => PROIBIDO_NO_STAGE.some((r) => r.test(rel));
const raizDe = (dir) => { const t = git(dir, 'rev-parse', ['--show-toplevel']); return t.ok ? path.resolve(t.out.trim()) : null; };
const relativo = (raiz, abs) => path.relative(raiz, abs).split(path.sep).join('/');

function checarAdd(args, dir) {
  const raiz = raizDe(dir); if (!raiz) return;
  let apos = false; const caminhos = [];
  for (const a of args) {
    if (!apos && a === '--') { apos = true; continue; }
    if (!apos && a.startsWith('-')) throw BLOQUEIO(`git add com opcao '${a}' nao e permitido. Use: git add -- <arquivo> [<arquivo> ...] (nunca ., -A, --all, -u, -f).`);
    caminhos.push(a);
  }
  if (caminhos.length > 100) throw BLOQUEIO('git add com mais de 100 arquivos: revise o escopo da tarefa.');
  for (const p of caminhos) {
    if (!p || p === '.' || p === '..' || p === './' || /[*?[\]]/.test(p) || p.startsWith(':') || /[\\/]$/.test(p)) throw BLOQUEIO(`git add '${p}' nao e permitido: informe arquivos pelo nome, sem ".", pastas, curingas ou pathspec magico.`);
    const abs = path.resolve(dir, p);
    const rel = relativo(raiz, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw BLOQUEIO(`git add '${p}' esta fora do repositorio.`);
    let ehPasta = false; try { ehPasta = statSync(abs).isDirectory(); } catch { /* removido: ok */ }
    if (ehPasta) throw BLOQUEIO(`git add '${p}' e uma pasta: liste os arquivos pelo nome.`);
    if (proibidoNoStage(rel)) throw BLOQUEIO(`git add '${rel}' bloqueado: arquivo sensivel/proibido (env, chaves, settings.local, .codex_portal_tmp, backups, uploads, logs, node_modules).`);
  }
}

const VALOR_COMMIT = new Set(['-m', '-F', '-C', '-c', '-t', '--message', '--file', '--author', '--date', '--cleanup', '--reuse-message', '--reedit-message', '--template', '--trailer', '--fixup', '--squash']);
function checarCommit(args, dir) {
  const raiz = raizDe(dir); if (!raiz) return;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--') throw BLOQUEIO("git commit com pathspec ('--') nao e permitido: use git add antes e git commit sem arquivos.");
    if (a.startsWith('--')) {
      const nome = a.split('=')[0];
      if (['--all', '--amend', '--no-verify', '--only', '--include', '--patch', '--interactive'].includes(nome)) throw BLOQUEIO(`git commit ${nome} nao e permitido (stage inteiro, reescrita de historico ou pular verificacoes).`);
      if (VALOR_COMMIT.has(nome) && !a.includes('=')) i += 1;
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let k = 1; k < a.length; k += 1) {
        const f = a[k];
        if (f === 'a') throw BLOQUEIO(`git commit ${a} inclui -a (adiciona todos os arquivos rastreados): faca git add -- <arquivos> e depois git commit.`);
        if (f === 'n') throw BLOQUEIO(`git commit ${a} inclui -n (--no-verify) nao e permitido.`);
        if (f === 'o' || f === 'i' || f === 'p') throw BLOQUEIO(`git commit ${a} nao e permitido.`);
        if ('mFCctS'.includes(f)) { if (k === a.length - 1 && 'mFCct'.includes(f)) i += 1; break; }
      }
      continue;
    }
    throw BLOQUEIO(`git commit com arquivo '${a}' (pathspec) nao e permitido: use git add -- <arquivos> antes e git commit sem arquivos.`);
  }
  const staged = git(raiz, 'diff', ['--cached', '--name-only', '-z']);
  const ruins = staged.ok ? staged.out.split('\0').filter(Boolean).filter(proibidoNoStage) : [];
  if (ruins.length) throw BLOQUEIO(`commit bloqueado: arquivo(s) proibido(s) no stage: ${ruins.slice(0, 6).join(', ')}. Remova do stage (git restore --staged -- <arquivo>) antes de commitar.`);
}

function checarPush(args, dir) {
  const raiz = raizDe(dir); if (!raiz) return;
  const flags = args.filter((a) => a.startsWith('-'));
  if (flags.length) throw BLOQUEIO(`git push com opcao(oes) ${flags.join(' ')} nao e permitido (push forcado, delete, tags, mirror...). Permitido apenas: git push origin <branch atual>.`);
  const pos = args;
  if (pos.length !== 2) throw BLOQUEIO('git push deve informar remoto e branch explicitamente: git push origin <branch atual>.');
  const [remoto, ref] = pos;
  if (/[:+*^~\s]/.test(ref)) throw BLOQUEIO(`git push '${ref}' nao e permitido (refspec com ':' ou '+').`);
  const atual = git(raiz, 'rev-parse', ['--abbrev-ref', 'HEAD']);
  const ramo = atual.ok ? atual.out.trim() : '';
  if (!ramo || ramo === 'HEAD') throw BLOQUEIO('push bloqueado: HEAD destacado (sem branch).');
  const rem = git(raiz, 'config', ['--get', `branch.${ramo}.remote`]).out.trim();
  const mer = git(raiz, 'config', ['--get', `branch.${ramo}.merge`]).out.trim().replace(/^refs\/heads\//, '');
  if (!rem || !mer) throw BLOQUEIO(`push bloqueado: a branch '${ramo}' nao tem upstream configurado; nao foi possivel confirmar o remoto esperado.`);
  if (remoto !== rem || ref !== ramo || mer !== ramo) throw BLOQUEIO(`push bloqueado: esperado 'git push ${rem} ${mer}' a partir de '${ramo}', recebido 'git push ${remoto} ${ref}'.`);
  const pend = git(raiz, 'diff', ['--name-only', '-z', '--diff-filter=ACMR', `refs/remotes/${rem}/${mer}`, 'HEAD']);
  const ruins = pend.ok ? pend.out.split('\0').filter(Boolean).filter(proibidoNoStage) : [];
  if (ruins.length) throw BLOQUEIO(`push bloqueado: commits pendentes incluem arquivo(s) proibido(s): ${ruins.slice(0, 6).join(', ')}.`);
}

function antesDoComando(entrada) {
  const bruto = entrada?.tool_input?.command;
  if (typeof bruto !== 'string' || !/\bgit(\.exe)?\b/.test(bruto) || !/\b(add|commit|push)\b/.test(bruto)) return; // caminho rapido
  const cmds = dividir(semCorposDeTexto(bruto));
  let dir = path.resolve(entrada?.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd());
  for (const w0 of cmds) {
    let w = w0.slice(); while (w.length && /^[A-Za-z_]\w*=/.test(w[0])) w.shift();
    if (!w.length) continue;
    const nome = path.basename(w[0]).toLowerCase().replace(/\.exe$/, '');
    if (['cd', 'set-location', 'sl', 'pushd'].includes(nome)) { if (w[1]) dir = path.resolve(dir, w[1]); continue; }
    if (nome === 'git') {
      let i = 1; let alvo = dir;
      for (; i < w.length; i += 1) {
        const a = w[i];
        if (a === '-C') { alvo = path.resolve(alvo, w[i + 1] || '.'); i += 1; continue; }
        if (a === '-c' || a === '--namespace') { i += 1; continue; }
        if (a.startsWith('--git-dir') || a.startsWith('--work-tree')) throw BLOQUEIO(`git ${a.split('=')[0]} nao e suportado com add/commit/push neste fluxo.`);
        if (a.startsWith('-')) continue;
        break;
      }
      const sub = w[i]; const args = w.slice(i + 1);
      if (sub === 'add') checarAdd(args, alvo);
      else if (sub === 'commit') checarCommit(args, alvo);
      else if (sub === 'push') checarPush(args, alvo);
    } else if (ENVOLTORIOS.has(nome) && w.slice(1).some((t) => GIT_ESCONDIDO.test(t))) {
      throw BLOQUEIO(`git add/commit/push dentro de '${nome}' nao e permitido: use o comando git direto, para ele poder ser conferido.`);
    }
  }
}

let codigo = 0;
try {
  let entrada = {};
  try { entrada = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* sem entrada */ }
  const modo = process.argv[2];
  if (modo === 'post') aposEdicao(entrada);
  else if (modo === 'stop') aoEncerrar(entrada);
  else if (modo === 'pre') antesDoComando(entrada);
} catch (erro) {
  if (erro?.bloqueio) { process.stderr.write(`[HDL] ${erro.message}\n`); codigo = 2; }
  else emit({ systemMessage: `Hook HDL falhou e foi ignorado: ${String(erro?.message || erro).slice(0, 120)}` });
}
process.exit(codigo);
