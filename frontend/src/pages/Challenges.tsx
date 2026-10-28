import { Alert, Anchor, Autocomplete, Button, Checkbox, Group, Modal, SegmentedControl, Select, Text, TextInput, Title } from '@mantine/core'
import { Fragment, useEffect, useState, type MouseEvent, type SubmitEvent } from 'react'
import { fetchAccount, KeyRefusedError, type Account } from '../features/atlas-account/account'
import { missingPermissions } from '../features/atlas-account/permissions'
import { ChallengeError, createChallenge, createGroupPing, destinations, dnsFailure, fetchChallenges, fetchKRootAverage, fetchMeasurement, fetchPingResult, fetchTracerouteRoute, kinds, groupSizes, measurementFromHash, preparing, validTarget, type Challenge, type Kind, type Measurement, type PingResult } from '../features/challenges/challenge'
import GroupResult from '../features/challenges/GroupResult'
import { formatMetric } from '../features/ping-history/chart'
import { HopTable, MissingSources, RouteStages, Terminal as RouteTerminal } from '../features/lessons/RouteReading'
import type { Route } from '../features/lessons/useTraceroute'
import '../features/lessons/lessons.css'
import Loading from '../lib/Loading'
import SystemError from '../lib/SystemError'
import { formatLocal } from '../lib/time'
import './pages.css'

const ms = (value: number) => `${formatMetric(value)} ms`
const count = (value: number) => value.toLocaleString('pt-BR')
const notes = new Map(destinations.flatMap(group => group.items.map(item => [item.value, item.note] as const)))
const autoDescription = (kind: Kind, target: string) => `Sondatlas: ${kind} para ${target.trim().toLowerCase() || 'o destino'}`
// A traceroute waits for every hop, so it takes longer than a ping.
const polling: Record<Kind, { every: number, times: number }> = { ping: { every: 3000, times: 40 }, traceroute: { every: 5000, times: 60 } }
const titles: Record<Kind, string> = { ping: 'Ping', traceroute: 'Traceroute' }
const preparingPolling = { every: 2000, times: 30 }

const MineLink = () => <Anchor href="https://atlas.ripe.net/measurements/mine" target="_blank" rel="noreferrer">lista das suas medições</Anchor>

function Missing({ ids }: { ids: string[] }) {
  const names = missingPermissions(ids)
  return <>{names.length > 1 ? 'as permissões ' : 'a permissão '}{names.map((permission, index) => <Fragment key={permission.id}>
    {index > 0 && ' e '}<strong>{permission.name}</strong>
  </Fragment>)}</>
}

function PingTerminal({ round, target }: { round: PingResult, target: string }) {
  const address = round.dst_addr ?? round.dst_name
  const lost = round.sent - round.rcvd
  const failure = dnsFailure(round)
  const lines = failure ? [`ping ${target}`, `ping: ${failure}`] : [
    `ping ${target}${round.dst_addr && round.dst_addr !== target ? ` (${round.dst_addr})` : ''}${round.size ? `, pacotes de ${round.size} bytes` : ''}`,
    ...round.result.map(packet => packet.rtt === undefined ? 'sem resposta (pacote perdido)' : `resposta de ${address}: tempo=${ms(packet.rtt)}`),
    '',
    `${round.sent} enviados, ${round.rcvd} recebidos, ${Math.round(lost / Math.max(round.sent, 1) * 100)}% de perda`,
    round.rcvd > 0 ? `mínimo ${ms(round.min)}, média ${ms(round.avg)}, máximo ${ms(round.max)}${round.ttl ? `, TTL ${round.ttl}` : ''}` : '',
  ]
  return <figure className="lesson-figure">
    <Text size="sm" component="figcaption">O seu ping, medido em {formatLocal(round.timestamp * 1000)}:</Text>
    <pre className="lesson-terminal"><code>{lines.join('\n').trimEnd()}</code></pre>
  </figure>
}

function comparison(avg: number, kRoot: number) {
  if (avg < kRoot * 0.8) return 'mais perto'
  if (avg > kRoot * 1.2) return 'mais longe'
  return 'a uma distância parecida'
}

const isAddress = (target: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(target)

function Address({ address, target, resolvedOnProbe }: { address: string, target: string, resolvedOnProbe: boolean }) {
  return <div>
    <dt>{address}</dt>
    <dd>
      {resolvedOnProbe
        ? `É o endereço de ${target} que a probe recebeu ao perguntar ao DNS da rede dela, antes de medir.`
        : `É o endereço de ${target} que o RIPE Atlas encontrou nos servidores dele e mandou para a probe.`}
      {' '}Serviços grandes costumam ter servidores em vários lugares do mundo e usar o DNS para indicar um perto de quem pergunta, para diminuir o tempo de resposta. Por isso o mesmo nome pode ter outro endereço em outro país. Nos servidores raiz é diferente: o endereço é o mesmo em todo lugar, e a rede leva cada pacote à cópia mais próxima (anycast).
      {resolvedOnProbe ? '' : ' Como quem perguntou foi o RIPE Atlas, este endereço pode não ser o mais perto da sua probe. Os desafios novos deixam a própria probe perguntar.'}
    </dd>
  </div>
}

function DnsFailed({ target }: { target: string }) {
  return <dl className="lesson-reading">
    <div>
      <dt>Nenhum pacote enviado</dt>
      <dd>
        A probe não conseguiu descobrir o endereço de {target} pelo DNS da rede dela, então não mediu nada.
        Confira se o nome está escrito certo. Se estiver, o DNS da rede pode ter falhado nesse momento, e vale tentar de novo.
      </dd>
    </div>
  </dl>
}

function PingExplained({ round, target, kRoot, resolvedOnProbe }: { round: PingResult, target: string, kRoot: number | null, resolvedOnProbe: boolean }) {
  if (dnsFailure(round)) return <DnsFailed target={target} />
  return <dl className="lesson-reading">
    {round.rcvd > 0 && <div>
      <dt>{ms(round.avg)}</dt>
      <dd>
        Foi o tempo médio de ida e volta até {target}.
        {kRoot ? <> O ping que a sua probe faz sozinha até o K-root leva cerca de {ms(kRoot)}, então {target} está {comparison(round.avg, kRoot)} da sua probe, pela rede.</> : ''}
      </dd>
    </div>}
    {!isAddress(target) && round.dst_addr && <Address address={round.dst_addr} target={target} resolvedOnProbe={resolvedOnProbe} />}
    <div>
      <dt>{round.rcvd} de {round.sent} pacotes</dt>
      <dd>{round.rcvd === round.sent
        ? 'Todos voltaram. Nenhum pacote se perdeu no caminho.'
        : round.rcvd === 0
          ? 'Nenhum voltou. Isso não prova que o destino caiu: muitos servidores ignoram ping.'
          : 'Alguns se perderam no caminho. Perdas isoladas são comuns.'}</dd>
    </div>
    <div>
      <dt>O mesmo que a probe faz sozinha</dt>
      <dd>
        Este ping é igual ao que a sua probe faz sozinha a cada 4 minutos para os servidores raiz, só que para o destino que você escolheu. A <Anchor href="#/aprender/ping">lição de ping</Anchor> explica cada número.
      </dd>
    </div>
  </dl>
}

const backToForm = () => { location.hash = '#/desafios' }
const backIcon = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M19 12H5M11 6l-6 6 6 6" />
</svg>

function TracerouteExplained({ route, measurement, onRetry }: { route: Route, measurement: Measurement, onRetry: () => void }) {
  const destination = { name: measurement.target, root: false }
  const terminal = <RouteTerminal route={route} destination={destination} caption="O seu traceroute" />
  const heading = <Title order={3} size="h5" mt="lg" mb="xs">O que o resultado quer dizer</Title>
  if (route.failure) return <>{terminal}{heading}<DnsFailed target={measurement.target} /></>
  return <>
    {route.missing.length > 0 && <MissingSources missing={route.missing} onRetry={onRetry} />}
    {terminal}
    <HopTable route={route} destination={destination} />
    {heading}
    {!isAddress(measurement.target) && route.destination && <dl className="lesson-reading" style={{ marginBottom: 'var(--mantine-spacing-lg)' }}>
      <Address address={route.destination} target={measurement.target} resolvedOnProbe={measurement.resolvedOnProbe} />
    </dl>}
    <RouteStages route={route} destination={destination} />
    <Text size="sm" mt="md">A <Anchor href="#/aprender/traceroute">lição de traceroute</Anchor> explica como o caminho é descoberto e o que ele não mostra.</Text>
  </>
}

// Asks RIPE Atlas for the result until it arrives, then stops. attempt asks again, for example when RIPEstat or PeeringDB failed.
function useResult(id: number, kind: Kind | null, attempt: number) {
  const [ping, setPing] = useState<PingResult | null>(null)
  const [route, setRoute] = useState<Route | null>(null)
  const [polled, setPolled] = useState(false)
  const [gaveUp, setGaveUp] = useState(false)

  useEffect(() => {
    if (!kind) return
    const controller = new AbortController()
    const { every, times } = polling[kind]
    let tries = 0
    let timer: ReturnType<typeof setTimeout>
    const again = () => {
      if (++tries >= times) setGaveUp(true)
      else timer = setTimeout(poll, every)
    }
    const read = (): Promise<boolean> => kind === 'ping'
      ? fetchPingResult(id, controller.signal).then(result => { if (result) setPing(result); return Boolean(result) })
      : fetchTracerouteRoute(id, controller.signal).then(result => { if (result) setRoute(result); return Boolean(result) })
    const poll = () => read()
      .then(found => { setPolled(true); if (!found) again() })
      .catch(() => {
        if (controller.signal.aborted) return
        setPolled(true)
        again()
      })
    poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [id, kind, attempt])

  return { ping, route, polled, gaveUp }
}

function Result({ id }: { id: number }) {
  const [measurement, setMeasurement] = useState<Measurement | null>()
  const [lookup, setLookup] = useState<'reading' | 'preparing' | 'slow' | 'failed'>('reading')
  const [kRoot, setKRoot] = useState<number | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const group = measurement?.group === true && measurement.type === 'ping'
  const kind = !measurement?.group && (measurement?.type === 'ping' || measurement?.type === 'traceroute') ? measurement.type : null
  const probeId = measurement?.probeId
  const { ping, route, polled, gaveUp } = useResult(id, kind, attempt)

  // Nothing is shown about the measurement until RIPE Atlas has its full details: a new one is still being prepared for a few seconds.
  useEffect(() => {
    const controller = new AbortController()
    let tries = 0
    let timer: ReturnType<typeof setTimeout>
    const look = () => fetchMeasurement(id, controller.signal).then(found => {
      if (found !== preparing) return setMeasurement(found)
      if (++tries >= preparingPolling.times) return setLookup('slow')
      setLookup('preparing')
      timer = setTimeout(look, preparingPolling.every)
    }, () => { if (!controller.signal.aborted) setLookup('failed') })
    look()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [id])

  useEffect(() => {
    if (!probeId || kind !== 'ping') return
    const controller = new AbortController()
    fetchKRootAverage(probeId, controller.signal).then(setKRoot, () => setKRoot(null))
    return () => controller.abort()
  }, [probeId, kind])

  const page = `https://atlas.ripe.net/measurements/${id}/`
  const pageLink = (text: string) => <Anchor href={page} target="_blank" rel="noreferrer">{text}</Anchor>
  const done = kind === 'ping' ? ping : route
  const measuring = Boolean(kind) && polled && !done && !gaveUp
  const leave = () => measuring ? setLeaving(true) : backToForm()
  const again = <Button variant="default" mt="md" onClick={leave}>Fazer outro desafio</Button>

  let body
  if (lookup === 'failed') body = <>
    <SystemError title="Não foi possível consultar a medição">O RIPE Atlas não respondeu agora. Recarregue a página em instantes.</SystemError>
    {again}
  </>
  else if (lookup === 'slow') body = <>
    <SystemError title="A medição ainda não está pronta">O RIPE Atlas ainda está preparando a medição {id}. Recarregue a página em instantes.</SystemError>
    {again}
  </>
  else if (measurement === undefined || (kind && !polled)) body = <Loading mt="lg">
    {lookup === 'preparing' ? `O RIPE Atlas está preparando a medição ${id}…` : `Consultando a medição ${id}…`}
  </Loading>
  else if (measurement === null) body = <Alert color="yellow" mt="lg" maw={720} title={`A medição ${id} não existe no RIPE Atlas`}>
    Confira o número no endereço da página.
    <div>{again}</div>
  </Alert>
  else if (!kind && !group) body = <Alert color="yellow" mt="lg" maw={720} title={`A medição ${id} não é um ping nem um traceroute`}>
    Esta página explica só resultados de ping e de traceroute. Veja esta medição na {pageLink('página dela no RIPE Atlas')}.
    <div>{again}</div>
  </Alert>
  else body = <section className="follow-box" aria-labelledby="challenge-result">
    {group
      ? <Title order={2} size="h4" id="challenge-result">Ping de {measurement.scheduled ? `${measurement.scheduled} probes` : 'várias probes'} até {measurement.target}</Title>
      : <Text fw={600} id="challenge-result">{titles[kind!]} {probeId ? `da probe ${probeId} ` : ''}até {measurement.target}</Text>}
    {measuring && <Loading mt="sm">{kind === 'ping'
      ? 'A probe está medindo. O resultado costuma chegar em alguns segundos…'
      : 'A probe está descobrindo o caminho, salto por salto. Um traceroute pode levar alguns minutos…'}</Loading>}
    {gaveUp && <Text size="sm" mt="sm">
      O resultado ainda não chegou. A medição foi criada, e você pode ver o resultado mais tarde na {pageLink('página dela no RIPE Atlas')}.
    </Text>}
    {ping && <>
      <PingTerminal round={ping} target={measurement.target} />
      <Title order={3} size="h5" mt="lg" mb="xs">O que o resultado quer dizer</Title>
      <PingExplained round={ping} target={measurement.target} kRoot={kRoot} resolvedOnProbe={measurement.resolvedOnProbe} />
    </>}
    {route && <TracerouteExplained route={route} measurement={measurement} onRetry={() => setAttempt(value => value + 1)} />}
    {group && <GroupResult id={id} measurement={measurement} />}
    {(done || group) && <Text size="sm" mt="md">
      Esta medição é pública e fica guardada no RIPE Atlas. Você pode abrir a {pageLink('página dela')} quando quiser.
    </Text>}
    {again}
  </section>

  return <>
    <Button component="a" href="#/desafios" variant="light" size="sm" radius="xl" mt="lg" leftSection={backIcon}
      onClick={(event: MouseEvent) => { if (measuring) { event.preventDefault(); setLeaving(true) } }}>
      Voltar para Desafios
    </Button>
    {body}
    <Modal opened={leaving} onClose={() => setLeaving(false)} centered title="Sair antes do resultado?">
      <Text size="sm">
        A probe continua medindo, e o resultado fica guardado no RIPE Atlas. Você pode vê-lo depois na {pageLink('página da medição')} ou na <MineLink />.
      </Text>
      <Group gap="sm" mt="lg" justify="flex-end">
        <Button variant="default" onClick={() => setLeaving(false)}>Esperar o resultado</Button>
        <Button onClick={backToForm}>Sair agora</Button>
      </Group>
    </Modal>
  </>
}

function NewChallenge({ account }: { account: Account }) {
  const probes = account.probes ?? []
  const connected = probes.filter(probe => probe.status.id === 1)
  const [kind, setKind] = useState<Kind>('ping')
  const [probeId, setProbeId] = useState<string | null>(connected[0] ? String(connected[0].id) : null)
  const [target, setTarget] = useState('')
  const [packets, setPackets] = useState(String(kinds.ping.packets[0]))
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<{ probe?: string, target?: string }>({})
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ChallengeError | null>(null)
  const [suggesting, setSuggesting] = useState(false)

  function review(event: SubmitEvent) {
    event.preventDefault()
    setSuggesting(false)
    setError(null)
    const found = {
      probe: probeId ? undefined : 'Escolha uma das suas probes conectadas.',
      target: !target.trim() ? 'Escolha ou digite um destino.' : validTarget(target) ? undefined : 'Digite um nome, como google.com, ou um endereço IPv4 público.',
    }
    setErrors(found)
    if (!found.probe && !found.target) setConfirming(true)
  }

  async function create() {
    setBusy(true)
    setError(null)
    try {
      location.hash = `#/desafios/${await createChallenge(kind, Number(probeId), target, Number(packets), description)}`
    } catch (reason) {
      setError(reason instanceof ChallengeError ? reason : new ChallengeError((reason as Error).message))
      setBusy(false)
    }
  }

  function choose(value: string) {
    const next = value as Kind
    setKind(next)
    if (!kinds[next].packets.includes(Number(packets))) setPackets(String(kinds[next].packets[0]))
  }

  if (!connected.length) return <Alert color="yellow" mt="md" maw={720} title="Nenhuma probe sua está conectada agora">
    A medição sai de uma probe sua, então ela precisa estar conectada. Veja o que fazer em <Anchor href="#/minha-probe">Minha probe</Anchor>.
  </Alert>

  const errorText = error && (error.missing.length
    ? <Alert color="yellow" mt="sm" title="Falta uma permissão na chave">A chave não tem <Missing ids={error.missing} />. Acrescente no site do RIPE Atlas e tente de novo.</Alert>
    : <SystemError title={`Não foi possível criar ${kinds[kind].noun}`}>{error.message}</SystemError>)

  return <section className="follow-box" aria-labelledby="new-challenge">
    <Title order={2} size="h4" id="new-challenge">Desafio: uma medição sua</Title>
    <SegmentedControl mt="sm" value={kind} onChange={choose} aria-label="Tipo de medição"
      data={[{ value: 'ping', label: 'Ping' }, { value: 'traceroute', label: 'Traceroute' }]} />
    <Text size="sm" mt="sm" maw={680}>
      {kind === 'ping'
        ? <>Escolha uma das suas probes e um destino. A probe manda alguns pacotes e mede quanto tempo eles levam para ir e voltar, como na <Anchor href="#/aprender/ping">lição de ping</Anchor>, só que para o destino que você escolher.</>
        : <>Escolha uma das suas probes e um destino. A probe descobre por quais roteadores os pacotes passam até chegar lá, como na <Anchor href="#/aprender/traceroute">lição de traceroute</Anchor>, só que para o destino que você escolher.</>}
      {' '}Com um nome, a probe descobre o endereço pelo DNS da rede dela, como o seu computador faria. Com um endereço IPv4, a probe mede direto.
    </Text>
    <form onSubmit={review}>
      <Group align="flex-start" gap="md" mt="md">
        <Select label="Probe" searchable nothingFoundMessage="Nenhuma probe com esse número" styles={{ input: { textOverflow: 'ellipsis' } }} w={380} maw="100%" value={probeId}
          onChange={value => { setProbeId(value); setErrors(current => ({ ...current, probe: undefined })) }} error={errors.probe}
          data={probes.map(probe => ({
            value: String(probe.id),
            label: `${probe.id}${probe.description ? `, ${probe.description}` : ''}${probe.status.id === 1 ? '' : ' (desconectada)'}`,
            disabled: probe.status.id !== 1,
          }))} />
        <Autocomplete label="Destino" placeholder="google.com" description="Um nome ou um endereço IPv4 público" inputWrapperOrder={['label', 'input', 'description', 'error']} w={300} maw="100%" value={target}
          onChange={value => { setTarget(value); setErrors(current => ({ ...current, target: undefined })) }} error={errors.target}
          data={destinations.map(group => ({ group: group.group, items: group.items.map(item => item.value) }))}
          renderOption={({ option }) => <div><Text size="sm">{option.value}</Text><Text size="xs" c="dimmed">{notes.get(option.value)}</Text></div>}
          dropdownOpened={suggesting} onDropdownOpen={() => setSuggesting(true)} onDropdownClose={() => setSuggesting(false)} />
      </Group>
      <Group align="flex-start" gap="md" mt="md">
        <div>
          <Text size="sm" fw={500} id="packets-label">{kind === 'ping' ? 'Pacotes' : 'Pacotes por salto'}</Text>
          <SegmentedControl mt={4} value={packets} onChange={setPackets} aria-labelledby="packets-label"
            data={kinds[kind].packets.map(choice => ({ value: String(choice), label: String(choice) }))} />
          <Text size="xs" c="dimmed" mt={4} maw={260}>{kind === 'ping'
            ? 'Mais pacotes dão uma medida mais estável e custam mais.'
            : 'A probe manda esse número de pacotes em cada salto. Mais pacotes mostram melhor a variação do tempo e custam mais.'}</Text>
        </div>
        <TextInput label="Descrição (opcional)" description="Aparece na página da medição no RIPE Atlas" inputWrapperOrder={['label', 'input', 'description']}
          placeholder={autoDescription(kind, target)} maxLength={100} w={380} maw="100%" value={description} onChange={event => setDescription(event.currentTarget.value)} />
      </Group>
      <Button type="submit" mt="md">Ver o custo</Button>
    </form>
    <Text size="sm" c="dimmed" mt="md">
      Para mais opções, como várias probes, IPv6 ou outros tipos de medição, use o <Anchor href="https://atlas.ripe.net/measurements/form/" target="_blank" rel="noreferrer">formulário de criação de medições</Anchor> do RIPE Atlas.
    </Text>
    <Text size="sm" c="dimmed" mt={4}>As medições que você já criou ficam na <MineLink />, no RIPE Atlas.</Text>
    {!confirming && errorText}
    <Modal opened={confirming} onClose={() => setConfirming(false)} closeOnClickOutside={false} centered title={`Criar este ${kind}?`}>
      <Text size="sm">Da probe <strong>{probeId}</strong> até <strong>{target.trim().toLowerCase()}</strong>, com {packets} pacotes{kind === 'traceroute' ? ' por salto' : ''}.</Text>
      <Text size="sm" mt="xs">
        Custa cerca de <strong>{kinds[kind].cost(Number(packets))} créditos</strong>, cobrados nas próximas 4 a 6 horas.{account.credits ? ` Seu saldo: ${count(account.credits.current_balance)}.` : ''}
      </Text>
      <Text size="sm" mt="xs">A medição fica pública no RIPE Atlas: qualquer pessoa pode ver o destino e o resultado.</Text>
      <Text size="sm" mt="xs">Ela leva a etiqueta <code>sondatlas</code>, para você encontrá-la entre as suas medições no RIPE Atlas.</Text>
      {errorText}
      <Group gap="sm" mt="lg" justify="flex-end">
        <Button variant="default" onClick={() => setConfirming(false)}>Cancelar</Button>
        <Button loading={busy} onClick={create}>Criar {kinds[kind].noun}</Button>
      </Group>
    </Modal>
  </section>
}

const continents = ['África', 'Américas', 'Ásia', 'Europa', 'Oceania']

// How the probes are split, redrawn as the size changes. A picture with one sentence for screen readers.
function ContinentStrip({ each, mine }: { each: number, mine: number | null }) {
  const dots = (amount: number) => <div className="continent-dots">{Array.from({ length: amount }, (_, index) => <span key={index} />)}</div>
  return <div className="continent-strip" role="img"
    aria-label={`${each === 1 ? '1 probe' : `${each} probes`} em cada continente${mine ? `, mais a sua probe ${mine}` : ''}`}>
    {continents.map(name => <div key={name}><div className="continent-name">{name}</div>{dots(each)}</div>)}
    <div className="continent-own" data-off={!mine}><div className="continent-name">{mine ? `Sua probe ${mine}` : 'Sem a sua probe'}</div>{dots(1)}</div>
  </div>
}

function GroupChallenge({ account }: { account: Account }) {
  const probes = account.probes ?? []
  const connected = probes.filter(probe => probe.status.id === 1)
  const [target, setTarget] = useState('')
  const [total, setTotal] = useState(String(groupSizes[0]))
  const [withMine, setWithMine] = useState(connected.length > 0)
  const [probeId, setProbeId] = useState<string | null>(connected[0] ? String(connected[0].id) : null)
  const [packets, setPackets] = useState(String(kinds.ping.packets[0]))
  const [targetError, setTargetError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ChallengeError | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const mine = withMine && probeId ? Number(probeId) : null
  const sources = Number(total) + (mine ? 1 : 0)

  function review(event: SubmitEvent) {
    event.preventDefault()
    setSuggesting(false)
    setError(null)
    const problem = !target.trim() ? 'Escolha ou digite um destino.' : validTarget(target) ? '' : 'Digite um nome, como google.com, ou um endereço IPv4 público.'
    setTargetError(problem)
    if (!problem) setConfirming(true)
  }

  async function create() {
    setBusy(true)
    setError(null)
    try {
      location.hash = `#/desafios/${await createGroupPing(target, Number(total), mine, Number(packets))}`
    } catch (reason) {
      setError(reason instanceof ChallengeError ? reason : new ChallengeError((reason as Error).message))
      setBusy(false)
    }
  }

  const errorText = error && (error.missing.length
    ? <Alert color="yellow" mt="sm" title="Falta uma permissão na chave">A chave não tem <Missing ids={error.missing} />. Acrescente no site do RIPE Atlas e tente de novo.</Alert>
    : <SystemError title="Não foi possível criar o ping">{error.message}</SystemError>)

  return <section className="follow-box" aria-labelledby="group-challenge">
    <Title order={2} size="h4" id="group-challenge">Desafio: ping de várias probes</Title>
    <Text size="sm" mt={4} maw={680}>
      As probes públicas do RIPE Atlas não medem só para os donos. Com créditos, você mede a partir de probes de outras pessoas, em qualquer lugar do mundo.
      Aqui, o mesmo ping sai de probes nos cinco continentes, e você compara o tempo de cada lugar até o mesmo destino.
    </Text>
    {!connected.length && <Alert color="yellow" mt="md" title="Nenhuma probe sua está conectada agora">
      O ping sai só das probes dos cinco continentes. Para incluir a sua, veja o que fazer em <Anchor href="#/minha-probe">Minha probe</Anchor>.
    </Alert>}
    <form onSubmit={review}>
      <Group align="flex-start" gap="md" mt="md">
        <Autocomplete label="Destino" placeholder="google.com" description="Um nome ou um endereço IPv4 público" inputWrapperOrder={['label', 'input', 'description', 'error']} w={260} maw="100%" value={target}
          onChange={value => { setTarget(value); setTargetError('') }} error={targetError}
          data={destinations.map(group => ({ group: group.group, items: group.items.map(item => item.value) }))}
          renderOption={({ option }) => <div><Text size="sm">{option.value}</Text><Text size="xs" c="dimmed">{notes.get(option.value)}</Text></div>}
          dropdownOpened={suggesting} onDropdownOpen={() => setSuggesting(true)} onDropdownClose={() => setSuggesting(false)} />
        <div>
          <Text size="sm" fw={500} id="group-size">Probes</Text>
          <SegmentedControl mt={4} value={total} onChange={setTotal} aria-labelledby="group-size"
            data={groupSizes.map(size => ({ value: String(size), label: String(size) }))} />
        </div>
        <div>
          <Text size="sm" fw={500} id="group-packets">Pacotes</Text>
          <SegmentedControl mt={4} value={packets} onChange={setPackets} aria-labelledby="group-packets"
            data={kinds.ping.packets.map(choice => ({ value: String(choice), label: String(choice) }))} />
        </div>
      </Group>
      <ContinentStrip each={Number(total) / continents.length} mine={mine} />
      <Text size="xs" c="dimmed" mt={6}>O RIPE Atlas escolhe quais probes entram em cada continente.</Text>
      <Group align="center" gap="md" mt="md">
        <Checkbox label="Incluir a minha probe, para comparar" checked={withMine} disabled={!connected.length} onChange={event => setWithMine(event.currentTarget.checked)} />
        {withMine && probes.length > 1 && <Select aria-label="Qual das suas probes" styles={{ input: { textOverflow: 'ellipsis' } }} w={300} value={probeId} onChange={setProbeId}
          data={probes.map(probe => ({
            value: String(probe.id),
            label: `${probe.id}${probe.description ? `, ${probe.description}` : ''}${probe.status.id === 1 ? '' : ' (desconectada)'}`,
            disabled: probe.status.id !== 1,
          }))} />}
      </Group>
      <Button type="submit" mt="md">Ver o custo</Button>
    </form>
    {!confirming && errorText}
    <Modal opened={confirming} onClose={() => setConfirming(false)} closeOnClickOutside={false} centered title="Criar este ping de várias probes?">
      <Text size="sm">
        De <strong>{total} probes</strong>, divididas entre os cinco continentes{mine ? <>, e da sua probe <strong>{mine}</strong></> : ''}, até <strong>{target.trim().toLowerCase()}</strong>, com {packets} pacotes cada.
      </Text>
      <Text size="sm" mt="xs">
        Custa cerca de <strong>{kinds.ping.cost(Number(packets)) * sources} créditos</strong>, {kinds.ping.cost(Number(packets))} por probe, cobrados nas próximas 4 a 6 horas.{account.credits ? ` Seu saldo: ${count(account.credits.current_balance)}.` : ''}
      </Text>
      <Text size="sm" mt="xs">O RIPE Atlas escolhe quais probes entram em cada continente. Se faltar probe conectada em algum, vêm menos resultados.</Text>
      <Text size="sm" mt="xs">A medição fica pública no RIPE Atlas e leva a etiqueta <code>sondatlas</code>.</Text>
      {errorText}
      <Group gap="sm" mt="lg" justify="flex-end">
        <Button variant="default" onClick={() => setConfirming(false)}>Cancelar</Button>
        <Button loading={busy} onClick={create}>Criar o ping</Button>
      </Group>
    </Modal>
  </section>
}

function ChallengeList({ account }: { account: Account }) {
  const missing = account.missing_permissions?.includes('my_measurements')
  const [list, setList] = useState<{ count: number, challenges: Challenge[] } | null>(null)
  const [error, setError] = useState<ChallengeError | null>(null)

  useEffect(() => {
    if (missing) return
    const controller = new AbortController()
    fetchChallenges(controller.signal).then(setList, (reason: Error) => {
      if (!controller.signal.aborted) setError(reason instanceof ChallengeError ? reason : new ChallengeError(reason.message))
    })
    return () => controller.abort()
  }, [missing])

  const lacking = missing ? ['my_measurements'] : error?.missing ?? []
  return <section className="follow-box" aria-labelledby="my-challenges">
    <Title order={2} size="h4" id="my-challenges">Seus desafios</Title>
    {lacking.length > 0 && <Alert color="yellow" mt="sm" title="Falta uma permissão na chave">
      Para listar os seus desafios aqui, falta na chave <Missing ids={lacking} />. Edite a chave no site do RIPE Atlas e volte aqui. Enquanto isso, eles ficam na <MineLink />.
    </Alert>}
    {error && !lacking.length && <SystemError title="Não foi possível consultar os seus desafios">{error.message}</SystemError>}
    {!list && !error && !missing && <Loading mt="sm">Consultando os seus desafios…</Loading>}
    {list && !list.challenges.length && <Text size="sm" mt="xs">Você ainda não criou nenhum desafio. O primeiro que você criar acima aparece aqui.</Text>}
    {list && list.challenges.length > 0 && <>
      <Text size="sm" mt={4}>
        {list.count === 1 ? 'Você criou 1 desafio pela Sondatlas.' : `Você criou ${count(list.count)} desafios pela Sondatlas.`}
        {list.count > list.challenges.length ? ` Aqui estão os ${list.challenges.length} mais recentes.` : ''} Abra um para ver o resultado explicado.
      </Text>
      <ul className="challenge-list">
        {list.challenges.map(challenge => <li key={challenge.id}>
          <div>
            <Anchor href={`#/desafios/${challenge.id}`} fw={600}>{challenge.group ? 'Ping de várias probes' : titles[challenge.type as Kind] ?? challenge.type} até {challenge.target}</Anchor>
            {challenge.group
              ? <Text size="xs" c="dimmed">{challenge.probes ? `De ${challenge.probes} probes` : 'De várias probes'}</Text>
              : challenge.probe_id && <Text size="xs" c="dimmed">Da probe {challenge.probe_id}</Text>}
          </div>
          <Text size="sm" c="dimmed" className="challenge-date">{formatLocal(challenge.created * 1000)}</Text>
        </li>)}
      </ul>
    </>}
  </section>
}

export default function Challenges() {
  const [account, setAccount] = useState<Account | null>(null)
  const [error, setError] = useState('')
  const [hash, setHash] = useState(location.hash)
  const resultId = measurementFromHash(hash)

  useEffect(() => {
    const update = () => setHash(location.hash)
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchAccount(controller.signal)
      .then(setAccount)
      .catch((reason: Error) => {
        if (controller.signal.aborted) return
        setError(reason instanceof KeyRefusedError ? 'O RIPE Atlas recusou a chave salva. Vincule uma chave nova em Configurações.' : reason.message)
      })
    return () => controller.abort()
  }, [])

  const missing = (account?.missing_permissions ?? []).filter(permission => permission === 'measurements' || permission === 'probes')
  return <div className="install">
    <Title order={1} size="h2">Desafios</Title>
    <Text size="lg" mt="sm" maw={900}>
      Medições criadas por você, com os seus créditos. Antes de criar, a Sondatlas mostra quanto custa. Para entender de onde vêm os créditos, veja a <Anchor href="#/aprender/creditos">lição de créditos</Anchor>.
    </Text>
    {resultId ? <Result key={resultId} id={resultId} /> : <>
      {error && <SystemError title="Não foi possível consultar a sua conta">{error}</SystemError>}
      {!account && !error && <Loading mt="lg">Consultando a sua conta…</Loading>}
      {account && !account.connected && <Alert variant="light" mt="lg" maw={720} title="Vincule a sua conta do RIPE Atlas">
        Os desafios usam a sua chave para criar medições com os seus créditos.
        <div><Button component="a" href="#/configuracoes" size="sm" mt="sm">Ir para Configurações</Button></div>
      </Alert>}
      {account?.connected && missing.length > 0 && <Alert color="yellow" mt="lg" maw={720} title="Falta uma permissão na chave">
        Para os desafios, falta na chave <Missing ids={missing} />. Edite a chave no site do RIPE Atlas e volte aqui.
        <div><Button component="a" href="#/configuracoes" size="sm" mt="sm">Ir para Configurações</Button></div>
      </Alert>}
      {account?.connected && missing.length === 0 && <><NewChallenge account={account} /><GroupChallenge account={account} /></>}
      {account?.connected && <ChallengeList account={account} />}
    </>}
  </div>
}
