#!/usr/bin/env bash
# Roda um comando; se falhar, publica o final da saída como anotação do GitHub (aparece no topo da execução).
# Uso: bash .github/ci/rodar-e-anotar.sh <comando> [argumentos...]
log="$(mktemp)"
"$@" >"$log" 2>&1
codigo=$?
cat "$log"
if [ "$codigo" -ne 0 ]; then
  resumo="$(tail -n 25 "$log" | sed -e 's/\x1b\[[0-9;]*m//g' -e 's/\r//g' | cut -c1-400 | cut -c1-3000)"
  texto="$(printf 'Comando: %s (codigo %s)\n%s' "$*" "$codigo" "$resumo" | sed -e 's/%/%25/g' | awk 'BEGIN{ORS="%0A"} {print}')"
  echo "::error title=Teste falhou::${texto}"
fi
exit "$codigo"
