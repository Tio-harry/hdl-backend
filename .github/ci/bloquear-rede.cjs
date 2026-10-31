'use strict';
// Uso exclusivo do CI/testes: so permite conexoes para esta propria maquina (loopback).
// Qualquer tentativa de falar com a internet (Mercado Pago, Bunny, SMTP, APIs de IA etc.) falha com erro claro.
// Carregue com: NODE_OPTIONS="--require ./.github/ci/bloquear-rede.cjs" (os processos filhos herdam).
const net = require('node:net');

const LOCAIS = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1']);
const original = net.Socket.prototype.connect;

net.Socket.prototype.connect = function conectarSomenteLocal(...args) {
  const [opcoes] = net._normalizeArgs(args);
  const host = opcoes.path ? null : String(opcoes.host || 'localhost').toLowerCase();
  if (opcoes.path || LOCAIS.has(host)) return original.apply(this, args);
  const erro = new Error(`CI: conexao de rede externa bloqueada (${host}). Testes nao podem acessar servicos reais.`);
  erro.code = 'CI_REDE_BLOQUEADA';
  process.nextTick(() => this.destroy(erro));
  return this;
};
