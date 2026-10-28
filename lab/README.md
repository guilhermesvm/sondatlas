# Kit da probe RIPE Atlas

Cria uma VM Debian com a Software Probe oficial do RIPE Atlas instalada.
Quem já tem Debian ou Raspberry Pi OS pode instalar sem VM (veja abaixo).

## Pré-requisitos

| Item | Como conferir no Windows (PowerShell) | Como conferir no Linux |
|---|---|---|
| Virtualização ativada na BIOS/UEFI | `systeminfo`; em "Requisitos do Hyper-V", "Hipervisor detectado" ou virtualização habilitada no firmware | `grep -Ec '(vmx\|svm)' /proc/cpuinfo` maior que 0 indica CPU compatível; a BIOS ainda pode bloquear |
| [VirtualBox](https://www.virtualbox.org/) 7.x | VirtualBox → Ajuda → Sobre (o `VBoxManage` costuma não estar no PATH) | `VBoxManage --version` |
| [Vagrant](https://developer.hashicorp.com/vagrant/install) | `vagrant --version` | `vagrant --version` |
| ~4 GB livres em disco | `Get-PSDrive C` (coluna *Free*) | `df -h ~` |

Se a virtualização estiver desligada, o VirtualBox avisa ao tentar ligar a VM.

No Windows, o VirtualBox e o Vagrant podem ser instalados pelo `winget` (o
Windows pede permissão de administrador):

```powershell
winget install --id Oracle.VirtualBox --exact
winget install --id Hashicorp.Vagrant --exact
```

No Linux, siga as instruções oficiais de cada um, por distribuição:
[VirtualBox](https://www.virtualbox.org/wiki/Linux_Downloads) e
[Vagrant](https://developer.hashicorp.com/vagrant/install) (aba Linux).

## Criar a VM

Nesta pasta (`lab/`):

```bash
vagrant up
```

O Vagrant pergunta qual placa de rede usar. Escolha a que você usa para
acessar a internet (Wi-Fi ou cabo). **Não** escolha `Hyper-V Virtual Ethernet
Adapter`, `vEthernet` ou `VirtualBox Host-Only`. A escolha fica salva na VM e
não é perguntada de novo; só volta a ser perguntada depois de `vagrant destroy`
ou se a placa deixar de existir.

Escolheu a placa errada? Rode `vagrant halt`. No VirtualBox, abra
**Configurações → Rede → Adaptador 2** da VM `kit-ripe-atlas-probe`, troque o
**Nome** pela placa certa e salve. Depois rode `vagrant up --provision`.

No fim, aparecem a **chave pública** e o link de cadastro.

Em vez de `vagrant up`, você pode usar o `start-kit` da pasta principal com
`--probe` (`-Probe` no PowerShell). Ele confere a virtualização, o VirtualBox e o
Vagrant antes, cria a VM e mostra a chave no fim. No dia a dia, o `start-kit`
sem opção liga a VM e a aplicação (dashboard) juntas, e o `stop-kit` desliga as
duas. Com `--probe` ou `--app`, cada um cuida só de uma parte: por exemplo,
`stop-kit --app` desliga só a aplicação e deixa a probe ganhando créditos. Os
comandos estão no `README.md` principal, em *Quick start*.

## Ativar a probe

1. Cadastre a chave em <https://atlas.ripe.net/register/swprobe> (requer conta RIPE).
2. Depois do cadastro:

```bash
vagrant ssh -c "sudo systemctl enable --now ripe-atlas"
```

## Já tem Debian ou Raspberry Pi OS?

Sem VM: Debian 11, 12 ou 13 (amd64) ou Debian / Raspberry Pi OS 12 ou 13
(arm64, Raspberry Pi de 64 bits). *Raspberry Pi: documentado, não testado.*

```bash
git clone <URL deste repositório>
sudo bash <pasta do repositório>/lab/install-probe.sh
```

O script só instala a probe oficial: não atualiza o sistema nem altera rede ou
SSH. Cadastre a chave exibida e, depois do cadastro:

```bash
sudo systemctl enable --now ripe-atlas
```

## Outros comandos

| Comando | Faz |
|---|---|
| `vagrant ssh -c "sudo cat /etc/ripe-atlas/probe_key.pub"` | Mostra a chave de novo |
| `vagrant halt` | Desliga a VM (a probe fica offline) |
| `vagrant up` | Liga a VM de novo; a probe inicia sozinha |
| `vagrant reload` | Reinicia a VM (desliga e liga) sem apagar nada |
| `vagrant reload --provision` | Reinicia e reaplica a configuração |
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
- A probe usa só a placa escolhida. Se você deixar de usar essa rede (por
  exemplo, desligar o Wi-Fi e passar para o cabo), ela fica desconectada até a
  rede voltar ou até você trocar a placa (veja "Escolheu a placa errada?").
  Depois de reconectar, os dados podem levar cerca de meia hora para aparecer.
