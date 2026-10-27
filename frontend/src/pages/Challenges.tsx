import { Alert, Anchor, Autocomplete, Button, Group, Modal, SegmentedControl, Select, Text, TextInput, Title } from '@mantine/core'
import { Fragment, useEffect, useState, type SubmitEvent } from 'react'
import { fetchAccount, KeyRefusedError, type Account } from '../features/atlas-account/account'
import { missingPermissions } from '../features/atlas-account/permissions'
import { ChallengeError, createPing, destinations, fetchKRootAverage, fetchPingResult, packetChoices, pingCost, validTarget, type PingResult } from '../features/challenges/challenge'
import { formatMetric } from '../features/ping-history/chart'
import '../features/lessons/lessons.css'
import Loading from '../lib/Loading'
import SystemError from '../lib/SystemError'
import { formatLocal } from '../lib/time'
import './pages.css'

const ms = (value: number) => `${formatMetric(value)} ms`
const count = (value: number) => value.toLocaleString('pt-BR')
const notes = new Map(destinations.flatMap(group => group.items.map(item => [item.value, item.note] as const)))
const autoDescription = (target: string) => `Sondatlas: ping para ${target.trim().toLowerCase() || 'o destino'}`
const pollEvery = 3000
const pollTimes = 40

interface Created {
  id: number
  probeId: number
  target: string
}

function Missing({ ids }: { ids: string[] }) {
  const names = missingPermissions(ids)
  return <>{names.length > 1 ? 'as permissões ' : 'a permissão '}{names.map((permission, index) => <Fragment key={permission.id}>
    {index > 0 && ' e '}<strong>{permission.name}</strong>
  </Fragment>)}</>
}

function Terminal({ round }: { round: PingResult }) {
  const address = round.dst_addr ?? round.dst_name
  const lost = round.sent - round.rcvd
  const lines = [
    `ping ${round.dst_name}${round.dst_addr && round.dst_addr !== round.dst_name ? ` (${round.dst_addr})` : ''}${round.size ? `, pacotes de ${round.size} bytes` : ''}`,
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

function Explained({ round, target, kRoot }: { round: PingResult, target: string, kRoot: number | null }) {
  return <dl className="lesson-reading">
    {round.rcvd > 0 && <div>
      <dt>{ms(round.avg)}</dt>
      <dd>
        Foi o tempo médio de ida e volta até {target}.
        {kRoot ? <> O ping que a sua probe faz sozinha até o K-root leva cerca de {ms(kRoot)}, então {target} está {comparison(round.avg, kRoot)} da sua probe, pela rede.</> : ''}
      </dd>
    </div>}
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

function Result({ created, onAgain }: { created: Created, onAgain: () => void }) {
  const [round, setRound] = useState<PingResult | null>(null)
  const [gaveUp, setGaveUp] = useState(false)
  const [kRoot, setKRoot] = useState<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchKRootAverage(created.probeId, controller.signal).then(setKRoot, () => setKRoot(null))
    return () => controller.abort()
  }, [created.probeId])

  useEffect(() => {
    const controller = new AbortController()
    let tries = 0
    let timer: ReturnType<typeof setTimeout>
    const poll = () => fetchPingResult(created.id, controller.signal)
      .then(result => {
        if (result) setRound(result)
        else if (++tries >= pollTimes) setGaveUp(true)
        else timer = setTimeout(poll, pollEvery)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        if (++tries >= pollTimes) setGaveUp(true)
        else timer = setTimeout(poll, pollEvery)
      })
    poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [created.id])

  const page = `https://atlas.ripe.net/measurements/${created.id}/`
  return <section className="follow-box" aria-labelledby="challenge-result">
    <Text fw={600} id="challenge-result">Ping da probe {created.probeId} até {created.target}</Text>
    {!round && !gaveUp && <Loading mt="sm">A probe está medindo. O resultado costuma chegar em alguns segundos…</Loading>}
    {gaveUp && <Text size="sm" mt="sm">
      O resultado ainda não chegou. A medição foi criada, e você pode ver o resultado mais tarde na <Anchor href={page} target="_blank" rel="noreferrer">página dela no RIPE Atlas</Anchor>.
    </Text>}
    {round && <>
      <Terminal round={round} />
      <Title order={3} size="h5" mt="lg" mb="xs">O que o resultado quer dizer</Title>
      <Explained round={round} target={created.target} kRoot={kRoot} />
      <Text size="sm" mt="md">
        Esta medição é pública e fica guardada no RIPE Atlas. Você pode abrir a <Anchor href={page} target="_blank" rel="noreferrer">página dela</Anchor> quando quiser.
      </Text>
    </>}
    <Button variant="default" mt="md" onClick={onAgain}>Fazer outro ping</Button>
  </section>
}

function PingChallenge({ account }: { account: Account }) {
  const probes = account.probes ?? []
  const connected = probes.filter(probe => probe.status.id === 1)
  const [probeId, setProbeId] = useState<string | null>(connected[0] ? String(connected[0].id) : null)
  const [target, setTarget] = useState('')
  const [packets, setPackets] = useState(String(packetChoices[0]))
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<{ probe?: string, target?: string }>({})
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ChallengeError | null>(null)
  const [created, setCreated] = useState<Created | null>(null)
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
      const id = await createPing(Number(probeId), target, Number(packets), description)
      setCreated({ id, probeId: Number(probeId), target: target.trim().toLowerCase() })
      setConfirming(false)
    } catch (reason) {
      setError(reason instanceof ChallengeError ? reason : new ChallengeError((reason as Error).message))
    } finally {
      setBusy(false)
    }
  }

  if (created) return <Result created={created} onAgain={() => { setCreated(null); setTarget(''); setDescription('') }} />
  if (!connected.length) return <Alert color="yellow" mt="md" maw={720} title="Nenhuma probe sua está conectada agora">
    O ping sai de uma probe sua, então ela precisa estar conectada. Veja o que fazer em <Anchor href="#/minha-probe">Minha probe</Anchor>.
  </Alert>

  const errorText = error && (error.missing.length
    ? <Alert color="yellow" mt="sm" title="Falta uma permissão na chave">A chave não tem <Missing ids={error.missing} />. Acrescente no site do RIPE Atlas e tente de novo.</Alert>
    : <SystemError title="Não foi possível criar o ping">{error.message}</SystemError>)

  return <section className="follow-box" aria-labelledby="ping-challenge">
    <Title order={2} size="h4" id="ping-challenge">Desafio: um ping seu</Title>
    <Text size="sm" mt={4} maw={680}>
      Escolha uma das suas probes e um destino. A probe manda alguns pacotes e mede quanto tempo eles levam para ir e voltar, como na <Anchor href="#/aprender/ping">lição de ping</Anchor>, só que para o destino que você escolher.
      Com um nome, o RIPE Atlas descobre o endereço antes de medir. Com um endereço IPv4, a probe mede direto.
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
          <Text size="sm" fw={500} id="packets-label">Pacotes</Text>
          <SegmentedControl mt={4} value={packets} onChange={setPackets} aria-labelledby="packets-label"
            data={packetChoices.map(choice => ({ value: String(choice), label: String(choice) }))} />
          <Text size="xs" c="dimmed" mt={4} maw={260}>Mais pacotes dão uma medida mais estável e custam mais.</Text>
        </div>
        <TextInput label="Descrição (opcional)" description="Aparece na página da medição no RIPE Atlas" inputWrapperOrder={['label', 'input', 'description']}
          placeholder={autoDescription(target)} maxLength={100} w={380} maw="100%" value={description} onChange={event => setDescription(event.currentTarget.value)} />
      </Group>
      <Button type="submit" mt="md">Ver o custo</Button>
    </form>
    <Text size="sm" c="dimmed" mt="md">
      Para mais opções, como várias probes, IPv6 ou outros tipos de medição, crie a medição no <Anchor href="https://atlas.ripe.net/measurements/form/" target="_blank" rel="noreferrer">site do RIPE Atlas</Anchor>.
    </Text>
    {!confirming && errorText}
    <Modal opened={confirming} onClose={() => setConfirming(false)} closeOnClickOutside={false} centered title="Criar este ping?">
      <Text size="sm">Da probe <strong>{probeId}</strong> até <strong>{target.trim().toLowerCase()}</strong>, com {packets} pacotes.</Text>
      <Text size="sm" mt="xs">
        Custa cerca de <strong>{pingCost(Number(packets))} créditos</strong>, cobrados nas próximas 4 a 6 horas.{account.credits ? ` Seu saldo: ${count(account.credits.current_balance)}.` : ''}
      </Text>
      <Text size="sm" mt="xs">A medição fica pública no RIPE Atlas: qualquer pessoa pode ver o destino e o resultado.</Text>
      <Text size="sm" mt="xs">Ela leva a etiqueta <code>sondatlas</code>, para você encontrá-la entre as suas medições no RIPE Atlas.</Text>
      {errorText}
      <Group gap="sm" mt="lg" justify="flex-end">
        <Button variant="default" onClick={() => setConfirming(false)}>Cancelar</Button>
        <Button loading={busy} onClick={create}>Criar o ping</Button>
      </Group>
    </Modal>
  </section>
}

export default function Challenges() {
  const [account, setAccount] = useState<Account | null>(null)
  const [error, setError] = useState('')

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
    {error && <SystemError title="Não foi possível consultar a sua conta">{error}</SystemError>}
    {!account && !error && <Loading mt="lg">Consultando a sua conta…</Loading>}
    {account && !account.connected && <Alert variant="light" mt="lg" maw={720} title="Vincule a sua conta do RIPE Atlas">
      Os desafios usam a sua chave para criar medições com os seus créditos.
      <div><Button component="a" href="#/configuracoes" size="sm" mt="sm">Ir para Configurações</Button></div>
    </Alert>}
    {account?.connected && missing.length > 0 && <Alert color="yellow" mt="lg" maw={720} title="Falta uma permissão na chave">
      Para os desafios, a chave precisa de <Missing ids={missing} />. Edite a chave no site do RIPE Atlas e volte aqui.
      <div><Button component="a" href="#/configuracoes" size="sm" mt="sm">Ir para Configurações</Button></div>
    </Alert>}
    {account?.connected && missing.length === 0 && <PingChallenge account={account} />}
  </div>
}
