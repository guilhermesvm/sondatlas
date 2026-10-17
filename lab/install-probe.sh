#!/usr/bin/env bash
# Instala a Software Probe oficial do RIPE Atlas.
# Segue o README de https://github.com/RIPE-NCC/ripe-atlas-software-probe.
# Usado pela VM do kit e, sozinho, em Debian ou Raspberry Pi OS próprios:
#   sudo bash install-probe.sh
# Não atualiza o sistema nem habilita o serviço: a probe só deve iniciar
# após o cadastro manual.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

REPO_PKG=ripe-atlas-repo_1.6-1_all.deb
KEY=/etc/ripe-atlas/probe_key.pub

passo() { echo "==> [$(date +%T)] $*"; }
erro() { echo "ERRO: $*" >&2; exit 1; }

passo "Conferindo o sistema"
[ "$(id -u)" -eq 0 ] || erro "rode como root: sudo bash install-probe.sh"
command -v dpkg >/dev/null || erro "sistema sem dpkg; só Debian e Raspberry Pi OS são suportados."
ARCH=$(dpkg --print-architecture)
CODENAME=$(. /etc/os-release && echo "${VERSION_CODENAME:-}")
# Combinações com pacotes publicados em ftp.ripe.net (conferido em 2026-10-17).
case "$ARCH/$CODENAME" in
  amd64/bullseye|amd64/bookworm|amd64/trixie|arm64/bookworm|arm64/trixie) ;;
  *) erro "sistema não suportado ($ARCH/${CODENAME:-sem codinome}).
Suportados: Debian 11, 12 e 13 (amd64); Debian ou Raspberry Pi OS 12 e 13 (arm64)." ;;
esac
echo "Sistema: $ARCH/$CODENAME"
if [ "$CODENAME" = bullseye ]; then
  echo "AVISO: o Debian 11 não recebe atualizações de segurança desde 31/08/2026."
fi

if dpkg -s ripe-atlas-probe >/dev/null 2>&1; then
  passo "Probe já instalada"
else
  apt-get update -q
  command -v curl >/dev/null || apt-get install -y -q curl

  passo "Baixando e conferindo o repositório oficial do RIPE Atlas"
  cd /tmp
  curl -fsSLO "https://ftp.ripe.net/ripe/atlas/software-probe/debian/dists/${CODENAME}/main/binary-${ARCH}/${REPO_PKG}"
  curl -fsSL -o CHECKSUMS "https://github.com/RIPE-NCC/ripe-atlas-software-probe/releases/latest/download/CHECKSUMS"
  if ! grep -q "$(sha256sum "$REPO_PKG")" CHECKSUMS; then
    rm -f "$REPO_PKG" CHECKSUMS
    erro "o checksum de $REPO_PKG não confere com o CHECKSUMS oficial."
  fi
  dpkg -i "$REPO_PKG"
  rm -f "$REPO_PKG" CHECKSUMS

  passo "Instalando a probe"
  apt-get update -q
  apt-get install -y -q ripe-atlas-probe
fi

[ -f "$KEY" ] || erro "chave pública não encontrada em $KEY."

passo "Fim"

# KIT_VAGRANT é definido pelo Vagrantfile; ajusta os comandos mostrados.
if [ "${KIT_VAGRANT:-}" = 1 ]; then
  ACTIVATE='vagrant ssh -c "sudo systemctl enable --now ripe-atlas"   (na pasta lab/)'
  SHOW_KEY="vagrant ssh -c \"sudo cat $KEY\""
else
  ACTIVATE="sudo systemctl enable --now ripe-atlas"
  SHOW_KEY="sudo cat $KEY"
fi

cat <<EOF

------------------------------------------------------------
Probe instalada, mas ainda NÃO ativada.

1. Cadastre a probe com esta chave pública:
     $(cat "$KEY")
   em https://atlas.ripe.net/register/swprobe

2. Depois do cadastro, ative a probe:
     $ACTIVATE

Para ver a chave de novo:
     $SHOW_KEY
------------------------------------------------------------
EOF
