import { Anchor, Button, List, NativeSelect, Text } from '@mantine/core'
import { useState } from 'react'
import Loading from '../../lib/Loading'
import SystemError from '../../lib/SystemError'
import LessonParts from './LessonParts'
import { HopTable, MissingSources, Reminders, RouteStages, Terminal } from './RouteReading'
import { roots, useTraceroute, type Root } from './useTraceroute'
import './lessons.css'

const rootDestination = (root: Root) => ({ name: root.name, root: true })

function RootPicker({ root, onChange }: { root: Root, onChange: (root: Root) => void }) {
  return <div className="lesson-picker">
    <Text size="sm" maw={680}>
      A sua probe mede sozinha os 13 servidores raiz do DNS, cada um mantido por uma organização diferente e com cópias em vários lugares do mundo.
      Troque o destino e compare: a rota passa pelos mesmos pontos de troca? Quantos saltos e quanto tempo leva? A cópia que responde fica no Brasil?
    </Text>
    <NativeSelect label="Destino" mt="sm" maw={340} value={String(root.measurement)}
      onChange={event => onChange(roots.find(item => item.measurement === Number(event.currentTarget.value)) ?? root)}
      data={roots.map(item => ({ value: String(item.measurement), label: `${item.name}, mantido por ${item.operator}` }))} />
  </div>
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
      <Terminal route={data.route} destination={rootDestination(root)} caption={<>Última rota da <strong>probe {data.probeId}</strong> até o {root.name}</>} />
      <HopTable route={data.route} destination={rootDestination(root)} />
    </>}
  </>
}

function Reading({ data, root }: { data: ReturnType<typeof useTraceroute>, root: Root }) {
  const route = data.route
  if (data.probeId === null || data.error) return <>
    <Text size="sm">Com uma probe acompanhada, aqui aparece a rota dela contada em etapas: casa, provedor, pontos de troca e destino.</Text>
    <Reminders />
  </>
  if (!route) return data.loaded ? <Reminders /> : <Loading>Esperando a rota da sua probe…</Loading>
  return <RouteStages route={route} destination={rootDestination(root)} />
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
        <li><Text size="sm">É uma rodada só, e o caminho muda. Em outra rede ou em outro dia, quem responde pode ser outra cópia do mesmo servidor. Compare com o tempo do K-root na <Anchor href="#/aprender/ping">lição de ping</Anchor>.</Text></li>
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
