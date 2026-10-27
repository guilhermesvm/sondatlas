#!/usr/bin/env bash
# Desliga a aplicação e a probe (VM do kit). Os dados ficam guardados.
# Uso: bash stop-kit.sh [--no-vm]
# --no-vm: desliga só a aplicação.
set -uo pipefail

RAIZ=$(cd "$(dirname "$0")" && pwd)
NO_VM=0
case "${1:-}" in
  "") ;;
  --no-vm) NO_VM=1 ;;
  *) echo "Uso: bash stop-kit.sh [--no-vm]" >&2; exit 2 ;;
esac

passo() { echo "==> $*"; }
erro() { echo "ERRO: $*" >&2; exit 1; }

if ! command -v docker >/dev/null; then
  passo "Docker não encontrado, então não há aplicação para desligar"
elif ! docker info >/dev/null 2>&1; then
  passo "O Docker não está rodando ou não está acessível, então a aplicação não foi desligada por aqui"
else
  passo "Desligando a aplicação"
  docker compose -f "$RAIZ/compose.yaml" stop || erro "A aplicação não parou. Veja a mensagem acima."
fi

if [ "$NO_VM" = 0 ]; then
  if grep -qi microsoft /proc/version 2>/dev/null; then
    erro "Este terminal está no Linux do WSL, que não enxerga o Vagrant do Windows. No PowerShell, use: powershell -ExecutionPolicy Bypass -File .\\stop-kit.ps1"
  fi
  command -v vagrant >/dev/null || erro "Vagrant não encontrado. Se a sua probe não usa a VM do kit, rode de novo com --no-vm."
  estado=$(cd "$RAIZ/lab" && vagrant status --machine-readable | awk -F, '$3 == "state" { print $4; exit }')
  if [ "$estado" = running ]; then
    passo "Desligando a VM da probe"
    (cd "$RAIZ/lab" && vagrant halt) || erro "A VM da probe não desligou. Veja a mensagem acima."
  else
    passo "A VM da probe já estava desligada"
  fi
  echo "Com a VM desligada, a probe aparece como Disconnected no RIPE Atlas e não ganha créditos até você ligar de novo."
fi

passo "Pronto. Para ligar de novo: bash start-kit.sh"
