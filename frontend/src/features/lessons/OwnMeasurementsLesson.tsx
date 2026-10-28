import { Accordion, Anchor, Button, List, Text } from '@mantine/core'
import Loading from '../../lib/Loading'
import SystemError from '../../lib/SystemError'
import LessonParts from './LessonParts'
import { useOwnMeasurements, type OwnMeasurements } from './useOwnMeasurements'
import { roots } from './useTraceroute'
import './lessons.css'

const count = (value: number) => value.toLocaleString('pt-BR')
const countries = new Intl.DisplayNames(['pt-BR'], { type: 'region' })

const typeNames: Record<string, string> = {
  ping: 'Ping', traceroute: 'Traceroute', dns: 'DNS', http: 'HTTP', sslcert: 'Certificado (TLS)', ntp: 'Hora (NTP)',
}

function span(seconds: number) {
  const [value, one, many] = seconds < 3600 ? [seconds / 60, 'minuto', 'minutos'] : seconds < 86400 ? [seconds / 3600, 'hora', 'horas'] : [seconds / 86400, 'dia', 'dias']
  const rounded = Math.round(value)
  return `${rounded} ${rounded === 1 ? one : many}`
}

const every = (seconds: number) => `a cada ${span(seconds)}`

function list(items: string[]) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}` : items[0] ?? ''
}

function byType(rows: OwnMeasurements['builtIn']) {
  const groups = new Map<string, OwnMeasurements['builtIn']>()
  for (const row of rows) groups.set(row.type, [...(groups.get(row.type) ?? []), row])
  return [...groups].sort((a, b) => b[1].length - a[1].length)
}

function BuiltInTable({ rows }: { rows: OwnMeasurements['builtIn'] }) {
  return <div className="lesson-table-wrap">
    <table className="lesson-route">
      <caption>As medições do RIPE Atlas, por tipo</caption>
      <thead><tr><th scope="col">Tipo</th><th scope="col">Medições</th><th scope="col">Destinos</th><th scope="col">Frequência</th></tr></thead>
      <tbody>
        {byType(rows).map(([type, group]) => {
          const targets = new Set(group.map(row => row.target))
          const rootTargets = [...targets].filter(target => target?.endsWith('root-servers.net')).length
          const intervals = group.map(row => row.interval).filter((value): value is number => Boolean(value))
          const fastest = Math.min(...intervals)
          const slowest = Math.max(...intervals)
          return <tr key={type}>
            <td>{typeNames[type] ?? type}</td>
            <td>{count(group.length)}</td>
            <td>{rootTargets === targets.size ? `${rootTargets} servidores raiz` : rootTargets ? `${rootTargets} servidores raiz e outros` : list([...targets].filter(Boolean) as string[])}</td>
            <td>{intervals.length ? fastest === slowest ? every(fastest) : `entre ${span(fastest)} e ${span(slowest)}` : 'quando acontece'}</td>
          </tr>
        })}
      </tbody>
    </table>
  </div>
}

function YourData({ probeId, data, error, retry }: ReturnType<typeof useOwnMeasurements>) {
  if (probeId === null) return <>
    <Text size="sm">Acompanhe uma probe para ver o que ela mede agora.</Text>
    <Button component="a" href="#/acompanhar" variant="light" size="sm" mt="sm">Ir para Acompanhar</Button>
  </>
  if (error) return <SystemError title="Não foi possível ler as medições da sua probe" mt="0">
    {error}
    <div><Button variant="default" size="xs" mt="sm" onClick={retry}>Tentar de novo</Button></div>
  </SystemError>
  if (!data) return <Loading>Lendo as medições da sua probe…</Loading>
  const total = data.builtIn.length + data.wellKnownCount + data.anchoring + data.others.length
  const brazil = data.anchors.filter(anchor => anchor.country === 'BR').length
  const othersByType = byType(data.others)
  return <>
    <Text size="sm">Neste momento, a <strong>probe {probeId}</strong> faz parte de <strong>{count(total)} medições</strong> em andamento, e nenhuma delas foi criada por você.</Text>
    <dl className="lesson-numbers">
      <div>
        <dt>Do RIPE Atlas</dt>
        <dd className="lesson-number-value">{count(data.builtIn.length)}</dd>
        <dd>As built-in, iguais em toda probe {data.hasIpv6 ? 'com IPv4 e IPv6' : 'com IPv4'}.</dd>
      </div>
      <div>
        <dt>Serviços populares</dt>
        <dd className="lesson-number-value">{count(data.wellKnownCount)}</dd>
        <dd>As well-known, para {count(data.wellKnown.length)} {data.wellKnown.length === 1 ? 'serviço popular' : 'serviços populares'}.</dd>
      </div>
      <div>
        <dt>Anchors</dt>
        <dd className="lesson-number-value">{count(data.anchoring)}</dd>
        <dd>Para {count(data.anchors.length)} {data.anchors.length === 1 ? 'anchor' : 'anchors'}{brazil ? `, ${brazil === data.anchors.length ? data.anchors.length === 1 ? 'no Brasil' : 'todas no Brasil' : `${brazil} no Brasil`}` : ''}.</dd>
      </div>
      <div>
        <dt>De outras pessoas</dt>
        <dd className="lesson-number-value">{count(data.others.length)}</dd>
        <dd>Criadas por usuários do RIPE Atlas e pelo RIPE NCC, que escolheram a sua probe.</dd>
      </div>
    </dl>
    <Accordion variant="separated" multiple mt="lg" maw={820}>
      <Accordion.Item value="built-in">
        <Accordion.Control>Do RIPE Atlas: {count(data.builtIn.length)} medições built-in</Accordion.Control>
        <Accordion.Panel>
          <Text size="sm">Toda probe começa a fazer estas medições assim que liga. Como são as mesmas em todas, dá para comparar a sua probe com qualquer outra.</Text>
          <BuiltInTable rows={data.builtIn} />
        </Accordion.Panel>
      </Accordion.Item>
      <Accordion.Item value="well-known">
        <Accordion.Control>Serviços populares: {count(data.wellKnown.length)} destinos</Accordion.Control>
        <Accordion.Panel>
          <Text size="sm">Ping e traceroute até serviços que muita gente usa, para comparar como cada rede chega até eles.</Text>
          <ul className="lesson-chips">{data.wellKnown.map(target => <li key={target}><code>{target}</code></li>)}</ul>
        </Accordion.Panel>
      </Accordion.Item>
      <Accordion.Item value="anchors">
        <Accordion.Control>Anchors: {count(data.anchors.length)} anchors</Accordion.Control>
        <Accordion.Panel>
          <Text size="sm">Anchors são probes mais fortes, com endereço fixo, que servem de alvo na região delas. Centenas de probes medem cada uma, e a sua está entre elas.</Text>
          <ul className="lesson-networks">
            {data.anchors.map(anchor => <li key={anchor.name}>
              <span><code>{anchor.name.split('.')[0]}</code>{anchor.city ? ` ${anchor.city}${anchor.country ? ` (${countries.of(anchor.country) ?? anchor.country})` : ''}` : ''}</span>
              <span>{list(anchor.types.map(type => typeNames[type] ?? type))}</span>
            </li>)}
          </ul>
        </Accordion.Panel>
      </Accordion.Item>
      <Accordion.Item value="others">
        <Accordion.Control>De outras pessoas: {count(data.others.length)} medições</Accordion.Control>
        <Accordion.Panel>
          <Text size="sm">
            Quem cria uma medição escolhe as probes por país, rede ou região, e a sua entrou na escolha. Por tipo: {list(othersByType.map(([type, group]) => `${count(group.length)} de ${typeNames[type] ?? type}`))}.
          </Text>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  </>
}

function Reading({ data }: { data: OwnMeasurements }) {
  const intervals = new Map<number, number>()
  for (const row of data.others) if (row.interval) intervals.set(row.interval, (intervals.get(row.interval) ?? 0) + 1)
  const common = [...intervals].sort((a, b) => b[1] - a[1])[0]
  const dns = data.others.filter(row => row.type === 'dns').length
  return <dl className="lesson-reading">
    <div>
      <dt>{count(data.others.length)} de outras pessoas</dt>
      <dd>Quanto mais a sua probe é usada, mais créditos você ganha. O RIPE Atlas paga 1 crédito por resultado produzido, e a documentação diz que isso beneficia principalmente quem hospeda probes muito usadas. Veja o saldo em <Anchor href="#/configuracoes">Configurações</Anchor>.</dd>
    </div>
    {dns > 0 && <div>
      <dt>{count(dns)} de DNS</dt>
      <dd>São consultas a nomes e a servidores de DNS feitas a partir da sua rede, o tipo mais comum de medição de outras pessoas.{common ? ` A frequência mais comum é ${every(common[0])}.` : ''} Mesmo com centenas de medições, a probe inteira usa pouca banda, cerca de 4 kbit/s segundo a FAQ do RIPE Atlas.</dd>
    </div>}
    {data.tagging > 0 && <div>
      <dt>{count(data.tagging)} do sistema de etiquetas</dt>
      <dd>O RIPE NCC usa estas para descobrir o que a sua rede faz e marcar a probe com etiquetas, como a <code>system-ipv4-rfc1918</code> da <Anchor href="#/aprender/ip">lição de IP</Anchor>.</dd>
    </div>}
    <div>
      <dt>{count(data.builtIn.length)} do RIPE Atlas</dt>
      <dd>As lições de <Anchor href="#/aprender/ping">ping</Anchor> e de <Anchor href="#/aprender/traceroute">traceroute</Anchor> usam estas medições. Como toda probe faz as mesmas, os seus números podem ser comparados com os de qualquer outra.</dd>
    </div>
  </dl>
}

export default function OwnMeasurementsLesson() {
  const state = useOwnMeasurements()
  return <LessonParts parts={[
    {
      title: 'O que é',
      content: <>
        <Text size="sm">
          A sua probe não espera você pedir nada. Assim que liga, ela entra num trabalho coletivo e passa a medir a Internet para muita gente ao mesmo tempo.
        </Text>
        <Text size="sm" mt="sm">
          As medições vêm de quatro lugares. O próprio RIPE Atlas define as built-in, que toda probe faz. As well-known medem serviços populares. As anchors, probes mais fortes que servem de alvo, são medidas por centenas de probes. E qualquer pessoa com créditos pode criar uma medição e escolher a sua probe para participar.
        </Text>
      </>,
    },
    {
      title: 'Os servidores raiz do DNS',
      content: <>
        <Text size="sm">
          Para abrir um site, o seu computador precisa trocar o nome, como <code>ripe.net</code>, por um endereço IP. Quem faz isso é o DNS, em etapas. A primeira é perguntar a um servidor raiz: ele não sabe o endereço final, mas sabe quem cuida de <code>.br</code>, <code>.com</code> e dos outros finais de nome.
        </Text>
        <Text size="sm" mt="sm">
          São 13 servidores raiz, com nomes de A a M, mantidos por 12 organizações. Cada um tem cópias espalhadas pelo mundo, mais de 2 mil no total, e todas as cópias de um servidor usam o mesmo endereço. Quem responde é a cópia mais próxima pela rede, como a <Anchor href="#/aprender/traceroute">lição de traceroute</Anchor> mostra.
        </Text>
        <ul className="root-list" aria-label="Os 13 servidores raiz e quem mantém cada um">
          {roots.map(root => <li key={root.name}><strong>{root.name}</strong><span>{root.operator}</span></li>)}
        </ul>
        <Text size="sm" mt="sm">
          Como toda a Internet depende deles, a sua probe mede os servidores raiz o tempo todo. O K-root, das lições de ping e de traceroute, é mantido pelo RIPE NCC, o mesmo que mantém o RIPE Atlas.
        </Text>
      </>,
    },
    { title: 'O seu dado', content: <YourData {...state} /> },
    {
      title: 'Como ler',
      content: state.data ? <Reading data={state.data} />
        : state.probeId !== null && !state.error ? <Loading>Esperando os dados da sua probe…</Loading>
        : <Text size="sm">Com uma probe acompanhada, aqui aparece o que os números dela querem dizer.</Text>,
    },
    {
      title: 'O que não mostra',
      content: <ul className="lesson-limits">
        <li><Text size="sm">Os resultados de cada medição. Eles aparecem nas outras lições e em Minha probe.</Text></li>
        <li><Text size="sm">Quem criou as medições de outras pessoas. O RIPE Atlas não mostra isso aqui.</Text></li>
        <li><Text size="sm">A lista de agora. Ela muda todo dia, e as medições que rodam uma vez só e já terminaram não aparecem.</Text></li>
      </ul>,
    },
    {
      title: 'Para ir mais fundo',
      content: <List size="sm" spacing={4}>
        <List.Item><Anchor href="https://atlas.ripe.net/docs/getting-started/built-in-measurements/" target="_blank" rel="noreferrer">Medições built-in</Anchor> e <Anchor href="https://atlas.ripe.net/docs/getting-started/well-known-measurements/" target="_blank" rel="noreferrer">well-known</Anchor>, na documentação do RIPE Atlas (em inglês)</List.Item>
        <List.Item><Anchor href="https://atlas.ripe.net/docs/howtos/anchors/" target="_blank" rel="noreferrer">O que são anchors</Anchor> (em inglês)</List.Item>
        <List.Item><Anchor href="https://root-servers.org/" target="_blank" rel="noreferrer">root-servers.org</Anchor>, onde fica cada cópia dos servidores raiz (em inglês)</List.Item>
      </List>,
    },
  ]} />
}
