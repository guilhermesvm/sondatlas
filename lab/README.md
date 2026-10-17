# Kit da probe RIPE Atlas

Cria uma VM Debian com a Software Probe oficial do RIPE Atlas instalada.

## Pré-requisitos

- Virtualização ativada na BIOS/UEFI
- [VirtualBox](https://www.virtualbox.org/) 7.x
- [Vagrant](https://developer.hashicorp.com/vagrant/install)
- Cerca de 4 GB livres em disco

## Criar a VM

Nesta pasta (`lab/`):

```bash
vagrant up
```

O Vagrant pergunta qual placa de rede usar. Escolha a que você usa para
acessar a internet (Wi-Fi ou cabo). **Não** escolha `Hyper-V Virtual Ethernet
Adapter`, `vEthernet` ou `VirtualBox Host-Only`. A pergunta se repete a cada
`vagrant up` e `vagrant reload`.

No fim, aparecem a **chave pública** e o link de cadastro.

## Ativar a probe

1. Cadastre a chave em <https://atlas.ripe.net/register/swprobe> (requer conta RIPE).
2. Depois do cadastro:

```bash
vagrant ssh -c "sudo systemctl enable --now ripe-atlas"
```

## Outros comandos

| Comando | Faz |
|---|---|
| `vagrant ssh -c "sudo cat /etc/ripe-atlas/probe_key.pub"` | Mostra a chave de novo |
| `vagrant halt` | Desliga a VM (a probe fica offline) |
| `vagrant up` | Liga a VM de novo; a probe inicia sozinha |
| `vagrant reload` | Reinicia a VM (desliga e liga) sem apagar nada |
| `vagrant reload --provision` | Reinicia e reaplica a configuração (use se escolheu a placa errada) |
| `vagrant destroy -f` | Apaga a VM e a chave |

Desligue sempre com `vagrant halt`. Fechar a janela do VirtualBox com
"Salvar o estado" e retomar depois deixa a probe desconectada; nesse caso,
use `vagrant reload`.

## Verificar a probe

Na pasta `lab/`:

| Comando | Mostra |
|---|---|
| `vagrant status` | Se a VM está ligada (`running`) |
| `vagrant ssh -c "systemctl is-enabled ripe-atlas; systemctl is-active ripe-atlas"` | `enabled` = liga junto com a VM; `active` = rodando agora |
| `vagrant ssh -c "sudo ssh-keygen -lf /etc/ripe-atlas/probe_key.pub"` | Impressão digital da chave (identifica a chave sem exibi-la) |
| `vagrant ssh -c "sudo journalctl -u ripe-atlas -n 30 --no-pager"` | Últimas 30 linhas do log da probe |
| `vagrant ssh -c "ip -br -4 addr; ip route get 1.1.1.1"` | Endereços da VM e por onde sai o tráfego (deve ser `eth1`, a bridge) |
| `vagrant ssh -c "df -h /"` | Espaço em disco dentro da VM |

Status público: `https://atlas.ripe.net/probes/<ID>/` (*Connected* = funcionando).
Depois de reiniciar o computador, `vagrant up` religa a VM e a probe volta sozinha.

Recriou a VM? A chave muda. Atualize-a na probe existente em
*atlas.ripe.net → My Probes → Manage*, em vez de cadastrar outra probe.

## Observações

- Box: `bento/debian-13`. O Debian não publica boxes oficiais para VirtualBox
  desde 2025.
- Rede: a VM entra na sua rede local como um aparelho próprio (bridge) e a
  probe mede por ela. A placa NAT existe só para o Vagrant gerenciar a VM.
- Segurança: a VM só aceita SSH por chave (sem senha) e não abre outras portas
  na rede local. A probe faz apenas conexões de saída.
- IPv6: depende da sua rede oferecer. *Não testado.*
- Windows com Hyper-V/WSL2/Docker Desktop: funciona, porém mais lento.
- A probe só fica online com a VM ligada; prefira uma máquina sempre ligada.
