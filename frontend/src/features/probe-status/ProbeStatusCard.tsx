import { Anchor, Button, Text } from '@mantine/core'
import SystemError from '../../lib/SystemError'
import { formatLocal } from '../../lib/time'
import { useProbe } from './ProbeProvider'
import { statusLook, type ProbeStatus } from './status'
import './probe-status.css'

type NextStep = { href: string, label: string }

function Guidance({ probe, next }: { probe: ProbeStatus, next?: NextStep }) {
  const since = probe.status.since ? formatLocal(probe.status.since) : null
  const recent = probe.status.since !== null && Date.now() - Date.parse(probe.status.since) < 3600000
  switch (probe.status.id) {
    case 0: return <Text size="sm">
      Sua probe ainda não se conectou ao RIPE Atlas. Você já ligou a probe no passo 2? Depois de ligada, ela deve conectar em cerca de um minuto.
    </Text>
    case 1: return <Text size="sm">
      Sua probe está conectada{since && ` desde ${since}`}.{recent && ' Os primeiros resultados podem levar cerca de meia hora para aparecer.'}
      {next && <>{' '}<Anchor href={next.href}>{next.label}</Anchor></>}
    </Text>
    case 2: return <Text size="sm">
      Sua probe está desconectada{since && ` desde ${since}`}. Confira se o computador e a máquina virtual estão ligados e com Internet. Quando a rede volta, a probe se reconecta sozinha.{' '}
      <Anchor href="#/instalar">Ver problemas comuns</Anchor>
    </Text>
    default: return <Text size="sm">O RIPE Atlas mostra este status para a sua probe. Veja os detalhes na página dela.</Text>
  }
}

export function StatusCard({ probeId, probe, error, checking, onCheck, next }: {
  probeId: number, probe: ProbeStatus | null, error: boolean, checking: boolean, onCheck?: () => void, next?: NextStep
}) {
  const actions = <div className="status-actions">
    {onCheck && <Button size="compact-sm" variant="default" loading={checking} onClick={onCheck}>Verificar de novo</Button>}
    <Anchor size="sm" href={`https://atlas.ripe.net/probes/${probeId}/`} target="_blank" rel="noreferrer">Abrir a página da probe no RIPE Atlas</Anchor>
  </div>
  if (!probe && error) return <>
    <SystemError title="Não foi possível consultar o RIPE Atlas" mt="0">Tente de novo em instantes.</SystemError>
    {actions}
  </>
  const look = probe ? statusLook(probe) : null
  return <div className={`status-card ${look ? `status-${look.key}` : ''}`} aria-live="polite">
    {look && probe && <>
      <Text className="status-name"><span className="status-dot" data-status={look.key} aria-hidden="true" />{look.label} <span className="status-original">({probe.status.name})</span></Text>
      <Guidance probe={probe} next={next} />
    </>}
    {!probe && <Text size="sm">Consultando o RIPE Atlas…</Text>}
    {probe && error && <Text size="sm" c="dimmed" mt="xs">Não foi possível atualizar agora. Este é o último status consultado.</Text>}
    {actions}
  </div>
}

export default function ProbeStatusCard() {
  const { probeId, status, statusError, checking, check } = useProbe()
  return probeId ? <StatusCard probeId={probeId} probe={status} error={statusError} checking={checking} onCheck={check} /> : null
}
