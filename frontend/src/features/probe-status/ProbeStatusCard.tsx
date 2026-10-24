import { Anchor, Button, Text } from '@mantine/core'
import { formatLocal } from '../../lib/time'
import { useProbe } from './ProbeProvider'
import { statusLook, type ProbeStatus } from './status'
import './probe-status.css'

function Guidance({ probe, detailsLink }: { probe: ProbeStatus, detailsLink: boolean }) {
  const since = probe.status.since ? formatLocal(probe.status.since) : null
  switch (probe.status.id) {
    case 0: return <Text size="sm">
      Sua probe ainda não se conectou ao RIPE Atlas. Você já ligou a probe no passo 2? Depois de ligada, ela deve conectar em cerca de um minuto.
    </Text>
    case 1: return <Text size="sm">
      Sua probe está conectada{since && ` desde ${since}`}. Os primeiros resultados podem levar cerca de meia hora para aparecer.
      {detailsLink && <>{' '}<Anchor href="#/minha-probe">Ver Minha probe</Anchor></>}
    </Text>
    case 2: return <Text size="sm">
      Sua probe está desconectada{since && ` desde ${since}`}. Confira se o computador e a máquina virtual estão ligados e com Internet. Quando a rede volta, a probe se reconecta sozinha.{' '}
      <Anchor href="#/instalar">Ver problemas comuns</Anchor>
    </Text>
    default: return <Text size="sm">O RIPE Atlas mostra este status para a sua probe. Veja os detalhes na página dela.</Text>
  }
}

export default function ProbeStatusCard({ detailsLink = true }: { detailsLink?: boolean }) {
  const { probeId, status: probe, statusError, checking, check } = useProbe()
  const look = probe ? statusLook(probe) : null
  return <div className={`status-card ${look ? `status-${look.key}` : ''}`} aria-live="polite">
    {look && probe && <>
      <Text className="status-name"><span className="status-dot" data-status={look.key} aria-hidden="true" />{look.label} <span className="status-original">({probe.status.name})</span></Text>
      <Guidance probe={probe} detailsLink={detailsLink} />
    </>}
    {!probe && !statusError && <Text size="sm">Consultando o RIPE Atlas…</Text>}
    {statusError && <Text size="sm" role="alert">Não foi possível consultar o RIPE Atlas agora. Tente de novo em instantes.</Text>}
    <div className="status-actions">
      <Button size="compact-sm" variant="default" loading={checking} onClick={check}>Verificar de novo</Button>
      <Anchor size="sm" href={`https://atlas.ripe.net/probes/${probeId}/`} target="_blank" rel="noreferrer">Abrir a página da probe no RIPE Atlas</Anchor>
    </div>
  </div>
}
