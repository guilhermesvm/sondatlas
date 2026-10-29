import { Anchor, Button, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import Loading from '../../lib/Loading'
import { useProbe } from '../probe-status/ProbeProvider'
import { fetchProbeWorld, tested, type ProbeWorld as World } from './world'
import './probe-world.css'

const count = (value: number) => value.toLocaleString('pt-BR')
const countries = new Intl.DisplayNames(['pt-BR'], { type: 'region' })
const maxNeighbors = 12

function neighborsText(others: number, connectedHere: boolean) {
  if (connectedHere) return others === 0 ? 'É a única probe pública conectada nessa rede agora.'
    : others === 1 ? 'Outra probe pública mede a partir dessa rede.' : `Outras ${count(others)} probes públicas medem a partir dessa rede.`
  return others === 0 ? 'Nenhuma probe pública está conectada nessa rede agora.'
    : others === 1 ? '1 probe pública está conectada nessa rede agora.' : `${count(others)} probes públicas estão conectadas nessa rede agora.`
}

// Sonar rings: the probe in the middle, then its network, its country and the world. The line style of each ring is repeated in the text as its legend.
function Sonar({ others }: { others: number }) {
  const shown = Math.min(others, maxNeighbors)
  return <svg className="world-sonar" viewBox="0 0 240 240" aria-hidden="true">
    <circle className="ring ring-world" cx="120" cy="120" r="112" />
    <circle className="ring ring-country" cx="120" cy="120" r="80" />
    <circle className="ring ring-network" cx="120" cy="120" r="46" />
    {Array.from({ length: shown }, (_, index) => {
      const angle = -Math.PI / 2 + (index + 0.5) * (2 * Math.PI / Math.max(shown, 6))
      return <circle key={index} className="neighbor" cx={120 + 46 * Math.cos(angle)} cy={120 + 46 * Math.sin(angle)} r="4.5" />
    })}
    <circle className="pulse" cx="120" cy="120" r="8" />
    <circle className="probe" cx="120" cy="120" r="8" />
  </svg>
}

export default function ProbeWorld() {
  const { probeId, status } = useProbe()
  const [world, setWorld] = useState<World | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!probeId) return
    const controller = new AbortController()
    setWorld(null)
    setFailed(false)
    fetchProbeWorld(probeId, controller.signal).then(setWorld, () => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [probeId, attempt])

  if (!probeId) return null
  const heading = <Title order={2} size="h4" id="probe-world">A probe {probeId} no mundo</Title>
  if (failed) return <section className="world" aria-labelledby="probe-world">
    {heading}
    <Text size="sm" mt="xs">O RIPE Atlas não respondeu agora, então não dá para mostrar onde a probe está.</Text>
    <Button variant="default" size="xs" mt="sm" onClick={() => setAttempt(value => value + 1)}>Tentar de novo</Button>
  </section>
  if (!world) return <section className="world" aria-labelledby="probe-world">{heading}<Loading mt="sm">Situando a probe no mundo…</Loading></section>

  const connectedHere = status?.status.id === 1
  const others = Math.max(0, (world.network ?? 0) - (connectedHere ? 1 : 0))
  const country = world.country ? countries.of(world.country) ?? world.country : null
  const results = tested(world.tags)
  return <section className="world" aria-labelledby="probe-world">
    {heading}
    <div className="world-layout">
      <Sonar others={world.asn ? others : 0} />
      <ul className="world-scales">
        <li data-ring="network">
          <Text fw={600}>{world.asn ? <>Na rede {world.holder ?? `AS${world.asn}`}{world.holder && <Text span c="dimmed" fw={400}> AS{world.asn}</Text>}</> : 'Na rede dela'}</Text>
          <Text size="sm">{world.asn ? neighborsText(others, connectedHere) : 'O RIPE Atlas não informa a rede desta probe.'}</Text>
        </li>
        {country && world.inCountry !== null && <li data-ring="country">
          <Text fw={600}>No país: {country}</Text>
          <Text size="sm">{world.inCountry === 1 ? 'É a única probe pública conectada no país.' : `Uma das ${count(world.inCountry)} probes públicas conectadas no país.`}</Text>
        </li>}
        <li data-ring="world">
          <Text fw={600}>No mundo</Text>
          <Text size="sm">
            {count(world.inWorld)} probes públicas conectadas
            {country && world.inCountry ? `, ${(world.inCountry / world.inWorld * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% delas no país` : ''}.
            {' '}<Anchor href="#/rede-global" size="sm">Ver onde elas estão</Anchor>
          </Text>
        </li>
      </ul>
    </div>
    {results.length > 0 && <Text size="sm" c="dimmed" mt="md" maw={700}>
      O RIPE Atlas testa a probe a cada 4 horas. No último teste: {results.join(', ')}. A <Anchor href="#/aprender/ip" size="sm">lição de IP</Anchor> explica o que isso quer dizer.
    </Text>}
  </section>
}
