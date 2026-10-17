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
# confdef/confold: manter, sem perguntar, arquivos de configuração já
# alterados pelo kit (ex.: /etc/dhcpcd.conf) ao reprovisionar.
apt-get full-upgrade -y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold
apt-get install -y -q curl

# Depois da atualização: /etc/dhcpcd.conf é arquivo de configuração do pacote
# dhcpcd-base; editá-lo antes faria a atualização parar para perguntar.
# eth0 é a NAT do Vagrant; eth1 é a bridge escolhida no "vagrant up".
# O Vagrant apaga a rota padrão da bridge (post-up em /etc/network/interfaces);
# o hook em if-up.d roda depois dele e pede ao dhcpcd que reinstale a rota.
passo "Configurando a rede: rota e DNS pela bridge"
if ! grep -q "^# Kit: NAT só para o Vagrant" /etc/dhcpcd.conf; then
  cat >> /etc/dhcpcd.conf <<'EOF'

# Kit: NAT só para o Vagrant; rota e DNS vêm da bridge (eth1).
interface eth0
nogateway
nooption domain_name_servers, domain_name, domain_search
EOF
fi
cat > /etc/network/if-up.d/kit-bridge-route <<'EOF'
#!/bin/sh
# Kit: reinstala a rota padrão da bridge, apagada pelo post-up do Vagrant.
[ "$IFACE" = eth1 ] || exit 0
/usr/sbin/dhcpcd -n eth1
EOF
chmod 755 /etc/network/if-up.d/kit-bridge-route
/usr/sbin/dhcpcd -n eth0
/usr/sbin/dhcpcd -n eth1
# A renegociação derruba as rotas por alguns segundos; não confundir a rota
# antiga com a nova.
sleep 3

for _ in $(seq 30); do
  if ip route show default | grep -q "dev eth1"; then break; fi
  sleep 1
done
if ! ip route show default | grep -q "dev eth1"; then
  cat >&2 <<'EOF'
ERRO: a placa escolhida não deu acesso à rede (sem rota pela bridge).
Rode "vagrant reload --provision" e escolha a placa que você usa para
acessar a internet (Wi-Fi ou cabo), não "Hyper-V", "vEthernet" ou "Host-Only".
EOF
  exit 1
fi
ip route get 1.1.1.1 | head -1

# A box aceita login por senha com a senha pública da convenção do Vagrant.
# Na bridge, qualquer aparelho da rede local alcançaria o SSH da VM.
passo "Protegendo a VM na rede local"
cat > /etc/ssh/sshd_config.d/10-kit.conf <<'EOF'
# Kit: acesso só por chave (o vagrant ssh usa chave).
PasswordAuthentication no
EOF
sshd -t
systemctl reload ssh
passwd -l vagrant
# rpcbind só serve a pastas NFS do Vagrant, desligadas neste kit.
systemctl mask --now rpcbind.service rpcbind.socket

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
