import { Button, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { checkConnection, type Connection } from './connection'
import './connection-check.css'

const maxDots = 24

function verdict(probes: number) {
  if (probes === 0) return 'Nenhuma probe pública conectada nessa rede. A sua seria a primeira a medir a partir dela.'
  const existing = probes === 1 ? 'Já existe 1 probe pública conectada' : `Já existem ${probes.toLocaleString('pt-BR')} probes públicas conectadas`
  return `${existing} nessa rede. Mais uma acrescenta outro ponto de medição nela.`
}

export default function ConnectionCheck() {
  const [connection, setConnection] = useState<Connection | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)

  useEffect(() => () => request.current?.abort(), [])

  async function check() {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setChecking(true)
    setError('')
    try {
      setConnection(await checkConnection(controller.signal))
    } catch {
      if (!controller.signal.aborted) setConnection(null)
      if (!controller.signal.aborted) setError('Não foi possível consultar agora. Confira se você está conectado à Internet e tente de novo.')
    } finally {
      if (!controller.signal.aborted) setChecking(false)
    }
  }

  if (!connection) return <div className="connection-check" aria-live="polite">
    <Text size="sm">Descubra qual é o seu provedor e quantas probes já medem a partir dele.</Text>
    <Button mt="sm" onClick={check} loading={checking}>Verificar minha conexão</Button>
    {error && <Text size="sm" mt="sm" className="form-error" role="alert">{error}</Text>}
    <Text size="xs" c="dimmed" mt="sm">O seu navegador consulta o RIPEstat e o RIPE Atlas. A Sondatlas não guarda nada e não mostra o seu IP.</Text>
  </div>

  const shown = Math.min(connection.probes, maxDots)
  return <div className="connection-check" aria-live="polite">
    <Text className="connection-holder">{connection.holder}</Text>
    <Text size="sm" c="dimmed">AS{connection.asn}, conexão IPv{connection.family}</Text>
    <div className="probe-dots" aria-hidden="true">
      {Array.from({ length: shown }, (_, index) => <span key={index} className="probe-dot" />)}
      {connection.probes > maxDots && <span className="probe-dots-more">+{(connection.probes - maxDots).toLocaleString('pt-BR')}</span>}
      <span className="probe-dot yours" title="A sua probe" />
    </div>
    <Text size="sm" mt="xs">{verdict(connection.probes)}</Text>
    <Text size="xs" c="dimmed" mt="sm">Conta só probes públicas. Faça a consulta na rede onde a probe vai ficar: o Wi-Fi da faculdade, por exemplo, é outra rede.</Text>
    <Button variant="subtle" size="compact-sm" mt="xs" onClick={check} loading={checking}>Verificar de novo</Button>
  </div>
}
