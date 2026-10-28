#!/usr/bin/env bash
# Liga a aplicação e, se existir, a VM da probe do kit, e abre o dashboard.
# Uso: bash start-kit.sh [--probe]
# --probe: só a probe. Confere os requisitos, cria a VM na primeira vez (ou a
# liga) e mostra a chave pública. Não mexe na aplicação.
# Pode ser rodado de novo a qualquer momento: o que já está ligado continua igual.
set -uo pipefail

RAIZ=$(cd "$(dirname "$0")" && pwd)
COMPOSE=(docker compose -f "$RAIZ/compose.yaml")
KEY=/etc/ripe-atlas/probe_key.pub
PROBE=0
case "${1:-}" in
  "") ;;
  --probe) PROBE=1 ;;
  *) echo "Uso: bash start-kit.sh [--probe]" >&2; exit 2 ;;
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

# Vazio se a VM do kit pode ser usada deste terminal; senão, o motivo.
motivo_sem_vm() {
  if grep -qi microsoft /proc/version 2>/dev/null; then
    echo "Este terminal está no Linux do WSL, que não enxerga o Vagrant do Windows. No PowerShell, use: powershell -ExecutionPolicy Bypass -File .\\start-kit.ps1"
  elif ! command -v vagrant >/dev/null; then
    echo "Vagrant não encontrado. Veja como instalar em lab/README.md, na seção Pré-requisitos."
  elif [ "$WINDOWS" = 1 ] && [ ! -f "$(cygpath -u "${VBOX_MSI_INSTALL_PATH:-.}")/VBoxManage.exe" ]; then
    echo "VirtualBox não encontrado. Veja como instalar em lab/README.md, na seção Pré-requisitos."
  elif [ "$WINDOWS" = 0 ] && ! command -v VBoxManage >/dev/null; then
    echo "VirtualBox não encontrado. Veja como instalar em lab/README.md, na seção Pré-requisitos."
  fi
}

# Com o Hyper-V ligado (Docker Desktop, WSL2), o Windows informa a virtualização
# do firmware como desligada; o hipervisor presente já prova que ela está ativa.
# No Linux, o kernel tira a flag vmx dos processadores Intel quando a BIOS
# bloqueia; nos AMD a flag svm não muda, então não há como saber antes.
virtualizacao_desligada() {
  if [ "$WINDOWS" = 1 ]; then
    [ "$(powershell.exe -NoProfile -Command '(Get-CimInstance Win32_ComputerSystem).HypervisorPresent -or [bool](Get-CimInstance Win32_Processor | Where-Object VirtualizationFirmwareEnabled)' 2>/dev/null | tr -d '\r')" = False ]
  else
    grep -q GenuineIntel /proc/cpuinfo && ! grep -qw vmx /proc/cpuinfo
  fi
}

ligar_vm() {
  if [ "$estado" = running ]; then
    passo "A VM da probe já está ligada"
    return
  fi
  if [ "$estado" = not_created ]; then
    passo "Criando a VM da probe pela primeira vez (leva uns 6 minutos)"
    echo "O Vagrant vai perguntar qual placa de rede usar. Escolha a que você usa para acessar a internet (Wi-Fi ou cabo)."
  else
    passo "Ligando a VM da probe"
  fi
  (cd "$RAIZ/lab" && vagrant up) || erro "A VM da probe não ligou. Veja a mensagem acima. Se ela fala em VT-x, AMD-V ou virtualização, ative a virtualização na BIOS. Mais dicas em lab/README.md."
  if [ "$estado" = saved ]; then
    echo "A VM estava com o estado salvo. Se a probe não aparecer como conectada em alguns minutos, rode vagrant reload na pasta lab."
  fi
}

passo "Conferindo os pré-requisitos"
if [ "$PROBE" = 1 ]; then
  motivo=$(motivo_sem_vm)
  [ -z "$motivo" ] || erro "$motivo"
  if virtualizacao_desligada; then
    erro "A virtualização está desligada na BIOS ou o processador não tem suporte. Ative a opção Intel VT-x ou AMD-V (às vezes chamada SVM) na configuração da BIOS e rode este comando de novo."
  fi
  estado=$(estado_da_vm)
  ligar_vm
  passo "Chave pública da probe"
  (cd "$RAIZ/lab" && vagrant ssh -c "sudo cat $KEY") || erro "Não foi possível ler a chave. Veja a mensagem acima."
  echo "Cadastre esta chave em https://atlas.ripe.net/register/swprobe e siga a fase Ativar do dashboard."
  exit 0
fi

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

motivo=$(motivo_sem_vm)
if [ -n "$motivo" ]; then
  echo "$motivo"
  passo "Ligando só a aplicação. Se a sua probe usa a VM do kit, resolva isso e rode este comando de novo"
else
  estado=$(estado_da_vm)
  if [ "$estado" = not_created ]; then
    passo "A VM da probe ainda não existe. Para instalar a probe, siga a fase Instalar do dashboard"
  else
    ligar_vm
  fi
fi

passo "Ligando a aplicação (banco, coleta, API e dashboard)"
"${COMPOSE[@]}" up -d --build || erro "A aplicação não subiu. Veja a mensagem acima. Se ela fala em \"port is already allocated\", outro programa ou outra cópia do projeto já usa a porta. Veja como trocar no README, em Quick start."

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
