# Desliga a aplicação e a probe (VM do kit). Os dados ficam guardados.
# Uso: powershell -ExecutionPolicy Bypass -File .\stop-kit.ps1 [-NoVM]
# -NoVM: desliga só a aplicação.
param([switch]$NoVM)

$arquivoCompose = Join-Path $PSScriptRoot 'compose.yaml'
$pastaLab = Join-Path $PSScriptRoot 'lab'

function Passo($texto) { Write-Host "==> $texto" }
function Erro($texto) { Write-Host "ERRO: $texto" -ForegroundColor Red; exit 1 }

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

if (-not $NoVM) {
    if (-not (Get-Command vagrant -ErrorAction SilentlyContinue)) {
        Erro 'Vagrant não encontrado. Se a sua probe não usa a VM do kit, rode de novo com -NoVM no fim.'
    }
    Push-Location $pastaLab
    $linha = vagrant status --machine-readable | Select-String ',state,' | Select-Object -First 1
    $estado = if ($linha) { $linha.ToString().Split(',')[3] }
    if ($estado -eq 'running') {
        Passo 'Desligando a VM da probe'
        vagrant halt
        $codigo = $LASTEXITCODE
    } else {
        Passo 'A VM da probe já estava desligada'
        $codigo = 0
    }
    Pop-Location
    if ($codigo -ne 0) { Erro 'A VM da probe não desligou. Veja a mensagem acima.' }
    Write-Host 'Com a VM desligada, a probe aparece como Disconnected no RIPE Atlas e não ganha créditos até você ligar de novo.'
}

Passo 'Pronto. Para ligar de novo: powershell -ExecutionPolicy Bypass -File .\start-kit.ps1'
