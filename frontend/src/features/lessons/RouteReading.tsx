import { Alert, Button, Text } from '@mantine/core'
import { formatLocal } from '../../lib/time'
import { formatMetric } from '../ping-history/chart'
import { median, type Hop, type HopNetwork, type Route, type Source } from './useTraceroute'
import './lessons.css'

// Who the route goes to. A root server is anycast and measured every 30 minutes, which some sentences depend on.
export interface Destination {
  name: string
  root: boolean
}

const called = (destination: Destination) => destination.root ? destination.name : `destino ${destination.name}`

const ms = (value: number) => `${formatMetric(value)} ms`

function list(items: (number | string)[]) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}` : String(items[0])
}

// Long registry names often end with an acronym, like "… Coordination Centre (RIPE NCC)".
function short(holder: string | null) {
  return holder?.match(/\(([^)]+)\)\s*$/)?.[1] ?? holder
}

const countries = new Intl.DisplayNames(['pt-BR'], { type: 'region' })

function place(network: HopNetwork) {
  if (network.kind !== 'exchange' || !network.city) return null
  return network.country ? `${network.city} (${countries.of(network.country) ?? network.country})` : network.city
}

function NetworkName({ hop, route, destination }: { hop: Hop, route: Route, destination: Destination }) {
  const network = hop.network
  if (hop.address === route.destination) return <><strong>{destination.name}, o destino</strong>{network.kind === 'network' && <> <code>AS{network.asn}</code></>}</>
  switch (network.kind) {
    case 'private': return <>Sua rede (endereço privado)</>
    case 'internal': return <>Endereço privado dentro de outra rede</>
    case 'network': return <>{short(network.holder) ?? 'Rede'} <code>AS{network.asn}</code></>
    case 'exchange': return <><strong>{network.name}</strong><br /><Text span size="xs">ponto de troca{network.city ? ` em ${place(network)}` : ''}{network.member ? `, entrada da rede ${short(network.member)}` : ''}</Text></>
    case 'unknown': return <>Rede não identificada</>
    case 'silent': return <Text span size="sm" c="dimmed">não respondeu</Text>
  }
}

// A root server keeps the lesson's line (address, then name). Any other destination reads like a real traceroute: name, then address.
export function Terminal({ route, destination, caption }: { route: Route, destination: Destination, caption: string }) {
  const named = destination.root ? `${route.destination} (${destination.name})`
    : route.destination && route.destination !== destination.name ? `${destination.name} (${route.destination})` : destination.name
  const lines = route.failure ? [`traceroute ${destination.name}`, `traceroute: ${route.failure}`] : [
    `traceroute ${named}, ${route.protocol}${route.size ? `, pacotes de ${route.size} bytes` : ''}`,
    ...route.hops.map(hop => `${String(hop.hop).padStart(2)}  ${hop.address
      ? `${hop.address}  ${hop.rtts.map(rtt => rtt === null ? '*' : ms(rtt)).join('  ')}`
      : hop.rtts.map(() => '*').join(' ')}`),
  ]
  return <figure className="lesson-figure">
    <Text size="sm" component="figcaption">{caption}, em {formatLocal(route.timestamp * 1000)}:</Text>
    <pre className="lesson-terminal"><code>{lines.join('\n')}</code></pre>
  </figure>
}

// After 5 silent hops in a row, RIPE Atlas gives up and jumps to TTL 255 to end the traceroute (RIPE Atlas mailing list).
const giveUp = 255
const realHops = (route: Route) => route.hops.filter(hop => hop.hop !== giveUp)

export function HopTable({ route, destination }: { route: Route, destination: Destination }) {
  return <div className="lesson-table-wrap">
    <table className="lesson-route">
      <caption>Os saltos da rota, com a rede de cada endereço</caption>
      <thead><tr><th scope="col">Salto</th><th scope="col">Endereço</th><th scope="col">Rede</th><th scope="col">Tempo típico</th></tr></thead>
      <tbody>
        {realHops(route).map(hop => {
          const typical = median(hop.rtts)
          return <tr key={hop.hop} data-silent={hop.network.kind === 'silent'}>
            <td>{hop.hop}</td>
            <td>{hop.address ? <code>{hop.address}</code> : '* * *'}</td>
            <td><NetworkName hop={hop} route={route} destination={destination} /></td>
            <td>{typical === null ? '—' : ms(typical)}</td>
          </tr>
        })}
      </tbody>
    </table>
  </div>
}

const sourceRoles: Record<Source, string> = {
  RIPEstat: 'o RIPEstat diz a qual rede pertence cada endereço',
  PeeringDB: 'o PeeringDB diz quais endereços são pontos de troca e onde eles ficam',
}

export function MissingSources({ missing, onRetry }: { missing: Source[], onRetry: () => void }) {
  return <Alert color="yellow" mt="md" maw={720} title={`Não foi possível consultar ${list(missing.map(source => `o ${source}`))} agora`}>
    A rota e os tempos vieram do RIPE Atlas e estão certos. O que pode faltar são nomes e lugares: {list(missing.map(source => sourceRoles[source]))}.
    Por isso alguns saltos podem aparecer como rede não identificada.
    <div><Button variant="default" size="xs" mt="sm" onClick={onRetry}>Tentar de novo</Button></div>
  </Alert>
}

function biggestJump(hops: Hop[]) {
  const answered = hops.map(hop => ({ hop: hop.hop, time: median(hop.rtts) })).filter((item): item is { hop: number, time: number } => item.time !== null)
  let jump: { from: typeof answered[number], to: typeof answered[number] } | null = null
  for (let index = 1; index < answered.length; index++) {
    const increase = answered[index].time - answered[index - 1].time
    if (!jump || increase > jump.to.time - jump.from.time) jump = { from: answered[index - 1], to: answered[index] }
  }
  return jump && jump.to.time - jump.from.time >= 20 ? jump : null
}

type StageKind = 'home' | 'provider' | 'exchange' | 'transit' | 'destination' | 'lost'

interface Stage {
  key: string
  kind: StageKind
  hops: Hop[]
}

// Consecutive hops of the same network form one stage. A silent hop joins the next stage that answers.
function stagesOf(route: Route) {
  const provider = route.hops.find(hop => hop.network.kind === 'network' && hop.address !== route.destination)?.network
  const lastAnswer = Math.max(0, ...route.hops.filter(hop => hop.address).map(hop => hop.hop))
  const stages: Stage[] = []
  let pending: Hop[] = []
  for (const hop of realHops(route)) {
    const network = hop.network
    let kind: StageKind
    let key: string
    if (hop.address === route.destination) [kind, key] = ['destination', 'destination']
    else if (hop.hop > lastAnswer) [kind, key] = ['lost', 'lost']
    else if (network.kind === 'silent') {
      pending.push(hop)
      continue
    } else if (network.kind === 'private') [kind, key] = ['home', 'home']
    else if (network.kind === 'network' && provider?.kind === 'network' && network.asn === provider.asn) [kind, key] = ['provider', 'provider']
    else if (network.kind === 'exchange') [kind, key] = ['exchange', `exchange-${hop.hop}`]
    else [kind, key] = ['transit', network.kind === 'network' ? `network-${network.asn}` : network.kind]
    const last = stages[stages.length - 1]
    if (last?.key === key) last.hops.push(...pending, hop)
    else stages.push({ key, kind, hops: [...pending, hop] })
    pending = []
  }
  if (!route.hops.some(hop => hop.address === route.destination) && stages[stages.length - 1]?.kind !== 'lost') stages.push({ key: 'lost', kind: 'lost', hops: [] })
  return stages
}

const stageTitles: Record<StageKind, string> = {
  home: 'Na sua casa',
  provider: 'No seu provedor',
  exchange: 'Ponto de troca',
  transit: 'Em outra rede',
  destination: 'No destino',
  lost: 'Sem resposta do destino',
}

function hopRange(hops: Hop[]) {
  if (!hops.length) return ''
  const first = hops[0].hop
  const last = hops[hops.length - 1].hop
  return first === last ? `salto ${first}` : `saltos ${first} a ${last}`
}

function silentNote(stage: Stage) {
  const silent = stage.hops.filter(hop => hop.network.kind === 'silent').map(hop => hop.hop)
  if (!silent.length || stage.kind === 'lost') return ''
  return silent.length > 1 ? ` Os saltos ${list(silent)} não responderam, mas os pacotes passaram.` : ` O salto ${silent[0]} não respondeu, mas os pacotes passaram.`
}

function StageText({ stage, route, destination, jump, firstExchange, nearCopy }: {
  stage: Stage, route: Route, destination: Destination, jump: ReturnType<typeof biggestJump>, firstExchange: boolean, nearCopy: string | null
}) {
  const head = stage.hops.find(hop => hop.address)
  const network = head?.network
  // 100.64.0.0/10 is the shared address space of RFC 6598, used inside providers (for example, for CGNAT).
  const shared = stage.hops.some(hop => {
    const [a, b] = (hop.address ?? '').split('.').map(Number)
    return a === 100 && b >= 64 && b <= 127
  })
  const rise = jump && stage.hops.some(hop => hop.hop === jump.to.hop)
    ? <> O tempo sobe de {ms(jump.from.time)} para {ms(jump.to.time)}: é onde o caminho fica mais longo.</> : null
  switch (stage.kind) {
    case 'home': return <>O roteador da sua casa, <code>{head?.address}</code>, com endereço privado como a probe.{silentNote(stage)}</>
    case 'provider': return <>A rede {network?.kind === 'network' ? <strong>{short(network.holder) ?? `AS${network.asn}`}</strong> : 'do seu provedor'}, que leva o tráfego para fora da sua casa.{silentNote(stage)}{rise}</>
    case 'exchange': return network?.kind === 'exchange' ? <>
      <strong>{network.name}</strong>{network.city ? `, em ${place(network)}` : ''}.{network.member ? <> Ali o tráfego passa para a rede <strong>{short(network.member)}</strong>.</> : ''}
      {firstExchange ? ' Pontos de troca são lugares onde as redes se conectam para trocar tráfego.' : ''}
      {network.name.startsWith('IX.br') ? ' O IX.br é um projeto do Comitê Gestor da Internet no Brasil (CGI.br).' : ''}{silentNote(stage)}{rise}
    </> : null
    case 'transit': return <>
      {network?.kind === 'network' ? <>A rede <strong>{short(network.holder) ?? `AS${network.asn}`}</strong>, que leva o tráfego adiante.</>
        : network?.kind === 'internal' ? <>Um roteador com endereço privado, <code>{head?.address}</code>, usado dentro da rede de algum provedor. Endereços privados não aparecem em nenhum registro, por isso a rede não foi identificada.</>
          : 'Roteadores de uma rede que não foi identificada.'}
      {shared ? <> Endereços entre <code>100.64</code> e <code>100.127</code> são reservados para uso interno dos provedores (RFC 6598), por isso não aparecem em nenhum registro.</> : ''}
      {silentNote(stage)}{rise}
    </>
    case 'destination': {
      const end = stage.hops.find(hop => hop.address === route.destination)
      return <>
        O {called(destination)}, <code>{route.destination}</code>, respondeu em cerca de {ms(median(end?.rtts ?? []) ?? 0)}.{rise}
        {nearCopy ? <> Foi uma cópia perto de <strong>{nearCopy}</strong>: o último ponto de troca é a entrada da rede do próprio {destination.name}. O endereço é o mesmo no mundo todo, e quem responde é a cópia mais próxima pela rede.</> : ''}
      </>
    }
    case 'lost': {
      const lastSeen = Math.max(0, ...route.hops.filter(hop => hop.address).map(hop => hop.hop))
      const gaveUp = route.hops.some(hop => hop.hop === giveUp)
      return <>
        O {called(destination)} não respondeu{destination.root ? ' nesta rodada' : ''}. A rota foi vista até o salto {lastSeen}{stage.hops.length ? ', e os seguintes não responderam' : ''}.
        {gaveUp ? ' Depois de 5 saltos seguidos sem resposta, o RIPE Atlas desiste. Por isso o terminal termina num salto 255, que marca o fim e não é um salto de verdade.' : ''}
        {destination.root ? ' Escolha outro destino ou volte daqui a 30 minutos.' : ' Muitos servidores não respondem aos pacotes do traceroute, e isso não quer dizer que estejam fora do ar. Os saltos que responderam mostram até onde o caminho foi visto.'}
      </>
    }
  }
}

export function Reminders() {
  return <div className="lesson-reminders">
    <div><strong>* * *</strong><Text size="sm">Um roteador que não responde não quer dizer perda. Se os saltos seguintes respondem, os pacotes passaram por ele.</Text></div>
    <div><strong>Tempo que sobe muito</strong><Text size="sm">Um aumento grande entre dois saltos mostra onde o caminho fica mais longo, por exemplo ao sair do país.</Text></div>
  </div>
}

export function RouteStages({ route, destination }: { route: Route, destination: Destination }) {
  const stages = stagesOf(route)
  const jump = biggestJump(route.hops)
  const exchanges = route.hops.filter(hop => hop.network.kind === 'exchange')
  const last = exchanges[exchanges.length - 1]?.network
  const end = route.hops.find(hop => hop.address === route.destination)
  // An anycast root enters its own network at the last exchange, so the copy that answered is near that city. Other destinations may not be anycast.
  const nearCopy = destination.root && end?.network.kind === 'network' && last?.kind === 'exchange' && last.city && last.memberAsn === end.network.asn ? last.city : null
  const firstExchange = stages.find(stage => stage.kind === 'exchange')?.key
  return <>
    <ol className="route-stages" aria-label={`A rota até ${destination.root ? 'o ' : ''}${destination.name}, em etapas`}>
      {stages.map(stage => {
        const answered = [...stage.hops].reverse().find(hop => median(hop.rtts) !== null)
        const time = answered ? median(answered.rtts) : null
        return <li key={stage.key} data-kind={stage.kind}>
          <div className="route-stage-head">
            <strong>{stageTitles[stage.kind]}</strong>
            <Text span size="xs" c="dimmed">{hopRange(stage.hops)}{time !== null ? `${stage.hops.length ? ', ' : ''}${ms(time)}` : ''}</Text>
          </div>
          <Text size="sm"><StageText stage={stage} route={route} destination={destination} jump={jump} firstExchange={stage.key === firstExchange} nearCopy={nearCopy} /></Text>
        </li>
      })}
    </ol>
    <Reminders />
  </>
}
