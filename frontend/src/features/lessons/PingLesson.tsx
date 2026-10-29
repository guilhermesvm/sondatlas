import { Anchor, Button, List, Paper, Text } from '@mantine/core'
import Loading from '../../lib/Loading'
import SystemError from '../../lib/SystemError'
import { formatLocal } from '../../lib/time'
import { formatMetric } from '../ping-history/chart'
import MetricChart from '../ping-history/MetricChart'
import LessonParts from './LessonParts'
import { usePingDay, type LatestPing, type TargetDay } from './usePingDay'
import './lessons.css'

const count = (value: number) => value.toLocaleString('pt-BR')
const ms = (value: number) => `${formatMetric(value)} ms`

function names(days: TargetDay[]) {
  const list = days.map(day => day.name)
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}` : list[0]
}

function Terminal({ round }: { round: LatestPing }) {
  const address = round.dst_addr ?? round.dst_name
  const lost = round.sent - round.rcvd
  const host = round.dst_name !== address ? `${round.dst_name} (${address})` : `${address} (${round.target})`
  const lines = [
    `ping ${host}${round.size ? `, pacotes de ${round.size} bytes` : ''}`,
    ...round.result.map(packet => packet.rtt === undefined ? 'sem resposta (pacote perdido)' : `resposta de ${address}: tempo=${ms(packet.rtt)}`),
    '',
    `${round.sent} enviados, ${round.rcvd} recebidos, ${Math.round(lost / round.sent * 100)}% de perda`,
    round.rcvd > 0 ? `mínimo ${ms(round.min)}, média ${ms(round.avg)}, máximo ${ms(round.max)}${round.ttl ? `, TTL ${round.ttl}` : ''}` : '',
  ]
  return <figure className="lesson-figure">
    <Text size="sm" component="figcaption">Última rodada da sua probe para o {round.target}, em {formatLocal(round.timestamp * 1000)}:</Text>
    <pre className="lesson-terminal"><code>{lines.join('\n').trimEnd()}</code></pre>
  </figure>
}

function YourData({ probeId, days, error, latest, latestFailed }: ReturnType<typeof usePingDay>) {
  if (probeId === null) return <>
    <Text size="sm">Acompanhe uma probe para ver os seus números aqui.</Text>
    <Button component="a" href="#/acompanhar" variant="light" size="sm" mt="sm">Ir para Acompanhar</Button>
  </>
  if (error) return <SystemError title="Não foi possível ler os dados da sua probe" mt="0">{error}</SystemError>
  if (!days) return <Loading>Lendo os dados da sua probe…</Loading>
  const measured = days.filter(day => day.history.count > 0)
  const empty = days.filter(day => day.history.count === 0)
  return <>
    {latest && <Terminal round={latest} />}
    {latestFailed && <Text size="sm" c="dimmed">Não foi possível buscar a última rodada no RIPE Atlas agora.</Text>}
    {measured.length === 0
      ? <Text size="sm" mt="md">Ainda não há resultados nas últimas 24 horas. Os primeiros aparecem em poucos minutos depois de escolher a probe.</Text>
      : <>
        <Text size="sm" mt="lg">Nas últimas 24 horas, a <strong>probe {probeId}</strong> mediu:</Text>
        <dl className="lesson-numbers">
          {measured.map(day => <div key={day.name}>
            <dt>{day.name}</dt>
            <dd className="lesson-number-value">{day.summary.medianRtt === null ? 'Indisponível' : ms(day.summary.medianRtt)}</dd>
            <dd>tempo típico de ida e volta, em {count(day.history.count)} rodadas</dd>
            <dd>{day.summary.lossCount === 0 ? 'perda indisponível' : `perda em ${count(day.summary.lossRounds)} de ${count(day.summary.lossCount)} rodadas`}</dd>
          </div>)}
        </dl>
        {empty.length > 0 && <Text size="sm" mt="sm">
          Sem resultados de {names(empty)} nas últimas 24 horas. Nem toda probe participa de todas as medições automáticas.
        </Text>}
        <Paper withBorder p="sm" mt="md" className="lesson-chart">
          <Text size="sm" fw={600} mb={4}>{measured[0].name} nas últimas 24 horas</Text>
          <MetricChart history={measured[0].history} metric="rtt_avg_ms" />
        </Paper>
        <Anchor href="#/minha-probe" size="sm" display="inline-block" mt="sm">Ver o histórico completo em Minha probe</Anchor>
      </>}
  </>
}

function Reading({ days, latest }: { days: TargetDay[] | null, latest: LatestPing | null }) {
  const measured = (days ?? []).filter(day => day.summary.medianRtt !== null)
  const fastest = measured.reduce<TargetDay | null>((best, day) => !best || day.summary.medianRtt! < best.summary.medianRtt! ? day : best, null)
  const lossRounds = measured.reduce((total, day) => total + day.summary.lossRounds, 0)
  const lossCount = measured.reduce((total, day) => total + day.summary.lossCount, 0)
  const rtt = fastest?.summary.medianRtt ?? 20
  const distance = count(Math.round(rtt) * 100)
  const together = measured.length > 1 ? ', somando os destinos' : ''
  return <ul className="lesson-notes">
    <li>
      <Text size="sm"><strong>{ms(rtt)}</strong>{' '}
        {fastest ? `é o tempo típico do ${fastest.name}${measured.length > 1 ? ', o destino mais rápido' : ''}. ` : 'é um exemplo de tempo de ida e volta. '}
        A luz na fibra óptica percorre cerca de 200 km por milissegundo. Então ir e voltar nesse tempo cabe em no máximo uns {distance} km de cabo até o servidor.
        A distância real costuma ser menor, porque o caminho também gasta tempo em roteadores e filas.
      </Text>
    </li>
    {latest && latest.rcvd > 1 && <li>
      <Text size="sm"><strong>De {ms(latest.min)} a {ms(latest.max)}</strong> na última rodada. Os pacotes saem quase juntos, mas cada um pode esperar em filas diferentes pelo caminho, e por isso os tempos variam.</Text>
    </li>}
    <li>
      <Text size="sm">
        {lossCount > 0
          ? <><strong>{count(lossRounds)} de {count(lossCount)} rodadas</strong> tiveram alguma perda nas últimas 24 horas{together}. </>
          : <><strong>Perda</strong> acontece quando um pacote não volta. </>}
        Cada rodada são 3 pacotes enviados a cada 4 minutos. Perdas isoladas são comuns. O que chama atenção é perda frequente ou seguida.
      </Text>
    </li>
    {latest?.ttl && <li>
      <Text size="sm"><strong>TTL {latest.ttl}</strong> é um contador que vem na resposta. Cada roteador no caminho diminui ele em 1, então ele ajuda a estimar quantos roteadores a resposta atravessou. O traceroute usa essa mesma ideia.</Text>
    </li>}
  </ul>
}

export default function PingLesson() {
  const data = usePingDay()
  const targets = data.days?.filter(day => day.history.count > 0) ?? []
  return <LessonParts parts={[
    {
      title: 'O que é',
      content: <>
        <Text size="sm">
          Ping é a forma mais simples de medir uma conexão. A probe manda um pacote pequeno para um servidor e pede que ele devolva igual, como gritar num vale e esperar o eco.
          Quando a resposta volta, a probe anota quanto tempo levou. Esse tempo de ida e volta se chama RTT, do inglês round-trip time, e é medido em milissegundos (ms). Se o pacote não volta, conta como perda.
        </Text>
        <Text size="sm" mt="sm">
          É o mesmo que acontece quando você digita ping no terminal do seu computador. A diferença é que a sua probe faz isso sozinha, a cada 4 minutos, nas medições automáticas do RIPE Atlas.
          {targets.length > 0 ? ` Nas últimas 24 horas, ela mediu ${names(targets)}.` : ''} O K-root, o destino de referência desta lição, é um dos servidores raiz do DNS (o sistema que traduz nomes em endereços) e é mantido pelo RIPE NCC.
        </Text>
      </>,
    },
    { title: 'O seu dado', content: <YourData {...data} /> },
    {
      title: 'Como ler',
      content: data.probeId !== null && !data.days && !data.error
        ? <Loading>Esperando os dados da sua probe…</Loading>
        : <Reading days={data.days} latest={data.latest} />,
    },
    {
      title: 'O que não mostra',
      content: <ul className="lesson-limits">
        <li><Text size="sm">Ping não mede a velocidade da sua Internet, como a de download ou de upload.</Text></li>
        <li><Text size="sm">Ele não diz onde está o atraso nem por que um pacote se perdeu.</Text></li>
        <li><Text size="sm">Uma rodada com 100% de perda não prova que a sua Internet caiu. O servidor ou um equipamento no caminho pode ter ignorado o ping.</Text></li>
        <li><Text size="sm">O K-root tem cópias pelo mundo com o mesmo endereço (anycast), e responde a mais próxima. Por isso o tempo não diz onde ele fica. A lição <Anchor href="#/aprender/medicoes-automaticas">O que a sua probe mede sozinha</Anchor> explica.</Text></li>
        <li><Text size="sm">Falta de resultados não é perda. Pode ser que a probe estava desligada naquele período.</Text></li>
      </ul>,
    },
    {
      title: 'Para ir mais fundo',
      content: <List size="sm" spacing={4}>
        <List.Item><Anchor href="https://academy.ripe.net/mod/page/view.php?id=937" target="_blank" rel="noreferrer">RIPE NCC Academy: Internet Measurements</Anchor>, módulo "The Ping command" (em inglês, gratuito)</List.Item>
        <List.Item><Anchor href="https://atlas.ripe.net/docs/getting-started/user-defined-measurements/#ping" target="_blank" rel="noreferrer">Documentação do RIPE Atlas sobre ping</Anchor> (em inglês)</List.Item>
      </List>,
    },
  ]} />
}
