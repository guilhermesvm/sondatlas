# Desliga a aplicação e, se existir, a VM da probe do kit. Os dados ficam guardados.
# Uso: powershell -ExecutionPolicy Bypass -File .\stop-kit.ps1 [-Probe | -App]
# -Probe: só a VM da probe; a aplicação continua ligada.
# -App: só a aplicação; a probe continua ligada e ganhando créditos.
param([switch]$Probe, [switch]$App)

if ($Probe -and $App) { Write-Host 'Use -Probe ou -App, não os dois.' -ForegroundColor Red; exit 2 }

$arquivoCompose = Join-Path $PSScriptRoot 'compose.yaml'
$pastaLab = Join-Path $PSScriptRoot 'lab'

function Passo($texto) { Write-Host "==> $texto" }
function Erro($texto) { Write-Host "ERRO: $texto" -ForegroundColor Red; exit 1 }

if (-not $Probe) {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Passo 'Docker não encontrado, então não há aplicação para desligar'
    } else {
        $null = docker info 2>&1
        if ($LASTEXITCODE -ne 0) {
            Passo 'O Docker não está rodando, então a aplicação já está parada'
        } else {
            Passo 'Desligando a aplicação'
            docker compose -f $arquivoCompose stop
            if ($LASTEXITCODE -ne 0) { Erro 'A aplicação não parou. Veja a mensagem acima.' }
        }
    }
}

if ($App) {
    Write-Host 'A VM da probe não foi mexida. Se estiver ligada, a probe continua medindo e ganhando créditos.'
} elseif (-not (Get-Command vagrant -ErrorAction SilentlyContinue)) {
    if ($Probe) { Erro 'Vagrant não encontrado. Veja como instalar em lab/README.md, na seção Pré-requisitos.' }
    Passo 'Vagrant não encontrado, então não há VM do kit para desligar'
} else {
    Push-Location $pastaLab
    $linha = vagrant status --machine-readable | Select-String ',state,' | Select-Object -First 1
    $estado = if ($linha) { $linha.ToString().Split(',')[3] }
    $codigo = 0
    if ($estado -eq 'not_created') {
        Passo 'Não há VM do kit para desligar'
    } elseif ($estado -eq 'running') {
        Passo 'Desligando a VM da probe'
        vagrant halt
        $codigo = $LASTEXITCODE
        if ($codigo -eq 0) { Write-Host 'Com a VM desligada, a probe aparece como Disconnected no RIPE Atlas e não ganha créditos até você ligar de novo.' }
    } else {
        Passo 'A VM da probe já estava desligada'
    }
    Pop-Location
    if ($codigo -ne 0) { Erro 'A VM da probe não desligou. Veja a mensagem acima.' }
}

$opcao = if ($Probe) { ' -Probe' } elseif ($App) { ' -App' } else { '' }
Passo "Pronto. Para ligar de novo: powershell -ExecutionPolicy Bypass -File .\start-kit.ps1$opcao"
