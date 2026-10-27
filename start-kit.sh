#!/usr/bin/env bash
# Liga a probe (VM do kit) e a aplicação e abre o dashboard.
# Uso: bash start-kit.sh [--no-vm]
# --no-vm: para quem instalou a probe direto num Debian ou Raspberry Pi.
# Pode ser rodado de novo a qualquer momento: o que já está ligado continua igual.
set -uo pipefail

RAIZ=$(cd "$(dirname "$0")" && pwd)
COMPOSE=(docker compose -f "$RAIZ/compose.yaml")
NO_VM=0
case "${1:-}" in
  "") ;;
  --no-vm) NO_VM=1 ;;
  *) echo "Uso: bash start-kit.sh [--no-vm]" >&2; exit 2 ;;
esac

case "$(uname -s)" in
  MINGW*|MSYS*) WINDOWS=1 ;;
  *) WINDOWS=0 ;;
esac

passo() { echo "==> $*"; }
erro() { echo "ERRO: $*" >&2; exit 1; }

estado_da_vm() {
  (cd "$RAIZ/lab" && vagrant status --machine-readable) | awk -F, '$3 == "state" { print $4; exit }'
}

responde() {
  curl -s -o /dev/null --max-time 5 "$1"
}

passo "Conferindo os pré-requisitos"
command -v docker >/dev/null || erro "Docker não encontrado. Veja como instalar: https://docs.docker.com/engine/install/"
if ! saida=$(docker info 2>&1); then
  case "$saida" in
    *"permission denied"*) erro "Seu usuário não tem permissão para usar o Docker. Veja: https://docs.docker.com/engine/install/linux-postinstall/" ;;
    *) erro "O Docker não está rodando. Inicie o Docker e rode este comando de novo." ;;
  esac
fi
versao=$(docker compose version --short 2>/dev/null | sed -e 's/^v//' -e 's/[-+].*$//')
if [ -z "$versao" ] || [ "$(printf '%s\n' 2.24.0 "$versao" | sort -V | head -n 1)" != 2.24.0 ]; then
  erro "O kit precisa do Docker Compose 2.24.0 ou mais novo. Veja: https://docs.docker.com/compose/install/"
fi
command -v curl >/dev/null || erro "curl não encontrado. Instale com: sudo apt install curl"
if [ "$NO_VM" = 0 ]; then
  if grep -qi microsoft /proc/version 2>/dev/null; then
    erro "Este terminal está no Linux do WSL, que não enxerga o Vagrant do Windows. No PowerShell, use: powershell -ExecutionPolicy Bypass -File .\\start-kit.ps1"
  fi
  command -v vagrant >/dev/null || erro "Vagrant não encontrado. Veja como instalar em lab/README.md, na seção Pré-requisitos. Se a sua probe não usa a VM do kit, rode de novo com --no-vm."
  if [ "$WINDOWS" = 1 ]; then
    [ -f "$(cygpath -u "${VBOX_MSI_INSTALL_PATH:-.}")/VBoxManage.exe" ] || erro "VirtualBox não encontrado. Veja como instalar em lab/README.md, na seção Pré-requisitos."
  else
    command -v VBoxManage >/dev/null || erro "VirtualBox não encontrado. Veja como instalar em lab/README.md, na seção Pré-requisitos."
  fi
fi

if [ "$NO_VM" = 0 ]; then
  estado=$(estado_da_vm)
  if [ "$estado" = running ]; then
    passo "A VM da probe já está ligada"
  else
    if [ "$estado" = not_created ]; then
      passo "Criando a VM da probe pela primeira vez (leva uns 6 minutos)"
      echo "O Vagrant vai perguntar qual placa de rede usar. Escolha a que você usa para acessar a internet (Wi-Fi ou cabo)."
      echo "No fim aparecem a chave pública e o link de cadastro. Guarde os dois para ativar a probe."
    else
      passo "Ligando a VM da probe"
    fi
    (cd "$RAIZ/lab" && vagrant up) || erro "A VM da probe não ligou. Veja a mensagem acima e as dicas em lab/README.md."
    if [ "$estado" = saved ]; then
      echo "A VM estava com o estado salvo. Se a probe não aparecer como conectada em alguns minutos, rode vagrant reload na pasta lab."
    fi
  fi
fi

passo "Ligando a aplicação (banco, coleta, API e dashboard)"
"${COMPOSE[@]}" up -d --build || erro "A aplicação não subiu. Veja a mensagem acima."

passo "Esperando a API e o dashboard responderem"
api=$("${COMPOSE[@]}" port api 8000)
web=$("${COMPOSE[@]}" port web 8080)
api_pronta=0
web_pronto=0
limite=$((SECONDS + 120))
while [ "$SECONDS" -lt "$limite" ] && [ $((api_pronta + web_pronto)) -lt 2 ]; do
  [ "$api_pronta" = 1 ] || { responde "http://$api/probe" && api_pronta=1; }
  [ "$web_pronto" = 1 ] || { responde "http://$web/" && web_pronto=1; }
  [ $((api_pronta + web_pronto)) -eq 2 ] || sleep 2
done
[ "$api_pronta" = 1 ] || erro "A API não respondeu em 2 minutos. Veja o motivo com: docker compose logs api"
[ "$web_pronto" = 1 ] || erro "O dashboard não respondeu em 2 minutos. Veja o motivo com: docker compose logs web"

endereco="http://$web/"
if [ "$WINDOWS" = 1 ]; then
  passo "Pronto. Abrindo o dashboard em $endereco"
  explorer.exe "$endereco" || true
elif command -v xdg-open >/dev/null && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  passo "Pronto. Abrindo o dashboard em $endereco"
  xdg-open "$endereco" >/dev/null 2>&1 || true
else
  passo "Pronto. Abra o dashboard no navegador: $endereco"
fi
echo "Para desligar tudo: bash stop-kit.sh"
