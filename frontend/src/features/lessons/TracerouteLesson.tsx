import { Anchor, Button, List, Text } from '@mantine/core'
import Loading from '../../lib/Loading'
import SystemError from '../../lib/SystemError'
import { formatLocal } from '../../lib/time'
import { formatMetric } from '../ping-history/chart'
import LessonParts from './LessonParts'
import { median, useTraceroute, type Hop, type Route } from './useTraceroute'
import './lessons.css'

const ms = (value: number) => `${formatMetric(value)} ms`

function list(numbers: number[]) {
  return numbers.length > 1 ? `${numbers.slice(0, -1).join(', ')} e ${numbers[numbers.length - 1]}` : String(numbers[0])
}

// Long registry names often end with an acronym, like "… Coordination Centre (RIPE NCC)".
function short(holder: string | null) {
  return holder?.match(/\(([^)]+)\)\s*$/)?.[1] ?? holder
}

function NetworkName({ hop, destination }: { hop: Hop, destination: string }) {
  const network = hop.network
  if (hop.address === destination) return <><strong>K-root, o destino</strong>{network.kind === 'network' && <> <code>AS{network.asn}</code></>}</>
  switch (network.kind) {
    case 'private': return <>Sua rede (endereço privado)</>
    case 'network': return <>{short(network.holder) ?? 'Rede'} <code>AS{network.asn}</code></>
    case 'exchange': return <><strong>{network.name}</strong><br /><Text span size="xs">ponto de troca{network.member ? `, entrada da ${short(network.member)}` : ''}</Text></>
    case 'unknown': return <>Rede não identificada</>
    case 'silent': return <Text span size="sm" c="dimmed">não respondeu</Text>
  }
}

function Terminal({ route }: { route: Route }) {
  const lines = [
    `traceroute ${route.destination} (K-root), ${route.protocol}${route.size ? `, pacotes de ${route.size} bytes` : ''}`,
    ...route.hops.map(hop => `${String(hop.hop).padStart(2)}  ${hop.address
      ? `${hop.address}  ${hop.rtts.map(rtt => rtt === null ? '*' : ms(rtt)).join('  ')}`
      : hop.rtts.map(() => '*').join(' ')}`),
  ]
  return <figure className="lesson-figure">
    <Text size="sm" component="figcaption">Última rota da sua probe até o K-root, em {formatLocal(route.timestamp * 1000)}:</Text>
    <pre className="lesson-terminal"><code>{lines.join('\n')}</code></pre>
  </figure>
}

function HopTable({ route }: { route: Route }) {
  return <div className="lesson-table-wrap">
    <table className="lesson-route">
      <caption>Os saltos da rota, com a rede de cada endereço</caption>
      <thead><tr><th scope="col">Salto</th><th scope="col">Endereço</th><th scope="col">Rede</th><th scope="col">Tempo típico</th></tr></thead>
      <tbody>
        {route.hops.map(hop => {
          const typical = median(hop.rtts)
          return <tr key={hop.hop} data-silent={hop.network.kind === 'silent'}>
            <td>{hop.hop}</td>
            <td>{hop.address ? <code>{hop.address}</code> : '* * *'}</td>
            <td><NetworkName hop={hop} destination={route.destination} /></td>
            <td>{typical === null ? '—' : ms(typical)}</td>
          </tr>
        })}
      </tbody>
    </table>
  </div>
}

function YourData({ probeId, route, loaded, error }: ReturnType<typeof useTraceroute>) {
  if (probeId === null) return <>
    <Text size="sm">Acompanhe uma probe para ver a rota dela aqui.</Text>
    <Button component="a" href="#/acompanhar" variant="light" size="sm" mt="sm">Ir para Acompanhar</Button>
  </>
  if (error) return <SystemError title="Não foi possível ler a rota da sua probe" mt="0">{error}</SystemError>
  if (!loaded) return <Loading>Lendo a rota da sua probe…</Loading>
  if (!route) return <Text size="sm">O RIPE Atlas ainda não tem uma rota desta probe. A medição roda a cada 30 minutos.</Text>
  return <>
    <Terminal route={route} />
    <HopTable route={route} />
  </>
}

function biggestJump(hops: Hop[]) {
  const answered = hops.map(hop => ({ hop: hop.hop, time: median(hop.rtts) })).filter((item): item is { hop: number, time: number } => item.time !== null)
  let jump: { from: typeof answered[number], to: typeof answered[number] } | null = null
  for (let index = 1; index < answered.length; index++) {
    const increase = answered[index].time - answered[index - 1].time
    if (!jump || increase > jump.to.time - jump.from.time) jump = { from: answered[index - 1], to: answered[index] }
  }
  return jump
}

function Reading({ route }: { route: Route | null }) {
  if (!route) return <ul className="lesson-notes">
    <li><Text size="sm"><strong>O salto 1</strong> costuma ser o roteador da sua casa, com um endereço privado como <code>192.168.1.1</code>.</Text></li>
    <li><Text size="sm"><strong>* * *</strong> quer dizer que um roteador não respondeu. Se os saltos seguintes respondem, os pacotes passaram por ele.</Text></li>
    <li><Text size="sm"><strong>Um aumento grande de tempo</strong> entre dois saltos mostra onde o caminho fica mais longo, por exemplo quando ele sai do país.</Text></li>
  </ul>
  const first = route.hops[0]
  const provider = route.hops.find(hop => hop.network.kind === 'network')
  const providerHops = provider?.network.kind === 'network' ? route.hops.filter(hop => hop.network.kind === 'network' && hop.network.asn === (provider.network as { asn: number }).asn).map(hop => hop.hop) : []
  const silent = route.hops.filter(hop => hop.network.kind === 'silent').map(hop => hop.hop)
  const lastAnswer = Math.max(0, ...route.hops.filter(hop => hop.address).map(hop => hop.hop))
  const exchanges = route.hops.filter(hop => hop.network.kind === 'exchange')
  const jump = biggestJump(route.hops)
  const end = route.hops.find(hop => hop.address === route.destination)
  return <ul className="lesson-notes">
    {first?.network.kind === 'private' && <li>
      <Text size="sm"><code>{first.address}</code>, no salto 1, é o roteador da sua casa. Ele tem endereço privado, como a probe.</Text>
    </li>}
    {provider?.network.kind === 'network' && <li>
      <Text size="sm"><strong>{providerHops.length > 1 ? `Os saltos ${list(providerHops)}` : `O salto ${providerHops[0]}`}</strong> {providerHops.length > 1 ? 'são' : 'é'} da rede do seu provedor, {provider.network.holder ?? 'o seu provedor'} <code>AS{provider.network.asn}</code>.</Text>
    </li>}
    {silent.length > 0 && <li>
      <Text size="sm"><strong>* * *</strong> {silent.length > 1 ? `nos saltos ${list(silent)}` : `no salto ${silent[0]}`} quer dizer que {silent.length > 1 ? 'esses roteadores não responderam' : 'esse roteador não respondeu'}.
        {silent.some(hop => hop < lastAnswer) ? ' Não é perda: os pacotes passaram, tanto que os saltos seguintes responderam.' : ''}</Text>
    </li>}
    {exchanges.map((hop, index) => hop.network.kind === 'exchange' && <li key={hop.hop}>
      <Text size="sm"><strong>{hop.network.name}</strong>, no salto {hop.hop}, {index === 0
        ? 'é um ponto de troca de tráfego, um lugar onde várias redes se conectam para entregar tráfego umas às outras.'
        : 'é outro ponto de troca de tráfego.'}
        {hop.network.member ? ` Ali o tráfego passa para a rede ${short(hop.network.member)}.` : ''}
        {hop.network.name.startsWith('IX.br') ? ' O IX.br é um projeto do Comitê Gestor da Internet no Brasil (CGI.br).' : ''}</Text>
    </li>)}
    {jump && jump.to.time - jump.from.time >= 20 && <li>
      <Text size="sm"><strong>De {ms(jump.from.time)} para {ms(jump.to.time)}</strong> entre os saltos {jump.from.hop} e {jump.to.hop}. É o maior aumento de tempo da rota, onde o caminho fica mais longo.</Text>
    </li>}
    {end ? <li>
      <Text size="sm"><strong>O salto {end.hop}</strong> é o próprio K-root, <code>{route.destination}</code>, que respondeu em cerca de {ms(median(end.rtts) ?? 0)}.</Text>
    </li> : <li>
      <Text size="sm"><strong>O K-root não respondeu</strong> nesta rodada. A rota mostra até onde os pacotes chegaram.</Text>
    </li>}
  </ul>
}

export default function TracerouteLesson() {
  const data = useTraceroute()
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
          A sua probe faz isso sozinha a cada 30 minutos até o K-root, numa das medições automáticas do RIPE Atlas.
        </Text>
      </>,
    },
    { title: 'O seu dado', content: <YourData {...data} /> },
    { title: 'Como ler', content: <Reading route={data.route} /> },
    {
      title: 'O que não mostra',
      content: <ul className="lesson-limits">
        <li><Text size="sm">O caminho de volta pode ser outro. O traceroute só mostra a ida.</Text></li>
        <li><Text size="sm">Um roteador no meio pode demorar para responder e mostrar um tempo maior que o do salto seguinte. Isso não quer dizer que o pacote atrasou ali.</Text></li>
        <li><Text size="sm">O nome da rede vem do registro público do endereço, não de onde o roteador fica.</Text></li>
        <li><Text size="sm">É uma rodada só, e o caminho muda. Em outra rede ou em outro dia, quem responde pode ser outro K-root, porque ele tem cópias espalhadas pelo mundo. Compare com o tempo da <Anchor href="#/aprender/ping">lição de ping</Anchor>.</Text></li>
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
