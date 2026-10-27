import { Alert, Anchor, Button, List, NativeSelect, Text } from '@mantine/core'
import { useState } from 'react'
import Loading from '../../lib/Loading'
import SystemError from '../../lib/SystemError'
import { formatLocal } from '../../lib/time'
import { formatMetric } from '../ping-history/chart'
import LessonParts from './LessonParts'
import { median, roots, useTraceroute, type Hop, type HopNetwork, type Root, type Route, type Source } from './useTraceroute'
import './lessons.css'

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

function NetworkName({ hop, route, root }: { hop: Hop, route: Route, root: Root }) {
  const network = hop.network
  if (hop.address === route.destination) return <><strong>{root.name}, o destino</strong>{network.kind === 'network' && <> <code>AS{network.asn}</code></>}</>
  switch (network.kind) {
    case 'private': return <>Sua rede (endereço privado)</>
    case 'network': return <>{short(network.holder) ?? 'Rede'} <code>AS{network.asn}</code></>
    case 'exchange': return <><strong>{network.name}</strong><br /><Text span size="xs">ponto de troca{network.city ? ` em ${place(network)}` : ''}{network.member ? `, entrada da rede ${short(network.member)}` : ''}</Text></>
    case 'unknown': return <>Rede não identificada</>
    case 'silent': return <Text span size="sm" c="dimmed">não respondeu</Text>
  }
}

function Terminal({ route, root }: { route: Route, root: Root }) {
  const lines = [
    `traceroute ${route.destination} (${root.name}), ${route.protocol}${route.size ? `, pacotes de ${route.size} bytes` : ''}`,
    ...route.hops.map(hop => `${String(hop.hop).padStart(2)}  ${hop.address
      ? `${hop.address}  ${hop.rtts.map(rtt => rtt === null ? '*' : ms(rtt)).join('  ')}`
      : hop.rtts.map(() => '*').join(' ')}`),
  ]
  return <figure className="lesson-figure">
    <Text size="sm" component="figcaption">Última rota da sua probe até o {root.name}, em {formatLocal(route.timestamp * 1000)}:</Text>
    <pre className="lesson-terminal"><code>{lines.join('\n')}</code></pre>
  </figure>
}

// After 5 silent hops in a row, RIPE Atlas gives up and jumps to TTL 255 to end the traceroute (RIPE Atlas mailing list).
const giveUp = 255
const realHops = (route: Route) => route.hops.filter(hop => hop.hop !== giveUp)

function HopTable({ route, root }: { route: Route, root: Root }) {
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
            <td><NetworkName hop={hop} route={route} root={root} /></td>
            <td>{typical === null ? '—' : ms(typical)}</td>
          </tr>
        })}
      </tbody>
    </table>
  </div>
}

function RootPicker({ root, onChange }: { root: Root, onChange: (root: Root) => void }) {
  return <div className="lesson-picker">
    <Text size="sm" maw={680}>
      A sua probe mede sozinha os 13 servidores raiz do DNS. Cada um é mantido por uma organização diferente e tem cópias em vários lugares do mundo.
      Troque o destino e compare: a rota passa pelos mesmos pontos de troca? Quantos saltos e quanto tempo leva? A cópia que responde fica no Brasil?
    </Text>
    <NativeSelect label="Destino" mt="sm" maw={340} value={String(root.measurement)}
      onChange={event => onChange(roots.find(item => item.measurement === Number(event.currentTarget.value)) ?? root)}
      data={roots.map(item => ({ value: String(item.measurement), label: `${item.name}, mantido por ${item.operator}` }))} />
  </div>
}

const sourceRoles: Record<Source, string> = {
  RIPEstat: 'o RIPEstat diz a qual rede pertence cada endereço',
  PeeringDB: 'o PeeringDB diz quais endereços são pontos de troca e onde eles ficam',
}

function MissingSources({ missing, onRetry }: { missing: Source[], onRetry: () => void }) {
  return <Alert color="yellow" mt="md" maw={720} title={`Não foi possível consultar ${list(missing.map(source => `o ${source}`))} agora`}>
    A rota e os tempos vieram do RIPE Atlas e estão certos. O que pode faltar são nomes e lugares: {list(missing.map(source => sourceRoles[source]))}.
    Por isso alguns saltos podem aparecer como rede não identificada.
    <div><Button variant="default" size="xs" mt="sm" onClick={onRetry}>Tentar de novo</Button></div>
  </Alert>
}

function YourData({ data, root, onRoot }: { data: ReturnType<typeof useTraceroute>, root: Root, onRoot: (root: Root) => void }) {
  if (data.probeId === null) return <>
    <Text size="sm">Acompanhe uma probe para ver a rota dela aqui.</Text>
    <Button component="a" href="#/acompanhar" variant="light" size="sm" mt="sm">Ir para Acompanhar</Button>
  </>
  return <>
    <RootPicker root={root} onChange={onRoot} />
    {data.error && <SystemError title="Não foi possível ler a rota da sua probe">
      {data.error}
      <div><Button variant="default" size="xs" mt="sm" onClick={data.retry}>Tentar de novo</Button></div>
    </SystemError>}
    {!data.error && !data.loaded && <Loading mt="md">Lendo a rota da sua probe…</Loading>}
    {data.loaded && !data.route && <Text size="sm" mt="md">O RIPE Atlas ainda não tem uma rota desta probe até o {root.name}. A medição roda a cada 30 minutos.</Text>}
    {data.route && <>
      {data.route.missing.length > 0 && <MissingSources missing={data.route.missing} onRetry={data.retry} />}
      <Terminal route={data.route} root={root} />
      <HopTable route={data.route} root={root} />
    </>}
  </>
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
    else [kind, key] = ['transit', network.kind === 'network' ? `network-${network.asn}` : 'unknown']
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

function StageText({ stage, route, root, jump, firstExchange, nearCopy }: {
  stage: Stage, route: Route, root: Root, jump: ReturnType<typeof biggestJump>, firstExchange: boolean, nearCopy: string | null
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
      {network?.kind === 'network' ? <>A rede <strong>{short(network.holder) ?? `AS${network.asn}`}</strong>, que leva o tráfego adiante.</> : 'Roteadores de uma rede que não foi identificada.'}
      {shared ? <> Endereços entre <code>100.64</code> e <code>100.127</code> são reservados para uso interno dos provedores (RFC 6598), por isso não aparecem em nenhum registro.</> : ''}
      {silentNote(stage)}{rise}
    </>
    case 'destination': {
      const end = stage.hops.find(hop => hop.address === route.destination)
      return <>
        O {root.name}, <code>{route.destination}</code>, respondeu em cerca de {ms(median(end?.rtts ?? []) ?? 0)}.{rise}
        {nearCopy ? <> Foi uma cópia perto de <strong>{nearCopy}</strong>: o último ponto de troca é a entrada da rede do próprio {root.name}. O endereço é o mesmo no mundo todo, e quem responde é a cópia mais próxima pela rede.</> : ''}
      </>
    }
    case 'lost': {
      const lastSeen = Math.max(0, ...route.hops.filter(hop => hop.address).map(hop => hop.hop))
      const gaveUp = route.hops.some(hop => hop.hop === giveUp)
      return <>
        O {root.name} não respondeu nesta rodada. A rota foi vista até o salto {lastSeen}{stage.hops.length ? ', e os seguintes não responderam' : ''}.
        {gaveUp ? ' Depois de 5 saltos seguidos sem resposta, o RIPE Atlas desiste. Por isso o terminal termina num salto 255, que marca o fim e não é um salto de verdade.' : ''}
        {' '}Escolha outro destino ou volte daqui a 30 minutos.
      </>
    }
  }
}

function Reminders() {
  return <div className="lesson-reminders">
    <div><strong>* * *</strong><Text size="sm">Um roteador que não responde não quer dizer perda. Se os saltos seguintes respondem, os pacotes passaram por ele.</Text></div>
    <div><strong>Tempo que sobe muito</strong><Text size="sm">Um aumento grande entre dois saltos mostra onde o caminho fica mais longo, por exemplo ao sair do país.</Text></div>
  </div>
}

function Reading({ data, root }: { data: ReturnType<typeof useTraceroute>, root: Root }) {
  const route = data.route
  if (data.probeId === null || data.error) return <>
    <Text size="sm">Com uma probe acompanhada, aqui aparece a rota dela contada em etapas: casa, provedor, pontos de troca e destino.</Text>
    <Reminders />
  </>
  if (!route) return data.loaded ? <Reminders /> : <Loading>Esperando a rota da sua probe…</Loading>
  const stages = stagesOf(route)
  const jump = biggestJump(route.hops)
  const exchanges = route.hops.filter(hop => hop.network.kind === 'exchange')
  const last = exchanges[exchanges.length - 1]?.network
  const end = route.hops.find(hop => hop.address === route.destination)
  // The destination network enters at the last exchange, so the copy that answered is near that city.
  const nearCopy = end?.network.kind === 'network' && last?.kind === 'exchange' && last.city && last.memberAsn === end.network.asn ? last.city : null
  const firstExchange = stages.find(stage => stage.kind === 'exchange')?.key
  return <>
    <ol className="route-stages" aria-label={`A rota até o ${root.name}, em etapas`}>
      {stages.map(stage => {
        const answered = [...stage.hops].reverse().find(hop => median(hop.rtts) !== null)
        const time = answered ? median(answered.rtts) : null
        return <li key={stage.key} data-kind={stage.kind}>
          <div className="route-stage-head">
            <strong>{stageTitles[stage.kind]}</strong>
            <Text span size="xs" c="dimmed">{hopRange(stage.hops)}{time !== null ? `${stage.hops.length ? ', ' : ''}${ms(time)}` : ''}</Text>
          </div>
          <Text size="sm"><StageText stage={stage} route={route} root={root} jump={jump} firstExchange={stage.key === firstExchange} nearCopy={nearCopy} /></Text>
        </li>
      })}
    </ol>
    <Reminders />
  </>
}

const kRoot = roots.find(root => root.name === 'K-root')!

export default function TracerouteLesson() {
  const [root, setRoot] = useState<Root>(kRoot)
  const data = useTraceroute(root.measurement)
  return <LessonParts parts={[
    {
      title: 'O que é',
      content: <>
        <Text size="sm">
          O traceroute descobre por quais roteadores um pacote passa até chegar ao destino. Cada pacote leva um prazo de validade, o TTL, que diminui 1 em cada roteador. Quando chega a zero, o roteador descarta o pacote e avisa quem mandou, e esse aviso revela o endereço dele.
        </Text>
        <Text size="sm" mt="sm">
          Então a probe manda pacotes com prazo 1, depois 2, depois 3, e assim por diante. O primeiro revela o roteador da sua casa, o segundo o seguinte, até o destino responder. Para cada salto ela manda 3 pacotes e anota o tempo de ida e volta de cada um, como no <Anchor href="#/aprender/ping">ping</Anchor>.
        </Text>
        <Text size="sm" mt="sm">
          A sua probe faz isso sozinha a cada 30 minutos até os 13 servidores raiz do DNS, numa das medições automáticas do RIPE Atlas. Em "O seu dado", você escolhe qual quer ver.
        </Text>
      </>,
    },
    { title: 'O seu dado', content: <YourData data={data} root={root} onRoot={setRoot} /> },
    { title: 'Como ler', content: <Reading data={data} root={root} /> },
    {
      title: 'O que não mostra',
      content: <ul className="lesson-limits">
        <li><Text size="sm">O caminho de volta pode ser outro. O traceroute só mostra a ida.</Text></li>
        <li><Text size="sm">Um roteador no meio pode demorar para responder e mostrar um tempo maior que o do salto seguinte. Isso não quer dizer que o pacote atrasou ali.</Text></li>
        <li><Text size="sm">O nome da rede vem do registro público do endereço, não de onde o roteador fica.</Text></li>
        <li><Text size="sm">É uma rodada só, e o caminho muda. Em outra rede ou em outro dia, quem responde pode ser outra cópia do mesmo servidor, porque os servidores raiz têm cópias espalhadas pelo mundo. Compare com o tempo do K-root na <Anchor href="#/aprender/ping">lição de ping</Anchor>.</Text></li>
      </ul>,
    },
    {
      title: 'Para ir mais fundo',
      content: <List size="sm" spacing={4}>
        <List.Item><Anchor href="https://academy.ripe.net/mod/page/view.php?id=937" target="_blank" rel="noreferrer">RIPE NCC Academy: Internet Measurements</Anchor>, módulo sobre traceroute (em inglês, gratuito)</List.Item>
        <List.Item><Anchor href="https://ix.br/" target="_blank" rel="noreferrer">IX.br</Anchor>, os pontos de troca de tráfego do Brasil (em português)</List.Item>
        <List.Item><Anchor href="https://www.peeringdb.com/" target="_blank" rel="noreferrer">PeeringDB</Anchor>, onde as redes registram em que pontos de troca estão (em inglês)</List.Item>
        <List.Item><Anchor href="https://www.rfc-editor.org/rfc/rfc792" target="_blank" rel="noreferrer">RFC 792</Anchor>, a mensagem de aviso que o roteador manda (em inglês)</List.Item>
      </List>,
    },
  ]} />
}
