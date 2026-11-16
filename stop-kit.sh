#!/usr/bin/env bash
# Desliga a aplicação e, se existir, a VM da probe do kit. Os dados ficam guardados.
# Uso: bash stop-kit.sh [--probe | --app]
# --probe: só a VM da probe; a aplicação continua ligada.
# --app: só a aplicação; a probe continua ligada e ganhando créditos.
set -uo pipefail

RAIZ=$(cd "$(dirname "$0")" && pwd)
[ $# -le 1 ] || { echo "Uso: bash stop-kit.sh [--probe | --app]" >&2; exit 2; }
case "${1:-}" in
  "") MODO=tudo ;;
  --probe) MODO=probe ;;
  --app) MODO=app ;;
  *) echo "Uso: bash stop-kit.sh [--probe | --app]" >&2; exit 2 ;;
esac

passo() { echo "==> [$(date +%T)] $*"; }
erro() { echo "ERRO: $*" >&2; exit 1; }

if [ "$MODO" != probe ]; then
  if ! command -v docker >/dev/null; then
    passo "Docker não encontrado, então não há aplicação para desligar"
  elif ! docker info >/dev/null 2>&1; then
    passo "O Docker não está rodando ou não está acessível, então a aplicação não foi desligada por aqui"
  else
    passo "Desligando a aplicação"
    docker compose -f "$RAIZ/compose.yaml" stop || erro "A aplicação não parou. Veja a mensagem acima."
  fi
fi

if [ "$MODO" = app ]; then
  echo "A VM da probe não foi mexida. Se estiver ligada, a probe continua medindo e ganhando créditos."
else
  if grep -qi microsoft /proc/version 2>/dev/null; then
    aviso="Este terminal está no Linux do WSL, que não enxerga o Vagrant do Windows. Para desligar a VM da probe, use no PowerShell: powershell -ExecutionPolicy Bypass -File .\\stop-kit.ps1"
    [ "$MODO" = probe ] && erro "$aviso"
    echo "$aviso"
  elif ! command -v vagrant >/dev/null; then
    [ "$MODO" = probe ] && erro "Vagrant não encontrado. Veja como instalar em lab/README.md, na seção Pré-requisitos."
    passo "Vagrant não encontrado, então não há VM do kit para desligar"
  else
    estado=$(cd "$RAIZ/lab" && vagrant status --machine-readable | awk -F, '$3 == "state" { print $4; exit }')
    case "$estado" in
      not_created) passo "Não há VM do kit para desligar" ;;
      running)
        passo "Desligando a VM da probe"
        (cd "$RAIZ/lab" && vagrant halt) || erro "A VM da probe não desligou. Veja a mensagem acima."
        echo "Com a VM desligada, a probe aparece como Disconnected no RIPE Atlas e não ganha créditos até você ligar de novo."
        ;;
      *) passo "A VM da probe já estava desligada" ;;
    esac
  fi
fi

passo "Pronto. Para ligar de novo: bash start-kit.sh${1:+ $1}"
