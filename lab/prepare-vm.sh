#!/usr/bin/env bash
# Prepara a VM do kit: atualiza o Debian da box, coloca a rede na bridge e
# fecha o acesso pela rede local. Só para a VM criada pelo Vagrant; em uma
# máquina própria, use apenas install-probe.sh.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

passo() { echo "==> [$(date +%T)] $*"; }

passo "Início da preparação da VM"

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

passo "Fim da preparação da VM"
