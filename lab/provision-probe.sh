#!/usr/bin/env bash
# Instala a Software Probe oficial do RIPE Atlas no Debian da VM.
# Segue o README de https://github.com/RIPE-NCC/ripe-atlas-software-probe.
# Não habilita o serviço: a probe só deve iniciar após o cadastro manual.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

REPO_PKG=ripe-atlas-repo_1.6-1_all.deb
KEY=/etc/ripe-atlas/probe_key.pub

passo() { echo "==> [$(date +%T)] $*"; }

passo "Início"

# A box vem sem disco definido para o GRUB; sem isso, a atualização falha
# em modo não interativo ("You must correct your GRUB install devices").
passo "Configurando o disco de inicialização do GRUB"
DISK=$(lsblk -ndo NAME,TYPE | awk '$2=="disk"{print "/dev/"$1; exit}')
echo "grub-pc grub-pc/install_devices multiselect $DISK" | debconf-set-selections
dpkg --configure -a

passo "Atualizando o Debian"
apt-get update -q
apt-get full-upgrade -y -q
apt-get install -y -q curl

if dpkg -s ripe-atlas-probe >/dev/null 2>&1; then
  passo "Probe já instalada"
else
  passo "Baixando e conferindo o repositório oficial do RIPE Atlas"
  cd /tmp
  ARCH=$(dpkg --print-architecture)
  CODENAME=$(. /etc/os-release && echo "$VERSION_CODENAME")
  curl -fsSLO "https://ftp.ripe.net/ripe/atlas/software-probe/debian/dists/${CODENAME}/main/binary-${ARCH}/${REPO_PKG}"
  curl -fsSL -o CHECKSUMS "https://github.com/RIPE-NCC/ripe-atlas-software-probe/releases/latest/download/CHECKSUMS"
  if ! grep -q "$(sha256sum "$REPO_PKG")" CHECKSUMS; then
    echo "ERRO: o checksum de $REPO_PKG não confere com o CHECKSUMS oficial." >&2
    rm -f "$REPO_PKG" CHECKSUMS
    exit 1
  fi
  dpkg -i "$REPO_PKG"
  rm -f "$REPO_PKG" CHECKSUMS

  passo "Instalando a probe"
  apt-get update -q
  apt-get install -y -q ripe-atlas-probe
fi

if [ ! -f "$KEY" ]; then
  echo "ERRO: chave pública não encontrada em $KEY." >&2
  exit 1
fi

passo "Fim"

cat <<EOF

------------------------------------------------------------
Probe instalada, mas ainda NÃO ativada.

1. Cadastre a probe com esta chave pública:
     $(cat "$KEY")
   em https://atlas.ripe.net/register/swprobe

2. Depois do cadastro, ative a probe (na pasta lab/):
     vagrant ssh -c "sudo systemctl enable --now ripe-atlas"

Para ver a chave de novo:
     vagrant ssh -c "sudo cat $KEY"
------------------------------------------------------------
EOF
