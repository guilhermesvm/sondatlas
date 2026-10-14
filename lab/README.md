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
| `vagrant destroy -f` | Apaga a VM e a chave |

## Verificar a probe

Na pasta `lab/`:

| Comando | Mostra |
|---|---|
| `vagrant status` | Se a VM está ligada (`running`) |
| `vagrant ssh -c "systemctl is-enabled ripe-atlas; systemctl is-active ripe-atlas"` | `enabled` = liga junto com a VM; `active` = rodando agora |
| `vagrant ssh -c "sudo ssh-keygen -lf /etc/ripe-atlas/probe_key.pub"` | Impressão digital da chave (identifica a chave sem exibi-la) |
| `vagrant ssh -c "sudo journalctl -u ripe-atlas -n 30 --no-pager"` | Últimas 30 linhas do log da probe |
| `vagrant ssh -c "ip -br -4 addr; ip route"` | Endereço e gateway da VM |
| `vagrant ssh -c "df -h /"` | Espaço em disco dentro da VM |

Status público: `https://atlas.ripe.net/probes/<ID>/` (*Connected* = funcionando).
Depois de reiniciar o computador, `vagrant up` religa a VM e a probe volta sozinha.

Recriou a VM? A chave muda. Atualize-a na probe existente em
*atlas.ripe.net → My Probes → Manage*, em vez de cadastrar outra probe.

## Por que a box `bento/debian-13`?

O Debian deixou de publicar boxes oficiais para VirtualBox por volta de
janeiro de 2025 (consulta ao Vagrant Cloud em 2026-10-14). O RIPE Atlas
publica pacotes para Debian 11, 12 e 13.

| | `bento/debian-13` (usada) | `debian/bookworm64` (oficial) |
|---|---|---|
| Quem publica | Terceiro: projeto Bento (Progress Chef), receita pública a partir da ISO oficial | O próprio Debian |
| Versão | Debian 13 — suporte até 2028, LTS até 2030 | Debian 12 — LTS até 30/06/2028 |
| Box mais recente | out/2025 | jan/2025, sem novas versões para VirtualBox |
| Contra | Confiar que a box corresponde à receita | Box cada vez mais defasada; mais atualização no `vagrant up` (não medido) |

Debian 11 (`debian/bullseye64`) foi descartado: sem suporte de segurança desde
31/08/2026. Em ambos os casos, o provisionamento atualiza o sistema com
pacotes oficiais assinados do Debian.

## Observações

- Rede padrão: NAT (somente IPv4). Para IPv6, use `LAB_BRIDGE=1 vagrant up`
  (no PowerShell: `$env:LAB_BRIDGE=1; vagrant up`). *Documentado, não testado.*
- Windows com Hyper-V/WSL2/Docker Desktop: funciona, porém mais lento.
- A probe só fica online com a VM ligada; prefira uma máquina sempre ligada.
