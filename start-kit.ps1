# Liga a probe (VM do kit) e a aplicação e abre o dashboard.
# Uso: powershell -ExecutionPolicy Bypass -File .\start-kit.ps1 [-NoVM]
# -NoVM: para quem instalou a probe direto num Debian ou Raspberry Pi.
# Pode ser rodado de novo a qualquer momento: o que já está ligado continua igual.
param([switch]$NoVM)

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

Passo 'Conferindo os pré-requisitos'
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
if (-not $NoVM) {
    if (-not (Get-Command vagrant -ErrorAction SilentlyContinue)) {
        Erro 'Vagrant não encontrado. Veja como instalar em lab/README.md, na seção Pré-requisitos. Se a sua probe não usa a VM do kit, rode de novo com -NoVM no fim.'
    }
    $vboxManage = Join-Path "$env:VBOX_MSI_INSTALL_PATH" 'VBoxManage.exe'
    if (-not (Test-Path $vboxManage) -and -not (Get-Command VBoxManage -ErrorAction SilentlyContinue)) {
        Erro 'VirtualBox não encontrado. Veja como instalar em lab/README.md, na seção Pré-requisitos.'
    }
}

if (-not $NoVM) {
    $estado = EstadoDaVM
    if ($estado -eq 'running') {
        Passo 'A VM da probe já está ligada'
    } else {
        if ($estado -eq 'not_created') {
            Passo 'Criando a VM da probe pela primeira vez (leva uns 6 minutos)'
            Write-Host 'O Vagrant vai perguntar qual placa de rede usar. Escolha a que você usa para acessar a internet (Wi-Fi ou cabo).'
            Write-Host 'No fim aparecem a chave pública e o link de cadastro. Guarde os dois para ativar a probe.'
        } else {
            Passo 'Ligando a VM da probe'
        }
        Push-Location $pastaLab
        vagrant up
        $codigo = $LASTEXITCODE
        Pop-Location
        if ($codigo -ne 0) { Erro 'A VM da probe não ligou. Veja a mensagem acima e as dicas em lab/README.md.' }
        if ($estado -eq 'saved') {
            Write-Host 'A VM estava com o estado salvo. Se a probe não aparecer como conectada em alguns minutos, rode vagrant reload na pasta lab.'
        }
    }
}

Passo 'Ligando a aplicação (banco, coleta, API e dashboard)'
docker compose -f $arquivoCompose up -d --build
if ($LASTEXITCODE -ne 0) { Erro 'A aplicação não subiu. Veja a mensagem acima.' }

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
Write-Host 'Para desligar tudo: powershell -ExecutionPolicy Bypass -File .\stop-kit.ps1'
