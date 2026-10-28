import { Badge, Text, Title, VisuallyHidden } from '@mantine/core'
import { useEffect, useState } from 'react'
import Loading from '../../lib/Loading'
import { fetchAccount } from '../atlas-account/account'
import { formatMetric } from '../ping-history/chart'
import { fetchGroupResults, fetchMeasurement, preparing, type GroupRound, type Measurement } from './challenge'
import './group-result.css'

const ms = (value: number) => `${formatMetric(value)} ms`
const countries = new Intl.DisplayNames(['pt-BR'], { type: 'region' })
const place = (round: GroupRound) => round.country ? countries.of(round.country) ?? round.country : 'País não informado'
const isAddress = (target: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(target)
// Each probe answers on its own time, so the results are read again until all arrive or 3 minutes pass.
const every = 5000
const times = 36
// Width of the slowest probe's bar. Every bar starts at zero, so the lengths compare the times.
const longest = 220

export default function GroupResult({ id, measurement }: { id: number, measurement: Measurement }) {
  const [rounds, setRounds] = useState<GroupRound[] | null>(null)
  const [expected, setExpected] = useState(measurement.scheduled)
  const [gaveUp, setGaveUp] = useState(false)
  const [own, setOwn] = useState<number[]>([])

  useEffect(() => {
    const controller = new AbortController()
    fetchAccount(controller.signal).then(account => setOwn((account.probes ?? []).map(probe => probe.id)), () => setOwn([]))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let tries = 0
    let timer: ReturnType<typeof setTimeout>
    // Right after creation RIPE Atlas may not have scheduled the probes yet, so their number is read again with the results.
    const poll = () => Promise.all([fetchGroupResults(id, controller.signal), fetchMeasurement(id, controller.signal).catch(() => null)])
      .then(([found, latest]) => {
        setRounds(found)
        const total = latest && latest !== preparing ? latest.scheduled : 0
        setExpected(total)
        if (total && found.length >= total) return
        if (++tries >= times) setGaveUp(true)
        else timer = setTimeout(poll, every)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        if (++tries >= times) setGaveUp(true)
        else timer = setTimeout(poll, every)
      })
    poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [id])

  if (rounds === null) return <Loading mt="sm">Lendo os resultados…</Loading>
  const arrived = rounds.length
  const complete = expected > 0 && arrived >= expected
  const ranked = [...rounds].sort((a, b) => (a.avg ?? Infinity) - (b.avg ?? Infinity))
  const answered = ranked.filter(round => round.avg !== null)
  const slowest = answered.length ? answered[answered.length - 1].avg! : 0
  const named = !isAddress(measurement.target)
  const addresses = new Set(rounds.map(round => round.address).filter(Boolean))
  const yours = ranked.findIndex(round => own.includes(round.probeId))
  const who = (round: GroupRound) => `A ${round.probeId} (${place(round)})`

  return <>
    {!complete && !gaveUp && <Loading mt="sm">{expected ? `Chegaram ${arrived} de ${expected} resultados.` : `Chegaram ${arrived} resultados.`} Cada probe mede no seu tempo…</Loading>}
    {!complete && gaveUp && <Text size="sm" mt="sm">
      Chegaram {arrived}{expected ? ` de ${expected}` : ''} resultados. Alguma probe pode ter desconectado antes de medir. O resto pode aparecer mais tarde na página da medição no RIPE Atlas.
    </Text>}
    {arrived > 0 && <>
      <table className="group-rank">
        <caption>O mesmo ping até {measurement.target}, do lugar mais rápido ao mais lento.</caption>
        <thead><tr>
          <th scope="col"><span aria-hidden="true">#</span><VisuallyHidden>Posição</VisuallyHidden></th>
          <th scope="col">Onde</th>
          <th scope="col">Tempo médio</th>
        </tr></thead>
        <tbody>
          {ranked.map((round, index) => {
            const mine = own.includes(round.probeId)
            return <tr key={round.probeId} data-yours={mine}>
              <td className="group-rank-position">{round.avg === null ? '–' : `${index + 1}º`}</td>
              <td>
                <div className="group-rank-place">{place(round)}{mine && <Badge size="xs" variant="filled" tt="none" ml={8}>sua</Badge>}</div>
                <div className="group-rank-detail">
                  {round.asn ? `AS${round.asn}, ` : ''}probe {round.probeId}{named && round.address ? <>, recebeu <code>{round.address}</code></> : ''}
                </div>
              </td>
              <td>{round.avg === null
                ? <span className="group-rank-none">sem resposta</span>
                : <div className="group-rank-time">
                  <span className="group-rank-bar" aria-hidden="true" style={{ width: Math.max(2, Math.round(round.avg / slowest * longest)) }} />
                  {ms(round.avg)}
                </div>}
              </td>
            </tr>
          })}
        </tbody>
      </table>
      <Title order={3} size="h5" mt="lg" mb="xs">O que o resultado quer dizer</Title>
      <dl className="lesson-reading">
        {answered.length > 1 && <div>
          <dt>De {ms(answered[0].avg!)} a {ms(slowest)}</dt>
          <dd>
            {who(answered[0])} foi a mais rápida, com {ms(answered[0].avg!)}. {who(answered[answered.length - 1])} foi a mais lenta, com {ms(slowest)}.
            {' '}É o mesmo destino, e o tempo muda com a distância pela rede entre cada probe e o servidor que respondeu.
          </dd>
        </div>}
        {named && addresses.size > 0 && <div>
          <dt>{addresses.size === 1 ? '1 endereço' : `${addresses.size} endereços`}</dt>
          <dd>
            {addresses.size === 1
              ? `Todas as probes receberam o mesmo endereço para ${measurement.target}.`
              : `As probes receberam ${addresses.size} endereços diferentes para ${measurement.target}. Cada uma perguntou o endereço ao DNS da própria rede, e serviços grandes costumam indicar um servidor perto de quem pergunta.`}
          </dd>
        </div>}
        {yours >= 0 && ranked[yours].avg !== null && <div>
          <dt>{yours + 1}º de {answered.length}</dt>
          <dd>A sua probe ficou em {yours + 1}º lugar entre as que responderam. Com outras probes, você mede de lugares onde não está.</dd>
        </div>}
      </dl>
    </>}
  </>
}
