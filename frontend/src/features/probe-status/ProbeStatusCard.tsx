import { Anchor, Button, Text } from '@mantine/core'
import { useCallback, useEffect, useState } from 'react'
import { formatLocal } from '../../lib/time'
import { fetchProbeStatus, type ProbeStatus } from './status'
import './probe-status.css'

const refreshSeconds = 30
const looks: Record<number, { key: string, label: string }> = {
  0: { key: 'never', label: 'Nunca conectou' },
  1: { key: 'connected', label: 'Conectada' },
  2: { key: 'disconnected', label: 'Desconectada' },
  3: { key: 'abandoned', label: 'Abandonada' },
}

function Guidance({ probe }: { probe: ProbeStatus }) {
  const since = probe.status.since ? formatLocal(probe.status.since) : null
  switch (probe.status.id) {
    case 0: return <Text size="sm">
      Sua probe ainda não se conectou ao RIPE Atlas. Você já ligou a probe no passo 2? Depois de ligada, ela deve conectar em cerca de um minuto.
    </Text>
    case 1: return <Text size="sm">
      Sua probe está conectada{since && ` desde ${since}`}. Os primeiros resultados podem levar cerca de meia hora para aparecer.{' '}
      <Anchor href="#/minha-probe">Ver Minha probe</Anchor>
    </Text>
    case 2: return <Text size="sm">
      Sua probe está desconectada{since && ` desde ${since}`}. Confira se o computador e a máquina virtual estão ligados e com Internet. Quando a rede volta, a probe se reconecta sozinha.{' '}
      <Anchor href="#/instalar">Ver problemas comuns</Anchor>
    </Text>
    default: return <Text size="sm">O RIPE Atlas mostra este status para a sua probe. Veja os detalhes na página dela.</Text>
  }
}

export default function ProbeStatusCard({ probeId }: { probeId: number }) {
  const [probe, setProbe] = useState<ProbeStatus | null>(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  const check = useCallback(async (signal: AbortSignal) => {
    setChecking(true)
    try {
      setProbe(await fetchProbeStatus(probeId, signal))
      setError('')
    } catch {
      if (!signal.aborted) setError('Não foi possível consultar o RIPE Atlas agora. Tente de novo em instantes.')
    } finally {
      if (!signal.aborted) setChecking(false)
    }
  }, [probeId])

  useEffect(() => {
    const controller = new AbortController()
    setProbe(null)
    check(controller.signal)
    return () => controller.abort()
  }, [check])

  const connected = probe?.status.id === 1
  useEffect(() => {
    if (connected) return
    const controller = new AbortController()
    const timer = setInterval(() => check(controller.signal), refreshSeconds * 1000)
    return () => { clearInterval(timer); controller.abort() }
  }, [check, connected])

  const look = probe ? looks[probe.status.id] ?? { key: 'abandoned', label: probe.status.name } : null
  return <div className={`status-card ${look ? `status-${look.key}` : ''}`} aria-live="polite">
    {look && probe && <>
      <Text className="status-name"><span className="status-dot" aria-hidden="true" />{look.label} <span className="status-original">({probe.status.name})</span></Text>
      <Guidance probe={probe} />
    </>}
    {!probe && !error && <Text size="sm">Consultando o RIPE Atlas…</Text>}
    {error && <Text size="sm" role="alert">{error}</Text>}
    <div className="status-actions">
      <Button size="compact-sm" variant="default" loading={checking} onClick={() => check(new AbortController().signal)}>Verificar de novo</Button>
      <Anchor size="sm" href={`https://atlas.ripe.net/probes/${probeId}/`} target="_blank" rel="noreferrer">Abrir a página da probe no RIPE Atlas</Anchor>
    </div>
    {!connected && <Text size="xs" c="dimmed" mt="xs">A página consulta de novo a cada {refreshSeconds} segundos enquanto a probe não estiver conectada.</Text>}
  </div>
}
