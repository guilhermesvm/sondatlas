# Liga a aplicação e, se existir, a VM da probe do kit, e abre o dashboard.
# Uso: powershell -ExecutionPolicy Bypass -File .\start-kit.ps1 [-Probe | -App]
# -Probe: só a probe. Confere os requisitos, cria a VM na primeira vez (ou a
# liga). Na criação, a instalação mostra a chave pública. Não mexe na aplicação.
# -App: só a aplicação, sem mexer na VM.
# Pode ser rodado de novo a qualquer momento: o que já está ligado continua igual.
param([switch]$Probe, [switch]$App)

if ($Probe -and $App) { Write-Host 'Use -Probe ou -App, não os dois.' -ForegroundColor Red; exit 2 }

$arquivoCompose = Join-Path $PSScriptRoot 'compose.yaml'
$pastaLab = Join-Path $PSScriptRoot 'lab'

function Passo($texto) { Write-Host "==> $texto" }
function Erro($texto) { Write-Host "ERRO: $texto" -ForegroundColor Red; exit 1 }

function EstadoDaVM {
    Push-Location $pastaLab
    $linha = vagrant status --machine-readable | Select-String ',state,' | Select-Object -First 1
    Pop-Location
    if ($linha) { return $linha.ToString().Split(',')[3] }
}

function Responde($url) {
    try {
        $null = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 5
        return $true
    } catch {
        return $null -ne $_.Exception.Response
    }
}

# Vazio se a VM do kit pode ser usada; senão, o motivo.
function MotivoSemVM {
    if (-not (Get-Command vagrant -ErrorAction SilentlyContinue)) {
        return 'Vagrant não encontrado. Veja como instalar em lab/README.md, na seção Pré-requisitos.'
    }
    $vboxManage = Join-Path "$env:VBOX_MSI_INSTALL_PATH" 'VBoxManage.exe'
    if (-not (Test-Path $vboxManage) -and -not (Get-Command VBoxManage -ErrorAction SilentlyContinue)) {
        return 'VirtualBox não encontrado. Veja como instalar em lab/README.md, na seção Pré-requisitos.'
    }
}

# Com o Hyper-V ligado (Docker Desktop, WSL2), o Windows informa a virtualização
# do firmware como desligada; o hipervisor presente já prova que ela está ativa.
function VirtualizacaoDesligada {
    try {
        $hipervisor = (Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).HypervisorPresent
        $firmware = [bool](Get-CimInstance Win32_Processor -ErrorAction Stop | Where-Object VirtualizationFirmwareEnabled)
        return -not ($hipervisor -or $firmware)
    } catch {
        return $false
    }
}

function LigarVM($estado) {
    if ($estado -eq 'running') {
        Passo 'A VM da probe já está ligada'
        return
    }
    if ($estado -eq 'not_created') {
        Passo 'Criando a VM da probe pela primeira vez (leva uns 6 minutos)'
        Write-Host 'O Vagrant vai perguntar qual placa de rede usar. Escolha a que você usa para acessar a internet (Wi-Fi ou cabo).'
    } else {
        Passo 'Ligando a VM da probe'
    }
    Push-Location $pastaLab
    vagrant up
    $codigo = $LASTEXITCODE
    Pop-Location
    if ($codigo -ne 0) { Erro 'A VM da probe não ligou. Veja a mensagem acima. Se ela fala em VT-x, AMD-V ou virtualização, ative a virtualização na BIOS. Mais dicas em lab/README.md.' }
    if ($estado -eq 'saved') {
        Write-Host 'A VM estava com o estado salvo. Se a probe não aparecer como conectada em alguns minutos, rode vagrant reload na pasta lab.'
    }
}

Passo 'Conferindo os pré-requisitos'
if ($Probe) {
    $motivo = MotivoSemVM
    if ($motivo) { Erro $motivo }
    if (VirtualizacaoDesligada) {
        Erro 'A virtualização está desligada na BIOS ou o processador não tem suporte. Ative a opção Intel VT-x ou AMD-V (às vezes chamada SVM) na configuração da BIOS e rode este comando de novo.'
    }
    LigarVM (EstadoDaVM)
    Passo 'Pronto. A VM da probe está ligada'
    exit 0
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Erro 'Docker não encontrado. Instale o Docker Desktop: https://docs.docker.com/desktop/setup/install/windows-install/'
}
$null = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Erro 'O Docker não está rodando. Abra o Docker Desktop, espere ele iniciar e rode este comando de novo.'
}
$versaoCompose = (docker compose version --short 2>$null) -replace '^v', '' -replace '[-+].*$', ''
if (-not $versaoCompose -or [version]$versaoCompose -lt [version]'2.24.0') {
    Erro 'O kit precisa do Docker Compose 2.24.0 ou mais novo. Atualize o Docker Desktop.'
}

if (-not $App) {
    $motivo = MotivoSemVM
    if ($motivo) {
        Passo 'Ligando só a aplicação, porque este computador não tem Vagrant ou VirtualBox. Isso é normal se a sua probe roda direto num Debian ou Raspberry Pi'
    } else {
        $estado = EstadoDaVM
        if ($estado -eq 'not_created') {
            Passo 'A VM da probe ainda não existe. Para instalar a probe, siga a fase Instalar do dashboard'
        } else {
            LigarVM $estado
        }
    }
}

Passo 'Ligando a aplicação (banco, coleta, API e dashboard)'
docker compose -f $arquivoCompose up -d --build
if ($LASTEXITCODE -ne 0) { Erro 'A aplicação não subiu. Veja a mensagem acima. Se ela fala em "port is already allocated", outro programa ou outra cópia do projeto já usa a porta. Veja como trocar no README, em Quick start.' }

Passo 'Esperando a API e o dashboard responderem'
$api = docker compose -f $arquivoCompose port api 8000
$web = docker compose -f $arquivoCompose port web 8080
$limite = (Get-Date).AddSeconds(120)
$apiPronta = $false
$webPronto = $false
while ((Get-Date) -lt $limite -and -not ($apiPronta -and $webPronto)) {
    if (-not $apiPronta) { $apiPronta = Responde "http://$api/probe" }
    if (-not $webPronto) { $webPronto = Responde "http://$web/" }
    if (-not ($apiPronta -and $webPronto)) { Start-Sleep -Seconds 2 }
}
if (-not $apiPronta) { Erro 'A API não respondeu em 2 minutos. Veja o motivo com: docker compose logs api' }
if (-not $webPronto) { Erro 'O dashboard não respondeu em 2 minutos. Veja o motivo com: docker compose logs web' }

$endereco = "http://$web/"
Passo "Pronto. Abrindo o dashboard em $endereco"
Start-Process $endereco
$parar = 'powershell -ExecutionPolicy Bypass -File .\stop-kit.ps1'
if ($App) {
    Write-Host "Para desligar a aplicação: $parar -App"
} else {
    Write-Host "Para desligar: $parar"
    if ($estado -and $estado -ne 'not_created') {
        Write-Host "Se quiser deixar a probe ligada ganhando créditos, desligue só a aplicação: $parar -App"
    }
}
