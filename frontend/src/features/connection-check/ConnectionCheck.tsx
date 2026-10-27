import { Button, Text } from '@mantine/core'
import SystemError from '../../lib/SystemError'
import { useEffect, useRef, useState } from 'react'
import { fetchSelectedProbe } from '../../lib/api'
import { fetchAccount } from '../atlas-account/account'
import { checkConnection, type Connection } from './connection'
import './connection-check.css'

const maxDots = 24

const count = (value: number) => value.toLocaleString('pt-BR')

// Only the linked account proves a probe is the person's. A followed probe may belong to anyone, like a friend or the university.
function verdict({ probes }: Connection, mine: number, followed: number | null) {
  if (probes === 0) return 'Nenhuma probe pública conectada nessa rede. A sua seria a primeira a medir a partir dela.'
  if (mine >= probes) return `${probes === 1 ? 'A única probe pública conectada nessa rede é a sua.' : `As ${count(probes)} probes públicas conectadas nessa rede são suas.`}`
    + ' Outra probe aqui mediria a partir da mesma rede. Numa rede sem probes, como a de outro provedor, ela seria a primeira.'
  const more = mine ? '' : ' Mais uma acrescenta outro ponto de medição nela.'
  const watched = followed ? `a ${followed}, que você acompanha na Sondatlas` : ''
  if (probes === 1 && watched) return `Já existe 1 probe pública conectada nessa rede: ${watched}.${more}`
  const existing = probes === 1 ? 'Já existe 1 probe pública conectada' : `Já existem ${count(probes)} probes públicas conectadas`
  const yours = mine === 1 ? '1 delas é sua' : `${count(mine)} delas são suas`
  if (mine && watched) return `${existing} nessa rede. ${mine === 1 ? 'Uma delas é sua' : `${count(mine)} delas são suas`}, e outra é ${watched}.`
  if (mine) return `${existing} nessa rede, e ${yours}.`
  if (watched) return `${existing} nessa rede, e uma delas é ${watched}.${more}`
  return `${existing} nessa rede.${more}`
}

// What Sondatlas knows about the person: the probes of the linked account and the followed one. Without the local API, nothing, and the check works as before.
async function knownProbes(signal: AbortSignal) {
  const [followed, account] = await Promise.all([
    fetchSelectedProbe(signal).catch(() => null),
    fetchAccount(signal).catch(() => null),
  ])
  return { followed, account: (account?.probes ?? []).map(probe => probe.id) }
}

export default function ConnectionCheck() {
  const [connection, setConnection] = useState<Connection | null>(null)
  const [known, setKnown] = useState<{ followed: number | null, account: number[] }>({ followed: null, account: [] })
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
      const knowing = knownProbes(controller.signal)
      const result = await checkConnection(controller.signal, knowing.then(({ followed, account }) => [...new Set([...account, ...(followed ? [followed] : [])])]))
      setKnown(await knowing)
      setConnection(result)
    } catch {
      if (!controller.signal.aborted) setConnection(null)
      if (!controller.signal.aborted) setError('Confira se você está conectado à Internet e tente de novo.')
    } finally {
      if (!controller.signal.aborted) setChecking(false)
    }
  }

  if (!connection) return <div className="connection-check" aria-live="polite">
    <Text size="sm">Descubra qual é o seu provedor e quantas probes já medem a partir dele.</Text>
    <Button mt="sm" onClick={check} loading={checking}>Verificar minha conexão</Button>
    {error && <SystemError title="Não foi possível consultar agora">{error}</SystemError>}
    <Text size="xs" c="dimmed" mt="sm">O seu navegador consulta o RIPEstat e o RIPE Atlas. A Sondatlas não guarda nada e não mostra o seu IP.</Text>
  </div>

  const mineCount = connection.known.filter(id => known.account.includes(id)).length
  const followed = known.followed && connection.known.includes(known.followed) && !known.account.includes(known.followed) ? known.followed : null
  const shown = Math.min(connection.probes, maxDots)
  const mine = Math.min(mineCount, shown)
  return <div className="connection-check" aria-live="polite">
    <Text className="connection-holder">{connection.holder}</Text>
    <Text size="sm" c="dimmed">AS{connection.asn}, conexão IPv{connection.family}</Text>
    <div className="probe-dots" aria-hidden="true">
      {Array.from({ length: shown }, (_, index) => <span key={index} className={index < mine ? 'probe-dot mine' : 'probe-dot'} title={index < mine ? 'Uma probe sua' : undefined} />)}
      {connection.probes > maxDots && <span className="probe-dots-more">+{(connection.probes - maxDots).toLocaleString('pt-BR')}</span>}
      {!mineCount && <span className="probe-dot yours" title="A sua probe" />}
    </div>
    <Text size="sm" mt="xs">{verdict(connection, mineCount, followed)}</Text>
    <Text size="xs" c="dimmed" mt="sm">Conta só probes públicas. Faça a consulta na rede onde a probe vai ficar: o Wi-Fi da faculdade, por exemplo, é outra rede.</Text>
    <Button variant="subtle" size="compact-sm" mt="xs" onClick={check} loading={checking}>Verificar de novo</Button>
  </div>
}
